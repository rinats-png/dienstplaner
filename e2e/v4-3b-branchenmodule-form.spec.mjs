/* V4-3b (elfter Schnitt, Branchenmodule): Inline-Radien der Branchenmodule (src/module/*.jsx) aus den Radiusstufen
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Branchenmodule). Geprüft im Browser (computed style), je bei
   390 px und 1024 px, hell, angemeldet als Leitung (Zugangspool, hilfen.mjs anmelden):
     - Ansicht „Betrieb“, Bereich „Branchenmodule“ (src/module/kern.jsx): je Modul eine Modulzeile (article, RAHMEN) mit
       Stufe --v4-r-klein im Inline-Stil und 8 px berechnet; Rahmenfarbe currentColor unverändert; kein waagrechtes
       Scrollen.
   Die Moduloberflächen (Karten in anlagen.jsx, posten.jsx, wachbuch.jsx …) erscheinen nur mit einem eingeschalteten
   Modul; die Registry (server/lib/branchenmodule.mjs) steht auf „geplant“, also nie im Browser. Sie sind über Render-Test
   und Rückrechnung belegt (pruefungen/v4-3b-branchenmodule.test.js), nicht hier. Der Test liest nur, er schaltet nichts.
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (e2e/herkunft.mjs, vorzeichenlos). Zeitgrenze 150 s. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

test.describe("V4-3b: Branchenmodule mit Radiusstufen", () => {
  test.setTimeout(150_000);
  test("Modulzeilen im Betrieb mit Stufe klein, 390/1024 px, nur lesend", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Betrieb");

      const bereich = page.getByRole("region", { name: "Branchenmodule", exact: true });
      await expect(bereich, `${wo}: Bereich Branchenmodule`).toBeVisible({ timeout: 20000 });
      const zeilen = bereich.locator("article");
      await expect.poll(() => zeilen.count(), { message: `${wo}: Modulzeilen`, timeout: 15000 }).toBeGreaterThanOrEqual(12);
      const r = await zeilen.evaluateAll((alle) => alle.map((e) => ({ inline: e.style.borderRadius,
        oben: getComputedStyle(e).borderTopLeftRadius, unten: getComputedStyle(e).borderBottomRightRadius,
        /* Rahmen 1px solid currentColor: Chrome kürzt e.style.border auf "1px solid" (currentcolor ist Vorgabe);
           deshalb berechnet: Breite, Art und Rahmenfarbe = Textfarbe. */
        rahmen: `${getComputedStyle(e).borderTopWidth} ${getComputedStyle(e).borderTopStyle}`,
        farbeGleich: getComputedStyle(e).borderTopColor === getComputedStyle(e).color })));
      for (const [i, x] of r.entries()) {
        expect(x.inline, `${wo}: Modulzeile ${i + 1} Stufe im Inline-Stil`).toBe("var(--v4-r-klein)");
        expect(x.oben, `${wo}: Modulzeile ${i + 1} Radius klein`).toBe(V4_RADIEN.klein);
        expect(x.unten, `${wo}: Modulzeile ${i + 1} Radius klein (unten)`).toBe(V4_RADIEN.klein);
        expect(x.rahmen, `${wo}: Modulzeile ${i + 1} Rahmen`).toBe("1px solid");
        expect(x.farbeGleich, `${wo}: Modulzeile ${i + 1} Rahmenfarbe = Textfarbe (currentColor)`).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${wo}: kein waagrechtes Scrollen`)
        .toBe(true);
    }
  });
});
