/* V4-3b (zehnter Schnitt, Speicherlage): Inline-Radien der Speicherlage (src/ansichten/speicherlage.jsx,
   src/ansichten/teilkonflikt.jsx) aus den Radiusstufen (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b
   Speicherlage). Geprüft im Browser (computed style), je bei 390 px und 1024 px, hell, angemeldet als Beschäftigte
   (Rolle mitarbeiter, Zugangspool, hilfen.mjs anmelden):
     - ohne Netz (context.setOffline, Ereignis „offline“ wie in pwa-dienstarbeiter.spec.mjs) erscheint die Leiste
       „Keine Verbindung“ (role=status, Offlineleiste): Radius mittel (12 px), Stufe --v4-r-mittel im Inline-Stil,
       Text unverändert, kein waagrechtes Scrollen;
     - wieder online (Ereignis „online“) verschwindet die Leiste ohne Neuladen.
   Die Leisten „Nicht gespeichert“ (NichtGespeichert) und TeilwegLeiste erscheinen nur nach einem fehlgeschlagenen
   Schreibvorgang bzw. einem Teilkonflikt; dieser Test schreibt nichts und prüft sie deshalb nicht (Beleg: Render und
   Rückrechnung in pruefungen/v4-3b-speicherlage.test.js). Bremsen-Bilanz: 1 Anmeldung als mitarbeiter je Lauf (nur
   Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und Herkunft je Test aus dem Zugangspool
   (e2e/herkunft.mjs, vorzeichenlos). Zeitgrenze 150 s wie v4-3b-telefonschale-form. */
import { test, expect, anmelden } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

test.describe("V4-3b: Speicherlage mit Radiusstufen", () => {
  test.setTimeout(150_000);
  test("Leiste „Keine Verbindung“ ohne Netz, 390/1024 px, nur lesend", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "mitarbeiter");
    const leiste = page.getByRole("status").filter({ hasText: "Keine Verbindung" });

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await expect(leiste, `${wo}: online keine Leiste`).toHaveCount(0);

      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await expect(leiste, `${wo}: Leiste „Keine Verbindung“`).toBeVisible({ timeout: 20000 });
      await expect(leiste).toContainText("Änderungen lassen sich nicht speichern");
      const r = await leiste.first().evaluate((e) => ({ inline: e.style.borderRadius, oben: getComputedStyle(e).borderTopLeftRadius,
        unten: getComputedStyle(e).borderBottomRightRadius }));
      expect(r.inline, `${wo}: Stufe im Inline-Stil`).toBe("var(--v4-r-mittel)");
      expect(r.oben, `${wo}: Radius mittel`).toBe(V4_RADIEN.mittel);
      expect(r.unten, `${wo}: Radius mittel (unten)`).toBe(V4_RADIEN.mittel);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${wo}: kein waagrechtes Scrollen`)
        .toBe(true);

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(() => leiste.count(), { message: `${wo}: online ohne Neuladen keine Leiste`, timeout: 15000 }).toBe(0);
    }
  });
});
