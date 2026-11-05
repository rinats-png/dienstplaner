/* ==========================================================================
   EINSTELLUNGEN MÜSSEN WIRKEN (V4 Phase 2)

   Befund beim Funktionstest der Einstellungen: „Dichte“ speicherte
   p.dichte, aber nichts las den Wert — die Umschaltung blieb wirkungslos;
   die Dichte kam nur aus lokalem Zustand des Kopfmenüs.

   Jetzt ist die Einstellung der Person die Quelle: Sie speist den Zustand
   (Effekt auf sitz.person.dichte), und das Kopfmenü schreibt sie zurück.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(import.meta.dirname, "..", "src/App.jsx"), "utf8");

describe("Dichte", () => {
  it("die Einstellung schreibt p.dichte (Einstellungen)", () => {
    expect(app).toContain('akt.setzeMeineEinstellung("dichte", v)');
  });
  it("die gespeicherte Dichte der Person speist den Zustand", () => {
    expect(app).toContain("const dichtePerson = sitz && sitz.person ? sitz.person.dichte : undefined;");
    expect(app).toMatch(/useEffect\(\(\) => \{ if \(dichtePerson === "kompakt" \|\| dichtePerson === "komfortabel"\) setDicht\(dichtePerson === "kompakt"\); \}, \[dichtePerson\]\);/);
  });
  it("das Kopfmenü schreibt die Wahl in die Einstellung zurück (eine Quelle)", () => {
    expect(app).toContain('akt.setzeMeineEinstellung("dichte", an ? "kompakt" : "komfortabel")');
  });
  it("die Klasse dicht hängt am Zustand", () => {
    expect(app).toContain('`sw-root${dicht ? " dicht" : ""}');
  });
});
