/* ==========================================================================
   RECHENKERN — TAGESDATUM (WP-I12)

   Die Planrechnung kennt genau eine Uhr: heute(). Das ist der betriebliche
   Kalendertag (Europe/Berlin, server/lib/betriebszeit.mjs) — im Browser wie
   auf dem Server, unabhängig von der Zeitzone des Geräts oder des Prozesses
   (WP-ZEIT, ZEIT-C; bis dahin war es im Client der Rechnertag des Geräts:
   ein Gerät in UTC oder Auckland zeigte um Mitternacht den falschen Tag).
   src/lib/datum.js reicht diese Funktion weiter.
   Für eine Gegenrechnung auf dem Server legt mitTagesdatum() den Tag fest —
   nur für die Dauer des (synchronen) Aufrufs, danach gilt wieder die Uhr.
   Die Rechnung ist synchron; es gibt keine Nebenläufigkeit, in der sich zwei
   Aufrufe das Datum teilen könnten.
   ========================================================================== */
import { betriebstag } from "../betriebszeit.mjs";

let fest = null;
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Heutiger betrieblicher Kalendertag JJJJ-MM-TT (oder der mit mitTagesdatum festgelegte). */
export const heute = () => (fest !== null ? fest : betriebstag(new Date()));

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
