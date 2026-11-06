/* Eine Prüfung für „Auslieferung“: NODE_ENV=production, normalisiert (Leerraum, Groß-/Kleinschreibung).
   Alle Stellen, die sich in der Auslieferung strenger verhalten, fragen hier — nicht mehr je Stelle
   mit einem eigenen strengen Vergleich (WP-32d, Review 5). Wird bei jedem Aufruf gelesen. */
export const istProduktion = (env = process.env) => String(env.NODE_ENV || "").trim().toLowerCase() === "production";
