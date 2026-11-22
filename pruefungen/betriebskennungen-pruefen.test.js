// K4-Zusatzpunkt Betriebskennungen (Delta-Review #471 H5): deploy/betriebskennungen-pruefen.mjs liest die Ablage einer
// Wegwerfkopie und meldet je Raum die Zahl der Betriebe und die Verteilung von `typeof m.id`. Nur LESEN, kein Netz.
// Exit 0 nur, wenn mindestens ein Raum gelesen wurde und alle Kennungen Zeichenketten sind; 1 sonst; 3 bei Isolation.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { saeen } from "./migrationsprobe-saat.mjs";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = join(WURZEL, "deploy", "betriebskennungen-pruefen.mjs");

let tmp;
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), "betriebskennungen-")); });
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

function starten(daten, env = {}) {
  const e = { ...process.env, CENTRIC_APP: WURZEL };
  delete e.CENTRIC_BASIS; delete e.CENTRIC_DATEN;
  Object.assign(e, env);
  return spawnSync(process.execPath, [SKRIPT, ...(daten === undefined ? [] : [daten])], { env: e, encoding: "utf8", cwd: tmp });
}

/** Alle Dateien unter `d` mit Größe und Änderungszeit (Beleg: das Skript schreibt nichts). */
function abbild(d) {
  const aus = [];
  const gehen = (x) => { for (const n of readdirSync(x, { withFileTypes: true })) {
    const p = join(x, n.name);
    if (n.isDirectory()) { aus.push(`${p}/`); gehen(p); } else { const s = statSync(p); aus.push(`${p} ${s.size} ${s.mtimeMs}`); }
  } };
  gehen(d);
  return aus.sort();
}

function anlegen(name, raeume) {
  const daten = join(tmp, name, "scratchpad", "daten-mig-" + name);
  mkdirSync(daten, { recursive: true });
  if (raeume) saeen(daten, raeume);
  return daten;
}

describe("betriebskennungen-pruefen", () => {
  it("alle Kennungen Zeichenketten: je Raum Anzahl und Verteilung, Exit 0, keine Datei geändert", () => {
    const daten = anlegen("gut", { "raum-a": [{ id: "m-1", name: "A" }, { id: "m-2", name: "B" }], "raum-b": [{ id: "m-9", name: "C" }] });
    const vorher = abbild(daten);
    const r = starten(daten);
    expect(r.stdout).toContain("raum-a: 2 Betrieb(e), typeof id: string=2");
    expect(r.stdout).toContain("raum-b: 1 Betrieb(e), typeof id: string=1");
    expect(r.stdout).toContain("BETRIEBSKENNUNGEN: 2 Raum/Räume gelesen, alle Kennungen Zeichenketten");
    expect(r.status).toBe(0);
    expect(abbild(daten)).toEqual(vorher);
  });
  it("Zahl-Kennung oder fehlende Kennung: Verteilung zeigt sie, Exit 1", () => {
    const daten = anlegen("zahl", { "raum-z": [{ id: "m-1", name: "A" }, { id: 7, name: "B" }] });
    const r = starten(daten);
    expect(r.stdout).toContain("NO-GO  raum-z: 2 Betrieb(e), typeof id: number=1, string=1");
    expect(r.stdout).toContain("1 Befund(e) — NO-GO");
    expect(r.status).toBe(1);
    const ohne = anlegen("ohne", { "raum-u": [{ id: "m-1", name: "A" }, { name: "C" }] });
    const u = starten(ohne);
    expect(u.stdout).toContain("NO-GO  raum-u: 2 Betrieb(e), typeof id: string=1, undefined=1");
    expect(u.status).toBe(1);
  });
  it("leere Ablage (0 Räume): Exit 1, nichts belegt", () => {
    const daten = anlegen("leer");
    const r = starten(daten);
    expect(r.stdout).toContain("BETRIEBSKENNUNGEN: 0 Raum/Räume gelesen");
    expect(r.status).toBe(1);
  });
  it("Isolation wie die Probe: Produktionspfad, fehlende Angabe, CENTRIC_BASIS → Exit 3", () => {
    for (const r of [starten("/data"), starten(undefined), starten(anlegen("basis"), { CENTRIC_BASIS: "https://app.example" })]) {
      expect(r.stdout).toContain("ABBRUCH Isolation");
      expect(r.status).toBe(3);
    }
  });
  it("Quelltext: kein Netz, kein Schreibweg der Ablage", () => {
    const q = readFileSync(SKRIPT, "utf8");
    expect(q).not.toMatch(/\bfetch\s*\(|node:(http|https|net|dgram)\b/);
    expect(q).not.toMatch(/\.(set|setJSON|setJSONWennNeu|delete)\s*\(|bestandSchreiben|writeFile|unlink|rename|mkdir/);
  });
});
