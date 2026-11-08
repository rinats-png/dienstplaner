// SI-P9: Workflow-Härtung. Jeder checkout-Schritt speichert das Token nicht
// (persist-credentials: false), und jeder Workflow und jeder Job setzt eine
// Berechtigungsvorgabe, die keine Schreibrechte gewährt.
// Ausnahme nur für die Token-Regel: die Deploy-Pipeline (deploy.yml,
// betrieb-deploy.yml), deren Härtung eine Betreiberfreigabe braucht
// (SI-P8-Akzeptanz, docs/acc45/SI-P9-NACHWEIS.md). Die Berechtigungsregel
// gilt für alle Workflows.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const yaml = createRequire(import.meta.url)("js-yaml");
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDNER = path.join(WURZEL, ".github", "workflows");

// Nur für die Token-Regel. Jede weitere Ausnahme braucht einen Eintrag mit Begründung.
const TOKEN_AUSNAHMEN = {
  "deploy.yml": "Deploy-Pipeline: Härtung nach Betreiberfreigabe (SI-P8-Akzeptanz)",
  "betrieb-deploy.yml": "Deploy-Pipeline: Härtung nach Betreiberfreigabe (SI-P8-Akzeptanz)",
};

const SCHREIBRECHTE = ["write", "write-all"];

// Prüft eine Berechtigungsvorgabe (Workflow oder Job). Leer heißt: bestanden.
function berechtigungPruefen(perm, ort) {
  if (perm === undefined || perm === null) return [];
  if (perm === "write-all") return [`${ort}: permissions: write-all`];
  if (typeof perm === "object") {
    return Object.entries(perm)
      .filter(([, wert]) => SCHREIBRECHTE.includes(wert))
      .map(([scope, wert]) => `${ort}: Schreibrecht ${scope}: ${wert}`);
  }
  return [];
}

// Liefert Befunde für einen geparsten Workflow. Leer heißt: bestanden.
// Parameter `token`: false prüft die Token-Regel nicht (Deploy-Ausnahmen).
export function haertungPruefen(workflow, { token = true } = {}) {
  const befunde = [];
  if (workflow.permissions === undefined || workflow.permissions === null) {
    befunde.push("keine Berechtigungsvorgabe auf Workflow-Ebene");
  } else {
    befunde.push(...berechtigungPruefen(workflow.permissions, "Workflow"));
  }
  for (const [jobName, job] of Object.entries(workflow.jobs || {})) {
    if (!job || typeof job !== "object") continue;
    befunde.push(...berechtigungPruefen(job.permissions, `Job ${jobName}`));
    if (!token) continue;
    for (const schritt of job.steps || []) {
      if (typeof schritt?.uses !== "string") continue;
      // GitHub löst Owner und Repo ohne Rücksicht auf Groß- und Kleinschreibung auf.
      if (!schritt.uses.trim().toLowerCase().startsWith("actions/checkout@")) continue;
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
  it("meldet checkout mit abweichender Groß- und Kleinschreibung", () => {
    const x = gesund.replace("actions/checkout@", "Actions/Checkout@").replace("persist-credentials: false", "fetch-depth: 0");
    expect(haertungPruefen(yaml.load(x))).toHaveLength(1);
  });
  it("meldet fehlende Berechtigungsvorgabe, auch bei leerem Block (null)", () => {
    const x = gesund.replace("permissions:\n  contents: read\n", "");
    expect(haertungPruefen(yaml.load(x))).toEqual(["keine Berechtigungsvorgabe auf Workflow-Ebene"]);
    const leer = gesund.replace("permissions:\n  contents: read\n", "permissions:\n");
    expect(haertungPruefen(yaml.load(leer))).toEqual(["keine Berechtigungsvorgabe auf Workflow-Ebene"]);
  });
  it("meldet Schreibrechte und write-all auf Workflow-Ebene", () => {
    const schreib = gesund.replace("contents: read", "contents: read\n  packages: write");
    expect(haertungPruefen(yaml.load(schreib))).toEqual(["Workflow: Schreibrecht packages: write"]);
    const alles = gesund.replace("permissions:\n  contents: read", "permissions: write-all");
    expect(haertungPruefen(yaml.load(alles))).toEqual(["Workflow: permissions: write-all"]);
  });
  it("meldet Schreibrechte auf Job-Ebene", () => {
    const job = gesund.replace("  a:\n", "  a:\n    permissions:\n      contents: write\n");
    expect(haertungPruefen(yaml.load(job))).toEqual(["Job a: Schreibrecht contents: write"]);
  });
  it("prüft die Token-Regel bei Deploy-Ausnahmen nicht, die Berechtigungsregel aber schon", () => {
    const ohneToken = gesund.replace("persist-credentials: false", "fetch-depth: 0");
    expect(haertungPruefen(yaml.load(ohneToken), { token: false })).toEqual([]);
    const schreib = gesund.replace("contents: read", "contents: write");
    expect(haertungPruefen(yaml.load(schreib), { token: false })).toEqual(["Workflow: Schreibrecht contents: write"]);
  });
});

describe("SI-P9 Stand im Repository", () => {
  it("jede Token-Ausnahme existiert noch und ist begründet", () => {
    const vorhanden = new Set(alleWorkflows());
    for (const [datei, grund] of Object.entries(TOKEN_AUSNAHMEN)) {
      expect(vorhanden.has(datei), datei).toBe(true);
      expect(grund.length, datei).toBeGreaterThan(10);
    }
  });

  it("alle Workflows haben keine Schreibrechte, alle übrigen auch gehärtete Tokens", () => {
    const fehler = {};
    for (const f of alleWorkflows()) {
      const token = !(f in TOKEN_AUSNAHMEN);
      const b = haertungPruefen(yaml.load(readFileSync(path.join(ORDNER, f), "utf8")), { token });
      if (b.length) fehler[f] = b;
    }
    expect(fehler).toEqual({});
  });
});
