/* ==========================================================================
   SERVERLAUF — ein frischer Server je serverbasierter Prüfung

   Fünf Prüfungen laufen gegen einen laufenden Server: Rechte, Verwalter,
   Demozugänge, Sicherung außer Haus, Bremse. Jede legt dabei Zugänge über
   /einrichten an, und die Bremse zählt dort ein Gesamtaufkommen — zwanzig
   Aufrufe je zehn Minuten, in der Ablage, über alle Herkünfte hinweg. Die
   Rechteprüfung braucht davon allein neunzehn. Liefen zwei Prüfungen
   nacheinander gegen denselben Server, bekam die zweite 429 — nicht, weil
   etwas kaputt war, sondern weil die Bremse tat, was sie soll.

   Die Bremse zu lockern wäre die falsche Lösung: Sie ist die Verteidigung
   gegen das Erraten des Verwalterschlüssels. Stattdessen bekommt jede
   Prüfung, was sie in der CI ohnehin bekommt — einen frischen Server mit
   leerer Ablage:

     1. Wegwerfverzeichnisse für Ablage und Oberfläche (mktemp)
     2. server.mjs auf einem freien Port, nur auf 127.0.0.1
     3. warten, bis /gesund antwortet
     4. die Prüfung mit CENTRIC_BASIS auf diesen Server
     5. Server beenden (SIGTERM, notfalls SIGKILL), Verzeichnisse löschen
     6. mit dem Status der Prüfung enden

   Nichts davon berührt eine echte Ablage: CENTRIC_DATEN zeigt auf das
   Wegwerfverzeichnis, und alles außerhalb bleibt unangetastet.

   Aufruf:
     node pruefungen/serverlauf.mjs rechte          # pruefungen/rechte.mjs
     node pruefungen/serverlauf.mjs pruefungen/demozugang.mjs
   ========================================================================== */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = process.env.CENTRIC_ADMIN || "testgeheim";
const PFEFFER = process.env.CENTRIC_PFEFFER || "pruefung-pfeffer";

const angabe = process.argv[2];
if (!angabe) {
  console.error("Aufruf: node pruefungen/serverlauf.mjs <name|pfad.mjs>");
  process.exit(2);
}
const pruefung = angabe.endsWith(".mjs")
  ? path.resolve(WURZEL, angabe)
  : path.join(WURZEL, "pruefungen", `${angabe}.mjs`);

/** Ein freier Port auf 127.0.0.1 — das Betriebssystem vergibt ihn. */
function freierPort() {
  return new Promise((erfuellt, verworfen) => {
    const s = createServer();
    s.once("error", verworfen);
    s.listen(0, "127.0.0.1", () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (s.address());
      s.close(() => erfuellt(port));
    });
  });
}

/** Wartet, bis /gesund antwortet — höchstens zehn Sekunden. */
async function bereit(basis) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${basis}/gesund`).then((r) => r.ok).catch(() => false)) return true;
    await new Promise((w) => setTimeout(w, 100));
  }
  return false;
}

/** Läuft ein Kindprozess bis zum Ende und liefert den Status. */
function laufen(befehl, argumente, env) {
  return new Promise((erfuellt) => {
    const kind = spawn(befehl, argumente, { cwd: WURZEL, env, stdio: "inherit" });
    kind.on("exit", (code, signal) => erfuellt(code ?? (signal ? 1 : 0)));
    kind.on("error", () => erfuellt(1));
  });
}

/** Beendet den Server sauber; wer nach drei Sekunden noch lebt, wird abgeschossen. */
function beenden(server) {
  return new Promise((erfuellt) => {
    if (server.exitCode !== null) return erfuellt();
    const notfall = setTimeout(() => server.kill("SIGKILL"), 3000);
    server.once("exit", () => { clearTimeout(notfall); erfuellt(); });
    server.kill("SIGTERM");
  });
}

const daten = await mkdtemp(path.join(tmpdir(), "centric-pruefung-daten-"));
const statik = await mkdtemp(path.join(tmpdir(), "centric-pruefung-statik-"));
await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Prüfung</title>");

const port = await freierPort();
const basis = `http://127.0.0.1:${port}`;
let serverLog = "";
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: WURZEL,
  env: { ...process.env, PORT: String(port), CENTRIC_STATIK: statik, CENTRIC_DATEN: daten,
    CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: PFEFFER,
    NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

let status = 1;
try {
  if (!(await bereit(basis))) {
    console.error(`Server kam nicht hoch:\n${serverLog}`);
  } else {
    console.log(`→ ${path.relative(WURZEL, pruefung)} gegen frischen Server ${basis}, Ablage ${daten}`);
    status = await laufen(process.execPath, [pruefung], {
      ...process.env, CENTRIC_BASIS: basis, CENTRIC_ADMIN: ADMIN,
    });
    if (status !== 0) console.error(`Serverprotokoll:\n${serverLog}`);
  }
} finally {
  await beenden(server);
  await rm(daten, { recursive: true, force: true });
  await rm(statik, { recursive: true, force: true });
}
process.exit(status);
