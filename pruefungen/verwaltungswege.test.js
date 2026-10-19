/* ==========================================================================
   VERWALTUNGSWEGE — an den eigenen Betrieb gebunden (Commit 1e.4b)

   Bis Oktober 2026 prüften Sicherungsschlüssel (auflisten, widerrufen) und
   „Zugang sperren" nur denselben Raum. In einem Raum mit mehreren
   Betrieben sah die Leitung von A die Sicherungsschlüssel von B und
   widerrief sie — mit einer beliebig kurzen Kennung als Präfix —, sperrte
   mit „alle des Betriebs" auch die Zugänge von B und beendete deren
   Sitzungen. Jetzt nur der eigene Betrieb; der Betreiber sperrt raumweit.

   Die Prüfung läuft über den echten Handler; ältere Schlüssel und Codes
   ohne Betriebskennung werden direkt in der Ablage angelegt, so wie sie
   heute dort liegen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const WIRT = "127.0.0.1:3000";
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
let wurzel, laden, sitzungenAblage, daten, kontoSchreiben, kontoLesen, ablageSchluessel, B;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.6.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
async function code(c, raum, rolle, betrieb, mandantId, person = null) {
  await kontoSchreiben(laden(), ablageSchluessel(c), { name: `${rolle} ${betrieb}`, bestand: raum, rolle, person, betrieb,
    ...(mandantId ? { mandantId } : {}), angelegt: "2026-01-01T00:00:00.000Z" });
  return ablageSchluessel(c);
}
async function anmelden(c) {
  const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: c } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}
async function schluessel(roh, raum, mandantId, betrieb = 0) {
  await sitzungenAblage().setJSON(`sk:${hash(roh)}`, { bestand: raum, rolle: "leitung", nurSicherung: true, betrieb,
    ...(mandantId ? { mandantId } : {}), angelegt: new Date().toISOString(), bis: Date.now() + 86400000 });
  return hash(roh).slice(0, 8);
}
const gibt = async (roh) => !!(await sitzungenAblage().get(`sk:${hash(roh)}`, { type: "json" }).catch(() => null));
const lesbar = async (t) => (await anfrage("/api/bestand", { methode: "GET", token: t })).status === 200;

let tA, tB, tBetr, tA1;
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-verwaltung-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  sitzungenAblage = () => getStore({ name: "centric-sitzungen", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben, kontoLesen } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  const betrieb = (id) => ({ id, name: id, einheiten: [{ id: "e1" }], personen: [{ id: "l", rolle: "leitung", bereich: "ALLE" }] });
  await B.bestandSchreiben(laden(), "zwei", { version: 9, mandanten: [betrieb("m-a"), betrieb("m-b")] }, { durch: "Pruefung" });
  await B.bestandSchreiben(laden(), "einer", { version: 9, mandanten: [betrieb("m-solo")] }, { durch: "Pruefung" });
  await code("VWLG-AAAA-0001", "zwei", "leitung", 0, "m-a", "l");
  await code("VWLG-BBBB-0002", "zwei", "leitung", 1, "m-b", "l");
  await code("VWBT-RRRR-0003", "zwei", "betreiber", 0, null);
  await code("VWLG-SOLO-0004", "einer", "leitung", 0, "m-solo", "l");
  tA = await anmelden("VWLG-AAAA-0001");
  tB = await anmelden("VWLG-BBBB-0002");
  tBetr = await anmelden("VWBT-RRRR-0003");
  tA1 = await anmelden("VWLG-SOLO-0004");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("D1 Sicherungsschlüssel", () => {
  let kA, kB, kAlt;
  beforeAll(async () => {
    kA = await schluessel("sk-a", "zwei", "m-a", 0);
    kB = await schluessel("sk-b", "zwei", "m-b", 1);
    kAlt = await schluessel("sk-alt-zwei", "zwei", null);
  });
  it("A listet nur die eigenen — B und der ungebundene alte fehlen vollständig", async () => {
    const l = await anfrage("/api/sicherungsschluessel", { methode: "GET", token: tA });
    expect(l.status).toBe(200);
    expect(l.schluessel.map((x) => x.kennung)).toEqual([kA]);
    expect(JSON.stringify(l)).not.toContain(kB);
    expect(JSON.stringify(l)).not.toContain(kAlt);
  });
  it("B listet nur die eigenen", async () => {
    const l = await anfrage("/api/sicherungsschluessel", { methode: "GET", token: tB });
    expect(l.schluessel.map((x) => x.kennung)).toEqual([kB]);
  });
  it("A widerruft den Schlüssel von B: kein Treffer, B bleibt gültig — gleiche Antwort wie für eine unbekannte Kennung", async () => {
    const fremd = await anfrage("/api/sicherungsschluessel", { methode: "DELETE", token: tA, rumpf: { kennung: kB } });
    const unbekannt = await anfrage("/api/sicherungsschluessel", { methode: "DELETE", token: tA, rumpf: { kennung: "0000ffff" } });
    expect(fremd).toEqual({ status: 200, ok: true, widerrufen: 0 });
    expect(unbekannt).toEqual(fremd);
    expect(await gibt("sk-b")).toBe(true);
  });
  it("Präfix-Widerruf: abgewiesen, nichts widerrufen", async () => {
    for (const kz of [kB.slice(0, 1), kB.slice(0, 4), ""]) {
      const a = await anfrage("/api/sicherungsschluessel", { methode: "DELETE", token: tA, rumpf: { kennung: kz } });
      expect(a.status, kz).toBe(400);
    }
    expect(await gibt("sk-b")).toBe(true);
    expect(await gibt("sk-a")).toBe(true);
  });
  it("alter ungebundener Schlüssel im Raum mit mehreren Betrieben: nicht widerrufbar", async () => {
    const a = await anfrage("/api/sicherungsschluessel", { methode: "DELETE", token: tA, rumpf: { kennung: kAlt } });
    expect(a.widerrufen).toBe(0);
    expect(await gibt("sk-alt-zwei")).toBe(true);
  });
  it("A widerruft den eigenen: erfolgreich", async () => {
    const a = await anfrage("/api/sicherungsschluessel", { methode: "DELETE", token: tA, rumpf: { kennung: kA } });
    expect(a.widerrufen).toBe(1);
    expect(await gibt("sk-a")).toBe(false);
  });
  it("alter ungebundener Schlüssel im Raum mit genau einem Betrieb: sichtbar und widerrufbar", async () => {
    const kSolo = await schluessel("sk-alt-solo", "einer", null);
    const l = await anfrage("/api/sicherungsschluessel", { methode: "GET", token: tA1 });
    expect(l.schluessel.map((x) => x.kennung)).toEqual([kSolo]);
    const a = await anfrage("/api/sicherungsschluessel", { methode: "DELETE", token: tA1, rumpf: { kennung: kSolo } });
    expect(a.widerrufen).toBe(1);
  });
  it("Betreiber: hat (wie bisher) keinen Weg über diese Schnittstelle", async () => {
    expect((await anfrage("/api/sicherungsschluessel", { methode: "GET", token: tBetr })).status).toBe(403);
  });
});

describe("D2 Zugang sperren", () => {
  it("A sperrt einen Code von B einzeln (Code, Prüfsumme, Kennung): nichts gesperrt, B-Sitzung läuft — Antwort wie unbekannt", async () => {
    const hB = ablageSchluessel("VWLG-BBBB-0002");
    const unbekannt = await anfrage("/api/zugang-sperren", { token: tA, rumpf: { code: "GIBT-ESNI-CHT0" } });
    for (const rumpf of [{ code: "VWLG-BBBB-0002" }, { pruefsumme: hB }, { kennung: hB.slice(-8) }]) {
      const a = await anfrage("/api/zugang-sperren", { token: tA, rumpf });
      expect(a, JSON.stringify(rumpf)).toEqual(unbekannt);
      expect(a.gesperrt).toBe(0);
    }
    expect((await kontoLesen(laden(), hB)).gesperrt).toBeFalsy();
    expect(await lesbar(tB)).toBe(true);
  });
  it("alleDesBetriebs von A sperrt nur A — B-Codes, B-Sitzung und Betreibercode bleiben", async () => {
    const a1 = await code("VWMA-AAAA-0005", "zwei", "mitarbeiter", 0, "m-a", "x");
    const alt = await code("VWMA-ALTA-0006", "zwei", "mitarbeiter", 0, null, "y");      // Altcode Betrieb 0
    const altB = await code("VWMA-ALTB-0007", "zwei", "mitarbeiter", 1, null, "z");     // Altcode Betrieb 1
    const b1 = await code("VWMA-BBBB-0008", "zwei", "mitarbeiter", 1, "m-b", "w");
    const tB1 = await anmelden("VWMA-BBBB-0008");
    const a = await anfrage("/api/zugang-sperren", { token: tA, rumpf: { alleDesBetriebs: true } });
    expect(a.gesperrt).toBe(2);
    expect((await kontoLesen(laden(), a1)).gesperrt).toBe(true);
    expect((await kontoLesen(laden(), alt)).gesperrt).toBe(true);
    expect((await kontoLesen(laden(), altB)).gesperrt).toBeFalsy();
    expect((await kontoLesen(laden(), b1)).gesperrt).toBeFalsy();
    expect((await kontoLesen(laden(), ablageSchluessel("VWLG-BBBB-0002"))).gesperrt).toBeFalsy();
    expect((await kontoLesen(laden(), ablageSchluessel("VWBT-RRRR-0003"))).gesperrt).toBeFalsy();
    expect(await lesbar(tB)).toBe(true);
    expect(await lesbar(tB1)).toBe(true);
    expect(await lesbar(tA)).toBe(true);                                                // eigener Zugang bleibt
  });
  it("A sperrt einen eigenen Code einzeln: erfolgreich, dessen Sitzung endet", async () => {
    await code("VWMA-AAAA-0009", "zwei", "mitarbeiter", 0, "m-a", "v");
    const t = await anmelden("VWMA-AAAA-0009");
    const a = await anfrage("/api/zugang-sperren", { token: tA, rumpf: { code: "VWMA-AAAA-0009" } });
    expect(a.gesperrt).toBe(1);
    expect(await lesbar(t)).toBe(false);
  });
  it("Betreiber sperrt weiterhin raumweit", async () => {
    await code("VWMA-BBBB-0010", "zwei", "mitarbeiter", 1, "m-b", "u");
    const a = await anfrage("/api/zugang-sperren", { token: tBetr, rumpf: { code: "VWMA-BBBB-0010" } });
    expect(a.gesperrt).toBe(1);
  });
  it("ohne Angabe: 400 (nach Eingabe, nicht nach Fund)", async () => {
    expect((await anfrage("/api/zugang-sperren", { token: tA, rumpf: {} })).status).toBe(400);
    expect((await anfrage("/api/zugang-sperren", { token: tA, rumpf: { kennung: "zu-kurz" } })).status).toBe(400);
  });
});
