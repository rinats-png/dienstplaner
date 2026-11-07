#!/usr/bin/env node
/* ==========================================================================
   KUNDE-ABLÖSEN (Betreiberentscheidung 2026-11-07) — erst lesen, dann gezielt umstellen

   Standard ist NUR LESEN: Die Auswertung zeigt je Rolle die Zahl der Zugänge,
   den Betreiberzugang (Rolle, Sperre, Ablauf — ohne Codes, ohne Prüfsummen),
   alle aktiven Demozugänge der Rolle „kunde" (würden auf „leitung" umgestellt,
   `demo` bleibt) und alle übrigen „kunde"-/rollenlosen Zugänge (werden NIE
   angefasst, nur gemeldet).

   Aufruf (Server vorher stoppen — die Ablage gehört immer nur einem Prozess):

     CENTRIC_DATEN=/pfad/zu/data node werkzeug/kunde-abloesen.mjs              # nur Bericht
     CENTRIC_DATEN=/pfad/zu/data node werkzeug/kunde-abloesen.mjs --ausfuehren

   Vor --ausfuehren: Sicherung des Datenordners. Es wird nichts gelöscht, kein
   Betreiberzugang verändert (wird nach dem Lauf erneut gelesen und verglichen).
   Ausgang: 0 = ok, 1 = Fehler.
   ========================================================================== */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(WURZEL, p)).href);
const ab = (t) => { throw new Error(t); }; // wirft, damit finally die Sperre freigibt

async function main() {
  const daten = process.env.CENTRIC_DATEN;
  if (!daten) ab("CENTRIC_DATEN fehlt (Pfad des Datenordners).");
  const ausfuehren = process.argv.includes("--ausfuehren");
  const { ablageBelegen } = await imp("server/lib/prozesssperre.mjs");
  const sperre = await ablageBelegen(daten, { puls: false, wartenMs: 0 });
  if (!sperre.ok) ab(`${sperre.grund} Den Server zuerst stoppen.`);
  try {
    const { getStore } = await imp("server/lib/ablage.mjs");
    const { alleKonten, kontoSchreiben } = await imp("server/lib/konten.mjs");
    const { auswerten, umstellen, kollisionen } = await imp("server/lib/kunde-abloesung.mjs");
    const store = getStore({ name: "centric", consistency: "strong" });
    const konten = await alleKonten(store);
    const betreiberRoh = (k) => JSON.stringify(Object.entries(k).filter(([, x]) => x && x.rolle === "betreiber").sort(([x], [y]) => (x < y ? -1 : 1)));
    const betreiberVorher = betreiberRoh(konten);
    const a = auswerten(konten);
    const p = (s) => process.stdout.write(s + "\n");
    p(`Zugänge gesamt: ${a.gesamt}`);
    p(`je Rolle: ${JSON.stringify(a.proRolle)}`);
    p(`Betreiberzugänge (${a.betreiber.length}): ${JSON.stringify(a.betreiber)}`);
    p(`Aktive Demo mit Rolle „kunde“ (${a.kundeDemo.length}, würden auf „leitung“ umgestellt): ${JSON.stringify(a.kundeDemo)}`);
    p(`„kunde“ ohne aktive Demo (${a.kundeSonst.length}, NICHT angefasst): ${JSON.stringify(a.kundeSonst)}`);
    p(`Ohne Rolle (${a.ohneRolle.length}, ohne Zugriff, NICHT angefasst): ${JSON.stringify(a.ohneRolle)}`);
    const kol = kollisionen(konten);
    if (kol.length) p(`Kollision (${kol.length}, werden NICHT umgestellt — im Betrieb gibt es schon einen aktiven leitung-Demozugang): ${JSON.stringify(kol)}`);
    if (!a.betreiber.length) p("HINWEIS: Kein Betreiberzugang in dieser Ablage gefunden.");
    const r = await umstellen(konten, { ausfuehren, schreiben: (h, k) => kontoSchreiben(store, h, k) });
    if (!r.ausgefuehrt) { p(`Trockenlauf: ${r.geplant} würden umgestellt. Mit --ausfuehren anwenden.`); return; }
    if (betreiberRoh(await alleKonten(store)) !== betreiberVorher)
      ab("Betreiberzugang nach dem Lauf verändert — Sicherung zurückspielen!");
    p(`UMGESTELLT: ${r.geplant} (${r.kennungen.join(", ")}). Betreiberzugang unverändert.`);
  } finally { await sperre.freigeben(); }
}
main().catch((e) => { process.stderr.write(`FEHLER: ${String((e && e.message) || e)}\n`); process.exit(1); });
