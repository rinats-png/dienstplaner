#!/usr/bin/env node
/* ==========================================================================
   TEST-KURZ — einen Testbefehl ausführen, nur Zusammenfassung und
   Fehlschläge ausgeben, den Rückgabewert genau erhalten

     node werkzeug/test-kurz.mjs [--sperre] [--warten <s>] [--zeilen <n>] -- <befehl> [argumente …]

   Beispiel:
     node werkzeug/test-kurz.mjs --sperre -- npx vitest run pruefungen/dsgvo-server.test.js

   - „node" läuft immer direkt (ohne Shell). Andere Befehle unter Windows
     über cmd.exe (npx/npm sind dort .cmd-Dateien): `cmd /d /s /c "…"` mit
     wörtlich übergebener Befehlszeile. Weil cmd.exe Anführungszeichen,
     & | < > ^ % ! selbst auswertet und sich das nicht zuverlässig maskieren
     lässt, werden Argumente mit diesen Zeichen dort ABGELEHNT (Rückgabe 2) —
     keine Befehlsinjektion. Unter Linux/macOS ohne Shell, alles erlaubt.
   - Ausgegeben werden nur Zeilen, die nach Zusammenfassung oder Fehlschlag
     aussehen (✓/×, FAIL, Error, „Tests …", „Test Files …", ok/FEHLER),
     höchstens --zeilen (Vorgabe 200). Endet der Befehl mit einem Fehler und
     passt keine Zeile, kommen die letzten 30 Zeilen. Die Ausgabe wird
     zeilenweise verarbeitet; gehalten werden nur Treffer und das Ende —
     kein unbegrenzter Puffer.
   - Rückgabe: genau die des Befehls (Signal: 128 + Nummer). Aufruffehler 2.
   - Strg-C/SIGTERM: Das Kind wird beendet, die Sperre freigegeben.
   - --sperre: Über alle Worktrees läuft nur ein schwerer Testlauf
     gleichzeitig (Sperrdatei, Vorgabe <tmp>/centric-test-kurz.sperre, sonst
     TEST_KURZ_SPERRE). Gewartet wird höchstens --warten Sekunden (Vorgabe
     900). Fail-safe: Läuft die Zeit ab oder klappt die Sperre nicht, läuft
     der Test trotzdem — mit Hinweis. Verwaist ist eine Sperre eines toten
     Prozesses, eine ältere als 2 Stunden, oder eine leere/unlesbare, die
     älter als 2 Minuten ist; sie wird atomar (umbenennen, vergleichen)
     übernommen.
   ========================================================================== */
import { spawn } from "node:child_process";
import { open, readFile, unlink, stat, rename, link } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir, constants as osKonst } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MUSTER = /(✓|✗|×|❯|\bFAIL\b|\bPASS\b|Error\b|AssertionError|Test Files|Tests\s|Duration|\bpassed\b|\bfailed\b|^\s*ok\b|^not ok|FEHLER|VERSTOSS|\b(\d+) (bestanden|fehlgeschlagen)\b)/;
const ANSI = /\x1b\[[0-9;]*m/g;  // eslint-disable-line no-control-regex
const VERWAIST_MS = 2 * 60 * 60 * 1000;
const LEER_VERWAIST_MS = 2 * 60 * 1000;
const ENDE_ZEILEN = 30;
/** Zeichen, die cmd.exe selbst auswertet — unter Windows in Argumenten verboten. */
export const CMD_GEFAEHRLICH = /["&|<>^%!\r\n]/;

/** Sammelt Zeilen: Treffer (höchstens `zeilen`) und das Ende der Ausgabe. */
export function sammler({ zeilen = 200 } = {}) {
  const treffer = [];
  let mehr = 0;
  const ende = [];
  let rest = "";
  const zeile = (roh) => {
    const z = roh.replace(ANSI, "");
    if (!z.trim()) return;
    if (MUSTER.test(z)) { if (treffer.length < zeilen) treffer.push(z); else mehr += 1; }
    ende.push(z);
    if (ende.length > ENDE_ZEILEN) ende.shift();
  };
  return {
    schreiben(text) {
      rest += text;
      const teile = rest.split(/\r?\n/);
      rest = teile.pop();
      if (rest.length > 65536) { zeile(rest.slice(0, 65536)); rest = ""; }   // überlange Zeile ohne Umbruch
      for (const t of teile) zeile(t);
    },
    ergebnis(code) {
      if (rest) { zeile(rest); rest = ""; }
      if (treffer.length) return mehr ? [...treffer, `… ${mehr} weitere Zeilen`] : [...treffer];
      return code === 0 ? [] : [...ende];
    },
  };
}

/** Aus einer vollständigen Ausgabe die Zusammenfassung und die Fehlschläge. */
export function kuerzen(text, { code = 0, zeilen = 200 } = {}) {
  const s = sammler({ zeilen });
  s.schreiben(String(text));
  return s.ergebnis(code);
}

const pidLebt = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

/** Eine als verwaist beurteilte Sperre wegräumen — nur, wenn es noch dieselbe ist. */
async function verwaisteWegraeumen(datei, rohErwartet) {
  const beiseite = `${datei}.verwaist-${process.pid}-${randomBytes(4).toString("hex")}`;
  try { await rename(datei, beiseite); }
  catch (e) { if (e.code === "ENOENT") return; throw e; }
  const roh = await readFile(beiseite, "utf8").catch(() => null);
  if (roh !== rohErwartet) await link(beiseite, datei).catch(() => {});   // inzwischen neu belegt: zurück
  await unlink(beiseite).catch(() => {});
}

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
      let roh = null, halter = null, alter = 0;
      try { roh = await readFile(datei, "utf8"); alter = Date.now() - (await stat(datei)).mtimeMs; }
      catch (e) { if (e.code === "ENOENT") continue; }
      try { halter = JSON.parse(roh); } catch { halter = null; }
      const verwaist = halter && typeof halter === "object"
        ? !pidLebt(halter.pid) || alter > VERWAIST_MS
        : roh !== null && alter > LEER_VERWAIST_MS;                     // leer/unlesbar und nicht frisch
      if (verwaist) { await verwaisteWegraeumen(datei, roh); continue; }
      if (Date.now() >= bis)
        return { ok: false, freigeben: async () => {}, hinweis: `Sperre ${datei} nach ${Math.round(wartenMs / 1000)} s noch belegt — läuft trotzdem.` };
      if (!gemeldet && halter) { say(`Warte auf laufenden Testlauf (Prozess ${halter.pid}, ${halter.cwd || "?"}) …`); gemeldet = true; }
      await new Promise((r) => setTimeout(r, Math.min(takt, Math.max(10, bis - Date.now()))));
    }
  } catch (e) {
    return { ok: false, freigeben: async () => {}, hinweis: `Sperre nicht möglich (${e.code || e.message}) — läuft trotzdem.` };
  }
}

/** Wie der Befehl gestartet wird. Wirft bei einem unter Windows unzulässigen Argument. */
export function startplan(befehl, args, plattform = process.platform) {
  if (befehl === "node") return { datei: process.execPath, args, optionen: {} };
  if (plattform !== "win32") return { datei: befehl, args, optionen: {} };
  const alle = [befehl, ...args];
  const boese = alle.find((a) => CMD_GEFAEHRLICH.test(String(a)));
  if (boese !== undefined)
    throw new Error(`Unter Windows sind in Argumenten " & | < > ^ % ! nicht erlaubt (cmd.exe wertet sie aus): ${JSON.stringify(boese)}`);
  const zeile = alle.map((a) => (/\s/.test(a) || a === "" ? `"${a}"` : a)).join(" ");
  return { datei: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${zeile}"`],
    optionen: { windowsVerbatimArguments: true } };
}

/** Den Befehl ausführen; Rückgabe { code, zeilen }. */
export function ausfuehren(befehl, args, { cwd = process.cwd(), zeilen = 200, signale = true } = {}) {
  return new Promise((fertig) => {
    const s = sammler({ zeilen });
    let plan;
    try { plan = startplan(befehl, args); }
    catch (e) { fertig({ code: 2, zeilen: [`FEHLER: ${e.message}`] }); return; }
    const k = spawn(plan.datei, plan.args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"], ...plan.optionen });
    k.stdout.setEncoding("utf8");
    k.stderr.setEncoding("utf8");
    k.stdout.on("data", (d) => s.schreiben(d));
    k.stderr.on("data", (d) => s.schreiben(d));
    const weiter = (sig) => () => { try { k.kill(sig); } catch { /* schon weg */ } };
    const handler = signale ? { SIGINT: weiter("SIGINT"), SIGTERM: weiter("SIGTERM") } : {};
    for (const [sig, f] of Object.entries(handler)) process.on(sig, f);
    const aufraeumen = () => { for (const [sig, f] of Object.entries(handler)) process.off(sig, f); };
    k.on("error", (e) => { aufraeumen(); fertig({ code: 127, zeilen: [...s.ergebnis(127), `FEHLER: ${e.message}`] }); });
    k.on("close", (code, signal) => {
      aufraeumen();
      const nr = signal ? (osKonst.signals[signal] || 1) : 0;
      const c = code ?? 128 + nr;
      fertig({ code: c, zeilen: s.ergebnis(c) });
    });
  });
}

export async function main(argv, say = (s) => console.log(s)) {
  const trenn = argv.indexOf("--");
  const optionen = trenn >= 0 ? argv.slice(0, trenn) : [];
  const befehl = trenn >= 0 ? argv.slice(trenn + 1) : argv;
  const hilfe = "Aufruf: node werkzeug/test-kurz.mjs [--sperre] [--warten s] [--zeilen n] -- <befehl> …";
  if (!befehl.length) { say(hilfe); return 2; }
  const zahl = (n, v, min) => {
    const i = optionen.indexOf(n);
    if (i < 0) return v;
    const w = Number(optionen[i + 1]);
    return Number.isFinite(w) && w >= min ? w : null;
  };
  const zeilen = zahl("--zeilen", 200, 1);
  const warten = zahl("--warten", 900, 0);
  if (zeilen === null || warten === null) { say(`FEHLER: --zeilen und --warten brauchen eine Zahl. ${hilfe}`); return 2; }
  const unbekannt = optionen.filter((o, i) => o.startsWith("--") && !["--sperre", "--warten", "--zeilen"].includes(o)
    && !["--warten", "--zeilen"].includes(optionen[i - 1]));
  if (unbekannt.length) { say(`FEHLER: unbekannte Option ${unbekannt[0]}. ${hilfe}`); return 2; }

  let sperre = { ok: false, freigeben: async () => {} };
  if (optionen.includes("--sperre")) {
    const datei = process.env.TEST_KURZ_SPERRE || path.join(tmpdir(), "centric-test-kurz.sperre");
    sperre = await sperreHolen(datei, { wartenMs: warten * 1000, say });
    if (sperre.hinweis) say(`HINWEIS: ${sperre.hinweis}`);
  }
  const t0 = Date.now();
  let erg;
  try { erg = await ausfuehren(befehl[0], befehl.slice(1), { zeilen }); }
  finally { await sperre.freigeben(); }
  for (const z of erg.zeilen) say(z);
  say(`[test-kurz] Rückgabe ${erg.code} nach ${Math.round((Date.now() - t0) / 1000)} s`);
  return erg.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
