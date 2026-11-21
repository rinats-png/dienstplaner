/* ==========================================================================
   V4-3b (dritter Schnitt) — Hauptansicht Zeit/Abrechnung: Form-Literale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung,
   keine Farbänderung (Zeit/Abrechnung ist schon farbrein). Zuordnung wie Plan und Personal
   (pruefungen/v4-radiusstufen.mjs). Die Abrechnungslogik ist nicht Gegenstand; nur Inline-Stile ändern sich.

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): Form-Literale nur die begründete Ausnahme (Legendenfeld der Belastbarkeit:
       26×16 px, Radius 4; die kleinste Stufe 8 px ist >= halbe Kante und machte das Feld zur Kapsel); „ohne V4-Form“
       nur noch ungeplanthinweis.jsx (Inhalt ohne eigene Fläche, die Form trägt der Aufrufer, Nachtrag V4-3b Zeit);
     - feste Tabelle je Datei: Stufe jeder Stelle; die Regel prüft die Tabelle; alt/kante gegen die Basis (B2);
     - kein neuer Übergang (V4-2d): einziger Übergang bleibt wörtlich `width .25s` (Urlaubsplanung geteilt);
     - Darstellung (serverseitig gerendert): Kontoblatt mit großer Stufe, Endpunkt als Pille, Text unverändert.

   Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";
import { Kontoblatt } from "../src/ansichten/kontoblatt.jsx";
import { regelStufe, stufenIn, basisText, abgleichMitBasis } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan #440 und Personal #442). */
const BASIS = "c11a6a72";

/** Begründete Ausnahme (kein passender Token): Legendenfeld 26×16 px mit Radius 4 in der Belastbarkeit. Die kleinste
 *  Stufe (8 px) ist >= halbe Kante (8) und machte das Feld zur Kapsel — das wäre Neugestaltung. Folgepaket V4-3d. */
const AUSNAHMEN = { "src/ansichten/belastbarkeit.jsx": 1 };

/** Ohne V4-Form bleibt nur der Inhaltsbaustein ohne eigene Fläche (Rahmen: Card in dienstkarte.jsx, MKarte in mobil.jsx). */
const OHNE_FORM = ["src/ansichten/ungeplanthinweis.jsx"];

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px; "50 %" als halbe Kante);
 *  kante = kleinere Kante, falls fest. */
const ZEIT_ZUORDNUNG = {
  "src/ansichten/abrechnungsdaten.jsx": [],
  "src/ansichten/antraege.jsx": [{ wo: "Statusleiste Breite 4", alt: 2, kante: 4, stufe: "pille" }],
  "src/ansichten/antraegegeteilt.jsx": [{ wo: "Wochenzeile", alt: 9, stufe: "klein" },
    { wo: "Auslastungsbalken Höhe 22", alt: 6, kante: 22, stufe: "klein" }],
  "src/ansichten/auftraggeberbericht.jsx": [],
  "src/ansichten/belastbarkeit.jsx": [{ wo: "Wochenzeile", alt: 10, stufe: "mittel" },
    { wo: "Dienstbalken Höhe 26", alt: 6, kante: 26, stufe: "klein" }, { wo: "Tabelle Raster", alt: 8, stufe: "klein" }],
  "src/ansichten/belastung.jsx": [],
  "src/ansichten/datenmitnahme.jsx": [],
  "src/ansichten/kontoblatt.jsx": [{ wo: "Hinweis ohne Werte", alt: 24, stufe: "gross" },
    { wo: "Blatt", alt: 24, stufe: "gross" }, { wo: "Endpunkt 10×10 (50 %)", alt: 5, kante: 10, stufe: "pille" }],
  "src/ansichten/korrekturantraege.jsx": [],
  "src/ansichten/korrekturen.jsx": [],
  "src/ansichten/korrekturoffene.jsx": [],
  "src/ansichten/krankmeldung.jsx": [],
  "src/ansichten/krankmeldungen-offen.jsx": [],
  "src/ansichten/lohnausgabe.jsx": [],
  "src/ansichten/monatsabschluss.jsx": [{ wo: "Rückfrage-Kasten", alt: 6, stufe: "klein" }],
  "src/ansichten/monatskorrektur.jsx": [],
  "src/ansichten/stempelpuffer.jsx": [],
  "src/ansichten/stempeluhr.jsx": [],
  "src/ansichten/tauschboerse.jsx": [],
  "src/ansichten/therapieminuten.jsx": [],
  "src/ansichten/ungeplanthinweis.jsx": [],
  "src/ansichten/urlaubsrunde.jsx": [],
  "src/ansichten/wunschdienste.jsx": [{ wo: "Tagesknopf", alt: 11, stufe: "mittel" },
    { wo: "Legendenmarke 17×17", alt: 6, kante: 17, stufe: "klein" }, { wo: "Marke 24×24", alt: 8, kante: 24, stufe: "klein" }],
};

/** Übergänge je Datei vor V4-3b (Zeit), wörtlich; dürfen sich nicht ändern (V4-2d). */
const UEBERGAENGE = { "src/ansichten/antraegegeteilt.jsx": ['transition: "width .25s"'] };

describe("V4-3b Zeit/Abrechnung: Messung", () => {
  it("Form-Literale nur die begründete Ausnahme, keine Farbliterale, ohne V4-Form nur der Inhaltsbaustein", async () => {
    const inv = await inventar();
    const zeit = jeHauptansicht(inv)["Zeit/Abrechnung"];
    expect(zeit.ohneForm).toEqual(OHNE_FORM);
    expect(zeit.farbLiterale).toBe(0);
    expect(zeit.formErreicht).toBe(zeit.sichtbar - OHNE_FORM.length);
    const mitLiteral = Object.fromEntries(inv.eintraege
      .filter((x) => hauptansicht(x) === "Zeit/Abrechnung" && x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]));
    expect(mitLiteral).toEqual(AUSNAHMEN);
    expect(zeit.voll).toBe(zeit.sichtbar - Object.keys(AUSNAHMEN).length - OHNE_FORM.length);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((e) => hauptansicht(e) === "Zeit/Abrechnung").map((e) => e.datei).sort();
    expect(Object.keys(ZEIT_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(ZEIT_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(ZEIT_ZUORDNUNG).flat()).toHaveLength(13);
  }, 60000);

  const basisDa = basisText(WURZEL, BASIS, "src/ansichten/kontoblatt.jsx") !== null;
  it.skipIf(!basisDa)("Tabellenwerte alt/kante stimmen mit dem Quelltext der Basis überein (Review #442, B2)", () => {
    for (const [datei, stellen] of Object.entries(ZEIT_ZUORDNUNG)) {
      expect(abgleichMitBasis(basisText(WURZEL, BASIS, datei), lies(datei), stellen), datei).toEqual([]);
    }
  });

  it("Ausnahme bleibt begründet: Legendenfeld 26×16 mit kleinster Stufe wäre eine Kapsel", () => {
    expect(parseFloat(V4_RADIEN.klein)).toBeGreaterThanOrEqual(16 / 2);
    const q = ohneKommentare(lies("src/ansichten/belastbarkeit.jsx"));
    expect(q.match(/width: 26, height: 16, borderRadius: 4\b/g)).toHaveLength(1);
  });

  it("kein neuer Übergang (V4-2d): Anzahl und Wert je Datei wie vorher", () => {
    for (const datei of Object.keys(ZEIT_ZUORDNUNG)) {
      const q = ohneKommentare(lies(datei));
      expect((q.match(/transition/gi) || []).length, datei).toBe((UEBERGAENGE[datei] || []).length);
      expect(q.match(/transition:\s*("[^"]*"|'[^']*'|`[^`]*`)/g) || [], datei).toEqual(UEBERGAENGE[datei] || []);
    }
  });
});

describe("V4-3b Zeit/Abrechnung: Darstellung", () => {
  const m = { einstellungen: { ausgleichGrenze: 40 } };
  const verlauf = [{ kto: 2, label: "Jan" }, { kto: 5, label: "Feb" }, { kto: 8, label: "Mär" }];

  it("Kontoblatt: Blatt mit großer Stufe, Endpunkt als Pille, kein fester Radius, Text unverändert", () => {
    const x = renderToStaticMarkup(h(Kontoblatt, { m, verlauf, jetzt: 8, trend: 6 }));
    expect(x).toContain("border-radius:var(--v4-r-gross)");
    expect(x).toContain("border-radius:var(--v4-r-pille)");
    expect(x).not.toMatch(/border-radius:(?!var\()/);
    expect(x).toContain(`aria-hidden="true"`);
    expect(x).toContain("Grenze");
  });

  it("Kontoblatt ohne Werte: ehrlicher Hinweis mit großer Stufe", () => {
    const x = renderToStaticMarkup(h(Kontoblatt, { m, verlauf: [], jetzt: NaN, trend: NaN }));
    expect(x).toContain("Für dein Stundenkonto liegen noch keine Werte vor.");
    expect(x).toContain("border-radius:var(--v4-r-gross)");
    expect(x).not.toMatch(/border-radius:(?!var\()/);
  });
});
