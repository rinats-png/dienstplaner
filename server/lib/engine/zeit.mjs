/* ==========================================================================
   RECHENKERN — TAGESDATUM (WP-I12)

   Die Planrechnung kennt genau eine Uhr: heute(). Im Client ist das der
   Rechnertag, genau wie vorher (src/lib/datum.js reicht diese Funktion weiter).
   Für eine Gegenrechnung auf dem Server legt mitTagesdatum() den Tag fest —
   nur für die Dauer des (synchronen) Aufrufs, danach gilt wieder die Uhr.
   Die Rechnung ist synchron; es gibt keine Nebenläufigkeit, in der sich zwei
   Aufrufe das Datum teilen könnten.
   ========================================================================== */
import { iso } from "../regelwerk.mjs";

let fest = null;
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Heutiger Tag JJJJ-MM-TT (oder der mit mitTagesdatum festgelegte). */
export const heute = () => (fest !== null ? fest : iso(new Date()));

/**
 * Führt f mit festem Tagesdatum aus (JJJJ-MM-TT). Verschachtelt erlaubt; das
 * vorherige Datum wird immer wiederhergestellt.
 * @template T @param {string} tag @param {() => T} f @returns {T}
 */
export function mitTagesdatum(tag, f) {
  if (typeof tag !== "string" || !ISO_TAG.test(tag)) throw new TypeError("Tagesdatum JJJJ-MM-TT erwartet.");
  const vorher = fest;
  fest = tag;
  try { return f(); } finally { fest = vorher; }
}
