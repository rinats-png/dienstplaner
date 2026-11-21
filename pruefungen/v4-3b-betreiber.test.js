/* ==========================================================================
   V4-3b (sechster Schnitt) — Hauptansicht Betreiberkonsole: Form-Literale und Farbliteral auf Tokens

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…), Farben aus der Palette C.
   Keine Neugestaltung. Zuordnung wie Plan, Personal, Zeit, Einstellungen und Lage (pruefungen/v4-radiusstufen.mjs).

   Die Betreiberkonsole ist sicherheitsrelevant (Mandantenanlage mit zweitem Faktor, Zugangscodes). Deshalb zusätzlich:
   Rückrechnung je Datei — der heutige Quelltext, mit den alten Werten aus der festen Tabelle zurückgesetzt, ergibt
   byte-gleich den Basis-Quelltext (SHA-256 aus der eingecheckten Fixture, ohne Git). Damit ist belegt: Der Schnitt
   ändert nur Radiuswerte und das eine Farbliteral, nichts an Fachlogik, Rollen, Accessible Names, Klassennamen, Fokus.

   Geprüft:
     - Messung (werkzeug/v4-inventar.mjs): keine Form- und keine Farbliterale; alle 12 Dateien mit V4-Form und
       „voll V4“ (= Form und Farbe ohne Literale; Inline-Stile zählen nicht);
     - feste Tabelle je Datei: Stufe jeder Stelle; die Regel prüft die Tabelle; alt/kante gegen die Basis aus der
       Fixture (auch ohne Git-Verlauf), git show als Gegenprobe;
     - Rückrechnung auf den Basis-Quelltext (siehe oben);
     - kein neuer Übergang (V4-2d): keine Datei der Hauptansicht hat einen Übergang, vorher wie nachher;
     - Farbe: Monatspreis-Kachel der Mandantenliste C.bg statt rgba(43,52,64,.06); Schriftkontrast darauf hell und
       dunkel nicht schlechter als vorher (1.4.3);
     - Darstellung (serverseitig gerendert): Mandantenliste und Mandantendetail mit Stufe klein, kein fester Radius in
       den betroffenen Stellen, Texte und Knöpfe unverändert; Mandantenanlage: Feld des zweiten Faktors unverändert.

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { v4AlsAltePalette } from "../src/v4/tokens.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { BetreiberMandanten } from "../src/ansichten/betreibermandanten.jsx";
import { BetreiberDetail } from "../src/ansichten/betreiberdetail.jsx";
import { MandantNeuAnlegen } from "../src/ansichten/mandantneuanlegen.jsx";
import { demobestand } from "../src/lib/fachlogik.js";
import { C } from "../src/farben.js";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, sha256 } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan bis Lage und REL-0-Installer #447). */
const BASIS = "7ca40646";
const SCHNITT = "Betreiberkonsole";

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const BETREIBER_ZUORDNUNG = {
  "src/ansichten/adressaenderungen.jsx": [],
  "src/ansichten/betreiber-tarife.jsx": [],
  "src/ansichten/betreiberdetail.jsx": [
    { wo: "Symbol Grundgebühr 24×24", alt: 8, kante: 24, stufe: "klein" },
    { wo: "Symbol zusätzliche Planer 24×24", alt: 8, kante: 24, stufe: "klein" },
    { wo: "Symbol Standortzuschlag 24×24", alt: 8, kante: 24, stufe: "klein" },
    { wo: "Symbol Paket 24×24", alt: 8, kante: 24, stufe: "klein" }],
  "src/ansichten/betreibermandanten.jsx": [{ wo: "Rollenkürzel 21×21", alt: 7, kante: 21, stufe: "klein" }],
  "src/ansichten/betreiberrechnungen.jsx": [],
  "src/ansichten/demozugaenge.jsx": [],
  "src/ansichten/mandantanlegen.jsx": [],
  "src/ansichten/mandantenrechner.jsx": [],
  "src/ansichten/mandantneuanlegen.jsx": [
    { wo: "Meldung Mandant angelegt", alt: 12, stufe: "mittel" },
    { wo: "Zugangscode", alt: 8, stufe: "klein" },
    { wo: "Auswahl Zugangsart", alt: 10, stufe: "mittel" },
    { wo: "Fehlermeldung (role=alert)", alt: 10, stufe: "mittel" }],
  "src/ansichten/pakete.jsx": [],
  "src/ansichten/preisgestaltung.jsx": [{ wo: "Zeile Aussetzung", alt: 10, stufe: "mittel" }],
  "src/ansichten/selbststarts.jsx": [],
};

/** Das eine Farbliteral der Basis (Monatspreis-Kachel der Mandantenliste) und sein Token. */
const FARBE = { datei: "src/ansichten/betreibermandanten.jsx",
  vorher: 'style={{ padding: "12px 14px", background: "rgba(43,52,64,.06)" }}',
  nachher: 'style={{ padding: "12px 14px", background: C.bg }}' };

/** Deckende Mischung von rgba(43,52,64,a) auf `grund` (Hex), wie vorher dargestellt. */
const altMisch = (a, grund) => {
  const g = [1, 3, 5].map((i) => parseInt(grund.slice(i, i + 2), 16));
  return "#" + [43, 52, 64].map((c, i) => Math.round(c * a + g[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
};

/** Heutiger Quelltext mit den alten Werten der Tabelle (und dem alten Farbliteral) zurückgesetzt. */
function rueckgerechnet(datei) {
  const stellen = BETREIBER_ZUORDNUNG[datei];
  let i = 0;
  let t = lies(datei).replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    const s = stellen[i++];
    if (!s || s.stufe !== stufe) return m;          // fällt unten über die Prüfsumme auf
    return `borderRadius: ${s.alt}`;
  });
  if (datei === FARBE.datei) t = t.replace(FARBE.nachher, FARBE.vorher);
  return { text: t, ersetzt: i };
}

describe("V4-3b Betreiberkonsole: Messung", () => {
  it("keine Form- und keine Farbliterale, alle 12 Dateien mit V4-Form und „voll V4“", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.sichtbar).toBe(12);
    expect(e.ohneForm).toEqual([]);
    expect(e.farbLiterale).toBe(0);
    expect(e.farbrein).toBe(e.sichtbar);
    expect(e.formErreicht).toBe(e.sichtbar);
    const mitLiteral = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT && x.formLiterale > 0).map((x) => x.datei);
    expect(mitLiteral).toEqual([]);
    expect(e.voll).toBe(e.sichtbar);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort();
    expect(Object.keys(BETREIBER_ZUORDNUNG).sort()).toEqual(dateien);
    for (const [datei, stellen] of Object.entries(BETREIBER_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(BETREIBER_ZUORDNUNG).flat()).toHaveLength(10);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture (Review #442 B2, #443 B1)", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(abgleichMitFixture(fx, SCHNITT, BETREIBER_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf sichtbar übersprungen", (ctx) => {
    const g = gitGegenprobe(WURZEL, ladeBasisFixture(WURZEL), SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radiuswerte und das Farbliteral geändert, sonst byte-gleich zur Basis (ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    for (const datei of Object.keys(BETREIBER_ZUORDNUNG)) {
      const r = rueckgerechnet(datei);
      expect(r.ersetzt, `${datei}: Anzahl Stufen`).toBe(BETREIBER_ZUORDNUNG[datei].length);
      expect(sha256(r.text), `${datei}: zurückgerechnet = Basis`).toBe(fx.dateien[datei].sha256);
    }
  });

  it("Mutation der Tabelle (alt, kante, Stufe) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const d = "src/ansichten/mandantneuanlegen.jsx";
    const echt = BETREIBER_ZUORDNUNG[d];
    const t = (stellen) => ({ [d]: stellen });
    expect(abgleichMitFixture(fx, SCHNITT, t(echt), lies)).toEqual([]);
    expect(abgleichMitFixture(fx, SCHNITT, t(echt.map((s, i) => (i === 2 ? { ...s, alt: 12 } : s))), lies))
      .toEqual([`${d}: Auswahl Zugangsart: Basis 10, Tabelle alt 12`]);
    const m = "src/ansichten/betreibermandanten.jsx";
    expect(abgleichMitFixture(fx, SCHNITT, { [m]: [{ ...BETREIBER_ZUORDNUNG[m][0], kante: 22 }] }, lies))
      .toEqual([`${m}: Rollenkürzel 21×21: kante 22 nicht im Stilobjekt der Basis`]);
    /* Stufe: 10 liegt gleich weit von klein (8) und mittel (12); die Regel nimmt die größere. */
    expect(regelStufe(10)).toBe("mittel");
    expect(regelStufe(7, 21)).toBe("klein");
  });

  it("kein neuer Übergang (V4-2d): keine Datei der Hauptansicht hat einen Übergang", () => {
    for (const datei of Object.keys(BETREIBER_ZUORDNUNG)) {
      expect((ohneKommentare(lies(datei)).match(/transition/gi) || []).length, datei).toBe(0);
    }
  });
});

describe("V4-3b Betreiberkonsole: Farbe", () => {
  it("Monatspreis-Kachel: C.bg statt rgba-Literal, sonst unverändert", () => {
    const q = ohneKommentare(lies(FARBE.datei));
    expect(q).not.toMatch(/rgba?\(|#[0-9a-fA-F]{3,8}\b/);
    expect(q.split(FARBE.nachher)).toHaveLength(2);
  });

  it("Schrift auf der Kachel hell und dunkel nicht schlechter als vorher (1.4.3); Kachel gegen Fläche festgeschrieben", () => {
    const werte = {};
    for (const thema of ["hell", "dunkel"]) {
      const p = v4AlsAltePalette(thema);
      const vorher = altMisch(0.06, p.flaeche);
      for (const f of ["text", "dim", "dimmer", "accent"]) {
        expect(kontrastVon(p[f], p.bg), `${thema}: ${f}`).toBeGreaterThanOrEqual(kontrastVon(p[f], vorher));
      }
      expect(kontrastVon(p.dimmer, p.bg), `${thema}: kleinste Schrift (10,5 px) >= 4,5:1`).toBeGreaterThanOrEqual(4.5);
      const r = (x) => Math.round(x * 1000) / 1000;
      werte[thema] = { vorher: r(kontrastVon(vorher, p.flaeche)), jetzt: r(kontrastVon(p.bg, p.flaeche)) };
    }
    /* Kachel gegen die Kartenfläche (kein 1.4.11-Fall: die Kachel trägt den Rahmen der Klasse .karte, unverändert):
       hell praktisch gleich, dunkel war die Tönung vorher kaum sichtbar. */
    expect(werte).toEqual({ hell: { vorher: 1.111, jetzt: 1.11 }, dunkel: { vorher: 1.003, jetzt: 1.224 } });
  });
});

describe("V4-3b Betreiberkonsole: Darstellung", () => {
  const db = () => demobestand();

  it("Mandantenliste: Rollenkürzel klein, Monatspreis-Kachel C.bg, kein fester Radius, Texte unverändert", () => {
    const x = renderToStaticMarkup(h(BetreiberMandanten, { db: db(), akt: {}, oeffne: () => {} }));
    expect(x).toContain("border-radius:var(--v4-r-klein)");
    expect(x).not.toMatch(/border-radius:7px/);
    expect(x).not.toContain("rgba(43,52,64");
    expect(x).toContain(`background:${C.bg}`);
    expect(x).toContain("Monatspreis");
    expect(x).toContain("Mandant anlegen");
    expect(x).toContain("Diese Ansicht enthält keine personenbezogenen Daten.");
  });

  it("Mandantendetail: Symbole der Abrechnung klein, kein fester Radius 8, Überschrift unverändert", () => {
    const b = db();
    const x = renderToStaticMarkup(h(BetreiberDetail, { db: b, akt: {}, mandantId: b.mandanten[0].id, zurueck: () => {} }));
    expect(x).toContain("Aktuelle Abrechnung");
    expect(x).toContain("width:24px;height:24px;border-radius:var(--v4-r-klein)");
    expect(x).not.toMatch(/border-radius:8px/);
  });

  it("Mandantenanlage: Feld des zweiten Faktors und Knöpfe unverändert, kein fester Radius aus der Datei", () => {
    const x = renderToStaticMarkup(h(MandantNeuAnlegen, { db: db(), akt: {}, onFertig: () => {} }));
    expect(x).toContain("Code aus der Authenticator-App (zweiter Faktor)");
    expect(x).toContain("Anlegen und Zugänge erzeugen");
    expect(x).toContain("Abbrechen");
    expect(x).toContain("border-radius:var(--v4-r-mittel)");
    expect(x).not.toMatch(/border-radius:10px/);
  });
});
