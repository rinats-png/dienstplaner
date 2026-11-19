/* ==========================================================================
   GOLDEN-AUFZEICHNUNG — Differenzgarantie A-3 für Bestandsbetriebe (PR #281)

   Spielt den Szenarienkatalog (erstleitung-bestand-szenarien.mjs) gegen eine
   BASIS-Fassung des Servers ab — einen eigenen Arbeitsbaum auf
   integration/release-v4 OHNE #281 — und schreibt die maskierten Ausgaben
   als Golden-Datei. Der Katalog läuft je Schalterwert (ungesetzt und
   verbogen); in der Basis gibt es den Schalter nicht, alle Läufe müssen
   gleich sein — sonst bricht die Aufzeichnung ab (der Katalog wäre nicht
   deterministisch).

   Aufruf (aus diesem Arbeitsbaum; der Basisbaum braucht node_modules):
     git worktree add --detach ../basis origin/integration/release-v4
     node pruefungen/hilfen/erstleitung-bestand-golden.mjs --basis ../basis
   Ergebnis: pruefungen/fixtures/erstleitung-bestand-differenz.golden.json
   (nur synthetische Daten, Zufall/Zeit/Prüfwerte maskiert).
   ========================================================================== */
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { lauf, SCHALTER } from "./erstleitung-bestand-szenarien.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN = path.resolve(HIER, "../fixtures/erstleitung-bestand-differenz.golden.json");

const args = process.argv.slice(2);
const wert = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const basis = wert("--basis");
if (!basis) { console.error("Aufruf: node pruefungen/hilfen/erstleitung-bestand-golden.mjs --basis <Arbeitsbaum der Basis> [--aus <Datei>]"); process.exit(2); }
const wurzel = path.resolve(basis);
const aus = path.resolve(wert("--aus") || GOLDEN);
const commit = execFileSync("git", ["-C", wurzel, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

let erstes = null;
const je = {};
for (const [name, schalter] of SCHALTER) {
  console.log(`Basis ${commit.slice(0, 8)}, Schalter ${name}`);
  const e = await lauf({ wurzel, schalter, meldung: (m) => console.log(m) });
  je[name] = Object.keys(e).length;
  if (!erstes) erstes = e;
  else if (!isDeepStrictEqual(e, erstes)) {
    for (const k of Object.keys(erstes)) if (!isDeepStrictEqual(e[k], erstes[k])) console.error(`nicht deterministisch: ${name} / ${k}`);
    console.error("Abbruch: Die Basis verhält sich je Schalterwert verschieden (oder der Katalog ist nicht deterministisch).");
    process.exit(1);
  }
}
const golden = { zweck: "A-3 Differenzgarantie: beobachtetes Verhalten der Basis (ohne #281) für Bestandsbetriebe",
  basisCommit: commit, schalter: SCHALTER.map(([n, v]) => ({ name: n, wert: v ?? null })), szenarien: erstes };
await writeFile(aus, JSON.stringify(golden, null, 1) + "\n", "utf8");
console.log(`geschrieben: ${aus} (${Object.keys(erstes).length} Szenarien, je Schalter gleich: ${JSON.stringify(je)})`);
