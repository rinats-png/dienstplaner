// WEBSITE-W1: Die Quelle der oeffentlichen Website (website/) baut ohne Netz,
// deterministisch und byte-gleich zur Pruefsummenliste website/DIST-SHA256.
// Gebaut wird nur in Temp-Verzeichnisse (CENTRIC_OUT), nie in den Repo-Baum.
// Ohne Python 3 laufen die Bauproben lokal als skip (Hinweis: WEBSITE_PYTHON); in der CI
// (Umgebungsvariable CI gesetzt) ist fehlendes Python ein Fehler, kein stilles Ueberspringen
// (e2e/website.mjs, bauModus). Die Dateiproben laufen immer.
import { describe, it, expect } from "vitest";
import { pythonFinden, bauModus, PYTHON_FEHLT_TEXT } from "../e2e/website.mjs";
import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, relative, sep } from "node:path";

const WURZEL = resolve(import.meta.dirname, "..");
const WEB = join(WURZEL, "website");
const LISTE = join(WEB, "DIST-SHA256");

const PY = pythonFinden();
const MODUS = bauModus(PY);
/* lauf: normal; fehler (kein Python in der CI): jede Bauprobe schlägt mit klarem Text fehl; skip: lokal übersprungen. */
const bauprobe = MODUS === "lauf" ? it
  : MODUS === "fehler" ? (name) => it(name, () => { throw new Error(PYTHON_FEHLT_TEXT); })
    : it.skip;

function dateien(wurzel) {
  const aus = [];
  const geh = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) geh(p);
      else aus.push(p);
    }
  };
  geh(wurzel);
  return aus.map((p) => relative(wurzel, p).split(sep).join("/")).sort();
}
function sha(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}
function summen(wurzel) {
  return Object.fromEntries(dateien(wurzel).map((f) => [f, sha(join(wurzel, f))]));
}
function liste() {
  const m = {};
  for (const z of readFileSync(LISTE, "utf8").split("\n").filter(Boolean)) {
    const t = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(z);
    if (!t) throw new Error(`Zeile in DIST-SHA256 ist falsch: ${z}`);
    m[t[2]] = t[1];
  }
  return m;
}
function bauen(quelle, ziel) {
  const env = { ...process.env, CENTRIC_OUT: ziel, PYTHONDONTWRITEBYTECODE: "1" };
  delete env.CENTRIC_APP;
  delete env.CENTRIC_WEBSITE;
  const r = spawnSync(PY, ["-B", "-I", join(quelle, "build.py")], { env, cwd: tmpdir(), encoding: "utf8" });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
}
function abzug() {
  // Dateiname, Groesse und Aenderungszeit unter website/ plus die Namen im Repo-Wurzelordner.
  const web = dateien(WEB).map((f) => {
    const s = statSync(join(WEB, f));
    return `${f}|${s.size}|${s.mtimeMs}`;
  });
  return { web, wurzel: readdirSync(WURZEL).sort() };
}
function tmp(pre) {
  return mkdtempSync(join(tmpdir(), pre));
}

describe("website-quelle: Dateien", () => {
  it("website/ ist da und enthaelt Generator, Schriften, Drei.js und Pruefsummenliste", () => {
    for (const f of ["build.py", "README.md", "README-QUELLE.md", "DIST-SHA256", "assets/vendor/three.min.js", "assets/fonts/Jura-Light.ttf"]) {
      expect(existsSync(join(WEB, f)), f).toBe(true);
    }
  });

  it("kein Bauergebnis und keine Datei ueber 5 MB in website/", () => {
    const alle = dateien(WEB);
    expect(alle.filter((f) => f.startsWith("dist/") || f.includes("__pycache__"))).toEqual([]);
    for (const f of alle) expect(statSync(join(WEB, f)).size, f).toBeLessThan(5 * 1024 * 1024);
  });

  it("DIST-SHA256 ist gueltig: 32 Dateien, sortiert, LF, keine Pfade nach draussen", () => {
    const roh = readFileSync(LISTE, "utf8");
    expect(roh.includes("\r")).toBe(false);
    const m = liste();
    const namen = Object.keys(m);
    expect(namen.length).toBe(32);
    expect(namen).toEqual([...namen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (const n of namen) expect(n.startsWith("/") || n.includes("..")).toBe(false);
  });

  it("build.py importiert nur Standardmodule ohne Netzzugriff", () => {
    const q = readFileSync(join(WEB, "build.py"), "utf8");
    const module = [...q.matchAll(/^\s*(?:import|from)\s+([A-Za-z0-9_., ]+?)(?:\s+import\b.*)?$/gm)]
      .flatMap((t) => t[1].split(",").map((s) => s.trim().split(".")[0]));
    const erlaubt = new Set(["base64", "datetime", "json", "math", "os", "re", "shutil", "sys"]);
    expect(module.filter((x) => !erlaubt.has(x))).toEqual([]);
    expect(/urllib|socket|http\.client|requests|subprocess/.test(q)).toBe(false);
  });
});

describe("website-quelle: Bau", () => {
  bauprobe("baut zweimal gleich und byte-gleich zur Liste, ohne in den Repo-Baum zu schreiben", () => {
    const vorher = abzug();
    const a = tmp("web-a-");
    const b = tmp("web-b-");
    try {
      bauen(WEB, a);
      bauen(WEB, b);
      const sa = summen(a);
      expect(summen(b)).toEqual(sa);
      expect(sa).toEqual(liste());
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
    expect(abzug()).toEqual(vorher);
    expect(existsSync(join(WEB, "dist"))).toBe(false);
    expect(existsSync(join(WEB, "__pycache__"))).toBe(false);
  });

  bauprobe("Mutation: geaenderte Quelle (build.py oder Asset) wird von der Liste erkannt", () => {
    const q = tmp("web-q-");
    const o1 = tmp("web-o1-");
    const o2 = tmp("web-o2-");
    try {
      cpSync(WEB, q, { recursive: true });
      const bp = join(q, "build.py");
      const roh = readFileSync(bp, "utf8");
      const neu = roh.replace("Dienstplanung für rotierende Schichtbetriebe", "Dienstplanung für rotierende Schichtbetriebe!");
      expect(neu).not.toBe(roh);
      writeFileSync(bp, neu);
      bauen(q, o1);
      const s1 = summen(o1);
      const l = liste();
      expect(Object.keys(s1).filter((f) => s1[f] !== l[f]).length).toBeGreaterThan(0);

      writeFileSync(bp, roh);
      const lic = join(q, "assets", "vendor", "three.LICENSE.txt");
      writeFileSync(lic, `${readFileSync(lic, "utf8")}x`);
      bauen(q, o2);
      const s2 = summen(o2);
      expect(s2["assets/vendor/three.LICENSE.txt"]).not.toBe(l["assets/vendor/three.LICENSE.txt"]);
    } finally {
      for (const d of [q, o1, o2]) rmSync(d, { recursive: true, force: true });
    }
  });
});
