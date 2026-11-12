/* ==========================================================================
   IMP-3 — Rumpfgrenze je Weg (server.mjs liest den Rumpf VOR jeder Anmeldeprüfung)

   /api/import/upload nimmt bis 10 MB an; analyse, vorschau, uebernahme und
   verwerfen (JSON) nur bis 2 MB; /api/bestand bleibt bei 6 MB. Geprüft mit dem
   echten Server ohne Sitzung: 413 kommt aus server.mjs, 401 heißt „Rumpf
   gelesen, Funktion erreicht".
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serverStarten } from "./hilfen/port.mjs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MB = 1024 * 1024;
let B, kind, statik, daten;

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-rg-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-rg-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>Probe</title>");
  const s = await serverStarten({
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    env: { CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "probe-geheim", NODE_ENV: "production",
      CENTRIC_IMPORT_AKTIV: "true" },   // Server-Schalter (Vorgabe aus); hier wird die Rumpfgrenze des eingeschalteten Imports geprüft
  });
  ({ kind, basis: B } = s);
}, 60000);

afterAll(async () => {
  if (kind && kind.exitCode === null) kind.kill("SIGKILL");
  await rm(statik, { recursive: true, force: true });
  await rm(daten, { recursive: true, force: true });
});

const senden = async (weg, bytes, typ) => {
  const a = await fetch(`${B}${weg}`, { method: "POST", headers: { "content-type": typ, origin: B }, body: Buffer.alloc(bytes, 0x20) });
  await a.arrayBuffer();
  return a.status;
};
const OCT = "application/octet-stream";
const JSN = "application/json";

describe("IMP-3 Rumpfgrenze je Weg", () => {
  it("upload: 7 MB und 10 MB erreichen die Funktion (401 ohne Sitzung), 10 MB + 1 und 11 MB → 413", async () => {
    expect(await senden("/api/import/upload", 7 * MB, OCT)).toBe(401);
    expect(await senden("/api/import/upload", 10 * MB, OCT)).toBe(401);
    expect(await senden("/api/import/upload", 10 * MB + 1, OCT)).toBe(413);
    expect(await senden("/api/import/upload", 11 * MB, OCT)).toBe(413);
  }, 30000);

  for (const weg of ["/api/import/analyse", "/api/import/vorschau", "/api/import/uebernahme", "/api/import/verwerfen"]) {
    it(`${weg}: 2 MB erreichen die Funktion (401), 2 MB + 1 und 7 MB → 413`, async () => {
      expect(await senden(weg, 2 * MB, JSN)).toBe(401);
      expect(await senden(weg, 2 * MB + 1, JSN)).toBe(413);
      expect(await senden(weg, 7 * MB, JSN)).toBe(413);
    }, 30000);
  }

  it("/api/bestand bleibt bei 6 MB (7 MB → 413)", async () => {
    expect(await senden("/api/bestand", 7 * MB, JSN)).toBe(413);
  }, 30000);
});
