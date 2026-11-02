/* ==========================================================================
   PROZESSSPERRE (WP-02, R6) — ein Prozess je Ablage

   Die Sperre je Raum (lib/raumsperre.mjs) gilt innerhalb eines Prozesses.
   Laufen zwei Prozesse auf derselben Ablage — ein zweiter Container beim
   Ausrollen, ein vergessener Testserver auf dem Datenordner —, hilft sie
   nichts: Jeder hat seine eigene Reihe, und die verlorenen Änderungen sind
   wieder da. Deshalb belegt server.mjs beim Start CENTRIC_DATEN/.prozess
   und verweigert den Start, solange ein lebender Prozess die Ablage hält.

   Geprüft wird mit echten Prozessen auf einer Wegwerfablage:
     1. der erste startet und antwortet
     2. der zweite auf derselben Ablage beendet sich mit Fehler, ohne je zu
        antworten
     3. nach dem Ende des ersten startet ein neuer wieder
   Dazu die Bausteine direkt: veraltete Sperre eines toten Prozesses wird
   übernommen, eine fremde lebendige nicht.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, utimes } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT_A = 38931;
const PORT_B = 38932;
const PORT_C = 38933;
let daten, statik;
const kinder = [];

function starten(port) {
  const kind = spawn(process.execPath, ["server.mjs"], {
    cwd: WURZEL,
    env: { ...process.env, PORT: String(port), CENTRIC_STATIK: statik, CENTRIC_DATEN: daten,
      CENTRIC_ABLAGE: "dateien", CENTRIC_AUFRAEUMEN: "aus", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  kind.ausgabe = "";
  kind.stdout.on("data", (d) => { kind.ausgabe += d; });
  kind.stderr.on("data", (d) => { kind.ausgabe += d; });
  kind.ende = new Promise((r) => kind.on("exit", (code) => r(code)));
  kinder.push(kind);
  return kind;
}
const gesund = (port) => fetch(`http://127.0.0.1:${port}/gesund`).then((r) => r.ok).catch(() => false);
async function wartenAufGesund(port, kind, ms = 15000) {
  for (let t = 0; t < ms; t += 100) {
    if (await gesund(port)) return true;
    if (kind.exitCode !== null) return false;
    await new Promise((w) => setTimeout(w, 100));
  }
  return false;
}

beforeAll(async () => {
  daten = await mkdtemp(path.join(tmpdir(), "centric-prozess-daten-"));
  statik = await mkdtemp(path.join(tmpdir(), "centric-prozess-statik-"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>Probe</title>");
});
afterAll(async () => {
  for (const k of kinder) if (k.exitCode === null) k.kill("SIGKILL");
  await Promise.all(kinder.map((k) => (k.exitCode === null ? k.ende : null)));
  await rm(daten, { recursive: true, force: true });
  await rm(statik, { recursive: true, force: true });
});

describe("R6 — zweiter Prozess auf derselben Ablage", () => {
  it("erster läuft, zweiter wird verweigert, nach dem Ende des ersten geht es wieder", async () => {
    const a = starten(PORT_A);
    expect(await wartenAufGesund(PORT_A, a), a.ausgabe).toBe(true);

    const b = starten(PORT_B);
    const ergebnis = await Promise.race([
      b.ende.then((code) => ({ code })),
      new Promise((r) => setTimeout(() => r({ code: "läuft noch" }), 8000)),
    ]);
    const bAntwortet = await gesund(PORT_B);
    expect(bAntwortet, "zweiter Prozess antwortet auf derselben Ablage").toBe(false);
    expect(ergebnis.code, b.ausgabe).not.toBe("läuft noch");
    expect(ergebnis.code).not.toBe(0);
    expect(b.ausgabe).toMatch(/Ablage.*belegt/i);
    expect(await gesund(PORT_A), "der erste läuft weiter").toBe(true);

    /* Ende des ersten. Unter Linux mit SIGTERM — der Prozess räumt seine
       Sperre selbst weg. Unter Windows beendet kill() hart; dann bleibt
       die Sperre liegen und muss als veraltet erkannt werden (toter
       Prozess auf demselben Rechner). Beides muss den Neustart erlauben. */
    a.kill("SIGTERM");
    await a.ende;

    const c = starten(PORT_C);
    expect(await wartenAufGesund(PORT_C, c), c.ausgabe).toBe(true);
    c.kill("SIGTERM");
    await c.ende;
  }, 45000);
});

describe("Bausteine der Prozesssperre", () => {
  let P, ordner;
  beforeAll(async () => {
    P = await import("../server/lib/prozesssperre.mjs");
    ordner = await mkdtemp(path.join(tmpdir(), "centric-prozess-baustein-"));
  });
  afterAll(async () => { await rm(ordner, { recursive: true, force: true }); });

  it("veraltete Sperre eines toten Prozesses wird übernommen", async () => {
    /* Eine PID, die es nicht gibt: weit über jedem üblichen Höchstwert. */
    await writeFile(path.join(ordner, ".prozess"),
      JSON.stringify({ pid: 2 ** 30 + 7, start: "2026-01-01T00:00:00.000Z", rechner: hostname() }));
    const s = await P.ablageBelegen(ordner, { puls: false });
    expect(s.ok, JSON.stringify(s)).toBe(true);
    expect(s.uebernommen).toBe(true);
    const inhalt = JSON.parse(await readFile(path.join(ordner, ".prozess"), "utf8"));
    expect(inhalt.pid).toBe(process.pid);
    await s.freigeben();
  });

  it("lebendige Sperre desselben Rechners wird nicht übernommen", async () => {
    /* Der Vaterprozess dieses Prüflaufs lebt sicher und ist nicht wir. */
    await writeFile(path.join(ordner, ".prozess"),
      JSON.stringify({ pid: process.ppid, start: new Date().toISOString(), rechner: hostname() }));
    const s = await P.ablageBelegen(ordner, { puls: false });
    expect(s.ok).toBe(false);
    expect(s.grund).toMatch(/belegt/);
    const inhalt = JSON.parse(await readFile(path.join(ordner, ".prozess"), "utf8"));
    expect(inhalt.pid).toBe(process.ppid);                       // unangetastet
  });

  it("fremder Rechner: frischer Puls hält, alter Puls gilt als veraltet", async () => {
    const datei = path.join(ordner, ".prozess");
    await writeFile(datei, JSON.stringify({ pid: 1, start: new Date().toISOString(), rechner: "anderer-container" }));
    const frisch = await P.ablageBelegen(ordner, { puls: false, wartenMs: 0 });
    expect(frisch.ok).toBe(false);

    const alt = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(datei, alt, alt);
    const s = await P.ablageBelegen(ordner, { puls: false, wartenMs: 0 });
    expect(s.ok, JSON.stringify(s)).toBe(true);
    expect(s.uebernommen).toBe(true);
    await s.freigeben();
  });

  it("freigeben entfernt nur die eigene Sperre", async () => {
    const s = await P.ablageBelegen(ordner, { puls: false });
    expect(s.ok).toBe(true);
    /* Ein anderer hat sie inzwischen (z. B. nach Übernahme) — dann bleibt sie. */
    await writeFile(path.join(ordner, ".prozess"),
      JSON.stringify({ pid: process.ppid, start: new Date().toISOString(), rechner: hostname() }));
    await s.freigeben();
    const inhalt = JSON.parse(await readFile(path.join(ordner, ".prozess"), "utf8"));
    expect(inhalt.pid).toBe(process.ppid);
  });
});
