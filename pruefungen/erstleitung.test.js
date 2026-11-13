/* ==========================================================================
   ABNAHME V4, A-3 — ERSTANMELDUNG DER LEITUNG: SERVERSEITIG, ATOMAR, DAUERHAFT

   Betreiberentscheidung 2026-11-13: Die erste Leitungsperson eines leeren
   Betriebs entsteht bei der regulären ersten Anmeldung auf dem SERVER
   (server/lib/erstleitung.mjs), ausgelöst allein durch einen ausdrücklich so
   ausgestellten Erstanmeldecode (Vermerk `erstleitung`). Vorher legte sie die
   Oberfläche nur im Arbeitsspeicher an.

   Teil 1 — echter Server (server.mjs, Wegwerfablage, echte Handler über HTTP):
     Ausstellen (nur Leitung ohne Person in leerem Betrieb wird markiert),
     N gleichzeitige Erstanmeldungen mit demselben Code (genau eine Person),
     Wiederholung nach Erfolg, Mandantenwechsel, manipulierte Rümpfe für alle
     Rollen, abgelaufene/gesperrte Codes, Betrieb mit Personen (gestrandeter
     Code: nie eine Person über diesen Weg), Wiederanlauf nach einem Abbruch
     zwischen den Schritten (Zustand wie nach einem Prozessende), Protokoll.
   Teil 2 — derselbe Kern in-process mit eingespeisten Schreibfehlern:
     keine halbe Person, keine Sitzung, Wiederholung möglich.

   Aufruf: npx vitest run pruefungen/erstleitung.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverStarten } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = "erstleitung-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const PFEFFER = randomUUID();

let kind, statik, daten, BASIS;
let xff = 0;
/** Module der Ablage im Prüfprozess — gegen dieselbe Wegwerfablage wie der Server. */
let L = /** @type {any} */ ({});

async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const kopf = { "x-forwarded-for": `10.71.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await fetch(BASIS + pfad, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const anmelden = (code, extra = {}) => anfrage("/api/anmelden", { methode: "POST", rumpf: { ...extra, zugangscode: code } });
const store = () => L.getStore({ name: "centric", consistency: "strong" });
const personenIn = async (raum) => {
  const g = await L.bestandLesenStreng(store(), raum);
  return g.bestand.mandanten[0].personen || [];
};
const kontoVon = (code) => L.kontoLesenStreng(store(), L.ablageSchluessel(code));
/** Ein Zugang direkt in die Ablage (für Zustände, die kein Endpunkt erzeugt: Altcode, abgebrochener Vorgang). */
async function codeAblegen(raum, extra = {}) {
  const code = `T${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
  await L.kontoSchreiben(store(), L.ablageSchluessel(code), { name: `Leitung ${raum}`, bestand: raum, rolle: "leitung",
    person: null, betrieb: 0, mandantId: raum, demo: false, gruppe: null, hinweis: null,
    angelegt: new Date().toISOString(), ...extra });
  return code;
}
const vermerk = (raum, extra = {}) => ({ erstleitung: { mandantId: raum, angelegt: new Date().toISOString(), ...extra } });

let betreiber;
const CODE = {};
async function betriebAnlegen(raum) {
  const a = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiber, rumpf: { bestand: raum, vorlage: "leer", name: `Haus ${raum}` } });
  expect(a.status, a.fehler).toBe(200);
}

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-erstl-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-erstl-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Erstanmeldung</title>");
  const st = await serverStarten({ cwd: WURZEL, wartenMs: 30_000, env: {
    CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
    CENTRIC_PFEFFER: PFEFFER, CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_IMPORT_AKTIV: undefined, CENTRIC_REGISTRIERUNG: undefined,
    /* Vorgabe der Auslieferung: Schalter AUS — streng nur für Betriebe mit Erstanmeldemarke. */
    CENTRIC_ERSTLEITUNG_STRENG: undefined } });
  ({ kind, basis: BASIS } = st);
  /* Der Prüfprozess liest und schreibt dieselbe Ablage (Dateien, ohne Zwischenspeicher) mit demselben Pfeffer. */
  process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  L = { ...(await import("../server/lib/ablage.mjs")), ...(await import("../server/lib/bestand.mjs")),
    ...(await import("../server/lib/konten.mjs")), ...(await import("../server/lib/codes.mjs")) };
  const e = await anfrage("/einrichten", { methode: "POST", rumpf: { verwaltung: ADMIN, name: "Betreiber", bestand: "erstl-betreiber",
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

describe.sequential("Teil 1: echter Server", () => {
  it("Ausstellen: nur der Leitungscode ohne Person für den leeren Betrieb ist ein Erstanmeldecode", async () => {
    for (const r of ["erstl-a", "erstl-b", "erstl-d", "erstl-e"]) await betriebAnlegen(r);
    const z = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: "erstl-a",
      eintraege: [{ rolle: "leitung", personId: null }, { rolle: "planer", personId: null }, { rolle: "betriebsrat", personId: null }] } });
    expect(z.status, z.fehler).toBe(200);
    expect(z.zugaenge.map((x) => [x.rolle, x.erstanmeldung === true])).toEqual([["leitung", true], ["planer", false], ["betriebsrat", false]]);
    [CODE.a, CODE.aPlaner, CODE.aBr] = z.zugaenge.map((x) => x.code);
    const k = await kontoVon(CODE.a);
    expect(k.erstleitung).toEqual({ mandantId: "erstl-a", angelegt: expect.any(String), bis: expect.any(String) });
    expect(Object.keys(k.erstleitung).sort()).toEqual(["angelegt", "bis", "mandantId"]);
    /* Gültigkeit beim Einlösen geprüft (Review Punkt 3): 14 Tage. */
    expect(Date.parse(k.erstleitung.bis) - Date.parse(k.erstleitung.angelegt)).toBe(14 * 24 * 60 * 60 * 1000);
    expect((await kontoVon(CODE.aPlaner)).erstleitung).toBeUndefined();
    expect((await kontoVon(CODE.aBr)).erstleitung).toBeUndefined();
    /* Ausstellen allein legt nichts an. */
    expect(await personenIn("erstl-a")).toEqual([]);
    for (const [raum, key] of [["erstl-b", "b"], ["erstl-d", "d"]]) {
      const zz = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: raum,
        eintraege: raum === "erstl-d" ? [{ rolle: "leitung", personId: null }, { rolle: "leitung", personId: null }] : [{ rolle: "leitung", personId: null }] } });
      expect(zz.status, zz.fehler).toBe(200);
      CODE[key] = zz.zugaenge[0].code;
      if (raum === "erstl-d") CODE.d2 = zz.zugaenge[1].code;
    }
    const ze = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: "erstl-e",
      eintraege: [{ rolle: "planer", personId: null }, { rolle: "betriebsrat", personId: null }] } });
    expect(ze.status, ze.fehler).toBe(200);
    expect(ze.zugaenge.every((x) => x.erstanmeldung !== true)).toBe(true);
    [CODE.ePlaner, CODE.eBr] = ze.zugaenge.map((x) => x.code);
  });

  it("gewöhnliche Codes legen nie eine Person an — auch nicht mit manipuliertem Rumpf (alle Rollen)", async () => {
    const boese = { person: "p_fremd01", rolle: "betreiber", bestand: "erstl-b", mandantId: "erstl-b", betrieb: 1,
      erstleitung: { mandantId: "erstl-e" }, erstanmeldung: true, personId: "p_x" };
    for (const [code, rolle] of [[CODE.ePlaner, "planer"], [CODE.eBr, "betriebsrat"]]) {
      const a = await anmelden(code, boese);
      expect(a.status, a.fehler).toBe(200);
      expect(a.rolle).toBe(rolle);
      expect(a.person).toBeNull();
      const g = await anfrage("/api/bestand", { token: a.token });
      expect(g.status).toBe(200);
    }
    const bt = await anmelden(CODE.betreiber, boese);
    expect(bt.status, bt.fehler).toBe(200);
    expect(bt.rolle).toBe("betreiber");
    /* Ein Leitungscode OHNE Vermerk im leeren BESTANDSbetrieb (ohne Marke), Schalter CENTRIC_ERSTLEITUNG_STRENG aus:
       der bisherige Ablauf bleibt (Sitzung, Rolle aus dem Code) — aber nie eine Person. Streng: erstleitung-entscheidungen. */
    await betriebAnlegen("erstl-alt");
    const alt = await codeAblegen("erstl-alt");
    const al = await anmelden(alt, boese);
    expect(al.status, al.fehler).toBe(200);
    expect(al.person).toBeNull();
    expect((await anfrage("/api/bestand", { token: al.token })).status).toBe(200);
    for (const r of ["erstl-e", "erstl-b", "erstl-alt"]) expect(await personenIn(r), r).toEqual([]);
    expect((await kontoVon(alt)).person).toBeNull();
  });

  it("N gleichzeitige Erstanmeldungen mit demselben Code: genau eine Person, alle als dieselbe Person angemeldet", async () => {
    const N = 8;
    const antworten = await Promise.all(Array.from({ length: N }, (_, i) =>
      anmelden(CODE.a, i % 2 ? { person: "p_fremd01", bestand: "erstl-b", rolle: "betreiber" } : {})));
    for (const a of antworten) expect(a.status, a.fehler).toBe(200);
    const ids = new Set(antworten.map((a) => a.person));
    expect(ids.size).toBe(1);
    const [pid] = ids;
    expect(pid).toMatch(/^p_[0-9a-f]{7}$/);
    for (const a of antworten) expect(a.rolle).toBe("leitung");
    const ps = await personenIn("erstl-a");
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ id: pid, rolle: "leitung", bereich: "ALLE", status: "aktiv", imSchichtdienst: false,
      vorname: "", nachname: "Organisationsleitung", email: "", austritt: null });
    /* Dauerhaft und gebunden: Der Code trägt die Person, der Vermerk ist verbraucht. */
    const k = await kontoVon(CODE.a);
    expect(k.person).toBe(pid);
    expect(k.erstleitung).toBeUndefined();
    expect(k.erstleitungVerbraucht).toMatchObject({ grund: "angelegt", mandantId: "erstl-a", personId: pid });
    /* Die Sitzung arbeitet als diese Person mit Leitungsrechten — im eigenen Betrieb, nicht im fremden. */
    const g = await anfrage("/api/bestand", { token: antworten[0].token });
    expect(g.status).toBe(200);
    expect(g.rolle).toBe("leitung");
    expect(g.bestand.mandanten.map((m) => m.id)).toEqual(["erstl-a"]);
    expect(await personenIn("erstl-b")).toEqual([]);
    CODE.aPerson = pid;
  });

  it("Wiederholung nach Erfolg (Replay, Doppelklick): dieselbe Person, keine zweite", async () => {
    for (let i = 0; i < 3; i++) {
      const a = await anmelden(CODE.a);
      expect(a.status, a.fehler).toBe(200);
      expect(a.person).toBe(CODE.aPerson);
    }
    expect(await personenIn("erstl-a")).toHaveLength(1);
  });

  it("Protokoll: die Anlage steht drin — genau einmal, nur Kennungen", async () => {
    const wurzel = path.join(daten, "centric-spur");
    const zeilen = [];
    const gehe = async (d) => {
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await gehe(p);
        else if (e.name.endsWith(".json")) {
          const roh = JSON.parse(await readFile(p, "utf8"));
          zeilen.push(roh && typeof roh === "object" && "daten" in roh ? (typeof roh.daten === "string" ? JSON.parse(roh.daten) : roh.daten) : roh);
        }
      }
    };
    await gehe(wurzel);
    const treffer = zeilen.filter((z) => z && typeof z.zusatz === "string" && z.zusatz.startsWith("Erstanmeldung: Leitungsperson angelegt")
      && z.zusatz.includes("erstl-a"));
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({ art: "anmelden", ausgang: "erfolg", rolle: "leitung", person: CODE.aPerson, mandantId: "erstl-a" });
    expect(JSON.stringify(treffer[0])).not.toMatch(/Haus erstl-a|Organisationsleitung|@/);
  });

  it("zwei Erstanmeldecodes für denselben Betrieb: der zweite legt nichts an und gilt danach nicht mehr", async () => {
    const [a, b] = await Promise.all([anmelden(CODE.d), anmelden(CODE.d2)]);
    const ok = [a, b].filter((x) => x.status === 200);
    const nein = [a, b].filter((x) => x.status !== 200);
    expect(ok).toHaveLength(1);
    expect(nein).toHaveLength(1);
    expect(nein[0].status).toBe(403);
    expect(nein[0].token).toBeUndefined();
    expect(await personenIn("erstl-d")).toHaveLength(1);
    const verlierer = ok[0] === a ? CODE.d2 : CODE.d;
    const nochmal = await anmelden(verlierer);
    expect(nochmal.status).toBe(403);
    expect(nochmal.token).toBeUndefined();
    const k = await kontoVon(verlierer);
    expect(k.person).toBeNull();
    expect(k.erstleitungVerbraucht).toMatchObject({ grund: "belegt" });
    expect(await personenIn("erstl-d")).toHaveLength(1);
  });

  it("Mandantenwechsel: ein Code aus Betrieb A legt nie in Betrieb B an; ein verbogener Vermerk gilt nicht", async () => {
    /* B ist noch leer; der Code von B legt nur in B an — der Rumpf nennt A. */
    const b = await anmelden(CODE.b, { bestand: "erstl-a", mandantId: "erstl-a", betrieb: 0 });
    expect(b.status, b.fehler).toBe(200);
    expect(await personenIn("erstl-a")).toHaveLength(1);
    expect(await personenIn("erstl-b")).toHaveLength(1);
    expect((await personenIn("erstl-b"))[0].id).toBe(b.person);
    /* Vermerk zeigt auf einen anderen Betrieb als der Zugang: nichts angelegt, keine Sitzung. */
    await betriebAnlegen("erstl-x");
    const verbogen = await codeAblegen("erstl-x", vermerk("erstl-b"));
    const v = await anmelden(verbogen);
    expect(v.status).toBe(403);
    expect(v.token).toBeUndefined();
    /* Zugang auf B gebunden, liegt aber in Raum X: die Bindung greift vorher. */
    const fremd = await codeAblegen("erstl-x", { mandantId: "erstl-b", ...vermerk("erstl-b") });
    const f = await anmelden(fremd);
    expect(f.status).toBe(403);
    expect(f.token).toBeUndefined();
    expect(await personenIn("erstl-x")).toEqual([]);
    expect(await personenIn("erstl-b")).toHaveLength(1);
  });

  it("abgelaufener oder gesperrter Erstanmeldecode: keine Person, keine Sitzung", async () => {
    await betriebAnlegen("erstl-abl");
    const abgelaufen = await codeAblegen("erstl-abl", { laeuftAb: new Date(Date.now() - 60_000).toISOString(), ...vermerk("erstl-abl") });
    const gesperrt = await codeAblegen("erstl-abl", { gesperrt: true, ...vermerk("erstl-abl") });
    for (const code of [abgelaufen, gesperrt]) {
      const a = await anmelden(code);
      expect(a.status).toBe(403);
      expect(a.token).toBeUndefined();
    }
    expect(await personenIn("erstl-abl")).toEqual([]);
    expect((await kontoVon(abgelaufen)).erstleitung).toBeTruthy();
  });

  it("gestrandeter Code (Betrieb mit Personen, Leitungscode ohne Person): nie eine Person über diesen Weg", async () => {
    /* Altcode ohne Vermerk in einem Betrieb, dessen Erstanmeldung über den Erstanmeldecode lief (Marke): streng auch bei
       ausgeschaltetem Schalter — keine Sitzung, keine Person (E-D1/F-0). */
    const alt = await codeAblegen("erstl-a");
    const a = await anmelden(alt);
    expect(a.status).toBe(403);
    expect(a.fehler).toBe("Ihr Zugang ist keiner Person zugeordnet.");
    expect(a.token).toBeUndefined();
    expect(await personenIn("erstl-a")).toHaveLength(1);
    /* Betrieb mit Personen, aber ohne Leitung; ein Erstanmeldecode, nachdem Personen eingespielt wurden: abgewiesen. */
    await betriebAnlegen("erstl-voll");
    const g = await L.bestandLesenStreng(store(), "erstl-voll");
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].personen = [{ id: "pl1", vorname: "P", nachname: "Plan", rolle: "planer", bereich: "ALLE", status: "aktiv",
      eintritt: "2020-01-01", austritt: null, qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }];
    expect((await L.bestandSchreiben(store(), "erstl-voll", b, { erwarteterStand: g.stand, durch: "Prüfung" })).ok).toBe(true);
    /* Bestandsbetrieb ohne Marke, Schalter aus: bisheriger Ablauf (Sitzung ohne Person), nie eine neue Person. */
    const ohneVermerk = await codeAblegen("erstl-voll");
    const o = await anmelden(ohneVermerk);
    expect(o.status, o.fehler).toBe(200);
    expect(o.person).toBeNull();
    const mitVermerk = await codeAblegen("erstl-voll", vermerk("erstl-voll"));
    const m = await anmelden(mitVermerk);
    expect(m.status).toBe(403);
    expect(m.token).toBeUndefined();
    expect((await personenIn("erstl-voll")).map((p) => p.id)).toEqual(["pl1"]);
  });

  it("Schalter aus: ein Betrieb MIT Marke bleibt streng — eine liegende Altsitzung endet, ein Planungscode legt nach Verlust aller Personen keine Leitung an", async () => {
    /* erstl-d ist über den Erstanmeldecode eingerichtet (Marke). Eine Sitzung eines Leitungscodes ohne Person: endet. */
    const L2 = { ...L, ...(await import("../server/lib/sitzungen.mjs")) };
    const { token } = await L2.sitzungAnlegen({ bestand: "erstl-d", name: "Alt", rolle: "leitung", person: null, betrieb: 0,
      mandantId: "erstl-d", konto: L.ablageSchluessel(await codeAblegen("erstl-d")), einheit: null }, 3600e3);
    expect((await anfrage("/api/bestand", { token })).status).toBe(401);
    /* Alle Personen verloren; ein Planungscode ohne Person (Sitzung erlaubt) darf trotzdem keine Leitung anlegen. */
    const g = await L.bestandLesenStreng(store(), "erstl-d");
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].personen = [];
    expect((await L.bestandSchreiben(store(), "erstl-d", b, { erwarteterStand: g.stand, durch: "Prüfung" })).ok).toBe(true);
    const planer = await anmelden(await codeAblegen("erstl-d", { rolle: "planer" }));
    expect(planer.status, planer.fehler).toBe(200);
    const gp = await anfrage("/api/bestand", { token: planer.token });
    const bp = JSON.parse(JSON.stringify(gp.bestand));
    bp.mandanten[0].personen = [{ id: "p_planlei", vorname: "", nachname: "X", rolle: "leitung", bereich: "ALLE", status: "aktiv",
      eintritt: "2026-01-01", austritt: null, qualifikationen: [], zugehoerigkeit: [] }];
    const w = await anfrage("/api/bestand", { methode: "PUT", token: planer.token, rumpf: { bestand: bp, etag: gp.etag } });
    expect(w.status).toBe(403);
    expect(await personenIn("erstl-d")).toEqual([]);
    /* Bestandsbetrieb ohne Marke (erstl-alt, leer): die alte Ausnahme gilt dort weiter (Schalter aus). */
    const pa = await anmelden(await codeAblegen("erstl-alt", { rolle: "planer" }));
    const ga = await anfrage("/api/bestand", { token: pa.token });
    const ba = JSON.parse(JSON.stringify(ga.bestand));
    ba.mandanten[0].personen = [{ ...bp.mandanten[0].personen[0], id: "p_altweg1" }];
    const wa = await anfrage("/api/bestand", { methode: "PUT", token: pa.token, rumpf: { bestand: ba, etag: ga.etag } });
    expect(wa.status, wa.fehler).toBe(200);
  });

  it("Wiederanlauf nach Abbruch zwischen den Schritten (wie nach einem Prozessende): keine zweite Person", async () => {
    /* Abbruch nach Schritt 1 (vorgemerkt, Betrieb leer): Die Anmeldung legt genau die vorgemerkte Person an. */
    await betriebAnlegen("erstl-k1");
    const k1 = await codeAblegen("erstl-k1", vermerk("erstl-k1", { personId: "p_abc1234" }));
    const a1 = await anmelden(k1);
    expect(a1.status, a1.fehler).toBe(200);
    expect(a1.person).toBe("p_abc1234");
    expect((await personenIn("erstl-k1")).map((p) => p.id)).toEqual(["p_abc1234"]);
    /* Abbruch nach Schritt 2 (Person geschrieben, Zugang noch nicht gebunden): nur noch binden. */
    await betriebAnlegen("erstl-k2");
    const k2 = await codeAblegen("erstl-k2", vermerk("erstl-k2", { personId: "p_def5678" }));
    const g = await L.bestandLesenStreng(store(), "erstl-k2");
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].personen = [{ id: "p_def5678", vorname: "", nachname: "Organisationsleitung", rolle: "leitung", bereich: "ALLE",
      status: "aktiv", eintritt: "2020-01-01", austritt: null, qualifikationen: [], zugehoerigkeit: [] }];
    expect((await L.bestandSchreiben(store(), "erstl-k2", b, { erwarteterStand: g.stand, durch: "Prüfung" })).ok).toBe(true);
    const a2 = await anmelden(k2);
    expect(a2.status, a2.fehler).toBe(200);
    expect(a2.person).toBe("p_def5678");
    expect((await personenIn("erstl-k2")).map((p) => p.id)).toEqual(["p_def5678"]);
    expect((await kontoVon(k2)).erstleitungVerbraucht).toMatchObject({ grund: "angelegt", personId: "p_def5678" });
  });
});

describe.sequential("Teil 2: Schreibfehler mitten im Vorgang (in-process, echte Ablage)", () => {
  /** Eine Ablage, die beim n-ten passenden Schreibvorgang wirft. */
  const kaputt = (basis, passt) => new Proxy(basis, { get(z, k) {
    const f = z[k];
    if ((k === "setJSON" || k === "set") && typeof f === "function")
      return (schl, ...rest) => { if (passt(String(schl))) return Promise.reject(new Error("Schreibfehler (Prüfung)")); return f.call(z, schl, ...rest); };
    return typeof f === "function" ? f.bind(z) : f;
  } });

  it("Fehler beim Vormerken, beim Schreiben der Person, beim Binden: nie eine halbe Person, Wiederholung legt genau eine an", async () => {
    const { erstleitungEinloesen } = await import("../server/lib/erstleitung.mjs");
    for (const [n, passt] of [["vormerken", (s) => s.startsWith("konto:")], ["person", (s) => !s.startsWith("konto:")],
      ["binden", null]]) {
      const raum = `erstl-f-${n}`;
      await betriebAnlegen(raum);
      const code = await codeAblegen(raum, vermerk(raum));
      const schluessel = L.ablageSchluessel(code);
      let erg;
      if (passt) erg = await erstleitungEinloesen(kaputt(store(), passt), { schluessel });
      else {
        /* Binden scheitert: der ERSTE Kontoschreibvorgang (Vormerken) geht durch, der zweite nicht. */
        let zaehler = 0;
        erg = await erstleitungEinloesen(kaputt(store(), (s) => s.startsWith("konto:") && ++zaehler > 1), { schluessel });
      }
      expect(erg, n).toMatchObject({ ok: false, grund: "schreiben" });
      const ps = await personenIn(raum);
      if (n === "binden") {
        /* Person vollständig da (ein Schreibvorgang), Zugang noch offen mit Vormerkung — keine Sitzung. */
        expect(ps).toHaveLength(1);
        expect((await kontoVon(code)).erstleitung.personId).toBe(ps[0].id);
      } else expect(ps, n).toEqual([]);
      expect((await kontoVon(code)).person, n).toBeNull();
      /* Wiederholung über den echten Server: genau eine Person, angemeldet. */
      const a = await anmelden(code);
      expect(a.status, `${n}: ${a.fehler}`).toBe(200);
      const nach = await personenIn(raum);
      expect(nach, n).toHaveLength(1);
      expect(a.person).toBe(nach[0].id);
      if (n === "binden") expect(nach[0].id).toBe(ps[0].id);
    }
  });

  it("Lesefehler zählt nie als „leer“", async () => {
    const { erstleitungEinloesen } = await import("../server/lib/erstleitung.mjs");
    await betriebAnlegen("erstl-lesen");
    const code = await codeAblegen("erstl-lesen", vermerk("erstl-lesen"));
    const basis = store();
    const blind = new Proxy(basis, { get(z, k) {
      const f = z[k];
      if (k === "get" || k === "getWithMetadata" || k === "getMetadata")
        return (schl, ...r) => (String(schl).startsWith("kern:") ? Promise.reject(new Error("Lesefehler (Prüfung)")) : f.call(z, schl, ...r));
      return typeof f === "function" ? f.bind(z) : f;
    } });
    const erg = await erstleitungEinloesen(blind, { schluessel: L.ablageSchluessel(code) });
    expect(erg.ok).toBe(false);
    expect(await personenIn("erstl-lesen")).toEqual([]);
  });

  it("reine Regeln: Vermerk nur für Leitung ohne Person, kein Demo, leerer Betrieb, Fenster der Ersteinrichtung", async () => {
    const { erstleitungAusstellen, erstleitungOffen } = await import("../server/lib/erstleitung.mjs");
    const leer = { id: "m1", personen: [] };
    expect(erstleitungAusstellen({ rolle: "leitung", person: null, demo: false, mandant: leer, lage: { art: "neu" }, eingerichtet: false })).toBe(true);
    expect(erstleitungAusstellen({ rolle: "leitung", person: null, demo: false, mandant: leer, lage: { art: "fenster" }, eingerichtet: false })).toBe(true);
    /* E-D2: ohne ausdrückliches „nicht eingerichtet“ (Marke unbekannt) und mit Marke kein Vermerk. */
    expect(erstleitungAusstellen({ rolle: "leitung", person: null, demo: false, mandant: leer, lage: { art: "neu" } })).toBe(false);
    expect(erstleitungAusstellen({ rolle: "leitung", person: null, demo: false, mandant: leer, lage: { art: "neu" }, eingerichtet: true })).toBe(false);
    for (const falsch of [{ rolle: "planer" }, { rolle: "betriebsrat" }, { rolle: "mitarbeiter" }, { rolle: "kunde" }, { rolle: "betreiber" },
      { person: "p1" }, { person: 0 }, { demo: true }, { lage: { art: "demo" } }, { lage: { art: "kundenraum" } }, { lage: null },
      { mandant: { id: "m1", personen: [{ id: "p1" }] } }, { mandant: { id: "m1" } }, { mandant: null }])
      expect(erstleitungAusstellen({ rolle: "leitung", person: null, demo: false, mandant: leer, lage: { art: "neu" }, eingerichtet: false, ...falsch }), JSON.stringify(falsch)).toBe(false);
    const e = { rolle: "leitung", person: null, bestand: "r", mandantId: "m1", erstleitung: { mandantId: "m1", angelegt: new Date().toISOString() } };
    expect(erstleitungOffen(e)).toBe(true);
    /* Abgelaufen (bis vorbei, angelegt zu alt, keine Zeit): nie offen — fail-closed. */
    expect(erstleitungOffen({ ...e, erstleitung: { mandantId: "m1", angelegt: new Date().toISOString(), bis: new Date(Date.now() - 1).toISOString() } })).toBe(false);
    expect(erstleitungOffen({ ...e, erstleitung: { mandantId: "m1", angelegt: new Date(Date.now() - 15 * 864e5).toISOString() } })).toBe(false);
    expect(erstleitungOffen({ ...e, erstleitung: { mandantId: "m1" } })).toBe(false);
    for (const falsch of [{ demo: true }, { gesperrt: true }, { rolle: "planer" }, { mandantId: "m2" }, { erstleitung: { mandantId: "m2" } },
      { erstleitung: true }, { erstleitungVerbraucht: { grund: "angelegt" } }, { bestand: "" }])
      expect(erstleitungOffen({ ...e, ...falsch }), JSON.stringify(falsch)).toBe(false);
  });
});
