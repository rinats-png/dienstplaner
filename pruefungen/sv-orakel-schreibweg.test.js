/* ==========================================================================
   SICHTREGEL IM SCHREIBWEG DER SCHICHTVERANTWORTUNG (Folgepaket zu #361: N1 und Existenzorakel)

   N1 (Review #361): Die Bereichsregel im Schreibweg (imBereich am Tag) kannte das Sichtfenster der Lesesicht
      (umfangImZeitraum, −60/+90 Tage) nicht. Ein Antrag einer seit über 60 Tagen versetzten Person ist für die
      Schichtverantwortung unsichtbar, im Schreibweg aber „aus dem Bereich": 403 „… umschreiben" gegen 200 bei einer
      unbekannten Kennung, und mit erratenem Kern ließ er sich ENTSCHEIDEN; ebenso ließ sich ein verborgener Notruf
      dieser Person quittieren.
   Orakel: einspruenge, nachrichten, notrufe, dienstbuch, uebergaben, aenderungen, protokoll, Tagesnotizen —
      403 „Bestehende Einträge sind nicht änderbar" für die Kennung eines verborgenen Eintrags, 200 oder ein anderer
      Text für eine unbekannte; bestaetigungen umgekehrt (verborgen still 200, unbekannt geprüft).

   Jetzt (rechte.mjs, schichtVerborgenAlsUnbekannt): Was betriebSichtSchicht nicht zeigt, gilt im Schreibweg als
   unbekannt. Geprüft über den echten Handler (PUT /api/bestand und POST /api/bestand/teile): Antwort für „verborgen"
   und „unbekannt" gleich (Status, Text, Schlüssel; etag-Verhalten), der gespeicherte Betrieb nach dem Versuch mit
   verborgener Kennung byte-gleich; Rollenmatrix; legitime Wege der Schichtverantwortung unverändert. Dazu ein
   Differenztest alt/neu auf Funktionsebene mit Zufallsbeständen (alt = einheitZusammen nach schichtRueckfuellen,
   beide in diesem Paket unverändert).

   Aufruf: npx vitest run pruefungen/sv-orakel-schreibweg.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { einheitZusammen, schichtRueckfuellen, schichtVerborgenAlsUnbekannt, platzhalterEntfernen } from "../server/lib/rechte.mjs";
import { betriebSichtSchicht, schichtKontext } from "../server/lib/sicht.mjs";

/* Feste Uhr für die ganze Datei: Sichtfenster 2026-09-19 bis 2027-02-16. */
const JETZT = new Date("2026-11-18T10:00:00.000Z");
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(JETZT);
const T = "2026-11-23";
const ALT = "2025-05-01";                  // x1 war damals in eA, ist seit 2026-01-01 in eB (außerhalb des Fensters)
const TAG = `tag|${T}`;
const STEMPEL_K = "b1|2026-11-10";            // b1 (anderer Bereich) hat an diesem Tag gestempelt
const STEMPEL_UNBEKANNT = "b1|2026-11-11";

const WIRT = "127.0.0.1:3000";
const RAUM = "sv-orakel";
let wurzel, laden, daten, B, sitzungAnlegen;
const tok = {};
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.64.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const person = (id, rolle, z) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: z[z.length - 1][1], status: "aktiv",
  qualifikationen: [], zugehoerigkeit: z.map(([ab, einheitId]) => ({ ab, einheitId })) });
const IN_A = [["2020-01-01", "eA"]];
const ANTRAG_X1 = { id: "an-x1", personId: "x1", typ: "abwesenheit", art: "urlaub", von: ALT, bis: ALT, status: "offen", text: "x1-alt" };
const NOTRUF_X1 = { id: "nr-x1", personId: "x1", art: "hilfe", notiz: "", zeit: "2025-05-01T08:00:00.000Z", datum: ALT,
  dienst: null, ort: null, empfaenger: [], bestaetigt: null };
const NOTRUF_B1 = { ...NOTRUF_X1, id: "nr-b1", personId: "b1", datum: T, empfaenger: ["l1"] };
const UE_EB = { id: "ue-eB", datum: T, dienstId: "F", einheitId: "eB", lage: "eB-lage", offen: "", vorkommnis: "", material: "",
  von: "Vb1 Nb1", an: null, zeit: "1.11.2026", personen: [], ergaenzungen: [] };
const bestand = () => ({ version: 9, mandanten: [{ id: "m-a", name: "A", status: "aktiv", einstellungen: {},
  einheiten: [{ id: "eA", name: "A" }, { id: "eB", name: "B" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
  personen: [person("l1", "leitung", IN_A), person("p1", "planer", IN_A), person("s1", "subplaner", IN_A),
    person("a1", "mitarbeiter", IN_A), person("a2", "mitarbeiter", IN_A), person("r1", "betriebsrat", IN_A),
    person("b1", "mitarbeiter", [["2020-01-01", "eB"]]),
    person("x1", "mitarbeiter", [["2020-01-01", "eA"], ["2026-01-01", "eB"]]),
    person("v1", "mitarbeiter", [["2020-01-01", "eA"], ["2026-11-01", "eB"]])],
  abweichungen: {}, abwesenheiten: [],
  einstempeln: { [STEMPEL_K]: { start: "06:02", ende: "14:01" } },
  erfassung: { [STEMPEL_K]: { start: "06:02", ende: "14:01", bestaetigt: true } },
  anfragen: [ANTRAG_X1,
    { id: "an-b1", personId: "b1", typ: "abwesenheit", art: "urlaub", von: T, bis: T, status: "genehmigt", text: "b1", antwort: "ANTWORT-AN-B1",
      entschieden: "1.11.2026", durch: "Leitung" },
    { id: "an-a2", personId: "a2", typ: "abwesenheit", art: "urlaub", von: T, bis: T, status: "offen", text: "a2" },
    { id: "an-v1", personId: "v1", typ: "abwesenheit", art: "urlaub", von: "2026-10-20", bis: "2026-10-20", status: "offen", text: "v1" }],
  einspruenge: [{ id: "e-b1", personId: "b1", datum: T, dienstId: "F", zeit: "x" }, { id: "e-x1", personId: "x1", datum: ALT, dienstId: "F", zeit: "x" },
    { id: "e-a2", personId: "a2", datum: T, dienstId: "F", zeit: "x" }],
  wuensche: [{ id: "w-b1", personId: "b1", datum: T, art: "frei" }, { id: "w-a2", personId: "a2", datum: T, art: "frei" }],
  nachrichten: [{ id: "n-a2", personId: "a2", titel: "an a2", text: "GEHEIM-A2", gelesen: false },
    { id: "n-notruf-nr-b1-l1", personId: "l1", art: "notruf", titel: "NOTRUF b1", text: "GEHEIM-NOTRUF", ziel: "notruf", quelle: "server", gelesen: false },
    { id: "n-s1", personId: "s1", titel: "an s1", text: "fuer s1", gelesen: false }],
  notrufe: [NOTRUF_X1, NOTRUF_B1, { ...NOTRUF_X1, id: "nr-a2", personId: "a2", datum: T },
    { ...NOTRUF_X1, id: "nr-b1s", personId: "b1", datum: T, empfaenger: ["s1"] }],
  dienstbuch: [{ id: "db-eB", datum: T, art: "hinweis", text: "GEHEIM-EB", zeit: "08:00", durch: "Vb1 Nb1", vonId: "b1", einheitId: "eB" },
    { id: "db-eA", datum: T, art: "hinweis", text: "eA", zeit: "08:00", durch: "Vs1 Ns1", vonId: "s1", einheitId: "eA" }],
  uebergaben: [UE_EB, { ...UE_EB, id: "ue-eA", einheitId: "eA", lage: "eA-lage" }],
  aenderungen: [{ id: "ae-b1", personId: "b1", datum: T, von: "F", nach: "", zeit: "x" }, { id: "ae-a2", personId: "a2", datum: T, von: "F", nach: "", zeit: "x" }],
  protokoll: [{ id: "pr-1", zeit: "1.11.2026", text: "intern", durch: "Leitung" }],
  bestaetigungen: [{ id: "be-b1", personId: "b1", datum: T, dienstId: "F", aktion: "einteilen", stufe: "achtung",
    befunde: [{ regel: "teilzeit", stufe: "achtung" }], regelIds: [], grundArt: null, grund: "", ohneGrund: true, gelesen: false,
    durch: "Leitung", durchId: "l1", rolle: "leitung", zeit: "2026-11-01T08:00:00.000Z", regelstand: null, behoben: null }],
  ausschreibungen: [
    { id: "as-o", datum: T, dienstId: "F", einheitId: "eA", hinweis: "", status: "offen", erstellt: "x", durch: "L", bewerbungen: [], vergebenAn: null },
    { id: "as-v", datum: T, dienstId: "F", einheitId: "eA", hinweis: "", status: "vergeben", erstellt: "x", durch: "L",
      bewerbungen: [{ personId: "a2", text: "" }, { personId: "a1", text: "alt" }], vergebenAn: "a2", vergebenZeit: "x" },
    { id: "as-z", datum: T, dienstId: "F", einheitId: "eB", hinweis: "", status: "zurueckgezogen", erstellt: "x", durch: "L", bewerbungen: [], vergebenAn: null }],
  notizen: { [TAG]:[{ id: "no-eB", text: "GEHEIM-NOTIZ", von: "Vb1 Nb1", vonId: "b1", zeit: "1.11.2026", einheitId: "eB" },
    { id: "no-eA", text: "eA-notiz", von: "Vs1 Ns1", vonId: "s1", zeit: "1.11.2026", einheitId: "eA" }] } }] });

const roh = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
const holen = async (wer) => {
  const g = await anfrage("/api/bestand", { methode: "GET", token: tok[wer] });
  expect(g.status).toBe(200);
  return g;
};
/** PUT über die Sicht von `wer`; liefert die Antwort und den etag vor dem Schreiben. */
const schreiben = async (wer, aendern) => {
  const g = await holen(wer);
  const b = JSON.parse(JSON.stringify(g.bestand));
  aendern(b.mandanten[0]);
  const w = await anfrage("/api/bestand", { methode: "PUT", token: tok[wer], rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  return { ...w, etagVorher: g.etag };
};
/** POST /api/bestand/teile mit einem Kernfeld (ganzer Wert aus der Sicht, geändert). */
const teilSchreiben = async (wer, feld, aendern) => {
  const g = await holen(wer);
  const m = JSON.parse(JSON.stringify(g.bestand.mandanten[0]));
  aendern(m);
  return anfrage("/api/bestand/teile", { methode: "POST", token: tok[wer], rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
    kern: { [feld]: { basis: g.teile.versionen[`kern:${feld}`], wert: m[feld] } } } });
};
/** Was eine Antwort verrät: Status, Schlüssel und alles außer dem neuen Stand; dazu, ob sich der etag änderte. */
const antwortBild = (w) => {
  const { etag: _e, etagVorher: _v, versionen: _s, ...rest } = w;
  return JSON.stringify({ ...rest, schluessel: Object.keys(w).filter((k) => k !== "etagVorher").sort(),
    etagNeu: w.etag === undefined ? "fehlt" : w.etag === null ? "null" : String(w.etag) !== String(w.etagVorher) });
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-sv-orakel-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  for (const [wer, rolle, p] of [["l1", "leitung", "l1"], ["p1", "planer", "p1"], ["s1", "subplaner", "s1"], ["a1", "mitarbeiter", "a1"],
    ["r1", "betriebsrat", "r1"], ["k", "kunde", null]])
    tok[wer] = (await sitzungAnlegen({ bestand: RAUM, name: `V${wer}`, rolle, person: p, betrieb: 0, mandantId: "m-a", einheit: null },
      2 * 3600 * 1000)).token;
});
afterAll(async () => {
  vi.useRealTimers();
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});
/** Frischer Bestand, einmal unverändert durch `wer` gespeichert (danach ist die gespeicherte Form stabil). */
const frisch = async (wer) => {
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  if (wer && wer !== "r1") expect((await schreiben(wer, () => {})).status).toBe(200);
};
const gespeichertM = async () => JSON.stringify((await roh()).mandanten[0]);
/* Beschäftigte (eigenesZusammen, Stand #361): Ein mitgeschickter verborgener fremder Antrag bleibt inhaltlich
   unverändert, steht danach aber an der übermittelten Stelle der Liste (Altverhalten, für die Person nicht
   sichtbar). Verglichen wird dort deshalb ohne Reihenfolge der Anträge — jeder Antrag byte-gleich. */
const gespeichertOhneReihenfolge = async () => {
  const m = (await roh()).mandanten[0];
  return JSON.stringify({ ...m, anfragen: (m.anfragen || []).map((x) => JSON.stringify(x)).sort() });
};

/* Je Feld: verborgene Kennungen (für die Schichtverantwortung) und Varianten des mitgeschickten Eintrags. */
const ANHANG = (feld, eintrag) => (m) => { m[feld] = [...(Array.isArray(m[feld]) ? m[feld] : []), eintrag]; };
const NOTIZ = (eintrag) => (m) => { m.notizen = { ...(m.notizen || {}), [TAG]: [...((m.notizen || {})[TAG] || []), eintrag] }; };
const FELDER = [
  { feld: "anfragen", verborgen: ["an-x1", "an-b1"], varianten: [
    ["gültig neu (eigene Person, offen)", (id) => ANHANG("anfragen", { id, personId: "s1", typ: "abwesenheit", art: "urlaub", von: "2026-08-03", bis: "2026-08-04", status: "offen", text: "neu" })],
    ["N1: Kern wie gespeichert, genehmigen", (id) => ANHANG("anfragen", { ...ANTRAG_X1, id, status: "genehmigt", antwort: "ok" })],
    ["N1: Kern wie gespeichert, offen, anderer Text", (id) => ANHANG("anfragen", { ...ANTRAG_X1, id, text: "anders" })],
    ["fremde Person (anderer Bereich)", (id) => ANHANG("anfragen", { id, personId: "b1", typ: "abwesenheit", art: "urlaub", von: T, bis: T, status: "offen" })]] },
  { feld: "einspruenge", verborgen: ["e-b1", "e-x1"], varianten: [
    ["gültig neu (Bereich)", (id) => ANHANG("einspruenge", { id, personId: "a2", datum: T, dienstId: "F" })],
    ["fremde Person", (id) => ANHANG("einspruenge", { id, personId: "b1", datum: T, dienstId: "F" })]] },
  { feld: "wuensche", verborgen: ["w-b1"], varianten: [
    ["eigene Person", (id) => ANHANG("wuensche", { id, personId: "s1", datum: T, art: "frei" })]] },
  { feld: "nachrichten", verborgen: ["n-a2"], varianten: [
    ["gültig neu (Bereich)", (id) => ANHANG("nachrichten", { id, personId: "a2", titel: "Hallo", text: "x" })],
    ["gelesen setzen, geratener Titel", (id) => ANHANG("nachrichten", { id, personId: "a2", titel: "an a2", text: "GEHEIM-A2", gelesen: true })],
    ["Titel zu lang", (id) => ANHANG("nachrichten", { id, personId: "a2", titel: "x".repeat(200) })]] },
  { feld: "notrufe", verborgen: ["nr-x1", "nr-b1"], varianten: [
    ["N1: quittieren mit gespeichertem Inhalt", (id) => ANHANG("notrufe", { ...NOTRUF_X1, id, bestaetigt: "2026-11-18T10:00:00.000Z" })],
    ["eigener neuer Notruf", (id) => ANHANG("notrufe", { id, personId: "s1", art: "hilfe", notiz: "", datum: T, empfaenger: ["l1"] })]] },
  { feld: "dienstbuch", verborgen: ["db-eB"], varianten: [
    ["gültig neu", (id) => ANHANG("dienstbuch", { id, datum: T, art: "hinweis", text: "neu" })],
    ["ungültige Art", (id) => ANHANG("dienstbuch", { id, datum: T, art: "quatsch", text: "x" })]] },
  { feld: "uebergaben", verborgen: ["ue-eB"], varianten: [
    ["gültig neu (anderer Tag)", (id) => ANHANG("uebergaben", { id, datum: "2026-11-24", dienstId: "F", lage: "neu" })],
    ["ergänzen am Inhalt des verborgenen", (id) => ANHANG("uebergaben", { ...UE_EB, id, ergaenzungen: [{ text: "dazu" }] })]] },
  { feld: "aenderungen", verborgen: ["ae-b1"], varianten: [
    ["gültig neu (Bereich)", (id) => ANHANG("aenderungen", { id, personId: "a2", datum: T, von: "F", nach: "" })],
    ["fremde Person", (id) => ANHANG("aenderungen", { id, personId: "b1", datum: T, von: "F", nach: "" })]] },
  { feld: "protokoll", verborgen: ["pr-1"], varianten: [
    ["gültig neu", (id) => ANHANG("protokoll", { id, text: "x" })]] },
  { feld: "bestaetigungen", verborgen: ["be-b1"], varianten: [
    ["ohne Befunde (ungültig)", (id) => ANHANG("bestaetigungen", { id, personId: "a2", datum: T, dienstId: "F", aktion: "einteilen", befunde: [] })],
    ["gültig neu (Bereich)", (id) => ANHANG("bestaetigungen", { id, personId: "a2", datum: T, dienstId: "F", aktion: "einteilen",
      befunde: [{ regel: "teilzeit" }] })]] },
  { feld: "notizen", verborgen: ["no-eB"], varianten: [
    ["gültig neu", (id) => NOTIZ({ id, text: "neu" })],
    ["leerer Text", (id) => NOTIZ({ id, text: "" })]] },
];

describe("Schichtverantwortung, PUT /api/bestand: verborgene Kennung antwortet wie eine unbekannte, Zustand byte-gleich", () => {
  for (const { feld, verborgen, varianten } of FELDER) {
    for (const [titel, aendern] of varianten) {
      it(`${feld}: ${titel}`, async () => {
        await frisch("s1");
        const neu = await schreiben("s1", aendern(`gibt-es-nicht-${feld}`));
        for (const id of verborgen) {
          await frisch("s1");
          const vorher = await gespeichertM();
          const w = await schreiben("s1", aendern(id));
          expect(antwortBild(w), `${feld} ${id}: ${JSON.stringify(w)} gegen ${JSON.stringify(neu)}`).toBe(antwortBild(neu));
          expect(await gespeichertM(), `${feld} ${id}: Zustand`).toBe(vorher);
          for (const geheim of ["GEHEIM", "ANTWORT-AN-B1"]) expect(JSON.stringify(w)).not.toContain(geheim);
        }
      }, 30000);
    }
  }
});

describe("Schichtverantwortung: Prüfungen am Wert der Kennung (Server-Mitteilungen „n-notruf-…“)", () => {
  /* Die neue Kennung behält den Anfang der alten: Eine unbekannte Kennung „n-notruf-…“ verwirft mitteilungenVorfiltern
     als Server-Mitteilung (200) — eine verborgene muss genauso antworten, nicht mit der Titelprüfung (403). */
  for (const [titel, eintrag] of [["leerer Titel", { personId: "a2", titel: "" }], ["gültiger Titel", { personId: "a2", titel: "x" }],
    ["gelesen", { personId: "l1", titel: "NOTRUF b1", gelesen: true }]]) {
    it(titel, async () => {
      await frisch("s1");
      const neu = await schreiben("s1", ANHANG("nachrichten", { ...eintrag, id: "n-notruf-gibt-es-nicht" }));
      await frisch("s1");
      const vorher = await gespeichertM();
      const w = await schreiben("s1", ANHANG("nachrichten", { ...eintrag, id: "n-notruf-nr-b1-l1" }));
      expect(antwortBild(w), JSON.stringify(w)).toBe(antwortBild(neu));
      expect(await gespeichertM()).toBe(vorher);
    }, 30000);
  }
});

describe("Ältere Kopie: unverändert mitgeschickte verborgene Einträge blockieren nicht (Review #366 N2)", () => {
  it("SV schickt verborgene Einträge byte-gleich mit: 200, Bestand byte-gleich, kein Platzhalter", async () => {
    await frisch("s1");
    const vorher = await gespeichertM();
    const g = (await roh()).mandanten[0];
    const kopie = (feld, id) => JSON.parse(JSON.stringify(g[feld].find((x) => x.id === id)));
    const w = await schreiben("s1", (m) => {
      m.anfragen.push(kopie("anfragen", "an-b1"), kopie("anfragen", "an-x1"));
      m.notrufe.push(kopie("notrufe", "nr-x1"));
      m.bestaetigungen = [...(m.bestaetigungen || []), kopie("bestaetigungen", "be-b1")];
      m.dienstbuch.push(kopie("dienstbuch", "db-eB"));
      m.nachrichten.push(kopie("nachrichten", "n-a2"));
      m.notizen[TAG] = [...m.notizen[TAG], JSON.parse(JSON.stringify(g.notizen[TAG].find((x) => x.id === "no-eB")))];
    });
    expect(w.status, JSON.stringify(w)).toBe(200);
    const nachher = await gespeichertM();
    expect(nachher).toBe(vorher);
    expect(nachher).not.toMatch(/~[0-9a-f]{8}-[0-9a-f]{4}-/);          // Platzhalter-Kennung (Anfang~UUID)
  }, 30000);
});

describe("Vorhersagbare Kennungen von Server-Mitteilungen (Review #366 N1)", () => {
  for (const id of ["n-protokoll80-l1", "n-schutzentfernt-1-l1", "n-schutzkonflikt-a2-2026-11-23-l1", "n-bestaetigung-be-x-l1"]) {
    for (const wer of ["s1", "l1"]) {
      it(`${wer}: neue Mitteilung mit Kennung ${id} wird verworfen (200, nichts angelegt)`, async () => {
        await frisch(wer);
        const vorher = await gespeichertM();
        const w = await schreiben(wer, ANHANG("nachrichten", { id, personId: "a2", titel: "x", text: "y" }));
        expect(w.status, JSON.stringify(w)).toBe(200);
        expect(await gespeichertM()).toBe(vorher);
      }, 30000);
    }
  }
});

describe("Schichtverantwortung, POST /api/bestand/teile: dasselbe über den Teilweg", () => {
  for (const [feld, id, eintrag] of [
    ["anfragen", "an-x1", { ...ANTRAG_X1, status: "genehmigt", antwort: "ok" }],
    ["anfragen", "an-x1", { ...ANTRAG_X1, text: "anders" }],
    ["notrufe", "nr-x1", { ...NOTRUF_X1, bestaetigt: "2026-11-18T10:00:00.000Z" }],
    ["dienstbuch", "db-eB", { datum: T, art: "hinweis", text: "neu" }],
    ["einspruenge", "e-b1", { personId: "a2", datum: T, dienstId: "F" }]]) {
    it(`${feld} ${id} (${JSON.stringify(eintrag).slice(0, 40)}…)`, async () => {
      await frisch("s1");
      const neu = await teilSchreiben("s1", feld, ANHANG(feld, { ...eintrag, id: `gibt-es-nicht-${feld}` }));
      await frisch("s1");
      const vorher = await gespeichertM();
      const w = await teilSchreiben("s1", feld, ANHANG(feld, { ...eintrag, id }));
      expect(antwortBild({ ...w, etagVorher: null }), JSON.stringify(w)).toBe(antwortBild({ ...neu, etagVorher: null }));
      expect(await gespeichertM()).toBe(vorher);
    });
  }
});

describe("Rollenmatrix (Handler): Beschäftigte und Betriebsrat ohne Orakel, Zustand byte-gleich", () => {
  for (const wer of ["a1", "r1"]) {
    for (const { feld, verborgen, varianten } of FELDER) {
      it(`${wer} ${feld}`, async () => {
        for (const [titel, aendern] of varianten) {
          await frisch(wer);
          const neu = await schreiben(wer, aendern(`gibt-es-nicht-${feld}`));
          /* Für Beschäftigte ist alles Fremde verborgen; dazu ein Eintrag aus dem eigenen Bereich (a2). */
          for (const id of [...verborgen, ...(feld === "anfragen" ? ["an-a2"] : [])]) {
            await frisch(wer);
            const vorher = await gespeichertOhneReihenfolge();
            const w = await schreiben(wer, aendern(id));
            expect(antwortBild(w), `${wer} ${feld} ${titel} ${id}`).toBe(antwortBild(neu));
            expect(await gespeichertOhneReihenfolge(), `${wer} ${feld} ${titel} ${id}: Zustand`).toBe(vorher);
          }
        }
      }, 60000);
    }
  }
});

describe("Legitime Wege bleiben", () => {
  it("Schichtverantwortung: entscheiden (auch Antrag einer eben versetzten Person im Fenster), quittieren, ergänzen, löschen, anlegen, gelesen", async () => {
    await frisch();
    const schritte = [
      ["Antrag aus dem Bereich ablehnen", (m) => { const a = m.anfragen.find((x) => x.id === "an-a2"); a.status = "abgelehnt"; a.antwort = "nein"; },
        (m) => expect(m.anfragen.find((x) => x.id === "an-a2")).toMatchObject({ status: "abgelehnt", antwort: "nein", durch: "Vs1 Ns1" })],
      ["Antrag der seit 1.11. versetzten Person (Tag in eA, im Fenster) genehmigen", (m) => { m.anfragen.find((x) => x.id === "an-v1").status = "genehmigt"; },
        (m) => expect(m.anfragen.find((x) => x.id === "an-v1")).toMatchObject({ status: "genehmigt", durch: "Vs1 Ns1" })],
      ["Notruf aus dem Bereich quittieren", (m) => { m.notrufe.find((x) => x.id === "nr-a2").bestaetigt = "jetzt"; },
        (m) => expect(m.notrufe.find((x) => x.id === "nr-a2").durch).toBe("Vs1 Ns1")],
      ["an sie gerichteten Notruf eines anderen Bereichs quittieren", (m) => { m.notrufe.find((x) => x.id === "nr-b1s").bestaetigt = "jetzt"; },
        (m) => expect(m.notrufe.find((x) => x.id === "nr-b1s").durch).toBe("Vs1 Ns1")],
      ["Übergabe der eigenen Einheit ergänzen", (m) => { m.uebergaben.find((x) => x.id === "ue-eA").ergaenzungen = [{ text: "nachgetragen" }]; },
        (m) => expect(m.uebergaben.find((x) => x.id === "ue-eA").ergaenzungen.map((x) => x.text)).toEqual(["nachgetragen"])],
      ["eigene Tagesnotiz löschen", (m) => { m.notizen[TAG] = m.notizen[TAG].filter((x) => x.id !== "no-eA"); },
        (m) => expect(m.notizen[TAG].map((x) => x.id)).toEqual(["no-eB"])],
      ["Dienstbucheintrag anlegen", ANHANG("dienstbuch", { id: "db-neu", datum: T, art: "hinweis", text: "neu" }),
        (m) => expect(m.dienstbuch.find((x) => x.id === "db-neu")).toMatchObject({ einheitId: "eA", vonId: "s1" })],
      ["Einsprung im Bereich anlegen", ANHANG("einspruenge", { id: "e-neu", personId: "a2", datum: T, dienstId: "F" }),
        (m) => expect(m.einspruenge.some((x) => x.id === "e-neu")).toBe(true)],
      ["eigene Mitteilung gelesen", (m) => { m.nachrichten.find((x) => x.id === "n-s1").gelesen = true; },
        (m) => expect(m.nachrichten.find((x) => x.id === "n-s1").gelesen).toBe(true)],
    ];
    for (const [titel, aendern, pruefen] of schritte) {
      const w = await schreiben("s1", aendern);
      expect(w.status, `${titel}: ${JSON.stringify(w)}`).toBe(200);
      pruefen((await roh()).mandanten[0]);
    }
    /* Die verborgenen Einträge sind nach allem unverändert. */
    const m = (await roh()).mandanten[0];
    expect(m.anfragen.find((x) => x.id === "an-x1")).toEqual(ANTRAG_X1);
    expect(m.notrufe.find((x) => x.id === "nr-x1")).toEqual(NOTRUF_X1);
    expect(m.uebergaben.find((x) => x.id === "ue-eB")).toEqual(UE_EB);
  }, 30000);
  for (const wer of ["l1", "p1", "k"]) {
    it(`${wer}: entscheidet und quittiert auch, was die Schichtverantwortung nicht sieht`, async () => {
      await frisch(wer);
      const w = await schreiben(wer, (m) => {
        const a = m.anfragen.find((x) => x.id === "an-x1"); a.status = "genehmigt"; a.antwort = "Leitung";
        m.dienstbuch.find((x) => x.id === "db-eB").text = "korrigiert";
      });
      expect(w.status, JSON.stringify(w)).toBe(200);
      const m = (await roh()).mandanten[0];
      expect(m.anfragen.find((x) => x.id === "an-x1")).toMatchObject({ status: "genehmigt", antwort: "Leitung" });
      expect(m.dienstbuch.find((x) => x.id === "db-eB").text).toBe("korrigiert");
    });
  }
});

describe("Stempel und Ist-Zeiten (Stempel-Integrität vor der Rechteprüfung): unsichtbarer Stempel wie nicht vorhanden", () => {
  for (const wer of ["s1", "a1", "r1"]) {
    it(`${wer}: einstempeln/erfassung mit Schlüssel eines fremden Stempeltags — Antwort wie ohne Stempel, Zustand byte-gleich`, async () => {
      for (const [feld, wert] of [["einstempeln", {}], ["einstempeln", { start: "07:00" }], ["einstempeln", null],
        ["erfassung", { start: "07:00", ende: "15:00" }], ["erfassung", null]]) {
        await frisch(wer);
        const neu = await schreiben(wer, (m) => { m[feld] = { ...(m[feld] || {}), [STEMPEL_UNBEKANNT]: wert }; });
        await frisch(wer);
        const vorher = await gespeichertM();
        const w = await schreiben(wer, (m) => { m[feld] = { ...(m[feld] || {}), [STEMPEL_K]: wert }; });
        expect(antwortBild(w), `${wer} ${feld} ${JSON.stringify(wert)}: ${JSON.stringify(w)} gegen ${JSON.stringify(neu)}`).toBe(antwortBild(neu));
        expect(await gespeichertM(), `${wer} ${feld}`).toBe(vorher);
      }
    }, 30000);
  }
});

describe("Bewerbung auf eine nicht mehr offene Ausschreibung (Review #361, Folgepaket)", () => {
  const as = (m, id) => m.ausschreibungen.find((x) => x.id === id);
  for (const wer of ["a1", "s1"]) {
    it(`${wer}: auf vergebene oder zurückgezogene Ausschreibung bewerben oder die eigene ändern — übergangen; offen und zurückziehen wie bisher`, async () => {
      for (const [id, aendern] of [
        ["as-v", (b) => [...b.filter((x) => x.personId !== wer), { personId: wer, text: "neu" }]],
        ["as-z", (b) => [...b, { personId: wer, text: "neu" }]]]) {
        await frisch(wer);
        const vorher = await gespeichertM();
        const w = await schreiben(wer, (m) => { as(m, id).bewerbungen = aendern(as(m, id).bewerbungen || []); });
        expect(w.status, `${wer} ${id}: ${JSON.stringify(w)}`).toBe(200);
        expect(await gespeichertM(), `${wer} ${id}`).toBe(vorher);
      }
      await frisch(wer);
      expect((await schreiben(wer, (m) => { as(m, "as-o").bewerbungen = [{ personId: wer, text: "gern" }]; })).status).toBe(200);
      expect(as((await roh()).mandanten[0], "as-o").bewerbungen).toEqual([{ personId: wer, text: "gern" }]);
      if (wer === "a1") {
        expect((await schreiben(wer, (m) => { as(m, "as-v").bewerbungen = as(m, "as-v").bewerbungen.filter((x) => x.personId !== "a1"); })).status).toBe(200);
        expect(as((await roh()).mandanten[0], "as-v").bewerbungen).toEqual([{ personId: "a2", text: "" }]);
      }
    }, 30000);
  }
});

/* ---------- Differenztest alt/neu (Funktionsebene) ----------
   alt = einheitZusammen(alt, schichtRueckfuellen(alt, neu)) — der Weg vor diesem Paket; beide Funktionen ändert es
   nicht (der Schreibweg ruft sie unverändert, nur davor schichtVerborgenAlsUnbekannt und danach platzhalterEntfernen).
   neu = derselbe Weg mit beiden Schritten. Eigenschaften:
   (1) ohne mitgeschickte, geänderte verborgene Kennung: bit-gleich;
   (2) sonst: Urteil (ok, grund) wie für dieselbe Übermittlung mit unbekannten Kennungen statt der verborgenen,
       und bei ok jeder verborgene gespeicherte Eintrag byte-gleich, kein Eintrag unter Platzhalter-Kennung. */
const sitzungSV = { rolle: "subplaner", person: "s1", betrieb: 0 };
const urteilAlt = (altM, neuM) => einheitZusammen(altM, schichtRueckfuellen(altM, neuM, sitzungSV), sitzungSV);
const urteilNeu = (altM, neuM) => {
  const v = schichtVerborgenAlsUnbekannt(altM, neuM, sitzungSV);
  const u = einheitZusammen(altM, schichtRueckfuellen(altM, v.mandant, sitzungSV), sitzungSV);
  return u.ok ? { ok: true, mandant: platzhalterEntfernen(u.mandant, v.platzhalter) } : u;
};
function zufall(start) {
  let a = start >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PERS = ["s1", "a2", "b1", "x1", "v1"];
const TAGE = [ALT, "2026-10-20", T, "2027-04-01"];
const LISTEN = ["anfragen", "einspruenge", "nachrichten", "notrufe", "dienstbuch", "uebergaben", "aenderungen", "protokoll", "bestaetigungen", "wuensche"];
function zufallsEintrag(z, feld, id) {
  const w = (l) => l[Math.floor(z() * l.length)];
  const p = w(PERS), d = w(TAGE);
  switch (feld) {
    case "anfragen": return { id, personId: p, typ: w(["abwesenheit", "tausch"]), art: "urlaub", von: d, bis: d,
      status: w(["offen", "offen", "genehmigt", "abgelehnt"]), text: `t${Math.floor(z() * 3)}`, ...(z() < 0.3 ? { antwort: "A" } : {}) };
    case "einspruenge": case "aenderungen": return { id, personId: p, datum: d, dienstId: "F", zeit: "x" };
    case "wuensche": return { id, personId: p, datum: d, art: "frei" };
    case "nachrichten": return { id, personId: p, titel: `t${Math.floor(z() * 3)}`, text: "x", gelesen: z() < 0.5 };
    case "notrufe": return { ...NOTRUF_X1, id, personId: p, datum: d, empfaenger: z() < 0.3 ? ["s1"] : [], bestaetigt: z() < 0.3 ? "x" : null };
    case "dienstbuch": return { id, datum: d, art: "hinweis", text: "x", einheitId: w(["eA", "eB", null]) };
    case "uebergaben": return { ...UE_EB, id, datum: d, einheitId: w(["eA", "eB"]), ergaenzungen: [] };
    case "protokoll": return { id, zeit: "x", text: "x", durch: "L" };
    case "bestaetigungen": return { id, personId: p, datum: d, dienstId: "F", aktion: "einteilen", befunde: [{ regel: "teilzeit", stufe: "achtung" }],
      stufe: "achtung", regelIds: [], gelesen: false, zeit: "x" };
    default: return { id };
  }
}
function zufallsBetrieb(z) {
  const m = JSON.parse(JSON.stringify(bestand().mandanten[0]));
  for (const f of LISTEN) m[f] = Array.from({ length: Math.floor(z() * 5) }, (_, k) => zufallsEintrag(z, f, `${f.slice(0, 2)}${k}`));
  m.notizen = { [TAG]: Array.from({ length: Math.floor(z() * 4) }, (_, k) => ({ id: `no${k}`, text: "x", vonId: z() < 0.5 ? "s1" : "b1",
    einheitId: z() < 0.5 ? "eA" : "eB", zeit: "x" })) };
  return m;
}
/** Eine Übermittlung aus der Sicht der Schichtverantwortung, mit Änderungen an sichtbaren, verborgenen und neuen Einträgen. */
function zufallsUebermittlung(z, altM) {
  const ctx = schichtKontext(altM, sitzungSV, "eA", "2026-11-18");
  const n = JSON.parse(JSON.stringify(betriebSichtSchicht(altM, ctx)));
  delete n.sichtIstDaten;
  const w = (l) => l[Math.floor(z() * l.length)];
  for (let k = 0; k < 1 + Math.floor(z() * 3); k++) {
    const f = w([...LISTEN, "notizen"]);
    if (f === "notizen") {
      const l = (n.notizen && n.notizen[TAG]) || [];
      const ids = (altM.notizen[TAG] || []).map((e) => e.id);
      const art = Math.floor(z() * 3);
      if (art === 0 && ids.length) l.push({ id: w(ids), text: "geändert" });               // verborgen oder sichtbar, geändert
      else if (art === 1) l.push({ id: `neu${Math.floor(z() * 50)}`, text: z() < 0.8 ? "neu" : "" });
      else if (l.length) l.pop();
      n.notizen = { ...(n.notizen || {}), [TAG]: l };
      continue;
    }
    const l = Array.isArray(n[f]) ? n[f] : [];
    const ids = altM[f].map((e) => e.id);
    const art = Math.floor(z() * 5);
    if (art === 0 && ids.length) l.push(zufallsEintrag(z, f, w(ids)));                          // gespeicherte Kennung, beliebiger Inhalt
    else if (art === 1 && ids.length) { const g = altM[f].find((e) => e.id === w(ids)); l.push({ ...g, status: "genehmigt", bestaetigt: "x", text: "y" }); }
    else if (art === 2) l.push(zufallsEintrag(z, f, `neu${Math.floor(z() * 50)}`));
    else if (art === 3 && l.length) { const i = Math.floor(z() * l.length); l[i] = { ...l[i], status: "abgelehnt", gelesen: true, text: "z" }; }
    else if (l.length) l.splice(Math.floor(z() * l.length), 1);
    n[f] = l;
  }
  return n;
}
describe("Differenztest alt/neu: einheitZusammen nach Rückfüllung, Zufallsbestände", () => {
  it("1500 Bestände: bit-gleich ohne verborgene Kennung; sonst Urteil wie unbekannte Kennung, verborgene Einträge byte-gleich", () => {
    const z = zufall(20261119);
    let gleichF = 0, verborgenF = 0, geaendertesUrteil = 0;
    for (let lauf = 0; lauf < 1500; lauf++) {
      const altM = zufallsBetrieb(z);
      const neuM = zufallsUebermittlung(z, altM);
      const a = urteilAlt(altM, neuM), n = urteilNeu(altM, neuM);
      const v = schichtVerborgenAlsUnbekannt(altM, neuM, sitzungSV);
      if (!v.platzhalter) { expect(n, `Lauf ${lauf}`).toEqual(a); gleichF++; continue; }
      verborgenF++;
      /* Dieselbe Übermittlung mit wirklich unbekannten Kennungen statt der verborgenen. */
      const ersatz = {};
      for (const [schluessel, ids] of Object.entries(v.platzhalter)) for (const p of ids) ersatz[p] = `unbekannt-${schluessel.length}-${p.slice(-6)}`;
      const unbekannt = JSON.parse(JSON.stringify(v.mandant), (k, x) => (k === "id" && typeof x === "string" && ersatz[x] ? ersatz[x] : x));
      const u = urteilAlt(altM, unbekannt);
      expect({ ok: n.ok, grund: n.grund }, `Lauf ${lauf}`).toEqual({ ok: u.ok, grund: u.grund });
      if (a.ok !== n.ok || a.grund !== n.grund) geaendertesUrteil++;
      if (!n.ok) continue;
      const sichtbar = betriebSichtSchicht(altM, schichtKontext(altM, sitzungSV, "eA", "2026-11-18"));
      for (const f of LISTEN) {
        const sIds = new Set((sichtbar[f] || []).map((e) => String(e.id)));
        for (const g of altM[f].filter((e) => !sIds.has(String(e.id))))
          expect(n.mandant[f].filter((e) => String(e.id) === String(g.id)), `Lauf ${lauf} ${f} ${g.id}`).toEqual([g]);
        expect(n.mandant[f].some((e) => String(e.id).includes("~")), `Lauf ${lauf} ${f}: Platzhalter`).toBe(false);
      }
      const sN = new Set(((sichtbar.notizen || {})[TAG] || []).map((e) => e.id));
      for (const g of (altM.notizen[TAG] || []).filter((e) => !sN.has(e.id)))
        expect((n.mandant.notizen[TAG] || []).filter((e) => e.id === g.id), `Lauf ${lauf} notizen ${g.id}`).toEqual([g]);
    }
    expect(gleichF).toBeGreaterThan(250);
    expect(verborgenF).toBeGreaterThan(250);
    expect(geaendertesUrteil).toBeGreaterThan(25);       // die Orakelfälle ändern sich wirklich
  }, 120000);
});
