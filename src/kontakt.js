/* ==========================================================================
   KONTAKT UND HILFE

   Die Anwendung hatte kein Ziel für die Frage „an wen wende ich mich?".
   Ein Handbuch gab es, eine Tour auch — aber keine Adresse. Wer im
   Nachtdienst vor einem Problem steht, das die Software nicht löst, stand
   vor gar nichts.

   Eine Datei, ein Wert. Wer die Adresse ändert, ändert sie überall: im
   Hilfebereich, im Hinweis zum Testablauf, in den Fehlermeldungen.

   Der Wert kommt bevorzugt aus der Umgebung (VITE_KONTAKT_MAIL), damit ein
   eigener Betrieb ihn setzen kann, ohne den Quelltext anzufassen. Die
   Voreinstellung ist der Platzhalter aus den Rechtstexten — sie steht als
   solcher erkennbar da und nicht als erfundene, echt aussehende Adresse.
   ========================================================================== */

const ausUmgebung = (schluessel) => {
  try { return (import.meta.env || {})[schluessel] || null; } catch { return null; }
};

/** Adresse für Rückfragen. Siehe rechtliches/PLATZHALTER.md. */
export const HILFE_MAIL = ausUmgebung("VITE_KONTAKT_MAIL") || "kontakt@example.org";

/** Telefon, falls hinterlegt. Ohne Wert erscheint die Zeile gar nicht. */
export const HILFE_TELEFON = ausUmgebung("VITE_KONTAKT_TELEFON") || null;

/** Erreichbarkeit als Klartext. */
export const HILFE_ZEITEN = ausUmgebung("VITE_KONTAKT_ZEITEN")
  || "Werktags 8 bis 18 Uhr. Außerhalb dieser Zeiten per E-Mail.";

/** Ist die Adresse noch der Platzhalter? Dann muss die Oberfläche das sagen. */
export const KONTAKT_UNGESETZT = HILFE_MAIL === "kontakt@example.org";

/**
 * Baut einen mailto-Verweis mit vorbereitetem Betreff und Rumpf.
 * Angehängt wird, was für eine Antwort gebraucht wird — Betrieb, Rolle,
 * Ansicht, Fassung. Ohne diese Angaben besteht die erste Rückfrage immer
 * aus denselben vier Fragen.
 *
 * @param {{betreff?: string, betrieb?: string, rolle?: string,
 *   ansicht?: string, zusatz?: string}} [o]
 */
export function hilfeVerweis(o = {}) {
  const { betreff, betrieb, rolle, ansicht, zusatz } = o;
  const zeilen = [];
  if (zusatz) zeilen.push(zusatz, "");
  zeilen.push("— Angaben zur Rückfrage —");
  if (betrieb) zeilen.push(`Betrieb: ${betrieb}`);
  if (rolle) zeilen.push(`Rolle: ${rolle}`);
  if (ansicht) zeilen.push(`Ansicht: ${ansicht}`);
  try { zeilen.push(`Fassung: ${document.documentElement.dataset.fassung || "unbekannt"}`); } catch { /* egal */ }
  return `mailto:${HILFE_MAIL}`
    + `?subject=${encodeURIComponent(betreff || "CENTRIC — Frage")}`
    + `&body=${encodeURIComponent(zeilen.join("\n"))}`;
}
