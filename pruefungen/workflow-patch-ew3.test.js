/* ==========================================================================
   GATE-EW3 — Workflow-Patch Staging-Gate (S1–S6, Bindung B-3) als PATCH-DATEI

   Betreiberentscheidung N-1 (W-1 + W-3): Claude ändert keine Datei unter .github/workflows/. Die Änderung liegt als
   Patch unter docs/acc45/workflow-patches/gate-ew3/ und wird vom Betreiber übernommen. Diese Prüfung hält den Patch
   anwendbar und sicher, solange er nicht übernommen ist — und prüft nach der Übernahme die Workflow-Datei selbst:

     (a) Patch auf eine KOPIE der Workflow-Datei anwenden (git apply --check, dann git apply; nie im Arbeitsbaum)
     (b) Ergebnis als YAML parsen; Vollfassung staging-gate.gepatcht.yml.txt = Ergebnis (Web-Editor-Weg)
     (c) Rechte minimal, uses: nur per 40-Zeichen-SHA, keine Secrets außer GITHUB_TOKEN (nur docker login), kein
         pull_request_target, nur workflow_dispatch mit genau der Eingabe digest, keine Auslieferung, Bindung B-3,
         Proben S1–S6, Nachweisformat für werkzeug/release-pruefung.mjs (GATE-EW1 #535, E6/E7)
     (d) der Patch liegt nicht unter .github/ und wird von keinem Workflow ausgeführt
   Mutationsproben: jede Verletzung aus (c) wird von befundeEW3 erkannt (eigene Tests unten).

   Abhängigkeit von #535 (GATE-EW1, Branch acc45/gate/erstwechsel-nachhol, Kopf 630c287e): Die verlangten Nachweis-
   felder stehen unten LOKAL (FELDER_535, aus werkzeug/release-pruefung.mjs@630c287e: erstwechselPruefen E6 :1213–1245,
   E7 :1247–1259). Liegt #535 im Stand (KONFIG_STANDARD.erstwechselAusnahme, erstwechselPruefen,
   pruefungen/fixtures/erstwechsel-gueltig.json), gleichen die mit skipIf markierten Tests den Nachweis zusätzlich
   gegen die echte Konfiguration und die echte Prüfung E6/E7 ab.
   ========================================================================== */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actionsPruefen } from "../werkzeug/sicherheit/actions-pins.mjs";
import * as RP from "../werkzeug/release-pruefung.mjs";

const yaml = createRequire(import.meta.url)("js-yaml");
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lf = (/** @type {string} */ s) => s.replace(/\r\n/g, "\n");
const lesen = (/** @type {string} */ rel) => lf(readFileSync(path.join(WURZEL, rel), "utf8"));
const sha256 = (/** @type {Buffer|string} */ b) => createHash("sha256").update(b).digest("hex");

const WF_REL = ".github/workflows/staging-gate.yml";
const ORDNER_REL = "docs/acc45/workflow-patches/gate-ew3";
const PATCH_REL = `${ORDNER_REL}/staging-gate.patch`;
const VOLL_REL = `${ORDNER_REL}/staging-gate.gepatcht.yml.txt`;
const SKRIPT_REL = "deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh";
const STAGING_REL = "deploy/sicherung/ci/widerrufbuch-staging.sh";
const C274 = "274bfa0baca5681f383eea334aab69875f31d5c1";

/* Felder, die GATE-EW1 (#535) vom Staging-Nachweis verlangt — LOKAL, bis #535 im Stand ist (siehe Kopf). */
const FELDER_535 = Object.freeze({
  pflicht: ["digest", "commit", "laufCommit", "baum", "lauf", "ergebnis", "erstellt", "widerrufbuch"],
  ergebnis: "success",                                   // E6: nw.ergebnis === "success" (Gate-Entwurf A.6 schreibt „ok“, siehe OFFENE FRAGEN)
  art: "widerrufbuch-staging-funktionstest",             // stagingArt
  proben: ["S1", "S2", "S3", "S4", "S5", "S6"],          // stagingProben, genau diese Schlüssel, je "ok"
  artefakt: "staging-nachweis",                          // stagingArtefakt (E7: genau ein Artefakt dieses Namens)
  workflow: ".github/workflows/staging-gate.yml",        // stagingWorkflow (E7: lauf.path)
  skript: SKRIPT_REL,                                    // stagingSkript (E6: skriptSha256)
  lauf: /^[1-9]\d{0,19}-[1-9]\d{0,3}$/,                  // Schema staging.lauf (run_id-run_attempt)
});

const tmpOrdner = [];
afterAll(() => { for (const d of tmpOrdner) rmSync(d, { recursive: true, force: true }); });
function tmp() {
  const d = mkdtempSync(path.join(os.tmpdir(), "ew3-patch-"));
  tmpOrdner.push(d);
  return d;
}
const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) =>
  spawnSync("git", ["-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" });

/** (a) Patch auf eine Kopie anwenden — in einem frischen Wegwerf-Repository, nie im Arbeitsbaum. */
function patchAnwenden(/** @type {string} */ patchText, /** @type {string} */ wfText) {
  const d = tmp();
  if (git(d, ["init", "-q"]).status !== 0) return { ok: false, fehler: "git init gescheitert" };
  mkdirSync(path.join(d, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(d, WF_REL), lf(wfText));
  writeFileSync(path.join(d, "p.patch"), lf(patchText));
  const check = git(d, ["apply", "--check", "p.patch"]);
  if (check.status !== 0) return { ok: false, fehler: `git apply --check: ${check.stderr.trim()}` };
  const an = git(d, ["apply", "p.patch"]);
  if (an.status !== 0) return { ok: false, fehler: `git apply: ${an.stderr.trim()}` };
  return { ok: true, text: lf(readFileSync(path.join(d, WF_REL), "utf8")) };
}

/** Führt den Schritt „Nachweis zusammenstellen“ in einem Wegwerf-Ordner aus (wie auf dem Runner) und liefert das JSON. */
function nachweisErzeugen(/** @type {any} */ wf, { proben = FELDER_535.proben, umgebung = {} } = {}) {
  const schritt = (wf?.jobs?.gate?.steps || []).find((s) => /^Nachweis zusammenstellen/.test(s?.name || ""));
  if (!schritt || typeof schritt.run !== "string") return { fehler: "Schritt „Nachweis zusammenstellen“ fehlt" };
  const d = tmp();
  mkdirSync(path.join(d, "arbeit", path.dirname(SKRIPT_REL)), { recursive: true });
  writeFileSync(path.join(d, "arbeit", SKRIPT_REL), readFileSync(path.join(WURZEL, SKRIPT_REL)));
  mkdirSync(path.join(d, "runner", "wb-proben"), { recursive: true });
  for (const p of proben) writeFileSync(path.join(d, "runner", "wb-proben", p), "ok\n");
  const env = { ...process.env, RUNNER_TEMP: path.join(d, "runner"), DIGEST: `sha256:${"d".repeat(64)}`, REVISION: "a".repeat(40),
    BAUM: "6".repeat(40), BINDUNG: "schnitt", GITHUB_SHA: "3".repeat(40), LAUF: "4242-1", ERGEBNIS: "success", ...umgebung };
  const r = spawnSync("bash", ["-c", schritt.run], { cwd: path.join(d, "arbeit"), env, encoding: "utf8" });
  if (r.status !== 0) return { fehler: `Nachweisschritt Exit ${r.status}: ${r.stderr}` };
  try {
    const roh = readFileSync(path.join(d, "arbeit", "staging-nachweis", "staging-nachweis.json"));
    return { roh, nachweis: JSON.parse(roh.toString("utf8")), env };
  } catch (e) { return { fehler: `kein Nachweis: ${e}` }; }
}

/** Prüft einen Nachweis gegen FELDER_535 (und die Werte, die der Lauf gesetzt hat). Leer = bestanden. */
function nachweisBefunde(/** @type {any} */ nw, /** @type {any} */ env) {
  const b = [];
  if (!nw || typeof nw !== "object") return ["Nachweis ist kein Objekt"];
  for (const f of FELDER_535.pflicht) if (!(f in nw) || nw[f] === null || nw[f] === undefined) b.push(`Nachweis: Feld ${f} fehlt`);
  if (nw.ergebnis !== FELDER_535.ergebnis && env.ERGEBNIS === "success") b.push(`Nachweis: ergebnis ${nw.ergebnis}`);
  if (nw.digest !== env.DIGEST) b.push("Nachweis: digest ≠ Eingabe");
  if (nw.commit !== env.REVISION) b.push("Nachweis: commit ≠ Bild-Commit (Label)");
  if (nw.laufCommit !== env.GITHUB_SHA) b.push("Nachweis: laufCommit ≠ GITHUB_SHA");
  if (!/^[0-9a-f]{40}$/.test(String(nw.baum)) || nw.baum !== env.BAUM) b.push("Nachweis: baum ≠ Baum des Bild-Commits");
  if (!FELDER_535.lauf.test(String(nw.lauf)) || nw.lauf !== env.LAUF) b.push("Nachweis: lauf nicht run_id-run_attempt");
  if (!(Date.parse(nw.erstellt) > 0)) b.push("Nachweis: erstellt kein Zeitstempel");
  const wb = nw.widerrufbuch || {};
  if (wb.art !== FELDER_535.art) b.push(`Nachweis: widerrufbuch.art ${wb.art}`);
  const proben = wb.proben && typeof wb.proben === "object" ? wb.proben : {};
  if (JSON.stringify(Object.keys(proben)) !== JSON.stringify(FELDER_535.proben)) b.push("Nachweis: proben nicht genau S1–S6");
  if (wb.skriptSha256 !== sha256(readFileSync(path.join(WURZEL, SKRIPT_REL)))) b.push("Nachweis: skriptSha256 ≠ SHA-256 des Skripts");
  return b;
}

const SHA_PIN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\/-]+@[0-9a-f]{40}$/;
const restic = (/** @type {string} */ t, /** @type {string} */ n) => (t.match(new RegExp(`${n}: "([^"]+)"`)) || [])[1];

/** (b)+(c): alle Sicherheits- und Formatregeln für die (gepatchte) Workflow-Datei. Leer = bestanden. */
function befundeEW3(/** @type {string} */ text) {
  const b = [];
  /** @type {any} */
  let wf;
  try { wf = yaml.load(text); } catch (e) { return [`kein gültiges YAML: ${e}`]; }
  if (!wf || typeof wf !== "object" || !wf.jobs) return ["keine Jobs"];
  const on = wf.on ?? wf.true; // js-yaml: Schlüssel on
  if (JSON.stringify(Object.keys(on || {})) !== '["workflow_dispatch"]') b.push("Auslöser: nicht genau workflow_dispatch");
  if (JSON.stringify(Object.keys(on?.workflow_dispatch?.inputs || {})) !== '["digest"]') b.push("Eingaben: nicht genau digest");
  /* Textregeln nur auf Zeilen ohne Kommentar (der Kopf nennt verbotene Auslöser ausdrücklich). */
  const code = text.split("\n").filter((z) => !/^\s*#/.test(z)).join("\n");
  if (/pull_request_target|workflow_run|workflow_call|repository_dispatch|schedule:/.test(code)) b.push("verbotener Auslöser im Text");
  if (JSON.stringify(wf.permissions) !== JSON.stringify({ contents: "read" })) b.push("Rechte: Workflow nicht genau contents: read");
  if (/write-all|:\s*write\b/.test(code)) b.push("Rechte: Schreibrecht im Text");
  for (const [name, job] of Object.entries(wf.jobs)) {
    const p = /** @type {any} */ (job).permissions;
    if (!p || typeof p !== "object") { b.push(`Rechte: Job ${name} ohne eigene Vorgabe`); continue; }
    for (const [scope, wert] of Object.entries(p)) {
      if (wert !== "read" || !["contents", "packages"].includes(scope)) b.push(`Rechte: Job ${name} ${scope}: ${wert}`);
    }
    if (/** @type {any} */ (job).environment !== undefined) b.push(`Job ${name}: environment`);
  }
  const gate = wf.jobs.gate || {};
  if (!String(gate.if || "").includes("vars.STAGING_GATE_AKTIV == 'true'")) b.push("Gate nicht an STAGING_GATE_AKTIV gebunden");
  const schritte = Array.isArray(gate.steps) ? gate.steps : [];
  for (const s of schritte) {
    if (typeof s.uses === "string" && !SHA_PIN.test(s.uses.trim())) b.push(`uses ohne 40-Zeichen-SHA: ${s.uses}`);
    if (typeof s.run === "string" && /\$\{\{\s*(inputs\.|github\.event\.inputs|secrets\.)/.test(s.run)) b.push(`Ausdruck mit Eingabe/Secret direkt in run: ${s.name}`);
  }
  b.push(...actionsPruefen(text, "staging-gate.yml").befunde.map((x) => `Pin: ${typeof x === "string" ? x : JSON.stringify(x)}`));
  const secrets = [...code.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
  if ([...new Set(secrets)].join(",") !== "GITHUB_TOKEN") b.push(`Secrets: ${[...new Set(secrets)].join(",") || "keins"} (erlaubt nur GITHUB_TOKEN)`);
  const mitSecret = schritte.filter((s) => JSON.stringify(s.env || {}).includes("secrets."));
  if (mitSecret.length !== 1 || !/^Bild per Digest ziehen/.test(mitSecret[0].name) || !/docker login ghcr\.io[^\n]*--password-stdin/.test(mitSecret[0].run)) {
    b.push("Secrets: GITHUB_TOKEN nicht allein im Zieh-Schritt für docker login --password-stdin");
  }
  if (/docker (push|tag)\b|\bssh\b|\bscp |\brsync |DEPLOY_|deploy\/(deploy|ruecksprung|abschalten)\.sh|^\s*environment:/m.test(code)) b.push("Auslieferung/SSH/Umgebung im Workflow");
  const co = schritte.find((s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"));
  if (!co || co.with?.["persist-credentials"] !== false) b.push("checkout ohne persist-credentials: false");
  if (!co || co.with?.["fetch-depth"] !== 0) b.push("checkout ohne fetch-depth: 0 (B-3 braucht M)");
  const zieh = schritte.find((s) => /^Bild per Digest ziehen/.test(s.name || ""))?.run || "";
  for (const [teil, was] of [
    ['[ "$rev" = "$GITHUB_SHA" ]', "Bindung: alte Zeile (Lauf auf dem Bild-Commit)"],
    ['[[ "$rev" =~ ^[0-9a-f]{40}$ ]]', "Bindung: Label nicht als 40 Hex geprüft"],
    ['git rev-list --parents -n 1 "$rev" | wc -w)" -eq 3', "Bindung: genau zwei Eltern"],
    ['"$(git rev-parse "$rev^2")" = "$GITHUB_SHA"', "Bindung: zweiter Elter = GITHUB_SHA"],
    ['"$(git rev-parse "$rev^{tree}")" = "$(git rev-parse "$GITHUB_SHA^{tree}")"', "Bindung: gleicher Baum"],
    ['git merge-base --is-ancestor "$GITHUB_SHA" "$rev"', "Bindung: Vorfahr"],
    ['echo "BAUM=$(git rev-parse "$rev^{tree}")" >> "$GITHUB_ENV"', "Bindung: BAUM für den Nachweis"],
    ['docker pull "$BILD_REPO@$ALT_DIGEST"', "S1: Bild der Basis per Digest"],
  ]) if (!zieh.includes(teil)) b.push(was);
  if (wf.env?.ALT_DIGEST !== RP.KONFIG_STANDARD.ohneRevisionslabel.find((o) => o.commit === C274)?.digest) b.push("ALT_DIGEST ≠ Digest von 274bfa0 im Werkzeug");
  const sich = lesen(".github/workflows/betrieb-sicherung.yml");
  for (const n of ["RESTIC_VERSION", "RESTIC_SHA256"]) if (!restic(sich, n) || restic(text, n) !== restic(sich, n)) b.push(`${n} ≠ betrieb-sicherung.yml`);
  if (!schritte.some((s) => /sha256sum -c -/.test(s.run || "") && /restic_\$\{RESTIC_VERSION\}_linux_amd64\.bz2/.test(s.run || ""))) b.push("restic nicht gepinnt mit Prüfsumme");
  const lauf = (/** @type {RegExp} */ r) => schritte.find((s) => r.test(s.run || ""));
  const s13 = lauf(/bash deploy\/sicherung\/ci\/widerrufbuch-staging\.sh/);
  if (!s13 || !/WB_PROBEN="\$RUNNER_TEMP\/wb-proben"/.test(s13.run) || s13.if !== undefined) b.push("S1–S3: Schritt fehlt oder ohne Probenordner");
  const s46 = lauf(/BILD="\$BILD" bash deploy\/sicherung\/ci\/widerrufbuch-ende-zu-ende\.sh/);
  if (!s46) b.push("S4–S6: widerrufbuch-ende-zu-ende.sh nicht mit BILD=\"$BILD\" (Digest-Bild) aufgerufen");
  else for (const p of ["S4", "S5", "S6"]) if (!s46.run.includes(`"$WB_PROBEN/${p}"`)) b.push(`${p}: keine Marke`);
  if (/docker build|build-push-action/.test(code)) b.push("Bild wird gebaut statt per Digest gezogen");
  const up = schritte.find((s) => typeof s.uses === "string" && s.uses.startsWith("actions/upload-artifact@"));
  if (!up || up.with?.name !== FELDER_535.artefakt || !String(up.with?.path || "").includes("staging-nachweis/staging-nachweis.json") || !String(up.if || "").includes("always()")) {
    b.push(`Artefakt ${FELDER_535.artefakt} mit staging-nachweis.json fehlt`);
  }
  if (!(Number(up?.with?.["retention-days"]) >= 7 && Number(up?.with?.["retention-days"]) <= 30)) b.push("Artefakt: Aufbewahrung nicht 7–30 Tage");
  const erg = nachweisErzeugen(wf);
  if (erg.fehler) b.push(erg.fehler);
  else b.push(...nachweisBefunde(erg.nachweis, erg.env));
  return b;
}

const patchText = lesen(PATCH_REL);
const vollText = lesen(VOLL_REL);
const wfIst = lesen(WF_REL);
/** Nach der Übernahme durch den Betreiber ist die Workflow-Datei die Vollfassung; dann wird sie selbst geprüft. */
const ende = (/** @type {string} */ s) => s.replace(/\s+$/, "") + "\n"; // der Web-Editor setzt den letzten Zeilenumbruch selbst
const uebernommen = ende(wfIst) === ende(vollText);
const angewandt = uebernommen ? { ok: true, text: wfIst } : patchAnwenden(patchText, wfIst);
const gepatcht = angewandt.ok ? angewandt.text : "";

describe("GATE-EW3 (a)/(b): Patch passt zur Workflow-Datei der Integration", () => {
  it("git apply --check und git apply auf einer Kopie gelingen (oder der Patch ist schon übernommen)", () => {
    expect(angewandt.fehler ?? null).toBeNull();
    expect(angewandt.ok).toBe(true);
    if (uebernommen) expect(git(WURZEL, ["apply", "--reverse", "--check", "--cached", PATCH_REL]).status).toBe(0);
  });

  it("der Patch ändert genau eine Datei: .github/workflows/staging-gate.yml", () => {
    const dateien = [...patchText.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => [m[1], m[2]]);
    expect(dateien).toEqual([[WF_REL, WF_REL]]);
    expect(patchText).toMatch(/^--- a\/\.github\/workflows\/staging-gate\.yml$/m);
    expect(patchText).toMatch(/^\+\+\+ b\/\.github\/workflows\/staging-gate\.yml$/m);
  });

  it("Ergebnis ist gültiges YAML und gleich der Vollfassung für den Web-Editor", () => {
    expect(() => yaml.load(gepatcht)).not.toThrow();
    expect(gepatcht).toBe(vollText);
  });
});

describe("GATE-EW3 (c): Sicherheit und Nachweisformat der gepatchten Datei", () => {
  it("keine Befunde: Rechte, Pins, Secrets, Auslöser, Bindung B-3, S1–S6, Artefakt, Nachweis", () => {
    expect(befundeEW3(gepatcht)).toEqual([]);
  });

  it.skipIf(uebernommen)("Gegenprobe: die Workflow-Datei OHNE Patch erfüllt EW3 nicht (B-3, S1–S6, Nachweisfelder fehlen)", () => {
    const b = befundeEW3(wfIst).join("\n");
    expect(b).toMatch(/fetch-depth/);
    expect(b).toMatch(/zweiter Elter/);
    expect(b).toMatch(/S1–S3/);
    expect(b).toMatch(/Feld laufCommit fehlt|Feld baum fehlt/);
  });

  it("Rechte genau contents: read; der Job zusätzlich nur packages: read", () => {
    const wf = yaml.load(gepatcht);
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.jobs.gate.permissions).toEqual({ contents: "read", packages: "read" });
  });

  it("Nachweis hat alle von #535 verlangten Felder mit den Werten des Laufs", () => {
    const erg = nachweisErzeugen(yaml.load(gepatcht));
    expect(erg.fehler ?? null).toBeNull();
    const nw = erg.nachweis;
    expect(nw).toMatchObject({ digest: `sha256:${"d".repeat(64)}`, commit: "a".repeat(40), laufCommit: "3".repeat(40), baum: "6".repeat(40),
      lauf: "4242-1", ergebnis: "success", widerrufbuch: { art: FELDER_535.art,
        proben: { S1: "ok", S2: "ok", S3: "ok", S4: "ok", S5: "ok", S6: "ok" }, skriptSha256: sha256(readFileSync(path.join(WURZEL, SKRIPT_REL))) } });
    // zeit-ok: der Nachweisschritt setzt erstellt mit der echten Uhr (Kindprozess, keine Fake-Timer möglich); nur Plausibilität ±10 min
    expect(Math.abs(Date.parse(nw.erstellt) - Date.now())).toBeLessThan(10 * 60_000);
    expect(nachweisBefunde(nw, erg.env)).toEqual([]);
  });

  it("fehlt eine Probe-Marke (S5), steht im Nachweis „fehler“ — #535 lehnt ihn dann ab", () => {
    const erg = nachweisErzeugen(yaml.load(gepatcht), { proben: ["S1", "S2", "S3", "S4", "S6"] });
    expect(erg.nachweis.widerrufbuch.proben.S5).toBe("fehler");
    expect(Object.values(erg.nachweis.widerrufbuch.proben).filter((x) => x === "ok")).toHaveLength(5);
  });

  it("Nachweis ohne Geheimnisse: nur die festen Felder, keine Umgebungswerte außer den gebundenen", () => {
    const erg = nachweisErzeugen(yaml.load(gepatcht), { umgebung: { CENTRIC_ADMIN: "GEHEIM-ADMIN-123456", GHCR_TOKEN: "GEHEIM-TOKEN-654321" } });
    const roh = erg.roh.toString("utf8");
    expect(roh).not.toContain("GEHEIM");
    expect(Object.keys(erg.nachweis).sort()).toEqual(["baum", "bindung", "browserabnahme", "commit", "digest", "ergebnis", "erstellt",
      "lauf", "laufCommit", "widerrufbuch"]);
  });

  it("die aufgerufenen Skripte liegen im Repository; S1–S3 nur mit Bildern per Digest und ohne Netz für die Einmal-Container", () => {
    for (const rel of [SKRIPT_REL, STAGING_REL, "deploy/sicherung/ci/widerrufbuch-staging.mjs"]) expect(existsSync(path.join(WURZEL, rel)), rel).toBe(true);
    const sh = lesen(STAGING_REL);
    expect(sh).toContain('[[ "$b" =~ @sha256:[0-9a-f]{64}$ ]]');
    expect(sh).toMatch(/docker run --rm --network none --read-only/);
    expect(sh).not.toMatch(/docker (push|tag|build)\b|\bssh\b/);
    expect(sh).toContain('::add-mask::$PFEFFER');
  });
});

describe("GATE-EW3 Mutationsproben: jede Verletzung macht die Prüfung rot", () => {
  const mutiert = (/** @type {string} */ von, /** @type {string} */ nach) => {
    expect(gepatcht.includes(von), `Mutationsstelle fehlt: ${von}`).toBe(true);
    return befundeEW3(gepatcht.replace(von, nach));
  };
  it("M-USES: uses: ohne SHA (Tag)", () => {
    expect(mutiert("actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0", "actions/checkout@v4 # v4.4.0").join("\n"))
      .toMatch(/uses ohne 40-Zeichen-SHA/);
  });
  it("M-RECHTE: permissions: write-all", () => {
    expect(mutiert("permissions:\n  contents: read\n\nenv:", "permissions: write-all\n\nenv:").join("\n")).toMatch(/Rechte/);
  });
  it("M-RECHTE-JOB: packages: write im Job", () => {
    expect(mutiert("      packages: read", "      packages: write").join("\n")).toMatch(/Rechte/);
  });
  it("M-SECRET: zusätzliches Secret", () => {
    expect(mutiert("          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}", "          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          FREMD: ${{ secrets.DEPLOY_KEY }}").join("\n"))
      .toMatch(/Secrets/);
  });
  it("M-BAUM: Feld baum fehlt im Nachweis", () => {
    expect(mutiert("baum: process.env.BAUM || null, ", "").join("\n")).toMatch(/Feld baum fehlt/);
  });
  it("M-TRIGGER: pull_request_target", () => {
    expect(mutiert("on:\n  workflow_dispatch:", "on:\n  pull_request_target:\n  workflow_dispatch:").join("\n")).toMatch(/Auslöser/);
  });
  it("M-EINGABE: Eingabe direkt in run", () => {
    expect(mutiert('[[ "$DIGEST" =~', '[[ "${{ inputs.digest }}" =~').join("\n")).toMatch(/direkt in run/);
  });
  it("M-BINDUNG: Baumvergleich entfernt", () => {
    expect(mutiert('            && [ "$(git rev-parse "$rev^{tree}")" = "$(git rev-parse "$GITHUB_SHA^{tree}")" ] \\\n', "").join("\n"))
      .toMatch(/gleicher Baum/);
  });
  it("M-LAUFCOMMIT: laufCommit = Label statt GITHUB_SHA", () => {
    expect(mutiert("laufCommit: process.env.GITHUB_SHA", "laufCommit: process.env.REVISION").join("\n")).toMatch(/laufCommit/);
  });
  it("M-BILD: S4–S6 am lokal gebauten statt am Digest-Bild", () => {
    expect(mutiert('BILD="$BILD" bash deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh', 'BILD="centric-lokal" bash deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh').join("\n"))
      .toMatch(/S4–S6/);
  });
  it("M-DEPLOY: Umgebung produktion", () => {
    expect(mutiert("    timeout-minutes: 90\n", "    timeout-minutes: 90\n    environment: produktion\n").join("\n")).toMatch(/environment|Umgebung/);
  });
});

describe("GATE-EW3 (d): der Patch ist kein Workflow", () => {
  it("liegt nicht unter .github/ und kein Workflow verweist auf ihn", () => {
    expect(PATCH_REL.startsWith(".github/")).toBe(false);
    const wfOrdner = path.join(WURZEL, ".github", "workflows");
    const dateien = readdirSync(wfOrdner);
    expect(dateien.filter((f) => !/\.ya?ml$/.test(f))).toEqual([]);
    for (const f of dateien) expect(lesen(`.github/workflows/${f}`), f).not.toContain("workflow-patches");
  });
  it("die Vollfassung trägt keine Workflow-Endung (.yml.txt), der Ordner enthält nur Patch, Vollfassung und Doku", () => {
    expect(readdirSync(path.join(WURZEL, ORDNER_REL)).sort()).toEqual(["README.md", "RUECKBAU.md", "TESTPLAN.md", "staging-gate.gepatcht.yml.txt", "staging-gate.patch"]);
  });
});

/* ---- Abgleich mit #535, sobald es im Stand liegt (sonst übersprungen, Abhängigkeit siehe Kopf) ---- */
const KONFIG_EW = /** @type {any} */ (RP.KONFIG_STANDARD).erstwechselAusnahme?.widerrufbuchProbe;
const FIXTURE_REL = "pruefungen/fixtures/erstwechsel-gueltig.json";
const mit535 = !!KONFIG_EW;

describe("GATE-EW3 × GATE-EW1 (#535)", () => {
  it.skipIf(!mit535)("Konfiguration des Werkzeugs = lokale Felderliste (Art, Proben, Artefakt, Workflow, Skript)", () => {
    expect(KONFIG_EW.stagingArt).toBe(FELDER_535.art);
    expect([...KONFIG_EW.stagingProben]).toEqual(FELDER_535.proben);
    expect(KONFIG_EW.stagingArtefakt).toBe(FELDER_535.artefakt);
    expect(KONFIG_EW.stagingWorkflow).toBe(FELDER_535.workflow);
    expect(KONFIG_EW.stagingSkript).toBe(FELDER_535.skript);
  });

  it.skipIf(!existsSync(path.join(WURZEL, FIXTURE_REL)))("Fixture erstwechsel-gueltig.json: Lauf-Angaben passen zum Workflow", () => {
    const fx = JSON.parse(lesen(FIXTURE_REL));
    expect(fx.erstwechsel.stagingLauf.path).toBe(WF_REL);
    expect(fx.erstwechsel.stagingLauf.event).toBe(Object.keys(yaml.load(gepatcht).on)[0]);
    expect(fx.stagingLauf).toMatch(FELDER_535.lauf);
  });

  it.skipIf(!mit535 || typeof (/** @type {any} */ (RP).erstwechselPruefen) !== "function")("erstwechselPruefen: der erzeugte Nachweis besteht E6 und E7; ohne baum nicht", () => {
    const M = "a".repeat(40), S = "3".repeat(40), BAUM = "6".repeat(40), D = `sha256:${"d".repeat(64)}`;
    const pruefen = (/** @type {string} */ text) => {
      const erg = nachweisErzeugen(yaml.load(text), { umgebung: { REVISION: M, GITHUB_SHA: S, BAUM, DIGEST: D, LAUF: "4242-1" } });
      const nachweis = "docs/acc45/releases/v4-r1/nachweise/staging-nachweis.json";
      const a = { releaseId: "v4-r1", basisCommit: KONFIG_EW.basisCommit, kandidatCommit: M, schnittCommit: S, digest: D,
        nachholFristStunden: 24, repoFristStunden: 48, gueltigBis: KONFIG_EW.gueltigBis,
        staging: { lauf: "4242-1", nachweis, sha256: sha256(erg.roh) }, abbruchBedingungen: [...KONFIG_EW.abbruchBedingungen],
        nachholAblage: "docs/acc45/releases/v4-r1/nachhol/", quittung: "-" };
      const k = { releaseId: "v4-r1", kandidat: M, digest: D, basis: KONFIG_EW.basisCommit, jetztMs: Date.now(), releaseDateien: [],
        freigabe: { releaseId: "v4-r1", basisCommit: KONFIG_EW.basisCommit, kandidatCommit: M, digest: D, schnittCommit: S,
          erstwechselAusnahme: { widerrufbuchProbe: a } },
        erstwechsel: { stagingRoh: erg.roh, skriptRoh: readFileSync(path.join(WURZEL, SKRIPT_REL)), baeume: { kandidat: BAUM, schnitt: BAUM },
          kandidatEltern: ["2".repeat(40), S], stagingArtefakt: [erg.roh],
          stagingLauf: { id: 4242, run_attempt: 1, path: WF_REL, event: "workflow_dispatch", status: "completed", conclusion: "success", head_sha: S } } };
      return /** @type {any} */ (RP).erstwechselPruefen(k, RP.KONFIG_STANDARD).gruende.filter((/** @type {string} */ g) => /^E[67]:/.test(g));
    };
    expect(pruefen(gepatcht)).toEqual([]);
    expect(pruefen(gepatcht.replace("baum: process.env.BAUM || null, ", "")).join("\n")).toMatch(/^E6: .*baum/);
  });
});
