/* ==========================================================================
   OFFLINE-STEMPELN: Ereigniskennung, Idempotenz, Erfassungszeit (WP-07)

   Ein Gerät ohne Netz legt jedes Stempeln als Ereignis mit zufälliger
   Kennung (clientEventId) und Erfassungszeit ab und sendet es, sobald Netz da
   ist — notfalls mehrmals, weil eine Antwort verloren gehen kann. Der Server
   muss daraus genau einen Stempel machen, als offline gekennzeichnet, mit
   Tag und Uhrzeit aus der Erfassungszeit (plausibilisiert gegen den
   Eingang), nie mit einer stillschweigend übernommenen Gerätezeit, und nie
   unter der Sitzung einer anderen Person.

   Geprüft gegen die Serverfunktion mit vorgegebener Serverzeit
   (vi.setSystemTime, nur Date — Sperren und Bremsen laufen echt).
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
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.7.${Math.floor(nr / 250) % 250}.${nr % 250}` };
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
const sitzung = async (raum, id, rolle = "mitarbeiter") => (await sitzungAnlegen({ bestand: raum, name: id, rolle,
  person: id, betrieb: 0, mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
const stempeln = async (raum, id, rumpf, token) => anfrage("/api/stempeln", { token: token || await sitzung(raum, id), rumpf });
const zeitAuf = (iso) => vi.setSystemTime(new Date(iso));
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
const stempelVon = (m, pid) => Object.entries(m.einstempeln || {}).filter(([k]) => k.startsWith(`${pid}|`));

const ID = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-offline-"));
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

describe("Idempotenz: dieselbe clientEventId ergibt genau einen Stempel", () => {
  it("Wiederholung nach verlorener Antwort: 200 mit derselben Antwort, kein zweiter Stempel", async () => {
    zeitAuf("2026-11-02T05:00:00Z");                                       // 06:00 Berlin
    await raumAnlegen("of-wdh", ["a1"]);
    const ev = { art: "start", clientEventId: ID(1), erfasstAm: "2026-11-02T05:00:00.000Z", gesendetAm: "2026-11-02T05:00:00.000Z" };
    const a = await stempeln("of-wdh", "a1", ev);
    expect(a.status, JSON.stringify(a)).toBe(200);
    expect(a.eintrag.ereignisStart).toBe(ID(1));
    zeitAuf("2026-11-02T05:00:20Z");
    const b = await stempeln("of-wdh", "a1", { ...ev, gesendetAm: "2026-11-02T05:00:20.000Z" });
    expect(b.status, JSON.stringify(b)).toBe(200);
    expect(b.wiederholt).toBe(true);
    expect([b.datum, b.zeit, b.art]).toEqual([a.datum, a.zeit, "start"]);
    expect(b.eintrag).toEqual(a.eintrag);
    expect(stempelVon(await mandant("of-wdh"), "a1")).toHaveLength(1);
  });

  it("Wiederholung über Mitternacht (als sofort gesendet gewertet): dieselbe Antwort statt einer Absage, kein Beginn am neuen Tag", async () => {
    zeitAuf("2026-11-02T22:59:50Z");                                       // 23:59:50 Berlin
    await raumAnlegen("of-mitternacht", ["a1"]);
    const ev = { art: "start", clientEventId: ID(2), erfasstAm: "2026-11-02T22:59:50.000Z" };
    const a = await stempeln("of-mitternacht", "a1", { ...ev, gesendetAm: "2026-11-02T22:59:50.000Z" });
    expect([a.status, a.datum]).toEqual([200, "2026-11-02"]);
    zeitAuf("2026-11-02T23:00:20Z");                                       // 00:00:20 — 30 s später, gilt als sofort
    const b = await stempeln("of-mitternacht", "a1", { ...ev, gesendetAm: "2026-11-02T23:00:20.000Z" });
    expect(b.status, JSON.stringify(b)).toBe(200);
    expect(b.wiederholt).toBe(true);
    expect(b.datum).toBe("2026-11-02");
    const m = await mandant("of-mitternacht");
    expect(stempelVon(m, "a1").map(([k]) => k)).toEqual(["a1|2026-11-02"]);
  });

  it("Ende wiederholt: dieselbe Ist-Zeit, kein 409", async () => {
    zeitAuf("2026-11-03T05:00:00Z");
    await raumAnlegen("of-ende", ["a1"]);
    expect((await stempeln("of-ende", "a1", { art: "start", clientEventId: ID(3) })).status).toBe(200);
    zeitAuf("2026-11-03T13:00:00Z");
    const e1 = await stempeln("of-ende", "a1", { art: "ende", clientEventId: ID(4) });
    expect(e1.status).toBe(200);
    const e2 = await stempeln("of-ende", "a1", { art: "ende", clientEventId: ID(4) });
    expect([e2.status, e2.wiederholt, e2.art]).toEqual([200, true, "ende"]);
    expect(e2.erfassung).toEqual(e1.erfassung);
    expect(e2.zeit).toBe(e1.zeit);
  });

  it("Rennen: zwei Reiter/Geräte senden dieselbe Warteschlange gleichzeitig → ein Stempel", async () => {
    zeitAuf("2026-11-04T05:00:00Z");
    await raumAnlegen("of-rennen", ["a1"]);
    const t1 = await sitzung("of-rennen", "a1"), t2 = await sitzung("of-rennen", "a1");
    const ev = { art: "start", clientEventId: ID(5), erfasstAm: "2026-11-04T04:10:00.000Z",
      gesendetAm: "2026-11-04T05:00:00.000Z", offline: true };
    const erg = await Promise.all([stempeln("of-rennen", "a1", ev, t1), stempeln("of-rennen", "a1", ev, t2),
      stempeln("of-rennen", "a1", ev, t1), stempeln("of-rennen", "a1", ev, t2)]);
    expect(erg.map((x) => x.status)).toEqual([200, 200, 200, 200]);
    expect(erg.filter((x) => !x.wiederholt)).toHaveLength(1);
    expect(new Set(erg.map((x) => `${x.datum}|${x.zeit}`)).size).toBe(1);
    const m = await mandant("of-rennen");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    expect(m.einstempeln["a1|2026-11-04"].start).toBe("05:10");
  });

  it("Kennung gilt je Person: dieselbe Kennung bei einer anderen Person ist deren eigener Stempel", async () => {
    zeitAuf("2026-11-05T05:00:00Z");
    await raumAnlegen("of-person", ["a1", "a2"]);
    expect((await stempeln("of-person", "a1", { art: "start", clientEventId: ID(6) })).status).toBe(200);
    const b = await stempeln("of-person", "a2", { art: "start", clientEventId: ID(6) });
    expect([b.status, !!b.wiederholt]).toEqual([200, false]);
    const m = await mandant("of-person");
    expect(m.einstempeln["a2|2026-11-05"].ereignisStart).toBe(ID(6));
  });

  it("ungültige Kennung: 400, nichts gespeichert", async () => {
    zeitAuf("2026-11-05T05:00:00Z");
    await raumAnlegen("of-kennung", ["a1"]);
    for (const clientEventId of ["abc", 42, "00000001-0000-1000-8000-000000000001", "x".repeat(400)]) {
      const a = await stempeln("of-kennung", "a1", { art: "start", clientEventId });
      expect([a.status, a.code]).toEqual([400, "STEMPEL_EREIGNIS_UNGUELTIG"]);
    }
    expect(stempelVon(await mandant("of-kennung"), "a1")).toHaveLength(0);
  });
});

describe("Offline erfasst: Zeit aus dem Ereignis, gekennzeichnet", () => {
  it("Flugmodus: Beginn 06:00 und Ende 14:00 erst um 15:00 gesendet → ein Stempel 06:00–14:00, offline, Ist-Zeit zur Prüfung (Auflage A1)", async () => {
    await raumAnlegen("of-flug", ["a1"], { abweichungen: {"a1|2026-11-06": "F"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-06T14:00:00Z");                                       // 15:00 Berlin, Netz wieder da
    const s = await stempeln("of-flug", "a1", { art: "start", clientEventId: ID(7), offline: true,
      erfasstAm: "2026-11-06T05:00:00.000Z", gesendetAm: "2026-11-06T14:00:00.000Z" });
    expect(s.status, JSON.stringify(s)).toBe(200);
    expect([s.datum, s.zeit, s.offline]).toEqual(["2026-11-06", "06:00", true]);
    const e = await stempeln("of-flug", "a1", { art: "ende", clientEventId: ID(8), offline: true,
      erfasstAm: "2026-11-06T13:00:00.000Z", gesendetAm: "2026-11-06T14:00:01.000Z" });
    expect(e.status, JSON.stringify(e)).toBe(200);
    const m = await mandant("of-flug");
    expect(stempelVon(m, "a1")).toHaveLength(1);
    const st = m.einstempeln["a1|2026-11-06"];
    expect(st).toMatchObject({ start: "06:00", ende: "14:00", ereignisStart: ID(7), ereignisEnde: ID(8) });
    expect(st.startAm).toBe("2026-11-06T05:00:00.000Z");
    expect(st.offlineStart).toMatchObject({ offline: true, geraetAm: "2026-11-06T05:00:00.000Z",
      eingangAm: "2026-11-06T14:00:00.000Z" });
    expect(st.offlineEnde.offline).toBe(true);
    expect(st.markierungen).toContain("OFFLINE_ERFASST");
    expect(st.markierungen).not.toContain("GERAETEZEIT_ABWEICHEND");
    /* Auflage A1 (Review): Erfassungszeit Stunden vor dem Eingang ist nicht prüfbar (Flugmodus + Uhr
       zurückgestellt genügt zum Fälschen) — die Ist-Zeit steht zur Prüfung, bis die Leitung bestätigt. */
    expect(m.erfassung["a1|2026-11-06"]).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: false });
    expect(m.erfassung["a1|2026-11-06"].grund).toMatch(/^OFFLINE_PRUEFEN/);
  });

  it("auch ohne offline-Kennzeichen: über eine Minute zwischen Drücken und Senden gilt die Erfassungszeit", async () => {
    await raumAnlegen("of-verzug", ["a1"]);
    zeitAuf("2026-11-06T07:00:00Z");
    const s = await stempeln("of-verzug", "a1", { art: "start", clientEventId: ID(9),
      erfasstAm: "2026-11-06T05:30:00.000Z", gesendetAm: "2026-11-06T07:00:00.000Z" });
    expect([s.status, s.zeit, s.offline]).toEqual([200, "06:30", true]);
  });

  it("sofort gesendet: Serverzeit wie bisher, kein Offline-Kennzeichen", async () => {
    await raumAnlegen("of-sofort", ["a1"]);
    zeitAuf("2026-11-06T07:00:00Z");
    const s = await stempeln("of-sofort", "a1", { art: "start", clientEventId: ID(10),
      erfasstAm: "2026-11-06T06:59:58.000Z", gesendetAm: "2026-11-06T06:59:58.000Z" });
    expect([s.status, s.zeit, s.offline]).toEqual([200, "08:00", false]);
    const st = (await mandant("of-sofort")).einstempeln["a1|2026-11-06"];
    expect(st.offlineStart).toBeUndefined();
    expect(st.markierungen || []).not.toContain("OFFLINE_ERFASST");
    expect(st.ereignisStart).toBe(ID(10));
  });

  it("Nachtdienst offline: Beginn 22:00, Ende 06:00, beides am Morgen gesendet → beim Beginn, endeDatum", async () => {
    await raumAnlegen("of-nacht", ["a1"], { abweichungen: {"a1|2026-11-06": "N"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-07T07:00:00Z");                                       // 08:00 am 07.11.
    const s = await stempeln("of-nacht", "a1", { art: "start", clientEventId: ID(11), offline: true,
      erfasstAm: "2026-11-06T21:00:00.000Z", gesendetAm: "2026-11-07T07:00:00.000Z" });
    expect([s.status, s.datum, s.zeit]).toEqual([200, "2026-11-06", "22:00"]);
    const e = await stempeln("of-nacht", "a1", { art: "ende", clientEventId: ID(12), offline: true,
      erfasstAm: "2026-11-07T05:00:00.000Z", gesendetAm: "2026-11-07T07:00:00.000Z" });
    expect([e.status, e.datum]).toEqual([200, "2026-11-06"]);
    expect(e.eintrag).toMatchObject({ start: "22:00", ende: "06:00", endeDatum: "2026-11-07" });
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "06:00", bestaetigt: false });   // A1: über 15 min nach Erfassung eingegangen
    expect(e.erfassung.grund).toMatch(/^OFFLINE_PRUEFEN/);
  });
});

describe("Gerätezeit nie still übernommen", () => {
  it("Geräteuhr eine Stunde nach: Zeit berichtigt, GERAETEZEIT_ABWEICHEND, Ist-Zeit zur Prüfung", async () => {
    await raumAnlegen("of-uhr", ["a1"], { abweichungen: {"a1|2026-11-08": "F"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-08T14:00:00Z");                                       // Server 15:00, Gerät meint 14:00
    const s = await stempeln("of-uhr", "a1", { art: "start", clientEventId: ID(13), offline: true,
      erfasstAm: "2026-11-08T04:00:00.000Z", gesendetAm: "2026-11-08T13:00:00.000Z" });
    expect([s.status, s.zeit]).toEqual([200, "06:00"]);                   // 05:00 Gerät + 1 h
    expect(s.markierungen).toContain("GERAETEZEIT_ABWEICHEND");
    const e = await stempeln("of-uhr", "a1", { art: "ende", clientEventId: ID(14), offline: true,
      erfasstAm: "2026-11-08T12:00:00.000Z", gesendetAm: "2026-11-08T13:00:00.000Z" });
    expect(e.status).toBe(200);
    expect(e.erfassung).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: false });
    expect(e.erfassung.grund).toMatch(/^OFFLINE_PRUEFEN/);
    const st = (await mandant("of-uhr")).einstempeln["a1|2026-11-08"];
    expect(st.offlineStart.versatzMs).toBe(3600000);
    expect(st.offlineStart.geraetAm).toBe("2026-11-08T04:00:00.000Z");     // die Gerätezeit bleibt nachvollziehbar
  });

  it("Erfassungszeit in der Zukunft: gilt der Eingang, markiert", async () => {
    await raumAnlegen("of-zukunft", ["a1"]);
    zeitAuf("2026-11-08T07:00:00Z");
    const s = await stempeln("of-zukunft", "a1", { art: "start", clientEventId: ID(15), offline: true,
      erfasstAm: "2026-11-09T07:00:00.000Z", gesendetAm: "2026-11-08T07:00:00.000Z" });
    expect([s.status, s.datum, s.zeit]).toEqual([200, "2026-11-08", "08:00"]);
    expect(s.markierungen).toContain("GERAETEZEIT_ABWEICHEND");
  });

  it("ohne Sendezeit oder mit unlesbarer Erfassungszeit: angenommen, markiert", async () => {
    await raumAnlegen("of-unlesbar", ["a1", "a2"]);
    zeitAuf("2026-11-08T07:00:00Z");
    const a = await stempeln("of-unlesbar", "a1", { art: "start", clientEventId: ID(16), offline: true,
      erfasstAm: "2026-11-08T05:00:00.000Z" });
    expect([a.status, a.zeit]).toEqual([200, "06:00"]);
    expect(a.markierungen).toContain("GERAETEZEIT_ABWEICHEND");
    const b = await stempeln("of-unlesbar", "a2", { art: "start", clientEventId: ID(17), offline: true,
      erfasstAm: "gestern früh", gesendetAm: "2026-11-08T07:00:00.000Z" });
    expect([b.status, b.zeit]).toEqual([200, "08:00"]);
    expect(b.markierungen).toContain("GERAETEZEIT_ABWEICHEND");
  });

  it("älter als 48 Stunden: gespeichert und zur Prüfung, nie abgelehnt; Wiederholung bleibt idempotent", async () => {
    await raumAnlegen("of-alt", ["a1"], { abweichungen: {"a1|2026-11-02": "F"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-12T07:00:00Z");
    const ev = (art, n, erfasstAm) => ({ art, clientEventId: ID(n), offline: true, erfasstAm, gesendetAm: "2026-11-12T07:00:00.000Z" });
    const s = await stempeln("of-alt", "a1", ev("start", 18, "2026-11-02T05:00:00.000Z"));
    expect([s.status, s.datum, s.zeit]).toEqual([200, "2026-11-02", "06:00"]);
    expect(s.markierungen).toEqual(expect.arrayContaining(["OFFLINE_ERFASST", "OFFLINE_ALT"]));
    const e = await stempeln("of-alt", "a1", ev("ende", 19, "2026-11-02T13:00:00.000Z"));
    expect([e.status, e.datum]).toEqual([200, "2026-11-02"]);
    expect(e.erfassung).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: false });
    expect(e.erfassung.grund).toMatch(/^OFFLINE_PRUEFEN/);
    const w = await stempeln("of-alt", "a1", ev("start", 18, "2026-11-02T05:00:00.000Z"));
    expect([w.status, w.wiederholt]).toEqual([200, true]);
    expect(stempelVon(await mandant("of-alt"), "a1")).toHaveLength(1);
  });
});

describe("Sitzungsbindung und Unveränderlichkeit", () => {
  it("Warteschlange einer anderen Person: nie unter dieser Sitzung gestempelt", async () => {
    zeitAuf("2026-11-09T07:00:00Z");
    await raumAnlegen("of-fremd", ["a1", "a2"]);
    const ta1 = await sitzung("of-fremd", "a1"), ta2 = await sitzung("of-fremd", "a2");
    const g1 = await anfrage("/api/bestand", { methode: "GET", token: ta1 });
    const g2 = await anfrage("/api/bestand", { methode: "GET", token: ta2 });
    expect(g1.inhaber).toMatch(/^[0-9a-f]{32}$/);
    expect(g1.inhaber).not.toBe(g2.inhaber);
    const fremd = await stempeln("of-fremd", "a2", { art: "start", clientEventId: ID(20), inhaber: g1.inhaber }, ta2);
    expect([fremd.status, fremd.code]).toEqual([409, "STEMPEL_FREMDE_SITZUNG"]);
    expect(stempelVon(await mandant("of-fremd"), "a2")).toHaveLength(0);
    const eigen = await stempeln("of-fremd", "a1", { art: "start", clientEventId: ID(20), inhaber: g1.inhaber }, ta1);
    expect([eigen.status, eigen.inhaber]).toEqual([200, g1.inhaber]);
  });

  it("Offline-Angaben und Kennung gehören zum Original: über das Speichern nicht änderbar (WP-06)", async () => {
    zeitAuf("2026-11-10T07:00:00Z");
    await raumAnlegen("of-original", ["a1"]);
    expect((await stempeln("of-original", "a1", { art: "start", clientEventId: ID(21), offline: true,
      erfasstAm: "2026-11-10T05:00:00.000Z", gesendetAm: "2026-11-10T07:00:00.000Z" })).status).toBe(200);
    const tl = (await sitzungAnlegen({ bestand: "of-original", name: "L", rolle: "leitung", person: null, betrieb: 0,
      mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
    const g = await anfrage("/api/bestand", { methode: "GET", token: tl });
    expect(g.status).toBe(200);
    for (const aendern of [(e) => { e.offlineStart.geraetAm = "2026-11-10T04:00:00.000Z"; },
      (e) => { delete e.offlineStart; }, (e) => { e.ereignisStart = ID(99); }]) {
      const b = structuredClone(g.bestand);
      aendern(b.mandanten[0].einstempeln["a1|2026-11-10"]);
      const p = await anfrage("/api/bestand", { methode: "PUT", token: tl, rumpf: { bestand: b, etag: g.etag, durch: "L" } });
      expect([p.status, p.code]).toEqual([403, "STEMPEL_UNVERAENDERLICH"]);
    }
    const st = (await mandant("of-original")).einstempeln["a1|2026-11-10"];
    expect(st.offlineStart.geraetAm).toBe("2026-11-10T05:00:00.000Z");
    expect(st.ereignisStart).toBe(ID(21));
  });

  it("Reihenfolge zählt: Ende vor Beginn ergäbe START_FEHLT und eine Absage (darum sendet die Warteschlange in Reihenfolge)", async () => {
    zeitAuf("2026-11-11T14:00:00Z");
    await raumAnlegen("of-reihe", ["a1"]);
    const e = await stempeln("of-reihe", "a1", { art: "ende", clientEventId: ID(23), offline: true,
      erfasstAm: "2026-11-11T13:00:00.000Z", gesendetAm: "2026-11-11T14:00:00.000Z" });
    expect(e.markierungen).toContain("START_FEHLT");
    const s = await stempeln("of-reihe", "a1", { art: "start", clientEventId: ID(22), offline: true,
      erfasstAm: "2026-11-11T05:00:00.000Z", gesendetAm: "2026-11-11T14:00:00.000Z" });
    expect([s.status, s.code]).toEqual([409, "STEMPEL_SCHON_AUSGESTEMPELT"]);
  });
});

/* ---------------------- Auflagen aus dem Opus-Review ---------------------- */
describe("Review A1: offline erfasste Zeit ist ohne Schalter nie automatisch bestätigt", () => {
  it("R1: Flugmodus + Geräteuhr auf gestern: ganzer Vortag 06:00–14:00 am Folgetag gesendet → zur Prüfung", async () => {
    await raumAnlegen("rv-r1", ["a1"], { abweichungen: {"a1|2026-11-06": "F"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-07T07:00:00Z");                                       // Uhr wieder richtig gestellt
    const ev = (art, n, erfasstAm) => ({ art, clientEventId: ID(n), offline: true, erfasstAm, gesendetAm: "2026-11-07T07:00:00.000Z" });
    const s = await stempeln("rv-r1", "a1", ev("start", 101, "2026-11-06T05:00:00.000Z"));
    expect([s.status, s.datum]).toEqual([200, "2026-11-06"]);
    expect(s.markierungen).not.toContain("GERAETEZEIT_ABWEICHEND");      // der Versatz ist unauffällig
    const e = await stempeln("rv-r1", "a1", ev("ende", 102, "2026-11-06T13:00:00.000Z"));
    expect(e.erfassung).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: false });
    expect(e.erfassung.grund).toMatch(/^OFFLINE_PRUEFEN/);
  });

  it("R1b: kommt 09:00, meldet offline 06:00 als Beginn, Ende online → zur Prüfung", async () => {
    await raumAnlegen("rv-r1b", ["a1"], { abweichungen: {"a1|2026-11-06": "F"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-06T08:00:00Z");                                       // 09:00 Berlin
    const s = await stempeln("rv-r1b", "a1", { art: "start", clientEventId: ID(103), offline: true,
      erfasstAm: "2026-11-06T05:00:00.000Z", gesendetAm: "2026-11-06T08:00:00.000Z" });
    expect([s.status, s.zeit]).toEqual([200, "06:00"]);
    zeitAuf("2026-11-06T13:00:00Z");
    const e = await stempeln("rv-r1b", "a1", { art: "ende", clientEventId: ID(104), offline: false,
      erfasstAm: "2026-11-06T13:00:00.000Z", gesendetAm: "2026-11-06T13:00:00.000Z" });
    expect(e.status).toBe(200);
    expect(e.erfassung).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: false });
    expect(e.erfassung.grund).toMatch(/^OFFLINE_PRUEFEN/);
  });

  it("kurz offline (unter 15 min zwischen Erfassung und Eingang): bestätigt", async () => {
    await raumAnlegen("rv-kurz", ["a1"], { abweichungen: {"a1|2026-11-06": "F"} });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-06T05:10:00Z");
    expect((await stempeln("rv-kurz", "a1", { art: "start", clientEventId: ID(105), offline: true,
      erfasstAm: "2026-11-06T05:00:00.000Z", gesendetAm: "2026-11-06T05:10:00.000Z" })).zeit).toBe("06:00");
    zeitAuf("2026-11-06T13:05:00Z");
    const e = await stempeln("rv-kurz", "a1", { art: "ende", clientEventId: ID(106), offline: true,
      erfasstAm: "2026-11-06T13:00:00.000Z", gesendetAm: "2026-11-06T13:05:00.000Z" });
    expect(e.erfassung).toEqual({ start: "06:00", ende: "14:00", bestaetigt: true, grund: "" });
  });

  it("Betriebsschalter „Offline-Stempeln vertrauen“: dann bestätigt (Uhrabweichung bleibt zur Prüfung)", async () => {
    await raumAnlegen("rv-schalter", ["a1", "a2"], { einstellungen: { offlineStempelVertrauen: true },
      abweichungen: { "a1|2026-11-06": "N", "a2|2026-11-07": "F" } });   // geplant (sonst ungeplant, WP-13)
    zeitAuf("2026-11-07T07:00:00Z");
    const ev = (art, n, erfasstAm, gesendetAm = "2026-11-07T07:00:00.000Z") => ({ art, clientEventId: ID(n), offline: true, erfasstAm, gesendetAm });
    await stempeln("rv-schalter", "a1", ev("start", 107, "2026-11-06T21:00:00.000Z"));
    const e = await stempeln("rv-schalter", "a1", ev("ende", 108, "2026-11-07T05:00:00.000Z"));
    expect(e.erfassung).toMatchObject({ start: "22:00", ende: "06:00", bestaetigt: true });
    await stempeln("rv-schalter", "a2", ev("start", 109, "2026-11-07T04:00:00.000Z", "2026-11-07T06:00:00.000Z"));
    const e2 = await stempeln("rv-schalter", "a2", ev("ende", 110, "2026-11-07T05:30:00.000Z", "2026-11-07T06:00:00.000Z"));
    expect(e2.erfassung.bestaetigt).toBe(false);                          // Uhr 1 h falsch: weiter zur Prüfung
    expect(e2.erfassung.grund).toMatch(/^OFFLINE_PRUEFEN/);
  });

  it("Schalter: nur org.edit (Leitung) schaltet, Wann/Wer setzt der Server; die Planung nicht", async () => {
    zeitAuf("2026-11-08T07:00:00Z");
    await raumAnlegen("rv-recht", [], { personen: [person("a1"), { ...person("l1"), rolle: "leitung" }, { ...person("p1"), rolle: "planer" }] });
    const tok = async (rolle, person) => (await sitzungAnlegen({ bestand: "rv-recht", name: rolle, rolle, person, betrieb: 0,
      mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
    const setzen = async (token, wert) => {
      const g = await anfrage("/api/bestand", { methode: "GET", token });
      const b = structuredClone(g.bestand);
      b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), offlineStempelVertrauen: wert,
        offlineStempelVertrauenAm: "1999-01-01T00:00:00.000Z", offlineStempelVertrauenVon: "jemand" };
      return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "T" } });
    };
    await setzen(await tok("planer", "p1"), true);
    expect((await mandant("rv-recht")).einstellungen?.offlineStempelVertrauen).not.toBe(true);
    const r = await setzen(await tok("leitung", "l1"), true);
    expect(r.status, JSON.stringify(r)).toBe(200);
    const e = (await mandant("rv-recht")).einstellungen;
    expect(e).toMatchObject({ offlineStempelVertrauen: true, offlineStempelVertrauenAm: "2026-11-08T07:00:00.000Z",
      offlineStempelVertrauenVon: "l1" });
  });
});

describe("Review A3/L2–L5: Fenster, Uhr vor, Art, Klemmen, Rohwerte, Inhaber", () => {
  it("S1: Wiederholung nach über 14 Tagen mit derselben Erfassungszeit findet den Stempel (Ereignistag im Fenster)", async () => {
    zeitAuf("2026-11-02T05:00:00Z");
    await raumAnlegen("rv-s1", ["a1"]);
    const ev = { art: "start", clientEventId: ID(111), erfasstAm: "2026-11-02T05:00:00.000Z" };
    expect((await stempeln("rv-s1", "a1", { ...ev, gesendetAm: "2026-11-02T05:00:00.000Z" })).status).toBe(200);
    zeitAuf("2026-11-22T05:00:00Z");
    const w = await stempeln("rv-s1", "a1", { ...ev, offline: true, gesendetAm: "2026-11-22T05:00:00.000Z" });
    expect([w.status, w.wiederholt, w.datum]).toEqual([200, true, "2026-11-02"]);
  });

  it("S7: Geräteuhr eine Stunde VOR: berichtigt und markiert", async () => {
    await raumAnlegen("rv-s7", ["a1"]);
    zeitAuf("2026-11-08T14:00:00Z");
    const s = await stempeln("rv-s7", "a1", { art: "start", clientEventId: ID(112), offline: true,
      erfasstAm: "2026-11-08T06:00:00.000Z", gesendetAm: "2026-11-08T15:00:00.000Z" });
    expect([s.status, s.zeit]).toEqual([200, "06:00"]);
    expect(s.markierungen).toContain("GERAETEZEIT_ABWEICHEND");
  });

  it("L2: dieselbe Kennung mit anderer Art → 422, kein Stempel", async () => {
    zeitAuf("2026-11-09T05:00:00Z");
    await raumAnlegen("rv-l2", ["a1"]);
    expect((await stempeln("rv-l2", "a1", { art: "start", clientEventId: ID(113) })).status).toBe(200);
    const x = await stempeln("rv-l2", "a1", { art: "ende", clientEventId: ID(113) });
    expect([x.status, x.code]).toEqual([422, "STEMPEL_EREIGNIS_WIDERSPRUCH"]);
    expect((await mandant("rv-l2")).einstempeln["a1|2026-11-09"].ende).toBeUndefined();
  });

  it("L3: ehrlicher kleiner Uhrversatz — Ende minimal vor dem Beginn wird auf den Beginn geklemmt, nicht START_VERALTET", async () => {
    await raumAnlegen("rv-l3", ["a1"]);
    zeitAuf("2026-11-09T05:00:00Z");
    expect((await stempeln("rv-l3", "a1", { art: "start", clientEventId: ID(114) })).zeit).toBe("06:00");
    zeitAuf("2026-11-09T05:03:00Z");
    const e = await stempeln("rv-l3", "a1", { art: "ende", clientEventId: ID(115), offline: true,
      erfasstAm: "2026-11-09T04:58:00.000Z", gesendetAm: "2026-11-09T05:01:00.000Z" });
    expect(e.status).toBe(200);
    expect(e.markierungen).not.toContain("START_VERALTET");
    expect(e.eintrag).toMatchObject({ start: "06:00", ende: "06:00" });
  });

  it("L4: unlesbare Gerätezeiten werden nicht roh gespeichert", async () => {
    await raumAnlegen("rv-l4", ["a1"]);
    zeitAuf("2026-11-09T07:00:00Z");
    const s = await stempeln("rv-l4", "a1", { art: "start", clientEventId: ID(116), offline: true,
      erfasstAm: "<script>gestern</script>", gesendetAm: "irgendwann" });
    expect(s.status).toBe(200);
    const st = (await mandant("rv-l4")).einstempeln["a1|2026-11-09"];
    expect(st.offlineStart.geraetAm).toBeNull();
    expect(st.offlineStart.gesendetAm).toBeNull();
  });

  it("L5: Inhaber hängt am Betrieb (mandantId), nicht an seiner Position", async () => {
    await raumAnlegen("rv-l5", ["a1"]);
    const tok = async (betrieb) => (await sitzungAnlegen({ bestand: "rv-l5", name: "a1", rolle: "mitarbeiter", person: "a1",
      betrieb, mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
    const a = await anfrage("/api/bestand", { methode: "GET", token: await tok(0) });
    const b = await anfrage("/api/bestand", { methode: "GET", token: await tok(3) });
    expect(a.inhaber).toMatch(/^[0-9a-f]{32}$/);
    expect(b.inhaber).toBe(a.inhaber);
  });

  /* Auflage A3 (Sicherheitsreview 181b4fe): Kennung „1" gegen Position 1 einer Sitzung ohne Kennung. Vorher ergaben
     beide `centric-stempel|raum|1|person` — derselbe Inhaber für zwei Personen in zwei Betrieben. */
  it("A3: Kennung „1“ und Position 1 ohne Kennung ergeben verschiedene Inhaber; fremder Stempel 409", async () => {
    zeitAuf("2026-11-09T07:00:00Z");
    const { createHash } = await import("node:crypto");
    const alt = (raum, teil, p) => createHash("sha256").update(`centric-stempel|${raum}|${teil}|${p}`).digest("hex").slice(0, 32);
    const haus = (id) => ({ id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB 1" }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
      personen: [person("a1")], abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {} });
    await B.bestandSchreiben(laden(), "rv-a3", { version: 9, mandanten: [haus("1"), haus("m2")] }, { durch: "Pruefung" });
    const tok = async (felder) => (await sitzungAnlegen({ bestand: "rv-a3", name: "a1", rolle: "mitarbeiter", person: "a1",
      einheit: null, ...felder }, 24 * 60 * 60 * 1000)).token;
    const mitKennung = await tok({ betrieb: 0, mandantId: "1" });
    const ohneKennung = await tok({ betrieb: 1 });
    const a = await anfrage("/api/bestand", { methode: "GET", token: mitKennung });
    const b = await anfrage("/api/bestand", { methode: "GET", token: ohneKennung });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.inhaber).toMatch(/^[0-9a-f]{32}$/);
    expect(b.inhaber).toMatch(/^[0-9a-f]{32}$/);
    expect(b.inhaber).not.toBe(a.inhaber);
    /* Gegenprobe: Positionen und gewöhnliche Kennungen behalten ihren bisherigen Inhaber (keine hängende Warteschlange). */
    expect(b.inhaber).toBe(alt("rv-a3", "1", "a1"));
    const c = await anfrage("/api/bestand", { methode: "GET", token: await tok({ betrieb: 1, mandantId: "m2" }) });
    expect(c.inhaber).toBe(alt("rv-a3", "m2", "a1"));
    /* Der Stempel aus der Warteschlange der Sitzung mit Kennung „1" geht unter der anderen nicht hinaus. */
    const fremd = await stempeln("rv-a3", "a1", { art: "start", clientEventId: ID(130), inhaber: a.inhaber }, ohneKennung);
    expect([fremd.status, fremd.code]).toEqual([409, "STEMPEL_FREMDE_SITZUNG"]);
    const eigen = await stempeln("rv-a3", "a1", { art: "start", clientEventId: ID(131), inhaber: a.inhaber }, mitKennung);
    expect(eigen.status).toBe(200);
  });

  /* ---- Delta-Review von ba5f7c5: Gegenproben zu A3 (Hashes ohne Kollision bleiben wie vor A3) ----
     Der Algorithmus vor A3 (181b4fe): `centric-stempel|raum|${mandantId ?? betrieb}|person`. */
  const hashAlt = async (raum, teil, p) => (await import("node:crypto")).createHash("sha256")
    .update(`centric-stempel|${raum}|${teil}|${p}`).digest("hex").slice(0, 32);
  const hausMit = (id) => ({ id, name: `Haus ${id}`, einheiten: [{ id: "e1", name: "WB 1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("a1")], abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {} });
  const inhaberVon = async (felder) => {
    const t = (await sitzungAnlegen({ name: "a1", rolle: "mitarbeiter", person: "a1", einheit: null, ...felder },
      24 * 60 * 60 * 1000)).token;
    const r = await anfrage("/api/bestand", { methode: "GET", token: t });
    expect(r.status, JSON.stringify(r)).toBe(200);
    expect(r.inhaber).toMatch(/^[0-9a-f]{32}$/);
    return r.inhaber;
  };

  it("A3 Gegenprobe: Position über 9 und Kennungen mit „-“, Leerzeichen, „|“ behalten den Inhaber von vor A3", async () => {
    zeitAuf("2026-11-09T07:00:00Z");
    const raum = "rv-a3-sonder";
    const kennungen = ["haus-7", "Haus Nord", "a|b"];
    const mandanten = [...Array.from({ length: 13 }, (_, i) => hausMit(`p${i}`)), ...kennungen.map(hausMit)];
    await B.bestandSchreiben(laden(), raum, { version: 9, mandanten }, { durch: "Pruefung" });
    const gesehen = new Set();
    /* Position 12 ohne Kennung: Ziffernfolge, vor A3 und jetzt „12". */
    const p12 = await inhaberVon({ bestand: raum, betrieb: 12 });
    expect(p12).toBe(await hashAlt(raum, "12", "a1"));
    gesehen.add(p12);
    for (const [i, k] of kennungen.entries()) {
      const h = await inhaberVon({ bestand: raum, betrieb: 13 + i, mandantId: k });
      expect(h, `Kennung ${JSON.stringify(k)}`).toBe(await hashAlt(raum, k, "a1"));
      gesehen.add(h);
    }
    /* Nur Fälle ohne Kollision: vier verschiedene Inhaber. */
    expect(gesehen.size).toBe(1 + kennungen.length);
  });

  it("A3 Gegenprobe: rein numerische Raum-ID — Inhaber unverändert, solange die Kennung des Betriebs keine reine Ziffernfolge ist", async () => {
    zeitAuf("2026-11-09T07:00:00Z");
    const raum = "4711";
    await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [hausMit("m1")] }, { durch: "Pruefung" });
    expect(await inhaberVon({ bestand: raum, betrieb: 0, mandantId: "m1" })).toBe(await hashAlt(raum, "m1", "a1"));
    expect(await inhaberVon({ bestand: raum, betrieb: 0 })).toBe(await hashAlt(raum, "0", "a1"));
  });

  it("A1 Gegenprobe (Code-Sitzung): aktive Person und Austrittstag heute stempeln mit 200; „gesperrt“ und „inaktiv“ bekommen 401", async () => {
    zeitAuf("2026-11-09T07:00:00Z");                                       // 08:00 Berlin, 09.11.
    const raum = "rv-a1-gegenprobe";
    const mit = (id, extra) => ({ ...person(id), ...extra });
    await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [{ ...hausMit("m1"), personen: [
      mit("g-aktiv", { status: "aktiv" }), mit("g-heute", { austritt: "2026-11-09" }),
      mit("g-gesperrt", { status: "gesperrt" }), mit("g-inaktiv", { status: "inaktiv" })] }] }, { durch: "Pruefung" });
    const st = async (id, n) => (await stempeln(raum, id, { art: "start", clientEventId: ID(n) })).status;
    expect(await st("g-aktiv", 140)).toBe(200);
    expect(await st("g-heute", 141)).toBe(200);
    expect(await st("g-gesperrt", 142)).toBe(401);
    expect(await st("g-inaktiv", 143)).toBe(401);
  });

  it("A3 bewusste Änderung (Nachweis 9.3): Betrieb mit rein numerischer Kennung (leerbetrieb: mandantId = Raum) bekommt „k:“", async () => {
    zeitAuf("2026-11-09T07:00:00Z");
    const raum = "4712";
    await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [hausMit(raum)] }, { durch: "Pruefung" });
    const neu = await inhaberVon({ bestand: raum, betrieb: 0, mandantId: raum });
    expect(neu).not.toBe(await hashAlt(raum, raum, "a1"));
    expect(neu).toBe(await hashAlt(raum, `k:${raum}`, "a1"));
  });
});

/* ---------------------- Nachprüfung (Opus) B1: Dauer 0 ---------------------- */
describe("Nachprüfung B1: Beginn gleich Ende ist nie automatisch bestätigt", () => {
  const ist = async (raum, datum, daId) => {
    const { istZeitFuer } = await import("../src/istdaten.js");
    const m = await mandant(raum);
    return istZeitFuer(m, m.personen.find((x) => x.id === "a1"), datum, m.dienstarten.find((x) => x.id === daId));
  };

  it("L3-Fall: Ende offline 05:57:30, Beginn online 06:00 → geklemmt, Dauer 0 zur Prüfung, Konto zählt die Planzeit (8 h, nicht 23,5 h)", async () => {
    await raumAnlegen("b1-l3", ["a1"], { abweichungen: { "a1|2026-11-10": "F" } });
    zeitAuf("2026-11-10T05:00:00Z");
    expect((await stempeln("b1-l3", "a1", { art: "start", clientEventId: ID(201) })).zeit).toBe("06:00");
    zeitAuf("2026-11-10T05:02:00Z");
    const e = await stempeln("b1-l3", "a1", { art: "ende", clientEventId: ID(202), offline: true,
      erfasstAm: "2026-11-10T04:57:30.000Z", gesendetAm: "2026-11-10T05:02:00.000Z" });
    expect(e.status).toBe(200);
    expect(e.markierungen).toContain("DAUER_NULL");
    expect(e.erfassung).toMatchObject({ start: "06:00", ende: "06:00", bestaetigt: false });
    expect(e.erfassung.grund).toMatch(/^DAUER_NULL/);
    const r = await ist("b1-l3", "2026-11-10", "F");
    expect([r.std, r.erfasst, r.zurPruefung]).toEqual([8, false, true]);
  });

  it("R16: Beginn und Ende online in derselben Minute → Dauer 0 zur Prüfung, nicht 23,5 h", async () => {
    await raumAnlegen("b1-r16", ["a1"], { abweichungen: { "a1|2026-11-10": "F" } });
    zeitAuf("2026-11-10T05:00:10Z");
    expect((await stempeln("b1-r16", "a1", { art: "start", clientEventId: ID(203) })).status).toBe(200);
    zeitAuf("2026-11-10T05:00:40Z");
    const e = await stempeln("b1-r16", "a1", { art: "ende", clientEventId: ID(204) });
    expect(e.erfassung).toMatchObject({ start: "06:00", ende: "06:00", bestaetigt: false });
    expect(e.erfassung.grund).toMatch(/^DAUER_NULL/);
    const r = await ist("b1-r16", "2026-11-10", "F");
    expect([r.std, r.zurPruefung]).toEqual([8, true]);
  });

  it("Dauer 0 ohne geplanten Dienst: DAUER_NULL geht vor ungeplant (bestätigt zählte sonst 24 h)", async () => {
    await raumAnlegen("b1-ungeplant", ["a1"]);
    zeitAuf("2026-11-10T05:00:10Z");
    await stempeln("b1-ungeplant", "a1", { art: "start", clientEventId: ID(208) });
    zeitAuf("2026-11-10T05:00:40Z");
    const e = await stempeln("b1-ungeplant", "a1", { art: "ende", clientEventId: ID(209) });
    expect(e.erfassung.bestaetigt).toBe(false);
    expect(e.erfassung.grund).toMatch(/^DAUER_NULL/);
    expect(e.markierungen).toEqual(expect.arrayContaining(["UNGEPLANTER_DIENST", "DAUER_NULL"]));
  });

  it("echter 24-h-Dienst 07:00–07:00 mit Pause: kein Dauer-0-Alarm; über den Korrekturweg zählt er 23,5 h", async () => {
    await raumAnlegen("b1-24h", [], { abweichungen: { "a1|2026-11-10": "D24" },
      personen: [person("a1"), { ...person("l1"), rolle: "leitung" }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" },
        { id: "D24", name: "24-Stunden-Dienst", start: "07:00", ende: "07:00", pause: 30 }] });
    zeitAuf("2026-11-10T06:00:00Z");                                       // 07:00 Berlin
    expect((await stempeln("b1-24h", "a1", { art: "start", clientEventId: ID(205) })).status).toBe(200);
    zeitAuf("2026-11-11T06:00:00Z");                                       // 07:00 am Folgetag
    const e = await stempeln("b1-24h", "a1", { art: "ende", clientEventId: ID(206) });
    expect(e.status).toBe(200);
    /* 24 h liegen über der 20-Stunden-Zuordnung (WP-17, B6.3): eigenes Ende, kein Dauer-0-Fall. */
    expect(e.markierungen).not.toContain("DAUER_NULL");
    const tl = (await sitzungAnlegen({ bestand: "b1-24h", name: "L", rolle: "leitung", person: "l1", betrieb: 0,
      mandantId: "m1", einheit: null }, 24 * 60 * 60 * 1000)).token;
    const k = await anfrage("/api/stempel-korrektur", { token: tl, rumpf: { personId: "a1", datum: "2026-11-10",
      start: "07:00", ende: "07:00", grund: "24-Stunden-Dienst wie geplant geleistet" } });
    expect(k.status, JSON.stringify(k)).toBe(200);
    const r = await ist("b1-24h", "2026-11-10", "D24");
    expect([r.std, r.erfasst]).toEqual([23.5, true]);
  });

  it("Zukunft ohne Toleranz: Erfassungszeit 3 min nach dem Eingang wird auf den Eingang geklemmt", async () => {
    await raumAnlegen("b1-zukunft", ["a1"], { abweichungen: { "a1|2026-11-10": "F" } });
    zeitAuf("2026-11-10T07:00:00Z");
    const s = await stempeln("b1-zukunft", "a1", { art: "start", clientEventId: ID(207), offline: true,
      erfasstAm: "2026-11-10T07:03:00.000Z", gesendetAm: "2026-11-10T07:00:00.000Z" });
    expect([s.status, s.zeit]).toEqual([200, "08:00"]);
  });
});
