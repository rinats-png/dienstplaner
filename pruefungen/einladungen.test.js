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
      const start = Number(process.env.START);
      while (Date.now() < start) await new Promise((r) => setTimeout(r, 1));
      /* Wirft das Einlösen (vor dem Verbrauch, etwa weil Windows eine gerade gelöschte Datei kurz sperrt), antwortet
         der Endpunkt 503 — nichts ist verbraucht. Das zählt hier als Nicht-Gewinner. */
      let r;
      try { r = await E.einladungEinloesen(s, { einladung: process.env.EINL, bestandLesen: (raum) => B.bestandLesenStreng(s, raum) }); }
      catch (e) { r = { ok: false, status: "wirft", grund: String(e && e.message) }; }
      console.log("ERGEBNIS " + JSON.stringify({ ok: r.ok, status: r.status || 200, grund: r.grund || null }));`;
    const lauf = (einl, start) => new Promise((erfuellt, verworfen) => {
      const k = spawn(process.execPath, ["--input-type=module", "-e", skript], {
        env: { ...process.env, EINL: einl, START: String(start) }, stdio: ["ignore", "pipe", "pipe"] });
      let aus = "", err = "";
      k.stdout.on("data", (d) => { aus += d; });
      k.stderr.on("data", (d) => { err += d; });
      k.on("error", verworfen);
      k.on("close", () => {
        const z = aus.split("\n").find((x) => x.startsWith("ERGEBNIS "));
        if (!z) verworfen(new Error(`Kindprozess ohne Ergebnis: ${err || aus}`));
        else erfuellt(JSON.parse(z.slice(9)));
      });
    });
    for (let i = 0; i < 3; i += 1) {
      const id = `zp${i}`;
      await personSetzen(id, "mitarbeiter");
      const r = await E.einladungAusstellen(laden(), { sitzung: leitungSitz(), bestand: await bestandJetzt(), personId: id });
      const start = Date.now() + 5000;
      const z = await Promise.all([lauf(r.einladung, start), lauf(r.einladung, start)]);
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
