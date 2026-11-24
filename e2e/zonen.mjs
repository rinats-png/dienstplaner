/* ZEIT-F, T-E2E-TZ (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.2): Zonenprojekte der Playwright-Suite.

   Der Betriebstag ist der Berliner Kalendertag (server/lib/betriebszeit.mjs, E1). Die Oberfläche darf ihn nicht aus der
   Zeitzone des Geräts ableiten. Die Zonenprojekte fahren dafür EINE kleine Spec (e2e/zeit-f-zonen.spec.mjs) in einem
   Browser mit festgelegter Zeitzone; die acht Viewport-Projekte lassen diese Spec aus, und die Zonenprojekte fahren nur
   sie. Damit bleibt der Zusatz in der Browserabnahme klein (CI 2026-11-24: 8 Tests, 19 s Testzeit; Vertrag § 13.3).

   Zonen: die drei des Vertrags (UTC, New York, Tokio) und Pago Pago (UTC−11, ohne Sommerzeit). Nur in Pago Pago liegt der
   Gerätetag am festen Abnahmezeitpunkt (Samstag 2026-11-14, 10:00 Berlin, e2e/zeitbasis.mjs) auf dem VORTAG — nur dort
   ist der Abgleich mit dem Server ohne verstellte Browseruhr ein echter Gegenbeweis. Für die anderen Zonen stellt der
   Mitternachtstest die Browseruhr mit page.clock auf 23:58 und 00:02 Berlin.

   Aufruf einzeln: npx playwright test --project=tz-utc (oder tz-newyork, tz-tokyo, tz-pagopago). */

/** Die Spec der Zonenprojekte (Muster für testMatch/testIgnore). */
export const ZONEN_SPEC = /zeit-f-zonen\.spec\.mjs$/;

/** Telefon hoch wie das Ablaufprojekt der Abnahme B (390x844); dort zeigt „Heute“ Datum und Stempeluhr. */
export const ZONEN_VIEWPORT = Object.freeze({ width: 390, height: 844 });

/** Projektname → IANA-Zone des Browsers. */
export const ZONEN_PROJEKTE = Object.freeze([
  Object.freeze({ name: "tz-utc", timezoneId: "UTC" }),
  Object.freeze({ name: "tz-newyork", timezoneId: "America/New_York" }),
  Object.freeze({ name: "tz-tokyo", timezoneId: "Asia/Tokyo" }),
  Object.freeze({ name: "tz-pagopago", timezoneId: "Pacific/Pago_Pago" }),
]);
