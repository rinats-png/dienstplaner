/* ==========================================================================
   SICHT DER SCHICHTVERANTWORTUNG — tagesgenau (WP-43)

   Das Sichtfenster (60 Tage zurück, 90 voraus) entscheidet, wen die
   Schichtverantwortung im Bereich führt. Bis WP-43 entschied es auch über
   jeden Tageseintrag: Nach einer Versetzung von e1 nach e2 sah die
   Schichtverantwortung von e1 die Zeiterfassung (Beginn, Ende, Pause,
   Bestätigung), Fahrzeiten, Wünsche, Einsprünge, Anträge, die Kategorie
   von Abwesenheiten, Notrufe, Planänderungen und Selbstplanung auch von den
   Tagen, an denen die Person schon zu e2 gehörte.

   Jetzt entscheidet für Tageseinträge zusätzlich die Zugehörigkeit an genau
   diesem Tag (`zugehoerigkeit[{einheitId, ab}]`, wie einheitAm in rechte.mjs).
   Tagesgenau schränkt nur ein: Was das Sichtfenster verschließt, bleibt zu.

   Auf dem Stand vor WP-43 rot (7 von 21): die drei Fälle der Versetzung,
   die Rückversetzung, Pool → anderer Bereich, „ohne gültigen Tag" und der
   Payload-Abgleich. Der Rundweg war schon vorher dicht und bleibt es
   (siehe docs/acc45/wp43-nachweis.md).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);

const person = (id, rolle, einheit, zug, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle,
  bereich: einheit, status: "aktiv", zugehoerigkeit: zug === undefined ? [{ ab: "2020-01-01", einheitId: einheit }] : zug,
  ...extra });

/* s1 Schichtverantwortung e1.
   v1  bis tag(-10) in e1, seit tag(-10) in e2       (Versetzung mitten im Zeitraum)
   r1  e1 → e2 ab tag(-20) → zurück nach e1 ab tag(-5) (Rückversetzung)
   sp1 im Pool, ab tag(-8) fest in e2                  (Pool, dann anderer Bereich)
   sj1 Springer (Flag), Zugehörigkeit e2               (Springer gilt an jedem Tag)
   al1 einer Einheit „ALLE" zugeordnet                 (kein Bereich)
   oz1 ohne Zugehörigkeit, bereich e1                  (Rückfall auf bereich)
   oz2 ohne Zugehörigkeit, bereich e2
   alt1 bis vor zwei Jahren in e1, seither e2          (Fenster bleibt maßgeblich)
   a1  immer in e1 */
const PERSONEN = () => [
  person("s1", "subplaner", "e1"),
  person("a1", "mitarbeiter", "e1"),
  person("v1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-10), einheitId: "e2" }]),
  person("r1", "mitarbeiter", "e1", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-20), einheitId: "e2" },
    { ab: tag(-5), einheitId: "e1" }]),
  person("sp1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "pool" }, { ab: tag(-8), einheitId: "e2" }]),
  person("sj1", "mitarbeiter", "e2", undefined, { springer: true }),
  person("al1", "mitarbeiter", "ALLE"),
  person("oz1", "mitarbeiter", "e1", []),
  person("oz2", "mitarbeiter", "e2", []),
  person("alt1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-730), einheitId: "e2" }]),
  person("l1", "leitung", "ALLE"),
];
const erf = (grund) => ({ start: "06:00", ende: "14:00", pause: 30, bestaetigt: true, grund });

const bestand = () => ({ version: 3, stand: 1, session: null, mandanten: [{
  id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "pool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: PERSONEN(),
  abweichungen: {},
  erfassung: {
    [`v1|${tag(-12)}`]: erf("v1 noch in e1"), [`v1|${tag(-10)}`]: erf("v1 erster Tag e2"), [`v1|${tag(-3)}`]: erf("v1 in e2"),
    [`r1|${tag(-25)}`]: erf("r1 e1 vorher"), [`r1|${tag(-12)}`]: erf("r1 zwischendurch e2"), [`r1|${tag(-2)}`]: erf("r1 wieder e1"),
    [`sp1|${tag(-9)}`]: erf("sp1 Pool"), [`sp1|${tag(-3)}`]: erf("sp1 e2"),
    [`al1|${tag(-3)}`]: erf("al1"), [`oz1|${tag(-3)}`]: erf("oz1"), [`oz2|${tag(-3)}`]: erf("oz2"),
    [`alt1|${tag(-740)}`]: erf("alt1 damals e1"), [`a1|${tag(-3)}`]: erf("a1"),
    "a1|kein-tag": erf("a1 ohne Tag"),
  },
  fahrzeiten: {
    [`v1|${tag(-12)}`]: { lenkzeit: 112 }, [`v1|${tag(-3)}`]: { lenkzeit: 103 },
    [`sp1|${tag(-9)}`]: { lenkzeit: 209 }, [`sp1|${tag(-3)}`]: { lenkzeit: 203 },
    [`sj1|${tag(-3)}`]: { lenkzeit: 303 },
  },
  wuensche: [{ id: "w-v1-e1", personId: "v1", datum: tag(-12), art: "moechte" },
    { id: "w-v1-e2", personId: "v1", datum: tag(5), art: "moechte" },
    { id: "w-a1-ohne", personId: "a1", art: "moechte" }],
  einspruenge: [{ id: "s-v1-e1", personId: "v1", datum: tag(-12), dienstId: "F" },
    { id: "s-v1-e2", personId: "v1", datum: tag(-3), dienstId: "F" },
    { id: "s-sp1-pool", personId: "sp1", datum: tag(-9), dienstId: "F" },
    { id: "s-sp1-e2", personId: "sp1", datum: tag(-3), dienstId: "F" },
    { id: "s-sj1", personId: "sj1", datum: tag(-3), dienstId: "F" }],
  aenderungen: [{ id: "c-v1-e1", personId: "v1", datum: tag(-12), von: "-", nach: "F" },
    { id: "c-v1-e2", personId: "v1", datum: tag(2), von: "-", nach: "F" },
    { id: "c-ohne", personId: null, datum: tag(2), von: "-", nach: "F" }],
  notrufe: [{ id: "nr-v1-e1", personId: "v1", datum: tag(-12), art: "hilfe", empfaenger: [], bestaetigt: null },
    { id: "nr-v1-e2", personId: "v1", datum: tag(-3), art: "hilfe", empfaenger: [], bestaetigt: null },
    { id: "nr-v1-an-mich", personId: "v1", datum: tag(-3), art: "hilfe", empfaenger: ["s1"], bestaetigt: null },
    { id: "nr-a1-ohne-tag", personId: "a1", art: "hilfe", empfaenger: [], bestaetigt: null }],
  abwesenheiten: [
    { id: "ab-v1-e1", personId: "v1", art: "krank", von: tag(-14), bis: tag(-12), notiz: "Notiz e1" },
    { id: "ab-v1-ueber", personId: "v1", art: "krank", von: tag(-11), bis: tag(-9), notiz: "Notiz über" },
    { id: "ab-v1-e2", personId: "v1", art: "krank", von: tag(-4), bis: tag(-2), notiz: "Notiz e2" },
    { id: "ab-v1-kaputt", personId: "v1", art: "krank", von: tag(-2), bis: tag(-4) }],
  anfragen: [
    { id: "an-v1-e1", personId: "v1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(-12), bis: tag(-11), text: "Antrag e1" },
    { id: "an-v1-e2", personId: "v1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(20), bis: tag(21), text: "Antrag e2" }],
  selbstplanung: [{ id: "sp-r", monat: tag(-12).slice(0, 7), status: "offen", eintraege: [
    { personId: "v1", datum: tag(-12), dienstId: "F", zeit: "t-e1" }, { personId: "v1", datum: tag(-3), dienstId: "F", zeit: "t-e2" }] }],
  urlaubsrunde: { jahr: 2026, phase: "offen", wuensche: [
    { id: "uw-v1-e1", personId: "v1", von: tag(-13), bis: tag(-11) },
    { id: "uw-v1-e2", personId: "v1", von: tag(10), bis: tag(14) }], vorjahrZurueck: [] },
  sondereinsaetze: [{ id: "se-v1-e1", datum: tag(-12), zugeteilt: ["v1"] }, { id: "se-v1-e2", datum: tag(-3), zugeteilt: ["v1"] },
    { id: "se-a1-ohne", zugeteilt: ["a1"] }, { id: "se-s1-ohne", zugeteilt: [{ personId: "s1" }] }],
  einstempeln: {}, nachrichten: [], protokoll: [],
}] });

const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const sicht = (g = bestand(), s = SUB) => bestandFuerRolle(g, s).mandanten[0];
const ids = (l) => (l || []).map((x) => x.id).sort();
const zeit = (e) => ({ start: e.start, ende: e.ende, bestaetigt: e.bestaetigt, pause: e.pause });

describe("Versetzung mitten im Monat (v1: e1 → e2 ab tag(-10))", () => {
  it("Zeiterfassung: nur die Tage in e1 — ohne Grund; ab dem Versetzungstag nichts", () => {
    const e = sicht().erfassung;
    expect(e[`v1|${tag(-12)}`]).toEqual(zeit(erf()));
    expect(e[`v1|${tag(-10)}`]).toBeUndefined();
    expect(e[`v1|${tag(-3)}`]).toBeUndefined();
  });
  it("Fahrzeiten, Wünsche, Einsprünge, Planänderungen, Notrufe, Selbstplanung: nur Tage in e1", () => {
    const m = sicht();
    expect(Object.keys(m.fahrzeiten).filter((k) => k.startsWith("v1|"))).toEqual([`v1|${tag(-12)}`]);
    expect(ids(m.wuensche).filter((x) => x.startsWith("w-v1"))).toEqual(["w-v1-e1"]);
    expect(ids(m.einspruenge).filter((x) => x.startsWith("s-v1"))).toEqual(["s-v1-e1"]);
    expect(ids(m.aenderungen)).toEqual(["c-ohne", "c-v1-e1"]);
    expect(ids(m.notrufe)).toEqual(["nr-v1-an-mich", "nr-v1-e1"]);       // an sie gerichtet bleibt sichtbar
    expect(m.selbstplanung[0].eintraege).toEqual([{ personId: "v1", datum: tag(-12), dienstId: "F", zeit: "t-e1" },
      { datum: tag(-3), dienstId: "F" }]);
  });
  it("Zeitraumeinträge: Abwesenheit, Antrag, Urlaubsrunde — Bereich nur, wo der Zeitraum e1 berührt", () => {
    const m = sicht();
    const ab = Object.fromEntries(m.abwesenheiten.map((a) => [a.id, a]));
    expect(ab["ab-v1-e1"]).toEqual({ id: "ab-v1-e1", personId: "v1", art: "krank", von: tag(-14), bis: tag(-12) });
    expect(ab["ab-v1-ueber"].art).toBe("krank");                                    // berührt e1 (tag(-11))
    expect(ab["ab-v1-ueber"].notiz).toBeUndefined();
    expect(ab["ab-v1-e2"]).toEqual({ id: "ab-v1-e2", personId: "v1", von: tag(-4), bis: tag(-2), art: "abwesend" });
    expect(ab["ab-v1-kaputt"].art).toBe("abwesend");                                // ungültiger Zeitraum: fail-closed
    /* Anträge: Bereich am ersten Tag (wie beim Entscheiden); sonst wie für Beschäftigte. */
    expect(ids(m.anfragen)).toEqual(["an-v1-e1"]);
    expect(ids(m.urlaubsrunde.wuensche)).toEqual(["uw-v1-e1"]);
  });
  it("Sondereinsätze (Auflage B4): nur am Tag in e1; ohne Tag nur der eigene", () => {
    expect(ids(sicht().sondereinsaetze)).toEqual(["se-s1-ohne", "se-v1-e1"]);
  });
  it("die Person selbst bleibt im Sichtfenster in der Personenliste des Bereichs (personenbezogen, nicht tagesbezogen)", () => {
    const v1 = sicht().personen.find((p) => p.id === "v1");
    expect(v1.sichtbereich).toBe("bereich");
  });
  it("Planung und Leitung: alles ungekürzt (keine Tagesprüfung)", () => {
    const m = sicht(bestand(), LEITUNG), roh = bestand().mandanten[0];
    for (const f of ["erfassung", "fahrzeiten", "wuensche", "einspruenge", "aenderungen", "notrufe", "abwesenheiten", "anfragen"])
      expect(m[f], f).toEqual(roh[f]);
  });
});

describe("Rückversetzung (r1: e1 → e2 ab tag(-20) → e1 ab tag(-5))", () => {
  it("vorher und nachher sichtbar, die Zeit in e2 nicht", () => {
    const e = sicht().erfassung;
    expect(e[`r1|${tag(-25)}`]).toEqual(zeit(erf()));
    expect(e[`r1|${tag(-12)}`]).toBeUndefined();
    expect(e[`r1|${tag(-2)}`]).toEqual(zeit(erf()));
  });
});

describe("Pool und Springer", () => {
  it("Pool, dann anderer Bereich (sp1): Pool-Tage wie Pool, Tage in e2 fremd", () => {
    const m = sicht();
    expect(m.personen.find((p) => p.id === "sp1").sichtbereich).toBe("pool");
    expect(Object.keys(m.fahrzeiten).filter((k) => k.startsWith("sp1|"))).toEqual([`sp1|${tag(-9)}`]);
    expect(ids(m.einspruenge).filter((x) => x.startsWith("s-sp1"))).toEqual(["s-sp1-pool"]);
    /* Zeiterfassung gibt es für den Pool nie. */
    expect(Object.keys(m.erfassung).filter((k) => k.startsWith("sp1|"))).toEqual([]);
  });
  it("Springer (Flag): Pool an jedem Tag — Fahrzeiten und Einsprünge ja, Zeiterfassung nein", () => {
    const m = sicht();
    expect(m.fahrzeiten[`sj1|${tag(-3)}`]).toEqual({ lenkzeit: 303 });
    expect(ids(m.einspruenge)).toContain("s-sj1");
  });
});

describe("Sonderfälle", () => {
  it("Bereich „ALLE“ ist kein Bereich: nichts", () => {
    expect(sicht().erfassung[`al1|${tag(-3)}`]).toBeUndefined();
  });
  it("ohne Zugehörigkeit zählt bereich: oz1 (e1) sichtbar, oz2 (e2) nicht", () => {
    const e = sicht().erfassung;
    expect(e[`oz1|${tag(-3)}`]).toEqual(zeit(erf()));
    expect(e[`oz2|${tag(-3)}`]).toBeUndefined();
  });
  it("tagesgenau öffnet nichts, was das Sichtfenster verschließt (alt1: vor zwei Jahren in e1)", () => {
    expect(sicht().erfassung[`alt1|${tag(-740)}`]).toBeUndefined();
  });
  it("ohne gültigen Tag: fail-closed (Erfassung, Wunsch, Notruf aus dem Bereich)", () => {
    const m = sicht();
    expect(m.erfassung["a1|kein-tag"]).toBeUndefined();
    expect(ids(m.wuensche)).not.toContain("w-a1-ohne");
    expect(ids(m.notrufe)).not.toContain("nr-a1-ohne-tag");
    expect(m.erfassung[`a1|${tag(-3)}`]).toEqual(zeit(erf()));
  });
  it("Schichtverantwortung mit Bereich „ALLE“: keine fremden Tageseinträge", () => {
    const g = bestand();
    g.mandanten[0].personen[0] = person("s1", "subplaner", "ALLE");
    const m = sicht(g);
    expect(Object.keys(m.erfassung)).toEqual([]);
    expect(Object.keys(m.fahrzeiten)).toEqual([]);
    expect(ids(m.einspruenge)).toEqual([]);
  });
  it("kein Grund, keine verborgene Angabe eines e2-Tags im ganzen Payload", () => {
    const text = JSON.stringify(bestandFuerRolle(bestand(), SUB));
    for (const s of ["v1 in e2", "v1 erster Tag e2", "r1 zwischendurch e2", "sp1 e2", "Notiz e2", "Antrag e2", "t-e2", "Notiz e1"])
      expect(text, s).not.toContain(s);
  });
});

describe("Rundweg: verborgene Tage gehen nicht verloren und lassen sich nicht überschreiben", () => {
  function rundweg(aendern, g = bestand()) {
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
    aendern(gelesen.mandanten[0]);
    return { g, e: zusammenfuehren(g, gelesen, SUB) };
  }
  it("unverändert zurück + Planänderung im Bereich: angenommen, jeder verborgene Tageseintrag wertgleich", () => {
    const { g, e } = rundweg((m) => { m.abweichungen[`a1|${tag(3)}`] = "F"; });
    expect(e.verweigert).toBeFalsy();
    const roh = g.mandanten[0], neu = e.mandanten[0];
    expect(neu.abweichungen[`a1|${tag(3)}`]).toBe("F");
    for (const f of ["erfassung", "fahrzeiten", "wuensche", "einspruenge", "aenderungen", "notrufe", "abwesenheiten",
      "anfragen", "selbstplanung", "urlaubsrunde", "sondereinsaetze", "personen"])
      expect(neu[f], f).toEqual(roh[f]);
  });
  const angriffe = {
    "Erfassung eines verborgenen e2-Tags setzen": (m) => { m.erfassung[`v1|${tag(-3)}`] = { start: "00:00", ende: "23:59", bestaetigt: true }; },
    "sichtbaren e1-Tag verändern": (m) => { m.erfassung[`v1|${tag(-12)}`].ende = "20:00"; },
    "Antrag eines e2-Zeitraums einschleusen": (m) => { m.anfragen.push({ id: "an-v1-e2", personId: "v1", typ: "abwesenheit", art: "urlaub", status: "genehmigt", von: tag(20), bis: tag(21) }); },
    "Anmerkung einer e2-Abwesenheit setzen": (m) => { m.abwesenheiten.find((a) => a.id === "ab-v1-e2").notiz = "neu"; },
  };
  for (const [name, f] of Object.entries(angriffe)) {
    it(`${name}: abgewiesen`, () => {
      const { e } = rundweg(f);
      expect(e.verweigert, name).toBeTruthy();
    });
  }
  it("Fahrzeit eines verborgenen e2-Tags setzen: abgewiesen oder wirkungslos", () => {
    const { g, e } = rundweg((m) => { m.fahrzeiten[`v1|${tag(-3)}`] = { lenkzeit: 1 }; });
    if (!e.verweigert) expect(e.mandanten[0].fahrzeiten).toEqual(g.mandanten[0].fahrzeiten);
  });
  it("verborgene e2-Einträge weglassen (die Sicht hat sie nie gezeigt): nichts gelöscht", () => {
    const { g, e } = rundweg((m) => {
      delete m.erfassung[`v1|${tag(-12)}`];       // auch ein sichtbarer fehlt nicht unbemerkt: Erfassung ist ohne Rohzugriff
    });
    if (!e.verweigert) expect(e.mandanten[0].erfassung).toEqual(g.mandanten[0].erfassung);
  });
});

/* Auflage B5: Der Schreibweg der Schichtverantwortung (einheitZusammen) prüft
   dieselbe Zugehörigkeit am Tag wie die Lesesicht. Bis dahin galt ohne gültigen
   Tag der heutige, und vor dem ersten Zugehörigkeitsabschnitt `bereich` — die
   Schichtverantwortung konnte so Einträge quittieren, entscheiden oder planen,
   die sie gar nicht sieht. */
describe("Schreibweg fail-closed wie die Lesesicht (B5)", () => {
  const mitSonderfaellen = () => {
    const g = bestand();
    const m = g.mandanten[0];
    m.notrufe.push({ id: "nr-a1-alt", personId: "a1", art: "hilfe", empfaenger: ["l1"], bestaetigt: null });
    m.anfragen.push({ id: "an-a1-ohne-tag", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "offen", text: "ohne Tag" });
    /* z1 gehört erst ab tag(5) zu e1; davor keiner Einheit (bereich e1 zählt dann nicht). */
    m.personen.push(person("z1", "mitarbeiter", "e1", [{ ab: tag(5), einheitId: "e1" }]));
    return g;
  };
  const schreiben = (aendern) => {
    const g = mitSonderfaellen();
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
    aendern(gelesen.mandanten[0], g.mandanten[0]);
    return zusammenfuehren(g, gelesen, SUB);
  };
  it("die Lesesicht zeigt keinen der Fälle", () => {
    const m = bestandFuerRolle(mitSonderfaellen(), SUB).mandanten[0];
    expect(ids(m.notrufe)).not.toContain("nr-a1-alt");
    expect(ids(m.anfragen)).not.toContain("an-a1-ohne-tag");
  });
  it("Notruf ohne Datum (nicht an sie gerichtet) quittieren: abgelehnt", () => {
    const e = schreiben((m, roh) => {
      m.notrufe.push({ ...roh.notrufe.find((n) => n.id === "nr-a1-alt"), bestaetigt: "jetzt" });
    });
    expect(e.verweigert).toBeTruthy();
  });
  it("Antrag ohne gültigen Tag entscheiden: abgelehnt", () => {
    const e = schreiben((m, roh) => {
      m.anfragen.push({ ...roh.anfragen.find((a) => a.id === "an-a1-ohne-tag"), status: "genehmigt" });
    });
    expect(e.verweigert).toBeTruthy();
  });
  it("Plan vor dem ersten Zugehörigkeitsabschnitt: abgelehnt; ab dem Abschnitt angenommen", () => {
    expect(schreiben((m) => { m.abweichungen[`z1|${tag(-2)}`] = "F"; }).verweigert).toBeTruthy();
    expect(schreiben((m) => { m.abweichungen[`z1|${tag(6)}`] = "F"; }).verweigert).toBeFalsy();
  });
  it("Planänderung ohne gültigen Tag im Schlüssel: abgelehnt (wie bisher)", () => {
    expect(schreiben((m) => { m.abweichungen["a1|morgen"] = "F"; }).verweigert).toBeTruthy();
  });
});
