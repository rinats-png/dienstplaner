/* ==========================================================================
   RECHTEMATRIX ↔ CODE, Zeile für Zeile aus dem Markdown (WP-43)

   pruefungen/rechtematrix.test.js führt eine eigene Tabelle von Markern.
   Diese Prüfung liest dagegen die Tabelle in Abschnitt 1 von RECHTEMATRIX.md
   selbst: Für jede Datenklassen-Zeile und jede Spalte (MA, BR, SV, PL, LT —
   dazu die Kundenrolle mit der Spalte LT —, BT, VA-LT, VA-SK) prüft sie die
   Antwort von bestandFuerRolle bzw. der Vollausgabe:

     ✓  → jede Sonde der Zeile findet ihren Wert im Payload,
     –  → keine,
     Text („abwesend", „nur eigene Einheit" …) → eine eigene Prüfung dieser
          Zeile für genau diesen Wortlaut.

   Eine neue Zeile ohne Prüfung, eine geänderte Zelle ohne passende Prüfung
   und eine Prüfung ohne Zeile machen den Test rot. Matrix und Test werden
   zusammen geändert. Hochgestellte Fußnotenziffern zählen nicht zum Wortlaut;
   die Fußnoten zum eigenen Bereich der Schichtverantwortung (¹ ³ ⁴ ⁵ ¹⁵) und
   zu Beschäftigten/Betriebsrat (² ¹⁴) prüft der zweite Block.

   Rot auf dem Stand vor WP-43: „Notfallkontakt" für PL, LT, Kunde und VA-LT
   (das Personenfeld `notfall` ging hinaus; siehe docs/acc45/wp43-nachweis.md).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { vollausgabeBetrieb } from "../server/lib/sicherungen.mjs";
import { PERSONENFELDER } from "../server/lib/sicht.mjs";
import { ABGELEITETE_PERSONENFELDER } from "../server/lib/planungsregeln.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);

/* ------------------------------------------------------------------------
   Die Matrix aus dem Markdown
   ------------------------------------------------------------------------ */
const MATRIX_DATEI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "RECHTEMATRIX.md");
const SPALTEN = ["MA", "BR", "SV", "PL", "LT", "BT", "VA-LT", "VA-SK"];
const HOCH = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/g;
const zelle = (roh) => roh.replace(HOCH, "").replace(/\s+/g, " ").replace(/ \)/g, ")").trim();

function matrixZeilen() {
  const text = fs.readFileSync(MATRIX_DATEI, "utf8");
  const abschnitt = text.split(/^## 1\./m)[1].split(/^## 2\./m)[0];
  const zeilen = abschnitt.split(/\r?\n/).filter((l) => l.startsWith("|"));
  const kopf = zeilen.findIndex((l) => /^\|\s*Datenklasse\s*\|/.test(l));
  if (kopf < 0) throw new Error("Tabellenkopf „Datenklasse“ nicht gefunden");
  const teile = (l) => l.trim().slice(1, -1).split(/(?<!\\)\|/).map((x) => x.trim().replace(/\\\|/g, "|"));
  const spalten = teile(zeilen[kopf]).slice(1, 1 + SPALTEN.length);
  if (JSON.stringify(spalten) !== JSON.stringify(SPALTEN)) throw new Error(`Spalten geändert: ${spalten.join(" ")}`);
  return zeilen.slice(kopf + 2).map((l) => {
    const t = teile(l);
    return { klasse: zelle(t[0]), zellen: Object.fromEntries(SPALTEN.map((s, i) => [s, zelle(t[i + 1] || "")])), einordnung: t[9] };
  });
}

/* ------------------------------------------------------------------------
   Ein Bestand, in dem jede Datenklasse eindeutige Marker trägt
   ------------------------------------------------------------------------ */
const M = (x) => `«${x}»`;
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", funktion: "Fachkraft", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/* b1 (Bereich e2) ist für jede Rolle eine fremde Person aus einem anderen Bereich. */
const B1 = () => person("b1", "mitarbeiter", "e2", {
  nachname: M("NACHNAME-B1"), funktion: M("FUNKTION-B1"), rolleSeit: M("ROLLESEIT-B1"), eintritt: M("EINTRITT-B1"),
  rolleVerlauf: [{ ab: "2020-01-01", rolle: M("ROLLEVERLAUF-B1") }],
  telefon: M("TELEFON-B1"), mobil: M("MOBIL-B1"), anschrift: M("ANSCHRIFT-B1"), email: `${M("EMAIL-B1")}@x.de`,
  notfallkontakt: M("NOTFALLKONTAKT-B1"), notfall: M("NOTFALL-B1"),
  iban: M("IBAN-B1"), steuerId: M("STEUER-B1"), sozialversicherung: M("SVNR-B1"), lohn: M("LOHN-B1"), gehalt: M("GEHALT-B1"),
  emailVorher: M("EMAILVORHER-B1"), emailGeaendert: M("EMAILGEAENDERT-B1"),
  mutterschutz: M("MUTTERSCHUTZ-B1"), schwerbehindert: M("SCHWERBEHINDERT-B1"), geburtstag: M("GEBURTSTAG-B1"),
  geburtsdatum: M("GEBURTSDATUM-B1"), nachtvorsorge: M("NACHTVORSORGE-B1"), schutz: M("SCHUTZ-B1"),
  mutterschutzEinwilligungen: [{ art: "nacht", ab: "2026-01-01", bis: null, geaendertVon: M("EINWILLIGUNG-B1") }],
  einschraenkungen: { wiedereingliederung: M("WIEDEREINGLIEDERUNG-B1") },
  qualifikationen: ["pfk", "masern"],
  kalenderGeheim: M("KALGEHEIM-B1"), kalenderVerweis: M("KALVERWEIS-B1"), kalenderStand: M("KALSTAND-B1"),
  pushSchluessel: { endpoint: M("PUSH-B1") }, zustellung: { planGeaendert: { mail: M("ZUSTELLUNG-B1") } },
  notiz: M("LEITUNGSNOTIZ-B1"), unbekanntesPersonenfeld: M("UNBEKANNT-PERSON"),
  /* Auflage B3: jedes übrige Feld aus PERSONENFELDER, damit jede Zuordnung geprüft wird. */
  vorname: M("VORNAME-B1"), imSchichtdienst: true, springer: false, teilzeit: false, wochenstunden: 38.5, anonym: false,
  austritt: M("AUSTRITT-B1"),
  qualNachweise: [{ qualId: "pfk", ablauf: "2030-01-01", datei: M("DATEI-B1") }, { qualId: "masern", vorhanden: true }],
  kompetenzNachweise: [{ id: M("KOMPETENZ-B1") }], verfuegbarkeit: { aktiv: M("VERFUEGBARKEIT-B1") },
  wunschfrei: [M("WUNSCHFREI-B1")], stundenuebertrag: M("STUNDEN-B1"), urlaubsanspruch: M("URLAUB-B1"),
  urlaubsuebertrag: M("URLAUBSUEBERTRAG-B1"), einarbeitung: { bis: M("EINARBEITUNG-B1") },
  notizen: [{ text: M("NOTIZEN-AN-B1") }], urlaubshinweis: M("URLAUBSHINWEIS-B1"), personalnummer: M("PERSONALNUMMER-B1"),
  zuschlaege: [{ art: M("ZUSCHLAG-B1") }], nachweise: [M("NACHWEISE-B1")], neuerZugang: M("NEUERZUGANG-B1"),
  anonymSeit: M("ANONYMSEIT-B1"),
  beschaeftigungsmodell: M("MODELL-B1"), stundenGrenzeMonat: M("MONATSGRENZE-B1"),
  ...Object.fromEntries(["weckzeit", "benachrichtigung", "thema", "dichte", "kontrastmodus", "feldmodus", "tour",
    "einfuehrung", "handbuch", "startansicht", "wenigerBewegung"].map((f) => [f, M(`EINSTELLUNG-${f}-B1`)])),
});
/* a1 im Bereich der Schichtverantwortung (e1): echte Schutzmerkmale, aus denen Einsatzregeln entstehen. */
const A1 = () => person("a1", "mitarbeiter", "e1", {
  telefon: M("TELEFON-A1"), mobil: M("MOBIL-A1"), anschrift: M("ANSCHRIFT-A1"), email: `${M("EMAIL-A1")}@x.de`,
  notfallkontakt: M("NOTFALL-A1"), iban: M("IBAN-A1"),
  stundenuebertrag: M("STUNDEN-A1"), verfuegbarkeit: { aktiv: M("VERFUEGBARKEIT-A1") },
  kompetenzNachweise: [{ id: M("KOMPETENZ-A1") }],
  qualNachweise: [{ qualId: "masern", vorhanden: true, datei: M("DATEI-A1") }],
  mutterschutz: true, schwerbehindert: true, geburtstag: "2010-07-17", nachtvorsorge: "2024-11-13",
  mutterschutzEinwilligungen: [{ art: "sonntag", ab: tag(-20), bis: tag(40) }],
  einschraenkungen: { keineNacht: true, wiedereingliederung: { von: tag(-5), bis: tag(30), stundenWoche: 20 } },
});

const bestand = () => ({
  version: 9, stand: 1, session: { personId: M("SESSION-OBEN") },
  betreiber: { firma: M("BETREIBERSTAMM") },
  tarife: [{ id: "tarif-eigen", name: M("PREISLISTE-EIGEN") }, { id: "tarif-andere", name: M("PREISLISTE-ANDERE") }],
  rechnungen: [{ id: M("RECHNUNG-EIGEN"), mandantId: "m1" }, { id: M("RECHNUNG-FREMD"), mandantId: "m2" }],
  protokoll: [{ id: "bp", zeit: "1", text: M("BETREIBERPROTOKOLL") }], selbststarts: [{ raum: M("SELBSTSTART") }],
  unbekanntOben: M("UNBEKANNT-OBEN"),
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }, { id: "pool", pool: true }],
    qualifikationen: [{ id: "pfk", name: "PFK" }, { id: "masern", name: "Masern", nurStatus: true }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("m0", "mitarbeiter", "e1"), person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("ku1", "kunde", "ALLE"),
      person("sp1", "mitarbeiter", "pool", { springer: true, telefon: M("TELEFON-SP1"),
        stundenuebertrag: M("STUNDEN-SP1"), verfuegbarkeit: { aktiv: M("VERFUEGBARKEIT-SP1") }, kompetenzNachweise: [{ id: M("KOMPETENZ-SP1") }] }), A1(), B1()],
    abweichungen: { [`b1|${tag(1)}`]: "F" },
    erfassung: {
      [`b1|${tag(-2)}`]: { start: M("ERF-ZEIT-B1"), ende: "14:00", bestaetigt: true, grund: M("ERF-GRUND-B1") },
      [`a1|${tag(-2)}`]: { start: M("ERF-ZEIT-A1"), ende: "14:00", bestaetigt: true, grund: M("ERF-GRUND-A1") },
      [`r1|${tag(-2)}`]: { start: M("ERF-ZEIT-R1"), ende: "14:00", bestaetigt: true },
    },
    einstempeln: {
      [`b1|${tag(-2)}`]: { start: "06:00", ortStart: M("ORTSURTEIL-B1"), geoStart: { status: M("GEO-B1") } },
      ...Object.fromEntries(["m0", "r1", "s1", "p1", "l1", "ku1"].map((id) => [`${id}|${tag(-1)}`,
        { start: "06:00", ortStart: M(`STEMPEL-EIGEN-${id}`) }])),
    },
    abwesenheiten: [
      { id: M("ABW-ID-B1"), personId: "b1", art: "krank", von: tag(1), bis: tag(2), notiz: M("ABW-NOTIZ-B1") },
      { id: M("ABW-URLAUB-ID-B1"), personId: "b1", art: "urlaub", von: tag(20), bis: tag(22), notiz: M("ABW-URLAUB-NOTIZ-B1") },
      { id: "ab-a1", personId: "a1", art: "krank", von: tag(1), bis: tag(2), notiz: M("ABW-NOTIZ-A1") },
      /* Review WP-11, F1: Arten aus src/abwesenheitsarten.js, die die SV im
         Bereich nicht im Klartext sehen darf. */
      ...["mutterschutz", "pflegezeit", "familienpflegezeit", "elternzeit", "arbeitsverhinderung", "berufsschule"]
        .map((art, i) => ({ id: `ab-a1-neu${i}`, personId: "a1", art, von: tag(3 + i), bis: tag(3 + i) }))],
    anfragen: [
      { id: "an-b1", personId: "b1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(10), bis: tag(11), text: M("ANTRAG-URLAUB-B1") },
      { id: "t-b1", personId: "b1", typ: "tausch", status: "offen", partnerId: null, von: tag(9), bis: tag(9), text: M("ANTRAG-TAUSCH-B1"), interessenten: [] },
      { id: "an-a1", personId: "a1", typ: "abwesenheit", art: "urlaub", status: "offen", von: tag(10), bis: tag(11), text: M("ANTRAG-URLAUB-A1") }],
    nachrichten: [{ id: "n", personId: "b1", art: "info", titel: M("NACHRICHT-B1") }],
    /* Selbstplanung mit Hinweisen (WP-10 d.3): b1 fremd, a1 im Bereich der SV. */
    selbstplanung: [{ id: "spr", monat: tag(1).slice(0, 7), status: "offen",
      /* Review K1: Gründe noch als Text gespeichert (Altbestand) und ein unbekanntes Kopffeld. */
      kopfGeheim: M("RUNDENKOPF-UNBEKANNT"),
      nichtUebernommen: [
        { personId: "b1", datum: tag(1), dienstId: "F", grund: M("NU-GRUND-B1") },
        { personId: "a1", datum: tag(1), dienstId: "F", grund: M("NU-GRUND-A1") },
        { personId: "m0", datum: tag(1), dienstId: "F", grund: M("NU-GRUND-M0") }],
      eintraege: [
      { personId: "b1", datum: tag(1), dienstId: "F", hinweise: [M("SP-HINWEIS-B1")] },
      { personId: "a1", datum: tag(1), dienstId: "F", hinweise: [M("SP-HINWEIS-A1")] }] }],
    /* Bestätigungsprotokoll (WP-10 d.1): b1 fremd, a1 im Bereich der SV. */
    bestaetigungen: [
      { id: "bs-b1", personId: "b1", datum: tag(1), dienstId: "F", aktion: "einsprung", stufe: "recht",
        befunde: [{ stufe: "recht", text: M("BEST-BEFUND-B1"), quelle: "§ 5 ArbZG" },
          { stufe: "recht", text: M("BEST-SCHUTZ-B1"), quelle: "Schutzvorschrift oder Einsatzregel für diese Person" }],
        grundArt: "sonstiges", grund: M("BEST-GRUND-B1"), ohneGrund: false, gelesen: true,
        durch: M("BEST-DURCH-B1"), durchId: "p1", rolle: "planer", zeit: "2026-01-01T00:00:00.000Z", regelstand: "x", behoben: null },
      { id: "bs-a1", personId: "a1", datum: tag(1), dienstId: "F", aktion: "einsprung", stufe: "achtung",
        befunde: [{ stufe: "achtung", text: M("BEST-BEFUND-A1"), quelle: "Teilzeitvereinbarung" }],
        grundArt: null, grund: "", ohneGrund: true, gelesen: true,
        durch: M("BEST-DURCH-A1"), durchId: "s1", rolle: "subplaner", zeit: "2026-01-01T00:00:00.000Z", regelstand: "x", behoben: null }],
    notrufe: [
      { id: "nr-b1", personId: "b1", datum: HEUTE, art: "medizin", notiz: M("NOTRUF-B1"), empfaenger: ["l1"], bestaetigt: null },
      { id: "nr-b1-sv", personId: "b1", datum: HEUTE, art: "hilfe", notiz: M("NOTRUF-AN-SV"), empfaenger: ["s1"], bestaetigt: null },
      { id: "nr-a1", personId: "a1", datum: HEUTE, art: "hilfe", notiz: M("NOTRUF-BEREICH"), empfaenger: [], bestaetigt: null }],
    dienstbuch: [{ id: "db1", einheitId: "e2", text: M("DIENSTBUCH-E2") }, { id: "db0", text: M("DIENSTBUCH-OHNE") },
      { id: "db2", einheitId: "e1", text: M("DIENSTBUCH-E1") }],
    uebergaben: [{ id: "ue1", einheitId: "e2", lage: M("UEBERGABE-E2") }, { id: "ue0", lage: M("UEBERGABE-OHNE") },
      { id: "ue2", einheitId: "e1", lage: M("UEBERGABE-E1") }],
    notizen: {
      [`tag|${tag(1)}`]: [{ id: "tn1", einheitId: "e2", text: M("TAGESNOTIZ-E2") }, { id: "tn0", text: M("TAGESNOTIZ-OHNE") },
        { id: "tn2", einheitId: "e1", text: M("TAGESNOTIZ-E1") }],
      "person|b1": [{ id: "pn", text: M("PERSONENNOTIZ-B1") }],
    },
    tagesnotizen: { [tag(1)]: M("TOTFELD") },
    ausschreibungen: [
      { id: "as0", datum: tag(5), dienstId: "F", status: "offen", hinweis: M("AUSSCHREIBUNG-KOPF"),
        bewerbungen: [{ personId: "b1", text: M("BEWERBUNG-FREMD") }, { personId: "m0", text: M("BEWERBUNG-EIGEN-MA") }] },
      { id: "as1", datum: tag(6), dienstId: "F", status: "offen", einheitId: "e1",
        bewerbungen: [{ personId: "b1", text: M("BEWERBUNG-E1") }] }],
    protokoll: [{ id: "bl", zeit: "2026-01-01", text: M("BETRIEBSPROTOKOLL") }],
    adressAenderungen: [{ personId: "b1", zeit: "1", von: M("ADRESSE-ALT"), nach: M("ADRESSE-NEU") }],
    lohnarten: [{ id: M("LOHNART") }],
    tarif: "tarif-eigen", preisgestaltung: { grund: M("KONDITION") }, rabattGrund: M("RABATTGRUND"),
    ustId: M("USTID"), kontakt: M("KONTAKT"), kontaktName: M("KONTAKTNAME"), anschrift: M("FIRMENANSCHRIFT"),
    notiz: M("BETRIEBSNOTIZ"), raum: M("RAUMKENNUNG"), status: "aktiv",
    unbekanntImBetrieb: M("UNBEKANNT-BETRIEB"),
    session: { personId: M("SESSION-BETRIEB") },
  }, { id: "m2", name: M("FREMDBETRIEB"),
    personen: [person("f1", "leitung", "ALLE", { nachname: M("FREMD-NACHNAME"), iban: M("FREMD-IBAN") })] }],
});

/* ------------------------------------------------------------------------
   Die Lesepfade
   ------------------------------------------------------------------------ */
const SITZ = {
  MA: { rolle: "mitarbeiter", person: "m0", betrieb: 0 },
  BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 },
  PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 },
  KU: { rolle: "kunde", person: "ku1", betrieb: 0 },
  BT: { rolle: "betreiber", person: null, betrieb: 0 },
};
const PFADE = {
  ...Object.fromEntries(Object.entries(SITZ).map(([k, s]) => [k, () => bestandFuerRolle(bestand(), s)])),
  "VA-LT": () => vollausgabeBetrieb(bestand(), SITZ.LT).betrieb,
  "VA-SK": () => vollausgabeBetrieb(bestand(), { nurSicherung: true, mandantId: "m1" }).betrieb,
};
/* Die Kundenrolle liest wie die Leitung (Spalte LT, „ebenso Kundenrolle"). */
const PRUEFSPALTEN = [...SPALTEN.slice(0, 5), "KU", ...SPALTEN.slice(5)];
const matrixSpalte = (s) => (s === "KU" ? "LT" : s);

const sichten = Object.fromEntries(Object.entries(PFADE).map(([k, f]) => {
  const v = f();
  const betrieb = v && Array.isArray(v.mandanten) ? v.mandanten.find((m) => m && m.id === "m1") || null : v;
  return [k, { json: JSON.stringify(v), betrieb }];
}));
const hat = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const personIn = (b, id) => (b && Array.isArray(b.personen) ? b.personen.find((p) => p && p.id === id) : null);

/* Sonden: (Sicht) → steht der Wert im Payload? Jeder Marker wird vermerkt;
   am Ende prüft ein Test, dass er im Testbestand wirklich steht — sonst wäre
   „fehlt im Payload" trivial wahr. */
const MARKER = new Set();
const mk = (x) => { MARKER.add(x); return Object.assign((s) => s.json.includes(M(x)), { titel: x }); };
const feld = (pid, f) => Object.assign((s) => hat(personIn(s.betrieb, pid), f), { titel: `${pid}.${f}` });
const wiedereingliederung = (pid) => Object.assign((s) => {
  const p = personIn(s.betrieb, pid);
  return !!p && hat(p.einschraenkungen, "wiedereingliederung");
}, { titel: `${pid}.einschraenkungen.wiedereingliederung` });

const alle = (sonden, s) => sonden.map((f) => [f.titel, f(s)]);
const erwarte = (sonden, s, soll, info) => {
  for (const [name, ist] of alle(sonden, s)) expect(ist, `${info}: ${name}`).toBe(soll);
};

/* ------------------------------------------------------------------------
   Je Zeile der Matrix: die Sonden und, für Zellen mit Text, die Prüfung
   genau dieses Wortlauts. Schlüssel ist der Wortlaut der ersten Spalte.
   ------------------------------------------------------------------------ */
const EIGENE_STEMPEL = { MA: "m0", BR: "r1", SV: "s1", PL: "p1", LT: "l1", KU: "ku1" };
const ZEILEN = {
  "Personendaten für den Plan (Name, Zugehörigkeit, Rolle, Qualifikationen …)": {
    sonden: [mk("NACHNAME-B1"), mk("FUNKTION-B1")] },
  "Personengerüst für die Betreiberabrechnung (Rolle auch im Verlauf, Status, Ein-/Austritt, Zugehörigkeit)": {
    sonden: [mk("ROLLESEIT-B1"), mk("ROLLEVERLAUF-B1"), mk("EINTRITT-B1")],
    /* ¹⁶: Rolle, Status, Ein-/Austritt, Zugehörigkeit ja — Rollenverlauf nicht (fachlich offen). */
    bedingt: { "ohne Rollenverlauf": (s) => {
      expect(mk("EINTRITT-B1")(s), "Eintritt").toBe(true);
      const b1 = personIn(s.betrieb, "b1");
      for (const f of ["id", "rolle", "status", "eintritt", "austritt", "zugehoerigkeit"]) expect(hat(b1, f), f).toBe(true);
      for (const f of ["rolleSeit", "rolleVerlauf"]) expect(hat(b1, f), f).toBe(false);
      expect(mk("ROLLESEIT-B1")(s), "rolleSeit").toBe(false);
      expect(mk("ROLLEVERLAUF-B1")(s), "rolleVerlauf").toBe(false);
    } } },
  "Kontakt: Telefon, Anschrift": { sonden: [mk("TELEFON-B1"), mk("MOBIL-B1"), mk("ANSCHRIFT-B1")] },
  "Kontakt: E-Mail (Kontaktangabe für Planung und Leitung)": { sonden: [mk("EMAIL-B1")] },
  "Notfallkontakt": { sonden: [mk("NOTFALLKONTAKT-B1"), mk("NOTFALL-B1")] },
  "Bank, Steuer, Sozialversicherung, Lohn/Gehalt": {
    sonden: [mk("IBAN-B1"), mk("STEUER-B1"), mk("SVNR-B1"), mk("LOHN-B1"), mk("GEHALT-B1")] },
  "frühere Anmeldeadresse": { sonden: [mk("EMAILVORHER-B1"), mk("EMAILGEAENDERT-B1")] },
  "Gesundheits-/Schutzmerkmale (fremder Bereich)": {
    sonden: [mk("MUTTERSCHUTZ-B1"), mk("SCHWERBEHINDERT-B1"), mk("GEBURTSTAG-B1"), mk("GEBURTSDATUM-B1"),
      mk("NACHTVORSORGE-B1"), mk("SCHUTZ-B1"), mk("WIEDEREINGLIEDERUNG-B1"), mk("EINWILLIGUNG-B1")] },
  "Gesundheits-/Schutzmerkmale (eigener Bereich der SV)": {
    sonden: [feld("a1", "mutterschutz"), feld("a1", "schwerbehindert"), feld("a1", "geburtstag"),
      feld("a1", "nachtvorsorge"), wiedereingliederung("a1")],
    bedingt: { "nur abgeleitete Einsatzregeln": (s, z) => {
      erwarte(z.sonden, s, false, "Schutzmerkmal");
      const a1 = personIn(s.betrieb, "a1");
      expect(a1.planungsregeln, "planungsregeln").toBeDefined();
      expect(JSON.stringify(a1.planungsregeln)).not.toMatch(/mutterschutz|schwerbehind|wiedereingliederung/i);
    } } },
  "Qualifikationen": {
    sonden: [Object.assign((s) => { const p = personIn(s.betrieb, "b1"); return !!p && (p.qualifikationen || []).includes("pfk"); },
      { titel: "b1.qualifikationen pfk" })] },
  "Qualifikationsnachweise (`qualNachweise`: Datei, Status-Nachweise)": {
    sonden: [mk("DATEI-B1")],
    bedingt: { "nur Qualifikation und Ablauf": (s) => {
      expect(personIn(s.betrieb, "b1").qualNachweise).toEqual([{ qualId: "pfk", ablauf: "2030-01-01" }]);
      expect(mk("DATEI-B1")(s), "Datei").toBe(false);
    } } },
  "Kompetenznachweise (`kompetenzNachweise`)": { sonden: [mk("KOMPETENZ-B1")] },
  "Zuständigkeitsbereich, Verfügbarkeit, operative Einschränkungen (`bereich`, `verfuegbarkeit`, `einschraenkungen` ohne Wiedereingliederung)": {
    sonden: [mk("VERFUEGBARKEIT-B1")] },
  "Konten, Wünsche, Einarbeitung (`stundenuebertrag`, `urlaubsanspruch`, `urlaubsuebertrag`, `wunschfrei`, `einarbeitung`)": {
    sonden: [mk("STUNDEN-B1"), mk("URLAUB-B1"), mk("URLAUBSUEBERTRAG-B1"), mk("WUNSCHFREI-B1"), mk("EINARBEITUNG-B1")] },
  "Beschäftigungsmodell und Monatsstundengrenze (`beschaeftigungsmodell`, `stundenGrenzeMonat`)": {
    sonden: [mk("MODELL-B1"), mk("MONATSGRENZE-B1")] },
  "Personalnummer (`personalnummer`, Lohnexport)": { sonden: [mk("PERSONALNUMMER-B1")] },
  "Zuschläge an der Person (`zuschlaege`) — fachliche Entscheidung offen (Lohnbestandteil?)": { sonden: [mk("ZUSCHLAG-B1")] },
  "Verwaltungsangaben zur Person (`nachweise`, `urlaubshinweis`, `neuerZugang`, `anonymSeit`)": {
    sonden: [mk("NACHWEISE-B1"), mk("URLAUBSHINWEIS-B1"), mk("NEUERZUGANG-B1"), mk("ANONYMSEIT-B1")] },
  "Einstellungen der Anwendung an der Person (`weckzeit`, `benachrichtigung`, `thema`, `dichte`, `kontrastmodus`, `feldmodus`, `tour`, `einfuehrung`, `handbuch`, `startansicht`, `wenigerBewegung`)": {
    sonden: [mk("EINSTELLUNG-weckzeit-B1"), mk("EINSTELLUNG-wenigerBewegung-B1")] },
  "Zeiterfassung (fremd; Grund)": { sonden: [mk("ERF-ZEIT-B1"), mk("ERF-GRUND-B1")] },
  "Stempeldaten, Ortsurteil (seit Geo V1 `geoStart`/`geoEnde`: Status, gerundete Entfernung, Genauigkeit, Referenzstandort; nie Koordinaten)": {
    sonden: [mk("ORTSURTEIL-B1"), mk("GEO-B1")] },
  "Stempeldaten der eigenen Person (für die eigene Zeiterfassung)": {
    sondenFuer: (spalte) => (EIGENE_STEMPEL[spalte] ? [mk(`STEMPEL-EIGEN-${EIGENE_STEMPEL[spalte]}`)]
      : Object.values(EIGENE_STEMPEL).map((id) => mk(`STEMPEL-EIGEN-${id}`))) },
  "Abwesenheiten mit Anmerkung": {
    sonden: [mk("ABW-ID-B1"), mk("ABW-NOTIZ-B1"), mk("ABW-URLAUB-ID-B1"), mk("ABW-URLAUB-NOTIZ-B1")],
    /* Auflage B2: Krankheit und jede andere Kategorie werden zu „abwesend";
       Urlaub und frei bleiben als solche lesbar (bisheriger Stand, sicht.mjs
       abwesenheiten). Keine Anmerkung. */
    bedingt: { "„abwesend\" (Urlaub/frei offen)": (s) => {
      expect(mk("ABW-NOTIZ-B1")(s), "Anmerkung").toBe(false);
      expect(mk("ABW-URLAUB-NOTIZ-B1")(s), "Anmerkung zum Urlaub").toBe(false);
      const art = (id) => ((s.betrieb.abwesenheiten || []).find((x) => x.id === M(id)) || {}).art;
      expect(art("ABW-ID-B1"), "krank").toBe("abwesend");
      expect(art("ABW-URLAUB-ID-B1"), "urlaub").toBe("urlaub");
      /* F1: auch im eigenen Bereich der SV keine neuen Arten im Klartext. */
      for (const [i, x] of ["mutterschutz", "pflegezeit", "familienpflegezeit", "elternzeit", "arbeitsverhinderung", "berufsschule"].entries()) {
        const e = (s.betrieb.abwesenheiten || []).find((y) => y.id === `ab-a1-neu${i}`);
        expect(e && e.art, x).toBe("abwesend");
      }
      expect(JSON.stringify(s.betrieb.abwesenheiten)).not.toMatch(/mutterschutz|pflegezeit|elternzeit|arbeitsverhinderung|berufsschule/);
    } } },
  "Anträge (fremd)": {
    sonden: [mk("ANTRAG-URLAUB-B1"), mk("ANTRAG-TAUSCH-B1")],
    bedingt: { "nur offene Tauschgesuche": (s) => {
      expect(mk("ANTRAG-URLAUB-B1")(s), "Urlaubsantrag").toBe(false);
      expect(mk("ANTRAG-TAUSCH-B1")(s), "offenes Tauschgesuch").toBe(true);
    } } },
  "Nachrichten anderer": { sonden: [mk("NACHRICHT-B1")] },
  "Notrufe anderer": {
    sonden: [mk("NOTRUF-B1"), mk("NOTRUF-AN-SV"), mk("NOTRUF-BEREICH")],
    bedingt: { "nur Bereich und an sie": (s) => {
      expect(mk("NOTRUF-B1")(s), "fremder Notruf").toBe(false);
      expect(mk("NOTRUF-AN-SV")(s), "an sie gerichtet").toBe(true);
      expect(mk("NOTRUF-BEREICH")(s), "aus dem Bereich").toBe(true);
    } } },
  "Dienstbuch": einheitZeile("DIENSTBUCH"),
  "Übergaben": einheitZeile("UEBERGABE"),
  "Tagesnotizen (`notizen` „tag|…\")": einheitZeile("TAGESNOTIZ"),
  "`tagesnotizen` (totes Feld, keine Ansicht)": { sonden: [mk("TOTFELD")] },
  "Personennotizen (`notizen` „person|…\"; Notiz der Leitung `notiz` an der Person)": {
    sonden: [mk("PERSONENNOTIZ-B1"), mk("LEITUNGSNOTIZ-B1"), mk("NOTIZEN-AN-B1")] },
  "Ausschreibungen: Kopf (Tag, Dienst, Status, verantwortende Einheit)": { sonden: [mk("AUSSCHREIBUNG-KOPF")] },
  "Ausschreibungen: Bewerbungen anderer": {
    sonden: [mk("BEWERBUNG-FREMD"), mk("BEWERBUNG-E1")],
    bedingt: {
      "nur eigene": (s) => {
        expect(mk("BEWERBUNG-FREMD")(s)).toBe(false);
        expect(mk("BEWERBUNG-E1")(s)).toBe(false);
        expect(mk("BEWERBUNG-EIGEN-MA")(s), "eigene Bewerbung").toBe(true);
      },
      "nur bei Ausschreibung der eigenen Einheit": (s) => {
        expect(mk("BEWERBUNG-FREMD")(s), "Ausschreibung ohne Einheit").toBe(false);
        expect(mk("BEWERBUNG-E1")(s), "Ausschreibung der eigenen Einheit").toBe(true);
      },
    } },
  "Selbstplanung: Einträge anderer samt `hinweise`": {
    sonden: [mk("SP-HINWEIS-B1"), mk("SP-HINWEIS-A1")],
    bedingt: {
      "nur Tag und Dienst": (s) => {
        const e = (s.betrieb.selbstplanung || [])[0].eintraege;
        expect(e).toHaveLength(2);
        for (const x of e) expect(Object.keys(x).sort()).toEqual(["datum", "dienstId"]);
      },
      "nur eigener Bereich am Tag": (s) => {
        expect(mk("SP-HINWEIS-A1")(s), "Bereich").toBe(true);
        expect(mk("SP-HINWEIS-B1")(s), "fremd").toBe(false);
        const fremd = (s.betrieb.selbstplanung || [])[0].eintraege.find((x) => !x.personId);
        expect(Object.keys(fremd).sort()).toEqual(["datum", "dienstId"]);
      },
    } },
  "Selbstplanung: nicht übernommene Einträge (`nichtUebernommen`) und unbekannte Felder am Rundenkopf": {
    sonden: [mk("NU-GRUND-B1"), mk("NU-GRUND-A1"), mk("NU-GRUND-M0"), mk("RUNDENKOPF-UNBEKANNT")],
    bedingt: {
      "nur eigene": (s) => {
        const r = (s.betrieb.selbstplanung || [])[0];
        expect(r.nichtUebernommen).toEqual([{ personId: "m0", datum: tag(1), dienstId: "F", grund: "befund" }]);
        for (const x of ["NU-GRUND-B1", "NU-GRUND-A1", "NU-GRUND-M0", "RUNDENKOPF-UNBEKANNT"]) expect(mk(x)(s), x).toBe(false);
      },
      "nur eigener Bereich am Tag": (s) => {
        const r = (s.betrieb.selbstplanung || [])[0];
        /* a1 und m0 gehören zum Bereich e1, b1 nicht. */
        expect(r.nichtUebernommen).toEqual([{ personId: "a1", datum: tag(1), dienstId: "F", grund: "befund" },
          { personId: "m0", datum: tag(1), dienstId: "F", grund: "befund" }]);
        for (const x of ["NU-GRUND-B1", "NU-GRUND-A1", "NU-GRUND-M0", "RUNDENKOPF-UNBEKANNT"]) expect(mk(x)(s), x).toBe(false);
      },
    } },
  "Bestätigungsprotokoll (`bestaetigungen`: bewusst bestätigte Abweichungen)": {
    sonden: [mk("BEST-BEFUND-B1"), mk("BEST-SCHUTZ-B1"), mk("BEST-GRUND-B1"), mk("BEST-DURCH-B1"),
      mk("BEST-BEFUND-A1"), mk("BEST-DURCH-A1")],
    bedingt: {
      "nur Zählwerte je Monat, Regel und Stufe": (s) => {
        /* Nachprüfung WP-10 (M1-Rest): keine Einträge — nur Zählwerte, unter 3
           als „<3“; keine Kennung, keine Aktion, keine Rolle, kein Wortlaut. */
        const monat = tag(1).slice(0, 7);
        expect(s.betrieb.bestaetigungen).toEqual([
          { monat, regel: "schutz", stufe: "recht", anzahl: "<3" },
          { monat, regel: "sonstiges", stufe: "achtung", anzahl: "<3" },
          { monat, regel: "sonstiges", stufe: "recht", anzahl: "<3" }]);
        for (const x of ["BEST-DURCH-B1", "BEST-DURCH-A1", "BEST-GRUND-B1", "BEST-BEFUND-B1", "BEST-BEFUND-A1", "BEST-SCHUTZ-B1"])
          expect(mk(x)(s), x).toBe(false);
      },
      "nur eigener Bereich am Tag": (s) => {
        expect((s.betrieb.bestaetigungen || []).map((b) => b.id)).toEqual(["bs-a1"]);
        expect(mk("BEST-BEFUND-A1")(s), "Bereich").toBe(true);
        expect(mk("BEST-DURCH-A1")(s), "Bereich").toBe(true);
        for (const x of ["BEST-BEFUND-B1", "BEST-SCHUTZ-B1", "BEST-GRUND-B1", "BEST-DURCH-B1"])
          expect(mk(x)(s), `fremd: ${x}`).toBe(false);
      },
    } },
  "Kalendergeheimnis, -verweis, -stand": { sonden: [mk("KALGEHEIM-B1"), mk("KALVERWEIS-B1"), mk("KALSTAND-B1")] },
  "Push-Schlüssel, Zustelleinstellungen": { sonden: [mk("PUSH-B1"), mk("ZUSTELLUNG-B1")] },
  "Adressänderungen im Betrieb": { sonden: [mk("ADRESSE-ALT"), mk("ADRESSE-NEU")] },
  "Lohnarten": { sonden: [mk("LOHNART")] },
  "Betriebsprotokoll": { sonden: [mk("BETRIEBSPROTOKOLL")] },
  "Billing: Preisgrundlage des eigenen Betriebs (`tarif`, `preisgestaltung`, `rabattGrund`; oben nur der eigene Tarifeintrag) — nur lesend, für die Kostenanzeige (B2)": {
    sonden: [mk("KONDITION"), mk("RABATTGRUND"), mk("PREISLISTE-EIGEN"),
      Object.assign((s) => hat(s.betrieb, "tarif"), { titel: "tarif" })] },
  "Billing: übriger Vertrag, Rechnungsangaben, USt-ID": {
    sonden: [mk("USTID"), mk("KONTAKT"), mk("KONTAKTNAME"), mk("FIRMENANSCHRIFT")] },
  "Betreiberfelder: Raumkennung, Firmenstamm, Preisliste, Selbststarts": {
    sonden: [mk("RAUMKENNUNG"), mk("BETREIBERSTAMM"), mk("PREISLISTE-ANDERE"), mk("SELBSTSTART")] },
  "Betriebsnotiz `notiz` (keine Oberfläche liest sie)": { sonden: [mk("BETRIEBSNOTIZ")] },
  "`session` ganz oben im Bestand — Legacy-Feld, kein Bestandsfeld mehr": { sonden: [mk("SESSION-OBEN")] },
  "`session` am Betrieb (`mandanten[].session`) — Legacy-Feld, kein Bestandsfeld mehr": { sonden: [mk("SESSION-BETRIEB")] },
  "Rechnungen (eigener und anderer Betriebe)": { sonden: [mk("RECHNUNG-EIGEN"), mk("RECHNUNG-FREMD")] },
  "Betreiberprotokoll": { sonden: [mk("BETREIBERPROTOKOLL")] },
  "andere Betriebe des Raums": {
    sonden: [mk("FREMDBETRIEB")],
    bedingt: { "✓ (gekürzt)": (s) => {
      expect(mk("FREMDBETRIEB")(s), "anderer Betrieb").toBe(true);
      expect(mk("FREMD-IBAN")(s), "Bankdaten im anderen Betrieb").toBe(false);
      expect(mk("FREMD-NACHNAME")(s), "Namen im anderen Betrieb").toBe(false);
    } } },
  "unbekannte neue Felder (Person, Betrieb, oben)": {
    sonden: [mk("UNBEKANNT-PERSON"), mk("UNBEKANNT-BETRIEB"), mk("UNBEKANNT-OBEN")] },
};
/* Dienstbuch, Übergaben, Tagesnotizen: fremde Einheit, ohne Einheit, eigene Einheit (e1). */
function einheitZeile(name) {
  return {
    sonden: [mk(`${name}-E2`), mk(`${name}-OHNE`), mk(`${name}-E1`)],
    bedingt: { "nur eigene Einheit": (s) => {
      expect(mk(`${name}-E2`)(s), "fremde Einheit").toBe(false);
      expect(mk(`${name}-OHNE`)(s), "ohne Einheit").toBe(false);
      expect(mk(`${name}-E1`)(s), "eigene Einheit").toBe(true);
    } },
  };
}

/* ------------------------------------------------------------------------
   Auflage B3: Jedes Personenfeld (PERSONENFELDER) gehört zu genau einer
   Zeile. Die Zelle prüft dann zusätzlich, ob das Feld an b1 in der Antwort
   steht. Ein neues Feld ohne Zuordnung macht den Test rot. Ausgenommen sind
   nur die abgeleiteten Felder (sichtbereich, planungsregeln): Sie entstehen
   in der Antwort und werden beim Schreiben entfernt, nie gespeichert.
   ------------------------------------------------------------------------ */
const FELD_ZEILE = {
  "Personendaten für den Plan (Name, Zugehörigkeit, Rolle, Qualifikationen …)":
    ["vorname", "nachname", "funktion", "imSchichtdienst", "springer", "teilzeit", "wochenstunden", "anonym"],
  "Personengerüst für die Betreiberabrechnung (Rolle auch im Verlauf, Status, Ein-/Austritt, Zugehörigkeit)":
    ["id", "rolle", "status", "eintritt", "austritt", "zugehoerigkeit", "rolleSeit", "rolleVerlauf"],
  "Kontakt: Telefon, Anschrift": ["telefon", "mobil", "anschrift"],
  "Kontakt: E-Mail (Kontaktangabe für Planung und Leitung)": ["email"],
  "Notfallkontakt": ["notfallkontakt", "notfall"],
  "Bank, Steuer, Sozialversicherung, Lohn/Gehalt": ["iban", "steuerId", "sozialversicherung", "lohn", "gehalt"],
  "frühere Anmeldeadresse": ["emailVorher", "emailGeaendert"],
  "Gesundheits-/Schutzmerkmale (fremder Bereich)":
    ["mutterschutz", "schwerbehindert", "geburtstag", "geburtsdatum", "nachtvorsorge", "schutz", "mutterschutzEinwilligungen"],
  "Qualifikationen": ["qualifikationen"],
  "Qualifikationsnachweise (`qualNachweise`: Datei, Status-Nachweise)": ["qualNachweise"],
  "Kompetenznachweise (`kompetenzNachweise`)": ["kompetenzNachweise"],
  "Zuständigkeitsbereich, Verfügbarkeit, operative Einschränkungen (`bereich`, `verfuegbarkeit`, `einschraenkungen` ohne Wiedereingliederung)":
    ["bereich", "verfuegbarkeit", "einschraenkungen"],
  "Konten, Wünsche, Einarbeitung (`stundenuebertrag`, `urlaubsanspruch`, `urlaubsuebertrag`, `wunschfrei`, `einarbeitung`)":
    ["stundenuebertrag", "urlaubsanspruch", "urlaubsuebertrag", "wunschfrei", "einarbeitung"],
  "Beschäftigungsmodell und Monatsstundengrenze (`beschaeftigungsmodell`, `stundenGrenzeMonat`)":
    ["beschaeftigungsmodell", "stundenGrenzeMonat"],
  "Personalnummer (`personalnummer`, Lohnexport)": ["personalnummer"],
  "Zuschläge an der Person (`zuschlaege`) — fachliche Entscheidung offen (Lohnbestandteil?)": ["zuschlaege"],
  "Verwaltungsangaben zur Person (`nachweise`, `urlaubshinweis`, `neuerZugang`, `anonymSeit`)":
    ["nachweise", "urlaubshinweis", "neuerZugang", "anonymSeit"],
  "Einstellungen der Anwendung an der Person (`weckzeit`, `benachrichtigung`, `thema`, `dichte`, `kontrastmodus`, `feldmodus`, `tour`, `einfuehrung`, `handbuch`, `startansicht`, `wenigerBewegung`)":
    ["weckzeit", "benachrichtigung", "thema", "dichte", "kontrastmodus", "feldmodus", "tour", "einfuehrung", "handbuch",
      "startansicht", "wenigerBewegung"],
  "Personennotizen (`notizen` „person|…\"; Notiz der Leitung `notiz` an der Person)": ["notiz", "notizen"],
  "Kalendergeheimnis, -verweis, -stand": ["kalenderGeheim", "kalenderVerweis", "kalenderStand"],
  "Push-Schlüssel, Zustelleinstellungen": ["pushSchluessel", "zustellung"],
};
const feldSonden = (klasse) => (FELD_ZEILE[klasse] || []).map((f) => feld("b1", f));

/* ------------------------------------------------------------------------
   Die Prüfung
   ------------------------------------------------------------------------ */
const ZEILEN_MD = matrixZeilen();

describe("Auflage B3: jedes Personenfeld gehört zu genau einer Matrixzeile", () => {
  const zuordnung = Object.entries(FELD_ZEILE).flatMap(([z, felder]) => felder.map((f) => [f, z]));
  it("jedes Feld aus PERSONENFELDER ist zugeordnet (außer den abgeleiteten)", () => {
    const zugeordnet = new Set(zuordnung.map(([f]) => f));
    const ohne = PERSONENFELDER.filter((f) => !zugeordnet.has(f) && !ABGELEITETE_PERSONENFELDER.includes(f));
    expect(ohne, "Personenfelder ohne Matrixzeile — Zeile in RECHTEMATRIX.md und Zuordnung hier ergänzen").toEqual([]);
  });
  it("kein Feld doppelt, kein unbekanntes Feld, jede Zeile gibt es", () => {
    const felder = zuordnung.map(([f]) => f);
    expect(felder.length).toBe(new Set(felder).size);
    expect(felder.filter((f) => !PERSONENFELDER.includes(f))).toEqual([]);
    const klassen = new Set(ZEILEN_MD.map((z) => z.klasse));
    expect(Object.keys(FELD_ZEILE).filter((k) => !klassen.has(k) || !ZEILEN[k])).toEqual([]);
  });
  it("b1 trägt jedes zugeordnete Feld (sonst prüfte die Sonde nichts)", () => {
    const b1 = B1();
    expect(zuordnung.map(([f]) => f).filter((f) => !hat(b1, f))).toEqual([]);
  });
  it("die abgeleiteten Felder werden beim Schreiben entfernt", () => {
    const g = bestand();
    const sicht = JSON.parse(JSON.stringify(bestandFuerRolle(g, SITZ.LT)));
    for (const f of ABGELEITETE_PERSONENFELDER) sicht.mandanten[0].personen.find((p) => p.id === "b1")[f] = "gespeichert?";
    const e = zusammenfuehren(g, sicht, SITZ.LT);
    const b1 = e.mandanten[0].personen.find((p) => p.id === "b1");
    for (const f of ABGELEITETE_PERSONENFELDER) expect(hat(b1, f), f).toBe(false);
  });
});

describe("RECHTEMATRIX.md, Abschnitt 1: jede Zeile hat eine Prüfung und umgekehrt", () => {
  it("die Tabelle ist da", () => {
    expect(ZEILEN_MD.length).toBeGreaterThan(30);
  });
  it("jede Matrixzeile ist hier geprüft", () => {
    const ohne = ZEILEN_MD.map((z) => z.klasse).filter((k) => !ZEILEN[k]);
    expect(ohne, "Matrixzeilen ohne Prüfung — Prüfung in pruefungen/rechtematrix-zeilen.test.js ergänzen").toEqual([]);
  });
  it("jede Prüfung hat ihre Matrixzeile", () => {
    const klassen = new Set(ZEILEN_MD.map((z) => z.klasse));
    expect(Object.keys(ZEILEN).filter((k) => !klassen.has(k))).toEqual([]);
  });
  it("jeder Marker steht im Bestand genau einmal (die Prüfung meint, was sie prüft)", () => {
    const roh = JSON.stringify(bestand());
    const marker = [...roh.matchAll(/«[^»]+»/g)].map((x) => x[0]);
    expect(marker.length).toBe(new Set(marker).size);
  });
});

describe("RECHTEMATRIX.md, Abschnitt 1: jede Zelle gegen die Antwort des Servers", () => {
  for (const z of ZEILEN_MD) {
    const def = ZEILEN[z.klasse];
    if (!def) continue;
    for (const spalte of PRUEFSPALTEN) {
      const wert = z.zellen[matrixSpalte(spalte)];
      it(`${z.klasse} · ${spalte}: ${wert}`, () => {
        const s = sichten[spalte];
        const sonden = [...(def.sondenFuer ? def.sondenFuer(spalte) : def.sonden), ...feldSonden(z.klasse)];
        if (wert === "✓") erwarte(sonden, s, true, `${spalte} ✓`);
        else if (wert === "–") erwarte(sonden, s, false, `${spalte} –`);
        else {
          const f = def.bedingt && def.bedingt[wert];
          expect(f, `keine Prüfung für den Wortlaut „${wert}“`).toBeTypeOf("function");
          f(s, { ...def, sonden });
        }
      });
    }
  }
});

/* ------------------------------------------------------------------------
   Die Fußnoten: eigener Bereich der Schichtverantwortung (a1 in e1, sp1 im
   Pool), Status-Qualifikationen (²), Betriebsrat (¹⁴).
   ------------------------------------------------------------------------ */
describe("RECHTEMATRIX.md, Fußnoten", () => {
  const sv = sichten.SV;
  it("¹ Telefon und Mobil im eigenen Bereich und im Pool — Anschrift, E-Mail, Notfall, Bank nicht", () => {
    for (const x of ["TELEFON-A1", "MOBIL-A1", "TELEFON-SP1"]) expect(mk(x)(sv), x).toBe(true);
    for (const x of ["ANSCHRIFT-A1", "EMAIL-A1", "NOTFALL-A1", "IBAN-A1"]) expect(mk(x)(sv), x).toBe(false);
  });
  it("² ohne Status-Qualifikationen (Beschäftigte, Betriebsrat, Schichtverantwortung für fremde Personen)", () => {
    for (const k of ["MA", "BR", "SV"]) {
      const b1 = personIn(sichten[k].betrieb, "b1");
      expect(b1.qualifikationen, k).toEqual(["pfk"]);
    }
    for (const k of ["PL", "LT", "KU", "VA-LT", "VA-SK"])
      expect(personIn(sichten[k].betrieb, "b1").qualifikationen, k).toEqual(["pfk", "masern"]);
  });
  it("³ im eigenen Bereich Zeiten ohne Grund", () => {
    expect(mk("ERF-ZEIT-A1")(sv)).toBe(true);
    expect(mk("ERF-GRUND-A1")(sv)).toBe(false);
  });
  it("⁴ im eigenen Bereich Kategorie ohne Anmerkung", () => {
    const a = sv.betrieb.abwesenheiten.find((x) => x.id === "ab-a1");
    expect(a.art).toBe("krank");
    expect(mk("ABW-NOTIZ-A1")(sv)).toBe(false);
  });
  it("¹⁸ Bereich und Pool: Zuständigkeitsbereich, Verfügbarkeit, Kompetenznachweise", () => {
    for (const x of ["VERFUEGBARKEIT-A1", "VERFUEGBARKEIT-SP1", "KOMPETENZ-A1", "KOMPETENZ-SP1"]) expect(mk(x)(sv), x).toBe(true);
    expect(personIn(sv.betrieb, "a1").bereich).toBe("e1");
    expect(personIn(sv.betrieb, "a1").einschraenkungen).toEqual({ keineNacht: true });
  });
  it("¹⁹ Konten im eigenen Bereich, nicht im Pool", () => {
    expect(mk("STUNDEN-A1")(sv)).toBe(true);
    expect(mk("STUNDEN-SP1")(sv)).toBe(false);
  });
  it("²⁰ Nachweise im Bereich: Qualifikation, Ablauf, vorhanden — nie die Datei", () => {
    expect(personIn(sv.betrieb, "a1").qualNachweise).toEqual([{ qualId: "masern", vorhanden: true }]);
    expect(mk("DATEI-A1")(sv)).toBe(false);
  });
  it("⁵ Anträge im eigenen Bereich vollständig", () => {
    expect(mk("ANTRAG-URLAUB-A1")(sv)).toBe(true);
  });
  it("¹⁴ Betriebsrat: keine Ist-Erfassung, auch nicht die eigene; Beschäftigte nur die eigene", () => {
    expect(mk("ERF-ZEIT-R1")(sichten.BR)).toBe(false);
    expect(sichten.BR.betrieb.sichtIstDaten).toEqual({ umfang: "keine" });
    expect(sichten.MA.betrieb.sichtIstDaten).toEqual({ umfang: "eigene", person: "m0" });
  });
  it("oben: alle Rollen außer dem Betreiber nur Zähler, Sitzungsmarke und genau den eigenen Betrieb", () => {
    for (const k of ["MA", "BR", "SV", "PL", "LT", "KU"]) {
      const v = JSON.parse(sichten[k].json);
      expect(Object.keys(v).filter((x) => !["tarife"].includes(x)).sort(), k).toEqual(["mandanten", "session", "stand", "version"]);
      expect(v.mandanten.map((m) => m.id), k).toEqual(["m1"]);
    }
  });
});

/* ------------------------------------------------------------------------
   Rundreise je Rolle mit Schreibrecht: Die gefilterte Sicht unverändert
   zurückschreiben verliert nichts; ein mitgeschickter verborgener Wert
   ändert nichts (abgewiesen oder wirkungslos).
   ------------------------------------------------------------------------ */
describe("Rundreise: gefilterte Sicht zurück — nichts verloren, nichts Verborgenes überschrieben", () => {
  const SCHREIBER = ["MA", "SV", "PL", "LT", "KU", "BT"];
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  /* Vergleichsform: session ist kein Bestandsfeld (D1b/D1c) und wird beim Schreiben null bzw. entfernt.
     Listen mit Kennung zählen als Menge — die Zusammenführung der Beschäftigten (eigenesZusammen) stellt
     verborgene Anträge hinter die sichtbaren; verloren geht dabei nichts. */
  const nachId = (x) => (Array.isArray(x) ? (x.every((e) => e && typeof e === "object" && "id" in e)
    ? [...x].sort((a, b) => String(a.id).localeCompare(String(b.id))) : x).map(nachId)
    : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, nachId(v)])) : x);
  const vergleich = (b) => {
    const k = kopie(b);
    k.session = null;
    for (const m of k.mandanten) delete m.session;
    return nachId(k);
  };

  for (const k of SCHREIBER) {
    it(`${k}: unverändert zurück — der gespeicherte Stand bleibt wertgleich`, () => {
      const g = bestand();
      const e = zusammenfuehren(g, kopie(bestandFuerRolle(g, SITZ[k])), SITZ[k]);
      expect(e && e.verweigert, `${k}: ${e && e.verweigert}`).toBeFalsy();
      expect(vergleich(e), k).toEqual(vergleich(g));
    });
  }

  /* Verborgene Werte, die eine Rolle mitschicken könnte — an b1 bzw. am Betrieb. */
  const anB1 = (f, wert) => (m) => {
    const b1 = (m.personen || []).find((p) => p && p.id === "b1");
    if (b1) b1[f] = wert;
    return !!b1;
  };
  const VERBORGEN = {
    "Bank (iban)": anB1("iban", "DE00 ANGRIFF"),
    "Notfallangabe (notfall)": anB1("notfall", "ANGRIFF"),
    "Notfallkontakt": anB1("notfallkontakt", "ANGRIFF"),
    "Kalendergeheimnis": anB1("kalenderGeheim", "ANGRIFF"),
    "frühere Anmeldeadresse": anB1("emailVorher", "angriff@x.de"),
    "Betriebsnotiz": (m) => { m.notiz = "ANGRIFF"; return true; },
  };
  for (const k of SCHREIBER) {
    for (const [name, aendern] of Object.entries(VERBORGEN)) {
      /* Die Betriebsnotiz schreibt der Betreiber selbst (Kaufmännisches, Fußnote ¹¹) — lesen tut sie niemand. */
      if (k === "BT" && name === "Betriebsnotiz") continue;
      it(`${k}: ${name} mitschicken — abgewiesen oder wirkungslos`, () => {
        const g = bestand();
        const sicht = kopie(bestandFuerRolle(g, SITZ[k]));
        const m = sicht.mandanten.find((x) => x && x.id === "m1");
        expect(aendern(m), "b1 steht in jeder Sicht").toBe(true);
        const e = zusammenfuehren(g, sicht, SITZ[k]);
        if (e && e.verweigert) return;
        expect(JSON.stringify(e), `${k}: ${name}`).not.toMatch(/ANGRIFF|angriff@x\.de/);
      });
    }
  }
});

/* Review M1 (Art. 9 DSGVO): Die Einsatzregeln der Schichtverantwortung
   verraten weder vergangene Grenzen noch über ihren Namen ein Merkmal. a1
   hat Mutterschutz und eine Einwilligung seit 20 Tagen. */
describe("Einsatzregeln der Schichtverantwortung: keine vergangenen Grenzen, kein merkmalsbezogener Name (Review M1)", () => {
  it("a1: Abschnitte nur ab heute, Namen ohne Mutterschutz-Bezug", () => {
    const a1 = personIn(sichten.SV.betrieb, "a1");
    expect(Array.isArray(a1.planungsregeln)).toBe(true);
    for (const r of a1.planungsregeln) {
      if (r.regel === "stundengrenzeWoche" || r.regel === "hoechstens8hTag" || r.regel === "wochenendePruefen" || r.regel === "nachtAb23NichtZulaessig") continue;
      if (r.von) expect(r.von > HEUTE, JSON.stringify(r)).toBe(true);
      if (r.bis) expect(r.bis >= HEUTE, JSON.stringify(r)).toBe(true);
    }
    expect(JSON.stringify(a1.planungsregeln)).not.toMatch(/mutter|muschg|schwanger|einwilligung|ab22/i);
    expect(JSON.stringify(sichten.SV.betrieb)).not.toMatch(/mutterschutzEinwilligungen/);
  });
});

/* Zuletzt (alle Sonden sind jetzt angelegt, auch die in den Wortlaut-Prüfungen):
   Jeder abgefragte Marker steht im Testbestand — ein Tippfehler im Marker
   machte „fehlt im Payload" sonst trivial wahr. */
describe("Sonden: jeder Marker steht im Testbestand", () => {
  it("kein Marker ohne Gegenstück", () => {
    const roh = JSON.stringify(bestand());
    expect([...MARKER].filter((x) => !roh.includes(M(x)))).toEqual([]);
    expect(MARKER.size).toBeGreaterThan(90);
  });
});
