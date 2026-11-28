/* ==========================================================================
   „FEST EINGEPLANT“ — Hinweis an eigenen angehefteten Einteilungen (WP-I7 Teil 6, Anheften; Betreiberentscheidung)

   Der Server liefert Beschäftigten statt der Karte `angeheftet` nur `festEingeplant`: die Tage (JJJJ-MM-TT) der eigenen
   Person, deren Einteilung angeheftet ist (server/lib/sicht.mjs festEingeplantEigene). Kein Wer, kein Wann, kein Grund,
   keine Aktion — nur der Hinweis. Fehlt das Feld oder ist es keine Liste: kein Hinweis.
   Die Oberfläche prüft zusätzlich die Person: nur die angemeldete Person selbst (`sitz.person`), sonst nie.
   ========================================================================== */

/** Sichtbarer Text des Hinweises (barrierefrei: Text, nicht nur Farbe oder Symbol). */
export const FEST_EINGEPLANT_TEXT = "Fest eingeplant";

/**
 * Ist der Tag d für die Person fest eingeplant? Nur für die eigene Person (person === ich) und nur an einem Tag mit Dienst.
 * @param {any} m Betrieb in der Sicht der Rolle @param {any} person angezeigte Person @param {any} ich angemeldete Person
 * @param {string} d Tag @param {boolean} mitDienst zeigt der Tag einen Dienst?
 */
export function festEingeplant(m, person, ich, d, mitDienst) {
  if (!m || !Array.isArray(m.festEingeplant) || !mitDienst) return false;
  if (!person || !ich || person.id === undefined || person.id === null || String(person.id) !== String(ich.id)) return false;
  return typeof d === "string" && m.festEingeplant.includes(d);
}
