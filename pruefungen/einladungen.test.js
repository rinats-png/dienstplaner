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

/* ==========================================================================
   WP-18 Ausbau: Review-Auflagen (M1, M2, N1–N3) und Betreibervorgaben (B1–B5)

   Die Blöcke zu M1, M2, Widerruf/Liste, Einmaligkeit über zwei Instanzen und
   frischer Bestätigung sind auf dem Stand vor dem Ausbau rot gelaufen
   (docs/acc45/WP-18-NACHWEIS.md, „Vorher-rot"). Nur erfundene Testdaten.
   ========================================================================== */

/** Eine Person in Betrieb A dazunehmen (oder ihre Rolle ändern). */
async function personSetzen(id, rolle) {
  const g = await B.bestandLesen(laden(), RAUM);
  const neu = structuredClone(g.bestand);
  const ps = neu.mandanten[0].personen;
  const da = ps.find((p) => p.id === id);
  if (da) da.rolle = rolle; else ps.push(person(id, rolle));
  await B.bestandSchreiben(laden(), RAUM, neu, { durch: "Pruefung" });
}

/** Eine Sitzung altern lassen: `seit` liegt dann `minuten` zurück (die Sitzung selbst bleibt gültig). */
async function sitzungAltern(token, minuten) {
  const { sitzungsSpeicher, sitzungsSchluessel } = await import("../server/lib/sitzungen.mjs");
  const sp = sitzungsSpeicher();
  const s = await sp.get(sitzungsSchluessel(token), { type: "json" });
  await sp.setJSON(sitzungsSchluessel(token), { ...s, seit: Date.now() - minuten * 60 * 1000 });
}

const leitungSitz = () => ({ bestand: RAUM, rolle: "leitung", person: "al", betrieb: 0, mandantId: "m-a" });
const bestandJetzt = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
const liste = (token) => anfrage(einladung, "/api/einladung/liste", { token, rumpf: {} });
const widerrufen = (token, id) => anfrage(einladung, "/api/einladung/widerrufen", { token, rumpf: { id } });

/** Eine Ablage, die an ausgewählten Stellen einen Lese- oder Löschfehler wirft. */
function stoerAblage(echt, { list = () => false, get = () => false, del = () => false } = {}) {
  const fehler = () => Object.assign(new Error("EIO: Ablage gestört (Prüfung)"), { code: "EIO" });
  return {
    get: async (k, o) => { if (get(k)) throw fehler(); return echt.get(k, o); },
    getWithMetadata: (...a) => echt.getWithMetadata(...a),
    getMetadata: (...a) => echt.getMetadata(...a),
    set: (...a) => echt.set(...a),
    setJSON: (...a) => echt.setJSON(...a),
    setJSONWennNeu: (...a) => echt.setJSONWennNeu(...a),
    delete: async (k) => { if (del(k)) throw fehler(); return echt.delete(k); },
    list: async (o) => { if (list(o)) throw fehler(); return echt.list(o); },
  };
}
const anzahlMit = async (praefix) => (await laden().list({ prefix: praefix })).blobs.length;

/* Diese Datei stellt weit mehr als 40 Einladungen in zehn Minuten aus. Die Gesamtgrenze der Art `zugaenge`
   (WEITERE, installationsweit) ist hier nicht Gegenstand — sie wird wie die Einzelgrenzen oben angehoben. */
beforeAll(async () => {
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.WEITERE)) for (const dim of Object.keys(schutz.WEITERE[art]))
    schutz.WEITERE[art][dim] = { ...schutz.WEITERE[art][dim], versuche: 100000 };
});

describe("M1: unter Pflicht prüft der Endpunkt den zweiten Faktor gegen die WIRKSAME Rolle", () => {
  it("als Mitarbeiter ohne Faktor angemeldet, danach zur Leitung gemacht: 401, Sitzung beendet, nichts ausgestellt", async () => {
    await personSetzen("hm", "mitarbeiter");
    await personSetzen("hz", "mitarbeiter");
    const tok = await sitzung("EIN6-HOCH-0006", "mitarbeiter", "hm");
    await personSetzen("hm", "leitung");
    const vorher = await anzahlMit("token:");
    process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
    let r;
    try { r = await einladen(tok, { personId: "hz" }); }
    finally { delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT; }
    expect(r.status, r.roh).toBe(401);
    expect(r.zweifaktor).toBe("neu-anmelden");
    expect(r.einladung).toBeUndefined();
    expect(await anzahlMit("token:")).toBe(vorher);
    /* Die Sitzung ist beendet — auch ohne Pflicht trägt sie danach nichts mehr. */
    const danach = await einladen(tok, { personId: "hz" });
    expect(danach.status, danach.roh).toBe(401);
  });
});

describe("M2: Lesefehler sind kein „gibt es nicht“; eingelöst ist nur, was nachweisbar entwertet ist", () => {
  it("Konten nicht lesbar beim Ausstellen: 503, keine Einladung angelegt", async () => {
    await personSetzen("lf1", "mitarbeiter");
    const echt = laden();
    const kaputt = stoerAblage(echt, { list: (o) => String((o && o.prefix) || "").startsWith("konto:") });
    const vorher = await anzahlMit("token:");
    const r = await E.einladungAusstellen(kaputt, { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: "lf1" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.status).toBe(503);
    expect(await anzahlMit("token:")).toBe(vorher);
  });

  it("Kollisionsprüfung des neuen Codes nicht lesbar: 503 „neu einladen lassen“, kein Zugang, Einladung bleibt gesperrt", async () => {
    await personSetzen("lf2", "mitarbeiter");
    const echt = laden();
    const r = await E.einladungAusstellen(echt, { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: "lf2" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const bekannt = new Set((await echt.list({ prefix: "konto:" })).blobs.map((b) => b.key));
    /* Jeder Lesezugriff auf ein Konto, das es noch nicht gibt (= der Kandidat für den neuen Code), scheitert. */
    const kaputt = stoerAblage(echt, { get: (k) => k.startsWith("konto:") && !bekannt.has(k) });
    const z = await E.einladungEinloesen(kaputt, { einladung: r.einladung,
      bestandLesen: (raum) => B.bestandLesenStreng(echt, raum) });
    expect(z.ok, JSON.stringify(z)).toBe(false);
    expect(z.status).toBe(503);
    expect(z.fehler).toMatch(/neu einladen/);           // N1
    expect(await kontenDerPerson("lf2")).toHaveLength(0);
    expect((await annehmen(r.einladung)).status).toBe(410);
    expect(await kontenDerPerson("lf2")).toHaveLength(0);
  });

  it("Token lässt sich nicht löschen: 503 „neu einladen lassen“, und es lässt sich danach nicht mehr einlösen", async () => {
    await personSetzen("lf3", "mitarbeiter");
    const echt = laden();
    const r = await E.einladungAusstellen(echt, { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: "lf3" });
    const kaputt = stoerAblage(echt, { del: (k) => k.startsWith("token:") });
    const z = await E.einladungEinloesen(kaputt, { einladung: r.einladung,
      bestandLesen: (raum) => B.bestandLesenStreng(echt, raum) });
    expect(z.status, JSON.stringify(z)).toBe(503);
    expect(z.fehler).toMatch(/neu einladen/);
    expect(await kontenDerPerson("lf3")).toHaveLength(0);
    const zweit = await annehmen(r.einladung);
    expect(zweit.status, zweit.roh).toBe(410);
    expect(await kontenDerPerson("lf3")).toHaveLength(0);
  });

  it("token.mjs: scheitert das Löschen, gibt es kein Ergebnis, und das Token bleibt gesperrt", async () => {
    const T2 = await import("../server/lib/token.mjs");
    const echt = laden();
    const { token } = await T2.tokenAusstellen(echt, { zweck: "verifizierung", nr: 1, inhalt: { probe: "m2" } });
    const kaputt = stoerAblage(echt, { del: (k) => k.startsWith("token:") });
    const erst = await T2.tokenEinloesen(kaputt, token, { zweck: "verifizierung" });
    expect(erst.eintrag).toBe(null);
    expect(erst.grund).toBe("nicht-entwertet");
    const zweit = await T2.tokenEinloesen(echt, token, { zweck: "verifizierung" });
    expect(zweit.eintrag).toBe(null);
    expect((await T2.tokenAnsehen(echt, token, { zweck: "verifizierung" })).eintrag).toBe(null);
  });
});

describe("N2/N3: Laufnummer unter der Sperre, Codes ohne Modulo-Schieflage", () => {
  it("zwei gleichzeitige Einladungen für dieselbe Person: genau eine lässt sich einlösen", async () => {
    await personSetzen("lf4", "mitarbeiter");
    const bst = await bestandJetzt();
    const [a, b] = await Promise.all([1, 2].map(() =>
      E.einladungAusstellen(laden(), { sitzung: leitungSitz(), bestand: bst, personId: "lf4" })));
    expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
    const z = await Promise.all([annehmen(a.einladung), annehmen(b.einladung)]);
    expect(z.map((x) => x.status).sort()).toEqual([200, 410]);
    expect(await kontenDerPerson("lf4")).toHaveLength(1);
  });

  it("die Codes bestehen nur aus dem Alphabet und haben die Form XXXX-XXXX-XXXX; gezogen wird verwerfend", async () => {
    for (let i = 0; i < 500; i += 1) expect(E._neuerCode()).toMatch(/^[ACDEFGHJKLMNPQRTUVWXY34679]{4}(-[ACDEFGHJKLMNPQRTUVWXY34679]{4}){2}$/);
    const { readFile } = await import("node:fs/promises");
    const q = await readFile(new URL("../server/lib/einladungen.mjs", import.meta.url), "utf8");
    expect(q).not.toMatch(/ALPHABET\[b % ALPHABET\.length\]\)\.join/);
    expect(q).toMatch(/if \(b >= GRENZE\) continue;/);
  });
});

describe("B1: frische Bestätigung beim Ausstellen (höchstens fünf Minuten)", () => {
  let alt;
  beforeAll(async () => {
    for (const id of ["fb1", "fb2", "fb3"]) await personSetzen(id, "mitarbeiter");
    alt = await sitzung("EIN7-LEIT-0007", "leitung", "al");
    await sitzungAltern(alt, 10);
  });

  it("Anmeldung älter als fünf Minuten, keine Bestätigung: 403, nichts ausgestellt", async () => {
    const vorher = await anzahlMit("token:");
    const r = await einladen(alt, { personId: "fb1" });
    expect(r.status, r.roh).toBe(403);
    expect(r.bestaetigung).toBe("zugangscode");
    expect(r.einladung).toBeUndefined();
    expect(await anzahlMit("token:")).toBe(vorher);
  });
  it("falscher oder fremder Zugangscode als Bestätigung: 403", async () => {
    expect((await einladen(alt, { personId: "fb1", bestaetigung: { zugangscode: "FALS-CHER-CODE" } })).status).toBe(403);
    /* Ein gültiger Code — aber nicht der dieser Anmeldung. */
    expect((await einladen(alt, { personId: "fb1", bestaetigung: { zugangscode: "EIN1-LEIT-0001" } })).status).toBe(403);
  });
  it("der eigene Zugangscode als Bestätigung: 200", async () => {
    const r = await einladen(alt, { personId: "fb1", bestaetigung: { zugangscode: "EIN7-LEIT-0007" } });
    expect(r.status, r.roh).toBe(200);
  });
  it("eine Anmeldung von vor vier Minuten genügt; eine von vor sechs nicht", async () => {
    const t = await sitzung("EIN9-LEIT-0009", "leitung", "al");
    await sitzungAltern(t, 4);
    expect((await einladen(t, { personId: "fb2" })).status).toBe(200);
    await sitzungAltern(t, 6);
    expect((await einladen(t, { personId: "fb3" })).status).toBe(403);
  });
  it("Sitzung aus einem Konto: nur das Passwort bestätigt, eine junge Arbeitssitzung nicht", async () => {
    const A = await import("../server/lib/accounts.mjs");
    const { passwortAblegen } = await import("../server/lib/passwoerter.mjs");
    const a = await A.accountAnlegen(laden(), { email: "leitung-probe@example.org", status: "aktiv",
      passwort: await passwortAblegen("pruefpasswort-richtig-123"), emailVerifiziertAm: new Date().toISOString() });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    const s = { ...leitungSitz(), seit: Date.now(), herkunft: { art: "account", accountId: a.account.id } };
    expect((await E.frischeBestaetigung(laden(), { sitzung: s })).ok).toBe(false);
    expect((await E.frischeBestaetigung(laden(), { sitzung: s, bestaetigung: { passwort: "pruefpasswort-falsch-1" } })).status).toBe(403);
    expect((await E.frischeBestaetigung(laden(), { sitzung: s, bestaetigung: { passwort: "pruefpasswort-richtig-123" } })).ok).toBe(true);
  });
});

describe("B2: Einladungsverwaltung — Liste ohne Token, Status, Widerruf", () => {
  let offen, eingeloest;
  beforeAll(async () => {
    for (const id of ["vw1", "vw2", "vw3"]) await personSetzen(id, "mitarbeiter");
    offen = await einladen(T.leitung, { personId: "vw1" });
    eingeloest = await einladen(T.leitung, { personId: "vw2" });
    expect((await annehmen(eingeloest.einladung)).status).toBe(200);
  });

  it("die Liste zeigt Person, Rolle, Ausstellung, Ablauf und Status — und nie ein Token", async () => {
    const l = await liste(T.leitung);
    expect(l.status, l.roh).toBe(200);
    const o = l.einladungen.find((e) => e.id === offen.id);
    expect(o).toMatchObject({ person: { id: "vw1", name: "Testvw1 Personvw1" }, rolle: "mitarbeiter", status: "offen" });
    expect(typeof o.ausgestellt).toBe("string");
    expect(o.bis).toBe(offen.bis);
    const e = l.einladungen.find((x) => x.id === eingeloest.id);
    expect(e.status).toBe("eingeloest");
    expect(typeof e.am).toBe("string");
    expect(l.roh).not.toContain(offen.einladung);
    expect(l.roh).not.toContain(eingeloest.einladung);
    expect(l.roh).not.toMatch(/"(einladung|token|tokenSchluessel)"/);
  });
  it("die Einlösung wird der Leitung einmal als neu gemeldet (B5)", async () => {
    await personSetzen("vw4", "mitarbeiter");
    await liste(T.leitung);                       // alles bisher Gesehene gilt als gesehen
    const r = await einladen(T.leitung, { personId: "vw4" });
    expect((await annehmen(r.einladung)).status).toBe(200);
    const l1 = await liste(T.leitung);
    expect(l1.neuEingeloest).toBe(1);
    expect(l1.einladungen.find((x) => x.id === r.id).neu).toBe(true);
    const l2 = await liste(T.leitung);
    expect(l2.neuEingeloest).toBe(0);
  });
  it("widerrufen sperrt dauerhaft: Einlösen danach einheitlich 410, Status „widerrufen“", async () => {
    const w = await widerrufen(T.leitung, offen.id);
    expect(w.status, w.roh).toBe(200);
    const z = await annehmen(offen.einladung);
    expect(z.status, z.roh).toBe(410);
    expect(z.fehler).toBe(E.EINLADUNG_UNGUELTIG);
    expect(await kontenDerPerson("vw1")).toHaveLength(0);
    expect((await liste(T.leitung)).einladungen.find((x) => x.id === offen.id).status).toBe("widerrufen");
    expect((await widerrufen(T.leitung, offen.id)).status).toBe(200);   // nochmal: bleibt widerrufen
  });
  it("eine eingelöste Einladung lässt sich nicht widerrufen (409 — Zugang sperren)", async () => {
    expect((await widerrufen(T.leitung, eingeloest.id)).status).toBe(409);
  });
  it("eine ersetzte Einladung steht als widerrufen in der Liste", async () => {
    const a = await einladen(T.leitung, { personId: "vw3" });
    const b = await einladen(T.leitung, { personId: "vw3" });
    const l = await liste(T.leitung);
    expect(l.einladungen.find((x) => x.id === a.id)).toMatchObject({ status: "widerrufen", ersetzt: true });
    expect(l.einladungen.find((x) => x.id === b.id).status).toBe("offen");
  });
  it("abgelaufen steht als abgelaufen in der Liste", async () => {
    await personSetzen("vw5", "mitarbeiter");
    const r = await E.einladungAusstellen(laden(), { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: "vw5",
      jetzt: () => Date.now() - 8 * 24 * 3600 * 1000 });
    expect((await liste(T.leitung)).einladungen.find((x) => x.id === r.id).status).toBe("abgelaufen");
  });
  it("Mandantentrennung und Rechte: fremder Betrieb sieht nichts und widerruft nichts; ohne Rollenvergabe 403", async () => {
    const lb = await liste(T.leitungB);
    expect(lb.status).toBe(200);
    expect(lb.einladungen.some((x) => x.id === offen.id || x.id === eingeloest.id)).toBe(false);
    const neu = await einladen(T.leitung, { personId: "vw3" });
    expect((await widerrufen(T.leitungB, neu.id)).status).toBe(404);
    for (const t of [T.planer, T.mitarbeiter, T.demo]) {
      expect((await liste(t)).status).toBe(403);
      expect((await widerrufen(t, neu.id)).status).toBe(403);
    }
    expect((await liste(null)).status).toBe(401);
    expect((await widerrufen(T.leitung, "../../x")).status).toBe(400);
    expect((await annehmen(neu.einladung)).status).toBe(200);
  });
});

/* ==========================================================================
   Auflagen aus dem Sicherheitsreview WP-18 (M-1, N-1; N-2 am Dateiende)
   Vorher-rot auf 13331cf: docs/acc45/WP-18-NACHWEIS.md, „Auflagen aus dem Sicherheitsreview".
   ========================================================================== */

describe("M-1 (Sicherheitsreview): der Vermerk „fertig“ nach dem Anlegen des Zugangs schlägt nicht stillschweigend fehl", () => {
  /** Die echte Ablage; nur das Schreiben des Vermerks „fertig“ scheitert die ersten `wieOft` Male. */
  const vermerkStoer = (echt, wieOft) => {
    let n = 0;
    const basis = stoerAblage(echt);
    return { versuche: () => n, ablage: { ...basis, setJSON: async (k, v, o) => {
      if (String(k).startsWith("einladungsstatus:") && v && v.fertig === true) {
        n += 1;
        if (n <= wieOft) throw Object.assign(new Error("EIO: Ablage gestört (Prüfung)"), { code: "EIO" });
      }
      return echt.setJSON(k, v, o);
    } } };
  };

  it("Vermerk dauerhaft nicht schreibbar: Code kommt an, Liste zeigt „eingelöst“ (nicht „verbraucht“), neu gezählt", async () => {
    await personSetzen("mf1", "mitarbeiter");
    await liste(T.leitung);                       // alles bisher Gesehene gilt als gesehen
    const echt = laden();
    const r = await E.einladungAusstellen(echt, { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: "mf1" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const st = vermerkStoer(echt, Infinity);
    const z = await E.einladungEinloesen(st.ablage, { einladung: r.einladung,
      bestandLesen: (raum) => B.bestandLesenStreng(echt, raum) });
    /* Der Einlösende bekommt weiterhin seinen Code, und er meldet an. */
    expect(z.ok, JSON.stringify(z)).toBe(true);
    expect(z.zugangscode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect((await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: z.zugangscode } })).person).toBe("mf1");
    expect(await kontenDerPerson("mf1")).toHaveLength(1);
    /* Der Vermerk blieb halb (fertig: false). */
    expect((await echt.get(`einladungsstatus:${r.id}`, { type: "json" })).fertig).toBe(false);
    /* Die Liste leitet „eingelöst“ aus dem Konto mit der Einladungskennung ab. */
    const l = await liste(T.leitung);
    expect(l.status, l.roh).toBe(200);
    const e = l.einladungen.find((x) => x.id === r.id);
    expect(e.status).not.toBe("verbraucht");
    expect(e.status).toBe("eingeloest");
    expect(e.neu).toBe(true);
    expect(l.neuEingeloest).toBe(1);
    expect((await liste(T.leitung)).neuEingeloest).toBe(0);
    /* Beide Schreibversuche (der erste und die Wiederholung) sind gescheitert. */
    expect(st.versuche()).toBe(2);
  });

  it("ein gescheiterter Schreibversuch wird wiederholt: danach steht „fertig“", async () => {
    await personSetzen("mf2", "mitarbeiter");
    const echt = laden();
    const r = await E.einladungAusstellen(echt, { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: "mf2" });
    const st = vermerkStoer(echt, 1);
    const z = await E.einladungEinloesen(st.ablage, { einladung: r.einladung,
      bestandLesen: (raum) => B.bestandLesenStreng(echt, raum) });
    expect(z.ok, JSON.stringify(z)).toBe(true);
    expect(st.versuche()).toBe(2);
    expect(await echt.get(`einladungsstatus:${r.id}`, { type: "json" })).toMatchObject({ status: "eingeloest", fertig: true });
  });
});

describe("N-1 (Sicherheitsreview): erst die Rechte, dann die Bestätigung — keine Unterscheidung ohne Rollenvergabe", () => {
  const ORGA = { fehler: "Einladungen verwaltet die Organisationsleitung." };

  it("Zugangscode-Sitzung ohne roles.assign: ohne, mit falschem, mit richtigem Code und mit TOTP dieselbe Antwort", async () => {
    await personSetzen("nr1", "mitarbeiter");
    const t = await sitzung("EINB-PLAN-0011", "planer", "ap");
    await sitzungAltern(t, 10);                   // älter als fünf Minuten: die Bestätigung würde verlangt
    const antworten = [];
    for (const bestaetigung of [undefined, { zugangscode: "FALS-CHER-CODE" }, { zugangscode: "EINB-PLAN-0011" },
      { zweifaktor: "000000" }]) {
      const r = await einladen(t, { personId: "nr1", ...(bestaetigung ? { bestaetigung } : {}) });
      antworten.push({ status: r.status, rumpf: JSON.parse(r.roh) });
    }
    for (const a of antworten) expect(a).toEqual({ status: 403, rumpf: ORGA });
    expect(await kontenDerPerson("nr1")).toHaveLength(0);
  });

  it("Konto-Sitzung ohne roles.assign: falsches Passwort bekommt dieselbe Antwort wie richtiges (403 keine Rollenvergabe)", async () => {
    await personSetzen("nr2", "mitarbeiter");
    const A = await import("../server/lib/accounts.mjs");
    const { passwortAblegen } = await import("../server/lib/passwoerter.mjs");
    const AC = await import("../server/lib/accountsitzungen.mjs");
    const BA = await import("../server/lib/betriebsauswahl.mjs");
    const RICHTIG = "pruefpasswort-planer-richtig-123";
    const k = await A.accountAnlegen(laden(), { email: "planer-probe@example.org" });
    expect(k.ok, JSON.stringify(k)).toBe(true);
    await A.emailBestaetigen(laden(), k.account.id);
    const g = await A.passwortSetzen(laden(), k.account.id, await passwortAblegen(RICHTIG));
    expect(g.ok, JSON.stringify(g)).toBe(true);
    const m = await A.mitgliedschaftAnlegen(laden(), { accountId: k.account.id, raum: RAUM, betrieb: 0,
      mandantId: "m-a", person: "ap", rolle: "planer", status: "aktiv" });
    expect(m.ok, JSON.stringify(m)).toBe(true);
    const konto = await A.accountLesenPerId(laden(), k.account.id);
    const as = await AC.accountSitzungAnlegen({ accountId: k.account.id, epoche: konto.epoche });
    expect(as.ok).toBe(true);
    const wahl = await BA.betriebWaehlen(laden(), { accountId: k.account.id, raum: RAUM,
      kontoSitzung: { id: AC.accountSitzungsId(as.token), bis: as.gueltigBis } });
    expect(wahl.ok, JSON.stringify(wahl)).toBe(true);
    const dreimal = async () => {
      const falsch = await einladen(wahl.token, { personId: "nr2", bestaetigung: { passwort: "pruefpasswort-planer-falsch-9" } });
      const richtig = await einladen(wahl.token, { personId: "nr2", bestaetigung: { passwort: RICHTIG } });
      const ohne = await einladen(wahl.token, { personId: "nr2" });
      return [falsch, richtig, ohne].map((r) => ({ status: r.status, rumpf: JSON.parse(r.roh) }));
    };
    /* Heute trägt eine Arbeitssitzung aus einem Konto keine Betriebskennung (betriebsauswahl.mjs): Sie scheitert an
       „Betrieb nicht eindeutig“ — vor dem Fix erfuhr sie trotzdem, ob ihr Passwort stimmt. */
    const heute = await dreimal();
    for (const a of heute) expect(a).toEqual(heute[1]);
    expect(heute[1].status).toBe(403);
    expect(heute[1].rumpf.bestaetigung).toBeUndefined();
    /* Mit Betriebskennung (wie eine Sitzung aus einem Zugangscode) bleibt es bei der fehlenden Rollenvergabe. */
    const { sitzungsSpeicher, sitzungsSchluessel } = await import("../server/lib/sitzungen.mjs");
    const sp = sitzungsSpeicher();
    const roh = await sp.get(sitzungsSchluessel(wahl.token), { type: "json" });
    await sp.setJSON(sitzungsSchluessel(wahl.token), { ...roh, mandantId: "m-a" });
    for (const a of await dreimal()) expect(a).toEqual({ status: 403, rumpf: ORGA });
    expect(await kontenDerPerson("nr2")).toHaveLength(0);
  });
});

/* ==========================================================================
   KONTOSITZUNG MIT BETRIEBSKENNUNG (WP-18-Nachtrag, Branch acc45/betriebsauswahl/mandant)

   Eine Arbeitssitzung aus Konto + Betriebsauswahl trägt die Kennung (mandantId) des gewählten Betriebs — nur wenn
   die Mitgliedschaft aktiv ist und sowohl die Rolle der Mitgliedschaft als auch die wirksame Rolle der Person eine
   Funktionsrolle ist (leitung, planer, subplaner, kunde). Die Kennung gibt keine Rolle und kein Recht: Ob eine
   Einladung ausgestellt werden darf, entscheidet weiter `roles.assign` gegen die wirksame Rolle.
   Nur erfundene Testdaten.
   ========================================================================== */
describe("Kontositzung mit Betriebskennung", () => {
  const RAUM_B = "einladung-probe-zwei";
  const PW = "pruefpasswort-kontowahl-richtig-123";
  let A, AC, BA, S;

  beforeAll(async () => {
    A = await import("../server/lib/accounts.mjs");
    AC = await import("../server/lib/accountsitzungen.mjs");
    BA = await import("../server/lib/betriebsauswahl.mjs");
    S = await import("../server/lib/sitzungen.mjs");
    /* Ein zweiter Raum mit einem eigenen Betrieb: Dort ist die Leitung aus Raum A nur Mitarbeiterin. */
    await B.bestandSchreiben(laden(), RAUM_B, { version: 9, stand: 1, session: null, mandanten: [
      betrieb("m-z", "Testbetrieb Z", [person("zl", "mitarbeiter"), person("zm", "mitarbeiter")]),
    ] }, { durch: "Pruefung" });
  });

  /** Ein aktives Konto mit Passwort. */
  async function kontoMitPasswort(email) {
    const { passwortAblegen } = await import("../server/lib/passwoerter.mjs");
    const k = await A.accountAnlegen(laden(), { email });
    expect(k.ok, JSON.stringify(k)).toBe(true);
    await A.emailBestaetigen(laden(), k.account.id);
    const g = await A.passwortSetzen(laden(), k.account.id, await passwortAblegen(PW));
    expect(g.ok, JSON.stringify(g)).toBe(true);
    return k.account.id;
  }
  /** Mitgliedschaft anlegen. */
  async function mitglied(accountId, raum, { betrieb: bNr = 0, mandantId = "m-a", person: pid, rolle }) {
    const m = await A.mitgliedschaftAnlegen(laden(), { accountId, raum, betrieb: bNr, mandantId, person: pid, rolle,
      status: "aktiv" });
    expect(m.ok, JSON.stringify(m)).toBe(true);
  }
  /** Anmelden (Account-Sitzung) und den Raum wählen — derselbe Weg wie /api/account/betrieb. */
  async function waehlen(accountId, raum) {
    const konto = await A.accountLesenPerId(laden(), accountId);
    const as = await AC.accountSitzungAnlegen({ accountId, epoche: konto.epoche });
    expect(as.ok).toBe(true);
    return BA.betriebWaehlen(laden(), { accountId, raum,
      kontoSitzung: { id: AC.accountSitzungsId(as.token), bis: as.gueltigBis } });
  }
  const roh = async (token) => S.sitzungsSpeicher().get(S.sitzungsSchluessel(token), { type: "json" });

  it("1. Leitung mit Konto wählt Betrieb A: Sitzung trägt mandantId A, Einladung 200", async () => {
    await personSetzen("kw1", "mitarbeiter");
    const id = await kontoMitPasswort("kontowahl-leitung@example.org");
    await mitglied(id, RAUM, { person: "al", rolle: "leitung" });
    const wahl = await waehlen(id, RAUM);
    expect(wahl.ok, JSON.stringify(wahl)).toBe(true);
    if (!wahl.ok) return;
    expect(wahl.rolle).toBe("leitung");
    const s = await roh(wahl.token);
    expect(s.mandantId).toBe("m-a");
    expect(s.betrieb).toBe(0);
    expect(s.rolle).toBe("leitung");
    expect(s.demo).toBe(undefined);
    expect(s.nurSicherung).toBe(undefined);
    /* Ohne Passwort verlangt die Prüfung die Bestätigung (B1) — die Rechteprüfung ist also schon bestanden. */
    const ohne = await einladen(wahl.token, { personId: "kw1" });
    expect(ohne.status, ohne.roh).toBe(403);
    expect(ohne.bestaetigung).toBe("passwort");
    const r = await einladen(wahl.token, { personId: "kw1", bestaetigung: { passwort: PW } });
    expect(r.status, r.roh).toBe(200);
    expect(r.rolle).toBe("mitarbeiter");
    /* Die Einladung gehört zu Betrieb A. */
    const z = await annehmen(r.einladung);
    expect(z.status, z.roh).toBe(200);
    const k = await kontenDerPerson("kw1");
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ mandantId: "m-a", betrieb: 0, rolle: "mitarbeiter" });
  });

  it("2. dieselbe Person wählt Betrieb B, in dem sie nur Mitarbeiterin ist: keine mandantId, Einladung 403", async () => {
    const id = await kontoMitPasswort("kontowahl-zwei@example.org");
    await mitglied(id, RAUM, { person: "al", rolle: "leitung" });
    await mitglied(id, RAUM_B, { mandantId: "m-z", person: "zl", rolle: "mitarbeiter" });
    const a = await waehlen(id, RAUM);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect((await roh(a.token)).mandantId).toBe("m-a");
    const b = await waehlen(id, RAUM_B);
    expect(b.ok, JSON.stringify(b)).toBe(true);
    if (!b.ok) return;
    expect(b.rolle).toBe("mitarbeiter");
    const sb = await roh(b.token);
    expect(Object.prototype.hasOwnProperty.call(sb, "mandantId")).toBe(false);
    for (const bestaetigung of [undefined, { passwort: PW }]) {
      const r = await einladen(b.token, { personId: "zm", ...(bestaetigung ? { bestaetigung } : {}) });
      expect(r.status, r.roh).toBe(403);
      expect(r.einladung).toBeUndefined();
    }
  });

  it("3. Mitarbeitende und Schichtverantwortung mit Konto: Einladung 403, kein Rechtegewinn", async () => {
    await personSetzen("kw3", "mitarbeiter");
    const fall = [{ email: "kontowahl-mita@example.org", person: "am5", rolle: "mitarbeiter", kennung: false },
      { email: "kontowahl-sub@example.org", person: "as", rolle: "subplaner", kennung: true }];
    for (const f of fall) {
      const id = await kontoMitPasswort(f.email);
      await mitglied(id, RAUM, { person: f.person, rolle: f.rolle });
      const w = await waehlen(id, RAUM);
      expect(w.ok, JSON.stringify(w)).toBe(true);
      if (!w.ok) continue;
      expect(w.rolle).toBe(f.rolle);
      const s = await roh(w.token);
      /* Die Rolle bleibt die der Mitgliedschaft; die Kennung trägt nur die Funktionsrolle. */
      expect(s.rolle).toBe(f.rolle);
      expect(s.mandantId).toBe(f.kennung ? "m-a" : undefined);
      for (const bestaetigung of [undefined, { passwort: PW }]) {
        const r = await einladen(w.token, { personId: "kw3", ...(bestaetigung ? { bestaetigung } : {}) });
        expect(r.status, `${f.rolle}: ${r.roh}`).toBe(403);
        expect(r.einladung).toBeUndefined();
      }
    }
    expect(await kontenDerPerson("kw3")).toHaveLength(0);
  });

  it("Mitgliedschaft als Leitung, Person im Bestand inzwischen Mitarbeiterin: keine mandantId, Einladung 403", async () => {
    await personSetzen("kw4", "leitung");
    await personSetzen("kw5", "mitarbeiter");
    const id = await kontoMitPasswort("kontowahl-herab@example.org");
    await mitglied(id, RAUM, { person: "kw4", rolle: "leitung" });
    await personSetzen("kw4", "mitarbeiter");
    const w = await waehlen(id, RAUM);
    expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) return;
    expect(w.rolle).toBe("mitarbeiter");
    expect((await roh(w.token)).mandantId).toBe(undefined);
    const r = await einladen(w.token, { personId: "kw5", bestaetigung: { passwort: PW } });
    expect(r.status, r.roh).toBe(403);
  });

  it("4. ein Konto ohne Mitgliedschaft in B kann B nicht wählen (unverändert)", async () => {
    const id = await kontoMitPasswort("kontowahl-fremd@example.org");
    await mitglied(id, RAUM, { person: "ap", rolle: "planer" });
    const vorher = (await S.sitzungsSpeicher().list({ prefix: "t:" })).blobs.length;
    const w = await waehlen(id, RAUM_B);
    expect(w).toEqual({ ok: false, grund: "keine-mitgliedschaft" });
    expect((await S.sitzungsSpeicher().list({ prefix: "t:" })).blobs.length).toBe(vorher);
  });

  it("4b. eine nicht aktive Mitgliedschaft ergibt keine Sitzung und damit keine Kennung", async () => {
    const id = await kontoMitPasswort("kontowahl-ruht@example.org");
    await mitglied(id, RAUM, { person: "al", rolle: "leitung" });
    await A.mitgliedschaftEntziehen(laden(), id, RAUM);
    const vorher = (await S.sitzungsSpeicher().list({ prefix: "t:" })).blobs.length;
    const w = await waehlen(id, RAUM);
    expect(w.ok).toBe(false);
    expect((await S.sitzungsSpeicher().list({ prefix: "t:" })).blobs.length).toBe(vorher);
  });

  it("5. Demo: über die Betriebsauswahl entsteht keine Demo-Sitzung und keine Kennung", async () => {
    const id = await kontoMitPasswort("kontowahl-demo@example.org");
    const vorher = (await S.sitzungsSpeicher().list({ prefix: "t:" })).blobs.length;
    for (const raum of ["demo-probe", "Demo-Pflege"]) {
      expect(await waehlen(id, raum)).toEqual({ ok: false, grund: "raum" });
    }
    expect((await S.sitzungsSpeicher().list({ prefix: "t:" })).blobs.length).toBe(vorher);
  });

  it("eine Kennung, die nicht zur Mitgliedschaft passt, macht die Sitzung ungültig (kein Umbiegen auf Betrieb B)", async () => {
    const id = await kontoMitPasswort("kontowahl-umbiegen@example.org");
    await mitglied(id, RAUM, { person: "ap", rolle: "planer" });
    const w = await waehlen(id, RAUM);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const s = await roh(w.token);
    expect(s.mandantId).toBe("m-a");
    await S.sitzungsSpeicher().setJSON(S.sitzungsSchluessel(w.token), { ...s, mandantId: "m-b" });
    const r = await einladen(w.token, { personId: "bm", bestaetigung: { passwort: PW } });
    expect(r.status, r.roh).toBe(401);
    expect(await roh(w.token)).toBe(null);
  });

  it("die Antwort der Auswahl nennt keine Betriebskennung", async () => {
    const id = await kontoMitPasswort("kontowahl-antwort@example.org");
    await mitglied(id, RAUM, { person: "al2", rolle: "leitung" });
    const w = await waehlen(id, RAUM);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(Object.keys(w).sort()).toEqual(["betrieb", "gueltigBis", "name", "ok", "person", "raum", "rolle", "token"]);
    expect(JSON.stringify(w)).not.toContain("m-a");
  });

  /* ------------------------------------------------------------------------
     Auflagen A1/A2 aus dem Sicherheitsreview von 181b4fe (Branch acc45/betriebsauswahl/mandant-a).
     A1: Der Konto-Zweig von arbeitssitzungPruefen prüft dieselbe Personenregel wie der Code-Zweig (aktivePerson:
         Status, Austritt, Anonymisierung) — für jede Kontositzung, nicht nur für Funktionsrollen.
     A2: Negativfälle mit einer Sitzung, die die Kennung schon trägt (nach der Auswahl).
     Vorher-rot: docs/acc45/WP-18-NACHWEIS.md, Abschnitt „Auflagen A1–A3".
     ------------------------------------------------------------------------ */
  const AS = () => import("../server/lib/arbeitssitzung.mjs");
  /** Felder einer Person in Betrieb A ändern (so, wie die Personalliste es schreibt). */
  async function personAendern(id, felder, raum = RAUM, idx = 0) {
    const g = await B.bestandLesen(laden(), raum);
    const neu = structuredClone(g.bestand);
    const p = neu.mandanten[idx].personen.find((x) => x.id === id);
    expect(p, `Person ${id}`).toBeTruthy();
    Object.assign(p, felder);
    await B.bestandSchreiben(laden(), raum, neu, { durch: "Pruefung" });
  }
  /** Der Grund, aus dem die Sitzung nicht mehr gilt — ohne sie wegzuräumen (kein Merkmal übergeben). */
  const grundVon = async (token) => (await (await AS()).arbeitssitzungPruefen(laden(), await roh(token)));
  /** Leitung mit Konto, die Betrieb A gewählt hat und dort einladen darf (Ausgangslage A1). */
  async function leitungMitKennung(pid, email) {
    await personSetzen(pid, "leitung");
    const id = await kontoMitPasswort(email);
    await mitglied(id, RAUM, { person: pid, rolle: "leitung" });
    const w = await waehlen(id, RAUM);
    expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) throw new Error("Auswahl gescheitert");
    expect((await roh(w.token)).mandantId).toBe("m-a");
    return { id, token: w.token };
  }
  /** Erwartung: Sitzung ungültig — Einladung 401, keine Einladung, Sitzung gelöscht. */
  async function erwarteUngueltig(token, personId) {
    const r = await einladen(token, { personId, bestaetigung: { passwort: PW } });
    expect(r.status, r.roh).toBe(401);
    expect(r.einladung).toBeUndefined();
    expect(await roh(token)).toBe(null);
  }

  it("A1: Leitung mit Konto und Kennung, Person im Bestand „ausgetreten“ → Sitzung ungültig, Einladung 401", async () => {
    await personSetzen("a1z1", "mitarbeiter");
    const { token } = await leitungMitKennung("a1l1", "a1-ausgetreten@example.org");
    await personAendern("a1l1", { status: "ausgetreten" });
    expect(await grundVon(token)).toEqual({ ok: false, grund: "person-fort" });
    await erwarteUngueltig(token, "a1z1");
  });

  it("A1: Austritt in der Vergangenheit (Status noch „aktiv“) → ungültig", async () => {
    await personSetzen("a1z2", "mitarbeiter");
    const { token } = await leitungMitKennung("a1l2", "a1-austritt@example.org");
    await personAendern("a1l2", { austritt: "2020-06-30" });
    expect(await grundVon(token)).toEqual({ ok: false, grund: "person-fort" });
    await erwarteUngueltig(token, "a1z2");
  });

  it("A1: anonymisierte Person → ungültig", async () => {
    await personSetzen("a1z3", "mitarbeiter");
    const { token } = await leitungMitKennung("a1l3", "a1-anonym@example.org");
    await personAendern("a1l3", { anonym: true, vorname: "", nachname: "" });
    expect(await grundVon(token)).toEqual({ ok: false, grund: "person-fort" });
    await erwarteUngueltig(token, "a1z3");
  });

  it("A1: ausgetreten schon vor der Auswahl → die neue Sitzung gilt bei der ersten Anfrage nicht", async () => {
    await personSetzen("a1z4", "mitarbeiter");
    await personSetzen("a1l4", "leitung");
    await personAendern("a1l4", { status: "ausgetreten" });
    const id = await kontoMitPasswort("a1-vorher@example.org");
    await mitglied(id, RAUM, { person: "a1l4", rolle: "leitung" });
    const w = await waehlen(id, RAUM);
    /* Eine Absage schon bei der Auswahl wäre ebenso richtig — aber nur aus dem Grund, dass die Person nicht mehr gilt.
       Scheitert die Auswahl aus einem anderen Grund, prüft der Test nichts mehr und muss rot werden. */
    if (!w.ok) {
      expect(["person-fort", "person-fehlt"], `Auswahl scheiterte aus einem anderen Grund: ${JSON.stringify(w)}`).toContain(w.grund);
      return;
    }
    await erwarteUngueltig(w.token, "a1z4");
  });

  it("A1 gilt für jede Kontositzung: Mitarbeiterin ohne Kennung, ausgetreten → /api/bestand 401", async () => {
    await personSetzen("a1m5", "mitarbeiter");
    const id = await kontoMitPasswort("a1-mitarbeiterin@example.org");
    await mitglied(id, RAUM, { person: "a1m5", rolle: "mitarbeiter" });
    const w = await waehlen(id, RAUM);
    expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) return;
    expect((await roh(w.token)).mandantId).toBe(undefined);
    expect((await anfrage(daten, "/api/bestand", { methode: "GET", token: w.token })).status).toBe(200);
    await personAendern("a1m5", { status: "ausgetreten" });
    expect(await grundVon(w.token)).toEqual({ ok: false, grund: "person-fort" });
    const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: w.token });
    expect(g.status, g.roh).toBe(401);
    expect(await roh(w.token)).toBe(null);
  });

  it("A1 Gegenprobe: aktive Leitung (Austritt erst in der Zukunft) behält Sitzung und Einladungsrecht", async () => {
    await personSetzen("a1z6", "mitarbeiter");
    const { token } = await leitungMitKennung("a1l6", "a1-aktiv@example.org");
    await personAendern("a1l6", { austritt: "2099-12-31" });
    expect(await grundVon(token)).toEqual({ ok: true, art: "account" });
    const r = await einladen(token, { personId: "a1z6", bestaetigung: { passwort: PW } });
    expect(r.status, r.roh).toBe(200);
    expect(typeof r.einladung).toBe("string");
    expect((await roh(token)).mandantId).toBe("m-a");
  });

  it("A2a: Mitgliedschaft entzogen, NACHDEM die Sitzung mit Kennung besteht → ungültig", async () => {
    await personSetzen("a2z1", "mitarbeiter");
    const { id, token } = await leitungMitKennung("a2l1", "a2-entzug@example.org");
    await A.mitgliedschaftEntziehen(laden(), id, RAUM);
    const e = await grundVon(token);
    expect(e.ok).toBe(false);
    expect(["mitglied-status", "generation-mitglied"]).toContain(e.grund);
    await erwarteUngueltig(token, "a2z1");
  });

  it("A2b: Betrieb nach der Auswahl verschoben bzw. entfernt (mandant-verschoben) → ungültig", async () => {
    for (const [raum, nachher] of [
      ["einladung-probe-drei", (alt) => [betrieb("m-neu", "Neu davor", [person("nl", "leitung")]), alt]],
      ["einladung-probe-vier", () => [betrieb("m-x", "Ein anderer", [person("xl", "leitung")])]],
    ]) {
      const alt = betrieb("m-c", "Testbetrieb C", [person("cl", "leitung"), person("cm", "mitarbeiter")]);
      await B.bestandSchreiben(laden(), raum, { version: 9, stand: 1, session: null, mandanten: [alt] }, { durch: "Pruefung" });
      const id = await kontoMitPasswort(`a2-verschoben-${raum}@example.org`);
      await mitglied(id, raum, { mandantId: "m-c", person: "cl", rolle: "leitung" });
      const w = await waehlen(id, raum);
      expect(w.ok, JSON.stringify(w)).toBe(true);
      if (!w.ok) continue;
      expect((await roh(w.token)).mandantId).toBe("m-c");
      const g = await B.bestandLesen(laden(), raum);
      await B.bestandSchreiben(laden(), raum, { ...structuredClone(g.bestand), mandanten: nachher(alt) },
        { durch: "Pruefung" });
      expect(await grundVon(w.token)).toEqual({ ok: false, grund: "mandant-verschoben" });
      await erwarteUngueltig(w.token, "cm");
    }
  });

  it("A2c: Kennung der Mitgliedschaft nachträglich geändert (Datensatz der Mitgliedschaft neu geschrieben) → mandant-gewechselt, 401, Sitzung gelöscht", async () => {
    const raum = "einladung-probe-fuenf";
    await B.bestandSchreiben(laden(), raum, { version: 9, stand: 1, session: null, mandanten: [
      betrieb("m-d", "Testbetrieb D", [person("dl", "leitung"), person("dm", "mitarbeiter")]),
    ] }, { durch: "Pruefung" });
    const id = await kontoMitPasswort("a2-kennung@example.org");
    await mitglied(id, raum, { mandantId: "m-d", person: "dl", rolle: "leitung" });
    const w = await waehlen(id, raum);
    expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) return;
    expect((await roh(w.token)).mandantId).toBe("m-d");
    /* Der Betrieb bekommt eine neue Kennung, und die Mitgliedschaft wird mit ihr neu geschrieben — an ihrem
       Ablageschlüssel, den mitgliedschaftLesen liest (eine Funktion, die die Kennung einer Mitgliedschaft ändert,
       gibt es mit Absicht nicht, accounts.mjs). Der Sitzungsdatensatz bleibt unberührt. */
    const g = await B.bestandLesen(laden(), raum);
    const neu = structuredClone(g.bestand);
    neu.mandanten[0].id = "m-d2";
    await B.bestandSchreiben(laden(), raum, neu, { durch: "Pruefung" });
    const m = await A.mitgliedschaftLesen(laden(), id, raum);
    await laden().setJSON(A.mitgliedSchluessel(id, raum), { ...m, mandantId: "m-d2" });
    expect((await A.mitgliedschaftLesen(laden(), id, raum)).mandantId).toBe("m-d2");
    expect((await roh(w.token)).mandantId).toBe("m-d");
    expect(await grundVon(w.token)).toEqual({ ok: false, grund: "mandant-gewechselt" });
    await erwarteUngueltig(w.token, "dm");
  });

  it("A2d (Regression zu A1): Leitung über die Personenliste ausgeschieden → ungültig", async () => {
    await personSetzen("a2z4", "mitarbeiter");
    const { token } = await leitungMitKennung("a2l4", "a2-ausgeschieden@example.org");
    await personAendern("a2l4", { status: "ausgeschieden", austritt: "2026-01-31" });
    await erwarteUngueltig(token, "a2z4");
  });

  it("A2e (Spiegel zu 2.): Mitarbeiterin in Raum A, Leitung in Raum B → nur B trägt die Kennung", async () => {
    const g = await B.bestandLesen(laden(), RAUM_B);
    const neu = structuredClone(g.bestand);
    neu.mandanten[0].personen.push(person("zl2", "leitung"), person("zm2", "mitarbeiter"));
    await B.bestandSchreiben(laden(), RAUM_B, neu, { durch: "Pruefung" });
    await personSetzen("a2z5", "mitarbeiter");
    await personSetzen("a2m5", "mitarbeiter");
    const id = await kontoMitPasswort("kontowahl-spiegel@example.org");
    await mitglied(id, RAUM, { person: "a2m5", rolle: "mitarbeiter" });
    await mitglied(id, RAUM_B, { mandantId: "m-z", person: "zl2", rolle: "leitung" });
    const b = await waehlen(id, RAUM_B);
    expect(b.ok, JSON.stringify(b)).toBe(true);
    if (!b.ok) return;
    expect(b.rolle).toBe("leitung");
    expect((await roh(b.token)).mandantId).toBe("m-z");
    const a = await waehlen(id, RAUM);
    expect(a.ok, JSON.stringify(a)).toBe(true);
    if (!a.ok) return;
    expect(a.rolle).toBe("mitarbeiter");
    expect(Object.prototype.hasOwnProperty.call(await roh(a.token), "mandantId")).toBe(false);
    for (const bestaetigung of [undefined, { passwort: PW }]) {
      const r = await einladen(a.token, { personId: "a2z5", ...(bestaetigung ? { bestaetigung } : {}) });
      expect(r.status, r.roh).toBe(403);
      expect(r.einladung).toBeUndefined();
    }
    const r = await einladen(b.token, { personId: "zm2", bestaetigung: { passwort: PW } });
    expect(r.status, r.roh).toBe(200);
    expect(r.rolle).toBe("mitarbeiter");
  });

  /* ------------------------------------------------------------------------
     Gegenproben zu A1 (Delta-Review von ba5f7c5): Die Personenprüfung darf eine gültige Person nicht abweisen und muss
     jeden Status außer „aktiv" abweisen. Konto-Mitarbeiterin ohne Kennung, Betrieb A.
     ------------------------------------------------------------------------ */
  /** Mitarbeiterin mit Konto, Auswahl Betrieb A, Sitzung ohne Kennung. */
  async function mitarbeiterinMitKonto(pid, email) {
    await personSetzen(pid, "mitarbeiter");
    const id = await kontoMitPasswort(email);
    await mitglied(id, RAUM, { person: pid, rolle: "mitarbeiter" });
    const w = await waehlen(id, RAUM);
    expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) throw new Error("Auswahl gescheitert");
    return w.token;
  }
  const stempelnMit = (token, n) => anfrage(daten, "/api/stempeln", { token,
    rumpf: { art: "start", clientEventId: `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}` } });
  const auskunftMit = (token) => anfrage(daten, "/api/auskunft", { methode: "GET", token });
  const heuteBerlinText = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

  it("A1 Gegenprobe: aktive Mitarbeiterin mit Konto-Sitzung → POST /api/stempeln 200, Auskunft 200", async () => {
    const token = await mitarbeiterinMitKonto("g1m1", "g1-aktiv@example.org");
    expect(await grundVon(token)).toEqual({ ok: true, art: "account" });
    const s = await stempelnMit(token, 901);
    expect(s.status, s.roh).toBe(200);
    const a = await auskunftMit(token);
    expect(a.status, a.roh).toBe(200);
    expect(await roh(token)).not.toBe(null);
  });

  it("A1 Grenzfall: Austrittstag ist heute → Sitzung bleibt gültig (Stempeln und Auskunft 200)", async () => {
    const token = await mitarbeiterinMitKonto("g1m2", "g1-austrittstag@example.org");
    await personAendern("g1m2", { austritt: heuteBerlinText() });
    expect(await grundVon(token)).toEqual({ ok: true, art: "account" });
    const s = await stempelnMit(token, 902);
    expect(s.status, s.roh).toBe(200);
    expect((await auskunftMit(token)).status).toBe(200);
    expect(await roh(token)).not.toBe(null);
  });

  for (const [nummer, status] of [[903, "gesperrt"], [904, "inaktiv"]]) {
    it(`A1: Status „${status}" bei Konto-Sitzung → person-fort, Stempeln und Auskunft 401, Sitzung gelöscht`, async () => {
      const token = await mitarbeiterinMitKonto(`g1s${nummer}`, `g1-${status}@example.org`);
      expect((await stempelnMit(token, nummer)).status).toBe(200);
      await personAendern(`g1s${nummer}`, { status });
      expect(await grundVon(token)).toEqual({ ok: false, grund: "person-fort" });
      const s = await stempelnMit(token, nummer + 100);
      expect(s.status, s.roh).toBe(401);
      expect((await auskunftMit(token)).status).toBe(401);
      expect(await roh(token)).toBe(null);
    });
  }
});

describe("B3: Einmaligkeit über zwei Ablage-Instanzen und zwei Prozesse", () => {
  it("zwei Modul-Instanzen (eigene Reihen, eigene Raumsperren) lösen gleichzeitig ein: je Einladung genau ein Code", async () => {
    vi.resetModules();
    const E2 = await import("../server/lib/einladungen.mjs");
    const B2 = await import("../server/lib/bestand.mjs");
    const A2 = await import("../server/lib/ablage.mjs");
    const laden2 = () => A2.getStore({ name: "centric", consistency: "strong" });
    for (let i = 0; i < 4; i += 1) {
      const id = `zi${i}`;
      await personSetzen(id, "mitarbeiter");
      const r = await E.einladungAusstellen(laden(), { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: id });
      const z = await Promise.all([
        E.einladungEinloesen(laden(), { einladung: r.einladung, bestandLesen: (raum) => B.bestandLesenStreng(laden(), raum) }),
        E2.einladungEinloesen(laden2(), { einladung: r.einladung, bestandLesen: (raum) => B2.bestandLesenStreng(laden2(), raum) }),
      ]);
      expect(z.filter((x) => x.ok).length, JSON.stringify(z)).toBe(1);
      expect(await kontenDerPerson(id)).toHaveLength(1);
    }
  });

  it("zwei Node-Prozesse auf derselben Ablage lösen gleichzeitig ein: genau einer gewinnt", async () => {
    const { spawn } = await import("node:child_process");
    const url = (p) => new URL(p, import.meta.url).href;
    const skript = `
      const E = await import(${JSON.stringify(url("../server/lib/einladungen.mjs"))});
      const B = await import(${JSON.stringify(url("../server/lib/bestand.mjs"))});
      const A = await import(${JSON.stringify(url("../server/lib/ablage.mjs"))});
      const s = A.getStore({ name: "centric", consistency: "strong" });
      /* N-6 (Sicherheitsreview): Bereitschaftssignal, dann gemeinsamer Start. Der Kindprozess meldet sich erst, wenn
         Module und Ablage geladen sind, und wartet dann auf das Startsignal des Elternprozesses (eine Zeile auf stdin). */
      const bereitAm = Date.now();
      process.stdout.write("BEREIT " + bereitAm + "\\n");
      await new Promise((r) => process.stdin.once("data", r));
      const gestartetAm = Date.now();
      /* Wirft das Einlösen (vor dem Verbrauch, etwa weil Windows eine gerade gelöschte Datei kurz sperrt), antwortet
         der Endpunkt 503 — nichts ist verbraucht. Das zählt hier als Nicht-Gewinner. */
      let r;
      try { r = await E.einladungEinloesen(s, { einladung: process.env.EINL, bestandLesen: (raum) => B.bestandLesenStreng(s, raum) }); }
      catch (e) { r = { ok: false, status: "wirft", grund: String(e && e.message) }; }
      console.log("ERGEBNIS " + JSON.stringify({ ok: r.ok, status: r.status || 200, grund: r.grund || null,
        bereitAm, gestartetAm }));`;
    /* Startet einen Kindprozess. `bereit` erfüllt sich mit dem Bereitschaftssignal, `ergebnis` mit der Ergebniszeile;
       `los()` gibt das Startsignal. */
    const lauf = (einl) => {
      const k = spawn(process.execPath, ["--input-type=module", "-e", skript], {
        env: { ...process.env, EINL: einl }, stdio: ["pipe", "pipe", "pipe"] });
      let aus = "", err = "", meldeBereit;
      const bereit = new Promise((r) => { meldeBereit = r; });
      const ergebnis = new Promise((erfuellt, verworfen) => {
        k.stdout.on("data", (d) => {
          aus += d;
          const b = aus.split("\n").find((x) => x.startsWith("BEREIT "));
          if (b) meldeBereit(Number(b.slice(7)));
        });
        k.stderr.on("data", (d) => { err += d; });
        k.on("error", verworfen);
        k.on("close", () => {
          meldeBereit(NaN);                        // ohne Signal beendet: die Prüfung unten schlägt an
          const z = aus.split("\n").find((x) => x.startsWith("ERGEBNIS "));
          if (!z) verworfen(new Error(`Kindprozess ohne Ergebnis: ${err || aus}`));
          else erfuellt(JSON.parse(z.slice(9)));
        });
      });
      return { bereit, ergebnis, los: () => { k.stdin.write("los\n"); k.stdin.end(); } };
    };
    for (let i = 0; i < 3; i += 1) {
      const id = `zp${i}`;
      await personSetzen(id, "mitarbeiter");
      const r = await E.einladungAusstellen(laden(), { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: id });
      const kinder = [lauf(r.einladung), lauf(r.einladung)];
      /* Erst wenn BEIDE gemeldet haben, dass sie bereit sind, geht das Startsignal an beide. */
      const bereitAm = await Promise.all(kinder.map((k) => k.bereit));
      expect(bereitAm.every((t) => Number.isFinite(t)), JSON.stringify(bereitAm)).toBe(true);
      const losAm = Date.now();
      for (const k of kinder) k.los();
      const z = await Promise.all(kinder.map((k) => k.ergebnis));
      /* Nachweis: beide waren vor dem Startzeitpunkt bereit, und keiner hat vor ihm begonnen. */
      for (const x of z) {
        expect(x.bereitAm, JSON.stringify(z)).toBeLessThanOrEqual(losAm);
        expect(x.gestartetAm, JSON.stringify(z)).toBeGreaterThanOrEqual(losAm);
      }
      expect(Math.max(...z.map((x) => x.bereitAm))).toBeLessThanOrEqual(Math.min(...z.map((x) => x.gestartetAm)));
      expect(z.filter((x) => x.ok).length, JSON.stringify(z)).toBe(1);
      expect(await kontenDerPerson(id)).toHaveLength(1);
    }
  }, 120000);
});

describe("B1 unter Pflicht: frischer zweiter Faktor (zuletzt — die Uhr wird hier gestellt)", () => {
  let geheimnis, tok, Z;
  const code = (d = 0) => Z.hotp(Z.base32Dekodieren(geheimnis), Z.schrittZu(Date.now()) + d);
  const weiter = () => vi.setSystemTime(Date.now() + 30_000);
  beforeAll(async () => {
    Z = await import("../server/lib/zweifaktor.mjs");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    for (const id of ["zf1", "zf2", "zf3"]) await personSetzen(id, "mitarbeiter");
    await kontoSchreiben(laden(), ablageSchluessel("EIN8-LEIT-0008"), { name: "Test", bestand: RAUM, rolle: "leitung",
      person: "al", betrieb: 0, mandantId: "m-a", demo: false, angelegt: "2026-01-01T00:00:00.000Z" });
    const b = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "EIN8-LEIT-0008", zweifaktorAktion: "beginnen" } });
    expect(b.status, b.roh).toBe(200);
    geheimnis = b.geheimnis;
    const f = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "EIN8-LEIT-0008", zweifaktorAktion: "bestaetigen",
      zweifaktor: code() } });
    expect(f.status, f.roh).toBe(200);
    weiter();
    const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "EIN8-LEIT-0008", zweifaktor: code() } });
    expect(a.status, a.roh).toBe(200);
    tok = a.token;
    process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
  });
  afterAll(() => { delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT; vi.useRealTimers(); });

  it("Anmeldung mit Faktor vor weniger als fünf Minuten: ausstellen ohne weiteren Code", async () => {
    const r = await einladen(tok, { personId: "zf1" });
    expect(r.status, r.roh).toBe(200);
  });
  it("nach sechs Minuten: ohne Code 403, Zugangscode allein genügt unter Pflicht nicht, falscher Code 403", async () => {
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const ohne = await einladen(tok, { personId: "zf2" });
    expect(ohne.status, ohne.roh).toBe(403);
    expect(ohne.bestaetigung).toBe("zweifaktor");
    expect((await einladen(tok, { personId: "zf2", bestaetigung: { zugangscode: "EIN8-LEIT-0008" } })).status).toBe(403);
    expect((await einladen(tok, { personId: "zf2", bestaetigung: { zweifaktor: "000000" } })).status).toBe(403);
  });
  it("mit aktuellem Code aus der App: 200 — derselbe Code ein zweites Mal: 403", async () => {
    weiter();
    const c = code();
    const r = await einladen(tok, { personId: "zf2", bestaetigung: { zweifaktor: c } });
    expect(r.status, r.roh).toBe(200);
    const noch = await einladen(tok, { personId: "zf3", bestaetigung: { zweifaktor: c } });
    expect(noch.status, noch.roh).toBe(403);
  });
});

describe("N-2 / D-N2 (Sicherheitsreview): ein eingerichteter zweiter Faktor wird auch OHNE Pflicht verlangt", () => {
  let geheimnis, tok, Z;
  const code = (d = 0) => Z.hotp(Z.base32Dekodieren(geheimnis), Z.schrittZu(Date.now()) + d);
  const weiter = () => vi.setSystemTime(Date.now() + 30_000);
  beforeAll(async () => {
    delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
    Z = await import("../server/lib/zweifaktor.mjs");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    for (const id of ["nf1", "nf2", "nf3", "nf4"]) await personSetzen(id, "mitarbeiter");
    await kontoSchreiben(laden(), ablageSchluessel("EINC-LEIT-0012"), { name: "Test", bestand: RAUM, rolle: "leitung",
      person: "al", betrieb: 0, mandantId: "m-a", demo: false, angelegt: "2026-01-01T00:00:00.000Z" });
    const b = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "EINC-LEIT-0012", zweifaktorAktion: "beginnen" } });
    expect(b.status, b.roh).toBe(200);
    geheimnis = b.geheimnis;
    const f = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "EINC-LEIT-0012", zweifaktorAktion: "bestaetigen",
      zweifaktor: code() } });
    expect(f.status, f.roh).toBe(200);
    weiter();
    const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: "EINC-LEIT-0012", zweifaktor: code() } });
    expect(a.status, a.roh).toBe(200);
    tok = a.token;
  });
  afterAll(() => { vi.useRealTimers(); });

  it("frische Anmeldung mit Faktor (höchstens fünf Minuten): 200 ohne weiteren Code", async () => {
    const r = await einladen(tok, { personId: "nf1" });
    expect(r.status, r.roh).toBe(200);
  });
  it("Pflicht aus, Faktor eingerichtet, Anmeldung älter, nur Zugangscode: 403 (Faktor verlangt), nichts ausgestellt", async () => {
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    const vorher = await anzahlMit("token:");
    const r = await einladen(tok, { personId: "nf2", bestaetigung: { zugangscode: "EINC-LEIT-0012" } });
    expect(r.status, r.roh).toBe(403);
    expect(r.bestaetigung).toBe("zweifaktor");
    expect(r.einladung).toBeUndefined();
    const ohne = await einladen(tok, { personId: "nf2" });
    expect(ohne.status, ohne.roh).toBe(403);
    expect(ohne.bestaetigung).toBe("zweifaktor");
    expect(await anzahlMit("token:")).toBe(vorher);
  });
  it("mit gültigem Code aus der App: 200", async () => {
    weiter();
    const r = await einladen(tok, { personId: "nf2", bestaetigung: { zweifaktor: code() } });
    expect(r.status, r.roh).toBe(200);
  });
  it("Zugang OHNE eingerichteten Faktor, Anmeldung höchstens fünf Minuten alt: 200 (unverändert)", async () => {
    const t = await sitzung("EIND-LEIT-0013", "leitung", "al");
    await sitzungAltern(t, 4);
    const r = await einladen(t, { personId: "nf3" });
    expect(r.status, r.roh).toBe(200);
    /* … und mit dem eigenen Zugangscode nach mehr als fünf Minuten weiterhin (unverändert). */
    await sitzungAltern(t, 10);
    expect((await einladen(t, { personId: "nf4", bestaetigung: { zugangscode: "EIND-LEIT-0013" } })).status).toBe(200);
  });
});
