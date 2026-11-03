/* ==========================================================================
   IST-DATEN — Weiterleitung

   Die Ist-Rechnung (Rollenschutz, istZeitFuer, ungeplanter Dienst, Prüffälle)
   steht in server/lib/istdaten.mjs — seit dem WP-27-Nachtrag für die
   Betriebsrat-Auswertung des Servers und seit WP-16 (Review H1) für das beim
   Monatsabschluss eingefrorene Ist je Person und Tag. Server und Oberfläche
   rechnen mit derselben Fassung, keine zweite Rechenlogik (das Serverbild
   enthält kein src/; Muster wie src/regelwerk.js). Diese Datei reicht nur
   weiter; Oberfläche und Prüfungen importieren unverändert von hier.
   ========================================================================== */
export * from "../server/lib/istdaten.mjs";
