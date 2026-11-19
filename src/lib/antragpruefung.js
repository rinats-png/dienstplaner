/* WP-21 Teil 2: Pruefung eines Abwesenheitsantrags vor dem Absenden, fuer Telefon und Rechner gleich.
   Vorher pruefte nur die Rechneransicht (meineschichten.jsx); auf dem Telefon schloss sich das Blatt bei "Ende vor Beginn"
   ohne Fehlertext und der Antrag ging ab (WCAG 3.3.1 Fehlererkennung). Die Texte sind die der Rechneransicht. */
import { abwArt } from "./fachlogik.js";
import { fKurz } from "./datum.js";

/**
 * @param {object} m Mandant (abwesenheiten)
 * @param {string} personId
 * @param {{von:string, bis:string}} f Zeitraum (ISO-Datum)
 * @returns {string} Fehlertext oder "" wenn der Antrag abgesendet werden darf
 */
export function urlaubAntragFehler(m, personId, f) {
  if (!f || !f.von || !f.bis) return "Beginn und Ende werden benötigt.";
  if (f.bis < f.von) return "Das Ende liegt vor dem Beginn.";
  const k = ((m && m.abwesenheiten) || []).find((a) => a.personId === personId && a.von <= f.bis && f.von <= a.bis);
  if (k) return `Überschneidet sich mit ${abwArt(k.art).label} vom ${fKurz(k.von)} bis ${fKurz(k.bis)}.`;
  return "";
}
