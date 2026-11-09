/* Eine Prüfung für „Auslieferung“: NODE_ENV=production, normalisiert (Leerraum, Groß-/Kleinschreibung).
   Alle Stellen, die sich in der Auslieferung strenger verhalten, fragen hier — nicht mehr je Stelle
   mit einem eigenen strengen Vergleich (WP-32d, Review 5). Wird bei jedem Aufruf gelesen. */
export const istProduktion = (env = process.env) => String(env.NODE_ENV || "").trim().toLowerCase() === "production";

/** Die einzigen Umgebungen, in denen der Betreiber-Faktor NICHT von selbst Pflicht ist (WP-32d). */
export const ENTWICKLUNGSUMGEBUNGEN = Object.freeze(["development", "test"]);

/**
 * Ist der zweite Faktor für Betreibercodes Pflicht? (WP-32d, fail-closed)
 *
 * Ausdrücklich ausgenommen sind nur NODE_ENV=development und NODE_ENV=test (Entwicklung, Prüfläufe) — und auch dort
 * schaltet CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1 die Pflicht ein. In JEDER anderen Lage gilt sie: production,
 * aber auch eine fehlende, leere oder unbekannte NODE_ENV („prod“, „staging“ …). Ein Server, der ohne Docker-Image
 * und ohne NODE_ENV gestartet wird, läuft damit nicht mehr still ohne zweiten Faktor. Es gibt keinen Abschalter:
 * „0“, „aus“, leer ändern nichts. Liegt hier (nicht in betreiber-zweifaktor.mjs), damit auch sitzungen.mjs fragen
 * kann, ohne Kreisimport. Wird bei jedem Aufruf gelesen.
 * @param {Record<string, string|undefined>} [env]
 */
export function betreiberZweifaktorPflicht(env = process.env) {
  const umgebung = String(env.NODE_ENV || "").trim().toLowerCase();
  if (!ENTWICKLUNGSUMGEBUNGEN.includes(umgebung)) return true;
  return String(env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT || "").trim() === "1";
}
