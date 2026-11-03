/* ==========================================================================
   REGELWERK — Weiterleitung

   Das Regelwerk (Konstanten, REGELSTAND, Zeit- und Prüfrechnungen) steht
   seit WP-22 in server/lib/regelwerk.mjs, damit der Server dieselben
   Rechnungen nutzt wie die Oberfläche — eine Fassung, keine zweite
   Prüflogik (das Serverbild enthält kein src/). Diese Datei reicht nur
   weiter; Oberfläche und Prüfungen importieren unverändert von hier.
   ========================================================================== */
export * from "../server/lib/regelwerk.mjs";
