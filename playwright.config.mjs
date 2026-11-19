/* WP-33 Teil 3: Playwright-Suite (e2e/) — Browserabnahme mit axe an den acht Viewports der Gerätematrix WP-21.
   Nur Chromium, headless; der echte Server (server.mjs) mit Wegwerfdaten startet in e2e/global-setup.mjs.
   Keine Spuren, keine Videos, keine Bildschirmfotos (Zugangscodes stehen im Anmeldefeld). Anleitung:
   docs/acc45/WP-33-PLAYWRIGHT-AXE.md. Aufruf: npm run e2e (vorher einmal: npx playwright install chromium). */
import { defineConfig } from "@playwright/test";
import { BASIS, VIEWPORTS } from "./e2e/umgebung.mjs";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: "./e2e/ergebnisse/artefakte",
  globalSetup: "./e2e/global-setup.mjs",
  /* Nacheinander: Alle Rollen arbeiten im selben Demo-Betrieb. Parallel geöffnete Sitzungen lösten im ersten Lauf den
     Dialog „Gleichzeitig bearbeitet“ aus, der die Navigation verdeckte; ein Test soll keinen Konflikt entscheiden müssen. */
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: "e2e/ergebnisse/ergebnis.json" }]],
  use: {
    baseURL: BASIS,
    headless: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    locale: "de-DE",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: VIEWPORTS.map((v) => ({
    name: v.id,
    use: { browserName: "chromium", viewport: { width: v.w, height: v.h }, hasTouch: v.w < 1000 },
  })),
});
