/* V4-3b (zwölfter Schnitt, Querschnitt/Bausteine Teil 1): Inline-Radien der Bausteine aus App.jsx, ui/farbwahl.jsx
   und ui/diagramme.jsx aus den Radiusstufen (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag Querschnitt Teil 1).
   Geprüft im Browser (berechneter Stil), je bei 390 px und 1024 px, hell, angemeldet als Leitung (Zugangspool,
   hilfen.mjs anmelden):
     - Ansicht „Betrieb“: jede Stelle mit Radiusstufe im Inline-Stil hat den Radius ihrer Stufe (V4_RADIEN); die
       Schalter der Rechte-Matrix (25×25) sind klein (8 px), die Farbpunkte (18×18) pille.
     - Erster Farbpunkt: Auswahlfläche öffnet (Gruppe „Farbe wählen“), Fläche mittel (12 px), Kacheln klein (8 px),
       Zustand aria-expanded wechselt; Schließen per erneutem Klick, keine Farbe gewählt.
     - Kürzel im Fuß der Seitenleiste (30×30) klein (8 px). Die Seitenleiste ist bis 1024 px eine Schublade hinter
       der Menütaste und ab 1025 px ausgeblendet (gestalt/stil.js); der Test öffnet sie, wo die Menütaste sichtbar
       ist, und schließt mit Escape. Mindestens eine Breite muss das Kürzel messen.
     - kein waagrechtes Scrollen.
   Ladeplatzhalter, Fehlerauffang, Hinweis-Streifen, Post-Zähler und Systemprüfung erscheinen nur in besonderen
   Zuständen; sie sind über Rückrechnung und Quelltext belegt (pruefungen/v4-3b-querschnitt-1.test.js), nicht hier.
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (e2e/herkunft.mjs, vorzeichenlos). Zeitgrenze 150 s. Der Test schreibt nichts. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Stellen mit Radiusstufe im Inline-Stil (sichtbar): Stufe und berechneter Radius der oberen linken Ecke. */
const stufen = () => [...document.querySelectorAll('[style*="--v4-r-"]')].filter((e) => e.getBoundingClientRect().width > 0)
  .map((e) => ({ stufe: (e.getAttribute("style").match(/--v4-r-([a-z]+)/) || [])[1], wert: getComputedStyle(e).borderTopLeftRadius }));

test.describe("V4-3b: Querschnitt Teil 1 mit Radiusstufen", () => {
  test.setTimeout(150_000);
  test("Betrieb: Rechte-Matrix, Farbpunkt und Auswahlfläche, Kürzel der Seitenleiste; 390/1024 px, nur lesend", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "leitung");

    let kuerzelGemessen = 0;
    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
      await geheZu(page, "Betrieb");

      const schalter = page.locator("table button[aria-pressed]");
      await expect.poll(() => schalter.count(), { message: `${wo}: Schalter der Rechte-Matrix`, timeout: 20000 }).toBeGreaterThan(0);
      const s = await schalter.first().evaluate((e) => ({ inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius }));
      expect(s, `${wo}: Schalter Rechte-Matrix`).toEqual({ inline: "var(--v4-r-klein)", wert: V4_RADIEN.klein });

      const punkt = page.locator('button[aria-expanded][title^="Farbe von "]').first();
      await expect(punkt, `${wo}: Farbpunkt`).toBeVisible({ timeout: 15000 });
      expect(await punkt.evaluate((e) => getComputedStyle(e).borderTopLeftRadius), `${wo}: Farbpunkt pille`).toBe(V4_RADIEN.pille);

      /* Jede Inline-Stufe der Seite hat den Radius ihrer Stufe. */
      const alle = await page.evaluate(stufen);
      expect(alle.length, `${wo}: Inline-Stufen`).toBeGreaterThan(0);
      for (const x of alle) expect(x.wert, `${wo}: Stufe ${x.stufe}`).toBe(V4_RADIEN[x.stufe]);

      /* Auswahlfläche öffnen, messen, ohne Wahl schließen. */
      await punkt.scrollIntoViewIfNeeded();
      await punkt.click();
      const gruppe = page.getByRole("group", { name: "Farbe wählen" });
      await expect(gruppe, `${wo}: Auswahlfläche`).toBeVisible({ timeout: 10000 });
      await expect(punkt).toHaveAttribute("aria-expanded", "true");
      const f = await gruppe.evaluate((g) => ({ inline: g.parentElement.style.borderRadius, wert: getComputedStyle(g.parentElement).borderTopLeftRadius,
        kacheln: [...g.querySelectorAll("button")].map((b) => getComputedStyle(b).borderTopLeftRadius) }));
      expect([f.inline, f.wert], `${wo}: Auswahlfläche mittel`).toEqual(["var(--v4-r-mittel)", V4_RADIEN.mittel]);
      expect(f.kacheln.length, `${wo}: Kacheln`).toBe(30);
      expect([...new Set(f.kacheln)], `${wo}: Kacheln klein`).toEqual([V4_RADIEN.klein]);
      await punkt.click();
      await expect(gruppe, `${wo}: Auswahlfläche zu`).toBeHidden({ timeout: 10000 });
      await expect(punkt).toHaveAttribute("aria-expanded", "false");

      const menue = page.locator(".kopf-menue:visible").first();
      if (await menue.count()) {
        /* Seitenleiste als Schublade (bis 1024 px): Kürzel im Fuß; Escape schließt (WP-21). */
        await menue.click();
        await expect(page.locator(".seitenleiste.offen"), `${wo}: Schublade offen`).toHaveCount(1, { timeout: 10000 });
        const kuerzel = page.locator(".seitenleiste .sfuss span").first();
        await expect(kuerzel, `${wo}: Kürzel der Seitenleiste`).toBeVisible({ timeout: 10000 });
        const k = await kuerzel.evaluate((e) => ({ inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius,
          b: Math.round(e.getBoundingClientRect().width) }));
        expect(k, `${wo}: Kürzel 30×30 klein`).toEqual({ inline: "var(--v4-r-klein)", wert: V4_RADIEN.klein, b: 30 });
        await page.keyboard.press("Escape");
        await expect(page.locator(".seitenleiste.offen"), `${wo}: Schublade zu`).toHaveCount(0, { timeout: 10000 });
        kuerzelGemessen++;
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${wo}: kein waagrechtes Scrollen`)
        .toBe(true);
    }
    expect(kuerzelGemessen, "Kürzel der Seitenleiste mindestens einmal gemessen").toBeGreaterThan(0);
  });
});
