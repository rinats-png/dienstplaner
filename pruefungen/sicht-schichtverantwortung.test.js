/* ==========================================================================
   SICHT DER SCHICHTVERANTWORTUNG — Personen (Commit 1e.1)

   Bis Oktober 2026 bekam die Schichtverantwortung jede Person des Betriebs
   vollständig. Jetzt gestuft und als Positivliste:
   eigene Person · eigener Bereich (im Sichtfenster) · Springer-Pool · fremd.

   Und der Schreibweg: Die gekürzte Sicht geht unverändert zurück, nichts
   Verborgenes geht verloren (Rückfüllung), und ein verborgenes Feld lässt
   sich nicht durchschreiben.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren, einheitZusammen, personenRueckfuellen } from "../server/lib/rechte.mjs";
import { SICHTFENSTER, schichtKontext, schichtPersonSicht } from "../server/lib/sicht.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);

/* Alles, was eine Person an Privatem, Gesundheitlichem und Geheimem tragen kann. */
const privat = (id) => ({
  email: `${id}@privat.de`, telefon: `0151-${id}`, mobil: `0171-${id}`,
  anschrift: `Gartenweg ${id}`, notfallkontakt: `Mutter von ${id}`, iban: `DE89-${id}`,
  steuerId: `ST-${id}`, sozialversicherung: `SV-${id}`, personalnummer: `PN-${id}`, lohn: 3100,
  notiz: `Leitungsnotiz-${id}`, emailVorher: `alt-${id}@privat.de`, rolleVerlauf: [{ rolle: "x" }],
  kalenderGeheim: `geheim-kal-${id}`, kalenderVerweis: `kal-${id}`, pushSchluessel: { endpoint: `push-${id}` },
  zustellung: { mail: true }, mutterschutz: true, schwerbehindert: true, geburtstag: "2009-05-01",
  nachtvorsorge: "2025-01-01", einschraenkungen: { keineNacht: true }, verfuegbarkeit: { aktiv: true },
  wunschfrei: [`${id}-wunsch`], stundenuebertrag: 12.5, urlaubsanspruch: 30, urlaubsuebertrag: 2,
  einarbeitung: { bis: tag(30) }, kompetenzNachweise: [], darfNichtRaus: `darf-nicht-raus-${id}`,
  qualNachweise: [{ qualId: "pfk", ablauf: "2030-01-01", datei: `scan-${id}.pdf` },
    { qualId: "masern", vorhanden: true, datei: `impf-${id}.pdf` }],
  qualifikationen: ["pfk", "masern"],
});
const person = (id, rolle, einheit, zug, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle,
  bereich: einheit, status: "aktiv", funktion: "Fachkraft", wochenstunden: 38.5,
  zugehoerigkeit: zug || [{ ab: "2020-01-01", einheitId: einheit }], ...privat(id), ...extra });

/* s1 Schichtverantwortung e1 · a1 in e1 · b1 in e2 · sp1 im Pool · v1 bis vor
   30 Tagen in e1, jetzt e2 · alt1 bis vor 100 Tagen in e1 · k1 kommt in 30
   Tagen nach e1 · l1 Leitung. */
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [{
  id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "pool", pool: true }],
  qualifikationen: [{ id: "pfk", name: "PFK" }, { id: "masern", name: "Masern", nurStatus: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [
    person("s1", "subplaner", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("sp1", "mitarbeiter", "pool", null, { springer: true }),
    person("v1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-30), einheitId: "e2" }]),
    person("alt1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e1" }, { ab: tag(-100), einheitId: "e2" }]),
    person("k1", "mitarbeiter", "e2", [{ ab: "2020-01-01", einheitId: "e2" }, { ab: tag(30), einheitId: "e1" }]),
    person("l1", "leitung", "ALLE"),
  ],
  abweichungen: {}, abwesenheiten: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {},
}] });
const SUB = { rolle: "subplaner", person: "s1", betrieb: 0 };
const LEITUNG = { rolle: "leitung", person: "l1", betrieb: 0 };
const PLANER = { rolle: "planer", person: "l1", betrieb: 0 };
const sichtPersonen = (g = bestand(), s = SUB) => bestandFuerRolle(g, s).mandanten[0].personen;
const p = (liste, id) => liste.find((x) => x.id === id);

describe("eigene Person", () => {
  it("wie Beschäftigte (EIGENE_PERSON), mit eigener E-Mail und Kontakten, ohne Leitungsnotiz und Lohnfelder", () => {
    const ich = p(sichtPersonen(), "s1");
    expect(ich.sichtbereich).toBe("eigen");
    expect(ich).toMatchObject({ email: "s1@privat.de", telefon: "0151-s1", anschrift: "Gartenweg s1",
      kalenderGeheim: "geheim-kal-s1", stundenuebertrag: 12.5 });
    for (const f of ["notiz", "emailVorher", "iban", "lohn", "personalnummer", "mutterschutz", "darfNichtRaus"])
      expect(ich[f], f).toBeUndefined();
  });
});

describe("eigener Bereich", () => {
  it("Plan, Qualifikation, Einschränkungen, Konten, Schutzmerkmale, Telefon und Mobil", () => {
    const a = p(sichtPersonen(), "a1");
    expect(a.sichtbereich).toBe("bereich");
    expect(a).toMatchObject({ telefon: "0151-a1", mobil: "0171-a1", mutterschutz: true, schwerbehindert: true,
      geburtstag: "2009-05-01", nachtvorsorge: "2025-01-01", stundenuebertrag: 12.5, urlaubsanspruch: 30,
      einschraenkungen: { keineNacht: true }, wunschfrei: ["a1-wunsch"], qualifikationen: ["pfk", "masern"] });
    expect(a.qualNachweise).toEqual([{ qualId: "pfk", ablauf: "2030-01-01" }, { qualId: "masern", vorhanden: true }]);
  });
  it("ohne E-Mail, Anschrift, Notfallkontakt, Lohn, Leitungsnotiz, Geheimnisse, Verlauf", () => {
    const a = p(sichtPersonen(), "a1");
    for (const f of ["email", "anschrift", "notfallkontakt", "iban", "steuerId", "sozialversicherung",
      "personalnummer", "lohn", "notiz", "emailVorher", "rolleVerlauf", "kalenderGeheim", "kalenderVerweis",
      "pushSchluessel", "zustellung", "darfNichtRaus"])
      expect(a[f], f).toBeUndefined();
  });
  it("Sichtfenster: kürzlich versetzt und demnächst kommend gehören dazu, lange her nicht", () => {
    const l = sichtPersonen();
    expect(p(l, "v1").sichtbereich).toBe("bereich");
    expect(p(l, "k1").sichtbereich).toBe("bereich");
    expect(p(l, "alt1").sichtbereich).toBe("fremd");
  });
  it("das Fenster ist zentral und lässt sich übergeben", () => {
    expect(SICHTFENSTER).toEqual({ vorTage: 60, nachTage: 90 });
    const m = bestand().mandanten[0];
    const eng = schichtKontext(m, SUB, "e1", HEUTE, { vorTage: 10, nachTage: 10 });
    expect(schichtPersonSicht(p(m.personen, "v1"), eng).sichtbereich).toBe("fremd");
    expect(schichtPersonSicht(p(m.personen, "k1"), eng).sichtbereich).toBe("fremd");
    const weit = schichtKontext(m, SUB, "e1", HEUTE, { vorTage: 200, nachTage: 10 });
    expect(schichtPersonSicht(p(m.personen, "alt1"), weit).sichtbereich).toBe("bereich");
  });
});

describe("Springer-Pool", () => {
  it("planungsrelevant mit Schutzmerkmalen und Telefon — ohne Konten und Wünsche", () => {
    const sp = p(sichtPersonen(), "sp1");
    expect(sp.sichtbereich).toBe("pool");
    expect(sp).toMatchObject({ telefon: "0151-sp1", mobil: "0171-sp1", mutterschutz: true,
      einschraenkungen: { keineNacht: true }, verfuegbarkeit: { aktiv: true } });
    for (const f of ["stundenuebertrag", "urlaubsanspruch", "urlaubsuebertrag", "wunschfrei", "email", "anschrift",
      "notfallkontakt", "notiz", "kalenderGeheim", "pushSchluessel", "iban", "lohn", "darfNichtRaus"])
      expect(sp[f], f).toBeUndefined();
  });
});

describe("andere Bereiche", () => {
  it("nur, was Beschäftigte sehen — keine Schutzmerkmale, kein Telefon", () => {
    const b = p(sichtPersonen(), "b1");
    const wieBeschaeftigte = p(bestandFuerRolle(bestand(), { rolle: "mitarbeiter", person: "a1", betrieb: 0 })
      .mandanten[0].personen, "b1");
    expect({ ...b, sichtbereich: undefined }).toEqual({ ...wieBeschaeftigte, sichtbereich: undefined });
    expect(b.sichtbereich).toBe("fremd");
    for (const f of ["mutterschutz", "schwerbehindert", "geburtstag", "nachtvorsorge", "telefon", "mobil",
      "einschraenkungen", "stundenuebertrag"])
      expect(b[f], f).toBeUndefined();
    expect(b.qualifikationen).toEqual(["pfk"]);            // Status-Qualifikation fällt heraus
  });
  it("ohne gültigen eigenen Bereich ist jede andere Person fremd — auch der Pool", () => {
    const g = bestand();
    const s = p(g.mandanten[0].personen, "s1");
    s.bereich = "gibt-es-nicht"; s.zugehoerigkeit = [{ ab: "2020-01-01", einheitId: "gibt-es-nicht" }];
    const l = sichtPersonen(g);
    expect(l.filter((x) => x.id !== "s1").every((x) => x.sichtbereich === "fremd")).toBe(true);
  });
});

describe("fail-closed", () => {
  it("ein unbekanntes neues Personenfeld geht an niemanden hinaus", () => {
    const text = JSON.stringify(bestandFuerRolle(bestand(), SUB));
    expect(text).not.toContain("darf-nicht-raus");
  });
  it("kein Fremdgeheimnis, keine fremde Lohn- oder Privatangabe im ganzen Payload", () => {
    const text = JSON.stringify(bestandFuerRolle(bestand(), SUB));
    for (const id of ["a1", "b1", "sp1", "v1", "alt1", "k1", "l1"])
      for (const s of [`geheim-kal-${id}`, `push-${id}`, `DE89-${id}`, `Gartenweg ${id}`, `Mutter von ${id}`,
        `Leitungsnotiz-${id}`, `alt-${id}@`, `${id}@privat.de`, `PN-${id}`, `scan-${id}.pdf`])
        expect(text, s).not.toContain(s);
  });
  it("Schutzmerkmale nur im eigenen Bereich und im Pool", () => {
    const l = sichtPersonen();
    for (const x of l) {
      const darf = ["bereich", "pool"].includes(x.sichtbereich);
      expect(x.mutterschutz !== undefined, `${x.id}`).toBe(darf);
    }
  });
});

describe("Rundweg und Rückfüllung", () => {
  function rundweg(aendern) {
    const g = bestand();
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
    aendern(gelesen.mandanten[0]);
    return { g, e: zusammenfuehren(g, gelesen, SUB) };
  }
  it("gekürzte Sicht lesen, im Bereich planen, zurückschreiben: angenommen, nichts Verborgenes verloren", () => {
    const { g, e } = rundweg((m) => { m.abweichungen[`a1|${tag(3)}`] = "F"; });
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].abweichungen[`a1|${tag(3)}`]).toBe("F");
    expect(e.mandanten[0].personen).toEqual(g.mandanten[0].personen);           // wertgleich
    expect(JSON.stringify(e.mandanten[0].personen)).not.toContain("sichtbereich");
    const leitung = bestandFuerRolle(e, LEITUNG).mandanten[0].personen;
    expect(leitung).toEqual(g.mandanten[0].personen);
    expect(JSON.stringify(bestandFuerRolle(e, SUB))).not.toContain("Leitungsnotiz-a1");   // weiter gekürzt
  });
  it("die eigene Telefonnummer ändern: angenommen, Verborgenes bleibt", () => {
    const { g, e } = rundweg((m) => { p(m.personen, "s1").telefon = "0160-neu"; });
    expect(e.verweigert).toBeFalsy();
    const s = p(e.mandanten[0].personen, "s1");
    expect(s.telefon).toBe("0160-neu");
    expect(s.notiz).toBe(p(g.mandanten[0].personen, "s1").notiz);
    expect(s.iban).toBe("DE89-s1");
  });
  it("ohne Rückfüllung scheitert derselbe Rundweg — mit ihr nicht", () => {
    const g = bestand();
    const sicht = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB))).mandanten[0];
    sicht.abweichungen[`a1|${tag(3)}`] = "F";
    expect(einheitZusammen(g.mandanten[0], sicht, SUB).ok).toBe(false);
    expect(einheitZusammen(g.mandanten[0], personenRueckfuellen(g.mandanten[0], sicht, SUB), SUB).ok).toBe(true);
  });
});

describe("Angriffe auf verborgene Felder: kein Durchschreiben", () => {
  const versuche = {
    "Leitungsnotiz an einer Person des Bereichs setzen": (m) => { p(m.personen, "a1").notiz = "manipuliert"; },
    "IBAN an einer fremden Person setzen": (m) => { p(m.personen, "b1").iban = "DE00"; },
    "Kalendergeheimnis einer Person des Bereichs setzen": (m) => { p(m.personen, "a1").kalenderGeheim = "mein-geheimnis"; },
    "Mutterschutz einer fremden Person setzen": (m) => { p(m.personen, "b1").mutterschutz = false; },
    "Telefon einer Person des Bereichs ändern": (m) => { p(m.personen, "a1").telefon = "0000"; },
    "sichtbare Angabe einer Person des Bereichs entfernen": (m) => { delete p(m.personen, "a1").einschraenkungen; },
    "eigene IBAN setzen": (m) => { p(m.personen, "s1").iban = "DE00"; },
    "eigene Leitungsnotiz setzen": (m) => { p(m.personen, "s1").notiz = "selbst"; },
    "sichtbereich umschreiben": (m) => { p(m.personen, "b1").sichtbereich = "bereich"; },
  };
  for (const [name, f] of Object.entries(versuche)) {
    it(`${name}: abgewiesen`, () => {
      const g = bestand();
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
      f(gelesen.mandanten[0]);
      expect(zusammenfuehren(g, gelesen, SUB).verweigert).toBeTruthy();
    });
  }
});

describe("Planung und Leitung unverändert", () => {
  it("bekommen die Personen vollständig, ohne sichtbereich", () => {
    for (const s of [LEITUNG, PLANER]) expect(sichtPersonen(bestand(), s)).toEqual(bestand().mandanten[0].personen);
  });
});

/* ==========================================================================
   SAMMLUNGEN (Commit 1e.2)
   ========================================================================== */
const MARKER = ["Migräne", "Psychotherapie", "Kind krank", "Reha", "IBAN", "geheim", "Scheidung",
  "interne Leitungsnotiz", "Korrekturgrund geheim", "fremde Nachricht", "darf-nicht-raus"];
const GEHEIM = "darf-nicht-raus";

function sammlungen() {
  const g = bestand();
  const m = g.mandanten[0];
  for (const x of m.personen) { x.iban = `IBAN-DE89-${x.id}`; x.notiz = `interne Leitungsnotiz-${x.id}`; }
  Object.assign(g, { tarife: [{ id: "t1", preis: 99 }], rechnungen: [{ id: "r1", betrag: 5 }], selbststarts: ["x"],
    betreiber: { name: "Betreiber GmbH" }, adressaenderungen: [{ alt: "a" }] });
  Object.assign(m, {
    abwesenheiten: [
      { id: "ab-s", personId: "s1", art: "krank", von: tag(1), bis: tag(2), notiz: "eigene Erkältung" },
      { id: "ab-a", personId: "a1", art: "krank", von: tag(1), bis: tag(2), notiz: "Migräne", geheimesZusatzfeld: GEHEIM },
      { id: "ab-b", personId: "b1", art: "krank", von: tag(1), bis: tag(2), notiz: "Psychotherapie" },
      { id: "ab-sp", personId: "sp1", art: "kindkrank", von: tag(1), bis: tag(2), notiz: "Kind krank" },
      { id: "ab-alt", personId: "alt1", art: "urlaub", von: tag(3), bis: tag(4), notiz: "Reha danach" }],
    anfragen: [
      { id: "an-s", personId: "s1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(20), bis: tag(21), text: "eigener Urlaub" },
      { id: "an-a", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(20), bis: tag(21), text: "Hochzeit", antwort: "" },
      { id: "an-b", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(20), bis: tag(21), text: "Scheidung", antwort: "intern" },
      { id: "t-b", personId: "b1", typ: "tausch", status: "offen", partnerId: null, von: tag(9), bis: tag(9), text: "tausche Früh", interessenten: ["a1"] }],
    erfassung: {
      [`s1|${tag(-2)}`]: { start: "06:00", ende: "14:00", bestaetigt: true, grund: "eigener Grund" },
      [`a1|${tag(-2)}`]: { start: "06:00", ende: "15:00", bestaetigt: true, grund: "Korrekturgrund geheim", geheimesZusatzfeld: GEHEIM },
      [`b1|${tag(-2)}`]: { start: "06:00", ende: "14:00", bestaetigt: true, grund: "fremd" } },
    einstempeln: {
      [`s1|${tag(-1)}`]: { start: "06:00", ortStart: "Am Einsatzort", innerhalbStart: true, geprueftStart: true },
      [`a1|${tag(-1)}`]: { start: "06:01", ortStart: "Abweichend, 4 km", innerhalbStart: false, geprueftStart: true } },
    wuensche: [{ id: "w-a", personId: "a1", datum: tag(5), art: "moechte", geheimesZusatzfeld: GEHEIM },
      { id: "w-b", personId: "b1", datum: tag(5), art: "moechte" }],
    einspruenge: [{ id: "e-a", personId: "a1", datum: tag(-3), dienstId: "F" }, { id: "e-sp", personId: "sp1", datum: tag(-3), dienstId: "F" },
      { id: "e-b", personId: "b1", datum: tag(-3), dienstId: "F" }],
    fahrzeiten: { [`a1|${tag(-1)}`]: { lenkzeit: 300 }, [`sp1|${tag(-1)}`]: { lenkzeit: 100 }, [`b1|${tag(-1)}`]: { lenkzeit: 200 } },
    checks: { [`s1|${tag(-1)}|F`]: { p1: { zeit: "x" } }, [`a1|${tag(-1)}|F`]: { p1: { zeit: "y", notiz: "Sturz Bewohner" } } },
    aenderungen: [{ id: "c-a", personId: "a1", datum: tag(1), von: "-", nach: "F", geheimesZusatzfeld: GEHEIM },
      { id: "c-b", personId: "b1", datum: tag(1), von: "-", nach: "F" }, { id: "c-0", personId: null, datum: tag(1), von: "-", nach: "Anfrage Telefon" }],
    nachrichten: [{ id: "n-a", personId: "a1", art: "info", titel: "fremde Nachricht" },
      { id: "n-s", personId: "s1", art: "info", titel: "an mich" }],
    notrufe: [{ id: "nr-a", personId: "a1", art: "medizin", empfaenger: [], bestaetigt: null },
      { id: "nr-b-an-mich", personId: "b1", art: "hilfe", empfaenger: ["s1"], bestaetigt: null },
      { id: "nr-b", personId: "b1", art: "bedrohung", empfaenger: ["l1"], bestaetigt: null }],
    selbstplanung: [{ id: "sp-r", monat: tag(40).slice(0, 7), status: "offen", eintraege: [
      { personId: "a1", datum: tag(40), dienstId: "F", zeit: "t" }, { personId: "b1", datum: tag(40), dienstId: "F", zeit: "u" }] }],
    urlaubsrunde: { jahr: 2027, phase: "offen", wuensche: [{ id: "uw-a", personId: "a1", von: "2027-07-01", bis: "2027-07-10" },
      { id: "uw-b", personId: "b1", von: "2027-07-01", bis: "2027-07-10" }], vorjahrZurueck: [] },
    kompetenzen: [{ id: "k1", name: "Medikamente", zugedacht: ["a1", "b1", "sp1"] }],
    einarbeitung: [{ id: "ea", personId: "a1", mentorId: "s1" }, { id: "eb", personId: "b1", mentorId: "x" }],
    betriebsmittel: [{ id: "bm0", name: "Schlüssel frei", personId: null }, { id: "bm-a", name: "Schlüssel A", personId: "a1" },
      { id: "bm-b", name: "Schlüssel B", personId: "b1" }],
    sondereinsaetze: [{ id: "se-a", zugeteilt: ["a1"], auftraggeber: "Stadt" }, { id: "se-b", zugeteilt: ["b1"], auftraggeber: "Messe" }],
    protokoll: [{ id: "l2", zeit: "2", text: "Lohn geändert für b1" }, { id: "l1", zeit: "1", text: "erster" }],
    adressAenderungen: [{ alt: "alt@x", neu: "neu@x" }],
    notizen: { [`tag|${tag(1)}`]: [{ id: "tn", text: "Tagesnotiz" }], "person|a1": [{ id: "pn", text: "interne Leitungsnotiz zur Person" }] },
    tarif: "pro", preisgestaltung: { sonder: 0 }, rabattGrund: "Freund", kontakt: "x@y", kontaktName: "Chef",
    anschrift: "Firmenweg 1", ustId: "DE123", notiz: "Betreibernotiz", seit: "2025-01-01", bis: "2027-01-01",
    testTage: 30, selbstAngelegt: false, raum: "raum-x", lohnarten: [{ id: "lz" }],
    standorte: [{ id: "st1", name: "Haupthaus", bundesland: "HE", lat: 50.1, lon: 8.6, radius: 150 }],
    dienstbuch: [{ id: "db1", text: "Übergabe" }], uebergaben: [{ id: "ue1", text: "Bewohner X" }],
    ausschreibungen: [{ id: "as1", datum: tag(7), dienstId: "F", status: "offen", bewerbungen: [{ personId: "b1", text: "gern" }] }],
    geheimeSammlung: [{ x: GEHEIM }],
    zyklus: { tage: ["F"] }, anker: "2026-01-05", freigaben: { "2026-11": { stand: 1 } }, matrix: { subplaner: ["plan.view.unit"] },
  });
  return g;
}
const sichtS = (g = sammlungen()) => bestandFuerRolle(g, SUB).mandanten[0];
const ids = (l) => (l || []).map((x) => x.id);

describe("Sammlungen: je Scope", () => {
  it("Katalog SCHICHT entscheidet jedes Betriebsfeld (dieselben Felder wie für Beschäftigte)", async () => {
    const { SCHICHT, BETRIEB } = await import("../server/lib/sicht.mjs");
    expect(Object.keys(SCHICHT).sort()).toEqual(Object.keys(BETRIEB).sort());
  });
  it("Abwesenheiten: eigene ganz, Bereich ohne Anmerkung, sonst nur „abwesend\"", () => {
    const a = sichtS().abwesenheiten;
    expect(a.find((x) => x.id === "ab-s").notiz).toBe("eigene Erkältung");
    expect(a.find((x) => x.id === "ab-a")).toEqual({ id: "ab-a", personId: "a1", art: "krank", von: tag(1), bis: tag(2) });
    expect(a.find((x) => x.id === "ab-b")).toEqual({ id: "ab-b", personId: "b1", von: tag(1), bis: tag(2), art: "abwesend" });
    expect(a.find((x) => x.id === "ab-sp").art).toBe("abwesend");
    expect(a.find((x) => x.id === "ab-alt")).toEqual({ id: "ab-alt", personId: "alt1", von: tag(3), bis: tag(4), art: "urlaub" });
  });
  it("Anträge: eigene und Bereich ganz, fremd nur offene Tauschgesuche maskiert", () => {
    const a = sichtS().anfragen;
    expect(ids(a)).toEqual(["an-s", "an-a", "t-b"]);
    expect(a.find((x) => x.id === "an-a").text).toBe("Hochzeit");
    expect(a.find((x) => x.id === "t-b").interessenten).toEqual(["verborgen-0"]);
  });
  it("Zeiterfassung: eigene ganz, Bereich ohne Grund (Positivliste), fremd weg", () => {
    const e = sichtS().erfassung;
    expect(e[`s1|${tag(-2)}`].grund).toBe("eigener Grund");
    expect(e[`a1|${tag(-2)}`]).toEqual({ start: "06:00", ende: "15:00", bestaetigt: true });
    expect(e[`b1|${tag(-2)}`]).toBeUndefined();
  });
  it("Stempelzeiten: nur die eigenen (kein Ortsurteil, keine Prüfdetails anderer)", () => {
    expect(Object.keys(sichtS().einstempeln)).toEqual([`s1|${tag(-1)}`]);
  });
  it("Wünsche Bereich (Positivliste), Einsprünge und Fahrzeiten Bereich und Pool, Checks nur eigene", () => {
    const m = sichtS();
    expect(m.wuensche).toEqual([{ id: "w-a", personId: "a1", datum: tag(5), art: "moechte" }]);
    expect(ids(m.einspruenge)).toEqual(["e-a", "e-sp"]);
    expect(Object.keys(m.fahrzeiten).sort()).toEqual([`a1|${tag(-1)}`, `sp1|${tag(-1)}`].sort());
    expect(Object.keys(m.checks)).toEqual([`s1|${tag(-1)}|F`]);
  });
  it("Änderungen: Bereich, Pool und ohne Person — bekannte Felder", () => {
    const c = sichtS().aenderungen;
    expect(ids(c)).toEqual(["c-a", "c-0"]);
    expect(c[0]).toEqual({ id: "c-a", personId: "a1", datum: tag(1), von: "-", nach: "F" });
  });
  it("Nachrichten: nur die eigenen", () => {
    expect(ids(sichtS().nachrichten)).toEqual(["n-s"]);
  });
  it("Notrufe: Bereich und an sie gerichtete, keine anderen", () => {
    expect(ids(sichtS().notrufe)).toEqual(["nr-a", "nr-b-an-mich"]);
  });
  it("Selbstplanung, Urlaubsrunde: Bereich mit Person, fremd ohne", () => {
    const m = sichtS();
    expect(m.selbstplanung[0].eintraege).toEqual([{ personId: "a1", datum: tag(40), dienstId: "F", zeit: "t" },
      { datum: tag(40), dienstId: "F" }]);
    expect(ids(m.urlaubsrunde.wuensche)).toEqual(["uw-a"]);
  });
  it("Kompetenzen, Einarbeitung, Betriebsmittel, Sondereinsätze: auf den Bereich gekürzt", () => {
    const m = sichtS();
    expect(m.kompetenzen[0].zugedacht).toEqual(["a1", "sp1"]);
    expect(ids(m.einarbeitung)).toEqual(["ea"]);
    expect(ids(m.betriebsmittel)).toEqual(["bm0", "bm-a"]);
    expect(ids(m.sondereinsaetze)).toEqual(["se-a"]);
  });
  it("Betriebsweit: Protokoll, Adressänderungen, Personennotizen und Kaufmännisches weg; Tagesnotizen bleiben", () => {
    const m = sichtS();
    expect(m.protokoll).toEqual([]);
    expect(m.adressAenderungen).toEqual([]);
    expect(Object.keys(m.notizen)).toEqual([`tag|${tag(1)}`]);
    for (const f of ["tarif", "preisgestaltung", "rabattGrund", "kontakt", "kontaktName", "anschrift", "ustId", "notiz",
      "seit", "bis", "testTage", "selbstAngelegt", "raum", "lohnarten"])
      expect(m[f] === undefined || (Array.isArray(m[f]) && m[f].length === 0), f).toBe(true);   // Listen bleiben leer stehen
  });
  it("Standorte ohne Koordinaten und Radius", () => {
    expect(sichtS().standorte).toEqual([{ id: "st1", name: "Haupthaus", bundesland: "HE" }]);
  });
  it("Plan und Regelwerk vollständig; Dienstbuch, Übergaben, Ausschreibungen vorerst unverändert (Schuld)", () => {
    const g = sammlungen(), m = sichtS(g), roh = g.mandanten[0];
    for (const f of ["einheiten", "dienstarten", "zyklus", "anker", "abweichungen", "freigaben", "matrix",
      "dienstbuch", "uebergaben", "ausschreibungen"])
      expect(m[f], f).toEqual(roh[f]);
  });
  it("Ganz oben nur Zähler, Sitzungsmarke und der eigene Betrieb", () => {
    expect(Object.keys(bestandFuerRolle(sammlungen(), SUB)).sort()).toEqual(["mandanten", "session", "stand", "version"]);
  });
  it("fail-closed: unbekannte Sammlung und unbekannte Felder in Einträgen gehen nicht hinaus", () => {
    const text = JSON.stringify(bestandFuerRolle(sammlungen(), SUB));
    expect(text).not.toContain(GEHEIM);
    expect(sichtS().geheimeSammlung).toBeUndefined();
  });
  it("Marker erscheinen nur im erlaubten Scope", () => {
    const text = JSON.stringify(bestandFuerRolle(sammlungen(), SUB));
    for (const s of ["Migräne", "Psychotherapie", "Kind krank", "Reha", "IBAN", "Scheidung", "interne Leitungsnotiz",
      "Korrekturgrund geheim", "fremde Nachricht", "Lohn geändert", "Betreibernotiz", "Firmenweg", "Sturz Bewohner",
      "Abweichend, 4 km", "Betreiber GmbH"])
      expect(text, s).not.toContain(s);
    /* „geheim" nur am eigenen Kalendergeheimnis */
    expect(text.match(/geheim/g)).toEqual(["geheim"]);
    expect(text).toContain("geheim-kal-s1");
  });
});

describe("Sammlungen: Rundweg, Rückfüllung, Angriffe", () => {
  function rundweg(aendern, g = sammlungen()) {
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB)));
    aendern(gelesen.mandanten[0], gelesen);
    return { g, e: zusammenfuehren(g, gelesen, SUB) };
  }
  it("gekürzte Sicht + Planänderung + Protokolleintrag zurück: angenommen, alles Verborgene unverändert", () => {
    const { g, e } = rundweg((m) => {
      m.abweichungen[`a1|${tag(6)}`] = "F";
      m.protokoll = [{ id: "l-neu", zeit: "x", text: "Plan geändert" }, ...(m.protokoll || [])];
    });
    expect(e.verweigert).toBeFalsy();
    const roh = g.mandanten[0], neu = e.mandanten[0];
    expect(neu.abweichungen[`a1|${tag(6)}`]).toBe("F");
    expect(neu.protokoll.map((l) => l.id)).toEqual(["l-neu", "l2", "l1"]);
    const ohne = (m) => { const { abweichungen, protokoll, ...rest } = m; return rest; };
    expect(ohne(neu)).toEqual(ohne(roh));                                     // jede verborgene Angabe wertgleich
    for (const f of ["tarife", "rechnungen", "selbststarts", "betreiber", "adressaenderungen"])
      expect(e[f], f).toEqual(g[f]);                                          // oben ebenso
    expect(bestandFuerRolle(e, LEITUNG).mandanten[0].erfassung).toEqual(roh.erfassung);
    const wieder = JSON.stringify(bestandFuerRolle(e, SUB));
    expect(wieder).not.toContain("Migräne");
    expect(wieder).not.toContain("Korrekturgrund geheim");
  });
  it("ohne Rückfüllung scheitert derselbe Rundweg — mit ihr nicht", () => {
    const g = sammlungen();
    const sicht = JSON.parse(JSON.stringify(bestandFuerRolle(g, SUB))).mandanten[0];
    sicht.abweichungen[`a1|${tag(6)}`] = "F";
    expect(einheitZusammen(g.mandanten[0], personenRueckfuellen(g.mandanten[0], sicht, SUB), SUB).ok).toBe(false);
    expect(zusammenfuehren(g, { ...bestandFuerRolle(g, SUB), mandanten: [sicht] }, SUB).verweigert).toBeFalsy();
  });
  it("Antrag im Bereich entscheiden und Krankmeldung im Bereich: angenommen", () => {
    const { g, e } = rundweg((m) => {
      m.anfragen.find((a) => a.id === "an-a").status = "genehmigt";
      m.abwesenheiten.push({ id: "k-neu", personId: "a1", art: "krank", von: tag(8), bis: tag(8) });
    });
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].anfragen.find((a) => a.id === "an-b")).toEqual(g.mandanten[0].anfragen.find((a) => a.id === "an-b"));
    expect(e.mandanten[0].abwesenheiten.find((a) => a.id === "ab-a").notiz).toBe("Migräne");
  });
  it("auf das fremde Tauschgesuch melden: angenommen, die Meldung der anderen bleibt", () => {
    const { e } = rundweg((m) => { m.anfragen.find((a) => a.id === "t-b").interessenten.push("s1"); });
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0].anfragen.find((a) => a.id === "t-b").interessenten).toEqual(["a1", "s1"]);
  });
  it("eigener Notruf mit Mitteilung an Planung und Leitung: angenommen", () => {
    const { e } = rundweg((m) => {
      m.notrufe.unshift({ id: "nr-s", personId: "s1", art: "hilfe", notiz: "", empfaenger: ["l1"], bestaetigt: null });
      m.nachrichten.unshift({ id: "n-not", personId: "l1", art: "einspringen", titel: "NOTRUF: Hilfe", ziel: "notruf" });
    });
    expect(e.verweigert).toBeFalsy();
    expect(ids(e.mandanten[0].notrufe)).toContain("nr-s");
    expect(ids(e.mandanten[0].nachrichten)).toContain("n-not");
  });
  const angriffe = {
    "verborgene Anmerkung einer Abwesenheit im Bereich setzen": (m) => { m.abwesenheiten.find((a) => a.id === "ab-a").notiz = "anders"; },
    "fremde Abwesenheit verändert einschleusen": (m) => { m.abwesenheiten.push({ id: "ab-b", personId: "b1", art: "urlaub", von: tag(1), bis: tag(2), notiz: "Psychotherapie" }); },
    "fremden Antrag verändert einschleusen": (m) => { m.anfragen.push({ id: "an-b", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "genehmigt", von: tag(20), bis: tag(21) }); },
    "Korrekturgrund im Bereich setzen": (m) => { m.erfassung[`a1|${tag(-2)}`].grund = "anders"; },
    "fremde Erfassung einschleusen": (m) => { m.erfassung[`b1|${tag(-2)}`] = { start: "00:00", ende: "23:59", bestaetigt: true }; },
    "fremde Nachricht verändert einschleusen": (m) => { m.nachrichten.push({ id: "n-a", personId: "a1", art: "info", titel: "geändert" }); },
    "Protokolleintrag verändert einschleusen": (m) => { m.protokoll = [{ id: "l2", zeit: "2", text: "gefälscht" }]; },
    "fremde Änderung einschleusen": (m) => { m.aenderungen.push({ id: "c-b", personId: "b1", datum: tag(1), von: "-", nach: "S" }); },
    "Kaufmännisches setzen": (m) => { m.preisgestaltung = { sonder: -100 }; },
    "Personennotiz einschleusen": (m) => { m.notizen["person|b1"] = [{ id: "x", text: "neu" }]; },
    "verborgene Standortkoordinaten setzen": (m) => { m.standorte[0].lat = 1; },
    "unbekannte Sammlung einschleusen": (m) => { m.geheimeSammlung = [{ x: "neu" }]; },
  };
  for (const [name, f] of Object.entries(angriffe)) {
    it(`${name}: abgewiesen`, () => {
      const { e } = rundweg(f);
      expect(e.verweigert, name).toBeTruthy();
    });
  }
  it("oben: Betreiberfelder setzen ist wirkungslos", () => {
    const { g, e } = rundweg((m, b) => { b.tarife = [{ id: "t1", preis: 0 }]; b.rechnungen = []; });
    expect(e.verweigert).toBeFalsy();
    expect(e.tarife).toEqual(g.tarife);
    expect(e.rechnungen).toEqual(g.rechnungen);
  });
});

describe("Sammlungen: Planung und Leitung unverändert", () => {
  it("bekommen den Betrieb vollständig", () => {
    for (const s of [LEITUNG, PLANER]) expect(bestandFuerRolle(sammlungen(), s).mandanten[0]).toEqual(sammlungen().mandanten[0]);
  });
  it("Leitung bekommt oben weiter alles außer dem Betreiberprotokoll (wie bisher)", () => {
    const b = bestandFuerRolle(sammlungen(), LEITUNG);
    expect(b.tarife).toEqual(sammlungen().tarife);
    expect(b.selbststarts).toEqual(["x"]);
  });
});
