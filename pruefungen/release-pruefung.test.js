// REL-1: werkzeug/release-pruefung.mjs — Gates G1 bis G10, offline mit Fixture.
// Feste Uhr: Jede Prüfung bekommt `jetztMs` aus einer festen ISO-Zeit; das Werkzeug liest die Uhr dann nicht.
// Kein Netz: Offline-Modus, alle Git- und GitHub-Angaben kommen aus der Fixture
// (Beispiel: pruefungen/fixtures/release-pruefung-beispiel.json).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  KONFIG_STANDARD, auswerten, sammeln, freigabelisteLesen, g1Ci, g2Review, g3Schalter, g4Bild, g5Migration,
  g6Sicherung, g7Rueckweg, g8Blocker, g9Befunde, g10Freigabe, migrationsbericht, reviewNachweiseLesen,
  codeNamenFinden, vorlageLesen, wertAufloesen, abweichend, bildAngabenLesen, prsAusCommits, commitsOhnePr,
  argumenteLesen, ssotReviewBelege, freigabeSchema, basisPruefen, ausfuehrOptionen, ausfuehren, vorlageUnlesbar,
  vorlagenStandErmitteln, kurzfassung, urteilPositiv, REL_AUSNAHME_IDS, nachholPruefen, nachholSammeln, zipEntpacken,
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
  // RELEASE-UNFERTIG.json nennt WP-48 (Teilspeicherung, Abschluss segmentweise); ohne PR im Kandidaten kein Blocker.
  // pr enthält die ssotPrs des echten Eintrags teilspeicherung (Review #473 H1: ssotPrs muss im pr der ssotPakete stehen)
  { id: "WP-48", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#342", "#348", "#350"], titel: "Teilspeicherung" },
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
    for (const teil of ["pruefen-a", "pruefen-b", "pruefen-c", "browser-abnahme"]) {
      for (const ueber of [{ status: "in_progress", conclusion: null }, { conclusion: "failure" }, { conclusion: "skipped" }, { conclusion: "neutral" }]) {
        const g = g1(checks({ [teil]: ueber }));
        expect(g.ergebnis, `${teil} ${JSON.stringify(ueber)}`).toBe("NO-GO");
        expect(g.gruende.join(), teil).toContain(`Pflicht-Check ${teil}:`);
      }
    }
  });
  it("Pilot f1: jeder Teil der Prüfung (pruefen-a, pruefen-b, pruefen-c) ist einzeln Pflicht; fehlt einer → NO-GO", () => {
    expect(PFLICHT).toEqual(expect.arrayContaining(["pruefen-a", "pruefen-b", "pruefen-c", "browser-abnahme"]));
    expect(g1(checks()).ergebnis).toBe("GO");
    for (const teil of ["pruefen-a", "pruefen-b", "pruefen-c"]) {
      const g = g1(checks().filter((c) => c.name !== teil));
      expect(g.ergebnis, teil).toBe("NO-GO");
      expect(g.gruende, teil).toContain(`Pflicht-Check fehlt: ${teil}`);
    }
  });
  /* Übergangsregel (Review #514, A2): G1 nimmt GENAU zwei vollständige Formen der Prüfung an.
     Form NEU: pruefen-a, pruefen-b, pruefen-c. Form ALT: pruefen (Kandidaten vor #514, z. B. 517993ca).
     Die übrigen Pflicht-Checks gelten in beiden Formen. Ist ein Teil der Form NEU vorhanden, muss Form NEU vollständig
     sein (keine Mischform). Jeder Lauf eines Namens beider Formen muss completed/success sein. Rückbau der Form ALT
     nach Release v4-r1 (sobald kein Kandidat mehr den alten Workflow hat). */
  describe("Übergangsregel Form ALT / Form NEU", () => {
    const NEU = ["pruefen-a", "pruefen-b", "pruefen-c"];
    const lauf = (id, name, u = {}) => ({ id, name, status: "completed", conclusion: "success", head_sha: K, ...u });
    const gemeinsam = () => checks().filter((c) => !NEU.includes(c.name));
    const formAlt = (u = {}) => [...gemeinsam(), lauf(77, "pruefen", u)];
    const formNeu = (u = {}) => checks(u);
    it("Konfiguration: Form NEU = Teile in pflichtChecks, Form ALT = pruefen; ALT ist kein Pflicht-Check der Form NEU", () => {
      expect(KONFIG_STANDARD.uebergangPruefen.neu).toEqual(NEU);
      expect(KONFIG_STANDARD.uebergangPruefen.alt).toEqual(["pruefen"]);
      expect(PFLICHT).toEqual(expect.arrayContaining(NEU));
      expect(PFLICHT).not.toContain("pruefen");
      expect(String(KONFIG_STANDARD.uebergangPruefen.rueckbau)).toMatch(/v4-r1/);
    });
    it("Form ALT grün → GO (Beleg nennt Form ALT); Form NEU grün → GO (Beleg nennt Form NEU)", () => {
      const a = g1(formAlt());
      expect(a.ergebnis, a.gruende.join()).toBe("GO");
      expect(a.belege.join(" ")).toMatch(/Form ALT/);
      const n = g1(formNeu());
      expect(n.ergebnis, n.gruende.join()).toBe("GO");
      expect(n.belege.join(" ")).toMatch(/Form NEU/);
    });
    it("Form ALT mit rotem, laufendem, übersprungenem, neutralem oder abgebrochenem `pruefen` → NO-GO", () => {
      for (const u of [{ conclusion: "failure" }, { status: "in_progress", conclusion: null }, { conclusion: "skipped" }, { conclusion: "neutral" }, { conclusion: "cancelled" }]) {
        const g = g1(formAlt(u));
        expect(g.ergebnis, JSON.stringify(u)).toBe("NO-GO");
        expect(g.gruende.join(), JSON.stringify(u)).toContain("Pflicht-Check pruefen:");
      }
    });
    it("Form NEU: ein Teil cancelled → NO-GO (neutral/skipped/in_progress/failure prüft der Test oben)", () => {
      for (const t of NEU) expect(g1(formNeu({ [t]: { conclusion: "cancelled" } })).ergebnis, t).toBe("NO-GO");
    });
    it("Form NEU mit fehlendem Teil (ohne `pruefen`) → NO-GO", () => {
      const g = g1(formNeu().filter((c) => c.name !== "pruefen-c"));
      expect(g.ergebnis).toBe("NO-GO");
      expect(g.gruende).toContain("Pflicht-Check fehlt: pruefen-c");
    });
    it("Mischform: `pruefen` grün + `pruefen-a` grün ohne b und c → NO-GO (Form NEU angefangen, unvollständig)", () => {
      const g = g1([...formAlt(), lauf(78, "pruefen-a")]);
      expect(g.ergebnis).toBe("NO-GO");
      expect(g.gruende.join()).toMatch(/Mischform/);
      expect(g.gruende).toContain("Pflicht-Check fehlt: pruefen-b");
      expect(g.gruende).toContain("Pflicht-Check fehlt: pruefen-c");
    });
    it("nur `pruefen-a` (kein `pruefen`, kein b/c) → NO-GO", () => {
      expect(g1([...gemeinsam(), lauf(78, "pruefen-a")]).ergebnis).toBe("NO-GO");
    });
    it("keine der beiden Formen → NO-GO, Meldung nennt beide Formen", () => {
      const g = g1(gemeinsam());
      expect(g.ergebnis).toBe("NO-GO");
      const m = g.gruende.join(" ");
      expect(m).toMatch(/Form NEU \(pruefen-a, pruefen-b, pruefen-c\)/);
      expect(m).toMatch(/Form ALT \(pruefen\)/);
    });
    it("beide Formen vollständig: alle grün → GO; `pruefen` rot neben vollständiger Form NEU → NO-GO", () => {
      expect(g1([...formNeu(), lauf(77, "pruefen")]).ergebnis).toBe("GO");
      const g = g1([...formNeu(), lauf(77, "pruefen", { conclusion: "failure" })]);
      expect(g.ergebnis).toBe("NO-GO");
      expect(g.gruende.join()).toContain("Pflicht-Check pruefen: failure");
      expect(g1([...formNeu(), lauf(77, "pruefen", { conclusion: "skipped" })]).ergebnis).toBe("NO-GO");
    });
    it("alter roter Lauf neben neuem grünem Lauf desselben Namens → NO-GO (Form ALT und Form NEU)", () => {
      expect(g1([lauf(1, "pruefen", { conclusion: "failure" }), ...formAlt()]).ergebnis).toBe("NO-GO");
      expect(g1([lauf(1, "pruefen-a", { conclusion: "failure" }), ...formNeu()]).ergebnis).toBe("NO-GO");
    });
    it("Form ALT ohne einen gemeinsamen Pflicht-Check → NO-GO", () => {
      for (const n of ["browser-abnahme", "bild-scan"]) {
        const g = g1(formAlt().filter((c) => c.name !== n));
        expect(g.ergebnis, n).toBe("NO-GO");
        expect(g.gruende, n).toContain(`Pflicht-Check fehlt: ${n}`);
      }
    });
    it("Mutation: ohne Übergangsregel in der Konfiguration ist Form ALT NO-GO (die Regel trägt den ALT-Fall)", () => {
      const ohne = { ...KONFIG_STANDARD, uebergangPruefen: undefined };
      expect(g1Ci(formAlt(), K, ohne).ergebnis).toBe("NO-GO");
      expect(g1Ci(formNeu(), K, ohne).ergebnis).toBe("GO");
    });
  });
  it("Check eines anderen Commits oder ohne head_sha → NO-GO; keine Check-Runs → NO-GO", () => {
    expect(g1(checks({ muster: { head_sha: B } })).ergebnis).toBe("NO-GO");
    expect(g1(checks({ muster: { head_sha: undefined } })).ergebnis).toBe("NO-GO");
    expect(g1([]).ergebnis).toBe("NO-GO");
    expect(g1(null).ergebnis).toBe("NO-GO");
  });
  it("ein fehlgeschlagener Lauf auf demselben Kopf bleibt NO-GO, auch wenn ein späterer Lauf grün ist", () => {
    const alt = { id: 99, name: "pruefen-b", status: "completed", conclusion: "failure", head_sha: K };
    expect(g1([...checks(), alt]).ergebnis).toBe("NO-GO");
    expect(g1([...checks(), alt]).gruende.join()).toMatch(/Pflicht-Check pruefen-b: failure/);
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
  // OF-13: G7 kennt die Basis (ohne sie ist ruecksprung fail-closed NO-GO); B ist ein beschrifteter voriger Release.
  const fall = (liste_, r) => g7Rueckweg({ liste: liste_, kandidat: K, digest: D, basis: B }, r === undefined ? null : { rueckweg: r }, KONFIG_STANDARD).ergebnis;
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
    const unfertig = { funktionen: [{ id: "schichtmodell-wirkung", name: "Planwirkung", variablen: [W], ssotPakete: ["IMP-6"], ssotPrs: ["#436"] }] };
    const g = g8Blocker(ssot, [436], null, KONFIG_STANDARD, unfertig, KL);
    expect(g.ergebnis).toBe("GO");
    expect(g.belege.join()).toMatch(/IMP-6.*Planwirkung.*hinter Schalter AUS \(G3: CENTRIC_SCHICHTMODELL_WIRKUNG\): #436/);
    expect(g8Blocker(ssot, [1], null, KONFIG_STANDARD, unfertig, KL).belege.join()).not.toMatch(/IMP-6/);
    const falsch = { funktionen: [{ ...unfertig.funktionen[0], ssotPakete: ["IMP-99"] }] };
    const n = g8Blocker(ssot, [436], null, KONFIG_STANDARD, falsch, KL);
    expect(n.ergebnis).toBe("NO-GO");
    expect(n.gruende.join()).toMatch(/IMP-99.*nicht in der SSOT/);
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD, { funktionen: [{ ...unfertig.funktionen[0], ssotPakete: "IMP-6" }] }, KL).ergebnis).toBe("NO-GO");
    // ohne Liste (G3 meldet sie selbst) und ohne ssotPakete bleibt G8 wie bisher
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD).ergebnis).toBe("GO");
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD, { funktionen: [{ id: "x", variablen: [] }] }).ergebnis).toBe("GO");
  });
  it("Review #437 (3): Beleg „hinter Schalter AUS“ nur mit Variablen; leere oder fehlende variablen → NO-GO, kein Beleg", () => {
    const ssot = { pakete: [{ id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: ["#436"] }] };
    for (const variablen of [[], undefined, "X"]) {
      const g = g8Blocker(ssot, [436], null, KONFIG_STANDARD, { funktionen: [{ id: "w", name: "Planwirkung", variablen, ssotPakete: ["IMP-6"] }] }, KL);
      expect(g.ergebnis, JSON.stringify(variablen)).toBe("NO-GO");
      expect(g.belege.join(), JSON.stringify(variablen)).not.toMatch(/hinter Schalter AUS/);
    }
  });
  it("Review #437 (3, 4): ssotPakete mit offenem P0/P1-Paket im Kandidaten bleibt G8-NO-GO, ohne Beleg „hinter Schalter AUS“", () => {
    const ssot = { pakete: [
      { id: "WP-48", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#87"] },
      { id: "WP-16c", prio: "P0", status: "REVIEW", strang: "acc45", pr: ["#223"] },
    ] };
    const unfertig = { funktionen: [{ id: "t", name: "Teilspeicherung", variablen: ["CENTRIC_TEILSPEICHERUNG"], ssotPakete: ["WP-48", "WP-16c"], ssotPrs: ["#87"] }] };
    const g = g8Blocker(ssot, [87, 223], null, KONFIG_STANDARD, unfertig, KL);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.map((x) => x.split(" ")[0])).toEqual(["WP-48", "WP-16c"]);
    expect(g.belege.join()).not.toMatch(/hinter Schalter AUS/);
    // akzeptiert der Betreiber das Paket, ist es kein NO-GO mehr; dann gilt der Beleg
    const f = { akzeptiertePakete: [{ id: "WP-48", grund: "hinter Schalter" }, { id: "WP-16c", grund: "x" }] };
    const a = g8Blocker(ssot, [87, 223], f, KONFIG_STANDARD, unfertig, KL);
    expect(a.ergebnis).toBe("GO");
    expect(a.belege.join()).toMatch(/WP-48 im Kandidaten: „Teilspeicherung“ nur hinter Schalter AUS \(G3: CENTRIC_TEILSPEICHERUNG\): #87/);
    // WP-16c: kein PR in ssotPrs → keine Deckungsbehauptung, #223 NICHT gedeckt
    expect(a.belege.join()).toMatch(/WP-16c im Kandidaten: „Teilspeicherung“ kein PR .*NICHT durch den Schalter gedeckt: #223/);
  });
  it("G8 im Gesamtlauf liest RELEASE-UNFERTIG.json des Kandidaten", () => {
    datei("docs/acc45/RELEASE-UNFERTIG.json", { ...UNFERTIG, funktionen: [...UNFERTIG.funktionen, { id: "t", name: "T", variablen: ["CENTRIC_SCHICHTMODELL_WIRKUNG"], ssotPakete: ["GIBT-ES-NICHT"] }] });
    expect(gateVon(pruefe(), "G8").gruende.join()).toMatch(/GIBT-ES-NICHT/);
  });
  it("Repository-Stand: jedes ssotPakete in RELEASE-UNFERTIG.json steht in work-packages.json", () => {
    const ssot = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/work-packages.json"), "utf8"));
    const ids = new Set(ssot.pakete.map((p) => p.id));
    for (const f of UNFERTIG.funktionen) for (const id of f.ssotPakete || []) expect(ids.has(id), `${f.id}: ${id}`).toBe(true);
  });
});

describe("Opus-Review #470 A2: G8-Belegzeile nennt nur die durch ssotPrs gedeckten PRs (fail-closed)", () => {
  const T = "CENTRIC_TEILSPEICHERUNG";
  // WP-48-artig: P0, viele PRs im Kandidaten, nur ein Teil liegt hinter dem Schalter
  const ssot = { pakete: [{ id: "WP-48", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#87", "#224", "#342", "#346", "#348", "#350"] }] };
  const kandidat = [87, 224, 342, 346, 348, 350];
  const freigabe = { akzeptiertePakete: [{ id: "WP-48", grund: "Betreiber-Annahme" }] };
  const fkt = (extra = {}) => ({ funktionen: [{ id: "teilspeicherung", name: "Teilspeicherung", variablen: [T], ssotPakete: ["WP-48"], ...extra }] });
  const zeile = (g) => g.belege.filter((b) => b.startsWith("WP-48 im Kandidaten")).join("\n");

  it("ssotPrs gesetzt: „nur hinter Schalter AUS“ nennt nur gedeckte PRs; übrige stehen als NICHT gedeckt (Betreiber-Annahme)", () => {
    const g = g8Blocker(ssot, kandidat, freigabe, KONFIG_STANDARD, fkt({ ssotPrs: ["#342", "#348", "#350"] }), KL); // H5: nur Format „#123“
    expect(g.ergebnis).toBe("GO");
    const z = zeile(g);
    expect(z).toMatch(/nur hinter Schalter AUS \(G3: CENTRIC_TEILSPEICHERUNG\): #342, #348, #350/);
    const [gedeckt, rest = ""] = z.split("NICHT durch den Schalter gedeckt:");
    for (const nr of ["#87", "#224", "#346"]) {
      expect(gedeckt, nr).not.toContain(nr);
      expect(rest, nr).toContain(nr);
    }
    expect(rest).toMatch(/Betreiber-Annahme/);
  });
  it("ssotPrs fehlt: keine Deckungsbehauptung, Hinweis „ssotPrs fehlt — keine Aussage“; G8-Wirkung unverändert", () => {
    const g = g8Blocker(ssot, kandidat, freigabe, KONFIG_STANDARD, fkt(), KL);
    expect(g.ergebnis).toBe("GO");
    expect(g.belege.join("\n")).not.toMatch(/hinter Schalter AUS/);
    expect(zeile(g)).toMatch(/Deckungsumfang nicht angegeben \(ssotPrs fehlt\) — keine Aussage/);
    // ohne akzeptiertePakete bleibt WP-48 G8-Blocker, mit und ohne ssotPrs
    for (const extra of [{}, { ssotPrs: ["#342"] }]) {
      const n = g8Blocker(ssot, kandidat, null, KONFIG_STANDARD, fkt(extra), KL);
      expect(n.ergebnis, JSON.stringify(extra)).toBe("NO-GO");
      expect(n.gruende.join(), JSON.stringify(extra)).toMatch(/WP-48 \(P0, IN_PROGRESS\) steckt im Kandidaten/);
      expect(n.belege.join(), JSON.stringify(extra)).not.toMatch(/hinter Schalter AUS/);
    }
  });
  it("ssotPrs ohne gedeckten PR im Kandidaten: keine Deckungsbehauptung, alle PRs NICHT gedeckt", () => {
    const g = g8Blocker(ssot, kandidat, freigabe, KONFIG_STANDARD, fkt({ ssotPrs: ["#999"] }), KL);
    expect(g.belege.join("\n")).not.toMatch(/hinter Schalter AUS/);
    expect(zeile(g)).toMatch(/kein PR des Pakets im Kandidaten durch den Schalter gedeckt.*NICHT durch den Schalter gedeckt: #87, #224, #342, #346, #348, #350/);
  });
  it("ssotPrs ungültig (keine Liste, leer, Duplikat, falsches Format) → NO-GO, keine Deckungsbehauptung", () => {
    for (const ssotPrs of ["#342", [], ["#342", "#342"], ["#342", 342], ["342"], ["#0"], [0], [-1], [1.5], ["#12a"], [null], [{}]]) {
      const g = g8Blocker(ssot, kandidat, freigabe, KONFIG_STANDARD, fkt({ ssotPrs }), KL);
      expect(g.ergebnis, JSON.stringify(ssotPrs)).toBe("NO-GO");
      expect(g.gruende.join(), JSON.stringify(ssotPrs)).toMatch(/teilspeicherung: ssotPrs/);
      expect(g.belege.join(), JSON.stringify(ssotPrs)).not.toMatch(/hinter Schalter AUS/);
    }
  });
  it("P2-Paket (IMP-6-artig) folgt derselben Regel", () => {
    const s = { pakete: [{ id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: ["#185", "#436"] }] };
    const u = (extra) => ({ funktionen: [{ id: "w", name: "Planwirkung", variablen: ["CENTRIC_SCHICHTMODELL_WIRKUNG"], ssotPakete: ["IMP-6"], ...extra }] });
    const ohne = g8Blocker(s, [185, 436], null, KONFIG_STANDARD, u({}), KL);
    expect(ohne.ergebnis).toBe("GO");
    expect(ohne.belege.join()).not.toMatch(/hinter Schalter AUS/);
    const mit = g8Blocker(s, [185, 436], null, KONFIG_STANDARD, u({ ssotPrs: ["#436"] }), KL).belege.join();
    expect(mit).toMatch(/nur hinter Schalter AUS \(G3: CENTRIC_SCHICHTMODELL_WIRKUNG\): #436; NICHT durch den Schalter gedeckt: #185/);
  });
  it("Repository-Stand: ssotPrs in RELEASE-UNFERTIG.json gültig und nur mit ssotPakete", () => {
    for (const f of UNFERTIG.funktionen) {
      if (f.ssotPrs === undefined) continue;
      expect(Array.isArray(f.ssotPakete) && f.ssotPakete.length, `${f.id}: ssotPrs ohne ssotPakete`).toBeTruthy();
      expect(Array.isArray(f.ssotPrs) && f.ssotPrs.length, f.id).toBeTruthy();
      const nr = f.ssotPrs.map((x) => String(x));
      for (const x of nr) expect(x, f.id).toMatch(/^#[1-9]\d*$/);
      expect(new Set(nr).size, f.id).toBe(nr.length);
    }
  });
  it("Repository-Stand WP-48: ssotPrs nur voll gedeckte PRs (teilweise #224/#346/#322/#351 und ungedeckte #87/#271/#341 nicht)", () => {
    const fx = (id) => UNFERTIG.funktionen.find((x) => x.id === id);
    expect(fx("teilspeicherung").ssotPrs).toEqual(["#342", "#348", "#350"]);
    expect(fx("abschluss-segmentweise").ssotPrs).toBeUndefined();
    for (const f of UNFERTIG.funktionen) for (const nr of ["#87", "#224", "#271", "#322", "#341", "#346", "#351"]) {
      expect((f.ssotPrs || []).map(String), `${f.id}: ${nr}`).not.toContain(nr);
    }
  });
});

describe("v4-r1 G8: ssotPakete nur mit belegtem Schalter-Standard AUS", () => {
  // Jede Variable einer Funktion mit ssotPakete braucht hier ihre Abfrage aus server/lib/schalter.mjs (fail-closed:
  // ein neuer Eintrag ohne Abfrage lässt diesen Test scheitern). `vor` setzt Voraussetzungen für die Gegenprobe.
  const ABFRAGE = {
    CENTRIC_TEILSPEICHERUNG: { fn: "teilwegAn" },
    CENTRIC_ABSCHLUSS_SEGMENTWEISE: { fn: "abschlussSegmentweiseAn" },
    CENTRIC_ABSCHLUSS_OHNE_SPERRE: { fn: "abschlussOhneSperreAn", vor: { CENTRIC_ABSCHLUSS_SEGMENTWEISE: "true" } },
    CENTRIC_SCHICHTMODELL_PFLEGE: { fn: "schichtmodellPflegeAn" },
    CENTRIC_SCHICHTMODELL_WIRKUNG: { fn: "schichtmodellWirkungAn" },
  };
  const mitSsot = UNFERTIG.funktionen.filter((f) => Array.isArray(f.ssotPakete) && f.ssotPakete.length);
  const variablen = [...new Set(mitSsot.flatMap((f) => f.variablen))];
  let gemerkt;
  beforeEach(() => { gemerkt = Object.fromEntries(Object.keys(ABFRAGE).map((k) => [k, process.env[k]])); for (const k of Object.keys(ABFRAGE)) delete process.env[k]; });
  afterEach(() => { for (const [k, v] of Object.entries(gemerkt)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  it("WP-48 steht über teilspeicherung und abschluss-segmentweise in ssotPakete, je mit Umfang (kein Vollbeleg)", () => {
    for (const id of ["teilspeicherung", "abschluss-segmentweise"]) {
      const f = UNFERTIG.funktionen.find((x) => x.id === id);
      expect(f.ssotPakete).toEqual(["WP-48"]);
      expect(f.ssotUmfang).toMatch(/bleibt G8-Blocker/);
    }
    // aktiv ausgelieferte WP-48-PRs sind ausdrücklich als nicht gedeckt genannt
    expect(UNFERTIG.funktionen.find((x) => x.id === "teilspeicherung").ssotUmfang).toMatch(/NICHT gedeckt.*#87.*#271.*#341/);
  });
  it("jede Variable mit ssotPakete: schalter-aus klassifiziert und Abfrage vorhanden", () => {
    expect(variablen.length).toBeGreaterThan(0);
    for (const v of variablen) {
      expect(KL.variablen[v]?.klasse, v).toBe("schalter-aus");
      expect(ABFRAGE[v], `${v}: Abfrage in diesem Test nachtragen`).toBeTruthy();
    }
  });
  it("Standard AUS: ungesetzt und verstümmelte Werte → aus; nur genau true → an (Gegenprobe)", async () => {
    const s = await import("../server/lib/schalter.mjs");
    for (const v of variablen) {
      const { fn, vor = {} } = ABFRAGE[v];
      expect(typeof s[fn], fn).toBe("function");
      Object.assign(process.env, vor);
      expect(s[fn](), `${v} ungesetzt`).toBe(false);
      for (const w of ["", "1", "TRUE", " true", "true ", "an", "yes", "on"]) { process.env[v] = w; expect(s[fn](), `${v}=${JSON.stringify(w)}`).toBe(false); }
      process.env[v] = "true";
      expect(s[fn](), `${v}=true`).toBe(true);
      delete process.env[v];
      for (const k of Object.keys(vor)) delete process.env[k];
    }
    // OHNE_SPERRE allein schaltet nichts ein
    process.env.CENTRIC_ABSCHLUSS_OHNE_SPERRE = "true";
    expect(s.abschlussOhneSperreAn()).toBe(false);
  });
  it("Repository-Vorlagen: keine dieser Variablen aktiv in .env.example", () => {
    const env = readFileSync(join(WURZEL, ".env.example"), "utf8").split(/\r?\n/);
    for (const v of variablen) expect(env.filter((z) => new RegExp(`^\\s*${v}\\s*=`).test(z)), v).toEqual([]);
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

describe("Delta-Check #437: keine rohen Steuer- oder Formatzeichen in der Ausgabe", () => {
  // Alle Sonderzeichen zur Laufzeit gebildet (kein rohes Zeichen im Quelltext)
  const c = (...n) => String.fromCharCode(...n);
  const ESC = c(0x1b), CSI = c(0x9b), LS = c(0x2028), PS = c(0x2029), RLO = c(0x202e), LF = c(10);
  // erlaubt: druckbare Zeichen, Leerzeichen und \n der eigenen Formatierung; verboten: \p{C} (Steuer-, Format-,
  // private Zeichen), Zeilen-/Absatztrenner, besondere Leerzeichen
  const unsicher = (s) => s.replace(/\n/g, "").match(/[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u);
  const kqAus = (eintraege) => ({
    wurzelDateien: () => eintraege.filter((e) => !e.pfad.includes("/")).map((e) => e.pfad),
    dateien: () => eintraege.filter((e) => e.pfad.startsWith("deploy/") && e.modus.startsWith("100")).map((e) => e.pfad),
    modus: (p) => (eintraege.find((e) => e.pfad === p) || {}).modus ?? null, lesenRoh: () => Buffer.from("x"),
    eintraege: () => eintraege,
  });

  it("Symlink und Submodul mit bösartigem Namen: maskiert, genau eine Meldung je Pfad", () => {
    const link = "deploy/link" + ESC + "[2J" + LS, wl = "wl" + CSI + "2J" + LF, mod = "deploy/mod" + ESC + "x";
    const s = vorlagenStandErmitteln(kqAus([{ pfad: link, modus: "120000" }, { pfad: wl, modus: "120000" }, { pfad: mod, modus: "160000" }]));
    for (const u of s.unbekannt) expect(unsicher(u), JSON.stringify(u)).toBe(null);
    expect(s.unbekannt.filter((u) => u.startsWith("deploy/link"))).toHaveLength(1);
    expect(s.unbekannt.filter((u) => u.startsWith("wl"))).toHaveLength(1);
    expect(s.unbekannt.filter((u) => u.startsWith("deploy/mod"))).toHaveLength(1);
    // auch ein Symlink ohne Steuerzeichen, aber mit Formatzeichen (Richtungsumkehr), ist maskiert und gemeldet
    const r = vorlagenStandErmitteln(kqAus([{ pfad: "deploy/a" + RLO + "lmy.env", modus: "120000" }]));
    expect(r.unbekannt).toHaveLength(1);
    expect(unsicher(r.unbekannt[0])).toBe(null);
  });
  it("Formatzeichen (U+202E, U+200B, U+FEFF) im Pfad sind wie Steuerzeichen NO-GO", () => {
    for (const p of ["Dockerfile" + RLO + "x", "a" + c(0x200b) + ".env", c(0xfeff) + "compose.yml"]) {
      const u = vorlagenStandErmitteln(kqAus([{ pfad: p, modus: "100644" }])).unbekannt.join();
      expect(u, JSON.stringify(p)).toMatch(/Steuerzeichen/);
      expect(unsicher(u)).toBe(null);
    }
  });
  it("G8: Beleg nur, wenn jede Variable als schalter-aus klassifiziert ist; sonst NO-GO", () => {
    const ssot = { pakete: [{ id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: ["#436"] }] };
    const mit = (variablen) => ({ funktionen: [{ id: "w", name: "Planwirkung", variablen, ssotPakete: ["IMP-6"], ssotPrs: ["#436"] }] });
    expect(g8Blocker(ssot, [436], null, KONFIG_STANDARD, mit(["CENTRIC_SCHICHTMODELL_WIRKUNG"]), KL).belege.join()).toMatch(/hinter Schalter AUS/);
    for (const [v, kl] of [[["VAPID_PRIVATE"], KL], [["CENTRIC_ERSTLEITUNG_STRENG"], KL], [["CENTRIC_SCHICHTMODELL_WIRKUNG"], null],
      [["CENTRIC_SCHICHTMODELL_WIRKUNG", "CENTRIC_UNBEKANNT_X"], KL]]) {
      const g = g8Blocker(ssot, [436], null, KONFIG_STANDARD, mit(v), kl);
      expect(g.ergebnis, v.join()).toBe("NO-GO");
      expect(g.belege.join(), v.join()).not.toMatch(/hinter Schalter AUS/);
    }
  });
  it("Gesamtausgabe eines Laufs (JSON, Kurzfassung, CLI) mit bösartigen Namen und Werten enthält kein unsicheres Zeichen", () => {
    const repo = mkdtempSync(join(tmpdir(), "rel1-aus-"));
    const g = (...args) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.protectNTFS=false", ...args], { cwd: repo, encoding: "utf8" });
      if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
      return r.stdout.trim();
    };
    try {
      g("init", "-q");
      writeFileSync(join(repo, ".env.example"), "NODE_ENV=production\n");
      writeFileSync(join(repo, "server.mjs"), 'process.env.CENTRIC_DEMO === "true";\n');
      g("add", "-A"); g("commit", "-q", "-m", "Basis");
      const basis = g("rev-parse", "HEAD");
      // aktiver Wert und unlesbare Zeile mit ANSI-Folge, SSOT-Titel mit Richtungsumkehr
      writeFileSync(join(repo, ".env.example"), "NODE_ENV=production\nCENTRIC_DEMO=" + ESC + "[2J" + CSI + "31m\nCENTRIC_X" + ESC + "=1\n");
      mkdirSync(join(repo, "docs/acc45"), { recursive: true });
      writeFileSync(join(repo, "docs/acc45/work-packages.json"), JSON.stringify({ pakete: [
        { id: "V4-9", prio: "P1", status: "BLOCKED", strang: "folge", pr: [], titel: "Titel" + RLO + ESC + "[2J" + LS + "x" }] }));
      g("add", "-A");
      const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: "x", encoding: "utf8" }).stdout.trim();
      g("update-index", "--add", "--cacheinfo", `120000,${blob},deploy/link${ESC}[2J${LS}`);
      g("update-index", "--add", "--cacheinfo", `120000,${blob},wl${CSI}2J${LF}`);
      g("update-index", "--add", "--cacheinfo", `160000,${"2".repeat(40)},deploy/mod${ESC}x`);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},deploy/x${RLO}.env`);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},deploy/compose${PS}.yml`);
      g("commit", "-q", "-m", "boese" + ESC + "[2J");
      const k = g("rev-parse", "HEAD");
      const r = auswerten(sammeln({ wurzel: repo, offline: false, kandidatSha: k, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz" + ESC); } }));
      const json = JSON.stringify(r, null, 2);
      expect(unsicher(json), "JSON").toBe(null);
      expect(unsicher(kurzfassung(r)), "Kurzfassung").toBe(null);
      expect(gateVon(r, "G3").ergebnis).toBe("NO-GO");
      expect(gateVon(r, "G9").gruende.join()).toMatch(/V4-9/);
      // je Pfad genau eine Meldung im Vorlagenstand
      const u = sammeln({ wurzel: repo, offline: false, kandidatSha: k, basisSha: basis, releaseId: "x1y", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("x"); } }).vorlagenStand.unbekannt;
      for (const p of ["deploy/link", "wl", "deploy/mod", "deploy/x", "deploy/compose"]) expect(u.filter((x) => x.startsWith(p)), p).toHaveLength(1);
      // CLI: --vorlagen-hashes (stderr), --kurz (stdout/stderr) und JSON-Lauf
      for (const args of [["--vorlagen-hashes", "--kandidat", k, "--basis", basis], ["--kandidat", k, "--basis", basis, "--kurz"], ["--kandidat", k, "--basis", basis]]) {
        const c2 = spawnSync(process.execPath, [WERKZEUG, "--wurzel", repo, ...args], { encoding: "utf8" });
        expect(unsicher(c2.stdout), args.join(" ") + " stdout").toBe(null);
        expect(unsicher(c2.stderr), args.join(" ") + " stderr").toBe(null);
      }
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }, 120_000);
  it("CLI-Fehler auf stderr (ausgabeFehler/sicher): Aufrufwerte mit ESC, RLO, U+2028 erscheinen nur als Escape", () => {
    // Gegenprobe (lokal, 2026-11-21): ausgabeFehler = (s) => console.error(s) macht diesen Test rot.
    const lauf = (...args) => spawnSync(process.execPath, [WERKZEUG, ...args], { encoding: "utf8" });
    const faelle = [
      [["--unbekannt" + ESC + "[2J"], /unbekannte Option: --unbekannt\\u001b\[2J/],
      [["--kandidat", "x" + ESC + "[31m", "--basis", "HEAD"], /--kandidat x\\u001b\[31m ist kein Commit/],
      [["--kandidat", "x" + RLO + "y", "--basis", "HEAD"], /--kandidat x\\u202ey ist kein Commit/],
      [["--kandidat", "x" + LS + "y", "--basis", "HEAD"], /--kandidat x\\u2028y ist kein Commit/],
    ];
    for (const [args, muster] of faelle) {
      const r = lauf(...args);
      const name = JSON.stringify(args);
      expect(r.status, name + " " + r.stderr).toBe(2);
      expect(r.stderr, name).toMatch(muster);
      expect(unsicher(r.stderr), name).toBe(null);
      expect(unsicher(r.stdout), name).toBe(null);
    }
  }, 60_000);
});

describe("RELEASE-PROZESS.md: Struktur (Ersetzungsfehler 8ac80cfa, REL-1 Nachzug 2)", () => {
  const text = readFileSync(join(WURZEL, "docs/acc45/RELEASE-PROZESS.md"), "utf8").replace(/\r\n/g, "\n");
  const zeilen = text.split("\n");
  it("jede Überschrift und der Titel stehen genau einmal", () => {
    const ueberschriften = zeilen.filter((z) => /^#{1,6} /.test(z));
    const doppelt = ueberschriften.filter((z, i) => ueberschriften.indexOf(z) !== i);
    expect(doppelt).toEqual([]);
    for (const u of ["# Release-Prozess (REL-1, Stand 2026-11-20)", "## 1. Begriffe", "## 2. Gruppierung: was in ein Release-Paket darf",
      "## 3. Rollen", "## 4. Ablauf", "## 5. Freigabedatei", "## 6. Gates (Kurzfassung)"]) {
      expect(zeilen.filter((z) => z === u), u).toHaveLength(1);
    }
    // der Titel darf auch nicht mitten in einer Zeile stehen (Ersetzungsmuster $` fügt den Dateianfang ein)
    expect(text.split("Release-Prozess (REL-1").length - 1).toBe(1);
  });
  it("G1 bis G10 stehen je genau einmal in der Gate-Tabelle, G3 vollständig", () => {
    for (let n = 1; n <= 10; n++) expect(zeilen.filter((z) => z.startsWith(`| G${n} |`)), `G${n}`).toHaveLength(1);
    const g3 = zeilen.find((z) => z.startsWith("| G3 |"));
    expect(g3).toContain("`\\` und `$` sind nur in benannten Formen erlaubt");
    expect(g3).toContain("jede andere Zeile mit `\\` oder `$` ist NO-GO");
    expect(g3).toContain("Dazu die Vorlagenbindung per SHA-256 (§5)");
    expect(g3.endsWith("Pflicht |")).toBe(true);
  });
});

describe("OF-13 (O-2 b): G7 — erste Auslieferung vom unbeschrifteten Bild 274bfa0 hat kein Rücksprungziel", () => {
  // Produktionsweg §1.1 Befund 3 und §3.3: 274bfa0 trägt kein Revisionslabel; der Forced Command lässt --ohne-label nicht
  // zu (deploy/deploy.sh:93); das Integrationsbild schreibt beim ersten Start in data/ (W-1…W-9). Für den ersten
  // Wechsel gilt bildseitig nur R0 und Vorwärts-Reparatur.
  const C274 = "274bfa0baca5681f383eea334aab69875f31d5c1";
  const D274 = "sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f";
  const erst = freigabelisteLesen(liste([zeileListe(D, K, "aktiv"), zeileListe(D274, C274, "vorherig", "bis T0+24 h")]));
  const normal = freigabelisteLesen(LISTE_OK);
  const g7 = (l, r, basis, extra = {}) => g7Rueckweg({ liste: l, kandidat: K, digest: D, basis },
    r === undefined ? null : { rueckweg: r, ...extra }, KONFIG_STANDARD);
  const R0_B = { strategie: "r0", entscheidungO1: "b", entscheidungO2: "b" };

  it("Konfiguration: 274bfa0 steht mit Commit und Digest als Bild ohne Revisionslabel; der Digest passt zur echten Liste", () => {
    const e = KONFIG_STANDARD.ohneRevisionslabel;
    expect(Array.isArray(e)).toBe(true);
    const z = e.find((x) => x.commit === C274);
    expect(z?.digest).toBe(D274);
    const echt = freigabelisteLesen(readFileSync(join(WURZEL, "deploy/FREIGEGEBENE-IMAGES.md"), "utf8"));
    expect(echt.zeilen.find((x) => x.commit === C274)?.digest).toBe(D274);
  });

  it("Basis 274bfa0, Zeile vorherig 274bfa0, strategie ruecksprung → NO-GO mit klarem Grund", () => {
    const g = g7(erst, { strategie: "ruecksprung" }, C274);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join(" ")).toMatch(/274bfa0/);
    expect(g.gruende.join(" ")).toMatch(/Revisionslabel/);
    expect(g.gruende.join(" ")).toMatch(/nur r0/);
  });

  it("dasselbe mit ruecksprung und dokumentierten O-1/O-2 bleibt NO-GO", () => {
    expect(g7(erst, { strategie: "ruecksprung", entscheidungO1: "a", entscheidungO2: "a" }, C274).ergebnis).toBe("NO-GO");
  });

  it("kein Fehlalarm: Basis 274bfa0 mit r0 und O-1 b / O-2 b → GO, Beleg R0", () => {
    const g = g7(erst, R0_B, C274);
    expect(g.gruende).toEqual([]);
    expect(g.ergebnis).toBe("GO");
    expect(g.belege.join(" ")).toMatch(/R0 als Fehlerstrategie, O-1 b, O-2 b/);
  });

  it("r0 bei Basis 274bfa0: die Zeile vorherig 274bfa0 ersetzt O-1/O-2 nicht", () => {
    expect(g7(erst, { strategie: "r0" }, C274).ergebnis).toBe("NO-GO");
    expect(g7(erst, { strategie: "r0", entscheidungO1: "b" }, C274).ergebnis).toBe("NO-GO");
    expect(g7(erst, { strategie: "r0", entscheidungO2: "b" }, C274).ergebnis).toBe("NO-GO");
  });

  /* Review #441 Befund 1: Die zwei Teilbedingungen der ziel-Berechnung (!unbeschriftet(vorherig), !basisOhneLabel)
     sind je für sich festgehalten. Bei r0 ohne O-1/O-2 entscheidet allein ziel: entfiele eine Teilbedingung
     (Mutanten M-B, M-C), gälte die Zeile vorherig als Rücksprungziel und G7 würde GO ohne dokumentierte O-1/O-2. */
  it("M-B: r0 ohne O-1/O-2, beschriftete Basis (oder offline ohne Basis), Zeile vorherig 274bfa0 → NO-GO", () => {
    const mitBasis = g7(erst, { strategie: "r0" }, B);
    expect(mitBasis.ergebnis).toBe("NO-GO");
    expect(mitBasis.gruende.join(" ")).toMatch(/kein Rücksprungziel und Entscheidung O-1/);
    expect(mitBasis.gruende.join(" ")).toMatch(/kein Rücksprungziel und Entscheidung O-2/);
    expect(g7(erst, { strategie: "r0" }, undefined).ergebnis).toBe("NO-GO");
    // Gegenprobe: dieselbe Basis mit beschrifteter Zeile vorherig ist ein Ziel → r0 ohne O-1/O-2 GO
    expect(g7(normal, { strategie: "r0" }, B).ergebnis).toBe("GO");
  });

  it("M-C: r0 ohne O-1/O-2, Basis 274bfa0, beschriftete Zeile vorherig → NO-GO", () => {
    const g = g7(normal, { strategie: "r0" }, C274);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join(" ")).toMatch(/kein Rücksprungziel und Entscheidung O-1/);
    expect(g7(normal, { strategie: "r0" }, undefined, { basisCommit: C274 }).ergebnis).toBe("NO-GO");
    // mit dokumentierten O-1/O-2 bleibt r0 zulässig
    expect(g7(normal, R0_B, C274).ergebnis).toBe("GO");
  });

  it("Basis nur über basisCommit der Freigabedatei bekannt → ruecksprung NO-GO", () => {
    expect(g7(erst, { strategie: "ruecksprung" }, undefined, { basisCommit: C274 }).ergebnis).toBe("NO-GO");
    // auch wenn --basis etwas anderes sagt: eine der beiden Angaben auf 274bfa0 genügt (G10 meldet den Widerspruch)
    expect(g7(normal, { strategie: "ruecksprung" }, B, { basisCommit: C274 }).ergebnis).toBe("NO-GO");
  });

  it("vorherig = 274bfa0 (Commit oder Digest) ist nie zulässiges Rücksprungziel, auch bei anderer Basis", () => {
    expect(g7(erst, { strategie: "ruecksprung" }, B).ergebnis).toBe("NO-GO");
    const nurDigest = freigabelisteLesen(liste([zeileListe(D, K, "aktiv"), zeileListe(D274, "e".repeat(40), "vorherig")]));
    expect(g7(nurDigest, { strategie: "ruecksprung" }, B).ergebnis).toBe("NO-GO");
    const nurCommit = freigabelisteLesen(liste([zeileListe(D, K, "aktiv"), zeileListe(D_ALT, C274, "vorherig")]));
    expect(g7(nurCommit, { strategie: "ruecksprung" }, B).ergebnis).toBe("NO-GO");
  });

  it("fail-closed: Basis unbekannt → ruecksprung NO-GO (Revisionslabel der Basis nicht zuordenbar)", () => {
    const g = g7(normal, { strategie: "ruecksprung" }, undefined);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join(" ")).toMatch(/Basis/);
    expect(g7(normal, { strategie: "ruecksprung" }, "kein-commit").ergebnis).toBe("NO-GO");
  });

  it("Gegenprobe: beschriftete Basis mit zulässiger Zeile vorherig → ruecksprung bleibt GO", () => {
    const g = g7(normal, { strategie: "ruecksprung" }, B);
    expect(g.ergebnis).toBe("GO");
    expect(g.belege.join(" ")).toMatch(/Rücksprungziel vorherig/);
    expect(g7(normal, { strategie: "ruecksprung" }, undefined, { basisCommit: B }).ergebnis).toBe("GO");
  });

  it("Gesamtprüfung offline: Basis 274bfa0 → G7 NO-GO bei ruecksprung, GO bei r0 mit O-1 b / O-2 b", () => {
    datei("deploy/FREIGEGEBENE-IMAGES.md", liste([zeileListe(D, K, "aktiv"), zeileListe(D274, C274, "vorherig")]));
    const fx = fixtureGo();
    fx.basisCommit = C274;
    const mitRueckweg = (rueckweg) => {
      datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, basisCommit: C274, rueckweg,
        migration: { ...FREIGABE.migration, basisCommit: C274 },
        vorlagenHashes: hashesIn(w, [".env.example", "deploy/compose.yml", "Dockerfile"]) });
      return gateVon(pruefe(fx), "G7");
    };
    const nein = mitRueckweg({ strategie: "ruecksprung", entscheidungO1: "b", entscheidungO2: "b" });
    expect(nein.ergebnis).toBe("NO-GO");
    expect(nein.gruende.join(" ")).toMatch(/274bfa0/);
    const ja = mitRueckweg(R0_B);
    expect(ja.gruende).toEqual([]);
    expect(ja.ergebnis).toBe("GO");
  });

  it("Grund nennt die Ursache: Basis (erste Auslieferung) oder Zeile vorherig", () => {
    // Basis 274bfa0, aber eine beschriftete Zeile vorherig: der Grund ist die Basis, nicht das Ziel
    const basisGrund = g7(normal, { strategie: "ruecksprung" }, C274).gruende.join(" ");
    expect(basisGrund).toMatch(/Basis 274bfa0 ist ein Bild ohne Revisionslabel \(erste Auslieferung/);
    // beschriftete Basis, Zeile vorherig 274bfa0: der Grund ist das Ziel
    const zielGrund = g7(erst, { strategie: "ruecksprung" }, B).gruende.join(" ");
    expect(zielGrund).toMatch(/Zeile vorherig 274bfa0 ist ein Bild ohne Revisionslabel/);
    expect(zielGrund).not.toMatch(/erste Auslieferung/);
  });

  it("Gesamtprüfung offline: die Basis kommt auch ohne basisCommit aus --basis/Fixture in G7 an", () => {
    // Zeile vorherig beschriftet (B), Basis nur über die Fixture 274bfa0, Freigabedatei ohne basisCommit (G10 meldet das)
    const fx = fixtureGo();
    fx.basisCommit = C274;
    datei("docs/acc45/releases/v4-r1.freigabe.json", { ...FREIGABE, basisCommit: undefined, rueckweg: { strategie: "ruecksprung" },
      vorlagenHashes: hashesIn(w, [".env.example", "deploy/compose.yml", "Dockerfile"]) });
    const g = gateVon(pruefe(fx), "G7");
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join(" ")).toMatch(/Basis 274bfa0 .*erste Auslieferung/);
  });

  it("Doku: Anleitung 11 verlangt keine Selbstprüfung mehr, OF-13 ist behoben; RELEASE-PROZESS G7 nennt die Regel", () => {
    const anl = readFileSync(join(WURZEL, "docs/acc45/BETREIBER-ANLEITUNG-ERSTRELEASE.md"), "utf8");
    expect(anl).not.toMatch(/Prüfen Sie den Wert selbst/);
    expect(anl).toMatch(/\| OF-13 \|[^\n]*behoben/);
    // 14.2 (Review #439): alle drei Skripte; in der Tabellenzelle ist „|“ als „\|“ geschrieben
    expect(anl).toMatch(/pgrep -af 'deploy\.sh\\\|abschalten\.sh\\\|ruecksprung\.sh'/);
    expect(anl).not.toMatch(/pgrep -af deploy\.sh[^\\|]/);
    const rp = readFileSync(join(WURZEL, "docs/acc45/RELEASE-PROZESS.md"), "utf8").split(/\r?\n/).find((z) => z.startsWith("| G7 |"));
    expect(rp).toMatch(/274bfa0/);
    expect(rp).toMatch(/ruecksprung/);
  });
});

describe("Endurteil #427 Auflage A1: G8 fail-closed — blockierend ist jeder Status außer erledigt", () => {
  const P = (status, prio = "P0", pr = ["#90"]) => ({ id: "WP-X", prio, status, strang: "acc45", pr, titel: "x" });
  const g8 = (p, prs = [90]) => g8Blocker({ pakete: [p] }, prs, null, KONFIG_STANDARD);
  it("P0/P1-Paket in CI_FAILED mit PR im Kandidaten → NO-GO", () => {
    for (const prio of ["P0", "P1"]) {
      const g = g8(P("CI_FAILED", prio));
      expect(g.ergebnis, prio).toBe("NO-GO");
      expect(g.gruende.join(" ")).toMatch(/WP-X \(P\d, CI_FAILED\)/);
    }
  });
  it("unbekannter oder fehlender Status → NO-GO (fail-closed)", () => {
    for (const s of ["GIBT-ES-NICHT", "done", "", undefined, null, 5]) expect(g8(P(s)).ergebnis, String(s)).toBe("NO-GO");
  });
  it("DONE, INTEGRATED, VERIFIED blockieren nicht; P2 blockiert nie; ohne PR im Kandidaten kein Blocker", () => {
    for (const s of ["DONE", "INTEGRATED", "VERIFIED"]) expect(g8(P(s)).ergebnis, s).toBe("GO");
    expect(g8(P("CI_FAILED", "P2")).ergebnis).toBe("GO");
    expect(g8(P("CI_FAILED"), [91]).ergebnis).toBe("GO");
  });
  it("jeder Status des SSOT-Schemas außer erledigt blockiert (Bindung an acc45-backlog.mjs STATUS)", async () => {
    const { STATUS } = await import("../werkzeug/acc45-backlog.mjs");
    expect(STATUS).toContain("CI_FAILED");
    const offen = STATUS.filter((s) => !["DONE", "INTEGRATED", "VERIFIED"].includes(s));
    expect(offen.length).toBeGreaterThanOrEqual(5);
    for (const s of offen) expect(g8(P(s)).ergebnis, s).toBe("NO-GO");
  });
  it("G8 und G9 teilen dieselbe Liste der erledigten Status (keine Doppelung)", () => {
    expect(KONFIG_STANDARD.blocker.erledigt).toBe(KONFIG_STANDARD.befund.erledigt);
    expect([...KONFIG_STANDARD.blocker.erledigt].sort()).toEqual(["DONE", "INTEGRATED", "VERIFIED"]);
    expect(KONFIG_STANDARD.blocker.status).toBeUndefined(); // keine Positivliste mehr
    expect(g9Befunde({ pakete: [{ id: "V4-X", prio: "P1", status: "CI_FAILED", strang: "folge", pr: [] }] }, null, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
  it("ssotPakete-Beleg: ein P0-Paket in CI_FAILED erhält keinen entlastenden Beleg „hinter Schalter AUS“", () => {
    const ssot = { pakete: [{ id: "IMP-6", prio: "P0", status: "CI_FAILED", strang: "acc45", pr: ["#90"] }] };
    const unfertig = { funktionen: [{ id: "f", name: "F", variablen: ["CENTRIC_F"], ssotPakete: ["IMP-6"], ssotPrs: ["#90"] }] };
    const klassen = { variablen: { CENTRIC_F: { klasse: "schalter-aus" } } };
    const g = g8Blocker(ssot, [90], null, KONFIG_STANDARD, unfertig, klassen);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.belege.join(" ")).not.toMatch(/hinter Schalter AUS/);
  });
});

describe("Endurteil #427 Auflage A2: G1 — jeder Lauf zählt, auch ein älterer roter vor einem neueren grünen", () => {
  it("alter roter Lauf (niedrige id, zuerst in der Liste), neuer grüner Lauf derselben Prüfung → NO-GO", () => {
    const gruen = checks().map((c) => ({ ...c, id: c.id + 100 })); // ids ab 101, später gestartet
    const alt = { id: 1, name: "pruefen-c", status: "completed", conclusion: "failure", head_sha: K };
    for (const runs of [[alt, ...gruen], [...gruen.slice(0, 1), alt, ...gruen.slice(1)]]) {
      const g = g1Ci(runs, K, KONFIG_STANDARD);
      expect(g.ergebnis).toBe("NO-GO");
      expect(g.gruende.join(" ")).toMatch(/Pflicht-Check pruefen-c: failure/);
    }
    // Gegenprobe: ohne den roten Lauf GO
    expect(g1Ci(gruen, K, KONFIG_STANDARD).ergebnis).toBe("GO");
  });
  it("dasselbe für einen Nicht-Pflicht-Check: alter abgebrochener Lauf bleibt NO-GO trotz neuem grünem Lauf", () => {
    const x = (id, conclusion) => ({ id, name: "extra", status: "completed", conclusion, head_sha: K });
    expect(g1Ci([x(1, "cancelled"), ...checks(), x(500, "success")], K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
});

describe("Endurteil #427 Auflage A5: REVIEW-NACHWEIS-2026-11-22.md ist für #427 kein positiver Beleg", () => {
  const ZEILE = "7 Runden (NICHT FREIGEGEBEN, Delta ×6) → Endurteil 2026-11-22 MIT AUFLAGEN";
  it("das Urteil ist keine echte Positivform, auch nicht mit „→ erledigt“", () => {
    expect(urteilPositiv(ZEILE)).toBe(false);
    expect(urteilPositiv(ZEILE + " → erledigt")).toBe(false);
  });
  it("die echte Datei steht im Format der Vorlage und belegt #427 nicht; als spätere Datei hebt sie einen früheren Beleg auf", () => {
    const text = readFileSync(join(WURZEL, "docs/acc45/REVIEW-NACHWEIS-2026-11-22.md"), "utf8").replace(/\r\n/g, "\n");
    expect(text).toContain("| PR | Review-Modell | Runden / Urteil | Stand |\n|---|---|---|---|\n");
    expect(text).toContain(`| #427 | Opus | ${ZEILE} | gemergt |`);
    expect(reviewNachweiseLesen([{ datei: "REVIEW-NACHWEIS-2026-11-22.md", text }]).has(427)).toBe(false);
    const frueher = { datei: "REVIEW-NACHWEIS-2026-11-20.md", text: KOPF + "| #427 | Opus | MERGEBAR | gemergt |\n" };
    expect(reviewNachweiseLesen([frueher]).has(427)).toBe(true);
    expect(reviewNachweiseLesen([{ datei: "REVIEW-NACHWEIS-2026-11-22.md", text }, frueher]).has(427)).toBe(false);
  });
});

describe("Gate-Härtung Review #477 H3 / #473 H1, H2, H4, H5: G8/G9 fail-closed bei prio, pr und ssotPrs", () => {
  const P = (o = {}) => ({ id: "WP-X", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#90"], titel: "x", ...o });
  const g8 = (p, prs = [90], freigabe = null) => g8Blocker({ pakete: [p] }, prs, freigabe, KONFIG_STANDARD);
  const g9 = (p) => g9Befunde({ pakete: [p] }, null, KONFIG_STANDARD);
  const UNBEKANNT = ["p1", "p0", " P0", "P0 ", "P1\n", "", "P4", "P", null, undefined, 1, ["P0"]];
  const T = "CENTRIC_TEILSPEICHERUNG";
  const fkt = (extra = {}) => ({ funktionen: [{ id: "teilspeicherung", name: "Teilspeicherung", variablen: [T], ssotPakete: ["WP-48"], ...extra }] });
  const WP48 = { pakete: [{ id: "WP-48", prio: "P0", status: "IN_PROGRESS", strang: "acc45", pr: ["#87", "#342", "#348", "#350"] }] };
  const ANGENOMMEN = { akzeptiertePakete: [{ id: "WP-48", grund: "Betreiber-Annahme" }] };

  it("Konstanten: bekannte Prioritäten und PR-Format sind an acc45-backlog.mjs gebunden; G8 und G9 teilen die Blocker-Prioritäten", async () => {
    const BL = await import("../werkzeug/acc45-backlog.mjs");
    const RP = await import("../werkzeug/release-pruefung.mjs");
    expect([...RP.PRIO_STUFEN]).toEqual([...BL.PRIOS]);
    expect(Object.isFrozen(RP.PRIO_STUFEN)).toBe(true);
    expect(RP.PR_MUSTER.source).toBe(BL.PR_MUSTER.source);
    expect(KONFIG_STANDARD.blocker.prios).toBe(KONFIG_STANDARD.befund.prios);
    expect([...KONFIG_STANDARD.blocker.prios]).toEqual(["P0", "P1"]);
  });

  it("G8: unbekannte oder fehlende prio eines offenen Pakets mit PR im Kandidaten → NO-GO (nicht „kein P0/P1“)", () => {
    for (const prio of UNBEKANNT) {
      const g = g8(P({ prio }));
      const n = JSON.stringify(prio) ?? "undefined";
      expect(g.ergebnis, n).toBe("NO-GO");
      expect(g.gruende.join(" "), n).toMatch(/WP-X .*Priorität .*unbekannt/);
    }
  });

  it("G8: Gegenproben — P2/P3 offen, erledigt mit unbekannter prio, kein PR im Kandidaten → GO; Annahme mit Grund wirkt", () => {
    for (const prio of ["P2", "P3"]) expect(g8(P({ prio })).ergebnis, prio).toBe("GO");
    for (const status of ["DONE", "INTEGRATED", "VERIFIED"]) expect(g8(P({ prio: "p1", status })).ergebnis, status).toBe("GO");
    expect(g8(P({ prio: "p1" }), [91]).ergebnis).toBe("GO");
    const a = g8(P({ prio: "p1" }), [90], { akzeptiertePakete: [{ id: "WP-X", grund: "x" }] });
    expect(a.ergebnis).toBe("GO");
    expect(a.belege.join(" ")).toMatch(/WP-X .*akzeptiert/);
  });

  it("G8: pr eines offenen P0/P1-Pakets (oder mit unbekannter prio) ist keine gültige Liste „#123“ → NO-GO (fail-closed)", () => {
    for (const pr of ["#90", 90, {}, null, undefined, ["90"], [90], ["#90a"], ["#0"], ["#90", "#90"], ["#99999999999999999999"]]) {
      for (const prio of ["P0", "P1", "p1"]) {
        const g = g8(P({ prio, pr }), [90]);
        const n = `${prio} ${JSON.stringify(pr) ?? "undefined"}`;
        expect(g.ergebnis, n).toBe("NO-GO");
        expect(g.gruende.join(" "), n).toMatch(/WP-X .*pr /);
      }
    }
    // Gegenproben: gültige Liste ohne Treffer → GO; P2 mit ungültigem pr bleibt Sache des Schemas (acc45-backlog pruefen)
    expect(g8(P({ pr: [] })).ergebnis).toBe("GO");
    expect(g8(P({ pr: ["#91"] })).ergebnis).toBe("GO");
    expect(g8(P({ prio: "P2", pr: "#90" })).ergebnis).toBe("GO");
    expect(g8(P({ status: "DONE", pr: "#90" })).ergebnis).toBe("GO");
  });

  it("G9: unbekannte oder fehlende prio eines offenen Befunds → NO-GO; P2/P3 und Nicht-Befunde → GO; REL-* bleibt ausgenommen", () => {
    for (const prio of UNBEKANNT) {
      for (const b of [{ id: "F-1", strang: "folge" }, { id: "V4-9", strang: "acc45" }, { id: "ABN-S9", strang: "acc45" }]) {
        const g = g9(P({ ...b, prio, status: "BLOCKED", pr: [] }));
        const n = `${b.id} ${JSON.stringify(prio) ?? "undefined"}`;
        expect(g.ergebnis, n).toBe("NO-GO");
        expect(g.gruende.join(" "), n).toMatch(/Priorität .*unbekannt/);
      }
    }
    for (const prio of ["P2", "P3"]) expect(g9(P({ id: "F-1", strang: "folge", prio, status: "BLOCKED" })).ergebnis, prio).toBe("GO");
    expect(g9(P({ id: "WP-X", strang: "acc45", prio: "p1", status: "BLOCKED" })).ergebnis).toBe("GO");
    expect(g9(P({ id: "REL-2", strang: "folge", prio: "p1", status: "BLOCKED" })).ergebnis).toBe("GO"); // bekannte REL-ID (Review #486 H-b)
    expect(g9(P({ id: "F-1", strang: "folge", prio: "p1", status: "DONE" })).ergebnis).toBe("GO");
  });

  it("ssotPrs: Eintrag, der in keinem pr der genannten ssotPakete steht → NO-GO mit Namen; gültige Einträge → GO", () => {
    const ok = g8Blocker(WP48, [87, 342, 348, 350], ANGENOMMEN, KONFIG_STANDARD, fkt({ ssotPrs: ["#342", "#348", "#350"] }), KL);
    expect(ok.ergebnis).toBe("GO");
    for (const ssotPrs of [["#999"], ["#342", "#349"], ["#342", "#348", "#350", "#1"]]) {
      const g = g8Blocker(WP48, [87, 342, 348, 350], ANGENOMMEN, KONFIG_STANDARD, fkt({ ssotPrs }), KL);
      expect(g.ergebnis, JSON.stringify(ssotPrs)).toBe("NO-GO");
      expect(g.gruende.join(" "), JSON.stringify(ssotPrs)).toMatch(/teilspeicherung: ssotPrs #(999|349|1) steht in keinem pr der ssotPakete \(WP-48\)/);
    }
    // auch ohne PR des Pakets im Kandidaten (Tippfehler bleibt nicht unbemerkt)
    expect(g8Blocker(WP48, [], null, KONFIG_STANDARD, fkt({ ssotPrs: ["#999"] }), KL).ergebnis).toBe("NO-GO");
    expect(g8Blocker(WP48, [], null, KONFIG_STANDARD, fkt({ ssotPrs: ["#342"] }), KL).ergebnis).toBe("GO");
  });

  it("H1 (Review #483): ssotPakete-Paket mit unbekannter prio erhält keinen entlastenden Beleg „hinter Schalter AUS“", () => {
    for (const prio of ["p2", " P2", undefined, "P4"]) {
      const s = { pakete: [{ id: "IMP-6", prio, status: "IN_PROGRESS", strang: "acc45", pr: ["#436"] }] };
      const u = { funktionen: [{ id: "w", name: "Planwirkung", variablen: ["CENTRIC_SCHICHTMODELL_WIRKUNG"], ssotPakete: ["IMP-6"], ssotPrs: ["#436"] }] };
      const g = g8Blocker(s, [436], null, KONFIG_STANDARD, u, KL);
      const n = JSON.stringify(prio) ?? "undefined";
      expect(g.ergebnis, n).toBe("NO-GO");
      expect(g.belege.join(" "), n).not.toMatch(/hinter Schalter AUS/);
    }
    // Gegenprobe: gültige P2 erhält den Beleg
    const ok = g8Blocker({ pakete: [{ id: "IMP-6", prio: "P2", status: "IN_PROGRESS", strang: "acc45", pr: ["#436"] }] }, [436], null, KONFIG_STANDARD,
      { funktionen: [{ id: "w", name: "Planwirkung", variablen: ["CENTRIC_SCHICHTMODELL_WIRKUNG"], ssotPakete: ["IMP-6"], ssotPrs: ["#436"] }] }, KL);
    expect(ok.belege.join(" ")).toMatch(/hinter Schalter AUS/);
  });

  it("ssotPrs ohne ssotPakete → NO-GO (Schemafehler); ohne beide Felder unverändert GO", () => {
    for (const extra of [{ ssotPakete: undefined, ssotPrs: ["#342"] }, { ssotPakete: undefined, ssotPrs: [] }, { ssotPakete: undefined, ssotPrs: "x" }]) {
      const g = g8Blocker(WP48, [], null, KONFIG_STANDARD, fkt(extra), KL);
      expect(g.ergebnis, JSON.stringify(extra)).toBe("NO-GO");
      expect(g.gruende.join(" "), JSON.stringify(extra)).toMatch(/teilspeicherung: ssotPrs ohne ssotPakete/);
    }
    expect(g8Blocker(WP48, [], null, KONFIG_STANDARD, fkt({ ssotPakete: undefined }), KL).ergebnis).toBe("GO");
  });

  it("ssotPrsLesen: nur „#123“ (keine Zahl ohne #), nur sichere Ganzzahlen", async () => {
    const { ssotPrsLesen } = await import("../werkzeug/release-pruefung.mjs");
    for (const w of [[342], ["#342", 348], [Number.MAX_SAFE_INTEGER], ["#9007199254740993"], ["#99999999999999999999"], [1e21]]) {
      expect(ssotPrsLesen(w).fehler, JSON.stringify(w)).toBeTruthy();
    }
    expect([...ssotPrsLesen(["#342", "#9007199254740991"]).prs]).toEqual([342, 9007199254740991]);
    expect(ssotPrsLesen(undefined)).toEqual({ prs: null });
  });

  it("Repository-Stand: die echte SSOT und RELEASE-UNFERTIG.json bleiben unter der Härtung GO (verhaltensneutral)", () => {
    const ssot = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/work-packages.json"), "utf8"));
    const g = g8Blocker(ssot, [], null, KONFIG_STANDARD, UNFERTIG, KL);
    expect(g.gruende).toEqual([]);
    expect(g.ergebnis).toBe("GO");
    // jedes ssotPrs steht im pr eines genannten ssotPakete-Pakets
    const pakete = new Map(ssot.pakete.map((p) => [p.id, p]));
    for (const f of UNFERTIG.funktionen) for (const nr of f.ssotPrs || []) {
      expect(f.ssotPakete.some((id) => (pakete.get(id)?.pr || []).includes(nr)), `${f.id}: ${nr}`).toBe(true);
    }
  });
});

/* Review #483 (Opus), Folgebefunde H2/H3: G9 erkennt Befund-Pakete fail-closed. Strang muss bekannt sein (genau wie in
   acc45-backlog.mjs STRAENGE, ohne stilles „acc45“), die ID muss dem Schema genügen (ID_MUSTER), das ID-Präfix ABN-/V4-
   zählt normalisiert (NFKC, Groß-/Kleinschreibung, Unicode-Bindestriche). Ein Eintrag in pakete, der kein Objekt ist,
   blockiert G8 und G9 mit eigener Zeile. Gültige heutige Daten: dieselbe Entscheidung wie vorher. */
describe("Gate-Härtung Review #483 H2/H3: G9 Strang und ID fail-closed, Paket ohne Objektform", () => {
  const P = (o = {}) => ({ id: "X-1", prio: "P1", status: "BLOCKED", strang: "acc45", pr: [], titel: "x", ...o });
  const g9 = (p, freigabe = null) => g9Befunde({ pakete: [p] }, freigabe, KONFIG_STANDARD);
  const g8 = (pakete, prs = [90]) => g8Blocker({ pakete }, prs, null, KONFIG_STANDARD);
  const STRANG_FALSCH = ["Folge", "folge ", " folge", "FOLGE", "", "unbekannt", "acc 45", null, 1, ["folge"], undefined];
  const ID_FALSCH = ["ABN‑1", "ABN–1", "ABN‐1", "ABN−1", "ABN 1", "ABN-1\u0000", "ABN​-1", "ＡBN-1",
    " ABN-1", "ABN-1 ", "ABN-1\n", "", "-ABN", "ABN/1", null, undefined, 1, ["ABN-1"]];
  const ohneStrang = () => { const p = P(); delete p.strang; return p; };

  it("Konstanten: STRAENGE und ID_MUSTER sind an acc45-backlog.mjs gebunden", async () => {
    const BL = await import("../werkzeug/acc45-backlog.mjs");
    const RP = await import("../werkzeug/release-pruefung.mjs");
    expect([...RP.STRAENGE]).toEqual([...BL.STRAENGE]);
    expect(Object.isFrozen(RP.STRAENGE)).toBe(true);
    expect(RP.ID_MUSTER.source).toBe(BL.ID_MUSTER.source);
    expect(RP.ID_MUSTER.flags).toBe(BL.ID_MUSTER.flags);
  });

  it("G9: offenes P0/P1-Paket mit unbekanntem oder fehlendem strang → NO-GO (fail-closed), auch ohne ABN-/V4-Präfix", () => {
    for (const strang of STRANG_FALSCH) {
      const p = strang === undefined ? ohneStrang() : P({ strang });
      for (const prio of ["P0", "P1", "p1"]) {
        const g = g9({ ...p, prio });
        const n = `${prio} ${JSON.stringify(strang) ?? "fehlt"}`;
        expect(g.ergebnis, n).toBe("NO-GO");
        expect(g.gruende.join(" "), n).toMatch(/X-1 .*strang .*(fehlt|unbekannt)/);
      }
    }
    // auch eine Annahme hebt einen Schemafehler nicht auf (erst Daten korrigieren)
    expect(g9(P({ strang: "Folge" }), { akzeptierteBefunde: [{ id: "X-1", grund: "x" }] }).ergebnis).toBe("NO-GO");
  });

  it("G9: ID-Präfix ABN-/V4- zählt normalisiert (Groß-/Kleinschreibung) → offenes Paket NO-GO", () => {
    for (const id of ["abn-1", "Abn-S2", "aBN-x", "v4-9", "V4-9", "ABN-1"]) {
      const g = g9(P({ id }));
      expect(g.ergebnis, id).toBe("NO-GO");
      expect(g.gruende.join(" "), id).toMatch(new RegExp(`^${id} \\(P1, BLOCKED\\)`));
    }
  });

  it("G9: ID außerhalb des Schemas (Unicode-Bindestrich, Leerzeichen, Steuer- oder Breitzeichen, kein Text) → NO-GO", () => {
    for (const id of ID_FALSCH) {
      for (const strang of ["acc45", "folge"]) {
        const g = g9(P({ id, strang }));
        const n = `${JSON.stringify(id) ?? "undefined"} ${strang}`;
        expect(g.ergebnis, n).toBe("NO-GO");
        expect(g.gruende.join(" "), n).toMatch(/ID .*ungültig/);
        expect(g.gruende.join(" "), n).not.toMatch(/[\u0000​‑\n]/); // keine rohen Steuer-/Sonderzeichen
      }
    }
  });

  it("G9: Gegenproben — gültige Daten wie vorher", () => {
    for (const strang of ["acc45", "wp19", "intelligence", "extern"]) expect(g9(P({ strang })).ergebnis, strang).toBe("GO");
    expect(g9(P({ strang: "folge" })).ergebnis).toBe("NO-GO");
    expect(g9(P({ id: "ABN-S2" })).ergebnis).toBe("NO-GO");
    expect(g9(P({ id: "V4-2b", strang: "folge" })).ergebnis).toBe("NO-GO");
    expect(g9(P({ id: "REL-2", strang: "folge" })).ergebnis).toBe("GO");      // bekannte REL-ID (Review #486 H-b)
    expect(g9(P({ id: "rel-2", strang: "folge" })).ergebnis).toBe("NO-GO"); // Ausnahme REL- nur exakt
    expect(g9(P({ id: "rel-9", strang: "folge" })).ergebnis).toBe("NO-GO"); // Ausnahme REL- nur exakt
    expect(g9(P({ id: "ABN-S2" }), { akzeptierteBefunde: [{ id: "ABN-S2", grund: "x" }] }).ergebnis).toBe("GO");
    // nur offene P0/P1 (oder unbekannte prio) werden geprüft: P2/P3 und erledigte bleiben unberührt
    for (const prio of ["P2", "P3"]) {
      expect(g9(P({ prio, strang: "Folge" })).ergebnis, prio).toBe("GO");
      expect(g9(P({ prio, id: "ABN‑1" })).ergebnis, prio).toBe("GO");
    }
    for (const status of ["DONE", "INTEGRATED", "VERIFIED"]) {
      expect(g9(P({ status, strang: "Folge" })).ergebnis, status).toBe("GO");
      expect(g9(P({ status, id: "abn-1" })).ergebnis, status).toBe("GO");
    }
  });

  it("G8 und G9: ein Eintrag in pakete, der kein Objekt ist, → NO-GO mit eigener Zeile (nicht still übersprungen)", () => {
    const ok = P({ id: "WP-1", prio: "P2" });
    for (const x of [null, "WP-1", ["WP-1", "Titel", "P1"], 5, true]) {
      const n = JSON.stringify(x);
      const a = g8([ok, x]);
      expect(a.ergebnis, n).toBe("NO-GO");
      expect(a.gruende.join(" "), n).toMatch(/pakete\[1\] ist kein Objekt/);
      const b = g9Befunde({ pakete: [x, ok] }, null, KONFIG_STANDARD);
      expect(b.ergebnis, n).toBe("NO-GO");
      expect(b.gruende.join(" "), n).toMatch(/pakete\[0\] ist kein Objekt/);
    }
    expect(g8([ok]).ergebnis).toBe("GO");
    expect(g9Befunde({ pakete: [ok] }, null, KONFIG_STANDARD).ergebnis).toBe("GO");
  });

  it("Repository-Stand: jedes Paket hat bekannten strang und gültige ID; G9 entscheidet wie die alte exakte Regel", async () => {
    const BL = await import("../werkzeug/acc45-backlog.mjs");
    const ssot = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/work-packages.json"), "utf8"));
    expect(ssot.pakete.length).toBeGreaterThan(200);
    for (const p of ssot.pakete) {
      expect(p !== null && typeof p === "object" && !Array.isArray(p), JSON.stringify(p).slice(0, 40)).toBe(true);
      expect(BL.STRAENGE, p.id).toContain(p.strang);
      expect(p.id, p.id).toMatch(BL.ID_MUSTER);
    }
    // alte Regel (vor #483-Folge): Strang exakt folge oder ID exakt ^ABN-/^V4-, REL- ausgenommen
    const alt = ssot.pakete.filter((p) => !/^REL-/.test(p.id) && (p.strang === "folge" || /^(ABN|V4)-/.test(p.id))
      && !["DONE", "INTEGRATED", "VERIFIED"].includes(p.status) && ["P0", "P1"].includes(p.prio)).map((p) => p.id);
    const g = g9Befunde(ssot, null, KONFIG_STANDARD);
    expect(g.gruende.map((x) => x.split(" ")[0])).toEqual(alt);
    expect(g8Blocker(ssot, [], null, KONFIG_STANDARD).gruende).toEqual([]);
  });
});

/* Review #486 (Opus) H-b: G9 nahm jede ID mit exaktem Präfix REL- aus („Release-Prozess selbst“), auch ein unbekanntes
   Paket wie REL-ABN-1 (strang acc45, P1 offen) → G9 GO. Jetzt gilt die Ausnahme nur für die bekannten REL-Pakete
   (REL_AUSNAHME_IDS); jedes andere offene P0/P1-Paket mit Präfix REL- blockiert (fail-closed), auch mit Annahme.
   Gültige heutige Daten: dieselbe G9-Entscheidung wie vorher (Repository-Stand unten und Test „alte exakte Regel“). */
describe("Gate-Härtung Review #486 H-b: REL-Ausnahme in G9 nur für bekannte REL-IDs", () => {
  const P = (o = {}) => ({ id: "X-1", prio: "P1", status: "BLOCKED", strang: "acc45", pr: [], titel: "x", ...o });
  const g9 = (p, freigabe = null) => g9Befunde({ pakete: [p] }, freigabe, KONFIG_STANDARD);
  const STRAENGE_HEUTE = ["acc45", "wp19", "intelligence", "folge", "extern"];
  const UNBEKANNT_REL = ["REL-ABN-1", "REL-5", "REL-V4-1", "REL-1a", "REL-0C", "REL-10", "REL-"];

  it("REL-ABN-1 mit strang acc45 und offenem P1 → NO-GO (Befund aus Review #486)", () => {
    const g = g9(P({ id: "REL-ABN-1", strang: "acc45", prio: "P1", status: "BLOCKED" }));
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join(" ")).toMatch(/^REL-ABN-1 \(P1, BLOCKED\): .*REL_AUSNAHME_IDS/);
  });

  it("jede unbekannte REL-ID, jeder Strang, P0/P1/unbekannte prio, jeder offene Status → NO-GO; Annahme hebt nicht auf", () => {
    for (const id of UNBEKANNT_REL) for (const strang of STRAENGE_HEUTE) for (const prio of ["P0", "P1", "p1", undefined]) {
      for (const status of ["BLOCKED", "REVIEW", "IN_PROGRESS", "CI_FAILED", undefined]) {
        const n = `${id} ${strang} ${prio} ${status}`;
        const p = P({ id, strang, prio, status });
        const g = g9(p);
        expect(g.ergebnis, n).toBe("NO-GO");
        expect(g.gruende.join(" "), n).toMatch(/REL_AUSNAHME_IDS/);
        expect(g9(p, { akzeptierteBefunde: [{ id, grund: "x" }] }).ergebnis, n).toBe("NO-GO");
      }
    }
  });

  it("Gegenproben: bekannte REL-IDs bleiben Ausnahme; P2/P3 und erledigte unberührt; „rel-1“ klein wie bisher", () => {
    expect([...REL_AUSNAHME_IDS]).toEqual(["REL-0", "REL-0c", "REL-1", "REL-2", "REL-3", "REL-4"]);
    expect(Object.isFrozen(REL_AUSNAHME_IDS)).toBe(true);
    for (const id of REL_AUSNAHME_IDS) for (const strang of STRAENGE_HEUTE) for (const prio of ["P0", "P1", "p1"]) {
      expect(g9(P({ id, strang, prio })).ergebnis, `${id} ${strang} ${prio}`).toBe("GO");
    }
    for (const id of UNBEKANNT_REL) {
      for (const prio of ["P2", "P3"]) expect(g9(P({ id, prio, strang: "folge" })).ergebnis, `${id} ${prio}`).toBe("GO");
      for (const status of ["DONE", "INTEGRATED", "VERIFIED"]) expect(g9(P({ id, status, strang: "folge" })).ergebnis, `${id} ${status}`).toBe("GO");
    }
    // klein geschrieben ist kein REL-Paket: als Strang-folge-Befund NO-GO, sonst kein Befund (unverändert)
    const klein = g9(P({ id: "rel-1", strang: "folge" }));
    expect(klein.ergebnis).toBe("NO-GO");
    expect(klein.gruende.join(" ")).not.toMatch(/REL_AUSNAHME_IDS/);
    expect(g9(P({ id: "rel-1", strang: "acc45" })).ergebnis).toBe("GO");
    expect(g9(P({ id: "rel-abn-1", strang: "acc45" })).ergebnis).toBe("GO");
  });

  it("Repository-Stand: die REL-Pakete der SSOT sind genau REL_AUSNAHME_IDS (neues REL-Paket ⇒ Liste per Review prüfen)", () => {
    const ssot = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/work-packages.json"), "utf8"));
    const rel = ssot.pakete.map((p) => p.id).filter((id) => id.startsWith("REL-"));
    expect([...rel].sort()).toEqual([...REL_AUSNAHME_IDS].sort());
    expect(g9Befunde(ssot, null, KONFIG_STANDARD).gruende.join(" ")).not.toMatch(/REL_AUSNAHME_IDS/);
  });
});

/* ======================================================================================================================
   GATE-EW1/EW2 (Gate-Entwurf 2026-11-24 v2, A.4–A.8; SPEZ-UMSETZUNG §2.6): einmalige Erstwechsel-Ausnahme der
   Widerrufbuch-Probe in G6 (nur v4-r1, nur vor T0, bis 2026-12-31), Bedingungen E1–E15, Nachhol-Modus --nachhol und
   Folge-Release-Rückhalt. Tests T-P1…T-P3, T-N1…T-N17, Konfig-Bindung. Feste Uhr (JETZT), kein Netz, nur Testdaten.
   ==================================================================================================================== */
describe("GATE-EW1/EW2: Erstwechsel-Ausnahme der Widerrufbuch-Probe (G6) und Nachhol-Modus", () => {
  const EW = JSON.parse(readFileSync(join(WURZEL, "pruefungen/fixtures/erstwechsel-gueltig.json"), "utf8"));
  const C = KONFIG_STANDARD.erstwechselAusnahme.widerrufbuchProbe;
  const C274 = "274bfa0baca5681f383eea334aab69875f31d5c1";
  const D274 = "sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f";
  const M = K;                    // Kandidat = Merge-Commit auf main (Bild-Commit)
  const S = EW.schnittCommit;     // Schnitt release/rc-<id> = 2. Elter von M
  const BAUM = EW.erstwechsel.baeume.kandidat;
  const NACHWEIS = "docs/acc45/releases/v4-r1/nachweise/staging-widerrufbuch.json";
  const SKRIPT = "deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh";
  const FREIGABE_PFAD = "docs/acc45/releases/v4-r1.freigabe.json";
  const ABLAGE = "docs/acc45/releases/v4-r1/nachhol/";
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const roh = (rel) => readFileSync(join(w, rel));
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const QUITTUNG = (rid = "v4-r1") => `Ich nehme die einmalige Erstwechsel-Ausnahme der Widerrufbuch-Probe für ${rid} an (Kandidat ${M}, `
    + `Schnitt ${S}, Digest ${D}, Basis ${C274}). Die Probe wird binnen 24 h nach T0 durchgeführt und lokal verifiziert; `
    + "der Nachweis kommt binnen 48 h ins Repository. Bei jeder Abbruchbedingung gilt die Abbruchtabelle A.8. Nach einem "
    + "Abbruch gibt es keine neue Ausnahme. Die Ausnahme gilt bis 2026-12-31 und nie für einen weiteren Release.";
  const LISTE_EW = (extra = []) => liste([
    zeileListe(D, M, "aktiv", "Kandidat"),
    zeileListe(D274, C274, "vorherig", "bis T0+24 h"),
    zeileListe("sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79", "64d08a4957c5374e1f04c17be2b75162c07573d2", "gesperrt", "P0-0"),
    zeileListe("sha256:0861adee", "1a56988d3c406aff99281f96c2d7da1dc24d7af7", "gesperrt", "alt"),
    ...extra,
  ]);
  const STAGING = (skriptSha = sha(roh(SKRIPT))) => ({
    digest: D, commit: M, laufCommit: S, baum: BAUM, lauf: "4242-1", ergebnis: "success", erstellt: "2026-11-19T12:00:00Z",
    widerrufbuch: { art: "widerrufbuch-staging-funktionstest", proben: { S1: "ok", S2: "ok", S3: "ok", S4: "ok", S5: "ok", S6: "ok" }, skriptSha256: skriptSha },
  });

  /** Schreibt Liste, Skript, CODEOWNERS, Staging-Nachweis und Freigabedatei (mit Ausnahme) nach w; liefert die Fixture. */
  function aufbauen({ nachweis = {}, ausnahme = {}, freigabe = {}, ohneNachweis = false, listeExtra = [] } = {}) {
    datei("deploy/FREIGEGEBENE-IMAGES.md", LISTE_EW(listeExtra));
    datei(SKRIPT, "#!/usr/bin/env bash\n# synthetisch (Test GATE-EW1)\n");
    datei(".github/CODEOWNERS", "# Release-Pfade (F9, E14 b)\n" + C.codeOwnerPfade.map((p) => `/${p} @rinats-png`).join("\n") + "\n");
    if (!ohneNachweis) datei(NACHWEIS, { ...STAGING(), ...nachweis });
    const nachweisRoh = ohneNachweis ? Buffer.from("") : roh(NACHWEIS);
    const a = {
      releaseId: "v4-r1", basisCommit: C274, kandidatCommit: M, schnittCommit: S, digest: D, nachholFristStunden: 24,
      repoFristStunden: 48, gueltigBis: "2026-12-31", staging: { lauf: "4242-1", nachweis: NACHWEIS, sha256: sha(nachweisRoh) },
      abbruchBedingungen: [...C.abbruchBedingungen], nachholAblage: ABLAGE, quittung: QUITTUNG(), ...ausnahme,
    };
    datei(FREIGABE_PFAD, {
      ...FREIGABE, basisCommit: C274, schnittCommit: S, migration: { ...FREIGABE.migration, basisCommit: C274 },
      vorlagenHashes: hashesIn(w, [".env.example", "deploy/compose.yml", "Dockerfile"]), erstwechselAusnahme: { widerrufbuchProbe: a }, ...freigabe,
    });
    const fx = JSON.parse(JSON.stringify(fixtureGo()).replaceAll("b".repeat(40), C274));
    delete fx.nachweise.widerrufbuchProbe; // vor T0 gibt es keine Probe (E10)
    fx.erstwechsel = { ...kopie(EW.erstwechsel), stagingArtefakt: [Buffer.from("axe").toString("base64"), nachweisRoh.toString("base64")] };
    fx.nachhol = kopie(EW.nachhol);
    return fx;
  }
  const g6 = (fx, opt) => gateVon(pruefe(fx, opt), "G6");
  /** G6 NO-GO und genau ein Grund trägt die Bedingung id (E1 … E15). */
  function erwarte(fx, id, opt) {
    const g = g6(fx, opt);
    expect(g.ergebnis, id).toBe("NO-GO");
    expect(g.gruende.filter((x) => x.includes(` ${id}: `)), `${id} in ${g.gruende.join(" | ")}`).toHaveLength(1);
    return g;
  }
  const mitEw = (fx, aendern) => { aendern(fx.erstwechsel); return fx; };

  describe("Konfiguration (Bindung, F2/F3/F5)", () => {
    it("Werte wie Gate-Entwurf A.4; Standard fail-closed; tief eingefroren", () => {
      expect(C.releaseIds).toEqual(["v4-r1"]);
      expect(C.basisCommit).toBe(C274);
      expect(KONFIG_STANDARD.ohneRevisionslabel.some((o) => o.commit === C.basisCommit)).toBe(true);
      expect([C.nachholFristStunden, C.repoFristStunden, C.gueltigBis]).toEqual([24, 48, "2026-12-31"]);
      expect([...C.abbruchBedingungen].sort()).toEqual(["A-ABLAUF", "A-ABN", "A-BILD", "A-BUCH", "A-DATEN", "A-FRIST", "A-HOST",
        "A-PROBE", "A-PROBE-W", "A-REPO", "A-SICH", "A-SICHER", "A-START", "A-STG", "A-VIER", "A-VOR"]);
      expect(C.stagingProben).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
      expect(KONFIG_STANDARD.sicherung.widerrufbuchProbePflicht).toBe(true);
      const tief = (o) => Object.isFrozen(o) && Object.values(o).every((v) => v === null || typeof v !== "object" || tief(v));
      expect(tief(KONFIG_STANDARD.erstwechselAusnahme)).toBe(true);
      expect(Object.isFrozen(KONFIG_STANDARD.sicherung)).toBe(true);
      expect(() => C.releaseIds.push("v4-r2")).toThrow();
    });
    it("kein CLI-Schalter für die Ausnahme; --konfig-zeigen zeigt sie", () => {
      for (const a of ["--erstwechsel", "--ausnahme", "--widerrufbuch-probe-pflicht", "--konfig"]) expect(() => argumenteLesen([a]), a).toThrow(/unbekannte Option/);
      const r = spawnSync(process.execPath, [WERKZEUG, "--konfig-zeigen"], { encoding: "utf8" });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).erstwechselAusnahme.widerrufbuchProbe.gueltigBis).toBe("2026-12-31");
    }, 60_000);
  });

  describe("Commit-Bindung: zwischen Endprüfung und Auslieferung nur Liste und Freigabedateien (G10)", () => {
    it("jede andere Änderung seit dem Kandidaten ⇒ G10 NO-GO; erlaubt nur docs/acc45/releases/ und die Freigabeliste", () => {
      expect(KONFIG_STANDARD.erlaubtNachKandidat).toEqual(["docs/acc45/releases/", "deploy/FREIGEGEBENE-IMAGES.md"]);
      const fall = (p) => g10Freigabe({ releaseId: "v4-r1", freigabe: FREIGABE, commitet: true, kandidat: K, digest: D, basis: B,
        stand: { kandidatIstVorfahr: true, headGepusht: true, geaendertSeitKandidat: ["deploy/FREIGEGEBENE-IMAGES.md", p] } }, KONFIG_STANDARD).ergebnis;
      for (const p of ["deploy/deploy.sh", "deploy/digest-pruefen.sh", "deploy/freigabe-lib.sh", ".github/workflows/deploy.yml", ".github/CODEOWNERS",
        "werkzeug/release-pruefung.mjs", "Dockerfile", "server.mjs", "docs/acc45/releases-x/a.json", "docs/acc45/RELEASE-PROZESS.md",
        "deploy/FREIGEGEBENE-IMAGES.md.neu", "docs/acc45/release/v4-r1.freigabe.json"]) expect(fall(p), p).toBe("NO-GO");
      for (const p of ["docs/acc45/releases/v4-r1.freigabe.json", "docs/acc45/releases/v4-r1/nachweise/staging-widerrufbuch.json"]) expect(fall(p), p).toBe("GO");
    });
  });

  describe("positiv", () => {
    it("T-P1: gültige Ausnahme → G6 GO mit Belegzeile und Auflage; offline Exit 3, online (Stub) Exit 0", () => {
      const fx = aufbauen();
      const r = pruefe(fx);
      expect(r.gates.map((g) => [g.id, g.ergebnis, g.gruende])).toEqual(r.gates.map((g) => [g.id, "GO", []]));
      expect(gateVon(r, "G6").belege.join(" ")).toMatch(/ERSTWECHSEL-AUSNAHME v4-r1 .*Probe NICHT geprüft/);
      expect(r.auflagen).toEqual([{ art: "nachholpruefung-widerrufbuch", releaseId: "v4-r1", fristStunden: 24, repoFristStunden: 48,
        ablage: ABLAGE, abbruchBedingungen: [...C.abbruchBedingungen] }]);
      expect([r.gesamt, r.exitCode]).toEqual(["GO", 3]);
      expect(kurzfassung(r)).toMatch(/AUFLAGE nachholpruefung-widerrufbuch v4-r1: Probe bis T0\+24 h, Nachweis bis T0\+48 h/);
      expect(r.freigabeSha256).toBe(sha(roh(FREIGABE_PFAD)));
      const e = sammeln({ wurzel: w, offline: true, fixture: fx, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS });
      const online = auswerten({ ...e, modus: "online", jetztUeberschrieben: false });
      expect([online.gesamt, online.exitCode]).toEqual(["GO", 0]);
      const datei_ = join(w, "fixture-ew.json");
      writeFileSync(datei_, JSON.stringify(fx));
      const cli = spawnSync(process.execPath, [WERKZEUG, "--offline", "--fixture", datei_, "--wurzel", w, "--release-id", "v4-r1", "--digest", D, "--jetzt", JETZT], { encoding: "utf8" });
      expect(cli.status, cli.stderr).toBe(3);
      expect(JSON.parse(cli.stdout).auflagen).toHaveLength(1);
    }, 60_000);

    it("T-P2: ohne Ausnahmefeld, mit echter Probe-Datei → G6 wie bisher; keine Auflage; g6Sicherung byte-gleich", () => {
      const r = pruefe();
      expect(gateVon(r, "G6").ergebnis).toBe("GO");
      expect(gateVon(r, "G6").belege.join(" ")).not.toMatch(/ERSTWECHSEL/);
      expect(r.auflagen).toEqual([]);
      const varianten = [NACHWEISE, { ...NACHWEISE, widerrufbuchProbe: null }, { ...NACHWEISE, sicherung: undefined }, undefined];
      for (const n of varianten) {
        const alt = g6Sicherung(n, JETZT_MS, KONFIG_STANDARD);
        const neu = g6Sicherung(n, JETZT_MS, KONFIG_STANDARD, { freigabe: FREIGABE, freigabeRoh: FREIGABE, releaseId: "v4-r1", rueckhalt: [] });
        expect(JSON.stringify(neu)).toBe(JSON.stringify(alt));
      }
    });
  });

  describe("negativ (je Bedingung E1–E15)", () => {
    it("T-N1: v4-r2 mit Ausnahme → NO-GO E1 (Wiederverwendung)", () => {
      erwarte(aufbauen({ ausnahme: { releaseId: "v4-r2" } }), "E1");
      const fx = aufbauen({ ausnahme: { releaseId: "v4-r2", quittung: QUITTUNG("v4-r2") }, freigabe: { releaseId: "v4-r2" } });
      datei("docs/acc45/releases/v4-r2.freigabe.json", JSON.parse(roh(FREIGABE_PFAD)));
      rmSync(join(w, FREIGABE_PFAD));
      const g = erwarte(fx, "E1", { releaseId: "v4-r2" });
      expect(g.gruende.join(" ")).toMatch(/v4-r2/);
    });
    it("T-N2: V4-R1, „v4-r1 “ und Unicode-Bindestrich → NO-GO E1 (exakt, ohne Normalisierung)", () => {
      for (const id of ["V4-R1", "v4-r1 ", "v4‐r1"]) erwarte(aufbauen({ ausnahme: { releaseId: id } }), "E1");
    });
    it("T-N3: Basis = M oder ein anderer Commit → NO-GO E2", () => {
      erwarte(aufbauen({ ausnahme: { basisCommit: M } }), "E2");
      const fx = aufbauen();
      fx.basisCommit = "9".repeat(40);
      erwarte(fx, "E2");
      erwarte(aufbauen({ freigabe: { basisCommit: "9".repeat(40) } }), "E2");
    });
    it("T-N4: zusätzliche Zeile mit V4-Commit (aktiv, vorherig, gesperrt) → NO-GO E4", () => {
      for (const status of ["aktiv", "vorherig", "gesperrt"]) {
        erwarte(aufbauen({ listeExtra: [zeileListe("sha256:" + "9".repeat(64), "9".repeat(40), status, "früherer V4-Start")] }), "E4");
      }
      const fx = aufbauen();
      datei("deploy/FREIGEGEBENE-IMAGES.md", liste([zeileListe(D, M, "aktiv", "Kandidat")])); // Basis fehlt als vorherig
      erwarte(fx, "E4");
    });
    it("T-N5: Basisbaum mit Widerrufbuch-Modul; M ohne Probe-Skript; nicht ermittelbar → NO-GO E3", () => {
      erwarte(mitEw(aufbauen(), (x) => { x.basisDateien["server/lib/widerrufbuch.mjs"] = true; }), "E3");
      erwarte(mitEw(aufbauen(), (x) => { x.kandidatDateien["deploy/sicherung/widerrufbuch-probe.sh"] = false; }), "E3");
      erwarte(mitEw(aufbauen(), (x) => { delete x.basisDateien["server/lib/kontowiderrufbuch.mjs"]; }), "E3");
      erwarte(mitEw(aufbauen(), (x) => { delete x.kandidatDateien; }), "E3");
    });
    it("T-N6: Commit-Bindung: 1 Elter, 2. Elter ≠ S, Baum(M) ≠ Baum(S), S kein Vorfahr; --kandidat = S bei Label M → NO-GO E13 (und G4)", () => {
      erwarte(mitEw(aufbauen(), (x) => { x.kandidatEltern = [x.kandidatEltern[0]]; }), "E13");
      erwarte(mitEw(aufbauen(), (x) => { x.kandidatEltern = [x.kandidatEltern[0], "9".repeat(40)]; }), "E13");
      erwarte(mitEw(aufbauen(), (x) => { x.kandidatEltern = [...x.kandidatEltern, "9".repeat(40)]; }), "E13");
      erwarte(mitEw(aufbauen(), (x) => { x.baeume.schnitt = "9".repeat(40); }), "E13");
      erwarte(mitEw(aufbauen(), (x) => { x.schnittIstVorfahr = false; }), "E13");
      erwarte(mitEw(aufbauen(), (x) => { delete x.baeume; }), "E13");
      const fx = mitEw(aufbauen(), (x) => { x.kandidatEltern = ["2".repeat(40)]; }); // Eltern von S
      fx.kandidatCommit = S;
      const r = pruefe(fx);
      expect(gateVon(r, "G6").gruende.some((x) => x.includes(" E13: "))).toBe(true);
      expect(gateVon(r, "G4").gruende.join(" ")).toMatch(/Revisionslabel .* ≠ Kandidat/);
    });
    it("T-N7: Staging-Nachweis fehlt, rot, anderer Digest/Commit/Baum, > 7 d, Zukunft, S5 fehlt, Hash falsch → NO-GO E6", () => {
      erwarte(aufbauen({ ohneNachweis: true }), "E6");
      for (const n of [{ ergebnis: "failure" }, { ergebnis: "ok" }, { digest: D_ALT }, { commit: S }, { baum: "9".repeat(40) },
        { erstellt: "2026-11-12T11:00:00Z" }, { erstellt: "2026-11-21T12:00:00Z" }, { lauf: "4242-2" }, { laufCommit: "9".repeat(40) }]) {
        erwarte(aufbauen({ nachweis: n }), "E6");
      }
      datei(SKRIPT, "#!/usr/bin/env bash\n# synthetisch (Test GATE-EW1)\n");
      const wb = (x) => ({ widerrufbuch: { ...STAGING().widerrufbuch, ...x } });
      erwarte(aufbauen({ nachweis: wb({ proben: { S1: "ok", S2: "ok", S3: "ok", S4: "ok", S6: "ok" } }) }), "E6");
      erwarte(aufbauen({ nachweis: wb({ proben: { S1: "ok", S2: "ok", S3: "ok", S4: "ok", S5: "fehler", S6: "ok" } }) }), "E6");
      erwarte(aufbauen({ nachweis: wb({ art: "staging-nachweis" }) }), "E6");
      erwarte(aufbauen({ nachweis: wb({ skriptSha256: "1".repeat(64) }) }), "E6");
      erwarte(aufbauen({ ausnahme: { staging: { lauf: "4242-1", nachweis: NACHWEIS, sha256: "1".repeat(64) } } }), "E6");
      erwarte(aufbauen({ ausnahme: { staging: { lauf: "4242-1", nachweis: "docs/acc45/releases/v4-r1/staging.json", sha256: "1".repeat(64) } } }), "E6");
      const g = erwarte(aufbauen(), "E6", { jetztMs: Date.parse("2026-11-26T12:00:01Z") }); // 7 d + 1 s nach erstellt
      expect(g.gruende.join(" ")).toMatch(/E6: .*zu alt/);
    });
    it("T-N8: Lauf-API: anderer Pfad, Ereignis, head_sha, conclusion, Versuch; Artefakt-Bytes anders; API weg → NO-GO E7", () => {
      for (const [k, v] of [["path", ".github/workflows/deploy.yml"], ["event", "push"], ["head_sha", "9".repeat(40)], ["conclusion", "failure"],
        ["status", "in_progress"], ["run_attempt", 2], ["id", 4243]]) {
        erwarte(mitEw(aufbauen(), (x) => { x.stagingLauf[k] = v; }), "E7");
      }
      erwarte(mitEw(aufbauen(), (x) => { x.stagingLauf.head_sha = M; }), "E7"); // ≠ laufCommit S des Nachweises
      erwarte(mitEw(aufbauen(), (x) => { x.stagingArtefakt = [Buffer.from("anders").toString("base64")]; }), "E7");
      erwarte(mitEw(aufbauen(), (x) => { x.stagingArtefakt = null; }), "E7");
      erwarte(mitEw(aufbauen(), (x) => { x.stagingLauf = null; }), "E7");
    });
    it("T-N9: Fristen 25/0/24.5, Repo-Frist 49, Abbruchliste ohne A-FRIST, mit Zusatz oder doppelt → NO-GO E8; \"24\" → Schemafehler", () => {
      for (const a of [{ nachholFristStunden: 25 }, { nachholFristStunden: 0 }, { nachholFristStunden: 24.5 }, { repoFristStunden: 49 },
        { abbruchBedingungen: C.abbruchBedingungen.filter((x) => x !== "A-FRIST") }, { abbruchBedingungen: [...C.abbruchBedingungen, "A-NEU"] },
        { abbruchBedingungen: [...C.abbruchBedingungen.filter((x) => x !== "A-FRIST"), "A-VOR"] }, { gueltigBis: "2027-01-31" },
        { nachholAblage: "docs/acc45/releases/v4-r1/" }]) {
        erwarte(aufbauen({ ausnahme: a }), "E8");
      }
      const r = pruefe(aufbauen({ ausnahme: { nachholFristStunden: "24" } }));
      expect(gateVon(r, "G10").gruende.join(" ")).toMatch(/erstwechselAusnahme/);
      expect(gateVon(r, "G6").gruende.join(" ")).toMatch(/Freigabedatei ungültig/);
    });
    it("T-N10: Quittung um ein Zeichen anders → E8; Platzhalter (<Name>, TODO, 0{40}) → E12", () => {
      erwarte(aufbauen({ ausnahme: { quittung: QUITTUNG().replace("24 h", "25 h") } }), "E8");
      erwarte(aufbauen({ ausnahme: { quittung: QUITTUNG().slice(0, -1) } }), "E8");
      erwarte(aufbauen({ ausnahme: { quittung: QUITTUNG() + " <Name>" } }), "E12");
      erwarte(aufbauen({ ausnahme: { quittung: "TODO" } }), "E12");
      erwarte(aufbauen({ ausnahme: { schnittCommit: "0".repeat(40) }, freigabe: { schnittCommit: "0".repeat(40) } }), "E12");
      erwarte(aufbauen({ ausnahme: { staging: { lauf: "4242-1", nachweis: "docs/acc45/releases/v4-r1/nachweise/beispiel.json", sha256: "1".repeat(64) } } }), "E12");
    });
    it("T-N11: jetzt nach gueltigBis → NO-GO E9; der letzte Tag gilt noch", () => {
      erwarte(aufbauen(), "E9", { jetztMs: Date.parse("2027-01-01T00:00:00Z") });
      const g = g6(aufbauen(), { jetztMs: Date.parse("2026-12-31T23:59:59Z") });
      expect(g.gruende.filter((x) => x.includes(" E9: "))).toEqual([]);
    });
    it("T-N12: Ausnahme und widerrufbuch-probe-status.json zugleich → NO-GO E10 (widersprüchlich)", () => {
      const fx = aufbauen();
      fx.nachweise.widerrufbuchProbe = NACHWEISE.widerrufbuchProbe;
      expect(erwarte(fx, "E10").gruende.join(" ")).toMatch(/widersprüchlich/);
      const fx2 = aufbauen();
      datei("docs/acc45/releases/v4-r1/nachweise/widerrufbuch-probe-status.json", NACHWEISE.widerrufbuchProbe);
      erwarte(fx2, "E10");
    });
    it("T-N13: Ausnahme gültig, Sicherung oder Restore-Probe fehlt → G6 NO-GO (E11 unverändert Pflicht)", () => {
      const fx = aufbauen();
      delete fx.nachweise.sicherung;
      expect(g6(fx).gruende).toEqual(["Sicherung außer Haus (letzte-erfolgreiche.json): Nachweis fehlt"]);
      const fx2 = aufbauen();
      fx2.nachweise.restoreProbe = { ...fx2.nachweise.restoreProbe, abweichend: 1 };
      expect(g6(fx2).ergebnis).toBe("NO-GO");
    });
    it("T-N14: unbekannter oder fehlender Schlüssel, schnittCommit fehlt → Freigabedatei ungültig (G10 NO-GO, G6 NO-GO)", () => {
      const faelle = [
        { ausnahme: { zusatz: 1 } }, { ausnahme: { staging: { lauf: "4242-1", nachweis: NACHWEIS, sha256: "1".repeat(64), x: 1 } } },
        { ausnahme: { quittung: undefined } }, { freigabe: { schnittCommit: undefined } }, { freigabe: { schnittCommit: "3333" } },
        { freigabe: { erstwechselAusnahme: { widerrufbuchProbe: {}, andere: {} } } }, { ausnahme: { abbruchBedingungen: "A-VOR" } },
        { ausnahme: { staging: { lauf: "x", nachweis: NACHWEIS, sha256: "1".repeat(64) } } },
      ];
      for (const fall of faelle) {
        const r = pruefe(aufbauen(fall));
        expect(gateVon(r, "G10").ergebnis, JSON.stringify(fall)).toBe("NO-GO");
        expect(gateVon(r, "G6").gruende.join(" "), JSON.stringify(fall)).toMatch(/Erstwechsel-Ausnahme: Freigabedatei ungültig/);
      }
      expect(freigabeSchema({ ...FREIGABE, schnittCommit: S })).toEqual([]);
      expect(freigabeSchema({ ...FREIGABE, nachholAbweichung: { releaseId: "v4-r1", grund: "x", mehr: 1 } }).join()).toMatch(/nachholAbweichung/);
    });
    it("T-N15: Vier-Augen: Regel fehlt, main ohne update, CODEOWNERS lückenhaft, Review vom Autor, kein Review, alter Kopf, API-Fehler → NO-GO E14", () => {
      const va = (f) => (x) => f(x.vierAugen);
      for (const f of [
        (v) => { v.regeln.main[0].parameters.require_code_owner_review = false; },
        (v) => { v.regeln["integration/release-v4"] = []; },
        (v) => { v.regeln.main = v.regeln.main.filter((r) => r.type !== "update"); },
        (v) => { delete v.regeln; },
        (v) => { v.prs["701"].autor = "rinats-png"; },
        (v) => { v.prs["700"].reviews = []; },
        (v) => { v.prs["700"].reviews[0].state = "COMMENTED"; },
        (v) => { v.prs["700"].reviews[0].autor = "maschinenkonto"; },
        (v) => { v.prs["701"].reviews[0].commit = "9".repeat(40); },
        (v) => { v.prs["701"].gemergt = false; },
        (v) => { v.freigabePr = null; },
        (v) => { delete v.paketPrs["GATE-EW2"]; },
        (v) => { v.paketPrs["GATE-EW1"] = []; },
        (v) => { v.fehler = ["GET rules/branches/main: 403"]; },
      ]) erwarte(mitEw(aufbauen(), va(f)), "E14");
      erwarte(mitEw(aufbauen(), (x) => { delete x.vierAugen; }), "E14");
      const fx = aufbauen();
      datei(".github/CODEOWNERS", C.codeOwnerPfade.slice(1).map((p) => `/${p} @rinats-png`).join("\n") + "\n");
      erwarte(fx, "E14");
      datei(".github/CODEOWNERS", C.codeOwnerPfade.map((p) => `/${p} @rinats-png`).join("\n") + "\n* @maschinenkonto\n");
      erwarte(fx, "E14");
      rmSync(join(w, ".github/CODEOWNERS"));
      erwarte(fx, "E14");
    });
    it("T-N16: t0.json oder abbruch-*.json in HEAD → NO-GO E15 (keine zweite Nutzung, F10)", () => {
      const fx = aufbauen();
      datei(ABLAGE + "t0.json", { releaseId: "v4-r1", digest: D, kandidat: M, t0: "2026-11-21T10:00:00Z" });
      erwarte(fx, "E15");
      rmSync(join(w, ABLAGE), { recursive: true });
      datei("docs/acc45/releases/v4-r1/abbruch-A-SICH.json", { id: "A-SICH" });
      expect(erwarte(fx, "E15").gruende.join(" ")).toMatch(/reguläre Probe Pflicht/);
    });
  });

  /* ------------------------------------------- F10 (Betreiberentscheidung 24.11.): Verbrauch erst ab V4-Start */
  describe("F10: Abbruch vor dem V4-Start (A-VOR) verbraucht die Ausnahme nicht; Start oder unklar ⇒ NO-GO", () => {
    const AVOR = "docs/acc45/releases/v4-r1/abbruch-A-VOR.json";
    const ALT = "c".repeat(40); // abgebrochener Kandidat (Codeursache ⇒ neuer Kandidat)
    const avor = (x = {}, z = {}) => ({ id: "A-VOR", releaseId: "v4-r1", kandidat: M, digest: D, zeit: "2026-11-19T20:00:00Z", deployExit: 1,
      startzustand: { zugangWiderrufe: "fehlt", kontoWiderrufe: "fehlt", v4Startzeilen: 0, protokollSha256: "4".repeat(64), ...z }, ...x });
    it("Abbruch vor Start nachweislich (gleicher Kandidat) ⇒ Ausnahme bleibt verfügbar (G6 GO)", () => {
      const fx = aufbauen();
      datei(AVOR, avor());
      const g = g6(fx);
      expect([g.ergebnis, g.gruende]).toEqual(["GO", []]);
    });
    it("Abbruch vor Start mit Codeursache ⇒ neuer Kandidat; alter steht gesperrt mit Grund A-VOR ⇒ GO, sonst E4", () => {
      const fx = aufbauen({ listeExtra: [zeileListe("sha256:" + "e".repeat(64), ALT, "gesperrt", "A-VOR Codeursache")] });
      datei(AVOR, avor({ kandidat: ALT }));
      expect(g6(fx).gruende).toEqual([]);
      const ohne = aufbauen();
      datei(AVOR, avor({ kandidat: ALT }));
      erwarte(ohne, "E4");
      const andererGrund = aufbauen({ listeExtra: [zeileListe("sha256:" + "e".repeat(64), ALT, "gesperrt", "Sicherheitsbefund")] });
      datei(AVOR, avor({ kandidat: ALT }));
      erwarte(andererGrund, "E4");
    });
    it("Start erfolgt (Buch vorhanden oder Startzeile) ⇒ verbraucht ⇒ zweite Nutzung NO-GO E15", () => {
      for (const z of [{ zugangWiderrufe: "vorhanden" }, { kontoWiderrufe: "vorhanden" }, { v4Startzeilen: 1 }]) {
        const fx = aufbauen();
        datei(AVOR, avor({}, z));
        expect(erwarte(fx, "E15").gruende.join(" ")).toMatch(/verbraucht/);
      }
    });
    it("Startzustand unklar oder Nachweis fehlerhaft ⇒ NO-GO E15 (fail-closed)", () => {
      for (const [x, z] of [[{}, { v4Startzeilen: "0" }], [{}, { zugangWiderrufe: "unbekannt" }], [{}, { protokollSha256: "kurz" }],
        [{ deployExit: 0 }, {}], [{ releaseId: "v4-r2" }, {}], [{ zeit: "2026-11-21T12:00:00Z" }, {}], [{ zusatz: 1 }, {}], [{ id: "A-START" }, {}]]) {
        const fx = aufbauen();
        datei(AVOR, avor(x, z));
        expect(erwarte(fx, "E15").gruende.join(" "), JSON.stringify([x, z])).toMatch(/unklar/);
      }
      const fx = aufbauen();
      datei(AVOR, "{ kaputt");
      erwarte(fx, "E15");
    });
    it("Verbrauch nicht durch Löschen oder Ändern der Nachweise umgehbar (Geschichte von HEAD)", () => {
      erwarte(mitEw(aufbauen(), (x) => { x.releaseHistorie = [ABLAGE + "t0.json", ABLAGE + "t0.json"]; }), "E15");          // t0.json gelöscht
      erwarte(mitEw(aufbauen(), (x) => { x.releaseHistorie = ["docs/acc45/releases/v4-r1/abbruch-A-BUCH.json"]; }), "E15");
      erwarte(mitEw(aufbauen(), (x) => { x.releaseHistorie = [AVOR]; }), "E15");                                              // A-VOR gelöscht
      const geaendert = mitEw(aufbauen(), (x) => { x.releaseHistorie = [AVOR, AVOR]; });
      datei(AVOR, avor());
      expect(erwarte(geaendert, "E15").gruende.join(" ")).toMatch(/nachträglich geändert/);
      erwarte(mitEw(aufbauen(), (x) => { delete x.releaseHistorie; x.releaseHistorie = null; }), "E15");                     // nicht ermittelbar
    });
    it("BL-2: früherer Kandidat (aus Freigabedatei- oder Listengeschichte) ohne A-VOR-Nachweis ⇒ Startzustand unklar ⇒ NO-GO E15", () => {
      erwarte(mitEw(aufbauen(), (x) => { x.fruehereKandidaten = [ALT]; }), "E15");
      const mitNachweis = mitEw(aufbauen({ listeExtra: [zeileListe("sha256:" + "e".repeat(64), ALT, "gesperrt", "A-VOR Codeursache")] }), (x) => { x.fruehereKandidaten = [ALT, M]; });
      datei(AVOR, avor({ kandidat: ALT }));
      expect(g6(mitNachweis).gruende).toEqual([]);
      const gestartet = mitEw(aufbauen(), (x) => { x.fruehereKandidaten = [ALT]; });
      datei(AVOR, avor({ kandidat: ALT }, { v4Startzeilen: 2 }));
      erwarte(gestartet, "E15");
      erwarte(mitEw(aufbauen(), (x) => { x.fruehereKandidaten = null; }), "E15"); // nicht ermittelbar
    });
    it("AU-4: Ausnahme-releaseId v4-r1 in einer v4-r2-Freigabe (R1) ⇒ E1; Digest der Ausnahme ≠ Aufruf (R5) ⇒ E5", () => {
      const fx = aufbauen({ freigabe: { releaseId: "v4-r2" } });
      datei("docs/acc45/releases/v4-r2.freigabe.json", JSON.parse(roh(FREIGABE_PFAD)));
      erwarte(fx, "E1", { releaseId: "v4-r2" });
      erwarte(aufbauen({ ausnahme: { digest: D_ALT } }), "E5");
    });
    it("A-VOR-Nachweis stört die Nachholprüfung nicht (Start danach mit demselben Release)", () => {
      const fx = nachholAnlegen();
      datei(AVOR, avor());
      expect(nachhol(fx).ergebnis).toBe("NACHHOL-GO");
    });
  });

  /* ------------------------------------------------------------------ Nachhol-Modus (GATE-EW2) */
  const T0 = "2026-11-21T10:00:00Z";
  const T0_MS = Date.parse(T0);
  const um = (stunden) => new Date(T0_MS + stunden * 3600_000).toISOString().replace(".000Z", "Z");
  const PROBE = (x = {}) => ({ art: "widerrufbuch-probe", zeit: um(4), ergebnis: "ok", schritt: "fertig", code: 0, snapshots: 3,
    neuester: "abcdef01", vergleich: "abcdef00", live_fehlend: 0, gegenprobe: "erkannt", gegenprobe_fehlend: 2,
    pruefsummen: `zugang-widerrufe.json=${"1".repeat(64)};konto-widerrufe.json=${"2".repeat(64)}`, dauer_s: 9, bild: D, ...x });
  /** Legt die Nachhol-Ablage an (Dateien wie N4) und liefert die Fixture; ohneDatei: Name, der fehlen soll. */
  function nachholAnlegen({ probe = {}, verifikation = {}, status = {}, t0 = {}, endpruefung = {}, ohneDatei = null, mergedAt } = {}) {
    const fx = aufbauen();
    rmSync(join(w, ABLAGE), { recursive: true, force: true });
    const schreib = (name, inhalt) => { if (name !== ohneDatei) datei(ABLAGE + name, inhalt); };
    schreib("t0.json", { releaseId: "v4-r1", digest: D, kandidat: M, t0: T0, ...t0 });
    schreib("widerrufbuch-status.json", { art: "widerrufbuch", zeit: um(3.3), ergebnis: "ok", code: 0, snapshots: 3, bild: D, ...status });
    schreib("widerrufbuch-probe-status.json", PROBE(probe));
    const probeRoh = ohneDatei === "widerrufbuch-probe-status.json" ? Buffer.from("") : roh(ABLAGE + "widerrufbuch-probe-status.json");
    schreib("verifikation.json", { sha256: sha(probeRoh), verifiziertAm: um(4.2), exit: 0, ...verifikation });
    schreib("endpruefung.json", { werkzeug: "release-pruefung", gesamt: "GO", exitCode: 0, modus: "online", uebersteuert: false,
      releaseId: "v4-r1", kandidat: M, digest: D, freigabeSha256: sha(roh(FREIGABE_PFAD)), zeitpunkt: um(-2), headCommit: "5".repeat(40),
      listeSha256: sha(roh("deploy/FREIGEGEBENE-IMAGES.md")), ...endpruefung });
    if (mergedAt) fx.nachhol["v4-r1"].mergedAt = mergedAt;
    return fx;
  }
  const nachhol = (fx) => nachholPruefen(nachholSammeln(w, "v4-r1", { offline: true, fixture: fx }));
  /** NACHHOL-NO-GO mit der Abbruch-ID id. */
  function nachholNein(fx, id) {
    const r = nachhol(fx);
    expect(r.ergebnis, id).toBe("NACHHOL-NO-GO");
    expect(r.abbruchIds, `${id} in ${r.gruende.join(" | ")}`).toContain(id);
    return r;
  }

  describe("Nachhol-Modus --nachhol (A.7)", () => {
    it("T-P3: gültige Nachholung → NACHHOL-GO; auch „nicht-aussagekraeftig“ mit gleichen Prüfsummen und S5 ok; 24-h-Grenze exakt", () => {
      expect(nachhol(nachholAnlegen())).toEqual({ ergebnis: "NACHHOL-GO", gruende: [], abbruchIds: [], verspaetet: false });
      const p = PROBE().pruefsummen;
      expect(nachhol(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig", gegenprobe_fehlend: 0 }, verifikation: { pruefsummenVergleich: p } })).ergebnis)
        .toBe("NACHHOL-GO");
      // Fristgrenze eingeschlossen (M7): Probe, Verifikation und Sicherungsstatus genau bei T0 + 24 h, Merge genau bei T0 + 48 h
      expect(nachhol(nachholAnlegen({ probe: { zeit: um(24) }, verifikation: { verifiziertAm: um(24) }, status: { zeit: um(24) },
        mergedAt: [um(48)] })).ergebnis).toBe("NACHHOL-GO");
    });
    it("T-N17: bild ≠ Digest, zeit > T0+24 h, snapshots 1, code 3, nicht-moeglich, F4 ohne Beleg, Verifikation spät, Merge > T0+48 h → NACHHOL-NO-GO mit Abbruch-ID", () => {
      nachholNein(nachholAnlegen({ probe: { bild: D_ALT } }), "A-BILD");
      nachholNein(nachholAnlegen({ probe: { zeit: um(24.01) }, verifikation: { verifiziertAm: um(24.02) } }), "A-FRIST");
      nachholNein(nachholAnlegen({ probe: { zeit: um(-0.5) } }), "A-FRIST");
      nachholNein(nachholAnlegen({ probe: { snapshots: 1 } }), "A-PROBE-W");
      nachholNein(nachholAnlegen({ probe: { code: 3, ergebnis: "ruecksprung" } }), "A-PROBE");
      nachholNein(nachholAnlegen({ probe: { live_fehlend: 2 } }), "A-PROBE");
      nachholNein(nachholAnlegen({ probe: { code: 4, ergebnis: "fehler" } }), "A-PROBE-W");
      nachholNein(nachholAnlegen({ probe: { gegenprobe: "nicht-moeglich" } }), "A-PROBE-W");
      nachholNein(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig" } }), "A-PROBE-W");
      nachholNein(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig" }, verifikation: { pruefsummenVergleich: "zugang-widerrufe.json=" + "3".repeat(64) } }), "A-PROBE-W");
      const s5 = nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig" }, verifikation: { pruefsummenVergleich: PROBE().pruefsummen } });
      datei(NACHWEIS, { ...STAGING(), widerrufbuch: { ...STAGING().widerrufbuch, proben: { ...STAGING().widerrufbuch.proben, S5: "fehler" } } });
      nachholNein(s5, "A-PROBE-W"); // S5 nicht bestanden (F4)
      nachholNein(nachholAnlegen({ verifikation: { verifiziertAm: um(24.5) } }), "A-FRIST");
      nachholNein(nachholAnlegen({ verifikation: { sha256: "1".repeat(64) } }), "A-FRIST");
      nachholNein(nachholAnlegen({ ohneDatei: "verifikation.json" }), "A-FRIST");
      nachholNein(nachholAnlegen({ ohneDatei: "widerrufbuch-probe-status.json" }), "A-FRIST");
      nachholNein(nachholAnlegen({ ohneDatei: "t0.json" }), "A-FRIST");
      nachholNein(nachholAnlegen({ t0: { digest: D_ALT } }), "A-BILD");
      nachholNein(nachholAnlegen({ status: { ergebnis: "fehler", code: 1 } }), "A-SICH");
      nachholNein(nachholAnlegen({ status: { zeit: um(30) } }), "A-SICH");
      const spaet = nachholNein(nachholAnlegen({ mergedAt: [um(1), um(48.1)] }), "A-REPO");
      expect(spaet.verspaetet).toBe(true);
      nachholNein(nachholAnlegen({ mergedAt: [] }), "A-REPO");
      nachholNein(nachholAnlegen({ endpruefung: { freigabeSha256: "1".repeat(64) } }), "A-FRIST");
      nachholNein(nachholAnlegen({ endpruefung: { exitCode: 3, modus: "offline-fixture" } }), "A-FRIST");
      const mitAbbruch = nachholAnlegen();
      datei("docs/acc45/releases/v4-r1/abbruch-A-BUCH.json", { id: "A-BUCH" });
      nachholNein(mitAbbruch, "A-BUCH");
    });
    it("Review #535 AU-2/AU-3/AU-4/AU-5 und Hinweise: T0 belegt, F4-Format, Ablage vollständig, A-START, Platzhalter, Stand der Endprüfung", () => {
      // AU-2: T0 ist durch den Merge von t0.json belegt (≤ T0 + 12 h) und die Endprüfung lag vor T0
      const spaetT0 = nachholAnlegen();
      spaetT0.nachhol["v4-r1"].t0MergedAt = um(12.1);
      nachholNein(spaetT0, "A-FRIST");
      const ohneT0Merge = nachholAnlegen();
      delete ohneT0Merge.nachhol["v4-r1"].t0MergedAt;
      nachholNein(ohneT0Merge, "A-FRIST");
      expect(nachhol(nachholAnlegen({ endpruefung: { zeitpunkt: um(0) } })).ergebnis).toBe("NACHHOL-GO");
      nachholNein(nachholAnlegen({ endpruefung: { zeitpunkt: um(0.01) } }), "A-FRIST");
      // AU-3: F4-Beleg nur im Format der Probe (beide Bücher, je 64 Hex)
      nachholNein(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig", pruefsummen: "x" }, verifikation: { pruefsummenVergleich: "x" } }), "A-PROBE-W");
      nachholNein(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig", pruefsummen: `zugang-widerrufe.json=${"1".repeat(64)}` },
        verifikation: { pruefsummenVergleich: `zugang-widerrufe.json=${"1".repeat(64)}` } }), "A-PROBE-W");
      // AU-4: fehlende endpruefung.json
      nachholNein(nachholAnlegen({ ohneDatei: "endpruefung.json" }), "A-FRIST");
      // AU-5: endgültiger Abbruch nach T0 (Abbruchdatei) ⇒ NACHHOL-NO-GO mit dieser ID; Neustart ohne Abbruchdatei bleibt GO
      const start = nachholAnlegen();
      datei("docs/acc45/releases/v4-r1/abbruch-A-START.json", { id: "A-START" });
      nachholNein(start, "A-START");
      rmSync(join(w, "docs/acc45/releases/v4-r1/abbruch-A-START.json"));
      // Hinweis A3: Platzhalter in Nachhol-Dateien
      nachholNein(nachholAnlegen({ probe: { schritt: "TODO" } }), "A-FRIST");
      nachholNein(nachholAnlegen({ t0: { kandidat: "0".repeat(40) } }), "A-FRIST");
      // L-2: Stand der Endprüfung: HEAD-Commit Vorfahr, SHA-256 der Liste an diesem Commit
      nachholNein(nachholAnlegen({ endpruefung: { listeSha256: "1".repeat(64) } }), "A-FRIST");
      const keinVorfahr = nachholAnlegen();
      keinVorfahr.nachhol["v4-r1"].endpruefungIstVorfahr = false;
      nachholNein(keinVorfahr, "A-FRIST");
      // Online: HEAD des lokalen Repos muss in origin/main liegen
      const d = nachholSammeln(w, "v4-r1", { offline: true, fixture: nachholAnlegen() });
      expect(nachholPruefen(d).ergebnis).toBe("NACHHOL-GO");
      expect(nachholPruefen({ ...d, online: true, headInMain: false }).abbruchIds).toContain("A-FRIST"); // H2: nicht A-REPO
      // Dateiliste des Release nicht ermittelbar (Git-Fehler) ⇒ fail-closed
      expect(nachholPruefen({ ...d, releaseDateien: null }).ergebnis).toBe("NACHHOL-NO-GO");
    });
    it("--nachhol CLI: nur mit --release-id; offline Exit 3 bei NACHHOL-GO, 1 bei NO-GO; Aufruffehler Exit 2", () => {
      const fx = nachholAnlegen();
      const datei_ = join(w, "fixture-nachhol.json");
      writeFileSync(datei_, JSON.stringify(fx));
      const lauf = (args) => spawnSync(process.execPath, [WERKZEUG, ...args], { encoding: "utf8" });
      const go = lauf(["--nachhol", "--release-id", "v4-r1", "--offline", "--fixture", datei_, "--wurzel", w]);
      expect(go.status, go.stderr).toBe(3);
      expect(JSON.parse(go.stdout)).toMatchObject({ ergebnis: "NACHHOL-GO", abbruchIds: [], modus: "offline-fixture", exitCode: 3 });
      rmSync(join(w, ABLAGE, "verifikation.json"));
      const nein = lauf(["--nachhol", "--release-id", "v4-r1", "--offline", "--fixture", datei_, "--wurzel", w]);
      expect(nein.status).toBe(1);
      expect(JSON.parse(nein.stdout).abbruchIds).toContain("A-FRIST");
      for (const args of [["--nachhol"], ["--nachhol", "--release-id", "v4-r1", "--kandidat", "HEAD"], ["--nachhol", "--release-id", "../x"],
        ["--nachhol", "--release-id", "v4-r1", "--jetzt", JETZT], ["--nachhol", "--release-id", "v4-r1", "--offline"],
        ["--nachhol", "--release-id", "v4-r1", "--digest", D]]) {
        expect(lauf(args).status, JSON.stringify(args)).toBe(2);
      }
    }, 60_000);
    it("--nachhol online liest nur aus HEAD (temporäres Git-Repo): Arbeitsbaum und Index unverändert", () => {
      const repo = mkdtempSync(join(tmpdir(), "ew-nachhol-"));
      try {
        const g = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
        g("init", "-q");
        mkdirSync(join(repo, "docs/acc45/releases/v4-r1/nachhol"), { recursive: true });
        writeFileSync(join(repo, "docs/acc45/releases/v4-r1.freigabe.json"), "{}\n");
        g("add", "-A"); g("commit", "-q", "-m", "Freigabe");
        writeFileSync(join(repo, "docs/acc45/releases/v4-r1/nachhol/t0.json"), "{}\n"); // nur Arbeitsstand, nie gelesen
        const stand = () => [g("--no-optional-locks", "status", "--porcelain").stdout, sha(readFileSync(join(repo, ".git/index")))];
        const vorher = stand();
        const r = spawnSync(process.execPath, [WERKZEUG, "--nachhol", "--release-id", "v4-r1", "--wurzel", repo], { encoding: "utf8" });
        expect(r.status, r.stderr).toBe(1);
        expect(JSON.parse(r.stdout).ergebnis).toBe("NACHHOL-NO-GO");
        expect(stand()).toEqual(vorher);
      } finally { rmSync(repo, { recursive: true, force: true }); }
    }, 60_000);
  });

  describe("Folge-Release-Rückhalt (A.7, SPEZ §3.3)", () => {
    const K2 = "9".repeat(40);
    /** Folge-Release v4-r2 mit Basis = M (Kandidat von v4-r1); G6 sonst GO (reguläre Probe vorhanden). */
    function folge(fx, freigabe = {}) {
      datei("docs/acc45/releases/v4-r2.freigabe.json", { ...FREIGABE, releaseId: "v4-r2", kandidatCommit: K2, basisCommit: M, ...freigabe });
      const fx2 = fixtureGo();
      fx2.kandidatCommit = K2;
      fx2.basisCommit = M;
      fx2.nachhol = fx.nachhol;
      return g6(fx2, { releaseId: "v4-r2" });
    }
    it("T-N16: Folge-Release ohne gültige Nachholung → G6 NO-GO „Ausnahme v4-r1 nicht abgeschlossen“", () => {
      const g = folge(aufbauen());
      expect(g.ergebnis).toBe("NO-GO");
      expect(g.gruende.join(" ")).toMatch(/Ausnahme v4-r1 nicht abgeschlossen/);
    });
    it("Folge-Release mit NACHHOL-GO → kein Rückhalt (Probe bleibt regulär Pflicht)", () => {
      const g = folge(nachholAnlegen());
      expect([g.ergebnis, g.gruende]).toEqual(["GO", []]);
      expect(g.belege.join(" ")).toMatch(/v4-r1 abgeschlossen \(NACHHOL-GO\)/);
    });
    it("W-REPO: nur A-REPO und nachholAbweichung im Folge-Release → Belegzeile; ohne Abweichung oder mit weiterem Abbruch → NO-GO", () => {
      const spaet = nachholAnlegen({ mergedAt: [um(50)] });
      expect(folge(spaet).ergebnis).toBe("NO-GO");
      const abw = { nachholAbweichung: { releaseId: "v4-r1", grund: "Nachweis 2 h zu spät gemergt (Vorfall)" } };
      const g = folge(spaet, abw);
      expect(g.ergebnis).toBe("GO");
      expect(g.belege.join(" ")).toMatch(/W-REPO/);
      // N31 (Delta-Review): die Abweichung gilt nur für genau diese Release-ID (Ablage vorher neu, nur A-REPO)
      expect(folge(nachholAnlegen({ mergedAt: [um(50)] }), { nachholAbweichung: { releaseId: "v4-r0", grund: "x" } }).ergebnis).toBe("NO-GO");
      expect(folge(nachholAnlegen({ mergedAt: [um(50)], probe: { bild: D_ALT } }), abw).ergebnis).toBe("NO-GO");
    });
    it("AU-1: Rückhalt hängt an der Release-ID der Konfiguration, nicht an gefundenen Dateien oder der Basis", () => {
      // A5: Basis ≠ M (z. B. ein Zwischenstand) — ohne NACHHOL-GO trotzdem NO-GO
      const fx = aufbauen();
      datei("docs/acc45/releases/v4-r2.freigabe.json", { ...FREIGABE, releaseId: "v4-r2", kandidatCommit: K2, basisCommit: B });
      const fx2 = fixtureGo();
      fx2.kandidatCommit = K2;
      fx2.nachhol = fx.nachhol;
      expect(g6(fx2, { releaseId: "v4-r2" }).gruende.join(" ")).toMatch(/Ausnahme v4-r1 nicht abgeschlossen/);
      // A4: Freigabedatei v4-r1 aus HEAD gelöscht ⇒ NO-GO; unlesbar ⇒ NO-GO
      rmSync(join(w, FREIGABE_PFAD));
      expect(g6(fx2, { releaseId: "v4-r2" }).gruende.join(" ")).toMatch(/v4-r1\.freigabe\.json .*fehlt/);
      datei(FREIGABE_PFAD, "{ kaputt");
      expect(g6(fx2, { releaseId: "v4-r2" }).gruende.join(" ")).toMatch(/v4-r1\.freigabe\.json/);
      // v4-r1 ohne Ausnahme freigegeben ⇒ kein Rückhalt
      datei(FREIGABE_PFAD, FREIGABE);
      expect(g6(fx2, { releaseId: "v4-r2" }).gruende).toEqual([]);
      // v4-r1 selbst: kein Rückhalt
      expect(g6(fixtureGo()).gruende).toEqual([]);
    });
  });

  describe("ZIP des Staging-Artefakts (E7, im Speicher) und Online-Pfad", () => {
    function zipBauen(eintraege) {
      const teile = []; const zentral = []; let ofs = 0;
      eintraege.forEach((e, i) => {
        const name = Buffer.from(e.name); const methode = i % 2 ? 8 : 0;
        const daten = methode ? deflateRawSync(e.daten) : e.daten;
        const l = Buffer.alloc(30);
        l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 6); l.writeUInt16LE(methode, 8); l.writeUInt16LE(name.length, 26);
        const z = Buffer.alloc(46);
        z.writeUInt32LE(0x02014b50, 0); z.writeUInt16LE(20, 6); z.writeUInt16LE(methode, 10); z.writeUInt32LE(daten.length, 20);
        z.writeUInt32LE(e.daten.length, 24); z.writeUInt16LE(name.length, 28); z.writeUInt32LE(ofs, 42);
        teile.push(l, name, daten); zentral.push(z, name); ofs += 30 + name.length + daten.length;
      });
      const zd = Buffer.concat(zentral); const ende = Buffer.alloc(22);
      ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(eintraege.length, 8); ende.writeUInt16LE(eintraege.length, 10);
      ende.writeUInt32LE(zd.length, 12); ende.writeUInt32LE(ofs, 16);
      return Buffer.concat([...teile, zd, ende]);
    }
    it("liest gespeicherte und komprimierte Einträge (Größen aus dem Zentralverzeichnis); kaputtes ZIP wirft", () => {
      const a = Buffer.from('{"digest":"x"}\n'); const b = Buffer.from("axe ".repeat(100));
      expect(zipEntpacken(zipBauen([{ name: "staging-nachweis/staging-nachweis.json", daten: a }, { name: "e2e/axe.json", daten: b }])))
        .toEqual([{ name: "staging-nachweis/staging-nachweis.json", daten: a }, { name: "e2e/axe.json", daten: b }]);
      expect(() => zipEntpacken(Buffer.from("kein zip"))).toThrow();
      // Entpack-Bombe: komprimiert klein, entpackt > 10 MB ⇒ Fehler (Review #535)
      expect(() => zipEntpacken(zipBauen([{ name: "a", daten: Buffer.from("") }, { name: "b", daten: Buffer.alloc(11 * 1024 * 1024) }]))).toThrow();
    });
    it("online: Git-Angaben (Eltern, Bäume, Dateien, Vorfahr) und gh-GET (Lauf, Artefakt, Regeln, PRs) werden gelesen (temporäres Git-Repo)", () => {
      const repo = mkdtempSync(join(tmpdir(), "ew-online-"));
      try {
        const g = (...args) => {
          const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], { cwd: repo, encoding: "utf8" });
          if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
          return r.stdout.trim();
        };
        const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt)); };
        g("init", "-q");
        schreib("server.mjs", "// Basis\n"); g("add", "-A"); g("commit", "-q", "-m", "Basis");
        const basis = g("rev-parse", "HEAD");
        g("checkout", "-q", "-b", "release/rc-test");
        for (const p of C.kandidatMitDateien) schreib(p, `// ${p}\n`);
        schreib(".github/CODEOWNERS", C.codeOwnerPfade.map((p) => `/${p} @rinats-png`).join("\n") + "\n");
        g("add", "-A"); g("commit", "-q", "-m", "Schnitt");
        const s = g("rev-parse", "HEAD");
        g("checkout", "-q", "main");
        g("merge", "-q", "--no-ff", "release/rc-test", "-m", "Merge pull request #690 from x/release/rc-test");
        const m = g("rev-parse", "HEAD");
        const nachweis = { ...STAGING(sha(readFileSync(join(repo, SKRIPT)))), commit: m, laufCommit: s, baum: g("rev-parse", `${m}^{tree}`) };
        schreib(NACHWEIS, nachweis);
        const nachweisRoh = readFileSync(join(repo, NACHWEIS));
        schreib(FREIGABE_PFAD, { ...FREIGABE, kandidatCommit: m, basisCommit: basis, schnittCommit: s, erstwechselAusnahme: { widerrufbuchProbe: {
          releaseId: "v4-r1", basisCommit: basis, kandidatCommit: m, schnittCommit: s, digest: D, nachholFristStunden: 24, repoFristStunden: 48,
          gueltigBis: "2026-12-31", staging: { lauf: "4242-1", nachweis: NACHWEIS, sha256: sha(nachweisRoh) }, abbruchBedingungen: [...C.abbruchBedingungen],
          nachholAblage: ABLAGE, quittung: "q" } } });
        g("add", "-A"); g("commit", "-q", "-m", "Freigabe und Nachweis");
        const freigabeCommit = g("rev-parse", "HEAD");
        const ZIP = zipBauen([{ name: "e2e/ergebnis.json", daten: Buffer.from("{}") }, { name: "staging-nachweis/staging-nachweis.json", daten: nachweisRoh }]);
        const R = "repos/rinats-png/dienstplaner/";
        const pr = (n, kopf) => ({ number: n, merged_at: "2026-11-20T00:00:00Z", base: { ref: "main" }, user: { login: "maschinenkonto" }, head: { sha: kopf } });
        const antworten = {
          [`${R}actions/runs/4242`]: { id: 4242, run_attempt: 1, path: ".github/workflows/staging-gate.yml", event: "workflow_dispatch", status: "completed", conclusion: "success", head_sha: s },
          [`${R}actions/runs/4242/artifacts?per_page=100`]: { artifacts: [{ id: 5, name: "staging-nachweis", expired: false }] },
          [`${R}rules/branches/main`]: [{ type: "pull_request", parameters: { require_code_owner_review: true } }, { type: "update" }],
          [`${R}rules/branches/integration%2Frelease-v4`]: [{ type: "pull_request", parameters: { require_code_owner_review: true } }],
          [`${R}commits/${freigabeCommit}/pulls`]: [pr(701, "8".repeat(40))],
          [`${R}pulls/701`]: pr(701, "8".repeat(40)),
          [`${R}pulls/701/reviews?per_page=100`]: [[{ state: "APPROVED", user: { login: "rinats-png" }, commit_id: "8".repeat(40) }]],
        };
        const gh = (pfad) => { if (pfad in antworten) return antworten[pfad]; throw new Error("kein Netz: " + pfad); };
        const ghRoh = (pfad) => { if (pfad === `${R}actions/artifacts/5/zip`) return ZIP; throw new Error("kein Netz: " + pfad); };
        const e = sammeln({ wurzel: repo, offline: false, kandidatSha: m, basisSha: basis, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS, gh, ghRoh });
        const x = e.erstwechsel;
        expect(x.kandidatEltern).toEqual([basis, s]);
        expect(x.baeume.kandidat).toBe(x.baeume.schnitt);
        expect(x.schnittIstVorfahr).toBe(true);
        expect(Object.values(x.basisDateien)).toEqual([false, false]);
        expect(Object.values(x.kandidatDateien).every((v) => v === true)).toBe(true);
        expect(x.stagingArtefakt.some((b) => Buffer.from(b).equals(nachweisRoh))).toBe(true);
        expect(x.vierAugen.freigabePr).toBe(701);
        expect(x.vierAugen.prs[701]).toMatchObject({ autor: "maschinenkonto", gemergt: true, kopf: "8".repeat(40) });
        const gruende = gateVon(auswerten(e), "G6").gruende.join(" | ");
        for (const id of ["E3", "E6", "E7", "E13"]) expect(gruende, id).not.toMatch(new RegExp(` ${id}: `));
        expect(gruende).toMatch(/ E2: /);            // Basis des Test-Repos ist nicht 274bfa0
        expect(gruende).toMatch(/ E14: .*GATE-EW1/); // SSOT ohne GATE-EW1 → fail-closed
      } finally { rmSync(repo, { recursive: true, force: true }); }
    }, 120_000);

    it("Review #535 BL-1/BL-2/R34 online: Merge lässt t0.json fallen oder setzt abbruch-A-VOR zurück; frühere Freigabe-Kandidaten; fremder Artefaktname", () => {
      const repo = mkdtempSync(join(tmpdir(), "ew-merge-"));
      try {
        const g = (...args) => {
          const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], { cwd: repo, encoding: "utf8" });
          if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
          return r.stdout.trim();
        };
        const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt)); };
        const commit = (msg) => { g("add", "-A"); g("commit", "-q", "-m", msg); return g("rev-parse", "HEAD"); };
        const AVOR = "docs/acc45/releases/v4-r1/abbruch-A-VOR.json";
        const avor = (startzeilen) => ({ id: "A-VOR", releaseId: "v4-r1", kandidat: "c".repeat(40), digest: D, zeit: "2026-11-19T20:00:00Z", deployExit: 1,
          startzustand: { zugangWiderrufe: "fehlt", kontoWiderrufe: "fehlt", v4Startzeilen: startzeilen, protokollSha256: "4".repeat(64) } });
        g("init", "-q");
        schreib("server.mjs", "// Basis\n"); const basis = commit("Basis");
        g("checkout", "-q", "-b", "rc");
        for (const p of C.kandidatMitDateien) schreib(p, `// ${p}\n`);
        const s = commit("Schnitt");
        g("checkout", "-q", "main");
        g("merge", "-q", "--no-ff", "rc", "-m", "Merge rc");
        const m = g("rev-parse", "HEAD");
        const fr = (kandidat) => ({ ...FREIGABE, kandidatCommit: kandidat, basisCommit: basis, schnittCommit: s, erstwechselAusnahme: { widerrufbuchProbe: {
          releaseId: "v4-r1", basisCommit: basis, kandidatCommit: kandidat, schnittCommit: s, digest: D, nachholFristStunden: 24, repoFristStunden: 48,
          gueltigBis: "2026-12-31", staging: { lauf: "4242-1", nachweis: NACHWEIS, sha256: "1".repeat(64) }, abbruchBedingungen: [...C.abbruchBedingungen],
          nachholAblage: ABLAGE, quittung: "q" } } });
        schreib(FREIGABE_PFAD, fr(s)); commit("Freigabe: erster Kandidat S (BL-2)");
        schreib(FREIGABE_PFAD, fr(m)); schreib(AVOR, avor(0)); commit("Freigabe: Kandidat M, A-VOR-Nachweis");
        g("checkout", "-q", "-b", "alt");
        schreib("anderes.txt", "x\n"); commit("älterer Zweig");
        g("checkout", "-q", "main");
        schreib(ABLAGE + "t0.json", { releaseId: "v4-r1" }); schreib(AVOR, avor(3)); commit("T0 und Start im A-VOR-Nachweis");
        g("merge", "-q", "--no-ff", "--no-commit", "alt");
        g("rm", "-q", ABLAGE + "t0.json");
        g("checkout", "alt", "--", AVOR);
        commit("Merge alt: t0.json fällt weg, A-VOR auf altem Stand");
        expect(existsSync(join(repo, ABLAGE + "t0.json"))).toBe(false);
        const R = "repos/rinats-png/dienstplaner/";
        const gh = (pfad) => {
          if (pfad === `${R}actions/runs/4242`) return { id: 4242, run_attempt: 1 };
          if (pfad === `${R}actions/runs/4242/artifacts?per_page=100`) return { artifacts: [{ id: 5, name: "staging-nachweis-alt", expired: false }] };
          throw new Error("kein Netz: " + pfad);
        };
        const ghRoh = () => zipBauen([{ name: "x.json", daten: Buffer.from("{}") }]);
        const e = sammeln({ wurzel: repo, offline: false, kandidatSha: m, basisSha: basis, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS, gh, ghRoh });
        const x = e.erstwechsel;
        expect(x.releaseHistorie).toContain(ABLAGE + "t0.json");
        expect(x.releaseHistorie.filter((p) => p === AVOR).length).toBeGreaterThan(1);
        expect(x.fruehereKandidaten).toEqual(expect.arrayContaining([s, m]));
        expect(x.stagingArtefakt).toBe(null); // R34: nur das Artefakt staging-nachweis zählt
        const gruende = gateVon(auswerten(e), "G6").gruende.join(" | ");
        expect(gruende).toMatch(/ E15: .*nachhol\/t0\.json: V4-Start erfolgt/);
        expect(gruende).toMatch(/ E15: .*abbruch-A-VOR\.json wurde nachträglich geändert/);
        expect(gruende).toMatch(new RegExp(` E15: .*früherer Kandidat ${s.slice(0, 12)}`));
      } finally { rmSync(repo, { recursive: true, force: true }); }
    }, 120_000);
  });

  /* ------------------------------------------- Delta-Review #535 Runde 2: BL-3, AU-6, AU-7, H1–H3, Angriffe B1–B10 */
  describe("Delta-Review #535 Runde 2", () => {
    const ALT = "c".repeat(40);
    const AVOR = "docs/acc45/releases/v4-r1/abbruch-A-VOR.json";
    const R = "repos/rinats-png/dienstplaner/";
    function repoBauen() {
      const repo = mkdtempSync(join(tmpdir(), "rev535b-"));
      const g = (...args) => {
        const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], { cwd: repo, encoding: "utf8" });
        if (r.status !== 0) throw new Error(args.join(" ") + ": " + r.stderr);
        return r.stdout.trim();
      };
      const schreib = (rel, inhalt) => { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt)); };
      const commit = (msg) => { g("add", "-A"); g("commit", "-q", "-m", msg); return g("rev-parse", "HEAD"); };
      g("init", "-q");
      schreib("server.mjs", "// Basis\n"); const basis = commit("Basis");
      g("checkout", "-q", "-b", "rc");
      for (const p of C.kandidatMitDateien) schreib(p, `// ${p}\n`);
      const s = commit("Schnitt");
      g("checkout", "-q", "main");
      g("merge", "-q", "--no-ff", "rc", "-m", "Merge rc");
      const m = g("rev-parse", "HEAD");
      const fr = (kandidat) => ({ ...FREIGABE, kandidatCommit: kandidat, basisCommit: basis, schnittCommit: s, erstwechselAusnahme: { widerrufbuchProbe: {
        releaseId: "v4-r1", basisCommit: basis, kandidatCommit: kandidat, schnittCommit: s, digest: D, nachholFristStunden: 24, repoFristStunden: 48,
        gueltigBis: "2026-12-31", staging: { lauf: "4242-1", nachweis: NACHWEIS, sha256: "1".repeat(64) }, abbruchBedingungen: [...C.abbruchBedingungen],
        nachholAblage: ABLAGE, quittung: "q" } } });
      const gh = (pfad) => { throw new Error("kein Netz: " + pfad); };
      const lauf = (opt = {}) => {
        const e = sammeln({ wurzel: repo, offline: false, kandidatSha: m, basisSha: basis, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS, gh, ghRoh: gh, ...opt });
        return { e, e15: gateVon(auswerten(e), "G6").gruende.filter((x) => / E15: /.test(x)).join(" | ") };
      };
      return { repo, g, schreib, commit, basis, s, m, fr, lauf };
    }
    const weg = (r) => rmSync(r.repo, { recursive: true, force: true });

    it("BL-3: die ECHTE Ausgabe der Endprüfung (auswerten) als endpruefung.json ⇒ NACHHOL-GO; Bindungsfelder bleiben streng", () => {
      const fx = nachholAnlegen();
      fx.headCommit = "5".repeat(40);
      const e = sammeln({ wurzel: w, offline: true, fixture: fx, releaseId: "v4-r1", digest: D, jetztMs: JETZT_MS });
      rmSync(join(w, ABLAGE), { recursive: true, force: true }); // Endprüfung lag vor T0: ohne Ablage
      const echt = auswerten({ ...e, modus: "online", jetztUeberschrieben: false, releaseDateien: (e.releaseDateien || []).filter((p) => !p.includes("/nachhol/")) });
      expect([echt.gesamt, echt.exitCode]).toEqual(["GO", 0]);
      expect(JSON.stringify(echt.konfiguration)).toMatch(/beispiel/); // enthält immer Beispiel-Pfade der Konfiguration
      const fx2 = nachholAnlegen();
      datei(ABLAGE + "endpruefung.json", echt);
      expect(nachhol(fx2)).toEqual({ ergebnis: "NACHHOL-GO", gruende: [], abbruchIds: [], verspaetet: false });
      datei(ABLAGE + "endpruefung.json", { ...echt, headCommit: "0".repeat(40) });
      nachholNein(fx2, "A-FRIST");
    });
    it("BL-3: Formate der echten Skripte (widerrufbuch-probe.sh, widerrufbuch-sicherung.sh: alle printf-Felder) ⇒ NACHHOL-GO", () => {
      const fx = nachholAnlegen({
        probe: { schritt: "fertig", neuester: "a1".repeat(32), vergleich: "b2".repeat(32), dauer_s: 41 },
        status: { schritt: "fertig", host: "centric-prod", letzte_erfolgreiche: um(3.3), snapshot_id: "c3".repeat(32), buecher: 2,
          eintraege_codes: 3, eintraege_konten: 1, fehlend: 0, nachweis: "", dauer_s: 12 },
      });
      expect(nachhol(fx).ergebnis).toBe("NACHHOL-GO");
    });
    it("AU-6: Ausnahme aus v4-r1.freigabe.json entfernt, Spuren (Nachhol-Ablage, frühere Fassung) ⇒ v4-r2 G6 NO-GO (B7 umgedreht)", () => {
      const fx = nachholAnlegen({ probe: { ergebnis: "fehler" } });
      const f = JSON.parse(roh(FREIGABE_PFAD)); delete f.erstwechselAusnahme; delete f.schnittCommit; datei(FREIGABE_PFAD, f);
      datei("docs/acc45/releases/v4-r2.freigabe.json", { ...FREIGABE, releaseId: "v4-r2", kandidatCommit: "9".repeat(40), basisCommit: M });
      const fx2 = fixtureGo(); fx2.kandidatCommit = "9".repeat(40); fx2.basisCommit = M; fx2.nachhol = kopie(fx.nachhol);
      expect(g6(fx2, { releaseId: "v4-r2" }).gruende.join(" ")).toMatch(/v4-r1\.freigabe\.json .*Spuren/);
      rmSync(join(w, ABLAGE), { recursive: true, force: true });                     // ohne Ablage in HEAD …
      fx2.nachhol["v4-r1"].fruehereAusnahme = true;                                   // … aber eine frühere Fassung trug die Ausnahme
      expect(g6(fx2, { releaseId: "v4-r2" }).ergebnis).toBe("NO-GO");
      fx2.nachhol["v4-r1"].fruehereAusnahme = false;
      fx2.nachhol["v4-r1"].historie = ["docs/acc45/releases/v4-r1/abbruch-A-SICH.json"]; // gelöschte Abbruchdatei
      expect(g6(fx2, { releaseId: "v4-r2" }).ergebnis).toBe("NO-GO");
      fx2.nachhol["v4-r1"].historie = [];
      expect(g6(fx2, { releaseId: "v4-r2" }).gruende).toEqual([]);                   // nie Ausnahme, keine Spur ⇒ kein Rückhalt
      delete fx2.nachhol["v4-r1"].fruehereAusnahme;                                   // nicht ermittelbar ⇒ NO-GO
      expect(g6(fx2, { releaseId: "v4-r2" }).ergebnis).toBe("NO-GO");
    });
    it("AU-6 online: frühere Fassung von v4-r1.freigabe.json mit Ausnahme, HEAD ohne ⇒ Rückhalt NO-GO", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe mit Ausnahme");
        r.schreib(FREIGABE_PFAD, FREIGABE); r.commit("Ausnahme entfernt");
        r.schreib("docs/acc45/releases/v4-r2.freigabe.json", { ...FREIGABE, releaseId: "v4-r2" }); r.commit("v4-r2");
        const e = sammeln({ wurzel: r.repo, offline: false, kandidatSha: r.m, basisSha: r.basis, releaseId: "v4-r2", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz"); } });
        expect(gateVon(auswerten(e), "G6").gruende.join(" ")).toMatch(/v4-r1\.freigabe\.json .*Spuren/);
      } finally { weg(r); }
    }, 120_000);
    it("H1: ZIP mit vielen Einträgen auf dieselben Daten oder Summe über der Grenze ⇒ Fehler; Größe aus dem Zentralverzeichnis (N27)", () => {
      const roh10 = Buffer.alloc(10 * 1024 * 1024); const komp = deflateRawSync(roh10); const name = Buffer.from("a");
      const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(8, 8); lokal.writeUInt16LE(1, 26);
      const lok = Buffer.concat([lokal, name, komp]);
      const bombe = (n) => {
        const zentral = [];
        for (let i = 0; i < n; i++) { const z = Buffer.alloc(46); z.writeUInt32LE(0x02014b50, 0); z.writeUInt16LE(8, 10); z.writeUInt32LE(komp.length, 20); z.writeUInt16LE(1, 28); zentral.push(Buffer.concat([z, name])); }
        const zd = Buffer.concat(zentral); const ende = Buffer.alloc(22);
        ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(n, 8); ende.writeUInt16LE(n, 10); ende.writeUInt32LE(zd.length, 12); ende.writeUInt32LE(lok.length, 16);
        return Buffer.concat([lok, zd, ende]);
      };
      expect(zipEntpacken(bombe(2))).toHaveLength(2);       // 20 MB: unter der Summengrenze
      expect(() => zipEntpacken(bombe(20))).toThrow(/Summe|Einträge/);
      expect(() => zipEntpacken(bombe(1001))).toThrow(/Einträge/);
      // gespeicherter Eintrag (Methode 0) > 10 MB laut Zentralverzeichnis ⇒ Fehler
      const gross = Buffer.alloc(30); gross.writeUInt32LE(0x04034b50, 0); gross.writeUInt16LE(1, 26);
      const z = Buffer.alloc(46); z.writeUInt32LE(0x02014b50, 0); z.writeUInt32LE(11 * 1024 * 1024, 20); z.writeUInt16LE(1, 28);
      const e2 = Buffer.alloc(22); e2.writeUInt32LE(0x06054b50, 0); e2.writeUInt16LE(1, 8); e2.writeUInt16LE(1, 10); e2.writeUInt32LE(47, 12); e2.writeUInt32LE(31, 16);
      expect(() => zipEntpacken(Buffer.concat([gross, name, z, name, e2]))).toThrow(/zu groß/);
    });
    it("H2/H3: HEAD nicht in origin/main ⇒ A-FRIST (nicht A-REPO); Endprüfung höchstens 24 h vor T0", () => {
      const d = nachholSammeln(w, "v4-r1", { offline: true, fixture: nachholAnlegen() });
      const r = nachholPruefen({ ...d, online: true, headInMain: false });
      expect(r.abbruchIds).toEqual(["A-FRIST"]);
      expect(nachhol(nachholAnlegen({ endpruefung: { zeitpunkt: um(-24) } })).ergebnis).toBe("NACHHOL-GO");
      nachholNein(nachholAnlegen({ endpruefung: { zeitpunkt: um(-24.01) } }), "A-FRIST");
      nachholNein(nachholAnlegen({ endpruefung: { zeitpunkt: um(-240) } }), "A-FRIST");
      expect(C.endpruefungVorT0MaxStunden).toBe(24);
    });
    it("N23: Dateiliste bei Git-Fehler ⇒ null (fail-closed); N20: origin ≠ GitHub-Repo ⇒ headInMain false", () => {
      const leer = mkdtempSync(join(tmpdir(), "ew-leer-"));
      try {
        spawnSync("git", ["init", "-q"], { cwd: leer });
        expect(nachholSammeln(leer, "v4-r1").releaseDateien).toBe(null); // kein HEAD
      } finally { rmSync(leer, { recursive: true, force: true }); }
      const r = repoBauen();
      const fern = mkdtempSync(join(tmpdir(), "ew-fern-"));
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe");
        spawnSync("git", ["init", "-q", "--bare", fern]);
        r.g("remote", "add", "origin", fern); r.g("push", "-q", "origin", "HEAD:refs/heads/main");
        const d = nachholSammeln(r.repo, "v4-r1", { gh: () => { throw new Error("kein Netz"); } });
        expect(d.headInMain).toBe(false); // HEAD liegt in main, aber origin ist nicht rinats-png/dienstplaner
      } finally { weg(r); rmSync(fern, { recursive: true, force: true }); }
    }, 120_000);
    it("N15: T0-Merge vom ältesten Einführen von t0.json (nicht vom jüngsten)", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe");
        r.schreib(ABLAGE + "t0.json", { t0: T0 }); const erst = r.commit("t0 erstmals");
        r.g("rm", "-q", ABLAGE + "t0.json"); r.commit("t0 weg");
        r.schreib(ABLAGE + "t0.json", { t0: T0 }); const spaet = r.commit("t0 erneut");
        const pr = (n, wann) => [{ number: n, merged_at: wann, base: { ref: "main" } }];
        const gh = (pfad) => {
          if (pfad === `${R}commits/${erst}/pulls`) return pr(1, um(1));
          if (pfad === `${R}commits/${spaet}/pulls`) return pr(2, um(30));
          throw new Error("kein Netz: " + pfad);
        };
        expect(nachholSammeln(r.repo, "v4-r1", { gh }).t0MergedAt).toBe(um(1));
      } finally { weg(r); }
    }, 120_000);
    it("N2: Merge setzt die Freigabedatei auf einen älteren Stand zurück — frühere Kandidaten bleiben sichtbar (--full-history)", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe M");
        r.g("checkout", "-q", "-b", "alt"); r.schreib("x.txt", "x"); r.commit("alt");
        r.g("checkout", "-q", "main");
        const m1 = "d".repeat(40);
        r.schreib(FREIGABE_PFAD, r.fr(m1)); r.commit("Freigabe M1 (gestartet)");
        r.g("merge", "-q", "--no-ff", "--no-commit", "alt");
        r.g("checkout", "alt", "--", FREIGABE_PFAD); r.commit("Merge: Freigabe zurück auf M");
        const { e, e15 } = r.lauf();
        expect(e.erstwechsel.fruehereKandidaten).toContain(m1);
        expect(e15).toMatch(new RegExp(`früherer Kandidat ${m1.slice(0, 12)}`));
      } finally { weg(r); }
    }, 120_000);
    it("B1 BL-1: t0.json nur auf Seitenzweig, Merge -s ours (nie im Baum von main) ⇒ E15 verbraucht", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe");
        r.g("checkout", "-q", "-b", "nachhol");
        r.schreib(ABLAGE + "widerrufbuch-probe-status.json", { x: 1 }); r.schreib(ABLAGE + "t0.json", { t0: "x" }); r.commit("Nachhol");
        r.g("checkout", "-q", "main");
        r.g("merge", "-q", "-s", "ours", "nachhol", "-m", "Merge ours");
        expect(existsSync(join(r.repo, ABLAGE + "t0.json"))).toBe(false);
        const { e, e15 } = r.lauf();
        expect(e.erstwechsel.releaseHistorie).toContain(ABLAGE + "t0.json");
        expect(e15).toMatch(/nachhol\/t0\.json: V4-Start erfolgt/);
        expect(e15).toMatch(/nachhol\/widerrufbuch-probe-status\.json: V4-Start erfolgt/);
      } finally { weg(r); }
    }, 120_000);
    it("B2 BL-1: abbruch-A-START.json per Merge entfernt ⇒ E15", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe");
        r.g("checkout", "-q", "-b", "x");
        r.schreib("docs/acc45/releases/v4-r1/abbruch-A-START.json", { id: "A-START" }); r.commit("Abbruch");
        r.g("checkout", "-q", "main");
        r.g("merge", "-q", "--no-ff", "--no-commit", "x");
        r.g("rm", "-q", "-f", "docs/acc45/releases/v4-r1/abbruch-A-START.json");
        r.commit("Merge ohne Datei");
        expect(r.lauf().e15).toMatch(/abbruch-A-START\.json: V4-Start erfolgt/);
      } finally { weg(r); }
    }, 120_000);
    it("B3/N6 BL-2: frühere aktiv-Zeile nur in der Listengeschichte (ALT); Freigabe M1 → M ⇒ E15 nennt beide, nicht M", () => {
      const r = repoBauen();
      try {
        r.schreib("deploy/FREIGEGEBENE-IMAGES.md", liste([zeileListe("sha256:" + "e".repeat(64), ALT, "aktiv", "x")])); r.commit("Liste ALT aktiv");
        r.schreib("deploy/FREIGEGEBENE-IMAGES.md", liste([zeileListe(D, r.m, "aktiv", "Kandidat")])); r.commit("Zeile ALT entfernt");
        const m1 = "d".repeat(40);
        r.schreib(FREIGABE_PFAD, r.fr(m1)); r.commit("Freigabe M1");
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe M2 = M");
        const { e, e15 } = r.lauf();
        expect(e.erstwechsel.fruehereKandidaten).toEqual(expect.arrayContaining([ALT, m1, r.m]));
        expect(e15).toMatch(new RegExp(`früherer Kandidat ${ALT.slice(0, 12)}`));
        expect(e15).toMatch(new RegExp(`früherer Kandidat ${m1.slice(0, 12)}`));
        expect(e15).not.toMatch(new RegExp(`früherer Kandidat ${r.m.slice(0, 12)}`));
      } finally { weg(r); }
    }, 120_000);
    it("B4/N8 BL-2: frühere Fassung der Freigabedatei unlesbar ⇒ fail-closed", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, "{ kaputt"); r.commit("kaputt");
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Freigabe");
        expect(r.lauf().e15).toMatch(/frühere Kandidaten .* nicht ermittelbar/);
      } finally { weg(r); }
    }, 120_000);
    it("B5 offline: Fixture ohne fruehereKandidaten oder releaseHistorie ⇒ E15 (fail-closed)", () => {
      erwarte(mitEw(aufbauen(), (x) => { delete x.fruehereKandidaten; }), "E15");
      erwarte(mitEw(aufbauen(), (x) => { delete x.releaseHistorie; }), "E15");
    });
    it("B6 AU-1: Freigabedatei v4-r1 umbenannt ⇒ v4-r2 NO-GO", () => {
      const fx = aufbauen();
      datei("docs/acc45/releases/v4-r1-alt.freigabe.json", JSON.parse(roh(FREIGABE_PFAD)));
      rmSync(join(w, FREIGABE_PFAD));
      datei("docs/acc45/releases/v4-r2.freigabe.json", { ...FREIGABE, releaseId: "v4-r2", kandidatCommit: "9".repeat(40), basisCommit: "8".repeat(40) });
      const fx2 = fixtureGo(); fx2.kandidatCommit = "9".repeat(40); fx2.basisCommit = "8".repeat(40); fx2.nachhol = fx.nachhol;
      expect(g6(fx2, { releaseId: "v4-r2" }).ergebnis).toBe("NO-GO");
    });
    it("B8/N17 AU-3: Varianten des Prüfsummen-Belegs (Großbuchstaben, Leerzeichen, Reihenfolge, Zusatz) ⇒ A-PROBE-W", () => {
      const z = "1".repeat(64), k = "2".repeat(64);
      for (const ps of [`zugang-widerrufe.json=${z.toUpperCase().replaceAll("1", "A")};konto-widerrufe.json=${k}`, `zugang-widerrufe.json=${z};konto-widerrufe.json=${k} `,
        `zugang-widerrufe.json=${z};konto-widerrufe.json=${k}\n`, `konto-widerrufe.json=${k};zugang-widerrufe.json=${z}`, `zugang-widerrufe.json=${z};konto-widerrufe.json=${k};`,
        ` zugang-widerrufe.json=${z};konto-widerrufe.json=${k}`, `zugang-widerrufe.json=${z}; konto-widerrufe.json=${k}`]) {
        nachholNein(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig", pruefsummen: ps }, verifikation: { pruefsummenVergleich: ps } }), "A-PROBE-W");
      }
      const ok = `zugang-widerrufe.json=${z};konto-widerrufe.json=${k}`;
      expect(nachhol(nachholAnlegen({ probe: { gegenprobe: "nicht-aussagekraeftig", pruefsummen: ok }, verifikation: { pruefsummenVergleich: ok } })).abbruchIds).not.toContain("A-PROBE-W");
    });
    it("B9/N13 AU-2: merged_at von t0.json vor T0 oder ungültig ⇒ A-FRIST; Grenze T0 + 12 h gilt", () => {
      const vor = nachholAnlegen(); vor.nachhol["v4-r1"].t0MergedAt = um(-0.01); nachholNein(vor, "A-FRIST");
      const kaputt = nachholAnlegen(); kaputt.nachhol["v4-r1"].t0MergedAt = "gestern"; nachholNein(kaputt, "A-FRIST");
      const grenze = nachholAnlegen(); grenze.nachhol["v4-r1"].t0MergedAt = um(12); expect(nachhol(grenze).ergebnis).toBe("NACHHOL-GO");
    });
    it("B10: __proto__ in t0.json und endpruefung.json ⇒ A-FRIST", () => {
      const fx = nachholAnlegen();
      writeFileSync(join(w, ABLAGE + "t0.json"), `{"__proto__":{"releaseId":"v4-r1","digest":"${D}","kandidat":"${M}","t0":"${T0}"}}`);
      nachholNein(fx, "A-FRIST");
      const fx2 = nachholAnlegen();
      const ep = JSON.parse(roh(ABLAGE + "endpruefung.json"));
      writeFileSync(join(w, ABLAGE + "endpruefung.json"), JSON.stringify({ ...ep, gesamt: undefined }).replace("{", '{"__proto__":{"gesamt":"GO"},'));
      nachholNein(fx2, "A-FRIST");
    });

    /* ---------------------------------------- Delta-Review #535 Runde 3: AF-1 flacher Klon, AF-2 fehlendes Objekt */
    const v4r2 = (r) => { r.schreib("docs/acc45/releases/v4-r2.freigabe.json", { ...FREIGABE, releaseId: "v4-r2" }); r.commit("v4-r2"); };
    const g6r2 = (wurzel, r) => {
      const e = sammeln({ wurzel, offline: false, kandidatSha: r.m, basisSha: r.basis, releaseId: "v4-r2", digest: D, jetztMs: JETZT_MS, gh: () => { throw new Error("kein Netz"); } });
      return gateVon(auswerten(e), "G6").gruende.filter((x) => /v4-r1/.test(x)).join(" | ");
    };
    const flachKlonen = (r) => {
      const flach = mkdtempSync(join(tmpdir(), "ew-flach-"));
      rmSync(flach, { recursive: true, force: true });
      const k = spawnSync("git", ["clone", "-q", "--depth", "1", "file://" + r.repo.replace(/\\/g, "/"), flach], { encoding: "utf8" });
      if (k.status !== 0) throw new Error(k.stderr);
      return flach;
    };
    it("Runde 3 A2/A3: ohne Spur kein Rückhalt-Grund; Fassung mit Ausnahme nur im Seitenzweig (merge -s ours) oder umbenannt ⇒ Spur", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, FREIGABE); r.commit("v4-r1 ohne Ausnahme"); v4r2(r);
        expect(g6r2(r.repo, r)).toBe("");
        r.g("checkout", "-q", "-b", "seite");
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("Seite: Ausnahme");
        r.g("checkout", "-q", "main"); r.g("merge", "-q", "-s", "ours", "seite", "-m", "ours");
        expect(g6r2(r.repo, r)).toMatch(/Spuren/);
      } finally { weg(r); }
      const r2 = repoBauen();
      try {
        r2.schreib(FREIGABE_PFAD, r2.fr(r2.m)); r2.commit("mit Ausnahme");
        r2.g("mv", FREIGABE_PFAD, "docs/acc45/releases/v4-r1.alt.json"); r2.commit("umbenannt");
        r2.schreib(FREIGABE_PFAD, FREIGABE); r2.commit("neu ohne"); v4r2(r2);
        expect(g6r2(r2.repo, r2)).toMatch(/Spuren/);
      } finally { weg(r2); }
    }, 180_000);
    it("AF-1: flacher Klon (--depth 1) ⇒ Rückhalt, E15 und --nachhol NO-GO mit FLACHER-KLON (fail-closed)", () => {
      const r = repoBauen();
      let flach = null;
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("mit Ausnahme");
        r.schreib(FREIGABE_PFAD, FREIGABE); r.commit("ohne"); v4r2(r);
        flach = flachKlonen(r);
        expect(g6r2(flach, r)).toMatch(/FLACHER-KLON/);
        rmSync(flach, { recursive: true, force: true });
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); r.commit("wieder mit Ausnahme");
        flach = flachKlonen(r);
        const { e15 } = r.lauf({ wurzel: flach });
        expect(e15).toMatch(/FLACHER-KLON/);
        const d = nachholSammeln(flach, "v4-r1", { gh: () => { throw new Error("kein Netz"); } });
        expect(d.flach).toBe(true);
        expect(nachholPruefen(d).gruende.join(" ")).toMatch(/FLACHER-KLON/);
        expect(nachholSammeln(r.repo, "v4-r1", { gh: () => { throw new Error("kein Netz"); } }).flach).toBe(false);
      } finally { weg(r); if (flach) rmSync(flach, { recursive: true, force: true }); }
    }, 180_000);
    it("AF-2: fehlendes Objekt einer früheren Fassung ist keine Löschung ⇒ nicht ermittelbar ⇒ NO-GO (Rückhalt und E15)", () => {
      const r = repoBauen();
      try {
        r.schreib(FREIGABE_PFAD, r.fr(r.m)); const c1 = r.commit("mit Ausnahme");
        const blob = r.g("rev-parse", `${c1}:${FREIGABE_PFAD}`);
        r.schreib(FREIGABE_PFAD, FREIGABE); r.commit("ohne"); v4r2(r);
        rmSync(join(r.repo, ".git/objects", blob.slice(0, 2), blob.slice(2)), { force: true });
        expect(g6r2(r.repo, r)).toMatch(/nicht ermittelbar/);
      } finally { weg(r); }
      const r2 = repoBauen();
      try {
        const m1 = "d".repeat(40);
        r2.schreib(FREIGABE_PFAD, r2.fr(m1)); const c1 = r2.commit("Freigabe M1");
        const blob = r2.g("rev-parse", `${c1}:${FREIGABE_PFAD}`);
        r2.schreib(FREIGABE_PFAD, r2.fr(r2.m)); r2.commit("Freigabe M");
        rmSync(join(r2.repo, ".git/objects", blob.slice(0, 2), blob.slice(2)), { force: true });
        expect(r2.lauf().e15).toMatch(/frühere Kandidaten .* nicht ermittelbar/);
        // eine spätere echte Löschung heilt das fehlende Objekt nicht
        r2.g("rm", "-q", FREIGABE_PFAD); r2.commit("gelöscht");
        r2.schreib(FREIGABE_PFAD, r2.fr(r2.m)); r2.commit("wieder da");
        expect(r2.lauf().e15).toMatch(/frühere Kandidaten .* nicht ermittelbar/); // fehlendes Objekt bleibt in der Geschichte
      } finally { weg(r2); }
      const r3 = repoBauen();
      try {
        r3.schreib(FREIGABE_PFAD, r3.fr(r3.m)); r3.commit("Freigabe M");
        r3.g("rm", "-q", FREIGABE_PFAD); r3.commit("gelöscht");
        r3.schreib(FREIGABE_PFAD, r3.fr(r3.m)); r3.commit("wieder da");
        expect(r3.lauf().e15).not.toMatch(/nicht ermittelbar/); // Löschungs-Commit ist kein Lesefehler
      } finally { weg(r3); }
    }, 240_000);
  });
});
