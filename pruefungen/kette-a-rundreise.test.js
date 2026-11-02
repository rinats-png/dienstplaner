/* ==========================================================================
   KETTE A AUF DEN POSITIVKATALOGEN (WP-10) — Rundreisen je Feld und Rolle

   Kette B liefert und nimmt nur, was die Kataloge (server/lib/sicht.mjs)
   und die Schreibzusammenführung (server/lib/rechte.mjs) kennen. Was Kette A
   neu speichert, ging dort bis WP-10 still verloren — auch für Planung und
   Leitung (vollRueckfuellen/VOLL_BETRIEB), für die Schichtverantwortung
   scheiterte die ganze Speicherung.

   Je neues Feld und jede Rolle: PUT → GET liefert es (oder gefiltert, wie
   RECHTEMATRIX.md sagt), ein unverändertes Zurückspeichern verliert nichts,
   Verborgenes lässt sich nicht überschreiben.

   Rot auf dem Stand vor der Katalogergänzung (Merge b14929e/b846509): Das
   Bestätigungsprotokoll fehlte nach dem Speichern durch Planung und Leitung
   (verworfen), die Schichtverantwortung bekam eine Absage, der Betriebsrat
   sah nichts, Selbstplanungs-Hinweise fielen weg.

   Aufruf: npx vitest run pruefungen/kette-a-rundreise.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { ABWEICHUNG_GRUENDE as GRUENDE_SERVER } from "../server/lib/bestaetigungen.mjs";
import { ABWEICHUNG_GRUENDE as GRUENDE_OBERFLAECHE } from "../src/warnstufen.js";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const kopie = (x) => JSON.parse(JSON.stringify(x));

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/* m0 und a1 im Bereich e1 der Schichtverantwortung s1, b1 in e2. */
const eintrag = (id, personId, extra = {}) => ({ id, personId, datum: tag(3), dienstId: "F", aktion: "einsprung",
  stufe: "recht", gelesen: true, befunde: [{ stufe: "recht", text: `Ruhezeit 8 h (${id})`, quelle: "§ 5 ArbZG" }],
  grundArt: null, grund: "", ohneGrund: true, durch: "Client", durchId: "x", rolle: "x", zeit: "2000-01-01", regelstand: "2026.10",
  behoben: null, ...extra });

const bestand = () => ({
  version: 9, stand: 1,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"),
      person("l1", "leitung", "ALLE"), person("l2", "leitung", "ALLE"), person("ku1", "kunde", "ALLE")],
    abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [
      { id: "abw-a1", personId: "a1", art: "urlaub", von: tag(2), bis: tag(6), notiz: "" }],
    bestaetigungen: [eintrag("alt-a1", "a1", { durch: "Planung P", durchId: "p1", rolle: "planer" }),
      eintrag("alt-b1", "b1", { durch: "Planung P", durchId: "p1", rolle: "planer", grundArt: "sonstiges", grund: "Frau N b1 fiel aus", ohneGrund: false })],
    selbstplanung: [{ id: "sp1", monat: tag(3).slice(0, 7), status: "offen", eintraege: [] }],
  }],
});

const SITZ = {
  MA: { rolle: "mitarbeiter", person: "m0", betrieb: 0 },
  BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 },
  PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 },
  KU: { rolle: "kunde", person: "ku1", betrieb: 0 },
};
const SCHREIBEND_VOLL = ["PL", "LT", "KU"];

/** GET, verändern, PUT, gespeichert. */
function rundreise(g, rolle, aendern = () => {}) {
  const sicht = kopie(bestandFuerRolle(g, SITZ[rolle]));
  aendern(sicht.mandanten[0]);
  return zusammenfuehren(g, sicht, SITZ[rolle]);
}
const betrieb = (b) => b.mandanten[0];
const ids = (l) => (l || []).map((x) => x.id);

/* ------------------------------------------------------------------------
   d.1 Bestätigungsprotokoll
   ------------------------------------------------------------------------ */
describe("d.1 Bestätigungsprotokoll: Lesen je Rolle", () => {
  it("Planung, Leitung und Kundenrolle sehen alle Einträge vollständig", () => {
    for (const r of SCHREIBEND_VOLL) {
      const b = betrieb(bestandFuerRolle(bestand(), SITZ[r])).bestaetigungen;
      expect(ids(b), r).toEqual(["alt-a1", "alt-b1"]);
      expect(b[1].grund, r).toBe("Frau N b1 fiel aus");
      expect(b[1].personId, r).toBe("b1");
    }
  });
  it("Beschäftigte sehen keinen Eintrag", () => {
    expect(betrieb(bestandFuerRolle(bestand(), SITZ.MA)).bestaetigungen || []).toEqual([]);
  });
  it("die Schichtverantwortung sieht nur den eigenen Bereich am Tag", () => {
    expect(ids(betrieb(bestandFuerRolle(bestand(), SITZ.SV)).bestaetigungen)).toEqual(["alt-a1"]);
  });
  it("… und nach einer Versetzung vor dem Tag des Eintrags nicht mehr", () => {
    const g = bestand();
    betrieb(g).personen.find((p) => p.id === "a1").zugehoerigkeit.push({ ab: tag(1), einheitId: "e2" });
    expect(ids(betrieb(bestandFuerRolle(g, SITZ.SV)).bestaetigungen)).toEqual([]);
  });
  it("der Betriebsrat sieht Einträge ohne Person, ohne Namen, ohne Freitext", () => {
    const b = betrieb(bestandFuerRolle(bestand(), SITZ.BR)).bestaetigungen;
    expect(ids(b)).toEqual(["alt-a1", "alt-b1"]);
    for (const x of b) { expect(x.personId).toBe(null); expect(x.durchId).toBe(null); expect(x.durch).toBe("planer"); }
    expect(b[1].grund).toBeUndefined();
    expect(b[1].grundArt).toBe("sonstiges");
    expect(JSON.stringify(b)).not.toContain("Planung P");
    expect(JSON.stringify(b)).not.toContain("Frau N b1");
  });
});

describe("d.1 Bestätigungsprotokoll: Rundreise je Rolle", () => {
  it("unverändert zurückgespeichert geht nichts verloren — jede schreibende Rolle", () => {
    for (const r of [...SCHREIBEND_VOLL, "SV", "MA"]) {
      const g = bestand();
      const e = rundreise(g, r);
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      expect(betrieb(e).bestaetigungen, r).toEqual(betrieb(g).bestaetigungen);
    }
  });
  it("der Betriebsrat schreibt nicht", () => {
    expect(rundreise(bestand(), "BR")).toBe(null);
  });
  it("Planung, Leitung, Kundenrolle: ein neuer Eintrag kommt an, Wer und Zeit vom Server", () => {
    for (const r of SCHREIBEND_VOLL) {
      const g = bestand();
      const e = rundreise(g, r, (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1")); });
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      const b = betrieb(e).bestaetigungen;
      expect(ids(b), r).toEqual(["neu", "alt-a1", "alt-b1"]);
      expect(b[0].durchId, r).toBe(SITZ[r].person);
      expect(b[0].durch, r).toBe(`V N${SITZ[r].person}`);
      expect(b[0].rolle, r).toBe(SITZ[r].rolle);
      expect(b[0].zeit, r).not.toBe("2000-01-01");
      /* … und kommt beim nächsten Lesen wieder. */
      expect(ids(betrieb(bestandFuerRolle(e, SITZ[r])).bestaetigungen), r).toEqual(["neu", "alt-a1", "alt-b1"]);
    }
  });
  it("Schichtverantwortung: neuer Eintrag im eigenen Bereich ja, verborgene bleiben", () => {
    const g = bestand();
    const e = rundreise(g, "SV", (m) => { m.bestaetigungen.unshift(eintrag("neu", "a1")); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(ids(betrieb(e).bestaetigungen)).toEqual(["neu", "alt-a1", "alt-b1"]);
    expect(betrieb(e).bestaetigungen[0]).toMatchObject({ durchId: "s1", rolle: "subplaner" });
    expect(betrieb(e).bestaetigungen[2]).toEqual(betrieb(g).bestaetigungen[1]);
  });
  it("Schichtverantwortung: nicht für eine fremde Person", () => {
    expect(rundreise(bestand(), "SV", (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1")); }).verweigert).toBeTruthy();
  });
  it("Beschäftigte: ein mitgeschickter Eintrag bleibt wirkungslos", () => {
    const g = bestand();
    const e = rundreise(g, "MA", (m) => { m.bestaetigungen = [eintrag("neu", "m0")]; });
    expect(betrieb(e).bestaetigungen).toEqual(betrieb(g).bestaetigungen);
  });
  it("Bestehendes ist nicht überschreibbar und nicht löschbar — jede schreibende Rolle", () => {
    for (const r of [...SCHREIBEND_VOLL, "SV"]) {
      const g = bestand();
      const geaendert = rundreise(g, r, (m) => { for (const b of m.bestaetigungen) { b.grund = "anders"; b.stufe = "achtung"; b.personId = "m0"; } });
      expect(geaendert && !geaendert.verweigert, r).toBe(true);
      expect(betrieb(geaendert).bestaetigungen, r).toEqual(betrieb(g).bestaetigungen);
      const geleert = rundreise(g, r, (m) => { m.bestaetigungen = []; });
      expect(geleert && !geleert.verweigert, r).toBe(true);
      expect(betrieb(geleert).bestaetigungen, r).toEqual(betrieb(g).bestaetigungen);
    }
  });
  it("Schichtverantwortung: ein verborgener Eintrag lässt sich nicht überschreiben", () => {
    const g = bestand();
    const e = rundreise(g, "SV", (m) => { m.bestaetigungen.push({ ...betrieb(g).bestaetigungen[1], grund: "überschrieben" }); });
    expect(e && !e.verweigert).toBe(true);
    expect(betrieb(e).bestaetigungen).toEqual(betrieb(g).bestaetigungen);
  });
  it("ungültige neue Einträge werden abgewiesen", () => {
    const falsch = [
      { personId: "unbekannt" }, { datum: "morgen" }, { dienstId: "X" }, { stufe: "hinweis" }, { gelesen: false },
      { befunde: [] }, { befunde: [{ stufe: "recht", text: "x".repeat(301) }] }, { grundArt: "erfunden" },
      { aktion: "<script>" }, { grundArt: "sonstiges", grund: "x".repeat(201) }];
    for (const f of falsch) {
      const e = rundreise(bestand(), "PL", (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1", f)); });
      expect(e.verweigert, JSON.stringify(f)).toBeTruthy();
    }
  });
  it("die Grundarten stimmen zwischen Oberfläche und Server überein", () => {
    expect(GRUENDE_SERVER).toEqual(GRUENDE_OBERFLAECHE.map((g) => g.id));
  });
});

/* ------------------------------------------------------------------------
   d.4 Mitteilung an die Leitung — vom Server
   ------------------------------------------------------------------------ */
describe("d.4 Mitteilung an die Leitung bei bestätigtem Rechtsverstoß", () => {
  const leitungsMitteilungen = (b) => (betrieb(b).nachrichten || []).filter((n) => /^n-bestaetigung-/.test(n.id));
  it("die Schichtverantwortung bestätigt — beide Leitungen werden unterrichtet, vom Server", () => {
    const e = rundreise(bestand(), "SV", (m) => { m.bestaetigungen.unshift(eintrag("neu", "a1")); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    const n = leitungsMitteilungen(e);
    expect(n.map((x) => x.personId).sort()).toEqual(["l1", "l2"]);
    for (const x of n) {
      expect(x.quelle).toMatchObject({ art: "bestaetigung", ids: ["neu"], von: "s1" });
      expect(x.titel).toBe("Rechtsverstoß bewusst bestätigt");
      expect(x.text).toContain("V Na1");
      expect(x.text).toContain("ohne Grund");
    }
  });
  it("die Leitung selbst wird nicht über die eigene Bestätigung unterrichtet", () => {
    const e = rundreise(bestand(), "LT", (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1")); });
    expect(leitungsMitteilungen(e).map((x) => x.personId)).toEqual(["l2"]);
  });
  it("„Achtung“ allein erzeugt keine Mitteilung; ein zweites Speichern auch nicht", () => {
    const e = rundreise(bestand(), "PL", (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1", { stufe: "achtung" })); });
    expect(leitungsMitteilungen(e)).toEqual([]);
    const e1 = rundreise(bestand(), "PL", (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1")); });
    const e2 = rundreise(e1, "PL");
    expect(leitungsMitteilungen(e2)).toHaveLength(2);
  });
  it("eine vom Client mitgeschickte Servermitteilung wird verworfen", () => {
    const e = rundreise(bestand(), "PL", (m) => {
      m.nachrichten.unshift({ id: "n-x", personId: "l1", art: "planGeaendert", titel: "gefälscht", quelle: { art: "bestaetigung" } });
    });
    expect((betrieb(e).nachrichten || []).map((n) => n.id)).not.toContain("n-x");
  });
});
