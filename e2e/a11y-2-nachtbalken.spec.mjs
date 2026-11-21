/* A11Y-2 (Review #445): Nachtbalken der Personalakte im Browser
   (docs/acc45/work-packages.json, A11Y-2; Render- und Kontrastprüfung in pruefungen/v4-3b-personal.test.js).
   Geprüft bei 390 px und 1024 px:
     - getByRole("img") mit Accessible Name: Jahr, alle zwölf Monate mit Stunden, markierter Monat (1.3.1, 4.1.2);
     - genau eine solche Grafik; die zwölf Spalten sind für Vorlesesoftware ausgeblendet (keine doppelte Ansage);
     - der markierte Monat ist ohne Farbe erkennbar: sein Buchstabe ist fett (>= 700) und unterstrichen (computed
       style), die übrigen nicht (1.4.1);
     - axe (hilfen.mjs axePruefen) auf der offenen Personalakte je Breite: keine serious/critical-Befunde.
   Liest nur; schreibt keine Daten. Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844;
   Breitenwechsel ohne neue Anmeldung). Code und Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden,
   e2e/herkunft.mjs). Zeitgrenze 150 s wie a11y-1-arbeitstag. */
import { test, expect, anmelden, geheZu, axePruefen } from "./hilfen.mjs";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];
const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

test.describe("A11Y-2: Nachtbalken mit Text und Marker ohne Farbe", () => {
  test.setTimeout(150_000);
  test("390/1024 px: Grafik mit Monatswerten als Name, markierter Monat fett und unterstrichen", async ({ page }, testInfo) => {
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

      const grafik = akte.getByRole("img", { name: /^Nachtstunden je Monat \d{4}:/ });
      await expect(grafik, `${breite.width} px: genau eine Grafik`).toHaveCount(1);
      await expect(grafik).toBeVisible();
      const name = await grafik.getAttribute("aria-label");
      for (const mo of MON) expect(name, `${breite.width} px: ${mo}`).toMatch(new RegExp(`${mo} (\\d+(,\\d)? Stunden|keine Angabe)`));
      const markiert = (name.match(/markiert: (\S+?)\.?$/) || [])[1];
      expect(MON, `${breite.width} px: markierter Monat im Namen`).toContain(markiert);

      /* Spalten ausgeblendet: in der Grafik keine weiteren benannten Elemente; zwölf Spalten aria-hidden. */
      await expect.poll(() => grafik.evaluate((g) => g.querySelectorAll(":scope > [aria-hidden='true']").length),
        { message: `${breite.width} px: zwölf Spalten aria-hidden` }).toBe(12);

      /* Marker ohne Farbe: computed style des Buchstabens je Spalte. */
      const stil = () => grafik.evaluate((g) => [...g.children].map((s) => {
        const b = s.lastElementChild, cs = getComputedStyle(b);
        return { t: b.textContent, fett: Number(cs.fontWeight) >= 700, unter: cs.textDecorationLine.includes("underline") };
      }));
      await expect.poll(async () => (await stil()).map((x) => x.t).join(""), { message: `${breite.width} px: Buchstaben` })
        .toBe(MON.map((x) => x[0]).join(""));
      const s = await stil();
      const idx = MON.indexOf(markiert);
      expect(s.map((x) => x.fett && x.unter), `${breite.width} px: nur ${markiert} fett und unterstrichen`)
        .toEqual(MON.map((_, i) => i === idx));

      await axePruefen(page, testInfo, `personalakte-nachtbalken-${breite.width}`);
      await page.keyboard.press("Escape");
      await expect(akte).toBeHidden();
    }
  });
});
