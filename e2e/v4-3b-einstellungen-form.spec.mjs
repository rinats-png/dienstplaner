/* V4-3b (vierter Schnitt, Einstellungen/Verwaltung): Inline-Radien der Einstellungs-Ansichten aus den Radiusstufen der
   Tokens (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Einstellungen). Geprüft im Browser (computed style):
     - 390 px und 1024 px: Prüfung — jedes Element im Inhalt mit var(--v4-r-…) im Inline-Stil hat den Radius der Stufe
       aus V4_RADIEN (src/v4/tokens.js); die begründete Ausnahme (Normmarke der Rechtsquelle) behält 5 px, und ihre
       Höhe zeigt den Kapsel-Effekt: die kleinste Stufe (8 px) wäre >= halbe Höhe minus 1 px;
     - 1024 px: Planungsassistent (Dienstplan) — Kasten Planungsreife mit Stufe mittel (12 px); Escape schließt das
       Blatt, ohne etwas zu übernehmen.
   Einladungen, Kalenderverweis, Sicherung außer Haus und Warndialog zeigen ihre Stellen erst nach einer Schreibaktion
   (Einladung, Schlüssel, Verweis anlegen) oder in einem Konfliktfall; sie sind über Render-Test bzw. Quelltext und
   feste Tabelle belegt (pruefungen/v4-3b-einstellungen.test.js), nicht hier.
   Klassennamen und Accessible Names bleiben; der Test liest sie nur. Er ändert nichts auf dem Server (nur Ansichten
   öffnen, Blatt mit Escape schließen). Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844;
   Breitenwechsel ohne neue Anmeldung). Code und Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden,
   e2e/herkunft.mjs). Zeitgrenze 150 s. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente unter `wurzel` mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page, wurzel) => page.evaluate((w) => [...document.querySelectorAll(`${w} [style*="--v4-r-"]`)]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })), wurzel);

/** Alle gefundenen Stellen haben den Radius ihrer Stufe. */
async function pruefeStufen(page, wurzel, wo) {
  const alle = await tokenRadien(page, wurzel);
  for (const r of alle) {
    if (!r.stufe) continue; /* Element mit --v4-r- in anderer Eigenschaft */
    expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${r.stufe}`).toContain(r.stufe);
    expect(r.oben, `${wo}: --v4-r-${r.stufe}`).toBe(V4_RADIEN[r.stufe]);
  }
  return alle;
}

test.describe("V4-3b: Einstellungen/Verwaltung mit Radiusstufen aus den Tokens", () => {
  test.setTimeout(150_000);
  test("Prüfung 390/1024 px mit Ausnahme Normmarke; Planungsreife 1024 px mittel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });

      await geheZu(page, "Prüfung");
      await pruefeStufen(page, "main", `${breite.width} px Prüfung`);
      /* Normmarken (Rechtsquelle je Befund): Ausnahme mit 5 px; Höhe aus der Schrift. */
      const marken = await page.evaluate(() => [...document.querySelectorAll("main span")]
        .filter((e) => e.style.padding === "1px 7px")
        .map((e) => ({ r: getComputedStyle(e).borderTopLeftRadius, hoehe: e.getBoundingClientRect().height })));
      expect(marken.length, `${breite.width} px Prüfung: Normmarken im Demo-Monat`).toBeGreaterThanOrEqual(1);
      testInfo.annotations.push({ type: `Normmarken ${breite.width} px`,
        description: `${marken.length}, Höhe ${Math.min(...marken.map((m) => m.hoehe))}–${Math.max(...marken.map((m) => m.hoehe))} px` });
      for (const m of marken) {
        expect(m.r, "Normmarke bleibt 5 px (Ausnahme)").toBe("5px");
        expect(parseFloat(V4_RADIEN.klein), `Kapsel-Effekt: klein >= halbe Höhe ${m.hoehe} − 1`)
          .toBeGreaterThanOrEqual(m.hoehe / 2 - 1);
      }
    }

    /* Planungsassistent: nur 1024 px (Monatsplan mit Kopfknöpfen). */
    await geheZu(page, "Monatsplan");
    await page.getByRole("button", { name: "Planungsassistent" }).first().click();
    const reife = page.getByRole("region", { name: "Planungsreife" });
    await expect(reife).toBeVisible();
    await expect.poll(() => reife.evaluate((e) => getComputedStyle(e).borderTopLeftRadius),
      { message: "Planungsreife: Stufe mittel" }).toBe(V4_RADIEN.mittel);
    expect(await reife.evaluate((e) => e.style.borderRadius)).toBe("var(--v4-r-mittel)");
    await pruefeStufen(page, "[role=dialog]", "1024 px Planungsassistent");
    await page.keyboard.press("Escape");
    await expect(reife).toHaveCount(0);
  });
});
