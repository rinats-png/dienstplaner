/* ==========================================================================
   V4 APP-STIL — Oberflächenschicht der Hauptanwendung (Phase 2)

   Sichert:
     - die Schicht enthält keinen Farbwert (nur Tokens über var(--v4-…))
     - jede überschriebene Klasse existiert im tatsächlichen App-Stil
     - jede verwendete Variable ist in den Tokens definiert
     - Fokus, reduzierte Bewegung und reduzierte Transparenz sind geregelt
     - Textpaare auf opaken Flächen erreichen WCAG 2.2 AA (4,5:1)
     - V4-2c: Seitenleisten-Einträge (.slink) je Zustand, Thema und Layout
       (Text >= 4,5:1, Fokusring >= 3:1), gemessen am gerenderten App-Stil
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V4_FARBEN, V4_GLAS } from "../src/v4/tokens.js";
import { v4AppStil, V4_APP_KLASSEN } from "../src/v4/app-stil.js";
import { v4Variablen } from "../src/v4/stil.js";
import { appQuelle } from "./app-quelle.js";

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
/* WP-39: App.jsx samt ausgelagerter Oberflaeche (src/lib, src/ui, src/app, src/ansichten). */
const app = appQuelle();

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

  it("der Körper folgt nach der Anmeldung dem Erscheinungsbild (kein Rest des Einstiegs)", () => {
    expect(app).toContain("document.body.style.background = dunkel ? C_DUNKEL.bg : C_HELL.bg;");
  });

  it("Checkboxen und Optionsfelder tragen die Akzentfarbe", () => {
    expect(schicht).toContain('input[type="checkbox"], html[data-v4-app] input[type="radio"]{accent-color:var(--v4-accent);}');
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

describe("V4 Regel: nie weiße Schrift auf dem Akzent", () => {
  /* Im dunklen Thema ist accent ein heller Mintton. Weiße Schrift darauf ist
     unlesbar (DESIGNSYSTEM: Primäre Buttons tragen dunkle Schrift auf Mint).
     Die Schriftfarbe auf accent und accentDeep ist C.aufAkzent. */
  it("kein background: C.accent/C.accentDeep mit color: \"#fff\" in einem Ausdruck", () => {
    const treffer = app.split(/\r?\n/).map((z, i) => [i + 1, z])
      .filter(([, z]) => /background:\s*C\.accent(Deep|Hi|Light)?[^,}]*,\s*color:\s*"#fff"/.test(z));
    expect(treffer).toEqual([]);
  });
  it("kein color: \"#fff\" in Abhängigkeit von der Auswahl auf accent (Schnellwahl)", () => {
    expect(app).not.toMatch(/color: schnell === id \? "#fff"/);
    expect(app).toContain("color: schnell === id ? C.aufAkzent : C.dim");
  });
  it("Knöpfe mit accent-Hintergrund und #fff in zwei Zeilen: BE-Kachel, Übernehmen, Push", () => {
    expect(app).not.toMatch(/background: C\.accent, color: "#fff"/);
    expect(app).not.toMatch(/: C\.accent,\s*\r?\n\s*color: SP\.pushErlaubt\(\) \? C\.text : "#fff"/);
  });
});

describe("Kopfzeilen: rechte Aktionsgruppen brechen um (320 px)", () => {
  it("jede Aktionsgruppe in H1 right={…} mit display:flex trägt flexWrap", () => {
    /* Nur die Slots der Seitenüberschrift H1 (Zeile beginnt mit right=); CardHead-Zeilen sind Kartenköpfe. */
    const stellen = app.split(/\r?\n/).filter((z) => /^\s*right=\{<div style=\{\{ display: "flex"/.test(z));
    expect(stellen.length).toBeGreaterThan(0);
    const ohne = stellen.filter((z) => !z.includes('flexWrap: "wrap"'));
    expect(ohne).toEqual([]);
  });
});

/* ==========================================================================
   V4-2c — Kontrast der Seitenleisten-Einträge (.slink) je Zustand, Thema und Layout

   Befund (Review #425, Browserbeleg docs/acc45/v4-2-nachweis.md §6): .slink.on und
   .slink:hover legten var(--v4-glas) unter weiße Schrift. Hell: rgba(255,255,252,.72)
   über der Seitenleiste -> 1,76:1 (WCAG 1.4.3 verlangt 4,5:1). Sichtbar in der
   Schublade unter 1025 px; ab 1025 px ist die Seitenleiste ausgeblendet
   (gestalt/stil.js), geprüft wird trotzdem beides.

   Geprüft wird der Stil, den die Anwendung rendert (App aus src/App.jsx,
   serverseitig), mit einer kleinen Kaskade für die Kette html > … > .seitenleiste >
   .snav > button.slink: Selektor-Spezifität, Reihenfolge, !important, @media nach
   Breite und Farbschema, Vererbung von color und Custom Properties, var() mit
   Rückfall. Flächen werden über die Vorfahren gemischt (rgba über opak).
   Schwellen: Text auf Fläche >= 4,5:1 (1.4.3), Fokusring >= 3:1 gegen die
   Seitenleiste UND gegen die Füllung des fokussierten Eintrags (normal, Hover,
   Aktiv), unabhängig vom outline-offset (1.4.11 Nicht-Text-Kontrast; 2.4.13
   Fokus-Erscheinung, AAA, als Richtwert; 2.4.11 ist „Focus Not Obscured“ und
   kein Kontrastkriterium). Keine Uhr im Spiel (reiner Stilvergleich).
   ========================================================================== */
describe("V4-2c: Seitenleisten-Einträge (.slink) – Kontrast je Zustand, Thema und Layout", () => {
  let appCss = "";
  beforeAll(async () => {
    const A = await import("../src/App.jsx");
    const html = renderToStaticMarkup(createElement(A.default));
    appCss = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")
      .replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }, 120000);

  /* ---- Regeln mit Medienbedingungen, in Quelltextreihenfolge ---- */
  const regelnVon = (css) => {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const aus = [];
    const lauf = (s, medien) => {
      let i = 0;
      while (i < s.length) {
        const auf = s.indexOf("{", i);
        if (auf < 0) break;
        const kopf = s.slice(i, auf).trim();
        let tiefe = 1, j = auf + 1;
        while (j < s.length && tiefe > 0) { if (s[j] === "{") tiefe++; else if (s[j] === "}") tiefe--; j++; }
        const rumpf = s.slice(auf + 1, j - 1);
        if (kopf.startsWith("@media")) lauf(rumpf, [...medien, kopf]);
        else if (!kopf.startsWith("@")) aus.push({ selektoren: kopf.split(",").map((x) => x.trim()), rumpf, medien, ord: aus.length });
        i = j;
      }
    };
    lauf(text, []);
    return aus;
  };

  /* @media: Breite, Farbschema und Zeiger; Druck, reduzierte Bewegung/Transparenz und Unbekanntes gelten nicht. */
  const medienPasst = (kopf, umg) => {
    const k = kopf.replace(/^@media/, "").trim();
    if (/\bprint\b/.test(k) || /,|\bnot\b|\bonly\b/.test(k)) return false;
    return [...k.matchAll(/\(([^)]+)\)/g)].every(([, bed]) => {
      const [name, wert] = bed.split(":").map((x) => x.trim());
      if (name === "max-width") return umg.breite <= parseFloat(wert);
      if (name === "min-width") return umg.breite >= parseFloat(wert);
      if (name === "prefers-color-scheme") return (wert === "dark") === umg.dunkel;
      if (name === "pointer") return wert === (umg.breite < 1025 ? "coarse" : "fine");
      return false;
    });
  };

  /* ---- Selektoren: nur Nachfahren-Kombinator; Pseudo-Elemente gelten nicht für das Element ---- */
  const TEIL = /\.[\w-]+|#[\w-]+|\[[^\]]+\]|:[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g;
  const passtCompound = (c, el) => {
    const m = c.match(/^(\*|[a-z][a-z0-9-]*)?(.*)$/i);
    const tag = m[1] && m[1] !== "*" ? m[1].toLowerCase() : null;
    const teile = [...m[2].matchAll(TEIL)].map((x) => x[0]);
    if (teile.join("") !== m[2]) return null; /* nicht gelesen: gilt nicht */
    if (tag && tag !== el.tag) return null;
    const spez = [0, 0, tag ? 1 : 0];
    for (const p of teile) {
      if (p.startsWith(".")) { if (!el.klassen.includes(p.slice(1))) return null; spez[1]++; continue; }
      if (p.startsWith("#")) { if (el.id !== p.slice(1)) return null; spez[0]++; continue; }
      if (p.startsWith("[")) {
        const a = p.slice(1, -1).match(/^([\w-]+)(?:([*^$]?=)"?([^"]*)"?)?$/);
        const ist = a ? el.attrs[a[1]] : undefined;
        if (ist === undefined) return null;
        if (a[2] === "=" && ist !== a[3]) return null;
        if (a[2] === "*=" && !ist.includes(a[3])) return null;
        if (a[2] === "^=" && !ist.startsWith(a[3])) return null;
        if (a[2] === "$=" && !ist.endsWith(a[3])) return null;
        spez[1]++; continue;
      }
      if (p === ":root") { if (el.tag !== "html") return null; spez[1]++; continue; }
      const nicht = p.match(/^:not\((.*)\)$/);
      if (nicht) {
        if (passtCompound(nicht[1], el)) return null;
        spez[1] += [...nicht[1].matchAll(TEIL)].length; spez[2] += /^[a-z]/i.test(nicht[1]) ? 1 : 0; continue;
      }
      if ([":hover", ":focus-visible", ":focus", ":active"].includes(p)) { if (!el.zustaende.includes(p.slice(1))) return null; spez[1]++; continue; }
      return null; /* andere Pseudoklassen (:first-child, :disabled …) gelten hier nicht */
    }
    return spez;
  };
  const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vergleich = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  /** Spezifität, wenn der Selektor auf das letzte Element der Kette passt, sonst null. */
  const passtSelektor = (sel, kette) => {
    if (sel.includes("::") || /[>+~]/.test(sel)) return null;
    const teile = sel.trim().split(/\s+/);
    let spez = passtCompound(teile[teile.length - 1], kette[kette.length - 1]);
    if (!spez) return null;
    let k = kette.length - 2;
    for (let i = teile.length - 2; i >= 0; i--) {
      let s = null;
      while (k >= 0 && !(s = passtCompound(teile[i], kette[k]))) k--;
      if (!s) return null;
      spez = plus(spez, s); k--;
    }
    return spez;
  };

  /** Deklarierte Werte (Sieger der Kaskade) für das letzte Element der Kette. */
  const deklariert = (regeln, kette, umg) => {
    const sieger = new Map();
    for (const r of regeln) {
      if (!r.medien.every((m) => medienPasst(m, umg))) continue;
      const spez = r.selektoren.map((s) => passtSelektor(s, kette)).filter(Boolean).sort(vergleich).pop();
      if (!spez) continue;
      for (const d of r.rumpf.split(";")) {
        const i = d.indexOf(":");
        if (i < 0) continue;
        const name = d.slice(0, i).trim();
        let wert = d.slice(i + 1).trim();
        if (!name || !wert) continue;
        const wichtig = /!important$/.test(wert);
        wert = wert.replace(/\s*!important$/, "");
        /* Kurzform outline setzt auch die Einzelwerte (Farbe, Stil, Breite); sie konkurrieren mit outline-color usw. */
        const namen = name === "outline" ? ["outline-color", "outline-style", "outline-width"] : [name];
        for (const n of namen) {
          const alt = sieger.get(n);
          if (!alt || (wichtig && !alt.wichtig) || (wichtig === alt.wichtig && (vergleich(spez, alt.spez) > 0
            || (vergleich(spez, alt.spez) === 0 && r.ord >= alt.ord)))) sieger.set(n, { wert, spez, ord: r.ord, wichtig });
        }
      }
    }
    return Object.fromEntries([...sieger].map(([k, v]) => [k, v.wert]));
  };

  const ersetzeVar = (wert, vars, tiefe = 0) => {
    if (tiefe > 20) throw new Error(`var()-Schleife: ${wert}`);
    const m = wert.match(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/);
    if (!m) return wert;
    const ersatz = vars[m[1]] !== undefined ? vars[m[1]] : m[2];
    if (ersatz === undefined) throw new Error(`Variable ${m[1]} nicht gesetzt (${wert})`);
    return ersetzeVar(wert.replace(m[0], ersatz.trim()), vars, tiefe + 1);
  };

  /** Berechnete Werte entlang der Kette: Custom Properties und color erben, Hintergründe nicht. */
  const berechnet = (regeln, kette, umg) => {
    let vars = {}, farbe = "#000000";
    return kette.map((el, i) => {
      const d = deklariert(regeln, kette.slice(0, i + 1), umg);
      vars = { ...vars };
      for (const [k, v] of Object.entries(d)) if (k.startsWith("--")) vars[k] = v;
      const los = (k) => (d[k] === undefined ? undefined : ersetzeVar(d[k], vars));
      if (d.color !== undefined) farbe = los("color");
      return { el, grund: los("background-color") ?? los("background") ?? "transparent", farbe,
        display: los("display"), ringFarbe: los("outline-color"), ringStil: los("outline-style"),
        ringBreite: los("outline-width"), outlineAbstand: los("outline-offset") };
    });
  };

  /* ---- Farben ---- */
  const farbeLesen = (w) => {
    const t = String(w).trim().toLowerCase();
    if (t === "transparent" || t === "none") return [0, 0, 0, 0];
    if (t === "white") return [255, 255, 255, 1];
    let m = t.match(/^#([0-9a-f]{6})$/);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
    m = t.match(/^#([0-9a-f]{3})$/);
    if (m) return [...m[1]].map((x) => parseInt(x + x, 16)).concat(1);
    m = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    throw new Error(`Farbe nicht lesbar: ${w}`);
  };
  const farbeIn = (w) => {
    const m = String(w).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|\btransparent\b|\bwhite\b/);
    if (!m) throw new Error(`keine Farbe in: ${w}`);
    return m[0];
  };
  const mische = (oben, unten) => {
    const [r, g, b, a] = farbeLesen(oben);
    return [r, g, b].map((x, i) => x * a + unten[i] * (1 - a));
  };
  const lumen = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
  const verh = (x, y) => { const [h, d] = [lumen(x), lumen(y)].sort((p, q) => q - p); return (h + 0.05) / (d + 0.05); };
  /** Opake Fläche: Hintergründe der Kette von außen nach innen gemischt (Leinwand weiß). */
  const flaecheUnter = (stufen, bis = stufen.length) => {
    let rgb = [255, 255, 255];
    for (let i = 0; i < bis; i++) rgb = mische(farbeIn(stufen[i].grund), rgb);
    return rgb;
  };
  const alsText = (rgb) => `rgb(${rgb.map((x) => Math.round(x)).join(",")})`;

  /* ---- Modell der Kette (App.jsx): Schublade bzw. Seitenleiste mit einem Eintrag ---- */
  const kette = (thema, breite, { an = false, zustaende = [] } = {}) => [
    { tag: "html", klassen: [], attrs: { "data-v4-app": "", "data-thema": thema }, zustaende: [] },
    { tag: "body", klassen: [], attrs: {}, zustaende: [] },
    { tag: "div", klassen: ["sw-root"], attrs: {}, zustaende: [] },
    { tag: "div", klassen: ["huelle"], attrs: {}, zustaende: [] },
    { tag: "aside", id: "seitenleiste", klassen: breite < 1025 ? ["seitenleiste", "offen"] : ["seitenleiste"],
      attrs: { "aria-label": "Hauptnavigation" }, zustaende: [] },
    { tag: "nav", klassen: ["snav"], attrs: {}, zustaende: [] },
    { tag: "button", klassen: an ? ["slink", "on"] : ["slink"], attrs: an ? { "aria-current": "page" } : {}, zustaende },
  ];
  const LAYOUTS = [["Schublade", 390], ["Seitenleiste", 1280]];
  const FOKUS = ["focus", "focus-visible"];
  const ZUSTAENDE = [
    ["normal", {}], ["hover", { zustaende: ["hover"] }], ["aktiv", { an: true }], ["aktiv+hover", { an: true, zustaende: ["hover"] }],
    ["focus-visible", { zustaende: FOKUS }], ["hover+focus-visible", { zustaende: ["hover", ...FOKUS] }],
    ["aktiv+focus-visible", { an: true, zustaende: FOKUS }],
  ];
  const messen = (thema, breite, opt) => {
    const st = berechnet(regelnVon(appCss), kette(thema, breite, opt), { breite, dunkel: thema === "dunkel" });
    const eintrag = st[st.length - 1];
    const flaeche = flaecheUnter(st);
    const daneben = flaecheUnter(st, st.length - 1); /* Fläche um den Eintrag (Seitenleiste) */
    const ring = eintrag.ringStil && !/\bnone\b/.test(eintrag.ringStil) ? farbeIn(eintrag.ringFarbe) : null;
    /* Der Ring wird gegen beide Nachbarn geprüft: die Seitenleiste (Spalt und außen) und die Füllung des Eintrags.
       Auch mit outline-offset (Spalt 2 px) soll der Ring neben der Füllung erkennbar sein (Review #430, A2). */
    return { st, eintrag, flaeche, daneben, ring, text: verh(mische(farbeIn(eintrag.farbe), flaeche), flaeche),
      fokus: ring ? { gegenDaneben: verh(mische(ring, daneben), daneben), gegenEintrag: verh(mische(ring, flaeche), flaeche) } : null };
  };

  it("Vorbedingung: App-Stil gerendert, Seitenleiste opak in der Tokenfarbe, ab 1025 px ausgeblendet", () => {
    expect(appCss).toContain("html[data-v4-app] .slink");
    for (const thema of ["hell", "dunkel"]) {
      for (const [, breite] of LAYOUTS) {
        const { st, daneben } = messen(thema, breite, {});
        expect(alsText(daneben), `${thema} ${breite}`).toBe(alsText(farbeLesen(V4_FARBEN[thema].sidebar).slice(0, 3)));
        expect(st[4].display === "none", `${thema} ${breite}: .seitenleiste display`).toBe(breite >= 1025);
      }
    }
  });

  for (const thema of ["hell", "dunkel"]) {
    for (const [layout, breite] of LAYOUTS) {
      for (const [zustand, opt] of ZUSTAENDE) {
        it(`${layout} ${breite} px, ${thema}, ${zustand}: Text auf Fläche >= 4,5:1`, () => {
          const m = messen(thema, breite, opt);
          expect(m.text, `Schrift ${m.eintrag.farbe} auf ${alsText(m.flaeche)} (Fläche ${m.eintrag.grund})`).toBeGreaterThanOrEqual(4.5);
        });
      }
      for (const [zustand, opt] of ZUSTAENDE.filter(([z]) => z.includes("focus-visible"))) {
        it(`${layout} ${breite} px, ${thema}, ${zustand}: Fokusring >= 3:1 gegen Seitenleiste und Füllung des Eintrags`, () => {
          const m = messen(thema, breite, opt);
          expect(m.fokus, `outline-style ${m.eintrag.ringStil}`).not.toBeNull();
          expect(m.eintrag.ringStil).toMatch(/\bsolid\b/);
          expect(parseFloat(m.eintrag.ringBreite), "Ringbreite in px").toBeGreaterThanOrEqual(2);
          expect(m.fokus.gegenDaneben, `Ring ${m.ring} gegen Seitenleiste ${alsText(m.daneben)}`).toBeGreaterThanOrEqual(3);
          expect(m.fokus.gegenEintrag, `Ring ${m.ring} gegen Eintrag ${alsText(m.flaeche)}`).toBeGreaterThanOrEqual(3);
        });
      }
      it(`${layout} ${breite} px, ${thema}: normal, Hover und Aktiv sind verschiedene Flächen`, () => {
        const [normal, hover, an] = ZUSTAENDE.slice(0, 3).map(([, opt]) => alsText(messen(thema, breite, opt).flaeche));
        expect(hover).not.toBe(normal);
        expect(an).not.toBe(hover);
      });
    }
  }

  it("aktiver Eintrag trägt zusätzlich die Akzentkante aus den Tokens (nicht nur Fläche)", () => {
    expect(schicht).toMatch(/html\[data-v4-app\] \.slink\.on::before\{background:var\(--v4-akzent-auf-dunkel\);\}/);
    for (const thema of ["hell", "dunkel"])
      expect(kontrast(V4_FARBEN[thema].akzentAufDunkel, V4_FARBEN[thema].sidebar)).toBeGreaterThanOrEqual(3);
  });

  it("Hover und Aktiv legen nicht das Glas des Inhalts (--v4-glas) auf die dunkle Seitenleiste", () => {
    expect(schicht).not.toMatch(/\.slink(:hover|\.on)\{[^}]*background:var\(--v4-glas\)/);
  });
});
