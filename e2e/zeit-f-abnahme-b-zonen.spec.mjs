/* ZEIT-F Rest (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.3, § 13.3): Abläufe der Abnahme B zusätzlich in fremden
   Browser-Zeitzonen.

   § 9.3: Der Pin timezoneId "Europe/Berlin" in e2e/abnahme-b-ablaeufe.spec.mjs bleibt; dieselben Abläufe laufen
   ZUSÄTZLICH in fremden Zonen. Diese Spec läuft NUR in den Zonenprojekten (e2e/zonen.mjs, Telefon 390x844); die Zone
   kommt allein aus dem Projekt. Server, Browser und Testcode laufen auf der gemeinsamen Zeitbasis (e2e/zeitbasis.mjs,
   Samstag 2026-11-14 10:00 Berlin).

   ZS  Stempeluhr der Abnahme B („heute-stempeluhr“): Beschäftigte mit Dienst am Berliner Tag, noch nicht gestempelt.
       In jeder Zone zeigt „Heute“ den Betriebstag und „Einstempeln“, nie „Ausstempeln“. Ohne axe: axe ist
       zonenunabhängig und läuft an den acht Viewports; die Ausnahmeliste kennt nur deren Namen.
   ZB7 B7 „Stempeln ohne Netz“ in Pago Pago (B7_ZONENPROJEKT): Der Gerätetag liegt dort am Abnahmezeitpunkt auf dem
       Vortag (Vorbedingung, geprüft). Offline einstempeln → vorläufig auf dem Gerät, nichts auf dem Server; Netz
       zurück → genau ein Stempel, und zwar am Berliner Tag (nicht am Gerätetag); Netzwechsel und Neuladen → weiterhin
       einer; Ausstempeln online am selben Stempel. In den anderen drei Zonen fällt der Gerätetag um 10:00 Berlin mit
       dem Betriebstag zusammen; dort wäre B7 derselbe Ablauf wie in 390x844 und wird übersprungen (Laufzeit).

   Schreibwirkung: ZS gibt „stempeluhr-ein“ einen Dienst am Tag (wie der Viewport-Test heute-stempeluhr), stempelt nie.
   ZB7 schreibt nur für die eigene Person „b7-zone“ (umgebung.mjs ZONEN_ZUGAENGE), je Arbeiter ein eigener Raum.
   Zugangscodes werden nie ausgegeben. */
import { test, expect, anmelden, zugangscode } from "./hilfen.mjs";
import { BASIS } from "./umgebung.mjs";
import { B7_ZONENPROJEKT } from "./zonen.mjs";
import { abnahmeHeute, jetzt, tagPlus, versatzMs } from "./zeitbasis.mjs";
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
    headers: { "content-type": "application/json", "x-forwarded-for": `10.41.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: rumpf ? JSON.stringify(rumpf) : undefined });
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { s: a.status, d, text };
}
async function apiAnmelden(zugang) {
  const r = await api("anmelden", { methode: "POST", rumpf: { zugangscode: zugangscode(zugang) } });
  if (!r.d.token) throw new Error(`API-Anmeldung ${zugang} gescheitert (Status ${r.s})`);
  return r.d;
}
const mandantVon = (g) => (((g.d.bestand || {}).mandanten) || [])[0] || {};
const stempelAm = (m, pid, tag) => Object.entries(m.einstempeln || {}).filter(([k]) => k === `${pid}|${tag}`);

/** Gerätetag des Browsers (Ortszeit der emulierten Zone, wie ihn eine Oberfläche mit der Geräteuhr nähme). */
const geraetetag = (page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

/** Der Person am Tag einen Dienst mit Beginn und Ende geben (Planung, PUT mit ETag), wie dienstSicherstellen in
    e2e/abnahme-b-ablaeufe.spec.mjs. Ein 409 (die App einer eben geschlossenen Seite schrieb dazwischen) wird mit frischem
    ETag wiederholt; ein 403 (Planungsregel) führt zum nächsten Dienst. */
async function dienstSicherstellen(personId, tag) {
  const pl = await apiAnmelden("planer");
  const tagKey = `${personId}|${tag}`;
  const abgelehnt = [];
  const erst = mandantVon(await api("bestand", { token: pl.token }));
  const dienste = (erst.dienstarten || []).filter((x) => x.start && x.ende);
  if (dienste.some((x) => x.id === (erst.abweichungen || {})[tagKey])) return;
  for (const d of dienste) {
    for (let versuch = 0; versuch < 3; versuch++) {
      const g = await api("bestand", { token: pl.token });
      expect(g.s, "Planung liest den Bestand").toBe(200);
      const m = mandantVon(g);
      m.abweichungen = { ...(m.abweichungen || {}), [tagKey]: d.id };
      const w = await api("bestand", { methode: "PUT", token: pl.token, rumpf: { bestand: g.d.bestand, etag: g.d.etag } });
      if (w.s === 200) return;
      if (w.s !== 409) { abgelehnt.push(`${d.id}:${w.s}`); break; }
    }
  }
  throw new Error(`Kein Dienst am ${tag} zulässig (${abgelehnt.join(", ")})`);
}

/** Liegt Berliner Mitternacht in den nächsten zwei Minuten, erst danach beginnen (wie in abnahme-b-ablaeufe.spec.mjs). */
async function berlinerTagFuerAblauf(page) {
  while (abnahmeHeute(new Date(jetzt().getTime() + 120_000)) !== abnahmeHeute()) await page.waitForTimeout(5000);
  return abnahmeHeute();
}

test.describe("ZEIT-F Rest: Abnahme B in fremder Browser-Zeitzone", () => {
  test.describe.configure({ timeout: 300_000 });

  test("ZS Stempeluhr: Dienst am Betriebstag, noch nicht gestempelt — „Einstempeln“ in jeder Zone", async ({ page }, testInfo) => {
    const zone = testInfo.project.use.timezoneId;
    expect(zone, "Zonenprojekt mit festgelegter Browser-Zeitzone").toBeTruthy();
    const tag = await berlinerTagFuerAblauf(page);
    const ich = await apiAnmelden("stempeluhr-ein");
    await dienstSicherstellen(ich.person, tag);
    const st = (mandantVon(await api("bestand", { token: ich.token })).einstempeln || {})[`${ich.person}|${tag}`] || null;
    expect(st, `Vorbedingung stempeluhr-ein: am ${tag} nicht gestempelt`).toBeNull();

    await anmelden(page, "stempeluhr-ein");
    const geraet = await geraetetag(page);
    testInfo.annotations.push({ type: "zeit-f", description: `${zone}: Gerätetag ${geraet}, Betriebstag ${tag}` });
    if (testInfo.project.name === B7_ZONENPROJEKT && versatzMs())
      expect(geraet, `Vorbedingung ${zone}: Gerätetag liegt vor dem Berliner Tag`).toBe(tagPlus(tag, -1));

    await expect(page.getByRole("button", { name: "Einstempeln", exact: true }).first(),
      `Stempeluhr bietet „Einstempeln“ am Betriebstag (${zone})`).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(tagText(tag), { exact: true }).first(), `„Heute“ zeigt den Betriebstag ${tag} (${zone})`).toBeVisible();
    await expect(page.getByRole("button", { name: "Ausstempeln", exact: true }), `kein „Ausstempeln“ (${zone})`).toHaveCount(0);
    /* Kein Prüfpunkt „Offener Dienst von gestern“: Der Demo-Plan gibt stempeluhr-ein am Vortag einen Nachtdienst; die
       Karte „Nachtdienst von gestern ohne Einstempeln“ ist dann fachlich richtig (planbasiert, in jeder Zone gleich). */
  });

  test("ZB7 Stempeln ohne Netz in Pago Pago: vorläufig, nach dem Netz genau ein Stempel am Berliner Tag", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== B7_ZONENPROJEKT,
      "B7 schreibt; nur dort, wo der Gerätetag am Abnahmezeitpunkt vom Betriebstag abweicht (e2e/zonen.mjs B7_ZONENPROJEKT)");
    const zone = testInfo.project.use.timezoneId;
    const tag = await berlinerTagFuerAblauf(page);
    const ma = await apiAnmelden("b7-zone");
    await dienstSicherstellen(ma.person, tag);
    const stempelHeute = async () => stempelAm(mandantVon(await api("bestand", { token: ma.token })), ma.person, tag);
    test.skip((await stempelHeute()).length > 0, "Heute ist schon gestempelt (Wiederholungslauf auf demselben Server)");

    const sendungen = [];
    page.on("request", (r) => { if (r.url().includes("/api/stempeln")) sendungen.push(r.method()); });
    await anmelden(page, "b7-zone");
    const geraet = await geraetetag(page);
    testInfo.annotations.push({ type: "zeit-f", description: `ZB7 ${zone}: Gerätetag ${geraet}, Betriebstag ${tag}` });
    /* Gegenbeweis nur, wenn die Tage wirklich auseinanderliegen (lokale Zeitbasis). Gegen einen fremden Container
       (Staging-Gate, echte Uhr) hängt das von der Uhrzeit ab, dann nur vermerkt. */
    if (versatzMs()) expect(geraet, `Vorbedingung ${zone}: Gerätetag liegt vor dem Berliner Tag`).toBe(tagPlus(tag, -1));
    const ein = page.getByRole("button", { name: "Einstempeln", exact: true }).first();
    await expect(ein, "Stempeluhr mit Einstempeln (Dienst am Betriebstag)").toBeVisible({ timeout: 20000 });

    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine), "Browser meldet offline").toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByRole("status").filter({ hasText: "Keine Verbindung" }), "Offline-Leiste steht").toBeVisible({ timeout: 15000 });
    await ein.click();
    await expect(page.getByText(/vorläufig \(offline gespeichert\)/).first(), `vorläufig auf dem Gerät (${zone})`).toBeVisible({ timeout: 15000 });
    expect(await stempelHeute(), "offline: nichts auf dem Server").toHaveLength(0);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await stempelHeute()).length, { message: "nach dem Netz: genau ein Stempel am Berliner Tag", timeout: 30000 }).toBe(1);
    const m0 = mandantVon(await api("bestand", { token: ma.token }));
    expect(stempelAm(m0, ma.person, geraet), `kein Stempel am Gerätetag ${geraet}`).toHaveLength(0);

    await context.setOffline(true); await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await page.waitForTimeout(1500);
    const st = await stempelHeute();
    expect(st, "nach Netzwechsel und Neuladen: weiterhin genau ein Stempel").toHaveLength(1);
    expect(st[0][1].start, "Beginn gesetzt").toMatch(/^\d{2}:\d{2}$/);
    expect(st[0][1].ende, "noch kein Ende").toBeFalsy();
    testInfo.annotations.push({ type: "zeit-f", description: `ZB7: ${sendungen.length} Sendung(en) an /api/stempeln, 1 Stempel am ${tag}` });

    const aus = page.getByRole("button", { name: "Ausstempeln", exact: true }).first();
    await expect(aus, `nach dem Neuladen: „Ausstempeln“ (${zone})`).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(tagText(tag), { exact: true }).first(), `„Heute“ zeigt den Betriebstag ${tag} (${zone})`).toBeVisible();
    await aus.click();
    await expect.poll(async () => { const x = await stempelHeute(); return x.length === 1 && !!x[0][1].ende; },
      { message: "Ende am selben Stempel", timeout: 30000 }).toBe(true);
  });
});
