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

     node werkzeug/ablage-pruefen.mjs [--daten /data] --ohne-vermerk <raum> […]
         Ist kein vollständiger Abgleich möglich (kein lesbarer Vermerk oder
         nur ein älterer als der aktuelle Stand; siehe befund), wird der Raum
         nur so angeglichen — ausdrücklich, mit Spur in der Ablage. Ein
         fehlender Monat bliebe dann unerkannt.

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

/** Nummer eines Standvermerks stand:<raum>:<n> — sonst null. */
function vermerkNummer(raum, schluessel) {
  const vorn = `stand:${raum}:`;
  if (!schluessel.startsWith(vorn)) return null;
  const rest = schluessel.slice(vorn.length);
  return /^[0-9]+$/.test(rest) ? Number(rest) : null;
}

/** Aus der Kennung „mandantId::monat" eines Vermerks der Ablageschlüssel. */
function scherbeAusKennung(raum, id) {
  const i = id.lastIndexOf("::");
  return i < 0 ? null : `scherbe:${raum}:${id.slice(0, i)}:${id.slice(i + 2)}`;
}

/**
 * Alle unlesbaren und alle fehlenden Dateien der Bestände, je Raum.
 *
 * Fehlend heißt: Der Raum hat Scherben oder Vermerke, aber keinen Kern; der
 * Vermerk des aktuellen Stands fehlt; oder der Bezugsvermerk nennt eine
 * Scherbe, die nicht da ist.
 *
 * Bezugsvermerk (der Abgleich, der verhindert, dass ein Monat still aus dem
 * Stand fällt):
 * - Liegt ein GÜLTIGES Journal, ist es dessen Vermerk — das Journal gilt und
 *   wird zu Ende geschrieben; was es setzt, zählt als vorhanden.
 * - Sonst der jüngste LESBARE Vermerk bis zum aktuellen Stand (größter aus
 *   Kern, Zeiger und den Vermerknummern) — auf der Platte oder, mit
 *   `referenz`, in der Sicherung. Ein unlesbarer oder fehlender aktueller
 *   Vermerk, ein unlesbarer Kern oder Zeiger verhindern den Abgleich also
 *   nicht. Ist der Bezug älter als der aktuelle Stand, kann eine dort
 *   genannte Scherbe seitdem bewusst entfernt worden sein: Sie wird trotzdem
 *   als fehlend gemeldet (sicher statt still).
 * - Gibt es keinen lesbaren Vermerk, meldet der Befund „kein Abgleich
 *   möglich" (keinAbgleich).
 * Die Scherbenliste der Sicherung selbst ist kein Bezug: Sie enthielte auch
 * Monate, die seit der Sicherung bewusst entfernt wurden.
 *
 * @param {{ raeume?: string[], journalPruefen: Function,
 *   referenz?: { schluessel: Set<string>, lesen: (k: string) => Promise<any> } | null,
 *   ignorieren?: Set<string> }} o
 *   ignorieren: in diesem Lauf ausdrücklich hingenommene Scherben
 * @returns {Promise<Map<string, Array<{schluessel: string, art: string, grund: string, fehlt?: boolean,
 *   neuBerechnen?: boolean, keinAbgleich?: boolean}>>>}
 */
export async function befund(store, { raeume = [], journalPruefen, referenz = null, ignorieren = new Set() }) {
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
    }
    /* Ein unzerlegter Altbestand hat weder Scherben noch Vermerke. */
    if (!arten.has("Kern") && !arten.has("Scherbe") && !arten.has("Standvermerk") && !arten.has("Standzeiger")) continue;

    /* Ein gültiges Journal ist der Bezug. */
    let bezug = null, bezugText = "";
    const vorhanden = new Set(schluessel);
    if (arten.has("Journal") && !unlesbar.has(`journal:${raum}`)) {
      const j = await store.get(`journal:${raum}`, { type: "json" }).catch(() => null);
      for (const s of j?.schritte || []) {
        if (s.art === "setzen" && String(s.schluessel).startsWith(`scherbe:${raum}:`)) vorhanden.add(s.schluessel);
        if (s.art === "loeschen") vorhanden.delete(s.schluessel);
        if (s.art === "setzen" && /^stand:[^:]+:\d+$/.test(String(s.schluessel)) && s.wert?.abdruecke) {
          bezug = s.wert.abdruecke; bezugText = `laut gültigem Journal (Stand ${String(s.schluessel).split(":").pop()})`;
        }
      }
    }

    /* Der aktuelle Stand aus allem, was lesbar ist. */
    const nummern = [...schluessel].map((k) => vermerkNummer(raum, k)).filter((n) => n !== null);
    let stand = Math.max(0, ...nummern);
    if (arten.has("Kern") && !unlesbar.has(`kern:${raum}`)) {
      try { stand = Math.max(stand, Number((await store.getMetadata(`kern:${raum}`))?.metadata?.stand) || 0); } catch { /* gemeldet */ }
    }
    if (schluessel.has(`stand:${raum}:aktuell`) && !unlesbar.has(`stand:${raum}:aktuell`)) {
      try { stand = Math.max(stand, Number((await store.get(`stand:${raum}:aktuell`, { type: "json" }))?.nr) || 0); } catch { /* gemeldet */ }
    }

    if (!bezug) {
      if (stand > 0 && !schluessel.has(`stand:${raum}:${stand}`))
        melden(raum, { schluessel: `stand:${raum}:${stand}`, art: "Standvermerk", fehlt: true, neuBerechnen: true,
          grund: "fehlt — wird beim Angleichen neu berechnet" });
      /* Der jüngste lesbare Vermerk, Platte vor Sicherung. */
      const kandidaten = [];
      for (const n of nummern) if (!unlesbar.has(`stand:${raum}:${n}`)) kandidaten.push({ n, wo: "platte" });
      for (const k of referenz?.schluessel || []) {
        const n = vermerkNummer(raum, k);
        if (n !== null) kandidaten.push({ n, wo: "sicherung" });
      }
      kandidaten.sort((a, b) => b.n - a.n || (a.wo === "platte" ? -1 : 1));
      for (const k of kandidaten) {
        if (stand && k.n > stand) continue;
        const v = k.wo === "platte"
          ? await store.get(`stand:${raum}:${k.n}`, { type: "json" }).catch(() => null)
          : await referenz.lesen(`stand:${raum}:${k.n}`).catch(() => null);
        if (!v || !v.abdruecke) continue;
        bezug = v.abdruecke;
        bezugText = `laut Vermerk ${k.n}${k.wo === "sicherung" ? " aus der Sicherung" : ""}`
          + (k.n < stand ? ` (älter als der aktuelle Stand ${stand} — kann seitdem bewusst entfernt worden sein)` : "");
        /* Ein älterer Vermerk kennt keine Monate, die danach angelegt wurden:
           Der Abgleich ist unvollständig, angeglichen wird nur ausdrücklich. */
        if (k.n < stand)
          melden(raum, { schluessel: `stand:${raum}:${stand}`, art: "Standvermerk", fehlt: true, keinAbgleich: true,
            grund: `nur Vermerk ${k.n} lesbar, aktueller Stand ${stand} — danach angelegte Monate wären nicht erkennbar `
              + "(--aus-sicherung mit dem aktuellen Vermerk oder --ohne-vermerk <raum>)" });
        break;
      }
    }

    if (!bezug) {
      melden(raum, { schluessel: `stand:${raum}:${stand || "?"}`, art: "Standvermerk", fehlt: true, keinAbgleich: true,
        grund: "kein lesbarer Vermerk — ob Monate fehlen, ist nicht erkennbar (--aus-sicherung oder --ohne-vermerk <raum>)" });
      continue;
    }
    for (const id of Object.keys(bezug)) {
      if (id === "kern") continue;
      const s = scherbeAusKennung(raum, id);
      if (s && !vorhanden.has(s) && !ignorieren.has(s))
        melden(raum, { schluessel: s, art: "Scherbe", fehlt: true, grund: `fehlt — ${bezugText} gehört sie zum Stand` });
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
  /* --ohne-vermerk <raum>: Raum angleichen, obwohl kein lesbarer Vermerk einen Abgleich erlaubt. */
  const ohneVermerk = argv.filter((a, i) => argv[i - 1] === "--ohne-vermerk");
  const MIT_WERT = ["--daten", "--aus-sicherung", "--fehlende-hinnehmen", "--ohne-vermerk"];
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
  if (ohneVermerk.length !== argv.filter((a) => a === "--ohne-vermerk").length
    || ohneVermerk.some((r) => !r || r.startsWith("-") || r.includes(":"))) {
    say("FEHLER: --ohne-vermerk braucht einen Raum."); return 2;
  }
  const handeln = !!(sicherung || beiseite || hinnehmen.length || ohneVermerk.length);
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
  /* Die Sicherung als Bezug für den Abgleich: ihre Vermerke (siehe befund). */
  let referenz = null;
  if (manifest) {
    const jeSchluessel = new Map();
    for (const e of manifest.dateien) {
      if (!e.pfad.startsWith(`${STORE}/`)) continue;
      try { jeSchluessel.set(decodeURIComponent(e.pfad.slice(STORE.length + 1, -5)), e); } catch { /* kein Schlüssel */ }
    }
    referenz = {
      schluessel: new Set(jeSchluessel.keys()),
      lesen: async (k) => {
        const e = jeSchluessel.get(k);
        if (!e) return null;
        return JSON.parse((await readFile(path.join(path.resolve(sicherung), "daten", e.pfad))).toString("utf8"))?.daten ?? null;
      },
    };
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
    const b = await befund(store, { raeume, journalPruefen, referenz });
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
        if (d.keinAbgleich) {
          if (ohneVermerk.includes(raum)) aktion = "ohne-abgleich";
          else if (handeln) hinweis = `ohne Abgleich wird der Raum nicht angeglichen — mit einer Sicherung (--aus-sicherung) `
            + `oder ausdrücklich --ohne-vermerk ${raum} (ein fehlender Monat bliebe dann unerkannt)`;
        } else if (d.neuBerechnen) {
          if (handeln) aktion = "neu";
        } else if (NIE_ZURUECK.has(d.art)) {
          if (sicherung || beiseite) aktion = "beiseite";
        } else if (GANZER_RAUM.has(d.art)) {
          if (!handeln) { /* Trockenlauf */ }
          else if (!sicherung || !kernZurueck)
            hinweis = `NICHT beiseitegelegt und nicht zurückgeholt. ${KERN_FOLGEN} Nur mit --aus-sicherung … --kern-zurueck.`;
          else if (!eintrag) hinweis = "nicht in der Sicherung";
          else aktion = "zurueck";
        } else if (sicherung && eintrag) {
          aktion = "zurueck";
        } else if (d.fehlt) {
          if (hinnehmen.some((h) => passt(h, d.schluessel))) aktion = "hinnehmen";
          else if (handeln)
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
        } else if (aktion === "ohne-abgleich") {
          await store.setJSON(beiseiteName(raum, `stand:${raum}:ohne-abgleich`, marke), { beiseite: true, ohneAbgleich: true,
            grund: d.grund, durch: "Werkzeug ablage-pruefen --ohne-vermerk", zeit: new Date().toISOString() });
          say(`  ${raum}: ohne Vermerk-Abgleich angeglichen (ausdrücklich, vermerkt)`);
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
         weiter (siehe Kopf).

         Invariante: nur, wenn ein nach allen Aktionen FRISCH erhobener Befund
         des Raums leer ist und der Abgleich gegen einen lesbaren Vermerk
         stattgefunden hat. Ausgenommen sind nur der fehlende aktuelle
         Vermerk (das Angleichen schreibt ihn) und — mit --ohne-vermerk — der
         fehlende Abgleich. Das Angleichen rechnet den Vermerk aus dem, was
         auf der Platte liegt; was jetzt fehlt, fiele sonst still heraus. */
      /* Ausdrücklich geleert: hingenommene fehlende und beiseitegelegte unlesbare Scherben. */
      const hingenommen = new Set(plan
        .filter((x) => x.aktion === "hinnehmen" || (x.aktion === "beiseite" && x.d.art === "Scherbe"))
        .map((x) => x.d.schluessel));
      const frisch = await befund(store, { raeume: [raum], journalPruefen, referenz, ignorieren: hingenommen });
      const rest = (frisch.get(raum) || [])
        .filter((x) => !x.neuBerechnen && !(x.keinAbgleich && ohneVermerk.includes(raum)));
      if (rest.length) {
        say("  Stand NICHT angeglichen — nach den Änderungen noch offen:");
        for (const x of rest) say(`    ${x.art.padEnd(12)} ${x.schluessel} — ${x.grund}`);
        continue;
      }
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

    if (!handeln && (offen || sonst.length))
      say("Trockenlauf: nichts verändert. Zurückholen mit --aus-sicherung <ordner>, sonst --beiseitelegen; "
        + "fehlende Monate nur mit --fehlende-hinnehmen <raum>:<monat>; ohne lesbaren Vermerk --ohne-vermerk <raum>.");
    /* Nach jeder Änderung noch einmal hinsehen: Was jetzt noch unlesbar ist oder fehlt, zählt. */
    if (handeln) {
      const nach = await befund(store, { raeume, journalPruefen, referenz });
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
