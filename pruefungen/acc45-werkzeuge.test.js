/* ==========================================================================
   ACC45-WERKZEUGE — Backlog-Unterbefehle, Vorprüfung, test-kurz

   werkzeug/acc45-backlog.mjs   bereit, brief, fortschritt, lokale Felder
   werkzeug/vorpruefung.mjs     Umfang, Tests, eslint, Geheimnisse, Exit-Code
   werkzeug/test-kurz.mjs       Zusammenfassung, Exit-Code genau, Sperre
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

vi.setConfig({ testTimeout: 60000 });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let tmp, BL, VP, TK;
const sammeln = () => { const z = []; return { say: (s) => z.push(s), text: () => z.join("\n") }; };

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "centric-acc45-werkzeuge-"));
  BL = await import("../werkzeug/acc45-backlog.mjs");
  VP = await import("../werkzeug/vorpruefung.mjs");
  TK = await import("../werkzeug/test-kurz.mjs");
});
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });

describe("acc45-backlog: bereit, brief, fortschritt", () => {
  const P = (id, status, abh = []) => [id, `Paket ${id}`, "P1", 1, abh, "B", status, "Akz", "Tests", "werkzeug/x.mjs"];

  it("bereit: READY/BLOCKED mit erledigten Abhängigkeiten; WP-09 zählt nicht als Code-Abhängigkeit", () => {
    const pakete = BL.paketeAus([P("WP-09", "IN_PROGRESS"), P("WP-01", "INTEGRATED"), P("WP-02", "IN_PROGRESS"),
      P("WP-03", "VERIFIED"), P("WP-10", "READY", ["WP-01", "WP-03"]), P("WP-11", "BLOCKED", ["WP-09"]),
      P("WP-12", "READY", ["WP-02"]), P("WP-13", "IN_PROGRESS", ["WP-01"]), P("WP-14", "BLOCKED", ["WP-09", "WP-02"])]);
    expect(BL.bereit(pakete).map((p) => p.id)).toEqual(["WP-10", "WP-11"]);
  });

  it("bereit auf dem echten Backlog: WP-23 (auf WP-43 umgestellt) ja, WP-07 nein", () => {
    const ids = BL.bereit(BL.paketeAus()).map((p) => p.id);
    expect(ids).toContain("WP-23");
    expect(ids).not.toContain("WP-07");
  });

  it("brief: Auftrag mit Feldern, Standardregeln und Vorab-Checkliste; unbekannt → Rückgabe 2", () => {
    const text = BL.brief(BL.paketeAus(), "WP-23");
    for (const teil of ["Auftrag WP-23", "Akzeptanz:", "Tests:", "Dateien:", "Branch:", "Abhängigkeiten: WP-43",
      "Regeln:", "Vorab-Checkliste:", "Öffentliches Repo", "rot auf dem alten Stand"]) expect(text).toContain(teil);
    const s = sammeln();
    expect(BL.main(["brief", "WP-99"], s.say)).toBe(2);
  });

  it("fortschritt: Zählung, kritischer Pfad, laufend, bereit", () => {
    const s = sammeln();
    expect(BL.main(["fortschritt"], s.say)).toBe(0);
    expect(s.text()).toMatch(/^Pakete \d+: /);
    expect(s.text()).toMatch(/kritischer Pfad/);
    expect(s.text()).toMatch(/Bereit: .*WP-23/);
  });

  it("lokale Felder: nie im öffentlichen JSON, Datei nur außerhalb des Repos", async () => {
    expect(() => BL.lokalerPfad(path.join(REPO, "docs", "lokal.json"))).toThrow(/ins Repo/);
    const datei = path.join(tmp, "acc45-lokal.json");
    BL.lokalSetzen("WP-23", { agentId: "agent-x", letzterCheckpoint: "abc123" }, BL.lokalerPfad(datei));
    expect(() => BL.lokalSetzen("WP-23", { geheim: "1" }, datei)).toThrow(/Unbekanntes lokales Feld/);
    expect(BL.fortschritt(BL.paketeAus(), BL.lokalLesen(datei))).toMatch(/WP-23 \[agentId=agent-x, letzterCheckpoint=abc123\]/);
    /* Öffentliches JSON in einen Wegwerf-Ordner geschrieben: keine lokalen Felder. */
    const ziel = path.join(tmp, "oeffentlich");
    await mkdir(ziel);
    BL.schreiben(BL.paketeAus(), ziel, "2026-11-03");
    const json = await readFile(path.join(ziel, "work-packages.json"), "utf8");
    for (const f of BL.LOKALE_FELDER) expect(json).not.toContain(`"${f}"`);
    expect(json).not.toContain("agent-x");
    const mitLokal = BL.paketeAus().map((p) => (p.id === "WP-23" ? { ...p, agentId: "x" } : p));
    expect(() => BL.schreiben(mitLokal, ziel)).toThrow(/lokales Feld agentId/);
  });

  it("das erzeugte JSON im Repo enthält keine lokalen Felder", async () => {
    const json = await readFile(path.join(REPO, "docs", "acc45", "work-packages.json"), "utf8");
    for (const f of BL.LOKALE_FELDER) expect(json).not.toContain(`"${f}"`);
  });
});

describe("vorpruefung: harte Verstöße und Warnungen, Exit-Code", () => {
  let repo;
  const git = (...a) => {
    const r = spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout;
  };
  const lauf = async (...argv) => { const s = sammeln(); const code = await VP.main(argv, s.say, { cwd: repo }); return { code, aus: s.text() }; };

  beforeAll(async () => {
    repo = path.join(tmp, "repo");
    await mkdir(path.join(repo, "server"), { recursive: true });
    git("init", "-q");
    git("config", "user.email", "pruefung@example.org");
    git("config", "user.name", "Pruefung");
    await writeFile(path.join(repo, "server", "a.mjs"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "basis");
    git("branch", "basis");
  });

  it("Code ohne Test → Rückgabe 1; mit Test → 0; Checkliste immer", async () => {
    await writeFile(path.join(repo, "server", "a.mjs"), "export const a = 2;\n");
    const ohne = await lauf("--basis", "basis", "--ohne-lint");
    expect(ohne.code, ohne.aus).toBe(1);
    expect(ohne.aus).toMatch(/kein Test neu oder geändert/);
    expect(ohne.aus).toMatch(/Fail-closed/);
    await mkdir(path.join(repo, "pruefungen"), { recursive: true });
    await writeFile(path.join(repo, "pruefungen", "a.test.js"), "// Test\n");
    const mit = await lauf("--basis", "basis", "--ohne-lint");
    expect(mit.code, mit.aus).toBe(0);
    expect(mit.aus).toMatch(/Keine harten Verstöße/);
  });

  it("Geheimnis in einer hinzugefügten Zeile und eine .env-Datei → Rückgabe 1", async () => {
    const kopf = "-----BEGIN " + "RSA PRIVATE KEY-----";
    await writeFile(path.join(repo, "server", "b.mjs"), `export const k = "${kopf}";\n`);
    const r = await lauf("--basis", "basis", "--ohne-lint");
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/privater Schlüssel/);
    await rm(path.join(repo, "server", "b.mjs"));
    await writeFile(path.join(repo, ".env"), "X=1\n");
    const e = await lauf("--basis", "basis", "--ohne-lint");
    expect(e.code).toBe(1);
    expect(e.aus).toMatch(/Umgebungsdatei/);
    await rm(path.join(repo, ".env"));
  });

  it("eslint-Fehler in geänderten Dateien → Rückgabe 1 (eslint als Stub)", async () => {
    await mkdir(path.join(repo, "node_modules", "eslint", "bin"), { recursive: true });
    await writeFile(path.join(repo, "node_modules", "eslint", "bin", "eslint.js"),
      "console.log('server/a.mjs: 1 error'); process.exit(1);\n");
    const r = await lauf("--basis", "basis");
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/eslint meldet Fehler/);
    await rm(path.join(repo, "node_modules"), { recursive: true, force: true });
  });

  it("Dateien außerhalb des Paketfeldes → nur Warnung; der Kommandozeilenaufruf behält den Rückgabewert", async () => {
    const r = await lauf("--basis", "basis", "--ohne-lint", "--paket", "WP-23");
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/WARNUNG: Außerhalb des Feldes „dateien“ von WP-23 .*server\/a\.mjs/);
    await rm(path.join(repo, "pruefungen"), { recursive: true, force: true });
    const cli = spawnSync(process.execPath, [path.join(REPO, "werkzeug", "vorpruefung.mjs"), "--basis", "basis", "--ohne-lint"],
      { cwd: repo, encoding: "utf8" });
    expect(cli.status, cli.stdout + cli.stderr).toBe(1);
    const falsch = spawnSync(process.execPath, [path.join(REPO, "werkzeug", "vorpruefung.mjs"), "--basis", "gibt-es-nicht"],
      { cwd: repo, encoding: "utf8" });
    expect(falsch.status).toBe(2);
  });
});

describe("test-kurz: Zusammenfassung, Exit-Code genau, Sperre", () => {
  const kurzLauf = (args, env = {}) => spawnSync(process.execPath, [path.join(REPO, "werkzeug", "test-kurz.mjs"), ...args],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, ...env } });

  it("kuerzen: nur Zusammenfassung und Fehlschläge; ohne Treffer bei Fehler die letzten Zeilen", () => {
    const aus = "rauschen\n ✓ a.test.js (3)\n × b.test.js > fällt\nAssertionError: expected 1 to be 2\n Tests  1 failed | 3 passed\nnoch mehr";
    expect(TK.kuerzen(aus)).toEqual([" ✓ a.test.js (3)", " × b.test.js > fällt", "AssertionError: expected 1 to be 2",
      " Tests  1 failed | 3 passed"]);
    expect(TK.kuerzen("eins\nzwei", { code: 3 })).toEqual(["eins", "zwei"]);
    expect(TK.kuerzen("eins\nzwei", { code: 0 })).toEqual([]);
  });

  for (const code of [0, 1, 3, 42]) {
    it(`behält den Rückgabewert ${code} genau (Kommandozeile)`, () => {
      const r = kurzLauf(["--", "node", "-e", `console.log('Tests  1 passed'); console.log('weg'); process.exit(${code})`]);
      expect(r.status, r.stdout + r.stderr).toBe(code);
      expect(r.stdout).toContain("Tests  1 passed");
      expect(r.stdout).not.toContain("weg");
      expect(r.stdout).toContain(`[test-kurz] Rückgabe ${code}`);
    });
  }

  it("ohne Befehl → Rückgabe 2", () => {
    expect(kurzLauf([]).status).toBe(2);
  });

  it("Sperre belegt (lebender Prozess): wartet bis zur Zeitgrenze, läuft dann trotzdem; fremde Sperre bleibt", async () => {
    const datei = path.join(tmp, "belegt.sperre");
    const fremd = JSON.stringify({ pid: process.pid, start: new Date().toISOString(), cwd: "anderer-worktree" });
    await writeFile(datei, fremd);
    const r = kurzLauf(["--sperre", "--warten", "1", "--", "node", "-e", "process.exit(4)"], { TEST_KURZ_SPERRE: datei });
    expect(r.status).toBe(4);
    expect(r.stdout).toMatch(/Warte auf laufenden Testlauf/);
    expect(r.stdout).toMatch(/HINWEIS: .*noch belegt — läuft trotzdem/);
    expect(await readFile(datei, "utf8")).toBe(fremd);
  });

  it("verwaiste Sperre (toter Prozess) wird übernommen und nach dem Lauf freigegeben", async () => {
    const datei = path.join(tmp, "verwaist.sperre");
    const tot = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
    await writeFile(datei, JSON.stringify({ pid: Number(tot.stdout.trim()), start: "2026-01-01T00:00:00Z" }));
    const r = kurzLauf(["--sperre", "--warten", "5", "--", "node", "-e", "process.exit(0)"], { TEST_KURZ_SPERRE: datei });
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).not.toMatch(/HINWEIS/);
    expect(existsSync(datei)).toBe(false);
  });

  it("Sperre nicht möglich (Ordner fehlt): läuft trotzdem, mit Hinweis, Rückgabe erhalten", () => {
    const r = kurzLauf(["--sperre", "--", "node", "-e", "process.exit(6)"],
      { TEST_KURZ_SPERRE: path.join(tmp, "gibt", "es", "nicht", "x.sperre") });
    expect(r.status).toBe(6);
    expect(r.stdout).toMatch(/HINWEIS: Sperre nicht möglich/);
  });
});
