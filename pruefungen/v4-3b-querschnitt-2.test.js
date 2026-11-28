/* ==========================================================================
   V4-3b (dreizehnter Schnitt, Teil 2) — Zeile Querschnitt/Bausteine: übrige Form-Literale auf Radiusstufen

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung.
   Zuordnung wie Plan bis Querschnitt Teil 1 (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die
   nächste (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Teil 2 = die acht Dateien der Zeile, die nach Teil 1 (#466) noch Form-Literale haben, gemessen auf a9e524e5:
   handbuch 3, kommandoleiste 2, tourleiste 2, ringregler 2, ui/bausteine 2, ui/leisten 2, ui/ziehen 2,
   schrittleiste 1 = 16 Radien, 0 Schatten; dazu 4 Farbliterale (kommandoleiste 1, leisten 2, ziehen 1). Die übrigen
   Dateien der Zeile (auch bestaetigungstext, gestalt/icons, ui/scrollbereich) haben kein Form- oder Farbliteral.

   Ergebnis Teil 2: 15 Radien auf Stufen, 1 Radius bleibt als begründete Ausnahme (Kapsel-Effekt), alle 4 Farbliterale
   bleiben (kein Token mit nicht schlechterem Kontrast hell und dunkel, gemessen unten).

   Review #466 (H1): Der Kantenabgleich (kanteImKontext) nimmt bei einer Größe nach Zustand nur noch den letzten Zweig
   eines einfachen Ausdrucks auf oberster Ebene. Teil 2 hat keine Stelle „Größe nach Zustand mit Zahlradius“ (geprüft
   unten über alle Basis-Literale der Zeile); die einzige Größe nach Zustand der Zeile ist der Punkt des
   LinienDiagramms (Teil 1, Quelle "50%", Kreis bei jeder Größe).

   Beleg „nichts außer Radius“: Rückrechnung je Datei (alle 33 der Zeile) — der heutige Quelltext, mit den alten Werten
   aus der festen Tabelle zurückgesetzt, ergibt byte-gleich den Basis-Quelltext a9e524e5 (SHA-256 aus der Fixture, ohne
   Git). Die Basis von Teil 2 ist für alle Dateien außer den vier Dateien von Teil 1 byte-gleich zur Basis von Teil 1
   (63a3469b); so schließt die Kette an Teil 1 an. Dazu ein Attributwächter (Feld- und ARIA-Attribute in Reihenfolge).
   Grenze des Attributwächters (Hinweise aus #460/#463/#465/#466): Er erfasst Boolean- und Spread-Attribute,
   Stilschlüssel, className und onClick nicht; das deckt die Rückrechnung (byte-gleich) ab. In ui/ziehen.jsx und
   schrittleiste.jsx findet er kein Attribut (Liste leer); dort trägt nur die Rückrechnung.

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare, zusammenfassung } from "../werkzeug/v4-inventar.mjs";
import { Leer, Laden } from "../src/ui/bausteine.jsx";
import { Balken } from "../src/ui/leisten.jsx";
import { Schrittleiste } from "../src/ansichten/schrittleiste.jsx";
import Ringregler from "../src/ringregler.jsx";
import { PALETTE } from "../src/lib/fachlogik.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { V4_RADIEN, v4AlsAltePalette } from "../src/v4/tokens.js";
import { regelStufe, ladeBasisFixture, abgleichMitFixture, abgleichMitLiteralen, kanteImKontext, gitGegenprobe,
  fixtureBefunde, sha256, SCHNITTE, ansichtVon } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** V4-3d-B1 (bewusste, begründete Ausnahme vom Byte-Pin): src/ui/bausteine.jsx trägt seit B1 zusätzlich die Planzellen-Schrift
 *  (Hilfsfunktion planzellenSchrift, zwei Importe, ein Aufruf). Diese drei Stellen werden hier genau zurückgenommen; danach gilt
 *  der Pin unverändert (Rückrechnung = Basis a9e524e5). Fehlt eine der Stellen, ist das ein Fehler, kein stilles Durchwinken. */
const OHNE_B1 = [
  [/\/\* V4-3d-B1:[\s\S]*?\n\};\n/, ""],
  ['import { kontrastVon } from "../gestalt/lesbar.js";\nimport { istDunkel, lesbar, NUM } from "./thema.js";', 'import { lesbar, NUM } from "./thema.js";'],
  ["planzellenSchrift(da.farbe, 5.4)", "lesbar(da.farbe, 5.4)"],
];
const ohneB1 = (text) => OHNE_B1.reduce((t, [a, b]) => {
  const n = typeof a === "string" ? t.split(a).length - 1 : (t.match(a) || []).length;
  if (n !== 1) throw new Error(`V4-3d-B1-Ausnahme: Stelle ${String(a).slice(0, 40)} ${n}-mal gefunden (erwartet 1)`);
  return t.replace(a, () => b);
}, text);
const lies = (d) => {
  const t = readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");
  return d === "src/ui/bausteine.jsx" ? ohneB1(t) : t;
};

/** WP-I16: Ausnahmeliste „neu seit der Basis, ohne Literale“: Dateien, die es auf der Basis nicht gab und deshalb nicht in der
 *  (historischen, unveränderten) Fixture stehen. Genau eine Datei, 0 Form-/Farbliterale (Test unten prüft beides). */
const NEU_SEIT_BASIS = Object.freeze(["src/ansichten/ki-steuerung.jsx", "src/ansichten/anheftungen.jsx", "src/ansichten/planer-steuerung.jsx"]);

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Schnitt 1–11 und Querschnitt Teil 1, #466). */
const BASIS = "a9e524e5";
const SCHNITT = "Querschnitt/Bausteine (Teil 2)";
const TEIL1_SCHNITT = "Querschnitt/Bausteine (Teil 1)";
const ZEILE = "Querschnitt/Bausteine";
const HANDBUCH = "src/ansichten/handbuch.jsx";
const KOMMANDO = "src/ansichten/kommandoleiste.jsx";
const TOUR = "src/ansichten/tourleiste.jsx";
const RING = "src/ringregler.jsx";
const UIBAU = "src/ui/bausteine.jsx";
const LEISTEN = "src/ui/leisten.jsx";
const ZIEHEN = "src/ui/ziehen.jsx";
const SCHRITT = "src/ansichten/schrittleiste.jsx";
const TEIL2 = [HANDBUCH, KOMMANDO, TOUR, RING, UIBAU, LEISTEN, ZIEHEN, SCHRITT];
const TEIL1 = ["src/App.jsx", "src/ui/diagramme.jsx", "src/gestalt/bausteine.jsx", "src/ui/farbwahl.jsx"];

/** Feste Zuordnung je Stelle (Quelltextreihenfolge, ohne die Ausnahme). alt = Radius vorher (px); kante = kleinere
 *  Kante, falls fest; quelle = Schreibweise vorher, wenn nicht die Zahl. quadrat: "50%" an einem Element mit
 *  aspectRatio "1" (Kreis bei jeder Größe). kanteAusEltern: height "100%" der Spur (Kante im Stilobjekt davor). */
const QUERSCHNITT2_ZUORDNUNG = {
  [HANDBUCH]: [
    { wo: "Abschnitt: Haken-Knopf 26×26", alt: 8, kante: 26, stufe: "klein" },
    { wo: "Abschnitt: Schrittnummer 22×22", alt: 11, kante: 22, stufe: "pille" },
    { wo: "Kapitelliste: Kapitelmarke 22×22", alt: 11, kante: 22, stufe: "pille" },
  ],
  [KOMMANDO]: [
    { wo: "Kopf: Tastenhinweis Esc (kbd)", alt: 6, stufe: "klein" },
    { wo: "Treffer: Symbol 27×27", alt: 9, kante: 27, stufe: "klein" },
  ],
  [TOUR]: [
    { wo: "Kapitelknöpfe (Kapsel)", alt: 999, stufe: "pille" },
    { wo: "Hinweis am Kapitelende", alt: 8, stufe: "klein" },
  ],
  [RING]: [
    { wo: "Ring (Schieberegler, Seitenverhältnis 1)", alt: "50%", quadrat: true, quelle: '"50%"', stufe: "pille" },
    { wo: "Taste −/+ 34×34", alt: 9, kante: 34, stufe: "klein" },
  ],
  [UIBAU]: [
    { wo: "Leer: Symbolfläche 46×46", alt: 14, kante: 46, stufe: "mittel" },
  ],
  [LEISTEN]: [
    { wo: "Balken: Spur (Höhe 5)", alt: 3, kante: 5, stufe: "pille" },
    { wo: "Balken: Füllung (Höhe 100 % der Spur)", alt: 3, kante: 5, kanteAusEltern: true, stufe: "pille" },
  ],
  [ZIEHEN]: [
    { wo: "Begleiter am Zeiger", alt: 12, stufe: "mittel" },
    { wo: "Ziehhinweis (Kapsel unten)", alt: 999, stufe: "pille" },
  ],
  [SCHRITT]: [
    { wo: "Schrittmarke 26×26", alt: 13, kante: 26, stufe: "pille" },
  ],
};

/** Stufe der Regel für eine Stelle: "50%" am Quadrat ist genau die halbe Kante → pille (bei jeder Kante). */
const stufeDerRegel = (s) => (s.quadrat ? (s.alt === "50%" ? regelStufe(108, 216) : null) : regelStufe(s.alt, s.kante));

/** Sichtbare Änderungen (alt → neu): nur Stellen, deren alter Radius nicht schon auf der Stufe lag und keine Kapsel war. */
const SICHTBAR = [
  [KOMMANDO, "Kopf: Tastenhinweis Esc (kbd)", "6 px → 8 px"],
  [KOMMANDO, "Treffer: Symbol 27×27", "9 px → 8 px"],
  [RING, "Taste −/+ 34×34", "9 px → 8 px"],
  [UIBAU, "Leer: Symbolfläche 46×46", "14 px → 12 px"],
];

/** Begründete Ausnahmen (bleiben Literal; Folgepaket V4-3d, dort als offen eingetragen, nicht entschieden). */
const AUSNAHMEN = [
  { datei: UIBAU, art: "form", alt: 5, kante: 14, stelle: "{{ height: 14, borderRadius: 5, marginBottom: 10,",
    grund: "Ladestreifen 14 px hoch: klein (8) > halbe Höhe 7 machte den Streifen zur Kapsel (wie Ladeplatzhalter Teil 1)" },
  { datei: KOMMANDO, art: "farbe", stelle: 'background: i === k ? "rgba(43,44,37,.07)" : "transparent" }}',
    grund: "Gewählter Treffer: jeder Flächen-/Linienton ist hell entweder weniger abgesetzt oder senkt den Schriftkontrast" },
  { datei: LEISTEN, art: "farbe", stelle: 'background: "rgba(20,20,25,.045)", display: "flex",',
    grund: "Leere Planzelle: bg setzt hell kaum mehr ab und senkt den Kontrast des Punktes; dunklere Töne senken ihn mehr" },
  { datei: LEISTEN, art: "farbe", stelle: 'background: "rgba(20,20,25,.08)", borderRadius: "var(--v4-r-pille)"',
    grund: "Spur des Balkens: flaecheStill senkt hell den Kontrast der Füllung (ok/warn/danger), bg setzt weniger ab" },
  { datei: ZIEHEN, art: "farbe", stelle: 'color: last.farbe ? "#fff" : C.aufAkzent,',
    grund: "Schrift auf der Dienstfarbe beim Ziehen: aufAkzent/flaeche (#fffefa hell, dunkel ein Dunkelton) schwächer als #fff" },
];

/** Feld- und ARIA-Attribute in Quelltextreihenfolge (Name=Wert); wie v4-3b-querschnitt-1.test.js. */
const RE_ATTRIBUT = /\b(id|htmlFor|type|name|autoComplete|autoFocus|autoCapitalize|inputMode|role|aria-[a-z]+|placeholder|disabled|required|pattern|maxLength|minLength|tabIndex|onSubmit|onKeyDown)=(\{[^}]*\}|"[^"]*")/g;
const attributeIn = (text) => [...text.matchAll(RE_ATTRIBUT)].map((m) => `${m[1]}=${m[2]}`);
/** Basis a9e524e5 (LF): Anzahl und SHA-256 der Attributliste je Datei von Teil 2. */
const ATTRIBUTE_BASIS = {
  [HANDBUCH]: [6, "dfb94e6c55a862a1e5122192458564346bd9cec5bdb45a28ccd03f5396d2407f"],
  [KOMMANDO]: [18, "cd4582c55dea532980333deaf22678fedc22b77ffee7d46ce5edfa2d950826c4"],
  [TOUR]: [12, "1f29539b6ab67fa79697c3c123c70d0b10fdca78dcc80912055e65ec02173c8f"],
  [RING]: [13, "5b6eff46054e4e26231ed0a8a7e4b78959b134c43c097ccb4b9349d44f4e9164"],
  [UIBAU]: [19, "a9c2d46cc3cf2f949bfa8bc1e7749d6cef3869605c6ccd79831663b665f2d1d4"],
  [LEISTEN]: [7, "ca2b529957a8f5f9644fc552668d5a3c993de0b4d4089d6216e00ad0eb4c4aac"],
  [ZIEHEN]: [0, sha256("[]")],
  [SCHRITT]: [0, sha256("[]")],
};
/** Basis a9e524e5: Anzahl „transition“ und „boxShadow“ je Datei von Teil 2 (ohne Kommentare). */
const UEBERGAENGE = { [HANDBUCH]: 0, [KOMMANDO]: 0, [TOUR]: 2, [RING]: 1, [UIBAU]: 0, [LEISTEN]: 1, [ZIEHEN]: 2, [SCHRITT]: 0 };
const SCHATTEN = { [HANDBUCH]: 1, [KOMMANDO]: 0, [TOUR]: 1, [RING]: 0, [UIBAU]: 0, [LEISTEN]: 0, [ZIEHEN]: 2, [SCHRITT]: 0 };

/** Inline-Stufen (borderRadius: "var(--v4-r-…)") im Quelltext ohne Kommentare. */
const inlineStufen = (text) => [...ohneKommentare(text).matchAll(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g)].map((m) => m[1]);

/** Heutiger Quelltext einer Datei mit den alten Werten der Tabelle zurückgesetzt. Stufen aus Teil 1 (schon auf der
 *  Basis a9e524e5) bleiben stehen; gezählt werden nur die ersetzten Stellen. */
function rueckgerechnet(datei, tabelle = QUERSCHNITT2_ZUORDNUNG, text = lies(datei)) {
  const stellen = tabelle[datei] || [];
  let i = 0, ersetzt = 0;
  const aus = text.replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    if (!stellen.length) return m;
    const st = stellen[i++];
    if (!(st && st.stufe === stufe)) return m;   // Fehler fällt über die Prüfsumme auf
    ersetzt++;
    return `borderRadius: ${st.quelle || st.alt}`;
  });
  return { text: aus, ersetzt };
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
/** Größe nach Zustand mit Zahl im letzten Zweig (`width: a ? 11 : 8`). */
const RE_ZUSTANDSGROESSE = /\b(?:width|height):\s*[^,{}()?:\n]*\?\s*([\d.]+)\s*:\s*([\d.]+)/;

describe("V4-3b Querschnitt Teil 2: Messung", () => {
  it("Zeile: Form-Literale 24 → 9, Farbliterale 10; Form 18/24 → 21/24, „voll V4“ 9/24 → 13/24; Inline-Stile 428, Dialog 12", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[ZEILE];
    expect([e.dateien, e.sichtbar, e.zeilen]).toEqual([36, 27, 6847]); /* Planer-Oberfläche Stufe 2: +64 Zeilen planer-steuerung.jsx (6783 → 6847); WP-I16: +ki-steuerung.jsx (vorher 33/24/6408); WP-I7 Teil 6: +anheftungen.jsx (vorher 34/25/6562); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx, anheftungen.jsx 46 → 119 Zeilen (vorher 35/26/6608); WP-I7 Teil 7: +5 Zeilen anheftungen.jsx (6773 → 6778); Zielgröße-Fix (CI #606): +5 Zeilen anheftungen.jsx (6778 → 6783) */
    expect(e.formLiterale).toBe(9);
    expect(e.farbLiterale).toBe(10);
    expect(e.farbrein).toBe(22); /* WP-I16: +ki-steuerung.jsx (vorher 19); WP-I7 Teil 6: +anheftungen.jsx (vorher 20); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (vorher 21) */
    expect(e.formErreicht).toBe(24); /* WP-I16: +ki-steuerung.jsx (Über Baustein, voll V4); vorher 21; WP-I7 Teil 6: +anheftungen.jsx (vorher 22); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (vorher 23) */
    expect([e.overlayDirekt, e.ueberBaustein, e.tokenDirekt]).toEqual([10, 8, 6]); /* vorher [10, 5, 6]; WP-I7 Teil 6: +anheftungen.jsx (Card); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (Card, vorher [10, 7, 6]) */
    /* Ohne V4-Form bleiben drei Dateien ohne jedes Form- oder Farbliteral (nichts umzustellen; Hebung ist V4-3c). */
    expect(e.ohneForm).toEqual(["src/ansichten/bestaetigungstext.jsx", "src/gestalt/icons.jsx", "src/ui/scrollbereich.jsx"]);
    /* „voll V4“ = Form und Farbe ohne Literale; Inline-Stile zählen nicht (separat: 428, V4-3d). Voll werden handbuch,
       tourleiste, ringregler, schrittleiste; kommandoleiste, leisten, ziehen (Farbe) und ui/bausteine (Radius) nicht. */
    expect(e.voll).toBe(16); /* vorher 13; WP-I16 14; WP-I7 Teil 6: +anheftungen.jsx (15); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx */
    expect(e.inlineStil).toBe(452); /* WP-I16: +24 Inline-Stile in ki-steuerung.jsx (vorher 428; vorgaben.jsx hat 30) */
    expect(e.dialog).toBe(12);
    const je = Object.fromEntries(inv.eintraege.filter((x) => hauptansicht(x) === ZEILE).map((x) => [x.datei, x]));
    expect(TEIL2.map((d) => [je[d].formLiterale, je[d].rgb + je[d].hex]))
      .toEqual([[0, 0], [0, 1], [0, 0], [0, 0], [1, 0], [0, 2], [0, 1], [0, 0]]);
    /* Form-Literale der Zeile: nur noch die Ausnahmen aus Teil 1 (8) und Teil 2 (1). */
    expect(Object.values(je).filter((x) => x.formLiterale > 0).map((x) => [x.datei, x.formLiterale]))
      .toEqual([["src/App.jsx", 1], ["src/gestalt/bausteine.jsx", 4], ["src/ui/bausteine.jsx", 1], ["src/ui/diagramme.jsx", 2],
        ["src/ui/farbwahl.jsx", 1]]);
    /* Gesamt ohne src/v4 nach Teil 2 (#467): Form-Literale 34 → 19 (Dateien 21 → 14), Form erreicht 143 → 146, „voll“
       123 → 127 (von 159). Seit Schnitt 14 (Selbsttest) trägt v4-3b-selbsttest.test.js die Gesamtsummen (18/13/146/128/159);
       hier bleibt der Anteil der Zeile Querschnitt/Bausteine: Form erreicht und Nenner wie nach Teil 2. */
    const z = zusammenfassung(inv).ohneV4;
    expect([z.formErreicht, z.sichtbar]).toEqual([149, 162]); /* WP-I16: +ki-steuerung.jsx; vorher [146, 159]; WP-I7 Teil 6: +anheftungen.jsx (vorher [147, 160]); Planer-Oberfläche Stufe 1: +planer-steuerung.jsx (vorher [148, 161]) */
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel; 15 Stellen", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === ZEILE).map((x) => x.datei);
    for (const [datei, stellen] of Object.entries(QUERSCHNITT2_ZUORDNUNG)) {
      expect(dateien, datei).toContain(datei);
      for (const s of stellen) expect(stufeDerRegel(s), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(inlineStufen(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.keys(QUERSCHNITT2_ZUORDNUNG)).toEqual(TEIL2);
    expect(Object.values(QUERSCHNITT2_ZUORDNUNG).flat()).toHaveLength(15);
    /* 50 % am Quadrat = halbe Kante: pille bei jeder Kante (der Ring ist min(216 px, 100 %) breit). */
    for (const k of [40, 120, 216]) expect(regelStufe(k / 2, k)).toBe("pille");
    const px = (s) => parseFloat(V4_RADIEN[s]);
    const sichtbar = Object.entries(QUERSCHNITT2_ZUORDNUNG).flatMap(([d, st]) => st
      .filter((s) => s.stufe !== "pille" && px(s.stufe) !== s.alt)
      .map((s) => [d, s.wo, `${s.alt} px → ${px(s.stufe)} px`]));
    expect(sichtbar).toEqual(SICHTBAR);
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture; Basis schließt an Teil 1 an", async () => {
    expect(SCHNITTE[SCHNITT]).toBe("a9e524e56f5f50ca7f1ea53e32ee78979f6cfef2");
    expect(ansichtVon(SCHNITT)).toBe(ZEILE);
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    const inv = await inventar();
    const alle = inv.eintraege.filter((x) => x.gruppe !== "V4" && hauptansicht(x) === ZEILE).map((x) => x.datei).sort();
    /* WP-I16: Ausnahmeliste genau eine Datei; in der Fixture nicht vorhanden, in der Messung ohne jedes Form- oder Farbliteral. */
    /* WP-I7 Teil 6: + src/ansichten/anheftungen.jsx (Anzeige Anheften, ohne Form-/Farbliterale und ohne Inline-Stile). */
    expect(NEU_SEIT_BASIS).toEqual(["src/ansichten/ki-steuerung.jsx", "src/ansichten/anheftungen.jsx", "src/ansichten/planer-steuerung.jsx"]);
    for (const d of NEU_SEIT_BASIS) {
      expect(d in fx.schnitte[SCHNITT].dateien, `${d} steht nicht in der Fixture`).toBe(false);
      const x = inv.eintraege.find((y) => y.datei === d);
      expect([x.formLiterale, x.rgb + x.hex], `${d}: 0 Literale`).toEqual([0, 0]);
    }
    const mitBasis = alle.filter((d) => !NEU_SEIT_BASIS.includes(d));
    expect(Object.keys(fx.schnitte[SCHNITT].dateien).sort()).toEqual(mitBasis);
    expect(fixtureBefunde(fx, SCHNITT, mitBasis)).toEqual([]);
    expect(abgleichMitFixture(fx, SCHNITT, QUERSCHNITT2_ZUORDNUNG, lies)).toEqual([]);
    /* Basis a9e524e5: 16 Radius-Literale in Teil 2; gleich der Basis von Teil 1 bis auf die vier Dateien von Teil 1. */
    const t2 = fx.schnitte[SCHNITT].dateien, t1 = fx.schnitte[TEIL1_SCHNITT].dateien;
    expect(TEIL2.map((d) => t2[d].literale.length)).toEqual([3, 2, 2, 2, 2, 2, 2, 1]);
    expect(Object.keys(t2).filter((d) => t2[d].sha256 !== t1[d].sha256).sort()).toEqual([...TEIL1].sort());
    for (const d of TEIL2) expect(t2[d].literaleSha256, d).toBe(t1[d].literaleSha256);
  }, 60000);

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radiuswerte geändert, sonst byte-gleich zur Basis a9e524e5 (alle 33 Dateien der Zeile mit Basis, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    const dateien = Object.keys(fx.dateien);
    expect(dateien).toHaveLength(33);
    for (const d of dateien) {
      const r = rueckgerechnet(d);
      expect(r.ersetzt, `Anzahl Stufen in ${d}`).toBe((QUERSCHNITT2_ZUORDNUNG[d] || []).length);
      expect(sha256(r.text), `${d} zurückgerechnet = Basis`).toBe(fx.dateien[d].sha256);
    }
  });

  it("Feld- und ARIA-Attribute in Reihenfolge wie auf der Basis (Teil 2)", () => {
    for (const [d, [n, summe]] of Object.entries(ATTRIBUTE_BASIS)) {
      const a = attributeIn(lies(d));
      expect(a, d).toHaveLength(n);
      expect(sha256(JSON.stringify(a)), `${d}: Attribute gleich der Basis`).toBe(summe);
    }
  });

  it("Mutation (alt, kante, quadrat, Eltern-Kante, Stufe, Token, Text, Attribut, Anzahl) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const basisSumme = (d) => fx.schnitte[SCHNITT].dateien[d].sha256;
    const T = QUERSCHNITT2_ZUORDNUNG;
    const mit = (datei, i, x) => ({ ...T, [datei]: T[datei].map((s, j) => (j === i ? { ...s, ...x } : s)) });
    expect(abgleichMitFixture(fx, SCHNITT, mit(UIBAU, 0, { alt: 12 }), lies))
      .toEqual([`${UIBAU}: Leer: Symbolfläche 46×46: Basis 14, Tabelle alt 12`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(KOMMANDO, 1, { kante: 28 }), lies))
      .toEqual([`${KOMMANDO}: Treffer: Symbol 27×27: kante 28 nicht im Stilobjekt der Basis`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(LEISTEN, 1, { kante: 6 }), lies))
      .toEqual([`${LEISTEN}: Balken: Füllung (Höhe 100 % der Spur): kante 6 nicht im Stilobjekt des Elternelements der Basis`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(RING, 0, { quadrat: false }), lies)[0])
      .toBe(`${RING}: Ring (Schieberegler, Seitenverhältnis 1): Basis 50 %, Tabelle alt 50% kante undefined`);
    /* Ohne aspectRatio "1" im Stilobjekt der Basis gilt "50%" nicht als Quadrat. */
    const ringBasis = fx.schnitte[SCHNITT].dateien[RING].literale;
    const ohneSeiten = ringBasis.map((l) => ({ ...l, kontext: l.kontext.replace('aspectRatio: "1",', "") }));
    expect(abgleichMitLiteralen(ohneSeiten, lies(RING), T[RING]))
      .toEqual([`Ring (Schieberegler, Seitenverhältnis 1): Basis 50 %, Tabelle quadrat ohne aspectRatio "1" im Stilobjekt der Basis`]);
    expect(abgleichMitFixture(fx, SCHNITT, { ...T, [SCHRITT]: [] }, lies)[0]).toBe(`${SCHRITT}: Anzahl: Basis 1, Tabelle 0`);
    /* Eine falsche Stufe in der Tabelle ergibt nicht die Basis. */
    expect(sha256(rueckgerechnet(TOUR, mit(TOUR, 1, { stufe: "mittel" })).text)).not.toBe(basisSumme(TOUR));
    /* Ein anderer Token im Quelltext, ein geänderter Text, ein geändertes Attribut oder eine geänderte Klasse ergibt
       nicht die Basis. */
    const q = lies(KOMMANDO);
    expect(sha256(rueckgerechnet(KOMMANDO, undefined, q.replace("var(--v4-r-klein)", "var(--v4-r-mittel)")).text))
      .not.toBe(basisSumme(KOMMANDO));
    expect(sha256(rueckgerechnet(KOMMANDO, undefined, q.replace("Nichts gefunden.", "Nichts gefunden!")).text))
      .not.toBe(basisSumme(KOMMANDO));
    const a = q.replace('aria-label="Treffer"', 'aria-label="Treffer der Suche"');
    expect(sha256(rueckgerechnet(KOMMANDO, undefined, a).text)).not.toBe(basisSumme(KOMMANDO));
    expect(sha256(JSON.stringify(attributeIn(a)))).not.toBe(ATTRIBUTE_BASIS[KOMMANDO][1]);
    const k = lies(SCHRITT).replace('className="reiterreihe"', 'className="reiterreihe2"');
    expect(sha256(rueckgerechnet(SCHRITT, undefined, k).text)).not.toBe(basisSumme(SCHRITT));
    expect(sha256(JSON.stringify(attributeIn(k))), "Klasse: Attributwächter blind (Grenze)").toBe(ATTRIBUTE_BASIS[SCHRITT][1]);
    /* Regel: 14 → mittel (2 px näher als gross), 6 → klein, 9 bei 34 → klein, 3 bei 5 → pille, 13 bei 26 → pille. */
    expect([regelStufe(14, 46), regelStufe(6), regelStufe(9, 34), regelStufe(3, 5), regelStufe(13, 26), regelStufe(5, 14)])
      .toEqual(["mittel", "klein", "klein", "pille", "pille", "klein"]);
  });

  it("Review #466 H1: Kantenabgleich nur auf den letzten Zweig oberster Ebene; Teil 2 ohne Größe nach Zustand", () => {
    /* Zulässig: ganzer Wert und letzter Zweig eines einfachen Ausdrucks. */
    expect(kanteImKontext("{{ width: 8, height: 8, borderRadius: 4 }}", 8)).toBe(true);
    expect(kanteImKontext("{{ width: aktiv === i ? 11 : 8, height: 8 }}", 8)).toBe(true);
    expect(kanteImKontext("{{ minWidth: 15, height: 15,\n borderRadius: 8 }}", 15)).toBe(true);
    expect(kanteImKontext("{{ height: 5 }}", 5)).toBe(true);
    /* Nicht zulässig (die alte Lockerung nahm diese an): Zweig in einer Klammer, verschachtelter Ausdruck, Rest nach der
       Zahl, anderer Zweig, Teil einer längeren Zahl. */
    const alt = (kontext, kante) => new RegExp(`\\b(?:width|height):\\s*(?:[^,{}]*?\\?\\s*[\\d.]+\\s*:\\s*)?${kante}\\b`).test(kontext);
    for (const [kontext, kante] of [
      ["{{ width: f(a ? 2 : 8), borderRadius: 4 }}", 8],
      ["{{ width: a ? b ? 1 : 2 : 8, borderRadius: 4 }}", 8],
      ["{{ width: 8 + x, borderRadius: 4 }}", 8],
      ["{{ width: a ? 8 : 11, borderRadius: 4 }}", 8],
      ["{{ width: 8.5, borderRadius: 4 }}", 8],
    ]) expect(kanteImKontext(kontext, kante), kontext).toBe(false);
    expect([alt("{{ width: f(a ? 2 : 8), borderRadius: 4 }}", 8), alt("{{ width: 8 + x, borderRadius: 4 }}", 8)]).toEqual([true, true]);
    /* Größe nach Zustand mit Zahl in der Zeile (Basis Teil 1 und Teil 2): nur der Punkt des LinienDiagramms (Teil 1,
       Quelle "50%", Kreis bei 8 und 11 px). Keine Stelle in Teil 2. */
    const fx = ladeBasisFixture(WURZEL).schnitte;
    for (const s of [TEIL1_SCHNITT, SCHNITT]) {
      const treffer = Object.entries(fx[s].dateien).flatMap(([d, e]) => e.literale
        .filter((l) => RE_ZUSTANDSGROESSE.test(l.kontext)).map((l) => [d, l.wert, RE_ZUSTANDSGROESSE.exec(l.kontext).slice(1).join("/")]));
      expect(treffer, s).toEqual(s === SCHNITT ? [] : [["src/ui/diagramme.jsx", "50%", "11/8"]]);
    }
    for (const stellen of Object.values(QUERSCHNITT2_ZUORDNUNG)) for (const s of stellen) expect(s.alt === "50%" ? s.quadrat : true).toBe(true);
  });

  it("Ausnahme Radius: wörtlich unverändert; Kapsel-Effekt (nächste Stufe >= halbe Kante, alt < halbe Kante)", () => {
    for (const a of AUSNAHMEN) {
      expect(ohneKommentare(lies(a.datei)).split(a.stelle), `${a.datei}: ${a.stelle}`).toHaveLength(2);
      expect(a.grund.length, a.stelle).toBeGreaterThan(20);
      if (a.art !== "form") continue;
      const stufe = regelStufe(a.alt, a.kante);
      expect(stufe, a.stelle).not.toBe("pille");
      expect(a.alt < a.kante / 2 && parseFloat(V4_RADIEN[stufe]) >= a.kante / 2, a.stelle).toBe(true);
    }
    expect(AUSNAHMEN.filter((a) => a.art === "form")).toHaveLength(1);
    expect(AUSNAHMEN.filter((a) => a.art === "farbe")).toHaveLength(4);
  });

  it("Farbliterale: kein Token mit nicht schlechterem Kontrast hell und dunkel (gemessen) — Ausnahme statt Ersatz", () => {
    const P = Object.fromEntries(THEMEN.map((t) => [t, v4AlsAltePalette(t)]));
    const KANDIDATEN = ["bg", "flaecheStill", "lineSoft", "line", "lineStark", "steuer", "accentLight"];
    /* Je Literal: Absetzung gegen die Fläche (C.flaeche) und Kontrast des Vordergrunds darauf. Ein Token ersetzt nur, wenn
       beides in beiden Themen nicht schlechter wird. */
    const FAELLE = [
      { name: "gewählter Treffer", literal: "rgba(43,44,37,.07)", vorder: (p) => [p.text, p.dimmer] },
      { name: "leere Planzelle", literal: "rgba(20,20,25,.045)", vorder: (p) => [p.dimmer] },
      { name: "Spur des Balkens", literal: "rgba(20,20,25,.08)", vorder: (p) => [p.ok, p.warn, p.danger] },
    ];
    for (const f of FAELLE) {
      for (const k of KANDIDATEN) {
        const schlechter = THEMEN.some((t) => {
          const p = P[t], alt = mische(f.literal, p.flaeche);
          return kontrastVon(p[k], p.flaeche) < kontrastVon(alt, p.flaeche)
            || f.vorder(p).some((v) => kontrastVon(v, p[k]) < kontrastVon(v, alt));
        });
        expect(schlechter, `${f.name}: ${k}`).toBe(true);
      }
    }
    /* Beobachtung (V4-3d): Der gewählte Treffer ist dunkel kaum abgesetzt (1,00:1 gegen die Fläche); er bleibt über
       Schriftgewicht und Zeichen ↵ erkennbar. */
    expect(Number(kontrastVon(mische("rgba(43,44,37,.07)", P.dunkel.flaeche), P.dunkel.flaeche).toFixed(2))).toBe(1);
    /* Schrift auf der Dienstfarbe beim Ziehen: aufAkzent und flaeche sind gegen mindestens eine Farbe in jedem Thema
       schwächer als #fff. */
    for (const t of THEMEN) for (const k of ["aufAkzent", "flaeche"]) {
      expect(PALETTE.some((c) => kontrastVon(P[t][k], c) < kontrastVon("#ffffff", c)), `${t}: ${k}`).toBe(true);
    }
  });

  it("kein neuer Übergang (V4-2d), kein neuer Schatten: Teil 2 wie auf der Basis", () => {
    for (const d of TEIL2) {
      const q = ohneKommentare(lies(d));
      expect((q.match(/transition/g) || []).length, d).toBe(UEBERGAENGE[d]);
      expect((q.match(/boxShadow/g) || []).length, d).toBe(SCHATTEN[d]);
    }
  });
});

describe("V4-3b Querschnitt Teil 2: Darstellung (echte Bausteine)", () => {
  it("Leer: Symbolfläche mittel; Laden: Streifen bleiben 5 px (Ausnahme); Balken: Spur und Füllung pille", () => {
    const leer = renderToStaticMarkup(h(Leer, { titel: "Nichts da", text: "Noch keine Einträge." }));
    expect(radien(leer)).toEqual(["var(--v4-r-mittel)"]);
    expect(leer).toContain("Nichts da");
    const laden = renderToStaticMarkup(h(Laden, { zeilen: 3, text: "Lädt" }));
    expect(radien(laden)).toEqual(["5px", "5px", "5px"]);
    expect(laden).toContain('aria-busy="true" aria-live="polite"');
    const balken = renderToStaticMarkup(h(Balken, { ist: 3, soll: 4, tone: "ok" }));
    expect(radien(balken)).toEqual(["var(--v4-r-pille)", "var(--v4-r-pille)"]);
    expect(balken).toContain("height:5px");
    expect(balken).toContain("transition:width .4s cubic-bezier(.4,0,.2,1)");
  });

  it("Schrittleiste: Marken pille; Ringregler: Ring pille, Tasten klein; Accessible Names unverändert", () => {
    const schritte = renderToStaticMarkup(h(Schrittleiste, { aktuell: 1, schritte: ["Daten", "Modell", "Fertig"] }));
    expect(radien(schritte)).toEqual(Array(3).fill("var(--v4-r-pille)"));
    expect(schritte).toContain('class="reiterreihe"');
    const ring = renderToStaticMarkup(h(Ringregler, { wert: 3, beschriftung: "Standorte", einheit: "Zugänge", onChange: () => {} }));
    expect(radien(ring)).toEqual(["var(--v4-r-pille)", "var(--v4-r-klein)", "var(--v4-r-klein)"]);
    expect(ring).toContain('role="slider"');
    expect(ring).toContain('aria-valuenow="3"');
    expect(ring).not.toMatch(/border-radius:\d/);
  });

  it("Handbuch, Kommandoleiste, Tourleiste, Ziehen: die Stufen stehen im selben Stilobjekt wie vorher (Quelltext)", () => {
    const erwartet = {
      [HANDBUCH]: ['style={{ width: 26, height: 26, borderRadius: "var(--v4-r-klein)", flexShrink: 0, cursor: "pointer",',
        '<span style={{ width: 22, height: 22, borderRadius: "var(--v4-r-pille)", flexShrink: 0, marginTop: 1,\n                  background: C.accentLight,',
        '<span style={{ width: 22, height: 22, borderRadius: "var(--v4-r-pille)", flexShrink: 0, marginTop: 1,\n                    display: "flex",'],
      [KOMMANDO]: ['padding: "3px 7px", borderRadius: "var(--v4-r-klein)", ...NUM }}>Esc</kbd>',
        '<span style={{ width: 27, height: 27, borderRadius: "var(--v4-r-klein)", flexShrink: 0, fontSize: 13,'],
      [TOUR]: ['style={{ padding: "3px 9px", borderRadius: "var(--v4-r-pille)", cursor: "pointer",',
        'padding: "8px 10px", borderRadius: "var(--v4-r-klein)", background: C.okLight }}>'],
      [ZIEHEN]: ['padding: "8px 14px", borderRadius: "var(--v4-r-mittel)", fontSize: 13.5, fontWeight: 600,',
        'background: C.text, color: C.flaeche, padding: "11px 20px", borderRadius: "var(--v4-r-pille)",'],
    };
    for (const [d, stellen] of Object.entries(erwartet)) {
      const q = ohneKommentare(lies(d));
      for (const s of stellen) expect(q, `${d}: ${s}`).toContain(s);
    }
  });
});
