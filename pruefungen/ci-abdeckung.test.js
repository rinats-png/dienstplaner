// Prüft werkzeug/ci-abdeckung.mjs mit Fixture-Wurzeln und, dass das Repo selbst besteht:
// Jedes Skript der Sammelprüfung `pruefung` läuft in der CI oder ist begründet ausgenommen.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { aufrufe, luecke, pruefen } from "../werkzeug/ci-abdeckung.mjs";

let w;
function datei(rel, inhalt) {
  mkdirSync(join(w, rel, ".."), { recursive: true });
  writeFileSync(join(w, rel), inhalt);
}
function wurzel({ skripte, workflow = "", ausnahmen }) {
  datei("package.json", JSON.stringify({ scripts: skripte }));
  datei(".github/workflows/pruefung.yml", workflow);
  if (ausnahmen) datei("pruefungen/ci-abdeckung-ausnahmen.json", JSON.stringify(ausnahmen));
}
const GRUND = "Braucht eine feste Staging-Umgebung und läuft deshalb nicht in der CI.";

beforeEach(() => {
  w = mkdtempSync(join(tmpdir(), "ciabd-"));
});
afterEach(() => rmSync(w, { recursive: true, force: true }));

describe("CI-Abdeckung", () => {
  it("liest npm-run-Aufrufe aus Skripten und Workflow", () => {
    expect(aufrufe("npm run a && npm run --silent b:c && node x.mjs && npm run d.e-f")).toEqual(["a", "b:c", "d.e-f"]);
  });

  it("meldet ein Skript der Sammelprüfung, das weder im Workflow noch begründet ausgenommen ist", () => {
    wurzel({
      skripte: { pruefung: "npm run pruefung:a && npm run pruefung:b", "pruefung:a": "x", "pruefung:b": "y" },
      workflow: "      - run: npm run pruefung:a\n",
    });
    const r = pruefen(w);
    expect(r.fehler.join("\n")).toContain("pruefung:b");
    expect(r.fehler.join("\n")).not.toContain("- pruefung:a");
  });

  it("zählt Aufrufe über ein anderes Skript (mittelbar) als abgedeckt", () => {
    wurzel({
      skripte: { pruefung: "npm run pruefung:a && npm run pruefung:b", "pruefung:a": "npm run pruefung:b", "pruefung:b": "y" },
      workflow: "run: npm run pruefung:a\n",
    });
    expect(luecke(w).fehlend).toEqual([]);
    expect(pruefen(w).fehler).toEqual([]);
  });

  it("lässt eine begründete Ausnahme gelten", () => {
    wurzel({
      skripte: { pruefung: "npm run pruefung:b", "pruefung:b": "y" },
      ausnahmen: [{ skript: "pruefung:b", grund: GRUND }],
    });
    expect(pruefen(w).fehler).toEqual([]);
  });

  it("verlangt für jede Ausnahme einen begründeten Grund", () => {
    wurzel({
      skripte: { pruefung: "npm run pruefung:b", "pruefung:b": "y" },
      ausnahmen: [{ skript: "pruefung:b", grund: "zu kurz" }],
    });
    const r = pruefen(w);
    expect(r.fehler.join("\n")).toContain("Pflichtfeld 'grund'");
    expect(r.fehler.join("\n")).toContain("laufen nicht in der CI");
  });

  it("meldet überflüssige Ausnahmen als Fehler, vorläufige nur als Warnung", () => {
    wurzel({
      skripte: { pruefung: "npm run pruefung:a && npm run pruefung:b", "pruefung:a": "x", "pruefung:b": "y" },
      workflow: "run: npm run pruefung:a\nrun: npm run pruefung:b\n",
      ausnahmen: [
        { skript: "pruefung:a", grund: GRUND },
        { skript: "pruefung:b", grund: GRUND, vorlaeufig: true },
        { skript: "pruefung:fehlt", grund: GRUND },
      ],
    });
    const r = pruefen(w);
    expect(r.fehler.join("\n")).toContain("'pruefung:a' ist überflüssig");
    expect(r.fehler.join("\n")).toContain("kein Skript in package.json");
    expect(r.fehler.join("\n")).not.toContain("'pruefung:b'");
    expect(r.warnungen.join("\n")).toContain("'pruefung:b'");
  });

  it("andere Workflows ersetzen das Prüf-Gate nicht", () => {
    wurzel({ skripte: { pruefung: "npm run pruefung:a", "pruefung:a": "x" } });
    datei(".github/workflows/andere.yml", "run: npm run pruefung:a\n");
    expect(luecke(w).fehlend).toEqual(["pruefung:a"]);
  });

  it("das Repo selbst besteht: alles in der CI oder begründet ausgenommen", () => {
    const r = pruefen(resolve(import.meta.dirname, ".."));
    expect(r.fehler).toEqual([]);
  });
});
