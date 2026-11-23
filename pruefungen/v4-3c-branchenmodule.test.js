/* ==========================================================================
   V4-3c (Schnitt Branchenmodule) — Bestandsaufnahme der fünf Moduldateien ohne eigene Form

   Befund: bereichsplan, geteilterdienst, kontimodelle, maschinenqual, pflegequal haben laut Inventar Form
   „ohne V4-Form“ (kein Form-, kein Farbliteral; Listen, Tabellen und Definitionslisten im Rahmen von kern.jsx).
   Alle fünf sind in der Basis-Fixture des V4-3b-Schnitts „Branchenmodule“ byte-gepinnt (SHA-256). Eine Änderung
   bräuchte eine neue Basis-Festlegung und eine Gestaltungsentscheidung (welcher Baustein, welche sichtbare Form).
   Deshalb ändert dieser Schnitt keine Moduldatei; der Test hält Befund, Pin und die ehrliche SSOT-Notiz fest.
   Keine Uhr, kein Netz.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventar } from "../werkzeug/v4-inventar.mjs";
import { ladeBasisFixture, sha256 } from "./v4-radiusstufen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8").replace(/\r\n/g, "\n");
const FUENF = ["bereichsplan", "geteilterdienst", "kontimodelle", "maschinenqual", "pflegequal"].map((n) => `src/module/${n}.jsx`);

describe("V4-3c Branchenmodule: Bestandsaufnahme", () => {
  it("Inventar: genau diese fünf Moduldateien haben Form „ohne V4-Form“, ohne Form- und Farbliteral", async () => {
    const inv = await inventar();
    const module = inv.eintraege.filter((x) => x.datei.startsWith("src/module/") && x.sichtbar && x.gruppe === "Branchenmodul");
    expect(module.filter((x) => x.form === "ohne V4-Form").map((x) => x.datei).sort()).toEqual(FUENF);
    for (const e of module.filter((x) => FUENF.includes(x.datei))) {
      expect([e.formLiterale, e.rgb, e.hex, e.v4Baustein, e.bausteinImport]).toEqual([0, 0, 0, 0, false]);
    }
  }, 60000);

  it("Pin: alle fünf stehen in der Basis-Fixture und sind unverändert (SHA-256 gleich)", () => {
    const fx = ladeBasisFixture(WURZEL).schnitte.Branchenmodule;
    for (const d of FUENF) {
      expect(fx.dateien[d], d).toBeTruthy();
      expect(sha256(lies(d)), `${d} byte-gleich der gepinnten Basis`).toBe(fx.dateien[d].sha256);
    }
  });

  it("SSOT V4-3c: BLOCKED, keine Stufe belegt, Notiz nennt die fünf Dateien, den Pin und die Empfehlung", () => {
    const j = JSON.parse(lies("docs/acc45/work-packages.json"));
    const p = j.pakete.find((x) => x.id === "V4-3c");
    expect(p.status).toBe("BLOCKED");
    expect(Object.values(p.stufen).every((s) => s.wert === false)).toBe(true);
    for (const n of ["bereichsplan", "geteilterdienst", "kontimodelle", "maschinenqual", "pflegequal"]) expect(p.notiz).toContain(n);
    expect(p.notiz).toMatch(/gepinnt/);
    expect(p.notiz).toMatch(/Empfehlung/);
    expect(p.notiz).toMatch(/V4-3d/);
  });
});
