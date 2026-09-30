import { C } from "../farben.js";

/* ==========================================================================
   STIL — CSS des Leitstand-Stils, das nicht im Monolithen stehen soll

   `bauStyles()` in App.jsx setzt diesen Text hinter seinen eigenen. Die Farben
   werden wie dort beim Aufruf eingesetzt (C wird beim Umschalten des
   Erscheinungsbildes überschrieben) oder als CSS-Variable gelesen
   (`var(--c-…)`, die themaSetzen über das Attribut data-thema wechselt).

   Gliederung: 1 Verlauf, 2 Kleinbausteine, 3 Menüs.
   ========================================================================== */

export const gestaltStil = () => `
/* ---------------------------- 1. Verlauf ----------------------------------
   Eine einzige Schicht hinter der Titelzone jeder Ansicht — nicht pro Karte.
   Ohne Weichzeichner: Radialverläufe sind weich genug und auf schwachen
   Tablets billig. Bewegt sich nicht. Auf dem Verlauf stehen nur \`text\` und
   \`dim\`, nie \`aus\` (pruefungen/kontrast.test.js rechnet das nach).

   .sw-root ist die Wurzel des Stapelkontexts; dadurch liegt die Schicht
   (z-index:-1) über dem Grund von .sw-root, aber unter allem anderen — ohne
   dass .inhalt selbst einen Kontext aufmacht und die Ebenen der Blätter und
   der Tour darin einsperrt. */
.sw-root{isolation:isolate;}
.inhalt{position:relative;}
.inhalt::before{
  content:""; position:absolute; left:0; right:0; top:0; height:440px; z-index:-1;
  pointer-events:none;
  background:
    radial-gradient(ellipse 46% 60% at 46% 0%, var(--c-verlauf-a), var(--c-verlauf-b) 48%, transparent 76%),
    radial-gradient(ellipse 28% 44% at 82% 14%, var(--c-verlauf-c), transparent 74%);
}
.feldmodus .inhalt::before, .kein-verlauf .inhalt::before{display:none;}
@media print{ .inhalt::before{display:none;} }

/* ------------------------- 2. Kleinbausteine ------------------------------ */
/* Pille (Basis in App.jsx): Tönung plus Wort, kein Rand. Violett hat keine eigene Tönung. */
.pille-violet{background:${C.flaecheStill}; color:${C.violet};}

/* Toast (E6): hell dunkel auf hell, dunkel als Karte mit Rand */
:root[data-thema="dunkel"] .toast{background:var(--c-flaeche); color:var(--c-text);
  border:1px solid var(--c-line);}

/* Filterleiste: das Suchfeld ist eine Pille */
.filterleiste{display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px;}
.suchfeld{position:relative; flex:1 1 240px; max-width:380px;}
.suchfeld .lupe{position:absolute; left:15px; top:50%; transform:translateY(-50%);
  color:${C.dim}; display:flex; pointer-events:none;}
.suchfeld .inp{padding-left:40px; border-radius:var(--r-pille);}

/* Fortschritt, Checkliste, Erklärkasten, Sparkline */
.fortschritt{background:${C.flaecheStill}; border-radius:999px; overflow:hidden;}
.fortschritt > i{display:block; height:100%; border-radius:999px; background:${C.accent};}
.checkliste{list-style:none; margin:0; padding:0;}
.checkliste li{display:flex; align-items:center; gap:10px; padding:7px 0; font-size:13.5px;}
.checkliste li.erledigt .text{color:${C.dim}; text-decoration:line-through;}
.checkliste .rechts{margin-left:auto; font-size:12px; color:${C.dim};}
.erklaerkasten{display:flex; align-items:flex-start; gap:10px; padding:12px 14px;
  background:${C.flaecheStill}; border:1px solid ${C.lineSoft}; border-radius:var(--r);
  font-size:13px; line-height:1.55; color:${C.dim};}
.erklaerkasten > .icon{color:${C.dim}; margin-top:1px; display:flex;}

/* ------------------------------ 3. Menüs ---------------------------------- */
.menue{position:absolute; top:calc(100% + 8px); z-index:60; background:${C.flaeche}; border:1px solid ${C.line};
  border-radius:var(--r-gross); box-shadow:var(--schatten-blatt); padding:8px;
  max-width:min(92vw, 420px); animation:blattauf .16s cubic-bezier(.4,0,.2,1);}
.menue.rechts{right:0;} .menue.links{left:0;}
.menue-punkt{display:flex; align-items:center; gap:12px; width:100%; min-height:40px;
  border:0; background:transparent; color:${C.text}; font-family:inherit; font-size:13.5px;
  font-weight:500; text-align:left; padding:0 12px; border-radius:var(--r); cursor:pointer;}
.menue-punkt:hover, .menue-punkt:focus-visible{background:${C.flaecheStill};}
.menue-punkt .icon{color:${C.dim}; display:flex;}
.menue-trenner{height:1px; background:${C.lineSoft}; margin:6px 4px;}
`;
