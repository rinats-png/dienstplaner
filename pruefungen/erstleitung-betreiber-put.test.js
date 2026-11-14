/* ==========================================================================
   ABNAHME V4, A-3 — DELTA-REVIEW f69fd931, BEFUND F1:
   EIN PER BETREIBER-PUT ANGELEGTER BETRIEB IST NEU (REGIME-MARKE)

   Vorher: Der Betreiber-Zweig in server/lib/rechte.mjs übernimmt einen neuen
   Mandanten ganz (Konsole „neuerMandant“, src/app/aktionen/betreiber.js) —
   aber ohne Regime-Marke `erstleitung-regime:<raum>:<mandantId>`. Mit dem
   Schalter CENTRIC_ERSTLEITUNG_STRENG aus (Vorgabe) galt so ein Betrieb als
   Bestandsbetrieb. Probe des Reviews (Raum mit per PUT angelegten Betrieben):
     a) ein Planungscode ohne Person (über /einrichten für Betrieb 2, leer)
        schreibt per PUT eine Leitungsperson in den leeren Betrieb → 200,
        `erstleitungStreng = false`;
     b) ein gewöhnlicher Leitungscode ohne Person (Betrieb 1, mit Person)
        → 200, volle Leitungssitzung.
   Jetzt (server/funktionen/daten.mjs, neueBetriebsKennungen): Jede Kennung,
   die ein Schreibvorgang neu in den Raum bringt, bekommt die Regime-Marke VOR
   dem Bestand; scheitert sie, wird nichts geschrieben (503).

   Teil 1 — echter Server (server.mjs, Wegwerfablage, echte Handler über
   HTTP), je einmal mit Schalter ungesetzt und mit einem verbogenen Wert
   („TRUE “ gilt als aus): a) 403, b) 403; der Bestandsbetrieb des Raums
   bleibt beim bisherigen Ablauf (nicht automatisch umgestellt).
   Teil 2 — derselbe Handler in-process, die Regime-Marke nicht schreibbar:
   503, kein Betrieb ohne Marke; danach geht es.

   Aufruf: npx vitest run pruefungen/erstleitung-betreiber-put.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverStarten } from "./hilfen/port.mjs";
import { baueAusAnlage } from "../src/lib/mandant-anlage.js";
import { regimeAusBuchEntfernen } from "./hilfen/bestandsbetrieb-regime.mjs";

/* Teil 2: die Ablage dieses Prüfprozesses kann das Schreiben der Regime-Marke verweigern (Schalter unten). Der Server
   aus Teil 1 läuft als eigener Prozess und ist davon nicht berührt. */
const FEHLER = { regime: false };
vi.mock("../server/lib/ablage.mjs", async (original) => {
  const echt = /** @type {any} */ (await original());
  return { ...echt, getStore: (...a) => {
    const s = echt.getStore(...a);
    return new Proxy(s, { get(ziel, k) {
      if (k === "setJSONWennNeu") return async (schluessel, ...rest) => {
        if (FEHLER.regime && String(schluessel).startsWith("erstleitung-regime:"))
          throw new Error("Prüfung: Regime-Marke nicht schreibbar");
        return ziel.setJSONWennNeu(schluessel, ...rest);
      };
      const v = ziel[k];
      return typeof v === "function" ? v.bind(ziel) : v;
    } });
  } };
});

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OHNE_PERSON = "Ihr Zugang ist keiner Person zugeordnet.";
const kopie = (x) => JSON.parse(JSON.stringify(x));
const regimeSchluessel = (raum, mandantId) => `erstleitung-regime:${raum}:${mandantId}`;
/** Ein Betrieb, wie ihn die Betreiberkonsole anlegt (src/lib/mandant-anlage.js, „neuerMandant“) — mit Leitungsperson. */
const konsolenBetrieb = (name) => baueAusAnlage({ name, branche: "pflege", einheitLabel: "Wohnbereich", tarif: "basis" });
const leitungsperson = (id) => ({ id, vorname: "", nachname: "Probe", rolle: "leitung", bereich: "ALLE", status: "aktiv",
  eintritt: "2026-01-01", austritt: null, qualifikationen: [], zugehoerigkeit: [] });

/** HTTP gegen den Server dieses Blocks. */
function verbindung() {
  let xff = 0;
  const v = { basis: "", anfrage: async (pfad, { methode = "GET", rumpf, token } = {}) => {
    xff += 1;
    const kopf = { "x-forwarded-for": `10.74.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await fetch(v.basis + pfad, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  } };
  return v;
}

/* ----------------------------- Teil 1: echter Server ----------------------------- */
describe.each([
  ["Schalter ungesetzt (Vorgabe aus)", undefined],
  ["Schalter verbogen „TRUE “ (gilt als aus)", "TRUE "],
])("F1, echter Server — %s", (_titel, schalter) => {
  const ADMIN = "f1put-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const PFEFFER = randomUUID();
  const RAUM = `f1put-${schalter === undefined ? "aus" : "verbogen"}`;
  const v = verbindung();
  let kind, statik, daten, L = /** @type {any} */ ({});
  let betreiberRaum, M0, M1, M2;
  const CODE = {};
  const store = () => L.getStore({ name: "centric", consistency: "strong" });
  const anmelden = (code) => v.anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
  const einrichten = (rumpf) => v.anfrage("/einrichten", { methode: "POST", rumpf: { verwaltung: ADMIN, person: null, ...rumpf } });

  beforeAll(async () => {
    statik = await mkdtemp(path.join(tmpdir(), "centric-f1put-statik-"));
    daten = await mkdtemp(path.join(tmpdir(), "centric-f1put-daten-"));
    await mkdir(path.join(statik, "assets"));
    await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC F1</title>");
    const st = await serverStarten({ cwd: WURZEL, wartenMs: 30_000, env: {
      CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
      CENTRIC_PFEFFER: PFEFFER, CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
      CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_IMPORT_AKTIV: undefined, CENTRIC_REGISTRIERUNG: undefined,
      CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined, CENTRIC_TEILSPEICHERUNG: undefined,
      CENTRIC_ERSTLEITUNG_STRENG: schalter } });
    ({ kind, basis: v.basis } = st);
    process.env.CENTRIC_DATEN = daten;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = PFEFFER;
    if (schalter === undefined) delete process.env.CENTRIC_ERSTLEITUNG_STRENG;
    else process.env.CENTRIC_ERSTLEITUNG_STRENG = schalter;
    L = { ...(await import("../server/lib/ablage.mjs")), ...(await import("../server/lib/bestand.mjs")),
      ...(await import("../server/lib/erstleitung.mjs")) };

    /* Ein Bestandsraum: ein Betreiber legt ihn an; die Regime-Marke wird entfernt — so stand ein Raum von vor A-3 in
       der Ablage. Danach ein Betreiberzugang für genau diesen Raum (wie in der Probe des Reviews). */
    const b0 = await einrichten({ name: "Betreiber", bestand: `${RAUM}-konsole`, rolle: "betreiber", betrieb: 0 });
    expect(b0.status, b0.fehler).toBe(200);
    const s0 = await anmelden(b0.zugangscode);
    expect(s0.status, s0.fehler).toBe(200);
    const an = await v.anfrage("/api/bestand-anlegen", { methode: "POST", token: s0.token,
      rumpf: { bestand: RAUM, vorlage: "leer", name: "Bestandshaus" } });
    expect(an.status, an.fehler).toBe(200);
    [M0] = an.mandanten;
    await store().delete(regimeSchluessel(RAUM, M0));
    /* Kopplung E-M6 (Review C1): auch der Eintrag im Widerrufbuch — ein Raum von vor A-3 hat keinen. */
    await regimeAusBuchEntfernen(RAUM, [M0]);
    expect(await L.erstleitungStreng(store(), RAUM, M0)).toBe(false);
    const b1 = await einrichten({ name: "Betreiber Raum", bestand: RAUM, rolle: "betreiber", betrieb: 0 });
    expect(b1.status, b1.fehler).toBe(200);
    const s1 = await anmelden(b1.zugangscode);
    expect(s1.status, s1.fehler).toBe(200);
    betreiberRaum = s1.token;
  }, 120_000);

  afterAll(async () => {
    if (kind && kind.exitCode === null) kind.kill("SIGKILL");
    await rm(statik, { recursive: true, force: true }).catch(() => {});
    await rm(daten, { recursive: true, force: true }).catch(() => {});
    delete process.env.CENTRIC_ERSTLEITUNG_STRENG;
  });

  it("Betreiber-PUT legt zwei Betriebe an (Konsole): beide bekommen die Regime-Marke, der Bestandsbetrieb nicht", async () => {
    const g = await v.anfrage("/api/bestand", { token: betreiberRaum });
    expect(g.status, g.fehler).toBe(200);
    const b = kopie(g.bestand);
    const eins = konsolenBetrieb("F1 Haus Eins");                    // mit Leitungsperson (Probe b)
    const zwei = { ...konsolenBetrieb("F1 Haus Zwei"), personen: [] }; // leer (Probe a)
    b.mandanten = [...b.mandanten, eins, zwei];
    const w = await v.anfrage("/api/bestand", { methode: "PUT", token: betreiberRaum, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.text || w.fehler).toBe(200);
    const gespeichert = (await L.bestandLesenStreng(store(), RAUM)).bestand.mandanten;
    expect(gespeichert.map((m) => m.id)).toEqual([M0, eins.id, zwei.id]);
    [, M1, M2] = gespeichert.map((m) => m.id);
    expect(gespeichert[1].personen.map((p) => p.rolle)).toEqual(["leitung"]);
    expect(gespeichert[2].personen).toEqual([]);
    /* Zugänge wie in der Probe des Reviews über /einrichten — alle vor der ersten Kundensitzung (danach ist das Fenster
       der Ersteinrichtung zu, kundenraumschutz.mjs). */
    for (const [k, rolle, betrieb] of [["planer2", "planer", 2], ["leitung1", "leitung", 1], ["planer0", "planer", 0]]) {
      const e = await einrichten({ name: `${rolle} ohne Person ${betrieb}`, bestand: RAUM, rolle, betrieb });
      expect(e.status, e.fehler).toBe(200);
      CODE[k] = e.zugangscode;
    }
    for (const id of [M1, M2]) {
      expect(await store().get(regimeSchluessel(RAUM, id), { type: "json" })).toEqual({ seit: expect.any(String), durch: "Betreiber" });
      expect(await L.erstleitungStreng(store(), RAUM, id)).toBe(true);
    }
    /* Bestandsbetrieb: nicht automatisch umgestellt (Betreibervorgabe 2026-11-13). */
    expect(await store().get(regimeSchluessel(RAUM, M0), { type: "json" })).toBeNull();
    expect(await L.erstleitungStreng(store(), RAUM, M0)).toBe(false);
    /* Ein weiterer PUT ohne neuen Betrieb schreibt keine Marke für den Bestandsbetrieb. */
    const g2 = await v.anfrage("/api/bestand", { token: betreiberRaum });
    const w2 = await v.anfrage("/api/bestand", { methode: "PUT", token: betreiberRaum, rumpf: { bestand: g2.bestand, etag: g2.etag } });
    expect(w2.status, w2.text || w2.fehler).toBe(200);
    expect(await store().get(regimeSchluessel(RAUM, M0), { type: "json" })).toBeNull();
  });

  it("Probe a: Planungscode ohne Person (über /einrichten, Betrieb 2) legt im leeren, per PUT angelegten Betrieb keine Leitung an", async () => {
    const p = await anmelden(CODE.planer2);
    expect(p.status, p.fehler).toBe(200);
    const g = await v.anfrage("/api/bestand", { token: p.token });
    expect(g.status, g.fehler).toBe(200);
    const b = kopie(g.bestand);
    const m = b.mandanten.find((x) => x && x.id === M2);
    expect(m && m.personen).toEqual([]);
    m.personen = [leitungsperson("p_f1prob")];
    const w = await v.anfrage("/api/bestand", { methode: "PUT", token: p.token, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.text || w.fehler).toBe(403);
    expect((await L.bestandLesenStreng(store(), RAUM)).bestand.mandanten[2].personen).toEqual([]);
    expect(g.erstleitungStreng).toBe(true);
  });

  it("Probe b: gewöhnlicher Leitungscode ohne Person (über /einrichten, Betrieb 1 mit Person) bekommt keine Sitzung", async () => {
    const a = await anmelden(CODE.leitung1);
    expect(a.status).toBe(403);
    expect(a.fehler).toBe(OHNE_PERSON);
    expect(a.token).toBeUndefined();
  });

  it("Gegenprobe Bestandsbetrieb (Schalter aus): derselbe Schritt wie in Probe a geht dort wie bisher (Ausnahme „leerer Betrieb“)", async () => {
    const p = await anmelden(CODE.planer0);
    expect(p.status, p.fehler).toBe(200);
    const g = await v.anfrage("/api/bestand", { token: p.token });
    expect(g.status, g.fehler).toBe(200);
    expect(g.erstleitungStreng).toBe(false);
    const b = kopie(g.bestand);
    const m = b.mandanten.find((x) => x && x.id === M0);
    expect(m && m.personen).toEqual([]);
    m.personen = [leitungsperson("p_f1best")];
    const w = await v.anfrage("/api/bestand", { methode: "PUT", token: p.token, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.text || w.fehler).toBe(200);
    expect(await store().get(regimeSchluessel(RAUM, M0), { type: "json" })).toBeNull();
  });
});

/* ------------------- Teil 2: Marke nicht schreibbar → nichts geschrieben ------------------- */
describe.sequential("F1, in-process: Regime-Marke scheitert → 503, kein Betrieb ohne Marke", () => {
  const WIRT = "127.0.0.1:3000";
  const RAUM = "f1put-fehler";
  let wurzel, laden, handler, nr = 0;
  const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.75.${Math.floor(nr / 250)}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };

  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-f1put-fehler-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = randomUUID();
    process.env.CENTRIC_ADMIN = `f1put-${randomUUID()}`;
    delete process.env.CENTRIC_ERSTLEITUNG_STRENG;
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    handler = (await import("../server/funktionen/daten.mjs")).default;
  });
  afterAll(async () => {
    FEHLER.regime = false;
    await rm(wurzel, { recursive: true, force: true }).catch(() => {});
  });

  it("Betreiber-PUT mit neuem Betrieb: Marke scheitert → 503, Bestand unverändert; danach 200 mit Marke", async () => {
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const { ablageSchluessel } = await import("../server/lib/codes.mjs");
    const { bestandSchreiben, bestandLesenStreng } = await import("../server/lib/bestand.mjs");
    const alt = konsolenBetrieb("Bestandshaus F1");
    await bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [alt] }, { durch: "Prüfung" });
    const code = `B${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Betreiber F1", bestand: RAUM, rolle: "betreiber",
      person: null, betrieb: 0, demo: false, gruppe: null, hinweis: null, angelegt: "2026-11-13T08:00:00.000Z" });
    const s = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
    expect(s.status, s.fehler).toBe(200);
    const g = await anfrage("/api/bestand", { methode: "GET", token: s.token });
    expect(g.status, g.fehler).toBe(200);
    const neu = konsolenBetrieb("F1 Haus Neu");
    const b = kopie(g.bestand);
    b.mandanten = [...b.mandanten, neu];

    FEHLER.regime = true;
    const w = await anfrage("/api/bestand", { methode: "PUT", token: s.token, rumpf: { bestand: b, etag: g.etag } });
    FEHLER.regime = false;
    expect(w.status, w.text || w.fehler).toBe(503);
    expect((await bestandLesenStreng(laden(), RAUM)).bestand.mandanten.map((m) => m.id)).toEqual([alt.id]);
    expect(await laden().get(regimeSchluessel(RAUM, neu.id), { type: "json" })).toBeNull();

    const w2 = await anfrage("/api/bestand", { methode: "PUT", token: s.token, rumpf: { bestand: b, etag: g.etag } });
    expect(w2.status, w2.text || w2.fehler).toBe(200);
    expect((await bestandLesenStreng(laden(), RAUM)).bestand.mandanten.map((m) => m.id)).toEqual([alt.id, neu.id]);
    expect(await laden().get(regimeSchluessel(RAUM, neu.id), { type: "json" })).toEqual({ seit: expect.any(String), durch: "Betreiber" });
    expect(await laden().get(regimeSchluessel(RAUM, alt.id), { type: "json" })).toBeNull();
  });
});
