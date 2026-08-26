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
 * Wo die Anwendung selbst wohnt.
 *
 * Geht in alles ein, was die Anwendung an Menschen hinausgibt und was
 * später wieder hierher führen soll: die Zeile „Öffnen: …" unter jeder
 * Benachrichtigung, die Zugangsliste zum Ausdrucken. Sie stand an vier
 * Stellen als Zeichenkette — und damit an vier Stellen falsch, sobald die
 * Adresse sich ändert.
 *
 * Website und Anwendung sind zwei getrennte Auslieferungen unter zwei
 * Adressen. Die Website ist die vordere Tür und verweist hierher; diese
 * Konstante ist der Rückweg. Wer sie mit der Adresse der Website
 * verwechselt, schickt Beschäftigte aus einer Benachrichtigung heraus auf
 * eine Verkaufsseite statt in ihren Dienstplan.
 *
 * VITE_ANWENDUNG_URL übersteuert; der Serverteil liest dieselbe Angabe
 * aus CENTRIC_BASIS (netlify/lib/post.mjs). Beide gehören in die
 * Umgebungsvariablen der Auslieferung, nicht in den Quelltext.
 */
export const ANWENDUNG_URL = (ausUmgebung("VITE_ANWENDUNG_URL")
  || "https://centric-app.netlify.app").replace(/\/+$/, "");

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
