/* ==========================================================================
   INTELLIGENCE — Bytelänge ohne Node-APIs (browserfähig)

   Gleiche Zählung wie Buffer.byteLength(text, "utf8"): UTF-8-Bytes; einzelne
   Surrogate werden wie bei Buffer zu U+FFFD (3 Bytes). Abhängigkeitsfrei,
   damit Server und Browser (KiAntwort über schemas.mjs) dieselbe Datei nutzen.
   ========================================================================== */
const KODIERER = new TextEncoder();

/** @param {string} text @returns {number} */
export function byteLaenge(text) {
  /* Wie Buffer.byteLength: Nicht-Text wirft TypeError (z. B. JSON.stringify(undefined)). */
  if (typeof text !== "string") throw new TypeError("byteLaenge: Text erwartet");
  return KODIERER.encode(text).length;
}
