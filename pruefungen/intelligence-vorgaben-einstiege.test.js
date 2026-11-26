/* ==========================================================================
   WP-I5, Review #566 (Delta): ein Vorgaben-Budget je äußerem Einstieg auch in belastbarkeit/tagesReserve und in den Render-Schleifen
   (Offene Schichten, Tauschbörse); planeMonat nennt bei erschöpftem Monatsbudget den Grund.

   Aufruf: npx vitest run pruefungen/intelligence-vorgaben-einstiege.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { neuesVorgabenBudget } from "../server/lib/vorgabenwirkung.mjs";
import { FEST, zufall, betriebe } from "./engine-golden.fixture.mjs";

const quelle = (pfad) => readFileSync(pfad, "utf8").replace(/\r\n/g, "\n");
const funktion = (text, kopf) => { const a = text.indexOf(kopf); return text.slice(a, text.indexOf("\n}\n", a)); };
const grosse = (n = 50) => Array.from({ length: n }, (_, i) => ({ id: `g${String(i).padStart(2, "0")}`, name: `Vorgabe g${i}`, regelart: "musterregel",
  parameter: { art: "hoechstensFolge", klassen: ["F"], max: 29, danachFrei: 0 }, geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1,
  grundlage: { art: "hausregel" }, status: "aktiv" }));

describe("belastbarkeit und tagesReserve: EIN Budget je Aufruf", () => {
  let F, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261125));
    F = await import("../src/lib/fachlogik.js");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const betrieb = () => { const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]); m.vorgaben = grosse(); return m; };

  it("mehrere Tage und Dienste teilen das übergebene Budget: die Summe übersteigt es nie, und es wird wirklich verbraucht (kein neues je Tag)", () => {
    const m = betrieb();
    const start = 20000;
    const budget = neuesVorgabenBudget(start);
    F.belastbarkeit(m, 1, { vorgabenBudget: budget });
    expect(budget.rest).toBeGreaterThanOrEqual(0);
    expect(budget.rest).toBeLessThan(start);
    expect(budget.ausgeschoepft, "ein Budget für die ganze Woche, nicht je Tag und Dienst").toBe(true);
  }, 120000);
  it("tagesReserve benutzt ein übergebenes Budget und legt dann kein eigenes an", () => {
    const m = betrieb();
    const da = m.dienstarten.find((x) => x.id === "F");
    const budget = neuesVorgabenBudget(30000);
    const tag = new Date(FEST).toISOString().slice(0, 10);
    F.tagesReserve(m, tag, da.id, { vorgabenBudget: budget });
    expect(budget.rest).toBeLessThan(30000);
  });
  it("Quelle: belastbarkeit legt genau EIN Budget an und reicht es an tagesReserve; tagesReserve reicht es an ersatzVorschlaege", () => {
    const q = quelle("src/lib/fachlogik.js");
    const b = funktion(q, "export function belastbarkeit(");
    expect(b.split("neuesVorgabenBudget()").length - 1).toBe(1);
    expect(b).toContain("tagesReserve(m, d, da.id, { vorgabenBudget })");
    const t = funktion(q, "export function tagesReserve(");
    expect(t).toContain("(opt && opt.vorgabenBudget) || neuesVorgabenBudget()");
    expect(t).toContain("{ vorgabenBudget }");
  });
});

describe("Render-Schleifen: ein Budget je Renderdurchlauf, nicht je Eintrag", () => {
  it("Offene Schichten und Tauschbörse legen EIN Budget je Durchlauf an und reichen es an hindernisse() weiter", () => {
    const os = quelle("src/ansichten/offeneschichten.jsx");
    expect(os.split("neuesVorgabenBudget()").length - 1).toBe(1);
    expect(os).toContain("hindernisse(m, b.person, a.datum, dx, { vorgabenBudget })");
    const tb = quelle("src/ansichten/tauschboerse.jsx");
    expect(tb.split("neuesVorgabenBudget()").length - 1).toBe(1);
    expect(tb).toContain("hindernisse(m, ip, a.von, da, { vorgabenBudget })");
  });
  it("hindernisse() reicht die Optionen an hindernisBefunde (Budget des Aufrufers)", async () => {
    const F = await import("../src/lib/fachlogik.js");
    const m = betriebe(F).find(([n]) => n.startsWith("demo1"))[1];
    const kopie = structuredClone(m);
    kopie.vorgaben = grosse(3);
    const p = kopie.personen.find((x) => x.rolle === "mitarbeiter");
    const da = kopie.dienstarten.find((x) => x.id === "F");
    const budget = neuesVorgabenBudget(100000);
    F.hindernisse(kopie, p, "2026-11-17", da, { vorgabenBudget: budget });
    expect(budget.rest).toBeLessThan(100000);
  }, 120000);
});

describe("planeMonat: erschöpftes Monatsbudget nennt den Grund „vorgabe“ bei den offenen Stellen", () => {
  it("Quelle: die offene Stelle trägt grund: „vorgabe“, wenn das Budget ausgeschöpft ist", () => {
    const q = funktion(quelle("src/lib/fachlogik.js"), "export function planeMonat(");
    expect(q).toContain("ctx.vorgabenBudget.ausgeschoepft ? { grund: \"vorgabe\" } : {}");
  });
  it("Verhalten: mit aufgebrauchtem Monatsbudget bleiben Stellen mit dem Grund offen, ohne vorgaben bleibt der Grund weg", async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261125));
    const F = await import("../src/lib/fachlogik.js");
    const lauf = (vorgaben) => {
      const m = structuredClone(betriebe(F).find(([n]) => n.startsWith("demo1"))[1]);
      m.abwesenheiten = []; m.vorgaben = vorgaben;
      m.dienstarten = m.dienstarten.filter((x) => x.id === "F");
      m.personen = m.personen.filter((x) => x.rolle === "mitarbeiter" && !(x.teilzeit && x.teilzeit.aktiv) && !x.springer).slice(0, 4);
      m.abweichungen = {};
      for (const p of m.personen) for (let i = 1; i <= 30; i++) m.abweichungen[`${p.id}|2026-11-${String(i).padStart(2, "0")}`] = "-";
      return F.planeMonat(m, "2026-11", { maxProPerson: 31 });
    };
    const mit = lauf(grosse());
    expect(mit.offen.length).toBeGreaterThan(0);
    expect(mit.offen.some((o) => o.grund === "vorgabe")).toBe(true);
    expect(lauf([]).offen.every((o) => o.grund === undefined)).toBe(true);
    vi.useRealTimers();
  }, 180000);
});

describe("Rechenaufwand: rollierende Zählregeln mit Fenster 61 Tage bleiben im Budgetziel (Review #566, Delta 2)", () => {
  let F, B;
  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
    vi.spyOn(Math, "random").mockImplementation(zufall(20261125));
    F = await import("../src/lib/fachlogik.js");
    B = betriebe(F);
  }, 120000);
  afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const Z = (i, richtung, ereignis, grenze) => ({ id: `z${String(i).padStart(2, "0")}`, name: `Z${i}`, regelart: "zaehlregel",
    parameter: { ereignis, fenster: { art: "rollierend", laenge: 61, einheit: "tage" }, richtung, grenze }, geltung: { art: "betrieb" }, bezug: "monat",
    staerke: "muss", prioritaet: 1, grundlage: { art: "hausregel" }, status: "aktiv" });
  const satz = (art) => Array.from({ length: 50 }, (_, i) => (art === "hoechstens" ? Z(i, "hoechstens", "F", 40 + i)
    : art === "mindestens" ? Z(i, "mindestens", "frei", 10 + (i % 5)) : (i % 2 ? Z(i, "hoechstens", "N", 30 + i) : Z(i, "mindestens", "frei", 10 + (i % 5)))));
  const zeit = (f) => { const t = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - t) / 1e9; };

  it("belastbarkeit(m, 4) auf demo1 mit 50 Muss-Zählregeln (höchstens, mindestens „frei“, Mischung): höchstens 5 s mehr als ohne Vorgaben (vor der Änderung +10 s bis +33 s)", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m.vorgaben = [];
    F.belastbarkeit(m, 1);   // aufwärmen
    const ohne = zeit(() => F.belastbarkeit(m, 4));
    for (const art of ["hoechstens", "mindestens", "mischung"]) {
      m.vorgaben = satz(art);
      const mit = zeit(() => F.belastbarkeit(m, 4));
      expect(mit - ohne, `${art}: mit ${mit.toFixed(1)} s, ohne ${ohne.toFixed(1)} s`).toBeLessThan(5);
    }
  }, 600000);
  it("belastbarkeit und tagesReserve kennzeichnen ein aufgebrauchtes Vorgaben-Budget (vorgabenUnvollstaendig); ohne Vorgaben nie", () => {
    const m = structuredClone(B.find(([n]) => n.startsWith("demo1"))[1]);
    m.vorgaben = [];
    expect(F.belastbarkeit(m, 1).every((w) => w.vorgabenUnvollstaendig === false && w.zeilen.every((z) => z.vorgabenUnvollstaendig === false))).toBe(true);
    m.vorgaben = satz("mindestens");
    const w = F.belastbarkeit(m, 1, { vorgabenBudget: neuesVorgabenBudget(5000) });
    expect(w[0].vorgabenUnvollstaendig).toBe(true);
    expect(w[0].zeilen.some((z) => z.vorgabenUnvollstaendig)).toBe(true);
    const da = m.dienstarten.find((x) => x.id === "F");
    const tag = new Date(FEST).toISOString().slice(0, 10);
    expect(F.tagesReserve(m, tag, da.id, { vorgabenBudget: neuesVorgabenBudget(100) }).vorgabenUnvollstaendig).toBe(true);
  }, 300000);
  it("Prioritäten zeigt „Reserve evtl. zu hoch“ aus vorgabenUnvollstaendig (Text in den vorhandenen Bausteinen)", () => {
    const q = quelle("src/ansichten/prioritaeten.jsx");
    expect(q).toContain("Reserve evtl. zu hoch");
    expect(q.split("vorgabenUnvollstaendig").length - 1).toBe(2);
  });
});
