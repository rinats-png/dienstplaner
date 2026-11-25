// RST-5: Betriebskennungen-Probe am EXAKTEN Digest im Staging-Gate (Teil von S1). Das Gate-Skript
// deploy/sicherung/ci/widerrufbuch-staging.sh liest nach dem synthetischen 274bfa0-Altbestand und VOR dem ersten Start
// des Digest-Bilds die Betriebskennungen einer Wegwerfkopie mit dem Code des Digest-Bilds (nur lesend, ohne Netz).
// Keine Workflow-Änderung: der Workflow ruft das Skript schon auf. Nur synthetische Daten.
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saeen } from "./migrationsprobe-saat.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SH = readFileSync(path.join(WURZEL, "deploy/sicherung/ci/widerrufbuch-staging.sh"), "utf8").replace(/\r\n/g, "\n");
const tmp = mkdtempSync(path.join(tmpdir(), "rst5-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Befunde zur Verdrahtung der Probe im Gate-Skript; leer = in Ordnung. */
function befunde(sh) {
  const b = [];
  const i = sh.indexOf("kennungen_pruefen()");
  const alt = sh.indexOf('einmal "$ALT_BILD" altbestand');
  const erster = sh.indexOf("starten 1\n");
  const gut = sh.indexOf("bestanden S1");
  if (i < 0) return ["Betriebskennungen-Probe fehlt"];
  const fn = sh.slice(i, sh.indexOf("\n}\n", i));
  if (!/"\$BILD"/.test(fn) || /ALT_BILD/.test(fn)) b.push("Probe läuft nicht im Digest-Bild");
  if (!/--network none/.test(fn)) b.push("Probe ohne --network none");
  if (!/--read-only/.test(fn) || !/--cap-drop ALL/.test(fn)) b.push("Probe nicht gehärtet");
  if (!/CENTRIC_APP=\/app/.test(fn)) b.push("CENTRIC_APP nicht auf /app");
  if (!/scratchpad\/daten-mig-gate/.test(fn)) b.push("Isolationspfad scratchpad/daten-mig-* fehlt");
  if (/CENTRIC_BASIS/.test(fn)) b.push("CENTRIC_BASIS gesetzt (Isolation)");
  if (!/betriebskennungen-pruefen\.mjs/.test(fn) || !/migrationsprobe-regeln\.mjs/.test(fn)) b.push("Skripte nicht eingehängt");
  if (!/\|\|\s*fehl\b/.test(fn) && !/fehl "/.test(fn)) b.push("Fehlschlag bricht nicht ab");
  if (!/daten-kennungen|cp -a "\$T\/daten"/.test(fn)) b.push("keine Wegwerfkopie");
  const aufruf = sh.indexOf("kennungen_pruefen\n", i);
  if (aufruf < 0 || !(alt < aufruf && aufruf < erster && erster < gut)) b.push("Aufruf nicht zwischen Altbestand und erstem Start");
  if (gut < 0 || sh.indexOf("kennungen_pruefen\n", i) > gut) b.push("S1 vor der Probe bestätigt");
  return b;
}

describe("RST-5 Betriebskennungen am Digest (S1)", () => {
  it("das Gate-Skript verdrahtet die Probe richtig", () => {
    expect(befunde(SH)).toEqual([]);
  });

  it("die Probe liest den Gate-Altbestand (Betrieb mit Zeichenketten-Kennung) wie im Container: Exit 0", () => {
    const daten = path.join(tmp, "scratchpad", "daten-mig-gate");
    mkdirSync(daten, { recursive: true });
    saeen(daten, { "ci-staging": [{ id: "mc", name: "Haus CI Staging" }] });
    const e = { ...process.env, CENTRIC_APP: WURZEL }; delete e.CENTRIC_BASIS;
    const r = spawnSync(process.execPath, [path.join(WURZEL, "deploy/betriebskennungen-pruefen.mjs"), daten], { env: e, encoding: "utf8", cwd: tmp });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain("alle Kennungen Zeichenketten");
  });

  it("eine Zahl als Kennung macht die Probe rot (Exit 1)", () => {
    const daten = path.join(tmp, "scratchpad-neg", "scratchpad", "daten-mig-gate");
    mkdirSync(daten, { recursive: true });
    saeen(daten, { "ci-staging": [{ id: 7, name: "X" }] });
    const e = { ...process.env, CENTRIC_APP: WURZEL }; delete e.CENTRIC_BASIS;
    const r = spawnSync(process.execPath, [path.join(WURZEL, "deploy/betriebskennungen-pruefen.mjs"), daten], { env: e, encoding: "utf8", cwd: tmp });
    expect(r.status).toBe(1);
  });
});

describe("RST-5 Mutationen: jede Verletzung macht die Verdrahtung rot", () => {
  const mut = (von, nach, erwartet) => {
    expect(SH.includes(von), `Stelle fehlt: ${von}`).toBe(true);
    expect(befunde(SH.replace(von, nach)).join("\n")).toMatch(erwartet);
  };
  it("M-BILD: Probe im alten Bild statt im Digest-Bild", () => mut('--entrypoint node "$BILD" /ci/deploy', '--entrypoint node "$ALT_BILD" /ci/deploy', /Digest-Bild/));
  it("M-NETZ: ohne --network none", () => {
    const i = SH.indexOf("kennungen_pruefen()");
    const teil = SH.slice(i).replace("--network none", "");
    expect(befunde(SH.slice(0, i) + teil).join("\n")).toMatch(/network none/);
  });
  it("M-BASIS: CENTRIC_BASIS gesetzt", () => mut("-e CENTRIC_APP=/app", "-e CENTRIC_APP=/app -e CENTRIC_BASIS=http://x", /Isolation/));
  it("M-ABBRUCH: Fehlschlag wird verschluckt", () => mut("||\n    fehl \"S1: Betriebskennungen", "|| true\n    echo \"S1: Betriebskennungen", /bricht nicht ab/));
  it("M-AUFRUF: Aufruf entfällt", () => {
    expect(befunde(SH.replace(/^kennungen_pruefen\n/m, "")).join("\n")).toMatch(/Aufruf nicht/);
  });
  it("M-ORT: Aufruf erst nach dem ersten Start", () => {
    const o = SH.replace(/^kennungen_pruefen\n/m, "").replace("starten 1\n", "starten 1\nkennungen_pruefen\n");
    expect(befunde(o).join("\n")).toMatch(/Aufruf nicht/);
  });
  it("M-FEHLT: Funktion fehlt ganz", () => {
    expect(befunde(SH.replace("kennungen_pruefen()", "anders()")).join("\n")).toMatch(/fehlt/);
  });
});
