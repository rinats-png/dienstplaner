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
  kalenderGeheim: "MK-KALGEHEIM", kalenderVerweis: "MK-KALVERWEIS", pushSchluessel: { endpoint: "MK-PUSH" },
  zustellung: { planGeaendert: { mail: "MK-ZUSTELLUNG" } }, emailVorher: "MK-EMAILVORHER",
  unbekanntesPersonenfeld: "MK-UNBEKANNT-PERSON",
});
/* a1 im Bereich der Schichtverantwortung (e1): Schutzmerkmal für sie roh (Schuld). */
const A1 = person("a1", "mitarbeiter", "e1", { nachtvorsorge: "MK-SCHUTZ-BEREICH" });

const bestand = () => ({
  version: 9, stand: 1, session: null,
  betreiber: { firma: "MK-BETREIBERSTAMM" }, tarife: [{ id: "t", name: "MK-PREISLISTE" }],
  rechnungen: [{ id: "MK-RECHNUNG-EIGEN", mandantId: "m1" }, { id: "MK-RECHNUNG-FREMD", mandantId: "m2" }],
  protokoll: [{ id: "bp", text: "MK-BETREIBERPROTOKOLL" }], selbststarts: [{ raum: "MK-SELBSTSTART" }],
  unbekanntOben: "MK-UNBEKANNT-OBEN",
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }], dienstarten: [{ id: "F", name: "Früh" }],
    personen: [person("m0", "mitarbeiter", "e1"), person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), A1, B1],
    abweichungen: { "b1|2026-12-01": "F" },
    erfassung: { "b1|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "MK-ERFASSUNGSGRUND" } },
    einstempeln: { "b1|2026-10-01": { start: "06:00", ortStart: "MK-ORTSURTEIL", innerhalbStart: false } },
    abwesenheiten: [{ id: "ab", personId: "b1", art: "krank", von: "2026-12-01", bis: "2026-12-02", notiz: "MK-ABWESENHEITSNOTIZ" }],
    anfragen: [{ id: "an", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-12-10", bis: "2026-12-11", text: "MK-ANTRAG" }],
    nachrichten: [{ id: "n", personId: "b1", art: "info", titel: "MK-NACHRICHT" }],
    notrufe: [{ id: "nr", personId: "b1", art: "medizin", notiz: "MK-NOTRUF", empfaenger: ["l1"], bestaetigt: null }],
    dienstbuch: [{ id: "db", text: "MK-DIENSTBUCH" }], uebergaben: [{ id: "ue", text: "MK-UEBERGABE" }],
    notizen: { "tag|2026-12-01": [{ id: "tn", text: "MK-TAGESNOTIZ" }], "person|b1": [{ id: "pn", text: "MK-PERSONENNOTIZ" }] },
    ausschreibungen: [{ id: "as", datum: "2026-12-05", dienstId: "F", status: "offen", bewerbungen: [{ personId: "b1", text: "MK-BEWERBUNG" }] }],
    protokoll: [{ id: "bl", text: "MK-BETRIEBSPROTOKOLL" }],
    adressAenderungen: [{ personId: "b1", von: "MK-ADRESSE-ALT", nach: "neu@x.de" }],
    preisgestaltung: { grund: "MK-KONDITION" }, ustId: "MK-USTID", notiz: "MK-BETREIBERNOTIZ", raum: "MK-RAUMKENNUNG",
    status: "aktiv", lohnarten: [{ id: "MK-LOHNART" }],
    unbekanntImBetrieb: "MK-UNBEKANNT-BETRIEB",
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
  ["Kontakt: Telefon",           "MK-TELEFON",               0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Kontakt: Anschrift",         "MK-ANSCHRIFT",             0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Kontakt: E-Mail",            "mk-email@x.de",            0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Notfallkontakt",             "MK-NOTFALL",               0, 0, 0, 0, 0, 1, 0, 1, "A"],
  ["Bank",                       "MK-IBAN",                  0, 0, 0, 0, 0, 1, 0, 1, "A"],
  ["Steuer",                     "MK-STEUER",                0, 0, 0, 0, 0, 1, 0, 1, "A"],
  ["Lohn",                       "MK-LOHNBETRAG",            0, 0, 0, 0, 0, 1, 0, 1, "A"],
  ["frühere Anmeldeadresse",     "MK-EMAILVORHER",           0, 0, 0, 0, 0, 1, 0, 1, "A"],
  ["Schutzmerkmal fremd",        "MK-SCHUTZ-FREMD",          0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Schutzmerkmal eig. Bereich", "MK-SCHUTZ-BEREICH",        0, 0, 1, 1, 1, 1, 1, 1, "S"],
  ["Qualifikationen",            "MK-QUAL",                  1, 1, 1, 1, 1, 1, 1, 1, "A"],
  ["Kalendergeheimnis",          "MK-KALGEHEIM",             0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Kalenderverweis",            "MK-KALVERWEIS",            0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Push-Schlüssel",             "MK-PUSH",                  0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Zustelleinstellungen",       "MK-ZUSTELLUNG",            0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["unbekanntes Personenfeld",   "MK-UNBEKANNT-PERSON",      0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Zeiterfassung: Grund",       "MK-ERFASSUNGSGRUND",       0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Stempel: Ortsurteil",        "MK-ORTSURTEIL",            0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Abwesenheit: Anmerkung",     "MK-ABWESENHEITSNOTIZ",     0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Antrag: Text",               "MK-ANTRAG",                0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Nachricht",                  "MK-NACHRICHT",             0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Notruf",                     "MK-NOTRUF",                0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Dienstbuch",                 "MK-DIENSTBUCH",            0, 0, 1, 1, 1, 1, 1, 1, "C"],
  ["Übergaben",                  "MK-UEBERGABE",             0, 0, 1, 1, 1, 1, 1, 1, "C"],
  ["Tagesnotizen",               "MK-TAGESNOTIZ",            0, 0, 1, 1, 1, 1, 1, 1, "C"],
  ["Personennotiz",              "MK-PERSONENNOTIZ",         0, 0, 0, 1, 1, 1, 1, 1, "A"],
  /* Commit C1: Bewerbungen fremder Personen nur bei einer Ausschreibung der
     eigenen Einheit (hier: Altbestand ohne einheitId — also nicht). */
  ["Ausschreibung: Bewerbung",   "MK-BEWERBUNG",             0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Betriebsprotokoll",          "MK-BETRIEBSPROTOKOLL",     0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Adressänderungen im Betrieb","MK-ADRESSE-ALT",           0, 0, 0, 1, 1, 1, 1, 1, "B"],
  ["Lohnarten",                  "MK-LOHNART",               0, 0, 0, 1, 1, 1, 1, 1, "A"],
  ["Billing: Konditionen",       "MK-KONDITION",             0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Billing: USt-ID",            "MK-USTID",                 0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: interne Notiz",   "MK-BETREIBERNOTIZ",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Raumkennung",     "MK-RAUMKENNUNG",           0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Firmenstamm",     "MK-BETREIBERSTAMM",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Preisliste",      "MK-PREISLISTE",            0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiber: Selbststarts",    "MK-SELBSTSTART",           0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Rechnung eigener Betrieb",   "MK-RECHNUNG-EIGEN",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Rechnung anderer Betrieb",   "MK-RECHNUNG-FREMD",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Betreiberprotokoll",         "MK-BETREIBERPROTOKOLL",    0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["unbekanntes Betriebsfeld",   "MK-UNBEKANNT-BETRIEB",     0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["unbekanntes Feld oben",      "MK-UNBEKANNT-OBEN",        0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["anderer Betrieb",            "MK-FREMDBETRIEB",          0, 0, 0, 0, 0, 1, 0, 0, "A"],
  ["Personal anderer Betrieb",   "MK-FREMD-IBAN",            0, 0, 0, 0, 0, 1, 0, 0, "A"],
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
  it("die Vollausgabe: nur der eigene Betrieb", () => {
    expect(PFADE["VA-LT"]().id).toBe("m1");
    expect(PFADE["VA-SK"]().id).toBe("m1");
  });
});
