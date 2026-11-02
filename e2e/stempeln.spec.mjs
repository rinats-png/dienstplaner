/* Stempeln am Telefon (390 × 844) — online mit Erfolg, offline mit ehrlicher Absage.
   Offline-Stempeln mit Nachholen kommt mit WP-07; bis dahin darf es nicht
   nach Erfolg aussehen. */
import { test, expect, zugang, mitSitzung, starten } from "./hilfen.mjs";
import { BASIS } from "./umgebung.mjs";
import { heute, PERSON } from "./testdaten.mjs";

/** Stempelstand einer Person heute, gelesen mit der Sitzung der Leitung. */
async function stempelstand(personId) {
  const a = await fetch(`${BASIS}/api/bestand`, { headers: { authorization: `Bearer ${zugang("leitung").token}` } });
  const d = await a.json();
  return (d.bestand.mandanten[0].einstempeln || {})[`${personId}|${heute()}`] || null;
}

test.describe("Stempeln am Telefon", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "telefon", "Stempeln wird am Telefon geprüft");
  });

  test("Beschäftigte stempeln ein: Bestätigung und Eintrag beim Server", async ({ page, konsolenfehler }) => {
    await mitSitzung(page, "mitarbeiter");
    await starten(page, "mitarbeiter");
    expect(await stempelstand(PERSON.mitarbeiter)).toBeNull();
    const knopf = page.getByRole("button", { name: "Einstempeln" });
    await expect(knopf).toBeVisible();
    await knopf.click();
    await expect(page.getByText(/Eingestempelt \d{1,2}:\d{2}/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Ausstempeln" })).toBeVisible();
    const stand = await stempelstand(PERSON.mitarbeiter);
    expect(stand && stand.start, "Server hat einen Beginn vermerkt").toBeTruthy();
    expect(konsolenfehler).toEqual([]);
  });

  test("offline stempeln: Fehlermeldung statt Erfolg, nichts vermerkt", async ({ page, context }) => {
    await mitSitzung(page, "mitarbeiterOffline");
    await starten(page, "mitarbeiterOffline");
    const knopf = page.getByRole("button", { name: "Einstempeln" });
    await expect(knopf).toBeVisible();
    await context.setOffline(true);
    try {
      await knopf.click();
      /* Die Anwendung zeigt die Fehlermeldung des Browsers oder ihre eigene. */
      await expect(page.getByText(/Failed to fetch|nicht geklappt|Verbindung|Netz/i).first()).toBeVisible();
      await expect(page.getByText(/Eingestempelt \d{1,2}:\d{2}/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Einstempeln" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    expect(await stempelstand(PERSON.mitarbeiterOffline)).toBeNull();
  });
});
