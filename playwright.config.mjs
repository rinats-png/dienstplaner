/* ==========================================================================
   PLAYWRIGHT — E2E-Suite (WP-33), siehe docs/TESTEN-E2E.md

   Drei Bildschirme × alle Rollen, nur Chromium. Ein Server für den ganzen
   Lauf (e2e/global-setup.mjs), Wegwerfablage, erfundene Daten.

   Datenschutz der Suite selbst:
     - keine Spuren (trace) und keine Videos: beide hielten Eingaben und
       Netzverkehr fest, also auch Zugangscodes
     - Bildschirmfotos nur bei Fehler, und dann mit geschwärztem Codefeld
       (e2e/hilfen.mjs, Fixture `page`)
   ========================================================================== */

import { defineConfig } from "@playwright/test";
import { BASIS, ERGEBNISSE } from "./e2e/umgebung.mjs";
import { ZEITZONE } from "./e2e/testdaten.mjs";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.mjs$/,
  outputDir: `${ERGEBNISSE}/artefakte`,
  globalSetup: "./e2e/global-setup.mjs",
  /* Ein Server, eine Ablage, Stempel ändern Daten: ein Arbeiter genügt und
     hält den Laptop frei. */
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: `${ERGEBNISSE}/bericht`, open: "never" }],
    ["json", { outputFile: `${ERGEBNISSE}/ergebnis.json` }],
  ],
  use: {
    baseURL: BASIS,
    browserName: "chromium",
    locale: "de-DE",
    timezoneId: ZEITZONE,
    trace: "off",
    video: "off",
    screenshot: "off",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "telefon", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 2 } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
