import {
  V4_FARBEN, V4_GLAS, V4_VERLAUF, V4_SCHATTEN, V4_UEBERLAGERUNG, V4_RADIEN, V4_ABSTAND,
  V4_SCHRIFT, V4_FOKUS, V4_BEWEGUNG, V4_BREAKPOINTS,
} from "./tokens.js";

/* ==========================================================================
   V4 GLASS — CSS aus den Tokens

   Zwei Teile: die Variablen (--v4-…) je Erscheinungsbild und die Klassen der
   Basiskomponenten (.v4-karte, .v4-knopf, .v4-feld, .v4-dialog, .v4-hinweis).

   Auswahl des Erscheinungsbildes:
     html[data-v4-thema="dunkel"|"hell"]  — ausdrückliche Wahl (thema.js)
     ohne Attribut                        — prefers-color-scheme, sonst hell
   ========================================================================== */

const kebab = (s) => s.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`);

const farbVariablen = (thema) => {
  const f = V4_FARBEN[thema];
  const v = V4_VERLAUF[thema];
  const g = V4_GLAS[thema];
  const s = V4_SCHATTEN[thema];
  const zeilen = Object.entries(f).map(([k, w]) => `--v4-${kebab(k)}:${w};`);
  zeilen.push(`--v4-glas:${g.flaeche};--v4-glas-rand:${g.rand};--v4-glas-grund:${g.grund};`);
  zeilen.push(`--v4-verlauf-a:${v.a};--v4-verlauf-b:${v.b};--v4-verlauf-c:${v.c};`);
  zeilen.push(`--v4-schatten:${s.karte};--v4-schatten-blatt:${s.blatt};`);
  zeilen.push(`--v4-ueberlagerung:${V4_UEBERLAGERUNG[thema]};`);
  return zeilen.join("");
};

const festeVariablen = () => {
  const z = [`--v4-glas-blur:${V4_GLAS.weichzeichner};`];
  for (const [k, w] of Object.entries(V4_RADIEN)) z.push(`--v4-r-${k}:${w};`);
  for (const [k, w] of Object.entries(V4_ABSTAND)) z.push(`--v4-abstand-${k}:${w};`);
  z.push(`--v4-schrift:${V4_SCHRIFT.familie};`);
  for (const k of ["klein", "text", "gross", "titel", "anzeige"])
    z.push(`--v4-schrift-${k}:${V4_SCHRIFT[k][0]};--v4-zeile-${k}:${V4_SCHRIFT[k][1]};`);
  z.push(`--v4-fokus-breite:${V4_FOKUS.breite};--v4-fokus-abstand:${V4_FOKUS.abstand};--v4-ziel:${V4_FOKUS.ziel};`);
  z.push(`--v4-kurz:${V4_BEWEGUNG.kurz};--v4-mittel:${V4_BEWEGUNG.mittel};--v4-kurve:${V4_BEWEGUNG.kurve};`);
  for (const [k, w] of Object.entries(V4_BREAKPOINTS)) z.push(`--v4-bp-${k}:${w}px;`);
  return z.join("");
};

export const v4Variablen = () => `
:root{${festeVariablen()}${farbVariablen("hell")}color-scheme:light;}
@media (prefers-color-scheme: dark){
  :root:not([data-v4-thema="hell"]){${farbVariablen("dunkel")}color-scheme:dark;}
}
:root[data-v4-thema="dunkel"]{${farbVariablen("dunkel")}color-scheme:dark;}
:root[data-v4-thema="hell"]{${farbVariablen("hell")}color-scheme:light;}
`;

export const v4Komponenten = () => `
/* Fokus: überall sichtbar, nie nur Farbe — Ring mit Abstand */
html[data-v4-aktiv] :focus-visible,
.v4-karte :focus-visible, .v4-dialog :focus-visible{
  outline:var(--v4-fokus-breite) solid var(--v4-focus); outline-offset:var(--v4-fokus-abstand);}

/* Karte. Glas nur als ausdrückliche Variante, sonst opake Fläche. */
.v4-karte{background:var(--v4-flaeche); color:var(--v4-text); border:1px solid var(--v4-line);
  border-radius:var(--v4-r-gross); box-shadow:var(--v4-schatten); padding:var(--v4-abstand-5);
  font-family:var(--v4-schrift);}
.v4-karte.v4-glas{background:var(--v4-glas); border-color:var(--v4-glas-rand);
  -webkit-backdrop-filter:blur(var(--v4-glas-blur)) saturate(140%);
  backdrop-filter:blur(var(--v4-glas-blur)) saturate(140%);}

/* Knopf: Primär trägt aufAkzent auf accent (nie Weiß auf hellem Türkis) */
.v4-knopf{display:inline-flex; align-items:center; justify-content:center; gap:var(--v4-abstand-2);
  min-height:var(--v4-ziel); padding:0 var(--v4-abstand-5); border-radius:var(--v4-r-pille);
  border:1px solid transparent; font-family:var(--v4-schrift); font-size:var(--v4-schrift-text);
  font-weight:${V4_SCHRIFT.gewicht.mittel}; cursor:pointer;
  transition:background var(--v4-kurz) var(--v4-kurve), border-color var(--v4-kurz) var(--v4-kurve);}
.v4-knopf-primaer{background:var(--v4-accent); color:var(--v4-auf-akzent);}
.v4-knopf-primaer:hover:not(:disabled){background:var(--v4-accent-hi);}
.v4-knopf-sekundaer{background:transparent; color:var(--v4-text); border-color:var(--v4-steuer);}
.v4-knopf-sekundaer:hover:not(:disabled){background:var(--v4-flaeche-still);}
.v4-knopf-leise{background:transparent; color:var(--v4-accent);}
.v4-knopf-leise:hover:not(:disabled){background:var(--v4-accent-light);}
.v4-knopf:disabled{cursor:not-allowed; background:var(--v4-flaeche-still); color:var(--v4-aus);
  border-color:var(--v4-line);}
.v4-knopf[aria-busy="true"]{cursor:progress;}

/* Eingabefeld: Rand >= 3:1, Fehler mit Text und Symbol, nie nur Farbe */
.v4-feld{display:block; font-family:var(--v4-schrift);}
.v4-feld-label{display:block; font-size:var(--v4-schrift-klein); font-weight:${V4_SCHRIFT.gewicht.mittel};
  color:var(--v4-dim); margin-bottom:var(--v4-abstand-2);}
.v4-feld-eingabe{width:100%; box-sizing:border-box; min-height:var(--v4-ziel); padding:0 var(--v4-abstand-4);
  background:var(--v4-flaeche); color:var(--v4-text); border:1px solid var(--v4-steuer);
  border-radius:var(--v4-r-mittel); font-family:inherit; font-size:var(--v4-schrift-text);}
.v4-feld-eingabe[aria-invalid="true"]{border-color:var(--v4-danger); border-width:2px;}
.v4-feld-eingabe:disabled{background:var(--v4-flaeche-still); color:var(--v4-aus);}
.v4-feld-hinweis{margin-top:var(--v4-abstand-2); font-size:var(--v4-schrift-klein); color:var(--v4-dim);}
.v4-feld-fehler{margin-top:var(--v4-abstand-2); font-size:var(--v4-schrift-klein); color:var(--v4-danger);
  display:flex; gap:var(--v4-abstand-2); align-items:flex-start;}

/* Dialog-Rahmen */
.v4-dialog-rueck{position:fixed; inset:0; z-index:100; display:flex; align-items:center;
  justify-content:center; padding:var(--v4-abstand-4); background:var(--v4-ueberlagerung);}
.v4-dialog{width:min(520px, 100%); max-height:calc(100dvh - 32px); overflow:auto; box-sizing:border-box;
  background:var(--v4-glas-grund); color:var(--v4-text); border:1px solid var(--v4-line);
  border-radius:var(--v4-r-gross); box-shadow:var(--v4-schatten-blatt); padding:var(--v4-abstand-5);
  font-family:var(--v4-schrift);}
.v4-dialog-titel{margin:0 0 var(--v4-abstand-3); font-size:var(--v4-schrift-gross); font-weight:${V4_SCHRIFT.gewicht.fett};}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))){
  .v4-dialog.v4-glas{background:var(--v4-glas); border-color:var(--v4-glas-rand);
    -webkit-backdrop-filter:blur(var(--v4-glas-blur)); backdrop-filter:blur(var(--v4-glas-blur));}
}

/* Statushinweis: Symbol + Text + Tönung; Farbe ist nie das einzige Merkmal */
.v4-hinweis{display:flex; gap:var(--v4-abstand-3); align-items:flex-start; padding:var(--v4-abstand-3) var(--v4-abstand-4);
  border-radius:var(--v4-r-mittel); border:1px solid var(--v4-line); font-family:var(--v4-schrift);
  font-size:var(--v4-schrift-text); line-height:var(--v4-zeile-text); color:var(--v4-text);}
.v4-hinweis > .v4-hinweis-symbol{flex-shrink:0; margin-top:2px;}
.v4-hinweis-info{background:var(--v4-info-light);} .v4-hinweis-info .v4-hinweis-symbol{color:var(--v4-info);}
.v4-hinweis-ok{background:var(--v4-ok-light);} .v4-hinweis-ok .v4-hinweis-symbol{color:var(--v4-ok);}
.v4-hinweis-warn{background:var(--v4-warn-light);} .v4-hinweis-warn .v4-hinweis-symbol{color:var(--v4-warn);}
.v4-hinweis-danger{background:var(--v4-danger-light);} .v4-hinweis-danger .v4-hinweis-symbol{color:var(--v4-danger);}

/* Ohne Weichzeichner oder bei reduzierter Transparenz: vollständig opak */
@media (prefers-reduced-transparency: reduce){
  .v4-karte.v4-glas, .v4-dialog.v4-glas{background:var(--v4-glas-grund);
    -webkit-backdrop-filter:none; backdrop-filter:none;}
}
@media (prefers-reduced-motion: reduce){
  .v4-knopf{transition:none;}
}
`;

export const v4Stil = () => v4Variablen() + v4Komponenten();
