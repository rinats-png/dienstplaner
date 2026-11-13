/* WP-33 Teil 3: Hilfen der Playwright-Suite — Anmeldung, Navigation (wie pruefungen/browser/wcag-wp40.mjs) und das axe-Gate. */
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

/** Jeder Test ein eigener „Rechner“: Hinter Caddy setzt der Proxy die Herkunft; ohne eigenen Kopf zählten die
 *  Bremsen je Herkunft die ganze Suite als einen Besucher. Der Server vertraut 127.0.0.1 als Proxy (global-setup.mjs). */
export const test = basis.extend({
  page: async ({ page }, use, testInfo) => {
    let h = 7;
    for (const z of `${testInfo.testId}:${testInfo.retry}`) h = (h * 31 + z.charCodeAt(0)) >>> 0;
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.33.${(h >> 8) % 240}.${(h % 254) + 1}` });
    page.setDefaultTimeout(15000);
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await use(page);
  },
});
export { expect };

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

/** Anmeldung über die echte Anmeldeseite mit dem synthetischen Zugang der Rolle. */
export async function anmelden(page, rolle) {
  await page.goto("/", { waitUntil: "load" });
  await page.locator("input").first().fill(code(rolle), { timeout: 30000 });
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
  await page.waitForTimeout(500);
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
  await page.waitForTimeout(700);
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
 * serious oder critical, der nicht als begründete Ausnahme in e2e/axe-ausnahmen.json steht.
 */
export async function axePruefen(page, testInfo, flaeche) {
  const viewport = testInfo.project.name;
  /* Animationen und verzögertes Nachladen abwarten — sonst prüft axe halb durchsichtige Flächen. */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  /* Wie @axe-core/playwright: Quelle per evaluate (vom CSP der Seite nicht erfasst), dann axe.run. */
  await page.evaluate(AXE_QUELLE);
  const erg = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }), [...AXE_TAGS]);
  const verstoesse = erg.violations.map((v) => ({ regel: v.id, schwere: v.impact, hilfe: v.help, url: v.helpUrl,
    ziele: v.nodes.slice(0, 10).map((n) => n.target.join(" ")), anzahl: v.nodes.length,
    /* Ausschnitt der ersten Knoten (nur erfundene Demo-Daten) und axes Begründung, damit der Befund ohne neuen Lauf behebbar ist. */
    knoten: v.nodes.slice(0, 5).map((n) => ({ html: String(n.html || "").slice(0, 240), warum: String(n.failureSummary || "").slice(0, 400) })) }));
  mkdirSync(ERGEBNISSE, { recursive: true });
  const datei = path.join(ERGEBNISSE, `${flaeche}-${viewport}.json`);
  writeFileSync(datei, JSON.stringify({ flaeche, viewport, axe: erg.testEngine && erg.testEngine.version, tags: AXE_TAGS, verstoesse }, null, 1));
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
  expect(neu.map((v) => `${v.schwere} ${v.regel}: ${v.hilfe} [${v.ziele.slice(0, 3).join(" | ")}]${v.anzahl > 3 ? ` (+${v.anzahl - 3})` : ""}`),
    `axe WCAG 2.2 AA auf ${flaeche} @ ${viewport}: serious/critical ohne Ausnahme`).toEqual([]);
}
