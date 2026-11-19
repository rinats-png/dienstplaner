/* Lokale E2E-Abnahme Hauptfunktionen (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md) — Teil 4: PWA mit Dienstarbeiter.

   Die Suite sperrt Dienstarbeiter (playwright.config.mjs: serviceWorkers „block“), damit kein Zwischenspeicher die übrigen
   Prüfungen verfälscht. NUR diese Datei erlaubt ihn (test.use, eigener Browserkontext je Test — die Registrierung lebt
   nur in diesem Kontext und reicht in keine andere Spec). Gegen den echten Server aus e2e/global-setup.mjs (127.0.0.1 ist
   ein sicherer Ursprung), Demo-Bestand mit erfundenen Personen, Zugang der Rolle „mitarbeiter“; nichts wird geschrieben.

     P1  Registrierung: /sw.js wird beim Start registriert (Bereich „/“), aktiviert, übernimmt die Seite; Gerüst und
         letzter Bestand liegen im Zwischenspeicher (centric-schale-*, centric-daten-*), das Manifest ist lesbar.
     P2  Offline-Start: ohne Netz lädt die Seite aus dem Gerüst und zeigt den gespeicherten Stand der Person statt der
         Fehlerseite des Browsers; mit Netz wieder normal. Gegenprobe: in der Rechneransicht erscheint die Leiste „Keine
         Verbindung“. Heutiges Verhalten B-P2: in der Telefonschale fehlt sie.
     P3  Abmelden im Browser („Mehr“ → „Abmelden“; Sitzungsablauf, Rest): das alte Merkmal bekommt beim Server 401, der Datenspeicher des
         Dienstarbeiters ist geleert (keine Personaldaten offline nach dem Abmelden); Gegenprobe: vorher lag er dort.
   Nur Projekt 390x844 (Telefon). Keine Installation, kein iOS/Safari — das bleibt produktionsnah (echtes Gerät). */
import { test, expect, anmelden, geheZu, schreibvorgaengeVerfolgen } from "./hilfen.mjs";
import { BASIS } from "./umgebung.mjs";

const PROJEKT = "390x844";
/* Einziger Unterschied zur Konfiguration: Dienstarbeiter erlaubt. Alles Übrige (axe-Streifenprüfung, Uhr, Herkunft)
   kommt unverändert aus hilfen.mjs. */
test.use({ serviceWorkers: "allow" });

const cacheNamen = (page) => page.evaluate(async () => (await caches.keys()).sort());
const bestandGespeichert = (page) => page.evaluate(async () => {
  for (const n of await caches.keys()) if (n.startsWith("centric-daten-") && await (await caches.open(n)).match("bestand")) return true;
  return false;
});
/** Bis der Dienstarbeiter aktiv ist und die Seite steuert (clients.claim in public/sw.js). */
async function dienstarbeiterBereit(page) {
  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: new URL(reg.scope).pathname, skript: new URL(reg.active.scriptURL).pathname };
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20000 }).toBe(true);
  return info;
}

test.describe("PWA: Dienstarbeiter lokal (nur diese Datei erlaubt ihn)", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "Telefonviewport; einmal je Lauf");
  });

  test("P1+P2 Registrierung, Zwischenspeicher, Offline-Start aus dem Gerüst (B-P2: ohne Hinweis am Telefon), wieder online", async ({ page, context }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmelden(page, "mitarbeiter");
    expect(await dienstarbeiterBereit(page)).toEqual({ scope: "/", skript: "/sw.js" });
    /* Einmal neu laden, damit der Bestand über den (jetzt steuernden) Dienstarbeiter geholt und abgelegt wird. */
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await expect.poll(() => bestandGespeichert(page), { timeout: 20000 }).toBe(true);
    const namen = await cacheNamen(page);
    expect(namen.some((n) => n.startsWith("centric-schale-")), namen.join(",")).toBe(true);
    const manifest = await page.evaluate(async () => {
      const l = document.querySelector('link[rel="manifest"]');
      const j = await (await fetch(l.href)).json();
      return { name: !!j.name, icons: (j.icons || []).length > 0, start: j.start_url };
    });
    expect(manifest.name && manifest.icons, JSON.stringify(manifest)).toBe(true);
    const vorname = (await page.getByRole("heading", { level: 1 }).first().innerText()).replace(/^.*,\s*/, "").replace(/\.$/, "").trim();
    expect(vorname.length, "Begrüßung mit Vornamen").toBeGreaterThan(1);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    /* Offline: Neuladen kommt aus dem Gerüst, der Bestand aus dem Zwischenspeicher — mit Hinweis */
    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    /* Die Anwendung steht (keine Fehlerseite des Browsers) und zeigt den gespeicherten Stand der Person */
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(vorname);
    await expect(page.getByRole("button", { name: "Mein Plan" })).toBeVisible();
    /* Befund B-P2 (heutiges Verhalten, NICHT repariert): Die Leiste „Keine Verbindung … Stand wurde … geholt“
       (Offlineleiste, src/ansichten/speicherlage.jsx) steht nur in der Rechneransicht (src/App.jsx, Hauptbereich), nicht in
       der Telefonschale (MobilSchale) — Beschäftigte sehen am Telefon einen gespeicherten Stand ohne Hinweis, dass er alt
       ist. Nach der Behebung umkehren: Leiste sichtbar.
       Nicht vakuös: Zuerst die Gegenprobe in der Rechneransicht („Mehr“ → „Rechneransicht“, derselbe Zustand ohne
       Neuladen) — dort erscheint die Leiste, die App hat das Offline-Lesen also erkannt. Erst DANACH zurück in die
       Telefonansicht und dort das Fehlen prüfen (eine bloß verspätete Leiste bliebe so nicht unbemerkt). */
    const leiste = page.getByRole("status").filter({ hasText: "Keine Verbindung" });
    await geheZu(page, "Mehr");
    await page.getByRole("button", { name: /^Rechneransicht/ }).click();
    await expect(leiste, "Gegenprobe Rechneransicht: Offline erkannt").toBeVisible({ timeout: 20000 });
    await expect(leiste).toContainText("Änderungen lassen sich nicht speichern");
    await page.getByRole("button", { name: "Telefonansicht", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mein Plan" })).toBeVisible();
    await expect(leiste, "B-P2: heute kein Offline-Hinweis in der Telefonschale").toHaveCount(0);

    await context.setOffline(false);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await expect(page.getByRole("button", { name: "Mein Plan" })).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.goto("about:blank");
    await v.abgeschlossen();
  });

  test("P3 Abmelden im Browser: altes Merkmal 401, Personaldaten aus dem Zwischenspeicher entfernt", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmelden(page, "mitarbeiter");
    await dienstarbeiterBereit(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await expect.poll(() => bestandGespeichert(page), { timeout: 20000 }).toBe(true);
    const merkmal = await page.evaluate(() => sessionStorage.getItem("centric:token") || localStorage.getItem("centric:token"));
    expect(merkmal, "Merkmal der Seite").toBeTruthy();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const abmeldung = [];
    page.on("request", (q) => { if (new URL(q.url()).pathname === "/api/abmelden") abmeldung.push(`${q.method()} ${q.headers().authorization ? "mit" : "ohne"} Merkmal`); });
    page.on("requestfinished", async (q) => { if (new URL(q.url()).pathname === "/api/abmelden") abmeldung.push(`Antwort ${(await q.response())?.status()}`); });
    page.on("requestfailed", (q) => { if (new URL(q.url()).pathname === "/api/abmelden") abmeldung.push(`fehlgeschlagen ${q.failure()?.errorText}`); });
    await geheZu(page, "Mehr");
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 30000 });
    await expect.poll(() => bestandGespeichert(page), { timeout: 20000, message: "Bestand im Zwischenspeicher nach dem Abmelden" }).toBe(false);
    const altStatus = async () => (await fetch(BASIS + "/api/bestand", { headers: { authorization: `Bearer ${merkmal}`, "x-forwarded-for": "10.75.0.1" } })).status;
    /* Die Abmeldung geht als keepalive-Anfrage hinaus (src/speicher.js abmelden), die Seite wartet nicht auf sie:
       darum eine Bedingung (Poll), keine feste Wartezeit. */
    try { await expect.poll(altStatus, { timeout: 15000, message: "altes Merkmal nach dem Abmelden" }).toBe(401); }
    catch (e) { throw new Error(`${e.message}\n/api/abmelden: ${abmeldung.join(" | ") || "keine Anfrage"}`); }
    await page.goto("about:blank");
    await v.abgeschlossen();
  });
});
