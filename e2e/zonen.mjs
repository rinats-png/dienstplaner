/* ZEIT-F, T-E2E-TZ (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.2): Zonenprojekte der Playwright-Suite.

   Der Betriebstag ist der Berliner Kalendertag (server/lib/betriebszeit.mjs, E1). Die Oberfläche darf ihn nicht aus der
   Zeitzone des Geräts ableiten. Die Zonenprojekte fahren dafür nur zwei kleine Specs (ZONEN_SPEC) in einem Browser mit
   festgelegter Zeitzone; die acht Viewport-Projekte lassen sie aus. Damit bleibt der Zusatz in der Browserabnahme klein
   (Laufzeiten aus der CI: Vertrag § 13.3).

   Zonen: die drei des Vertrags (UTC, New York, Tokio) und Pago Pago (UTC−11, ohne Sommerzeit). Nur in Pago Pago liegt der
   Gerätetag am festen Abnahmezeitpunkt (Samstag 2026-11-14, 10:00 Berlin, e2e/zeitbasis.mjs) auf dem VORTAG — nur dort
   ist der Abgleich mit dem Server ohne verstellte Browseruhr ein echter Gegenbeweis. Für die anderen Zonen stellt der
   Mitternachtstest die Browseruhr mit page.clock auf 23:58 und 00:02 Berlin.

   Aufruf einzeln: npx playwright test --project=tz-utc (oder tz-newyork, tz-tokyo, tz-pagopago). */

/** Die Specs der Zonenprojekte (Muster für testMatch/testIgnore): die Zonen-Spec (Z1/Z2) und, seit ZEIT-F Rest, die
 *  Abläufe der Abnahme B in fremder Zone (e2e/zeit-f-abnahme-b-zonen.spec.mjs: Stempeluhr in jeder Zone, B7 nur in
 *  Pago Pago). Die acht Viewport-Projekte lassen beide aus. */
export const ZONEN_SPEC = /zeit-f-(?:zonen|abnahme-b-zonen)\.spec\.mjs$/;

/** Das einzige Zonenprojekt, in dem B7 (schreibend) läuft: Nur dort liegt der Gerätetag am Abnahmezeitpunkt auf dem
 *  Vortag. In den anderen drei Zonen fiele er mit dem Betriebstag zusammen; B7 wäre dort ohne verstellte Serveruhr
 *  derselbe Ablauf wie im Viewport-Projekt 390x844 (Mitternacht bei verschobener Serveruhr: pruefungen/zeit-f-serveruhr.test.js). */
export const B7_ZONENPROJEKT = "tz-pagopago";

/** Telefon hoch wie das Ablaufprojekt der Abnahme B (390x844); dort zeigt „Heute“ Datum und Stempeluhr. */
export const ZONEN_VIEWPORT = Object.freeze({ width: 390, height: 844 });

/** Projektname → IANA-Zone des Browsers. */
export const ZONEN_PROJEKTE = Object.freeze([
  Object.freeze({ name: "tz-utc", timezoneId: "UTC" }),
  Object.freeze({ name: "tz-newyork", timezoneId: "America/New_York" }),
  Object.freeze({ name: "tz-tokyo", timezoneId: "Asia/Tokyo" }),
  Object.freeze({ name: "tz-pagopago", timezoneId: "Pacific/Pago_Pago" }),
]);
