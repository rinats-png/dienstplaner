/* ==========================================================================
   ABNAHME V4, A-3 — BETREIBERENTSCHEIDUNGEN VOM 2026-11-13 (E-D1, E-D2, E-Mail)

   Echter Server (server.mjs, Wegwerfablage, echte Handler über HTTP):
     E-D1  Ein gewöhnlicher Leitungscode ohne Person öffnet keinen Zugang
           (Befund F-0): keine Anmeldung, und eine schon liegende Sitzung
           eines solchen Codes gilt nicht mehr. Demozugang, Betreiber und
           personengebundene Codes bleiben unberührt. Der Erstanmeldecode
           legt die Person an, bevor es eine Sitzung gibt.
     E-D2  Die Ausnahme „leerer Betrieb“ in rollenwechselErlaubt ist weg (ein
           Planungscode legt sich keine Leitung an); ein eingerichteter
           Betrieb fällt nach Verlust/Löschen aller Personen und nach
           /api/wiederherstellen nie in die Ersteinrichtung zurück (Marke).
     E-Mail die erste Leitungsperson hat keine Adresse; die Anlage über die
           Betreiberkonsole übernimmt die Kontaktadresse nicht.
     404/403 der Einladung: einheitliche Antwort für „gibt es nicht“ und
           „gibt es nur in einem fremden Betrieb“; der Rang gilt unverändert.

   Aufruf: npx vitest run pruefungen/erstleitung-entscheidungen.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverStarten } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = "erstentsch-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const PFEFFER = randomUUID();
const OHNE_PERSON = "Ihr Zugang ist keiner Person zugeordnet.";

let kind, statik, daten, BASIS;
let xff = 0;
let L = /** @type {any} */ ({});
let betreiber;
const CODE = {};

async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const kopf = { "x-forwarded-for": `10.72.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await fetch(BASIS + pfad, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const anmelden = (code) => anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const store = () => L.getStore({ name: "centric", consistency: "strong" });
const personenIn = async (raum) => ((await L.bestandLesenStreng(store(), raum)).bestand.mandanten[0].personen || []);
const kontoVon = (code) => L.kontoLesenStreng(store(), L.ablageSchluessel(code));
/* Feste Zeitpunkte statt der Uhr (QS-2/QS-4): Der Server läuft als eigener Prozess mit seiner echten Uhr — eine
   eingespeiste Uhr gibt es dort nicht. Ein offener Vermerk trägt deshalb ein ausdrückliches `bis` weit in der Zukunft,
   ein abgelaufener ein Datum weit in der Vergangenheit: Das Ergebnis hängt nicht vom Zeitpunkt des Laufs ab. */
const FEST_ANGELEGT = "2026-11-13T08:00:00.000Z";
const FEST_OFFEN_BIS = "2099-12-31T00:00:00.000Z";
const FEST_VORBEI = "2001-01-01T00:00:00.000Z";
async function codeAblegen(raum, extra = {}) {
  const code = `T${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
  await L.kontoSchreiben(store(), L.ablageSchluessel(code), { name: `Zugang ${raum}`, bestand: raum, rolle: "leitung",
    person: null, betrieb: 0, mandantId: raum, demo: false, gruppe: null, hinweis: null,
    angelegt: FEST_ANGELEGT, ...extra });
  return code;
}
async function betriebAnlegen(raum) {
  const a = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiber, rumpf: { bestand: raum, vorlage: "leer", name: `Haus ${raum}` } });
  expect(a.status, a.fehler).toBe(200);
}
/** Betrieb anlegen, n Erstanmeldecodes ausstellen (echter Weg /api/zugaenge, Fenster der Ersteinrichtung). */
async function betriebMitErstcodes(raum, n = 1) {
  await betriebAnlegen(raum);
  const z = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: raum,
    eintraege: Array.from({ length: n }, () => ({ rolle: "leitung", personId: null })) } });
  expect(z.status, z.fehler).toBe(200);
  expect(z.zugaenge.every((x) => x.erstanmeldung === true)).toBe(true);
  return z.zugaenge.map((x) => x.code);
}
/** Datenverlust/Löschen aller Personen: der Bestand wird ohne Personen geschrieben (wie ein Verlust auf der Platte). */
async function allePersonenWeg(raum) {
  const g = await L.bestandLesenStreng(store(), raum);
  const b = kopie(g.bestand);
  b.mandanten[0].personen = [];
  expect((await L.bestandSchreiben(store(), raum, b, { erwarteterStand: g.stand, durch: "Prüfung" })).ok).toBe(true);
}

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-erstent-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-erstent-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Entscheidungen</title>");
  const st = await serverStarten({ cwd: WURZEL, wartenMs: 30_000, env: {
    CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
    CENTRIC_PFEFFER: PFEFFER, CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_IMPORT_AKTIV: undefined, CENTRIC_REGISTRIERUNG: undefined,
    CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined,
    /* Strenge Regeln für ALLE Betriebe (nach Freigabe). Den Schalter aus prüft pruefungen/erstleitung.test.js. */
    CENTRIC_ERSTLEITUNG_STRENG: "true",
    /* Der Teilweg ist ein Schreibweg wie PUT: auch über ihn darf die Marke nicht angreifbar sein. */
    CENTRIC_TEILSPEICHERUNG: "true" } });
  ({ kind, basis: BASIS } = st);
  process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  L = { ...(await import("../server/lib/ablage.mjs")), ...(await import("../server/lib/bestand.mjs")),
    ...(await import("../server/lib/konten.mjs")), ...(await import("../server/lib/codes.mjs")),
    ...(await import("../server/lib/sitzungen.mjs")), ...(await import("../server/lib/erstleitung.mjs")) };
  const e = await anfrage("/einrichten", { methode: "POST", rumpf: { verwaltung: ADMIN, name: "Betreiber", bestand: "ent-betreiber",
    rolle: "betreiber", person: null, betrieb: 0 } });
  expect(e.status, e.fehler).toBe(200);
  const b = await anmelden(e.zugangscode);
  expect(b.status, b.fehler).toBe(200);
  betreiber = b.token;
  CODE.betreiber = e.zugangscode;
}, 60_000);

afterAll(async () => {
  if (kind && kind.exitCode === null) kind.kill("SIGKILL");
  await rm(statik, { recursive: true, force: true }).catch(() => {});
  await rm(daten, { recursive: true, force: true }).catch(() => {});
});

describe.sequential("E-D1: gewöhnlicher Leitungscode ohne Person (Befund F-0)", () => {
  it("Anmeldung abgewiesen (403, kontrollierte Meldung, keine Sitzung) — leerer Betrieb und Betrieb mit Personen", async () => {
    const [erst] = await betriebMitErstcodes("ent-a");
    const a = await anmelden(erst);
    expect(a.status, a.fehler).toBe(200);
    CODE.aLeitung = erst; CODE.aPerson = a.person;
    await betriebAnlegen("ent-leer");
    for (const raum of ["ent-a", "ent-leer"]) {
      const alt = await codeAblegen(raum);
      const r = await anmelden(alt);
      expect(r.status, raum).toBe(403);
      expect(r.fehler).toBe(OHNE_PERSON);
      expect(r.token).toBeUndefined();
      expect((await kontoVon(alt)).person).toBeNull();
    }
    expect((await personenIn("ent-a")).map((p) => p.id)).toEqual([CODE.aPerson]);
    expect(await personenIn("ent-leer")).toEqual([]);
  });

  it("eine schon liegende Sitzung eines solchen Codes gilt nicht mehr — auf jedem Pfad, und sie endet", async () => {
    const alt = await codeAblegen("ent-a");
    /* Eine Sitzung, wie sie die Anmeldung vor dieser Änderung ausgestellt hat (Rolle aus dem Code, keine Person). */
    const { token } = await L.sitzungAnlegen({ bestand: "ent-a", name: "Alt", rolle: "leitung", person: null, betrieb: 0,
      mandantId: "ent-a", konto: L.ablageSchluessel(alt), einheit: null }, 60 * 60 * 1000);
    const g = await anfrage("/api/bestand", { token });
    expect(g.status).toBe(401);
    expect(g.bestand).toBeUndefined();
    /* Beendet: auch ein zweiter Versuch und andere Wege (Einladungen, Zustellung) bekommen nichts. */
    expect((await anfrage("/api/bestand", { token })).status).toBe(401);
    expect((await anfrage("/api/einladung/liste", { methode: "POST", token, rumpf: {} })).status).toBe(401);
    expect(await L.sitzungLesen(new Request("http://x/api/bestand", { headers: { authorization: `Bearer ${token}` } }))).toBeNull();
  });

  it("ein Erstanmeldecode nach Ablauf seines Vermerks: keine Person, keine Sitzung (Gültigkeit beim Einlösen geprüft)", async () => {
    await betriebAnlegen("ent-abl");
    const alt = FEST_VORBEI;
    const abgelaufen = await codeAblegen("ent-abl", { erstleitung: { mandantId: "ent-abl", angelegt: alt, bis: "2001-01-02T00:00:00.000Z" } });
    const ohneBis = await codeAblegen("ent-abl", { erstleitung: { mandantId: "ent-abl", angelegt: alt } });
    for (const code of [abgelaufen, ohneBis]) {
      const r = await anmelden(code);
      expect(r.status).toBe(403);
      expect(r.fehler).toBe("Dieser Zugang ist abgelaufen.");
      expect(r.token).toBeUndefined();
    }
    expect(await personenIn("ent-abl")).toEqual([]);
    expect(await L.erstleitungMarkeLesen(store(), "ent-abl", "ent-abl")).toBeNull();
  });

  it("legitime Wege bleiben: Betreiber, personengebundener Leitungscode, Demozugang (Leitung ohne Person)", async () => {
    expect((await anmelden(CODE.betreiber)).status).toBe(200);
    const pers = await anmelden(CODE.aLeitung);
    expect(pers.status, pers.fehler).toBe(200);
    expect(pers.person).toBe(CODE.aPerson);
    expect((await anfrage("/api/bestand", { token: pers.token })).status).toBe(200);
    const demo = await codeAblegen("ent-leer", { demo: true });
    const d = await anmelden(demo);
    expect(d.status, d.fehler).toBe(200);
    expect(d.demo).toBe(true);
    expect((await anfrage("/api/bestand", { token: d.token })).status).toBe(200);
  });
});

describe.sequential("E-D2: kein Rückfall in die Ersteinrichtung", () => {
  it("ohne die Ausnahme „leerer Betrieb“: ein Planungscode ohne Person legt im leeren Betrieb keine Leitung an", async () => {
    await betriebAnlegen("ent-plan");
    const z = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: "ent-plan",
      eintraege: [{ rolle: "planer", personId: null }] } });
    expect(z.status, z.fehler).toBe(200);
    const p = await anmelden(z.zugaenge[0].code);
    expect(p.status, p.fehler).toBe(200);
    const g = await anfrage("/api/bestand", { token: p.token });
    expect(g.status).toBe(200);
    const b = kopie(g.bestand);
    b.mandanten[0].personen = [{ id: "p_ichbin1", vorname: "", nachname: "Ich", rolle: "leitung", bereich: "ALLE",
      status: "aktiv", eintritt: "2026-01-01", austritt: null, qualifikationen: [], zugehoerigkeit: [] }];
    const w = await anfrage("/api/bestand", { methode: "PUT", token: p.token, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status).toBe(403);
    expect(await personenIn("ent-plan")).toEqual([]);
    /* Ebenso ein Demozugang mit Leitungsrolle ohne Person (er bekommt eine Sitzung): der Rang gilt, keine Leitung. */
    const demo = await anmelden(await codeAblegen("ent-plan", { demo: true }));
    expect(demo.status, demo.fehler).toBe(200);
    const gd = await anfrage("/api/bestand", { token: demo.token });
    const bd = kopie(gd.bestand);
    bd.mandanten[0].personen = [{ ...b.mandanten[0].personen[0], id: "p_demo001" }];
    const wd = await anfrage("/api/bestand", { methode: "PUT", token: demo.token, rumpf: { bestand: bd, etag: gd.etag } });
    expect(wd.status).not.toBe(200);
    expect(await personenIn("ent-plan")).toEqual([]);
  });

  it("alle Personen gelöscht/verloren: ein zweiter, noch offener Erstanmeldecode legt nichts an; kein neuer wird ausgestellt", async () => {
    const [eins, zwei] = await betriebMitErstcodes("ent-b", 2);
    const a = await anmelden(eins);
    expect(a.status, a.fehler).toBe(200);
    const marke = await L.erstleitungMarkeLesen(store(), "ent-b", "ent-b");
    expect(marke).toMatchObject({ personId: a.person });
    await allePersonenWeg("ent-b");
    expect(await personenIn("ent-b")).toEqual([]);
    const z = await anmelden(zwei);
    expect(z.status).toBe(403);
    expect(z.token).toBeUndefined();
    expect(await personenIn("ent-b")).toEqual([]);
    expect((await kontoVon(zwei)).erstleitungVerbraucht).toMatchObject({ grund: "belegt" });
    /* Die Marke bleibt, wie sie war (einmal anlegbar, nie überschrieben). */
    expect(await L.erstleitungMarkeLesen(store(), "ent-b", "ent-b")).toEqual(marke);
    /* Ausstellen: der Betrieb gilt als eingerichtet, obwohl er keine Personen hat. */
    const m = (await L.bestandLesenStreng(store(), "ent-b")).bestand.mandanten[0];
    expect(await L.erstleitungEingerichtet(store(), "ent-b", m)).toBe(true);
    expect(L.erstleitungAusstellen({ rolle: "leitung", person: null, demo: false, mandant: m, lage: { art: "fenster" },
      eingerichtet: await L.erstleitungEingerichtet(store(), "ent-b", m) })).toBe(false);
    /* Ein gewöhnlicher Leitungscode ohne Person kommt auch hier nicht hinein. */
    expect((await anmelden(await codeAblegen("ent-b"))).status).toBe(403);
  });

  it("Marke unantastbar: manipulierte Rümpfe über PUT und Teilweg (Leitung, Planung) setzen sie nicht zurück", async () => {
    const [eins, zwei] = await betriebMitErstcodes("ent-m", 2);
    const l = await anmelden(eins);
    expect(l.status, l.fehler).toBe(200);
    const vorher = await L.erstleitungMarkeLesen(store(), "ent-m", "ent-m");
    expect(vorher).toMatchObject({ personId: l.person });
    const planer = await anmelden(await codeAblegen("ent-m", { rolle: "planer" }));
    expect(planer.status, planer.fehler).toBe(200);
    for (const token of [l.token, planer.token]) {
      const g = await anfrage("/api/bestand", { token });
      expect(g.status).toBe(200);
      const b = kopie(g.bestand);
      Object.assign(b, { erstleitungMarke: null, "erstleitung-marke": null });
      Object.assign(b.mandanten[0], { erstleitungMarke: null, ersteinrichtungAbgeschlossen: false, erstleitung: null });
      b.mandanten[0].personen = [];
      await anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag } });
      const g2 = await anfrage("/api/bestand?teile=1", { token });
      if (g2.teile && g2.teile.format === 1) {
        const v = g2.teile.versionen || {};
        await anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g2.teile.epoche, durch: "Prüfung",
          kern: { personen: { basis: v["kern:personen"], wert: [] },
            ersteinrichtungAbgeschlossen: { basis: v["kern:ersteinrichtungAbgeschlossen"] ?? null, wert: false },
            erstleitungMarke: { basis: v["kern:erstleitungMarke"] ?? null, wert: null } } } });
      }
    }
    /* Die Marke steht unverändert; der Betrieb fällt nicht in die Ersteinrichtung zurück. */
    expect(await L.erstleitungMarkeLesen(store(), "ent-m", "ent-m")).toEqual(vorher);
    const z = await anmelden(zwei);
    expect(z.status).toBe(403);
    expect(z.token).toBeUndefined();
    expect((await personenIn("ent-m")).filter((p) => p.rolle === "leitung").map((p) => p.id)).toEqual([l.person]);
  });

  it("/api/wiederherstellen einer Sicherung ohne Personen öffnet die Ersteinrichtung nicht wieder", async () => {
    const [eins, zwei] = await betriebMitErstcodes("ent-c", 2);
    const a = await anmelden(eins);
    expect(a.status, a.fehler).toBe(200);
    const s = await anfrage("/api/sicherung", { methode: "POST", token: a.token, rumpf: {} });
    expect(s.status, s.fehler).toBe(200);
    /* Eine ältere Sicherung aus der Zeit vor der Erstanmeldung: derselbe Betrieb, ohne Personen. */
    const { markeNeu } = await import("../server/lib/sicherungen.mjs");
    const { blobs } = await store().list({ prefix: "sicherung:ent-c:" });
    expect(blobs.length).toBeGreaterThan(0);
    const roh = await store().get(blobs[0].key, { type: "json" });
    const leer = kopie(roh);
    const mm = Array.isArray(leer.mandanten) ? leer.mandanten[0] : leer;
    mm.personen = [];
    /* Zeit der älteren Sicherung: eine Minute vor der eben vom Server geschriebenen — aus deren Vermerk, nicht aus der Uhr. */
    const vorher = new Date(Date.parse((await store().getMetadata(blobs[0].key)).metadata.zeit) - 60_000);
    const marke = markeNeu(vorher, () => 0.4242);
    await store().setJSON(`sicherung:ent-c:${marke}`, leer, { metadata: { zeit: vorher.toISOString(),
      durch: "Leitung", mandantId: "ent-c", rolle: "leitung" } });
    const g = await anfrage("/api/bestand", { token: a.token });
    const w = await anfrage("/api/wiederherstellen", { methode: "POST", token: a.token, rumpf: { marke, etag: g.etag } });
    /* Der Rang verbietet der Leitung, die eigene Rolle zu entfernen — die Sicherung kommt nicht zurück. Gleich wie es
       ausgeht: danach legt kein Erstanmeldecode eine Person an. */
    expect([200, 403]).toContain(w.status);
    const z = await anmelden(zwei);
    expect(z.status).toBe(403);
    expect(z.token).toBeUndefined();
    expect((await personenIn("ent-c")).filter((p) => p.id !== a.person)).toEqual([]);
    expect(await L.erstleitungMarkeLesen(store(), "ent-c", "ent-c")).toMatchObject({ personId: a.person });
  });
});

describe.sequential("E-Mail: keine übernommene Adresse", () => {
  it("die vom Server angelegte erste Leitungsperson hat keine Adresse — auch wenn der Betrieb eine Kontaktadresse hat", async () => {
    const [erst] = await betriebMitErstcodes("ent-mail");
    const g = await L.bestandLesenStreng(store(), "ent-mail");
    const b = kopie(g.bestand);
    b.mandanten[0].kontakt = "kontakt@betrieb.example";
    expect((await L.bestandSchreiben(store(), "ent-mail", b, { erwarteterStand: g.stand, durch: "Prüfung" })).ok).toBe(true);
    const a = await anmelden(erst);
    expect(a.status, a.fehler).toBe(200);
    const [p] = await personenIn("ent-mail");
    expect(p.id).toBe(a.person);
    expect(p.email).toBe("");
  });

  it("Anlage über die Betreiberkonsole (baueAusAnlage): Kontaktadresse bleibt Betriebsangabe, nie Personenadresse", async () => {
    const { baueAusAnlage } = await import("../src/lib/mandant-anlage.js");
    const { MODELLE } = await import("../src/lib/fachlogik.js");
    const mo = MODELLE[0];
    const m = baueAusAnlage({ name: "Haus Mail", branche: "pflege", einheitLabel: "Wohnbereich", tarif: "pro", status: "test",
      testTage: 90, kontakt: "leitung@kunde.example", kontaktName: "Anna Beispiel", anschrift: "Weg 1", ustId: "",
      wochenstunden: 38.5, ruhezeit: 11, maxFolge: 6, ausgleichGrenze: 40, modellId: mo.id, gruppen: mo.gruppen,
      standorte: [{ name: "Haus A", land: "NI", radius: 150 }], qualifikationen: [], zuschlaege: [] });
    expect(m.kontakt).toBe("leitung@kunde.example");
    expect(m.personen).toHaveLength(1);
    expect(m.personen[0].rolle).toBe("leitung");
    expect(m.personen[0].email).toBe("");
  });
});

describe.sequential("Einladung 404/403: keine Unterscheidung, die Existenz verrät", () => {
  it("unbekannte Person und Person eines fremden Betriebs: dieselbe 404; eine eigene, nicht vergebbare Rolle: 403 wie bisher", async () => {
    const [erst] = await betriebMitErstcodes("ent-fremd");
    const fremd = await anmelden(erst);
    expect(fremd.status, fremd.fehler).toBe(200);
    const t = (await anmelden(CODE.aLeitung)).token;
    const bitte = (personId) => anfrage("/api/einladung", { methode: "POST", token: t,
      rumpf: { personId, bestaetigung: { zugangscode: CODE.aLeitung } } });
    const unbekannt = await bitte("p_gibtsnie");
    const anderswo = await bitte(fremd.person);
    expect(unbekannt.status).toBe(404);
    expect(anderswo.status).toBe(404);
    const ohneStatus = ({ status: _s, ...r }) => r;
    expect(ohneStatus(anderswo)).toEqual(ohneStatus(unbekannt));
    expect(anderswo.einladung).toBeUndefined();
    /* Die eigene Leitungsperson: Leitung vergibt die eigene Rolle nicht — 403, unverändert (keine Rechteänderung). */
    const selbst = await bitte(CODE.aPerson);
    expect(selbst.status).toBe(403);
    expect(selbst.einladung).toBeUndefined();
  });
});
