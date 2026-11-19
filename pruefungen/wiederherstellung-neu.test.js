/* ==========================================================================
   WR-2: NEUGENERIERUNG DER WIEDERHERSTELLUNGSCODES ÜBER ALLE EINGÄNGE

   Akzeptanz (docs/acc45/work-packages.json, WR-2; Entscheidungen 8 und 9):
     - Neugenerierung nur nach vollständiger, frischer Authentifizierung:
       erster Faktor (Passwort / Zugangscode / Verwalterschlüssel) UND ein
       frischer Code aus der App. Kein Wiederherstellungscode, kein Nachweis,
       kein Sitzungsmerkmal.
     - Sie invalidiert alle bisherigen Codes auf einmal, unter einer Sperre.
     - Codeverbrauch und Schlüsselepoche gegen zurückgespielte Sicherungen:
       Ein in einer älteren Ablage noch unverbrauchter Code gilt nach der
       Wiederherstellung nicht (neue Epoche).
     - Konsistent bei Fehlern (Schreibfehler: alte Codes bleiben, kein neuer
       Code verlässt den Server) und bei gleichzeitigen Anfragen (genau eine
       Neugenerierung je frischem Code).

   Eingänge: Konto (/api/account/anmelden, funktionen/anmeldung.mjs),
   Zugangscode Leitung und Betreiber (/api/anmelden, funktionen/daten.mjs ->
   betreiber-zweifaktor.mjs), Verwalterschlüssel (/einrichten/zweifaktor).

   Rot auf dem Stand vor WR-2 (163dc491): Keiner der Eingänge kannte die
   Aktion „wiederherstellung-neu" (400), und zweifaktor.mjs kannte keine
   Schlüsselepoche (wiederherstellungEpocheQuelle fehlt).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const LIMIT = 60000;
const WIRT = "127.0.0.1:3000";
const EIGEN = `http://${WIRT}`;
const PFEFFER = "pfeffer-wr-2-neugenerierung-0123456789";
const GUT = "Nordwind und Sonne 1846";
const ADMIN = "wr2-verwalter-ursprung-0123456789";
const CODE_LEITUNG = "WRZW-LEIT-UNG2";
const CODE_BETREIBER = "WRZW-BETR-EIB2";
const CODE_LEITUNG_BREMSE = "WRZW-BREM-SE02";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 15);

let wurzel, getStore, SCHUTZ, anmeldungHandler, KEKS, daten, einrichten, A, REG, PROV, ZF, KF;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = (s = 30) => uhr(jetzt + s * 1000);
const totp = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

let zaehler = 0;
/** @type {string} */ let verwalterGeheimnis = "";
const herkunft = () => `10.72.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wr2-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  process.env.CENTRIC_ADMIN = ADMIN;
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  delete process.env.CENTRIC_ZWEIFAKTOR_PFLICHT;
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  const schutz = await import("../server/lib/schutz.mjs");
  SCHUTZ = schutz;
  /* Bremsen sind hier nicht Gegenstand (eigene Prüfungen: konto-anmeldeweg, betreiber-zweifaktor). */
  for (const art of ["anmelden", "anmelden-konto", "einrichten", "zweifaktor"])
    schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.WEITERE["anmelden-konto"] = { ziel: { versuche: 100000, fenster: 300 },
    gesamt: { versuche: 100000, fenster: 300 } };
  schutz.WEITERE.einrichten = { gesamt: { versuche: 100000, fenster: 600 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  schutz.NOTGRENZEN["anmelden-konto"] = { versuche: 100000, fenster: 300, gesamt: 100000 };
  const modul = await import("../server/funktionen/anmeldung.mjs");
  anmeldungHandler = modul.default;
  KEKS = modul.COOKIE;
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
  A = await import("../server/lib/accounts.mjs");
  REG = await import("../server/lib/registrierung.mjs");
  PROV = await import("../server/lib/provisionierung.mjs");
  ZF = await import("../server/lib/zweifaktor.mjs");
  KF = await import("../server/lib/kontofaktor.mjs");
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  for (const [c, rolle] of [[CODE_LEITUNG, "leitung"], [CODE_BETREIBER, "betreiber"], [CODE_LEITUNG_BREMSE, "leitung"]])
    await kontoSchreiben(laden(), ablageSchluessel(c), { name: `WR2 ${rolle}`, bestand: "betreiber-probe",
      rolle, person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
}, LIMIT);

afterEach(() => { ZF.wiederherstellungEpocheQuelle(undefined); });

afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const arbeitAblage = () => getStore({ name: "centric-sitzungen", consistency: "strong" });

async function antwortLesen(a) {
  const text = await a.clone().text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { antwort: a, status: a.status, daten: d, text };
}

/** POST /api/account/anmelden (Konto). */
async function konto(rumpf, { keks = null } = {}) {
  const kopf = { "x-forwarded-for": herkunft(), host: WIRT, origin: EIGEN, "content-type": "application/json" };
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  return antwortLesen(await anmeldungHandler(new Request(`${EIGEN}/api/account/anmelden`,
    { method: "POST", headers: kopf, body: JSON.stringify(rumpf) })));
}

/** POST /api/anmelden (Zugangscode). */
async function code(rumpf) {
  return antwortLesen(await daten(new Request(`${EIGEN}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: EIGEN, "content-type": "application/json", "x-forwarded-for": herkunft() },
    body: JSON.stringify(rumpf) }), {}));
}

/** /einrichten… mit dem Verwalterschlüssel. */
async function verwaltung(pfad, { methode = "GET", rumpf, kopf = {} } = {}) {
  const h = { host: WIRT, origin: EIGEN, "x-forwarded-for": herkunft(), authorization: `Bearer ${ADMIN}`, ...kopf };
  if (methode !== "GET") h["content-type"] = "application/json";
  return antwortLesen(await einrichten(new Request(`${EIGEN}${pfad}`, { method: methode, headers: h,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {}));
}

/** Ein Konto mit Leitungsbetrieb und eingerichtetem Faktor (echter Weg, wie konto-anmeldeweg). */
async function kontoMitFaktor(was) {
  const s = laden();
  const email = `${was}-${++zaehler}@example.org`;
  const briefe = [];
  const start = await REG.registrierungStarten(s, { vorname: "Rina", nachname: "Schmitt",
    betriebsname: "Wachdienst Nordlicht", email,
    versand: async (an, betreff, text) => { briefe.push(String(text)); return { ok: true, trocken: true }; } });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const link = (/#token=([A-Za-z0-9_-]+)/.exec(briefe[briefe.length - 1]) || [])[1];
  const v = await REG.emailVerifizieren(s, { token: link });
  expect(v.ok).toBe(true);
  expect((await REG.passwortMitNachweisSetzen(s, { fortsetzung: v.fortsetzung, passwort: GUT })).ok).toBe(true);
  const e = await PROV.testbetriebFuerAccountAnlegen(s, arbeitAblage(), { accountId: v.accountId, ersteinrichtung: true });
  expect(e.ok, `Provisionierung: ${e.grund}`).toBe(true);
  const ersteinrichtungscode = e.ersteinrichtung.code;
  const b = await konto({ email, passwort: GUT, zweifaktorAktion: "beginnen", ersteinrichtungscode });
  expect(b.status, b.text).toBe(200);
  const f = await konto({ email, passwort: GUT, zweifaktorAktion: "bestaetigen", ersteinrichtungscode,
    zweifaktor: totp(b.daten.geheimnis) });
  expect(f.status, f.text).toBe(200);
  weiter();
  return { email, accountId: v.accountId, geheimnis: b.daten.geheimnis, codes: f.daten.wiederherstellung };
}

const faktorEintrag = (accountId) => laden().get(`zweifaktor:${KF.kontoFaktorId(accountId)}`, { type: "json" });

describe("WR-2 Konto: Neugenerierung nur nach vollständiger, frischer Authentifizierung", () => {
  /** @type {any} */ let K;

  it("ohne Passwort, mit falschem Passwort, nur mit Cookie, mit Wiederherstellungscode oder ohne Code: keine neuen Codes, alte gelten weiter", async () => {
    K = await kontoMitFaktor("neu-konto");
    const vorher = JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung);
    const falschesPw = await konto({ email: K.email, passwort: "falsch-falsch-falsch",
      zweifaktorAktion: "wiederherstellung-neu", zweifaktor: totp(K.geheimnis) });
    expect(falschesPw.status).toBe(401);
    expect(falschesPw.daten.wiederherstellung).toBeUndefined();
    const ohneCode = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu" });
    expect(ohneCode.status).toBe(400);
    expect(ohneCode.daten.wiederherstellung).toBeUndefined();
    /* Entscheidungen 8 und 9: Ein online eingegebener Wiederherstellungscode ändert nichts am Faktor. */
    const mitWh = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: K.codes[0] });
    expect(mitWh.status).toBe(401);
    expect(mitWh.daten.wiederherstellung).toBeUndefined();
    /* Ein Sitzungsmerkmal allein ist kein Ausweis. */
    const an = await konto({ email: K.email, passwort: GUT, zweifaktor: totp(K.geheimnis) });
    expect(an.status, an.text).toBe(200);
    weiter();
    const keks = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(an.antwort.headers.get("set-cookie"))[1];
    const nurKeks = await konto({ zweifaktorAktion: "wiederherstellung-neu", zweifaktor: totp(K.geheimnis) }, { keks });
    expect(nurKeks.status).toBe(401);
    expect(nurKeks.daten.wiederherstellung).toBeUndefined();
    /* Nichts geändert: derselbe Satz, und ein alter Code meldet weiterhin an. */
    expect(JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung)).toBe(vorher);
    const alt = await konto({ email: K.email, passwort: GUT, zweifaktor: K.codes[1] });
    expect(alt.status, alt.text).toBe(200);
  }, LIMIT);

  it("Passwort + frischer Code aus der App: zehn neue Codes, alle alten ungültig, neue gelten genau einmal", async () => {
    const n = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: totp(K.geheimnis) });
    expect(n.status, n.text).toBe(200);
    expect(n.antwort.headers.get("cache-control")).toBe("no-store");
    expect(n.daten.wiederherstellung).toHaveLength(10);
    expect(new Set(n.daten.wiederherstellung).size).toBe(10);
    for (const c of n.daten.wiederherstellung) expect(K.codes).not.toContain(c);
    const e = await faktorEintrag(K.accountId);
    expect(e.stand).toBe("aktiv");
    expect(e.wiederherstellung.generation).toBe(2);
    expect(e.wiederherstellung.verbrauchtZahl).toBe(0);
    weiter();
    /* Jeder alte Code — verbraucht oder nicht — ergibt keine Sitzung. */
    for (const c of K.codes) {
      const a = await konto({ email: K.email, passwort: GUT, zweifaktor: c });
      expect(a.status, `alter Code ${K.codes.indexOf(c)}`).toBe(401);
    }
    const neu = await konto({ email: K.email, passwort: GUT, zweifaktor: n.daten.wiederherstellung[0] });
    expect(neu.status, neu.text).toBe(200);
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: n.daten.wiederherstellung[0] })).status).toBe(401);
    K.codes = n.daten.wiederherstellung;
  }, LIMIT);

  it("derselbe Code aus der App zweimal und fünf gleichzeitige Neugenerierungen: genau eine gelingt", async () => {
    weiter();
    const t = totp(K.geheimnis);
    const eins = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: t });
    expect(eins.status, eins.text).toBe(200);
    const zwei = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: t });
    expect(zwei.status).toBe(401);
    expect(zwei.daten.wiederherstellung).toBeUndefined();
    weiter();
    const t2 = totp(K.geheimnis);
    const alle = await Promise.all(Array.from({ length: 5 }, () => konto({ email: K.email, passwort: GUT,
      zweifaktorAktion: "wiederherstellung-neu", zweifaktor: t2 })));
    const gut = alle.filter((a) => a.status === 200);
    expect(gut).toHaveLength(1);
    expect(alle.filter((a) => a.status === 401)).toHaveLength(4);
    /* Gültig ist genau der Satz der gelungenen Antwort. */
    weiter();
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: eins.daten.wiederherstellung[1] })).status).toBe(401);
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: gut[0].daten.wiederherstellung[1] })).status).toBe(200);
    K.codes = gut[0].daten.wiederherstellung;
  }, LIMIT);

  it("Gleichzeitig: Neugenerierung und Einlösen eines alten Codes — danach gilt kein alter Code", async () => {
    weiter();
    const alt = K.codes;
    const [n, a] = await Promise.all([
      konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: totp(K.geheimnis) }),
      konto({ email: K.email, passwort: GUT, zweifaktor: alt[2] }),
    ]);
    expect(n.status, n.text).toBe(200);
    expect([200, 401]).toContain(a.status);
    for (const c of alt) expect((await konto({ email: K.email, passwort: GUT, zweifaktor: c })).status).toBe(401);
    const e = await faktorEintrag(K.accountId);
    expect(e.wiederherstellung.verbrauchtZahl).toBe(0);
    K.codes = n.daten.wiederherstellung;
  }, LIMIT);

  it("Schreibfehler beim Ersetzen: kein neuer Code verlässt den Server, die alten gelten weiter (fail-closed)", async () => {
    weiter();
    const echt = laden();
    const kaputt = new Proxy(echt, { get(z, name) {
      if (name === "setJSON") return async (k, ...rest) => {
        if (String(k).startsWith("zweifaktor:")) throw new Error("Ablage streikt");
        return z.setJSON(k, ...rest);
      };
      const w = z[name]; return typeof w === "function" ? w.bind(z) : w;
    } });
    const vorher = JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung);
    await expect(KF.kontoWiederherstellungNeu(kaputt, K.accountId, totp(K.geheimnis))).rejects.toThrow();
    expect(JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung)).toBe(vorher);
    weiter();
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: K.codes[3] })).status).toBe(200);
  }, LIMIT);

  it("Mandantentrennung: Code aus der App und Wiederherstellungscodes eines Kontos erzeugen nichts für ein anderes", async () => {
    const L = await kontoMitFaktor("neu-fremd");
    const vorher = JSON.stringify((await faktorEintrag(L.accountId)).wiederherstellung);
    weiter();
    const fremd = await konto({ email: L.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: totp(K.geheimnis) });
    expect(fremd.status).toBe(401);
    expect(JSON.stringify((await faktorEintrag(L.accountId)).wiederherstellung)).toBe(vorher);
    expect((await konto({ email: L.email, passwort: GUT, zweifaktor: K.codes[4] })).status).toBe(401);
    /* Und die eigene Neugenerierung von L lässt K unberührt. */
    const kVorher = JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung);
    expect((await konto({ email: L.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: totp(L.geheimnis) })).status).toBe(200);
    expect(JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung)).toBe(kVorher);
  }, LIMIT);
});

describe("WR-2 Schlüsselepoche: zurückgespielte Ablage belebt keinen Code wieder", () => {
  it("Code B im zurückgespielten Stand unverbraucht, neue Epoche: B gilt nicht, TOTP schon; Neugenerierung bindet an die neue Epoche", async () => {
    let epoche = "a".repeat(32);
    ZF.wiederherstellungEpocheQuelle(async () => epoche);
    const K = await kontoMitFaktor("epoche");
    const e0 = await faktorEintrag(K.accountId);
    expect(e0.wiederherstellung.epoche).toBe(epoche);
    /* Sicherung des Faktors, dann Code B verbrauchen. */
    const sicherung = structuredClone(e0);
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: K.codes[1] })).status).toBe(200);
    /* Vollwiederherstellung: alter Stand zurück (B wieder „unverbraucht"), die Epoche außerhalb der Ablage ist neu. */
    await laden().setJSON(`zweifaktor:${KF.kontoFaktorId(K.accountId)}`, sicherung);
    epoche = "b".repeat(32);
    for (const c of [K.codes[1], K.codes[2]])
      expect((await konto({ email: K.email, passwort: GUT, zweifaktor: c })).status).toBe(401);
    /* Der Inhaber kommt mit Passwort und App herein und erzeugt neue Codes — gebunden an die neue Epoche. */
    weiter();
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: totp(K.geheimnis) })).status).toBe(200);
    weiter();
    const n = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: totp(K.geheimnis) });
    expect(n.status, n.text).toBe(200);
    expect((await faktorEintrag(K.accountId)).wiederherstellung.epoche).toBe(epoche);
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: n.daten.wiederherstellung[0] })).status).toBe(200);
  }, LIMIT);

  it("Codes ohne Epoche (vor der Bindung erzeugt) gelten unter Bindung nicht", async () => {
    ZF.wiederherstellungEpocheQuelle(null);
    const K = await kontoMitFaktor("ohne-epoche");
    expect((await faktorEintrag(K.accountId)).wiederherstellung.epoche).toBeUndefined();
    ZF.wiederherstellungEpocheQuelle(async () => "c".repeat(32));
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: K.codes[0] })).status).toBe(401);
  }, LIMIT);

  it("Epoche nicht feststellbar: kein Einlösen (503), keine Neugenerierung (503, alte unverändert), TOTP gilt", async () => {
    let kaputt = false;
    ZF.wiederherstellungEpocheQuelle(async () => { if (kaputt) throw new Error("Zustand nicht lesbar"); return "d".repeat(32); });
    const K = await kontoMitFaktor("epoche-weg");
    kaputt = true;
    const vorher = JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung);
    const a = await konto({ email: K.email, passwort: GUT, zweifaktor: K.codes[0] });
    expect(a.status).toBe(503);
    expect(a.antwort.headers.get("set-cookie") || "").not.toMatch(new RegExp(`${KEKS}=[A-Za-z0-9_-]{20,}`));
    const n = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: totp(K.geheimnis) });
    expect(n.status).toBe(503);
    expect(n.daten.wiederherstellung).toBeUndefined();
    expect(JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung)).toBe(vorher);
    weiter();
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: totp(K.geheimnis) })).status).toBe(200);
    kaputt = false;
    expect((await konto({ email: K.email, passwort: GUT, zweifaktor: K.codes[0] })).status).toBe(200);
  }, LIMIT);
});

describe("WR-2 Zugangscode (Leitung, Betreiber) über /api/anmelden", () => {
  for (const [was, zugangscode] of [["Leitung", CODE_LEITUNG], ["Betreiber", CODE_BETREIBER]]) {
    it(`${was}: nur mit Zugangscode und frischem Code aus der App; alte Codes danach ungültig`, async () => {
      weiter();
      const b = await code({ zugangscode, zweifaktorAktion: "beginnen" });
      expect(b.status, b.text).toBe(200);
      const f = await code({ zugangscode, zweifaktorAktion: "bestaetigen", zweifaktor: totp(b.daten.geheimnis) });
      expect(f.status, f.text).toBe(200);
      const alt = f.daten.wiederherstellung;
      weiter();
      /* Falscher Zugangscode, Wiederherstellungscode statt App-Code, kein Code: keine neuen Codes. */
      expect((await code({ zugangscode: "FALS-CHER-CODE", zweifaktorAktion: "wiederherstellung-neu",
        zweifaktor: totp(b.daten.geheimnis) })).status).toBe(401);
      const mitWh = await code({ zugangscode, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: alt[0] });
      expect(mitWh.status).toBe(401);
      expect(mitWh.daten.wiederherstellung).toBeUndefined();
      expect((await code({ zugangscode, zweifaktorAktion: "wiederherstellung-neu" })).status).toBe(401);
      /* Der Wiederherstellungscode oben wurde nicht verbraucht: er meldet noch an. */
      expect((await code({ zugangscode, zweifaktor: alt[0] })).status).toBe(200);
      const n = await code({ zugangscode, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: totp(b.daten.geheimnis) });
      expect(n.status, n.text).toBe(200);
      expect(n.daten.wiederherstellung).toHaveLength(10);
      expect(n.antwort.headers.get("cache-control")).toBe("no-store");
      for (const c of alt.slice(1)) expect((await code({ zugangscode, zweifaktor: c })).status).toBe(401);
      expect((await code({ zugangscode, zweifaktor: n.daten.wiederherstellung[0] })).status).toBe(200);
    }, LIMIT);
  }
});

describe("WR-2 Verwalterschlüssel über /einrichten/zweifaktor", () => {
  it("nur mit Schlüssel und frischem Code aus der App — kein Nachweis, kein Wiederherstellungscode; alte Codes danach ungültig", async () => {
    weiter();
    const b = await verwaltung("/einrichten/zweifaktor", { methode: "POST", rumpf: { aktion: "beginnen" } });
    expect(b.status, b.text).toBe(200);
    verwalterGeheimnis = b.daten.geheimnis;
    const f = await verwaltung("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "bestaetigen", zweifaktor: totp(b.daten.geheimnis) } });
    expect(f.status, f.text).toBe(200);
    const alt = f.daten.wiederherstellung;
    weiter();
    const nw = await verwaltung("/einrichten/zweifaktor", { methode: "POST", rumpf: { aktion: "nachweis" },
      kopf: { "x-centric-zweifaktor": totp(b.daten.geheimnis) } });
    expect(nw.status, nw.text).toBe(200);
    weiter();
    const mitNachweis = await verwaltung("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "wiederherstellung-neu" }, kopf: { "x-centric-zweifaktor-nachweis": nw.daten.nachweis } });
    expect(mitNachweis.status).toBe(401);
    expect(mitNachweis.daten.wiederherstellung).toBeUndefined();
    const mitWh = await verwaltung("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "wiederherstellung-neu", zweifaktor: alt[0] } });
    expect(mitWh.status).toBe(401);
    expect(mitWh.daten.wiederherstellung).toBeUndefined();
    const fremd = await antwortLesen(await einrichten(new Request(`${EIGEN}/einrichten/zweifaktor`, { method: "POST",
      headers: { host: WIRT, origin: EIGEN, "x-forwarded-for": herkunft(), authorization: "Bearer falsch-falsch",
        "content-type": "application/json" },
      body: JSON.stringify({ aktion: "wiederherstellung-neu", zweifaktor: totp(b.daten.geheimnis) }) }), {}));
    expect(fremd.status).toBe(401);
    expect(fremd.daten.wiederherstellung).toBeUndefined();
    const n = await verwaltung("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "wiederherstellung-neu", zweifaktor: totp(b.daten.geheimnis) } });
    expect(n.status, n.text).toBe(200);
    expect(n.daten.wiederherstellung).toHaveLength(10);
    weiter();
    for (const c of alt.slice(1, 4))
      expect((await verwaltung("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": c } })).status).toBe(401);
    expect((await verwaltung("/einrichten/verwalter",
      { kopf: { "x-centric-zweifaktor": n.daten.wiederherstellung[0] } })).status).toBe(200);
  }, LIMIT);
});

describe("WR-2 Review-Befund 4: schon verwendeter Code aus der App bei der Neugenerierung", () => {
  it("antwortet wie ein falscher Code (nicht wie falsches Passwort) und ist davon nicht unterscheidbar", async () => {
    const K = await kontoMitFaktor("wiederholt");
    weiter();
    const t = totp(K.geheimnis);
    const eins = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: t });
    expect(eins.status, eins.text).toBe(200);
    const nochmal = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu", zweifaktor: t });
    expect(nochmal.status).toBe(401);
    expect(nochmal.daten.fehler).toBe("zweifaktor");
    expect(nochmal.daten.fehler).not.toBe("zugangsdaten");
    expect(nochmal.daten.wiederherstellung).toBeUndefined();
    const falsch = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: String((Number(t) + 500000) % 1000000).padStart(6, "0") });
    expect(falsch.status).toBe(401);
    expect(nochmal.daten).toEqual(falsch.daten);
    expect(nochmal.text).toBe(falsch.text);
  }, LIMIT);
});

describe("WR-2 Review-Befund 3: falsche Codes bei der Neugenerierung zählen gegen die Bremse (alle Eingänge)", () => {
  /** @type {any} */ let grenzeVorher;
  const GRENZE = 3;
  const daneben = (t) => String((Number(t) + 500000) % 1000000).padStart(6, "0");
  const ohneZeit = (a) => ({ status: a.status, daten: a.daten });

  it("Konto: nach der Grenze 429 — auch mit richtigem Code; falsche Versuche sind gleich beantwortet; Codes unverändert", async () => {
    const K = await kontoMitFaktor("bremse-konto");
    grenzeVorher = SCHUTZ.GRENZEN.zweifaktor;
    SCHUTZ.GRENZEN.zweifaktor = { ...grenzeVorher, versuche: GRENZE };
    try {
      weiter();
      const vorher = JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung);
      const antworten = [];
      for (let i = 0; i < GRENZE; i += 1)
        antworten.push(await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
          zweifaktor: daneben(totp(K.geheimnis)) }));
      for (const a of antworten) expect(ohneZeit(a)).toEqual(ohneZeit(antworten[0]));
      expect(antworten[0].status).toBe(401);
      const gesperrt = await konto({ email: K.email, passwort: GUT, zweifaktorAktion: "wiederherstellung-neu",
        zweifaktor: totp(K.geheimnis) });
      expect(gesperrt.status).toBe(429);
      expect(gesperrt.daten.wiederherstellung).toBeUndefined();
      expect(JSON.stringify((await faktorEintrag(K.accountId)).wiederherstellung)).toBe(vorher);
    } finally { SCHUTZ.GRENZEN.zweifaktor = grenzeVorher; }
  }, LIMIT);

  it("Zugangscode: nach der Grenze 429 — auch mit richtigem Code; falsche Versuche gleich beantwortet", async () => {
    weiter();
    const b = await code({ zugangscode: CODE_LEITUNG_BREMSE, zweifaktorAktion: "beginnen" });
    expect(b.status, b.text).toBe(200);
    const f = await code({ zugangscode: CODE_LEITUNG_BREMSE, zweifaktorAktion: "bestaetigen",
      zweifaktor: totp(b.daten.geheimnis) });
    expect(f.status, f.text).toBe(200);
    grenzeVorher = SCHUTZ.GRENZEN.zweifaktor;
    SCHUTZ.GRENZEN.zweifaktor = { ...grenzeVorher, versuche: GRENZE };
    try {
      weiter();
      const antworten = [];
      for (let i = 0; i < GRENZE; i += 1)
        antworten.push(await code({ zugangscode: CODE_LEITUNG_BREMSE, zweifaktorAktion: "wiederherstellung-neu",
          zweifaktor: daneben(totp(b.daten.geheimnis)) }));
      for (const a of antworten) expect(ohneZeit(a)).toEqual(ohneZeit(antworten[0]));
      expect(antworten[0].status).toBe(401);
      const gesperrt = await code({ zugangscode: CODE_LEITUNG_BREMSE, zweifaktorAktion: "wiederherstellung-neu",
        zweifaktor: totp(b.daten.geheimnis) });
      expect(gesperrt.status).toBe(429);
      expect(gesperrt.daten.wiederherstellung).toBeUndefined();
      /* Der alte Satz gilt weiter (nicht ersetzt). */
    } finally { SCHUTZ.GRENZEN.zweifaktor = grenzeVorher; }
    weiter(16 * 60 * 60);
    expect((await code({ zugangscode: CODE_LEITUNG_BREMSE, zweifaktor: f.daten.wiederherstellung[0] })).status).toBe(200);
  }, LIMIT);

  it("/einrichten: nach der Grenze 429 — auch mit richtigem Code; falsche Versuche gleich beantwortet", async () => {
    weiter();
    expect(verwalterGeheimnis).toBeTruthy();
    grenzeVorher = SCHUTZ.GRENZEN.zweifaktor;
    SCHUTZ.GRENZEN.zweifaktor = { ...grenzeVorher, versuche: GRENZE };
    try {
      const antworten = [];
      for (let i = 0; i < GRENZE; i += 1)
        antworten.push(await verwaltung("/einrichten/zweifaktor", { methode: "POST",
          rumpf: { aktion: "wiederherstellung-neu", zweifaktor: daneben(totp(verwalterGeheimnis)) } }));
      for (const a of antworten) expect(ohneZeit(a)).toEqual(ohneZeit(antworten[0]));
      expect(antworten[0].status).toBe(401);
      const gesperrt = await verwaltung("/einrichten/zweifaktor", { methode: "POST",
        rumpf: { aktion: "wiederherstellung-neu", zweifaktor: totp(verwalterGeheimnis) } });
      expect(gesperrt.status).toBe(429);
      expect(gesperrt.daten.wiederherstellung).toBeUndefined();
    } finally { SCHUTZ.GRENZEN.zweifaktor = grenzeVorher; }
  }, LIMIT);
});
