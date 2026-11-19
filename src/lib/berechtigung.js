/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { rechteDerRolle } from "./rollen.js";

/* RB-3 (Betreiberentscheidung 2026-11-11): Rechte, die ein Zugang der Altrolle „kunde" nicht hat — auch im
   Probierraum nicht und auch dann nicht, wenn im Rollenwähler eine Person mit Leitungsrolle gewählt ist. Wie
   KUNDE_OHNE in server/lib/rechte.mjs. Demo-Funktionen laufen über ausdrücklich zugewiesene Rollen. */
export const KUNDE_OHNE = Object.freeze(["plan.publish"]);
const kundenZugang = (sitz) => !!sitz && sitz.zugangRolle === "kunde";

/* ------------------------------ Berechtigung ------------------------------ */
export function darf(sitz, recht, einheitId) {
  if (!sitz || sitz.rolle === "betreiber") return false;
  /* RB-1: feste Rechte (plan.publish) nur aus MATRIX_STD, nie aus der betriebseigenen Tabelle. */
  const rechte = rechteDerRolle(sitz.mandant.matrix, sitz.person.rolle);
  if (!rechte.includes(recht)) return false;
  if (kundenZugang(sitz) && KUNDE_OHNE.includes(recht)) return false;
  if (sitz.person.rolle === "betriebsrat" && /\.(edit|approve|assign|publish)/.test(recht)) return false;
  if (!einheitId) return true;
  if (sitz.person.bereich === "ALLE") return true;
  return sitz.person.bereich === einheitId;
}

/**
 * Die Rolle, nach der die Oberfläche die Schritte der Krankmeldung anbietet (krankSchrittErlaubt). In der
 * Regel die Rolle der Person; ein Zugang der Altrolle „kunde" zählt als „kunde" (RB-3): melden ja, endgültig
 * bestätigen und ablehnen nein — wie der Server, der die Rolle des Zugangs prüft.
 */
export function krankRolle(sitz) {
  if (!sitz || !sitz.person) return null;
  return kundenZugang(sitz) ? "kunde" : sitz.person.rolle;
}
