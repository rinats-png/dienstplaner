/* ==========================================================================
   EINLADUNGEN (WP-18) — Leitung lädt ein → Anmeldung → richtige Rolle

   Akzeptanz aus docs/acc45/work-packages.json:
     „Leitung lädt Testperson ein → Anmeldung → richtige Rolle; ein Code = eine Person"

   Geprüft über die echten Handler (server/funktionen/einladung.mjs und
   daten.mjs für /api/anmelden und /api/bestand) mit Wegwerfablage — nur
   erfundene Testdaten.

   Negativfälle: falsche Rolle, fremder Mandant, wiederverwendete Einladung,
   abgelaufene Einladung, Code bzw. Einladung einer anderen Person.

   Aufruf: npx vitest run pruefungen/einladungen.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Echte Handler mit Dateiablage: unter Last (Gesamtlauf) dauert ein Schritt länger als die Vorgabe von 5 s. */
vi.setConfig({ testTimeout: 30000, hookTimeout: 60000 });

const WIRT = "127.0.0.1:3000";
const RAUM = "einladung-probe";
let wurzel, laden, daten, einladung, kontoSchreiben, alleKonten, ablageSchluessel, B, E;
let nr = 0;

const anfrage = async (handler, pfad, { methode = "POST", rumpf, token, origin = `http://${WIRT}` } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin, "x-forwarded-for": `10.18.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

const person = (id, rolle, extra = {}) => ({ id, vorname: `Test${id}`, nachname: `Person${id}`, rolle, bereich: "e1",
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });
const betrieb = (id, name, personen) => ({ id, name, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1" }],
  standorte: [], dienstarten: [{ id: "F", name: "F" }], personen,
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [], abwesenheiten: [] });
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [
  betrieb("m-a", "Testbetrieb A", [person("al", "leitung"), person("al2", "leitung"), person("ap", "planer"),
    person("as", "subplaner"), person("am", "mitarbeiter"), person("am2", "mitarbeiter"), person("am3", "mitarbeiter"),
    person("am4", "mitarbeiter"), person("am5", "mitarbeiter"), person("ar", "betriebsrat"), person("aw", "mitarbeiter", { status: "ausgeschieden" })]),
  betrieb("m-b", "Testbetrieb B", [person("bl", "leitung"), person("bm", "mitarbeiter")]),
] });

/** Ein Zugangscode direkt in der Ablage (wie /api/zugaenge ihn anlegt) und die Anmeldung damit. */
async function sitzung(code, rolle, personId, { betriebNr = 0, mandantId = "m-a", demo = false } = {}) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Test", bestand: RAUM, rolle, person: personId,
    betrieb: betriebNr, mandantId, demo, angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy();
  return a.token;
}

const einladen = (token, rumpf) => anfrage(einladung, "/api/einladung", { token, rumpf });
const annehmen = (einl) => anfrage(einladung, "/api/einladung/annehmen", { rumpf: { einladung: einl } });
const kontenDerPerson = async (p, mandantId = "m-a") => Object.values(await alleKonten(laden()))
  .filter((k) => k && k.bestand === RAUM && k.mandantId === mandantId && String(k.person) === p);

const T = {};
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-einladungen-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einladung = (await import("../server/funktionen/einladung.mjs")).default;
  ({ kontoSchreiben, alleKonten } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  E = await import("../server/lib/einladungen.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  T.leitung = await sitzung("EIN1-LEIT-0001", "leitung", "al");
  T.planer = await sitzung("EIN2-PLAN-0002", "planer", "ap");
  T.mitarbeiter = await sitzung("EIN3-MITA-0003", "mitarbeiter", "am4");
  T.leitungB = await sitzung("EIN4-LEIT-0004", "leitung", "bl", { betriebNr: 1, mandantId: "m-b" });
  T.demo = await sitzung("EIN5-DEMO-0005", "leitung", "al2", { demo: true });
}, 60000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Akzeptanz: Leitung lädt ein → Anmeldung → richtige Rolle", () => {
  let einl, code;

  it("die Leitung stellt eine Einladung für eine Person ihres Betriebs aus — ohne Zugangscode", async () => {
    const r = await einladen(T.leitung, { personId: "am" });
    expect(r.status, r.roh).toBe(200);
    expect(typeof r.einladung).toBe("string");
    expect(r.einladung.length).toBeGreaterThanOrEqual(40);
    expect(r.rolle).toBe("mitarbeiter");
    expect(r.person).toEqual({ id: "am", name: "Testam Personam" });
    expect(r.bis).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    /* Die Leitung bekommt keinen Zugangscode zu sehen, und es gibt noch keinen. */
    expect(r.roh).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    expect(await kontenDerPerson("am")).toHaveLength(0);
    einl = r.einladung;
  });

  it("die Person löst die Einladung ein und bekommt genau einmal ihren persönlichen Code", async () => {
    const r = await annehmen(einl);
    expect(r.status, r.roh).toBe(200);
    expect(r.zugangscode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(r.rolle).toBe("mitarbeiter");
    code = r.zugangscode;
    const k = await kontenDerPerson("am");
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ rolle: "mitarbeiter", person: "am", betrieb: 0, mandantId: "m-a", demo: false });
    expect(k[0].gesperrt).toBeFalsy();
  });

  it("Anmeldung mit dem Code: Rolle und Person stimmen, der Bestand kommt in der Sicht der Rolle", async () => {
    const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
    expect(a.status, a.roh).toBe(200);
    expect(a.rolle).toBe("mitarbeiter");
    expect(a.person).toBe("am");
    expect(a.betrieb).toBe(0);
    const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: a.token });
    expect(g.status, g.roh).toBe(200);
    expect(g.bestand.mandanten).toHaveLength(1);
    expect(g.bestand.mandanten[0].id).toBe("m-a");
    /* Beschäftigte schreiben nur Eigenes: keine Einladungen. */
    const x = await einladen(a.token, { personId: "am3" });
    expect(x.status, x.roh).toBe(403);
  });

  it("Einladung für eine Schichtverantwortung führt zur Rolle subplaner", async () => {
    const r = await einladen(T.leitung, { personId: "as", rolle: "subplaner" });
    expect(r.status, r.roh).toBe(200);
    const z = await annehmen(r.einladung);
    expect(z.status, z.roh).toBe(200);
    const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: z.zugangscode } });
    expect(a.rolle).toBe("subplaner");
    expect(a.person).toBe("as");
  });
});

describe("Negativ: wiederverwendete Einladung, ein Code = eine Person", () => {
  it("dieselbe Einladung ein zweites Mal: 410, kein zweiter Code", async () => {
    const r = await einladen(T.leitung, { personId: "am2" });
    expect(r.status, r.roh).toBe(200);
    expect((await annehmen(r.einladung)).status).toBe(200);
    const zweit = await annehmen(r.einladung);
    expect(zweit.status, zweit.roh).toBe(410);
    expect(zweit.zugangscode).toBeUndefined();
    expect(await kontenDerPerson("am2")).toHaveLength(1);
  });

  it("gleichzeitiges Einlösen derselben Einladung: genau ein Code", async () => {
    const r = await einladen(T.leitung, { personId: "am3" });
    const alle = await Promise.all([1, 2, 3, 4, 5].map(() => annehmen(r.einladung)));
    expect(alle.filter((x) => x.status === 200)).toHaveLength(1);
    expect(alle.filter((x) => x.status === 410)).toHaveLength(4);
    expect(await kontenDerPerson("am3")).toHaveLength(1);
  });

  it("eine Person mit aktivem Code bekommt keine weitere Einladung (409)", async () => {
    const r = await einladen(T.leitung, { personId: "am" });
    expect(r.status, r.roh).toBe(409);
    expect(r.einladung).toBeUndefined();
  });

  it("eine neue Einladung entwertet die ältere für dieselbe Person", async () => {
    const alt = await einladen(T.leitung, { personId: "ar" });
    const neu = await einladen(T.leitung, { personId: "ar" });
    expect(alt.status).toBe(200);
    expect(neu.status).toBe(200);
    expect((await annehmen(alt.einladung)).status).toBe(410);
    const z = await annehmen(neu.einladung);
    expect(z.status, z.roh).toBe(200);
    expect(await kontenDerPerson("ar")).toHaveLength(1);
  });

  it("Code einer anderen Person: Einladung und Code gehören genau der eingeladenen Person", async () => {
    /* Zwei offene Einladungen für zwei Personen; jede Einlösung schreibt nur das Konto ihrer eigenen Person,
       und jeder Code meldet nur diese Person an — egal in welcher Reihenfolge eingelöst wird. */
    const g = await B.bestandLesen(laden(), RAUM);
    const neu = structuredClone(g.bestand);
    neu.mandanten[0].personen.push(person("ay", "mitarbeiter"), person("az", "mitarbeiter"));
    await B.bestandSchreiben(laden(), RAUM, neu, { durch: "Pruefung" });
    const fuerY = await einladen(T.leitung, { personId: "ay" });
    const fuerZ = await einladen(T.leitung, { personId: "az" });
    const codeZ = await annehmen(fuerZ.einladung);
    const codeY = await annehmen(fuerY.einladung);
    expect(codeZ.status, codeZ.roh).toBe(200);
    expect(codeY.status, codeY.roh).toBe(200);
    expect(codeZ.zugangscode).not.toBe(codeY.zugangscode);
    expect((await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: codeZ.zugangscode } })).person).toBe("az");
    expect((await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: codeY.zugangscode } })).person).toBe("ay");
    /* Eine ausgeschiedene Person bekommt keine Einladung. */
    expect((await einladen(T.leitung, { personId: "aw" })).status).toBe(404);
    /* Für die eigene Person der Leitung (Leitung vergibt keine Leitung) gibt es keine Einladung. */
    expect((await einladen(T.leitung, { personId: "al" })).status).toBe(403);
    for (const p of ["am", "am2", "am3", "as", "ar", "ay", "az"]) {
      const liste = await kontenDerPerson(p);
      expect(liste, p).toHaveLength(1);
      expect(String(liste[0].person)).toBe(p);
    }
  });

  it("nach dem Sperren des alten Codes darf neu eingeladen werden — der alte bleibt gesperrt", async () => {
    const [alt] = Object.entries(await alleKonten(laden()))
      .filter(([, k]) => k && k.bestand === RAUM && k.mandantId === "m-a" && k.person === "am2");
    await kontoSchreiben(laden(), alt[0], { ...alt[1], gesperrt: true });
    const r = await einladen(T.leitung, { personId: "am2" });
    expect(r.status, r.roh).toBe(200);
    const z = await annehmen(r.einladung);
    expect(z.status, z.roh).toBe(200);
    const liste = await kontenDerPerson("am2");
    expect(liste).toHaveLength(2);
    expect(liste.filter((k) => !k.gesperrt)).toHaveLength(1);
  });

  it("Einladung für eine Person, deren Rolle sich vor dem Einlösen ändert: 409, kein Code", async () => {
    const g = await B.bestandLesen(laden(), RAUM);
    const neu = structuredClone(g.bestand);
    neu.mandanten[0].personen.push(person("ax", "mitarbeiter"));
    await B.bestandSchreiben(laden(), RAUM, neu, { durch: "Pruefung" });
    const r = await einladen(T.leitung, { personId: "ax" });
    expect(r.status, r.roh).toBe(200);
    const g2 = await B.bestandLesen(laden(), RAUM);
    const neu2 = structuredClone(g2.bestand);
    neu2.mandanten[0].personen.find((p) => p.id === "ax").rolle = "planer";
    await B.bestandSchreiben(laden(), RAUM, neu2, { durch: "Pruefung" });
    const z = await annehmen(r.einladung);
    expect(z.status, z.roh).toBe(409);
    expect(await kontenDerPerson("ax")).toHaveLength(0);
  });
});

describe("Negativ: falsche Rolle", () => {
  it("angefragte Rolle weicht von der Personalliste ab: 409", async () => {
    const r = await einladen(T.leitung, { personId: "am4", rolle: "planer" });
    expect(r.status, r.roh).toBe(409);
  });
  it("die Leitung vergibt keine zweite Leitung: 403", async () => {
    const r = await einladen(T.leitung, { personId: "al2" });
    expect(r.status, r.roh).toBe(403);
  });
  it("Planung, Beschäftigte und Demozugang stellen keine Einladungen aus: 403", async () => {
    for (const t of [T.planer, T.mitarbeiter, T.demo]) {
      const r = await einladen(t, { personId: "am4" });
      expect(r.status, r.roh).toBe(403);
      expect(r.einladung).toBeUndefined();
    }
  });
  it("ohne Sitzung 401, fremde Herkunft 403", async () => {
    expect((await einladen(null, { personId: "am4" })).status).toBe(401);
    const f = await anfrage(einladung, "/api/einladung", { token: T.leitung, rumpf: { personId: "am4" },
      origin: "https://fremd.example" });
    expect(f.status).toBe(403);
  });
});

describe("Negativ: fremder Mandant", () => {
  it("Leitung A lädt eine Person aus Betrieb B ein: 404", async () => {
    const r = await einladen(T.leitung, { personId: "bm" });
    expect(r.status, r.roh).toBe(404);
    expect(await kontenDerPerson("bm", "m-b")).toHaveLength(0);
  });
  it("Leitung B lädt eine Person aus Betrieb A ein: 404", async () => {
    const r = await einladen(T.leitungB, { personId: "am4" });
    expect(r.status, r.roh).toBe(404);
  });
  it("Leitung B lädt ihre eigene Person ein: Code gebunden an Betrieb B, Anmeldung sieht nur B", async () => {
    const r = await einladen(T.leitungB, { personId: "bm" });
    expect(r.status, r.roh).toBe(200);
    const z = await annehmen(r.einladung);
    expect(z.status, z.roh).toBe(200);
    const k = await kontenDerPerson("bm", "m-b");
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ betrieb: 1, mandantId: "m-b" });
    const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: z.zugangscode } });
    expect(a.status, a.roh).toBe(200);
    const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: a.token });
    expect(g.bestand.mandanten).toHaveLength(1);
    expect(g.bestand.mandanten[0].id).toBe("m-b");
  });
});

describe("Negativ: abgelaufene und unbekannte Einladung", () => {
  it("eine Einladung, deren Frist (7 Tage) vorbei ist: 410, kein Code", async () => {
    const vorAchtTagen = Date.now() - 8 * 24 * 3600 * 1000;
    const g = await B.bestandLesen(laden(), RAUM);
    const sitz = { bestand: RAUM, rolle: "leitung", person: "al", betrieb: 0, mandantId: "m-a" };
    const r = await E.einladungAusstellen(laden(), { sitzung: sitz, bestand: g.bestand, personId: "am5",
      jetzt: () => vorAchtTagen });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const z = await annehmen(r.einladung);
    expect(z.status, z.roh).toBe(410);
    expect(await kontenDerPerson("am5")).toHaveLength(0);
  });
  it("erfundene Einladung: 410; zu kurze Eingabe: 400", async () => {
    expect((await annehmen("x".repeat(43))).status).toBe(410);
    expect((await annehmen("kurz")).status).toBe(400);
  });
  it("eine Account-Einladung (anderer Art) lässt sich nicht als Zugangseinladung einlösen", async () => {
    const { tokenAusstellen } = await import("../server/lib/token.mjs");
    const { token } = await tokenAusstellen(laden(), { zweck: "einladung", nr: 0, inhalt: { accountId: "a_x", raum: RAUM } });
    const z = await annehmen(token);
    expect(z.status, z.roh).toBe(410);
  });
});
