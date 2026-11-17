/* WP-33 Rest: axe-core (WCAG 2.2 AA) auf weiteren Oberflächen (e2e/weitere-flaechen.mjs), je Viewport der Gerätematrix.
   Gleiches Gate wie e2e/barrierefreiheit.spec.mjs: serious und critical schlagen fehl, außer begründet in
   e2e/axe-ausnahmen.json. Nur lesend (Anmelden und Navigieren). */
import { test, anmelden, geheZu, axePruefen } from "./hilfen.mjs";
import { WEITERE_FLAECHEN } from "./weitere-flaechen.mjs";

test.describe("Barrierefreiheit weiterer Flächen (axe, WCAG 2.2 AA)", () => {
  for (const [flaeche, rolle, ansicht] of WEITERE_FLAECHEN) {
    test(flaeche, async ({ page }, testInfo) => {
      await anmelden(page, rolle);
      await geheZu(page, ansicht);
      await axePruefen(page, testInfo, flaeche);
    });
  }
});
