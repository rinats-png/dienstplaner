/* V4-3b (achter Schnitt, Telefonschale): Inline-Radien der Telefonschale (src/ansichten/mobil.jsx) und die vier
   .m-Radien des globalen Stils aus den Radiusstufen (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b
   Telefonschale). Geprüft im Browser (computed style), je bei 390 px und 1024 px, angemeldet als Beschäftigte
   (Rolle mitarbeiter, Zugangspool, hilfen.mjs anmelden):
     - je Reiter (Heute, Mein Plan, Anliegen, Mehr): jedes Element im Hauptbereich mit var(--v4-r-…) im Inline-Stil hat
       den Radius seiner Stufe; die Reiterknöpfe der unteren Leiste haben die Stufe gross (18 px);
     - Postknopf der Kopfzeile öffnet das Blatt „Mitteilungen“ (role=dialog): Blatt oben gross, unten eckig; Griff pille;
       Escape schließt, der Fokus geht zurück auf den Postknopf.
   Der Test liest nur (kein Antrag, kein Stempeln, keine Meldung). Bremsen-Bilanz: 1 Anmeldung als mitarbeiter je Lauf
   (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und Herkunft je Test aus dem Zugangspool
   (e2e/herkunft.mjs). Zeitgrenze 150 s wie v4-3b-import-form. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];
const REITER = ["Heute", "Mein Plan", "Anliegen", "Mehr"];

/** Elemente im Hauptbereich mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page) => page.evaluate(() => [...document.querySelectorAll('.m-schale main [style*="--v4-r-"]')]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })));

const radius = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  return e ? { oben: getComputedStyle(e).borderTopLeftRadius, unten: getComputedStyle(e).borderBottomLeftRadius } : null;
}, sel);

test.describe("V4-3b: Telefonschale mit Radiusstufen", () => {
  test.setTimeout(150_000);
  test("Reiter und Blatt Mitteilungen, 390/1024 px, nur lesend", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "mitarbeiter");

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs", { timeout: 30000 });

      let mitStufe = 0;
      for (const r of REITER) {
        await geheZu(page, r);
        await expect(page.locator(".m-tabs button.on"), `${wo}: Reiter ${r} aktiv`).toHaveText(r);
        for (const x of await tokenRadien(page)) {
          if (!x.stufe) continue;
          mitStufe++;
          expect(Object.keys(V4_RADIEN), `${wo} ${r}: Stufe ${x.stufe}`).toContain(x.stufe);
          expect(x.oben, `${wo} ${r}: --v4-r-${x.stufe}`).toBe(V4_RADIEN[x.stufe]);
        }
      }
      expect(mitStufe, `${wo}: Stellen mit Radiusstufe in den Reitern`).toBeGreaterThan(0);
      const tab = await radius(page, ".m-tabs button");
      expect(tab.oben, `${wo}: Reiterknopf gross`).toBe(V4_RADIEN.gross);

      const post = page.locator(".m-postknopf");
      await post.click();
      const blatt = page.getByRole("dialog", { name: "Mitteilungen" });
      await expect(blatt).toBeVisible();
      await expect.poll(async () => (await radius(page, ".m-blatt"))?.oben, { message: `${wo}: Blatt oben gross` })
        .toBe(V4_RADIEN.gross);
      expect((await radius(page, ".m-blatt")).unten, `${wo}: Blatt unten eckig`).toBe("0px");
      expect((await radius(page, ".m-griff")).oben, `${wo}: Griff pille`).toBe(V4_RADIEN.pille);

      await page.keyboard.press("Escape");
      await expect(blatt).toBeHidden();
      await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("m-postknopf") || false),
        { message: `${wo}: Fokus zurück auf den Postknopf` }).toBe(true);
    }
  });
});
