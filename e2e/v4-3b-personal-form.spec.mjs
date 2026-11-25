/* V4-3b (zweiter Schnitt, Personal): Inline-Radien der Personal-Ansichten aus den Radiusstufen der Tokens
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Personal). Geprüft im Browser (computed style):
     - 390 px und 1024 px: Qualifikationen (Punkte, Stufe pille) und Nachweise (Leisten, Stufe pille): jedes Element im
       Inhalt mit var(--v4-r-…) im Inline-Stil hat den Radius der Stufe aus V4_RADIEN (src/v4/tokens.js);
     - 1024 px: Personalakte (Klick auf eine Person in „Personal“): Nachtbalken mit kleiner Stufe oben, unten eckig;
       Fokus geht in das Blatt und nach Escape zurück auf den Personenknopf (expect.poll; der Test setzt den Fokus
       nicht selbst; V4-2d).
   Klassennamen und Accessible Names bleiben; der Test liest sie nur. Er ändert nichts auf dem Server (nur Ansichten
   öffnen, Blatt ohne Änderung schließen).
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden, e2e/herkunft.mjs). Zeitgrenze 150 s wie v4-3b-plan-form. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente unter `wurzel` mit var(--v4-r-…) im Inline-Stil: Stufe und berechnete Radien (oben links, unten links). */
const tokenRadien = (page, wurzel) => page.evaluate((w) => [...document.querySelectorAll(`${w} [style*="--v4-r-"]`)]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius, unten: getComputedStyle(e).borderBottomLeftRadius })), wurzel);

/** Alle gefundenen Stellen haben oben den Radius ihrer Stufe; mindestens `min` Stellen. */
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

test.describe("V4-3b: Personal mit Radiusstufen aus den Tokens", () => {
  test.setTimeout(150_000);
  test("Qualifikationen und Nachweise 390/1024 px; Personalakte 1024 px mit Fokus", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Qualifikationen");
      const q = await pruefeStufen(page, "main", 1, `${breite.width} px Qualifikationen`);
      expect(q.map((r) => r.stufe)).toContain("pille");
      await geheZu(page, "Nachweise");
      await pruefeStufen(page, "main", 1, `${breite.width} px Nachweise`);
    }

    /* 1024 px: Personalakte über die Personenliste (Klick wie ein Mensch; Knopf „Nachname, Vorname“). */
    await geheZu(page, "Personal");
    const person = page.locator("main tr.row td[role=button]").first();
    await expect(person).toBeVisible();
    const name = await person.evaluate((e) => e.textContent.trim());
    await person.click();
    const akte = page.getByRole("dialog").first();
    await expect(akte).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")),
      { message: "Fokus in der Personalakte" }).toBe(true);
    /* Nachtbalken (12 Monate): oben kleine Stufe, unten eckig (sichtbar nur mit Kontoeinsicht; Leitung hat sie). */
    const r = await pruefeStufen(page, "[role=dialog]", 12, "1024 px Personalakte");
    const balken = r.filter((x) => x.stufe === "klein" && x.unten === "0px");
    expect(balken.length).toBeGreaterThanOrEqual(12);

    await page.keyboard.press("Escape");
    await expect(akte).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
      const a = document.activeElement;
      return a ? a.textContent.trim() : "";
    }), { message: "Fokus zurück auf den Personenknopf" }).toBe(name);
  });
});
