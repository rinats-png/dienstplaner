// SI-P9: Workflow-Härtung. Jeder checkout-Schritt speichert das Token nicht
// (persist-credentials: false), und jeder Workflow setzt eine Berechtigungs-
// vorgabe, die nur Lesen erlaubt. Ausnahmen: nur die Deploy-Pipeline
// (deploy.yml, betrieb-deploy.yml); deren Härtung braucht eine Betreiber-
// freigabe (SI-P8/SI-P9, docs/acc45/SI-P9-NACHWEIS.md).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const yaml = createRequire(import.meta.url)("js-yaml");
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDNER = path.join(WURZEL, ".github", "workflows");

// Ausnahmen mit Begründung. Nur diese beiden; jede weitere braucht einen Eintrag.
const AUSNAHMEN = {
  "deploy.yml": "Deploy-Pipeline: Härtung nach Betreiberfreigabe (SI-P8-Akzeptanz)",
  "betrieb-deploy.yml": "Deploy-Pipeline: Härtung nach Betreiberfreigabe (SI-P8-Akzeptanz)",
};

const SCHREIBRECHTE = ["write", "write-all"];

// Liefert Befunde für einen geparsten Workflow. Leer heißt: bestanden.
export function haertungPruefen(workflow) {
  const befunde = [];
  const perm = workflow.permissions;
  if (perm === undefined) {
    befunde.push("keine Berechtigungsvorgabe auf Workflow-Ebene");
  } else if (perm === "write-all") {
    befunde.push("permissions: write-all");
  } else if (perm && typeof perm === "object") {
    for (const [scope, wert] of Object.entries(perm)) {
      if (SCHREIBRECHTE.includes(wert)) befunde.push(`Schreibrecht ${scope}: ${wert}`);
    }
  }
  for (const [jobName, job] of Object.entries(workflow.jobs || {})) {
    if (!job || typeof job !== "object") continue;
    for (const schritt of job.steps || []) {
      if (typeof schritt?.uses !== "string" || !schritt.uses.startsWith("actions/checkout@")) continue;
      if (schritt.with?.["persist-credentials"] !== false) {
        befunde.push(`${jobName}: checkout ohne persist-credentials: false`);
      }
    }
  }
  return befunde;
}

const alleWorkflows = () =>
  readdirSync(ORDNER).filter((f) => /\.ya?ml$/.test(f)).sort();

describe("SI-P9 Regel (rote und grüne Proben)", () => {
  const gesund = `
permissions:
  contents: read
jobs:
  a:
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
`;
  it("lässt einen sauberen Workflow durch", () => {
    expect(haertungPruefen(yaml.load(gesund))).toEqual([]);
  });
  it("meldet checkout ohne persist-credentials", () => {
    const x = gesund.replace("persist-credentials: false", "fetch-depth: 0");
    expect(haertungPruefen(yaml.load(x))).toHaveLength(1);
  });
  it("meldet persist-credentials: true", () => {
    const x = gesund.replace("persist-credentials: false", "persist-credentials: true");
    expect(haertungPruefen(yaml.load(x))).toHaveLength(1);
  });
  it("meldet fehlende Berechtigungsvorgabe", () => {
    const x = gesund.replace("permissions:\n  contents: read\n", "");
    expect(haertungPruefen(yaml.load(x))).toEqual(["keine Berechtigungsvorgabe auf Workflow-Ebene"]);
  });
  it("meldet Schreibrechte und write-all", () => {
    const schreib = gesund.replace("contents: read", "contents: read\n  packages: write");
    expect(haertungPruefen(yaml.load(schreib))).toEqual(["Schreibrecht packages: write"]);
    const alles = gesund.replace("permissions:\n  contents: read", "permissions: write-all");
    expect(haertungPruefen(yaml.load(alles))).toEqual(["permissions: write-all"]);
  });
});

describe("SI-P9 Stand im Repository", () => {
  const geprueft = alleWorkflows().filter((f) => !(f in AUSNAHMEN));

  it("jede Ausnahme existiert noch und ist begründet", () => {
    const vorhanden = new Set(alleWorkflows());
    for (const [datei, grund] of Object.entries(AUSNAHMEN)) {
      expect(vorhanden.has(datei), datei).toBe(true);
      expect(grund.length, datei).toBeGreaterThan(10);
    }
  });

  it("alle übrigen Workflows sind gehärtet", () => {
    const fehler = {};
    for (const f of geprueft) {
      const b = haertungPruefen(yaml.load(readFileSync(path.join(ORDNER, f), "utf8")));
      if (b.length) fehler[f] = b;
    }
    expect(fehler).toEqual({});
  });
});
