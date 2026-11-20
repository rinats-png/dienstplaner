/* ==========================================================================
   V4-3a — Altstil der Querschnittsklassen auf Tokens (Klassennamen unverändert)

   Akzeptanz (docs/acc45/work-packages.json, V4-3a): feste Radien und Schatten
   der Querschnittsklassen in src/App.jsx und src/gestalt/stil.js kommen aus den
   --v4-Tokens; Klassennamen und E2E-Locators bleiben gleich.

   Geprüft wird der Stil, den die Anwendung tatsächlich rendert (App aus
   src/App.jsx, serverseitig gerendert, wie pruefungen/v4-2b-variablen.test.js):
     - die Radiusstufen --v4-r-* stehen im Grundstil (:root), also auch vor dem
       ersten themaSetzen (ohne data-v4-app) und auf der Fehlerseite;
     - die Altvariablen --r/--r-gross/--r-pille zeigen auf diese Tokens;
     - jede border-radius-Angabe der Querschnittsklassen ist var(--v4-r-…)
       oder eine Altvariable, die auf ein Token zeigt; kein fester Wert;
     - .planzelle trägt die kleine Radiusstufe (Referenz .shift, 8 px);
     - die Klassennamen der E2E-Locators stehen weiter im Stil;
     - die geänderten Regeln führen keinen neuen Übergang ein (V4-2d: keine
       Übergänge, die den Fokus bei reduzierter Bewegung beeinträchtigen).
   Dazu die Messung im Zählwerkzeug (werkzeug/v4-inventar.mjs, festeFormwerte).

   Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V4_RADIEN } from "../src/v4/tokens.js";
import { festeFormwerte, globalerStil, GLOBALE_STILDATEIEN } from "../werkzeug/v4-inventar.mjs";

let appCss = "";

beforeAll(async () => {
  const A = await import("../src/App.jsx");
  const html = renderToStaticMarkup(h(A.default));
  const bloecke = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  appCss = bloecke.join("\n")
    .replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}, 120000);

/** Innerste Regeln { selektor, rumpf } (auch in @media); Kommentare entfernt. */
const regeln = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ selektor: m[1].trim().replace(/\s+/g, " "), rumpf: m[2] }));
const werte = (rumpf, eig) => [...rumpf.matchAll(new RegExp(`(?:^|[;\\s])${eig}:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

/** Querschnittsklassen laut V4-IST-STAND §3.1/§5 Schritt 3 und die Pillen-/Zellformen derselben Stilquellen. */
const QUERSCHNITT = [
  ".pille", ".bpille", ".kachel", ".planzelle", "table.raster", ".schicht", ".leerzelle",
  ".seg button", ".schalter", ".slink .zahl", ".fortschritt", ".bzahl", ".uzahl", ".ikn-zahl", ".namenschip",
  ".wegsymbol", ".sprung",
];
const trifft = (sel, k) => sel.split(",").some((s) => {
  const t = s.trim();
  return t === k || t.startsWith(`${k}{`) || t.startsWith(`${k} `) || t.startsWith(`${k}.`) || t.startsWith(`${k}:`)
    || t.startsWith(`${k}-`) || t.startsWith(`${k}>`) || t.startsWith(`${k}[`);
});
const ALT_AUF_TOKEN = { "--r": "mittel", "--r-gross": "gross", "--r-pille": "pille" };
const tokenRadius = (w) => w === "50%" /* Kreisform, keine Radiusstufe */
  || /^var\(--v4-r-(klein|mittel|gross|pille)\)$/.test(w)
  || Object.keys(ALT_AUF_TOKEN).some((alt) => w === `var(${alt})`);

describe("V4-3a: Radiusstufen im Grundstil", () => {
  it("--v4-r-* stehen im :root des Grundstils mit den Tokenwerten (auch ohne data-v4-app)", () => {
    const wurzel = regeln(appCss).filter((r) => r.selektor === ":root");
    expect(wurzel.length).toBeGreaterThan(0);
    for (const [k, w] of Object.entries(V4_RADIEN)) {
      const gesetzt = wurzel.flatMap((r) => werte(r.rumpf, `--v4-r-${k}`));
      expect(gesetzt, `--v4-r-${k}`).toContain(w);
    }
  });

  it("die Altvariablen --r, --r-gross, --r-pille zeigen auf die Tokens, nicht auf feste Werte", () => {
    const wurzel = regeln(appCss).filter((r) => r.selektor === ":root");
    for (const [alt, stufe] of Object.entries(ALT_AUF_TOKEN)) {
      const gesetzt = wurzel.flatMap((r) => werte(r.rumpf, alt));
      expect(gesetzt.length, alt).toBeGreaterThan(0);
      for (const w of gesetzt) expect(w, alt).toBe(`var(--v4-r-${stufe})`);
    }
  });
});

describe("V4-3a: Querschnittsklassen ohne festen Radius", () => {
  it("jede border-radius-Angabe der Querschnittsklassen kommt aus einem Token", () => {
    const befunde = [];
    for (const r of regeln(appCss)) {
      if (!QUERSCHNITT.some((k) => trifft(r.selektor, k))) continue;
      for (const w of werte(r.rumpf, "border-radius")) if (!tokenRadius(w)) befunde.push(`${r.selektor} → ${w}`);
    }
    expect(befunde).toEqual([]);
  });

  it(".planzelle trägt die kleine Radiusstufe (Referenz .shift: 8 px)", () => {
    const r = regeln(appCss).filter((x) => x.selektor === ".planzelle").flatMap((x) => werte(x.rumpf, "border-radius"));
    expect(r).toContain("var(--v4-r-klein)");
    expect(V4_RADIEN.klein).toBe("8px");
  });

  it("Mobilregeln von .karte und Blatt: Token statt fester Pixel (Schicht überstimmt ohnehin)", () => {
    const befunde = regeln(appCss)
      .filter((r) => r.selektor === ".karte" || r.selektor === ".sheet-back > .blatt")
      .flatMap((r) => werte(r.rumpf, "border-radius").filter((w) => !tokenRadius(w)).map((w) => `${r.selektor} → ${w}`));
    expect(befunde).toEqual([]);
  });

  it("Klassennamen der E2E-Locators bleiben im Stil", () => {
    for (const k of [".pille", ".bpille", ".kachel", ".planzelle", "table.raster", ".karte", ".m-tabs"])
      expect(appCss.includes(k), k).toBe(true);
  });

  it("keine neuen Übergänge in den Querschnittsklassen (nur die bestehenden)", () => {
    const mitUebergang = regeln(appCss)
      .filter((r) => QUERSCHNITT.some((k) => trifft(r.selektor, k)) && /(?:^|[;\s])transition:/.test(r.rumpf))
      .map((r) => r.selektor);
    const liste = [...new Set(mitUebergang)].sort();
    /* Stand vor V4-3a (Basis d5cb1317): .bpille/.seg button (Farben), .schalter (Hintergrund), .schalter i (Lage),
       .sprung (top). V4-3a ändert nur Radien; die Liste bleibt gleich. */
    expect(liste).toEqual([".bpille", ".schalter", ".schalter i", ".seg button", ".sprung"]);
  });
});

describe("V4-3a: Messung im Zählwerkzeug", () => {
  it("festeFormwerte zählt feste Radien und Schatten; var(…), 0, 50 % und none zählen nicht", () => {
    const css = `.a{border-radius:9px; box-shadow:0 0 0 3px \${C.x};} .b{border-radius:var(--v4-r-klein);}
      .c{border-radius:50%; border-radius:0; box-shadow:none; box-shadow:var(--schatten);}
      /* border-radius:4px im Kommentar */ .d{border-radius:26px 26px 0 0; transition:box-shadow .1s;}`;
    const f = festeFormwerte(css);
    expect(f.radien).toBe(2);
    expect(f.schatten).toBe(1);
    expect(f.werte).toEqual(["9px", "26px 26px 0 0", "0 0 0 3px ${C.x}"]);
  });

  it("globaler Stil: App.jsx und gestalt/stil.js; Zählstand nach V4-3a höchstens 7/1 und 7/2", () => {
    expect(GLOBALE_STILDATEIEN).toEqual(["src/App.jsx", "src/gestalt/stil.js"]);
    const g = globalerStil();
    /* Vor V4-3a (Basis d5cb1317): App.jsx 17 Radien / 1 Schatten, gestalt/stil.js 12 / 2.
       Rest nach V4-3a: Fokusring, Bildlaufleisten, Tastenmarken, Akzentkante, Punkte, Telefonschale (m-*), tabbar. */
    expect(g["src/App.jsx"].radien).toBeLessThanOrEqual(7);
    expect(g["src/App.jsx"].schatten).toBeLessThanOrEqual(1);
    expect(g["src/gestalt/stil.js"].radien).toBeLessThanOrEqual(7);
    expect(g["src/gestalt/stil.js"].schatten).toBeLessThanOrEqual(2);
  });
});
