/* ==========================================================================
   BREMSE VON /einrichten — gelungene Anfragen zählen nicht als Versuche

   Anlass (CI-Stabilisierung): pruefungen/zugaenge-anlegen.test.js scheiterte
   im vierten Skriptlauf mit „zu viele Anfragen … ungewöhnlich hohes
   Aufkommen". Ursache: /einrichten ruft entlasten("einrichten", k) ohne die
   Vermerke dieser Anfrage (b). Der Zähler der eigenen Herkunft wurde
   zurückgesetzt, das Gesamtaufkommen (WEITERE.einrichten.gesamt, 20 je zehn
   Minuten, alle Herkünfte) aber nicht. Wer mit gültigem Schlüssel 20-mal in
   zehn Minuten fragte (Skript, Konsole), sperrte /einrichten für alle bis
   zum Ende des Fensters. Bei der Anmeldung ist das seit WP-47 behoben
   (entlasten(art, k, b)); hier fehlte der Parameter.

   Geprüft wird mit den ECHTEN Grenzen (nichts wird angehoben):
   1. Gültige Anfragen verbrauchen das Gesamtbudget nicht.
   2. Falsche Schlüssel bleiben gebremst (sechster Versuch einer Herkunft).
   3. Falsche Schlüssel zählen weiter ins Gesamtaufkommen: aus vielen
      Herkünften ist ab der 21. Schluss — die verteilte Probe bleibt gedeckelt.
   4. Ein gültiger Zugriff stellt Fehlversuche anderer Herkünfte nicht frei.

   Aufruf: npx vitest run pruefungen/einrichten-bremse.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60000 });

const WIRT = "127.0.0.1:3000";
const ADMIN = "einrichten-bremse-ursprung-0123456789";
const T0 = Date.UTC(2026, 10, 2, 12, 0, 15);         // 15 s nach Fensterbeginn (600-s-Fenster)
const STUNDE = 3600 * 1000;
let wurzel, einrichten, schutz;
let phase = 0;

/** Jede Prüfung bekommt frische Fenster: die Uhr springt um eine Stunde (Sperren laufen ab). */
const neuePhase = () => { phase += 1; vi.setSystemTime(T0 + phase * STUNDE); };

const anfrage = async (herkunft, { schluessel = ADMIN, pfad = "/einrichten/verwalter" } = {}) => {
  const h = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": herkunft };
  if (schluessel) h.authorization = `Bearer ${schluessel}`;
  const a = await einrichten(new Request(`http://${WIRT}${pfad}`, { method: "GET", headers: h }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, ...d };
};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-einrichten-bremse-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ADMIN = ADMIN;
  delete process.env.REDIS_REST_URL;
  delete process.env.CENTRIC_ZWEIFAKTOR_PFLICHT;
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  schutz = await import("../server/lib/schutz.mjs");
  einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
});
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

describe("Bremse von /einrichten mit den echten Grenzen", () => {
  it("die Grenzen sind die erwarteten (sonst prüft dieser Test etwas anderes)", () => {
    expect(schutz.GRENZEN.einrichten.versuche).toBe(5);
    expect(schutz.WEITERE.einrichten.gesamt).toEqual({ versuche: 20, fenster: 600 });
  });

  it("gültige Anfragen verbrauchen das Gesamtbudget nicht: 40 gelungene in zehn Minuten, alle 200", async () => {
    neuePhase();
    const stati = [];
    for (let i = 0; i < 40; i++) stati.push((await anfrage("10.50.0.1")).status);
    expect(stati.filter((s) => s !== 200), `Stati: ${stati.join(",")}`).toEqual([]);
    // Auch eine andere Herkunft mit gültigem Schlüssel kommt durch: das Gesamtbudget ist nicht verbraucht.
    expect((await anfrage("10.50.0.2")).status).toBe(200);
  });

  it("falsche Schlüssel bleiben gebremst: der sechste Versuch einer Herkunft wird abgewiesen", async () => {
    neuePhase();
    const stati = [];
    for (let i = 0; i < 6; i++) stati.push((await anfrage("10.51.0.1", { schluessel: `falsch-${i}` })).status);
    expect(stati.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(stati[5]).toBe(429);
    // Gesperrt bleibt sie auch mit dem richtigen Schlüssel (Sperre überdauert das Zählfenster).
    expect((await anfrage("10.51.0.1")).status).toBe(429);
  });

  it("falsche Schlüssel zählen weiter ins Gesamtaufkommen: aus 25 Herkünften ist ab der 21. Schluss", async () => {
    neuePhase();
    const stati = [];
    for (let i = 0; i < 25; i++) stati.push((await anfrage(`10.52.0.${i + 1}`, { schluessel: `falsch-${i}` })).status);
    expect(stati.slice(0, 20), `Stati: ${stati.join(",")}`).toEqual(Array(20).fill(401));
    expect(stati.slice(20).every((s) => s === 429), `Stati: ${stati.join(",")}`).toBe(true);
    // Das verteilte Raten sperrt damit auch den richtigen Schlüssel — für den Rest des Fensters (so gewollt).
    expect((await anfrage("10.52.1.1")).status).toBe(429);
  });

  it("ein gültiger Zugriff stellt Fehlversuche anderer Herkünfte nicht frei (sie zählen im Gesamtaufkommen weiter)", async () => {
    neuePhase();
    for (let i = 0; i < 19; i++) expect((await anfrage(`10.53.0.${i + 1}`, { schluessel: "falsch" })).status).toBe(401);
    // 19 Fehlversuche stehen im Fenster. Gültige Anfragen dazwischen ändern daran nichts …
    for (let i = 0; i < 5; i++) expect((await anfrage("10.53.9.9")).status).toBe(200);
    // … der zwanzigste Fehlversuch geht noch durch, der 21. ist gedeckelt.
    expect((await anfrage("10.53.1.1", { schluessel: "falsch" })).status).toBe(401);
    expect((await anfrage("10.53.1.2", { schluessel: "falsch" })).status).toBe(429);
  });
});
