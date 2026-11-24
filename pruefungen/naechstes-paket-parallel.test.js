/* ==========================================================================
   NAECHSTES-PAKET --parallel — konfliktfreie Auswahl, nur Vorschlag

   Feste, synthetische Pakete. Geprüft: gleiche Zone nie zusammen, unbekannte
   Zone nur einzeln (fail-closed), Hartgrenze 3, Rangfolge, Determinismus,
   Ausgabe ohne --parallel unverändert, kein Schreib-/Netzaufruf.
   ========================================================================== */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.setConfig({ testTimeout: 60000 });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let BL, NP;
beforeAll(async () => {
  BL = await import("../werkzeug/acc45-backlog.mjs");
  NP = await import("../werkzeug/naechstes-paket.mjs");
});

const sammeln = () => { const z = []; return { say: (s) => z.push(s), text: () => z.join("\n") }; };
/* Tupel: [id, Name, Prio, PT, Abhängigkeiten, Agent, Status, Akzeptanz, Tests, Dateien] */
const T = (id, prio, dateien, status = "READY", abh = [], zonen = []) =>
  ({ tupel: [id, `Paket ${id}`, prio, 1, abh, "B", status, "A", "T", dateien], zonen });
const bau = (...ts) => {
  const l = BL.paketeAus(ts.map((t) => t.tupel));
  return l.map((p, k) => ({ ...p, konfliktzonen: ts[k].zonen }));
};
const ids = (r) => r.pakete.map((x) => x.id);

describe("naechstes-paket --parallel: Auswahl", () => {
  it("zwei Pakete in derselben Datei oder Zone laufen nie zusammen", () => {
    const l = bau(T("A", "P0", "server/lib/x.mjs"), T("B", "P0", "server/lib/x.mjs"), T("C", "P1", "docs/y.md"));
    const r = NP.parallelWaehlen(l, 3);
    expect(ids(r)).toEqual(["A", "C"]);
    expect(r.ausgeschlossen).toEqual([{ id: "B", grund: "Konflikt mit A in Zone server/lib/x.mjs" }]);
  });

  it("Konfliktzone aus dem SSOT-Feld wirkt und wird beim Namen genannt; Verzeichnis-Präfix überlappt", () => {
    const l = bau(T("A", "P0", "werkzeug/a.mjs", "READY", [], ["App.jsx"]), T("B", "P0", "src/App.jsx"), T("C", "P1", "src/ansichten/x.jsx"), T("D", "P1", "src/"));
    const r = NP.parallelWaehlen(l, 3);
    expect(ids(r)).toEqual(["A", "C"]);
    expect(r.ausgeschlossen).toEqual([
      { id: "B", grund: "Konflikt mit A in Zone App.jsx" },
      { id: "D", grund: "Konflikt mit A in Zone App.jsx" },
    ]);
  });

  it("Zone unbekannt: nur einzeln, weder als erstes noch später zusammen mit anderen", () => {
    const unb = T("U", "P0", "siehe Plan Abschnitt 5");
    const a = T("A", "P1", "docs/a.md"), b = T("B", "P1", "docs2/b.md");
    const erst = NP.parallelWaehlen(bau(unb, a, b), 3);
    expect(ids(erst)).toEqual(["U"]);
    const spaet = NP.parallelWaehlen(bau(a, T("U", "P2", "siehe Plan Abschnitt 5"), b), 3);
    expect(ids(spaet)).toEqual(["A", "B"]);
    expect(spaet.ausgeschlossen).toEqual([{ id: "U", grund: "Zone unbekannt (nur einzeln)" }]);
    expect(ids(NP.parallelWaehlen(bau(T("E", "P0", ""), a), 3))).toEqual(["E"]);
    expect(NP.zonenAnspruch(bau(T("Z", "P0", "docs/a.md", "READY", [], ["erfunden.mjs"]))[0])).toBeNull();
  });

  it("BLOCKED, offene Abhängigkeit, extern und bedingt werden nie gewählt", () => {
    const l = bau(T("A", "P0", "a/a.js"), T("B", "P0", "b/b.js", "BLOCKED"), T("C", "P0", "c/c.js", "READY", ["X"]),
      T("X", "P3", "x/x.js", "IN_PROGRESS", ["Y"]), T("Y", "P3", "y/y.js", "READY", ["X"]), T("D", "P1", "d/d.js"));
    const r = NP.parallelWaehlen(l, 3);
    expect(ids(r).includes("B")).toBe(false);
    expect(ids(r).includes("C")).toBe(false);
    const l2 = l.map((p) => (p.id === "D" ? { ...p, strang: "extern" } : p.id === "A" ? { ...p, bedingt: true } : p));
    expect(ids(NP.parallelWaehlen(l2, 3)).includes("A")).toBe(false);
    expect(ids(NP.parallelWaehlen(l2, 3)).includes("D")).toBe(false);
  });

  it("Reihenfolge nach Priorität, höchstens n, Hartgrenze 3", () => {
    const l = bau(T("D", "P3", "d/d.js"), T("B", "P1", "b/b.js"), T("A", "P0", "a/a.js"), T("C", "P2", "c/c.js"), T("E", "P3", "e/e.js"));
    expect(ids(NP.parallelWaehlen(l, 2))).toEqual(["A", "B"]);
    expect(ids(NP.parallelWaehlen(l, 3))).toEqual(["A", "B", "C"]);
    expect(() => NP.parallelWaehlen(l, 4)).toThrow(/1 bis 3/);
    expect(() => NP.parallelWaehlen(l, 0)).toThrow();
    expect(() => NP.parallelWaehlen(l, 1.5)).toThrow();
    expect(NP.MAX_PARALLEL).toBe(3);
  });

  it("deterministisch: gleiche Eingabe, gleiche Ausgabe, Eingabe unverändert", () => {
    const l = bau(T("B", "P1", "b/b.js"), T("A", "P1", "a/a.js"), T("C", "P1", "a/a.js"));
    const vorher = JSON.stringify(l);
    const a = JSON.stringify(NP.parallelWaehlen(l, 3)), b = JSON.stringify(NP.parallelWaehlen([...l].reverse(), 3));
    expect(a).toBe(b);
    expect(JSON.stringify(l)).toBe(vorher);
  });
});

describe("naechstes-paket --parallel: Pfad-Aliase, nackte Namen, Glob, Freitext", () => {
  /* Paarungen, die NIE zusammen vorgeschlagen werden dürfen: [dateien A, Zonen A, dateien B, Zonen B]. */
  const paare = [
    ["./src/App.jsx", [], "src/App.jsx", []],
    ["src/app.jsx", [], "src/App.jsx", []],
    ["/src/App.jsx", [], "src/App.jsx", []],
    ["src//App.jsx", [], "src/App.jsx", []],
    ["src/./App.jsx", [], "src/App.jsx", []],
    ["src\\App.jsx", [], "src/App.jsx", []],
    ["daten.mjs", [], "x/y.mjs", ["daten.mjs"]],
    ["daten.mjs", [], "server/funktionen/daten.mjs", []],
    ["App.jsx", [], "x/y.mjs", ["App.jsx"]],
    ["pruefung.yml", [], ".github/workflows/pruefung.yml", []],
    ["zeiterfassung.mjs, sicht.mjs", [], "server/lib/sicht.mjs", []],
    ["server/lib/import/schicht*.mjs", [], "server/lib/import/schichtplan.mjs", []],
    ["server/lib/a.mjs, Tests", [], "server/lib/b.mjs, Tests", []],
    ["x/a.js", ["package.json"], "y/b.js, Tests", []],
  ];
  it.each(paare)("nie zusammen: %s %j gegen %s %j", (da, za, db, zb) => {
    const r = NP.parallelWaehlen(bau(T("A", "P0", da, "READY", [], za), T("B", "P0", db, "READY", [], zb)), 3);
    expect(ids(r)).toEqual(["A"]);
    expect(r.ausgeschlossen).toHaveLength(1);
    expect(r.ausgeschlossen[0].grund).toMatch(/^Konflikt mit A in Zone /);
  });

  it("verschiedene Dateien, Verzeichnisse und Globs bleiben frei", () => {
    const l = bau(T("A", "P0", "bar.mjs"), T("B", "P0", "x/baz.mjs"), T("C", "P0", "server/lib/import/schicht*.mjs"), T("D", "P0", "server/lib/import/andere.mjs"));
    expect(ids(NP.parallelWaehlen(l, 3))).toEqual(["A", "B", "C"]);
  });

  it("Pfad mit .. oder gemischtes dateien (Pfad plus Freitext) ist Zone unbekannt und läuft nur einzeln", () => {
    for (const d of ["src/x.jsx, siehe Plan", "../src/x.jsx", "siehe Plan, src/x.jsx"]) {
      expect(NP.zonenAnspruch(bau(T("M", "P0", d))[0])).toBeNull();
      expect(ids(NP.parallelWaehlen(bau(T("M", "P0", d), T("N", "P1", "q/r.js")), 3))).toEqual(["M"]);
      const spaet = NP.parallelWaehlen(bau(T("N", "P0", "q/r.js"), T("M", "P1", d)), 3);
      expect(ids(spaet)).toEqual(["N"]);
      expect(spaet.ausgeschlossen).toEqual([{ id: "M", grund: "Zone unbekannt (nur einzeln)" }]);
    }
  });

  it("Tests zählt als Anspruch auf package.json (scripts)", () => {
    expect(NP.zonenAnspruch(bau(T("A", "P0", "x/a.js, Tests"))[0]).map((c) => c.label)).toEqual(["x/a.js", "package.json (scripts)"]);
    expect(NP.zonenAnspruch(bau(T("A", "P0", "Tests"))[0]).map((c) => c.label)).toEqual(["package.json (scripts)"]);
  });
});

describe("naechstes-paket --parallel: Aufruf und Ausgabe", () => {
  const l = () => bau(T("A", "P0", "a/a.js"), T("B", "P0", "a/a.js"), T("C", "P1", "c/c.js"));

  it("n > 3, n = 0, fehlender Wert, Mischung mit --anzahl: Exit 2", () => {
    for (const a of [["--parallel", "4"], ["--parallel", "0"], ["--parallel"], ["--parallel", "x"], ["--parallel", "2", "--anzahl", "2"], ["--parallel", "2", "--parallel", "9"], ["--parallel", "03"], ["--parallel", "2", "--parallel", "2"]]) {
      const s = sammeln();
      expect(NP.main(a, s.say, l())).toBe(2);
      expect(s.text()).toMatch(/Aufruf/);
    }
  });

  it("Text nennt Vorschlag, Zone, Grund und Ausschluss; --json ist gültig", () => {
    const s = sammeln();
    expect(NP.main(["--parallel", "3"], s.say, l())).toBe(0);
    expect(s.text()).toContain("Vorschlag (keine Zuweisung): 2 von höchstens 3");
    expect(s.text()).toContain("B: Konflikt mit A in Zone a/a.js");
    const j = sammeln();
    expect(NP.main(["--json", "--parallel", "3"], j.say, l())).toBe(0);
    expect(JSON.parse(j.text()).pakete.map((x) => x.id)).toEqual(["A", "C"]);
    expect(NP.main(["--parallel", "2"], () => {}, [])).toBe(1);
  });

  it("--parallel 1 gibt byte-gleich dasselbe aus wie --anzahl 1 (Text und JSON)", () => {
    for (const extra of [[], ["--json"]]) {
      const a = sammeln(), b = sammeln();
      expect(NP.main([...extra, "--parallel", "1"], a.say, l())).toBe(NP.main([...extra, "--anzahl", "1"], b.say, l()));
      expect(a.text()).toBe(b.text());
    }
  });

  it("ohne --parallel unverändert: gleiche Felder wie zuvor, keine Vorschlagszeilen", () => {
    const s = sammeln();
    NP.main(["--json"], s.say, l());
    for (const x of JSON.parse(s.text())) expect(Object.keys(x).sort()).toEqual(["aufwandPT", "id", "konfliktzonen", "notiz", "prio", "restPT", "status", "strang", "titel"]);
    const t = sammeln();
    NP.main([], t.say, l());
    expect(t.text()).not.toMatch(/Vorschlag|Ausgeschlossen/);
  });

  it("lebender Backlog: höchstens 3 Pakete; bei mehreren hat jedes eine bekannte Zone", () => {
    const j = sammeln();
    const exit = NP.main(["--json", "--parallel", "3"], j.say);
    expect([0, 1]).toContain(exit);
    const r = JSON.parse(j.text());
    expect(r.pakete.length).toBeLessThanOrEqual(3);
    const alle = BL.paketeAus();
    if (r.pakete.length > 1) for (const x of r.pakete) expect(NP.zonenAnspruch(alle.find((p) => p.id === x.id))).not.toBeNull();
  });

  it("schreibt nichts: Quelltext ohne Schreib-, Netz-, Git- oder Uhrzeitaufruf", async () => {
    const q = await readFile(path.join(REPO, "werkzeug", "naechstes-paket.mjs"), "utf8");
    expect(q).not.toMatch(/writeFile|appendFile|execFile|spawn|fetch\(|child_process|Math\.random/);
    expect(q).not.toMatch(/Date\.now|new Date/);
  });
});
