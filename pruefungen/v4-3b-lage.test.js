/* ==========================================================================
   V4-3b (fünfter Schnitt) — Hauptansicht Lage/Dashboard: Form-Literale auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung,
   keine Farbänderung (die Hauptansicht ist schon farbrein). Zuordnung wie Plan, Personal, Zeit und Einstellungen
   (pruefungen/v4-radiusstufen.mjs).

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): Form-Literale nur die begründete Ausnahme (Legendenquadrat der Zeitachse,
       14×14 px, Radius 5; die kleinste Stufe 8 px ist > halbe Kante 7 und machte das Quadrat zum Kreis); alle 13
       Dateien mit V4-Form;
     - feste Tabelle je Datei: Stufe jeder Stelle; die Regel prüft die Tabelle; alt/kante gegen die Basis aus der
       eingecheckten Fixture (Review #443 B1, auch ohne Git-Verlauf), git show als Gegenprobe;
     - kein neuer Übergang (V4-2d): die zwei Übergänge der Basis bleiben wörtlich, es kommt keiner dazu;
     - Darstellung (serverseitig gerendert): Notrufe mit Statuspunkt als Pille, Text und Knopf unverändert.

   Keine Uhr, kein Netz (die Notruf-Zeit ist fest; nur der Text „vor … Min“ hängt von der Uhr ab und wird nicht geprüft).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";
import { Notrufe } from "../src/ansichten/notrufe.jsx";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan, Personal, Zeit, Einstellungen und A11Y-1). */
const BASIS = "bf253963";
const SCHNITT = "Lage/Dashboard";

/** Begründete Ausnahme (Kreis-Effekt, kein passender Token): Legendenquadrat je Dienstart unter der Zeitachse
 *  (`zeitachse.jsx`, 14×14 px, Radius 5). Die kleinste Stufe (8 px) ist > halbe Kante (7) und machte das abgerundete
 *  Quadrat zum Kreis — das wäre Neugestaltung. Folgepaket V4-3d. */
const AUSNAHMEN = { "src/ansichten/zeitachse.jsx": 1 };

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const LAGE_ZUORDNUNG = {
  "src/ansichten/ablauf.jsx": [{ wo: "Station im Ablaufdiagramm", alt: 16, stufe: "gross" },
    { wo: "Stationsnummer 20×20", alt: 10, kante: 20, stufe: "pille" },
    { wo: "Schrittpunkt Einführung Höhe 4", alt: 2, kante: 4, stufe: "pille" },
    { wo: "Stationsnummer Ablaufansicht 24×24", alt: 12, kante: 24, stufe: "pille" }],
  "src/ansichten/dienstbuch.jsx": [],
  "src/ansichten/eskalation.jsx": [],
  "src/ansichten/lagebild.jsx": [{ wo: "Farbpunkt Einsatzort 8×8", alt: 4, kante: 8, stufe: "pille" }],
  "src/ansichten/nachrichten.jsx": [],
  "src/ansichten/notizen.jsx": [],
  "src/ansichten/notrufe.jsx": [{ wo: "Statuspunkt Notruf 10×10", alt: 5, kante: 10, stufe: "pille" }],
  "src/ansichten/prioritaeten.jsx": [{ wo: "Symbol Aufgabe 34×34", alt: 11, kante: 34, stufe: "mittel" }],
  "src/ansichten/schichtuebergabe.jsx": [],
  "src/ansichten/schwarzesbrett.jsx": [],
  "src/ansichten/tagesfazit.jsx": [],
  "src/ansichten/tagesstart.jsx": [{ wo: "Fortschrittsleiste Höhe 5", alt: 3, kante: 5, stufe: "pille" },
    { wo: "Schrittmarke 24×24", alt: 12, kante: 24, stufe: "pille" },
    { wo: "Symbol Aufgabe 38×38", alt: 13, kante: 38, stufe: "mittel" }],
  "src/ansichten/zeitachse.jsx": [{ wo: "Dienstbalken Woche (Höhe >= 20)", alt: 8, stufe: "klein" },
    { wo: "Dienstbalken Personen (Zeile − 12)", alt: 9, stufe: "klein" },
    { wo: "Abwesenheit Personen (Zeile − 24)", alt: 6, stufe: "klein" },
    { wo: "Rest über Mitternacht (Zeile − 14)", alt: 7, stufe: "klein" },
    { wo: "Tagesspalte heute", alt: 8, stufe: "klein" }],
};

/** Übergänge je Datei vor V4-3b (Lage), wörtlich; dürfen sich nicht ändern (V4-2d). */
const UEBERGAENGE = {
  "src/ansichten/ablauf.jsx": ['transition: "background .25s"'],
  "src/ansichten/tagesstart.jsx": ['transition: "width .4s"'],
};

describe("V4-3b Lage/Dashboard: Messung", () => {
  it("Form-Literale nur die begründete Ausnahme, keine Farbliterale, alle Dateien mit V4-Form", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.ohneForm).toEqual([]);
    expect(e.farbLiterale).toBe(0);
    expect(e.formErreicht).toBe(e.sichtbar);
    const mitLiteral = Object.fromEntries(inv.eintraege
      .filter((x) => hauptansicht(x) === SCHNITT && x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]));
    expect(mitLiteral).toEqual(AUSNAHMEN);
    expect(e.voll).toBe(e.sichtbar - Object.keys(AUSNAHMEN).length);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort();
    expect(Object.keys(LAGE_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(LAGE_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(LAGE_ZUORDNUNG).flat()).toHaveLength(15);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture (Review #442 B2, #443 B1)", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(abgleichMitFixture(fx, SCHNITT, LAGE_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf sichtbar übersprungen", (ctx) => {
    const g = gitGegenprobe(WURZEL, ladeBasisFixture(WURZEL), SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Mutation der Tabelle (alt, kante, Stufe) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const t = (stellen) => ({ "src/ansichten/tagesstart.jsx": stellen });
    const echt = LAGE_ZUORDNUNG["src/ansichten/tagesstart.jsx"];
    expect(abgleichMitFixture(fx, SCHNITT, t(echt), lies)).toEqual([]);
    expect(abgleichMitFixture(fx, SCHNITT, t(echt.map((s, i) => (i === 2 ? { ...s, alt: 12 } : s))), lies))
      .toEqual(["src/ansichten/tagesstart.jsx: Symbol Aufgabe 38×38: Basis 13, Tabelle alt 12"]);
    expect(abgleichMitFixture(fx, SCHNITT, t(echt.map((s, i) => (i === 0 ? { ...s, kante: 6 } : s))), lies))
      .toEqual(["src/ansichten/tagesstart.jsx: Fortschrittsleiste Höhe 5: kante 6 nicht im Stilobjekt der Basis"]);
    /* Stufe: die Regel ergibt für 13 bei Kante 38 „mittel“, nicht „gross“. */
    expect(regelStufe(13, 38)).not.toBe("gross");
  });

  it("Ausnahme bleibt begründet: Legendenquadrat mit kleinster Stufe wäre ein Kreis", () => {
    const q = ohneKommentare(lies("src/ansichten/zeitachse.jsx"));
    expect(q.match(/width: 14, height: 14, borderRadius: 5\b/g)).toHaveLength(1);
    expect(parseFloat(V4_RADIEN.klein)).toBeGreaterThan(14 / 2);
  });

  it("kein neuer Übergang (V4-2d): nur die Übergänge der Basis, wörtlich", () => {
    for (const datei of Object.keys(LAGE_ZUORDNUNG)) {
      const q = ohneKommentare(lies(datei));
      const gefunden = (q.match(/transition:\s*"[^"]*"/g) || []);
      expect(gefunden, datei).toEqual(UEBERGAENGE[datei] || []);
      expect((q.match(/transition/gi) || []).length, datei).toBe((UEBERGAENGE[datei] || []).length);
    }
  });
});

describe("V4-3b Lage/Dashboard: Darstellung", () => {
  it("Notrufe: Statuspunkt mit Stufe pille, kein fester Radius, Text und Knopf unverändert", () => {
    const mandant = { personen: [{ id: "p1", vorname: "Anna", nachname: "Beispiel" }],
      notrufe: [{ id: "n1", art: "hilfe", personId: "p1", zeit: "2026-11-21T08:00:00.000Z" }] };
    const x = renderToStaticMarkup(h(Notrufe, { sitz: { mandant }, akt: {} }));
    expect(x).toContain("border-radius:var(--v4-r-pille)");
    expect(x).not.toMatch(/border-radius:(?!var\()/);
    expect(x).toContain("Hilfe angefordert");
    expect(x).toContain("Anna Beispiel");
    expect(x).toContain("Übernehme ich");
  });
});
