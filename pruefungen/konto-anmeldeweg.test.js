/* ==========================================================================
   OPT-1-F: REGULÄRER ANMELDEWEG FÜR LEITUNGSKONTEN NACH DER ERSTEINRICHTUNG

   Die ganze Kette, über die echten Handler (funktionen/anmeldung.mjs,
   funktionen/daten.mjs) und den echten Selbstbedienungsweg (Registrierung,
   Bestätigungslink, erstes Passwort mit Einrichtungsnachweis, Provisionierung
   eines Testbetriebs mit Konto-Mitgliedschaft `leitung`), unter
   CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1:

     1. Einrichtung        Registrierung → Bestätigung → Passwort → Betrieb
     2. Ohne Faktor        Passwort allein: Identität, aber kein Betrieb als Leitung
     3. Faktor einrichten  Adresse + Passwort als Ausweis, beginnen/bestätigen;
                           alle bisherigen Sitzungen enden
     4. Anmeldung          Passwort + Code aus der App → Sitzung mit Faktor →
                           Betrieb als Leitung → Arbeitssitzung gilt bei Anfragen
     5. Falscher Faktor, fehlender Faktor, wiederholter Code: keine Sitzung
     6. Fehlversuchs-Sperre je Faktor, gezählt nur bei richtigem Passwort
     7. Verbrauchte Einrichtungscodes (Bestätigungslink, Einrichtungsnachweis,
        erster Code der Faktor-Einrichtung) wirken nie als Anmeldung
     8. Fail-closed: Flag nicht fälschbar, ohne Pfeffer keine Sitzung,
        kein Klartext von Geheimnis, Codes oder Passwort in der Ablage
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const LIMIT = 60000;
const WIRT = "127.0.0.1:3000";
const EIGEN = `http://${WIRT}`;
const PFEFFER = "pfeffer-opt-1-f-0123456789abcdef";
const GUT = "Nordwind und Sonne 1846";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 15);
const P_AN = "/api/account/anmelden";
const P_SITZ = "/api/account/sitzung";
const P_WAHL = "/api/account/betrieb";

let wurzel, getStore, handler, daten, KEKS, A, REG, PROV, AS, BA, KF;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = (s = 30) => uhr(jetzt + s * 1000);
const code = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Alles Klartext, was nie in der Ablage stehen darf. */
const geheim = new Set([GUT]);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-opt1f-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  const modul = await import("../server/funktionen/anmeldung.mjs");
  handler = modul.default;
  KEKS = modul.COOKIE;
  daten = (await import("../server/funktionen/daten.mjs")).default;
  A = await import("../server/lib/accounts.mjs");
  REG = await import("../server/lib/registrierung.mjs");
  PROV = await import("../server/lib/provisionierung.mjs");
  AS = await import("../server/lib/arbeitssitzung.mjs");
  BA = await import("../server/lib/betriebsauswahl.mjs");
  KF = await import("../server/lib/kontofaktor.mjs");
}, LIMIT);

afterAll(async () => {
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const kontoAblage = () => getStore({ name: "centric-accountsitzungen", consistency: "strong" });
const arbeitAblage = () => getStore({ name: "centric-sitzungen", consistency: "strong" });

let zaehler = 0;
const herkunft = () => `10.61.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;

async function anfrage({ pfad = P_AN, methode = "POST", rumpf = undefined, keks = null, von = null } = {}) {
  const kopf = { "x-forwarded-for": von || herkunft(), host: WIRT, origin: EIGEN };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  const req = new Request(`${EIGEN}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf ?? {}) }) });
  const antwort = await handler(req);
  const text = await antwort.clone().text();
  let d = null; try { d = JSON.parse(text); } catch { /* leer */ }
  return { antwort, status: antwort.status, daten: d, text };
}

const keksWert = (kopf) => {
  const m = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(String(kopf || ""));
  return m ? m[1] : null;
};

/** GET /api/bestand über den echten Daten-Handler, mit dem Merkmal der Arbeitssitzung. */
async function bestandHolen(token) {
  const a = await daten(new Request(`${EIGEN}/api/bestand`, { method: "GET",
    headers: { host: WIRT, origin: EIGEN, authorization: `Bearer ${token}`, "x-forwarded-for": herkunft() } }), {});
  return a.status;
}

/** Der echte Selbstbedienungsweg bis zum Betrieb. Gibt die verbrauchten Einrichtungscodes mit zurück. */
async function eingerichtet(was) {
  const s = laden();
  const email = `${was}-${++zaehler}@example.org`;
  const briefe = [];
  const start = await REG.registrierungStarten(s, { vorname: "Rina", nachname: "Schmitt",
    betriebsname: "Wachdienst Nordlicht", email,
    versand: async (an, betreff, text) => { briefe.push(String(text)); return { ok: true, trocken: true }; } });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const link = (/#token=([A-Za-z0-9_-]+)/.exec(briefe[briefe.length - 1]) || [])[1];
  expect(link).toBeTruthy();
  const v = await REG.emailVerifizieren(s, { token: link });
  expect(v.ok, `Bestätigung: ${v.grund}`).toBe(true);
  expect(v.fortsetzung, "Einrichtungsnachweis").toBeTruthy();
  const p = await REG.passwortMitNachweisSetzen(s, { fortsetzung: v.fortsetzung, passwort: GUT });
  expect(p.ok, `Passwort: ${p.grund}`).toBe(true);
  /* OPT-1-F, Option A: Der Betreiberweg legt den Testbetrieb MIT Ersteinrichtungscode an (werkzeug/testbetrieb-anlegen.mjs,
     --ersteinrichtung); ohne ihn richtet das Konto keinen Faktor ein. */
  const e = await PROV.testbetriebFuerAccountAnlegen(s, arbeitAblage(), { accountId: v.accountId, ersteinrichtung: true });
  expect(e.ok, `Provisionierung: ${e.grund}`).toBe(true);
  expect(e.ersteinrichtung && typeof e.ersteinrichtung.code).toBe("string");
  const m = await A.mitgliedschaftLesen(s, v.accountId, e.raum);
  expect(m.rolle).toBe("leitung");
  geheim.add(link); geheim.add(v.fortsetzung); geheim.add(e.ersteinrichtung.code);
  return { email, raum: e.raum, accountId: v.accountId, link, fortsetzung: v.fortsetzung, code: e.ersteinrichtung.code };
}

/** Zweiten Faktor am Konto einrichten; gibt Geheimnis und Wiederherstellungscodes zurück. */
async function faktorEinrichten(email, ersteinrichtungscode) {
  const b = await anfrage({ rumpf: { email, passwort: GUT, zweifaktorAktion: "beginnen", ersteinrichtungscode } });
  expect(b.status, b.text).toBe(200);
  expect(b.daten.geheimnis).toMatch(/^[A-Z2-7]+$/);
  const f = await anfrage({ rumpf: { email, passwort: GUT, zweifaktorAktion: "bestaetigen", ersteinrichtungscode,
    zweifaktor: code(b.daten.geheimnis) } });
  expect(f.status, f.text).toBe(200);
  geheim.add(b.daten.geheimnis);
  for (const w of f.daten.wiederherstellung) geheim.add(w);
  weiter();
  return { geheimnis: b.daten.geheimnis, wiederherstellung: f.daten.wiederherstellung, antwort: f };
}

/** Anmelden mit Passwort und Faktor; gibt das Cookie zurück. */
async function mitFaktorAngemeldet(email, geheimnis) {
  const an = await anfrage({ rumpf: { email, passwort: GUT, zweifaktor: code(geheimnis) } });
  expect(an.status, an.text).toBe(200);
  weiter();
  const keks = keksWert(an.antwort.headers.get("set-cookie"));
  expect(keks).toBeTruthy();
  return keks;
}

async function arbeitssitzungenZahl() {
  const { blobs } = await arbeitAblage().list({ prefix: "t:" });
  return blobs.length;
}

describe("OPT-1-F: die ganze Kette unter Pflicht", () => {
  /* Zwischen den Schritten elf Minuten: Die Anmeldebremse (je Konto, gleitendes Fünf-Minuten-Fenster) soll keinen
     Schritt mit den Fehlversuchen des vorigen belasten. Gemessen wird die Kette, nicht die Bremse der Anmeldung. */
  beforeEach(() => { weiter(11 * 60); });
  /** @type {any} */ let K;
  /** @type {any} */ let F;
  /** @type {string|null} */ let keksOhneFaktor = null;

  it("1+2. Einrichtung über den Selbstbedienungsweg; Passwort allein öffnet den Betrieb nicht als Leitung", async () => {
    K = await eingerichtet("kette");
    const an = await anfrage({ rumpf: { email: K.email, passwort: GUT } });
    expect(an.status, an.text).toBe(200);
    expect(an.daten).toEqual({ ok: true, angemeldet: true });
    keksOhneFaktor = keksWert(an.antwort.headers.get("set-cookie"));
    const roh = await kontoAblage().get(`as:${hash(keksOhneFaktor)}`, { type: "json" });
    expect(roh.zweifaktor).toBeUndefined();
    const vorher = await arbeitssitzungenZahl();
    const w = await anfrage({ pfad: P_WAHL, rumpf: { raum: K.raum }, keks: keksOhneFaktor });
    expect(w.status).toBe(403);
    expect(w.daten.fehler).toBe("zweifaktor-pflicht");
    expect(w.daten.token).toBeUndefined();
    expect(await arbeitssitzungenZahl()).toBe(vorher);
  }, LIMIT);

  it("3. Faktor einrichten: nur mit richtigem Passwort, nicht überschreibbar, beendet alle Sitzungen", async () => {
    /* Falsches Passwort: dieselbe Absage wie bei der Anmeldung, kein Geheimnis. */
    const falsch = await anfrage({ rumpf: { email: K.email, passwort: "falsch-falsch-falsch",
      zweifaktorAktion: "beginnen" } });
    expect(falsch.status).toBe(401);
    expect(falsch.daten.fehler).toBe("zugangsdaten");
    expect(falsch.text).not.toContain("geheimnis");
    /* Nur das Cookie (ohne Passwort) reicht nicht. */
    const nurKeks = await anfrage({ rumpf: { zweifaktorAktion: "beginnen" }, keks: keksOhneFaktor });
    expect(nurKeks.status).toBe(401);
    expect(nurKeks.text).not.toContain("geheimnis");
    /* Unbekannte Aktion (auch kein Abschalten über das Netz). */
    const ab = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "abschalten" } });
    expect(ab.status).toBe(400);

    const st0 = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "stand" } });
    expect(st0.status).toBe(200);
    expect(st0.daten).toMatchObject({ ok: true, aktiv: false, ausstehend: false });

    /* OPT-1-F, Option A (Befund 1): Adresse und Passwort allein richten keinen Faktor ein — ohne, mit falschem oder
       mit fremdem Ersteinrichtungscode: 403, kein Geheimnis, keine laufende Einrichtung. */
    const F2 = await eingerichtet("fremd");
    for (const [was, ersteinrichtungscode] of [["ohne Code", undefined], ["falscher Code", "ACDE-FGHJ-KLMN-PQRT"],
      ["fremder Code", F2.code], ["Code als Zahl", 1234]]) {
      for (const aktion of ["beginnen", "bestaetigen"]) {
        const r = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: aktion, ersteinrichtungscode,
          zweifaktor: "123456" } });
        const soll = aktion === "beginnen" ? 403 : 409;   // bestaetigen ohne begonnene Einrichtung: 409 wie bisher
        expect(r.status, `${was} ${aktion}: ${r.text}`).toBe(soll);
        if (aktion === "beginnen") expect(r.daten.fehler, was).toBe("ersteinrichtung");
        expect(r.text, was).not.toContain("geheimnis\":");
        expect(r.daten.wiederherstellung, was).toBeUndefined();
      }
      expect((await KF.kontoFaktorStand(laden(), K.accountId)).ausstehend, was).toBe(false);
    }
    /* Der fremde Code gilt nur für sein eigenes Konto — er ist dadurch nicht verbraucht. */
    const E = await import("../server/lib/zugangscode-ersteinrichtung.mjs");
    expect((await E.ersteinrichtungFuerKonto(laden(), { code: F2.code, accountId: F2.accountId })).ok).toBe(true);
    expect((await E.ersteinrichtungFuerKonto(laden(), { code: F2.code, accountId: K.accountId })).ok).toBe(false);

    const b = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "beginnen",
      ersteinrichtungscode: K.code } });
    expect(b.status, b.text).toBe(200);
    expect(b.daten.otpauth).toMatch(/^otpauth:\/\/totp\//);
    expect(b.antwort.headers.get("cache-control")).toBe("no-store");
    expect(b.antwort.headers.get("set-cookie")).toBe(null);
    /* Eine laufende Einrichtung wird nicht überschrieben. */
    const zweit = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "beginnen",
      ersteinrichtungscode: K.code } });
    expect(zweit.status).toBe(409);
    expect(zweit.text).not.toContain("geheimnis\":");
    /* Falscher erster Code: nicht aktiviert, Sitzungen unberührt. */
    /* Bestätigen ohne Ersteinrichtungscode, aber mit richtigem Wert aus der App: abgewiesen, nicht aktiviert. */
    const ohneCode = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "bestaetigen",
      zweifaktor: code(b.daten.geheimnis) } });
    expect(ohneCode.status, ohneCode.text).toBe(403);
    expect(ohneCode.daten.wiederherstellung).toBeUndefined();
    expect((await KF.kontoFaktorStand(laden(), K.accountId)).aktiv).toBe(false);
    const fc = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "bestaetigen",
      ersteinrichtungscode: K.code, zweifaktor: code(b.daten.geheimnis, 5) } });
    expect(fc.status).toBe(401);
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: keksOhneFaktor })).status).toBe(200);
    expect((await KF.kontoFaktorStand(laden(), K.accountId)).aktiv).toBe(false);

    const ersterCode = code(b.daten.geheimnis);
    const f = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "bestaetigen",
      ersteinrichtungscode: K.code, zweifaktor: ersterCode } });
    expect(f.status, f.text).toBe(200);
    expect(f.daten.aktiv).toBe(true);
    expect(f.daten.wiederherstellung).toHaveLength(10);
    /* Das Cookie dieses Geräts wird gelöscht, und alle Sitzungen des Kontos sind beendet. */
    expect(keksWert(f.antwort.headers.get("set-cookie"))).toBe("");
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: keksOhneFaktor })).status).toBe(401);
    expect(await kontoAblage().get(`as:${hash(keksOhneFaktor)}`, { type: "json" })).toBe(null);
    F = { geheimnis: b.daten.geheimnis, wiederherstellung: f.daten.wiederherstellung, ersterCode };
    geheim.add(F.geheimnis);
    for (const w of F.wiederherstellung) geheim.add(w);

    /* Der erste Code der Einrichtung ist verbraucht: keine Anmeldung damit (derselbe TOTP-Schritt). */
    const mitErstem = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktor: ersterCode } });
    expect(mitErstem.status).toBe(401);
    expect(mitErstem.daten.zweifaktor).toBe("falsch");
    expect(keksWert(mitErstem.antwort.headers.get("set-cookie")) || "").toBe("");
    weiter();

    /* Danach: kein zweites Einrichten, kein Bestätigen. */
    const nochmal = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "beginnen",
      ersteinrichtungscode: K.code } });
    expect(nochmal.status).toBe(409);
    expect(nochmal.text).not.toContain("geheimnis\":");
    const nochmalB = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "bestaetigen",
      ersteinrichtungscode: K.code, zweifaktor: code(F.geheimnis) } });
    expect(nochmalB.status).toBe(409);
    /* Der Ersteinrichtungscode ist mit der Aktivierung verbraucht. */
    expect((await E.ersteinrichtungFuerKonto(laden(), { code: K.code, accountId: K.accountId })).ok).toBe(false);
    weiter();
  }, LIMIT);

  it("5. Passwort allein, falscher Faktor, falsches Passwort mit richtigem Faktor: keine Sitzung", async () => {
    const allein = await anfrage({ rumpf: { email: K.email, passwort: GUT } });
    expect(allein.status).toBe(401);
    expect(allein.daten.zweifaktor).toBe("erforderlich");
    expect(keksWert(allein.antwort.headers.get("set-cookie")) || "").toBe("");

    const falsch = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktor: "000000" } });
    expect(falsch.status).toBe(401);
    expect(falsch.daten.zweifaktor).toBe("falsch");
    expect(keksWert(falsch.antwort.headers.get("set-cookie")) || "").toBe("");

    /* Falsches Passwort mit richtigem Code: die gewöhnliche Absage — kein Hinweis auf den Faktor. */
    const pw = await anfrage({ rumpf: { email: K.email, passwort: "Nordwind und Sonne 1847",
      zweifaktor: code(F.geheimnis) } });
    expect(pw.status).toBe(401);
    expect(pw.daten.fehler).toBe("zugangsdaten");
    expect(pw.daten.zweifaktor).toBeUndefined();
    expect(keksWert(pw.antwort.headers.get("set-cookie")) || "").toBe("");
    weiter();
  }, LIMIT);

  it("4. Passwort + Faktor: Sitzung mit Faktor, Betrieb als Leitung, Arbeitssitzung gilt bei jeder Anfrage", async () => {
    const vorherA = await arbeitssitzungenZahl();
    const c = code(F.geheimnis);
    const an = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktor: c } });
    expect(an.status, an.text).toBe(200);
    expect(an.daten).toEqual({ ok: true, angemeldet: true });
    const keks = keksWert(an.antwort.headers.get("set-cookie"));
    expect(keks).toBeTruthy();
    const roh = await kontoAblage().get(`as:${hash(keks)}`, { type: "json" });
    expect(roh.zweifaktor).toBe(true);

    /* Derselbe Code ein zweites Mal: abgewiesen (einmal je Schritt). */
    const wieder = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktor: c } });
    expect(wieder.status).toBe(401);
    expect(wieder.daten.zweifaktor).toBe("falsch");

    const w = await anfrage({ pfad: P_WAHL, rumpf: { raum: K.raum }, keks });
    expect(w.status, w.text).toBe(200);
    expect(w.daten.rolle).toBe("leitung");
    expect(w.daten.token).toBeTruthy();
    expect(await arbeitssitzungenZahl()).toBe(vorherA + 1);
    const arbeit = await arbeitAblage().get(`t:${hash(w.daten.token)}`, { type: "json" });
    expect(arbeit.zweifaktor).toBe(true);
    expect(arbeit.rolle).toBe("leitung");

    /* Die Arbeitssitzung hält die Pflichtprüfung jeder Anfrage. */
    const req = /** @type {any} */ ({ headers: { get: (n) => (n === "authorization" ? `Bearer ${w.daten.token}` : null) } });
    const l = await AS.arbeitssitzungLesen(req, { store: laden() });
    expect(l.sitzung, JSON.stringify(l)).toBeTruthy();
    expect(await bestandHolen(w.daten.token)).toBe(200);
    weiter();
  }, LIMIT);

  it("4b. Wiederherstellungscode als zweiter Faktor gilt genau einmal", async () => {
    const wh = F.wiederherstellung[0];
    const a = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktor: wh } });
    expect(a.status, a.text).toBe(200);
    const b = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktor: wh } });
    expect(b.status).toBe(401);
    weiter();
  }, LIMIT);

  it("7. Verbrauchte Einrichtungscodes wirken nie als Anmeldung", async () => {
    const s = laden();
    /* Bestätigungslink und Einrichtungsnachweis sind verbraucht … */
    expect((await REG.emailVerifizieren(s, { token: K.link })).ok).toBe(false);
    expect((await REG.passwortMitNachweisSetzen(s, { fortsetzung: K.fortsetzung, passwort: "Ganz anderes Passwort 77" })).ok)
      .toBe(false);
    /* … und weder als Passwort noch als zweiter Faktor noch mit dem Faktor zusammen eine Anmeldung. */
    for (const rumpf of [
      { email: K.email, passwort: K.link },
      { email: K.email, passwort: K.fortsetzung },
      { email: K.email, passwort: K.fortsetzung, zweifaktor: code(F.geheimnis) },
      { email: K.email, passwort: GUT, zweifaktor: K.fortsetzung },
      { email: K.email, passwort: GUT, zweifaktor: K.link },
      { email: K.email, passwort: GUT, zweifaktor: F.ersterCode },
      { email: K.email, fortsetzung: K.fortsetzung },
      { email: K.email, token: K.link, zweifaktor: code(F.geheimnis) },
      { email: K.email, passwort: K.code },
      { email: K.email, passwort: GUT, zweifaktor: K.code },
      { email: K.email, ersteinrichtungscode: K.code },
      { email: K.email, ersteinrichtungscode: K.code, zweifaktor: code(F.geheimnis) },
    ]) {
      const e = await anfrage({ rumpf });
      expect(e.status, JSON.stringify(Object.keys(rumpf))).toBe(401);
      expect(keksWert(e.antwort.headers.get("set-cookie")) || "").toBe("");
      expect(e.daten.token).toBeUndefined();
    }
    /* Auch über den Zugangscode-Weg nicht: dort kennt ihn niemand. */
    const z = await daten(new Request(`${EIGEN}/api/anmelden`, { method: "POST",
      headers: { host: WIRT, origin: EIGEN, "content-type": "application/json", "x-forwarded-for": herkunft() },
      body: JSON.stringify({ zugangscode: K.fortsetzung }) }), {});
    expect(z.status).toBe(401);
    /* Der Ersteinrichtungscode ist auf dem Zugangscode-Weg wie unbekannt — allein und mit Faktor. */
    for (const rumpf of [{ zugangscode: K.code }, { zugangscode: K.code, zweifaktor: code(F.geheimnis) }]) {
      const zc = await daten(new Request(`${EIGEN}/api/anmelden`, { method: "POST",
        headers: { host: WIRT, origin: EIGEN, "content-type": "application/json", "x-forwarded-for": herkunft() },
        body: JSON.stringify(rumpf) }), {});
      expect(zc.status).toBe(401);
      expect(JSON.parse(await zc.text()).token).toBeUndefined();
    }
    weiter();
  }, LIMIT);

  it("6. Fehlversuchs-Sperre: fünf falsche Codes mit richtigem Passwort sperren den Faktor, auch über Herkünfte", async () => {
    const S = await eingerichtet("sperre");
    const f = await faktorEinrichten(S.email, S.code);
    for (let i = 0; i < 5; i++) {
      const e = await anfrage({ rumpf: { email: S.email, passwort: GUT, zweifaktor: String(100000 + i) } });
      expect(e.status, `Versuch ${i + 1}`).toBe(401);
    }
    /* Jetzt gesperrt — auch mit dem richtigen Code, auch von einer neuen Herkunft. */
    const gesperrt = await anfrage({ rumpf: { email: S.email, passwort: GUT, zweifaktor: code(f.geheimnis) } });
    expect(gesperrt.status).toBe(429);
    expect(keksWert(gesperrt.antwort.headers.get("set-cookie")) || "").toBe("");
    /* Nach Ablauf der Sperre (15 Minuten) wieder möglich. */
    weiter(16 * 60);
    const danach = await anfrage({ rumpf: { email: S.email, passwort: GUT, zweifaktor: code(f.geheimnis) } });
    expect(danach.status, danach.text).toBe(200);
    weiter();
  }, LIMIT);

  it("6b. Falsche Passwörter mit Codes sperren den Faktor nicht (wer nur die Adresse kennt, sperrt niemanden aus)", async () => {
    const S = await eingerichtet("sperre-pw");
    const f = await faktorEinrichten(S.email, S.code);
    for (let i = 0; i < 6; i++) {
      const e = await anfrage({ rumpf: { email: S.email, passwort: `Falsches Passwort ${i}xx`, zweifaktor: "123456" } });
      expect(e.status).toBe(401);
      expect(e.daten.fehler).toBe("zugangsdaten");
    }
    const richtig = await anfrage({ rumpf: { email: S.email, passwort: GUT, zweifaktor: code(f.geheimnis) } });
    expect(richtig.status, richtig.text).toBe(200);
    weiter();
  }, LIMIT);

  it("8a. Das Faktor-Merkmal der Sitzung ist nicht fälschbar: nur der Datensatz zählt", async () => {
    /* Eine Kontositzung ohne Faktor (angelegt wie vor der Einrichtung) — auch wenn der Aufrufer
       `zweifaktor: true` mitgibt und der Faktor des Kontos aktiv ist. */
    const ACS = await import("../server/lib/accountsitzungen.mjs");
    const konto = await A.accountLesenPerId(laden(), K.accountId);
    const s = await ACS.accountSitzungAnlegen({ accountId: K.accountId, epoche: Number(konto.epoche) });
    expect(s.ok).toBe(true);
    const id = ACS.accountSitzungsId(s.token);
    const e = await BA.betriebWaehlen(laden(), { accountId: K.accountId, raum: K.raum,
      kontoSitzung: /** @type {any} */ ({ id, bis: s.gueltigBis, zweifaktor: true }) });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.grund).toBe("zweifaktor-pflicht");
    /* Über HTTP dasselbe. */
    const w = await anfrage({ pfad: P_WAHL, rumpf: { raum: K.raum, zweifaktor: true }, keks: s.token });
    expect(w.status).toBe(403);
    expect(w.daten.fehler).toBe("zweifaktor-pflicht");
    expect(w.daten.hinweis).toContain("Zugangscode");
    expect(w.daten.hinweis).toContain("Passwort");
  }, LIMIT);

  it("8b. Sitzung mit Faktor, aber Faktor nicht mehr auffindbar: kein Betrieb als Leitung", async () => {
    const S = await eingerichtet("verloren");
    const f = await faktorEinrichten(S.email, S.code);
    const keks = await mitFaktorAngemeldet(S.email, f.geheimnis);
    /* Der Faktor verschwindet aus der Ablage (Datenfehler): kein Ja. */
    await laden().delete(`zweifaktor:${KF.kontoFaktorId(S.accountId)}`);
    const w = await anfrage({ pfad: P_WAHL, rumpf: { raum: S.raum }, keks });
    expect(w.status).toBe(403);
    expect(w.daten.fehler).toBe("zweifaktor-pflicht");
  }, LIMIT);

  it("8c. Ohne Pfeffer: kein Einrichten, keine Anmeldung mit eingerichtetem Faktor", async () => {
    const S = await eingerichtet("pfeffer");
    const f = await faktorEinrichten(S.email, S.code);
    const T = await eingerichtet("pfeffer-neu");
    delete process.env.CENTRIC_PFEFFER;
    try {
      const an = await anfrage({ rumpf: { email: S.email, passwort: GUT, zweifaktor: code(f.geheimnis) } });
      expect([401, 503]).toContain(an.status);
      expect(keksWert(an.antwort.headers.get("set-cookie")) || "").toBe("");
      const b = await anfrage({ rumpf: { email: T.email, passwort: GUT, zweifaktorAktion: "beginnen",
        ersteinrichtungscode: T.code } });
      expect([401, 503]).toContain(b.status);
      expect(b.text).not.toContain("geheimnis\":");
    } finally {
      process.env.CENTRIC_PFEFFER = PFEFFER;
    }
    weiter();
  }, LIMIT);

  it("8d. Ohne Pflicht: ein eingerichteter Faktor gilt trotzdem bei jeder Anmeldung", async () => {
    delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
    try {
      const allein = await anfrage({ rumpf: { email: K.email, passwort: GUT } });
      expect(allein.status).toBe(401);
      expect(allein.daten.zweifaktor).toBe("erforderlich");
    } finally {
      process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
    }
  }, LIMIT);

  it("8e. Kein Klartext von Passwort, Geheimnis, Wiederherstellungs- oder Einrichtungscodes in der Ablage", async () => {
    /** @param {string} dir */
    async function alle(dir) {
      /** @type {string[]} */ const aus = [];
      for (const n of await readdir(dir)) {
        const p = path.join(dir, n);
        if ((await stat(p)).isDirectory()) aus.push(...await alle(p));
        else aus.push(p);
      }
      return aus;
    }
    const dateien = await alle(wurzel);
    expect(dateien.length).toBeGreaterThan(0);
    for (const d of dateien) {
      const text = await readFile(d, "utf8").catch(() => "");
      for (const g of geheim) expect(text.includes(g), `${path.relative(wurzel, d)} enthält Klartext`).toBe(false);
    }
  }, LIMIT);
});

/* ==========================================================================
   Sicherheitsreview OPT-1-F, Befunde 2 und 3
     2. Eine laufende Einrichtung wird unter derselben Sperre geprüft wie
        geschrieben: zwei gleichzeitige „beginnen" ersetzen einander nicht.
     3. Aktivierung fail-closed: Scheitert das zweite Abmelden, wird nicht
        aktiviert. Die Aktivierung erhöht die Epoche; eine vorher angelegte
        Sitzung gilt danach nicht mehr.
   ========================================================================== */
describe("OPT-1-F Review: Befunde 2 und 3", () => {
  beforeEach(() => { weiter(11 * 60); });

  it("2. Zwei gleichzeitige beginnen-Aufrufe: genau einer gewinnt, die erste Einrichtung bleibt unangetastet", async () => {
    const K2 = await eingerichtet("parallel");
    const s = laden();
    const [x, y] = await Promise.all([KF.kontoFaktorBeginnen(s, K2.accountId), KF.kontoFaktorBeginnen(s, K2.accountId)]);
    const gewinner = [x, y].filter((r) => r.ok);
    const verlierer = [x, y].filter((r) => !r.ok);
    expect(gewinner.length).toBe(1);
    expect(verlierer.length).toBe(1);
    expect(verlierer[0].grund).toBe("ausstehend");
    expect("geheimnis" in verlierer[0]).toBe(false);
    /* Abgelegt ist die Einrichtung des Gewinners: sein Code passt. */
    expect((await KF.kontoFaktorVorpruefen(s, K2.accountId, code(gewinner[0].geheimnis))).ok).toBe(true);
    /* Ein späterer Aufruf überschreibt sie ebenfalls nicht. */
    expect(await KF.kontoFaktorBeginnen(s, K2.accountId)).toEqual({ ok: false, grund: "ausstehend" });
    expect((await KF.kontoFaktorVorpruefen(s, K2.accountId, code(gewinner[0].geheimnis))).ok).toBe(true);
  }, LIMIT);

  it("3a. Scheitert das zweite Abmelden: Faktor bleibt aktiv, Absage ohne Wiederherstellungscodes, nur neue Anmeldung mit Faktor", async () => {
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const K3 = await eingerichtet("abmelden-kaputt");
    const s = laden();
    const b = await AN.kontoFaktorAktion(s, { email: K3.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K3.code });
    expect(b.ok, JSON.stringify(b)).toBe(true);
    /* Die Sitzungsablage versagt, sobald der Faktor aktiv ist — also genau beim zweiten Abmelden. */
    const echt = kontoAblage();
    let versagt = 0;
    const ablage = new Proxy(echt, { get(t, p) {
      if (p === "list") return async (...a) => {
        if ((await KF.kontoFaktorStand(s, K3.accountId)).aktiv) { versagt++; throw new Error("ablage kaputt"); }
        return t.list(...a);
      };
      const v = t[p];
      return typeof v === "function" ? v.bind(t) : v;
    } });
    const f = await AN.kontoFaktorAktion(s, { email: K3.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K3.code, zweifaktor: code(b.daten.geheimnis), sitzungsAblage: ablage });
    expect(versagt).toBeGreaterThan(0);
    expect(f.ok).toBe(false);
    expect(f.grund).toBe("sitzungen");
    expect(JSON.stringify(f)).not.toContain("wiederherstellung");
    /* Befund 3, Zusatzprüfung (Betreiberentscheidung 2026-11-10): Der Faktor bleibt AKTIV — ein Zurücknehmen machte
       ältere, schwächer geschützte Sitzungen wieder gültig. Bis 7f7718db wurde hier zurückgenommen (aktiv false). */
    expect((await KF.kontoFaktorStand(s, K3.accountId)).aktiv).toBe(true);
    /* Der Ersteinrichtungscode ist mit der Aktivierung verbraucht (kein zweites Einrichten damit). */
    const E = await import("../server/lib/zugangscode-ersteinrichtung.mjs");
    expect((await E.ersteinrichtungFuerKonto(s, { code: K3.code, accountId: K3.accountId })).ok).toBe(false);
    /* Der Weg hinein ist eine neue, sichere Anmeldung: Passwort allein nicht, Passwort und Code aus der App ja. */
    weiter();
    const allein = await AN.anmelden(s, { email: K3.email, passwort: GUT });
    expect(allein.ok).toBe(false);
    expect(/** @type {any} */ (allein).grund).toBe("zweifaktor-erforderlich");
    const neu = await AN.anmelden(s, { email: K3.email, passwort: GUT, zweifaktor: code(b.daten.geheimnis) });
    expect(neu.ok, JSON.stringify(neu)).toBe(true);
    expect(/** @type {any} */ (neu).zweifaktor).toBe(true);
  }, LIMIT);

  it("3c. Epoche UND Abmelden scheitern nach der Aktivierung: keine ältere Sitzung ohne Faktor gilt wieder — weder als Anmeldung noch für die Betriebsauswahl noch als Arbeitssitzung", async () => {
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const ACS = await import("../server/lib/accountsitzungen.mjs");
    const K5 = await eingerichtet("alles-kaputt");
    const s = laden();
    const abseits = getStore({ name: "centric-accountsitzungen-abseits3c", consistency: "strong" });
    /* Vor der Aktivierung: eine Anmeldung nur mit Passwort, in einer Ablage, die kein Abmelden erreicht, und — ohne
       Pflicht, wie es vor der Aktivierung zulässig war — eine Arbeitssitzung als Leitung daraus. */
    const alt = await AN.anmelden(s, { email: K5.email, passwort: GUT, sitzungsAblage: abseits });
    expect(alt.ok, JSON.stringify(alt)).toBe(true);
    const p0 = await AN.sitzungPruefen(s, alt.token, { sitzungsAblage: abseits });
    expect(p0.ok).toBe(true);
    delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
    let arbeit;
    try {
      arbeit = await BA.betriebWaehlen(s, { accountId: K5.accountId, raum: K5.raum, kontoAblage: abseits,
        kontoSitzung: { id: /** @type {any} */ (p0).sitzungsId, bis: /** @type {any} */ (p0).bis } });
    } finally { process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1"; }
    expect(arbeit.ok, JSON.stringify(arbeit)).toBe(true);
    const roh = await arbeitAblage().get(`t:${hash(/** @type {any} */ (arbeit).token)}`, { type: "json" });
    expect((await AS.arbeitssitzungPruefen(s, roh, { kontoAblage: abseits })).ok).toBe(true);

    /* Die Aktivierung: Schreiben am Konto (Epoche) und Auflisten der Sitzungen versagen, sobald der Faktor aktiv ist. */
    const epocheVorher = Number((await A.accountLesenPerId(s, K5.accountId)).epoche) || 1;
    const aktiv = () => KF.kontoFaktorStand(s, K5.accountId).then((x) => x.aktiv);
    const kaputtStore = new Proxy(s, { get(t, p) {
      if (p === "setJSON") return async (key, ...rest) => {
        if (String(key).startsWith("account:") && await aktiv()) throw new Error("ablage kaputt");
        return t.setJSON(key, ...rest);
      };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const echt = kontoAblage();
    const kaputtSitzungen = new Proxy(echt, { get(t, p) {
      if (p === "list") return async (...a) => { if (await aktiv()) throw new Error("ablage kaputt"); return t.list(...a); };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const b = await AN.kontoFaktorAktion(s, { email: K5.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K5.code });
    expect(b.ok, JSON.stringify(b)).toBe(true);
    const f = await AN.kontoFaktorAktion(kaputtStore, { email: K5.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K5.code, zweifaktor: code(b.daten.geheimnis), sitzungsAblage: kaputtSitzungen });
    expect(f.ok).toBe(false);
    expect(f.grund).toBe("sitzungen");
    expect(JSON.stringify(f)).not.toContain("wiederherstellung");
    expect(await aktiv()).toBe(true);
    expect(Number((await A.accountLesenPerId(s, K5.accountId)).epoche) || 1).toBe(epocheVorher);

    /* Die alte Arbeitssitzung (Epoche unverändert) gilt nicht mehr … */
    const nachArbeit = await AS.arbeitssitzungPruefen(s, roh, { kontoAblage: abseits });
    expect(nachArbeit.ok).toBe(false);
    expect(/** @type {any} */ (nachArbeit).grund).toBe("konto-faktor");
    /* … ohne Pflicht öffnet die alte Anmeldung keinen Betrieb … */
    delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
    try {
      const w = await BA.betriebWaehlen(s, { accountId: K5.accountId, raum: K5.raum, kontoAblage: abseits,
        kontoSitzung: { id: /** @type {any} */ (p0).sitzungsId, bis: /** @type {any} */ (p0).bis } });
      expect(w.ok).toBe(false);
      expect(/** @type {any} */ (w).grund).toBe("zweifaktor-pflicht");
    } finally { process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1"; }
    /* … und sie selbst ist beendet (geprüft und gelöscht). */
    const p1 = await AN.sitzungPruefen(s, alt.token, { sitzungsAblage: abseits });
    expect(p1.ok).toBe(false);
    expect(/** @type {any} */ (p1).grund).toBe("zweifaktor");
    expect(await abseits.get(`as:${hash(alt.token)}`, { type: "json" })).toBe(null);
    /* Eine Sitzung ohne Faktor mit der aktuellen Epoche (wie aus einer Anmeldung, die den Faktorstand vor der
       Aktivierung las) gilt ebenso wenig. */
    const neuOhne = await ACS.accountSitzungAnlegen({ accountId: K5.accountId, epoche: epocheVorher }, { ablage: abseits });
    expect(neuOhne.ok).toBe(true);
    expect((await AN.sitzungPruefen(s, /** @type {any} */ (neuOhne).token, { sitzungsAblage: abseits })).ok).toBe(false);
    /* Über HTTP: dieselbe Absage mit Hinweis auf den Weg, das Cookie weg. */
    const ohneHttp = await ACS.accountSitzungAnlegen({ accountId: K5.accountId, epoche: epocheVorher });
    const w2 = await anfrage({ pfad: P_WAHL, rumpf: { raum: K5.raum }, keks: /** @type {any} */ (ohneHttp).token });
    expect(w2.status).toBe(403);
    expect(w2.daten.fehler).toBe("zweifaktor-pflicht");
    expect((await anfrage({ pfad: P_SITZ, methode: "GET", keks: /** @type {any} */ (ohneHttp).token })).status).toBe(401);
    /* Der einzige Weg hinein: neue Anmeldung mit Passwort und Code aus der App — und damit der Betrieb als Leitung. */
    weiter();
    const keks = await mitFaktorAngemeldet(K5.email, b.daten.geheimnis);
    const w3 = await anfrage({ pfad: P_WAHL, rumpf: { raum: K5.raum }, keks });
    expect(w3.status, w3.text).toBe(200);
    expect(w3.daten.rolle).toBe("leitung");
  }, LIMIT);

  it("3d. Gleichzeitige Aktivierungen und eine gleichzeitige Passwort-Anmeldung: genau eine Aktivierung, Epoche genau einmal erhöht, keine Sitzung ohne Faktor gilt danach", async () => {
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const K6 = await eingerichtet("gleichzeitig");
    const s = laden();
    const b = await anfrage({ rumpf: { email: K6.email, passwort: GUT, zweifaktorAktion: "beginnen",
      ersteinrichtungscode: K6.code } });
    expect(b.status, b.text).toBe(200);
    geheim.add(b.daten.geheimnis);
    const epocheVorher = Number((await A.accountLesenPerId(s, K6.accountId)).epoche) || 1;
    const wert = code(b.daten.geheimnis);
    const rumpf = { email: K6.email, passwort: GUT, zweifaktorAktion: "bestaetigen", ersteinrichtungscode: K6.code,
      zweifaktor: wert };
    const [x, y, z, pw] = await Promise.all([anfrage({ rumpf }), anfrage({ rumpf }), anfrage({ rumpf }),
      AN.anmelden(s, { email: K6.email, passwort: GUT })]);
    const ok = [x, y, z].filter((r) => r.status === 200);
    expect(ok.length, [x, y, z].map((r) => r.text).join(" | ")).toBe(1);
    expect(ok[0].daten.wiederherstellung).toHaveLength(10);
    for (const w of ok[0].daten.wiederherstellung) geheim.add(w);
    for (const r of [x, y, z].filter((q) => q.status !== 200)) {
      expect([401, 403], r.text).toContain(r.status);
      expect(r.daten.wiederherstellung).toBeUndefined();
      expect(r.daten.token).toBeUndefined();
    }
    expect((await KF.kontoFaktorStand(s, K6.accountId)).aktiv).toBe(true);
    expect(Number((await A.accountLesenPerId(s, K6.accountId)).epoche)).toBe(epocheVorher + 1);
    /* Die gleichzeitige Passwort-Anmeldung: entweder schon abgewiesen oder ihre Sitzung gilt danach nicht. */
    if (pw.ok) expect((await AN.sitzungPruefen(s, /** @type {any} */ (pw).token)).ok).toBe(false);
    else expect(/** @type {any} */ (pw).grund).toBe("zweifaktor-erforderlich");
    /* Der Code ist verbraucht; ein weiterer Versuch richtet nichts ein. */
    weiter();
    const nochmal = await anfrage({ rumpf: { ...rumpf, zweifaktor: code(b.daten.geheimnis) } });
    expect(nochmal.status).toBe(409);
    expect(nochmal.daten.wiederherstellung).toBeUndefined();
    weiter();
  }, LIMIT);

  it("3b. Nach der Aktivierung gilt eine vorher angelegte Sitzung nicht mehr (Epoche erhöht)", async () => {
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const K4 = await eingerichtet("epoche");
    const s = laden();
    /* Eine Sitzung in einer Ablage, die das Abmelden nicht erreicht — wie eine, die zwischen dem Lesen des
       Faktorstands und der Aktivierung entstand. Nur die Epoche kann sie noch entwerten. */
    const abseits = getStore({ name: "centric-accountsitzungen-abseits", consistency: "strong" });
    const an = await AN.anmelden(s, { email: K4.email, passwort: GUT, sitzungsAblage: abseits });
    expect(an.ok, JSON.stringify(an)).toBe(true);
    expect(an.zweifaktor).toBeUndefined();
    expect((await AN.sitzungPruefen(s, an.token, { sitzungsAblage: abseits })).ok).toBe(true);
    const epocheVorher = Number((await A.accountLesenPerId(s, K4.accountId)).epoche) || 1;
    const b = await AN.kontoFaktorAktion(s, { email: K4.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K4.code });
    expect(b.ok).toBe(true);
    const f = await AN.kontoFaktorAktion(s, { email: K4.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K4.code, zweifaktor: code(b.daten.geheimnis), sitzungsAblage: kontoAblage() });
    expect(f.ok, JSON.stringify(f)).toBe(true);
    expect((await KF.kontoFaktorStand(s, K4.accountId)).aktiv).toBe(true);
    expect((await A.accountLesenPerId(s, K4.accountId)).epoche).toBe(epocheVorher + 1);
    const danach = await AN.sitzungPruefen(s, an.token, { sitzungsAblage: abseits });
    expect(danach.ok).toBe(false);
    expect(danach.grund).toBe("epoche");
  }, LIMIT);
});

/* ==========================================================================
   Review PR #179 (Opus, Blocker): Eine zweite, überlappende Bestätigung darf
   den eben aktivierten Faktor nie löschen. Bis 073d9fea las sie nach der
   Aktivierung „nichts ausstehend", zählte das als Fehlversuch am schon
   verbrauchten Code („gesperrt") und schaltete den AKTIVEN Faktor ab — ohne
   Pflicht wieder nur Passwort, unter Pflicht Aussperrung des Inhabers.
   ========================================================================== */
describe("OPT-1-F Review: überlappende Bestätigung löscht keinen aktiven Faktor", () => {
  beforeEach(() => { weiter(11 * 60); });

  /** A bestätigt vollständig, während B die oberen Prüfungen schon hinter sich hat und am Tor wartet. */
  async function ueberlappend(was) {
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const K7 = await eingerichtet(was);
    const s = laden();
    const b = await AN.kontoFaktorAktion(s, { email: K7.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K7.code });
    expect(b.ok, JSON.stringify(b)).toBe(true);
    geheim.add(b.daten.geheimnis);
    const wert = code(b.daten.geheimnis);
    /** @type {(v?: any) => void} */ let freigabe = () => {};
    const warten = new Promise((r) => { freigabe = r; });
    let amTor = false;
    const pB = AN.kontoFaktorAktion(s, { email: K7.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K7.code, zweifaktor: wert, faktorTor: async () => { amTor = true; await warten; return null; } });
    for (let i = 0; i < 200 && !amTor; i++) await new Promise((r) => setTimeout(r, 10));
    expect(amTor).toBe(true);
    const a = await AN.kontoFaktorAktion(s, { email: K7.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K7.code, zweifaktor: wert });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    for (const w of a.daten.wiederherstellung) geheim.add(w);
    expect((await KF.kontoFaktorStand(s, K7.accountId)).aktiv).toBe(true);
    /* Nach A: eine Sitzung mit Faktor; Epoche festhalten. */
    weiter();
    const mit = await AN.anmelden(s, { email: K7.email, passwort: GUT, zweifaktor: code(b.daten.geheimnis) });
    expect(mit.ok, JSON.stringify(mit)).toBe(true);
    const epocheNachA = Number((await A.accountLesenPerId(s, K7.accountId)).epoche);
    freigabe();
    const rb = await pB;
    return { AN, K7, s, b, rb, mit, epocheNachA };
  }

  it("(a) deterministisch: die zweite Bestätigung wird abgewiesen, der Faktor bleibt aktiv, Epoche und Sitzungen unverändert, Anmeldung nur mit Faktor", async () => {
    const { AN, K7, s, b, rb, mit, epocheNachA } = await ueberlappend("ueberlapp-a");
    expect(rb.ok).toBe(false);
    expect(JSON.stringify(rb)).not.toContain("wiederherstellung");
    const st = await KF.kontoFaktorStand(s, K7.accountId);
    expect(st.aktiv, JSON.stringify(rb)).toBe(true);
    expect(Number((await A.accountLesenPerId(s, K7.accountId)).epoche)).toBe(epocheNachA);
    expect((await AN.sitzungPruefen(s, /** @type {any} */ (mit).token)).ok).toBe(true);
    /* Ohne Pflicht: Passwort allein reicht nicht. */
    delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
    try {
      const allein = await AN.anmelden(s, { email: K7.email, passwort: GUT });
      expect(allein.ok).toBe(false);
      expect(/** @type {any} */ (allein).grund).toBe("zweifaktor-erforderlich");
    } finally { process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1"; }
    weiter();
    const neu = await AN.anmelden(s, { email: K7.email, passwort: GUT, zweifaktor: code(b.daten.geheimnis) });
    expect(neu.ok, JSON.stringify(neu)).toBe(true);
    /* Kein Neubeginn mit dem verbrauchten Code. */
    const again = await AN.kontoFaktorAktion(s, { email: K7.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K7.code });
    expect(again.ok).toBe(false);
  }, LIMIT);

  it("(c) unter Pflicht: der Inhaber ist nach der überlappenden Bestätigung nicht ausgesperrt und öffnet den Betrieb als Leitung", async () => {
    expect(process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT).toBe("1");
    const { K7, s, b } = await ueberlappend("ueberlapp-c");
    expect((await KF.kontoFaktorStand(s, K7.accountId)).aktiv).toBe(true);
    weiter();
    const keks = await mitFaktorAngemeldet(K7.email, b.daten.geheimnis);
    const w = await anfrage({ pfad: P_WAHL, rumpf: { raum: K7.raum }, keks });
    expect(w.status, w.text).toBe(200);
    expect(w.daten.rolle).toBe("leitung");
  }, LIMIT);

  it("(b) echte Parallelität: sechs Bestätigungen gleichzeitig (richtige und falsche Werte) — genau eine Aktivierung, danach immer aktiv", async () => {
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const K8 = await eingerichtet("parallel6");
    const s = laden();
    const b = await AN.kontoFaktorAktion(s, { email: K8.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K8.code });
    expect(b.ok).toBe(true);
    geheim.add(b.daten.geheimnis);
    const wert = code(b.daten.geheimnis);
    const falsch = wert === "000000" ? "111111" : "000000";
    const werte = [wert, falsch, wert, falsch, wert, wert];
    const erg = await Promise.all(werte.map((z) => AN.kontoFaktorAktion(s, { email: K8.email, passwort: GUT,
      aktion: "bestaetigen", ersteinrichtungscode: K8.code, zweifaktor: z })));
    const ok = erg.filter((r) => r.ok);
    expect(ok.length, JSON.stringify(erg.map((r) => r.ok || r.grund))).toBe(1);
    for (const w of /** @type {any} */ (ok[0]).daten.wiederherstellung) geheim.add(w);
    expect((await KF.kontoFaktorStand(s, K8.accountId)).aktiv).toBe(true);
    /* Auch spätere falsche Versuche mit dem verbrauchten Code ändern daran nichts. */
    for (let i = 0; i < 6; i++) {
      const r = await AN.kontoFaktorAktion(s, { email: K8.email, passwort: GUT, aktion: "bestaetigen",
        ersteinrichtungscode: K8.code, zweifaktor: falsch });
      expect(r.ok).toBe(false);
    }
    expect((await KF.kontoFaktorStand(s, K8.accountId)).aktiv).toBe(true);
  }, LIMIT);
});
