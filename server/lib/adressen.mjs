/* ==========================================================================
   ADRESSEN — die eine Vergleichsform einer E-Mail-Adresse

   Sobald sich jemand mit seiner Adresse anmeldet, muss „Max@Firma.de" und
   „max@firma.de" dasselbe Konto treffen. Dafür braucht es genau eine
   kanonische Form — und zwar an einer Stelle im Quelltext. Läge die
   Normalisierung an drei Stellen, würde eine davon eines Tages anders
   entscheiden, und dann gibt es zwei Konten für einen Menschen oder, noch
   schlimmer, eines, das zwei Menschen trifft.

   Was hier geschieht, ist bewusst wenig:

     Rand abschneiden — ein Leerzeichen aus der Zwischenablage ist kein
     Bestandteil der Adresse.

     Kleinschreiben — der Domänenteil ist nach RFC 1035 ohnehin
     unabhängig von der Schreibweise. Der örtliche Teil ist es formal
     nicht; praktisch behandelt ihn jeder ernstzunehmende Anbieter so,
     und die Alternative wäre, dass sich jemand mit derselben Adresse
     nicht anmelden kann, weil das Telefon den ersten Buchstaben groß
     geschrieben hat. Diese Abwägung fällt hier zugunsten der Bedienbarkeit
     aus — dieselbe Entscheidung wie im Entwurf vom August 2026.

   Was hier ausdrücklich NICHT geschieht:

     Keine Punkte im örtlichen Teil entfernen. „max.mueller@" und
     „maxmueller@" sind bei Google dieselbe Person und bei den meisten
     anderen Anbietern zwei verschiedene. Wer das vereinheitlicht, führt
     zwei Menschen auf ein Konto zusammen.

     Keine Plus-Kennzeichnung abschneiden. „max+centric@" ist eine
     gültige, eigene Adresse. Sie zu kürzen hieße, Post an eine Adresse
     zu schicken, die der Mensch nicht angegeben hat.

     Kein Erraten des Anbieters. Eine Regel, die für gmail.com gilt und
     für firma-mit-eigenem-mailserver.de nicht, ist keine Regel, sondern
     eine Vermutung über fremde Systeme.

   Diese Datei prüft nicht, ob eine Adresse existiert oder zustellbar
   ist — das kann nur der Versand. Sie stellt eine Vergleichsform her.
   ========================================================================== */

/** Die Obergrenze aus RFC 5321: 254 Zeichen für den ganzen Pfad. */
export const MAIL_MAX = 254;

/**
 * Die Vergleichsform einer Adresse. Nie zum Anzeigen verwenden — dafür
 * bleibt die Eingabe, wie sie kam.
 *
 * @param {unknown} email
 * @returns {string} die normalisierte Adresse, oder "" wenn nichts übrig bleibt
 */
export function mailNormieren(email) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Sieht das nach einer Adresse aus, mit der sich arbeiten lässt?
 *
 * Bewusst keine der langen Prüfmuster, die im Netz kursieren: Sie weisen
 * gültige Adressen ab und lassen ungültige durch. Verlangt wird, was
 * nötig ist, um überhaupt zustellen zu können — genau ein Klammeraffe,
 * davor und danach etwas, kein Leerzeichen, nicht zu lang.
 *
 * @param {unknown} email  rohe oder normalisierte Adresse
 */
export function mailBrauchbar(email) {
  const m = mailNormieren(email);
  if (!m || m.length > MAIL_MAX) return false;
  if (/\s/.test(m)) return false;
  const teile = m.split("@");
  if (teile.length !== 2) return false;
  const [oertlich, domain] = teile;
  if (!oertlich.length || !domain.length) return false;
  /* Ein Punkt in der Domäne, und nicht am Rand: „max@localhost" ist
     gültiges SMTP, aber keine Adresse, an die ein Dienst zustellt. */
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

/**
 * Die Adresse für die Anzeige gegenüber jemandem, der sie nicht kennen
 * soll: `m***@example.org`. Gebraucht, wo eine Einladung bestätigt wird —
 * die Empfängerin soll wiedererkennen, welche Adresse gemeint ist, ohne
 * dass ein aufgefundener Link die vollständige Adresse preisgibt.
 *
 * @param {unknown} email
 */
export function mailMaskieren(email) {
  const m = mailNormieren(email);
  if (!mailBrauchbar(m)) return "";
  const [oertlich, domain] = m.split("@");
  return `${oertlich.slice(0, 1)}***@${domain}`;
}
