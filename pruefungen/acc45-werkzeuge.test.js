/* ==========================================================================
   ACC45-WERKZEUGE — Backlog-Unterbefehle, Vorprüfung, test-kurz

   werkzeug/acc45-backlog.mjs   bereit, brief, fortschritt, lokale Felder
   werkzeug/vorpruefung.mjs     Umfang, Tests, eslint, Geheimnisse, Exit-Code
   werkzeug/test-kurz.mjs       Zusammenfassung, Exit-Code genau, Sperre,
                                keine Befehlsinjektion unter Windows

   Die Backlog-Prüfungen laufen auf festen Daten, nicht auf dem lebenden
   Backlog — dessen Status ändert sich mit jedem Paket.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, utimes, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
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

/* Feste Daten im Format des Arrays P. */
const P = (id, status, abh = [], dateien = "werkzeug/x.mjs") =>
  [id, `Paket ${id}`, "P1", 1, abh, "B", status, `Akzeptanz ${id}`, `Tests ${id}`, dateien];
const FIXTURE = [P("WP-09", "IN_PROGRESS"), P("WP-01", "INTEGRATED"), P("WP-02", "IN_PROGRESS"),
  P("WP-03", "VERIFIED"), P("WP-10", "READY", ["WP-01", "WP-03"]), P("WP-11", "BLOCKED", ["WP-09"]),
  P("WP-12", "READY", ["WP-02"]), P("WP-13", "IN_PROGRESS", ["WP-01"]), P("WP-14", "BLOCKED", ["WP-09", "WP-02"]),
  P("WP-15", "DONE")];

describe("acc45-backlog: bereit, brief, fortschritt", () => {
  it("bereit: nur READY oder IN_PROGRESS mit erledigten Abhängigkeiten; BLOCKED nie; WP-09 zählt nicht als Code-Abhängigkeit", () => {
    const pakete = BL.paketeAus(FIXTURE);
    /* WP-10 READY, WP-09/02/13 IN_PROGRESS mit erfüllten Abhängigkeiten; WP-12 READY, aber WP-02 noch nicht integriert. */
    expect(BL.bereit(pakete).map((p) => p.id)).toEqual(["WP-09", "WP-02", "WP-10", "WP-13"]);
    expect(BL.bereit(pakete).map((p) => p.id)).not.toContain("WP-11");
    expect(BL.startbereit(pakete).map((p) => p.id)).toEqual(["WP-10"]);
  });

  it("bereit: BLOCKED mit erfüllten Abhängigkeiten steht nur in der Zweitliste; Erledigte und Unerfüllte nirgends", () => {
    const pakete = BL.paketeAus(FIXTURE);
    /* WP-11 BLOCKED, nur WP-09 (Reihenfolge) als Abhängigkeit: erfüllt. WP-14 hängt zusätzlich an WP-02 (IN_PROGRESS): nicht erfüllt. */
    expect(BL.bereitGesperrt(pakete).map((p) => p.id)).toEqual(["WP-11"]);
    const alle = new Set([...BL.bereit(pakete), ...BL.bereitGesperrt(pakete)].map((p) => p.id));
    for (const nein of ["WP-12", "WP-14", "WP-15", "WP-01", "WP-03"]) expect(alle.has(nein)).toBe(false);
    /* Keine Überschneidung der beiden Listen. */
    expect(BL.bereit(pakete).some((p) => p.status === "BLOCKED")).toBe(false);
  });

  it("bereit: externe Pakete nur mit alle; Ausgabe der Befehlszeile mit Zweitliste und Kurzgrund", () => {
    const basis = BL.paketeAus(FIXTURE);
    const e = (id, status) => ({ ...basis.find((p) => p.id === "WP-10"), id, strang: "extern", status, abhaengigkeiten: [], wartezeitAT: { min: 1, max: 1 } });
    const pakete = [...basis, e("E-90", "READY"), e("E-91", "BLOCKED")];
    expect(BL.bereit(pakete).map((p) => p.id)).not.toContain("E-90");
    expect(BL.bereitGesperrt(pakete).map((p) => p.id)).not.toContain("E-91");
    expect(BL.bereit(pakete, { alle: true }).map((p) => p.id)).toContain("E-90");
    expect(BL.bereitGesperrt(pakete, { alle: true }).map((p) => p.id)).toContain("E-91");
    const lang = { id: "X", notiz: `${"Grund ".repeat(80)}` };
    expect(BL.notizKurz(lang).length).toBeLessThanOrEqual(140);
    expect(BL.notizKurz(lang).endsWith("…")).toBe(true);
    expect(BL.notizKurz({ notiz: null })).toBe("–");
    const s = sammeln();
    expect(BL.main(["bereit"], s.say)).toBe(0);
    /* Auf dem lebenden Backlog nur Form prüfen: in der Hauptliste (vor der Leerzeile) steht kein BLOCKED-Paket. */
    const [haupt, zweit = ""] = s.text().split("\n\n");
    expect(haupt).not.toMatch(/ {2}BLOCKED {2}/);
    if (zweit) { expect(zweit).toMatch(/^Abhängigkeiten erfüllt, aber BLOCKED \(Prüfung nötig, \d+\):/); expect(zweit).toMatch(/Grund laut Notiz: /); }
  });

  it("brief: Auftrag mit Feldern, Abhängigkeiten samt Status, Standardregeln und Vorab-Checkliste", () => {
    const text = BL.brief(BL.paketeAus(FIXTURE), "WP-10");
    for (const teil of ["Auftrag WP-10: Paket WP-10", "Akzeptanz: Akzeptanz WP-10", "Tests: Tests WP-10",
      "Dateien: werkzeug/x.mjs", "Branch: acc45/", "Abhängigkeiten: WP-01 (INTEGRATED), WP-03 (VERIFIED)",
      "Regeln:", "Vorab-Checkliste:", "Öffentliches Repo", "rot auf dem alten Stand"]) expect(text).toContain(teil);
    expect(BL.brief(BL.paketeAus(FIXTURE), "WP-99")).toBeNull();
    expect(BL.main(["brief", "WP-99"], sammeln().say)).toBe(2);
    expect(BL.main(["unbekannt"], sammeln().say)).toBe(2);
  });

  it("fortschritt: Zählung, kritischer Pfad, laufend, bereit — mit lokalen Feldern, falls vorhanden", () => {
    const text = BL.fortschritt(BL.paketeAus(FIXTURE), { "WP-10": { agentId: "agent-x" } });
    expect(text).toMatch(/^Pakete 10: /);
    expect(text).toMatch(/kritischer Pfad/);
    expect(text).toMatch(/In Arbeit\/Review: WP-09 IN_PROGRESS; WP-02 IN_PROGRESS; WP-13 IN_PROGRESS/);
    expect(text).toMatch(/Bereit: WP-10 \[agentId=agent-x\]$/m);
    expect(BL.main(["fortschritt"], sammeln().say)).toBe(0);
  });

  it("lokale Felder: nie im öffentlichen JSON, Datei nur außerhalb des Repos (auch nicht über einen Link)", async () => {
    expect(() => BL.lokalerPfad(path.join(REPO, "docs", "lokal.json"))).toThrow(/ins Repo/);
    expect(() => BL.lokalerPfad(path.join(REPO, "gibt", "es", "nicht", "lokal.json"))).toThrow(/ins Repo/);
    /* Ein Link außerhalb des Repos, der ins Repo zeigt (Junction unter Windows). */
    const link = path.join(tmp, "link-ins-repo");
    await symlink(path.join(REPO, "docs"), link, "junction");
    expect(() => BL.lokalerPfad(path.join(link, "lokal.json"))).toThrow(/ins Repo/);
    const datei = path.join(tmp, "acc45-lokal.json");
    BL.lokalSetzen("WP-10", { agentId: "agent-x", letzterCheckpoint: "abc123" }, BL.lokalerPfad(datei));
    expect(() => BL.lokalSetzen("WP-10", { geheim: "1" }, datei)).toThrow(/Unbekanntes lokales Feld/);
    expect(BL.fortschritt(BL.paketeAus(FIXTURE), BL.lokalLesen(datei))).toMatch(/WP-10 \[agentId=agent-x, letzterCheckpoint=abc123\]/);
    const ziel = path.join(tmp, "oeffentlich");
    await mkdir(ziel);
    BL.schreiben(BL.paketeAus(FIXTURE), ziel, "2026-11-03");
    const json = await readFile(path.join(ziel, "work-packages.json"), "utf8");
    for (const f of BL.LOKALE_FELDER) expect(json).not.toContain(`"${f}"`);
    expect(json).not.toContain("agent-x");
    const mitLokal = BL.paketeAus(FIXTURE).map((p) => (p.id === "WP-10" ? { ...p, agentId: "x" } : p));
    expect(() => BL.schreiben(mitLokal, ziel)).toThrow(/lokales Feld agentId/);
  });

  it("das erzeugte JSON im Repo enthält keine lokalen Felder", async () => {
    const json = await readFile(path.join(REPO, "docs", "acc45", "work-packages.json"), "utf8");
    for (const f of BL.LOKALE_FELDER) expect(json).not.toContain(`"${f}"`);
  });
});

describe("naechstes-paket: die ersten ausführbaren Pakete, nur lesend", () => {
  let NP;
  beforeAll(async () => { NP = await import("../werkzeug/naechstes-paket.mjs"); });
  /* Feste Daten: Rang nach Priorität, dann offenem Aufwand, dann ID; nur READY/IN_PROGRESS mit erfüllten Abhängigkeiten. */
  const basis = () => BL.paketeAus(FIXTURE);
  const mit = (id, teil) => (liste) => liste.map((p) => (p.id === id ? { ...p, ...teil } : p));
  const bau = () => [
    mit("WP-10", { prio: "P2", aufwandPT: { min: 1, max: 1 } }),
    mit("WP-13", { prio: "P0", aufwandPT: { min: 4, max: 4 }, konfliktzonen: ["App.jsx"], notiz: "Rest laut Plan" }),
    mit("WP-02", { prio: "P1", aufwandPT: { min: 2, max: 2 } }),
    mit("WP-09", { prio: "P1", aufwandPT: { min: 2, max: 2 } }),
  ].reduce((l, f) => f(l), basis());

  it("Rang: P0 vor P1 vor P2, dann kleinerer offener Aufwand, dann ID; BLOCKED und unerfüllte Abhängigkeiten fehlen", () => {
    const l = NP.naechste(bau());
    expect(l.map((x) => x.id)).toEqual(["WP-13", "WP-02", "WP-09", "WP-10"]);
    expect(l.map((x) => x.id)).not.toContain("WP-11");
    expect(l.map((x) => x.id)).not.toContain("WP-12");
    expect(NP.naechste(bau(), 2).map((x) => x.id)).toEqual(["WP-13", "WP-02"]);
    expect(l[0]).toMatchObject({ status: "IN_PROGRESS", konfliktzonen: ["App.jsx"], notiz: "Rest laut Plan" });
  });

  it("extern und bedingt werden nie vorgeschlagen", () => {
    const l = bau().map((p) => (p.id === "WP-13" ? { ...p, strang: "extern", wartezeitAT: { min: 1, max: 1 } } : p.id === "WP-02" ? { ...p, bedingt: true } : p));
    expect(NP.naechste(l).map((x) => x.id)).toEqual(["WP-09", "WP-10"]);
  });

  it("main: Text mit Konfliktzonen-Hinweis und Exit 0; --json ist gültig; Exit 1 ohne Paket; Exit 2 bei falschem Aufruf", () => {
    const s = sammeln();
    expect(NP.main([], s.say, bau())).toBe(0);
    expect(s.text()).toMatch(/^1\. WP-13 {2}P0 .*IN_PROGRESS/);
    expect(s.text()).toContain("Konfliktzonen: App.jsx (ein Schreiber zur Zeit, docs/acc45/AGENTS.md)");
    expect(s.text()).toContain("Konfliktzonen: keine");
    const j = sammeln();
    expect(NP.main(["--json", "--anzahl", "2"], j.say, bau())).toBe(0);
    expect(JSON.parse(j.text()).map((x) => x.id)).toEqual(["WP-13", "WP-02"]);
    const leer = BL.paketeAus(FIXTURE).filter((p) => ["WP-01", "WP-03", "WP-15", "WP-11"].includes(p.id));
    const k = sammeln();
    expect(NP.main([], k.say, leer)).toBe(1);
    expect(k.text()).toMatch(/Kein ausführbares Paket/);
    expect(JSON.parse((() => { const x = sammeln(); NP.main(["--json"], x.say, leer); return x.text(); })())).toEqual([]);
    expect(NP.main(["--json"], () => {}, leer)).toBe(1);
    expect(NP.main(["--anzahl", "0"], () => {}, bau())).toBe(2);
    expect(NP.main(["--bogus"], () => {}, bau())).toBe(2);
  });

  it("schreibt nichts: Quelltext enthält keinen Schreib- oder Netzaufruf", async () => {
    const q = await readFile(path.join(REPO, "werkzeug", "naechstes-paket.mjs"), "utf8");
    expect(q).not.toMatch(/writeFile|appendFile|execFile|spawn|fetch\(|child_process/);
  });

  it("auf dem lebenden Backlog: Exit 0 oder 1, nie ein BLOCKED- oder externes Paket", () => {
    const s = sammeln();
    const exit = NP.main(["--json", "--anzahl", "50"], s.say);
    expect([0, 1]).toContain(exit);
    for (const x of JSON.parse(s.text())) { expect(x.status).not.toBe("BLOCKED"); expect(x.strang).not.toBe("extern"); }
  });
});

describe("vorpruefung: Geheimnis-Muster", () => {
  /* Die Beispiele werden zusammengesetzt, damit diese Datei selbst keines enthält. */
  const z = (...t) => t.join("");
  const faelle = [
    ["privater Schlüssel", z("-----BEGIN ", "RSA PRIVATE KEY-----")],
    ["GitHub-Token", z("gh", "p_", "A".repeat(36))],
    ["AWS-Schlüssel", z("AK", "IA", "ABCDEFGHIJKLMNOP")],
    ["Anthropic/OpenAI-Schlüssel", z("sk-", "ant-", "a".repeat(30))],
    ["Anthropic/OpenAI-Schlüssel", z("sk-", "proj-", "b".repeat(30))],
    ["Stripe-Schlüssel", z("sk_", "live_", "c".repeat(24))],
    ["Slack-Token", z("xo", "xb-", "1234567890-abcdef")],
    ["Google-API-Schlüssel", z("AI", "za", "d".repeat(35))],
    ["JWT", z("ey", "JhbGciOiJIUzI1NiJ9", ".", "ey", "JzdWIiOiIxMjM0In0", ".", "abcdefghijkl")],
    ["Zugangsdaten in URL", z("https://", "nutzer:", "geheim123", "@beispielhost.invalid/pfad")],
    ["Geheimnis-Zuweisung", z("const DB_", "PASSWORD = \"", "Wirklich-Geheim-4711\";")],
    ["Geheimnis-Zuweisung", z("{\"api", "_key\": \"", "Q8x2Lr7Vm3Np9Kd4\"}")],
    ["Geheimnis-Zuweisung", z("smtp_", "secret: '", "Hj82kL0qPz71xYw'")],
  ];
  for (const [name, zeile] of faelle)
    it(`erkennt ${name}: ${zeile.slice(0, 18)}…`, () => { expect(VP.geheimnisseIn(zeile)).toContain(name); });

  it("Platzhalter und Prüfwerte zählen nicht; die Musterdefinition selbst ist nur zeilenweise ausgenommen", () => {
    expect(VP.geheimnisseIn("CENTRIC_PFEFFER = \"pfeffer-nur-zum-pruefen-0123456789\";")).toEqual([]);
    expect(VP.geheimnisseIn("password: \"<hier-eintragen-bitte>\"")).toEqual([]);
    const geheim = z("gh", "p_", "B".repeat(36));
    expect(VP.geheimnisseIn(`x = "${geheim}"; // vorpruefung:muster`, "werkzeug/vorpruefung.mjs")).toEqual([]);
    expect(VP.geheimnisseIn(`x = "${geheim}";`, "werkzeug/vorpruefung.mjs")).toEqual(["GitHub-Token"]);
    expect(VP.geheimnisseIn(`x = "${geheim}"; // vorpruefung:muster`, "server/a.mjs")).toEqual(["GitHub-Token"]);
  });

  it("zeilenAusDiff: Inhaltszeilen mit „++“ gehen nicht verloren, quotierte Pfade werden gelesen", () => {
    const diff = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -0,0 +1,2 @@", "+++inhalt", "+normal",
      "diff --git \"a/ein ä\" \"b/ein ä\"", "--- /dev/null", "+++ \"b/ein \\u00e4\"", "@@ -0,0 +1 @@", "+zeile"].join("\n");
    expect(VP.zeilenAusDiff(diff, "t")).toEqual([
      { datei: "x", text: "++inhalt", quelle: "t" }, { datei: "x", text: "normal", quelle: "t" },
      { datei: "ein ä", text: "zeile", quelle: "t" }]);
  });
});

describe("vorpruefung: harte Verstöße und Warnungen, Exit-Code", () => {
  let repo, hooks;
  const git = (...a) => {
    const r = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", `core.hooksPath=${hooks}`, ...a], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout;
  };
  const PAKETE = () => BL.paketeAus([P("WP-77", "READY", [], "src/ansicht.jsx, docs/x.md")]);
  const lauf = async (...argv) => {
    const s = sammeln(); const code = await VP.main(argv, s.say, { cwd: repo, pakete: PAKETE() }); return { code, aus: s.text() };
  };

  beforeAll(async () => {
    repo = path.join(tmp, "repo");
    hooks = path.join(tmp, "leere-hooks");
    await mkdir(path.join(repo, "server"), { recursive: true });
    await mkdir(hooks);
    git("init", "-q");
    git("config", "user.email", "pruefung@example.org");
    git("config", "user.name", "Pruefung");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", hooks);
    await writeFile(path.join(repo, "server", "a.mjs"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "basis");
    git("branch", "basis");
  });

  it("Code ohne Test → Rückgabe 1; mit Test → 0 und Hinweis „geändert heißt nicht passend“", async () => {
    await writeFile(path.join(repo, "server", "a.mjs"), "export const a = 2;\n");
    const ohne = await lauf("--basis", "basis", "--ohne-lint");
    expect(ohne.code, ohne.aus).toBe(1);
    expect(ohne.aus).toMatch(/kein Test neu oder geändert/);
    expect(ohne.aus).toMatch(/Fail-closed/);
    await mkdir(path.join(repo, "pruefungen"), { recursive: true });
    await writeFile(path.join(repo, "pruefungen", "a.test.js"), "// Test\n");
    const mit = await lauf("--basis", "basis", "--ohne-lint");
    expect(mit.code, mit.aus).toBe(0);
    expect(mit.aus).toMatch(/geändert heißt nicht passend/);
  });

  it("Geheimnis im Arbeitsstand, in einem neuen Dateinamen mit Umlaut und in einem zwischenzeitlichen Commit → Rückgabe 1", async () => {
    const kopf = "-----BEGIN " + "RSA PRIVATE KEY-----";
    await writeFile(path.join(repo, "server", "ä b.mjs"), `export const k = "${kopf}";\n`);
    const r = await lauf("--basis", "basis", "--ohne-lint");
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/privater Schlüssel\) in server\/ä b\.mjs/);
    await rm(path.join(repo, "server", "ä b.mjs"));
    /* Eingecheckt und im nächsten Commit wieder entfernt: bleibt in der Geschichte. */
    await writeFile(path.join(repo, "server", "c.mjs"), `export const k = "${kopf}";\n`);
    git("add", "server/c.mjs");
    git("commit", "-q", "-m", "mit Geheimnis");
    await rm(path.join(repo, "server", "c.mjs"));
    git("add", "-A", "server");
    git("commit", "-q", "-m", "ohne Geheimnis");
    const c = await lauf("--basis", "basis", "--ohne-lint");
    expect(c.code, c.aus).toBe(1);
    expect(c.aus).toMatch(/in server\/c\.mjs \(in einem Commit seit der Basis\)/);
    git("reset", "-q", "--hard", "basis");
  });

  it("Umgebungsdateien (.env, .envrc, *.env) → Rückgabe 1; .env.example nicht", async () => {
    await mkdir(path.join(repo, "pruefungen"), { recursive: true });
    await writeFile(path.join(repo, "pruefungen", "a.test.js"), "// Test\n");
    for (const name of [".env", ".envrc", "prod.env", ".env.lokal"]) {
      await writeFile(path.join(repo, name), "X=1\n");
      const e = await lauf("--basis", "basis", "--ohne-lint");
      expect(e.code, name).toBe(1);
      expect(e.aus, name).toMatch(/Umgebungsdatei/);
      await rm(path.join(repo, name));
    }
    await writeFile(path.join(repo, ".env.example"), "X=\n");
    expect((await lauf("--basis", "basis", "--ohne-lint")).code).toBe(0);
    await rm(path.join(repo, ".env.example"));
  });

  it("eslint-Fehler in geänderten Dateien → Rückgabe 1 (eslint als Stub)", async () => {
    await writeFile(path.join(repo, "server", "a.mjs"), "export const a = 3;\n");
    await mkdir(path.join(repo, "node_modules", "eslint", "bin"), { recursive: true });
    await writeFile(path.join(repo, "node_modules", "eslint", "bin", "eslint.js"),
      "console.log('server/a.mjs: 1 error'); process.exit(1);\n");
    const r = await lauf("--basis", "basis");
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/eslint meldet Fehler/);
    await rm(path.join(repo, "node_modules"), { recursive: true, force: true });
  });

  it("Dateien außerhalb des Paketfeldes → nur Warnung; Kommandozeile behält 1 und 2", async () => {
    const r = await lauf("--basis", "basis", "--ohne-lint", "--paket", "WP-77");
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/WARNUNG: Außerhalb des Feldes „dateien“ von WP-77 \(src\/ansicht\.jsx, docs\/x\.md\): server\/a\.mjs/);
    await rm(path.join(repo, "pruefungen"), { recursive: true, force: true });
    const cli = spawnSync(process.execPath, [path.join(REPO, "werkzeug", "vorpruefung.mjs"), "--basis", "basis", "--ohne-lint"],
      { cwd: repo, encoding: "utf8" });
    expect(cli.status, cli.stdout + cli.stderr).toBe(1);
    const falsch = spawnSync(process.execPath, [path.join(REPO, "werkzeug", "vorpruefung.mjs"), "--basis", "gibt-es-nicht"],
      { cwd: repo, encoding: "utf8" });
    expect(falsch.status).toBe(2);
  });
});

describe("test-kurz: Zusammenfassung, Exit-Code genau, Sperre, keine Befehlsinjektion", () => {
  const kurzLauf = (args, env = {}) => spawnSync(process.execPath, [path.join(REPO, "werkzeug", "test-kurz.mjs"), ...args],
    { cwd: REPO, encoding: "utf8", env: { ...process.env, ...env } });

  it("kuerzen/sammler: nur Zusammenfassung und Fehlschläge; ohne Treffer bei Fehler das Ende; Zeilengrenze", () => {
    const aus = "rauschen\n ✓ a.test.js (3)\n × b.test.js > fällt\nAssertionError: expected 1 to be 2\n Tests  1 failed | 3 passed\nnoch mehr";
    expect(TK.kuerzen(aus)).toEqual([" ✓ a.test.js (3)", " × b.test.js > fällt", "AssertionError: expected 1 to be 2",
      " Tests  1 failed | 3 passed"]);
    expect(TK.kuerzen("eins\nzwei", { code: 3 })).toEqual(["eins", "zwei"]);
    expect(TK.kuerzen("eins\nzwei", { code: 0 })).toEqual([]);
    expect(TK.kuerzen(Array.from({ length: 50 }, (_, i) => `FAIL ${i}`).join("\n"), { zeilen: 5 }))
      .toEqual(["FAIL 0", "FAIL 1", "FAIL 2", "FAIL 3", "FAIL 4", "… 45 weitere Zeilen"]);
    const s = TK.sammler();
    s.schreiben("Tests  2 pas"); s.schreiben("sed\nx");                    // über Blockgrenzen hinweg
    expect(s.ergebnis(0)).toEqual(["Tests  2 passed"]);
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

  it("Aufruffehler → Rückgabe 2: kein Befehl, --zeilen/--warten keine Zahl, unbekannte Option", () => {
    expect(kurzLauf([]).status).toBe(2);
    expect(kurzLauf(["--zeilen", "x", "--", "node", "-e", "0"]).status).toBe(2);
    expect(kurzLauf(["--warten", "NaN", "--sperre", "--", "node", "-e", "0"]).status).toBe(2);
    expect(kurzLauf(["--zeiln", "5", "--", "node", "-e", "0"]).status).toBe(2);
  });

  it("Windows: Argumente mit \" & | < > ^ % ! werden abgelehnt, nichts wird ausgeführt", () => {
    for (const boese of ["a\" & echo PWNED & \"b", "x & del y", "%PATH%", "a^b", "a|b", "a>b", "!X!"])
      expect(() => TK.startplan("npx", ["vitest", boese], "win32"), boese).toThrow(/nicht erlaubt/);
    const ok = TK.startplan("npx", ["vitest", "run", "pruefungen/a b.test.js"], "win32");
    expect(ok.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(ok.args[3]).toBe("\"npx vitest run \"pruefungen/a b.test.js\"\"");
    expect(ok.optionen).toEqual({ windowsVerbatimArguments: true });
    /* Ohne Windows und für node: keine Shell, Argumente unverändert. */
    expect(TK.startplan("npx", ["a & b"], "linux")).toEqual({ datei: "npx", args: ["a & b"], optionen: {} });
    expect(TK.startplan("node", ["-e", "a & b"], "win32").optionen).toEqual({});
  });

  it.skipIf(process.platform !== "win32")("Windows, echt: der Injektionsversuch landet nicht in der Shell (Rückgabe 2)", () => {
    const r = kurzLauf(["--", "npx", "a\" & echo PWNED & \"b"]);
    expect(r.status).toBe(2);
    expect(r.stdout).not.toMatch(/^PWNED/m);
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

  it("verwaiste Sperre (toter Prozess) und alte leere Sperre werden übernommen und freigegeben; frische leere nicht", async () => {
    const datei = path.join(tmp, "verwaist.sperre");
    const tot = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
    await writeFile(datei, JSON.stringify({ pid: Number(tot.stdout.trim()), start: "2026-01-01T00:00:00Z" }));
    const r = kurzLauf(["--sperre", "--warten", "5", "--", "node", "-e", "process.exit(0)"], { TEST_KURZ_SPERRE: datei });
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).not.toMatch(/HINWEIS/);
    expect(existsSync(datei)).toBe(false);

    await writeFile(datei, "");
    const alt = new Date(Date.now() - 10 * 60_000);
    await utimes(datei, alt, alt);
    const r2 = kurzLauf(["--sperre", "--warten", "5", "--", "node", "-e", "process.exit(0)"], { TEST_KURZ_SPERRE: datei });
    expect(r2.stdout).not.toMatch(/HINWEIS/);
    expect(existsSync(datei)).toBe(false);

    await writeFile(datei, "");                                            // frisch: könnte gerade geschrieben werden
    const r3 = kurzLauf(["--sperre", "--warten", "1", "--", "node", "-e", "process.exit(0)"], { TEST_KURZ_SPERRE: datei });
    expect(r3.stdout).toMatch(/noch belegt — läuft trotzdem/);
    expect(await readFile(datei, "utf8")).toBe("");
    await rm(datei);
  });

  it("Sperre nicht möglich (Ordner fehlt): läuft trotzdem, mit Hinweis, Rückgabe erhalten", () => {
    const r = kurzLauf(["--sperre", "--", "node", "-e", "process.exit(6)"],
      { TEST_KURZ_SPERRE: path.join(tmp, "gibt", "es", "nicht", "x.sperre") });
    expect(r.status).toBe(6);
    expect(r.stdout).toMatch(/HINWEIS: Sperre nicht möglich/);
  });

  it.skipIf(process.platform === "win32")("SIGTERM: das Kind wird beendet, die Sperre freigegeben", async () => {
    const datei = path.join(tmp, "signal.sperre");
    const merk = path.join(tmp, "kind.pid");
    const k = spawn(process.execPath, [path.join(REPO, "werkzeug", "test-kurz.mjs"), "--sperre", "--",
      "node", "-e", `require('fs').writeFileSync(${JSON.stringify(merk)}, String(process.pid)); setInterval(() => {}, 1000)`],
    { cwd: REPO, env: { ...process.env, TEST_KURZ_SPERRE: datei }, stdio: "ignore" });
    for (let i = 0; i < 100 && !existsSync(merk); i++) await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(datei)).toBe(true);
    const kindPid = Number(await readFile(merk, "utf8"));
    k.kill("SIGTERM");
    const code = await new Promise((r) => k.on("exit", (c, s) => r(c ?? s)));
    expect(code).toBe(128 + 15);
    expect(existsSync(datei)).toBe(false);
    let lebt = true;
    try { process.kill(kindPid, 0); } catch { lebt = false; }
    expect(lebt).toBe(false);
  });
});
