/* ==========================================================================
   WP-38 — Toter Code, eine Planrechnung (nur der sicher ungenutzte Teil)

   Geprüft wird mit der Lint-Regel no-unused-vars, die ungenutzte Importe,
   Konstanten und Fangparameter findet — und zwar als echte Prüfung über
   ESLint, nicht über Textsuche. Erfasst sind die Serverdateien, in denen
   der Lint Totes gemeldet hat.

   Nicht Teil dieses Pakets (siehe docs/acc45/wp-kleinpakete-fragen.md):
   - `Tagesstart` in src/App.jsx: exportiert und von zwei Prüfungen benutzt;
     mehr als 40 Zeilen in der Konfliktzone App.jsx.
   - die zweite Planrechnung (personTag im Client, geplanterDienst im Server):
     keine kleine Änderung.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";

const DATEIEN = [
  "server/funktionen/daten.mjs",
  "server/funktionen/einrichten.mjs",
  "server/funktionen/starten.mjs",
];

describe("WP-38: keine ungenutzten Bezeichner in den betroffenen Serverdateien", () => {
  it("ESLint meldet in diesen Dateien keine no-unused-vars", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const ergebnisse = await eslint.lintFiles(DATEIEN.map((d) => path.resolve(d)));
    const meldungen = ergebnisse.flatMap((r) => r.messages
      .filter((m) => m.ruleId === "no-unused-vars")
      .map((m) => `${path.basename(r.filePath)}:${m.line} ${m.message}`));
    expect(meldungen).toEqual([]);
  }, 120000);
});
