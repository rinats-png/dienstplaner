/* V4-3b (neunter Schnitt, Einstieg): Inline-Radien des Einstiegs (src/main.jsx, src/betreiber-2fa.jsx,
   src/verlustweg.jsx, src/rechtstexte.jsx) aus den Radiusstufen und die Überlagerung des Rechtsfensters aus
   V4_UEBERLAGERUNG (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Einstieg). Geprüft im Browser (computed
   style), je bei 390 px und 1024 px, hell, OHNE Anmeldung (die Startseite der Suite zeigt die Anmeldung mit Code, weil
   der Aufbau keine Demozugänge anlegt):
     - Anmeldung mit Code: jedes Element mit var(--v4-r-…) im Inline-Stil hat den Radius seiner Stufe; Feld Zugangscode
       mittel (12 px), Knopf „Anmelden“ pille;
     - „Zweiten Faktor einrichten oder verwalten“ klappt den Bereich auf (nur Oberfläche, kein Aufruf); dort ebenso;
       wieder zugeklappt;
     - „Impressum“ öffnet das Rechtsfenster (role=dialog „Rechtliche Angaben“): Überlagerung = V4_UEBERLAGERUNG.hell,
       „Schließen“ klein (8 px); Escape schließt, der Fokus geht zurück auf „Impressum“.
   Es wird kein Zugangscode eingegeben oder abgeschickt. Keine Anmeldung, daher kein Code aus dem Zugangspool; die
   Herkunft je Test setzt hilfen.mjs (e2e/herkunft.mjs, vorzeichenlos) — GET /api/demos der Startseite ist gebremst.
   Nur Projekt 390x844 (die Breiten stellt der Test selbst ein). Zeitgrenze 150 s wie v4-3b-telefonschale-form. */
import { test, expect } from "./hilfen.mjs";
import { V4_RADIEN, V4_UEBERLAGERUNG } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page) => page.evaluate(() => [...document.querySelectorAll('[style*="--v4-r-"]')]
  .filter((e) => e.getBoundingClientRect().width > 0)
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })));

const radiusVon = (loc) => loc.evaluate((e) => getComputedStyle(e).borderTopLeftRadius);
const zahlen = (s) => (String(s).match(/[\d.]+/g) || []).map(Number);

async function stufenPruefen(page, wo) {
  let n = 0;
  for (const x of await tokenRadien(page)) {
    if (!x.stufe) continue;
    n++;
    expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${x.stufe}`).toContain(x.stufe);
    expect(x.oben, `${wo}: --v4-r-${x.stufe}`).toBe(V4_RADIEN[x.stufe]);
  }
  expect(n, `${wo}: Stellen mit Radiusstufe`).toBeGreaterThan(0);
  return n;
}

test.describe("V4-3b: Einstieg mit Radiusstufen", () => {
  test.setTimeout(150_000);
  test("Anmeldung mit Code, zweiter Faktor, Rechtsfenster; 390/1024 px, ohne Anmeldung", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "load" });

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      const feld = page.locator("#code");
      await expect(feld, `${wo}: Feld Zugangscode`).toBeVisible({ timeout: 30000 });
      await expect(feld).toHaveValue("");

      await stufenPruefen(page, `${wo} Anmeldung`);
      expect(await radiusVon(feld), `${wo}: Feld Zugangscode mittel`).toBe(V4_RADIEN.mittel);
      const anmelden = page.getByRole("button", { name: "Anmelden", exact: true }).first();
      await expect(anmelden).toBeDisabled();
      expect(await radiusVon(anmelden), `${wo}: Anmelden pille`).toBe(V4_RADIEN.pille);

      const zf = page.getByRole("button", { name: "Zweiten Faktor einrichten oder verwalten" });
      await zf.click();
      await expect(page.getByRole("button", { name: "Zwei-Faktor-Einrichtung schließen" })).toBeVisible();
      await expect.poll(async () => (await tokenRadien(page)).length, { message: `${wo}: Bereich zweiter Faktor mit Radiusstufen` })
        .toBeGreaterThan(3);
      await stufenPruefen(page, `${wo} zweiter Faktor`);
      await page.getByRole("button", { name: "Zwei-Faktor-Einrichtung schließen" }).click();
      await expect(zf).toBeVisible();

      const impressum = page.getByRole("button", { name: "Impressum", exact: true });
      await impressum.click();
      const fenster = page.getByRole("dialog", { name: "Rechtliche Angaben" });
      await expect(fenster).toBeVisible();
      await expect.poll(async () => zahlen(await fenster.evaluate((e) => getComputedStyle(e).backgroundColor)),
        { message: `${wo}: Überlagerung V4_UEBERLAGERUNG.hell` })
        .toEqual(zahlen(V4_UEBERLAGERUNG.hell));
      expect(await radiusVon(fenster.getByRole("button", { name: "Schließen" })), `${wo}: Schließen klein`).toBe(V4_RADIEN.klein);
      await page.keyboard.press("Escape");
      await expect(fenster).toBeHidden();
      await expect.poll(() => page.evaluate(() => (document.activeElement?.textContent || "").trim()),
        { message: `${wo}: Fokus zurück auf Impressum` }).toBe("Impressum");
    }
  });
});
