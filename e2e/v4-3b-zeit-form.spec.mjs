/* V4-3b (dritter Schnitt, Zeit/Abrechnung): Inline-Radien der Zeit-Ansichten aus den Radiusstufen der Tokens
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Zeit). Geprüft im Browser (computed style):
     - 390 px und 1024 px: Anträge (Wochenzeilen und Auslastungsbalken der Urlaubsplanung, Stufe klein; Statusleisten
       der Antragsliste, Stufe pille) und Belastbarkeit: jedes Element im Inhalt mit var(--v4-r-…) im Inline-Stil hat
       den Radius der Stufe aus V4_RADIEN (src/v4/tokens.js);
     - Belastbarkeit: die begründete Ausnahme (Legendenfeld 26×16 px) behält 4 px und bleibt ein Rechteck.
   Das Kontoblatt (nur Telefonschale der Beschäftigten) ist über den Render-Test belegt (pruefungen/v4-3b-zeit.test.js);
   eine zweite Anmeldung kostete Bremsen-Budget.
   Klassennamen und Accessible Names bleiben; der Test liest sie nur. Er ändert nichts auf dem Server (nur Ansichten
   öffnen). Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung).
   Code und Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden, e2e/herkunft.mjs). Zeitgrenze 150 s. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente unter `wurzel` mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page, wurzel) => page.evaluate((w) => [...document.querySelectorAll(`${w} [style*="--v4-r-"]`)]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })), wurzel);

/** Alle gefundenen Stellen haben den Radius ihrer Stufe; mindestens `min` Stellen. */
async function pruefeStufen(page, wurzel, min, wo) {
  await expect.poll(async () => (await tokenRadien(page, wurzel)).length, { message: `${wo}: Stellen mit Radiusstufe` })
    .toBeGreaterThanOrEqual(min);
  const alle = await tokenRadien(page, wurzel);
  for (const r of alle) {
    expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${r.stufe}`).toContain(r.stufe);
    expect(r.oben, `${wo}: --v4-r-${r.stufe}`).toBe(V4_RADIEN[r.stufe]);
  }
  return alle;
}

test.describe("V4-3b: Zeit/Abrechnung mit Radiusstufen aus den Tokens", () => {
  test.setTimeout(150_000);
  test("Anträge und Belastbarkeit 390/1024 px; Ausnahme Legendenfeld unverändert", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });

      await geheZu(page, "Anträge");
      /* Urlaubsplanung: acht Wochen, je Zeile (klein) und Auslastungsbalken (klein). */
      const a = await pruefeStufen(page, "main", 16, `${breite.width} px Anträge`);
      expect(a.filter((r) => r.stufe === "klein").length, `${breite.width} px Anträge: Wochen`).toBeGreaterThanOrEqual(16);

      await geheZu(page, "Belastbarkeit");
      await pruefeStufen(page, "main", 0, `${breite.width} px Belastbarkeit`);
      const legende = await page.evaluate(() => [...document.querySelectorAll("main span")]
        .filter((e) => e.style.width === "26px" && e.style.height === "16px")
        .map((e) => getComputedStyle(e).borderTopLeftRadius));
      expect(legende.length, `${breite.width} px Belastbarkeit: Legendenfelder`).toBeGreaterThanOrEqual(1);
      for (const r of legende) expect(r, "Legendenfeld bleibt 4 px (Ausnahme)").toBe("4px");
    }
  });
});
