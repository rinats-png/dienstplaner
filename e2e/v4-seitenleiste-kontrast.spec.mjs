/* V4-2c: Kontrast der Seitenleisten-Einträge in der geöffneten Schublade (390 px), hell und dunkel.
   Befund (Review #425, docs/acc45/v4-2-nachweis.md §6): .slink.on und .slink:hover legten var(--v4-glas) unter weiße
   Schrift; hell rgba(255,255,252,.72) über der Seitenleiste = 1,76:1 (WCAG 1.4.3 verlangt 4,5:1).
   Die axe-Specs (barrierefreiheit*.spec.mjs) messen ohne geöffnete Schublade; diese Spec öffnet sie per Tastatur
   (Menütaste, Enter; Fokus auf dem aktiven Eintrag, vgl. ui/geraete.js seitenleisteFokus) und misst im Browser:
   aktiver Eintrag mit Fokusring, ein anderer Eintrag im Hover, Text >= 4,5:1 auf der gemischten Fläche, Fokusring
   >= 3:1 gegen die Seitenleiste und gegen die Füllung des aktiven Eintrags (Review #430 A2); danach axe (WCAG 2.2 AA)
   mit offener Schublade.
   Übergänge der Einträge sind für die Messung abgeschaltet (zusätzliches Stilelement nur im Test): Ein Zwischenbild
   der Überblendung hätte eine zu helle Fläche und damit falsch hohe Werte.
   Bremsen-Bilanz: 2 Anmeldungen als Leitung je Lauf (nur Projekt 390x844). Code und Herkunft je Test aus dem Zugangspool
   (anmelden() in hilfen.mjs, e2e/herkunft.mjs, umgebung.mjs ZUGANG_POOL); Bremse „anmelden-code“ 20 je 300 s und Code.
   Zeitgrenze 150 s je Fall wie v4-variablen.spec.mjs. Keine Bildschirmfotos (playwright.config.mjs); die
   Messwerte stehen als Anmerkung „kontrast“ am Testergebnis. */
import { test, expect, anmelden, axePruefen } from "./hilfen.mjs";
import { V4_FARBEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const FAELLE = [["hell", "light"], ["dunkel", "dark"]];

/** Kontrast im Browser aus den berechneten Farben: Eintragsfläche über der Seitenleiste gemischt. */
async function messen(page, selektor) {
  return page.evaluate((sel) => {
    const lies = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); const t = m[1].split(",").map((x) => parseFloat(x));
      return { rgb: t.slice(0, 3), a: t.length > 3 ? t[3] : 1 }; };
    const mische = (oben, unten) => oben.rgb.map((x, i) => x * oben.a + unten[i] * (1 - oben.a));
    const kanal = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
    const verh = (x, y) => { const [h, d] = [lum(x), lum(y)].sort((p, q) => q - p); return Math.round(((h + 0.05) / (d + 0.05)) * 100) / 100; };
    const e = document.querySelector(sel);
    const leiste = getComputedStyle(document.querySelector(".seitenleiste"));
    const cs = getComputedStyle(e);
    const grund = lies(leiste.backgroundColor).rgb;
    const flaeche = mische(lies(cs.backgroundColor), grund);
    const schrift = mische(lies(cs.color), flaeche);
    const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? lies(cs.outlineColor) : null;
    return {
      leiste: leiste.backgroundColor, grund: cs.backgroundColor, farbe: cs.color,
      text: verh(schrift, flaeche),
      ring: ring ? { breite: parseFloat(cs.outlineWidth), abstand: parseFloat(cs.outlineOffset) || 0, gegenLeiste: verh(mische(ring, grund), grund), gegenEintrag: verh(mische(ring, flaeche), flaeche) } : null,
      fokusSichtbar: e.matches(":focus-visible"),
    };
  }, selektor);
}

/** Wo liegt der Fokus, und was könnte ihn halten? (aktives Element, Schublade, offene Dialoge, Fensterfokus) */
async function fokusZustand(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    const leiste = document.querySelector(".seitenleiste");
    return {
      aufAktiv: !!a && a.matches(".seitenleiste .slink.on"),
      aktiv: a ? `${a.tagName.toLowerCase()}${a.className ? "." + String(a.className).trim().split(/\s+/).join(".") : ""}` : null,
      leiste: leiste ? { klasse: leiste.className, sichtbar: getComputedStyle(leiste).visibility } : null,
      dialoge: [...document.querySelectorAll('[aria-modal="true"]')].map((d) => (d.getAttribute("aria-label") || d.textContent || "").trim().slice(0, 60)),
      fensterFokus: document.hasFocus(),
    };
  });
}

test.describe("V4-2c: Seitenleisten-Einträge in der Schublade (390 px)", () => {
  test.setTimeout(150_000);
  for (const [thema, system] of FAELLE) {
    test(`${thema}: aktiv, Hover und Fokus >= WCAG 2.2 AA, axe mit offener Schublade`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; Schublade nur unter 1025 px");
      await page.emulateMedia({ colorScheme: system });
      await page.addInitScript((w) => { try { localStorage.setItem("centric.thema", w); } catch { /* ohne Speicher */ } }, thema);
      await anmelden(page, "leitung");
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-thema"))).toBe(thema);
      await page.addStyleTag({ content: ".slink{transition:none !important;}" });

      /* Schublade per Tastatur öffnen: Fokus springt auf den aktiven Eintrag (sichtbarer Fokusring). */
      const taste = page.locator(".kopf-menue:visible").first();
      await taste.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".seitenleiste.offen")).toBeVisible();
      /* Bedingung statt Pause: Die Schublade ist erst fokussierbar, wenn ihre berechnete Sichtbarkeit „visible“ ist
         (ui/geraete.js: visibility mit Übergang). */
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".seitenleiste")).visibility),
        { timeout: 10000, message: "Schublade sichtbar" }).toBe("visible");
      const aktiv = ".seitenleiste .slink.on";
      /* Fokus auf den aktiven Eintrag: Die App setzt ihn beim Öffnen selbst (seitenleisteFokus). Liegt er nicht dort, setzt
         ihn der Test, nach einer Tastenbetätigung (Tastatur-Modalität, damit :focus-visible gilt; unten geprüft). Wiederholt
         bis zur Zeitgrenze; im Fehlerfall nennt die Meldung das aktive Element und offene Dialoge (CI-Befund #430). */
      let versuch = 0;
      await expect.poll(async () => {
        const z = await fokusZustand(page);
        /* Beleg im Lauf-Log (CI-Befund #430: lokal grün, in CI „inactive“): Zustand je Versuch, solange nicht am Ziel. */
        if (!z.aufAktiv && versuch < 5) console.log(`V4-2c Fokus ${thema} Versuch ${++versuch}: ${JSON.stringify(z)}`);
        if (!z.aufAktiv) { await page.keyboard.press("Shift"); await page.locator(aktiv).focus().catch(() => {}); }
        return fokusZustand(page);
      }, { timeout: 15000, message: "Fokus auf dem aktiven Eintrag" }).toMatchObject({ aufAktiv: true });
      await expect(page.locator(aktiv)).toBeFocused();
      const t = V4_FARBEN[thema];
      const an = await messen(page, aktiv);
      expect(an.leiste, "Seitenleiste opak in der Tokenfarbe").toBe(`rgb(${[0, 2, 4].map((i) => parseInt(t.sidebar.slice(1 + i, 3 + i), 16)).join(", ")})`);
      expect(an.fokusSichtbar, "Fokusring sichtbar (:focus-visible)").toBe(true);
      expect(an.text, `aktiv: ${an.farbe} auf ${an.grund}`).toBeGreaterThanOrEqual(4.5);
      expect(an.ring, "Fokusring vorhanden").not.toBeNull();
      expect(an.ring.breite).toBeGreaterThanOrEqual(2);
      expect(an.ring.gegenLeiste, "Fokusring gegen Seitenleiste").toBeGreaterThanOrEqual(3);
      expect(an.ring.gegenEintrag, "Fokusring gegen Füllung des aktiven Eintrags").toBeGreaterThanOrEqual(3);

      /* Hover auf einem anderen Eintrag. */
      const anderer = page.locator(".seitenleiste .slink:not(.on)").first();
      await anderer.hover();
      await expect.poll(() => anderer.evaluate((e) => e.matches(":hover"))).toBe(true);
      await anderer.evaluate((e) => e.setAttribute("data-v4-2c-hover", ""));
      const hover = await messen(page, "[data-v4-2c-hover]");
      expect(hover.text, `Hover: ${hover.farbe} auf ${hover.grund}`).toBeGreaterThanOrEqual(4.5);
      expect(hover.grund, "Hover und aktiv unterscheidbar").not.toBe(an.grund);
      await anderer.evaluate((e) => e.removeAttribute("data-v4-2c-hover"));
      testInfo.annotations.push({ type: "kontrast", description: `${thema}: aktiv ${an.text}:1 (${an.grund}), Hover ${hover.text}:1 (${hover.grund}), `
        + `Fokusring ${an.ring.gegenLeiste}:1 gegen Leiste, ${an.ring.gegenEintrag}:1 gegen Eintrag, Abstand ${an.ring.abstand} px` });

      await axePruefen(page, testInfo, "schublade-leitung");
    });
  }
});
