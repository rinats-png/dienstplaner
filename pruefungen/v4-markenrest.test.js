/* ==========================================================================
   V4-2 MARKENREST — Browserfarbe, Wortmarke, Namenszeichen, Glas-Rückfall,
   Farbliterale der Hauptanwendung

   Sichert die Akzeptanz von V4-2 (docs/acc45/work-packages.json):
     - Manifest und index.html melden die V4-Grundfarbe (nicht mehr V3 #D9E4E8)
     - die Wortmarke ist das freigegebene SVG (DESIGNSYSTEM: „Wortmarke immer
       als bereitgestelltes SVG, nicht als HTML-Text nachgebaut“)
     - die Namenszeichen-Paare (Avatar) kommen aus den V4-Tokens
     - Glas ohne Rückfall: bei prefers-reduced-transparency und ohne
       backdrop-filter opake Flächen (DESIGNSYSTEM Qualitätsgate 4)
     - App.jsx trägt keine rgb()/rgba()-Literale mehr; Seitenleiste und
       Schatten kommen aus den Tokens, Schrift der Seitenleiste >= 4,5:1
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as TOKENS from "../src/v4/tokens.js";
import * as MARKE from "../src/marke.jsx";
import * as FARBEN from "../src/farben.js";
import { gestaltStil } from "../src/gestalt/stil.js";

const { V4_FARBEN, V4_SCHATTEN } = TOKENS;
const WURZEL = join(import.meta.dirname, "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8").replace(/\r\n/g, "\n");
/** Quelltext ohne Block- und Zeilenkommentare (wie werkzeug/v4-inventar.mjs). */
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

const kanal = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const rgbVon = (farbe) => {
  const m = farbe.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (m) return { rgb: [m[1], m[2], m[3]].map(Number), a: Number(m[4]) };
  const h = farbe.replace("#", "");
  return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a: 1 };
};
/** Farbe (Hex oder rgba) über einen opaken Hex-Grund gelegt -> [r,g,b] */
const ueber = (farbe, grund) => {
  const f = rgbVon(farbe);
  const g = rgbVon(grund).rgb;
  return f.rgb.map((x, k) => Math.round(x * f.a + g[k] * (1 - f.a)));
};
const leucht = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
const kontrast = (vorne, grund) => {
  const [x, y] = [leucht(ueber(vorne, grund)), leucht(rgbVon(grund).rgb)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Inhalt eines @-Blocks (Klammern ausgezählt), alle Vorkommen. */
const bloecke = (css, kopf) => {
  const aus = [];
  let i = css.indexOf(kopf);
  while (i >= 0) {
    const auf = css.indexOf("{", i);
    let tiefe = 1, j = auf + 1;
    while (j < css.length && tiefe > 0) { if (css[j] === "{") tiefe++; else if (css[j] === "}") tiefe--; j++; }
    aus.push(css.slice(auf + 1, j - 1));
    i = css.indexOf(kopf, j);
  }
  return aus.join("\n");
};
/** Selektoren aller Regeln außerhalb von @-Blöcken, die einen echten Weichzeichner setzen. */
const ohneCssKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const glasSelektoren = (roh) => {
  const css = ohneCssKommentare(roh);
  const flach = css.replace(/@(media|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  return [...flach.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , rumpf]) => /(^|[;\s])backdrop-filter\s*:\s*(?!none)/.test(rumpf))
    .flatMap(([, sel]) => sel.split(",").map((s) => s.trim()).filter(Boolean));
};
/** Regelrumpf zu einem Selektor in einem CSS-Abschnitt (alle Regeln, die ihn nennen). */
const rumpfZu = (css, selektor) => [...ohneCssKommentare(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, sel]) => sel.split(",").map((s) => s.trim()).includes(selektor))
  .map(([, , r]) => r).join(";");

const RUECKFALL_MEDIA = "@media (prefers-reduced-transparency: reduce)";
const RUECKFALL_SUPPORTS = "@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))";

describe("V4-2: Browserfarbe (theme-color) und Manifest", () => {
  it("manifest.webmanifest meldet die V4-Grundfarbe (hell) als theme_color und background_color", () => {
    const m = JSON.parse(lies("public/manifest.webmanifest"));
    expect(m.theme_color).toBe(V4_FARBEN.hell.bg);
    expect(m.background_color).toBe(V4_FARBEN.hell.bg);
  });
  it("index.html setzt theme-color auf die V4-Grundfarbe; die V3-Farbe ist weg", () => {
    const html = lies("index.html");
    const meta = html.match(/<meta name="theme-color" content="([^"]+)"/);
    expect(meta?.[1]).toBe(V4_FARBEN.hell.bg);
    expect(`${html}\n${lies("public/manifest.webmanifest")}`.toUpperCase()).not.toContain("#D9E4E8");
  });
});

describe("V4-2: Wortmarke als bereitgestelltes SVG", () => {
  it("marke.jsx bietet die Wortmarke als Bild der freigegebenen SVG-Dateien", () => {
    expect(typeof MARKE.Wortmarke).toBe("function");
    const dunkleSchrift = renderToStaticMarkup(React.createElement(MARKE.Wortmarke, { hoehe: 13 }));
    const helleSchrift = renderToStaticMarkup(React.createElement(MARKE.Wortmarke, { hell: true, hoehe: 13 }));
    expect(dunkleSchrift).toMatch(/<img[^>]*src="\/centric-wortmarke\.svg"/);
    expect(helleSchrift).toMatch(/<img[^>]*src="\/centric-wortmarke-hell\.svg"/);
    for (const h of [dunkleSchrift, helleSchrift]) {
      expect(h).toContain('alt="CENTRIC"');
      expect(h).toContain('height="13"');
      expect(h).toContain('width="81.3"');   // Seitenverhältnis der Datei 268,8 : 43
    }
    expect(existsSync(join(WURZEL, "public/centric-wortmarke.svg"))).toBe(true);
    expect(existsSync(join(WURZEL, "public/centric-wortmarke-hell.svg"))).toBe(true);
  });
  it("Kopfzeile, Seitenleiste, Telefonschale und Einstieg bauen die Wortmarke nicht mehr als Text nach", () => {
    const stellen = {
      "src/gestalt/rahmen.jsx": /<span className="wort">\s*CENTRIC\s*<\/span>/,
      "src/App.jsx": /<b>\s*CENTRIC\s*<\/b>/,
      "src/ansichten/mobil.jsx": /<span className="m-wort">\s*CENTRIC\s*<\/span>/,
      "src/main.jsx": /letterSpacing: "\.14em" \}\}>CENTRIC</,
    };
    for (const [datei, textmarke] of Object.entries(stellen)) {
      const q = lies(datei);
      expect(q, datei).not.toMatch(textmarke);
      expect(q, datei).toMatch(/<Wortmarke\b/);
    }
  });
  it("der Name „CENTRIC“ wird je Marke genau einmal angesagt (Review #425 A1)", () => {
    /* alt="" macht die Wortmarke dekorativ, wenn daneben schon das Logo (role=img, aria-label) den Namen trägt. */
    const leer = renderToStaticMarkup(React.createElement(MARKE.Wortmarke, { alt: "" }));
    expect(leer).toContain('alt=""');
    expect(lies("src/ui/logo.jsx")).toMatch(/role="img" aria-label="CENTRIC"/);
    for (const datei of ["src/App.jsx", "src/ansichten/mobil.jsx"]) {
      const q = lies(datei);
      const i = q.search(/<Wortmarke\b/);
      const vorher = q.slice(Math.max(0, i - 200), i);
      expect(vorher, `${datei}: Logo vor der Wortmarke`).toMatch(/<Logo\b/);
      expect(q.slice(i, q.indexOf("/>", i)), `${datei}: Wortmarke neben dem Logo`).toContain('alt=""');
    }
    /* Neben der aria-verborgenen Bildmarke (Marke) trägt die Wortmarke den Namen selbst. */
    for (const datei of ["src/gestalt/rahmen.jsx", "src/main.jsx"]) {
      const q = lies(datei);
      const i = q.search(/<Wortmarke\b/);
      expect(q.slice(i, q.indexOf("/>", i)), datei).not.toContain('alt=""');
    }
  });
  it("die Klassen der Wortmarken-Stellen bleiben (Gestaltung und Locators unverändert)", () => {
    expect(lies("src/gestalt/rahmen.jsx")).toContain('className="wort"');
    expect(lies("src/ansichten/mobil.jsx")).toContain('className="m-wort"');
  });
  it("der Dienstarbeiter hält beide Wortmarken für den Offlinebetrieb vor", () => {
    const sw = lies("public/sw.js");
    expect(sw).toContain('"/centric-wortmarke.svg"');
    expect(sw).toContain('"/centric-wortmarke-hell.svg"');
  });
});

describe("V4-2: Namenszeichen-Paare aus den Tokens", () => {
  it("tokens.js beschreibt acht Paare je Erscheinungsbild über Farbschlüssel", () => {
    expect(typeof TOKENS.v4AvatarPaare).toBe("function");
    for (const t of ["hell", "dunkel"]) {
      const paare = TOKENS.v4AvatarPaare(t);
      expect(paare).toHaveLength(8);
      const erlaubt = new Set(Object.values(V4_FARBEN[t]));
      for (const [flaeche, schrift] of paare) {
        expect(erlaubt.has(flaeche), `${t} ${flaeche}`).toBe(true);
        expect(erlaubt.has(schrift), `${t} ${schrift}`).toBe(true);
        expect(kontrast(schrift, flaeche), `${t} ${schrift}/${flaeche}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(new Set(paare.map((p) => p.join())).size, `${t}: Paare verschieden`).toBe(8);
    }
  });
  it("farben.js übernimmt die Paare und trägt keine einzige Hexfarbe mehr", () => {
    expect(FARBEN.AVATAR_HELL).toEqual(TOKENS.v4AvatarPaare("hell"));
    expect(FARBEN.AVATAR_DUNKEL).toEqual(TOKENS.v4AvatarPaare("dunkel"));
    expect(ohneKommentare(lies("src/farben.js"))).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});

describe("V4-2: Glas-Rückfall (reduzierte Transparenz, ohne backdrop-filter)", () => {
  const faelle = [
    ["src/gestalt/stil.js", () => gestaltStil()],
    ["src/App.jsx", () => {
      const q = lies("src/App.jsx");
      const a = q.indexOf("const bauStyles = () => `");
      return q.slice(a, q.indexOf("\n`;", a));
    }],
  ];
  for (const [datei, css] of faelle) {
    it(`${datei}: jede Glasregel hat einen Rückfall ohne Weichzeichner bei reduzierter Transparenz`, () => {
      const text = css();
      const sel = glasSelektoren(text);
      expect(sel.length, `${datei}: Glasregeln gefunden`).toBeGreaterThan(0);
      const media = bloecke(text, RUECKFALL_MEDIA);
      for (const s of sel) expect(rumpfZu(media, s), `${datei} ${s}`).toMatch(/(^|;)\s*backdrop-filter\s*:\s*none/);
    });
    it(`${datei}: ohne backdrop-filter-Unterstützung und bei reduzierter Transparenz tragen Leisten eine opake Fläche`, () => {
      const text = css();
      /* Leisten = Glasregeln mit durchscheinendem Kopfgrund; Rücken (Überlagerung) bleiben Abdunklung. */
      const leisten = glasSelektoren(text).filter((s) => /var\(--c-kopf-grund\)/.test(rumpfZu(text, s)));
      for (const kopf of [RUECKFALL_MEDIA, RUECKFALL_SUPPORTS]) {
        const block = bloecke(text, kopf);
        for (const s of leisten) expect(rumpfZu(block, s), `${datei} ${kopf} ${s}`).toMatch(/background\s*:\s*var\(--c-flaeche\)/);
      }
    });
  }
  it("die Leisten der Gestaltschicht sind erfasst (Kopfblock, Tableiste, Telefonkopf, Telefonreiter)", () => {
    const sel = glasSelektoren(gestaltStil());
    for (const s of [".kopfblock", ".tabbar", ".m-kopf", ".m-tabs", ".m-blattrahmen"]) expect(sel).toContain(s);
  });
  it("die opake Rückfallfläche ist die Glas-Grundfläche der Tokens", () => {
    for (const t of ["hell", "dunkel"]) expect(TOKENS.V4_GLAS[t].grund).toBe(FARBEN[t === "hell" ? "C_HELL" : "C_DUNKEL"].flaeche);
  });
});

describe("V4-2: Farbliterale der Hauptanwendung auf Tokens", () => {
  it("App.jsx enthält kein rgb()/rgba()-Literal mehr", () => {
    expect(ohneKommentare(lies("src/App.jsx"))).not.toMatch(/\brgba?\(/);
  });
  it("die Seitenleiste schreibt keine feste weiße Schrift mehr (color:#fff / color: \"#fff\")", () => {
    expect(ohneKommentare(lies("src/App.jsx"))).not.toMatch(/color\s*:\s*["']?#fff\b(?!\w)["']?\s*[;,}]/i);
  });
  it("Schatten: alle Ebenen der Anwendung stehen in beiden Themes in den Tokens", () => {
    for (const k of ["karte", "hoch", "blatt", "toast", "regler", "schublade"]) {
      for (const t of ["hell", "dunkel"]) expect(V4_SCHATTEN[t][k], `${t}.${k}`).toBeTruthy();
    }
  });
  it("Seitenleiste: Schrifttöne erreichen auf der Seitenleiste in beiden Themes >= 4,5:1", () => {
    const S = TOKENS.V4_SEITENLEISTE;
    expect(S).toBeTruthy();
    for (const t of ["hell", "dunkel"]) {
      const grund = V4_FARBEN[t].sidebar;
      for (const k of Object.keys(S).filter((n) => n.startsWith("schrift"))) {
        expect(kontrast(S[k], grund), `${t} ${k}`).toBeGreaterThanOrEqual(4.5);
      }
      /* Kürzelfeld im Fuß: Schrift auf der Tönung über der Seitenleiste */
      const kuerzelGrund = `#${ueber(S.kuerzel, grund).map((x) => x.toString(16).padStart(2, "0")).join("")}`;
      expect(kontrast(S.schrift, kuerzelGrund), `${t} Kürzel`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("App.jsx liest Schatten und Seitenleiste aus den Tokens (beide Themes)", () => {
    const q = lies("src/App.jsx");
    expect(q).toMatch(/V4_SCHATTEN/);
    expect(q).toMatch(/V4_SEITENLEISTE/);
    expect(q).toMatch(/var\(--sl-schrift\)/);
  });
});
