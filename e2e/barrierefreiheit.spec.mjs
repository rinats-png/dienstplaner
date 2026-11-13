/* WP-33 Teil 3 / WP-40 / WP-21: axe-core (WCAG 2.2 AA) auf Anmeldung, Einstellungen und je Rollenfamilie einer
   Planansicht, an jedem der acht Viewports der Gerätematrix (je ein Playwright-Projekt, playwright.config.mjs).
   Gate: serious und critical schlagen fehl, außer begründet in e2e/axe-ausnahmen.json. */
import { test, expect, anmelden, geheZu, axePruefen, AUSNAHMEN } from "./hilfen.mjs";

/** [Fläche, Rolle, Ansicht] — je Rollenfamilie eine Planansicht (Beschäftigte, Schichtverantwortung, Planung, Leitung, Betriebsrat). */
const FLAECHEN = [
  ["einstellungen-leitung", "leitung", "Einstellungen"],
  ["plan-mitarbeiter", "mitarbeiter", "Mein Plan"],
  ["plan-subplaner", "subplaner", "Personaleinsatz"],
  ["plan-planer", "planer", "Monatsplan"],
  ["plan-leitung", "leitung", "Monatsplan"],
  ["plan-betriebsrat", "betriebsrat", "Monatsplan"],
];

test.describe("Barrierefreiheit (axe, WCAG 2.2 AA)", () => {
  test("anmeldung", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 30000 });
    await axePruefen(page, testInfo, "anmeldung");
  });

  for (const [flaeche, rolle, ansicht] of FLAECHEN) {
    test(flaeche, async ({ page }, testInfo) => {
      await anmelden(page, rolle);
      await geheZu(page, ansicht);
      await axePruefen(page, testInfo, flaeche);
    });
  }
});

/* Die Ausnahmeliste selbst: jede Ausnahme mit Regel, bekannter Fläche, Grund und Arbeitspaket — sonst wäre sie ein
   stilles Abschwächen des Gates. Läuft ohne Browser, einmal je Lauf. */
test("Ausnahmeliste axe ist begründet", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "360x740", "einmal je Lauf genügt");
  const bekannt = new Set(["anmeldung", ...FLAECHEN.map((f) => f[0]), "*"]);
  for (const a of AUSNAHMEN) {
    expect(typeof a.regel === "string" && a.regel.length > 0, JSON.stringify(a)).toBe(true);
    expect(bekannt.has(a.flaeche), `Fläche ${a.flaeche}`).toBe(true);
    expect(typeof a.grund === "string" && a.grund.trim().length >= 20, `Grund zu ${a.regel}`).toBe(true);
    expect(a.wp, `Arbeitspaket zu ${a.regel}`).toMatch(/^WP-\d+[a-z]?$/);
    if (a.viewports) expect(Array.isArray(a.viewports) && a.viewports.length > 0, `viewports zu ${a.regel}`).toBe(true);
  }
});
