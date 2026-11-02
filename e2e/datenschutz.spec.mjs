/* Keine fremden personenbezogenen Daten im DOM für Beschäftigte und Betriebsrat.
   Gegenprobe: Die Leitung bekommt dieselben Werte vom Server — die Abwesenheit
   bei MA/BR ist also Schutz und nicht bloß fehlende Testdaten. */
import { test, expect, zugang, mitSitzung, starten, ansicht } from "./hilfen.mjs";
import { BASIS } from "./umgebung.mjs";
import { FREMD } from "./testdaten.mjs";

/* Den Notfallkontakt liefert der Server niemandem über /api/bestand (sicht.mjs) — er ist
   deshalb keine aussagekräftige Probe und fehlt hier. */
const VERBOTEN = [FREMD.anschrift, FREMD.geburtstag, FREMD.geburtstagAnzeige,
  FREMD.krankheitsgrund, FREMD.nachweis];

async function domOhneFremdes(page, wo) {
  const html = await page.content();
  const gefunden = VERBOTEN.filter((w) => html.includes(w));
  expect(gefunden, `fremde Daten im DOM (${wo})`).toEqual([]);
}

test("Gegenprobe: Leitung erhält die schützenswerten Testwerte vom Server", async () => {
  const a = await fetch(`${BASIS}/api/bestand`, { headers: { authorization: `Bearer ${zugang("leitung").token}` } });
  const text = JSON.stringify(await a.json());
  /* Nur das Ergebnis vergleichen, nicht den ganzen Bestand ins Protokoll schreiben. */
  const fehlt = [FREMD.anschrift, FREMD.geburtstag, FREMD.krankheitsgrund, FREMD.nachweis]
    .filter((w) => !text.includes(w));
  expect(fehlt, "Werte, die die Leitung nicht bekommt").toEqual([]);
});

test.describe("Beschäftigte sehen keine fremden Personaldaten", () => {
  test.beforeEach(async ({ page }) => { await mitSitzung(page, "mitarbeiter"); });
  test("Heute, Mein Plan, Mehr", async ({ page }) => {
    await starten(page, "mitarbeiter");
    await domOhneFremdes(page, "Heute");
    for (const tab of [/Mein Plan/, /Anliegen/, /Mehr/]) {
      await page.getByRole("navigation").getByRole("button", { name: tab }).click();
      await expect(page.getByRole("heading").first()).toBeVisible();
      await domOhneFremdes(page, String(tab));
    }
  });
});

test.describe("Betriebsrat sieht keine fremden Personaldaten", () => {
  test.beforeEach(async ({ page }) => { await mitSitzung(page, "betriebsrat"); });
  test("Start, Monatsplan, Personal", async ({ page }, testInfo) => {
    await starten(page, "betriebsrat");
    await domOhneFremdes(page, "Start");
    await ansicht(page, "Monatsplan", "plan");
    await domOhneFremdes(page, "Monatsplan");
    /* Personal ist bis 820 px als „Für Tablet und Rechner ausgelegt“ gesperrt. */
    if (testInfo.project.name !== "desktop") return;
    await ansicht(page, "Personal", "personal");
    /* Der Betriebsrat sieht das Personal — die Kollegin selbst ist sichtbar … */
    await expect(page.getByRole("main").getByText(/Vogtland/).first()).toBeVisible();
    /* … ihre Stammdaten und ihr Krankheitsgrund nicht. */
    await domOhneFremdes(page, "Personal");
  });
});
