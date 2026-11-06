/* ==========================================================================
   MODUL PFLEGEQUALIFIKATION — Niveaus und Verteilung je Dienst (WP-19, Strang B)

   Vorläufig nach der Entscheidungsmatrix: Niveaus als Gruppen von
   Qualifikationen (Q1 a+b), Betreuungskräfte getrennt und nie als
   Pflegekräfte oder Fachkräfte gezählt (Q2 a), keine verbindliche Prüfung
   gegen Besetzungswerte (Q3 b). Das Modul bleibt „geplant“.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pruefePflegeNiveaus, pflegeVerteilung, pflegeZusammen, PFLEGE_GRUPPEN, PFLEGE_VERSORGUNG } from "../server/lib/modul-pflegequal.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry, pruefeModulStatus } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { qualifikationenFuer } from "../server/lib/branchen.mjs";
import { BETRIEB } from "../server/lib/sicht.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { PflegeVerteilung } from "../src/module/pflegequal.jsx";

const QUALS = [
  { id: "pfk", name: "Pflegefachkraft", fachkraft: true },
  { id: "pa", name: "Pflegeassistenz", fachkraft: false },
  { id: "bk", name: "Betreuungskraft § 43b", fachkraft: false },
];
const NIVEAUS = [
  { id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: "vollstationaer", qualifikationen: ["pfk"] },
  { id: "n-pa", name: "Assistenz", gruppe: "assistenz", versorgung: null, qualifikationen: ["pa"] },
  { id: "n-bk", name: "Betreuung", gruppe: "betreuung", versorgung: null, qualifikationen: ["bk"] },
];
const M = { qualifikationen: QUALS, pflegeNiveaus: NIVEAUS };
const person = (id, quals) => ({ id, qualifikationen: quals });
const gueltig = () => true;
const V = (personen, m = M) => pflegeVerteilung(m, personen, { qualGueltig: gueltig, heute: "2026-11-06" });

describe("Registry, Katalog und Felder", () => {
  it("Modul „geplant“, Pflege, Sachfeld, keine Registerregel (Q3 offen)", () => {
    expect(modulVon("pflegequal")).toMatchObject({ pakete: ["pflege"], status: "geplant", datenfelder: ["pflegeNiveaus"], sachfelder: ["pflegeNiveaus"] });
    expect(modulVon("pflegequal").personenfelder ?? []).toEqual([]);
    expect(REGELN_BRANCHEN.some((r) => r.modul === "pflegequal")).toBe(false);
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
  it("Feld im Positivkatalog, fail-closed; Ausnahmeweg-Oberfläche vorhanden; Statusgate ohne Befund", () => {
    expect(BETRIEB.pflegeNiveaus).toEqual(["weg", "weg"]);
    const abgenommen = { ...modulVon("pflegequal"), status: "vorlaeufig", abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/x.md" } };
    expect(pruefeModulStatus([abgenommen])).toEqual([]);
  });
  it("die Vorlagen des Branchenkatalogs unterscheiden Fachkraft und Betreuungskraft über das Flag", () => {
    const pflege = qualifikationenFuer("pflege");
    expect(pflege.find((q) => q.name === "Pflegefachkraft").fachkraft).toBe(true);
    expect(pflege.find((q) => q.name === "Betreuungskraft § 43b").fachkraft).toBe(false);
  });
  it("Gruppen und Versorgungsformen sind fest benannt", () => {
    expect(PFLEGE_GRUPPEN).toEqual(["fachkraft", "assistenz", "betreuung", "sonstige"]);
    expect(PFLEGE_VERSORGUNG).toEqual([null, "vollstationaer", "ambulant", "beides"]);
  });
});

describe("Niveaus prüfen (Q1 a+b, Q2 a)", () => {
  it("gültige Niveaus bestehen; leer oder fehlend auch", () => {
    expect(pruefePflegeNiveaus(NIVEAUS, QUALS)).toBeNull();
    expect(pruefePflegeNiveaus(undefined, QUALS)).toBeNull();
    expect(pruefePflegeNiveaus([], QUALS)).toBeNull();
  });
  it("Form, Name, Gruppe, Versorgung und Kennungen werden geprüft", () => {
    expect(pruefePflegeNiveaus("x", QUALS)).toMatch(/Liste/);
    expect(pruefePflegeNiveaus([{ ...NIVEAUS[0], gruppe: "chef" }], QUALS)).toMatch(/Gruppe/);
    expect(pruefePflegeNiveaus([{ ...NIVEAUS[0], versorgung: "stationaer" }], QUALS)).toMatch(/Versorgung/);
    expect(pruefePflegeNiveaus([{ ...NIVEAUS[0], qualifikationen: ["gibtsnicht"] }], QUALS)).toMatch(/nicht bekannt/);
    expect(pruefePflegeNiveaus([{ ...NIVEAUS[0], geheim: 1 }], QUALS)).toMatch(/unbekannte Felder/);
    expect(pruefePflegeNiveaus([{ ...NIVEAUS[0], name: "" }], QUALS)).toMatch(/Name/);
  });
  it("eine Qualifikation steht höchstens in einem Niveau", () => {
    expect(pruefePflegeNiveaus([NIVEAUS[1], { ...NIVEAUS[1], id: "n-x" }], QUALS)).toMatch(/schon in einem anderen/);
  });
  it("Fachkraft-Qualifikation lässt sich nicht als Betreuung oder Assistenz zählen (Q2 a)", () => {
    expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "betreuung", qualifikationen: ["pfk"] }], QUALS)).toMatch(/Fachkraft-Qualifikation/);
    expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "assistenz", qualifikationen: ["pfk"] }], QUALS)).toMatch(/Fachkraft-Qualifikation/);
  });
  it("Gruppe Fachkraft nur mit Fachkraft-Qualifikation", () => {
    expect(pruefePflegeNiveaus([{ id: "x", name: "X", gruppe: "fachkraft", qualifikationen: ["pa"] }], QUALS)).toMatch(/nur Fachkraft/);
  });
  it("Zusammen-Schreibweg liefert den Grund", () => {
    expect(pflegeZusammen({ qualifikationen: QUALS, pflegeNiveaus: NIVEAUS })).toEqual({});
    expect(pflegeZusammen({ qualifikationen: QUALS, pflegeNiveaus: [{ id: "x", name: "X", gruppe: "betreuung", qualifikationen: ["pfk"] }] }).grund).toMatch(/Q2/);
  });
});

describe("Verteilung je Dienst (Q1 a, Q2 a)", () => {
  it("zählt je Niveau, Fachkräfte und Pflegekräfte insgesamt; Betreuung gesondert", () => {
    const v = V([person("a", ["pfk"]), person("b", ["pa"]), person("c", ["bk"]), person("d", ["pfk", "bk"])]);
    expect(v.fachkraefte).toBe(2);
    expect(v.pflegekraefte).toBe(3);
    expect(v.betreuung).toBe(1);
    expect(v.niveaus.find((n) => n.id === "n-fk").anzahl).toBe(2);
    expect(v.niveaus.find((n) => n.id === "n-bk").anzahl).toBe(1);
  });
  it("Betreuungskräfte werden nie als Pflegekräfte oder Fachkräfte gezählt", () => {
    const v = V([person("c", ["bk"]), person("e", ["bk"])]);
    expect(v.betreuung).toBe(2);
    expect(v.pflegekraefte).toBe(0);
    expect(v.fachkraefte).toBe(0);
  });
  it("eine Person mit mehreren Qualifikationen zählt einmal, im höchsten Rang", () => {
    const v = V([person("d", ["pa", "pfk"])]);
    expect(v.fachkraefte).toBe(1);
    expect(v.pflegekraefte).toBe(1);
    expect(v.niveaus.reduce((s, n) => s + n.anzahl, 0)).toBe(1);
  });
  it("Person ohne passende Qualifikation: „ohne Niveau“", () => {
    const v = V([person("f", ["gibtsnicht"])]);
    expect(v.ohneNiveau).toBe(1);
  });
  it("nicht gültige Qualifikation zählt nicht (Prüfung über qualGueltig)", () => {
    const v = pflegeVerteilung(M, [person("a", ["pfk"])], { qualGueltig: () => false, heute: "2026-11-06" });
    expect(v.fachkraefte).toBe(0);
    expect(v.ohneNiveau).toBe(1);
  });
  it("ohne Prüffunktion ist die Verteilung ein Fehler (kein stiller Wert)", () => {
    expect(() => pflegeVerteilung(M, [], { heute: "2026-11-06" })).toThrow(/Qualifikationsprüfung/);
  });
  it("ist reproduzierbar: gleiche Eingaben, gleiches Ergebnis", () => {
    const p = [person("a", ["pfk"]), person("b", ["bk"])];
    expect(JSON.stringify(V(p))).toBe(JSON.stringify(V(p)));
  });
});

describe("Darstellung", () => {
  it("zeigt Fachkräfte, Pflegekräfte und Betreuung gesondert, ohne Kennungen", () => {
    const html = renderToStaticMarkup(h(PflegeVerteilung, { m: M, personenImDienst: [person("pers-a", ["pfk"]), person("pers-c", ["bk"])],
      qualGueltig: gueltig, heute: "2026-11-06" }));
    expect(html).toMatch(/Fachkräfte: 1/);
    expect(html).toMatch(/Betreuungskräfte \(nicht als Pflegekräfte gezählt\): 1/);
    expect(html).not.toMatch(/pers-/);
  });
  it("ohne Niveaus: Leerhinweis", () => {
    expect(renderToStaticMarkup(h(PflegeVerteilung, { m: {}, personenImDienst: [], qualGueltig: gueltig, heute: "2026-11-06" }))).toMatch(/Noch keine Pflegeniveaus/);
  });
});
