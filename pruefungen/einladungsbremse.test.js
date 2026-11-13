/* ==========================================================================
   EINLADUNGSBREMSE (Abnahme V4, Befund A-2)

   Befund: POST /api/einladung zählte JEDEN Aufruf vor der Rollenprüfung gegen
   `zugaenge` JE RAUM (10 je 10 Minuten, Sperre 30 Minuten steigend). Folgen:
     (a) Eine Leitung konnte beim Einrichten nur etwa zehn Personen einladen,
         danach 429 für mindestens 30 Minuten.
     (b) Absagen an Beschäftigte, SV oder Betriebsrat (403) verbrauchten das
         Kontingent mit — eine angemeldete Beschäftigte sperrte die
         Einladungen ihres Betriebs.

   Geprüft über die echten Handler (server/funktionen/einladung.mjs,
   daten.mjs für /api/anmelden und /api/abmelden) mit Wegwerfablage und den
   ECHTEN Grenzen (GRENZEN, WEITERE) — nur erfundene Testdaten.
   Vor der Behebung rot: „25 Einladungen in Folge“ (11. Aufruf 429) und
   „Hämmern anderer Rollen sperrt die Leitung nicht“ (Leitung 429).

   Aufruf: npx vitest run pruefungen/einladungsbremse.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });

const WIRT = "127.0.0.1:3000";
const RAUM = "bremse-a2-probe";
const RAUM2 = "bremse-a2-zweiter";
let wurzel, laden, takt, daten, einladung, kontoSchreiben, ablageSchluessel, B, schutz;
let nr = 0;

const anfrage = async (handler, pfad, { rumpf, token, xff } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
    "x-forwarded-for": xff || `10.42.${Math.floor(nr / 250)}.${nr % 250}` };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf,
    body: JSON.stringify(rumpf || {}) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

const person = (id, rolle) => ({ id, vorname: `Test${id}`, nachname: `Person${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const betrieb = (id, personen) => ({ id, name: `Testbetrieb ${id}`, status: "aktiv", tarif: "pro",
  einheiten: [{ id: "e1" }], standorte: [], dienstarten: [{ id: "F", name: "F" }], personen,
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [], abwesenheiten: [] });
const NEUE = Array.from({ length: 30 }, (_, i) => `n${String(i + 1).padStart(2, "0")}`);
const bestandA = () => ({ version: 9, stand: 1, session: null, mandanten: [betrieb("m-a", [
  person("al", "leitung"), person("al2", "leitung"), person("ap", "planer"), person("as", "subplaner"),
  person("am", "mitarbeiter"), person("ar", "betriebsrat"), person("ak", "kunde"),
  ...NEUE.map((id) => person(id, "mitarbeiter"))])] });
const bestandB = () => ({ version: 9, stand: 1, session: null, mandanten: [betrieb("m-b", [
  person("bl", "leitung"), person("bm", "mitarbeiter")])] });

async function sitzung(raum, code, rolle, personId, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Test", bestand: raum, rolle, person: personId,
    betrieb: 0, mandantId, demo: false, angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy();
  return a.token;
}

/** `seit` der Sitzung zurückdatieren: Danach verlangt der Server eine frische Bestätigung (B1). */
async function sitzungAltern(token, minuten = 10) {
  const { sitzungsSpeicher, sitzungsSchluessel } = await import("../server/lib/sitzungen.mjs");
  const sp = sitzungsSpeicher();
  const s = await sp.get(sitzungsSchluessel(token), { type: "json" });
  await sp.setJSON(sitzungsSchluessel(token), { ...s, seit: Date.now() - minuten * 60 * 1000 });
}

const einladen = (token, rumpf) => anfrage(einladung, "/api/einladung", { token, rumpf });
const kp = (raum, mandantId, personId) => schutz.kennungPerson({ bestand: raum, mandantId, person: personId });

/** Sperre einer Kennung als abgelaufen markieren (die Stufe bleibt) — wie nach 30 Minuten Warten. */
async function sperreAblaufen(art, kennung) {
  const s = await takt().get(`sperre:${art}:${kennung}`, { type: "json" });
  expect(s, "es steht eine Sperre").toBeTruthy();
  await takt().setJSON(`sperre:${art}:${kennung}`, { ...s, bis: Math.floor(Date.now() / 1000) - 1 });
}

/** Die Gesamtgrenze ist installationsweit (40 je 10 Minuten); die Szenarien hier teilen sich eine Ablage. */
async function gesamtLeeren() {
  const { blobs } = await takt().list({ prefix: "v:zugaenge:gesamt:" });
  for (const b of blobs) await takt().delete(b.key);
}
const gesamtStand = async () => (await takt().list({ prefix: "v:zugaenge:gesamt:" })).blobs.length;

const T = {};
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-einladungsbremse-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  takt = () => getStore({ name: "centric-takt", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  /* Nur die Anmeldung je Herkunft wird angehoben (die Sitzungen hier entstehen über viele Anmeldungen);
     die Grenzen der Einladung (zugaenge, schreiben, WEITERE.zugaenge) bleiben die echten. */
  expect(schutz.GRENZEN.zugaenge).toMatchObject({ versuche: 10, fenster: 600, sperre: 1800, steigend: true });
  expect(schutz.WEITERE.zugaenge.gesamt.versuche).toBe(40);
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einladung = (await import("../server/funktionen/einladung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestandA(), { durch: "Pruefung" });
  await B.bestandSchreiben(laden(), RAUM2, bestandB(), { durch: "Pruefung" });
  T.leitung = await sitzung(RAUM, "BRA1-LEIT-0001", "leitung", "al", "m-a");
  T.leitung2 = await sitzung(RAUM, "BRA2-LEIT-0002", "leitung", "al2", "m-a");
  T.planer = await sitzung(RAUM, "BRA3-PLAN-0003", "planer", "ap", "m-a");
  T.subplaner = await sitzung(RAUM, "BRA4-SUBP-0004", "subplaner", "as", "m-a");
  T.mitarbeiter = await sitzung(RAUM, "BRA5-MITA-0005", "mitarbeiter", "am", "m-a");
  T.betriebsrat = await sitzung(RAUM, "BRA6-BRAT-0006", "betriebsrat", "ar", "m-a");
  T.kunde = await sitzung(RAUM, "BRA7-KUND-0007", "kunde", "ak", "m-a");
  T.leitungB = await sitzung(RAUM2, "BRB1-LEIT-0001", "leitung", "bl", "m-b");
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
beforeEach(async () => { await gesamtLeeren(); });

describe("A-2 (a): gelungene Einladungen erschöpfen kein Raumkontingent", () => {
  it("Leitung mit junger Anmeldung lädt 25 Personen in Folge ein — alle 200", async () => {
    for (const [i, p] of NEUE.slice(0, 25).entries()) {
      const r = await einladen(T.leitung, { personId: p });
      expect(r.status, `Einladung ${i + 1}: ${r.roh}`).toBe(200);
    }
  });

  it("Leitung mit älterer Anmeldung, Ablauf der Oberfläche (Rückfrage, dann Zugangscode): 25 in Folge", async () => {
    await sitzungAltern(T.leitung);
    for (const [i, p] of NEUE.slice(0, 25).entries()) {
      const frage = await einladen(T.leitung, { personId: p });
      expect(frage.status, `Rückfrage ${i + 1}: ${frage.roh}`).toBe(403);
      expect(frage.bestaetigung).toBe("zugangscode");
      const r = await einladen(T.leitung, { personId: p, bestaetigung: { zugangscode: "BRA1-LEIT-0001" } });
      expect(r.status, `Einladung ${i + 1}: ${r.roh}`).toBe(200);
    }
    /* Die bloßen Rückfragen zählen nicht in der Gesamtgrenze, die Ausstellungen schon. */
    expect(await gesamtStand()).toBe(25);
  });
});

describe("A-2 (b): andere Rollen sperren die Leitung nicht aus", () => {
  it("Planung, SV, Beschäftigte, Betriebsrat und Altrolle kunde hämmern — die Leitung stellt weiter aus", async () => {
    for (const rolle of ["planer", "subplaner", "mitarbeiter", "betriebsrat", "kunde"]) {
      for (let i = 0; i < 15; i++) {
        /* Eine Person, die es nicht gibt: Auch die Altrolle kunde (trägt roles.assign) stellt hier nichts aus. */
        const r = await einladen(T[rolle], { personId: "gibt-es-nicht" });
        expect(r.status, `${rolle} ${i + 1}: ${r.roh}`).not.toBe(200);
        expect(r.einladung).toBeUndefined();
      }
    }
    /* T.leitung ist seit dem vorigen Block älter als fünf Minuten: mit Zugangscode wie in der Oberfläche. */
    const r = await einladen(T.leitung, { personId: "n02", bestaetigung: { zugangscode: "BRA1-LEIT-0001" } });
    expect(r.status, r.roh).toBe(200);
  });

  it("eine Beschäftigte, die bis in ihre eigene Sperre hämmert, sperrt nur sich selbst", async () => {
    let gesperrt = null;
    for (let i = 0; i < 200 && !gesperrt; i++) {
      const r = await einladen(T.mitarbeiter, { personId: "n03" });
      if (r.status === 429) gesperrt = r; else expect(r.status, r.roh).toBe(403);
    }
    expect(gesperrt, "die eigene Lastbremse greift").toBeTruthy();
    expect(gesperrt.wartet).toBeGreaterThan(0);
    const l = await einladen(T.leitung, { personId: "n03", bestaetigung: { zugangscode: "BRA1-LEIT-0001" } });
    expect(l.status, l.roh).toBe(200);
    /* Absagen an Rollen ohne Rollenvergabe fließen nicht in die installationsweite Gesamtgrenze. */
    expect(await gesamtStand()).toBe(1);
  });
});

describe("Rateschutz bleibt: falsche Nachweise → 429, Sperre steigend", () => {
  it("falscher Zugangscode: 10 Absagen, dann 429 (30 min); auch der richtige Code wartet; nach Ablauf doppelt so lang", async () => {
    await sitzungAltern(T.leitung2);
    for (let i = 0; i < 10; i++) {
      const r = await einladen(T.leitung2, { personId: "n04", bestaetigung: { zugangscode: `FALS-CHER-${1000 + i}` } });
      expect(r.status, `Versuch ${i + 1}: ${r.roh}`).toBe(403);
      expect(r.bestaetigung).toBe("zugangscode");
    }
    const elf = await einladen(T.leitung2, { personId: "n04", bestaetigung: { zugangscode: "FALS-CHER-2000" } });
    expect(elf.status, elf.roh).toBe(429);
    expect(elf.wartet).toBe(1800);
    const richtig = await einladen(T.leitung2, { personId: "n04", bestaetigung: { zugangscode: "BRA2-LEIT-0002" } });
    expect(richtig.status, richtig.roh).toBe(429);
    /* Eine Anfrage ohne Nachweis hebt die Sperre nicht auf und setzt nichts zurück. */
    expect((await einladen(T.leitung2, { personId: "n04" })).status).toBe(403);
    expect((await einladen(T.leitung2, { personId: "n04", bestaetigung: { zugangscode: "BRA2-LEIT-0002" } })).status)
      .toBe(429);

    await sperreAblaufen("zugaenge", kp(RAUM, "m-a", "al2"));
    let zweite = null;
    for (let i = 0; i < 12 && !zweite; i++) {
      const r = await einladen(T.leitung2, { personId: "n04", bestaetigung: { zugangscode: `FALS-CHER-${3000 + i}` } });
      if (r.status === 429) zweite = r; else expect(r.status, r.roh).toBe(403);
    }
    expect(zweite, "zweite Sperre").toBeTruthy();
    expect(zweite.wartet).toBe(3600);
  });

  it("Rückfragen ohne Nachweis zwischen Fehlversuchen setzen den Fehlzähler nicht zurück", async () => {
    const t = await sitzung(RAUM, "BRA8-LEIT-0008", "leitung", "al", "m-a");
    await sitzungAltern(t);
    /* Eigene Person „al“ teilt den Zähler mit T.leitung — diese Sitzung ist frisch angemeldet, der Zähler leer. */
    const ergebnisse = [];
    for (let i = 0; i < 11; i++) {
      ergebnisse.push((await einladen(t, { personId: "n05", bestaetigung: { zugangscode: `XXXX-YYYY-${i}` } })).status);
      ergebnisse.push((await einladen(t, { personId: "n05" })).status);
    }
    expect(ergebnisse.filter((s) => s === 429).length, JSON.stringify(ergebnisse)).toBeGreaterThan(0);
    expect(ergebnisse.indexOf(429)).toBe(20);
    /* Die Person ist gesperrt (alle ihre Sitzungen), die andere Leitung des Betriebs nicht. */
    expect((await einladen(T.leitung, { personId: "n05", bestaetigung: { zugangscode: "BRA1-LEIT-0001" } })).status)
      .toBe(429);
  });
});

describe("Grenzen je Herkunft und installationsweit bleiben", () => {
  it("Einladung einlösen mit erfundenen Tokens: dieselbe Herkunft → 429, eine andere Herkunft bleibt frei", async () => {
    let gesperrt = null;
    for (let i = 0; i < 12 && !gesperrt; i++) {
      const r = await anfrage(einladung, "/api/einladung/annehmen",
        { rumpf: { einladung: `${"z".repeat(41)}${String(i).padStart(2, "0")}` }, xff: "10.99.0.1" });
      if (r.status === 429) gesperrt = r; else expect(r.status, r.roh).toBe(410);
    }
    expect(gesperrt, "Bremse je Herkunft").toBeTruthy();
    const anders = await anfrage(einladung, "/api/einladung/annehmen",
      { rumpf: { einladung: "z".repeat(43) }, xff: "10.99.0.2" });
    expect(anders.status, anders.roh).toBe(410);
  });

  it("ohne Sitzung 401 und fremde Herkunft 403 — unverändert", async () => {
    expect((await einladen(null, { personId: "n06" })).status).toBe(401);
    const fremd = await einladung(new Request(`http://${WIRT}/api/einladung`, { method: "POST",
      headers: { host: WIRT, origin: "https://fremd.example", "content-type": "application/json",
        authorization: `Bearer ${T.leitungB}` }, body: JSON.stringify({ personId: "bm" }) }), {});
    expect(fremd.status).toBe(403);
  });

  it("die installationsweite Gesamtgrenze zählt gelungene Einladungen weiter", async () => {
    const vorher = schutz.WEITERE.zugaenge.gesamt;
    schutz.WEITERE.zugaenge.gesamt = { ...vorher, versuche: 2 };
    try {
      expect((await einladen(T.leitungB, { personId: "bm" })).status).toBe(200);
      expect((await einladen(T.leitungB, { personId: "bm" })).status).toBe(200);
      const r = await einladen(T.leitungB, { personId: "bm" });
      expect(r.status, r.roh).toBe(429);
    } finally { schutz.WEITERE.zugaenge.gesamt = vorher; }
  });
});

describe("Andere Räume, veraltete Sitzungen, Wiederholung", () => {
  it("ein gesperrter Raum A berührt Raum B nicht", async () => {
    /* Person „al“ und „al2“ in Raum A sind aus den Fällen oben gesperrt. */
    expect((await einladen(T.leitung, { personId: "n06", bestaetigung: { zugangscode: "BRA1-LEIT-0001" } })).status)
      .toBe(429);
    const r = await einladen(T.leitungB, { personId: "bm" });
    expect(r.status, r.roh).toBe(200);
  });

  it("abgemeldete Sitzung: 401, zählt nirgends; Wiederholung einer eingelösten Einladung: 410", async () => {
    const t = await sitzung(RAUM2, "BRB2-LEIT-0002", "leitung", "bl", "m-b");
    const r = await einladen(t, { personId: "bm" });
    expect(r.status, r.roh).toBe(200);
    expect((await anfrage(daten, "/api/abmelden", { token: t })).status).toBeLessThan(300);
    for (let i = 0; i < 15; i++) expect((await einladen(t, { personId: "bm" })).status).toBe(401);
    /* Die ältere Einladung ist durch eine neuere entwertet; die neuere lässt sich genau einmal einlösen. */
    const neu = await einladen(T.leitungB, { personId: "bm" });
    expect(neu.status, neu.roh).toBe(200);
    expect((await anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: r.einladung } })).status)
      .toBe(410);
    expect((await anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: neu.einladung } })).status)
      .toBe(200);
    expect((await anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: neu.einladung } })).status)
      .toBe(410);
    /* Danach hat die Person einen aktiven Code: 409, ohne dass die Leitung gesperrt würde. */
    const frisch = await sitzung(RAUM2, "BRB3-LEIT-0003", "leitung", "bl", "m-b");
    for (let i = 0; i < 12; i++) expect((await einladen(frisch, { personId: "bm" })).status).toBe(409);
  });
});
