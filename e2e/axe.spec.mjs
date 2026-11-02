/* Barrierefreiheit (axe-core) auf den Hauptansichten je Rolle.
   Vollständiger Befund je Ansicht: e2e/ergebnisse/axe/*.json (CI-Artefakt).
   Gate: nur neue critical-Verstöße (Liste der bekannten: e2e/axe-bekannt.json). */
import { test, mitSitzung, starten, ansicht, axePruefen } from "./hilfen.mjs";

/** [Name, Rolle, Weg zur Ansicht] — Desktop-Bildschirm. */
const ANSICHTEN = [
  ["anmeldung", null, async () => {}],
  ["leitung-start", "leitung", async () => {}],
  ["leitung-monatsplan", "leitung", (p) => ansicht(p, "Monatsplan", "plan")],
  ["planer-monatsplan", "planer", (p) => ansicht(p, "Monatsplan", "plan")],
  ["subplaner-lagebild", "subplaner", (p) => ansicht(p, "Lagebild", "lage")],
  ["betriebsrat-start", "betriebsrat", async () => {}],
  ["betriebsrat-monatsplan", "betriebsrat", (p) => ansicht(p, "Monatsplan", "plan")],
  ["betreiber-mandanten", "betreiber", async () => {}],
  ["mitarbeiter-heute", "mitarbeiter", async () => {}],
];

test.describe("Barrierefreiheit", () => {
  for (const [name, rolle, weg] of ANSICHTEN) {
    test(name, async ({ page }, testInfo) => {
      /* Desktop für alle; das Telefon zusätzlich für die Telefonansicht der Beschäftigten und die Anmeldung. */
      const telefonAnsicht = name === "mitarbeiter-heute" || name === "anmeldung";
      test.skip(!(testInfo.project.name === "desktop" || (testInfo.project.name === "telefon" && telefonAnsicht)),
        "axe läuft auf dem Desktop, für Telefonansichten zusätzlich am Telefon");
      if (rolle) {
        await mitSitzung(page, rolle);
        await starten(page, rolle);
        await weg(page);
      } else {
        await page.goto("/");
        await page.getByLabel("Zugangscode").waitFor();
      }
      /* Animationen der Startsequenz abwarten — sonst prüft axe halb durchsichtige Flächen. */
      await page.waitForTimeout(800);
      await axePruefen(page, testInfo, name);
    });
  }
});
