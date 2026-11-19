// Prueft werkzeug/sammelpruefung.mjs: Kette lesen, Abgleich, Exit-Codes, Bekannte-Fehler-Liste (WP-33).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { kette, bekanntLesen, lauf, bericht, trocken, SELBST } from "../werkzeug/sammelpruefung.mjs";

let w;
function datei(rel, inhalt) { mkdirSync(join(w, rel, ".."), { recursive: true }); writeFileSync(join(w, rel), inhalt); }
function wurzel({ skripte, workflow = "", bekannt }) {
  datei("package.json", JSON.stringify({ scripts: skripte }));
  datei(".github/workflows/pruefung.yml", workflow);
  if (bekannt !== undefined) datei("pruefungen/sammelpruefung-bekannt.json", typeof bekannt === "string" ? bekannt : JSON.stringify(bekannt));
}
const GRUND = "Braucht unter Windows einen Docker-Daemon, den die Maschine nicht hat.";
const grundSkripte = { pruefung: `npm run a && npm run b && npm run ${SELBST}`, a: "x", b: "y", [SELBST]: "z" };

beforeEach(() => { w = mkdtempSync(join(tmpdir(), "sammel-")); });
afterEach(() => rmSync(w, { recursive: true, force: true }));

describe("Kette lesen", () => {
  it("liest die Glieder in Reihenfolge ohne Doppelte", () => {
    wurzel({ skripte: { ...grundSkripte, pruefung: `npm run a && npm run b && npm run a && npm run ${SELBST}` } });
    expect(kette(w)).toEqual({ namen: ["a", "b", SELBST], fehler: [] });
  });
  it("meldet Glieder ohne Skript und eine Kette ohne die Sammelpruefung selbst", () => {
    wurzel({ skripte: { pruefung: "npm run a && npm run fehlt", a: "x" } });
    const { fehler } = kette(w);
    expect(fehler.some((f) => f.includes("'fehlt'"))).toBe(true);
    expect(fehler.some((f) => f.includes(SELBST))).toBe(true);
  });
});

describe("Lauf und Exit-Codes", () => {
  const namen = ["a", "b", "c", SELBST];
  it("alles bestanden: Exit 0, Sammelpruefung ruft sich nicht selbst auf", () => {
    const gerufen = [];
    const r = lauf({ wurzel: w, namen, ausfuehren: (n) => { gerufen.push(n); return { code: 0, ausgabe: "" }; } });
    expect(r.exit).toBe(0);
    expect(gerufen).toEqual(["a", "b", "c"]);
    expect(r.ergebnisse.map((e) => e.status)).toEqual(["bestanden", "bestanden", "bestanden", "uebersprungen"]);
  });
  it("laeuft nach einem Fehler weiter und meldet alle Fehler (Exit 1)", () => {
    const r = lauf({ wurzel: w, namen, ausfuehren: (n) => ({ code: n === "a" || n === "c" ? 3 : 0, ausgabe: "zeile\nende " + n }) });
    expect(r.exit).toBe(1);
    expect(r.ergebnisse.map((e) => e.status)).toEqual(["fehler", "bestanden", "fehler", "uebersprungen"]);
    expect(r.ergebnisse[0].code).toBe(3);
    expect(r.ergebnisse[0].ende).toContain("ende a");
  });
  it("--stopp bricht beim ersten Fehler ab", () => {
    const gerufen = [];
    const r = lauf({ wurzel: w, namen, stopp: true, ausfuehren: (n) => { gerufen.push(n); return { code: n === "a" ? 1 : 0, ausgabe: "" }; } });
    expect(gerufen).toEqual(["a"]);
    expect(r.exit).toBe(1);
  });
  it("misst die Dauer je Glied", () => {
    let t = 0;
    const r = lauf({ wurzel: w, namen: ["a"], jetzt: () => (t += 1500), ausfuehren: () => ({ code: 0, ausgabe: "" }) });
    expect(r.ergebnisse[0].ms).toBe(1500);
  });
  it("ein bekannter Umgebungsfehler wird eingeordnet, bleibt aber rot; andere Plattform: normaler Fehler", () => {
    const bekannt = new Map([["a", { grund: GRUND, plattform: "win32" }]]);
    const aus = () => ({ code: 1, ausgabe: "" });
    const win = lauf({ wurzel: w, namen: ["a"], bekannt, plattform: "win32", ausfuehren: aus });
    expect(win.ergebnisse[0].status).toBe("bekannt");
    expect(win.exit).toBe(1);
    const linux = lauf({ wurzel: w, namen: ["a"], bekannt, plattform: "linux", ausfuehren: aus });
    expect(linux.ergebnisse[0].status).toBe("fehler");
    expect(linux.exit).toBe(1);
  });
  it("Bericht nennt jedes Glied mit Zeit und die Summen", () => {
    const t = bericht([{ name: "a", status: "bestanden", ms: 2000 }, { name: "b", status: "fehler", ms: 500, code: 1 }], 2500);
    expect(t).toContain("a");
    expect(t).toContain("FEHLER");
    expect(t).toContain("1 bestanden, 1 Fehler");
  });
});

describe("Bekannte-Fehler-Liste", () => {
  it("fehlt die Datei, ist die Liste leer", () => {
    wurzel({ skripte: grundSkripte });
    expect(bekanntLesen(w)).toEqual({ map: new Map(), fehler: [] });
  });
  it("verlangt Grund (>= 20 Zeichen) und Plattform, verbietet Doppelte und kaputtes JSON", () => {
    wurzel({ skripte: grundSkripte, bekannt: [{ skript: "a", grund: "kurz", plattform: "win32" }, { skript: "b", grund: GRUND }, { skript: "c", grund: GRUND, plattform: "win32" }, { skript: "c", grund: GRUND, plattform: "win32" }] });
    const r = bekanntLesen(w);
    expect(r.fehler).toHaveLength(3);
    expect(r.map.size).toBe(1);
    wurzel({ skripte: grundSkripte, bekannt: "{kaputt" });
    expect(bekanntLesen(w).fehler[0]).toContain("kein gueltiges JSON");
  });
});

describe("Trockenlauf gegen den Workflow", () => {
  it("ok, wenn jedes Glied im Workflow steht", () => {
    wurzel({ skripte: grundSkripte, workflow: `run: npm run a\nrun: npm run b\nrun: npm run ${SELBST}` });
    expect(trocken(w).fehler).toEqual([]);
  });
  it("meldet ein Glied, das im Workflow fehlt, und einen Bekannte-Fehler-Eintrag ohne Glied", () => {
    wurzel({ skripte: grundSkripte, workflow: `run: npm run a\nrun: npm run ${SELBST}`, bekannt: [{ skript: "zz", grund: GRUND, plattform: "win32" }] });
    const f = trocken(w).fehler.join("\n");
    expect(f).toContain("CI-Abdeckung");
    expect(f).toContain("- b");
    expect(f).toContain("'zz' zeigt auf kein Kettenglied");
  });
});

describe("Das Repo selbst", () => {
  it("Kette, Workflow und Liste sind stimmig", () => {
    const r = trocken(resolve(__dirname, ".."));
    expect(r.fehler).toEqual([]);
    expect(r.namen.at(-1)).toBe(SELBST);
  });
});
