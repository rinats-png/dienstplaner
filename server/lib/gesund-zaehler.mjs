/* ==========================================================================
   FEHLERZÄHLUNG FÜR /gesund (WP-05)

   Ein Modul ohne Abhängigkeiten, damit jede Stelle es einbinden kann, ohne
   einen Importkreis zu erzeugen (bestand.mjs, schutz.mjs, server.mjs).
   Gezählt wird nur das Ereignis und seine Zeit — keine Raumnamen, keine
   Adressen, kein Fehlertext.

   Arten:
     5xx             eine Antwort mit Status ≥ 500 (server.mjs)
     unlesbar        ein Raum, ein Kern, eine Scherbe oder ein Journal ließ
                     sich nicht lesen (bestand.mjs)
     journal         ein abgebrochener Schreibvorgang wurde aus dem Journal
                     zu Ende geschrieben (bestand.mjs)
     bremse-ausfall  die Bremse zählte wegen eines Ablagefehlers nur noch im
                     Prozessspeicher (schutz.mjs, fail-closed)

   Gleitend: gezählt wird, was in den letzten FENSTER_MS geschah.
   ========================================================================== */

export const ARTEN = ["5xx", "unlesbar", "journal", "bremse-ausfall"];
export const FENSTER_MS = 15 * 60 * 1000;
const HOECHSTENS = 10000;   // je Art — mehr braucht keine Zählung

/** @type {Map<string, number[]>} */
const zeiten = new Map(ARTEN.map((a) => [a, []]));

/** Ein Ereignis vermerken. Unbekannte Arten werden ignoriert. */
export function ereignis(art, jetzt = Date.now()) {
  const liste = zeiten.get(art);
  if (!liste) return;
  liste.push(jetzt);
  if (liste.length > HOECHSTENS) liste.splice(0, liste.length - HOECHSTENS);
}

/** Wie oft je Art in den letzten `fensterMs`? */
export function zaehlung(jetzt = Date.now(), fensterMs = FENSTER_MS) {
  /** @type {Record<string, number>} */
  const aus = {};
  for (const [art, liste] of zeiten) {
    while (liste.length && liste[0] <= jetzt - fensterMs) liste.shift();
    aus[art] = liste.length;
  }
  return aus;
}

/** Nur für Prüfungen. */
export function zaehlungLeeren() { for (const l of zeiten.values()) l.length = 0; }
