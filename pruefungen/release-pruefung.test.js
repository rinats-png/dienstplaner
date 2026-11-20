// REL-1: werkzeug/release-pruefung.mjs — Gates G1 bis G10, offline mit Fixture.
// Feste Uhr: Jede Prüfung bekommt `jetztMs` aus einer festen ISO-Zeit; das Werkzeug liest die Uhr dann nicht.
// Kein Netz: Offline-Modus, alle Git- und GitHub-Angaben kommen aus der Fixture.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  KONFIG_STANDARD, auswerten, sammeln, freigabelisteLesen, g1Ci, g2Review, g3Schalter, g4Bild, g5Migration,
  g6Sicherung, g7Rueckweg, g8Blocker, g9Befunde, g10Freigabe, migrationsbericht, reviewNachweiseLesen,
  schalterFinden, vorlageLesen, istAktiv, bildAngabenLesen, prsAusLog, basisAusListe, argumenteLesen, ssotReviewBelege,
} from "../werkzeug/release-pruefung.mjs";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WERKZEUG = join(WURZEL, "werkzeug", "release-pruefung.mjs");
const JETZT = "2026-11-20T12:00:00Z";
const JETZT_MS = Date.parse(JETZT);
const K = "a".repeat(40); // Kandidat
const B = "b".repeat(40); // voriger Release (Basis)
const D = "sha256:" + "c".repeat(64);
const D_ALT = "sha256:" + "d".repeat(64);
const PFLICHT = KONFIG_STANDARD.pflichtChecks;

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
  id: i + 1, name, status: "completed", conclusion: "success", head_sha: K, started_at: "2026-11-20T10:00:00Z", ...(ueber[name] || {}),
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
] };

const NACHWEISE = {
  sicherung: { zeit: "2026-11-20T03:00:00Z", dateien: 10, bytes: 100, snapshot_id: "x" },
  restoreProbe: { art: "wiederherstellungsprobe", zeit: "2026-11-10T03:00:00Z", ergebnis: "ok", abweichend: 0, fehlend: 0 },
  widerrufbuchProbe: { art: "widerrufbuch-probe", zeit: "2026-11-10T04:00:00Z", ergebnis: "ok" },
};

const fixtureGo = () => ({
  kandidatCommit: K,
  checkRuns: checks(),
  prsImKandidaten: [10, 11],
  prs: { 11: { autor: "a", body: "", reviews: [{ state: "APPROVED", autor: "b" }] } },
  geaenderteDateien: ["server/lib/widerrufbuch.mjs", "server.mjs", "src/App.jsx"],
  neueDateien: [],
  bildInfo: { digest: D, revision: K, provenienzRevision: K },
  nachweise: NACHWEISE,
  freigabeCommitet: true,
});

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
  it("positiv: alle Gates GO, gesamt GO", () => {
    const r = pruefe();
    expect(r.gates.map((g) => [g.id, g.ergebnis, g.gruende])).toEqual(r.gates.map((g) => [g.id, "GO", []]));
    expect(r.gesamt).toBe("GO");
    expect(r.nogo).toEqual([]);
    expect(r.basis).toBe(B);
    expect(r.paket.prs).toEqual([10, 11]);
    expect(r.migrationsbericht.betroffen).toEqual(["W-4"]);
    expect(r.konfiguration.pflichtChecks).toEqual(PFLICHT);
  });

  it("fail-closed: leere Fixture ergibt NO-GO in jedem Gate außer G3/G9", () => {
    const r = pruefe({});
    expect(r.gesamt).toBe("NO-GO");
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
});

describe("G1 CI", () => {
  it("fehlender Pflicht-Check → NO-GO", () => {
    const g = g1Ci(checks().filter((c) => c.name !== "bild-scan"), K, KONFIG_STANDARD);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/bild-scan/);
  });
  it("laufender, fehlgeschlagener oder übersprungener Pflicht-Check → NO-GO", () => {
    for (const ueber of [{ status: "in_progress", conclusion: null }, { conclusion: "failure" }, { conclusion: "skipped" }]) {
      expect(g1Ci(checks({ pruefen: ueber }), K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    }
  });
  it("Check eines anderen Commits → NO-GO; keine Check-Runs → NO-GO", () => {
    expect(g1Ci(checks({ muster: { head_sha: B } }), K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    expect(g1Ci([], K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    expect(g1Ci(null, K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
  it("Wiederholungslauf: der jüngste Lauf je Name zählt", () => {
    const alt = { id: 1, name: "pruefen", status: "completed", conclusion: "failure", head_sha: K, started_at: "2026-11-20T09:00:00Z" };
    expect(g1Ci([...checks(), alt], K, KONFIG_STANDARD).ergebnis).toBe("GO");
    const neu = { ...alt, id: 99, started_at: "2026-11-20T11:00:00Z" };
    expect(g1Ci([...checks(), neu], K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
  it("fehlgeschlagener Nicht-Pflicht-Check → NO-GO", () => {
    const x = { id: 50, name: "extra", status: "completed", conclusion: "cancelled", head_sha: K };
    expect(g1Ci([...checks(), x], K, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
});

describe("G2 Review", () => {
  it("Tabellenurteil: MERGEBAR und „erledigt“ belegen, „MIT AUFLAGEN“ am Ende nicht", () => {
    const b = reviewNachweiseLesen([{ datei: "x.md", text: [
      "| #1 | Opus | 2 Runden → MERGEBAR | gemergt |",
      "| #2 | Opus | MIT AUFLAGEN → erledigt | offen |",
      "| #3 | Opus | MIT AUFLAGEN | offen |",
      "| #4 | Opus | 2 Runden (MIT AUFLAGEN, MIT AUFLAGEN) | offen |",
    ].join("\n") }]);
    expect([...b.keys()]).toEqual([1, 2]);
  });
  it("Selbst-Review des Autors zählt nicht; ohne Beleg manuelle Bestätigung und NO-GO", () => {
    const g = g2Review([7], { 7: { autor: "a", body: "", reviews: [{ state: "APPROVED", autor: "a" }] } }, new Map(), null);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.manuell).toEqual(["#7"]);
  });
  it("PR-Text mit Review-Urteil und Betreiberbestätigung belegen", () => {
    expect(g2Review([7], { 7: { body: "Unabhängiges Review (Opus): MERGEBAR" } }, new Map(), null).ergebnis).toBe("GO");
    expect(g2Review([7], {}, new Map(), { reviewBestaetigt: [7] }).ergebnis).toBe("GO");
  });
  it("SSOT-Paket mit Stufe reviewt = true belegt seine PRs; reviewt = false oder teilweise nicht", () => {
    const ssot = { pakete: [
      { id: "A", pr: ["#5"], stufen: { reviewt: { wert: true, beleg: "Opus-Review" } } },
      { id: "B", pr: ["#6"], stufen: { reviewt: { wert: "teilweise", beleg: "x" } } },
      { id: "C", pr: ["#7"], stufen: { reviewt: { wert: false, beleg: null } } },
    ] };
    const b = ssotReviewBelege(ssot);
    expect([...b.keys()]).toEqual([5]);
    const g = g2Review([5, 6, 7], {}, new Map(), null, b);
    expect(g.manuell).toEqual(["#6", "#7"]);
    expect(ssotReviewBelege(null).size).toBe(0);
  });
  it("ohne PR-Liste NO-GO; im Gesamtlauf erscheinen offene PRs unter manuelleBestaetigungen", () => {
    expect(g2Review(undefined, {}, new Map(), null).ergebnis).toBe("NO-GO");
    const fx = fixtureGo();
    fx.prsImKandidaten = [10, 11, 12];
    const r = pruefe(fx);
    expect(r.manuelleBestaetigungen).toEqual(["G2: #12"]);
    expect(r.gesamt).toBe("NO-GO");
  });
});

describe("G3 Schalter und unfertige Funktionen", () => {
  const unfertig = JSON.parse(readFileSync(join(WURZEL, "docs/acc45/RELEASE-UNFERTIG.json"), "utf8"));
  const vorlage = (text, art = "env") => [{ pfad: "v", art, pflicht: true, text }];
  const schalter = ["CENTRIC_DEMO", "CENTRIC_IMPORT_AKTIV"];
  const qt = { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = false;" };

  it("Schalter aus schalter.mjs und === \"true\" im Server werden gefunden", () => {
    const s = schalterFinden([readFileSync(join(WURZEL, "server/lib/schalter.mjs"), "utf8")], ['process.env.CENTRIC_X === "true"', 'process.env.CENTRIC_Y === "1"']);
    expect(s).toEqual(expect.arrayContaining(["CENTRIC_DEMO", "CENTRIC_IMPORT_AKTIV", "CENTRIC_TEILSPEICHERUNG", "CENTRIC_HILFE_ASSISTENT", "CENTRIC_X"]));
    expect(s).not.toContain("CENTRIC_Y");
  });
  it("auskommentiert oder Platzhalter ist aus; gesetzt ist an", () => {
    expect(istAktiv("<OPTIONAL>")).toBe(false);
    expect(istAktiv("aus")).toBe(false);
    expect(istAktiv("true")).toBe(true);
    expect(istAktiv("vorschau", ["an"])).toBe(false);
    expect(istAktiv("an", ["an"])).toBe(true);
    expect(vorlageLesen("# CENTRIC_DEMO=true\nCENTRIC_IMPORT_AKTIV=true # Kommentar\n", "env")).toEqual(new Map([["CENTRIC_IMPORT_AKTIV", "true"]]));
    expect(vorlageLesen("ENV A=1 \\\n    CENTRIC_DEMO=true\n", "dockerfile").get("CENTRIC_DEMO")).toBe("true");
    expect(vorlageLesen("    environment:\n      CENTRIC_DEMO: \"true\"\n      # CENTRIC_IMPORT_AKTIV: true\n", "compose")).toEqual(new Map([["CENTRIC_DEMO", "true"]]));
  });
  it("aktiver Schalter in einer Vorlage → NO-GO", () => {
    const g = g3Schalter({ schalter, vorlagen: vorlage("CENTRIC_DEMO=true\n"), unfertig, quelltexte: qt }, KONFIG_STANDARD);
    expect(g.ergebnis).toBe("NO-GO");
    expect(g.gruende.join()).toMatch(/CENTRIC_DEMO/);
  });
  it("unfertige Funktion aktiv (Push-Schlüssel, Schichtmodell-Pflege, Datenschutzlauf an) → NO-GO", () => {
    for (const t of ["VAPID_PRIVATE=echterwert\n", "CENTRIC_SCHICHTMODELL_PFLEGE=true\n", "CENTRIC_DATENSCHUTZLAUF=an\n"]) {
      expect(g3Schalter({ schalter, vorlagen: vorlage(t), unfertig, quelltexte: qt }, KONFIG_STANDARD).ergebnis, t).toBe("NO-GO");
    }
    expect(g3Schalter({ schalter, vorlagen: vorlage("CENTRIC_DATENSCHUTZLAUF=vorschau\nVAPID_PRIVATE=<OPTIONAL>\n"), unfertig, quelltexte: qt }, KONFIG_STANDARD).ergebnis).toBe("GO");
  });
  it("Oberflächenkonstante IMPORT_DATEI_AKTIV = true → NO-GO; Pflichtvorlage fehlt → NO-GO; Liste fehlt → NO-GO", () => {
    expect(g3Schalter({ schalter, vorlagen: vorlage(""), unfertig, quelltexte: { "src/lib/import-schnittstelle.js": "export const IMPORT_DATEI_AKTIV = true;" } }, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    expect(g3Schalter({ schalter, vorlagen: vorlage(null), unfertig, quelltexte: qt }, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    expect(g3Schalter({ schalter, vorlagen: vorlage(""), unfertig: null, quelltexte: qt }, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
    expect(g3Schalter({ schalter: [], vorlagen: vorlage(""), unfertig, quelltexte: qt }, KONFIG_STANDARD).ergebnis).toBe("NO-GO");
  });
  it("Repository-Stand: alle echten Release-Vorlagen bestehen G3", () => {
    const e = sammeln({ wurzel: WURZEL, offline: true, fixture: {}, jetztMs: JETZT_MS });
    const g = g3Schalter({ schalter: schalterFinden(e.schalterQuellTexte, e.schalterSuchTexte), vorlagen: e.vorlagen, unfertig: e.unfertig, quelltexte: e.quelltexte }, KONFIG_STANDARD);
    expect(g.gruende).toEqual([]);
    expect(g.ergebnis).toBe("GO");
  });
});

describe("G4 Bild und Freigabeliste", () => {
  const l = freigabelisteLesen(LISTE_OK);
  const bild = (x = {}) => bildAngabenLesen({ digest: D, revision: K, provenienzRevision: K, ...x });
  it("Repository-Liste ist nach den Regeln gültig", () => {
    expect(freigabelisteLesen(readFileSync(join(WURZEL, "deploy/FREIGEGEBENE-IMAGES.md"), "utf8")).fehler).toEqual([]);
  });
  it("roh (imagetools-ähnlich): Label und Provenienz werden tief gefunden", () => {
    const b = bildAngabenLesen({ manifest: { digest: D }, image: { config: { Labels: { "org.opencontainers.image.revision": K } } },
      provenance: { SLSA: { runDetails: { metadata: { "https://mobyproject.org/buildkit@v1#metadata": { vcs: { revision: K } } } } } } });
    expect(b).toEqual({ digest: D, labels: [K], provenienz: [K] });
  });
  it("kurzer Digest, fehlendes Label, falsche Provenienz, fehlende Bildangaben → NO-GO", () => {
    const fall = (x) => g4Bild({ digest: D, kandidat: K, bild: bild(), liste: l, berichtVorhanden: true, ...x }, KONFIG_STANDARD).ergebnis;
    expect(fall({})).toBe("GO");
    expect(fall({ digest: "sha256:cccc" })).toBe("NO-GO");
    expect(fall({ bild: bildAngabenLesen({ digest: D, provenienzRevision: K }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ provenienzRevision: B }) })).toBe("NO-GO");
    expect(fall({ bild: bild({ revision: B }) })).toBe("NO-GO");
    expect(fall({ bild: null })).toBe("NO-GO");
    expect(fall({ berichtVorhanden: false })).toBe("NO-GO");
  });
  it("Digest nicht gelistet, nur vorherig, oder gesperrt (auch fest eingebaut) → NO-GO", () => {
    const fall = (text, digest = D) => g4Bild({ digest, kandidat: K, bild: bild({ digest }), liste: freigabelisteLesen(text), berichtVorhanden: true }, KONFIG_STANDARD);
    expect(fall(liste([zeileListe(D_ALT, B, "aktiv")])).ergebnis).toBe("NO-GO");
    expect(fall(liste([zeileListe(D, K, "vorherig")])).ergebnis).toBe("NO-GO");
    const p0 = "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79";
    const g = fall(liste([zeileListe(p0, K, "aktiv")]), p0);
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
  it("Freigabe für falsche Basis oder unvollständig → NO-GO; vollständig → GO", () => {
    const b = bericht(["server/lib/kontowiderrufbuch.mjs", "server.mjs"]);
    const f = (m) => ({ migration: { freigegeben: true, basisCommit: B, abgedeckt: ["W-5", "STARTBLOCK"], bericht: "x.md", ...m } });
    expect(g5Migration(b, f({})).ergebnis).toBe("GO");
    expect(g5Migration(b, f({ basisCommit: K })).ergebnis).toBe("NO-GO");
    expect(g5Migration(b, f({ abgedeckt: ["W-5"] })).ergebnis).toBe("NO-GO");
    expect(g5Migration(b, f({ bericht: "" })).ergebnis).toBe("NO-GO");
  });
  it("neue Quelle und Migrationsdatei werden erkannt; ohne Diff NO-GO", () => {
    const b = bericht(["server/lib/migration-x.mjs", "server/lib/aufraeumen.mjs"], ["server/lib/aufraeumen.mjs"]);
    expect(b.betroffen).toEqual(["W-7"]);
    expect(b.verdaechtigeDateien).toEqual(["server/lib/migration-x.mjs"]);
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
    expect(fall({ ...NACHWEISE, sicherung: { zeit: "2026-11-18T03:00:00Z" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, zeit: "2026-09-01T00:00:00Z" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, sicherung: { zeit: "2026-11-21T03:00:00Z" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, widerrufbuchProbe: null }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, ergebnis: "fehler" } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, restoreProbe: { ...NACHWEISE.restoreProbe, fehlend: 2 } }).ergebnis).toBe("NO-GO");
    expect(fall({ ...NACHWEISE, sicherung: { zeit: "kaputt" } }).ergebnis).toBe("NO-GO");
    expect(fall(undefined).ergebnis).toBe("NO-GO");
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
  it("G9: offene P0/P1-Befunde (Strang folge, ABN-*, V4-*) → NO-GO", () => {
    const g = g9Befunde(ssot, KONFIG_STANDARD);
    expect(g.gruende.map((x) => x.split(" ")[0])).toEqual(["V4-2b", "ABN-S2"]);
    expect(g9Befunde({ pakete: [ssot.pakete[4]] }, KONFIG_STANDARD).ergebnis).toBe("GO");
  });
});

describe("G10 Freigabe", () => {
  const fall = (f, x = {}) => g10Freigabe({ releaseId: "v4-r1", freigabe: f, commitet: true, kandidat: K, digest: D, ...x });
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
  it("Gesamtlauf: nicht commitet oder Datei ungültig → NO-GO", () => {
    const fx = fixtureGo();
    fx.freigabeCommitet = false;
    expect(gateVon(pruefe(fx), "G10").ergebnis).toBe("NO-GO");
    datei("docs/acc45/releases/v4-r1.freigabe.json", "{ kaputt");
    expect(gateVon(pruefe(), "G10").gruende.join()).toMatch(/kein gültiges JSON/);
  });
});

describe("Hilfen und Aufruf", () => {
  it("PR-Nummern aus dem Log", () => {
    expect(prsAusLog("Merge pull request #416 from x\n\nFix (#12)\nMerge pull request #3 from y\nText #99 ohne Klammer")).toEqual([3, 12, 416]);
  });
  it("Basis aus der Liste: aktiv, sonst vorherig, nie der Kandidat", () => {
    expect(basisAusListe(LISTE_OK, K)).toBe(B);
    expect(basisAusListe(liste([zeileListe(D_ALT, B, "aktiv")]), K)).toBe(B);
    expect(basisAusListe(liste([zeileListe(D, K, "aktiv")]), K)).toBe(null);
  });
  it("unbekannte Option und fehlender Wert werden abgelehnt", () => {
    expect(() => argumenteLesen(["--gibtsnicht"])).toThrow(/unbekannte Option/);
    expect(() => argumenteLesen(["--digest"])).toThrow(/braucht einen Wert/);
    expect(argumenteLesen(["--release-id", "x1y", "--offline"])).toEqual({ releaseId: "x1y", offline: true });
  });
  it("CLI: Exit 0 bei GO, 1 bei NO-GO, 2 bei Aufruffehler; JSON auf stdout", () => {
    const fx = join(w, "fixture.json");
    writeFileSync(fx, JSON.stringify(fixtureGo()));
    const lauf = (args) => spawnSync(process.execPath, [WERKZEUG, ...args], { encoding: "utf8" });
    const basis = ["--offline", "--fixture", fx, "--wurzel", w, "--release-id", "v4-r1", "--digest", D, "--jetzt", JETZT];
    const go = lauf(basis);
    expect(go.status, go.stderr).toBe(0);
    expect(JSON.parse(go.stdout).gesamt).toBe("GO");
    const nogo = lauf([...basis.slice(0, -2), "--jetzt", "2027-06-01T00:00:00Z"]);
    expect(nogo.status).toBe(1);
    expect(JSON.parse(nogo.stdout).nogo).toContain("G6");
    expect(lauf(["--offline"]).status).toBe(2);
    expect(lauf(["--jetzt", "x", "--kandidat", "HEAD"]).status).toBe(2);
  });
});
