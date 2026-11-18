/* ==========================================================================
   FELDBEZEICHNUNGEN DER KERNFELDER (WP-48.5 Teil 2)

   Das Konfliktfenster der Teilspeicherung nennt ein streitiges Kernfeld mit
   seinem deutschen Namen („Stammdaten: Dienstarten"). Die Schlüssel sind
   die Kernfelder des Teilwegs (server/lib/teilweg.mjs KERNFELDER, Katalog
   BETRIEB in server/lib/sicht.mjs). Ein Schlüssel ohne Eintrag hier wird
   lesbar aus sich selbst gebildet (erster Buchstabe groß) — so bleibt auch
   ein künftiges Feld verständlich, und Felder, deren Name ohnehin ein
   deutsches Hauptwort ist, brauchen keinen Eintrag.
   ========================================================================== */

const BEZEICHNUNG = Object.freeze({
  name: "Name des Betriebs", branche: "Branche", bundesland: "Bundesland", einheitLabel: "Bezeichnung der Einheiten",
  einheiten: "Einheiten", dienstarten: "Dienstarten", zyklus: "Schichtfolge", anker: "Beginn der Schichtfolge",
  zyklusLaenge: "Länge der Schichtfolge", gruppen: "Gruppen", versatzTageVon: "Versatz der Schichtfolge",
  zuschlaege: "Zuschläge", rollennamen: "Rollennamen", einstellungen: "Einstellungen", matrix: "Rechte",
  briefing: "Übergabe", aufgaben: "Aufgaben", qualifikationen: "Qualifikationen", genehmigungsstufen: "Genehmigungsstufen",
  tarifwerk: "Tarifwerk", planstaende: "Planstände", freigaben: "Planfreigaben", unterschreitungen: "Unterschreitungen",
  belegung: "Belegung", therapie: "Therapie", aushang: "Aushang", standorte: "Standorte", einsatzorte: "Einsatzorte",
  einsatzorteGeaendertAm: "Einsatzorte (Änderungsdatum)", einsatzorteGeaendertVon: "Einsatzorte (geändert von)",
  personen: "Personal", abwesenheiten: "Abwesenheiten", anfragen: "Anträge", wuensche: "Wünsche",
  einspruenge: "Einsprünge", ausschreibungen: "Ausschreibungen", urlaubsrunde: "Urlaubsrunde", selbstplanung: "Selbstplanung",
  nachrichten: "Mitteilungen", notrufe: "Notrufe", fahrzeiten: "Fahrzeiten", checks: "Prüfpunkte", ansichten: "Ansichten",
  kompetenzen: "Kompetenzen", einarbeitung: "Einarbeitung", objekte: "Objekte", postenPlan: "Postenplan",
  bereichsPlan: "Bereichsplan", wachbuch: "Wachbuch", bereitschaftStufen: "Bereitschaftsstufen", bereitschaft: "Bereitschaft",
  funktionsbereiche: "Funktionsbereiche", funktionsPlan: "Funktionsplan", rotationen: "Rotationen",
  pflegeNiveaus: "Pflegeniveaus", vorgaben: "Vorgaben", schichtmodelle: "Schichtmodelle", betriebsmittel: "Betriebsmittel",
  sondereinsaetze: "Sondereinsätze", aenderungen: "Änderungsvermerke", bestaetigungen: "Bestätigungen",
  dienstbuch: "Dienstbuch", uebergaben: "Übergaben", notizen: "Notizen", tagesnotizen: "Tagesnotizen",
  lohnarten: "Lohnarten", aufbewahrung: "Aufbewahrungsfristen", aushaenge: "Aushänge", checklisten: "Checklisten",
  listeneintraege: "Listeneinträge",
});

/**
 * Deutscher Anzeigename eines Kernfelds (für frageText in src/app/teilkonflikt.js).
 * @param {string} feld
 * @returns {string}
 */
export function bezeichne(feld) {
  if (typeof feld !== "string" || !feld) return "Angaben";
  if (Object.prototype.hasOwnProperty.call(BEZEICHNUNG, feld)) return BEZEICHNUNG[feld];
  return feld.charAt(0).toUpperCase() + feld.slice(1);
}

/** Nur für Prüfungen: die ausdrücklich benannten Felder. */
export const BENANNTE_FELDER = Object.freeze(Object.keys(BEZEICHNUNG));
