/* ==========================================================================
   WP-48.6 — SEGMENTPROPORTIONALE SCHREIBKETTE (Schalter)

   Die Schreibkette (PUT /api/bestand, POST /api/bestand/teile) kürzt dort ab,
   wo das Ergebnis beweisbar dasselbe ist wie auf dem vollen Weg: Einträge,
   die dasselbe Objekt sind wie der gespeicherte Stand (Stempel-, Abschluss-
   prüfung), Scherbenkennungen ohne Abdruck (unveraenderteScherben), Abdrücke
   unveränderter Scherben aus dem Lesen (bestandSchreiben). Siehe
   bestand.mjs, stempelintegritaet.mjs, monatsabschluss.mjs.

   `an: false` stellt den vollen Weg wieder her — nur für den
   Differenzialtest (pruefungen/wp48-6-kette.test.js, alt gegen neu). Kein
   Betreiberschalter, keine Umgebungsvariable.

   Eigene Datei ohne node:crypto: stempelintegritaet.mjs und
   monatsabschluss.mjs erreichen auch die Oberfläche (Vite-Bündel).
   ========================================================================== */

export const KETTE = { an: true };
