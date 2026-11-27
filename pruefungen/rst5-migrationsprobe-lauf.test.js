/* ==========================================================================
   RST-5: lokaler Skriptlauf der synthetischen Migrationsprobe (werkzeug/migrationsprobe-synthetisch.mjs)

   Erzeugt die Fixture aus 274bfa0 (git archive, K4-P3), startet DIESEN Quellstand als echten Server (nur 127.0.0.1,
   Wegwerfordner), prüft W-1…W-9, Kennungen, Gegenprobe und Abgleich gegen S0 — als eigener Prozess, wie von Hand.
   Erwartung: Exit 0, jede Prüfung bestanden, Fixture = FIXTURE_BAUM (dieselbe Fixture wie im Gate), Nachweis „lokal“
   ohne Digest; Ausgabe begrenzt, ohne synthetische Adressen oder Passwort. Dauer ≈ 1,5–3 min (Löschlauf nach 60 s).
   Aufruf: npx vitest run pruefungen/rst5-migrationsprobe-lauf.test.js --maxWorkers=1 --testTimeout=480000
   ========================================================================== */
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_BAUM, W_IDS, ZUSATZ_IDS, OK } from "../deploy/sicherung/ci/migrationsprobe-staging.mjs";
import { SYNTH_PASSWORT, SYNTH_PFEFFER } from "../werkzeug/synthetischer-altbestand.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = mkdtempSync(path.join(os.tmpdir(), "rst5-lauf-"));
afterAll(() => rmSync(T, { recursive: true, force: true }));

describe("RST-5 lokaler Skriptlauf", () => {
  it("bestanden: W-1…W-9 und Zusatzproben, dieselbe Fixture wie das Gate, ohne Digest", () => {
    const datei = path.join(T, "nachweis.json");
    const env = { ...process.env, TZ: "UTC" };
    for (const k of Object.keys(env)) if (k.startsWith("CENTRIC_")) delete env[k];
    const r = spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "migrationsprobe-synthetisch.mjs"), "--nachweis", datei],
      { cwd: WURZEL, encoding: "utf8", timeout: 450000, env });
    const aus = `${r.stdout}\n${r.stderr}`;
    expect(r.status, aus).toBe(0);
    const n = JSON.parse(readFileSync(datei, "utf8"));
    expect(n).toMatchObject({ art: "migrationsprobe-lokal", digest: null, altDigest: null, ergebnis: OK });
    expect(n.w.map((/** @type {any} */ x) => x.id)).toEqual([...W_IDS]);
    for (const x of [...n.w, ...n.zusatz]) expect(x.ergebnis, `${x.id}: ${x.grund}`).toBe(OK);
    expect(n.zusatz.map((/** @type {any} */ x) => x.id).sort()).toEqual([...ZUSATZ_IDS].sort());
    expect(n.zusatz.find((/** @type {any} */ x) => x.id === "fixture").grund).toContain(FIXTURE_BAUM.slice(0, 12));
    /* öffentliche Logs: begrenzt, keine Adressen, kein Passwort, kein Pfeffer */
    expect(r.stdout.trim().split("\n").length).toBeLessThanOrEqual(W_IDS.length + ZUSATZ_IDS.length + 1);
    for (const geheim of ["@example.invalid", SYNTH_PASSWORT, SYNTH_PFEFFER]) {
      expect(aus).not.toContain(geheim);
      expect(JSON.stringify(n)).not.toContain(geheim);
    }
  });
});
