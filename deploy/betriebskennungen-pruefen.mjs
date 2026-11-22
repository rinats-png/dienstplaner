/* K4-Zusatzpunkt Betriebskennungen (Produktionsweg §4 K4, Delta-Review #471 H5). NUR LESEN, KEIN NETZ.
   Prüft auf einer WEGWERFKOPIE einer Ablage, ob jede Betriebskennung (`m.id` in `bestand.mandanten`) eine
   Zeichenkette ist. Hintergrund: der Kandidat weist das Schreiben eines Betriebs ohne Zeichenketten-Kennung mit 422 ab.

     CENTRIC_APP=<Quellbaum, Vorgabe: dieses Repo> node deploy/betriebskennungen-pruefen.mjs <…/scratchpad/daten-mig…>

   Liest die Räume wie deploy/migrationsprobe-lokal.mjs: Store „centric“ der Ablageschicht (server/lib/ablage.mjs),
   Schlüssel `kern:` und Altform `bestand:`, je Raum `bestandLesen` (server/lib/bestand.mjs). Kein Schreibweg wird
   aufgerufen; die Ablageschicht legt beim Lesen weder Ordner an noch räumt sie auf.
   Ausgabe je Raum: Zahl der Betriebe und Verteilung von `typeof m.id`. Exit 0 nur, wenn mindestens ein Raum gelesen
   wurde und alle Kennungen Zeichenketten sind; 1 sonst (auch: Raum unlesbar, keine Betriebsliste, 0 Räume);
   3 bei verletzter Isolation (gleiche Regel wie die Probe: deploy/migrationsprobe-regeln.mjs, kein CENTRIC_BASIS). */
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { isolationGeprueft } from "./migrationsprobe-regeln.mjs";

/** Verteilung als Text, Typen alphabetisch: „number=1, string=2“. */
function verteilung(mandanten) {
  const z = {};
  for (const m of mandanten) { const t = m === null || typeof m !== "object" ? "kein-objekt" : typeof m.id; z[t] = (z[t] || 0) + 1; }
  return Object.keys(z).sort().map((k) => `${k}=${z[k]}`).join(", ");
}

async function pruefen() {
  const DATEN = process.argv[2];
  if (!isolationGeprueft(DATEN)) { console.log("ABBRUCH Isolation"); return 3; }
  const APP = process.env.CENTRIC_APP || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.env.CENTRIC_DATEN = path.resolve(DATEN);   // die Ablageschicht liest die Wurzel aus der Umgebung
  const L = (r) => import(pathToFileURL(path.join(APP, r)).href);
  const { getStore } = await L("server/lib/ablage.mjs"); const { bestandLesen } = await L("server/lib/bestand.mjs");
  const store = getStore({ name: "centric", consistency: "strong" });
  const raeume = (await store.list({ prefix: "kern:" })).blobs.map((b) => b.key.slice(5));
  const alt = (await store.list({ prefix: "bestand:" })).blobs.map((b) => b.key.slice(8));
  let gelesen = 0, fehler = 0;
  for (const raum of [...new Set([...raeume, ...alt])]) {
    let lib;
    try { lib = await bestandLesen(store, raum); } catch (e) {
      fehler++; console.log(`FEHLER ${raum}: nicht lesbar (${String(e && e.message || e).slice(0, 120)})`); continue;
    }
    const mand = lib && lib.bestand && lib.bestand.mandanten;
    if (!Array.isArray(mand)) { fehler++; console.log(`FEHLER ${raum}: keine Betriebsliste`); continue; }
    gelesen++;
    const nichtText = mand.filter((m) => !m || typeof m !== "object" || typeof m.id !== "string").length;
    if (nichtText) fehler++;
    console.log(`${nichtText ? "NO-GO " : "OK    "} ${raum}: ${mand.length} Betrieb(e), typeof id: ${verteilung(mand) || "-"}`);
  }
  const gut = gelesen > 0 && fehler === 0;
  console.log(`\nBETRIEBSKENNUNGEN: ${gelesen} Raum/Räume gelesen, ${gut ? "alle Kennungen Zeichenketten"
    : fehler ? `${fehler} Befund(e) — NO-GO für den Wechsel bis zur Entscheidung` : "nichts belegt"}`);
  return gut ? 0 : 1;
}

process.exit(await pruefen());
