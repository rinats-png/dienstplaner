/* ==========================================================================
   IST-DATEN — Weiterleitung

   Die Ist-Rechnung (Rollenschutz, istZeitFuer, ungeplanter Dienst, Prüffälle)
   steht seit dem WP-27-Nachtrag in server/lib/istdaten.mjs, damit die
   Betriebsrat-Auswertung des Servers dieselbe Rechnung nutzt wie Stundenkonto
   und Lohnausgabe der Oberfläche — eine Fassung, keine zweite Logik (das
   Serverbild enthält kein src/; Muster wie src/regelwerk.js). Diese Datei
   reicht nur weiter; Oberfläche und Prüfungen importieren unverändert von hier.
   ========================================================================== */
export * from "../server/lib/istdaten.mjs";
