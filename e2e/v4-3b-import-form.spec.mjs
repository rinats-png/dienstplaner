/* V4-3b (siebter Schnitt, Import): Inline-Radien und ein Farbliteral des Textimports aus den Tokens
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Import). Geprüft im Browser (computed style), je bei 390 px
   und 1024 px, angemeldet als Leitung (Zugangspool, hilfen.mjs anmelden):
     - Personal → „Importieren“ öffnet das Blatt „Personal importieren“ (role=dialog), der Fokus liegt darin;
     - „Beispiel einfügen“ und „Prüfen“ zeigen die Vorschau: jeder Prüfpunkt 20×20 hat die Stufe pille (Kreis bleibt
       Kreis); Punkt „ja“ mit der Fläche C.okLight (hell), Punkt „nein“ unverändert mit der roten Tönung (begründete
       Ausnahme, V4-3d); jedes Element im Blatt mit var(--v4-r-…) im Inline-Stil hat den Radius seiner Stufe;
     - „Abbrechen“ schließt das Blatt ohne Übernahme; der Fokus geht zurück auf „Importieren“.
   Der Dateiimport (import-datei.jsx) ist ausgeschaltet (IMPORT_DATEI_AKTIV = false) und im Browser nicht erreichbar;
   seine Fehlermeldung ist über Render-Test, feste Tabelle und Rückrechnung belegt (pruefungen/v4-3b-import.test.js).
   Der Test liest nur (kein Übernehmen, kein Speichern). Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt
   390x844; Breitenwechsel ohne neue Anmeldung). Code und Herkunft je Test aus dem Zugangspool (e2e/herkunft.mjs).
   Zeitgrenze 150 s wie v4-3b-personal-form. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN, v4AlsAltePalette } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Hex → rgb(…) wie getComputedStyle. */
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const ROT_ALT = "rgba(179, 38, 30, 0.12)";

/** Prüfpunkte der Vorschau im Blatt: Inline-Radius, berechneter Radius, Fläche, Lesetext. */
const punkte = (page) => page.evaluate(() => [...document.querySelectorAll("[role=dialog] td > span")]
  .filter((e) => e.style.width === "20px" && e.style.height === "20px")
  .map((e) => ({ inline: e.style.borderRadius, r: getComputedStyle(e).borderTopLeftRadius,
    bg: getComputedStyle(e).backgroundColor, lese: (e.querySelector(".nurLeser") || {}).textContent })));

/** Elemente im Blatt mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page) => page.evaluate(() => [...document.querySelectorAll('[role=dialog] [style*="--v4-r-"]')]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })));

test.describe("V4-3b: Import mit Radiusstufen und Palette", () => {
  test.setTimeout(150_000);
  test("Blatt Personal importieren, Vorschau 390/1024 px, ohne Übernahme", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "leitung");
    const hell = v4AlsAltePalette("hell");

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Personal");

      const knopf = page.locator("main").getByRole("button", { name: "Importieren", exact: true }).first();
      await expect(knopf, `${wo}: Knopf Importieren`).toBeVisible();
      await knopf.click();
      const blatt = page.getByRole("dialog", { name: "Personal importieren" });
      await expect(blatt).toBeVisible();
      await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")),
        { message: `${wo}: Fokus im Blatt` }).toBe(true);

      await blatt.getByRole("button", { name: "Beispiel einfügen" }).click();
      await blatt.getByRole("button", { name: "Prüfen", exact: true }).click();
      await expect.poll(async () => (await punkte(page)).length, { message: `${wo}: Prüfpunkte der Vorschau` })
        .toBeGreaterThanOrEqual(1);
      for (const p of await punkte(page)) {
        expect(p.inline, `${wo}: Prüfpunkt Stufe`).toBe("var(--v4-r-pille)");
        expect(p.r, `${wo}: Prüfpunkt Radius`).toBe(V4_RADIEN.pille);
        if (p.lese === "ja") expect(p.bg, `${wo}: Punkt ja = C.okLight (hell)`).toBe(rgb(hell.okLight));
        else {
          expect(p.lese, `${wo}: Lesetext`).toBe("nein");
          expect(p.bg, `${wo}: Punkt nein unverändert (Ausnahme)`).toBe(ROT_ALT);
        }
      }
      for (const r of await tokenRadien(page)) {
        if (!r.stufe) continue;
        expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${r.stufe}`).toContain(r.stufe);
        expect(r.oben, `${wo}: --v4-r-${r.stufe}`).toBe(V4_RADIEN[r.stufe]);
      }

      await blatt.getByRole("button", { name: "Abbrechen" }).click();
      await expect(blatt).toBeHidden();
      await expect.poll(() => page.evaluate(() => (document.activeElement?.textContent || "").trim()),
        { message: `${wo}: Fokus zurück auf Importieren` }).toBe("Importieren");
    }
  });
});
