/* Offline-Grundprüfung: Dienstarbeiter registriert, der zuletzt geladene
   Plan bleibt nach dem Neuladen ohne Netz lesbar und ist als offline gekennzeichnet. */
import { test, expect, mitSitzung, starten, ansicht } from "./hilfen.mjs";

test.describe("Offline", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Offline-Grundprüfung läuft auf dem Desktop-Bildschirm");
  });

  test("Dienstarbeiter ist registriert und steuert die Seite", async ({ page }) => {
    await page.goto("/");
    const zustand = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { skript: reg.active && new URL(reg.active.scriptURL).pathname, scope: new URL(reg.scope).pathname };
    });
    expect(zustand).toEqual({ skript: "/sw.js", scope: "/" });
  });

  test("Plan bleibt nach Neuladen ohne Netz sichtbar", async ({ page, context }) => {
    await mitSitzung(page, "planer");
    await starten(page, "planer");
    /* Erst wenn der Dienstarbeiter die Seite steuert, landet /api/bestand in seinem Speicher. */
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 })
      .catch(async () => { await page.reload(); });
    await page.reload();
    await starten(page, "planer");
    await ansicht(page, "Monatsplan", "plan");
    await expect(page.getByRole("main").getByText(/2 Wohnbereiche/).first()).toBeVisible();

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole("main", { name: /^Ansicht / })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("status").filter({ hasText: "Keine Verbindung" })).toBeVisible();
      await ansicht(page, "Monatsplan", "plan");
      await expect(page.getByRole("main").getByText(/2 Wohnbereiche/).first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
