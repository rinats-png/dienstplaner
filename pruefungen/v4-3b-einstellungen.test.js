/* ==========================================================================
   V4-3b (vierter Schnitt) — Hauptansicht Einstellungen/Verwaltung: Form-Literale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung,
   keine Farbänderung (die Hauptansicht ist schon farbrein). Zuordnung wie Plan, Personal und Zeit
   (pruefungen/v4-radiusstufen.mjs).

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): Form-Literale nur die begründete Ausnahme (Normmarke der Prüfung, Höhe aus
       der Schrift etwa 16 px, Radius 5; die kleinste Stufe 8 px ist >= halbe Höhe und machte die Marke zur Kapsel);
       „ohne V4-Form“ nur noch einsatzregelliste.jsx (Inhalt ohne eigene Fläche, die Form trägt die Personalakte);
     - feste Tabelle je Datei: Stufe jeder Stelle; die Regel prüft die Tabelle; alt/kante gegen die Basis aus der
       eingecheckten Fixture (Review #443 B1, auch ohne Git-Verlauf), git show als Gegenprobe;
     - kein neuer Übergang (V4-2d): die Hauptansicht hat keinen Übergang, und es kommt keiner dazu;
     - Darstellung (serverseitig gerendert): Planungsreife mit Stufe mittel, Einladung einlösen mit mittel und pille.

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
import { Planungsreife } from "../src/ansichten/planungsreife.jsx";
import { EinladungAnnehmen } from "../src/ansichten/einladungen.jsx";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, fixtureBefunde, literalSumme }
  from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan #440, Personal #442 und Zeit #443). */
const BASIS = "8f15631d";
const SCHNITT = "Einstellungen/Verwaltung";

/** Begründete Ausnahme (Kapsel-Effekt): Normmarke der Rechtsquelle in der Prüfung (`pruefung.jsx`), Schrift 11,5 px,
 *  Innenabstand 1 px oben/unten, Radius 5. Die Höhe folgt der Schrift (etwa 16 px). Die kleinste Stufe (8 px) ist
 *  >= halbe Höhe und machte die eckige Marke zur Kapsel — das wäre Neugestaltung. Folgepaket V4-3d. */
const AUSNAHMEN = { "src/ansichten/pruefung.jsx": 1 };

/** Ohne V4-Form bleibt nur der Inhaltsbaustein ohne eigene Fläche (Rahmen: Personalakte, `personalakte.jsx`). */
const OHNE_FORM = ["src/ansichten/einsatzregelliste.jsx"];

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px; "50 %" als halbe Kante);
 *  kante = kleinere Kante, falls fest. */
const EINSTELLUNGEN_ZUORDNUNG = {
  "src/ansichten/assistent.jsx": [],
  "src/ansichten/assistent2.jsx": [{ wo: "Ablage Tag Schichtfolge", alt: 12, stufe: "mittel" },
    { wo: "Tagesknopf 34×34", alt: 10, kante: 34, stufe: "mittel" },
    { wo: "Farbpunkt Gruppe 10×10", alt: 5, kante: 10, stufe: "pille" }],
  "src/ansichten/datenschutz.jsx": [],
  "src/ansichten/einladungen.jsx": [{ wo: "Einladung (Code)", alt: 10, stufe: "mittel" },
    { wo: "Einladung als Link (Code)", alt: 10, stufe: "mittel" }, { wo: "Zugangscode", alt: 12, stufe: "mittel" },
    { wo: "Eingabe Einladung", alt: 12, stufe: "mittel" }, { wo: "Knopf Einladung einlösen", alt: 999, stufe: "pille" }],
  "src/ansichten/einsatzregelliste.jsx": [],
  "src/ansichten/einstellungen.jsx": [{ wo: "Kalenderverweis (Code)", alt: 8, stufe: "klein" }],
  "src/ansichten/einwilligungen.jsx": [],
  "src/ansichten/geo-schalter.jsx": [],
  "src/ansichten/jugendschutz-schalter.jsx": [],
  "src/ansichten/lenkzeiten.jsx": [],
  "src/ansichten/offline-schalter.jsx": [],
  "src/ansichten/planfreigabeschalter.jsx": [],
  "src/ansichten/planungsreife.jsx": [{ wo: "Kasten Planungsreife", alt: 10, stufe: "mittel" }],
  "src/ansichten/pruefung.jsx": [],
  "src/ansichten/regelwerk.jsx": [],
  "src/ansichten/sicherungausserhaus.jsx": [{ wo: "Schlüssel (Code)", alt: 8, stufe: "klein" },
    { wo: "Befehl (pre)", alt: 8, stufe: "klein" }],
  "src/ansichten/sicherungenverwalten.jsx": [],
  "src/ansichten/tarifwerk.jsx": [],
  "src/ansichten/untergrenzen.jsx": [],
  "src/ansichten/vorgaben.jsx": [],
  "src/ansichten/warndialog.jsx": [{ wo: "Hinweis Abwesenheit", alt: 10, stufe: "mittel" }],
};

describe("V4-3b Einstellungen/Verwaltung: Messung", () => {
  it("Form-Literale nur die begründete Ausnahme, keine Farbliterale, ohne V4-Form nur der Inhaltsbaustein", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.ohneForm).toEqual(OHNE_FORM);
    expect(e.farbLiterale).toBe(0);
    expect(e.formErreicht).toBe(e.sichtbar - OHNE_FORM.length);
    const mitLiteral = Object.fromEntries(inv.eintraege
      .filter((x) => hauptansicht(x) === SCHNITT && x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]));
    expect(mitLiteral).toEqual(AUSNAHMEN);
    expect(e.voll).toBe(e.sichtbar - Object.keys(AUSNAHMEN).length - OHNE_FORM.length);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort();
    expect(Object.keys(EINSTELLUNGEN_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(EINSTELLUNGEN_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(EINSTELLUNGEN_ZUORDNUNG).flat()).toHaveLength(13);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture (Review #442 B2, #443 B1)", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(abgleichMitFixture(fx, SCHNITT, EINSTELLUNGEN_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf sichtbar übersprungen", (ctx) => {
    const g = gitGegenprobe(WURZEL, ladeBasisFixture(WURZEL), SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Ausnahme bleibt begründet: Normmarke mit kleinster Stufe wäre eine Kapsel", () => {
    const q = ohneKommentare(lies("src/ansichten/pruefung.jsx"));
    expect(q.match(/padding: "1px 7px", borderRadius: 5\b/g)).toHaveLength(1);
    /* Schrift der Zeile 11,5 px; Zeilenhöhe „normal“ etwa 1,2 → Höhe etwa 11,5 × 1,2 + 2 (Innenabstand) = 15,8 px
       (mit Rand bei betrieblicher Quelle 17,8 px). Halbe Höhe 7,9 bzw. 8,9: die kleinste Stufe 8 px machte die Marke
       zur Kapsel oder fast. Die echte Höhe misst das E2E (e2e/v4-3b-einstellungen-form.spec.mjs). */
    expect(q).toMatch(/fontSize: 11\.5, color: C\.dim, marginTop: 5,\s*display: "flex"/);
    expect(parseFloat(V4_RADIEN.klein)).toBeGreaterThanOrEqual((11.5 * 1.2 + 2) / 2);
  });

  it("kein neuer Übergang (V4-2d): keine Datei der Hauptansicht hat einen Übergang", () => {
    for (const datei of Object.keys(EINSTELLUNGEN_ZUORDNUNG)) {
      expect((ohneKommentare(lies(datei)).match(/transition/gi) || []).length, datei).toBe(0);
    }
  });
});

describe("V4-3b Basis-Fixture: Plausibilität ohne Git (Review #443 B1)", () => {
  it("jeder Schnitt mit vollem Basis-Commit, Prüfsummen stimmen, Mutation der Fixture fällt auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    for (const s of Object.keys(fx.schnitte)) expect(fixtureBefunde(fx, s), s).toEqual([]);
    const kopie = JSON.parse(JSON.stringify(fx));
    const e = kopie.schnitte[SCHNITT].dateien["src/ansichten/planungsreife.jsx"];
    e.literale[0].wert = "8";
    expect(fixtureBefunde(kopie, SCHNITT)).toEqual(["src/ansichten/planungsreife.jsx: Prüfsumme der Literale stimmt nicht"]);
    e.literaleSha256 = literalSumme(e.literale);
    expect(abgleichMitFixture(kopie, SCHNITT, { "src/ansichten/planungsreife.jsx":
      EINSTELLUNGEN_ZUORDNUNG["src/ansichten/planungsreife.jsx"] }, lies)).not.toEqual([]);
    kopie.schnitte[SCHNITT].basis = "0".repeat(40);
    expect(fixtureBefunde(kopie, SCHNITT)[0]).toMatch(/^Einstellungen\/Verwaltung: Basis 0+, erwartet 8f15631d/);
  });

  it("Mutation der Tabelle (alt, kante) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const t = (stellen) => ({ "src/ansichten/assistent2.jsx": stellen });
    const echt = EINSTELLUNGEN_ZUORDNUNG["src/ansichten/assistent2.jsx"];
    expect(abgleichMitFixture(fx, SCHNITT, t(echt), lies)).toEqual([]);
    expect(abgleichMitFixture(fx, SCHNITT, t(echt.map((s, i) => (i === 0 ? { ...s, alt: 10 } : s))), lies))
      .toEqual(["src/ansichten/assistent2.jsx: Ablage Tag Schichtfolge: Basis 12, Tabelle alt 10"]);
    expect(abgleichMitFixture(fx, SCHNITT, t(echt.map((s, i) => (i === 1 ? { ...s, kante: 32 } : s))), lies))
      .toEqual(["src/ansichten/assistent2.jsx: Tagesknopf 34×34: kante 32 nicht im Stilobjekt der Basis"]);
  });
});

describe("V4-3b Einstellungen/Verwaltung: Darstellung", () => {
  it("Planungsreife: Kasten mit Stufe mittel, kein fester Radius, Region und Text unverändert", () => {
    const x = renderToStaticMarkup(h(Planungsreife, { m: { personen: [] }, ym: "2026-12", heute: "2026-11-21" }));
    expect(x).toContain(`role="region" aria-label="Planungsreife"`);
    expect(x).toContain("border-radius:var(--v4-r-mittel)");
    expect(x).not.toMatch(/border-radius:(?!var\()/);
    expect(x).toContain("<b>Planungsreife</b>");
  });

  it("Einladung einlösen: Eingabe mittel, Knopf pille, kein fester Radius, Beschriftung unverändert", () => {
    const x = renderToStaticMarkup(h(EinladungAnnehmen, { api: {} }));
    expect(x).toContain("border-radius:var(--v4-r-mittel)");
    expect(x).toContain("border-radius:var(--v4-r-pille)");
    expect(x).not.toMatch(/border-radius:(?!var\()/);
    expect(x).toContain(`<label for="einladung"`);
    expect(x).toContain("Einladung einlösen");
  });
});
