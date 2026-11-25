/* ZEIT-F, T-E2E-TZ (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.2): dieselben Betriebstag-Aussagen in jeder Browser-Zeitzone.

   Läuft NUR in den Zonenprojekten (e2e/zonen.mjs: tz-utc, tz-newyork, tz-tokyo, tz-pagopago), Telefon 390x844.
   Der Betriebstag ist der Berliner Kalendertag (E1); Server, Browser und Testcode laufen auf der gemeinsamen Zeitbasis
   (e2e/zeitbasis.mjs, Samstag 2026-11-14 10:00 Berlin). Geprüft wird, was die Oberfläche als „heute“ nimmt:

   Z1  Stempeluhr folgt dem Betriebstag des Servers: Eine Person ist am Berliner Tag eingestempelt (über den Server). In
       jeder Zone zeigt „Heute“ dieses Datum und „Ausstempeln“, nie „Offener Dienst von gestern“. In tz-pagopago liegt der
       Gerätetag auf dem Vortag (Vorbedingung, geprüft): Eine Oberfläche mit Gerätetag fände dort keinen Stempel und böte
       „Einstempeln“ an (Befund P2 vor ZEIT-C).
   Z2  Tageswechsel um Mitternacht Berlin: page.clock stellt die Browseruhr auf 23:58 und danach 00:02 Berlin. „Heute“
       wechselt das Datum genau dann — in New York und UTC liegt der Gerätetag um 00:02 noch auf dem Vortag, in Tokio
       um 23:58 schon auf dem Folgetag. Nur lesend; der Server bleibt auf der Zeitbasis (sein Tag ist für die
       Datumsanzeige ohne Belang).

   Schreibwirkung: Z1 stempelt die Person „stempeluhr-aus“ über den Server ein, falls sie am Tag noch keinen Stempel hat —
   derselbe Stand, den der Viewport-Test „heute-stempeluhr-ausstempeln“ herstellt (je Arbeiter ein eigener Raum).
   Kein Stempel für „stempeluhr-ein“ (Z2 liest nur). Zugangscodes werden nie ausgegeben. */
import { test, expect, anmelden, zugangscode } from "./hilfen.mjs";
import { BASIS } from "./umgebung.mjs";
import { abnahmeHeute, jetzt, tagPlus, versatzMs } from "./zeitbasis.mjs";
import { betriebstag, zeitpunktAusWanduhr } from "../server/lib/betriebszeit.mjs";
import { DOW } from "../server/lib/engine/textformat.mjs";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Datumszeile über „Heute“ (fLang in src/lib/datum.js), unabhängig von der Zone des Testprozesses gerechnet. */
function tagText(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  const wt = (new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7;
  return `${DOW[wt]}, ${t}. ${MONATE[m - 1]} ${j}`;
}

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(`${BASIS}/api/${pfad}`, { method: methode,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.39.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: rumpf ? JSON.stringify(rumpf) : undefined });
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { s: a.status, d, text };
}
const mandantVon = (g) => (((g.d.bestand || {}).mandanten) || [])[0] || {};

/** Gerätetag des Browsers (Ortszeit der emulierten Zone, wie ihn eine Oberfläche mit `new Date()` nähme). */
const geraetetag = (page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

test.describe("ZEIT-F Zonenprojekte (T-E2E-TZ)", () => {
  test("Z1 Stempeluhr und Datum folgen dem Betriebstag des Servers", async ({ page }, testInfo) => {
    const zone = testInfo.project.use.timezoneId;
    expect(zone, "Zonenprojekt mit festgelegter Browser-Zeitzone").toBeTruthy();
    const ich = (await api("anmelden", { methode: "POST", rumpf: { zugangscode: zugangscode("stempeluhr-aus") } })).d;
    expect(ich.token, "API-Anmeldung stempeluhr-aus").toBeTruthy();
    const tag = abnahmeHeute();
    const stand = async () => (mandantVon(await api("bestand", { token: ich.token })).einstempeln || {})[`${ich.person}|${tag}`] || null;
    if (!(await stand())) {
      const r = await api("stempeln", { methode: "POST", token: ich.token, rumpf: { datum: tag, art: "start" } });
      expect(r.s, `Einstempeln über den Server: ${r.text.slice(0, 160)}`).toBe(200);
    }
    const st = await stand();
    expect(!!st && !!st.start && !st.ende, `Vorbedingung: am Berliner Tag ${tag} eingestempelt, ohne Ende`).toBe(true);

    await anmelden(page, "stempeluhr-aus");
    const geraet = await geraetetag(page);
    testInfo.annotations.push({ type: "zeit-f", description: `${zone}: Gerätetag ${geraet}, Betriebstag ${tag}` });
    /* Gegenbeweis nur, wenn die Tage wirklich auseinanderliegen: in Pago Pago auf der lokalen Zeitbasis (Versatz ≠ 0).
       Gegen einen fremden Container (Staging-Gate, echte Uhr) hängt das von der Uhrzeit ab, dann nur vermerkt. */
    if (testInfo.project.name === "tz-pagopago" && versatzMs())
      expect(geraet, `Vorbedingung ${zone}: Gerätetag liegt vor dem Berliner Tag`).toBe(tagPlus(tag, -1));

    await expect(page.getByText(tagText(tag), { exact: true }).first(), `„Heute“ zeigt den Betriebstag ${tag} (${zone})`).toBeVisible();
    await expect(page.getByRole("button", { name: "Ausstempeln", exact: true }).first(),
      `Stempeluhr findet den Stempel des Betriebstags (${zone})`).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Offener Dienst von gestern"), `kein Vortagsvorgang (${zone})`).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Einstempeln", exact: true }), `kein zweites Einstempeln (${zone})`).toHaveCount(0);
  });

  test("Z2 Tageswechsel um Mitternacht Berlin, nicht um Mitternacht des Geräts", async ({ page }, testInfo) => {
    const zone = testInfo.project.use.timezoneId;
    const tag = abnahmeHeute(jetzt());
    const folgetag = tagPlus(tag, 1);
    const mitternacht = zeitpunktAusWanduhr(folgetag, 0);            // 00:00 Berlin des Folgetags als Zeitpunkt (ms)
    expect(betriebstag(new Date(mitternacht - 1))).toBe(tag);
    expect(betriebstag(new Date(mitternacht))).toBe(folgetag);
    const vorher = mitternacht - 2 * 60_000, nachher = mitternacht + 2 * 60_000;

    /* Die Seite kennt zwei Uhren-Eingriffe: die Zeitbasis (hilfen.mjs, Init-Skript) und page.clock. Welche zuerst greift,
       regelt Playwright; darum wird die Abweichung einmal gemessen und ausgeglichen, statt eine Reihenfolge anzunehmen. */
    await page.clock.install({ time: new Date(vorher) });
    await page.goto("/", { waitUntil: "load" });
    const korrektur = (await page.evaluate(() => Date.now())) - vorher;
    const stellen = async (ms) => {
      await page.clock.setSystemTime(new Date(ms - korrektur));
      const ist = await page.evaluate(() => Date.now());
      expect(Math.abs(ist - ms), "Browseruhr steht auf dem Zielzeitpunkt (± 60 s)").toBeLessThan(60_000);
    };
    await stellen(vorher);

    await anmelden(page, "stempeluhr-ein");
    const geraetVor = await geraetetag(page);
    await expect(page.getByText(tagText(tag), { exact: true }).first(), `23:58 Berlin: „Heute“ zeigt ${tag} (${zone}, Gerätetag ${geraetVor})`)
      .toBeVisible();
    await expect(page.getByText(tagText(folgetag), { exact: true }), `23:58 Berlin: noch nicht ${folgetag} (${zone})`).toHaveCount(0);

    await stellen(nachher);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    const geraetNach = await geraetetag(page);
    await expect(page.getByText(tagText(folgetag), { exact: true }).first(),
      `00:02 Berlin: „Heute“ zeigt ${folgetag} (${zone}, Gerätetag ${geraetNach})`).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(tagText(tag), { exact: true }), `00:02 Berlin: nicht mehr ${tag} (${zone})`).toHaveCount(0);
    testInfo.annotations.push({ type: "zeit-f", description: `${zone}: Gerätetag 23:58 Berlin ${geraetVor}, 00:02 Berlin ${geraetNach}` });
  });
});
