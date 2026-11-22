/* ==========================================================================
   V4-3b (zehnter Schnitt) — Hauptansicht Speicherlage: Form-Literale auf Radiusstufen

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung.
   Zuordnung wie Plan bis Einstieg (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die
   nächste (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Die Hauptansicht umfasst laut Inventar (HAUPTANSICHT_DATEIEN.Speicherlage) zwei Dateien: speicherlage.jsx
   (Leiste „Nicht gespeichert“ NichtGespeichert, Konfliktfenster, Offlineleiste „Keine Verbindung“) und
   teilkonflikt.jsx (Teilkonfliktfenster, Leiste TeilwegLeiste). Die Zeile hat 0 Farbliterale; Farben bleiben.

   Die Anzeigen sind daten- und sicherheitsrelevant (nicht gespeicherte Arbeit, Konflikte, Anmeldung im Codefeld).
   Beleg „nichts außer Radius“: Rückrechnung je Datei — der heutige Quelltext, mit den alten Werten aus der festen
   Tabelle zurückgesetzt, ergibt byte-gleich den Basis-Quelltext (SHA-256 aus der Fixture, ohne Git). Dazu ein
   Attributwächter (Feld- und ARIA-Attribute in Reihenfolge, Prüfsumme auf der Basis gemessen).

   Keine Uhr im Prüfwert, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare, HAUPTANSICHT_DATEIEN } from "../werkzeug/v4-inventar.mjs";
import { NichtGespeichert, Offlineleiste, SPEICHERLAGE } from "../src/ansichten/speicherlage.jsx";
import { TeilwegLeiste } from "../src/ansichten/teilkonflikt.jsx";
import { V4_RADIEN } from "../src/v4/tokens.js";
import { regelStufe, stufenIn, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, fixtureBefunde, sha256, SCHNITTE }
  from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Plan bis Einstieg, #460, und Nachzug #462). */
const BASIS = "93b5f7f7";
const SCHNITT = "Speicherlage";
const LAGE = "src/ansichten/speicherlage.jsx";
const TEIL = "src/ansichten/teilkonflikt.jsx";

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); keine feste Kante (Leisten mit Text). */
const SPEICHERLAGE_ZUORDNUNG = {
  [LAGE]: [
    { wo: "NichtGespeichert (Leiste „Nicht gespeichert“, role=alert)", alt: 12, stufe: "mittel" },
    { wo: "Offlineleiste („Keine Verbindung“, role=status)", alt: 12, stufe: "mittel" },
  ],
  [TEIL]: [
    { wo: "TeilwegLeiste (Entscheidung ausstehend, role=alert)", alt: 12, stufe: "mittel" },
  ],
};

/** Feld- und ARIA-Attribute in Quelltextreihenfolge (Name=Wert); wie v4-3b-einstieg.test.js. */
const RE_ATTRIBUT = /\b(id|htmlFor|type|name|autoComplete|autoFocus|autoCapitalize|inputMode|role|aria-[a-z]+|placeholder|disabled|required|pattern|maxLength|minLength|tabIndex|onSubmit|onKeyDown)=(\{[^}]*\}|"[^"]*")/g;
const attributeIn = (text) => [...text.matchAll(RE_ATTRIBUT)].map((m) => `${m[1]}=${m[2]}`);
/** Basis 93b5f7f7 (LF): Anzahl und SHA-256 der Attributliste je Datei. */
const ATTRIBUTE_BASIS = {
  [LAGE]: [11, "47bf9644f71aa9a74e62074fde9cc869c6ecdc74cc70afe74ecfb0deb8f7abfb"],
  [TEIL]: [21, "5191cb0fea18797b884b8e412f65a9ac03f63f7350d2db682be4ec698f659fc9"],
};

/** Heutiger Quelltext einer Datei mit den alten Werten der Tabelle zurückgesetzt. */
function rueckgerechnet(datei, tabelle = SPEICHERLAGE_ZUORDNUNG) {
  const stellen = tabelle[datei] || [];
  let i = 0;
  const text = lies(datei).replace(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g, (m, stufe) => {
    const st = stellen[i++];
    return st && st.stufe === stufe ? `borderRadius: ${st.alt}` : m;   // Fehler fällt über die Prüfsumme auf
  });
  return { text, ersetzt: i };
}

const radiusIn = (html, rolle) => (new RegExp(`role="${rolle}" style="[^"]*border-radius:([^;"]*)`).exec(html) || [])[1];

describe("V4-3b Speicherlage: Messung", () => {
  it("Form-Literale 3 → 0, Farbliterale 0; Form 2/2, „voll V4“ 0/2 → 2/2; Inline-Stile 49 und Dialogstellen 3 unverändert", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[SCHNITT];
    expect(e.dateien).toBe(2);
    expect(e.sichtbar).toBe(2);
    expect(e.formLiterale).toBe(0);
    expect(e.farbLiterale).toBe(0);
    expect(e.formErreicht).toBe(2);
    expect(e.ohneForm).toEqual([]);
    expect(e.farbrein).toBe(2);
    /* „voll V4“ = Form und Farbe ohne Literale; Inline-Stile zählen nicht (separat: 49, V4-3d). */
    expect(e.voll).toBe(2);
    expect(e.inlineStil).toBe(49);
    expect(e.dialog).toBe(3);
    expect(inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei).sort())
      .toEqual([...HAUPTANSICHT_DATEIEN.Speicherlage].sort());
  }, 60000);

  it("feste Tabelle: jede Stelle trägt genau die Stufe der Zuordnungsregel; Dateien der Tabelle in der Zeile", async () => {
    const inv = await inventar();
    const dateien = inv.eintraege.filter((x) => hauptansicht(x) === SCHNITT).map((x) => x.datei);
    for (const [datei, stellen] of Object.entries(SPEICHERLAGE_ZUORDNUNG)) {
      expect(dateien, datei).toContain(datei);
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo} (${s.alt})`).toBe(s.stufe);
      expect(stufenIn(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(Object.values(SPEICHERLAGE_ZUORDNUNG).flat()).toHaveLength(3);
  }, 60000);

  it("Tabellenwerte alt stimmen mit der Basis überein, ohne Git aus der Fixture; Schnitt in SCHNITTE", () => {
    expect(SCHNITTE[SCHNITT]).toBe("93b5f7f70d1b02700de3e19920b2ee0fd85b0b48");
    const fx = ladeBasisFixture(WURZEL);
    expect(fx.schnitte[SCHNITT].basis.startsWith(BASIS)).toBe(true);
    expect(fixtureBefunde(fx, SCHNITT)).toEqual([]);
    expect(Object.keys(fx.schnitte[SCHNITT].dateien).sort()).toEqual([...HAUPTANSICHT_DATEIEN.Speicherlage].sort());
    expect(abgleichMitFixture(fx, SCHNITT, SPEICHERLAGE_ZUORDNUNG, lies)).toEqual([]);
  });

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur Radiuswerte geändert, sonst byte-gleich zur Basis (beide Dateien, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    for (const d of HAUPTANSICHT_DATEIEN.Speicherlage) {
      const r = rueckgerechnet(d);
      expect(r.ersetzt, `Anzahl Stufen in ${d}`).toBe((SPEICHERLAGE_ZUORDNUNG[d] || []).length);
      expect(sha256(r.text), `${d} zurückgerechnet = Basis`).toBe(fx.dateien[d].sha256);
    }
  });

  it("Feld- und ARIA-Attribute (role, aria-*, Codefeld) in Reihenfolge wie auf der Basis", () => {
    for (const [d, [n, summe]] of Object.entries(ATTRIBUTE_BASIS)) {
      const a = attributeIn(lies(d));
      expect(a, d).toHaveLength(n);
      expect(sha256(JSON.stringify(a)), `${d}: Attribute gleich der Basis`).toBe(summe);
    }
  });

  it("Mutation der Tabelle (alt, Stufe, Anzahl) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const mit = (datei, i, x) => ({ ...SPEICHERLAGE_ZUORDNUNG,
      [datei]: SPEICHERLAGE_ZUORDNUNG[datei].map((s, j) => (j === i ? { ...s, ...x } : s)) });
    expect(abgleichMitFixture(fx, SCHNITT, mit(LAGE, 1, { alt: 14 }), lies))
      .toEqual([`${LAGE}: Offlineleiste („Keine Verbindung“, role=status): Basis 12, Tabelle alt 14`]);
    expect(abgleichMitFixture(fx, SCHNITT, { ...SPEICHERLAGE_ZUORDNUNG, [LAGE]: SPEICHERLAGE_ZUORDNUNG[LAGE].slice(1) }, lies)[0])
      .toBe(`${LAGE}: Anzahl: Basis 2, Tabelle 1`);
    /* Eine falsche Stufe in der Tabelle ergibt nicht die Basis. */
    const falsch = mit(TEIL, 0, { stufe: "gross" });
    expect(sha256(rueckgerechnet(TEIL, falsch).text)).not.toBe(fx.schnitte[SCHNITT].dateien[TEIL].sha256);
    /* Regel: 12 → mittel (gleicher Wert), 12 ist keine Kapsel (Leisten ab 40 px Höhe). */
    expect(regelStufe(12)).toBe("mittel");
    expect(parseFloat(V4_RADIEN.mittel)).toBe(12);
  });

  it("kein neuer Übergang (V4-2d) und kein Farbliteral: beide Dateien ohne „transition“ und ohne rgb/Hex", () => {
    for (const d of HAUPTANSICHT_DATEIEN.Speicherlage) {
      const q = ohneKommentare(lies(d));
      expect((q.match(/transition/g) || []).length, d).toBe(0);
      expect(q.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [], d).toEqual([]);
    }
  });
});

describe("V4-3b Speicherlage: Darstellung", () => {
  it("Offlineleiste: role=status, Text unverändert, Radius mittel", () => {
    const x = renderToStaticMarkup(h(Offlineleiste, { lage: { geholt: null } }));
    expect(x).toMatch(/^<div role="status"/);
    expect(x).toContain("Keine Verbindung");
    expect(x).toContain("Der Plan ist lesbar, aber Änderungen lassen sich nicht speichern.");
    expect(radiusIn(x, "status")).toBe("var(--v4-r-mittel)");
    expect(renderToStaticMarkup(h(Offlineleiste, { lage: null }))).toBe("");
  });

  it("NichtGespeichert: role=alert, Titel und Ausweg „Als Datei sichern“ unverändert, Radius mittel, Farben aus der Palette", () => {
    const x = renderToStaticMarkup(h(NichtGespeichert, { lage: { art: "netz" }, melde() {}, aufGeloest() {} }));
    expect(x).toMatch(/^<div role="alert"/);
    expect(x).toContain(SPEICHERLAGE.netz.titel);
    expect(x).toContain("Als Datei sichern");
    expect(radiusIn(x, "alert")).toBe("var(--v4-r-mittel)");
    expect(x).not.toMatch(/border-radius:\d/);
  });

  it("TeilwegLeiste: role=alert, Text und Knopf unverändert, Radius mittel", () => {
    const x = renderToStaticMarkup(h(TeilwegLeiste, { zustand: { phase: "neuLaden" }, onOeffnen() {} }));
    expect(x).toMatch(/^<div role="alert"/);
    expect(x).toContain("Neu laden nötig — Änderungen sind noch nicht gespeichert");
    expect(x).toContain(">Ansehen<");
    expect(radiusIn(x, "alert")).toBe("var(--v4-r-mittel)");
    const y = renderToStaticMarkup(h(TeilwegLeiste, { zustand: { phase: "frage", konflikte: [{}] }, onOeffnen() {} }));
    expect(y).toContain("Speichern wartet auf deine Entscheidung");
    expect(y).toContain(">Jetzt entscheiden<");
  });

  it("Quelltext: die Stufe steht im selben Stilobjekt wie vorher", () => {
    const q = ohneKommentare(lies(LAGE));
    expect(q).toContain('<div role="alert" style={{ padding: "16px 20px", borderRadius: "var(--v4-r-mittel)", marginBottom: 20,\n      background: C.dangerLight, border: `1px solid ${C.danger}44` }}>');
    expect(q).toContain('<div role="status" style={{ padding: "12px 18px", borderRadius: "var(--v4-r-mittel)", marginBottom: 20,\n      background: C.warnLight, border: `1px solid ${C.warn}33`,');
    expect(ohneKommentare(lies(TEIL))).toContain('<div role="alert" style={{ padding: "12px 18px", borderRadius: "var(--v4-r-mittel)", marginBottom: 20, background: C.warnLight,');
  });
});
