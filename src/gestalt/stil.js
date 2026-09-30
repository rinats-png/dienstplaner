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

/* Untere Leiste für schmale Fenster (Schichten, Anträge, Lage, Post, Krank).
   Sie hatte nie eine Regel: Auf dem Rechner stand sie als Reihe nackter Knöpfe
   unter dem Inhalt. Ab 1025 px entfällt sie (dort führt die Unterleiste),
   darunter klebt sie am unteren Rand — main.bereich lässt dafür Platz. */
.tabbar{position:fixed; left:0; right:0; bottom:0; z-index:28; display:flex; gap:2px;
  padding:6px 8px calc(6px + env(safe-area-inset-bottom)); background:var(--c-kopf-grund);
  backdrop-filter:saturate(160%) blur(12px); -webkit-backdrop-filter:saturate(160%) blur(12px);
  border-top:1px solid ${C.line};}
.tabbar button{flex:1 1 0; min-width:0; min-height:52px; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:3px; border:0; border-radius:14px; background:transparent; color:${C.dim};
  font-family:inherit; font-size:11px; font-weight:500; cursor:pointer; padding:4px 2px;}
.tabbar button.on{background:${C.accentLight}; color:${C.accent}; font-weight:620;}
@media (min-width: 1025px){ .tabbar{display:none;} }
@media print{ .tabbar{display:none !important;} }

/* ------------------------- 5. Ansichten (Ü und E) --------------------------
   Kennzahlkarten, Leitraster, Seitenkarten, Hinweisband. Abstände laufen über
   --pad-y/--pad-x, damit Kompakt sie verkleinert; die Kennzahl selbst behält
   ihre Größe. Tönungen der Ränder mischen die Statusfarbe mit dem Kartenrand,
   damit sie in Hell und Dunkel gleich ruhig bleiben. */
.punkt{display:inline-block; width:8px; height:8px; border-radius:2px; flex-shrink:0;}
.punkt.gross{width:10px; height:10px; border-radius:3px;}

.kachelreihe{display:grid; grid-template-columns:repeat(auto-fit,minmax(var(--kmin,200px),1fr));
  gap:16px; margin-bottom:16px;}
.kachel{padding:calc(var(--pad-y) + 4px) calc(var(--pad-x) + 2px) calc(var(--pad-y) + 6px);
  min-width:0; text-align:left; font-family:inherit; color:${C.text};}
button.kachel{cursor:pointer; display:block; width:100%;}
.kachel-kopf{display:flex; align-items:center; gap:8px; font-size:12.5px; color:${C.aus}; min-width:0;}
.kachel-kopf > span:not(.punkt){overflow-wrap:anywhere;}
.kachel-wert{display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 8px; margin-top:10px;}
.kachel-wert .zahl{font-size:32px; font-weight:450; letter-spacing:-.035em; line-height:1.05;}
.kachel-wert .einheit{font-size:13.5px; font-weight:500; color:${C.dim};}
.kachel-sub{font-size:12.5px; color:${C.dim}; margin-top:6px; line-height:1.45;}
.kachel-bild{margin-top:14px;}
.kachel.hervor-warn{border-color:color-mix(in srgb, var(--c-warn) 42%, var(--c-line));}
.kachel.hervor-danger{border-color:color-mix(in srgb, var(--c-danger) 42%, var(--c-line));}

.leitraster{display:grid; grid-template-columns:minmax(0,1fr) var(--seite,360px); gap:16px; align-items:start;}
.leitraster > .haupt, .leitraster > .seite{min-width:0; display:flex; flex-direction:column; gap:16px;}
@media (max-width: 1100px){ .leitraster{grid-template-columns:minmax(0,1fr);} }

.seitenkarte{padding:calc(var(--pad-y) + 6px) calc(var(--pad-x) + 2px);}
.skopf{display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;}
.stitel{font-size:15.5px; font-weight:620; letter-spacing:-.015em; margin:0; line-height:1.3;}
.ssub{font-size:12.5px; color:${C.dim}; margin-top:3px; line-height:1.45;}

.hinweisband{display:flex; align-items:flex-start; gap:12px; padding:calc(var(--pad-y) + 4px) calc(var(--pad-x) + 2px);
  border-left-width:3px; margin-bottom:16px;}
.hinweisband .sym{display:flex; margin-top:1px;}
.hinweisband .titel{font-size:15px; font-weight:620; line-height:1.45;}
.hinweisband .text{font-size:13px; color:${C.dim}; margin-top:4px; line-height:1.55;}

.balkenzeile{padding:7px 0;}
.balkenzeile .kopf{display:flex; justify-content:space-between; align-items:baseline; gap:12px;
  font-size:13.5px; margin-bottom:6px;}
.balkenzeile .name{display:inline-flex; align-items:center; gap:8px; min-width:0;}
.balkenzeile .wert{font-weight:600;}
.balkenzeile .sub{font-size:12px; color:${C.dim}; margin-top:5px;}

.legende{list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px 18px;
  font-size:12.5px; color:${C.dim};}
.legende li{display:flex; align-items:center; gap:7px;}
.legende b{font-weight:650;}

.namenschip{display:inline-flex; align-items:center; gap:8px; padding:4px 12px 4px 4px; border-radius:999px;
  background:${C.flaecheStill}; font-size:13px; max-width:100%;}
.namenschip .n{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;}

.grosszahl .zahl{font-size:32px; font-weight:450; letter-spacing:-.035em; line-height:1.05;}
.grosszahl .einheit{font-size:13.5px; color:${C.dim}; margin-left:8px;}
.grosszahl .label{font-size:12.5px; color:${C.dim}; margin-top:4px;}

.schritte{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px;}
.schritte li{display:flex; gap:12px; align-items:flex-start;}
.schritte .nr{width:24px; height:24px; border-radius:50%; flex-shrink:0; display:flex; align-items:center;
  justify-content:center; font-size:12px; font-weight:650; background:${C.text}; color:${C.flaeche};}
.schritte .nr.hell{background:${C.accentLight}; color:${C.accent};}
.schritte .t{font-size:13.5px; font-weight:620;}
.schritte .x{font-size:12.5px; color:${C.dim}; line-height:1.5; margin-top:2px;}

.abschnittskopf{display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap;
  margin:8px 0 12px;}
.abschnittskopf h2{font-size:19px; font-weight:640; letter-spacing:-.02em; margin:0;}
.abschnittskopf .sub{font-size:13px; color:${C.dim}; margin-top:3px; line-height:1.5;}
.abschnittskopf .rechts{font-size:12.5px; color:${C.dim}; display:flex; gap:10px; align-items:center; flex-wrap:wrap;}

/* Zeilen in Listen der Entscheidungsansichten */
.listenzeile{display:flex; align-items:center; gap:14px; padding:14px calc(var(--pad-x) + 2px);
  border-bottom:1px solid ${C.lineSoft}; min-width:0;}
.listenzeile:last-child{border-bottom:0;}
.listenzeile.klick{cursor:pointer; transition:background .14s;}
.listenzeile.klick:hover{background:${C.bg};}
.zeit-ziffern{font-variant-numeric:tabular-nums;}

/* Startseite: Einrichtung und Untergrenzen nebeneinander */
.startpaar{display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr)); gap:16px; margin-bottom:40px;}

/* Lagebild: Schichtkarten, Dienstliste, Achtungspunkte */
.schichtreihe{display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; margin-bottom:16px;}
.schichtkarte{padding:calc(var(--pad-y) + 6px) calc(var(--pad-x) + 2px); cursor:pointer; min-width:0;
  transition:box-shadow .16s, border-color .16s;}
.schichtkarte:hover{box-shadow:var(--schatten-hoch); border-color:${C.lineStark};}
.schichtkarte.luecke{border-color:color-mix(in srgb, var(--c-danger) 40%, var(--c-line));}
.schichtkarte .kopf{display:flex; align-items:center; gap:10px;}
.schichtkarte .name{font-size:14.5px; font-weight:620;}
.schichtkarte .zeit{font-size:12px; color:${C.dim};}
.dienstliste .zeile{display:flex; gap:18px; padding:12px 0; border-top:1px solid ${C.lineSoft}; align-items:flex-start;}
.dienstliste .zeile:first-child{border-top:0; padding-top:2px;}
.dienstliste .einheit{flex:0 0 172px; min-width:0;}
.dienstliste .einheit .n{font-size:13.5px; font-weight:620;}
.dienstliste .einheit .s{font-size:12px; color:${C.dim}; margin-top:2px;}
.dienstliste .chips{display:flex; flex-wrap:wrap; gap:6px; min-width:0; flex:1;}
.dienstliste .kurz{font-size:11px; font-weight:700; color:${C.dim};}
@media (max-width: 560px){ .dienstliste .zeile{flex-direction:column; gap:8px;} .dienstliste .einheit{flex-basis:auto;} }
.achtungszeile{display:flex; align-items:baseline; gap:10px; padding:11px 0; border-top:1px solid ${C.lineSoft};
  cursor:pointer;}
.achtungszeile:first-child{border-top:0;}
.achtungszeile .punkt{align-self:center;}
.achtungszeile .t{flex:1; min-width:0; font-size:13.5px; line-height:1.4;}
.achtungszeile .d{font-size:12px; color:${C.dim}; white-space:nowrap;}

/* ------------------- 6. Arbeitsebene (A) und Formulare (F) ------------------
   Die Raster selbst (table.raster, Planzelle, TON) bleiben, wie sie sind. Hier
   stehen nur Kopfzone, Werkzeugleisten, Chips, Statuszeilen und Formularkarten. */
.zeitwahl{display:inline-flex; align-items:center; gap:2px; padding:2px; flex-shrink:0;
  border:1px solid ${C.line}; border-radius:var(--r-pille); background:${C.flaeche};}
.zeitwahl button{height:34px; min-width:36px; padding:0 12px; border:0; border-radius:var(--r-pille);
  background:transparent; color:${C.text}; font-family:inherit; font-size:13px; font-weight:560; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; transition:background .14s;}
.zeitwahl button:hover{background:${C.flaecheStill};}
.zeitwahl .mitte{padding:0 10px; font-size:13px; font-weight:620; white-space:nowrap; color:${C.text};}

.statuszeile{display:flex; align-items:center; gap:10px 14px; flex-wrap:wrap; margin-bottom:12px;
  padding:calc(var(--pad-y) - 1px) var(--pad-x); background:${C.flaecheStill}; border:1px solid ${C.lineSoft};
  border-radius:var(--r-gross); font-size:13.5px; min-width:0;}
.statuszeile .fortschritt{width:90px; flex-shrink:0;}

.chip{display:inline-flex; align-items:center; gap:7px; min-height:32px; padding:4px 12px; border:1px solid ${C.line};
  border-radius:var(--r-pille); background:${C.flaeche}; color:${C.text}; font-family:inherit; font-size:12.5px;
  cursor:pointer; font-variant-numeric:tabular-nums; transition:border-color .14s, background .14s;}
.chip:hover{border-color:${C.steuer};}
.chip .punkt{width:7px; height:7px; border-radius:50%;}

.standortkarte{text-align:left; padding:13px 16px; border-radius:var(--r-gross); cursor:pointer; font-family:inherit;
  color:${C.text}; border:1px solid ${C.line}; background:${C.flaeche}; box-shadow:var(--schatten);
  transition:border-color .14s, box-shadow .14s;}
.standortkarte:hover{border-color:${C.lineStark};}
.standortkarte[aria-pressed="true"]{border-color:${C.accent}; background:${C.accentLight};}

.fehlerband{padding:11px 14px; border-radius:var(--r); background:${C.dangerLight}; color:${C.danger};
  font-size:13px; line-height:1.5;}
`;
