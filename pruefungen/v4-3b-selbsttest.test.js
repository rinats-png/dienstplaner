/* ==========================================================================
   V4-3b (vierzehnter Schnitt) — Zeile „Selbsttest“: Form-Literal auf Radiusstufe, Farbliterale geprüft

   Akzeptanz (docs/acc45/work-packages.json, V4-3b): Inline-borderRadius/boxShadow-Literale der Hauptansicht durch
   Tokens ersetzt; keine Änderung an Fachlogik, Rollen, Accessible Names oder Klassennamen.
   Nur das bestehende V4-System: Radiusstufen V4_RADIEN (src/v4/tokens.js) als var(--v4-r-…). Keine Neugestaltung.
   Zuordnung wie in den Schnitten 1–13 (pruefungen/v4-radiusstufen.mjs): gleicher Wert → gleiche Stufe, sonst die
   nächste (Gleichstand: die größere), pille nur bei Radius >= halbe kleinere Kante.

   Zeile „Selbsttest“ (werkzeug/v4-inventar.mjs, HAUPTANSICHT_DATEIEN) = src/pruefung.jsx und
   src/ansichten/testablauf.jsx, gemessen auf fd9dea35: 2 Dateien, 7843 Zeilen, Form 1/2, 77 Farbliterale (alle in
   pruefung.jsx), 1 Form-Literal (testablauf.jsx), 5 Inline-Stile (alle in testablauf.jsx), „voll V4“ 0/2.

   Ergebnis: 1 Radius auf Stufe (Testablauf-Leiste 12 → mittel, 12 px, keine sichtbare Änderung). Die 77 Farbliterale
   bleiben: Keines ist eine Bildschirmfarbe. pruefung.jsx rendert kein JSX (kein Element, kein className, kein
   Inline-Stil); „sichtbar“ ist die Datei für das Inventar nur wegen HTML in Zeichenketten (Druckdokumente). Die
   Literale sind
     - 42 Fachdaten-Kopien (Rollen-, Abwesenheits-, Dienst- und Einheitsfarben der Prüfmandanten): gespeicherte Daten,
       die als Hex weiterverarbeitet werden; ein var(--v4-…) wäre dort kein Farbwert;
     - 21 Farben in Druckdokumenten (Rechnung, Handbuch): eigenes HTML-Dokument mit eigenem <style>, ohne die
       CSS-Variablen der Anwendung; var(--v4-…) bliebe dort ungelöst;
     - 14 Referenzwerte in Prüfaussagen (Kontrast gegen Weiß/Schwarz, Soll-Grundfläche): Sie prüfen gerade die
       Palette; ein Token an ihrer Stelle verfälscht die Aussage, und kontrastVon misst var(--v4-…) nicht (null).
   Deshalb Ausnahme „Messgrenze/Referenzpalette“ (V4-3d, offen, nicht entschieden).

   Beleg „nichts außer Radius“: Rückrechnung beider Dateien byte-gleich zur Basis fd9dea35 (SHA-256 aus der Fixture, ohne
   Git); die dreizehn früheren Schnitte der Fixture sind byte-gleich (SHA-256 über ihr JSON). Dazu ein Attributwächter.
   Grenze des Attributwächters (Hinweise aus #460/#463/#465/#466/#467): Er erfasst Boolean- und Spread-Attribute,
   Stilschlüssel, className und onClick nicht; das deckt die Rückrechnung (byte-gleich) ab. In testablauf.jsx findet
   er nur role="status", in pruefung.jsx nur name="theme-color" (Zeichenkette im Selektor).

   Keine Uhr im Prüfwert (der Darstellungstest rechnet das Ablaufdatum relativ zu heute()), kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventar, jeHauptansicht, hauptansicht, ohneKommentare, zusammenfassung, HAUPTANSICHT_DATEIEN }
  from "../werkzeug/v4-inventar.mjs";
import { Testablauf } from "../src/ansichten/testablauf.jsx";
import { heute } from "../src/lib/datum.js";
import { pISO } from "../src/regelwerk.js";
import { kontrastVon } from "../src/gestalt/lesbar.js";
import { V4_RADIEN, v4AlsAltePalette } from "../src/v4/tokens.js";
import { regelStufe, ladeBasisFixture, abgleichMitFixture, gitGegenprobe, fixtureBefunde, sha256, SCHNITTE, ansichtVon }
  from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");

/** Basis des Schnitts (origin/integration/release-v4 mit V4-3b Schnitt 1–13, #467). */
const BASIS = "fd9dea357091659345e5b53e5f9d1604bc453055";
const SCHNITT = "Selbsttest";
const ZEILE = "Selbsttest";
const PRUEF = "src/pruefung.jsx";
const ABLAUF = "src/ansichten/testablauf.jsx";

/** Bewusste Abweichung von der Basis, nicht Teil des Radiusschnitts: QS-2 Nachtrag (PR #478) ersetzt in
 *  src/pruefung.jsx die Wandzeit-Zusicherung „Erster Aufbau unter 500 ms“ (+32 Zeilen, Zähler `fehl` in memo).
 *  Die Datei bleibt byte-genau festgelegt: Prüfsumme der Datei mit dieser einen Änderung. Jede weitere
 *  Änderung an der Datei macht die Prüfung rot, wie zuvor gegen die Basis. */
const NACHTRAG_QS2 = { [PRUEF]: { sha256: "89d6888daa73a7e703b7cba6b63b16f43b0672dc2ca14511dc3dbd8f634eedd8", zeilenMehr: 32 } };
const erwartetSha = (fx, d) => (NACHTRAG_QS2[d] ? NACHTRAG_QS2[d].sha256 : fx.dateien[d].sha256);

/** Feste Zuordnung je Stelle (Quelltextreihenfolge). alt = Radius vorher (px); keine feste Kante (Höhe aus Inhalt). */
const SELBSTTEST_ZUORDNUNG = {
  [ABLAUF]: [{ wo: "Testablauf-Leiste (role=status, Höhe aus Inhalt und Innenabstand 14 px)", alt: 12, stufe: "mittel" }],
};

/** SHA-256 über JSON.stringify(schnitte) der Fixture auf der Basis fd9dea35 (dreizehn Schnitte, vor diesem Schnitt). */
const FRUEHERE_SCHNITTE_SHA256 = "39a960cfa281e2a2aa96726c23fcf533d2c0d54349c27caec61c1b1471356413";
const FRUEHERE_SCHNITTE = Object.keys(SCHNITTE).filter((s) => s !== SCHNITT);

/** Farbliterale (Hex, ohne Kommentare) in pruefung.jsx je Deklaration auf oberster Ebene, mit Art. */
const FARB_ARTEN = {
  Fachdaten: { ROLLEN: 6, ABW: 6, PALETTE: 8, baueMandant: 6, DIENST_VORLAGEN: 10, WUNSCH_ARTEN: 2, leererMandant: 4 },
  Druckdokument: { rechnungHTML: 9, handbuchDruck: 12 },
  Referenz: { selbsttest: 14 },
};
/** Druckdokumente: Herkunft in der Anwendung (die Kopie in pruefung.jsx trägt dieselben Farben). */
const DRUCK_QUELLE = { rechnungHTML: "src/lib/fachlogik.js", handbuchDruck: "src/lib/handbuch.js" };

const RE_HEX = /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
/** Kommentare entfernen, Zeilen und Positionen erhalten. */
const ohneKommentareGleichlang = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, (m, a) => a + " ".repeat(m.length - a.length));
/** Hex-Literale (ohne Kommentare) mit Deklaration auf oberster Ebene und Quelltextzeile: [{ wert, decl, zeile }]. */
function hexLiterale(text) {
  const c = ohneKommentareGleichlang(text);
  const decl = [...c.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => [m.index, m[1]]);
  return [...c.matchAll(RE_HEX)].map((m) => {
    let n = null;
    for (const [i, name] of decl) { if (i < m.index) n = name; else break; }
    return { wert: m[0], decl: n, zeile: c.slice(c.lastIndexOf("\n", m.index) + 1, c.indexOf("\n", m.index)) };
  });
}
/** Hex-Literale je Deklaration auf oberster Ebene: { name: [literal, …] }. */
function hexJeDeklaration(text) {
  const je = {};
  for (const l of hexLiterale(text)) (je[l.decl] ||= []).push(l.wert);
  return je;
}
/** Quelltext einer Deklaration auf oberster Ebene (bis zur nächsten). */
function deklaration(text, name) {
  const c = ohneKommentareGleichlang(text);
  const a = c.search(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`, "m"));
  const rest = c.slice(a + 1);
  const e = rest.search(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let)\s+/m);
  return c.slice(a, e < 0 ? undefined : a + 1 + e);
}

/** Feld- und ARIA-Attribute in Quelltextreihenfolge (Name=Wert); wie v4-3b-querschnitt-2.test.js. */
const RE_ATTRIBUT = /\b(id|htmlFor|type|name|autoComplete|autoFocus|autoCapitalize|inputMode|role|aria-[a-z]+|placeholder|disabled|required|pattern|maxLength|minLength|tabIndex|onSubmit|onKeyDown)=(\{[^}]*\}|"[^"]*")/g;
const attributeIn = (text) => [...text.matchAll(RE_ATTRIBUT)].map((m) => `${m[1]}=${m[2]}`);
/** Basis fd9dea35 (LF): Anzahl und SHA-256 der Attributliste je Datei. */
const ATTRIBUTE_BASIS = {
  [ABLAUF]: [1, "838940f69ddd57e728f68873abb69818b34e71b87489025ece09fe3d23b645a2"],
  [PRUEF]: [1, "901913703ed2373883c4ccaecb6a627cfdfd775f68f739ad2474d1fe69c2c75c"],
};

/** Inline-Stufen (borderRadius: "var(--v4-r-…)") im Quelltext ohne Kommentare. */
const inlineStufen = (text) => [...ohneKommentare(text).matchAll(/borderRadius: "var\(--v4-r-([a-z]+)\)"/g)].map((m) => m[1]);

/** Heutiger Quelltext einer Datei mit den alten Werten der Tabelle zurückgesetzt. */
function rueckgerechnet(datei, tabelle = SELBSTTEST_ZUORDNUNG, text = lies(datei)) {
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
/** Datum (JJJJ-MM-TT) n Tage nach heute(). */
const inTagen = (n) => {
  const d = pISO(heute());
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("V4-3b Selbsttest: Messung", () => {
  it("Zeile: Form-Literale 1 → 0, Farbliterale 77 (alle pruefung.jsx), Form 1/2, „voll V4“ 0/2 → 1/2; Inline-Stile 5", async () => {
    const inv = await inventar();
    const e = jeHauptansicht(inv)[ZEILE];
    expect([e.dateien, e.sichtbar, e.zeilen]).toEqual([2, 2, 7843 + NACHTRAG_QS2[PRUEF].zeilenMehr]);
    expect(HAUPTANSICHT_DATEIEN[ZEILE]).toEqual([PRUEF, ABLAUF]);
    expect(e.formLiterale).toBe(0);
    expect(e.farbLiterale).toBe(77);
    expect(e.farbrein).toBe(1);
    expect(e.formErreicht).toBe(1);
    expect(e.ohneForm).toEqual([PRUEF]);
    /* „voll V4“ = Form und Farbe ohne Literale; Inline-Stile zählen nicht (separat: 5, V4-3d). Voll wird testablauf;
       pruefung.jsx nicht (keine V4-Form, 77 Farbliterale). */
    expect(e.voll).toBe(1);
    expect(e.inlineStil).toBe(5);
    const je = Object.fromEntries(inv.eintraege.filter((x) => hauptansicht(x) === ZEILE).map((x) => [x.datei, x]));
    expect([PRUEF, ABLAUF].map((d) => [je[d].formLiterale, je[d].rgb, je[d].hex, je[d].inlineStil]))
      .toEqual([[0, 0, 77, 0], [0, 0, 0, 5]]);
    /* Gesamt ohne src/v4: Form-Literale 19 → 18 (Dateien 14 → 13), Form erreicht 146, „voll“ 127 → 128 (von 159). */
    const z = zusammenfassung(inv).ohneV4;
    expect([z.formLiterale, z.mitFormLiteralen, z.formErreicht, z.sichtbarVoll, z.sichtbar]).toEqual([18, 13, 147, 129, 160]); /* WP-I16: +ki-steuerung.jsx, Form erreicht (vorher 146/128/159) */
  }, 60000);

  it("Nicht alle Hauptansichten haben Form 100 %: offene Zeilen ausgewiesen (V4-3b bleibt offen)", async () => {
    const zeilen = jeHauptansicht(await inventar());
    const offen = Object.entries(zeilen).filter(([, x]) => x.formErreicht < x.sichtbar)
      .map(([n, x]) => `${n} ${x.formErreicht}/${x.sichtbar}`);
    expect(offen).toEqual(["Einstieg 7/9", "Zeit/Abrechnung 22/23", "Einstellungen/Verwaltung 20/21", "Branchenmodule 8/13",
      "Querschnitt/Bausteine 22/25", "Selbsttest 1/2"]);
  }, 60000);

  it("feste Tabelle: die Stelle trägt genau die Stufe der Zuordnungsregel; keine sichtbare Änderung (12 px → 12 px)", () => {
    for (const [datei, stellen] of Object.entries(SELBSTTEST_ZUORDNUNG)) {
      for (const s of stellen) expect(regelStufe(s.alt, s.kante), `${datei}: ${s.wo}`).toBe(s.stufe);
      expect(inlineStufen(lies(datei)), datei).toEqual(stellen.map((s) => s.stufe));
    }
    expect(inlineStufen(lies(PRUEF))).toEqual([]);
    expect(parseFloat(V4_RADIEN.mittel)).toBe(12);
    /* Die Leiste ist mindestens 2 × 14 px Innenabstand hoch: 12 bleibt unter der halben Höhe (keine Kapsel). */
    expect(lies(ABLAUF)).toContain('padding: "14px 18px", borderRadius: "var(--v4-r-mittel)", marginBottom: 20,');
  });

  it("Tabellenwerte stimmen mit der Basis überein, ohne Git aus der Fixture; dreizehn frühere Schnitte byte-gleich", async () => {
    expect(SCHNITTE[SCHNITT]).toBe(BASIS);
    expect(ansichtVon(SCHNITT)).toBe(ZEILE);
    const fx = ladeBasisFixture(WURZEL);
    expect(Object.keys(fx.schnitte)).toEqual(Object.keys(SCHNITTE));
    expect(FRUEHERE_SCHNITTE).toHaveLength(13);
    const frueher = Object.fromEntries(FRUEHERE_SCHNITTE.map((s) => [s, fx.schnitte[s]]));
    expect(sha256(JSON.stringify(frueher)), "frühere Schnitte gleich der Fixture auf fd9dea35").toBe(FRUEHERE_SCHNITTE_SHA256);
    const inv = await inventar();
    const alle = inv.eintraege.filter((x) => x.gruppe !== "V4" && hauptansicht(x) === ZEILE).map((x) => x.datei).sort();
    expect(Object.keys(fx.schnitte[SCHNITT].dateien).sort()).toEqual(alle);
    expect(fixtureBefunde(fx, SCHNITT, alle)).toEqual([]);
    expect(abgleichMitFixture(fx, SCHNITT, SELBSTTEST_ZUORDNUNG, lies)).toEqual([]);
    const d = fx.schnitte[SCHNITT].dateien;
    expect([d[ABLAUF].literale.length, d[PRUEF].literale.length]).toEqual([1, 0]);
  }, 60000);

  it("Gegenprobe: Fixture gleich dem Basis-Quelltext (git show); ohne Git-Verlauf übersprungen", (ctx) => {
    const fx = ladeBasisFixture(WURZEL);
    const g = gitGegenprobe(WURZEL, fx, SCHNITT);
    if (g === null) return ctx.skip("kein Git-Verlauf: der Fixture-Abgleich oben hat geprüft");
    expect(g).toEqual([]);
  });

  it("Rückrechnung: nur der Radiuswert geändert, sonst byte-gleich zur Basis fd9dea35 (beide Dateien, ohne Git)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte[SCHNITT];
    const dateien = Object.keys(fx.dateien);
    expect(dateien.sort()).toEqual([ABLAUF, PRUEF].sort());
    for (const d of dateien) {
      const r = rueckgerechnet(d);
      expect(r.ersetzt, `Anzahl Stufen in ${d}`).toBe((SELBSTTEST_ZUORDNUNG[d] || []).length);
      expect(sha256(r.text), `${d} zurückgerechnet = Basis${NACHTRAG_QS2[d] ? " + QS-2-Nachtrag" : ""}`).toBe(erwartetSha(fx, d));
    }
    /* pruefung.jsx trägt außer dem QS-2-Nachtrag keine Änderung: alle 77 Farbliterale stehen wie auf der Basis. */
    expect(sha256(lies(PRUEF))).toBe(erwartetSha(fx, PRUEF));
  });

  it("Feld- und ARIA-Attribute in Reihenfolge wie auf der Basis", () => {
    for (const [d, [n, summe]] of Object.entries(ATTRIBUTE_BASIS)) {
      const a = attributeIn(lies(d));
      expect(a, d).toHaveLength(n);
      expect(sha256(JSON.stringify(a)), `${d}: Attribute gleich der Basis`).toBe(summe);
    }
  });

  it("Mutation (alt, Stufe, Token, Text, Attribut, Klasse, Farbliteral, früherer Schnitt, Anzahl) fällt ohne Git auf", () => {
    const fx = ladeBasisFixture(WURZEL);
    const basisSumme = (d) => fx.schnitte[SCHNITT].dateien[d].sha256;
    const T = SELBSTTEST_ZUORDNUNG;
    const mit = (x) => ({ ...T, [ABLAUF]: [{ ...T[ABLAUF][0], ...x }] });
    expect(abgleichMitFixture(fx, SCHNITT, mit({ alt: 14 }), lies))
      .toEqual([`${ABLAUF}: ${T[ABLAUF][0].wo}: Basis 12, Tabelle alt 14`]);
    expect(abgleichMitFixture(fx, SCHNITT, { [ABLAUF]: [] }, lies)[0]).toBe(`${ABLAUF}: Anzahl: Basis 1, Tabelle 0`);
    expect(abgleichMitFixture(fx, SCHNITT, mit({ kante: 20 }), lies))
      .toEqual([`${ABLAUF}: ${T[ABLAUF][0].wo}: kante 20 nicht im Stilobjekt der Basis`]);
    /* Eine falsche Stufe in der Tabelle oder ein anderer Token im Quelltext ergibt nicht die Basis. */
    expect(sha256(rueckgerechnet(ABLAUF, mit({ stufe: "gross" })).text)).not.toBe(basisSumme(ABLAUF));
    const q = lies(ABLAUF);
    expect(sha256(rueckgerechnet(ABLAUF, undefined, q.replace("var(--v4-r-mittel)", "var(--v4-r-gross)")).text))
      .not.toBe(basisSumme(ABLAUF));
    /* Ein geänderter Text, ein geändertes Attribut oder eine neue Klasse ergibt nicht die Basis. */
    expect(sha256(rueckgerechnet(ABLAUF, undefined, q.replace("Verlängern</Btn>", "Jetzt verlängern</Btn>")).text))
      .not.toBe(basisSumme(ABLAUF));
    const a = q.replace('role="status"', 'role="alert"');
    expect(sha256(rueckgerechnet(ABLAUF, undefined, a).text)).not.toBe(basisSumme(ABLAUF));
    expect(sha256(JSON.stringify(attributeIn(a)))).not.toBe(ATTRIBUTE_BASIS[ABLAUF][1]);
    const k = q.replace('<div role="status" style', '<div className="leiste" role="status" style');
    expect(sha256(rueckgerechnet(ABLAUF, undefined, k).text)).not.toBe(basisSumme(ABLAUF));
    expect(sha256(JSON.stringify(attributeIn(k))), "Klasse: Attributwächter blind (Grenze)").toBe(ATTRIBUTE_BASIS[ABLAUF][1]);
    /* Ein Farbliteral in pruefung.jsx durch einen Token ersetzt ergibt nicht die Basis. */
    const p = lies(PRUEF).replace('kon("#FFFFFF", C.accent)', 'kon("var(--v4-text)", C.accent)');
    expect(p).not.toBe(lies(PRUEF));
    expect(sha256(p)).not.toBe(basisSumme(PRUEF));
    /* Ein veränderter früherer Schnitt fällt über die Prüfsumme auf. */
    const frueher = Object.fromEntries(FRUEHERE_SCHNITTE.map((s) => [s, fx.schnitte[s]]));
    frueher.Personal = { ...frueher.Personal, basis: frueher.Personal.basis.replace(/^./, "0") };
    expect(sha256(JSON.stringify(frueher))).not.toBe(FRUEHERE_SCHNITTE_SHA256);
    /* Regel: 12 ohne Kante → mittel; 12 bei Kante 24 → pille (Kapsel); 14 → mittel. */
    expect([regelStufe(12), regelStufe(12, 24), regelStufe(14)]).toEqual(["mittel", "pille", "mittel"]);
  });

  it("kein neuer Übergang (V4-2d), kein neuer Schatten: wie auf der Basis (0/0 je Datei)", () => {
    for (const d of [ABLAUF, PRUEF]) {
      const q = ohneKommentare(lies(d));
      expect((q.match(/transition/g) || []).length, d).toBe(0);
      expect((q.match(/boxShadow/g) || []).length, d).toBe(0);
    }
  });
});

describe("V4-3b Selbsttest: Farbliterale (Messgrenze/Referenzpalette, keine Umstellung)", () => {
  it("pruefung.jsx rendert kein JSX; „sichtbar“ nur über HTML in Zeichenketten der Druckdokumente", () => {
    const q = ohneKommentare(lies(PRUEF));
    expect(q).not.toMatch(/<[A-Z]\w*[\s/>]/);
    expect(q).not.toMatch(/className=|style=\{\{/);
    expect((q.match(/style=\{/g) || []).length).toBe(0);
    /* Das Markup der Datei steht nur in den Druckdokumenten (und im Meta-Selektor der Themenwahl). */
    const P = lies(PRUEF);
    const ohneDruck = ["rechnungHTML", "handbuchDruck"].reduce((t, n) => t.replace(deklaration(t, n), ""),
      ohneKommentareGleichlang(P));
    expect(ohneDruck).not.toMatch(/<[a-z][a-z0-9]*[\s>/]/);
  });

  it("77 Farbliterale: 42 Fachdaten-Kopien, 21 in Druckdokumenten, 14 Referenzwerte in Prüfaussagen", () => {
    const je = hexJeDeklaration(lies(PRUEF));
    const zaehl = Object.fromEntries(Object.entries(je).map(([k, v]) => [k, v.length]));
    expect(zaehl).toEqual(Object.assign({}, ...Object.values(FARB_ARTEN)));
    const summe = (o) => Object.values(o).reduce((s, n) => s + n, 0);
    expect(Object.fromEntries(Object.entries(FARB_ARTEN).map(([a, o]) => [a, summe(o)])))
      .toEqual({ Fachdaten: 42, Druckdokument: 21, Referenz: 14 });
    /* Fachdaten: jedes Literal steht als Wert eines Feldes `farbe` oder in der PALETTE der Prüfmandanten. */
    const fach = hexLiterale(lies(PRUEF)).filter((l) => l.decl in FARB_ARTEN.Fachdaten);
    expect(fach).toHaveLength(42);
    for (const l of fach) expect(/farbe:\s*"#|const PALETTE = \[/.test(l.zeile), l.zeile).toBe(true);
  });

  it("Druckdokumente: dieselben Farben wie die Dokumente der Anwendung (eigenes <style>, keine CSS-Variablen)", () => {
    const P = lies(PRUEF);
    for (const [name, quelle] of Object.entries(DRUCK_QUELLE)) {
      const kopie = deklaration(P, name);
      const farben = [...new Set(kopie.match(RE_HEX))].sort();
      const app = lies(quelle);
      for (const f of farben) expect(app.toLowerCase(), `${name}: ${f} in ${quelle}`).toContain(f.toLowerCase());
      expect(kopie).not.toContain("var(--v4-");
    }
  });

  it("Referenzwerte: Kontrastmessung braucht einen Farbwert; ein Token als var(--v4-…) ist nicht messbar", () => {
    const P = v4AlsAltePalette("hell");
    expect(kontrastVon("var(--v4-text)", "#ffffff")).toBeNull();
    expect(kontrastVon("#FFFFFF", P.accent)).toBeGreaterThan(1);
    /* Die Prüfaussagen nennen ausdrücklich Weiß, Schwarz und die Soll-Grundfläche: eben diese Werte werden geprüft. */
    const sel = deklaration(lies(PRUEF), "selbsttest");
    expect(sel).toContain('ok("Weisser Text auf Akzentflaeche", true, kon("#FFFFFF", C.accent) >= 4.5);');
    expect(sel).toContain('ok("Die helle Grundflaeche ist die V4-Grundflaeche", "#f0f3ed", C_HELL.bg);');
  });
});

describe("V4-3b Selbsttest: Darstellung (echte Komponente)", () => {
  it("Testablauf: Leiste mittel (12 px) in Warn- und Kritischstufe; role=status und Text unverändert", () => {
    const warn = renderToStaticMarkup(h(Testablauf, { mandant: { status: "test", laeuftAb: inTagen(5) }, darfEinrichten: true }));
    expect(radien(warn)).toEqual(["var(--v4-r-mittel)"]);
    expect(warn).toContain('role="status"');
    expect(warn).toContain("Noch 5 Tage im Testzeitraum");
    expect(warn).toContain("Verlängern");
    const kritisch = renderToStaticMarkup(h(Testablauf, { mandant: { status: "test", laeuftAb: inTagen(-1) } }));
    expect(radien(kritisch)).toEqual(["var(--v4-r-mittel)"]);
    expect(kritisch).toContain("Der Testzeitraum ist am");
    /* Außerhalb der 14 Tage und im aktiven Betrieb erscheint die Leiste nicht. */
    expect(renderToStaticMarkup(h(Testablauf, { mandant: { status: "test", laeuftAb: inTagen(20) } }))).toBe("");
    expect(renderToStaticMarkup(h(Testablauf, { mandant: { status: "aktiv", laeuftAb: inTagen(5) } }))).toBe("");
  });
});
