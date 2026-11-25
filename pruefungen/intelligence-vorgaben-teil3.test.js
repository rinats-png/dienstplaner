/* ==========================================================================
   WP-I4 Teil 3 — Betreiberentscheidungen 2026-11-25 (Server und Sicht, ohne Handler)

   1.1 Planung liest die Vorgaben des eigenen Betriebs, ändern darf nur org.edit.
   1.2 Betriebsrat: vorläufig nichts; Lesesicht ohne Personenbezug hinter einem Schalter (Vorgabe AUS).
   1.3 Deaktivieren statt Löschen; Änderungsprotokoll ohne unnötige Werte; Obergrenze und Frist wie das Modulprotokoll.
   1.4 Stufengrenzen zentral (5/25/unbegrenzt).
   1.5 Der Server erzwingt „erst testen, dann aktivieren“.
   Dazu die drei Befunde aus dem Review von #555 (Typprüfung, Bezüge, bekannt = nur der übermittelte Stand).

   Die Wege über den echten Handler: intelligence-vorgaben-wege.test.js (Abschnitt 6). Synthetische Daten.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  vorgabenZusammen, vorgabenBetriebsratSicht, VORGABEN_BETRIEBSRAT_LESEN, VORGABEN_STUFENGRENZE, vorgabenGrenze,
} from "../server/lib/vorgaben.mjs";
import { MODULPROTOKOLL_GRENZE, modulProtokollZeilen } from "../server/lib/branchenmodule.mjs";
import { betriebSicht } from "../server/lib/sicht.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const JETZT = "2026-11-25T08:00:00.000Z";
const ktx = (extra = {}) => ({ darfOrgEdit: true, person: "l1", tarif: "pro", jetzt: JETZT, ...extra });
const V = (id, status, extra = {}) => ({ id, name: `Vorgabe ${id}`, beschreibung: "GEHEIMER-TEXT", regelart: "grenzregel",
  parameter: { groesse: "Überstunden im Monat", hoechstens: 10 }, geltung: { art: "betrieb" }, bezug: "monat", staerke: "muss", prioritaet: 1,
  grundlage: { art: "hausregel" }, status, ...extra });
/* Gültig, aber ohne Beispielfälle: der Test kann nicht bestehen. */
const OHNE_TEST = (id, status, extra = {}) => V(id, status, { regelart: "besetzungsregel",
  parameter: { anforderungen: [{ art: "quoteMit", merkmal: "fachkraft", min: 0.5 }] }, ...extra });
const protokoll = (res) => (res.mandant && res.mandant.einstellungen && res.mandant.einstellungen.modulprotokoll) || [];
const gespeichert = (vorgaben, einstellungen) => ({ vorgaben, ...(einstellungen ? { einstellungen } : {}), personen: [], einheiten: [] });

describe("1.5 Der Server erzwingt: erst testen, dann aktivieren", () => {
  it("eine neue aktive Vorgabe ohne bestehbaren Test wird abgewiesen, als Entwurf geht sie", () => {
    const r = vorgabenZusammen({}, { vorgaben: [OHNE_TEST("a", "aktiv")] }, ktx());
    expect(r.grund).toMatch(/Test/);
    expect(r.mandant).toBeUndefined();
    expect(vorgabenZusammen({}, { vorgaben: [OHNE_TEST("a", "entwurf")] }, ktx()).grund).toBeUndefined();
  });
  it("eine Vorgabe mit bestandenem Test lässt sich aktivieren", () => {
    expect(vorgabenZusammen({}, { vorgaben: [V("a", "aktiv")] }, ktx()).grund).toBeUndefined();
  });
  it("Entwurf oder inaktiv auf aktiv allein (ohne bestehbaren Test) wird abgewiesen; die Aktivierung gilt auch bei später unvollständiger Vorgabe", () => {
    for (const vorher of ["entwurf", "inaktiv"]) {
      const alt = gespeichert([OHNE_TEST("a", vorher, { version: 1, geaendertAm: "x" })]);
      const r = vorgabenZusammen(alt, { vorgaben: [OHNE_TEST("a", "aktiv")] }, ktx());
      expect(r.grund, vorher).toMatch(/Test/);
    }
  });
  it("eine geänderte aktive Vorgabe wird erneut geprüft, eine unveränderte (Altbestand, Rundweg) nicht", () => {
    const alt = gespeichert([{ ...OHNE_TEST("a", "aktiv"), version: 1, geaendertAm: "x", geaendertVon: "l1", aktiviertAm: "x", aktiviertVon: "l1" }]);
    expect(vorgabenZusammen(alt, { vorgaben: kopie(alt.vorgaben) }, ktx()).grund).toBeUndefined();
    const geaendert = kopie(alt.vorgaben); geaendert[0].prioritaet = 2;
    expect(vorgabenZusammen(alt, { vorgaben: geaendert }, ktx()).grund).toMatch(/Test/);
    /* Deaktivieren ist nie an einen Test gebunden. */
    const aus = kopie(alt.vorgaben); aus[0].status = "inaktiv";
    expect(vorgabenZusammen(alt, { vorgaben: aus }, ktx()).grund).toBeUndefined();
  });
});

describe("1.3 Deaktivieren statt Löschen", () => {
  const stempel = { version: 1, geaendertAm: "2026-11-01T00:00:00.000Z", geaendertVon: "l1" };
  const aktivAlt = () => ({ ...V("a", "aktiv"), ...stempel, aktiviertAm: "2026-11-01T00:00:00.000Z", aktiviertVon: "l1" });
  it("eine aktive Vorgabe lässt sich nicht löschen, nur deaktivieren", () => {
    const alt = gespeichert([aktivAlt()]);
    const r = vorgabenZusammen(alt, { vorgaben: [] }, ktx());
    expect(r.grund).toMatch(/deaktiv/i);
    expect(vorgabenZusammen(alt, { vorgaben: [{ ...aktivAlt(), status: "inaktiv" }] }, ktx()).grund).toBeUndefined();
  });
  it("auch eine früher aktive, jetzt inaktive Vorgabe bleibt stehen (Nachweis)", () => {
    const alt = gespeichert([{ ...aktivAlt(), status: "inaktiv" }]);
    expect(vorgabenZusammen(alt, { vorgaben: [] }, ktx()).grund).toMatch(/deaktiv/i);
  });
  it("ein Entwurf, der nie aktiv war, darf gelöscht werden", () => {
    const alt = gespeichert([{ ...V("e", "entwurf"), ...stempel }, aktivAlt()]);
    const r = vorgabenZusammen(alt, { vorgaben: [aktivAlt()] }, ktx());
    expect(r.grund).toBeUndefined();
    expect(r.mandant.vorgaben.map((v) => v.id)).toEqual(["a"]);
    expect(protokoll(r).map((x) => x.art)).toEqual(["vorgabe-geloescht"]);
  });
  it("Altbestand ohne Stempel (Status aktiv) lässt sich ebenfalls nicht löschen", () => {
    const alt = gespeichert([V("a", "aktiv")]);
    expect(vorgabenZusammen(alt, { vorgaben: [] }, ktx()).grund).toMatch(/deaktiv/i);
  });
});

describe("1.3 Änderungsprotokoll", () => {
  const stempel = { version: 1, geaendertAm: "2026-11-01T00:00:00.000Z", geaendertVon: "l1" };
  const aktivAlt = () => ({ ...V("a", "aktiv"), ...stempel, aktiviertAm: "2026-11-01T00:00:00.000Z", aktiviertVon: "l1" });
  it("Anlegen, Aktivieren, Ändern, Deaktivieren: wer, wann, was, Version", () => {
    const neu = vorgabenZusammen({}, { vorgaben: [V("a", "entwurf")] }, ktx());
    expect(protokoll(neu)).toEqual([{ art: "vorgabe-angelegt", modul: "vorgaben", regelId: "VORGABE-A", am: JETZT, von: "l1", version: 1 }]);
    const akt = vorgabenZusammen(neu.mandant, { ...neu.mandant, vorgaben: [{ ...neu.mandant.vorgaben[0], status: "aktiv" }] }, ktx({ person: "k1", jetzt: "2026-11-26T08:00:00.000Z" }));
    expect(protokoll(akt).at(-1)).toMatchObject({ art: "vorgabe-aktiviert", regelId: "VORGABE-A", von: "k1", version: 2, am: "2026-11-26T08:00:00.000Z" });
    const aend = vorgabenZusammen(akt.mandant, { ...akt.mandant, vorgaben: [{ ...akt.mandant.vorgaben[0], prioritaet: 4, parameter: { groesse: "Überstunden im Monat", hoechstens: 8 } }] }, ktx());
    expect(protokoll(aend).at(-1)).toMatchObject({ art: "vorgabe-geaendert", version: 3, felder: ["parameter", "prioritaet"] });
    const aus = vorgabenZusammen(aend.mandant, { ...aend.mandant, vorgaben: [{ ...aend.mandant.vorgaben[0], status: "inaktiv" }] }, ktx());
    expect(protokoll(aus).at(-1)).toMatchObject({ art: "vorgabe-deaktiviert", version: 4 });
    expect(protokoll(aus)).toHaveLength(4);
  });
  it("neu und gleich aktiv: Angelegt und Aktiviert", () => {
    const r = vorgabenZusammen({}, { vorgaben: [V("a", "aktiv")] }, ktx());
    expect(protokoll(r).map((x) => x.art)).toEqual(["vorgabe-angelegt", "vorgabe-aktiviert"]);
  });
  it("das Protokoll enthält weder Name, Beschreibung, Parameterwerte noch Personen", () => {
    const r = vorgabenZusammen({}, { vorgaben: [V("a", "aktiv", { name: "NAME-MARKE", geltung: { art: "personen", personen: ["p-marke"] }, ausnahmen: { personen: ["p-marke"] } })],
      personen: [{ id: "p-marke" }] }, ktx());
    expect(r.grund).toBeUndefined();
    const s = JSON.stringify(protokoll(r));
    for (const marke of ["NAME-MARKE", "GEHEIMER-TEXT", "p-marke", "Überstunden", "hausregel"]) expect(s, marke).not.toContain(marke);
  });
  it("das Betriebsprotokoll des Servers bekommt je Eintrag eine Zeile mit Kennung und Art, ohne Person und Werte", () => {
    const alt = { mandanten: [{ id: "m1", einstellungen: { modulprotokoll: [] } }] };
    const r = vorgabenZusammen({}, { vorgaben: [V("a", "aktiv", { name: "NAME-MARKE" })] }, ktx({ person: "PERSON-MARKE" }));
    const zeilen = modulProtokollZeilen(alt, { mandanten: [{ id: "m1", einstellungen: r.mandant.einstellungen }] });
    expect(zeilen).toEqual(["Interne Vorgabe VORGABE-A angelegt", "Interne Vorgabe VORGABE-A aktiviert"]);
    expect(JSON.stringify(zeilen)).not.toMatch(/MARKE/);
  });
  it("unverändert zurückgeschickt: kein Eintrag", () => {
    const alt = gespeichert([aktivAlt()]);
    const r = vorgabenZusammen(alt, { ...kopie(alt) }, ktx());
    expect(protokoll(r)).toEqual([]);
  });
  it("an der Grenze des Protokolls (keine geprüfte Frist) sind Anlegen und Aktivieren gesperrt, Deaktivieren geht immer", () => {
    const voll = Array.from({ length: MODULPROTOKOLL_GRENZE }, (_, i) => ({ art: "eingeschaltet", modul: "x", am: "2020-01-01T00:00:00.000Z", von: `p${i}` }));
    const alt = { ...gespeichert([aktivAlt()], { modulprotokoll: voll }) };
    const neu = (vorgaben) => ({ ...kopie(alt), vorgaben });
    expect(vorgabenZusammen(alt, neu([aktivAlt(), V("b", "entwurf")]), ktx()).grund).toMatch(/Modulprotokoll/);
    const r = vorgabenZusammen(alt, neu([{ ...aktivAlt(), status: "inaktiv" }]), ktx());
    expect(r.grund).toBeUndefined();
    expect(protokoll(r)).toHaveLength(MODULPROTOKOLL_GRENZE + 1);
  });
  it("ein gespeichertes Protokoll bleibt vor dem Anhängen unberührt", () => {
    const bisher = [{ art: "eingeschaltet", modul: "m", am: "2026-01-01T00:00:00.000Z", von: "l1" }];
    const r = vorgabenZusammen(gespeichert([], { modulprotokoll: bisher }), { ...gespeichert([V("a", "entwurf")], { modulprotokoll: bisher }) }, ktx());
    expect(protokoll(r)[0]).toEqual(bisher[0]);
    expect(protokoll(r)).toHaveLength(2);
  });
});

describe("Befunde aus dem Review von #555", () => {
  const bekanntBetrieb = { einheiten: [{ id: "e1" }], personen: [{ id: "a1" }] };
  it("(1) Altbestand ohne Liste in der gespeicherten Geltung ergibt eine Abweisung oder Annahme, nie einen Programmfehler", () => {
    for (const kaputt of ["e1", { x: 1 }, 5, null]) {
      const alt = { ...bekanntBetrieb, vorgaben: [{ ...V("a", "entwurf"), geltung: { art: "betrieb", einheiten: kaputt, personen: kaputt }, ausnahmen: { personen: kaputt } }] };
      const neu = { ...bekanntBetrieb, vorgaben: [{ ...V("a", "entwurf", { prioritaet: 2 }), geltung: { art: "einheit", einheiten: ["e1", "e99"] } }] };
      let r;
      expect(() => { r = vorgabenZusammen(alt, neu, ktx()); }, JSON.stringify(kaputt)).not.toThrow();
      expect(r.grund, JSON.stringify(kaputt)).toMatch(/Einheit, die es in diesem Betrieb nicht gibt/);
      const gut = { ...bekanntBetrieb, vorgaben: [{ ...V("a", "entwurf", { prioritaet: 2 }), geltung: { art: "einheit", einheiten: ["e1"] } }] };
      expect(() => vorgabenZusammen(alt, gut, ktx())).not.toThrow();
    }
  });
  it("(3) bekannt ist nur der übermittelte Stand: eine im selben Schritt gelöschte Person darf nicht genannt werden", () => {
    const alt = { einheiten: [], personen: [{ id: "a1" }, { id: "gone" }], vorgaben: [] };
    const neu = { einheiten: [], personen: [{ id: "a1" }], vorgaben: [V("a", "entwurf", { geltung: { art: "personen", personen: ["gone"] } })] };
    expect(vorgabenZusammen(alt, neu, ktx()).grund).toMatch(/Person, die es in diesem Betrieb nicht gibt/);
    /* Dasselbe für Einheit und Ausnahme. */
    const altE = { einheiten: [{ id: "e1" }, { id: "gone" }], personen: [{ id: "a1" }, { id: "gone" }], vorgaben: [] };
    const neuE = { einheiten: [{ id: "e1" }], personen: [{ id: "a1" }], vorgaben: [V("b", "entwurf", { geltung: { art: "einheit", einheiten: ["gone"] } })] };
    expect(vorgabenZusammen(altE, neuE, ktx()).grund).toMatch(/Einheit/);
    const neuA = { einheiten: [{ id: "e1" }], personen: [{ id: "a1" }], vorgaben: [V("c", "entwurf", { ausnahmen: { personen: ["gone"] } })] };
    expect(vorgabenZusammen(altE, neuA, ktx()).grund).toMatch(/Ausnahmen/);
  });
});

describe("1.2 Betriebsrat: Lesesicht hinter einem Schalter (Vorgabe AUS)", () => {
  const liste = [{ ...V("a", "aktiv", { geltung: { art: "personen", personen: ["PERSON-MARKE"] }, ausnahmen: { personen: ["PERSON-MARKE"], zeitraeume: [{ von: "2026-12-24", bis: "2026-12-26" }], teilzeitAnteilig: true } }),
    version: 3, geaendertAm: "2026-11-01T00:00:00.000Z", geaendertVon: "PERSON-MARKE", aktiviertAm: "2026-11-01T00:00:00.000Z", aktiviertVon: "PERSON-MARKE" }];
  const betrieb = () => ({ id: "m1", vorgaben: kopie(liste), einstellungen: { modulprotokoll: [
    { art: "eingeschaltet", modul: "pflege", am: "2026-11-01T00:00:00.000Z", von: "x1" },
    { art: "vorgabe-aktiviert", modul: "vorgaben", regelId: "VORGABE-A", am: "2026-11-02T00:00:00.000Z", von: "PERSON-MARKE", version: 3 }] } });
  const BR = { rolle: "betriebsrat", person: "b1" };
  it("der Schalter steht auf AUS", () => { expect(VORGABEN_BETRIEBSRAT_LESEN).toBe(false); });
  it("AUS: der Betriebsrat bekommt weder Vorgaben noch Protokolleinträge der Vorgaben", () => {
    expect(vorgabenBetriebsratSicht(liste)).toEqual([]);
    const s = betriebSicht(betrieb(), BR);
    expect(s.vorgaben || []).toEqual([]);
    const j = JSON.stringify(s);
    for (const marke of ["PERSON-MARKE", "Vorgabe a", "VORGABE-A", "vorgabe-aktiviert"]) expect(j, marke).not.toContain(marke);
    expect(j).toContain("eingeschaltet");
  });
  it("EIN (nur im Test): Zahl und Text ohne Personenbezug, Protokoll ohne Person", () => {
    const s = betriebSicht(betrieb(), BR, { vorgabenBetriebsrat: true });
    expect(s.vorgaben).toHaveLength(1);
    expect(s.vorgaben[0]).toMatchObject({ id: "a", name: "Vorgabe a", regelart: "grenzregel", staerke: "muss", prioritaet: 1, status: "aktiv", version: 3 });
    expect(s.vorgaben[0].parameter).toEqual({ groesse: "Überstunden im Monat", hoechstens: 10 });
    expect(s.vorgaben[0].ausnahmen).toEqual({ zeitraeume: [{ von: "2026-12-24", bis: "2026-12-26" }], teilzeitAnteilig: true });
    expect(JSON.stringify(s)).not.toContain("PERSON-MARKE");
    const eintrag = s.einstellungen.modulprotokoll.find((x) => x.modul === "vorgaben");
    expect(eintrag).toEqual({ art: "vorgabe-aktiviert", modul: "vorgaben", regelId: "VORGABE-A", am: "2026-11-02T00:00:00.000Z", version: 3 });
  });
  it("EIN ändert nichts für Beschäftigte", () => {
    const s = betriebSicht(betrieb(), { rolle: "mitarbeiter", person: "m1" }, { vorgabenBetriebsrat: true });
    expect(s.vorgaben || []).toEqual([]);
    expect(JSON.stringify(s)).not.toContain("VORGABE-A");
  });
});

describe("1.4 Stufengrenzen zentral", () => {
  it("5/25/unbegrenzt stehen in genau einer Tabelle; die Oberfläche und stufen.js lesen sie von dort", () => {
    expect(VORGABEN_STUFENGRENZE).toEqual({ basis: 5, pro: 25, enterprise: Infinity });
    expect(vorgabenGrenze("pro")).toBe(25);
    const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
    expect(lies("../src/stufen.js")).toContain('export { VORGABEN_STUFENGRENZE, vorgabenGrenze } from "../server/lib/vorgaben.mjs";');
    expect(lies("../src/ansichten/vorgaben.jsx")).not.toMatch(/pro\s*:\s*25|=\s*25\b|:\s*25\b/);
    expect(lies("../server/lib/rechte.mjs")).not.toMatch(/vorgabenGrenze|VORGABEN_STUFENGRENZE/);
  });
});
