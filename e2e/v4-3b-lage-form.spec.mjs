/* V4-3b (fünfter Schnitt, Lage/Dashboard): Inline-Radien der Lage-Ansichten aus den Radiusstufen der Tokens
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Lage). Geprüft im Browser (computed style), je bei 390 px
   und 1024 px:
     - Ablauf: Stationsnummern 24×24 (Stufe pille); jedes Element im Inhalt mit var(--v4-r-…) im Inline-Stil hat den
       Radius der Stufe aus V4_RADIEN (src/v4/tokens.js);
     - Zeitachse: Dienstbalken und Tagesspalte (Stufe klein); die begründete Ausnahme (Legendenquadrat 14×14 px)
       behält 5 px und bleibt ein Quadrat (die kleinste Stufe 8 px wäre > halbe Kante);
     - Start (Prioritäten) und Lagebild: alle gefundenen Stellen mit dem Radius ihrer Stufe (die Anzahl hängt von den
       Demo-Daten ab).
   Notrufe (Statuspunkt) ist über den Render-Test belegt (pruefungen/v4-3b-lage.test.js), Tagesstart und Einführung
   über Quelltext und feste Tabelle; sie erscheinen nur in einem bestimmten Zustand (Notruf offen, Ersteinrichtung,
   Einführung).
   Klassennamen und Accessible Names bleiben; der Test liest sie nur. Er ändert nichts auf dem Server (nur Ansichten
   öffnen). Bremsen-Bilanz: 1 Anmeldung als Leitung je Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung).
   Code und Herkunft je Test aus dem Zugangspool (hilfen.mjs anmelden, e2e/herkunft.mjs). Zeitgrenze 150 s. */
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { V4_RADIEN } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente unter `wurzel` mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page, wurzel) => page.evaluate((w) => [...document.querySelectorAll(`${w} [style*="--v4-r-"]`)]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })), wurzel);

/** Alle gefundenen Stellen haben den Radius ihrer Stufe; mindestens `min` Stellen. */
async function pruefeStufen(page, wurzel, min, wo) {
  if (min > 0) {
    await expect.poll(async () => (await tokenRadien(page, wurzel)).length, { message: `${wo}: Stellen mit Radiusstufe` })
      .toBeGreaterThanOrEqual(min);
  }
  const alle = await tokenRadien(page, wurzel);
  for (const r of alle) {
    if (!r.stufe) continue; /* Element mit --v4-r- in anderer Eigenschaft */
    expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${r.stufe}`).toContain(r.stufe);
    expect(r.oben, `${wo}: --v4-r-${r.stufe}`).toBe(V4_RADIEN[r.stufe]);
  }
  return alle;
}

test.describe("V4-3b: Lage/Dashboard mit Radiusstufen aus den Tokens", () => {
  test.setTimeout(150_000);
  test("Ablauf, Zeitachse, Start, Lagebild 390/1024 px; Ausnahme Legendenquadrat unverändert", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    await anmelden(page, "leitung");

    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });

      await geheZu(page, "Ablauf");
      const a = await pruefeStufen(page, "main", 1, `${breite.width} px Ablauf`);
      expect(a.filter((r) => r.stufe === "pille").length, `${breite.width} px Ablauf: Stationsnummern`)
        .toBeGreaterThanOrEqual(1);

      await geheZu(page, "Zeitachse");
      const z = await pruefeStufen(page, "main", 1, `${breite.width} px Zeitachse`);
      expect(z.filter((r) => r.stufe === "klein").length, `${breite.width} px Zeitachse: Balken/Tagesspalte`)
        .toBeGreaterThanOrEqual(1);
      const legende = await page.evaluate(() => [...document.querySelectorAll("main span")]
        .filter((e) => e.style.width === "14px" && e.style.height === "14px")
        .map((e) => ({ r: getComputedStyle(e).borderTopLeftRadius, b: e.getBoundingClientRect().width,
          hh: e.getBoundingClientRect().height })));
      expect(legende.length, `${breite.width} px Zeitachse: Legendenquadrate`).toBeGreaterThanOrEqual(1);
      testInfo.annotations.push({ type: `Legendenquadrate ${breite.width} px`,
        description: `${legende.length}, ${legende[0].b}×${legende[0].hh} px` });
      for (const l of legende) {
        expect(l.r, "Legendenquadrat bleibt 5 px (Ausnahme)").toBe("5px");
        expect(parseFloat(V4_RADIEN.klein), `Kreis-Effekt: klein > halbe Kante ${Math.min(l.b, l.hh)}`)
          .toBeGreaterThan(Math.min(l.b, l.hh) / 2);
      }

      await geheZu(page, "Start");
      await pruefeStufen(page, "main", 0, `${breite.width} px Start`);
      await geheZu(page, "Lagebild");
      await pruefeStufen(page, "main", 0, `${breite.width} px Lagebild`);
    }
  });
});
