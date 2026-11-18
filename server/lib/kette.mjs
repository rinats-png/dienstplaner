/* ==========================================================================
   WP-48.6 — SEGMENTPROPORTIONALE SCHREIBKETTE (Schalter)

   Die Schreibkette (PUT /api/bestand, POST /api/bestand/teile) kürzt dort ab,
   wo das Ergebnis beweisbar dasselbe ist wie auf dem vollen Weg: Einträge,
   die dasselbe Objekt sind wie der gespeicherte Stand (Stempel-, Abschluss-
   prüfung), Scherbenkennungen ohne Abdruck (unveraenderteScherben), Abdrücke
   unveränderter Scherben aus dem Lesen (bestandSchreiben). Siehe
   bestand.mjs, stempelintegritaet.mjs, monatsabschluss.mjs.

   Die Abkürzungen laufen in Produktion immer (Vorgabe an), ergebnisgleich;
   es gibt keinen Betreiberschalter dafür. CENTRIC_KETTE_AUS=1 stellt den
   vollen Weg wieder her — gedacht für den Differenzialtest
   (pruefungen/wp48-6-kette.test.js, alt gegen neu) und als Rückfall bei
   einem Befund. Kein veränderbares Exportobjekt: Der Zustand wird bei jedem
   Aufruf aus der Umgebung gelesen.

   Eigene Datei ohne node:crypto und ohne Node-Pflicht: stempelintegritaet.mjs
   und monatsabschluss.mjs erreichen auch die Oberfläche (Vite-Bündel), dort
   gibt es kein process — dann gilt die Vorgabe (an).
   ========================================================================== */

/** Sind die Abkürzungen der Kette an? Vorgabe ja; nur CENTRIC_KETTE_AUS=1 schaltet sie ab. */
export function ketteAn() {
  return !(typeof process !== "undefined" && process && process.env && process.env.CENTRIC_KETTE_AUS === "1");
}
