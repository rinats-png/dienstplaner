/* ==========================================================================
   INTELLIGENCE-GATEWAY — KANONISCHE SERIALISIERUNG (WP-I13/I14)

   Schlüssel sortiert, damit dieselben Daten immer denselben Text ergeben
   (Fingerprint, Wiederholungsschutz). Nur JSON-Daten; Funktionen/undefined
   werden wie in JSON behandelt.
   ========================================================================== */

export function kanonisch(w) {
  if (Array.isArray(w)) return `[${w.map(kanonisch).join(",")}]`;
  if (w && typeof w === "object") return `{${Object.keys(w).sort().map((k) => `${JSON.stringify(k)}:${kanonisch(w[k])}`).join(",")}}`;
  return JSON.stringify(w) ?? "null";
}
