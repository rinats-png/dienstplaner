/* ==========================================================================
   WP-38 — Toter Code, eine Planrechnung (nur der sicher ungenutzte Teil)

   Geprüft wird mit der Lint-Regel no-unused-vars, die ungenutzte Importe,
   Konstanten und Fangparameter findet — und zwar als echte Prüfung über
   ESLint, nicht über Textsuche. Erfasst sind die Serverdateien, in denen
   der Lint Totes gemeldet hat.

   Eine Planrechnung: server/lib/zeiterfassung.mjs (geplanterDienst) hat keine
   eigene Kopie der Schichtfolge-, Teilzeit- und Beschäftigungsrechnung mehr,
   sondern ruft dienstAm aus fachpruefung.mjs; die Prüfung unten hält das fest.

   Nicht Teil dieses Pakets (siehe docs/acc45/wp38-nachweis.md):
   - `Tagesstart` (src/ansichten/tagesstart.jsx): nicht gerendert, aber von
     zwei Prüfungen benutzt; Entfernen hieße Prüfungen löschen.
   - src/pruefung.jsx (Selbsttest) trägt eigene Kopien der Planrechnung.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";
import { readFileSync } from "node:fs";
import { demobestand } from "../src/lib/fachlogik.js";
import { geplanterDienst, imDienst as imDienstZeit } from "../server/lib/zeiterfassung.mjs";
import { dienstAm, imDienst } from "../server/lib/fachpruefung.mjs";

const DATEIEN = [
  "server/funktionen/daten.mjs",
  "server/funktionen/einrichten.mjs",
  "server/funktionen/starten.mjs",
  "server/lib/zeiterfassung.mjs",
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

describe("WP-38: genau eine Planrechnung für den Server", () => {
  it("zeiterfassung.mjs definiert keine eigene Schichtfolge-, Teilzeit- oder Beschäftigungsrechnung", () => {
    const q = readFileSync(new URL("../server/lib/zeiterfassung.mjs", import.meta.url), "utf8");
    for (const name of ["einheitAm", "einheitDienst", "teilzeitDienst", "zyklusLaenge", "versatzTageVon", "idStreu"]) {
      expect(q).not.toMatch(new RegExp(`(function|const)\s+${name}\b`));
    }
    expect(q).not.toMatch(/functions+imDienst/);
    expect(imDienstZeit).toBe(imDienst);
  });

  it("geplanterDienst liefert dieselbe Antwort wie dienstAm (Demobestand, 400 Tage, Teilzeit, Springer, ohne Eintritt)", () => {
    let mitDienst = 0;
    for (const m of demobestand().mandanten) for (const p of m.personen.slice(0, 6)) {
      const faelle = [p,
        { ...p, teilzeit: { aktiv: true, modus: "quote" }, wochenstunden: 20 },
        { ...p, teilzeit: { aktiv: true, modus: "wochentage", wochentage: [0, 2, 4] } },
        { ...p, springer: true },
        { ...p, eintritt: null }];
      for (const q of faelle) for (let i = 0; i < 400; i++) {
        const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
        const a = geplanterDienst(m, q, d);
        expect(a).toBe(dienstAm(m, q, d));
        if (a) mitDienst++;
      }
    }
    expect(mitDienst).toBeGreaterThan(100);
  }, 120000);

  it("ungültige Eingaben ergeben keinen Dienst", () => {
    const m = demobestand().mandanten[0]; const p = m.personen[0];
    expect(geplanterDienst(null, p, "2026-01-05")).toBeNull();
    expect(geplanterDienst(m, null, "2026-01-05")).toBeNull();
    expect(geplanterDienst(m, p, "05.01.2026")).toBeNull();
  });
});
