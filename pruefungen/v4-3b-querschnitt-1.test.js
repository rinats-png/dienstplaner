/* ==========================================================================
   V4-3b (zwölfter Schnitt, Teil 1) — Zeile Querschnitt/Bausteine: Form-Literale auf Radiusstufen

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung.
   Zuordnung wie Plan bis Branchenmodule (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die
   nächste (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Teilung: Die Zeile hat laut Inventar 33 Dateien (24 sichtbar) mit 42 Form-Literalen (40 Radien, 2 Schatten) in
   12 Dateien und 10 Farbliteralen. Das ist zu groß für einen Schnitt. Teil 1 = die vier Dateien mit den meisten
   Form-Literalen (App.jsx 10, ui/diagramme.jsx 7, gestalt/bausteine.jsx 5, ui/farbwahl.jsx 4; zusammen 26 Literale,
   davon 24 Radien), jede Datei ganz. Teil 2 = die übrigen acht Dateien mit 16 Radien (TEIL2 unten); geprüft in
   v4-3b-querschnitt-2.test.js. Seit Teil 2 prüft dieser Test Messung und Rückrechnung nur noch für die Dateien ohne
   Teil 2 (die Werte der Zeile nach Teil 1 stehen im Kommentar der Messung).
   Der globale Stil (CSS in App.jsx und gestalt/stil.js) gehört nicht dazu (V4-3d).

   Ergebnis Teil 1: 18 Radien auf Stufen, 6 Radien und 2 Schatten bleiben als begründete Ausnahme (Kapsel-Effekt bzw.
   Schatten außerhalb des Auftrags), alle 6 Farbliterale der vier Dateien bleiben (kein Token mit nicht schlechterem
   Kontrast hell und dunkel, gemessen unten; Druckstil global).

   Beleg „nichts außer Radius“: Rückrechnung je Datei (alle 33 der Zeile, auch Teil 2) — der heutige Quelltext, mit
   den alten Werten aus der festen Tabelle zurückgesetzt, ergibt byte-gleich den Basis-Quelltext (SHA-256 aus der
   Fixture, ohne Git). Dazu ein Attributwächter (Feld- und ARIA-Attribute in Reihenfolge, Prüfsumme auf der Basis
   gemessen). Grenze des Attributwächters (Hinweise aus #460/#463/#465): Er erfasst Boolean- und Spread-Attribute,
   Stilschlüssel, className und onClick nicht; das deckt die Rückrechnung (byte-gleich) ab.

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { LinienDiagramm, BalkenDiagramm, AbweichungsDiagramm, Schritte, ModellVorschau } from "../src/ui/diagramme.jsx";
import { Sparkline, Bogen } from "../src/gestalt/bausteine.jsx";
import { Farbwahl, Farbpunkt } from "../src/ui/farbwahl.jsx";
import { PALETTE } from "../src/lib/fachlogik.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { V4_RADIEN, v4AlsAltePalette } from "../src/v4/tokens.js";
import { regelStufe, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, fixtureBefunde, sha256, SCHNITTE, ansichtVon }
  from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** WP-I16: Ausnahmeliste „neu seit der Basis, ohne Literale“: Dateien, die es auf der Basis nicht gab und deshalb nicht in der
 *  (historischen, unveränderten) Fixture stehen. Genau eine Datei, 0 Form-/Farbliterale (Test unten prüft beides). */
const NEU_SEIT_BASIS = Object.freeze(["src/ansichten/ki-steuerung.jsx", "src/ansichten/anheftungen.jsx", "src/ansichten/planer-steuerung.jsx", "src/ansichten/planer-vorschlag.jsx"]);

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Schnitt 1–11, #465). */
const BASIS = "63a3469b";
const SCHNITT = "Querschnitt/Bausteine (Teil 1)";
const ZEILE = "Querschnitt/Bausteine";
const APP = "src/App.jsx";
const DIAGRAMME = "src/ui/diagramme.jsx";
const GESTALT = "src/gestalt/bausteine.jsx";
const FARBWAHL = "src/ui/farbwahl.jsx";
const TEIL1 = [APP, DIAGRAMME, GESTALT, FARBWAHL];
/** Teil 2 (offen): übrige Dateien der Zeile mit Form-Literalen (Anzahl, alle Radien); in diesem Schnitt unverändert. */
const TEIL2 = {
  "src/ansichten/handbuch.jsx": 3, "src/ansichten/kommandoleiste.jsx": 2, "src/ansichten/tourleiste.jsx": 2,
  "src/ringregler.jsx": 2, "src/ui/bausteine.jsx": 2, "src/ui/leisten.jsx": 2, "src/ui/ziehen.jsx": 2,
  "src/ansichten/schrittleiste.jsx": 1,
};

/** Feste Zuordnung je Stelle (Quelltextreihenfolge, ohne die Ausnahmen). alt = Radius vorher (px); kante = kleinere
 *  Kante, falls fest; quelle = Schreibweise vorher, wenn nicht die Zahl (Kreise "50%"). */
const QUERSCHNITT_ZUORDNUNG = {
  [APP]: [
    { wo: "Fehlerauffang: Fehlertext (pre)", alt: 12, stufe: "mittel" },
    { wo: "Betrieb: Rechte-Matrix, Schalter 25×25", alt: 8, kante: 25, stufe: "klein" },
    { wo: "Betrieb: Systemprüfung, Ergebnismarke 23×23", alt: 12, kante: 23, stufe: "pille" },
    { wo: "Ladeplatzhalter: Titel 220×34", alt: 8, kante: 34, stufe: "klein" },
    { wo: "Ladeplatzhalter: Kachel (Höhe 92)", alt: 12, stufe: "mittel" },
    { wo: "Ladeplatzhalter: Fläche (Höhe 240)", alt: 12, stufe: "mittel" },
    { wo: "Hinweis-Streifen (Live-Region)", alt: 999, stufe: "pille" },
    { wo: "Seitenleiste: Kürzel 30×30", alt: 9, kante: 30, stufe: "klein" },
    { wo: "Tabbar: Post-Zähler (Höhe 15)", alt: 8, kante: 15, stufe: "pille" },
  ],
  [DIAGRAMME]: [
    { wo: "LinienDiagramm: Punkt 8×8 (aktiv 11×11)", alt: 4, kante: 8, quelle: '"50%"', stufe: "pille" },
    { wo: "LinienDiagramm: Hinweisfenster", alt: 9, stufe: "klein" },
    { wo: "BalkenDiagramm: Hinweisfenster", alt: 9, stufe: "klein" },
    { wo: "Schritte: Schrittmarke 26×26", alt: 13, kante: 26, stufe: "pille" },
    { wo: "ModellVorschau: Tageskachel 17×17", alt: 5, kante: 17, stufe: "klein" },
  ],
  [GESTALT]: [
    { wo: "Sparkline (Linie): Endpunkt 8×8", alt: 4, kante: 8, quelle: '"50%"', stufe: "pille" },
  ],
  [FARBWAHL]: [
    { wo: "Farbwahl: Kachel 25×25", alt: 8, kante: 25, stufe: "klein" },
    { wo: "Farbpunkt: Punkt 18×18", alt: 9, kante: 18, stufe: "pille" },
    { wo: "Farbpunkt: Auswahlfläche", alt: 10, stufe: "mittel" },
  ],
};

/** Sichtbare Änderungen (alt → neu): nur Stellen, deren alter Radius nicht schon auf der Stufe lag und keine Kapsel war. */
const SICHTBAR = [
  [APP, "Seitenleiste: Kürzel 30×30", "9 px → 8 px"],
  [DIAGRAMME, "LinienDiagramm: Hinweisfenster", "9 px → 8 px"],
  [DIAGRAMME, "BalkenDiagramm: Hinweisfenster", "9 px → 8 px"],
  [DIAGRAMME, "ModellVorschau: Tageskachel 17×17", "5 px → 8 px"],
  [FARBWAHL, "Farbpunkt: Auswahlfläche", "10 px → 12 px"],
];

/** Begründete Ausnahmen (bleiben Literal; Folgepaket V4-3d, dort als offen eingetragen, nicht entschieden).
 *  art form: Radius mit Kapsel-Effekt (kante = kleinste Kante in px); schatten; farbe. */
const AUSNAHMEN = [
  { datei: APP, art: "form", alt: 6, kante: 16, stelle: "{{ width: 320, height: 16, borderRadius: 6,",
    grund: "Ladeplatzhalter Untertitel 16 px hoch: klein (8) = halbe Höhe machte den Balken zur Kapsel (wie Einstieg)" },
  { datei: DIAGRAMME, art: "fuss", alt: 2, stelle: 'borderRadius: "5px 5px 2px 2px",',
    grund: "Diagrammbalken auf der Achse (oben 5, Fuß 2 px): klein (8) rundete den Fuß auf das Vierfache, und bei der "
      + "Mindesthöhe (2 % von 150 px = 3 px) würde der Balken zur Kapsel; wie die Diagrammbalken im Plan (Schnitt 1)" },
  { datei: DIAGRAMME, art: "form", alt: 4, kante: 14, stelle: '{{ position: "absolute", top: 3, bottom: 3, borderRadius: 4,',
    grund: "Abweichungsbalken 14 px dick (Höhe 20 − 2 × 3): klein (8) > halbe Dicke 7 machte ihn zur Kapsel" },
  { datei: GESTALT, art: "form", alt: 1, kante: 4, stelle: "{{ width: 4, height: 4, borderRadius: 1, background: farbe(d) }}",
    grund: "Sparkline-Punkte 4×4: klein (8) >= halbe Kante 2 machte das Quadrat zum Kreis" },
  { datei: GESTALT, art: "form", alt: 2, kante: 6, stelle: "minWidth: 3, maxWidth: 6, height: `${h}%`, borderRadius: 2,",
    grund: "Sparkline-Säulen 3–6 px breit (nicht fest): die Regel ergäbe je nach Breite pille oder klein; beide machten "
      + "die 6 px breite Säule zur Kapsel (wie Diagrammbalken)" },
  { datei: GESTALT, art: "form", alt: 3, kante: 10, stelle: "{{ width: 10, height: 10, borderRadius: 3, background: farbe(t.ton) }}",
    grund: "Legendenquadrat 10×10: klein (8) >= halbe Kante 5 machte das Quadrat zum Kreis (wie Legendenquadrate, Zeit)" },
  { datei: GESTALT, art: "schatten", stelle: "boxShadow: `0 0 0 1.5px ${C.flaeche}`",
    grund: "Trennring des Endpunkts in Flächenfarbe (Farbe schon Token), kein Ebenen-Schatten; V4_SCHATTEN hat keinen Ring" },
  { datei: FARBWAHL, art: "schatten", stelle: 'boxShadow: "0 10px 28px -10px rgba(7,19,23,.28)"',
    grund: "Schatten der Auswahlfläche: Kandidat var(--schatten-blatt) (E5) hätte andere Tiefe; Schatten nicht im Auftrag" },
  { datei: APP, art: "farbe", stelle: 'color: istDunkel() ? C.bg : "#fff"',
    grund: "Post-Zähler auf C.danger (hell): flaeche/aufAkzent #fffefa haben gemessen weniger Kontrast als #fff" },
  { datei: APP, art: "farbe", stelle: ".sw-root{background:#fff;}",
    grund: "Druckstil (@media print, globaler Stil in bauStyles): V4-3d" },
  { datei: APP, art: "farbe", stelle: ".karte{border-color:#D1D5DB; box-shadow:none; break-inside:avoid;}",
    grund: "Druckstil (@media print, globaler Stil in bauStyles): V4-3d" },
  { datei: FARBWAHL, art: "farbe", stelle: 'border: wert === c ? "3px solid #fff" : "1px solid rgba(0,0,0,.12)",',
    grund: "Auswahlfuge weiß bzw. Rand der Kachel: kein Token mit nicht schlechterem Kontrast hell und dunkel (gemessen)" },
];

/** Feld- und ARIA-Attribute in Quelltextreihenfolge (Name=Wert); wie v4-3b-branchenmodule.test.js. */
const RE_ATTRIBUT = /\b(id|htmlFor|type|name|autoComplete|autoFocus|autoCapitalize|inputMode|role|aria-[a-z]+|placeholder|disabled|required|pattern|maxLength|minLength|tabIndex|onSubmit|onKeyDown)=(\{[^}]*\}|"[^"]*")/g;
const attributeIn = (text) => [...text.matchAll(RE_ATTRIBUT)].map((m) => `${m[1]}=${m[2]}`);
/** Basis 63a3469b (LF): Anzahl und SHA-256 der Attributliste je Datei von Teil 1. */
const ATTRIBUTE_BASIS = {
  [APP]: [27, "30c7b1e28cdfe610ec065f312c0bc00b7fbd301bb8c146bec3e87c2245b3c029"],
  [DIAGRAMME]: [1, "3aba20d35f3246740c07dcd8d2da611e17fd7b460a838f94a32e26012444abb5"],
  [GESTALT]: [21, "0415c3a4998774ff6e9651ad46aafcdde45884461df8ef4bf6e7424f837ef7ba"],
  [FARBWAHL]: [7, "3922218a3f438920f8576400fae32e997e777c554389b4d757b7d652d71d1d61"],
};
/** Basis 63a3469b: Anzahl „transition“ und „boxShadow“ je Datei von Teil 1 (ohne Kommentare). */
const UEBERGAENGE = { [APP]: 12, [DIAGRAMME]: 2, [GESTALT]: 0, [FARBWAHL]: 0 };
const SCHATTEN = { [APP]: 2, [DIAGRAMME]: 0, [GESTALT]: 1, [FARBWAHL]: 2 };

/** Inline-Stufen (borderRadius: "var(--v4-r-…)") im Quelltext ohne Kommentare; der CSS-Text (border-radius:) zählt nicht. */
const inlineStufen = (text) => [...ohneKommentare(text).matchAll(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g)].map((m) => m[1]);

/** Heutiger Quelltext einer Datei mit den alten Werten der Tabelle zurückgesetzt. */
function rueckgerechnet(datei, tabelle = QUERSCHNITT_ZUORDNUNG, text = lies(datei)) {
  const stellen = tabelle[datei] || [];
  let i = 0;
  const aus = text.replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    const st = stellen[i++];
    return st && st.stufe === stufe ? `borderRadius: ${st.quelle || st.alt}` : m;   // Fehler fällt über die Prüfsumme auf
  });
  return { text: aus, ersetzt: i };
}

/** Radien (border-radius) im Markup. */
const radien = (s) => [...s.matchAll(/border-radius:([^;"]*)/g)].map((m) => m[1]);
/* Farbmessung: deckende Mischung eines rgba-Werts über einer Fläche (#rrggbb). */
const mische = (rgba, grund) => {
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(rgba);
  const a = Number(m[4]);
  const g = [1, 3, 5].map((k) => parseInt(grund.slice(k, k + 2), 16));
  return `#${[m[1], m[2], m[3]].map((v, k) => Math.round(Number(v) * a + g[k] * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
};
const THEMEN = ["hell", "dunkel"];

describe("V4-3b Querschnitt Teil 1: Messung", () => {
  it("Zeile: Farbliterale 10, Inline-Stile 428, Dialog 12; Dateien von Teil 1 nur mit ihren Ausnahmen", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[ZEILE];
    /* WP-I16: +1 Datei src/ansichten/ki-steuerung.jsx (154 Zeilen, keine Form-/Farbliterale; Fixture-Eintrag sha256 null,
       erzeugt mit werkzeug/v4-radiusstufen-basis.mjs). Vorher 33 / 24 / 6408. */
    expect(e.dateien).toBe(37); /* WP-I7 Stufe 3: +planer-vorschlag.jsx (vorher 36); WP-I7 Teil 6: +anheftungen.jsx (vorher 34); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (vorher 35) */
    expect(e.sichtbar).toBe(28); /* WP-I7 Stufe 3: +planer-vorschlag.jsx (vorher 27); vorher 25; Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (vorher 26) */
    expect(e.zeilen).toBe(7258); /* WP-I8 Verdrahtung: +42 Zeilen planer-vorschlag.jsx (Abschnitt Erfüllungsbericht, Bericht beim Vorschlag; 369 → 411, 7216 → 7258); WP-I7 Review #616: +5 Zeilen planer-vorschlag.jsx (Generationszähler, Rückkehr in denselben Monat; 364 → 369, 7211 → 7216); WP-I7 Vor-Freigabe-Härtung: +47 Zeilen planer-vorschlag.jsx (Monatsbindung, Fokus, Ansage-Region; 317 → 364, 7164 → 7211); WP-I7 Stufe 3: +317 Zeilen planer-vorschlag.jsx (Planvorschlag übernehmen und zurücknehmen; 6847 → 7164); Planer-Oberfläche Stufe 2: +64 Zeilen planer-steuerung.jsx (Verteilung, nur lesen; 6783 → 6847); V4-3d-B1: +17 Zeilen in src/ui/bausteine.jsx (vorher 6391); WP-I7 Teil 6: +46 anheftungen.jsx (vorher 6562); Planer-Oberfläche Stufe 1: +73 anheftungen.jsx (Bedienung, 46 → 119) und +92 planer-steuerung.jsx (vorher 6608); WP-I7 Teil 7: +5 anheftungen.jsx („Fest eingeplant“, 6773 → 6778) */
    expect(e.farbLiterale).toBe(10);
    expect(e.farbrein).toBe(23); /* WP-I7 Stufe 3: +planer-vorschlag.jsx (vorher 22); WP-I16: +ki-steuerung.jsx (vorher 19); WP-I7 Teil 6: +anheftungen.jsx (vorher 20); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (vorher 21) */
    expect(e.inlineStil).toBe(452); /* WP-I16: +24 Inline-Stile in ki-steuerung.jsx (vorher 428; vorgaben.jsx hat 30) */
    expect(e.dialog).toBe(12);
    /* Stand der Zeile nach Teil 1 (gemessen auf a9e524e5): Form-Literale 24, Form 18/24 (10 / 5 / 3), „voll V4“ 9/24,
       ohne V4-Form 6, Gesamt Form-Literale 34, Form erreicht 143, „voll“ 123/159. Teil 2 (v4-3b-querschnitt-2.test.js)
       senkt diese Werte weiter und prüft sie dort; hier bleiben nur die Werte, die Teil 2 nicht ändert, und die Dateien
       von Teil 1 (unten). */
    /* Je Datei: in Teil 1 übrig nur die Ausnahmen. */
    const je = Object.fromEntries(inv.eintraege.filter((x) => hauptansicht(x) === ZEILE).map((x) => [x.datei, x]));
    expect(TEIL1.map((d) => [je[d].formLiterale, je[d].rgb + je[d].hex])).toEqual([[1, 3], [2, 0], [4, 0], [1, 3]]);
    expect(TEIL1.map((d) => je[d].form)).toEqual(["Overlay direkt", "Token direkt", "Token direkt", "Token direkt"]);
    expect(Object.values(TEIL2).reduce((a, n) => a + n, 0)).toBe(16);
    /* Andere Dateien der Zeile ohne Form-Literal (Teil-2-Dateien: höchstens ihre Ausnahmen, Teil 2). */
    for (const x of Object.values(je).filter((y) => y.formLiterale > 0)) {
      expect([...TEIL1, ...Object.keys(TEIL2)], x.datei).toContain(x.datei);
    }
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel; Teil-2-Dateien ohne Stufe", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === ZEILE).map((x) => x.datei);
    for (const [datei, stellen] of Object.entries(QUERSCHNITT_ZUORDNUNG)) {
      expect(dateien, datei).toContain(datei);
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(inlineStufen(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(QUERSCHNITT_ZUORDNUNG).flat()).toHaveLength(18);
    /* Die Stufen der Teil-2-Dateien prüft v4-3b-querschnitt-2.test.js (feste Tabelle Teil 2). */
    /* Sichtbar ändert sich nur, was nicht schon auf der Stufe lag und keine Kapsel/kein Kreis war. */
    const px = (s) => parseFloat(V4_RADIEN[s]);
    const sichtbar = Object.entries(QUERSCHNITT_ZUORDNUNG).flatMap(([d, st]) => st
      .filter((s) => s.stufe !== "pille" && px(s.stufe) !== s.alt)
      .map((s) => [d, s.wo, `${s.alt} px → ${px(s.stufe)} px`]));
    expect(sichtbar).toEqual(SICHTBAR);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture; Teil in SCHNITTE", async () => {
    expect(SCHNITTE[SCHNITT]).toBe("63a3469b115139e0046459e92e4c1695caecbe3c");
    expect(ansichtVon(SCHNITT)).toBe(ZEILE);
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    const inv = await inventar();
    const alle = inv.eintraege.filter((x) => x.gruppe !== "V4" && hauptansicht(x) === ZEILE).map((x) => x.datei).sort();
    /* WP-I16: Ausnahmeliste genau eine Datei; in der Fixture nicht vorhanden, in der Messung ohne jedes Form- oder Farbliteral. */
    /* WP-I7 Teil 6: + src/ansichten/anheftungen.jsx (Anzeige Anheften, 46 Zeilen, ohne Form-/Farbliterale und ohne Inline-Stile). */
    expect(NEU_SEIT_BASIS).toEqual(["src/ansichten/ki-steuerung.jsx", "src/ansichten/anheftungen.jsx", "src/ansichten/planer-steuerung.jsx", "src/ansichten/planer-vorschlag.jsx"]);
    for (const d of NEU_SEIT_BASIS) {
      expect(d in fx.schnitte[SCHNITT].dateien, `${d} steht nicht in der Fixture`).toBe(false);
      const x = inv.eintraege.find((y) => y.datei === d);
      expect([x.formLiterale, x.rgb + x.hex], `${d}: 0 Literale`).toEqual([0, 0]);
    }
    const mitBasis = alle.filter((d) => !NEU_SEIT_BASIS.includes(d));
    expect(Object.keys(fx.schnitte[SCHNITT].dateien).sort()).toEqual(mitBasis);
    expect(fixtureBefunde(fx, SCHNITT, mitBasis)).toEqual([]);
    expect(abgleichMitFixture(fx, SCHNITT, QUERSCHNITT_ZUORDNUNG, lies)).toEqual([]);
    /* Basis: 40 Radius-Literale in der Zeile (24 in Teil 1, 16 in Teil 2). */
    const n = (d) => fx.schnitte[SCHNITT].dateien[d].literale.length;
    expect(TEIL1.map(n)).toEqual([10, 7, 4, 3]);
    for (const [d, k] of Object.entries(TEIL2)) expect(n(d), d).toBe(k);
  }, 60000);

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radiuswerte geändert, sonst byte-gleich zur Basis (25 Dateien der Zeile ohne Teil 2, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    /* Die acht Teil-2-Dateien rechnet v4-3b-querschnitt-2.test.js auf die Basis a9e524e5 zurück; dort ist auch belegt,
       dass a9e524e5 für alle Dateien außer den vier von Teil 1 byte-gleich zu 63a3469b ist. */
    const dateien = Object.keys(fx.dateien).filter((d) => !(d in TEIL2));
    expect(dateien).toHaveLength(25);
    for (const d of dateien) {
      const r = rueckgerechnet(d);
      expect(r.ersetzt, `Anzahl Stufen in ${d}`).toBe((QUERSCHNITT_ZUORDNUNG[d] || []).length);
      expect(sha256(r.text), `${d} zurückgerechnet = Basis`).toBe(fx.dateien[d].sha256);
    }
  });

  it("Feld- und ARIA-Attribute in Reihenfolge wie auf der Basis (Teil 1)", () => {
    for (const [d, [n, summe]] of Object.entries(ATTRIBUTE_BASIS)) {
      const a = attributeIn(lies(d));
      expect(a, d).toHaveLength(n);
      expect(sha256(JSON.stringify(a)), `${d}: Attribute gleich der Basis`).toBe(summe);
    }
  });

  it("Mutation (alt, kante, Stufe, Token, Text, Attribut, Anzahl) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const basisSumme = (d) => fx.schnitte[SCHNITT].dateien[d].sha256;
    const mit = (datei, i, x) => ({ ...QUERSCHNITT_ZUORDNUNG,
      [datei]: QUERSCHNITT_ZUORDNUNG[datei].map((s, j) => (j === i ? { ...s, ...x } : s)) });
    expect(abgleichMitFixture(fx, SCHNITT, mit(FARBWAHL, 2, { alt: 12 }), lies))
      .toEqual([`${FARBWAHL}: Farbpunkt: Auswahlfläche: Basis 10, Tabelle alt 12`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(APP, 7, { kante: 32 }), lies))
      .toEqual([`${APP}: Seitenleiste: Kürzel 30×30: kante 32 nicht im Stilobjekt der Basis`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(DIAGRAMME, 0, { kante: 10 }), lies)[0])
      .toBe(`${DIAGRAMME}: LinienDiagramm: Punkt 8×8 (aktiv 11×11): Basis 50 %, Tabelle alt 4 kante 10`);
    expect(abgleichMitFixture(fx, SCHNITT, { ...QUERSCHNITT_ZUORDNUNG, [GESTALT]: [] }, lies)[0])
      .toBe(`${GESTALT}: Anzahl: Basis 1, Tabelle 0`);
    /* Eine falsche Stufe in der Tabelle ergibt nicht die Basis. */
    expect(sha256(rueckgerechnet(DIAGRAMME, mit(DIAGRAMME, 4, { stufe: "mittel" })).text)).not.toBe(basisSumme(DIAGRAMME));
    /* Ein anderer Token im Quelltext, ein geänderter Text oder ein geändertes Attribut ergibt nicht die Basis. */
    const q = lies(FARBWAHL);
    expect(sha256(rueckgerechnet(FARBWAHL, undefined, q.replace("var(--v4-r-mittel)", "var(--v4-r-gross)")).text))
      .not.toBe(basisSumme(FARBWAHL));
    expect(sha256(rueckgerechnet(FARBWAHL, undefined, q.replace("Farbe wählen", "Farbe waehlen")).text))
      .not.toBe(basisSumme(FARBWAHL));
    const a = q.replace("aria-expanded={offen}", "aria-expanded={!offen}");
    expect(sha256(rueckgerechnet(FARBWAHL, undefined, a).text)).not.toBe(basisSumme(FARBWAHL));
    expect(sha256(JSON.stringify(attributeIn(a)))).not.toBe(ATTRIBUTE_BASIS[FARBWAHL][1]);
    /* Regel: 9 → klein (1 px näher als mittel), 10 → mittel (Gleichstand → größere), 12 ≥ 11,5 → pille, 5 bei 17 → klein. */
    expect([regelStufe(9), regelStufe(10), regelStufe(12, 23), regelStufe(5, 17), regelStufe(8, 15)])
      .toEqual(["klein", "mittel", "pille", "klein", "pille"]);
  });

  it("Ausnahmen: wörtlich unverändert; Radien mit Kapsel-Effekt (nächste Stufe >= halbe Kante, alt < halbe Kante)", () => {
    for (const a of AUSNAHMEN) {
      expect(ohneKommentare(lies(a.datei)).split(a.stelle), `${a.datei}: ${a.stelle}`).toHaveLength(2);
      expect(a.grund.length, a.stelle).toBeGreaterThan(20);
      if (a.art === "fuss") {
        /* Ecken verschieden (oben 5, unten 2); der Fuß würde klein (8 px). */
        expect(regelStufe(a.alt), a.stelle).toBe("klein");
        expect(/"(\d+)px \1px (\d+)px \2px"/.exec(a.stelle).slice(1).map(Number), a.stelle).toEqual([5, a.alt]);
        continue;
      }
      if (a.art !== "form") continue;
      const stufe = regelStufe(a.alt, a.kante);
      expect(stufe, a.stelle).not.toBe("pille");
      expect(a.alt < a.kante / 2 && parseFloat(V4_RADIEN[stufe]) >= a.kante / 2, a.stelle).toBe(true);
    }
    expect(AUSNAHMEN.filter((a) => a.art === "form" || a.art === "fuss")).toHaveLength(6);
    expect(AUSNAHMEN.filter((a) => a.art === "schatten")).toHaveLength(2);
  });

  it("Farbliterale: kein Token mit nicht schlechterem Kontrast hell und dunkel (gemessen) — Ausnahme statt Ersatz", () => {
    const P = Object.fromEntries(THEMEN.map((t) => [t, v4AlsAltePalette(t)]));
    /* Post-Zähler (hell): #fff auf danger; die hellen Tokens flaeche/aufAkzent (#fffefa) liegen darunter. */
    const weiss = kontrastVon("#ffffff", P.hell.danger);
    for (const k of ["flaeche", "aufAkzent", "bg"]) expect(kontrastVon(P.hell[k], P.hell.danger), k).toBeLessThan(weiss);
    /* Auswahlfuge der Farbkachel: #fff gegen jede Kachel; C.flaeche ist hell knapp, dunkel deutlich schwächer. */
    for (const t of THEMEN) {
      expect(PALETTE.some((c) => kontrastVon(P[t].flaeche, c) < kontrastVon("#ffffff", c)), t).toBe(true);
    }
    /* Rand der ungewählten Kachel (rgba(0,0,0,.12) über der Kachel) gegen die Fläche: jeder Linien-/Steuerton ist für
       mindestens eine Kachel in mindestens einem Thema schwächer. */
    for (const k of ["line", "lineSoft", "lineStark", "steuer"]) {
      const schlechter = THEMEN.some((t) => PALETTE.some((c) =>
        kontrastVon(P[t][k], P[t].flaeche) < kontrastVon(mische("rgba(0,0,0,.12)", c), P[t].flaeche)));
      expect(schlechter, k).toBe(true);
    }
  });

  it("kein neuer Übergang (V4-2d), kein neuer Schatten: Teil 1 wie auf der Basis", () => {
    for (const d of TEIL1) {
      const q = ohneKommentare(lies(d));
      expect((q.match(/transition/g) || []).length, d).toBe(UEBERGAENGE[d]);
      expect((q.match(/boxShadow/g) || []).length, d).toBe(SCHATTEN[d]);
    }
  });
});

describe("V4-3b Querschnitt Teil 1: Darstellung (echte Bausteine)", () => {
  it("Diagramme: Punkte und Schrittmarken pille, Tageskacheln klein; Balken und Abweichung bleiben (Ausnahme)", () => {
    const linie = renderToStaticMarkup(h(LinienDiagramm, { daten: [{ label: "a", y: 1 }, { label: "b", y: 3 }, { label: "c", y: 2 }] }));
    expect(radien(linie)).toEqual(Array(3).fill("var(--v4-r-pille)"));
    const schritte = renderToStaticMarkup(h(Schritte, { aktuell: 1, schritte: ["Bereich", "Modell", "Personal"] }));
    expect(radien(schritte)).toEqual(Array(3).fill("var(--v4-r-pille)"));
    const vorschau = renderToStaticMarkup(h(ModellVorschau, { modell: { tage: ["F", "S", "N", "-"], versatzTage: 0 }, tage: 8 }));
    expect(radien(vorschau)).toEqual(Array(8).fill("var(--v4-r-klein)"));
    const balken = renderToStaticMarkup(h(BalkenDiagramm, { daten: [{ label: "a", y: 1 }, { label: "b", y: 2 }] }));
    expect(radien(balken)).toEqual(["5px 5px 2px 2px", "5px 5px 2px 2px"]);
    const abw = renderToStaticMarkup(h(AbweichungsDiagramm, { zeilen: [{ n: "x", w: 2 }], wert: "w", name: (z) => z.n }));
    expect(radien(abw)).toEqual(["4px"]);
    for (const s of [linie, schritte, vorschau]) expect(s, "kein fester Radius").not.toMatch(/border-radius:\d/);
  });

  it("Sparkline: Endpunkt pille; Punkte (1 px), Säulen (2 px) und Legende des Bogens (3 px) bleiben (Ausnahme)", () => {
    const linie = renderToStaticMarkup(h(Sparkline, { daten: [1, 3, 2], beschriftung: "Verlauf" }));
    expect(radien(linie)).toEqual(["var(--v4-r-pille)"]);
    expect(linie).toContain(`box-shadow:0 0 0 1.5px ${v4AlsAltePalette("hell").flaeche}`);
    const punkte = renderToStaticMarkup(h(Sparkline, { art: "punkte", daten: ["ok", "warn"], beschriftung: "Punkte" }));
    expect(radien(punkte)).toEqual(["1px", "1px"]);
    const saeulen = renderToStaticMarkup(h(Sparkline, { art: "saeulen", daten: [1, 2], beschriftung: "Säulen" }));
    expect(radien(saeulen)).toEqual(["2px", "2px"]);
    const bogen = renderToStaticMarkup(h(Bogen, { segmente: [{ wert: 3, ton: "ok", label: "gut" }], zahl: "75 %", beschriftung: "Bogen" }));
    expect(radien(bogen)).toEqual(["3px"]);
  });

  it("Farbwahl: 30 Kacheln klein, Farbpunkt pille; Accessible Names und Zustand unverändert", () => {
    const wahl = renderToStaticMarkup(h(Farbwahl, { wert: PALETTE[0], onChange: () => {} }));
    expect(radien(wahl)).toEqual(Array(PALETTE.length).fill("var(--v4-r-klein)"));
    expect(wahl).toContain('role="group" aria-label="Farbe wählen"');
    expect((wahl.match(/aria-pressed="true"/g) || []).length).toBe(1);
    expect(wahl).toContain("border:3px solid #fff");
    const punkt = renderToStaticMarkup(h(Farbpunkt, { wert: PALETTE[1], onChange: () => {} }));
    expect(radien(punkt)).toEqual(["var(--v4-r-pille)"]);
    expect(punkt).toContain('aria-label="Farbe ändern" aria-expanded="false"');
  });

  it("App.jsx: die Stufen stehen im selben Stilobjekt wie vorher (Quelltext)", () => {
    const q = ohneKommentare(lies(APP));
    for (const s of [
      '{{ background: C.flaecheStill, borderRadius: "var(--v4-r-mittel)", padding: 14, fontSize: 12,',
      '{{ width: 25, height: 25, borderRadius: "var(--v4-r-klein)", cursor: fest ? "not-allowed" : "pointer",',
      '{{ width: 23, height: 23, borderRadius: "var(--v4-r-pille)", flexShrink: 0,',
      '{{ width: 220, height: 34, borderRadius: "var(--v4-r-klein)",',
      '{{ height: 92, borderRadius: "var(--v4-r-mittel)",',
      '{{ height: 240, borderRadius: "var(--v4-r-mittel)",',
      'padding: "12px 20px", borderRadius: "var(--v4-r-pille)",',
      '{{ width: 30, height: 30, borderRadius: "var(--v4-r-klein)", flexShrink: 0,',
      'minWidth: 15, height: 15,\n                borderRadius: "var(--v4-r-pille)", background: C.danger,',
    ]) expect(q, s).toContain(s);
  });
});
