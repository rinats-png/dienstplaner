/* V4-3a: Querschnittsklassen tragen die Radiusstufen der Tokens (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3a).
   Geprüft im Browser, wie er die Werte berechnet (computed style), nicht im Quelltext:
     - --v4-r-klein/-mittel/-gross/-pille an der Wurzel = V4_RADIEN (src/v4/tokens.js);
     - Monatsplan: .planzelle mit der kleinen Stufe (vorher eckig; nur breit, schmal zeigt er die Wochenliste),
       .pille als Pille (beide Breiten);
     - Lagebild: Kennzahl-Kachel (.karte.kachel) mit der großen Stufe;
     - bei 390 px und 1024 px (die Mobilregel .karte{…} in App.jsx darf die Schicht nicht überstimmen).
   Klassennamen bleiben gleich; der Test liest sie nur. Er ändert nichts auf dem Server (nur Ansichten öffnen).
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden, e2e/herkunft.mjs). Zeitgrenze 150 s wie v4-variablen.spec.mjs. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
/* Breiten aus der Gerätematrix (src/ui/geraete.js): Telefon und Tablet quer. Breiter als 1024 px hat die Anwendung keine
   Schublade mehr; geheZu (hilfen.mjs) bedient nur Reiter und Schublade. */
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Radius oben links des ersten passenden Elements; null, wenn keines da ist. */
const radius = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  return e ? getComputedStyle(e).borderTopLeftRadius : null;
}, sel);

test.describe("V4-3a: Querschnittsklassen mit Radiusstufen aus den Tokens", () => {
  test.setTimeout(150_000);
  test("Wurzelvariablen, Planzelle, Pille, Kennzahl-Kachel bei 390 und 1024 px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    const wurzel = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(["klein", "mittel", "gross", "pille"].map((k) => [k, cs.getPropertyValue(`--v4-r-${k}`).trim()]));
    });
    expect(wurzel).toEqual(V4_RADIEN);

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      /* Neu laden wie v4-variablen.spec.mjs: Seitenleiste/Schublade richten sich nach der Breite beim Laden (Sitzung bleibt). */
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Monatsplan");
      if (breite.width > 820) {
        /* Das Raster mit Planzellen gibt es erst über 820 px (App.jsx schmal); schmal zeigt der Monatsplan die Wochenliste (Karten, Pillen). */
        await page.waitForSelector(".planzelle", { timeout: 30000 });
        await expect.poll(() => radius(page, ".planzelle"), { message: `${breite.width} px: .planzelle` }).toBe(V4_RADIEN.klein);
      } else {
        await page.waitForSelector(".pille", { state: "attached", timeout: 30000 });
      }
      await expect.poll(() => radius(page, ".pille"), { message: `${breite.width} px: .pille` }).toBe(V4_RADIEN.pille);

      await geheZu(page, "Lagebild");
      await page.waitForSelector(".karte.kachel", { timeout: 30000 });
      await expect.poll(() => radius(page, ".karte.kachel"), { message: `${breite.width} px: .karte.kachel` }).toBe(V4_RADIEN.gross);
    }
  });
});
