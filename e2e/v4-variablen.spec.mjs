/* V4-2b: --v4-*-Variablen in der Anwendung immer gesetzt und an data-thema gebunden.
   Befund (Review #425 H2, docs/acc45/v4-2-nachweis.md §6): Nach Anmeldung und Neuladen (F5) mit Sitzung fehlten
   <style id="v4-stil"> und --v4-flaeche; .seitenleiste, .karte und .btn-primary hatten keinen Hintergrund
   (rgba(0, 0, 0, 0)), in der Schublade (390 px, hell) stand weiße Schrift auf hellem Inhalt. Außerdem folgten die
   Variablen dem Systemthema statt dem data-thema der Anwendung.
   Geprüft je Fall: Anmeldung → F5 → computed background der drei Klassen ist die Token-Farbe des App-Themas (nicht
   transparent), bei 390 px und 1280 px; App-Thema über die gemerkte Wahl dieses Geräts (centric.thema, schreibt nichts
   auf dem Server), Systemthema über emulateMedia — auch System ≠ App. Dazu ein Themenwechsel in der App ohne Neuladen
   (keine Wahl gemerkt, System wechselt). Läuft einmal je Lauf im Projekt 390x844 und stellt die Breiten selbst ein. */
import { test, expect, anmelden } from "./hilfen.mjs";
import { V4_FARBEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
/** [App-Thema (gemerkte Wahl), Systemthema] — beide Themen, jeweils mit abweichendem und gleichem System. */
const FAELLE = [["hell", "dark"], ["dunkel", "light"], ["hell", "light"], ["dunkel", "dark"]];

const rgb = (hex) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

/** Zustand der Wurzel und Flächen der Befundklassen, so wie der Browser sie berechnet. */
async function messen(page) {
  return page.evaluate(() => {
    const w = document.documentElement;
    const cs = getComputedStyle(w);
    const flaeche = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).backgroundColor : null; };
    return {
      thema: w.getAttribute("data-thema"),
      app: w.hasAttribute("data-v4-app"),
      v4Flaeche: cs.getPropertyValue("--v4-flaeche").trim(),
      seitenleiste: flaeche(".seitenleiste"),
      karte: flaeche(".karte"),
      primaer: flaeche(".btn-primary"),
    };
  });
}

function pruefen(m, thema, wo) {
  const t = V4_FARBEN[thema];
  expect(m.app, `${wo}: data-v4-app`).toBe(true);
  expect(m.thema, `${wo}: data-thema`).toBe(thema);
  expect(m.v4Flaeche, `${wo}: --v4-flaeche`).toBe(t.flaeche);
  expect(m.seitenleiste, `${wo}: .seitenleiste vorhanden`).not.toBeNull();
  expect(m.seitenleiste, `${wo}: .seitenleiste opak`).toBe(rgb(t.sidebar));
  expect(m.karte, `${wo}: .karte vorhanden`).not.toBeNull();
  expect(m.karte, `${wo}: .karte opak`).toBe(rgb(t.flaeche));
  expect(m.primaer, `${wo}: .btn-primary vorhanden`).not.toBeNull();
  expect(m.primaer, `${wo}: .btn-primary opak`).toBe(rgb(t.accent));
}

async function bereit(page) {
  await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
  await page.waitForSelector(".karte", { timeout: 30000 });
  await page.waitForSelector(".btn-primary", { state: "attached", timeout: 30000 });
}

test.describe("V4-2b: --v4-*-Variablen nach Neuladen mit Sitzung", () => {
  for (const [appThema, system] of FAELLE) {
    test(`App ${appThema}, System ${system === "dark" ? "dunkel" : "hell"}: F5 mit Sitzung`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
      await page.emulateMedia({ colorScheme: system });
      await page.addInitScript((w) => { try { localStorage.setItem("centric.thema", w); } catch { /* ohne Speicher */ } }, appThema);
      await anmelden(page, "leitung");
      for (const breite of BREITEN) {
        await page.setViewportSize(breite);
        await page.reload({ waitUntil: "load" });
        await bereit(page);
        pruefen(await messen(page), appThema, `${breite.width} px nach F5`);
      }
    });
  }

  test("Themenwechsel in der App ohne Neuladen (keine Wahl gemerkt, System wechselt)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await page.emulateMedia({ colorScheme: "light" });
    await anmelden(page, "leitung");
    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.emulateMedia({ colorScheme: "light" });
      await page.reload({ waitUntil: "load" });
      await bereit(page);
      pruefen(await messen(page), "hell", `${breite.width} px hell`);
      await page.emulateMedia({ colorScheme: "dark" });
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-thema"))).toBe("dunkel");
      pruefen(await messen(page), "dunkel", `${breite.width} px nach Wechsel auf dunkel`);
    }
  });
});
