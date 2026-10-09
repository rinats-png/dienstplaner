/* ==========================================================================
   SZENARIO — der echte Weg über die echten Handler, für die Prüfungen der
   Sitzungsbindung, der Rennen und des Aufräumens

   Nichts hier kennt eine Interna der Sitzungsverwaltung außer den
   Ablageschlüsseln, auf die die Prüfungen ausdrücklich schauen. Gearbeitet
   wird wie im Betrieb: anmelden (Cookie), Betrieb öffnen (Arbeitsmerkmal),
   dann Anfragen mit `authorization: Bearer …`. Dadurch laufen dieselben
   Prüfungen gegen den heutigen Code und gegen den Code nach dem Fix.

   Zeit: Die Uhr wird nur an `Date` gedreht (vi.useFakeTimers mit
   toFake: ["Date"]); Timer, Ein- und Ausgabe bleiben echt.
   ========================================================================== */

import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { expect, vi } from "vitest";

export const GUT = "Nordwind und Sonne 1846";
export const WIRT = "127.0.0.1:3000";
export const EIGEN = `http://${WIRT}`;
export const MINUTE = 60 * 1000;
export const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

let zaehler = 0;
const herkunft = () => `10.8.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;
export const adresse = (was) => `${was}-${++zaehler}@example.org`;

/** Die Uhr: nur `Date` ist falsch, alles andere läuft echt. */
export const uhr = {
  start(t = Date.now()) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(t); return t; },
  vor(ms) { vi.setSystemTime(Date.now() + ms); },
  ende() { vi.useRealTimers(); },
};

const person = (id, vorname, nachname, rolle) => ({
  id, vorname, nachname, rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE",
});

/**
 * Baut die Umgebung auf (Wegwerfordner, Umgebungsvariablen, Module) und gibt
 * alles zurück, was die Prüfungen brauchen. Muss in `beforeAll` laufen,
 * damit die Module erst NACH dem Setzen von CENTRIC_DATEN geladen werden.
 */
export async function aufbauen(name) {
  const wurzel = await mkdtemp(path.join(tmpdir(), `centric-${name}-`));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;

  const { getStore } = await import("../../server/lib/ablage.mjs");
  const anmeldungModul = await import("../../server/funktionen/anmeldung.mjs");
  const Z = {
    wurzel, getStore,
    KEKS: anmeldungModul.COOKIE,
    konto: anmeldungModul.default,
    daten: (await import("../../server/funktionen/daten.mjs")).default,
    kalender: (await import("../../server/funktionen/kalender.mjs")).default,
    lage: (await import("../../server/funktionen/lage.mjs")).default,
    zustellung: (await import("../../server/funktionen/zustellung.mjs")).default,
    A: await import("../../server/lib/accounts.mjs"),
    P: await import("../../server/lib/passwoerter.mjs"),
    S: await import("../../server/lib/sitzungen.mjs"),
    B: await import("../../server/lib/bestand.mjs"),
    K: await import("../../server/lib/konten.mjs"),
    AUF: await import("../../server/lib/aufraeumen.mjs"),
    AN: await import("../../server/lib/accountanmeldung.mjs"),
  };

  Z.laden = () => getStore({ name: "centric", consistency: "strong" });
  Z.ablageArbeit = () => getStore({ name: "centric-sitzungen", consistency: "strong" });
  Z.ablageKonto = () => getStore({ name: "centric-accountsitzungen", consistency: "strong" });
  Z.ablageTakt = () => getStore({ name: "centric-takt", consistency: "strong" });
  Z.ablageSpur = () => getStore({ name: "centric-spur" });
  Z.abbauen = () => rm(wurzel, { recursive: true, force: true });

  /** Die Bremse lebt in der Ablage und im Prozessspeicher: leeren. */
  Z.taktLeeren = async () => {
    const s = Z.ablageTakt();
    const { blobs } = await s.list({});
    for (const b of blobs) await s.delete(b.key).catch(() => {});
  };

  /** Eine Anfrage an die Account-Endpunkte (Cookie, eigener Origin). */
  Z.anfrageKonto = async ({ pfad, methode = "POST", rumpf = {}, keks = null } = {}) => {
    const kopf = { "x-forwarded-for": herkunft(), host: WIRT, origin: EIGEN };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (keks) kopf.cookie = `${Z.KEKS}=${keks}`;
    const req = new Request(`http://${WIRT}${pfad}`, {
      method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf) }),
    });
    const antwort = await Z.konto(req);
    let daten = null;
    try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
    return { antwort, status: antwort.status, daten };
  };

  /** Eine Anfrage mit Arbeitsmerkmal an einen der Anwendungspfade. */
  Z.bearer = async (handler, pfad, token, { methode = "GET", rumpf = null } = {}) => {
    const kopf = { host: WIRT, "x-forwarded-for": herkunft() };
    if (token) kopf.authorization = `Bearer ${token}`;
    if (methode !== "GET" && methode !== "HEAD") kopf["content-type"] = "application/json";
    const req = new Request(`http://${WIRT}${pfad}`, {
      method: methode, headers: kopf,
      ...(methode === "GET" || methode === "HEAD" ? {} : { body: JSON.stringify(rumpf || {}) }),
    });
    const antwort = await handler(req, {});
    let daten = null;
    try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
    return { status: antwort.status, daten };
  };

  const keksWert = (kopf) => {
    const m = new RegExp(`${Z.KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(String(kopf || ""));
    return m ? m[1] : null;
  };

  Z.anmelden = async (email, passwort = GUT) => {
    const e = await Z.anfrageKonto({ pfad: "/api/account/anmelden", rumpf: { email, passwort } });
    return { ...e, keks: keksWert(e.antwort.headers.get("set-cookie")) };
  };
  Z.abmelden = (keks) => Z.anfrageKonto({ pfad: "/api/account/abmelden", keks });
  Z.sitzungsstand = (keks) => Z.anfrageKonto({ pfad: "/api/account/sitzung", methode: "GET", keks });
  Z.betriebOeffnen = async (keks, raum) => {
    const e = await Z.anfrageKonto({ pfad: "/api/account/betrieb", rumpf: { raum }, keks });
    return { ...e, token: e.daten && e.daten.token };
  };

  Z.kontoAnlegen = async (email) => {
    const e = await Z.A.accountAnlegen(Z.laden(), { email });
    if (!e.ok) throw new Error(`Account nicht angelegt: ${e.grund}`);
    await Z.A.emailBestaetigen(Z.laden(), e.account.id);
    const g = await Z.A.passwortSetzen(Z.laden(), e.account.id, await Z.P.passwortAblegen(GUT));
    if (!g.ok) throw new Error("Passwort nicht gesetzt");
    return g.account;
  };

  Z.raum = (was) => `t-sb-${was}-${++zaehler}`;

  Z.betriebAnlegen = async (raum, { name = "Haus Probe", rolle = "leitung" } = {}) => {
    const e = await Z.B.bestandSchreiben(Z.laden(), raum, {
      version: 5,
      mandanten: [{ id: "m1", name, einheiten: [{ id: "e1", name: "Wohnbereich 1" }],
        personen: [person("p_1", "Rina", "Schmitt", rolle), person("p_2", "Jan", "Weber", "mitarbeiter")] }],
    }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
  };

  Z.mitgliedAnlegen = async (accountId, raum, rolle = "leitung", personId = "p_1") => {
    const e = await Z.A.mitgliedschaftAnlegen(Z.laden(), { accountId, raum, betrieb: 0,
      mandantId: "m1", person: personId, rolle, status: "aktiv" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
  };

  /** Konto, Betrieb, Mitgliedschaft, Anmeldung, Betriebsauswahl: der ganze Weg. */
  Z.arbeitsbereich = async (was, { rolle = "leitung" } = {}) => {
    const k = await Z.kontoAnlegen(adresse(was));
    const raum = Z.raum(was);
    await Z.betriebAnlegen(raum, { rolle });
    await Z.mitgliedAnlegen(k.id, raum, rolle);
    const a = await Z.anmelden(k.email);
    expect(a.status, `Anmeldung: ${JSON.stringify(a.daten)}`).toBe(200);
    const w = await Z.betriebOeffnen(a.keks, raum);
    expect(w.status, `Betrieb öffnen: ${JSON.stringify(w.daten)}`).toBe(200);
    expect(w.token, "Arbeitsmerkmal").toBeTruthy();
    return { k, raum, keks: a.keks, token: w.token };
  };

  /** Ein zweites Gerät desselben Kontos: eigene Anmeldung, eigenes Arbeitsmerkmal. */
  Z.zweitesGeraet = async (k, raum) => {
    const a = await Z.anmelden(k.email);
    expect(a.status).toBe(200);
    const w = await Z.betriebOeffnen(a.keks, raum);
    expect(w.status).toBe(200);
    return { keks: a.keks, token: w.token };
  };

  /** Eine Sitzung der alten Art (Zugangscode), ohne Anker. */
  Z.legacySitzung = (raum, { rolle = "leitung", person: p = "p_1", konto = "konto:abc" } = {}) =>
    Z.S.sitzungAnlegen({ bestand: raum, rolle, person: p, betrieb: 0, konto, name: "Alt Zugang" });

  /** Ein Zugangskonto (konto:<schluessel>), wie es /einrichten/zugaenge anlegt. */
  Z.zugangskonto = async (raum, { rolle = "leitung", person: p = "p_1" } = {}) => {
    const schluessel = randomBytes(16).toString("hex");
    await Z.K.kontoSchreiben(Z.laden(), schluessel, {
      name: "Zugang", bestand: raum, rolle, person: p, betrieb: 0, demo: false,
      gruppe: null, hinweis: null, angelegt: new Date().toISOString() });
    return schluessel;
  };

  /** Die vier Pfade, die ein Arbeitsmerkmal im Hauptpfad prüfen. */
  Z.HAUPTPFADE = [
    { name: "daten", ruf: (t) => Z.bearer(Z.daten, "/api/bestand", t) },
    { name: "kalender", ruf: (t) => Z.bearer(Z.kalender, "/kalender/einrichten", t,
      { methode: "POST", rumpf: { personId: "p_1" } }) },
    { name: "lage", ruf: (t) => Z.bearer(Z.lage, "/lage", t) },
    { name: "zustellung", ruf: (t) => Z.bearer(Z.zustellung, "/zustellung/anmelden", t,
      { methode: "POST", rumpf: { endpunkt: "https://example.org/p" } }) },
  ];

  /** Die fünf Pfade in daten.mjs, die vor dem Hauptpfad liegen und die Sitzung
      bisher roh lesen. Jeder wird mit einem Aufruf getroffen, der — wäre die
      Sitzung gültig — nicht an der Anmeldung scheitert. */
  Z.VORABPFADE = (raum) => [
    { name: "zugaenge", ruf: (t) => Z.bearer(Z.daten, "/api/zugaenge", t,
      { methode: "POST", rumpf: { bestand: raum, eintraege: [] } }) },
    { name: "raum-loeschen", ruf: (t) => Z.bearer(Z.daten, "/api/raum-loeschen", t,
      { methode: "POST", rumpf: { raum, wiederholung: raum } }) },
    { name: "zugaenge-uebersicht", ruf: (t) => Z.bearer(Z.daten, "/api/zugaenge-uebersicht", t) },
    { name: "zugang-sperren", ruf: (t) => Z.bearer(Z.daten, "/api/zugang-sperren", t,
      { methode: "POST", rumpf: { alleDesBetriebs: true } }) },
    { name: "bestand-anlegen", ruf: (t) => Z.bearer(Z.daten, "/api/bestand-anlegen", t,
      { methode: "POST", rumpf: { bestand: Z.raum("neu"), inhalt: { version: 5, mandanten: [] } } }) },
  ];

  return Z;
}

/** Der Ablageschlüssel einer Account-Sitzung zu einem Cookie-Merkmal. */
export const asSchluessel = (keks) => `as:${hash(keks)}`;
/** … und einer Arbeitssitzung zu einem Arbeitsmerkmal. */
export const tSchluessel = (token) => `t:${hash(token)}`;
export { mkdir };
