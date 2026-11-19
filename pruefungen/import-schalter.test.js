/* ==========================================================================
   Personalimport — serverseitiger Schalter CENTRIC_IMPORT_AKTIV (Vorgabe aus, fail-closed)

   Der Schalter der Oberfläche (`IMPORT_DATEI_AKTIV`) ist nur Anzeige. Ohne
   diesen Serverschalter waren /api/import/* für Leitung und Planung auf jeder
   Bereitstellung erreichbar (Upload → Parser-Kindprozess, Übernahme schreibt
   den Bestand). Geprüft wird:
     1. Nur genau "true" schaltet ein (TRUE, 1, "true ", yes, leer, false → aus).
     2. Aus: jeder der fünf Wege antwortet 404 für jede Rolle und ohne Sitzung —
        kein Rumpf gelesen, kein Kindprozess gestartet, kein Vorgang, Bestand
        unverändert. Auch ein offener Vorgang aus der Zeit „an" wird nicht übernommen.
     3. An: unverändertes Verhalten (Leitung 201 mit Kindprozess, SV 403).
     4. Echter Server, Schalter nicht gesetzt: 404 schon vor dem Einlesen des
        Rumpfs (auch 11 MB → 404, nicht 413; ohne Sitzung 404, nicht 401).

   Nur synthetische Daten. Aufruf:
     npx vitest run pruefungen/import-schalter.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverStarten } from "./hilfen/port.mjs";

/* Jeder Start eines Parser-Kindprozesses läuft über spawn (server/lib/import/parser-prozess.mjs). */
vi.mock("node:child_process", async (original) => {
  const echt = await original();
  return { ...echt, spawn: vi.fn(echt.spawn) };
});
const { spawn } = await import("node:child_process");

const WIRT = "127.0.0.1:3000";
const WEGE = ["upload", "analyse", "vorschau", "uebernahme", "verwerfen"];
const AUS_WERTE = [undefined, "", "TRUE", "True", "1", "true ", " true", "yes", "on", "false", "aus"];
let wurzel, laden, imp, B, V, sitzungAnlegen, importAn;
let raumNr = 0;
let nr = 0;

const schalten = (wert) => {
  if (wert === undefined) delete process.env.CENTRIC_IMPORT_AKTIV;
  else process.env.CENTRIC_IMPORT_AKTIV = wert;
};
const kopf = (token, extra = {}) => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.41.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
};
const csv = (zeilen) => Buffer.from(zeilen.map((z) => z.join(";")).join("\n"), "utf8");
const DATEI = () => csv([["Personalnummer", "Nachname", "Vorname", "E-Mail", "Einheit", "Eintritt", "Wochenstunden"],
  ["3001", "Neumann", "Lena", "", "Wohnbereich 1", "01.02.2026", "30"]]);

function anfrage(token, weg, rumpf) {
  const upload = weg === "upload";
  return new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST",
    headers: kopf(token, { "content-type": upload ? "application/octet-stream" : "application/json" }),
    body: upload ? DATEI() : JSON.stringify(rumpf || {}) });
}
async function senden(token, weg, rumpf) {
  const req = anfrage(token, weg, rumpf);
  const a = await imp(req, {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, rumpfGelesen: req.bodyUsed, ...d };
}

const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
async function neuerRaum() {
  const raum = `impschalter-${++raumNr}`;
  const m1 = { id: "m1", name: "Haus m1", status: "aktiv", einheiten: [{ id: "m1-e1", name: "Wohnbereich 1", versatz: 0 }], standorte: [],
    zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] }, dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("l1", "leitung", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "m1-e1"),
      person("a1", "mitarbeiter", "m1-e1"), person("br1", "betriebsrat", "ALLE")],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] };
  await B.bestandSchreiben(laden(), raum, { version: 9, mandanten: [m1] }, { durch: "Prüfung" });
  const t = {};
  const anlegen = async (k, rolle, p, einheit = null) => {
    t[k] = (await sitzungAnlegen({ bestand: raum, name: `Test ${k}`, rolle, person: p, betrieb: 0, mandantId: "m1", einheit }, 2 * 3600 * 1000)).token;
  };
  await anlegen("LT", "leitung", "l1");
  await anlegen("PL", "planer", "p1");
  await anlegen("SV", "subplaner", "s1", "m1-e1");
  await anlegen("MA", "mitarbeiter", "a1");
  await anlegen("BR", "betriebsrat", "br1");
  return { raum, t };
}
const lesen = async (raum) => (await B.bestandLesen(laden(), raum));

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-impschalter-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/import/vorgaenge.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  ({ importAn } = await import("../server/lib/schalter.mjs"));
});
afterAll(async () => {
  delete process.env.CENTRIC_IMPORT_AKTIV;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});
afterEach(() => { V._pruefhaken.vorParser = null; V._zuruecksetzen(); vi.mocked(spawn).mockClear(); delete process.env.CENTRIC_IMPORT_AKTIV; });

describe("CENTRIC_IMPORT_AKTIV: nur genau \"true\" schaltet ein", () => {
  it("true → an", () => { schalten("true"); expect(importAn()).toBe(true); });
  for (const w of AUS_WERTE) it(`${JSON.stringify(w)} → aus`, () => { schalten(w); expect(importAn()).toBe(false); });
  it("config.aktiv ist derselbe Schalter (server.mjs fragt ihn vor dem Rumpf)", async () => {
    const { config } = await import("../server/funktionen/import.mjs");
    expect(config.aktiv).toBe(importAn);
    expect(config.path.sort()).toEqual(WEGE.map((w) => `/api/import/${w}`).sort());
  });
});

describe("Schalter aus: jeder Weg 404, nichts gelesen, gestartet oder geschrieben", { timeout: 120000 }, () => {
  for (const w of AUS_WERTE) {
    it(`Wert ${JSON.stringify(w)}: alle Rollen und ohne Sitzung`, async () => {
      const { raum, t } = await neuerRaum();
      const vorher = await lesen(raum);
      const vorParser = vi.fn();
      V._pruefhaken.vorParser = vorParser;
      schalten(w);
      for (const k of [null, "LT", "PL", "SV", "MA", "BR"]) {
        for (const weg of WEGE) {
          const r = await senden(k ? t[k] : null, weg, { vorgang: "x" });
          expect(r.status, `${k} ${weg}`).toBe(404);
          expect(r.fehler).toBe("Gibt es nicht.");
          expect(r.code).toBeUndefined();
          expect(r.rumpfGelesen, `${k} ${weg}: Rumpf gelesen`).toBe(false);
        }
      }
      expect(vi.mocked(spawn)).not.toHaveBeenCalled();
      expect(vorParser).not.toHaveBeenCalled();
      expect(V._anzahl()).toBe(0);
      const nachher = await lesen(raum);
      expect(nachher.stand).toBe(vorher.stand);
      expect(nachher.bestand).toEqual(vorher.bestand);
    });
  }

  it("auch die falsche Methode bekommt 404 (keine Auskunft, dass es den Weg gibt)", async () => {
    const a = await imp(new Request(`http://${WIRT}/api/import/upload`, { method: "GET", headers: kopf(null) }), {});
    expect(a.status).toBe(404);
  });

  it("ein Vorgang aus der Zeit „an\" wird nach dem Ausschalten nicht übernommen (Bestand unverändert)", async () => {
    const { raum, t } = await neuerRaum();
    schalten("true");
    const up = await senden(t.LT, "upload");
    expect(up.status, JSON.stringify(up)).toBe(201);
    expect((await senden(t.LT, "analyse", { vorgang: up.vorgang })).status).toBe(200);
    const vs = await senden(t.LT, "vorschau", { vorgang: up.vorgang });
    expect(vs.status).toBe(200);
    expect(typeof vs.bestaetigung).toBe("string");
    const vorher = await lesen(raum);
    schalten("TRUE");
    const ue = await senden(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status).toBe(404);
    expect(ue.rumpfGelesen).toBe(false);
    const nachher = await lesen(raum);
    expect(nachher.stand).toBe(vorher.stand);
    expect(nachher.bestand.mandanten[0].personen.length).toBe(5);
  });
});

describe("Schalter an: Verhalten unverändert", { timeout: 120000 }, () => {
  it("Leitung und Planung laden hoch (201, Parser-Kindprozess läuft); SV, MA, BR 403; ohne Sitzung 401", async () => {
    const { t } = await neuerRaum();
    schalten("true");
    expect((await senden(t.LT, "upload")).status).toBe(201);
    expect((await senden(t.PL, "upload")).status).toBe(201);
    expect(vi.mocked(spawn)).toHaveBeenCalled();
    for (const k of ["SV", "MA", "BR"]) expect((await senden(t[k], "upload")).status).toBe(403);
    expect((await senden(null, "upload")).status).toBe(401);
  });
  it("Übernahme schreibt den Bestand (eine neue Person)", async () => {
    const { raum, t } = await neuerRaum();
    schalten("true");
    const up = await senden(t.LT, "upload");
    await senden(t.LT, "analyse", { vorgang: up.vorgang });
    const vs = await senden(t.LT, "vorschau", { vorgang: up.vorgang });
    const ue = await senden(t.LT, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
    expect(ue.status, JSON.stringify(ue)).toBe(200);
    expect(ue.zaehler.neu).toBe(1);
    expect((await lesen(raum)).bestand.mandanten[0].personen.length).toBe(6);
  });
});

describe("Echter Server, Schalter nicht gesetzt: 404 vor dem Einlesen des Rumpfs", { timeout: 120000 }, () => {
  let kind, basis, statik, daten;
  beforeAll(async () => {
    statik = await mkdtemp(path.join(tmpdir(), "centric-impschalter-statik-"));
    daten = await mkdtemp(path.join(tmpdir(), "centric-impschalter-daten-"));
    await mkdir(path.join(statik, "assets"));
    await writeFile(path.join(statik, "index.html"), "<!doctype html><title>Probe</title>");
    ({ kind, basis } = await serverStarten({
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "probe-geheim",
        NODE_ENV: "production", CENTRIC_IMPORT_AKTIV: undefined },
    }));
  }, 60000);
  afterAll(async () => {
    if (kind && kind.exitCode === null) kind.kill("SIGKILL");
    await rm(statik, { recursive: true, force: true });
    await rm(daten, { recursive: true, force: true });
  });
  const post = async (weg, bytes, typ) => {
    const a = await fetch(`${basis}/api/import/${weg}`, { method: "POST", headers: { "content-type": typ, origin: basis }, body: Buffer.alloc(bytes, 0x20) });
    const d = await a.json().catch(() => ({}));
    return { status: a.status, d };
  };
  it("upload ohne Sitzung: 404 statt 401; 11 MB: 404 statt 413 (Grenze und Rumpf werden gar nicht erst geprüft)", async () => {
    const klein = await post("upload", 1024, "application/octet-stream");
    expect(klein.status).toBe(404);
    expect(klein.d).toEqual({ fehler: "Gibt es nicht." });
    expect((await post("upload", 11 * 1024 * 1024, "application/octet-stream")).status).toBe(404);
  });
  for (const weg of ["analyse", "vorschau", "uebernahme", "verwerfen"])
    it(`${weg}: 404 (auch 7 MB)`, async () => {
      expect((await post(weg, 100, "application/json")).status).toBe(404);
      expect((await post(weg, 7 * 1024 * 1024, "application/json")).status).toBe(404);
    });
  it("andere Wege bleiben unberührt (/api/bestand ohne Sitzung 401)", async () => {
    const a = await fetch(`${basis}/api/bestand`, { headers: { origin: basis } });
    expect(a.status).toBe(401);
  });
});
