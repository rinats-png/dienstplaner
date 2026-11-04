/* ==========================================================================
   V4 GLASS — TOKENS, die eine Quelle (Version 1)

   Alles Gestalterische der V4-Oberfläche steht hier und nur hier: Farben
   (Dunkel und Hell vollständig), Glas, Rahmen, Schatten, Typografie,
   Abstände, Radien, Breakpoints, Fokus. Stil (stil.js), Komponenten
   (komponenten.jsx) und Themenwahl (thema.js) lesen aus dieser Datei und
   erfinden keine Farbe.

   Werte nach design/v4-glass/DESIGNSYSTEM.md (Zeilen --bg … --warn), dort
   nicht genannte Töne abgeleitet und in pruefungen/v4-tokens.test.js auf
   WCAG 2.2 AA nachgerechnet. Änderung eines Wertes: V4_TOKENS_VERSION
   erhöhen, sonst schlägt der Test an.

   Regel: Auf hellem Türkis nie weiße Schrift. Auf dem Akzent steht
   `aufAkzent` — im Dunkeln dunkle Schrift auf Mint, im Hellen helle Schrift
   auf dunklem Petrol.
   ========================================================================== */

export const V4_TOKENS_VERSION = 1;

/* Farbtöne je Erscheinungsbild. Schlüssel = semantischer Name. */
export const V4_FARBEN = {
  hell: {
    bg: "#f0f3ed", flaeche: "#fffefa", flaecheStill: "#e6ebe3",
    text: "#112b30", dim: "#3e585c", aus: "#566e72",
    line: "#c2cec9", lineSoft: "#d3dcd7", lineStark: "#9db0ab",
    steuer: "#6a8083",                       /* Rand von Bedienelementen, >= 3:1 */
    accent: "#0b6058", accentHi: "#0f7a6f", accentDeep: "#084a44",
    accentLight: "#dcede6", aufAkzent: "#fffefa",
    marke: "#0b7c7c",
    ok: "#1b6b3f", warn: "#9c5907", danger: "#a02c2c", info: "#2f6577",
    okLight: "#dcefe3", warnLight: "#fbe8cc", dangerLight: "#f7dedb", infoLight: "#dde9ee",
    focus: "#ac670e",
    sidebar: "#0e3034", sidebarTief: "#071e22",
  },
  dunkel: {
    bg: "#071e22", flaeche: "#0e3034", flaecheStill: "#123b40",
    text: "#eef8f3", dim: "#bad0cc", aus: "#93aeaa",
    line: "#27494d", lineSoft: "#1c3d41", lineStark: "#3a6166",
    steuer: "#6f979b",
    accent: "#b9efdc", accentHi: "#d2f6e9", accentDeep: "#8fe0c6",
    accentLight: "#134042", aufAkzent: "#071e22",
    marke: "#0b7c7c",
    ok: "#6fe0a8", warn: "#ffc979", danger: "#ff9d94", info: "#8fcfe6",
    okLight: "#10342a", warnLight: "#3a2c14", dangerLight: "#3d1f1d", infoLight: "#12394a",
    focus: "#ffd77b",
    sidebar: "#071e22", sidebarTief: "#04161a",
  },
};

/* Glas: nur für Navigation, Dialoge und Karten. `grund` ist die opake
   Rückfalloberfläche (kein backdrop-filter, reduzierte Transparenz). */
export const V4_GLAS = {
  hell: { flaeche: "rgba(255,255,252,.72)", rand: "rgba(17,43,48,.14)", grund: "#fffefa" },
  dunkel: { flaeche: "rgba(25,65,68,.62)", rand: "rgba(238,248,243,.16)", grund: "#0e3034" },
  weichzeichner: "14px",
};

/* Verlauf hinter der Titelzone; nur `text` und `dim` liegen darauf. */
export const V4_VERLAUF = {
  hell: { a: "rgba(11,96,88,.16)", b: "rgba(15,122,111,.08)", c: "rgba(8,74,68,.07)" },
  dunkel: { a: "rgba(185,239,220,.14)", b: "rgba(143,224,198,.07)", c: "rgba(25,65,68,.30)" },
};

export const V4_SCHATTEN = {
  hell: { karte: "0 1px 2px rgba(7,30,34,.05), 0 8px 22px rgba(7,30,34,.06)",
    blatt: "0 20px 48px rgba(7,30,34,.20)" },
  dunkel: { karte: "0 1px 2px rgba(0,0,0,.30)", blatt: "0 20px 48px rgba(0,0,0,.55)" },
};

export const V4_UEBERLAGERUNG = { hell: "rgba(7,30,34,.40)", dunkel: "rgba(0,0,0,.60)" };

export const V4_RADIEN = { klein: "8px", mittel: "12px", gross: "18px", pille: "999px" };

/* 4-px-Raster */
export const V4_ABSTAND = { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 7: "48px" };

export const V4_SCHRIFT = {
  familie: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
  /* Größe / Zeilenhöhe */
  klein: ["12.5px", "1.5"], text: ["14.5px", "1.55"], gross: ["17px", "1.5"],
  titel: ["22px", "1.25"], anzeige: ["30px", "1.15"],
  gewicht: { normal: 400, mittel: 550, fett: 700 },
};

/* Breite in CSS-Pixeln, an denen die Gestaltung geprüft wird (DESIGNSYSTEM Gate 2). */
export const V4_BREAKPOINTS = { s: 360, m: 430, tablet: 768, desktop: 1024, breit: 1440 };

export const V4_FOKUS = { breite: "3px", abstand: "2px", ziel: "44px" };

export const V4_BEWEGUNG = { kurz: ".14s", mittel: ".2s", kurve: "cubic-bezier(.4,0,.2,1)" };

/**
 * Die Palette in der Form, die die bestehende Oberfläche (src/farben.js, Objekt C)
 * erwartet. Alle Schlüssel der alten Palette sind belegt, damit ein späteres
 * `themaSetzen` der Anwendung nichts Übriges zurücklässt.
 */
export function v4AlsAltePalette(thema) {
  const f = V4_FARBEN[thema];
  const v = V4_VERLAUF[thema];
  return {
    bg: f.bg, flaeche: f.flaeche, flaecheStill: f.flaecheStill,
    sidebar: f.sidebar, sidebarTief: f.sidebarTief,
    text: f.text, dim: f.dim, dimmer: f.dim, aus: f.aus,
    line: f.line, lineSoft: f.lineSoft, lineStark: f.lineStark, steuer: f.steuer,
    aufAkzent: f.aufAkzent,
    accent: f.accent, accentHi: f.accentHi, accentOrig: f.accentHi,
    accentDeep: f.accentDeep, accentLight: f.accentLight,
    accentGlanz: f.accentHi, marke: f.marke,
    ok: f.ok, warn: f.warn, danger: f.danger, violet: f.info,
    okLight: f.okLight, warnLight: f.warnLight, dangerLight: f.dangerLight,
    verlaufA: v.a, verlaufB: v.b, verlaufC: v.c,
    kopfGrund: V4_GLAS[thema].flaeche, ueberlagerung: V4_UEBERLAGERUNG[thema],
  };
}
