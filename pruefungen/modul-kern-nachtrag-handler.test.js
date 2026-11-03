/* ==========================================================================
   WP-19.0 NACHTRAG (N1) — /api/bestand-anlegen über den echten Handler

   Ein Raum, den der Betreiber einrichtet (Erstbefüllung: leer, test, demo
   oder eigener Inhalt), beginnt ohne Moduleinstellungen: Schalter samt
   Mitbestimmungsbestätigung, Regelwerte und Modulprotokoll aus dem Inhalt
   werden verworfen (G1/G2/G6). Übrige Einstellungen bleiben.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEMO_KENNUNGEN } from "../server/lib/erstbefuellung.mjs";

const WIRT = "127.0.0.1:3000";
const EIN = "2026-10-01T08:00:00.000Z";
let wurzel, laden, daten, B, kontoSchreiben, ablageSchluessel;
let nr = 0;
let token = null;

const anfrage = async (pfad, { rumpf } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.19.${Math.floor(nr / 250)}.${nr % 250}`,
    "content-type": "application/json" };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf || {}) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const roh = async (raum) => (await B.bestandLesen(laden(), raum)).bestand;

const GEFAELSCHT = () => ({
  branchenmodule: { wachbuch: { an: true, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "x",
    mitbestimmung: { grundlage: "erfunden", bestaetigtAm: EIN, bestaetigtVon: "x" } } },
  regelwerte: { "POSTEN-QUAL-01": { quelle: "Q", fundstelle: "F", version: "1", gueltigAb: "2026-01-01", pruefstatus: "verified",
    stufe: "achtung", geprueftAm: EIN, geprueftVon: "x" } },
  modulprotokoll: [{ art: "eingeschaltet", modul: "wachbuch", am: EIN, von: "x", grundlage: "erfunden" }],
});
const betrieb = (id) => ({ id, name: id, status: "aktiv", pakete: ["sicherheit"], einstellungen: { ruhezeit: 11, ...GEFAELSCHT() },
  einheiten: [{ id: "e1", name: "E" }], dienstarten: [], abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], abwesenheiten: [],
  personen: [{ id: "x1", vorname: "V", nachname: "N", rolle: "leitung", bereich: "ALLE", status: "aktiv", qualifikationen: [],
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }] });
const inhalt = (ids) => ({ version: 9, stand: 1, session: null, mandanten: ids.map(betrieb) });
const ohneModulfelder = (m) => {
  for (const f of ["branchenmodule", "regelwerte", "modulprotokoll"]) expect(Object.prototype.hasOwnProperty.call(m.einstellungen || {}, f), `${m.id}.${f}`).toBe(false);
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-modulnachtrag-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  const code = "MODN1-AAAA-0001";
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "betr", bestand: "modul-betreiber", rolle: "betreiber", person: null, betrieb: 0,
    angelegt: "2026-01-01T00:00:00.000Z" });
  token = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
  expect(token).toBeTruthy();
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("N1 — /api/bestand-anlegen verwirft Moduleinstellungen", () => {
  it("eigener Inhalt: Schalter, Bestätigung, Regelwerte und Protokoll verworfen, übrige Einstellungen bleiben", async () => {
    const r = await anfrage("/api/bestand-anlegen", { rumpf: { bestand: "modul-eigen", inhalt: inhalt(["m-a"]) } });
    expect(r.status).toBe(200);
    const m = (await roh("modul-eigen")).mandanten[0];
    ohneModulfelder(m);
    expect(m.einstellungen.ruhezeit).toBe(11);
  });
  it("Demo: dasselbe für alle drei Betriebe", async () => {
    const r = await anfrage("/api/bestand-anlegen", { rumpf: { bestand: "demo-modulnachtrag", vorlage: "demo", inhalt: inhalt(DEMO_KENNUNGEN) } });
    expect(r.status).toBe(200);
    const b = await roh("demo-modulnachtrag");
    expect(b.mandanten.map((m) => m.id)).toEqual(DEMO_KENNUNGEN);
    for (const m of b.mandanten) ohneModulfelder(m);
  });
  it("leer und test (vom Server gebaut): ohne Moduleinstellungen, ein mitgeschickter Inhalt zählt nicht", async () => {
    for (const vorlage of ["leer", "test"]) {
      const raum = `modul-${vorlage}`;
      const r = await anfrage("/api/bestand-anlegen", { rumpf: { bestand: raum, vorlage, inhalt: inhalt(["m-x"]) } });
      expect(r.status, vorlage).toBe(200);
      for (const m of (await roh(raum)).mandanten) ohneModulfelder(m);
    }
  });
});
