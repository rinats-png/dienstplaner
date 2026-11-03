/* ==========================================================================
   ACC45-STATUS — eine Quelle, keine abweichenden Zahlen

   docs/acc45/work-packages.json ist die einzige Quelle für Pakete, Status,
   Statusstufen, Aufwand und Abhängigkeiten. Diese Prüfung schlägt fehl, wenn
     - die Quelle ungültig ist (Schema, unbekannte Abhängigkeit, Zyklus,
       Statusstufe ohne Beleg, INTEGRATED ohne Merge-Beleg, produktiv ohne DONE),
     - der AUTO-Block in STATUS.md, DEPENDENCIES.md (Graph und Tabelle),
       die AUTO-Blöcke in GESAMTPLAN.md, docs/acc45/ROADMAP.md oder die Zahlen
       in docs/ROADMAP.md von der Quelle abweichen,
     - die Prognose nicht deterministisch oder nicht monoton ist.
   Beheben: Quelle ändern, dann node werkzeug/acc45-backlog.mjs status-schreiben.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATEIEN = ["docs/acc45/work-packages.json", "docs/acc45/STATUS.md", "docs/acc45/DEPENDENCIES.md",
  "docs/acc45/GESAMTPLAN.md", "docs/acc45/ROADMAP.md", "docs/ROADMAP.md"];
let BL, tmp;

beforeAll(async () => {
  BL = await import("../werkzeug/acc45-backlog.mjs");
  tmp = await mkdtemp(path.join(tmpdir(), "centric-acc45-status-"));
});
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });

/** Kopie der beteiligten Dateien in einen eigenen Ordner (nie das Repo verändern). */
async function kopie(name) {
  const w = path.join(tmp, name);
  for (const d of DATEIEN) {
    await mkdir(path.dirname(path.join(w, d)), { recursive: true });
    await copyFile(path.join(REPO, d), path.join(w, d));
  }
  return w;
}
const ersetze = async (w, datei, alt, neu) => {
  const p = path.join(w, datei);
  const t = await readFile(p, "utf8");
  expect(t.includes(alt), `${datei} enthält „${alt}“`).toBe(true);
  await writeFile(p, t.replace(alt, neu));
};
const jsonAendern = async (w, f) => {
  const p = path.join(w, "docs/acc45/work-packages.json");
  const j = JSON.parse(await readFile(p, "utf8"));
  f(j);
  await writeFile(p, JSON.stringify(j, null, 2));
};

describe("Repo-Stand: Quelle gültig, alle erzeugten Zahlen passen", () => {
  it("keine Abweichung zwischen work-packages.json und STATUS/DEPENDENCIES/GESAMTPLAN/ROADMAPs", () => {
    expect(BL.abweichungen(REPO)).toEqual([]);
  });

  it("jede Datei hat ihre AUTO-Marker, die Quelle hat alle Stränge und Pflichtfelder", async () => {
    for (const b of BL.AUTO_BLOECKE) {
      const t = await readFile(path.join(REPO, b.datei), "utf8");
      expect(t, b.datei).toContain(`<!-- AUTO:BEGIN${b.name ? ` ${b.name}` : ""} -->`);
      expect(t, b.datei).toContain(`<!-- AUTO:END${b.name ? ` ${b.name}` : ""} -->`);
    }
    const q = BL.quelleLesen();
    expect(q.schema).toBe(2);
    const straenge = new Set(q.pakete.map((p) => p.strang));
    for (const s of BL.STRAENGE) expect(straenge.has(s), s).toBe(true);
    for (const p of q.pakete) {
      for (const f of ["id", "titel", "strang", "prio", "aufwandPT", "abhaengigkeiten", "status", "stufen"]) expect(p, `${p.id}.${f}`).toHaveProperty(f);
      expect(Object.keys(p.stufen)).toEqual([...BL.STUFEN]);
    }
  });

  it("Ehrlichkeit: Staging, Freigabe, Produktion nur mit Beleg; integriert nur mit Merge-Beleg (PR)", () => {
    const q = BL.quelleLesen();
    for (const p of q.pakete) {
      if (p.stufen.integriert.wert === true) expect(p.stufen.integriert.beleg, p.id).toMatch(/#\d+/);
      for (const s of ["stagingGeprueft", "fachlichFreigegeben", "produktiv"])
        if (p.stufen[s].wert !== false) expect(p.stufen[s].beleg, `${p.id}.${s}`).toBeTruthy();
    }
    /* Heute belegt produktiv: nur WP-01 (H8+) und WP-08 (lesende Prüfung). */
    expect(q.pakete.filter((p) => p.stufen.produktiv.wert === true).map((p) => p.id).sort()).toEqual(["WP-01", "WP-08"]);
  });

  it("öffentliches Repo: keine lokalen Felder, keine Mailadressen oder IP-Adressen in der Quelle", async () => {
    const t = await readFile(path.join(REPO, "docs/acc45/work-packages.json"), "utf8");
    for (const f of BL.LOKALE_FELDER) expect(t).not.toContain(`"${f}"`);
    expect(t).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    expect(t).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });

  it("Kommandozeile: pruefen gibt 0 zurück; kritischer-pfad und prognose laufen", () => {
    const lauf = (...a) => spawnSync(process.execPath, [path.join(REPO, "werkzeug", "acc45-backlog.mjs"), ...a], { cwd: REPO, encoding: "utf8" });
    const p = lauf("pruefen");
    expect(p.status, p.stdout + p.stderr).toBe(0);
    const k = lauf("kritischer-pfad");
    expect(k.status).toBe(0);
    expect(k.stdout).toMatch(/^gemeinsam: .+ PT$/m);
    expect(lauf("kritischer-pfad", "gibt-es-nicht").status).toBe(2);
    const g = lauf("prognose");
    expect(g.status).toBe(0);
    expect(g.stdout).toMatch(/^C: /m);
  });
});

describe("Abweichungen werden erkannt (Kopie, nie im Repo)", () => {
  it("Kopie ohne Änderung: keine Abweichung", async () => {
    expect(BL.abweichungen(await kopie("gleich"))).toEqual([]);
  });

  it("Zahl im STATUS-Block von Hand geändert → STATUS.md weicht ab", async () => {
    const w = await kopie("status");
    await ersetze(w, "docs/acc45/STATUS.md", "**Pakete gesamt:** ", "**Pakete gesamt:** 1");
    expect(BL.abweichungen(w)).toEqual(["docs/acc45/STATUS.md: weicht von work-packages.json ab"]);
  });

  it("Kante im DEPENDENCIES-Graph von Hand entfernt → DEPENDENCIES.md weicht ab", async () => {
    const w = await kopie("graph");
    const t = await readFile(path.join(w, "docs/acc45/DEPENDENCIES.md"), "utf8");
    const kante = t.split("\n").find((z) => /^ {2}\S+ --> \S+$/.test(z));
    expect(kante).toBeTruthy();
    await writeFile(path.join(w, "docs/acc45/DEPENDENCIES.md"), t.replace(`${kante}\n`, ""));
    expect(BL.abweichungen(w)).toEqual(["docs/acc45/DEPENDENCIES.md: weicht von work-packages.json ab"]);
  });

  it("Zahlen in docs/ROADMAP.md geändert → ROADMAP weicht ab; Prosa außerhalb des Blocks ist frei", async () => {
    const w = await kopie("roadmap");
    await ersetze(w, "docs/ROADMAP.md", "**Leitsatz:**", "**Leitsatz (geändert):**");
    expect(BL.abweichungen(w)).toEqual([]);
    const t = await readFile(path.join(w, "docs/ROADMAP.md"), "utf8");
    const block = t.slice(t.indexOf("<!-- AUTO:BEGIN entwicklung -->"), t.indexOf("<!-- AUTO:END entwicklung -->"));
    const zahl = block.match(/\d+ Pakete/)[0];
    await writeFile(path.join(w, "docs/ROADMAP.md"), t.replace(zahl, `9${zahl}`));
    expect(BL.abweichungen(w)).toEqual(["docs/ROADMAP.md: weicht von work-packages.json ab"]);
  });

  it("AUTO-Marker entfernt → gemeldet", async () => {
    const w = await kopie("marker");
    await ersetze(w, "docs/acc45/ROADMAP.md", "<!-- AUTO:END rechnung -->", "");
    expect(BL.abweichungen(w)).toContain("docs/acc45/ROADMAP.md: AUTO-Block „rechnung“ fehlt");
  });

  it("Aufwand in der Quelle geändert, ohne neu zu erzeugen → alle abhängigen Dateien weichen ab", async () => {
    const w = await kopie("aufwand");
    await jsonAendern(w, (j) => { j.pakete.find((p) => p.id === "WP-39").aufwandPT = { min: 40, max: 50 }; });
    const f = BL.abweichungen(w);
    for (const d of ["docs/acc45/work-packages.json", "docs/acc45/DEPENDENCIES.md", "docs/acc45/STATUS.md", "docs/acc45/GESAMTPLAN.md",
      "docs/acc45/ROADMAP.md", "docs/ROADMAP.md"]) expect(f, d).toContain(`${d}: weicht von work-packages.json ab`);
  });

  it("Statusschönung in der Quelle → Quelle ungültig", async () => {
    const w = await kopie("schoenung");
    await jsonAendern(w, (j) => {
      j.pakete.find((p) => p.id === "WP-16").status = "INTEGRATED";                     // ohne Merge-Beleg
      j.pakete.find((p) => p.id === "WP-02").stufen.produktiv = { wert: true, beleg: "x" }; // produktiv ohne DONE
      j.pakete.find((p) => p.id === "WP-19.0").stufen.stagingGeprueft = { wert: true, beleg: null };
    });
    const f = BL.abweichungen(w).filter((x) => x.startsWith("Quelle:"));
    expect(f).toContain("Quelle: WP-16: INTEGRATED ohne Stufe integriert=true");
    expect(f).toContain("Quelle: WP-02: produktiv=true ohne DONE");
    expect(f).toContain("Quelle: WP-19.0: Stufe stagingGeprueft ohne Beleg");
  });
});

describe("pruefeQuelle: Graph und Schema", () => {
  const paket = (id, o = {}) => ({ id, titel: id, strang: "acc45", prio: "P1", aufwandPT: { min: 1, max: 2 }, abhaengigkeiten: [], status: "BLOCKED", ...o });

  it("unbekannte Abhängigkeit, Zyklus, falscher Strang/Status, Spanne, READY mit offener Abhängigkeit", () => {
    const f = BL.pruefeQuelle(BL.paketeAus([
      paket("A", { abhaengigkeiten: ["B"] }), paket("B", { abhaengigkeiten: ["A"] }), paket("C", { abhaengigkeiten: ["X"] }),
      paket("D", { strang: "sonst" }), paket("E", { status: "VERIFIED" }), paket("F", { aufwandPT: { min: 3, max: 1 } }),
      paket("G", { status: "READY", abhaengigkeiten: ["C"] }), paket("H", { strang: "extern" }), paket("I", { konfliktzonen: ["main.js"] }),
    ]));
    for (const t of ["Zyklus: A → B → A", "C: Abhängigkeit X unbekannt", "D: strang sonst", "E: status VERIFIED", "F: Spanne ungültig",
      "G: READY, aber Abhängigkeiten offen: C", "H: extern ohne wartezeitAT", "I: Konfliktzone main.js unbekannt"])
      expect(f.some((x) => x.startsWith(t)), t).toBe(true);
  });

  it("altes Tupelformat (Array P bis 2026-11-03) wird weiter gelesen", () => {
    const [p] = BL.paketeAus([["WP-77", "Alt", "P2", 2, [], "B", "READY", "Akz", "Tests", "x.mjs"]]);
    expect(p).toMatchObject({ id: "WP-77", titel: "Alt", strang: "acc45", aufwandPT: { min: 2, max: 2 }, status: "READY" });
    expect(p.branch).toMatch(/^acc45\/infra\/wp77-/);
    expect(BL.P.length).toBe(BL.quelleLesen().pakete.length);
  });
});

describe("Prognose: Simulation, Konfliktzonen, Kalender", () => {
  const sz = { agenten: 2, ptJeAgentTag: 1, minDauerAT: 0.5, pt: "min", aufschlag: 1, warte: "min", appJsxNachWP39Frei: false };
  const p = (id, o = {}) => ({ id, titel: id, strang: "acc45", prio: "P1", aufwandPT: { min: 2, max: 2 }, abhaengigkeiten: [], status: "READY", konfliktzonen: [], ...o });

  it("gleiche Konfliktzone → nacheinander; verschiedene → parallel; extern belegt keinen Agenten", () => {
    const zone = BL.simulieren(BL.paketeAus([p("A", { konfliktzonen: ["App.jsx"] }), p("B", { konfliktzonen: ["App.jsx"] })]), () => true, sz);
    expect(zone.T).toBe(4);
    const frei = BL.simulieren(BL.paketeAus([p("A", { konfliktzonen: ["App.jsx"] }), p("B", { konfliktzonen: ["daten.mjs"] })]), () => true, sz);
    expect(frei.T).toBe(2);
    const ext = BL.simulieren(BL.paketeAus([p("A"), p("B"), p("E", { strang: "extern", wartezeitAT: { min: 3, max: 5 } })]), () => true, sz);
    expect(ext.T).toBe(3);
    const kette = BL.simulieren(BL.paketeAus([p("A"), p("B", { abhaengigkeiten: ["A"] }), p("C", { status: "INTEGRATED" })]), () => true, sz);
    expect(kette.T).toBe(4);
  });

  it("Arbeitstage: Tag 1 = Start, Wochenende und Feiertage übersprungen", () => {
    expect(BL.arbeitstag("2026-11-04", 1)).toBe("2026-11-04");
    expect(BL.arbeitstag("2026-11-04", 3)).toBe("2026-11-06");
    expect(BL.arbeitstag("2026-11-04", 4)).toBe("2026-11-09");
    expect(BL.arbeitstag("2026-12-23", 2, ["2026-12-24", "2026-12-25"])).toBe("2026-12-28");
  });

  it("Repo-Prognose: deterministisch, optimistisch ≤ realistisch ≤ Probleme, A ≤ B ≤ C, C1 ≤ C", () => {
    const pakete = BL.paketeAus();
    const a = BL.quelleLesen().annahmen;
    const e1 = BL.prognosen(pakete, a);
    const e2 = BL.prognosen(pakete, a);
    for (const u of ["A", "B", "C"]) {
      expect(e1[u].optimistisch.at).toBe(e2[u].optimistisch.at);
      expect(e1[u].optimistisch.at).toBeLessThanOrEqual(e1[u].realistisch.at);
      expect(e1[u].realistisch.at).toBeLessThanOrEqual(e1[u].probleme.at);
    }
    for (const s of ["optimistisch", "realistisch", "probleme"]) {
      expect(e1.A[s].at).toBeLessThanOrEqual(e1.B[s].at);
      expect(e1.B[s].at).toBeLessThanOrEqual(e1.C[s].at);
      expect(e1.C[s].c1).toBeLessThanOrEqual(e1.C[s].at);
      expect(e1[s === "optimistisch" ? "A" : "B"][s].at).toBeGreaterThanOrEqual(Math.floor(e1[s === "optimistisch" ? "A" : "B"][s].untergrenzeArbeit));
    }
  });
});
