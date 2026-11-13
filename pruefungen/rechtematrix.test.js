/* ==========================================================================
   RECHTEMATRIX — Lesesicht aller Rollen als Regression (Commit 1e.4)

   Ein Bestand, in dem jede Datenklasse einen eindeutigen Marker trägt —
   an einer Person eines anderen Bereichs (b1), damit für jede Rolle die
   „fremde" Sicht geprüft wird. Für jede Rolle und jeden Lesepfad steht
   in MATRIX, ob der Marker im Payload stehen darf. Die Dokumentation dazu
   ist RECHTEMATRIX.md; beide müssen zusammen geändert werden.

   Lesepfade: GET /api/bestand und die 409-Antwort von PUT /api/bestand
   (beide über bestandFuerRolle) sowie /api/vollausgabe (Leitung und
   Sicherungsschlüssel, über vollausgabeBetrieb).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { vollausgabeBetrieb } from "../server/lib/sicherungen.mjs";

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/* Die Person b1 (Bereich e2) trägt einen Marker je Datenklasse. */
const B1 = person("b1", "mitarbeiter", "e2", {
  telefon: "MK-TELEFON", anschrift: "MK-ANSCHRIFT", email: "mk-email@x.de",
  notfallkontakt: "MK-NOTFALL", iban: "MK-IBAN", steuerId: "MK-STEUER", lohn: "MK-LOHNBETRAG",
  nachtvorsorge: "MK-SCHUTZ-FREMD", qualifikationen: ["MK-QUAL"],
  rolleSeit: "MK-ROLLESEIT", kalenderGeheim: "MK-KALGEHEIM", kalenderVerweis: "MK-KALVERWEIS", pushSchluessel: { endpoint: "MK-PUSH" },
  zustellung: { planGeaendert: { mail: "MK-ZUSTELLUNG" } }, emailVorher: "MK-EMAILVORHER",
  unbekanntesPersonenfeld: "MK-UNBEKANNT-PERSON",
});
/* a1 im Bereich der Schichtverantwortung (e1): seit Commit S1 für sie nur
   abgeleitete Einsatzregeln, nicht das Schutzmerkmal selbst. */
const A1 = person("a1", "mitarbeiter", "e1", { nachtvorsorge: "MK-SCHUTZ-BEREICH" });

const bestand = () => ({
  version: 9, stand: 1, session: { personId: "MK-SESSION" },
  betreiber: { firma: "MK-BETREIBERSTAMM" }, tarife: [{ id: "t", name: "MK-PREISLISTE" }],
  rechnungen: [{ id: "MK-RECHNUNG-EIGEN", mandantId: "m1" }, { id: "MK-RECHNUNG-FREMD", mandantId: "m2" }],
  protokoll: [{ id: "bp", text: "MK-BETREIBERPROTOKOLL" }], selbststarts: [{ raum: "MK-SELBSTSTART" }],
  unbekanntOben: "MK-UNBEKANNT-OBEN",
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }], dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("m0", "mitarbeiter", "e1"), person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), A1, B1],
    abweichungen: { "b1|2026-12-01": "F" },
    erfassung: { "b1|2026-10-01": { start: "MK-ERFASSUNGSZEIT", ende: "14:00", bestaetigt: true, grund: "MK-ERFASSUNGSGRUND" },
      "r1|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "MK-ERFASSUNG-EIGEN-BR" } },
    einstempeln: { "b1|2026-10-01": { start: "06:00", ortStart: "MK-ORTSURTEIL", innerhalbStart: false },
      "r1|2026-10-01": { start: "06:00", ortStart: "MK-STEMPEL-EIGEN-BR" } },
    abwesenheiten: [{ id: "ab", personId: "b1", art: "krank", von: "2026-12-01", bis: "2026-12-02", notiz: "MK-ABWESENHEITSNOTIZ" }],
    anfragen: [{ id: "an", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-12-10", bis: "2026-12-11", text: "MK-ANTRAG" }],
    nachrichten: [{ id: "n", personId: "b1", art: "info", titel: "MK-NACHRICHT" }],
    notrufe: [{ id: "nr", personId: "b1", art: "medizin", notiz: "MK-NOTRUF", empfaenger: ["l1"], bestaetigt: null }],
    dienstbuch: [{ id: "db", text: "MK-DIENSTBUCH" }], uebergaben: [{ id: "ue", text: "MK-UEBERGABE" }],
    notizen: { "tag|2026-12-01": [{ id: "tn", text: "MK-TAGESNOTIZ" }], "person|b1": [{ id: "pn", text: "MK-PERSONENNOTIZ" }] },
    tagesnotizen: { "2026-12-01": "MK-TOTFELD" },
    vorgaben: [{ id: "v1", name: "Vorgabe", geltung: { art: "personen", personen: ["MK-VORGABE-PERSON"] } }],
    ausschreibungen: [{ id: "as", datum: "2026-12-05", dienstId: "F", status: "offen", bewerbungen: [{ personId: "b1", text: "MK-BEWERBUNG" }] }],
    protokoll: [{ id: "bl", text: "MK-BETRIEBSPROTOKOLL" }],
    adressAenderungen: [{ personId: "b1", von: "MK-ADRESSE-ALT", nach: "neu@x.de" }],
    preisgestaltung: { grund: "MK-KONDITION" }, ustId: "MK-USTID", notiz: "MK-BETREIBERNOTIZ", raum: "MK-RAUMKENNUNG",
    status: "aktiv", lohnarten: [{ id: "MK-LOHNART" }],
    unbekanntImBetrieb: "MK-UNBEKANNT-BETRIEB",
    session: { personId: "MK-BETRIEBSSESSION" },
  }, { id: "m2", name: "MK-FREMDBETRIEB", personen: [person("f1", "leitung", "ALLE", { iban: "MK-FREMD-IBAN" })] }],
});

const SITZ = {
  MA: { rolle: "mitarbeiter", person: "m0", betrieb: 0 },
  BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 },
  PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 },
  BT: { rolle: "betreiber", person: null, betrieb: 0 },
};
const PFADE = {
  ...Object.fromEntries(Object.entries(SITZ).map(([k, s]) => [k, () => bestandFuerRolle(bestand(), s)])),
  "VA-LT": () => vollausgabeBetrieb(bestand(), SITZ.LT).betrieb,
  "VA-SK": () => vollausgabeBetrieb(bestand(), { nurSicherung: true, mandantId: "m1" }).betrieb,
};
const SPALTEN = ["MA", "BR", "SV", "PL", "LT", "BT", "VA-LT", "VA-SK"];

/* 1 = darf im Payload stehen, 0 = darf nicht. Klasse: A sauber, B bewusst
   offen (eigener Schritt), C offen bis Bereichsbezug, S Schuld (rohe
   Schutzmerkmale). Commit 4: E-Mail als Kontaktangabe A, Push-Schlüssel und
   Zustelleinstellungen fremder Personen für Planung und Leitung entfernt. */
const MATRIX = [
  // Datenklasse                 Marker                      MA BR SV PL LT BT VL VS  Klasse
  ["Kontakt: Telefon",           "MK-TELEFON",               0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Kontakt: Anschrift",         "MK-ANSCHRIFT",             0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Kontakt: E-Mail",            "mk-email@x.de",            0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Notfallkontakt",             "MK-NOTFALL",               0, 0, 0, 0, 0, 0, 0, 1, "A"],
  ["Bank",                       "MK-IBAN",                  0, 0, 0, 0, 0, 0, 0, 1, "A"],
  ["Steuer",                     "MK-STEUER",                0, 0, 0, 0, 0, 0, 0, 1, "A"],
  ["Lohn",                       "MK-LOHNBETRAG",            0, 0, 0, 0, 0, 0, 0, 1, "A"],
  ["frühere Anmeldeadresse",     "MK-EMAILVORHER",           0, 0, 0, 0, 0, 0, 0, 1, "A"],
  ["Schutzmerkmal fremd",        "MK-SCHUTZ-FREMD",          0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Schutzmerkmal eig. Bereich", "MK-SCHUTZ-BEREICH",        0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* Commit D1: der Betreiber sieht je Person nur das Gerüst für die Abrechnung. */
  ["Personengerüst (Abrechnung)", "MK-ROLLESEIT",             0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Qualifikationen",            "MK-QUAL",                  1, 1, 1, 1, 1, 0, 1, 1, "A"],
  ["Kalendergeheimnis",          "MK-KALGEHEIM",             0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["Kalenderverweis",            "MK-KALVERWEIS",            0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["Push-Schlüssel",             "MK-PUSH",                  0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["Zustelleinstellungen",       "MK-ZUSTELLUNG",            0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["unbekanntes Personenfeld",   "MK-UNBEKANNT-PERSON",      0, 0, 0, 0, 0, 0, 0, 0, "A"],
  /* E1: fremde Ist-Zeiten auch nicht mehr für den Betriebsrat (vorher: Zeiten ohne Grund). */
  ["Zeiterfassung: Zeiten (fremd)", "MK-ERFASSUNGSZEIT",     0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Zeiterfassung: Grund",       "MK-ERFASSUNGSGRUND",       0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Stempel: Ortsurteil",        "MK-ORTSURTEIL",            0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* E1-Ausnahme (6bd706b, fachlich bestätigt 2026-11-02): Der Betriebsrat sieht die
     eigenen Stempelereignisse für die eigene Zeiterfassung — keine fremden, und
     auch die eigene Ist-Erfassung bleibt weg. */
  ["Stempel: eigener (Betriebsrat)", "MK-STEMPEL-EIGEN-BR",   0, 1, 0, 1, 1, 0, 1, 1, "A"],
  ["Zeiterfassung: eigene (Betriebsrat)", "MK-ERFASSUNG-EIGEN-BR", 0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Abwesenheit: Anmerkung",     "MK-ABWESENHEITSNOTIZ",     0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Antrag: Text",               "MK-ANTRAG",                0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Nachricht",                  "MK-NACHRICHT",             0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Notruf",                     "MK-NOTRUF",                0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* Commit C2: nur mit einheitId der eigenen Einheit (hier: ohne Einheit). */
  ["Dienstbuch",                 "MK-DIENSTBUCH",            0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Übergaben",                  "MK-UEBERGABE",             0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* Commit C3: nur mit einheitId der eigenen Einheit (hier: ohne Einheit). */
  ["Tagesnotizen",               "MK-TAGESNOTIZ",            0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["tagesnotizen (totes Feld)",  "MK-TOTFELD",               0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* WP-I4: interne Vorgaben liest nur org.edit (Leitung, Kundenrolle); Betriebsrat, Planung, Schichtverantwortung, Beschäftigte nichts. */
  ["Vorgabe: Person in der Geltung", "MK-VORGABE-PERSON",      0, 0, 0, 0, 1, 0, 1, 1, "A"],
  ["Personennotiz",              "MK-PERSONENNOTIZ",         0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* Commit C1: Bewerbungen fremder Personen nur bei einer Ausschreibung der
     eigenen Einheit (hier: Altbestand ohne einheitId — also nicht). */
  ["Ausschreibung: Bewerbung",   "MK-BEWERBUNG",             0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Betriebsprotokoll",          "MK-BETRIEBSPROTOKOLL",     0, 0, 0, 1, 1, 0, 1, 1, "A"],
  ["Adressänderungen im Betrieb","MK-ADRESSE-ALT",           0, 0, 0, 1, 1, 1, 1, 1, "B"],
  ["Lohnarten",                  "MK-LOHNART",               0, 0, 0, 1, 1, 0, 1, 1, "A"],
  /* B2: Leitung liest die Preisgrundlage des eigenen Betriebs (billing.view), Planung nicht; Betreiber laut D1-Katalog. */
  ["Billing: Konditionen",       "MK-KONDITION",             0, 0, 0, 0, 1, 1, 0, 0, "A"],
  ["Billing: USt-ID",            "MK-USTID",                 0, 0, 0, 0, 0, 1, 0, 0, "A"],
  /* D1a: Die Betriebsnotiz liest keine Oberfläche; sie geht auch an den Betreiber nicht mehr. */
  ["Betreiber: interne Notiz",   "MK-BETREIBERNOTIZ",        0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["Betreiber: Raumkennung",     "MK-RAUMKENNUNG",           0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Firmenstamm",     "MK-BETREIBERSTAMM",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Preisliste",      "MK-PREISLISTE",            0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Selbststarts",    "MK-SELBSTSTART",           0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Rechnung eigener Betrieb",   "MK-RECHNUNG-EIGEN",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Rechnung anderer Betrieb",   "MK-RECHNUNG-FREMD",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiberprotokoll",         "MK-BETREIBERPROTOKOLL",    0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["unbekanntes Betriebsfeld",   "MK-UNBEKANNT-BETRIEB",     0, 0, 0, 0, 0, 0, 0, 0, "A"],
  /* D1a fand es (Klasse D): session nahm PUT an und gab es allen Rollen außer dem Betreiber zurück.
     Seit D1b ist session kein Bestandsfeld mehr — für alle Rollen null. */
  ["session (Altbestand)",       "MK-SESSION",               0, 0, 0, 0, 0, 0, 0, 0, "A"],
  /* Bis D1c an alle Rollen des Betriebs (auch Vollausgabe); kein Schreiber, kein Zweck. */
  ["session am Betrieb (Altbestand)", "MK-BETRIEBSSESSION",   0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["unbekanntes Feld oben",      "MK-UNBEKANNT-OBEN",        0, 0, 0, 0, 0, 0, 0, 0, "A"],
  ["anderer Betrieb",            "MK-FREMDBETRIEB",          0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Personal anderer Betrieb",   "MK-FREMD-IBAN",            0, 0, 0, 0, 0, 0, 0, 0, "A"],
];

describe("Rechtematrix: jeder Marker je Rolle und Lesepfad", () => {
  const payload = Object.fromEntries(Object.entries(PFADE).map(([k, f]) => [k, JSON.stringify(f())]));
  for (const [klasse, marker, ...rest] of MATRIX) {
    const erwartet = rest.slice(0, SPALTEN.length);
    it(`${klasse} (${rest[SPALTEN.length]})`, () => {
      const ist = SPALTEN.map((s) => (payload[s].includes(marker) ? 1 : 0));
      expect(ist, `${marker}: ${SPALTEN.join(" ")}`).toEqual(erwartet);
    });
  }
  it("jeder Marker kommt im Bestand genau einmal vor (die Matrix prüft, was sie meint)", () => {
    const roh = JSON.stringify(bestand());
    for (const [, marker] of MATRIX) expect(roh.split(marker).length - 1, marker).toBe(1);
  });
});

describe("Rechtematrix: oberste Ebene und Mandantentrennung", () => {
  it("alle Rollen außer dem Betreiber: oben nur Zähler, Sitzungsmarke und genau der eigene Betrieb", () => {
    for (const k of ["MA", "BR", "SV", "PL", "LT"]) {
      const b = PFADE[k]();
      expect(Object.keys(b).sort(), k).toEqual(["mandanten", "session", "stand", "version"]);
      expect(b.mandanten.map((m) => m.id), k).toEqual(["m1"]);
    }
  });
  /* D1d: keine Spalte, keine Sicht — bis dahin der eigene Betrieb im Rohzustand. */
  it("unbekannte Rolle: kein Bestand, kein Marker", () => {
    for (const rolle of ["gast", "irgendwas", "", "Leitung"]) {
      const aus = bestandFuerRolle(bestand(), { rolle, person: "b1", betrieb: 0 });
      expect(aus, rolle).toBeNull();
    }
  });
  it("die Vollausgabe: nur der eigene Betrieb", () => {
    expect(PFADE["VA-LT"]().id).toBe("m1");
    expect(PFADE["VA-SK"]().id).toBe("m1");
  });
});

/* WP-23, Fußnote ²⁷: Die Sonde oben läuft ohne Planfreigabe (der Filter ist aus, altes Verhalten). Hier
   dieselbe Sonde mit eingeschalteter Pflicht und einem Entwurf weit in der Zukunft: Beschäftigte bekommen
   die Einteilungen eines nicht freigegebenen Monats nicht, alle anderen Rollen schon. */
describe("Rechtematrix: Entwurf bei eingeschalteter Planfreigabe (²⁷)", () => {
  const mitPflicht = () => {
    const b = bestand();
    const m = b.mandanten[0];
    m.einstellungen = { ...(m.einstellungen || {}), planFreigabePflicht: true };
    m.abweichungen = { ...m.abweichungen, "b1|2099-01-01": "MK-ENTWURF", "m0|2099-01-02": "MK-ENTWURF-EIGEN" };
    m.postenPlan = { "m0|2099-01-02": "MK-ENTWURF-POSTEN" };
    m.bereichsPlan = { "m0|2099-01-02": "MK-ENTWURF-BEREICH" };
    /* WP-23b: alle übrigen Sammlungen mit Datum — Entwurfstage 2099, ein vergangener Tag zur Gegenprobe. */
    m.ausschreibungen = [
      { id: "as-e", datum: "2099-01-03", dienstId: "F", status: "vergeben", bewerbungen: [], vergebenAn: "b1", vergebenZeit: "MK-VERGEBEN-FREMD" },
      { id: "as-m", datum: "2099-01-03", dienstId: "F", status: "vergeben", bewerbungen: [], vergebenAn: "m0", vergebenZeit: "MK-VERGEBEN-EIGEN" }];
    m.sondereinsaetze = [{ id: "se", datum: "2099-01-04", name: "Sonder",
      zugeteilt: [{ personId: "m0" }, { personId: "b1", marker: "MK-ZUGETEILT-FREMD" }] }];
    m.unterschreitungen = [
      { id: "u1", datum: "2099-01-05", dienstId: "F", grund: "MK-UNTERDECKUNG-ENTWURF" },
      { id: "u2", datum: "2020-01-05", dienstId: "F", grund: "MK-UNTERDECKUNG-VORBEI" }];
    m.einspruenge = [
      { id: "ei1", personId: "b1", datum: "2099-01-06", dienstId: "F", text: "MK-EINSPRUCH-FREMD" },
      { id: "ei2", personId: "m0", datum: "2099-01-06", dienstId: "F", text: "MK-EINSPRUCH-EIGEN" }];
    m.selbstplanung = [{ id: "sp", eintraege: [
      { personId: "b1", datum: "2099-01-07", dienstId: "F", zeit: "MK-SELBST-FREMD" },
      { personId: "m0", datum: "2099-01-07", dienstId: "F", zeit: "MK-SELBST-EIGEN" }] }];
    return b;
  };
  const ist = (marker) => Object.fromEntries(["MA", "BR", "SV", "PL", "LT"]
    .map((s) => [s, JSON.stringify(bestandFuerRolle(mitPflicht(), SITZ[s])).includes(marker) ? 1 : 0]));
  it("fremder Entwurf: nur BR, SV, Planung, Leitung", () => {
    expect(ist("MK-ENTWURF\"")).toMatchObject({ MA: 0, BR: 1, PL: 1, LT: 1 });
  });
  it("eigener Entwurf: Beschäftigte nicht einmal die eigene Einteilung", () => {
    expect(ist("MK-ENTWURF-EIGEN")).toMatchObject({ MA: 0, BR: 1, PL: 1, LT: 1 });
  });
  it("Posten- und Bereichsplan im Entwurf: Beschäftigte nicht, Betriebsrat nie (eigene Zeilen WEG)", () => {
    expect(ist("MK-ENTWURF-POSTEN")).toMatchObject({ MA: 0, BR: 0, PL: 1, LT: 1 });
    expect(ist("MK-ENTWURF-BEREICH")).toMatchObject({ MA: 0, BR: 0, PL: 1, LT: 1 });
  });
  /* WP-23b (M1): Wer die Schicht bekam, verriete die Einteilung eines Entwurfstags. */
  it("Ausschreibung am Entwurfstag: fremde Vergabe (Person, Zeit) nicht an Beschäftigte, die eigene schon", () => {
    expect(ist("MK-VERGEBEN-FREMD")).toMatchObject({ MA: 0, PL: 1, LT: 1 });
    expect(ist("MK-VERGEBEN-EIGEN")).toMatchObject({ MA: 1, PL: 1, LT: 1 });
    expect(JSON.stringify(bestandFuerRolle(mitPflicht(), SITZ.MA).mandanten[0].ausschreibungen)).not.toContain('"vergebenAn":"b1"');
  });
  /* N1: der eigene Sondereinsatz geht hinaus, die übrigen Zugeteilten nicht. */
  it("Sondereinsatz: nur die eigene Person unter zugeteilt (Fremde nie)", () => {
    expect(ist("MK-ZUGETEILT-FREMD")).toMatchObject({ MA: 0, PL: 1, LT: 1 });
    expect(bestandFuerRolle(mitPflicht(), SITZ.MA).mandanten[0].sondereinsaetze[0].zugeteilt).toEqual([{ personId: "m0" }]);
  });
  /* N3: dokumentierte Unterdeckung am Entwurfstag (freier Grund, kann Namen tragen). */
  it("Unterdeckung am Entwurfstag: nicht an Beschäftigte; vergangene schon; Betriebsrat unverändert (offene Entscheidung)", () => {
    expect(ist("MK-UNTERDECKUNG-ENTWURF")).toMatchObject({ MA: 0, BR: 1, PL: 1, LT: 1 });
    expect(ist("MK-UNTERDECKUNG-VORBEI")).toMatchObject({ MA: 1, BR: 1, PL: 1, LT: 1 });
  });
  /* Bewusst dokumentiert (wp23-nachweis.md): eigene Einsprüche und eigene Selbstplanung-Wünsche sind keine Planung
     und bleiben; fremde gehen nie hinaus (NUR_EIGENE bzw. Einträge fremder Personen ohne Person und Zeit). */
  it("Einsprüche und Selbstplanung: fremde nie, eigene bewusst auch an Entwurfstagen", () => {
    expect(ist("MK-EINSPRUCH-FREMD")).toMatchObject({ MA: 0, BR: 0 });
    expect(ist("MK-EINSPRUCH-EIGEN")).toMatchObject({ MA: 1, BR: 0 });
    expect(ist("MK-SELBST-FREMD")).toMatchObject({ MA: 0, BR: 0 });
    expect(ist("MK-SELBST-EIGEN")).toMatchObject({ MA: 1, BR: 0 });
  });
  it("ohne Pflicht und ohne Freigabe (Betrieb wie bisher) bleibt alles sichtbar", () => {
    const b = bestand();
    b.mandanten[0].abweichungen["m0|2099-01-02"] = "MK-ENTWURF-EIGEN";
    expect(JSON.stringify(bestandFuerRolle(b, SITZ.MA))).toContain("MK-ENTWURF-EIGEN");
  });
});
