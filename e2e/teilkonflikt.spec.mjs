/* WP-48.5 Teil 2: Konfliktfenster der Teilspeicherung im Browser — axe (WCAG 2.2 AA), Tastatur, Sicherung als Datei.

   Der Testserver läuft mit Schalter CENTRIC_TEILSPEICHERUNG aus (e2e/global-setup.mjs, unverändert). Die Fähigkeit des
   Teilwegs kommt deshalb nur in dieser Seite zustande: Die Antwort auf GET /api/bestand bekommt `teile` dazu, und
   POST /api/bestand/teile beantwortet eine Route — erst mit einem Konflikt je Feld, dann mit „gespeichert", zuletzt
   mit NEU_LADEN. Kein Teil-POST erreicht den Server; der Demo-Bestand bleibt unberührt (die anderen Tests arbeiten im
   selben Betrieb). Geprüft wird die Oberfläche: Fenster, Radiogruppe je Frage mit zugänglichem Namen, Bedienung mit
   der Tastatur, kein Voll-PUT und kein blindes Übernehmen, axe nur auf dem Fenster (gleiches Gate, keine Ausnahmen —
   e2e/axe-ausnahmen.json bleibt unverändert), Download des Ausstehenden ohne Netz. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, anmelden, geheZu } from "./hilfen.mjs";
import { AXE_GATE, AXE_TAGS } from "./umgebung.mjs";

const ERGEBNISSE = path.join(path.dirname(fileURLToPath(import.meta.url)), "ergebnisse", "axe");
const V = "e2e0".repeat(8);

/** axe nur auf dem Konfliktfenster; serious/critical schlagen fehl (keine Ausnahmen). */
async function axeFenster(page, testInfo, flaeche) {
  const viewport = testInfo.project.name;
  const erg = await page.evaluate(() => window.__axeLauf(document.querySelector('[role="dialog"][aria-labelledby="teilkonflikt-titel"]')));
  const verstoesse = erg.violations.map((v) => ({ regel: v.id, schwere: v.impact, hilfe: v.help,
    ziele: v.nodes.slice(0, 10).map((n) => n.target.join(" ")), anzahl: v.nodes.length }));
  mkdirSync(ERGEBNISSE, { recursive: true });
  writeFileSync(path.join(ERGEBNISSE, `${flaeche}-${viewport}.json`), JSON.stringify({ flaeche, viewport, tags: AXE_TAGS, verstoesse }, null, 1));
  const gate = verstoesse.filter((v) => AXE_GATE.includes(v.schwere)).map((v) => `${v.schwere} ${v.regel}: ${v.hilfe} [${v.ziele.slice(0, 3).join(" | ")}]`);
  expect(gate, `axe WCAG 2.2 AA auf ${flaeche} @ ${viewport}`).toEqual([]);
}

test.describe("WP-48.5 Konfliktfenster der Teilspeicherung", () => {
  test("planer: Frage je Feld, Tastatur, Entscheiden; neu laden mit Sicherung als Datei", async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    let modus = "konflikt";
    let erwarteDichte = null;   // nur die Änderung dieses Tests bekommt den Konflikt (nicht ein automatischer Lauf beim Öffnen)
    const posts = [];
    let puts = 0;
    page.on("request", (r) => { if (r.method() === "PUT" && new URL(r.url()).pathname === "/api/bestand") puts += 1; });
    /* Fähigkeit `teile` nur in dieser Seite (Schalter des Servers bleibt aus). */
    await page.route("**/api/bestand", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const antwort = await route.fetch();
      const j = await antwort.json().catch(() => null);
      if (!j || !j.bestand || !Array.isArray(j.bestand.mandanten)) return route.fulfill({ response: antwort });
      const versionen = {};
      for (const m of j.bestand.mandanten) for (const k of Object.keys(m || {})) versionen[`kern:${k}`] = V;
      return route.fulfill({ response: antwort, json: { ...j, teile: { format: 1, epoche: "e2e-epoche", versionen } } });
    });
    await page.route("**/api/bestand/teile", async (route) => {
      const rumpf = route.request().postDataJSON();
      posts.push(rumpf);
      const personen = rumpf && rumpf.kern && rumpf.kern.personen;
      if (modus === "konflikt" && personen && erwarteDichte && personen.wert.some((p) => p && p.dichte === erwarteDichte)) {
        modus = "danach";
        const fremd = personen.wert.map((p, i) => (i === 0 ? { ...p, vorname: `${p.vorname || ""}x` } : p));
        return route.fulfill({ status: 409, json: { fehler: "konflikt", code: "TEILE_KONFLIKT", epoche: "e2e-epoche", versionen: {},
          konflikt: { zellen: [], kern: [{ feld: "personen", aktuell: fremd, version: V }] } } });
      }
      if (modus === "neuLaden") return route.fulfill({ status: 409, json: { fehler: "konflikt", code: "NEU_LADEN", epoche: "e2e-andere" } });
      return route.fulfill({ status: 200, json: { ok: true, epoche: "e2e-epoche", versionen: {} } });
    });

    await anmelden(page, "planer");
    await geheZu(page, "Einstellungen");
    const dichte = async () => {
      const tabs = page.getByRole("tab", { name: /^(Kompakt|Komfortabel)$/ });
      await expect(tabs).toHaveCount(2);
      const nicht = page.getByRole("tab", { name: /^(Kompakt|Komfortabel)$/, selected: false }).first();
      erwarteDichte = String(await nicht.textContent()).trim().toLowerCase();
      await nicht.click();
    };

    /* 1. Konflikt je Feld */
    await dichte();
    const fenster = page.getByRole("dialog", { name: /gleichzeitig geändert/ });
    await expect(fenster).toBeVisible({ timeout: 20000 });
    const gruppe = fenster.getByRole("group", { name: "Stammdaten: Personal" });
    await expect(gruppe).toBeVisible();
    await expect(fenster.getByRole("button", { name: /übernehmen/i })).toHaveCount(0);   // kein „alles übernehmen"
    const speichern = fenster.getByRole("button", { name: "Entscheidungen speichern" });
    await expect(speichern).toBeDisabled();
    await axeFenster(page, testInfo, "teilkonflikt-frage-planer");
    /* Tastatur: in die Radiogruppe, Pfeiltaste wählt „Meins setzen". */
    await gruppe.getByRole("radio", { name: /Fremdes übernehmen/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(gruppe.getByRole("radio", { name: /Meins setzen/ })).toBeChecked();
    await expect(speichern).toBeEnabled();
    const vorher = posts.length;
    await speichern.click();
    await expect(fenster).toBeHidden();
    await expect.poll(() => posts.length, { timeout: 20000 }).toBeGreaterThan(vorher);
    expect(posts[posts.length - 1].kern && posts[posts.length - 1].kern.personen.basis).toBe(V);
    expect(JSON.stringify(posts)).not.toMatch(/"(einstempeln|istEingefroren|monatsabschluss)"/);

    /* 2. Neu laden (Epoche anders): Liste, Sicherung als Datei ohne Netz */
    modus = "neuLaden";
    await dichte();
    const neu = page.getByRole("dialog", { name: "Der gespeicherte Stand wurde neu aufgesetzt" });
    await expect(neu).toBeVisible({ timeout: 20000 });
    await expect(neu.getByRole("list", { name: "Noch nicht gespeichert" })).toBeVisible();
    await axeFenster(page, testInfo, "teilkonflikt-neuladen-planer");
    const zahl = posts.length;
    const [datei] = await Promise.all([page.waitForEvent("download"), neu.getByRole("button", { name: "Nur als Datei sichern" }).click()]);
    expect(datei.suggestedFilename()).toMatch(/^centric-ausstehend-.*\.json$/);
    expect(posts.length).toBe(zahl);   // die Sicherung braucht kein Netz
    expect(puts, "kein Voll-PUT auf dem Teilweg").toBe(0);
  });
});
