/* V4-3b (dreizehnter Schnitt, Querschnitt/Bausteine Teil 2): Inline-Radien der übrigen Bausteine (Schnellsuche,
   Handbuch, Tourleiste, Ringregler, Leer/Laden, Balken, Ziehen, Schrittleiste) aus den Radiusstufen
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag Querschnitt Teil 2).
   Geprüft im Browser (berechneter Stil), je bei 390 px und 1024 px, hell, angemeldet als Leitung (Zugangspool,
   hilfen.mjs anmelden):
     - Schnellsuche (Strg + K): Taste „Esc“ klein (8 px) und höher als 16 px (8 px bleibt unter der halben Höhe, keine
       Kapsel); Symbol der Treffer (27×27) klein; Treffer „Handbuch“ öffnet die Ansicht (Enter).
     - Handbuch: Haken-Knöpfe (26×26) klein, Kapitelmarken und Schrittnummern (22×22) pille, also Kreis.
     - jede Stelle mit Radiusstufe im Inline-Stil hat den Radius ihrer Stufe (V4_RADIEN); kein waagrechtes Scrollen.
   Tourleiste, Ringregler (Mandantenrechner/Startseite), Leerzustand, Ladestreifen, Balken (Lage, Betreiberdetail),
   Begleiter und Hinweis beim Ziehen sowie die Schrittleiste (Mandant anlegen) erscheinen nur in anderen Rollen oder
   Zuständen; sie sind über Rückrechnung, Render- und Quelltexttest belegt (pruefungen/v4-3b-querschnitt-2.test.js).
   Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Code und
   Herkunft je Test aus dem Zugangspool (e2e/herkunft.mjs, vorzeichenlos). Zeitgrenze 150 s. Der Test schreibt nichts
   außer dem, was anmelden() selbst tut. */
import { test, expect, anmelden } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Stellen mit Radiusstufe im Inline-Stil (sichtbar): Stufe und berechneter Radius der oberen linken Ecke. */
const stufen = () => [...document.querySelectorAll('[style*="--v4-r-"]')].filter((e) => e.getBoundingClientRect().width > 0)
  .map((e) => ({ stufe: (e.getAttribute("style").match(/--v4-r-([a-z]+)/) || [])[1], wert: getComputedStyle(e).borderTopLeftRadius }));
const mass = (e) => ({ inline: e.style.borderRadius, wert: getComputedStyle(e).borderTopLeftRadius,
  b: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) });

test.describe("V4-3b: Querschnitt Teil 2 mit Radiusstufen", () => {
  test.setTimeout(150_000);
  test("Schnellsuche und Handbuch: Esc-Taste, Treffersymbol, Haken und Marken; 390/1024 px, nur lesend", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });

      /* Schnellsuche öffnen (Strg + K), messen, über den Treffer „Handbuch“ weiter. */
      await page.keyboard.press("Control+k");
      const dialog = page.getByRole("dialog", { name: "Schnellsuche" });
      await expect(dialog, `${wo}: Schnellsuche`).toBeVisible({ timeout: 10000 });
      const esc = dialog.locator("kbd", { hasText: "Esc" });
      const e = await esc.evaluate(mass);
      expect([e.inline, e.wert], `${wo}: Esc klein`).toEqual(["var(--v4-r-klein)", V4_RADIEN.klein]);
      expect(e.h, `${wo}: Esc höher als 16 px (8 px < halbe Höhe)`).toBeGreaterThan(16);
      await page.keyboard.type("Handbuch");
      const treffer = dialog.getByRole("option");
      await expect.poll(() => treffer.count(), { message: `${wo}: Treffer`, timeout: 10000 }).toBeGreaterThan(0);
      const s = await treffer.first().locator("span").first().evaluate(mass);
      expect(s, `${wo}: Treffersymbol 27×27 klein`).toEqual({ inline: "var(--v4-r-klein)", wert: V4_RADIEN.klein, b: 27, h: 27 });
      await expect(treffer.first(), `${wo}: erster Treffer`).toContainText("Handbuch");
      await page.keyboard.press("Enter");
      await expect(dialog, `${wo}: Schnellsuche zu`).toBeHidden({ timeout: 10000 });

      /* Handbuch: Haken-Knöpfe klein, Kapitelmarken und Schrittnummern pille. */
      const haken = page.getByRole("button", { name: /^Als (erledigt|ungelesen) markieren$/ });
      await expect.poll(() => haken.count(), { message: `${wo}: Haken-Knöpfe`, timeout: 20000 }).toBeGreaterThan(0);
      const k = await haken.first().evaluate(mass);
      expect(k, `${wo}: Haken 26×26 klein`).toEqual({ inline: "var(--v4-r-klein)", wert: V4_RADIEN.klein, b: 26, h: 26 });
      const marken = await page.evaluate(() => [...document.querySelectorAll('span[style*="--v4-r-pille"]')]
        .filter((x) => x.getBoundingClientRect().width === 22).map((x) => getComputedStyle(x).borderTopLeftRadius));
      expect(marken.length, `${wo}: Marken 22×22`).toBeGreaterThan(0);
      expect([...new Set(marken)], `${wo}: Marken pille`).toEqual([V4_RADIEN.pille]);

      /* Jede Inline-Stufe der Seite hat den Radius ihrer Stufe. */
      const alle = await page.evaluate(stufen);
      expect(alle.length, `${wo}: Inline-Stufen`).toBeGreaterThan(0);
      for (const x of alle) expect(x.wert, `${wo}: Stufe ${x.stufe}`).toBe(V4_RADIEN[x.stufe]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${wo}: kein waagrechtes Scrollen`)
        .toBe(true);
    }
  });
});
