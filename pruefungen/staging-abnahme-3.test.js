/* ==========================================================================
   STAGING-ABNAHME 3.1-3.4 (WP-S1): werkzeug/staging-abnahme-3.mjs

   - ohne Ziel: Abdeckung PASS, Exit 0, kein Netzzugriff
   - mit Ziel: nur lesende Proben gegen einen frischen lokalen Server;
     die Ablage bleibt unverändert (nichts geschrieben)
   - fremdes Ziel, Zugangsdaten in der Adresse, falsche Argumente: Exit 2
   - ein Ziel ohne passende Antworten führt zu FAIL und Exit 1
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, copyFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3917;
const ZIEL = `http://127.0.0.1:${PORT}`;
const lauf = (...args) => spawnSync(process.execPath, ["werkzeug/staging-abnahme-3.mjs", ...args],
  { cwd: WURZEL, encoding: "utf8", timeout: 30000 });

function starten(port, daten, statik) {
  return spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, stdio: "ignore",
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "abn3-geheim",
      CENTRIC_STATIK: statik, CENTRIC_PFEFFER: "abn3-pfeffer", NODE_ENV: "production" } });
}
async function bereit(port) {
  for (let i = 0; i < 80; i++) {
    if (await fetch(`http://127.0.0.1:${port}/gesund`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Testserver startet nicht");
}

let daten, statik, server;
beforeAll(async () => {
  daten = await mkdtemp(path.join(tmpdir(), "centric-abn3-daten-"));
  statik = await mkdtemp(path.join(tmpdir(), "centric-abn3-statik-"));
  await copyFile(path.join(WURZEL, "index.html"), path.join(statik, "index.html"));
  for (const f of ["manifest.webmanifest", "sw.js"]) await copyFile(path.join(WURZEL, "public", f), path.join(statik, f));
  server = starten(PORT, daten, statik);
  await bereit(PORT);
}, 30000);
afterAll(async () => {
  if (server) server.kill();
  await rm(daten, { recursive: true, force: true });
  await rm(statik, { recursive: true, force: true });
});

describe("staging-abnahme-3", () => {
  it("ohne Ziel: Abdeckung 3.1-3.4 PASS, Exit 0, Live-Proben offen", () => {
    const r = lauf();
    expect(r.status).toBe(0);
    for (const id of ["3\\.1", "3\\.2", "3\\.3", "3\\.4"]) expect(r.stdout).toMatch(new RegExp(`PASS +${id} `));
    expect(r.stdout).toMatch(/MANUELL/);
    expect(r.stdout).toMatch(/ 0 FAIL/);
    expect(r.stdout).toMatch(/OFFEN/);
  });
  it("mit lokalem Ziel: lesende Proben bestehen, die Ablage bleibt unverändert", async () => {
    const vorher = (await readdir(daten, { recursive: true })).sort();
    const r = lauf("--ziel", ZIEL);
    expect(r.stdout).toMatch(/ 0 FAIL/);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\/gesund: 200/);
    /* Der Server führt für jeden Lesezugriff einen Bremszähler (centric-takt); das ist keine Fachablage. */
    const ohneTakt = (l) => l.filter((x) => !x.startsWith("centric-takt")).sort();
    expect(ohneTakt(await readdir(daten, { recursive: true }))).toEqual(ohneTakt(vorher));
  });
  it("Ziel ohne passende Antworten: FAIL und Exit 1", async () => {
    const leer = await mkdtemp(path.join(tmpdir(), "centric-abn3-leer-"));
    await writeFile(path.join(leer, "index.html"), "<!doctype html><title>x</title>");
    const s = starten(3918, leer, leer);
    try {
      await bereit(3918);
      const r = lauf("--ziel", "http://127.0.0.1:3918");
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/FAIL +3\.1 +Manifest/);
    } finally { s.kill(); await rm(leer, { recursive: true, force: true }); }
  }, 30000);
  it("fremdes Ziel, Zugangsdaten, falsche Argumente: Exit 2", () => {
    for (const a of [["--ziel", "http://example.com"], ["--ziel", "https://127.0.0.1:3000"], ["--ziel", "http://user:pw@127.0.0.1:3000"],
      ["--ziel", "kaputt"], ["--ziel"], ["--anders"], ["x", "y", "z"]]) {
      const r = lauf(...a);
      expect(r.status, a.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/ABBRUCH/);
    }
  });
});
