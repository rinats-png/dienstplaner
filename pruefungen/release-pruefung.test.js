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
import {
  KONFIG_STANDARD, auswerten, sammeln, freigabelisteLesen, g1Ci, g2Review, g3Schalter, g4Bild, g5Migration,
  g6Sicherung, g7Rueckweg, g8Blocker, g9Befunde, g10Freigabe, migrationsbericht, reviewNachweiseLesen,
  codeNamenFinden, vorlageLesen, wertAufloesen, abweichend, bildAngabenLesen, prsAusCommits, commitsOhnePr,
  argumenteLesen, ssotReviewBelege, freigabeSchema,
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
  freigegebenDurch: "Betreiber", datum: "2026-11-20",
  rueckweg: { strategie: "r0", entscheidungO1: "a", entscheidungO2: "a" },
  reviewBestaetigt: [],
  migration: { freigegeben: true, basisCommit: B, abgedeckt: ["W-4", "STARTBLOCK"], bericht: "docs/acc45/releases/v4-r1.migration.md" },
};

const SSOT = { pakete: [
  { id: "WP-1", prio: "P1", status: "INTEGRATED", strang: "acc45", pr: ["#10"], titel: "fertig" },
  { id: "WP-2", prio: "P2", status: "REVIEW", strang: "acc45", pr: ["#11"], titel: "P2 darf" },
  { id: "F-1", prio: "P2", status: "BLOCKED", strang: "folge", pr: [], titel: "P2-Befund" },
  { id: "REL-2", prio: "P1", status: "BLOCKED", strang: "folge", pr: [], titel: "Release-Prozess selbst, kein Befund" },
] };

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
  datei("docs/acc45/releases/v4-r1.freigabe.json", FREIGABE);
});
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
    expect(g1([...checks(), x({ conclusion: "skipped" })]).ergebnis).toBe("GO");
  });
  it("eigener Gate-Job (release-gate) wird nicht mitgezählt, auch wenn er noch läuft", () => {
    const eigen = { id: 77, name: "release-gate", status: "in_progress", conclusion: null, head_sha: K };
    expect(g1([...checks(), eigen]).ergebnis).toBe("GO");
  });
});

describe("G2 Review und Commits ohne PR", () => {
  it("Tabellenurteil: MERGEBAR und „erledigt“ belegen; Verneinung, offene Auflagen und Ausstehendes nicht", () => {
    const b = reviewNachweiseLesen([{ datei: "x.md", text: [
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
      { datei: "docs/acc45/REVIEW-NACHWEIS-2026-11-19.md", text: "| #8 | Opus | MERGEBAR | gemergt |\n| #9 | Opus | MERGEBAR | gemergt |" },
      { datei: "docs/acc45/REVIEW-NACHWEIS-2026-11-20.md", text: "| #8 | Opus | NICHT FREIGEGEBEN | offen |" },
    ]);
    expect([...b.keys()]).toEqual([9]);
    const c = reviewNachweiseLesen([{ datei: "y.md", text: "| #8 | Opus | MIT AUFLAGEN | offen |\n| #8 | Opus | Auflagen erledigt, MERGEBAR | offen |" }]);
    expect([...c.keys()]).toEqual([8]);
  });
  it("PR-Text allein ist kein Beleg; Selbst-Review des Autors zählt nicht", () => {
    const g = g2Review({ prs: [7], commitsOhnePr: [], prAngaben: { 7: { autor: "a", body: "Unabhängiges Review (Opus): MERGEBAR", reviews: [{ state: "APPROVED", autor: "a" }] } } });
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.manuell).toEqual(["#7"]);
  });
  it("Belege: GitHub-Review eines anderen Kontos, Dokument, SSOT, Betreiberbestätigung", () => {
    expect(g2Review({ prs: [7], commitsOhnePr: [], prAngaben: { 7: { autor: "a", reviews: [{ state: "APPROVED", autor: "b" }] } } }).ergebnis).toBe("GO");
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
    expect(commitsOhnePr(commits, KONFIG_STANDARD).map((x) => x.sha[0]).sort()).toEqual(["5", "7", "8"]);
    expect(prsAusCommits(commits)).toEqual([12, 13, 416]);
  });
  it("Commits ohne PR → NO-GO, außer akzeptiert mit Grund (Präfix ab 7 Zeichen)", () => {
    const ohne = [{ sha: "5".repeat(40), betreff: "Direkt" }];
    expect(g2Review({ prs: [], commitsOhnePr: ohne }).ergebnis).toBe("NO-GO");
    expect(g2Review({ prs: [], commitsOhnePr: ohne, freigabe: { akzeptierteCommits: [{ sha: "5555555", grund: "Hotfix, Review #9" }] } }).ergebnis).toBe("GO");
    expect(g2Review({ prs: [], commitsOhnePr: ohne, freigabe: { akzeptierteCommits: [{ sha: "5555555" }] } }).ergebnis).toBe("NO-GO");
    expect(g2Review({ prs: [], commitsOhnePr: undefined }).ergebnis).toBe("NO-GO");
  });
  it("Gesamtlauf: ein Commit ohne PR macht G2 NO-GO; offene PRs stehen unter manuelleBestaetigungen", () => {
    const fx = fixtureGo();
    fx.commits.push({ sha: "4".repeat(40), eltern: [B], betreff: "Direkt gepusht" });
    fx.commits.push({ sha: "6".repeat(40), eltern: [B], betreff: "Neu (#12)" });
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
    for (const t of ["# CENTRIC_DEMO=true\n", "CENTRIC_DEMO=false\n", "CENTRIC_DATENSCHUTZLAUF=vorschau\n", "CENTRIC_ERSTLEITUNG_STRENG=true\n",
      "CENTRIC_AUFRAEUMEN=an\n", "VAPID_PRIVATE=<OPTIONAL>\n", "CENTRIC_DEMO=${CENTRIC_DEMO}\n"]) expect(g3(t).ergebnis, t).toBe("GO");
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
  });
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
  const STAND = { kandidatIstVorfahr: true, geaendertSeitKandidat: ["deploy/FREIGEGEBENE-IMAGES.md", "docs/acc45/releases/v4-r1.freigabe.json"] };
  const fall = (f, x = {}) => g10Freigabe({ releaseId: "v4-r1", freigabe: f, commitet: true, kandidat: K, digest: D, stand: STAND, ...x }, KONFIG_STANDARD);
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
    expect(lauf(["--kandidat", "HEAD", "--basis", "HEAD", "--jetzt", JETZT]).status).toBe(2); // --jetzt online verboten
    expect(lauf(["--kandidat", "HEAD"]).status).toBe(2); // --basis ist Pflicht
    expect(lauf(["--kandidat", "HEAD", "--basis", "--gibtsnicht"]).status).toBe(2);
    expect(lauf(["--kandidat", "HEAD", "--basis", "gibt-es-nicht-rel1"]).status).toBe(2); // rev-parse --verify
    expect(lauf(["--kandidat", "HEAD", "--basis", "--output=x"]).status).toBe(2); // keine Option als Revision
    writeFileSync(fx, "[null]");
    expect(lauf(basis).status).toBe(2);
    const zeigen = lauf(["--konfig-zeigen"]);
    expect(zeigen.status).toBe(0);
    expect(JSON.parse(zeigen.stdout).pflichtChecks).toEqual(PFLICHT);
  });
});
