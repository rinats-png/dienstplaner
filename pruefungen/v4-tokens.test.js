/* ==========================================================================
   V4 TOKENS — Vollständigkeit beider Themes, Kontrast, Themawahl, Einstieg

   Sichert konkrete Anforderungen der V4-Phase 1:
     - Dunkel und Hell haben dieselben Schlüssel; nichts fehlt, nichts ist leer
     - die alte Palette (farben.js) ist vollständig abgebildet
     - Textpaare >= 4,5:1, Bedienelemente und Fokus >= 3:1 (WCAG 2.2 AA)
     - kein helles Weiß auf hellem Türkis
     - Themawahl: Nutzereinstellung > System > hell
     - Einstieg liest keine festen Farben und stellt nichts an der Anmeldung um
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { C_HELL } from "../src/farben.js";
import {
  V4_FARBEN, V4_GLAS, V4_VERLAUF, V4_SCHATTEN, V4_RADIEN, V4_ABSTAND, V4_SCHRIFT,
  V4_BREAKPOINTS, V4_FOKUS, V4_TOKENS_VERSION, v4AlsAltePalette,
} from "../src/v4/tokens.js";
import { v4Stil } from "../src/v4/stil.js";
import { v4ThemaAufloesen } from "../src/v4/thema.js";
import { V4Karte, V4Knopf, V4Feld, V4Dialog, V4Hinweis } from "../src/v4/komponenten.jsx";

const WURZEL = join(import.meta.dirname, "..");
const lies = (p) => readFileSync(join(WURZEL, p), "utf8");

const kanal = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const leucht = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
};
const verh = (a, b) => { const [x, y] = [leucht(a), leucht(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** rgba(r,g,b,a) über einen Hex-Grund gelegt -> Hex */
const ueber = (rgba, grund) => {
  const m = rgba.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  const g = [1, 3, 5].map((i) => parseInt(grund.slice(i, i + 2), 16));
  const mix = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * Number(m[4]) + g[k] * (1 - Number(m[4]))));
  return `#${mix.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

describe("Vollständigkeit der Tokens", () => {
  it("Dunkel und Hell haben genau dieselben Farbschlüssel, alle belegt", () => {
    expect(Object.keys(V4_FARBEN.dunkel).sort()).toEqual(Object.keys(V4_FARBEN.hell).sort());
    for (const t of ["hell", "dunkel"]) {
      for (const [k, w] of Object.entries(V4_FARBEN[t])) expect(w, `${t}.${k}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("Glas, Verlauf, Schatten gibt es in beiden Themes", () => {
    for (const q of [V4_GLAS, V4_VERLAUF, V4_SCHATTEN]) {
      expect(Object.keys(q.hell).sort()).toEqual(Object.keys(q.dunkel).sort());
    }
    expect(V4_GLAS.hell.grund).toBe(V4_FARBEN.hell.flaeche);
    expect(V4_GLAS.dunkel.grund).toBe(V4_FARBEN.dunkel.flaeche);
  });

  it("Radien, Abstände, Typografie, Breakpoints, Fokus sind vorhanden", () => {
    expect(Object.keys(V4_RADIEN)).toEqual(["klein", "mittel", "gross", "pille"]);
    expect(Object.keys(V4_ABSTAND).length).toBeGreaterThanOrEqual(6);
    expect(V4_SCHRIFT.familie).toContain("Inter");
    expect(Object.values(V4_BREAKPOINTS)).toEqual([...Object.values(V4_BREAKPOINTS)].sort((a, b) => a - b));
    expect(parseInt(V4_FOKUS.ziel, 10)).toBeGreaterThanOrEqual(44);
    expect(V4_TOKENS_VERSION).toBe(1);
  });

  it("die alte Palette ist in beiden Themes vollständig abgebildet (keine Reste beim Umschalten)", () => {
    for (const t of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(t);
      expect(Object.keys(p).sort()).toEqual(Object.keys(C_HELL).sort());
      for (const [k, w] of Object.entries(p)) expect(w, `${t}.${k}`).toBeTruthy();
    }
  });

  it("das CSS enthält Variablen für beide Themes und für die Systemeinstellung", () => {
    const css = v4Stil();
    expect(css).toContain(':root[data-v4-thema="dunkel"]');
    expect(css).toContain(':root[data-v4-thema="hell"]');
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("prefers-reduced-transparency");
    expect(css).toContain("prefers-reduced-motion");
    for (const t of ["hell", "dunkel"]) {
      for (const w of Object.values(V4_FARBEN[t])) expect(css).toContain(w);
    }
  });
});

describe("Kontrast (WCAG 2.2 AA)", () => {
  for (const t of ["hell", "dunkel"]) {
    const f = V4_FARBEN[t];
    it(`${t}: Text >= 4,5:1 auf allen Flächen`, () => {
      for (const grund of ["bg", "flaeche", "flaecheStill"]) {
        expect(verh(f.text, f[grund]), `text/${grund}`).toBeGreaterThanOrEqual(4.5);
        expect(verh(f.dim, f[grund]), `dim/${grund}`).toBeGreaterThanOrEqual(4.5);
        expect(verh(f.aus, f[grund === "flaecheStill" ? "flaeche" : grund]), `aus/${grund}`).toBeGreaterThanOrEqual(3);
      }
      expect(verh(f.accent, f.bg)).toBeGreaterThanOrEqual(4.5);
      expect(verh(f.accent, f.flaeche)).toBeGreaterThanOrEqual(4.5);
      expect(verh(f.accent, f.accentLight)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t}: Schrift auf dem Akzent >= 4,5:1`, () => {
      expect(verh(f.aufAkzent, f.accent)).toBeGreaterThanOrEqual(4.5);
      expect(verh(f.aufAkzent, f.accentHi), "Hover").toBeGreaterThanOrEqual(4.5);
    });
    it(`${t}: Statusfarben als Text auf Fläche und eigener Tönung >= 4,5:1`, () => {
      for (const [s, hell] of [["ok", "okLight"], ["warn", "warnLight"], ["danger", "dangerLight"], ["info", "infoLight"]]) {
        expect(verh(f[s], f.flaeche), `${s}/flaeche`).toBeGreaterThanOrEqual(4.5);
        expect(verh(f[s], f[hell]), `${s}/${hell}`).toBeGreaterThanOrEqual(4.5);
        expect(verh(f.text, f[hell]), `text/${hell}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${t}: Bedienelementrand und Fokus >= 3:1 gegen Fläche und Grund`, () => {
      for (const grund of ["bg", "flaeche"]) {
        expect(verh(f.steuer, f[grund]), `steuer/${grund}`).toBeGreaterThanOrEqual(3);
        expect(verh(f.focus, f[grund]), `focus/${grund}`).toBeGreaterThanOrEqual(3);
      }
    });
    it(`${t}: Text bleibt auf dem Verlauf der Titelzone >= 4,5:1`, () => {
      const v = V4_VERLAUF[t];
      const auf = ueber(v.a, f.bg);
      expect(verh(f.text, auf)).toBeGreaterThanOrEqual(4.5);
      expect(verh(f.dim, auf)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t}: Text auf Glas (über dem Grund) >= 4,5:1`, () => {
      const g = ueber(V4_GLAS[t].flaeche, f.bg);
      expect(verh(f.text, g)).toBeGreaterThanOrEqual(4.5);
      expect(verh(f.dim, g)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("kein Weißtext auf hellem Türkis: der Akzent mit heller Schrift ist dunkel, der helle Akzent trägt dunkle Schrift", () => {
    const { hell, dunkel } = V4_FARBEN;
    expect(leucht(hell.accent)).toBeLessThan(0.2);          // dunkles Petrol trägt Hellschrift
    expect(leucht(hell.aufAkzent)).toBeGreaterThan(0.9);
    expect(leucht(dunkel.accent)).toBeGreaterThan(0.5);     // Mint trägt dunkle Schrift
    expect(leucht(dunkel.aufAkzent)).toBeLessThan(0.05);
  });
});

describe("Themawahl: Nutzereinstellung > System > hell", () => {
  it("eine feste Wahl schlägt das System", () => {
    expect(v4ThemaAufloesen("hell", true)).toBe("hell");
    expect(v4ThemaAufloesen("dunkel", false)).toBe("dunkel");
  });
  it("auto oder keine Wahl folgt dem System", () => {
    for (const w of ["auto", null, undefined, "unsinn"]) {
      expect(v4ThemaAufloesen(w, true)).toBe("dunkel");
      expect(v4ThemaAufloesen(w, false)).toBe("hell");
    }
  });
  it("ohne Systemauskunft gilt hell", () => {
    expect(v4ThemaAufloesen(null, undefined)).toBe("hell");
    expect(v4ThemaAufloesen("auto", null)).toBe("hell");
  });
});

describe("Basiskomponenten", () => {
  const html = (el) => renderToStaticMarkup(el);
  it("Feld verbindet Beschriftung, Hinweis und Fehler; Fehler hat Text und Symbol", () => {
    const h = html(React.createElement(V4Feld, { label: "Code", hinweis: "Hilfe", fehler: "Falsch", id: "x" }));
    expect(h).toContain('for="x"');
    expect(h).toContain('aria-invalid="true"');
    expect(h).toContain('aria-describedby="x-h x-e"');
    expect(h).toContain('role="alert"');
    expect(h).toContain("<svg");
    expect(h).toContain("Falsch");
  });
  it("Hinweis trägt immer ein Symbol und die passende Rolle", () => {
    for (const ton of ["info", "ok", "warn", "danger"]) {
      const h = html(React.createElement(V4Hinweis, { ton }, "Text"));
      expect(h).toContain("<svg");
      expect(h).toContain(ton === "warn" || ton === "danger" ? 'role="alert"' : 'role="status"');
    }
  });
  it("Knopf: laeuft sperrt und meldet aria-busy; Karte nur mit glas=true als Glas", () => {
    expect(html(React.createElement(V4Knopf, { laeuft: true }, "Los"))).toMatch(/disabled=""[^>]*aria-busy="true"|aria-busy="true"[^>]*disabled=""/);
    expect(html(React.createElement(V4Karte, null, "x"))).not.toContain("v4-glas");
    expect(html(React.createElement(V4Karte, { glas: true }, "x"))).toContain("v4-glas");
  });
  it("Dialog ist ein modaler Dialog mit verbundenem Titel", () => {
    const h = html(React.createElement(V4Dialog, { titel: "Titel", onSchliessen() {} }, "Inhalt"));
    expect(h).toContain('role="dialog"');
    expect(h).toContain('aria-modal="true"');
    expect(h).toMatch(/aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"/);
  });
});

describe("Einstieg auf V4", () => {
  const quelle = lies("src/main.jsx");
  it("der Einstieg ist nicht mehr auf Hell festgelegt und setzt das V4-Thema vor dem ersten Bild", () => {
    expect(quelle).not.toMatch(/colorScheme\s*=\s*"light"/);
    expect(quelle).toContain("v4EinstiegAnwenden()");
  });
  it("die Rahmen der öffentlichen Seiten lesen Tokens, keine festen Farben", () => {
    const a = quelle.indexOf("const SEITE");
    const b = quelle.indexOf("const Markenzeile");
    expect(quelle.slice(a, b)).not.toMatch(/#[0-9A-Fa-f]{3,6}\b|rgba\(/);
  });
  it("die V4-Dateien stehen in src/v4 und tragen als einzige Datei dort Hexfarben (Tokens)", () => {
    for (const d of ["stil.js", "thema.js", "komponenten.jsx"]) {
      expect(lies(`src/v4/${d}`), d).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    }
  });
});

describe("Phase 2: die Anwendung nutzt dieselbe Quelle und dieselbe Themenregel", () => {
  it("farben.js bildet C, C_HELL und C_DUNKEL aus den V4-Tokens ab", async () => {
    const { C, C_HELL, C_DUNKEL } = await import("../src/farben.js");
    expect(C_HELL).toEqual(v4AlsAltePalette("hell"));
    expect(C_DUNKEL).toEqual(v4AlsAltePalette("dunkel"));
    expect(C.bg).toBe(V4_FARBEN.hell.bg);
    expect(lies("src/farben.js").split("AVATAR_HELL")[0]).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
  it("die Anwendung folgt ohne ausdrückliche Wahl dem System und merkt die Wahl pro Gerät", () => {
    const app = lies("src/App.jsx");
    expect(app).toContain("v4ThemaMerken(eigene)");
    expect(app).toContain("v4SystemthemaBeobachten");
    expect(app).toContain('p.thema || "auto"');
  });
});
