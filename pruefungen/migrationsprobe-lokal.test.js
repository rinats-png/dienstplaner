// G5/K4: deploy/migrationsprobe-lokal.mjs — Isolation und Inhaltsvergleich (ohne Server, ohne Netz).
// Befund v4-r1 (2026-11-22): Der Kandidat liefert nach dem unveränderten Schreibzyklus dieselben Werte, aber die
// Schlüssel `mandanten`/`session` in anderer Reihenfolge. Der alte Zeichenkettenvergleich meldete das als
// FEHLGESCHLAGEN. Außerdem passte die Isolationsprüfung nur auf Schrägstriche, nicht auf Windows-Pfade.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inhaltGleich, isolationGeprueft } from "../deploy/migrationsprobe-lokal.mjs";

const SKRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../deploy/migrationsprobe-lokal.mjs");

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
});

describe("migrationsprobe-lokal: Isolation", () => {
  it("nimmt scratchpad/daten-mig mit Schrägstrich und Backslash an", () => {
    expect(isolationGeprueft("/tmp/x/scratchpad/daten-mig", {})).toBe(true);
    expect(isolationGeprueft("C:\\Users\\a\\scratchpad\\daten-mig", {})).toBe(true);
    expect(isolationGeprueft("C:/Users/a/scratchpad/daten-mig-2", {})).toBe(true);
  });
  it("weist andere Pfade, fehlende Angabe und gesetztes CENTRIC_BASIS ab", () => {
    expect(isolationGeprueft("/data", {})).toBe(false);
    expect(isolationGeprueft(undefined, {})).toBe(false);
    expect(isolationGeprueft("/tmp/scratchpad/daten-mig", { CENTRIC_BASIS: "https://app.example" })).toBe(false);
  });
  it("als Skript: Abbruch mit Exit 3 ohne Isolation, ohne Netz", () => {
    const env = { ...process.env, CENTRIC_APP: "x", CENTRIC_DATEN: "/data" };
    delete env.CENTRIC_BASIS;
    const r = spawnSync(process.execPath, [SKRIPT], { env, encoding: "utf8" });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("ABBRUCH Isolation");
  });
});
