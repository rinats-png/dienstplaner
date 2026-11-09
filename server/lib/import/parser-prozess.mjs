/* ==========================================================================
   IMP-2 — Isolation des Parsers in einem eigenen Kindprozess
   (Review 561dd32, H1 / Entscheidung E-A; Vertrag: docs/acc45/IMPORT-VERTRAG.md §4)

   Vorher lief der Parser in einem Worker-Thread im Server-Prozess. Dessen
   Heap-Grenze (resourceLimits) erfasst Speicher außerhalb des JS-Heaps
   (Buffer/ArrayBuffer) nicht, und ein nativer Absturz im Worker beendet den
   ganzen Server. Jetzt läuft jede Datei in einem eigenen Node-Prozess:

   - Programm: dieselbe Node-Binärdatei (process.execPath), feste Argumente,
     ohne Shell-Option von spawn, keine Umgebungsvariablen des Servers (insb. kein NODE_OPTIONS).
   - Heap des Kindes: --max-old-space-size=256 (KIND_HEAP_MB).
   - Linux: zusätzlich Adressraum-Limit über die Shell (ulimit -v, ADRESSRAUM_KB,
     Standard 1.500.000 KB; Umgebungsvariable CENTRIC_IMPORT_ADRESSRAUM_KB, 0 = aus).
     Andere Systeme (Windows, nur Entwicklung): ohne Adressraum-Limit.
   - Wandzeit: zeitMs (Standard 20 s), danach SIGKILL und Antwort ZEITLIMIT.
   - Ein-/Ausgabe: Eingabe über stdin (4 Byte Kopflänge, Kopf-JSON, Dateibytes);
     Ergebnis über stdout als JSON, höchstens ausgabeMax Byte (sonst Kill).
     stderr wird nur zur Einordnung des Abbruchs gelesen (höchstens 16 KB) und verworfen.
   Der Server-Prozess überlebt jeden Absturz des Kindes; das Kind wird immer
   beendet und von Node eingesammelt (kein Zombie).
   Dieses Modul startet nur den Parser; es öffnet keine Netzverbindung und
   schreibt keine Datei.
   ========================================================================== */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const MB = 1024 * 1024;
export const KIND_HEAP_MB = 256;
export const ADRESSRAUM_KB_STANDARD = 1500000;
export const AUSGABE_MAX_BYTES = 128 * MB;
const STDERR_MAX = 16 * 1024;
const SPEICHER_RE = /heap out of memory|Reached heap limit|Allocation failed|out of memory|ERR_MEMORY_ALLOCATION_FAILED|Array buffer allocation failed|std::bad_alloc/i;

/** Laufende Kindprozesse (für Prüfungen und Diagnose). */
const aktiv = new Set();
export const aktiveKinder = () => [...aktiv].map((k) => k.pid);

/** Adressraum-Limit in KB (nur Linux), 0 = aus. */
export function adressraumKb() {
  if (process.platform !== "linux") return 0;
  const roh = process.env.CENTRIC_IMPORT_ADRESSRAUM_KB;
  if (roh === undefined || roh === "") return ADRESSRAUM_KB_STANDARD;
  const n = Number(roh);
  return Number.isInteger(n) && n >= 0 ? n : ADRESSRAUM_KB_STANDARD;
}

/** Programm und Argumente des Kindes (fest; keine Teile der Eingabe). */
export function kindBefehl(skriptPfad, heapMb, kb) {
  const node = [`--max-old-space-size=${heapMb}`, "--disallow-code-generation-from-strings", skriptPfad];
  if (kb > 0) {
    /* sh -c '…' sh <kb> <node> <args…>: ulimit setzen, danach ersetzt exec die Shell durch Node
       (die Prozessnummer ist damit die des Node-Kindes; Kill trifft Node direkt). */
    return { programm: "/bin/sh", argumente: ["-c", 'ulimit -v "$1" || exit 70; shift; exec "$@"', "sh", String(kb), process.execPath, ...node] };
  }
  return { programm: process.execPath, argumente: node };
}

/** Minimale Umgebung für das Kind. */
function umgebung() {
  const env = {};
  if (process.platform === "win32") {
    for (const k of ["SystemRoot", "SYSTEMROOT", "windir"]) if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

/**
 * Führt das Kindskript aus.
 * @returns {Promise<{ art: "ergebnis", wert: any } | { art: "zeitlimit" } | { art: "speicher" } | { art: "ausgabe" } | { art: "fehler", detail?: string }>}
 */
export function fuehreKindAus({ skript, kopf, daten, zeitMs, ausgabeMax = AUSGABE_MAX_BYTES, heapMb = KIND_HEAP_MB, kb = adressraumKb(), beiStart } = {}) {
  return new Promise((resolve) => {
    let fertig = false;
    let kind;
    let getoetet = false;
    const ende = (e) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      resolve(e);
    };
    const toeten = () => {
      if (kind && kind.exitCode === null && kind.signalCode === null) {
        getoetet = true;
        try { kind.kill("SIGKILL"); } catch { /* bereits beendet */ }
      }
    };
    const timer = setTimeout(() => { toeten(); ende({ art: "zeitlimit" }); }, zeitMs);
    const pfad = skript instanceof URL ? fileURLToPath(skript) : String(skript);
    const { programm, argumente } = kindBefehl(pfad, heapMb, kb);
    try {
      kind = spawn(programm, argumente, { stdio: ["pipe", "pipe", "pipe"], env: umgebung(), windowsHide: true, shell: false });
    } catch {
      return ende({ art: "fehler", detail: "Start" });
    }
    aktiv.add(kind);
    if (typeof beiStart === "function" && kind.pid) beiStart(kind.pid);
    const aus = [];
    let ausLaenge = 0;
    let fehlerText = "";
    kind.stdout.on("data", (d) => {
      if (fertig) return;
      ausLaenge += d.length;
      if (ausLaenge > ausgabeMax) { toeten(); aus.length = 0; return ende({ art: "ausgabe" }); }
      aus.push(d);
    });
    kind.stderr.on("data", (d) => { if (fehlerText.length < STDERR_MAX) fehlerText += String(d).slice(0, STDERR_MAX - fehlerText.length); });
    kind.stdin.on("error", () => { /* Kind schon beendet (EPIPE): Ausgang zählt */ });
    kind.on("error", () => { toeten(); ende({ art: "fehler", detail: "Start" }); });
    kind.on("close", (code, signal) => {
      aktiv.delete(kind);
      if (fertig) return;
      if (code === 0 && !signal) {
        try {
          return ende({ art: "ergebnis", wert: JSON.parse(Buffer.concat(aus).toString("utf8")) });
        } catch {
          return ende({ art: "fehler", detail: "Ausgabe" });
        }
      }
      /* Exit 70: ulimit ließ sich nicht setzen → kein Lauf ohne Limit, sondern Fehler (fail closed). */
      if (code !== 70 && (SPEICHER_RE.test(fehlerText) || (signal === "SIGKILL" && !getoetet))) return ende({ art: "speicher" });
      return ende({ art: "fehler", detail: signal || String(code) });
    });
    const kopfBytes = Buffer.from(JSON.stringify(kopf ?? {}), "utf8");
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(kopfBytes.length, 0);
    kind.stdin.write(laenge);
    kind.stdin.write(kopfBytes);
    kind.stdin.end(daten && daten.length ? daten : undefined);
  });
}
