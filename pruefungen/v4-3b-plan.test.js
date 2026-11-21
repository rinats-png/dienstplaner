/* ==========================================================================
   V4-3b (erster Schnitt) — Hauptansicht Plan/Dienstplan: Form-Literale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…), Farben aus der
   Palette C (src/farben.js, aus den Tokens). Keine Neugestaltung.

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): Plan/Dienstplan ohne Dateien „ohne V4-Form“, ohne Farbliterale,
       Form-Literale nur noch die begründeten Ausnahmen (Diagrammbalken 1/2 px, kein passender Token);
     - jede var(--v4-r-…) im Inline-Stil der Plan-Dateien ist eine der vier Radiusstufen;
     - die geänderten Dateien führen keinen Übergang ein (V4-2d: Fokus bei reduzierter Bewegung);
     - Darstellung (serverseitig gerendert): Rahmen der Änderungsübersicht, des KI-Entwurfs und der Team-Auslastung
       lesen die kleine Radiusstufe; Accessible Names, Rollen und Klassen bleiben;
     - Feiertagsband im Tagesdetail: Palette statt rgba-Literal; Schrift auf Fläche >= 4,5:1 hell und dunkel.

   Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { V4_RADIEN, v4AlsAltePalette } from "../src/v4/tokens.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { Aenderungsuebersicht, AENDERUNG_TEXTE } from "../src/ansichten/intelligence/Aenderungsuebersicht.jsx";
import { KiEntwurf } from "../src/ansichten/intelligence/KiEntwurf.jsx";
import { TeamAuslastungLeiste } from "../src/ansichten/teamauslastungleiste.jsx";
import { ISTDATEN_TEXT } from "../src/istdaten.js";
import { regelStufe, stufenIn } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Begründete Ausnahmen (kein passender Token): Diagrammbalken mit 1/2 px Radius. Eine Pille würde die hohen Balken
 *  der Kopfzeile (bis 16 px) zur Kapsel machen — das wäre eine Neugestaltung. Folgepaket V4-3b (Rest). */
const AUSNAHMEN = { "src/ansichten/monatsplan.jsx": 1, "src/ansichten/jahresansicht.jsx": 1 };

/** Dateien dieses Schnitts (vorher mit Form- oder Farbliteral bzw. ohne V4-Form). */
const GEAENDERT = [
  "src/ansichten/intelligence/Aenderungsuebersicht.jsx", "src/ansichten/intelligence/KiEntwurf.jsx",
  "src/ansichten/teamauslastungleiste.jsx", "src/ansichten/betriebsmittel.jsx", "src/ansichten/einsatzplan.jsx",
  "src/ansichten/ersatzliste.jsx", "src/ansichten/jahresansicht.jsx", "src/ansichten/monatsplan.jsx",
  "src/ansichten/offeneschichten.jsx", "src/ansichten/schichtfolge.jsx", "src/ansichten/schnellbesetzung.jsx",
  "src/ansichten/selbstplanung.jsx", "src/ansichten/standortespiegel.jsx", "src/ansichten/tagesdetail.jsx",
  "src/ansichten/wochenliste.jsx",
];

/** Feste Zuordnung je Stelle (Nachtrag V4-3b in docs/acc45/V4-IST-STAND-2026-11-20.md), Quelltextreihenfolge.
 *  alt = Radius vor V4-3b (px); kante = kleinere Kante bei Punkten/Leisten (px), sonst ohne. */
const PLAN_ZUORDNUNG = {
  "src/ansichten/intelligence/Aenderungsuebersicht.jsx": [{ wo: "Rahmen", alt: 8, stufe: "klein" }],
  "src/ansichten/intelligence/KiEntwurf.jsx": [{ wo: "Rahmen", alt: 8, stufe: "klein" }],
  "src/ansichten/teamauslastungleiste.jsx": [{ wo: "Hinweis ohne Istdaten", alt: 6, stufe: "klein" }],
  "src/ansichten/betriebsmittel.jsx": [{ wo: "Ablage frei", alt: 14, stufe: "mittel" },
    { wo: "Ablage Person", alt: 14, stufe: "mittel" }],
  "src/ansichten/einsatzplan.jsx": [{ wo: "Konfliktrahmen", alt: 6, stufe: "klein" },
    { wo: "Punkt 7×7", alt: 4, kante: 7, stufe: "pille" }],
  "src/ansichten/ersatzliste.jsx": [{ wo: "Rangmarke 26×26", alt: 9, kante: 26, stufe: "klein" },
    { wo: "Hinweis", alt: 14, stufe: "mittel" }],
  "src/ansichten/jahresansicht.jsx": [{ wo: "Monatsbalken-Kasten 40×36", alt: 6, kante: 36, stufe: "klein" }],
  "src/ansichten/monatsplan.jsx": [{ wo: "Punkt 8×8", alt: 4, kante: 8, stufe: "pille" },
    { wo: "Leiste Höhe 3", alt: 2, kante: 3, stufe: "pille" }, { wo: "Punkt 5×5", alt: 3, kante: 5, stufe: "pille" }],
  "src/ansichten/offeneschichten.jsx": [{ wo: "Leiste Breite 4", alt: 2, kante: 4, stufe: "pille" },
    { wo: "Leiste Breite 4", alt: 2, kante: 4, stufe: "pille" }, { wo: "Kasten", alt: 10, stufe: "mittel" }],
  "src/ansichten/schichtfolge.jsx": [{ wo: "Punkt 8×8", alt: 4, kante: 8, stufe: "pille" }],
  "src/ansichten/schnellbesetzung.jsx": [{ wo: "Hinweis", alt: 12, stufe: "mittel" },
    { wo: "Rangmarke 25×25", alt: 9, kante: 25, stufe: "klein" }],
  "src/ansichten/selbstplanung.jsx": [{ wo: "Bedarfszelle", alt: 8, stufe: "klein" }],
  "src/ansichten/standortespiegel.jsx": [{ wo: "Kasten", alt: 10, stufe: "mittel" }],
  "src/ansichten/tagesdetail.jsx": [{ wo: "Feiertagsband", alt: 12, stufe: "mittel" },
    { wo: "Reiter-Ablage", alt: 999, stufe: "pille" }, { wo: "Spalten Eingeteilt/Verfügbar", alt: 16, stufe: "gross" }],
  "src/ansichten/wochenliste.jsx": [{ wo: "Leiste Höhe 3", alt: 2, kante: 3, stufe: "pille" },
    { wo: "Punkt 7×7", alt: 4, kante: 7, stufe: "pille" }],
};

describe("V4-3b Plan/Dienstplan: Messung", () => {
  it("keine Datei ohne V4-Form, keine Farbliterale, Form-Literale nur die begründeten Ausnahmen", async () => {
    const inv = await inventar();
    const plan = jeHauptansicht(inv)["Plan/Dienstplan"];
    expect(plan.ohneForm).toEqual([]);
    expect(plan.farbLiterale).toBe(0);
    expect(plan.formErreicht).toBe(plan.sichtbar);
    const mitLiteral = Object.fromEntries(inv.eintraege
      .filter((x) => hauptansicht(x) === "Plan/Dienstplan" && x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]));
    expect(mitLiteral).toEqual(AUSNAHMEN);
    expect(plan.voll).toBe(plan.sichtbar - Object.keys(AUSNAHMEN).length);
  }, 60000);

  it("jede Radius-Variable im Inline-Stil ist eine der vier Radiusstufen", async () => {
    const inv = await inventar();
    const stufen = Object.keys(V4_RADIEN);
    let gesehen = 0;
    for (const x of inv.eintraege.filter((e) => hauptansicht(e) === "Plan/Dienstplan")) {
      for (const m of ohneKommentare(lies(x.datei)).matchAll(/var\(--v4-r-([a-z]+)\)/g)) {
        gesehen++;
        expect(stufen, `${x.datei}: --v4-r-${m[1]}`).toContain(m[1]);
      }
    }
    expect(gesehen).toBeGreaterThanOrEqual(26);
  }, 60000);

  /* Review #440 (Befund 1): „Stufe gültig“ allein ließe eine falsche Zuordnung durch (z. B. mittel → gross). Die
     Tabelle legt je Datei die Stufe jeder Stelle in Quelltextreihenfolge fest, mit altem Wert und Kante; die
     Zuordnungsregel prüft die Tabelle selbst. */
  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel (Review #440)", () => {
    for (const [datei, stellen] of Object.entries(PLAN_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.keys(PLAN_ZUORDNUNG).sort()).toEqual([...GEAENDERT].sort());
    expect(Object.values(PLAN_ZUORDNUNG).flat()).toHaveLength(26);
  });

  it("die Zuordnungsregel selbst: gleicher Wert gleiche Stufe, sonst die nächste; Pille nur ab halber Kante", () => {
    expect([8, 12, 18, 999].map((w) => regelStufe(w))).toEqual(["klein", "mittel", "gross", "pille"]);
    expect([5, 6, 9, 10, 14, 16].map((w) => regelStufe(w))).toEqual(["klein", "klein", "klein", "mittel", "mittel", "gross"]);
    expect(regelStufe(4, 8)).toBe("pille");
    expect(regelStufe(3, 7)).toBe("klein");
  });

  it("die geänderten Dateien führen keinen Übergang ein (V4-2d)", () => {
    for (const d of GEAENDERT) expect(ohneKommentare(lies(d)), d).not.toMatch(/transition/i);
  });
});

describe("V4-3b Plan/Dienstplan: Darstellung", () => {
  const KLEIN = "border-radius:var(--v4-r-klein)";

  it("Änderungsübersicht: Rahmen mit kleiner Radiusstufe, Name und Rolle unverändert, Farbe folgt dem Umfeld", () => {
    const x = renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "leitung",
      uebersicht: { status: "ok", ereignisse: [], zaehler: {} } }));
    expect(x).toContain(`aria-label="${AENDERUNG_TEXTE.titel}"`);
    expect(x).toContain(KLEIN);
    expect(x).toContain("border:1px solid currentColor");
    expect(x).toContain(`role="status"`);
    expect(renderToStaticMarkup(h(Aenderungsuebersicht, { rolle: "betriebsrat" }))).toBe("");
  });

  it("KI-Entwurf: jeder Zustand im Rahmen mit kleiner Radiusstufe, Name unverändert", () => {
    for (const zustand of ["leer", "laedt", "rueckfall", "fehler"]) {
      const x = renderToStaticMarkup(h(KiEntwurf, { rolle: "planer", zustand }));
      expect(x, zustand).toContain(`aria-label="Intelligence"`);
      expect(x, zustand).toContain(KLEIN);
      expect(x, zustand).toContain("border:1px solid currentColor");
    }
    expect(renderToStaticMarkup(h(KiEntwurf, { rolle: "kunde" }))).toBe("");
  });

  it("Team-Auslastung ohne Istdaten: kleine Radiusstufe, Klasse und Text unverändert", () => {
    const x = renderToStaticMarkup(h(TeamAuslastungLeiste, { ta: { personen: 3, nichtVerfuegbar: true } }));
    expect(x).toContain(`class="noprint"`);
    expect(x).toContain(KLEIN);
    expect(x).toContain(`Team-Auslastung: ${ISTDATEN_TEXT}`);
    expect(x).not.toMatch(/border-radius:\d/);
  });

  it("Tagesdetail-Feiertagsband: Fläche aus der Palette (kein rgba), Schrift >= 4,5:1 hell und dunkel", () => {
    const q = ohneKommentare(lies("src/ansichten/tagesdetail.jsx"));
    expect(q).not.toMatch(/rgba?\(/);
    expect(q).toMatch(/background:\s*C\.dangerLight,\s*\n?\s*color:\s*C\.danger\b/);
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      expect(kontrastVon(p.danger, p.dangerLight), thema).toBeGreaterThanOrEqual(4.5);
    }
  });
});
