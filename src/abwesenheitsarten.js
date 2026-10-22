/* ==========================================================================
   WEITERE ABWESENHEITSARTEN

   Rechtlich eigenständige Abwesenheiten neben Urlaub, Krank und Freistellung
   (Rechtsrecherche Oktober 2026). `ABW` in src/App.jsx hängt sie an.

   `selbst: false` — Beschäftigte stellen dafür keinen Antrag in der App; die
   Leitung trägt sie ein. Der Server zeigt anderen Personen nur „abwesend"
   (abwesenheitSaeubern in server/lib/rechte.mjs), nie die Art.
   `bezahlt` entscheidet nur, ob geplante Stunden dem Ist gutgeschrieben
   werden; die Zuordnung ist vorläufig und nicht rechtlich geprüft.
   `norm` nennt die Anknüpfung, keine Rechtsauskunft.

   Erweiterbar ohne Bruch: Eine Art aus einer neueren Fassung, die diese
   Fassung nicht kennt, fällt in der Anzeige auf „Sonstiges" zurück (abwArt).
   Untersuchungs- und Stillzeiten (MuSchG) sind noch nicht abgebildet.
   ========================================================================== */

export const ABW_WEITERE = [
  { id: "elternzeit", label: "Elternzeit", kurz: "E", farbe: "#7A5C99", urlaub: false, bezahlt: false, rang: 3, selbst: false, norm: "§§ 15 ff. BEEG" },
  { id: "pflegezeit", label: "Pflegezeit", kurz: "P", farbe: "#5C7A99", urlaub: false, bezahlt: false, rang: 3, selbst: false, norm: "§ 3 PflegeZG" },
  { id: "familienpflegezeit", label: "Familienpflegezeit", kurz: "Q", farbe: "#4F7F8A", urlaub: false, bezahlt: false, rang: 3, selbst: false, norm: "§ 2 FPflZG" },
  { id: "arbeitsverhinderung", label: "Kurzzeitige Arbeitsverhinderung", kurz: "V", farbe: "#9A5C5C", urlaub: false, bezahlt: false, rang: 4, selbst: false, norm: "§ 2 PflegeZG" },
  { id: "mutterschutz", label: "Mutterschutz, Beschäftigungsverbot", kurz: "M", farbe: "#B3547A", urlaub: false, bezahlt: false, rang: 5, selbst: false, norm: "§§ 3, 16 MuSchG" },
  { id: "ehrenamt", label: "Einsatz Feuerwehr oder THW", kurz: "H", farbe: "#6B7F3A", urlaub: false, bezahlt: true, rang: 2, selbst: false, norm: "Landesbrandschutzgesetze, § 3 THWG" },
  { id: "personalvertretung", label: "Betriebs- oder Personalratsarbeit", kurz: "R", farbe: "#8A6B3A", urlaub: false, bezahlt: true, rang: 2, selbst: false, norm: "§ 37 BetrVG" },
  { id: "berufsschule", label: "Berufsschule", kurz: "B", farbe: "#3A6B8A", urlaub: false, bezahlt: true, rang: 4, selbst: false, norm: "§ 15 BBiG, § 9 JArbSchG" },
  { id: "atzfreistellung", label: "Altersteilzeit, Freistellungsphase", kurz: "T", farbe: "#6B6B8A", urlaub: false, bezahlt: true, rang: 3, selbst: false, norm: "§ 2 AltTZG" },
];
