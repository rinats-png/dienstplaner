/* Herkunft je Test (X-Forwarded-For) für die Playwright-Suite — rein, ohne Browser (geprüft in pruefungen/e2e-flaechen.test.js).

   Jeder Test ist ein eigener „Rechner“: Der Server vertraut 127.0.0.1 als Proxy (global-setup.mjs) und zählt seine Bremsen
   je Herkunft. Befund CI #423 (2026-11-20): Die frühere Formel `(h >> 8) % 240` rechnete mit Vorzeichen; für etwa die Hälfte
   der Tests entstand eine ungültige Adresse wie 10.33.-164.113. Der Server verwirft eine ungültige Kette
   (schutz.mjs herkunftBestimmen) und zählt dann die Gegenstelle 127.0.0.1 — alle diese Tests teilten sich EINEN Zähler,
   u. a. die Demo-Bremse auf GET /api/demos (20 je 5 Minuten, Anmeldeseite). Danach antwortete /api/demos 429, Chromium
   meldete die Anfrage nie als beendet, und jedes `waitForLoadState("networkidle")` lief 15 s in die Zeitgrenze. Welche
   Tests es traf, hing an Reihenfolge und Anzahl der Tests im 5-Minuten-Fenster (L2 der lokalen Abnahme lief über 90 s). */

/** Gültige, je Test stabile Herkunft 10.33.0–239.1–254. @param {string} testId @param {number} retry */
export function herkunftFuerTest(testId, retry) {
  let h = 7;
  for (const z of `${testId}:${retry}`) h = (h * 31 + z.charCodeAt(0)) >>> 0;
  return `10.33.${(h >>> 8) % 240}.${(h % 254) + 1}`;
}
