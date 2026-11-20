/* ==========================================================================
   EINLADUNG UND INSTALLATIONSWEITE GRENZE (Abnahme V4, A-2 globale Grenze)

   Befund (Review zu #277): Mit der Einladungsbremse je Person füllten
   GELUNGENE Einladungen die installationsweite Grenze von `zugaenge`
   (40 je 10 Minuten, `v:zugaenge:gesamt:*`). Eine Leitung (oder die Altrolle
   kunde) mit 40 erneuten Einladungen derselben Person sperrte danach jeden
   anderen Betrieb (429), den Betreiber (/api/zugaenge) und das Zurückziehen
   verlorener Zugänge (zugang-sperren) — wiederholbar in jedem Fenster.

   Geprüft über die echten Handler (einladung.mjs, daten.mjs) mit
   Wegwerfablage und den ECHTEN Grenzen. Nur erfundene Testdaten.
   Vor der Behebung rot: (a) „Betrieb B lädt weiter ein …“ (B: 429) und
   „Betreiber und Sperren bleiben erreichbar“ (429), Parallelprüfung P1
   (eine Person trug bis zu 40 statt 11 Versuche zur Gesamtgrenze bei).
   Restrisiko S-1: docs/acc45/ABNAHME-V4-A2-GLOBALE-GRENZE.md.

   Aufruf: npx vitest run pruefungen/einladung-global-grenze.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 300000, hookTimeout: 300000 });

const WIRT = "127.0.0.1:3000";
const A = "gg-raum-a", B = "gg-raum-b", C = "gg-raum-c", P = "gg-raum-p", Q = "gg-raum-q", NEU = "gg-raum-neu";
const OP = "GGOP-BTRB-0001";
let wurzel, laden, takt, daten, einladung, kontoSchreiben, ablageSchluessel, Bst, schutz;
let nr = 0;

const kopfFuer = (token, xff) => {
  nr += 1;
  const k = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
    "x-forwarded-for": xff || `10.77.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (token) k.authorization = `Bearer ${token}`;
  return k;
};
const anfrage = async (handler, pfad, { rumpf, token, xff, methode = "POST" } = {}) => {
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopfFuer(token, xff),
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

const person = (id, rolle) => ({ id, vorname: `T${id}`, nachname: `P${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id, personen) => ({ id, name: `Testbetrieb ${id}`, status: "aktiv", tarif: "pro",
  einheiten: [{ id: "e1" }], standorte: [], dienstarten: [{ id: "F", name: "F" }], personen,
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [], abwesenheiten: [] });
const bestand = (m, personen) => ({ version: 9, stand: 1, session: null, mandanten: [betrieb(m, personen)] });
const ziele = (praefix, n) => Array.from({ length: n }, (_, i) => person(`${praefix}${String(i + 1).padStart(2, "0")}`, "mitarbeiter"));

/** Konto anlegen und anmelden; liefert das Sitzungsmerkmal. */
async function sitzung(raum, code, rolle, personId, mandantId, extra = {}) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Test", bestand: raum, rolle, person: personId,
    betrieb: 0, mandantId, demo: false, angelegt: "2026-01-01T00:00:00.000Z", ...extra });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, `${code}: ${a.roh}`).toBeTruthy();
  return a.token;
}
/** Nur ein Konto (Ziel einer Sperrung). */
const konto = (raum, code, rolle, personId, mandantId) => kontoSchreiben(laden(), ablageSchluessel(code),
  { name: "Ziel", bestand: raum, rolle, person: personId, betrieb: 0, mandantId, demo: false, angelegt: "2026-01-01T00:00:00.000Z" });

/** `seit` zurückdatieren (10 min): Danach verlangt das Ausstellen einen Nachweis; für das Sperren bleibt sie frisch (< 20 min). */
async function altern(token, minuten = 10) {
  const { sitzungsSpeicher, sitzungsSchluessel } = await import("../server/lib/sitzungen.mjs");
  const sp = sitzungsSpeicher();
  const s = await sp.get(sitzungsSchluessel(token), { type: "json" });
  await sp.setJSON(sitzungsSchluessel(token), { ...s, seit: Date.now() - minuten * 60 * 1000 });
}

const einladen = (token, rumpf, xff) => anfrage(einladung, "/api/einladung", { token, rumpf, xff });
const sperren = (token, rumpf, xff) => anfrage(daten, "/api/zugang-sperren", { token, rumpf, xff });
const anzahl = async (praefix) => (await takt().list({ prefix: praefix })).blobs.length;
const rateGesamt = () => anzahl("v:einladung-nachweis:gesamt:");
const zugaengeGesamt = () => anzahl("v:zugaenge:gesamt:");
/** Nur die gleitenden Vermerke von Ziel und Gesamt (keine Sperren, keine Zähler je Person). */
async function dimensionenLeeren() {
  for (const p of ["v:einladung-nachweis:gesamt:", "v:einladung-nachweis:ziel:", "v:zugaenge:gesamt:"]) {
    const { blobs } = await takt().list({ prefix: p });
    for (const b of blobs) await takt().delete(b.key);
  }
}
async function betreiberSitzung() {
  const l = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: OP } });
  expect(l.token, l.roh).toBeTruthy();
  return l.token;
}
let neuNr = 0;
async function betreiberLegtAn(token) {
  const raum = `${NEU}-${++neuNr}`;
  await Bst.bestandSchreiben(laden(), raum, bestand(`m-neu-${neuNr}`, [person("nl", "leitung")]), { durch: "Pruefung" });
  return anfrage(daten, "/api/zugaenge", { token, rumpf: { bestand: raum, eintraege: [{ rolle: "leitung", personId: "nl" }] } });
}

const T = {};
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-einladung-global-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-global-0123456789";
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  takt = () => getStore({ name: "centric-takt", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  /* Die echten Grenzen — nichts wird angehoben. */
  expect(schutz.WEITERE.zugaenge.gesamt).toMatchObject({ versuche: 40, fenster: 600 });
  expect(schutz.WEITERE["einladung-nachweis"].gesamt).toMatchObject({ versuche: 40, fenster: 600 });
  expect(schutz.GRENZEN["einladung-nachweis"]).toMatchObject({ versuche: 10, sperre: 1800, steigend: true });
  expect(schutz.GRENZEN["zugang-sperren"]).toMatchObject({ versuche: 10, sperre: 1800, steigend: true });
  expect(schutz.WEITERE["zugang-sperren"]).toBeUndefined();
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einladung = (await import("../server/funktionen/einladung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  Bst = await import("../server/lib/bestand.mjs");
  const leitungen = (p, n) => Array.from({ length: n }, (_, i) => person(`${p}${i + 1}`, "leitung"));
  await Bst.bestandSchreiben(laden(), A, bestand("m-a", [...leitungen("al", 8), person("ak1", "kunde"),
    person("ap", "planer"), person("as", "subplaner"), person("am", "mitarbeiter"), person("ar", "betriebsrat"),
    person("ad", "leitung"), ...ziele("ax", 20)]), { durch: "Pruefung" });
  await Bst.bestandSchreiben(laden(), B, bestand("m-b", [...leitungen("bl", 3), ...ziele("bx", 30)]), { durch: "Pruefung" });
  await Bst.bestandSchreiben(laden(), C, bestand("m-c", [...leitungen("cl", 3), person("ck1", "kunde"), ...ziele("cx", 5)]),
    { durch: "Pruefung" });
  await Bst.bestandSchreiben(laden(), P, bestand("m-p", [...leitungen("pl", 5), ...ziele("px", 3)]), { durch: "Pruefung" });
  await Bst.bestandSchreiben(laden(), Q, bestand("m-q", [...leitungen("ql", 5), ...ziele("qx", 3)]), { durch: "Pruefung" });
  await kontoSchreiben(laden(), ablageSchluessel(OP), { name: "Betreiber", bestand: "gg-betreiber", rolle: "betreiber",
    person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  for (let i = 1; i <= 8; i++) T[`al${i}`] = await sitzung(A, `GGA${i}-LEIT-000${i}`, "leitung", `al${i}`, "m-a");
  T.ak1 = await sitzung(A, "GGAK-KUND-0001", "kunde", "ak1", "m-a");
  T.ap = await sitzung(A, "GGAP-PLAN-0001", "planer", "ap", "m-a");
  T.as = await sitzung(A, "GGAS-SUBP-0001", "subplaner", "as", "m-a");
  T.am = await sitzung(A, "GGAM-MITA-0001", "mitarbeiter", "am", "m-a");
  T.ar = await sitzung(A, "GGAR-BRAT-0001", "betriebsrat", "ar", "m-a");
  T.ad = await sitzung(A, "GGAD-DEMO-0001", "leitung", "ad", "m-a", { demo: true, gruppe: "g" });
  for (let i = 1; i <= 3; i++) T[`bl${i}`] = await sitzung(B, `GGB${i}-LEIT-000${i}`, "leitung", `bl${i}`, "m-b");
  for (let i = 1; i <= 3; i++) T[`cl${i}`] = await sitzung(C, `GGC${i}-LEIT-000${i}`, "leitung", `cl${i}`, "m-c");
  T.ck1 = await sitzung(C, "GGCK-KUND-0001", "kunde", "ck1", "m-c");
  for (let i = 1; i <= 5; i++) T[`pl${i}`] = await sitzung(P, `GGP${i}-LEIT-000${i}`, "leitung", `pl${i}`, "m-p");
  for (let i = 1; i <= 5; i++) T[`ql${i}`] = await sitzung(Q, `GGQ${i}-LEIT-000${i}`, "leitung", `ql${i}`, "m-q");
  /* Ziele für Sperrungen: Zugänge von Beschäftigten in A und B. */
  for (let i = 1; i <= 9; i++) {
    await konto(A, `GGZA-ZIEL-000${i}`, "mitarbeiter", `ax0${i}`, "m-a");
    await konto(B, `GGZB-ZIEL-000${i}`, "mitarbeiter", `bx0${i}`, "m-b");
  }
}, 300000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("(a) eine Leitung mit 60 Einladungen sperrt niemanden außer sich selbst", () => {
  it("60× dieselbe Person: 30 × 200, dann 429 nur für sie; nichts landet in einer installationsweiten Grenze", async () => {
    const st = [];
    for (let i = 0; i < 60; i++) st.push((await einladen(T.al1, { personId: "ax11" })).status);
    expect(st.slice(0, 30).every((s) => s === 200), JSON.stringify(st)).toBe(true);
    expect(st.slice(30).every((s) => s === 429), JSON.stringify(st)).toBe(true);
    expect(await rateGesamt()).toBe(0);
    expect(await zugaengeGesamt()).toBe(0);
  });

  it("Betrieb B lädt weiter ein — ohne und mit Nachweis", async () => {
    expect((await einladen(T.bl1, { personId: "bx11" })).status).toBe(200);
    await altern(T.bl2);
    const r = await einladen(T.bl2, { personId: "bx12", bestaetigung: { zugangscode: "GGB2-LEIT-0002" } });
    expect(r.status, r.roh).toBe(200);
  });

  it("eine zweite Leitung in A teilt das Betriebskontingent (40), nicht das von B", async () => {
    const st = [];
    for (let i = 0; i < 15; i++) st.push((await einladen(T.al2, { personId: "ax12" })).status);
    /* 30 von al1 + 10 von al2 = 40 je Betrieb; der Rest wartet — nur in Betrieb A. */
    expect(st.filter((s) => s === 200).length, JSON.stringify(st)).toBe(10);
    expect(st.slice(10).every((s) => s === 429)).toBe(true);
    expect((await einladen(T.bl1, { personId: "bx13" })).status).toBe(200);
  });

  it("Betreiber (/api/zugaenge, Übersicht) und Sperren in A und B bleiben erreichbar", async () => {
    const op = await betreiberSitzung();
    const z = await betreiberLegtAn(op);
    expect(z.status, z.roh).toBe(200);
    const u = await anfrage(daten, `/api/zugaenge-uebersicht?bestand=${A}`, { token: op, methode: "GET" });
    expect(u.status, u.roh).toBe(200);
    const sa = await sperren(T.al3, { code: "GGZA-ZIEL-0001" });
    expect(sa.status, sa.roh).toBe(200);
    expect(sa.gesperrt).toBe(1);
    const sb = await sperren(T.bl3, { code: "GGZB-ZIEL-0001" });
    expect(sb.status, sb.roh).toBe(200);
    expect(sb.gesperrt).toBe(1);
    const so = await sperren(op, { code: "GGZA-ZIEL-0002" });
    expect(so.status, so.roh).toBe(200);
    expect(so.gesperrt).toBe(1);
    /* Gesperrt heißt gesperrt: Der Code meldet niemanden mehr an. */
    expect((await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "GGZA-ZIEL-0001" } })).token).toBeFalsy();
  });
});

describe("(c) ein stimmender Nachweis leert weder die Gesamtgrenze noch fremde Zähler", () => {
  it("al4: 5 Fehlversuche; al5 bestätigt richtig → Gesamt/Raum unverändert, al4 nach 5 weiteren gesperrt", async () => {
    await dimensionenLeeren();
    await altern(T.al4); await altern(T.al5);
    for (let i = 0; i < 5; i++)
      expect((await einladen(T.al4, { personId: "ax13", bestaetigung: { zugangscode: `FALS-AL4A-${i}` } })).status).toBe(403);
    const vorG = await rateGesamt(), vorZ = await anzahl("v:einladung-nachweis:ziel:");
    expect(vorG).toBe(5);
    expect(vorZ).toBe(5);
    /* al5 hat noch Betriebskontingent? Nein (40 erschöpft) — der Nachweis wird trotzdem geprüft und entlastet nur al5. */
    const r = await einladen(T.al5, { personId: "ax14", bestaetigung: { zugangscode: "GGA5-LEIT-0005" } });
    expect([200, 429]).toContain(r.status);
    expect(await rateGesamt()).toBe(vorG);
    expect(await anzahl("v:einladung-nachweis:ziel:")).toBe(vorZ);
    const st = [];
    for (let i = 0; i < 6; i++)
      st.push((await einladen(T.al4, { personId: "ax13", bestaetigung: { zugangscode: `FALS-AL4B-${i}` } })).status);
    expect(st, JSON.stringify(st)).toEqual([403, 403, 403, 403, 403, 429]);
    /* Auch der eigene richtige Code hebt die Sperre nicht auf. */
    expect((await einladen(T.al4, { personId: "ax13", bestaetigung: { zugangscode: "GGA4-LEIT-0004" } })).status).toBe(429);
  });
});

describe("(b)/(d) viele Identitäten, Räume und Herkünfte umgehen den Rateschutz nicht", () => {
  it("Rollen ohne Rollenvergabe (auch Demo) erreichen keinen Nachweis und keinen Zähler — gleiche Antwort für richtig und falsch", async () => {
    await dimensionenLeeren();
    const vorher = await anzahl("v:einladung-nachweis:");
    for (const [rolle, code] of [["ap", "GGAP-PLAN-0001"], ["as", "GGAS-SUBP-0001"], ["am", "GGAM-MITA-0001"],
      ["ar", "GGAR-BRAT-0001"], ["ad", "GGAD-DEMO-0001"]]) {
      const richtig = await einladen(T[rolle], { personId: "ax15", bestaetigung: { zugangscode: code } }, "10.5.5.5");
      for (let i = 0; i < 30; i++) {
        const r = await einladen(T[rolle], { personId: "ax15", bestaetigung: { zugangscode: `FALS-${rolle}-${i}` } },
          `10.66.${i}.${i}`);
        expect(r.status, `${rolle} ${i}: ${r.roh}`).toBe(403);
        expect(r.roh).toBe(richtig.roh);
        expect(r.bestaetigung).toBeUndefined();
      }
    }
    expect(await anzahl("v:einladung-nachweis:")).toBe(vorher);
    expect(await anzahl("sperre:einladung-nachweis:")).toBe(1);   // nur al4 aus (c)
  });

  it("Leitungen und Altrolle kunde in zwei Räumen, rotierende Herkunft: je Person ≤ 10, je Raum ≤ 25, insgesamt ≤ 40 Prüfungen", async () => {
    await dimensionenLeeren();
    const geprueft = {};
    const raten = async (wer, raum) => {
      await altern(T[wer]);
      let n = 0, letzte = null;
      for (let i = 0; i < 40; i++) {
        const r = await einladen(T[wer], { personId: raum === A ? "ax16" : "cx01",
          bestaetigung: { zugangscode: `FALS-${wer}-${i}` } }, `10.${88 + i}.${i}.1`);
        if (r.status === 403) { n++; continue; }
        expect(r.status, r.roh).toBe(429);
        expect(r.wartet).toBeGreaterThan(0);
        letzte = r; break;
      }
      geprueft[wer] = { n, raum, letzte };
    };
    for (const wer of ["al6", "al7", "ak1"]) await raten(wer, A);
    for (const wer of ["cl1", "cl2", "ck1"]) await raten(wer, C);
    const summe = (raum) => Object.values(geprueft).filter((g) => !raum || g.raum === raum).reduce((s, g) => s + g.n, 0);
    for (const [wer, g] of Object.entries(geprueft)) expect(g.n, wer).toBeLessThanOrEqual(10);
    expect(summe(A)).toBeLessThanOrEqual(25);
    expect(summe(C)).toBeLessThanOrEqual(25);
    expect(summe(), JSON.stringify(geprueft)).toBeLessThanOrEqual(40);
    expect(await rateGesamt()).toBeLessThanOrEqual(40);
    /* Die erste Person lief in ihre eigene, steigende Sperre (30 min). */
    expect(geprueft.al6.n).toBe(10);
    expect(geprueft.al6.letzte.wartet).toBe(1800);
    /* Eine weitere Person, ein weiterer Raum, eine neue Herkunft: kein weiterer Rateversuch wird geprüft. */
    for (const [wer, xff] of [["cl3", "10.200.0.1"], ["bl1", "10.201.0.1"], ["bl1", "10.202.0.1"]]) {
      await altern(T[wer]);
      const r = await einladen(T[wer], { personId: "bx14", bestaetigung: { zugangscode: `FALS-NEU-${xff}` } }, xff);
      expect(r.status, `${wer}: ${r.roh}`).toBe(429);
    }
  });

  it("bei erschöpfter Rategrenze: Einladung ohne Nachweis, Betreiber und Sperren bleiben erreichbar (Restrisiko S-1: Nachweis wartet)", async () => {
    expect(await rateGesamt()).toBeGreaterThanOrEqual(40);
    /* S-1: auch ein stimmender Nachweis wartet, solange die Rategrenze voll ist. */
    const s1 = await einladen(T.bl2, { personId: "bx15", bestaetigung: { zugangscode: "GGB2-LEIT-0002" } });
    expect(s1.status, s1.roh).toBe(429);
    /* Frisch angemeldet (junge Sitzung) braucht es keinen Nachweis — das bleibt frei. */
    const frisch = await sitzung(B, "GGB2-LEIT-0002", "leitung", "bl2", "m-b");
    expect((await einladen(frisch, { personId: "bx15" })).status).toBe(200);
    const op = await betreiberSitzung();
    expect((await betreiberLegtAn(op)).status).toBe(200);
    expect((await sperren(T.al8, { code: "GGZA-ZIEL-0003" })).gesperrt).toBe(1);
    expect((await sperren(T.bl3, { code: "GGZB-ZIEL-0002" })).gesperrt).toBe(1);
    expect((await sperren(op, { code: "GGZB-ZIEL-0003" })).gesperrt).toBe(1);
  });
});

describe("Zurückziehen eines Zugangs: kein Unberechtigter sperrt oder blockiert", () => {
  it("Fluten durch Unberechtigte (ohne Sitzung, falsche Rollen, Demo, gefälschte Kennungen) zählt nirgends; A sperrt danach", async () => {
    const vorher = { sperren: await anzahl("v:zugang-sperren:"), zugaenge: await anzahl("v:zugaenge:"),
      sperreZ: await anzahl("sperre:zugang-sperren:") };
    for (let i = 0; i < 40; i++) {
      const ohne = await sperren(null, { code: "GGZA-ZIEL-0004" }, `10.150.${i}.1`);
      expect(ohne.status).toBe(403);
    }
    for (const wer of ["ap", "as", "am", "ar", "ak1", "ad"]) {
      for (let i = 0; i < 15; i++) {
        const r = await sperren(T[wer], { code: "GGZA-ZIEL-0004", kennung: "deadbeef", pruefsumme: "x".repeat(64) },
          `10.151.${i}.2`);
        expect(r.status, `${wer}: ${r.roh}`).toBe(403);
      }
    }
    /* Kein Zähler bewegt sich durch Unberechtigte. */
    expect(await anzahl("v:zugang-sperren:")).toBe(vorher.sperren);
    expect(await anzahl("v:zugaenge:")).toBe(vorher.zugaenge);
    expect(await anzahl("sperre:zugang-sperren:")).toBe(vorher.sperreZ);
    /* Das Ziel ist noch aktiv: meldet an. */
    expect((await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "GGZA-ZIEL-0004" } })).token).toBeTruthy();
  });

  it("eine fremde Leitung (Betrieb B) sperrt in A nichts und verbraucht nur ihr eigenes Kontingent", async () => {
    const st = [];
    for (let i = 0; i < 15; i++) {
      const r = await sperren(T.bl1, { code: "GGZA-ZIEL-0004" }, `10.152.${i}.3`);
      st.push(r.status);
      if (r.status === 200) expect(r.gesperrt).toBe(0);
    }
    expect(st.filter((s) => s === 429).length, JSON.stringify(st)).toBeGreaterThan(0);
    /* A sperrt — B's Sperre berührt A nicht; der Zugang war bis hierher aktiv. */
    const a = await sperren(T.al8, { code: "GGZA-ZIEL-0004" });
    expect(a.status, a.roh).toBe(200);
    expect(a.gesperrt).toBe(1);
  });

  it("bei erschöpfter Herkunftsgrenze (Anmelden/Einlösen) sperren Leitung und Betreiber aus derselben Herkunft", async () => {
    const xff = "10.160.0.1";
    let zu = null;
    for (let i = 0; i < 20 && !zu; i++) {
      const r = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: `GANZ-FALS-${1000 + i}` }, xff });
      if (r.status === 429) zu = r;
    }
    expect(zu, "Herkunft gesperrt").toBeTruthy();
    expect((await anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: "z".repeat(43) }, xff })).status)
      .toBe(429);
    const op = await betreiberSitzung();
    expect((await sperren(T.al8, { code: "GGZA-ZIEL-0005" }, xff)).gesperrt).toBe(1);
    expect((await sperren(op, { code: "GGZA-ZIEL-0006" }, xff)).gesperrt).toBe(1);
  });
});

describe("(e) Einrichten eines Betriebs: 25 Einladungen in Folge", () => {
  it("Leitung in Raum P mit Nachweis (Ablauf der Oberfläche): 25 × 200", async () => {
    await dimensionenLeeren();
    const t = await sitzung(P, "GGP5-LEIT-0005", "leitung", "pl5", "m-p");
    await altern(t);
    for (let i = 0; i < 25; i++) {
      const frage = await einladen(t, { personId: "px01" });
      expect(frage.status).toBe(403);
      const r = await einladen(t, { personId: "px01", bestaetigung: { zugangscode: "GGP5-LEIT-0005" } });
      expect(r.status, `${i + 1}: ${r.roh}`).toBe(200);
    }
    expect(await rateGesamt()).toBe(0);
  });
});

describe("Parallelprüfung: Kontingente halten bei gleichzeitigen Anfragen", () => {
  it("P1: 100 gleichzeitige Fehlversuche einer Person → ≤ 10 geprüft, ≤ 11 in der Gesamtgrenze", async () => {
    await dimensionenLeeren();
    await altern(T.ql1);
    const alle = await Promise.all(Array.from({ length: 100 }, (_, i) =>
      einladen(T.ql1, { personId: "qx01", bestaetigung: { zugangscode: `PARA-FALS-${i}` } }, `10.170.${i}.1`)));
    const geprueft = alle.filter((r) => r.status === 403).length;
    expect(geprueft, JSON.stringify(alle.map((r) => r.status))).toBeLessThanOrEqual(10);
    expect(alle.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(90);
    expect(await rateGesamt()).toBeLessThanOrEqual(11);
  });

  it("P2: 8 Personen in zwei Räumen, je 12 gleichzeitig (96) → insgesamt ≤ 40, je Raum ≤ 25 geprüft", async () => {
    await dimensionenLeeren();
    const wer = [["pl1", P], ["pl2", P], ["pl3", P], ["pl4", P], ["ql2", Q], ["ql3", Q], ["ql4", Q], ["ql5", Q]];
    for (const [w] of wer) await altern(T[w]);
    const auftraege = [];
    for (const [w, raum] of wer) for (let i = 0; i < 12; i++)
      auftraege.push(einladen(T[w], { personId: raum === P ? "px02" : "qx02", bestaetigung: { zugangscode: `PAR2-${w}-${i}` } },
        `10.171.${auftraege.length}.1`).then((r) => ({ w, raum, status: r.status })));
    const alle = await Promise.all(auftraege);
    const geprueft = (f) => alle.filter((r) => r.status === 403 && f(r)).length;
    expect(geprueft(() => true), JSON.stringify(alle)).toBeLessThanOrEqual(40);
    expect(geprueft((r) => r.raum === P)).toBeLessThanOrEqual(25);
    expect(geprueft((r) => r.raum === Q)).toBeLessThanOrEqual(25);
    for (const [w] of wer) expect(geprueft((r) => r.w === w), w).toBeLessThanOrEqual(10);
    expect(await rateGesamt()).toBeLessThanOrEqual(40);
  });

  it("P3: 60 gleichzeitige Einladungen einer Leitung → höchstens 30 ausgestellt", async () => {
    const t = await sitzung(Q, "GGQ1-LEIT-0001", "leitung", "ql1", "m-q");
    const alle = await Promise.all(Array.from({ length: 60 }, () => einladen(t, { personId: "qx03" })));
    const ok = alle.filter((r) => r.status === 200).length;
    expect(ok, JSON.stringify(alle.map((r) => r.status))).toBeLessThanOrEqual(30);
    /* Im Schwarm zählt die Ablage auch die gleichzeitig gelandeten Vermerke mit — dann kann es auch 0 sein (strenger,
       nie lockerer); der Schwarm sperrt nur die eigene Person, Betrieb Q's übrige Leitungen nicht. */
    expect(alle.every((r) => r.status === 200 || r.status === 429)).toBe(true);
    const andere = await sitzung(Q, "GGQ2-LEIT-0002", "leitung", "ql2", "m-q");
    expect((await einladen(andere, { personId: "qx03" })).status).toBe(200);
  });
});
