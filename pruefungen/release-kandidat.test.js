import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trockenlauf, rcAnlegen, unterlagenSchreiben, pfadklasse, pfadklassenZaehlen, lauf, main, argumenteLesen } from "../werkzeug/release-kandidat.mjs";

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
