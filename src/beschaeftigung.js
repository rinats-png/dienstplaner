/* ==========================================================================
   BESCHÄFTIGUNGSMODELLE

   Bis hierher kannte die Anwendung an der Person Sollstunden und eine
   Teilzeit-Angabe. Mehrere Regeln hängen aber nicht an der Stundenzahl,
   sondern an der Art des Beschäftigungsverhältnisses: Ein Werkstudent
   unterliegt anderen Grenzen als eine Teilzeitkraft mit gleicher Stundenzahl,
   eine kurzfristig Beschäftigte zählt Arbeitstage statt Stunden.

   Dieses Modul ist die Datenstruktur dafür — keine Regelmaschine. Eine Regel
   bindet sich über ihren Geltungsbereich (`scope.beschaeftigungsmodell` im
   Regelregister) an ein Modell; gerechnet wird im Regelbaukasten.

   Das Feld an der Person heißt `beschaeftigungsmodell` und ist optional.
   Bestehende Daten bleiben gültig: Wo es fehlt, leitet `modellVon()` es aus
   der Teilzeit-Angabe ab (Vollzeit oder Teilzeit) — nichts wird nachträglich
   in die Daten geschrieben.

   Hier steht bewusst keine Lohnrechnung. Wer eine Verdienstgrenze einhalten
   muss (Minijob, Midijob), trägt die zulässige Stundenzahl selbst ein
   (`stundenGrenzeMonat`); CENTRIC kennt keinen Stundenlohn.
   ========================================================================== */

/**
 * Die Modelle. Die Kennung (`id`) ist das, was eine Regel im Geltungsbereich
 * nennt (`scope.beschaeftigungsmodell` im Regelregister). `hinweis` sagt in
 * einem Satz, was für die Planung daran hängt — keine Rechtsauskunft.
 */
export const BESCHAEFTIGUNGSMODELLE = [
  { id: "vollzeit", label: "Vollzeit", hinweis: "Sollstunden laut Vertrag oder Tarif." },
  { id: "teilzeit", label: "Teilzeit", hinweis: "Weniger als die volle Wochenarbeitszeit; Quote oder feste Wochentage." },
  { id: "minijob", label: "Minijob", hinweis: "Verdienstgrenze; als zulässige Stunden je Monat zu hinterlegen." },
  { id: "midijob", label: "Übergangsbereich (Midijob)", hinweis: "Verdienstband; als zulässige Stunden je Monat zu hinterlegen." },
  { id: "werkstudent", label: "Werkstudent", hinweis: "Wochenstundengrenze in der Vorlesungszeit mit Ausnahmen." },
  { id: "kurzfristig", label: "Kurzfristig beschäftigt", hinweis: "Zeitlich begrenzt; Arbeitstage im Kalenderjahr zählen." },
  { id: "ausbildung", label: "Ausbildung", hinweis: "Berufsschule, Ausbildungsnachweis, Anleitung." },
  { id: "ueberlassung", label: "Arbeitnehmerüberlassung", hinweis: "Einsatzdauer beim Entleiher." },
  { id: "abruf", label: "Arbeit auf Abruf", hinweis: "Vorankündigung und Mindestdauer des Einsatzes." },
  { id: "altersteilzeit", label: "Altersteilzeit", hinweis: "Arbeitsphase oder Freistellungsphase." },
  { id: "elternteilzeit", label: "Teilzeit in Elternzeit", hinweis: "Besondere Wochenstundengrenze und Kündigungsschutz." },
  { id: "pflegeteilzeit", label: "Teilzeit in Pflege- oder Familienpflegezeit", hinweis: "Befristet, auf das Gesamtkontingent angerechnet." },
  { id: "entsandt", label: "Entsandte Beschäftigte", hinweis: "Einsatz im Ausland oder aus dem Ausland; Nachweis der Entsendung." },
  { id: "beamte", label: "Beamtinnen und Beamte", hinweis: "Eigene Arbeitszeitverordnung statt Arbeitszeitgesetz." },
];

const NACH_ID = new Map(BESCHAEFTIGUNGSMODELLE.map((m) => [m.id, m]));

/** Das Modell zu einer Kennung, oder null. */
export const beschaeftigungsmodell = (id) => NACH_ID.get(id) || null;

/**
 * Das Beschäftigungsmodell einer Person.
 *
 * Eine hinterlegte, bekannte Kennung gilt. Fehlt sie, wird sie aus dem
 * Bestand abgeleitet: aktive Teilzeit-Angabe → „teilzeit", sonst „vollzeit".
 * Eine unbekannte Kennung (etwa aus einer neueren Fassung) bleibt unbeachtet
 * und führt zur Ableitung — sie bricht nichts.
 *
 * @param {object} person
 * @returns {string} Kennung aus BESCHAEFTIGUNGSMODELLE
 */
export function modellVon(person) {
  if (!person) return "vollzeit";
  if (NACH_ID.has(person.beschaeftigungsmodell)) return person.beschaeftigungsmodell;
  return person.teilzeit && person.teilzeit.aktiv ? "teilzeit" : "vollzeit";
}

/**
 * Wurde das Modell ausdrücklich hinterlegt? Regeln, die an ein bestimmtes
 * Modell gebunden sind (Werkstudent), sollten sich nur auf Hinterlegtes
 * stützen — eine Ableitung kennt nur Voll- und Teilzeit.
 */
export const modellHinterlegt = (person) => !!(person && NACH_ID.has(person.beschaeftigungsmodell));
