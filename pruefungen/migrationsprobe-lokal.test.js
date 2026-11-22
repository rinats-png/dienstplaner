// G5/K4: deploy/migrationsprobe-lokal.mjs (Ablauf) und deploy/migrationsprobe-regeln.mjs (reine Regeln).
// Befund v4-r1 (2026-11-22): Der Kandidat liefert nach dem unveränderten Schreibzyklus dieselben Werte, aber die
// Schlüssel `mandanten`/`session` in anderer Reihenfolge. Der alte Zeichenkettenvergleich meldete das als
// FEHLGESCHLAGEN. Außerdem passte die Isolationsprüfung nur auf Schrägstriche, nicht auf Windows-Pfade.
// Review #471 (2026-11-22): B1 Direktaufruf-Wächter war über Link fail-open (Exit 0 ohne Lauf), A1 Isolationsregex
// unverankert, A2 PUT 409 galt als bestanden, H1 „0 Räume → Exit 1“ ohne Test, H2 undefined===undefined galt als gleich.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inhaltGleich, isolationGeprueft, schreibErgebnis, gesamtExit } from "../deploy/migrationsprobe-regeln.mjs";

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
  it("nimmt scratchpad/daten-mig mit Schrägstrich und Backslash an", () => {
    expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig", {})).toBe(true);
    expect(isolationGeprueft("C:\\Users\\a\\scratchpad\\daten-mig", {})).toBe(true);
    expect(isolationGeprueft("C:/Users/a/scratchpad/daten-mig-2", {})).toBe(true);
    expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig/raum", {})).toBe(true);
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
});
