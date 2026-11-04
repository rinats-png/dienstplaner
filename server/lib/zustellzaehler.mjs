/* ==========================================================================
   ZUSTELLZÄHLER — wie viele Zustellungen gelangen, wie viele scheitern (WP-30)

   Für die Zustandsanzeige (gesund.mjs). Gleitendes Fenster im Speicher, wie
   gesund-zaehler.mjs: Nach einem Neustart beginnt die Zählung neu; eine
   dauerhaft kaputte Einrichtung fällt innerhalb des Fensters wieder auf.

   Gezählt wird nur ein Ergebnis je Kanal — keine Kennung, kein Empfänger,
   keine Adresse, kein Text. Das Betreiberprotokoll und /gesund enthalten
   damit nie Inhalte oder Personendaten.

   Arten:
     zugestellt   der Anbieter hat angenommen (nicht: Trockenlauf)
     zurueck      vorübergehender Fehler, später erneut
     endgueltig   dauerhaft fehlgeschlagen oder Versuche ausgeschöpft
     konfiguration  der Anbieter lehnt Schlüssel/Absender ab (Betreiberproblem)
   ========================================================================== */

export const KANAELE = ["mail", "push"];
export const ZAEHL_ARTEN = ["zugestellt", "zurueck", "endgueltig", "konfiguration"];
export const ZAEHL_FENSTER_MS = 60 * 60 * 1000;
const HOECHSTENS = 5000;

/** @type {Map<string, number[]>} */
const zeiten = new Map(KANAELE.flatMap((k) => ZAEHL_ARTEN.map((a) => [`${k}:${a}`, []])));

/** Ein Ergebnis vermerken; Unbekanntes wird ignoriert. */
export function zustellEreignis(kanal, art, jetzt = Date.now()) {
  const liste = zeiten.get(`${kanal}:${art}`);
  if (!liste) return;
  liste.push(jetzt);
  if (liste.length > HOECHSTENS) liste.splice(0, liste.length - HOECHSTENS);
}

/** Zählung der letzten `fensterMs`, je Kanal und Art. */
export function zustellZaehlung(jetzt = Date.now(), fensterMs = ZAEHL_FENSTER_MS) {
  /** @type {Record<string, Record<string, number>>} */
  const aus = { mail: {}, push: {} };
  for (const [schluessel, liste] of zeiten) {
    while (liste.length && liste[0] <= jetzt - fensterMs) liste.shift();
    const [kanal, art] = schluessel.split(":");
    aus[kanal][art] = liste.length;
  }
  return aus;
}

/** Nur für Prüfungen. */
export function zustellZaehlungLeeren() { for (const l of zeiten.values()) l.length = 0; }
