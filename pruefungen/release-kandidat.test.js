import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trockenlauf, rcAnlegen, unterlagenSchreiben, pfadklasse, pfadklassenZaehlen, lauf, main, argumenteLesen, aufrufErlaubt, ausfuehrenModus, ausfuehrungOffen } from "../werkzeug/release-kandidat.mjs";

const WZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../werkzeug/release-kandidat.mjs");
const ID = "v4-test";
const D = "sha256:" + "a".repeat(64);
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t.invalid" };
const g = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
const schreibe = (w, rel, inhalt) => { mkdirSync(path.join(w, rel, ".."), { recursive: true }); writeFileSync(path.join(w, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt, null, 2)); };
const zeile = (commit, status) => `| \`${D}\` | \`${commit}\` | 2026-11-20 | docs/bericht.md | ${status} | Basis |`;
const SSOT = { pakete: [
  { id: "WP-1", prio: "P1", status: "INTEGRATED", strang: "acc45", pr: ["#10"], titel: "fertig" },
  { id: "WP-9", prio: "P1", status: "REVIEW", strang: "acc45", pr: ["#11"], titel: "offen im Kandidaten" },
  { id: "F-1", prio: "P1", status: "BLOCKED", strang: "folge", pr: [], titel: "offener Befund" },
] };

let tmp; let repo; let basis; let schnitt; let remote;
const neuerKlon = () => { const k = mkdtempSync(path.join(tmp, "klon-")); execFileSync("git", ["clone", "-q", repo, k], { env: ENV }); return k; };

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "rst2-"));
  repo = path.join(tmp, "repo");
  mkdirSync(repo);
  g(repo, "init", "-q", "-b", "main");
  schreibe(repo, "README.md", "basis\n");
  schreibe(repo, "Dockerfile", "FROM scratch\n");
  g(repo, "add", "-A"); g(repo, "commit", "-q", "-m", "Basis");
  basis = g(repo, "rev-parse", "HEAD");
  schreibe(repo, "server/a.mjs", "export const a = 1;\n");
  schreibe(repo, "server/lib/schreibhalt.mjs", "export const w2 = 1;\n");
  schreibe(repo, "src/b.js", "export const b = 1;\n");
  schreibe(repo, "docs/c.md", "c\n");
  g(repo, "add", "-A"); g(repo, "commit", "-q", "-m", "Merge pull request #10 from x/y");
  schreibe(repo, "deploy/FREIGEGEBENE-IMAGES.md", `# Liste\n\n${zeile(basis, "aktiv")}\n`);
  schreibe(repo, "docs/acc45/work-packages.json", SSOT);
  g(repo, "add", "-A"); g(repo, "commit", "-q", "-m", "Direkter Commit ohne PR");
  g(repo, "commit", "-q", "--allow-empty", "-m", "Feature (#11)");
  schnitt = g(repo, "rev-parse", "HEAD");
  remote = path.join(tmp, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  g(repo, "remote", "add", "origin", remote);
}, 60000);

afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

const lauf1 = (o = {}) => trockenlauf({ wurzel: repo, kandidat: schnitt, basis, releaseId: ID, ...o });
const refs = (w) => g(w, "for-each-ref", "--format=%(refname) %(objectname)");
const sauber = (w) => g(w, "status", "--porcelain");

describe("Pfadklassen", () => {
  it("ordnet jeden Pfad genau einer Klasse zu, erste Übereinstimmung gilt", () => {
    expect(pfadklasse(".github/workflows/x.yml")).toBe("workflows");
    expect(pfadklasse("server/lib/a.mjs")).toBe("server");
    expect(pfadklasse("server.mjs")).toBe("server");
    expect(pfadklasse("deploy/compose.yml")).toBe("deploy-vorlagen");
    expect(pfadklasse("package-lock.json")).toBe("paketkette");
    expect(pfadklasse("pruefungen/x.test.js")).toBe("pruefungen");
    expect(pfadklasse("docs/x.md")).toBe("docs");
    expect(pfadklasse("LIESMICH.txt")).toBe("sonstiges");
    const z = pfadklassenZaehlen(["server/a.mjs", "src/b.js", "src/c.js", "x"]);
    expect(z.server).toBe(1); expect(z.app).toBe(2); expect(z.sonstiges).toBe(1);
  });
});

describe("Trockenlauf (Standard)", () => {
  it("erzeugt Unterlagen, gebunden an genau den Commit, und erklärt nie „bereit“", () => {
    const e = lauf1();
    expect(e.status).toBe("unterlagen-erzeugt");
    expect(e.freigabeBereit).toBe(false);
    expect(e.schnittCommit).toBe(schnitt);
    expect(e.basisCommit).toBe(basis);
    expect(e.schnittBaum).toMatch(/^[0-9a-f]{40}$/);
    expect(e.rcZweig).toBe(`release/rc-${ID}`);
    expect(e.basis.commits).toBe(3);
    const klassen = Object.fromEntries(e.pfade.pfadklassen.map((k) => [k.klasse, k.dateien]));
    expect(klassen.server).toBe(2); expect(klassen.app).toBe(1);
    expect(e.pfade.startschreibvorgaengeBetroffen).toContain("W-2");
    expect(e.g2Belege.prs.map((p) => p.pr)).toEqual([10, 11]);
    expect(e.g2Belege.prs.every((p) => p.beleg === null)).toBe(true);
    expect(e.g2Belege.commitsOhnePrBetreff.map((c) => c.betreff)).toContain("Direkter Commit ohne PR");
    expect(e.g8g9Listen.g8.blocker.join(" ")).toContain("WP-9");
    expect(e.g8g9Listen.g9.blocker.join(" ")).toContain("F-1");
    expect(e.gateVoraussetzungen).toHaveLength(10);
    expect(e.gateVoraussetzungen.every((x) => x.bewertung === "nicht bewertet")).toBe(true);
    expect(e.freigabeVorlage.schnittCommit).toBe(schnitt);
    expect(e.freigabeVorlage.basisCommit).toBe(basis);
    // Platzhalter: unverändert nie gültig (kandidatCommit, digest, Freigeber, Datum, Rückweg bleiben leer)
    expect(e.freigabeVorlage.kandidatCommit).toBeNull();
    expect(e.freigabeVorlage.digest).toBeNull();
    expect(e.freigabeVorlage.freigegebenDurch).toBeNull();
    expect(e.freigabeVorlage.datum).toBeNull();
    expect(e.freigabeVorlage.rueckweg.strategie).toBeNull();
    expect(Object.keys(e.freigabeVorlage.vorlagenHashes)).toEqual(["Dockerfile"]);
    expect(e.uebergabe).toContain("kein Freigabeurteil");
  });

  it("ändert nichts: keine Zweige, keine Dateien, kein neuer Commit", () => {
    const vorher = { refs: refs(repo), status: sauber(repo), kopf: g(repo, "rev-parse", "HEAD") };
    lauf1();
    expect({ refs: refs(repo), status: sauber(repo), kopf: g(repo, "rev-parse", "HEAD") }).toEqual(vorher);
    expect(refs(remote)).toBe("");
  });

  it("zweiter Lauf auf denselben Kandidaten ist byte-gleich (Ausgabe und Dateien)", () => {
    expect(JSON.stringify(lauf1())).toBe(JSON.stringify(lauf1()));
    const a = path.join(tmp, "ausgabe");
    const e = lauf1();
    expect(unterlagenSchreiben(repo, a, e)).toBeNull();
    const erste = Object.fromEntries(readdirSync(a).map((f) => [f, readFileSync(path.join(a, f), "utf8")]));
    expect(Object.keys(erste).sort()).toEqual(["freigabe-vorlage.json", "g2-belege.json", "g8-g9-listen.json", "kandidat-trockenlauf.json", "uebergabe.md"]);
    expect(unterlagenSchreiben(repo, a, lauf1())).toBeNull();
    const zweite = Object.fromEntries(readdirSync(a).map((f) => [f, readFileSync(path.join(a, f), "utf8")]));
    expect(zweite).toEqual(erste);
  });

  it("schreibt nie über eine abweichende Datei und nie ins Repository", () => {
    const a = path.join(tmp, "ausgabe2");
    expect(unterlagenSchreiben(repo, a, lauf1())).toBeNull();
    writeFileSync(path.join(a, "g2-belege.json"), "von Hand geändert\n");
    expect(unterlagenSchreiben(repo, a, lauf1())).toContain("abweichendem Inhalt");
    expect(readFileSync(path.join(a, "g2-belege.json"), "utf8")).toBe("von Hand geändert\n");
    const innen = path.join(repo, "unterlagen");
    expect(unterlagenSchreiben(repo, innen, lauf1())).toContain("im Repository");
    expect(existsSync(innen)).toBe(false);
  });

  it("Ausgabe enthält weder Hosts noch IPs noch Remote-Adressen", () => {
    const text = JSON.stringify(lauf1()) + lauf1().uebergabe;
    expect(text).not.toMatch(/https?:\/\/|ssh:|@[a-z0-9.-]+\.[a-z]{2,}|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/i);
    expect(text).not.toContain(remote.replace(/\\/g, "/"));
  });

  it("nur Lesebefehle, kein gh/curl, kein Push: protokollierte Aufrufe", () => {
    const aufrufe = [];
    const echt = lauf.exec;
    lauf.exec = (cmd, args, opt) => { aufrufe.push([cmd, ...args]); return echt(cmd, args, opt); };
    try { lauf1(); } finally { lauf.exec = echt; }
    const erlaubt = new Set(["rev-parse", "log", "rev-list", "diff", "show", "merge-base", "ls-tree", "cat-file"]);
    for (const [cmd, ...args] of aufrufe) {
      if (cmd === "node") { expect(args[0]).toMatch(/release-pruefung\.mjs$/); expect(args).toContain("--vorlagen-hashes"); continue; }
      expect(cmd).toBe("git");
      expect(erlaubt.has(args[0])).toBe(true);
    }
    expect(aufrufe.length).toBeGreaterThan(5);
  });
});

describe("Fail-closed: nicht bewertbar", () => {
  it("Basis kein Vorfahr, gleich dem Kandidaten oder nicht in der Liste", () => {
    const quer = (() => { g(repo, "checkout", "-q", "--orphan", "quer"); g(repo, "commit", "-q", "--allow-empty", "-m", "fremd"); const s = g(repo, "rev-parse", "HEAD"); g(repo, "checkout", "-q", "main"); return s; })();
    for (const b of [quer, schnitt, g(repo, "rev-parse", `${schnitt}~1`)]) {
      const e = lauf1({ basis: b });
      expect(e.status).toBe("nicht-bewertbar");
      expect(e.freigabeBereit).toBe(false);
      expect(e.freigabeVorlage).toBeNull();
      expect(e.uebergabe).toBeNull();
      expect(e.nichtBewertbarGruende.length).toBeGreaterThan(0);
    }
  });

  it("Basis in der Liste, aber kein Vorfahr des Kandidaten", () => {
    const k = neuerKlon();
    g(k, "checkout", "-q", "--orphan", "fremd"); g(k, "commit", "-q", "--allow-empty", "-m", "fremde Basis");
    const x = g(k, "rev-parse", "HEAD"); g(k, "checkout", "-q", "main");
    schreibe(k, "deploy/FREIGEGEBENE-IMAGES.md", `# Liste

${zeile(x, "aktiv")}
`); g(k, "add", "-A"); g(k, "commit", "-q", "-m", "Liste mit fremder Basis");
    const e = trockenlauf({ wurzel: k, kandidat: "HEAD", basis: x, releaseId: ID });
    expect(e.status).toBe("nicht-bewertbar");
    expect(e.nichtBewertbarGruende.join(" ")).toContain("kein Vorfahr");
  });

  it("SSOT im Schnitt fehlt: G8/G9 nicht bewertbar, nie „keine Blocker“", () => {
    const k = neuerKlon();
    g(k, "rm", "-q", "docs/acc45/work-packages.json"); g(k, "commit", "-q", "-m", "ohne SSOT");
    const e = trockenlauf({ wurzel: k, kandidat: "HEAD", basis, releaseId: ID });
    expect(e.status).toBe("nicht-bewertbar");
    expect(e.g8g9Listen).toBeNull();
    expect(e.nichtBewertbarGruende.join(" ")).toContain("work-packages.json");
  });

  it("vergebene Release-ID und unbekannte Revision", () => {
    const k = neuerKlon();
    schreibe(k, `docs/acc45/releases/${ID}.freigabe.json`, {}); g(k, "add", "-A"); g(k, "commit", "-q", "-m", "Freigabe da");
    expect(trockenlauf({ wurzel: k, kandidat: "HEAD", basis, releaseId: ID }).status).toBe("nicht-bewertbar");
    expect(trockenlauf({ wurzel: repo, kandidat: "gibt-es-nicht", basis, releaseId: ID }).aufrufFehler).toBeTruthy();
    expect(trockenlauf({ wurzel: repo, kandidat: "--help", basis, releaseId: ID }).aufrufFehler).toBeTruthy();
  });

  it("nicht gelistete Vorlage: Hashes nicht bewertbar", () => {
    const k = neuerKlon();
    schreibe(k, "Dockerfile.neu", "FROM scratch\n"); g(k, "add", "-A"); g(k, "commit", "-q", "-m", "neue Vorlage");
    const e = trockenlauf({ wurzel: k, kandidat: "HEAD", basis, releaseId: ID });
    expect(e.status).toBe("nicht-bewertbar");
    expect(e.freigabeVorlage).toBeNull();
    expect(e.nichtBewertbarGruende.join(" ")).toContain("vorlagen");
  });
});

describe("--anlegen: nur lokaler Zweig, nie ein bestehender Kandidat", () => {
  it("legt lokal an, wechselt nichts, pusht nichts; zweiter Lauf ohne Änderung", () => {
    const k = neuerKlon();
    g(k, "remote", "set-url", "origin", remote);
    const kopf = g(k, "rev-parse", "HEAD"); const zweig = g(k, "branch", "--show-current");
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: ID });
    const r = rcAnlegen(k, e, "origin");
    expect(r.ok).toBe(true);
    expect(g(k, "rev-parse", `refs/heads/release/rc-${ID}`)).toBe(schnitt);
    expect(g(k, "rev-parse", "HEAD")).toBe(kopf);
    expect(g(k, "branch", "--show-current")).toBe(zweig);
    expect(refs(remote)).toBe("");
    const nach = refs(k);
    const r2 = rcAnlegen(k, e, "origin");
    expect(r2.ok).toBe(true);
    expect(r2.text).toContain("nichts geändert");
    expect(refs(k)).toBe(nach);
  });

  it("verweigert bei bestehendem lokalem Zweig auf anderem Commit und ändert ihn nicht", () => {
    const k = neuerKlon();
    g(k, "remote", "set-url", "origin", remote);
    g(k, "branch", `release/rc-${ID}`, basis);
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: ID });
    const r = rcAnlegen(k, e, "origin");
    expect(r.ok).toBe(false);
    expect(g(k, "rev-parse", `refs/heads/release/rc-${ID}`)).toBe(basis);
  });

  it("verweigert bei bestehendem Remote-Zweig und bei nicht lesbarem Remote (fail-closed)", () => {
    const k = neuerKlon();
    g(k, "remote", "set-url", "origin", remote);
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-fremd" });
    g(k, "push", "-q", "origin", `${basis}:refs/heads/release/rc-v4-fremd`);
    const vorher = refs(remote);
    const r = rcAnlegen(k, e, "origin");
    expect(r.ok).toBe(false);
    expect(g(k, "branch", "--list", "release/rc-v4-fremd")).toBe("");
    expect(refs(remote)).toBe(vorher);
    const e2 = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-offline" });
    const r2 = rcAnlegen(k, e2, "gibt-es-nicht");
    expect(r2.ok).toBe(false);
    expect(g(k, "branch", "--list", "release/rc-v4-offline")).toBe("");
  });

  it("nicht bewertbar: kein Zweig", () => {
    const k = neuerKlon();
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis: schnitt, releaseId: ID });
    expect(rcAnlegen(k, e, "origin").ok).toBe(false);
    expect(g(k, "branch", "--list", "release/*")).toBe("");
  });
});

describe("Kommandozeile", () => {
  it("Aufruffehler Exit 2, Trockenlauf Exit 0, nicht bewertbar Exit 1", () => {
    expect(main(["--kandidat", schnitt])).toBe(2);
    expect(main(["--unbekannt"])).toBe(2);
    expect(main(["--kandidat", schnitt, "--basis", basis, "--release-id", "x"])).toBe(2);
    expect(argumenteLesen(["--anlegen", "--kurz"])).toEqual({ anlegen: true, kurz: true });
    const aus = execFileSync("node", [WZ, "--kandidat", schnitt, "--basis", basis, "--release-id", ID, "--wurzel", repo], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(JSON.parse(aus).freigabeBereit).toBe(false);
    let code = 0;
    try { execFileSync("node", [WZ, "--kandidat", schnitt, "--basis", schnitt, "--release-id", ID, "--wurzel", repo], { stdio: "ignore" }); } catch (err) { code = err.status; }
    expect(code).toBe(1);
  });
});

/* ------------------------------------------------------------------ RST-2 Folge: Ausführungsmodus */

const RC = (id) => `release/rc-${id}`;
const spec = (id) => `refs/heads/${RC(id)}:refs/heads/${RC(id)}`;
const PUSH = (id, remoteName = "origin") => ["push", "--", remoteName, spec(id)];
const PR_LIST = (id) => ["pr", "list", "--head", RC(id), "--state", "all", "--json", "number", "--jq", "length"];
const PR_NEU = (id, base = "main") => ["pr", "create", "--draft", "--base", base, "--head", RC(id), "--title", "T", "--body", "B"];

/** Protokolliert alle Fremdaufrufe; git läuft echt, gh ist ein Ersatz. */
function mitProtokoll(gh, fn) {
  const echt = lauf.exec;
  const aufrufe = [];
  lauf.exec = (cmd, args, opt) => {
    aufrufe.push([cmd, ...args]);
    if (cmd === "gh") return gh(args);
    return echt(cmd, args, opt);
  };
  try { return fn(aufrufe); } finally { lauf.exec = echt; }
}
const ghOk = (args) => (args[1] === "list" ? "0\n" : "https://github.example/x/y/pull/77\n");
const klonMitRemote = () => { const k = neuerKlon(); g(k, "remote", "set-url", "origin", remote); return k; };
const stumm = (fn) => {
  const l = vi.spyOn(console, "log").mockImplementation(() => {});
  const f = vi.spyOn(console, "error").mockImplementation(() => {});
  try { const r = fn(); return { r, out: l.mock.calls.map((c) => c.join(" ")).join("\n"), err: f.mock.calls.map((c) => c.join(" ")).join("\n") }; } finally { l.mockRestore(); f.mockRestore(); }
};
const schreibend = (aufrufe) => aufrufe.filter(([cmd, u]) => cmd === "gh" || (cmd === "git" && ["push", "branch"].includes(u)));
const ARGS = (k, id, ...extra) => ["--kandidat", schnitt, "--basis", basis, "--release-id", id, "--wurzel", k, ...extra];

describe("Allowlist der Fremdaufrufe", () => {
  it("erlaubt die Lesebefehle und im Ausführungsmodus genau Push und Entwurfs-PR", () => {
    expect(ausfuehrungOffen()).toBe(false); // Ruhezustand: geschlossen (erster Test der Datei im Lauf)
    expect(aufrufErlaubt("git", ["log", "-z", "a..b"], false)).toBeNull();
    expect(aufrufErlaubt("git", ["ls-remote", "--heads", "--", "origin", "refs/heads/release/rc-x1y"], false)).toBeNull();
    expect(aufrufErlaubt("git", ["branch", "--no-track", RC("x1y"), schnitt], false)).toBeNull();
    expect(aufrufErlaubt("git", PUSH("x1y"), true)).toBeNull();
    expect(aufrufErlaubt("gh", PR_LIST("x1y"), true)).toBeNull();
    expect(aufrufErlaubt("gh", PR_NEU("x1y"), true)).toBeNull();
  });

  it("lehnt Push, gh und alles Schreibende außerhalb des Ausführungsmodus ab", () => {
    expect(aufrufErlaubt("git", PUSH("x1y"), false)).toBeTruthy();
    expect(aufrufErlaubt("gh", PR_LIST("x1y"), false)).toBeTruthy();
    expect(aufrufErlaubt("gh", PR_NEU("x1y"), false)).toBeTruthy();
  });

  it("lehnt force, fremde Ziele, Löschen, Merge und alles andere auch im Ausführungsmodus ab", () => {
    const rc = spec("x1y");
    const abgelehnt = [
      ["git", ["push", "--force", "--", "origin", rc]], ["git", ["push", "--", "origin", `+${rc}`]], ["git", ["push", "-f", "--", "origin", rc]],
      ["git", ["push", "--force-with-lease", "--", "origin", rc]], ["git", ["push", "--", "origin", rc, "--tags"]], ["git", ["push", "origin", rc]],
      ["git", ["push", "--", "origin", "refs/heads/main:refs/heads/main"]], ["git", ["push", "--", "origin", "refs/heads/release/rc-x1y:refs/heads/main"]],
      ["git", ["push", "--", "origin", "refs/heads/integration/release-v4:refs/heads/integration/release-v4"]],
      ["git", ["push", "--", "origin", "refs/heads/release/v4-x:refs/heads/release/v4-x"]], ["git", ["push", "--", "origin", ":refs/heads/release/rc-x1y"]],
      ["git", ["push", "--", "origin", "refs/heads/release/rc-x1y:refs/heads/release/rc-x1z"]], ["git", ["push", "--", "origin", "HEAD:refs/heads/release/rc-x1y"]],
      ["git", ["push", "--", "https://example.invalid/r.git", rc]], ["git", ["push", "--", "../r", rc]], ["git", ["push", "--delete", "origin", RC("x1y")]],
      ["git", ["merge", "origin/main"]], ["git", ["checkout", "main"]], ["git", ["reset", "--hard"]], ["git", ["fetch", "origin"]], ["git", ["update-ref", "-d", "refs/heads/main"]],
      ["git", ["branch", "-D", RC("x1y")]], ["git", ["branch", "--no-track", "main", schnitt]], ["git", ["remote", "add", "x", "y"]], ["git", ["config", "x.y", "z"]],
      ["gh", ["pr", "merge", "5", "--auto"]], ["gh", ["pr", "ready", "5"]], ["gh", ["api", "-X", "PUT", "repos/x/y/merge"]], ["gh", ["workflow", "run", "deploy.yml"]],
      ["gh", PR_NEU("x1y").filter((a) => a !== "--draft")], ["gh", PR_NEU("x1y", "integration/release-v4")], ["gh", [...PR_NEU("x1y"), "--web"]],
      ["gh", ["pr", "create", "--draft", "--base", "main", "--head", "main", "--title", "T", "--body", "B"]], ["gh", ["pr", "list", "--head", "main", "--state", "all", "--json", "number", "--jq", "length"]],
      ["curl", ["https://example.invalid"]], ["ssh", ["x"]], ["node", ["x.mjs"]], ["git", "log"],
    ];
    for (const [cmd, args] of abgelehnt) expect(aufrufErlaubt(cmd, args, true), `${cmd} ${[].concat(args).join(" ")}`).toBeTruthy();
  });
});

describe("Standard und --anlegen: kein Push, kein PR", () => {
  it("Aufrufprotokoll von --anlegen: nur Lesebefehle, lokaler branch und ls-remote", () => {
    const k = klonMitRemote();
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-anl1" });
    const aufrufe = mitProtokoll(ghOk, (a) => { expect(rcAnlegen(k, e, "origin").ok).toBe(true); return a; });
    expect(aufrufe.some(([cmd]) => cmd === "gh")).toBe(false);
    const erlaubt = new Set(["rev-parse", "check-ref-format", "ls-remote", "branch"]);
    for (const [cmd, u] of aufrufe) { expect(cmd).toBe("git"); expect(erlaubt.has(u)).toBe(true); }
    expect(refs(remote)).not.toContain("v4-anl1");
  });

  it("main mit --anlegen ohne --ausfuehren: weder push noch gh; --ausfuehren allein ist ein Aufruffehler", () => {
    const k = klonMitRemote();
    const vorher = refs(remote);
    const { r } = stumm(() => mitProtokoll(ghOk, (aufrufe) => ({ code: main(ARGS(k, "v4-anl2", "--anlegen")), aufrufe })));
    expect(r.code).toBe(0);
    expect(schreibend(r.aufrufe).map((a) => a[1])).toEqual(["branch"]);
    expect(refs(remote)).toBe(vorher);
    const z = stumm(() => mitProtokoll(ghOk, (aufrufe) => ({ code: main(ARGS(k, "v4-anl3", "--ausfuehren")), aufrufe })));
    expect(z.r.code).toBe(2);
    expect(z.r.aufrufe).toHaveLength(0);
  });
});

describe("Ausführungsmodus (--anlegen --ausfuehren)", () => {
  it("pusht den Zweig und erstellt genau einen Entwurfs-PR: Protokoll, Ausgabe, Freigabevorlage unverändert", () => {
    const k = klonMitRemote();
    const id = "v4-ausf1";
    const { r, out, err } = stumm(() => mitProtokoll(ghOk, (aufrufe) => ({ code: main(ARGS(k, id, "--anlegen", "--ausfuehren")), aufrufe })));
    expect(r.code).toBe(0);
    const lesen = new Set(["rev-parse", "log", "rev-list", "diff", "show", "merge-base", "ls-tree", "cat-file", "check-ref-format", "ls-remote", "remote"]);
    const rest = r.aufrufe.filter(([cmd, u]) => !(cmd === "node" || (cmd === "git" && lesen.has(u))));
    expect(rest).toEqual([
      ["git", "branch", "--no-track", RC(id), schnitt],
      ["gh", ...PR_LIST(id)],
      ["git", ...PUSH(id)],
      ["gh", "pr", "create", "--draft", "--base", "main", "--head", RC(id), "--title", expect.any(String), "--body", expect.any(String)],
    ]);
    expect(g(remote, "rev-parse", `refs/heads/${RC(id)}`)).toBe(schnitt);
    const j = JSON.parse(out);
    expect(j.ausfuehrung.status).toBe("vollstaendig");
    expect(j.ausfuehrung.prNummer).toBe(77);
    expect(j.freigabeBereit).toBe(false);
    expect(j.freigabeVorlage.kandidatCommit).toBeNull();
    expect(j.freigabeVorlage.digest).toBeNull();
    expect(`${out}\n${err}`).not.toMatch(/https?:\/\/|github\.example/i);
  });

  it("bestehender Remote-Zweig: Abbruch ohne Push und ohne PR, Zweig bleibt unverändert", () => {
    const k = klonMitRemote();
    const id = "v4-ausf2";
    g(k, "push", "-q", "origin", `${basis}:refs/heads/${RC(id)}`);
    const vorher = refs(remote);
    const { r } = stumm(() => mitProtokoll(ghOk, (aufrufe) => ({ code: main(ARGS(k, id, "--anlegen", "--ausfuehren")), aufrufe })));
    expect(r.code).toBe(1);
    expect(r.aufrufe.some(([cmd, u]) => cmd === "gh" || u === "push")).toBe(false);
    expect(refs(remote)).toBe(vorher);
  });

  it("lokaler Zweig auf anderem Commit, nicht bewertbar, fremdes Ziel, URL als Remote: Abbruch ohne schreibenden Aufruf", () => {
    const k = klonMitRemote();
    g(k, "branch", RC("v4-ausf3"), basis);
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-ausf3" });
    const a = mitProtokoll(ghOk, (x) => ({ r: ausfuehrenModus(k, e, "origin"), x }));
    expect(a.r.ok).toBe(false); expect(a.r.status).toBe("abgebrochen");
    expect(schreibend(a.x)).toHaveLength(0);
    const nb = trockenlauf({ wurzel: k, kandidat: schnitt, basis: schnitt, releaseId: "v4-ausf3" });
    const b = mitProtokoll(ghOk, (x) => ({ r: ausfuehrenModus(k, nb, "origin"), x }));
    expect(b.r.status).toBe("abgebrochen"); expect(b.x).toHaveLength(0);
    const c = mitProtokoll(ghOk, (x) => ({ r: ausfuehrenModus(k, { ...e, rcZweig: "main" }, "origin"), x }));
    expect(c.r.status).toBe("abgebrochen"); expect(c.x).toHaveLength(0);
    expect(ausfuehrenModus(k, { ...e, rcZweig: "integration/release-v4", releaseId: "release-v4" }, "origin").status).toBe("abgebrochen");
    expect(ausfuehrenModus(k, e, "https://example.invalid/r.git").status).toBe("abgebrochen");
  });

  it("schon vorhandener PR oder fehlgeschlagene PR-Abfrage: Abbruch vor dem Push", () => {
    for (const [id, gh] of [["v4-ausf4", () => "1\n"], ["v4-ausf5", () => { throw new Error("gh kaputt"); }]]) {
      const k = klonMitRemote();
      const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: id });
      expect(rcAnlegen(k, e, "origin").ok).toBe(true);
      const a = mitProtokoll(gh, (x) => ({ r: ausfuehrenModus(k, e, "origin"), x }));
      expect(a.r.status).toBe("abgebrochen");
      expect(a.x.some(([, u]) => u === "push")).toBe(false);
      expect(g(k, "ls-remote", "--heads", "origin", `refs/heads/${RC(id)}`)).toBe("");
    }
  });

  it("Push fehlgeschlagen: kein PR, ehrliche Meldung", () => {
    const k = klonMitRemote();
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-ausf6" });
    rcAnlegen(k, e, "origin");
    const echt = lauf.exec; const aufrufe = [];
    lauf.exec = (cmd, args, opt) => { aufrufe.push([cmd, ...args]); if (args[0] === "push") throw new Error("abgelehnt"); return cmd === "gh" ? "0\n" : echt(cmd, args, opt); };
    let r; try { r = ausfuehrenModus(k, e, "origin"); } finally { lauf.exec = echt; }
    expect(r.ok).toBe(false); expect(r.status).toBe("abgebrochen");
    expect(r.schritte.at(-1)).toEqual({ schritt: "Push", ergebnis: "fehlgeschlagen" });
    expect(aufrufe.some(([cmd, a1, a2]) => cmd === "gh" && a1 === "pr" && a2 === "create")).toBe(false);
  });

  it("PR-Erstellung scheitert nach dem Push: Zwischenzustand ehrlich (teilweise), nichts zurückgenommen, Exit 1", () => {
    const k = klonMitRemote();
    const id = "v4-ausf7";
    const gh = (args) => { if (args[1] === "list") return "0\n"; throw new Error("create kaputt"); };
    const { r, out } = stumm(() => mitProtokoll(gh, (aufrufe) => ({ code: main(ARGS(k, id, "--anlegen", "--ausfuehren")), aufrufe })));
    expect(r.code).toBe(1);
    const j = JSON.parse(out);
    expect(j.ausfuehrung.status).toBe("teilweise");
    expect(j.ausfuehrung.schritte.map((s) => s.ergebnis)).toContain("fehlgeschlagen");
    expect(g(remote, "rev-parse", `refs/heads/${RC(id)}`)).toBe(schnitt);
    expect(r.aufrufe.filter(([cmd, u]) => cmd === "git" && u === "push")).toHaveLength(1);
    expect(r.aufrufe.some((a) => a.includes("--delete") || a.includes("--force") || a.includes("merge"))).toBe(false);
  });

  it("PR-Ausgabe ohne lesbare Nummer: teilweise, nie vollständig", () => {
    const k = klonMitRemote();
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-ausf8" });
    rcAnlegen(k, e, "origin");
    const r = mitProtokoll((a) => (a[1] === "list" ? "0\n" : "erstellt\n"), () => ausfuehrenModus(k, e, "origin"));
    expect(r.ok).toBe(false); expect(r.status).toBe("teilweise"); expect(r.prNummer).toBeNull();
  });
});

describe("Ausführungsmodus: Schutz eines inzwischen entstandenen Remote-Zweigs", () => {
  it("Zweig erst nach dem Anlegen auf dem Remote entstanden: kein Push, kein PR, Remote unverändert", () => {
    const k = klonMitRemote();
    const id = "v4-ausf9";
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: id });
    expect(rcAnlegen(k, e, "origin").ok).toBe(true);
    g(k, "push", "-q", "origin", `${basis}:refs/heads/${RC(id)}`);
    const vorher = refs(remote);
    const a = mitProtokoll(ghOk, (x) => ({ r: ausfuehrenModus(k, e, "origin"), x }));
    expect(a.r.status).toBe("abgebrochen");
    expect(a.x.some(([cmd, u]) => cmd === "gh" || u === "push")).toBe(false);
    expect(refs(remote)).toBe(vorher);
  });
});

describe("Ausführungsmodus: Freigabe nur während des Laufs", () => {
  it("ist im Ruhezustand geschlossen und wird nach Erfolg und nach Abbruch wieder geschlossen", () => {
    expect(ausfuehrungOffen()).toBe(false);
    const k = klonMitRemote();
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: "v4-ausf10" });
    expect(rcAnlegen(k, e, "origin").ok).toBe(true);
    expect(mitProtokoll(() => "1", () => ausfuehrenModus(k, e, "origin")).status).toBe("abgebrochen");
    expect(ausfuehrungOffen()).toBe(false);
    expect(mitProtokoll(ghOk, () => ausfuehrenModus(k, e, "origin")).status).toBe("vollstaendig");
    expect(ausfuehrungOffen()).toBe(false);
  });
});

describe("Testlücken aus dem Review", () => {
  it("flacher Klon: nicht bewertbar (fail-closed)", () => {
    const k = neuerKlon();
    writeFileSync(path.join(k, ".git", "shallow"), g(k, "rev-parse", `${schnitt}~1`) + "\n");
    expect(g(k, "rev-parse", "--is-shallow-repository")).toBe("true");
    const e = trockenlauf({ wurzel: k, kandidat: schnitt, basis, releaseId: ID });
    expect(e.status).toBe("nicht-bewertbar");
    expect(e.nichtBewertbarGruende.join(" ")).toContain("flacher");
    expect(e.freigabeVorlage).toBeNull();
  });

  it("Steuerzeichen im Commit-Betreff erscheinen nur als Escape", () => {
    const k = neuerKlon();
    g(k, "commit", "-q", "--allow-empty", "-m", "Direkt \u001b[31mrot‮\u0007 Ende");
    const e = trockenlauf({ wurzel: k, kandidat: "HEAD", basis, releaseId: ID });
    const text = JSON.stringify(e, null, 2);
    expect(e.g2Belege.commitsOhnePrBetreff.some((c) => c.betreff.includes("\\u001b"))).toBe(true);
    expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f‮]/);
  });

  it("Replace-Objekte ändern das Ergebnis nicht", () => {
    const a = neuerKlon(); const b = neuerKlon();
    const direkt = g(b, "log", "--format=%H", "--grep=Direkter Commit ohne PR", "-n", "1");
    g(b, "replace", direkt, basis);
    expect(g(b, "for-each-ref", "refs/replace/")).not.toBe("");
    const x = trockenlauf({ wurzel: a, kandidat: schnitt, basis, releaseId: ID });
    const y = trockenlauf({ wurzel: b, kandidat: schnitt, basis, releaseId: ID });
    expect(JSON.stringify(y)).toBe(JSON.stringify(x));
    expect(y.g2Belege.commitsOhnePrBetreff.map((c) => c.betreff)).toContain("Direkter Commit ohne PR");
  });

  it("Warnung: Vorlagen-Hashes kommen vom Werkzeug des Checkouts", () => {
    expect(lauf1().warnungen.join(" ")).toContain("Werkzeug-Checkouts");
  });
});
