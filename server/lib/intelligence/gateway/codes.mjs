/* ==========================================================================
   INTELLIGENCE-GATEWAY — FEHLERCODES (WP-I13/I15, Attrappe-Stand)

   Zusätzlich zu KI_CODES (../fehler.mjs). Die Meldungen sind feste Texte;
   nie ein Wert aus Personendaten, nie eine Anbieterantwort, nie ein Schlüssel.
   ========================================================================== */

import { KiFehler } from "../fehler.mjs";

export const GATEWAY_CODES = Object.freeze([
  "KI_AUS", "KI_PAUSIERT", "KI_LIMIT", "KI_KONTINGENT", "KI_GROESSE", "KI_ZEIT", "KI_ANBIETER", "KI_NICHT_FREIGEGEBEN",
  "KI_PRUEFER", "KI_AUDIT",
]);

/** Ein Fehler des Gateways. `code` ist immer ein bekannter Code. */
export class GatewayFehler extends KiFehler {
  /** @param {string} code @param {string} meldung */
  constructor(code, meldung) {
    super("KI_INTERN", meldung);
    this.name = "GatewayFehler";
    if (GATEWAY_CODES.includes(code)) this.code = code;
  }
}

/** Feste Texte für die Rückfall-Antwort (Schema: rueckfall.text ≤ 300 Zeichen). */
export const RUECKFALL_TEXTE = Object.freeze({
  KI_ANBIETER: "Der Intelligence-Dienst ist gerade nicht erreichbar. Die Planung funktioniert unverändert.",
  KI_ZEIT: "Der Intelligence-Dienst hat nicht rechtzeitig geantwortet. Die Planung funktioniert unverändert.",
  KI_PRUEFER: "Die Antwort hat die Prüfung nicht bestanden und wird nicht angezeigt. Die Planung funktioniert unverändert.",
  KI_NICHT_FREIGEGEBEN: "Der Intelligence-Dienst ist für diesen Betrieb nicht freigegeben.",
});
