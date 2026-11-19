/* ==========================================================================
   SI-P5 — Negativ-Sonden für die festgeschriebenen Matrix- und Sondenlücken
   (docs/acc45/SICHERHEIT-INTERN-2026-11.md, Befund P5)

   Jede Sonde schreibt den Ist-Zustand fest. Sie verbessert nichts: Ändert sich
   die Antwort eines dieser Wege (Status, Wortlaut, Wirkung), schlägt der Test
   an, und die Änderung braucht eine bewusste Entscheidung samt Matrix.

   Betreiberwege (Betreiber-Sitzung nötig):
     /api/zugaenge-uebersicht (GET)   Leitung, Planung, Beschäftigte → 403
     /lage                            Leitung, Beschäftigte → 403
   Leitungswege:
     /api/sicherung (POST), /api/sicherungen (GET)       Planung, Beschäftigte → 403
     /api/sicherungsschluessel (GET, POST, DELETE)       Planung, Beschäftigte → 403
   Eigener Stempel:
     /api/korrektur-antrag            fremder Stempel → 404, nichts ändert sich
   Öffentliche Wege mit Schalter (Vorgabe aus):
     /api/registrierung, /api/registrierung/verifizieren, /api/registrierung/passwort
     /starten, /starten/neu
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "si-p5";
let wurzel, laden, daten, lage, registrierung, starten, B, sitzungAnlegen;
const alt = {};
const tokens = {};
let nr = 0;

const anfrage = async (handler, pfad, { methode = "GET", rumpf, token, herkunft = true } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, "x-forwarded-for": `10.55.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  kopf.origin = herkunft ? `http://${WIRT}` : "https://fremd.example";
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};

const sitzung = async (rolle, person) =>
  (await sitzungAnlegen({ bestand: RAUM, name: `${rolle} ${person}`, rolle, person, betrieb: 0, mandantId: "m-a" }, 600000)).token;

const tagGestern = () => {
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
};

beforeAll(async () => {
  for (const k of ["CENTRIC_DATEN", "CENTRIC_ABLAGE", "CENTRIC_PFEFFER", "CENTRIC_PUBLIC_REGISTRATION", "CENTRIC_SELBSTSTART"]) alt[k] = process.env[k];
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-si-p5-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.CENTRIC_PUBLIC_REGISTRATION;
  delete process.env.CENTRIC_SELBSTSTART;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  lage = (await import("../server/funktionen/lage.mjs")).default;
  registrierung = (await import("../server/funktionen/registrierung.mjs")).default;
  starten = (await import("../server/funktionen/starten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  const pers = (id, rolle) => ({ id, vorname: id, nachname: "P", rolle, bereich: "ALLE",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const tag = tagGestern();
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m-a", name: "A", einheiten: [{ id: "e1" }],
    personen: [pers("l1", "leitung"), pers("pl1", "planer"), pers("ma1", "mitarbeiter"), pers("ma2", "mitarbeiter")],
    einstempeln: { [`ma2|${tag}`]: { start: "06:00", startAm: `${tag}T05:00:00.000Z`, ende: "14:00", endeAm: `${tag}T13:00:00.000Z` } },
    nachrichten: [], notrufe: [], anfragen: [] }] }, { durch: "Pruefung" });
  tokens.leitung = await sitzung("leitung", "l1");
  tokens.planer = await sitzung("planer", "pl1");
  tokens.mitarbeiter = await sitzung("mitarbeiter", "ma1");
  tokens.betreiber = (await sitzungAnlegen({ bestand: RAUM, name: "Betreiber", rolle: "betreiber", person: null, betrieb: 0 }, 600000)).token;
}, 120000);

afterAll(async () => {
  for (const [k, v] of Object.entries(alt)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rm(wurzel, { recursive: true, force: true });
});

describe("SI-P5 Betreiberwege: Rollen des Betriebs bekommen 403", () => {
  it("/api/zugaenge-uebersicht (GET): Leitung, Planung, Beschäftigte → 403 mit festem Wortlaut; ohne Sitzung 401; Betreiber nicht 403", async () => {
    for (const rolle of ["leitung", "planer", "mitarbeiter"]) {
      const r = await anfrage(daten, `/api/zugaenge-uebersicht?bestand=${RAUM}`, { token: tokens[rolle] });
      expect(r.status, rolle).toBe(403);
      expect(r.fehler, rolle).toBe("Nur für den Betreiber.");
      expect(r.zugaenge, rolle).toBeUndefined();
    }
    expect((await anfrage(daten, `/api/zugaenge-uebersicht?bestand=${RAUM}`)).status).toBe(401);
    expect((await anfrage(daten, `/api/zugaenge-uebersicht?bestand=${RAUM}`, { token: tokens.betreiber })).status).not.toBe(403);
  });

  it("/lage: Leitung und Beschäftigte → 403 mit festem Wortlaut; ohne Sitzung 401", async () => {
    for (const rolle of ["leitung", "mitarbeiter"]) {
      const r = await anfrage(lage, "/lage?tage=7", { token: tokens[rolle] });
      expect(r.status, rolle).toBe(403);
      expect(r.fehler, rolle).toBe("Nur für den Betreiber.");
    }
    expect((await anfrage(lage, "/lage?tage=7")).status).toBe(401);
  });
});

describe("SI-P5 Leitungswege: Planung und Beschäftigte bekommen 403", () => {
  it("/api/sicherung (POST) und /api/sicherungen (GET): Planung, Beschäftigte → 403; Leitung nicht; nichts wird abgelegt", async () => {
    for (const rolle of ["planer", "mitarbeiter"]) {
      const s = await anfrage(daten, "/api/sicherung", { methode: "POST", token: tokens[rolle], rumpf: {} });
      expect(s.status, `sicherung ${rolle}`).toBe(403);
      expect(s.fehler).toBe("Sicherungen legt die Leitung an.");
      const l = await anfrage(daten, "/api/sicherungen", { token: tokens[rolle] });
      expect(l.status, `sicherungen ${rolle}`).toBe(403);
      expect(l.fehler).toBe("Sicherungen sieht die Leitung.");
      expect(l.sicherungen).toBeUndefined();
    }
    const { blobs } = await laden().list({ prefix: `sicherung:${RAUM}:` });
    expect(blobs.length).toBe(0);
    const leitung = await anfrage(daten, "/api/sicherungen", { token: tokens.leitung });
    expect(leitung.status).toBe(200);
    expect(leitung.sicherungen).toEqual([]);
  });

  it("/api/sicherungsschluessel GET, POST, DELETE: Planung, Beschäftigte → 403; Betreiber ebenso; kein Schlüssel entsteht", async () => {
    for (const rolle of ["planer", "mitarbeiter", "betreiber"]) {
      for (const [methode, rumpf, text] of [
        ["GET", undefined, "Nur die Organisationsleitung."],
        ["DELETE", { kennung: "0123abcd" }, "Nur die Organisationsleitung."],
        ["POST", { tage: 7 }, "Nur die Organisationsleitung darf Sicherungsschlüssel anlegen."]]) {
        const r = await anfrage(daten, "/api/sicherungsschluessel", { methode, token: tokens[rolle], rumpf });
        expect(r.status, `${methode} ${rolle}`).toBe(403);
        expect(r.fehler, `${methode} ${rolle}`).toBe(text);
        expect(r.schluessel, `${methode} ${rolle}`).toBeUndefined();
      }
    }
    for (const methode of ["GET", "DELETE"]) {
      expect((await anfrage(daten, "/api/sicherungsschluessel", { methode, rumpf: { kennung: "0123abcd" } })).status, methode).toBe(401);
    }
  });
});

describe("SI-P5 korrektur-antrag: fremder Stempel", () => {
  it("ma1 beantragt für den Tag, an dem nur ma2 gestempelt hat (mit personId von ma2) → 404; der fremde Stempel bleibt unberührt", async () => {
    const tag = tagGestern();
    const vorher = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0].einstempeln;
    const r = await anfrage(daten, "/api/korrektur-antrag", { methode: "POST", token: tokens.mitarbeiter,
      rumpf: { datum: tag, start: "05:50", ende: "14:10", grund: "Bahn hatte Verspätung", personId: "ma2" } });
    expect(r.status).toBe(404);
    expect(r.fehler).toMatch(/keinen Stempel von dir/);
    const nachher = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0].einstempeln;
    expect(nachher).toEqual(vorher);
    expect(nachher[`ma2|${tag}`].antraege).toBeUndefined();
    expect(nachher[`ma1|${tag}`]).toBeUndefined();
  });
});

describe("SI-P5 öffentliche Wege mit Schalter (Vorgabe aus)", () => {
  const REG = ["/api/registrierung", "/api/registrierung/verifizieren", "/api/registrierung/passwort"];
  it("Registrierung aus: jeder der drei Wege antwortet 404 nicht-verfuegbar, bei POST und GET, auch mit fremder Herkunft; Schalter nur bei genau true", async () => {
    for (const weg of REG) {
      for (const [methode, herkunft] of [["POST", true], ["GET", true], ["POST", false]]) {
        const r = await anfrage(registrierung, weg, { methode, herkunft, rumpf: { email: "x@example.org" } });
        expect(r.status, `${methode} ${weg} ${herkunft}`).toBe(404);
        expect(r.fehler).toBe("nicht-verfuegbar");
      }
    }
    for (const wert of ["1", "TRUE", "yes", "", "false"]) {
      process.env.CENTRIC_PUBLIC_REGISTRATION = wert;
      try { expect((await anfrage(registrierung, REG[0], { methode: "POST", rumpf: {} })).status, wert).toBe(404); }
      finally { delete process.env.CENTRIC_PUBLIC_REGISTRATION; }
    }
  });

  it("Registrierung an (genau true): Weg bleibt öffentlich, aber nur POST (GET 405), fremde Herkunft 403, unbekannter Unterweg 404", async () => {
    process.env.CENTRIC_PUBLIC_REGISTRATION = "true";
    try {
      expect((await anfrage(registrierung, REG[0], { methode: "GET" })).status).toBe(405);
      expect((await anfrage(registrierung, REG[0], { methode: "POST", herkunft: false, rumpf: {} })).status).toBe(403);
      expect((await anfrage(registrierung, "/api/registrierung/unbekannt", { methode: "POST", rumpf: {} })).status).toBe(404);
    } finally { delete process.env.CENTRIC_PUBLIC_REGISTRATION; }
  });

  it("Selbststart aus: POST /starten und /starten/neu → 403 NICHT_FREIGESCHALTET, kein Raum entsteht; GET 405, fremde Herkunft 403, Unterweg 404", async () => {
    const vorher = (await laden().list({})).blobs.length;
    for (const weg of ["/starten", "/starten/neu"]) {
      const r = await anfrage(starten, weg, { methode: "POST", rumpf: { name: "Wachdienst Probe", email: "p@example.org" } });
      expect(r.status, weg).toBe(403);
      expect(r.ok).toBe(false);
      expect(r.fehler).toBe("Der Selbststart ist derzeit nicht freigeschaltet. Zugang nur mit Zugangscode.");
      expect((await anfrage(starten, weg, { methode: "GET" })).status, weg).toBe(405);
      expect((await anfrage(starten, weg, { methode: "POST", herkunft: false, rumpf: {} })).status, weg).toBe(403);
    }
    expect((await anfrage(starten, "/starten/unbekannt", { methode: "POST", rumpf: {} })).status).toBe(404);
    for (const wert of ["1", "TRUE", "yes", "false"]) {
      process.env.CENTRIC_SELBSTSTART = wert;
      try { expect((await anfrage(starten, "/starten", { methode: "POST", rumpf: { name: "Wachdienst Probe" } })).status, wert).toBe(403); }
      finally { delete process.env.CENTRIC_SELBSTSTART; }
    }
    expect((await laden().list({})).blobs.length).toBe(vorher);
  });
});
