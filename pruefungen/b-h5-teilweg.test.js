/* ==========================================================================
   B-H5 über den echten Handler: Voll-PUT (/api/bestand) und Teilweg
   (POST /api/bestand/teile) antworten auf eine GELÖSCHTE Abweichung gleich.

   Der Teilweg baut den Voll-PUT aus Sicht ⊕ Δ und ruft dieselbe
   Fachprüfung (server/lib/schutzdurchsetzung.mjs). Geprüft wird hier, dass
   „zurück zur Schichtfolge“ (Zelle löschen, neu: null) auf beiden Wegen
   dieselbe Antwort gibt und nichts schreibt, wo abgewiesen wird:
     1. Ruhezeit unter 11 Stunden          → 403, nichts gespeichert
     2. unter der Vorgabe des Betriebs     → 409; mit Bestätigung 200
     3. gelöschter Schlüssel vor heute      → 200 (Löschlauf, Aufbewahrung)
   Feste Uhr: heute = Mittwoch, 18.11.2026 (Berlin). Fälle 1 und 2 sind auf
   dem Stand vor B-H5 rot (dort 200).

   Aufruf: npx vitest run pruefungen/b-h5-teilweg.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const H = "2026-11-18", T1 = "2026-11-25", T2 = "2026-11-26";              // Mittwoch, Mittwoch, Donnerstag
const VOR1 = "2026-11-11", VOR2 = "2026-11-12";
let wurzel, laden, daten, B, G, sitzungAnlegen;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.58.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
/* Schichtfolge: nur donnerstags `don` (Anker Montag). */
const betrieb = (don, abweichungen) => ({ version: 1, stand: 1, mandanten: [{
  id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", status: "aktiv",
  einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
    { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30 },
    { id: "N1", name: "Nacht kurz", start: "01:30", ende: "05:30", pause: 0 }],
  zyklus: { tage: ["-", "-", "-", don, "-", "-", "-"] }, anker: "2026-01-05",
  einstellungen: { ruhezeit: 12, maxFolge: 6 }, qualifikationen: [],
  personen: [person("a1", "mitarbeiter", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen, abwesenheiten: [], bestaetigungen: [], nachrichten: [], anfragen: [], aenderungen: [], erfassung: {}, einstempeln: {},
}] });

let raumNr = 0;
async function raum(bestand) {
  const name = `b-h5-teilweg-${++raumNr}`;
  await B.bestandSchreiben(laden(), name, G.personenAngleichen(G.uebergabenAngleichen(bestand)), { durch: "Pruefung" });
  const token = (await sitzungAnlegen({ bestand: name, name: "V Np1", rolle: "planer", person: "p1", betrieb: 0, mandantId: "m1", einheit: null },
    2 * 3600 * 1000)).token;
  return { name, token };
}
const gespeichert = async (name) => (await B.bestandLesenStreng(laden(), name)).bestand.mandanten[0];

/** Dieselbe Änderung auf beiden Wegen, je in einem eigenen gleichen Raum. */
async function beideWege(bestand, k, bestaetigung = null) {
  const A = await raum(kopie(bestand)), V = await raum(kopie(bestand));
  const gA = await anfrage("/api/bestand", { token: A.token });
  const gV = await anfrage("/api/bestand", { token: V.token });
  const mA = gA.bestand.mandanten[0];
  const delta = { format: 1, epoche: gA.teile.epoche, durch: "Pruefung",
    zellen: [{ feld: "abweichungen", k, alt: mA.abweichungen[k] ?? null, neu: null }],
    ...(bestaetigung ? { kern: { bestaetigungen: { basis: gA.teile.versionen["kern:bestaetigungen"], wert: [bestaetigung, ...(mA.bestaetigungen || [])] } } } : {}) };
  const t = await anfrage("/api/bestand/teile", { methode: "POST", token: A.token, rumpf: delta });
  const voll = kopie(gV.bestand);
  delete voll.mandanten[0].abweichungen[k];
  if (bestaetigung) voll.mandanten[0].bestaetigungen = [bestaetigung, ...(voll.mandanten[0].bestaetigungen || [])];
  const v = await anfrage("/api/bestand", { methode: "PUT", token: V.token, rumpf: { bestand: voll, etag: gV.etag, durch: "Pruefung" } });
  return { t, v, nachA: await gespeichert(A.name), nachV: await gespeichert(V.name) };
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${H}T10:00:00Z`));
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-b-h5-teilweg-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  const { heuteBerlin } = await import("../server/lib/zeiterfassung.mjs");
  expect(heuteBerlin()).toBe(H);
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

describe("B-H5: gelöschte Abweichung — Teilweg und Voll-PUT gleich", { timeout: 120000 }, () => {
  it("1. Ruhezeit unter 11 Stunden: beide 403, nichts gespeichert", async () => {
    const { t, v, nachA, nachV } = await beideWege(betrieb("F", { [`a1|${T1}`]: "S", [`a1|${T2}`]: "-" }), `a1|${T2}`);
    expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(403);
    expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(403);
    expect(t.fehler).toBe(v.fehler);
    expect(`${t.text || t.fehler}`).toMatch(/Ruhezeit unter 11 Stunden/);
    expect(nachA.abweichungen[`a1|${T2}`]).toBe("-");
    expect(nachV.abweichungen[`a1|${T2}`]).toBe("-");
  });

  it("2. unter der Vorgabe des Betriebs: beide 409 mit derselben Befundliste; mit Bestätigung beide 200", async () => {
    const b = betrieb("N1", { [`a1|${T1}`]: "F", [`a1|${T2}`]: "-" });
    const ohne = await beideWege(b, `a1|${T2}`);
    expect(ohne.t.status).toBe(409);
    expect(ohne.v.status).toBe(409);
    expect(ohne.t.fachbefunde).toEqual(ohne.v.fachbefunde);
    expect(ohne.t.fachbefunde[0]).toMatchObject({ personId: "a1", datum: T2, dienstId: "N1" });
    const best = { id: "b-h5-1", personId: "a1", datum: T2, dienstId: "N1", aktion: "einteilen", stufe: "achtung",
      befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }], gelesen: false };
    const mit = await beideWege(b, `a1|${T2}`, best);
    expect(mit.t.status, JSON.stringify(mit.t).slice(0, 300)).toBe(200);
    expect(mit.v.status, JSON.stringify(mit.v).slice(0, 300)).toBe(200);
    for (const m of [mit.nachA, mit.nachV]) {
      expect(Object.prototype.hasOwnProperty.call(m.abweichungen, `a1|${T2}`)).toBe(false);
      expect(m.bestaetigungen.some((x) => x.id === "b-h5-1")).toBe(true);
    }
  });

  it("3. gelöschter Schlüssel vor heute: beide 200", async () => {
    const { t, v, nachA, nachV } = await beideWege(betrieb("F", { [`a1|${VOR1}`]: "S", [`a1|${VOR2}`]: "-" }), `a1|${VOR2}`);
    expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(200);
    expect(v.status, JSON.stringify(v).slice(0, 300)).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(nachA.abweichungen, `a1|${VOR2}`)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(nachV.abweichungen, `a1|${VOR2}`)).toBe(false);
  });
});
