/* ==========================================================================
   WP-I12c — planKennzahlen ohne Fehlwerte (Szenarienvergleich)

   Befund: planKennzahlen rief verteilung(m, von.slice(0, 7)) mit einem Monat statt mit
   von/bis auf; spanne war undefined, wochenenden NaN. Dieselbe fehlerhafte Kopie stand in
   src/pruefung.jsx (Szenarienvergleich des Selbsttests der Anwendung).

   Geprüft:
   - Eigenschaftstest über zufällige Pläne (fester Startwert, feste Uhr): jede Kennzahl ist
     eine endliche Zahl; spanne = größte minus kleinste Last „weNacht + feier“ je Person der
     Verteilung über genau von..bis (0 ohne Personen); wochenenden = Sa/So mit Dienst,
     unabhängig aus personTag nachgezählt;
   - EINE Berechnung: fachlogik reicht dieselbe Funktion weiter wie der Rechenkern, und
     src/pruefung.jsx hat keine eigene Fassung mehr, sondern importiert sie;
   - der Szenarienvergleich des Selbsttests nennt spanne und wochenenden als endliche Zahlen.
   Rein deterministisch: kein Anbieter, keine Schalter, keine Netzwerkzugriffe.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FEST, zufall } from "./engine-golden.fixture.mjs";
import * as Kern from "../server/lib/engine/kennzahlen.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

vi.setConfig({ testTimeout: 280000 });
const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const STARTWERTE = [20261118, 7, 424242];

let F;            // src/lib/fachlogik.js
let PLAENE = [];  // [name, mandant, [von, bis][]]

/* Wochentag eines ISO-Datums (0 = So … 6 = Sa), unabhängig vom Regelwerk gerechnet. */
const wochentagIso = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const tagePlus = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
  F = await import("../src/lib/fachlogik.js");
  for (const seed of STARTWERTE) {
    const r = zufall(seed);
    vi.spyOn(Math, "random").mockImplementation(r);
    const demo = F.startbestand().mandanten;
    vi.restoreAllMocks();
    /* Zufällige Zeiträume aus einem eigenen Strom (nicht aus Math.random), damit sie reproduzierbar bleiben. */
    const z = zufall(seed ^ 0x5a5a);
    for (const [i, m] of demo.entries()) {
      const raeume = [];
      for (let k = 0; k < 2; k++) {
        const von = tagePlus("2026-10-20", Math.floor(z() * 30));
        raeume.push([von, tagePlus(von, 1 + Math.floor(z() * 20))]);
      }
      PLAENE.push([`s${seed}-demo${i + 1}-${m.branche}`, m, raeume]);
    }
  }
  const leer = baueLeerenBetrieb({ name: "Leerer Testbetrieb", branche: "pflege", email: "x@example.org", land: "HE", raum: "m-leer" }).mandanten[0];
  PLAENE.push(["leer", leer, [["2026-11-01", "2026-11-30"]]]);
}, 240000);
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("planKennzahlen: Eigenschaften über zufällige Pläne (WP-I12c)", () => {
  it("die Stichprobe ist nicht leer und enthält Pläne mit Wochenendarbeit", () => {
    expect(PLAENE.length).toBe(STARTWERTE.length * 3 + 1);
    const mitWe = PLAENE.filter(([, m, r]) => r.some(([von, bis]) => F.planKennzahlen(m, von, bis).wochenenden > 0));
    expect(mitWe.length).toBeGreaterThan(STARTWERTE.length);
  });

  it("jede Kennzahl ist eine endliche Zahl (kein undefined, kein NaN)", () => {
    for (const [name, m, raeume] of PLAENE) for (const [von, bis] of raeume) {
      const k = F.planKennzahlen(m, von, bis);
      for (const feld of ["befunde", "schwer", "unterbesetzt", "ueberbesetzt", "dienste", "stunden", "spanne", "wochenenden"])
        expect(Number.isFinite(k[feld]), `${name} ${von}..${bis}: ${feld}=${k[feld]}`).toBe(true);
      for (const [feld, w] of Object.entries(k))
        expect(typeof w === "number" && Number.isFinite(w), `${name}.${feld}`).toBe(true);
    }
  });

  it("spanne = max − min der Last weNacht + feier je Person über genau von..bis", () => {
    for (const [name, m, raeume] of PLAENE) for (const [von, bis] of raeume) {
      const k = F.planKennzahlen(m, von, bis);
      const last = F.verteilung(m, von, bis).zeilen.map((z) => z.weNacht + z.feier);
      const erwartet = last.length ? Math.max(...last) - Math.min(...last) : 0;
      expect(k.spanne, `${name} ${von}..${bis}`).toBe(erwartet);
      expect(k.spanne).toBeGreaterThanOrEqual(0);
    }
  });

  it("wochenenden = Sa/So mit Dienst, unabhängig aus personTag nachgezählt", () => {
    for (const [name, m, raeume] of PLAENE) for (const [von, bis] of raeume) {
      const personen = F.verteilung(m, von, bis).zeilen.map((z) => z.person);
      let erwartet = 0;
      for (const p of personen) for (let d = von; d <= bis; d = tagePlus(d, 1)) {
        const t = F.personTag(m, p, d);
        if (!t.dienstId || !m.dienstarten.some((x) => x.id === t.dienstId)) continue;
        const w = wochentagIso(d);
        if (w === 0 || w === 6) erwartet++;
      }
      expect(F.planKennzahlen(m, von, bis).wochenenden, `${name} ${von}..${bis}`).toBe(erwartet);
    }
  });

  it("deterministisch: zweimal gerechnet, gleiches Ergebnis", () => {
    const [, m, [[von, bis]]] = PLAENE[0];
    expect(F.planKennzahlen(m, von, bis)).toEqual(F.planKennzahlen(m, von, bis));
  });
});

describe("Eine Berechnung: Rechenkern, fachlogik und Selbsttest der Oberfläche", () => {
  it("fachlogik reicht planKennzahlen und verteilung des Rechenkerns weiter (gleiche Funktion)", () => {
    expect(F.planKennzahlen).toBe(Kern.planKennzahlen);
    expect(F.verteilung).toBe(Kern.verteilung);
  });

  it("Server-Funktion und Oberflächen-Funktion liefern auf jedem Plan dasselbe", async () => {
    const S = await import("../server/lib/engine/kennzahlen.mjs");
    for (const [name, m, raeume] of PLAENE) for (const [von, bis] of raeume)
      expect(F.planKennzahlen(m, von, bis), name).toEqual(S.planKennzahlen(m, von, bis));
  });

  it("der Rechenkern ruft verteilung mit von/bis auf, nicht mit einem Monat", () => {
    const q = lies("server/lib/engine/kennzahlen.mjs");
    expect(q).not.toMatch(/verteilung\(m,\s*von\.slice\(/);
    expect(q).toMatch(/verteilung\(m,\s*von,\s*bis\)/);
    expect(q).not.toMatch(/wochenendNaechte/);
  });

  it("src/pruefung.jsx hat keine eigene planKennzahlen mehr und importiert sie aus fachlogik", () => {
    const q = lies("src/pruefung.jsx");
    expect(q).not.toMatch(/function\s+planKennzahlen\s*\(/);
    expect(q).toMatch(/import\s*\{[^}]*\bplanKennzahlen\b[^}]*\}\s*from\s*"\.\/lib\/fachlogik\.js"/);
    expect(q).not.toMatch(/von\.slice\(0,\s*7\)\)/);
  });

  it("der Szenarienvergleich im Selbsttest prüft spanne und wochenenden als endliche Zahlen", () => {
    const q = lies("src/pruefung.jsx");
    const i = q.indexOf("const pk = planKennzahlen(");
    expect(i).toBeGreaterThan(0);
    const block = q.slice(i, i + 1200);
    expect(block).toMatch(/Number\.isFinite\(pk\.spanne\)/);
    expect(block).toMatch(/Number\.isFinite\(pk\.wochenenden\)/);
  });
});
