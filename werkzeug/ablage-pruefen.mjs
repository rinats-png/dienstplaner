#!/usr/bin/env node
/* ==========================================================================
   ABLAGE-PRÜFEN — unlesbare oder fehlende Dateien eines Bestands finden,
   zurückholen oder beiseitelegen

   Schreibwege und seit WP-45 auch die Anzeige lesen einen Bestand streng
   (server/lib/bestand.mjs): Ist eine einzige Datei unlesbar — der Kern, eine
   Monatsscherbe, ein Standvermerk, der Zeiger oder ein Schreibjournal —,
   antwortet der ganze Raum mit 503. Das ist Absicht: lieber kein Stand als
   ein Stand mit Lücke, der beim nächsten Speichern den fehlenden Monat
   löscht. Aber es braucht einen Rückweg, und der liegt hier.

     node werkzeug/ablage-pruefen.mjs [--daten /data] [raum …]
         Trockenlauf: listet je Raum jede unlesbare Datei, dazu Scherben und
         Kern, die laut Standvermerk da sein müssten, aber fehlen, und jede
         andere Datei der Ablage, an der die nächtliche Sicherung scheitern
         würde. Ändert nichts.

     node werkzeug/ablage-pruefen.mjs [--daten /data] --aus-sicherung <ordner> [--kern-zurueck] [raum …]
         Holt unlesbare oder fehlende Scherben aus einer Sicherung (werkzeug/
         ablage-sicherung.mjs) zurück. Die Sicherung wird vorher vollständig
         geprüft; stimmt etwas nicht, wird nichts angefasst.
         - Schreibjournal, Standvermerke und Standzeiger kommen NIE aus der
           Sicherung: Ein Journal ist der Festschreibepunkt eines
           Schreibvorgangs und würde beim nächsten Zugriff über Kern und
           Scherben gelegt — alte Daten überschrieben neuere, ohne dass es
           jemand merkt. Vermerke und Zeiger sind abgeleitet; ein alter
           Vermerk verfälschte jeden späteren Abgleich. Sie werden
           beiseitegelegt und aus dem Gespeicherten neu berechnet.
         - Einen KERN (oder einen unzerlegten Altbestand) nur mit
           --kern-zurueck: Er trägt alle nicht-monatlichen Daten des Raums
           (Personen, Dienstarten, Einstellungen …), die damit auf den Stand
           der Sicherung zurückfallen.
         Reihenfolge je Datei: Rückholung daneben schreiben (fsync), die
         kaputte als Kopie beiseitelegen, dann umbenennen. Ein Abbruch an
         jeder Stelle lässt die alte Datei liegen; ein zweiter Lauf macht
         weiter.

     node werkzeug/ablage-pruefen.mjs [--daten /data] --beiseitelegen [raum …]
         Legt jede unlesbare Datei beiseite als beiseite:<raum>:<zeit>:<schlüssel>
         — die Rohbytes unverändert darin (beiseiteSicher). Verloren geht
         nichts. Danach gilt für eine Scherbe: dieser Monat ist leer.
         Vermerke, Zeiger und Journale werden neu berechnet. Einen unlesbaren
         KERN legt das Werkzeug nicht beiseite — ohne Kern gäbe es den Raum
         nicht mehr, und eine neue Anlage könnte ihn überschreiben. Mit
         --aus-sicherung zusammen: zurückholen, was in der Sicherung liegt,
         den Rest beiseitelegen.

     node werkzeug/ablage-pruefen.mjs [--daten /data] --fehlende-hinnehmen <raum>:<monat> […]
         Eine FEHLENDE Scherbe (laut Vermerk erwartet, aber nicht da) wird
         nur so als leerer Monat hingenommen — ausdrücklich, je Raum und
         Monat (auch <raum>:<betrieb>:<monat>), nie durch --beiseitelegen
         allein. In der Ablage bleibt eine Spur: beiseite:<raum>:<zeit>:
         <schlüssel> mit { fehlte: true, durch, zeit }. Kombinierbar mit den
         anderen Schaltern.

   Ein Raum wird nur ganz oder gar nicht bearbeitet: Bliebe nach dem Plan
   auch nur eine Datei des Raums offen, wird im Raum nichts angefasst
   (Rückgabe 1). Sonst rechnete der nächste Schreibvorgang den Vermerk ohne
   die offene Scherbe neu, und sie fiele still aus dem Stand.

   Nach jeder Änderung an einem Raum schreibt das Werkzeug dessen Stand
   einmal auf dem gewöhnlichen Weg neu (bestandSchreiben, mit Journal):
   Kern, Vermerk und Zeiger passen dann wieder zu dem, was auf der Platte
   liegt, und der Stand zählt weiter — wer noch einen alten Stand im
   Browser hat, bekommt beim Speichern einen Abgleich statt eines stillen
   Überschreibens.

   Andere Dateien (App-Sicherungen, Konten, Codes, Sitzungen …), an denen
   die nächtliche Sicherung scheitern würde, meldet das Werkzeug nur; es
   fasst sie nicht an. Vorgehen je Art: docs/BETRIEB-SICHERUNG.md, §4a.

   Arbeitet nur auf einer ruhenden Ablage: Das Werkzeug belegt
   CENTRIC_DATEN/.prozess wie der Server (server/lib/prozesssperre.mjs), mit
   Puls, und verweigert die Arbeit, solange ein anderer Prozess sie hält.

   Im Betrieb läuft es im Bild des Dienstes, als uid 1000, ohne Netz — nie
   als root (docs/BETRIEB-SICHERUNG.md, §4a).

   Rückgabewert: 0 — nichts Unlesbares, nichts Fehlendes (mehr); 1 —
   Unlesbares oder Fehlendes gefunden und (noch) da; 2 — Fehler (Ablage
   belegt, Sicherung fehlerhaft, Abbruch …).
   ========================================================================== */

import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const STORE = "centric";

/** Die Schlüsselarten, die zu einem Bestand gehören, und wie sie heißen. */
const ARTEN = [
  { art: "Kern", praefix: "kern:", raumAus: (rest) => rest },
  { art: "Altbestand", praefix: "bestand:", raumAus: (rest) => rest },
  { art: "Scherbe", praefix: "scherbe:", raumAus: (rest) => rest.split(":")[0] },
  { art: "Standvermerk", praefix: "stand:", raumAus: (rest) => rest.split(":")[0] },
  { art: "Journal", praefix: "journal:", raumAus: (rest) => rest },
];

/** Diese Arten kommen nie aus einer Sicherung zurück (siehe Kopf). */
const NIE_ZURUECK = new Set(["Journal", "Standvermerk", "Standzeiger"]);
/** Diese Arten tragen den ganzen Raum außer den Monaten. */
const GANZER_RAUM = new Set(["Kern", "Altbestand"]);

export const KERN_FOLGEN =
  "Ein Kern aus der Sicherung setzt ALLE nicht-monatlichen Daten des Raums auf den Stand der Sicherung zurück: "
  + "Personen, Dienstarten, Einheiten, Einstellungen, Zugänge im Betrieb. Was seitdem angelegt oder geändert wurde, "
  + "fehlt. Neuere Monate können auf Personen oder Dienstarten verweisen, die es dann nicht mehr gibt. "
  + "Die Leitung muss das fachlich prüfen und nachtragen.";

export function artVon(schluessel) {
  for (const a of ARTEN) {
    if (!schluessel.startsWith(a.praefix)) continue;
    const rest = schluessel.slice(a.praefix.length);
    const raum = a.raumAus(rest);
    const art = a.art === "Standvermerk" && rest.endsWith(":aktuell") ? "Standzeiger" : a.art;
    return { art, raum };
  }
  return null;
}

const fehlerText = (e) => String((e && e.message) || e).slice(0, 200);

/** Aus der Kennung „mandantId::monat" eines Vermerks der Ablageschlüssel. */
function scherbeAusKennung(raum, id) {
  const i = id.lastIndexOf("::");
  return i < 0 ? null : `scherbe:${raum}:${id.slice(0, i)}:${id.slice(i + 2)}`;
}

/**
 * Alle unlesbaren und alle fehlenden Dateien der Bestände, je Raum.
 *
 * Fehlend heißt: Der Raum hat Scherben oder Vermerke, aber keinen Kern; oder
 * der Vermerk des aktuellen Stands nennt eine Scherbe, die nicht da ist.
 * Liegt ein GÜLTIGES Journal, wird nicht gegen den Vermerk geprüft — dann
 * gilt das Journal, und der nächste Schreibvorgang führt es zu Ende. Ein
 * beschädigtes Journal wird beiseitegelegt und gilt nie; dann muss der
 * Abgleich laufen, sonst fiele eine fehlende Scherbe beim Angleichen still
 * heraus.
 *
 * @returns {Promise<Map<string, Array<{schluessel: string, art: string, grund: string, fehlt?: boolean}>>>}
 */
export async function befund(store, { raeume = [], journalPruefen }) {
  const aus = new Map();
  const melden = (raum, eintrag) => {
    if (!aus.has(raum)) aus.set(raum, []);
    aus.get(raum).push(eintrag);
  };
  const { blobs } = await store.list();
  const schluessel = new Set(blobs.map((b) => b.key));
  /** @type {Map<string, Set<string>>} */
  const artenJeRaum = new Map();

  for (const key of schluessel) {
    const a = artVon(key);
    if (!a || (raeume.length && !raeume.includes(a.raum))) continue;
    if (!artenJeRaum.has(a.raum)) artenJeRaum.set(a.raum, new Set());
    artenJeRaum.get(a.raum).add(a.art);
    let grund = null;
    if (a.art === "Journal") {
      const p = await journalPruefen(store, a.raum);
      if (p.zustand === "beschaedigt") grund = p.grund;
    } else {
      try { await store.getWithMetadata(key, { type: "json" }); }
      catch (e) { grund = fehlerText(e); }
    }
    if (grund) melden(a.raum, { schluessel: key, art: a.art, grund });
  }

  for (const [raum, arten] of artenJeRaum) {
    const unlesbar = new Set((aus.get(raum) || []).map((d) => d.schluessel));
    if (!arten.has("Kern") && !arten.has("Altbestand")) {
      melden(raum, { schluessel: `kern:${raum}`, art: "Kern", fehlt: true,
        grund: "fehlt — es liegen aber Scherben oder Vermerke des Raums" });
      continue;
    }
    const journalGueltig = arten.has("Journal") && !unlesbar.has(`journal:${raum}`);
    if (!arten.has("Kern") || journalGueltig || unlesbar.has(`kern:${raum}`)) continue;
    /* Gegen den Vermerk des aktuellen Stands: der größere aus Kern und Zeiger,
       wie beim Wiederanlauf (bestand.mjs). Fehlt der Vermerk oder ist er
       unlesbar, gibt es nichts zu vergleichen — er wird neu berechnet. */
    let stand = 0;
    try {
      const m = await store.getMetadata(`kern:${raum}`);
      stand = Math.max(stand, Number(m?.metadata?.stand) || 0);
    } catch { continue; }
    if (!unlesbar.has(`stand:${raum}:aktuell`)) {
      try { stand = Math.max(stand, Number((await store.get(`stand:${raum}:aktuell`, { type: "json" }))?.nr) || 0); }
      catch { /* schon gemeldet */ }
    }
    if (!stand || unlesbar.has(`stand:${raum}:${stand}`)) continue;
    let vermerk = null;
    try { vermerk = await store.get(`stand:${raum}:${stand}`, { type: "json" }); } catch { continue; }
    for (const id of Object.keys(vermerk?.abdruecke || {})) {
      if (id === "kern") continue;
      const s = scherbeAusKennung(raum, id);
      if (s && !schluessel.has(s))
        melden(raum, { schluessel: s, art: "Scherbe", fehlt: true, grund: `fehlt — laut Vermerk ${stand} gehört sie zum Stand` });
    }
  }
  return aus;
}

/**
 * Jede Datei der Ablage, an der werkzeug/ablage-sicherung.mjs abbräche und
 * die nicht zu einem Bestand gehört (die meldet `befund` je Raum): App-
 * Sicherungen, Konten, Codes, Sitzungen, Protokoll … Nur gemeldet, nie
 * angefasst.
 * @returns {Promise<Array<{datei: string, grund: string}>>}
 */
export async function sicherbarkeit(wurzel) {
  const { quelleAnsehen, umschlagPruefen } = await import("./ablage-sicherung.mjs");
  let dateien;
  try { ({ dateien } = await quelleAnsehen(wurzel)); }
  catch (e) { return [{ datei: "(Ablage)", grund: fehlerText(e) }]; }
  const aus = [];
  for (const d of dateien) {
    let schluessel = null;
    try { schluessel = decodeURIComponent(d.name.slice(0, -5)); } catch { /* unten gemeldet */ }
    if (d.store === STORE && schluessel && artVon(schluessel)) continue;
    const anzeige = `${d.store}/${schluessel ?? d.name}`;
    try { umschlagPruefen(anzeige, await readFile(d.pfad)); }
    catch (e) { aus.push({ datei: anzeige, grund: fehlerText(e) }); }
  }
  return aus;
}

const zeitmarke = () => new Date().toISOString().replace(/[:.]/g, "-");
const beiseiteName = (raum, schluessel, marke) => `beiseite:${raum}:${marke}:${schluessel}`;

/**
 * Die Rohbytes einer Datei als gültigen Eintrag `zielSchluessel` ablegen,
 * zurücklesen und vergleichen. Das Original bleibt unberührt.
 *
 * Nicht bloß umbenennen: Eine umbenannte kaputte Datei bliebe ein
 * ungültiger Umschlag in der Ablage, und werkzeug/ablage-sicherung.mjs
 * bricht bei jeder solchen Datei ab. Ist die Datei selbst nicht lesbar
 * (Dateirechte), wird das vermerkt statt der Bytes.
 */
export async function huelleAblegen(store, ordner, dateiname, schluessel, zielSchluessel, grund = "") {
  let roh = null, lesefehler = null;
  try { roh = await readFile(path.join(ordner, dateiname(schluessel))); }
  catch (e) { lesefehler = fehlerText(e); }
  const huelle = { beiseite: true, original: schluessel, grund: String(grund).slice(0, 300),
    zeit: new Date().toISOString(), bytes: roh ? roh.length : null, sha256: roh ? sha256(roh) : null,
    inhaltBase64: roh ? roh.toString("base64") : null, lesefehler };
  await store.setJSON(zielSchluessel, huelle);
  const zurueck = await store.get(zielSchluessel, { type: "json" });
  const passt = roh
    ? zurueck && sha256(Buffer.from(String(zurueck.inhaltBase64), "base64")) === huelle.sha256
    : zurueck && zurueck.lesefehler === lesefehler;
  if (!passt) throw new Error(`Beiseitelegen von ${schluessel}: Rücklesen stimmt nicht — Original bleibt`);
}

/**
 * Eine unlesbare Datei beiseitelegen, ohne ein Byte zu verlieren: erst die
 * Hülle (huelleAblegen), dann verschwindet die Datei unter ihrem alten
 * Namen. Ein Abbruch dazwischen lässt beide liegen — nichts fehlt. Der
 * beiseite-Eintrag wird gesichert und mit dem Raum gelöscht
 * (raumloeschung.mjs).
 */
export async function beiseiteSicher(store, ordner, dateiname, schluessel, zielSchluessel, grund = "") {
  await huelleAblegen(store, ordner, dateiname, schluessel, zielSchluessel, grund);
  await unlink(path.join(ordner, dateiname(schluessel)));
}

/** Daneben schreiben wie die Ablage: Zwischendatei (0600), fsync. Gibt den Pfad zurück. */
async function danebenSchreiben(ziel, inhalt) {
  const tmp = `${ziel}.werkzeug.${randomBytes(6).toString("hex")}.tmp`;
  const fh = await open(tmp, "wx", 0o600);
  try { await fh.writeFile(inhalt); await fh.sync(); } finally { await fh.close(); }
  return tmp;
}

/** Den Ordner auf die Platte zwingen; nicht jedes Dateisystem erlaubt das (Windows). */
async function ordnerFest(ordner) {
  try { const dh = await open(ordner, "r"); try { await dh.sync(); } finally { await dh.close(); } }
  catch { /* dann ohne */ }
}

/**
 * Führt das Werkzeug aus. Gibt den Rückgabewert zurück und schreibt über `say`.
 * @param {string[]} argv
 * @param {(s: string) => void} [say]
 * @param {{ schritt?: (name: string) => Promise<void>, pulsMs?: number }} [opt]
 *   nur für Prüfungen: `schritt` wird an den Stellen gerufen, an denen ein
 *   Abbruch möglich ist; `pulsMs` verkürzt den Puls der Sperre.
 */
export async function main(argv, say = (s) => console.log(s), opt = {}) {
  const schritt = opt.schritt || (async () => {});
  const wert = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const daten = wert("--daten");
  const sicherung = wert("--aus-sicherung");
  const beiseite = argv.includes("--beiseitelegen");
  const kernZurueck = argv.includes("--kern-zurueck");
  /* --fehlende-hinnehmen <raum>:<monat> oder <raum>:<betrieb>:<monat>, beliebig oft. */
  const hinnehmen = argv.filter((a, i) => argv[i - 1] === "--fehlende-hinnehmen");
  const MIT_WERT = ["--daten", "--aus-sicherung", "--fehlende-hinnehmen"];
  const raeume = argv.filter((a, i) => !a.startsWith("--") && !MIT_WERT.includes(argv[i - 1]));
  if (kernZurueck && !sicherung) { say("FEHLER: --kern-zurueck nur zusammen mit --aus-sicherung <ordner>."); return 2; }
  if (argv.includes("--fehlende-hinnehmen")
    && (hinnehmen.length !== argv.filter((a) => a === "--fehlende-hinnehmen").length
      || hinnehmen.some((h) => !/^[^:\s-][^:\s]*(:[^\s]+)?:\d{4}-\d{2}$/.test(h)))) {
    say("FEHLER: --fehlende-hinnehmen braucht <raum>:<monat> (z. B. haus-nord:2025-10) oder <raum>:<betrieb>:<monat> — der Raum ist Pflicht.");
    return 2;
  }
  /** Passt eine Angabe zu --fehlende-hinnehmen auf diesen Scherbenschlüssel? */
  const passt = (h, schluessel) => {
    const teile = h.split(":");
    const raum = teile[0], monat = teile[teile.length - 1], betrieb = teile.slice(1, -1).join(":");
    if (!schluessel.startsWith(`scherbe:${raum}:`) || !schluessel.endsWith(`:${monat}`)) return false;
    return !betrieb || schluessel === `scherbe:${raum}:${betrieb}:${monat}`;
  };
  if (daten) process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = process.env.CENTRIC_ABLAGE || "dateien";

  const { getStore, ablageWurzel, dateiname } = await import("../server/lib/ablage.mjs");
  const { journalPruefen, bestandLesenStreng, bestandSchreiben } = await import("../server/lib/bestand.mjs");
  const { ablageBelegen, VERALTET_MS } = await import("../server/lib/prozesssperre.mjs");
  const wurzel = ablageWurzel();
  const ordner = path.join(wurzel, STORE);

  /* Eine Sicherung zuerst ganz prüfen — vor der Prozesssperre, vor allem
     anderen: Eine fehlerhafte Sicherung soll nie halb benutzt werden. */
  let manifest = null;
  if (sicherung) {
    const { pruefen } = await import("./ablage-sicherung.mjs");
    const p = await pruefen(path.resolve(sicherung));
    if (!p.ok) { say(`FEHLER: Die Sicherung ist nicht in Ordnung — nichts verändert.\n  ${p.fehler.join("\n  ")}`); return 2; }
    manifest = p.manifest;
  }

  /* Mit Puls wie der Server: Ein Server, der während der Arbeit startet
     (anderer Container, anderer Rechnername), sieht die Sperre vorrücken
     und verweigert den Start, statt sie nach 45 Sekunden als veraltet zu
     übernehmen. Ohne Wartezeit: Eine fremde, frische Sperre heißt hier
     „belegt" — fail-closed. */
  let verloren = null;
  const sperre = await ablageBelegen(wurzel, { puls: true, pulsMs: opt.pulsMs, wartenMs: 0,
    verloren: (grund) => { verloren = grund; } });
  if (!sperre.ok) {
    say(`FEHLER: ${sperre.grund} Erst den Server anhalten (R0). Gehört die Sperre einem gerade gestoppten Container, `
      + `${Math.round(VERALTET_MS / 1000)} Sekunden warten und erneut aufrufen.`);
    return 2;
  }
  const halten = () => { if (verloren) throw new Error(`Prozesssperre verloren (${verloren}) — abgebrochen`); };

  let offen = 0;
  let fehler = 0;
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const b = await befund(store, { raeume, journalPruefen });
    const sonst = await sicherbarkeit(wurzel);
    await schritt("nach-befund");
    if (!b.size && !sonst.length) say("Keine unlesbaren oder fehlenden Dateien gefunden.");
    const marke = zeitmarke();

    for (const [raum, liste] of b) {
      say(`${raum}: ${liste.length} unlesbare oder fehlende Datei(en)`);

      /* Erst planen, dann handeln — und zwar nur, wenn für den Raum danach
         nichts offen bleibt. Ein halb bearbeiteter Raum ist gefährlich: Der
         nächste Schreibvorgang (unser Angleichen ebenso wie der Wiederanlauf
         des Servers) rechnet den Vermerk aus dem, was auf der Platte liegt —
         eine noch fehlende Scherbe fiele dabei still heraus, und kein
         späterer Befund fände sie mehr. Deshalb: ganz oder gar nicht. */
      const plan = [];
      for (const d of liste) {
        say(`  ${d.art.padEnd(12)} ${d.schluessel} — ${d.grund}`);
        const eintrag = sicherung
          ? manifest.dateien.find((x) => x.pfad === `${STORE}/${dateiname(d.schluessel)}`) : null;
        let aktion = "offen", hinweis = "";
        if (NIE_ZURUECK.has(d.art)) {
          if (sicherung || beiseite) aktion = "beiseite";
        } else if (GANZER_RAUM.has(d.art)) {
          if (!sicherung && !beiseite && !hinnehmen.length) { /* Trockenlauf */ }
          else if (!sicherung || !kernZurueck)
            hinweis = `NICHT beiseitegelegt und nicht zurückgeholt. ${KERN_FOLGEN} Nur mit --aus-sicherung … --kern-zurueck.`;
          else if (!eintrag) hinweis = "nicht in der Sicherung";
          else aktion = "zurueck";
        } else if (sicherung && eintrag) {
          aktion = "zurueck";
        } else if (d.fehlt) {
          if (hinnehmen.some((h) => passt(h, d.schluessel))) aktion = "hinnehmen";
          else if (sicherung || beiseite || hinnehmen.length)
            hinweis = `fehlt${sicherung ? " und ist nicht in der Sicherung" : ""} — als leeren Monat nur ausdrücklich: `
              + `--fehlende-hinnehmen ${raum}:${d.schluessel.split(":").pop()}`;
        } else if (beiseite) {
          aktion = "beiseite";
        } else if (sicherung) {
          hinweis = "nicht in der Sicherung — ggf. zusätzlich --beiseitelegen (dieser Monat gilt dann als leer)";
        }
        if (hinweis) say(`    ${hinweis}`);
        plan.push({ d, aktion, eintrag });
      }
      const nochOffen = plan.filter((x) => x.aktion === "offen").length;
      if (nochOffen) {
        offen += nochOffen;
        if (plan.some((x) => x.aktion !== "offen"))
          say(`  Raum NICHT angefasst: ${nochOffen} Datei(en) blieben offen. Ein Raum wird nur ganz oder gar nicht `
            + "bearbeitet — sonst fiele eine offene Scherbe beim nächsten Schreiben still aus dem Stand.");
        continue;
      }

      /* Die Sicherung jeder zurückzuholenden Datei vorab lesen und prüfen. */
      let abbruch = false;
      for (const x of plan.filter((y) => y.aktion === "zurueck")) {
        x.inhalt = await readFile(path.join(path.resolve(sicherung), "daten", x.eintrag.pfad));
        if (sha256(x.inhalt) !== x.eintrag.sha256) {
          say(`  FEHLER: Prüfsumme der Sicherung weicht beim Lesen ab (${x.d.schluessel}) — Raum nicht angefasst`);
          fehler += 1; abbruch = true;
        }
      }
      if (abbruch) continue;

      /* Rückholungen zuerst, Beiseitelegen und Hinnehmen danach: Bricht der
         Lauf dazwischen ab, ist der Raum entweder noch gesperrt (unlesbarer
         Zeiger, Journal …) oder vollständig — nie lesbar mit einem Monat,
         der noch zurückgeholt werden sollte. */
      const reihe = (x) => (x.aktion === "zurueck" ? 0 : 1);
      for (const { d, aktion, eintrag, inhalt } of [...plan].sort((a, b) => reihe(a) - reihe(b))) {
        const ziel = path.join(ordner, dateiname(d.schluessel));
        const name = beiseiteName(raum, d.schluessel, marke);
        halten();
        if (aktion === "beiseite") {
          await beiseiteSicher(store, ordner, dateiname, d.schluessel, name, d.grund);
          say(`  ${d.schluessel}: beiseitegelegt als ${name}`
            + (NIE_ZURUECK.has(d.art) ? " — wird neu berechnet" + (sicherung ? " (nie aus der Sicherung: "
              + (d.art === "Journal" ? "Festschreibepunkt, es überschriebe Neueres)" : "abgeleitet)") : "")
              : " — dieser Monat gilt jetzt als leer"));
        } else if (aktion === "hinnehmen") {
          /* Eine Spur in der Ablage: wer, wann, was fehlte. */
          await store.setJSON(name, { beiseite: true, original: d.schluessel, fehlte: true, grund: d.grund,
            durch: "Werkzeug ablage-pruefen --fehlende-hinnehmen", zeit: new Date().toISOString() });
          say(`  ${d.schluessel}: als leerer Monat hingenommen, vermerkt als ${name}`);
        } else if (aktion === "zurueck") {
          /* Erst daneben, dann die kaputte als Kopie beiseite, dann umbenennen:
             Bis zum Umbenennen liegt die alte Datei unverändert da. */
          const tmp = await danebenSchreiben(ziel, inhalt);
          let umbenannt = false;
          try {
            await schritt("rueckholung-geschrieben");
            if (!d.fehlt) await huelleAblegen(store, ordner, dateiname, d.schluessel, name, d.grund);
            await schritt("huelle-abgelegt");
            halten();
            await rename(tmp, ziel);
            umbenannt = true;
            await ordnerFest(ordner);
          } finally {
            if (!umbenannt) await unlink(tmp).catch(() => {});
          }
          const zurueck = await readFile(ziel);
          if (sha256(zurueck) !== eintrag.sha256) throw new Error(`${d.schluessel}: zurückgeschriebene Datei stimmt nicht`);
          say(`  ${d.schluessel}: aus der Sicherung zurückgeholt (Stand ${manifest.erstellt})`
            + (d.fehlt ? "" : `; die kaputte liegt als ${name}`));
          if (GANZER_RAUM.has(d.art)) say(`    ACHTUNG: ${KERN_FOLGEN}`);
        }
      }

      /* Den Stand einmal auf dem gewöhnlichen Weg neu schreiben: Vermerk und
         Zeiger aus dem, was jetzt auf der Platte liegt, und der Stand zählt
         weiter (siehe Kopf). Nur hier, wo für den Raum nichts mehr offen ist.
         Geht es nicht, bleibt es beim Befund unten. */
      halten();
      try {
        const ist = await bestandLesenStreng(store, raum);
        if (ist && !ist.unzerlegt) {
          const r = await bestandSchreiben(store, raum, ist.bestand, { durch: "Werkzeug ablage-pruefen" });
          say(`  Stand angeglichen: ${r.ok ? r.stand : "nicht möglich"}`);
        }
      } catch (e) {
        say(`  Stand nicht angeglichen: ${fehlerText(e)}`);
      }
    }

    if (sonst.length) {
      say(`Ablage: ${sonst.length} weitere Datei(en), an denen die nächtliche Sicherung scheitert`);
      for (const s of sonst) say(`  ${"Sonstige".padEnd(12)} ${s.datei} — ${s.grund}`);
      say("  Diese fasst das Werkzeug nicht an. Vorgehen je Art: docs/BETRIEB-SICHERUNG.md, §4a „Andere Dateien“.");
    }

    const handeln = !!(sicherung || beiseite || hinnehmen.length);
    if (!handeln && (offen || sonst.length))
      say("Trockenlauf: nichts verändert. Zurückholen mit --aus-sicherung <ordner>, sonst --beiseitelegen; "
        + "fehlende Monate nur mit --fehlende-hinnehmen <raum>:<monat>.");
    /* Nach jeder Änderung noch einmal hinsehen: Was jetzt noch unlesbar ist oder fehlt, zählt. */
    if (handeln) {
      const nach = await befund(store, { raeume, journalPruefen });
      offen = [...nach.values()].reduce((n, l) => n + l.length, 0);
      if (offen) say(`Noch unlesbar oder fehlend: ${offen} Datei(en).`);
      else if (b.size) say("Alle betroffenen Räume sind wieder lesbar. Leitung informieren und fachlich prüfen (BETRIEB-SICHERUNG, „Unlesbare Datei“).");
    }
    offen += sonst.length;
  } catch (e) {
    fehler += 1;
    say(`FEHLER: ${String((e && e.message) || e).slice(0, 300)}`);
  } finally {
    await sperre.freigeben();
  }
  return fehler ? 2 : offen ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
