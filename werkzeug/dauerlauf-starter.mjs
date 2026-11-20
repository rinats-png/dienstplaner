#!/usr/bin/env node
/* ==========================================================================
   DAUERLAUF-STARTER — Zwischenprozess je Worker (wird nur von dauerlauf-prozess.mjs gestartet).

   Warum: Der Worker muss das Ende des Supervisors überleben (Wiederanlauf ohne Doppelstart), also
   startet der Supervisor losgelöst (detached). Unter Windows hat ein losgelöster Prozess aber keine
   Konsole; startet er cmd.exe (claude.cmd), bekommt dessen Kind eine NEUE Konsole statt der Pipes:
   stdin (der Auftrag) käme nie an, die Ausgabe nicht ins Protokoll (im Test mit einer .cmd-Attrappe
   nachgewiesen). Deshalb startet der Supervisor losgelöst nur diesen kleinen Node-Prozess; er startet
   den eigentlichen Befehl NICHT losgelöst mit verborgener Konsole (windowsHide), reicht Auftrag und
   Ausgabe durch und schreibt den Exit-Code in eine Datei (bleibt über einen Neustart des Supervisors
   lesbar). Unter Windows hängt das Kind in der Job-Gruppe des Starters: stirbt der Starter, stirbt der
   Baum mit; unter POSIX liegen beide in einer Prozessgruppe.

   Aufruf: node dauerlauf-starter.mjs <plan-base64url> <logDatei> <exitDatei>
     plan = { datei, args, optionen, eingabe } (bereits geprüft von startPlan)
   ========================================================================== */
import { spawn } from "node:child_process";
import { openSync, renameSync, writeFileSync } from "node:fs";

const [planRoh, logDatei, exitDatei] = process.argv.slice(2);
const plan = JSON.parse(Buffer.from(planRoh, "base64url").toString("utf8"));
let fertig = false;
const ende = (ergebnis, code) => {
  if (fertig) return;
  fertig = true;
  try { writeFileSync(`${exitDatei}.tmp`, JSON.stringify(ergebnis)); renameSync(`${exitDatei}.tmp`, exitDatei); } catch { /* Supervisor sieht dann "beendet, exit unbekannt" */ }
  process.exit(code);
};
const out = openSync(logDatei, "a");
let k;
try {
  k = spawn(plan.datei, plan.args, { cwd: process.cwd(), env: process.env, stdio: ["pipe", out, out], windowsHide: true, ...(plan.optionen || {}) });
} catch (e) { ende({ exit: null, fehler: e.message }, 1); }
k.on("error", (e) => ende({ exit: null, fehler: e.message }, 1));
k.on("exit", (code, signal) => ende({ exit: code, signal: signal ?? null }, code ?? 1));
k.stdin.on("error", () => { /* Kind liest stdin nicht */ });
k.stdin.end(plan.eingabe ?? "");
for (const s of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(s, () => { try { k.kill("SIGKILL"); } catch { /* weg */ } ende({ exit: null, signal: s }, 1); });
