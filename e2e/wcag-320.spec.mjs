/* WP-40 Browser-Abnahme: WCAG 1.4.10 Reflow bei 320 CSS-px und 2.4.11 / 2.4.3 Tab-Stopps in der geschlossenen Schublade.
   Die Gerätematrix beginnt bei 360 px; 1.4.10 verlangt 320 px (Seite ohne Querscrollen). Die Spec setzt die Breite selbst
   (320 x 640) und läuft deshalb nur im Projekt 360x740 (ein Lauf genügt; die übrigen Projekte würden dieselbe Messung
   wiederholen). Nur lesend (Anmelden und Navigieren), Rolle Leitung (die meisten Ansichten).
   Rollbereiche mit eigenem overflow-x (Datentabellen) sind nach 1.4.10 zulässig; gemessen wird die Seite (documentElement). */
import { test, expect, anmelden } from "./hilfen.mjs";

const BREITE = 320, HOEHE = 640;

test.describe("WP-40 bei 320 px (Reflow, Fokus)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "360x740", "Breite wird in der Spec selbst gesetzt; ein Projekt genügt");
    await page.setViewportSize({ width: BREITE, height: HOEHE });
  });

  test("1.4.10: keine Ansicht der Leitung scrollt die Seite quer", async ({ page }) => {
    test.setTimeout(300_000);
    await anmelden(page, "leitung");
    await page.locator("header button").first().click();
    await page.waitForSelector(".seitenleiste.offen");
    const anzahl = await page.locator(".seitenleiste .slink").count();
    expect(anzahl).toBeGreaterThan(10);
    const befunde = [];
    for (let i = 0; i < anzahl; i++) {
      if (!(await page.locator(".seitenleiste.offen").count())) {
        await page.locator("header button").first().click();
        await page.waitForSelector(".seitenleiste.offen");
      }
      const name = await page.evaluate((k) => (document.querySelectorAll(".seitenleiste .slink")[k].innerText || "").trim().split("\n")[0], i);
      await page.locator(".seitenleiste .slink").nth(i).click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const dok = document.documentElement, vw = window.innerWidth;
        /* Verursacher: Elemente, die über den rechten Rand ragen, deren Eltern aber nicht (äußerste Ebene des Überstands). */
        const rechts = (e) => e.getBoundingClientRect().right;
        /* Abstieg vom Wurzelelement: das Kind, das den Überstand (scrollWidth) trägt, bis keines mehr übersteht. */
        const taeter = [];
        let k = document.querySelector(".sw-root") || document.body;
        for (let tiefe = 0; tiefe < 14 && k; tiefe++) {
          const kinder = [...k.children].filter((c) => c.getBoundingClientRect().width > 0 && (rechts(c) > vw + 1 || c.scrollWidth + c.getBoundingClientRect().left > vw + 1));
          if (!kinder.length) break;
          k = kinder[0];
          taeter.push(`${k.tagName}.${String(k.className || "").slice(0, 24)} r=${Math.round(rechts(k))} sw=${k.scrollWidth} ov=${getComputedStyle(k).overflowX}`);
        }
        return { quer: dok.scrollWidth - vw, taeter };
      });
      if (m.quer > 1) befunde.push(`${name}: Seite ${m.quer} px breiter als ${BREITE} px (${m.taeter.join("; ")})`);
    }
    expect(befunde, `Ansichten mit Querscrollen bei ${BREITE} px:\n${befunde.join("\n")}`).toEqual([]);
  });

  test("2.4.11: geschlossene Schublade hat keine Tab-Stopps", async ({ page }) => {
    await anmelden(page, "leitung");
    expect(await page.locator(".seitenleiste.offen").count()).toBe(0);
    const verirrt = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const s = e.closest(".seitenleiste");
        return s ? `${e.tagName} "${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}" in .seitenleiste (offen=${s.classList.contains("offen")}, visibility=${getComputedStyle(e).visibility})` : null;
      });
      if (f) verirrt.push(f);
    }
    expect(verirrt, "Fokus in der geschlossenen Schublade").toEqual([]);
  });
});
