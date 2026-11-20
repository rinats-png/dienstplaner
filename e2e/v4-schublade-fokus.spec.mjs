/* V4-2d: Fokusführung der Seitenleisten-Schublade per Tastatur (WCAG 2.4.3 Focus Order), 390 px.
   Befund (CI #430, docs/acc45/v4-2-nachweis.md, Nachtrag CI #430): Nach dem Öffnen per Enter auf der Menütaste blieb der
   Fokus auf der Menütaste, obwohl die Schublade offen und sichtbar war. Ursache (belegt, Nachweis Abschnitt 9): Bei
   „Bewegung reduzieren“ (prefers-reduced-motion: reduce; Playwright-Vorgabe der Suite) setzt App.jsx global
   transition-duration:.01ms !important. Damit wird der Sichtbarkeitswechsel der Schublade (ui/geraete.js) zu einem echten
   Übergang; beim focus() in seitenleisteFokus ist die berechnete Sichtbarkeit noch „hidden“, der Browser verwirft den Fokus.
   Ohne reduzierte Bewegung landete der Fokus (Dauer 0 s, kein Übergang).
   Diese Spec prüft beide Einstellungen, OHNE dass der Test den Fokus selbst setzt (anders als
   v4-seitenleiste-kontrast.spec.mjs, die nur den Kontrast misst):
   1. Menütaste fokussieren, Enter: Fokus auf dem aktiven Eintrag (aria-current="page") in der Schublade, Fokusring sichtbar.
   2. Escape: Schublade zu, Fokus zurück auf der Menütaste (Auslöser).
   3. Erneut öffnen (Enter), Eintrag per Enter wählen: Schublade zu, Fokus zurück auf der Menütaste.
   Fokus-Assertions mit expect.poll (Bedingung statt Pause). Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt
   390x844); Code und Herkunft aus dem Zugangspool (anmelden() in hilfen.mjs, e2e/herkunft.mjs). Keine Bildschirmfotos. */
import { test, expect, anmelden } from "./hilfen.mjs";

const PROJEKT = "390x844";

/** Wo liegt der Fokus? (Bedingung und Fehlermeldung) */
async function fokus(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    const leiste = document.querySelector("#seitenleiste");
    return {
      offen: !!leiste && leiste.classList.contains("offen"),
      inLeiste: !!a && !!leiste && leiste.contains(a),
      aufAktuell: !!a && a.matches('#seitenleiste .slink[aria-current="page"]'),
      aufMenue: !!a && a.matches(".kopf-menue"),
      aktiv: a ? `${a.tagName.toLowerCase()}${a.className ? "." + String(a.className).trim().split(/\s+/).join(".") : ""}` : null,
    };
  });
}

test.describe("V4-2d: Schublade per Tastatur – Fokus hinein und zurück (390 px)", () => {
  test.setTimeout(120_000);
  test("Enter öffnet mit Fokus auf dem aktiven Eintrag; Escape und Auswahl geben den Fokus an die Menütaste zurück", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; Schublade nur unter 1025 px");
    await anmelden(page, "leitung");
    const taste = page.locator(".kopf-menue:visible").first();

    for (const bewegung of ["reduce", "no-preference"]) {
      await page.emulateMedia({ reducedMotion: bewegung });
      const z = (s) => `${bewegung}: ${s}`;

      /* 1. Öffnen per Tastatur. */
      await taste.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".seitenleiste.offen")).toBeVisible();
      await expect.poll(() => fokus(page), { timeout: 5000, message: z("Fokus nach Öffnen auf dem aktiven Eintrag") })
        .toMatchObject({ offen: true, inLeiste: true, aufAktuell: true });
      expect(await page.locator('#seitenleiste .slink[aria-current="page"]').evaluate((e) => e.matches(":focus-visible")),
        z("Fokusring sichtbar (:focus-visible)")).toBe(true);

      /* 2. Escape: zu, Fokus zurück an den Auslöser. */
      await page.keyboard.press("Escape");
      await expect.poll(() => fokus(page), { timeout: 5000, message: z("Fokus nach Escape auf der Menütaste") })
        .toMatchObject({ offen: false, aufMenue: true });
      await expect(taste).toHaveAttribute("aria-expanded", "false");

      /* 3. Erneut öffnen, den aktiven Eintrag per Enter wählen: zu, Fokus zurück an die Menütaste. */
      await page.keyboard.press("Enter");
      await expect.poll(() => fokus(page), { timeout: 5000, message: z("Fokus nach erneutem Öffnen auf dem aktiven Eintrag") })
        .toMatchObject({ offen: true, aufAktuell: true });
      await page.keyboard.press("Enter");
      await expect.poll(() => fokus(page), { timeout: 5000, message: z("Fokus nach Auswahl auf der Menütaste") })
        .toMatchObject({ offen: false, aufMenue: true });
    }
  });
});
