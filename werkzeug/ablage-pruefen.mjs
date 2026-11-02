#!/usr/bin/env node
/* ==========================================================================
   ABLAGE-PRÜFEN — unlesbare Dateien eines Bestands finden, zurückholen oder
   beiseitelegen

   Schreibwege und seit WP-45 auch die Anzeige lesen einen Bestand streng
   (server/lib/bestand.mjs): Ist eine einzige Datei unlesbar — der Kern, eine
   Monatsscherbe, ein Standvermerk, der Zeiger oder ein Schreibjournal —,
   antwortet der ganze Raum mit 503. Das ist Absicht: lieber kein Stand als
   ein Stand mit Lücke, der beim nächsten Speichern den fehlenden Monat
   löscht. Aber es braucht einen Rückweg, und der liegt hier.

     node werkzeug/ablage-pruefen.mjs [--daten /data] [raum …]
         Trockenlauf: listet je Raum jede unlesbare Datei. Ändert nichts.

     node werkzeug/ablage-pruefen.mjs [--daten /data] --aus-sicherung <ordner> [raum …]
         Holt jede unlesbare Datei aus einer Sicherung (werkzeug/ablage-
         sicherung.mjs) zurück. Die Sicherung wird vorher vollständig
         geprüft (FERTIG, Manifest, Prüfsummen jeder Datei); stimmt etwas
         nicht, wird nichts angefasst. Die kaputte Datei wird nicht
         gelöscht, sondern beiseitegelegt.

     node werkzeug/ablage-pruefen.mjs [--daten /data] --beiseitelegen [raum …]
         Legt jede unlesbare Datei beiseite als beiseite:<raum>:<zeit>:<schlüssel>
         — die Rohbytes unverändert darin (beiseiteSicher). Verloren geht
         nichts. Danach gilt für eine Scherbe: dieser Monat
         ist leer. Für Vermerke, Zeiger und Journale: Der nächste
         Schreibvorgang gleicht den Stand aus dem Gespeicherten an
         (bestand.mjs, Wiederanlauf). Einen unlesbaren KERN legt das Werkzeug
         nicht beiseite — ohne Kern gäbe es den Raum nicht mehr, und eine
         neue Anlage könnte ihn überschreiben. Dafür: --aus-sicherung.

   Arbeitet nur auf einer ruhenden Ablage: Das Werkzeug belegt
   CENTRIC_DATEN/.prozess wie der Server (server/lib/prozesssperre.mjs) und
   verweigert die Arbeit, solange der Server läuft.

   Die Betriebsanleitung dazu: docs/BETRIEB-SICHERUNG.md, „Unlesbare Datei".

   Rückgabewert: 0 — nichts Unlesbares (mehr); 1 — Unlesbares gefunden und
   (noch) da; 2 — Fehler (Server läuft, Sicherung fehlerhaft, …).
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

function artVon(schluessel) {
  for (const a of ARTEN) {
    if (!schluessel.startsWith(a.praefix)) continue;
    const rest = schluessel.slice(a.praefix.length);
    const raum = a.raumAus(rest);
    const art = a.art === "Standvermerk" && rest.endsWith(":aktuell") ? "Standzeiger" : a.art;
    return { art, raum };
  }
  return null;
}

/**
 * Alle unlesbaren Dateien der Bestände, je Raum.
 * @returns {Promise<Map<string, Array<{schluessel: string, art: string, grund: string}>>>}
 */
export async function befund(store, { raeume = [], journalPruefen }) {
  const aus = new Map();
  const { blobs } = await store.list();
  for (const { key } of blobs) {
    const a = artVon(key);
    if (!a || (raeume.length && !raeume.includes(a.raum))) continue;
    let grund = null;
    if (a.art === "Journal") {
      const p = await journalPruefen(store, a.raum);
      if (p.zustand === "beschaedigt") grund = p.grund;
    } else {
      try { await store.getWithMetadata(key, { type: "json" }); }
      catch (e) { grund = String((e && e.message) || e).slice(0, 200); }
    }
    if (!grund) continue;
    if (!aus.has(a.raum)) aus.set(a.raum, []);
    aus.get(a.raum).push({ schluessel: key, art: a.art, grund });
  }
  return aus;
}

const zeitmarke = () => new Date().toISOString().replace(/[:.]/g, "-");
const beiseiteName = (raum, schluessel, marke) => `beiseite:${raum}:${marke}:${schluessel}`;

/**
 * Eine unlesbare Datei beiseitelegen, ohne ein Byte zu verlieren.
 *
 * Nicht bloß umbenennen: Eine umbenannte kaputte Datei bliebe ein
 * ungültiger Umschlag in der Ablage, und werkzeug/ablage-sicherung.mjs
 * bricht bei jeder solchen Datei ab — nach dem Beiseitelegen liefe keine
 * Sicherung mehr. Stattdessen werden die Rohbytes unverändert (base64, mit
 * SHA-256) in einen gültigen Eintrag beiseite:… gepackt, zurückgelesen und
 * verglichen; erst dann verschwindet die Datei unter ihrem alten Namen.
 * Der beiseite-Eintrag wird gesichert und mit dem Raum gelöscht
 * (raumloeschung.mjs).
 */
export async function beiseiteSicher(store, ordner, dateiname, schluessel, zielSchluessel, grund = "") {
  const roh = await readFile(path.join(ordner, dateiname(schluessel)));
  const huelle = { beiseite: true, original: schluessel, grund: String(grund).slice(0, 300),
    zeit: new Date().toISOString(), bytes: roh.length, sha256: sha256(roh), inhaltBase64: roh.toString("base64") };
  await store.setJSON(zielSchluessel, huelle);
  const zurueck = await store.get(zielSchluessel, { type: "json" });
  if (!zurueck || sha256(Buffer.from(String(zurueck.inhaltBase64), "base64")) !== huelle.sha256)
    throw new Error(`Beiseitelegen von ${schluessel}: Rücklesen stimmt nicht — Original bleibt`);
  await unlink(path.join(ordner, dateiname(schluessel)));
}

/** Atomar schreiben wie die Ablage: Zwischendatei, fsync, umbenennen. */
async function atomarSchreiben(ziel, inhalt) {
  const tmp = `${ziel}.werkzeug.${randomBytes(6).toString("hex")}.tmp`;
  const fh = await open(tmp, "wx", 0o600);
  try { await fh.writeFile(inhalt); await fh.sync(); } finally { await fh.close(); }
  try { await rename(tmp, ziel); } catch (e) { await unlink(tmp).catch(() => {}); throw e; }
}

/**
 * Führt das Werkzeug aus. Gibt den Rückgabewert zurück und schreibt über `say`.
 * @param {string[]} argv
 * @param {(s: string) => void} [say]
 */
export async function main(argv, say = (s) => console.log(s)) {
  const wert = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const daten = wert("--daten");
  const sicherung = wert("--aus-sicherung");
  const beiseite = argv.includes("--beiseitelegen");
  const raeume = argv.filter((a, i) => !a.startsWith("--") && !["--daten", "--aus-sicherung"].includes(argv[i - 1]));
  if (sicherung && beiseite) { say("FEHLER: --aus-sicherung und --beiseitelegen nicht zusammen — erst zurückholen, dann prüfen, dann ggf. beiseitelegen."); return 2; }
  if (daten) process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = process.env.CENTRIC_ABLAGE || "dateien";

  const { getStore, ablageWurzel, dateiname } = await import("../server/lib/ablage.mjs");
  const { journalPruefen } = await import("../server/lib/bestand.mjs");
  const { ablageBelegen } = await import("../server/lib/prozesssperre.mjs");
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

  const sperre = await ablageBelegen(wurzel, { puls: false, wartenMs: 0 });
  if (!sperre.ok) { say(`FEHLER: ${sperre.grund} Erst den Server anhalten (R0).`); return 2; }

  let offen = 0;
  let fehler = 0;
  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    const b = await befund(store, { raeume, journalPruefen });
    if (!b.size) say("Keine unlesbaren Dateien gefunden.");
    const marke = zeitmarke();
    for (const [raum, liste] of b) {
      say(`${raum}: ${liste.length} unlesbare Datei(en)`);
      for (const d of liste) {
        say(`  ${d.art.padEnd(12)} ${d.schluessel} — ${d.grund}`);
        if (sicherung) {
          const eintrag = manifest.dateien.find((x) => x.pfad === `${STORE}/${dateiname(d.schluessel)}`);
          if (!eintrag) { say("    nicht in der Sicherung — bleibt; ggf. --beiseitelegen"); offen += 1; continue; }
          const inhalt = await readFile(path.join(path.resolve(sicherung), "daten", eintrag.pfad));
          if (sha256(inhalt) !== eintrag.sha256) { say("    FEHLER: Prüfsumme der Sicherung weicht beim Lesen ab — nichts verändert"); fehler += 1; continue; }
          await beiseiteSicher(store, ordner, dateiname, d.schluessel, beiseiteName(raum, d.schluessel, marke), d.grund);
          await atomarSchreiben(path.join(ordner, dateiname(d.schluessel)), inhalt);
          const zurueck = await readFile(path.join(ordner, dateiname(d.schluessel)));
          if (sha256(zurueck) !== eintrag.sha256) { say("    FEHLER: zurückgeschriebene Datei stimmt nicht"); fehler += 1; continue; }
          say(`    aus der Sicherung zurückgeholt (Stand ${manifest.erstellt}); die kaputte liegt als ${beiseiteName(raum, d.schluessel, marke)}`);
        } else if (beiseite) {
          if (d.art === "Kern" || d.art === "Altbestand") {
            say("    NICHT beiseitegelegt: Ohne Kern gäbe es den Raum nicht mehr. Bitte --aus-sicherung verwenden.");
            offen += 1; continue;
          }
          await beiseiteSicher(store, ordner, dateiname, d.schluessel, beiseiteName(raum, d.schluessel, marke), d.grund);
          say(`    beiseitegelegt als ${beiseiteName(raum, d.schluessel, marke)}${d.art === "Scherbe" ? " — dieser Monat gilt jetzt als leer" : ""}`);
        } else {
          offen += 1;
        }
      }
    }
    if (!sicherung && !beiseite && offen)
      say("Trockenlauf: nichts verändert. Zurückholen mit --aus-sicherung <ordner>, sonst --beiseitelegen.");
    /* Nach jeder Änderung noch einmal hinsehen: Was jetzt noch unlesbar ist, zählt. */
    if (sicherung || beiseite) {
      const nach = await befund(store, { raeume, journalPruefen });
      offen = [...nach.values()].reduce((n, l) => n + l.length, 0);
      if (offen) say(`Noch unlesbar: ${offen} Datei(en).`);
      else if (b.size) say("Alle betroffenen Räume sind wieder lesbar. Leitung informieren und fachlich prüfen (BETRIEB-SICHERUNG, „Unlesbare Datei“).");
    }
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
