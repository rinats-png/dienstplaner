/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM UNABHÄNGIGEN REVIEW (Opus, „integrierbar mit Auflagen")

   Je Befund ein Block; Zuordnung Befund ↔ Test in docs/acc45/wp19-0-nachweis.md,
   Abschnitt „Nachtrag Opus-Review".

     N1  Betreiber-Neuanlage, bestand-anlegen, Erstbefüllung: Schalter,
         Bestätigungen, Regelwerte und Modulprotokoll werden verworfen (G2/G6).
     N2  G3 Datenschutz: Ausnahmeweg Art. 16/17 trotz Nur-Lesen (a),
         Löschlauf räumt Moduldaten mit ab (b), Modulprotokoll mit Frist statt
         Dauersperre (c), Statusvertrag verlangt das für jedes Datenfeld (d).
     N3  G10: { an: false } ohne Vorgänger legt nichts an; Nur-Lesen erst nach
         echtem Einschalten.
     N4  Fehlende einstellungen: der Schreibweg stellt selbst wieder her.
     N5  Testlücken (Teilübermittlung, Grundlage aus Leerzeichen,
         wiederverwendete Bestätigung).
     N6  Regelwert-Formular verliert den Wert nicht.
     N7  G10 statisch auch über Server-Dateien und indirekte Abfragen.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BM from "../server/lib/branchenmodule.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import * as AUF from "../server/lib/aufbewahrung.mjs";
import { zusammenfuehren } from "../server/lib/rechte.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

const MS = await import("../server/lib/modulschreibwege.mjs");
const KERN = await import("../src/module/kern.jsx").catch(() => ({}));

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, "..");
const lies = (datei) => readFileSync(path.join(WURZEL, datei), "utf8");

const kopie = (x) => JSON.parse(JSON.stringify(x));
const SITZ = { person: "l1" };
const GRUNDLAGE = "Betriebsvereinbarung Wachdokumentation vom 01.10.2026, § 3";
const BEST = { bestaetigt: true, grundlage: GRUNDLAGE };
const EIN = "2026-10-01T08:00:00.000Z";                       // erstes echtes Einschalten (vom Server)

const TM = Object.freeze({ id: "testmodul", merkmal: "testmodul", name: "Testmodul", pakete: ["sicherheit"], status: "vorlaeufig",
  abhaengigVon: [], mitbestimmung: false, datenfelder: ["testDaten"], personenfelder: ["testDaten"], regelIds: [], ausnahmeUi: true,
  berichtigungsWerte: { testDaten: (w) => typeof w === "string", testWache: (w) => typeof w === "string" },
  parameter: {}, abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/wp19-13-nachweis.md" } });
const TMB = Object.freeze({ ...TM, id: "testwache", merkmal: "testwache", name: "Testwache", mitbestimmung: true,
  datenfelder: ["testWache"], personenfelder: ["testWache"] });
const LISTE = [...BRANCHENMODULE, TM, TMB];
/* Dieselbe Registry, in der Wachbuch und Bereichsplan nicht mehr „geplant" sind (Stand nach einer Abnahme). */
const AKTIV = BRANCHENMODULE.map((x) => (["wachbuch", "bereichsplan", "posten"].includes(x.id)
  ? { ...x, status: "vorlaeufig", ausnahmeUi: true, abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/wp19-13-nachweis.md" } } : x));
/* Zweiter Opus-Review / A3: gelöscht wird nur nach geprüfter Aufbewahrungsregel — für die Löschlauf-Fälle eine geprüfte Fassung. */
const GEPRUEFT = (r) => ({ ...r, pruefstatus: "geprueft", geprueftAm: "2026-11-01T00:00:00.000Z", gueltigAb: "2026-01-01" });
const REGELN = { moduldaten: GEPRUEFT(BM.MODULDATEN_AUFBEWAHRUNG), modulprotokoll: GEPRUEFT(BM.MODULPROTOKOLL_FRIST) };
/* T-08/M1: Wachbuch-/Objektberichtsfelder löscht der Lauf nur mit berechenbarem BewachV-Fristtyp — heute keiner,
   auch „ereignis“ nicht. Erreichbarkeit des Felds belegt LISTE_OHNE_BEWACHV (dasselbe Modul ohne Markierung). */
const REGELN_BEWACHV = { ...REGELN, moduldaten: { ...REGELN.moduldaten, bewachvFristtyp: "ereignis" } };
const BEWACHV_FELDER = new Set(BRANCHENMODULE.filter((x) => x.bewachvFrist).flatMap((x) => x.personenfelder || []));
const ohneBewachv = (liste) => liste.map((x) => (x.bewachvFrist ? { ...x, bewachvFrist: false } : x));

const betrieb = (bm, extra = {}) => ({ ...branchenbestand({ pakete: ["sicherheit", "pflege"], branchenmodule: bm }).mandanten[0], ...extra });
const mitE = (m, e) => ({ ...m, einstellungen: { ...m.einstellungen, ...e } });
const zus = (alt, neu, darfOrg = true, liste = LISTE) => BM.branchenmoduleZusammen(alt, neu, SITZ, darfOrg, liste);

/* Gefälschte Moduleinstellungen, wie sie ein Inhalt mitbringen könnte. */
const GEFAELSCHT = () => ({
  branchenmodule: {
    wachbuch: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "x",
      mitbestimmung: { grundlage: "erfunden", bestaetigtAm: EIN, bestaetigtVon: "x" } },
    bereichsplan: { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "x" },
  },
  regelwerte: { "POSTEN-QUAL-01": { quelle: "Q", fundstelle: "F", version: "1", gueltigAb: "2026-01-01", gueltigBis: null,
    pruefstatus: "geprueft", stufe: "achtung", geprueftAm: EIN, geprueftVon: "x", geaendertAm: EIN, geaendertVon: "x" } },
  modulprotokoll: [{ art: "eingeschaltet", modul: "wachbuch", am: EIN, von: "x", grundlage: "erfunden" }],
});
const ohneModulfelder = (e) => {
  for (const f of ["branchenmodule", "regelwerte", "modulprotokoll"]) expect(e && Object.prototype.hasOwnProperty.call(e, f), f).toBe(false);
};

/* ------------------------------------------------------------------------ */
describe("N1 — neu angelegter Betrieb übernimmt keine Moduleinstellungen (G2/G6)", () => {
  it("Betreiber legt über PUT einen Betrieb mit Schaltern, Bestätigung, Regelwerten und Protokoll an: alles verworfen", () => {
    const g = branchenbestand({ pakete: ["sicherheit"] });
    const s = kopie(g);
    const neu = { ...kopie(g.mandanten[0]), id: "m2", name: "Neu", pakete: ["sicherheit", "pflege"],
      einstellungen: { ruhezeit: 11, ...GEFAELSCHT() } };
    s.mandanten.push(neu);
    const v = zusammenfuehren(g, s, { rolle: "betreiber", person: null, betrieb: 0 });
    expect(v && !v.verweigert).toBe(true);
    const m2 = v.mandanten.find((m) => m.id === "m2");
    ohneModulfelder(m2.einstellungen);
    expect(m2.einstellungen.ruhezeit).toBe(11);                         // übrige Einstellungen bleiben
    expect(BM.modulAktiv(m2, "wachbuch", AKTIV)).toBe(false);
    expect(BM.modulNurLesen(m2, "bereichsplan", AKTIV)).toBe(false);
    /* Der bestehende Betrieb behält, was er hat (der Betreiber schreibt dort nur Kaufmännisches). */
    expect(v.mandanten.find((m) => m.id === "m1")).toEqual(g.mandanten[0]);
  });
  it("bestandOhneModuleinstellungen: jeder Betrieb, übrige Felder unberührt, ohne Bedarf dasselbe Objekt", () => {
    const b = { version: 9, mandanten: [{ id: "a", einstellungen: { ruhezeit: 11, ...GEFAELSCHT() } }, { id: "b", einstellungen: { x: 1 } }, null] };
    const r = BM.bestandOhneModuleinstellungen(b);
    ohneModulfelder(r.mandanten[0].einstellungen);
    expect(r.mandanten[0].einstellungen.ruhezeit).toBe(11);
    expect(r.mandanten[1]).toBe(b.mandanten[1]);
    expect(r.mandanten[2]).toBeNull();
    expect(b.mandanten[0].einstellungen.branchenmodule).toBeTruthy();   // Eingabe unverändert
    const sauber = { mandanten: [{ id: "a", einstellungen: {} }] };
    expect(BM.bestandOhneModuleinstellungen(sauber)).toBe(sauber);
  });
  it("bestand-anlegen verwirft die Moduleinstellungen für alle Vorlagen (Quelltext: ein Aufruf vor der Prüfung)", () => {
    const d = lies("server/funktionen/daten.mjs");
    const block = d.slice(d.indexOf('pfad === "bestand-anlegen"'), d.indexOf('pfad === "demos"'));
    expect(block).toMatch(/bestandOhneModuleinstellungen\(/);
    expect(block.indexOf("bestandOhneModuleinstellungen(")).toBeLessThan(block.indexOf("pruefeGestalt("));
  });
});

/* ------------------------------------------------------------------------ */
describe("N2a — Ausnahmeweg Art. 16/17 DSGVO trotz Nur-Lesen", () => {
  const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
  const PLAN = { "a1|2026-11-02": "po1", "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" };
  const OBJ = [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }, { id: "po2", name: "Halle", soll: { F: 1 } }] },
    { id: "ob2", name: "Lager", posten: [] }];
  const gesamt = () => {
    const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: AUS } });
    g.mandanten[0].postenPlan = { ...PLAN };
    g.mandanten[0].objekte = kopie(OBJ);
    return g;
  };
  /* Grund als Kategorie (zweiter Opus-Review M4). */
  const LOESCH = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };

  it("Leitung löscht genau den benannten Eintrag: gespeichert ohne ihn, Rest unverändert, Protokoll ohne Personenbezug", () => {
    const g = gesamt();
    const v = schreibeAls(g, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    expect(v.verweigert).toBeFalsy();
    const m = v.mandanten[0];
    expect(m.postenPlan).toEqual({ "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" });
    expect(m.objekte).toEqual(OBJ);
    expect("moduldatenAusnahme" in m).toBe(false);                     // nie gespeichert
    const p = m.einstellungen.modulprotokoll;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ art: "moduldaten-loeschung", modul: "posten", feld: "postenPlan", anzahl: 1, von: "l1", grund: LOESCH.grund });
    expect(JSON.stringify(p)).not.toMatch(/a1\|/);                      // kein Person|Tag im Protokoll
    const zeilen = BM.modulProtokollZeilen(g, v);
    expect(zeilen).toEqual(["Branchenmodul posten: Datenschutz-Löschung (Art. 17 DSGVO), 1 Eintrag in postenPlan"]);
  });
  it("Berichtigung (Art. 16): nur der benannte Eintrag ändert sich, nichts kommt dazu", () => {
    const ok = schreibeAls(gesamt(), "LT", (m) => {
      m.postenPlan["a1|2026-11-03"] = "po2";
      m.moduldatenAusnahme = { modul: "posten", art: "berichtigung", grund: "art16", eintraege: { postenPlan: ["a1|2026-11-03"] } };
    });
    expect(ok.verweigert).toBeFalsy();
    expect(ok.mandanten[0].postenPlan["a1|2026-11-03"]).toBe("po2");
    expect(ok.mandanten[0].einstellungen.modulprotokoll[0]).toMatchObject({ art: "moduldaten-berichtigung", anzahl: 1 });
    const neu = schreibeAls(gesamt(), "LT", (m) => {
      m.postenPlan["a1|2026-11-04"] = "po2";
      m.moduldatenAusnahme = { modul: "posten", art: "berichtigung", grund: "art16", eintraege: { postenPlan: ["a1|2026-11-04"] } };
    });
    expect(neu.verweigert).toMatch(/nur lesbar|Ausnahmeweg/);
    /* Benannter Eintrag berichtigt, nebenbei ein unbenannter neu: abgewiesen. */
    const nebenbei = schreibeAls(gesamt(), "LT", (m) => {
      m.postenPlan["a1|2026-11-03"] = "po2";
      m.postenPlan["a1|2026-11-05"] = "po2";
      m.moduldatenAusnahme = { modul: "posten", art: "berichtigung", grund: "art16", eintraege: { postenPlan: ["a1|2026-11-03"] } };
    });
    expect(nebenbei.verweigert).toMatch(/nichts Neues/);
  });
  it("Löschung in einer Liste (Objekte) über die Kennung", () => {
    const v = schreibeAls(gesamt(), "LT", (m) => {
      m.objekte = m.objekte.filter((o) => o.id !== "ob2");
      m.moduldatenAusnahme = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { objekte: ["ob2"] } };
    });
    expect(v.verweigert).toBeFalsy();
    expect(v.mandanten[0].objekte.map((o) => o.id)).toEqual(["ob1"]);
  });
  it("nur genau die benannten Datensätze: mehr, weniger, anderes Feld, ohne Grund, falsche Art — abgewiesen", () => {
    const faelle = [
      (m) => { delete m.postenPlan["a1|2026-11-02"]; delete m.postenPlan["a1|2026-11-03"]; m.moduldatenAusnahme = LOESCH; },
      (m) => { m.moduldatenAusnahme = LOESCH; },
      (m) => { delete m.postenPlan["a1|2026-11-02"]; m.objekte = []; m.moduldatenAusnahme = LOESCH; },
      (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, grund: "  " }; },
      (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, art: "aufraeumen" }; },
      (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, modul: "bereichsplan" }; },
      (m) => { m.postenPlan["a1|2026-11-02"] = "po2"; m.moduldatenAusnahme = LOESCH; },
    ];
    faelle.forEach((f, i) => {
      const g = gesamt();
      const v = schreibeAls(g, "LT", f);
      expect(v && v.verweigert, `Fall ${i}`).toBeTruthy();
    });
  });
  it("nur die Leitung (org.edit): Planung und Schichtverantwortung abgewiesen", () => {
    for (const r of ["PL", "SV"]) {
      const v = schreibeAls(gesamt(), r, (m) => { if (m.postenPlan) delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
      expect(v && v.verweigert, r).toBeTruthy();
    }
  });
  it("ohne Ausnahmeweg bleibt es beim Nur-Lesen; ein Rundweg mit Ausnahmeangabe ohne Änderung speichert sie nicht", () => {
    expect(schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; }).verweigert).toMatch(/nur lesbar/);
    /* Die Angabe kommt nur aus dem Kontext (rechte.mjs merkt sie vor der Rückfüllung; zweiter Opus-Review H1). */
    const r = MS.moduldatenZusammen(gesamt().mandanten[0], { ...gesamt().mandanten[0] }, BRANCHENMODULE,
      { darfOrgEdit: true, sitzung: SITZ, ausnahme: LOESCH });
    expect(r.grund).toBeTruthy();                                       // benannt, aber nicht gelöscht
    const ohne = MS.moduldatenZusammen(gesamt().mandanten[0], { ...gesamt().mandanten[0] }, BRANCHENMODULE, { darfOrgEdit: true, sitzung: SITZ });
    expect("moduldatenAusnahme" in ohne.mandant).toBe(false);
  });
  it("auch an der Protokollgrenze möglich (Art. 17 geht immer)", () => {
    const g = gesamt();
    const jetzt = new Date().toISOString();
    g.mandanten[0].einstellungen.modulprotokoll = Array.from({ length: BM.MODULPROTOKOLL_GRENZE }, () => ({ art: "parameter", modul: "posten", am: jetzt, von: "l1" }));
    const v = schreibeAls(g, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    expect(v.verweigert).toBeFalsy();
  });
});

/* ------------------------------------------------------------------------ */
describe("N2b — Löschlauf räumt Moduldaten mit ab (WP-26) — seit dem zweiten Opus-Review nur nach Datum und geprüfter Regel", () => {
  const HEUTE = "2026-11-03";
  const m0 = () => ({ id: "m1", aufbewahrung: {}, personen: [
      { id: "a1", nachname: "A", austritt: "2026-01-31" },              // fällig (6 Monate nach Austritt)
      { id: "a2", nachname: "B" },
      { id: "a3", nachname: "C", anonym: true }],                       // bereits anonymisiert
    postenPlan: { "a1|2026-10-01": "po1", "a2|2026-10-01": "po1", "a2|2024-09-01": "po1", "a3|2026-10-02": "po1" },
    bereichsPlan: { "a1|2026-10-01": "b1", "a2|2026-10-01": "b1", "a1|2023-05-01": "b1" },
    objekte: [{ id: "ob1", name: "Werk", posten: [] }] });

  it("Vorschau zählt Einträge hinter der Plandatenfrist (nicht: Zuordnungen anonymisierter Personen)", () => {
    const v = AUF.vorschau(m0(), HEUTE, { regeln: REGELN });
    expect(v.moduldaten).toBe(2);       // a2|2024-09-01, a1|2023-05-01
    expect(v.gesamt).toBeGreaterThanOrEqual(v.moduldaten + v.personen.length);
  });
  it("Löschlauf entfernt sie; Objekte (ohne Personenbezug) und Zuordnungen in der Frist bleiben; Bericht nennt sie", () => {
    const r = AUF.raeumen(m0(), HEUTE, { regeln: REGELN });
    expect(r.mandant.postenPlan).toEqual({ "a1|2026-10-01": "po1", "a2|2026-10-01": "po1", "a3|2026-10-02": "po1" });
    expect(r.mandant.bereichsPlan).toEqual({ "a1|2026-10-01": "b1", "a2|2026-10-01": "b1" });
    expect(r.mandant.objekte).toEqual(m0().objekte);
    expect(AUF.berichtstext(r.bericht)).toMatch(/Modulzuordnung/);
    expect(AUF.vorschau(r.mandant, HEUTE, { regeln: REGELN }).moduldaten).toBe(0);
  });
  it("jedes Personenfeld der Registry hängt am Löschlauf (technischer Nachweis, auch für künftige Module)", () => {
    const felder = [...new Set(LISTE.flatMap((x) => x.personenfelder || []))];
    expect(felder).toEqual(expect.arrayContaining(["postenPlan", "bereichsPlan"]));
    for (const f of felder) {
      const m = { id: "m", personen: [{ id: "x", anonym: true }, { id: "y" }], [f]: { "x|2023-10-01": "1", "y|2026-10-01": "1" } };
      if (BEWACHV_FELDER.has(f)) {
        /* ohne und mit Fristtyp „ereignis“ bleibt es liegen (M1); ohne Markierung erreicht der Lauf das Feld */
        expect(AUF.raeumen(m, HEUTE, { module: LISTE, regeln: REGELN }).mandant[f], f).toEqual(m[f]);
        expect(AUF.raeumen(m, HEUTE, { module: LISTE, regeln: REGELN_BEWACHV }).mandant[f], f).toEqual(m[f]);
        expect(AUF.raeumen(m, HEUTE, { module: ohneBewachv(LISTE), regeln: REGELN }).mandant[f], f).toEqual({ "y|2026-10-01": "1" });
      } else expect(AUF.raeumen(m, HEUTE, { module: LISTE, regeln: REGELN }).mandant[f], f).toEqual({ "y|2026-10-01": "1" });
      /* ungeprüfte Regel (Vorgabe): nichts gelöscht */
      expect(AUF.raeumen(m, HEUTE, { module: LISTE }).mandant[f], f).toEqual(m[f]);
    }
  });
  it("Wiederherstellen: Zuordnungen anonymisierter Personen in der Frist kommen wie die übrigen Plandaten derselben Kennung zurück", () => {
    const g = branchenbestand({ pakete: ["sicherheit"] });
    const heute = kopie(g);
    heute.mandanten[0].personen = heute.mandanten[0].personen.map((p) => (p.id === "a1" ? { ...p, anonym: true, nachname: "Ausgeschieden" } : p));
    const sicherung = kopie(g);
    sicherung.mandanten[0].postenPlan = { "a1|2026-10-01": "po1", "s1|2026-10-01": "po1" };
    sicherung.mandanten[0].abweichungen = { "a1|2026-10-01": "F" };
    const w = betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT, { marke: "x", heute: new Date("2026-11-03T10:00:00Z"), datenschutz: "an" });
    expect(w.verweigert).toBeFalsy();
    expect(w.bestand.mandanten[0].postenPlan).toEqual({ "a1|2026-10-01": "po1", "s1|2026-10-01": "po1" });
    expect(w.bestand.mandanten[0].abweichungen).toEqual({ "a1|2026-10-01": "F" });
    expect(w.bestand.mandanten[0].personen.find((p) => p.id === "a1").anonym).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
describe("N2c — Modulprotokoll: Aufbewahrungsfrist statt Dauersperre", () => {
  it("Vorgabe ist ein Entwurfswert und ausdrücklich als solcher gekennzeichnet; keine Übersteuerung je Betrieb (zweiter Review M1)", () => {
    expect(BM.MODULPROTOKOLL_FRIST).toMatchObject({ monate: expect.any(Number), pruefstatus: "vorlaeufig" });
    expect(BM.MODULPROTOKOLL_FRIST.stand).toMatch(/Entwurfswert, zu bestätigen/);
    expect(BM.modulprotokollMonate({})).toBe(BM.MODULPROTOKOLL_FRIST.monate);
    expect(BM.modulprotokollMonate({ aufbewahrung: { modulprotokollMonate: 12 } })).toBe(BM.MODULPROTOKOLL_FRIST.monate);
    expect(BM.modulprotokollMonate({ aufbewahrung: { modulprotokollMonate: 0.5 } })).toBe(BM.MODULPROTOKOLL_FRIST.monate);
  });
  it("an der Grenze (geprüfte Regel): abgelaufene Einträge gehen bis auf den zustandsbegründenden, die neue Handlung wird protokolliert", () => {
    const alt = betrieb({ testmodul: { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" } });
    alt.einstellungen.modulprotokoll = Array.from({ length: BM.MODULPROTOKOLL_GRENZE }, (_, i) => ({ art: "parameter", modul: "testmodul", am: "2020-01-01T00:00:00.000Z", von: "l1", i }));
    const r = BM.branchenmoduleZusammen(alt, mitE(alt, { branchenmodule: { testmodul: { an: true } } }), SITZ, true, LISTE, { protokollRegel: REGELN.modulprotokoll });
    expect(r.grund).toBeUndefined();
    expect(r.mandant.einstellungen.modulprotokoll).toEqual([alt.einstellungen.modulprotokoll.at(-1), expect.objectContaining({ art: "eingeschaltet", modul: "testmodul" })]);
    /* Das Betriebsprotokoll erkennt den neuen Eintrag, obwohl das Protokoll kürzer wurde, und nennt die Kürzung. */
    expect(BM.modulProtokollZeilen({ mandanten: [alt] }, { mandanten: [r.mandant] }))
      .toEqual([`Modulprotokoll: ${BM.MODULPROTOKOLL_GRENZE - 1} Einträge nach Ablauf der Aufbewahrungsfrist entfernt`, "Branchenmodul testmodul eingeschaltet"]);
    /* Ungeprüfte Regel (Vorgabe): an der Grenze nichts verdrängt — nur Ausschalten und Art. 16/17 gehen. */
    expect(zus(alt, mitE(alt, { branchenmodule: { testmodul: { an: true } } })).grund).toMatch(/Grenze/);
  });
  it("der Löschlauf entfernt eine gespeicherte Übersteuerung (modulprotokollMonate) und rechnet mit der Regel", () => {
    const m = { id: "m1", personen: [], aufbewahrung: { modulprotokollMonate: 12 } };
    expect("modulprotokollMonate" in AUF.raeumen(m, "2026-11-03").mandant.aufbewahrung).toBe(false);
    const mitFaelligem = { ...m, einstellungen: { modulprotokoll: [{ art: "parameter", modul: "posten", am: "2025-01-01T00:00:00.000Z", von: "l1" },
      { art: "parameter", modul: "posten", am: "2025-02-01T00:00:00.000Z", von: "l1" }] } };
    const r = AUF.raeumen(mitFaelligem, "2026-11-03", { regeln: REGELN });
    expect(r.mandant.einstellungen.modulprotokoll).toHaveLength(2);           // 22 Monate alt, Frist 24 (nicht 12)
  });
  it("Löschlauf (geprüfte Regel): Vorschau zählt abgelaufene, überholte Protokolleinträge, der Lauf entfernt sie, jüngere bleiben", () => {
    const jung = { art: "eingeschaltet", modul: "posten", am: "2026-10-01T08:00:00.000Z", von: "l1" };
    const neuP = { art: "parameter", modul: "posten", am: "2026-10-02T08:00:00.000Z", von: "l1" };
    const m = { id: "m1", personen: [], einstellungen: { ruhezeit: 11, modulprotokoll: [{ art: "parameter", modul: "posten", am: "2023-01-01T00:00:00.000Z", von: "l1" }, jung, neuP] } };
    expect(AUF.vorschau(m, "2026-11-03", { regeln: REGELN }).modulprotokoll).toBe(1);
    const r = AUF.raeumen(m, "2026-11-03", { regeln: REGELN });
    expect(r.mandant.einstellungen).toEqual({ ruhezeit: 11, modulprotokoll: [jung, neuP] });
    expect(AUF.berichtstext(r.bericht)).toMatch(/Modulprotokoll/);
  });
});

/* ------------------------------------------------------------------------ */
describe("N2d — Statusvertrag: kein Modul mit Daten verlässt „geplant\" ohne Datenschutzwege", () => {
  const ABN = { abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/wp19-13-nachweis.md" } };
  it("jedes Datenfeld ist als Personen- oder Sachfeld eingeordnet, sonst kein Statuswechsel", () => {
    expect(BM.pruefeModulStatus([{ ...TM, personenfelder: undefined }]).join("\n")).toMatch(/testDaten/);
    expect(BM.pruefeModulStatus([{ ...TM, personenfelder: [], sachfelder: [] }]).join("\n")).toMatch(/testDaten/);
    expect(BM.pruefeModulStatus([{ ...TM, personenfelder: ["nichtDa"], datenfelder: [] }]).join("\n")).toMatch(/nichtDa/);
    expect(BM.pruefeModulStatus([TM])).toEqual([]);
    expect(BM.pruefeModulStatus(AKTIV)).toEqual([]);
    expect(BM.pruefeModulStatus(AKTIV.map((x) => (x.id === "posten" ? { ...x, sachfelder: [] } : x))).join("\n")).toMatch(/posten.*objekte/);
    for (const x of BRANCHENMODULE) for (const f of x.datenfelder)
      expect([...(x.personenfelder || []), ...(x.sachfelder || [])], `${x.id}.${f}`).toContain(f);
    void ABN;
  });
  it("technisch: für jedes Datenfeld eines nicht mehr geplanten Moduls greifen Ausnahmeweg und Löschlauf", () => {
    for (const mod of AKTIV.filter((x) => x.status !== "geplant" && x.datenfelder.length)) {
      for (const f of mod.datenfelder) {
        const istListe = (mod.sachfelder || []).includes(f);
        const alt = { id: "m", pakete: mod.pakete, personen: [{ id: "x", anonym: true }],
          einstellungen: { branchenmodule: { [mod.id]: { an: false, eingeschaltetAm: EIN } } },
          [f]: istListe ? [{ id: "k1" }, { id: "k2" }] : { "x|2023-10-01": "1", "y|2026-10-01": "1" } };
        const neu = { ...kopie(alt), [f]: istListe ? [{ id: "k2" }] : { "y|2026-10-01": "1" } };
        const r = MS.moduldatenZusammen(alt, neu, AKTIV, { darfOrgEdit: true, sitzung: SITZ,
          ausnahme: { modul: mod.id, art: "loeschung", grund: "art17", eintraege: { [f]: [istListe ? "k1" : "x|2023-10-01"] } } });
        expect(r.grund, `${mod.id}.${f}`).toBeUndefined();
        if (!istListe && BEWACHV_FELDER.has(f)) {
          expect(AUF.raeumen(alt, "2026-11-03", { module: AKTIV, regeln: REGELN_BEWACHV }).mandant[f], `${mod.id}.${f}`).toEqual(alt[f]);
          expect(AUF.raeumen(alt, "2026-11-03", { module: ohneBewachv(AKTIV), regeln: REGELN }).mandant[f], `${mod.id}.${f}`).toEqual({ "y|2026-10-01": "1" });
        } else if (!istListe) expect(AUF.raeumen(alt, "2026-11-03", { module: AKTIV, regeln: REGELN }).mandant[f], `${mod.id}.${f}`).toEqual({ "y|2026-10-01": "1" });
      }
    }
  });
  it("Texte behaupten keine Fristen, die es nicht gibt", () => {
    expect(lies("src/module/kern.jsx")).not.toMatch(/nur nach den Aufbewahrungsfristen/);
    expect(lies("server/lib/modulschreibwege.mjs")).not.toMatch(/nur nach den Aufbewahrungsfristen/);
  });
});

/* ------------------------------------------------------------------------ */
describe("N3 — G10: Ausschalten eines nie geschalteten Moduls ändert nichts", () => {
  it("{ an: false } ohne Vorgänger legt keinen Eintrag an und protokolliert nichts", () => {
    const a = betrieb(undefined);
    const r = zus(a, mitE(a, { branchenmodule: { bereichsplan: { an: false }, testmodul: { an: false } } }), true, AKTIV.concat([TM]));
    expect(r.grund).toBeUndefined();
    expect(r.mandant.einstellungen.branchenmodule).toBeUndefined();
    expect(r.mandant.einstellungen.modulprotokoll).toBeUndefined();
  });
  it("Nur-Lesen erst nach echtem Einschalten (eingeschaltetAm vom Server); Einschalten setzt es, Ausschalten behält es", () => {
    expect(BM.modulNurLesen(betrieb({ bereichsplan: { an: false } }), "bereichsplan", AKTIV)).toBe(false);
    expect(BM.modulNurLesen(betrieb({ bereichsplan: { an: false, eingeschaltetAm: EIN } }), "bereichsplan", AKTIV)).toBe(true);
    const a = betrieb(undefined);
    const an = zus(a, mitE(a, { branchenmodule: { testmodul: { an: true, eingeschaltetAm: "1999-01-01" } } })).mandant;
    const am = an.einstellungen.branchenmodule.testmodul.eingeschaltetAm;
    expect(am).not.toBe("1999-01-01");
    expect(am).toBe(an.einstellungen.branchenmodule.testmodul.geaendertAm);
    const aus = zus(an, mitE(an, { branchenmodule: { testmodul: { an: false, eingeschaltetAm: null } } })).mandant;
    expect(aus.einstellungen.branchenmodule.testmodul.eingeschaltetAm).toBe(am);
    expect(BM.modulNurLesen(aus, "testmodul", LISTE)).toBe(true);
  });
  it("Schreibweg: Leitung schickt { bereichsplan: { an: false } } — Planung und Schichtverantwortung schreiben den Bereichsplan weiter", () => {
    const g = branchenbestand({ pakete: ["pflege"] });
    g.mandanten[0].einheiten = [{ id: "e1", versatzTage: 0, bereiche: [{ id: "b1", name: "WB 1" }] }];
    const v = schreibeAls(g, "LT", (m) => { m.einstellungen.branchenmodule = { bereichsplan: { an: false } }; });
    expect(v.verweigert).toBeFalsy();
    expect(v.mandanten[0].einstellungen.branchenmodule).toBeUndefined();
    /* Selbst ein so gespeicherter Altstand (ohne eingeschaltetAm) sperrt nichts. */
    const alt = kopie(g); alt.mandanten[0].einstellungen.branchenmodule = { bereichsplan: { an: false, geaendertAm: EIN, geaendertVon: "l1" } };
    for (const r of ["PL", "SV"]) {
      const w = schreibeAls(alt, r, (m) => { m.bereichsPlan = { "a1|2026-11-04": "b1" }; });
      expect(w && w.verweigert ? w.verweigert : "", r).not.toMatch(/nur lesbar/);
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("N4 — fehlende einstellungen: der Schreibweg stellt selbst wieder her (Lehre WP-23b)", () => {
  const gespeichert = () => {
    const m = betrieb({ testmodul: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" } });
    m.einstellungen.regelwerte = { "POSTEN-QUAL-01": { pruefstatus: "vorlaeufig", stufe: "hinweis", geaendertAm: EIN, geaendertVon: "l1" } };
    m.einstellungen.modulprotokoll = [{ art: "eingeschaltet", modul: "testmodul", am: EIN, von: "l1" }];
    return m;
  };
  for (const [name, neuE] of [["fehlt", undefined], ["null", null], ["Text", "x"], ["Liste", []]]) {
    for (const darfOrg of [true, false]) {
      it(`einstellungen ${name} (${darfOrg ? "Leitung" : "ohne org.edit"}): Schalter, Regelwerte und Protokoll bleiben`, () => {
        const alt = gespeichert();
        const neu = { ...kopie(alt) };
        if (neuE === undefined) delete neu.einstellungen; else neu.einstellungen = neuE;
        const r = zus(alt, neu, darfOrg);
        expect(r.grund).toBeUndefined();
        for (const f of ["branchenmodule", "regelwerte", "modulprotokoll"]) expect(r.mandant.einstellungen[f], f).toEqual(alt.einstellungen[f]);
      });
    }
  }
  it("ohne gespeicherte Moduleinstellungen bleibt ein fehlendes einstellungen fehlend", () => {
    const alt = betrieb(undefined);
    const neu = { ...alt }; delete neu.einstellungen;
    expect("einstellungen" in zus(alt, neu).mandant).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
describe("N5 — Testlücken aus dem Review", () => {
  const gespeichert = () => betrieb({
    testmodul: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" },
    testwache: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1",
      mitbestimmung: { grundlage: GRUNDLAGE, bestaetigtAm: EIN, bestaetigtVon: "l1" } } });
  it("Teilübermittlung (nur ein Modul im Rumpf): Schalter und Bestätigung der anderen bleiben unverändert", () => {
    const alt = gespeichert();
    const r = zus(alt, mitE(alt, { branchenmodule: { testmodul: { an: false } } }));
    expect(r.grund).toBeUndefined();
    expect(r.mandant.einstellungen.branchenmodule.testwache).toEqual(alt.einstellungen.branchenmodule.testwache);
    expect(BM.modulAktiv(r.mandant, "testwache", LISTE)).toBe(true);
    expect(r.mandant.einstellungen.branchenmodule.testmodul.an).toBe(false);
  });
  it("gespeicherte Grundlage nur aus Leerzeichen gilt nicht als bestätigt", () => {
    for (const g of ["   ", "\n\t", ""]) {
      const m = betrieb({ testwache: { an: true, mitbestimmung: { grundlage: g, bestaetigtAm: EIN, bestaetigtVon: "l1" } } });
      expect(BM.mitbestimmungBestaetigt(m.einstellungen.branchenmodule.testwache), JSON.stringify(g)).toBe(false);
      expect(BM.modulAktiv(m, "testwache", LISTE)).toBe(false);
    }
  });
  it("eine alte Bestätigung (gleiches bestaetigtAm) zählt beim erneuten Einschalten nicht", () => {
    const alt = betrieb({ testwache: { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1",
      mitbestimmung: { grundlage: GRUNDLAGE, bestaetigtAm: EIN, bestaetigtVon: "l1" } } });
    const wieder = zus(alt, mitE(alt, { branchenmodule: { testwache: { an: true, mitbestimmung: { ...BEST, bestaetigtAm: EIN, bestaetigtVon: "l1" } } } }));
    expect(wieder.grund).toMatch(/bestätigt die Leitung/);
    const neu = zus(alt, mitE(alt, { branchenmodule: { testwache: { an: true, mitbestimmung: BEST } } }));
    expect(neu.grund).toBeUndefined();
    expect(neu.mandant.einstellungen.branchenmodule.testwache.mitbestimmung.bestaetigtAm).not.toBe(EIN);
  });
});

/* ------------------------------------------------------------------------ */
describe("N6 — Regelwert-Formular verliert den Wert nicht", () => {
  it("regelwertSauber übernimmt den Wert (Zahl bleibt Zahl, Text bleibt Text); leer heißt ohne Wert", () => {
    expect(typeof KERN.regelwertSauber).toBe("function");
    const basis = { quelle: "Q", fundstelle: "F", version: "1", gueltigAb: "2026-01-01", gueltigBis: "", pruefstatus: "geprueft", stufe: "achtung" };
    expect(KERN.regelwertSauber({ ...basis, wert: 3 }).wert).toBe(3);
    expect(KERN.regelwertSauber({ ...basis, wert: "5" }, { wert: 3 }).wert).toBe(5);
    expect(KERN.regelwertSauber({ ...basis, wert: "Sachkunde" }, { wert: "x" }).wert).toBe("Sachkunde");
    expect(KERN.regelwertSauber({ ...basis, wert: true }, { wert: true }).wert).toBe(true);
    expect(KERN.regelwertSauber({ ...basis, wert: "" }, { wert: 3 })).not.toHaveProperty("wert");
    expect(BM.pruefeRegelwert("POSTEN-QUAL-01", KERN.regelwertSauber({ ...basis, wert: "5" }))).toBeNull();
    expect(lies("src/module/kern.jsx")).toMatch(/>Wert</);
  });
});

/* ------------------------------------------------------------------------ */
describe("N7 — G10 statisch: auch Server-Dateien und indirekte Abfragen", () => {
  const ZWOELF = BRANCHENMODULE.map((x) => x.id);
  /* Wer ein Modul abfragen darf: der Kern, die Module selbst, die Branchenbefunde und die Oberflächen der Module. */
  const ERLAUBT = /^(server\/lib\/(branchenmodule|branchenkatalog|branchenbefunde|modulschreibwege|modul-[a-z]+)\.mjs|src\/module\/.*|src\/stufen\.js|src\/regelregister\.js)$/;
  const dateien = (dir, endung) => readdirSync(path.join(WURZEL, dir), { withFileTypes: true }).flatMap((d) => {
    const p = `${dir}/${d.name}`;
    if (d.isDirectory()) return dateien(p, endung);
    return endung.test(d.name) ? [p] : [];
  });
  const ALLE = [...dateien("src", /\.(js|jsx)$/), ...dateien("server", /\.mjs$/)].filter((p) => !ERLAUBT.test(p));

  it("keine Datei außerhalb des Kerns und der Module fragt ein Modul ab (direkt oder über die Kernfunktionen)", () => {
    expect(ALLE.length).toBeGreaterThan(50);
    const funde = [];
    for (const p of ALLE) {
      const t = readFileSync(path.join(WURZEL, p), "utf8");
      if (/\b(modulAktiv|modulGebucht|modulZustand|modulEinstellung|modulParameter|modulNurLesen)\s*\(/.test(t)) funde.push(`${p}: Kernabfrage`);
      for (const id of ZWOELF) {
        if (new RegExp(`PAKET:${id}\\b`).test(t)) funde.push(`${p}: PAKET:${id}`);
        if (new RegExp(`\\bkann\\([^)]*["'\`]${id}["'\`]`).test(t)) funde.push(`${p}: kann(${id})`);
        if (new RegExp(`merkmale?\\b[^\\n]{0,40}\\.(includes|has|indexOf)\\(\\s*["'\`]${id}["'\`]`).test(t)) funde.push(`${p}: merkmal ${id}`);
        if (new RegExp(`branchenmodule\\s*(\\.|\\[\\s*["'\`])${id}\\b`).test(t)) funde.push(`${p}: branchenmodule.${id}`);
      }
    }
    expect(funde).toEqual([]);
  });
  it("der Test erkennt eine eingeschmuggelte Abfrage (Gegenprobe)", () => {
    const probe = 'if (kann(m, "posten")) x(); const a = modulAktiv(m, "wachbuch"); m.einstellungen.branchenmodule.posten';
    expect(/\bkann\([^)]*["'`]posten["'`]/.test(probe)).toBe(true);
    expect(/\bmodulAktiv\s*\(/.test(probe)).toBe(true);
    expect(/branchenmodule\s*(\.|\[\s*["'`])posten\b/.test(probe)).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
describe("bekannteLuecke N2 (Opus-Review T-08): Löschwege außer dem Löschlauf prüfen den BewachV-Fristtyp nicht", () => {
  /* Fachentscheid offen; Eintrag in docs/legal/TECHNISCHE-FOLGEAUFGABEN.md. Geprüft wird das heutige Verhalten,
     damit eine Änderung auffällt — nicht als „neutral“ bestanden. */
  it("bekannteLuecke N2-art17: Art.-17-Löschung über den Ausnahmeweg entfernt Wachbucheinträge ohne Fristtyp", () => {
    const mod = AKTIV.find((x) => x.id === "wachbuch");
    expect(mod.bewachvFrist).toBe(true);
    const alt = { id: "m", pakete: mod.pakete, personen: [{ id: "x" }],
      einstellungen: { branchenmodule: { wachbuch: { an: false, eingeschaltetAm: EIN } } },
      wachbuch: { "x|2026-10-01": "1", "y|2026-10-02": "1" } };
    const neu = { ...kopie(alt), wachbuch: { "y|2026-10-02": "1" } };
    const r = MS.moduldatenZusammen(alt, neu, AKTIV, { darfOrgEdit: true, sitzung: SITZ,
      ausnahme: { modul: "wachbuch", art: "loeschung", grund: "art17", eintraege: { wachbuch: ["x|2026-10-01"] } } });
    expect(r.grund).toBeUndefined();
  });
  it("bekannteLuecke N2-raum: Raum- und Mandantenlöschung kennen keinen BewachV-Fristtyp", () => {
    for (const datei of ["server/lib/raumloeschung.mjs", "server/funktionen/daten.mjs"])
      expect(lies(datei), datei).not.toMatch(/bewachv/i);
  });
});
