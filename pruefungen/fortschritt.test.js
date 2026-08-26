/* ==========================================================================
   FORTSCHRITT — die Stufe aus dem Bestand

   Die Stufen folgen den vier Einrichtungsschritten der Website. Geprüft
   wird die Treppe von leer bis freigegeben und dass Unsinn 0 ergibt
   statt zu werfen.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { stufeBerechnen } from "../netlify/lib/fortschritt.mjs";

const grund = () => ({ mandanten: [{
  einheiten: [{ id: "e1" }],
  personen: [],
  zyklus: { tage: new Array(21).fill("-") },
  freigaben: {},
}] });

describe("Die Stufe", () => {
  it("beginnt bei 0 für den frisch angelegten Betrieb", () => {
    expect(stufeBerechnen(grund())).toBe(0);
  });
  it("steigt mit einer zweiten Einheit auf 1", () => {
    const b = grund(); b.mandanten[0].einheiten.push({ id: "e2" });
    expect(stufeBerechnen(b)).toBe(1);
  });
  it("steigt mit Personal auf 2", () => {
    const b = grund(); b.mandanten[0].personen.push({ id: "p1" });
    expect(stufeBerechnen(b)).toBe(2);
  });
  it("steigt mit Diensten im Zyklus auf 3 — aber nur mit Personal", () => {
    const b = grund(); b.mandanten[0].zyklus.tage[0] = "F";
    expect(stufeBerechnen(b)).toBe(0);
    b.mandanten[0].personen.push({ id: "p1" });
    expect(stufeBerechnen(b)).toBe(3);
  });
  it("steigt mit einer Freigabe auf 4", () => {
    const b = grund();
    b.mandanten[0].personen.push({ id: "p1" });
    b.mandanten[0].zyklus.tage[0] = "F";
    b.mandanten[0].freigaben = { "2026-08": true };
    expect(stufeBerechnen(b)).toBe(4);
  });
  it("ergibt 0 für Unsinn, statt zu werfen", () => {
    expect(stufeBerechnen(null)).toBe(0);
    expect(stufeBerechnen({})).toBe(0);
    expect(stufeBerechnen({ mandanten: "kaputt" })).toBe(0);
  });
});
