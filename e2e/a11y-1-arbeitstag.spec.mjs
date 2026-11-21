/* A11Y-1 (Review #442, Folgepunkt F1): Arbeitstag-Knöpfe der Personalakte im Browser
   (docs/acc45/work-packages.json, A11Y-1; Render- und Kontrastprüfung in pruefungen/v4-3b-personal.test.js).
   Geprüft bei 390 px und 1024 px:
     - Verteilung „Teilzeit · feste Wochentage“: sieben Knöpfe mit Namen Mo … So, jeder mit aria-pressed;
     - Tastatur: Leertaste und Enter am fokussierten Knopf schalten aria-pressed um (expect.poll), der Haken
       erscheint nur bei gewählt (nicht nur Farbe, 1.4.1);
     - Accessible Name bleibt der Wochentag; Zielhöhe mindestens 24 px (2.5.8), Breite mindestens 44 px wie vorher;
     - axe (hilfen.mjs axePruefen) auf der offenen Personalakte je Breite: keine serious/critical-Befunde.
   Schreibt nur Testdaten des CI-Servers (global-setup.mjs, Demo-Bestand) und stellt sie wieder her: Wochentag
   zweimal umgeschaltet (Ausgangszustand), danach die ursprüngliche Verteilung zurück.
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden, e2e/herkunft.mjs). Zeitgrenze 150 s wie v4-3b-personal-form. */
import { test, expect, anmelden, geheZu, axePruefen } from "./hilfen.mjs";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HAKEN = "m4.6 12.4 4.8 4.8L19.4 6.6";

test.describe("A11Y-1: Arbeitstage mit aria-pressed und Haken", () => {
  test.setTimeout(150_000);
  test("390/1024 px: Leertaste und Enter schalten aria-pressed, Haken nur bei gewählt", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Personal");
      const person = page.locator("main tr.row td[role=button]").first();
      await expect(person).toBeVisible();
      await person.click();
      const akte = page.getByRole("dialog").first();
      await expect(akte).toBeVisible();

      const verteilung = akte.getByLabel("Verteilung");
      await expect(verteilung).toBeVisible();
      const vorher = await verteilung.inputValue();
      if (vorher !== "wochentage") await verteilung.selectOption("wochentage");

      const knopf = (wt) => akte.getByRole("button", { name: wt, exact: true });
      for (const wt of TAGE) await expect(knopf(wt), `${breite.width} px: Knopf ${wt}`).toHaveAttribute("aria-pressed", /^(true|false)$/);

      const mo = knopf("Mo");
      const zustand = () => mo.getAttribute("aria-pressed");
      const haken = () => mo.evaluate((e, d) => !!e.querySelector(`svg path[d="${d}"]`), HAKEN);
      const start = await zustand();
      const gegen = start === "true" ? "false" : "true";
      expect(await haken(), `${breite.width} px: Haken passt zum Zustand`).toBe(start === "true");

      const box = await mo.boundingBox();
      expect(box.height, `${breite.width} px: Zielhöhe`).toBeGreaterThanOrEqual(24);
      expect(box.width, `${breite.width} px: Mindestbreite`).toBeGreaterThanOrEqual(44);

      await mo.focus();
      await page.keyboard.press("Space");
      await expect.poll(zustand, { message: `${breite.width} px: Leertaste schaltet` }).toBe(gegen);
      await expect.poll(haken, { message: `${breite.width} px: Haken folgt` }).toBe(gegen === "true");
      await expect(mo).toHaveAccessibleName("Mo");

      await expect.poll(() => page.evaluate(() => document.activeElement?.textContent.trim()),
        { message: `${breite.width} px: Fokus bleibt auf dem Knopf` }).toBe("Mo");
      await page.keyboard.press("Enter");
      await expect.poll(zustand, { message: `${breite.width} px: Enter schaltet zurück` }).toBe(start);
      await expect.poll(haken, { message: `${breite.width} px: Haken folgt` }).toBe(start === "true");
      /* axe (WCAG 2.2 AA, serious/critical) auf der offenen Personalakte mit den Arbeitstagen. */
      await axePruefen(page, testInfo, `personalakte-arbeitstage-${breite.width}`);

      if (vorher !== "wochentage") await verteilung.selectOption(vorher);
      await expect(verteilung).toHaveValue(vorher);
      await page.keyboard.press("Escape");
      await expect(akte).toBeHidden();
    }
  });
});
