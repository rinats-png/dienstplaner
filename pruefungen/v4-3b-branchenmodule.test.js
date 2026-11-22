/* ==========================================================================
   V4-3b (elfter Schnitt) — Hauptansicht Branchenmodule: Form-Literale auf Radiusstufen

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung.
   Zuordnung wie Plan bis Speicherlage (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die
   nächste (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Die Hauptansicht umfasst laut Inventar (Gruppe Branchenmodul) 13 Dateien unter src/module/. Form-Literale hatten
   acht davon, je genau eines: der Rahmen RAHMEN in kern.jsx (Modulzeile, Karte Ausnahmeweg, Rahmen der
   Moduloberflächen) und die Karte (article) je Eintrag in sieben Moduloberflächen. Alle acht sind 8 px → klein (8 px),
   also ohne sichtbare Änderung. Die übrigen fünf Dateien (bereichsplan, geteilterdienst, kontimodelle, maschinenqual,
   pflegequal) haben keine eigene Form (Listen, Tabellen, Definitionslisten im Rahmen von kern.jsx); sie bleiben
   unverändert. Die Zeile hat 0 Farbliterale; Farben (currentColor) bleiben.

   Beleg „nichts außer Radius“: Rückrechnung je Datei (alle 13) — der heutige Quelltext, mit den alten Werten aus der
   festen Tabelle zurückgesetzt, ergibt byte-gleich den Basis-Quelltext (SHA-256 aus der Fixture, ohne Git). Dazu ein
   Attributwächter (Feld- und ARIA-Attribute in Reihenfolge, Prüfsumme auf der Basis gemessen).

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare } from "../werkzeug/v4-inventar.mjs";
import { BranchenModule } from "../src/module/kern.jsx";
import { MODUL_OBERFLAECHEN } from "../src/module/index.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";
import { ROLLEN, PRUEF_LISTE, betriebMitDaten, sitzungFuerOberflaeche, darfRolle } from "./hilfen/modulabnahme.mjs";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, fixtureBefunde, sha256, SCHNITTE }
  from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan bis Speicherlage, #463). */
const BASIS = "bb782c44";
const SCHNITT = "Branchenmodule";
const M = (n) => `src/module/${n}.jsx`;
/** Alle Dateien der Zeile (Inventar, Gruppe Branchenmodul), sortiert. */
const DATEIEN = ["anlagen", "bereichsplan", "bereitschaftsdienst", "funktionsdienst", "geteilterdienst", "kern",
  "kontimodelle", "maschinenqual", "objektbericht", "pflegequal", "posten", "rotation", "wachbuch"].map(M);
/** Dateien ohne eigene Form (kein Radius auf der Basis); unverändert. */
const OHNE_FORM = ["bereichsplan", "geteilterdienst", "kontimodelle", "maschinenqual", "pflegequal"].map(M);

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); keine feste Kante (Karten mit Text). */
const BRANCHENMODULE_ZUORDNUNG = {
  [M("anlagen")]: [{ wo: "AnlagenUebersicht: Karte je Anlage (article)", alt: 8, stufe: "klein" }],
  [M("bereitschaftsdienst")]: [{ wo: "BereitschaftsUebersicht: Karte je Person (article)", alt: 8, stufe: "klein" }],
  [M("funktionsdienst")]: [{ wo: "FunktionsUebersicht: Karte je Funktionsbereich (article)", alt: 8, stufe: "klein" }],
  [M("kern")]: [{ wo: "RAHMEN: Modulzeile (article), Karte Ausnahmeweg, Rahmen der Moduloberflächen (section)", alt: 8, stufe: "klein" }],
  [M("objektbericht")]: [{ wo: "ObjektberichtVorschau: Karte je Objekt (article)", alt: 8, stufe: "klein" }],
  [M("posten")]: [{ wo: "PostenUebersicht: Karte je Objekt (article)", alt: 8, stufe: "klein" }],
  [M("rotation")]: [{ wo: "RotationUebersicht: Karte je Person (article)", alt: 8, stufe: "klein" }],
  [M("wachbuch")]: [{ wo: "WachbuchTages: Karte je Objekt (article)", alt: 8, stufe: "klein" }],
};

/** Feld- und ARIA-Attribute in Quelltextreihenfolge (Name=Wert); wie v4-3b-speicherlage.test.js. */
const RE_ATTRIBUT = /\b(id|htmlFor|type|name|autoComplete|autoFocus|autoCapitalize|inputMode|role|aria-[a-z]+|placeholder|disabled|required|pattern|maxLength|minLength|tabIndex|onSubmit|onKeyDown)=(\{[^}]*\}|"[^"]*")/g;
const attributeIn = (text) => [...text.matchAll(RE_ATTRIBUT)].map((m) => `${m[1]}=${m[2]}`);
/** Basis bb782c44 (LF): Anzahl und SHA-256 der Attributliste je geänderter Datei. */
const ATTRIBUTE_BASIS = {
  [M("anlagen")]: [1, "bc4085959713e77caff688fb0a6a7cd26969d7dc2ed84c44a23e0ca9477068da"],
  [M("bereitschaftsdienst")]: [1, "e3dae297ca6479739974f4604dbb55aab6779f6708c97b293ee42b1f11013e65"],
  [M("funktionsdienst")]: [1, "392d9c6526122043f350e6aec2e666be3d2c10242c9505260ed5102f97bfe0d3"],
  [M("kern")]: [32, "2fdaeb92b714dfbc0fcc391438926095f2414a79f279c0764260ba4fdbf2b762"],
  [M("objektbericht")]: [1, "87a19d0633e5fbb0c0b91391a420cf2e9e965920062d3497ec44409f6f418f46"],
  [M("posten")]: [1, "b3c79f005f38f324dfdaac142ea641b8c17c469e628453e0ecd8caf6f616b91b"],
  [M("rotation")]: [2, "9bce7c51f64ad561af480b02e93a6c347fbe4960b3e59d283dbede96b0282340"],
  [M("wachbuch")]: [1, "e507dc5a72656be411d2b69f0ce59ebeb5943cbc788834ac09730e380c8e715d"],
};

/** Heutiger Quelltext einer Datei mit den alten Werten der Tabelle zurückgesetzt. */
function rueckgerechnet(datei, tabelle = BRANCHENMODULE_ZUORDNUNG, text = lies(datei)) {
  const stellen = tabelle[datei] || [];
  let i = 0;
  const aus = text.replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    const st = stellen[i++];
    return st && st.stufe === stufe ? `borderRadius: ${st.alt}` : m;   // Fehler fällt über die Prüfsumme auf
  });
  return { text: aus, ersetzt: i };
}

/* Render der echten Komponente (wie pruefungen/modul-abnahme-oberflaeche.test.js): Prüfliste mit Modulen
   „vorlaeufig“ nur im Test; die Registry bleibt „geplant“. Leitung (org.edit) sieht alle zwölf Oberflächen. */
const akt = { setzeEinstellung: () => {}, moduldatenAusnahme: () => {} };
const LEITUNG = ROLLEN.find((r) => r.rolle === "leitung" && r.betrieb === 0);
function rendere(liste = PRUEF_LISTE) {
  const g = betriebMitDaten();
  const sitz = sitzungFuerOberflaeche(g, LEITUNG);
  return renderToStaticMarkup(h(BranchenModule, { sitz, akt, darf: darfRolle(LEITUNG.rolle), liste,
    kontext: { personenImDienst: () => (sitz.mandant ? sitz.mandant.personen.filter((p) => p.rolle === "mitarbeiter") : []) } }));
}
/** Radien (border-radius) im Markup, je Wert gezählt. */
const radien = (s) => [...s.matchAll(/border-radius:([^;"]*)/g)].map((m) => m[1]);
const alsRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Rahmen einer Moduloberfläche (section mit Stil vor dem Namen, wie `rahmen` in kern.jsx) bis zum nächsten Rahmen.
    Die Regionen in den Oberflächen setzen den Namen vor den Stil und zählen hier nicht als Grenze. */
const region = (s, name) => {
  const m = new RegExp(`<section style="[^"]*" aria-label="${alsRe(name)}">`).exec(s);
  if (!m) return "";
  const z = s.indexOf('<section style="', m.index + 1);
  return s.slice(m.index, z < 0 ? undefined : z);
};

describe("V4-3b Branchenmodule: Messung", () => {
  it("Form-Literale 8 → 0, Farbliterale 0; Form 0/13 → 8/13, „voll V4“ 0/13 → 8/13; Inline-Stile 115 und Dialog 1 unverändert", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.dateien).toBe(13);
    expect(e.sichtbar).toBe(13);
    expect(e.zeilen).toBe(876);
    expect(e.formLiterale).toBe(0);
    expect(e.farbLiterale).toBe(0);
    expect(e.farbrein).toBe(13);
    expect(e.formErreicht).toBe(8);
    expect(e.tokenDirekt).toBe(8);
    /* Ohne eigene Form bleiben die fünf Dateien ohne Radius (keine Neugestaltung). */
    expect(e.ohneForm).toEqual(OHNE_FORM);
    /* „voll V4“ = Form und Farbe ohne Literale; Inline-Stile zählen nicht (separat: 115, V4-3d). */
    expect(e.voll).toBe(8);
    expect(e.inlineStil).toBe(115);
    expect(e.dialog).toBe(1);
    expect(inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort()).toEqual(DATEIEN);
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel; Dateien der Tabelle in der Zeile", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei);
    for (const [datei, stellen] of Object.entries(BRANCHENMODULE_ZUORDNUNG)) {
      expect(dateien, datei).toContain(datei);
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    for (const d of OHNE_FORM) expect(stufenIn(lies(d)), d).toEqual([]);
    expect(Object.values(BRANCHENMODULE_ZUORDNUNG).flat()).toHaveLength(8);
  }, 60000);

  it("Tabellenwerte alt stimmen mit der Basis überein, ohne Git aus der Fixture; Schnitt in SCHNITTE", () => {
    expect(SCHNITTE[SCHNITT]).toBe("bb782c4492b9de162dd19db17ff7d4c16c3a9e19");
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(fixtureBefunde(fx, SCHNITT, DATEIEN)).toEqual([]);
    expect(Object.keys(fx.schnitte[SCHNITT].dateien).sort()).toEqual(DATEIEN);
    expect(abgleichMitFixture(fx, SCHNITT, BRANCHENMODULE_ZUORDNUNG, lies)).toEqual([]);
    /* Die Dateien ohne eigene Form hatten auf der Basis kein Radius-Literal. */
    for (const d of OHNE_FORM) expect(fx.schnitte[SCHNITT].dateien[d].literale, d).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radiuswerte geändert, sonst byte-gleich zur Basis (alle 13 Dateien, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    for (const d of DATEIEN) {
      const r = rueckgerechnet(d);
      expect(r.ersetzt, `Anzahl Stufen in ${d}`).toBe((BRANCHENMODULE_ZUORDNUNG[d] || []).length);
      expect(sha256(r.text), `${d} zurückgerechnet = Basis`).toBe(fx.dateien[d].sha256);
    }
  });

  it("Feld- und ARIA-Attribute (role, aria-*, Felder des Ausnahmewegs) in Reihenfolge wie auf der Basis", () => {
    for (const [d, [n, summe]] of Object.entries(ATTRIBUTE_BASIS)) {
      const a = attributeIn(lies(d));
      expect(a, d).toHaveLength(n);
      expect(sha256(JSON.stringify(a)), `${d}: Attribute gleich der Basis`).toBe(summe);
    }
  });

  it("Mutation (alt, Stufe, Token, Text, Anzahl) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const basisSumme = (d) => fx.schnitte[SCHNITT].dateien[d].sha256;
    const mit = (datei, x) => ({ ...BRANCHENMODULE_ZUORDNUNG, [datei]: [{ ...BRANCHENMODULE_ZUORDNUNG[datei][0], ...x }] });
    expect(abgleichMitFixture(fx, SCHNITT, mit(M("posten"), { alt: 12 }), lies))
      .toEqual([`${M("posten")}: PostenUebersicht: Karte je Objekt (article): Basis 8, Tabelle alt 12`]);
    expect(abgleichMitFixture(fx, SCHNITT, { ...BRANCHENMODULE_ZUORDNUNG, [M("kern")]: [] }, lies)[0])
      .toBe(`${M("kern")}: Anzahl: Basis 1, Tabelle 0`);
    /* Eine falsche Stufe in der Tabelle ergibt nicht die Basis. */
    expect(sha256(rueckgerechnet(M("wachbuch"), mit(M("wachbuch"), { stufe: "mittel" })).text)).not.toBe(basisSumme(M("wachbuch")));
    /* Ein anderer Token (Stufe im Quelltext) oder ein geänderter Text ergibt nicht die Basis. */
    const q = lies(M("rotation"));
    expect(sha256(rueckgerechnet(M("rotation"), undefined, q.replace("var(--v4-r-klein)", "var(--v4-r-mittel)")).text))
      .not.toBe(basisSumme(M("rotation")));
    expect(sha256(rueckgerechnet(M("rotation"), undefined, q.replace("Noch keine Rotation geplant.", "Keine Rotation geplant.")).text))
      .not.toBe(basisSumme(M("rotation")));
    /* Regel: 8 → klein (gleicher Wert); 8 ist keine Kapsel (Karten mit Überschrift und Text). */
    expect(regelStufe(8)).toBe("klein");
    expect(parseFloat(V4_RADIEN.klein)).toBe(8);
  });

  it("kein neuer Übergang (V4-2d), kein Farbliteral, kein Schatten: alle 13 Dateien", () => {
    for (const d of DATEIEN) {
      const q = ohneKommentare(lies(d));
      expect((q.match(/transition/g) || []).length, d).toBe(0);
      expect(q.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [], d).toEqual([]);
      expect(q.match(/boxShadow/g) || [], d).toEqual([]);
    }
  });
});

describe("V4-3b Branchenmodule: Darstellung (echte Komponente BranchenModule)", () => {
  it("Leitung mit Prüfliste: alle Radien im Markup sind var(--v4-r-klein), keiner ist 8px; Farbe currentColor bleibt", () => {
    const s = rendere();
    const r = radien(s);
    /* 12 Modulzeilen + 12 Rahmen der Oberflächen + 8 Karten in den Oberflächen des Prüfbetriebs. */
    expect(r.length).toBe(BRANCHENMODULE.length + MODUL_OBERFLAECHEN.length + 8);
    expect([...new Set(r)]).toEqual(["var(--v4-r-klein)"]);
    expect(s).not.toMatch(/border-radius:\d/);
    expect(s).toContain("border:1px solid currentColor;border-radius:var(--v4-r-klein);padding:12px");
  });

  it("Modulzeilen (Registry „geplant“, wie im Betrieb sichtbar): je Modul ein article mit Stufe klein, Texte unverändert", () => {
    const s = rendere(BRANCHENMODULE);
    expect(s).toContain("Keine Moduloberfläche: Kein Branchenmodul wirkt in diesem Betrieb.");
    for (const mod of BRANCHENMODULE) {
      const a = new RegExp(`<article style="([^"]*)" aria-label="${alsRe(mod.name)}">`).exec(s);
      expect(a, mod.name).not.toBeNull();
      expect(a[1], mod.name).toContain("border-radius:var(--v4-r-klein)");
    }
    expect(s).toContain("in Vorbereitung");
  });

  it("Moduloberflächen: jeder Rahmen (section) und jede Karte (article) darin mit Stufe klein", () => {
    const s = rendere();
    let karten = 0;
    for (const o of MODUL_OBERFLAECHEN) {
      const x = region(s, o.titel);
      expect(x, o.titel).not.toBe("");
      expect(x.slice(0, x.indexOf(">")), `${o.titel}: Rahmen`).toContain("border-radius:var(--v4-r-klein)");
      for (const m of x.matchAll(/<article style="([^"]*)"/g)) { karten++; expect(m[1], o.titel).toContain("border-radius:var(--v4-r-klein)"); }
    }
    /* Karten (article) der sieben Oberflächen mit eigener Karte im Prüfbetrieb (betriebMitDaten). */
    expect(karten).toBe(8);
  });

  it("Quelltext: die Stufe steht im selben Stilobjekt wie vorher", () => {
    const karte = 'style={{ border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere" }}';
    for (const n of ["anlagen", "bereitschaftsdienst", "funktionsdienst", "objektbericht", "posten", "rotation", "wachbuch"])
      expect(ohneKommentare(lies(M(n))), n).toContain(karte);
    expect(ohneKommentare(lies(M("kern"))))
      .toContain('const RAHMEN = { border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere", maxWidth: "100%" };');
  });
});
