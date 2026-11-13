/* ==========================================================================
   WP-48.3 TEILSPEICHERUNG — POST /api/bestand/teile über den echten Handler

   Grundsatz (docs/acc45/WP48-TEILSPEICHERUNG.md 2.1): Ein Teil-PUT ist der
   Voll-PUT von Sicht(gespeichert) ⊕ Δ. Geprüft wird hier, mit Dateiablage
   und echten Sitzungen:

   1. Gleichwertigkeit je Rolle (Leitung, Planung, Kundenrolle,
      Schichtverantwortung, Beschäftigte): Für feste und zufällige Deltas
      (fester Startwert) sind Statuscode und gespeicherter Stand von
      Teil-PUT(Δ) und Voll-PUT(GET-Sicht ⊕ Δ) auf zwei gleichen Räumen
      gleich. Weist der Teilweg früher ab (Form, Grobprüfung), schreibt er
      nichts — er ist nie großzügiger als der Voll-PUT.
   2. Versionen und Erwartungswerte: richtige Version → 200; veraltete →
      409 ohne Verlust; zwei Schreiber auf verschiedene Zellen überleben
      beide; dieselbe Zelle → genau einer gewinnt; Teil-PUT gegen Stempel im
      selben Monat → kein Konflikt (heute: 409 im Voll-PUT).
   3. Epoche, Idempotenz, Schalter, Form (nur-Server-Felder, null, Grenzen).
   4. Befund §7: gespeicherte abgeleitete Personenfelder — Rundweg für jede
      Rolle wirkungslos, die Schichtverantwortung bekommt kein 403 mehr.
   5. Größe: 150 Personen × 12 Monate mit Stempeln — Voll-PUT läge über
      6 MB (413), der Teil-PUT einer Einteilung bleibt unter 2 KB und geht.

   Aufruf: npx vitest run pruefungen/wp48-teilweg.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ABGELEITETE_PERSONENFELDER as ABGELEITET } from "../server/lib/planungsregeln.mjs";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen, Z;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.49.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: typeof rumpf === "string" ? rumpf : JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const teile = (token, rumpf) => anfrage("/api/bestand/teile", { methode: "POST", token, rumpf });

const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  KU: { rolle: "kunde", person: null },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
  BR: { rolle: "betriebsrat", person: "r1" },
  BT: { rolle: "betreiber", person: null },
  /* Demozugänge mit ausdrücklicher Rolle (RB-3) */
  DL: { rolle: "leitung", person: "l1", demo: true },
  DP: { rolle: "planer", person: "p1", demo: true },
  /* ein zweiter Betrieb im selben Raum (Sitzung betrieb 1) */
  PL2: { rolle: "planer", person: "p1", betrieb: 1, mandant: "m2" },
  SV2: { rolle: "subplaner", person: "s1", einheit: "e1", betrieb: 1, mandant: "m2" },
  MA2: { rolle: "mitarbeiter", person: "m0", betrieb: 1, mandant: "m2" },
};
const SCHREIBER = ["LT", "PL", "KU", "SV", "MA"];
const WEITERE = ["DL", "DP", "PL2", "SV2", "MA2"];

let HEUTE, tag;

/* Prüfbetrieb wie pruefungen/wp48-rundweg.test.js (Positivkatalog belegt), hier in der für den Teilweg nötigen Breite. */
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org`, ...extra });

function reicherBestand() {
  const p = (n) => tag(n);
  const plan = {}; const ist = {}; const stempel = {};
  for (const pid of ["m0", "a1", "b1", "s1", "r1", "x1"]) {
    for (const n of [-40, -35, -3, -1, 0, 2, 20, 40]) plan[`${pid}|${p(n)}`] = n % 2 ? "F" : "N";
    for (const n of [-40, -3, -1]) {
      ist[`${pid}|${p(n)}`] = { start: "06:00", ende: "14:05", bestaetigt: true, grund: pid === "b1" ? "Stau" : "" };
      stempel[`${pid}|${p(n)}`] = { start: "05:58", ende: "14:05", quelle: "app" };
    }
  }
  stempel[`m0|${p(0)}`] = { start: "05:59", quelle: "app" };
  const abgeschlossen = p(-40).slice(0, 7);
  return { version: 9, stand: 1, mandanten: [{
    id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv",
    stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: ["F", "F", "N", "N", "-", "-"], anker: "2026-01-05", zyklusLaenge: 6, gruppen: [], versatzTageVon: {},
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [],
    qualifikationen: [], genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1", { notiz: "privat", iban: "DE00" }),
      person("b1", "mitarbeiter", "e2"), person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("x1", "mitarbeiter", "e1", { mutterschutzEinwilligungen: [] }),
      person("k1", "mitarbeiter", "e1")],
    abweichungen: plan, planstaende: {}, freigaben: {}, unterschreitungen: [], belegung: {}, therapie: {}, aushang: [],
    monatsabschluss: { [abgeschlossen]: { abgeschlossen: true, am: "2026-01-02T08:00:00.000Z", wer: "l1",
      verlauf: [{ id: "v1", art: "abschluss", am: "2026-01-02T08:00:00.000Z", wer: "l1", grund: "" }] } },
    istEingefroren: { [`m0|${p(-40)}`]: { d: "F", std: 7.5, e: 1 } },
    standorte: [], abwesenheiten: [
      { id: "abw1", personId: "a1", art: "krank", von: p(5), bis: p(6), notiz: "Grippe" },
      { id: "abw2", personId: "m0", art: "urlaub", von: p(10), bis: p(12), notiz: "" }],
    krankmeldungen: [{ id: "km1", personId: "k1", von: p(7), bis: p(7), notiz: "", status: "eingegangen",
      verlauf: [{ schritt: "eingegangen", von: "k1", rolle: "mitarbeiter", zeit: "2026-01-01T06:00:00.000Z" }] }], anfragen: [{ id: "an1", personId: "m0", art: "urlaub", von: p(30), bis: p(31), status: "offen", zeit: "2026-01-01" }],
    wuensche: [], einspruenge: [], ausschreibungen: [], selbstplanung: [],
    nachrichten: [{ id: "n1", an: "m0", von: "p1", text: "Hallo", zeit: "2026-01-01" }],
    notrufe: [], erfassung: ist, einstempeln: stempel, fahrzeiten: {}, checks: {}, ansichten: {},
    kompetenzen: [], einarbeitung: [], aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [],
    notizen: {}, tagesnotizen: {}, tarif: "basis", seit: "2026-01-01", preisgestaltung: {}, kontakt: "k@example.org",
  }] };
}

let raumNr = 0;
async function neuerRaum({ rollen = SCHREIBER.concat(["BR", "BT"]), aendern } = {}) {
  const raum = `wp48-teilweg-${++raumNr}`;
  const b = reicherBestand();
  /* Rollen eines zweiten Betriebs: derselbe Prüfbetrieb noch einmal als m2 (eigene Kennung, eigener Name). */
  if (rollen.some((k) => ROLLEN[k].mandant === "m2")) b.mandanten.push({ ...kopie(b.mandanten[0]), id: "m2", name: "Haus 2" });
  if (aendern) aendern(b);
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(b)), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: r.betrieb || 0,
      mandantId: r.mandant || "m1", einheit: r.einheit || null, ...(r.demo ? { demo: true } : {}) }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}

/** Was auf der Platte liegt (Bestand, Scherben). */
async function gespeichert(raum) {
  const g = await B.bestandLesenStreng(laden(), raum);
  const { blobs } = await laden().list({ prefix: `scherbe:${raum}:` });
  return { bestand: g.bestand, stand: g.stand, epoche: g.epoche, scherben: blobs.map((x) => x.key.replace(`scherbe:${raum}:`, "")).sort() };
}
/** Vergleichbar: Zeitpunkte maskiert (entstehen beim Schreiben), sonst tief gleich. */
const vergleichbar = (b) => JSON.parse(JSON.stringify(b).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "ZEIT")
  .replace(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}(:\d{2})?/g, "ZEIT"));

/** Unabhängig vom Server (Orakel): stabiles JSON und Version wie im Entwurf 2.2. */
function stabil(x) {
  if (x === undefined) return "null";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
}
const version = (x) => createHash("sha256").update(stabil(x)).digest("hex").slice(0, 32);

/** Δ aus einer Beschreibung und der GET-Antwort: Erwartungswerte und Basisversionen aus der Sicht. */
function deltaAus(g, besch, extra = {}, mid = "m1") {
  const m = g.bestand.mandanten.find((x) => x.id === mid);
  const kern = {};
  for (const [feld, fn] of Object.entries(besch.kern || {}))
    kern[feld] = { basis: g.teile.versionen[`kern:${feld}`] ?? version(m[feld]), wert: fn(kopie(m[feld])) };
  const zellen = (besch.zellen || []).map((z) => ({ feld: z.feld, k: z.k,
    alt: Object.prototype.hasOwnProperty.call(m[z.feld] || {}, z.k) ? m[z.feld][z.k] : null, neu: z.neu }));
  return { format: 1, epoche: g.teile.epoche, durch: "Pruefung", ...(Object.keys(kern).length ? { kern } : {}),
    ...(zellen.length ? { zellen } : {}), ...extra };
}
/** Voll-PUT-Rumpf: dieselbe Sicht ⊕ Δ, hier unabhängig vom Server gebaut. */
function vollAus(g, besch, mid = "m1") {
  const b = kopie(g.bestand);
  const m = b.mandanten.find((x) => x.id === mid);
  for (const [feld, fn] of Object.entries(besch.kern || {})) m[feld] = fn(kopie(m[feld]));
  for (const z of besch.zellen || []) {
    m[z.feld] = { ...(m[z.feld] || {}) };
    if (z.neu === null) delete m[z.feld][z.k]; else m[z.feld][z.k] = z.neu;
  }
  return { bestand: b, etag: g.etag, durch: "Pruefung" };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-teilweg-"));
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
  G = await import("../server/lib/gestalt.mjs");
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
/* Deltas: jede Segmentart × erlaubt/verboten/fremde Person/fremder Bereich/abgeschlossener Monat. */
function feste(k) {
  const selbst = ROLLEN[k].person || "p1";
  const istNeu = { start: "06:00", ende: "14:00", bestaetigt: false, grund: "" };
  return [
    ["Plan eigene Person, künftig", { zellen: [{ feld: "abweichungen", k: `${selbst}|${tag(21)}`, neu: "F" }] }],
    ["Plan Person im Bereich der SV (a1)", { zellen: [{ feld: "abweichungen", k: `a1|${tag(22)}`, neu: "N" }] }],
    ["Plan Person fremder Bereich (b1)", { zellen: [{ feld: "abweichungen", k: `b1|${tag(22)}`, neu: "N" }] }],
    ["Plan löschen (a1)", { zellen: [{ feld: "abweichungen", k: `a1|${tag(20)}`, neu: null }] }],
    ["Plan zwei Monate auf einmal", { zellen: [{ feld: "abweichungen", k: `a1|${tag(23)}`, neu: "F" },
      { feld: "abweichungen", k: `a1|${tag(55)}`, neu: "N" }] }],
    ["Ist neu, eigene Person, ungestempelt", { zellen: [{ feld: "erfassung", k: `${selbst}|${tag(-2)}`, neu: istNeu }] }],
    ["Ist neu, Person a1, ungestempelt", { zellen: [{ feld: "erfassung", k: `a1|${tag(-2)}`, neu: istNeu }] }],
    ["Ist eines gestempelten Tags ändern (a1)", { zellen: [{ feld: "erfassung", k: `a1|${tag(-3)}`, neu: { ...istNeu, start: "07:00" } }] }],
    ["Ist im abgeschlossenen Monat (l1)", { zellen: [{ feld: "erfassung", k: `l1|${tag(-40)}`, neu: istNeu }] }],
    ["Kern dienstarten ändern", { kern: { dienstarten: (w) => w.map((d) => (d.id === "F" ? { ...d, ende: "14:15" } : d)) } }],
    ["Kern freigaben: Monat freigeben (plan.publish)", { kern: { freigaben: (w) => ({ ...(w || {}), [tag(20).slice(0, 7)]: { stand: 1, zeit: "x", durch: "P" } }) } }],
    ["Kern abwesenheiten: Krankheit neu (eigene Person)", { kern: { abwesenheiten: (w) => [...(w || []),
      { id: "abwN", personId: selbst, art: "krank", von: tag(15), bis: tag(15), notiz: "" }] } }],
    ["Kern abwesenheiten: Krankheit a1 entfernen", { kern: { abwesenheiten: (w) => (w || []).filter((a) => a.id !== "abw1") } }],
    ["Kern personen: Telefon anderer Person", { kern: { personen: (w) => w.map((p) => (p.id === "a1" ? { ...p, telefon: "999" } : p)) } }],
    ["Kern personen: eigene Rolle anheben", { kern: { personen: (w) => w.map((p) => (p.id === selbst ? { ...p, rolle: "leitung" } : p)) } }],
    ["Kern wuensche: eigener Eintrag", { kern: { wuensche: (w) => [...(w || []), { id: "wN", personId: selbst, datum: tag(25), art: "frei" }] } }],
    ["Kern einstellungen ändern", { kern: { einstellungen: (w) => ({ ...(w || {}), ruhezeit: 12 }) } }],
    /* Differenzabsichten aus dem Review von PR #224 */
    ["Kern planstaende setzen", { kern: { planstaende: (w) => ({ ...(w || {}), [tag(20).slice(0, 7)]: { stand: 2, zeit: "x", durch: "P" } }) } }],
    ["Kern krankmeldungen: Fall endgültig bestätigen (gefälscht)", { kern: { krankmeldungen: (w) => (w || []).map((x) => (x.id === "km1" ? { ...x, status: "endgueltig_bestaetigt" } : x)) } }],
    ["Kern nachrichten: Servermitteilung planFreigegeben (gefälscht)", { kern: { nachrichten: (w) => [...(w || []),
      { id: "nS", an: "m0", von: "p1", art: "planFreigegeben", quelle: "server", titel: "Plan", text: "x", zeit: "2026-01-01" }] } }],
    ["Kern matrix ändern", { kern: { matrix: () => ({ mitarbeiter: ["org.edit", "plan.publish"] }) } }],
    ["Kern rollennamen ändern", { kern: { rollennamen: (w) => ({ ...(w || {}), leitung: "Chef" }) } }],
    ["Kern personen: andere Person zur Leitung machen", { kern: { personen: (w) => w.map((p) => (p.id === "a1" ? { ...p, rolle: "leitung" } : p)) } }],
    ["Kern personen: Person löschen (b1)", { kern: { personen: (w) => w.filter((p) => p.id !== "b1") } }],
    ["Kern bestaetigungen: Eintrag anlegen", { kern: { bestaetigungen: (w) => [...(w || []),
      { id: "bq1", personId: "a1", datum: tag(21), regel: "ruhezeit", wer: selbst, am: "2026-01-01T00:00:00.000Z" }] } }],
    ["Kern standorte: Standort anlegen", { kern: { standorte: (w) => [...(w || []), { id: "st9", name: "Haus", lat: 52.5, lon: 13.4, radius: 100 }] } }],
    ["Kern abwesenheiten: Urlaub zu Krankheit (abw2)", { kern: { abwesenheiten: (w) => (w || []).map((a) => (a.id === "abw2" ? { ...a, art: "krank" } : a)) } }],
    ["Ist gestempelter Tag löschen (m0)", { zellen: [{ feld: "erfassung", k: `m0|${tag(-3)}`, neu: null }] }],
    ["Zelle mit Schlüssel __proto__", { zellen: [{ feld: "abweichungen", k: `__proto__|${tag(21)}`, neu: "N" }] }],
    ["Zelle für unbekannte Person", { zellen: [{ feld: "abweichungen", k: `unbekannt|${tag(21)}`, neu: "N" }] }],
  ];
}

/** Zufällige Zelldeltas mit festem Startwert (Eigenschaftsprüfung). */
function zufaellige(k, anzahl) {
  let z = 0x48ab3 + k.charCodeAt(0) * 31 + k.charCodeAt(1);
  const r = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 2 ** 32; };
  const wahl = (l) => l[Math.floor(r() * l.length)];
  const aus = [];
  for (let i = 0; i < anzahl; i++) {
    const zellen = [];
    const n = 1 + Math.floor(r() * 3);
    const gesehen = new Set();
    for (let j = 0; j < n; j++) {
      const pid = wahl(["m0", "a1", "b1", "s1", "x1", "l1"]);
      const feld = r() < 0.75 ? "abweichungen" : "erfassung";
      const d = feld === "abweichungen" ? wahl([2, 3, 20, 21, 33, 40]) : wahl([-2, -4, -5]);
      const key = `${pid}|${tag(d)}`;
      if (gesehen.has(`${feld}${key}`)) continue;
      gesehen.add(`${feld}${key}`);
      zellen.push({ feld, k: key, neu: feld === "abweichungen" ? wahl(["F", "N", null]) : wahl([null, { start: "06:00", ende: "14:00", bestaetigt: false, grund: "" }]) });
    }
    aus.push([`Zufall ${i + 1}`, { zellen }]);
  }
  return aus;
}

describe("Gleichwertigkeit Teil-PUT(Δ) = Voll-PUT(Sicht ⊕ Δ) je Rolle", { timeout: 600000 }, () => {
  for (const k of [...SCHREIBER, ...WEITERE]) {
    it(`${k} (${ROLLEN[k].rolle}${ROLLEN[k].demo ? ", Demo" : ""}${ROLLEN[k].mandant ? `, Betrieb ${ROLLEN[k].mandant}` : ""}): feste und zufällige Deltas`, async () => {
      const mid = ROLLEN[k].mandant || "m1";
      const faelle = [...feste(k), ...zufaellige(k, WEITERE.includes(k) ? 3 : 6)];
      const befunde = [];
      for (const [name, besch] of faelle) {
        const A = await neuerRaum({ rollen: [k] });
        const Bv = await neuerRaum({ rollen: [k] });
        const vorherA = await gespeichert(A.raum);
        const gA = await anfrage("/api/bestand", { token: A.token[k] });
        const gB = await anfrage("/api/bestand", { token: Bv.token[k] });
        expect(gA.teile && gA.teile.format, `${k} ${name}: Fähigkeit`).toBe(1);
        const t = await teile(A.token[k], deltaAus(gA, besch, {}, mid));
        const v = await anfrage("/api/bestand", { methode: "PUT", token: Bv.token[k], rumpf: vollAus(gB, besch, mid) });
        const nachA = await gespeichert(A.raum);
        const nachB = await gespeichert(Bv.raum);
        expect(t.bestand, `${k} ${name}: nie der ganze Bestand in der Antwort`).toBeUndefined();
        if (typeof t.code === "string" && t.code.startsWith("TEILE_") && t.code !== "TEILE_KONFLIKT") {
          /* Früh abgewiesen: nichts geschrieben, und der Voll-PUT ist nicht strenger (er schreibt höchstens dasselbe). */
          expect(vergleichbar(nachA.bestand), `${k} ${name}: früh abgewiesen, nichts geschrieben`).toEqual(vergleichbar(vorherA.bestand));
          befunde.push(`${name}: Teil ${t.status} ${t.code}, Voll ${v.status}`);
          continue;
        }
        expect(t.status, `${k} ${name}: Status Teil ${JSON.stringify(t).slice(0, 200)} / Voll ${JSON.stringify(v).slice(0, 200)}`).toBe(v.status);
        if (t.code || v.code) expect(t.code, `${k} ${name}: Absagecode`).toBe(v.code);
        expect(nachA.scherben, `${k} ${name}: Scherben`).toEqual(nachB.scherben);
        expect(vergleichbar(nachA.bestand), `${k} ${name}: gespeicherter Stand`).toEqual(vergleichbar(nachB.bestand));
        befunde.push(`${name}: ${t.status}${t.code ? ` ${t.code}` : ""}`);
      }
      /* Lesbar im Lauf: was die Rolle durfte und was nicht. */
      console.log(`[wp48-teilweg] ${k}: ${befunde.join(" · ")}`);
      expect(befunde.length).toBe(faelle.length);
    });
  }
});

describe("Versionen, Erwartungswerte, Rennen", { timeout: 300000 }, () => {
  it("richtige Version → 200, Antwort mit Stand, Epoche und den Versionen nur der berührten Segmente", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const t = await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }],
      kern: { einstellungen: (w) => ({ ...w, ruhezeit: 12 }) } }));
    expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(200);
    expect(t.zusammengefuehrt).toBe(false);
    expect(t.epoche).toBe(g.teile.epoche);
    expect(Object.keys(t.versionen).sort()).toEqual([`kern:einstellungen`, `m1::${tag(21).slice(0, 7)}`].sort());
    const g2 = await anfrage("/api/bestand", { token: token.PL });
    expect(g2.etag).toBe(t.etag);
    for (const [seg, v] of Object.entries(t.versionen)) expect(g2.teile.versionen[seg], seg).toBe(v);
    const m = (await gespeichert(raum)).bestand.mandanten[0];
    expect(m.abweichungen[`a1|${tag(21)}`]).toBe("-");
    expect(m.einstellungen.ruhezeit).toBe(12);
  });

  it("veraltete Version / falscher Erwartungswert → 409 je Teil, alles oder nichts, kein Verlust", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL", "LT"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    /* Leitung ändert inzwischen dieselbe Zelle und dasselbe Kernfeld. */
    const gL = await anfrage("/api/bestand", { token: token.LT });
    expect((await teile(token.LT, deltaAus(gL, { zellen: [{ feld: "abweichungen", k: `a1|${tag(20)}`, neu: "-" }],
      kern: { dienstarten: (w) => w.map((d) => (d.id === "F" ? { ...d, ende: "14:30" } : d)) } }))).status).toBe(200);
    const vorher = await gespeichert(raum);
    const t = await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(20)}`, neu: "F" },
      { feld: "abweichungen", k: `b1|${tag(21)}`, neu: "N" }],
    kern: { dienstarten: (w) => w.map((d) => (d.id === "N" ? { ...d, start: "21:00" } : d)) } }));
    expect(t.status).toBe(409);
    expect(t.code).toBe("TEILE_KONFLIKT");
    expect(t.konflikt.zellen).toEqual([{ feld: "abweichungen", k: `a1|${tag(20)}`, aktuell: "-" }]);
    expect(t.konflikt.kern.map((x) => x.feld)).toEqual(["dienstarten"]);
    expect(t.bestand).toBeUndefined();
    const nachher = await gespeichert(raum);
    /* Nichts geschrieben — auch die nicht streitige Zelle b1 nicht (alles oder nichts). */
    expect(nachher.stand).toBe(vorher.stand);
    expect(vergleichbar(nachher.bestand)).toEqual(vergleichbar(vorher.bestand));
    expect(nachher.bestand.mandanten[0].abweichungen[`b1|${tag(21)}`]).toBeUndefined();
    /* Bewusst „meins setzen": neues Delta mit alt = aktuell → 200. */
    const t2 = await teile(token.PL, { format: 1, epoche: g.teile.epoche, zellen: [{ feld: "abweichungen", k: `a1|${tag(20)}`, alt: "-", neu: "N" }] });
    expect(t2.status).toBe(200);
  });

  it("Wiederholung ohne Wirkung: neu == aktuell gilt auch mit altem Erwartungswert", async () => {
    const { token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const d = deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] });
    expect((await teile(token.PL, d)).status).toBe(200);
    expect((await teile(token.PL, d)).status).toBe(200);
  });

  it("zwei Schreiber, verschiedene Zellen desselben Monats, gleichzeitig → beide 200, beide Werte da", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL", "LT"] });
    const [gP, gL] = await Promise.all([anfrage("/api/bestand", { token: token.PL }), anfrage("/api/bestand", { token: token.LT })]);
    const [a, b] = await Promise.all([
      teile(token.PL, deltaAus(gP, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] })),
      teile(token.LT, deltaAus(gL, { zellen: [{ feld: "abweichungen", k: `b1|${tag(21)}`, neu: "-" }] })),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const m = (await gespeichert(raum)).bestand.mandanten[0];
    expect(m.abweichungen[`a1|${tag(21)}`]).toBe("-");
    expect(m.abweichungen[`b1|${tag(21)}`]).toBe("-");
  });

  it("zwei Schreiber, verschiedene Kernfelder, gleichzeitig → beide 200 (kein Kernstreit mehr)", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL", "MA"] });
    const [gP, gM] = await Promise.all([anfrage("/api/bestand", { token: token.PL }), anfrage("/api/bestand", { token: token.MA })]);
    const [a, b] = await Promise.all([
      teile(token.PL, deltaAus(gP, { kern: { dienstarten: (w) => w.map((d) => (d.id === "F" ? { ...d, ende: "14:15" } : d)) } })),
      teile(token.MA, deltaAus(gM, { kern: { wuensche: (w) => [...(w || []), { id: "wN", personId: "m0", datum: tag(25), art: "frei" }] } })),
    ]);
    expect([a.status, b.status], `${JSON.stringify(a).slice(0, 200)} ${JSON.stringify(b).slice(0, 200)}`).toEqual([200, 200]);
    const m = (await gespeichert(raum)).bestand.mandanten[0];
    expect(m.dienstarten.find((d) => d.id === "F").ende).toBe("14:15");
    expect(m.wuensche.map((w) => w.id)).toContain("wN");
  });

  it("dieselbe Zelle gleichzeitig → genau einer gewinnt, der andere 409 mit dem Wert des Gewinners", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL", "LT"] });
    const [gP, gL] = await Promise.all([anfrage("/api/bestand", { token: token.PL }), anfrage("/api/bestand", { token: token.LT })]);
    const k = `a1|${tag(21)}`;
    const [a, b] = await Promise.all([
      teile(token.PL, deltaAus(gP, { zellen: [{ feld: "abweichungen", k, neu: "-" }] })),
      teile(token.LT, deltaAus(gL, { zellen: [{ feld: "abweichungen", k, neu: "N" }] })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const gewinner = a.status === 200 ? "-" : "N";
    const verlierer = a.status === 200 ? b : a;
    expect(verlierer.konflikt.zellen).toEqual([{ feld: "abweichungen", k, aktuell: gewinner }]);
    expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[k]).toBe(gewinner);
  });

  it("Teil-PUT gegen einen Stempel im selben Monat → 200, Stempel bleibt (Voll-PUT: Monatsstreit)", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const jetzt = await B.bestandLesenStreng(laden(), raum);
    const neu = kopie(jetzt.bestand);
    neu.mandanten[0].einstempeln[`a1|${HEUTE}`] = { start: "06:01", quelle: "app" };
    expect((await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: jetzt.stand, durch: "Stempel" })).ok).toBe(true);
    const k = `b1|${tag(1)}`;
    const t = await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k, neu: "-" }] }));
    expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(200);
    const m = (await gespeichert(raum)).bestand.mandanten[0];
    expect(m.einstempeln[`a1|${HEUTE}`]).toEqual({ start: "06:01", quelle: "app" });
    expect(m.abweichungen[k]).toBe("-");
  });

  it("Teil-PUT ändert keine Stempel und kein eingefrorenes Ist — auch nicht über den virtuellen Rumpf", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT"] });
    const vorher = (await gespeichert(raum)).bestand.mandanten[0];
    const g = await anfrage("/api/bestand", { token: token.LT });
    expect((await teile(token.LT, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(-1)}`, neu: "N" }] }))).status).toBe(200);
    const nach = (await gespeichert(raum)).bestand.mandanten[0];
    expect(nach.einstempeln).toEqual(vorher.einstempeln);
    expect(nach.istEingefroren).toEqual(vorher.istEingefroren);
    expect(nach.monatsabschluss).toEqual(vorher.monatsabschluss);
  });
});

describe("Epoche, Idempotenz, Schalter, Rollen, Form", { timeout: 300000 }, () => {
  it("andere Epoche (Wiederherstellen) → 409 NEU_LADEN, nichts geschrieben", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const jetzt = await B.bestandLesenStreng(laden(), raum);
    expect((await B.bestandSchreiben(laden(), raum, jetzt.bestand, { erwarteterStand: jetzt.stand, durch: "Wiederherstellen", neueEpoche: true })).ok).toBe(true);
    const vorher = await gespeichert(raum);
    expect(vorher.epoche).not.toBe(g.teile.epoche);
    const t = await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "F" }] }));
    expect(t.status).toBe(409);
    expect(t.code).toBe("NEU_LADEN");
    const nach = await gespeichert(raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(vergleichbar(nach.bestand)).toEqual(vergleichbar(vorher.bestand));
  });

  it("Idempotenz: dieselbe Anfragekennung → dieselbe Antwort, nichts zweimal geschrieben", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const d = deltaAus(g, { kern: { aushang: (w) => [...(w || []), { id: "ah1", text: "x" }] } }, { anfrage: "anfrage-0001-abcdef" });
    const a = await teile(token.PL, d);
    expect(a.status).toBe(200);
    const st = (await gespeichert(raum)).stand;
    const b = await teile(token.PL, d);
    expect(b.status).toBe(200);
    expect(b.wiederholt).toBe(true);
    expect(b.etag).toBe(a.etag);
    expect((await gespeichert(raum)).stand).toBe(st);
    expect((await gespeichert(raum)).bestand.mandanten[0].aushang.filter((x) => x.id === "ah1").length).toBe(1);
  });

  it("Review #224 Befund 1: dieselbe Anfragekennung mit ANDEREM Rumpf → 422, nie ein stilles „wiederholt“", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const id = "anfrage-befund1-0001";
    const d1 = deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] }, { anfrage: id });
    expect((await teile(token.PL, d1)).status).toBe(200);
    const st = (await gespeichert(raum)).stand;
    const d2 = deltaAus(g, { zellen: [{ feld: "abweichungen", k: `b1|${tag(21)}`, neu: "-" }] }, { anfrage: id });
    const t2 = await teile(token.PL, d2);
    expect(t2.status).toBe(422);
    expect(t2.code).toBe("ANFRAGE_WIEDERVERWENDET");
    expect(t2.wiederholt).toBeUndefined();
    expect((await gespeichert(raum)).stand).toBe(st);
    /* Mit eigener Kennung geht dieselbe Änderung durch — nichts ging verloren. */
    expect((await teile(token.PL, { ...d2, anfrage: "anfrage-befund1-0002" })).status).toBe(200);
    expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[`b1|${tag(21)}`]).toBe("-");
  });

  it("Review #224 Befund 2: Wiederholschutz je Sitzung — eine zweite Sitzung derselben Person wird nicht verschluckt", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const zweite = (await sitzungAnlegen({ bestand: raum, name: "V Np1", rolle: "planer", person: "p1", betrieb: 0,
      mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
    const g = await anfrage("/api/bestand", { token: token.PL });
    const id = "anfrage-befund2-0001";
    expect((await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] }, { anfrage: id }))).status).toBe(200);
    const g2 = await anfrage("/api/bestand", { token: zweite });
    const t2 = await teile(zweite, deltaAus(g2, { zellen: [{ feld: "abweichungen", k: `b1|${tag(21)}`, neu: "-" }] }, { anfrage: id }));
    expect(t2.status).toBe(200);
    expect(t2.wiederholt).toBeUndefined();
    expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[`b1|${tag(21)}`]).toBe("-");
  });

  it("Review #224 Befund 3: Wiederholung nach fremdem Zurücksetzen (ABA) überschreibt nicht — Vermerk liegt in der Ablage", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL", "LT"] });
    const k = `b1|${tag(23)}`;
    const g = await anfrage("/api/bestand", { token: token.PL });
    expect(g.bestand.mandanten[0].abweichungen[k]).toBeUndefined();
    const d = { format: 1, epoche: g.teile.epoche, anfrage: "anfrage-befund3-0001", zellen: [{ feld: "abweichungen", k, alt: null, neu: "-" }] };
    expect((await teile(token.PL, d)).status).toBe(200);
    /* Die Leitung nimmt die Änderung zurück (- → null). */
    const gL = await anfrage("/api/bestand", { token: token.LT });
    expect((await teile(token.LT, { format: 1, epoche: gL.teile.epoche, zellen: [{ feld: "abweichungen", k, alt: "-", neu: null }] })).status).toBe(200);
    /* Der Vermerk liegt in der Ablage, nicht im Prozess: Er überdauert einen Neustart. */
    const { blobs } = await laden().list({ prefix: `teilanfrage:${raum}:` });
    expect(blobs.length).toBe(1);
    /* Die Planung wiederholt dieselbe Anfrage (etwa nach Verbindungsabbruch): alt null passt wieder — trotzdem kein Schreiben. */
    const st = (await gespeichert(raum)).stand;
    const w = await teile(token.PL, d);
    expect(w.status).toBe(200);
    expect(w.wiederholt).toBe(true);
    expect((await gespeichert(raum)).stand).toBe(st);
    expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[k]).toBeUndefined();
  });

  it("Review Delta #224 Befund 2: Wiederholung nach Wiederherstellen → 409 NEU_LADEN, keine alte Antwort", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const d = deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] }, { anfrage: "anfrage-delta2-0001" });
    expect((await teile(token.PL, d)).status).toBe(200);
    const jetzt = await B.bestandLesenStreng(laden(), raum);
    expect((await B.bestandSchreiben(laden(), raum, jetzt.bestand, { erwarteterStand: jetzt.stand, durch: "Wiederherstellen", neueEpoche: true })).ok).toBe(true);
    const w = await teile(token.PL, d);
    expect(w.status).toBe(409);
    expect(w.code).toBe("NEU_LADEN");
    expect(w.wiederholt).toBeUndefined();
  });

  it("Review Delta #224 Befund 1: Wiederholvermerke begrenzt je Sitzung und je Raum — voll → 429, nichts geschrieben, nie verdrängt", async () => {
    const TW = await import("../server/lib/teilweg.mjs");
    const alt = { ...TW.TEILANFRAGE_GRENZEN };
    try {
      TW.TEILANFRAGE_GRENZEN.jeSitzung = 3;
      TW.TEILANFRAGE_GRENZEN.jeRaum = 5;
      const { raum, token } = await neuerRaum({ rollen: ["PL", "LT"] });
      const g = await anfrage("/api/bestand", { token: token.PL });
      const zelle = (i) => ({ feld: "abweichungen", k: `b1|${tag(24 + i)}`, neu: "-" });
      const ersteD = deltaAus(g, { zellen: [zelle(0)] }, { anfrage: "anfrage-voll-00" });
      for (let i = 0; i < 3; i++)
        expect((await teile(token.PL, i ? deltaAus(g, { zellen: [zelle(i)] }, { anfrage: `anfrage-voll-0${i}` }) : ersteD)).status).toBe(200);
      const st = (await gespeichert(raum)).stand;
      const voll = await teile(token.PL, deltaAus(g, { zellen: [zelle(3)] }, { anfrage: "anfrage-voll-03" }));
      expect(voll.status).toBe(429);
      expect(voll.code).toBe("TEILANFRAGEN_VOLL");
      expect((await gespeichert(raum)).stand).toBe(st);
      expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[`b1|${tag(27)}`]).toBeUndefined();
      /* Der älteste Vermerk wurde nicht verdrängt: seine Wiederholung ist weiter „wiederholt", ohne Schreiben. */
      const w = await teile(token.PL, ersteD);
      expect(w.wiederholt).toBe(true);
      expect((await gespeichert(raum)).stand).toBe(st);
      /* Je Raum: die Leitung hat 2 frei (5 − 3), danach ebenfalls 429. */
      const gL = await anfrage("/api/bestand", { token: token.LT });
      for (let i = 0; i < 2; i++)
        expect((await teile(token.LT, deltaAus(gL, { zellen: [{ feld: "abweichungen", k: `a1|${tag(30 + i)}`, neu: "-" }] }, { anfrage: `anfrage-raum-0${i}` }))).status).toBe(200);
      expect((await teile(token.LT, deltaAus(gL, { zellen: [{ feld: "abweichungen", k: `a1|${tag(33)}`, neu: "-" }] }, { anfrage: "anfrage-raum-09" }))).status).toBe(429);
      expect((await laden().list({ prefix: `teilanfrage:${raum}:` })).blobs.length).toBe(5);
      /* Abgelaufenes wird entfernt (und nur das): mit kurzer Frist ist wieder Platz. */
      TW.TEILANFRAGE_GRENZEN.frist = 0;
      await new Promise((r) => setTimeout(r, 5));
      expect((await teile(token.PL, deltaAus(g, { zellen: [zelle(3)] }, { anfrage: "anfrage-voll-03" }))).status).toBe(200);
      /* Aufräumen außerhalb der Sperre, begrenzt je Lauf. */
      TW.TEILANFRAGE_GRENZEN.aufraeumenJeLauf = 1;
      TW.TEILANFRAGE_GRENZEN.aufraeumenAbstand = 0;
      expect(await TW.anfragenAufraeumen(laden(), raum)).toBe(1);
    } finally { Object.assign(TW.TEILANFRAGE_GRENZEN, alt); }
  });

  it("Review #224 Befund 4: tief verschachtelter Rumpf → 422 statt Stapelüberlauf", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    const st0 = (await gespeichert(raum)).stand;
    const tief = "[".repeat(200000) + "]".repeat(200000);
    const roh = `{"format":1,"epoche":"${g.teile.epoche}","kern":{"aushang":{"basis":"${g.teile.versionen["kern:aushang"]}","wert":${tief}}}}`;
    const t = await teile(token.PL, roh);
    expect([413, 422, 400]).toContain(t.status);
    expect(t.status).not.toBe(500);
    const z = await teile(token.PL, `{"format":1,"epoche":"${g.teile.epoche}","zellen":[{"feld":"abweichungen","k":"a1|${tag(21)}","alt":null,"neu":${tief}}]}`);
    expect([413, 422, 400]).toContain(z.status);
    expect((await gespeichert(raum)).stand).toBe(st0);
    /* Der Prozess lebt: ein normales Delta geht danach durch. */
    expect((await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] }))).status).toBe(200);
  });

  it("Schalter aus: kein Weg (404), GET ohne teile; der Voll-PUT bleibt unverändert", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["PL"] });
    const g = await anfrage("/api/bestand", { token: token.PL });
    process.env.CENTRIC_TEILSPEICHERUNG = "1";
    try {
      const g0 = await anfrage("/api/bestand", { token: token.PL });
      expect(g0.teile).toBeUndefined();
      const vorher = await gespeichert(raum);
      const t = await teile(token.PL, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "F" }] }));
      expect(t.status).toBe(404);
      expect((await gespeichert(raum)).stand).toBe(vorher.stand);
      const v = await anfrage("/api/bestand", { methode: "PUT", token: token.PL, rumpf: vollAus(g0, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "-" }] }) });
      expect(v.status).toBe(200);
      expect(v.versionen).toBeUndefined();
    } finally { process.env.CENTRIC_TEILSPEICHERUNG = "true"; }
  });

  it("Betriebsrat 403 (schreibt nicht), Betreiber 403 TEILWEG_ROLLE (Voll-PUT), beide ohne teile im GET", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["BR", "BT", "PL"] });
    const gP = await anfrage("/api/bestand", { token: token.PL });
    const vorher = await gespeichert(raum);
    for (const k of ["BR", "BT"]) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.teile, k).toBeUndefined();
      const t = await teile(token[k], { format: 1, epoche: gP.teile.epoche, zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "F" }] });
      expect(t.status, k).toBe(403);
      if (k === "BT") expect(t.code).toBe("TEILWEG_ROLLE");
    }
    expect((await gespeichert(raum)).stand).toBe(vorher.stand);
  });

  it("Versionen nur über die Sicht der Rolle (kein Seitenkanal)", async () => {
    const { token } = await neuerRaum({ rollen: ["MA", "SV"] });
    for (const k of ["MA", "SV"]) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      const m = g.bestand.mandanten.find((x) => x.id === "m1");
      for (const [seg, v] of Object.entries(g.teile.versionen)) {
        if (!seg.startsWith("kern:")) continue;
        expect(v, `${k} ${seg}`).toBe(version(m[seg.slice(5)]));
      }
      /* Felder, die die Sicht nicht trägt, haben keine Version (MA: keine Einsatzorte, kein Protokoll). */
      for (const f of Object.keys(g.teile.versionen).filter((x) => x.startsWith("kern:")).map((x) => x.slice(5)))
        expect(f in m, `${k}: ${f} nicht in der Sicht`).toBe(true);
      expect(g.teile.versionen["kern:protokoll"]).toBeUndefined();
    }
  });

  it("Form: nur-Server-Felder, null als Löschung, falsche Schlüssel, Grenzen → 4xx, nichts geschrieben", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["LT", "MA"] });
    const g = await anfrage("/api/bestand", { token: token.LT });
    const e = g.teile.epoche;
    const v0 = "0".repeat(32);
    const vorher = await gespeichert(raum);
    const faelle = [
      [422, { format: 1, epoche: e, zellen: [{ feld: "einstempeln", k: `a1|${tag(0)}`, alt: null, neu: { start: "06:00" } }] }],
      [422, { format: 1, epoche: e, zellen: [{ feld: "istEingefroren", k: `a1|${tag(-40)}`, alt: null, neu: {} }] }],
      [422, { format: 1, epoche: e, kern: { monatsabschluss: { basis: v0, wert: {} } } }],
      [422, { format: 1, epoche: e, kern: { protokoll: { basis: v0, wert: [] } } }],
      [422, { format: 1, epoche: e, kern: { klaerung: { basis: v0, wert: {} } } }],
      [422, { format: 1, epoche: e, kern: { preisgestaltung: { basis: v0, wert: {} } } }],
      [422, { format: 1, epoche: e, kern: { abweichungen: { basis: v0, wert: {} } } }],
      [422, { format: 1, epoche: e, kern: { personen: { basis: g.teile.versionen["kern:personen"], wert: null } } }],
      [422, { format: 1, epoche: e, kern: { unbekannt: { basis: v0, wert: 1 } } }],
      [422, { format: 1, epoche: e, zellen: [{ feld: "abweichungen", k: "a1|2026-02-30", alt: null, neu: "F" }] }],
      [422, { format: 1, epoche: e, zellen: [{ feld: "abweichungen", k: "a1|2026-08", alt: null, neu: "F" }] }],
      [422, { format: 1, epoche: e, zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null }] }],
      [422, { format: 1, epoche: e, zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "F", mandantId: "m2" }] }],
      [422, { format: 1, epoche: e, mandantId: "m2", zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "F" }] }],
      [422, { format: 1, epoche: e, zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "F" }, { feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "N" }] }],
      [422, { format: 2, epoche: e, zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "F" }] }],
      [422, { format: 1, epoche: e }],
      [413, { format: 1, epoche: e, zellen: Array.from({ length: 5001 }, (_, i) => ({ feld: "abweichungen", k: `q${i}|${tag(21)}`, alt: null, neu: "F" })) }],
      [413, { format: 1, epoche: e, zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, alt: null, neu: "x".repeat(5000) }] }],
    ];
    for (const [status, r] of faelle) {
      const t = await teile(token.LT, r);
      expect(t.status, JSON.stringify(r).slice(0, 160)).toBe(status);
    }
    /* Grobprüfung Beschäftigte: Zellen anderer Personen → 403 TEILE_FREMD. */
    const gM = await anfrage("/api/bestand", { token: token.MA });
    const tM = await teile(token.MA, deltaAus(gM, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "F" }] }));
    expect(tM.status).toBe(403);
    expect(tM.code).toBe("TEILE_FREMD");
    const nach = await gespeichert(raum);
    expect(nach.stand).toBe(vorher.stand);
    expect(vergleichbar(nach.bestand)).toEqual(vergleichbar(vorher.bestand));
  });
});

describe("Befund §7: gespeicherte abgeleitete Personenfelder (Altinhalt)", { timeout: 300000 }, () => {
  const mitAltinhalt = (b) => {
    for (const p of b.mandanten[0].personen) if (p.id === "a1" || p.id === "b1") { p.sichtbereich = null; p.planungsregeln = []; }
  };
  /* Abgeleitete Felder weg; eine leere Einwilligungsliste ist dasselbe wie keine (rechte.mjs räumt sie beim
     Schreiben von Planung/Leitung weg — kein Datenverlust, bekannt aus WP-48.1 §7). */
  const ohneAbgeleitet = (b) => G.personenAngleichen({ ...b, mandanten: b.mandanten.map((m) => ({ ...m,
    personen: m.personen.map((x) => Object.fromEntries(Object.entries(x).filter(([f, w]) => !ABGELEITET.includes(f)
      && !(f === "mutterschutzEinwilligungen" && Array.isArray(w) && !w.length)))) })) });

  for (const k of SCHREIBER) {
    it(`${k}: Voll-Rundweg und Teilweg (Personen unverändert zurück) → 200, außer dem abgeleiteten Feld ändert sich nichts`, async () => {
      for (const weg of ["voll", "teil"]) {
        const { raum, token } = await neuerRaum({ rollen: [k], aendern: mitAltinhalt });
        const vorher = await gespeichert(raum);
        expect(vorher.bestand.mandanten[0].personen.find((p) => p.id === "a1").sichtbereich).toBeNull();
        const g = await anfrage("/api/bestand", { token: token[k] });
        const r = weg === "voll"
          ? await anfrage("/api/bestand", { methode: "PUT", token: token[k], rumpf: { bestand: g.bestand, etag: g.etag, durch: "Pruefung" } })
          : await teile(token[k], deltaAus(g, { kern: { personen: (w) => w } }));
        expect(r.status, `${k} ${weg}: ${JSON.stringify(r).slice(0, 300)}`).toBe(200);
        const nach = await gespeichert(raum);
        expect(nach.scherben).toEqual(vorher.scherben);
        expect(vergleichbar(ohneAbgeleitet(nach.bestand))).toEqual(vergleichbar(ohneAbgeleitet(vorher.bestand)));
      }
    });
  }

  it("SV ändert im Altinhalt eine Einteilung im eigenen Bereich über den Teilweg → 200 (vorher 403)", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["SV"], aendern: mitAltinhalt });
    const g = await anfrage("/api/bestand", { token: token.SV });
    const t = await teile(token.SV, deltaAus(g, { zellen: [{ feld: "abweichungen", k: `a1|${tag(21)}`, neu: "N" }] }));
    expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(200);
    expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[`a1|${tag(21)}`]).toBe("N");
  });
});

describe("Größe: 150 Personen × 12 Monate mit Stempeln", { timeout: 300000 }, () => {
  it("Voll-PUT läge über RUMPF_MAX (413), der Teil-PUT einer Einteilung ist < 2 KB und geht durch", async () => {
    const M = await import("../werkzeug/wp48-messung.mjs");
    const b = M.bestandErzeugen(150, M.monateBis(HEUTE.slice(0, 7), 12));
    const raum = `wp48-teilweg-gross-${++raumNr}`;
    await B.bestandSchreiben(laden(), raum, G.personenAngleichen(b), { durch: "Pruefung" });
    const token = (await sitzungAnlegen({ bestand: raum, name: "L", rolle: "leitung", person: "p1", betrieb: 0,
      mandantId: b.mandanten[0].id, einheit: null }, 3600 * 1000)).token;
    const g = await anfrage("/api/bestand", { token });
    expect(g.status).toBe(200);
    const vollBytes = Buffer.byteLength(JSON.stringify({ bestand: g.bestand, etag: g.etag, durch: "Pruefung" }));
    expect(vollBytes).toBeGreaterThan(M.RUMPF_MAX);
    const mid = b.mandanten[0].id;
    const m = g.bestand.mandanten.find((x) => x.id === mid);
    /* Eine künftige Abweichung zurücknehmen (zurück in den Rhythmus) — fachlich unauffällig, Rumpf eine Zelle. */
    const k = Object.keys(m.abweichungen).filter((x) => x.split("|")[1] > tag(2)).sort()[0];
    expect(k).toBeTruthy();
    const rumpf = { format: 1, epoche: g.teile.epoche, zellen: [{ feld: "abweichungen", k, alt: m.abweichungen[k], neu: null }] };
    const teilBytes = Buffer.byteLength(JSON.stringify(rumpf));
    expect(teilBytes).toBeLessThan(2048);
    const a = performance.now();
    const t = await anfrage("/api/bestand/teile", { methode: "POST", token, rumpf });
    const ms = Math.round(performance.now() - a);
    console.log(`[wp48-teilweg] 150×12: Voll-PUT ${(vollBytes / 1048576).toFixed(2)} MB, Teil-PUT ${teilBytes} B, ${ms} ms (Stufe 1, serverseitig noch O(Bestand))`);
    expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(200);
    expect((await gespeichert(raum)).bestand.mandanten[0].abweichungen[k]).toBeUndefined();
  });
});

/* Abnahme V4, A-4: Dienstart ohne mindest — dieselbe Regel auf Teil- und Vollweg (Gleichwertigkeit).
   Der Prüfbetrieb trägt bewusst Altdienstarten ohne mindest (F, N): sie bleiben schreibbar und byte-gleich. */
describe("A-4: Dienstart ohne mindest — Teilweg wie Vollweg", { timeout: 300000 }, () => {
  const MD = { mo_do: 1, fr: 1, sa: 1, so: 1 };
  const NULL = { mo_do: 0, fr: 0, sa: 0, so: 0 };
  const neu = (md) => (w) => [...w, { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30, ...(md === undefined ? {} : { mindest: md }) }];
  const kaputt = (w) => w.map((d) => (d.id === "F" ? { ...d, mindest: { ...MD, fr: -1 } } : d));
  it("ungültige mindest (neu oder an Altdienstart): 422 auf beiden Wegen, gleiches Feld, nichts geändert", async () => {
    for (const [name, fn] of [["neu mit fremdem Feld", neu({ ...MD, feiertag: 1 })], ["Altdienstart negativ", kaputt]]) for (const k of ["LT", "PL"]) {
      const { raum, token } = await neuerRaum({ rollen: [k] });
      const vorher = await gespeichert(raum);
      const g = await anfrage("/api/bestand", { token: token[k] });
      const t = await teile(token[k], deltaAus(g, { kern: { dienstarten: fn } }));
      expect(t.status, `${name}/${k}/Teil ${JSON.stringify(t).slice(0, 200)}`).toBe(422);
      expect(t.text, `${name}/${k}`).toMatch(/Mindestbesetzung/);
      const v = await anfrage("/api/bestand", { methode: "PUT", token: token[k], rumpf: vollAus(g, { kern: { dienstarten: fn } }) });
      expect(v.status, `${name}/${k}/Voll`).toBe(422);
      expect(v.feld, `${name}/${k}`).toBe(t.feld);
      expect(await gespeichert(raum), `${name}/${k}`).toEqual(vorher);
    }
  });
  it("neue Dienstart ohne / mit mindest: 200 auf beiden Wegen, gleich gespeichert; Altdienstarten byte-gleich", async () => {
    for (const [md, soll] of [[undefined, NULL], [MD, MD]]) for (const weg of ["Teil", "Voll"]) {
      const { raum, token } = await neuerRaum({ rollen: ["PL"] });
      const alt = (await gespeichert(raum)).bestand.mandanten[0].dienstarten.map((d) => JSON.stringify(d));
      const g = await anfrage("/api/bestand", { token: token.PL });
      const r = weg === "Teil" ? await teile(token.PL, deltaAus(g, { kern: { dienstarten: neu(md) } }))
        : await anfrage("/api/bestand", { methode: "PUT", token: token.PL, rumpf: vollAus(g, { kern: { dienstarten: neu(md) } }) });
      expect(r.status, `${weg} ${JSON.stringify(r).slice(0, 200)}`).toBe(200);
      const jetzt = (await gespeichert(raum)).bestand.mandanten[0].dienstarten;
      expect(jetzt.slice(0, alt.length).map((d) => JSON.stringify(d)), weg).toEqual(alt);
      expect(jetzt.find((d) => d.id === "S").mindest, weg).toEqual(soll);
    }
  });
});
