#!/usr/bin/env node
/* ==========================================================================
   TEST-KURZ — einen Testbefehl ausführen, nur Zusammenfassung und
   Fehlschläge ausgeben, den Rückgabewert genau erhalten

     node werkzeug/test-kurz.mjs [--sperre] [--warten <s>] [--zeilen <n>] -- <befehl> [argumente …]

   Beispiel:
     node werkzeug/test-kurz.mjs --sperre -- npx vitest run pruefungen/dsgvo-server.test.js

   - Der Befehl läuft unverändert (Argumente durchgereicht); unter Windows
     über die Shell, damit npx/npm gefunden werden.
   - Ausgegeben werden nur Zeilen, die nach Zusammenfassung oder Fehlschlag
     aussehen (vitest, node:test, eigene Prüfskripte: ✓/×, FAIL, Error,
     „Tests …", „Test Files …", „ok/FEHLER"), höchstens --zeilen (Vorgabe
     200). Endet der Befehl mit einem Fehler und passt keine Zeile, kommen
     die letzten 30 Zeilen.
   - Rückgabe: genau die des Befehls (Signal: 128 + Nummer).
   - --sperre: Über alle Worktrees läuft nur ein schwerer Testlauf
     gleichzeitig (Sperrdatei, Vorgabe <tmp>/centric-test-kurz.sperre, sonst
     TEST_KURZ_SPERRE). Gewartet wird höchstens --warten Sekunden (Vorgabe
     900). Fail-safe: Läuft die Zeit ab oder klappt die Sperre nicht, läuft
     der Test trotzdem — mit Hinweis. Eine Sperre eines toten Prozesses
     oder älter als 2 Stunden gilt als verwaist und wird übernommen.
   ========================================================================== */
import { spawn } from "node:child_process";
import { open, readFile, unlink, stat } from "node:fs/promises";
import { tmpdir, constants as osKonst } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MUSTER = /(✓|✗|×|❯|\bFAIL\b|\bPASS\b|Error\b|AssertionError|Test Files|Tests\s|Duration|\bpassed\b|\bfailed\b|^\s*ok\b|^not ok|FEHLER|VERSTOSS|\b(\d+) (bestanden|fehlgeschlagen)\b)/;
const ANSI = /\x1b\[[0-9;]*m/g;  // eslint-disable-line no-control-regex
const VERWAIST_MS = 2 * 60 * 60 * 1000;

/** Aus der vollen Ausgabe die Zusammenfassung und die Fehlschläge. */
export function kuerzen(text, { code = 0, zeilen = 200 } = {}) {
  const alle = String(text).replace(ANSI, "").split(/\r?\n/);
  const treffer = alle.filter((z) => MUSTER.test(z) && z.trim());
  if (treffer.length) return treffer.slice(0, zeilen).concat(treffer.length > zeilen ? [`… ${treffer.length - zeilen} weitere Zeilen`] : []);
  return code === 0 ? [] : alle.filter((z) => z.trim()).slice(-30);
}

const pidLebt = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

/** Sperre holen. Gibt { ok, freigeben, hinweis } zurück — nie eine Ausnahme. */
export async function sperreHolen(datei, { wartenMs = 900_000, takt = 1000, say = () => {} } = {}) {
  const ich = JSON.stringify({ pid: process.pid, start: new Date().toISOString(), cwd: process.cwd() });
  const bis = Date.now() + wartenMs;
  let gemeldet = false;
  try {
    for (;;) {
      try {
        const fh = await open(datei, "wx");
        try { await fh.writeFile(ich); } finally { await fh.close(); }
        return { ok: true, freigeben: async () => {
          try { if ((await readFile(datei, "utf8")) === ich) await unlink(datei); } catch { /* schon weg */ }
        } };
      } catch (e) { if (e.code !== "EEXIST") throw e; }
      let halter = null, alter = 0;
      try { halter = JSON.parse(await readFile(datei, "utf8")); alter = Date.now() - (await stat(datei)).mtimeMs; }
      catch { /* unlesbar oder gerade weg — gleich neu versuchen */ }
      if (halter && (!pidLebt(halter.pid) || alter > VERWAIST_MS)) {
        await unlink(datei).catch(() => {});
        continue;
      }
      if (Date.now() >= bis)
        return { ok: false, freigeben: async () => {}, hinweis: `Sperre ${datei} nach ${Math.round(wartenMs / 1000)} s noch belegt — läuft trotzdem.` };
      if (!gemeldet && halter) { say(`Warte auf laufenden Testlauf (Prozess ${halter.pid}, ${halter.cwd || "?"}) …`); gemeldet = true; }
      await new Promise((r) => setTimeout(r, Math.min(takt, Math.max(10, bis - Date.now()))));
    }
  } catch (e) {
    return { ok: false, freigeben: async () => {}, hinweis: `Sperre nicht möglich (${e.code || e.message}) — läuft trotzdem.` };
  }
}

/** Ein Argument für cmd.exe in Anführungszeichen (nur wenn nötig). */
const fuerCmd = (a) => (/^[\w.\\/:=@%+,-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '\\"')}"`);

/** Den Befehl ausführen; Rückgabe { code, ausgabe }. */
export function ausfuehren(befehl, args, { cwd = process.cwd() } = {}) {
  return new Promise((fertig) => {
    let ausgabe = "";
    /* „node" immer direkt (ohne Shell). Unter Windows sonst über cmd.exe —
       npx/npm sind dort .cmd-Dateien —, mit selbst gesetzten
       Anführungszeichen statt unmaskierter Argumentliste. */
    const direkt = process.platform !== "win32" || befehl === "node";
    const k = direkt
      ? spawn(befehl === "node" ? process.execPath : befehl, args, { cwd, env: process.env })
      : spawn([befehl, ...args].map(fuerCmd).join(" "), { cwd, shell: true, env: process.env });
    k.stdout.on("data", (d) => { ausgabe += d; });
    k.stderr.on("data", (d) => { ausgabe += d; });
    k.on("error", (e) => fertig({ code: 127, ausgabe: `${ausgabe}\nFEHLER: ${e.message}` }));
    k.on("close", (code, signal) => {
      const nr = signal ? (osKonst.signals[signal] || 1) : 0;
      fertig({ code: code ?? 128 + nr, ausgabe });
    });
  });
}

export async function main(argv, say = (s) => console.log(s)) {
  const trenn = argv.indexOf("--");
  const optionen = trenn >= 0 ? argv.slice(0, trenn) : [];
  const befehl = trenn >= 0 ? argv.slice(trenn + 1) : argv;
  if (!befehl.length) { say("Aufruf: node werkzeug/test-kurz.mjs [--sperre] [--warten s] [--zeilen n] -- <befehl> …"); return 2; }
  const wert = (n, v) => { const i = optionen.indexOf(n); return i >= 0 ? Number(optionen[i + 1]) : v; };
  const mitSperre = optionen.includes("--sperre");
  const zeilen = wert("--zeilen", 200);

  let sperre = { ok: false, freigeben: async () => {} };
  if (mitSperre) {
    const datei = process.env.TEST_KURZ_SPERRE || path.join(tmpdir(), "centric-test-kurz.sperre");
    sperre = await sperreHolen(datei, { wartenMs: wert("--warten", 900) * 1000, say });
    if (sperre.hinweis) say(`HINWEIS: ${sperre.hinweis}`);
  }
  const t0 = Date.now();
  let erg;
  try { erg = await ausfuehren(befehl[0], befehl.slice(1)); }
  finally { await sperre.freigeben(); }
  for (const z of kuerzen(erg.ausgabe, { code: erg.code, zeilen })) say(z);
  say(`[test-kurz] Rückgabe ${erg.code} nach ${Math.round((Date.now() - t0) / 1000)} s`);
  return erg.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
