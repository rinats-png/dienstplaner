/* ==========================================================================
   Geheimnis-Werkzeug: Freigaben (FREIGABEN) – Datei × Regel, optional × Commit

   Anlass: Commit b8e67edd (früher Test-Commit von PR #447, Zweig
   acc45/release/rel-0-installer) fügte in pruefungen/inventur-install.test.js
   nur die PEM-Kopfzeile als Testtext ein, kein Schlüsselmaterial. Der Verlauf
   darf nicht umgeschrieben werden (kein Force-Push); der Scan über
   `git log -p --all` meldete deshalb auf JEDEM Zweig einen Fund.

   Die Ausnahme ist eng: genau dieser Commit (40-stellig), genau diese Datei,
   genau die PEM-Regel. Mutationen (anderer Commit, andere Datei, andere Regel)
   bleiben Funde. Einträge ohne `commit` verhalten sich wie bisher.

   Testwerte sind synthetisch; die PEM-Kopfzeile wird zusammengesetzt, damit
   diese Datei selbst keinen Fund erzeugt.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { Readable } from "node:stream";
import { FREIGABEN, fundeSammeln, freigabeFuer } from "../werkzeug/sicherheit/geheimnisse.mjs";
/* Neue Exporte über den Namensraum: auf altem Stand schlagen nur die neuen
   Tests fehl, nicht die Regressionstests (Nachweis „rot vorher“). */
import * as G from "../werkzeug/sicherheit/geheimnisse.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "b8e67eddfe1ee371d897d01da9288d89df0a7e56";
const ANDERER_SHA = "07d4601eedd13f9f916f74ee0d17c15df0d35caf";
const DATEI = "pruefungen/inventur-install.test.js";
const PEM = "privater Schlüssel (PEM)";
const PEM_ZEILE = ["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ");
/* synthetischer Wert für die Regel „Anthropic/OpenAI-Schlüssel“ (kein Platzhalterwort) */
const API_WERT = "sk-" + "Qz7".repeat(12);

/** baut `git log -p`-artige Zeilen: [[sha, datei, [hinzugefügte Zeilen]], …]
    (Hunk-Kopf mit der echten Zeilenzahl, wie git ihn schreibt) */
function log(eintraege) {
  const z = [];
  for (const [sha, datei, zeilen] of eintraege) {
    z.push(`@@COMMIT ${sha}`, "", `diff --git a/${datei} b/${datei}`, `--- a/${datei}`, `+++ b/${datei}`, `@@ -0,0 +1,${zeilen.length} @@`);
    for (const t of zeilen) z.push("+" + t);
  }
  return z;
}

async function scan(eintraege, freigaben = FREIGABEN) {
  return fundeSammeln(log(eintraege), { freigaben });
}

describe("Geheimnis-Werkzeug: Freigabe für Commit b8e67edd ist eng", () => {
  it("Eintrag existiert mit vollständigem SHA, genau dieser Datei, genau der PEM-Regel und Grund", () => {
    const e = FREIGABEN.filter((g) => g.commit);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ commit: SHA, datei: DATEI, regel: PEM });
    expect(e[0].commit).toMatch(/^[0-9a-f]{40}$/);
    expect(e[0].grund).toMatch(/kein Schlüsselmaterial/);
  });

  it("der gemeldete Fall (b8e67edd × Datei × PEM) ist frei, nicht offen", async () => {
    const r = await scan([[SHA, DATEI, [`["privater Schlüssel", "${PEM_ZEILE}\\n"],`]]]);
    expect(r.offen).toEqual([]);
    expect(r.frei).toHaveLength(1);
    expect(r.frei[0]).toMatchObject({ commit: SHA, datei: DATEI, regel: PEM });
  });

  it("Mutation: gleiche Datei, gleiche Regel, ANDERER Commit → Fund bleibt", async () => {
    const r = await scan([[ANDERER_SHA, DATEI, [PEM_ZEILE]]]);
    expect(r.offen.map((f) => [f.commit, f.datei, f.regel])).toEqual([[ANDERER_SHA, DATEI, PEM]]);
  });

  it("Mutation: gekürzter SHA in der Freigabe gilt nicht (nur exakter 40-stelliger Vergleich)", async () => {
    const kurz = FREIGABEN.map((g) => (g.commit ? { ...g, commit: g.commit.slice(0, 8) } : g));
    const r = await scan([[SHA, DATEI, [PEM_ZEILE]]], kurz);
    expect(r.offen).toHaveLength(1);
  });

  it("Mutation: anderer PEM-Fund im selben Commit, ANDERE Datei → Fund bleibt", async () => {
    const r = await scan([[SHA, "werkzeug/anderes.mjs", [PEM_ZEILE]]]);
    expect(r.offen.map((f) => [f.datei, f.regel])).toEqual([["werkzeug/anderes.mjs", PEM]]);
  });

  it("Mutation: ANDERE Regel (API-Schlüssel) im selben Commit und derselben Datei → Fund bleibt", async () => {
    const r = await scan([[SHA, DATEI, [PEM_ZEILE, `const k = "${API_WERT}";`]]]);
    expect(r.offen.map((f) => f.regel)).toEqual(["Anthropic/OpenAI-Schlüssel"]);
    expect(r.frei.map((f) => f.regel)).toEqual([PEM]);
  });

  it("Mutation: freigegebener Treffer zuerst im Log verdeckt einen späteren (älteren) Fund derselben Datei × Regel nicht", async () => {
    const r = await scan([
      [SHA, DATEI, [PEM_ZEILE]],
      [ANDERER_SHA, DATEI, [PEM_ZEILE]],
    ]);
    expect(r.offen.map((f) => f.commit)).toEqual([ANDERER_SHA]);
  });

  it("freigabeFuer prüft alle drei Merkmale", () => {
    expect(freigabeFuer({ commit: SHA, datei: DATEI, regel: PEM })).toBeTruthy();
    expect(freigabeFuer({ commit: ANDERER_SHA, datei: DATEI, regel: PEM })).toBeUndefined();
    expect(freigabeFuer({ commit: SHA, datei: "x.js", regel: PEM })).toBeUndefined();
    expect(freigabeFuer({ commit: SHA, datei: DATEI, regel: "JWT" })).toBeUndefined();
  });
});

describe("Geheimnis-Werkzeug: Regression – Einträge ohne commit gelten wie bisher für alle Commits", () => {
  it("intelligence-leck.test.js × PEM ist in jedem Commit frei", async () => {
    const r = await scan([
      [SHA, "pruefungen/intelligence-leck.test.js", [PEM_ZEILE]],
      [ANDERER_SHA, "pruefungen/intelligence-leck.test.js", [PEM_ZEILE]],
      ["1".repeat(40), "pruefungen/intelligence-leck.test.js", [PEM_ZEILE]],
    ]);
    expect(r.offen).toEqual([]);
    expect(r.frei.length).toBeGreaterThan(0);
  });

  it("Freigabe ohne commit bleibt auf Datei × Regel begrenzt", async () => {
    const r = await scan([["2".repeat(40), "pruefungen/intelligence-leck.test.js", [`k = "${API_WERT}"`]]]);
    expect(r.offen.map((f) => f.regel)).toEqual(["Anthropic/OpenAI-Schlüssel"]);
  });

  it("alle bisherigen Einträge ohne commit sind unverändert vorhanden", () => {
    const ohne = FREIGABEN.filter((g) => !g.commit).map((g) => `${g.datei}|${g.regel}`);
    expect(ohne).toEqual([
      "pruefungen/intelligence-leck.test.js|privater Schlüssel (PEM)",
      "pruefungen/werkzeuge-im-bild.sh|Zuweisung Geheimnis-Variable",
      "pruefungen/ip-kuerzel.test.js|Zuweisung Geheimnis-Variable",
      ".github/workflows/deploy.yml|Zuweisung Geheimnis-Variable",
      ".github/workflows/pruefung.yml|Zuweisung Geheimnis-Variable",
    ]);
  });

  it("package-lock.json bleibt ausgenommen; offene Funde je Datei × Regel einmal", async () => {
    const r = await scan([
      ["3".repeat(40), "package-lock.json", [`"x": "${API_WERT}"`]],
      ["4".repeat(40), "a.js", [`k = "${API_WERT}"`]],
      ["5".repeat(40), "a.js", [`k = "${API_WERT}"`]],
    ]);
    expect(r.offen.map((f) => [f.commit, f.datei])).toEqual([["4".repeat(40), "a.js"]]);
  });
});

/* Echter Verlauf, sofern der Commit im Klon vorhanden ist (CI-Klon mit
   fetch-depth 0 auf diesem Zweig: nur, wenn der Zweig von #447 erreichbar ist). */
let vorhanden = false;
try {
  execFileSync("git", ["cat-file", "-e", `${SHA}^{commit}`], { cwd: WURZEL, stdio: "ignore" });
  vorhanden = true;
} catch { /* nicht im Klon */ }

describe.skipIf(!vorhanden)("Geheimnis-Werkzeug: echter Commit b8e67edd", () => {
  it("git show des Commits ergibt nur die freigegebene Fundstelle, keine offene", async () => {
    const text = execFileSync("git", ["show", "--no-color", "--no-ext-diff", "--format=@@COMMIT %H", "-U0", SHA], { cwd: WURZEL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const r = await fundeSammeln(text.split(/\r?\n/));
    expect(r.offen).toEqual([]);
    expect(r.frei.map((f) => [f.commit, f.datei, f.regel])).toEqual([[SHA, DATEI, PEM]]);
  });
});

/* ==========================================================================
   Review #450, Befund A1 (mittel): Datei NUR aus dem Diff-Kopf
   Eine hinzugefügte Inhaltszeile `++ b/<Pfad>` erscheint im Diff als
   `+++ b/<Pfad>`. Früher setzte jede solche Zeile den Dateinamen – ein
   PEM-Fund in beliebiger Datei wurde dann einer freigegebenen Datei
   zugerechnet und ohne Commit-Bindung freigegeben.
   ========================================================================== */
const SONDE_PFAD = "pruefungen/intelligence-leck.test.js";

/** ein Commit mit freien Diff-Zeilen (nach Marker und Leerzeile) */
function roh(sha, zeilen, eltern = "") {
  return [`@@COMMIT ${sha}${eltern ? " " + eltern : ""}`, "", ...zeilen];
}
function kopf(datei, n) {
  return [`diff --git a/${datei} b/${datei}`, "index 0000000..1111111 100644", `--- a/${datei}`, `+++ b/${datei}`, `@@ -0,0 +1,${n} @@`];
}

describe("Geheimnis-Werkzeug: A1 – Datei nur aus dem Diff-Kopf", () => {
  it("Sonde: Inhaltszeile `++ b/<freigegebene Datei>` vor PEM-Zeile in ANDERER Datei → Fund bleibt OFFEN (andere Datei)", async () => {
    const r = await fundeSammeln(roh(ANDERER_SHA, [...kopf("werkzeug/anderes.mjs", 2), `+++ b/${SONDE_PFAD}`, "+" + PEM_ZEILE]));
    expect(r.frei).toEqual([]);
    expect(r.offen.map((f) => [f.commit, f.datei, f.regel])).toEqual([[ANDERER_SHA, "werkzeug/anderes.mjs", PEM]]);
  });

  it("Sonde gegen die commit-gebundene Freigabe: gleicher Commit b8e67edd, Inhaltszeile `++ b/<Datei>` in anderer Datei → OFFEN", async () => {
    const r = await fundeSammeln(roh(SHA, [...kopf("werkzeug/anderes.mjs", 2), `+++ b/${DATEI}`, "+" + PEM_ZEILE]));
    expect(r.frei).toEqual([]);
    expect(r.offen.map((f) => f.datei)).toEqual(["werkzeug/anderes.mjs"]);
  });

  it("Sonde über zwei Hunks und eine zweite Datei: Zuordnung folgt nur den Kopfzeilen", async () => {
    const r = await fundeSammeln(roh(ANDERER_SHA, [
      ...kopf("a.js", 1), `+++ b/${SONDE_PFAD}`,
      "@@ -5,0 +6,1 @@", "+" + PEM_ZEILE,
      ...kopf(SONDE_PFAD, 1), "+" + PEM_ZEILE,
    ]));
    expect(r.offen.map((f) => f.datei)).toEqual(["a.js"]);
    expect(r.frei.map((f) => f.datei)).toEqual([SONDE_PFAD]);
  });

  it("`+++`-Zeile außerhalb von Kopf und Hunk (Zähler erschöpft) setzt keine Datei; Folgetreffer fail-closed OFFEN mit „Datei unbekannt“", async () => {
    const r = await fundeSammeln(roh(ANDERER_SHA, [...kopf("a.js", 1), "+harmlos", `+++ b/${SONDE_PFAD}`, "+" + PEM_ZEILE]));
    expect(r.frei).toEqual([]);
    expect(r.offen.map((f) => [f.datei, f.regel])).toEqual([[G.DATEI_UNBEKANNT, PEM]]);
  });

  it("Hunk-Zählung mit Entfern-, Kontext- und „\\ No newline“-Zeilen", async () => {
    const r = await fundeSammeln(roh(ANDERER_SHA, [
      "diff --git a/a.js b/a.js", "index 1..2 100644", "--- a/a.js", "+++ b/a.js",
      "@@ -1,2 +1,3 @@", " kontext", "-weg", "+++ b/" + SONDE_PFAD, "+" + PEM_ZEILE, "\\ No newline at end of file",
      "@@ -9 +10 @@", "-alt", "+" + PEM_ZEILE,
    ]));
    expect(r.offen.map((f) => f.datei)).toEqual(["a.js"]);
    expect(r.frei).toEqual([]);
  });

  it("Umbenennung mit Inhaltsänderung: Datei = neuer Name aus `+++ b/…`", async () => {
    const r = await fundeSammeln(roh(ANDERER_SHA, [
      `diff --git a/${SONDE_PFAD} b/werkzeug/neu.mjs`, "similarity index 90%", `rename from ${SONDE_PFAD}`, "rename to werkzeug/neu.mjs",
      "index 1..2 100644", `--- a/${SONDE_PFAD}`, "+++ b/werkzeug/neu.mjs", "@@ -1,0 +2 @@", "+" + PEM_ZEILE,
    ]));
    expect(r.offen.map((f) => f.datei)).toEqual(["werkzeug/neu.mjs"]);
  });

  it("Binärdatei (ohne Hunks) und gelöschte Datei stören die Zuordnung der nächsten Datei nicht", async () => {
    const r = await fundeSammeln(roh(ANDERER_SHA, [
      "diff --git a/bild.png b/bild.png", "index 1..2 100644", "Binary files a/bild.png and b/bild.png differ",
      `diff --git a/${SONDE_PFAD} b/${SONDE_PFAD}`, "deleted file mode 100644", "index 1..0", `--- a/${SONDE_PFAD}`, "+++ /dev/null", "@@ -1 +0,0 @@", "-alt",
      ...kopf("b.js", 1), "+" + PEM_ZEILE,
    ]));
    expect(r.offen.map((f) => f.datei)).toEqual(["b.js"]);
  });

  it("Pfade mit Leerzeichen (git hängt ein Tab an), Unicode und Anführungszeichen (core.quotePath) werden richtig gelesen", async () => {
    const eigene = [
      { datei: "mit leer.txt", regel: PEM, grund: "t" },
      { datei: "ü leer.txt", regel: PEM, grund: "t" },
      { datei: 'q"uo\\te.txt', regel: PEM, grund: "t" },
    ];
    const r = await fundeSammeln([
      ...roh("6".repeat(40), ["diff --git a/mit leer.txt b/mit leer.txt", "--- a/mit leer.txt\t", "+++ b/mit leer.txt\t", "@@ -0,0 +1 @@", "+" + PEM_ZEILE]),
      ...roh("7".repeat(40), ['diff --git "a/\\303\\274 leer.txt" "b/\\303\\274 leer.txt"', "--- /dev/null", '+++ "b/\\303\\274 leer.txt"\t', "@@ -0,0 +1 @@", "+" + PEM_ZEILE]),
      ...roh("8".repeat(40), ['diff --git "a/q\\"uo\\\\te.txt" "b/q\\"uo\\\\te.txt"', "--- /dev/null", '+++ "b/q\\"uo\\\\te.txt"', "@@ -0,0 +1 @@", "+" + PEM_ZEILE]),
    ], { freigaben: eigene });
    expect(r.offen).toEqual([]);
    expect(r.frei.map((f) => f.datei).sort()).toEqual(["mit leer.txt", 'q"uo\\te.txt', "ü leer.txt"].sort());
  });

  it("nicht sicher bestimmbarer Pfad (kaputtes Quoting, ohne b/-Präfix) → „Datei unbekannt“, nie frei", async () => {
    const r = await fundeSammeln([
      ...roh("6".repeat(40), [`diff --git a/x b/x`, "--- a/x", `+++ "b/${SONDE_PFAD}`, "@@ -0,0 +1 @@", "+" + PEM_ZEILE]),
      ...roh("7".repeat(40), [`diff --git a/x b/x`, "--- a/x", `+++ ${SONDE_PFAD}`, "@@ -0,0 +1 @@", "+" + PEM_ZEILE]),
    ]);
    expect(r.frei).toEqual([]);
    expect(r.offen.map((f) => [f.commit, f.datei])).toEqual([["6".repeat(40), G.DATEI_UNBEKANNT]]);
  });

  it("pfadAusKopf: Einzelfälle", () => {
    expect(G.pfadAusKopf("b/a b.txt\t")).toBe("a b.txt");
    expect(G.pfadAusKopf('"b/\\303\\244\\t.txt"')).toBe("ä\t.txt");
    expect(G.pfadAusKopf('"b/x\\q"')).toBeNull();
    expect(G.pfadAusKopf('"b/\\377"')).toBeNull();        // kein gültiges UTF-8
    expect(G.pfadAusKopf("a/x")).toBeNull();
    expect(G.pfadAusKopf("b/")).toBeNull();
  });

  it("freigabeFuer gibt ohne bestimmte Datei nie frei", () => {
    const alle = [{ datei: G.DATEI_UNBEKANNT, regel: PEM, grund: "t" }];
    expect(G.DATEI_UNBEKANNT).toEqual(expect.any(String));
    expect(freigabeFuer({ commit: SHA, datei: G.DATEI_UNBEKANNT, regel: PEM }, alle)).toBeUndefined();
    expect(freigabeFuer({ commit: SHA, datei: null, regel: PEM }, [{ datei: null, regel: PEM }])).toBeUndefined();
  });

  it("zeilenAus trennt nur an \\n: ein einzelnes \\r im Inhalt verschiebt die Hunk-Zählung nicht", async () => {
    const text = [`@@COMMIT ${ANDERER_SHA}`, "", ...kopf("a.js", 1), `+x\r+++ b/${SONDE_PFAD}`, ...kopf("b.js", 1), "+" + PEM_ZEILE, ""].join("\n");
    const zeilen = [];
    for await (const z of G.zeilenAus(Readable.from([Buffer.from(text)]))) zeilen.push(z);
    expect(zeilen).toContain(`+x\r+++ b/${SONDE_PFAD}`);
    const r = await fundeSammeln(zeilen);
    expect(r.offen.map((f) => f.datei)).toEqual(["b.js"]);
  });
});

/* ==========================================================================
   Review #450, Befund A2 (niedrig): Merge-Commits und Commit-Text
   ========================================================================== */
const MERGE = "9".repeat(40);
const ELTERN = `${"a".repeat(40)} ${"b".repeat(40)}`;

describe("Geheimnis-Werkzeug: A2 – Merge-Commits und Commit-Text", () => {
  it("git-Aufruf: Remerge-Diff, Eltern im Marker, feste Präfixe und Quoting", () => {
    expect(G.GIT_LOG_ARGS).toEqual(expect.arrayContaining(["--remerge-diff", "--format=@@COMMIT %H %P", "-U0", "--src-prefix=a/", "--dst-prefix=b/", "core.quotePath=true", "--no-ext-diff", "--no-textconv"]));
    expect(G.GIT_LOG_ARGS).not.toContain("--first-parent");
  });

  it("Fund, den nur ein Merge-Commit einbringt (Konfliktauflösung) → OFFEN mit Merge-SHA", async () => {
    const r = await fundeSammeln(roh(MERGE, [...kopf("a.js", 1), `+k = "${API_WERT}"`], ELTERN));
    expect(r.merges).toBe(1);
    expect(r.offen.map((f) => [f.commit, f.datei, f.regel])).toEqual([[MERGE, "a.js", "Anthropic/OpenAI-Schlüssel"]]);
  });

  it("Merge-Fund identisch zu einem Fund eines normalen Commits → keine Doppelmeldung (Ursprung zählt)", async () => {
    const zeile = `k = "${API_WERT}"`;
    const r = await fundeSammeln([
      ...roh(MERGE, [...kopf("a.js", 1), "+" + zeile], ELTERN),
      ...roh(ANDERER_SHA, [...kopf("a.js", 1), "+" + zeile], "c".repeat(40)),
    ]);
    expect(r.offen.map((f) => f.commit)).toEqual([ANDERER_SHA]);
    expect(r.doppelt).toBe(1);
  });

  it("Merge-Kopie der freigegebenen b8e67edd-Zeile erscheint nicht als neuer Fund; eine ANDERE PEM-Zeile im Merge bleibt offen", async () => {
    const zeile = `["privater Schlüssel", "${PEM_ZEILE}\\n"],`;
    const r = await fundeSammeln([
      ...roh(MERGE, [...kopf(DATEI, 1), "+" + zeile], ELTERN),
      ...roh(SHA, [...kopf(DATEI, 1), "+" + zeile]),
    ]);
    expect(r.offen).toEqual([]);
    expect(r.frei.map((f) => f.commit)).toEqual([SHA]);
    const r2 = await fundeSammeln([
      ...roh(MERGE, [...kopf(DATEI, 1), "+x " + PEM_ZEILE], ELTERN),
      ...roh(SHA, [...kopf(DATEI, 1), "+" + zeile]),
    ]);
    expect(r2.offen.map((f) => [f.commit, f.datei])).toEqual([[MERGE, DATEI]]);
  });

  it("Freigabe ohne commit (Datei × Regel) gilt auch im Merge-Commit wie bisher", async () => {
    const r = await fundeSammeln(roh(MERGE, [...kopf(SONDE_PFAD, 1), "+" + PEM_ZEILE], ELTERN));
    expect(r.offen).toEqual([]);
    expect(r.frei.map((f) => [f.commit, f.datei])).toEqual([[MERGE, SONDE_PFAD]]);
  });

  it("Commit-Text: Wert in Nachricht oder Autor-Feld → OFFEN (Pseudo-Datei), harmloser Text → nichts", () => {
    const t = [
      `${"d".repeat(40)}\x1fA <a@b>\x1fC <c@d>\x1fFix\n\nSchlüssel k=${API_WERT}\n`,
      `${"e".repeat(40)}\x1fA <a@b>\x1fC <c@d>\x1fnur Text: privater Schlüssel (PEM) erwähnt\n`,
      `${"f".repeat(40)}\x1f${API_WERT} <a@b>\x1fC <c@d>\x1fx\n`,
    ].join("\0");
    const r = G.commitTexteSammeln(t);
    expect(r.commits).toBe(3);
    expect(r.offen.map((f) => [f.commit, f.datei])).toEqual([["d".repeat(40), G.COMMIT_TEXT], ["f".repeat(40), G.COMMIT_TEXT]]);
    expect(G.GIT_TEXT_ARGS).toEqual(expect.arrayContaining(["-z"]));
  });

  it("Commit-Text: unerwarteter Aufbau wird trotzdem vollständig geprüft (fail-closed)", () => {
    const r = G.commitTexteSammeln(`kaputt ohne SHA k=${API_WERT}`);
    expect(r.offen.map((f) => f.commit)).toEqual(["-"]);
  });
});

/* ==========================================================================
   Echte git-Läufe in einem Wegwerf-Repo (synthetische Werte): Sonde A1,
   Merge mit eingebrachtem Geheimnis, Umbenennung, Leerzeichen-/Unicode-Pfad,
   Commit-Nachricht. Nichts davon gelangt in dieses Repo.
   ========================================================================== */
describe("Geheimnis-Werkzeug: historieScannen gegen echtes git", () => {
  it("findet Sonde, Merge-Geheimnis, Umbenennung, Unicode-Pfad und Commit-Nachricht; Freigaben greifen nur passend", async () => {
    expect(G.historieScannen).toEqual(expect.any(Function));
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "geheimnis-scan-"));
    try {
      const g = (...a) => execFileSync("git", ["-c", "user.name=Pruefung", "-c", "user.email=pruefung@beispiel.invalid", "-c", "core.autocrlf=false",
        "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${path.join(d, ".keine-hooks")}`, ...a], { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
      const wert = (n) => "sk-" + `Qz${n}`.repeat(12);
      g("init", "-q", "-b", "main");
      w("a.txt", "start\n"); w("konflikt.txt", "a\nb\n");
      g("add", "-A"); g("commit", "-qm", "start");
      // Sonde A1: Inhaltszeile `++ b/<freigegebene Datei>` vor PEM in anderer Datei
      w("andere.js", `++ b/${SONDE_PFAD}\n${PEM_ZEILE}\n`);
      w(SONDE_PFAD, `${PEM_ZEILE}\n`);
      g("add", "-A"); g("commit", "-qm", "sonde");
      g("checkout", "-qb", "seite"); w("konflikt.txt", "a\nSEITE\n"); g("commit", "-qam", "seite");
      g("checkout", "-q", "main"); w("konflikt.txt", "a\nHAUPT\n"); g("commit", "-qam", "haupt");
      try { g("merge", "-q", "--no-ff", "seite", "-m", "zusammen"); } catch { /* Konflikt erwartet */ }
      w("konflikt.txt", `a\nk = "${wert(1)}"\n`); g("add", "konflikt.txt"); g("commit", "-qm", "zusammen");
      const merge = g("rev-parse", "HEAD").trim();
      g("mv", "a.txt", "neu mit leer.txt"); fs.appendFileSync(path.join(d, "neu mit leer.txt"), `t = "${wert(2)}"\n`);
      g("add", "-A"); g("commit", "-qm", "umbenannt");
      w("ü datei.txt", `u = "${wert(3)}"\n`); g("add", "-A"); g("commit", "-qm", `unicode k=${wert(4)}`);
      const textCommit = g("rev-parse", "HEAD").trim();

      const r = await G.historieScannen({ cwd: d, refs: ["--all"] });
      const offen = r.offen.map((f) => `${f.datei}|${f.regel}`).sort();
      expect(offen).toEqual([
        `${G.COMMIT_TEXT}|Anthropic/OpenAI-Schlüssel`,
        `andere.js|${PEM}`,
        "konflikt.txt|Anthropic/OpenAI-Schlüssel",
        "neu mit leer.txt|Anthropic/OpenAI-Schlüssel",
        "ü datei.txt|Anthropic/OpenAI-Schlüssel",
      ].sort());
      expect(r.offen.find((f) => f.datei === "konflikt.txt").commit).toBe(merge);
      expect(r.offen.find((f) => f.datei === G.COMMIT_TEXT).commit).toBe(textCommit);
      expect(r.frei.map((f) => f.datei)).toEqual([SONDE_PFAD]);
      expect(r.merges).toBe(1);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  }, 60000);
});
