/* ==========================================================================
   ABNAHME V4, A-3 — ERSTANMELDUNG UNTER ECHTEM PROZESSABBRUCH (Betreiberentscheidung 2026-11-13)

   Ein echter Server-Kindprozess (server.mjs) wird mitten in der Erstanmeldung
   HART beendet (SIGKILL; unter Windows TerminateProcess über process.kill) —
   ausgelöst durch die Prüfhilfe pruefungen/hilfen/kill-nach-schreiben.mjs,
   die per --import (NODE_OPTIONS) vorgeladen wird und die Dateisystemaufrufe
   umwickelt, mit denen die Ablage einen Schreibvorgang abschließt. Im
   Produktionscode gibt es keine Einspeisestelle.

   Abbruchpunkte (Schritte in lib/erstleitung.mjs):
     K1  nach Schritt 1   Vormerkung am Zugang geschrieben
     K2  nach Schritt 2a  Marke des Betriebs angelegt (link)
     K3  in Schritt 2b    Schreibjournal des Bestands liegt, Kern noch nicht
     K4  nach Schritt 2   Person vollständig geschrieben, Zugang nicht gebunden
     K5  nach Schritt 3   Zugang gebunden, Sitzung noch nicht angelegt
   Danach Neustart auf DERSELBEN Ablage (die verwaiste Prozesssperre wird
   übernommen) und Prüfung: keine halbe Person, kein Code an eine fehlende
   Person gebunden, keine nutzbare Sitzung; die Wiederholung legt genau eine
   Person an (genau die vorgemerkte), ein zweiter Erstanmeldecode desselben
   Betriebs legt nie etwas an, das Journal ist abgeschlossen.

   Dazu die Ein-Prozess-Annahme: Ein zweiter Server auf derselben Ablage
   startet nicht (Prozesssperre, lib/prozesssperre.mjs) — fail-closed.

   Aufruf: npx vitest run pruefungen/erstleitung-abbruch.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serverStarten, freierPort } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VORLADEN = pathToFileURL(path.join(WURZEL, "pruefungen", "hilfen", "kill-nach-schreiben.mjs")).href;
const ADMIN = "erstabbruch-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const PFEFFER = randomUUID();
const PERSONENFELDER = ["id", "vorname", "nachname", "funktion", "email", "zugehoerigkeit", "eintritt", "austritt", "wochenstunden",
  "urlaubsanspruch", "urlaubsuebertrag", "stundenuebertrag", "qualifikationen", "teilzeit", "springer", "einschraenkungen",
  "rolle", "rolleSeit", "rolleVerlauf", "bereich", "status", "imSchichtdienst"];

let statik, daten, BASIS, kind, log = () => "";
let xff = 0;
let L = /** @type {any} */ ({});
let betreiberCode;
const FAELLE = ["k1", "k2", "k3", "k4", "k5"];
const CODES = {};

function umgebung(extra = {}) {
  return { CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
    CENTRIC_PFEFFER: PFEFFER, CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_IMPORT_AKTIV: undefined, CENTRIC_REGISTRIERUNG: undefined,
    CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined, NODE_OPTIONS: undefined, PRUEF_KILL_MUSTER: undefined, ...extra };
}
async function starten(extra = {}) {
  const st = await serverStarten({ cwd: WURZEL, wartenMs: 60_000, env: umgebung(extra) });
  ({ kind, basis: BASIS, log } = st);
  return st;
}
const beendet = (k) => new Promise((r) => { if (k.exitCode !== null || k.signalCode !== null) r(undefined); else k.once("exit", () => r(undefined)); });
async function anhalten() {
  if (kind && kind.exitCode === null && kind.signalCode === null) { kind.kill("SIGKILL"); await beendet(kind); }
}

async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const kopf = { "x-forwarded-for": `10.73.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await fetch(BASIS + pfad, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const anmelden = (code) => anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
const store = () => L.getStore({ name: "centric", consistency: "strong" });
const personenIn = async (raum) => ((await L.bestandLesenStreng(store(), raum)).bestand.mandanten[0].personen || []);
const kontoVon = (code) => L.kontoLesenStreng(store(), L.ablageSchluessel(code));
const dateiMuster = (schluessel) => L.dateiname(schluessel).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
/** Sitzungen (außer Betreiber) für diesen Raum — es darf nach einem Abbruch keine geben. */
async function sitzungenIn(raum) {
  const s = L.getStore({ name: "centric-sitzungen", consistency: "strong" });
  const { blobs } = await s.list({ prefix: "t:" });
  const treffer = [];
  for (const b of blobs) {
    const x = await s.get(b.key, { type: "json" }).catch(() => null);
    if (x && x.bestand === raum && x.rolle !== "betreiber") treffer.push(x);
  }
  return treffer;
}
const gibtEs = (datei) => access(datei).then(() => true, () => false);

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-abbruch-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-abbruch-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Abbruch</title>");
  await starten();
  process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  L = { ...(await import("../server/lib/ablage.mjs")), ...(await import("../server/lib/bestand.mjs")),
    ...(await import("../server/lib/konten.mjs")), ...(await import("../server/lib/codes.mjs")),
    ...(await import("../server/lib/erstleitung.mjs")) };
  const e = await anfrage("/einrichten", { methode: "POST", rumpf: { verwaltung: ADMIN, name: "Betreiber", bestand: "abb-betreiber",
    rolle: "betreiber", person: null, betrieb: 0 } });
  expect(e.status, e.fehler).toBe(200);
  betreiberCode = e.zugangscode;
  const b = await anmelden(betreiberCode);
  expect(b.status, b.fehler).toBe(200);
  /* Je Fall ein leerer Betrieb mit zwei Erstanmeldecodes (echter Ausstellungsweg, Fenster der Ersteinrichtung). */
  for (const f of FAELLE) {
    const raum = `abb-${f}`;
    const a = await anfrage("/api/bestand-anlegen", { methode: "POST", token: b.token, rumpf: { bestand: raum, vorlage: "leer", name: `Haus ${raum}` } });
    expect(a.status, a.fehler).toBe(200);
    const z = await anfrage("/api/zugaenge", { methode: "POST", token: b.token, rumpf: { bestand: raum,
      eintraege: [{ rolle: "leitung", personId: null }, { rolle: "leitung", personId: null }] } });
    expect(z.status, z.fehler).toBe(200);
    expect(z.zugaenge.every((x) => x.erstanmeldung === true)).toBe(true);
    CODES[f] = z.zugaenge.map((x) => x.code);
  }
  await anhalten();
}, 120_000);

afterAll(async () => {
  await anhalten();
  await rm(statik, { recursive: true, force: true }).catch(() => {});
  await rm(daten, { recursive: true, force: true }).catch(() => {});
});

/**
 * Startet den Server mit der Abbruchhilfe, meldet sich mit dem Erstanmeldecode an und wartet auf das harte Ende.
 * @returns {Promise<{antwort: any}>}
 */
async function mitAbbruch(muster, { nr = 1, zeitpunkt = "nach" } = {}, code) {
  const st = await starten({ NODE_OPTIONS: `--import=${VORLADEN}`, PRUEF_KILL_MUSTER: muster, PRUEF_KILL_NR: String(nr),
    PRUEF_KILL_ZEITPUNKT: zeitpunkt });
  expect(st.log()).toContain("[kill-nach-schreiben] aktiv");
  let antwort;
  try { antwort = await anmelden(code); } catch (e) { antwort = { status: 0, abgebrochen: String(e && e.message) }; }
  await Promise.race([beendet(st.kind), new Promise((_, n) => setTimeout(() => n(new Error("Server lebt noch")), 20_000))]);
  expect(st.log(), "Abbruch ausgelöst").toContain("[kill-nach-schreiben] harter Abbruch");
  /* Hart beendet: kein geordnetes Ende (unter Linux Signal SIGKILL, unter Windows Code ≠ 0). */
  expect(st.kind.signalCode === "SIGKILL" || (st.kind.exitCode !== null && st.kind.exitCode !== 0)).toBe(true);
  /* Keine Antwort, also auch kein Token. */
  expect(antwort.token).toBeUndefined();
  return { antwort };
}

/** Nach dem Neustart, vor der Wiederholung: die Invarianten. */
async function invarianten(raum, code) {
  const k = await kontoVon(code);
  const ps = await personenIn(raum);
  expect(ps.length, "nie mehr als eine Person").toBeLessThanOrEqual(1);
  const vorgemerkt = k.erstleitung ? k.erstleitung.personId : k.erstleitungVerbraucht && k.erstleitungVerbraucht.personId;
  if (ps.length === 1) {
    /* Keine halbe Person: vollständig, und genau die vorgemerkte. */
    expect(ps[0].id).toBe(vorgemerkt);
    for (const feld of PERSONENFELDER) expect(ps[0], `Feld ${feld}`).toHaveProperty(feld);
    expect(ps[0]).toMatchObject({ rolle: "leitung", email: "", status: "aktiv", bereich: "ALLE" });
  }
  /* Kein Code an eine Person gebunden, die es nicht gibt. */
  if (k.person !== null && k.person !== undefined) expect(ps.map((p) => p.id)).toContain(k.person);
  /* Keine nutzbare Sitzung aus dem abgebrochenen Vorgang. */
  expect(await sitzungenIn(raum)).toEqual([]);
  return { k, ps, vorgemerkt };
}

/** Wiederholung: genau einmal angelegt, gebunden, zweiter Erstanmeldecode wirkungslos, Journal abgeschlossen. */
async function wiederholen(raum, [code, zweiter], vorgemerkt) {
  const a = await anmelden(code);
  expect(a.status, a.fehler).toBe(200);
  if (vorgemerkt) expect(a.person).toBe(vorgemerkt);
  const b = await anmelden(code);
  expect(b.status, b.fehler).toBe(200);
  expect(b.person).toBe(a.person);
  const ps = await personenIn(raum);
  expect(ps.map((p) => p.id)).toEqual([a.person]);
  const k = await kontoVon(code);
  expect(k.person).toBe(a.person);
  expect(k.erstleitungVerbraucht).toMatchObject({ grund: "angelegt", personId: a.person });
  expect(await L.erstleitungMarkeLesen(store(), raum, raum)).toMatchObject({ personId: a.person });
  const z = await anmelden(zweiter);
  expect(z.status).toBe(403);
  expect(z.token).toBeUndefined();
  expect((await personenIn(raum)).map((p) => p.id)).toEqual([a.person]);
  /* Ein liegengebliebenes Journal (K3) gilt beim Lesen schon (überlagert); der nächste Schreiber schließt es ab. */
  const g = await anfrage("/api/bestand", { token: a.token });
  expect(g.status).toBe(200);
  expect(g.bestand.mandanten[0].personen.map((p) => p.id)).toEqual([a.person]);
  const w = await anfrage("/api/bestand", { methode: "PUT", token: a.token, rumpf: { bestand: g.bestand, etag: g.etag } });
  expect(w.status, w.fehler).toBe(200);
  expect(await gibtEs(path.join(daten, "centric", L.dateiname(`journal:${raum}`)))).toBe(false);
  expect((await personenIn(raum)).map((p) => p.id)).toEqual([a.person]);
}

describe.sequential("Erstanmeldung: harter Prozessabbruch zwischen den Schritten, Neustart auf derselben Ablage", () => {
  /* Jeder Fall beginnt ohne laufenden Server (sonst hielte der vorige die Ablage). */
  afterEach(async () => { await anhalten(); });
  it("K1 nach Schritt 1 (Vormerkung): keine Person, keine Marke, keine Sitzung; Wiederholung legt genau die vorgemerkte an", async () => {
    const raum = "abb-k1"; const [code] = CODES.k1;
    await mitAbbruch(dateiMuster(`konto:${L.ablageSchluessel(code)}`), { nr: 1 }, code);
    await starten();
    const { k, ps, vorgemerkt } = await invarianten(raum, code);
    expect(vorgemerkt).toMatch(/^p_[0-9a-f]{7}$/);
    expect(k.person).toBeNull();
    expect(ps).toEqual([]);
    expect(await L.erstleitungMarkeLesen(store(), raum, raum)).toBeNull();
    await wiederholen(raum, CODES.k1, vorgemerkt);
    await anhalten();
  });

  it("K2 nach Schritt 2a (Marke): keine Person; die Marke gehört der vorgemerkten Kennung; Wiederholung schreibt zu Ende", async () => {
    const raum = "abb-k2"; const [code] = CODES.k2;
    await mitAbbruch(dateiMuster(L.erstleitungMarkeSchluessel(raum, raum)), { nr: 1 }, code);
    await starten();
    const { k, ps, vorgemerkt } = await invarianten(raum, code);
    expect(k.person).toBeNull();
    expect(ps).toEqual([]);
    expect(await L.erstleitungMarkeLesen(store(), raum, raum)).toMatchObject({ personId: vorgemerkt });
    /* Der ZWEITE Code kommt zuerst: Die Marke gehört dem ersten — nichts angelegt, keine Sitzung. */
    const z = await anmelden(CODES.k2[1]);
    expect(z.status).toBe(403);
    expect(await personenIn(raum)).toEqual([]);
    const a = await anmelden(code);
    expect(a.status, a.fehler).toBe(200);
    expect(a.person).toBe(vorgemerkt);
    expect((await personenIn(raum)).map((p) => p.id)).toEqual([vorgemerkt]);
    await anhalten();
  });

  it("K3 in Schritt 2b (Journal liegt, Kern nicht): der Neustart schreibt das Journal vollständig zu Ende — nie halb", async () => {
    const raum = "abb-k3"; const [code] = CODES.k3;
    await mitAbbruch(dateiMuster(`journal:${raum}`), { nr: 1 }, code);
    /* Das Journal liegt auf der Platte (Abbruch direkt nach seinem Schreiben). */
    expect(await gibtEs(path.join(daten, "centric", L.dateiname(`journal:${raum}`)))).toBe(true);
    await starten();
    const { k, ps, vorgemerkt } = await invarianten(raum, code);
    expect(k.person).toBeNull();
    /* Gelesen wird der Stand MIT Journal: die Person vollständig (Vorwärtsrollen), nicht der halbe Zwischenstand. */
    expect(ps.map((p) => p.id)).toEqual([vorgemerkt]);
    await wiederholen(raum, CODES.k3, vorgemerkt);
    await anhalten();
  });

  it("K4 nach Schritt 2 (Person geschrieben, Zugang nicht gebunden; Zwischendatei verwaist): nur noch binden", async () => {
    const raum = "abb-k4"; const [code] = CODES.k4;
    await mitAbbruch(dateiMuster(`konto:${L.ablageSchluessel(code)}`), { nr: 2, zeitpunkt: "vor" }, code);
    await starten();
    const { k, ps, vorgemerkt } = await invarianten(raum, code);
    expect(k.person).toBeNull();
    expect(k.erstleitung).toBeTruthy();
    expect(ps.map((p) => p.id)).toEqual([vorgemerkt]);
    await wiederholen(raum, CODES.k4, vorgemerkt);
    await anhalten();
  });

  it("K5 nach Schritt 3 (gebunden, Sitzung noch nicht angelegt): keine Sitzung; die nächste Anmeldung ist dieselbe Person", async () => {
    const raum = "abb-k5"; const [code] = CODES.k5;
    await mitAbbruch(dateiMuster(`konto:${L.ablageSchluessel(code)}`), { nr: 2 }, code);
    await starten();
    const { k, ps } = await invarianten(raum, code);
    expect(ps).toHaveLength(1);
    expect(k.person).toBe(ps[0].id);
    expect(k.erstleitungVerbraucht).toMatchObject({ grund: "angelegt", personId: ps[0].id });
    await wiederholen(raum, CODES.k5, ps[0].id);
  });
});

describe.sequential("Ein Prozess je Ablage (Produktionsannahme)", () => {
  it("ein zweiter Server auf derselben Ablage startet nicht (fail-closed); der erste arbeitet weiter", async () => {
    if (!kind || kind.exitCode !== null || kind.signalCode !== null) await starten();
    const port = await freierPort();
    const env = { ...process.env, ...Object.fromEntries(Object.entries(umgebung()).filter(([, v]) => v !== undefined)), PORT: String(port) };
    for (const k of ["NODE_OPTIONS", "PRUEF_KILL_MUSTER"]) delete env[k];
    const zweiter = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, env, stdio: ["ignore", "pipe", "pipe"] });
    let zlog = "";
    zweiter.stdout.on("data", (d) => { zlog += d; });
    zweiter.stderr.on("data", (d) => { zlog += d; });
    const code = await Promise.race([new Promise((r) => zweiter.once("exit", (c) => r(c))),
      new Promise((r) => setTimeout(() => r("lebt"), 90_000))]);
    if (code === "lebt") zweiter.kill("SIGKILL");
    expect(code, zlog).toBe(1);
    expect(zlog).toMatch(/belegt/);
    expect(zlog).not.toMatch(/läuft auf Port/);
    /* Der erste hält die Ablage und antwortet weiter. */
    expect((await fetch(`${BASIS}/gesund`)).status).toBeLessThan(500);
    expect((await anmelden(betreiberCode)).status).toBe(200);
  });
});
