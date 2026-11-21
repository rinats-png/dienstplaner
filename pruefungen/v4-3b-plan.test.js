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
