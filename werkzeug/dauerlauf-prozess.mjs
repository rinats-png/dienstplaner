/* ==========================================================================
   DAUERLAUF-PROZESS — austauschbarer Prozess-Adapter für Worker des Dauerlaufs (NICHT aktiviert).

   Schließt Lücke 3/7 aus docs/acc45/AUTONOMIE-ARCHITEKTUR.md:
     - Startpfad robust: Befehl wird selbst über PATH aufgelöst (Windows: .exe vor .cmd/.bat vor .ps1;
       eine Datei ohne Endung, etwa das Git-Bash-Skript `claude`, wird unter Windows nie gestartet).
       .cmd/.bat laufen über cmd.exe /d /s /c mit wörtlichen Argumenten, aber NUR, wenn jedes Argument
       und der Pfad keine Shell-Sonderzeichen enthalten (sonst kein Start). Kein shell:true sonst.
     - Startfehler werfen nie: `starten` liefert { ok:false, grund }, ein `error`-Listener fängt
       asynchrone Fehler (ENOENT u. a.). Der Supervisor zählt das als Fehlversuch.
     - Prozessbaum beenden: Windows `taskkill /PID n /T /F`, sonst Signal an die Prozessgruppe (-pid),
       weil der Worker mit detached:true eine eigene Gruppe/Sitzung bekommt.
     - PID-Wiederverwendung: Beim Start werden Startzeit und ein Kommandozeilen-Merkmal gespeichert.
       `status` und `beenden` vergleichen beides; passt es nicht, gilt der Prozess als fremd und wird
       NIE beendet. Ist die Identität unklar (Abfrage scheitert), wird ebenfalls nicht beendet.
     - Prompt über stdin (Pipe, danach geschlossen), nicht über `-p @datei`.
     - Losgelöst gestartet wird nur der Zwischenprozess dauerlauf-starter.mjs; er startet den Befehl mit
       verborgener Konsole, damit stdin/Ausgabe auch durch cmd.exe ankommen, und schreibt den Exit-Code.
   ========================================================================== */
import { spawn, execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENDUNGEN_WIN = [".exe", ".cmd", ".bat", ".ps1"];
/* Systemprogramme unter Windows mit festem Pfad (keine PATH-Suche, kein Arbeitsverzeichnis). */
const SYSTEM32 = path.win32.join(process.env.SystemRoot || process.env.windir || "C:\\Windows", "System32");
export const WIN_PROGRAMME = Object.freeze({
  powershell: path.win32.join(SYSTEM32, "WindowsPowerShell", "v1.0", "powershell.exe"),
  taskkill: path.win32.join(SYSTEM32, "taskkill.exe"),
  cmd: path.win32.join(SYSTEM32, "cmd.exe"),
});
let gitAbsolut = null;
/** Absolute Auflösung eines Befehls über den PATH: relative PATH-Einträge (".", "bin", leer) werden übersprungen, weil
    sie im Arbeitsverzeichnis suchen; das Ergebnis wird zusätzlich auf path.isAbsolute geprüft. { datei, art } oder null. */
export function loeseAbsolut(name, opt = {}) {
  const plattform = opt.plattform ?? process.platform;
  const pp = plattform === "win32" ? path.win32 : path.posix;
  const trenner = plattform === "win32" ? ";" : ":";
  const roh = opt.pfad ?? process.env.PATH ?? process.env.Path ?? "";
  const pfad = String(roh).split(trenner).map((d) => d.replace(/^"|"$/g, "")).filter((d) => d && pp.isAbsolute(d)).join(trenner);
  if (!pp.isAbsolute(name) && !pfad) return null;
  const a = loeseBefehl(name, { ...opt, plattform, pfad });
  return a && pp.isAbsolute(a.datei) ? a : null;
}
/** Absoluter Pfad zu git aus dem PATH des Supervisors (nie aus einem Arbeitsverzeichnis). Ohne absoluten Fund kein
    Rückfall auf den bloßen Namen "git" (der würde wieder über PATH/Arbeitsverzeichnis gesucht): Fehler (fail-closed). */
export function gitPfad(opt) {
  if (opt) {
    const a = loeseAbsolut("git", opt);
    if (!a) throw new Error("git nicht mit absolutem Pfad im PATH gefunden");
    return a.datei;
  }
  if (gitAbsolut === null) gitAbsolut = gitPfad({});
  return gitAbsolut;
}
const art = (datei) => {
  const e = path.extname(datei).toLowerCase();
  return { ".exe": "exe", ".cmd": "cmd", ".bat": "cmd", ".ps1": "ps1" }[e] || "bin";
};

/** Löst einen Befehl zu einer ausführbaren Datei auf. Reine Funktion; Dateisystem und PATH injiziert.
    Liefert { datei, art } oder null. Absolute Pfade werden nur auf Existenz geprüft. */
export function loeseBefehl(name, { plattform = process.platform, pfad = process.env.PATH ?? process.env.Path ?? "", existiert = existsSync } = {}) {
  const pp = plattform === "win32" ? path.win32 : path.posix;
  if (typeof name !== "string" || !name) return null;
  if (pp.isAbsolute(name)) {
    if (!existiert(name)) return null;
    const a = art(name);
    if (plattform === "win32" && a === "bin") return null; // ohne Endung unter Windows nicht startbar
    return { datei: name, art: a };
  }
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(name)) return null;
  const endungen = plattform === "win32" ? ENDUNGEN_WIN : [""];
  for (const dir of String(pfad).split(plattform === "win32" ? ";" : ":").filter(Boolean)) {
    for (const ext of endungen) {
      const f = pp.join(dir.replace(/^"|"$/g, ""), name + ext);
      if (existiert(f)) return { datei: f, art: plattform === "win32" ? art(f) : "bin" };
    }
  }
  return null;
}

/** Erlaubte Zeichen für Argumente, die durch cmd.exe oder PowerShell gehen (keine Leerzeichen, keine Sonderzeichen). */
export const SICHERES_ARGUMENT = /^[A-Za-z0-9_.,:=@+/\\-]{1,200}$/;

/** Startplan für eine Auflösung. Reine Funktion. .cmd/.bat nur mit geprüften Argumenten über cmd.exe. */
export function startPlan(aufloesung, args, { comspec = WIN_PROGRAMME.cmd } = {}) {
  if (!aufloesung) return { ok: false, grund: "Befehl nicht gefunden (PATH)" };
  const { datei } = aufloesung;
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) return { ok: false, grund: "Argumente ungültig" };
  if (aufloesung.art === "cmd" || aufloesung.art === "ps1") {
    if (/["%!^&|<>\r\n`$;]/.test(datei)) return { ok: false, grund: "Pfad enthält Shell-Sonderzeichen" };
    const schlecht = args.find((a) => !SICHERES_ARGUMENT.test(a));
    if (schlecht !== undefined) return { ok: false, grund: `Argument nicht shell-sicher: ${JSON.stringify(schlecht)}` };
    if (aufloesung.art === "ps1") return { ok: true, datei: WIN_PROGRAMME.powershell, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", datei, ...args], optionen: {} };
    return { ok: true, datei: comspec, args: ["/d", "/s", "/c", `""${datei}" ${args.join(" ")}"`], optionen: { windowsVerbatimArguments: true } };
  }
  return { ok: true, datei, args: [...args], optionen: {} };
}

/** Prüft, dass jede lange Option des Befehls in der lokalen Hilfe (`claude --help`) vorkommt. Reine Funktion. */
export function optionenPruefen(hilfe, args) {
  const fehlend = args.filter((a) => /^--[a-z]/.test(a)).filter((o) => !new RegExp(`(^|[\\s,])${o.replace(/[-]/g, "\\-")}([\\s,=<]|$)`, "m").test(hilfe));
  return { ok: fehlend.length === 0, fehlend };
}

/** Identität eines laufenden Prozesses: { lebt, startzeit, kommandozeile }. startzeit null = unbekannt. */
export function prozessInfo(pid, { plattform = process.platform, ausfuehren = execFileSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return { lebt: false };
  try { process.kill(pid, 0); } catch (e) { if (e?.code !== "EPERM") return { lebt: false }; }
  try {
    if (plattform === "win32") {
      const ps = `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { $p.CreationDate.ToUniversalTime().ToString('o'); $p.CommandLine }`;
      const out = String(ausfuehren(WIN_PROGRAMME.powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", timeout: 90000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }));
      const [z, ...rest] = out.split(/\r?\n/);
      if (!z || !z.trim()) return { lebt: false };
      const t = Date.parse(z.trim());
      return { lebt: true, startzeit: Number.isFinite(t) ? new Date(t).toISOString() : null, kommandozeile: rest.join(" ").trim() };
    }
    if (plattform === "linux" && existsSync(`/proc/${pid}/stat`)) {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const felder = stat.slice(stat.lastIndexOf(")") + 2).split(" "); // ab Feld 3 (state)
      if (felder[0] === "Z") return { lebt: false };
      const kommandozeile = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").trim();
      return { lebt: true, startzeit: `boot+${felder[19]}`, kommandozeile };
    }
    const out = String(ausfuehren("ps", ["-o", "stat=", "-o", "lstart=", "-o", "args=", "-p", String(pid)], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] })).trim();
    if (!out) return { lebt: false };
    const [stat, ...r] = out.split(/\s+/);
    if (stat.startsWith("Z")) return { lebt: false };
    return { lebt: true, startzeit: r.slice(0, 5).join(" "), kommandozeile: r.slice(5).join(" ") };
  } catch { return { lebt: true, startzeit: null, kommandozeile: null }; }
}

/** Gehört der Prozess zum gespeicherten Worker? Nur bei bekannter, gleicher Startzeit UND passendem Merkmal. */
export function istDerselbe(gespeichert, info) {
  if (!info?.lebt || !gespeichert?.startzeit || !info.startzeit) return false;
  if (info.startzeit !== gespeichert.startzeit) return false;
  return !gespeichert.merkmal || String(info.kommandozeile || "").includes(gespeichert.merkmal);
}

/** Beendet den Prozessbaum (Windows taskkill /T /F, sonst SIGKILL an die Gruppe). Wirft nie. */
export function baumBeenden(pid, { plattform = process.platform, ausfuehren = execFileSync, lebtNoch = (p) => {
  if (plattform !== "win32") return prozessInfo(p, { plattform }).lebt; // erkennt Zombies (noch nicht eingesammelte Kinder)
  try { process.kill(p, 0); return true; } catch (e) { return e?.code === "EPERM"; }
} } = {}) {
  /* Der Exit-Code von taskkill ist kein Maß: er ist ungleich 0, wenn Kinder schon mit dem Starter (Job) gestorben sind.
     Entscheidend ist, ob der Prozess danach weg ist (kurz nachgeprüft). */
  try {
    if (plattform === "win32") ausfuehren(WIN_PROGRAMME.taskkill, ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 30000 });
    else { try { process.kill(-pid, "SIGKILL"); } catch { process.kill(pid, "SIGKILL"); } }
  } catch { /* unten nachprüfen */ }
  const warte = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 100; i++) { if (!lebtNoch(pid)) return true; Atomics.wait(warte, 0, 0, 100); }
  return false;
}

export const STARTER = fileURLToPath(new URL("./dauerlauf-starter.mjs", import.meta.url));
export const STARTER_MERKMAL = "dauerlauf-starter.mjs";

/** Exit-Datei des Starters lesen: { exit, fehler? } oder null (läuft noch / unbekannt). */
function exitLesen(datei) {
  try { return datei && existsSync(datei) ? JSON.parse(readFileSync(datei, "utf8")) : null; } catch { return null; }
}

/** Prozess-Adapter. info/beenden injizierbar; in Tests wird er mit echten Attrappen-Prozessen betrieben.
    Gestartet wird losgelöst der Zwischenprozess dauerlauf-starter.mjs (Begründung dort); seine PID, Startzeit und
    sein Kommandozeilen-Merkmal werden gespeichert, beendet wird sein ganzer Baum. */
export function prozessAdapter({ plattform = process.platform, info = (pid) => prozessInfo(pid, { plattform }), baum = (pid) => baumBeenden(pid, { plattform }) } = {}) {
  return {
    /** befehl = { datei, args }; Rückgabe { ok, pid, startzeit, merkmal, exitDatei } oder { ok:false, grund }. Wirft nie. */
    starten({ befehl, cwd, env = process.env, eingabe = "", logDatei }) {
      const plan = startPlan(loeseBefehl(befehl?.datei, { plattform, pfad: env.PATH ?? env.Path ?? "" }), befehl?.args || []);
      if (!plan.ok) return { ok: false, grund: plan.grund };
      const exitDatei = `${logDatei}.exit.json`;
      try { rmSync(exitDatei, { force: true }); closeSync(openSync(logDatei, "a")); } catch (e) { return { ok: false, grund: `Protokolldatei: ${e.message}` }; }
      const roh = Buffer.from(JSON.stringify({ datei: plan.datei, args: plan.args, optionen: plan.optionen, eingabe })).toString("base64url");
      let k;
      try {
        k = spawn(process.execPath, [STARTER, roh, logDatei, exitDatei], { cwd, env, stdio: "ignore", detached: true, windowsHide: true });
      } catch (e) { return { ok: false, grund: `Start fehlgeschlagen: ${e.message}` }; }
      k.on("error", () => { /* zeigt sich als fehlender Prozess im Status */ });
      if (!k.pid) return { ok: false, grund: "Start fehlgeschlagen (keine PID)" };
      k.unref();
      const i = info(k.pid);
      /* Schon regulär beendet (sehr kurzer Lauf): Exit-Datei liegt vor, nichts mehr zu identifizieren. */
      if (!i.lebt && exitLesen(exitDatei)) return { ok: true, pid: k.pid, startzeit: null, merkmal: STARTER_MERKMAL, exitDatei };
      if (!i.lebt) return { ok: false, grund: "Starter sofort beendet ohne Exit-Datei" };
      if (!i.startzeit) {
        /* Ohne bekannte Startzeit könnte der Prozess später weder sicher erkannt noch sicher beendet werden: sofort
           über das eigene Handle (PID kann noch nicht wiederverwendet sein) beenden und als Startfehler melden. */
        baum(k.pid);
        try { k.kill("SIGKILL"); } catch { /* schon weg */ }
        return { ok: false, grund: "Startzeit des Workers nicht ermittelbar: sofort beendet" };
      }
      return { ok: true, pid: k.pid, startzeit: i.startzeit, merkmal: STARTER_MERKMAL, exitDatei };
    },
    /** { laeuft, ergebnis?, grund? } — ein fremder Prozess unter gleicher PID gilt als beendeter Worker. */
    status(laufend) {
      const e = exitLesen(laufend.exitDatei);
      const i = info(laufend.pid);
      if (e) {
        /* Die Exit-Datei ist fälschbar: Lebt der Starter mit gleicher Identität noch, wird er beendet und dem Exit-Code
           nicht vertraut; ist die Identität unklar, gilt er als laufend. */
        if (!i.lebt || (i.startzeit && laufend.startzeit && !istDerselbe(laufend, i))) return { laeuft: false, ergebnis: { exit: e.exit ?? null }, grund: e.fehler };
        if (istDerselbe(laufend, i) && baum(laufend.pid)) return { laeuft: false, ergebnis: { exit: null }, grund: "Exit-Datei vorhanden, Starter lebte noch: beendet, Exit-Code nicht vertraut" };
        return { laeuft: true, grund: "Exit-Datei vorhanden, Starter lebt (Identität unklar oder Beenden gescheitert)" };
      }
      if (!i.lebt) return { laeuft: false, ergebnis: { exit: null } };
      if (i.startzeit && laufend.startzeit && !istDerselbe(laufend, i)) return { laeuft: false, ergebnis: { exit: null }, grund: "PID wiederverwendet (anderer Prozess)" };
      return { laeuft: true };
    },
    /** Beendet nur, wenn Startzeit und Merkmal passen. { beendet, grund } */
    beenden(laufend) {
      const i = info(laufend.pid);
      if (!i.lebt) return { beendet: true, grund: "lief nicht mehr" };
      if (i.startzeit && laufend.startzeit && !istDerselbe(laufend, i)) return { beendet: true, fremd: true, grund: "PID gehört einem anderen Prozess: Worker war schon beendet, fremder Prozess nicht angetastet" };
      if (!istDerselbe(laufend, i)) return { beendet: false, grund: "Identität unklar: nicht beendet" };
      return baum(laufend.pid) ? { beendet: true, grund: "Prozessbaum beendet" } : { beendet: false, grund: "Beenden fehlgeschlagen" };
    },
  };
}
