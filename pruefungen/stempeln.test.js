/* ==========================================================================
   STEMPELN — Erfolg nur, wenn der Server es gespeichert hat

   /api/stempeln liest den Bestand, rechnet den Eintrag und schreibt mit
   dem gelesenen Stand. Ändert in diesem Augenblick jemand anderes denselben
   Monat, scheitert das Schreiben (Konflikt). Bis Oktober 2026 kam trotzdem
   „ok: true" zurück, und die Oberfläche zeigte eine Stempelzeit, die es auf
   dem Server nicht gab.

   Der Konflikt wird hier gezielt erzeugt: Unmittelbar bevor /api/stempeln
   schreibt, speichert eine Leitung eine Änderung im selben Monat.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/* Der Eingriff: vor dem nächsten Schreibvorgang eine fremde Änderung. */
const zwischen = { vorher: null };
vi.mock("../server/lib/bestand.mjs", async (original) => {
  const echt = await original();
  return { ...echt,
    bestandSchreiben: async (store, raum, bestand, opt) => {
      const f = zwischen.vorher;
      zwischen.vorher = null;
      if (f) await f(echt, store, raum);
      return echt.bestandSchreiben(store, raum, bestand, opt);
    } };
});

const WIRT = "127.0.0.1:3000";
const RAUM = "stempel-probe";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B;
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.7.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
async function sitzung(code, rolle, person) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `Probe ${rolle}`, bestand: RAUM, rolle, person,
    betrieb: 0, mandantId: "m1", angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, JSON.stringify(a)).toBeTruthy();
  return a.token;
}
const person = (id, rolle) => ({ id, vorname: "V", nachname: id, rolle, bereich: "e1",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const stand = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];

/** Die fremde Änderung: eine Leitung trägt im selben Monat einen Dienst ein. */
const leitungAendertMonat = (schluessel) => async (echt, store, raum) => {
  const g = await echt.bestandLesen(store, raum);
  const b = JSON.parse(JSON.stringify(g.bestand));
  b.mandanten[0].abweichungen[schluessel] = "F";
  const e = await echt.bestandSchreiben(store, raum, b, { erwarteterStand: g.stand, durch: "Leitung" });
  expect(e.ok).toBe(true);
};

let tA, tS, tB;
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-stempeln-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("s1", "subplaner"),
      person("b1", "mitarbeiter"), person("x1", "mitarbeiter")],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {} }] }, { durch: "Pruefung" });
  tA = await sitzung("STMP-AAAA-0001", "mitarbeiter", "a1");
  tS = await sitzung("STMP-SSSS-0002", "subplaner", "s1");
  tB = await sitzung("STMP-BBBB-0003", "mitarbeiter", "b1");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Konflikt beim Stempeln: kein falscher Erfolg", () => {
  it("C. Einstempeln mit gleichzeitiger Änderung desselben Monats: 409, nichts gespeichert", async () => {
    zwischen.vorher = leitungAendertMonat(`x1|${HEUTE}`);
    const a = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "start" } });
    const m = await stand();
    expect(m.abweichungen[`x1|${HEUTE}`]).toBe("F");                     // die fremde Änderung ist da
    expect((m.einstempeln || {})[`a1|${HEUTE}`]).toBeUndefined();          // der Stempel nicht
    expect(a.ok, "Erfolg gemeldet, obwohl nichts gespeichert wurde").not.toBe(true);
    expect(a.status).toBe(409);
    expect(a.code).toBe("STEMPEL_KONFLIKT");
  });
  it("A. danach normal einstempeln: 200, gespeichert, Antwort = Serverstand", async () => {
    const a = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "start" } });
    expect(a.status).toBe(200);
    const m = await stand();
    expect(m.einstempeln[`a1|${HEUTE}`]).toEqual(a.eintrag);
  });
  it("D. Ausstempeln mit Konflikt: 409, kein Ende und keine Erfassung gespeichert", async () => {
    zwischen.vorher = leitungAendertMonat(`a2|${HEUTE}`);
    const a = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "ende" } });
    const m = await stand();
    expect(m.einstempeln[`a1|${HEUTE}`].ende).toBeUndefined();
    expect((m.erfassung || {})[`a1|${HEUTE}`]).toBeUndefined();
    expect(a.ok).not.toBe(true);
    expect(a.status).toBe(409);
    expect(a.code).toBe("STEMPEL_KONFLIKT");
  });
  it("B. danach normal ausstempeln: 200, Ende und Erfassung gespeichert, Antwort = Serverstand", async () => {
    const a = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "ende" } });
    expect(a.status).toBe(200);
    const m = await stand();
    expect(m.einstempeln[`a1|${HEUTE}`]).toEqual(a.eintrag);
    expect(m.erfassung[`a1|${HEUTE}`]).toEqual(a.erfassung);
    expect(a.erfassung).toMatchObject({ bestaetigt: true, start: a.eintrag.start, ende: a.eintrag.ende });
  });
  it("E. Wiederholung: zweites Ein- oder Ausstempeln 409, nichts überschrieben", async () => {
    const vorher = await stand();
    const s = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "start" } });
    const e = await anfrage("/api/stempeln", { token: tA, rumpf: { datum: HEUTE, art: "ende" } });
    expect([s.status, s.code]).toEqual([409, "STEMPEL_SCHON_EINGESTEMPELT"]);
    expect([e.status, e.code]).toEqual([409, "STEMPEL_SCHON_AUSGESTEMPELT"]);
    const nachher = await stand();
    expect(nachher.einstempeln[`a1|${HEUTE}`]).toEqual(vorher.einstempeln[`a1|${HEUTE}`]);
    expect(nachher.erfassung[`a1|${HEUTE}`]).toEqual(vorher.erfassung[`a1|${HEUTE}`]);
  });
  it("F. anschließendes Speichern mit der lokalen Kopie: 200, Serverstand bleibt", async () => {
    const r = await anfrage("/api/bestand", { methode: "GET", token: tA });
    const b = JSON.parse(JSON.stringify(r.bestand));
    const vorher = await stand();
    b.mandanten[0].einstempeln = { ...(b.mandanten[0].einstempeln || {}), [`a1|${HEUTE}`]: { start: "00:00", ende: "23:59" } };
    b.mandanten[0].personen.find((p) => p.id === "a1").telefon = "0151";
    const w = await anfrage("/api/bestand", { methode: "PUT", token: tA, rumpf: { bestand: b, etag: r.etag } });
    expect(w.status).toBe(200);
    const m = await stand();
    expect(m.einstempeln[`a1|${HEUTE}`]).toEqual(vorher.einstempeln[`a1|${HEUTE}`]);
    expect(m.personen.find((p) => p.id === "a1").telefon).toBe("0151");
  });
  it("G. Schichtverantwortung, eigener Stempel: Konflikt 409, dann 200", async () => {
    zwischen.vorher = leitungAendertMonat(`b1|${HEUTE}`);
    const k = await anfrage("/api/stempeln", { token: tS, rumpf: { datum: HEUTE, art: "start" } });
    expect([k.status, k.code, k.ok]).toEqual([409, "STEMPEL_KONFLIKT", undefined]);
    expect(((await stand()).einstempeln || {})[`s1|${HEUTE}`]).toBeUndefined();
    const ok = await anfrage("/api/stempeln", { token: tS, rumpf: { datum: HEUTE, art: "start" } });
    expect(ok.status).toBe(200);
    expect((await stand()).einstempeln[`s1|${HEUTE}`]).toEqual(ok.eintrag);
  });
  it("eine Änderung an einem anderen Monat ist kein Konflikt", async () => {
    zwischen.vorher = leitungAendertMonat("x1|2020-01-15");
    const a = await anfrage("/api/stempeln", { token: tB, rumpf: { datum: HEUTE, art: "start" } });
    expect(a.status).toBe(200);
    expect((await stand()).einstempeln[`b1|${HEUTE}`]).toEqual(a.eintrag);
  });
});

describe("Protokoll", () => {
  it("Konflikte als Konflikt, Erfolg nur bei gespeichertem Stempel", async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const spur = getStore({ name: "centric-spur" });
    const tag = new Date().toISOString().slice(0, 10);
    const { blobs } = await spur.list({ prefix: `${tag}/schreiben/` });
    const zeilen = [];
    for (const b of blobs) zeilen.push(await spur.get(b.key, { type: "json" }));
    const stempel = zeilen.filter((z) => /^stempeln /.test(z.zusatz || ""));
    /* C, D, G: drei Konflikte; A, B, G, anderer Monat: vier Erfolge; E: zwei Absagen. */
    expect(stempel.filter((z) => z.ausgang === "konflikt")).toHaveLength(3);
    expect(stempel.filter((z) => z.ausgang === "erfolg")).toHaveLength(4);
    expect(stempel.filter((z) => z.ausgang === "abgewiesen")).toHaveLength(2);
  });
});
