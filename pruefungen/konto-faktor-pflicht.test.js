/* ==========================================================================
   OPT-4: ZWEITER FAKTOR AM KONTO — PFLICHT JE KONTO, ROLLENWECHSEL,
   PRIVILEGIERTE SITZUNGEN, MANDANTENTRENNUNG

   Akzeptanz (docs/acc45/work-packages.json, OPT-4): verpflichtend bei
   betroffenen Berechtigungen; Tests für Rollenwechsel und privilegierte
   Sitzungen; Mandantentrennung. Lücke auf dem Stand vor OPT-4 (163dc491):
   Ohne den Schalter CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1 öffnete ein Konto,
   dem ein Ersteinrichtungscode ausgestellt war, den Betrieb als Leitung mit
   dem Passwort allein — der Zugangscode-Weg erzwang die Pflicht für denselben
   Fall (pflichtErzwungen), der Kontoweg nicht. Ebenso wurde eine als
   Mitarbeiter gewählte Arbeitssitzung nach einer Hochstufung zur Leitung
   ohne Faktor weiter angenommen.

   Diese Prüfung läuft bewusst OHNE den Schalter: Gezeigt wird die Pflicht je
   Konto (`faktorPflicht`), nicht die globale.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const LIMIT = 60000;
const WIRT = "127.0.0.1:3000";
const EIGEN = `http://${WIRT}`;
const GUT = "Nordwind und Sonne 1846";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 15);
const P_AN = "/api/account/anmelden";
const P_WAHL = "/api/account/betrieb";

let wurzel, getStore, handler, KEKS, daten, A, B, P, REG, PROV, R, AS, ZE;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = (s = 30) => uhr(jetzt + s * 1000);
const totp = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);
let zaehler = 0;
const herkunft = () => `10.73.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-opt4-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-opt-4-konto-pflicht-0123456789";
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of ["anmelden-konto", "zweifaktor", "konto-sitzung"])
    if (schutz.GRENZEN[art]) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  schutz.WEITERE["anmelden-konto"] = { ziel: { versuche: 100000, fenster: 300 },
    gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN["anmelden-konto"] = { versuche: 100000, fenster: 300, gesamt: 100000 };
  const modul = await import("../server/funktionen/anmeldung.mjs");
  handler = modul.default;
  KEKS = modul.COOKIE;
  daten = (await import("../server/funktionen/daten.mjs")).default;
  A = await import("../server/lib/accounts.mjs");
  B = await import("../server/lib/bestand.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  REG = await import("../server/lib/registrierung.mjs");
  PROV = await import("../server/lib/provisionierung.mjs");
  R = await import("../server/lib/rechte.mjs");
  AS = await import("../server/lib/arbeitssitzung.mjs");
  ZE = await import("../server/lib/zugangscode-ersteinrichtung.mjs");
}, LIMIT);

afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

const laden = () => getStore({ name: "centric", consistency: "strong" });
const hash = (x) => createHash("sha256").update(String(x)).digest("hex");
const arbeitAblage = () => getStore({ name: "centric-sitzungen", consistency: "strong" });

async function anfrage({ pfad = P_AN, rumpf = {}, keks = null } = {}) {
  const kopf = { "x-forwarded-for": herkunft(), host: WIRT, origin: EIGEN, "content-type": "application/json" };
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  const a = await handler(new Request(`${EIGEN}${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf) }));
  const text = await a.clone().text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { antwort: a, status: a.status, daten: d, text };
}
const keksWert = (kopf) => {
  const m = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(String(kopf || ""));
  return m ? m[1] : null;
};
async function bestandStatus(token) {
  const a = await daten(new Request(`${EIGEN}/api/bestand`, { method: "GET",
    headers: { host: WIRT, origin: EIGEN, authorization: `Bearer ${token}`, "x-forwarded-for": herkunft() } }), {});
  return a.status;
}
async function angemeldet(email, rumpf = {}) {
  const an = await anfrage({ rumpf: { email, passwort: GUT, ...rumpf } });
  expect(an.status, an.text).toBe(200);
  weiter();
  return keksWert(an.antwort.headers.get("set-cookie"));
}
const waehlen = (keks, raum) => anfrage({ pfad: P_WAHL, rumpf: { raum }, keks });

/** Echter Weg: Registrierung, Passwort, Testbetrieb MIT Ersteinrichtungscode (werkzeug/testbetrieb-anlegen.mjs). */
async function mitErsteinrichtung(was) {
  const s = laden();
  const email = `${was}-${++zaehler}@example.org`;
  const briefe = [];
  const start = await REG.registrierungStarten(s, { vorname: "Rina", nachname: "Schmitt",
    betriebsname: "Wachdienst Nordlicht", email,
    versand: async (an, betreff, text) => { briefe.push(String(text)); return { ok: true, trocken: true }; } });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const link = (/#token=([A-Za-z0-9_-]+)/.exec(briefe[briefe.length - 1]) || [])[1];
  const v = await REG.emailVerifizieren(s, { token: link });
  expect((await REG.passwortMitNachweisSetzen(s, { fortsetzung: v.fortsetzung, passwort: GUT })).ok).toBe(true);
  const e = await PROV.testbetriebFuerAccountAnlegen(s, arbeitAblage(), { accountId: v.accountId, ersteinrichtung: true });
  expect(e.ok, `Provisionierung: ${e.grund}`).toBe(true);
  return { email, accountId: v.accountId, raum: e.raum, code: e.ersteinrichtung.code };
}

async function faktorEinrichten(K) {
  const b = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "beginnen",
    ersteinrichtungscode: K.code } });
  expect(b.status, b.text).toBe(200);
  const f = await anfrage({ rumpf: { email: K.email, passwort: GUT, zweifaktorAktion: "bestaetigen",
    ersteinrichtungscode: K.code, zweifaktor: totp(b.daten.geheimnis) } });
  expect(f.status, f.text).toBe(200);
  weiter();
  return { geheimnis: b.daten.geheimnis, codes: f.daten.wiederherstellung };
}

/** Ein schlichtes Konto (ohne Ersteinrichtung) mit Passwort. */
async function konto(was) {
  const s = laden();
  const e = await A.accountAnlegen(s, { email: `${was}-${++zaehler}@example.org` });
  expect(e.ok).toBe(true);
  await A.emailBestaetigen(s, e.account.id);
  const g = await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(GUT));
  expect(g.ok).toBe(true);
  return g.account;
}

const person = (id, rolle) => ({ id, vorname: "Rina", nachname: "Schmitt", rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE" });
const kernMit = (rolle) => ({ version: 5, mandanten: [{ id: "m1", name: "Haus Probe",
  personen: [person("p_1", rolle)], einheiten: [{ id: "e1", name: "Wohnbereich 1" }] }] });

/** Raum mit einer Person und einer aktiven Mitgliedschaft. */
async function arbeitsbereich(accountId, was, { rolle = "mitarbeiter", personRolle = null } = {}) {
  const raum = `t-opt4-${was}-${++zaehler}`;
  const w = await B.bestandSchreiben(laden(), raum, kernMit(personRolle || rolle), { durch: "Pruefung" });
  expect(w.ok, JSON.stringify(w)).toBe(true);
  const m = await A.mitgliedschaftAnlegen(laden(), { accountId, raum, betrieb: 0, mandantId: "m1",
    person: "p_1", rolle, status: "aktiv" });
  expect(m.ok, JSON.stringify(m)).toBe(true);
  return raum;
}

describe("OPT-4: Pflicht je Konto, ohne globalen Schalter", () => {
  it("Mit dem Ersteinrichtungscode wird die Pflicht am Konto vermerkt; das Passwort allein öffnet den Betrieb nicht als Leitung", async () => {
    const K = await mitErsteinrichtung("pflicht");
    const k = await A.accountLesenPerId(laden(), K.accountId);
    expect(k.faktorPflicht).toBe(true);
    const keks = await angemeldet(K.email);
    const w = await waehlen(keks, K.raum);
    expect(w.status, w.text).toBe(403);
    expect(w.daten.fehler).toBe("zweifaktor-pflicht");
    expect(w.daten.token).toBeUndefined();
  }, LIMIT);

  it("Die Pflicht lässt sich über accountAendern nicht zurücknehmen", async () => {
    const k = await konto("nicht-zurueck");
    expect((await A.accountAendern(laden(), k.id, { faktorPflicht: true })).ok).toBe(true);
    for (const w of [false, null, 0, "nein", undefined])
      expect((await A.accountAendern(laden(), k.id, { faktorPflicht: w })).ok, String(w)).toBe(false);
    expect((await A.accountLesenPerId(laden(), k.id)).faktorPflicht).toBe(true);
  }, LIMIT);

  it("Pflichtkonto: Mitgliedschaft als Mitarbeiter, Person aber Leitung (wirksame Rolle) — keine Arbeitssitzung ohne Faktor", async () => {
    const k = await konto("wirksam");
    expect((await A.accountAendern(laden(), k.id, { faktorPflicht: true })).ok).toBe(true);
    const raum = await arbeitsbereich(k.id, "wirksam", { rolle: "mitarbeiter", personRolle: "leitung" });
    const w = await waehlen(await angemeldet(k.email), raum);
    expect(w.status, w.text).toBe(403);
    expect(w.daten.fehler).toBe("zweifaktor-pflicht");
  }, LIMIT);

  /* Review-Befund 5: Die wirksame Rolle wechselt tatsächlich — belegt über wirksameRolle gegen den frisch gelesenen
     Bestand und über den Grund der Absage (konto-faktor-pflicht), nicht nur über einen Status. */
  const wirksamJetzt = async (raum, token) => {
    const roh = await arbeitAblage().get(`t:${hash(token)}`, { type: "json" });
    const g = await B.bestandLesen(laden(), raum);
    return { roh, rolle: R.wirksameRolle(roh, g.bestand) };
  };

  it("Rollenwechsel: Herabstufung öffnet den Betrieb ohne Faktor als Mitarbeiter; Hochstufung danach beendet genau diese Arbeitssitzung (Grund: Faktorpflicht)", async () => {
    const k = await konto("wechsel");
    expect((await A.accountAendern(laden(), k.id, { faktorPflicht: true })).ok).toBe(true);
    /* Ausgang: Mitgliedschaft Mitarbeiter, Person im Bestand Leitung → wirksam Leitung → ohne Faktor keine Auswahl. */
    const raum = await arbeitsbereich(k.id, "wechsel", { rolle: "mitarbeiter", personRolle: "leitung" });
    const keks = await angemeldet(k.email);
    const vorher = await waehlen(keks, raum);
    expect(vorher.status, vorher.text).toBe(403);
    expect(vorher.daten.fehler).toBe("zweifaktor-pflicht");
    /* Herabstufung: Person wird Mitarbeiter → keine der beiden Rollen trägt Faktorpflicht → Auswahl gelingt. */
    expect((await B.bestandSchreiben(laden(), raum, kernMit("mitarbeiter"), { durch: "Pruefung" })).ok).toBe(true);
    const w = await waehlen(keks, raum);
    expect(w.status, w.text).toBe(200);
    expect(w.daten.rolle).toBe("mitarbeiter");
    const m = await wirksamJetzt(raum, w.daten.token);
    expect(m.rolle).toBe("mitarbeiter");
    expect((await AS.arbeitssitzungPruefen(laden(), m.roh)).ok).toBe(true);
    expect(await bestandStatus(w.daten.token)).toBe(200);
    /* Hochstufung: Person wird wieder Leitung → wirksam Leitung → die Arbeitssitzung ohne Faktor gilt nicht mehr. */
    expect((await B.bestandSchreiben(laden(), raum, kernMit("leitung"), { durch: "Pruefung" })).ok).toBe(true);
    const h = await wirksamJetzt(raum, w.daten.token);
    expect(h.rolle).toBe("leitung");
    const pr = await AS.arbeitssitzungPruefen(laden(), h.roh);
    expect(pr.ok).toBe(false);
    expect(/** @type {any} */ (pr).grund).toBe("konto-faktor-pflicht");
    expect(await bestandStatus(w.daten.token)).toBe(401);
    /* Erneute Herabstufung belebt sie nicht wieder (weggeräumt). */
    expect((await B.bestandSchreiben(laden(), raum, kernMit("mitarbeiter"), { durch: "Pruefung" })).ok).toBe(true);
    expect(await bestandStatus(w.daten.token)).toBe(401);
  }, LIMIT);

  it("Kontrolle: Konto ohne Pflicht, ohne Schalter — dieselbe Hochstufung beendet die Sitzung nicht (das Umschreiben des Bestands allein ist kein Grund)", async () => {
    const k = await konto("ohne-pflicht");
    const raum = await arbeitsbereich(k.id, "ohne-pflicht", { rolle: "mitarbeiter" });
    const w = await waehlen(await angemeldet(k.email), raum);
    expect(w.status, w.text).toBe(200);
    expect(await bestandStatus(w.daten.token)).toBe(200);
    expect((await B.bestandSchreiben(laden(), raum, kernMit("leitung"), { durch: "Pruefung" })).ok).toBe(true);
    const h = await wirksamJetzt(raum, w.daten.token);
    expect(h.rolle).toBe("leitung");
    expect((await AS.arbeitssitzungPruefen(laden(), h.roh)).ok).toBe(true);
  }, LIMIT);

  it("Schlägt das Vermerken der Pflicht am Konto fehl, entsteht kein Ersteinrichtungscode (fail-closed)", async () => {
    const K = await mitErsteinrichtung("vermerk-kaputt");
    const s = laden();
    const m = await A.mitgliedschaftLesen(s, K.accountId, K.raum);
    const kaputt = new Proxy(s, { get(z, name) {
      if (name === "setJSON") return async (key, ...rest) => {
        if (String(key).startsWith("account:")) throw new Error("Ablage streikt");
        return z.setJSON(key, ...rest);
      };
      const v = z[name]; return typeof v === "function" ? v.bind(z) : v;
    } });
    const zaehlen = async () => (await s.list({ prefix: "konto:" })).blobs.length;
    const vorher = await zaehlen();
    const e = await ZE.ersteinrichtungscodeAnlegen(kaputt, { raum: K.raum, mandantId: m.mandantId, betrieb: m.betrieb,
      person: String(m.person), accountId: K.accountId });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("konto");
    expect(e.code).toBeUndefined();
    expect(await zaehlen()).toBe(vorher);
    /* Gegenprobe mit gesunder Ablage: es entsteht ein Code. */
    const gut = await ZE.ersteinrichtungscodeAnlegen(s, { raum: K.raum, mandantId: m.mandantId, betrieb: m.betrieb,
      person: String(m.person), accountId: K.accountId });
    expect(gut.ok, JSON.stringify(gut.grund)).toBe(true);
    expect(await zaehlen()).toBe(vorher + 1);
  }, LIMIT);
});

describe("OPT-4: privilegierte Sitzungen mit Faktor, Mandantentrennung", () => {
  /** @type {any} */ let K;
  /** @type {any} */ let F;

  it("Pflichtkonto mit eingerichtetem Faktor: Passwort + Code öffnet den Betrieb als Leitung, bleibt über einen Rollenwechsel gültig", async () => {
    K = await mitErsteinrichtung("privilegiert");
    F = await faktorEinrichten(K);
    const keks = await angemeldet(K.email, { zweifaktor: totp(F.geheimnis) });
    const w = await waehlen(keks, K.raum);
    expect(w.status, w.text).toBe(200);
    expect(w.daten.rolle).toBe("leitung");
    expect(await bestandStatus(w.daten.token)).toBe(200);
    /* Ohne Faktor (nur Passwort) gibt es gar keine Sitzung mehr. */
    expect((await anfrage({ rumpf: { email: K.email, passwort: GUT } })).status).toBe(401);
  }, LIMIT);

  it("Mandantentrennung: Pflicht und Faktor gehören dem Konto — ein zweites Konto in einem anderen Betrieb bleibt unberührt, fremde Codes gelten nicht", async () => {
    const L = await mitErsteinrichtung("anderer-betrieb");
    expect(L.raum).not.toBe(K.raum);
    /* Ks Ersteinrichtungscode (verbraucht) und Ks Codes richten bei L nichts ein. */
    const fremdEc = await anfrage({ rumpf: { email: L.email, passwort: GUT, zweifaktorAktion: "beginnen",
      ersteinrichtungscode: K.code } });
    expect(fremdEc.status).toBe(403);
    expect(fremdEc.daten.geheimnis).toBeUndefined();
    /* L hat noch keinen Faktor: Code aus Ks App und Ks Wiederherstellungscode ergeben keine privilegierte Sitzung. */
    for (const fremd of [totp(F.geheimnis), F.codes[0]]) {
      const keks = await angemeldet(L.email, { zweifaktor: fremd });
      const w = await waehlen(keks, L.raum);
      expect(w.status, w.text).toBe(403);
    }
    /* L mit eigenem Faktor kommt in Ls Betrieb, nicht in Ks. */
    const G = await faktorEinrichten(L);
    const keksL = await angemeldet(L.email, { zweifaktor: totp(G.geheimnis) });
    expect((await waehlen(keksL, L.raum)).status).toBe(200);
    const fremdRaum = await waehlen(keksL, K.raum);
    expect(fremdRaum.status).toBe(403);
    expect(fremdRaum.daten.token).toBeUndefined();
    /* Ks Codes melden L nicht an. */
    expect((await anfrage({ rumpf: { email: L.email, passwort: GUT, zweifaktor: F.codes[1] } })).status).toBe(401);
    expect((await anfrage({ rumpf: { email: L.email, passwort: GUT, zweifaktor: totp(F.geheimnis) } })).status).toBe(401);
  }, LIMIT);
});
