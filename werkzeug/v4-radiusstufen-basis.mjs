#!/usr/bin/env node
/* V4-3b, Review #443 (B1): erzeugt die Basis-Fixture der Radius-Tabellen (pruefungen/fixtures/v4-radiusstufen-basis.json)
   aus den Basis-Commits der Schnitte (SCHNITTE in pruefungen/v4-radiusstufen.mjs). Braucht den vollen Git-Verlauf.

   Je Schnitt: voller Basis-Commit; je Datei der Hauptansicht (heutiger Stand laut werkzeug/v4-inventar.mjs): SHA-256 des
   Basis-Quelltexts (LF), die Radius-Literale mit Kontext und eine Prüfsumme über die Literale.

     node werkzeug/v4-radiusstufen-basis.mjs            schreibt die Fixture
     node werkzeug/v4-radiusstufen-basis.mjs --pruefen  Rückgabe 1, wenn die Fixture nicht dem Erzeugnis entspricht

   Nur Lesen aus Git; kein Netz. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventar, hauptansicht } from "./v4-inventar.mjs";
import { SCHNITTE, BASIS_FIXTURE, basisText, basisEintrag } from "../pruefungen/v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function erzeugeBasisFixture(wurzel = WURZEL) {
  const inv = await inventar();
  const schnitte = {};
  for (const [h, basis] of Object.entries(SCHNITTE)) {
    if (basisText(wurzel, basis, "package.json") === null) throw new Error(`Basis ${basis} nicht im Git-Verlauf (voller Checkout nötig)`);
    const dateien = inv.eintraege.filter((e) => e.gruppe !== "V4" && hauptansicht(e) === h).map((e) => e.datei).sort();
    const eintraege = {};
    for (const d of dateien) eintraege[d] = basisEintrag(basisText(wurzel, basis, d));
    schnitte[h] = { basis, dateien: eintraege };
  }
  return {
    hinweis: "Erzeugt mit node werkzeug/v4-radiusstufen-basis.mjs (Review #443, B1). Nicht von Hand ändern.",
    schnitte,
  };
}

export const alsText = (fx) => `${JSON.stringify(fx, null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ziel = path.join(WURZEL, BASIS_FIXTURE);
  const text = alsText(await erzeugeBasisFixture());
  if (process.argv.includes("--pruefen")) {
    const da = existsSync(ziel) ? readFileSync(ziel, "utf8").replace(/\r\n/g, "\n") : null;
    if (da !== text) { console.error(`${BASIS_FIXTURE} weicht vom Erzeugnis ab`); process.exit(1); }
    console.log(`${BASIS_FIXTURE} aktuell`);
  } else {
    writeFileSync(ziel, text);
    console.log(`${BASIS_FIXTURE} geschrieben`);
  }
}
