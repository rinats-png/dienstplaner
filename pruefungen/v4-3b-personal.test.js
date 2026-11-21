/* ==========================================================================
   V4-3b (zweiter Schnitt) — Hauptansicht Personal: Form- und Farbliterale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…), Farben aus der
   Palette C (src/farben.js, aus den Tokens). Keine Neugestaltung. Zuordnung wie im Plan-Schnitt
   (pruefungen/v4-radiusstufen.mjs).

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): Personal ohne Farbliterale, Form-Literale nur die begründete Ausnahme
       (Legendenquadrate der Verfügbarkeit: 15 px, Radius 5; die kleinste Stufe 8 px wäre >= halbe Kante und machte
       das Quadrat zum Kreis);
     - feste Tabelle je Datei: Stufe jeder Stelle (Review #440, Befund 1); die Regel prüft die Tabelle;
     - kein neuer Übergang (V4-2d): Anzahl `transition` je Datei wie vorher (Personalakte: 1, der Nachtbalken);
     - Personalakte: Palette statt rgba-Literal (Nachtbalken, Arbeitstage); Kontrast hell und dunkel nicht schlechter
       (1.4.11 Balken gegen Fläche; Schrift auf der Arbeitstag-Fläche >= 7:1; gewählt gegen frei nicht schwächer).

   Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { v4AlsAltePalette } from "../src/v4/tokens.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { regelStufe, stufenIn, basisText, abgleichMitBasis } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Begründete Ausnahme (kein passender Token): Legendenquadrate 15×15 px mit Radius 5 in der Verfügbarkeit. Sie
 *  bilden die gerundeten Rasterzellen (46 px hoch) ab; die kleinste Stufe (8 px) ist >= halbe Kante und machte sie
 *  zu Kreisen — das wäre Neugestaltung. Folgepaket V4-3d. */
const AUSNAHMEN = { "src/ansichten/verfuegbarkeit.jsx": 2 };

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const PERSONAL_ZUORDNUNG = {
  "src/ansichten/einarbeitung.jsx": [],
  "src/ansichten/kompetenzen.jsx": [],
  "src/ansichten/personal.jsx": [],
  "src/ansichten/verteilung.jsx": [],
  "src/ansichten/nachweise.jsx": [{ wo: "Leiste Breite 4", alt: 2, kante: 4, stufe: "pille" }],
  "src/ansichten/nachweispflege.jsx": [{ wo: "Hinweis abgelaufen", alt: 12, stufe: "mittel" }],
  "src/ansichten/personalakte.jsx": [
    { wo: "Nachtbalken oben links", alt: 5, stufe: "klein" }, { wo: "Nachtbalken oben rechts", alt: 5, stufe: "klein" },
    { wo: "Hinweis Schutzvorschriften", alt: 8, stufe: "klein" }],
  "src/ansichten/qualifikationsmatrix.jsx": [{ wo: "Punkt 9×9", alt: 5, kante: 9, stufe: "pille" }],
  "src/ansichten/selbstauskunft.jsx": [{ wo: "Begründungsfeld", alt: 6, stufe: "klein" }],
  "src/ansichten/verfuegbarkeit.jsx": [{ wo: "Rasterzelle 46 hoch", alt: 12, kante: 46, stufe: "mittel" },
    { wo: "Hinweis inaktiv", alt: 12, stufe: "mittel" }],
};

/** Übergänge je Datei vor V4-3b (Personal), wörtlich; dürfen sich nicht ändern (Review #442, B1: auch der Wert). */
const UEBERGAENGE = { "src/ansichten/personalakte.jsx": ['transition: "height .4s"'] };

/** Basis des Schnitts Personal (Review #442, B2: alt/kante gegen diesen Quelltext). */
const BASIS = "7d659b55";

describe("V4-3b Personal: Messung", () => {
  it("keine Datei ohne V4-Form, keine Farbliterale, Form-Literale nur die begründete Ausnahme", async () => {
    const inv = await inventar();
    const personal = jeHauptansicht(inv)["Personal"];
    expect(personal.ohneForm).toEqual([]);
    expect(personal.farbLiterale).toBe(0);
    expect(personal.formErreicht).toBe(personal.sichtbar);
    const mitLiteral = Object.fromEntries(inv.eintraege
      .filter((x) => hauptansicht(x) === "Personal" && x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]));
    expect(mitLiteral).toEqual(AUSNAHMEN);
    expect(personal.voll).toBe(personal.sichtbar - Object.keys(AUSNAHMEN).length);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel (Review #440)", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((e) => hauptansicht(e) === "Personal").map((e) => e.datei).sort();
    expect(Object.keys(PERSONAL_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(PERSONAL_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(PERSONAL_ZUORDNUNG).flat()).toHaveLength(9);
  }, 60000);

  it("Ausnahme bleibt begründet: Legendenquadrat 15 px mit kleinster Stufe wäre ein Kreis", () => {
    expect(parseFloat("8px")).toBeGreaterThanOrEqual(15 / 2);
    const q = ohneKommentare(lies("src/ansichten/verfuegbarkeit.jsx"));
    expect(q.match(/width: 15, height: 15, borderRadius: 5\b/g)).toHaveLength(2);
  });

  it("kein neuer Übergang (V4-2d)", () => {
    for (const datei of Object.keys(PERSONAL_ZUORDNUNG)) {
      const q = ohneKommentare(lies(datei));
      const n = (q.match(/transition/gi) || []).length;
      expect(n, datei).toBe((UEBERGAENGE[datei] || []).length);
      /* B1: der Wert wörtlich; "height .4s, background .2s" wäre ein neuer Übergang bei gleicher Anzahl. */
      expect(q.match(/transition:\s*("[^"]*"|'[^']*'|`[^`]*`)/g) || [], datei).toEqual(UEBERGAENGE[datei] || []);
    }
  });

  const basisDa = basisText(WURZEL, BASIS, "src/ansichten/personalakte.jsx") !== null;
  it.skipIf(!basisDa)("Tabellenwerte alt/kante stimmen mit dem Quelltext der Basis überein (Review #442, B2)", () => {
    for (const [datei, stellen] of Object.entries(PERSONAL_ZUORDNUNG)) {
      expect(abgleichMitBasis(basisText(WURZEL, BASIS, datei), lies(datei), stellen), datei).toEqual([]);
    }
  });
});

describe("V4-3b Personal: Farbe der Personalakte", () => {
  const q = () => ohneKommentare(lies("src/ansichten/personalakte.jsx"));
  /** Deckende Mischung von rgba(43,52,64,a) auf `grund` (Hex), wie vorher dargestellt. */
  const altMisch = (a, grund) => {
    const g = [1, 3, 5].map((i) => parseInt(grund.slice(i, i + 2), 16));
    return "#" + [43, 52, 64].map((c, i) => Math.round(c * a + g[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
  };

  it("keine rgba-Literale mehr; Nachtbalken C.lineStark, Arbeitstag C.lineSoft", () => {
    expect(q()).not.toMatch(/rgba?\(/);
    expect(q()).toMatch(/\?\s*C\.accent\s*:\s*C\.lineStark/);
    expect(q()).toMatch(/background:\s*an\s*\?\s*C\.lineSoft\s*:\s*C\.bg/);
  });

  it("Nachtbalken: Kontrast gegen die Fläche hell und dunkel nicht schlechter als vorher (1.4.11)", () => {
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      const vorher = kontrastVon(altMisch(0.24, p.flaeche), p.flaeche);
      expect(kontrastVon(p.lineStark, p.flaeche), thema).toBeGreaterThan(vorher);
      expect(kontrastVon(p.accent, p.lineStark), `${thema}: aktueller Monat unterscheidbar`).toBeGreaterThan(1.5);
    }
  });

  it("Arbeitstag: Schrift auf der Fläche >= 7:1; gewählt und frei nicht schwerer zu unterscheiden als vorher", () => {
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      expect(kontrastVon(p.text, p.lineSoft), thema).toBeGreaterThanOrEqual(7);
      const vorher = kontrastVon(altMisch(0.12, p.flaeche), p.bg);
      expect(kontrastVon(p.lineSoft, p.bg), `${thema}: gewählt gegen frei`).toBeGreaterThanOrEqual(vorher);
    }
  });
});
