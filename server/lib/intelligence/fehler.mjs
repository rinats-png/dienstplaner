/* ==========================================================================
   INTELLIGENCE — FEHLER MIT CODE (WP-I11)

   Fehlercodes nach ARCHITEKTUR-ABGLEICH 2.2 (KI_…), ergänzt um die Codes des
   Faktenpakets. Die Meldung nennt nie einen Wert aus Personendaten — sie
   geht ins Protokoll und an die Oberfläche.
   ========================================================================== */

export const KI_CODES = Object.freeze([
  "KI_NICHT_ANGEMELDET", "KI_ROLLE", "KI_FUNKTION", "KI_EINGABE", "KI_NICHT_GEFUNDEN",
  "KI_LECK", "KI_ALIAS_SCHLUESSEL", "KI_ALIAS_UNBEKANNT", "KI_PRUEFER", "KI_INTERN",
]);

export class KiFehler extends Error {
  /** @param {string} code @param {string} meldung */
  constructor(code, meldung) {
    super(meldung);
    this.name = "KiFehler";
    this.code = KI_CODES.includes(code) ? code : "KI_INTERN";
  }
}
