/* ==========================================================================
   POST — eine Nachricht hinaus

   Herausgezogen aus zustellung.mjs, unverändert im Verhalten. Der Anlass:
   Einladungen, Adressbestätigung und das Zurücksetzen von Passwörtern
   brauchen denselben Weg. Ein zweiter Versandpfad wäre der Anfang von zwei
   Wahrheiten über denselben Vorgang — die Rechtematrix hat diese Lektion
   schon einmal gekostet.

   Der Anbieter steht an genau einer Stelle. Wird er getauscht, ändert sich
   diese Datei und sonst keine: Jeder Aufrufer sieht nur `sendeMail(an,
   betreff, text)` und bekommt dieselbe Antwortform zurück.

   Ohne hinterlegten Schlüssel arbeitet der Versand im Trockenlauf: Er
   meldet Erfolg und kennzeichnet ihn als trocken. So lässt sich jede Kette
   prüfen, bevor ein Vertrag mit einem Versanddienst nötig wird — und genau
   so läuft die Anwendung heute.
   ========================================================================== */

/**
 * Schickt eine Nachricht. Wirft nicht: Ein Fehler des Anbieters ist eine
 * Antwort, keine Ausnahme — sonst reißt ein Ausfall beim Versand einen
 * ganzen Vorgang mit, der ohne die Nachricht weiterlaufen könnte.
 *
 * WP-30: Eine Fehlerantwort trägt eine Klasse — `dauerhaft` (der Anbieter
 * weist die Nachricht oder Adresse ab: 400/422, nie wiederholen),
 * `konfiguration` (401/403: Schlüssel oder Absenderdomain stimmen nicht — ein
 * Betreiberproblem, später erneut) oder `temporaer` (408/409/429, 5xx, Netz).
 * `idempotenz` geht als Idempotency-Key an den Anbieter: Ein Versuch, dessen
 * Ausgang unbekannt blieb (Absturz nach dem Senden), wird mit demselben
 * Schlüssel wiederholt und beim Anbieter nicht doppelt zugestellt.
 *
 * @param {string} an
 * @param {string} betreff
 * @param {string} text
 * @param {{idempotenz?: string}} [opt]
 * @returns {Promise<{ok: boolean, trocken?: boolean, id?: string, fehler?: string,
 *                    klasse?: string, status?: number, an?: string, betreff?: string}>}
 */
export async function sendeMail(an, betreff, text, opt = {}) {
  const schluessel = process.env.RESEND_API_KEY;
  const absender = process.env.CENTRIC_ABSENDER || "CENTRIC <kein-absender@example.invalid>";
  if (!schluessel) {
    // Trockenlauf: nichts geht hinaus, aber der Ablauf ist prüfbar
    return { ok: true, trocken: true, an, betreff };
  }
  try {
    const a = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${schluessel}`, "content-type": "application/json",
        ...(opt.idempotenz ? { "idempotency-key": String(opt.idempotenz).slice(0, 256) } : {}) },
      body: JSON.stringify({ from: absender, to: [an], subject: betreff, text }),
    });
    if (!a.ok) {
      const fehler = await a.text();
      return { ok: false, fehler: fehler.slice(0, 200), status: a.status, klasse: mailKlasse(a.status) };
    }
    const d = await a.json();
    return { ok: true, id: d.id };
  } catch (e) {
    /* Netz weg, Zeitüberschreitung, kaputte Antwort: derselbe Fall wie ein
       abgewiesener Versand — später erneut. */
    return { ok: false, fehler: String((e && e.message) || e).slice(0, 200), klasse: "temporaer" };
  }
}

/** Antwortklasse des Mailanbieters nach HTTP-Status. */
export function mailKlasse(status) {
  if (status === 400 || status === 422) return "dauerhaft";
  if (status === 401 || status === 403) return "konfiguration";
  return "temporaer";
}

/**
 * Die Adresse, unter der die Anwendung erreichbar ist — für Verweise in
 * Nachrichten. Dieselbe Vorgabe wie in src/kontakt.js; über CENTRIC_BASIS
 * ist ein Umzug eine Umgebungsvariable und kein Commit.
 *
 * Sie zeigt nie auf die Website: Wer beides verwechselt, schickt
 * Beschäftigte aus einer Benachrichtigung heraus auf eine Verkaufsseite
 * statt in ihren Dienstplan.
 */
export const anwendungsAdresse = () =>
  (process.env.CENTRIC_BASIS || "https://app.centric-dienstplanung.de")
    .replace(/\/+$/, "");

/**
 * Darf ein Geheimnis zum Prüfen in einer Antwort mitgehen?
 *
 * Für Prüfungen ohne Postfach: Läuft der Versand trocken, kann eine
 * Prüfung den Einladungslink aus der Antwort lesen, statt ein Postfach zu
 * brauchen. Das ist ein absichtliches Leck und deshalb dreifach
 * verschlossen:
 *
 *   1. nur ohne Versandschlüssel (Trockenlauf)
 *   2. nur mit ausdrücklich gesetztem CENTRIC_PRUEFLINK=ja
 *   3. nie in einer Auslieferung — NODE_ENV=production schließt es aus,
 *      auch wenn die beiden anderen Bedingungen zutreffen
 *
 * Die dritte Bedingung ist die wichtige: Eine vergessene Variable in der
 * Produktionsumgebung soll kein Geheimnis in eine Antwort schreiben.
 */
export const pruefLinkErlaubt = () =>
  process.env.NODE_ENV !== "production"
  && !process.env.RESEND_API_KEY
  && process.env.CENTRIC_PRUEFLINK === "ja";
