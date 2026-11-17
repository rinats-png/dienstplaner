/* WP-33 Rest: weitere Oberflächen der axe-Suite (WCAG 2.2 AA), zusätzlich zu e2e/barrierefreiheit.spec.mjs.
   Reine Daten ohne Browserbezug, damit pruefungen/e2e-flaechen.test.js sie ohne Playwright gegen die Navigation
   (src/app/navigation.js) und die Rollen der Suite (e2e/umgebung.mjs) prüfen kann.
   Nur lesende Ansichten der Verwaltungs- und Planungsrollen; die Telefonansichten der Beschäftigten (Mein Plan, Stempeluhr,
   Krankmeldung) decken e2e/barrierefreiheit.spec.mjs und e2e/abnahme-b-ablaeufe.spec.mjs schon ab. */

/** [Fläche, Rolle, Ansicht] — Ansicht = Beschriftung des Navigationseintrags (BEREICHE in src/app/navigation.js). */
export const WEITERE_FLAECHEN = Object.freeze([
  Object.freeze(["antraege-planer", "planer", "Anträge"]),
  Object.freeze(["tauschboerse-planer", "planer", "Tauschbörse"]),
  Object.freeze(["personal-leitung", "leitung", "Personal"]),
  Object.freeze(["pruefung-leitung", "leitung", "Prüfung"]),
  Object.freeze(["abrechnungsdaten-leitung", "leitung", "Abrechnungsdaten"]),
  Object.freeze(["hilfe-leitung", "leitung", "Hilfe"]),
  Object.freeze(["rechtliches-leitung", "leitung", "Rechtliches"]),
]);
