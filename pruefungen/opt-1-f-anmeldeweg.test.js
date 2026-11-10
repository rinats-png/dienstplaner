/* ==========================================================================
   OPT-1-F — ANMELDEWEG FÜR LEITUNGSKONTEN NACH DER ERSTEINRICHTUNG
   (Folgepaket zu OPT-1 / PR #166; Blocker aus dem Review)

   Die Kette, über die echten Handler (anmeldung.mjs und daten.mjs):

     Registrierung -> Provisionierung (mit Ersteinrichtungscode)
       -> Einrichtung des zweiten Faktors über den Code (daten.mjs, /api/anmelden)
       -> Kontoanmeldung (Passwort) + Betriebsauswahl mit Code aus der App
       -> Arbeitssitzung, die unter Pflicht weiterarbeiten darf.

   Gegenproben: Der verbrauchte Code wirkt nie als Anmeldung; ohne den Faktor
   öffnet nichts; der Faktor gehört dem Konto (nicht übertragbar, nicht
   aus einer Kontositzung einzurichten); die Bremse bleibt, wie sie ist;
   keine Auskunft über fremde Betriebe oder Konten.

   Testcodes entstehen zur Laufzeit; der Pfeffer ist ein Prüfwert.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 15);
const LIMIT = 60000;
const PFEFFER = "pfeffer-nur-zum-pruefen-opt1f-0123456789";
const GUT = "Nordwind und Sonne 1846";
const PROFIL = { vorname: "Rina", nachname: "Schmitt", betriebsname: "Pflegedienst Morgenrot" };

let wurzel, getStore, daten, anmeldungH, KEKS, E, K, CODES, A, P, R, BZ, ZF, SCH, S;
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = () => uhr(jetzt + 30_000);
const laden = () => getStore({ name: "centric", consistency: "strong" });
const sitzungenStore = () => getStore({ name: "centric-sitzungen", consistency: "strong" });
const herkunft = () => { nr += 1; return `10.62.${Math.floor(nr / 250)}.${nr % 250}`; };
const totp = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

/** /api/anmelden (Zugangscode) über den echten Handler. */
const zugangscode = async (rumpf) => {
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": herkunft() }, body: JSON.stringify(rumpf) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
};

/** Eine Anfrage an den Kontohandler. */
async function konto({ pfad, rumpf, keks = null, von = null }) {
  const kopf = { "x-forwarded-for": von || herkunft(), host: WIRT, origin: `http://${WIRT}`,
    "content-type": "application/json" };
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  const a = await anmeldungH(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf,
    body: JSON.stringify(rumpf ?? {}) }));
  let d = null; try { d = await a.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  const set = a.headers.get("set-cookie") || "";
  const m = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(set);
  return { status: a.status, d, text: JSON.stringify(d), keks: m ? m[1] : null, kopf: a.headers };
}
const betrieb = (raum, keks, extra = {}, von = null) => konto({ pfad: "/api/account/betrieb",
  rumpf: { raum, ...extra }, keks, von });

/** Mit dem Arbeitsmerkmal eine Anfrage an die Anwendung (GET /api/bestand). */
const bestandLesen = async (token) => {
  const a = await daten(new Request(`http://${WIRT}/api/bestand`, { method: "GET",
    headers: { host: WIRT, authorization: `Bearer ${token}`, "x-forwarded-for": herkunft() } }), {});
  return { status: a.status, roh: await a.text() };
};

function postfach() {
  const briefe = [];
  return { briefe, versand: async (an, betreff, text) => { briefe.push({ an, betreff, text }); return { ok: true, trocken: true }; } };
}
const tokenAus = (text) => { const t = /#token=([A-Za-z0-9_-]+)/.exec(String(text)); return t ? t[1] : null; };

/** Registrierung bis zum Passwort, dann die Provisionierung über den Einstieg mit Ersteinrichtung. */
async function betriebMitCode(email) {
  const s = laden();
  const pf = postfach();
  const start = await R.registrierungStarten(s, { ...PROFIL, email, versand: pf.versand });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const v = await R.emailVerifizieren(s, { token: tokenAus(pf.briefe[pf.briefe.length - 1].text) });
  expect(v.ok, `Bestätigung: ${v.grund}`).toBe(true);
  const p = await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
  expect(p.ok, `Passwort: ${p.grund}`).toBe(true);
  const e = await P.testbetriebMitErsteinrichtung(s, sitzungenStore(), { accountId: v.accountId, jetzt: () => jetzt });
  expect(e.ok, `Provisionierung: ${e.grund}`).toBe(true);
  expect(e.ersteinrichtung && e.ersteinrichtung.code, "Ersteinrichtungscode im Ergebnis").toBeTruthy();
  return { email, accountId: v.accountId, raum: e.raum, code: e.ersteinrichtung.code, bis: e.ersteinrichtung.bis, pf };
}

/** Den Faktor über den Ersteinrichtungscode einrichten (daten.mjs). */
async function einrichten(code) {
  const b = await zugangscode({ zugangscode: code, zweifaktorAktion: "beginnen" });
  expect(b.status, b.roh).toBe(200);
  const f = await zugangscode({ zugangscode: code, zweifaktorAktion: "bestaetigen", zweifaktor: totp(b.geheimnis) });
  expect(f.status, f.roh).toBe(200);
  expect(f.aktiv).toBe(true);
  weiter();
  return { geheimnis: b.geheimnis, wiederherstellung: f.wiederherstellung };
}

const anmelden = async (email) => {
  const a = await konto({ pfad: "/api/account/anmelden", rumpf: { email, passwort: GUT } });
  expect(a.status, a.text).toBe(200);
  expect(a.keks).toBeTruthy();
  return a.keks;
};

const pflichtAn = () => { process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1"; };
const pflichtAus = () => { delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT; };
const arbeitsSitzungen = async () => (await sitzungenStore().list({ prefix: "t:" })).blobs.length;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-opt1f-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  pflichtAus();
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  delete process.env.RESEND_API_KEY;
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  SCH = await import("../server/lib/schutz.mjs");
  /* Die Bremse des Zugangscodes ist hier nicht der Gegenstand — die Gegenprobe für den Faktor schaut auf GRENZEN.zweifaktor
     und lässt diese Werte unangetastet (siehe Test „Bremse"). */
  SCH.GRENZEN.anmelden = { ...SCH.GRENZEN.anmelden, versuche: 100000 };
  SCH.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  SCH.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const modul = await import("../server/funktionen/anmeldung.mjs");
  anmeldungH = modul.default; KEKS = modul.COOKIE;
  E = await import("../server/lib/zugangscode-ersteinrichtung.mjs");
  K = await import("../server/lib/konten.mjs");
  CODES = await import("../server/lib/codes.mjs");
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/provisionierung.mjs");
  R = await import("../server/lib/registrierung.mjs");
  BZ = await import("../server/lib/betreiber-zweifaktor.mjs");
  ZF = await import("../server/lib/zweifaktor.mjs");
  S = await import("../server/lib/sitzungen.mjs");
}, LIMIT);

afterAll(async () => {
  vi.useRealTimers();
  pflichtAus();
  delete process.env.CENTRIC_PFEFFER;
  await rm(wurzel, { recursive: true, force: true });
});

/* ==========================================================================
   BLOCKER 1 + 2: die ganze Kette unter Pflicht
   ========================================================================== */

describe("OPT-1-F: regulärer Anmeldeweg nach der Ersteinrichtung (Pflicht an)", () => {
  it("Einrichtung ohne Aussperrung: danach öffnet Konto + Passwort + Code aus der App den Betrieb als Leitung", async () => {
    const b = await betriebMitCode("opt1f-kette@example.org");
    pflichtAn();
    try {
      const keks = await anmelden(b.email);

      /* Vor der Einrichtung öffnet nichts: Pflicht, kein Faktor am Konto. */
      const vorher = await arbeitsSitzungen();
      const zu = await betrieb(b.raum, keks, { zweifaktor: "123456" });
      expect(zu.status, zu.text).toBe(403);
      expect(zu.d.fehler).toBe("zweifaktor-pflicht");
      expect(zu.d.token).toBeUndefined();
      expect(await arbeitsSitzungen()).toBe(vorher);

      /* Einrichten über den Ersteinrichtungscode: der Faktor liegt am KONTO. */
      const f = await einrichten(b.code);
      expect((await ZF.zweifaktorStand(laden(), BZ.kontoZweifaktorId(b.accountId))).aktiv).toBe(true);
      expect((await ZF.zweifaktorStand(laden(), BZ.rollenZweifaktorId(CODES.neuHash(b.code)))).aktiv,
        "kein Faktor am verbrauchten Code").toBe(false);

      /* Ohne Code aus der App: keine Arbeitssitzung (keine Aussperrung, aber auch keine Umgehung). */
      const ohne = await betrieb(b.raum, keks);
      expect(ohne.status, ohne.text).toBe(403);
      expect(ohne.d.fehler).toBe("zweifaktor-erforderlich");
      expect(ohne.d.token).toBeUndefined();
      expect(await arbeitsSitzungen()).toBe(vorher);

      /* Falscher Code. */
      const falsch = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) === "000000" ? "111111" : "000000" });
      expect(falsch.status, falsch.text).toBe(403);
      expect(falsch.d.fehler).toBe("zweifaktor-falsch");
      expect(falsch.d.token).toBeUndefined();
      weiter();

      /* Richtiger Code: Arbeitssitzung als Leitung, die unter Pflicht weiterarbeiten darf. */
      const ok = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) });
      expect(ok.status, ok.text).toBe(200);
      expect(ok.d.rolle).toBe("leitung");
      expect(typeof ok.d.token).toBe("string");
      const gelesen = await bestandLesen(ok.d.token);
      expect(gelesen.status, gelesen.roh).toBe(200);
      const sitz = await sitzungenStore().get(`t:${S.sitzungsSchluessel ? S.sitzungsSchluessel(ok.d.token).slice(2) : ""}`,
        { type: "json" }).catch(() => null);
      if (sitz) expect(sitz.zweifaktor).toBe(true);

      /* Derselbe Code gilt nur einmal (Wiedergabe). */
      const nochmal = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) });
      expect(nochmal.status, nochmal.text).toBe(403);
      expect(nochmal.d.token).toBeUndefined();
      weiter();

      /* Ein Wiederherstellungscode gilt einmal als zweiter Faktor, danach nicht mehr. */
      const wh = f.wiederherstellung[0];
      const mitWh = await betrieb(b.raum, keks, { zweifaktor: wh });
      expect(mitWh.status, mitWh.text).toBe(200);
      const whNochmal = await betrieb(b.raum, keks, { zweifaktor: wh });
      expect(whNochmal.status, whNochmal.text).toBe(403);
    } finally { pflichtAus(); }
  }, LIMIT);

  it("der verbrauchte Ersteinrichtungscode wirkt nie als Anmeldung — weder allein, noch mit Faktor, noch später", async () => {
    const b = await betriebMitCode("opt1f-verbraucht@example.org");
    pflichtAn();
    try {
      const f = await einrichten(b.code);
      const unbekannt = await zugangscode({ zugangscode: `${b.code.slice(0, -4)}XXXX` });
      for (const [was, rumpf] of [
        ["Code allein", { zugangscode: b.code }],
        ["Code mit Faktor", { zugangscode: b.code, zweifaktor: totp(f.geheimnis) }],
        ["zweite Einrichtung", { zugangscode: b.code, zweifaktorAktion: "beginnen" }],
        ["Abschalten", { zugangscode: b.code, zweifaktorAktion: "abschalten", zweifaktor: totp(f.geheimnis) }],
      ]) {
        const r = await zugangscode(rumpf);
        expect(r.status, `${was}: ${r.roh}`).toBe(401);
        expect(r.fehler, was).toBe(unbekannt.fehler);
        expect(r.token, was).toBeUndefined();
        weiter();
      }
      uhr(new Date(b.bis).getTime() + 48 * 3600000);
      const spaet = await zugangscode({ zugangscode: b.code, zweifaktor: totp(f.geheimnis) });
      expect(spaet.status, spaet.roh).toBe(401);
      expect(spaet.token).toBeUndefined();
      uhr(T0 + 60 * 60000);
    } finally { pflichtAus(); }
  }, LIMIT);

  it("ohne Pflichtschalter: ein Konto mit Faktor fällt nie auf das Passwort allein zurück", async () => {
    const b = await betriebMitCode("opt1f-herunterstufen@example.org");
    pflichtAn();
    let f;
    try { f = await einrichten(b.code); } finally { pflichtAus(); }
    const keks = await anmelden(b.email);
    const vorher = await arbeitsSitzungen();
    const ohne = await betrieb(b.raum, keks);
    expect(ohne.status, ohne.text).toBe(403);
    expect(ohne.d.fehler).toBe("zweifaktor-erforderlich");
    expect(await arbeitsSitzungen()).toBe(vorher);
    const falsch = await betrieb(b.raum, keks, { zweifaktor: "000000" });
    expect(falsch.d.fehler).toBe("zweifaktor-falsch");
    const ok = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) });
    expect(ok.status, ok.text).toBe(200);
    weiter();
  }, LIMIT);

  it("Annahme A3: ohne Pflichtschalter und ohne Faktor am Konto bleibt es beim bisherigen Verhalten (Passwort allein)", async () => {
    const b = await betriebMitCode("opt1f-ohne@example.org");
    const keks = await anmelden(b.email);
    const e = await betrieb(b.raum, keks);
    expect(e.status, e.text).toBe(200);
    expect(e.d.rolle).toBe("leitung");
  }, LIMIT);
});

/* ==========================================================================
   MISSBRAUCH: kein Umgehen, keine Übertragung, keine Einrichtung aus der Kontositzung
   ========================================================================== */

describe("OPT-1-F: Missbrauchs- und Negativfälle", () => {
  it("aus einer Kontositzung lässt sich kein Faktor einrichten oder umgehen (Rumpffelder wirken nicht)", async () => {
    const b = await betriebMitCode("opt1f-einrichten@example.org");
    pflichtAn();
    try {
      const keks = await anmelden(b.email);
      const vorher = await arbeitsSitzungen();
      for (const extra of [
        { zweifaktorAktion: "beginnen" }, { zweifaktorAktion: "bestaetigen", zweifaktor: "123456" },
        { zweifaktorAktion: "abschalten" }, { rolle: "leitung", person: "x", accountId: b.accountId, zweiterFaktor: true,
          zweifaktorErledigt: true, faktorPflicht: false },
      ]) {
        const r = await betrieb(b.raum, keks, extra);
        expect(r.status, r.text).toBe(403);
        expect(r.d.token).toBeUndefined();
        weiter();
      }
      expect((await ZF.zweifaktorStand(laden(), BZ.kontoZweifaktorId(b.accountId))).aktiv).toBe(false);
      expect((await ZF.zweifaktorStand(laden(), BZ.kontoZweifaktorId(b.accountId))).ausstehend).toBe(false);
      expect(await arbeitsSitzungen()).toBe(vorher);
    } finally { pflichtAus(); }
  }, LIMIT);

  it("der Faktor gehört dem Konto: ein anderes Konto kommt mit fremdem Code nicht hinein und erfährt nichts", async () => {
    const a = await betriebMitCode("opt1f-konto-a@example.org");
    const z = await betriebMitCode("opt1f-konto-b@example.org");
    pflichtAn();
    try {
      const fa = await einrichten(a.code);
      const keksZ = await anmelden(z.email);
      /* Z hat keinen Faktor; der Code von A hilft ihm nicht — Pflicht, wie ohne Code. */
      const r = await betrieb(z.raum, keksZ, { zweifaktor: totp(fa.geheimnis) });
      expect(r.status, r.text).toBe(403);
      expect(r.d.fehler).toBe("zweifaktor-pflicht");
      expect(r.d.token).toBeUndefined();
      weiter();
      /* Z öffnet auch A's Betrieb nicht: dieselbe Absage wie für einen Raum, den es nicht gibt. */
      const fremd = await betrieb(a.raum, keksZ, { zweifaktor: totp(fa.geheimnis) });
      const gibtEsNicht = await betrieb("opt1f-gibt-es-nicht", keksZ, { zweifaktor: totp(fa.geheimnis) });
      expect(fremd.status).toBe(403);
      expect(fremd.d).toEqual(gibtEsNicht.d);
      expect(fremd.d.token).toBeUndefined();
    } finally { pflichtAus(); }
  }, LIMIT);

  it("keine Konto-Enumeration: unbekannte Adresse und falsches Passwort antworten gleich, der Faktor spielt dort keine Rolle", async () => {
    const b = await betriebMitCode("opt1f-enum@example.org");
    pflichtAn();
    try { await einrichten(b.code); } finally { pflichtAus(); }
    const falschesPw = await konto({ pfad: "/api/account/anmelden", rumpf: { email: b.email, passwort: "Falsches Passwort 99", zweifaktor: "123456" } });
    const unbekannt = await konto({ pfad: "/api/account/anmelden", rumpf: { email: "opt1f-niemand@example.org", passwort: "Falsches Passwort 99", zweifaktor: "123456" } });
    expect(falschesPw.status).toBe(unbekannt.status);
    expect(falschesPw.d).toEqual(unbekannt.d);
    expect(falschesPw.keks).toBeFalsy();
    /* Auch mit richtigem Passwort verrät die Anmeldung nichts über den Faktor: Er wird erst bei der Betriebsauswahl gefragt. */
    const richtig = await konto({ pfad: "/api/account/anmelden", rumpf: { email: b.email, passwort: GUT } });
    expect(richtig.status).toBe(200);
    expect(richtig.d).toEqual({ ok: true, angemeldet: true });
  }, LIMIT);

  it("Bremse: fünf falsche Codes, dann 429 — auch der richtige Code hilft in der Sperre nicht; GRENZEN.zweifaktor unverändert", async () => {
    /* Die Werte, die vor OPT-1-F galten; dieses Paket ändert sie nicht. */
    expect(SCH.GRENZEN.zweifaktor).toMatchObject({ versuche: 5, fenster: 300, sperre: 900, steigend: true });
    const b = await betriebMitCode("opt1f-bremse@example.org");
    pflichtAn();
    let f;
    try { f = await einrichten(b.code); } finally { pflichtAus(); }
    const keks = await anmelden(b.email);
    const von = "10.99.0.1";
    const stati = [];
    for (let i = 0; i < 5; i++) {
      const r = await betrieb(b.raum, keks, { zweifaktor: "000000" }, von);
      stati.push(r.status);
      expect(r.d.fehler).toBe("zweifaktor-falsch");
    }
    expect(stati).toEqual([403, 403, 403, 403, 403]);
    const gebremst = await betrieb(b.raum, keks, { zweifaktor: "000000" }, von);
    expect(gebremst.status, gebremst.text).toBe(429);
    expect(Number(gebremst.kopf.get("retry-after"))).toBeGreaterThan(0);
    /* Der richtige Code während der Sperre: abgewiesen, keine Arbeitssitzung (keine Umgehung der Bremse). */
    const vorher = await arbeitsSitzungen();
    const richtig = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) }, von);
    expect(richtig.status, richtig.text).toBe(429);
    expect(richtig.d.token).toBeUndefined();
    expect(await arbeitsSitzungen()).toBe(vorher);
    /* Die Sperre hängt am Faktor des Kontos, nicht nur an der Herkunft: von einer anderen Adresse ebenfalls gebremst. */
    const andere = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) }, "10.99.0.2");
    expect(andere.status, andere.text).toBe(429);
  }, LIMIT);

  it("ohne Pfeffer lässt sich der Faktor nicht prüfen: keine Sitzung (fail-closed)", async () => {
    const b = await betriebMitCode("opt1f-pfeffer@example.org");
    pflichtAn();
    let f;
    try { f = await einrichten(b.code); } finally { pflichtAus(); }
    const keks = await anmelden(b.email);
    const vorher = await arbeitsSitzungen();
    delete process.env.CENTRIC_PFEFFER;
    try {
      const r = await betrieb(b.raum, keks, { zweifaktor: totp(f.geheimnis) });
      expect(r.status, r.text).not.toBe(200);
      expect(r.d.token).toBeUndefined();
      expect(await arbeitsSitzungen()).toBe(vorher);
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
    weiter();
  }, LIMIT);

  it("ein Konto ohne Mitgliedschaft in diesem Raum erfährt nichts über Faktor oder Betrieb (gleiche Absage, auch mit Code)", async () => {
    const a = await betriebMitCode("opt1f-nm-a@example.org");
    const fremd = await betriebMitCode("opt1f-nm-b@example.org");
    pflichtAn();
    try {
      await einrichten(a.code);
      const keksFremd = await anmelden(fremd.email);
      const ohneCode = await betrieb(a.raum, keksFremd);
      const mitCode = await betrieb(a.raum, keksFremd, { zweifaktor: "123456" });
      const keinRaum = await betrieb("opt1f-raum-fehlt", keksFremd, { zweifaktor: "123456" });
      expect(ohneCode.d).toEqual(keinRaum.d);
      expect(mitCode.d).toEqual(keinRaum.d);
      expect(ohneCode.status).toBe(403);
    } finally { pflichtAus(); }
  }, LIMIT);
});

/* ==========================================================================
   FOLGEKETTE: Rollenfaktor in der Arbeitssitzung aus dem Konto (Einladungen)
   ========================================================================== */

describe("OPT-1-F: frischer Faktor einer Kontositzung", () => {
  it("rollenFaktorFrisch und rollenFaktorEingerichtet kennen den Faktor des Kontos; ohne Faktor: nein", async () => {
    const b = await betriebMitCode("opt1f-frisch@example.org");
    pflichtAn();
    let f;
    try {
      /* Vorher: kein Faktor am Konto. */
      const sitzungOhne = { herkunft: { art: "account", accountId: b.accountId }, rolle: "leitung" };
      expect(await BZ.rollenFaktorEingerichtet({ store: laden(), sitzung: sitzungOhne })).toBe(false);
      const nein = await BZ.rollenFaktorFrisch({ store: laden(), k: "t:frisch-0", sitzung: sitzungOhne, code: "123456" });
      expect(nein.ok).toBe(false);
      f = await einrichten(b.code);
      expect(await BZ.rollenFaktorEingerichtet({ store: laden(), sitzung: sitzungOhne })).toBe(true);
      const falsch = await BZ.rollenFaktorFrisch({ store: laden(), k: "t:frisch-1", sitzung: sitzungOhne, code: "000000" });
      expect(falsch.ok).toBe(false);
      const ok = await BZ.rollenFaktorFrisch({ store: laden(), k: "t:frisch-2", sitzung: sitzungOhne, code: totp(f.geheimnis) });
      expect(ok.ok, JSON.stringify(ok)).toBe(true);
      /* Eine Sitzung, die nur behauptet, aus einem Konto zu kommen, ohne passende Art: kein Faktor. */
      const gefaelscht = { herkunft: { art: "zugangscode", accountId: b.accountId } };
      expect(await BZ.rollenFaktorEingerichtet({ store: laden(), sitzung: gefaelscht })).toBe(false);
      const g = await BZ.rollenFaktorFrisch({ store: laden(), k: "t:frisch-3", sitzung: gefaelscht, code: totp(f.geheimnis, 1) });
      expect(g.ok).toBe(false);
    } finally { pflichtAus(); }
  }, LIMIT);
});

/* ==========================================================================
   BLOCKER 3: Aufrufer übergibt ersteinrichtung:true
   ========================================================================== */

describe("OPT-1-F: die Übergabe von ersteinrichtung:true", () => {
  it("testbetriebMitErsteinrichtung liefert immer einen kontogebundenen Code, gespeichert nur als Hash", async () => {
    const b = await betriebMitCode("opt1f-wrapper@example.org");
    const eintrag = await K.kontoLesenStreng(laden(), CODES.neuHash(b.code));
    expect(eintrag).toMatchObject({ bestand: b.raum, rolle: "leitung", kontoId: b.accountId });
    expect(E.ersteinrichtungGueltig(eintrag, b.code, jetzt)).toBe(true);
    for (const x of b.pf.briefe) expect(x.text).not.toContain(b.code);
  }, LIMIT);

  it("die Wiederaufnahme eines unterbrochenen Vorgangs liefert den Code ebenfalls (sonst wäre die Leitung unter Pflicht ausgesperrt)", async () => {
    const s = laden();
    const pf = postfach();
    const email = "opt1f-wieder@example.org";
    const start = await R.registrierungStarten(s, { ...PROFIL, email, versand: pf.versand });
    expect(start.ok).toBe(true);
    const v = await R.emailVerifizieren(s, { token: tokenAus(pf.briefe[pf.briefe.length - 1].text) });
    await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
    /* Erster Lauf ohne Code (wie ein älterer Aufrufer), dann den Verbrauch zurücknehmen: ein Abbruch vor dem letzten Schritt. */
    const e = await P.testbetriebFuerAccountAnlegen(s, sitzungenStore(), { accountId: v.accountId, jetzt: () => jetzt });
    expect(e.ok, e.grund).toBe(true);
    await A.accountAendern(s, v.accountId, { testbetriebVerbrauchtAm: null, testbetriebOffenSeit: new Date(jetzt).toISOString() });
    const wieder = await P.testbetriebMitErsteinrichtung(s, sitzungenStore(), { accountId: v.accountId, jetzt: () => jetzt });
    expect(wieder.ok, wieder.grund).toBe(true);
    expect(wieder.wiederaufgenommen).toBe(true);
    expect(wieder.raum).toBe(e.raum);
    expect(typeof (wieder.ersteinrichtung || {}).code).toBe("string");
    const eintrag = await K.kontoLesenStreng(s, CODES.neuHash(wieder.ersteinrichtung.code));
    expect(eintrag).toMatchObject({ bestand: e.raum, rolle: "leitung", kontoId: v.accountId });
    expect(E.ersteinrichtungGueltig(eintrag, wieder.ersteinrichtung.code, jetzt)).toBe(true);
  }, LIMIT);

  it("kein Aufruf von testbetriebFuerAccountAnlegen in server/ außer über den Einstieg mit Ersteinrichtung", async () => {
    const treffer = [];
    const lauf = async (dir) => {
      for (const d of await readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) { await lauf(p); continue; }
        if (!/\.(mjs|js)$/.test(d.name)) continue;
        const t = await readFile(p, "utf8");
        const ohneKommentare = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        if (/testbetriebFuerAccountAnlegen\s*\(/.test(ohneKommentare)) treffer.push(path.relative(process.cwd(), p));
      }
    };
    await lauf(path.join(process.cwd(), "server"));
    /* Erlaubt: die Definition und der Einstieg selbst. */
    expect(treffer).toEqual(["server/lib/provisionierung.mjs"]);
    const t = await readFile(path.join(process.cwd(), "server/lib/provisionierung.mjs"), "utf8");
    const aufrufe = t.match(/testbetriebFuerAccountAnlegen\s*\(/g) || [];
    /* Definition + genau ein Aufruf (im Einstieg), und der übergibt ersteinrichtung: true. */
    expect(aufrufe.length).toBe(2);
    const stelle = t.slice(t.indexOf("return testbetriebFuerAccountAnlegen("));
    expect(stelle.slice(0, stelle.indexOf("});") + 3)).toContain("ersteinrichtung: true");
  });
});

/* ==========================================================================
   BLOCKER 4 über den echten Handler: eine misslungene Aktivierung verbrennt den Code nicht
   ========================================================================== */

describe("OPT-1-F: Transaktion der Einrichtung über den Handler", () => {
  it("ein halbes Einlösen (Faktor nicht aktiv) lässt den Code offen; die Einrichtung gelingt beim nächsten Versuch", async () => {
    const b = await betriebMitCode("opt1f-transaktion@example.org");
    const s = laden();
    const schl = CODES.neuHash(b.code);
    /* Der Fehlschlag nach dem Verbrauch, ohne dass ein Faktor aktiv wird. */
    const r = await E.ersteinrichtungEinloesen(s, [schl], async () => ({ fehler: "code" }),
      { istAktiv: async () => (await ZF.zweifaktorStand(s, BZ.kontoZweifaktorId(b.accountId))).aktiv });
    expect(r.zurueckgenommen).toBe(true);
    const f = await einrichten(b.code);
    expect(typeof f.geheimnis).toBe("string");
    expect((await ZF.zweifaktorStand(s, BZ.kontoZweifaktorId(b.accountId))).aktiv).toBe(true);
    const nach = await K.kontoLesenStreng(s, schl);
    expect(nach.ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
  }, LIMIT);
});
