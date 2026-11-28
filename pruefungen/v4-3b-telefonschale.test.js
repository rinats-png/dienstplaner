/* ==========================================================================
   V4-3b (achter Schnitt) — Hauptansicht Telefonschale: Form-Literale auf Radiusstufen

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung.
   Zuordnung wie Plan bis Import (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die nächste
   (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Die Hauptansicht umfasst laut Inventar eine Datei: src/ansichten/mobil.jsx (Heute, Mein Plan, Anliegen, Mehr; Rolle
   mitarbeiter). Dazu die vier festen Radien der Telefonschalen-Klassen im globalen Stil (src/gestalt/stil.js: .m-zahl,
   .m-tabs button, .m-blatt, .m-griff), die V4-3a ausdrücklich an diesen Schritt übergeben hat (Nachtrag V4-3a,
   „Bewusst nicht in V4-3a“). Die Klassen stehen nur in mobil.jsx.

   Beleg „nichts außer Radius“: Rückrechnung je Datei — der heutige Quelltext, mit den alten Werten aus der festen
   Tabelle zurückgesetzt, ergibt byte-gleich den Basis-Quelltext (SHA-256: mobil.jsx aus der Fixture, stil.js als
   feste Konstante unten; beides ohne Git). Farbliterale: keine, vorher wie nachher.

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare, globalerStil } from "../werkzeug/v4-inventar.mjs";
import { MobilSchale, MKarte, MBlatt, M_TABS } from "../src/ansichten/mobil.jsx";
import { demobestand } from "../src/lib/fachlogik.js";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, sha256, basisText } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan bis Import). */
const BASIS = "55db4363";
const SCHNITT = "Telefonschale";
const MOBIL = "src/ansichten/mobil.jsx";
const STIL = "src/gestalt/stil.js";

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); kante = kleinere Kante, falls fest. */
const TELEFON_ZUORDNUNG = {
  [MOBIL]: [
    { wo: "MKarte (Karte der Schale)", alt: 18, stufe: "gross" },
    { wo: "Heute: Aufgabensymbol 40×40", alt: 14, kante: 40, stufe: "mittel" },
    { wo: "Stempeln: Fläche Kommen/Gehen (Höhe 56)", alt: 18, kante: 56, stufe: "gross" },
    { wo: "Mein Plan: Farbstreifen 3 px", alt: 2, kante: 3, stufe: "pille" },
    { wo: "Mein Plan: Monatsfeld (Quadrat)", alt: 12, stufe: "mittel" },
    { wo: "Tagblatt: Tausch suchen (Höhe 50)", alt: 16, kante: 50, stufe: "gross" },
    { wo: "Tagblatt: Frei beantragen (Höhe 50)", alt: 16, kante: 50, stufe: "gross" },
    { wo: "Tagblatt: gern arbeiten (Höhe 50)", alt: 16, kante: 50, stufe: "gross" },
    { wo: "Tagblatt: Wunsch (Höhe 46)", alt: 16, kante: 46, stufe: "gross" },
    { wo: "Anliegen: Frei beantragen (Höhe 52)", alt: 17, kante: 52, stufe: "gross" },
    { wo: "Anliegen: Krank melden (Höhe 52)", alt: 17, kante: 52, stufe: "gross" },
    { wo: "Anliegen: Zusagen (Höhe 46)", alt: 15, kante: 46, stufe: "gross" },
    { wo: "Anliegen: Absagen (Höhe 46)", alt: 15, kante: 46, stufe: "gross" },
    { wo: "Anliegen: Ich übernehme (Höhe 46)", alt: 15, kante: 46, stufe: "gross" },
    { wo: "Mehr: Abmelden (Höhe 46)", alt: 15, kante: 46, stufe: "gross" },
    { wo: "Checkliste: Fortschrittskreis 54×54", alt: 27, kante: 54, stufe: "pille" },
    { wo: "Checkliste: Punkt (Knopf)", alt: 14, stufe: "mittel" },
    { wo: "Checkliste: Haken 26×26", alt: 13, kante: 26, stufe: "pille" },
    { wo: "Selbstplanung: Austragen", alt: 10, stufe: "mittel" },
    { wo: "Selbstplanung: Dienst eintragen", alt: 11, stufe: "mittel" },
    { wo: "Notruf: Art wählen", alt: 14, stufe: "mittel" },
    { wo: "Offene Schichten: Zurückziehen", alt: 12, stufe: "mittel" },
    { wo: "Offene Schichten: Ich übernehme das", alt: 12, stufe: "mittel" },
    { wo: "Mehr: Mitteilungen ein/aus", alt: 12, stufe: "mittel" },
    { wo: "Mehr: E-Mail-Adresse", alt: 12, stufe: "mittel" },
    { wo: "Mehr: Zustellweg E-Mail/Gerät", alt: 10, stufe: "mittel" },
    { wo: "Zeit bestätigen: Wie geplant (Höhe 46)", alt: 15, kante: 46, stufe: "gross" },
    { wo: "Antragsblatt: Antrag stellen (Höhe 52)", alt: 17, kante: 52, stufe: "gross" },
    { wo: "Wünsche: Monatsfeld (Quadrat)", alt: 12, stufe: "mittel" },
  ],
};

/** Globaler Stil (stil.js): die vier Telefonschalen-Klassen. vorher/nachher wörtlich; kante = Höhe, falls fest. */
const STIL_ZUORDNUNG = [
  { regel: ".m-zahl", alt: 10, kante: 19, stufe: "pille",
    vorher: "height:19px; padding:0 4px; border-radius:10px;", nachher: "height:19px; padding:0 4px; border-radius:var(--v4-r-pille);" },
  { regel: ".m-tabs button", alt: 16, stufe: "gross",
    vorher: "border:0; border-radius:16px; background:transparent;", nachher: "border:0; border-radius:var(--v4-r-gross); background:transparent;" },
  { regel: ".m-blatt", alt: 26, stufe: "gross",
    vorher: "border-radius:26px 26px 0 0;", nachher: "border-radius:var(--v4-r-gross) var(--v4-r-gross) 0 0;" },
  { regel: ".m-griff", alt: 3, kante: 4.5, stufe: "pille",
    vorher: "height:4.5px; border-radius:3px;", nachher: "height:4.5px; border-radius:var(--v4-r-pille);" },
];
/** SHA-256 von src/gestalt/stil.js (LF) auf der Basis 55db4363 (git show 55db4363:src/gestalt/stil.js). */
const STIL_BASIS_SHA256 = "5fce0b5f584eaeeafced50967ee22c0f0f6374c8d9ced8419c9da6cd897a546f";

/** Bewusste Abweichung von der Basis, nicht Teil des Radiusschnitts: „Fest eingeplant“ (WP-I7 Teil 6, Anheften;
 *  Betreiberentscheidung, Hinweis an eigenen angehefteten Einteilungen) — ein Import, der Baustein MFest (ohne Inline-Stil,
 *  ohne Radius), vier Einhängestellen und ein Zusatz im zugänglichen Namen des Monatsfelds. Die Rückrechnung nimmt genau
 *  diese Stellen wörtlich zurück (jede genau einmal); danach muss der Text byte-gleich die Basis ergeben. Jede weitere
 *  Änderung an mobil.jsx macht die Prüfung rot, wie zuvor. Prüfung des Hinweises: pruefungen/fest-eingeplant.test.js. */
const NACHTRAG_FEST = [
  ['import { festEingeplant, FEST_EINGEPLANT_TEXT } from "../lib/festeingeplant.js";\n', ""],
  ["/* „Fest eingeplant“ (WP-I7 Teil 6): sichtbarer Text, keine Aktion; nur an eigenen Einteilungen (lib/festeingeplant.js). */\n"
    + "export const MFest = () => (\n"
    + '  <div className="ssub" data-fest-eingeplant=""><Pill size="sm" tone="accent">{FEST_EINGEPLANT_TEXT}</Pill></div>);\n', ""],
  ["          {festEingeplant(m, p, p, d0, true) && <MFest />}\n", ""],
  ["                  {festEingeplant(m, ich, sitz.person, d, !!da) && <MFest />}\n", ""],
  ['${festEingeplant(m, ich, sitz.person, d, !!da) ? `, ${FEST_EINGEPLANT_TEXT}` : ""}`)}', "`)}"],
  ["                {festEingeplant(m, ich, sitz.person, gewaehlt.datum, true) && <MFest />}\n", ""],
];

/** Heutiger mobil.jsx-Quelltext mit den alten Werten der Tabelle zurückgesetzt (und dem Nachtrag zurückgenommen). */
function rueckgerechnetMobil() {
  const stellen = TELEFON_ZUORDNUNG[MOBIL];
  let i = 0;
  let text = lies(MOBIL).replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    const s = stellen[i++];
    if (!s || s.stufe !== stufe) return m;          // fällt unten über die Prüfsumme auf
    return `borderRadius: ${s.alt}`;
  });
  let nachtrag = 0;
  for (const [neu, alt] of NACHTRAG_FEST) if (text.split(neu).length === 2) { text = text.replace(neu, () => alt); nachtrag++; }
  return { text, ersetzt: i, nachtrag };
}

/** Heutiger stil.js-Quelltext mit den alten Werten zurückgesetzt. */
function rueckgerechnetStil(tabelle = STIL_ZUORDNUNG) {
  let t = lies(STIL);
  for (const s of tabelle) t = t.split(s.nachher).join(s.vorher);
  return t;
}

/** Rumpf einer Regel im globalen Stil: ab "\n<regel>{" bis zur nächsten Zeile, die mit einem Selektor beginnt. Die
 *  Rümpfe enthalten ${C.…} (geschweifte Klammern), daher nicht bis zur ersten "}". */
const rumpfVon = (css, regel) => {
  const a = css.indexOf(`\n${regel}{`);
  if (a < 0) return null;
  const rest = css.slice(a + regel.length + 2);
  const e = rest.search(/\n(?:[.@#a-z]|\/\*)/);
  return e < 0 ? rest : rest.slice(0, e);
};
const radiusVon = (css, regel) => ((rumpfVon(css, regel) || "").match(/border-radius:([^;]+);/) || [])[1];

describe("V4-3b Telefonschale: Messung", () => {
  it("keine Form- und Farbliterale; Form 1/1; „voll V4“ 1/1; Inline-Stile und Dialogstellen unverändert", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.dateien).toBe(1);
    expect(e.sichtbar).toBe(1);
    expect(e.ohneForm).toEqual([]);
    expect(e.formErreicht).toBe(1);
    expect(e.formLiterale).toBe(0);
    expect(e.farbLiterale).toBe(0);
    expect(e.farbrein).toBe(1);
    /* „voll V4“ = Form und Farbe ohne Literale; Inline-Stile zählen nicht (separat: 241, V4-3d). */
    expect(e.voll).toBe(1);
    expect(e.inlineStil).toBe(241);
    expect(e.dialog).toBe(13);
    expect(inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei)).toEqual([MOBIL]);
  }, 60000);

  it("globaler Stil: stil.js ohne die vier Telefonschalen-Radien (7 → 3 Radien, Schatten 2 unverändert)", () => {
    const g = globalerStil();
    expect(g[STIL]).toEqual({ radien: 3, schatten: 2 });
    for (const s of STIL_ZUORDNUNG) {
      expect(radiusVon(lies(STIL), s.regel), s.regel).toBe(s.nachher.match(/border-radius:([^;]+);/)[1]);
    }
  });

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel (mobil.jsx und stil.js)", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort();
    expect(Object.keys(TELEFON_ZUORDNUNG).sort()).toEqual(dateien);
    const stellen = TELEFON_ZUORDNUNG[MOBIL];
    for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${s.wo} (${s.alt})`).toBe(s.stufe);
    expect(stufenIn(lies(MOBIL))).toEqual(stellen.map((s) => s.stufe));
    expect(stellen).toHaveLength(29);
    for (const s of STIL_ZUORDNUNG) {
      expect(regelStufe(s.alt, s.kante), s.regel).toBe(s.stufe);
      expect(s.nachher).toContain(`var(--v4-r-${s.stufe})`);
      expect(s.vorher).toContain(`border-radius:${s.alt}px`);
      if (s.kante !== undefined) expect(s.vorher).toContain(`height:${s.kante}px`);
    }
  }, 60000);

  it("Tabellenwerte alt/kante stimmen mit der Basis überein, ohne Git aus der Fixture", () => {
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(Object.keys(fx.schnitte[SCHNITT].dateien)).toEqual([MOBIL]);
    expect(abgleichMitFixture(fx, SCHNITT, TELEFON_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture und stil.js-Prüfsumme gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
    expect(sha256(basisText(WURZEL, fx.schnitte[SCHNITT].basis, STIL))).toBe(STIL_BASIS_SHA256);
  });

  it("Rückrechnung: nur Radiuswerte geändert, sonst byte-gleich zur Basis (mobil.jsx und stil.js, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    const r = rueckgerechnetMobil();
    expect(r.ersetzt, "Anzahl Stufen in mobil.jsx").toBe(TELEFON_ZUORDNUNG[MOBIL].length);
    expect(r.nachtrag, "Nachtrag „Fest eingeplant“: jede Stelle genau einmal").toBe(NACHTRAG_FEST.length);
    expect(sha256(r.text), "mobil.jsx zurückgerechnet = Basis").toBe(fx.dateien[MOBIL].sha256);
    for (const s of STIL_ZUORDNUNG) expect(lies(STIL).split(s.nachher), s.regel).toHaveLength(2);
    expect(sha256(rueckgerechnetStil()), "stil.js zurückgerechnet = Basis").toBe(STIL_BASIS_SHA256);
  });

  it("Mutation der Tabelle (alt, kante, Stufe) fällt ohne Git auf; Kreise bleiben Kreise", () => {
    const fx = ladeBasisFixture(WURZEL);
    const echt = TELEFON_ZUORDNUNG[MOBIL];
    const mit = (i, x) => ({ [MOBIL]: echt.map((s, j) => (j === i ? { ...s, ...x } : s)) });
    expect(abgleichMitFixture(fx, SCHNITT, mit(1, { alt: 12 }), lies))
      .toEqual([`${MOBIL}: Heute: Aufgabensymbol 40×40: Basis 14, Tabelle alt 12`]);
    expect(abgleichMitFixture(fx, SCHNITT, mit(15, { kante: 56 }), lies))
      .toEqual([`${MOBIL}: Checkliste: Fortschrittskreis 54×54: kante 56 nicht im Stilobjekt der Basis`]);
    expect(abgleichMitFixture(fx, SCHNITT, { [MOBIL]: echt.slice(1) }, lies)[0]).toBe(`${MOBIL}: Anzahl: Basis 29, Tabelle 28`);
    /* stil.js: eine falsche alte Zahl ergibt nicht die Basis. */
    const falsch = STIL_ZUORDNUNG.map((s, i) => (i === 2 ? { ...s, vorher: "border-radius:24px 24px 0 0;" } : s));
    expect(sha256(rueckgerechnetStil(falsch))).not.toBe(STIL_BASIS_SHA256);
    /* Kreise (Radius = halbe Kante) und der 3-px-Streifen bleiben rund; 15 liegt mittig zwischen 12 und 18 → gross. */
    expect(regelStufe(27, 54)).toBe("pille");
    expect(regelStufe(13, 26)).toBe("pille");
    expect(regelStufe(2, 3)).toBe("pille");
    expect(regelStufe(15)).toBe("gross");
    expect(regelStufe(14, 40)).toBe("mittel");
  });

  it("kein neuer Übergang (V4-2d): mobil.jsx und die .m-Regeln im globalen Stil ohne Übergang", () => {
    expect((ohneKommentare(lies(MOBIL)).match(/transition/gi) || []).length).toBe(0);
    const css = lies(STIL);
    for (const s of STIL_ZUORDNUNG) {
      const rumpf = rumpfVon(css, s.regel);
      expect(rumpf, s.regel).toContain("border-radius:");
      expect(rumpf, s.regel).not.toMatch(/transition/);
    }
  });

  it("keine Farbliterale in mobil.jsx (vorher wie nachher)", () => {
    expect(ohneKommentare(lies(MOBIL)).match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
  });
});

describe("V4-3b Telefonschale: Darstellung", () => {
  const sitzung = () => {
    const db = demobestand();
    const m = db.mandanten[0];
    const ich = (m.personen || []).find((p) => p.rolle === "mitarbeiter") || m.personen[0];
    return { rolle: "mitarbeiter", db, mandant: m, person: ich };
  };
  const akt = new Proxy({}, { get: () => () => {} });

  it("MKarte: Stufe gross, Schatten weiter var(--schatten)", () => {
    const x = renderToStaticMarkup(h(MKarte, {}, "Inhalt"));
    expect(x).toContain("border-radius:var(--v4-r-gross)");
    expect(x).toContain("box-shadow:var(--schatten)");
    expect(x).not.toMatch(/border-radius:18px/);
  });

  it("MBlatt: Rahmen, Blatt und Griff mit unveränderten Klassen, role=dialog und Titel", () => {
    const x = renderToStaticMarkup(h(MBlatt, { offen: true, onClose() {}, titel: "Probe" }, "Inhalt"));
    expect(x).toContain('class="m-blattrahmen" role="dialog" aria-modal="true" aria-label="Probe"');
    expect(x).toContain('class="m-blatt"');
    expect(x).toContain('class="m-griff" aria-hidden="true"');
  });

  it("Schale je Reiter: Tableiste mit unveränderten Beschriftungen; nur Radiusstufen aus mobil.jsx", () => {
    const sitz = sitzung();
    for (const t of M_TABS) {
      const x = renderToStaticMarkup(h(MobilSchale, { sitz, akt, dialoge: null, aufRechner: () => {}, startTab: t.id }));
      expect(x, t.id).toContain('<nav class="m-tabs" aria-label="Bereiche">');
      for (const u of M_TABS) expect(x, `${t.id}: ${u.label}`).toContain(u.label);
      expect(x, t.id).toContain("var(--v4-r-");
    }
    expect(M_TABS.map((t) => t.label)).toEqual(["Heute", "Mein Plan", "Anliegen", "Mehr"]);
  });

  it("Quelltext: Kreise und Knöpfe tragen die Stufe im selben Stilobjekt wie vorher", () => {
    const q = ohneKommentare(lies(MOBIL));
    expect(q).toContain('{{ width: 54, height: 54, borderRadius: "var(--v4-r-pille)", flexShrink: 0,');
    expect(q).toContain('{{ width: 26, height: 26, borderRadius: "var(--v4-r-pille)", flexShrink: 0,');
    expect(q).toContain('{{ width: 3, alignSelf: "stretch", borderRadius: "var(--v4-r-pille)",');
    expect(q).toContain('{{ width: 40, height: 40, borderRadius: "var(--v4-r-mittel)", flexShrink: 0, display: "flex",');
    expect(q).toContain('{{ height: 46, borderRadius: "var(--v4-r-gross)" }}');
  });
});
