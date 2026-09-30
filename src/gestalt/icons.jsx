import React from "react";

/* ==========================================================================
   ICONS — ein eigener kleiner Satz als Inline-SVG

   Keine Bibliothek, keine Schriftart, keine Textzeichen. Die Textzeichen,
   die vorher als Symbole dienten (Lupe, Briefumschlag, Dreistrich …), sehen
   je Betriebssystem anders aus und werden teils als Emoji gezeichnet.

   Raster 24, Strich 1,7, runde Enden, keine Füllung außer Punkten. Die Farbe
   kommt aus `currentColor`. Ein Icon trägt nie die einzige Information:
   Zierde ist aria-hidden, ein Knopf, der nur ein Icon zeigt, braucht ein
   aria-label (das setzt der Aufrufer).
   ========================================================================== */

const P = (d) => <path d={d} />;
const punkt = (cx, cy, r = 1.6) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const PFADE = {
  raster: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" /></>,
  kalender: <><rect x="3" y="5" width="18" height="16" rx="2.4" />{P("M8 3v4M16 3v4M3 10.5h18")}</>,
  pruefliste: <>{P("M9 4.5h6v2.6H9z")}{P("M7.5 5.8H5.2v15.1h13.6V5.8H16.5")}{P("m9.2 13.4 2.1 2.1 4.2-4.3")}</>,
  personen: <><circle cx="9.2" cy="8.4" r="3.3" />{P("M3.2 19.8c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2")}
    {P("M16.2 6.4a3.2 3.2 0 0 1 0 7.5")}{P("M17.8 15.6c2 .7 3.2 2.1 3.2 4.2")}</>,
  saeulen: <>{P("M3 20.5h18")}{P("M6 20V11M11 20V4.5M16 20v-6.5M20.5 20v-10")}</>,
  zahnrad: <><circle cx="12" cy="12" r="3.2" />
    {P("M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.6 5.4 17 7M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4")}</>,
  suche: <><circle cx="11" cy="11" r="6.6" />{P("m16 16 4.6 4.6")}</>,
  plus: P("M12 5.2v13.6M5.2 12h13.6"),
  haken: P("m4.6 12.4 4.8 4.8L19.4 6.6"),
  "kreis-haken": <><circle cx="12" cy="12" r="8.6" />{P("m8.4 12.2 2.4 2.4 4.8-5")}</>,
  "kreis-leer": <circle cx="12" cy="12" r="8.6" />,
  "pfeil-rechts": P("M5 12h13M13 7l5 5-5 5"),
  "chevron-links": P("m14.5 6-6 6 6 6"),
  "chevron-rechts": P("m9.5 6 6 6-6 6"),
  "chevron-unten": P("m6 9.5 6 6 6-6"),
  "chevron-oben": P("m6 14.5 6-6 6 6"),
  mehr: <>{punkt(5.5, 12)}{punkt(12, 12)}{punkt(18.5, 12)}</>,
  warnung: <>{P("M12 4.2 2.8 19.8h18.4z")}{P("M12 10.2v4M12 17.2v.4")}</>,
  info: <><circle cx="12" cy="12" r="8.6" />{P("M12 11v5.2M12 7.8v.4")}</>,
  schloss: <><rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />{P("M8 10.5V8a4 4 0 0 1 8 0v2.5")}</>,
  laden: P("M12 3.6a8.4 8.4 0 1 0 8.4 8.4"),
  export: <>{P("M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15")}</>,
  stift: <>{P("M5 20.2h14")}{P("M14.2 4.4 18 8.2 8.6 17.6H4.8v-3.8z")}</>,
  tausch: <>{P("M4 8h15M15.5 4.5 19 8l-3.5 3.5")}{P("M20 16H5M8.5 12.5 5 16l3.5 3.5")}</>,
  glocke: <>{P("M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z")}{P("M10 21h4")}</>,
  sonne: <><circle cx="12" cy="12" r="4" />
    {P("M12 2.4v2.2M12 19.4v2.2M21.6 12h-2.2M4.6 12H2.4M18.8 5.2 17.2 6.8M6.8 17.2l-1.6 1.6M18.8 18.8l-1.6-1.6M6.8 6.8 5.2 5.2")}</>,
  mond: P("M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"),
  heute: <><rect x="3" y="5" width="18" height="16" rx="2.4" />{P("M8 3v4M16 3v4M3 10.5h18")}{punkt(12, 15.5, 1.5)}</>,
  brief: <><rect x="3" y="5.5" width="18" height="13" rx="2.4" />{P("m3.8 7.5 8.2 6 8.2-6")}</>,
  abmelden: <>{P("M9.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3.5")}{P("m14 8 4 4-4 4")}{P("M18 12H9.5")}</>,
  menue: P("M4 7h16M4 12h16M4 17h16"),
  filter: P("M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z"),
  uhr: <><circle cx="12" cy="12" r="8.6" />{P("M12 7.2V12l3.2 2")}</>,
  person: <><circle cx="12" cy="8.2" r="3.7" />{P("M4.8 20c0-3.6 3.2-5.8 7.2-5.8s7.2 2.2 7.2 5.8")}</>,
  griff: <>{punkt(9, 6, 1.4)}{punkt(15, 6, 1.4)}{punkt(9, 12, 1.4)}{punkt(15, 12, 1.4)}{punkt(9, 18, 1.4)}{punkt(15, 18, 1.4)}</>,
  notruf: <>{P("M6.5 18.5v-5.2a5.5 5.5 0 0 1 11 0v5.2")}{P("M4 18.5h16")}{P("M12 3.2v1.8")}{P("M4.6 6.6l1.3 1.3")}{P("M19.4 6.6l-1.3 1.3")}{P("M10 21h4")}</>,
  fahrzeug: <>{P("M4 17v-4.6l2-5.2h12l2 5.2V17z")}{P("M4 12.4h16")}{P("M7 17v2M17 17v2")}{punkt(7.6, 14.8, 1)}{punkt(16.4, 14.8, 1)}</>,
  schluessel: <><circle cx="8" cy="15" r="3.8" />{P("M10.7 12.3 19.5 3.5")}{P("M16 7l2.5 2.5")}{P("M13.5 9.5l1.8 1.8")}</>,
  buch: <>{P("M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13.5H6.5A1.5 1.5 0 0 0 5 19z")}{P("M5 19a1.5 1.5 0 0 0 1.5 1.5H19")}{P("M9 8.5h6.5")}</>,
  rettungsring: <><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="3.6" />{P("M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5")}</>,
  schild: <>{P("M12 3.4 19.5 6v5.6c0 4.4-3.1 7.6-7.5 9-4.4-1.4-7.5-4.6-7.5-9V6z")}{P("m9 12 2.2 2.2 4-4.2")}</>,
  nadel: <>{P("M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15.4 12 21 12 21z")}<circle cx="12" cy="10" r="2.3" /></>,
  stern: P("M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"),
  x: P("M6 6l12 12M18 6 6 18"),
  rueckgaengig: <>{P("M8.5 5 4 9.5 8.5 14")}{P("M4.5 9.5H15a5 5 0 0 1 0 10h-3")}</>,
  /* Ergänzt für Betreiber und Telefon-Tabs: gleiche Machart wie der Rest */
  euro: <>{P("M17.5 6.6A6.4 6.4 0 0 0 7 9.2v5.6a6.4 6.4 0 0 0 10.5 2.6")}{P("M4.5 10.6h9M4.5 13.4h9")}</>,
  rechner: <><rect x="5" y="3" width="14" height="18" rx="2.4" /><path d="M8.5 7.5h7" />{punkt(9, 12, 1)}{punkt(12, 12, 1)}{punkt(15, 12, 1)}{punkt(9, 16, 1)}{punkt(12, 16, 1)}{punkt(15, 16, 1)}</>,
  tarif: <>{P("M12 3.4 20.6 12 12 20.6 3.4 12z")}{punkt(12, 12, 1.4)}</>,
  krank: <>{P("M12 5v14M5 12h14")}</>,
  offline: <>{P("M3.5 9.2a12 12 0 0 1 17 0M6.5 12.6a7.6 7.6 0 0 1 11 0M9.6 16a3.2 3.2 0 0 1 4.8 0")}{punkt(12, 19, 1.1)}{P("M4 4l16 16")}</>,
};

/* Alternative Schreibweisen aus dem Master-Prompt (chevron-l/-r/-u/-o). */
const ALIAS = { "chevron-l": "chevron-links", "chevron-r": "chevron-rechts", "chevron-u": "chevron-unten",
  "chevron-o": "chevron-oben", kreuz: "x", zurueck: "rueckgaengig" };

export const ICON_NAMEN = Object.keys(PFADE);

/**
 * @param {string} n Name aus dem Satz (ICON_NAMEN)
 * @param {number} [size] Kantenlänge in Pixeln
 */
export function Icon({ n, size = 18, strokeWidth = 1.7, style, className }) {
  const inhalt = PFADE[ALIAS[n] || n];
  if (!inhalt) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      focusable="false" className={className} style={{ display: "block", flexShrink: 0, ...style }}>
      {inhalt}
    </svg>);
}
export default Icon;
