/* ==========================================================================
   IMP-11 — Personalimport: Oberfläche, Parser und Doku sagen dasselbe

   Geprüft wird:
     1. Der Dateidialog (`accept`) und die Quelle server/lib/import/formate.mjs sind identisch;
        angeboten wird nur, was der Parser liest (Endungen im Parser, echte Dateien werden gelesen).
     2. Kein Hinweistext der Importansicht verspricht ODS, xlsm oder Schichtzyklen-Import.
     3. Der Parser lehnt ODS und xlsm tatsächlich ab (Grund für 1 und 2).
     4. Kein veralteter Kommentar „nicht in integration/release-v4“ in der Schnittstelle.
     5. IMPORT_VERTRAG.md §9 nennt jeden Statuscode und Fehlerschlüssel des Endpunkts.
   Aufruf: npx vitest run pruefungen/import-abweichungen-imp11.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { IMPORT_ENDUNGEN_ANGEBOT } from "../server/lib/import/formate.mjs";
import { ENDUNGEN, parseKern } from "../server/lib/import/parser-kern.mjs";
import { IMPORT_ACCEPT } from "../src/ansichten/import-datei.jsx";
import { IMPORT_DATEI_AKTIV } from "../src/lib/import-schnittstelle.js";

const lies = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const ansicht = lies("src/ansichten/import-datei.jsx");

describe("IMP-11 Formate", () => {
  it("accept besteht genau aus den angebotenen Endungen", () => {
    expect(IMPORT_ACCEPT.split(",")).toEqual(IMPORT_ENDUNGEN_ANGEBOT.map((e) => "." + e));
    expect(ansicht).toMatch(/accept=\{IMPORT_ACCEPT\}/);
    expect(ansicht).not.toMatch(/accept="/);
  });
  it("jede angebotene Endung kennt der Parser; ods/xlsm/xlsb werden nicht angeboten", () => {
    const parserEndungen = new Set(Object.values(ENDUNGEN).flat());
    for (const e of IMPORT_ENDUNGEN_ANGEBOT) expect(parserEndungen.has(e)).toBe(true);
    for (const e of ["ods", "xlsm", "xlsb", "numbers"]) expect(IMPORT_ENDUNGEN_ANGEBOT).not.toContain(e);
  });
  it("CSV und TSV werden vom Parser tatsächlich gelesen", () => {
    for (const [name, trenner] of [["a.csv", ";"], ["a.tsv", "\t"]]) {
      const r = parseKern({ buffer: Buffer.from(`Nachname${trenner}Vorname\nMeier${trenner}Anna\n`), name });
      expect(r.ok !== false).toBe(true);
    }
  });
  it("der Parser lehnt ODS und xlsm ab", () => {
    const kern = lies("server/lib/import/parser-kern.mjs");
    expect(kern).toMatch(/ODS_NICHT/);
    expect(kern).toMatch(/Dateien mit Makros \(xlsm\) werden nicht gelesen/);
  });
});

describe("IMP-11 Texte", () => {
  it("die Importansicht verspricht kein ODS, xlsm und keinen Schichtzyklen-Import", () => {
    const text = ansicht + lies("src/ansichten/import.jsx");
    expect(text).not.toMatch(/\bODS\b|\.ods\b|xlsm/i);
    expect(text).not.toMatch(/Schichtzyk/i);
  });
  it("die Schnittstelle trägt keinen veralteten Kommentar mehr, der Schalter bleibt aus", () => {
    const s = lies("src/lib/import-schnittstelle.js");
    expect(s).not.toMatch(/NICHT in integration\/release-v4/);
    expect(s).toMatch(/CENTRIC_IMPORT_AKTIV/);
    expect(IMPORT_DATEI_AKTIV).toBe(false);
  });
});

describe("IMP-11 Vertrag §9 (Endpunkt)", () => {
  const doku = lies("docs/acc45/IMPORT-VERTRAG.md");
  const handler = lies("server/funktionen/import.mjs") + lies("server/lib/import/uebernahme.mjs") + lies("server/lib/import/personen.mjs") + lies("server/lib/import/org.mjs");
  const abschnitt = doku.slice(doku.indexOf("### 9a"), doku.indexOf("## 10."));
  it("der Abschnitt 9a existiert und nennt den Schalter", () => {
    expect(abschnitt.length).toBeGreaterThan(200);
    expect(abschnitt).toMatch(/CENTRIC_IMPORT_AKTIV/);
  });
  it("jeder Fehlerschlüssel aus den Handlern steht in 9a", () => {
    const codes = new Set();
    for (const m of handler.matchAll(/(?:fehlerAntwort|nein)\((?:\d{3}, ?)?"?(\d{3})?"?,? ?"([A-Z_]{4,})"/g)) codes.add(m[2]);
    for (const m of handler.matchAll(/code: "([A-Z_]{4,})"/g)) codes.add(m[1]);
    codes.delete("ZIEL_FEHLT");   // interne Ausnahme, nie nach außen
    expect(codes.size).toBeGreaterThan(15);
    for (const c of codes) expect(abschnitt, c).toContain(c);
  });
});
