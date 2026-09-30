import { C } from "../farben.js";

/* ==========================================================================
   STIL — CSS des Leitstand-Stils, das nicht im Monolithen stehen soll

   `bauStyles()` in App.jsx setzt diesen Text hinter seinen eigenen. Die Farben
   werden wie dort beim Aufruf eingesetzt (C wird beim Umschalten des
   Erscheinungsbildes überschrieben) oder als CSS-Variable gelesen
   (`var(--c-…)`, die themaSetzen über das Attribut data-thema wechselt).

   Gliederung: 1 Verlauf, 2 Kleinbausteine, 3 Menüs, 4 Rahmen.
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

/* ----------------------------- 4. Rahmen ---------------------------------
   Kopfzeile 64 px, Unterleiste 48 px, beide in einem klebenden Block. Ab
   1025 px ist die Seitenleiste ausgeblendet (display:none, nicht entfernt —
   ihr Aufbau bleibt die Schublade für kleinere Fenster). */
@media (min-width: 1025px){ .seitenleiste{display:none;} }
.kopfblock{position:sticky; top:0; z-index:30; background:var(--c-kopf-grund);
  backdrop-filter:saturate(160%) blur(12px); -webkit-backdrop-filter:saturate(160%) blur(12px);
  border-bottom:1px solid ${C.line};}
.fokus .bereiche, .fokus .unterleiste{display:none;}

.kopf-marke{display:flex; align-items:center; gap:9px; flex:0 1 auto; min-width:0;}
.kopf-marke .wort{font-size:16px; font-weight:700; letter-spacing:.14em; color:${C.text};}
.kopf-marke .trenner{width:1px; height:22px; background:${C.line}; flex-shrink:0; margin:0 3px;}
.kopf-marke .betrieb{font-size:12.5px; color:${C.dim}; max-width:190px; flex:0 1 auto; min-width:0; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap;}

.bereiche{display:flex; align-items:center; gap:2px; padding:4px; border-radius:var(--r-pille);
  background:${C.flaeche}; border:1px solid ${C.lineSoft}; min-width:0; flex-shrink:0;
  overflow-x:auto; scrollbar-width:none;}
.bereiche::-webkit-scrollbar{display:none;}
.bpille{display:flex; align-items:center; gap:7px; height:40px; padding:0 12px; border:0;
  border-radius:var(--r-pille); background:transparent; color:${C.dim}; font-family:inherit;
  font-size:12.5px; font-weight:500; white-space:nowrap; cursor:pointer; flex-shrink:0;
  transition:background .14s, color .14s;}
.bpille:hover{background:${C.flaecheStill}; color:${C.text};}
.bpille.on{background:${C.accentLight}; color:${C.accent}; font-weight:620;}
.bzahl,.uzahl{min-width:18px; height:18px; padding:0 5px; border-radius:999px; font-size:11px; font-weight:600;
  display:inline-flex; align-items:center; justify-content:center; font-variant-numeric:tabular-nums;}
.bzahl{background:${C.warnLight}; color:${C.warn};}
.uzahl{background:${C.accentLight}; color:${C.accent};}
.bzahl.warn,.uzahl.warn{background:${C.dangerLight}; color:${C.danger};}

.ikn{position:relative; width:40px; height:40px; flex-shrink:0; border:0; border-radius:var(--r-pille);
  background:transparent; color:${C.dim}; display:flex; align-items:center; justify-content:center;
  cursor:pointer; padding:0; transition:background .14s, color .14s;}
.ikn:hover{background:${C.flaecheStill}; color:${C.text};}
.ikn-klein{width:32px; height:32px;}
.ikn-zahl{position:absolute; top:3px; right:2px; min-width:16px; height:16px; padding:0 4px;
  border-radius:999px; background:${C.accent}; color:${C.aufAkzent}; font-size:10px; font-weight:600;
  display:flex; align-items:center; justify-content:center; font-variant-numeric:tabular-nums;}
.ansichtknopf{display:flex; align-items:center; gap:6px; height:40px; padding:0 12px 0 16px; flex-shrink:0;
  border:1px solid ${C.line}; border-radius:var(--r-pille); background:${C.flaeche}; color:${C.text};
  font-family:inherit; font-size:13px; font-weight:500; cursor:pointer;}
.ansichtknopf:hover{border-color:${C.steuer};}
.ansichtknopf .icon, .ansichtknopf svg{color:${C.aus};}
.avatarknopf{width:36px; height:36px; flex-shrink:0; border:0; border-radius:50%; background:${C.accentDeep};
  color:${C.accentLight}; font-family:inherit; font-size:12px; font-weight:600; letter-spacing:.02em;
  display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;}
.avatarknopf.gross{width:42px; height:42px; font-size:13px; cursor:default;}
.avatarknopf[aria-expanded="true"]{box-shadow:0 0 0 2px ${C.flaeche}, 0 0 0 4px ${C.accent};}

.unterleiste{position:relative; height:var(--unter-hoehe);}
.unterleiste nav{display:flex; align-items:stretch; gap:26px; height:100%; padding:0 56px 0 var(--luft);
  overflow-x:auto; scrollbar-width:none;
  -webkit-mask-image:linear-gradient(90deg, black calc(100% - 48px), transparent);
  mask-image:linear-gradient(90deg, black calc(100% - 48px), transparent);}
.unterleiste nav::-webkit-scrollbar{display:none;}
.utab{display:flex; align-items:center; gap:7px; flex-shrink:0; border:0; border-bottom:2px solid transparent;
  background:transparent; padding:2px 0 0; font-family:inherit; font-size:13px; font-weight:400;
  color:${C.dim}; white-space:nowrap; cursor:pointer; transition:color .14s;}
.utab:hover{color:${C.text};}
.utab:focus-visible{outline-offset:-3px;}
.utab.on{font-weight:620; color:${C.text}; border-bottom-color:${C.accent};}

/* Was in die Kopfzeile passt, entscheidet die Breite — nichts wird abgeschnitten,
   nichts fällt weg: Der Betriebsname steht dann im Konto-Menü, die Bereiche
   behalten immer ihre Beschriftung.
     ≥ 1500  Marke, Wortmarke, Betriebsname (kürzt sich), alles
     ≥ 1400  ohne Betriebsname
     ≥ 1200  ohne Wortmarke, Suche nur als Icon
     ≥ 1025  zusätzlich Bereiche ohne Icon, engerer Abstand
     ≤ 1024  Schublade statt Bereiche und Unterleiste */
.kopf-marke .wort{flex-shrink:0;}
@media (max-width: 1499px){ .kopf-marke .trenner, .kopf-marke .betrieb{display:none;} }
@media (min-width: 1025px) and (max-width: 1399px){
  .kopf-marke .wort{display:none;}
  .suchknopf{min-width:0; width:40px; padding:0; justify-content:center;}
  .suchknopf span, .suchknopf kbd{display:none;}
}
@media (min-width: 1025px) and (max-width: 1199px){
  .kopfleiste{gap:8px;}
  .bpille{padding:0 9px; gap:6px;}
  .bpille svg{display:none !important;}
}
@media (max-width: 900px){ .kopf-marke .wort{display:none;} }
@media (max-width: 560px){
  .suchknopf{width:auto; justify-content:flex-start; padding:0 14px;}
  .suchknopf span{display:inline;}
}
@media print{ .kopfblock{display:none !important;} }
`;
