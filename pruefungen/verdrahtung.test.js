// Prüft das Werkzeug werkzeug/verdrahtung-pruefen.mjs mit Fixture-Wurzeln in
// einem Temp-Verzeichnis und, dass das Repo selbst besteht.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pruefen } from "../werkzeug/verdrahtung-pruefen.mjs";

let w;
function datei(rel, inhalt) {
  mkdirSync(join(w, rel, ".."), { recursive: true });
  writeFileSync(join(w, rel), inhalt);
}
function skripte(s) {
  datei("package.json", JSON.stringify({ scripts: s }));
}
beforeEach(() => {
  w = mkdtempSync(join(tmpdir(), "verdr-"));
  mkdirSync(join(w, "pruefungen"));
});
afterEach(() => rmSync(w, { recursive: true, force: true }));

describe("Verdrahtungsprüfung", () => {
  it("meldet eine absichtlich nicht verdrahtete Prüfdatei", () => {
    skripte({ "pruefung:a": "vitest run pruefungen/a.test.js" });
    datei("pruefungen/a.test.js", "");
    datei("pruefungen/waise.test.js", "");
    const r = pruefen(w);
    expect(r.fehler.join("\n")).toContain("pruefungen/waise.test.js");
    expect(r.fehler.join("\n")).not.toContain("a.test.js\n");
  });

  it("erkennt Skript-Verweis, vitest-Präfix, Glob und Workflow als verdrahtet", () => {
    skripte({ x: "vitest run pruefungen/intelligence-", y: "vitest run pruefungen/glob-*.test.js", z: "node pruefungen/rennen.mjs" });
    datei("pruefungen/intelligence-eins.test.js", "");
    datei("pruefungen/glob-zwei.test.js", "");
    datei("pruefungen/rennen.mjs", "");
    datei("pruefungen/imworkflow.test.js", "");
    datei(".github/workflows/pruefung.yml", "run: npx vitest run pruefungen/imworkflow.test.js\n");
    expect(pruefen(w).fehler).toEqual([]);
  });

  it("akzeptiert eine Ausnahme mit Grund", () => {
    skripte({});
    datei("pruefungen/lang.test.js", "");
    datei("pruefungen/verdrahtung-ausnahmen.json", JSON.stringify([{ datei: "lang.test.js", grund: "Browsertest, läuft nicht in CI" }]));
    expect(pruefen(w).fehler).toEqual([]);
  });

  it("lehnt eine Ausnahme ohne Grund ab (und meldet die Datei weiter)", () => {
    skripte({});
    datei("pruefungen/lang.test.js", "");
    datei("pruefungen/verdrahtung-ausnahmen.json", JSON.stringify([{ datei: "lang.test.js" }]));
    const f = pruefen(w).fehler.join("\n");
    expect(f).toContain("Pflichtfeld 'grund'");
    expect(f).toContain("pruefungen/lang.test.js");
  });

  it("lehnt eine Ausnahme mit leerem Grund ab", () => {
    skripte({});
    datei("pruefungen/lang.test.js", "");
    datei("pruefungen/verdrahtung-ausnahmen.json", JSON.stringify([{ datei: "lang.test.js", grund: "  " }]));
    expect(pruefen(w).fehler.join("\n")).toContain("Pflichtfeld 'grund'");
  });

  it("meldet Hilfsdateien nicht: eingebundenes Modul, Unterverzeichnisse, JSON", () => {
    skripte({ s: "vitest run pruefungen/a.test.js" });
    datei("pruefungen/a.test.js", 'import { f } from "./szenario.mjs";\n');
    datei("pruefungen/szenario.mjs", "export const f = 1;\n");
    datei("pruefungen/hilfen/bau.mjs", "");
    datei("pruefungen/fixtures/x.test.js", "");
    datei("pruefungen/rechtsquelle-vorher.json", "{}");
    const r = pruefen(w);
    expect(r.fehler).toEqual([]);
    expect(r.hilfen).toContain("szenario.mjs");
  });

  it("eine nicht eingebundene .mjs-Datei ist ein Einstiegspunkt und wird gemeldet", () => {
    skripte({});
    datei("pruefungen/allein.mjs", "console.log(1);\n");
    expect(pruefen(w).fehler.join("\n")).toContain("pruefungen/allein.mjs");
  });

  it("das Repo selbst besteht (das Werkzeug besteht sich selbst)", () => {
    const r = pruefen(resolve(import.meta.dirname, ".."));
    expect(r.fehler).toEqual([]);
    expect(r.geprueft).toBeGreaterThan(100);
  });
});
