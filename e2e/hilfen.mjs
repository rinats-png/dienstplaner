/* ==========================================================================
   E2E — gemeinsame Hilfen und Fixtures

   Selektiert wird ausschließlich über Rollen, Beschriftungen und sichtbare
   Texte (die Anwendung hat keine Testkennungen, und die Suite baut keine
   ein). Bedarf an stabileren Ankern steht in docs/TESTEN-E2E.md.
   ========================================================================== */

import { test as basis, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASIS, ERGEBNISSE } from "./umgebung.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..");

/** Zugänge aus dem Aufbau — nur im Speicher dieses Prozesses. */
export function zugang(rolle) {
  const alle = JSON.parse(process.env.E2E_ZUGAENGE || "{}");
  if (!alle[rolle]) throw new Error(`Kein Zugang für „${rolle}" — lief e2e/global-setup.mjs?`);
  return alle[rolle];
}

export const test = basis.extend({
  /** Konsolenfehler und Seitenfehler dieses Tests. */
  konsolenfehler: async ({ page }, use) => {
    const fehler = [];
    page.on("console", (m) => { if (m.type() === "error") fehler.push(`console: ${m.text()}`); });
    page.on("pageerror", (e) => fehler.push(`pageerror: ${e.message}`));
    /* Der Browser meldet fehlgeschlagene Anfragen ohne Adresse — die steht hier daneben. */
    page.on("response", (r) => {
      if (r.status() >= 400) fehler.push(`http ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    await use(fehler);
  },
  /* Bildschirmfoto nur bei Fehler — Codefeld geschwärzt. Ersetzt das
     eingebaute `screenshot`, das keine Schwärzung kennt. */
  page: async ({ page }, use, testInfo) => {
    /* Jeder Test ein eigener „Rechner“: In Produktion setzt Caddy die Herkunft
       (X-Forwarded-For), hier käme jede Anfrage von 127.0.0.1 ohne Kopf, und die
       Bremsen je Herkunft (z. B. 20 Abrufe /api/demos je fünf Minuten) zählten die
       ganze Suite als einen einzigen Besucher. */
    let h = 0;
    for (const z of `${testInfo.testId}:${testInfo.retry}`) h = (h * 31 + z.charCodeAt(0)) >>> 0;
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.44.${(h >> 8) & 255}.${(h & 255) || 1}` });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
      try {
        const bild = await page.screenshot({ fullPage: false,
          mask: [page.locator("input#code"), page.getByLabel("Zugangscode")], maskColor: "#000" });
        await testInfo.attach("bildschirm-bei-fehler", { body: bild, contentType: "image/png" });
      } catch { /* Seite schon weg */ }
    }
  },
});
export { expect };

/** Meldet die Sitzung einer Rolle an, ohne die Anmeldeseite (Sitzung wie nach dem Code). */
export async function mitSitzung(page, rolle) {
  const { token } = zugang(rolle);
  await page.addInitScript((t) => {
    try { if (!sessionStorage.getItem("centric:token")) sessionStorage.setItem("centric:token", t); }
    catch { /* egal */ }
  }, token);
}

/** Woran man erkennt, dass die Anwendung einer Rolle geladen ist. */
export function geladen(page, rolle) {
  if (rolle === "mitarbeiter" || rolle === "mitarbeiterOffline")
    return page.getByRole("navigation").getByRole("button", { name: /Heute/ });
  if (rolle === "betreiber") return page.getByRole("heading", { name: "Mandanten", level: 1 });
  if (rolle === "kunde") return page.getByText("Dienstplanung für den durchgehenden Schichtbetrieb");
  return page.getByRole("main", { name: /^Ansicht / });
}

/** Startseite öffnen und warten, bis die Anwendung der Rolle steht. */
export async function starten(page, rolle) {
  await page.goto("/");
  await expect(geladen(page, rolle)).toBeVisible({ timeout: 20_000 });
}

/** Eine Ansicht über die Hauptnavigation öffnen (auf schmalen Schirmen erst aufklappen). */
export async function ansicht(page, beschriftung, viewId) {
  const auf = page.getByRole("button", { name: "Navigation öffnen" });
  if (await auf.isVisible().catch(() => false)) {
    if ((await auf.getAttribute("aria-expanded")) !== "true") await auf.click();
  }
  const nav = page.getByRole("complementary", { name: "Hauptnavigation" });
  await nav.getByRole("button", { name: new RegExp(`^\\W*${beschriftung}\\b`) }).first().click();
  if (viewId) await expect(page.getByRole("main", { name: `Ansicht ${viewId}` })).toBeVisible();
}

/**
 * Ist die Seite breiter als das Fenster? Liefert Messwerte und die breitesten Verursacher.
 *
 * Verglichen wird mit der eingestellten Fensterbreite, nicht mit innerWidth: Auf einem
 * mobilen Gerät (isMobile) wächst das Layout-Fenster mit zu breitem Inhalt mit — bei
 * 601 px Inhalt meldet innerWidth dann ebenfalls 601, und `scrollWidth <= innerWidth`
 * wäre immer wahr. Gemessen nachgestellt an den Abrechnungsdaten am Telefon.
 */
export async function waagerechterUeberlauf(page) {
  /* Zwei Bilder abwarten: Schriften und späte Layouts setzen sich. */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fenster = page.viewportSize().width;
  return page.evaluate((fenster) => {
    const breite = Math.min(window.innerWidth, fenster);
    const scroll = document.documentElement.scrollWidth;
    const verursacher = [];
    if (scroll > breite) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > breite + 1 && r.width > 0) {
          const name = el.tagName.toLowerCase() + (el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : "");
          verursacher.push(`${name} rechts=${Math.round(r.right)} „${(el.textContent || "").trim().slice(0, 40)}“`);
        }
        if (verursacher.length >= 8) break;
      }
    }
    return { breite, scroll, verursacher };
  }, fenster);
}

export async function keinWaagerechterUeberlauf(page) {
  const m = await waagerechterUeberlauf(page);
  expect(m.scroll, `Seite ${m.scroll}px breit bei ${m.breite}px Fenster. Verursacher:\n${m.verursacher.join("\n")}`)
    .toBeLessThanOrEqual(m.breite);
}

/* ------------------------------ Barrierefreiheit ------------------------- */

const BEKANNT = JSON.parse(readFileSync(path.join(HIER, "axe-bekannt.json"), "utf8"));

/**
 * axe auf der aktuellen Seite. Schreibt den vollständigen Befund nach
 * e2e/ergebnisse/axe/<name>.json und hängt ihn an den Test. Rot wird es nur
 * bei einem critical-Verstoß, der nicht in e2e/axe-bekannt.json steht.
 */
export async function axePruefen(page, testInfo, name) {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const knapp = ergebnis.violations.map((v) => ({ id: v.id, impact: v.impact, hilfe: v.help,
    url: v.helpUrl, anzahl: v.nodes.length,
    ziele: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
  const zaehl = (stufe) => knapp.filter((v) => v.impact === stufe).length;
  const bericht = { ansicht: name, projekt: testInfo.project.name, url: page.url().replace(BASIS, ""),
    critical: zaehl("critical"), serious: zaehl("serious"), moderate: zaehl("moderate"), minor: zaehl("minor"),
    verstoesse: knapp };
  const ordner = path.join(WURZEL, ERGEBNISSE, "axe");
  mkdirSync(ordner, { recursive: true });
  const datei = path.join(ordner, `${name}--${testInfo.project.name}.json`);
  writeFileSync(datei, JSON.stringify(bericht, null, 2));
  await testInfo.attach(`axe-${name}`, { path: datei, contentType: "application/json" });
  testInfo.annotations.push({ type: "axe",
    description: `${name}: critical ${bericht.critical}, serious ${bericht.serious}` });

  const bekannt = new Set(BEKANNT[name] || []);
  const neu = knapp.filter((v) => v.impact === "critical" && !bekannt.has(v.id));
  const behoben = [...bekannt].filter((id) => !knapp.some((v) => v.id === id && v.impact === "critical"));
  if (behoben.length) testInfo.annotations.push({ type: "axe-behoben",
    description: `${name}: ${behoben.join(", ")} nicht mehr gefunden — aus e2e/axe-bekannt.json streichen` });
  expect(neu.map((v) => `${v.id} (${v.anzahl}×): ${v.hilfe} → ${v.ziele.join(" | ")}`),
    `Neue critical-Verstöße in „${name}“`).toEqual([]);
  return bericht;
}
