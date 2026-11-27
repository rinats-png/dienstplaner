#!/usr/bin/env node
/* ==========================================================================
   RST-5: Synthetische Migrationsprobe W-1…W-9 LOKAL (alten Stand erzeugen, Kandidat starten, Regeln prüfen)

   Dieselbe Fixture und dieselben Regeln wie das Staging-Gate (deploy/sicherung/ci/migrationsprobe-staging.sh und
   .mjs), aber ohne Docker: Fixture per `git archive` aus 274bfa0 (K4-P3), Kandidat = DIESER Quellstand
   (`node server.mjs`), nur 127.0.0.1, nur Wegwerfordner unter dem Temp-Verzeichnis. Der Nachweis trägt art
   „migrationsprobe-lokal“ und digest null — er ersetzt den Gate-Lauf am Digest nicht (N-2/N-9).

     node werkzeug/migrationsprobe-synthetisch.mjs [--nachweis <datei.json>] [--behalten]

   Ablauf: Fixture + Gegenprobe (Zahl-Kennung) schreiben, Selbsttest; Betriebskennungen (0 / 1); S0 sichern; Kandidat
   starten (Löschlauf und Datenschutzlauf wie in Produktion: Vorgabe an/vorschau); Sperrdatei, Schreibhalt, Bücher;
   deploy-abgleich gegen S0 (--start); Migrationsprobe; Lösch- und Datenschutzlauf abwarten (≤ 150 s); Stopp; Bewerten.
   Dauer ≈ 1,5–3 min (der Löschlauf beginnt 60 s nach dem Start).
   Exit: 0 bestanden · 1 fehlgeschlagen oder nicht bewertbar · 2 Aufruf.
   Grenzen: kein Digest, kein Bild, kein Docker; die Fixture-Gleichheit mit dem Gate belegt FIXTURE_BAUM.
   Tests: pruefungen/rst5-migrationsprobe-lauf.test.js (Lauf), pruefungen/rst5-migrationsprobe.test.js (Regeln).
   ========================================================================== */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { erzeugen, SYNTH_PFEFFER } from "./synthetischer-altbestand.mjs";
import { FIXTURE, GEGENPROBE, bewerten, nachweisBauen, bericht, OK } from "../deploy/sicherung/ci/migrationsprobe-staging.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRIST_WERKZEUG_MS = 240000;
const WARTEN_START_MS = 60000;
const WARTEN_LAEUFE_MS = 150000;
const warten = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});

/** Umgebung ohne fremde CENTRIC_*-Werte (nie die laufende Ablage des Rechners berühren). */
function umgebung(/** @type {Record<string, string>} */ extra) {
  /** @type {Record<string, string|undefined>} */ const e = { ...process.env, TZ: "UTC", NODE_OPTIONS: "" };
  for (const k of Object.keys(e)) if (k.startsWith("CENTRIC_")) delete e[k];
  return { ...e, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: SYNTH_PFEFFER, ...extra };
}
/** Ein Werkzeug als eigener Prozess mit Frist. */
function werkzeug(/** @type {string} */ rel, /** @type {string[]} */ args, /** @type {Record<string, string>} */ env) {
  const r = spawnSync(process.execPath, [path.join(WURZEL, rel), ...args], { cwd: WURZEL, encoding: "utf8",
    timeout: FRIST_WERKZEUG_MS, env: umgebung(env), maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status === null ? 124 : r.status, stdout: String(r.stdout || ""), stderr: String(r.stderr || "") };
}

/** @param {{ nachweis?: string|null, behalten?: boolean }} [o] */
export async function lauf({ nachweis = null, behalten = false } = {}) {
  const T = mkdtempSync(path.join(tmpdir(), "rst5-lokal-"));
  const DATEN = path.join(T, "scratchpad", "daten-mig-lokal"), GEGEN = path.join(T, "scratchpad", "daten-mig-gegen");
  const ZUSTAND = path.join(T, "zustand"), STATIK = path.join(T, "statik"), SICH = path.join(T, "sich"), ROH = path.join(T, "roh");
  for (const d of [path.join(T, "scratchpad"), ZUSTAND, STATIK, SICH, ROH]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(STATIK, "index.html"), "<!doctype html><title>RST-5</title>");
  /** @type {Record<string, string>} */ const roh = {};
  const merk = (/** @type {string} */ k, /** @type {unknown} */ v) => { roh[k] = String(v); };
  /** @type {import("node:child_process").ChildProcess|null} */ let server = null;
  let log = "";
  try {
    /* 1. Fixture und Gegenprobe (274bfa0 per git archive), Selbsttest in erzeugen */
    const f = await erzeugen({ ausgabe: DATEN, ...FIXTURE });
    await erzeugen({ ausgabe: GEGEN, ...GEGENPROBE });
    merk("fixtureBaum", f.baumHash);
    /* 2. Betriebskennungen mit dem Code dieses Stands */
    merk("kennungenExit", werkzeug("deploy/betriebskennungen-pruefen.mjs", [DATEN], { CENTRIC_APP: WURZEL }).code);
    merk("gegenprobeExit", werkzeug("deploy/betriebskennungen-pruefen.mjs", [GEGEN], { CENTRIC_APP: WURZEL }).code);
    rmSync(GEGEN, { recursive: true, force: true });
    /* 3. S0 */
    const s = werkzeug("werkzeug/ablage-sicherung.mjs", ["sichern", "--quelle", DATEN, "--ziel", path.join(SICH, "s0"), "--ruhe", "0"], {});
    const s0 = (/Sicherung vollständig: (.+)/.exec(`${s.stdout}\n${s.stderr}`) || [])[1];
    if (s.code !== 0 || !s0) throw new Error(`S0: Sicherung fehlgeschlagen (Exit ${s.code})`);
    /* 4. Kandidat starten */
    const port = /** @type {number} */ (await freierPort());
    const start = Date.now();
    server = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, stdio: ["ignore", "pipe", "pipe"],
      env: umgebung({ PORT: String(port), CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_STATIK: STATIK,
        CENTRIC_ADMIN: randomBytes(24).toString("hex"), CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "production",
        CENTRIC_ZUSTELL_TAKT: "aus" }) });   // Überwachung wie im Gate und in Produktion auf Vorgabe (an, ohne Alarmkanal)
    server.stdout?.on("data", (d) => { log += d; });
    server.stderr?.on("data", (d) => { log += d; });
    const bis = Date.now() + WARTEN_START_MS;
    let bereit = false;
    while (!bereit && Date.now() < bis && server.exitCode === null) {
      bereit = log.includes("läuft auf Port") && await fetch(`http://127.0.0.1:${port}/gesund`).then((r) => r.ok, () => false);
      if (!bereit) await warten(200);
    }
    if (bereit) {
      merk("prozess", existsSync(path.join(DATEN, ".prozess")) ? "ja" : "nein");
      merk("schreibhalt", existsSync(path.join(ZUSTAND, "schreibhalt")) ? "ja" : "nein");
      const bytes = (/** @type {string} */ d) => { try { return statSync(path.join(ZUSTAND, d)).size; } catch { return 0; } };
      merk("buchZugang", bytes("zugang-widerrufe.json"));
      merk("buchKonto", bytes("konto-widerrufe.json"));
      /* 5. Abgleich gegen S0, dann Migrationsprobe */
      const ab = werkzeug("deploy/deploy-abgleich.mjs", [s0.trim(), DATEN, "--start", String(start)], {});
      merk("abgleich", ab.stdout); merk("abgleichExit", ab.code);
      const pr = werkzeug("deploy/migrationsprobe-lokal.mjs", [], { CENTRIC_APP: WURZEL, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND,
        CENTRIC_PROBE_PORT: String(port) });
      merk("probe", `${pr.stdout}\n${pr.stderr}`); merk("probeExit", pr.code);
      /* 6. Löschlauf und Datenschutzlauf abwarten */
      const ende = Date.now() + WARTEN_LAEUFE_MS;
      while (Date.now() < ende && server.exitCode === null
        && !(/^Löschlauf: (\d+ Testräume|abgeschaltet)|Löschlauf fehlgeschlagen/m.test(log) && /^Datenschutzlauf|Datenschutzlauf fehlgeschlagen/m.test(log))) {
        await warten(500);
      }
    }
  } finally {
    if (server && server.exitCode === null) {
      const p = server;
      await new Promise((ok) => { const not = setTimeout(() => p.kill("SIGKILL"), 8000); p.once("exit", () => { clearTimeout(not); ok(undefined); }); p.kill("SIGTERM"); });
    }
    if (log) merk("startLog", log);
    if (!behalten) rmSync(T, { recursive: true, force: true });
  }
  const { w, zusatz } = bewerten(/** @type {any} */ (roh));
  const n = nachweisBauen({ modus: "lokal", w, zusatz });
  if (nachweis) writeFileSync(path.resolve(nachweis), JSON.stringify(n, null, 2) + "\n");
  return { nachweis: n, ordner: behalten ? T : null };
}

/** @param {string[]} argv */
export async function main(argv) {
  /** @type {{ nachweis: string|null, behalten: boolean }} */ const o = { nachweis: null, behalten: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--nachweis" && argv[i + 1] && !argv[i + 1].startsWith("--") && o.nachweis === null) o.nachweis = argv[++i];
    else if (argv[i] === "--behalten" && !o.behalten) o.behalten = true;
    else { console.error("Aufruf: migrationsprobe-synthetisch.mjs [--nachweis <datei.json>] [--behalten]"); return 2; }
  }
  try {
    const { nachweis, ordner } = await lauf(o);
    console.log(bericht(nachweis));
    if (ordner) console.log(`Ordner behalten: ${ordner}`);
    return nachweis.ergebnis === OK ? 0 : 1;
  } catch (e) {
    console.error(`Fehler: ${String(/** @type {any} */ (e)?.message || e).slice(0, 300)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
