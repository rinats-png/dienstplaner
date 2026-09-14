/* ==========================================================================
   BEREITSTELLUNGSSKRIPT — zweimal laufen lassen, einmal anlegen

   werkzeug/zugaenge-anlegen.sh ist einmal zweimal gelaufen. Danach stand
   jeder Demobetrieb doppelt auf der Startseite, es gab zwei Betreibercodes
   und zwei Testbetriebe, und die Codes des ersten Laufs waren überschrieben.

   Geprüft wird gegen den echten Server (server.mjs) mit Wegwerfablage:
   Das Skript läuft zweimal hintereinander. Danach muss es genau einen
   Betreiber, drei Demozugänge und einen Testbetrieb geben — und die
   Ausgabedatei des ersten Laufs unverändert.

   Braucht bash, curl und jq — wie das Skript selbst.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ausfuehren = promisify(execFile);
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(WURZEL, "werkzeug", "zugaenge-anlegen.sh");
const PORT = 30000 + Math.floor(Math.random() * 20000);
const B = `http://127.0.0.1:${PORT}`;
const ADMIN = "probe-geheim";
const RAUM = "demo-schau";
let kind, statik, daten, arbeit, ausgabe = "";

/** Das Skript einmal laufen lassen; gibt Ausgabe, Fehlerausgabe und Status zurück. */
async function lauf(nr) {
  const datei = path.join(arbeit, `zugaenge-${nr}.txt`);
  try {
    const { stdout, stderr } = await ausfuehren("bash", [SKRIPT], {
      cwd: arbeit,
      env: { ...process.env, SITE: B, CENTRIC_ADMIN: ADMIN, RAUM, AUSGABE: datei },
    });
    return { status: 0, stdout, stderr, datei };
  } catch (e) {
    return { status: e.code ?? 1, stdout: e.stdout || "", stderr: e.stderr || "", datei };
  }
}

const uebersicht = async () => (await fetch(`${B}/einrichten/uebersicht?bestand=${RAUM}`,
  { headers: { authorization: `Bearer ${ADMIN}` } })).json();
const demos = async () => ((await (await fetch(`${B}/api/demos`)).json()).demos || []);

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-daten-"));
  arbeit = await mkdtemp(path.join(tmpdir(), "centric-skript-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Probe</title>");

  kind = spawn(process.execPath, ["server.mjs"], {
    cwd: WURZEL,
    env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: statik, CENTRIC_DATEN: daten,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "probe-pfeffer",
      NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  kind.stdout.on("data", (d) => { ausgabe += d; });
  kind.stderr.on("data", (d) => { ausgabe += d; });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${B}/gesund`).then((r) => r.ok).catch(() => false)) return;
    await new Promise((w) => setTimeout(w, 100));
  }
  throw new Error(`Server kam nicht hoch:\n${ausgabe}`);
}, 20000);

afterAll(async () => {
  if (kind && kind.exitCode === null) kind.kill("SIGKILL");
  await rm(statik, { recursive: true, force: true });
  await rm(daten, { recursive: true, force: true });
  await rm(arbeit, { recursive: true, force: true });
});

describe("Bereitstellungsskript", () => {
  let erster, zweiter, ersteDatei;

  it("legt beim ersten Lauf alles an", async () => {
    erster = await lauf(1);
    expect(erster.status, erster.stderr).toBe(0);
    expect(erster.stdout).toContain("5 angelegt, 0 übersprungen");
    ersteDatei = await readFile(erster.datei, "utf8");
    expect(ersteDatei).toContain("BETREIBERKONSOLE");
    expect(ersteDatei).toMatch(/Code:\s+[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    expect(ersteDatei).toContain("Ergebnis: 5 angelegt, 0 übersprungen.");
    /* Nur der Eigentümer darf die Codes lesen. */
    expect(((await stat(erster.datei)).mode & 0o777).toString(8)).toBe("600");

    const ue = await uebersicht();
    expect(ue.zugaenge.filter((z) => z.rolle === "betreiber" && !z.gesperrt)).toHaveLength(1);
    expect(ue.zugaenge.filter((z) => z.demo && !z.gesperrt)).toHaveLength(3);
    expect(ue.selbststarts).toHaveLength(1);
    expect(ue.selbststarts[0].name).toBe("Eigener Testbetrieb");
    expect(await demos()).toHaveLength(3);
  }, 30000);

  it("legt beim zweiten Lauf nichts mehr an", async () => {
    zweiter = await lauf(2);
    expect(zweiter.status, zweiter.stderr).toBe(0);
    expect(zweiter.stdout).toContain("0 angelegt, 5 übersprungen");
    const zweiteDatei = await readFile(zweiter.datei, "utf8");
    expect(zweiteDatei).toContain("bereits vorhanden");
    expect(zweiteDatei).not.toMatch(/Code:\s+[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);

    /* Der Kern: genau 1 · 3 · 1 — nicht 2 · 6 · 2. */
    const ue = await uebersicht();
    expect(ue.zugaenge.filter((z) => z.rolle === "betreiber" && !z.gesperrt)).toHaveLength(1);
    expect(ue.zugaenge.filter((z) => z.demo && !z.gesperrt)).toHaveLength(3);
    expect(ue.zugaenge).toHaveLength(4);
    expect(ue.selbststarts).toHaveLength(1);
    const liste = await demos();
    expect(liste).toHaveLength(3);
    /* Und keiner doppelt: je Betrieb genau ein Eintrag. */
    expect(new Set(liste.map((d) => d.betrieb)).size).toBe(3);
  }, 30000);

  it("überschreibt die Ausgabe des ersten Laufs nicht", async () => {
    expect(await readFile(erster.datei, "utf8")).toBe(ersteDatei);
    /* Ein Lauf auf eine vorhandene Datei bricht ab, bevor er etwas anlegt. */
    const dritter = await ausfuehren("bash", [SKRIPT], { cwd: arbeit,
      env: { ...process.env, SITE: B, CENTRIC_ADMIN: ADMIN, RAUM, AUSGABE: erster.datei } })
      .then(() => ({ status: 0 }), (e) => ({ status: e.code ?? 1, stderr: e.stderr || "" }));
    expect(dritter.status).not.toBe(0);
    expect(dritter.stderr).toContain("gibt es schon");
    expect(await readFile(erster.datei, "utf8")).toBe(ersteDatei);
  }, 30000);

  it("die Übersicht verrät weder Codes noch Prüfsummen", async () => {
    const text = JSON.stringify(await uebersicht());
    const codes = [...ersteDatei.matchAll(/Code:\s+([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThanOrEqual(4);
    for (const c of codes) expect(text).not.toContain(c);
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
  });

  it("legt nach einem Zurückziehen genau das Fehlende neu an", async () => {
    /* Der Betreiber zieht einen Demozugang über seine Kennung zurück. */
    const betreiberCode = ersteDatei.match(/BETREIBERKONSOLE\n\s+Code:\s+(\S+)/)[1];
    const anm = await (await fetch(`${B}/api/anmelden`, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zugangscode: betreiberCode }) })).json();
    expect(anm.token, JSON.stringify(anm)).toBeTruthy();
    const ziel = (await demos()).find((d) => d.betrieb === 1);
    const sp = await (await fetch(`${B}/api/zugang-sperren`, { method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${anm.token}` },
      body: JSON.stringify({ id: ziel.id }) })).json();
    expect(sp.gesperrt).toBe(1);
    expect(await demos()).toHaveLength(2);

    const vierter = await lauf(4);
    expect(vierter.status, vierter.stderr).toBe(0);
    expect(vierter.stdout).toContain("1 angelegt, 4 übersprungen");
    expect(vierter.stdout).toContain("angelegt: Demobetrieb Seniorenzentrum Lindenhof");
    const liste = await demos();
    expect(liste).toHaveLength(3);
    expect(liste.find((d) => d.betrieb === 1).id).not.toBe(ziel.id);
  }, 30000);
});
