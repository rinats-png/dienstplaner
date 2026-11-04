/* ==========================================================================
   FELDER FÜR TRENNZEICHENDATEIEN (CSV)

   Eine Stelle für alle CSV-Ausgaben der Oberfläche.
   ========================================================================== */

/**
 * Ein Feld für die Trennzeichendatei.
 *
 * Die Lohnartenbezeichnungen sind je Betrieb frei benennbar. Ein Semikolon
 * darin — „Zuschlag Nacht; steuerfrei" — schob bisher alle folgenden Spalten
 * um eins nach rechts, und zwar lautlos: Die Datei ließ sich öffnen, nur die
 * Stunden standen in der Spalte des Abrechnungsmonats.
 * @param {unknown} v
 * @returns {string}
 */
export const csvFeld = (v) => {
  const s = String(v == null ? "" : v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Ein Freitextfeld (Namen von Einheiten, Bezeichnungen) für die
 * Trennzeichendatei — zusätzlich gegen Formel-Injection geschützt (WP-27b, B6):
 * Beginnt der Text (auch nach Leerraum) mit = + - @ oder mit Tabulator bzw.
 * Wagenrücklauf, wertet eine Tabellenkalkulation ihn als Formel aus. Ein
 * vorangestelltes Hochkomma macht ihn zu Text. Danach wie csvFeld maskiert
 * (Semikolon, Anführungszeichen, Zeilenumbruch) und zusätzlich bei Komma
 * oder Tabulator in Anführungszeichen gesetzt (Review S3): Tabellenprogramme
 * mit automatischer Trennzeichenerkennung teilen auch dort, und ein
 * abgespaltener Rest könnte in seiner eigenen Zelle als Formel beginnen.
 * Nur für Text — Zahlen wie „-2,50" gehen weiter über csvFeld.
 * @param {unknown} v
 * @returns {string}
 */
export const csvText = (v) => {
  const s = String(v == null ? "" : v);
  const t = /^[\t\r]|^\s*[=+\-@]/.test(s) ? `'${s}` : s;
  return /[,\t]/.test(t) ? `"${t.replace(/"/g, '""')}"` : csvFeld(t);
};
