/* WP-33 Teil 3/4: Hilfen der Playwright-Suite — Anmeldung, Navigation (wie pruefungen/browser/wcag-wp40.mjs) und das axe-Gate.

   Teil 4 (stabile Prüfung): Meldungsstreifen (.toast) erscheinen zeitabhängig (z. B. „Hinweise zum Resturlaub verschickt“
   nach der ersten Anmeldung der Leitung, 3 s sichtbar). Ob einer beim Seitenscan gerade sichtbar war, hing von der Laufzeit ab.
   Jetzt prüft ein Beobachter in der Seite JEDEN Streifen, sobald er erscheint, mit axe (gleiche Regeln, gleiches Gate, keine
   Ausnahmen); am Testende schlagen serious/critical fehl. Nichts wird versteckt oder weggeklickt (Rückgängig würde Daten
   ändern). Alle axe-Läufe einer Seite gehen über eine Kette, damit sich Streifen- und Seitenscan nicht überschneiden.
   Der Konfliktdialog „Gleichzeitig bearbeitet“ lässt den Test mit genau dieser Meldung scheitern. */
import { test as basis, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AXE_GATE, AXE_TAGS, ZUGAENGE_VAR } from "./umgebung.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const AXE_QUELLE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
export const AUSNAHMEN = JSON.parse(readFileSync(path.join(HIER, "axe-ausnahmen.json"), "utf8")).ausnahmen;
const ERGEBNISSE = path.join(HIER, "ergebnisse", "axe");

/** Läuft in der Seite vor jedem Skript der Anwendung (addInitScript, vom CSP nicht erfasst): axe-Kette und Streifenbeobachter. */
function seitenBeobachter(tags) {
  window.__axeKette = Promise.resolve();
  window.__axeLauf = (ziel) => (window.__axeKette = window.__axeKette.catch(() => {}).then(() =>
    window.axe.run(ziel, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })));
  window.__meldungen = [];
  window.__meldungenOffen = 0;
  const gesehen = new WeakSet();
  const pruefe = () => {
    for (const t of document.querySelectorAll(".toast")) {
      if (gesehen.has(t)) continue;
      gesehen.add(t);
      window.__meldungenOffen++;
      /* Einblendung abwarten (Animation „auf“ 0,2 s; mit reduzierter Bewegung keine). */
      setTimeout(() => {
        const text = (t.innerText || t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (!t.isConnected) { window.__meldungen.push({ text, verpasst: true }); window.__meldungenOffen--; return; }
        window.__axeLauf(t).then((r) => window.__meldungen.push({ text, verstoesse: r.violations.map((v) => ({ regel: v.id, schwere: v.impact,
          hilfe: v.help, ziele: v.nodes.slice(0, 10).map((n) => n.target.join(" ")), anzahl: v.nodes.length,
          knoten: v.nodes.slice(0, 5).map((n) => ({ html: String(n.html || "").slice(0, 240), warum: String(n.failureSummary || "").slice(0, 400) })) })) }))
          .catch((e) => window.__meldungen.push({ text, fehler: String(e && e.message || e) }))
          .finally(() => { window.__meldungenOffen--; });
      }, 250);
    }
  };
  new MutationObserver(pruefe).observe(document, { childList: true, subtree: true });
}

/** Jeder Test ein eigener „Rechner“: Hinter Caddy setzt der Proxy die Herkunft; ohne eigenen Kopf zählten die
 *  Bremsen je Herkunft die ganze Suite als einen Besucher. Der Server vertraut 127.0.0.1 als Proxy (global-setup.mjs). */
export const test = basis.extend({
  page: async ({ page }, use, testInfo) => {
    let h = 7;
    for (const z of `${testInfo.testId}:${testInfo.retry}`) h = (h * 31 + z.charCodeAt(0)) >>> 0;
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.33.${(h >> 8) % 240}.${(h % 254) + 1}` });
    page.setDefaultTimeout(15000);
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.addInitScript(AXE_QUELLE);
    await page.addInitScript(seitenBeobachter, [...AXE_TAGS]);
    await page.addLocatorHandler(page.getByRole("dialog", { name: "Gleichzeitig bearbeitet" }), async () => {
      throw new Error("Dialog „Gleichzeitig bearbeitet“ erschienen, obwohl dieser Test nichts bearbeitet hat (Schreibkonflikt im Demo-Betrieb).");
    });
    await use(page);
    await meldungenAuswerten(page, testInfo);
  },
});
export { expect };

const befundText = (v) => `${v.schwere} ${v.regel}: ${v.hilfe} [${v.ziele.slice(0, 3).join(" | ")}]${v.anzahl > 3 ? ` (+${v.anzahl - 3})` : ""}`;

/** Am Testende: alle Meldungsstreifen dieses Tests (auch die nur kurz sichtbaren) gegen das Gate. */
async function meldungenAuswerten(page, testInfo) {
  if (page.isClosed() || testInfo.status === "skipped") return;
  const viewport = testInfo.project.name;
  await page.waitForFunction(() => !window.__meldungenOffen, null, { timeout: 30000 }).catch(() => {});
  const meldungen = await page.evaluate(() => window.__meldungen || []).catch(() => []);
  if (!meldungen.length) return;
  mkdirSync(ERGEBNISSE, { recursive: true });
  const datei = path.join(ERGEBNISSE, `meldung-${testInfo.title}-${viewport}.json`);
  writeFileSync(datei, JSON.stringify({ flaeche: "meldung", test: testInfo.title, viewport, tags: AXE_TAGS, meldungen }, null, 1));
  const probleme = [];
  for (const m of meldungen) {
    testInfo.annotations.push({ type: "axe-meldung", description: `Meldungsstreifen @ ${viewport} („${m.text}“): `
      + (m.fehler ? `axe-Fehler ${m.fehler}` : m.verpasst ? "vor dem Scan verschwunden" : `${m.verstoesse.length} Regel(n) verletzt`) });
    if (m.fehler) probleme.push(`„${m.text}“: axe lief nicht (${m.fehler})`);
    for (const v of m.verstoesse || []) if (AXE_GATE.includes(v.schwere)) probleme.push(`„${m.text}“: ${befundText(v)}`);
  }
  expect(probleme, `axe WCAG 2.2 AA auf Meldungsstreifen @ ${viewport}: serious/critical (keine Ausnahmen)`).toEqual([]);
}

function code(rolle) {
  const alle = JSON.parse(process.env[ZUGAENGE_VAR] || "{}");
  if (!alle[rolle]) throw new Error(`Kein Testzugang für ${rolle} (global-setup.mjs gelaufen?)`);
  return alle[rolle];
}

async function tourZu(page) {
  for (const zu of ['[aria-label="Tour schließen"]', 'button:has-text("Später")', 'button:has-text("Tour überspringen")']) {
    const t = page.locator(zu).first();
    if (await t.count()) await t.click().catch(() => {});
  }
}

/** Bis das Netz ruht (Laden, automatische Läufe nach der Anmeldung) und zwei Bilder gezeichnet sind. */
async function ruhe(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
}

/** Anmeldung über die echte Anmeldeseite mit dem synthetischen Zugang der Rolle. */
export async function anmelden(page, rolle) {
  await page.goto("/", { waitUntil: "load" });
  await page.locator("input").first().fill(code(rolle), { timeout: 30000 });
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
  await ruhe(page);
  await tourZu(page);
}

/** In eine Ansicht wechseln: Reiter unten (Telefonansicht) oder Menütaste und Seitenleiste. */
export async function geheZu(page, name) {
  if (await page.locator(".m-tabs button:visible").count()) {
    const t = page.locator(".m-tabs button", { hasText: name }).first();
    await expect(t, `Reiter ${name}`).toHaveCount(1);
    await t.click();
  } else {
    const menue = page.locator(".kopf-menue:visible").first();
    if (await menue.count() && !(await page.locator(".seitenleiste.offen").count())) { await menue.click(); await page.waitForTimeout(300); }
    const re = new RegExp("^\\s*" + name.replace(/[()]/g, "\\$&") + "\\s*\\d*\\s*$");
    const l = page.locator(".seitenleiste .slink", { hasText: name }).filter({ hasText: re }).first();
    await expect(l, `Navigationseintrag ${name}`).toHaveCount(1);
    await l.click();
  }
  await ruhe(page);
  await tourZu(page);
}

/** Passt eine Ausnahme auf Regel, Fläche und Viewport? Rein, ohne Browser (geprüft in den Regeln der Datei). */
export function ausnahmeFuer(regel, flaeche, viewport, liste = AUSNAHMEN) {
  return liste.find((a) => a.regel === regel && (a.flaeche === flaeche || a.flaeche === "*")
    && (!a.viewports || a.viewports.includes(viewport))) || null;
}

/**
 * axe-core (WCAG 2.2 AA) auf der aktuellen Seite. Der vollständige Befund aller Schweregrade geht nach
 * e2e/ergebnisse/axe/<fläche>-<viewport>.json und an den Test. Rot wird es bei jedem Fund der Schwere
 * serious oder critical, der nicht als begründete Ausnahme in e2e/axe-ausnahmen.json steht. Ein gerade sichtbarer
 * Meldungsstreifen gehört zur Seite und wird mitgeprüft (zusätzlich zur eigenen Prüfung des Streifens).
 */
export async function axePruefen(page, testInfo, flaeche) {
  const viewport = testInfo.project.name;
  await ruhe(page);
  const meldung = await page.locator(".toast").first().isVisible().catch(() => false);
  const erg = await page.evaluate(() => window.__axeLauf(document));
  const verstoesse = erg.violations.map((v) => ({ regel: v.id, schwere: v.impact, hilfe: v.help, url: v.helpUrl,
    ziele: v.nodes.slice(0, 10).map((n) => n.target.join(" ")), anzahl: v.nodes.length,
    /* Ausschnitt der ersten Knoten (nur erfundene Demo-Daten) und axes Begründung, damit der Befund ohne neuen Lauf behebbar ist. */
    knoten: v.nodes.slice(0, 5).map((n) => ({ html: String(n.html || "").slice(0, 240), warum: String(n.failureSummary || "").slice(0, 400) })) }));
  mkdirSync(ERGEBNISSE, { recursive: true });
  const datei = path.join(ERGEBNISSE, `${flaeche}-${viewport}.json`);
  writeFileSync(datei, JSON.stringify({ flaeche, viewport, axe: erg.testEngine && erg.testEngine.version, tags: AXE_TAGS,
    meldungSichtbar: meldung, verstoesse }, null, 1));
  await testInfo.attach(`axe-${flaeche}-${viewport}`, { path: datei, contentType: "application/json" });

  const gate = verstoesse.filter((v) => AXE_GATE.includes(v.schwere));
  const ausgenommen = gate.filter((v) => ausnahmeFuer(v.regel, flaeche, viewport));
  const neu = gate.filter((v) => !ausnahmeFuer(v.regel, flaeche, viewport));
  testInfo.annotations.push({ type: "axe", description: `${flaeche} @ ${viewport}: ${verstoesse.length} Regel(n) verletzt, `
    + `${gate.length} serious/critical, davon ${ausgenommen.length} begründet ausgenommen (${ausgenommen.map((v) => v.regel).join(", ") || "-"})` });
  const ungenutzt = AUSNAHMEN.filter((a) => a.flaeche === flaeche && (!a.viewports || a.viewports.includes(viewport))
    && !gate.some((v) => v.regel === a.regel));
  if (ungenutzt.length) testInfo.annotations.push({ type: "axe-ausnahme-ungenutzt",
    description: `${flaeche} @ ${viewport}: ${ungenutzt.map((a) => a.regel).join(", ")} nicht mehr gefunden — Eintrag in e2e/axe-ausnahmen.json prüfen` });
  expect(neu.map(befundText), `axe WCAG 2.2 AA auf ${flaeche} @ ${viewport}: serious/critical ohne Ausnahme`).toEqual([]);
}
