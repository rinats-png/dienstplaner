/* ==========================================================================
   MODUL FUNKTIONSDIENST — Funktionsbereiche mit eigener Besetzung (WP-19, Strang B)

   Vorläufig nach der Entscheidungsmatrix: eigene Besetzung und Qualifikation
   je Bereich (F1 a), fehlende Besetzung und Qualifikation nur als Hinweis
   (F2 a). Das Modul bleibt „geplant“; der Positivkatalog ist fail-closed.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  pruefeFunktionsbereiche, pruefeFunktionsPlan, funktionsLage, funktionsBefunde, funktionsZusammen, funktionsIndex,
} from "../server/lib/modul-funktionsdienst.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { BETRIEB } from "../server/lib/sicht.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { pruefeRegel } from "../server/lib/regelbaukasten.mjs";
import { FunktionsUebersicht } from "../src/module/funktionsdienst.jsx";

const MO = "2026-11-02";
const BEREICHE = [
  { id: "op", name: "OP", soll: { F: 2 }, qualifikationen: ["q-op"] },
  { id: "endo", name: "Endoskopie", soll: { F: 1, S: 1 }, qualifikationen: [] },
];
const QUALS = [{ id: "q-op", name: "OP-Fortbildung", fachkraft: false, gueltigMonate: null, nachweisPflicht: false }];
const person = (id, quals = []) => ({ id, vorname: "V", nachname: id, status: "aktiv", qualifikationen: quals, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const AKTIV = BRANCHENMODULE.map((x) => (x.id === "funktionsdienst" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ an = true, plan = {} } = {}) => ({
  id: "b1", pakete: ["klinik"], einstellungen: { branchenmodule: an ? { funktionsdienst: { an: true } } : {} },
  funktionsbereiche: BEREICHE, funktionsPlan: plan, qualifikationen: QUALS,
});
const qualGueltig = (_m, p, qid) => (p.qualifikationen || []).includes(qid);
const opts = (extra = {}) => ({ auswerten: pruefeRegel, module: AKTIV, qualGueltig, heute: MO, ...extra });

describe("Registry und Katalog", () => {
  it("Modul registriert, Klinik, „geplant“, mit vorläufigen Regeln und den beiden Feldern", () => {
    expect(modulVon("funktionsdienst")).toMatchObject({ pakete: ["klinik"], status: "geplant",
      datenfelder: ["funktionsbereiche", "funktionsPlan"], sachfelder: ["funktionsbereiche"], personenfelder: ["funktionsPlan"],
      regelIds: ["FUNKTION-BESETZUNG-01", "FUNKTION-QUAL-01"] });
    for (const id of ["FUNKTION-BESETZUNG-01", "FUNKTION-QUAL-01"])
      expect(REGELN_BRANCHEN.find((r) => r.id === id)).toMatchObject({ modul: "funktionsdienst", pruefstatus: "provisional", hoechsteStufe: "hinweis" });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
  it("beide Felder stehen im Positivkatalog, fail-closed", () => {
    expect(BETRIEB.funktionsbereiche).toEqual(["weg", "weg"]);
    expect(BETRIEB.funktionsPlan).toEqual(["weg", "weg"]);
  });
  it("Datenschutzgate: Berichtigung nur über bekannte Bereiche; ohne Schema kein Statuswechsel", () => {
    const abgenommen = { ...modulVon("funktionsdienst"), status: "vorlaeufig", abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/x.md" } };
    expect(pruefeModulStatus([abgenommen])).toEqual([]);
    expect(pruefeModulStatus([{ ...abgenommen, berichtigungsWerte: undefined }]).join()).toMatch(/Wertschema/);
  });
});

describe("Funktionsbereiche und Einteilung prüfen (F1 a)", () => {
  it("gültige Bereiche bestehen; Form, Kennung, Besetzung und Qualifikation werden geprüft", () => {
    expect(pruefeFunktionsbereiche(BEREICHE)).toBeNull();
    expect(pruefeFunktionsbereiche(null)).toBeNull();
    expect(pruefeFunktionsbereiche("x")).toMatch(/Liste/);
    expect(pruefeFunktionsbereiche([{ id: "a", name: "A" }, { id: "a", name: "B" }])).toMatch(/doppelt/);
    expect(pruefeFunktionsbereiche([{ id: "a", name: "A", soll: { F: 100 } }])).toMatch(/Sollbesetzung/);
    expect(pruefeFunktionsbereiche([{ id: "a", name: "A", qualifikationen: "q" }])).toMatch(/Qualifikationen/);
    expect(pruefeFunktionsbereiche([{ id: "a", name: "A", geheim: 1 }])).toMatch(/unbekannte Felder/);
    expect(pruefeFunktionsbereiche([{ id: "a", name: "" }])).toMatch(/Name/);
  });
  it("Einteilung: Schlüssel der Form Person|Tag, Tag im Fenster, nur geänderte Einträge streng", () => {
    expect(pruefeFunktionsPlan({ [`a|${MO}`]: "op" })).toBeNull();
    expect(pruefeFunktionsPlan({ a: "op" })).toMatch(/Schlüssel/);
    expect(pruefeFunktionsPlan({ [`a|2020-01-01`]: "op" })).toMatch(/zwei Jahre/);
    expect(pruefeFunktionsPlan({ [`a|${MO}`]: "op" }, { [`a|${MO}`]: "op" })).toBeNull();
    expect(pruefeFunktionsPlan("x")).toMatch(/erwartet/);
  });
  it("Zusammen: Bereiche und Einteilung getrennt geprüft", () => {
    expect(funktionsZusammen({})).toEqual({});
    expect(funktionsZusammen({ funktionsbereiche: [{ id: "a" }] }).grund).toMatch(/Name/);
    expect(funktionsZusammen({ funktionsPlan: { x: "op" } }).grund).toMatch(/Schlüssel/);
    expect(funktionsZusammen({ funktionsbereiche: BEREICHE, funktionsPlan: { [`a|${MO}`]: "op" } })).toEqual({});
  });
  it("Index nach Kennung", () => {
    expect(funktionsIndex(betrieb()).get("op").name).toBe("OP");
  });
});

describe("Soll und Ist je Funktionsbereich (F1 a, O3-Regel)", () => {
  const m = betrieb({ plan: { [`a|${MO}`]: "op", [`b|${MO}`]: "op", [`c|${MO}`]: "endo" } });
  const im = [person("a"), person("b"), person("c")];
  it("Soll und Ist je Bereich, Fehlbestand", () => {
    expect(funktionsLage(m, MO, "F", im).map((x) => [x.bereich, x.soll, x.ist.length, x.fehlt])).toEqual([["op", 2, 2, 0], ["endo", 1, 1, 0]]);
  });
  it("unbekannte Dienstzeit: ungeklärt, nie 0", () => {
    const l = funktionsLage(m, MO, "F", null);
    expect(l.every((x) => x.status === "ungeklaert" && x.ist === null && x.fehlt === null)).toBe(true);
  });
  it("Bereich ohne Soll in diesem Dienst erscheint nicht", () => {
    expect(funktionsLage(m, MO, "N", im)).toEqual([]);
  });
});

describe("Befunde: Hinweise, nie Sperren (F2 a)", () => {
  const m = betrieb({ plan: { [`a|${MO}`]: "op", [`b|${MO}`]: "op" } });
  const dienst = { id: "F" };
  it("zu wenig Personen im Bereich: Hinweis, Stufe hinweis, sperrt nicht", () => {
    const a = person("a", ["q-op"]);
    const b = funktionsBefunde(m, dienst, MO, a, [a], opts());
    expect(b.some((x) => x.regelId === "FUNKTION-BESETZUNG-01" && x.stufe === "hinweis" && x.art === "branche")).toBe(true);
    expect(b.every((x) => x.sperrt !== true)).toBe(true);
  });
  it("fehlende Qualifikation: Hinweis mit Bezeichnung der Qualifikation", () => {
    const a = person("a", []);
    const b = funktionsBefunde(m, dienst, MO, a, [a, person("b", ["q-op"])], opts());
    expect(b.some((x) => x.regelId === "FUNKTION-QUAL-01" && /OP-Fortbildung/.test(x.text))).toBe(true);
  });
  it("vollständig besetzt und qualifiziert: keine Befunde", () => {
    const a = person("a", ["q-op"]);
    const b = person("b", ["q-op"]);
    expect(funktionsBefunde(m, dienst, MO, a, [a, b], opts())).toEqual([]);
  });
  it("unbekannte Qualifikation: nicht bewertbar, als offen gekennzeichnet", () => {
    const m2 = { ...m, qualifikationen: [] };
    const a = person("a", []);
    const b = funktionsBefunde(m2, dienst, MO, a, [a, person("b", ["q-op"])], opts());
    expect(b.find((x) => x.regelId === "FUNKTION-QUAL-01")).toMatchObject({ offen: true, stufe: "hinweis" });
  });
  it("ohne aktives Modul oder ohne Einteilung: keine Befunde; fehlende Auswertung ist ein Fehler", () => {
    expect(funktionsBefunde(betrieb({ an: false, plan: m.funktionsPlan }), dienst, MO, person("a"), [person("a")], opts())).toEqual([]);
    expect(funktionsBefunde(m, dienst, MO, person("zz"), [person("zz")], opts())).toEqual([]);
    expect(() => funktionsBefunde(m, dienst, MO, person("a"), [person("a")], { module: AKTIV })).toThrow(/Auswertung/);
  });
});

describe("Darstellung", () => {
  const m = { ...betrieb(), funktionsPlan: { [`a|${MO}`]: "op" } };
  it("zeigt Soll und Ist in Worten, ohne Namen", () => {
    const html = renderToStaticMarkup(h(FunktionsUebersicht, { m, datum: MO, dienstId: "F", personenImDienst: [person("a")] }));
    expect(html).toMatch(/OP/);
    expect(html).toMatch(/1 von 2 besetzt/);
    expect(html).not.toMatch(/Namen|>a</);
  });
  it("ungeklärte Dienstzeit wird als solche gezeigt", () => {
    const html = renderToStaticMarkup(h(FunktionsUebersicht, { m, datum: MO, dienstId: "F", personenImDienst: null }));
    expect(html).toMatch(/Dienstzeit ungeklärt/);
  });
  it("ohne Bereiche: Leerhinweis", () => {
    expect(renderToStaticMarkup(h(FunktionsUebersicht, { m: {}, datum: MO, dienstId: "F", personenImDienst: [] }))).toMatch(/Noch keine Funktionsbereiche/);
  });
});
