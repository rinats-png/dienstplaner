/* ==========================================================================
   V4 APP-STIL — Oberflächenschicht der Hauptanwendung (Phase 2)

   Sichert:
     - die Schicht enthält keinen Farbwert (nur Tokens über var(--v4-…))
     - jede überschriebene Klasse existiert im tatsächlichen App-Stil
     - jede verwendete Variable ist in den Tokens definiert
     - Fokus, reduzierte Bewegung und reduzierte Transparenz sind geregelt
     - Textpaare auf opaken Flächen erreichen WCAG 2.2 AA (4,5:1)
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { V4_FARBEN, V4_GLAS } from "../src/v4/tokens.js";
import { v4AppStil, V4_APP_KLASSEN } from "../src/v4/app-stil.js";
import { v4Variablen } from "../src/v4/stil.js";

const WURZEL = join(import.meta.dirname, "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8");

const kanal = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const leucht = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => kanal(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a, b) => {
  const [x, y] = [leucht(a), leucht(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const schicht = v4AppStil();
const app = lies("src/App.jsx");

describe("V4 App-Schicht: keine Farbwerte außerhalb der Tokens", () => {
  it("enthält kein Hex, rgb(), rgba(), hsl() oder hsla()", () => {
    expect(schicht).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(schicht).not.toMatch(/\brgba?\(/);
    expect(schicht).not.toMatch(/\bhsla?\(/);
  });

  it("verwendet nur Variablen, die in den Tokens definiert sind", () => {
    const definiert = new Set([...v4Variablen().matchAll(/--(v4-[a-z0-9-]+):/g)].map((m) => m[1]));
    const benutzt = [...schicht.matchAll(/var\(--(v4-[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(benutzt.length).toBeGreaterThan(20);
    const fehlend = [...new Set(benutzt)].filter((v) => !definiert.has(v));
    expect(fehlend).toEqual([]);
  });
});

describe("V4 App-Schicht: Bezug zum tatsächlichen App-Stil", () => {
  it("jede überschriebene Klasse steht im App-Stil (App.jsx)", () => {
    const verwendet = [...new Set([...schicht.matchAll(/html\[data-v4-app\] \.([a-z-]+)/g)].map((m) => m[1]))];
    const fehlend = verwendet.filter((k) => !app.includes(`.${k}`));
    expect(fehlend).toEqual([]);
  });

  it("die Liste V4_APP_KLASSEN deckt alle Überschreibungen ab", () => {
    const verwendet = new Set([...schicht.matchAll(/html\[data-v4-app\] \.([a-z-]+)/g)].map((m) => m[1]));
    for (const k of verwendet) expect(V4_APP_KLASSEN).toContain(k);
  });

  it("App.jsx bindet die Schicht ein und setzt das Attribut data-v4-app", () => {
    expect(app).toMatch(/import \{ v4AppStil \} from "\.\/v4\/app-stil\.js"/);
    expect(app).toMatch(/\$\{v4AppStil\(\)\}/);
    expect(app).toMatch(/setAttribute\("data-v4-app", ""\)/);
  });
});

describe("V4 App-Schicht: Zugänglichkeit", () => {
  it("Tastaturfokus ist als Ring geregelt (nicht nur Farbe)", () => {
    expect(schicht).toMatch(/html\[data-v4-app\] :focus-visible\{[^}]*outline:var\(--v4-fokus-breite\)/);
    expect(schicht).toMatch(/\.inp:focus\{[^}]*outline:var\(--v4-fokus-breite\)/);
  });

  it("reduzierte Bewegung und reduzierte Transparenz sind geregelt", () => {
    expect(schicht).toMatch(/prefers-reduced-motion: reduce/);
    expect(schicht).toMatch(/prefers-reduced-transparency: reduce/);
  });

  it("Touch-Ziele mindestens 44 px bei grobem Zeiger", () => {
    expect(schicht).toMatch(/pointer: coarse[\s\S]*min-height:var\(--v4-ziel\)/);
  });

  for (const thema of ["hell", "dunkel"]) {
    it(`Textpaare auf opaken Flächen ≥ 4,5:1 (${thema})`, () => {
      const f = V4_FARBEN[thema];
      expect(kontrast(f.text, f.flaeche)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(f.text, V4_GLAS[thema].grund)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(f.dim, f.flaeche)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(f.aufAkzent, f.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
