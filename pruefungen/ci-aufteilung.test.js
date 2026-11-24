// Pilot f1 (docs/acc45/QS-CI-AUFTEILUNG-PILOT-2026-11-24.md): der frühere Job `pruefen` der Prüfung läuft in drei
// Jobs `pruefen-a`, `pruefen-b`, `pruefen-c`. Diese Prüfung hält fest:
//  1. die Jobliste der Prüfung ist genau diese (plus `browser-abnahme`), und jeder Job ist Pflicht-Check in G1
//     (werkzeug/release-pruefung.mjs); kein Pflicht-Check zeigt auf einen Job, den es in keinem Workflow gibt;
//  2. jeder Teil hat denselben Einstieg (checkout ohne Token, setup-node 22 mit npm-Cache, npm ci);
//  3. jeder Prüfschritt steht in genau einem Teil (kein Schritt doppelt, keiner der Schritte außerhalb der
//     Sammelkette fehlt; die Sammelkette selbst bewacht pruefung:ci-abdeckung);
//  4. Reihenfolge und gemeinsamer Zustand: Gate-Proben (Port 3000), Bild, Container-Skript, Container-Prüfungen
//     und die Container-Logs liegen in EINEM Teil, in der nötigen Reihenfolge; kein anderer Teil nutzt Port 3000,
//     $BILD oder das Container-Skript.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KONFIG_STANDARD } from "../werkzeug/release-pruefung.mjs";

const yaml = createRequire(import.meta.url)("js-yaml");
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDNER = path.join(WURZEL, ".github", "workflows");
const lesen = (f) => yaml.load(readFileSync(path.join(ORDNER, f), "utf8"));

export const TEILE = ["pruefen-a", "pruefen-b", "pruefen-c"];
const CONTAINER = "$RUNNER_TEMP/container-neu.sh"; // YAML: run: "$RUNNER_TEMP/container-neu.sh"
// Schritte außerhalb der Sammelkette `pruefung` (ci-abdeckung sieht sie nicht): jeder genau einmal in den Teilen.
export const PFLICHT_AUSSERHALB_KETTE = [
  "npm run build",
  "docker exec -e CENTRIC_ZWEIFAKTOR_NACHWEIS centric-pruefung node /app/werkzeug/staging-smoke.mjs",
  "docker exec -e CENTRIC_ZWEIFAKTOR_NACHWEIS centric-pruefung node /app/werkzeug/staging-geo.mjs",
  "docker exec centric-pruefung node /app/werkzeug/staging-aufraeumen.mjs",
  'bash pruefungen/werkzeuge-im-bild.sh "$BILD"',
  "node pruefungen/serverlauf.mjs verwalter",
  "docker logs centric-pruefung",
  'cat > "$RUNNER_TEMP/container-neu.sh"',
];

const lauf = (s) => (typeof s?.run === "string" ? s.run.trim() : "");
const einstiegOk = (steps) =>
  String(steps[0]?.uses).startsWith("actions/checkout@") && steps[0]?.with?.["persist-credentials"] === false
  && String(steps[1]?.uses).startsWith("actions/setup-node@") && String(steps[1]?.with?.["node-version"]) === "22"
  && steps[1]?.with?.cache === "npm" && lauf(steps[2]) === "npm ci";

/** Befunde für eine geparste pruefung.yml. Leer heißt: bestanden. Exportiert für die Mutationsproben unten. */
export function aufteilungPruefen(wf) {
  const b = [];
  const jobs = wf?.jobs || {};
  const ids = Object.keys(jobs);
  const soll = [...TEILE, "browser-abnahme"];
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...soll].sort())) b.push(`Jobs ${JSON.stringify(ids)}, erwartet ${JSON.stringify(soll)}`);
  for (const id of ids) if (jobs[id]?.name !== undefined) b.push(`Job ${id}: eigenes name: ändert den Check-Run-Namen`);
  const teile = TEILE.filter((t) => jobs[t]);
  for (const t of teile) {
    const j = jobs[t];
    if (j["runs-on"] !== "ubuntu-latest" || j["timeout-minutes"] !== 40) b.push(`${t}: runs-on/timeout-minutes abweichend`);
    if (!einstiegOk(j.steps || [])) b.push(`${t}: Einstieg nicht checkout/setup-node/npm ci`);
  }
  // 3. jeder Prüfschritt in genau einem Teil
  const ort = new Map();
  const npmOrt = new Map();
  for (const t of teile) {
    for (const s of (jobs[t].steps || []).slice(3)) {
      const r = lauf(s) || `uses:${s.uses}`;
      if (r !== CONTAINER) ort.set(r, [...(ort.get(r) || []), t]);
      for (const m of r.matchAll(/npm run (?:--silent |-s )?([\w:.-]+)/g)) npmOrt.set(m[1], [...(npmOrt.get(m[1]) || []), t]);
    }
  }
  for (const [r, o] of ort) if (o.length > 1) b.push(`Schritt doppelt (${o.join(", ")}): ${r.split("\n")[0]}`);
  for (const [n, o] of npmOrt) if (o.length > 1) b.push(`npm run ${n} mehrfach (${o.join(", ")})`);
  const alleTexte = [...ort.keys()].join("\n");
  for (const p of PFLICHT_AUSSERHALB_KETTE) {
    const n = alleTexte.split(p).length - 1;
    if (n !== 1) b.push(`Pflichtschritt außerhalb der Kette ${n}-mal statt 1-mal: ${p}`);
  }
  // 4. Bild-Teil: Reihenfolge und Zustand
  const mitBild = teile.filter((t) => (jobs[t].steps || []).some((s) => String(s.uses).startsWith("docker/build-push-action@")));
  if (mitBild.length !== 1) { b.push(`Bild wird in ${mitBild.length} Teilen gebaut, erwartet 1`); return b; }
  const bt = mitBild[0];
  const st = jobs[bt].steps;
  if (!String(jobs[bt].env?.BILD || "").startsWith("centric-pruefung:")) b.push(`${bt}: env BILD fehlt`);
  const idx = (f) => st.findIndex(f);
  const iGate = idx((s) => lauf(s) === "npm run pruefung:staging-proben");
  const iBuild = idx((s) => lauf(s) === "npm run build");
  const iBild = idx((s) => String(s.uses).startsWith("docker/build-push-action@"));
  const iSkript = idx((s) => lauf(s).startsWith('cat > "$RUNNER_TEMP/container-neu.sh"'));
  const iErster = idx((s) => lauf(s) === CONTAINER);
  const reihe = [["Gate-Proben gegen frischen Server", iGate], ["Übersetzen", iBuild], ["Bild bauen", iBild], ["Container-Start bereitlegen", iSkript], ["erster Containerstart", iErster]];
  for (const [n, i] of reihe) if (i < 0) b.push(`${bt}: ${n} fehlt`);
  for (let k = 1; k < reihe.length; k++) if (reihe[k - 1][1] >= reihe[k][1]) b.push(`${bt}: ${reihe[k - 1][0]} muss vor ${reihe[k][0]} stehen`);
  st.forEach((s, i) => {
    if (String(s.env?.CENTRIC_BASIS || "").includes("127.0.0.1:3000") && i < iErster) b.push(`${bt}: ${s.name} nutzt den Container vor dem ersten Start`);
  });
  const letzter = st.at(-1);
  if (lauf(letzter) !== "docker logs centric-pruefung" || letzter.if !== "failure()") b.push(`${bt}: letzter Schritt ist nicht „Container-Logs (bei Fehler)“`);
  for (const t of teile.filter((x) => x !== bt)) {
    for (const s of jobs[t].steps || []) {
      const r = lauf(s);
      if (r.includes("$BILD") || r.includes("container-neu.sh") || r.includes("centric-pruefung") || /127\.0\.0\.1:3000/.test(JSON.stringify(s.env || {})))
        b.push(`${t}: ${s.name || r} nutzt Zustand des Bild-Teils (${bt})`);
    }
    if (jobs[t].env?.BILD !== undefined) b.push(`${t}: env BILD gehört nur in ${bt}`);
  }
  return b;
}

const WF = lesen("pruefung.yml");

describe("Aufteilung der Prüfung (Pilot f1)", () => {
  it("Jobs, Einstieg, jeder Schritt in genau einem Teil, Reihenfolge und Zustand des Bild-Teils", () => {
    expect(aufteilungPruefen(WF)).toEqual([]);
  });

  it("G1: jeder Job der Prüfung ist Pflicht-Check; jeder Pflicht-Check ist ein Job eines Workflows", () => {
    const pflicht = KONFIG_STANDARD.pflichtChecks;
    expect(Object.keys(WF.jobs).filter((j) => !pflicht.includes(j))).toEqual([]);
    const alleJobs = new Set(readdirSync(ORDNER).filter((f) => /\.ya?ml$/.test(f))
      .flatMap((f) => Object.entries(lesen(f)?.jobs || {}).map(([id, j]) => (typeof j?.name === "string" ? j.name : id))));
    expect(pflicht.filter((p) => !alleJobs.has(p))).toEqual([]);
    expect(new Set(pflicht).size).toBe(pflicht.length);
  });
});

describe("Mutationsproben: die Prüfung schlägt an", () => {
  const kopie = () => structuredClone(WF);
  const schritt = (wf, f) => {
    for (const t of TEILE) { const i = wf.jobs[t].steps.findIndex(f); if (i >= 0) return [t, i]; }
    throw new Error("Schritt nicht gefunden");
  };
  it("ein Schritt außerhalb der Kette entfernt → rot", () => {
    const wf = kopie();
    const [t, i] = schritt(wf, (s) => lauf(s) === 'bash pruefungen/werkzeuge-im-bild.sh "$BILD"');
    wf.jobs[t].steps.splice(i, 1);
    expect(aufteilungPruefen(wf).join("\n")).toMatch(/werkzeuge-im-bild\.sh/);
  });
  it("ein Schritt in zwei Teile kopiert → rot", () => {
    const wf = kopie();
    const [t, i] = schritt(wf, (s) => lauf(s) === "npm run pruefung:regeln");
    const ziel = TEILE.find((x) => x !== t);
    wf.jobs[ziel].steps.push(wf.jobs[t].steps[i]);
    expect(aufteilungPruefen(wf).join("\n")).toMatch(/pruefung:regeln/);
  });
  it("Gate-Proben gegen frischen Server in einen anderen Teil → rot (Port 3000, Reihenfolge)", () => {
    const wf = kopie();
    const [t, i] = schritt(wf, (s) => lauf(s) === "npm run pruefung:staging-proben");
    const [s] = wf.jobs[t].steps.splice(i, 1);
    wf.jobs[TEILE.find((x) => x !== t)].steps.push(s);
    expect(aufteilungPruefen(wf).join("\n")).toMatch(/Gate-Proben gegen frischen Server fehlt/);
  });
  it("Container-Prüfung in einen anderen Teil → rot", () => {
    const wf = kopie();
    const [t, i] = schritt(wf, (s) => lauf(s) === "npm run pruefung:rechte");
    const [s] = wf.jobs[t].steps.splice(i, 1);
    wf.jobs[TEILE.find((x) => x !== t)].steps.push(s);
    expect(aufteilungPruefen(wf).join("\n")).toMatch(/nutzt Zustand des Bild-Teils/);
  });
  it("Einstieg ohne npm ci → rot; Teil fehlt → rot; Job mit eigenem name: → rot", () => {
    const a = kopie(); a.jobs["pruefen-b"].steps.splice(2, 1);
    expect(aufteilungPruefen(a).join("\n")).toMatch(/pruefen-b: Einstieg/);
    const b = kopie(); delete b.jobs["pruefen-c"];
    expect(aufteilungPruefen(b).length).toBeGreaterThan(0);
    const c = kopie(); c.jobs["pruefen-a"].name = "Prüfen A";
    expect(aufteilungPruefen(c).join("\n")).toMatch(/Check-Run-Namen/);
  });
  it("der alte Einzeljob `pruefen` (Stand vor dem Pilot) → rot", () => {
    const wf = kopie();
    const steps = [...wf.jobs["pruefen-a"].steps, ...wf.jobs["pruefen-b"].steps.slice(3), ...wf.jobs["pruefen-c"].steps.slice(3)];
    wf.jobs = { pruefen: { "runs-on": "ubuntu-latest", "timeout-minutes": 40, env: wf.jobs["pruefen-c"].env, steps }, "browser-abnahme": wf.jobs["browser-abnahme"] };
    expect(aufteilungPruefen(wf).join("\n")).toMatch(/erwartet/);
  });
});
