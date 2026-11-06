/* ==========================================================================
   ETAG-PFLICHT (B-9-1)

   Ein Schreibvorgang ohne ETag überschrieb auf einem vorhandenen Bestand still,
   was ein anderer Schreiber inzwischen geändert hatte. Jetzt: ohne ETag nur die
   Erstanlage (noch kein Bestand). Sonst 409 „konflikt“ mit dem aktuellen Stand.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000", RAUM = "etagpflicht", ADMIN = "etag-verwaltung-0123456789";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [{ id: "m-e", name: "E", status: "aktiv", tarif: "pro",
  einheiten: [{ id: "e1" }], standorte: [], dienstarten: [{ id: "F", name: "F" }],
  personen: [person("el", "leitung"), person("em", "mitarbeiter")],
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [], abwesenheiten: [] }] });
const sitzung = async (code) => {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Test leitung", bestand: RAUM, rolle: "leitung", person: "el",
    betrieb: 0, mandantId: "m-e", angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy(); return a.token;
};
const lesen = async (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const namen = (d) => d.bestand.mandanten[0].personen.find((p) => p.id === "em").nachname;
const mit = (d, nachname) => { const b = JSON.parse(JSON.stringify(d.bestand)); b.mandanten[0].personen.find((p) => p.id === "em").nachname = nachname; return b; };

let T;
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-etag-pflicht-"));
  Object.assign(process.env, { CENTRIC_DATEN: wurzel, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: "pfeffer-nur-zum-pruefen-0123456789", CENTRIC_ADMIN: ADMIN });
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  T = await sitzung("ETAG-LEIT-0001");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("PUT /api/bestand: ETag-Pflicht bei vorhandenem Bestand", () => {
  it("mit gültigem ETag: 200, neuer ETag", async () => {
    const g = await lesen(T);
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: mit(g, "A-ZUERST"), etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
    expect(w.etag).toBeTruthy();
    expect(w.etag).not.toBe(g.etag);
  });
  for (const [name, wert] of [["fehlt", undefined], ["null", null], ["leer", ""]]) {
    it(`ETag ${name}: 409 konflikt, fremde Änderung bleibt, Antwort trägt den aktuellen Stand`, async () => {
      const g = await lesen(T);
      const rumpf = { bestand: mit(g, `OHNE-ETAG-${name}`) };
      if (wert !== undefined) rumpf.etag = wert;
      const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf });
      expect(w.status, w.roh).toBe(409);
      expect(w.fehler).toBe("konflikt");
      expect(w.etag).toBe(g.etag);
      expect(namen(w)).toBe(namen(g));
      const danach = await lesen(T);
      expect(namen(danach)).toBe(namen(g));
      expect(danach.etag).toBe(g.etag);
    });
  }
  it("ungültiger ETag-Text: weiterhin 409, nichts geändert", async () => {
    const g = await lesen(T);
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: mit(g, "FALSCH"), etag: "kein-etag" } });
    expect(w.status, w.roh).toBe(409);
    expect(namen(await lesen(T))).toBe(namen(g));
  });
  it("Neuladen nach dem 409 und erneutes Speichern mit dem gelieferten ETag: 200", async () => {
    const w1 = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: mit(await lesen(T), "OHNE") } });
    expect(w1.status).toBe(409);
    const w2 = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: mit(w1, "NACH-NEULADEN"), etag: w1.etag } });
    expect(w2.status, w2.roh).toBe(200);
    expect(namen(await lesen(T))).toBe("NACH-NEULADEN");
  });
});

describe("Erstanlage ohne ETag bleibt möglich", () => {
  it("bestand-anlegen (Betreiber) legt einen neuen Raum ohne ETag an", async () => {
    const code = "ETAG-BETR-0002";
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Test betreiber", bestand: RAUM, rolle: "betreiber", person: null,
      betrieb: 0, angelegt: "2026-01-01T00:00:00.000Z" });
    const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
    expect(a.token, a.roh).toBeTruthy();
    const neu = await anfrage("/api/bestand-anlegen", { token: a.token, rumpf: { bestand: "etagpflicht-neu", inhalt: bestand() } });
    expect(neu.status, neu.roh).toBe(200);
  });
  it("die Bibliothek schreibt ohne Stand weiter ohne Abgleich (interne Abläufe)", async () => {
    const r = await B.bestandSchreiben(laden(), "etagpflicht-intern", bestand(), { durch: "Pruefung" });
    expect(r.ok).toBe(true);
    const r2 = await B.bestandSchreiben(laden(), "etagpflicht-intern", bestand(), { durch: "Pruefung" });
    expect(r2.ok).toBe(true);
  });
});
