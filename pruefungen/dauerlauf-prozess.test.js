// zeit-ok: Prozess- und Wiederanlauftests mit ECHTEN Kindprozessen und echtem Git (Bare-Remote). Die Lease-Logik
// läuft über eine injizierte Uhr (Uhrdatei), die Wanduhr dient nur als Startpunkt und für Wartezeiten beim Pollen;
// der Fencing-Push des Workers nutzt bewusst die echte Uhr (wie im Betrieb).
//
// Isoliert: lokales Bare-Remote (KOORD_REMOTE), Attrappen-Worker (node-Skript mit Kindeskind), temporäre
// Verzeichnisse. Kein echtes Remote, kein claude-Aufruf, keine globale Konfiguration.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prozessAdapter, prozessInfo, baumBeenden } from "../werkzeug/dauerlauf-prozess.mjs";
import { richteWorkerKopieEin, pruefeWorkerKopie } from "../werkzeug/dauerlauf-schutz.mjs";
import { entscheide, leaseCommit } from "../werkzeug/koordination.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAUERLAUF = path.join(WURZEL, "werkzeug", "dauerlauf.mjs");
const KOORD = path.join(WURZEL, "werkzeug", "koordination.mjs");
const MIN = 60000;
const WIN = process.platform === "win32";
const LEER_BAUM = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const git = (args, cwd, env) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: env ? { ...process.env, ...env } : undefined }).trim();
const gitErgebnis = (args, cwd, env) => { try { return { code: 0, aus: git(args, cwd, env) }; } catch (e) { return { code: e.status ?? 1, aus: `${e.stdout || ""}${e.stderr || ""}` }; } };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
async function warte(bedingung, ms = 30000, text = "Bedingung") {
  const ende = Date.now() + ms;
  for (;;) {
    const r = bedingung();
    if (r) return r;
    if (Date.now() > ende) throw new Error(`Zeitüberschreitung: ${text}`);
    await schlafen(150);
  }
}
const lebt = (pid) => prozessInfo(pid).lebt;
const zeilen = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((z) => JSON.parse(z)) : []);

/** Attrappen-Worker: liest den Auftrag von stdin, startet ein Kindeskind, erzeugt Puls auf stdout,
    pusht auf Wunsch über den Wrapper (koordination.mjs in seiner Arbeitskopie). */
const ATTRAPPE = `import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
const dir = process.env.ATTRAPPE_DIR;
let eingabe = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { eingabe += d; });
process.stdin.on("end", () => writeFileSync(path.join(dir, "prompt-" + process.pid + ".txt"), eingabe));
appendFileSync(path.join(dir, "starts.log"), JSON.stringify({ pid: process.pid, args: process.argv.slice(2), halter: process.env.CENTRIC_KOORD_HALTER ?? null,
  epoche: process.env.CENTRIC_KOORD_EPOCHE ?? null, prompt0: process.env.GIT_TERMINAL_PROMPT ?? null, autonomie: process.env.CENTRIC_AUTONOMIE ?? null, cwd: process.cwd() }) + "\\n");
const enkel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(path.join(dir, "enkel-" + process.pid + ".txt"), String(enkel.pid));
const push = (name) => {
  try {
    const q = execFileSync("git", ["-c", "user.name=w", "-c", "user.email=w@w.invalid", "commit-tree", "${LEER_BAUM}", "-m", name], { encoding: "utf8" }).trim();
    execFileSync(process.execPath, ["werkzeug/koordination.mjs", "push", "--halter", process.env.CENTRIC_KOORD_HALTER, "--epoche", process.env.CENTRIC_KOORD_EPOCHE,
      "--ziel", "refs/heads/work/" + name, "--quelle", q, "--minuten", "20"], { stdio: "pipe" });
    return 0;
  } catch (e) { return e.status ?? 99; }
};
if (process.env.ATTRAPPE_PUSH_BEIM_START) writeFileSync(path.join(dir, "push-start.txt"), String(push("start")));
setInterval(() => {
  process.stdout.write("puls\\n");
  const auftrag = path.join(dir, "pushen.auftrag");
  if (existsSync(auftrag)) { const name = readFileSync(auftrag, "utf8").trim(); unlinkSync(auftrag); writeFileSync(path.join(dir, "push-" + name + ".txt"), String(push(name))); }
}, 200);
`;

let basis;
const offen = []; // Prozesse, die am Ende sicher beendet werden
beforeAll(() => {
  basis = mkdtempSync(path.join(tmpdir(), "dauerlauf-prozess-"));
  writeFileSync(path.join(basis, "attrappe.mjs"), ATTRAPPE);
});
afterAll(() => { for (const pid of offen) if (lebt(pid)) baumBeenden(pid); });

function neuesVerzeichnis(name) { const d = path.join(basis, `${name}-${Math.random().toString(36).slice(2, 8)}`); mkdirSync(d, { recursive: true }); return d; }

describe("Lücke 1: Prozess-Adapter mit echtem Attrappen-Kindprozess", () => {
  it("startet über PATH-Auflösung, übergibt den Auftrag per stdin, beendet den ganzen Prozessbaum (inklusive Kindeskind)", async () => {
    const d = neuesVerzeichnis("adapter");
    const adapter = prozessAdapter();
    const r = adapter.starten({ befehl: { datei: process.execPath, args: [path.join(basis, "attrappe.mjs"), "--probe"] }, cwd: d, env: { ...process.env, ATTRAPPE_DIR: d }, eingabe: "Auftrag über stdin\n", logDatei: path.join(d, "w.log") });
    expect(r).toMatchObject({ ok: true, merkmal: "dauerlauf-starter.mjs" });
    offen.push(r.pid);
    expect(r.startzeit).toBeTruthy();
    const start = await warte(() => zeilen(path.join(d, "starts.log"))[0], 30000, "Worker gestartet");
    offen.push(start.pid);
    expect(start.args).toEqual(["--probe"]);
    const enkelDatei = path.join(d, `enkel-${start.pid}.txt`);
    const enkel = Number(await warte(() => existsSync(enkelDatei) && readFileSync(enkelDatei, "utf8"), 30000, "Kindeskind"));
    offen.push(enkel);
    expect(await warte(() => existsSync(path.join(d, `prompt-${start.pid}.txt`)) && readFileSync(path.join(d, `prompt-${start.pid}.txt`), "utf8"), 30000, "Auftrag")).toBe("Auftrag über stdin\n");
    await warte(() => existsSync(path.join(d, "w.log")) && readFileSync(path.join(d, "w.log"), "utf8").includes("puls"), 30000, "Puls im Log");
    expect(adapter.status(r)).toMatchObject({ laeuft: true });
    expect(lebt(enkel)).toBe(true);
    expect(adapter.beenden(r)).toMatchObject({ beendet: true });
    await warte(() => !lebt(r.pid) && !lebt(start.pid) && !lebt(enkel), 30000, "Prozessbaum beendet");
    expect(adapter.status(r).laeuft).toBe(false);
  });

  it("regulär endender Worker: Exit-Code steht in der Exit-Datei (auch für einen neu gestarteten Supervisor lesbar)", async () => {
    const d = neuesVerzeichnis("exit");
    const r = prozessAdapter().starten({ befehl: { datei: process.execPath, args: ["-e", "process.exit(7)"] }, cwd: d, logDatei: path.join(d, "w.log") });
    expect(r.ok).toBe(true);
    offen.push(r.pid);
    const s = await warte(() => { const x = prozessAdapter().status(r); return x.laeuft ? null : x; }, 30000, "Ende");
    expect(s.ergebnis).toEqual({ exit: 7 });
  });

  it("PID-Wiederverwendung: fremder Prozess unter gespeicherter PID wird nicht beendet und gilt nicht als Worker", async () => {
    const fremd = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", detached: !WIN, windowsHide: true });
    offen.push(fremd.pid);
    const info = await warte(() => { const i = prozessInfo(fremd.pid); return i.startzeit ? i : null; }, 30000, "Prozessinfo");
    const adapter = prozessAdapter();
    const alt = { pid: fremd.pid, startzeit: "2001-01-01T00:00:00.000Z", merkmal: "node" }; // gespeicherter Worker von früher
    expect(adapter.status(alt)).toMatchObject({ laeuft: false, grund: expect.stringMatching(/wiederverwendet/) });
    expect(adapter.beenden(alt)).toMatchObject({ beendet: false });
    expect(adapter.beenden({ ...alt, startzeit: info.startzeit, merkmal: "claude-gibt-es-hier-nicht" })).toMatchObject({ beendet: false });
    await schlafen(300);
    expect(lebt(fremd.pid)).toBe(true);
    expect(adapter.beenden({ pid: fremd.pid, startzeit: info.startzeit, merkmal: "setInterval" })).toMatchObject({ beendet: true });
    await warte(() => !lebt(fremd.pid), 30000, "beendet");
  });

  it("Startfehler werfen nie: unbekannter Befehl und nicht ausführbare Datei liefern ok:false oder ein beendetes Ergebnis", async () => {
    const d = neuesVerzeichnis("fehler");
    const adapter = prozessAdapter();
    expect(adapter.starten({ befehl: { datei: "gibt-es-nicht-xyz", args: [] }, cwd: d, logDatei: path.join(d, "a.log") })).toMatchObject({ ok: false });
    const kaputt = path.join(d, WIN ? "kaputt.exe" : "kaputt");
    writeFileSync(kaputt, "kein Programm");
    const r = adapter.starten({ befehl: { datei: kaputt, args: [] }, cwd: d, logDatei: path.join(d, "b.log") });
    if (r.ok) { offen.push(r.pid); await warte(() => !adapter.status(r).laeuft, 30000, "Startfehler sichtbar"); } else expect(r.grund).toBeTruthy();
  });

  it.runIf(WIN)("Windows: .cmd-Datei wird über cmd.exe gestartet (Argumente geprüft) und als Baum beendet", async () => {
    const d = neuesVerzeichnis("cmd");
    const bin = neuesVerzeichnis("bin");
    writeFileSync(path.join(bin, "attrappe-cl.cmd"), `@echo off\r\n"${process.execPath}" "${path.join(basis, "attrappe.mjs")}" %*\r\n`);
    const adapter = prozessAdapter();
    const env = { ...process.env, PATH: `${bin};${process.env.PATH}`, ATTRAPPE_DIR: d };
    delete env.Path;
    expect(adapter.starten({ befehl: { datei: "attrappe-cl", args: ["-p", "a&calc"] }, cwd: d, env, logDatei: path.join(d, "x.log") })).toMatchObject({ ok: false, grund: expect.stringMatching(/shell-sicher/) });
    const r = adapter.starten({ befehl: { datei: "attrappe-cl", args: ["-p", "--model", "opus"] }, cwd: d, env, eingabe: "per stdin\n", logDatei: path.join(d, "w.log") });
    expect(r.ok).toBe(true);
    offen.push(r.pid);
    const start = await warte(() => zeilen(path.join(d, "starts.log"))[0], 30000, "Start über .cmd");
    offen.push(start.pid);
    expect(start.args).toEqual(["-p", "--model", "opus"]);
    const enkel = Number(await warte(() => existsSync(path.join(d, `enkel-${start.pid}.txt`)) && readFileSync(path.join(d, `enkel-${start.pid}.txt`), "utf8")));
    expect(await warte(() => existsSync(path.join(d, `prompt-${start.pid}.txt`)) && readFileSync(path.join(d, `prompt-${start.pid}.txt`), "utf8"), 30000, "Auftrag über stdin durch cmd.exe")).toBe("per stdin\n");
    await warte(() => existsSync(path.join(d, "w.log")) && readFileSync(path.join(d, "w.log"), "utf8").includes("puls"), 30000, "Ausgabe durch cmd.exe im Log");
    expect(adapter.beenden(r)).toMatchObject({ beendet: true });
    await warte(() => !lebt(r.pid) && !lebt(start.pid) && !lebt(enkel), 30000, "cmd-Baum beendet");
  });
});

/** Bare-Remote mit Integrationszweig samt SSOT (ein freigegebenes Testpaket). */
function bareRemote() {
  const d = neuesVerzeichnis("remote");
  const remote = path.join(d, "remote.git");
  git(["init", "--bare", "-q", remote]);
  const quelle = path.join(d, "quelle");
  git(["init", "-q", quelle]);
  mkdirSync(path.join(quelle, "docs", "acc45"), { recursive: true });
  writeFileSync(path.join(quelle, "docs", "acc45", "work-packages.json"), JSON.stringify({ pakete: [{ id: "WP-T1", titel: "Testpaket", strang: "acc45", prio: "P1", aufwandPT: [1, 2], status: "READY", abhaengigkeiten: [] }] }, null, 2));
  git(["add", "."], quelle);
  git(["-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit", "-q", "-m", "ssot"], quelle);
  git(["push", "-q", remote, "HEAD:refs/heads/integration/release-v4"], quelle);
  return remote;
}
/** Geschützte Worker-Kopie (Klon des Bare-Remotes) mit dem Wrapper koordination.mjs. */
function workerKopie(remote) {
  const kopie = path.join(neuesVerzeichnis("kopie"), "w");
  git(["clone", "-q", remote, kopie]);
  mkdirSync(path.join(kopie, "werkzeug"), { recursive: true });
  copyFileSync(KOORD, path.join(kopie, "werkzeug", "koordination.mjs"));
  return kopie;
}
/** Lease im Bare-Remote setzen (wie `uebernehmen`, echte Uhr). */
function leaseSetzen(remote, halter, jetzt = new Date()) {
  const e = entscheide(null, jetzt, { aktion: "uebernehmen", halter, uebergabe: "Test: Lease für Worker-Schutz", minuten: 20 });
  const c = leaseCommit(null, e.neu, "test");
  git(["push", "-q", remote, `${c}:refs/heads/koordination/lease`], WURZEL);
  return e.neu;
}
const leaseImRemote = (remote) => { const tmp = `refs/koordination/tmp/test-${Math.random().toString(36).slice(2)}`; git(["fetch", "-q", remote, `refs/heads/koordination/lease:${tmp}`, "--force"], WURZEL); try { return JSON.parse(git(["show", `${tmp}:lease.json`], WURZEL)); } finally { git(["update-ref", "-d", tmp], WURZEL); } };
const wrapper = (kopie, remote, args) => { try { execFileSync(process.execPath, ["werkzeug/koordination.mjs", "push", ...args], { cwd: kopie, env: { ...process.env, KOORD_REMOTE: remote }, stdio: "pipe" }); return 0; } catch (e) { return e.status; } };

describe("Lücke 3: Worker darf nur über koordination.mjs push schreiben (lokales Bare-Remote)", () => {
  it("direkter git push scheitert (pushurl gesperrt, pre-push-Hook ohne Marke), Wrapper-Push gelingt nur mit gültiger Epoche", () => {
    const remote = bareRemote();
    const kopie = workerKopie(remote);
    expect(pruefeWorkerKopie(kopie).ok).toBe(false); // ungeschützt erkannt
    expect(richteWorkerKopieEin(kopie)).toEqual({ ok: true, maengel: [] });
    leaseSetzen(remote, "dauerlauf-a");
    const q = git(["-c", "user.name=w", "-c", "user.email=w@w.invalid", "commit-tree", LEER_BAUM, "-m", "arbeit"], kopie);

    const ueberName = gitErgebnis(["push", "origin", `${q}:refs/heads/direkt-1`], kopie);
    expect(ueberName.code).not.toBe(0);
    const ueberUrl = gitErgebnis(["push", remote, `${q}:refs/heads/direkt-2`], kopie);
    expect(ueberUrl.code).not.toBe(0);
    expect(ueberUrl.aus).toMatch(/ABGELEHNT: direkter git push/);
    const gefaelscht = gitErgebnis(["push", remote, `${q}:refs/heads/direkt-3`], kopie, { CENTRIC_PUSH_MARKE: "erfunden" });
    expect(gefaelscht.code).not.toBe(0);
    expect(git(["ls-remote", remote, "refs/heads/direkt-*"])).toBe("");

    expect(wrapper(kopie, remote, ["--halter", "dauerlauf-a", "--epoche", "2", "--ziel", "refs/heads/work/alt", "--quelle", q, "--minuten", "20"])).toBe(3); // falsche Epoche
    expect(wrapper(kopie, remote, ["--halter", "dauerlauf-b", "--epoche", "1", "--ziel", "refs/heads/work/fremd", "--quelle", q, "--minuten", "20"])).toBe(3); // falscher Halter
    expect(git(["ls-remote", remote, "refs/heads/work/*"])).toBe("");
    expect(wrapper(kopie, remote, ["--halter", "dauerlauf-a", "--epoche", "1", "--ziel", "refs/heads/work/ok", "--quelle", q, "--minuten", "20"])).toBe(0);
    expect(git(["ls-remote", remote, "refs/heads/work/ok"])).toMatch(q);
    expect(existsSync(path.resolve(kopie, git(["rev-parse", "--git-path", "centric-push-marke"], kopie)))).toBe(false); // Einmalmarke verbraucht
    /* auch der Wrapper kann nicht auf gesperrte Ziele schreiben */
    expect(wrapper(kopie, remote, ["--halter", "dauerlauf-a", "--epoche", "1", "--ziel", "refs/heads/integration/release-v4", "--quelle", q])).toBe(3);
  });

  it("Grenze (ehrlich): ein Worker mit freier Shell kann den Hook umgehen; der Schutz ist eine Hürde, kein Sicherheitsrand", () => {
    const remote = bareRemote();
    const kopie = workerKopie(remote);
    richteWorkerKopieEin(kopie);
    const q = git(["-c", "user.name=w", "-c", "user.email=w@w.invalid", "commit-tree", LEER_BAUM, "-m", "umgehung"], kopie);
    expect(gitErgebnis(["push", "--no-verify", remote, `${q}:refs/heads/umgehung`], kopie).code).toBe(0);
    git(["config", "--unset", "core.hooksPath"], kopie);
    expect(pruefeWorkerKopie(kopie)).toMatchObject({ ok: false, maengel: [expect.stringMatching(/hooksPath/)] }); // Supervisor startet dann keinen Worker mehr
  });
});

describe("Wiederanlauf in isolierter Umgebung: echter Supervisor-Prozess, harter Abbruch, Neustart, Fencing", () => {
  const LIMITS = ["--limit-starts-tag", "3", "--limit-starts-gesamt", "5", "--limit-laeufe-paket", "3", "--limit-laufzeit-min", "60", "--limit-wall-min-tag", "120"];

  it("scharfer Lauf verweigert ohne Limits, Testworker ohne Bare-Remote und ungeschützte Worker-Kopie", () => {
    const lauf = (args, env) => { try { execFileSync(process.execPath, [DAUERLAUF, "--scharf", "--halter", "dauerlauf-x", ...args], { cwd: WURZEL, env: { ...process.env, CENTRIC_AUTONOMIE: "ja", CENTRIC_AUTONOMIE_DIR: neuesVerzeichnis("verweigert"), ...env }, stdio: "pipe" }); return { code: 0 }; } catch (e) { return { code: e.status, aus: String(e.stderr) }; } };
    expect(lauf([])).toMatchObject({ code: 1, aus: expect.stringMatching(/ohne vollständige Limits/) });
    const ohneRemote = { KOORD_REMOTE: "", CENTRIC_DAUERLAUF_TESTWORKER: path.join(basis, "attrappe.mjs") };
    expect(lauf(LIMITS, ohneRemote)).toMatchObject({ code: 1, aus: expect.stringMatching(/nur mit lokalem Bare-Remote/) });
    const remote = bareRemote();
    expect(lauf([...LIMITS, "--worker-kopie", workerKopie(remote)], { KOORD_REMOTE: remote })).toMatchObject({ code: 1, aus: expect.stringMatching(/nicht geschützt/) });
  });

  it("gleicher Halter mit Zustandsdatei setzt ohne Doppelstart fort; neuer Halter erst nach Ablauf; verwaister Worker scheitert am Fencing", async () => {
    const remote = bareRemote();
    const kopie = workerKopie(remote);
    richteWorkerKopieEin(kopie);
    const adir = neuesVerzeichnis("attrappe");
    const dirA = neuesVerzeichnis("zustand-a");
    const dirB = neuesVerzeichnis("zustand-b");
    const uhrDatei = path.join(basis, `uhr-${Math.random().toString(36).slice(2)}.txt`);
    const T0 = Date.now();
    const uhr = (min) => writeFileSync(uhrDatei, new Date(T0 + min * MIN).toISOString());
    const env = { ...process.env, CENTRIC_AUTONOMIE: "ja", KOORD_REMOTE: remote, CENTRIC_DAUERLAUF_TESTWORKER: path.join(basis, "attrappe.mjs"), CENTRIC_DAUERLAUF_UHRDATEI: uhrDatei, ATTRAPPE_DIR: adir, ATTRAPPE_PUSH_BEIM_START: "1" };
    const supervisor = (dir, halter, zyklen, intervall) => {
      const k = spawn(process.execPath, [DAUERLAUF, "--scharf", "--halter", halter, "--worker-kopie", kopie, "--zyklen", String(zyklen), "--intervall-ms", String(intervall), ...LIMITS], { cwd: WURZEL, env: { ...env, CENTRIC_AUTONOMIE_DIR: dir }, stdio: "ignore", windowsHide: true });
      offen.push(k.pid);
      return { k, ende: new Promise((r) => k.on("exit", (code) => r(code))) };
    };
    const zustand = (dir) => (existsSync(path.join(dir, "zustand.json")) ? JSON.parse(readFileSync(path.join(dir, "zustand.json"), "utf8")) : null);
    const protokoll = (dir) => zeilen(path.join(dir, "protokoll.jsonl"));

    /* 1. Supervisor A übernimmt, startet genau einen Worker (der per Wrapper erfolgreich pusht). */
    uhr(0);
    const a = supervisor(dirA, "dauerlauf-a", 1000, 300);
    const z1 = await warte(() => { const z = zustand(dirA); return z?.laufend?.pid ? z : null; }, 90000, "Worker gestartet");
    offen.push(z1.laufend.pid);
    expect(z1).toMatchObject({ epoche: 1, laufend: { paketId: "WP-T1", merkmal: "dauerlauf-starter.mjs" }, nutzung: { startsTag: 1, startsGesamt: 1 } });
    expect(z1.laufend.startzeit).toBeTruthy();
    expect(z1.laufend.messung).toMatchObject({ paket: { status: "READY" }, prs: null }); // gh im Testmodus aus
    expect(await warte(() => existsSync(path.join(adir, "push-start.txt")) && readFileSync(path.join(adir, "push-start.txt"), "utf8"), 60000, "Start-Push")).toBe("0");
    const w = zeilen(path.join(adir, "starts.log"));
    expect(w).toHaveLength(1);
    const worker = w[0].pid;
    offen.push(worker);
    expect(w[0]).toMatchObject({ halter: "dauerlauf-a", epoche: "1", prompt0: "0", autonomie: null });
    expect(path.resolve(w[0].cwd)).toBe(path.resolve(kopie));
    expect(await warte(() => existsSync(path.join(adir, `prompt-${worker}.txt`)) && readFileSync(path.join(adir, `prompt-${worker}.txt`), "utf8"), 30000, "Auftrag")).toMatch(/Arbeitspaket WP-T1.*koordination\.mjs push --halter dauerlauf-a --epoche 1/s);
    const enkel = Number(readFileSync(path.join(adir, `enkel-${worker}.txt`), "utf8"));
    offen.push(enkel);

    /* 2. Supervisor A wird hart beendet (kein Aufräumen); der Worker lebt weiter. */
    a.k.kill("SIGKILL");
    await a.ende;
    expect(existsSync(path.join(dirA, "sperre.lock"))).toBe(true); // verwaiste Sperre bleibt liegen
    expect(lebt(z1.laufend.pid) && lebt(worker) && lebt(enkel)).toBe(true);

    /* 3. Neustart mit gleichem Halter und Zustandsdatei: setzt fort, kein Doppelstart. */
    uhr(1);
    const a2 = supervisor(dirA, "dauerlauf-a", 3, 100);
    expect(await a2.ende).toBe(0);
    const nachNeustart = protokoll(dirA).filter((p) => Date.parse(p.zeit) >= T0 + MIN);
    expect(nachNeustart.filter((p) => p.aktion).map((p) => p.aktion)).toEqual(["WORKER_LAEUFT", "WORKER_LAEUFT", "WORKER_LAEUFT"]);
    expect(zeilen(path.join(adir, "starts.log"))).toHaveLength(1);
    expect(zustand(dirA).laufend.pid).toBe(z1.laufend.pid);
    expect(leaseImRemote(remote)).toMatchObject({ halter: "dauerlauf-a", epoche: 1 });

    /* 4. Neuer Halter B (Totalausfall, ohne Zustandsdatei): wartet, solange die Lease gilt. */
    const b1 = supervisor(dirB, "dauerlauf-b", 1, 100);
    expect(await b1.ende).toBe(0);
    expect(protokoll(dirB).filter((p) => p.aktion).map((p) => p.aktion)).toEqual(["WARTEN_FREMDE_LEASE"]);
    expect(leaseImRemote(remote)).toMatchObject({ halter: "dauerlauf-a", epoche: 1 });

    /* 5. Nach Ablauf plus Sicherheitszone (injizierte Uhr): B übernimmt mit Epoche 2. */
    uhr(25);
    const b2 = supervisor(dirB, "dauerlauf-b", 1, 100);
    expect(await b2.ende).toBe(0);
    expect(protokoll(dirB).filter((p) => p.aktion).map((p) => p.aktion)).toEqual(["WARTEN_FREMDE_LEASE", "UEBERNEHMEN"]);
    expect(leaseImRemote(remote)).toMatchObject({ halter: "dauerlauf-b", epoche: 2 });

    /* 6. Der verwaiste Worker von A (Epoche 1) versucht zu pushen: scheitert am Fencing, nichts geschrieben. */
    expect(lebt(worker)).toBe(true);
    writeFileSync(path.join(adir, "pushen.auftrag"), "verwaist");
    expect(await warte(() => existsSync(path.join(adir, "push-verwaist.txt")) && readFileSync(path.join(adir, "push-verwaist.txt"), "utf8"), 60000, "Push des verwaisten Workers")).toBe("3");
    expect(git(["ls-remote", remote, "refs/heads/work/verwaist"])).toBe("");
    expect(git(["ls-remote", remote, "refs/heads/work/start"])).not.toBe("");
    expect(leaseImRemote(remote)).toMatchObject({ halter: "dauerlauf-b", epoche: 2 });

    /* 7. Kommt A später wieder, erkennt er das verlorene Schreibrecht und beendet seinen Worker samt Kindeskind. */
    uhr(26);
    const a3 = supervisor(dirA, "dauerlauf-a", 1, 100);
    expect(await a3.ende).toBe(0);
    expect(protokoll(dirA).filter((p) => p.aktion).at(-1)).toMatchObject({ aktion: "WORKER_BEENDEN", grund: expect.stringMatching(/Schreibrecht verloren/) });
    await warte(() => !lebt(z1.laufend.pid) && !lebt(worker) && !lebt(enkel), 30000, "verwaister Worker samt Baum beendet");
    expect(zustand(dirA).laufend).toBeNull();
    expect(zeilen(path.join(adir, "starts.log"))).toHaveLength(1); // insgesamt genau ein Worker-Start
  });
});
