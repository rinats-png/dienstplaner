/* V4-3b (sechster Schnitt, Betreiberkonsole): Inline-Radien und Farbliteral der Konsole aus den Tokens
   (docs/acc45/V4-IST-STAND-2026-11-20.md, Nachtrag V4-3b Betreiberkonsole). Geprüft im Browser (computed style), je bei
   390 px und 1024 px, angemeldet als Betreiber (Code aus global-setup.mjs, lokal ohne zweiten Faktor):
     - Mandanten: Rollenkürzel 21×21 (Stufe klein, 8 px); Monatspreis-Kachel mit der Fläche C.bg (vorher rgba-Literal);
       jedes Element im Inhalt mit var(--v4-r-…) im Inline-Stil hat den Radius seiner Stufe aus V4_RADIEN;
     - Details eines Mandanten: Symbole der Abrechnung 24×24 (Stufe klein);
     - Neuer Mandant: Auswahl der Zugangsarten (Stufe mittel); das Feld des zweiten Faktors behält seinen Accessible Name.
   Meldung „angelegt“, Zugangscode, Fehlermeldung und Aussetzungszeile erscheinen nur nach einer Schreibaktion; sie
   sind über die feste Tabelle und die Rückrechnung auf den Basis-Quelltext belegt (pruefungen/v4-3b-betreiber.test.js).
   Der Test liest nur (Ansichten öffnen, kein Anlegen, kein Speichern). Bremsen-Bilanz: 1 Anmeldung als Betreiber je
   Lauf (nur Projekt 390x844; Breitenwechsel ohne neue Anmeldung). Herkunft je Test über die Fixture in hilfen.mjs
   (e2e/herkunft.mjs). Zeitgrenze 150 s. */
import { test, expect } from "./hilfen.mjs";
import { BETREIBER_VAR } from "./umgebung.mjs";
import { V4_RADIEN, v4AlsAltePalette } from "../src/v4/tokens.js";

const PROJEKT = "390x844";
const BREITEN = [{ width: 390, height: 844 }, { width: 1024, height: 768 }];

/** Elemente unter `wurzel` mit var(--v4-r-…) im Inline-Stil: Stufe und berechneter Radius (oben links). */
const tokenRadien = (page, wurzel) => page.evaluate((w) => [...document.querySelectorAll(`${w} [style*="--v4-r-"]`)]
  .map((e) => ({ stufe: (e.style.borderRadius.match(/--v4-r-([a-z]+)/) || [])[1] || null,
    oben: getComputedStyle(e).borderTopLeftRadius })), wurzel);

/** Alle gefundenen Stellen haben den Radius ihrer Stufe. */
async function pruefeStufen(page, wo) {
  for (const r of await tokenRadien(page, "main")) {
    if (!r.stufe) continue; /* --v4-r- in anderer Eigenschaft */
    expect(Object.keys(V4_RADIEN), `${wo}: Stufe ${r.stufe}`).toContain(r.stufe);
    expect(r.oben, `${wo}: --v4-r-${r.stufe}`).toBe(V4_RADIEN[r.stufe]);
  }
}

/** Ansicht der Konsole über die Schublade (Menüknopf, Eintrag der Seitenleiste) öffnen. */
async function oeffne(page, name) {
  if (!(await page.locator(".seitenleiste.offen").count())) await page.locator("header button").first().click();
  const l = page.locator(".seitenleiste .slink", { hasText: name }).first();
  await expect(l, `Navigationseintrag ${name}`).toBeVisible();
  await l.click();
  await expect(page.locator("main h1", { hasText: name }).first()).toBeVisible({ timeout: 15000 });
}

/** Hex → rgb(…) wie getComputedStyle. */
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test.describe("V4-3b: Betreiberkonsole mit Radiusstufen und Palette", () => {
  test.setTimeout(150_000);
  test("Mandanten, Details, Neuer Mandant 390/1024 px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "einmal je Lauf; die Breiten stellt der Test selbst ein");
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "load" });
    await page.locator("input").first().fill(bcode, { timeout: 30000 });
    await page.getByRole("button", { name: /anmelden/i }).first().click();
    await page.waitForSelector(".m-tabs, .kopfleiste, header", { timeout: 30000 });

    for (const breite of BREITEN) {
      const wo = `${breite.width} px`;
      await page.setViewportSize(breite);
      await page.reload({ waitUntil: "load" });

      await oeffne(page, "Mandanten");
      await expect(page.getByRole("button", { name: "Mandant anlegen" }).first()).toBeVisible();
      await expect.poll(async () => page.evaluate(() => [...document.querySelectorAll("main span")]
        .filter((e) => e.style.width === "21px" && e.style.height === "21px").length), { message: `${wo}: Rollenkürzel` })
        .toBeGreaterThanOrEqual(1);
      const kuerzel = await page.evaluate(() => [...document.querySelectorAll("main span")]
        .filter((e) => e.style.width === "21px" && e.style.height === "21px")
        .map((e) => ({ inline: e.style.borderRadius, r: getComputedStyle(e).borderTopLeftRadius })));
      for (const k of kuerzel) {
        expect(k.inline, `${wo}: Rollenkürzel Stufe`).toBe("var(--v4-r-klein)");
        expect(k.r, `${wo}: Rollenkürzel Radius`).toBe(V4_RADIEN.klein);
      }
      const kachel = await page.evaluate(() => [...document.querySelectorAll("main .karte")]
        .filter((e) => (e.firstElementChild || {}).textContent === "Monatspreis")
        .map((e) => getComputedStyle(e).backgroundColor));
      expect(kachel.length, `${wo}: Monatspreis-Kacheln`).toBeGreaterThanOrEqual(1);
      for (const b of kachel) expect(b, `${wo}: Monatspreis-Kachel C.bg (hell)`).toBe(rgb(v4AlsAltePalette("hell").bg));
      await pruefeStufen(page, `${wo} Mandanten`);

      await page.getByRole("button", { name: "Details" }).first().click();
      await expect(page.getByText("Aktuelle Abrechnung").first()).toBeVisible({ timeout: 15000 });
      const symbole = await page.evaluate(() => [...document.querySelectorAll("main span")]
        .filter((e) => e.style.width === "24px" && e.style.height === "24px" && /--v4-r-/.test(e.style.borderRadius))
        .map((e) => ({ inline: e.style.borderRadius, r: getComputedStyle(e).borderTopLeftRadius })));
      expect(symbole.length, `${wo}: Symbole der Abrechnung`).toBeGreaterThanOrEqual(1);
      for (const s of symbole) {
        expect(s.inline).toBe("var(--v4-r-klein)");
        expect(s.r, `${wo}: Symbol Radius`).toBe(V4_RADIEN.klein);
      }
      await pruefeStufen(page, `${wo} Details`);

      await oeffne(page, "Neuer Mandant");
      await expect(page.getByLabel("Code aus der Authenticator-App (zweiter Faktor)")).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Anlegen und Zugänge erzeugen" })).toHaveCount(1);
      const auswahl = await page.evaluate(() => [...document.querySelectorAll("main label")]
        .filter((e) => /--v4-r-mittel/.test(e.style.borderRadius)).map((e) => getComputedStyle(e).borderTopLeftRadius));
      expect(auswahl.length, `${wo}: Auswahl Zugangsart`).toBe(5);
      for (const r of auswahl) expect(r, `${wo}: Auswahl Radius`).toBe(V4_RADIEN.mittel);
      await pruefeStufen(page, `${wo} Neuer Mandant`);
    }
  });
});
