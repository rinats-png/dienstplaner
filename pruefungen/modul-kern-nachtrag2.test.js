/* ==========================================================================
   WP-19.0 — NACHTRAG ZUM ZWEITEN UNABHÄNGIGEN OPUS-DELTA-REVIEW
   (Urteil „integrierbar mit Auflagen") und Betreiber-Ergänzung
   Querschnittssicherheit / einheitliches Regelstatus-Schema.

   Je Befund ein Block; die Sonde des Reviewers steht als erster Fall.
   Zuordnung Befund ↔ Test: docs/acc45/wp19-0-nachweis.md, Abschnitt
   „Nachtrag zweiter Opus-Delta-Review".

     H1  gespeichertes moduldatenAusnahme sperrt jedes Speichern
     M1  Frist des Modulprotokolls je Betrieb (Planung/Leitung auf 1 Monat)
     M2  Löschlauf räumt Modul-Personenfelder pauschal (vor der Plandatenfrist)
     M3  Wiederherstellen bringt Art.-17-Löschungen zurück, umgeht Nur-Lesen
     M4  Freitext-Grund des Ausnahmewegs geht an den Betriebsrat
     N1  Modulprotokoll eines aktiven Moduls wird ganz geleert
     N2  Altstand { an: true } ohne eingeschaltetAm (fail-open)
     N3  unveränderte gespeicherte Regelwerte sperren bei Katalogänderung
     N4  Ausnahmeweg bei Listen ohne eindeutige id
     UI  Statusvertrag: Oberfläche des Ausnahmewegs vor Verlassen von „geplant"
     RS  einheitliches Regelstatus-Schema (server/lib/regelstatus.mjs)
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BM from "../server/lib/branchenmodule.mjs";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import * as AUF from "../server/lib/aufbewahrung.mjs";
import { zusammenfuehren, bestandFuerRolle } from "../server/lib/rechte.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { appQuelle } from "./app-quelle.js";

const MS = await import("../server/lib/modulschreibwege.mjs");
const RS = await import("../server/lib/regelstatus.mjs").catch(() => ({}));

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (datei) => readFileSync(path.join(HIER, "..", datei), "utf8");
const kopie = (x) => JSON.parse(JSON.stringify(x));
const SITZ = { person: "l1" };
const EIN = "2026-10-01T08:00:00.000Z";
const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
const PLAN = { "a1|2026-11-02": "po1", "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" };
const OBJ = [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }, { id: "po2", name: "Halle", soll: { F: 1 } }] },
  { id: "ob2", name: "Lager", posten: [] }];
const LOESCH = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
/** Ein Betrieb mit ausgeschaltetem Posten-Modul (Daten nur lesbar). */
const gesamt = (bm = { posten: AUS }) => {
  const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: bm });
  g.mandanten[0].postenPlan = { ...PLAN };
  g.mandanten[0].objekte = kopie(OBJ);
  return g;
};
const TM = Object.freeze({ id: "testmodul", merkmal: "testmodul", name: "Testmodul", pakete: ["sicherheit"], status: "vorlaeufig",
  abhaengigVon: [], mitbestimmung: false, datenfelder: ["testDaten", "testListe"], personenfelder: ["testDaten"], sachfelder: ["testListe"],
  regelIds: [], parameter: {}, ausnahmeUi: true, berichtigungsWerte: { testDaten: (w) => typeof w === "string" },
  abnahme: { datum: "2026-12-01", nachweis: "docs/acc45/wp19-13-nachweis.md" } });
const LISTE = [...BRANCHENMODULE, TM];
const GEPRUEFT = (regel) => ({ ...regel, pruefstatus: "geprueft", geprueftAm: "2026-11-01T00:00:00.000Z", geprueftVon: "fach",
  quelle: regel.quelle || "Quelle", fundstelle: regel.fundstelle || "Fundstelle", fassung: regel.fassung || "1", gueltigAb: "2026-01-01" });

/* ======================================================================== */
describe("H1 — ein gespeichertes moduldatenAusnahme sperrt das Speichern nicht", () => {
  const vergiftet = (bm) => { const g = gesamt(bm); g.mandanten[0].moduldatenAusnahme = { ...LOESCH }; return g; };

  it("Sonde: Leitung, Planung und Schichtverantwortung speichern trotz gespeichertem Feld (Modul aus und nie geschaltet)", () => {
    for (const bm of [{ posten: AUS }, undefined]) {
      const lt = schreibeAls(vergiftet(bm), "LT", (m) => { m.name = "Testbetrieb neu"; });
      expect(lt && lt.verweigert, `LT ${JSON.stringify(bm)}`).toBeFalsy();
      expect("moduldatenAusnahme" in lt.mandanten[0]).toBe(false);          // bereinigt, nicht geglaubt
      for (const r of ["PL", "SV"]) {
        const v = schreibeAls(vergiftet(bm), r, (m) => { m.abweichungen = { ...(m.abweichungen || {}), "s1|2026-11-20": "-" }; });
        expect(String((v && v.verweigert) || ""), `${r} ${JSON.stringify(bm)}`).not.toMatch(/Ausnahmeweg/);
        if (v && !v.verweigert) expect("moduldatenAusnahme" in v.mandanten[0], r).toBe(false);
      }
    }
  });
  it("die Angabe wirkt nur aus der Übermittlung (rechte.mjs), nie aus dem gespeicherten Betrieb", () => {
    const g = vergiftet();
    /* Gespeichertes Feld + Löschung ohne eigene Angabe: Nur-Lesen greift (keine Ausnahme aus dem Speicher). */
    const v = schreibeAls(g, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; delete m.moduldatenAusnahme; });
    expect(v.verweigert).toMatch(/nur lesbar/);
    /* Direkter Aufruf: neuM.moduldatenAusnahme ohne ktx.ausnahme zählt nicht. */
    const alt = g.mandanten[0];
    const neu = { ...kopie(alt), postenPlan: { "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" } };
    expect(MS.moduldatenZusammen(alt, neu, BRANCHENMODULE, { darfOrgEdit: true, sitzung: SITZ }).grund).toMatch(/nur lesbar/);
    expect(MS.moduldatenZusammen(alt, { ...kopie(alt) }, BRANCHENMODULE, { darfOrgEdit: true, sitzung: SITZ }).grund).toBeUndefined();
  });
  it("rechte.mjs übergibt ausnahme immer (auch undefined); kein Rückgriff auf neuM.moduldatenAusnahme", () => {
    const r = lies("server/lib/rechte.mjs");
    expect(r).toMatch(/ausnahme: moduldatenAusnahme \}\)/);
    expect(r).not.toMatch(/moduldatenAusnahme === undefined \? \{\}/);
    expect(lies("server/lib/modulschreibwege.mjs")).not.toMatch(/: hat\(neuM, "moduldatenAusnahme"\) \? neuM\.moduldatenAusnahme/);
  });
  it("Hineinkommen verhindert: Betreiber-Neuanlage, bestand-anlegen (bestandOhneModuleinstellungen) und Wiederherstellen entfernen das Feld", () => {
    const m = { id: "x", moduldatenAusnahme: LOESCH, einstellungen: { ruhezeit: 11 } };
    expect("moduldatenAusnahme" in BM.moduleinstellungenVerwerfen(m)).toBe(false);
    expect("moduldatenAusnahme" in BM.bestandOhneModuleinstellungen({ mandanten: [m] }).mandanten[0]).toBe(false);
    const g = branchenbestand({ pakete: ["sicherheit"] });
    const s = kopie(g);
    s.mandanten.push({ ...kopie(g.mandanten[0]), id: "m2", moduldatenAusnahme: LOESCH });
    const v = zusammenfuehren(g, s, { rolle: "betreiber", person: null, betrieb: 0 });
    expect("moduldatenAusnahme" in v.mandanten.find((x) => x.id === "m2")).toBe(false);
    const heute = vergiftet();
    const sicherung = vergiftet();
    const w = betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT, { marke: "x", heute: new Date("2026-11-03T10:00:00Z"), datenschutz: "aus" });
    expect("moduldatenAusnahme" in w.bestand.mandanten[0]).toBe(false);
  });
});

/* ======================================================================== */
describe("M1 — Frist des Modulprotokolls: keine Übersteuerung je Betrieb (bis FN-32)", () => {
  it("Sonde: modulprotokollMonate 1 wirkt nicht; der Löschlauf (Modus an) leert das Audit nicht", () => {
    expect(BM.modulprotokollMonate({ aufbewahrung: { modulprotokollMonate: 1 } })).toBe(BM.MODULPROTOKOLL_FRIST.monate);
    const p = [{ art: "eingeschaltet", modul: "wachbuch", am: "2026-08-01T08:00:00.000Z", von: "l1", grundlage: "BV" },
      { art: "parameter", modul: "posten", am: "2026-09-01T08:00:00.000Z", von: "l1" }];
    const m = { id: "m1", personen: [], aufbewahrung: { modulprotokollMonate: 1 }, einstellungen: { modulprotokoll: p } };
    const r = AUF.raeumen(m, "2026-11-03");
    expect(r.mandant.einstellungen.modulprotokoll).toEqual(p);
    expect("modulprotokollMonate" in r.mandant.aufbewahrung).toBe(false);   // Übersteuerung entfällt
  });
  it("Planung schreibt die Übersteuerung: gespeichert oder nicht — sie hat keine Wirkung", () => {
    const g = gesamt();
    g.mandanten[0].einstellungen.modulprotokoll = [{ art: "eingeschaltet", modul: "posten", am: "2026-09-01T08:00:00.000Z", von: "l1" }];
    const v = schreibeAls(g, "PL", (m) => { m.aufbewahrung = { ...(m.aufbewahrung || {}), modulprotokollMonate: 1 }; });
    const m = v && !v.verweigert ? v.mandanten[0] : g.mandanten[0];
    expect(BM.modulprotokollMonate(m)).toBe(BM.MODULPROTOKOLL_FRIST.monate);
    expect(AUF.vorschau(m, "2026-11-03").modulprotokoll).toBe(0);
  });
});

/* ======================================================================== */
describe("M2 / A3 — Modul-Personenfelder nur nach geprüfter Regel und Datum, nie pauschal", () => {
  const HEUTE = "2026-11-03";
  const m0 = () => ({ id: "m1", aufbewahrung: {}, personen: [
      { id: "a1", nachname: "A", austritt: "2026-01-31" }, { id: "a2", nachname: "B" }, { id: "a3", nachname: "C", anonym: true }],
    abweichungen: { "a3|2026-10-02": "F" },
    postenPlan: { "a1|2026-10-01": "po1", "a2|2026-10-01": "po1", "a2|2023-09-01": "po1", "a3|2026-10-02": "po1" },
    bereichsPlan: { "a1|2026-10-01": "b1" } });

  it("Sonde: Zuordnungen anonymisierter/fälliger Personen bleiben bis zur Frist — wie die Plandaten derselben Kennung", () => {
    const r = AUF.raeumen(m0(), HEUTE);
    expect(r.mandant.postenPlan["a3|2026-10-02"]).toBe("po1");
    expect(r.mandant.postenPlan["a1|2026-10-01"]).toBe("po1");
    expect(r.mandant.bereichsPlan["a1|2026-10-01"]).toBe("b1");
    expect(r.mandant.abweichungen["a3|2026-10-02"]).toBe("F");
  });
  it("ungeprüfte Aufbewahrungsregel: nichts gelöscht, Vorschau meldet „Prüfung/Freigabe erforderlich\"", () => {
    expect(BM.MODULDATEN_AUFBEWAHRUNG).toMatchObject({ regelId: expect.any(String), quelle: expect.any(String),
      fundstelle: expect.any(String), fassung: expect.any(String), pruefstatus: "vorlaeufig" });
    const v = AUF.vorschau(m0(), HEUTE);
    expect(v.moduldaten).toBe(0);
    expect(v.moduldatenZurueckgehalten).toBe(1);                         // a2|2023-09-01 hinter der Frist, aber Regel ungeprüft
    expect(v.pruefhinweis).toMatch(/Prüfung\/Freigabe erforderlich/);
    expect(AUF.raeumen(m0(), HEUTE).mandant.postenPlan["a2|2023-09-01"]).toBe("po1");
  });
  it("geprüfte Regel: nur nach Datum (mindestens Plandatenfrist), unabhängig von Anonymisierung", () => {
    const regeln = { moduldaten: GEPRUEFT(BM.MODULDATEN_AUFBEWAHRUNG) };
    const r = AUF.raeumen(m0(), HEUTE, { regeln });
    expect(r.mandant.postenPlan).toEqual({ "a1|2026-10-01": "po1", "a2|2026-10-01": "po1", "a3|2026-10-02": "po1" });
    /* Auch eine geprüfte Regel mit kürzerer Frist löscht nie vor der Plandatenfrist. */
    const kurz = AUF.raeumen({ ...m0(), postenPlan: { "a2|2025-06-01": "po1" } }, HEUTE, { regeln: { moduldaten: { ...regeln.moduldaten, monate: 1 } } });
    expect(kurz.mandant.postenPlan).toEqual({ "a2|2025-06-01": "po1" });
  });
  it("eine abgelaufene oder zurückgezogene Regel löscht nicht", () => {
    for (const regel of [{ ...GEPRUEFT(BM.MODULDATEN_AUFBEWAHRUNG), gueltigBis: "2026-06-30" },
      { ...GEPRUEFT(BM.MODULDATEN_AUFBEWAHRUNG), pruefstatus: "zurueckgezogen" },
      { ...GEPRUEFT(BM.MODULDATEN_AUFBEWAHRUNG), pruefstatus: "verified-xyz" }]) {
      expect(AUF.raeumen(m0(), HEUTE, { regeln: { moduldaten: regel } }).mandant.postenPlan["a2|2023-09-01"], JSON.stringify(regel.pruefstatus)).toBe("po1");
    }
  });
});

/* ======================================================================== */
describe("M3 / A4 — Wiederherstellen bringt Gelöschtes nicht zurück und umgeht Nur-Lesen nicht", () => {
  const HEUTE = new Date("2026-11-03T10:00:00Z");
  const zurueck = (heute, sicherung) => betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT, { marke: "x", heute: HEUTE, datenschutz: "aus" });

  it("Sonde: Art.-17-Löschung, danach Wiederherstellen aus der älteren Sicherung — der Eintrag bleibt gelöscht", () => {
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    expect(v.verweigert).toBeFalsy();
    const w = zurueck(v, vorher);
    expect(w.verweigert).toBeFalsy();
    expect(w.bestand.mandanten[0].postenPlan).toEqual({ "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" });
  });
  it("Löschvermerk übersteht Wiedereinschalten: auch für ein aktives Modul kommt der gelöschte Eintrag nicht zurück", () => {
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = LOESCH; });
    const vm = v.mandanten[0];
    const vermerke = vm.einstellungen.moduldatenLoeschvermerke;
    expect(Array.isArray(vermerke) && vermerke.length).toBe(1);
    expect(JSON.stringify(vermerke)).not.toMatch(/a1\|/);              // keine Klartext-Kennung
    /* Modul gilt wieder als nicht nur-lesbar (Schalter entfernt) — der Vermerk wirkt trotzdem. */
    const heute = kopie(v); delete heute.mandanten[0].einstellungen.branchenmodule;
    expect(zurueck(heute, vorher).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
  });
  it("Berichtigung (Art. 16) wird durch Wiederherstellen nicht zurückgedreht", () => {
    const vorher = gesamt();
    const v = schreibeAls(vorher, "LT", (m) => { m.postenPlan["a1|2026-11-03"] = "po2";
      m.moduldatenAusnahme = { modul: "posten", art: "berichtigung", grund: "art16", eintraege: { postenPlan: ["a1|2026-11-03"] } }; });
    expect(v.verweigert).toBeFalsy();
    const heute = kopie(v); delete heute.mandanten[0].einstellungen.branchenmodule;
    expect(zurueck(heute, vorher).bestand.mandanten[0].postenPlan["a1|2026-11-03"]).toBe("po2");
  });
  it("Daten eines heute nur lesbaren Moduls kommen aus dem jetzigen Stand (kein Umweg am Nur-Lesen vorbei)", () => {
    const heute = gesamt();
    const sicherung = gesamt(); sicherung.mandanten[0].postenPlan = { "x9|2026-11-01": "po2" }; sicherung.mandanten[0].objekte = [];
    const m = zurueck(heute, sicherung).bestand.mandanten[0];
    expect(m.postenPlan).toEqual(PLAN);
    expect(m.objekte).toEqual(OBJ);
  });
  it("Vermerke kommen nicht vom Client und gehen über Migration und Betreiber-Neuanlage nicht verloren bzw. werden nicht eingeschleust", async () => {
    const g = gesamt({});
    const lt = schreibeAls(g, "LT", (m) => { m.einstellungen.moduldatenLoeschvermerke = [{ h: "f".repeat(32) }]; });
    expect(lt.mandanten[0].einstellungen.moduldatenLoeschvermerke).toBeUndefined();
    expect(BM.moduleinstellungenVerwerfen({ id: "n", einstellungen: { moduldatenLoeschvermerke: [{ h: "x" }] } }).einstellungen).toEqual({});
    const { migriere } = await import("../src/migration.js");
    const alt = { version: 7, mandanten: [{ id: "m1", einstellungen: { moduldatenLoeschvermerke: [{ h: "abc" }] }, postenPlan: { "a|2026-01-01": "p" } }] };
    const r = migriere(alt);
    expect(r.ok).toBe(true);
    expect(r.bestand.mandanten[0].einstellungen.moduldatenLoeschvermerke).toEqual([{ h: "abc" }]);
  });
});

/* ======================================================================== */
describe("M4 / A5 — Grund des Ausnahmewegs als Kategorie, nie beim Betriebsrat", () => {
  it("Sonde: Freitext-Grund („Antrag Frau X\") wird abgewiesen; Kategorie + Aktenzeichen gehen", () => {
    const frei = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, grund: "Antrag Frau X" }; });
    expect(frei.verweigert).toMatch(/Ausnahmeweg/);
    const ok = schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, aktenzeichen: "DS-2026-014" }; });
    expect(ok.verweigert).toBeFalsy();
    expect(ok.mandanten[0].einstellungen.modulprotokoll[0]).toMatchObject({ grund: "art17", aktenzeichen: "DS-2026-014" });
  });
  it("Aktenzeichen: nur Buchstaben, Ziffern, Bindestrich, mit Ziffer, höchstens 20 Zeichen; Grund passt zur Art", () => {
    for (const az of ["Mueller", "Frau X 1", "Müller-1", "x".repeat(21) + "1", "<b>1</b>", 12])
      expect(schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, aktenzeichen: az }; }).verweigert, String(az)).toBeTruthy();
    expect(schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, grund: "art16" }; }).verweigert).toBeTruthy();
    expect(schreibeAls(gesamt(), "LT", (m) => { delete m.postenPlan["a1|2026-11-02"]; m.moduldatenAusnahme = { ...LOESCH, grund: "art18" }; }).verweigert).toBeFalsy();
    expect(MS.AUSNAHME_GRUENDE).toEqual(expect.objectContaining({ art16: expect.any(String), art17: expect.any(String), art18: expect.any(String) }));
  });
  it("Betriebsrat (Positivkatalog) und Auskunft: weder Grund noch Aktenzeichen — auch kein Freitext aus Altständen", () => {
    const e = { modulprotokoll: [
      { art: "moduldaten-loeschung", modul: "posten", feld: "postenPlan", anzahl: 1, grund: "Antrag Frau X", am: EIN, von: "l1" },
      { art: "moduldaten-loeschung", modul: "posten", feld: "postenPlan", anzahl: 1, grund: "art17", aktenzeichen: "DS-1", am: EIN, von: "l1" },
      { art: "eingeschaltet", modul: "wachbuch", am: EIN, von: "l1", grundlage: "BV vom 01.10.2026", fremd: "x" }] };
    const br = BM.moduleinstellungenSicht(e, "betriebsrat").modulprotokoll;
    expect(JSON.stringify(br)).not.toMatch(/Frau X|art17|DS-1|fremd/);
    expect(br[2]).toMatchObject({ art: "eingeschaltet", modul: "wachbuch", grundlage: "BV vom 01.10.2026" });
    expect(br[0]).toMatchObject({ art: "moduldaten-loeschung", feld: "postenPlan", anzahl: 1 });
    const g = gesamt(); g.mandanten[0].einstellungen.modulprotokoll = e.modulprotokoll;
    const ausBR = bestandFuerRolle(g, SITZUNGEN.BR).mandanten[0].einstellungen.modulprotokoll;
    expect(JSON.stringify(ausBR)).not.toMatch(/Frau X|DS-1/);
    const a = auskunftBauen(g.mandanten[0], g.mandanten[0].personen[0], { raum: "r", erstellt: "2026-11-03T10:00:00Z", umfang: "selbst" });
    expect(JSON.stringify(a)).not.toMatch(/Frau X|DS-1/);
  });
});

/* ======================================================================== */
describe("N1 / A2 — Auditnachweise: zustandsbegründende Einträge bleiben, Kürzen wird protokolliert", () => {
  const proto = () => [
    { art: "eingeschaltet", modul: "wachbuch", am: "2024-01-10T08:00:00.000Z", von: "l1", grundlage: "BV 2023" },
    { art: "parameter", modul: "wachbuch", am: "2024-02-10T08:00:00.000Z", von: "l1" },
    { art: "parameter", modul: "wachbuch", am: "2024-03-10T08:00:00.000Z", von: "l1" },
    { art: "regelwert", regelId: "POSTEN-QUAL-01", am: "2024-01-11T08:00:00.000Z", von: "l1", stufe: "hinweis", pruefstatus: "vorlaeufig" },
    { art: "moduldaten-loeschung", modul: "posten", feld: "postenPlan", anzahl: 1, grund: "art17", am: "2024-01-12T08:00:00.000Z", von: "l1" }];
  const regel = GEPRUEFT(BM.MODULPROTOKOLL_FRIST);

  it("Sonde: Löschlauf mit (geprüfter) Frist nach 24 Monaten — Einschalt-/Bestätigungseintrag und letzte Regel bleiben", () => {
    const m = { id: "m1", personen: [], einstellungen: { modulprotokoll: proto() } };
    const r = AUF.raeumen(m, "2026-11-03", { regeln: { modulprotokoll: regel } });
    const rest = r.mandant.einstellungen.modulprotokoll;
    expect(rest).toContainEqual(proto()[0]);                            // eingeschaltet + Mitbestimmung bestätigt
    expect(rest).toContainEqual(proto()[2]);                            // letzter Parameterstand
    expect(rest).toContainEqual(proto()[3]);                            // letzter Regelwert
    expect(rest).not.toContainEqual(proto()[1]);                        // überholt
    expect(rest).not.toContainEqual(proto()[4]);                        // kein Zustand
    expect(r.bericht.modulprotokoll).toBe(2);
  });
  it("ungeprüfte Frist (Vorgabe): nichts aus dem Protokoll gelöscht, Vorschau meldet es", () => {
    expect(BM.MODULPROTOKOLL_FRIST.pruefstatus).toBe("vorlaeufig");
    const m = { id: "m1", personen: [], einstellungen: { modulprotokoll: proto() } };
    expect(AUF.raeumen(m, "2026-11-03").mandant.einstellungen.modulprotokoll).toEqual(proto());
    const v = AUF.vorschau(m, "2026-11-03");
    expect(v.modulprotokoll).toBe(0);
    expect(v.modulprotokollZurueckgehalten).toBe(2);
  });
  it("Leitung schickt ein leeres Protokoll: der Server behält es (gewöhnliche Einstellungen löschen keinen Nachweis)", () => {
    const g = gesamt(); g.mandanten[0].einstellungen.modulprotokoll = proto();
    const v = schreibeAls(g, "LT", (m) => { m.einstellungen.modulprotokoll = []; m.name = "x"; });
    expect(v.mandanten[0].einstellungen.modulprotokoll).toEqual(proto());
  });
  it("Kürzen an der Grenze: Protokollzeile im Betriebsprotokoll", () => {
    const alt = { id: "m1", pakete: ["sicherheit"], einstellungen: { branchenmodule: { testmodul: { ...AUS } },
      modulprotokoll: Array.from({ length: BM.MODULPROTOKOLL_GRENZE }, (_, i) => ({ art: "parameter", modul: "testmodul", am: "2020-01-01T00:00:00.000Z", von: "l1", n: i })) } };
    const neu = { ...kopie(alt), einstellungen: { ...kopie(alt.einstellungen), branchenmodule: { testmodul: { an: true } } } };
    const r = BM.branchenmoduleZusammen(alt, neu, SITZ, true, LISTE, { protokollRegel: regel });
    expect(r.grund).toBeUndefined();
    const z = BM.modulProtokollZeilen({ mandanten: [alt] }, { mandanten: [r.mandant] });
    expect(z).toContain("Branchenmodul testmodul eingeschaltet");
    expect(z.some((x) => /Modulprotokoll: \d+ Einträge? nach Ablauf der Aufbewahrungsfrist entfernt/.test(x))).toBe(true);
  });
});

/* ======================================================================== */
describe("N2 — Altstand { an: true } ohne eingeschaltetAm wird nach dem Ausschalten nur lesbar (fail-closed)", () => {
  it("Sonde: Ausschalten übernimmt eingeschaltetAm aus geaendertAm; danach Nur-Lesen", () => {
    const alt = { id: "m1", pakete: ["sicherheit"], einstellungen: { branchenmodule: { testmodul: { an: true, geaendertAm: EIN, geaendertVon: "l1" } } } };
    const neu = { ...kopie(alt), einstellungen: { branchenmodule: { testmodul: { an: false } } } };
    const r = BM.branchenmoduleZusammen(alt, neu, SITZ, true, LISTE);
    expect(r.mandant.einstellungen.branchenmodule.testmodul.eingeschaltetAm).toBe(EIN);
    expect(BM.modulNurLesen(r.mandant, "testmodul", LISTE)).toBe(true);
  });
  it("beim Lesen: { an: true } ohne eingeschaltetAm, Paket abbestellt → nur lesbar", () => {
    const m = { id: "m1", pakete: [], einstellungen: { branchenmodule: { testmodul: { an: true, geaendertAm: EIN } } } };
    expect(BM.modulNurLesen(m, "testmodul", LISTE)).toBe(true);
    /* { an: false } ohne eingeschaltetAm bleibt G10-frei. */
    expect(BM.modulNurLesen({ ...m, einstellungen: { branchenmodule: { testmodul: { an: false, geaendertAm: EIN } } } }, "testmodul", LISTE)).toBe(false);
  });
});

/* ======================================================================== */
describe("N3 — unveränderte gespeicherte Regelwerte und Schalter sperren nicht", () => {
  it("Sonde: gespeicherter Regelwert, den Katalog/Vokabular nicht mehr kennt — Leitung speichert anderes", () => {
    const g = gesamt();
    g.mandanten[0].einstellungen.regelwerte = {
      "ALT-REGEL-01": { pruefstatus: "vorlaeufig", stufe: "hinweis", geaendertAm: EIN, geaendertVon: "l1" },
      "POSTEN-QUAL-01": { pruefstatus: "verified", stufe: "achtung", quelle: "Q", fundstelle: "F", version: "1", gueltigAb: "2026-01-01",
        geprueftAm: EIN, geprueftVon: "l1", geaendertAm: EIN, geaendertVon: "l1" } };
    const v = schreibeAls(g, "LT", (m) => { m.name = "Neu"; });
    expect(v.verweigert).toBeFalsy();
    expect(v.mandanten[0].einstellungen.regelwerte).toEqual(g.mandanten[0].einstellungen.regelwerte);
    /* Ein geänderter Wert wird geprüft. */
    const w = schreibeAls(g, "LT", (m) => { m.einstellungen.regelwerte["ALT-REGEL-01"] = { pruefstatus: "vorlaeufig", stufe: "hinweis", wert: 3 }; });
    expect(w.verweigert).toMatch(/unbekannt/);
  });
  it("gespeicherter Schalter mit inzwischen unbekanntem Parameter: unverändert zurückgeschickt sperrt nicht", () => {
    const alt = { id: "m1", pakete: ["sicherheit"], einstellungen: { branchenmodule: { testmodul: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1", parameter: { weg: 1 } } } } };
    expect(BM.branchenmoduleZusammen(alt, kopie(alt), SITZ, true, LISTE).grund).toBeUndefined();
  });
});

/* ======================================================================== */
describe("N4 — Ausnahmeweg: Listenfelder nur mit Objekten und eindeutiger id", () => {
  const alt = (liste) => ({ id: "m", pakete: ["sicherheit"], einstellungen: { branchenmodule: { testmodul: { ...AUS } } }, testListe: liste });
  const aus = { modul: "testmodul", art: "loeschung", grund: "art17", eintraege: { testListe: ["k1"] } };
  it("Sonde: Einträge ohne id, Nicht-Objekte, doppelte id — abgewiesen", () => {
    for (const vorher of [[{ id: "k1" }, { x: 1 }], [{ id: "k1" }, "text"], [{ id: "k1" }, { id: "k2" }, { id: "k2" }], [{ id: "k1" }, { id: "" }]]) {
      const nachher = vorher.filter((x) => !(x && x.id === "k1"));
      const r = MS.moduldatenZusammen(alt(vorher), { ...alt(nachher) }, LISTE, { darfOrgEdit: true, sitzung: SITZ, ausnahme: aus });
      expect(r.grund, JSON.stringify(vorher)).toMatch(/eindeutige/);
    }
  });
  it("wohlgeformt: geht", () => {
    const r = MS.moduldatenZusammen(alt([{ id: "k1" }, { id: "k2" }]), alt([{ id: "k2" }]), LISTE, { darfOrgEdit: true, sitzung: SITZ, ausnahme: aus });
    expect(r.grund).toBeUndefined();
  });
});

/* ======================================================================== */
describe("UI — Statusvertrag verlangt die Oberfläche des Ausnahmewegs", () => {
  it("Modul mit Datenfeldern verlässt „geplant\" nur mit ausnahmeUi und vorhandener Kernoberfläche", () => {
    expect(BM.pruefeModulStatus([TM])).toEqual([]);
    expect(BM.pruefeModulStatus([{ ...TM, ausnahmeUi: false }]).join("\n")).toMatch(/Oberfläche des Ausnahmewegs/);
    expect(BM.pruefeModulStatus([TM], { ausnahmeOberflaeche: false }).join("\n")).toMatch(/Oberfläche des Ausnahmewegs/);
    expect(BM.pruefeModulStatus([{ ...TM, datenfelder: [], personenfelder: [], sachfelder: [], ausnahmeUi: false }])).toEqual([]);
  });
  it("die Kernoberfläche ist da: kern.jsx exportiert die Karte und baut die Angabe", async () => {
    expect(BM.AUSNAHMEWEG_OBERFLAECHE).toBe(true);
    const K = await import("../src/module/kern.jsx");
    expect(typeof K.AusnahmewegKarte).toBe("function");
    expect(typeof K.ausnahmeAngabe).toBe("function");
  });
  it("Serverrendering: Karte nur für die Leitung (org.edit), Kategorie statt Freitext, Hinweis „keine Namen\", Bestätigungsschritt", async () => {
    const { createElement: h } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const K = await import("../src/module/kern.jsx");
    const m = gesamt().mandanten[0];
    const mod = BM.modulVon("posten");
    const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const roh = renderToStaticMarkup(h(K.AusnahmewegKarte, { m, mod, onAusfuehren: () => {} }));
    expect(roh).toMatch(/Datenschutz-Ausnahmeweg/);
    expect(roh).toMatch(/<select/);
    expect(roh).not.toMatch(/<textarea/);                                // kein Freitext-Grund
    expect(text(h(K.AusnahmewegKarte, { m, mod, onAusfuehren: () => {} }))).toMatch(/keine Namen/);
    expect(roh).toMatch(/Löschung \(Art\. 17 DSGVO\)/);
    expect(roh).toMatch(/Werk/);                                         // Datensatz Objekt
    expect(roh).toMatch(/V Na1, 02.11.2026: po1/);                       // Datensatz Person|Tag
    const best = text(h(K.AusnahmewegKarte, { m, mod, onAusfuehren: () => {},
      anfang: { ...leeresFormularTest(), auswahl: { postenPlan: { "a1|2026-11-02": true } }, schritt: "bestaetigen" } }));
    expect(best).toMatch(/Endgültig löschen: 1 Datensatz/);
    expect(best).toMatch(/Löschen bestätigen/);
    /* In der Betriebsverwaltung: Leitung ja, Planung nein. */
    const sitz = { mandant: m };
    const akt = { setzeEinstellung: () => {}, moduldatenAusnahme: () => {} };
    expect(text(h(K.BranchenModule, { sitz, akt, darf: (r) => r === "org.edit" || r === "export.data" }))).toMatch(/Datenschutz-Ausnahmeweg/);
    expect(text(h(K.BranchenModule, { sitz, akt, darf: (r) => r === "export.data" }))).not.toMatch(/Datenschutz-Ausnahmeweg/);
    /* Ohne einmaligen Schreibweg (akt.moduldatenAusnahme) keine Karte. */
    expect(text(h(K.BranchenModule, { sitz, akt: { setzeEinstellung: () => {} }, darf: () => true }))).not.toMatch(/Datenschutz-Ausnahmeweg/);
    /* 360 px: keine festen Breiten in Kern und Hilfen. */
    for (const d of ["src/module/kern.jsx", "src/module/ausnahmeweg.js"]) expect(lies(d), d).not.toMatch(/width:\s*["']?\d{3,}px|minWidth:\s*\d{3,}/);
  });
  it("Bedienablauf: Formular → Angabe → Änderung → einmal mitgeschickt → Server nimmt an → nächstes Speichern ohne Angabe", async () => {
    const W = await import("../src/module/ausnahmeweg.js");
    const g = gesamt();
    const sicht = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
    const mod = BM.modulVon("posten");
    expect(W.ausnahmeAngabe(sicht.mandanten[0], mod, W.leeresFormular()).fehler).toMatch(/auswählen/);
    expect(W.ausnahmeAngabe(sicht.mandanten[0], mod, { ...W.leeresFormular(), aktenzeichen: "Frau X", auswahl: { postenPlan: { "a1|2026-11-02": true } } }).fehler).toMatch(/Aktenzeichen/);
    const a = W.ausnahmeAngabe(sicht.mandanten[0], mod, { ...W.leeresFormular(), aktenzeichen: "DS-2026-3", auswahl: { postenPlan: { "a1|2026-11-02": true } } });
    expect(a.ausnahme).toEqual({ modul: "posten", art: "loeschung", grund: "art17", aktenzeichen: "DS-2026-3", eintraege: { postenPlan: ["a1|2026-11-02"] } });
    const einmalig = { mandantId: "m1", angabe: a.ausnahme, erkennt: a.erkennt };
    /* Stand ohne die Änderung: die Angabe geht noch nicht mit. */
    expect(W.mitEinmaligerAngabe(sicht, einmalig).verbraucht).toBe(false);
    sicht.mandanten[0] = a.aendern(sicht.mandanten[0]);
    const mit = W.mitEinmaligerAngabe(sicht, einmalig);
    expect(mit.verbraucht).toBe(true);
    const v = zusammenfuehren(g, mit.bestand, SITZUNGEN.LT);
    expect(v.verweigert).toBeFalsy();
    expect(v.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
    const weiter = kopie(bestandFuerRolle(v, SITZUNGEN.LT)); weiter.mandanten[0].name = "Weiter";
    expect(zusammenfuehren(v, weiter, SITZUNGEN.LT).verweigert).toBeFalsy();
    /* speicher.js hängt die Angabe über dieselbe Hilfe an; verbraucht ist sie erst nach der Antwort
       des Servers (dritter Review F2 — Verhalten geprüft in modul-kern-nachtrag3, „F2"). */
    const sp = lies("src/speicher.js");
    expect(sp).toMatch(/mitEinmaligerAngabe\(/);
    expect(sp).not.toMatch(/if \(mit\.verbraucht\) einmalig = null/);
    expect(sp).toMatch(/auftrag\.ausnahme/);
    expect(appQuelle()).toMatch(/moduldatenAusnahme: \(angabe, aendern, erkennt\) => \{[^\n]*SP\.ausnahmeMitschicken/);
  });
});
const leeresFormularTest = () => ({ art: "loeschung", grund: "art17", aktenzeichen: "", auswahl: {}, neu: {} });

/* ======================================================================== */
describe("RS — einheitliches Regelstatus-Schema (regelstatus.mjs)", () => {
  it("vier kanonische Werte; Abbildung je Herkunft", () => {
    expect(RS.REGELSTATUS).toEqual(["geprueft", "vorlaeufig", "abgelaufen", "zurueckgezogen"]);
    const voll = { quelle: "Q", fundstelle: "F", fassung: "1", gueltigAb: "2026-01-01", geprueftAm: "2026-02-01" };
    const fall = (herkunft, s) => RS.kanonischerStatus({ ...voll, pruefstatus: s }, { herkunft, heute: "2026-11-03" });
    expect(fall("wp19-0", "provisional")).toBe("vorlaeufig");
    expect(fall("wp19-0", "verified")).toBe("geprueft");
    expect(fall("industrie", "provisional")).toBe("vorlaeufig");
    expect(fall("industrie", "geprueft")).toBe("geprueft");
    for (const [s, k] of [["provisional", "vorlaeufig"], ["verified", "geprueft"], ["watchlist", "zurueckgezogen"], ["deprecated", "zurueckgezogen"]])
      expect(fall("branchenkatalog", s), s).toBe(k);
    for (const [s, k] of [["verified", "geprueft"], ["legacy_verified", "geprueft"], ["provisional", "vorlaeufig"], ["watchlist", "zurueckgezogen"], ["deprecated", "zurueckgezogen"]])
      expect(fall("regelregister", s), s).toBe(k);
    for (const s of RS.REGELSTATUS.filter((x) => x !== "abgelaufen")) expect(fall("kanonisch", s), s).toBe(s);
  });
  it("Mutant-Sonde: unbekannter oder fehlerhafter Status gilt nie als geprüft (fail-closed)", () => {
    for (const s of ["verifiziert", "VERIFIED", "", null, undefined, 1, "abgelaufen"])
      expect(RS.kanonischerStatus({ pruefstatus: s, quelle: "Q", fundstelle: "F", fassung: "1", gueltigAb: "2026-01-01", geprueftAm: "2026-02-01" },
        { herkunft: "wp19-0", heute: "2026-11-03" }), String(s)).toBe("vorlaeufig");
    expect(RS.kanonischerStatus({ pruefstatus: "geprueft" }, { herkunft: "unbekannt", heute: "2026-11-03" })).toBe("vorlaeufig");
    /* geprüft ohne Metadaten → vorläufig */
    expect(RS.kanonischerStatus({ pruefstatus: "geprueft", quelle: "Q" }, { heute: "2026-11-03" })).toBe("vorlaeufig");
  });
  it("Ablauf: gueltigBis überschritten → abgelaufen, wirkt höchstens als Hinweis; zurückgezogen wirkt nie", () => {
    const r = { pruefstatus: "geprueft", quelle: "Q", fundstelle: "F", fassung: "1", gueltigAb: "2026-01-01", gueltigBis: "2026-06-30", geprueftAm: "2026-02-01" };
    expect(RS.kanonischerStatus(r, { heute: "2026-11-03" })).toBe("abgelaufen");
    expect(RS.kanonischerStatus(r, { heute: "2026-05-01" })).toBe("geprueft");
    expect(RS.regelWirkung("geprueft")).toBe("voll");
    expect(RS.regelWirkung("abgelaufen")).toBe("hinweis");
    expect(RS.regelWirkung("vorlaeufig")).toBe("hinweis");
    expect(RS.regelWirkung("zurueckgezogen")).toBe("keine");
    expect(RS.regelWirkung("unbekannt")).toBe("keine");
  });
  it("Zeitstempel: Tag und ISO vereinheitlicht; regelKanonisch liefert die Metadaten", () => {
    expect(RS.zeitpunktIso("2026-02-01")).toBe("2026-02-01T00:00:00.000Z");
    expect(RS.zeitpunktIso("2026-02-01T10:00:00Z")).toBe("2026-02-01T10:00:00.000Z");
    expect(RS.zeitpunktIso("gestern")).toBeNull();
    const k = RS.regelKanonisch({ pruefstatus: "geprueft", quelle: "Q", fundstelle: "F", version: "3", gueltigAb: "2026-01-01", geprueftAm: "2026-02-01", geprueftVon: "x" },
      { regelId: "R-1", herkunft: "industrie", heute: "2026-11-03" });
    expect(k).toMatchObject({ regelId: "R-1", status: "geprueft", quelle: "Q", fundstelle: "F", fassung: "3", geprueftAm: "2026-02-01T00:00:00.000Z", herkunftStatus: "geprueft" });
  });
  it("WP-19.0 nutzt nur das kanonische Schema: Regelwerte mit vorlaeufig/geprueft; Altwerte nur über den Adapter", () => {
    expect(BM.REGELWERT_PRUEFSTATUS).toEqual(["vorlaeufig", "geprueft", "zurueckgezogen"]);
    const ok = { pruefstatus: "geprueft", stufe: "achtung", quelle: "Q", fundstelle: "F", version: "1", gueltigAb: "2026-01-01" };
    expect(BM.pruefeRegelwert("POSTEN-QUAL-01", ok)).toBeNull();
    expect(BM.pruefeRegelwert("POSTEN-QUAL-01", { ...ok, pruefstatus: "verified" })).toMatch(/Prüfstatus/);
    expect(BM.pruefeRegelwert("POSTEN-QUAL-01", { ...ok, pruefstatus: "abgelaufen" })).toMatch(/Prüfstatus/);
    /* gespeicherter Altwert „verified" mit vollständigen Angaben wirkt über den Adapter weiter */
    const m = { einstellungen: { regelwerte: { "POSTEN-QUAL-01": { ...ok, pruefstatus: "verified", geprueftAm: EIN } } } };
    expect(BM.regelwertFuer(m, "POSTEN-QUAL-01", "2026-11-03")).toMatchObject({ pruefstatus: "geprueft" });
    /* zurückgezogen wirkt nie */
    const zm = { einstellungen: { regelwerte: { "POSTEN-QUAL-01": { ...ok, stufe: "hinweis", pruefstatus: "zurueckgezogen", geprueftAm: EIN } } } };
    const b = { art: "branche", regelId: "POSTEN-QUAL-01", stufe: "hinweis" };
    expect(BM.regelwertAnwenden(zm, b, "2026-11-03")).toBe(b);
    /* geprüft und „achtung", aber ohne Prüfzeitpunkt (nicht vom Server): wirkt nicht */
    const ohneAm = { einstellungen: { regelwerte: { "POSTEN-QUAL-01": { ...ok } } } };
    expect(BM.regelwertAnwenden(ohneAm, b, "2026-11-03")).toBe(b);
    const mitAm = { einstellungen: { regelwerte: { "POSTEN-QUAL-01": { ...ok, geprueftAm: EIN } } } };
    expect(BM.regelwertAnwenden(mitAm, b, "2026-11-03")).toMatchObject({ stufe: "achtung" });
  });
});
