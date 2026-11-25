/* ==========================================================================
   ABN-A2 / ABN-S2 — NEGATIVTESTS ZUR SICHERHEITSBEWERTUNG (BL-16, P1-6)

   Bewertung: docs/acc45/SICHERHEITSBEWERTUNG-ABN-A2-S2.md
   Echte Handler (server/funktionen/einladung.mjs, daten.mjs), Wegwerfablage,
   ECHTE Grenzwerte (nichts angehoben), nur erfundene Testdaten.

   Feste Uhr: Date ist gefälscht (vi.useFakeTimers, nur Date, läuft mit der
   echten Zeit weiter). Jeder Block beginnt kurz nach dem Beginn eines
   600-s-Fensters — so liegt jede Zählung sicher in einem Fenster, und ein
   Sprung um 1200 s leert alle Fensterzähler (laufendes und voriges Fenster).

   ABN-A2  Einladungsbremse `zugaenge` zählte VOR der Rollenprüfung je Raum
           (+ installationsweite Gesamtgrenze 40/10 min, geteilt mit dem
           Zurückziehen von Zugängen und den Betreiberwegen).
           A2-1, A2-2, A2-4: rot vor der Behebung, grün danach.
           A2-3: Rateschutz für die Leitung bleibt unverändert (vorher/nachher grün).
           A2-5a..d: R-A2-1 behoben (Leitungen aus ≥ 4 Räumen sperren Einladen,
           Zurückziehen und Betreiberwege anderer nicht mehr); A2-5c hält den Rest
           fest (falsche Nachweise füllen die Rategrenze 40/600 s).
   ABN-S2  Anmeldeflut aus vielen Herkünften (vorbestehend, keine Behebung in
           diesem Paket). S2-1..S2-3 halten das Ist-Verhalten fest und belegen
           die Grenzen des Angriffs (kein Zugang, kein Orakel, Fensterende,
           eine Herkunft allein genügt nicht).

   Aufruf: npx vitest run pruefungen/abn-a2-s2-sicherheit.test.js --maxWorkers=1 --testTimeout=120000
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 180000, hookTimeout: 120000 });

const WIRT = "127.0.0.1:3000";
const FENSTER_MS = 600 * 1000;
let wurzel, laden, daten, einladung, kontoSchreiben, ablageSchluessel, B, SCH;

let nr = 0;
/** Eine frische IPv4-Herkunft je Aufruf (die Herkunft ist hier nie Gegenstand, außer bei ABN-S2). */
const frischeIp = () => { nr += 1; return `10.42.${Math.floor(nr / 250) % 250}.${(nr % 250) + 1}`; };

async function anfrage(handler, pfad, { rumpf, token, ip = frischeIp() } = {}) {
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": ip };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf,
    body: JSON.stringify(rumpf || {}) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, retryAfter: a.headers.get("retry-after"), ...d };
}
async function lesenGet(token) {
  const a = await daten(new Request(`http://${WIRT}/api/bestand`, { method: "GET",
    headers: { host: WIRT, authorization: `Bearer ${token}`, "x-forwarded-for": frischeIp() } }), {});
  return a.status;
}

const person = (id, rolle) => ({ id, vorname: `Pruef${id}`, nachname: `Fall${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
/** Ein Raum mit einem Betrieb: Leitung l1, Planung p1, Betriebsrat r1, Beschäftigte m1, 30 einladbare Personen z1..z30. */
async function raumAnlegen(raum) {
  const personen = [person("l1", "leitung"), person("p1", "planer"), person("r1", "betriebsrat"), person("m1", "mitarbeiter")];
  for (let i = 1; i <= 30; i++) personen.push(person(`z${i}`, "mitarbeiter"));
  await B.bestandSchreiben(laden(), raum, { version: 9, stand: 1, session: null, mandanten: [{
    id: `m-${raum}`, name: `Betrieb ${raum}`, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1" }], standorte: [],
    dienstarten: [{ id: "F", name: "F" }], personen, abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [],
    dienstbuch: [], abwesenheiten: [] }] }, { durch: "Pruefung" });
}

let codeNr = 0;
/** Ein Zugangscode direkt in der Ablage (wie /api/zugaenge ihn anlegt). */
async function codeAnlegen(raum, rolle, personId, { demo = false, mandantId = `m-${raum}`, betrieb = 0 } = {}) {
  codeNr += 1;
  const code = `PRUF-${String(codeNr).padStart(4, "0")}-ABNS`;
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Pruefung", bestand: raum, rolle, person: personId,
    betrieb, mandantId: rolle === "betreiber" ? null : mandantId, demo, angelegt: "2026-01-01T00:00:00.000Z" });
  return code;
}
async function anmelden(code, ip) {
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code }, ip });
  return a;
}
async function sitzung(raum, rolle, personId, opt) {
  const code = await codeAnlegen(raum, rolle, personId, opt);
  const a = await anmelden(code);
  expect(a.status, a.roh).toBe(200);
  return { token: a.token, code };
}

const einladen = (token, rumpf) => anfrage(einladung, "/api/einladung", { token, rumpf });
const zurueckziehen = (token) => anfrage(daten, "/api/zugang-sperren", { token, rumpf: { kennung: "0badc0de" } });

/** Uhr auf den Beginn des übernächsten 600-s-Fensters + 1 s stellen (leert alle Fensterzähler). */
function neuesFenster() {
  const jetzt = Date.now();
  vi.setSystemTime(Math.floor(jetzt / FENSTER_MS) * FENSTER_MS + 2 * FENSTER_MS + 1000);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-abn-a2-s2-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-abn-a2-s2-0123";
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  SCH = await import("../server/lib/schutz.mjs");
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einladung = (await import("../server/funktionen/einladung.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
});
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});
beforeEach(() => {
  neuesFenster();
  SCH.sperrversuchZuruecksetzen();
});

describe("Grenzwerte, auf die sich die Bewertung stützt (Ist-Stand, unverändert)", () => {
  it("zugaenge 10/600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed; Gesamt 40/600 s; anmelden 8/300 s, Gesamt 400/300 s; Dienst-Deckel 1200/300 s", () => {
    expect(SCH.GRENZEN.zugaenge).toMatchObject({ versuche: 10, fenster: 600, sperre: 1800, steigend: true, max: 86400, failClosed: true });
    expect(SCH.WEITERE.zugaenge.gesamt).toEqual({ versuche: 40, fenster: 600 });
    /* R-A2-1: eigene Zähler für Einladen und Zurückziehen mit genau den Zahlen von `zugaenge` (keine neue Grenze). */
    for (const art of ["einladung", "einladung-nachweis", "zugang-sperren"]) expect(SCH.GRENZEN[art], art).toEqual(SCH.GRENZEN.zugaenge);
    expect(SCH.WEITERE["einladung-nachweis"]).toEqual({ gesamt: { versuche: 40, fenster: 600 } });
    expect(SCH.WEITERE.einladung).toBeUndefined();
    expect(SCH.WEITERE["zugang-sperren"]).toBeUndefined();
    expect(SCH.GRENZEN.anmelden).toMatchObject({ versuche: 8, fenster: 300, sperre: 300, steigend: true, max: 7200 });
    expect(SCH.WEITERE.anmelden.gesamt).toEqual({ versuche: 400, fenster: 300 });
    expect(SCH.SPERRVERSUCHE.gesamt).toEqual({ versuche: 1200, fenster: 300 });
    expect(SCH.SPERRVERSUCHE.herkunft).toEqual({ versuche: 8 });
  });
  it("die gefälschte Uhr läuft mit und steht kurz nach einem Fensterbeginn", async () => {
    const t0 = Date.now();
    expect(t0 % FENSTER_MS).toBeLessThan(5000);
    await new Promise((r) => setTimeout(r, 30));
    expect(Date.now()).toBeGreaterThan(t0);
  });
});

describe("ABN-A2: Einladungsbremse — Rollen ohne Rollenvergabe sperren niemanden", () => {
  it("A2-1: Beschäftigte, Planung und Betriebsrat hämmern je 12× → immer 403, nie 429; die Leitung desselben Betriebs lädt danach ein und zieht zurück", async () => {
    const raum = "abn-a2-eins";
    await raumAnlegen(raum);
    const leitung = await sitzung(raum, "leitung", "l1");
    for (const [rolle, p] of [["mitarbeiter", "m1"], ["planer", "p1"], ["betriebsrat", "r1"]]) {
      const s = await sitzung(raum, rolle, p);
      const st = [];
      for (let i = 0; i < 12; i++) st.push((await einladen(s.token, { personId: "z30" })).status);
      expect(st, `${rolle}: jede Antwort ist eine Rollenabsage, keine Bremse`).toEqual(Array(12).fill(403));
    }
    const e = await einladen(leitung.token, { personId: "z1" });
    expect(e.status, `Leitung stellt aus: ${e.roh}`).toBe(200);
    const z = await zurueckziehen(leitung.token);
    expect(z.status, `Leitung zieht zurück: ${z.roh}`).not.toBe(429);
  });

  it("A2-2: je eine Beschäftigte in vier Räumen (je 12×) → Leitung eines fünften Betriebs lädt ein und zieht zurück; der Betreiber zieht zurück", async () => {
    for (let r = 1; r <= 4; r++) {
      const raum = `abn-a2-fremd-${r}`;
      await raumAnlegen(raum);
      const s = await sitzung(raum, "mitarbeiter", "m1");
      for (let i = 0; i < 12; i++) expect((await einladen(s.token, { personId: "z1" })).status).toBe(403);
    }
    const ziel = "abn-a2-opfer";
    await raumAnlegen(ziel);
    const leitung = await sitzung(ziel, "leitung", "l1");
    const betreiber = await sitzung("abn-a2-betreiber", "betreiber", null);
    const e = await einladen(leitung.token, { personId: "z1" });
    expect(e.status, `fremde Leitung stellt aus: ${e.roh}`).toBe(200);
    const z = await zurueckziehen(leitung.token);
    expect(z.status, `fremde Leitung zieht zurück: ${z.roh}`).not.toBe(429);
    const zb = await zurueckziehen(betreiber.token);
    expect(zb.status, `Betreiber zieht zurück: ${zb.roh}`).not.toBe(429);
  });

  it("A2-3: Rateschutz unverändert — Leitung mit älterer Anmeldung: 10× falscher Zugangscode 403, dann 429 (1800 s); der richtige Code wartet ebenfalls", async () => {
    const raum = "abn-a2-raten";
    await raumAnlegen(raum);
    const leitung = await sitzung(raum, "leitung", "l1");
    /* Anmeldung älter als fünf Minuten: Ab jetzt verlangt das Ausstellen einen Nachweis. Im selben 600-s-Fenster. */
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const ohne = await einladen(leitung.token, { personId: "z1" });
    expect(ohne.status, ohne.roh).toBe(403);
    expect(ohne.bestaetigung, "Rückfrage nach dem Nachweis").toBeTruthy();
    const st = [];
    for (let i = 0; i < 10; i++) {
      st.push((await einladen(leitung.token, { personId: "z1", bestaetigung: { zugangscode: `FALS-CHXX-${String(i).padStart(4, "0")}` } })).status);
    }
    /* Die Rückfrage oben zählt mit (Ist-Stand): Aufruf 11 ist der 10. Fehlversuch und wird gebremst. Exakt, damit
       auch eine Grenzwertänderung (10 → 11) hier auffällt (Review #534, H2). */
    expect(st).toEqual([...Array(9).fill(403), 429]);
    const gesperrt = await einladen(leitung.token, { personId: "z1", bestaetigung: { zugangscode: "FALS-CHXX-9999" } });
    expect(gesperrt.status).toBe(429);
    expect(Number(gesperrt.retryAfter)).toBeGreaterThan(1700);
    const richtig = await einladen(leitung.token, { personId: "z1", bestaetigung: { zugangscode: leitung.code } });
    expect(richtig.status, "auch der richtige Nachweis wartet bis zum Ende der Sperre").toBe(429);
    expect(richtig.einladung).toBeUndefined();
  });

  it("A2-4: ohne Sitzung 401 und Demo-Leitung 403 — je 12×; beides sperrt die echte Leitung des Raums nicht", async () => {
    const raum = "abn-a2-demo";
    await raumAnlegen(raum);
    const leitung = await sitzung(raum, "leitung", "l1");
    const demo = await sitzung(raum, "leitung", "l1", { demo: true });
    for (let i = 0; i < 12; i++) {
      expect((await einladen(null, { personId: "z1" })).status).toBe(401);
      expect((await einladen(`gefaelscht-${i}`, { personId: "z1" })).status).toBe(401);
      expect((await einladen(demo.token, { personId: "z1" })).status).toBe(403);
    }
    const e = await einladen(leitung.token, { personId: "z2" });
    expect(e.status, e.roh).toBe(200);
  });

  it("A2-6 Vorbremse: eine Rolle ohne Rollenvergabe bekommt nach 120 Aufrufen in 60 s 429 (schreiben je Person) — nur sie, die Leitung bleibt frei (Review #534, H1)", async () => {
    const raum = "abn-a2-vorbremse";
    await raumAnlegen(raum);
    const leitung = await sitzung(raum, "leitung", "l1");
    const s = await sitzung(raum, "mitarbeiter", "m1");
    /* Uhr je Aufruf auf denselben 60-s-Abschnitt zurückstellen: neuesFenster() steht 1 s nach einem 600-s-Beginn,
       also auch nach einem 60-s-Beginn. So liegen alle 121 Aufrufe sicher in einem Fenster der Art schreiben. */
    const t0 = Date.now();
    const st = [];
    for (let i = 0; i < 121; i++) {
      vi.setSystemTime(t0 + i * 10);
      st.push((await einladen(s.token, { personId: "z1" })).status);
    }
    expect(st.slice(0, 120).every((x) => x === 403), "die ersten 120 sind Rollenabsagen").toBe(true);
    expect(st[120], "Aufruf 121: Vorbremse schreiben je Person").toBe(429);
    vi.setSystemTime(t0 + 2000);
    const e = await einladen(leitung.token, { personId: "z1" });
    expect(e.status, `Leitung frei: ${e.roh}`).toBe(200);
  });

});

describe("R-A2-1 behoben: Leitungen anderer Betriebe sperren weder Einladen noch Zurückziehen noch Betreiberwege", () => {
  /** Vier Räume mit je einer Leitung; `alt`: Anmeldung älter als fünf Minuten (Ausstellen verlangt dann einen Nachweis). */
  async function vierLeitungen(praefix) {
    const l = [];
    for (let r = 1; r <= 4; r++) {
      const raum = `${praefix}-${r}`;
      await raumAnlegen(raum);
      l.push(await sitzung(raum, "leitung", "l1"));
    }
    return l;
  }
  /** Opfer: Leitung eines fünften Betriebs (eine ältere und eine junge Sitzung) und der Betreiber. */
  async function opfer(raum, betreiberRaum) {
    await raumAnlegen(raum);
    const alt = await sitzung(raum, "leitung", "l1");
    const betreiber = await sitzung(betreiberRaum, "betreiber", null);
    return { alt, betreiber };
  }
  const nachweis = (s) => ({ zugangscode: s.code });

  it("A2-5a: vier Leitungen laden je 12× ein (junge Anmeldung) und ziehen je 12× zurück → fremde Leitung lädt ein (mit und ohne Nachweis) und zieht zurück, der Betreiber zieht zurück", async () => {
    const leit = await vierLeitungen("abn-r1-a");
    const o = await opfer("abn-r1-a-opfer", "abn-r1-a-betreiber");
    for (const s of leit) {
      const st = [];
      for (let i = 1; i <= 12; i++) st.push((await einladen(s.token, { personId: `z${i}` })).status);
      /* Je Raum unverändert: zehn Einladungen, dann die eigene Sperre (R-A2-2, nicht Gegenstand dieses Pakets). */
      expect(st).toEqual([...Array(10).fill(200), 429, 429]);
      const zs = [];
      for (let i = 0; i < 12; i++) zs.push((await zurueckziehen(s.token)).status);
      /* Zurückziehen je Betrieb: 10 frei, dann die eigene Sperre — Zahlen wie `zugaenge`. */
      expect(zs.slice(0, 10).every((x) => x !== 429), JSON.stringify(zs)).toBe(true);
      expect(zs.slice(10)).toEqual([429, 429]);
    }
    /* Ältere Sitzung des Opfers: Ausstellen nur mit Nachweis. */
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const mit = await einladen(o.alt.token, { personId: "z1", bestaetigung: nachweis(o.alt) });
    expect(mit.status, `fremde Leitung mit Nachweis: ${mit.roh}`).toBe(200);
    const jung = await sitzung("abn-r1-a-opfer", "leitung", "l1");
    const ohne = await einladen(jung.token, { personId: "z2" });
    expect(ohne.status, `fremde Leitung, junge Anmeldung: ${ohne.roh}`).toBe(200);
    const z = await zurueckziehen(jung.token);
    expect(z.status, `fremde Leitung zieht zurück: ${z.roh}`).not.toBe(429);
    const zb = await zurueckziehen(o.betreiber.token);
    expect(zb.status, `Betreiber zieht zurück: ${zb.roh}`).not.toBe(429);
  });

  it("A2-5b: vier Leitungen stellen je 10 Einladungen mit RICHTIGEM Nachweis aus → gelungene Nachweise füllen die Rategrenze nicht; fremde Leitung mit Nachweis 200", async () => {
    const leit = await vierLeitungen("abn-r1-b");
    const o = await opfer("abn-r1-b-opfer", "abn-r1-b-betreiber");
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    for (const s of leit) {
      const st = [];
      for (let i = 1; i <= 10; i++) st.push((await einladen(s.token, { personId: `z${i}`, bestaetigung: nachweis(s) })).status);
      expect(st).toEqual(Array(10).fill(200));
    }
    const mit = await einladen(o.alt.token, { personId: "z1", bestaetigung: nachweis(o.alt) });
    expect(mit.status, `fremde Leitung mit Nachweis: ${mit.roh}`).toBe(200);
    expect((await zurueckziehen(o.betreiber.token)).status).not.toBe(429);
  });

  it("A2-5e: Rückfragen ohne Nachweis und Nachweise, die an der eigenen Raumsperre abprallen, zählen nicht in der Rategrenze — fremde Leitung mit Nachweis 200", async () => {
    const leit = await vierLeitungen("abn-r1-e");
    const o = await opfer("abn-r1-e-opfer", "abn-r1-e-betreiber");
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    for (const s of leit) {
      const st = [];
      for (let i = 0; i < 10; i++) st.push((await einladen(s.token, { personId: "z1" })).status);
      expect(st, "Rückfragen (Nachweis fehlt)").toEqual(Array(10).fill(403));
      const gesperrt = [];
      for (let i = 0; i < 10; i++) {
        gesperrt.push((await einladen(s.token, { personId: "z1",
          bestaetigung: { zugangscode: `FALS-SPXX-${String(i).padStart(4, "0")}` } })).status);
      }
      expect(gesperrt, "eigene Raumsperre: nicht verglichen").toEqual(Array(10).fill(429));
    }
    const mit = await einladen(o.alt.token, { personId: "z1", bestaetigung: nachweis(o.alt) });
    expect(mit.status, `fremde Leitung mit Nachweis: ${mit.roh}`).toBe(200);
  });

  it("A2-5c Rest (Ist, festgehalten): vier Leitungen schicken je 10 FALSCHE Nachweise → nur das Ausstellen MIT Nachweis wartet installationsweit (≤ 600 s); ohne Nachweis, Zurückziehen und Betreiber frei", async () => {
    const leit = await vierLeitungen("abn-r1-c");
    const o = await opfer("abn-r1-c-opfer", "abn-r1-c-betreiber");
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    for (const s of leit) {
      const st = [];
      for (let i = 0; i < 10; i++) {
        st.push((await einladen(s.token, { personId: "z1",
          bestaetigung: { zugangscode: `FALS-CHXX-${String(i).padStart(4, "0")}` } })).status);
      }
      expect(st).toEqual(Array(10).fill(403));
    }
    const mit = await einladen(o.alt.token, { personId: "z1", bestaetigung: nachweis(o.alt) });
    expect(mit.status, "Rategrenze für Nachweise (40/600 s) voll — Restrisiko, Bewertung §3.5").toBe(429);
    expect(Number(mit.retryAfter)).toBeLessThanOrEqual(600);
    /* Das Opfer versucht es während der Wartezeit noch zehnmal: Das darf seinen eigenen Raumzähler nicht füllen. */
    for (let i = 0; i < 10; i++) expect((await einladen(o.alt.token, { personId: "z1", bestaetigung: nachweis(o.alt) })).status).toBe(429);
    const jung = await sitzung("abn-r1-c-opfer", "leitung", "l1");
    const ohne = await einladen(jung.token, { personId: "z2" });
    expect(ohne.status, `ohne Nachweis (junge Anmeldung) frei: ${ohne.roh}`).toBe(200);
    expect((await zurueckziehen(jung.token)).status).not.toBe(429);
    expect((await zurueckziehen(o.betreiber.token)).status).not.toBe(429);
    /* Die Wartezeit hat den Raumzähler des Opfers nicht verbraucht: Nach dem Fenster stellt die ältere Sitzung aus. */
    neuesFenster();
    const danach = await einladen(o.alt.token, { personId: "z3", bestaetigung: nachweis(o.alt) });
    expect(danach.status, danach.roh).toBe(200);
  });

  it("A2-5d: Zurückziehen zählt je Betrieb — die Sperre einer Leitung trifft eine andere nicht; Einladen und Zurückziehen teilen keinen Zähler mehr", async () => {
    const [a, b] = await vierLeitungen("abn-r1-d");
    const za = [];
    for (let i = 0; i < 11; i++) za.push((await zurueckziehen(a.token)).status);
    expect(za[10]).toBe(429);
    expect((await zurueckziehen(b.token)).status).not.toBe(429);
    /* Eigene Sperre beim Zurückziehen sperrt das eigene Einladen nicht (vorher derselbe Raumzähler `zugaenge`). */
    expect((await einladen(a.token, { personId: "z1" })).status).toBe(200);
  });

  it("A2-5f: zwei Betriebe in EINEM Raum — Zurückziehen zählt je Betrieb, Ausstellen je Raum (Review #536, Mutanten f/h)", async () => {
    const raum = "abn-r1-f-zwei";
    const betrieb = (m) => ({ id: m, name: `Betrieb ${m}`, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1" }],
      standorte: [], dienstarten: [{ id: "F", name: "F" }],
      personen: [person("l1", "leitung"), ...Array.from({ length: 12 }, (_, i) => person(`z${i + 1}`, "mitarbeiter"))],
      abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [], abwesenheiten: [] });
    await B.bestandSchreiben(laden(), raum, { version: 9, stand: 1, session: null,
      mandanten: [betrieb("m-f-a"), betrieb("m-f-b")] }, { durch: "Pruefung" });
    const anmeldenAls = async (mandantId, nr) => {
      const code = await codeAnlegen(raum, "leitung", "l1", { mandantId, betrieb: nr });
      const a = await anmelden(code);
      expect(a.status, a.roh).toBe(200);
      return { token: a.token, code };
    };
    const a = await anmeldenAls("m-f-a", 0);
    const b = await anmeldenAls("m-f-b", 1);
    /* Zurückziehen je Betrieb: Die Sperre von A trifft B im selben Raum nicht. */
    const za = [];
    for (let i = 0; i < 11; i++) za.push((await zurueckziehen(a.token)).status);
    expect(za[10]).toBe(429);
    const zb = await zurueckziehen(b.token);
    expect(zb.status, `B zieht zurück: ${zb.roh}`).not.toBe(429);
    /* Ausstellen je Raum (Rateschutz wie vorher): Zehn Aufrufe von A verbrauchen auch das Kontingent von B. */
    const ea = [];
    for (let i = 1; i <= 10; i++) ea.push((await einladen(a.token, { personId: `z${i}` })).status);
    expect(ea, JSON.stringify(ea)).toEqual(Array(10).fill(200));
    const eb = await einladen(b.token, { personId: "z1" });
    expect(eb.status, `B im selben Raum: ${eb.roh}`).toBe(429);
  });
});

describe("R-A2-1: gleichzeitige Anfragen (Review #536, Proben G1–G3)", () => {
  const parallel = (n, f) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));

  it("G3: EINE Leitung schickt 60 Einladungen und 60 Rückzüge gleichzeitig → fremde Leitung lädt ein und zieht zurück, Betreiber zieht zurück (vorher alle 429)", async () => {
    await raumAnlegen("abn-g3-angreifer");
    await raumAnlegen("abn-g3-opfer");
    const t = await sitzung("abn-g3-angreifer", "leitung", "l1");
    const o = await sitzung("abn-g3-opfer", "leitung", "l1");
    const betreiber = await sitzung("abn-g3-betreiber", "betreiber", null);
    await parallel(60, (i) => einladen(t.token, { personId: `z${(i % 30) + 1}` }));
    await parallel(60, () => zurueckziehen(t.token));
    const e = await einladen(o.token, { personId: "z1" });
    expect(e.status, `fremde Leitung lädt ein: ${e.roh}`).toBe(200);
    expect((await zurueckziehen(o.token)).status, "fremde Leitung zieht zurück").not.toBe(429);
    expect((await zurueckziehen(betreiber.token)).status, "Betreiber zieht zurück").not.toBe(429);
  });

  it("G1: EINE Leitung schickt 60 falsche Nachweise gleichzeitig → keiner wird ausgestellt; die Leitung eines anderen Raums stellt mit richtigem Nachweis aus", async () => {
    await raumAnlegen("abn-g1-angreifer");
    await raumAnlegen("abn-g1-opfer");
    const t = await sitzung("abn-g1-angreifer", "leitung", "l1");
    const o = await sitzung("abn-g1-opfer", "leitung", "l1");
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const st = await parallel(60, (i) => einladen(t.token, { personId: "z1",
      bestaetigung: { zugangscode: `FALS-PARX-${String(i).padStart(4, "0")}` } }));
    expect(st.some((x) => x.status === 200 || x.einladung), "kein falscher Nachweis stellt aus").toBe(false);
    const mit = await einladen(o.token, { personId: "z1", bestaetigung: { zugangscode: o.code } });
    expect(mit.status, `anderer Raum mit richtigem Nachweis: ${mit.roh}`).toBe(200);
  });

  it("G2: kein Freikaufen — richtige und falsche Nachweise im Wechsel: höchstens 10 Versuche je Fenster werden verglichen", async () => {
    await raumAnlegen("abn-g2");
    const l = await sitzung("abn-g2", "leitung", "l1");
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const st = [];
    for (let i = 0; i < 30; i++) {
      const bestaetigung = { zugangscode: i % 2 === 0 ? l.code : `FALS-WECH-${String(i).padStart(4, "0")}` };
      st.push((await einladen(l.token, { personId: `z${(i % 30) + 1}`, bestaetigung })).status);
    }
    expect(st.filter((x) => x !== 429).length, JSON.stringify(st)).toBeLessThanOrEqual(10);
    expect(st.slice(10).every((x) => x === 429), JSON.stringify(st)).toBe(true);
  });
});

describe("ABN-S2: Anmeldeflut aus vielen Herkünften (vorbestehend) — Ist-Verhalten und Grenzen des Angriffs", () => {
  /** Je Herkunft `n` falsche Codes, nacheinander; die Herkünfte parallel in Gruppen zu 50. */
  async function flut(herkuenfte, n) {
    const st = [];
    for (let g = 0; g < herkuenfte.length; g += 50) {
      const teil = await Promise.all(herkuenfte.slice(g, g + 50).map(async (ip) => {
        const r = [];
        for (let i = 0; i < n; i++) {
          const a = await anmelden(`FLUT-${String(nr).padStart(4, "0")}-${String(i).padStart(4, "0")}`, ip);
          r.push({ status: a.status, token: a.token, roh: a.roh });
        }
        return r;
      }));
      for (const t of teil) st.push(...t);
    }
    return st;
  }
  const ips = (anzahl, netz) => Array.from({ length: anzahl }, (_, i) => `10.${netz}.${Math.floor(i / 250)}.${(i % 250) + 1}`);

  it("S2-1: eine einzelne Herkunft (80 Fehlversuche) sperrt nur sich selbst — Betreiber und Leitung melden sich von anderswo an", async () => {
    const raum = "abn-s2-eins";
    await raumAnlegen(raum);
    const codeB = await codeAnlegen("abn-s2-betreiber-1", "betreiber", null);
    const codeL = await codeAnlegen(raum, "leitung", "l1");
    const st = await flut(["10.77.0.1"], 80);
    expect(st.filter((x) => x.status === 401).length, "8 freie Fehlversuche").toBe(8);
    expect(st.every((x) => x.status === 401 || x.status === 429)).toBe(true);
    expect(st.some((x) => x.token)).toBe(false);
    expect((await anmelden(codeB)).status).toBe(200);
    expect((await anmelden(codeL)).status).toBe(200);
  });

  it("S2-2 Stufe 1 (Befund S-2, Ist): 45 Herkünfte × 9 falsche Codes → Betreiber-Neuanmeldung und Einlösen 429; Leitung mit gültigem Code und bestehende Sitzungen frei; kein Zugang, kein Orakel", async () => {
    const raum = "abn-s2-stufe1";
    await raumAnlegen(raum);
    const codeB = await codeAnlegen("abn-s2-betreiber-2", "betreiber", null);
    const leitung = await sitzung(raum, "leitung", "l1");
    const einl = await einladen(leitung.token, { personId: "z1" });
    expect(einl.status, einl.roh).toBe(200);

    const st = await flut(ips(45, 81), 9);
    expect(st.length).toBe(405);
    expect(st.some((x) => x.token), "kein Fehlversuch erzeugt eine Sitzung").toBe(false);
    expect(st.every((x) => x.status === 401 || x.status === 429)).toBe(true);
    /* Kein Orakel: Alle 401-Antworten sagen dasselbe (ohne den Resthinweis, der nur von der Zählung abhängt). */
    const texte = new Set(st.filter((x) => x.status === 401).map((x) => JSON.parse(x.roh).fehler));
    expect([...texte]).toEqual(["Unbekannter Zugangscode."]);

    const b = await anmelden(codeB);
    expect(b.status, "Befund S-2: die Betreiber-Neuanmeldung wartet (anmelden:gesamt 400/300 s voll)").toBe(429);
    expect(b.token).toBeUndefined();
    const ein = await anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: einl.einladung } });
    expect(ein.status, "Befund S-2: Einlösen einer gültigen Einladung wartet").toBe(429);
    const l = await anmelden(leitung.code);
    expect(l.status, "SI-P7: ein gültiger Leitungscode kommt in Stufe 1 durch").toBe(200);
    expect(await lesenGet(leitung.token), "bestehende Sitzung liest weiter").toBe(200);

    /* Fensterende: alles wieder frei, die Einladung ist nicht verbraucht. */
    neuesFenster();
    expect((await anmelden(codeB)).status).toBe(200);
    const ein2 = await anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: einl.einladung } });
    expect(ein2.status, ein2.roh).toBe(200);
  });

  it("S2-3 Stufe 2 (Befund S-2, Ist): ab etwa 134 Herkünften (Dienst-Deckel 1200 Sperrversuche) wartet auch die Leitung mit gültigem Code; bestehende Sitzungen bleiben frei", async () => {
    const raum = "abn-s2-stufe2";
    await raumAnlegen(raum);
    const leitung = await sitzung(raum, "leitung", "l1");
    /* Stufe 2 braucht beides: Dienst-Deckel gerissen (sonst SI-P7-Durchlass) UND anmelden:gesamt voll (sonst lässt
       die Bremse den gültigen Code durch). Laufzeit: 90 Herkünfte tragen ihre je 9 Sperrversuche direkt bei (wie
       anmeldesperre.test.js, „Dienst-Deckel exakt“), zusammen 810. Dann 45 Herkünfte über HTTP, je 8 Fehlversuche
       + 9 abgewiesene: 405 in anmelden:gesamt (≥ 400) und 405 weitere Sperrversuche (1215 > 1200). */
    for (let q = 0; q < 90; q++) for (let i = 0; i < 9; i++) SCH.sperrversuchZaehlen(`a:vorab-${q}`, 300);
    expect(SCH.gueltigeDurchlassen("a:unbeteiligt"), "810: Deckel noch nicht gerissen").toBe(true);
    expect((await anmelden(leitung.code)).status, "vor der Flut: gültiger Leitungscode frei").toBe(200);
    const st = await flut(ips(45, 82), 17);
    expect(st.some((x) => x.token)).toBe(false);
    expect(SCH.gueltigeDurchlassen("a:unbeteiligt"), "Dienst-Deckel gerissen").toBe(false);
    const l = await anmelden(leitung.code);
    expect(l.status, "Befund S-2 Stufe 2: auch der gültige Leitungscode wartet").toBe(429);
    expect(await lesenGet(leitung.token), "bestehende Sitzung liest weiter").toBe(200);
    neuesFenster();
    expect((await anmelden(leitung.code)).status).toBe(200);
  });
});
