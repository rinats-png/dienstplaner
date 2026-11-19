/* ==========================================================================
   DEMO-ROLLENWÄHLER UND MIGRATIONSVORBEREITUNG (Betreiberentscheidung D.2, 2026-11-07)

   - Der Rollenwähler der Demo hängt am Merkmal `demo`, nicht an der Rolle „kunde".
   - Server meldet `demo` in /api/demo, /api/anmelden (Demokonto) und /api/bestand; die
     Verwaltungswege bleiben für Demo-Sitzungen gesperrt (HTTP: demozugang.mjs,
     sicherheit-intern.test.js).
   - Migration auf einer isolierten KOPIE der Ablage: Bericht ändert nichts, Betreiberzugang
     wird als anmeldbar nachgewiesen, Original bleibt byteweise gleich.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, cp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { betreiberAnmeldbar, auswerten } from "../server/lib/kunde-abloesung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quelle = (p) => readFile(path.join(WURZEL, p), "utf8");

describe("Client: Rollenwähler über demo statt kunde", () => {
  it("App.jsx öffnet den Rollenwähler bei zugang.demo (feste Person nur ohne demo)", async () => {
    const app = await quelle("src/App.jsx");
    expect(app).toMatch(/zugang\.rolle !== "kunde" && zugang\.demo !== true/);
  });
  it("speicher.js reicht demo aus Anmelden, Demo-Öffnen und Lesen durch", async () => {
    const sp = await quelle("src/speicher.js");
    expect(sp).toMatch(/hinweis: d\.hinweis, demo: d\.demo === true/);
    expect(sp).toMatch(/name: d\.name, demo: true/);
    expect(sp).toMatch(/demo: daten\.demo === true/);
  });
  it("der Server meldet demo in allen drei Antworten", async () => {
    const d = await quelle("server/funktionen/daten.mjs");
    expect(d).toMatch(/demo: true, gueltigBis/);
    expect(d).toMatch(/eintrag\.demo === true \? \{ demo: true \}/);
    expect((d.match(/demo: s\.demo === true/g) || []).length).toBe(2);
  });
});

describe("Betreiberzugang: Nachweis der Anmeldbarkeit", () => {
  const b = { rolle: "betreiber", demo: false };
  it("anmeldbar: Rolle bekannt, nicht gesperrt, nicht abgelaufen", () => {
    expect(betreiberAnmeldbar(b)).toBe(true);
    expect(betreiberAnmeldbar({ ...b, laeuftAb: "2999-01-01" })).toBe(true);
  });
  it("nicht anmeldbar: gesperrt, abgelaufen, falsche Rolle", () => {
    expect(betreiberAnmeldbar({ ...b, gesperrt: true })).toBe(false);
    expect(betreiberAnmeldbar({ ...b, laeuftAb: "2001-01-01" })).toBe(false);
    expect(betreiberAnmeldbar({ rolle: "leitung" })).toBe(false);
  });
  it("auswerten führt das Ergebnis je Betreiberzeile", () => {
    const a = auswerten({ "h-b-00000001": b, "h-b-00000002": { ...b, gesperrt: true } });
    expect(a.betreiber.map((z) => z.anmeldbar).sort()).toEqual([false, true]);
  });
});

describe("Migration auf isolierter Datenkopie (nur lesender Bericht)", () => {
  let orig, kopie;
  const lauf = (daten, ...arg) => spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "kunde-abloesen.mjs"), ...arg],
    { env: { ...process.env, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien" }, encoding: "utf8" });
  const alles = async (dir) => {
    const aus = {};
    const geh = async (d) => { for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await geh(p); else if (!/\.lock$|prozess/i.test(e.name)) aus[path.relative(dir, p)] = await readFile(p, "utf8");
    } };
    await geh(dir);
    return aus;
  };
  beforeAll(async () => {
    orig = await mkdtemp(path.join(tmpdir(), "centric-orig-"));
    kopie = await mkdtemp(path.join(tmpdir(), "centric-kopie-"));
    process.env.CENTRIC_DATEN = orig; process.env.CENTRIC_ABLAGE = "dateien";
    const { getStore } = await import("../server/lib/ablage.mjs");
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const store = getStore({ name: "centric", consistency: "strong" });
    await kontoSchreiben(store, "h-betreiber-0000000a", { name: "Betreiber", bestand: "demo-x", rolle: "betreiber", demo: false });
    await kontoSchreiben(store, "h-kunde-0000000b", { name: "Demo", bestand: "demo-x", rolle: "kunde", betrieb: 0, demo: true, id: "d0000000b" });
    await cp(orig, kopie, { recursive: true, filter: (s) => !/\.lock$/i.test(s) });
  });
  afterAll(async () => { await rm(orig, { recursive: true, force: true }); await rm(kopie, { recursive: true, force: true }); });

  it("Bericht auf der Kopie: Betreiber anmeldbar nachgewiesen, Kopie und Original unverändert", async () => {
    const vorherO = await alles(orig), vorherK = await alles(kopie);
    const r = lauf(kopie);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Betreiberzugang-Nachweis: alle anmeldbar/);
    expect(r.stdout).toMatch(/Trockenlauf: 1 würden umgestellt/);
    expect(await alles(kopie)).toEqual(vorherK);
    expect(await alles(orig)).toEqual(vorherO);
  });
});
