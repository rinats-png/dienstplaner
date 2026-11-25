/* WP-33 Teil 3: Playwright-Suite (e2e/) — Browserabnahme mit axe an den acht Viewports der Gerätematrix WP-21.
   Nur Chromium, headless; der echte Server (server.mjs) mit Wegwerfdaten startet in e2e/global-setup.mjs.
   Keine Spuren, keine Videos, keine Bildschirmfotos (Zugangscodes stehen im Anmeldefeld). Anleitung:
   docs/acc45/WP-33-PLAYWRIGHT-AXE.md. Aufruf: npm run e2e (vorher einmal: npx playwright install chromium). */
import { defineConfig } from "@playwright/test";
import { BASIS, VIEWPORTS, RAEUME_HOECHSTENS } from "./e2e/umgebung.mjs";
import { ZONEN_PROJEKTE, ZONEN_SPEC, ZONEN_VIEWPORT } from "./e2e/zonen.mjs";
import { WEBSITE_SPEC } from "./e2e/website.mjs";
import { VISUELL_SPEC } from "./e2e/v4-visuell.mjs";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: "./e2e/ergebnisse/artefakte",
  globalSetup: "./e2e/global-setup.mjs",
  /* WP-48-GB: Mehrere Arbeiter, JE ARBEITER EIN EIGENER RAUM (e2e/global-setup.mjs, e2e/umgebung.mjs arbeiterRaumWaehlen).
     Früher workers: 1 als Notlösung: Parallel geöffnete Sitzungen lösten den Dialog „Gleichzeitig bearbeitet“ aus. Das
     bloße Öffnen schreibt seit #271/#365/#374 nicht mehr (pruefungen/wp48-gb-oeffnen.test.js, wp48-gb-lesen.test.js,
     e2e/oeffnen-parallel.spec.mjs). Was danach blieb, waren technisch korrekte 409: Praktisch alle Specs schreiben in den
     Raum (anmelden() schließt mit tourZu() eine offene Tour, dazu Abnahme A/B, Teilkonflikt, lokale Abnahme); zwei
     Arbeiter im selben Raum bearbeiten denselben Bestand. Dass schon das Tour-Schließen zweier Personen kollidiert, ist
     ein offener Produktbefund (WP-48-GB-T, ENTSCHEIDUNGSLISTE P2-32: Tourzustand liegt im Kern des Bestands), kein Fehler
     des Öffnens. Getrennte Räume trennen die Arbeiter; innerhalb eines Arbeiters laufen die Tests
     einer Datei nacheinander (fullyParallel: false). E2E_WORKERS (oder --workers) ändert die Zahl, höchstens
     RAEUME_HOECHSTENS Räume. */
  fullyParallel: false,
  workers: Math.min(RAEUME_HOECHSTENS, Math.max(1, Number(process.env.E2E_WORKERS) || 2)),
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
  /* ZEIT-F (T-E2E-TZ): Die acht Viewport-Projekte laufen in der Zeitzone des Rechners (CI: UTC) und lassen die Zonen-Spec
     aus; die Zonenprojekte (e2e/zonen.mjs) fahren nur sie, mit festgelegter Browser-Zeitzone. */
  projects: [
    ...VIEWPORTS.map((v) => ({
      name: v.id,
      testIgnore: [ZONEN_SPEC, WEBSITE_SPEC, VISUELL_SPEC],
      use: { browserName: "chromium", viewport: { width: v.w, height: v.h }, hasTouch: v.w < 1000 },
    })),
    ...ZONEN_PROJEKTE.map((z) => ({
      name: z.name,
      testMatch: ZONEN_SPEC,
      use: { browserName: "chromium", viewport: { ...ZONEN_VIEWPORT }, hasTouch: true, timezoneId: z.timezoneId },
    })),
    /* WEBSITE-W2: Prüfsatz der statisch gebauten Website (e2e/website-pruefsatz.spec.mjs); die Breiten setzt die Spec selbst. */
    { name: "website", testMatch: WEBSITE_SPEC, use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    /* V4-4: visuelle QA der App in Hell und Dunkel (e2e/v4-visuell.spec.mjs); Breite und Thema setzt die Spec selbst. */
    { name: "v4-visuell", testMatch: VISUELL_SPEC, testIgnore: [ZONEN_SPEC, WEBSITE_SPEC], use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
});
