// REL-1: werkzeug/release-pruefung.mjs — Gates G1 bis G10, offline mit Fixture.
// Feste Uhr: Jede Prüfung bekommt `jetztMs` aus einer festen ISO-Zeit; das Werkzeug liest die Uhr dann nicht.
// Kein Netz: Offline-Modus, alle Git- und GitHub-Angaben kommen aus der Fixture
// (Beispiel: pruefungen/fixtures/release-pruefung-beispiel.json).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  KONFIG_STANDARD, auswerten, sammeln, freigabelisteLesen, g1Ci, g2Review, g3Schalter, g4Bild, g5Migration,
  g6Sicherung, g7Rueckweg, g8Blocker, g9Befunde, g10Freigabe, migrationsbericht, reviewNachweiseLesen,
  codeNamenFinden, vorlageLesen, wertAufloesen, abweichend, bildAngabenLesen, prsAusCommits, commitsOhnePr,
  argumenteLesen, ssotReviewBelege, freigabeSchema, basisPruefen, ausfuehrOptionen, ausfuehren, vorlageUnlesbar,
  vorlagenStandErmitteln,
} from "../werkzeug/release-pruefung.mjs";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WERKZEUG = join(WURZEL, "werkzeug", "release-pruefung.mjs");
const BEISPIEL = join(WURZEL, "pruefungen", "fixtures", "release-pruefung-beispiel.json");
const JETZT = "2026-11-20T12:00:00Z";
const JETZT_MS = Date.parse(JETZT);
const K = "a".repeat(40); // Kandidat
const B = "b".repeat(40); // voriger Release (Basis)
const D = "sha256:" + "c".repeat(64);
const D_ALT = "sha256:" + "d".repeat(64);
const PFLICHT = KONFIG_STANDARD.pflichtChecks;
const KL = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/RELEASE-SCHALTER.json"), "utf8"));
const UNFERTIG = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/RELEASE-UNFERTIG.json"), "utf8"));

const liste = (zeilen) => [
  "# Freigegebene Images", "",
  "| Digest | Commit | Datum | Abnahmebericht | Status | Grund |",
  "|---|---|---|---|---|---|",
  ...zeilen, "",
].join("\n");
const zeileListe = (d, c, status, grund = "") => `| \`${d}\` | \`${c}\` | 2026-11-20 | docs/bericht.md | ${status} | ${grund} |`;
const LISTE_OK = liste([
  zeileListe(D, K, "aktiv", "Kandidat"),
  zeileListe(D_ALT, B, "vorherig", "voriger Stand"),
  zeileListe("sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79", "64d08a4957c5374e1f04c17be2b75162c07573d2", "gesperrt", "P0-0"),
]);

const checks = (ueber = {}) => PFLICHT.map((name, i) => ({
  id: i + 1, name, status: "completed", conclusion: "success", head_sha: K, ...(ueber[name] || {}),
}));

const FREIGABE = {
  schema: 1, releaseId: "v4-r1", kandidatCommit: K, digest: D, umgebung: "produktion",
  freigegebenDurch: "Betreiber", datum: "2026-11-20", basisCommit: B,
  rueckweg: { strategie: "r0", entscheidungO1: "a", entscheidungO2: "a" },
  reviewBestaetigt: [],
  migration: { freigegeben: true, basisCommit: B, abgedeckt: ["W-4", "STARTBLOCK"], bericht: "docs/acc45/releases/v4-r1.migration.md" },
};

const SSOT = { pakete: [
  { id: "WP-1", prio: "P1", status: "INTEGRATED", strang: "acc45", pr: ["#10"], titel: "fertig" },
  { id: "WP-2", prio: "P2", status: "REVIEW", strang: "acc45", pr: ["#11"], titel: "P2 darf" },
  { id: "F-1", prio: "P2", status: "BLOCKED", strang: "folge", pr: [], titel: "P2-Befund" },
  { id: "REL-2", prio: "P1", status: "BLOCKED", strang: "folge", pr: [], titel: "Release-Prozess selbst, kein Befund" },
  // RELEASE-UNFERTIG.json nennt IMP-6 (ssotPakete); G8 verlangt das Paket in der SSOT
  { id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: [], titel: "Schichtmodelle" },
] };

const KOPF = "| PR | Modell | Urteil | Stand |\n|---|---|---|---|\n";
const NACHWEISE = JSON.parse(readFileSync(BEISPIEL, "utf8")).nachweise;
const fixtureGo = () => JSON.parse(readFileSync(BEISPIEL, "utf8"));

let w;
function datei(rel, inhalt) {
  mkdirSync(join(w, rel, ".."), { recursive: true });
  writeFileSync(join(w, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt, null, 2));
}
function repoKopie(rel) { datei(rel, readFileSync(join(WURZEL, rel), "utf8")); }

beforeEach(() => {
  w = mkdtempSync(join(tmpdir(), "rel1-"));
  datei("deploy/FREIGEGEBENE-IMAGES.md", LISTE_OK);
  datei("docs/bericht.md", "# Abnahme\n");
  repoKopie("server/lib/schalter.mjs");
  datei("server.mjs", 'if (process.env.CENTRIC_SELBSTSTART === "true") {}\n');
  repoKopie(".env.example");
  repoKopie("deploy/compose.yml");
  repoKopie("Dockerfile");
  repoKopie("docs/acc45/RELEASE-UNFERTIG.json");
  repoKopie("docs/acc45/RELEASE-SCHALTER.json");
  repoKopie("src/lib/import-schnittstelle.js");
  datei("docs/acc45/work-packages.json", SSOT);
  datei("docs/acc45/REVIEW-NACHWEIS-2026-11-20.md", "| PR | Modell | Urteil | Stand |\n|---|---|---|---|\n| #10 | Opus | 2 Runden → MERGEBAR | gemergt |\n");
  // Delta-Review 7: die Freigabe bindet die ausgelieferten Vorlagen per SHA-256 (vorlagenHashes)
  datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, vorlagenHashes: hashesIn(w, [".env.example", "deploy/compose.yml", "Dockerfile"]) });
});
function hashesIn(wurzel, pfade) {
  // Delta-Review 8: gebunden werden Mode und rohe Bytes (kein Dekodieren): sha256("100644\0" + Inhalt)
  return Object.fromEntries(pfade.map((p) => [p, createHash("sha256").update(Buffer.concat([Buffer.from("100644\0"), readFileSync(join(wurzel, p))])).digest("hex")]));
}
afterEach(() => rmSync(w, { recursive: true, force: true }));

const pruefe = (fx = fixtureGo(), opt = {}) =>
  auswerten(sammeln({ wurzel: w, offline: true, fixture: fx, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS, ...opt }));
const gateVon = (r, id) => r.gates.find((g) => g.id === id);

describe("Gesamtprüfung offline", () => {
  it("positiv: alle Gates GO; offline ist es nie freigabefähig (Exit 3, übersteuert)", () => {
    const r = pruefe();
    expect(r.gates.map((g) => [g.id, g.ergebnis, g.gruende])).toEqual(r.gates.map((g) => [g.id, "GO", []]));
    expect(r.gesamt).toBe("GO");
    expect(r.modus).toBe("offline-fixture");
    expect(r.uebersteuert).toBe(true);
    expect(r.exitCode).toBe(3);
    expect(r.vorpruefungOk).toBe(true);
    expect(r.konfigAbweichend).toBe(false);
    expect(r.basis).toBe(B);
    expect(r.paket.prs).toEqual([10, 11]);
    expect(r.paket.commitsOhnePr).toEqual([]);
    expect(r.migrationsbericht.betroffen).toEqual(["W-4"]);
  });

  it("fail-closed: leere Fixture ergibt NO-GO in jedem Gate außer G3/G7/G9", () => {
    const r = pruefe({});
    expect(r.gesamt).toBe("NO-GO");
    expect(r.exitCode).toBe(1);
    for (const id of ["G1", "G2", "G4", "G5", "G6", "G8", "G10"]) expect(gateVon(r, id).ergebnis, id).toBe("NO-GO");
  });

  it("fail-closed: ohne Freigabedatei NO-GO in G5, G7, G10", () => {
    rmSync(join(w, "docs/acc45/releases"), { recursive: true });
    const r = pruefe();
    for (const id of ["G5", "G7", "G10"]) expect(gateVon(r, id).ergebnis, id).toBe("NO-GO");
    expect(gateVon(r, "G10").gruende.join()).toMatch(/Freigabedatei fehlt/);
  });

  it("fail-closed: kaputte Freigabeliste macht G4 und G7 NO-GO", () => {
    datei("deploy/FREIGEGEBENE-IMAGES.md", liste([`| \`${D}\` | kaputt |`]));
    const r = pruefe();
    expect(gateVon(r, "G4").ergebnis).toBe("NO-GO");
    expect(gateVon(r, "G7").ergebnis).toBe("NO-GO");
  });

  it("fail-closed: unlesbare SSOT macht G8 und G9 NO-GO", () => {
    datei("docs/acc45/work-packages.json", "{ kaputt");
    const r = pruefe();
    expect(gateVon(r, "G8").ergebnis).toBe("NO-GO");
    expect(gateVon(r, "G9").ergebnis).toBe("NO-GO");
  });

  it("ohne Basis: G5 NO-GO (Basis ist Pflicht, keine Ableitung aus der Liste)", () => {
    const fx = fixtureGo();
    delete fx.basisCommit;
    const r = pruefe(fx);
    expect(gateVon(r, "G5").ergebnis).toBe("NO-GO");
    expect(r.basis).toBe(null);
  });

  it("ungültige Strukturen in der Fixture führen zu NO-GO statt Absturz", () => {
    const fx = fixtureGo();
    fx.checkRuns = [null, 5];
    fx.commits = [null];
    expect(() => pruefe(fx)).not.toThrow();
    const r = pruefe(fx);
    expect(gateVon(r, "G1").ergebnis).toBe("NO-GO");
    expect(gateVon(r, "G2").ergebnis).toBe("NO-GO");
  });
});

describe("G1 CI", () => {
  const g1 = (runs) => g1Ci(runs, K, KONFIG_STANDARD);
  it("fehlender Pflicht-Check → NO-GO", () => {
    const g = g1(checks().filter((c) => c.name !== "bild-scan"));
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/bild-scan/);
  });
  it("laufender, fehlgeschlagener oder übersprungener Pflicht-Check → NO-GO", () => {
    for (const ueber of [{ status: "in_progress", conclusion: null }, { conclusion: "failure" }, { conclusion: "skipped" }, { conclusion: "neutral" }]) {
      expect(g1(checks({ pruefen: ueber })).ergebnis, JSON.stringify(ueber)).toBe("NO-GO");
    }
  });
  it("Check eines anderen Commits oder ohne head_sha → NO-GO; keine Check-Runs → NO-GO", () => {
    expect(g1(checks({ muster: { head_sha: B } })).ergebnis).toBe("NO-GO");
    expect(g1(checks({ muster: { head_sha: undefined } })).ergebnis).toBe("NO-GO");
    expect(g1([]).ergebnis).toBe("NO-GO");
    expect(g1(null).ergebnis).toBe("NO-GO");
  });
  it("ein fehlgeschlagener Lauf auf demselben Kopf bleibt NO-GO, auch wenn ein späterer Lauf grün ist", () => {
    const alt = { id: 99, name: "pruefen", status: "completed", conclusion: "failure", head_sha: K };
    expect(g1([...checks(), alt]).ergebnis).toBe("NO-GO");
  });
  it("Nicht-Pflicht-Check: fehlgeschlagen oder nicht abgeschlossen → NO-GO; übersprungen → GO", () => {
    const x = (u) => ({ id: 50, name: "extra", status: "completed", conclusion: "success", head_sha: K, ...u });
    expect(g1([...checks(), x({ conclusion: "cancelled" })]).ergebnis).toBe("NO-GO");
    expect(g1([...checks(), x({ status: "queued", conclusion: null })]).ergebnis).toBe("NO-GO");
    expect(g1([...checks(), x({ status: "in_progress", conclusion: "success" })]).ergebnis).toBe("NO-GO"); // Status zählt für sich
    expect(g1([...checks(), x({ conclusion: "skipped" })]).ergebnis).toBe("GO");
  });
  it("eigener Gate-Job (release-gate) wird nicht mitgezählt, auch wenn er noch läuft", () => {
    const eigen = { id: 77, name: "release-gate", status: "in_progress", conclusion: null, head_sha: K };
    expect(g1([...checks(), eigen]).ergebnis).toBe("GO");
  });
});

describe("G2 Review und Commits ohne PR", () => {
  it("Tabellenurteil: MERGEBAR und „erledigt“ belegen; Verneinung, offene Auflagen und Ausstehendes nicht", () => {
    const b = reviewNachweiseLesen([{ datei: "x.md", text: KOPF + [
      "| #1 | Opus | 2 Runden → MERGEBAR | gemergt |",
      "| #2 | Opus | MIT AUFLAGEN → erledigt | offen |",
      "| #3 | Opus | MIT AUFLAGEN | offen |",
      "| #4 | Opus | 2 Runden (MIT AUFLAGEN, MIT AUFLAGEN) | offen |",
      "| #5 | Opus | NICHT MERGEBAR | offen |",
      "| #6 | Opus | Auflagen nicht erledigt | offen |",
      "| #7 | Opus | Review ausstehend, danach MERGEBAR | offen |",
    ].join("\n") }]);
    expect([...b.keys()]).toEqual([1, 2]);
  });
  it("die letzte Aussage zählt: eine spätere negative Zeile hebt eine frühere positive auf", () => {
    const b = reviewNachweiseLesen([
      { datei: "docs/acc45/REVIEW-NACHWEIS-2026-11-19.md", text: KOPF + "| #8 | Opus | MERGEBAR | gemergt |\n| #9 | Opus | MERGEBAR | gemergt |" },
      { datei: "docs/acc45/REVIEW-NACHWEIS-2026-11-20.md", text: KOPF + "| #8 | Opus | NICHT FREIGEGEBEN | offen |" },
    ]);
    expect([...b.keys()]).toEqual([9]);
    const c = reviewNachweiseLesen([{ datei: "y.md", text: KOPF + "| #8 | Opus | MIT AUFLAGEN | offen |\n| #8 | Opus | MIT AUFLAGEN → erledigt | offen |" }]);
    expect([...c.keys()]).toEqual([8]);
  });
  it("PR-Text allein ist kein Beleg; Selbst-Review des Autors zählt nicht", () => {
    const g = g2Review({ prs: [7], commitsOhnePr: [], prAngaben: { 7: { autor: "a", body: "Unabhängiges Review (Opus): MERGEBAR", reviews: [{ state: "APPROVED", autor: "a" }] } } });
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.manuell).toEqual(["#7"]);
  });
  it("Belege: GitHub-Review eines anderen Kontos, Dokument, SSOT, Betreiberbestätigung", () => {
    expect(g2Review({ prs: [7], commitsOhnePr: [], prAngaben: { 7: { autor: "a", kopf: "k", reviews: [{ state: "APPROVED", autor: "b", assoc: "MEMBER", commit: "k" }] } } }).ergebnis).toBe("GO");
    expect(g2Review({ prs: [7], commitsOhnePr: [], dokBelege: new Map([[7, "x"]]) }).ergebnis).toBe("GO");
    expect(g2Review({ prs: [7], commitsOhnePr: [], ssotBelege: new Map([[7, "x"]]) }).ergebnis).toBe("GO");
    expect(g2Review({ prs: [7], commitsOhnePr: [], freigabe: { reviewBestaetigt: [7] } }).ergebnis).toBe("GO");
  });
  it("SSOT-Paket mit Stufe reviewt = true belegt seine PRs; reviewt = false oder teilweise nicht", () => {
    const b = ssotReviewBelege({ pakete: [
      { id: "A", pr: ["#5"], stufen: { reviewt: { wert: true, beleg: "Opus-Review" } } },
      { id: "B", pr: ["#6"], stufen: { reviewt: { wert: "teilweise", beleg: "x" } } },
      { id: "C", pr: ["#7"], stufen: { reviewt: { wert: false, beleg: null } } },
    ] });
    expect([...b.keys()]).toEqual([5]);
    expect(ssotReviewBelege(null).size).toBe(0);
  });
  it("Commits ohne PR: direkter Commit und direkte Zusammenführung werden gefunden; Sammel-PR deckt nichts ab", () => {
    const c = (sha, eltern, betreff) => ({ sha: sha.repeat(40), eltern: eltern.map((e) => e.repeat(40)), betreff });
    const commits = [
      c("9", ["8", "7"], "Merge pull request #416 from x/release/rc-2026-11-21"),
      c("7", ["6"], "Direkt auf dem Release-Zweig"),
      c("6", ["5", "4"], "Merge pull request #12 from x/acc45/paket"),
      c("4", ["3"], "Paket"),
      c("5", ["3"], "Direkt-Merge ohne PR"),
      c("3", ["b"], "Fix etwas (#13)"),
      c("8", ["b"], "Hauptzweig direkt"),
    ];
    const best = {
      416: { gemergt: true, mergeCommit: "9".repeat(40), zweig: "release/rc-2026-11-21", commits: ["7".repeat(40), "6".repeat(40), "4".repeat(40), "5".repeat(40), "3".repeat(40)] },
      12: { gemergt: true, mergeCommit: "6".repeat(40), zweig: "acc45/paket", commits: ["4".repeat(40)] },
      13: { gemergt: true, mergeCommit: "3".repeat(40), zweig: "acc45/fix", commits: [] },
    };
    expect(commitsOhnePr(commits, KONFIG_STANDARD, best).map((x) => x.sha[0]).sort()).toEqual(["5", "7", "8"]);
    expect(prsAusCommits(commits)).toEqual([12, 13, 416]);
  });
  it("Squash mit „(PR #N)“ und GitHub-Zuordnung (Rebase-Merge) decken ab; Sammel-PR-Zuordnung nicht", () => {
    const c = (sha, eltern, betreff) => ({ sha: sha.repeat(40), eltern: eltern.map((e) => e.repeat(40)), betreff });
    expect(prsAusCommits([c("1", ["b"], "SI-P9: Härtung (PR #114)")])).toEqual([114]);
    expect(commitsOhnePr([c("1", ["b"], "SI-P9: Härtung (PR #114)")], KONFIG_STANDARD, { 114: { gemergt: true, mergeCommit: "1".repeat(40), zweig: "x", commits: [] } })).toEqual([]);
    const fx = fixtureGo();
    fx.commits.push({ sha: "4".repeat(40), eltern: [B], betreff: "rebase-gemergt" });
    fx.commits.push({ sha: "5".repeat(40), eltern: [B], betreff: "nur im Sammel-PR" });
    fx.commitPrZuordnung = { ["4".repeat(40)]: [10] };
    const r = pruefe(fx);
    expect(r.paket.commitsOhnePr.map((x) => x.sha)).toEqual(["5".repeat(40)]);
    expect(r.paket.prs).toEqual([10, 11]);
    fx.commitPrZuordnung = { ["4".repeat(40)]: [10], ["5".repeat(40)]: [] };
    expect(pruefe(fx).paket.commitsOhnePr.map((x) => x.sha)).toEqual(["5".repeat(40)]);
  });
  it("Commits ohne PR → NO-GO, außer akzeptiert mit Grund (volle 40 Zeichen)", () => {
    const ohne = [{ sha: "5".repeat(40), betreff: "Direkt" }];
    expect(g2Review({ prs: [], commitsOhnePr: ohne }).ergebnis).toBe("NO-GO");
    expect(g2Review({ prs: [], commitsOhnePr: ohne, freigabe: { akzeptierteCommits: [{ sha: "5".repeat(40), grund: "Hotfix, Review #9" }] } }).ergebnis).toBe("GO");
    expect(g2Review({ prs: [], commitsOhnePr: ohne, freigabe: { akzeptierteCommits: [{ sha: "5".repeat(40) }] } }).ergebnis).toBe("NO-GO");
    expect(g2Review({ prs: [], commitsOhnePr: undefined }).ergebnis).toBe("NO-GO");
  });
  it("Gesamtlauf: ein Commit ohne PR macht G2 NO-GO; offene PRs stehen unter manuelleBestaetigungen", () => {
    const fx = fixtureGo();
    fx.commits.push({ sha: "4".repeat(40), eltern: [B], betreff: "Direkt gepusht" });
    fx.commits.push({ sha: "6".repeat(40), eltern: [B], betreff: "Neu (#12)" });
    fx.prBestaetigung[12] = { gemergt: true, mergeCommit: "6".repeat(40), zweig: "acc45/neu", commits: [] };
    const r = pruefe(fx);
    expect(gateVon(r, "G2").ergebnis).toBe("NO-GO");
    expect(r.paket.commitsOhnePr.map((x) => x.sha)).toEqual(["4".repeat(40)]);
    expect(r.manuelleBestaetigungen).toEqual(["G2: #12", "G2: Commit 4444444444 Direkt gepusht"]);
  });
});

describe("G3 Schalter und unfertige Funktionen", () => {
  const vorlage = (text, art = "env") => [{ pfad: "v", art, pflicht: true, text }];
  const qt = { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" };
  const g3 = (text, art = "env", x = {}) => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, vorlagen: vorlage(text, art), unfertig: UNFERTIG, quelltexte: qt, ...x }, KONFIG_STANDARD);

  it("Code-Namen: jeder CENTRIC_-Name im Server, auch indirekt gelesen", () => {
    expect(codeNamenFinden(['env("CENTRIC_A_B")', "process.env.CENTRIC_X === '1'", "CENTRIC_"])).toEqual(["CENTRIC_A_B", "CENTRIC_X"]);
  });
  it("unklassifizierter Name im Code → NO-GO (fail-closed)", () => {
    const g = g3("", "env", { codeNamen: ["CENTRIC_NEU_UNBEKANNT"] });
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/CENTRIC_NEU_UNBEKANNT/);
  });
  it("Werte wie im Server: trim und Kleinschreibung; Vorgabewerte in ${…} zählen", () => {
    expect(wertAufloesen("<OPTIONAL>")).toBe(null);
    expect(wertAufloesen("${CENTRIC_DEMO}")).toBe(null);
    expect(wertAufloesen("${CENTRIC_DEMO:?fehlt}")).toBe(null);
    expect(wertAufloesen("${CENTRIC_DEMO:-true}")).toBe("true");
    expect(wertAufloesen("${CENTRIC_DEMO-true}")).toBe("true");
    expect(wertAufloesen("${X:-${Y:-an}}")).toBe("an");
    expect(abweichend("TRUE", ["aus"])).toBe(true);
    expect(abweichend(" AN ", ["vorschau", "aus"])).toBe(true);
    expect(abweichend("Vorschau", ["vorschau", "aus"])).toBe(false);
    expect(abweichend("", ["aus"])).toBe(false);
  });
  it("aktive Schalter in allen Schreibweisen → NO-GO", () => {
    for (const [t, art] of [
      ["CENTRIC_DEMO=true\n", "env"], ["CENTRIC_DEMO=TRUE\n", "env"], ["CENTRIC_DEMO=${CENTRIC_DEMO:-true}\n", "env"],
      ["    environment:\n      - CENTRIC_DEMO=true\n", "compose"], ["    environment:\n      CENTRIC_DEMO: \"true\"\n", "compose"],
      ["ENV A=1 \\\n    CENTRIC_DEMO=true\n", "dockerfile"], ["CENTRIC_MAILBESTAETIGUNG=angebot\n", "env"],
      ["CENTRIC_TESTRAUM_MAIL=Ja\n", "env"], ["CENTRIC_KETTE_AUS=1\n", "env"], ["CENTRIC_PRUEFLINK=ja\n", "env"],
      ["CENTRIC_ZUSTELL_SPERREN_AUFHEBEN=ja\n", "env"], ["CENTRIC_DATENSCHUTZLAUF=AN\n", "env"], ["CENTRIC_AUFRAEUMEN=aus\n", "env"],
    ]) expect(g3(t, art).ergebnis, t).toBe("NO-GO");
  });
  it("sichere Werte und sicher-aktive Schalter → GO", () => {
    for (const t of ["# CENTRIC_DEMO=true\n", "CENTRIC_DEMO=false\n", "CENTRIC_DATENSCHUTZLAUF=vorschau\n", "CENTRIC_ZWEIFAKTOR_PFLICHT=1\n",
      "CENTRIC_AUFRAEUMEN=an\n", "VAPID_PRIVATE=<OPTIONAL>\n"]) expect(g3(t).ergebnis, t).toBe("GO");
    // Delta-Review 6: kein „$“ in env-Vorlagen, auch nicht als Selbstbezug
    expect(g3("CENTRIC_DEMO=${CENTRIC_DEMO}\n").ergebnis).toBe("NO-GO");
  });
  it("unfertige Funktion aktiv (Push-Schlüssel, Schichtmodell) → NO-GO", () => {
    for (const t of ["VAPID_PRIVATE=echterwert\n", "CENTRIC_SCHICHTMODELL_PFLEGE=true\n", "CENTRIC_SCHICHTMODELL_WIRKUNG=an\n", "RESEND_API_KEY=${RESEND_API_KEY:-x}\n"]) {
      expect(g3(t).ergebnis, t).toBe("NO-GO");
    }
  });
  it("Oberflächenkonstante, fehlende Pflichtvorlage, fehlende Listen → NO-GO", () => {
    expect(g3("", "env", { quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = true;" } }).ergebnis).toBe("NO-GO");
    expect(g3(null).ergebnis).toBe("NO-GO");
    expect(g3("", "env", { unfertig: null }).ergebnis).toBe("NO-GO");
    expect(g3("", "env", { klassen: null }).ergebnis).toBe("NO-GO");
    expect(g3("", "env", { codeNamen: [] }).ergebnis).toBe("NO-GO");
  });
  it("Repository-Stand: echte Vorlagen und echter Server-Code bestehen G3", () => {
    const e = sammeln({ wurzel: WURZEL, offline: true, fixture: {}, jetztMs: JETZT_MS });
    const g = g3Schalter({ codeNamen: e.codeNamen, klassen: e.klassen, vorlagen: e.vorlagen, unfertig: e.unfertig, quelltexte: e.quelltexte }, KONFIG_STANDARD);
    expect(g.gruende).toEqual([]);
    expect(e.codeNamen.length).toBeGreaterThan(50);
  }, 60_000); // liest den ganzen Server-Code
});

describe("G4 Bild und Freigabeliste", () => {
  const l = freigabelisteLesen(LISTE_OK);
  const bild = (x = {}) => bildAngabenLesen({ abgefragtAm: "2026-11-20T11:00:00Z", digest: D, revision: K, provenienzRevision: K, ...x });
  const fall = (x) => g4Bild({ digest: D, kandidat: K, bild: bild(), liste: l, berichtVorhanden: true, jetztMs: JETZT_MS, ...x }, KONFIG_STANDARD).ergebnis;
  it("Repository-Liste ist nach den Regeln gültig", () => {
    expect(freigabelisteLesen(readFileSync(join(WURZEL, "deploy/FREIGEGEBENE-IMAGES.md"), "utf8")).fehler).toEqual([]);
  });
  it("roh (imagetools-ähnlich, in Hülle): Label und Provenienz werden tief gefunden", () => {
    const b = bildAngabenLesen({ abgefragtAm: "2026-11-20T11:00:00Z", roh: { manifest: { digest: D }, image: { config: { Labels: { "org.opencontainers.image.revision": K } } },
      provenance: { SLSA: { runDetails: { metadata: { "https://mobyproject.org/buildkit@v1#metadata": { vcs: { revision: K } } } } } } } });
    expect(b).toEqual({ digest: D, labels: [K], provenienz: [K], abgefragtAm: "2026-11-20T11:00:00Z" });
  });
  it("Digest-Format: zu kurz, mit Anhang, ohne Präfix → NO-GO", () => {
    expect(fall({})).toBe("GO");
    expect(fall({ digest: "sha256:cccc" })).toBe("NO-GO");
    expect(fall({ digest: D + "0" })).toBe("NO-GO");
    expect(fall({ digest: "x" + D })).toBe("NO-GO");
    for (const d of ["x" + D, D + "0", "sha256:cccc"]) {
      const g = g4Bild({ digest: d, kandidat: K, bild: bild({ digest: d }), liste: l, berichtVorhanden: true, jetztMs: JETZT_MS }, KONFIG_STANDARD);
      expect(g.gruende.join(), d).toMatch(/nicht sha256:<64 hex>/);
    }
  });
  it("fehlendes Label, falsche Provenienz, fehlende Provenienz, fehlende Bildangaben, fehlender Bericht → NO-GO", () => {
    expect(fall({ bild: bildAngabenLesen({ abgefragtAm: "2026-11-20T11:00:00Z", digest: D, provenienzRevision: K }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ provenienzRevision: B }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ provenienzRevision: undefined }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ revision: B }) })).toBe("NO-GO");
    expect(fall({ bild: null })).toBe("NO-GO");
    expect(fall({ berichtVorhanden: false })).toBe("NO-GO");
  });
  it("Bildangaben ohne, mit alter oder künftiger Abfragezeit → NO-GO", () => {
    expect(fall({ bild: bild({ abgefragtAm: undefined }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ abgefragtAm: "2026-10-01T00:00:00Z" }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ abgefragtAm: "2026-11-21T00:00:00Z" }) })).toBe("NO-GO");
  });
  it("Digest nicht gelistet, nur vorherig, Listen-Commit ≠ Kandidat, oder gesperrt (auch fest eingebaut) → NO-GO", () => {
    const mit = (text, digest = D) => g4Bild({ digest, kandidat: K, bild: bild({ digest }), liste: freigabelisteLesen(text), berichtVorhanden: true, jetztMs: JETZT_MS }, KONFIG_STANDARD);
    expect(mit(liste([zeileListe(D_ALT, B, "aktiv")])).ergebnis).toBe("NO-GO");
    expect(mit(liste([zeileListe(D, K, "vorherig")])).ergebnis).toBe("NO-GO");
    const c = mit(liste([zeileListe(D, B, "aktiv")]));
    expect(c.ergebnis).toBe("NO-GO");
    expect(c.gruende.join()).toMatch(/Listenzeile Commit/);
    const p0 = "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79";
    const g = mit(liste([zeileListe(p0, K, "aktiv")]), p0);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/gesperrt/);
  });
  it("Listenregeln: zwei aktiv, falscher Status, Präfix ohne Sperre", () => {
    expect(freigabelisteLesen(liste([zeileListe(D, K, "aktiv"), zeileListe(D_ALT, B, "aktiv")])).fehler.join()).toMatch(/mehr als eine Zeile aktiv/);
    expect(freigabelisteLesen(liste([zeileListe(D, K, "bereit")])).fehler.join()).toMatch(/unbekannter Status/);
    expect(freigabelisteLesen(liste([zeileListe("sha256:cccccccc", K, "aktiv")])).fehler.join()).toMatch(/nicht vollständig/);
  });
});

describe("G5 Migration", () => {
  const bericht = (geaendert, neu = []) => migrationsbericht({ basis: B, kandidat: K, geaenderteDateien: geaendert, neueDateien: neu }, KONFIG_STANDARD);
  it("nichts geändert → GO ohne Freigabe", () => {
    expect(g5Migration(bericht(["src/App.jsx"]), null).ergebnis).toBe("GO");
  });
  it("Startschreib-Quelle geändert → NO-GO bis Betreiberfreigabe", () => {
    const g = g5Migration(bericht(["server/lib/kontowiderrufbuch.mjs"]), null);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/W-5/);
  });
  it("neu angelegte Quelle allein (nicht als geändert gemeldet) → NO-GO", () => {
    const b = bericht([], ["server/lib/aufraeumen.mjs"]);
    expect(b.betroffen).toEqual(["W-7"]);
    expect(g5Migration(b, null).ergebnis).toBe("NO-GO");
  });
  it("Freigabe für falsche Basis oder unvollständig → NO-GO; vollständig → GO", () => {
    const b = bericht(["server/lib/kontowiderrufbuch.mjs", "server.mjs"]);
    const f = (m) => ({ migration: { freigegeben: true, basisCommit: B, abgedeckt: ["W-5", "STARTBLOCK"], bericht: "x.md", ...m } });
    expect(g5Migration(b, f({})).ergebnis).toBe("GO");
    expect(g5Migration(b, f({ basisCommit: K })).ergebnis).toBe("NO-GO");
    expect(g5Migration(b, f({ abgedeckt: ["W-5"] })).ergebnis).toBe("NO-GO");
    expect(g5Migration(b, f({ bericht: "" })).ergebnis).toBe("NO-GO");
  });
  it("Migrationsdatei wird erkannt; ohne Diff NO-GO", () => {
    const b = bericht(["server/lib/migration-x.mjs"]);
    expect(b.verdaechtigeDateien).toEqual(["server/lib/migration-x.mjs"]);
    expect(g5Migration(b, null).ergebnis).toBe("NO-GO");
    expect(g5Migration({ fehler: "git" }, null).ergebnis).toBe("NO-GO");
    const fx = fixtureGo();
    delete fx.geaenderteDateien;
    expect(gateVon(pruefe(fx), "G5").ergebnis).toBe("NO-GO");
  });
});

describe("G6 Sicherung und Restore", () => {
  const fall = (n) => g6Sicherung(n, JETZT_MS, KONFIG_STANDARD);
  it("aktuelle Nachweise → GO", () => expect(fall(NACHWEISE).ergebnis).toBe("GO"));
  it("zu alt, in der Zukunft, fehlend, fehlerhaft, abweichend → NO-GO", () => {
    expect(fall({ ...NACHWEISE, sicherung: { ...NACHWEISE.sicherung, zeit: "2026-11-18T03:00:00Z" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, zeit: "2026-09-01T00:00:00Z" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, sicherung: { ...NACHWEISE.sicherung, zeit: "2026-11-21T03:00:00Z" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, widerrufbuchProbe: null }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, ergebnis: "fehler" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, fehlend: 2 } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, sicherung: { ...NACHWEISE.sicherung, zeit: "kaputt" } }).ergebnis).toBe("NO-GO");
    expect(fall(undefined).ergebnis).toBe("NO-GO");
  });
  it("art und ergebnis sind Pflicht (nicht nur die Zeit); Sicherung braucht snapshot_id und Dateien", () => {
    const ohne = (o, k) => { const x = { ...o }; delete x[k]; return x; };
    expect(fall({ ...NACHWEISE, restoreProbe: ohne(NACHWEISE.restoreProbe, "art") }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: ohne(NACHWEISE.restoreProbe, "ergebnis") }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, art: "sicherung" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, widerrufbuchProbe: ohne(NACHWEISE.widerrufbuchProbe, "art") }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, sicherung: ohne(NACHWEISE.sicherung, "snapshot_id") }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, sicherung: { ...NACHWEISE.sicherung, dateien: 0 } }).ergebnis).toBe("NO-GO");
  });
  it("Nachweise aus einem Verzeichnis (Dateinamen der Sicherungsskripte)", () => {
    datei("nachweise/letzte-erfolgreiche.json", NACHWEISE.sicherung);
    datei("nachweise/probe-status.json", NACHWEISE.restoreProbe);
    datei("nachweise/widerrufbuch-probe-status.json", NACHWEISE.widerrufbuchProbe);
    const fx = fixtureGo();
    delete fx.nachweise;
    expect(gateVon(pruefe(fx, { nachweise: join(w, "nachweise") }), "G6").ergebnis).toBe("GO");
  });
});

describe("G7 Rückweg", () => {
  const l = freigabelisteLesen(LISTE_OK);
  const ohneVorherig = freigabelisteLesen(liste([zeileListe(D, K, "aktiv")]));
  const fall = (liste_, r) => g7Rueckweg({ liste: liste_, kandidat: K, digest: D }, r === undefined ? null : { rueckweg: r }, KONFIG_STANDARD).ergebnis;
  it("ruecksprung braucht vorherig", () => {
    expect(fall(l, { strategie: "ruecksprung" })).toBe("GO");
    expect(fall(ohneVorherig, { strategie: "ruecksprung" })).toBe("NO-GO");
  });
  it("R0 ohne vorherig braucht O-1 und O-2", () => {
    expect(fall(ohneVorherig, { strategie: "r0", entscheidungO1: "a", entscheidungO2: "a" })).toBe("GO");
    expect(fall(ohneVorherig, { strategie: "r0", entscheidungO1: "a" })).toBe("NO-GO");
    expect(fall(ohneVorherig, { strategie: "r0" })).toBe("NO-GO");
    expect(fall(l, { strategie: "r0" })).toBe("GO");
  });
  it("ohne Strategie oder Freigabe → NO-GO", () => {
    expect(fall(l, {})).toBe("NO-GO");
    expect(fall(l)).toBe("NO-GO");
  });
});

describe("G8, G9 SSOT", () => {
  const ssot = { pakete: [
    { id: "WP-16", prio: "P1", status: "REVIEW", strang: "acc45", pr: ["#85"] },
    { id: "WP-48", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#87"] },
    { id: "V4-2b", prio: "P1", status: "BLOCKED", strang: "folge", pr: [], titel: "Variablen" },
    { id: "ABN-S2", prio: "P1", status: "BLOCKED", strang: "acc45", pr: [] },
    { id: "WP-14c", prio: "P1", status: "INTEGRATED", strang: "folge", pr: ["#368"] },
    { id: "REL-3", prio: "P1", status: "BLOCKED", strang: "folge", pr: [] },
  ] };
  it("G8: P0/P1 nicht fertig mit PR im Kandidaten → NO-GO; akzeptiert → GO", () => {
    const g = g8Blocker(ssot, [85, 87, 368], null, KONFIG_STANDARD);
    expect(g.gruende.map((x) => x.split(" ")[0])).toEqual(["WP-16", "WP-48"]);
    expect(g8Blocker(ssot, [368], null, KONFIG_STANDARD).ergebnis).toBe("GO");
    const f = { akzeptiertePakete: [{ id: "WP-16", grund: "Code ruht hinter Schalter" }, { id: "WP-48", grund: "x" }] };
    expect(g8Blocker(ssot, [85, 87], f, KONFIG_STANDARD).ergebnis).toBe("GO");
    expect(g8Blocker(ssot, [85], { akzeptiertePakete: [{ id: "WP-16" }] }, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    expect(g8Blocker(ssot, undefined, null, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
  it("G9: offene P0/P1-Befunde → NO-GO; REL-Pakete (der Release-Prozess selbst) blockieren nicht", () => {
    const g = g9Befunde(ssot, null, KONFIG_STANDARD);
    expect(g.gruende.map((x) => x.split(" ")[0])).toEqual(["V4-2b", "ABN-S2"]);
    expect(g9Befunde({ pakete: [ssot.pakete[4], ssot.pakete[5]] }, null, KONFIG_STANDARD).ergebnis).toBe("GO");
  });
  it("G9: Annahme nur mit Grund", () => {
    const f = { akzeptierteBefunde: [{ id: "V4-2b", grund: "nur Darstellung" }, { id: "ABN-S2", grund: "x" }] };
    expect(g9Befunde(ssot, f, KONFIG_STANDARD).ergebnis).toBe("GO");
    expect(g9Befunde(ssot, { akzeptierteBefunde: [{ id: "V4-2b" }, { id: "ABN-S2", grund: "x" }] }, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
});

describe("G10 Freigabe und Stand", () => {
  const STAND = { kandidatIstVorfahr: true, headGepusht: true, geaendertSeitKandidat: ["deploy/FREIGEGEBENE-IMAGES.md", "docs/acc45/releases/v4-r1.freigabe.json"] };
  const fall = (f, x = {}) => g10Freigabe({ releaseId: "v4-r1", freigabe: f, commitet: true, kandidat: K, digest: D, basis: B, stand: STAND, ...x }, KONFIG_STANDARD);
  it("passende, commitete Freigabe → GO", () => expect(fall(FREIGABE).ergebnis).toBe("GO"));
  it("abweichender Digest, Commit, Umgebung, fehlende Person, nicht commitet, ungültige ID → NO-GO", () => {
    expect(fall({ ...FREIGABE, digest: D_ALT }).ergebnis).toBe("NO-GO");
    expect(fall({ ...FREIGABE, kandidatCommit: B }).ergebnis).toBe("NO-GO");
    expect(fall({ ...FREIGABE, umgebung: "staging" }).ergebnis).toBe("NO-GO");
    expect(fall({ ...FREIGABE, freigegebenDurch: " " }).ergebnis).toBe("NO-GO");
    expect(fall(FREIGABE, { commitet: false }).ergebnis).toBe("NO-GO");
    expect(fall(FREIGABE, { commitet: undefined }).ergebnis).toBe("NO-GO"); // unbekannt = nicht commitet
    expect(fall(FREIGABE, { releaseId: "../x" }).ergebnis).toBe("NO-GO");
    expect(fall(null).ergebnis).toBe("NO-GO");
  });
  it("Stand: Kandidat nicht Vorfahr von HEAD oder andere Pfade seit dem Kandidaten geändert → NO-GO", () => {
    expect(fall(FREIGABE, { stand: { ...STAND, kandidatIstVorfahr: false } }).ergebnis).toBe("NO-GO");
    const g = fall(FREIGABE, { stand: { ...STAND, geaendertSeitKandidat: [...STAND.geaendertSeitKandidat, "server.mjs"] } });
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/server\.mjs/);
    expect(fall(FREIGABE, { stand: undefined }).ergebnis).toBe("NO-GO");
  });
  it("Schema der Freigabedatei: falsche Typen sind Fehler; andere Gates nutzen die Datei dann nicht", () => {
    expect(freigabeSchema(FREIGABE)).toEqual([]);
    expect(freigabeSchema({ ...FREIGABE, reviewBestaetigt: "412" }).join()).toMatch(/reviewBestaetigt/);
    expect(freigabeSchema({ ...FREIGABE, akzeptiertePakete: [null] }).join()).toMatch(/akzeptiertePakete/);
    expect(freigabeSchema({ ...FREIGABE, akzeptierteCommits: [{ sha: "xyz", grund: "g" }] }).join()).toMatch(/akzeptierteCommits/);
    datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, reviewBestaetigt: "412" });
    const r = pruefe();
    expect(gateVon(r, "G10").ergebnis).toBe("NO-GO");
    expect(gateVon(r, "G7").ergebnis).toBe("NO-GO");
  });
  it("Gesamtlauf: nicht commitet oder Datei ungültig → NO-GO", () => {
    const fx = fixtureGo();
    fx.freigabeCommitet = false;
    expect(gateVon(pruefe(fx), "G10").ergebnis).toBe("NO-GO");
    datei("docs/acc45/releases/v4-r1.freigabe.json", "{ kaputt");
    expect(gateVon(pruefe(), "G10").gruende.join()).toMatch(/kein gültiges JSON/);
  });
});

describe("Hilfen und Aufruf", () => {
  it("unbekannte Option, fehlender Wert und --konfig werden abgelehnt", () => {
    expect(() => argumenteLesen(["--gibtsnicht"])).toThrow(/unbekannte Option/);
    expect(() => argumenteLesen(["--digest"])).toThrow(/braucht einen Wert/);
    expect(() => argumenteLesen(["--konfig", "x.json"])).toThrow(/unbekannte Option/);
    expect(argumenteLesen(["--release-id", "x1y", "--offline"])).toEqual({ releaseId: "x1y", offline: true });
  });
  it("CLI: offline nie Exit 0 (3 bei GO, 1 bei NO-GO), 2 bei Aufruffehler; JSON auf stdout", () => {
    const fx = join(w, "fixture.json");
    writeFileSync(fx, JSON.stringify(fixtureGo()));
    const lauf = (args) => spawnSync(process.execPath, [WERKZEUG, ...args], { encoding: "utf8" });
    const basis = ["--offline", "--fixture", fx, "--wurzel", w, "--release-id", "v4-r1", "--digest", D, "--jetzt", JETZT];
    const go = lauf(basis);
    expect(go.status, go.stderr).toBe(3);
    const j = JSON.parse(go.stdout);
    expect([j.gesamt, j.modus, j.jetztUeberschrieben, j.uebersteuert]).toEqual(["GO", "offline-fixture", true, true]);
    const nogo = lauf([...basis.slice(0, -2), "--jetzt", "2027-06-01T00:00:00Z"]);
    expect(nogo.status).toBe(1);
    expect(JSON.parse(nogo.stdout).nogo).toContain("G6");
    expect(lauf(["--offline"]).status).toBe(2);
    const jetztOnline = lauf(["--kandidat", "HEAD", "--basis", "HEAD~1", "--jetzt", JETZT]);
    expect(jetztOnline.status).toBe(2); // --jetzt online verboten
    expect(jetztOnline.stderr).toMatch(/--jetzt ist nur offline/);
    const ohneBasis = lauf(["--kandidat", "HEAD"]);
    expect(ohneBasis.status).toBe(2); // --basis ist Pflicht
    expect(ohneBasis.stderr).toMatch(/--basis .*fehlt \(Pflicht/);
    expect(lauf(["--kandidat", "HEAD", "--basis", "--gibtsnicht"]).status).toBe(2);
    expect(lauf(["--kandidat", "HEAD", "--basis", "gibt-es-nicht-rel1"]).status).toBe(2); // rev-parse --verify
    expect(lauf(["--kandidat", "HEAD", "--basis", "--output=x"]).status).toBe(2); // keine Option als Revision
    writeFileSync(fx, "[null]");
    expect(lauf(basis).status).toBe(2);
    const zeigen = lauf(["--konfig-zeigen"]);
    expect(zeigen.status).toBe(0);
    expect(JSON.parse(zeigen.stdout).pflichtChecks).toEqual(PFLICHT);
  }, 120_000); // viele Kindprozesse
});

describe("Delta-Review #427: Fälschung, Basis, Wertlücken, Kandidaten-Stand", () => {
  const c = (sha, eltern, betreff) => ({ sha: sha.repeat(40), eltern: eltern.map((e) => e.repeat(40)), betreff });
  const FAELSCHUNG = [
    c("f", ["b", "e"], "Merge pull request #423 from rinats-png/fake"),
    c("e", ["b"], "boeser Commit"),
    c("9", ["f"], "noch ein boeser (#423)"),
  ];
  it("N-B1: PR-Betreff ohne GitHub-Bestätigung deckt nichts ab (auch nicht die Zweigseite)", () => {
    expect(commitsOhnePr(FAELSCHUNG).map((x) => x.sha[0]).sort()).toEqual(["9", "e", "f"]);
    const g = g2Review({ prs: prsAusCommits(FAELSCHUNG), commitsOhnePr: commitsOhnePr(FAELSCHUNG), dokBelege: new Map([[423, "x"]]) });
    expect(g.ergebnis).toBe("NO-GO");
  });
  it("N-B1: merge_commit_sha ≠ Commit, nicht gemergt oder Zweigcommit nicht im PR → nicht abgedeckt", () => {
    const best = (x) => ({ 423: { gemergt: true, mergeCommit: "f".repeat(40), zweig: "acc45/echt", commits: ["e".repeat(40)], ...x } });
    expect(commitsOhnePr(FAELSCHUNG, KONFIG_STANDARD, best()).map((x) => x.sha[0])).toEqual(["9"]);
    expect(commitsOhnePr(FAELSCHUNG, KONFIG_STANDARD, best({ mergeCommit: "1".repeat(40) })).map((x) => x.sha[0]).sort()).toEqual(["9", "e", "f"]);
    expect(commitsOhnePr(FAELSCHUNG, KONFIG_STANDARD, best({ gemergt: false })).map((x) => x.sha[0]).sort()).toEqual(["9", "e", "f"]);
    expect(commitsOhnePr(FAELSCHUNG, KONFIG_STANDARD, best({ commits: [] })).map((x) => x.sha[0]).sort()).toEqual(["9", "e"]);
    expect(commitsOhnePr(FAELSCHUNG, KONFIG_STANDARD, best({ zweig: "release/rc" })).map((x) => x.sha[0]).sort()).toEqual(["9", "e"]);
  });
  it("N-B1 Gesamtlauf: gefälschter Merge im Bereich → G2 NO-GO", () => {
    const fx = fixtureGo();
    fx.commits.unshift({ sha: "f".repeat(40), eltern: [K, "e".repeat(40)], betreff: "Merge pull request #10 from x/fake" });
    fx.commits.push({ sha: "e".repeat(40), eltern: [B], betreff: "boese" });
    const r = pruefe(fx);
    expect(r.paket.commitsOhnePr.map((x) => x.sha[0]).sort()).toEqual(["e", "f"]);
    expect(gateVon(r, "G2").ergebnis).toBe("NO-GO");
  });
  it("N-B2: leerer Commit-Bereich ist nie GO; Basis nicht in der Freigabeliste → G5 NO-GO", () => {
    expect(g2Review({ prs: [], commitsOhnePr: [] }).ergebnis).toBe("NO-GO");
    const fx = fixtureGo();
    fx.commits = [];
    expect(gateVon(pruefe(fx), "G2").ergebnis).toBe("NO-GO");
    const fy = fixtureGo();
    fy.basisCommit = "e".repeat(40);
    const g5 = gateVon(pruefe(fy), "G5");
    expect(g5.ergebnis).toBe("NO-GO");
    expect(g5.gruende.join()).toMatch(/Freigabeliste/);
  });
  it("Auflage 2: unbekannte CENTRIC_-Variable in einer Vorlage → NO-GO", () => {
    const g = g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG, quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" },
      vorlagen: [{ pfad: "v", art: "compose", pflicht: true, text: "    environment:\n      CENTRIC_NEU_FUNKTION: \"true\"\n" }] }, KONFIG_STANDARD);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/CENTRIC_NEU_FUNKTION/);
  });
  const g3 = (text, art = "env", pfad = "v", freigabe = null) => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG, freigabe,
    quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" }, vorlagen: [{ pfad, art, pflicht: true, text }] }, KONFIG_STANDARD);
  it("Auflage 3: CENTRIC_ERSTLEITUNG_STRENG ist freigabepflichtig", () => {
    expect(KL.variablen.CENTRIC_ERSTLEITUNG_STRENG.klasse).toBe("freigabepflichtig");
    expect(g3("CENTRIC_ERSTLEITUNG_STRENG=true\n").ergebnis).toBe("NO-GO");
    expect(g3("CENTRIC_ERSTLEITUNG_STRENG=true\n", "env", "v", { freigegebeneSchalter: [{ name: "CENTRIC_ERSTLEITUNG_STRENG", grund: "Bestandsanalyse 2026-12-01" }] }).ergebnis).toBe("GO");
    expect(g3("CENTRIC_ERSTLEITUNG_STRENG=true\n", "env", "v", { freigegebeneSchalter: [{ name: "CENTRIC_ERSTLEITUNG_STRENG" }] }).ergebnis).toBe("NO-GO");
    expect(g3("CENTRIC_ERSTLEITUNG_STRENG=false\n").ergebnis).toBe("GO");
  });
  it("Auflage 4: Vorbehalte und Verneinungen sind kein Beleg; Format mit Titel und Urteil-Spalte wird gelesen", () => {
    const b = reviewNachweiseLesen([{ datei: "REVIEW-NACHWEIS-a.md", text: KOPF + [
      "| #5 | x | MERGEBAR |", "| #5 | y | NICHT MERGEBAR |", "| #6 | x | unerledigt |", "| #7 | x | UNMERGEBAR |",
      "| #8 | x | MERGEBAR erst nach Behebung B1 |", "| #9 | x | NO-GO, MERGEBAR? nein |", "| #10 | x | MERGEBAR MIT AUFLAGEN (A1 offen) |",
      "| #11 | x | 2 Runden (MIT AUFLAGEN, MERGEBAR) |", "| #12 | x | MERGEBAR, dann MIT AUFLAGEN |",
    ].join("\n") }]);
    expect([...b.keys()]).toEqual([11]);
    const f = reviewNachweiseLesen([{ datei: "docs/acc45/REVIEW-NACHWEIS-2026-11-19.md", text: [
      "| PR | Geprüfter Head | Reviewer-Modell | Urteil | Wesentliche Befunde / Behebung | Merge-Commit |",
      "|---|---|---|---|---|---|",
      "| #360 BE-1 Passwörter | 050e75a0; Delta f464531c | Opus | MERGE-MIT-AUFLAGEN; Delta MERGE-OK | behoben | x |",
      "| #361 Kapern | 24242d39 | Opus | NICHT MERGEN; Delta MERGE-MIT-AUFLAGEN | offen | y |",
      "| #362 WP-28b | 414476c4 | Opus | MERGE-MIT-AUFLAGEN (nur grüne CI) | – | z |",
    ].join("\n") }]);
    expect([...f.keys()]).toEqual([360]);
  });
  it("Hinweis: CHANGES_REQUESTED nach APPROVED hebt den Beleg auf", () => {
    const pr = (reviews) => g2Review({ prs: [7], commitsOhnePr: [], anzahlCommits: 1, prAngaben: { 7: { autor: "a", kopf: "k", reviews: reviews.map((x) => ({ assoc: "COLLABORATOR", commit: "k", ...x })) } } }).ergebnis;
    expect(pr([{ state: "APPROVED", autor: "b" }])).toBe("GO");
    expect(pr([{ state: "APPROVED", autor: "b" }, { state: "CHANGES_REQUESTED", autor: "b" }])).toBe("NO-GO");
    expect(pr([{ state: "APPROVED", autor: "b" }, { state: "CHANGES_REQUESTED", autor: "c" }])).toBe("NO-GO");
    expect(pr([{ state: "CHANGES_REQUESTED", autor: "b" }, { state: "APPROVED", autor: "b" }])).toBe("GO");
  });
  it("Auflage 7: Wertlücken ${X:+w}, ARG, YAML-Flow, Leerzeichen, NODE_ENV", () => {
    expect(wertAufloesen("${X:+true}")).toBe("true");
    expect(g3("    environment:\n      CENTRIC_DEMO: ${X:+true}\n", "compose").ergebnis).toBe("NO-GO");
    expect(g3("ARG CENTRIC_DEMO=true\nENV CENTRIC_DEMO=$CENTRIC_DEMO\n", "dockerfile").ergebnis).toBe("NO-GO");
    expect(g3("    environment: { CENTRIC_DEMO: \"true\", NODE_ENV: production }\n", "compose").ergebnis).toBe("NO-GO");
    expect(g3("CENTRIC_DEMO = true\n").ergebnis).toBe("NO-GO");
    expect(g3("NODE_ENV=development\n").ergebnis).toBe("NO-GO");
    expect(g3("NODE_ENV=production\n").ergebnis).toBe("GO");
    expect(g3("    environment:\n      PORT: \"3000\"\n", "compose", "deploy/compose.yml").ergebnis).toBe("NO-GO"); // NODE_ENV Pflicht
    expect(g3("    environment:\n      NODE_ENV: production\n", "compose", "deploy/compose.yml").ergebnis).toBe("GO");
  });
  it("Hinweis: HEAD nicht gepusht → G10 NO-GO", () => {
    const fx = fixtureGo();
    fx.stand.headGepusht = false;
    expect(gateVon(pruefe(fx), "G10").ergebnis).toBe("NO-GO");
    delete fx.stand.headGepusht;
    expect(gateVon(pruefe(fx), "G10").ergebnis).toBe("NO-GO");
  });
  it("Auflage 6: --konfig-zeigen ist exklusiv", () => {
    const r = spawnSync(process.execPath, [WERKZEUG, "--konfig-zeigen", "--offline"], { encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});

describe("Auflage 5: Online-Pfad liest den Kandidaten-Stand (temporäres Git-Repo, gh-Stub)", () => {
  let repo;
  const g = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt)); };
  beforeEach(() => { repo = mkdtempSync(join(tmpdir(), "rel1-git-")); g("init", "-q"); });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("RELEASE-SCHALTER.json nur in HEAD und Arbeitsstand, nicht im Kandidaten → G3 NO-GO; Nachweise nur im Arbeitsstand → G6 NO-GO; gh mit filter=all", () => {
    schreib("server.mjs", 'process.env.CENTRIC_DEMO === "true";\n');
    schreib(".env.example", "NODE_ENV=production\n");
    schreib("docs/acc45/RELEASE-UNFERTIG.json", UNFERTIG);
    g("add", "-A"); g("commit", "-q", "-m", "Basis");
    const basis = g("rev-parse", "HEAD");
    schreib("server.mjs", 'process.env.CENTRIC_DEMO === "true"; // Kandidat\n');
    g("add", "-A"); g("commit", "-q", "-m", "Kandidat");
    const kandidat = g("rev-parse", "HEAD");
    schreib("docs/acc45/RELEASE-SCHALTER.json", KL);
    g("add", "-A"); g("commit", "-q", "-m", "HEAD danach");
    schreib("nachweise/letzte-erfolgreiche.json", NACHWEISE.sicherung);
    schreib("nachweise/probe-status.json", NACHWEISE.restoreProbe);
    schreib("nachweise/widerrufbuch-probe-status.json", NACHWEISE.widerrufbuchProbe);
    const pfade = [];
    const gh = (pfad) => { pfade.push(pfad); throw new Error("kein Netz im Test"); };
    const e = sammeln({ wurzel: repo, offline: false, kandidatSha: kandidat, basisSha: basis, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS, nachweise: "nachweise", gh });
    expect(e.klassen).toBe(null);
    expect(e.unfertig).not.toBe(null);
    expect(e.codeNamen).toEqual(["CENTRIC_DEMO"]);
    expect(e.stand.geaendertSeitKandidat).toEqual(["docs/acc45/RELEASE-SCHALTER.json"]);
    const r = auswerten(e);
    expect(gateVon(r, "G3").gruende.join()).toMatch(/RELEASE-SCHALTER\.json fehlt/);
    expect(gateVon(r, "G6").ergebnis).toBe("NO-GO");
    expect(gateVon(r, "G1").ergebnis).toBe("NO-GO");
    expect(pfade.some((p) => /check-runs\?.*filter=all/.test(p))).toBe(true);
    expect(r.modus).toBe("online");
  }, 60_000);
});

describe("Delta-Review 3 #427: Urteile, Basisbindung, Online-Pfad mit realistischem gh-Ersatz", () => {
  it("A2: nur die letzte Aussage exakt MERGEBAR / MERGE-OK / erledigt zählt", () => {
    const negativ = [
      "MERGEBAR, aber B1 ungelöst", "MERGEBAR nach Fix von B1", "MERGEBAR sobald CI grün", "MERGEBAR (Blocker B1 bleibt)",
      "MERGEBAR — widerrufen", "MERGEBAR nur für Teil A", "MERGEBAR unter Auflage", "MERGEBAR (Auflagen A1–A3)",
      "Freigabe zurückgezogen, MERGEBAR war Stand R1", "MERGEBAR? nein", "NO-GO, MERGEBAR", "kein MERGEBAR", "MERGEBAR bedingt",
      "MERGEBAR unter Vorbehalt", "MERGEBAR erst nach Behebung", "UNMERGEBAR", "unerledigt", "MERGE-MIT-AUFLAGEN",
      // je Verneinungsmuster eine Schlussaussage, die für sich exakt positiv wäre
      "kein Einwand, MERGEBAR", "CI?, MERGEBAR", "nein, MERGEBAR", "Vorbehalt B1, MERGEBAR", "bedingt, MERGEBAR",
      "erst nach Fix, MERGEBAR", "nicht final, MERGEBAR", "B1 offen, MERGEBAR", "ausstehend, MERGEBAR", "abgelehnt, MERGEBAR",
      "verweigert, MERGEBAR", "Beleg fehlt, MERGEBAR", "unerledigt, MERGEBAR",
    ];
    negativ.forEach((u, i) => {
      const b = reviewNachweiseLesen([{ datei: "x.md", text: KOPF + `| #${i + 1} | x | ${u} |` }]);
      expect(b.size, u).toBe(0);
    });
    const positiv = ["MERGEBAR", "MERGEBAR.", "2 Runden (MIT AUFLAGEN, MERGEBAR)", "MIT AUFLAGEN → erledigt", "MERGE-MIT-AUFLAGEN; Delta MERGE-OK", "2 Runden → MERGEBAR"];
    positiv.forEach((u, i) => {
      const b = reviewNachweiseLesen([{ datei: "x.md", text: KOPF + `| #${i + 1} | x | ${u} |` }]);
      expect(b.size, u).toBe(1);
    });
  });
  it("A1: Basis nur über eine Zeile aktiv oder vorherig; gesperrte Zeile reicht nicht (G5)", () => {
    const l = freigabelisteLesen(liste([zeileListe(D, K, "aktiv"), zeileListe("sha256:deadbeef", B, "gesperrt", "vorsorglich")]));
    const bericht = migrationsbericht({ basis: B, kandidat: K, geaenderteDateien: [], neueDateien: [] }, KONFIG_STANDARD);
    expect(g5Migration(bericht, null, l).ergebnis).toBe("NO-GO");
    const l2 = freigabelisteLesen(liste([zeileListe(D, K, "aktiv"), zeileListe(D_ALT, B, "vorherig")]));
    expect(g5Migration(bericht, null, l2).ergebnis).toBe("GO");
  });
  it("A1: die Freigabedatei bindet die Basis (basisCommit); fehlt oder abweichend → G10 NO-GO", () => {
    const fx = fixtureGo();
    expect(gateVon(pruefe(fx), "G10").ergebnis).toBe("GO");
    datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, basisCommit: undefined });
    expect(gateVon(pruefe(fx), "G10").gruende.join()).toMatch(/basisCommit fehlt/);
    datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, basisCommit: K });
    expect(gateVon(pruefe(fx), "G10").ergebnis).toBe("NO-GO");
  });
  it("A4: YAML-Flow als Liste environment: [\"X=w\"] → NO-GO", () => {
    const g = g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG, quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" },
      vorlagen: [{ pfad: "v", art: "compose", pflicht: true, text: "    environment: [\"CENTRIC_DEMO=true\", 'PORT=3000']\n" }] }, KONFIG_STANDARD);
    expect(g.ergebnis).toBe("NO-GO");
  });
  it("H4: akzeptierteCommits verlangt volle 40 Zeichen", () => {
    expect(freigabeSchema({ ...FREIGABE, akzeptierteCommits: [{ sha: "5555555", grund: "g" }] }).join()).toMatch(/akzeptierteCommits/);
    const ohne = [{ sha: "5".repeat(40), betreff: "x" }];
    expect(g2Review({ prs: [], commitsOhnePr: ohne, freigabe: { akzeptierteCommits: [{ sha: "5555555", grund: "g" }] } }).ergebnis).toBe("NO-GO");
  });
});

describe("Delta-Review 3 #427: temporäres Git-Repo (unabhängig von Historie und Checkout-Tiefe)", () => {
  let repo;
  const g = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
    return r.stdout.trim();
  };
  const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt)); };
  const commit = (rel, inhalt, msg) => { schreib(rel, inhalt); g("add", "-A"); g("commit", "-q", "-m", msg); return g("rev-parse", "HEAD"); };
  const merge = (zweig, msg) => { g("merge", "-q", "--no-ff", zweig, "-m", msg); return g("rev-parse", "HEAD"); };
  let basis, nebenzweig, m1, f1, m2, m3, kandidat;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "rel1-r3-"));
    g("init", "-q");
    basis = commit("server.mjs", 'process.env.CENTRIC_DEMO === "true";\n', "Basis");
    g("checkout", "-q", "-b", "fremd"); nebenzweig = commit("fremd.txt", "x", "abgezweigt"); g("checkout", "-q", "main");
    g("checkout", "-q", "-b", "f1"); f1 = commit("a.txt", "1", "Paket 1"); g("checkout", "-q", "main");
    m1 = merge("f1", "Merge pull request #1 from x/acc45/f1");
    g("checkout", "-q", "-b", "f2"); commit("b.txt", "2", "Paket 2"); g("checkout", "-q", "main");
    m2 = merge("f2", "Merge pull request #2 from x/acc45/f2");
    g("checkout", "-q", "-b", "f3"); commit("c.txt", "3", "Paket 3"); g("checkout", "-q", "main");
    m3 = merge("f3", "Merge pull request #3 from x/acc45/f3");
    kandidat = m3;
    commit("deploy/FREIGEGEBENE-IMAGES.md", liste([zeileListe(D, kandidat, "aktiv"), zeileListe(D_ALT, basis, "vorherig"),
      zeileListe("sha256:deadbeef", nebenzweig, "gesperrt", "vorsorglich")]), "Liste");
  }, 60_000); // viele git-Aufrufe; unter Last mehr als die Vorgabe von 10 s
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("N-B2/B1: Basis = Kandidat, kein Vorfahr, nicht gelistet, nur gesperrt gelistet → Exit 2 mit Grund (CLI)", () => {
    const lauf = (b, k = kandidat) => spawnSync(process.execPath, [WERKZEUG, "--wurzel", repo, "--kandidat", k, "--basis", b, "--release-id", "x1y", "--digest", D], { encoding: "utf8" });
    const gleich = lauf(kandidat);
    expect([gleich.status, gleich.stderr]).toEqual([2, expect.stringMatching(/Basis = Kandidat/)]);
    const fremd = lauf(nebenzweig);
    expect([fremd.status, fremd.stderr]).toEqual([2, expect.stringMatching(/kein Vorfahr/)]);
    const ungelistet = lauf(m1);
    expect([ungelistet.status, ungelistet.stderr]).toEqual([2, expect.stringMatching(/FREIGEGEBENE-IMAGES/)]);
    expect(basisPruefen(repo, nebenzweig, kandidat)).toMatch(/kein Vorfahr/);
    expect(basisPruefen(repo, basis, kandidat)).toBe(null);
  }, 90_000);
  it("A1: gesperrte Zeile macht keinen Commit zur Basis (basisPruefen)", () => {
    commit("deploy/FREIGEGEBENE-IMAGES.md", liste([zeileListe(D, kandidat, "aktiv"), zeileListe("sha256:deadbeef", m1, "gesperrt", "vorsorglich")]), "Angriff");
    expect(basisPruefen(repo, m1, kandidat)).toMatch(/aktiv oder vorherig/);
  });
  it("A3: realistischer gh-Ersatz — gemergt, nicht gemergt, falscher merge_commit_sha, Reviews nur paginiert", () => {
    const pr = {
      1: { merged_at: "2026-11-20T00:00:00Z", merge_commit_sha: m1, head: { ref: "acc45/f1", sha: f1 }, user: { login: "a" } },
      2: { merged_at: null, merge_commit_sha: m2, head: { ref: "acc45/f2" }, user: { login: "a" } },
      3: { merged_at: "2026-11-20T00:00:00Z", merge_commit_sha: "9".repeat(40), head: { ref: "acc45/f3" }, user: { login: "a" } },
    };
    const gh = (pfad, extra = []) => {
      const paginiert = extra.includes("--paginate") && extra.includes("--slurp");
      let m;
      if ((m = /pulls\/(\d+)\/commits/.exec(pfad))) {
        if (!paginiert) return { fehler: "nicht paginiert" };
        return [[{ sha: m[1] === "1" ? f1 : "0".repeat(40) }]];
      }
      if ((m = /pulls\/(\d+)\/reviews/.exec(pfad))) {
        if (!paginiert) return { fehler: "nicht paginiert" };
        return [[{ state: "APPROVED", user: { login: "b" }, author_association: "MEMBER", commit_id: f1 }]];
      }
      if ((m = /pulls\/(\d+)$/.exec(pfad))) return pr[m[1]];
      if (/commits\/[0-9a-f]+\/pulls/.test(pfad)) return [];
      if (/check-runs/.test(pfad)) return [{ check_runs: [] }];
      throw new Error("unbekannt: " + pfad);
    };
    const e = sammeln({ wurzel: repo, offline: false, kandidatSha: kandidat, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh });
    expect(e.prBestaetigung[1]).toEqual({ gemergt: true, mergeCommit: m1, zweig: "acc45/f1", commits: [f1] });
    expect(e.prBestaetigung[2].gemergt).toBe(false);
    const r = auswerten(e);
    const ohne = r.paket.commitsOhnePr.map((x) => x.sha);
    expect(ohne).not.toContain(m1);
    expect(ohne).not.toContain(f1);
    expect(ohne).toContain(m2); // nicht gemergt
    expect(ohne).toContain(m3); // falscher merge_commit_sha
    expect(gateVon(r, "G2").belege.join()).toMatch(/#1: GitHub-Review APPROVED von b/);
    expect(r.gates.find((x) => x.id === "G10").gruende.join()).toMatch(/nicht auf origin|gepusht/);
    expect(e.stand.headGepusht).toBe(false); // kein origin im temporären Repo
  }, 90_000);
  it("H1: gepusht heißt: ein Zweig auf origin zeigt genau auf HEAD (ls-remote)", () => {
    const fern = mkdtempSync(join(tmpdir(), "rel1-fern-"));
    try {
      spawnSync("git", ["init", "-q", "--bare", fern], { encoding: "utf8" });
      g("remote", "add", "origin", fern);
      g("push", "-q", "origin", "HEAD:refs/heads/main");
      const gh = () => { throw new Error("kein Netz"); };
      // Die Bindung an GitHub (origin-URL) wird hier auf das Test-Remote umgestellt; Zweig muss main sein.
      const konfig = { ...KONFIG_STANDARD, repoUrlMuster: "^" + fern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$" };
      const lauf = () => sammeln({ wurzel: repo, offline: false, kandidatSha: kandidat, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh }, konfig);
      expect(lauf().stand.headGepusht).toBe(true);
      commit("lokal.txt", "x", "nur lokal");
      expect(lauf().stand.headGepusht).toBe(false);
    } finally { rmSync(fern, { recursive: true, force: true }); }
  }, 90_000);
});

describe("Delta-Review 4 #427", () => {
  const KL4 = KL;
  const g3c = (text, art = "compose", pfad = "v") => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL4, unfertig: UNFERTIG,
    quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" }, vorlagen: [{ pfad, art, pflicht: true, text }] }, KONFIG_STANDARD);

  it("2: gültige Compose-Schreibweisen werden gelesen oder sind NO-GO (unlesbar)", () => {
    for (const t of [
      "    environment: [\"CENTRIC_DEMO=true\"] # Kommentar\n",
      "    environment: { CENTRIC_DEMO: \"1\" } # k\n",
      "    environment:\n      \"CENTRIC_DEMO\": \"true\"\n",
      "    environment:\n      'CENTRIC_DEMO': yes\n",
      "    environment: [\n      \"CENTRIC_DEMO=true\",\n    ]\n",
      "    environment: {\n      CENTRIC_DEMO: \"true\",\n    }\n",
      "    x: &anker\n      CENTRIC_DEMO: on\n",
      "    environment: !!map { CENTRIC_DEMO: true }\n",
    ]) expect(g3c(t).ergebnis, t).toBe("NO-GO");
  });
  it("2: eine nicht sicher lesbare Zeile mit CENTRIC_ ist NO-GO, auch wenn der Wert aus wäre", () => {
    const g = g3c("    environment: { CENTRIC_DEMO: false, A: b } extra\n");
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/nicht sicher lesbar/);
    expect(g3c("    environment:\n      CENTRIC_DEMO: \"false\"\n      NODE_ENV: production\n").ergebnis).toBe("GO");
  });
  it("2: env_file außer .env wird nicht verfolgt → NO-GO", () => {
    expect(g3c("    env_file: .env\n").ergebnis).toBe("GO");
    expect(g3c("    env_file: prod.env\n").ergebnis).toBe("NO-GO");
    expect(g3c("    env_file:\n      - .env\n      - extra.env\n").ergebnis).toBe("NO-GO");
  });
  it("3: GitHub-Review zählt nur mit Mitgliedsrolle, auf dem PR-Kopf und mit Konto", () => {
    const pr = (r) => g2Review({ prs: [7], commitsOhnePr: [], anzahlCommits: 1, prAngaben: { 7: { autor: "a", kopf: "k", reviews: [{ state: "APPROVED", autor: "b", assoc: "MEMBER", commit: "k", ...r }] } } }).ergebnis;
    expect(pr({})).toBe("GO");
    expect(pr({ assoc: "OWNER" })).toBe("GO");
    expect(pr({ assoc: "COLLABORATOR" })).toBe("GO");
    expect(pr({ assoc: "NONE" })).toBe("NO-GO");
    expect(pr({ assoc: "CONTRIBUTOR" })).toBe("NO-GO");
    expect(pr({ assoc: undefined })).toBe("NO-GO");
    expect(pr({ commit: "alt" })).toBe("NO-GO");
    expect(pr({ autor: null })).toBe("NO-GO");
    expect(g2Review({ prs: [7], commitsOhnePr: [], anzahlCommits: 1, prAngaben: { 7: { autor: "a", reviews: [{ state: "APPROVED", autor: "b", assoc: "MEMBER", commit: "k" }] } } }).ergebnis).toBe("NO-GO"); // ohne Kopf
  });
  it("4: echte Positivform — Bedingungen, Vorbehalte und fremde Teile sind kein Beleg", () => {
    for (const u of ["wenn CI grün, MERGEBAR", "unter Auflagen A1, MERGEBAR", "CI ROT, MERGEBAR", "Rückfrage — erledigt",
      "Auflage B1 offen → MERGEBAR", "falls grün → MERGEBAR", "sofern B1 → MERGEBAR", "sobald CI; MERGEBAR", "statisch MERGEBAR",
      "MERGEBAR (A1)", "Opus → MERGEBAR"]) {
      expect(reviewNachweiseLesen([{ datei: "x.md", text: KOPF + `| #1 | x | ${u} |` }]).size, u).toBe(0);
    }
    for (const u of ["MERGEBAR", "2 Runden → MERGEBAR", "3 Runden (MIT AUFLAGEN, MIT AUFLAGEN, MERGEBAR)", "MIT AUFLAGEN → erledigt",
      "NICHT MERGEN; Delta MERGE-OK", "MERGE-MIT-AUFLAGEN; Delta MERGE-OK", "Runde 1 → MERGEBAR"]) {
      expect(reviewNachweiseLesen([{ datei: "x.md", text: KOPF + `| #1 | x | ${u} |` }]).size, u).toBe(1);
    }
  });
  it("5: Tabellen ohne PR-Kopfzeile zählen nicht; die Urteil-Spalte gilt je Tabelle", () => {
    expect(reviewNachweiseLesen([{ datei: "x.md", text: "| #1 | x | MERGEBAR |" }]).size).toBe(0);
    const text = [
      "| PR | Kopf | Modell | Urteil |", "|---|---|---|---|", "| #1 | a | Opus | MERGEBAR |", "",
      "Andere Tabelle:", "| Nr | Befund | Urteil |", "|---|---|---|", "| #2 | x | MERGEBAR |", "",
      "| PR | Urteil | Stand |", "|---|---|---|", "| #3 | MERGEBAR | gemergt |",
    ].join("\n");
    expect([...reviewNachweiseLesen([{ datei: "x.md", text }]).keys()]).toEqual([1, 3]);
  });
  it("8: übersteuert auch online mit --jetzt (Exit 3); online, echte Uhr, alles GO → Exit 0", () => {
    const e = sammeln({ wurzel: w, offline: true, fixture: fixtureGo(), releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS });
    e.modus = "online";
    e.jetztUeberschrieben = false;
    const r0 = auswerten(e);
    expect([r0.gesamt, r0.uebersteuert, r0.exitCode]).toEqual(["GO", false, 0]);
    e.jetztUeberschrieben = true;
    const r3 = auswerten(e);
    expect([r3.uebersteuert, r3.exitCode]).toEqual([true, 3]);
  });
  it("8: git- und gh-Aufrufe laufen mit Zeitgrenze 60 s", () => {
    expect(ausfuehrOptionen("x").timeout).toBe(60_000);
    expect(ausfuehrOptionen("x").cwd).toBe("x");
  });
});

describe("Delta-Review 4 #427: Umbenennungen und GitHub-Zuordnung (temporäres Git-Repo)", () => {
  let repo;
  const g = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
    return r.stdout.trim();
  };
  const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), inhalt); };
  beforeEach(() => { repo = mkdtempSync(join(tmpdir(), "rel1-r4-")); g("init", "-q"); });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));
  const ghLeer = (zuordnung = {}) => (pfad) => {
    const m = /commits\/([0-9a-f]+)\/pulls/.exec(pfad);
    if (m) return zuordnung[m[1]] || [];
    if (/check-runs/.test(pfad)) return [{ check_runs: [] }];
    throw new Error("unbekannt: " + pfad);
  };

  it("1: Umbenennung mit Änderung (schreibhalt.mjs → halt.mjs) ist für G5 und G10 sichtbar", () => {
    const inhalt = Array.from({ length: 40 }, (_, i) => `export const z${i} = ${i};`).join("\n") + "\n";
    schreib("server/lib/schreibhalt.mjs", inhalt);
    g("add", "-A"); g("commit", "-q", "-m", "Basis");
    const basis = g("rev-parse", "HEAD");
    g("mv", "server/lib/schreibhalt.mjs", "server/lib/halt.mjs");
    schreib("server/lib/halt.mjs", inhalt + "export const neu = 1;\n");
    g("add", "-A"); g("commit", "-q", "-m", "Umbenennung");
    const kandidat = g("rev-parse", "HEAD");
    g("mv", "server/lib/halt.mjs", "server/lib/halt2.mjs");
    g("commit", "-q", "-m", "danach umbenannt");
    const e = sammeln({ wurzel: repo, offline: false, kandidatSha: kandidat, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: ghLeer() });
    expect(e.geaenderteDateien).toContain("server/lib/schreibhalt.mjs");
    const b = migrationsbericht({ basis, kandidat, geaenderteDateien: e.geaenderteDateien, neueDateien: e.neueDateien }, KONFIG_STANDARD);
    expect(b.betroffen).toContain("W-2");
    expect(e.stand.geaendertSeitKandidat).toEqual(expect.arrayContaining(["server/lib/halt.mjs", "server/lib/halt2.mjs"]));
  }, 90_000);
  it("8: GitHub-Zuordnung zählt nur gemergte PRs (merged_at)", () => {
    schreib("a.txt", "1"); g("add", "-A"); g("commit", "-q", "-m", "Basis");
    const basis = g("rev-parse", "HEAD");
    schreib("b.txt", "2"); g("add", "-A"); g("commit", "-q", "-m", "direkt");
    const kandidat = g("rev-parse", "HEAD");
    const offen = [{ number: 5, merged_at: null, head: { ref: "acc45/x" } }];
    const gemergt = [{ number: 5, merged_at: "2026-11-20T00:00:00Z", head: { ref: "acc45/x" } }];
    const lauf = (z) => sammeln({ wurzel: repo, offline: false, kandidatSha: kandidat, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: ghLeer({ [kandidat]: z }) });
    expect(lauf(offen).commitPrZuordnung[kandidat]).toEqual([]);
    expect(lauf(gemergt).commitPrZuordnung[kandidat]).toEqual([5]);
    expect(lauf([{ ...gemergt[0], head: { ref: "release/rc" } }]).commitPrZuordnung[kandidat]).toEqual([]);
  }, 90_000);
  it("6: gepusht nur, wenn origin das GitHub-Repository ist und HEAD auf main liegt", () => {
    schreib("a.txt", "1"); g("add", "-A"); g("commit", "-q", "-m", "Basis");
    const basis = g("rev-parse", "HEAD");
    schreib("b.txt", "2"); g("add", "-A"); g("commit", "-q", "-m", "K");
    const kandidat = g("rev-parse", "HEAD");
    const fern = mkdtempSync(join(tmpdir(), "rel1-fern4-"));
    try {
      spawnSync("git", ["init", "-q", "--bare", fern], { encoding: "utf8" });
      g("remote", "add", "origin", fern);
      g("push", "-q", "origin", "HEAD:refs/heads/nebenzweig");
      const passend = { ...KONFIG_STANDARD, repoUrlMuster: "^" + fern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$" };
      const lauf = (k) => sammeln({ wurzel: repo, offline: false, kandidatSha: kandidat, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: ghLeer() }, k).stand.headGepusht;
      expect(lauf(passend)).toBe(false); // nur auf nebenzweig
      g("push", "-q", "origin", "HEAD:refs/heads/main");
      expect(lauf(passend)).toBe(true);
      expect(lauf(KONFIG_STANDARD)).toBe(false); // origin ist nicht github.com/rinats-png/dienstplaner
    } finally { rmSync(fern, { recursive: true, force: true }); }
  }, 90_000);
});

describe("Delta-Review 5 #427: G3 als Allowlist-Grammatik", () => {
  const g3v = (text, art = "compose", pfad = "v") => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG,
    quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" }, vorlagen: [{ pfad, art, pflicht: true, text }] }, KONFIG_STANDARD);

  it("B1: jeder Fund zählt einzeln — ein späterer Aus-Wert hebt einen früheren aktiven nicht auf", () => {
    const t = "services:\n  app:\n    environment:\n      CENTRIC_DEMO: \"true\"\n  worker:\n    environment:\n      CENTRIC_DEMO: \"false\"\n";
    expect(g3v(t).ergebnis).toBe("NO-GO");
    expect(g3v("CENTRIC_DEMO=true\nCENTRIC_DEMO=false\n", "env").ergebnis).toBe("NO-GO");
    expect(g3v("ENV CENTRIC_DEMO=true\nENV CENTRIC_DEMO=false\n", "dockerfile").ergebnis).toBe("NO-GO");
    expect(g3v("NODE_ENV=production\nNODE_ENV=development\n", "env").ergebnis).toBe("NO-GO");
  });
  it("B2: unvollständige Flow-Zeile und Wert auf der Folgezeile sind NO-GO", () => {
    expect(g3v("    environment: {CENTRIC_DEMO: \"true\",\n      A: b }\n").ergebnis).toBe("NO-GO");
    expect(g3v("    environment:\n      CENTRIC_DEMO:\n        \"true\"\n").ergebnis).toBe("NO-GO");
    expect(g3v("    environment:\n      CENTRIC_DEMO:\n").ergebnis).toBe("NO-GO");
    expect(g3v("    environment:\n      CENTRIC_DEMO: |\n        true\n").ergebnis).toBe("NO-GO");
  });
  it("B3: env_file, extends und include nur in der erlaubten Form", () => {
    for (const t of [
      "    \"env_file\": prod.env\n", "    'env_file': .env.prod\n", "  app: { image: x, env_file: prod.env }\n",
      "    extends:\n      file: basis.yml\n      service: app\n", "include:\n  - andere.yml\n", "    env_file: [.env, prod.env]\n",
    ]) expect(g3v(t).ergebnis, t).toBe("NO-GO");
    expect(g3v("    env_file: .env\n").ergebnis).toBe("GO");
  });
  it("Allowlist: jede Zeile mit überwachtem Namen außerhalb der bekannten Formen ist NO-GO (auch Aus-Werte)", () => {
    for (const [t, art] of [
      ["    command: [\"node\", \"--x=CENTRIC_DEMO\"]\n", "compose"],
      ["RUN echo CENTRIC_DEMO\n", "dockerfile"],
      ["CENTRIC_DEMO false\n", "env"],
      ["      \"CENTRIC_DEMO=false\",\n", "compose"],
      ["    VAPID_PRIVATE:\n", "compose"],
    ]) expect(g3v(t, art).ergebnis, t).toBe("NO-GO");
    for (const [t, art] of [
      ["    environment:\n      CENTRIC_DEMO: \"false\"\n      NODE_ENV: production\n", "compose"],
      ["    environment:\n      - CENTRIC_DEMO=false\n", "compose"],
      ["    environment: { CENTRIC_DEMO: \"false\" }\n", "compose"],
      ["    image: x@${IMAGE_DIGEST:?fehlt}\n    environment:\n      CENTRIC_ZUSTAND: /zustand\n", "compose"],
      ["CENTRIC_DEMO=false # aus\n", "env"],
      ["ENV CENTRIC_DEMO=false\n", "dockerfile"],
    ]) expect(g3v(t, art).ergebnis, t).toBe("GO");
  });
  it("B4: maskierter Strich in einer Zelle verschiebt keine Spalten", () => {
    const text = KOPF + "| #1 | a \\| b | MERGEBAR | x |\n| #2 | Opus | NICHT MERGEN | x |";
    const b = reviewNachweiseLesen([{ datei: "x.md", text }]);
    expect([...b.keys()]).toEqual([1]);
    const falsch = KOPF + "| #3 | a \\| MERGEBAR | NICHT MERGEN | x |";
    expect(reviewNachweiseLesen([{ datei: "x.md", text: falsch }]).size).toBe(0);
  });
  it("B5: „erledigt“ nur direkt nach „MIT AUFLAGEN“", () => {
    for (const u of ["NICHT MERGEN, erledigt", "erledigt", "2 Runden → erledigt", "MERGEBAR, erledigt"]) {
      expect(reviewNachweiseLesen([{ datei: "x.md", text: KOPF + `| #1 | x | ${u} |` }]).size, u).toBe(0);
    }
    for (const u of ["MIT AUFLAGEN → erledigt", "MERGE-MIT-AUFLAGEN → erledigt", "2 Runden (MIT AUFLAGEN → erledigt)"]) {
      expect(reviewNachweiseLesen([{ datei: "x.md", text: KOPF + `| #1 | x | ${u} |` }]).size, u).toBe(1);
    }
  });
  it("B5/B6: PR-Autor null, Kopf null mit commit_id null sind kein Beleg", () => {
    const pr = (a) => g2Review({ prs: [7], commitsOhnePr: [], anzahlCommits: 1, prAngaben: { 7: a } }).ergebnis;
    const review = { state: "APPROVED", autor: "b", assoc: "MEMBER", commit: "k" };
    expect(pr({ autor: "a", kopf: "k", reviews: [review] })).toBe("GO");
    expect(pr({ autor: null, kopf: "k", reviews: [review] })).toBe("NO-GO");
    expect(pr({ autor: "a", kopf: null, reviews: [{ ...review, commit: null }] })).toBe("NO-GO");
  });
  it("B6: Spalten-Reset bei einer Nicht-Tabellenzeile zwischen zwei Tabellen", () => {
    const text = ["| PR | Urteil | X |", "|---|---|---|", "| #1 | MERGEBAR | x |", "Fließtext", "| #2 | MERGEBAR | x |"].join("\n");
    expect([...reviewNachweiseLesen([{ datei: "x.md", text }]).keys()]).toEqual([1]);
  });
  it("Gegenprobe: echte Vorlagen des Repositorys ohne Fehlalarm", () => {
    const e = sammeln({ wurzel: WURZEL, offline: true, fixture: {}, jetztMs: JETZT_MS });
    for (const v of e.vorlagen.filter((x) => x.text != null)) expect(vorlageUnlesbar(v.text, v.art), v.pfad).toEqual([]);
  }, 60_000);
});

describe("Delta-Review 5 #427: git und gh laufen wirklich mit Zeitgrenze", () => {
  let repo;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "rel1-r5-"));
    const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], { cwd: repo, encoding: "utf8" });
    g("init", "-q"); writeFileSync(join(repo, "a.txt"), "1"); g("add", "-A"); g("commit", "-q", "-m", "a");
    writeFileSync(join(repo, "b.txt"), "2"); g("add", "-A"); g("commit", "-q", "-m", "b");
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));
  it("jeder Aufruf über ausfuehren.exec trägt timeout 60 s (git und gh)", () => {
    const echt = ausfuehren.exec;
    const aufrufe = [];
    ausfuehren.exec = (bin, args, opt) => {
      aufrufe.push([bin, opt?.timeout]);
      if (bin === "gh") throw new Error("kein Netz im Test");
      return echt(bin, args, opt);
    };
    try {
      const k = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
      const b = spawnSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf8" }).stdout.trim();
      sammeln({ wurzel: repo, offline: false, kandidatSha: k, basisSha: b, releaseId: "x1y", digest: D, jetztMs: JETZT_MS });
    } finally { ausfuehren.exec = echt; }
    expect(aufrufe.some(([bin]) => bin === "git")).toBe(true);
    expect(aufrufe.some(([bin]) => bin === "gh")).toBe(true);
    expect(aufrufe.filter(([, t]) => t !== 60_000)).toEqual([]);
  }, 90_000);
});

describe("Delta-Review 6 #427: „\\“ und „$“ nur in benannten Formen", () => {
  const g3v = (text, art = "compose", pfad = "v", extra = {}) => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG,
    quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" }, vorlagen: [{ pfad, art, pflicht: true, text }], ...extra }, KONFIG_STANDARD);

  it("N1: Kommentar mit „\\“ verschluckt keine aktive Zeile (env, compose, Dockerfile)", () => {
    for (const [t, art] of [
      ["# Hinweis \\\nCENTRIC_DEMO=true\n", "env"],
      ["    environment:\n      # Hinweis \\\n      CENTRIC_DEMO: \"true\"\n", "compose"],
      ["    environment:\n      FOO: bar # \\\n      CENTRIC_DEMO: \"true\"\n", "compose"],
      ["# Hinweis \\\nENV CENTRIC_DEMO=true\n", "dockerfile"],
      ["ENV A=1 # x \\\n    B=2\nENV CENTRIC_DEMO=false\n", "dockerfile"],
      ["RUN echo \\\nENV CENTRIC_DEMO=true\n", "dockerfile"],
      ["ENV A=1 \\\n", "dockerfile"],
    ]) expect(g3v(t, art).ergebnis, JSON.stringify(t)).toBe("NO-GO");
  });
  it("N2: Escapes in Anführungszeichen sind unlesbar", () => {
    for (const t of [
      "    environment:\n      \"CENTRIC\\x5FDEMO\": \"true\"\n", "    environment:\n      \"CENTRIC_DEMO\": \"tr\\u0075e\"\n",
      "    environment:\n      - \"CENTRIC\\x5FDEMO=true\"\n", "    environment: { \"CENTRIC\\x5FDEMO\": \"true\" }\n",
      "    \"env\\x5Ffile\": prod.env\n", "    \"ext\\x65nds\":\n      file: x.yml\n",
    ]) expect(g3v(t).ergebnis, JSON.stringify(t)).toBe("NO-GO");
  });
  it("N3: Dockerfile mit „\\“ oder „$“ im Schlüssel ist unlesbar", () => {
    for (const t of ["ENV CENTRIC\\_DEMO=true\n", "ARG P=CENTRIC\nENV ${P}_DEMO=true\n", "ENV $P=true\n"]) {
      expect(g3v(t, "dockerfile").ergebnis, JSON.stringify(t)).toBe("NO-GO");
    }
  });
  it("N4: Verweise auf andere Werte derselben Vorlage sind NO-GO", () => {
    for (const [t, art] of [
      ["ARG HALLO=true\nENV CENTRIC_DEMO=${HALLO:-false}\n", "dockerfile"],
      ["ARG HALLO=true\nENV CENTRIC_DEMO=\"$HALLO\"\n", "dockerfile"],
      ["ENV HALLO=true\nENV CENTRIC_DEMO=$HALLO\n", "dockerfile"],
      ["ARG CENTRIC_DEMO\nENV CENTRIC_DEMO=$CENTRIC_DEMO\n", "dockerfile"],
      ["HALLO=true\nCENTRIC_DEMO=${HALLO}\n", "env"],
      ["    environment:\n      CENTRIC_DEMO: ${HALLO}\n", "compose"],
      ["    environment:\n      CENTRIC_DEMO: ${CENTRIC_DEMO:?fehlt}\n", "compose"],
      ["    environment:\n      FOO: ${BAR:?x}\n", "compose"],
      ["    command: [\"sh\", \"-c\", \"echo $HOME\"]\n", "compose"],
    ]) expect(g3v(t, art).ergebnis, JSON.stringify(t)).toBe("NO-GO");
  });
  it("benannte Formen der echten Vorlagen bleiben lesbar", () => {
    for (const [t, art] of [
      ["    image: ghcr.io/x/y@${IMAGE_DIGEST:?IMAGE_DIGEST fehlt – nur Digests}\n", "compose"],
      ["    environment:\n      STAGING_HOST: ${STAGING_HOST:?STAGING_HOST fehlt (staging.<domain>)}\n", "compose"],
      ["ARG VITE_X\nENV VITE_X=$VITE_X \\\n    VITE_Y=${VITE_Y}\n", "dockerfile"],
      ["ENV NODE_ENV=production \\\n    PORT=3000 \\\n    CENTRIC_DATEN=/data\n", "dockerfile"],
      ["RUN rm -rf /a \\\n      /b \\\n      /c\n", "dockerfile"],
    ]) expect(vorlageUnlesbar(t, art), JSON.stringify(t)).toEqual([]);
  });
  it("N5: weitere Compose-Dateien (z. B. compose.override.yml) werden geladen, aber nicht geprüft → NO-GO", () => {
    const g = g3v("    environment:\n      NODE_ENV: production\n", "compose", "v", { composeDateien: ["deploy/compose.yml", "deploy/compose.override.yml"] });
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/compose\.override\.yml/);
    expect(g3v("    environment:\n      NODE_ENV: production\n", "compose", "v", { composeDateien: ["deploy/compose.yml", "deploy/staging-o2/compose.yml"] }).ergebnis).toBe("GO");
  });
  it("N5: Repository-Stand — die gefundenen Compose-Dateien sind genau die geprüften", () => {
    const e = sammeln({ wurzel: WURZEL, offline: true, fixture: {}, jetztMs: JETZT_MS });
    expect([...e.composeDateien].sort()).toEqual(["deploy/compose.yml", "deploy/staging-o2/compose.yml"]);
  }, 60_000);

  // Eigenschaftstests: deterministischer Zufall (feste Saat), keine Uhr.
  const zufall = (saat) => () => { saat = (saat * 1103515245 + 12345) % 2147483648; return saat / 2147483648; };
  const wahl = (r, a) => a[Math.floor(r() * a.length)];
  const AKTIV = { env: "CENTRIC_DEMO=true", compose: "      CENTRIC_DEMO: \"true\"", dockerfile: "ENV CENTRIC_DEMO=true" };
  const RAUSCHEN = {
    env: ["# Hinweis \\", "# x", "FOO=bar \\", "FOO=\"a\\\"", "HALLO=$X", "A=${B:-c}", "B='x' # k \\", "", "export C=1", "D=\"#\" \\"],
    compose: ["      # Hinweis \\", "      FOO: bar # \\", "      FOO: \"a\\\"", "      X: ${Y}", "      - \"Z=1\" \\", "    environment:", "      ", "      Q: 'a # b' \\", "      R: |", "      S: >-"],
    dockerfile: ["# Hinweis \\", "RUN echo \\", "ENV A=1 # \\", "ARG H=true", "ENV B=$H \\", "LABEL x=\"\\\"", "ENV C=\"#\" \\", "", "RUN a \\\\", "ENV D=${H:-x}"],
  };
  it.each(["env", "compose", "dockerfile"])("Eigenschaft (%s): Rauschen vor/nach einer aktiven Zeile ergibt nie GO", (art) => {
    const r = zufall(art.length * 7919);
    for (let i = 0; i < 400; i++) {
      const vor = Array.from({ length: Math.floor(r() * 4) }, () => wahl(r, RAUSCHEN[art]));
      const nach = Array.from({ length: Math.floor(r() * 3) }, () => wahl(r, RAUSCHEN[art]));
      const kopf = art === "compose" ? ["services:", "  app:", "    environment:"] : [];
      const text = [...kopf, ...vor, AKTIV[art], ...nach, ""].join("\n");
      expect(g3v(text, art).ergebnis, JSON.stringify(text)).toBe("NO-GO");
    }
  });
  it.each(["env", "compose", "dockerfile"])("Eigenschaft (%s): Escape- und Verweisformen eines aktiven Schalters ergeben nie GO", (art) => {
    const schluessel = ["CENTRIC\\x5FDEMO", "CENTRIC\\_DEMO", "CENTRIC\\u005FDEMO", "${P}_DEMO", "CENTRIC_$X", "CENTRIC_DEMO"];
    const werte = ["true", "${HALLO}", "$HALLO", "${HALLO:-false}", "\"$HALLO\"", "\"tr\\u0075e\"", "${CENTRIC_DEMO:-true}"];
    for (const k of schluessel) for (const w of werte) {
      const zeile = art === "env" ? `${k}=${w}` : art === "dockerfile" ? `ENV ${k}=${w}` : `      "${k}": ${w}`;
      const vorspann = art === "env" ? "HALLO=true\nP=CENTRIC" : art === "dockerfile" ? "ARG HALLO=true\nARG P=CENTRIC" : "services:\n  app:\n    environment:\n      HALLO: \"true\"";
      const text = `${vorspann}\n${zeile}\n`;
      expect(g3v(text, art).ergebnis, JSON.stringify(text)).toBe("NO-GO");
    }
  });
});

describe("Delta-Review 6 #427: Nachschärfung gegen überlebende Mutanten", () => {
  it("„$“ im Dockerfile nur in ENV, nicht in ARG oder anderen Anweisungen", () => {
    expect(vorlageUnlesbar("ARG HALLO=$HALLO\n", "dockerfile")).not.toEqual([]);
    expect(vorlageUnlesbar("LABEL x=$X\n", "dockerfile")).not.toEqual([]);
  });
  it("„\\“ und „$“ werden auch im Zeilenkommentar erkannt (env, compose)", () => {
    expect(vorlageUnlesbar("FOO=bar # kostet $5\n", "env")).not.toEqual([]);
    expect(vorlageUnlesbar("    environment:\n      FOO: bar # \\\n", "compose")).not.toEqual([]);
  });
  it("compose.override.yml im Wurzelverzeichnis wird gefunden → G3 NO-GO", () => {
    datei("compose.override.yml", "services:\n  app:\n    environment:\n      CENTRIC_DEMO: \"true\"\n");
    const r = pruefe();
    const g = gateVon(r, "G3");
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/compose\.override\.yml/);
  });
});

describe("Delta-Review 7 #427: Scanner-Lücken B1–B6", () => {
  const g3v = (text, art = "compose", pfad = "v") => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG,
    quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" }, vorlagen: [{ pfad, art, pflicht: true, text }] }, KONFIG_STANDARD);

  it("B1: Dockerfile-Fortsetzung verbindet ohne Leerzeichen (wie Docker), auch mit CRLF", () => {
    for (const t of ["ENV CENT\\\nRIC_DEMO=true\n", "ENV X=1 CENT\\\nRIC_DEMO=true\n", "ENV CENT\\\r\nRIC_DEMO=true\r\n", "ENV CENTRIC_DE\\\nMO=true\n"]) {
      expect(g3v(t, "dockerfile").ergebnis, JSON.stringify(t)).toBe("NO-GO");
    }
  });
  it("B2/B3: Parser-Direktiven nur exakt „# syntax=docker/dockerfile:1“ in Zeile 1", () => {
    for (const t of ["# escape=`\nENV CENTRIC_DEMO=false\n", "# check=skip=all\nENV CENTRIC_DEMO=false\n", "# syntax=evil/frontend:1\nENV CENTRIC_DEMO=false\n",
      "ENV CENTRIC_DEMO=false\n# syntax=docker/dockerfile:1\n", "#syntax = docker/dockerfile:1\nENV A=1\n", "# Syntax=docker/dockerfile:1.4\nENV A=1\n"]) {
      expect(g3v(t, "dockerfile").ergebnis, JSON.stringify(t)).toBe("NO-GO");
    }
    expect(g3v("# syntax=docker/dockerfile:1\nENV CENTRIC_DEMO=false\n", "dockerfile").ergebnis).toBe("GO");
  });
  it("B4: YAML-Tag „!“ außerhalb von Anführungszeichen in compose ist unlesbar", () => {
    for (const t of ["    environment:\n      !!binary Q0VOVFJJQ19ERU1P: \"true\"\n", "    environment: { !!binary Q0VOVFJJQ19ERU1P: \"true\" }\n",
      "    environment:\n      FOO: !!str x\n"]) expect(g3v(t).ergebnis, JSON.stringify(t)).toBe("NO-GO");
    expect(g3v("    environment:\n      FOO: \"a!b\"\n").ergebnis).toBe("GO");
  });
  it("B5: Dockerfile nur bekannte Anweisungen, CMD nur in bekannter Form; compose ohne command/entrypoint", () => {
    for (const t of ["CMD [\"node\",\"--env-file=deploy/x.env\",\"server.mjs\"]\n", "ENTRYPOINT [\"sh\"]\n", "ONBUILD RUN x\n", "SHELL [\"sh\", \"-c\"]\n",
      "ADD x.env /app/\n", "CMD node server.mjs\n"]) expect(g3v(t, "dockerfile").ergebnis, JSON.stringify(t)).toBe("NO-GO");
    expect(g3v("FROM node:22\nWORKDIR /app\nCOPY . .\nRUN npm ci\nUSER node\nEXPOSE 3000\nVOLUME [\"/data\"]\nCMD [\"node\", \"server.mjs\"]\n", "dockerfile").ergebnis).toBe("GO");
    for (const t of ["    command: sh -c \"exec env CENTR''IC_DEMO=true node server.mjs\"\n", "    entrypoint: [\"sh\"]\n", "    command:\n      - node\n"]) {
      expect(g3v(t).ergebnis, JSON.stringify(t)).toBe("NO-GO");
    }
  });
  it("B6: COMPOSE_* in env-Vorlagen ist verboten", () => {
    for (const t of ["COMPOSE_FILE=compose.yml:deploy/zusatz.yaml\n", "COMPOSE_PROFILES=x\n", "export COMPOSE_PATH_SEPARATOR=:\n"]) {
      expect(g3v(t, "env").ergebnis, t).toBe("NO-GO");
    }
  });
});

describe("Delta-Review 7 #427: Vorlagen per SHA-256 an die Freigabe gebunden", () => {
  it("echte Vorlagen mit korrekter Liste → G3 GO", () => {
    expect(gateVon(pruefe(), "G3").ergebnis).toBe("GO");
  });
  it("geänderte Vorlage nach der Freigabe → G3 NO-GO (Hash)", () => {
    datei("deploy/compose.yml", readFileSync(join(w, "deploy/compose.yml"), "utf8") + "# Kommentar\n");
    const g = gateVon(pruefe(), "G3");
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/deploy\/compose\.yml.*Hash/);
  });
  it("zusätzliche Vorlage dieser Art (auch nicht geprüft) → G3 NO-GO", () => {
    datei("deploy/zusatz.env.beispiel", "A=1\n");
    expect(gateVon(pruefe(), "G3").gruende.join()).toMatch(/deploy\/zusatz\.env\.beispiel/);
    datei("deploy/x/Dockerfile.alt", "FROM x\n");
    expect(gateVon(pruefe(), "G3").gruende.join()).toMatch(/Dockerfile\.alt/);
  });
  it("fehlende Liste, fehlender Eintrag, überzähliger Eintrag → G3 NO-GO; Vorprüfung bleibt möglich", () => {
    datei("docs/acc45/releases/v4-r1.freigabe.json", FREIGABE);
    const r = pruefe();
    expect(gateVon(r, "G3").gruende.join()).toMatch(/vorlagenHashes/);
    expect(r.vorpruefungOk).toBe(true); // Bindung gehört zur Endprüfung
    const h = hashesIn(w, [".env.example", "deploy/compose.yml", "Dockerfile"]);
    const { Dockerfile: _weg, ...ohneDocker } = h;
    datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, vorlagenHashes: ohneDocker });
    expect(gateVon(pruefe(), "G3").gruende.join()).toMatch(/Dockerfile/);
    datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, vorlagenHashes: { ...h, "deploy/gibtsnicht.env": "a".repeat(64) } });
    expect(gateVon(pruefe(), "G3").gruende.join()).toMatch(/gibtsnicht/);
  });
  it("Freigabe-Schema: vorlagenHashes nur Pfad → 64 hex", () => {
    expect(freigabeSchema({ ...FREIGABE, vorlagenHashes: { a: "xyz" } }).join()).toMatch(/vorlagenHashes/);
    expect(freigabeSchema({ ...FREIGABE, vorlagenHashes: ["a"] }).join()).toMatch(/vorlagenHashes/);
  });
  it("Repository-Stand: alle Vorlagen dieser Art sind gelistet, keine unbekannte", () => {
    const e = sammeln({ wurzel: WURZEL, offline: true, fixture: {}, jetztMs: JETZT_MS });
    expect(e.vorlagenStand.unbekannt).toEqual([]);
    expect(Object.keys(e.vorlagenStand.dateien).sort()).toEqual([...KONFIG_STANDARD.gebundeneVorlagen].sort());
  }, 60_000);
  it("CLI --vorlagen-hashes gibt die Hashes des Kandidaten aus (Vorlage für die Freigabe)", () => {
    const fx = join(w, "fixture.json");
    writeFileSync(fx, JSON.stringify(fixtureGo()));
    const r = spawnSync(process.execPath, [WERKZEUG, "--offline", "--fixture", fx, "--wurzel", w, "--vorlagen-hashes"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).vorlagenHashes).toEqual(hashesIn(w, [".env.example", "deploy/compose.yml", "Dockerfile"]));
  }, 60_000);
});

describe("Delta-Review 7 #427: Nachschärfung", () => {
  it("fehlt der Vorlagenstand ganz (nicht ermittelt), ist G3 NO-GO (fail-closed)", () => {
    const e = sammeln({ wurzel: w, offline: true, fixture: fixtureGo(), releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS });
    delete e.vorlagenStand;
    expect(gateVon(auswerten(e), "G3").gruende.join()).toMatch(/Vorlagen des Kandidaten nicht ermittelbar/);
  });
});

describe("Delta-Review 8 #427: NODE_* außer NODE_ENV ist verboten", () => {
  const g3v = (text, art) => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, unfertig: UNFERTIG,
    quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" }, vorlagen: [{ pfad: "v", art, pflicht: true, text }] }, KONFIG_STANDARD);
  it("NODE_OPTIONS und andere NODE_* in allen Formaten → NO-GO", () => {
    const opt = "\"--import=data:text/javascript,process.env[String.fromCharCode(67)+'ENTRIC_DEMO']='true'\"";
    for (const [t, art] of [
      [`    environment:\n      NODE_OPTIONS: ${opt}\n`, "compose"],
      [`ENV NODE_OPTIONS=${opt}\n`, "dockerfile"],
      ["NODE_OPTIONS=--require=./x.js\n", "env"],
      ["    environment:\n      - NODE_OPTIONS=--inspect\n", "compose"],
      ["NODE_PATH=/tmp\n", "env"],
      ["ENV NODE_TLS_REJECT_UNAUTHORIZED=0\n", "dockerfile"],
    ]) expect(g3v(t, art).ergebnis, JSON.stringify(t)).toBe("NO-GO");
    expect(g3v("NODE_ENV=production\n", "env").ergebnis).toBe("GO");
  });
});

describe("Delta-Review 8 #427: Bindung an Mode und rohe Bytes (temporäres Git-Repo)", () => {
  let repo;
  const g = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
    return r.stdout.trim();
  };
  const blob = (inhalt) => {
    const r = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: inhalt, encoding: "utf8" });
    return r.stdout.trim();
  };
  const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), inhalt); };
  const stand = (k, b) => sammeln({ wurzel: repo, offline: false, kandidatSha: k, basisSha: b, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz"); } }).vorlagenStand;
  let basis;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "rel1-r8-"));
    g("init", "-q");
    schreib(".env.example", "NODE_ENV=production\n");
    schreib("Dockerfile", "FROM x\n");
    schreib("docs/demo.txt", "CENTRIC_DEMO=true\n");
    g("add", "-A"); g("commit", "-q", "-m", "Basis");
    basis = g("rev-parse", "HEAD");
  }, 60_000);
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("Symlink (Mode 120000) als Vorlage → nicht gebunden, G3 NO-GO; Ziel-Änderung ändert nichts daran", () => {
    g("rm", "-q", "--cached", ".env.example");
    g("update-index", "--add", "--cacheinfo", `120000,${blob("docs/demo.txt")},.env.example`);
    g("commit", "-q", "-m", "Symlink");
    const k = g("rev-parse", "HEAD");
    const s = stand(k, basis);
    expect(s.dateien[".env.example"]).toBeUndefined();
    expect(s.unbekannt.join()).toMatch(/\.env\.example.*120000/);
  }, 60_000);
  it("Submodul-Eintrag (Mode 160000) als Vorlage → NO-GO", () => {
    g("update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},deploy/compose.yml`);
    g("commit", "-q", "-m", "Submodul");
    expect(stand(g("rev-parse", "HEAD"), basis).unbekannt.join()).toMatch(/deploy\/compose\.yml.*160000/);
  }, 60_000);
  it("Mode-Wechsel 100644 → 100755 ändert den Hash", () => {
    const vorher = stand(basis, basis).dateien.Dockerfile;
    g("update-index", "--chmod=+x", "Dockerfile");
    g("commit", "-q", "-m", "ausführbar");
    const nachher = stand(g("rev-parse", "HEAD"), basis).dateien.Dockerfile;
    expect(vorher).toMatch(/^[0-9a-f]{64}$/);
    expect(nachher).toMatch(/^[0-9a-f]{64}$/);
    expect(nachher).not.toBe(vorher);
  }, 60_000);
  it("ungültige UTF-8-Bytes: verschiedene Bytes ergeben verschiedene Hashes (kein Dekodieren)", () => {
    writeFileSync(join(repo, "Dockerfile"), Buffer.from([0x46, 0x52, 0x4f, 0x4d, 0x20, 0xff, 0x0a]));
    g("add", "-A"); g("commit", "-q", "-m", "ff");
    const a = stand(g("rev-parse", "HEAD"), basis).dateien.Dockerfile;
    writeFileSync(join(repo, "Dockerfile"), Buffer.from([0x46, 0x52, 0x4f, 0x4d, 0x20, 0xfe, 0x0a]));
    g("add", "-A"); g("commit", "-q", "-m", "fe");
    const b = stand(g("rev-parse", "HEAD"), basis).dateien.Dockerfile;
    expect(a).not.toBe(b);
  }, 60_000);
  it("CLI --vorlagen-hashes mit --basis zeigt je Vorlage geändert/unverändert/neu", () => {
    schreib("Dockerfile", "FROM y\n");
    schreib("deploy/compose.yml", "services: {}\n");
    g("add", "-A"); g("commit", "-q", "-m", "Kandidat");
    const k = g("rev-parse", "HEAD");
    const r = spawnSync(process.execPath, [WERKZEUG, "--wurzel", repo, "--vorlagen-hashes", "--kandidat", k, "--basis", basis], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(Object.keys(j.vorlagenHashes).sort()).toEqual([".env.example", "Dockerfile", "deploy/compose.yml"]);
    expect(j.vergleichMitBasis[".env.example"].status).toBe("unverändert");
    expect(j.vergleichMitBasis.Dockerfile.status).toBe("geändert");
    expect(j.vergleichMitBasis["deploy/compose.yml"]).toEqual({ basis: null, kandidat: j.vorlagenHashes["deploy/compose.yml"], status: "neu" });
    expect(j.vergleichMitBasis.Dockerfile.basis).not.toBe(j.vergleichMitBasis.Dockerfile.kandidat);
  }, 60_000);
});

describe("Delta-Review 8 #427: Nachschärfung NODE_*", () => {
  it("NODE_* außerhalb einer Schlüsselposition macht die Zeile unlesbar", () => {
    expect(vorlageUnlesbar("    environment:\n      X: \"NODE_OPTIONS=--require=./x.js\"\n", "compose")).not.toEqual([]);
    expect(vorlageUnlesbar("ENV X=\"NODE_PATH=/tmp\"\n", "dockerfile")).not.toEqual([]);
  });
});

describe("Delta-Review 9 #427: Verzeichnis-Symlinks, Nicht-ASCII-Pfade, entfernte Vorlagen", () => {
  let repo;
  const g = (...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
    return r.stdout.trim();
  };
  const blob = (inhalt) => spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: inhalt, encoding: "utf8" }).stdout.trim();
  const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), inhalt); };
  const stand = (k, b) => sammeln({ wurzel: repo, offline: false, kandidatSha: k, basisSha: b, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz"); } }).vorlagenStand;
  let basis;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "rel1-r9-"));
    g("init", "-q");
    schreib(".env.example", "NODE_ENV=production\n");
    schreib("deploy/staging-o2/compose.yml", "services: {}\n");
    g("add", "-A"); g("commit", "-q", "-m", "Basis");
    basis = g("rev-parse", "HEAD");
  }, 60_000);
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("B1: Verzeichnis-Symlink unter deploy/ (gebundene Vorlage verschwindet) → NO-GO", () => {
    g("rm", "-q", "-r", "--cached", "deploy/staging-o2");
    g("update-index", "--add", "--cacheinfo", `120000,${blob("../ops")},deploy/staging-o2`);
    g("commit", "-q", "-m", "Verzeichnis-Symlink");
    const s = stand(g("rev-parse", "HEAD"), basis);
    expect(s.unbekannt.join()).toMatch(/deploy\/staging-o2 .*120000/);
  }, 60_000);
  it("B1: Symlink oder Submodul beliebigen Namens im Wurzelverzeichnis oder tief unter deploy/ → NO-GO", () => {
    g("update-index", "--add", "--cacheinfo", `120000,${blob("x")},.dockerignore`);
    g("update-index", "--add", "--cacheinfo", `160000,${"2".repeat(40)},deploy/a/b/modul`);
    g("commit", "-q", "-m", "Links");
    const u = stand(g("rev-parse", "HEAD"), basis).unbekannt.join();
    expect(u).toMatch(/\.dockerignore .*120000/);
    expect(u).toMatch(/deploy\/a\/b\/modul .*160000/);
  }, 60_000);
  it("B3: Pfade mit Nicht-ASCII-Zeichen werden erkannt (ls-tree -z)", () => {
    schreib("Dockerfile.ü", "FROM x\n");
    schreib("deploy/compose.ü.yml", "services: {}\n");
    g("add", "-A"); g("commit", "-q", "-m", "Umlaute");
    const u = stand(g("rev-parse", "HEAD"), basis).unbekannt.join();
    expect(u).toMatch(/Dockerfile\.ü/);
    expect(u).toMatch(/deploy\/compose\.ü\.yml/);
  }, 60_000);
  it("B2: der Vergleich mit der Basis zeigt entfernte Vorlagen", () => {
    g("rm", "-q", "deploy/staging-o2/compose.yml");
    g("commit", "-q", "-m", "entfernt");
    const k = g("rev-parse", "HEAD");
    const r = spawnSync(process.execPath, [WERKZEUG, "--wurzel", repo, "--vorlagen-hashes", "--kandidat", k, "--basis", basis], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.vergleichMitBasis["deploy/staging-o2/compose.yml"].status).toBe("entfernt");
    expect(j.vergleichMitBasis["deploy/staging-o2/compose.yml"].kandidat).toBe(null);
    expect(j.vorlagenHashes["deploy/staging-o2/compose.yml"]).toBeUndefined();
  }, 60_000);
});

describe("REL-1 Nachzug: IMP-6 Planwirkung als eigene unfertige Funktion (G3, G8)", () => {
  const W = "CENTRIC_SCHICHTMODELL_WIRKUNG";
  const qt = { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" };
  const g3 = (text, art = "env", unfertig = UNFERTIG) => g3Schalter({ codeNamen: ["CENTRIC_DEMO"], klassen: KL, vorlagen: [{ pfad: "v", art, pflicht: true, text }], unfertig, quelltexte: qt }, KONFIG_STANDARD);
  const eintrag = () => UNFERTIG.funktionen.find((f) => f.id === "schichtmodell-wirkung");

  it("RELEASE-UNFERTIG.json: eigener Eintrag mit Gründen und Vorbedingungen vor AN; Schalter klassifiziert schalter-aus", () => {
    const f = eintrag();
    expect(f, "Eintrag schichtmodell-wirkung fehlt").toBeTruthy();
    expect(f.variablen).toEqual([W]);
    // genau ein Eintrag nennt die Variable (keine doppelte Führung neben der Pflege)
    expect(UNFERTIG.funktionen.filter((x) => (x.variablen || []).includes(W)).map((x) => x.id)).toEqual(["schichtmodell-wirkung"]);
    expect(Array.isArray(f.vorbedingungen) && f.vorbedingungen.length).toBeGreaterThanOrEqual(5);
    const text = f.vorbedingungen.join("\n");
    for (const muss of ["src/speicher.js", "teilzeitProfil", "src/lib/fachlogik.js", "P2-24 (b)", "P2-25", "P2-26", "P2-27", "P2-28", "P2-29", "P2-30", "P2-31", "Clients neu laden"]) {
      expect(text, muss).toContain(muss);
    }
    expect(f.ssotPakete).toEqual(["IMP-6"]);
    expect(KL.variablen[W].klasse).toBe("schalter-aus");
  });
  it("G3: Planwirkung aktiv in env, compose oder Dockerfile → NO-GO mit Namen der Funktion; aus oder auskommentiert → GO", () => {
    const name = eintrag().name;
    for (const [t, art] of [[`${W}=true\n`, "env"], [`${W}=an\n`, "env"], [`    environment:\n      ${W}: "true"\n`, "compose"],
      [`    environment:\n      - ${W}=true\n`, "compose"], [`ENV ${W}=true\n`, "dockerfile"]]) {
      const g = g3(t, art);
      expect(g.ergebnis, t).toBe("NO-GO");
      expect(g.gruende.join("\n"), t).toContain(`„${name}“`);
    }
    // Vorgabewert über Selbstbezug: keine benannte Form → unlesbar, ebenfalls NO-GO
    expect(g3(`    environment:\n      - ${W}=\${${W}:-true}\n`, "compose").ergebnis).toBe("NO-GO");
    for (const t of [`# ${W}=true\n`, `${W}=false\n`, `${W}=\n`, `${W}=aus\n`]) expect(g3(t).ergebnis, t).toBe("GO");
  });
  it("G3: auch ohne Eintrag in RELEASE-UNFERTIG bleibt der Schalter gesperrt (zweite Schicht schalter-aus)", () => {
    const ohne = { ...UNFERTIG, funktionen: UNFERTIG.funktionen.filter((f) => !(f.variablen || []).includes(W)) };
    expect(g3(`${W}=true\n`, "env", ohne).gruende.join()).toMatch(/Schalter CENTRIC_SCHICHTMODELL_WIRKUNG aktiv/);
  });
  it("G8: ssotPakete einer unfertigen Funktion müssen in der SSOT stehen (fail-closed); im Kandidaten → Beleg „hinter Schalter AUS“", () => {
    const ssot = { pakete: [{ id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: ["#429", "#436"] }] };
    const unfertig = { funktionen: [{ id: "schichtmodell-wirkung", name: "Planwirkung", variablen: [W], ssotPakete: ["IMP-6"] }] };
    const g = g8Blocker(ssot, [436], null, KONFIG_STANDARD, unfertig);
    expect(g.ergebnis).toBe("GO");
    expect(g.belege.join()).toMatch(/IMP-6.*#436.*Planwirkung.*hinter Schalter AUS \(G3: CENTRIC_SCHICHTMODELL_WIRKUNG\)/);
    expect(g8Blocker(ssot, [1], null, KONFIG_STANDARD, unfertig).belege.join()).not.toMatch(/IMP-6/);
    const falsch = { funktionen: [{ ...unfertig.funktionen[0], ssotPakete: ["IMP-99"] }] };
    const n = g8Blocker(ssot, [436], null, KONFIG_STANDARD, falsch);
    expect(n.ergebnis).toBe("NO-GO");
    expect(n.gruende.join()).toMatch(/IMP-99.*nicht in der SSOT/);
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD, { funktionen: [{ ...unfertig.funktionen[0], ssotPakete: "IMP-6" }] }).ergebnis).toBe("NO-GO");
    // ohne Liste (G3 meldet sie selbst) und ohne ssotPakete bleibt G8 wie bisher
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD).ergebnis).toBe("GO");
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD, { funktionen: [{ id: "x", variablen: [] }] }).ergebnis).toBe("GO");
  });
  it("Review #437 (3): Beleg „hinter Schalter AUS“ nur mit Variablen; leere oder fehlende variablen → NO-GO, kein Beleg", () => {
    const ssot = { pakete: [{ id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: ["#436"] }] };
    for (const variablen of [[], undefined, "X"]) {
      const g = g8Blocker(ssot, [436], null, KONFIG_STANDARD, { funktionen: [{ id: "w", name: "Planwirkung", variablen, ssotPakete: ["IMP-6"] }] });
      expect(g.ergebnis, JSON.stringify(variablen)).toBe("NO-GO");
      expect(g.belege.join(), JSON.stringify(variablen)).not.toMatch(/hinter Schalter AUS/);
    }
  });
  it("Review #437 (3, 4): ssotPakete mit offenem P0/P1-Paket im Kandidaten bleibt G8-NO-GO, ohne Beleg „hinter Schalter AUS“", () => {
    const ssot = { pakete: [
      { id: "WP-48", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#87"] },
      { id: "WP-16c", prio: "P0", status: "REVIEW", strang: "acc45", pr: ["#223"] },
    ] };
    const unfertig = { funktionen: [{ id: "t", name: "Teilspeicherung", variablen: ["CENTRIC_TEILSPEICHERUNG"], ssotPakete: ["WP-48", "WP-16c"] }] };
    const g = g8Blocker(ssot, [87, 223], null, KONFIG_STANDARD, unfertig);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.map((x) => x.split(" ")[0])).toEqual(["WP-48", "WP-16c"]);
    expect(g.belege.join()).not.toMatch(/hinter Schalter AUS/);
    // akzeptiert der Betreiber das Paket, ist es kein NO-GO mehr; dann gilt der Beleg
    const f = { akzeptiertePakete: [{ id: "WP-48", grund: "hinter Schalter" }, { id: "WP-16c", grund: "x" }] };
    const a = g8Blocker(ssot, [87, 223], f, KONFIG_STANDARD, unfertig);
    expect(a.ergebnis).toBe("GO");
    expect(a.belege.join()).toMatch(/WP-48 im Kandidaten .*hinter Schalter AUS/);
  });
  it("G8 im Gesamtlauf liest RELEASE-UNFERTIG.json des Kandidaten", () => {
    datei("docs/acc45/RELEASE-UNFERTIG.json", { ...UNFERTIG, funktionen: [...UNFERTIG.funktionen, { id: "t", name: "T", variablen: ["X_T"], ssotPakete: ["GIBT-ES-NICHT"] }] });
    expect(gateVon(pruefe(), "G8").gruende.join()).toMatch(/GIBT-ES-NICHT/);
  });
  it("Repository-Stand: jedes ssotPakete in RELEASE-UNFERTIG.json steht in work-packages.json", () => {
    const ssot = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/work-packages.json"), "utf8"));
    const ids = new Set(ssot.pakete.map((p) => p.id));
    for (const f of UNFERTIG.funktionen) for (const id of f.ssotPakete || []) expect(ids.has(id), `${f.id}: ${id}`).toBe(true);
  });
});

describe("REL-1 Nachzug N1 (Delta-Check #427): Pfade mit Steuerzeichen im Wurzelverzeichnis und unter deploy/", () => {
  // Ersatz-Quelle für vorlagenStandErmitteln: Pfade frei wählbar (auch NUL, das Git selbst nicht zulässt)
  const kqAus = (wurzel, deploy = []) => ({
    wurzelDateien: () => wurzel, dateien: () => deploy, modus: () => "100644", lesenRoh: () => Buffer.from("x"),
    eintraege: () => [...wurzel, ...deploy].map((pfad) => ({ pfad, modus: "100644" })),
  });
  it("jedes Steuerzeichen (\\n, \\r, \\t, NUL, ESC, DEL) im Pfad → unbekannt (NO-GO), auch wenn der Name sonst keine Vorlage wäre", () => {
    for (const p of ["Dockerfile\nx", "x\n.env", "README\r", "a\tb", "a\0b", "a\x1bb", "a\x7fb"]) {
      expect(vorlagenStandErmitteln(kqAus([p])).unbekannt.join(), JSON.stringify(p)).toMatch(/Steuerzeichen/);
    }
    for (const p of ["deploy/x\n.env", "deploy/a/b\tc.txt", "deploy/\rcompose.yml"]) {
      expect(vorlagenStandErmitteln(kqAus([], [p])).unbekannt.join(), JSON.stringify(p)).toMatch(/Steuerzeichen/);
    }
    // die Ausgabe enthält das Steuerzeichen nicht roh (sichtbar maskiert)
    expect(vorlagenStandErmitteln(kqAus(["Dockerfile\nx"])).unbekannt.join()).toContain("Dockerfile\\nx");
  });
  it("Gegenprobe: gewöhnliche Pfade (auch Umlaute, Leerzeichen) lösen keinen Steuerzeichen-Fund aus", () => {
    const s = vorlagenStandErmitteln(kqAus([".env.example", "Dockerfile", "README.md", "Ä ö.txt"], ["deploy/compose.yml", "deploy/a b/c.sh"]));
    expect(s.unbekannt.join()).not.toMatch(/Steuerzeichen/);
  });
  it("echtes Git-Repo: Dockerfile\\nx, deploy/x\\n.env und deploy/t\\tab.yml im Kandidaten → Vorlagenstand unbekannt", () => {
    const repo = mkdtempSync(join(tmpdir(), "rel1-n1-"));
    // core.protectNTFS=false: Git für Windows lehnt Steuerzeichen im Pfad sonst schon beim Anlegen ab (unter Linux
    // erlaubt) — der Kandidat kann solche Pfade aber enthalten, das Werkzeug muss sie erkennen.
    const g = (...args) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.protectNTFS=false", ...args], { cwd: repo, encoding: "utf8" });
      if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
      return r.stdout.trim();
    };
    try {
      g("init", "-q");
      writeFileSync(join(repo, ".env.example"), "NODE_ENV=production\n");
      g("add", "-A"); g("commit", "-q", "-m", "Basis");
      const basis = g("rev-parse", "HEAD");
      const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: "ENV CENTRIC_DEMO=true\n", encoding: "utf8" }).stdout.trim();
      g("update-index", "--add", "--cacheinfo", `100644,${blob},Dockerfile\nx`);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},deploy/x\n.env`);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},deploy/t\tab.yml`);
      g("commit", "-q", "-m", "Steuerzeichen");
      const s = sammeln({ wurzel: repo, offline: false, kandidatSha: g("rev-parse", "HEAD"), basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz"); } }).vorlagenStand;
      const u = s.unbekannt.join("|");
      expect(u).toContain("Dockerfile\\nx");
      expect(u).toContain("deploy/x\\n.env");
      expect(u).toContain("deploy/t\\tab.yml");
      expect(s.unbekannt.filter((x) => /Steuerzeichen/.test(x))).toHaveLength(3);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }, 60_000);
  it("Review #437 (1, 2): C1-Zeichen (U+0080–U+009F) und U+2028/U+2029 sind Steuerzeichen; Ausgabe maskiert, nie roh", () => {
    // Zeichen zur Laufzeit gebildet (keine rohen Zeilentrenner im Quelltext)
    const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029), c = (n) => String.fromCharCode(n);
    const roh = new RegExp("[" + c(0) + "-" + c(0x1f) + c(0x7f) + "-" + c(0x9f) + LS + PS + "]");
    for (const p of ["Dockerfile" + LS + "x", "x" + PS + ".env", "a" + c(0x85) + "b", "a" + c(0x9b) + "b", "a" + c(0x80) + "b", "a" + c(0x9f) + "b"]) {
      const u = vorlagenStandErmitteln(kqAus([p])).unbekannt.join();
      expect(u, JSON.stringify(p)).toMatch(/Steuerzeichen/);
      expect(roh.test(u), JSON.stringify(u)).toBe(false);
    }
    const bs = String.fromCharCode(0x5c);
    expect(vorlagenStandErmitteln(kqAus(["Dockerfile" + LS + "x"])).unbekannt.join()).toContain("Dockerfile" + bs + "u2028x");
    expect(vorlagenStandErmitteln(kqAus(["a" + c(0x9b) + "b"])).unbekannt.join()).toContain("a" + bs + "u009bb");
    expect(vorlagenStandErmitteln(kqAus([], ["deploy/a" + c(0) + "b"])).unbekannt.join()).toContain("deploy/a" + bs + "u0000b");
    expect(vorlagenStandErmitteln(kqAus(["Dockerfile" + c(10) + "x"])).unbekannt.join()).toContain("Dockerfile" + bs + "nx");
    // vorlagenArt mit s-Flag: auch ohne Steuerzeichen-Sperre wäre Dockerfile<U+2028>x eine Vorlage dieser Art
    expect(new RegExp(KONFIG_STANDARD.vorlagenArt, "is").test("Dockerfile" + LS + "x")).toBe(true);
  });
  it("Review #437 (1): echtes Git-Repo — Dockerfile<U+2028>x mit aktiver Planwirkung und deploy/compose<U+2028>.yml → unbekannt", () => {
    const repo = mkdtempSync(join(tmpdir(), "rel1-n1b-"));
    const g = (...args) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.protectNTFS=false", ...args], { cwd: repo, encoding: "utf8" });
      if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
      return r.stdout.trim();
    };
    try {
      g("init", "-q");
      writeFileSync(join(repo, ".env.example"), "NODE_ENV=production\n");
      g("add", "-A"); g("commit", "-q", "-m", "Basis");
      const basis = g("rev-parse", "HEAD");
      const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: "ENV CENTRIC_SCHICHTMODELL_WIRKUNG=true\n", encoding: "utf8" }).stdout.trim();
      const LS = String.fromCharCode(0x2028);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},Dockerfile${LS}x`);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},deploy/compose${LS}.yml`);
      g("commit", "-q", "-m", "Zeilentrenner");
      const s = sammeln({ wurzel: repo, offline: false, kandidatSha: g("rev-parse", "HEAD"), basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz"); } }).vorlagenStand;
      const u = s.unbekannt.join("|");
      expect(u).toContain("Dockerfile\\u2028x");
      expect(u).toContain("deploy/compose\\u2028.yml");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }, 60_000);
  it("0 Fehlalarme: echte Vorlagen im Kopf-Commit des Repositorys (online, aus den Git-Objekten)", () => {
    const r = spawnSync(process.execPath, [WERKZEUG, "--vorlagen-hashes", "--kandidat", "HEAD"], { cwd: WURZEL, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toMatch(/Steuerzeichen|nicht gelistete Vorlage/);
    expect(Object.keys(JSON.parse(r.stdout).vorlagenHashes).sort()).toEqual([...KONFIG_STANDARD.gebundeneVorlagen].sort());
  }, 60_000);
});
