/* ==========================================================================
   MODUL POSTEN — Objektbezogene Posten (WP-19, Strang A, Datenmodell)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung): P1 a — eigener Datensatz Objekt → Posten
   (Betriebsfeld `objekte`); P2 a — Einteilung auf Posten je Tag
   (Betriebsfeld `postenPlan`, Schlüssel „personId|Tag"); P3 a — fehlende
   Qualifikation und Unterbesetzung eines Postens sind ein Hinweis. Die
   Posten-Dienstarten des Bestands (posten:true/quelle) bleiben unverändert
   (G10 a). Das Modul bleibt „geplant"; ein inaktives Modul erzeugt keine
   Befunde.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  pruefeObjekte, pruefePostenPlan, postenIndex, postenLage, postenBefunde, postenZusammen, POSTEN_GRENZEN,
} from "../server/lib/modul-posten.mjs";
import { BRANCHENMODULE, modulVon, pruefeModulRegistry } from "../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN, pruefeBranchenkatalog } from "../server/lib/branchenkatalog.mjs";
import { BETRIEB } from "../server/lib/sicht.mjs";
import { pruefeRegister } from "../src/regelregister.js";
import { pruefeRegel } from "../server/lib/regelbaukasten.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { PostenUebersicht } from "../src/module/posten.jsx";

const MO = "2026-11-02";
const OBJEKTE = [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [
  { id: "po1", name: "Pforte", soll: { F: 2 }, qualifikationen: ["q34a"] },
  { id: "po2", name: "Rundgang", soll: { F: 1, S: 1 }, qualifikationen: [] }] }];
const heute = MO;
const person = (id, quals = []) => ({ id, vorname: "V", nachname: id, status: "aktiv", qualifikationen: quals, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const QUALS = [{ id: "q34a", name: "Sachkunde", fachkraft: false, gueltigMonate: null, nachweisPflicht: false }];

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "posten" ? { ...x, status: "vorlaeufig" } : x));
const betrieb = ({ an = true, pakete = ["sicherheit"], plan = {} } = {}) => ({
  ...branchenbestand({ pakete, branchenmodule: an ? { posten: { an: true } } : {} }).mandanten[0],
  objekte: OBJEKTE, postenPlan: plan, qualifikationen: QUALS,
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "S", name: "Spät", start: "14:00", ende: "22:00" }] });
const qualGueltig = (_m, p, qid) => (p.qualifikationen || []).includes(qid);
const opts = (extra = {}) => ({ auswerten: pruefeRegel, module: AKTIV, qualGueltig, heute, ...extra });

describe("Registry und Katalog", () => {
  it("Modul registriert, Sicherheit, „geplant“, mit vorläufigen Regeln und den Datenfeldern", () => {
    expect(modulVon("posten")).toMatchObject({ pakete: ["sicherheit"], status: "geplant", datenfelder: ["objekte", "postenPlan"],
      regelIds: ["POSTEN-BESETZUNG-01", "POSTEN-QUAL-01"] });
    for (const id of ["POSTEN-BESETZUNG-01", "POSTEN-QUAL-01"])
      expect(REGELN_BRANCHEN.find((r) => r.id === id)).toMatchObject({ modul: "posten", pruefstatus: "provisional", hoechsteStufe: "hinweis" });
    expect(pruefeModulRegistry()).toEqual([]);
    expect(pruefeBranchenkatalog()).toEqual([]);
    expect(pruefeRegister()).toEqual([]);
  });
  it("beide Datenfelder stehen im Positivkatalog (sonst gehen sie nicht hinaus)", () => {
    expect(BETRIEB.objekte).toBeTruthy();
    expect(BETRIEB.postenPlan).toBeTruthy();
  });
});

describe("Datenmodell Objekt → Posten (P1 a)", () => {
  it("gültige Objekte; Index über alle Posten", () => {
    expect(pruefeObjekte(OBJEKTE)).toBeNull();
    expect(pruefeObjekte([])).toBeNull();
    expect(pruefeObjekte(undefined)).toBeNull();
    const ix = postenIndex({ objekte: OBJEKTE });
    expect(ix.get("po1")).toMatchObject({ objekt: { id: "o1" }, posten: { name: "Pforte" } });
    expect(ix.size).toBe(2);
  });
  it("weist Doppelte, fehlende Namen, falsche Sollwerte und zu viele Einträge ab", () => {
    const posten = (p) => [{ id: "o1", name: "O", posten: p }];
    for (const kaputt of [
      "objekte", [{ id: "o1" }], [{ id: "o1", name: "" , posten: [] }], [{ id: "o1", name: "O", posten: "x" }],
      [...OBJEKTE, ...OBJEKTE], posten([{ id: "p", name: "P" }, { id: "p", name: "Q" }]),
      posten([{ id: "p", name: "P", soll: { F: -1 } }]), posten([{ id: "p", name: "P", soll: { F: 1.5 } }]), posten([{ id: "p", name: "P", soll: [] }]),
      posten([{ id: "p", name: "P", qualifikationen: "q" }]), posten([{ id: "p", name: "P", extra: 1 }]),
      posten(Array.from({ length: POSTEN_GRENZEN.postenJeObjekt + 1 }, (_, i) => ({ id: `p${i}`, name: "P" }))),
      Array.from({ length: POSTEN_GRENZEN.objekte + 1 }, (_, i) => ({ id: `o${i}`, name: "O", posten: [] })),
      [{ id: "o1", name: "O", posten: [{ id: "o1", name: "P" }] }],
    ]) expect(pruefeObjekte(kaputt), JSON.stringify(kaputt).slice(0, 100)).toBeTruthy();
  });
  it("Einteilung auf Posten: Schlüssel „Person|Tag“ → Posten", () => {
    expect(pruefePostenPlan({ [`a|${MO}`]: "po1" })).toBeNull();
    expect(pruefePostenPlan(undefined)).toBeNull();
    for (const kaputt of [[], "x", { a: "po1" }, { [`a|${MO}`]: 5 }, { [`a|2026-13-40`]: "po1" }, { [`a|${MO}`]: "x".repeat(100) }])
      expect(pruefePostenPlan(kaputt), JSON.stringify(kaputt)).toBeTruthy();
  });
});

describe("Lage (Besetzung je Posten)", () => {
  const plan = { [`a|${MO}`]: "po1", [`b|${MO}`]: "po1", [`c|${MO}`]: "po2" };
  it("Soll, Ist und Fehlbestand je Posten und Dienst; Posten ohne Soll im Dienst fehlen", () => {
    const l = postenLage(betrieb({ plan }), MO, "F", [person("a"), person("b"), person("c")]);
    expect(l.map((x) => [x.posten, x.soll, x.ist.length, x.fehlt])).toEqual([["po1", 2, 2, 0], ["po2", 1, 1, 0]]);
    const knapp = postenLage(betrieb({ plan }), MO, "F", [person("a")]);
    expect(knapp.find((x) => x.posten === "po1")).toMatchObject({ ist: ["a"], fehlt: 1 });
    expect(postenLage(betrieb({ plan }), MO, "N", []).length).toBe(0);
  });
  it("nur wer im Dienst ist, zählt — Eintrag auf einen anderen Tag oder ohne Dienst zählt nicht", () => {
    const l = postenLage(betrieb({ plan: { [`a|${MO}`]: "po1", [`b|2026-11-03`]: "po1" } }), MO, "F", [person("a"), person("b")]);
    expect(l.find((x) => x.posten === "po1").ist).toEqual(["a"]);
  });
});

describe("Befunde (Hinweis, sperrt nie; inaktiv: keine)", () => {
  const plan = (pid, posten) => ({ [`${pid}|${MO}`]: posten });
  it("fehlende Qualifikation für den Posten: Hinweis; mit Qualifikation: keiner", () => {
    const b = postenBefunde(betrieb({ plan: plan("a", "po1") }), { id: "F" }, MO, person("a"), [person("a")], opts());
    expect(b.find((x) => x.regelId === "POSTEN-QUAL-01")).toMatchObject({ regel: "branche", modul: "posten", stufe: "hinweis", art: "branche" });
    const gut = postenBefunde(betrieb({ plan: plan("a", "po1") }), { id: "F" }, MO, person("a", ["q34a"]), [person("a", ["q34a"])], opts());
    expect(gut.some((x) => x.regelId === "POSTEN-QUAL-01")).toBe(false);
  });
  it("Unterbesetzung des Postens: Hinweis; genau erreicht: keiner", () => {
    const a = person("a", ["q34a"]), b2 = person("b", ["q34a"]);
    const eins = postenBefunde(betrieb({ plan: plan("a", "po1") }), { id: "F" }, MO, a, [a], opts());
    expect(eins.find((x) => x.regelId === "POSTEN-BESETZUNG-01")).toMatchObject({ stufe: "hinweis" });
    const zwei = postenBefunde(betrieb({ plan: { ...plan("a", "po1"), ...plan("b", "po1") } }), { id: "F" }, MO, a, [a, b2], opts());
    expect(zwei.some((x) => x.regelId === "POSTEN-BESETZUNG-01")).toBe(false);
  });
  it("ohne Einteilung auf einen Posten: nichts; Posten ohne Soll in diesem Dienst: nichts", () => {
    expect(postenBefunde(betrieb(), { id: "F" }, MO, person("a"), [person("a")], opts())).toEqual([]);
    expect(postenBefunde(betrieb({ plan: plan("a", "po1") }), { id: "S" }, MO, person("a"), [person("a")], opts())).toEqual([]);
  });
  it("inaktives Modul erzeugt keine Befunde — geplant, ausgeschaltet, ohne Paket", () => {
    const art = (m, module) => postenBefunde(m, { id: "F" }, MO, person("a"), [person("a")], opts({ module }));
    const p = plan("a", "po1");
    expect(art(betrieb({ plan: p }), undefined)).toEqual([]);
    expect(art(betrieb({ an: false, plan: p }), AKTIV)).toEqual([]);
    expect(art(betrieb({ pakete: [], plan: p }), AKTIV)).toEqual([]);
  });
});

describe("Schreibweg und Sicht (Server)", () => {
  it("postenZusammen weist fehlerhafte Felder ab", () => {
    expect(postenZusammen({ objekte: OBJEKTE, postenPlan: { [`a|${MO}`]: "po1" } }).grund).toBeUndefined();
    expect(postenZusammen({}).grund).toBeUndefined();
    expect(postenZusammen({ objekte: [{ id: "o" }] }).grund).toMatch(/Objekt/);
    expect(postenZusammen({ postenPlan: { x: 1 } }).grund).toMatch(/Posten/);
  });
  it("Planung und Leitung speichern Objekte und Einteilungen; fehlerhafte werden abgewiesen", () => {
    const g = branchenbestand({ pakete: ["sicherheit"] });
    for (const r of ["PL", "LT"]) {
      const ok = schreibeAls(g, r, (m) => { m.objekte = OBJEKTE; m.postenPlan = { [`a1|${MO}`]: "po1" }; });
      expect(ok.verweigert, r).toBeFalsy();
      expect(ok.mandanten[0].objekte).toEqual(OBJEKTE);
      expect(ok.mandanten[0].postenPlan).toEqual({ [`a1|${MO}`]: "po1" });
    }
    expect(schreibeAls(g, "PL", (m) => { m.objekte = [{ id: "o" }]; }).verweigert).toMatch(/Objekt/);
  });
  it("Beschäftigte und Schichtverantwortung schreiben weder Objekte noch Einteilungen", () => {
    const g = { ...branchenbestand({ pakete: ["sicherheit"] }) };
    g.mandanten[0].objekte = OBJEKTE;
    for (const r of ["MA", "SV"]) {
      const v = schreibeAls(g, r, (m) => { m.objekte = []; m.postenPlan = { [`a1|${MO}`]: "po2" }; });
      if (!v.verweigert) {
        expect(v.mandanten[0].objekte, r).toEqual(OBJEKTE);
        expect(v.mandanten[0].postenPlan || {}, r).toEqual({});
      }
    }
  });
  it("Sicht: Objekte sehen alle Rollen; die Einteilung wie der Plan (abweichungen), Betriebsrat nicht", () => {
    const g = branchenbestand({ pakete: ["sicherheit"] });
    g.mandanten[0].objekte = OBJEKTE;
    g.mandanten[0].postenPlan = { [`a1|${MO}`]: "po1", [`s1|${MO}`]: "po2" };
    for (const r of ["MA", "SV", "PL", "LT", "BR"]) expect(bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].objekte, r).toEqual(OBJEKTE);
    for (const r of ["PL", "LT"]) expect(Object.keys(bestandFuerRolle(g, SITZUNGEN[r]).mandanten[0].postenPlan), r).toHaveLength(2);
    expect(Object.keys(bestandFuerRolle(g, SITZUNGEN.MA).mandanten[0].postenPlan || {})).toEqual([`a1|${MO}`]);
    expect(Object.keys(bestandFuerRolle(g, SITZUNGEN.BR).mandanten[0].postenPlan || {})).toEqual([]);
  });
});

describe("Oberfläche", () => {
  it("zeigt Objekte, Posten und Lücken in Worten", () => {
    const m = betrieb({ plan: { [`a|${MO}`]: "po1" } });
    const html = renderToStaticMarkup(h(PostenUebersicht, { m, datum: MO, dienstId: "F", personenImDienst: [person("a")] }));
    for (const t of ["Objekt Nord", "Pforte", "Rundgang", "fehlt"]) expect(html).toContain(t);
  });
});
