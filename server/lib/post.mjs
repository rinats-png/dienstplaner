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

import { istProduktion } from "./umgebung.mjs";
import { smtpKonfig, smtpGewaehlt, sendeSmtp } from "./post-smtp.mjs";

/** Frist für eine Anfrage an den Mailanbieter (Nachtrag 2, F2). Gilt für
    jeden Anbieter-Weg dieser Datei; ein späterer Adapter übernimmt sie. */
export const MAIL_FRIST_MS = 15_000;

/**
 * Schickt eine Nachricht. Wirft nicht: Ein Fehler des Anbieters ist eine
 * Antwort, keine Ausnahme — sonst reißt ein Ausfall beim Versand einen
 * ganzen Vorgang mit, der ohne die Nachricht weiterlaufen könnte.
 *
 * WP-30: Eine Fehlerantwort trägt eine Klasse — `dauerhaft` (der Anbieter
 * weist die Nachricht ab: 400/422, nie wiederholen; nur mit `ursache:
 * "empfaenger"` liegt es an der Adresse, siehe mailFehler),
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
 *                    klasse?: string, ursache?: string, status?: number, an?: string, betreff?: string}>}
 */
export async function sendeMail(an, betreff, text, opt = {}) {
  /* Zweiter Weg (SMTP/IONOS, docs/MAIL-SMTP-IONOS.md): nur bei ausdrücklichem
     CENTRIC_MAIL_WEG=smtp. Ohne diesen Schalter bleibt alles wie bisher. Ein
     Konfigurationsfehler (z. B. zugleich RESEND_API_KEY) ist eine Antwort der
     Klasse `konfiguration` — kein stilles Umschalten, keine Empfängersperre. */
  const smtp = smtpKonfig();
  if (smtp.zustand === "fehler") return { ok: false, fehler: smtp.fehler, klasse: "konfiguration" };
  if (smtp.zustand === "smtp") return sendeSmtp(an, betreff, text, opt, { konfig: smtp, frist: MAIL_FRIST_MS });
  const schluessel = process.env.RESEND_API_KEY;
  const absender = process.env.CENTRIC_ABSENDER || "CENTRIC <kein-absender@example.invalid>";
  if (!schluessel) {
    // Trockenlauf: nichts geht hinaus, aber der Ablauf ist prüfbar
    return { ok: true, trocken: true, an, betreff };
  }
  try {
    const a = await fetch("https://api.resend.com/emails", {
      method: "POST",
      /* Nachtrag 2 (F2): Ein hängender Anbieter bricht nach MAIL_FRIST_MS ab
         (Anfrage und Lesen der Antwort) — vorübergehend, später erneut. */
      signal: AbortSignal.timeout(MAIL_FRIST_MS),
      headers: { authorization: `Bearer ${schluessel}`, "content-type": "application/json",
        ...(opt.idempotenz ? { "idempotency-key": String(opt.idempotenz).slice(0, 256) } : {}) },
      body: JSON.stringify({ from: absender, to: [an], subject: betreff, text }),
    });
    if (!a.ok) {
      const fehler = await a.text();
      let rumpf = null;
      try { rumpf = JSON.parse(fehler); } catch { /* kein JSON: nur der Status zählt */ }
      const { klasse, ursache } = mailFehler(a.status, rumpf);
      return { ok: false, fehler: fehler.slice(0, 200), status: a.status, klasse, ...(ursache ? { ursache } : {}) };
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

/* Nachtrag Opus-Review (B2): Bei Resend ist 422 ein Validierungsfehler der
   ANFRAGE (invalid_from_address, invalid_parameter, missing_required_field,
   validation_error …), kein Bounce — Bounces kommen asynchron. Ein falscher
   Absender (CENTRIC_ABSENDER) oder ein kaputter Betreff träfe sonst jeden
   Empfänger mit einer Adresssperre. Deshalb:
   - Absender/Domain/Schlüssel → `konfiguration` (Betreiberalarm, später
     erneut, nie eine Empfängersperre);
   - nur ein ausdrücklich ungültiger Empfänger (`to`) → `ursache: "empfaenger"`
     — allein das darf die Adresse sperren (versand.mjs);
   - alles andere bei 400/422 → `dauerhaft` ohne Ursache (die Nachricht ist
     falsch, nicht die Adresse). */
const KONFIG_NAMEN = ["invalid_from_address", "invalid_api_key", "restricted_api_key", "missing_api_key", "invalid_access"];
const ABSENDER_TEXT = /`from`|\bfrom\b field|domain is not verified|not verified|sender/i;
/* Nachtrag 2 (F8): nur ein Fehler des To-Felds — nicht jedes „recipient“
   (z. B. „too many recipients“ oder der Hinweis der Testdomain, „other
   recipients“: das ist kein Fehler der Adresse). */
const EMPFAENGER_TEXT = /`to`|\bto\b field/i;

/**
 * Klasse und Ursache einer Fehlerantwort des Mailanbieters.
 * @param {number} status
 * @param {any} rumpf  geparster JSON-Rumpf ({name, message}) oder null
 * @returns {{klasse: string, ursache?: string}}
 */
export function mailFehler(status, rumpf) {
  const name = rumpf && typeof rumpf.name === "string" ? rumpf.name : "";
  const text = rumpf && typeof rumpf.message === "string" ? rumpf.message.slice(0, 500) : "";
  const klasse = mailKlasse(status);
  if (klasse === "temporaer") return { klasse };
  if (KONFIG_NAMEN.includes(name) || ABSENDER_TEXT.test(text)) return { klasse: "konfiguration", ursache: "absender" };
  if (klasse === "konfiguration") return { klasse };
  if (name === "invalid_to_address" || EMPFAENGER_TEXT.test(text)) return { klasse: "dauerhaft", ursache: "empfaenger" };
  return { klasse: "dauerhaft" };
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
  !istProduktion()
  && !process.env.RESEND_API_KEY
  && !smtpGewaehlt() /* ein gewählter echter Versandweg schließt den Prüflink aus, auch fehlerhaft */
  && process.env.CENTRIC_PRUEFLINK === "ja";
