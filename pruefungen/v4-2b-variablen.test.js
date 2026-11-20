/* ==========================================================================
   V4-2b — --v4-*-Variablen in der Anwendung immer gesetzt und an data-thema gebunden

   Befund (Review #425 H2, Browserbeleg docs/acc45/v4-2-nachweis.md §6):
   Die Oberflächenschicht der Anwendung (src/v4/app-stil.js, Scope
   html[data-v4-app]) liest Flächen und Farben nur aus var(--v4-…). Diese
   Variablen standen bisher ausschließlich im Einstiegsstil (<style id="v4-stil">,
   src/v4/thema.js v4EinstiegAnwenden). main.jsx ruft den Einstieg nur ohne
   Sitzung auf. Nach Neuladen (F5) mit Sitzung fehlten die Variablen ganz:
   .seitenleiste, .karte, .btn-primary ohne Hintergrund. Mit Einstiegsstil
   folgten sie dem Systemthema statt dem data-thema der Anwendung.

   Geprüft wird der Stil, den die Anwendung tatsächlich rendert (App aus
   src/App.jsx, serverseitig gerendert), mit einer kleinen Kaskade nur für
   das Wurzelelement: Selektor-Spezifität, Reihenfolge, @media
   (prefers-color-scheme). Erwartet wird für jedes Thema der Anwendung
   (hell, dunkel), jedes Systemthema (hell, dunkel) und jeden Start
   (mit und ohne Einstiegsstil, auch mit veraltetem data-v4-thema):
   jede in der App-Schicht benutzte --v4-*-Variable ist gesetzt und hat den
   Wert des Tokens für das data-thema der Anwendung.

   Keine Uhr im Spiel (reiner Stilvergleich).
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { v4AppStil } from "../src/v4/app-stil.js";
import { v4Stil } from "../src/v4/stil.js";
import { V4_FARBEN } from "../src/v4/tokens.js";

let appCss = "";

beforeAll(async () => {
  const A = await import("../src/App.jsx");
  const html = renderToStaticMarkup(h(A.default));
  const bloecke = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  appCss = bloecke.join("\n")
    .replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}, 120000);

/* ---- Kleine Kaskade, nur für Regeln am Wurzelelement ---------------------- */

/** Regeln als { selektoren, rumpf, medien } in Quelltextreihenfolge. */
function regeln(css) {
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
      else if (!kopf.startsWith("@")) aus.push({ selektoren: kopf.split(",").map((x) => x.trim()), rumpf, medien });
      i = j;
    }
  };
  lauf(text, []);
  return aus;
}

/** Spezifität (a, b, c) eines Wurzelselektors, oder null, wenn er nicht auf die Wurzel passt. */
function passtWurzel(sel, attrs) {
  let rest = sel, b = 0, c = 0;
  if (rest.startsWith(":root")) { b++; rest = rest.slice(5); }
  else if (rest.startsWith("html")) { c++; rest = rest.slice(4); }
  else return null;
  const attrPasst = (name, wert) => (wert === undefined ? name in attrs : attrs[name] === wert);
  while (rest.length) {
    let m = rest.match(/^\[([a-z0-9-]+)(?:="([^"]*)")?\]/);
    if (m) { if (!attrPasst(m[1], m[2])) return null; b++; rest = rest.slice(m[0].length); continue; }
    m = rest.match(/^:not\(\[([a-z0-9-]+)(?:="([^"]*)")?\]\)/);
    if (m) { if (attrPasst(m[1], m[2])) return null; b++; rest = rest.slice(m[0].length); continue; }
    return null; /* Nachfahre, Klasse o. Ä.: nicht die Wurzel allein */
  }
  return [0, b, c];
}

const groesser = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/** Aufgelöste --v4-*-Variablen der Wurzel für Stilblätter (in Dokumentreihenfolge). */
function aufloesen(blaetter, attrs, systemDunkel) {
  const sieger = new Map();
  let ord = 0;
  for (const css of blaetter) {
    for (const r of regeln(css)) {
      const medienAktiv = r.medien.every((m) => {
        if (/prefers-color-scheme:\s*dark/.test(m)) return systemDunkel;
        if (/prefers-color-scheme:\s*light/.test(m)) return !systemDunkel;
        return false; /* andere Medienbedingungen setzen keine Farbvariablen */
      });
      if (!medienAktiv) { ord++; continue; }
      const spez = r.selektoren.map((s) => passtWurzel(s, attrs)).filter(Boolean).sort(groesser).pop();
      ord++;
      if (!spez) continue;
      for (const d of r.rumpf.matchAll(/(--v4-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        const alt = sieger.get(d[1]);
        if (!alt || groesser(spez, alt.spez) > 0 || (groesser(spez, alt.spez) === 0 && ord >= alt.ord))
          sieger.set(d[1], { wert: d[2].trim(), spez, ord });
      }
    }
  }
  return Object.fromEntries([...sieger].map(([k, v]) => [k, v.wert]));
}

/** Sollwerte: der Einstiegsstil allein, ausdrücklich auf dieses Thema gestellt (bekannt richtig). */
const soll = (thema) => aufloesen([v4Stil()], { "data-v4-thema": thema }, thema === "dunkel");

const benutzt = [...new Set([...v4AppStil().matchAll(/var\(--(v4-[a-z0-9-]+)\)/g)].map((m) => `--${m[1]}`))];

const STARTS = [
  { name: "Neuladen mit Sitzung (ohne Einstiegsstil)", einstieg: false, zusatz: {} },
  { name: "Anmeldung ohne Neuladen (Einstiegsstil bleibt)", einstieg: true, zusatz: {} },
  { name: "Einstiegsstil mit veraltetem data-v4-thema", einstieg: true, zusatz: "gegen" },
];

describe("V4-2b: App-Stil setzt die --v4-*-Variablen selbst", () => {
  it("die App-Schicht benutzt Variablen (Vorbedingung)", () => {
    expect(benutzt.length).toBeGreaterThan(20);
    expect(appCss).toContain("html[data-v4-app] .seitenleiste");
  });

  for (const appThema of ["hell", "dunkel"]) {
    for (const systemDunkel of [false, true]) {
      for (const start of STARTS) {
        it(`${start.name}: App ${appThema}, System ${systemDunkel ? "dunkel" : "hell"}`, () => {
          const attrs = { "data-v4-app": "", "data-thema": appThema };
          if (start.zusatz === "gegen") attrs["data-v4-thema"] = appThema === "hell" ? "dunkel" : "hell";
          const blaetter = start.einstieg ? [v4Stil(), appCss] : [appCss];
          const ist = aufloesen(blaetter, attrs, systemDunkel);
          const erwartet = soll(appThema);
          const fehlend = benutzt.filter((v) => ist[v] === undefined);
          expect(fehlend, "ungesetzte Variablen").toEqual([]);
          const falsch = benutzt.filter((v) => ist[v] !== erwartet[v]).map((v) => `${v}: ${ist[v]} statt ${erwartet[v]}`);
          expect(falsch, "Variablen folgen nicht data-thema").toEqual([]);
        });
      }
    }
  }

  it("Flächen der Befundklassen sind opake Token-Farben (nicht leer, nicht transparent)", () => {
    for (const thema of ["hell", "dunkel"]) {
      const ist = aufloesen([appCss], { "data-v4-app": "", "data-thema": thema }, thema !== "dunkel");
      expect(ist["--v4-flaeche"]).toBe(V4_FARBEN[thema].flaeche);
      expect(ist["--v4-accent"]).toBe(V4_FARBEN[thema].accent);
      expect(ist["--v4-sidebar"]).toBe(V4_FARBEN[thema].sidebar);
    }
  });
});
