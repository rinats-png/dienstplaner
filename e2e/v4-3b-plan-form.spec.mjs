/* V4-3b (erster Schnitt, Plan/Dienstplan): Inline-Radien der Plan-Ansichten aus den Radiusstufen der Tokens
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b). Geprüft im Browser (computed style), nicht im Quelltext:
     - 390 px (Wochenliste) und 1024 px (Monatsplan-Raster): jedes Element im Inhalt, dessen Inline-Stil eine
       var(--v4-r-…) trägt, hat den Radius der Stufe aus V4_RADIEN (src/v4/tokens.js);
     - 1024 px: Tagesblatt (Klick auf einen Tageskopf) — Reiter und Spalten mit Radiusstufen; Fokus geht in das Blatt
       und nach Escape zurück auf den Tageskopf (expect.poll; der Test setzt den Fokus nicht selbst; V4-2d).
   Klassennamen und Accessible Names bleiben; der Test liest sie nur. Er ändert nichts auf dem Server (nur Ansichten
   öffnen, Blatt ohne Änderung schließen).
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden, e2e/herkunft.mjs). Zeitgrenze 150 s wie v4-querschnitt-form. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente unter `wurzel` mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius. */
const tokenRadien = (page, wurzel) => page.evaluate((w) => [...document.querySelectorAll(`${w} [style*="--v4-r-"]`)]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    ist: getComputedStyle(e).borderTopLeftRadius })), wurzel);

/** Alle gefundenen Stellen haben den Radius ihrer Stufe; mindestens `min` Stellen. */
async function pruefeStufen(page, wurzel, min, wo) {
  await expect.poll(async () => (await tokenRadien(page, wurzel)).length, { message: `${wo}: Stellen mit Radiusstufe` })
    .toBeGreaterThanOrEqual(min);
  for (const r of await tokenRadien(page, wurzel)) {
    expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${r.stufe}`).toContain(r.stufe);
    expect(r.ist, `${wo}: --v4-r-${r.stufe}`).toBe(V4_RADIEN[r.stufe]);
  }
}

test.describe("V4-3b: Plan/Dienstplan mit Radiusstufen aus den Tokens", () => {
  test.setTimeout(150_000);
  test("Wochenliste 390 px, Monatsplan und Tagesblatt 1024 px; Fokus im Tagesblatt", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Monatsplan");
      if (breite.width > 820) await page.waitForSelector(".planzelle", { timeout: 30000 });
      await pruefeStufen(page, "main", 1, `${breite.width} px Monatsplan`);
    }

    /* 1024 px: Tagesblatt über den Tageskopf (Klick wie ein Mensch; der Kopf ist eine Rasterzelle mit Namen „Tag · …“). */
    const kopf = page.locator('[role=gridcell][aria-label^="Tag · "]').first();
    const name = await kopf.getAttribute("aria-label");
    await kopf.click();
    const blatt = page.getByRole("dialog").first();
    await expect(blatt).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")),
      { message: "Fokus im Tagesblatt" }).toBe(true);
    /* Reiter je Dienstart (Pille) und die Spalten „Eingeteilt“/„Verfügbar“ (große Stufe) */
    await pruefeStufen(page, "[role=dialog]", 3, "1024 px Tagesblatt");
    const stufen = (await tokenRadien(page, "[role=dialog]")).map((r) => r.stufe);
    expect(stufen).toContain("pille");
    expect(stufen.filter((s) => s === "gross")).toHaveLength(2);

    await page.keyboard.press("Escape");
    await expect(blatt).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || ""),
      { message: "Fokus zurück auf den Tageskopf" }).toBe(name);
  });
});
