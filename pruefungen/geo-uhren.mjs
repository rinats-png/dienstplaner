/* QS-ZEIT (docs/acc45/QS-ZEITABHAENGIGKEIT.md, Priorität 1): pruefungen/geo.test.js unter den Grenzuhren.

   geo.test.js steht auf einer festen Uhr (CENTRIC_PRUEF_UHR, Vorgabe 2026-11-14 10:00 Berlin). Dieser Lauf übt die
   Datei zusätzlich an den Stellen, an denen sie früher je nach Startzeit scheiterte: 23:59:50 Berlin (22:59:50Z, kurz
   vor Mitternacht; früher 9 von 62 Fällen rot) und 00:30 Berlin (2026-11-14T23:30Z, Berliner Tag ≠ UTC-Tag), jeweils
   mit Prozesszeitzone UTC wie auf dem CI-Läufer. Nacheinander, ein Prozess zur Zeit. Aufruf: npm run pruefung:geo-uhren */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VITEST = path.join(WURZEL, "node_modules", "vitest", "vitest.mjs");
const UHREN = ["2026-11-14T22:59:50.000Z", "2026-11-14T23:30:00.000Z"];

let fehler = 0;
for (const uhr of UHREN) {
  console.log(`geo.test.js unter fester Uhr ${uhr} (TZ=UTC)`);
  const r = spawnSync(process.execPath, [VITEST, "run", "pruefungen/geo.test.js"], { cwd: WURZEL, stdio: "inherit",
    env: { ...process.env, CENTRIC_PRUEF_UHR: uhr, TZ: "UTC" } });
  if (r.status !== 0) { fehler++; console.error(`geo.test.js scheitert unter ${uhr} (Status ${r.status})`); }
}
if (fehler) process.exit(1);
console.log(`geo.test.js unter ${UHREN.length} Grenzuhren grün.`);
