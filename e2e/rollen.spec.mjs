/* Startansicht und Kernansicht je Rolle, auf jedem Bildschirm:
   lädt ohne Konsolenfehler, Kernansicht erreichbar, kein waagerechtes Scrollen.

   Laden und Darstellung sind getrennte Tests: Ein bekannter Darstellungsfehler
   (test.fail) soll keine Konsolenfehler oder fehlende Ansichten verdecken. */
import { test, expect, mitSitzung, starten, ansicht, waagerechterUeberlauf } from "./hilfen.mjs";
import { BETRIEB, RAUM } from "./testdaten.mjs";

const MONAT = () => new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric",
  timeZone: "Europe/Berlin" }).format(new Date());

const monatsplan = async (page) => {
  await ansicht(page, "Monatsplan", "plan");
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(MONAT()) })).toBeVisible();
  await expect(page.getByRole("main").getByText(/2 Wohnbereiche/).first()).toBeVisible();
};

/** Kernansicht je Rolle: wie man hinkommt und woran man sie erkennt. */
const KERN = {
  leitung: monatsplan,
  planer: monatsplan,
  /* Schichtverantwortung: kein Monatsplan, aber das Lagebild der eigenen Einheit. */
  subplaner: async (page) => {
    await ansicht(page, "Lagebild", "lage");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 }).first()).toBeVisible();
  },
  betriebsrat: monatsplan,
  mitarbeiter: async (page) => {
    await page.getByRole("navigation").getByRole("button", { name: /Mein Plan/ }).click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/Frühdienst|Spätdienst/).first()).toBeVisible();
  },
  betreiber: async (page) => {
    await expect(page.getByText(RAUM).or(page.getByText(BETRIEB)).first()).toBeVisible();
  },
};

/* --------------------------------------------------------------------------
   BEKANNTE DARSTELLUNGSBEFUNDE — als test.fail() markiert, nicht versteckt.
   Wird einer behoben, meldet Playwright „unerwartet bestanden“ (rot): dann
   die Zeile hier streichen. Schlüssel: "<projekt>:<prüfung>".
   -------------------------------------------------------------------------- */
const FELDMODUS = "Kopfleiste bei 768 px: Knopf „Feldmodus“ ragt 3–4 px über den Rand "
  + "(Seite 771–772 px). Gefunden mit WP-33, nicht behoben.";
const BEKANNT = {
  "tablet:leitung": FELDMODUS,
  "tablet:planer": FELDMODUS,
  "tablet:subplaner": FELDMODUS,
  "tablet:betriebsrat": FELDMODUS,
  "tablet:abrechnung": FELDMODUS,
  "tablet:handbuch": FELDMODUS,
  "telefon:abrechnung": "Abrechnungsdaten-Kopf: Seite 601 px bei 390 px (Browsertest Kette B, offen).",
  "telefon:handbuch": "Handbuch-Inhalt läuft am Telefon über: Seite 620 px bei 390 px (Browsertest Kette B, offen).",
};
function bekannt(testInfo, pruefung) {
  const grund = BEKANNT[`${testInfo.project.name}:${pruefung}`];
  if (grund) {
    testInfo.annotations.push({ type: "bekannter Befund", description: grund });
    test.fail(true, grund);
  }
}

async function ueberlaufMessen(page, wo, sammlung) {
  const m = await waagerechterUeberlauf(page);
  if (m.scroll > m.breite) sammlung.push(`${wo}: Seite ${m.scroll}px bei ${m.breite}px — ${m.verursacher.slice(0, 3).join("; ")}`);
}

for (const rolle of Object.keys(KERN)) {
  test.describe(`Rolle ${rolle}`, () => {
    test.beforeEach(async ({ page }) => { await mitSitzung(page, rolle); });

    test("Startansicht und Kernansicht laden ohne Konsolenfehler", async ({ page, konsolenfehler }) => {
      await starten(page, rolle);
      await KERN[rolle](page);
      expect(konsolenfehler).toEqual([]);
    });

    test("kein waagerechtes Scrollen (Start- und Kernansicht)", async ({ page }, testInfo) => {
      bekannt(testInfo, rolle);
      const befunde = [];
      await starten(page, rolle);
      await ueberlaufMessen(page, "Start", befunde);
      await KERN[rolle](page);
      await ueberlaufMessen(page, "Kern", befunde);
      expect(befunde).toEqual([]);
    });
  });
}

test.describe("Darstellung weiterer Ansichten (Leitung)", () => {
  test.beforeEach(async ({ page }) => { await mitSitzung(page, "leitung"); });

  for (const [pruefung, beschriftung] of [["abrechnung", "Abrechnungsdaten"], ["handbuch", "Handbuch"]]) {
    test(`${beschriftung}: lädt ohne Konsolenfehler`, async ({ page, konsolenfehler }) => {
      await starten(page, "leitung");
      await ansicht(page, beschriftung, pruefung);
      await expect(page.getByRole("heading", { level: 1, name: new RegExp(beschriftung) })).toBeVisible();
      expect(konsolenfehler).toEqual([]);
    });

    test(`${beschriftung}: kein waagerechtes Scrollen`, async ({ page }, testInfo) => {
      bekannt(testInfo, pruefung);
      await starten(page, "leitung");
      await ansicht(page, beschriftung, pruefung);
      await expect(page.getByRole("heading", { level: 1, name: new RegExp(beschriftung) })).toBeVisible();
      /* Das Handbuch lädt seinen Inhalt nach. */
      await expect(page.getByText("Handbuch wird geladen")).toHaveCount(0);
      const befunde = [];
      await ueberlaufMessen(page, beschriftung, befunde);
      expect(befunde).toEqual([]);
    });
  }
});
