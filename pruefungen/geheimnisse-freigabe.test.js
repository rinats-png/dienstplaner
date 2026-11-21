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
import { FREIGABEN, fundeSammeln, freigabeFuer } from "../werkzeug/sicherheit/geheimnisse.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "b8e67eddfe1ee371d897d01da9288d89df0a7e56";
const ANDERER_SHA = "07d4601eedd13f9f916f74ee0d17c15df0d35caf";
const DATEI = "pruefungen/inventur-install.test.js";
const PEM = "privater Schlüssel (PEM)";
const PEM_ZEILE = ["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ");
/* synthetischer Wert für die Regel „Anthropic/OpenAI-Schlüssel“ (kein Platzhalterwort) */
const API_WERT = "sk-" + "Qz7".repeat(12);

/** baut `git log -p`-artige Zeilen: [[sha, datei, [hinzugefügte Zeilen]], …] */
function log(eintraege) {
  const z = [];
  for (const [sha, datei, zeilen] of eintraege) {
    z.push(`@@COMMIT ${sha}`, `diff --git a/${datei} b/${datei}`, `--- a/${datei}`, `+++ b/${datei}`, "@@ -1,0 +1,1 @@");
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
