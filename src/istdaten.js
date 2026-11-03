/* ==========================================================================
   IST-DATEN — Weiterleitung

   Die Ist-Rechnung (istZeitFuer, Rollenschutz istVerfuegbar, Prüffälle) steht
   seit WP-16 (Review H1) in server/lib/istdaten.mjs: Der Server friert beim
   Monatsabschluss das Ist je Person und Tag mit derselben Rechnung ein, die
   die Oberfläche für offene Monate benutzt — eine Fassung, keine zweite
   Rechenlogik (das Serverbild enthält kein src/). Diese Datei reicht nur
   weiter; Oberfläche und Prüfungen importieren unverändert von hier.
   ========================================================================== */
export * from "../server/lib/istdaten.mjs";
