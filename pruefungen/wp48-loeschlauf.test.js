/* ==========================================================================
   WP-48.4 LÖSCHLAUF DER LEITUNG ALS EIGENER WEG — POST /api/loeschlauf

   Über den echten Handler mit Dateiablage und echten Sitzungen
   (docs/acc45/WP48-TEILSPEICHERUNG.md 2.6, Entscheidung 6.1):

   1. Differenzialprüfung: Auf zwei gleichen Räumen löscht der neue Weg
      (Vorschau, dann bestätigte Ausführung) genau dasselbe wie der heutige
      Weg der Oberfläche (GET → raeumen auf den eigenen Betrieb → Eintrag
      im Betriebsprotokoll → PUT /api/bestand): gleicher Endstand, gleicher
      Löschumfang, dieselben Zeilen im Serverprotokoll (der neue Weg
      schreibt zusätzlich nur Zeilen der Art „loeschlauf"), gleich viele
      Schutzsicherungen. Aufbewahrungspflichtige Daten, ein abgeschlossener
      Monat innerhalb der Frist und der zweite Betrieb im Raum bleiben
      unberührt.
   2. Schalter aus → 404 (der heutige Weg löscht weiter).
   3. Rechte: nur Leitung (auch Demozugang); Kundenrolle, Planung, Schichtverantwortung,
      Beschäftigte, Betriebsrat, Betreiber 403 — nichts geändert.
   4. Form, Vorschau ohne Schreiben, Idempotenz, veraltete Vorschau (409),
      ungültige Fristen (422), Mandantentrennung, Bremse (429),
      unlesbarer Bestand (503, nichts geschrieben).

   Aufruf: npx vitest run pruefungen/wp48-loeschlauf.test.js
   ========================================================================== */
// zeit-ok: Der Handler rechnet mit dem Berliner Tag der echten Uhr (heuteBerlin, Fristen, Sitzungen); alle Prüftage sind relativ zu diesem Tag gebaut und liegen mindestens Wochen von jeder Fristgrenze entfernt. Die Uhrzeit des Protokolleintrags der nachgebildeten Oberfläche wird im Vergleich maskiert.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, spur, daten, B, G, A, schutz, sitzungAnlegen, Z;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.48.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf ?? {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const loeschlauf = (token, rumpf) => anfrage("/api/loeschlauf", { methode: "POST", token, rumpf });

const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  KU: { rolle: "kunde", person: null },
  PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
  BR: { rolle: "betriebsrat", person: "r1" },
  BT: { rolle: "betreiber", person: null },
  LT2: { rolle: "leitung", person: "l1", betrieb: 1, mandant: "m2" },
  /* Demozugang mit ausdrücklicher Rolle Leitung (RB-3): wie die Leitung */
  DL: { rolle: "leitung", person: "l1", demo: true },
};

let HEUTE, tag;

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org`, ...extra });

/** Ein Betrieb mit fälligen und nicht fälligen Einträgen jeder Art. Alte Tage: 800 und 1000 Tage zurück (Frist
    Plandaten 24 Monate); jung: 3 und 40 Tage. Der Monat vor 40 Tagen ist abgeschlossen (innerhalb der Frist), der
    Monat vor 800 Tagen ebenso (außerhalb der Frist). */
function betrieb(id, name, { mitStandort = false } = {}) {
  const plan = {}; const ist = {}; const stempel = {};
  for (const pid of ["m0", "a1", "b1"]) {
    for (const n of [-1000, -800, -40, -3, 0, 5]) plan[`${pid}|${tag(n)}`] = n % 2 ? "F" : "N";
    for (const n of [-1000, -800, -40, -3]) {
      ist[`${pid}|${tag(n)}`] = { start: "06:00", ende: "14:05", bestaetigt: true, grund: "" };
      stempel[`${pid}|${tag(n)}`] = { start: "05:58", ende: "14:05", quelle: "app" };
    }
  }
  /* Ein Stempel älter als die Frist der Gründe (3 Monate), jünger als die Plandatenfrist. Mit Standort-Ergebnis
     nimmt raeumen nur die Standortfelder — das weist die Stempel-Integrität des Speicherns heute ab (Befund, 1b). */
  /* Genau an der Fristgrenze (Stichtag der Plandaten: bleibt) und einen Tag davor (fällig). */
  const grenze = A.minusMonate(HEUTE, 24);
  for (const t of [grenze, Z.tagePlus(grenze, -1)]) {
    plan[`m0|${t}`] = "F";
    ist[`m0|${t}`] = { start: "06:00", ende: "14:05", bestaetigt: true, grund: "" };
    stempel[`m0|${t}`] = { start: "05:58", ende: "14:05", quelle: "app" };
  }
  stempel[`a1|${tag(-200)}`] = { start: "06:01", ende: "14:00", quelle: "app",
    ...(mitStandort ? { geoStart: { lat: 52.5, lon: 13.4 }, innerhalbStart: true } : {}) };
  ist[`a1|${tag(-200)}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
  const alt = tag(-800).slice(0, 7);
  const jung = tag(-40).slice(0, 7);
  const abschluss = (am) => ({ abgeschlossen: true, am, wer: "l1", verlauf: [{ id: `v${am.slice(0, 7)}`, art: "abschluss", am, wer: "l1", grund: "" }] });
  return {
    id, name, branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv",
    stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: ["F", "F", "N", "N", "-", "-"], anker: "2026-01-05", zyklusLaenge: 6, gruppen: [], versatzTageVon: {},
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [],
    qualifikationen: [], genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"),
      person("l1", "leitung", "ALLE"),
      /* ausgeschieden vor 400 Tagen (Frist Stammdaten 6 Monate): wird anonymisiert */
      person("z1", "mitarbeiter", "e1", { status: "ausgeschieden", austritt: tag(-400), personalnummer: "", notiz: "privat" })],
    abweichungen: plan, planstaende: {}, freigaben: {}, unterschreitungen: [], belegung: {}, therapie: {}, aushang: [],
    /* Der Monat jenseits der Frist ist auch lohnexportiert (bestätigter Export, Revision 1). */
    monatsabschluss: { [alt]: { ...abschluss(`${alt}-28T08:00:00.000Z`), revision: 1,
      lohnexport: { am: `${alt}-28T09:00:00.000Z`, wer: "l1", abdruck: "0".repeat(32), revision: 1, stand: 1 } },
    [jung]: abschluss(`${jung}-28T08:00:00.000Z`) },
    istEingefroren: { [`m0|${tag(-800)}`]: { d: "F", std: 7.5, e: 1 }, [`m0|${tag(-40)}`]: { d: "F", std: 7.5, e: 1 } },
    standorte: [], abwesenheiten: [
      { id: "abw1", personId: "a1", art: "krank", von: tag(-210), bis: tag(-200), notiz: "Grippe" },
      { id: "abw2", personId: "m0", art: "krank", von: tag(-10), bis: tag(-9), notiz: "Erkältung" }],
    krankmeldungen: [], anfragen: [], wuensche: [], einspruenge: [], ausschreibungen: [], selbstplanung: [],
    nachrichten: [], notrufe: [], erfassung: ist, einstempeln: stempel, fahrzeiten: {}, checks: {}, ansichten: {},
    kompetenzen: [], einarbeitung: [],
    aenderungen: [{ id: "c1", personId: "a1", datum: tag(-800), zeit: "x" }, { id: "c2", personId: "a1", datum: tag(-3), zeit: "x" }],
    bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [{ id: "lalt", zeit: "1.1.2026, 08:00:00", text: "früher" }],
    notizen: {}, tagesnotizen: {}, tarif: "basis", seit: "2026-01-01", preisgestaltung: {}, kontakt: "k@example.org",
  };
}

let raumNr = 0;
async function neuerRaum({ aendern, mitStandort = false } = {}) {
  const raum = `wp48-loeschlauf-${++raumNr}`;
  const b = { version: 9, stand: 1, mandanten: [betrieb("m1", "Haus", { mitStandort }), betrieb("m2", "Haus 2", { mitStandort })] };
  if (aendern) aendern(b);
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(b)), { durch: "Pruefung" });
  const token = {};
  for (const [k, r] of Object.entries(ROLLEN)) {
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: r.betrieb || 0,
      mandantId: r.mandant || "m1", einheit: r.einheit || null, ...(r.demo ? { demo: true } : {}) }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}

const gespeichert = async (raum) => B.bestandLesenStreng(laden(), raum);
const sicherungen = async (raum) => (await laden().list({ prefix: `sicherung:${raum}:` })).blobs.length;

/** Vergleichbar: Zeitpunkte (ISO und de-DE) und die zufällige Kennung des neuesten Protokolleintrags maskiert. */
function vergleichbar(b) {
  const x = JSON.parse(JSON.stringify(b).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "ZEIT")
    .replace(/\d{1,2}\.\d{1,2}\.\d{4}, \d{1,2}:\d{2}(:\d{2})?/g, "ZEIT")
    /* Kennungen von Servermitteilungen tragen die Uhrzeit in Millisekunden (n-<art>-<ms>-<person>). */
    .replace(/(n-[a-z]+)-\d{12,14}-/g, "$1-ZEIT-"));
  for (const m of x.mandanten || []) for (const e of m.protokoll || []) if (e && e.id !== "lalt") e.id = "NEU";
  return x;
}

/** Neue Zeilen im Serverprotokoll seit `vorher` (Schlüsselmenge), als „art/ausgang/zusatz", sortiert. */
async function spurSchluessel() { return new Set((await spur().list()).blobs.map((b) => b.key)); }
async function neueZeilen(vorher) {
  const aus = [];
  for (const b of (await spur().list()).blobs) {
    if (vorher.has(b.key)) continue;
    const z = await spur().get(b.key, { type: "json" });
    if (z) aus.push(`${z.art}/${z.ausgang}/${z.zusatz || ""}`);
  }
  return aus.sort();
}

/** Der heutige Weg, wie die Oberfläche ihn geht (src/app/aktionen/ausgaben.js `loeschlauf` + mUpd + PUT). */
async function heutigerWeg(token) {
  const g = await anfrage("/api/bestand", { token });
  expect(g.status).toBe(200);
  const s2 = kopie(g.bestand);
  const m0 = s2.mandanten.find((x) => x.id === "m1");
  const vor = A.vorschau(m0, HEUTE);
  const { mandant } = A.raeumen(m0, HEUTE);
  const neu = { ...mandant, protokoll: [{ id: "lui", zeit: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }), text: `Löschlauf: ${A.berichtstext(vor)}` },
    ...(mandant.protokoll || [])].slice(0, 200) };
  const bestand = { ...s2, mandanten: s2.mandanten.map((m) => (m.id === "m1" ? neu : m)) };
  return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand, etag: g.etag, durch: "V Nl1" } });
}

/** Der neue Weg: Vorschau, dann bestätigte Ausführung. */
async function neuerWeg(token) {
  const v = await loeschlauf(token, { vorschau: true });
  expect(v.status, JSON.stringify(v)).toBe(200);
  expect(v.faellig).toBe(true);
  const r = await loeschlauf(token, { bestaetigt: v.kennung });
  return { v, r };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-loeschlauf-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  spur = () => getStore({ name: "centric-spur" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  A = await import("../server/lib/aufbewahrung.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  Z = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
describe("1. Differenzialprüfung: derselbe Löschumfang wie der heutige Weg", () => {
  it("gleicher Endstand, gleiches Betriebsprotokoll, gleiche Schreibzeilen, gleiche Schutzsicherungen", async () => {
    const alt = await neuerRaum();
    const neu = await neuerRaum();
    const vorher = await gespeichert(alt.raum);
    expect(vergleichbar((await gespeichert(neu.raum)).bestand)).toEqual(vergleichbar(vorher.bestand));
    const sA0 = await sicherungen(alt.raum); const sN0 = await sicherungen(neu.raum);

    const k1 = await spurSchluessel();
    const rAlt = await heutigerWeg(alt.token.LT);
    const zeilenAlt = await neueZeilen(k1);
    expect(rAlt.status, JSON.stringify(rAlt)).toBe(200);

    const k2 = await spurSchluessel();
    const { v, r: rNeu } = await neuerWeg(neu.token.LT);
    const zeilenNeu = await neueZeilen(k2);
    expect(rNeu.status, JSON.stringify(rNeu)).toBe(200);
    expect(rNeu.ausgefuehrt).toBe(true);
    expect(rNeu.bericht).toBe(v.bericht);

    const a = await gespeichert(alt.raum);
    const n = await gespeichert(neu.raum);
    expect(vergleichbar(n.bestand)).toEqual(vergleichbar(a.bestand));
    expect(n.stand).toBe(a.stand);
    /* Der Löschlauf hat tatsächlich gelöscht (sonst wäre der Vergleich leer). */
    expect(vergleichbar(a.bestand)).not.toEqual(vergleichbar(vorher.bestand));
    /* Schutzsicherungen: gleich viele neue. */
    expect((await sicherungen(neu.raum)) - sN0).toBe((await sicherungen(alt.raum)) - sA0);
    /* Serverprotokoll: jede Zeile des heutigen Wegs auch im neuen; zusätzlich nur Zeilen der Art loeschlauf. */
    const ohneLoeschlauf = zeilenNeu.filter((z) => !z.startsWith("loeschlauf/"));
    expect(ohneLoeschlauf).toEqual(zeilenAlt.filter((z) => !z.startsWith("lesen")));
    expect(zeilenNeu.some((z) => z.startsWith("loeschlauf/vorschau/"))).toBe(true);
    expect(zeilenNeu.some((z) => z === `loeschlauf/erfolg/Leitung: ${v.bericht}`)).toBe(true);
    expect(zeilenAlt.some((z) => z.startsWith("schreiben/loeschlauf/"))).toBe(true);
  });

  it("was gelöscht wird und was bleibt (aufbewahrungspflichtig, abgeschlossener Monat in der Frist, zweiter Betrieb)", async () => {
    const r = await neuerRaum();
    const vorher = await gespeichert(r.raum);
    const { r: e } = await neuerWeg(r.token.LT);
    expect(e.status).toBe(200);
    const nach = (await gespeichert(r.raum)).bestand;
    const m = nach.mandanten.find((x) => x.id === "m1");
    for (const pid of ["m0", "a1", "b1"]) {
      for (const n of [-1000, -800]) {
        expect(m.abweichungen[`${pid}|${tag(n)}`]).toBeUndefined();
        expect(m.erfassung[`${pid}|${tag(n)}`]).toBeUndefined();
        expect(m.einstempeln[`${pid}|${tag(n)}`]).toBeUndefined();
      }
      for (const n of [-40, -3]) {
        expect(m.erfassung[`${pid}|${tag(n)}`]).toBeDefined();
        expect(m.einstempeln[`${pid}|${tag(n)}`]).toBeDefined();
      }
    }
    /* Exakte Fristgrenze: der Stichtag selbst bleibt, der Tag davor ist gelöscht. */
    const grenze = A.minusMonate(HEUTE, 24);
    for (const feld of ["abweichungen", "erfassung", "einstempeln"]) {
      expect(m[feld][`m0|${grenze}`], `${feld} Stichtag`).toBeDefined();
      expect(m[feld][`m0|${Z.tagePlus(grenze, -1)}`], `${feld} Stichtag-1`).toBeUndefined();
    }
    /* Abgeschlossener Monat innerhalb der Frist: Abschluss, Freeze, Ist und Stempel unverändert. */
    const jung = tag(-40).slice(0, 7);
    const vm = vorher.bestand.mandanten.find((x) => x.id === "m1");
    expect(m.monatsabschluss[jung]).toEqual(vm.monatsabschluss[jung]);
    expect(m.istEingefroren[`m0|${tag(-40)}`]).toEqual(vm.istEingefroren[`m0|${tag(-40)}`]);
    /* Das eingefrorene Ist bleibt über das Speichern unberührt, auch jenseits der Frist — heute wie neu (1.); es
       entfernt nur der tägliche Datenschutzlauf. */
    expect(m.istEingefroren).toEqual(vm.istEingefroren);
    expect(m.monatsabschluss).toEqual(vm.monatsabschluss);
    /* Stempel innerhalb der Plandatenfrist bleibt. */
    expect(m.einstempeln[`a1|${tag(-200)}`]).toEqual({ start: "06:01", ende: "14:00", quelle: "app" });
    /* Ausgeschiedene Person anonymisiert, Gründe vorbei → entfernt, laufende bleiben. */
    const z1 = m.personen.find((p) => p.id === "z1");
    expect(z1.anonym).toBe(true);
    expect(z1.notiz).toBe("");
    expect(m.abwesenheiten.find((x) => x.id === "abw1").notiz).toBe("");
    expect(m.abwesenheiten.find((x) => x.id === "abw2").notiz).toBe("Erkältung");
    expect(m.aenderungen.map((c) => c.id)).toEqual(["c2"]);
    expect(m.protokoll[0].text).toBe(`Löschlauf: ${e.bericht}`);
    /* Mandantentrennung: der zweite Betrieb im Raum unverändert. */
    expect(nach.mandanten.find((x) => x.id === "m2")).toEqual(vorher.bestand.mandanten.find((x) => x.id === "m2"));
  });

  /* 1b. Befund (unverändert übernommen, keine neue Regel): Trägt ein Stempel zwischen der Frist der Gründe und der
     Plandatenfrist noch Standortfelder, nimmt raeumen sie heraus — die Stempel-Integrität des Speicherns weist das
     ab (weggelassenes Originalfeld in einem bekannten Monat). Der heutige Weg scheitert dann mit 403, der neue genauso;
     keiner löscht etwas. Die Standortfelder entfernt der tägliche Datenschutzlauf (Modus „an"). */
  it("1b. Standortfelder im Fenster Gründe–Plandaten: beide Wege gleich abgewiesen, nichts gelöscht", async () => {
    const alt = await neuerRaum({ mitStandort: true });
    const neu = await neuerRaum({ mitStandort: true });
    const vA = await gespeichert(alt.raum); const vN = await gespeichert(neu.raum);
    const rAlt = await heutigerWeg(alt.token.LT);
    const { r: rNeu } = await neuerWeg(neu.token.LT);
    expect(rAlt.status).toBe(403);
    expect(rNeu.status).toBe(rAlt.status);
    expect(rNeu.code).toBe(rAlt.code);
    expect(rNeu.code).toBe("STEMPEL_UNVERAENDERLICH");
    expect((await gespeichert(alt.raum)).bestand).toEqual(vA.bestand);
    expect((await gespeichert(neu.raum)).bestand).toEqual(vN.bestand);
  });
});

describe("2. Schalter", () => {
  it("aus: 404, nichts geändert; der heutige Weg löscht weiter", async () => {
    const r = await neuerRaum();
    const vorher = await gespeichert(r.raum);
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    try {
      for (const w of [{ vorschau: true }, { bestaetigt: "0".repeat(32) }]) {
        const a = await loeschlauf(r.token.LT, w);
        expect(a.status).toBe(404);
      }
      for (const wert of ["1", "TRUE", "yes", " true"]) {
        process.env.CENTRIC_TEILSPEICHERUNG = wert;
        expect((await loeschlauf(r.token.LT, { vorschau: true })).status).toBe(404);
      }
      delete process.env.CENTRIC_TEILSPEICHERUNG;
      expect((await gespeichert(r.raum)).stand).toBe(vorher.stand);
      const h = await heutigerWeg(r.token.LT);
      expect(h.status).toBe(200);
      const m = (await gespeichert(r.raum)).bestand.mandanten.find((x) => x.id === "m1");
      expect(m.einstempeln[`m0|${tag(-800)}`]).toBeUndefined();
    } finally { process.env.CENTRIC_TEILSPEICHERUNG = "true"; }
  });
});

describe("3. Rechte", () => {
  it("Kundenrolle, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber: 403, nichts geändert", async () => {
    const r = await neuerRaum();
    const vorher = await gespeichert(r.raum);
    const kennung = (await loeschlauf(r.token.LT, { vorschau: true })).kennung;
    for (const k of ["KU", "PL", "SV", "MA", "BR", "BT"]) {
      for (const w of [{ vorschau: true }, { bestaetigt: kennung }]) {
        const a = await loeschlauf(r.token[k], w);
        expect(a.status, `${k} ${JSON.stringify(w)}`).toBe(403);
      }
    }
    expect(await loeschlauf(null, { vorschau: true })).toMatchObject({ status: 401 });
    const nach = await gespeichert(r.raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(nach.bestand).toEqual(vorher.bestand);
  });

  it("Kundenrolle: der Weg über das Speichern bleibt ihr unverändert (Review M2)", async () => {
    const ohneKrank = (b) => { for (const m of b.mandanten) m.abwesenheiten = m.abwesenheiten.map((x) => ({ ...x, art: "urlaub" })); };
    const r = await neuerRaum({ aendern: ohneKrank });
    expect((await loeschlauf(r.token.KU, { vorschau: true })).code).toBe("LOESCHLAUF_ROLLE");
    expect((await heutigerWeg(r.token.KU)).status).toBe(200);
  });

  it("Demozugang mit Rolle Leitung: wie die Leitung", async () => {
    const r = await neuerRaum();
    const { r: e } = await neuerWeg(r.token.DL);
    expect(e.status, JSON.stringify(e)).toBe(200);
    expect(e.ausgefuehrt).toBe(true);
  });
});

describe("4. Form, Vorschau, Idempotenz, Konflikte", () => {
  it("ungültige Aufträge: 422 (kein JSON-Objekt: 400 schon beim Lesen des Rumpfs), nichts geändert", async () => {
    const r = await neuerRaum();
    const vorher = await gespeichert(r.raum);
    for (const w of [{}, { vorschau: false }, { vorschau: "ja" }, { bestaetigt: "abc" }, { bestaetigt: 5 },
      { vorschau: true, bestaetigt: "0".repeat(32) }, { vorschau: true, bestand: {} }, []]) {
      const a = await loeschlauf(r.token.LT, w);
      expect(a.status, JSON.stringify(w)).toBe(422);
    }
    expect((await loeschlauf(r.token.LT, "x")).status).toBe(400);
    expect((await gespeichert(r.raum)).stand).toBe(vorher.stand);
  });

  it("Vorschau schreibt nichts und nennt nur Zahlen", async () => {
    const r = await neuerRaum();
    const vorher = await gespeichert(r.raum);
    const v = await loeschlauf(r.token.LT, { vorschau: true });
    expect(v.status).toBe(200);
    expect(v.ausgefuehrt).toBe(false);
    expect(v.kennung).toMatch(/^[0-9a-f]{32}$/);
    const m = (await anfrage("/api/bestand", { token: r.token.LT })).bestand.mandanten.find((x) => x.id === "m1");
    expect(v.bericht).toBe(A.berichtstext(A.vorschau(m, HEUTE)));
    expect(v.zahlen.personen).toBe(1);
    expect(JSON.stringify(v)).not.toMatch(/z1@example\.org|"Nz1"|"z1"/);
    const nach = await gespeichert(r.raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(nach.bestand).toEqual(vorher.bestand);
  });

  it("idempotent: dieselbe Bestätigung noch einmal schreibt nichts", async () => {
    const r = await neuerRaum();
    const { v, r: e } = await neuerWeg(r.token.LT);
    expect(e.ausgefuehrt).toBe(true);
    const nach1 = await gespeichert(r.raum);
    /* Dieselbe Bestätigung noch einmal (Doppelklick, Wiederholung nach Netzfehler): Das Fällige hat sich durch den
       ersten Lauf geändert → 409 ohne Schreiben; oder nichts mehr fällig → 200 ohne Schreiben. Nie ein zweiter Lauf. */
    for (let i = 0; i < 2; i++) {
      const zweit = await loeschlauf(r.token.LT, { bestaetigt: v.kennung });
      expect([200, 409]).toContain(zweit.status);
      expect(zweit.ausgefuehrt).not.toBe(true);
    }
    const v2 = await loeschlauf(r.token.LT, { vorschau: true });
    expect(v2.kennung).not.toBe(v.kennung);
    /* Was nach dem Lauf noch als fällig gilt, ist nur, was das Speichern heute nicht löscht (eingefrorenes Ist,
       Sache des Datenschutzlaufs) — keine Stempel, Ist- oder Planeinträge mehr. */
    expect(v2.zahlen.plandaten.abweichungen).toBe(0);
    expect(v2.zahlen.plandaten.erfassung).toBe(0);
    expect(v2.zahlen.plandaten.einstempeln).toBe(0);
    expect(v2.zahlen.personen).toBe(0);
    /* Review M1: Die neue Vorschau ist (wegen des eingefrorenen Ists eines abgeschlossenen, lohnexportierten Monats
       jenseits der Frist) noch „fällig". Dreimal ihre Bestätigung: kein Lauf, kein Schreiben, kein Protokolleintrag. */
    expect(v2.faellig).toBe(true);
    expect(v2.zahlen.plandaten.istEingefroren).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const w = await loeschlauf(r.token.LT, { bestaetigt: v2.kennung });
      expect(w.status, JSON.stringify(w)).toBe(200);
      expect(w.ausgefuehrt).toBe(false);
      expect(w.ohneWirkung).toBe(true);
    }
    const nach2 = await gespeichert(r.raum);
    const prot = nach2.bestand.mandanten.find((x) => x.id === "m1").protokoll;
    expect(prot.filter((x) => String(x.text).startsWith("Löschlauf:"))).toHaveLength(1);
    expect(prot.map((x) => x.id)).toContain("lalt");
    expect(nach2.stand).toBe(nach1.stand);
    expect(nach2.bestand).toEqual(nach1.bestand);

    /* Delta-Review A1, Tageswechsel: Der letzte Lauf war gestern (zuletztGeraeumt = gestern, wie am Folgetag). raeumen
       setzt das Datum auf heute — das allein ist keine Wirkung: kein Schreiben, kein Eintrag, Datum unverändert. */
    const gestern = tag(-1);
    const b = kopie(nach2.bestand);
    const m1 = b.mandanten.find((x) => x.id === "m1");
    m1.aufbewahrung = { ...(m1.aufbewahrung || {}), zuletztGeraeumt: gestern };
    await B.bestandSchreiben(laden(), r.raum, b, { erwarteterStand: nach2.stand, durch: "Pruefung" });
    const vorTag = await gespeichert(r.raum);
    const v3 = await loeschlauf(r.token.LT, { vorschau: true });
    expect(v3.faellig).toBe(true);
    const w3 = await loeschlauf(r.token.LT, { bestaetigt: v3.kennung });
    expect(w3.status, JSON.stringify(w3)).toBe(200);
    expect(w3.ausgefuehrt).toBe(false);
    expect(w3.ohneWirkung).toBe(true);
    expect(w3.text).toContain("Modus „an“");
    const nachTag = await gespeichert(r.raum);
    expect(nachTag.stand).toBe(vorTag.stand);
    expect(nachTag.bestand).toEqual(vorTag.bestand);
    expect(nachTag.bestand.mandanten.find((x) => x.id === "m1").aufbewahrung.zuletztGeraeumt).toBe(gestern);
    expect(nach2.stand).toBe(nach1.stand);
    expect(nach2.bestand).toEqual(nach1.bestand);
  });

  it("veraltete oder fremde Bestätigung: 409, nichts gelöscht", async () => {
    const r = await neuerRaum();
    const v = await loeschlauf(r.token.LT, { vorschau: true });
    const falsch = await loeschlauf(r.token.LT, { bestaetigt: "0".repeat(32) });
    expect(falsch.status).toBe(409);
    expect(falsch.code).toBe("LOESCHLAUF_VORSCHAU_VERALTET");
    expect(falsch.bestand).toBeUndefined();
    /* Seit der Vorschau ist mehr fällig geworden (ein weiterer alter Eintrag). */
    const g = await gespeichert(r.raum);
    const b = kopie(g.bestand);
    b.mandanten[0].abweichungen[`b1|${tag(-900)}`] = "F";
    await B.bestandSchreiben(laden(), r.raum, b, { erwarteterStand: g.stand, durch: "Pruefung" });
    const vorher = await gespeichert(r.raum);
    const e = await loeschlauf(r.token.LT, { bestaetigt: v.kennung });
    expect(e.status).toBe(409);
    expect(e.code).toBe("LOESCHLAUF_VORSCHAU_VERALTET");
    const nach = await gespeichert(r.raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(nach.bestand).toEqual(vorher.bestand);
  });

  it("ungültige Fristen: 422, nichts gelöscht (fail-closed)", async () => {
    const r = await neuerRaum({ aendern: (b) => { b.mandanten[0].aufbewahrung = { plandatenMonate: 0.5 }; } });
    const vorher = await gespeichert(r.raum);
    for (const w of [{ vorschau: true }, { bestaetigt: "0".repeat(32) }]) {
      const a = await loeschlauf(r.token.LT, w);
      expect(a.status).toBe(422);
      expect(a.code).toBe("LOESCHLAUF_FRISTEN");
    }
    expect((await gespeichert(r.raum)).bestand).toEqual(vorher.bestand);
  });

  it("Mandantentrennung: die Leitung des zweiten Betriebs löscht nur dort", async () => {
    const r = await neuerRaum();
    const vorher = await gespeichert(r.raum);
    const { r: e } = await neuerWeg(r.token.LT2);
    expect(e.status).toBe(200);
    const nach = (await gespeichert(r.raum)).bestand;
    expect(nach.mandanten.find((x) => x.id === "m1")).toEqual(vorher.bestand.mandanten.find((x) => x.id === "m1"));
    expect(nach.mandanten.find((x) => x.id === "m2").einstempeln[`m0|${tag(-800)}`]).toBeUndefined();
  });

  it("leerer Raum und Betrieb ohne Personenliste: abgewiesen, nichts geschrieben", async () => {
    const leer = (await sitzungAnlegen({ bestand: "wp48-loeschlauf-leer", name: "V Nl1", rolle: "leitung", person: "l1", betrieb: 0,
      mandantId: "m1", einheit: null }, 3600 * 1000)).token;
    /* Ohne Bestand gilt die Sitzung schon nicht (401, vor dem Weg); nie eine Antwort mit Inhalt, nie ein Schreiben. */
    const a = await loeschlauf(leer, { vorschau: true });
    expect([401, 404]).toContain(a.status);
    expect(await B.bestandLesen(laden(), "wp48-loeschlauf-leer")).toBeFalsy();
    const r = await neuerRaum({ aendern: (b) => { delete b.mandanten[0].personen; } });
    const vorher = await gespeichert(r.raum);
    /* Ohne Personenliste findet die Sitzung ihre Person nicht (401 vor dem Weg); „Keine Daten.“ (404) ist die
       zweite Linie im Weg selbst. */
    const c = await loeschlauf(r.token.LT, { vorschau: true });
    expect([401, 404]).toContain(c.status);
    expect((await gespeichert(r.raum)).stand).toBe(vorher.stand);
  }, 30000);   // eigener Raum mit Sitzungen; ohne Aufruf-Option sonst nahe an der Vorgabe von 5 s (Delta-Review A4)

  it("zweite Linie: Betrieb nicht in der Sicht oder ohne Personenliste → fehlt (404 „Keine Daten.“)", async () => {
    const L = await import("../server/lib/loeschlauf.mjs");
    expect(L.loeschlaufVorbereiten({ mandanten: [{ id: "m1" }] }, "m1", HEUTE, { vorschau: true })).toEqual({ fehlt: true });
    expect(L.loeschlaufVorbereiten({ mandanten: [{ id: "m2", personen: [] }] }, "m1", HEUTE, { vorschau: true })).toEqual({ fehlt: true });
    expect(L.loeschlaufVorbereiten(null, "m1", HEUTE, { vorschau: true })).toEqual({ fehlt: true });
  });

  it("Bremse: eigene Art loeschlauf, darüber 429", async () => {
    const r = await neuerRaum();
    const alt = schutz.GRENZEN.loeschlauf;
    expect(alt).toBeDefined();
    schutz.GRENZEN.loeschlauf = { versuche: 2, fenster: 60, sperre: 60 };
    try {
      const st = [];
      for (let i = 0; i < 4; i++) st.push((await loeschlauf(r.token.LT, { vorschau: true })).status);
      expect(st.slice(0, 2)).toEqual([200, 200]);
      expect(st.slice(2)).toContain(429);
    } finally { schutz.GRENZEN.loeschlauf = alt; }
  });

  it("unlesbarer Bestand: 503, nichts geschrieben", async () => {
    const r = await neuerRaum();
    const v = await loeschlauf(r.token.LT, { vorschau: true });
    const { blobs } = await laden().list({ prefix: `scherbe:${r.raum}:` });
    const ziel = blobs.find((x) => x.key.endsWith(tag(-800).slice(0, 7)));
    expect(ziel).toBeDefined();
    const roh = await laden().get(ziel.key);
    await laden().set(ziel.key, "{kaputt");
    try {
      const e = await loeschlauf(r.token.LT, { bestaetigt: v.kennung });
      expect(e.status).toBe(503);
      expect(e.code).toBe("BESTAND_UNLESBAR");
    } finally { await laden().set(ziel.key, roh); }
    /* Wiederhergestellt: nichts wurde geschrieben, dieselbe Vorschau gilt noch. */
    const v2 = await loeschlauf(r.token.LT, { vorschau: true });
    expect(v2.kennung).toBe(v.kennung);
  });
});
