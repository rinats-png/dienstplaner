/* ==========================================================================
   E2E — SERVER STARTEN UND TESTDATEN ANLEGEN

   1. Gebaute Oberfläche (dist/) vorhanden? Sonst `vite build`.
   2. server.mjs mit Wegwerfablage (mkdtemp) auf 127.0.0.1:E2E_PORT.
      Verwalterschlüssel und Pfeffer sind Zufallswerte dieses Laufs und
      stehen nur in der Umgebung des Serverprozesses.
   3. Über die HTTP-API: Betreiberzugang, Betrieb einrichten
      (/api/bestand-anlegen), je Rolle ein Zugang (/einrichten) und eine
      Sitzung (/api/anmelden).
   4. Codes und Sitzungsmerkmale gehen über process.env.E2E_ZUGAENGE an die
      Testprozesse — nie in eine Datei, nie ins Protokoll.

   Die Rückgabe ist der Abbau: Server beenden, Ablage löschen.
   ========================================================================== */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAUM, BETRIEB, PERSON, startbestand } from "./testdaten.mjs";
import { BASIS, PORT } from "./umgebung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function bereit(basis) {
  for (let i = 0; i < 150; i++) {
    if (await fetch(`${basis}/gesund`).then((r) => r.ok).catch(() => false)) return true;
    await new Promise((w) => setTimeout(w, 100));
  }
  return false;
}

export default async function globalSetup() {
  if (!existsSync(path.join(WURZEL, "dist", "index.html"))) {
    console.log("[e2e] dist/ fehlt — baue die Oberfläche …");
    const b = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build"],
      { cwd: WURZEL, stdio: "inherit", shell: process.platform === "win32" });
    if (b.status !== 0) throw new Error("vite build fehlgeschlagen");
  }

  const daten = await mkdtemp(path.join(tmpdir(), "centric-e2e-daten-"));
  const geheim = randomBytes(24).toString("hex");
  let log = "";
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: WURZEL,
    env: { ...process.env, PORT: String(PORT), CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
      CENTRIC_ADMIN: geheim, CENTRIC_PFEFFER: randomBytes(16).toString("hex"),
      CENTRIC_AUFRAEUMEN: "aus", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => { log += d; });
  server.stderr.on("data", (d) => { log += d; });

  const abbauen = async () => {
    if (server.exitCode === null) {
      await new Promise((fertig) => {
        const notfall = setTimeout(() => server.kill("SIGKILL"), 3000);
        server.once("exit", () => { clearTimeout(notfall); fertig(); });
        server.kill("SIGTERM");
      });
    }
    await rm(daten, { recursive: true, force: true });
  };

  try {
    if (!(await bereit(BASIS))) throw new Error(`Server kam auf ${BASIS} nicht hoch:\n${log}`);

    let nr = 0;
    /* Je Zugang eine eigene Herkunft — so zählt die Bremse nicht alles auf eine Kennung. */
    const zugang = async (rolle, person) => {
      nr += 1;
      const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.33.0.${nr}` },
        body: JSON.stringify({ verwaltung: geheim, name: BETRIEB, bestand: RAUM, rolle, person, betrieb: 0 }) });
      const d = await a.json().catch(() => ({}));
      /* Nur Status und Fehlertext melden — nie den Rumpf, er könnte einen Code tragen. */
      if (!d.zugangscode) throw new Error(`Zugang ${rolle} nicht angelegt: Status ${a.status} ${d.fehler || ""}`);
      return d.zugangscode;
    };
    const anmelden = async (code) => {
      const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.33.1.1" },
        body: JSON.stringify({ zugangscode: code }) });
      const d = await a.json().catch(() => ({}));
      if (!d.token) throw new Error(`Anmeldung fehlgeschlagen: Status ${a.status} ${d.fehler || ""}`);
      return d.token;
    };

    const zugaenge = {};
    const betreiberCode = await zugang("betreiber", null);
    zugaenge.betreiber = { code: betreiberCode, token: await anmelden(betreiberCode) };

    const angelegt = await fetch(`${BASIS}/api/bestand-anlegen`, { method: "POST",
      headers: { authorization: `Bearer ${zugaenge.betreiber.token}`, "content-type": "application/json" },
      body: JSON.stringify({ bestand: RAUM, inhalt: startbestand() }) });
    if (angelegt.status !== 200) throw new Error(`Betrieb nicht eingerichtet: Status ${angelegt.status}`);

    for (const [rolle, person] of Object.entries(PERSON)) {
      const echteRolle = rolle === "mitarbeiterOffline" ? "mitarbeiter" : rolle;
      const code = await zugang(echteRolle, person);
      zugaenge[rolle] = { code, token: await anmelden(code) };
    }
    const kundeCode = await zugang("kunde", null);
    zugaenge.kunde = { code: kundeCode, token: await anmelden(kundeCode) };

    process.env.E2E_ZUGAENGE = JSON.stringify(zugaenge);
    console.log(`[e2e] Server ${BASIS} bereit, ${Object.keys(zugaenge).length} Zugänge angelegt.`);
  } catch (e) {
    await abbauen();
    throw e;
  }
  return abbauen;
}
