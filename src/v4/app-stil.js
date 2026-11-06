/* ==========================================================================
   V4 GLASS — Oberflächenschicht der Hauptanwendung (Phase 2)

   Legt sich über den bestehenden Stil der App (bauStyles in App.jsx) und
   ändert nur Form und Zustand: Radien, Flächen, Ränder, Schatten, Fokus,
   Glas an Navigation und Dialogen, Mindestgrößen für Touch.

   Farben und Maße kommen ausschließlich aus den Tokens (var(--v4-…)). Diese
   Datei enthält keinen Farbwert. Die Gültigkeit der Klassen prüft
   pruefungen/v4-app-stil.test.js gegen den tatsächlichen App-Stil.

   Scope: html[data-v4-app]. Die Anwendung setzt das Attribut beim Thema.
   Tabellen und Eingabeformulare bleiben opak (kein Glas), siehe DESIGNSYSTEM
   Qualitätsgate 5 und 1.
   ========================================================================== */

/** Klassen, die diese Schicht überschreibt. Der Test prüft, dass jede davon im App-Stil vorkommt. */
export const V4_APP_KLASSEN = [
  "seitenleiste", "slink", "karte", "karte-still", "karte-hover", "noprint", "btn", "btn-primary", "btn-sm", "inp", "sel", "blatt", "sheet-back", "toast", "seg", "suchknopf", "inhalt",
];

export const v4AppStil = () => `
/* ---- V4 Oberflächenschicht (Phase 2) ---- */
html[data-v4-app] :focus-visible{
  outline:var(--v4-fokus-breite) solid var(--v4-focus); outline-offset:var(--v4-fokus-abstand);}

/* Inhalt: auf schmalen Breiten ohne Überlauf (Innenabstand zählt zur Breite) */
html[data-v4-app] main.bereich{box-sizing:border-box; max-width:100%; min-width:0;}
html[data-v4-app] .inhalt{min-width:0; max-width:100%;}

/* Navigation: dunkle Seitenleiste; aktiver Eintrag als Glasfläche mit Akzentkante */
html[data-v4-app] .seitenleiste{background:var(--v4-sidebar); border-right:1px solid var(--v4-glas-rand);}
html[data-v4-app] .slink{min-height:var(--v4-ziel); border-radius:var(--v4-r-mittel);}
html[data-v4-app] .slink:hover{background:var(--v4-glas);}
html[data-v4-app] .slink.on{background:var(--v4-glas);
  border:1px solid var(--v4-glas-rand);}
html[data-v4-app] .slink.on::before{background:var(--v4-akzent-auf-dunkel);}

/* Karten im Raster: Rasterspalte darf schmaler werden als der Inhalt (kein Überlauf) */
html[data-v4-app] .karte, html[data-v4-app] .karte-hover{min-width:0; max-width:100%; box-sizing:border-box;}
/* Auswahlleisten und Behälter im Inhalt: nicht breiter als die Spalte (Personal, 320 px) */
html[data-v4-app] .noprint, html[data-v4-app] .seg{min-width:0; max-width:100%; box-sizing:border-box;}

/* Karten: opake Fläche, Rand 1px, großer Radius, V4-Schatten */
html[data-v4-app] .karte{background:var(--v4-flaeche); border:1px solid var(--v4-line);
  border-radius:var(--v4-r-gross); box-shadow:var(--v4-schatten);}
html[data-v4-app] .karte-still{background:var(--v4-flaeche-still); border-color:var(--v4-line-soft);
  border-radius:var(--v4-r-gross);}

/* Knöpfe: Primär trägt aufAkzent auf accent (dunkle Schrift auf Mint im Dunkeln, helle im Hellen) */
html[data-v4-app] .btn{min-height:var(--v4-ziel); border-radius:var(--v4-r-pille); transition:background var(--v4-kurz) var(--v4-kurve), border-color var(--v4-kurz) var(--v4-kurve);}
html[data-v4-app] .btn-primary{background:var(--v4-accent); border-color:var(--v4-accent); color:var(--v4-auf-akzent);}
html[data-v4-app] .btn-primary:hover{background:var(--v4-accent-hi); border-color:var(--v4-accent-hi); color:var(--v4-auf-akzent);}
html[data-v4-app] .btn:focus-visible{outline:var(--v4-fokus-breite) solid var(--v4-focus); outline-offset:var(--v4-fokus-abstand);}
html[data-v4-app] .btn-sm{min-height:34px;}

/* Auswahlfelder in der Akzentfarbe statt Systemblau */
html[data-v4-app] input[type="checkbox"], html[data-v4-app] input[type="radio"]{accent-color:var(--v4-accent);}

/* Eingabe: Rand mindestens 3:1, Fokus als Ring (nicht nur Randfarbe) */
html[data-v4-app] .inp,
html[data-v4-app] .sel,
html[data-v4-app] textarea.inp{background:var(--v4-flaeche); border:1px solid var(--v4-steuer);
  border-radius:var(--v4-r-mittel); color:var(--v4-text);}
html[data-v4-app] .inp:focus,
html[data-v4-app] .sel:focus,
html[data-v4-app] textarea.inp:focus{outline:var(--v4-fokus-breite) solid var(--v4-focus);
  outline-offset:var(--v4-fokus-abstand); border-color:var(--v4-steuer);}

/* Dialoge und Blätter: opak für Formulare; Überlagerung über den Inhalt */
html[data-v4-app] .sheet-back{background:var(--v4-ueberlagerung);}
html[data-v4-app] .blatt{background:var(--v4-glas-grund); border:1px solid var(--v4-line);
  border-radius:var(--v4-r-gross); box-shadow:var(--v4-schatten-blatt);}

/* Hinweise und Auswahl */
html[data-v4-app] .toast{background:var(--v4-glas-grund); color:var(--v4-text); border:1px solid var(--v4-line);
  border-radius:var(--v4-r-mittel); box-shadow:var(--v4-schatten);}
html[data-v4-app] .seg button{min-height:var(--v4-ziel);}
html[data-v4-app] .suchknopf{background:var(--v4-flaeche); border-color:var(--v4-steuer);}

/* Touch: Ziele mindestens 44 px, wo ein grober Zeiger genutzt wird */
@media (pointer: coarse){
  html[data-v4-app] .btn, html[data-v4-app] .slink, html[data-v4-app] .seg button{min-height:var(--v4-ziel);}
}

/* Bewegung und Transparenz: reduziert, ohne Glas */
@media (prefers-reduced-motion: reduce){
  html[data-v4-app] .btn, html[data-v4-app] .slink{transition:none;}
}
@media (prefers-reduced-transparency: reduce){
  html[data-v4-app] .seitenleiste, html[data-v4-app] .slink.on, html[data-v4-app] .slink:hover{backdrop-filter:none;}
}
`;

