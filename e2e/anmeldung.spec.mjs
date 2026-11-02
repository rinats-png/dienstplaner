/* Anmeldung per Zugangscode — je Rolle und Bildschirm.
   Der Code wird eingetippt, nie protokolliert; Fehlerbilder schwärzen das Feld. */
import { test, expect, zugang, geladen, keinWaagerechterUeberlauf } from "./hilfen.mjs";

const ROLLEN = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde"];

test.describe("Anmeldung per Zugangscode", () => {
  for (const rolle of ROLLEN) {
    test(`${rolle}: Code eingeben, Anwendung der Rolle öffnet sich`, async ({ page, konsolenfehler }) => {
      await page.goto("/");
      const feld = page.getByLabel("Zugangscode");
      await expect(feld).toBeVisible({ timeout: 20_000 });
      await keinWaagerechterUeberlauf(page);
      await feld.fill(zugang(rolle).code);
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await expect(geladen(page, rolle)).toBeVisible({ timeout: 20_000 });
      /* Die Sitzung liegt nur im Reiter — ohne „merken" nichts im dauerhaften Speicher. */
      const dauerhaft = await page.evaluate(() => localStorage.getItem("centric:token"));
      expect(dauerhaft).toBeNull();
      expect(konsolenfehler).toEqual([]);
    });
  }

  test("falscher Code: Fehlermeldung, keine Anwendung", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Zugangscode").fill("ABCD-EFGH-JKLM");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/Unbekannter Zugangscode|zu viele/i);
    await expect(page.getByRole("main", { name: /^Ansicht / })).toHaveCount(0);
  });
});
