/* ==========================================================================
   SI-P6 — Ende-zu-Ende gegen einen echten Server im Produktionsmodus

   Der Server läuft mit NODE_ENV=production (zweiter Faktor für Betreibercodes
   ist Pflicht, nicht abschaltbar). Geprüft wird der Weg, den die Prüfläufe
   und Staging-Werkzeuge nehmen: Betreibercode anmelden (der Vorlauf
   werkzeug/betreiber-faktor-vorlauf.mjs richtet den Faktor ein) und dann
   POST /api/zugaenge. Der Vorlauf schickt dafür einen frischen Code mit.

   Gegenprobe ohne Vorlauf: derselbe Aufruf mit dem echten `fetch` und ohne
   `zweifaktor` wird mit 401 „erforderlich“ abgelehnt, es entsteht kein Code.

   Dauer: Ein Code gilt nur einmal je 30-s-Schritt; der Vorlauf wartet auf den
   nächsten freien Schritt (höchstens 30 s).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASIS = `http://127.0.0.1:${PORT}`;
const OP = "VPRD-BTRB-0001";
const PFEFFER = "pfeffer-nur-zum-pruefen-vorlauf-0123456789";
let daten, statik, server, log = "", echtesFetch;

const kopf = (t) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });
const post = (f, pfad, rumpf, t) => f(`${BASIS}${pfad}`, { method: "POST", headers: t ? kopf(t) : { "content-type": "application/json" },
  body: JSON.stringify(rumpf) });

beforeAll(async () => {
  echtesFetch = globalThis.fetch;
  daten = await mkdtemp(path.join(tmpdir(), "centric-vorlauf-daten-"));
  statik = await mkdtemp(path.join(tmpdir(), "centric-vorlauf-statik-"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>Vorlauf</title>");
  process.env.CENTRIC_DATEN = daten;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  /* Betreibercode und einen leeren Betrieb direkt in der Ablage anlegen (derselbe Datenordner wie der Server). */
  const { getStore } = await import("../server/lib/ablage.mjs");
  const store = getStore({ name: "centric", consistency: "strong" });
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  const B = await import("../server/lib/bestand.mjs");
  await kontoSchreiben(store, ablageSchluessel(OP), { name: "Betreiber Vorlauf", bestand: "vorlauf-betreiber", rolle: "betreiber",
    person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  await B.bestandSchreiben(store, "vorlauf-neu", { version: 9, mandanten: [{ id: "m-vorlauf", name: "Vorlauf", einheiten: [{ id: "e1" }],
    personen: [{ id: "p1", vorname: "V", nachname: "N", rolle: "leitung", bereich: "ALLE",
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }], nachrichten: [], notrufe: [], anfragen: [] }] }, { durch: "Pruefung" });

  const env = { ...process.env, PORT: String(PORT), CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: PFEFFER,
    CENTRIC_STATIK: statik, CENTRIC_ADMIN: "vorlauf-verwalter-nur-zum-pruefen-0123456789", NODE_ENV: "production",
    CENTRIC_BASIS: "https://vorlauf.example.invalid" };
  for (const v of ["CENTRIC_PROBE_BASIS", "STAGING_PROBE_BASIS", "PROBE_BASIS", "PROBE_URL", "NODE_USE_ENV_PROXY"]) delete env[v];
  server = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (d) => { log += d; });
  server.stderr.on("data", (d) => { log += d; });
  let bereit = false;
  for (let i = 0; i < 100 && !bereit; i++) {
    bereit = await echtesFetch(`${BASIS}/gesund`).then(() => true, () => false);
    if (!bereit) await new Promise((r) => setTimeout(r, 200));
  }
  expect(bereit, log).toBe(true);
  await import("../werkzeug/betreiber-faktor-vorlauf.mjs");   // ersetzt globalThis.fetch
});

afterAll(async () => {
  if (server) { server.kill("SIGTERM"); await new Promise((r) => setTimeout(r, 300)); }
  globalThis.fetch = echtesFetch;
  await rm(daten, { recursive: true, force: true });
  await rm(statik, { recursive: true, force: true });
});

describe("SI-P6: Produktionsmodus, Vorlauf und /api/zugaenge", () => {
  it("der Vorlauf meldet den Betreiber an und schickt für /api/zugaenge einen frischen Code mit; ohne Code lehnt der Server ab", async () => {
    const an = await post(globalThis.fetch, "/api/anmelden", { zugangscode: OP });
    const ant = await an.json();
    expect(an.status, JSON.stringify(ant)).toBe(200);
    expect(ant.token).toBeTruthy();

    /* Gegenprobe: derselbe Token, aber das echte fetch ohne Vorlauf und ohne Code. */
    const ohne = await post(echtesFetch, "/api/zugaenge", { bestand: "vorlauf-neu", eintraege: [{ rolle: "planer" }] }, ant.token);
    const ohneD = await ohne.json();
    expect(ohne.status, JSON.stringify(ohneD)).toBe(401);
    expect(ohneD.zweifaktor).toBe("erforderlich");

    /* Mit Vorlauf: Erstanlage eines Betriebs mit Leitung und Planung. */
    const mit = await post(globalThis.fetch, "/api/zugaenge",
      { bestand: "vorlauf-neu", eintraege: [{ rolle: "leitung" }, { rolle: "planer" }] }, ant.token);
    const mitD = await mit.json();
    expect(mit.status, JSON.stringify(mitD) + log.slice(-400)).toBe(200);
    expect(mitD.zugaenge.map((z) => z.rolle)).toEqual(["leitung", "planer"]);
    expect(JSON.stringify(mitD)).not.toContain(OP);
  });
});
