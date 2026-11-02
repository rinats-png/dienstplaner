/* ==========================================================================
   WEITERE ABWESENHEITSARTEN

   Rechtlich eigenständige Abwesenheiten neben Urlaub, Krank und Freistellung
   (Rechtsrecherche Oktober 2026). `ABW` in src/App.jsx hängt sie an.

   `selbst: false` — Beschäftigte stellen dafür keinen Antrag in der App; die
   Leitung trägt sie ein. Der Server zeigt anderen Personen nur „abwesend"
   (abwesenheitSaeubern in server/lib/rechte.mjs), nie die Art.
   `bezahlt` entscheidet nur, ob geplante Stunden dem Ist gutgeschrieben
   werden. Es hat drei Zustände (siehe entgeltStatus): true, false und
   „ungeklaert". Die neuen Arten sind nicht rechtlich geprüft und stehen auf
   „ungeklaert" — das ist weder bezahlt noch unbezahlt: Es wird nichts
   gutgeschrieben, und die Prüfansicht sagt, dass das Stundenkonto dort
   unvollständig ist.
   `norm` nennt die Anknüpfung, keine Rechtsauskunft.

   Erweiterbar ohne Bruch: Eine Art aus einer neueren Fassung, die diese
   Fassung nicht kennt, fällt in der Anzeige auf „Sonstiges" zurück (abwArt).
   Untersuchungs- und Stillzeiten (MuSchG) sind noch nicht abgebildet.
   ========================================================================== */

/**
 * Der Entgeltstatus einer Abwesenheitsart.
 *   "bezahlt"    geplante Stunden werden gutgeschrieben
 *   "unbezahlt"  nicht
 *   "ungeklaert" nicht geprüft oder nicht angegeben — nie wie „unbezahlt" behandeln
 * Alles außer true und false ist ungeklärt; auch eine unbekannte Art aus einer
 * neueren Fassung (kein Wahrheitswert-Trick wie bei einer nichtleeren Zeichenkette).
 */
export function entgeltStatus(art) {
  if (!art) return "ungeklaert";
  if (art.bezahlt === true) return "bezahlt";
  if (art.bezahlt === false) return "unbezahlt";
  return "ungeklaert";
}

/** Zusatz zur Bezeichnung in Auswahllisten; leer, wenn der Status geklärt ist. */
export const entgeltZusatz = (art) => (entgeltStatus(art) === "ungeklaert" ? " · Entgelt ungeklärt" : "");

/** Hinweis für den Planer, wenn die Art ausgewählt ist; sonst null. */
export const entgeltHinweis = (art) => (entgeltStatus(art) === "ungeklaert"
  ? "Entgelt ungeklärt: Das Stundenkonto schreibt für diese Tage nichts gut, bis die Art geklärt ist."
  : null);

export const ABW_WEITERE = [
  { id: "elternzeit", label: "Elternzeit", kurz: "E", farbe: "#7A5C99", urlaub: false, bezahlt: "ungeklaert", rang: 3, selbst: false, norm: "§§ 15 ff. BEEG" },
  { id: "pflegezeit", label: "Pflegezeit", kurz: "P", farbe: "#5C7A99", urlaub: false, bezahlt: "ungeklaert", rang: 3, selbst: false, norm: "§ 3 PflegeZG" },
  { id: "familienpflegezeit", label: "Familienpflegezeit", kurz: "Q", farbe: "#4F7F8A", urlaub: false, bezahlt: "ungeklaert", rang: 3, selbst: false, norm: "§ 2 FPflZG" },
  { id: "arbeitsverhinderung", label: "Kurzzeitige Arbeitsverhinderung", kurz: "V", farbe: "#9A5C5C", urlaub: false, bezahlt: "ungeklaert", rang: 4, selbst: false, norm: "§ 2 PflegeZG" },
  { id: "mutterschutz", label: "Mutterschutz, Beschäftigungsverbot", kurz: "M", farbe: "#B3547A", urlaub: false, bezahlt: "ungeklaert", rang: 5, selbst: false, norm: "§§ 3, 16 MuSchG" },
  { id: "ehrenamt", label: "Einsatz Feuerwehr oder THW", kurz: "H", farbe: "#6B7F3A", urlaub: false, bezahlt: "ungeklaert", rang: 2, selbst: false, norm: "Landesbrandschutzgesetze, § 3 THWG" },
  { id: "personalvertretung", label: "Betriebs- oder Personalratsarbeit", kurz: "R", farbe: "#8A6B3A", urlaub: false, bezahlt: "ungeklaert", rang: 2, selbst: false, norm: "§ 37 BetrVG" },
  { id: "berufsschule", label: "Berufsschule", kurz: "B", farbe: "#3A6B8A", urlaub: false, bezahlt: "ungeklaert", rang: 4, selbst: false, norm: "§ 15 BBiG, § 9 JArbSchG" },
  { id: "atzfreistellung", label: "Altersteilzeit, Freistellungsphase", kurz: "T", farbe: "#6B6B8A", urlaub: false, bezahlt: "ungeklaert", rang: 3, selbst: false, norm: "§ 2 AltTZG" },
];
