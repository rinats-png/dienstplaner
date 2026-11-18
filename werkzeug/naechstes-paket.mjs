#!/usr/bin/env node
/* ==========================================================================
   NAECHSTES-PAKET — die ersten ausführbaren Pakete aus der SSOT (nur lesend)

     node werkzeug/naechstes-paket.mjs [--json] [--anzahl <n>]

   Auswahl (docs/acc45/work-packages.json, über bereit() aus acc45-backlog.mjs):
   Status READY oder IN_PROGRESS mit offener Restarbeit, alle Abhängigkeiten
   INTEGRATED/VERIFIED/DONE, nicht extern (Betreiberpakete), nicht bedingt.
   BLOCKED-Pakete erscheinen nie. Rang: Priorität P0 vor P3, dann geringerer
   offener Aufwand (Mitte der Spanne), dann Paket-ID.

   Ausgabe: Paket, Priorität, Aufwand, Status, Notiz (kurz) und die
   Konfliktzonen (Hinweis: ein Schreiber zur Zeit, docs/acc45/AGENTS.md).
   Exit 0 mit mindestens einem Paket, Exit 1 ohne ausführbares Paket,
   Exit 2 bei falschem Aufruf. Schreibt nichts, ruft kein Netz auf.
   ========================================================================== */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paketeAus, bereit, restAufwand, notizKurz } from "./acc45-backlog.mjs";

const RANG = { P0: 0, P1: 1, P2: 2, P3: 3 };
const mitte = (s) => (s.min + s.max) / 2;
const spanne = (s) => (s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`);

/** Die ersten n ausführbaren Pakete, nach Priorität, dann offenem Aufwand, dann ID. */
export function naechste(pakete, n = 5) {
  return bereit(pakete)
    .map((p) => ({ p, rest: restAufwand(p) }))
    .sort((a, b) => (RANG[a.p.prio] ?? 9) - (RANG[b.p.prio] ?? 9) || mitte(a.rest) - mitte(b.rest) || a.p.id.localeCompare(b.p.id))
    .slice(0, n)
    .map(({ p, rest }) => ({
      id: p.id, titel: p.titel, prio: p.prio, status: p.status, strang: p.strang,
      aufwandPT: p.aufwandPT, restPT: rest, konfliktzonen: [...p.konfliktzonen], notiz: notizKurz(p),
    }));
}

export function main(argv, say = (s) => console.log(s), pakete = null) {
  const json = argv.includes("--json");
  let n = 5;
  const i = argv.indexOf("--anzahl");
  if (i >= 0) { n = Number(argv[i + 1]); if (!Number.isInteger(n) || n < 1) { say("Aufruf: node werkzeug/naechstes-paket.mjs [--json] [--anzahl <n>]"); return 2; } }
  const unbekannt = argv.filter((a, k) => a.startsWith("--") && !["--json", "--anzahl"].includes(a) && argv[k - 1] !== "--anzahl");
  if (unbekannt.length) { say(`Unbekannte Option: ${unbekannt[0]}`); return 2; }
  const liste = naechste(pakete ?? paketeAus(), n);
  if (json) { say(JSON.stringify(liste, null, 2)); return liste.length ? 0 : 1; }
  if (!liste.length) { say("Kein ausführbares Paket (READY oder IN_PROGRESS mit erfüllten Abhängigkeiten)."); return 1; }
  liste.forEach((x, k) => {
    say(`${k + 1}. ${x.id}  ${x.prio}  ${spanne(x.restPT)} PT offen  ${x.status}  ${x.strang}  ${x.titel}`);
    say(`   Konfliktzonen: ${x.konfliktzonen.join(", ") || "keine"}${x.konfliktzonen.length ? " (ein Schreiber zur Zeit, docs/acc45/AGENTS.md)" : ""}`);
    say(`   Notiz: ${x.notiz}`);
  });
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`FEHLER: ${e.message}`); process.exitCode = 2; }
}
