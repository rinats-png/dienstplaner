/* ==========================================================================
   SICHT — das View-Modell für Beschäftigte und Betriebsrat

   Zwei Teile:

   1. Katalogzwang. Jedes Feld, das der Quelltext an einem Betrieb oder an
      einer Person anlegt oder schreibt, braucht in server/lib/sicht.mjs eine
      Entscheidung. Fehlt sie, schlägt diese Prüfung fehl — ein neues Feld
      geht sonst stillschweigend nicht hinaus, und niemand merkt, dass eine
      Ansicht leer bleibt; oder es wird aus Bequemlichkeit pauschal
      freigegeben. Beides soll eine bewusste Entscheidung sein.

   2. Was die beiden Rollen tatsächlich bekommen, was beim Zurückschreiben
      erhalten bleibt und dass die übrigen Rollen unverändert sind.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { BETRIEB, PERSONENFELDER } from "../server/lib/sicht.mjs";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { leitungsperson } from "../server/lib/provisionierung.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (datei) => readFileSync(path.join(HIER, "..", datei), "utf8");
const APP = lies("src/App.jsx");
const MIGRATION = lies("src/migration.js");

/* --------------------------------------------------------------------------
   Ein kleiner Leser für Objektliterale: Ab einer öffnenden Klammer gibt er
   die Schlüssel der obersten Ebene zurück. Zeichenketten, Vorlagen und
   Kommentare werden übersprungen, Spreads (`...x`) ignoriert, Kurzformen
   (`{ einheiten, }`) mitgezählt. Für den Zweck — Feldnamen finden — genügt das.
   -------------------------------------------------------------------------- */
function schluessel(src, start) {
  const aus = [];
  let tiefe = 0, i = start, erwarteSchluessel = false;
  const ueberspringeLeer = (j) => {
    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src.startsWith("//", j)) { j = src.indexOf("\n", j); if (j < 0) return src.length; continue; }
      if (src.startsWith("/*", j)) { j = src.indexOf("*/", j) + 2; continue; }
      return j;
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const zu = c; i++;
      while (i < src.length && src[i] !== zu) { if (src[i] === "\\") i++; i++; }
      i++; continue;
    }
    if (src.startsWith("//", i)) { i = src.indexOf("\n", i); continue; }
    if (src.startsWith("/*", i)) { i = src.indexOf("*/", i) + 2; continue; }
    if (c === "{" || c === "[" || c === "(") {
      tiefe++; i++;
      if (tiefe === 1 && c === "{") erwarteSchluessel = true;
    } else if (c === "}" || c === "]" || c === ")") {
      tiefe--; i++;
      if (tiefe === 0) return aus;
    } else if (c === "," && tiefe === 1) {
      erwarteSchluessel = true; i++;
    } else i++;
    if (erwarteSchluessel && tiefe === 1) {
      erwarteSchluessel = false;
      const j = ueberspringeLeer(i);
      if (src.startsWith("...", j)) { i = j; continue; }
      const m = /^([A-Za-z_$][\w$]*)\s*([:,}])/.exec(src.slice(j, j + 80))
        || /^"([^"]+)"\s*(:)/.exec(src.slice(j, j + 80));
      if (m) aus.push(m[1]);
      i = j;
    }
  }
  return aus;
}

/** Alle Literale, die mit `{ ...<variable>,` beginnen und einer der Variablen gehören. */
function spreadSchluessel(src, variablen) {
  const aus = new Set();
  const re = new RegExp(`\\{\\s*\\.\\.\\.(${variablen.join("|")}),`, "g");
  for (const t of src.matchAll(re)) for (const k of schluessel(src, t.index)) aus.add(k);
  return aus;
}

/** Schlüssel des Literals hinter einem Anker (erste `{` danach). */
function nachAnker(src, anker, ab = 0) {
  const i = src.indexOf(anker, ab);
  if (i < 0) throw new Error(`Anker nicht gefunden: ${anker}`);
  return schluessel(src, src.indexOf("{", i + anker.length - 1));
}

/** Das Objekt, das eine Funktion auf ihrer obersten Ebene mit `return {`
    baut — innere Rückgaben (in Hilfsfunktionen und Rückrufen) zählen nicht. */
function rueckgabe(src, funktion) {
  const i = src.indexOf(`function ${funktion}(`);
  if (i < 0) throw new Error(`Funktion nicht gefunden: ${funktion}`);
  let j = src.indexOf(")", i);
  j = src.indexOf("{", j);
  let tiefe = 0, treffer = -1;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (c === "\"" || c === "'" || c === "`") {
      const zu = c; k++;
      while (k < src.length && src[k] !== zu) { if (src[k] === "\\") k++; k++; }
      continue;
    }
    if (src.startsWith("//", k)) { k = src.indexOf("\n", k); continue; }
    if (src.startsWith("/*", k)) { k = src.indexOf("*/", k) + 1; continue; }
    if (c === "{" || c === "(" || c === "[") tiefe++;
    else if (c === "}" || c === ")" || c === "]") { tiefe--; if (tiefe === 0) break; }
    else if (tiefe === 1 && src.startsWith("return {", k)) treffer = k;
  }
  if (treffer < 0) throw new Error(`Keine Rückgabe auf oberster Ebene: ${funktion}`);
  return schluessel(src, src.indexOf("{", treffer));
}

/* --------------------------------------------------------------------------
   1. KATALOGZWANG
   -------------------------------------------------------------------------- */

describe("Katalogzwang", () => {
  it("der Leser für Objektliterale findet Schlüssel, Kurzformen und überspringt Spreads", () => {
    const probe = "x = { ...m, a: 1, /* b: 2 */ c: { d: 4 }, e, 'f': \"g,h: i\", j: `k ${l}` }";
    expect(schluessel(probe, probe.indexOf("{"))).toEqual(["a", "c", "e", "j"]);
  });

  it("jedes Feld eines Betriebs hat eine Entscheidung", () => {
    const gefunden = new Set([
      ...Object.keys(baueLeerenBetrieb({ name: "Probe", branche: "pflege", email: "a@b.de",
        land: "HE", raum: "probe", laeuftAb: null }).mandanten[0]),
      ...rueckgabe(APP, "baueMandant"),
      ...rueckgabe(APP, "leererMandant"),
      ...nachAnker(APP, "const m = {", APP.indexOf("function baueAusAnlage(")),
      /* Was die Anwendung an einem Betrieb schreibt: { ...m, feld: … } */
      ...spreadSchluessel(APP, ["m", "mm", "next"]),
      ...spreadSchluessel(MIGRATION, ["m"]),
      /* Was der Server selbst schreibt (Stempeluhr). */
      "einstempeln", "erfassung",
    ]);
    /* Literale der Form { ...m, … } gehören nicht immer zu einem Betrieb:
       `m` heißt in Hilfsfunktionen auch ein Nachweis, eine Dienstart oder
       ein Sondereinsatz. Diese Schlüssel sind ausdrücklich keine
       Betriebsfelder. Damit sich dahinter kein echtes Betriebsfeld
       verstecken kann, darf keiner davon in einem Betriebsbauplan stehen
       (Prüfung unten). */
    const keineBetriebsfelder = new Set(["qualId", "ablauf", "datei", "vorhanden",
      "pause", "posten", "quelle", "ruhezeitNeutral", "rufbereitschaft", "mindestQual"]);
    const bauplaene = new Set([...rueckgabe(APP, "baueMandant"), ...rueckgabe(APP, "leererMandant"),
      ...nachAnker(APP, "const m = {", APP.indexOf("function baueAusAnlage("))]);
    for (const f of keineBetriebsfelder) expect(bauplaene.has(f), `${f} steht in einem Betriebsbauplan`).toBe(false);
    const fehlt = [...gefunden].filter((f) => !BETRIEB[f] && !keineBetriebsfelder.has(f));
    expect(fehlt, `Betriebsfelder ohne Entscheidung in sicht.mjs: ${fehlt.join(", ")}`).toEqual([]);
  });

  it("jedes Feld einer Person hat eine Entscheidung", () => {
    const katalog = new Set(PERSONENFELDER);
    const gefunden = new Set([
      ...Object.keys(leitungsperson({ vorname: "A", nachname: "B" }, "e1")),
      ...rueckgabe(APP, "zugangsPerson"),
      ...nachAnker(APP, "personen.push({"),
      ...nachAnker(APP, "neuePerson: (f) => mUpd((m) => ({ ...m, personen: [...m.personen, {"),
      ...nachAnker(APP, "return { id: uid(\"p\"), vorname: z.vorname"),
    ]);
    /* Einzelne Felder, die die Anwendung an einer Person setzt. */
    for (const t of APP.matchAll(/setzePerson\([^,()]+,\s*"([A-Za-z]+)"/g)) gefunden.add(t[1]);
    for (const t of APP.matchAll(/setzeMeineEinstellung\(\s*"([A-Za-z]+)"/g)) gefunden.add(t[1]);
    /* personen: ….map((x) => … { ...x, feld: … }) */
    for (const t of APP.matchAll(/personen:\s*[\w.()[\] |]*\.map\(\((\w+)\)\s*=>/g)) {
      const v = t[1];
      const stueck = APP.slice(t.index, t.index + 400);
      const s = stueck.indexOf(`{ ...${v},`);
      if (s >= 0) for (const k of schluessel(APP, t.index + s)) gefunden.add(k);
    }
    /* Was die Löschfristen beim Anonymisieren an einer Person setzen. */
    for (const k of rueckgabe(lies("src/aufbewahrung.js"), "anonymisiere")) gefunden.add(k);
    /* Was eine beschäftigte Person an sich selbst schreiben darf. */
    const rechte = lies("server/lib/rechte.mjs");
    const selbst = /const SELBST_FELDER = \[([\s\S]*?)\];/.exec(rechte)[1];
    for (const t of selbst.matchAll(/"([A-Za-z]+)"/g)) gefunden.add(t[1]);

    const fehlt = [...gefunden].filter((f) => !katalog.has(f));
    expect(fehlt, `Personenfelder ohne Entscheidung in sicht.mjs: ${fehlt.join(", ")}`).toEqual([]);
  });

  it("jede Katalogzeile hat für beide Rollen eine Entscheidung", () => {
    for (const [feld, regel] of Object.entries(BETRIEB)) {
      expect(Array.isArray(regel) && regel.length === 2, feld).toBe(true);
      for (const r of regel)
        expect(["voll", "nurEigene", "weg"].includes(r) || (r && typeof r.fn === "function"), feld).toBe(true);
    }
  });
});

/* --------------------------------------------------------------------------
   2. DIE SICHT
   -------------------------------------------------------------------------- */

/* A = 0 und B = 1 beschäftigt, 2 Betriebsrat, 3 Planung, 4 Leitung, 5 Schichtleitung. */
const person = (id, vorname, rolle, zusatz = {}) => ({
  id, vorname, nachname: `${vorname}mann`, funktion: "Fachkraft", rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2024-01-01", einheitId: "e1" }], eintritt: "2024-01-01",
  austritt: null, status: "aktiv", imSchichtdienst: true, springer: false,
  teilzeit: null, wochenstunden: 38.5, qualifikationen: ["pfk", "masern"],
  qualNachweise: [{ qualId: "pfk", ablauf: "2027-01-01", datei: "akte/pfk.pdf" },
    { qualId: "masern", ablauf: null, datei: "akte/masern.pdf", vorhanden: true }],
  kompetenzNachweise: [{ kompetenzId: "k1", ab: "2025-01-01" }],
  email: `${vorname.toLowerCase()}@probe.de`, telefon: "0170", anschrift: `${vorname}weg 1`,
  geburtstag: "1990-01-01", personalnummer: `PN-${id}`,
  mutterschutz: true, schwerbehindert: true, notiz: `Notiz über ${vorname}: Reha ab Mai`,
  emailVorher: `${vorname.toLowerCase()}-alt@privat.de`, emailGeaendert: "2026-09-01",
  nachtvorsorge: "2026-01-01", stundenuebertrag: 12, urlaubsanspruch: 30, urlaubsuebertrag: 2,
  verfuegbarkeit: { aktiv: true, raster: [] }, weckzeit: { aktiv: true, anfahrt: 35 },
  rolleVerlauf: [{ rolle: "mitarbeiter" }], kalenderStand: "2026-10-01",
  benachrichtigung: { push: true }, urlaubshinweis: "2026-09-30", tour: { fertig: true },
  kontrastmodus: true, einschraenkungen: { keineNacht: true },
  pushSchluessel: { endpoint: `https://push/${id}` }, zustellung: { a: { push: true } },
  kalenderGeheim: `geheim-${id}-xxxxxxxxxxxxxxxxxxxx`, kalenderVerweis: `https://k/${id}.ics`,
  neuesFeldOhneKatalog: "darf nicht hinaus",
  ...zusatz,
});

const bestand = () => ({
  version: 9, stand: 3, session: null,
  betreiber: { iban: "DE00" }, rechnungen: [{ nr: 1 }], tarife: [{ id: "pro" }],
  protokoll: [{ text: "Betreiber" }], adressaenderungen: [{ x: 1 }], angelegteMandanten: [{ name: "Kunde" }],
  mandanten: [{
    id: "m1", name: "Probehaus", branche: "pflege", bundesland: "HE", einheitLabel: "Wohnbereich",
    tarif: "pro", status: "aktiv", stichtag: "2027-01-01", preisgestaltung: { sonderpreis: { betrag: 1 } },
    rabattGrund: 20, kontakt: "chefin@probe.de", anschrift: "Hauptstr. 1", ustId: "DE1", raum: "probe",
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh" }],
    zyklus: { wochen: 1, tage: [] }, anker: "2026-01-05", einstellungen: { ruhezeit: 11 },
    matrix: { mitarbeiter: [] }, qualifikationen: [{ id: "pfk", name: "Pflegefachkraft" },
      { id: "masern", name: "Masernschutz", nurStatus: true }],
    standorte: [{ id: "st1", name: "Haus", land: "HE", lat: 50.1, lon: 8.6, radius: 200 }],
    personen: [person(0, "Andrea", "mitarbeiter"), person(1, "Miriam", "mitarbeiter"),
      person(2, "Britta", "betriebsrat"), person(3, "Paula", "planer"),
      person(4, "Lea", "leitung"), person(5, "Sami", "subplaner")],
    abweichungen: { "1|2026-10-12": "F" },
    abwesenheiten: [
      { id: "a1", personId: 1, art: "krank", von: "2026-10-12", bis: "2026-10-14",
        notiz: "Migräne, AU folgt", grund: "Migräne", diagnose: "G43", nachweis: "AU" },
      { id: "a2", personId: 0, art: "krank", von: "2026-10-20", bis: "2026-10-20", notiz: "Zahnarzt" },
      { id: "a3", personId: 1, art: "urlaub", von: "2026-11-02", bis: "2026-11-06", notiz: "Kur" },
    ],
    anfragen: [
      { id: "an-a", personId: 0, typ: "abwesenheit", art: "urlaub", status: "offen", von: "2026-12-01", bis: "2026-12-05", text: "eigener Antrag" },
      { id: "an-b", personId: 1, typ: "abwesenheit", art: "sonst", status: "abgelehnt", von: "2026-11-10", bis: "2026-11-10", text: "Arzttermin Psychiatrie", antwort: "Bitte anders legen" },
      { id: "t-b", personId: 1, typ: "tausch", status: "offen", partnerId: null, von: "2026-10-30", bis: "2026-10-30", text: "Familienfeier", interessenten: [3, 0], antwort: "intern" },
      { id: "t-fest", personId: 1, typ: "tausch", status: "offen", partnerId: 3, von: "2026-10-31", bis: "2026-10-31", text: "fest" },
    ],
    wuensche: [{ id: "w-a", personId: 0, datum: "2026-11-01", art: "moechte" },
      { id: "w-b", personId: 1, datum: "2026-11-01", art: "lieber_nicht" }],
    einspruenge: [{ id: "s-a", personId: 0, datum: "2026-10-01" }, { id: "s-b", personId: 1, datum: "2026-10-02" }],
    ausschreibungen: [{ id: "as1", datum: "2026-10-25", dienstId: "F", status: "offen",
      bewerbungen: [{ personId: 0, text: "ich" }, { personId: 1, text: "Brauche Geld, Scheidung" }] }],
    urlaubsrunde: { jahr: 2027, phase: "wuensche", wuensche: [{ personId: 0, prio: 1 }, { personId: 1, prio: 2 }], vorjahrZurueck: [1] },
    selbstplanung: [{ id: "sp1", monat: "2026-11", status: "offen",
      eintraege: [{ personId: 0, datum: "2026-11-03", dienstId: "F", zeit: "t0" },
        { personId: 1, datum: "2026-11-03", dienstId: "F", zeit: "t1" }] }],
    erfassung: { "0|2026-10-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" },
      "1|2026-10-01": { start: "06:30", ende: "13:00", bestaetigt: true, grund: "Kind krank abgeholt" } },
    einstempeln: { "0|2026-10-01": { start: "05:58", ortStart: "Am Einsatzort (20 m)" },
      "1|2026-10-01": { start: "06:31", ortStart: "Abweichend, 3.2 km entfernt" } },
    fahrzeiten: { "0|2026-10-01": { lenkzeit: 4 }, "1|2026-10-01": { lenkzeit: 9 } },
    checks: { "0|2026-10-01|F": { p1: { notiz: "ok" } }, "1|2026-10-01|F": { p1: { notiz: "vergessen" } } },
    ansichten: [{ personId: 0, name: "meine" }, { personId: 1, name: "ihre" }],
    nachrichten: [{ id: "n-a", personId: 0, titel: "für A" }, { id: "n-b", personId: 3, titel: "Krankmeldung: Miriam" }],
    notrufe: [{ id: "nr-b", personId: 1, art: "medizin", notiz: "Sturz" }],
    kompetenzen: [{ id: "k1", name: "Hebelifter", zugedacht: [0, 1] }],
    einarbeitung: [{ personId: 1, mentorId: 3, ziel: "Wiedereingliederung" }, { personId: 0, mentorId: 3, ziel: "eigene" }],
    betriebsmittel: [{ id: "b1", name: "Schlüssel Tresor", personId: 1 }, { id: "b2", name: "Funkgerät", personId: null },
      { id: "b3", name: "Dienstwagen", personId: 0 }],
    sondereinsaetze: [{ id: "se1", zugeteilt: [1], auftraggeber: "Stadt", kostenstelle: "4711" },
      { id: "se2", zugeteilt: [0, 1], auftraggeber: "Messe", kostenstelle: "4712" }],
    dienstbuch: [{ id: "d1", text: "Vorfall mit Bewohner Herr K." }],
    uebergaben: [{ id: "u1", lage: "Frau Albers Zi. 12 Sturzgefahr, Insulin 8 IE" }],
    notizen: { "tag|2026-10-12": [{ text: "Engpass" }] },
    adressAenderungen: [{ personId: 4, von: "lea-alt@privat.de", nach: "lea@probe.de" }],
    aenderungen: [{ id: "c1", personId: 1, datum: "2026-10-12", von: "-", nach: "F" }],
    protokoll: [{ text: "Leitung änderte Rolle von Miriam" }],
    freigaben: { "2026-10": { stand: 1 } }, planstaende: {}, unterschreitungen: [],
    belegung: {}, aushang: [{ titel: "Brandschutz" }],
    feldAusDerZukunft: { geheim: "ohne Katalogeintrag" },
  }, {
    id: "m2", name: "Fremdbetrieb", personen: [person(9, "Fremd", "mitarbeiter")],
    anfragen: [{ id: "x", personId: 9, typ: "abwesenheit", text: "fremder Betrieb" }],
  }],
});

const SITZ = {
  a: { rolle: "mitarbeiter", person: 0, betrieb: 0 },
  br: { rolle: "betriebsrat", person: 2, betrieb: 0 },
  planer: { rolle: "planer", person: 3, betrieb: 0 },
  leitung: { rolle: "leitung", person: 4, betrieb: 0 },
  subplaner: { rolle: "subplaner", person: 5, betrieb: 0 },
  fremd: { rolle: "mitarbeiter", person: 9, betrieb: 1 },
};
const sicht = (s) => bestandFuerRolle(bestand(), s);
const betrieb = (s) => sicht(s).mandanten[0];
const text = (x) => JSON.stringify(x);
const ids = (l) => (l || []).map((x) => x.id);
/** Listen nach Inhalt sortiert — für Vergleiche, bei denen nur der Inhalt zählt. */
const ohneReihenfolge = (w) => (Array.isArray(w)
  ? w.map(ohneReihenfolge).sort((a, b) => text(a).localeCompare(text(b)))
  : w && typeof w === "object"
    ? Object.fromEntries(Object.keys(w).sort().map((k) => [k, ohneReihenfolge(w[k])])) : w);
const fremdePerson = (m, id) => m.personen.find((p) => p.id === id);

const ART9 = ["mutterschutz", "schwerbehindert", "notiz", "emailVorher", "nachtvorsorge",
  "geburtstag", "einschraenkungen"];
const GEHEIM = ["pushSchluessel", "zustellung", "kalenderGeheim", "kalenderVerweis"];
const FREMD_WEG = [...ART9, ...GEHEIM, "kompetenzNachweise", "stundenuebertrag",
  "urlaubsanspruch", "urlaubsuebertrag", "verfuegbarkeit", "weckzeit", "rolleVerlauf",
  "emailGeaendert", "kalenderStand", "benachrichtigung", "urlaubshinweis", "tour",
  "kontrastmodus", "email", "telefon", "anschrift", "personalnummer", "bereich",
  "neuesFeldOhneKatalog"];

describe("Mitarbeiter: fremde Personen", () => {
  const m = betrieb(SITZ.a);
  it("2. keine Art.-9-Rohdaten und keine Notiz fremder Personen", () => {
    for (const id of [1, 2, 3, 4, 5]) for (const f of ART9)
      expect(fremdePerson(m, id)[f], `${id}.${f}`).toBeUndefined();
    expect(text(m)).not.toContain("Reha ab Mai");
  });
  it("7. keine Kalender- und Push-Geheimnisse, keine Kontaktdaten", () => {
    for (const f of FREMD_WEG) expect(fremdePerson(m, 1)[f], f).toBeUndefined();
    expect(text(m)).not.toContain("-alt@privat.de");
    expect(text(m)).not.toContain("geheim-1-");
  });
  it("Plan-Felder bleiben, Nachweise nur mit Qualifikation und Ablauf", () => {
    const b = fremdePerson(m, 1);
    for (const f of ["id", "vorname", "nachname", "funktion", "rolle", "zugehoerigkeit",
      "eintritt", "austritt", "status", "imSchichtdienst", "springer", "teilzeit", "wochenstunden"])
      expect(b, f).toHaveProperty(f);
    expect(b.qualifikationen).toEqual(["pfk"]);
    expect(b.qualNachweise).toEqual([{ qualId: "pfk", ablauf: "2027-01-01" }]);
  });
  it("unbekannte Personenfelder gehen nicht hinaus", () => {
    expect(fremdePerson(m, 1).neuesFeldOhneKatalog).toBeUndefined();
  });
});

describe("Mitarbeiter: Listen und Inhalte", () => {
  const m = betrieb(SITZ.a);
  it("3. keine fremden Anträge und Freitexte, Tauschbörse reduziert", () => {
    expect(ids(m.anfragen)).toEqual(["an-a", "t-b"]);
    expect(text(m.anfragen)).not.toContain("Psychiatrie");
    expect(text(m.anfragen)).not.toContain("Bitte anders legen");
    const t = m.anfragen.find((x) => x.id === "t-b");
    expect(t.antwort).toBeUndefined();
    expect(t.interessenten).toHaveLength(2);
    expect(t.interessenten).toContain(0);
    expect(t.interessenten).not.toContain(3);
  });
  it("4. keine fremden Kommt-/Geht-Daten", () => {
    expect(Object.keys(m.erfassung)).toEqual(["0|2026-10-01"]);
    expect(Object.keys(m.einstempeln)).toEqual(["0|2026-10-01"]);
    expect(Object.keys(m.fahrzeiten)).toEqual(["0|2026-10-01"]);
    expect(text(m)).not.toContain("Kind krank abgeholt");
    expect(text(m)).not.toContain("3.2 km");
  });
  it("5. keine fremden Bewerbungen und damit keine Rangfolge", () => {
    expect(m.ausschreibungen[0].bewerbungen).toEqual([{ personId: 0, text: "ich" }]);
    expect(text(m)).not.toContain("Scheidung");
  });
  it("6. keine Notizen, keine Übergaben, kein Dienstbuch, keine Adresshistorie", () => {
    expect(m.notizen).toEqual({});
    expect(m.uebergaben).toEqual([]);
    expect(m.dienstbuch).toEqual([]);
    expect(m.adressAenderungen).toEqual([]);
    expect(text(m)).not.toContain("Insulin");
    expect(text(m)).not.toContain("lea-alt@");
  });
  it("fremde Abwesenheiten nur als Zeitraum und Kategorie", () => {
    expect(m.abwesenheiten.find((a) => a.id === "a1"))
      .toEqual({ id: "a1", personId: 1, von: "2026-10-12", bis: "2026-10-14", art: "abwesend" });
    expect(m.abwesenheiten.find((a) => a.id === "a3"))
      .toEqual({ id: "a3", personId: 1, von: "2026-11-02", bis: "2026-11-06", art: "urlaub" });
    expect(text(m)).not.toContain("Migräne");
    expect(text(m)).not.toContain("Kur");
  });
  it("nur eigene Wünsche, Einsprünge, Checks, Ansichten, Mitteilungen, Urlaubswünsche", () => {
    expect(ids(m.wuensche)).toEqual(["w-a"]);
    expect(ids(m.einspruenge)).toEqual(["s-a"]);
    expect(Object.keys(m.checks)).toEqual(["0|2026-10-01|F"]);
    expect(m.ansichten).toEqual([{ personId: 0, name: "meine" }]);
    expect(ids(m.nachrichten)).toEqual(["n-a"]);
    expect(m.notrufe).toEqual([]);
    expect(m.urlaubsrunde.wuensche).toEqual([{ personId: 0, prio: 1 }]);
    expect(m.urlaubsrunde.vorjahrZurueck).toEqual([]);
  });
  it("Selbstplanung: fremde Einträge ohne Person, Einarbeitung, Mittel und Einsätze nur eigene", () => {
    expect(m.selbstplanung[0].eintraege).toEqual([
      { personId: 0, datum: "2026-11-03", dienstId: "F", zeit: "t0" },
      { datum: "2026-11-03", dienstId: "F" }]);
    expect(m.einarbeitung).toEqual([{ personId: 0, mentorId: 3, ziel: "eigene" }]);
    expect(ids(m.betriebsmittel)).toEqual(["b2", "b3"]);
    expect(m.sondereinsaetze).toEqual([{ id: "se2", zugeteilt: [0, 1] }]);
    expect(m.kompetenzen[0].zugedacht).toEqual([0]);
  });
  it("keine kaufmännischen Felder, kein Protokoll, keine Planänderungen, keine Geodaten", () => {
    for (const f of ["tarif", "preisgestaltung", "rabattGrund", "kontakt", "anschrift", "ustId", "raum"])
      expect(m[f], f).toBeUndefined();
    expect(m.protokoll).toEqual([]);
    expect(m.aenderungen).toEqual([]);
    expect(m.standorte).toEqual([{ id: "st1", name: "Haus", land: "HE" }]);
  });
  it("unbekannte Betriebsfelder und Betreiberdaten gehen nicht hinaus", () => {
    const b = sicht(SITZ.a);
    expect(m.feldAusDerZukunft).toBeUndefined();
    expect(Object.keys(b).sort()).toEqual(["mandanten", "session", "stand", "version"]);
  });
});

describe("Mitarbeiter: eigene Daten (8.)", () => {
  const m = betrieb(SITZ.a);
  const ich = fremdePerson(m, 0);
  it("die eigene Person behält, was die Oberfläche an ihr braucht", () => {
    for (const f of ["email", "telefon", "anschrift", "stundenuebertrag", "urlaubsanspruch",
      "urlaubsuebertrag", "verfuegbarkeit", "einschraenkungen", "kompetenzNachweise",
      "bereich", "weckzeit", "tour", "kontrastmodus", ...GEHEIM])
      expect(ich, f).toHaveProperty(f);
    expect(ich.qualNachweise).toHaveLength(2);
    expect(ich.qualifikationen).toEqual(["pfk", "masern"]);
  });
  it("… aber nicht die Notiz der Leitung, die alte Adresse und die Art.-9-Rohfelder", () => {
    for (const f of ["notiz", "emailVorher", "mutterschutz", "schwerbehindert", "neuesFeldOhneKatalog"])
      expect(ich[f], f).toBeUndefined();
  });
  it("eigene Abwesenheit, eigener Antrag und Plan bleiben vollständig", () => {
    expect(m.abwesenheiten.find((a) => a.id === "a2").notiz).toBe("Zahnarzt");
    expect(m.anfragen.find((a) => a.id === "an-a").text).toBe("eigener Antrag");
    expect(m.abweichungen).toEqual({ "1|2026-10-12": "F" });
    expect(m.dienstarten).toHaveLength(1);
  });
});

describe("Betriebsrat (9., 10.)", () => {
  const m = betrieb(SITZ.br);
  it("bekommt die belegten Bereiche: Plan, Prüfung, Personal, Nachweise, Kompetenzen, Einarbeitung, Verteilung", () => {
    expect(m.abweichungen).toEqual({ "1|2026-10-12": "F" });
    expect(m.freigaben).toEqual({ "2026-10": { stand: 1 } });
    expect(ids(m.aenderungen)).toEqual(["c1"]);
    expect(m.einarbeitung).toHaveLength(2);
    expect(m.kompetenzen[0].zugedacht).toEqual([0, 1]);
    expect(fremdePerson(m, 1).kompetenzNachweise).toHaveLength(1);
    expect(fremdePerson(m, 1).qualNachweise).toEqual([{ qualId: "pfk", ablauf: "2027-01-01" }]);
    expect(m.erfassung["1|2026-10-01"]).toEqual({ start: "06:30", ende: "13:00", bestaetigt: true });
  });
  it("bekommt keine fremden sensiblen Rohdaten", () => {
    for (const f of FREMD_WEG.filter((x) => x !== "kompetenzNachweise"))
      expect(fremdePerson(m, 1)[f], f).toBeUndefined();
    expect(m.anfragen).toEqual([]);
    expect(m.wuensche).toEqual([]);
    expect(m.einstempeln).toEqual({});
    expect(m.checks).toEqual({});
    expect(m.dienstbuch).toEqual([]);
    expect(m.uebergaben).toEqual([]);
    expect(m.protokoll).toEqual([]);
    expect(m.notrufe).toEqual([]);
    expect(m.ausschreibungen[0].bewerbungen).toEqual([]);
    expect(m.urlaubsrunde).toBeUndefined();
    const t = text(m);
    for (const s of ["Reha", "Migräne", "Psychiatrie", "Kind krank", "3.2 km", "Insulin",
      "Scheidung", "lea-alt@", "Sturz", "Rolle von Miriam", "geheim-1-"])
      expect(t, s).not.toContain(s);
  });
});

describe("11. Leitung und Planung unverändert", () => {
  for (const wer of ["leitung", "planer"]) {
    it(`${wer} bekommt den eigenen Betrieb vollständig`, () => {
      const b = sicht(SITZ[wer]);
      const roh = bestand().mandanten[0];
      expect(b.mandanten).toHaveLength(1);
      expect(b.mandanten[0]).toEqual(roh);
    });
  }
  /* Seit Commit 1e.1 bekommt die Schichtverantwortung die Personen gestuft
     (sicht-schichtverantwortung.test.js); alles Übrige vorerst wie bisher. */
  it("subplaner: alles außer den Personen wie bisher, Personen gekürzt", () => {
    const b = sicht(SITZ.subplaner).mandanten[0];
    const { personen: pRoh, ...restRoh } = bestand().mandanten[0];
    const { personen: pSicht, ...restSicht } = b;
    expect(restSicht).toEqual(restRoh);
    expect(pSicht.map((p) => p.id)).toEqual(pRoh.map((p) => p.id));
    expect(pSicht.every((p) => typeof p.sichtbereich === "string")).toBe(true);
  });
});

describe("12. Mandantentrennung", () => {
  it("Beschäftigte bekommen nur den eigenen Betrieb", () => {
    expect(sicht(SITZ.a).mandanten.map((x) => x.id)).toEqual(["m1"]);
    expect(text(sicht(SITZ.a))).not.toContain("fremder Betrieb");
  });
  it("der andere Betrieb sieht nichts aus m1", () => {
    const b = sicht(SITZ.fremd);
    expect(b.mandanten.map((x) => x.id)).toEqual(["m2"]);
    expect(text(b)).not.toContain("Andrea");
  });
});

describe("13., 14. Zurückschreiben und Neuladen", () => {
  it("Beschäftigte schreiben die gekürzte Sicht zurück — nichts Nichtausgeliefertes geht verloren", () => {
    const gespeichert = bestand();
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, SITZ.a)));
    const neu = zusammenfuehren(gespeichert, gelesen, SITZ.a);
    /* Der Betrieb ist inhaltlich unverändert. Die Reihenfolge einzelner
       Listen kann sich ändern — die Zusammenführung stellt Fremdes vor
       Eigenes (so schon vor dem View-Modell); verloren geht nichts. */
    expect(ohneReihenfolge(neu.mandanten[0])).toEqual(ohneReihenfolge(gespeichert.mandanten[0]));
    expect(neu.mandanten[1]).toEqual(gespeichert.mandanten[1]);
    for (const f of ["betreiber", "rechnungen", "tarife", "protokoll", "adressaenderungen", "angelegteMandanten"])
      expect(neu[f], f).toEqual(gespeichert[f]);
  });

  it("eigene Änderungen kommen an, Fremdes bleibt, und nach dem Neuladen ist alles da", () => {
    const gespeichert = bestand();
    /* Zeiten bestätigt eine Beschäftigte seit Commit 1d.2 nur noch über
       POST /api/zeit-bestaetigen; im PUT bleibt die Erfassung, wie sie ist. */
    const gestern = tagePlus(heuteBerlin(), -1);
    gespeichert.mandanten[0].abweichungen = { ...(gespeichert.mandanten[0].abweichungen || {}), [`0|${gestern}`]: "F" };
    const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(gespeichert, SITZ.a)));
    const g = gelesen.mandanten[0];
    g.anfragen.push({ id: "an-a2", personId: 0, typ: "abwesenheit", art: "urlaub", status: "offen", von: "2027-01-02", bis: "2027-01-03", text: "neu" });
    g.wuensche.push({ id: "w-a2", personId: 0, datum: "2026-11-02", art: "moechte" });
    g.erfassung[`0|${gestern}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
    g.ausschreibungen[0].bewerbungen = [];                    // eigene Meldung zurückgezogen
    g.anfragen.find((a) => a.id === "t-b").interessenten = ["verborgen-0"];  // eigene Meldung zurück
    g.personen.find((p) => p.id === 0).telefon = "0171";
    const neu = zusammenfuehren(gespeichert, gelesen, SITZ.a);
    const m = neu.mandanten[0];
    expect(ids(m.anfragen)).toEqual(expect.arrayContaining(["an-a", "an-a2", "an-b", "t-b", "t-fest"]));
    expect(m.anfragen.find((a) => a.id === "an-b").text).toBe("Arzttermin Psychiatrie");
    expect(m.anfragen.find((a) => a.id === "t-b").interessenten).toEqual([3]);
    expect(m.anfragen.find((a) => a.id === "t-b").antwort).toBe("intern");
    expect(ids(m.wuensche)).toEqual(expect.arrayContaining(["w-a", "w-a2", "w-b"]));
    expect(m.erfassung["1|2026-10-01"].grund).toBe("Kind krank abgeholt");
    expect(m.erfassung[`0|${gestern}`]).toBeUndefined();
    expect(m.ausschreibungen[0].bewerbungen).toEqual([{ personId: 1, text: "Brauche Geld, Scheidung" }]);
    expect(m.personen.find((p) => p.id === 0).telefon).toBe("0171");
    expect(m.personen.find((p) => p.id === 1)).toEqual(gespeichert.mandanten[0].personen[1]);
    expect(m.uebergaben).toEqual(gespeichert.mandanten[0].uebergaben);
    expect(m.feldAusDerZukunft).toEqual(gespeichert.mandanten[0].feldAusDerZukunft);

    /* Neu laden: die Sicht auf den neuen Stand. */
    const wieder = bestandFuerRolle(neu, SITZ.a).mandanten[0];
    expect(ids(wieder.anfragen).sort()).toEqual(["an-a", "an-a2", "t-b"]);
    expect(ids(wieder.wuensche)).toEqual(["w-a", "w-a2"]);
    expect(Object.keys(wieder.erfassung).sort()).toEqual(["0|2026-10-01"]);
    expect(wieder.personen.find((p) => p.id === 0).telefon).toBe("0171");
    /* … und ein zweiter Durchgang ohne Änderung ist verlustfrei. */
    const nochmal = zusammenfuehren(neu, JSON.parse(JSON.stringify(bestandFuerRolle(neu, SITZ.a))), SITZ.a);
    expect(ohneReihenfolge(nochmal.mandanten[0])).toEqual(ohneReihenfolge(neu.mandanten[0]));
  });

  it("der Betriebsrat kann weiterhin nicht schreiben", () => {
    const gespeichert = bestand();
    expect(zusammenfuehren(gespeichert, bestandFuerRolle(gespeichert, SITZ.br), SITZ.br)).toBeNull();
  });
});
