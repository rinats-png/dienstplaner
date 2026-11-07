/* ==========================================================================
   WP-28c — Mess-Skript als Prüfung (kleine Fassung für die CI)

   werkzeug/schreibhalt-messung.mjs in einem eigenen Prozess: ein
   „Server“-Prozess schreibt Zwei-Datei-Transaktionen (Lücke 5 ms) unter
   der Raumsperre, dieser sichert mit Schreib-Halt. Abnahme wie in der großen
   Messung (≥ 1000 Sicherungen, docs/acc45/wp28c-nachweis.md), hier mit 30:
   0 Schnitte mitten in einer Transaktion, 100 % Erfolg, ≥ 50 Schreibvorgänge/s.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SKRIPT = path.join(__dirname, "..", "werkzeug", "schreibhalt-messung.mjs");

describe("Schreibhalt-Messung (Kurzfassung)", () => {
  it("30 Sicherungen unter Dauerlast: 0 Schnitte, 100 % Erfolg, alle unter Halt, ≥ 50 Schreibvorgänge/s", () => {
    const r = spawnSync(process.execPath, [SKRIPT, "--sicherungen", "30", "--json"], { encoding: "utf8", timeout: 240_000 });
    expect(r.status, r.stderr).toBe(0);
    const b = JSON.parse(r.stdout.trim().split("\n").pop());
    expect(b.schnitteMittenInTransaktion).toBe(0);
    expect(b.erfolg).toBe(30);
    expect(b.mitHaltAbgeschlossen).toBe(30);
    expect(b.schreiber.proSekunde).toBeGreaterThanOrEqual(50);
    expect(r.stderr).toMatch(/ABNAHME ERFÜLLT/);
  }, 260_000);
});
