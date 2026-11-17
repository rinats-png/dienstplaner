/* ==========================================================================
   WP-33 Rest: Vertrag der axe-Flächen der Playwright-Suite (e2e/weitere-flaechen.mjs), ohne Browser.
   Ohne diese Prüfung scheitert ein umbenannter Navigationseintrag erst im CI-Job browser-abnahme.
   Geprüft: eindeutige Namen, bekannte Rolle der Suite, Navigationseintrag existiert, Ausnahmen in e2e/axe-ausnahmen.json nennen nur bekannte Flächen (kein Platzhalter „*“).
   Rein deterministisch: kein Datum, keine Uhr, kein Netz.
   Aufruf: npx vitest run pruefungen/e2e-flaechen.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BEREICHE } from "../src/app/navigation.js";
import { ROLLEN } from "../e2e/umgebung.mjs";
import { WEITERE_FLAECHEN } from "../e2e/weitere-flaechen.mjs";
import { ABNAHME_B_FLAECHEN } from "../e2e/abnahme-b-flaechen.mjs";

const EINTRAEGE = BEREICHE.flatMap((b) => b.views);
const AUSNAHMEN = JSON.parse(readFileSync(new URL("../e2e/axe-ausnahmen.json", import.meta.url), "utf8")).ausnahmen;

describe("WP-33 Rest: weitere axe-Flächen", () => {
  it("Flächen sind nicht leer und eindeutig benannt", () => {
    expect(WEITERE_FLAECHEN.length).toBeGreaterThan(0);
    const namen = WEITERE_FLAECHEN.map((f) => f[0]);
    expect(new Set(namen).size).toBe(namen.length);
    for (const n of namen) expect(n).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("keine Fläche doppelt zu den Flächen der Abnahme B und der Grundsuite", () => {
    const grund = ["anmeldung", "einstellungen-leitung", "plan-mitarbeiter", "plan-subplaner", "plan-planer", "plan-leitung",
      "plan-betriebsrat", ...Object.values(ABNAHME_B_FLAECHEN)];
    for (const [n] of WEITERE_FLAECHEN) expect(grund, n).not.toContain(n);
  });

  it("Rolle gehört zur Suite und der Navigationseintrag besteht", () => {
    for (const [flaeche, rolle, ansicht] of WEITERE_FLAECHEN) {
      expect(ROLLEN, `${flaeche}: Rolle`).toContain(rolle);
      expect(EINTRAEGE.filter(([, name]) => name === ansicht).length, `${flaeche}: Eintrag „${ansicht}“`).toBe(1);
    }
  });

  it("Ansichtsname trifft genau einen Eintrag (wie geheZu: voller Name, optional mit Zähler)", () => {
    /* geheZu() sucht den Eintrag per Teiltext und schränkt dann auf genau diesen Namen (mit Zähler) ein. */
    for (const [flaeche, , ansicht] of WEITERE_FLAECHEN) {
      expect(EINTRAEGE.filter(([, name]) => new RegExp(`^\s*${ansicht}\s*\d*\s*$`).test(name)).length, flaeche).toBe(1);
    }
  });

  it("Ausnahmen nennen nur bekannte Flächen und keinen Platzhalter", () => {
    const bekannt = new Set(["anmeldung", "einstellungen-leitung", "plan-mitarbeiter", "plan-subplaner", "plan-planer",
      "plan-leitung", "plan-betriebsrat", ...Object.values(ABNAHME_B_FLAECHEN), ...WEITERE_FLAECHEN.map((f) => f[0])]);
    for (const a of AUSNAHMEN) {
      expect(bekannt.has(a.flaeche), `Fläche ${a.flaeche}`).toBe(true);
      expect(a.flaeche, "kein Platzhalter").not.toBe("*");
    }
  });
});
