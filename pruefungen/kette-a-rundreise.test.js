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
import { ABWEICHUNG_GRUENDE as GRUENDE_SERVER, bestaetigungMitteilungen } from "../server/lib/bestaetigungen.mjs";
import { ABWEICHUNG_GRUENDE as GRUENDE_OBERFLAECHE } from "../src/warnstufen.js";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const kopie = (x) => JSON.parse(JSON.stringify(x));

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/* m0 und a1 im Bereich e1 der Schichtverantwortung s1, b1 in e2. */
/* Seit Review M1/H1: Befunde nur als Kennung aus dem Befundkatalog, und nur
   warnende lassen sich bestätigen — hier die Ruhezeit unter der Vorgabe des
   Betriebs (über dem Gesetz). Ein „recht"-Befund sperrt in der strengen
   Variante immer (siehe d.4 unten). */
const eintrag = (id, personId, extra = {}) => ({ id, personId, datum: tag(3), dienstId: "F", aktion: "einsprung",
  stufe: "achtung", gelesen: true, befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }],
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
  it("der Betriebsrat sieht nur Zählwerte — keine Person, keinen Namen, keinen Freitext, keine Einträge", () => {
    /* Nachprüfung M1-Rest: je Monat, Regel und Stufe, unter 3 als „<3“. */
    const b = betrieb(bestandFuerRolle(bestand(), SITZ.BR)).bestaetigungen;
    expect(b).toEqual([{ monat: tag(3).slice(0, 7), regel: "ruhezeitBetrieb", stufe: "achtung", anzahl: "<3" }]);
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
      { personId: "unbekannt" }, { datum: "morgen" }, { dienstId: "X" }, { befunde: [{ regel: "schutzOffen", stufe: "hinweis" }] },
      { befunde: [] }, { befunde: [{ stufe: "achtung", text: "Frau X ist schwanger" }] },
      { befunde: [{ regel: "erfunden", stufe: "achtung" }] },
      { grundArt: "erfunden" },
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
  /* In der strengen Variante (Review H1) sperrt jeder Befund der Stufe
     „recht" — ein bestätigter Rechtsverstoß kann gar nicht entstehen; der
     Server weist ihn ab. Die Mitteilung bleibt für den Fall, dass die
     Fachentscheidung eine Regel auf „warnen" setzt; geprüft wird sie direkt. */
  const rechtEintrag = (id, personId) => eintrag(id, personId, { stufe: "recht", befunde: [{ regel: "ruhezeitGesetz", stufe: "recht" }] });
  it("ein Rechtsverstoß lässt sich heute nicht bestätigen — jede schreibende Rolle", () => {
    for (const r of [...SCHREIBEND_VOLL, "SV"]) {
      const e = rundreise(bestand(), r, (m) => { m.bestaetigungen.unshift(rechtEintrag("neu", "a1")); });
      expect(e.verweigert, r).toMatch(/sperrender Befund/);
    }
  });
  it("die Schichtverantwortung bestätigt — beide Leitungen werden unterrichtet, vom Server", () => {
    const g = bestand();
    const e = { mandanten: [bestaetigungMitteilungen(betrieb(g), { ...betrieb(g), bestaetigungen: [
      { ...rechtEintrag("neu", "a1"), ohneGrund: true }, ...betrieb(g).bestaetigungen] }, "s1")] };
    const n = leitungsMitteilungen(e);
    expect(n.map((x) => x.personId).sort()).toEqual(["l1", "l2"]);
    for (const x of n) {
      expect(x.quelle).toMatchObject({ art: "bestaetigung", ids: ["neu"], von: "s1" });
      expect(x.titel).toBe("Rechtsverstoß bewusst bestätigt");
      expect(x.text).toContain("V Na1");
      expect(x.text).toContain("ohne Grund");
      /* Der Text kommt aus dem Befundkatalog (Review N1), nicht vom Client. */
      expect(x.text).toContain("Ruhezeit unter 11 Stunden");
    }
  });
  it("die Leitung selbst wird nicht über die eigene Bestätigung unterrichtet", () => {
    const g = bestand();
    const neu = { ...betrieb(g), bestaetigungen: [rechtEintrag("neu", "b1"), ...betrieb(g).bestaetigungen] };
    expect(leitungsMitteilungen({ mandanten: [bestaetigungMitteilungen(betrieb(g), neu, "l1")] }).map((x) => x.personId)).toEqual(["l2"]);
  });
  it("„Achtung“ erzeugt keine Mitteilung; vorhandene entstehen nicht noch einmal", () => {
    const e = rundreise(bestand(), "PL", (m) => { m.bestaetigungen.unshift(eintrag("neu", "b1")); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(leitungsMitteilungen(e)).toEqual([]);
    const g = bestand();
    const neu = { ...betrieb(g), bestaetigungen: [rechtEintrag("neu", "b1"), ...betrieb(g).bestaetigungen] };
    const einmal = bestaetigungMitteilungen(betrieb(g), neu, "p1");
    expect(bestaetigungMitteilungen(betrieb(g), einmal, "p1").nachrichten).toHaveLength(2);
  });
  it("eine vom Client mitgeschickte Servermitteilung wird verworfen", () => {
    const e = rundreise(bestand(), "PL", (m) => {
      m.nachrichten.unshift({ id: "n-x", personId: "l1", art: "planGeaendert", titel: "gefälscht", quelle: { art: "bestaetigung" } });
    });
    expect((betrieb(e).nachrichten || []).map((n) => n.id)).not.toContain("n-x");
  });
});

/* ------------------------------------------------------------------------
   d.3 Selbstplanung: hinweise
   ------------------------------------------------------------------------ */
describe("d.3 Selbstplanung: Hinweise an der eigenen Eintragung", () => {
  const meinEintrag = (pid, extra = {}) => ({ personId: pid, datum: tag(3), dienstId: "N",
    hinweise: ["dieser Dienst ist bereits gedeckt", "zu wenig Ruhezeit nach dem Vortag"], ...extra });
  const runde = (b) => betrieb(b).selbstplanung[0].eintraege;
  for (const [r, pid] of [["MA", "m0"], ["SV", "s1"]]) {
    it(`${r}: die eigene Eintragung kommt mit Hinweisen an und bleibt beim Zurückspeichern`, () => {
      const e = rundreise(bestand(), r, (m) => { m.selbstplanung[0].eintraege.push(meinEintrag(pid)); });
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      expect(runde(e)).toEqual([meinEintrag(pid)]);
      const zurueck = rundreise(e, r);
      expect(runde(zurueck)).toEqual([meinEintrag(pid)]);
      /* … und die Planung sieht sie. */
      expect(betrieb(bestandFuerRolle(e, SITZ.PL)).selbstplanung[0].eintraege).toEqual([meinEintrag(pid)]);
    });
  }
  it("andere Beschäftigte sehen die Hinweise nicht, nur Tag und Dienst", () => {
    const e = rundreise(bestand(), "MA", (m) => { m.selbstplanung[0].eintraege.push(meinEintrag("m0")); });
    const fremd = betrieb(bestandFuerRolle(e, { rolle: "mitarbeiter", person: "a1", betrieb: 0 })).selbstplanung[0].eintraege;
    expect(fremd).toEqual([{ datum: tag(3), dienstId: "N" }]);
  });
  it("Hinweise in falscher Form fallen weg, die Eintragung bleibt", () => {
    for (const hinweise of [["x".repeat(301)], Array(13).fill("x"), [{ text: "x" }], "x", [""]]) {
      const e = rundreise(bestand(), "MA", (m) => { m.selbstplanung[0].eintraege.push(meinEintrag("m0", { hinweise })); });
      expect(runde(e), JSON.stringify(hinweise).slice(0, 40)).toEqual([{ personId: "m0", datum: tag(3), dienstId: "N" }]);
    }
  });
  it("fremde Eintragungen und ihre Hinweise lassen sich nicht überschreiben", () => {
    const g = bestand();
    betrieb(g).selbstplanung[0].eintraege = [meinEintrag("a1")];
    const e = rundreise(g, "MA", (m) => { m.selbstplanung[0].eintraege = [{ personId: "a1", datum: tag(3), dienstId: "N", hinweise: ["gefälscht"] }]; });
    expect(runde(e)).toEqual([meinEintrag("a1")]);
  });
  it("Planung und Leitung: unverändert zurückgespeichert bleiben die Hinweise", () => {
    for (const r of SCHREIBEND_VOLL) {
      const g = bestand();
      betrieb(g).selbstplanung[0].eintraege = [meinEintrag("a1"), meinEintrag("b1")];
      expect(runde(rundreise(g, r)), r).toEqual([meinEintrag("a1"), meinEintrag("b1")]);
    }
  });
});

/* ------------------------------------------------------------------------
   d.2 Beschäftigungsmodell und Monatsstundengrenze an der Person
   ------------------------------------------------------------------------ */
describe("d.2 beschaeftigungsmodell, stundenGrenzeMonat", () => {
  const MIT = (g) => { for (const p of betrieb(g).personen) if (["m0", "a1", "b1", "s1"].includes(p.id))
    Object.assign(p, { beschaeftigungsmodell: "minijob", stundenGrenzeMonat: 43 }); return g; };
  const felder = (b, pid) => { const p = betrieb(b).personen.find((x) => x.id === pid) || {};
    return { modell: p.beschaeftigungsmodell, grenze: p.stundenGrenzeMonat }; };
  const LEER = { modell: undefined, grenze: undefined };
  const GESETZT = { modell: "minijob", grenze: 43 };

  it("stehen im Katalog der Personenfelder und der eigenen Person", async () => {
    const { PERSONENFELDER, VOLL_PERSON } = await import("../server/lib/sicht.mjs");
    for (const f of ["beschaeftigungsmodell", "stundenGrenzeMonat"]) {
      expect(PERSONENFELDER, f).toContain(f);
      expect(VOLL_PERSON, f).toContain(f);
    }
  });
  it("Lesen: eigene Person ja, fremde nur Planung, Leitung, Kundenrolle", () => {
    const g = MIT(bestand());
    expect(felder(bestandFuerRolle(g, SITZ.MA), "m0"), "MA eigene").toEqual(GESETZT);
    expect(felder(bestandFuerRolle(g, SITZ.MA), "b1"), "MA fremd").toEqual(LEER);
    expect(felder(bestandFuerRolle(g, SITZ.BR), "b1"), "BR fremd").toEqual(LEER);
    expect(felder(bestandFuerRolle(g, SITZ.SV), "s1"), "SV eigene").toEqual(GESETZT);
    expect(felder(bestandFuerRolle(g, SITZ.SV), "a1"), "SV Bereich").toEqual(LEER);
    expect(felder(bestandFuerRolle(g, SITZ.SV), "b1"), "SV fremd").toEqual(LEER);
    for (const r of SCHREIBEND_VOLL) expect(felder(bestandFuerRolle(g, SITZ[r]), "b1"), r).toEqual(GESETZT);
  });
  it("Planung, Leitung, Kundenrolle setzen sie, und sie kommen beim Lesen wieder", () => {
    for (const r of SCHREIBEND_VOLL) {
      const e = rundreise(bestand(), r, (m) => { Object.assign(m.personen.find((p) => p.id === "b1"),
        { beschaeftigungsmodell: "werkstudent", stundenGrenzeMonat: 80 }); });
      expect(e && !e.verweigert, r).toBe(true);
      expect(felder(e, "b1"), r).toEqual({ modell: "werkstudent", grenze: 80 });
      expect(felder(bestandFuerRolle(e, SITZ.LT), "b1"), r).toEqual({ modell: "werkstudent", grenze: 80 });
    }
  });
  it("unverändert zurückgespeichert gehen sie für keine Rolle verloren", () => {
    for (const r of [...SCHREIBEND_VOLL, "SV", "MA"]) {
      const g = MIT(bestand());
      const e = rundreise(g, r);
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      for (const pid of ["m0", "a1", "b1", "s1"]) expect(felder(e, pid), `${r} ${pid}`).toEqual(GESETZT);
    }
  });
  it("Beschäftigte ändern die eigenen Angaben nicht", () => {
    const g = MIT(bestand());
    const e = rundreise(g, "MA", (m) => { Object.assign(m.personen.find((p) => p.id === "m0"),
      { beschaeftigungsmodell: "vollzeit", stundenGrenzeMonat: 999 }); });
    expect(felder(e, "m0")).toEqual(GESETZT);
  });
  it("die Schichtverantwortung überschreibt verborgene Angaben nicht", () => {
    const g = MIT(bestand());
    const e = rundreise(g, "SV", (m) => { Object.assign(m.personen.find((p) => p.id === "a1"),
      { beschaeftigungsmodell: "vollzeit", stundenGrenzeMonat: 999 }); });
    /* Mitgeschickte verborgene Felder einer anderen Person: einheitZusammen weist ab. */
    expect(e.verweigert).toBeTruthy();
    expect(felder(g, "a1")).toEqual(GESETZT);
  });
});

/* ------------------------------------------------------------------------
   d.5 Abwesenheit für einen Tag aufheben
   ------------------------------------------------------------------------ */
describe("d.5 Abwesenheit für einen Tag aufheben", () => {
  /* So teilt der Warndialog (src/warnstufen.js, abwesenheitTagAufheben):
     Urlaub tag(2)…tag(6), aufgehoben am tag(3). */
  const teilen = (m) => {
    const i = m.abwesenheiten.findIndex((a) => a.id === "abw-a1");
    m.abwesenheiten.splice(i, 1, { ...m.abwesenheiten[i], bis: tag(2) },
      { ...m.abwesenheiten[i], id: "abw-a1-rest", von: tag(4) });
  };
  const bestaetigung = eintrag("auf-a1", "a1", { stufe: "achtung", gelesen: true,
    befunde: [{ regel: "abwesend", stufe: "achtung" }] });
  const abw = (b) => betrieb(b).abwesenheiten.filter((a) => a.personId === "a1").map((a) => [a.id, a.von, a.bis]);

  it("Planung, Leitung, Kundenrolle: geteilt gespeichert, mit Protokolleintrag, beim Lesen wieder da", () => {
    for (const r of SCHREIBEND_VOLL) {
      const e = rundreise(bestand(), r, (m) => { teilen(m); m.bestaetigungen.unshift(bestaetigung); });
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      expect(abw(e), r).toEqual([["abw-a1", tag(2), tag(2)], ["abw-a1-rest", tag(4), tag(6)]]);
      expect(ids(betrieb(e).bestaetigungen)[0], r).toBe("auf-a1");
      expect(abw(rundreise(e, r)), `${r} zurück`).toEqual(abw(e));
    }
  });
  it("die Schichtverantwortung hebt nicht auf — auch nicht mit Bestätigung", () => {
    const g = bestand();
    const e = rundreise(g, "SV", (m) => { teilen(m); m.bestaetigungen.unshift(bestaetigung); });
    expect(e.verweigert).toBeTruthy();
    const ohne = rundreise(g, "SV", teilen);
    expect(ohne.verweigert).toBeTruthy();
  });
  it("Beschäftigte heben nicht auf — der gespeicherte Stand bleibt", () => {
    const g = bestand();
    const e = rundreise(g, "MA", teilen);
    expect(abw(e)).toEqual(abw(g));
  });
  it("der Betriebsrat sieht im Protokoll nur „abwesend“, nicht die Art", () => {
    const e = rundreise(bestand(), "PL", (m) => { teilen(m); m.bestaetigungen.unshift(bestaetigung); });
    const br = betrieb(bestandFuerRolle(e, SITZ.BR)).bestaetigungen.find((b) => b.regel === "abwesend");
    expect(br).toEqual({ monat: tag(3).slice(0, 7), regel: "abwesend", stufe: "achtung", anzahl: "<3" });
    expect(JSON.stringify(betrieb(bestandFuerRolle(e, SITZ.BR)).bestaetigungen)).not.toContain("Krank");
    /* Planung und Leitung sehen den Befund im Wortlaut. */
    expect(betrieb(bestandFuerRolle(e, SITZ.LT)).bestaetigungen[0].befunde[0]).toEqual({ regel: "abwesend", stufe: "achtung" });
  });
});
