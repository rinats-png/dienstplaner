// G5/K4: deploy/migrationsprobe-lokal.mjs (Ablauf) und deploy/migrationsprobe-regeln.mjs (reine Regeln).
// Befund v4-r1 (2026-11-22): Der Kandidat liefert nach dem unveränderten Schreibzyklus dieselben Werte, aber die
// Schlüssel `mandanten`/`session` in anderer Reihenfolge. Der alte Zeichenkettenvergleich meldete das als
// FEHLGESCHLAGEN. Außerdem passte die Isolationsprüfung nur auf Schrägstriche, nicht auf Windows-Pfade.
// Review #471 (2026-11-22): B1 Direktaufruf-Wächter war über Link fail-open (Exit 0 ohne Lauf), A1 Isolationsregex
// unverankert, A2 PUT 409 galt als bestanden, H1 „0 Räume → Exit 1“ ohne Test, H2 undefined===undefined galt als gleich.
// Delta-Review #471 (2026-11-22): A1 Backslash galt auch unter POSIX als Trenner (Linux: ein einziger Ordnername
// „a\scratchpad\daten-mig“ bestand die Prüfung), H1 toter Link im Wegwerfbereich wurde angenommen, H6 fetch ohne
// Frist (die Probe konnte hängen).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inhaltGleich, isolationGeprueft, schreibErgebnis, gesamtExit, holenMitFrist, fristAus, portAus }
  from "../deploy/migrationsprobe-regeln.mjs";
import { saeen } from "./migrationsprobe-saat.mjs";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOY = join(WURZEL, "deploy");
const SKRIPT = join(DEPLOY, "migrationsprobe-lokal.mjs");

let tmp;
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), "migprobe-")); });
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

function starten(skript, env) {
  const e = { ...process.env, ...env };
  delete e.CENTRIC_BASIS;
  return spawnSync(process.execPath, [skript], { env: e, encoding: "utf8", cwd: tmp });
}

describe("migrationsprobe-lokal: inhaltGleich", () => {
  it("andere Schlüsselreihenfolge (auch verschachtelt) ist gleich", () => {
    expect(inhaltGleich({ mandanten: [{ id: "m-1", name: "A" }], session: { x: 1 } },
      { session: { x: 1 }, mandanten: [{ name: "A", id: "m-1" }] })).toBe(true);
  });
  it("anderer Wert, fehlender Schlüssel oder andere Listenreihenfolge ist ungleich", () => {
    expect(inhaltGleich({ a: 1 }, { a: 2 })).toBe(false);
    expect(inhaltGleich({ a: 1, b: null }, { a: 1 })).toBe(false);
    expect(inhaltGleich({ l: [1, 2] }, { l: [2, 1] })).toBe(false);
    expect(inhaltGleich({ a: "1" }, { a: 1 })).toBe(false);
  });
  it("H2: fehlender oder skalarer Inhalt ist nie gleich (undefined === undefined zählt nicht)", () => {
    expect(inhaltGleich(undefined, undefined)).toBe(false);
    expect(inhaltGleich(null, null)).toBe(false);
    expect(inhaltGleich("x", "x")).toBe(false);
    expect(inhaltGleich({ a: 1 }, undefined)).toBe(false);
    expect(inhaltGleich([], [])).toBe(true);
  });
});

describe("migrationsprobe-lokal: Isolation (A1, segmentgenau, fail-closed)", () => {
  it("nimmt scratchpad/daten-mig mit Schrägstrich an", () => {
    expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig", {})).toBe(true);
    expect(isolationGeprueft("C:/Users/a/scratchpad/daten-mig-2", {})).toBe(true);
    expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig/raum", {})).toBe(true);
  });
  it("A1: Backslash je Plattform — Windows: Trenner (angenommen); POSIX: kein Trenner (abgewiesen, fail-closed)", () => {
    // POSIX-Regel auf jeder Plattform (Trenner ausdrücklich „/“): ein Backslash in der Angabe wird abgewiesen.
    expect(isolationGeprueft("C:\\Users\\a\\scratchpad\\daten-mig", {}, "/")).toBe(false);
    expect(isolationGeprueft("/data/a\\scratchpad\\daten-mig", {}, "/")).toBe(false);
    expect(isolationGeprueft("/tmp/x/scratchpad\\daten-mig", {}, "/")).toBe(false);
    expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig/a\\b", {}, "/")).toBe(false);   // ausdrücklich abgewiesen
    // Echte Plattform: genau einer der beiden Zweige läuft; keiner wird still übersprungen.
    if (process.platform === "win32") {
      expect(isolationGeprueft("C:\\Users\\a\\scratchpad\\daten-mig", {})).toBe(true);
      expect(isolationGeprueft("C:\\Users\\a\\scratchpad/daten-mig-2", {})).toBe(true);
    } else {
      expect(isolationGeprueft("C:\\Users\\a\\scratchpad\\daten-mig", {})).toBe(false);
      expect(isolationGeprueft("/data/a\\scratchpad\\daten-mig", {})).toBe(false);
      expect(isolationGeprueft("/tmp/x/scratchpad\\daten-mig", {})).toBe(false);
      expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig/a\\b", {})).toBe(false);
    }
  });
  it("weist andere Pfade, fehlende Angabe und gesetztes CENTRIC_BASIS ab", () => {
    expect(isolationGeprueft("/data", {})).toBe(false);
    expect(isolationGeprueft(undefined, {})).toBe(false);
    expect(isolationGeprueft("", {})).toBe(false);
    expect(isolationGeprueft("/tmp/scratchpad/daten-mig", { CENTRIC_BASIS: "https://app.example" })).toBe(false);
  });
  it("weist ..-Segmente ab (Ziel läge außerhalb des Wegwerfbereichs)", () => {
    expect(isolationGeprueft("/data/scratchpad/daten-mig/../..", {})).toBe(false);
    expect(isolationGeprueft("C:\\scratchpad\\daten-mig\\..\\..\\data", {})).toBe(false);
    expect(isolationGeprueft("/tmp/scratchpad/daten-mig/../daten-mig", {})).toBe(false);
  });
  it("weist Teilzeichenketten-Treffer ab (Segment muss genau scratchpad bzw. daten-mig… heißen)", () => {
    expect(isolationGeprueft("/data#scratchpad/daten-mig", {})).toBe(false);
    expect(isolationGeprueft("/x/myscratchpad/daten-mig", {})).toBe(false);
    expect(isolationGeprueft("/x/scratchpad/alt-daten-mig", {})).toBe(false);
    expect(isolationGeprueft("/x/scratchpad/daten-migration", {})).toBe(false);
    expect(isolationGeprueft("/x/scratchpad/sub/daten-mig", {})).toBe(false);
  });
  it("weist UNC-/Netzpfade ab", () => {
    expect(isolationGeprueft("\\\\srv\\share\\scratchpad\\daten-mig", {})).toBe(false);
    expect(isolationGeprueft("//srv/share/scratchpad/daten-mig", {})).toBe(false);
  });
  it("prüft das echte Ziel: ein Link im Wegwerfbereich, der nach außen zeigt, wird abgewiesen", () => {
    const aussen = join(tmp, "aussen-data"); mkdirSync(aussen, { recursive: true });
    const sp = join(tmp, "link", "scratchpad"); mkdirSync(sp, { recursive: true });
    const link = join(sp, "daten-mig");
    try { symlinkSync(aussen, link, process.platform === "win32" ? "junction" : "dir"); } catch (e) {
      if (process.platform === "win32") { console.warn("ÜBERSPRUNGEN (Windows, kein Link möglich):", e.message); return; }
      throw e;
    }
    expect(isolationGeprueft(link, {})).toBe(false);
  });
  it("H1: toter Link (Ziel existiert nicht) im Wegwerfbereich wird abgewiesen, ein neuer Ordner nicht", () => {
    const ziel = join(tmp, "nicht-da", "data");   // existiert nicht
    const sp = join(tmp, "tot", "scratchpad"); mkdirSync(sp, { recursive: true });
    const link = join(sp, "daten-mig");
    try { symlinkSync(ziel, link, process.platform === "win32" ? "junction" : "dir"); } catch (e) {
      if (process.platform === "win32") { console.warn("ÜBERSPRUNGEN (Windows, kein Link möglich):", e.message); return; }
      throw e;
    }
    expect(isolationGeprueft(link, {})).toBe(false);
    expect(isolationGeprueft(join(link, "raum"), {})).toBe(false);
    // Gegenprobe: ein noch nicht angelegter echter Ordner unter scratchpad bleibt zulässig.
    expect(isolationGeprueft(join(sp, "daten-mig-neu", "raum"), {})).toBe(true);
  });
});

describe("migrationsprobe-lokal: Frist für HTTP (H6)", () => {
  it("fristAus/portAus: Vorgaben und nur gültige Werte", () => {
    expect(fristAus({})).toBe(30000);
    expect(fristAus({ CENTRIC_PROBE_FRIST_MS: "250" })).toBe(250);
    expect(fristAus({ CENTRIC_PROBE_FRIST_MS: "0" })).toBe(30000);
    expect(fristAus({ CENTRIC_PROBE_FRIST_MS: "abc" })).toBe(30000);
    expect(portAus({})).toBe(3012);
    expect(portAus({ CENTRIC_PROBE_PORT: "4100" })).toBe(4100);
    expect(portAus({ CENTRIC_PROBE_PORT: "70000" })).toBe(3012);
    expect(portAus({ CENTRIC_PROBE_PORT: "80 x" })).toBe(3012);
  });
  it("Server antwortet nicht: holenMitFrist bricht mit Zeitüberschreitung ab", async () => {
    const srv = createServer(() => { /* antwortet nie */ });
    await new Promise((r) => srv.listen(0, "127.0.0.1", () => r(undefined)));
    const port = /** @type {any} */ (srv.address()).port;
    try {
      await expect(holenMitFrist(`http://127.0.0.1:${port}/api/bestand`, {}, 200))
        .rejects.toThrow(/Zeitüberschreitung nach 200 ms: GET \/api\/bestand/);
    } finally { srv.closeAllConnections(); srv.close(); }
  });
  it("Server antwortet: Status und Text kommen zurück", async () => {
    const srv = createServer((q, a) => { a.writeHead(200, { "content-type": "application/json" }); a.end('{"ok":1}'); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", () => r(undefined)));
    const port = /** @type {any} */ (srv.address()).port;
    try {
      const r = await holenMitFrist(`http://127.0.0.1:${port}/x`, {}, 2000);
      expect(r.s).toBe(200);
      expect(r.x).toBe('{"ok":1}');
    } finally { srv.closeAllConnections(); srv.close(); }
  });
});

describe("migrationsprobe-lokal: Schreibergebnis (A2) und Gesamtergebnis (H1)", () => {
  it("PUT 200 mit gleichem Inhalt besteht", () => {
    const r = schreibErgebnis(200, true);
    expect(r.bestanden).toBe(true);
    expect(r.text).toContain("PUT 200");
  });
  it("PUT 409 ist „nicht geschrieben“ und FEHLGESCHLAGEN, auch bei gleichem Inhalt", () => {
    const r = schreibErgebnis(409, true);
    expect(r.bestanden).toBe(false);
    expect(r.text).toContain("nicht geschrieben");
    expect(r.text).toContain("PUT 409");
  });
  it("PUT 422/500 oder ungleicher Inhalt ist FEHLGESCHLAGEN", () => {
    expect(schreibErgebnis(422, true).bestanden).toBe(false);
    expect(schreibErgebnis(500, true).bestanden).toBe(false);
    expect(schreibErgebnis(200, false).bestanden).toBe(false);
  });
  it("Exit 0 nur bei mindestens einer Prüfung und allen bestanden", () => {
    expect(gesamtExit(0, 0)).toBe(1);
    expect(gesamtExit(1, 2)).toBe(1);
    expect(gesamtExit(2, 2)).toBe(0);
  });
});

describe("migrationsprobe-lokal: als Skript (B1: läuft immer, auch über Link)", () => {
  it("Abbruch mit Exit 3 ohne Isolation, ohne Netz", () => {
    const r = starten(SKRIPT, { CENTRIC_APP: "x", CENTRIC_DATEN: "/data" });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("ABBRUCH Isolation");
  });
  it("über Link (Linux-Symlink / Windows-Junction) gestartet: ebenfalls Exit 3 mit Ausgabe, nicht stumm Exit 0", () => {
    const link = join(tmp, "deploy-link");
    try { symlinkSync(DEPLOY, link, process.platform === "win32" ? "junction" : "dir"); } catch (e) {
      if (process.platform === "win32") { console.warn("ÜBERSPRUNGEN (Windows, keine Junction möglich):", e.message); return; }
      throw e;
    }
    const r = starten(join(link, "migrationsprobe-lokal.mjs"), { CENTRIC_APP: "x", CENTRIC_DATEN: "/data" });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("ABBRUCH Isolation");
  });
  it("über relativen Startpfad: Exit 3 mit Ausgabe", () => {
    const e = { ...process.env, CENTRIC_APP: "x", CENTRIC_DATEN: "/data" }; delete e.CENTRIC_BASIS;
    const r = spawnSync(process.execPath, ["deploy/./migrationsprobe-lokal.mjs"], { env: e, encoding: "utf8", cwd: WURZEL });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("ABBRUCH Isolation");
  });
  it("H1: leere Wegwerf-Ablage (0 Räume) endet mit Exit 1, nicht 0", () => {
    const daten = join(tmp, "leer", "scratchpad", "daten-mig-leer");
    mkdirSync(daten, { recursive: true });
    const r = starten(SKRIPT, { CENTRIC_APP: WURZEL, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien" });
    expect(r.stdout).toContain("MIGRATIONSPROBE: 0/0");
    expect(r.status).toBe(1);
  });
  it("H6: Kandidat antwortet nicht → FEHLGESCHLAGEN mit Zeitüberschreitung, Exit 1 (kein Hängen)", async () => {
    const daten = join(tmp, "frist", "scratchpad", "daten-mig-frist");
    mkdirSync(daten, { recursive: true });
    saeen(daten, { "raum-frist": [{ id: "m-1", name: "Haus" }] });
    const srv = createServer(() => { /* antwortet nie */ });
    await new Promise((r) => srv.listen(0, "127.0.0.1", () => r(undefined)));
    const port = /** @type {any} */ (srv.address()).port;
    try {
      const e = { ...process.env, CENTRIC_APP: WURZEL, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
        CENTRIC_PROBE_PORT: String(port), CENTRIC_PROBE_FRIST_MS: "300" };
      delete e.CENTRIC_BASIS;
      /** @type {{status: number|null, aus: string}} */
      const r = await new Promise((fertig) => {
        const k = spawn(process.execPath, [SKRIPT], { env: e, cwd: tmp });
        let aus = ""; k.stdout.on("data", (d) => { aus += d; });
        const wache = setTimeout(() => k.kill(), 30000);
        k.on("close", (status) => { clearTimeout(wache); fertig({ status, aus }); });
      });
      expect(r.aus).toContain("FEHLGESCHLAGEN");
      expect(r.aus).toContain("Zeitüberschreitung nach 300 ms");
      expect(r.aus).toContain("MIGRATIONSPROBE: 0/1");
      expect(r.status).toBe(1);
    } finally { srv.closeAllConnections(); srv.close(); }
  });
});
