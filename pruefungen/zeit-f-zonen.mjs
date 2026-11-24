/* ZEIT-F, T-SRV-TZ (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.2): die Betriebstag-Prüfungen in ganzen Prozessen unter
   fremder Prozesszeitzone.

   Die CI läuft in UTC; die Dateien unten laufen dort ohnehin. Dieser Lauf startet sie zusätzlich je Zone in einem EIGENEN
   Prozess mit gesetztem TZ — anders als das Umschalten von process.env.TZ in betriebstag.test.js erfasst das auch Werte,
   die beim Laden eines Moduls aus der Prozesszone entstehen. Die Erwartungen in den Dateien sind feste Berliner Tage; ein
   grüner Lauf je Zone heißt: Tage, Abschluss und Gültigkeiten wie mit TZ=Europe/Berlin.

   Zonen: Europe/Berlin (Bezug), Pacific/Kiritimati (UTC+14: Ortstag ab 11:00 Berlin im Winter schon der Folgetag),
   Pacific/Pago_Pago (UTC−11: Ortstag bis 12:00 Berlin im Winter noch der Vortag). UTC läuft im CI-Normallauf;
   America/Los_Angeles (eigene Sommerzeitregel) deckt betriebstag.test.js im Prozess ab und kann hier per Umgebung dazu.
   Nacheinander, ein Prozess zur Zeit. Aufruf: npm run pruefung:zeit-f-zonen
   Andere Zonen: ZEIT_F_ZONEN="America/Los_Angeles,Asia/Tokyo" npm run pruefung:zeit-f-zonen */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VITEST = path.join(WURZEL, "node_modules", "vitest", "vitest.mjs");

export const ZONEN = Object.freeze(["Europe/Berlin", "Pacific/Kiritimati", "Pacific/Pago_Pago"]);

/** Betriebstag (ZEIT-A/C), Kalendertage (P2-12), Z56-Reste, Server-Datum, B8-Zeitbasis. Nicht hier (Laufzeit, je ~30 s):
 *  zeit-tagesformeln.test.js und zeit-schnellweg.test.js — Differenzialtests alt gegen neu mit eigener Zonenmatrix im
 *  Prozess; lokal grün unter TZ=UTC, Europe/Berlin, Pacific/Kiritimati, Pacific/Pago_Pago, America/Los_Angeles (2026-11-24). */
export const DATEIEN = Object.freeze([
  "pruefungen/betriebstag.test.js",
  "pruefungen/zeit-c-e-rest-betriebstag.test.js",
  "pruefungen/p212-kalendertag.test.js",
  "pruefungen/p212-client-kalendertag.test.js",
  "pruefungen/serverdatum.test.js",
  "pruefungen/qs-b8-zeitbasis.test.js",
]);

function zonenAusUmgebung(wert) {
  if (!wert) return ZONEN;
  const z = String(wert).split(",").map((s) => s.trim()).filter(Boolean);
  for (const x of z) new Intl.DateTimeFormat("de-DE", { timeZone: x });   // ungültige Zone: RangeError, Abbruch
  return z;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const zonen = zonenAusUmgebung(process.env.ZEIT_F_ZONEN);
  const fehler = [];
  for (const tz of zonen) {
    const beginn = Date.now();
    console.log(`ZEIT-F: ${DATEIEN.length} Dateien unter TZ=${tz}`);
    const r = spawnSync(process.execPath, [VITEST, "run", ...DATEIEN, "--maxWorkers=1", "--testTimeout=60000"],
      { cwd: WURZEL, stdio: "inherit", env: { ...process.env, TZ: tz } });
    console.log(`ZEIT-F: TZ=${tz} ${r.status === 0 ? "grün" : `ROT (Status ${r.status})`} in ${Math.round((Date.now() - beginn) / 1000)} s`);
    if (r.status !== 0) fehler.push(tz);
  }
  if (fehler.length) { console.error(`ZEIT-F: rot unter ${fehler.join(", ")}`); process.exit(1); }
  console.log(`ZEIT-F: grün unter ${zonen.length} Prozesszonen (${zonen.join(", ")}).`);
}
