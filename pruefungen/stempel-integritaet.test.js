/* ==========================================================================
   STEMPEL-INTEGRITÄT (WP-06) — Originale unveränderlich, Korrekturereignisse

   Rechtematrix: jede Rolle × Originalstempel ändern / löschen / Feld löschen /
   Korrektur direkt anhängen / Stempel erfinden / Ist-Zeit eines gestempelten
   Tages ändern ⇒ 403, gespeicherter Stand unverändert. Leitung, Planung und
   Probierraum zusätzlich: weggelassener Stempel bei aktuellem Stand ⇒ 403.
   Rundreise: unverändert zurückgeschickt ⇒ 200, nichts ändert sich.
   Korrektur nur als Ereignis über /api/stempel-korrektur (Leitung, Planung,
   Probierraum); das Original bleibt Feld für Feld. Datenschutz (H8+): die
   Ereignisse sieht nur, wer den Stempel sieht. Veraltete Kopien, Löschlauf
   nach Aufbewahrungsfrist, Wiederherstellen aus Sicherung, Altbestand.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stempelWiderspruch, stempelSichern, korrekturAnhaengen, stempelBeiWiederherstellung, loeschStichtag,
  KORREKTUREN_MAX, KORREKTUR_HINWEIS_AB, KORREKTUR_GRUND_MAX, KORREKTUREN_GRUENDE_MAX,
  KORRIGIERT_TEXT } from "../server/lib/stempelintegritaet.mjs";
import { istZeitFuer } from "../src/istdaten.js";

const WIRT = "127.0.0.1:3000";
const RAUM = "stempel-integritaet";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B;
const HEUTE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const tag = (n) => new Date(Date.parse(`${HEUTE}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const GESTERN = tag(-1), VORGESTERN = tag(-2);
const ALT = "2023-01-10";                       // jenseits jeder Aufbewahrungsfrist (≥ 24 Monate)

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
async function sitzung(code, rolle, person) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `Probe ${rolle}`, bestand: RAUM, rolle, person,
    betrieb: 0, mandantId: rolle === "betreiber" ? null : "m1", angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage("anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy();
  return a.token;
}
const person = (id, rolle) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle, bereich: "e1",
  wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const stempel = (start, ende, extra = {}) => ({ start, startAm: `${GESTERN}T05:00:00.000Z`, ortStart: "Ohne Standortfreigabe erfasst",
  innerhalbStart: null, geprueftStart: false, ende, endeAm: `${GESTERN}T13:00:00.000Z`, ortEnde: "Ohne Standortfreigabe erfasst",
  innerhalbEnde: null, geprueftEnde: false, ...extra });

const T = {};
const ROLLEN = [["leitung", "l1"], ["planer", "p1"], ["subplaner", "s1"], ["mitarbeiter", "a1"],
  ["betriebsrat", "r1"], ["kunde", null], ["betreiber", null]];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-stempel-integritaet-"));
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
  const einstempeln = {}, erfassung = {};
  for (const pid of ["l1", "p1", "s1", "a1", "r1", "a2"]) {
    einstempeln[`${pid}|${GESTERN}`] = stempel("06:02", "14:01");
    erfassung[`${pid}|${GESTERN}`] = { start: "06:02", ende: "14:01", bestaetigt: true, grund: "" };
  }
  /* Altbestand: Stempel aus der Zeit vor startAm und Geo V1 — gilt als Original. */
  einstempeln[`a2|${VORGESTERN}`] = { start: "06:00", ende: "14:00", ort: "Station", innerhalb: true, abstand: 12 };
  erfassung[`a2|${VORGESTERN}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
  einstempeln[`a2|${ALT}`] = { start: "06:00", ende: "14:00" };
  erfassung[`a2|${ALT}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: [person("l1", "leitung"), person("p1", "planer"), person("s1", "subplaner"), person("a1", "mitarbeiter"),
      person("r1", "betriebsrat"), person("a2", "mitarbeiter")],
    abweichungen: { [`a1|${GESTERN}`]: "F" }, abwesenheiten: [], erfassung, einstempeln, einstellungen: {} }] }, { durch: "Pruefung" });
  let i = 0;
  for (const [rolle, pid] of ROLLEN) T[rolle] = await sitzung(`STIN-${String(++i).padStart(4, "0")}-${rolle.slice(0, 4).toUpperCase()}`, rolle, pid);
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

/* Die eigene Person der Rolle, sonst a1: ein Stempel, den es gespeichert gibt. */
const ziel = (pid) => `${pid || "a1"}|${GESTERN}`;
const EINGRIFFE = {
  "Originalstempel ändern": (m, k, st) => { m.einstempeln = { ...(m.einstempeln || {}), [k]: { ...st, start: "05:00" } }; },
  "Originalstempel löschen (null)": (m, k) => { m.einstempeln = { ...(m.einstempeln || {}), [k]: null }; },
  "Originalfeld löschen (ende: null)": (m, k, st) => { m.einstempeln = { ...(m.einstempeln || {}), [k]: { ...st, ende: null } }; },
  "Korrektur am Ereignisweg vorbei anhängen": (m, k, st) => { m.einstempeln = { ...(m.einstempeln || {}), [k]: { ...st,
    korrekturen: [{ id: "x", vorher: null, nachher: { start: "05:00", ende: "15:00" }, wer: {}, wann: "2026-01-01T00:00:00Z", grund: "selbst" }] } }; },
  "Kennzeichen setzen": (m, k, st) => { m.einstempeln = { ...(m.einstempeln || {}), [k]: { ...st, markierungen: ["KONFLIKT"] } }; },
  "Stempel erfinden": (m, k) => { m.einstempeln = { ...(m.einstempeln || {}), [`${k.split("|")[0]}|${HEUTE}`]: { start: "06:00" } }; },
  "Ist-Zeit des gestempelten Tages ändern": (m, k) => { m.erfassung = { ...(m.erfassung || {}), [k]: { start: "05:00", ende: "15:00", bestaetigt: true, grund: "" } }; },
};

describe("Rechtematrix: jede Rolle × Originalstempel ändern oder löschen ⇒ 403", () => {
  for (const [rolle, pid] of ROLLEN) {
    for (const [name, eingriff] of Object.entries(EINGRIFFE)) {
      it(`${rolle}: ${name} ⇒ 403, gespeicherter Stand unverändert`, async () => {
        const vorher = await gespeichert();
        const r = await anfrage("bestand", { methode: "GET", token: T[rolle] });
        expect(r.status, r.roh).toBe(200);
        const b = JSON.parse(JSON.stringify(r.bestand));
        const m = b.mandanten.find((x) => x && x.id === "m1") || b.mandanten[0];
        const k = ziel(pid);
        eingriff(m, k, vorher.einstempeln[k]);
        const w = await anfrage("bestand", { methode: "PUT", token: T[rolle], rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
        expect(w.status, w.roh).toBe(403);
        if (rolle !== "betriebsrat") expect(w.code, w.roh).toBe("STEMPEL_UNVERAENDERLICH");
        const nachher = await gespeichert();
        expect(nachher.einstempeln).toEqual(vorher.einstempeln);
        expect(nachher.erfassung).toEqual(vorher.erfassung);
      });
    }
  }
  for (const rolle of ["leitung", "planer", "kunde"]) {
    it(`${rolle}: Stempel bei aktuellem Stand weglassen ⇒ 403 (Löschen), ebenso seine Ist-Zeit`, async () => {
      const vorher = await gespeichert();
      for (const weg of [(m) => { delete m.einstempeln[`a1|${GESTERN}`]; }, (m) => { delete m.erfassung[`a1|${GESTERN}`]; },
        (m) => { delete m.einstempeln[`a1|${GESTERN}`].endeAm; }]) {
        const r = await anfrage("bestand", { methode: "GET", token: T[rolle] });
        const b = JSON.parse(JSON.stringify(r.bestand));
        weg(b.mandanten[0]);
        const w = await anfrage("bestand", { methode: "PUT", token: T[rolle], rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
        expect([w.status, w.code], w.roh).toEqual([403, "STEMPEL_UNVERAENDERLICH"]);
      }
      expect((await gespeichert()).einstempeln).toEqual(vorher.einstempeln);
    });
  }
  it("Betreiber: neuer Betrieb mit Stempeln ⇒ 403", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.betreiber });
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten.push({ id: "m-neu", name: "Neu", einstempeln: { [`z1|${GESTERN}`]: { start: "06:00", ende: "14:00" } } });
    const w = await anfrage("bestand", { methode: "PUT", token: T.betreiber, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect([w.status, w.code], w.roh).toEqual([403, "STEMPEL_UNVERAENDERLICH"]);
    expect((await B.bestandLesen(laden(), RAUM)).bestand.mandanten.some((m) => m && m.id === "m-neu")).toBe(false);
  });
});

describe("Rundreise: unverändert zurückgeschickt ⇒ 200, Stempel unverändert", () => {
  for (const [rolle] of ROLLEN.filter(([r]) => r !== "betriebsrat")) {
    it(`${rolle}`, async () => {
      const vorher = await gespeichert();
      const r = await anfrage("bestand", { methode: "GET", token: T[rolle] });
      const w = await anfrage("bestand", { methode: "PUT", token: T[rolle], rumpf: { bestand: r.bestand, etag: r.etag, durch: "Test" } });
      expect(w.status, w.roh).toBe(200);
      const nachher = await gespeichert();
      expect(nachher.einstempeln).toEqual(vorher.einstempeln);
      expect(nachher.erfassung).toEqual(vorher.erfassung);
    });
  }
});

describe("Korrektur nur als Ereignis (/api/stempel-korrektur)", () => {
  for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber"]) {
    it(`${rolle}: 403, nichts gespeichert`, async () => {
      const vorher = await gespeichert();
      const w = await anfrage("stempel-korrektur", { token: T[rolle],
        rumpf: { personId: "a1", datum: GESTERN, start: "06:00", ende: "15:00", grund: "Test mit ausreichend langem Grund" } });
      expect(w.status, w.roh).toBe(403);
      expect((await gespeichert()).einstempeln).toEqual(vorher.einstempeln);
    });
  }
  it("ohne Grund 422, ohne Stempel 404, ungültige Uhrzeit 422", async () => {
    const r1 = await anfrage("stempel-korrektur", { token: T.leitung, rumpf: { personId: "a1", datum: GESTERN, start: "06:00", ende: "15:00", grund: " " } });
    expect(r1.status).toBe(422);
    const r2 = await anfrage("stempel-korrektur", { token: T.leitung, rumpf: { personId: "a1", datum: tag(-30), start: "06:00", ende: "15:00", grund: "Test mit ausreichend langem Grund" } });
    expect(r2.status).toBe(404);
    const r3 = await anfrage("stempel-korrektur", { token: T.leitung, rumpf: { personId: "a1", datum: GESTERN, start: "6 Uhr", ende: "15:00", grund: "Test mit ausreichend langem Grund" } });
    expect(r3.status).toBe(422);
  });
  it("Leitung: 200 — Original Feld für Feld unverändert, Ereignis {vorher, nachher, wer, wann, grund}, Ist-Zeit folgt", async () => {
    const vorher = await gespeichert();
    const w = await anfrage("stempel-korrektur", { token: T.leitung,
      rumpf: { personId: "a1", datum: GESTERN, start: "06:02", ende: "15:30", grund: "Übergabe dauerte länger" } });
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    const k = `a1|${GESTERN}`;
    const { korrekturen, ...original } = g.einstempeln[k];
    expect(original).toEqual(vorher.einstempeln[k]);
    expect(korrekturen).toHaveLength(1);
    expect(korrekturen[0]).toMatchObject({ vorher: { start: "06:02", ende: "14:01", bestaetigt: true },
      nachher: { start: "06:02", ende: "15:30" }, wer: { personId: "l1", rolle: "leitung" }, grund: "Übergabe dauerte länger" });
    expect(Date.parse(korrekturen[0].wann)).toBeGreaterThan(Date.now() - 60000);
    expect(g.erfassung[k]).toEqual({ start: "06:02", ende: "15:30", bestaetigt: true, grund: KORRIGIERT_TEXT, korrigiert: true });
    /* Ist-Berechnung (Konto, Lohn, Export lesen dieselbe Erfassung): die korrigierte Zeit. */
    const ist = istZeitFuer(g, g.personen.find((p) => p.id === "a1"), GESTERN, g.dienstarten[0]);
    expect(ist).toMatchObject({ erfasst: true });
    expect(ist.std).toBeCloseTo(9.47, 1);
    /* Alle anderen Stempel unberührt. */
    for (const x of Object.keys(vorher.einstempeln).filter((x) => x !== k)) expect(g.einstempeln[x]).toEqual(vorher.einstempeln[x]);
  });
  it("Planung: zweite Korrektur hängt an (vorher = letzte nachher), erste bleibt", async () => {
    const w = await anfrage("stempel-korrektur", { token: T.planer,
      rumpf: { personId: "a1", datum: GESTERN, start: "06:00", ende: "15:30", grund: "Beginn laut Übergabebuch" } });
    expect(w.status, w.roh).toBe(200);
    const kk = (await gespeichert()).einstempeln[`a1|${GESTERN}`].korrekturen;
    expect(kk).toHaveLength(2);
    expect(kk[0].nachher).toEqual({ start: "06:02", ende: "15:30" });
    expect(kk[1]).toMatchObject({ vorher: { start: "06:02", ende: "15:30", bestaetigt: true }, nachher: { start: "06:00", ende: "15:30" },
      wer: { personId: "p1", rolle: "planer" } });
  });
  it("Korrektur nach der Korrektur ändern oder entfernen über das Speichern ⇒ 403", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.leitung });
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstempeln[`a1|${GESTERN}`].korrekturen[0].grund = "anders";
    expect((await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: b, etag: r.etag } })).status).toBe(403);
    const c = JSON.parse(JSON.stringify(r.bestand));
    c.mandanten[0].einstempeln[`a1|${GESTERN}`].korrekturen = [];
    expect((await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: c, etag: r.etag } })).status).toBe(403);
  });
});

describe("Datenschutz (H8+/WP-43): Korrekturereignisse nur, wer den Stempel sieht", () => {
  it("Beschäftigte: die eigenen Korrekturen ja", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.mitarbeiter });
    expect(r.bestand.mandanten[0].einstempeln[`a1|${GESTERN}`].korrekturen).toHaveLength(2);
  });
  it("Schichtverantwortung: fremder Stempel samt Korrekturen nicht; Ist-Zeit ohne Grund, ohne Namen", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.subplaner });
    const m = r.bestand.mandanten[0];
    expect((m.einstempeln || {})[`a1|${GESTERN}`]).toBeUndefined();
    expect(r.roh).not.toContain("Beginn laut Übergabebuch");
    expect(r.roh).not.toContain("Übergabe dauerte länger");
    const e = (m.erfassung || {})[`a1|${GESTERN}`];
    /* Die Ist-Zeit des Bereichs bekommt sie (H8+) — die korrigierte, ohne Ereignis, Grund oder Namen. */
    expect(e).toMatchObject({ start: "06:00", ende: "15:30", bestaetigt: true });
    expect(JSON.stringify(e)).not.toMatch(/korrekturen|wer|Probe/);
  });
  it("Betriebsrat: weder fremde Stempel noch Korrekturen noch Ist-Zeiten", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.betriebsrat });
    expect((r.bestand.mandanten[0].einstempeln || {})[`a1|${GESTERN}`]).toBeUndefined();
    expect(r.roh).not.toContain("Beginn laut Übergabebuch");
  });
  it("Betreiber: nichts davon", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.betreiber });
    expect(r.roh).not.toContain("Beginn laut Übergabebuch");
    expect(r.roh).not.toContain(`a1|${GESTERN}`);
  });
});

describe("Veraltete Kopie, Löschlauf, Wiederherstellung, Altbestand", () => {
  it("veraltete Kopie (vor Korrektur und vor neuem Stempel geladen) speichert anderes: 200, Stempel und Korrektur bleiben", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.leitung });
    const s = await anfrage("stempeln", { token: T.mitarbeiter, rumpf: { art: "start" } });
    expect(s.status, s.roh).toBe(200);
    const kk = await anfrage("stempel-korrektur", { token: T.leitung,
      rumpf: { personId: "a2", datum: GESTERN, start: "06:02", ende: "14:30", grund: "Nachtrag zur Übergabe" } });
    expect(kk.status, kk.roh).toBe(200);
    const vorher = await gespeichert();
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].personen.find((p) => p.id === "a2").telefon = "0170";
    const w = await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    expect(g.einstempeln).toEqual(vorher.einstempeln);
    expect(g.erfassung[`a2|${GESTERN}`]).toEqual(vorher.erfassung[`a2|${GESTERN}`]);
    expect(g.personen.find((p) => p.id === "a2").telefon).toBe("0170");
  });
  it("Löschlauf der Leitung: abgelaufener Stempel (2023) darf weg, Protokoll; ein junger nicht", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.leitung });
    const b = JSON.parse(JSON.stringify(r.bestand));
    delete b.mandanten[0].einstempeln[`a2|${ALT}`];
    delete b.mandanten[0].erfassung[`a2|${ALT}`];
    const w = await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: b, etag: r.etag, durch: "Löschlauf" } });
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    expect(g.einstempeln[`a2|${ALT}`]).toBeUndefined();
    expect(g.erfassung[`a2|${ALT}`]).toBeUndefined();
    expect(g.einstempeln[`a2|${VORGESTERN}`]).toBeTruthy();
    expect(loeschStichtag({ aufbewahrung: { plandatenMonate: 3 } }, "2026-11-03")).toBe("2024-11-03");   // nie unter 24 Monate
  });
  it("B-N2: Kopie von vor dem Löschen (Stempel und Ist-Zeit von 2023) ⇒ 200 mit Hinweis in der Antwort, nichts wird zurückgeschrieben", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.leitung });
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstempeln[`a2|${ALT}`] = { start: "06:00", ende: "14:00" };
    b.mandanten[0].erfassung[`a2|${ALT}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
    b.mandanten[0].personen.find((p) => p.id === "a2").telefon = "0171";
    const w = await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
    expect(w.status, w.roh).toBe(200);
    expect(w.hinweis).toMatch(/2 Einträge jenseits der Aufbewahrungsfrist/);
    const g = await gespeichert();
    expect(g.einstempeln[`a2|${ALT}`]).toBeUndefined();
    expect(g.erfassung[`a2|${ALT}`]).toBeUndefined();
    expect(g.personen.find((p) => p.id === "a2").telefon).toBe("0171");
    /* Ohne verworfene Einträge keine Meldung. */
    const r2 = await anfrage("bestand", { methode: "GET", token: T.leitung });
    const w2 = await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: r2.bestand, etag: r2.etag } });
    expect(w2.status).toBe(200);
    expect(w2.hinweis).toBeUndefined();
  });
  it("Altbestand (ohne startAm, mit ort/innerhalb/abstand) gilt als Original: ändern 403, Rundreise 200, Korrektur möglich", async () => {
    const r = await anfrage("bestand", { methode: "GET", token: T.leitung });
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.mandanten[0].einstempeln[`a2|${VORGESTERN}`].abstand = 0;
    expect((await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: b, etag: r.etag } })).status).toBe(403);
    expect((await anfrage("bestand", { methode: "PUT", token: T.leitung, rumpf: { bestand: r.bestand, etag: r.etag } })).status).toBe(200);
    const k = await anfrage("stempel-korrektur", { token: T.leitung,
      rumpf: { personId: "a2", datum: VORGESTERN, start: "06:00", ende: "14:15", grund: "Altbestand nachgetragen" } });
    expect(k.status, k.roh).toBe(200);
    const g = await gespeichert();
    expect(g.einstempeln[`a2|${VORGESTERN}`]).toMatchObject({ start: "06:00", ende: "14:00", ort: "Station", innerhalb: true, abstand: 12 });
  });
  it("Altbestand ohne Umbau: stempelSichern ist idempotent und verliert nichts", () => {
    const alt = { id: "m1", einstempeln: { "a|2025-01-01": { start: "06:00", ende: "14:00", ort: "x" } },
      erfassung: { "a|2025-01-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }, "b|2025-01-02": { start: "1", ende: "2" } } };
    const einmal = stempelSichern(alt, alt, { ...alt }, {}).mandant;
    const zweimal = stempelSichern(einmal, einmal, { ...einmal }, {}).mandant;
    expect(einmal).toEqual(alt);
    expect(zweimal).toEqual(alt);
    expect(stempelWiderspruch(alt, alt, {})).toBeNull();
  });
  it("Wiederherstellen aus Sicherung: heutige Stempel und Korrekturen bleiben, ältere Stände kommen nicht zurück", () => {
    const k = { id: "k1", vorher: null, nachher: { start: "06:00", ende: "15:00" }, wer: {}, wann: "2026-11-01T00:00:00Z", grund: "x" };
    const jetzt = { id: "m1", einstempeln: { "a|2026-11-01": { start: "06:00", ende: "14:00", korrekturen: [k] }, "a|2026-11-02": { start: "06:00" } },
      erfassung: { "a|2026-11-01": { start: "06:00", ende: "15:00", bestaetigt: true, grund: KORRIGIERT_TEXT, korrigiert: true } } };
    const sicherung = { id: "m1", einstempeln: { "a|2026-11-01": { start: "06:00", ende: "14:00" }, "a|2026-10-30": { start: "07:00", ende: "15:00" } },
      erfassung: { "a|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }, "a|2026-10-30": { start: "07:00", ende: "15:00", bestaetigt: true, grund: "" } } };
    const { mandant, behalten } = stempelBeiWiederherstellung(jetzt, sicherung);
    expect(mandant.einstempeln["a|2026-11-01"]).toEqual(jetzt.einstempeln["a|2026-11-01"]);
    expect(mandant.einstempeln["a|2026-11-02"]).toEqual({ start: "06:00" });
    expect(mandant.einstempeln["a|2026-10-30"]).toEqual(sicherung.einstempeln["a|2026-10-30"]);
    expect(mandant.erfassung["a|2026-11-01"]).toEqual(jetzt.erfassung["a|2026-11-01"]);
    expect(behalten).toBe(2);
  });
  it("korrekturAnhaengen: begrenzt, verlangt Grund, unverändert bestätigte Zeit ist keine Korrektur", () => {
    const m = { personen: [{ id: "a" }], einstempeln: { "a|2026-11-01": { start: "06:00", ende: "14:00" } },
      erfassung: { "a|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true } } };
    expect(korrekturAnhaengen(m, { personId: "a", datum: "2026-11-01", start: "06:00", ende: "14:00", grund: "gleiche Zeit nochmal" }, {}, new Date(), "k").status).toBe(409);
    expect(korrekturAnhaengen(m, { personId: "a", datum: "2026-11-01", start: "06:00", ende: "15:00", grund: "x".repeat(501) }, {}, new Date(), "k").status).toBe(422);
    const voll = { ...m, einstempeln: { "a|2026-11-01": { start: "06:00", korrekturen: Array.from({ length: KORREKTUREN_MAX }, (_, i) => ({ id: i, grund: "g" })) } } };
    expect(korrekturAnhaengen(voll, { personId: "a", datum: "2026-11-01", start: "06:00", ende: "15:00", grund: "noch eine Korrektur" }, {}, new Date(), "k").status).toBe(409);
  });

  /* B4: Mindestgrund 10 Zeichen; die Obergrenze blockiert nicht mit Mini-Korrekturen,
     sondern ist hoch, begrenzt die Gründe insgesamt, und meldet früh einen Hinweis. */
  it("B4: Grund unter 10 Zeichen ⇒ 422; ab 20 Korrekturen ein Hinweis; 50 Mini-Korrekturen blockieren nicht", () => {
    const m = { personen: [{ id: "a" }], einstempeln: { "a|2026-11-01": { start: "06:00", ende: "14:00" } },
      erfassung: { "a|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true } } };
    const k = (grund, ende = "15:00") => ({ personId: "a", datum: "2026-11-01", start: "06:00", ende, grund });
    expect(korrekturAnhaengen(m, k("zu kurz"), {}, new Date(), "k").status).toBe(422);
    expect(korrekturAnhaengen(m, k("neun Zeic"), {}, new Date(), "k").status).toBe(422);
    expect(korrekturAnhaengen(m, k("zehn Zeich"), {}, new Date(), "k").ereignis).toBeTruthy();
    let stand = m;
    let letzter;
    for (let i = 0; i < 60; i++) {
      letzter = korrekturAnhaengen(stand, k("Korrektur Nummer " + i, i % 2 ? "15:00" : "16:00"), {}, new Date(), "k" + i);
      expect(letzter.status, `Korrektur ${i}`).toBeUndefined();
      stand = letzter.mandant;
      if (i + 1 < KORREKTUR_HINWEIS_AB) expect(letzter.hinweis).toBeNull();
    }
    expect(letzter.hinweis).toMatch(/60-mal korrigiert/);
    expect(stand.einstempeln["a|2026-11-01"].korrekturen).toHaveLength(60);
  });
  it("B4: die Gründe zusammen sind begrenzt (Speicher), mit verständlicher Absage", () => {
    const lang = "y".repeat(KORREKTUR_GRUND_MAX);
    const vor = Array.from({ length: Math.floor(KORREKTUREN_GRUENDE_MAX / KORREKTUR_GRUND_MAX) }, (_, i) => ({ id: i, grund: lang }));
    const m = { personen: [{ id: "a" }], einstempeln: { "a|2026-11-01": { start: "06:00", korrekturen: vor } }, erfassung: {} };
    const r = korrekturAnhaengen(m, { personId: "a", datum: "2026-11-01", start: "06:00", ende: "15:00", grund: "ein weiterer Grund" }, {}, new Date(), "k");
    expect(r.status).toBe(409);
    expect(r.grund).toMatch(/Betriebsleitung klären/);
  });
});

describe("B1 (Datenschutzlauf) und B2 (eine Frist-Rechnung)", () => {
  const HEUTE_ISO = "2026-11-03";
  const mandantMit = (einstempeln, erfassung = {}, extra = {}) => ({ id: "m1", einstempeln, erfassung, ...extra });
  it("B1: Kopie von vor dem Datenschutzlauf mit gelöschtem Stempel (vor dem Stichtag) ⇒ ignoriert, nicht „erfunden“ (403); nicht wieder gespeichert", () => {
    const gespeichert = mandantMit({ "a1|2026-10-01": { start: "06:00", ende: "14:00" } });
    const kopie = mandantMit({ "a1|2026-10-01": { start: "06:00", ende: "14:00" }, "a1|2023-01-05": { start: "06:00", ende: "14:00" } },
      { "a1|2023-01-05": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } });
    for (const loeschlauf of [true, false]) {
      expect(stempelWiderspruch(gespeichert, kopie, { heute: HEUTE_ISO, loeschlauf })).toBeNull();
    }
    const gesichert = stempelSichern(gespeichert, kopie, { ...kopie }, { heute: HEUTE_ISO, loeschlauf: false }).mandant;
    expect(Object.keys(gesichert.einstempeln)).toEqual(["a1|2026-10-01"]);
    expect(Object.keys(gesichert.erfassung)).toEqual([]);
  });
  it("B1-Gegenprobe: ein junger, nie gespeicherter Stempel bleibt „erfunden“ (403)", () => {
    const gespeichert = mandantMit({});
    const kopie = mandantMit({ "a1|2026-10-30": { start: "06:00" } });
    expect(stempelWiderspruch(gespeichert, kopie, { heute: HEUTE_ISO })).toMatchObject({ schluessel: "a1|2026-10-30" });
  });
  it("B1-Gegenprobe: ein bestehender Stempel jenseits der Frist lässt sich weiterhin nicht ändern", () => {
    const gespeichert = mandantMit({ "a1|2023-01-05": { start: "06:00", ende: "14:00" } });
    const kopie = mandantMit({ "a1|2023-01-05": { start: "05:00", ende: "14:00" } });
    expect(stempelWiderspruch(gespeichert, kopie, { heute: HEUTE_ISO, loeschlauf: true })).toMatchObject({ schluessel: "a1|2023-01-05" });
  });
  it("B2: loeschStichtag rechnet wie der Datenschutzlauf (aufbewahrung.mjs): Frist des Betriebs, nie unter 24 Monaten, ungültig ⇒ keiner", async () => {
    const { stichtage } = await import("../server/lib/aufbewahrung.mjs");
    for (const monate of [1, 24, 36, 120]) {
      const m = { aufbewahrung: { plandatenMonate: monate } };
      expect(loeschStichtag(m, HEUTE_ISO), String(monate)).toBe(stichtage(m, HEUTE_ISO).plan);
    }
    expect(loeschStichtag({ aufbewahrung: { plandatenMonate: 3 } }, HEUTE_ISO)).toBe("2024-11-03");
    expect(loeschStichtag({}, HEUTE_ISO)).toBe("2024-11-03");
    expect(loeschStichtag({ aufbewahrung: { plandatenMonate: 1.5 } }, HEUTE_ISO)).toBeNull();
    expect(loeschStichtag({ aufbewahrung: { plandatenMonate: "viel" } }, HEUTE_ISO)).toBeNull();
  });
});

/* WP-20 / Review A1: Der Datenschutzlauf nimmt die Standort-Ergebnisse alter Stempel heraus
   (gruendeMonate). Eine davor geladene Kopie trägt sie noch — das ist kein Widerspruch zum Beleg
   (Zeiten und Kennzeichen sind unverändert), und sie kommen nicht zurück. */
describe("A1: Standort-Ergebnisse nach dem Datenschutzlauf — alte Kopie wird nicht abgewiesen, nichts kommt zurück", () => {
  const STANDORT = ["geoStart", "geoEnde", "ortStart", "ortEnde", "innerhalbStart", "innerhalbEnde", "geprueftStart", "geprueftEnde"];
  const mitStandort = () => ({ start: "06:00", startAm: "x", ende: "14:00", endeAm: "y",
    geoStart: { urteil: "innerhalb" }, geoEnde: { urteil: "innerhalb" }, ortStart: "Station", ortEnde: "Station",
    innerhalbStart: true, innerhalbEnde: true, geprueftStart: true, geprueftEnde: true });
  const HEUTE_ISO = "2026-11-03";

  it("Einheit: gespeichert ohne Standortfelder, Kopie mit ⇒ kein Widerspruch (vor dem Stichtag); sonst weiter Widerspruch", () => {
    const rest = (e) => { const r = { ...e }; for (const f of STANDORT) delete r[f]; return r; };
    const alt = "a1|2026-06-01", jung = "a1|2026-10-20";
    const gespeichert = { id: "m1", einstempeln: { [alt]: rest(mitStandort()), [jung]: rest(mitStandort()) } };
    const kopieAlt = { id: "m1", einstempeln: { [alt]: mitStandort() } };
    expect(stempelWiderspruch(gespeichert, kopieAlt, { heute: HEUTE_ISO })).toBeNull();
    expect(stempelWiderspruch(gespeichert, kopieAlt, { heute: HEUTE_ISO, vollSicht: true, loeschlauf: true })).toBeNull();
    /* Gegenprobe: ein junger Stempel (nach dem Standort-Stichtag) kann sein Ergebnis nicht erfinden. */
    const kopieJung = { id: "m1", einstempeln: { [jung]: mitStandort() } };
    expect(stempelWiderspruch(gespeichert, kopieJung, { heute: HEUTE_ISO })).toMatchObject({ schluessel: jung });
    /* Gegenprobe: ein anderes Feld bleibt unveränderlich, ein erfundenes ebenso. */
    const fremd = { id: "m1", einstempeln: { [alt]: { ...mitStandort(), start: "05:00" } } };
    expect(stempelWiderspruch(gespeichert, fremd, { heute: HEUTE_ISO })).toMatchObject({ schluessel: alt });
    const neu = { id: "m1", einstempeln: { [alt]: { ...mitStandort(), erfunden: 1 } } };
    expect(stempelWiderspruch(gespeichert, neu, { heute: HEUTE_ISO })).toMatchObject({ schluessel: alt });
  });

  it("Einheit: stempelSichern schreibt gelöschte Standortfelder nie zurück (sicherer und unsicherer Monat)", () => {
    const k = "a1|2026-06-01";
    const gesp = { id: "m1", einstempeln: { [k]: { start: "06:00", ende: "14:00" } }, erfassung: {} };
    const kopie = { id: "m1", einstempeln: { [k]: mitStandort() }, erfassung: {} };
    for (const unveraendert of [undefined, new Set()]) {
      const r = stempelSichern(gesp, kopie, { ...kopie }, { heute: HEUTE_ISO, ...(unveraendert ? { unveraendert } : {}) }).mandant;
      for (const f of STANDORT) expect(r.einstempeln[k], `${f} / ${unveraendert ? "unsicher" : "sicher"}`).not.toHaveProperty(f);
      expect(r.einstempeln[k]).toMatchObject({ start: "06:00", ende: "14:00" });
    }
  });

  for (const rolle of ["leitung", "planer"]) {
    it(`Handler (${rolle}): Stempel von vor 150 Tagen, Datenschutzlauf, dann PUT der alten Kopie mit nur einer Namensänderung ⇒ 200, Standortfelder bleiben gelöscht`, async () => {
      const k = `a1|${tag(-150)}`;
      const D = await import("../server/lib/datenschutzlauf.mjs");
      const setzen = async () => {
        const jetzt = await B.bestandLesen(laden(), RAUM);
        const mm = JSON.parse(JSON.stringify(jetzt.bestand));
        mm.mandanten[0].einstempeln[k] = mitStandort();
        mm.mandanten[0].erfassung[k] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
        await B.bestandSchreiben(laden(), RAUM, mm, { durch: "Pruefung" });
      };
      /* Ein erster Lauf setzt den Vermerk „zuletzt geräumt“ des Betriebs auf heute; der zweite ändert den Kern
         nicht mehr — sonst wäre jede Stammdatenänderung einer alten Kopie ein gewöhnlicher Konflikt (409). */
      await setzen();
      await D.datenschutzLauf(laden(), { spur: false, modus: "an" });
      await setzen();

      const r = await anfrage("bestand", { methode: "GET", token: T[rolle] });
      expect(r.bestand.mandanten[0].einstempeln[k].geoStart, "Kopie trägt das Ergebnis").toBeTruthy();

      const v = await D.datenschutzLauf(laden(), { spur: false, modus: "an" });
      expect(v.fehler, JSON.stringify(v.fehler)).toEqual([]);
      const nachLauf = (await gespeichert()).einstempeln[k];
      expect(nachLauf, "Lauf hat den Stempel erhalten").toMatchObject({ start: "06:00", ende: "14:00" });
      for (const f of STANDORT) expect(nachLauf, `${f} nach dem Lauf`).not.toHaveProperty(f);

      const b = JSON.parse(JSON.stringify(r.bestand));
      b.mandanten[0].personen.find((p) => p.id === "a1").vorname = `Neu${rolle}`;
      const w = await anfrage("bestand", { methode: "PUT", token: T[rolle], rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
      expect([w.status, w.code], w.roh).toEqual([200, undefined]);
      const g = await gespeichert();
      expect(g.personen.find((p) => p.id === "a1").vorname).toBe(`Neu${rolle}`);
      for (const f of STANDORT) expect(g.einstempeln[k], `${f} nach dem Speichern`).not.toHaveProperty(f);
      expect(g.einstempeln[k]).toMatchObject({ start: "06:00", ende: "14:00" });
    });
  }
});
