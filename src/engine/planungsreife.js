/* Planungsreife (WP-I6) — Weiterleitung. Der Rechenkern steht in
   server/lib/engine/planungsreife.mjs (AD-06: das Docker-Bild enthält src/
   nicht); Oberfläche und Prüfungen importieren von hier. */
export { planungsreife, vorschlagErlaubt, REIFE_PUNKTE, PLANUNGSREIFE_VERSION } from "../../server/lib/engine/planungsreife.mjs";
