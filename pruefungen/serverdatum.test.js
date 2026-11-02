/* ==========================================================================
   SERVERDATUM BEIM STEMPELN (WP-17, Geo-Spezifikation B5/B6/B7)

   Bis November 2026 bestimmte das Gerät, auf welchen Tag gestempelt wird:
   /api/stempeln verlangte ein `datum` und nahm es — mit der Regel „heute,
   gestern nur mit Nachtdienst oder offenem Beginn". Ein Nachtdienst, der um
   22 Uhr begann, endete nach Mitternacht als „Ende ohne Start" auf dem
   neuen Tag, sobald die Oberfläche das heutige Datum schickte; ein Beginn
   nach Mitternacht ließ sich dem Vortag zuschlagen; und ohne `datum` ging
   gar nichts.

   Jetzt bestimmt der Server den Tag aus seiner Uhr (Europe/Berlin). Geprüft
   wird gegen die Serverfunktion mit vorgegebener Serverzeit (vi.setSystemTime,
   nur Date — Zeitgeber laufen echt, damit Sperren und Bremsen arbeiten).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, sitzungAnlegen, B;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.4.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};

const person = (id) => ({ id, vorname: "V", nachname: id, rolle: "mitarbeiter", bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

async function raumAnlegen(raum, ids, extra = {}) {
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
    personen: ids.map(person), abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, ...extra }] },
  { durch: "Pruefung" });
}
/* Eine frische Sitzung je Schritt: Ein Zeitsprung über Stunden überschritte
   sonst die Untätigkeitsgrenze der Sitzung. */
const sitzung = async (raum, id) => (await sitzungAnlegen({ bestand: raum, name: id, rolle: "mitarbeiter",
  person: id, betrieb: 0, mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
const stempeln = async (raum, id, rumpf) => anfrage("/api/stempeln", { token: await sitzung(raum, id), rumpf });
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-serverdatum-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

describe("Beginn: der Tag kommt vom Server", () => {
  it("ohne Gerätedatum: 200, auf heute (Serverzeit)", async () => {
    zeitAuf("2026-11-02T09:00:00Z");                                   // 10:00 Berlin
    await raumAnlegen("sd-ohne", ["a1"]);
    const a = await stempeln("sd-ohne", "a1", { art: "start" });
    expect(a.status, JSON.stringify(a)).toBe(200);
    expect(a.datum).toBe("2026-11-02");
    expect((await mandant("sd-ohne")).einstempeln["a1|2026-11-02"]).toEqual(a.eintrag);
  });

  it("kurz nach Mitternacht: Serverdatum, nicht das Datum eines Geräts in UTC", async () => {
    zeitAuf("2026-10-24T22:30:00Z");                                   // 25.10. 00:30 MESZ
    await raumAnlegen("sd-mitternacht", ["a1"]);
    const a = await stempeln("sd-mitternacht", "a1", { art: "start" });
    expect(a.status, JSON.stringify(a)).toBe(200);
    expect(a.datum).toBe("2026-10-25");
    const utcGeraet = await stempeln("sd-mitternacht", "a1", { art: "start", datum: "2026-10-24" });
    expect(utcGeraet.status).toBe(400);
  });

  it("Gerätedatum gestern, obwohl gestern ein Nachtdienst geplant war: 400, nichts auf gestern gestempelt", async () => {
    zeitAuf("2026-11-02T00:30:00Z");                                   // 01:30 Berlin
    await raumAnlegen("sd-gestern", ["a1"], { abweichungen: { "a1|2026-11-01": "N" } });
    const a = await stempeln("sd-gestern", "a1", { art: "start", datum: "2026-11-01" });
    expect(a.status, JSON.stringify(a)).toBe(400);
    expect(a.code).toBe("STEMPEL_DATUM_UNPASSEND");
    expect(a.ok).not.toBe(true);
    expect((await mandant("sd-gestern")).einstempeln["a1|2026-11-01"]).toBeUndefined();
  });

  it("Gerätedatum morgen: 400 mit klarer Meldung", async () => {
    zeitAuf("2026-11-02T09:00:00Z");
    await raumAnlegen("sd-morgen", ["a1"]);
    const a = await stempeln("sd-morgen", "a1", { art: "start", datum: "2026-11-03" });
    expect(a.status).toBe(400);
    expect(a.fehler).toMatch(/heute \(2026-11-02\)/);
  });
});

describe("Nachtdienst: Ende nach Mitternacht beim offenen Beginn", () => {
  it("Beginn 22:00, Ende 06:00 mit dem Datum des neuen Tags → beim Beginn, Erfassung, endeDatum", async () => {
    await raumAnlegen("sd-nacht", ["a1"]);
    zeitAuf("2026-11-01T21:00:00Z");                                   // 01.11. 22:00 MEZ
    const s = await stempeln("sd-nacht", "a1", { art: "start", datum: "2026-11-01" });
    expect(s.status, JSON.stringify(s)).toBe(200);
    zeitAuf("2026-11-02T05:00:00Z");                                   // 02.11. 06:00 MEZ
    const e = await stempeln("sd-nacht", "a1", { art: "ende", datum: "2026-11-02" });
    expect(e.status, JSON.stringify(e)).toBe(200);
    expect(e.datum).toBe("2026-11-01");
    expect(e.markierungen).not.toContain("START_FEHLT");
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "06:00", endeDatum: "2026-11-02" });
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "06:00", bestaetigt: true });
    const m = await mandant("sd-nacht");
    expect(m.einstempeln["a1|2026-11-02"]).toBeUndefined();
    expect(m.erfassung["a1|2026-11-01"]).toEqual(e.erfassung);
  });

  it("während der offene Nachtdienst läuft, ist ein zweites Einstempeln 409", async () => {
    await raumAnlegen("sd-nacht-doppel", ["a1"]);
    zeitAuf("2026-11-01T21:00:00Z");
    expect((await stempeln("sd-nacht-doppel", "a1", { art: "start" })).status).toBe(200);
    zeitAuf("2026-11-02T04:00:00Z");
    const d = await stempeln("sd-nacht-doppel", "a1", { art: "start" });
    expect([d.status, d.code]).toEqual([409, "STEMPEL_SCHON_EINGESTEMPELT"]);
    expect((await mandant("sd-nacht-doppel")).einstempeln["a1|2026-11-02"]).toBeUndefined();
  });

  it("Zeitumstellung (25.10.2026): Beginn 22:00 MESZ, Ende 05:30 MEZ — zugeordnet, 8,5 Stunden", async () => {
    await raumAnlegen("sd-dst", ["a1"]);
    zeitAuf("2026-10-24T20:00:00Z");                                   // 24.10. 22:00 MESZ
    expect((await stempeln("sd-dst", "a1", { art: "start", datum: "2026-10-24" })).status).toBe(200);
    zeitAuf("2026-10-25T04:30:00Z");                                   // 25.10. 05:30 MEZ
    const e = await stempeln("sd-dst", "a1", { art: "ende", datum: "2026-10-25" });
    expect(e.status, JSON.stringify(e)).toBe(200);
    expect(e.datum).toBe("2026-10-24");
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "05:30", endeDatum: "2026-10-25" });
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "05:30", bestaetigt: true });
    expect(Date.parse(e.eintrag.endeAm) - Date.parse(e.eintrag.startAm)).toBe(8.5 * 3600000);
  });

  it("vergessenes Ausstempeln (Beginn vor 28 h): Ende auf heute als START_FEHLT, alter Vorgang bleibt offen", async () => {
    await raumAnlegen("sd-vergessen", ["a1"]);
    zeitAuf("2026-11-01T05:00:00Z");                                   // 01.11. 06:00
    expect((await stempeln("sd-vergessen", "a1", { art: "start" })).status).toBe(200);
    zeitAuf("2026-11-02T09:00:00Z");                                   // 02.11. 10:00
    const e = await stempeln("sd-vergessen", "a1", { art: "ende" });
    expect(e.status).toBe(200);
    expect(e.datum).toBe("2026-11-02");
    expect(e.markierungen).toContain("START_FEHLT");
    expect((await mandant("sd-vergessen")).einstempeln["a1|2026-11-01"].ende).toBeUndefined();
  });
});

describe("B5: gleichzeitige Stempel", () => {
  it("20 Personen stempeln gleichzeitig: 20 × 200, kein 409 für Nutzende", async () => {
    zeitAuf("2026-11-02T05:00:00Z");
    const ids = Array.from({ length: 20 }, (_, i) => `g${i}`);
    await raumAnlegen("sd-zwanzig", ids);
    const tokens = [];
    for (const id of ids) tokens.push(await sitzung("sd-zwanzig", id));
    const a = await Promise.all(tokens.map((token) => anfrage("/api/stempeln", { token, rumpf: { art: "start" } })));
    expect(a.map((x) => x.status)).toEqual(ids.map(() => 200));
    const m = await mandant("sd-zwanzig");
    expect(ids.filter((id) => m.einstempeln[`${id}|2026-11-02`])).toHaveLength(20);
  }, 60000);
});
