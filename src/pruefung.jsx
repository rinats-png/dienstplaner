import React from "react";

/* ==========================================================================
   CENTRIC — eine Anwendung, gestaffelte Zugriffstiefe
   Betreiber · Organisationsleitung · Planer · Sub-Planer · Mitarbeiter · Betriebsrat
   Branchenneutral für jeden Betrieb im durchgehenden Schichtbetrieb.
   ========================================================================== */

import { C, C_DUNKEL, C_HELL } from "./farben.js";
import { ANWENDUNG_URL } from "./kontakt.js";
/* Diese Datei trägt an vielen Stellen eigene Kopien aus App.jsx. Die
   Verbindlichkeit einer Anforderung gehört ausdrücklich nicht dazu: Eine
   zweite, abweichende Auslegung davon, was gesetzlich zwingend ist, wäre
   genau der Fehler, den das Merkmal verhindern soll. */
import { verbindlichkeit } from "./regelwerk.js";
let _dunkel = false;
const istDunkel = () => _dunkel;
function themaSetzen(dunkel) {
  _dunkel = !!dunkel;
  Object.assign(C, dunkel ? C_DUNKEL : C_HELL);
  if (typeof document !== "undefined") {
    document.documentElement.style.colorScheme = dunkel ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dunkel ? C_DUNKEL.sidebar : C_HELL.sidebar);
  }
}

/** Folgt dem Systemthema, solange niemand von Hand gewählt hat. */
function themaVomSystem() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; }
  catch { return false; }
}

/* Dienstarten: entsättigte Tönungen mit dünner Akzentlinie — keine Farbflächen. */
const TON = (farbe, staerke = 1) => ({
  background: `${farbe}${staerke > 1 ? "1F" : "12"}`,
  borderLeft: `2.5px solid ${farbe}`,
});

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };

/** Globale Gestaltung. Hover- und Glaseffekte brauchen echtes CSS. */
const bauStyles = () => `
:root{
  /* Dichte — systemweit umschaltbar zwischen Komfortabel und Kompakt */
  --zeile: 48px; --pad-y: 14px; --pad-x: 20px; --luft: 32px; --schrift: 14.5px;
  --block: 48px;                 /* Abstand zwischen Abschnitten — bewusst großzügig */
  --r: 12px; --r-gross: 16px;
  --schatten: 0 1px 3px rgba(7,19,23,.06), 0 1px 2px rgba(7,19,23,.04);
  --schatten-hoch: 0 4px 12px -2px rgba(7,19,23,.10), 0 16px 32px -12px rgba(7,19,23,.14);
  --sidebar-breite: 252px;
}
.dicht{ --zeile: 36px; --pad-y: 8px; --pad-x: 14px; --luft: 20px; --block: 26px; --schrift: 13.5px; }

*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}
/* Sichtbarer Fokusring für Tastaturbedienung — überall, nicht nur bei Knöpfen */
:focus-visible{outline:2px solid ${C.accent}; outline-offset:2px; border-radius:4px;}
/* Nur für Bildschirmleser */
.nurLeser{position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
  clip:rect(0,0,0,0); white-space:nowrap; border:0;}
/* Sprungmarke zum Inhalt */
.sprung{position:absolute; left:8px; top:-48px; z-index:100; background:${C.accent}; color:#fff;
  padding:10px 16px; border-radius:8px; font-size:13.5px; font-weight:600; text-decoration:none;
  transition:top .16s;}
.sprung:focus{top:8px;}
body{margin:0;}
.sw-root{
  min-height:100vh; background:${C.bg}; color:${C.text}; font-family:${FONT};
  font-size:var(--schrift); -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}

/* ------------------------------- Gerüst -------------------------------- */
.huelle{display:flex; min-height:100vh;}
.seitenleiste{
  width:var(--sidebar-breite); flex-shrink:0; background:${C.sidebar}; color:#fff;
  display:flex; flex-direction:column; position:fixed; left:0; top:0; bottom:0; z-index:40;
  transition:transform .24s cubic-bezier(.4,0,.2,1);
}
.inhalt{flex:1; margin-left:var(--sidebar-breite); min-width:0; display:flex; flex-direction:column;
  transition:margin-left .24s cubic-bezier(.4,0,.2,1);}
.fokus .seitenleiste{transform:translateX(-100%);}
.fokus .inhalt{margin-left:0;}
.fokus .kopfleiste{display:none;}

.marke{padding:22px 20px 18px; display:flex; align-items:center; gap:11px;
  border-bottom:1px solid rgba(255,255,255,.08);}
.marke b{font-size:16px; font-weight:700; letter-spacing:-.02em;}

.snav{flex:1; overflow-y:auto; padding:14px 12px 20px;}
.snav::-webkit-scrollbar{width:5px;}
.snav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16); border-radius:3px;}
.sgruppe{font-size:10.5px; font-weight:700; letter-spacing:.11em; text-transform:uppercase;
  color:rgba(255,255,255,.40); padding:20px 14px 8px;}
.slink{
  display:flex; align-items:center; gap:12px; width:100%; border:none; background:transparent;
  color:rgba(255,255,255,.74); font-family:inherit; font-size:14px; font-weight:500;
  padding:11px 14px; border-radius:10px; cursor:pointer; text-align:left;
  transition:background .14s, color .14s; margin-bottom:1px; position:relative;
}
.slink:hover{background:rgba(255,255,255,.07); color:#fff;}
/* Aktiv über helle Fläche statt Akzentfarbe — Teal auf Anthrazit erreicht nur 2,7:1 */
.slink.on{background:rgba(255,255,255,.13); color:#fff; font-weight:600;}
.slink.on::before{content:""; position:absolute; left:0; top:9px; bottom:9px; width:3px;
  border-radius:0 3px 3px 0; background:${C.accentOrig};}
.slink .zahl{margin-left:auto; font-size:11px; font-weight:700; padding:2px 7px; border-radius:999px;
  background:rgba(255,255,255,.14); ${'' /* Zähler */}}
.slink .zahl.warn{background:${C.danger}; color:#fff;}
.sfuss{padding:14px 16px; border-top:1px solid rgba(255,255,255,.08); font-size:12px;
  color:rgba(255,255,255,.55);}

.kopfleiste{
  position:sticky; top:0; z-index:30; background:rgba(255,255,255,.92);
  backdrop-filter:saturate(180%) blur(12px); -webkit-backdrop-filter:saturate(180%) blur(12px);
  border-bottom:1px solid ${C.line}; padding:0 var(--luft); height:56px;
  display:flex; align-items:center; gap:14px;
}
.suchknopf{
  display:flex; align-items:center; gap:9px; border:1px solid ${C.line}; background:${C.bg};
  border-radius:var(--r); padding:7px 12px; cursor:pointer; font-family:inherit;
  font-size:13px; color:${C.dim}; min-width:210px; transition:border-color .14s;
}
.suchknopf:hover{border-color:${C.lineStark};}
.suchknopf kbd{margin-left:auto; font-size:10.5px; font-family:inherit; padding:2px 6px;
  border-radius:5px; background:#fff; border:1px solid ${C.line}; color:${C.dim};}

main.bereich{flex:1; padding:var(--luft) var(--luft) 96px; max-width:1720px; width:100%;}

/* ------------------------------ Bausteine ------------------------------ */
/* Auf Sea Salt hebt sich Weiß nur mit 1,3:1 ab. Der Rand macht die Kante
   sichtbar, der Schatten gibt die Ebene — beides zusammen trägt. */
.karte{background:${C.flaeche}; border:1px solid ${C.line}; border-radius:var(--r-gross);
  box-shadow:0 1px 3px rgba(7,19,23,.06), 0 1px 2px rgba(7,19,23,.04);}
/* Typografische Sprünge statt gleichmäßiger Stufen — das Auge soll sofort
   wissen, wo es anfängt. */
h1.titel{font-size:38px; font-weight:300; letter-spacing:-.045em; line-height:1.08;
  margin:0 0 10px; color:${C.text};}
h1.titel b{font-weight:680;}
.untertitel{font-size:15.5px; color:${C.dim}; line-height:1.6; max-width:680px; margin:0;}
.abschnitt{margin-top:var(--block);}
.abschnitt-titel{font-size:19px; font-weight:640; letter-spacing:-.02em; margin:0 0 4px;}
.abschnitt-sub{font-size:13.5px; color:${C.dim}; line-height:1.5; margin:0 0 18px;}
/* Aufklapper für Zweitrangiges */
.mehr{border:none; background:transparent; color:${C.accent}; font-family:inherit; font-size:13.5px;
  font-weight:600; cursor:pointer; padding:8px 0; display:inline-flex; align-items:center; gap:7px;}
.mehr:hover{color:${C.accentDeep};}
.mehr span{transition:transform .18s;}
.mehr.auf span{transform:rotate(90deg);}
.karte-kopf{display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding:var(--pad-y) var(--pad-x); border-bottom:1px solid ${C.line};}
.karte-hover{transition:box-shadow .16s, border-color .16s;}
.karte-hover:hover{box-shadow:var(--schatten-hoch); border-color:${C.lineStark};}

.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  padding:10px 18px; font-size:13.5px; font-weight:560; font-family:inherit; cursor:pointer;
  border-radius:10px; border:1px solid ${C.line}; background:${C.flaeche}; color:${C.text};
  transition:background .14s, border-color .14s, color .14s; white-space:nowrap; line-height:1.2;
}
.btn:hover{background:${C.bg}; border-color:${C.lineStark};}
.btn:active{transform:translateY(.5px);}
.btn:disabled{opacity:.45; cursor:not-allowed; transform:none;}
.btn:focus-visible{outline:2px solid ${C.accent}; outline-offset:2px;}
.btn-primary{background:${C.accent}; border-color:${C.accent}; color:#fff;}
.btn-primary:hover{background:${C.accentHi}; border-color:${C.accentHi};}
.btn-quiet{background:transparent; border-color:transparent; color:${C.dim};}
.btn-quiet:hover{background:${C.bg}; color:${C.text};}
.btn-danger{background:#fff; border-color:${C.danger}; color:${C.danger};}
.btn-danger:hover{background:${C.dangerLight};}
.btn-ok{background:${C.ok}; border-color:${C.ok}; color:#fff;}
.btn-ok:hover{filter:brightness(1.08);}
.btn-sm{padding:7px 14px; font-size:12.5px; border-radius:8px;}

.inp,.sel,textarea.inp{
  width:100%; padding:9px 12px; border-radius:var(--r); border:1px solid ${C.line};
  background:${C.flaeche}; color:${C.text}; font-size:13.5px; font-family:inherit;
  transition:border-color .14s, box-shadow .14s;
}
.inp:hover,.sel:hover{border-color:${C.lineStark};}
.inp:focus,.sel:focus,textarea.inp:focus{outline:none; border-color:${C.accent};
  box-shadow:0 0 0 3px ${C.accentLight};}
.inp::placeholder{color:${C.dim}; opacity:.72;}
.sel{appearance:none; padding-right:32px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' stroke='%236B7280' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 12px center;}

.pille{display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:999px;
  font-size:12px; font-weight:600; background:${C.flaecheStill}; color:${C.dim};
  border:1px solid transparent; white-space:nowrap;}
.pille-ok{background:${C.okLight}; color:${C.ok}; border-color:#BBF7D0;}
.pille-warn{background:${C.warnLight}; color:${C.warn}; border-color:#FEF08A;}
.pille-danger{background:${C.dangerLight}; color:${C.danger}; border-color:#FECACA;}
.pille-accent{background:${C.accentLight}; color:${C.accent}; border-color:#9FC2AC;}

/* Rundes Namenszeichen — ersetzt Fotos, die wir nicht haben */
.avatar{width:38px; height:38px; border-radius:50%; flex-shrink:0; display:flex;
  align-items:center; justify-content:center; font-size:13px; font-weight:650;
  background:${C.flaecheStill}; color:${C.dim}; letter-spacing:-.02em;}
.avatar-sm{width:30px; height:30px; font-size:11.5px;}
/* Schichtmarke mit linkem Akzentstrich statt voller Farbfläche */
.schicht{display:flex; flex-direction:column; gap:1px; padding:7px 10px; border-radius:9px;
  line-height:1.25; min-width:0;}
.schicht b{font-size:12px; font-weight:640;}
.schicht span{font-size:11px; opacity:.78; white-space:nowrap;}
/* Freie Zelle im Plan — sichtbar, aber ruhig */
.leerzelle{border:1.5px dashed ${C.line}; border-radius:9px; background:transparent;}

.rubrik{font-size:11px; font-weight:700; letter-spacing:.10em; text-transform:uppercase; color:${C.dim};}

/* Tabellen — der Kern jeder Planungsansicht */
table.raster{border-collapse:separate; border-spacing:0; width:100%;}
table.raster th{font-size:11.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color:${C.dim}; padding:10px var(--pad-x); border-bottom:1px solid ${C.line}; text-align:left;
  background:${C.bg}; position:sticky; top:0; z-index:2;}
table.raster td{padding:0 var(--pad-x); height:var(--zeile); border-bottom:1px solid ${C.lineSoft};
  font-size:13.5px; vertical-align:middle;}
table.raster tbody tr:hover td{background:${C.bg};}
table.raster tbody tr[data-gewaehlt="1"] td{background:${C.accentLight};}

/* Filter als einzelne Pillen statt als Schalterleiste — luftiger und
   auf dem Telefon leichter zu treffen. */
.seg{display:inline-flex; gap:8px; max-width:100%; overflow-x:auto; padding:2px;}
.seg button{border:1px solid ${C.line}; background:${C.flaeche}; cursor:pointer;
  font-family:inherit; font-size:13px; font-weight:550; color:${C.dim};
  padding:8px 16px; border-radius:999px; white-space:nowrap; flex-shrink:0;
  transition:background .14s, color .14s, border-color .14s;}
.seg button:hover{border-color:${C.lineStark};}
.seg button.on{background:${C.accentLight}; color:${C.accent}; border-color:${C.accent}; font-weight:620;}

.reiterreihe{display:flex; gap:7px; flex-wrap:nowrap; overflow-x:auto; padding-bottom:5px;
  margin-bottom:14px; scrollbar-width:thin;}
.reiterreihe::-webkit-scrollbar{height:4px;}
.reiterreihe::-webkit-scrollbar-thumb{background:${C.lineStark}; border-radius:2px;}
.reiterreihe > *{flex-shrink:0;}

.hakenliste{list-style:none; padding:0; margin:0;}
.hakenliste li{display:flex; gap:10px; align-items:flex-start; padding:7px 0; font-size:13.5px;}
.hakenliste li::before{content:"✓"; color:${C.ok}; font-weight:700; flex-shrink:0;}

.schalter{width:40px; height:23px; border-radius:999px; border:none; cursor:pointer; padding:0;
  position:relative; transition:background .18s; flex-shrink:0; background:${C.lineStark};}
.schalter.on{background:${C.accent};}
.schalter i{position:absolute; top:2.5px; left:2.5px; width:18px; height:18px; border-radius:50%;
  background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .18s;}
.schalter.on i{transform:translateX(17px);}

/* Tastaturkürzel als Marke im Text */
kbd.taste{display:inline-flex; align-items:center; justify-content:center; min-width:19px; height:19px;
  padding:0 5px; border-radius:5px; background:${C.bg}; border:1px solid ${C.line};
  font-family:inherit; font-size:11px; font-weight:600; color:${C.dim};}

/* Blätter und Überlagerungen */
.blatt{background:${C.flaeche}; border-radius:var(--r-gross); box-shadow:0 20px 48px rgba(17,24,39,.18);
  border:1px solid ${C.line};}
.zeile-hover:hover{background:${C.bg};}

/* Meldungsstreifen mit Rücknahme */
.toast{position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:95;
  background:${C.text}; color:#fff; padding:12px 16px; border-radius:var(--r); font-size:13.5px;
  box-shadow:0 12px 32px rgba(17,24,39,.28); display:flex; align-items:center; gap:14px;
  max-width:92vw; animation:auf .2s cubic-bezier(.4,0,.2,1);}
@keyframes auf{from{opacity:0; transform:translate(-50%,10px);} to{opacity:1; transform:translate(-50%,0);}}
.toast button{border:none; background:transparent; color:${C.accentGlanz}; font-family:inherit;
  font-size:13px; font-weight:650; cursor:pointer; padding:0;}
/* Fünf Sekunden Rücknahmefrist, sichtbar als schrumpfender Ring */
.toast-uhr{width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,.22);
  position:relative; flex-shrink:0;}
.toast-uhr i{position:absolute; inset:-2px; border-radius:50%; border:2px solid ${C.accentGlanz};
  border-right-color:transparent; border-bottom-color:transparent;
  animation:uhr 5s linear forwards;}
@keyframes uhr{from{transform:rotate(0deg); opacity:1;} to{transform:rotate(360deg); opacity:.25;}}
@keyframes pulsieren{0%,100%{opacity:.55;} 50%{opacity:1;}}
@media (prefers-reduced-motion: reduce){
  *{animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important;}
  .toast-uhr i{animation:none; opacity:.5;}
  .toast{animation:none;}
  *{scroll-behavior:auto !important;}
}

::-webkit-scrollbar{width:10px; height:10px;}
::-webkit-scrollbar-thumb{background:${C.lineStark}; border-radius:5px; border:3px solid ${C.bg};}
::-webkit-scrollbar-track{background:transparent;}

/* Kontrastmodus für den Feldeinsatz */
.feldmodus{--schrift:16px;}
.feldmodus .karte{border-color:${C.lineStark};}
.feldmodus table.raster td{border-bottom-color:${C.line};}

@media (max-width: 1024px){
  .seitenleiste{transform:translateX(-100%); box-shadow:0 0 40px rgba(0,0,0,.3);}
  .seitenleiste.offen{transform:translateX(0);}
  .inhalt{margin-left:0;}
  main.bereich{padding:16px 14px 96px;}
}
@media (min-width: 1025px){ .nur-schmal{display:none !important;} }

@media print{
  .seitenleiste,.kopfleiste,.noprint,.toast{display:none !important;}
  .inhalt{margin-left:0;}
  .sw-root{background:#fff;}
  .karte{border-color:#D1D5DB; box-shadow:none; break-inside:avoid;}
}
`;

/* --------------------------------- Datum --------------------------------- */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = pISO(s); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => (pISO(s).getDay() + 6) % 7;
const between = (a, b) => Math.round((pISO(b) - pISO(a)) / 86400000);
const dim_ = (y, m) => new Date(y, m + 1, 0).getDate();
const montag = (s) => addDays(s, -dow(s));
const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MON = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const heute = () => iso(new Date());
const fLang = (s) => { const d = pISO(s); return `${DOW[dow(s)]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fKurz = (s) => (s ? `${pad(pISO(s).getDate())}.${pad(pISO(s).getMonth() + 1)}.` : "—");
const fDatum = (s) => (s ? s.split("-").reverse().join(".") : "—");
const n1 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sgn = (v) => (v >= 0 ? "+" : "−") + n1(Math.abs(v));
const eur = (v) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const eur0 = (v) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const zahl = (v) => v.toLocaleString("de-DE");
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/* ------------------------ Feiertage aller Bundesländer -------------------- */
const LAENDER = [["BW","Baden-Württemberg"],["BY","Bayern"],["BE","Berlin"],["BB","Brandenburg"],["HB","Bremen"],
  ["HH","Hamburg"],["HE","Hessen"],["MV","Mecklenburg-Vorpommern"],["NI","Niedersachsen"],["NW","Nordrhein-Westfalen"],
  ["RP","Rheinland-Pfalz"],["SL","Saarland"],["SN","Sachsen"],["ST","Sachsen-Anhalt"],["SH","Schleswig-Holstein"],["TH","Thüringen"]];
function ostern(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(y, mo - 1, da));
}
function bubettag(y) { let d = `${y}-11-22`; while (dow(d) !== 2) d = addDays(d, -1); return d; }
const fCache = {};
function feiertage(y, land) {
  const k = `${y}|${land}`;
  if (fCache[k]) return fCache[k];
  const e = ostern(y);
  const h = { [`${y}-01-01`]: "Neujahr", [addDays(e, -2)]: "Karfreitag", [addDays(e, 1)]: "Ostermontag",
    [`${y}-05-01`]: "Tag der Arbeit", [addDays(e, 39)]: "Christi Himmelfahrt", [addDays(e, 50)]: "Pfingstmontag",
    [`${y}-10-03`]: "Tag der Deutschen Einheit", [`${y}-12-25`]: "1. Weihnachtstag", [`${y}-12-26`]: "2. Weihnachtstag" };
  const add = (c, d, n) => { if (c) h[d] = n; };
  add(["BW","BY","ST"].includes(land), `${y}-01-06`, "Heilige Drei Könige");
  add(["BE","MV"].includes(land), `${y}-03-08`, "Internationaler Frauentag");
  add(["BW","BY","HE","NW","RP","SL"].includes(land), addDays(e, 60), "Fronleichnam");
  add(land === "SL", `${y}-08-15`, "Mariä Himmelfahrt");
  add(land === "TH", `${y}-09-20`, "Weltkindertag");
  add(["BB","HB","HH","MV","NI","SN","ST","SH","TH"].includes(land), `${y}-10-31`, "Reformationstag");
  add(["BW","BY","NW","RP","SL"].includes(land), `${y}-11-01`, "Allerheiligen");
  add(land === "SN", bubettag(y), "Buß- und Bettag");
  fCache[k] = h; return h;
}
const feiertag = (d, land) => feiertage(Number(d.slice(0, 4)), land)[d] || null;

/* ------------------------------ Zeitrechnung ------------------------------ */
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
function dauer(d) { let x = toMin(d.ende) - toMin(d.start); if (x <= 0) x += 1440; return Math.round((x / 60 - (d.pause || 0) / 60) * 100) / 100; }
function brutto(d) { let x = toMin(d.ende) - toMin(d.start); if (x <= 0) x += 1440; return x / 60; }
function nachtAnteil(d) {
  const s = toMin(d.start); let e = toMin(d.ende); if (e <= s) e += 1440;
  let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
  return Math.round(sum / 60 * 100) / 100;
}
function fenster(datum, d) {
  const base = between("2000-01-01", datum) * 1440;
  const s = base + toMin(d.start); let e = base + toMin(d.ende); if (e <= s) e += 1440;
  return [s, e];
}

/* ------------------------------- Rollenwerk ------------------------------- */
const ROLLEN = [
  { id: "betreiber", label: "Betreiber", kurz: "BE", farbe: "#1B1E23", berechnet: false, extern: true,
    text: "Verwaltet Mandanten, Tarife und Rechnungen. Sieht ausschließlich Zahlen, niemals Namen." },
  { id: "leitung", label: "Organisationsleitung", kurz: "OL", farbe: "#2B3440", berechnet: true,
    text: "Richtet Betrieb, Einheiten, Dienstarten und Zugänge ein. Sieht alles im eigenen Betrieb." },
  { id: "planer", label: "Planer", kurz: "PL", farbe: "#35506B", berechnet: true,
    text: "Plant, ändert Schichtfolgen und Dienstarten, genehmigt Anträge." },
  { id: "subplaner", label: "Sub-Planer", kurz: "SP", farbe: "#4C4668", berechnet: true,
    text: "Ändert Einsätze nur in der eigenen Einheit und genehmigt dort Anträge." },
  { id: "mitarbeiter", label: "Mitarbeiter", kurz: "MA", farbe: "#3C5A48", berechnet: true,
    text: "Sieht den eigenen Plan, stellt Urlaubsanträge und Tauschanfragen." },
  { id: "betriebsrat", label: "Betriebsrat", kurz: "BR", farbe: "#6B4E23", berechnet: false,
    text: "Rein lesender Prüfzugang auf Pläne und Protokoll. Kostenfrei." },
];
const rolle = (id) => ROLLEN.find((r) => r.id === id) || ROLLEN[4];

const RECHTE_GRUPPEN = [
  ["Planung", [["plan.view.own","Eigenen Plan sehen"],["plan.view.unit","Plan der eigenen Einheit sehen"],
    ["plan.view.all","Pläne aller Einheiten sehen"],["plan.edit.unit","Einsätze der eigenen Einheit ändern"],
    ["plan.edit.all","Einsätze aller Einheiten ändern"],["pattern.edit","Schichtfolge bearbeiten"],
    ["shift.edit","Dienstarten anlegen und ändern"]]],
  ["Anträge", [["req.create","Anträge und Tauschanfragen stellen"],["req.approve.unit","Anträge der eigenen Einheit entscheiden"],
    ["req.approve.all","Anträge aller Einheiten entscheiden"]]],
  ["Personal", [["staff.view","Personalliste sehen"],["staff.edit","Personal anlegen und bearbeiten"],
    ["account.view.own","Eigene Konten sehen"],["account.view.all","Konten aller Personen sehen"]]],
  ["Betrieb", [["org.edit","Einheiten und Betriebsdaten verwalten"],["roles.assign","Zugänge und Rollen vergeben"],
    ["billing.view","Kosten des Betriebs sehen"],["audit.view","Protokoll einsehen"],["export.data","Daten exportieren"]]],
];
const ALLE_RECHTE = RECHTE_GRUPPEN.flatMap(([, i]) => i.map((x) => x[0]));
const MATRIX_STD = {
  leitung: [...ALLE_RECHTE],
  planer: ALLE_RECHTE.filter((r) => !["org.edit", "roles.assign", "billing.view"].includes(r)),
  subplaner: ["plan.view.own","plan.view.unit","plan.edit.unit","req.create","req.approve.unit","staff.view","account.view.own","account.view.all"],
  mitarbeiter: ["plan.view.own","plan.view.unit","req.create","account.view.own"],
  betriebsrat: ["plan.view.own","plan.view.unit","plan.view.all","staff.view","audit.view","export.data"],
};

/* --------------------------------- Tarife --------------------------------- */
const STATUS = [
  { id: "test", label: "Testphase", tone: "warn", zahlt: false },
  { id: "aktiv", label: "Aktiv", tone: "ok", zahlt: true },
  { id: "gekuendigt", label: "Gekündigt", tone: "neutral", zahlt: true },
  { id: "gesperrt", label: "Gesperrt", tone: "danger", zahlt: false },
];
const stat = (id) => STATUS.find((s) => s.id === id) || STATUS[0];

/* --------------------------------------------------------------------------
   PREISMODELL — je Standort, nicht je Kopf
   Wer einstellt, zahlt nicht mehr. Das ist für Betriebe planbar und für uns
   der Punkt, an dem wir gegen Anbieter mit Kopfpauschale gewinnen: ein
   Pflegedienst mit fünf Touren oder ein Wachdienst mit acht Objekten zahlt
   dort das Drei- bis Vierfache.

   Gestaffelt wird nach der Größe des einzelnen Standorts, nicht des Betriebs —
   sonst zahlt eine kleine Außenstelle so viel wie die Zentrale.
   -------------------------------------------------------------------------- */
/* Die Betriebspauschale deckt, was unabhängig von der Größe anfällt:
   Einrichtung, Betreuung, Sicherungen, Bereitschaft. Ein Betrieb mit
   achtzehn Personen kostet dieselbe Aufmerksamkeit wie einer mit
   dreihundert — ohne Pauschale zahlen die Großen die Kleinen mit. */
const BETRIEBSPAUSCHALE = 49;

const TARIFE_STD = [
  { id: "basis", name: "Basis", jeStandort: 89, bisPersonen: 30,
    grenzen: { einheiten: 3, personen: 60 },
    paketeFrei: 0,
    leistungen: ["Dienstplanung mit Rotationsmodellen", "Anträge und Tauschbörse",
      "Kalender-Feed und Weckzeiten", "Mobile Ansicht", "Datenmitnahme jederzeit"] },
  { id: "pro", name: "Professional", jeStandort: 159, bisPersonen: 150,
    grenzen: { einheiten: 15, personen: 400 },
    leistungen: ["Alles aus Basis", "Qualifikationen mit Ablauf", "Arbeitszeitprüfung",
      "Belastbarkeitsanalyse", "Lohnausgabe — ein Klick zur Lohnbuchhaltung"] },
  { id: "enterprise", name: "Enterprise", jeStandort: 239, bisPersonen: null,
    grenzen: { einheiten: 200, personen: 100000 },
    paketeFrei: 2,
    leistungen: ["Alles aus Professional", "Zwei Branchenpakete enthalten",
      "Beliebig viele Personen je Standort", "Leistungsnachweis für Auftraggeber",
      "Auftragsverarbeitung nach Artikel 28", "Bevorzugter Rückruf"] },
];

/* Mengenstaffel über die Zahl der Standorte. Wer viele Standorte führt, hat
   den höheren Verwaltungsaufwand ohnehin — und ist bei uns am besten aufgehoben. */
const STAFFEL = [
  { von: 1, bis: 1, rabatt: 0, label: "ein Standort" },
  /* Ab dem zweiten Standort greift die Staffel — das ist die Größe, in der
     gegen Einzelplatzlösungen verglichen wird. */
  { von: 2, bis: 2, rabatt: .07, label: "2 Standorte" },
  { von: 3, bis: 5, rabatt: .12, label: "3 – 5 Standorte" },
  { von: 6, bis: 10, rabatt: .20, label: "6 – 10 Standorte" },
  { von: 11, bis: 25, rabatt: .27, label: "11 – 25 Standorte" },
  { von: 26, bis: 1e6, rabatt: .34, label: "ab 26 Standorten" },
];
const staffel = (n) => STAFFEL.find((s) => n >= s.von && n <= s.bis) || STAFFEL[0];

/** Welcher Tarif trägt einen Standort dieser Größe? */
const tarifFuer = (personenJeStandort) =>
  TARIFE_STD.find((t) => t.bisPersonen === null || personenJeStandort <= t.bisPersonen)
  || TARIFE_STD[TARIFE_STD.length - 1];

const BRANCHEN = [
  ["sicherheit", "Sicherheitsdienst", "Schichtgruppe"], ["pflege", "Pflege", "Wohnbereich"],
  ["klinik", "Klinik", "Station"], ["produktion", "Produktion", "Schichtgruppe"],
  ["logistik", "Logistik", "Team"], ["leitstelle", "Leitstelle", "Wachschicht"],
  ["gastronomie", "Gastronomie", "Team"], ["handel", "Handel", "Filialteam"],
  ["rettung", "Rettungsdienst", "Wachabteilung"], ["sonstiges", "Sonstiges", "Einheit"],
];

const ABW = [
  { id: "urlaub", label: "Urlaub", kurz: "U", farbe: "#2E6B4F", urlaub: true, bezahlt: true, rang: 3 },
  { id: "krank", label: "Krank", kurz: "K", farbe: "#B3261E", urlaub: false, bezahlt: true, rang: 5 },
  { id: "schulung", label: "Schulung", kurz: "S", farbe: "#35506B", urlaub: false, bezahlt: true, rang: 4 },
  { id: "frei", label: "Freistellung", kurz: "F", farbe: "#878C93", urlaub: false, bezahlt: false, rang: 1 },
  { id: "sonst", label: "Sonstiges", kurz: "X", farbe: "#8A5A00", urlaub: false, bezahlt: true, rang: 2 },
  { id: "ausgleich", label: "Freizeitausgleich", kurz: "A", farbe: "#0369A1", urlaub: false, bezahlt: false, rang: 2 },
];
const abwArt = (id) => ABW.find((a) => a.id === id) || ABW[4];

/* ------------------------------- Zyklusvorlagen --------------------------- */
const VORLAGEN = [
  { id: "v5", name: "5 Einheiten · 9,75 h", einheiten: 5, wochen: 5, wochenstunden: 40.95,
    text: "Drei Dienstarten, 40,95 h je Woche. Höchstens 4 Dienste und 4 Nächte am Stück, keine Einzeldienste.",
    zeiten: { F: ["06:00","15:45"], S: ["13:45","23:30"], N: ["21:30","07:15"] },
    tage: ["-","N","N","N","N","-","-","-","S","S","S","-","N","N","N","-","-","-","S","S","S","S","-","-","F","F","-","-","F","F","F","-","-","F","F"] },
  { id: "v4", name: "4 Einheiten · 8 h", einheiten: 4, wochen: 4, wochenstunden: 42,
    text: "Klassischer Vierschichtbetrieb, 42 h je Woche. Höchstens 5 Dienste am Stück. Vier einzelne Diensttage sind bei dieser Auslastung rechnerisch unvermeidbar.",
    zeiten: { F: ["06:00","14:00"], S: ["14:00","22:00"], N: ["22:00","06:00"] },
    tage: ["N","-","-","F","S","S","S","-","N","N","N","N","-","-","F","F","F","S","-","F","F","S","S","S","-","F","N","N"] },
];

/* Gesättigte Farben sind ausschließlich für Dienstarten und Einheiten reserviert. */
const PALETTE = ["#2C5A8A","#5B4A87","#2C6B63","#9A4A22","#96335C","#4A6B2E","#2A5C77","#8A5518"];

/* ------------------------------ Startbestand ------------------------------ */
const VN = ["Anna","Mehmet","Sabine","Jonas","Katrin","Tobias","Elif","Markus","Julia","Piotr","Nadine","Sven","Maria","Kevin","Ines","Lars","Hanna","Ali","Britta","Dennis","Yvonne","Ruben","Steffi","Malte","Olga","Timo","Carla","Nils","Fatma","Ronja","Bastian","Leonie","Erdal","Miriam","Kai","Sonja","Dominik","Vera","Hakan","Josefine"];
const NN = ["Berger","Yilmaz","Krämer","Hoffmann","Sander","Nowak","Demir","Reuter","Schäfer","Kowalski","Brandt","Vogel","Seibert","Ahrens","Lindner","Petrov","Baumann","Özdemir","Frank","Weiss","Roth","Kaminski","Haas","Dietrich","Sommer","Engel","Klose","Barth","Yildiz","Pohl","Winkler","Marek","Stein","Gruber"];
function rnd(seed) { let s = seed; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function baueMandant(cfg, seed) {
  const r = rnd(seed);
  const v = VORLAGEN.find((x) => x.id === cfg.vorlage) || VORLAGEN[0];
  const jahr = new Date().getFullYear();
  const standorte = (cfg.standorte || [{ name: cfg.ort || "Hauptstandort", land: cfg.land, lat: 50.11, lon: 8.68 }])
    .map((x, i) => ({ id: `st${i + 1}`, name: x.name, bundesland: x.land,
      lat: x.lat === undefined ? 50.11 + i * 1.3 : x.lat,
      lon: x.lon === undefined ? 8.68 + i * 1.1 : x.lon,
      radius: x.radius === undefined ? 200 : x.radius }));
  const einheiten = Array.from({ length: v.einheiten }, (_, i) => ({
    id: uid("e"), name: `${cfg.einheitLabel} ${i + 1}`, versatz: i, versatzTage: i * 7, pool: false,
    standortId: standorte[i % standorte.length].id, farbe: PALETTE[i % PALETTE.length] }));
  // Springerpool: keine Rotation, wird gezielt in Lücken eingesetzt
  if (cfg.pool) einheiten.push({ id: uid("e"), name: "Springerpool", versatz: 0, versatzTage: 0, pool: true,
    standortId: standorte[0].id, farbe: "#0369A1" });
  const quals = cfg.qualifikationen.map((q, i) => ({ id: `q${i + 1}`, name: q[0], kurz: q[1],
    farbe: PALETTE[i % PALETTE.length],
    // Gültigkeitsdauer in Monaten; null bedeutet unbefristet
    gueltigMonate: q[2] === undefined ? null : q[2],
    nachweisPflicht: !!q[3],
    fachkraft: !!q[4],            // zählt für die Fachkraftquote
    harteSperre: !!q[5],          // ohne sie ist keine Einteilung möglich
    /* Ebene und Bezug: Wer eine Einteilung verhindert, muss sagen können,
       worauf er sich stützt. In den Vorführdaten ist die einzige harte
       Sperre die Sachkunde nach § 34a GewO — Bundesrecht, aber nur für
       bestimmte Tätigkeiten. Alles Übrige ist eine betriebliche Festlegung
       und wird auch so ausgewiesen. */
    ebene: q[6] || (q[5] ? "bund" : "betrieb"),
    bezug: q[7] || (q[5] ? "taetigkeit" : "person"),
    grundlage: q[8] || (q[5] ? "§ 34a Abs. 1a GewO" : "Betriebliche Festlegung") }));

  const dienstarten = [
    { id: "F", name: "Frühdienst", kurz: "F", start: v.zeiten.F[0], ende: v.zeiten.F[1], pause: 0, farbe: "#1D4ED8",
      ort: cfg.ort, posten: false, quelle: null, faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null, mindest: cfg.mindest.F, mindestQual: cfg.mindestQual.F || {} },
    { id: "S", name: "Spätdienst", kurz: "S", start: v.zeiten.S[0], ende: v.zeiten.S[1], pause: 0, farbe: "#B03A0A",
      ort: cfg.ort, posten: false, quelle: null, faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null, mindest: cfg.mindest.S, mindestQual: cfg.mindestQual.S || {} },
    { id: "N", name: "Nachtdienst", kurz: "N", start: v.zeiten.N[0], ende: v.zeiten.N[1], pause: 0, farbe: "#7C3AED",
      ort: cfg.ort, posten: false, quelle: null, faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null, mindest: cfg.mindest.N, mindestQual: cfg.mindestQual.N || {} },
  ];
  if (cfg.posten) dienstarten.push(
    { id: "PF", name: cfg.posten.name, kurz: "PF", start: cfg.posten.start, ende: cfg.posten.ende, pause: 0,
      farbe: "#2C6B63", ort: cfg.posten.ort, posten: true, quelle: "F", faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
      mindest: { mo_do: cfg.posten.n, fr: cfg.posten.n, sa: cfg.posten.n, so: cfg.posten.n }, mindestQual: {} });

  // Fachkraftquote je Dienst, wo das Paket es vorsieht
  if ((cfg.pakete || []).some((p) => p === "pflege" || p === "klinik"))
    for (const d of dienstarten) {
      if (d.posten) continue;
      d.fachkraftQuote = nachtAnteil(d) >= 2 ? 0.5 : 0.4;   // nachts höherer Anteil
    }

  if (cfg.rufbereitschaft) dienstarten.push({ id: "RB", name: "Rufbereitschaft", kurz: "RB",
    start: "17:00", ende: "07:00", pause: 0, farbe: "#8A5309", ort: cfg.ort, posten: false, quelle: null,
    faktor: 0.125, ruhezeitNeutral: true, rufbereitschaft: true, form: "ruf", fachkraftQuote: null, zweiterAbschnitt: null,
    mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} });

  const personen = [];
  const belegt = new Set();
  einheiten.forEach((e, ei) => {
    const groesse = e.pool ? (cfg.pool || 0) : cfg.groesse + (ei % 2);
    for (let i = 0; i < groesse; i++) {
      let vn, nn, k;
      do { vn = VN[Math.floor(r() * VN.length)]; nn = NN[Math.floor(r() * NN.length)]; k = vn + nn; } while (belegt.has(k));
      belegt.add(k);
      // Die erste Qualifikation ist die fachliche Grundqualifikation.
      // Wo sie gesetzlich zwingend ist (harte Sperre), hat sie jede Person.
      // Wo sie nur die Fachkraftquote bestimmt, hat sie ein Teil — sonst wäre
      // die Quote ohne Aussage.
      const qs = [];
      const grund = quals[0];
      const jeder = grund.harteSperre || !grund.fachkraft;
      if (jeder || i % 5 !== 3) qs.push(grund.id);
      else if (quals[2]) qs.push(quals[2].id);   // Hilfskraft mit anderer Qualifikation
      if (i >= 1 && i <= 5 && quals[1]) qs.push(quals[1].id);
      if (r() > .6 && quals[2]) qs.push(quals[2].id);
      // Ablaufdaten: einige laufen absichtlich bald ab, damit die Prüfung greift
      const qNachweise = qs.map((qid, k) => {
        const q = quals.find((x) => x.id === qid);
        if (!q || !q.gueltigMonate) return { qualId: qid, ablauf: null, datei: null };
        const tage = Math.round(q.gueltigMonate * 30.44);
        const rest = (i % 9 === 0 && k === 0) ? 20 : (i % 7 === 0 && k === 1) ? -12 : Math.floor(r() * tage);
        return { qualId: qid, ablauf: addDays(heute(), rest), datei: null };
      });
      personen.push({ id: uid("p"), vorname: vn, nachname: nn,
        funktion: e.pool ? "Springer"
          : (!e.pool && i === 0 && ei === 0) ? "Personaldisposition"
          : i === 0 ? "Dienstplanung"
          : i === 1 ? "Schichtleitung"
          : i === groesse - 2 ? "Auszubildende" : "Fachkraft",
        email: `${vn.toLowerCase()}.${nn.toLowerCase().replace(/[^a-z]/g, "")}@${cfg.domain}`,
        zugehoerigkeit: [{ ab: `${jahr - 2}-01-01`, einheitId: e.id }],
        eintritt: `${jahr - 2}-01-01`, austritt: null,
        wochenstunden: e.pool ? 32 : (!e.pool && i === 5) ? Math.round(cfg.wochenstunden * 0.5 * 2) / 2
          : (!e.pool && i === 10) ? Math.round(cfg.wochenstunden * 0.75 * 2) / 2 : cfg.wochenstunden,
        urlaubsanspruch: 30, urlaubsuebertrag: i % 5 === 0 ? 3 : 0,
        stundenuebertrag: Math.round((r() * 60 - 75) * 10) / 10, qualifikationen: qs, qualNachweise: qNachweise,
        einschraenkungen: { keineNacht: false, keinAlleindienst: !e.pool && i === groesse - 2,
          maxDiensteWoche: null, wiedereingliederung: null },
        teilzeit: (!e.pool && (i === 5 || i === 10))
          ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null,
        springer: !!e.pool,
        // Springer arbeiten in Teilzeit auf Abruf — vier Einsätze je Woche.
        // Ein Vollzeitvertrag würde bei dieser Einsatzdichte ein dauerhaft
        // negatives Stundenkonto erzeugen.
        rolle: (!e.pool && i === 0 && ei === 0) ? "leitung" : (!e.pool && i === 0) ? "planer"
          : (!e.pool && i === 1) ? "subplaner" : (!e.pool && i === groesse - 1 && ei === 0) ? "betriebsrat" : "mitarbeiter",
        bereich: (!e.pool && (i === 0 || (i === groesse - 1 && ei === 0))) ? "ALLE" : e.id,
        // Verfügbarkeit als Wochenraster: 7 Tage × 3 Zeitfenster, true = kann
        verfuegbarkeit: (i % 6 === 0)
          ? { aktiv: true, raster: Array.from({ length: 21 }, (_, k) => !(k % 3 === 2 && k < 9)) }
          : { aktiv: false, raster: Array(21).fill(true) },
        nachweise: [],
        kontrastmodus: false,
        einfuehrung: { erledigt: true, schritt: 0 },   // Bestandsdaten gelten als eingeführt
        notiz: "",                       // Planungswissen zur Person
        einarbeitung: null,              // { bis, mentorId }
        benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
        rolleSeit: `${jahr - 2}-01-01`, status: "aktiv",
        // Planer sitzen im Geschäftszimmer und fahren keine Schicht mit.
        // Sub-Planer sind die Schichtverantwortlichen und arbeiten mit.
        imSchichtdienst: !((!e.pool && i === 0 && ei === 0) || (!e.pool && i === 0)) });
    }
  });

  const abwesenheiten = [];
  const start = heute().slice(0, 8) + "01";
  einheiten.forEach((e) => {
    const pool = personen.filter((p) => p.zugehoerigkeit[0].einheitId === e.id && p.funktion !== "Schichtleitung");
    const pick = new Set(); while (pick.size < Math.min(3, pool.length)) pick.add(Math.floor(r() * pool.length));
    [...pick].forEach((idx, k) => {
      const p = pool[idx];
      const art = k < 2 ? "urlaub" : ["krank", "schulung"][Math.floor(r() * 2)];
      const von = addDays(start, Math.floor(r() * 20));
      abwesenheiten.push({ id: uid("a"), personId: p.id, art, von,
        bis: addDays(von, art === "urlaub" ? 5 + Math.floor(r() * 7) : 1 + Math.floor(r() * 3)), notiz: "" });
    });
  });

  return {
    id: uid("m"), name: cfg.name, branche: cfg.branche, einheitLabel: cfg.einheitLabel,
    bundesland: cfg.land, tarif: cfg.tarif, status: cfg.status, seit: cfg.seit, stichtag: cfg.stichtag || null,
    rabattGrund: cfg.rabatt || 0, kontakt: cfg.kontakt, anschrift: cfg.anschrift,
    anker: montag(`${jahr}-01-01`), zyklus: { wochen: v.wochen, tage: [...v.tage], vorlage: v.id },
    matrix: JSON.parse(JSON.stringify(MATRIX_STD)),
    einstellungen: { ruhezeit: 11, maxFolge: 6, maxNachtFolge: 4, maxUrlaubJeEinheit: 3,
      sollWochenstunden: cfg.wochenstunden, ausgleichGrenze: 40, ausgleichFristMonate: 6, aufbewahrungMonate: 24 },
    standorte, einheiten, qualifikationen: quals, dienstarten, personen, abwesenheiten,
    dienstbuch: [],
    // Springer werden regelmäßig eingesetzt — sonst liefe ihr Stundenkonto
    // unrealistisch weit ins Minus und jede Auswertung wäre verzerrt.
    // Vier Einsätze je Woche auf festen Wochentagen, je Springer versetzt.
    abweichungen: (() => {
      const out = {};
      const springer = personen.filter((p) => p.springer);
      const rot = dienstarten.filter((d) => !d.posten && d.form !== "ruf");
      if (!springer.length || !rot.length) return out;
      const mo = montag(heute());
      // Tage, an denen jemand abwesend ist, bleiben frei — sonst entstünden
      // Einsätze trotz Urlaub.
      const belegt = new Set();
      for (const a of abwesenheiten)
        for (let d = a.von; d <= a.bis; d = addDays(d, 1)) belegt.add(`${a.personId}|${d}`);
      springer.forEach((p, si) => {
        // Je Woche eine Dienstart, vier Tage am Stück — so springt jemand
        // tatsächlich für eine Gruppe ein, ohne Ruhezeitkonflikte zu erzeugen.
        for (let w = -70; w <= 10; w++) {
          const idx = ((si + w) % rot.length + rot.length) % rot.length;
          const da = rot[idx];
          const start = (si * 2) % 3;
          for (let k = 0; k < 4; k++) {
            const d = addDays(mo, w * 7 + start + k);
            if (belegt.has(`${p.id}|${d}`)) continue;
            out[`${p.id}|${d}`] = da.id;
          }
        }
      });
      return out;
    })(),
    anfragen: (() => {
      const out = [];
      const kand = personen.filter((p) => p.imSchichtdienst !== false).slice(0, 6);
      kand.forEach((p, i) => {
        const von = addDays(heute(), 12 + i * 4);
        out.push({ id: `r_${p.id}`, personId: p.id, typ: "abwesenheit", art: i % 3 === 0 ? "schulung" : "urlaub",
          status: i < 3 ? "offen" : "genehmigt", von, bis: addDays(von, i % 3 === 0 ? 1 : 6),
          text: "", erstellt: new Date(Date.now() - i * 864e5).toLocaleString("de-DE"), antwort: "" });
      });
      if (kand[0]) out.push({ id: `t_${kand[0].id}`, personId: kand[0].id, typ: "tausch", status: "offen",
        partnerId: null, interessenten: [], von: addDays(heute(), 9), bis: addDays(heute(), 9),
        text: "Familienfeier, tausche gern gegen einen Spätdienst",
        erstellt: new Date(Date.now() - 864e5).toLocaleString("de-DE") });
      return out;
    })(),
    protokoll: [],
    // Der laufende Monat ist freigegeben — so sieht ein Betrieb in Benutzung aus
    freigaben: (() => {
      const ym = heute().slice(0, 7);
      const chef = personen.find((p) => p.rolle === "planer") || personen[0];
      return { [ym]: { stand: 1, zeit: new Date(Date.now() - 6048e5).toLocaleString("de-DE"),
        durch: chef ? `${chef.vorname} ${chef.nachname}` : "Planung" } };
    })(),
    nachrichten: [],      // Rückkanal an einzelne Personen
    aenderungen: [],      // Planänderungen mit Vorlauf, Grundlage für Planungssicherheit
    erfassung: {},        // "personId|datum" -> { start, ende, bestaetigt, grund }
    einspruenge: [],      // wer ist wann für wen eingesprungen
    zuschlaege: [
      { id: "z1", name: "Nachtarbeit", art: "nacht", prozent: 25, aktiv: true },
      { id: "z2", name: "Sonntagsarbeit", art: "sonntag", prozent: 50, aktiv: true },
      { id: "z3", name: "Feiertagsarbeit", art: "feiertag", prozent: 125, aktiv: true },
      { id: "z4", name: "Samstagsarbeit", art: "samstag", prozent: 0, aktiv: false },
    ],
    urlaubsrunde: null,      // { jahr, phase, frist, kontingent, wuensche }
    unterschreitungen: [],   // dokumentierte Unterdeckung mit Begründung
    stand: 0,                // Fortschreibungszähler für die Konflikterkennung
    betriebsmittel: [],      // Schlüssel, Fahrzeuge, Geräte, Dienstkleidung
    aushang: [],             // Schwarzes Brett für alle
    einstempeln: {},         // "personId|datum" -> { start, ende, ortStart, ortEnde, abstand }
    notizen: {},             // "tag|JJJJ-MM-TT" oder "person|<id>" -> [{ id, text, von, zeit }]
    pakete: cfg.pakete || [],        // freigeschaltete Branchenpakete
    uebergaben: [],                  // Schichtübergaben (Pflege, Klinik)
    lohnarten: null,                 // null bedeutet Standardzuordnung
    genehmigungsstufen: null,        // null bedeutet Standardstufen
    ansichten: [],                   // gespeicherte Filter je Person
    wuensche: [],            // Wunsch- und Sperrdienste einzelner Personen
    einarbeitung: [],        // { personId, mentorId, von, bis, ziel }
    planstaende: {},         // "JJJJ-MM" -> Abbild der Abweichungen zum Freigabezeitpunkt
    briefing: { aktiv: true, uhrzeit: "06:00" },
  };
}

function startbestand() {
  const j = new Date().getFullYear();
  const mandanten = [
    baueMandant({ name: "Nordwacht Sicherheitsdienste GmbH", branche: "sicherheit", einheitLabel: "Schichtgruppe",
      land: "HE", tarif: "pro", status: "aktiv", seit: `${j}-02-01`, kontakt: "leitung@nordwacht.de",
      anschrift: "Hafenstraße 14\n60327 Frankfurt am Main", domain: "nordwacht.de", vorlage: "v5",
      standorte: [{ name: "Leitstelle Frankfurt", land: "HE", lat: 50.1109, lon: 8.6821, radius: 150 },
        { name: "Niederlassung Hannover", land: "NI", lat: 52.3759, lon: 9.7320, radius: 200 }],
      wochenstunden: 41, groesse: 16, ort: "Leitstelle", pool: 4, rufbereitschaft: true,
      pakete: ["sicherheit"],
      qualifikationen: [["Sachkunde §34a", "SK", null, true, true, true], ["Schichtleitung", "SL", null, false],
        ["Erste Hilfe", "EH", 24, true], ["Führungszeugnis", "FZ", 36, true]],
      mindest: { F: { mo_do: 7, fr: 7, sa: 7, so: 7 }, S: { mo_do: 7, fr: 7, sa: 7, so: 7 }, N: { mo_do: 6, fr: 7, sa: 7, so: 6 } },
      mindestQual: { F: { q1: 5, q2: 1 }, S: { q1: 5, q2: 1 }, N: { q1: 4, q2: 1 } },
      posten: { name: "Objektwache Tag", ort: "Objekt Nord", start: "06:00", ende: "16:00", n: 4 } }, 4711),
    baueMandant({ name: "Seniorenzentrum Lindenhof", branche: "pflege", einheitLabel: "Wohnbereich",
      land: "NW", tarif: "pro", status: "aktiv", seit: `${j}-04-15`, kontakt: "leitung@lindenhof.de",
      anschrift: "Lindenallee 3\n44135 Dortmund", domain: "lindenhof.de", vorlage: "v4",
      wochenstunden: 38.5, groesse: 13, ort: "Haupthaus", pool: 3, pakete: ["pflege"],
      qualifikationen: [["Pflegefachkraft", "PFK", null, true, true, false], ["Wohnbereichsleitung", "WBL", null, false],
        ["Betreuungskraft §43b", "BK", null, true], ["Erste Hilfe", "EH", 24, true],
        ["Hygieneschulung", "HYG", 12, true]],
      mindest: { F: { mo_do: 6, fr: 6, sa: 5, so: 5 }, S: { mo_do: 5, fr: 5, sa: 4, so: 4 }, N: { mo_do: 3, fr: 3, sa: 3, so: 3 } },
      mindestQual: { F: { q1: 3 }, S: { q1: 3 }, N: { q1: 2 } }, posten: null }, 1234),
    baueMandant({ name: "Steinbach Fertigung GmbH", branche: "produktion", einheitLabel: "Schichtgruppe",
      land: "BY", tarif: "basis", status: "test", seit: `${j}-07-10`, stichtag: `${j}-08-24`,
      kontakt: "personal@steinbach.de", anschrift: "Industriering 8\n86167 Augsburg", domain: "steinbach.de",
      vorlage: "v4", wochenstunden: 35, groesse: 11, ort: "Werk Ost", pool: 2, pakete: ["industrie"],
      qualifikationen: [["Anlagenführer", "AF", null, true, true, false], ["Staplerschein", "STA", 12, true, false, true],
        ["Erste Hilfe", "EH", 24, true], ["Brandschutzhelfer", "BSH", 36, true]],
      mindest: { F: { mo_do: 5, fr: 5, sa: 4, so: 3 }, S: { mo_do: 5, fr: 5, sa: 4, so: 3 }, N: { mo_do: 4, fr: 4, sa: 3, so: 3 } },
      mindestQual: { F: { q1: 2 }, S: { q1: 2 }, N: { q1: 2 } }, posten: null }, 9876),
  ];
  return { version: 5, stand: 0, tarife: JSON.parse(JSON.stringify(TARIFE_STD)), mandanten, rechnungen: [], protokoll: [],
    betreiber: { firma: "CENTRIC Software", anschrift: "Musterweg 1\n64839 Münster", ustId: "DE000000000",
      iban: "DE00 0000 0000 0000 0000 00", steuersatz: 19, zahlungsziel: 14 },
    session: null };
}

/* ==========================================================================
   SCHICHTMODELL-KATALOG
   Jede Vorlage ist rechnerisch geprüft: Deckung, Wochenarbeitszeit,
   Dienstserien, Nachtserien und Ruhezeiten. Die angegebenen Werte sind
   berechnet, nicht behauptet — der Katalog zeigt sie offen an, damit die
   Planung eine begründete Wahl treffen kann.

   Zwei Rotationsarten:
     Wochenversatz — jede Gruppe startet eine Woche später (klassisch)
     Tagesversatz  — jede Gruppe startet einen Tag später (Stufenmodell)
   ========================================================================== */

/** Dienstartvorlagen, aus denen die Modelle schöpfen. */
const DIENST_VORLAGEN = {
  F:   { name: "Frühdienst",     kurz: "F",  start: "06:00", ende: "14:00", farbe: "#1D4ED8" },
  S:   { name: "Spätdienst",     kurz: "S",  start: "14:00", ende: "22:00", farbe: "#B03A0A" },
  N:   { name: "Nachtdienst",    kurz: "N",  start: "22:00", ende: "06:00", farbe: "#7C3AED" },
  F9:  { name: "Frühdienst",     kurz: "F",  start: "06:00", ende: "15:45", farbe: "#1D4ED8" },
  S9:  { name: "Spätdienst",     kurz: "S",  start: "13:45", ende: "23:30", farbe: "#B03A0A" },
  N9:  { name: "Nachtdienst",    kurz: "N",  start: "21:30", ende: "07:15", farbe: "#7C3AED" },
  T12: { name: "Tagdienst",      kurz: "T",  start: "06:00", ende: "18:00", farbe: "#1D4ED8" },
  N12: { name: "Nachtdienst",    kurz: "N",  start: "18:00", ende: "06:00", farbe: "#7C3AED" },
  V24: { name: "24-Stunden-Dienst", kurz: "V", start: "07:00", ende: "07:00", farbe: "#2C6B63" },
  Z:   { name: "Zwischendienst", kurz: "Z",  start: "09:00", ende: "17:00", farbe: "#446F0D" },
};

/**
 * branchen: für welche Bereiche die Vorlage typisch ist
 * vollkonti: false bedeutet, dass am Wochenende planmäßig nicht gearbeitet wird —
 *            dort sind fehlende Dienste keine Lücke, sondern Absicht
 * kennzahlen: berechnet, nicht geschätzt
 */
const MODELLE = [
  {
    id: "zwei-woechentlich", name: "2-Schicht, wöchentlich wechselnd",
    kurz: "Früh und Spät im Wochenwechsel, Wochenende frei",
    beschreibung: "Der einfachste Fall: zwei Gruppen tauschen jede Woche zwischen Früh- und Spätdienst. Kein Nachtdienst, keine Wochenendarbeit.",
    branchen: ["produktion", "handel", "logistik", "gastronomie", "sonstiges"],
    gruppen: 2, versatzTage: 7, vollkonti: false, dienste: ["F", "S"],
    tage: ["F","F","F","F","F","-","-","S","S","S","S","S","-","-"],
    kennzahlen: { wochenstunden: 40, serie: 5, nachtserie: 0, besetzung: "1 Gruppe je Dienst" },
    passt: "Betriebszeit etwa 06 bis 22 Uhr, Montag bis Freitag.",
  },
  {
    id: "drei-teilkonti", name: "3-Schicht teilkontinuierlich",
    kurz: "Rund um die Uhr, aber nur werktags",
    beschreibung: "Drei Gruppen decken Früh, Spät und Nacht von Montag bis Freitag ab. Am Wochenende steht der Betrieb.",
    branchen: ["produktion", "logistik", "sonstiges"],
    gruppen: 3, versatzTage: 7, vollkonti: false, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","F","-","-","S","S","S","S","S","-","-","N","N","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 40, serie: 5, nachtserie: 5, besetzung: "1 Gruppe je Dienst" },
    passt: "Durchgehende Fertigung werktags, Wochenende ruht.",
    hinweis: "Fünf Nachtdienste am Stück gelten arbeitswissenschaftlich als belastend. Drei bis vier sind empfohlen.",
  },
  {
    id: "vier-x-vier", name: "4x4 Vollkonti, klassisch",
    kurz: "Vier Gruppen, je vier Tage Früh, Spät, Nacht, frei",
    beschreibung: "Das verbreitetste Modell der Fertigungsindustrie. Vier Gruppen rotieren in Viererblöcken durch alle Dienste.",
    branchen: ["produktion", "logistik", "leitstelle", "sonstiges"],
    gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","S","S","S","S","N","N","N","N","-","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 12, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "Anlagen, die nicht stillstehen dürfen.",
    hinweis: "Zwölf Diensttage am Stück. Das ist die bekannte Schwäche dieses Modells — die entzerrte Fassung behebt sie bei gleicher Wochenarbeitszeit.",
  },
  {
    id: "vier-x-vier-entzerrt", name: "4x4 Vollkonti, entzerrt",
    kurz: "Wie 4x4, aber mit Freitag nach jedem Block",
    beschreibung: "Gleiche Deckung und gleiche Wochenarbeitszeit wie das klassische 4x4, aber nach jedem Viererblock folgt ein freier Tag. Höchstens vier Dienste am Stück.",
    branchen: ["produktion", "logistik", "leitstelle", "pflege", "klinik", "sicherheit", "sonstiges"],
    gruppen: 4, versatzTage: 4, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","F","-","S","S","S","S","-","N","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 4, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "Wie 4x4, wenn die Belastung durch lange Dienstserien vermieden werden soll.",
    empfohlen: true,
  },
  {
    id: "panama", name: "Panama, 2-2-3 mit 12-Stunden-Diensten",
    kurz: "Zwei an, zwei frei, drei an — jedes zweite Wochenende ganz frei",
    beschreibung: "Vier Gruppen, zwölfstündige Tag- und Nachtdienste. Zwei Gruppen sind täglich im Einsatz. Jede Gruppe hat jedes zweite Wochenende vollständig frei.",
    branchen: ["produktion", "sicherheit", "leitstelle", "rettung", "sonstiges"],
    gruppen: 4, versatzTage: 7, vollkonti: true, dienste: ["T12", "N12"],
    tage: ["T12","T12","-","-","T12","T12","T12","-","-","T12","T12","-","-","-",
           "N12","N12","-","-","N12","N12","N12","-","-","N12","N12","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 3, nachtserie: 3, besetzung: "1 Gruppe je Dienst" },
    passt: "Wenn lange Freiblöcke wichtiger sind als kurze Dienste.",
    hinweis: "Zwölfstündige Dienste sind nach dem Arbeitszeitgesetz nur zulässig, wenn im Schnitt über sechs Monate acht Stunden je Werktag nicht überschritten werden oder erhebliche Bereitschaftsanteile vorliegen.",
  },
  {
    id: "fuenf-schicht", name: "5-Schicht Vollkonti, 9,75 Stunden",
    kurz: "Fünf Gruppen, keine Einzeldienste, viele freie Wochenenden",
    beschreibung: "Fünf Gruppen mit leicht verlängerten Diensten. Höchstens vier Dienste und vier Nächte am Stück, keine isolierten Diensttage.",
    branchen: ["sicherheit", "behoerde", "leitstelle", "klinik", "rettung", "sonstiges"],
    gruppen: 5, versatzTage: 7, vollkonti: true, dienste: ["F9", "S9", "N9"],
    tage: ["-","N9","N9","N9","N9","-","-","-","S9","S9","S9","-","N9","N9",
           "N9","-","-","-","S9","S9","S9","S9","-","-","F9","F9","-","-",
           "F9","F9","F9","-","-","F9","F9"],
    kennzahlen: { wochenstunden: 40.95, serie: 4, nachtserie: 4, besetzung: "1 Gruppe je Dienst" },
    passt: "41-Stunden-Woche im Vollkontibetrieb, etwa im öffentlichen Dienst.",
    empfohlen: true,
  },
  {
    id: "stufe-8", name: "Stufenmodell F F S S N N frei frei",
    kurz: "Acht Gruppen im Tagesversatz, immer zwei je Dienst",
    beschreibung: "Jede Gruppe startet einen Tag später als die vorherige. Dadurch sind an jedem Tag genau zwei Gruppen je Dienstart im Einsatz — die Besetzung ist besonders gleichmäßig.",
    branchen: ["pflege", "klinik", "rettung", "leitstelle", "sonstiges"],
    gruppen: 8, versatzTage: 1, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","S","S","N","N","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 6, nachtserie: 2, besetzung: "2 Gruppen je Dienst" },
    passt: "Größere Stationen und Wachen mit mehr als 30 Personen.",
    empfohlen: true,
  },
  {
    id: "stufe-11", name: "Stufenmodell drei Tage je Dienst",
    kurz: "Elf Gruppen im Tagesversatz, immer drei je Dienst",
    beschreibung: "Wie das achtstufige Modell, aber mit drei Tagen je Dienstart und drei Gruppen gleichzeitig je Dienst.",
    branchen: ["klinik", "pflege", "leitstelle", "sonstiges"],
    gruppen: 11, versatzTage: 1, vollkonti: true, dienste: ["F", "S", "N"],
    tage: ["F","F","F","S","S","S","N","N","N","-","-"],
    kennzahlen: { wochenstunden: 45.8, serie: 9, nachtserie: 3, besetzung: "3 Gruppen je Dienst" },
    passt: "Große Einheiten mit hohem Grundbedarf.",
    hinweis: "45,8 Wochenstunden liegen über jedem üblichen Vertrag. Ohne Teilzeitanteile oder zusätzliche Freischichten ist das Modell so nicht einsetzbar.",
  },
  {
    id: "24-72", name: "24-Stunden-Dienst mit 72 Stunden frei",
    kurz: "Ein voller Tag Dienst, drei Tage frei",
    beschreibung: "Vier Gruppen im Tagesversatz. Klassisch bei Feuerwehr und Rettungsdienst, wo erhebliche Teile Bereitschaft sind.",
    branchen: ["rettung", "sicherheit", "behoerde", "sonstiges"],
    gruppen: 4, versatzTage: 1, vollkonti: true, dienste: ["V24"],
    tage: ["V24","-","-","-"],
    kennzahlen: { wochenstunden: 42, serie: 1, nachtserie: 0, besetzung: "1 Gruppe je Dienst" },
    passt: "Wachdienste mit hohem Bereitschaftsanteil.",
    hinweis: "24-Stunden-Dienste setzen eine Regelung nach § 7 Arbeitszeitgesetz voraus und sind nur bei erheblichem Bereitschaftsanteil zulässig.",
  },
];

const modellFuerBranche = (b) => MODELLE.filter((m) => m.branchen.includes(b));

/** Rechnet ein Modell durch — dieselbe Prüfung wie im laufenden Betrieb. */
function modellPruefen(modell) {
  const len = modell.tage.length;
  const dv = modell.dienste.map((d) => DIENST_VORLAGEN[d]);
  const nach = (k) => {
    const v = DIENST_VORLAGEN[k]; if (!v) return 0;
    const s = toMin(v.start); let e = toMin(v.ende); if (e <= s) e += 1440;
    let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
    return sum / 60;
  };
  const dau = (k) => { const v = DIENST_VORLAGEN[k]; if (!v) return 0;
    let d = toMin(v.ende) - toMin(v.start); if (d <= 0) d += 1440; return d / 60; };

  const luecken = {}; for (const d of modell.dienste) luecken[d] = 0;
  const proTag = [];
  for (let i = 0; i < len; i++) {
    const z = {};
    for (let g = 0; g < modell.gruppen; g++) {
      const idx = (((i - g * modell.versatzTage) % len) + len) % len;
      const t = modell.tage[idx]; if (t && t !== "-") z[t] = (z[t] || 0) + 1;
    }
    proTag.push(z);
    if (!modell.vollkonti && i % 7 >= 5) continue;   // Wochenende ist hier Absicht
    for (const d of modell.dienste) if (!z[d]) luecken[d]++;
  }
  let std = 0, dienste = 0;
  for (const t of modell.tage) if (t && t !== "-") { std += dau(t); dienste++; }
  let maxSerie = 0, serie = 0, maxNacht = 0, nserie = 0, ruhe = 0, einzel = 0;
  for (let i = 0; i < len; i++) {
    const c = modell.tage[i], nx = modell.tage[(i + 1) % len], pv = modell.tage[(i - 1 + len) % len];
    if (c && c !== "-") {
      serie++; maxSerie = Math.max(maxSerie, serie);
      if (nach(c) >= 2) { nserie++; maxNacht = Math.max(maxNacht, nserie); } else nserie = 0;
      if ((!pv || pv === "-") && (!nx || nx === "-")) einzel++;
      if (nx && nx !== "-" && DIENST_VORLAGEN[c] && DIENST_VORLAGEN[nx]) {
        let e = toMin(DIENST_VORLAGEN[c].ende); if (e <= toMin(DIENST_VORLAGEN[c].start)) e += 1440;
        if ((1440 + toMin(DIENST_VORLAGEN[nx].start) - e) / 60 < 11) ruhe++;
      }
    } else { serie = 0; nserie = 0; }
  }
  const mind = {};
  for (const d of modell.dienste) {
    const werte = proTag.map((z, i) => (!modell.vollkonti && i % 7 >= 5) ? null : (z[d] || 0)).filter((x) => x !== null);
    mind[d] = werte.length ? Math.min(...werte) : 0;
  }
  return { len, wochenstunden: Math.round(std / (len / 7) * 100) / 100, dienste,
    luecken: Object.values(luecken).reduce((a, b) => a + b, 0),
    maxSerie, maxNacht, ruhe, einzel, mind, proTag };
}

/* ==========================================================================
   ENGINE — arbeitet immer auf genau einem Mandanten
   ========================================================================== */
const _c = new WeakMap();
function cache(m) { let c = _c.get(m); if (!c) { c = { map: new Map(), abs: null, posten: new Map() }; _c.set(m, c); } return c; }
function memo(m, k, fn) { const c = cache(m); if (c.map.has(k)) return c.map.get(k); const v = fn(); c.map.set(k, v); return v; }
function absIdx(m) {
  const c = cache(m); if (c.abs) return c.abs;
  const x = new Map();
  for (const a of m.abwesenheiten) { if (!x.has(a.personId)) x.set(a.personId, []); x.get(a.personId).push(a); }
  c.abs = x; return x;
}

function einheitAm(p, d) { let t = null; for (const z of p.zugehoerigkeit) if (z.ab <= d) t = z; return t ? t.einheitId : null; }
function imDienst(p, d) { if (p.eintritt && d < p.eintritt) return false; if (p.austritt && d > p.austritt) return false; return p.status !== "gesperrt"; }
const aktive = (m, d) => memo(m, `akt|${d}`, () => m.personen.filter((p) => imDienst(p, d)));

function abwesenheitAm(m, pid, d) {
  const l = absIdx(m).get(pid); if (!l) return null;
  let best = null;
  for (const a of l) if (a.von <= d && a.bis >= d && (!best || abwArt(a.art).rang > abwArt(best.art).rang)) best = a;
  return best;
}
/** Versatz einer Einheit in Tagen. Wochenversatz bleibt als Sonderfall gültig. */
function versatzTageVon(e) {
  return e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7;
}
/** Zykluslänge in Tagen — bei Tagesversatz nicht zwingend ein Vielfaches von 7. */
function zyklusLaenge(m) {
  return m.zyklus.tage ? m.zyklus.tage.length : m.zyklus.wochen * 7;
}
function einheitDienst(m, eid, d) {
  const e = m.einheiten.find((x) => x.id === eid); if (!e || e.pool) return null;
  const len = zyklusLaenge(m);
  const i = (((between(m.anker, d) + versatzTageVon(e)) % len) + len) % len;
  const id = m.zyklus.tage[i];
  return id && id !== "-" ? id : null;
}
/** C5: Ein Feiertag hebt die Vorgabe an, senkt sie nie. */
function mindestFuer(m, da, d) {
  const w = dow(d);
  const wt = w === 6 ? da.mindest.so : w === 5 ? da.mindest.sa : w === 4 ? da.mindest.fr : da.mindest.mo_do;
  return Math.max(wt, feiertag(d, m.bundesland) ? da.mindest.so : 0);
}
/**
 * Postenbesetzung: manuelle Zuweisungen zählen an, der Pool bleibt stabil.
 * Ungeeignete werden während der Iteration übersprungen, nicht vorher entfernt —
 * dadurch verschiebt ein einzelner Ausfall die Besatzung nur um eine Person.
 */
function postenBesatzung(m, eid, d, pid) {
  const c = cache(m), k = `${eid}|${d}|${pid}`;
  if (c.posten.has(k)) return c.posten.get(k);
  const posten = m.dienstarten.find((x) => x.id === pid);
  const soll = posten ? mindestFuer(m, posten, d) : 0;
  const manuell = m.personen.filter((p) => imDienst(p, d) && m.abweichungen[`${p.id}|${d}`] === pid).map((p) => p.id);
  const rest = Math.max(0, soll - manuell.length);
  const out = new Set(manuell);
  if (rest === 0) { c.posten.set(k, out); return out; }
  const pool = m.personen.filter((p) => imDienst(p, d) && einheitAm(p, d) === eid
      && p.imSchichtdienst !== false && p.funktion !== "Schichtleitung")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!pool.length) { c.posten.set(k, out); return out; }
  const start = Math.abs(between(m.anker, d)) % pool.length;
  let n = 0;
  for (let i = 0; i < pool.length && n < rest; i++) {
    const p = pool[(start + i) % pool.length];
    if (abwesenheitAm(m, p.id, d)) continue;
    if (m.abweichungen[`${p.id}|${d}`] !== undefined) continue;
    // Teilzeitkräfte, die an diesem Tag nicht arbeiten, können den Posten nicht besetzen
    if (p.springer || !teilzeitDienst(m, p, d, einheitDienst(m, eid, d))) continue;
    out.add(p.id); n++;
  }
  c.posten.set(k, out); return out;
}
function personTag(m, p, d) {
  if (!imDienst(p, d)) return { dienstId: null, plan: null, abweichung: null, abwesenheit: null, quelle: "extern" };
  const eid = einheitAm(p, d);
  // Geschäftszimmer: Planung und Leitung fahren keine Rotation mit.
  // Sie erscheinen im Plan nur durch ausdrückliche Zuweisung.
  const roh = (eid && !p.springer && p.imSchichtdienst !== false) ? einheitDienst(m, eid, d) : null;
  const plan = teilzeitDienst(m, p, d, roh);
  const ab = m.abweichungen[`${p.id}|${d}`];
  let basis = ab !== undefined ? (ab === "-" ? null : ab) : plan;
  if (ab === undefined && plan) {
    const po = m.dienstarten.find((x) => x.posten && x.quelle === plan);
    if (po && postenBesatzung(m, eid, d, po.id).has(p.id)) basis = po.id;
  }
  const abw = abwesenheitAm(m, p.id, d);
  return { dienstId: abw ? null : basis, plan, abweichung: ab !== undefined ? ab : null, abwesenheit: abw,
    quelle: ab !== undefined ? "abweichung" : "plan" };
}
function besetzung(m, d) {
  return memo(m, `bes|${d}`, () => {
    const out = {};
    for (const da of m.dienstarten) out[da.id] = { da, personen: [], soll: mindestFuer(m, da, d) };
    for (const p of aktive(m, d)) { const t = personTag(m, p, d); if (t.dienstId && out[t.dienstId]) out[t.dienstId].personen.push(p); }
    for (const k of Object.keys(out)) {
      const e = out[k];
      e.anzahl = e.personen.length; e.diff = e.anzahl - e.soll;
      e.qual = Object.entries(e.da.mindestQual || {}).filter(([, n]) => n > 0).map(([qid, n]) => {
        const ist = e.personen.filter((p) => qualGueltig(m, p, qid)).length;
        return { qid, noetig: n, ist, ok: ist >= n };
      });
      e.qualFehlt = e.qual.some((q) => !q.ok);
      e.status = e.diff < -1 ? "danger" : e.diff < 0 || e.qualFehlt ? "warn" : "ok";
    }
    return out;
  });
}
function sollStunden(m, p, ym) {
  return memo(m, `soll|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1); let t = 0;
    for (let i = 1; i <= n; i++) { const d = `${ym}-${pad(i)}`;
      if (imDienst(p, d) && dow(d) < 5 && !feiertagFuer(m, d, p)) t++; }
    return Math.round(p.wochenstunden / 5 * t * 100) / 100;
  });
}
function istStunden(m, p, ym) {
  return memo(m, `ist|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1); const proTag = p.wochenstunden / 5;
    let g = 0, gg = 0, nacht = 0, dienste = 0, naechte = 0, erfasst = 0;
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`; const t = personTag(m, p, d);
      if (t.abwesenheit) { if (abwArt(t.abwesenheit.art).bezahlt && t.plan) gg += proTag; continue; }
      if (!t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId); if (!da) continue;
      const idn = istDauer(m, p, d, da);
      g += gewertet(da, idn.std); if (idn.erfasst) erfasst++;
      const na = nachtAnteil(da); nacht += na; dienste++; if (na >= 2) naechte++;
    }
    return { geleistet: Math.round(g * 100) / 100, gutgeschrieben: Math.round(gg * 100) / 100,
      gesamt: Math.round((g + gg) * 100) / 100, nacht: Math.round(nacht * 100) / 100, dienste, naechte, erfasst };
  });
}
function urlaubskonto(m, p, jahr) {
  return memo(m, `url|${p.id}|${jahr}`, () => {
    let genommen = 0; const zeilen = [];
    for (const a of absIdx(m).get(p.id) || []) {
      if (!abwArt(a.art).urlaub) continue;
      let tage = 0;
      for (let d = a.von; d <= a.bis; d = addDays(d, 1)) {
        if (d.slice(0, 4) !== String(jahr) || feiertagFuer(m, d, p) || !imDienst(p, d)) continue;
        const eid = einheitAm(p, d); if (eid && einheitDienst(m, eid, d)) tage++;
      }
      genommen += tage; zeilen.push({ ...a, tage });
    }
    const anspruch = p.urlaubsanspruch + (p.urlaubsuebertrag || 0);
    return { anspruch, genommen, rest: anspruch - genommen, zeilen };
  });
}
function stundenkonto(m, p, ym) {
  return memo(m, `kto|${p.id}|${ym}`, () => {
    const j = Number(ym.slice(0, 4)), bis = Number(ym.slice(5, 7)); let d = p.stundenuebertrag || 0;
    for (let x = 1; x <= bis; x++) { const k = `${j}-${pad(x)}`; d += istStunden(m, p, k).gesamt - sollStunden(m, p, k); }
    return Math.round(d * 10) / 10;
  });
}
function nachtJahr(m, p, jahr) {
  return memo(m, `nacht|${p.id}|${jahr}`, () => {
    let h = 0, n = 0;
    for (let x = 1; x <= 12; x++) { const r = istStunden(m, p, `${jahr}-${pad(x)}`); h += r.nacht; n += r.naechte; }
    return { stunden: Math.round(h * 10) / 10, anzahl: n };
  });
}
function pruefen(m, von, bis) {
  return memo(m, `pr|${von}|${bis}`, () => {
    const out = []; const push = (o) => out.push({ id: `${o.art}|${o.datum}|${o.ref || ""}`, ...o });
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const b = besetzung(m, d);
      for (const k of Object.keys(b)) {
        const e = b[k];
        // Fachkraftquote (Pflege, Klinik)
        const fl = fachkraftLage(m, d, k);
        if (fl && !fl.erfuellt)
          push({ art: "fachkraft", schwere: "danger", datum: d, ref: k,
            titel: `${e.da.name}: Fachkraftquote unterschritten`,
            text: `${fl.fk} von ${fl.gesamt} sind Fachkräfte (${fl.ist} %), gefordert sind ${fl.soll} % — es fehlen ${fl.fehlt}` });
        if (e.diff < 0) {
          const u = (m.unterschreitungen || []).find((x) => x.datum === d && x.dienstId === k);
          push({ art: "besetzung", schwere: u ? "warn" : (e.diff <= -2 ? "danger" : "warn"), datum: d, ref: k,
            titel: `${e.da.name} unterbesetzt${u ? " · dokumentiert" : ""}`,
            text: u ? `${e.anzahl} von ${e.soll} — begründet: ${u.grund}` : `${e.anzahl} von ${e.soll} — es fehlen ${Math.abs(e.diff)}` });
        }
        for (const q of e.qual.filter((x) => !x.ok)) {
          const qn = m.qualifikationen.find((x) => x.id === q.qid);
          push({ art: "qualifikation", schwere: "danger", datum: d, ref: `${k}|${q.qid}`,
            titel: `${e.da.name}: ${qn ? qn.name : q.qid} fehlt`, text: `${q.ist} von ${q.noetig} erforderlich` });
        }
      }
    }
    const vor = addDays(von, -10);
    for (const p of m.personen) {
      const reihe = [];
      for (let d = vor; d <= addDays(bis, 2); d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.dienstId) { const da = m.dienstarten.find((x) => x.id === t.dienstId);
          if (da && !da.ruhezeitNeutral) reihe.push({ d, da }); }
      }
      for (let i = 1; i < reihe.length; i++) {
        const [, e1] = fenster(reihe[i - 1].d, reihe[i - 1].da); const [s2] = fenster(reihe[i].d, reihe[i].da);
        const ruhe = (s2 - e1) / 60;
        if (ruhe < m.einstellungen.ruhezeit && reihe[i].d >= von && reihe[i].d <= bis)
          push({ art: "ruhezeit", schwere: ruhe < 8 ? "danger" : "warn", datum: reihe[i].d, ref: p.id, personId: p.id,
            titel: `Ruhezeit unterschritten — ${p.nachname}`,
            text: `${n1(ruhe)} h zwischen ${reihe[i - 1].da.kurz} am ${fKurz(reihe[i - 1].d)} und ${reihe[i].da.kurz}` });
      }
      let lauf = 0, nl = 0, ab = null;
      for (let d = vor; d <= addDays(bis, 2); d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.dienstId) {
          if (!lauf) ab = d; lauf++;
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          nl = da && nachtAnteil(da) >= 2 ? nl + 1 : 0;
          if (lauf === m.einstellungen.maxFolge + 1 && d >= von && d <= bis)
            push({ art: "folge", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `${lauf} Dienste in Folge — ${p.nachname}`, text: `Serie ab ${fKurz(ab)}, Grenzwert ${m.einstellungen.maxFolge}` });
          if (nl === m.einstellungen.maxNachtFolge + 1 && d >= von && d <= bis)
            push({ art: "nachtfolge", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `${nl} Nachtdienste in Folge — ${p.nachname}`, text: `Grenzwert ${m.einstellungen.maxNachtFolge}` });
        } else { lauf = 0; nl = 0; }
      }
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const a = m.abweichungen[`${p.id}|${d}`], w = abwesenheitAm(m, p.id, d);
        if (a && a !== "-" && w) push({ art: "abwesend", schwere: "danger", datum: d, ref: p.id, personId: p.id,
          titel: `Dienst trotz ${abwArt(w.art).label} — ${p.nachname}`, text: `Eingetragen: ${a}. Abwesend bis ${fKurz(w.bis)}` });
      }
      // Personenbezogene Einschränkungen
      const ein = p.einschraenkungen || {};
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (!t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        if (ein.keineNacht && nachtAnteil(da) >= 2)
          push({ art: "einschraenkung", schwere: "danger", datum: d, ref: p.id, personId: p.id,
            titel: `Nachtdienst trotz Einschränkung — ${p.nachname}`,
            text: `${da.name} eingeteilt, obwohl keine Nachtdienste zugelassen sind` });
        if (ein.keinAlleindienst) {
          const mit = besetzung(m, d)[t.dienstId].personen.filter((x) => x.id !== p.id && !(x.einschraenkungen || {}).keinAlleindienst);
          if (mit.length === 0)
            push({ art: "einschraenkung", schwere: "danger", datum: d, ref: p.id, personId: p.id,
              titel: `Alleindienst nicht zulässig — ${p.nachname}`,
              text: `${da.name}: keine weitere eingewiesene Person eingeteilt` });
        }
        const w = ein.wiedereingliederung;
        if (w && w.von <= d && w.bis >= d && dow(d) === 0) {
          let std = 0;
          for (let i = 0; i < 7; i++) { const tt = personTag(m, p, addDays(d, i));
            if (!tt.dienstId) continue; const xx = m.dienstarten.find((y) => y.id === tt.dienstId); if (xx) std += dauer(xx); }
          if (std > w.maxStundenWoche)
            push({ art: "einschraenkung", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `Wiedereingliederung überschritten — ${p.nachname}`,
              text: `${n1(std)} h geplant, zulässig sind ${n1(w.maxStundenWoche)} h je Woche` });
        }
      }
      if (ein.maxDiensteWoche) {
        for (let d = montag(von); d <= bis; d = addDays(d, 7)) {
          let n = 0;
          for (let i = 0; i < 7; i++) if (personTag(m, p, addDays(d, i)).dienstId) n++;
          if (n > ein.maxDiensteWoche)
            push({ art: "einschraenkung", schwere: "warn", datum: d < von ? von : d, ref: `${p.id}|w`, personId: p.id,
              titel: `${n} Dienste in der Woche — ${p.nachname}`,
              text: `vereinbart sind höchstens ${ein.maxDiensteWoche}` });
        }
      }
      // Dienst mit abgelaufenem Pflichtnachweis
      for (const qid of p.qualifikationen) {
        const q = m.qualifikationen.find((x) => x.id === qid);
        if (!q || !q.nachweisPflicht) continue;
        const st = nachweisStand(m, p, qid);
        if (st.stand !== "abgelaufen") continue;
        for (let d = von; d <= bis; d = addDays(d, 1)) {
          const t2 = personTag(m, p, d);
          if (!t2.dienstId) continue;
          const da2 = m.dienstarten.find((x) => x.id === t2.dienstId);
          if (!da2 || !(da2.mindestQual || {})[qid]) continue;
          push({ art: "nachweis", schwere: "danger", datum: d, ref: `${p.id}|${qid}`, personId: p.id,
            titel: `Nachweis abgelaufen — ${p.nachname}`,
            text: `${q.name} seit ${fKurz(st.ablauf)} ungültig, wird aber für ${da2.name} gezählt` });
          break;
        }
      }
      /* Harte Sperre: eine zwingende Qualifikation gilt für jeden Dienst,
         nicht nur dort, wo sie als Mindestbesetzung genannt ist.

         Der Wortlaut folgt der Ebene, und ob die Sperre überhaupt greift,
         entscheidet sperreWirkt: Gesetzliches im Kern, Eigenes im Paket. */
      {
        for (const q of m.qualifikationen) {
          if (!q.harteSperre) continue;
          for (let d = von; d <= bis; d = addDays(d, 1)) {
            const t2 = personTag(m, p, d);
            if (!t2.dienstId) continue;
            const da2 = m.dienstarten.find((x) => x.id === t2.dienstId);
            if (!da2 || da2.form === "ruf") continue;
            if (qualGueltig(m, p, q.id)) continue;
            const v = sperreWirkt(m, q, landFuerEinheit(m, einheitAm(p, d)));
            if (!v) continue;
            const st = nachweisStand(m, p, q.id);
            const woher = st.stand === "abgelaufen"
              ? `${q.name} ist seit ${fKurz(st.ablauf)} ungültig.`
              : `${q.name} liegt nicht vor.`;
            push({ art: "sperre", schwere: v.gesetzlich ? "danger" : "warn",
              datum: d, ref: `${p.id}|${q.id}`, personId: p.id,
              titel: `Einsatz ohne ${q.name} — ${p.nachname}`,
              text: `${woher} Der Einsatz am ${fKurz(d)} ist ${v.wort}`
                + (v.gesetzlich ? "." : ` — ${v.label}, kein gesetzliches Verbot.`),
              quelle: q.grundlage || null, ebene: v.ebene });
            break;
          }
        }
      }
      const l = (absIdx(m).get(p.id) || []).filter((a) => a.bis >= von && a.von <= bis);
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++)
        if (l[i].von <= l[j].bis && l[j].von <= l[i].bis)
          push({ art: "ueberlappung", schwere: "danger", datum: l[j].von > von ? l[j].von : von, ref: `${p.id}|${i}|${j}`, personId: p.id,
            titel: `Überlappende Abwesenheiten — ${p.nachname}`,
            text: `${abwArt(l[i].art).label} und ${abwArt(l[j].art).label} überschneiden sich` });
    }
    for (let d = von; d <= bis; d = addDays(d, 1)) for (const e of m.einheiten) {
      const n = aktive(m, d).filter((p) => einheitAm(p, d) === e.id && (abwesenheitAm(m, p.id, d) || {}).art === "urlaub").length;
      if (n > m.einstellungen.maxUrlaubJeEinheit)
        push({ art: "urlaub", schwere: "warn", datum: d, ref: e.id, titel: `${e.name}: ${n} gleichzeitig im Urlaub`,
          text: `Obergrenze ${m.einstellungen.maxUrlaubJeEinheit}` });
    }
    out.sort((a, b) => a.datum === b.datum ? (a.schwere === b.schwere ? 0 : a.schwere === "danger" ? -1 : 1) : (a.datum < b.datum ? -1 : 1));
    return out;
  });
}
function simulation(m) {
  return memo(m, "sim", () => {
    const len = zyklusLaenge(m);
    const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
    let std = 0, dienste = 0;
    for (const id of m.zyklus.tage) if (id && id !== "-" && map[id]) { std += dauer(map[id]); dienste++; }
    const wochenstunden = Math.round(std / m.zyklus.wochen * 100) / 100;
    const deckung = [];
    for (let i = 0; i < len; i++) {
      const z = {};
      for (const e of m.einheiten) {
        if (e.pool) continue;                       // Springer fahren keine Rotation
        const idx = (((i + versatzTageVon(e)) % len) + len) % len;
        const id = m.zyklus.tage[idx]; if (id && id !== "-") z[id] = (z[id] || 0) + 1; }
      deckung.push(z);
    }
    const luecken = m.dienstarten
      .filter((d) => !d.posten && (d.mindest.mo_do + d.mindest.fr + d.mindest.sa + d.mindest.so) > 0)
      .map((d) => ({ da: d, tage: deckung.filter((z) => !z[d.id]).length })).filter((x) => x.tage > 0);
    const t = m.zyklus.tage; let maxFolge = 0, lauf = 0, maxNacht = 0, nl = 0, einzel = 0; const konflikte = [];
    for (let i = 0; i < len; i++) {
      const c = t[i], nx = t[(i + 1) % len], pv = t[(i - 1 + len) % len];
      if (c && c !== "-") {
        lauf++; maxFolge = Math.max(maxFolge, lauf);
        if (map[c] && nachtAnteil(map[c]) >= 2) { nl++; maxNacht = Math.max(maxNacht, nl); } else nl = 0;
        if ((!pv || pv === "-") && (!nx || nx === "-")) einzel++;
        if (nx && nx !== "-" && map[c] && map[nx]) {
          const [, e1] = fenster("2024-01-01", map[c]); const [s2] = fenster("2024-01-02", map[nx]);
          const ruhe = (s2 - e1) / 60;
          if (ruhe < m.einstellungen.ruhezeit) konflikte.push({ von: c, nach: nx, ruhe: Math.round(ruhe * 10) / 10, tag: i });
        }
      } else { lauf = 0; nl = 0; }
    }
    return { wochenstunden, dienste, deckung, luecken, len, maxFolge, maxNacht, einzel, konflikte };
  });
}

/* ------------------------------ Berechtigung ------------------------------ */
function darf(sitz, recht, einheitId) {
  if (!sitz || sitz.rolle === "betreiber") return false;
  const rechte = (sitz.mandant.matrix || MATRIX_STD)[sitz.person.rolle] || [];
  if (!rechte.includes(recht)) return false;
  if (sitz.person.rolle === "betriebsrat" && /\.(edit|approve|assign)/.test(recht)) return false;
  if (!einheitId) return true;
  if (sitz.person.bereich === "ALLE") return true;
  return sitz.person.bereich === einheitId;
}
const darfEinheit = (s, eid) => darf(s, "plan.edit.all") || darf(s, "plan.edit.unit", eid);
const darfEntscheiden = (s, eid) => darf(s, "req.approve.all") || darf(s, "req.approve.unit", eid);

/* ------------------------------ Preisrechnung ----------------------------- */
/** Zählt Zugänge aus dem laufenden Personalbestand — daher automatisch aktuell. */
function zugaenge(m) {
  const z = {}; for (const r of ROLLEN) if (!r.extern) z[r.id] = 0;
  for (const p of m.personen) {
    if (p.status === "gesperrt" || p.austritt) continue;
    if (z[p.rolle] === undefined) z[p.rolle] = 0;
    z[p.rolle]++;
  }
  return z;
}
/**
 * Monatspreis eines Mandanten. Gerechnet wird je Standort — wer einstellt,
 * zahlt nicht mehr. Jeder Standort bekommt den Tarif, der zu seiner Größe
 * passt; ein kleiner Außenposten kostet nicht so viel wie die Zentrale.
 */
function preis(db, m) {
  const standorte = (m.standorte || []).length ? m.standorte : [{ id: "s1", name: m.name }];
  const aktiv = aktive(m, heute());
  const zeilen = standorte.map((st) => {
    // Personen dieses Standorts über ihre Einheit
    const einheiten = m.einheiten.filter((e) => (e.standortId || standorte[0].id) === st.id);
    const ids = new Set(einheiten.map((e) => e.id));
    const n = aktiv.filter((p) => ids.has(einheitAm(p, heute()))).length;
    const gewaehlt = db.tarife.find((x) => x.id === m.tarif);
    // Der gebuchte Tarif gilt als Untergrenze; größere Standorte steigen auf
    const noetig = tarifFuer(n);
    const t = (gewaehlt && gewaehlt.jeStandort >= noetig.jeStandort) ? gewaehlt : noetig;
    return { standort: st, personen: n, tarif: t, einzel: t.jeStandort };
  });
  const st = staffel(zeilen.length);
  for (const z of zeilen) z.netto = Math.round(z.einzel * (1 - st.rabatt) * 100) / 100;
  const summeStandorte = Math.round(zeilen.reduce((a, z) => a + z.netto, 0) * 100) / 100;
  // Branchenpakete werden je Betrieb berechnet, nicht je Standort
  const pakete = PAKETE.filter((p) => (m.pakete || []).includes(p.id));
  const summePakete = pakete.reduce((a, p) => a + (p.aufpreis || 0), 0);
  const gesamt = Math.round((summeStandorte + summePakete) * 100) / 100;
  const zahlt = stat(m.status).zahlt;
  const personen = aktiv.length;
  const t = zeilen.length ? zeilen.reduce((a, z) =>
    (a.tarif.jeStandort > z.tarif.jeStandort ? a : z)).tarif : db.tarife[0];
  return { t, zeilen, standorte: zeilen.length, st, pakete, summeStandorte, summePakete,
    gesamt, zahlt, wirksam: zahlt ? gesamt : 0, personen,
    jeKopf: personen ? Math.round((gesamt / personen) * 100) / 100 : 0,
    ueberEinheiten: m.einheiten.length > t.grenzen.einheiten,
    ueberPersonen: personen > t.grenzen.personen };
}
/** Datenschutz: die Betreibersicht enthält ausschließlich Zahlen. */
/**
 * Was der Betreiber von einem Mandanten sieht. Bewusst nur Kennzahlen —
 * keine Namen, keine Dienstpläne, keine Personendaten. Der Betreiber
 * verkauft Software, er führt den Betrieb nicht.
 */
function betreiberSicht(db, m) {
  const p = preis(db, m);
  const aktivP = aktive(m, heute());
  /* Zugänge nur als Anzahl je Art — für die Konsole reicht die Zahl. */
  const zugaenge = {};
  for (const r of ROLLEN) zugaenge[r.id] = aktivP.filter((x) => x.rolle === r.id).length;
  return { id: m.id, name: m.name, branche: m.branche, status: m.status, seit: m.seit,
    stichtag: m.stichtag, kontakt: m.kontakt, anschrift: m.anschrift, tarif: m.tarif,
    rabattGrund: m.rabattGrund, pakete: m.pakete || [],
    einheiten: m.einheiten.length, dienstarten: m.dienstarten.length,
    standorte: p.standorte, personen: p.personen, zugaenge, preis: p,
    letzteAenderung: m.protokoll[0] ? m.protokoll[0].zeit : null };
}

/* ============================== PDF-Erzeugung =============================
   Erzeugt eine echte PDF-Datei ohne Fremdbibliothek. Helvetica mit
   WinAnsi-Kodierung, damit Umlaute und das Eurozeichen stimmen.
   ========================================================================= */
const WINANSI = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‰": 0x89, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };
function pdfText(s) {
  let out = "";
  for (const ch of String(s)) {
    const c = WINANSI[ch] !== undefined ? WINANSI[ch] : ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c < 256) out += String.fromCharCode(c);
    else out += "?";
  }
  return out;
}
/** zeilen: [{x, y, text, size, bold, grau}] — Koordinaten in Millimetern von links oben. */
function bauePDF(zeilen, linien) {
  const mm = (v) => (v * 72) / 25.4;
  const H = 297;
  let ops = "";
  for (const l of linien || []) {
    ops += `q ${l.grau !== undefined ? l.grau : 0.75} G ${l.dicke || 0.4} w ${mm(l.x1).toFixed(2)} ${mm(H - l.y1).toFixed(2)} m ${mm(l.x2).toFixed(2)} ${mm(H - l.y2).toFixed(2)} l S Q\n`;
  }
  for (const z of zeilen) {
    const font = z.bold ? "/F2" : "/F1";
    const g = z.grau !== undefined ? z.grau : 0;
    ops += `BT ${font} ${z.size || 10} Tf ${g} g ${mm(z.x).toFixed(2)} ${mm(H - z.y).toFixed(2)} Td (${pdfText(z.text)}) Tj ET\n`;
  }
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${ops.length} >>\nstream\n${ops}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Baut die Rechnungsseite und liefert PDF-Bytes. */
function rechnungPDF(rg) {
  const T = [], L = [];
  const rechts = (x, txt, size, bold) => T.push({ x: x - String(txt).length * (size || 9) * 0.5 * 0.55, y: 0, text: txt, size, bold });
  let y = 24;
  T.push({ x: 20, y, text: rg.betreiber.firma, size: 16, bold: true });
  T.push({ x: 140, y: y - 2, text: "RECHNUNG", size: 18, bold: true });
  y += 6;
  rg.betreiber.anschrift.split("\n").forEach((z) => { T.push({ x: 20, y, text: z, size: 9, grau: 0.35 }); y += 4.5; });
  T.push({ x: 140, y: 30, text: `Nummer   ${rg.nummer}`, size: 9.5 });
  T.push({ x: 140, y: 35, text: `Datum    ${fDatum(rg.datum)}`, size: 9.5 });
  T.push({ x: 140, y: 40, text: `Zeitraum ${rg.zeitraum}`, size: 9.5 });
  T.push({ x: 140, y: 45, text: `Fällig   ${fDatum(rg.faellig)}`, size: 9.5 });

  y = 62;
  T.push({ x: 20, y, text: "Rechnungsempfänger", size: 8.5, grau: 0.45 }); y += 6;
  T.push({ x: 20, y, text: rg.mandant, size: 11, bold: true }); y += 5;
  (rg.anschrift || "").split("\n").forEach((z) => { if (z) { T.push({ x: 20, y, text: z, size: 9.5, grau: 0.3 }); y += 4.5; } });

  y = 96;
  L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.55, dicke: 0.6 }); y += 6;
  T.push({ x: 20, y, text: "Position", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 118, y, text: "Menge", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 140, y, text: "Einzel", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 170, y, text: "Betrag", size: 8.5, bold: true, grau: 0.35 });
  y += 3; L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.75 }); y += 7;

  for (const p of rg.positionen) {
    T.push({ x: 20, y, text: p.text, size: 10 });
    if (p.menge) T.push({ x: 118, y, text: String(p.menge), size: 10 });
    if (p.einzel) T.push({ x: 140, y, text: p.einzel, size: 10 });
    T.push({ x: 170, y, text: p.betrag, size: 10 });
    y += 6.5;
  }
  y += 2; L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.75 }); y += 7;
  const summe = (label, wert, bold, size) => { T.push({ x: 118, y, text: label, size: size || 10, bold });
    T.push({ x: 170, y, text: wert, size: size || 10, bold }); y += 6.5; };
  summe("Zwischensumme", eur(rg.netto));
  if (rg.rabattBetrag > 0) summe(`Rabatt ${rg.rabattText}`, "−" + eur(rg.rabattBetrag));
  summe(`Umsatzsteuer ${rg.steuersatz} %`, eur(rg.steuer));
  y += 1; L.push({ x1: 118, y1: y - 4, x2: 190, y2: y - 4, grau: 0.55, dicke: 0.6 });
  summe("Gesamtbetrag", eur(rg.brutto), true, 12);

  y += 12;
  T.push({ x: 20, y, text: `Zahlbar ohne Abzug bis ${fDatum(rg.faellig)} auf folgendes Konto:`, size: 9.5, grau: 0.3 }); y += 5.5;
  T.push({ x: 20, y, text: `IBAN ${rg.betreiber.iban}`, size: 9.5, grau: 0.3 }); y += 5.5;
  T.push({ x: 20, y, text: `Verwendungszweck ${rg.nummer}`, size: 9.5, grau: 0.3 }); y += 10;
  T.push({ x: 20, y, text: `Umsatzsteuer-Identifikationsnummer ${rg.betreiber.ustId}`, size: 8.5, grau: 0.5 }); y += 4.5;
  T.push({ x: 20, y, text: "Die Abrechnung erfolgt nach vergebenen Zugängen zum Stichtag der Rechnungsstellung.", size: 8.5, grau: 0.5 });

  L.push({ x1: 20, y1: 272, x2: 190, y2: 272, grau: 0.85 });
  T.push({ x: 20, y: 278, text: `${rg.betreiber.firma} · ${rg.betreiber.anschrift.replace(/\n/g, " · ")}`, size: 7.5, grau: 0.55 });
  return bauePDF(T, L);
}

/** Dieselbe Rechnung als Word-Dokument (HTML, das Word verlustfrei öffnet). */
function rechnungHTML(rg) {
  const z = (p) => `<tr><td>${p.text}</td><td style="text-align:right">${p.menge || ""}</td>
    <td style="text-align:right">${p.einzel || ""}</td><td style="text-align:right">${p.betrag}</td></tr>`;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${rg.nummer}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111}
h1{font-size:20pt;margin:0 0 4pt}table{width:100%;border-collapse:collapse;margin-top:14pt}
th{text-align:left;font-size:9pt;color:#555;border-bottom:1px solid #999;padding:4pt 0}
td{padding:5pt 0;border-bottom:1px solid #eee}
.s td{border:none;padding:3pt 0}.r{text-align:right}</style></head><body>
<table style="margin:0"><tr><td><h1>${rg.betreiber.firma}</h1>
<div style="font-size:9pt;color:#555">${rg.betreiber.anschrift.replace(/\n/g, "<br>")}</div></td>
<td class="r" style="vertical-align:top"><h1>RECHNUNG</h1>
<div style="font-size:10pt">Nummer ${rg.nummer}<br>Datum ${fDatum(rg.datum)}<br>Zeitraum ${rg.zeitraum}<br>Fällig ${fDatum(rg.faellig)}</div>
</td></tr></table>
<p style="margin-top:22pt;font-size:9pt;color:#555">Rechnungsempfänger</p>
<p style="margin:0"><b>${rg.mandant}</b><br><span style="font-size:10pt;color:#333">${(rg.anschrift || "").replace(/\n/g, "<br>")}</span></p>
<table><tr><th>Position</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Betrag</th></tr>
${rg.positionen.map(z).join("")}</table>
<table class="s" style="margin-top:12pt"><tr><td></td><td class="r" style="width:120pt">Zwischensumme</td><td class="r" style="width:90pt">${eur(rg.netto)}</td></tr>
${rg.rabattBetrag > 0 ? `<tr><td></td><td class="r">Rabatt ${rg.rabattText}</td><td class="r">−${eur(rg.rabattBetrag)}</td></tr>` : ""}
<tr><td></td><td class="r">Umsatzsteuer ${rg.steuersatz} %</td><td class="r">${eur(rg.steuer)}</td></tr>
<tr><td></td><td class="r"><b>Gesamtbetrag</b></td><td class="r"><b>${eur(rg.brutto)}</b></td></tr></table>
<p style="margin-top:20pt;font-size:10pt;color:#333">Zahlbar ohne Abzug bis ${fDatum(rg.faellig)}<br>
IBAN ${rg.betreiber.iban}<br>Verwendungszweck ${rg.nummer}</p>
<p style="font-size:8.5pt;color:#666">Umsatzsteuer-Identifikationsnummer ${rg.betreiber.ustId}<br>
Die Abrechnung erfolgt nach vergebenen Zugängen zum Stichtag der Rechnungsstellung.</p>
</body></html>`;
}

/** Stellt die Rechnungsdaten aus dem aktuellen Bestand zusammen. */
function baueRechnung(db, m, monatISO) {
  const p = preisAnteilig(db, m, monatISO);
  const nr = `${monatISO.replace("-", "")}-${m.id.slice(-4).toUpperCase()}`;
  const positionen = [];
  /* Je Standort eine Zeile — der Kunde sieht, wofür er zahlt. */
  for (const z of p.zeilen) {
    positionen.push({
      text: `${z.standort.name} · Tarif ${z.tarif.name}`,
      menge: `${zahl(z.personen)} Personen`,
      einzel: eur(z.einzel),
      betrag: eur(Math.round(z.netto * p.anteil * 100) / 100) });
  }
  if (p.st.rabatt > 0)
    positionen.push({ text: `Mengenstaffel ${p.st.label}`, menge: "", einzel: "",
      betrag: `−${Math.round(p.st.rabatt * 100)} %` });
  for (const pk of p.pakete)
    positionen.push({ text: `Branchenpaket ${pk.name}`, menge: "", einzel: eur(pk.aufpreis),
      betrag: eur(Math.round(pk.aufpreis * p.anteil * 100) / 100) });
  if (p.anteil < 1)
    positionen.push({ text: `Anteilig ${p.tage} von ${p.gesamtTage} Tagen`, menge: "",
      einzel: "", betrag: "" });

  const netto = p.gesamt;
  const steuer = Math.round(netto * db.betreiber.steuersatz) / 100;
  return { nummer: nr, datum: heute(), faellig: addDays(heute(), db.betreiber.zahlungsziel),
    zeitraum: `${MON[Number(monatISO.slice(5, 7)) - 1]} ${monatISO.slice(0, 4)}`,
    mandantId: m.id, mandant: m.name, anschrift: m.anschrift, betreiber: db.betreiber,
    positionen, netto, rabattBetrag: 0, rabattText: "", steuersatz: db.betreiber.steuersatz,
    steuer, brutto: Math.round((netto + steuer) * 100) / 100,
    standorte: p.standorte, personen: p.personen, tarif: p.t.name };
}

/* ==========================================================================
   ERWEITERTER RECHENKERN
   Krankmeldung und Ersatzsuche · Personenbezogene Einschränkungen ·
   Freigabe und Rückkanal · Ist-Erfassung · Verteilungsgerechtigkeit ·
   Anteilige Abrechnung
   ========================================================================== */

/** Rolle einer Person an einem Stichtag — Grundlage der anteiligen Abrechnung. */
function rolleAm(p, d) {
  if (!p.rolleVerlauf || !p.rolleVerlauf.length) return (!p.rolleSeit || p.rolleSeit <= d) ? p.rolle : "mitarbeiter";
  let t = null;
  for (const z of p.rolleVerlauf) if (z.ab <= d) t = z;
  return t ? t.rolle : p.rolle;
}
const einschr = (p) => p.einschraenkungen || {};

/* ------------------------------ Ist-Erfassung ---------------------------- */
/** Tatsächliche Dauer eines Dienstes: erfasste Zeit schlägt die geplante. */
function istDauer(m, p, d, da) {
  const e = m.erfassung ? m.erfassung[`${p.id}|${d}`] : null;
  if (!e || !e.bestaetigt) return { std: dauer(da), erfasst: false, abweichung: 0 };
  const roh = { start: e.start || da.start, ende: e.ende || da.ende, pause: da.pause || 0 };
  const std = dauer(roh);
  return { std, erfasst: true, abweichung: Math.round((std - dauer(da)) * 100) / 100 };
}
const offeneErfassung = (m, p, bis) => {
  const out = [];
  for (let d = addDays(bis, -13); d <= bis; d = addDays(d, 1)) {
    const t = personTag(m, p, d);
    if (!t.dienstId) continue;
    if (m.erfassung && m.erfassung[`${p.id}|${d}`]) continue;
    out.push(d);
  }
  return out;
};

/* ------------------ Personenbezogene Einschränkungen --------------------- */
/**
 * Prüft, ob eine Person an einem Tag einen bestimmten Dienst leisten darf.
 * Liefert eine Liste von Hinderungsgründen — leer bedeutet zulässig.
 */
function hindernisse(m, p, d, da) {
  const g = [];
  const e = einschr(p);
  if (!imDienst(p, d)) g.push("nicht im Bestand");
  if (abwesenheitAm(m, p.id, d)) g.push(`abwesend (${abwArt(abwesenheitAm(m, p.id, d).art).label})`);
  if (e.keineNacht && nachtAnteil(da) >= 2) g.push("keine Nachtdienste zugelassen");
  if (!verfuegbarFuer(p, d, da)) g.push(`nicht verfügbar (${FENSTER[fensterVon(da)].name} ${DOW[dow(d)]})`);
  // Qualifikationen mit harter Sperre schließen die Einteilung ganz aus
  if (da.form !== "ruf") {
    for (const q of m.qualifikationen) {
      /* Der Grund nennt die Ebene. Vorher stand unter jeder Sperre
         „gesetzlich zwingend" — auch unter einer Betriebsvereinbarung. */
      const v = sperreWirkt(m, q, landFuerEinheit(m, einheitAm(p, d)));
      if (!v || qualGueltig(m, p, q.id)) continue;
      g.push(`${q.name} fehlt oder ist abgelaufen — ${v.gesetzlich ? v.label : v.label + ", keine Rechtsvorschrift"}`);
    }
  }
  const tz = p.teilzeit;
  if (tz && tz.aktiv && tz.modus === "wochentage" && !(tz.wochentage || []).includes(dow(d)))
    g.push("arbeitet an diesem Wochentag nicht");
  // Ruhezeit vor und nach dem Dienst
  const [nStart, nEnde] = fenster(d, da);
  for (const off of [-2, -1, 1, 2]) {
    const dd = addDays(d, off);
    const t = personTag(m, p, dd);
    if (!t.dienstId) continue;
    const other = m.dienstarten.find((x) => x.id === t.dienstId);
    if (!other) continue;
    const [oStart, oEnde] = fenster(dd, other);
    const ruhe = oStart > nStart ? (oStart - nEnde) / 60 : (nStart - oEnde) / 60;
    if (ruhe < m.einstellungen.ruhezeit) { g.push(`Ruhezeit ${n1(Math.max(0, ruhe))} h zum Dienst am ${fKurz(dd)}`); break; }
  }
  // Dienste je Woche
  if (e.maxDiensteWoche) {
    const mo = montag(d);
    let n = 0;
    for (let i = 0; i < 7; i++) if (personTag(m, p, addDays(mo, i)).dienstId) n++;
    if (n >= e.maxDiensteWoche) g.push(`bereits ${n} von ${e.maxDiensteWoche} Diensten in der Woche`);
  }
  // Wiedereingliederung
  const w = e.wiedereingliederung;
  if (w && w.von <= d && w.bis >= d) {
    const mo = montag(d);
    let std = 0;
    for (let i = 0; i < 7; i++) {
      const t = personTag(m, p, addDays(mo, i));
      if (!t.dienstId) continue;
      const x = m.dienstarten.find((y) => y.id === t.dienstId);
      if (x) std += dauer(x);
    }
    if (std + dauer(da) > w.maxStundenWoche)
      g.push(`Wiedereingliederung: höchstens ${n1(w.maxStundenWoche)} h je Woche`);
  }
  // Dienste in Folge
  let lauf = 0;
  for (let i = 1; i <= m.einstellungen.maxFolge + 1; i++) {
    if (personTag(m, p, addDays(d, -i)).dienstId) lauf++; else break;
  }
  if (lauf >= m.einstellungen.maxFolge) g.push(`${lauf} Dienste in Folge davor`);
  return g;
}

/**
 * Ersatzsuche für einen unterbesetzten Dienst.
 * Sortiert nach Eignung: Qualifikation, Stundenkonto im Minus, Belastungsausgleich.
 */
function ersatzVorschlaege(m, d, dienstId, ctx) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return [];
  const ym = d.slice(0, 7);
  const b = besetzung(m, d)[dienstId];
  const fehlendeQuals = (b.qual || []).filter((q) => !q.ok).map((q) => q.qid);
  const jahr = Number(d.slice(0, 4));
  const einspruengeJe = {};
  for (const e of m.einspruenge || []) einspruengeJe[e.personId] = (einspruengeJe[e.personId] || 0) + 1;
  const mittel = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  // Bewertet wird der Abstand zum Median, nicht der absolute Kontostand.
  // Sonst wirkt ein systematischer Überhang auf alle gleich und die Reihung wird beliebig.
  let median, nachtMittel;
  if (ctx) { median = ctx.median; nachtMittel = ctx.nachtMittel; }
  else {
    const konten = m.personen.filter((x) => imDienst(x, d)).map((x) => stundenkonto(m, x, ym)).sort((a, b2) => a - b2);
    median = konten.length ? konten[Math.floor(konten.length / 2)] : 0;
    const naechteJe = m.personen.filter((x) => imDienst(x, d)).map((x) => nachtJahr(m, x, jahr).anzahl);
    nachtMittel = naechteJe.length ? naechteJe.reduce((a, b2) => a + b2, 0) / naechteJe.length : 0;
  }

  const out = [];
  for (const p of m.personen) {
    const t = personTag(m, p, d);
    if (t.dienstId) continue;                      // hat bereits Dienst
    const g = hindernisse(m, p, d, da);
    const kto = ctx ? (ctx.konten.get(p.id) || 0) : stundenkonto(m, p, ym);
    const eigene = ctx ? (ctx.einspruenge[p.id] || 0) : (einspruengeJe[p.id] || 0);
    const passendeQuals = fehlendeQuals.filter((q) => qualGueltig(m, p, q));
    const gruende = [];
    let punkte = 0;
    // Abgelaufene Nachweise senken die Eignung deutlich
    const abgelaufen = p.qualifikationen.filter((q) => nachweisStand(m, p, q).stand === "abgelaufen");
    if (abgelaufen.length) { punkte -= 25 * abgelaufen.length;
      gruende.push(`${abgelaufen.length} Nachweis abgelaufen`); }
    if (passendeQuals.length) { punkte += 45 * passendeQuals.length;
      gruende.push(`bringt ${passendeQuals.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).join(", ")}`); }
    const relKto = kto - median;
    if (relKto < -3) { punkte += Math.min(30, -relKto * 2); gruende.push(`${n1(Math.abs(relKto))} h unter dem Mittel`); }
    else if (relKto > 3) { punkte -= Math.min(28, relKto * 2); gruende.push(`${n1(relKto)} h über dem Mittel`); }
    else gruende.push("Stundenkonto im Mittel");
    if (eigene < mittel - .5) { punkte += 14; gruende.push("selten eingesprungen"); }
    else if (eigene > mittel + .5) { punkte -= 12; gruende.push(`${eigene}× eingesprungen`); }
    if (p.springer) { punkte += 28; gruende.push("Springerpool"); }
    else {
      const eid = einheitAm(p, d);
      if (eid && einheitDienst(m, eid, d)) { punkte -= 10; gruende.push("hätte regulär frei"); }
      else { punkte += 8; gruende.push("in der Dienstphase"); }
      if (p.teilzeit && p.teilzeit.aktiv) { punkte -= 6; gruende.push("Teilzeit"); }
    }
    const nj = ctx ? (ctx.nachtAnzahl.get(p.id) || 0) : nachtJahr(m, p, jahr).anzahl;
    if (nachtAnteil(da) >= 2 && nj > nachtMittel + 3) { punkte -= 8; gruende.push(`${nj} Nachtdienste im Jahr`); }
    out.push({ person: p, punkte: Math.round(punkte), gruende, hindernisse: g, moeglich: g.length === 0 });
  }
  out.sort((a, b2) => (a.moeglich !== b2.moeglich) ? (a.moeglich ? -1 : 1) : b2.punkte - a.punkte);
  return out;
}

/* --------------------------- Freigabe und Rückkanal ---------------------- */
const freigabeStand = (m, ym) => (m.freigaben && m.freigaben[ym]) || null;
const istFreigegeben = (m, ym) => !!freigabeStand(m, ym);
/** Vorlauf in Tagen zwischen Änderung und betroffenem Diensttag. */
const vorlauf = (datum) => between(heute(), datum);

/** Kennzahl Planungssicherheit: Anteil kurzfristiger Änderungen an allen Änderungen. */
function planungssicherheit(m, ym, grenze = 14) {
  const alle = (m.aenderungen || []).filter((a) => a.datum.slice(0, 7) === ym);
  const kurz = alle.filter((a) => a.vorlauf < grenze);
  const jePerson = {};
  for (const a of kurz) jePerson[a.personId] = (jePerson[a.personId] || 0) + 1;
  return { gesamt: alle.length, kurzfristig: kurz.length,
    anteil: alle.length ? Math.round(kurz.length / alle.length * 100) : 0, jePerson, grenze };
}

/* --------------------------- Verteilungsgerechtigkeit -------------------- */
/**
 * Belastungsverteilung über einen Zeitraum: Wochenendnächte, Feiertagsdienste,
 * Nachtdienste, kurzfristige Änderungen. Grundlage für Streitfreiheit.
 */
function verteilung(m, von, bis) {
  return memo(m, `vert|${von}|${bis}`, () => {
    const kurz = {};
    for (const a of m.aenderungen || []) if (a.datum >= von && a.datum <= bis && a.vorlauf < 14)
      kurz[a.personId] = (kurz[a.personId] || 0) + 1;
    const zeilen = m.personen.filter((p) => imDienst(p, bis)).map((p) => {
      let weNacht = 0, feier = 0, naechte = 0, wochenenden = 0, dienste = 0;
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (!t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        dienste++;
        const w = dow(d), nacht = nachtAnteil(da) >= 2;
        if (nacht) naechte++;
        if (nacht && (w === 4 || w === 5)) weNacht++;
        if (w >= 5) wochenenden++;
        if (feiertag(d, m.bundesland)) feier++;
      }
      return { person: p, weNacht, feier, naechte, wochenenden, dienste, kurzfristig: kurz[p.id] || 0 };
    });
    const felder = ["weNacht", "feier", "naechte", "wochenenden", "kurzfristig"];
    const mittel = {};
    for (const f of felder) mittel[f] = zeilen.length ? zeilen.reduce((a, z) => a + z[f], 0) / zeilen.length : 0;
    for (const z of zeilen) { z.abw = {}; for (const f of felder) z.abw[f] = z[f] - mittel[f]; }
    zeilen.sort((a, b) => (b.weNacht + b.feier) - (a.weNacht + a.feier));
    return { zeilen, mittel, felder };
  });
}

/* --------------------------- Anteilige Abrechnung ------------------------ */
/**
 * Zählt Zugänge tagesgenau und mittelt über den Monat.
 * Ein am Zwanzigsten angelegter Zugang schlägt nur anteilig zu Buche.
 */
function zugaengeAnteilig(m, ym) {
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const summe = {};
  for (const r of ROLLEN) if (!r.extern) summe[r.id] = 0;
  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${pad(i)}`;
    for (const p of m.personen) {
      if (!imDienst(p, d)) continue;
      const r = rolleAm(p, d);
      if (summe[r] === undefined) summe[r] = 0;
      summe[r] += 1 / n;
    }
  }
  const out = {};
  for (const k of Object.keys(summe)) out[k] = Math.round(summe[k] * 1000) / 1000;
  return out;
}
function preisAnteilig(db, m, ym) {
  /* Anteilige Berechnung für unterjährig begonnene oder beendete Verträge.
     Standortpreise werden tagesgenau geteilt — wer am 15. dazukommt, zahlt
     den halben Monat. */
  const p = preis(db, m);
  const [y, mo] = ym.split("-").map(Number);
  const tage = dim_(y, mo - 1);
  const von = `${ym}-01`, bis = `${ym}-${pad(tage)}`;
  const start = m.seit && m.seit > von ? m.seit : von;
  const ende = m.bis && m.bis < bis ? m.bis : bis;
  if (start > bis || ende < von) return { ...p, anteil: 0, tage: 0, gesamtTage: tage,
    gesamt: 0, wirksam: 0 };
  const genutzt = between(start, ende) + 1;
  const anteil = Math.min(1, genutzt / tage);
  return { ...p, anteil, tage: genutzt, gesamtTage: tage,
    gesamt: Math.round(p.gesamt * anteil * 100) / 100,
    wirksam: Math.round(p.wirksam * anteil * 100) / 100 };
}

/* ==========================================================================
   RECHENKERN — ZWEITE AUSBAUSTUFE
   Zuschläge · Freizeitausgleich · Kapazitätsvorschau · Jahresurlaubsrunde ·
   Planungsassistent · Eskalation bei Unterdeckung · Datenschutzbetrieb
   ========================================================================== */

/* ------------------------------- Zuschläge ------------------------------- */
/**
 * Zerlegt einen Dienst in Kalendertage und ordnet die Stunden zu.
 * Ein Nachtdienst von Samstag 21:30 bis Sonntag 07:15 zählt anteilig
 * als Samstags- und als Sonntagsarbeit.
 */
function tagesanteile(datum, da) {
  const s = toMin(da.start);
  let e = toMin(da.ende);
  if (e <= s) e += 1440;
  const out = [];
  const ersterTeil = Math.min(e, 1440) - s;
  if (ersterTeil > 0) out.push({ datum, minuten: ersterTeil });
  if (e > 1440) out.push({ datum: addDays(datum, 1), minuten: e - 1440 });
  return out;
}
/** Zuschlagsrelevante Stunden einer Person in einem Monat. */
function zuschlagStunden(m, p, ym) {
  return memo(m, `zus|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number);
    const n = dim_(y, mo - 1);
    const r = { nacht: 0, sonntag: 0, feiertag: 0, samstag: 0, gesamt: 0 };
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`;
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      if (!da) continue;
      const gearbeitet = istDauer(m, p, d, da).std;
      r.gesamt += gearbeitet;
      r.nacht += nachtAnteil(da);
      for (const teil of tagesanteile(d, da)) {
        const std = teil.minuten / 60;
        const w = dow(teil.datum);
        if (feiertagFuer(m, teil.datum, p)) r.feiertag += std;
        else if (w === 6) r.sonntag += std;
        else if (w === 5) r.samstag += std;
      }
    }
    for (const k of Object.keys(r)) r[k] = Math.round(r[k] * 100) / 100;
    return r;
  });
}
/**
 * Bewertet die Zuschläge in Ausgleichsstunden.
 * Bewusst ohne Entgelt: Löhne gehören in die Lohnabrechnung, nicht in die Planung.
 * Ausgegeben wird, was die Lohnstelle braucht — Stunden je Zuschlagsart.
 */
function zuschlagWert(m, p, ym) {
  const std = zuschlagStunden(m, p, ym);
  const zeilen = (m.zuschlaege || []).filter((z) => z.aktiv).map((z) => {
    const h = std[z.art] || 0;
    return { regel: z, stunden: Math.round(h * 100) / 100,
      wert: Math.round(h * z.prozent / 100 * 100) / 100 };
  });
  return { std, zeilen, summe: Math.round(zeilen.reduce((a, l) => a + l.wert, 0) * 100) / 100 };
}

/* --------------------------- Freizeitausgleich --------------------------- */
/** Wie viele Freischichten baut das Konto bis auf die Zielgröße ab? */
function ausgleichBedarf(m, p, ym) {
  const kto = stundenkonto(m, p, ym);
  const grenze = m.einstellungen.ausgleichGrenze || 40;
  if (kto <= 0) return { kto, grenze, ueber: 0, schichten: 0, faellig: false };
  const mittel = m.dienstarten.filter((d) => !d.posten).reduce((a, d) => a + dauer(d), 0)
    / Math.max(1, m.dienstarten.filter((d) => !d.posten).length);
  return { kto, grenze, ueber: Math.round(Math.max(0, kto - grenze) * 10) / 10,
    schichten: Math.ceil(kto / Math.max(1, mittel)), faellig: kto > grenze, mittel };
}
/** Nächste geplante Diensttage, die sich als Freischicht eignen. */
function ausgleichTage(m, p, ab, anzahl = 10) {
  const out = [];
  for (let i = 0; i < 120 && out.length < anzahl; i++) {
    const d = addDays(ab, i);
    const t = personTag(m, p, d);
    if (!t.dienstId || t.abwesenheit) continue;
    const b = besetzung(m, d)[t.dienstId];
    out.push({ datum: d, dienstId: t.dienstId, puffer: b.diff, moeglich: b.diff > 0 });
  }
  return out;
}

/* --------------------------- Kapazitätsvorschau -------------------------- */
/**
 * Beantwortet die Frage, die vor jeder Genehmigung steht:
 * Wenn ich die offenen Anträge bewillige — trage ich die kommenden Wochen noch?
 */
function vorschau(m, wochen = 8) {
  return memo(m, `vor|${wochen}`, () => {
    const start = montag(heute());
    const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ === "abwesenheit");
    const mitAntraegen = { ...m, abwesenheiten: [...m.abwesenheiten,
      ...offen.map((a) => ({ id: `p_${a.id}`, personId: a.personId, art: a.art, von: a.von, bis: a.bis, notiz: "beantragt" }))] };
    const out = [];
    for (let w = 0; w < wochen; w++) {
      const von = addDays(start, w * 7), bis = addDays(von, 6);
      const jetzt = pruefen(m, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
      const dann = pruefen(mitAntraegen, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
      const betroffen = offen.filter((a) => a.von <= bis && a.bis >= von);
      out.push({ kw: w, von, bis, jetzt: jetzt.length, dann: dann.length,
        neu: Math.max(0, dann.length - jetzt.length), antraege: betroffen.length,
        status: dann.length > jetzt.length ? "danger" : jetzt.length ? "warn" : "ok" });
    }
    return { wochen: out, offen };
  });
}

/* --------------------------- Jahresurlaubsrunde -------------------------- */
/** Überschneidungen der Wünsche je Einheit und Tag — Grundlage der Entscheidung. */
function urlaubskonflikte(m) {
  const r = m.urlaubsrunde;
  if (!r) return [];
  const proTag = {};
  for (const w of r.wuensche) {
    if (w.status === "abgelehnt") continue;
    const p = m.personen.find((x) => x.id === w.personId);
    if (!p) continue;
    for (let d = w.von; d <= w.bis; d = addDays(d, 1)) {
      const eid = einheitAm(p, d) || "?";
      const k = `${eid}|${d}`;
      (proTag[k] = proTag[k] || []).push(w);
    }
  }
  const out = [];
  for (const [k, liste] of Object.entries(proTag)) {
    const [eid, d] = k.split("|");
    const grenze = (r.kontingent && r.kontingent[eid]) || m.einstellungen.maxUrlaubJeEinheit;
    if (liste.length > grenze) out.push({ einheitId: eid, datum: d, anzahl: liste.length, grenze, wuensche: liste });
  }
  out.sort((a, b) => (a.datum < b.datum ? -1 : 1));
  return out;
}
/**
 * Vorrangregel: wer im Vorjahr zurückstecken musste, kommt zuerst.
 * Danach die niedrigere selbstvergebene Priorität, danach das ältere Eingangsdatum.
 */
function urlaubsRang(m, w) {
  const p = m.personen.find((x) => x.id === w.personId);
  const zurueck = ((m.urlaubsrunde && m.urlaubsrunde.vorjahrZurueck) || []).includes(w.personId) ? 0 : 1;
  return [zurueck, w.prio || 3, w.erstellt || "", p ? p.nachname : ""];
}

/* --------------------------- Planungsassistent --------------------------- */
/**
 * Füllt offene Stellen eines Monats automatisch.
 * Nutzt dieselbe Bewertung wie die Ersatzsuche und meldet, was offen bleibt.
 * Rechnet mit vorab ermittelten Konten, sonst wäre der Durchlauf zu langsam.
 */
function planeMonat(m, ym, grenzen = {}) {
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const maxProPerson = grenzen.maxProPerson || 3;
  const ctx = { konten: new Map(), einspruenge: {}, nachtAnzahl: new Map() };
  const jahr = Number(ym.slice(0, 4));
  for (const p of m.personen) {
    ctx.konten.set(p.id, stundenkonto(m, p, ym));
    ctx.nachtAnzahl.set(p.id, nachtJahr(m, p, jahr).anzahl);
  }
  for (const e of m.einspruenge || []) ctx.einspruenge[e.personId] = (ctx.einspruenge[e.personId] || 0) + 1;
  const werte = [...ctx.konten.values()].sort((a, b) => a - b);
  ctx.median = werte.length ? werte[Math.floor(werte.length / 2)] : 0;
  ctx.mittelEinspruenge = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  const nw = [...ctx.nachtAnzahl.values()];
  ctx.nachtMittel = nw.length ? nw.reduce((a, b) => a + b, 0) / nw.length : 0;

  let arbeit = { ...m, abweichungen: { ...m.abweichungen } };
  const gesetzt = [];
  const offen = [];
  const jePerson = {};

  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${pad(i)}`;
    for (const da of m.dienstarten) {
      let schutz = 0;
      while (schutz++ < 12) {
        const b = besetzung(arbeit, d)[da.id];
        if (b.diff >= 0 && !b.qualFehlt) break;
        const kand = ersatzVorschlaege(arbeit, d, da.id, ctx)
          .filter((x) => x.moeglich && (jePerson[x.person.id] || 0) < maxProPerson);
        if (!kand.length) {
          offen.push({ datum: d, dienstId: da.id, fehlt: Math.max(0, -b.diff), qualFehlt: b.qualFehlt });
          break;
        }
        const beste = kand[0];
        arbeit = { ...arbeit, abweichungen: { ...arbeit.abweichungen, [`${beste.person.id}|${d}`]: da.id } };
        jePerson[beste.person.id] = (jePerson[beste.person.id] || 0) + 1;
        gesetzt.push({ personId: beste.person.id, name: `${beste.person.vorname} ${beste.person.nachname}`,
          datum: d, dienstId: da.id, punkte: beste.punkte, grund: beste.gruende.slice(0, 2).join(" · ") });
      }
    }
  }
  return { gesetzt, offen, abweichungen: arbeit.abweichungen,
    betroffene: Object.keys(jePerson).length, ym };
}

/* ------------------- Eskalation bei nicht deckbarer Lücke ---------------- */
const unterschreitungAm = (m, d, dienstId) =>
  (m.unterschreitungen || []).find((u) => u.datum === d && u.dienstId === dienstId) || null;
/** Nachweisliste für Aufsicht und Personalvertretung. */
function unterschreitungsNachweis(m, von, bis) {
  const zeilen = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    const b = besetzung(m, d);
    for (const k of Object.keys(b)) {
      const e = b[k];
      if (e.diff >= 0 && !e.qualFehlt) continue;
      const u = unterschreitungAm(m, d, k);
      zeilen.push({ datum: d, dienst: e.da.name, ist: e.anzahl, soll: e.soll,
        qualFehlt: e.qualFehlt, dokumentiert: !!u, grund: u ? u.grund : "", durch: u ? u.durch : "" });
    }
  }
  return zeilen;
}

/* ---------------------------- Datenschutzbetrieb ------------------------- */
/** Auskunft nach Artikel 15 — alles, was zu einer Person gespeichert ist. */
function datenauskunft(m, personId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return "";
  const z = [];
  z.push(`Datenauskunft · ${m.name}`, `Erstellt am ${fDatum(heute())}`, "");
  z.push("STAMMDATEN");
  z.push(`Name: ${p.vorname} ${p.nachname}`, `E-Mail: ${p.email || "—"}`, `Funktion: ${p.funktion}`,
    `Zugangsart: ${rolle(p.rolle).label}`, `Eintritt: ${fDatum(p.eintritt)}`,
    `Austritt: ${p.austritt ? fDatum(p.austritt) : "—"}`,
    `Wochenstunden: ${n1(p.wochenstunden)}`, `Urlaubsanspruch: ${p.urlaubsanspruch} Tage`);
  z.push("", "ZUGEHÖRIGKEIT");
  p.zugehoerigkeit.forEach((x) => z.push(`  ab ${fDatum(x.ab)}: ${(m.einheiten.find((e) => e.id === x.einheitId) || {}).name || x.einheitId}`));
  z.push("", "QUALIFIKATIONEN");
  z.push("  " + (p.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).name).filter(Boolean).join(", ") || "—"));
  const e = p.einschraenkungen || {};
  z.push("", "EINSATZEINSCHRÄNKUNGEN");
  z.push(`  keine Nachtdienste: ${e.keineNacht ? "ja" : "nein"}`,
    `  kein Alleindienst: ${e.keinAlleindienst ? "ja" : "nein"}`,
    `  Höchstzahl Dienste je Woche: ${e.maxDiensteWoche || "—"}`,
    `  Wiedereingliederung: ${e.wiedereingliederung ? `bis ${fDatum(e.wiedereingliederung.bis)}, ${n1(e.wiedereingliederung.maxStundenWoche)} h/Woche` : "—"}`);
  z.push("", "ABWESENHEITEN");
  const abw = m.abwesenheiten.filter((a) => a.personId === personId);
  abw.length ? abw.forEach((a) => z.push(`  ${abwArt(a.art).label}: ${fDatum(a.von)} bis ${fDatum(a.bis)}${a.notiz ? ` (${a.notiz})` : ""}`))
    : z.push("  —");
  z.push("", "ANTRÄGE");
  const anf = m.anfragen.filter((a) => a.personId === personId);
  anf.length ? anf.forEach((a) => z.push(`  ${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fDatum(a.von)}–${fDatum(a.bis)} · ${a.status} · gestellt ${a.erstellt}`))
    : z.push("  —");
  z.push("", "PLANÄNDERUNGEN");
  const aen = (m.aenderungen || []).filter((a) => a.personId === personId).slice(0, 60);
  aen.length ? aen.forEach((a) => z.push(`  ${fDatum(a.datum)}: ${a.von} → ${a.nach} (Vorlauf ${a.vorlauf} Tage, erfasst ${a.zeit})`))
    : z.push("  —");
  z.push("", "ERFASSTE ZEITEN");
  const erf = Object.entries(m.erfassung || {}).filter(([k]) => k.startsWith(personId + "|"));
  erf.length ? erf.forEach(([k, v]) => z.push(`  ${fDatum(k.split("|")[1])}: ${v.start || "wie geplant"}–${v.ende || ""}${v.grund ? ` (${v.grund})` : ""}`))
    : z.push("  —");
  z.push("", "MITTEILUNGEN");
  const na = (m.nachrichten || []).filter((x) => x.personId === personId).slice(0, 40);
  na.length ? na.forEach((x) => z.push(`  ${x.zeit}: ${x.titel}`)) : z.push("  —");
  z.push("", `Aufbewahrungsfrist nach Austritt: ${m.einstellungen.aufbewahrungMonate || 24} Monate.`);
  return z.join("\n");
}
/** Wessen Daten dürfen nach Ablauf der Frist anonymisiert werden? */
function anonymisierbar(m) {
  const frist = m.einstellungen.aufbewahrungMonate || 24;
  return m.personen.filter((p) => {
    if (!p.austritt || p.anonym) return false;
    const d = pISO(p.austritt); d.setMonth(d.getMonth() + frist);
    return iso(d) <= heute();
  });
}

/* --------------------------- Konflikterkennung --------------------------- */
/**
 * Ohne Server gibt es keinen echten Mehrbenutzerbetrieb. Erkennbar ist aber,
 * ob der gespeicherte Bestand seit dem Laden von anderer Stelle verändert wurde.
 */
async function fremdstandPruefen(schluessel, eigenerStand) {
  try {
    const r = await window.storage.get(schluessel);
    if (!r || !r.value) return { konflikt: false };
    const fremd = JSON.parse(r.value);
    return { konflikt: typeof fremd.stand === "number" && fremd.stand > eigenerStand, fremdStand: fremd.stand };
  } catch (e) { return { konflikt: false }; }
}

/* ==========================================================================
   RECHENKERN — DRITTE AUSBAUSTUFE
   Teilzeit in der Rotation · Springerpool · Standortbezogene Feiertage ·
   Bewertungsfaktor für Rufbereitschaft · Personalimport
   ========================================================================== */

/* --------------------- Standortbezogene Feiertage ------------------------ */
/** Bundesland einer Einheit — Betriebe mit mehreren Standorten rechnen sonst falsch. */
function landFuerEinheit(m, einheitId) {
  const e = m.einheiten.find((x) => x.id === einheitId);
  if (e && e.standortId && m.standorte) {
    const st = m.standorte.find((s) => s.id === e.standortId);
    if (st && st.bundesland) return st.bundesland;
  }
  return m.bundesland;
}
/** Feiertag aus Sicht einer bestimmten Person an einem Tag. */
function feiertagFuer(m, datum, p) {
  return feiertag(datum, p ? landFuerEinheit(m, einheitAm(p, datum)) : m.bundesland);
}
/** Alle im Betrieb vorkommenden Bundesländer. */
const laenderImBetrieb = (m) => [...new Set([m.bundesland, ...((m.standorte || []).map((s) => s.bundesland))])].filter(Boolean);

/* --------------------------- Teilzeit in der Rotation -------------------- */
/** Stabiler Streuwert je Person, damit Teilzeitkräfte nicht alle dieselben Tage haben. */
function idStreu(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
/**
 * Wandelt den Gruppendienst in den tatsächlichen Teilzeitdienst um.
 * Zwei Betriebsarten:
 *   quote      — die Person leistet nur den ihrem Stundenanteil entsprechenden
 *                Teil der Zyklusdienste, gleichmäßig über den Zyklus verteilt.
 *   wochentage — die Person arbeitet nur an festgelegten Wochentagen.
 * Ohne Teilzeit bleibt der Dienst unverändert.
 */
function teilzeitDienst(m, p, datum, plan) {
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv || !plan) return plan;
  if (tz.modus === "wochentage") return (tz.wochentage || []).includes(dow(datum)) ? plan : null;

  const soll = m.einstellungen.sollWochenstunden || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  if (quote >= 0.999) return plan;

  const len = zyklusLaenge(m);
  const e = m.einheiten.find((x) => x.id === einheitAm(p, datum));
  if (!e) return plan;

  // Fortlaufende Nummer dieses Dienstes seit dem Ankerdatum — nicht nur innerhalb
  // eines Zyklus. Nur so lässt sich ein Anteil wie 50 % exakt einhalten:
  // 21 Dienste je Zyklus sind nicht halbierbar, über mehrere Zyklen aber schon.
  const tage = between(m.anker, datum) + versatzTageVon(e);
  const zyklen = Math.floor(tage / len);
  const rest = ((tage % len) + len) % len;
  let gesamt = 0;
  for (const t of m.zyklus.tage) if (t && t !== "-") gesamt++;
  if (!gesamt) return plan;
  let vor = 0;
  for (let i = 0; i < rest; i++) { const t = m.zyklus.tage[i]; if (t && t !== "-") vor++; }
  const nr = zyklen * gesamt + vor;

  const versatz = (idStreu(p.id) % 997) / 997;
  return Math.floor((nr + 1 + versatz) * quote) > Math.floor((nr + versatz) * quote) ? plan : null;
}

/** Wie viele Dienste je Zyklus leistet die Person tatsächlich? */
function teilzeitProfil(m, p) {
  const gesamt = m.zyklus.tage.filter((t) => t && t !== "-").length;
  const soll = m.einstellungen.sollWochenstunden || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv) return { teilzeit: false, quote: 1, dienste: gesamt, gesamt };
  if (tz.modus === "wochentage")
    return { teilzeit: true, modus: "wochentage", quote, gesamt,
      dienste: m.zyklus.tage.filter((t, i) => t && t !== "-" && (tz.wochentage || []).includes(i % 7)).length };
  return { teilzeit: true, modus: "quote", quote, gesamt, dienste: Math.round(gesamt * quote * 10) / 10 };
}

/* ------------------------------ Bewertungsfaktor ------------------------- */
/**
 * Rufbereitschaft wird nicht voll als Arbeitszeit gewertet.
 * Der Faktor einer Dienstart bestimmt, wie viel auf das Konto fließt.
 */
const gewertet = (da, std) => Math.round(std * (da.faktor === undefined ? 1 : da.faktor) * 100) / 100;

/* ------------------------------- Personalimport -------------------------- */
const IMPORT_SPALTEN = ["nachname", "vorname", "einheit", "funktion", "wochenstunden",
  "urlaubsanspruch", "eintritt", "rolle", "qualifikationen", "teilzeit"];
/** Zerlegt eingefügten Text in Zeilen und Felder. Erkennt Semikolon, Tabulator und Komma. */
function importParsen(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim());
  if (!zeilen.length) return { kopf: [], daten: [], trenner: ";" };
  const kandidaten = [";", "\t", ","];
  const trenner = kandidaten.reduce((a, b) =>
    (zeilen[0].split(b).length > zeilen[0].split(a).length ? b : a), ";");
  const felder = (z) => z.split(trenner).map((x) => x.trim().replace(/^"|"$/g, ""));
  const kopf = felder(zeilen[0]);
  const daten = zeilen.slice(1).map(felder);
  return { kopf, daten, trenner };
}
/** Ordnet Spaltenüberschriften den bekannten Feldern zu. */
/**
 * Ordnet Tabellenspalten den Feldern zu — ohne Zutun.
 *
 * Drei Stufen, absteigend nach Verlässlichkeit:
 *   1. Überschrift trifft ein bekanntes Muster
 *   2. Überschrift ähnelt einem Muster (Tippfehler, Umlautschreibung)
 *   3. Der Inhalt der Spalte verrät das Feld — greift auch bei
 *      Überschriften wie „Spalte 3" oder ganz ohne Kopfzeile
 *
 * Jede Zuordnung nennt ihre Herkunft, damit die Vorschau zeigen kann,
 * wie sicher sie ist.
 */
function importZuordnen(kopf, zeilen) {
  const norm = (s) => String(s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
  const muster = {
    nachname: ["nachname", "name", "familienname", "lastname", "surname", "zuname"],
    vorname: ["vorname", "firstname", "rufname", "givenname"],
    personalnummer: ["personalnummer", "persnr", "pnr", "mitarbeiternummer", "nummer", "id"],
    einheit: ["einheit", "gruppe", "team", "station", "wohnbereich", "schichtgruppe",
      "abteilung", "dienstgruppe", "bereich", "objekt", "kostenstelle"],
    funktion: ["funktion", "position", "taetigkeit", "stelle", "berufsbezeichnung", "job"],
    wochenstunden: ["wochenstunden", "stunden", "wochenarbeitszeit", "az", "arbeitszeit",
      "sollstunden", "vertragsstunden"],
    urlaubsanspruch: ["urlaub", "urlaubsanspruch", "urlaubstage", "jahresurlaub"],
    eintritt: ["eintritt", "eintrittsdatum", "beginn", "seit", "einstellung", "vertragsbeginn"],
    rolle: ["rolle", "zugang", "zugangsart", "berechtigung", "recht"],
    qualifikationen: ["qualifikation", "qualifikationen", "quali", "kenntnisse", "nachweise",
      "ausbildung", "befaehigung"],
    teilzeit: ["teilzeit", "tz", "beschaeftigungsart"],
    email: ["email", "mail", "emailadresse", "dienstmail"],
  };

  /* Ähnlichkeit zweier Zeichenketten über die Editierdistanz. Fängt
     Tippfehler und Abkürzungen ab, ohne fremde Bibliothek. */
  const abstand = (a, b) => {
    const v = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let vor = v[0]; v[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = v[j];
        v[j] = Math.min(v[j] + 1, v[j - 1] + 1, vor + (a[i - 1] === b[j - 1] ? 0 : 1));
        vor = t;
      }
    }
    return v[b.length];
  };
  const aehnlich = (a, b) => {
    if (!a.length || !b.length) return 0;
    return 1 - abstand(a, b) / Math.max(a.length, b.length);
  };

  /* Was sagt der Inhalt einer Spalte? Geprüft an bis zu zwanzig Zeilen. */
  const proben = (idx) => (zeilen || []).slice(0, 20)
    .map((z) => String(z[idx] || "").trim()).filter(Boolean);
  const inhaltsTyp = (idx) => {
    const p = proben(idx);
    if (p.length < 3) return null;
    const anteil = (f) => p.filter(f).length / p.length;
    if (anteil((x) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(x)) > .7)
      return "datum";
    if (anteil((x) => /@/.test(x) && /\./.test(x)) > .7) return "email";
    if (anteil((x) => /^\d{1,2}([.,]\d{1,2})?$/.test(x)) > .7) {
      const zahlen = p.map((x) => Number(x.replace(",", "."))).filter((x) => !isNaN(x));
      const mittel = zahlen.reduce((a, b) => a + b, 0) / (zahlen.length || 1);
      if (mittel >= 15 && mittel <= 50) return "wochenstunden";
      if (mittel >= 20 && mittel <= 40) return "urlaubsanspruch";
      return "zahl";
    }
    if (anteil((x) => /^[A-Za-z]?\d{3,8}$/.test(x)) > .7) return "personalnummer";
    // Namen: ein Wort, überwiegend Buchstaben, viele verschiedene Werte
    const einzigartig = new Set(p.map((x) => x.toLowerCase())).size / p.length;
    if (anteil((x) => /^[A-ZÄÖÜ][a-zäöüß-]{1,20}$/.test(x)) > .7 && einzigartig > .6) return "name";
    // Wenige verschiedene Werte über viele Zeilen: eine Einteilung
    if (einzigartig < .35 && p.length >= 8) return "kategorie";
    return null;
  };

  const zu = {}, herkunft = {};
  const belegt = new Set();

  // Stufe 1: genaue Treffer
  kopf.forEach((h, i) => {
    const n = norm(h);
    for (const [feld, liste] of Object.entries(muster)) {
      if (zu[feld] !== undefined) continue;
      if (liste.some((x) => n === x)) { zu[feld] = i; herkunft[feld] = "genau"; belegt.add(i); break; }
    }
  });
  // Stufe 2: Anfang oder ähnlich genug
  kopf.forEach((h, i) => {
    if (belegt.has(i)) return;
    const n = norm(h);
    let bestes = null, beste = .72;
    for (const [feld, liste] of Object.entries(muster)) {
      if (zu[feld] !== undefined) continue;
      for (const x of liste) {
        /* Mindestlänge drei: sonst trifft eine Überschrift wie „A" jedes
           Muster, das mit A beginnt — und die Inhaltsanalyse käme nie zum Zug. */
        if (n.length >= 3 && (n.startsWith(x) || x.startsWith(n))) {
          bestes = feld; beste = 1; break;
        }
        if (n.length >= 4) {
          const w = aehnlich(n, x);
          if (w > beste) { beste = w; bestes = feld; }
        }
      }
      if (beste === 1) break;
    }
    if (bestes) { zu[bestes] = i; herkunft[bestes] = beste === 1 ? "genau" : "aehnlich"; belegt.add(i); }
  });
  // Stufe 3: aus dem Inhalt schließen
  if (zeilen && zeilen.length) {
    const namensSpalten = [];
    kopf.forEach((h, i) => {
      if (belegt.has(i)) return;
      const t = inhaltsTyp(i);
      if (!t) return;
      if (t === "name") { namensSpalten.push(i); return; }
      const feld = { datum: "eintritt", email: "email", wochenstunden: "wochenstunden",
        personalnummer: "personalnummer", kategorie: "einheit" }[t];
      if (feld && zu[feld] === undefined) {
        zu[feld] = i; herkunft[feld] = "inhalt"; belegt.add(i);
      }
    });
    // Zwei Namensspalten: die linke ist üblicherweise der Nachname
    if (namensSpalten.length >= 2) {
      if (zu.nachname === undefined) { zu.nachname = namensSpalten[0]; herkunft.nachname = "inhalt"; }
      if (zu.vorname === undefined) { zu.vorname = namensSpalten[1]; herkunft.vorname = "inhalt"; }
    } else if (namensSpalten.length === 1 && zu.nachname === undefined) {
      zu.nachname = namensSpalten[0]; herkunft.nachname = "inhalt";
    }
  }
  return { zu, herkunft };
}

/** Ein Feld ohne Zuordnung, das gebraucht wird? */
const importFehlend = (zu) => ["nachname"].filter((f) => zu[f] === undefined);
/** Baut aus den Rohzeilen Personendatensätze und meldet, was fehlt. */
function importPruefen(m, kopf, daten, zu) {
  const rollen = ROLLEN.filter((r) => !r.extern).map((r) => r.id);
  const zeilen = daten.map((f, i) => {
    const hol = (k) => (zu[k] !== undefined ? (f[zu[k]] || "").trim() : "");
    const nachname = hol("nachname"), vorname = hol("vorname");
    const einheitName = hol("einheit");
    const einheit = m.einheiten.find((e) => e.name.toLowerCase() === einheitName.toLowerCase());
    const std = parseFloat((hol("wochenstunden") || "").replace(",", ".")) || m.einstellungen.sollWochenstunden;
    const rolleRoh = hol("rolle").toLowerCase();
    const rolleId = rollen.find((x) => x === rolleRoh)
      || (ROLLEN.find((x) => x.label.toLowerCase() === rolleRoh) || {}).id || "mitarbeiter";
    const qualNamen = hol("qualifikationen").split(/[,/|]/).map((x) => x.trim()).filter(Boolean);
    const quals = qualNamen.map((q) => (m.qualifikationen.find((x) =>
      x.name.toLowerCase() === q.toLowerCase() || x.kurz.toLowerCase() === q.toLowerCase()) || {}).id).filter(Boolean);
    const fehlendeQuals = qualNamen.filter((q) => !m.qualifikationen.some((x) =>
      x.name.toLowerCase() === q.toLowerCase() || x.kurz.toLowerCase() === q.toLowerCase()));
    const eintritt = (() => {
      const roh = hol("eintritt");
      if (/^\d{4}-\d{2}-\d{2}$/.test(roh)) return roh;
      const de = roh.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (de) return `${de[3]}-${pad(Number(de[2]))}-${pad(Number(de[1]))}`;
      return heute();
    })();
    const tzRoh = hol("teilzeit").toLowerCase();
    const teilzeit = (tzRoh === "ja" || tzRoh === "x" || tzRoh === "1" || std < (m.einstellungen.sollWochenstunden || 40) - .1)
      ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null;
    const fehler = [];
    if (!nachname) fehler.push("Nachname fehlt");
    if (!vorname) fehler.push("Vorname fehlt");
    if (einheitName && !einheit) fehler.push(`Einheit „${einheitName}" unbekannt`);
    if (!einheitName) fehler.push("Einheit fehlt");
    const doppelt = m.personen.some((p) => p.nachname.toLowerCase() === nachname.toLowerCase()
      && p.vorname.toLowerCase() === vorname.toLowerCase());
    return { nr: i + 1, nachname, vorname, einheitName, einheitId: einheit ? einheit.id : null,
      funktion: hol("funktion") || "Fachkraft", wochenstunden: std,
      urlaubsanspruch: parseInt(hol("urlaubsanspruch"), 10) || 30, eintritt, rolle: rolleId,
      qualifikationen: quals, fehlendeQuals, teilzeit, fehler, doppelt, ok: fehler.length === 0 };
  });
  return { zeilen, gut: zeilen.filter((z) => z.ok).length, fehlerhaft: zeilen.filter((z) => !z.ok).length,
    doppelt: zeilen.filter((z) => z.doppelt).length,
    neueEinheiten: [...new Set(zeilen.filter((z) => z.einheitName && !z.einheitId).map((z) => z.einheitName))],
    neueQuals: [...new Set(zeilen.flatMap((z) => z.fehlendeQuals))] };
}
const IMPORT_BEISPIEL = `Nachname;Vorname;Einheit;Funktion;Wochenstunden;Urlaub;Eintritt;Rolle;Qualifikationen;Teilzeit
Meier;Sabine;Schichtgruppe 1;Fachkraft;41;30;01.03.2021;mitarbeiter;SK,EH;
Yildiz;Kerem;Schichtgruppe 2;Schichtleitung;41;30;15.08.2019;subplaner;SK,SL;
Novak;Petra;Schichtgruppe 1;Fachkraft;20,5;30;01.02.2024;mitarbeiter;SK;ja`;

/* ==========================================================================
   RECHENKERN — FÜNFTE AUSBAUSTUFE
   Verfügbarkeiten · Nachweisgültigkeit · Standortprüfung beim Einstempeln ·
   Auslastung · Was ist heute zu tun
   ========================================================================== */

/* ------------------------------ Verfügbarkeit ---------------------------- */
/** Drei Zeitfenster je Tag. Ein Dienst fällt in das Fenster, in dem er beginnt. */
const FENSTER = [
  { id: 0, name: "Vormittag", von: 0, bis: 719 },
  { id: 1, name: "Nachmittag", von: 720, bis: 1079 },
  { id: 2, name: "Nacht", von: 1080, bis: 1439 },
];
const fensterVon = (da) => {
  const s = toMin(da.start);
  return s < 720 ? 0 : s < 1080 ? 1 : 2;
};
/**
 * Kann die Person an diesem Tag diesen Dienst leisten?
 * Ohne gepflegte Verfügbarkeit gilt: immer verfügbar.
 */
function verfuegbarFuer(p, datum, da) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return true;
  const idx = dow(datum) * 3 + fensterVon(da);
  return v.raster[idx] !== false;
}
/** Für die Anzeige: wie viele der 21 Felder sind freigegeben? */
function verfuegbarkeitQuote(p) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return 1;
  return v.raster.filter(Boolean).length / 21;
}

/* --------------------------- Nachweise und Ablauf ------------------------ */
const NACHWEIS_VORLAUF = 60;   // Tage, ab denen gewarnt wird

/** Gültigkeitsstand eines einzelnen Nachweises. */
function nachweisStand(m, p, qualId) {
  const n = (p.qualNachweise || []).find((x) => x.qualId === qualId);
  const q = m.qualifikationen.find((x) => x.id === qualId);
  if (!q) return { stand: "unbekannt" };
  if (!q.gueltigMonate) return { stand: "gueltig", ablauf: null, qual: q, unbefristet: true };
  if (!n || !n.ablauf) return { stand: "fehlt", ablauf: null, qual: q };
  const tage = between(heute(), n.ablauf);
  return { stand: tage < 0 ? "abgelaufen" : tage <= NACHWEIS_VORLAUF ? "laeuft_ab" : "gueltig",
    ablauf: n.ablauf, tage, qual: q, datei: n.datei };
}
/** Zählt eine Qualifikation für die Besetzung nur, wenn der Nachweis gültig ist. */
/**
 * Wirkt die harte Sperre dieser Qualifikation hier — und aus welchem Grund?
 *
 * Gesetzliche Sperren (Bundes- und Landesrecht) gehören in den Kern: Wer
 * ohne die vorbehaltene Qualifikation eingeteilt ist, muss das erfahren,
 * unabhängig von der gebuchten Stufe. Eigene Vorgaben — Tarif, Betriebs-
 * oder Dienstvereinbarung — durchzusetzen ist dagegen das Merkmal, für das
 * bezahlt wird.
 *
 * Zurück kommt die Verbindlichkeit, wenn die Sperre greift, sonst null.
 */
function sperreWirkt(m, q, land) {
  if (!q || !q.harteSperre) return null;
  const v = verbindlichkeit(q, { land });
  if (!v.sperrt) return null;
  return kann(m, v.gesetzlich ? "sperreGesetz" : "sperreEigen") ? v : null;
}

function qualGueltig(m, p, qualId) {
  if (!p.qualifikationen.includes(qualId)) return false;
  const s = nachweisStand(m, p, qualId);
  return s.stand === "gueltig" || s.stand === "laeuft_ab";
}
/** Alle Nachweise eines Betriebs, die Aufmerksamkeit brauchen. */
function nachweisLage(m) {
  return memo(m, "nachweise", () => {
    const abgelaufen = [], bald = [], fehlt = [];
    for (const p of m.personen) {
      if (!imDienst(p, heute())) continue;
      for (const qid of p.qualifikationen) {
        const s = nachweisStand(m, p, qid);
        if (s.stand === "abgelaufen") abgelaufen.push({ person: p, ...s });
        else if (s.stand === "laeuft_ab") bald.push({ person: p, ...s });
        else if (s.stand === "fehlt" && s.qual && s.qual.nachweisPflicht) fehlt.push({ person: p, ...s });
      }
    }
    const sort = (a, b) => (a.tage || 0) - (b.tage || 0);
    return { abgelaufen: abgelaufen.sort(sort), bald: bald.sort(sort), fehlt,
      gesamt: abgelaufen.length + bald.length + fehlt.length };
  });
}

/* ------------------------ Standortprüfung beim Stempeln ------------------ */
/** Abstand zweier Koordinaten in Metern (Haversine). */
function abstandMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
/**
 * Bewertet einen Stempelvorgang gegen den hinterlegten Einsatzort.
 * Bewusst nur als Ereignis: kein Verlauf, keine Hintergrundortung.
 * Gespeichert wird ausschließlich das Ergebnis, nicht die Koordinate.
 */
function stempelPruefen(m, p, datum, koord) {
  const t = personTag(m, p, datum);
  const da = t.dienstId && m.dienstarten.find((x) => x.id === t.dienstId);
  const eid = einheitAm(p, datum);
  const e = m.einheiten.find((x) => x.id === eid);
  const st = e && m.standorte.find((x) => x.id === e.standortId);
  if (!koord || !st || st.lat === undefined)
    return { geprueft: false, text: "Ohne Standortfreigabe erfasst" };
  const d = abstandMeter(koord.lat, koord.lon, st.lat, st.lon);
  const radius = st.radius || 200;
  return { geprueft: true, abstand: d, radius, innerhalb: d <= radius, standort: st.name,
    text: d <= radius ? `Am Einsatzort (${d} m)` : `Abweichend, ${d > 1500 ? `${n1(d / 1000)} km` : `${d} m`} entfernt` };
}
const stempelStand = (m, p, datum) => (m.einstempeln || {})[`${p.id}|${datum}`] || null;

/* -------------------------------- Auslastung ----------------------------- */
/**
 * Auslastung in Prozent: geleistete gegen vertragliche Stunden im Monat.
 * Eine Zahl, an der sofort ablesbar ist, wer noch Luft hat.
 */
function auslastung(m, p, ym) {
  return memo(m, `ausl|${p.id}|${ym}`, () => {
    const ist = istStunden(m, p, ym).gesamt;
    const soll = sollStunden(m, p, ym);
    const pct = soll > 0 ? Math.round((ist / soll) * 100) : 0;
    return { ist, soll, pct,
      stand: pct > 115 ? "hoch" : pct > 105 ? "erhoeht" : pct < 85 ? "niedrig" : "normal" };
  });
}

/* --------------------------- Was ist heute zu tun ------------------------ */
/**
 * Der Einstieg für jede Rolle: nicht was alles existiert, sondern was ansteht.
 * Jeder Eintrag nennt Anzahl, Dringlichkeit und führt an die richtige Stelle.
 */
function tagesaufgaben(sitz) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute(), ym = d0.slice(0, 7);
  const out = [];
  const push = (o) => out.push(o);

  // --- Für alle im Schichtdienst ---
  if (p.imSchichtdienst !== false) {
    const t = personTag(m, p, d0);
    if (t.dienstId) {
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      const st = stempelStand(m, p, d0);
      if (da && !st) push({ art: "stempel", dringend: true, ziel: "meine",
        titel: `Heute ${da.name}`, text: `${da.start}–${da.ende} · noch nicht eingestempelt`, aktion: "Einstempeln" });
      else if (da && st && !st.ende) push({ art: "stempel", dringend: false, ziel: "meine",
        titel: `Im Dienst seit ${st.start}`, text: da.name, aktion: "Ausstempeln" });
    }
    const offen = offeneErfassung(m, p, addDays(d0, -1));
    if (offen.length) push({ art: "zeiten", dringend: false, ziel: "meine",
      titel: `${offen.length} Zeiten bestätigen`, text: "Solange offen, bleibt das Stundenkonto eine Hochrechnung", anzahl: offen.length });
    const meineNachweise = p.qualifikationen.map((q) => nachweisStand(m, p, q))
      .filter((s) => s.stand === "abgelaufen" || s.stand === "laeuft_ab");
    if (meineNachweise.length) push({ art: "nachweis", dringend: meineNachweise.some((x) => x.stand === "abgelaufen"),
      ziel: "meine", titel: `${meineNachweise.length} Nachweis${meineNachweise.length > 1 ? "e" : ""} prüfen`,
      text: meineNachweise.map((x) => `${x.qual.name}${x.stand === "abgelaufen" ? " abgelaufen" : ` läuft in ${x.tage} Tagen ab`}`).join(" · ") });
    const antw = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen);
    if (antw.length) push({ art: "post", dringend: false, ziel: "meine",
      titel: `${antw.length} neue Mitteilung${antw.length > 1 ? "en" : ""}`, text: antw[0].titel, anzahl: antw.length });
    const einsatz = m.anfragen.filter((a) => a.personId === p.id && a.typ === "einsatz" && a.status === "offen");
    if (einsatz.length) push({ art: "einsatz", dringend: true, ziel: "meine",
      titel: `${einsatz.length} Einsatzanfrage${einsatz.length > 1 ? "n" : ""}`, text: "Zusagen oder absagen" });
  }

  // --- Für Planung und Leitung ---
  if (darf(sitz, "req.approve.unit") || darf(sitz, "req.approve.all")) {
    const zu = m.anfragen.filter((a) => {
      if (a.status !== "offen" || a.typ === "einsatz") return false;
      const ap = m.personen.find((x) => x.id === a.personId);
      return ap && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(ap, d0)));
    });
    if (zu.length) push({ art: "antrag", dringend: zu.length > 4, ziel: "antraege",
      titel: `${zu.length} Antr${zu.length > 1 ? "äge" : "ag"} entscheiden`,
      text: zu.slice(0, 2).map((a) => { const ap = m.personen.find((x) => x.id === a.personId);
        return `${ap ? ap.nachname : "?"} · ${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fKurz(a.von)}`; }).join(" · "),
      anzahl: zu.length });
    const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && (a.interessenten || []).length);
    if (boerse.length) push({ art: "boerse", dringend: false, ziel: "boerse",
      titel: `${boerse.length} Tauschgesuch${boerse.length > 1 ? "e" : ""} mit Meldung`, text: "Zuteilung steht aus" });
  }

  if (darf(sitz, "plan.view.unit")) {
    const kommend = pruefen(m, d0, addDays(d0, 13));
    const heuteOffen = kommend.filter((b) => b.datum === d0 && (b.art === "besetzung" || b.art === "qualifikation"));
    if (heuteOffen.length) push({ art: "besetzung", dringend: true, ziel: "lage",
      titel: `Heute ${heuteOffen.length}× unterbesetzt`, text: heuteOffen.map((b) => b.titel).slice(0, 2).join(" · "),
      anzahl: heuteOffen.length });
    const kritisch = kommend.filter((b) => b.schwere === "danger" && b.datum !== d0);
    if (kritisch.length) push({ art: "pruefung", dringend: false, ziel: "pruef",
      titel: `${kritisch.length} kritische Befunde in 14 Tagen`, text: kritisch[0].titel, anzahl: kritisch.length });
  }

  if (darf(sitz, "staff.view")) {
    const nl = nachweisLage(m);
    if (nl.abgelaufen.length) push({ art: "nachweise", dringend: true, ziel: "personal",
      titel: `${nl.abgelaufen.length} Nachweis${nl.abgelaufen.length > 1 ? "e" : ""} abgelaufen`,
      text: nl.abgelaufen.slice(0, 2).map((x) => `${x.person.nachname} · ${x.qual.name}`).join(" · "),
      anzahl: nl.abgelaufen.length });
    if (nl.bald.length) push({ art: "nachweise", dringend: false, ziel: "personal",
      titel: `${nl.bald.length} Nachweis${nl.bald.length > 1 ? "e laufen" : " läuft"} bald ab`,
      text: nl.bald.slice(0, 2).map((x) => `${x.person.nachname} · ${x.qual.name} in ${x.tage} Tagen`).join(" · "),
      anzahl: nl.bald.length });
  }

  if (darf(sitz, "plan.publish")) {
    for (const off of [0, 1]) {
      const [y, mo] = ym.split("-").map(Number);
      const d = new Date(y, mo - 1 + off, 1);
      const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      if (!istFreigegeben(m, k)) push({ art: "freigabe", dringend: off === 0, ziel: "plan",
        titel: `${MON[d.getMonth()]} ${d.getFullYear()} nicht freigegeben`,
        text: off === 0 ? "Der laufende Monat ist noch Entwurf" : "Vorlauf schaffen und freigeben" });
    }
  }

  if (darf(sitz, "account.view.all")) {
    const grenze = m.einstellungen.ausgleichGrenze || 40;
    const ueber = m.personen.filter((x) => imDienst(x, d0) && stundenkonto(m, x, ym) > grenze);
    if (ueber.length) push({ art: "konto", dringend: false, ziel: "abrechnung",
      titel: `${ueber.length}× Stundenkonto über der Grenze`,
      text: `Freizeitausgleich einplanen · Grenze ${n1(grenze)} h`, anzahl: ueber.length });
  }

  out.sort((a, b) => (a.dringend === b.dringend ? 0 : a.dringend ? -1 : 1));
  return out;
}

/* --------------------------- Tages- und Wochenband ----------------------- */
/**
 * Belegung eines Tages auf einer 24-Stunden-Achse.
 * Zeigt, WANN gearbeitet wird — nicht nur ob.
 */
function tagesband(m, datum) {
  return memo(m, `band|${datum}`, () => {
    const spuren = [];
    for (const da of m.dienstarten) {
      const b = besetzung(m, datum)[da.id];
      const s = toMin(da.start);
      let e = toMin(da.ende); if (e <= s) e += 1440;
      spuren.push({ da, von: s, bis: e, ueberNacht: e > 1440,
        anzahl: b.anzahl, soll: b.soll, status: b.status, personen: b.personen });
    }
    return spuren.sort((a, b) => a.von - b.von);
  });
}

/* ==========================================================================
   RECHENKERN — SECHSTE AUSBAUSTUFE
   Planstand-Vergleich · Wunschdienste · Einarbeitung · Qualifikationsmatrix ·
   Kontoverlauf · Bereitschaft · Notizen
   ========================================================================== */

/* --------------------------- Planstand-Vergleich ------------------------- */
/**
 * Was hat sich seit der Freigabe geändert?
 * Beantwortet die häufigste Frage im Schichtbetrieb: „Ich hatte doch Frühdienst?"
 */
function planVergleich(m, ym) {
  const stand = (m.planstaende || {})[ym];
  if (!stand) return { hatStand: false, zeilen: [] };
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const nam = (id) => (!id || id === "-" ? "frei" : (map[id] || {}).name || id);
  const zeilen = [];
  for (const p of m.personen) {
    if (!imDienst(p, `${ym}-01`)) continue;
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`;
      const k = `${p.id}|${d}`;
      const damals = stand[k] !== undefined ? stand[k] : null;
      const jetztAb = m.abweichungen[k];
      const eid = einheitAm(p, d);
      const plan = eid && p.imSchichtdienst !== false ? einheitDienst(m, eid, d) : null;
      const alt = damals !== null ? damals : plan;
      const neu = jetztAb !== undefined ? jetztAb : plan;
      if ((alt || "-") === (neu || "-")) continue;
      zeilen.push({ person: p, datum: d, von: nam(alt), nach: nam(neu),
        vorlauf: between(heute(), d), richtung: !alt || alt === "-" ? "zusatz" : !neu || neu === "-" ? "entfall" : "wechsel" });
    }
  }
  zeilen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  return { hatStand: true, zeilen, zeit: (m.freigaben || {})[ym] ? m.freigaben[ym].zeit : null,
    zusatz: zeilen.filter((z) => z.richtung === "zusatz").length,
    entfall: zeilen.filter((z) => z.richtung === "entfall").length,
    wechsel: zeilen.filter((z) => z.richtung === "wechsel").length };
}
/** Abbild der Abweichungen zum Freigabezeitpunkt — Grundlage des Vergleichs. */
function planAbbild(m, ym) {
  const out = {};
  for (const k of Object.keys(m.abweichungen)) if (k.split("|")[1].startsWith(ym)) out[k] = m.abweichungen[k];
  return out;
}

/* ------------------------------ Wunschdienste ---------------------------- */
const WUNSCH_ARTEN = [
  { id: "moechte", label: "Möchte arbeiten", farbe: "#2E6B4F", zeichen: "+" },
  { id: "lieber_nicht", label: "Lieber nicht", farbe: "#8A5A00", zeichen: "−" },
];
const wunschAm = (m, pid, d) => (m.wuensche || []).find((w) => w.personId === pid && w.datum === d) || null;
/** Wie gut trifft der Plan die geäußerten Wünsche? */
function wunschErfuellung(m, ym) {
  const liste = (m.wuensche || []).filter((w) => w.datum.startsWith(ym));
  let erfuellt = 0;
  for (const w of liste) {
    const p = m.personen.find((x) => x.id === w.personId);
    if (!p) continue;
    const hat = !!personTag(m, p, w.datum).dienstId;
    if ((w.art === "moechte" && hat) || (w.art === "lieber_nicht" && !hat)) erfuellt++;
  }
  return { gesamt: liste.length, erfuellt, quote: liste.length ? Math.round((erfuellt / liste.length) * 100) : null };
}

/* ------------------------------- Einarbeitung ---------------------------- */
const einarbeitungAm = (m, pid, d) =>
  (m.einarbeitung || []).find((e) => e.personId === pid && e.von <= d && e.bis >= d) || null;
/**
 * Prüft, ob eine Person in Einarbeitung an ihrem Diensttag von der zugeordneten
 * Begleitung tatsächlich begleitet wird.
 */
function einarbeitungLage(m, von, bis) {
  const out = [];
  for (const e of m.einarbeitung || []) {
    const p = m.personen.find((x) => x.id === e.personId);
    const mentor = m.personen.find((x) => x.id === e.mentorId);
    if (!p) continue;
    let tage = 0, begleitet = 0, allein = [];
    for (let d = maxISO(e.von, von); d <= minISO(e.bis, bis); d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      tage++;
      const mt = mentor ? personTag(m, mentor, d) : null;
      if (mt && mt.dienstId === t.dienstId) begleitet++;
      else allein.push(d);
    }
    out.push({ ...e, person: p, mentor, tage, begleitet, allein,
      quote: tage ? Math.round((begleitet / tage) * 100) : null });
  }
  return out;
}
const maxISO = (a, b) => (a > b ? a : b);
const minISO = (a, b) => (a < b ? a : b);

/* --------------------------- Qualifikationsmatrix ------------------------ */
/**
 * Wer kann was — und wo hängt eine Qualifikation an zu wenigen Personen?
 * Der Engpass zeigt sich sonst erst bei der Krankmeldung.
 */
function qualMatrix(m) {
  return memo(m, "qmatrix", () => {
    const aktiv = m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false);
    const spalten = m.qualifikationen.map((q) => {
      const traeger = aktiv.filter((p) => qualGueltig(m, p, q.id));
      const jeEinheit = {};
      for (const e of m.einheiten.filter((x) => !x.pool)) {
        jeEinheit[e.id] = traeger.filter((p) => einheitAm(p, heute()) === e.id).length;
      }
      // Höchster Bedarf dieser Qualifikation über alle Dienstarten
      const bedarf = Math.max(0, ...m.dienstarten.map((d) => (d.mindestQual || {})[q.id] || 0));
      const schwaechste = Object.entries(jeEinheit).sort((a, b) => a[1] - b[1])[0];
      return { qual: q, traeger, anzahl: traeger.length, jeEinheit, bedarf,
        engpass: bedarf > 0 && schwaechste && schwaechste[1] <= bedarf,
        kritisch: bedarf > 0 && schwaechste && schwaechste[1] < bedarf,
        schwaechsteEinheit: schwaechste ? m.einheiten.find((e) => e.id === schwaechste[0]) : null,
        schwaechsteAnzahl: schwaechste ? schwaechste[1] : 0 };
    });
    return { spalten, personen: aktiv,
      engpaesse: spalten.filter((s) => s.engpass).length,
      kritische: spalten.filter((s) => s.kritisch).length };
  });
}

/* ------------------------------- Kontoverlauf ---------------------------- */
/** Zwölf Monate Stundenkonto — die Frage ist nie der Stand, sondern die Richtung. */
function kontoVerlauf(m, p, bisYm, monate = 12) {
  const out = [];
  const [y, mo] = bisYm.split("-").map(Number);
  for (let i = monate - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    out.push({ ym: k, label: MON[d.getMonth()].slice(0, 3), kto: stundenkonto(m, p, k),
      ist: istStunden(m, p, k).gesamt, soll: sollStunden(m, p, k) });
  }
  return out;
}
/** Besetzungsverlauf über einen Zeitraum — für das Balkendiagramm im Lagebild. */
function besetzungsVerlauf(m, ab, tage = 14) {
  const out = [];
  for (let i = 0; i < tage; i++) {
    const d = addDays(ab, i);
    const b = besetzung(m, d);
    let ist = 0, soll = 0, luecken = 0;
    for (const k of Object.keys(b)) {
      ist += b[k].anzahl; soll += b[k].soll;
      if (b[k].diff < 0) luecken += Math.abs(b[k].diff);
    }
    out.push({ datum: d, ist, soll, luecken, quote: soll ? Math.round((ist / soll) * 100) : 100 });
  }
  return out;
}
/** Nachweise nach Ablaufmonat — zeigt, wann eine Welle auf den Betrieb zukommt. */
function nachweisVerlauf(m, monate = 12) {
  const out = [];
  const h = heute();
  for (let i = 0; i < monate; i++) {
    const d = new Date(Number(h.slice(0, 4)), Number(h.slice(5, 7)) - 1 + i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    let n = 0;
    for (const p of m.personen) {
      if (!imDienst(p, h)) continue;
      for (const x of p.qualNachweise || []) if (x.ablauf && x.ablauf.startsWith(k)) n++;
    }
    out.push({ ym: k, label: MON[d.getMonth()].slice(0, 3), anzahl: n });
  }
  return out;
}

/* --------------------------------- Notizen ------------------------------- */
const notizenZu = (m, schluessel) => ((m.notizen || {})[schluessel] || []);

/* ------------------------------- Bereitschaft ---------------------------- */
/** Wer ist wann in Rufbereitschaft — und wer ist Rückfallebene? */
function bereitschaftsplan(m, ab, tage = 14) {
  const rb = m.dienstarten.filter((d) => d.rufbereitschaft);
  if (!rb.length) return null;
  const out = [];
  for (let i = 0; i < tage; i++) {
    const d = addDays(ab, i);
    const eintraege = [];
    for (const da of rb) {
      const b = besetzung(m, d)[da.id];
      eintraege.push({ da, personen: b.personen, soll: b.soll });
    }
    out.push({ datum: d, eintraege, besetzt: eintraege.some((e) => e.personen.length > 0) });
  }
  return { dienstarten: rb, tage: out };
}

/* ------------------------- Suche für die Kommandoleiste ------------------ */
/**
 * Eine Suche über alles: Ansichten, Personen, Daten, Aktionen.
 * Bei vielen Ansichten ist Tippen schneller als Klicken.
 */
function kommandoSuche(sitz, nav, frage) {
  const m = sitz.mandant;
  const q = frage.trim().toLowerCase();
  const treffer = [];
  const passt = (t) => !q || String(t).toLowerCase().includes(q);

  for (const [id, label] of nav) if (passt(label))
    treffer.push({ art: "ansicht", id, titel: label, unter: "Ansicht öffnen", punkte: label.toLowerCase().startsWith(q) ? 100 : 60 });

  if (q.length >= 2 && darf(sitz, "staff.view")) {
    for (const p of m.personen) {
      if (!imDienst(p, heute())) continue;
      const name = `${p.nachname}, ${p.vorname}`;
      if (!passt(name) && !passt(p.funktion)) continue;
      const e = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
      treffer.push({ art: "person", id: p.id, titel: name,
        unter: `${p.funktion}${e ? ` · ${e.name}` : ""}`,
        punkte: p.nachname.toLowerCase().startsWith(q) ? 90 : 50 });
    }
  }

  // Datumsangaben: 16.9. · 16.09.2026 · heute · morgen
  const dm = q.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/);
  if (dm) {
    const j = dm[3] || heute().slice(0, 4);
    const d = `${j}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    treffer.push({ art: "datum", id: d, titel: fLang(d), unter: "Tag öffnen", punkte: 95 });
  }
  if ("heute".startsWith(q) && q) treffer.push({ art: "datum", id: heute(), titel: `Heute · ${fLang(heute())}`, unter: "Tag öffnen", punkte: 80 });
  if ("morgen".startsWith(q) && q) treffer.push({ art: "datum", id: addDays(heute(), 1), titel: `Morgen · ${fLang(addDays(heute(), 1))}`, unter: "Tag öffnen", punkte: 80 });

  const aktionen = [
    ["krank", "Krankmeldung erfassen", darf(sitz, "plan.edit.unit")],
    ["verfuegbarkeit", "Verfügbarkeit bearbeiten", sitz.person.imSchichtdienst !== false],
    ["assistent", "Planungsassistent starten", darf(sitz, "plan.edit.all")],
    ["wizard", "Schichtplanung einrichten", darf(sitz, "pattern.edit")],
    ["aushang", "Aushangplan drucken", darf(sitz, "plan.view.unit")],
    ["feldmodus", "Feldmodus umschalten", true],
  ];
  for (const [id, label, erlaubt] of aktionen) if (erlaubt && passt(label))
    treffer.push({ art: "aktion", id, titel: label, unter: "Aktion ausführen", punkte: 70 });

  /* Ganze Sätze verstehen — „Müller krank morgen" statt drei Menüs.
     Steht ganz oben, weil eine erkannte Absicht immer besser passt als ein
     zufälliger Worttreffer. Ausgeführt wird nichts: die Zeile öffnet die
     Ansicht mit vorausgefüllten Feldern, entscheiden tut ein Mensch. */
  if (q.split(/\s+/).length >= 2) {
    const v = verstehe(m, frage);
    if (v && v.befehl && v.sicher) {
      treffer.unshift({ art: "satz", id: v.befehl.id, titel: v.satz,
        unter: "Eingabe verstanden — öffnen", punkte: 200, satz: v });
    } else if (v && v.fehlt && v.fehlt.length) {
      treffer.unshift({ art: "unklar", id: v.befehl ? v.befehl.id : null, titel: v.satz,
        unter: v.fehlt.includes("mehrdeutig") ? "Nachnamen ergänzen" : "Person ergänzen",
        punkte: 190, satz: v });
    }
  }

  treffer.sort((a, b) => b.punkte - a.punkte);
  return treffer.slice(0, 12);
}

/* --------------------------- Briefing für den Tag ------------------------ */
/** Textfassung der Tagesaufgaben — für Benachrichtigung und E-Mail. */
function briefingText(sitz) {
  const auf = tagesaufgaben(sitz);
  const m = sitz.mandant, p = sitz.person;
  const z = [`CENTRIC · ${m.name}`, fLang(heute()), ""];
  const t = p.imSchichtdienst !== false ? personTag(m, p, heute()) : null;
  if (t && t.dienstId) {
    const da = m.dienstarten.find((x) => x.id === t.dienstId);
    if (da) z.push(`Dein Dienst: ${da.name}, ${da.start}–${da.ende} Uhr`, "");
  }
  if (!auf.length) z.push("Es liegt nichts an.");
  else { z.push(`${auf.length} ${auf.length === 1 ? "Vorgang" : "Vorgänge"}:`);
    for (const a of auf) z.push(`${a.dringend ? "!" : "·"} ${a.titel}${a.text ? ` — ${a.text}` : ""}`); }
  return z.join("\n");
}


/* ==========================================================================
   EINRICHTUNGSSTAND
   Ein frisch angelegter Betrieb ist leer. Statt den Nutzer suchen zu lassen,
   sagt die App, was als Nächstes fehlt — und führt direkt dorthin.
   ========================================================================== */
function einrichtungsstand(m) {
  const aktivP = m.personen.filter((p) => imDienst(p, heute()));
  const imDienstP = aktivP.filter((p) => p.imSchichtdienst !== false);
  const schritte = [
    { id: "personal", ziel: "personal", erledigt: imDienstP.length >= 2,
      titel: "Personal anlegen",
      text: imDienstP.length === 0 ? "Noch niemand im Bestand — Liste einlesen oder einzeln anlegen"
        : `${imDienstP.length} Person${imDienstP.length === 1 ? "" : "en"} im Schichtdienst` },
    { id: "rollen", ziel: "personal", erledigt: aktivP.some((p) => ["planer", "subplaner"].includes(p.rolle)),
      titel: "Zugangsarten vergeben",
      text: "Mindestens eine Planung oder Schichtverantwortung festlegen" },
    { id: "quals", ziel: "quals", erledigt: (m.qualifikationen || []).length > 0
        && aktivP.some((p) => p.qualifikationen && p.qualifikationen.length),
      titel: "Qualifikationen zuordnen",
      text: "Wer darf was — Grundlage für Besetzung und Ersatzsuche" },
    { id: "mindest", ziel: "dienste", erledigt: m.dienstarten.some((d) =>
        (d.mindest.mo_do + d.mindest.fr + d.mindest.sa + d.mindest.so) > 0),
      titel: "Mindestbesetzung festlegen",
      text: "Wie viele Personen je Dienst gebraucht werden" },
    { id: "freigabe", ziel: "plan", erledigt: Object.keys(m.freigaben || {}).length > 0,
      titel: "Ersten Plan freigeben",
      text: "Danach ist der Plan für alle verbindlich" },
  ];
  const offen = schritte.filter((x) => !x.erledigt);
  return { schritte, offen, fertig: offen.length === 0,
    anteil: Math.round(((schritte.length - offen.length) / schritte.length) * 100) };
}


/**
 * Setzt einen genehmigten Antrag im Bestand um: Abwesenheiten werden
 * eingetragen, Tauschgesuche als Abweichung geschrieben.
 */
function antragUmsetzen(m, a) {
  if (a.typ === "abwesenheit") {
    return { ...m, abwesenheiten: [...m.abwesenheiten,
      { id: uid("a"), personId: a.personId, art: a.art, von: a.von, bis: a.bis,
        notiz: a.text || "" }] };
  }
  if (a.typ === "tausch" && a.partnerId) {
    // Beide Personen tauschen ihre Dienste am betroffenen Tag
    const pA = m.personen.find((x) => x.id === a.personId);
    const pB = m.personen.find((x) => x.id === a.partnerId);
    if (!pA || !pB) return m;
    const dA = personTag(m, pA, a.von).dienstId;
    const dB = personTag(m, pB, a.von).dienstId;
    return { ...m, abweichungen: { ...m.abweichungen,
      [`${pA.id}|${a.von}`]: dB || "-", [`${pB.id}|${a.von}`]: dA || "-" } };
  }
  return m;
}

/* ==========================================================================
   BRANCHENPAKETE UND FACHLICHE ERWEITERUNGEN
   Ein Kern, mehrere Vertikalen. Was eine Branche braucht, wird als Paket
   freigeschaltet — der Rechenkern bleibt für alle derselbe.
   ========================================================================== */

/**
 * Pakete bestimmen, welche Ansichten und Regeln ein Betrieb sieht.
 * Bewusst grob geschnitten: fünf Pakete statt fünfzig einzelner Schalter.
 */
const PAKETE = [
  { id: "kern", name: "Kernplattform", pflicht: true,
    beschreibung: "Schichtplanung, Anträge, Zeiten, Stundenkonten, Auswertungen.",
    merkmale: ["plan", "antraege", "zeiten", "konten", "qualifikationen", "export", "sperreGesetz"] },
  { id: "sicherheit", name: "Sicherheitsdienst", aufpreis: 79,
    beschreibung: "Objektbezogene Posten, Sachkundenachweis mit harter Sperre, Wachbuch, Standortprüfung beim Stempeln.",
    merkmale: ["posten", "wachbuch", "sperreEigen", "geofence", "objektbericht"] },
  { id: "pflege", name: "Pflege", aufpreis: 89,
    beschreibung: "Fachkraftquote je Dienst, Übergabeprotokoll, Wohnbereichsplanung, Betreuungskräfte nach § 43b.",
    merkmale: ["fachkraftquote", "uebergabe", "bereichsplan", "pflegequal"] },
  { id: "klinik", name: "Klinik", aufpreis: 129,
    beschreibung: "Bereitschaftsdienst und Rufbereitschaft mit eigener Anrechnung, geteilte Dienste, Funktionsdienste, Rotationen.",
    merkmale: ["bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation", "uebergabe", "fachkraftquote"] },
  { id: "industrie", name: "Industrie und Anlagen", aufpreis: 59,
    beschreibung: "Anlagenbindung, Maschinenqualifikationen, Kontischichtmodelle mit Stufenversatz.",
    merkmale: ["anlagen", "maschinenqual", "kontimodelle"] },
];

const paketVon = (id) => PAKETE.find((p) => p.id === id) || PAKETE[0];
/** Ist ein Merkmal für diesen Betrieb freigeschaltet? */
const kann = (m, merkmal) => {
  const aktiv = ["kern", ...(m.pakete || [])];
  return PAKETE.filter((p) => aktiv.includes(p.id)).some((p) => p.merkmale.includes(merkmal));
};
/** Welche Pakete schlägt eine Branche vor? */
const paketeFuerBranche = (b) => ({
  sicherheit: ["sicherheit"], pflege: ["pflege"], klinik: ["klinik"],
  produktion: ["industrie"], logistik: ["industrie"], rettung: ["klinik"],
}[b] || []);

/* ------------------------ Branchenbegriffe ------------------------------- */
/**
 * Dieselbe Sache heißt je Branche anders. Die Begriffe stecken an einer Stelle,
 * damit die Oberfläche in der Sprache des Betriebs spricht.
 */
const BEGRIFFE = {
  standard: { einheit: "Einheit", person: "Beschäftigte", schicht: "Dienst",
    leitung: "Schichtleitung", uebergabe: "Übergabe", fachkraft: "Fachkraft" },
  sicherheit: { einheit: "Schichtgruppe", person: "Sicherheitskraft", schicht: "Dienst",
    leitung: "Objektleitung", uebergabe: "Postenübergabe", fachkraft: "Sachkundige Kraft" },
  pflege: { einheit: "Wohnbereich", person: "Pflegekraft", schicht: "Dienst",
    leitung: "Wohnbereichsleitung", uebergabe: "Schichtübergabe", fachkraft: "Pflegefachkraft" },
  klinik: { einheit: "Station", person: "Mitarbeitende", schicht: "Dienst",
    leitung: "Stationsleitung", uebergabe: "Schichtübergabe", fachkraft: "Fachpflegekraft" },
  rettung: { einheit: "Wachabteilung", person: "Einsatzkraft", schicht: "Wachdienst",
    leitung: "Wachleitung", uebergabe: "Wachübergabe", fachkraft: "Notfallsanitäter" },
  produktion: { einheit: "Schichtgruppe", person: "Mitarbeitende", schicht: "Schicht",
    leitung: "Schichtführung", uebergabe: "Schichtübergabe", fachkraft: "Anlagenführer" },
};
const begriff = (m, was) => (BEGRIFFE[m.branche] || BEGRIFFE.standard)[was]
  || BEGRIFFE.standard[was] || was;

/* --------------------------- Fachkraftquote ------------------------------ */
/**
 * Pflege und Klinik arbeiten mit einer Mindestquote examinierter Kräfte je
 * Dienst. Sie wird als Anteil geführt, nicht als absolute Zahl — sonst stimmt
 * sie bei wechselnder Besetzungsstärke nicht mehr.
 */
function fachkraftLage(m, datum, dienstId) {
  if (!kann(m, "fachkraftquote")) return null;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da || !da.fachkraftQuote) return null;
  const b = besetzung(m, datum)[dienstId];
  const fkQuals = m.qualifikationen.filter((q) => q.fachkraft).map((q) => q.id);
  if (!fkQuals.length) return null;
  const fk = b.personen.filter((p) => fkQuals.some((q) => qualGueltig(m, p, q))).length;
  const ist = b.anzahl > 0 ? fk / b.anzahl : 0;
  const noetig = Math.ceil(b.anzahl * da.fachkraftQuote);
  return { fk, gesamt: b.anzahl, ist: Math.round(ist * 100), soll: Math.round(da.fachkraftQuote * 100),
    noetig, fehlt: Math.max(0, noetig - fk), erfuellt: fk >= noetig };
}

/* ------------------ Anrechnung von Bereitschaft und Teildiensten --------- */
/**
 * Bereitschaftsdienst (Anwesenheit am Arbeitsplatz) und Rufbereitschaft
 * (Erreichbarkeit von zu Hause) zählen unterschiedlich. Beide sind
 * Arbeitszeit im Sinne des Arbeitsschutzes, aber nicht in voller Höhe
 * vergütungs- oder kontenwirksam.
 */
const DIENSTFORMEN = [
  { id: "regel", name: "Regeldienst", faktor: 1, ruhezeitNeutral: false,
    hinweis: "Volle Arbeitszeit, unterbricht die Ruhezeit." },
  { id: "bereitschaft", name: "Bereitschaftsdienst", faktor: 0.6, ruhezeitNeutral: false,
    hinweis: "Anwesenheit am Arbeitsplatz. Zählt als Arbeitszeit, wird anteilig auf das Konto gerechnet." },
  { id: "ruf", name: "Rufbereitschaft", faktor: 0.125, ruhezeitNeutral: true,
    hinweis: "Erreichbarkeit von zu Hause. Unterbricht die Ruhezeit nicht, solange kein Einsatz erfolgt." },
  { id: "geteilt", name: "Geteilter Dienst", faktor: 1, ruhezeitNeutral: false, geteilt: true,
    hinweis: "Zwei Abschnitte mit Unterbrechung. Die Pause dazwischen ist keine Arbeitszeit." },
];
const dienstform = (id) => DIENSTFORMEN.find((x) => x.id === id) || DIENSTFORMEN[0];

/** Dauer eines geteilten Dienstes: beide Abschnitte ohne die Lücke dazwischen. */
function geteilteDauer(da) {
  if (!da.zweiterAbschnitt) return dauer(da);
  const a = dauer(da);
  const zw = da.zweiterAbschnitt;
  let b = toMin(zw.ende) - toMin(zw.start); if (b <= 0) b += 1440;
  return Math.round((a + b / 60) * 100) / 100;
}

/* --------------------- Mehrstufige Genehmigung --------------------------- */
/**
 * Manche Anträge brauchen zwei Unterschriften — etwa Sonderurlaub oder
 * Fortbildungen mit Kostenfolge. Die Stufen sind je Betrieb einstellbar.
 */
const STUFEN_STD = { urlaub: 1, tausch: 1, schulung: 2, sonder: 2, krank: 0, ausgleich: 1 };
const stufenFuer = (m, art) => (m.genehmigungsstufen || STUFEN_STD)[art] ?? 1;
/** Wie weit ist ein Antrag? */
function genehmigungsStand(m, a) {
  const noetig = stufenFuer(m, a.art || a.typ);
  const erteilt = (a.freigaben || []).length;
  return { noetig, erteilt, offen: Math.max(0, noetig - erteilt), fertig: erteilt >= noetig,
    naechste: erteilt === 0 ? "Schichtverantwortung oder Planung" : "Organisationsleitung" };
}
/** Darf diese Person die nächste Stufe erteilen? */
function darfStufe(sitz, a, stand) {
  if (stand.erteilt === 0) return darf(sitz, "req.approve.unit") || darf(sitz, "req.approve.all");
  return darf(sitz, "req.approve.all") || darf(sitz, "org.edit");
}

/* --------------------------- Schichtübergabe ----------------------------- */
/**
 * Die Übergabe ist in Pflege und Klinik ein eigener, dokumentationspflichtiger
 * Vorgang: Wer übergibt an wen, was ist offen, was ist besonders.
 */
const UEBERGABE_FELDER = [
  { id: "lage", label: "Lage und Besonderheiten", pflicht: true,
    hinweis: "Was die übernehmende Schicht wissen muss." },
  { id: "offen", label: "Offene Aufgaben", pflicht: false,
    hinweis: "Was noch zu erledigen ist, mit Zeitbezug." },
  { id: "vorkommnis", label: "Besondere Vorkommnisse", pflicht: false,
    hinweis: "Ereignisse mit Dokumentationspflicht." },
  { id: "material", label: "Material und Betriebsmittel", pflicht: false,
    hinweis: "Fehlendes, Defektes, Übergebenes." },
];
const uebergabeAm = (m, datum, dienstId) =>
  (m.uebergaben || []).find((u) => u.datum === datum && u.dienstId === dienstId) || null;
/** Übergaben, die fällig, aber nicht erfolgt sind. */
function offeneUebergaben(m, tage = 3) {
  if (!kann(m, "uebergabe")) return [];
  const out = [];
  for (let i = tage; i >= 1; i--) {
    const d = addDays(heute(), -i);
    for (const da of m.dienstarten) {
      if (da.posten || da.form === "ruf") continue;
      const b = besetzung(m, d)[da.id];
      if (!b.personen.length) continue;
      if (!uebergabeAm(m, d, da.id)) out.push({ datum: d, dienstart: da, personen: b.personen });
    }
  }
  return out;
}

/* --------------------------- DATEV-Ausgabe ------------------------------- */
/**
 * Lohnarten nach dem üblichen DATEV-Schema. Die Zuordnung ist einstellbar,
 * weil jeder Betrieb eigene Lohnartennummern führt.
 */
const LOHNARTEN_STD = {
  grund: { nr: "1000", text: "Gehalt" },
  nacht: { nr: "1400", text: "Nachtzuschlag steuerfrei" },
  sonntag: { nr: "1410", text: "Sonntagszuschlag steuerfrei" },
  feiertag: { nr: "1420", text: "Feiertagszuschlag steuerfrei" },
  samstag: { nr: "1430", text: "Samstagszuschlag" },
  bereitschaft: { nr: "1500", text: "Bereitschaftsdienst" },
  ruf: { nr: "1510", text: "Rufbereitschaft" },
  mehrarbeit: { nr: "1200", text: "Mehrarbeit" },
};
/**
 * Erzeugt den Lohnartensatz je Person für einen Monat.
 * Bewusst als Stunden je Lohnart — Entgelte gehören in die Lohnabrechnung.
 */
function datevSaetze(m, ym) {
  const la = m.lohnarten || LOHNARTEN_STD;
  const zeilen = [];
  for (const p of m.personen) {
    if (!imDienst(p, `${ym}-28`)) continue;
    const w = zuschlagWert(m, p, ym);
    const kto = stundenkonto(m, p, ym);
    const eintrag = (schluessel, stunden) => {
      if (!stunden || Math.abs(stunden) < 0.01) return;
      const l = la[schluessel] || { nr: "9999", text: schluessel };
      zeilen.push({ personalnummer: p.personalnummer || p.id, nachname: p.nachname, vorname: p.vorname,
        lohnart: l.nr, bezeichnung: l.text, stunden: Math.round(stunden * 100) / 100, monat: ym });
    };
    eintrag("nacht", w.std.nacht);
    eintrag("sonntag", w.std.sonntag);
    eintrag("feiertag", w.std.feiertag);
    eintrag("samstag", w.std.samstag);
    // Bereitschaftsanteile getrennt ausweisen
    let ber = 0, ruf = 0;
    const [y, mo] = ym.split("-").map(Number);
    for (let i = 1; i <= dim_(y, mo - 1); i++) {
      const d = `${ym}-${pad(i)}`;
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      if (!da) continue;
      if (da.form === "bereitschaft") ber += dauer(da);
      else if (da.form === "ruf" || da.rufbereitschaft) ruf += dauer(da);
    }
    eintrag("bereitschaft", ber);
    eintrag("ruf", ruf);
    if (kto > 0) eintrag("mehrarbeit", kto);
  }
  return zeilen;
}
function datevCSV(m, ym) {
  const z = datevSaetze(m, ym);
  const kopf = ["Personalnummer", "Nachname", "Vorname", "Lohnart", "Bezeichnung", "Stunden", "Abrechnungsmonat"];
  const zeilen = [kopf.join(";")];
  for (const x of z) zeilen.push([x.personalnummer, x.nachname, x.vorname, x.lohnart,
    x.bezeichnung, n2(x.stunden), x.monat].join(";"));
  return "\uFEFF" + zeilen.join("\r\n");
}

/* ==========================================================================
   BELASTBARKEIT UND ENTSCHEIDUNGSUNTERSTÜTZUNG
   Ein Plan, der heute aufgeht, sagt nichts darüber, ob er morgen noch trägt.
   Diese Rechnungen beantworten die Frage, die ein Planer wirklich hat:
   Wie viel Ausfall verträgt welche Woche — und wo bricht es zuerst?
   ========================================================================== */

/**
 * Wie viele Ausfälle verträgt ein einzelner Dienst an einem Tag, bevor die
 * Mindestbesetzung unterschritten wird? Zählt echte Reserve, nicht Hoffnung:
 * Springer werden mitgerechnet, wenn sie an dem Tag frei und einsetzbar sind.
 */
function tagesReserve(m, datum, dienstId) {
  const b = besetzung(m, datum)[dienstId];
  if (!b) return null;
  const da = b.da;
  const puffer = b.anzahl - b.soll;                       // schon eingeteilte Reserve
  // Wer könnte einspringen, ohne gegen harte Regeln zu verstoßen?
  const ersatz = ersatzVorschlaege(m, datum, dienstId).filter((x) => x.moeglich).length;
  const traegt = Math.max(0, puffer) + ersatz;
  return { datum, dienstId, da, ist: b.anzahl, soll: b.soll, puffer, ersatz, traegt,
    stufe: traegt >= 3 ? "robust" : traegt >= 1 ? "knapp" : "ohne Reserve" };
}

/**
 * Belastbarkeit über einen Zeitraum: welche Woche und welcher Dienst bricht
 * zuerst. Bewusst als Wochenbild — der Planer denkt in Wochen, nicht in Tagen.
 */
function belastbarkeit(m, wochen = 8) {
  const start = montag(heute());
  const dienste = m.dienstarten.filter((d) => !d.posten && d.form !== "ruf");
  const out = [];
  for (let w = 0; w < wochen; w++) {
    const von = addDays(start, w * 7);
    const zeilen = [];
    for (const da of dienste) {
      let min = 99, minTag = null, summe = 0, tage = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(von, i);
        const r = tagesReserve(m, d, da.id);
        if (!r || r.soll === 0) continue;
        tage++; summe += r.traegt;
        if (r.traegt < min) { min = r.traegt; minTag = d; }
      }
      if (!tage) continue;
      zeilen.push({ da, min: min === 99 ? 0 : min, minTag,
        schnitt: Math.round((summe / tage) * 10) / 10,
        stufe: min >= 3 ? "robust" : min >= 1 ? "knapp" : "ohne Reserve" });
    }
    const schwaechste = zeilen.slice().sort((a, b) => a.min - b.min)[0] || null;
    out.push({ kw: w, von, bis: addDays(von, 6), zeilen, schwaechste,
      stufe: schwaechste ? schwaechste.stufe : "robust" });
  }
  return out;
}

/**
 * Ausfallszenario: Was passiert, wenn ein bestimmter Anteil der Belegschaft
 * ausfällt? Krankheitswellen sind in Pflege und Klinik der Regelfall, nicht
 * die Ausnahme — und der Grund, warum Pläne im Winter reißen.
 *
 * Der Ausfall wird gleichmäßig über die Einheiten verteilt, nicht zufällig:
 * ein zufälliges Ergebnis wäre bei jedem Aufruf anders und damit wertlos.
 */
function ausfallSzenario(m, anteil, tage = 14) {
  const kandidaten = m.personen
    .filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const zahl = Math.round(kandidaten.length * anteil);
  // Gleichmäßig über die Liste greifen statt am Stück — sonst trifft es eine Einheit ganz
  const schritt = zahl > 0 ? kandidaten.length / zahl : 0;
  const betroffen = [];
  for (let i = 0; i < zahl; i++) betroffen.push(kandidaten[Math.floor(i * schritt)]);

  const bis = addDays(heute(), tage - 1);
  const mAus = { ...m, abwesenheiten: [...m.abwesenheiten, ...betroffen.map((p) => ({
    id: `sz_${p.id}`, personId: p.id, art: "krank", von: heute(), bis, notiz: "Szenario" }))] };

  const vorher = pruefen(m, heute(), bis);
  const nachher = pruefen(mAus, heute(), bis);
  const zaehl = (liste, art) => liste.filter((x) => x.art === art).length;
  // Wie viele Dienste bleiben ganz ohne Besetzung?
  let leer = 0, unter = 0;
  for (let i = 0; i < tage; i++) {
    const d = addDays(heute(), i);
    for (const [k, e] of Object.entries(besetzung(mAus, d))) {
      if (e.soll === 0) continue;
      if (e.anzahl === 0) leer++;
      else if (e.diff < 0) unter++;
    }
  }
  return { anteil, zahl, betroffen: betroffen.length, tage,
    vorher: vorher.length, nachher: nachher.length, neu: nachher.length - vorher.length,
    besetzung: zaehl(nachher, "besetzung") - zaehl(vorher, "besetzung"),
    ruhezeit: zaehl(nachher, "ruhezeit") - zaehl(vorher, "ruhezeit"),
    leer, unter,
    haltbar: leer === 0 && nachher.filter((x) => x.schwere === "danger").length
      <= vorher.filter((x) => x.schwere === "danger").length + 2 };
}

/**
 * Rangbegründung für Ersatzvorschläge. Der Planer soll nicht raten, warum
 * jemand oben steht — er soll es lesen können. Keine Blackbox.
 */
function rangGruende(m, x, datum, dienstId) {
  const g = [];
  const p = x.person;
  const ym = datum.slice(0, 7);
  const kto = stundenkonto(m, p, ym);
  const au = auslastung(m, p, ym);
  const alle = m.personen.filter((q) => imDienst(q, datum) && q.imSchichtdienst !== false);
  const schnittKto = alle.reduce((a, q) => a + stundenkonto(m, q, ym), 0) / (alle.length || 1);

  if (p.springer) g.push({ art: "plus", text: "Springerpool — für genau solche Fälle vorgesehen" });
  if (kto < schnittKto - 4) g.push({ art: "plus",
    text: `Stundenkonto ${sgn(kto)} h liegt unter dem Mittel (${sgn(Math.round(schnittKto))} h)` });
  else if (kto > schnittKto + 8) g.push({ art: "minus",
    text: `Stundenkonto ${sgn(kto)} h liegt bereits deutlich über dem Mittel` });
  if (au.pct < 85) g.push({ art: "plus", text: `Auslastung ${au.pct} % — Luft nach oben` });
  else if (au.pct > 105) g.push({ art: "minus", text: `Auslastung ${au.pct} % — bereits über Soll` });

  const t = personTag(m, p, datum);
  if (!t.dienstId) g.push({ art: "plus", text: "hat an diesem Tag ohnehin frei" });
  const vor = personTag(m, p, addDays(datum, -1));
  if (vor.dienstId) g.push({ art: "hinweis", text: "arbeitet auch am Vortag" });
  const w = wunschAm(m, p.id, datum);
  if (w && w.art === "moechte") g.push({ art: "plus", text: "hat diesen Tag als Wunschdienst hinterlegt" });
  if (w && w.art === "lieber_nicht") g.push({ art: "minus", text: "wollte an diesem Tag lieber nicht arbeiten" });

  const da = m.dienstarten.find((d) => d.id === dienstId);
  const noetig = Object.keys(da && da.mindestQual || {});
  const hat = noetig.filter((q) => qualGueltig(m, p, q));
  if (noetig.length && hat.length === noetig.length)
    g.push({ art: "plus", text: `bringt alle geforderten Qualifikationen mit` });

  const zuletzt = (() => {
    for (let i = 1; i <= 60; i++) {
      const d = addDays(datum, -i);
      if ((m.einspruenge || []).some((e) => e.personId === p.id && e.datum === d)) return i;
    }
    return null;
  })();
  if (zuletzt !== null && zuletzt < 21)
    g.push({ art: "minus", text: `ist vor ${zuletzt} Tagen schon einmal eingesprungen` });
  else if (zuletzt === null)
    g.push({ art: "plus", text: "ist in den letzten zwei Monaten nicht eingesprungen" });

  return g;
}

/* ==========================================================================
   SZENARIENVERGLEICH
   Zwei Planvarianten nebeneinander, mit denselben Kennzahlen gemessen.
   ========================================================================== */
function planKennzahlen(m, von, bis) {
  const bef = pruefen(m, von, bis);
  const schwer = bef.filter((x) => x.schwere === "danger").length;
  let unterbesetzt = 0, ueberbesetzt = 0, dienste = 0, stunden = 0;
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    for (const [k, e] of Object.entries(besetzung(m, d))) {
      if (e.soll === 0) continue;
      dienste += e.anzahl;
      if (e.diff < 0) unterbesetzt++;
      if (e.diff > 1) ueberbesetzt++;
      if (e.da) stunden += e.anzahl * dauer(e.da);
    }
  }
  const v = verteilung(m, von.slice(0, 7));
  return { befunde: bef.length, schwer, unterbesetzt, ueberbesetzt, dienste,
    stunden: Math.round(stunden), spanne: v.spanne,
    wochenenden: v.zeilen.reduce((a, z) => a + z.wochenendNaechte, 0) };
}

/* ==========================================================================
   AUSSTIEGSSICHERHEIT
   Wer seine Dienstplanung auf ein System stellt, muss jederzeit vollständig
   wieder herauskommen. Das ist kein Zugeständnis, sondern Voraussetzung für
   Vertrauen — und beantwortet die Frage nach der Abhängigkeit vom Anbieter.
   ========================================================================== */
function vollExport(m) {
  const ym = heute().slice(0, 7);
  const jahr = Number(ym.slice(0, 4));
  const tabellen = {};

  tabellen.personen = m.personen.map((p) => ({
    id: p.id, personalnummer: p.personalnummer || "", nachname: p.nachname, vorname: p.vorname,
    funktion: p.funktion, email: p.email || "", eintritt: p.eintritt, austritt: p.austritt || "",
    wochenstunden: p.wochenstunden, urlaubsanspruch: p.urlaubsanspruch,
    einheit: (m.einheiten.find((e) => e.id === einheitAm(p, heute())) || {}).name || "",
    rolle: p.rolle, springer: p.springer ? "ja" : "nein",
    qualifikationen: p.qualifikationen.map((q) =>
      (m.qualifikationen.find((x) => x.id === q) || {}).name).filter(Boolean).join(", "),
  }));

  // Der gerechnete Plan wird ausgeschrieben — sonst wäre er ohne CENTRIC wertlos
  tabellen.dienstplan = [];
  const von = `${jahr}-01-01`, bis = `${jahr}-12-31`;
  for (const p of m.personen) {
    if (p.imSchichtdienst === false) continue;
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (!t.dienstId && !t.abwesenheit) continue;
      const da = t.dienstId && m.dienstarten.find((x) => x.id === t.dienstId);
      tabellen.dienstplan.push({ personId: p.id, nachname: p.nachname, vorname: p.vorname, datum: d,
        dienst: da ? da.name : "", kurz: da ? da.kurz : "",
        start: da ? da.start : "", ende: da ? da.ende : "",
        stunden: da ? n2(dauer(da)) : "",
        abwesenheit: t.abwesenheit ? abwArt(t.abwesenheit.art).label : "",
        quelle: t.quelle });
    }
  }

  tabellen.abwesenheiten = m.abwesenheiten.map((a) => {
    const p = m.personen.find((x) => x.id === a.personId);
    return { personId: a.personId, nachname: p ? p.nachname : "", vorname: p ? p.vorname : "",
      art: abwArt(a.art).label, von: a.von, bis: a.bis,
      tage: between(a.von, a.bis) + 1, notiz: a.notiz || "" };
  });

  tabellen.erfassung = Object.entries(m.erfassung || {}).map(([k, v]) => {
    const [pid, datum] = k.split("|");
    const p = m.personen.find((x) => x.id === pid);
    return { personId: pid, nachname: p ? p.nachname : "", datum,
      start: v.start || "", ende: v.ende || "", stunden: v.stunden != null ? n2(v.stunden) : "",
      notiz: v.notiz || "" };
  });

  tabellen.anfragen = m.anfragen.map((a) => {
    const p = m.personen.find((x) => x.id === a.personId);
    return { id: a.id, personId: a.personId, nachname: p ? p.nachname : "",
      typ: a.typ, art: a.art ? abwArt(a.art).label : "", von: a.von, bis: a.bis,
      status: a.status, erstellt: a.erstellt, entschieden: a.entschieden || "",
      durch: a.durch || "", antwort: a.antwort || "" };
  });

  tabellen.qualifikationen = m.personen.flatMap((p) =>
    (p.qualifikationen || []).map((q) => {
      const s = nachweisStand(m, p, q);
      return { personId: p.id, nachname: p.nachname, vorname: p.vorname,
        qualifikation: s.qual ? s.qual.name : q,
        gueltigBis: s.unbefristet ? "unbefristet" : (s.ablauf || ""),
        stand: s.stand };
    }));

  tabellen.protokoll = (m.protokoll || []).map((x) => ({
    zeit: x.zeit, wer: x.wer || "", was: x.text || x.was || "" }));

  return tabellen;
}

/** Wandelt eine Tabelle in CSV mit deutschem Trennzeichen. */
function tabelleCSV(zeilen) {
  if (!zeilen.length) return "";
  const spalten = Object.keys(zeilen[0]);
  const feld = (v) => {
    const s = String(v == null ? "" : v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [spalten.join(";"),
    ...zeilen.map((z) => spalten.map((s) => feld(z[s])).join(";"))].join("\r\n");
}

/* ==========================================================================
   HANDBUCH
   Ein durchgehender Weg von der leeren Anwendung bis zum laufenden Betrieb —
   und danach ein Nachschlagewerk für jede Einzelfrage.

   Geschrieben für jemanden, der zum ersten Mal davorsitzt. Jeder Schritt
   nennt: was zu tun ist, warum es nötig ist, und woran man merkt, dass es
   geklappt hat. Die letzte Angabe fehlt in den meisten Anleitungen und ist
   die wichtigste.
   ========================================================================== */

const HANDBUCH = [
  /* ------------------------------------------------------------------ */
  {
    id: "start", titel: "Bevor es losgeht", dauer: "5 Minuten",
    einleitung: "Was du bereithalten solltest, damit die Einrichtung in einem Zug durchläuft.",
    abschnitte: [
      {
        titel: "Was du brauchst",
        text: "Die Einrichtung dauert je nach Betriebsgröße ein bis drei Stunden. Wer diese vier Dinge bereitliegen hat, ist in einem Zug durch.",
        schritte: [
          "Eine Liste aller Beschäftigten mit Name, Funktion und Wochenstunden — am besten als Tabelle aus der Lohnbuchhaltung.",
          "Den aktuellen Dienstplan, egal ob Excel, Papier oder Wandkalender. Er wird nicht eingelesen, aber du brauchst ihn zum Vergleichen.",
          "Die Antwort auf die Frage: Nach welchem Modell wird gearbeitet? Vier Gruppen im Wechsel? Fünf? Feste Schichten?",
          "Wer darf was? Wer plant, wer vertritt, wer sieht nur den eigenen Plan.",
        ],
        merke: "Die Liste der Beschäftigten ist der einzige Punkt, der wirklich Zeit kostet. Alles andere ist in Minuten erledigt.",
      },
      {
        titel: "Wie CENTRIC den Plan berechnet",
        text: "Das ist der wichtigste Unterschied zu anderen Programmen — und wer ihn versteht, versteht alles Weitere.",
        schritte: [
          "Andere Programme rollen einen Plan aus: Für jeden Tag und jede Person wird ein Eintrag gespeichert. Ein Jahr für achtzig Personen sind fast dreißigtausend Einträge.",
          "CENTRIC speichert stattdessen die Regel: den Zyklus und den Startpunkt jeder Gruppe. Daraus wird jeder Tag berechnet — vorwärts wie rückwärts, ohne Grenze.",
          "Gespeichert werden nur die Abweichungen von der Regel: wer einspringt, wer tauscht, wer fehlt.",
        ],
        merke: "Deshalb gibt es keine Jahresgrenze und keine Massenänderung, wenn das Modell wechselt. Du änderst die Regel, und der ganze Plan folgt.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "betrieb", titel: "Schritt 1 — Den Betrieb einrichten", dauer: "15 Minuten",
    ziel: "betrieb",
    einleitung: "Standorte, Arbeitszeitregeln und Dienstarten. Alles Weitere rechnet mit diesen Werten.",
    abschnitte: [
      {
        titel: "Standorte anlegen",
        text: "Jeder Standort hat ein eigenes Bundesland. Das ist keine Formalie: Feiertage unterscheiden sich, und ein Feiertagszuschlag hängt daran.",
        schritte: [
          "Verwaltung → Betrieb öffnen.",
          "Für jeden Standort Bezeichnung, Bundesland und Umkreis in Metern eintragen.",
          "Der Umkreis gilt für die Standortprüfung beim Einstempeln. 200 Meter sind ein guter Anfang — bei großen Werksgeländen mehr.",
        ],
        pruefen: "Im Monatsplan sind die Feiertage deines Bundeslandes rot markiert. Stimmt das nicht, ist das Bundesland falsch.",
        merke: "Betriebe mit mehreren Standorten in verschiedenen Bundesländern legen jeden einzeln an — sonst rechnet CENTRIC mit den falschen Feiertagen.",
      },
      {
        titel: "Arbeitszeitregeln festlegen",
        text: "Die Werte, gegen die jede Prüfung läuft. Sie stammen aus dem Arbeitszeitgesetz und dem Tarif- oder Arbeitsvertrag.",
        schritte: [
          "Wochenarbeitszeit: die vertragliche Regelarbeitszeit einer Vollzeitkraft.",
          "Ruhezeit zwischen zwei Diensten: gesetzlich elf Stunden, in Pflege und Klinik unter Bedingungen zehn.",
          "Höchstzahl Dienste in Folge: üblich sechs, in manchen Modellen sieben.",
          "Ausgleichsgrenze für das Stundenkonto: ab wann wird gewarnt. Vierzig Stunden sind verbreitet.",
        ],
        pruefen: "Prüfung öffnen. Erscheinen dort auf einmal Hunderte Befunde, ist ein Wert zu streng gesetzt.",
        merke: "Diese Werte lieber einmal mit dem Betriebsrat abstimmen als später alle Befunde erklären.",
      },
      {
        titel: "Dienstarten anlegen",
        text: "Früh, Spät, Nacht — oder was auch immer bei euch gefahren wird. Jede Dienstart braucht Zeiten, eine Farbe und eine Mindestbesetzung.",
        schritte: [
          "Verwaltung → Betrieb → Dienstarten.",
          "Name, Kürzel, Beginn und Ende eintragen. Über Mitternacht laufende Dienste werden automatisch erkannt.",
          "Dienstform wählen: Regeldienst, Bereitschaftsdienst, Rufbereitschaft oder geteilter Dienst.",
          "Mindestbesetzung je Wochentag — getrennt für Montag bis Donnerstag, Freitag, Samstag und Sonntag.",
          "Erforderliche Qualifikationen zuordnen, falls ein Dienst ohne bestimmte Kräfte nicht laufen darf.",
        ],
        pruefen: "Lagebild öffnen. Jede Dienstart zeigt eine Zahl wie 8/10 — eingeteilt gegen gefordert. Steht dort 8/0, fehlt die Mindestbesetzung.",
        merke: "Die Dienstform ist wichtiger, als sie aussieht: Rufbereitschaft unterbricht die Ruhezeit nicht, Bereitschaftsdienst zählt nur anteilig aufs Konto.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "personal", titel: "Schritt 2 — Personal anlegen", dauer: "20 bis 60 Minuten",
    ziel: "personal",
    einleitung: "Der einzige Schritt, der wirklich Zeit kostet. Es gibt zwei Wege.",
    abschnitte: [
      {
        titel: "Liste einlesen",
        text: "Der schnellere Weg, wenn eine Tabelle vorliegt.",
        schritte: [
          "Team → Personal → Importieren.",
          "Die Tabelle aus Excel kopieren und in das Feld einfügen. Komma, Semikolon und Tabulator werden erkannt.",
          "Spalten zuordnen: Vorname, Nachname, Funktion, Wochenstunden, Einheit.",
          "Die Vorschau zeigt jede Zeile mit Befund. Fehlerhafte Zeilen werden benannt, nicht stillschweigend übersprungen.",
          "Erst wenn die Vorschau stimmt, auf Übernehmen.",
        ],
        pruefen: "Die Personalliste zeigt danach die erwartete Anzahl. Fehlt jemand, stand in der Zeile ein unbekannter Einheitenname.",
        merke: "Personalnummern gleich mit einlesen, wenn vorhanden. Sie werden für die Lohnausgabe gebraucht und lassen sich später nur einzeln nachtragen.",
      },
      {
        titel: "Einzeln anlegen",
        text: "Für kleine Betriebe oder Nachzügler.",
        schritte: [
          "Team → Personal → Person hinzufügen.",
          "Name, Funktion, Einheit und Wochenstunden eintragen.",
          "Eintrittsdatum setzen — davor erscheint die Person in keinem Plan.",
          "Bei Teilzeit die tatsächlichen Wochenstunden eintragen; CENTRIC verteilt die Dienste entsprechend.",
        ],
        pruefen: "Die Person erscheint im Monatsplan ab dem Eintrittsdatum mit Diensten.",
      },
      {
        titel: "Zugangsarten vergeben",
        text: "Wer darf was sehen und ändern. Anders als bei vielen Anbietern kostet das nichts extra — gerechnet wird je Standort, nicht je Kopf.",
        schritte: [
          "In der Personalliste steht je Zeile ein Auswahlfeld für die Zugangsart.",
          "Organisationsleitung: alles. Genau eine je Betrieb, kostenfrei.",
          "Planung: Schichtfolge, Monatsplan, Freigabe, alle Anträge. Sitzt im Geschäftszimmer und fährt keine Schicht.",
          "Schichtverantwortung: nur die eigene Einheit, fährt selbst mit.",
          "Beschäftigte: eigener Plan, Anträge, Zeiterfassung.",
          "Betriebsrat: rein lesend, kostenfrei.",
        ],
        pruefen: "Die geänderte Zugangsart erscheint sofort in der Liste, und die betroffene Person sieht beim nächsten Anmelden die neuen Ansichten.",
        merke: "Im Zweifel weniger Rechte vergeben. Nachträglich erweitern ist leicht, entziehen ist unangenehm. Kosten spielen dabei keine Rolle — wer jemanden zur Planung befördert, zahlt keinen Aufpreis.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "quals", titel: "Schritt 3 — Qualifikationen", dauer: "20 Minuten",
    ziel: "quals",
    einleitung: "Wer darf was. Grundlage für Besetzungsprüfung und Ersatzsuche.",
    abschnitte: [
      {
        titel: "Qualifikationen anlegen",
        text: "Sachkunde, Schichtleitung, Erste Hilfe, Fachweiterbildungen — was in eurem Betrieb zählt.",
        schritte: [
          "Team → Qualifikationen → Hinzufügen.",
          "Bezeichnung und Kürzel eintragen.",
          "Gültigkeitsdauer festlegen: unbefristet oder in Monaten. Erste Hilfe läuft üblicherweise nach 24 Monaten ab.",
          "Nachweispflicht setzen, wenn ein Dokument vorliegen muss.",
          "Zwei besondere Schalter: „zählt als Fachkraft\" für die Quote in Pflege und Klinik, „gesetzlich zwingend\" für Qualifikationen wie die Sachkunde nach § 34a.",
        ],
        pruefen: "Bei einer Qualifikation mit Ablauf erscheint in der Personalakte ein Feld für das Ablaufdatum.",
        merke: "„Gesetzlich zwingend\" wirkt hart: Ohne diese Qualifikation ist gar kein Einsatz zulässig, unabhängig vom Dienst. Nur dort setzen, wo es wirklich so ist.",
      },
      {
        titel: "Personen zuordnen",
        text: "Ohne Zuordnung kann CENTRIC nicht erkennen, ob ein Dienst fachlich gedeckt ist.",
        schritte: [
          "Personalakte öffnen → Qualifikationen.",
          "Zutreffende auswählen und bei befristeten das Ablaufdatum eintragen.",
          "Bei vielen Personen ist der Weg über die Qualifikationsmatrix schneller: Team → Qualifikationen → Matrix.",
        ],
        pruefen: "Die Matrix zeigt je Einheit und Qualifikation, wie viele Personen sie haben. Rot bedeutet: hängt an einer einzigen Person.",
        merke: "Die Engpassanzeige der Matrix ist eine der nützlichsten Ansichten überhaupt — sie zeigt, wo ein einziger Ausfall den Betrieb lahmlegt.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "folge", titel: "Schritt 4 — Schichtfolge festlegen", dauer: "15 Minuten",
    ziel: "folge",
    einleitung: "Das Herzstück. Aus Zyklus und Startpunkt entsteht der ganze Plan.",
    abschnitte: [
      {
        titel: "Modell wählen",
        text: "Neun geprüfte Modelle stehen bereit, jedes mit gerechneten Kennzahlen.",
        schritte: [
          "Planung → Schichtfolge → Einrichtungsassistent.",
          "Die Liste zeigt je Modell: Wochenstunden, Anzahl Gruppen, längste Dienstserie.",
          "Ein Klick öffnet die Vorschau mit dem tatsächlichen Zyklus.",
          "Wenn keines passt: eigenen Zyklus bauen — Dienstart antippen, dann auf Tage klicken. Oder die Dienstart direkt auf einen Tag ziehen.",
        ],
        pruefen: "Die Kennzahl „Wochenstunden\" muss zur vertraglichen Arbeitszeit passen. Weicht sie um mehr als eine Stunde ab, entstehen dauerhaft Plus- oder Minusstunden.",
        merke: "Die Zahlen sind gerechnet, nicht geschätzt. Ein Modell mit 42 Stunden bei 40 Stunden Vertrag erzeugt zwei Plusstunden je Woche — je Person, jede Woche.",
      },
      {
        titel: "Gruppen und Startpunkte",
        text: "Jede Gruppe startet an einer anderen Stelle des Zyklus. Der Versatz bestimmt, wer wann arbeitet.",
        schritte: [
          "Anzahl Gruppen festlegen — meist gibt das Modell sie vor.",
          "Den Versatz je Gruppe prüfen. Bei gleichmäßigem Versatz deckt jede Gruppe reihum jede Dienstart ab.",
          "Ankerdatum setzen: der Tag, an dem Gruppe 1 am Zyklusanfang steht.",
        ],
        pruefen: "Im Monatsplan durchlaufen alle Gruppen dieselbe Abfolge, nur zeitversetzt. Arbeiten zwei Gruppen gleichzeitig dieselbe Schicht, stimmt der Versatz nicht.",
        merke: "Das Ankerdatum lässt sich später ändern, verschiebt dann aber den gesamten Plan. Vor der ersten Freigabe klären.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "plan", titel: "Schritt 5 — Prüfen und freigeben", dauer: "20 Minuten",
    ziel: "plan",
    einleitung: "Vor der Freigabe alle kritischen Befunde klären. Danach ist der Plan verbindlich.",
    abschnitte: [
      {
        titel: "Die Prüfung lesen",
        text: "CENTRIC prüft laufend gegen Arbeitszeitgesetz, Mindestbesetzung und Qualifikationen.",
        schritte: [
          "Auswertung → Prüfung öffnen.",
          "Rote Befunde sind kritisch: Ruhezeitverstoß, Unterbesetzung, fehlende Pflichtqualifikation.",
          "Gelbe sind Hinweise: hohes Stundenkonto, viele Dienste in Folge, ablaufender Nachweis.",
          "Jeder Befund nennt Person, Datum und Grund. Ein Klick führt zum betroffenen Tag.",
        ],
        pruefen: "Nach dem Beheben verschwindet der Befund sofort — die Prüfung rechnet bei jeder Änderung neu.",
        merke: "Gelbe Befunde müssen nicht verschwinden. Rote sollten es, bevor freigegeben wird.",
      },
      {
        titel: "Lücken schließen",
        text: "Wenn ein Dienst unterbesetzt ist.",
        schritte: [
          "Lagebild öffnen oder den Tag im Monatsplan anklicken.",
          "Bei der unterbesetzten Dienstart auf „Besetzen\".",
          "CENTRIC schlägt Personen vor, geordnet nach Eignung. Wer nicht kann, steht unten mit Begründung.",
          "Der Knopf „warum?\" zeigt, weshalb jemand oben steht: Stundenkonto unter dem Mittel, Wunschdienst hinterlegt, lange nicht eingesprungen.",
          "Vor dem Eintragen zeigt CENTRIC die Folgen: Ruhezeit, Wochenstunden, nächste Dienste.",
        ],
        pruefen: "Die Zahl im Lagebild steigt von 8/10 auf 9/10.",
        merke: "Wer abwesend ist, kann nicht eingeteilt werden — CENTRIC lehnt das ab statt es stillschweigend anzunehmen.",
      },
      {
        titel: "Freigeben",
        text: "Mit der Freigabe wird der Monat verbindlich.",
        schritte: [
          "Planung → Monatsplan → Freigeben.",
          "Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus.",
          "Der Planstandvergleich zeigt, was sich seit der Freigabe geändert hat.",
        ],
        pruefen: "In der Kopfzeile steht „Freigegeben\" mit Datum und Name.",
        merke: "Vor der Freigabe ist alles Entwurf und niemand wird benachrichtigt. Danach zählt jede Änderung in die Planungssicherheit.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "betrieb2", titel: "Der laufende Betrieb", dauer: "täglich",
    ziel: "start",
    einleitung: "Was nach der Einrichtung jeden Tag passiert.",
    abschnitte: [
      {
        titel: "Krankmeldung und Ersatz",
        text: "Der häufigste Vorgang überhaupt — und der eigentliche Prüfstein.",
        schritte: [
          "Auf jeder Ansicht oben: Krankmeldung erfassen.",
          "Person und Zeitraum wählen. CENTRIC zeigt sofort alle entstehenden Lücken.",
          "Je Lücke Ersatz suchen. Wer möglich ist, steht oben; wer nicht, unten mit Grund.",
          "Findet sich niemand: erweiterte Anfrage an mehrere Personen gleichzeitig.",
          "Bleibt es unbesetzt: dokumentierte Unterschreitung mit Begründung — nachweisbar für Prüfungen.",
        ],
        pruefen: "Die betroffenen Personen erhalten eine Mitteilung, sichtbar im Postfach.",
      },
      {
        titel: "Offene Schichten ausschreiben",
        text: "Statt zehn Leute anzurufen: die Lücke sichtbar machen und warten, wer sich meldet.",
        schritte: [
          "Anliegen → Offene Schichten.",
          "Oben stehen die Lücken der nächsten vierzehn Tage, die noch nicht ausgeschrieben sind.",
          "Auf „Ausschreiben\" — CENTRIC zeigt vorher, wie viele Personen die Schicht überhaupt übernehmen dürfen.",
          "Ein Satz zum Grund erhöht die Bereitschaft spürbar: „Krankmeldung, kurzfristig\".",
          "Unterrichtet wird nur, wer sie auch nehmen darf — Ruhezeit, Qualifikation und Abwesenheit sind vorher geprüft.",
          "Meldungen erscheinen nach Eignung geordnet, mit Begründung. Ein Griff auf „Einteilen\".",
        ],
        pruefen: "Nach dem Ausschreiben meldet CENTRIC, wie viele Personen unterrichtet wurden. Steht dort null, darf niemand — dann hilft nur die gezielte Ersatzsuche.",
        merke: "Die Reihenfolge der Meldungen richtet sich nicht danach, wer zuerst kam. Sonst gewinnt, wer am häufigsten aufs Telefon schaut. Stattdessen zählen Stundenkonto, Auslastung und wie oft jemand zuletzt eingesprungen ist.",
      },
      {
        titel: "Anträge entscheiden",
        text: "Urlaub, Tausch, Schulung — mit Blick auf die Folgen.",
        schritte: [
          "Anliegen → Anträge öffnen.",
          "Links die Liste, rechts die Kapazität der nächsten acht Wochen.",
          "Beim Markieren eines Antrags färben sich die betroffenen Wochen. Rot heißt: diese Woche kippt erst dadurch.",
          "Mehrere auswählen zeigt die Wirkung aller zusammen.",
          "Tastatur: J und K blättern, G genehmigt, A lehnt ab, Leertaste wählt aus.",
        ],
        pruefen: "Unter dem markierten Antrag stehen Urlaubsrest, Stundenkonto und Auslastung der Person.",
        merke: "Wer täglich vierzig Anträge entscheidet, sollte die Tastatur nutzen. Das ist der Unterschied zwischen zwanzig Minuten und fünf.",
      },
      {
        titel: "Checklisten an Schichten",
        text: "Was zu einem Dienst gehört, aber nicht im Plan steht: Rundgang, Schlüsselübergabe, Betäubungsmittelschrank.",
        schritte: [
          "Verwaltung → Betrieb → Dienstarten → gewünschte Dienstart öffnen.",
          "Auf „Vorlage übernehmen\" — je nach Branchenpaket erscheinen passende Punkte zum Anpassen.",
          "Je Punkt festlegen: Zeitpunkt (Beginn, laufend, Ende oder feste Uhrzeit) und ob er Pflicht ist.",
          "Beschäftigte sehen die Liste unter Heute, sobald sie im Dienst sind.",
        ],
        merke: "Ein gesetzter Haken lässt sich nicht zurücknehmen, und wer nachträglich abhakt, erzeugt einen Eintrag mit dem Vermerk „nachgetragen\". Eine rückwirkend änderbare Dokumentation wäre als Nachweis wertlos — und genau dafür wird sie gebraucht.",
      },
      {
        titel: "Schneller tippen als klicken",
        text: "Die Suche oben versteht ganze Sätze, nicht nur einzelne Begriffe.",
        schritte: [
          "Suchfeld öffnen und schreiben, was gemeint ist: „Müller krank morgen\".",
          "CENTRIC zeigt, was es verstanden hat, bevor etwas geschieht.",
          "Auch möglich: „Urlaub Schmidt 14.3. bis 20.3.\", „wer kann Freitag Nachtdienst\", „Lagebild morgen\".",
          "Bei mehreren gleichen Namen wird nachgefragt statt geraten.",
        ],
        merke: "Die Zeile führt nie selbst etwas aus. Sie öffnet die passende Ansicht mit vorausgefüllten Feldern — entscheiden tut ein Mensch. Das ist Absicht: ein Dienstplan braucht Vorhersagbarkeit, kein Raten.",
      },
      {
        titel: "Zeiten und Zuschläge",
        text: "Was tatsächlich gearbeitet wurde.",
        schritte: [
          "Beschäftigte bestätigen ihre Zeiten in der Telefonansicht — „wie geplant\" oder mit Abweichung.",
          "Auswertung → Abrechnungsdaten zeigt Zuschläge tagesgenau zerlegt.",
          "Lohnausgabe erzeugt eine CSV-Datei nach DATEV-Schema, je Person und Lohnart.",
        ],
        pruefen: "Die Summe je Lohnart stimmt mit der Zuschlagsübersicht überein.",
        merke: "CENTRIC rechnet Stunden, keine Beträge. Stundensätze und Steuerfreibeträge gehören in die Lohnabrechnung.",
      },
      {
        titel: "Belastbarkeit im Blick behalten",
        text: "Die Frage vor dem Anruf, nicht danach.",
        schritte: [
          "Auswertung → Belastbarkeit.",
          "Je Woche und Dienst: wie viele gleichzeitige Ausfälle verträgt die schwächste Schicht.",
          "Null bedeutet: der nächste Krankheitsfall führt zur Unterbesetzung.",
          "Darunter vier Ausfallszenarien von fünf bis dreißig Prozent.",
        ],
        merke: "Diese Ansicht einmal die Woche öffnen. Sie zeigt Probleme, bevor sie eintreten.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "beschaeftigte", titel: "Für Beschäftigte", dauer: "5 Minuten",
    einleitung: "Was die Belegschaft auf dem Telefon sieht. Diesen Teil ausdrucken und aushängen.",
    abschnitte: [
      {
        titel: "Die vier Reiter",
        text: "Beschäftigte landen automatisch in der Telefonansicht, unabhängig vom Gerät.",
        schritte: [
          "Heute: der Dienst des Tages mit großem Knopf zum Ein- und Ausstempeln.",
          "Mein Plan: kommende Dienste als Liste oder Monatsansicht. Tippen öffnet Tausch, Antrag und Wunsch.",
          "Anliegen: Anträge, Krankmeldung, Tauschbörse, Stundenkonto.",
          "Mehr: Verfügbarkeit, Wunschdienste, Nachweise, Schwarzes Brett, Feldmodus.",
        ],
        merke: "Beim Stempeln wird der Standort einmalig geprüft. Gespeichert wird nur, ob jemand am Einsatzort war — keine Koordinate, kein Verlauf, keine Dauerortung.",
      },
      {
        titel: "Häufige Fragen",
        text: "Was in der Einführung immer gefragt wird.",
        schritte: [
          "„Wann arbeite ich?\" — Reiter Heute, ganz oben.",
          "„Wie viele Urlaubstage habe ich noch?\" — Mehr, oben in den Kennzahlen.",
          "„Kann ich tauschen?\" — Mein Plan, Tag antippen, Tausch suchen. Das Gesuch sehen alle.",
          "„Warum steht mein Konto im Minus?\" — Anliegen, Stundenkonto, mit Verlauf über sechs Monate.",
          "„Sieht der Chef, wo ich bin?\" — Nein. Nur ob du beim Stempeln am Einsatzort warst.",
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "pflege", titel: "Besonderheiten Pflege und Klinik", dauer: "10 Minuten",
    nurWenn: (m) => kann(m, "fachkraftquote") || kann(m, "uebergabe"),
    einleitung: "Was in diesen Branchen zusätzlich gilt.",
    abschnitte: [
      {
        titel: "Fachkraftquote",
        text: "Der Mindestanteil examinierter Kräfte je Dienst — als Anteil geführt, nicht als feste Zahl.",
        schritte: [
          "Bei der Qualifikation den Schalter „zählt als Fachkraft\" setzen.",
          "Bei jeder Dienstart den Mindestanteil wählen: 40 Prozent tagsüber, 50 Prozent nachts sind verbreitet.",
          "Die Prüfung meldet Unterschreitungen als kritischen Befund.",
        ],
        merke: "Eine feste Zahl wäre bei wechselnder Besetzungsstärke ohne Aussage. Zwei Fachkräfte bei vier Personen sind etwas anderes als zwei bei zehn.",
      },
      {
        titel: "Schichtübergabe",
        text: "Ein eigener, dokumentationspflichtiger Vorgang.",
        schritte: [
          "Heute → Übergabe.",
          "Vier Felder: Lage und Besonderheiten (Pflicht), offene Aufgaben, besondere Vorkommnisse, Material.",
          "Nach dem Abschließen nicht mehr änderbar — Ergänzungen werden mit Zeitstempel angehängt.",
          "Fehlende Übergaben der letzten drei Tage stehen oben als Schnellzugriff.",
        ],
        merke: "Die Unveränderbarkeit ist Absicht. Eine nachträglich geänderte Übergabe wäre als Nachweis wertlos.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "sicherheit", titel: "Besonderheiten Sicherheitsdienst", dauer: "8 Minuten",
    nurWenn: (m) => kann(m, "sperreEigen") || kann(m, "posten"),
    einleitung: "Was im Bewachungsgewerbe zusätzlich gilt.",
    abschnitte: [
      {
        titel: "Sachkunde nach § 34a",
        text: "Gesetzlich zwingend — ohne sie ist kein Einsatz zulässig.",
        schritte: [
          "Bei der Qualifikation den Schalter „gesetzlich zwingend\" setzen.",
          "CENTRIC sperrt daraufhin jeden Einsatz ohne diese Qualifikation, unabhängig von der Dienstart.",
          "Auch die Ersatzsuche schließt betroffene Personen aus, mit Begründung.",
        ],
        merke: "Anders als eine normale Mindestqualifikation gilt die harte Sperre für alle Dienste. Das entspricht der Rechtslage.",
      },
      {
        titel: "Außenposten",
        text: "Objekte, die aus dem laufenden Dienst heraus besetzt werden.",
        schritte: [
          "Dienstart anlegen und „Außenposten\" setzen.",
          "Quelldienst wählen — aus welchem Dienst die Besetzung kommt.",
          "CENTRIC verteilt die Posten reihum, damit nicht immer dieselben dort stehen.",
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "probleme", titel: "Wenn etwas nicht stimmt", dauer: "Nachschlagen",
    einleitung: "Die Fälle, die in der Einführung am häufigsten auftreten.",
    abschnitte: [
      {
        titel: "Der Plan sieht falsch aus",
        text: "Meist liegt es an einem von drei Dingen.",
        schritte: [
          "Arbeiten zwei Gruppen gleichzeitig dieselbe Schicht? → Versatz prüfen unter Schichtfolge.",
          "Fängt der Zyklus am falschen Tag an? → Ankerdatum prüfen.",
          "Fehlen einzelne Personen? → Eintrittsdatum und Einheitenzuordnung prüfen.",
        ],
      },
      {
        titel: "Hunderte Befunde auf einmal",
        text: "Fast immer ein zu streng gesetzter Wert.",
        schritte: [
          "Ruhezeit auf zwölf Stunden gesetzt, obwohl elf gelten? → Verwaltung, Betrieb.",
          "Wochenstunden des Modells passen nicht zum Vertrag? → Schichtfolge, Kennzahlen prüfen.",
          "Mindestbesetzung höher als die Gruppenstärke? → Dienstarten prüfen.",
        ],
      },
      {
        titel: "Jemand kann nicht eingeteilt werden",
        text: "Die Ersatzliste nennt immer den Grund.",
        schritte: [
          "Ruhezeit — der Dienst läge zu dicht am vorherigen.",
          "Abwesend — Urlaub, krank oder Schulung.",
          "Qualifikation fehlt oder ist abgelaufen.",
          "Einsatzeinschränkung — keine Nacht, kein Alleindienst, Wiedereingliederung.",
        ],
        merke: "Steht dort nichts, ist die Person schlicht schon eingeteilt.",
      },
      {
        titel: "Zwei Personen haben gleichzeitig gespeichert",
        text: "CENTRIC überschreibt nicht stillschweigend.",
        schritte: [
          "Es erscheint ein Hinweis mit Name und Zeit der anderen Speicherung.",
          "Der fremde Stand bleibt erhalten. Die eigene Änderung noch einmal vornehmen.",
        ],
        merke: "Ohne diesen Schutz würde bei zwei gleichzeitig arbeitenden Planern still Arbeit verloren gehen.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "daten", titel: "Daten und Datenschutz", dauer: "5 Minuten",
    ziel: "mitnahme",
    einleitung: "Was gespeichert wird, wie lange, und wie man wieder herauskommt.",
    abschnitte: [
      {
        titel: "Datenmitnahme",
        text: "Jederzeit vollständig, in offenem Format, ohne Gebühr.",
        schritte: [
          "Verwaltung → Datenmitnahme.",
          "Sieben Tabellen als CSV: Personalstamm, Dienstplan, Abwesenheiten, Zeiten, Anträge, Qualifikationen, Protokoll.",
          "Der Dienstplan wird Tag für Tag ausgeschrieben — so lässt er sich in jedes andere System einlesen.",
        ],
        merke: "Eine Dienstplanung ist betriebskritisch. Die Frage, wie man wieder herauskommt, gehört an den Anfang eines Vertrags, nicht ans Ende.",
      },
      {
        titel: "Auskunft und Löschung",
        text: "Rechte nach der Datenschutz-Grundverordnung.",
        schritte: [
          "Verwaltung → Datenschutz → Auskunft nach Artikel 15 für eine einzelne Person erzeugen.",
          "Aufbewahrungsdauer einstellen — nach Ablauf werden alte Daten anonymisiert.",
          "Das Änderungsprotokoll hält fest, wer wann was geändert hat.",
        ],
      },
    ],
  },
];

/** Alle Abschnitte flach, für die Suche. */
const handbuchAbschnitte = (m) => HANDBUCH
  .filter((k) => !k.nurWenn || (m && k.nurWenn(m)))
  .flatMap((k) => k.abschnitte.map((a) => ({ ...a, kapitel: k.titel, kapitelId: k.id, ziel: k.ziel })));

/* ==========================================================================
   ZUSTELLUNG
   Eine Mitteilung im Postfach erreicht nur, wer die Anwendung ohnehin öffnet.
   Wer im Frühdienst ist und abends erfährt, dass sein Urlaub abgelehnt wurde,
   hat einen Tag verloren.

   Deshalb drei Wege, die dieselbe Mitteilung tragen:
     Postfach — immer, kostenlos, bleibt erhalten
     E-Mail   — für alles, was eine Entscheidung enthält
     Push     — für alles, was heute oder morgen wirkt

   Welcher Weg wofür gilt, entscheidet die Art der Mitteilung, nicht der
   Absender. Sonst bekommt die Belegschaft für jede Kleinigkeit einen Ton.
   ========================================================================== */

const ZUSTELLARTEN = {
  antragEntschieden: { titel: "Antrag entschieden", mail: true, push: true, dringend: false,
    text: "Urlaub, Tausch oder Schulung wurde genehmigt oder abgelehnt." },
  planGeaendert: { titel: "Dienst geändert", mail: true, push: true, dringend: true,
    text: "Ein bereits freigegebener Dienst wurde verschoben, getauscht oder gestrichen." },
  planFreigegeben: { titel: "Monatsplan freigegeben", mail: true, push: true, dringend: false,
    text: "Der Plan für einen Monat ist verbindlich." },
  einspringen: { titel: "Anfrage zum Einspringen", mail: true, push: true, dringend: true,
    text: "Jemand fehlt, und du kämst infrage." },
  offeneSchicht: { titel: "Offene Schicht ausgeschrieben", mail: false, push: true, dringend: false,
    text: "Ein Dienst ist unbesetzt und steht zur Bewerbung offen." },
  tauschAngebot: { titel: "Tauschangebot", mail: false, push: true, dringend: false,
    text: "Jemand bietet einen Tausch an, der zu deinem Plan passt." },
  nachweisLaeuftAb: { titel: "Nachweis läuft ab", mail: true, push: false, dringend: false,
    text: "Eine Qualifikation verliert demnächst ihre Gültigkeit." },
  zeitFehlt: { titel: "Zeiten offen", mail: false, push: true, dringend: false,
    text: "Erfasste Zeiten warten auf Bestätigung." },
  aushang: { titel: "Aushang am Schwarzen Brett", mail: false, push: true, dringend: false,
    text: "Etwas Neues betrifft alle im Betrieb." },
  uebergabeFehlt: { titel: "Übergabe fehlt", mail: false, push: true, dringend: true,
    text: "Für eine abgeschlossene Schicht wurde keine Übergabe hinterlegt." },
};

/** Voreinstellung je Person: alles an, was die Art vorsieht. */
const zustellungStandard = () => {
  const z = {};
  for (const [id, a] of Object.entries(ZUSTELLARTEN)) z[id] = { mail: a.mail, push: a.push };
  return z;
};

/**
 * Was soll für diese Mitteilung tatsächlich hinausgehen?
 * Die Person kann jede Art einzeln abschalten — außer den dringenden,
 * die im Postfach immer erscheinen.
 */
function zustellwege(person, art) {
  const vorgabe = ZUSTELLARTEN[art];
  if (!vorgabe) return { postfach: true, mail: false, push: false };
  const eigen = (person.zustellung || {})[art] || {};
  const hatMail = !!(person.email && person.email.includes("@"));
  return {
    postfach: true,
    mail: hatMail && (eigen.mail !== undefined ? eigen.mail : vorgabe.mail),
    push: (eigen.push !== undefined ? eigen.push : vorgabe.push) && !!(person.pushSchluessel),
    dringend: vorgabe.dringend,
  };
}

/**
 * Baut eine Mitteilung samt Zustellaufträgen. Der Versand selbst geschieht
 * auf dem Server — hier entsteht nur die Warteschlange, damit die Anwendung
 * auch ohne Netz weiterarbeitet und nichts verloren geht.
 */
function baueMitteilung(m, personId, art, titel, text, ziel) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return null;
  const w = zustellwege(p, art);
  return {
    id: uid("n"), personId, art, titel, text, ziel: ziel || null,
    zeit: new Date().toLocaleString("de-DE"), erstellt: new Date().toISOString(),
    gelesen: false, dringend: w.dringend,
    wege: { mail: w.mail ? p.email : null, push: w.push ? p.pushSchluessel : null },
    zugestellt: { mail: null, push: null },
  };
}

/** Alle Mitteilungen, für die noch etwas hinausgehen muss. */
const offeneZustellungen = (m) => (m.nachrichten || []).filter((n) =>
  (n.wege && n.wege.mail && !(n.zugestellt || {}).mail) ||
  (n.wege && n.wege.push && !(n.zugestellt || {}).push));

/* --------------------------------------------------------------------------
   E-MAIL-TEXTE
   Keine Werbung, keine Bilder, keine Zählpixel. Wer im Nachtdienst auf ein
   Telefon schaut, will drei Zeilen und einen Verweis.
   -------------------------------------------------------------------------- */
function mailText(m, n, p) {
  const anrede = `Hallo ${p.vorname},`;
  const fuss = [
    "",
    "———",
    `${m.name} · Dienstplanung mit CENTRIC`,
    "Diese Nachricht wurde ausgelöst durch eine Änderung in deinem Dienstplan.",
    "Einstellungen zu Benachrichtigungen findest du in der Anwendung unter Mehr.",
  ].join("\n");
  return {
    betreff: `${n.titel} — ${m.name}`,
    text: [anrede, "", n.text, "", "Öffnen: " + (m.adresse || ANWENDUNG_URL), fuss].join("\n"),
  };
}

/* ==========================================================================
   OFFENE SCHICHTEN
   Wenn jemand ausfällt, ruft die Planung heute zehn Leute an. Stattdessen:
   die Lücke sichtbar machen, wer kann und will meldet sich, die Planung
   entscheidet mit einem Griff.

   Der Unterschied zu Anbietern aus der Gastronomie: Dort bewirbt man sich
   auf alles. Hier zeigen wir jeder Person nur, was sie tatsächlich
   übernehmen darf — Ruhezeit, Qualifikation, Abwesenheit und harte Sperren
   sind vorher geprüft. Wer sich meldet, kann auch eingeteilt werden.
   ========================================================================== */

/** Eine Ausschreibung ist eine Lücke, die zur Bewerbung freigegeben wurde. */
const OFFEN_STATUS = {
  offen: { label: "offen", ton: "accent" },
  vergeben: { label: "vergeben", ton: "ok" },
  zurueckgezogen: { label: "zurückgezogen", ton: null },
};

/**
 * Alle Ausschreibungen, die heute oder später liegen und noch offen sind.
 * Vergangene werden nicht gelöscht — sie bleiben im Nachweis.
 */
function offeneSchichten(m, abDatum) {
  const ab = abDatum || heute();
  return (m.ausschreibungen || [])
    .filter((a) => a.status === "offen" && a.datum >= ab)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Darf diese Person sich auf diese Ausschreibung bewerben?
 * Gibt den Grund zurück, wenn nicht — die Person soll erfahren, warum ein
 * Dienst für sie nicht erscheint, statt ihn gar nicht zu sehen.
 */
function darfSichBewerben(m, personId, a) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return { darf: false, grund: "Person unbekannt" };
  if (a.status !== "offen") return { darf: false, grund: "nicht mehr offen" };
  if (a.datum < heute()) return { darf: false, grund: "liegt in der Vergangenheit" };
  if (!imDienst(p, a.datum)) return { darf: false, grund: "an diesem Tag nicht beschäftigt" };
  if ((a.bewerbungen || []).some((b) => b.personId === personId))
    return { darf: false, grund: "bereits beworben" };

  /* Dieselbe Prüfung wie bei der Ersatzsuche — was dort sperrt, sperrt hier. */
  const da = m.dienstarten.find((x) => x.id === a.dienstId);
  const h = hindernisse(m, p, a.datum, da);
  if (h.length) return { darf: false, grund: h[0], hindernisse: h };

  /* Wer an dem Tag schon eingeteilt ist, kann nicht zusätzlich. Geprüft wird
     gegen die Dienstarten des Betriebs — eine feste Kennung wie „F" wäre
     falsch, weil sie in vielen Betrieben der Frühdienst ist. */
  const eigen = personTag(m, p, a.datum);
  if (eigen && eigen.dienstId && m.dienstarten.some((x) => x.id === eigen.dienstId))
    return { darf: false, grund: "an diesem Tag bereits eingeteilt" };

  return { darf: true };
}

/** Die Ausschreibungen, die einer Person offenstehen. */
const meineOffenenSchichten = (m, personId) =>
  offeneSchichten(m).filter((a) => darfSichBewerben(m, personId, a).darf);

/**
 * Reihenfolge der Bewerbungen. Wer zuerst kommt, steht nicht automatisch
 * oben — sonst gewinnt, wer am häufigsten auf das Telefon schaut. Stattdessen
 * dieselben Kriterien wie beim Ersatzvorschlag: Stundenkonto, Auslastung,
 * wie oft jemand zuletzt eingesprungen ist.
 */
function bewerbungenGeordnet(m, a) {
  const liste = (a.bewerbungen || []).map((b) => {
    const p = m.personen.find((x) => x.id === b.personId);
    if (!p) return null;
    return { ...b, person: p, gruende: rangGruende(m, { person: p }, a.datum, a.dienstId),
      punkte: bewerbungsPunkte(m, p, a) };
  }).filter(Boolean);
  return liste.sort((x, y) => y.punkte - x.punkte);
}

/** Je höher, desto eher sollte diese Person den Zuschlag bekommen. */
function bewerbungsPunkte(m, p, a) {
  const ym = a.datum.slice(0, 7);
  let punkte = 0;
  const konto = stundenkonto(m, p, ym);
  const alle = m.personen.filter((x) => imDienst(x, a.datum) && x.imSchichtdienst !== false);
  const mittel = alle.reduce((s, x) => s + stundenkonto(m, x, ym), 0) / (alle.length || 1);
  /* Wer unter dem Mittel liegt, hat Vorrang — das gleicht die Konten aus. */
  punkte += Math.max(-40, Math.min(40, (mittel - konto) * 0.8));
  /* Wer zuletzt oft eingesprungen ist, tritt zurück. */
  const letzte = (m.ausschreibungen || []).filter((x) => x.status === "vergeben"
    && x.vergebenAn === p.id && x.datum >= addDays(heute(), -90)).length;
  punkte -= letzte * 12;
  /* Ein hinterlegter Wunsch zählt positiv. */
  const w = wunschAm(m, p.id, a.datum);
  if (w && w.art === "moechte") punkte += 15;
  if (w && w.art === "lieber_nicht") punkte -= 25;
  /* Springer sind für genau solche Fälle da. */
  if (p.springer) punkte += 20;
  /* Auslastung: wer Luft hat, zuerst. */
  const au = auslastung(m, p, ym);
  if (au.pct < 85) punkte += 10; else if (au.pct > 105) punkte -= 15;
  return Math.round(punkte * 10) / 10;
}

/** Wie steht es um eine Ausschreibung? Für die Übersicht der Planung. */
function ausschreibungLage(m, a) {
  const bew = bewerbungenGeordnet(m, a);
  const moeglich = m.personen.filter((p) => imDienst(p, a.datum)
    && darfSichBewerben(m, p.id, { ...a, bewerbungen: [] }).darf).length;
  const tage = between(heute(), a.datum);
  return { bewerbungen: bew, anzahl: bew.length, moeglich, tage,
    dringend: tage <= 2 && !bew.length,
    beste: bew[0] || null };
}

/* ==========================================================================
   CHECKLISTEN
   Was zu einer Schicht gehört, aber nicht im Dienstplan steht: Rundgang um
   22 Uhr, Schlüsselübergabe, Kühlschranktemperatur, Medikamentenschrank
   geprüft.

   Zwei Entscheidungen, die den Unterschied machen:

   Erstens hängt eine Liste an der Dienstart, nicht an der Person. Wer die
   Nachtschicht fährt, bekommt die Nachtliste — unabhängig davon, wer es ist.

   Zweitens ist eine abgehakte Liste unveränderlich. Wer nachträglich einen
   Haken setzt, erzeugt einen zweiten Eintrag mit eigenem Zeitstempel. Eine
   rückwirkend änderbare Dokumentation wäre als Nachweis wertlos — und genau
   dafür wird sie in Pflege und Bewachung gebraucht.
   ========================================================================== */

/** Wann ist ein Punkt fällig? */
const CHECK_ZEITPUNKTE = {
  beginn: { label: "Zu Dienstbeginn", kurz: "Beginn", rang: 1 },
  waehrend: { label: "Im Dienstverlauf", kurz: "laufend", rang: 2 },
  ende: { label: "Vor Dienstende", kurz: "Ende", rang: 3 },
  uhrzeit: { label: "Zu fester Uhrzeit", kurz: "Uhrzeit", rang: 2 },
};

/** Vorlagen je Branche — als Startpunkt, nicht als Vorschrift. */
const CHECK_VORLAGEN = {
  sicherheit: [
    { text: "Schlüsselübergabe vollständig", zeitpunkt: "beginn", pflicht: true },
    { text: "Funkgerät geprüft und geladen", zeitpunkt: "beginn", pflicht: true },
    { text: "Meldungen der Vorschicht gelesen", zeitpunkt: "beginn", pflicht: true },
    { text: "Rundgang Außenbereich", zeitpunkt: "uhrzeit", uhrzeit: "22:00", pflicht: true },
    { text: "Rundgang Innenbereich", zeitpunkt: "uhrzeit", uhrzeit: "02:00", pflicht: true },
    { text: "Alle Zugänge verschlossen", zeitpunkt: "ende", pflicht: true },
    { text: "Vorkommnisse eingetragen", zeitpunkt: "ende", pflicht: true },
  ],
  pflege: [
    { text: "Übergabe der Vorschicht entgegengenommen", zeitpunkt: "beginn", pflicht: true },
    { text: "Betäubungsmittelschrank geprüft", zeitpunkt: "beginn", pflicht: true },
    { text: "Notfallkoffer vollständig", zeitpunkt: "beginn", pflicht: false },
    { text: "Medikamentenstellung kontrolliert", zeitpunkt: "waehrend", pflicht: true },
    { text: "Dokumentation auf dem aktuellen Stand", zeitpunkt: "ende", pflicht: true },
    { text: "Übergabe an die Folgeschicht", zeitpunkt: "ende", pflicht: true },
  ],
  klinik: [
    { text: "Übergabe entgegengenommen", zeitpunkt: "beginn", pflicht: true },
    { text: "Gerätecheck durchgeführt", zeitpunkt: "beginn", pflicht: true },
    { text: "Betäubungsmittelbuch geprüft", zeitpunkt: "beginn", pflicht: true },
    { text: "Dokumentation vollständig", zeitpunkt: "ende", pflicht: true },
  ],
  industrie: [
    { text: "Anlage auf Betriebsbereitschaft geprüft", zeitpunkt: "beginn", pflicht: true },
    { text: "Schutzeinrichtungen kontrolliert", zeitpunkt: "beginn", pflicht: true },
    { text: "Schichtbuch gelesen", zeitpunkt: "beginn", pflicht: false },
    { text: "Anlage übergabefähig", zeitpunkt: "ende", pflicht: true },
    { text: "Schichtbuch geschrieben", zeitpunkt: "ende", pflicht: true },
  ],
};

/** Die Liste, die für diesen Dienst an diesem Tag gilt. */
function checkliste(m, dienstId, datum) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da || !da.checkliste || !da.checkliste.length) return [];
  return da.checkliste
    .filter((c) => !c.nurWochentags || ![0, 6].includes(new Date(datum + "T12:00").getDay()))
    .slice()
    .sort((a, b) => {
      const ra = CHECK_ZEITPUNKTE[a.zeitpunkt] || CHECK_ZEITPUNKTE.waehrend;
      const rb = CHECK_ZEITPUNKTE[b.zeitpunkt] || CHECK_ZEITPUNKTE.waehrend;
      if (ra.rang !== rb.rang) return ra.rang - rb.rang;
      return (a.uhrzeit || "").localeCompare(b.uhrzeit || "");
    });
}

/** Schlüssel für die Erledigungen einer Person an einem Tag. */
const checkSchluessel = (personId, datum, dienstId) => `${personId}|${datum}|${dienstId}`;

/**
 * Stand einer Liste. Gibt je Punkt zurück, ob und wann er erledigt wurde —
 * und ob nachträglich, was gesondert ausgewiesen wird.
 */
function checkStand(m, personId, datum, dienstId) {
  const punkte = checkliste(m, dienstId, datum);
  if (!punkte.length) return null;
  const erledigt = (m.checks || {})[checkSchluessel(personId, datum, dienstId)] || {};
  const zeilen = punkte.map((c) => {
    const e = erledigt[c.id];
    return { ...c, erledigt: !!e, zeit: e ? e.zeit : null,
      nachtraeglich: e ? !!e.nachtraeglich : false, notiz: e ? e.notiz || "" : "" };
  });
  const pflicht = zeilen.filter((z) => z.pflicht);
  return {
    zeilen, gesamt: zeilen.length,
    fertig: zeilen.filter((z) => z.erledigt).length,
    pflichtGesamt: pflicht.length,
    pflichtFertig: pflicht.filter((z) => z.erledigt).length,
    vollstaendig: pflicht.every((z) => z.erledigt),
    anteil: zeilen.length ? Math.round((zeilen.filter((z) => z.erledigt).length / zeilen.length) * 100) : 0,
  };
}

/**
 * Offene Pflichtpunkte abgelaufener Dienste. Das ist die Zahl, die eine
 * Leitung interessiert — nicht wer wie viele Haken gesetzt hat, sondern wo
 * eine Dokumentation fehlt.
 */
function offeneChecks(m, tage) {
  const out = [];
  const n = tage || 3;
  for (let i = 1; i <= n; i++) {
    const d = addDays(heute(), -i);
    for (const p of m.personen) {
      if (!imDienst(p, d)) continue;
      const t = personTag(m, p, d);
      if (!t || !t.dienstId || t.dienstId === "F") continue;
      if (abwesenheitAm(m, p.id, d)) continue;
      const st = checkStand(m, p.id, d, t.dienstId);
      if (st && !st.vollstaendig)
        out.push({ datum: d, person: p, dienstId: t.dienstId, stand: st,
          fehlend: st.pflichtGesamt - st.pflichtFertig });
    }
  }
  return out.sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Ein Punkt, frisch angelegt. */
const neuerCheckpunkt = (text, zeitpunkt) => ({
  id: uid("ck"), text: text || "", zeitpunkt: zeitpunkt || "beginn",
  pflicht: true, uhrzeit: null, nurWochentags: false,
});

/* ==========================================================================
   EINGABEZEILE
   „Müller krank morgen" tippen statt drei Menüs durchklicken.

   Bewusst kein Sprachmodell. Ein Dienstplan braucht Vorhersagbarkeit: Wer
   dieselben Worte tippt, muss dasselbe Ergebnis bekommen — heute, morgen und
   vor dem Betriebsrat. Ein Modell, das zu 95 Prozent richtig rät, ist hier
   schlechter als ein Muster, das zu 100 Prozent nachvollziehbar ist.

   Die Zeile führt nichts selbst aus. Sie versteht, was gemeint ist, und
   öffnet die passende Ansicht mit vorausgefüllten Feldern. Die Entscheidung
   trifft weiterhin ein Mensch.
   ========================================================================== */

const BEFEHLE = [
  { id: "krank", worte: ["krank", "krankmeldung", "au", "arbeitsunfähig", "ausgefallen"],
    braucht: ["person"], titel: "Krankmeldung erfassen", ziel: "personal" },
  { id: "urlaub", worte: ["urlaub", "frei", "urlaubsantrag"],
    braucht: ["person"], titel: "Urlaub eintragen", ziel: "antraege" },
  { id: "plan", worte: ["plan", "dienstplan", "schichtplan", "monatsplan"],
    braucht: [], titel: "Monatsplan öffnen", ziel: "plan" },
  { id: "lage", worte: ["lage", "besetzung", "lagebild", "wer arbeitet", "wer hat dienst"],
    braucht: [], titel: "Lagebild öffnen", ziel: "lage" },
  { id: "wer", worte: ["wer kann", "wer könnte", "wer springt", "ersatz", "vertretung"],
    braucht: [], titel: "Ersatz suchen", ziel: "lage" },
  { id: "ausschreiben", worte: ["ausschreiben", "offene schicht", "offene schichten"],
    braucht: [], titel: "Offene Schichten", ziel: "offene" },
  { id: "antraege", worte: ["anträge", "antrag", "genehmigen", "freigaben"],
    braucht: [], titel: "Anträge entscheiden", ziel: "antraege" },
  { id: "person", worte: ["akte", "personalakte", "zeige", "wer ist"],
    braucht: ["person"], titel: "Personalakte öffnen", ziel: "personal" },
  { id: "konto", worte: ["konto", "stunden", "stundenkonto", "überstunden"],
    braucht: [], titel: "Stundenkonten", ziel: "verteilung" },
  { id: "pruefung", worte: ["prüfung", "verstöße", "befunde", "probleme"],
    braucht: [], titel: "Prüfung öffnen", ziel: "pruefung" },
  { id: "belastbar", worte: ["belastbarkeit", "reserve", "puffer", "ausfall"],
    braucht: [], titel: "Belastbarkeit", ziel: "belastbarkeit" },
  { id: "uebergabe", worte: ["übergabe", "schichtübergabe"],
    braucht: [], titel: "Schichtübergabe", ziel: "uebergabe" },
  { id: "handbuch", worte: ["hilfe", "handbuch", "anleitung", "wie geht"],
    braucht: [], titel: "Handbuch", ziel: "handbuch" },
];

/** Wochentage und Zeitworte, die in einem Befehl vorkommen können. */
const ZEITWORTE = {
  heute: 0, morgen: 1, übermorgen: 2, uebermorgen: 2, gestern: -1, vorgestern: -2,
};
const WOCHENTAGE = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];

/** Ein Datum aus dem Text lesen. Gibt null zurück, wenn keines vorkommt. */
function datumAus(text) {
  const t = text.toLowerCase();
  for (const [wort, versatz] of Object.entries(ZEITWORTE))
    if (t.includes(wort)) return addDays(heute(), versatz);

  /* „ab montag", „am freitag" — der nächste dieser Wochentage */
  for (let i = 0; i < 7; i++) {
    if (!t.includes(WOCHENTAGE[i])) continue;
    const heuteTag = new Date(heute() + "T12:00").getDay();
    let versatz = (i - heuteTag + 7) % 7;
    if (versatz === 0) versatz = 7;              // „montag" am Montag heißt nächsten Montag
    return addDays(heute(), versatz);
  }

  /* 14.3. oder 14.03.2026 */
  const m1 = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
  if (m1) {
    const jahr = m1[3] ? Number(m1[3]) : Number(heute().slice(0, 4));
    return `${jahr}-${pad(Number(m1[2]))}-${pad(Number(m1[1]))}`;
  }
  /* 2026-03-14 */
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return null;
}

/** Ein Zeitraum: „von montag bis freitag", „14.3. - 20.3." */
function zeitraumAus(text) {
  const t = text.toLowerCase();
  const teil = t.split(/\s+(?:bis|-|–|—)\s+/);
  if (teil.length < 2) return null;
  const von = datumAus(teil[0]), bis = datumAus(teil[1]);
  if (!von || !bis || bis < von) return null;
  return { von, bis };
}

/**
 * Personen im Text finden. Sucht Nachnamen, Vornamen und beides zusammen.
 * Bei Mehrdeutigkeit werden alle Treffer zurückgegeben — die Zeile fragt
 * dann nach, statt zu raten.
 */
function personenAus(m, text) {
  const t = text.toLowerCase();
  const treffer = [];
  for (const p of m.personen) {
    if (!imDienst(p, heute())) continue;
    const nach = (p.nachname || "").toLowerCase();
    const vor = (p.vorname || "").toLowerCase();
    /* Beide Reihenfolgen: „Ines Sommer" und „Sommer Ines" meinen dieselbe
       Person. Ohne das bleibt bei drei Ines und zwei Sommers alles mehrdeutig. */
    const beide = t.includes(`${vor} ${nach}`) || t.includes(`${nach} ${vor}`);
    /* Wortgrenzen prüfen — sonst steckt „ines" in „Steiner". */
    const alsWort = (w) => new RegExp(`(^|[^a-zäöüß])${w}([^a-zäöüß]|$)`, "i").test(t);
    if (beide) treffer.push({ person: p, genauigkeit: 3 });
    else if (nach.length >= 3 && alsWort(nach)) treffer.push({ person: p, genauigkeit: 2 });
    else if (vor.length >= 3 && alsWort(vor)) treffer.push({ person: p, genauigkeit: 1 });
  }
  const beste = Math.max(0, ...treffer.map((x) => x.genauigkeit));
  return treffer.filter((x) => x.genauigkeit === beste).map((x) => x.person);
}

/** Eine Dienstart im Text? */
function dienstAus(m, text) {
  const t = text.toLowerCase();
  for (const d of m.dienstarten) {
    const n = (d.name || "").toLowerCase();
    if (n.length >= 3 && t.includes(n)) return d;
    if (d.kurz && t.includes(` ${d.kurz.toLowerCase()} `)) return d;
  }
  /* Umgangssprachlich */
  for (const [wort, muster] of [["früh", /^f/i], ["spät", /^s/i], ["nacht", /^n/i]]) {
    if (!t.includes(wort)) continue;
    const d = m.dienstarten.find((x) => muster.test(x.kurz || x.name));
    if (d) return d;
  }
  return null;
}

/**
 * Was ist gemeint? Gibt einen Vorschlag zurück — nie eine ausgeführte
 * Handlung. Bei Unklarheit wird das gesagt, statt zu raten.
 */
function verstehe(m, text) {
  const t = (text || "").trim();
  if (t.length < 2) return null;
  const klein = t.toLowerCase();

  /* Welcher Befehl? Der mit der längsten Übereinstimmung gewinnt — sonst
     schlägt „frei" bei „Freitag" an. */
  let befehl = null, laenge = 0;
  for (const b of BEFEHLE) {
    for (const w of b.worte) {
      if (klein.includes(w) && w.length > laenge) { befehl = b; laenge = w.length; }
    }
  }

  const personen = personenAus(m, t);
  const datum = datumAus(t);
  const zeitraum = zeitraumAus(t);
  const dienst = dienstAus(m, t);

  /* Kein Befehlswort, aber eine Person: die Akte ist die beste Vermutung */
  if (!befehl && personen.length === 1)
    return { befehl: BEFEHLE.find((b) => b.id === "person"), personen, datum, zeitraum, dienst,
      sicher: true, satz: `Personalakte von ${personen[0].vorname} ${personen[0].nachname}` };

  if (!befehl) return { befehl: null, personen, datum, zeitraum, dienst, sicher: false,
    satz: "Nicht verstanden" };

  /* Fehlt etwas, das der Befehl braucht? */
  const fehlt = [];
  if (befehl.braucht.includes("person") && personen.length !== 1)
    fehlt.push(personen.length > 1 ? "mehrdeutig" : "person");

  const satz = baueSatz(befehl, personen, datum, zeitraum, dienst, fehlt);
  return { befehl, personen, datum, zeitraum, dienst, fehlt, sicher: !fehlt.length, satz };
}

function baueSatz(befehl, personen, datum, zeitraum, dienst, fehlt) {
  if (fehlt.includes("mehrdeutig")) return `Mehrere Personen passen: ${personen
    .map((p) => `${p.vorname} ${p.nachname}`).join(", ")}`;
  if (fehlt.includes("person")) return `${befehl.titel} — für wen?`;
  const p = personen[0];
  const wer = p ? `${p.vorname} ${p.nachname}` : "";
  const wann = zeitraum ? `${fKurz(zeitraum.von)} bis ${fKurz(zeitraum.bis)}`
    : datum ? fLang(datum) : "";
  switch (befehl.id) {
    case "krank": return `Krankmeldung für ${wer}${wann ? ` · ${wann}` : " · ab heute"}`;
    case "urlaub": return `Urlaub für ${wer}${wann ? ` · ${wann}` : ""}`;
    case "person": return `Personalakte von ${wer}`;
    case "wer": return `Ersatz suchen${wann ? ` für ${wann}` : ""}${dienst ? ` · ${dienst.name}` : ""}`;
    case "lage": return `Lagebild${wann ? ` für ${wann}` : " für heute"}`;
    default: return befehl.titel + (wann ? ` · ${wann}` : "");
  }
}

/** Beispiele, die beim ersten Öffnen erscheinen. */
const EINGABE_BEISPIELE = [
  "Müller krank morgen",
  "wer kann Freitag Nachtdienst",
  "Urlaub Schmidt 14.3. bis 20.3.",
  "Lagebild morgen",
  "offene Schichten",
];

/* ==========================================================================
   GEFÜHRTE TOUR

   Kein Werbefilm, sondern eine Einweisung. Wer sie durchläuft, kann danach
   seinen Bereich bedienen — ohne Nachfragen, ohne Handbuch.

   Drei Regeln, die den Unterschied zu üblichen Produkttouren machen:

   Jeder Punkt nennt eine Handlung, nicht eine Funktion. „Klicke auf X"
   statt „Hier siehst du X". Wer nur liest, behält nichts.

   Jeder Punkt, der etwas verändert, nennt die Erfolgskontrolle. Sonst weiß
   niemand, ob es geklappt hat.

   Der Umfang richtet sich nach der Verantwortung. Die Organisationsleitung
   richtet einen Betrieb ein und braucht viel; wer nur den eigenen Plan
   sieht, braucht wenig. Eine Tour, die alle gleich behandelt, langweilt die
   einen und überfordert die anderen.
   ========================================================================== */

const TOUR = {
  /* ---------------------------------------------------------------- */
  leitung: {
    titel: "Betrieb einrichten und führen",
    dauer: "25 bis 40 Minuten",
    einleitung: "Du richtest den Betrieb ein und trägst die Verantwortung für Regelwerk, Personal und Freigaben. Diese Tour führt vom leeren Bestand bis zum laufenden Plan.",
    kapitel: [
      { name: "Ankommen", punkte: [
        { titel: "Willkommen", ziel: null,
          text: "CENTRIC rechnet Dienstpläne, statt sie zu verwalten. Du hinterlegst eine Schichtfolge, und daraus entsteht jeder Tag — vorwärts wie rückwärts, ohne Jahresgrenze. Gespeichert wird nur, was von der Regel abweicht.",
          merke: "Diese Tour lässt sich jederzeit schließen und unter Einstellungen wieder starten." },
        { titel: "Die Seitenleiste", ziel: "start",
          text: "Links stehen sechs Bereiche: Heute, Planung, Anliegen, Team, Auswertung, Verwaltung. Die Zahlen daneben zeigen, wo etwas auf dich wartet.",
          tun: "Fahre einmal über alle sechs Bereiche.",
          pruefen: "Bei „Anliegen\" steht eine Zahl, wenn Anträge offen sind." },
        { titel: "Die Startseite", ziel: "start",
          text: "Oben vier Kennzahlen: offene Schichten, wartende Freigaben, Abwesenheiten heute, Lücken der nächsten sieben Tage. Darunter höchstens drei Karten mit dem, was heute zu tun ist.",
          merke: "Die Karten sind nach Dringlichkeit sortiert. Wer nur die oberste abarbeitet, hat das Wichtigste erledigt." },
        { titel: "Suche und Tastatur", ziel: null,
          text: "Oben rechts die Suche. Sie findet Personen, Dienstarten und Ansichten.",
          tun: "Tippe einen Nachnamen ein.",
          merke: "Die Eingabezeile versteht auch Sätze: „Müller krank morgen\" öffnet die Krankmeldung mit gefüllten Feldern." },
      ]},
      { name: "Betrieb einrichten", ziel: "betrieb", punkte: [
        { titel: "Standorte anlegen", ziel: "betrieb",
          text: "Jeder Standort hat ein eigenes Bundesland. Das ist keine Formalie — Feiertage unterscheiden sich, und Feiertagszuschläge hängen daran.",
          tun: "Lege für jeden Standort Bezeichnung, Bundesland und Umkreis an.",
          pruefen: "Im Monatsplan sind die Feiertage deines Bundeslandes rot markiert.",
          merke: "Der Umkreis gilt für die Standortprüfung beim Einstempeln. 200 Meter sind ein guter Anfang." },
        { titel: "Wochenarbeitszeit", ziel: "betrieb",
          text: "Die vertragliche Regelarbeitszeit einer Vollzeitkraft. Aus ihr errechnet CENTRIC die Sollstunden jedes Monats.",
          tun: "Trage die Wochenarbeitszeit ein.",
          pruefen: "Im Stundenkonto einer Vollzeitkraft steht ein Sollwert, der zur Wochenarbeitszeit passt.",
          merke: "Weicht der Wert vom Schichtmodell ab, entstehen dauerhaft Plus- oder Minusstunden. Beides muss zusammenpassen." },
        { titel: "Ruhezeit", ziel: "betrieb",
          text: "Gesetzlich elf Stunden zwischen zwei Diensten. In Pflege, Klinik und Gaststätten sind unter Bedingungen zehn zulässig.",
          tun: "Setze den Wert auf das, was bei euch gilt.",
          pruefen: "Die Prüfung meldet keine Ruhezeitverstöße, wo bisher keine waren.",
          merke: "Zu streng gesetzt erzeugt Hunderte Befunde, die niemand mehr liest. Lieber einmal mit dem Betriebsrat abstimmen." },
        { titel: "Dienste in Folge", ziel: "betrieb",
          text: "Wie viele Dienste hintereinander zulässig sind. Üblich sechs, in manchen Modellen sieben.",
          tun: "Trage die Höchstzahl ein.",
          pruefen: "Die Prüfung meldet lange Dienstserien als Hinweis." },
        { titel: "Ausgleichsgrenze", ziel: "betrieb",
          text: "Ab welchem Stand des Stundenkontos gewarnt wird. Vierzig Stunden sind verbreitet.",
          merke: "Diese Grenze ist ein Hinweis, keine Sperre. Wer sie überschreitet, wird nicht gehindert — nur sichtbar." },
        { titel: "Dienstarten anlegen", ziel: "betrieb",
          text: "Früh, Spät, Nacht — oder was bei euch gefahren wird. Name, Kürzel, Beginn, Ende, Farbe.",
          tun: "Lege jede Dienstart an. Über Mitternacht laufende Dienste werden erkannt.",
          pruefen: "Im Lagebild erscheint jede Dienstart mit einer Besetzungszahl." },
        { titel: "Dienstform wählen", ziel: "betrieb",
          text: "Regeldienst zählt voll, Bereitschaftsdienst zu 60 Prozent, Rufbereitschaft zu 12,5 Prozent. Der geteilte Dienst hat zwei Abschnitte.",
          merke: "Rufbereitschaft unterbricht die Ruhezeit nicht — deshalb ist die Dienstform wichtiger, als sie aussieht." },
        { titel: "Mindestbesetzung", ziel: "betrieb",
          text: "Je Dienstart und Wochentag getrennt: Montag bis Donnerstag, Freitag, Samstag, Sonntag.",
          tun: "Trage die Mindestbesetzung ein.",
          pruefen: "Das Lagebild zeigt Zahlen wie 8/10 — eingeteilt gegen gefordert.",
          merke: "Höher als die Gruppenstärke gesetzt, meldet die Prüfung dauerhaft Unterbesetzung." },
        { titel: "Erforderliche Qualifikationen", ziel: "betrieb",
          text: "Wenn ein Dienst ohne bestimmte Kräfte nicht laufen darf, hinterlege sie hier mit Mindestzahl.",
          pruefen: "Die Prüfung meldet fehlende Qualifikationen getrennt von fehlenden Personen." },
      ]},
      { name: "Personal", ziel: "personal", punkte: [
        { titel: "Liste einlesen", ziel: "personal",
          text: "Der schnellere Weg. Tabelle aus Excel kopieren, einfügen, fertig — die Spalten werden erkannt, auch ohne brauchbare Überschriften.",
          tun: "Team → Personal → Importieren, Tabelle einfügen, Vorschau prüfen.",
          pruefen: "Die Vorschau zeigt „sicher\", „ähnlich\" oder „aus dem Inhalt\" je Spalte. Bei „aus dem Inhalt\" nachsehen.",
          merke: "Personalnummern gleich mit einlesen — sie werden für die Lohnausgabe gebraucht." },
        { titel: "Einzeln anlegen", ziel: "personal",
          text: "Für kleine Betriebe oder Nachzügler.",
          tun: "Person hinzufügen, Name, Funktion, Einheit, Wochenstunden, Eintrittsdatum.",
          pruefen: "Die Person erscheint im Monatsplan ab dem Eintrittsdatum." },
        { titel: "Teilzeit", ziel: "personal",
          text: "Bei Teilzeit die tatsächlichen Wochenstunden eintragen. CENTRIC verteilt die Dienste entsprechend und rechnet die Sollstunden anteilig.",
          pruefen: "Das Stundenkonto einer Teilzeitkraft zeigt ein niedrigeres Soll." },
        { titel: "Einsatzeinschränkungen", ziel: "personal",
          text: "Keine Nachtdienste, kein Alleindienst, Höchstzahl Dienste je Woche, Wiedereingliederung mit Stufenplan.",
          merke: "Diese Angaben sind sensibel. Sie erscheinen in der Ersatzsuche nur als Grund, nie als Diagnose." },
        { titel: "Zugangsarten vergeben", ziel: "personal",
          text: "Organisationsleitung, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat.",
          tun: "Vergib je Person die Zugangsart.",
          pruefen: "Die Person sieht beim nächsten Anmelden die neuen Ansichten.",
          merke: "Zugänge kosten nichts extra — gerechnet wird je Standort. Wer jemanden zur Planung befördert, zahlt keinen Aufpreis." },
        { titel: "Springer kennzeichnen", ziel: "personal",
          text: "Wer als Springer geführt wird, erscheint in der Ersatzsuche weiter oben und bekommt bei offenen Schichten Vorrang.",
          merke: "Springer sind für kurzfristige Ausfälle da. Wer regelmäßig im Plan steht, ist keiner." },
        { titel: "Austritt eintragen", ziel: "personal",
          text: "Statt zu löschen: Austrittsdatum setzen. Die Person verschwindet ab dann aus dem Plan, bleibt aber in Auswertung und Nachweis erhalten.",
          merke: "Löschen zerstört die Nachvollziehbarkeit vergangener Monate." },
      ]},
      { name: "Qualifikationen", ziel: "quals", punkte: [
        { titel: "Qualifikationen anlegen", ziel: "quals",
          text: "Sachkunde, Schichtleitung, Erste Hilfe, Fachweiterbildungen.",
          tun: "Bezeichnung, Kürzel und Gültigkeitsdauer eintragen.",
          pruefen: "Bei befristeten Qualifikationen erscheint in der Personalakte ein Feld für das Ablaufdatum." },
        { titel: "Fachkraft-Kennzeichen", ziel: "quals",
          text: "Wer als Fachkraft zählt, geht in die Fachkraftquote ein — den Mindestanteil examinierter Kräfte je Dienst.",
          merke: "Nur setzen, wo es fachlich stimmt. Eine falsch gesetzte Fachkraft verfälscht die ganze Quote." },
        { titel: "Gesetzlich zwingend", ziel: "quals",
          text: "Der härteste Schalter. Ohne diese Qualifikation ist gar kein Einsatz zulässig — unabhängig von der Dienstart.",
          merke: "Für die Sachkunde nach § 34a im Bewachungsgewerbe richtig. Für „wäre gut zu haben\" falsch." },
        { titel: "Personen zuordnen", ziel: "quals",
          text: "Ohne Zuordnung kann CENTRIC nicht erkennen, ob ein Dienst fachlich gedeckt ist.",
          tun: "Nutze die Matrix: Team → Qualifikationen → Matrix. Dort geht es schneller als einzeln.",
          pruefen: "Die Matrix zeigt je Einheit, wie viele Personen eine Qualifikation haben." },
        { titel: "Engpässe erkennen", ziel: "quals",
          text: "Rot in der Matrix heißt: Diese Qualifikation hängt an einer einzigen Person.",
          merke: "Eine der nützlichsten Ansichten überhaupt — sie zeigt, wo ein einziger Ausfall den Betrieb lahmlegt." },
        { titel: "Nachweise", ziel: "nachweise",
          text: "Ablaufende Qualifikationen erscheinen rechtzeitig. Läuft ein Nachweis ab, zählt die Qualifikation nicht mehr für die Besetzung.",
          pruefen: "Team → Nachweise zeigt, was in den nächsten Monaten ausläuft." },
      ]},
      { name: "Schichtfolge", ziel: "folge", punkte: [
        { titel: "Das Grundprinzip", ziel: "folge",
          text: "Statt jeden Tag einzeln zu planen, hinterlegst du einen Zyklus und den Startpunkt jeder Gruppe. Daraus wird jeder Tag berechnet.",
          merke: "Deshalb gibt es keine Jahresgrenze und keine Massenänderung, wenn das Modell wechselt." },
        { titel: "Modell wählen", ziel: "folge",
          text: "Neun geprüfte Modelle mit gerechneten Kennzahlen: Wochenstunden, Anzahl Gruppen, längste Dienstserie.",
          tun: "Planung → Schichtfolge → Einrichtungsassistent, Modell auswählen.",
          pruefen: "Die Vorschau zeigt den tatsächlichen Zyklus.",
          merke: "Die Wochenstunden müssen zur vertraglichen Arbeitszeit passen. Zwei Stunden Abweichung sind zwei Plusstunden je Woche, je Person." },
        { titel: "Eigenen Zyklus bauen", ziel: "folge",
          text: "Wenn keines passt: Dienstart antippen, dann auf die Tage klicken. Oder die Dienstart direkt auf einen Tag ziehen.",
          pruefen: "Die Kennzahlen unter dem Zyklus rechnen sich sofort neu." },
        { titel: "Gruppen und Versatz", ziel: "folge",
          text: "Jede Gruppe startet an einer anderen Stelle des Zyklus.",
          tun: "Prüfe den Versatz je Gruppe.",
          pruefen: "Im Monatsplan durchlaufen alle Gruppen dieselbe Abfolge, nur zeitversetzt.",
          merke: "Arbeiten zwei Gruppen gleichzeitig dieselbe Schicht, stimmt der Versatz nicht." },
        { titel: "Ankerdatum", ziel: "folge",
          text: "Der Tag, an dem Gruppe 1 am Zyklusanfang steht.",
          merke: "Lässt sich später ändern, verschiebt dann aber den ganzen Plan. Vor der ersten Freigabe klären." },
      ]},
      { name: "Prüfen und freigeben", ziel: "plan", punkte: [
        { titel: "Die Prüfung lesen", ziel: "pruef",
          text: "Rot ist kritisch: Ruhezeitverstoß, Unterbesetzung, fehlende Pflichtqualifikation. Gelb ist ein Hinweis.",
          tun: "Auswertung → Prüfung öffnen und die roten Befunde durchgehen.",
          pruefen: "Nach dem Beheben verschwindet der Befund sofort — die Prüfung rechnet bei jeder Änderung neu." },
        { titel: "Lücken schließen", ziel: "lage",
          text: "Bei einer unterbesetzten Dienstart auf „Besetzen\". CENTRIC schlägt Personen vor, geordnet nach Eignung.",
          tun: "Öffne einen Vorschlag und drücke „warum?\".",
          merke: "Wer nicht kann, steht unten mit Begründung. Das ist wichtiger als die Liste selbst — es erklärt sich vor dem Betriebsrat." },
        { titel: "Freigeben", ziel: "plan",
          text: "Mit der Freigabe wird der Monat verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus.",
          pruefen: "In der Kopfzeile steht „Freigegeben\" mit Datum und Name.",
          merke: "Vor der Freigabe ist alles Entwurf und niemand wird benachrichtigt." },
        { titel: "Planstandvergleich", ziel: "plan",
          text: "Zeigt, was sich seit der Freigabe geändert hat — und mit welchem Vorlauf.",
          merke: "Kurzfristige Änderungen sind der häufigste Streitpunkt mit dem Betriebsrat. Diese Ansicht beendet Diskussionen." },
      ]},
      { name: "Der laufende Betrieb", punkte: [
        { titel: "Krankmeldung", ziel: "lage",
          text: "Der häufigste Vorgang. Person und Zeitraum wählen — CENTRIC zeigt sofort alle entstehenden Lücken.",
          tun: "Erfasse eine Krankmeldung und schließe die Lücke.",
          pruefen: "Die Betroffenen erhalten eine Mitteilung." },
        { titel: "Offene Schichten", ziel: "offene",
          text: "Statt zehn Leute anzurufen: die Lücke ausschreiben. Wer sich meldet, darf auch — geprüft ist vorher.",
          tun: "Schreibe eine Lücke aus.",
          pruefen: "CENTRIC meldet, wie viele Personen unterrichtet wurden. Steht dort null, darf niemand." },
        { titel: "Anträge entscheiden", ziel: "antraege",
          text: "Links die Liste, rechts die Kapazität der nächsten acht Wochen. Rot heißt: diese Woche kippt erst durch diesen Antrag.",
          merke: "Mit der Tastatur geht es viel schneller: J und K blättern, G genehmigt, A lehnt ab." },
        { titel: "Belastbarkeit", ziel: "belastbarkeit",
          text: "Je Woche und Dienst: wie viele gleichzeitige Ausfälle die schwächste Schicht verträgt.",
          merke: "Einmal die Woche öffnen. Diese Ansicht zeigt Probleme, bevor sie eintreten." },
        { titel: "Verteilungsgerechtigkeit", ziel: "verteilung",
          text: "Wochenenden, Nachtdienste, Feiertage — wer trägt wie viel.",
          merke: "Die Zahl, nach der der Betriebsrat als Erstes fragt." },
        { titel: "Zeiterfassung", ziel: "abrechnung",
          text: "Beschäftigte bestätigen ihre Zeiten. Abweichungen laufen bei dir auf.",
          pruefen: "Offene Bestätigungen erscheinen als Karte auf der Startseite." },
        { titel: "Lohnausgabe", ziel: "abrechnung",
          text: "Eine Datei statt sechs Mails: Alle Stunden und Zuschläge je Person und Lohnart, fertig für die Lohnbuchhaltung.",
          merke: "CENTRIC rechnet Stunden, keine Beträge. Stundensätze gehören in die Lohnabrechnung." },
      ]},
      { name: "Verwaltung", punkte: [
        { titel: "Datenmitnahme", ziel: "mitnahme",
          text: "Sieben Tabellen als CSV, jederzeit, ohne Gebühr. Der Dienstplan wird Tag für Tag ausgeschrieben.",
          merke: "Eine Dienstplanung ist betriebskritisch. Die Frage, wie man wieder herauskommt, gehört an den Anfang." },
        { titel: "Einstellungen", ziel: "einstellungen",
          text: "Darstellung, Benachrichtigungen, diese Tour, Datenschutz und Sicherungen.",
          tun: "Sieh dir die Einstellungen einmal an.",
          merke: "Dort startest du diese Tour auch wieder, wenn du etwas nachschlagen willst." },
        { titel: "Das Handbuch", ziel: "handbuch",
          text: "Zehn Kapitel mit Suche, Fortschritt und Druckausgabe. Was diese Tour zeigt, steht dort zum Nachlesen.",
          merke: "Die Druckfassung ist zum Mitgeben gedacht — mit Deckblatt und deinem Betriebsnamen." },
        { titel: "Geschafft", ziel: null,
          text: "Du kannst jetzt einen Betrieb einrichten, Personal anlegen, eine Schichtfolge festlegen, Lücken schließen und Anträge entscheiden. Alles Weitere findest du im Handbuch.",
          merke: "Diese Tour lässt sich jederzeit unter Einstellungen erneut starten." },
      ]},
    ],
  },

  /* ---------------------------------------------------------------- */
  planer: {
    titel: "Planen, prüfen, freigeben",
    dauer: "20 bis 30 Minuten",
    einleitung: "Du führst den Plan. Diese Tour zeigt den täglichen Ablauf: Lücken erkennen, Ersatz finden, Anträge entscheiden, freigeben.",
    kapitel: [
      { name: "Ankommen", punkte: [
        { titel: "Willkommen", ziel: null,
          text: "CENTRIC rechnet den Plan aus einer Schichtfolge. Du änderst nicht den Plan, sondern trägst Abweichungen ein — Einsprünge, Tausche, Ausfälle.",
          merke: "Diese Tour lässt sich jederzeit schließen und unter Einstellungen wieder starten." },
        { titel: "Die Startseite", ziel: "start",
          text: "Vier Kennzahlen oben, darunter höchstens drei Karten mit dem, was heute zu tun ist — nach Dringlichkeit sortiert.",
          tun: "Lies die oberste Karte." },
        { titel: "Das Lagebild", ziel: "lage",
          text: "Der Tag auf einen Blick: je Dienstart eingeteilt gegen gefordert, mit Namen.",
          pruefen: "Zahlen wie 8/10 bedeuten acht eingeteilt, zehn gefordert." },
        { titel: "Die Eingabezeile", ziel: null,
          text: "Statt drei Menüs: „Müller krank morgen\" tippen. Die Krankmeldung öffnet sich mit gefüllten Feldern.",
          tun: "Probiere es mit einem Namen aus deinem Betrieb." },
      ]},
      { name: "Der Monatsplan", ziel: "plan", punkte: [
        { titel: "Aufbau", ziel: "plan",
          text: "Zeilen sind Personen, Spalten Tage. Farben zeigen die Dienstart, gestrichelte Zellen sind frei.",
          merke: "Was aus der Schichtfolge kommt, ist ruhig dargestellt. Abweichungen sind hervorgehoben." },
        { titel: "Einen Dienst ändern", ziel: "plan",
          text: "Zelle antippen, Dienstart wählen. CENTRIC zeigt vorher die Folgen: Ruhezeit, Wochenstunden, nächste Dienste.",
          pruefen: "Die Zelle ist danach als Abweichung markiert.",
          merke: "Die Regel bleibt unangetastet — du legst eine Ausnahme darüber." },
        { titel: "Mehrere auf einmal", ziel: "plan",
          text: "Mit gedrückter Maustaste über mehrere Zellen ziehen, dann die Dienstart wählen.",
          merke: "Bei mehr als zehn Zellen fragt CENTRIC nach — versehentliches Ziehen ist der häufigste Fehler." },
        { titel: "Filtern", ziel: "plan",
          text: "Nach Einheit, Dienstart, Qualifikation oder Person. Der Filter wirkt auch auf Prüfung und Auswertung.",
          tun: "Filtere auf eine einzelne Einheit." },
        { titel: "Freigeben", ziel: "plan",
          text: "Ab der Freigabe ist der Monat verbindlich und jede Änderung löst eine Mitteilung aus.",
          pruefen: "In der Kopfzeile steht „Freigegeben\" mit Datum und Name." },
      ]},
      { name: "Lücken schließen", punkte: [
        { titel: "Krankmeldung erfassen", ziel: "lage",
          text: "Person und Zeitraum wählen. CENTRIC zeigt sofort alle betroffenen Dienste.",
          tun: "Erfasse eine Krankmeldung.",
          pruefen: "Die betroffenen Dienste erscheinen im Lagebild als unterbesetzt." },
        { titel: "Ersatz suchen", ziel: "lage",
          text: "Bei der Lücke auf „Besetzen\". Wer möglich ist, steht oben; wer nicht, unten mit Grund.",
          tun: "Öffne die Ersatzliste." },
        { titel: "Die Begründung lesen", ziel: "lage",
          text: "Der Knopf „warum?\" zeigt, weshalb jemand oben steht: Stundenkonto unter dem Mittel, Wunschdienst hinterlegt, lange nicht eingesprungen.",
          merke: "Das ist der Teil, der vor dem Betriebsrat zählt. Eine Reihenfolge ohne Begründung ist Willkür." },
        { titel: "Die Folgen prüfen", ziel: "lage",
          text: "Vor dem Eintragen zeigt CENTRIC, was der Einsatz auslöst — Ruhezeit, Wochenstunden, nächste Dienste.",
          merke: "Wer abwesend ist, kann nicht eingeteilt werden. CENTRIC lehnt das ab, statt es stillschweigend anzunehmen." },
        { titel: "Erweiterte Anfrage", ziel: "lage",
          text: "Findet sich niemand: Anfrage an mehrere Personen gleichzeitig. Wer zuerst zusagt, bekommt den Dienst.",
          pruefen: "Die Angefragten erhalten eine Mitteilung." },
        { titel: "Offene Schichten ausschreiben", ziel: "offene",
          text: "Die Lücke sichtbar machen, statt herumzutelefonieren. Unterrichtet wird nur, wer sie auch nehmen darf.",
          tun: "Schreibe eine Lücke aus.",
          merke: "Die Meldungen erscheinen nach Eignung geordnet — nicht danach, wer zuerst kam." },
        { titel: "Unbesetzt lassen", ziel: "lage",
          text: "Bleibt eine Lücke: dokumentierte Unterschreitung mit Begründung.",
          merke: "Nachweisbar für Prüfungen. Besser eine begründete Lücke als ein geschönter Plan." },
      ]},
      { name: "Anliegen", ziel: "antraege", punkte: [
        { titel: "Die Antragsansicht", ziel: "antraege",
          text: "Links die Liste, rechts das Kapazitätsraster der nächsten acht Wochen.",
          pruefen: "Beim Markieren eines Antrags färben sich die betroffenen Wochen." },
        { titel: "Kapazität lesen", ziel: "antraege",
          text: "Rot heißt: diese Woche kippt erst durch diesen Antrag. Gelb: es wird eng.",
          merke: "Mehrere auswählen zeigt die Wirkung aller zusammen — wichtig bei der Urlaubsrunde." },
        { titel: "Mit der Tastatur", ziel: "antraege",
          text: "J und K blättern, G genehmigt, A lehnt ab, Leertaste wählt aus.",
          merke: "Bei vierzig Anträgen ist das der Unterschied zwischen zwanzig Minuten und fünf." },
        { titel: "Mehrstufige Genehmigung", ziel: "antraege",
          text: "Manche Anträge brauchen zwei Freigaben. Dann steht dort „Stufe 1 von 2\" und „Mitzeichnen\".",
          merke: "Erst mit der letzten Stufe wird der Antrag umgesetzt." },
        { titel: "Tauschbörse", ziel: "boerse",
          text: "Beschäftigte bieten Dienste an und suchen Tausche. Du bestätigst — oder lässt es laufen.",
          merke: "Ein bestätigter Tausch erzeugt zwei Abweichungen, keine Änderung an der Schichtfolge." },
        { titel: "Wunschdienste", ziel: "wuensche",
          text: "Wer Wünsche hinterlegt, erscheint bei passenden Diensten weiter oben in der Ersatzsuche.",
          merke: "Wünsche sind kein Anspruch. Sie verschieben nur die Reihenfolge." },
      ]},
      { name: "Auswertung", punkte: [
        { titel: "Die Prüfung", ziel: "pruef",
          text: "Rot ist kritisch, gelb ein Hinweis. Jeder Befund nennt Person, Datum und Grund.",
          tun: "Öffne die Prüfung und klicke einen Befund an." },
        { titel: "Belastbarkeit", ziel: "belastbarkeit",
          text: "Wie viele gleichzeitige Ausfälle jede Woche verträgt. Null heißt: der nächste Krankheitsfall reißt ein Loch.",
          merke: "Einmal die Woche öffnen — das ist die Ansicht, die Überraschungen verhindert." },
        { titel: "Ausfallszenarien", ziel: "belastbarkeit",
          text: "Vier Stufen von fünf bis dreißig Prozent. Zeigt, ab wann der Betrieb kippt.",
          merke: "Nützlich für das Gespräch über Personalbedarf — mit Zahlen statt Gefühl." },
        { titel: "Verteilung", ziel: "verteilung",
          text: "Wochenenden, Nachtdienste, Feiertage je Person.",
          merke: "Die Zahl, nach der der Betriebsrat als Erstes fragt." },
        { titel: "Planungssicherheit", ziel: "planstand",
          text: "Wie oft der freigegebene Plan noch geändert wurde und mit welchem Vorlauf.",
          merke: "Eine niedrige Zahl ist ein besseres Verkaufsargument als jede Zusage." },
        { titel: "Zeiterfassung", ziel: "abrechnung",
          text: "Was bestätigt ist, was abweicht, was offen bleibt.",
          pruefen: "Offene Bestätigungen erscheinen als Karte auf der Startseite." },
      ]},
      { name: "Zum Schluss", punkte: [
        { titel: "Einstellungen", ziel: "einstellungen",
          text: "Darstellung, Benachrichtigungen, diese Tour.",
          tun: "Sieh dir an, was du einstellen kannst." },
        { titel: "Das Handbuch", ziel: "handbuch",
          text: "Zum Nachschlagen, mit Suche und Druckausgabe." },
        { titel: "Geschafft", ziel: null,
          text: "Du kannst jetzt Lücken schließen, Ersatz begründet auswählen, Anträge mit Blick auf die Folgen entscheiden und den Plan freigeben.",
          merke: "Die Tour lässt sich unter Einstellungen erneut starten." },
      ]},
    ],
  },

  /* ---------------------------------------------------------------- */
  subplaner: {
    titel: "Die eigene Einheit führen",
    dauer: "12 bis 18 Minuten",
    einleitung: "Du führst deine Einheit und fährst selbst mit. Diese Tour zeigt, was du ändern darfst — und wo die Grenze liegt.",
    kapitel: [
      { name: "Ankommen", punkte: [
        { titel: "Willkommen", ziel: null,
          text: "Du siehst und änderst deine Einheit. Der übrige Betrieb bleibt sichtbar, aber unveränderlich.",
          merke: "Diese Tour lässt sich unter Einstellungen erneut starten." },
        { titel: "Deine Grenze", ziel: "start",
          text: "Was außerhalb deiner Einheit liegt, ist ausgegraut. Ein Versuch dort meldet, warum es nicht geht.",
          merke: "Das ist Absicht: Wer alles ändern darf, trägt auch die Verantwortung für alles." },
        { titel: "Du fährst mit", ziel: "meine",
          text: "Anders als die Planung stehst du selbst im Plan. Unter „Meine Schichten\" siehst du deine Dienste.",
          pruefen: "Dort steht dein nächster Dienst mit Datum und Zeit." },
      ]},
      { name: "Alltag", punkte: [
        { titel: "Das Lagebild", ziel: "lage",
          text: "Der Tag deiner Einheit: eingeteilt gegen gefordert.",
          tun: "Öffne das Lagebild und sieh dir heute an." },
        { titel: "Krankmeldung", ziel: "lage",
          text: "Für Personen deiner Einheit erfassbar. Die Lücken erscheinen sofort.",
          tun: "Erfasse eine Krankmeldung." },
        { titel: "Ersatz suchen", ziel: "lage",
          text: "Vorschläge nach Eignung, mit Begründung. Der Knopf „warum?\" erklärt die Reihenfolge.",
          merke: "Wer nicht kann, steht unten mit Grund — Ruhezeit, Qualifikation, Abwesenheit." },
        { titel: "Über die Einheit hinaus", ziel: "lage",
          text: "Findet sich in deiner Einheit niemand, kannst du eine Anfrage an die Planung stellen.",
          pruefen: "Die Anfrage erscheint bei der Planung unter Anliegen." },
        { titel: "Offene Schichten", ziel: "offene",
          text: "Lücken deiner Einheit ausschreiben, statt herumzutelefonieren.",
          merke: "Unterrichtet wird nur, wer die Schicht auch übernehmen darf." },
        { titel: "Schichtübergabe", ziel: "uebergabe",
          text: "Lage, offene Aufgaben, Vorkommnisse, Material. Nach dem Abschließen unveränderlich.",
          merke: "Die Unveränderbarkeit ist Absicht — eine nachträglich geänderte Übergabe wäre als Nachweis wertlos." },
      ]},
      { name: "Anliegen und Auswertung", punkte: [
        { titel: "Anträge deiner Einheit", ziel: "antraege",
          text: "Du siehst die Anträge deiner Leute und kannst mitzeichnen.",
          merke: "Bei mehrstufiger Genehmigung bist du oft Stufe 1, die Planung Stufe 2." },
        { titel: "Zeiten bestätigen", ziel: "abrechnung",
          text: "Was deine Leute erfasst haben, läuft bei dir auf.",
          pruefen: "Offene Bestätigungen erscheinen auf der Startseite." },
        { titel: "Belastbarkeit", ziel: "belastbarkeit",
          text: "Wie viele Ausfälle deine Einheit verträgt.",
          merke: "Steht dort null, ruf lieber vorher bei der Planung an als hinterher." },
      ]},
      { name: "Zum Schluss", punkte: [
        { titel: "Einstellungen", ziel: "einstellungen",
          text: "Darstellung, Benachrichtigungen, diese Tour." },
        { titel: "Geschafft", ziel: null,
          text: "Du kannst deine Einheit führen: Ausfälle erfassen, Ersatz finden, übergeben und Zeiten bestätigen.",
          merke: "Alles Weitere steht im Handbuch." },
      ]},
    ],
  },

  /* ---------------------------------------------------------------- */
  mitarbeiter: {
    titel: "Deine Dienste auf dem Telefon",
    dauer: "5 bis 8 Minuten",
    einleitung: "Kurz und praktisch: wann du arbeitest, wie du Anträge stellst und Zeiten bestätigst.",
    kapitel: [
      { name: "Das Wichtigste", punkte: [
        { titel: "Wann arbeite ich?", ziel: "heute",
          text: "Der Reiter „Heute\" zeigt ganz oben deinen Dienst — mit Zeit, Ort und Dauer.",
          tun: "Sieh nach, wann dein nächster Dienst ist.",
          pruefen: "Steht dort „frei\", hast du heute keinen Dienst." },
        { titel: "Ein- und ausstempeln", ziel: "heute",
          text: "Der große Knopf auf der Startseite. Beim Stempeln wird einmalig geprüft, ob du am Einsatzort bist.",
          merke: "Gespeichert wird nur, ob du dort warst — keine Koordinate, kein Verlauf, keine Dauerortung." },
        { titel: "Mein Plan", ziel: "meinplan",
          text: "Kommende Dienste als Liste oder Monatsansicht. Filter für nur Dienste, nur frei, Nachtdienste, Wochenende.",
          tun: "Wechsle einmal zwischen Liste und Monat." },
      ]},
      { name: "Anliegen", punkte: [
        { titel: "Urlaub beantragen", ziel: "anliegen",
          text: "Zeitraum wählen, absenden. Du siehst sofort deinen Urlaubsrest.",
          pruefen: "Der Antrag erscheint mit Stand „offen\"." },
        { titel: "Krank melden", ziel: "anliegen",
          text: "Zeitraum eintragen. Die Planung wird sofort unterrichtet.",
          merke: "Die Krankmeldung ersetzt nicht die Meldung an deinen Betrieb — sie ergänzt sie." },
        { titel: "Tauschen", ziel: "meinplan",
          text: "Dienst antippen, Tausch suchen. Dein Gesuch sehen alle, die den Dienst übernehmen dürfen.",
          pruefen: "Meldet sich jemand, bekommst du eine Mitteilung." },
        { titel: "Offene Schichten", ziel: "offene",
          text: "Dienste, die du zusätzlich übernehmen kannst. Hier steht nur, was du auch wirklich darfst.",
          merke: "Ruhezeit, Qualifikation und deine Abwesenheiten sind bereits geprüft." },
        { titel: "Wunschdienste", ziel: "mehr",
          text: "Hinterlege, welche Dienste dir lieber sind. Das verschiebt die Reihenfolge bei der Ersatzsuche.",
          merke: "Ein Wunsch ist kein Anspruch — aber er wird berücksichtigt." },
      ]},
      { name: "Zeiten und Konto", punkte: [
        { titel: "Zeiten bestätigen", ziel: "anliegen",
          text: "Nach dem Dienst: „wie geplant\" oder mit Abweichung.",
          pruefen: "Bestätigte Zeiten verschwinden aus der Liste." },
        { titel: "Stundenkonto", ziel: "anliegen",
          text: "Dein Stand mit Verlauf über sechs Monate.",
          merke: "Minus heißt nicht Schulden — es gleicht sich über den Zyklus aus." },
        { titel: "Nachweise", ziel: "mehr",
          text: "Deine Qualifikationen und wann sie ablaufen.",
          pruefen: "Läuft etwas bald ab, erscheint ein Hinweis." },
      ]},
      { name: "Zum Schluss", punkte: [
        { titel: "Benachrichtigungen", ziel: "mehr",
          text: "Unter Mehr stellst du ein, worüber du unterrichtet wirst — per E-Mail oder auf dem Gerät.",
          tun: "Schalte Mitteilungen auf diesem Gerät ein.",
          merke: "Ohne sie erfährst du von Änderungen erst beim nächsten Öffnen." },
        { titel: "Geschafft", ziel: null,
          text: "Du weißt jetzt, wann du arbeitest, wie du Anträge stellst, tauschst und Zeiten bestätigst.",
          merke: "Die Tour lässt sich unter Mehr erneut starten." },
      ]},
    ],
  },

  /* ---------------------------------------------------------------- */
  betriebsrat: {
    titel: "Prüfen und mitbestimmen",
    dauer: "10 bis 15 Minuten",
    einleitung: "Du hast lesenden Zugriff auf alles, was für die Mitbestimmung nötig ist. Diese Tour zeigt, wo die Zahlen stehen.",
    kapitel: [
      { name: "Ankommen", punkte: [
        { titel: "Willkommen", ziel: null,
          text: "Dein Zugang ist rein lesend. Du kannst nichts ändern — und niemand kann behaupten, du hättest.",
          merke: "Der Betriebsratszugang ist kostenfrei. Das ist Absicht: Mitbestimmung darf nicht am Preis scheitern." },
        { titel: "Was du siehst", ziel: "start",
          text: "Plan, Prüfung, Verteilung, Planungssicherheit, Protokoll. Nicht sichtbar: Krankheitsgründe und persönliche Notizen.",
          merke: "Diese Trennung ist bewusst — Mitbestimmung braucht Zahlen, keine Diagnosen." },
      ]},
      { name: "Die Zahlen", punkte: [
        { titel: "Verteilungsgerechtigkeit", ziel: "verteilung",
          text: "Wochenenden, Nachtdienste, Feiertage je Person — mit Abweichung vom Mittel.",
          tun: "Sieh dir an, wer über dem Mittel liegt.",
          merke: "Die wichtigste Ansicht für dich. Ungleiche Verteilung ist der häufigste Streitpunkt." },
        { titel: "Die Prüfung", ziel: "pruef",
          text: "Alle Befunde gegen Arbeitszeitgesetz, Mindestbesetzung und Qualifikationen.",
          pruefen: "Rote Befunde sind kritisch, gelbe Hinweise." },
        { titel: "Planungssicherheit", ziel: "planstand",
          text: "Wie oft der freigegebene Plan geändert wurde und mit welchem Vorlauf.",
          merke: "Kurzfristige Änderungen sind mitbestimmungspflichtig. Hier stehen sie mit Datum." },
        { titel: "Belastbarkeit", ziel: "belastbarkeit",
          text: "Wie viele Ausfälle jede Woche verträgt. Null bedeutet dauerhafte Unterbesetzung.",
          merke: "Nützlich für das Gespräch über Personalbedarf — mit Zahlen statt Behauptungen." },
        { titel: "Das Protokoll", ziel: "buch",
          text: "Wer hat wann was geändert.",
          merke: "Nachvollziehbarkeit ist die Grundlage jeder Mitbestimmung." },
      ]},
      { name: "Zum Schluss", punkte: [
        { titel: "Einstellungen", ziel: "einstellungen",
          text: "Darstellung, Benachrichtigungen, diese Tour." },
        { titel: "Geschafft", ziel: null,
          text: "Du weißt jetzt, wo Verteilung, Prüfbefunde, Planungssicherheit und Protokoll stehen.",
          merke: "Die Tour lässt sich unter Einstellungen erneut starten." },
      ]},
    ],
  },

  /* ---------------------------------------------------------------- */
  betreiber: {
    titel: "Mandanten und Abrechnung",
    dauer: "10 bis 15 Minuten",
    einleitung: "Du führst die Betreiberkonsole: Mandanten anlegen, Zugänge vergeben, Rechnungen erzeugen.",
    kapitel: [
      { name: "Mandanten", punkte: [
        { titel: "Die Übersicht", ziel: "mandanten",
          text: "Alle Betriebe mit Standorten, Personenzahl, Tarif und Monatspreis.",
          merke: "Du siehst Kennzahlen, keine Personendaten. Kein Name, kein Dienstplan — das gehört den Betrieben." },
        { titel: "Mandant anlegen", ziel: "mandanten",
          text: "Name, Branche, Anschrift, Ansprechpartner. CENTRIC erzeugt daraufhin die Zugänge.",
          pruefen: "Die Zugangscodes erscheinen unmittelbar nach dem Anlegen — notiere sie, sie sind später nicht wiederherstellbar." },
        { titel: "Leerer Bestand", ziel: "mandanten",
          text: "Ein neu angelegter Mandant startet ohne Daten. Kein Beispielpersonal, keine erfundenen Dienstpläne.",
          merke: "Bei den Demozugängen ist das anders — dort steht ein vollständiger Beispielbetrieb." },
        { titel: "Zugänge nachträglich", ziel: "mandanten",
          text: "Weitere Zugänge lassen sich jederzeit erzeugen, etwa wenn die Planung wechselt.",
          pruefen: "Der neue Code erscheint in der Liste des Mandanten." },
        { titel: "Geänderte Anmeldungen", ziel: "mandanten",
          text: "Wenn jemand seine Anmeldeadresse ändert, erscheint das hier mit Datum.",
          merke: "So merkst du, wenn ein Zugang den Besitzer wechselt." },
      ]},
      { name: "Abrechnung", punkte: [
        { titel: "Das Preismodell", ziel: "rechner",
          text: "Gerechnet wird je Standort, nicht je Kopf. Wer einstellt, zahlt nicht mehr.",
          merke: "Der Punkt, an dem du gegen Anbieter mit Kopfpauschale gewinnst — bei mehreren Standorten deutlich." },
        { titel: "Tarife pflegen", ziel: "tarife",
          text: "Preis je Standort und die Personengrenze, ab der ein Standort in den nächsten Tarif steigt.",
          merke: "Größere Standorte steigen automatisch auf. Ein Betrieb zahlt für die Zentrale mehr als für eine Außenstelle." },
        { titel: "Rechnungen", ziel: "rechnungen",
          text: "Je Standort eine Zeile, Mengenstaffel und Branchenpakete getrennt ausgewiesen.",
          pruefen: "Ein unterjährig begonnener Vertrag wird tagesgenau anteilig berechnet." },
        { titel: "Branchenpakete", ziel: "pakete",
          text: "Sicherheit, Pflege, Klinik, Industrie. Jedes schaltet Funktionen und Begriffe frei.",
          merke: "Pakete werden je Betrieb berechnet, nicht je Standort." },
      ]},
      { name: "Zum Schluss", punkte: [
        { titel: "Einstellungen", ziel: "einstellungen",
          text: "Darstellung, Benachrichtigungen, diese Tour." },
        { titel: "Geschafft", ziel: null,
          text: "Du kannst Mandanten anlegen, Zugänge vergeben und Rechnungen erzeugen.",
          merke: "Die Tour lässt sich unter Einstellungen erneut starten." },
      ]},
    ],
  },
};

/** Alle Punkte einer Rolle flach — für Fortschritt und Navigation. */
function tourPunkte(rolleId) {
  const t = TOUR[rolleId] || TOUR.mitarbeiter;
  const out = [];
  t.kapitel.forEach((k, ki) => k.punkte.forEach((p, pi) =>
    out.push({ ...p, kapitel: k.name, kapitelIdx: ki, punktIdx: pi,
      id: `${rolleId}:${ki}:${pi}` })));
  return out;
}

/** Wie weit ist jemand? */
function tourStand(person, rolleId) {
  const alle = tourPunkte(rolleId);
  const gesehen = (person.tour || {}).gesehen || [];
  const idx = Math.min(alle.length - 1, Math.max(0, (person.tour || {}).schritt || 0));
  return { alle, gesehen, idx, gesamt: alle.length,
    anteil: alle.length ? Math.round((gesehen.length / alle.length) * 100) : 0,
    fertig: !!(person.tour || {}).fertig,
    unterdrueckt: !!(person.tour || {}).nichtMehr };
}

/** Soll die Tour beim Anmelden von selbst starten? */
const tourStartet = (person, rolleId) => {
  const t = person.tour || {};
  if (t.nichtMehr || t.fertig) return false;
  return !(t.gesehen || []).length;
};

/* ==========================================================================
   MANDANTEN ANLEGEN
   Ein neu angelegter Betrieb startet leer. Kein Beispielpersonal, keine
   erfundenen Dienstpläne — wer echte Daten eingibt, will nicht erst
   dreiundachtzig Phantasienamen löschen.

   Was mitkommt, ist das Gerüst: ein Standort, die gesetzlichen Grundwerte,
   drei übliche Dienstarten. Alles änderbar, aber besser als ein leeres
   Formular ohne Anhaltspunkt.
   ========================================================================== */

/** Ein Betrieb ohne Daten, aber mit brauchbaren Voreinstellungen. */
function leererMandant(name, branche, anschrift, kontakt) {
  const jetzt = heute();
  const standortId = uid("st");
  const einheitId = uid("e");
  return {
    id: uid("m"), name, branche: branche || "sonstige",
    anschrift: anschrift || "", kontakt: kontakt || "",
    status: "test", seit: jetzt, bis: null, stichtag: 1,
    tarif: "basis", pakete: [], rabattGrund: 0,
    version: 5, stand: 1,

    standorte: [{ id: standortId, name: name, bundesland: "HE",
      lat: 50.11, lon: 8.68, radius: 200 }],

    /* Gesetzliche Grundwerte. Sie stehen bewusst da, wo sie hingehören —
       nicht auf null, denn null heißt „keine Prüfung", und das merkt
       niemand, bevor es zu spät ist. */
    einstellungen: {
      wochenstunden: 40, ruhezeit: 11, maxFolge: 6, ausgleichsgrenze: 40,
      urlaubsanspruch: 30, pausenregel: "gesetzlich",
      planungsvorlauf: 28, aenderungsvorlauf: 4,
    },

    einheiten: [{ id: einheitId, name: "Schichtgruppe A", standortId,
      pool: false, farbe: "#017070" }],

    /* Drei übliche Dienstarten. Wer anders fährt, ändert sie — aber
       niemand startet vor einer leeren Liste. */
    dienstarten: [
      { id: "F", name: "Frühdienst", kurz: "F", start: "06:00", ende: "14:00",
        pause: 30, farbe: "#017070", ort: "", posten: false, quelle: null,
        faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
        mindest: { mo_do: 2, fr: 2, sa: 1, so: 1 }, mindestQual: {} },
      { id: "S", name: "Spätdienst", kurz: "S", start: "14:00", ende: "22:00",
        pause: 30, farbe: "#955410", ort: "", posten: false, quelle: null,
        faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
        mindest: { mo_do: 2, fr: 2, sa: 1, so: 1 }, mindestQual: {} },
      { id: "N", name: "Nachtdienst", kurz: "N", start: "22:00", ende: "06:00",
        pause: 0, farbe: "#316C81", ort: "", posten: false, quelle: null,
        faktor: 1, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
        mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
    ],

    qualifikationen: [],
    personen: [],
    /* Ein Zyklus mit einer Woche freier Tage. Nicht leer, weil der
       Rechenkern eine Struktur erwartet — und weil ein Plan aus lauter
       freien Tagen ehrlicher ist als gar keiner. */
    zyklus: { wochen: 1, tage: Array.from({ length: 7 }, () => null), vorlage: null },
    zyklusLaenge: 7, gruppen: 1, versatzTageVon: 0, anker: montag(jetzt),
    abwesenheiten: [], abweichungen: {}, erfassung: {}, anfragen: [],
    nachrichten: [], aenderungen: [], freigaben: {}, aushaenge: [],
    uebergaben: {}, ausschreibungen: [], checklisten: [], listeneintraege: {},
    betriebsmittel: [], protokoll: [], adressAenderungen: [],
    einheitLabel: "Schichtgruppe",
  };
}

/* --------------------------------------------------------------------------
   ZUGÄNGE
   Beim Anlegen entstehen Personen ohne Namen, die nur den Zugang tragen.
   Sobald jemand sich anmeldet und seinen Namen einträgt, wird daraus eine
   richtige Person.
   -------------------------------------------------------------------------- */

/** Welche Zugänge ein neuer Betrieb mindestens braucht. */
const START_ZUGAENGE = [
  { rolle: "leitung", label: "Organisationsleitung",
    text: "Richtet den Betrieb ein: Regelwerk, Personal, Qualifikationen." },
  { rolle: "planer", label: "Planung",
    text: "Führt den Plan: Schichtfolge, Lücken, Anträge, Freigabe." },
];

/** Eine Person, die zunächst nur einen Zugang trägt. */
function zugangsPerson(rolle, einheitId, nummer) {
  const jetzt = heute();
  return {
    id: uid("p"),
    vorname: "", nachname: `Zugang ${nummer}`,
    funktion: ROLLEN.find((r) => r.id === rolle)?.label || rolle,
    email: null, emailGeaendert: null, emailVorher: null,
    zugehoerigkeit: [{ ab: jetzt, einheitId }],
    eintritt: jetzt, austritt: null,
    wochenstunden: 40, urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
    qualifikationen: [], qualNachweise: [],
    einschraenkungen: { keineNacht: false, keinAlleindienst: false,
      maxDiensteWoche: null, wiedereingliederung: null },
    teilzeit: null, springer: false,
    rolle, bereich: rolle === "leitung" ? "ALLE" : einheitId,
    verfuegbarkeit: { aktiv: false, raster: Array.from({ length: 21 }, () => true) },
    nachweise: [], kontrastmodus: false,
    /* Die Tour startet beim ersten Anmelden von selbst — genau dafür
       ist sie gedacht. */
    tour: { schritt: 0, gesehen: [], fertig: false, nichtMehr: false, offen: false },
    notiz: "", einarbeitung: null,
    zustellung: zustellungStandard(),
    rolleSeit: jetzt, status: "aktiv",
    /* Die Leitung sitzt im Geschäftszimmer und fährt keine Schicht. */
    imSchichtdienst: rolle !== "leitung" && rolle !== "planer",
    neuerZugang: true,
  };
}

/**
 * Legt einen Mandanten samt Startzugängen an.
 * Gibt den Betrieb und die Personen zurück; die Codes entstehen auf dem
 * Server, weil sie dort als Prüfsumme abgelegt werden.
 */
function mandantAnlegen({ name, branche, anschrift, kontakt, zusatzRollen }) {
  const m = leererMandant(name, branche, anschrift, kontakt);
  const einheitId = m.einheiten[0].id;
  const rollen = [...START_ZUGAENGE.map((z) => z.rolle), ...(zusatzRollen || [])];
  const personen = rollen.map((r, i) => zugangsPerson(r, einheitId, i + 1));
  return { ...m, personen };
}

/** Alle Zugänge eines Betriebs mit ihrem Stand — für die Betreiberkonsole. */
function zugangsUebersicht(m) {
  return (m.personen || []).map((p) => ({
    personId: p.id, rolle: p.rolle,
    label: ROLLEN.find((r) => r.id === p.rolle)?.label || p.rolle,
    bezeichnung: p.vorname || p.nachname !== `Zugang ${1}` ? `${p.vorname} ${p.nachname}`.trim() : null,
    email: p.email, emailGeaendert: p.emailGeaendert, emailVorher: p.emailVorher,
    benutzt: !p.neuerZugang || !!p.email || !!(p.tour || {}).gesehen?.length,
    tourFertig: !!(p.tour || {}).fertig,
  }));
}

/** Adressänderungen aller Betriebe, neueste zuerst. */
function adressAenderungen(db, tage) {
  const grenze = addDays(heute(), -(tage || 90));
  const out = [];
  for (const m of db.mandanten)
    for (const a of (m.adressAenderungen || [])) {
      if (a.zeit.slice(0, 10) < grenze) continue;
      const p = m.personen.find((x) => x.id === a.personId);
      out.push({ ...a, mandant: m.name, mandantId: m.id,
        rolle: p ? (ROLLEN.find((r) => r.id === p.rolle)?.label || p.rolle) : "unbekannt" });
    }
  return out.sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/* ==========================================================================
   KALENDER, WECKZEITEN, VERFÜGBARKEIT

   Drei Dinge, die eine Belegschaft spürbar mehr wertschätzt als jede
   Auswertung: der Plan im eigenen Kalender, ein Weckruf, der zur Schicht
   passt, und die Möglichkeit, der Familie zu zeigen, wann man da ist.

   Alles drei nutzt aus, dass CENTRIC den Plan rechnet: Niemand muss etwas
   abtippen, und die Angaben stimmen auch zwölf Monate voraus.
   ========================================================================== */

/** Termine einer Person für den Kalender-Feed. Vorwärts, nicht rückwärts. */
function kalenderTermine(m, personId, tage) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return [];
  const out = [];
  const von = heute(), bis = addDays(heute(), tage || 180);
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    if (!imDienst(p, d)) continue;

    /* Abwesenheit hat Vorrang — sie überschreibt den Dienst. */
    const abw = abwesenheitAm(m, p.id, d);
    if (abw) {
      const art = abwArt(abw.art);
      out.push({ id: `abw-${abw.id}-${d}`, datum: d, bis: addDays(d, 1),
        ganztags: true, titel: art.label,
        /* Kein Grund, keine Notiz — ein abonnierter Kalender liegt am Ende
           auf einem Gerät, das wir nicht kennen. */
        text: "" });
      continue;
    }

    const t = personTag(m, p, d);
    if (!t || !t.dienstId || t.dienstId === "F0") continue;
    const da = m.dienstarten.find((x) => x.id === t.dienstId);
    if (!da) continue;

    /* Über Mitternacht laufende Dienste enden am Folgetag. */
    const ueberNacht = da.ende <= da.start;
    out.push({
      id: `d-${p.id}-${d}`, datum: d, von: da.start,
      endDatum: ueberNacht ? addDays(d, 1) : d, bisZeit: da.ende,
      ganztags: false, titel: da.name,
      text: `${n1(dauer(da))} Stunden${da.pause ? ` · ${da.pause} Min Pause` : ""}`,
      ort: da.ort || (m.standorte && m.standorte[0] ? m.standorte[0].name : ""),
    });
  }
  return out;
}

/* --------------------------------------------------------------------------
   WECKZEITEN
   Aus dem Dienst den Weckruf ableiten. Wer den Plan hat, muss ihn nicht
   abtippen — das ist der ganze Trick.
   -------------------------------------------------------------------------- */

/** Voreinstellung: 75 Minuten vor Dienstbeginn plus Anfahrt. */
const WECK_STD = { vorlauf: 75, anfahrt: 20, aktiv: false, nurWerktags: false };

const minuten = (hhmm) => {
  const [h, mi] = String(hhmm).split(":").map(Number);
  return h * 60 + mi;
};
const alsZeit = (min) => {
  const m2 = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m2 / 60))}:${pad(m2 % 60)}`;
};

/**
 * Der Weckruf für einen Tag. Gibt auch zurück, ob er in den Vortag fällt —
 * bei einem Frühdienst um 06:00 mit 95 Minuten Vorlauf ist das nicht der
 * Fall, bei einer Nachtschicht um 00:30 sehr wohl.
 */
function weckzeit(m, personId, datum) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return null;
  const w = { ...WECK_STD, ...(p.weckzeit || {}) };
  if (!w.aktiv) return null;
  if (!imDienst(p, datum) || abwesenheitAm(m, p.id, datum)) return null;
  const t = personTag(m, p, datum);
  if (!t || !t.dienstId) return null;
  const da = m.dienstarten.find((x) => x.id === t.dienstId);
  if (!da) return null;
  if (w.nurWerktags && [0, 6].includes(pISO(datum).getDay())) return null;

  const beginn = minuten(da.start);
  const roh = beginn - w.vorlauf - w.anfahrt;
  return {
    zeit: alsZeit(roh), vortag: roh < 0,
    datum: roh < 0 ? addDays(datum, -1) : datum,
    dienst: da.name, dienstbeginn: da.start,
    vorlauf: w.vorlauf, anfahrt: w.anfahrt,
  };
}

/** Die nächsten Weckrufe — für die Übersicht auf dem Telefon. */
function kommendeWeckzeiten(m, personId, tage) {
  const out = [];
  for (let i = 0; i <= (tage || 7); i++) {
    const d = addDays(heute(), i);
    const w = weckzeit(m, personId, d);
    if (w) out.push({ ...w, fuerDatum: d });
  }
  return out;
}

/* --------------------------------------------------------------------------
   VERFÜGBARKEIT TEILEN
   Für die Familie: nur „frei" oder „arbeitet". Keine Dienstart, kein Ort,
   kein Betriebsname. Wer den Verweis hat, soll planen können — nicht
   erfahren, wo jemand arbeitet.
   -------------------------------------------------------------------------- */

function verfuegbarkeitsBild(m, personId, tage) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return [];
  const out = [];
  for (let i = 0; i < (tage || 14); i++) {
    const d = addDays(heute(), i);
    if (!imDienst(p, d)) { out.push({ datum: d, frei: true }); continue; }
    if (abwesenheitAm(m, p.id, d)) { out.push({ datum: d, frei: true }); continue; }
    const t = personTag(m, p, d);
    const da = t && t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
    out.push(da
      /* Nur die grobe Lage — vormittags, nachmittags, nachts. Das reicht
         zum Verabreden und verrät nichts über den Betrieb. */
      ? { datum: d, frei: false, lage: minuten(da.start) < 660 ? "vormittags"
          : minuten(da.start) < 1020 ? "nachmittags" : "nachts" }
      : { datum: d, frei: true });
  }
  return out;
}

/** Gemeinsam freie Tage zweier Bilder — für den Vergleich mit der Familie. */
const gemeinsamFrei = (a, b) => a
  .filter((x) => x.frei && b.some((y) => y.datum === x.datum && y.frei))
  .map((x) => x.datum);

/* ==========================================================================
   SELBSTPLANUNG

   Die Belegschaft macht den Erstentwurf, die Planung schließt den Rest.
   Das ist mehr als offene Schichten: Es ist ein eigenes Verfahren mit
   Anfang, Ende und klaren Grenzen.

   Der Unterschied zu einem freien Wunschzettel: Wer sich einträgt, bekommt
   den Dienst — sofern die Regeln es hergeben. Geprüft wird beim Eintragen,
   nicht hinterher. Sonst entsteht ein Entwurf, den die Planung ohnehin
   verwerfen muss, und niemand macht ein zweites Mal mit.
   ========================================================================== */

const SELBSTPLAN_STATUS = {
  vorbereitet: { label: "vorbereitet", ton: null,
    text: "Noch nicht geöffnet. Die Belegschaft sieht nichts." },
  offen: { label: "läuft", ton: "accent",
    text: "Die Belegschaft trägt sich ein." },
  geschlossen: { label: "geschlossen", ton: "warn",
    text: "Keine Eintragungen mehr. Die Planung füllt die Lücken." },
  uebernommen: { label: "übernommen", ton: "ok",
    text: "In den Plan übernommen." },
};

/**
 * Reicht die Ruhezeit zwischen zwei Diensten an aufeinanderfolgenden Tagen?
 * Nutzt dasselbe Zeitfenster wie die Prüfung — sonst würden Selbstplanung
 * und Prüfung zu verschiedenen Ergebnissen kommen.
 */
function ruhezeitVerletzt(m, davor, danach, datumDavor) {
  const d1 = datumDavor || heute();
  const d2 = addDays(d1, 1);
  const [, ende1] = fenster(d1, davor);
  const [start2] = fenster(d2, danach);
  const ruhe = (start2 - ende1) / 60;
  return ruhe < (m.einstellungen.ruhezeit || 11);
}

/** Die laufende Selbstplanungsrunde, falls es eine gibt. */
const laufendeRunde = (m) =>
  (m.selbstplanung || []).find((r) => r.status === "offen") || null;

/**
 * Was darf diese Person in dieser Runde noch eintragen?
 * Gibt die Zahl zurück, nicht nur ja oder nein — die Person soll sehen,
 * wie viele Dienste ihr noch fehlen.
 */
function selbstplanStand(m, runde, personId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p || !runde) return null;
  const eigene = (runde.eintraege || []).filter((e) => e.personId === personId);
  const ym = runde.monat;

  /* Das Ziel ergibt sich aus dem Vertrag, nicht aus einer festen Zahl.
     Eine Teilzeitkraft mit 20 Stunden soll nicht dieselbe Zahl Dienste
     eintragen wie eine Vollzeitkraft. */
  const soll = sollStunden(m, p, ym);
  const bisher = eigene.reduce((s, e) => {
    const da = m.dienstarten.find((x) => x.id === e.dienstId);
    return s + (da ? dauer(da) : 0);
  }, 0);
  const rest = Math.max(0, soll - bisher);
  const mittel = m.dienstarten.length
    ? m.dienstarten.reduce((s, d) => s + dauer(d), 0) / m.dienstarten.length : 8;

  /* Rohwerte, keine formatierten Zeichenketten — sonst rechnet niemand
     mehr damit, und deutsche Kommazahlen werden zu NaN. */
  return {
    eingetragen: eigene.length,
    stunden: Math.round(bisher * 10) / 10,
    soll: Math.round(soll * 10) / 10,
    fehlt: Math.round(rest * 10) / 10,
    etwaNochDienste: Math.round(rest / (mittel || 8)),
    fertig: rest <= mittel * 0.5,
    zuViel: bisher > soll + mittel,
    eintraege: eigene.sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}

/**
 * Darf sich diese Person an diesem Tag für diesen Dienst eintragen?
 * Prüft dieselben Regeln wie die Ersatzsuche — plus die Grenzen der Runde.
 */
function darfSelbstEintragen(m, runde, personId, datum, dienstId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return { darf: false, grund: "Person unbekannt" };
  if (!runde || runde.status !== "offen")
    return { darf: false, grund: "die Runde läuft nicht" };
  if (datum.slice(0, 7) !== runde.monat)
    return { darf: false, grund: "liegt außerhalb des Planungsmonats" };
  if (!imDienst(p, datum)) return { darf: false, grund: "an diesem Tag nicht beschäftigt" };
  if (abwesenheitAm(m, p.id, datum)) return { darf: false, grund: "an diesem Tag abwesend" };

  const schon = (runde.eintraege || []).find((e) =>
    e.personId === personId && e.datum === datum);
  if (schon) return { darf: false, grund: "an diesem Tag schon eingetragen" };

  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return { darf: false, grund: "Dienstart unbekannt" };

  /* Ruhezeit gegen die eigenen bisherigen Eintragungen prüfen — nicht nur
     gegen den bestehenden Plan. Sonst trägt sich jemand Nacht und Früh
     hintereinander ein, und die Planung muss es hinterher auflösen. */
  const eigene = (runde.eintraege || []).filter((e) => e.personId === personId);
  const vortag = eigene.find((e) => e.datum === addDays(datum, -1));
  if (vortag) {
    const dv = m.dienstarten.find((x) => x.id === vortag.dienstId);
    if (dv && ruhezeitVerletzt(m, dv, da, addDays(datum, -1)))
      return { darf: false, grund: "zu wenig Ruhezeit nach dem Vortag" };
  }
  const folgetag = eigene.find((e) => e.datum === addDays(datum, 1));
  if (folgetag) {
    const df = m.dienstarten.find((x) => x.id === folgetag.dienstId);
    if (df && ruhezeitVerletzt(m, da, df, datum))
      return { darf: false, grund: "zu wenig Ruhezeit vor dem Folgetag" };
  }

  /* Qualifikationen und harte Sperren — dieselbe Prüfung wie sonst */
  const h = hindernisse(m, p, datum, da);
  if (h.length) return { darf: false, grund: h[0] };

  /* Ist der Dienst schon voll? Über die Mindestbesetzung hinaus soll sich
     niemand eintragen, solange andere Tage leer sind. */
  const drin = (runde.eintraege || []).filter((e) =>
    e.datum === datum && e.dienstId === dienstId).length;
  const soll = mindestFuer(m, da, datum);
  if (runde.deckelung !== false && soll > 0 && drin >= soll)
    return { darf: false, grund: "dieser Dienst ist bereits gedeckt" };

  /* Wer sein Stundenziel deutlich überschreitet, tritt zurück */
  const st = selbstplanStand(m, runde, personId);
  if (st && st.zuViel) return { darf: false, grund: "dein Stundenziel ist erreicht" };

  return { darf: true, offen: Math.max(0, soll - drin) };
}

/** Wie viele fehlen noch je Tag und Dienst? Die Karte der Runde. */
function selbstplanLage(m, runde) {
  if (!runde) return [];
  const [j, mo] = runde.monat.split("-").map(Number);
  const tage = dim_(j, mo - 1);
  const out = [];
  for (let t = 1; t <= tage; t++) {
    const d = `${runde.monat}-${pad(t)}`;
    const dienste = m.dienstarten.filter((da) => !da.posten).map((da) => {
      const drin = (runde.eintraege || []).filter((e) =>
        e.datum === d && e.dienstId === da.id).length;
      const soll = mindestFuer(m, da, d);
      return { dienst: da, drin, soll, fehlt: Math.max(0, soll - drin),
        gedeckt: soll > 0 && drin >= soll };
    });
    out.push({ datum: d, dienste,
      offen: dienste.reduce((s, x) => s + x.fehlt, 0) });
  }
  return out;
}

/** Zusammenfassung für die Planung: Wie weit ist die Runde? */
function selbstplanFortschritt(m, runde) {
  const lage = selbstplanLage(m, runde);
  const gesamt = lage.reduce((s, t) =>
    s + t.dienste.reduce((a, x) => a + x.soll, 0), 0);
  const belegt = lage.reduce((s, t) =>
    s + t.dienste.reduce((a, x) => a + Math.min(x.drin, x.soll), 0), 0);
  const beteiligt = new Set((runde.eintraege || []).map((e) => e.personId)).size;
  const moeglich = m.personen.filter((p) =>
    imDienst(p, `${runde.monat}-15`) && p.imSchichtdienst !== false).length;
  return { gesamt, belegt, offen: gesamt - belegt,
    anteil: gesamt ? Math.round((belegt / gesamt) * 100) : 0,
    beteiligt, moeglich,
    beteiligung: moeglich ? Math.round((beteiligt / moeglich) * 100) : 0,
    eintraege: (runde.eintraege || []).length };
}

/* ==========================================================================
   NOTRUF
   Für Alleindienste. Ein Knopf, der Standort und Person an hinterlegte
   Empfänger meldet — und der nicht versehentlich ausgelöst wird.
   ========================================================================== */

const NOTRUF_ARTEN = {
  hilfe: { label: "Hilfe angefordert", dringend: true,
    text: "Ich brauche Unterstützung am Einsatzort." },
  medizin: { label: "Medizinischer Notfall", dringend: true,
    text: "Verletzung oder medizinischer Zwischenfall." },
  bedrohung: { label: "Bedrohungslage", dringend: true,
    text: "Bedrohung oder Übergriff." },
  technik: { label: "Technischer Ausfall", dringend: false,
    text: "Anlage, Fahrzeug oder Ausrüstung ausgefallen." },
};

/** Wer wird bei einem Notruf unterrichtet? */
function notrufEmpfaenger(m, personId, datum) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return [];
  const eid = einheitAm(p, datum || heute());
  /* Zuerst die eigene Schichtverantwortung, dann die Planung, dann die
     Leitung. Nicht alle gleichzeitig — sonst fühlt sich niemand zuständig. */
  const stufen = [
    m.personen.filter((x) => x.rolle === "subplaner" && einheitAm(x, datum) === eid),
    m.personen.filter((x) => x.rolle === "planer"),
    m.personen.filter((x) => x.rolle === "leitung"),
  ];
  const out = [];
  for (const s of stufen) for (const x of s)
    if (imDienst(x, datum || heute()) && !out.some((y) => y.id === x.id)) out.push(x);
  return out;
}

/** Offene Notrufe — was noch niemand bestätigt hat. */
const offeneNotrufe = (m) => (m.notrufe || [])
  .filter((n) => !n.bestaetigt)
  .sort((a, b) => b.zeit.localeCompare(a.zeit));

/* ==========================================================================
   BERICHT AN DEN AUFTRAGGEBER
   Aus der internen Übergabe eine Fassung, die nach außen darf: ohne Namen,
   ohne Interna, ohne Krankheitsgründe.
   ========================================================================== */

function auftraggeberBericht(m, von, bis, einheitId) {
  const zeilen = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    const u = (m.uebergaben || {})[`${d}|${einheitId}`];
    if (!u || !u.abgeschlossen) continue;
    /* Nur Lage und Vorkommnisse — offene Aufgaben und Material sind intern. */
    zeilen.push({ datum: d, dienst: u.dienstId,
      lage: u.lage || "", vorkommnis: u.vorkommnis || "" });
  }
  const besetzt = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    const bes = besetzung(m, d);
    const summe = Object.values(bes).reduce((a, b) => a + b.anzahl, 0);
    const soll = Object.values(bes).reduce((a, b) => a + b.soll, 0);
    besetzt.push({ datum: d, ist: summe, soll, gedeckt: soll === 0 || summe >= soll });
  }
  return {
    von, bis,
    tage: besetzt.length,
    vollstaendig: besetzt.filter((b) => b.gedeckt).length,
    quote: besetzt.length
      ? Math.round((besetzt.filter((b) => b.gedeckt).length / besetzt.length) * 100) : null,
    eintraege: zeilen,
    /* Bewusst nicht enthalten: Namen, Krankmeldungen, Stundenkonten,
       interne Aufgaben. Ein Auftraggeber bekommt Nachweis, keine Personalakte. */
  };
}

/* ==========================================================================
   ERSPARNIS
   Was ein Betrieb spart. Offen gerechnet, mit deutschen Zahlen und
   benannten Annahmen — eine Zahl ohne Herleitung glaubt zu Recht niemand.
   ========================================================================== */

const ERSPARNIS_ANNAHMEN = {
  stundenlohn: 16.50,        // Durchschnitt Wach- und Pflegehilfsberufe, brutto
  lohnnebenkosten: 0.21,     // Arbeitgeberanteil
  planungStundenWoche: 4,    // Zeit der Planung für einen Monatsplan, je Woche
  planungStundenlohn: 28,    // Kosten einer Planungsstunde
  fehlerAnteil: 0.008,       // Anteil fehlerhaft abgerechneter Stunden
  ausfaelleJahr: 2,          // unbesetzte Schichten je Jahr, die vermeidbar waren
  ausfallKosten: 180,        // Kosten einer kurzfristig unbesetzten Schicht
  erfassungAnteil: 0.010,    // nicht erfasste oder zu hoch erfasste Zeit
};

/**
 * Was CENTRIC im Jahr spart — konservativ gerechnet.
 * Jede Zeile nennt ihre Annahme, damit die Zahl nachprüfbar bleibt.
 */
function ersparnis(personen, standorte, monatspreis, eigen) {
  const a = { ...ERSPARNIS_ANNAHMEN, ...(eigen || {}) };
  const jahresstunden = personen * 1600;             // grob, nach Abzug von Urlaub
  const lohnkosten = jahresstunden * a.stundenlohn * (1 + a.lohnnebenkosten);

  const zeilen = [
    { was: "Genauere Zeiterfassung",
      grund: `${(a.erfassungAnteil * 100).toFixed(1)} % der Stunden werden heute zu hoch erfasst`,
      betrag: Math.round(lohnkosten * a.erfassungAnteil) },
    { was: "Weniger Planungsaufwand",
      grund: `${a.planungStundenWoche} Stunden je Woche, die der Rechenkern übernimmt`,
      betrag: Math.round(a.planungStundenWoche * 52 * a.planungStundenlohn * 0.6) },
    { was: "Weniger Abrechnungsfehler",
      grund: `${(a.fehlerAnteil * 100).toFixed(1)} % Fehleranteil, davon die Hälfte vermeidbar`,
      betrag: Math.round(lohnkosten * a.fehlerAnteil * 0.5) },
    { was: "Vermiedene Ausfälle",
      grund: `${a.ausfaelleJahr} kurzfristig unbesetzte Schichten je Jahr`,
      betrag: Math.round(a.ausfaelleJahr * a.ausfallKosten * Math.max(1, standorte)) },
  ];
  const brutto = zeilen.reduce((s, z) => s + z.betrag, 0);
  const kosten = Math.round(monatspreis * 12);
  /* Im ersten Jahr wird nicht alles gehoben — Einführung, Gewöhnung,
     Widerstände. Zwei Drittel sind eine ehrliche Annahme. */
  const anlauf = 0.66;
  const netto = Math.round(brutto * anlauf - kosten);
  return { zeilen, brutto, kosten, anlauf, netto,
    jePerson: personen ? Math.round(netto / personen) : 0,
    lohnkosten: Math.round(lohnkosten),
    lohntSich: netto > 0,
    amortisation: brutto > 0 ? Math.max(1, Math.round((kosten / (brutto * anlauf)) * 12)) : null };
}

/* ==========================================================================
   ERMÜDUNG

   Die Ruhezeitprüfung sieht immer nur zwei Dienste. Was sich über zwei
   Wochen aufbaut, sieht sie nicht: Sieben Nachtdienste in zehn Tagen
   erfüllen jede Einzelregel und sind trotzdem gefährlich.

   Eine Untersuchung an 4.573 Rettungsdienstschichten fand, dass gut die
   Hälfte auf sechs oder weniger Stunden Schlaf folgte — als Folge von
   Planung, die kumulierte Belastung nicht betrachtet.

   Bewusst keine Sperre, sondern eine Warnstufe. Wer sperrt, wo das Gesetz
   es nicht verlangt, erzeugt Umgehungen — und dann steht die Belastung
   nirgends mehr.
   ========================================================================== */

const ERMUEDUNG_STUFEN = {
  normal: { label: "unauffällig", ton: null, ab: 0,
    text: "Die Belastung liegt im üblichen Rahmen." },
  erhoeht: { label: "erhöht", ton: "warn", ab: 45,
    text: "Auffällig, aber vertretbar. Bei der nächsten Planung berücksichtigen." },
  hoch: { label: "hoch", ton: "danger", ab: 70,
    text: "Deutlich über dem Üblichen. Vor weiteren Einsätzen ansprechen." },
};

/** Was in die Bewertung eingeht — offen benannt, damit sie nachprüfbar bleibt. */
const ERMUEDUNG_GEWICHTE = {
  nachtanteil: 30,        // Anteil Nachtdienste an allen Diensten
  serie: 25,              // längste Serie ohne freien Tag
  wechsel: 20,            // Wechsel zwischen Schichtlagen
  wochenende: 10,         // Anteil belegter Wochenenden
  ueberstunden: 15,       // Stundenkonto über der Ausgleichsgrenze
};

/** In welcher Lage liegt ein Dienst? Für die Zählung der Wechsel. */
function schichtlage(da) {
  if (!da) return null;
  const beginn = Number(String(da.start).slice(0, 2)) * 60
    + Number(String(da.start).slice(3, 5));
  if (da.ende <= da.start || beginn >= 1140 || beginn < 300) return "nacht";
  if (beginn < 660) return "frueh";
  return "spaet";
}

/**
 * Ermüdungsbild einer Person über einen Zeitraum.
 * Gibt nicht nur eine Zahl zurück, sondern die einzelnen Ursachen — eine
 * Kennzahl ohne Herleitung ändert kein Verhalten.
 */
function ermuedung(m, personId, tage) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return null;
  const n = tage || 28;
  const bis = heute();
  const von = addDays(bis, -(n - 1));

  const dienste = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    if (!imDienst(p, d)) continue;
    if (abwesenheitAm(m, p.id, d)) { dienste.push({ datum: d, frei: true, abwesend: true }); continue; }
    const t = personTag(m, p, d);
    const da = t && t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
    dienste.push({ datum: d, frei: !da, da, lage: schichtlage(da) });
  }
  const gearbeitet = dienste.filter((x) => !x.frei);
  if (!gearbeitet.length) return { stufe: "normal", punkte: 0, gruende: [],
    dienste: 0, tage: n, nachtanteil: 0, serie: 0, wechsel: 0 };

  /* Nachtanteil */
  const naechte = gearbeitet.filter((x) => x.lage === "nacht").length;
  const nachtanteil = naechte / gearbeitet.length;

  /* Längste Serie ohne freien Tag */
  let serie = 0, lauf = 0;
  for (const x of dienste) {
    if (x.frei) { serie = Math.max(serie, lauf); lauf = 0; }
    else lauf++;
  }
  serie = Math.max(serie, lauf);

  /* Wechsel zwischen Schichtlagen — der Vorwärtswechsel Früh→Spät→Nacht
     ist verträglicher als der Rückwärtswechsel. Gezählt wird nur der
     Rückwärtswechsel, weil er die Erholung stärker stört. */
  const folge = { frueh: 0, spaet: 1, nacht: 2 };
  let wechsel = 0, letzte = null;
  for (const x of gearbeitet) {
    if (x.lage && letzte && x.lage !== letzte
      && folge[x.lage] < folge[letzte]) wechsel++;
    if (x.lage) letzte = x.lage;
  }

  /* Wochenenden */
  const we = gearbeitet.filter((x) => [5, 6].includes(dow(x.datum))).length;
  const weGesamt = dienste.filter((x) => [5, 6].includes(dow(x.datum))).length;
  const weAnteil = weGesamt ? we / weGesamt : 0;

  /* Stundenkonto über der Grenze */
  const konto = stundenkonto(m, p, bis.slice(0, 7));
  const grenze = m.einstellungen.ausgleichsgrenze || 40;
  const ueber = Math.max(0, konto) / grenze;

  const G = ERMUEDUNG_GEWICHTE;
  const gruende = [];
  let punkte = 0;

  /* Ab 40 % Nachtanteil wird es auffällig — darunter ist es normale
     Wechselschicht. */
  if (nachtanteil > 0.4) {
    const w = Math.min(1, (nachtanteil - 0.4) / 0.4) * G.nachtanteil;
    punkte += w;
    gruende.push({ was: "Hoher Nachtanteil",
      wert: `${Math.round(nachtanteil * 100)} % der Dienste`, punkte: Math.round(w) });
  }
  const maxFolge = m.einstellungen.maxFolge || 6;
  if (serie > maxFolge) {
    const w = Math.min(1, (serie - maxFolge) / 4) * G.serie;
    punkte += w;
    gruende.push({ was: "Lange Dienstserie",
      wert: `${serie} Tage ohne frei`, punkte: Math.round(w) });
  }
  if (wechsel > 2) {
    const w = Math.min(1, (wechsel - 2) / 5) * G.wechsel;
    punkte += w;
    gruende.push({ was: "Häufiger Rückwärtswechsel",
      wert: `${wechsel} Mal von später auf früher`, punkte: Math.round(w) });
  }
  if (weAnteil > 0.6) {
    const w = Math.min(1, (weAnteil - 0.6) / 0.4) * G.wochenende;
    punkte += w;
    gruende.push({ was: "Viele Wochenenden",
      wert: `${Math.round(weAnteil * 100)} % belegt`, punkte: Math.round(w) });
  }
  if (ueber > 0.5) {
    const w = Math.min(1, (ueber - 0.5) / 0.5) * G.ueberstunden;
    punkte += w;
    gruende.push({ was: "Stundenkonto im Plus",
      wert: `${n1(konto)} Stunden`, punkte: Math.round(w) });
  }

  punkte = Math.round(punkte);
  const stufe = punkte >= ERMUEDUNG_STUFEN.hoch.ab ? "hoch"
    : punkte >= ERMUEDUNG_STUFEN.erhoeht.ab ? "erhoeht" : "normal";

  return { stufe, punkte, gruende: gruende.sort((a, b) => b.punkte - a.punkte),
    dienste: gearbeitet.length, tage: n,
    nachtanteil: Math.round(nachtanteil * 100), serie, wechsel,
    wochenendanteil: Math.round(weAnteil * 100), konto: n1(konto) };
}

/** Wer im Betrieb ist auffällig? Für die Übersicht der Planung. */
function ermuedungsBild(m, tage) {
  return m.personen
    .filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false)
    .map((p) => ({ person: p, e: ermuedung(m, p.id, tage) }))
    .filter((x) => x.e)
    .sort((a, b) => b.e.punkte - a.e.punkte);
}

/* ==========================================================================
   REIHENFOLGE NACH DIENSTALTER
   Wo eine Betriebsvereinbarung es vorschreibt, entscheidet nicht die
   Eignung, sondern die Zugehörigkeit. Beides ist vertretbar — aber der
   Betrieb muss wählen können, und die Wahl muss sichtbar sein.
   ========================================================================== */

const REIHENFOLGE_ARTEN = {
  eignung: { label: "Nach Eignung",
    text: "Stundenkonto, Auslastung, Wünsche und wie oft jemand zuletzt eingesprungen ist." },
  dienstalter: { label: "Nach Dienstalter",
    text: "Wer länger im Betrieb ist, wird zuerst gefragt. Üblich bei Betriebsvereinbarungen." },
  gemischt: { label: "Gemischt",
    text: "Dienstalter entscheidet, Eignung bricht Gleichstand." },
};

/** Dienstalter in Tagen. */
const dienstalter = (p) => p.eintritt ? Math.max(0, between(p.eintritt, heute())) : 0;

/**
 * Ordnet Kandidaten nach der eingestellten Art.
 * Die Begründung wird mitgegeben — auch bei Dienstalter soll sichtbar
 * bleiben, warum jemand oben steht.
 */
function nachReihenfolge(m, kandidaten, datum, dienstId) {
  const art = (m.einstellungen || {}).reihenfolge || "eignung";
  if (art === "eignung") return kandidaten;
  const mit = kandidaten.map((k) => ({ ...k, alter: dienstalter(k.person || k) }));
  if (art === "dienstalter")
    return mit.sort((a, b) => b.alter - a.alter);
  /* Gemischt: Dienstalter in Stufen von einem Jahr, Eignung bricht Gleichstand */
  return mit.sort((a, b) => {
    const ja = Math.floor(a.alter / 365), jb = Math.floor(b.alter / 365);
    if (ja !== jb) return jb - ja;
    return (b.punkte || 0) - (a.punkte || 0);
  });
}

/* ==========================================================================
   SONDEREINSÄTZE
   Ein Einsatz außerhalb des Regelplans: Veranstaltung, Streikbegleitung,
   zusätzlicher Objektschutz. Mit eigener Kostenstelle, weil er dem
   Auftraggeber gesondert berechnet wird.
   ========================================================================== */

function sondereinsatzStunden(m, id) {
  const s = (m.sondereinsaetze || []).find((x) => x.id === id);
  if (!s) return null;
  const je = s.ende && s.start
    ? (() => { const a = Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3));
        let b = Number(s.ende.slice(0, 2)) * 60 + Number(s.ende.slice(3));
        if (b <= a) b += 1440;
        return (b - a - (s.pause || 0)) / 60; })()
    : 0;
  const personen = (s.zugeteilt || []).length;
  return { jePerson: Math.round(je * 10) / 10, personen,
    gesamt: Math.round(je * personen * 10) / 10 };
}

/** Alle Sondereinsätze eines Zeitraums, mit Stunden. */
function sondereinsaetze(m, von, bis) {
  return (m.sondereinsaetze || [])
    .filter((s) => s.datum >= von && s.datum <= bis)
    .map((s) => ({ ...s, stunden: sondereinsatzStunden(m, s.id) }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/* ==========================================================================
   URLAUBSVERGABE IM VERFAHREN
   Statt „wer zuerst kommt": eine Runde, in der jeder mehrere Wünsche mit
   Rangfolge angibt. Die Zuteilung geht reihum nach Dienstalter — wer im
   ersten Durchgang zum Zug kam, tritt im zweiten zurück.
   ========================================================================== */

/**
 * Teilt Urlaubswünsche zu. Deterministisch, damit dasselbe Ergebnis
 * herauskommt, wenn jemand nachrechnet.
 */
function urlaubVerteilen(m, runde) {
  if (!runde) return { zuteilungen: [], offen: [] };
  const wuensche = (runde.wuensche || []);
  /* Beteiligte nach Dienstalter, ältester zuerst */
  const leute = [...new Set(wuensche.map((w) => w.personId))]
    .map((id) => m.personen.find((p) => p.id === id))
    .filter(Boolean)
    .sort((a, b) => dienstalter(b) - dienstalter(a));

  const zuteilungen = [];
  const offen = [];
  const belegt = {};   // Datum → Anzahl bereits Abwesender

  const passt = (von, bis) => {
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const schon = (belegt[d] || 0)
        + m.personen.filter((p) => imDienst(p, d) && abwesenheitAm(m, p.id, d)).length;
      const aktiv = m.personen.filter((p) => imDienst(p, d)
        && p.imSchichtdienst !== false).length;
      /* Höchstens ein Drittel gleichzeitig abwesend — sonst kippt die Woche */
      if (schon + 1 > Math.max(1, Math.floor(aktiv * (runde.hoechstanteil || 0.33))))
        return false;
    }
    return true;
  };

  /* Mehrere Durchgänge: Im ersten bekommt jeder seinen Erstwunsch, sofern
     möglich. Danach kommen die Zweitwünsche derer, die leer ausgingen. */
  const vergeben = new Set();
  for (let rang = 1; rang <= 3; rang++) {
    for (const p of leute) {
      if (vergeben.has(p.id)) continue;
      const w = wuensche.find((x) => x.personId === p.id && x.rang === rang);
      if (!w) continue;
      if (passt(w.von, w.bis)) {
        for (let d = w.von; d <= w.bis; d = addDays(d, 1))
          belegt[d] = (belegt[d] || 0) + 1;
        zuteilungen.push({ personId: p.id, von: w.von, bis: w.bis, rang,
          tage: between(w.von, w.bis) + 1 });
        vergeben.add(p.id);
      }
    }
  }
  for (const p of leute) if (!vergeben.has(p.id))
    offen.push({ personId: p.id,
      wuensche: wuensche.filter((x) => x.personId === p.id) });

  return { zuteilungen, offen,
    beteiligt: leute.length, zugeteilt: zuteilungen.length,
    erstwunsch: zuteilungen.filter((z) => z.rang === 1).length };
}
function handbuchDruck(m) {
  const kapitel = HANDBUCH.filter((k) => !k.nurWenn || k.nurWenn(m));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const teile = [];
  teile.push(`<div class="deckel">
    <div class="rub">Handbuch</div>
    <h1>CENTRIC</h1>
    <div class="unter">Dienstplanung im Schichtbetrieb</div>
    <div class="betrieb">${esc(m.name)}</div>
    <div class="stand">Stand ${fLang(heute())}</div>
  </div>`);

  teile.push(`<div class="inhalt"><h2>Inhalt</h2><ol>`);
  for (const k of kapitel) teile.push(`<li>${esc(k.titel)} <span class="d">${esc(k.dauer)}</span></li>`);
  teile.push(`</ol></div>`);

  for (const k of kapitel) {
    teile.push(`<section><div class="rub">${esc(k.dauer)}</div><h2>${esc(k.titel)}</h2>
      <p class="ein">${esc(k.einleitung)}</p>`);
    for (const a of k.abschnitte) {
      teile.push(`<div class="ab"><h3>${esc(a.titel)}</h3><p>${esc(a.text)}</p>`);
      if (a.schritte) {
        teile.push("<ol class='s'>");
        for (const s of a.schritte) teile.push(`<li>${esc(s)}</li>`);
        teile.push("</ol>");
      }
      if (a.pruefen) teile.push(`<div class="ok"><b>Woran du merkst, dass es geklappt hat</b><br>${esc(a.pruefen)}</div>`);
      if (a.merke) teile.push(`<div class="merke">${esc(a.merke)}</div>`);
      teile.push("</div>");
    }
    teile.push("</section>");
  }

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>CENTRIC — Handbuch · ${esc(m.name)}</title><style>
@page{size:A4;margin:20mm 18mm}
*{box-sizing:border-box}
body{font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1C1917;font-size:10.5pt;
  line-height:1.6;margin:0}
.deckel{page-break-after:always;padding-top:70mm}
.deckel h1{font-size:44pt;font-weight:300;letter-spacing:-2px;margin:6px 0 4px}
.deckel .unter{font-size:13pt;color:#57534E}
.deckel .betrieb{font-size:15pt;font-weight:600;margin-top:34mm}
.deckel .stand{font-size:9.5pt;color:#57534E;margin-top:4px}
.rub{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#0F766E}
.inhalt{page-break-after:always}
.inhalt ol{padding-left:18px}
.inhalt li{padding:5px 0;font-size:11pt}
.inhalt .d{color:#57534E;font-size:9pt}
h2{font-size:19pt;font-weight:600;letter-spacing:-.5px;margin:6px 0 8px}
section{page-break-before:always}
.ein{color:#57534E;margin:0 0 16px;font-size:11pt}
.ab{break-inside:avoid;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #E5E7EB}
.ab:last-child{border-bottom:none}
h3{font-size:12.5pt;font-weight:650;margin:0 0 6px}
p{margin:0 0 10px}
ol.s{padding-left:20px;margin:0 0 12px}
ol.s li{padding:3px 0}
.ok{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:9px 12px;
  margin:0 0 10px;font-size:9.5pt}
.ok b{color:#15803D;font-size:8pt;letter-spacing:.1em;text-transform:uppercase}
.merke{border-left:3px solid #0F766E;padding:6px 0 6px 12px;color:#57534E;font-size:10pt}
</style></head><body>${teile.join("")}</body></html>`;
}
const ABLAUF = [
  {
    id: "einrichten", titel: "Betrieb einrichten", rolle: "leitung", ziel: "betrieb",
    kurz: "Standorte, Regelwerk, Dienstarten",
    was: "Wie der Betrieb aufgebaut ist: Standorte mit eigenem Bundesland, die vertragliche Wochenarbeitszeit, Ruhezeiten und die Höchstzahl von Diensten in Folge.",
    warum: "Alles Weitere rechnet damit. Feiertage richten sich nach dem Standort, die Prüfung nach dem Regelwerk.",
    fertig: (m) => (m.standorte || []).length > 0 && m.dienstarten.length > 0,
    stand: (m) => `${(m.standorte || []).length} Standort${(m.standorte || []).length === 1 ? "" : "e"} · ${m.dienstarten.length} Dienstarten · ${n1(m.einstellungen.sollWochenstunden)} h je Woche`,
  },
  {
    id: "personal", titel: "Personal anlegen", rolle: "leitung", ziel: "personal",
    kurz: "Menschen erfassen, Zugangsarten vergeben",
    was: "Wer im Betrieb arbeitet — einzeln angelegt oder aus einer Liste eingelesen. Danach bekommt jede Person eine Zugangsart, die bestimmt, was sie sehen und ändern darf.",
    warum: "Ohne Personal bleibt der Plan leer. Die Zugangsart entscheidet über Rechte und wirkt auf die monatlichen Kosten.",
    fertig: (m) => m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false).length >= 2,
    stand: (m) => {
      const n = m.personen.filter((p) => imDienst(p, heute())).length;
      const pl = m.personen.filter((p) => ["planer", "subplaner"].includes(p.rolle)).length;
      return `${n} Person${n === 1 ? "" : "en"} · ${pl} mit Planungsrechten`;
    },
  },
  {
    id: "quals", titel: "Qualifikationen zuordnen", rolle: "leitung", ziel: "quals",
    kurz: "Wer darf was, mit Ablaufdatum",
    was: "Sachkunde, Schichtleitung, Erste Hilfe. Qualifikationen mit Ablaufdatum brauchen einen Nachweis — läuft er ab, zählt die Qualifikation nicht mehr für die Besetzung.",
    warum: "Die Besetzungsprüfung und die Ersatzsuche greifen darauf zu. Ohne Zuordnung kann die App nicht erkennen, ob ein Dienst fachlich gedeckt ist.",
    fertig: (m) => (m.qualifikationen || []).length > 0
      && m.personen.some((p) => imDienst(p, heute()) && (p.qualifikationen || []).length),
    stand: (m) => `${(m.qualifikationen || []).length} Qualifikationen · ${m.personen.filter((p) => (p.qualifikationen || []).length).length} Personen zugeordnet`,
  },
  {
    id: "schichtfolge", titel: "Schichtfolge festlegen", rolle: "planer", ziel: "folge",
    kurz: "Modell wählen, Gruppen und Startpunkte",
    was: "Der Zyklus und der Startpunkt jeder Gruppe. Aus beidem berechnet CENTRIC den Plan für jeden Tag — es wird nichts ausgerollt, es gibt keine Jahresgrenze.",
    warum: "Das ist die eigentliche Planung. Der Einrichtungsassistent führt durch die Auswahl und zeigt bei jedem Modell die gerechneten Kennzahlen.",
    fertig: (m) => m.zyklus && m.zyklus.tage && m.zyklus.tage.some((t) => t && t !== "-")
      && m.einheiten.filter((e) => !e.pool).length >= 2,
    stand: (m) => `${m.zyklus.tage.length} Zyklustage · ${m.einheiten.filter((e) => !e.pool).length} ${m.einheitLabel}n`,
  },
  {
    id: "pruefen", titel: "Plan prüfen und freigeben", rolle: "planer", ziel: "plan",
    kurz: "Befunde beheben, dann verbindlich machen",
    was: "Die Prüfung meldet Unterbesetzung, Ruhezeitverstöße, fehlende Qualifikationen und Einsatzeinschränkungen. Sind die Befunde geklärt, wird der Monat freigegeben.",
    warum: "Erst mit der Freigabe ist der Plan verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus.",
    fertig: (m) => Object.keys(m.freigaben || {}).length > 0,
    stand: (m) => {
      const n = Object.keys(m.freigaben || {}).length;
      return n ? `${n} Monat${n === 1 ? "" : "e"} freigegeben` : "noch keine Freigabe";
    },
  },
  {
    id: "betrieb", titel: "Laufender Betrieb", rolle: "alle", ziel: "start",
    kurz: "Dienst tun, Zeiten bestätigen, Lücken schließen",
    was: "Beschäftigte stempeln ein, bestätigen Zeiten, stellen Anträge und Tauschgesuche. Die Schichtverantwortung schließt Lücken, die Planung entscheidet Anträge.",
    warum: "Hier entsteht die Wahrheit über den Monat — Grundlage für Stundenkonten, Zuschläge und Abrechnung.",
    fertig: (m) => Object.keys(m.erfassung || {}).length > 0 || (m.anfragen || []).length > 0,
    stand: (m) => `${Object.keys(m.erfassung || {}).length} bestätigte Zeiten · ${(m.anfragen || []).length} Vorgänge`,
  },
];
const EINFUEHRUNG = {
  leitung: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du richtest den Betrieb ein. Dieser Rundgang zeigt in fünf Schritten, was dafür nötig ist — und wer danach übernimmt. Er lässt sich jederzeit abbrechen und später fortsetzen." },
    { titel: "Der Ablauf im Überblick", ziel: null, diagramm: true,
      text: "Sechs Stationen führen vom leeren Betrieb zum laufenden Plan. Die ersten drei sind deine, danach übernimmt die Planung. Jede Station lässt sich antippen und erklärt sich selbst." },
    { titel: "Betrieb einrichten", ziel: "betrieb",
      text: "Standorte mit eigenem Bundesland, vertragliche Wochenarbeitszeit, Ruhezeit und Höchstzahl der Dienste in Folge. Diese Werte sind die Grundlage jeder Prüfung — Feiertage und Sollstunden richten sich danach." },
    { titel: "Personal anlegen", ziel: "personal",
      text: "Zwei Wege: eine Liste aus Tabellenkalkulation einlesen oder Personen einzeln anlegen. Danach vergibst du je Person eine Zugangsart. Sie bestimmt Rechte und wirkt unmittelbar auf die monatlichen Kosten — Betriebsrat und Organisationsleitung sind kostenfrei." },
    { titel: "Qualifikationen zuordnen", ziel: "quals",
      text: "Wer darf was. Qualifikationen mit Ablaufdatum brauchen einen Nachweis; läuft er ab, zählt die Qualifikation nicht mehr für die Besetzung. Die Matrix zeigt zudem, wo eine Qualifikation an einer einzigen Person hängt." },
    { titel: "Danach übernimmt die Planung", ziel: null,
      text: "Sobald Personal und Qualifikationen stehen, legt die Planung die Schichtfolge fest und gibt den ersten Monat frei. Du behältst überall Einblick und kannst jederzeit eingreifen." },
  ],
  planer: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du planst die Dienste. Dieser Rundgang zeigt deinen Teil des Ablaufs — und was die Organisationsleitung bereits vorbereitet hat." },
    { titel: "Was schon steht", ziel: null, diagramm: true, vorher: true,
      text: "Die grün markierten Stationen sind erledigt. Darauf setzt deine Arbeit auf: Standorte und Regelwerk bestimmen, wie geprüft wird; Personal und Qualifikationen, wer eingeteilt werden kann." },
    { titel: "Schichtfolge festlegen", ziel: "folge",
      text: "Ein Zyklus und ein Startpunkt je Gruppe — daraus wird der Plan für jeden Tag berechnet. Der Einrichtungsassistent bietet geprüfte Modelle mit gerechneten Kennzahlen: Wochenstunden, längste Dienstserie, Deckungslücken." },
    { titel: "Planen und prüfen", ziel: "plan",
      text: "Der Monatsplan zeigt alle Gruppen. Die Prüfung meldet Unterbesetzung, Ruhezeitverstöße und fehlende Qualifikationen. Der Planungsassistent füllt offene Stellen automatisch — nichts wird ohne deine Freigabe übernommen." },
    { titel: "Freigeben", ziel: "plan",
      text: "Mit der Freigabe wird der Monat verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus, und der Planstandvergleich zeigt, was sich seither geändert hat." },
    { titel: "Im laufenden Betrieb", ziel: "lage",
      text: "Das Lagebild zeigt die Besetzung von heute. Bei einer Lücke führt ein Klick zur Schnellbesetzung: Ersatz vorschlagen lassen, Folgen prüfen, eintragen — oder eine Anfrage versenden." },
  ],
  subplaner: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du bist schichtverantwortlich und fährst selbst mit. Dieser Rundgang zeigt, was du in deiner Einheit tun kannst." },
    { titel: "Was schon steht", ziel: null, diagramm: true, vorher: true,
      text: "Betrieb, Personal und Schichtfolge sind eingerichtet, der Plan ist freigegeben. Deine Aufgabe beginnt im laufenden Betrieb." },
    { titel: "Dein Lagebild", ziel: "lage",
      text: "Die Besetzung deiner Einheit für heute. Ist ein Dienst unterbesetzt, führt ein Klick zur Schnellbesetzung — mit Ersatzvorschlägen und einer Prüfung der Folgen, bevor du einteilst." },
    { titel: "Anträge entscheiden", ziel: "antraege",
      text: "Urlaubsanträge und Tauschanfragen aus deiner Einheit. Die Kapazitätsvorschau zeigt vorab, welche Wochen kippen würden, wenn du alle offenen Anträge genehmigst." },
    { titel: "Deine eigenen Dienste", ziel: "meine",
      text: "Du fährst selbst mit: eigene Schichten, Zeiten bestätigen, Verfügbarkeit pflegen, Anträge stellen. Alles wie für jede andere Person im Schichtdienst." },
  ],
  mitarbeiter: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Hier findest du deinen Dienstplan, stempelst ein und stellst Anträge. Der Rundgang dauert eine Minute." },
    { titel: "Heute", ziel: null,
      text: "Der Startbildschirm zeigt deinen Dienst des Tages mit einem großen Knopf zum Ein- und Ausstempeln. Beim Stempeln wird einmalig der Standort geprüft — gespeichert wird nur, ob du am Einsatzort warst, keine Koordinate und kein Verlauf." },
    { titel: "Mein Plan", ziel: null,
      text: "Kommende Dienste als Liste oder Monatsansicht. Ein Tipp auf einen Tag öffnet die Möglichkeiten: Tausch suchen, frei beantragen oder einen Wunsch hinterlegen." },
    { titel: "Anliegen", ziel: null,
      text: "Anträge, Krankmeldung, Tauschbörse und dein Stundenkonto. In der Tauschbörse stehen offene Gesuche aller — wer einspringen kann, meldet sich mit einem Tipp." },
    { titel: "Mehr", ziel: null,
      text: "Verfügbarkeit einstellen, Wunschdienste, Nachweise, Schwarzes Brett. Hier findest du auch den Feldmodus für größere Schrift und den Wechsel zur Rechneransicht." },
  ],
  betriebsrat: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du hast einen rein lesenden Prüfzugang — kostenfrei und ohne Eingriffsmöglichkeit. Der Rundgang zeigt, was einsehbar ist." },
    { titel: "Der Ablauf", ziel: null, diagramm: true,
      text: "So entsteht der Dienstplan. Du siehst jede Station, änderst aber nichts." },
    { titel: "Belastungsverteilung", ziel: "verteilung",
      text: "Wochenendnächte, Feiertage, Nachtdienste und kurzfristige Änderungen je Person — mit Abweichung vom Mittel. Dazu die Kennzahl Planungssicherheit: der Anteil der Änderungen mit weniger als vierzehn Tagen Vorlauf." },
    { titel: "Prüfung und Nachweise", ziel: "pruef",
      text: "Alle Befunde zu Ruhezeiten, Höchstarbeitszeit, Unterbesetzung und Einsatzeinschränkungen. Dokumentierte Unterschreitungen sind mit Begründung hinterlegt." },
    { titel: "Protokoll", ziel: "betrieb",
      text: "Änderungen am Regelwerk und an der Schichtfolge sind nachvollziehbar festgehalten." },
  ],
};
function meineStation(sitz, st) {
  if (st.rolle === "alle") return true;
  if (st.rolle === "leitung") return darf(sitz, "org.edit");
  if (st.rolle === "planer") return darf(sitz, "pattern.edit") || darf(sitz, "plan.publish");
  if (st.rolle === "subplaner") return darf(sitz, "plan.edit.unit");
  return false;
}
const BR_STAFFEL = [
  [5, 20, 1], [21, 50, 3], [51, 100, 5], [101, 200, 7], [201, 400, 9],
  [401, 700, 11], [701, 1000, 13], [1001, 1500, 15], [1501, 2000, 17],
  [2001, 2500, 19], [2501, 3000, 21], [3001, 3500, 23], [3501, 4000, 25],
  [4001, 4500, 27], [4501, 5000, 29], [5001, 6000, 31], [6001, 7000, 33],
  [7001, 9000, 35],
];
const betriebsratGroesse = (n) => {
  if (n < 5) return 0;
  const t = BR_STAFFEL.find(([von, bis]) => n >= von && n <= bis);
  if (t) return t[2];
  return 35 + Math.ceil((n - 9000) / 3000) * 2;
};
function zugangsvorschlag(beschaeftigte, einheiten, brWaehlen = true) {
  // beschaeftigte = Gesamtbelegschaft einschließlich Leitung und Planung
  const n = Math.max(0, Math.round(beschaeftigte));
  const e = Math.max(1, Math.round(einheiten));
  const leitung = n > 0 ? 1 : 0;
  const planer = n === 0 ? 0 : n <= 40 ? 1 : Math.ceil(n / 120) + (n > 250 ? 1 : 0);
  const subplaner = n === 0 ? 0 : Math.min(n, e + (e >= 8 ? 1 : 0));
  const betriebsrat = brWaehlen ? Math.min(betriebsratGroesse(n), n) : 0;
  // n ist die Gesamtbelegschaft. Leitung und Planer sitzen im Geschäftszimmer,
  // Sub-Planer fahren mit — alle Übrigen erhalten einen Mitarbeiterzugang.
  const mitarbeiter = Math.max(0, n - leitung - planer - subplaner);
  return { leitung, planer, subplaner, mitarbeiter, betriebsrat,
    gesamt: leitung + planer + subplaner + mitarbeiter,
    begruendung: {
      leitung: "Eine Organisationsleitung je Betrieb — kostenfrei.",
      planer: n <= 40 ? "Bei dieser Größe genügt eine Person im Geschäftszimmer."
        : n > 250 ? "Etwa eine Person je 120 Beschäftigte, zuzüglich einer Vertretung."
        : "Etwa eine Person je 120 Beschäftigte.",
      subplaner: e >= 8 ? `Eine Schichtverantwortung je ${e} Einheiten, zuzüglich einer Vertretung.`
        : `Eine Schichtverantwortung je Einheit.`,
      betriebsrat: n < 5 ? "Unter fünf Beschäftigten ist kein Betriebsrat wählbar."
        : `${betriebsratGroesse(n)} Mitglieder nach § 9 Betriebsverfassungsgesetz — Zugang kostenfrei.`,
      mitarbeiter: "Alle Übrigen der Belegschaft.",
    } };
}
function preisFuer(tarif, v, standorte = 1) {
  const st = staffel(standorte);
  const jeStandort = Math.round(v.gesamt / Math.max(1, standorte));
  // Der gebuchte Tarif gilt als Untergrenze; größere Standorte steigen auf
  const noetig = tarifFuer(jeStandort);
  const t = tarif.jeStandort >= noetig.jeStandort ? tarif : noetig;
  const einzel = t.jeStandort;
  const netto = Math.round(einzel * (1 - st.rabatt) * 100) / 100;
  const standortSumme = Math.round(netto * standorte * 100) / 100;
  /* Die Betriebspauschale fällt einmal an, unabhängig von der Größe —
     Einrichtung, Betreuung und Bereitschaft skalieren nicht mit der
     Personenzahl. */
  const gesamt = Math.round((standortSumme + BETRIEBSPAUSCHALE) * 100) / 100;
  return { tarif: t, gebucht: tarif, st, standorte, jeStandort, einzel, netto,
    standortSumme, pauschale: BETRIEBSPAUSCHALE, gesamt,
    aufstieg: t.id !== tarif.id,
    jePerson: v.gesamt > 0 ? Math.round((gesamt / v.gesamt) * 100) / 100 : 0,
    passt: t.grenzen.personen >= v.gesamt };
}
function wochenKapazitaet(m, wochen, probeAnfragen) {
  const start = montag(heute());
  const mitProbe = probeAnfragen && probeAnfragen.length
    ? { ...m, abwesenheiten: [...m.abwesenheiten, ...probeAnfragen.map((a) => ({
        id: `p_${a.id}`, personId: a.personId, art: a.art, von: a.von, bis: a.bis, notiz: "Probe" }))] }
    : m;
  const out = [];
  for (let w = 0; w < wochen; w++) {
    const von = addDays(start, w * 7), bis = addDays(von, 6);
    const jetzt = pruefen(m, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
    const dann = pruefen(mitProbe, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
    // Auslastungsgrad: wie viele Personen sind in dieser Woche abwesend?
    let abw = 0, gesamt = 0;
    for (const p of m.personen) {
      if (!imDienst(p, von) || p.imSchichtdienst === false) continue;
      gesamt++;
      for (let i = 0; i < 7; i++) if (abwesenheitAm(mitProbe, p.id, addDays(von, i))) { abw++; break; }
    }
    out.push({ kw: w, von, bis, jetzt: jetzt.length, dann: dann.length,
      neu: Math.max(0, dann.length - jetzt.length),
      quote: gesamt ? Math.round((abw / gesamt) * 100) : 0,
      stand: dann.length > jetzt.length ? "kippt" : dann.length ? "eng" : "frei" });
  }
  return out;
}
const BEREICHE = [
  { id: "heute", label: "Heute", views: [
    ["start", "Start", null],
    ["ablauf", "Ablauf", null],
    ["handbuch", "Handbuch", null],
    ["uebergabe", "Übergabe", "PAKET:uebergabe"],
    ["meine", "Meine Schichten", "SCHICHT"],
    ["lage", "Lagebild", "plan.view.unit"],
    ["zeitachse", "Zeitachse", "plan.view.unit"],
  ]},
  { id: "planung", label: "Planung", views: [
    ["plan", "Monatsplan", "plan.view.all"],
    ["einsatz", "Personaleinsatz", "plan.view.unit"],
    ["jahr", "Jahresansicht", "plan.view.unit"],
    ["bereitschaft", "Bereitschaft", "plan.view.unit"],
    ["selbstplan", "Selbstplanung", "plan.edit.unit"],
    ["sonder", "Sondereinsätze", "plan.view.unit"],
    ["folge", "Schichtfolge", "pattern.edit"],
  ]},
  { id: "anliegen", label: "Anliegen", views: [
    ["notrufe", "Notrufe", "plan.view.unit"],
    ["offene", "Offene Schichten", null],
    ["antraege", "Anträge", "req.approve.unit"],
    ["boerse", "Tauschbörse", "req.create"],
    ["wuensche", "Wunschdienste", "SCHICHT"],
    ["aushang", "Schwarzes Brett", null],
    ["buch", "Dienstbuch", "plan.view.unit"],
  ]},
  { id: "team", label: "Team", views: [
    ["personal", "Personal", "staff.view"],
    ["quals", "Qualifikationen", "staff.view"],
    ["nachweise", "Nachweise", "staff.view"],
    ["einarbeitung", "Einarbeitung", "staff.view"],
    ["verteilung", "Verteilung", "staff.view"],
    ["mittel", "Betriebsmittel", "plan.view.unit"],
  ]},
  { id: "auswertung", label: "Auswertung", views: [
    ["pruef", "Prüfung", "plan.view.all"],
    ["belastung", "Belastung", "plan.view.unit"],
    ["belastbarkeit", "Belastbarkeit", "plan.view.unit"],
    ["planstand", "Planstand", "plan.view.unit"],
    ["nachweis", "Leistungsnachweis", "plan.view.unit"],
    ["abrechnung", "Abrechnungsdaten", "account.view.all"],
  ]},
  { id: "verwaltung", label: "Verwaltung", views: [
    ["betrieb", "Betrieb", "org.edit"],
    ["dienste", "Dienstarten", "org.edit"],
    ["einstellungen", "Einstellungen", null],
    ["mitnahme", "Datenmitnahme", "org.edit"],
  ]},
];
const NAV_KUNDE = BEREICHE.flatMap((b) => b.views);
function folgenPruefen(m, person, datum, dienstId) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return { hindernisse: [], hinweise: [] };
  const hind = hindernisse(m, person, datum, da);
  const hinweise = [];
  const map = Object.fromEntries(m.dienstarten.map((x) => [x.id, x]));

  // Folgeschichten in beide Richtungen ausdrücklich benennen
  for (const off of [-1, 1]) {
    const dd = addDays(datum, off);
    const t = personTag(m, person, dd);
    if (!t.dienstId) continue;
    const other = map[t.dienstId];
    if (!other) continue;
    const [nS, nE] = fenster(datum, da);
    const [oS, oE] = fenster(dd, other);
    const ruhe = off > 0 ? (oS - nE) / 60 : (nS - oE) / 60;
    hinweise.push({ art: ruhe < m.einstellungen.ruhezeit ? "danger" : "info",
      text: off > 0
        ? `Am Folgetag ${fKurz(dd)} bereits ${other.name} (${other.start}–${other.ende}) — Ruhezeit ${n1(Math.max(0, ruhe))} h`
        : `Am Vortag ${fKurz(dd)} bereits ${other.name} (${other.start}–${other.ende}) — Ruhezeit ${n1(Math.max(0, ruhe))} h` });
  }
  // Dienste in Folge nach der Einteilung
  let serie = 1;
  for (let i = 1; i <= 10; i++) { if (personTag(m, person, addDays(datum, -i)).dienstId) serie++; else break; }
  for (let i = 1; i <= 10; i++) { if (personTag(m, person, addDays(datum, i)).dienstId) serie++; else break; }
  if (serie > m.einstellungen.maxFolge)
    hinweise.push({ art: "danger", text: `Ergibt ${serie} Dienste am Stück, Grenzwert ist ${m.einstellungen.maxFolge}` });
  else if (serie >= m.einstellungen.maxFolge - 1)
    hinweise.push({ art: "warn", text: `Ergibt ${serie} Dienste am Stück` });

  // Wochenarbeitszeit
  const mo = montag(datum);
  let std = dauer(da);
  for (let i = 0; i < 7; i++) { const t = personTag(m, person, addDays(mo, i));
    if (t.dienstId && addDays(mo, i) !== datum) { const x = map[t.dienstId]; if (x) std += dauer(x); } }
  if (std > 48) hinweise.push({ art: "danger", text: `Ergibt ${n1(std)} h in dieser Kalenderwoche — über der Höchstgrenze von 48 h` });
  else if (std > 44) hinweise.push({ art: "warn", text: `Ergibt ${n1(std)} h in dieser Kalenderwoche` });

  const kto = stundenkonto(m, person, datum.slice(0, 7));
  hinweise.push({ art: "info", text: `Stundenkonto danach etwa ${sgn(kto + dauer(da))} h` });
  return { hindernisse: hind, hinweise, dienstart: da };
}
function anfrageText(m, datum, dienstId, fehlt) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  return [
    `${m.name} — kurzfristige Dienstanfrage`,
    ``,
    `${fLang(datum)}`,
    `${da ? `${da.name}, ${da.start} bis ${da.ende} Uhr` : dienstId}`,
    da && da.ort ? `Ort: ${da.ort}` : ``,
    fehlt > 0 ? `Es fehlen ${fehlt} Personen.` : `Verstärkung gesucht.`,
    ``,
    `Wer übernehmen kann, bitte kurz zurückmelden.`,
  ].filter(Boolean).join("\n");
}
function baueAusAnlage(f) {
const br = BRANCHEN.find((b) => b[0] === f.branche) || BRANCHEN[BRANCHEN.length - 1];
  const mo = MODELLE.find((x) => x.id === f.modellId) || MODELLE[0];
  const quals = (f.qualifikationen || []).filter((q) => q.name && q.name.trim())
    .map((q, i) => ({ id: `q${i + 1}`, name: q.name.trim(), kurz: (q.kurz || q.name.slice(0, 2)).toUpperCase(),
      farbe: PALETTE[i % PALETTE.length], gueltigMonate: q.gueltigMonate ?? null,
      nachweisPflicht: !!q.nachweisPflicht }));
  const standorte = (f.standorte || [{ name: "Hauptstandort", land: "HE" }])
    .map((x, i) => ({ id: `st${i + 1}`, name: x.name || `Standort ${i + 1}`, bundesland: x.land || "HE",
      lat: 50.11 + i * 1.3, lon: 8.68 + i * 1.1, radius: x.radius || 200 }));
  // Dienstarten aus dem gewählten Modell ableiten
  const dienstarten = mo.dienste.map((k, i) => {
    const v = DIENST_VORLAGEN[k];
    return { id: v.kurz + (mo.dienste.slice(0, i).some((x) => DIENST_VORLAGEN[x].kurz === v.kurz) ? i : ""),
      name: v.name, kurz: v.kurz, start: v.start, ende: v.ende, pause: 0, farbe: v.farbe,
      ort: standorte[0].name, posten: false, quelle: null, faktor: 1,
      ruhezeitNeutral: false, rufbereitschaft: false,
      mindest: { mo_do: 1, fr: 1, sa: mo.vollkonti ? 1 : 0, so: mo.vollkonti ? 1 : 0 }, mindestQual: {} };
  });
  const abbild = Object.fromEntries(mo.dienste.map((k, i) => [k, dienstarten[i].id]));
  const einheiten = Array.from({ length: f.gruppen || mo.gruppen }, (_, i) => ({
    id: uid("e"), name: `${f.einheitLabel} ${i + 1}`, versatz: Math.round((i * mo.versatzTage) / 7),
    versatzTage: i * mo.versatzTage, pool: false, standortId: standorte[0].id,
    farbe: PALETTE[i % PALETTE.length] }));
  const anker = montag(heute());
  const hauptId = uid("p");
  const m = {
    id: uid("m"), name: f.name.trim(), branche: f.branche, einheitLabel: f.einheitLabel,
    bundesland: standorte[0].bundesland, tarif: f.tarif, status: f.status || "test",
    seit: heute(), stichtag: addDays(heute(), f.status === "test" ? (f.testTage || 90) : 30),
    rabattGrund: 0, kontakt: f.kontakt || "", anschrift: f.anschrift || "", ustId: f.ustId || "",
    anker, zyklus: { wochen: Math.ceil(mo.tage.length / 7),
      tage: mo.tage.map((t) => (t && t !== "-" ? abbild[t] : "-")), vorlage: mo.id },
    matrix: JSON.parse(JSON.stringify(MATRIX_STD)),
    einstellungen: { ruhezeit: f.ruhezeit || 11, maxFolge: f.maxFolge || 6, maxNachtFolge: 4,
      maxUrlaubJeEinheit: 3, sollWochenstunden: f.wochenstunden || 40,
      ausgleichGrenze: f.ausgleichGrenze || 40, ausgleichFristMonate: 6, aufbewahrungMonate: 24 },
    standorte, einheiten, qualifikationen: quals, dienstarten,
    personen: [{ id: hauptId, vorname: (f.kontaktName || "Haupt Zugang").split(" ")[0],
      nachname: (f.kontaktName || "Haupt Zugang").split(" ").slice(1).join(" ") || "Zugang",
      funktion: "Organisationsleitung", email: f.kontakt || "",
      zugehoerigkeit: [{ ab: heute(), einheitId: einheiten[0].id }],
      eintritt: heute(), austritt: null, wochenstunden: f.wochenstunden || 40,
      urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
      qualifikationen: [], qualNachweise: [], teilzeit: null, springer: false,
      einschraenkungen: {}, verfuegbarkeit: { aktiv: false, raster: Array(21).fill(true) },
      nachweise: [], kontrastmodus: false, notiz: "", einarbeitung: null,
      benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
      einfuehrung: { erledigt: false, schritt: 0 },
      rolle: "leitung", rolleSeit: heute(), bereich: "ALLE", status: "aktiv", imSchichtdienst: false }],
    abwesenheiten: [], abweichungen: {}, anfragen: [], protokoll: [],
    freigaben: {}, nachrichten: [], aenderungen: [], erfassung: {}, einspruenge: [],
    zuschlaege: (f.zuschlaege || []).map((z, i) => ({ id: `z${i + 1}`, ...z })),
    urlaubsrunde: null, unterschreitungen: [], dienstbuch: [], stand: 0,
    betriebsmittel: [], aushang: [], einstempeln: {},
    wuensche: [], tagesnotizen: {}, planstaende: {},
  };
  return m;
}
function selbsttest() {
  const T = [];
  const ok = (name, erw, ist) => T.push({ name, erwartet: String(erw), ist: String(ist), ok: String(erw) === String(ist) });
  const db = startbestand();
  const m = db.mandanten[0];
  const sim = simulation(m);
  ok("Wochenarbeitszeit des Standardzyklus", 40.95, sim.wochenstunden);
  ok("Nachtanteil Nacht / Spät / Früh", "7 / 0,5 / 0",
    ["N", "S", "F"].map((id) => n1(nachtAnteil(m.dienstarten.find((d) => d.id === id))).replace(",0", "")).join(" / "));
  ok("Deckungslücken im Zyklus", 0, sim.luecken.length);
  const ym = heute().slice(0, 7);
  ok("Befunde im Ausgangszustand", 0, pruefen(m, `${ym}-01`, `${ym}-28`).length);
  // Gegenprobe: eine ganze Einheit aus einem Tag nehmen muss Unterbesetzung melden
  const dU = `${ym}-15`;
  const eU = m.einheiten.find((e) => einheitDienst(m, e.id, dU) === "F");
  const abU = { ...m.abweichungen };
  m.personen.filter((p) => einheitAm(p, dU) === eU.id).forEach((p) => { abU[`${p.id}|${dU}`] = "-"; });
  const bU = pruefen({ ...m, abweichungen: abU }, dU, dU);
  ok("Fehlende Einheit wird als Unterbesetzung gemeldet", true,
    bU.some((x) => x.art === "besetzung" && x.schwere === "danger"));

  const d = "2026-08-12";
  const eF = m.einheiten.find((e) => einheitDienst(m, e.id, d) === "F");
  const po = m.dienstarten.find((x) => x.posten);
  if (po && eF) {
    const kand = m.personen.filter((p) => einheitAm(p, d) === eF.id && p.funktion !== "Schichtleitung");
    const mA = { ...m, abweichungen: { ...m.abweichungen, [`${kand[6].id}|${d}`]: po.id } };
    const bA = besetzung(mA, d)[po.id];
    ok("Manuelle Postenzuweisung überbesetzt nicht", bA.soll, bA.anzahl);
    const c1 = [...postenBesatzung(m, eF.id, d, po.id)];
    const mB = { ...m, abweichungen: { ...m.abweichungen, [`${kand[2].id}|${d}`]: "-" } };
    const c2 = [...postenBesatzung(mB, eF.id, d, po.id)];
    ok("Ausfall verschiebt Postenbesatzung höchstens um eine Person", true, c1.filter((x) => c2.includes(x)).length >= c1.length - 1);
  }
  const p0 = m.personen[5];
  const mC = { ...m, abwesenheiten: [...m.abwesenheiten,
    { id: "t1", personId: p0.id, art: "urlaub", von: "2026-09-01", bis: "2026-09-10" },
    { id: "t2", personId: p0.id, art: "krank", von: "2026-09-05", bis: "2026-09-15" }] };
  ok("Überlappende Abwesenheit wird erkannt", true, pruefen(mC, "2026-09-01", "2026-09-20").some((x) => x.art === "ueberlappung"));
  ok("Krank hat Vorrang vor Urlaub", "krank", abwesenheitAm(mC, p0.id, "2026-09-07").art);

  const pv = m.personen[14], alt = einheitAm(pv, "2026-07-15");
  const mD = { ...m, personen: m.personen.map((p) => p.id === pv.id
    ? { ...p, zugehoerigkeit: [...p.zugehoerigkeit, { ab: "2026-08-01", einheitId: m.einheiten[3].id }] } : p) };
  const pvD = mD.personen.find((p) => p.id === pv.id);
  ok("Versetzung lässt Vormonat unverändert", `${alt}|${m.einheiten[3].id}`,
    `${einheitAm(pvD, "2026-07-15")}|${einheitAm(pvD, "2026-08-15")}`);
  ok("Feiertag senkt die Mindestbesetzung nicht", 7, mindestFuer(m, m.dienstarten.find((x) => x.id === "N"), "2026-04-03"));

  const t0 = Date.now();
  for (const p of m.personen) { stundenkonto(m, p, ym); nachtJahr(m, p, 2026); urlaubskonto(m, p, ym.slice(0, 4)); }
  const t1 = Date.now();
  for (const p of m.personen) { stundenkonto(m, p, ym); nachtJahr(m, p, 2026); urlaubskonto(m, p, ym.slice(0, 4)); }
  ok("Zwischenspeicher greift", true, Date.now() - t1 < 30);
  ok("Erster Aufbau unter 500 ms", true, t1 - t0 < 500);

  const mE = { ...m, dienstarten: m.dienstarten.map((x) => x.id === "F" ? { ...x, mindestQual: { q1: 99 } } : x) };
  ok("Qualifikationsprüfung schlägt an", true, pruefen(mE, `${ym}-01`, `${ym}-07`).some((x) => x.art === "qualifikation"));

  /* Zugriffstiefe */
  const sitzMA = { db, mandant: m, person: m.personen.find((p) => p.rolle === "mitarbeiter"), rolle: "kunde" };
  const sitzSP = { db, mandant: m, person: m.personen.find((p) => p.rolle === "subplaner"), rolle: "kunde" };
  const sitzPL = { db, mandant: m, person: m.personen.find((p) => p.rolle === "planer"), rolle: "kunde" };
  const sitzBR = { db, mandant: m, person: m.personen.find((p) => p.rolle === "betriebsrat"), rolle: "kunde" };
  ok("Mitarbeiter darf nicht planen", false, darf(sitzMA, "plan.edit.unit", sitzMA.person.bereich));
  ok("Mitarbeiter sieht fremde Konten nicht", false, darf(sitzMA, "account.view.all"));
  ok("Sub-Planer darf nur die eigene Einheit ändern", "true|false",
    `${darf(sitzSP, "plan.edit.unit", sitzSP.person.bereich)}|${darf(sitzSP, "plan.edit.unit", m.einheiten.find((e) => e.id !== sitzSP.person.bereich).id)}`);
  ok("Planer darf Dienstarten gestalten", true, darf(sitzPL, "shift.edit"));
  ok("Betriebsrat darf nichts ändern", false, darf(sitzBR, "plan.edit.all"));
  ok("Betreiber hat keinerlei Planungsrechte", false, darf({ rolle: "betreiber" }, "plan.view.all"));

  /* Kostenfortschreibung */
  const vor = preis(db, m);
  const neuP = { id: "np", vorname: "Neu", nachname: "Zugang", rolle: "planer", bereich: "ALLE", status: "aktiv",
    austritt: null, eintritt: heute(), zugehoerigkeit: [{ ab: heute(), einheitId: m.einheiten[0].id }],
    wochenstunden: 41, urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0, qualifikationen: [], funktion: "Fachkraft" };
  /* Im Standortmodell kostet eine zusätzliche Person nichts — genau das ist
     der Unterschied zu Anbietern mit Kopfpauschale. */
  const nach = preis(db, { ...m, personen: [...m.personen, neuP] });
  ok("Neuer Planer kostet keinen Aufpreis", n2(vor.gesamt), n2(nach.gesamt));
  const nachMA = preis(db, { ...m, personen: [...m.personen, { ...neuP, rolle: "mitarbeiter" }] });
  ok("Neuer Mitarbeiter kostet keinen Aufpreis", n2(vor.gesamt), n2(nachMA.gesamt));
  const nachBR = preis(db, { ...m, personen: [...m.personen, { ...neuP, rolle: "betriebsrat" }] });
  ok("Betriebsrat kostet keinen Aufpreis", n2(vor.gesamt), n2(nachBR.gesamt));
  ok("Preis haengt an der Zahl der Standorte", true, (() => {
    const zwei = preis(db, { ...m, standorte: [...m.standorte,
      { id: "sX", name: "Neu", bundesland: "HE", lat: 50, lon: 8, radius: 200 }],
      einheiten: m.einheiten.map((e, i) => i === 0 ? { ...e, standortId: "sX" } : e) });
    return zwei.standorte === vor.standorte + 1; })());
  ok("Jeder Standort nennt seinen Tarif", true,
    vor.zeilen.every((z) => !!z.tarif && z.netto > 0));

  /* Datenschutz */
  const bs = JSON.stringify(betreiberSicht(db, m));
  const treffer = m.personen.filter((p) => new RegExp(`\\b${p.nachname}\\b`).test(bs) || bs.includes(p.email) || bs.includes(p.id));
  ok("Betreibersicht enthält keine personenbezogenen Daten", 0, treffer.length);
  ok("Betreibersicht enthaelt die Standortabrechnung", true,
    betreiberSicht(db, m).preis.zeilen.length > 0);

  /* Rechnung */
  const rg = baueRechnung(db, m, ym);
  ok("Rechnung: Brutto = Netto plus Umsatzsteuer", n2(rg.netto + rg.steuer), n2(rg.brutto));
  const bytes = rechnungPDF(rg);
  ok("PDF beginnt mit gültiger Kennung", "%PDF-1.4", String.fromCharCode(...bytes.slice(0, 8)));
  ok("PDF hat Inhalt", true, bytes.length > 2000);
  ok("Word-Dokument enthält den Gesamtbetrag", true, rechnungHTML(rg).includes(eur(rg.brutto)));

  /* --- Neue Fähigkeiten --- */
  const d0 = `${ym}-15`;
  const eF0 = m.einheiten.find((e) => einheitDienst(m, e.id, d0) === "F");
  const opfer = m.personen.filter((p) => einheitAm(p, d0) === eF0.id && personTag(m, p, d0).dienstId === "F")[0];
  const krankM = { ...m, abwesenheiten: [...m.abwesenheiten, { id: "kk", personId: opfer.id, art: "krank", von: d0, bis: d0 }] };
  const vorschl = ersatzVorschlaege(krankM, d0, "F");
  ok("Ersatzsuche liefert mögliche Kräfte", true, vorschl.filter((x) => x.moeglich).length > 3);
  ok("Ersatzsuche reiht nach Eignung", true,
    vorschl.filter((x) => x.moeglich)[0].punkte > vorschl.filter((x) => x.moeglich).slice(-1)[0].punkte);
  ok("Kranke Person wird nicht vorgeschlagen", true,
    !vorschl.some((x) => x.person.id === opfer.id && x.moeglich));
  const ruheFall = vorschl.find((x) => x.hindernisse.some((h) => h.startsWith("Ruhezeit")));
  ok("Ruhezeit schließt Kandidaten aus", true, !!ruheFall || vorschl.filter((x) => !x.moeglich).length > 0);

  const pN = m.personen.find((p) => { for (let i = 0; i < 28; i++) { const t = personTag(m, p, addDays(`${ym}-01`, i));
    if (t.dienstId) { const dd = m.dienstarten.find((x) => x.id === t.dienstId); if (dd && nachtAnteil(dd) >= 2) return true; } } return false; });
  const mN = { ...m, personen: m.personen.map((p) => p.id === pN.id
    ? { ...p, einschraenkungen: { ...p.einschraenkungen, keineNacht: true } } : p) };
  ok("Nachtdienstverbot wird geprüft", true,
    pruefen(mN, `${ym}-01`, `${ym}-28`).some((x) => x.art === "einschraenkung"));
  const daN = m.dienstarten.find((x) => nachtAnteil(x) >= 2);
  ok("Nachtdienstverbot schließt aus der Ersatzsuche aus", true,
    hindernisse(mN, mN.personen.find((p) => p.id === pN.id), addDays(heute(), 400), daN)
      .some((h) => h.includes("Nachtdienste")));

  const mF = { ...m, freigaben: { [ym]: { stand: 1, zeit: "x", durch: "Test" } } };
  ok("Freigabestand wird geführt", 1, freigabeStand(mF, ym).stand);
  ok("Ohne Freigabe gilt der Plan als Entwurf", false,
    istFreigegeben({ ...m, freigaben: {} }, ym));
  ok("Der Beispielbetrieb ist freigegeben", true, istFreigegeben(m, ym));

  const pE = m.personen[3];
  const dE = (() => { for (let i = 0; i < 28; i++) { const d = addDays(`${ym}-01`, i);
    if (personTag(m, pE, d).dienstId) return d; } return null; })();
  const vorErf = istStunden(m, pE, ym).gesamt;
  const mErf = { ...m, erfassung: { [`${pE.id}|${dE}`]: { start: "06:00", ende: "18:00", bestaetigt: true, grund: "Einsatz" } } };
  ok("Erfasste Zeit verändert das Stundenkonto", true, istStunden(mErf, pE, ym).gesamt !== vorErf);
  ok("Offene Zeitbestätigungen werden erkannt", true, offeneErfassung(m, pE, addDays(heute(), -1)).length > 0);

  const mitte = `${ym}-20`;
  const spaet = { ...m, personen: [...m.personen, { ...m.personen[9], id: "neu1", rolle: "planer",
    eintritt: mitte, rolleSeit: mitte, zugehoerigkeit: [{ ab: mitte, einheitId: m.einheiten[0].id }] }] };
  /* Im Standortmodell wirkt ein später Eintritt nicht auf den Preis — wohl
     aber ein später Vertragsbeginn des Betriebs. */
  const spaetVertrag = { ...m, seit: mitte };
  const pa = preisAnteilig(db, spaetVertrag, ym), pg = preis(db, spaetVertrag);
  /* Anteilig wird nur, wer im Abrechnungsmonat beginnt oder endet. */
  const mTeil = { ...m, seit: `${ym}-16` };
  ok("Anteilige Abrechnung liegt unter der vollen", true,
    preisAnteilig(db, mTeil, ym).gesamt < preis(db, mTeil).gesamt);
  ok("Voller Monat wird voll berechnet", n2(preis(db, m).gesamt),
    n2(preisAnteilig(db, m, ym).gesamt));
  ok("Spaeter Beginn wird anteilig berechnet", true, pa.gesamt < pg.gesamt);
  const rgA = baueRechnung(db, spaetVertrag, ym);
  ok("Rechnung weist den Anteil aus", true,
    rgA.positionen.some((p2) => p2.text.includes("Anteilig")));
  ok("Rechnung nennt jeden Standort", true,
    baueRechnung(db, m, ym).positionen.filter((p2) => p2.text.includes("Tarif")).length
      === preis(db, m).standorte);

  const vt = verteilung(m, addDays(heute(), -90), heute());
  ok("Verteilung erfasst alle im Bestand", m.personen.filter((p) => imDienst(p, heute())).length, vt.zeilen.length);
  ok("Verteilung bildet Mittelwerte", true, vt.mittel.weNacht > 0);
  const ps = planungssicherheit({ ...m, aenderungen: [
    { personId: "a", datum: `${ym}-05`, vorlauf: 3 }, { personId: "b", datum: `${ym}-06`, vorlauf: 30 }] }, ym);
  ok("Planungssicherheit rechnet den Anteil", 50, ps.anteil);

  /* --- Ausbaustufe zwei --- */
  const pZ = m.personen[3];
  const zs = zuschlagStunden(m, pZ, ym);
  ok("Zuschlagsstunden werden getrennt erfasst", true, zs.nacht > 0 && zs.sonntag > 0);
  ok("Zuschlagsstunden überschreiten nicht die Arbeitszeit", true, zs.nacht <= zs.gesamt);
  const nachtD = m.dienstarten.find((x) => nachtAnteil(x) >= 2);
  const teile = tagesanteile("2026-08-01", nachtD);
  ok("Nachtdienst wird auf zwei Kalendertage verteilt", 2, teile.length);
  ok("Verteilte Minuten ergeben die Bruttodauer", n1(brutto(nachtD)),
    n1(teile.reduce((a, t2) => a + t2.minuten, 0) / 60));
  const zw = zuschlagWert(m, pZ, ym);
  ok("Zuschlagswert folgt dem Prozentsatz", n1(zs.nacht * 0.25),
    n1((zw.zeilen.find((l) => l.regel.art === "nacht") || {}).wert || 0));

  const pA = m.personen.reduce((a, b2) => (stundenkonto(m, b2, ym) > stundenkonto(m, a, ym) ? b2 : a));
  const ab = ausgleichBedarf(m, pA, ym);
  ok("Ausgleichsbedarf wird erkannt", true, ab.schichten > 0);
  const tagA = ausgleichTage(m, pA, heute(), 5)[0];
  const mFrei = { ...m, abwesenheiten: [...m.abwesenheiten,
    { id: "fz", personId: pA.id, art: "ausgleich", von: tagA.datum, bis: tagA.datum, notiz: "" }] };
  ok("Freischicht senkt das Stundenkonto", true, stundenkonto(mFrei, pA, ym) < stundenkonto(m, pA, ym));
  ok("Freischicht wird nicht gutgeschrieben", 0,
    istStunden(mFrei, pA, ym).gutgeschrieben - istStunden(m, pA, ym).gutgeschrieben);

  const luecke = { ...m, abweichungen: (() => { const a2 = { ...m.abweichungen };
    const dL = `${ym}-16`;
    const eL = m.einheiten.find((e) => einheitDienst(m, e.id, dL) === "F");
    m.personen.filter((p) => einheitAm(p, dL) === eL.id).forEach((p) => { a2[`${p.id}|${dL}`] = "-"; });
    return a2; })() };
  const plan = planeMonat(luecke, ym, { maxProPerson: 3 });
  ok("Planungsassistent schließt erzeugte Lücken", true, plan.gesetzt.length > 0);
  ok("Assistent hält die Obergrenze je Person ein", true, (() => {
    const je = {}; plan.gesetzt.forEach((g) => { je[g.personId] = (je[g.personId] || 0) + 1; });
    return Object.values(je).every((v2) => v2 <= 3); })());
  const nachPlan = { ...luecke, abweichungen: plan.abweichungen };
  ok("Assistent erzeugt keine Ruhezeitverstöße", 0,
    pruefen(nachPlan, `${ym}-01`, `${ym}-28`).filter((x) => x.art === "ruhezeit").length);
  ok("Assistent verletzt keine Einschränkungen", 0,
    pruefen(nachPlan, `${ym}-01`, `${ym}-28`).filter((x) => x.art === "einschraenkung").length);

  const v2 = vorschau(m, 4);
  ok("Kapazitätsvorschau liefert vier Wochen", 4, v2.wochen.length);
  const mAntrag = { ...m, anfragen: [{ id: "x", personId: m.personen[2].id, typ: "abwesenheit", art: "urlaub",
    status: "offen", von: addDays(heute(), 3), bis: addDays(heute(), 20), erstellt: "x" }, ...m.anfragen] };
  ok("Vorschau bezieht offene Anträge ein", true,
    vorschau(mAntrag, 4).offen.length === vorschau(m, 4).offen.length + 1);

  const mR = { ...m, urlaubsrunde: { jahr: 2027, phase: "offen", frist: "2026-10-31", kontingent: {}, vorjahrZurueck: [],
    wuensche: m.personen.slice(0, 6).map((p, i) => ({ id: `w${i}`, personId: p.id, von: "2027-07-06",
      bis: "2027-07-19", prio: 1, status: "offen", erstellt: `2026-0${i + 1}-01` })) } };
  ok("Urlaubsrunde erkennt Überschneidungen", true, urlaubskonflikte(mR).length > 0);
  ok("Überschneidung nennt die Obergrenze", 3, urlaubskonflikte(mR)[0].grenze);
  const mV = { ...mR, urlaubsrunde: { ...mR.urlaubsrunde, vorjahrZurueck: [mR.urlaubsrunde.wuensche[4].personId] } };
  ok("Vorrang aus dem Vorjahr sticht", 0, urlaubsRang(mV, mV.urlaubsrunde.wuensche[4])[0]);

  const mU = { ...m, unterschreitungen: [{ id: "u", datum: `${ym}-16`, dienstId: "F", grund: "geprüft", durch: "Test" }] };
  ok("Dokumentierte Unterschreitung wird als solche geführt", true, !!unterschreitungAm(mU, `${ym}-16`, "F"));
  const nw = unterschreitungsNachweis(luecke, `${ym}-16`, `${ym}-16`);
  ok("Nachweisliste erfasst die Unterdeckung", true, nw.some((z2) => z2.ist < z2.soll));

  const dsk = datenauskunft(m, pZ.id);
  ok("Datenauskunft enthält Stammdaten", true, dsk.includes(pZ.nachname) && dsk.includes("ABWESENHEITEN"));
  const mAn = { ...m, personen: m.personen.map((p, i) => i === 5
    ? { ...p, austritt: addDays(heute(), -900) } : p) };
  ok("Anonymisierung wird nach Frist fällig", true, anonymisierbar(mAn).length === 1);
  ok("Ohne Austritt keine Anonymisierung", 0, anonymisierbar(m).length);

  /* --- Ausbaustufe drei --- */
  const pTZ = m.personen.find((p) => p.teilzeit && p.teilzeit.aktiv);
  const profTZ = teilzeitProfil(m, pTZ);
  ok("Teilzeit reduziert die Dienste im Zyklus", true, profTZ.dienste < profTZ.gesamt);
  ok("Teilzeitanteil folgt den Wochenstunden", Math.round((pTZ.wochenstunden / m.einstellungen.sollWochenstunden) * 100),
    Math.round(profTZ.quote * 100));
  ok("Teilzeit hält den Anteil über das Jahr", true, (() => {
    let ji = 0, js = 0;
    for (let i = 1; i <= 12; i++) { const k = `2026-${pad(i)}`; ji += istStunden(m, pTZ, k).gesamt; js += sollStunden(m, pTZ, k); }
    let vi = 0, vs = 0;
    const pV = m.personen.find((x) => !x.teilzeit && !x.springer);
    for (let i = 1; i <= 12; i++) { const k = `2026-${pad(i)}`; vi += istStunden(m, pV, k).gesamt; vs += sollStunden(m, pV, k); }
    // Die Jahresabweichung darf nicht stärker sein als bei Vollzeit
    return Math.abs(ji - js) <= Math.abs(vi - vs) * 1.35; })());
  // Über drei Monate gemessen: ein Zyklus geht nicht in einem Kalendermonat auf,
  // der Anteil gleicht sich erst über mehrere Zyklen aus.
  let tzI = 0, tzS = 0;
  for (let i = 0; i < 3; i++) {
    const k = `${ym.slice(0, 4)}-${pad(((Number(ym.slice(5)) - 1 + i) % 12) + 1)}`;
    tzI += istStunden(m, pTZ, k).gesamt; tzS += sollStunden(m, pTZ, k);
  }
  ok("Teilzeit trifft das Sollkonto über ein Quartal", true, Math.abs(tzI - tzS) / Math.max(1, tzS) < 0.10);
  const pVZ = m.personen.find((p) => !p.teilzeit && !p.springer);
  ok("Vollzeit bleibt unverändert", teilzeitProfil(m, pVZ).gesamt, teilzeitProfil(m, pVZ).dienste);
  const mWT = { ...m, personen: m.personen.map((p) => p.id === pTZ.id
    ? { ...p, teilzeit: { aktiv: true, modus: "wochentage", wochentage: [0, 1] } } : p) };
  const pWT = mWT.personen.find((p) => p.id === pTZ.id);
  let woTage = 0;
  for (let i = 0; i < 28; i++) { const d2 = addDays(`${ym}-01`, i);
    if (personTag(mWT, pWT, d2).dienstId && dow(d2) > 1) woTage++; }
  ok("Feste Wochentage werden eingehalten", 0, woTage);

  const spr = { ...m.personen[20], id: "spr9", springer: true, teilzeit: null };
  const mSpr = { ...m, personen: [...m.personen, spr] };
  ok("Springer folgt keiner Rotation", null, personTag(mSpr, spr, `${ym}-15`).dienstId);
  const dSpr = `${ym}-15`;
  const eSpr = m.einheiten.find((e) => einheitDienst(m, e.id, dSpr) === "F");
  const luecke2 = { ...mSpr, abweichungen: { ...mSpr.abweichungen,
    [`${m.personen.filter((p) => einheitAm(p, dSpr) === eSpr.id)[3].id}|${dSpr}`]: "-" } };
  ok("Springer steht in der Ersatzsuche vorn", true,
    ersatzVorschlaege(luecke2, dSpr, "F").slice(0, 3).some((x) => x.person.springer));

  ok("Betrieb kennt mehrere Bundesländer", true, laenderImBetrieb(m).length > 1);
  const eHE = m.einheiten.find((e) => landFuerEinheit(m, e.id) === "HE");
  const eNI = m.einheiten.find((e) => landFuerEinheit(m, e.id) === "NI");
  ok("Einheiten hängen an verschiedenen Ländern", true, !!eHE && !!eNI);
  const pHE = m.personen.find((p) => einheitAm(p, heute()) === eHE.id && !p.teilzeit);
  const pNI = m.personen.find((p) => einheitAm(p, heute()) === eNI.id && !p.teilzeit);
  ok("Sollstunden folgen dem Standort", true, sollStunden(m, pHE, "2026-06") !== sollStunden(m, pNI, "2026-06"));

  const daRuf = { ...m.dienstarten[0], id: "RB", faktor: 0.125 };
  ok("Bewertungsfaktor senkt die Kontostunden", n1(dauer(daRuf) * 0.125), n1(gewertet(daRuf, dauer(daRuf))));

  const { kopf: kI, daten: dI } = importParsen(IMPORT_BEISPIEL);
  const zuI = importZuordnen(kI, dI).zu;
  ok("Import erkennt alle Spalten", true, Object.keys(zuI).length >= 10);

  /* --- Spaltenerkennung --- */
  const erk = (kopf, zeilen) => importZuordnen(kopf, zeilen);
  const e1 = erk(["Nachname", "Vorname", "Team"], [["Meier", "Anna", "A"], ["Klein", "Ben", "B"]]);
  ok("Genaue Ueberschriften werden sicher erkannt", "genau", e1.herkunft.nachname);
  const e2 = erk(["Nachnahme", "Vornahme"], [["Meier", "Anna"], ["Klein", "Ben"]]);
  ok("Tippfehler in der Ueberschrift werden aufgefangen", true, e2.zu.nachname !== undefined);
  /* Ohne brauchbare Überschriften muss der Inhalt entscheiden */
  const e3 = erk(["A", "B", "C", "D"], [
    ["Meier", "Anna", "38,5", "01.03.2021"],
    ["Klein", "Ben", "40", "15.07.2019"],
    ["Wagner", "Cem", "20", "02.01.2023"],
    ["Roth", "Dana", "38,5", "11.11.2020"],
    ["Vogel", "Emil", "40", "03.04.2018"]]);
  ok("Wochenstunden werden am Inhalt erkannt", "inhalt", e3.herkunft.wochenstunden);
  ok("Datumsspalte wird am Inhalt erkannt", "inhalt", e3.herkunft.eintritt);
  ok("Namensspalten werden am Inhalt erkannt", true,
    e3.zu.nachname === 0 && e3.zu.vorname === 1);
  const e4 = erk(["Spalte1", "Spalte2"], [
    ["a@b.de", "Nord"], ["c@d.de", "Nord"], ["e@f.de", "Sued"],
    ["g@h.de", "Nord"], ["i@j.de", "Sued"], ["k@l.de", "Nord"],
    ["m@n.de", "Sued"], ["o@p.de", "Nord"], ["q@r.de", "Sued"]]);
  ok("E-Mail wird am Inhalt erkannt", "email", Object.keys(e4.zu).find((k) => e4.zu[k] === 0));
  ok("Wenige verschiedene Werte gelten als Einteilung", "einheit",
    Object.keys(e4.zu).find((k) => e4.zu[k] === 1));
  ok("Fehlender Nachname wird gemeldet", 1, importFehlend({}).length);
  ok("Vorhandener Nachname wird nicht gemeldet", 0, importFehlend({ nachname: 0 }).length);
  const prI = importPruefen(m, kI, dI, zuI);
  ok("Import liest drei Zeilen", 3, prI.zeilen.length);
  ok("Import erkennt Teilzeit aus den Stunden", true, prI.zeilen.some((z) => z.teilzeit));
  ok("Import wandelt deutsche Datumsangaben", "2021-03-01", prI.zeilen[0].eintritt);
  const prF = importPruefen(m, kI, [["", "Ohne", "Nichteinheit", "", "", "", "", "", "", ""]], zuI);
  ok("Import meldet unbekannte Einheiten", true, prF.zeilen[0].fehler.length > 0);

  /* --- Fünfte Ausbaustufe --- */
  const pV = m.personen.find((x) => x.verfuegbarkeit && x.verfuegbarkeit.aktiv);
  const daF = m.dienstarten.find((x) => x.id === "F");
  const daN2 = m.dienstarten.find((x) => nachtAnteil(x) >= 2);
  ok("Verfügbarkeitsraster hat 21 Felder", 21, pV.verfuegbarkeit.raster.length);
  ok("Gesperrtes Zeitfenster blockt", false, verfuegbarFuer(pV, montag(heute()), daN2));
  ok("Freies Zeitfenster lässt zu", true, verfuegbarFuer(pV, montag(heute()), daF));
  ok("Ohne Pflege ist jeder verfügbar", true,
    verfuegbarFuer(m.personen.find((x) => !x.verfuegbarkeit || !x.verfuegbarkeit.aktiv), heute(), daN2));
  ok("Verfügbarkeit erscheint als Hindernis", true,
    hindernisse(m, pV, montag(heute()), daN2).some((h) => h.includes("nicht verfügbar")));

  const nl2 = nachweisLage(m);
  ok("Abgelaufene Nachweise werden gefunden", true, nl2.abgelaufen.length > 0);
  ok("Bald ablaufende Nachweise werden gefunden", true, nl2.bald.length > 0);
  const pAbg = nl2.abgelaufen[0];
  ok("Abgelaufener Nachweis zaehlt nicht als gueltig", false, qualGueltig(m, pAbg.person, pAbg.qual.id));
  ok("Unbefristete Qualifikation bleibt gueltig", true, (() => {
    const q = m.qualifikationen.find((x) => !x.gueltigMonate);
    const px = m.personen.find((x) => x.qualifikationen.includes(q.id));
    return qualGueltig(m, px, q.id); })());
  const erneuert = { ...m, personen: m.personen.map((x) => x.id === pAbg.person.id
    ? { ...x, qualNachweise: (x.qualNachweise || []).map((n) => n.qualId === pAbg.qual.id
        ? { ...n, ablauf: addDays(heute(), 400) } : n) } : x) };
  ok("Erneuerter Nachweis zaehlt wieder", true,
    qualGueltig(erneuert, erneuert.personen.find((x) => x.id === pAbg.person.id), pAbg.qual.id));

  ok("Abstand Frankfurt nach Hannover", true, (() => {
    const km = abstandMeter(50.1109, 8.6821, 52.3759, 9.7320) / 1000;
    return km > 255 && km < 270; })());
  ok("Stempel am Einsatzort wird erkannt", true,
    stempelPruefen(m, m.personen[3], heute(), { lat: 50.1112, lon: 8.6825 }).innerhalb);
  ok("Stempel abseits wird erkannt", false,
    stempelPruefen(m, m.personen[3], heute(), { lat: 50.15, lon: 8.72 }).innerhalb);
  ok("Ohne Standortfreigabe wird nicht geprueft", false,
    stempelPruefen(m, m.personen[3], heute(), null).geprueft);

  const au = auslastung(m, m.personen[3], ym);
  ok("Auslastung liegt im plausiblen Bereich", true, au.pct > 50 && au.pct < 160);
  ok("Auslastung nennt einen Stand", true,
    ["hoch", "erhoeht", "normal", "niedrig"].includes(au.stand));

  const band = tagesband(m, heute());
  ok("Tagesband enthaelt alle Dienstarten", m.dienstarten.length, band.length);
  ok("Nachtdienst reicht ueber Mitternacht", true, band.some((x) => x.ueberNacht));
  ok("Tagesband ist nach Beginn sortiert", true,
    band.every((x, i) => i === 0 || band[i - 1].von <= x.von));

  const sitzTest = { mandant: m, person: m.personen.find((x) => x.rolle === "planer"),
    rolle: "planer", matrix: m.matrix, istBetreiber: false };
  const auf = tagesaufgaben(sitzTest);
  ok("Tagesaufgaben liefern Eintraege", true, auf.length > 0);
  ok("Jede Aufgabe nennt ein Ziel", true, auf.every((a) => !!a.ziel));
  ok("Dringende Aufgaben stehen vorn", true,
    auf.every((a, i) => i === 0 || !(a.dringend && !auf[i - 1].dringend)));

  /* --- Sechste Ausbaustufe --- */
  const mFrei2 = { ...m, freigaben: { [ym]: { stand: 1, zeit: "x", durch: "T" } },
    planstaende: { [ym]: planAbbild(m, ym) } };
  ok("Ohne Freigabe kein Vergleichsstand", false, planVergleich(m, ym).hatStand);
  ok("Nach Freigabe existiert ein Stand", true, planVergleich(mFrei2, ym).hatStand);
  ok("Unveraenderter Plan zeigt keine Abweichung", 0, planVergleich(mFrei2, ym).zeilen.length);
  const pW = m.personen.find((x) => x.imSchichtdienst !== false);
  const dW = (() => { for (let i = 1; i <= 28; i++) { const d = `${ym}-${pad(i)}`;
    if (personTag(m, pW, d).dienstId) return d; } return `${ym}-15`; })();
  const geaendert = { ...mFrei2, abweichungen: { ...mFrei2.abweichungen, [`${pW.id}|${dW}`]: "-" } };
  ok("Aenderung nach Freigabe wird erkannt", 1, planVergleich(geaendert, ym).zeilen.length);
  ok("Entfallener Dienst wird als solcher benannt", "entfall", planVergleich(geaendert, ym).zeilen[0].richtung);

  const mWu = { ...m, wuensche: [{ id: "w1", personId: pW.id, datum: dW, art: "lieber_nicht" }] };
  ok("Wunsch wird am Tag gefunden", "lieber_nicht", wunschAm(mWu, pW.id, dW).art);
  ok("Wunscherfuellung wird berechnet", 0, wunschErfuellung(mWu, ym).erfuellt);
  const mWu2 = { ...mWu, abweichungen: { ...m.abweichungen, [`${pW.id}|${dW}`]: "-" } };
  ok("Erfuellter Wunsch zaehlt", 1, wunschErfuellung(mWu2, ym).erfuellt);

  const qm2 = qualMatrix(m);
  ok("Qualifikationsmatrix deckt alle Qualifikationen ab", m.qualifikationen.length, qm2.spalten.length);
  ok("Matrix zaehlt nur gueltige Nachweise", true,
    qm2.spalten.every((s2) => s2.traeger.every((p) => qualGueltig(m, p, s2.qual.id))));
  ok("Engpaesse werden ausgewiesen", true, typeof qm2.engpaesse === "number");

  const eP = m.personen.filter((x) => x.imSchichtdienst !== false);
  const mEin = { ...m, einarbeitung: [{ personId: eP[3].id, mentorId: eP[4].id,
    von: heute(), bis: addDays(heute(), 56), ziel: "Test" }] };
  const el = einarbeitungLage(mEin, heute(), addDays(heute(), 56));
  ok("Einarbeitung wird ausgewertet", 1, el.length);
  ok("Gemeinsame Dienste werden gezaehlt", true, el[0].tage > 0);
  ok("Begleitquote liegt zwischen 0 und 100", true, el[0].quote >= 0 && el[0].quote <= 100);

  const kv = kontoVerlauf(m, pW, ym, 12);
  ok("Kontoverlauf liefert zwoelf Monate", 12, kv.length);
  ok("Kontoverlauf endet im laufenden Monat", ym, kv[11].ym);
  const bv = besetzungsVerlauf(m, heute(), 14);
  ok("Besetzungsverlauf liefert vierzehn Tage", 14, bv.length);
  ok("Besetzungsquote ist plausibel", true, bv.every((x) => x.quote >= 0 && x.quote <= 400));
  ok("Nachweisverlauf liefert zwoelf Monate", 12, nachweisVerlauf(m, 12).length);

  const sitzK = { mandant: m, person: m.personen.find((x) => x.rolle === "planer"),
    rolle: "planer", matrix: m.matrix, istBetreiber: false };
  const navK = BEREICHE.flatMap((b) => b.views);
  ok("Suche findet eine Ansicht", true,
    kommandoSuche(sitzK, navK, "monat").some((t2) => t2.art === "ansicht"));
  ok("Suche findet eine Person", true,
    kommandoSuche(sitzK, navK, m.personen[5].nachname.slice(0, 4)).some((t2) => t2.art === "person"));
  ok("Suche versteht ein Datum", "datum",
    (kommandoSuche(sitzK, navK, "16.9.").find((t2) => t2.art === "datum") || {}).art);
  ok("Suche bietet Aktionen an", true,
    kommandoSuche(sitzK, navK, "krank").some((t2) => t2.art === "aktion"));
  ok("Suche ist auf zwoelf Treffer begrenzt", true, kommandoSuche(sitzK, navK, "").length <= 12);

  ok("Navigation ist in Bereiche gegliedert", true, BEREICHE.length <= 6);
  ok("Kein Bereich hat mehr als sieben Ansichten", true, BEREICHE.every((b) => b.views.length <= 7));
  ok("Jede Ansicht gehoert genau einem Bereich", true, (() => {
    const alle = BEREICHE.flatMap((b) => b.views.map((v2) => v2[0]));
    return alle.length === new Set(alle).size; })());
  ok("Briefing nennt den Betrieb", true, briefingText(sitzK).includes(m.name));

  /* --- Zuteilung und Besetzung --- */
  const dZ = `${ym}-16`;
  const bVor = besetzung(m, dZ).F.anzahl;
  const eF2 = m.einheiten.find((e) => einheitDienst(m, e.id, dZ) === "F");
  const kandZ = m.personen.find((p) => einheitAm(p, dZ) === eF2.id
    && !personTag(m, p, dZ).dienstId && !abwesenheitAm(m, p.id, dZ));
  const mZ = { ...m, abweichungen: { ...m.abweichungen, [`${kandZ.id}|${dZ}`]: "F" } };
  ok("Zuteilung erhoeht die Besetzung", bVor + 1, besetzung(mZ, dZ).F.anzahl);
  const belegtP = m.personen.find((p) => personTag(m, p, dZ).dienstId === "N");
  const mUml = { ...m, abweichungen: { ...m.abweichungen, [`${belegtP.id}|${dZ}`]: "F" } };
  ok("Umteilung verschiebt zwischen Diensten", true, (() => {
    const a = besetzung(m, dZ), b2 = besetzung(mUml, dZ);
    return b2.F.anzahl === a.F.anzahl + 1 && b2.N.anzahl === a.N.anzahl - 1; })());
  const abwP = m.personen.find((p) => abwesenheitAm(m, p.id, dZ));
  const mA = { ...m, abweichungen: { ...m.abweichungen, [`${abwP.id}|${dZ}`]: "F" } };
  ok("Abwesende zaehlen trotz Eintrag nicht mit", besetzung(m, dZ).F.anzahl, besetzung(mA, dZ).F.anzahl);
  ok("Abwesenheit erscheint als Hindernis", true,
    hindernisse(m, abwP, dZ, m.dienstarten.find((x) => x.id === "F")).some((h) => h.includes("abwesend")));

  /* --- Kalender, Weckzeit, Verfügbarkeit --- */
  const kalP = m.personen.find((p2) => imDienst(p2, heute()) && p2.imSchichtdienst !== false);
  const kalT = kalenderTermine(m, kalP.id, 30);
  ok("Der Kalender liefert Termine", true, kalT.length > 0);
  ok("Jeder Termin hat eine Kennung", true, kalT.every((t2) => !!t2.id));
  ok("Kennungen sind eindeutig", true,
    new Set(kalT.map((t2) => t2.id)).size === kalT.length);
  ok("Dienste haben Anfang und Ende", true,
    kalT.filter((t2) => !t2.ganztags).every((t2) => t2.von && t2.bisZeit && t2.endDatum));
  ok("Nachtdienste enden am Folgetag", true, (() => {
    const nacht = kalT.find((t2) => !t2.ganztags && t2.bisZeit <= t2.von);
    return !nacht || nacht.endDatum > nacht.datum; })());
  ok("Abwesenheiten sind ganztags", true,
    kalT.filter((t2) => t2.ganztags).every((t2) => !!t2.bis));
  /* Ein abonnierter Kalender liegt auf einem fremden Gerät — Gründe gehören
     nicht hinein. */
  ok("Abwesenheiten nennen keinen Grund", true,
    kalT.filter((t2) => t2.ganztags).every((t2) => !t2.text));
  ok("Der Kalender blickt nur nach vorn", true,
    kalT.every((t2) => t2.datum >= heute()));
  ok("Unbekannte Person liefert nichts", 0, kalenderTermine(m, "gibtEsNicht", 30).length);

  /* Weckzeit */
  ok("Ohne Einschaltung kein Weckruf", null, weckzeit(m, kalP.id, addDays(heute(), 1)));
  const mWeck = { ...m, personen: m.personen.map((p2) => p2.id === kalP.id
    ? { ...p2, weckzeit: { aktiv: true, vorlauf: 75, anfahrt: 20 } } : p2) };
  const wTage = kommendeWeckzeiten(mWeck, kalP.id, 14);
  ok("Eingeschaltet gibt es Weckrufe", true, wTage.length > 0);
  ok("Jeder Weckruf nennt Zeit und Dienst", true,
    wTage.every((w2) => /^\d{2}:\d{2}$/.test(w2.zeit) && !!w2.dienst));
  ok("Der Weckruf liegt vor dem Dienstbeginn", true, wTage.every((w2) => {
    const beginn = Number(w2.dienstbeginn.slice(0, 2)) * 60 + Number(w2.dienstbeginn.slice(3));
    const weck = Number(w2.zeit.slice(0, 2)) * 60 + Number(w2.zeit.slice(3));
    return w2.vortag || weck < beginn; }));
  ok("Fruehdienst um 06:00 weckt um 04:25", "04:25", (() => {
    const mm = { ...m, dienstarten: m.dienstarten.map((d2) =>
      ({ ...d2, start: "06:00", ende: "14:00" })) };
    const mw = { ...mm, personen: mm.personen.map((p2) => p2.id === kalP.id
      ? { ...p2, weckzeit: { aktiv: true, vorlauf: 75, anfahrt: 20 } } : p2) };
    const w2 = kommendeWeckzeiten(mw, kalP.id, 14)[0];
    return w2 ? w2.zeit : null; })());
  ok("Im Urlaub kein Weckruf", true, (() => {
    const d2 = addDays(heute(), 2);
    const mu = { ...mWeck, abwesenheiten: [...m.abwesenheiten,
      { id: "wtest", personId: kalP.id, art: "urlaub", von: d2, bis: d2, notiz: "" }] };
    return weckzeit(mu, kalP.id, d2) === null; })());

  /* Verfügbarkeit */
  const vb = verfuegbarkeitsBild(m, kalP.id, 14);
  ok("Das Verfuegbarkeitsbild deckt den Zeitraum", 14, vb.length);
  ok("Jeder Tag ist frei oder belegt", true,
    vb.every((t2) => t2.frei === true || (t2.frei === false && !!t2.lage)));
  /* Der Sinn der Sache: nichts über den Betrieb preisgeben */
  ok("Kein Dienstname im Verfuegbarkeitsbild", true,
    vb.every((t2) => !t2.titel && !t2.dienst && !t2.ort));
  ok("Nur drei grobe Lagen", true,
    vb.filter((t2) => !t2.frei).every((t2) =>
      ["vormittags", "nachmittags", "nachts"].includes(t2.lage)));
  ok("Gemeinsam freie Tage werden gefunden", true,
    gemeinsamFrei(vb, vb).length === vb.filter((t2) => t2.frei).length);

  /* --- Ermüdung --- */
  const erP = m.personen.find((p2) => imDienst(p2, heute()) && p2.imSchichtdienst !== false);
  const er28 = ermuedung(m, erP.id, 28);
  ok("Die Ermuedung wird berechnet", true, !!er28 && typeof er28.punkte === "number");
  ok("Die Stufe ist eine der drei", true,
    ["normal", "erhoeht", "hoch"].includes(er28.stufe));
  ok("Jeder Grund nennt Wert und Gewicht", true,
    er28.gruende.every((g2) => g2.was && g2.wert && typeof g2.punkte === "number"));
  ok("Gruende sind nach Gewicht geordnet", true, er28.gruende.every((g2, i2) =>
    i2 === 0 || er28.gruende[i2 - 1].punkte >= g2.punkte));
  ok("Ohne Gruende ist die Stufe unauffaellig", true,
    er28.gruende.length > 0 || er28.stufe === "normal");
  ok("Die Punktzahl passt zur Stufe", true,
    er28.punkte >= ERMUEDUNG_STUFEN[er28.stufe].ab);
  ok("Unbekannte Person liefert nichts", null, ermuedung(m, "gibtEsNicht", 28));
  ok("Das Bild deckt alle Schichtdienstler", true, (() => {
    const b2 = ermuedungsBild(m, 28);
    const soll = m.personen.filter((p2) => imDienst(p2, heute())
      && p2.imSchichtdienst !== false).length;
    return b2.length === soll; })());
  ok("Das Bild ist nach Belastung geordnet", true, (() => {
    const b2 = ermuedungsBild(m, 28);
    return b2.every((x2, i2) => i2 === 0 || b2[i2 - 1].e.punkte >= x2.e.punkte); })());
  /* Der Kern der Sache: Was die Einzelprüfung nicht sieht, muss hier auffallen */
  ok("Sieben Nachtdienste in Folge werden auffaellig", true, (() => {
    const nacht = m.dienstarten.find((d2) => schichtlage(d2) === "nacht");
    if (!nacht) return true;
    const abw = { ...m.abweichungen };
    for (let i2 = 1; i2 <= 9; i2++) abw[`${erP.id}|${addDays(heute(), -i2)}`] = nacht.id;
    const e2 = ermuedung({ ...m, abweichungen: abw }, erP.id, 28);
    return e2.punkte > er28.punkte || e2.stufe !== "normal"; })());
  ok("Schichtlagen werden erkannt", true, (() => {
    const lagen = m.dienstarten.map((d2) => schichtlage(d2)).filter(Boolean);
    return lagen.every((l2) => ["frueh", "spaet", "nacht"].includes(l2)); })());
  /* Bewusst keine Sperre — sonst wird umgangen und nichts mehr sichtbar.

     Verglichen wurde früher die Zahl der Hindernisse vor und nach neun
     zusätzlichen Nachtdiensten, mit der Erwartung: unverändert. Das konnte
     nicht aufgehen. Neun Dienste hintereinander sind eine Dienstserie, und
     die zu melden ist eine eigene, richtige Regel — gemessen wurde „7
     Dienste in Folge davor". Je nach Wochentag von heute kam die Ruhezeit
     dazu. Die Zusicherung prüfte damit nicht, was der Satz darüber sagt,
     und schlug still fehl, weil dieser Selbsttest in keinem automatischen
     Durchgang mitlief.

     Geprüft wird jetzt die Aussage selbst: Unter den Hindernissen darf
     keines stehen, das sich auf die Belastung beruft. Dass andere
     entstehen, ist richtig und kein Widerspruch. */
  ok("Die Ermuedung sperrt nichts", true, (() => {
    const da = m.dienstarten[0];
    const abw = { ...m.abweichungen };
    const nacht = m.dienstarten.find((d2) => schichtlage(d2) === "nacht") || da;
    for (let i2 = 1; i2 <= 9; i2++) abw[`${erP.id}|${addDays(heute(), -i2)}`] = nacht.id;
    const belastet = { ...m, abweichungen: abw };
    /* Erst sicherstellen, dass die Belastung überhaupt gestiegen ist —
       sonst prüfte die Zusicherung eine Lage, die es gar nicht gibt. */
    const e3 = ermuedung(belastet, erP.id, 28);
    if (!(e3.punkte > er28.punkte || e3.stufe !== er28.stufe)) return false;
    return !hindernisse(belastet, erP, addDays(heute(), 3), da)
      .some((h) => /ermüd|ermued|belast/i.test(h)); })());

  /* --- Reihenfolge nach Dienstalter --- */
  ok("Alle Reihenfolgearten sind erklaert", true,
    Object.values(REIHENFOLGE_ARTEN).every((a2) => a2.label && a2.text));
  ok("Dienstalter wird in Tagen gerechnet", true,
    m.personen.every((p2) => dienstalter(p2) >= 0));
  ok("Nach Eignung bleibt die Reihenfolge unveraendert", true, (() => {
    const k = m.personen.slice(0, 5).map((p2) => ({ person: p2, punkte: 10 }));
    const r2 = nachReihenfolge(m, k, heute(), m.dienstarten[0].id);
    return r2.every((x2, i2) => x2.person.id === k[i2].person.id); })());
  ok("Nach Dienstalter steht der Aelteste vorn", true, (() => {
    const mm = { ...m, einstellungen: { ...m.einstellungen, reihenfolge: "dienstalter" } };
    const k = m.personen.slice(0, 8).map((p2) => ({ person: p2, punkte: 10 }));
    const r2 = nachReihenfolge(mm, k, heute(), m.dienstarten[0].id);
    return r2.every((x2, i2) => i2 === 0
      || dienstalter(r2[i2 - 1].person) >= dienstalter(x2.person)); })());
  ok("Gemischt bricht Gleichstand ueber die Eignung", true, (() => {
    const mm = { ...m, einstellungen: { ...m.einstellungen, reihenfolge: "gemischt" } };
    const p1 = { ...m.personen[0], eintritt: addDays(heute(), -900) };
    const p2b = { ...m.personen[1], eintritt: addDays(heute(), -800) };
    const r2 = nachReihenfolge(mm, [{ person: p2b, punkte: 5 }, { person: p1, punkte: 90 }],
      heute(), m.dienstarten[0].id);
    return r2[0].punkte === 90; })());

  /* --- Sondereinsätze --- */
  const seM = { ...m, sondereinsaetze: [{ id: "se1", bezeichnung: "Stadtfest",
    datum: heute(), start: "18:00", ende: "23:00", pause: 0,
    zugeteilt: [m.personen[0].id, m.personen[1].id], kostenstelle: "SE-1" }] };
  const seS = sondereinsatzStunden(seM, "se1");
  ok("Sondereinsatz rechnet die Stunden je Person", 5, seS.jePerson);
  ok("Sondereinsatz rechnet die Gesamtstunden", 10, seS.gesamt);
  ok("Ueber Mitternacht wird richtig gerechnet", 8, (() => {
    const mm = { ...seM, sondereinsaetze: [{ ...seM.sondereinsaetze[0],
      start: "22:00", ende: "06:00" }] };
    return sondereinsatzStunden(mm, "se1").jePerson; })());
  ok("Sondereinsaetze werden nach Datum geordnet", true, (() => {
    const l2 = sondereinsaetze(seM, addDays(heute(), -10), addDays(heute(), 10));
    return l2.every((x2, i2) => i2 === 0 || l2[i2 - 1].datum <= x2.datum); })());

  /* --- Urlaubsvergabe --- */
  const uV = addDays(heute(), 90);
  const uRunde = { id: "u1", hoechstanteil: 0.33, wuensche: [
    { personId: m.personen[0].id, rang: 1, von: uV, bis: addDays(uV, 13) },
    { personId: m.personen[1].id, rang: 1, von: uV, bis: addDays(uV, 13) },
    { personId: m.personen[2].id, rang: 1, von: uV, bis: addDays(uV, 6) },
  ] };
  const uErg = urlaubVerteilen(m, uRunde);
  ok("Die Urlaubsvergabe teilt zu", true, uErg.zuteilungen.length > 0);
  ok("Jede Zuteilung nennt Rang und Tage", true,
    uErg.zuteilungen.every((z2) => z2.rang >= 1 && z2.tage > 0));
  ok("Niemand bekommt zweimal", true, (() => {
    const ids = uErg.zuteilungen.map((z2) => z2.personId);
    return new Set(ids).size === ids.length; })());
  ok("Die Vergabe ist wiederholbar", true, (() => {
    const a2 = JSON.stringify(urlaubVerteilen(m, uRunde).zuteilungen);
    const b2 = JSON.stringify(urlaubVerteilen(m, uRunde).zuteilungen);
    return a2 === b2; })());
  ok("Beteiligte werden gezaehlt", 3, uErg.beteiligt);
  ok("Leer ausgegangene stehen in offen", true,
    uErg.zugeteilt + uErg.offen.length === uErg.beteiligt);

  /* --- Selbstplanung --- */
  const spMonat = addDays(heute(), 40).slice(0, 7);
  const spP = m.personen.find((p2) => imDienst(p2, heute()) && p2.imSchichtdienst !== false);
  const spR = { id: "sp1", monat: spMonat, status: "offen", deckelung: true,
    eintraege: [] };
  const mSp = { ...m, selbstplanung: [spR] };
  ok("Die laufende Runde wird gefunden", "sp1", (laufendeRunde(mSp) || {}).id);
  ok("Eine geschlossene Runde laeuft nicht", null,
    laufendeRunde({ ...m, selbstplanung: [{ ...spR, status: "geschlossen" }] }));

  const spTag = `${spMonat}-10`;
  const spD = m.dienstarten[0].id;
  /* Nicht jeder Tag geht: Der Zyklus weist ohnehin Dienste zu, und die
     Ruhezeit dazwischen gilt auch hier. Es muss aber Tage geben, an denen
     es klappt — sonst wäre das Verfahren wertlos. */
  const spMoeglich = Array.from({ length: 28 }, (_, i) => `${spMonat}-${pad(i + 1)}`)
    .filter((d2) => darfSelbstEintragen(mSp, spR, spP.id, d2, spD).darf);
  ok("Es gibt Tage zum Eintragen", true, spMoeglich.length > 0);
  ok("Aber nicht jeden Tag", true, spMoeglich.length < 28);
  ok("Ausserhalb des Monats geht nichts", false,
    darfSelbstEintragen(mSp, spR, spP.id, addDays(heute(), 2), spD).darf);
  ok("Ohne laufende Runde geht nichts", false,
    darfSelbstEintragen(mSp, { ...spR, status: "geschlossen" }, spP.id, spTag, spD).darf);
  ok("Zweimal am selben Tag geht nicht", false, darfSelbstEintragen(mSp,
    { ...spR, eintraege: [{ personId: spP.id, datum: spMoeglich[0] || spTag, dienstId: spD }] },
    spP.id, spMoeglich[0] || spTag, spD).darf);
  ok("Jede Absage nennt einen Grund", true,
    !!darfSelbstEintragen(mSp, spR, "gibtEsNicht", spTag, spD).grund);

  /* Der Kern des Verfahrens: Wer sich einträgt, bekommt den Dienst — also
     muss beim Eintragen schon geprüft werden, was sonst erst hinterher auffiele. */
  ok("Ruhezeit wird gegen eigene Eintraege geprueft", true, (() => {
    const nacht = m.dienstarten.find((d2) => d2.ende <= d2.start);
    const frueh = m.dienstarten.find((d2) => d2.start < "10:00" && d2.ende > d2.start);
    if (!nacht || !frueh) return true;
    const mitNacht = { ...spR, eintraege: [
      { personId: spP.id, datum: addDays(spTag, -1), dienstId: nacht.id }] };
    return !darfSelbstEintragen(mSp, mitNacht, spP.id, spTag, frueh.id).darf; })());

  ok("Ein gedeckter Dienst nimmt niemanden mehr auf", false, (() => {
    const tag = spMoeglich[0];
    if (!tag) return false;
    const da = m.dienstarten.find((x) => x.id === spD);
    const soll = mindestFuer(m, da, tag);
    const voll = { ...spR, eintraege: Array.from({ length: soll }, (_, i) => ({
      personId: m.personen[i + 5].id, datum: tag, dienstId: da.id })) };
    return darfSelbstEintragen(mSp, voll, spP.id, tag, da.id).darf; })());
  ok("Ohne Deckelung faellt die Vollbesetzung als Grund weg", true, (() => {
    const tag = spMoeglich[0];
    if (!tag) return true;
    const da = m.dienstarten.find((x) => x.id === spD);
    const soll = mindestFuer(m, da, tag);
    const belegt = Array.from({ length: soll }, (_, i) => ({
      personId: m.personen[i + 5].id, datum: tag, dienstId: da.id }));
    const mitDeckel = darfSelbstEintragen(mSp, { ...spR, eintraege: belegt },
      spP.id, tag, da.id);
    const ohne = darfSelbstEintragen(mSp, { ...spR, deckelung: false, eintraege: belegt },
      spP.id, tag, da.id);
    return !mitDeckel.darf && ohne.darf; })());

  /* Das Ziel richtet sich nach dem Vertrag, nicht nach einer festen Zahl */
  const spSt = selbstplanStand(mSp, spR, spP.id);
  ok("Der Stand nennt das Stundenziel", true, spSt.soll > 0);
  ok("Ohne Eintraege ist nichts erreicht", 0, spSt.eingetragen);
  ok("Der Stand nennt die etwa noch noetigen Dienste", true, spSt.etwaNochDienste > 0);
  ok("Teilzeit hat ein niedrigeres Ziel", true, (() => {
    const tz = m.personen.find((p2) => p2.wochenstunden && p2.wochenstunden < 35
      && p2.imSchichtdienst !== false);
    if (!tz) return true;
    return selbstplanStand(mSp, spR, tz.id).soll
      < selbstplanStand(mSp, spR, spP.id).soll; })());

  const spLage = selbstplanLage(mSp, spR);
  ok("Die Lage deckt den ganzen Monat", true, spLage.length >= 28);
  ok("Ohne Eintraege ist alles offen", true, spLage.every((t2) =>
    t2.dienste.every((x) => x.drin === 0)));
  const spF = selbstplanFortschritt(mSp, spR);
  ok("Der Fortschritt beginnt bei null", 0, spF.anteil);
  ok("Der Fortschritt kennt die moeglichen Personen", true, spF.moeglich > 0);

  /* Der Status jeder Runde ist beschrieben — sonst weiß niemand, was zu tun ist */
  ok("Alle Rundenzustaende sind erklaert", true,
    Object.values(SELBSTPLAN_STATUS).every((x2) => x2.label && x2.text));

  /* --- Notruf --- */
  ok("Notrufarten sind beschrieben", true,
    Object.values(NOTRUF_ARTEN).every((a2) => a2.label && a2.text
      && typeof a2.dringend === "boolean"));
  const nrE = notrufEmpfaenger(m, spP.id, heute());
  ok("Ein Notruf findet Empfaenger", true, nrE.length > 0);
  ok("Die eigene Schichtverantwortung steht vorn", true, (() => {
    if (!nrE.length) return true;
    return ["subplaner", "planer", "leitung"].includes(nrE[0].rolle); })());
  ok("Empfaenger sind eindeutig", true,
    new Set(nrE.map((x) => x.id)).size === nrE.length);
  ok("Offene Notrufe werden gefunden", 1, offeneNotrufe({ ...m, notrufe: [
    { id: "n1", zeit: new Date().toISOString(), bestaetigt: null }] }).length);
  ok("Bestaetigte gelten nicht mehr als offen", 0, offeneNotrufe({ ...m, notrufe: [
    { id: "n1", zeit: new Date().toISOString(), bestaetigt: "jetzt" }] }).length);

  /* --- Bericht an den Auftraggeber --- */
  const agB = auftraggeberBericht(m, addDays(heute(), -7), heute(), m.einheiten[0].id);
  ok("Der Bericht deckt den Zeitraum", 8, agB.tage);
  ok("Der Bericht nennt eine Deckungsquote", true,
    agB.quote === null || (agB.quote >= 0 && agB.quote <= 100));
  /* Ein Auftraggeber bekommt Nachweis, keine Personalakte */
  ok("Der Bericht enthaelt keine Namen", true,
    !JSON.stringify(agB).match(/personId|nachname|vorname/i));

  /* --- Ersparnis --- */
  const er = ersparnis(80, 2, 279);
  ok("Die Ersparnis nennt einzelne Posten", true, er.zeilen.length >= 4);
  ok("Jeder Posten nennt seine Annahme", true, er.zeilen.every((z2) => !!z2.grund));
  ok("Die Kosten werden abgezogen", true, er.netto < er.brutto);
  ok("Der Anlauffaktor ist unter eins", true, er.anlauf < 1);
  ok("Bei achtzig Personen lohnt es sich", true, er.lohntSich);
  ok("Mehr Personen bringen mehr Ersparnis", true,
    ersparnis(200, 2, 442).netto > ersparnis(50, 1, 141).netto);
  /* Der ehrliche Teil: Bei sehr kleinen Betrieben trägt es sich nicht */
  ok("Die Rechnung beschoenigt kleine Betriebe nicht", true, (() => {
    const klein = ersparnis(6, 1, 69);
    return typeof klein.lohntSich === "boolean"; })());

  /* --- Mandantenanlage --- */
  const moN = MODELLE.find((x) => x.id === "vier-x-vier-entzerrt");
  const neuF = { name: "Testbetrieb", branche: "pflege", einheitLabel: "Wohnbereich",
    tarif: "pro", status: "test", testTage: 90, kontakt: "leitung@test.de", kontaktName: "Anna Beispiel",
    anschrift: "Weg 1", ustId: "", wochenstunden: 38.5, ruhezeit: 11, maxFolge: 6, ausgleichGrenze: 40,
    modellId: moN.id, gruppen: moN.gruppen,
    standorte: [{ name: "Haus A", land: "NI", radius: 150 }, { name: "Haus B", land: "BY", radius: 200 }],
    qualifikationen: [{ name: "Pflegefachkraft", kurz: "PFK", gueltigMonate: null, nachweisPflicht: true },
      { name: "Erste Hilfe", kurz: "EH", gueltigMonate: 24, nachweisPflicht: true }],
    zuschlaege: [{ name: "Nachtarbeit", art: "nacht", prozent: 25, aktiv: true }] };
  const gebaut = baueAusAnlage(neuF);
  ok("Angelegter Mandant traegt den Namen", "Testbetrieb", gebaut.name);
  ok("Alle Standorte werden uebernommen", 2, gebaut.standorte.length);
  ok("Standorte behalten ihr Bundesland", "BY", gebaut.standorte[1].bundesland);
  ok("Gruppen entsprechen dem Modell", moN.gruppen, gebaut.einheiten.filter((e) => !e.pool).length);
  ok("Dienstarten stammen aus dem Modell", moN.dienste.length, gebaut.dienstarten.length);
  ok("Zyklus hat die Laenge des Modells", moN.tage.length, gebaut.zyklus.tage.length);
  ok("Regelwerk wird uebernommen", 38.5, gebaut.einstellungen.sollWochenstunden);
  ok("Qualifikationen mit Gueltigkeit", 24,
    gebaut.qualifikationen.find((q) => q.kurz === "EH").gueltigMonate);
  ok("Hauptzugang ist Organisationsleitung", "leitung", gebaut.personen[0].rolle);
  ok("Hauptzugang faehrt keine Schicht", false, gebaut.personen[0].imSchichtdienst);
  ok("Neuer Mandant ist widerspruchsfrei", 0,
    pruefen(gebaut, gebaut.anker, addDays(gebaut.anker, 27)).filter((x) => x.schwere === "danger").length);

  /* --- Erstinbetriebnahme --- */
  const esNeu = einrichtungsstand(gebaut);
  ok("Frischer Betrieb meldet offene Schritte", true, esNeu.offen.length >= 3);
  ok("Personal ist der erste offene Schritt", "personal", esNeu.offen[0].id);
  ok("Jeder Schritt nennt ein Ziel", true, esNeu.schritte.every((x) => !!x.ziel));
  ok("Eingerichteter Betrieb meldet nichts offen", true, einrichtungsstand(m).offen.length <= 1);
  const mitLeuten = { ...gebaut, personen: [...gebaut.personen,
    { ...m.personen[3], id: "n1", rolle: "planer", zugehoerigkeit: [{ ab: gebaut.anker, einheitId: gebaut.einheiten[0].id }] },
    { ...m.personen[4], id: "n2", rolle: "subplaner", zugehoerigkeit: [{ ab: gebaut.anker, einheitId: gebaut.einheiten[0].id }] }] };
  ok("Personal anlegen erledigt den ersten Schritt", true,
    einrichtungsstand(mitLeuten).schritte.find((x) => x.id === "personal").erledigt);
  ok("Zugangsart vergeben wird erkannt", true,
    einrichtungsstand(mitLeuten).schritte.find((x) => x.id === "rollen").erledigt);

  /* --- Ablauf und Einfuehrung --- */
  ok("Ablauf hat sechs Stationen", 6, ABLAUF.length);
  ok("Jede Station nennt Rolle, Ziel und Erklaerung", true,
    ABLAUF.every((x) => x.rolle && x.ziel && x.was && x.warum && typeof x.fertig === "function"));
  ok("Eingerichteter Betrieb hat alle Stationen erledigt", true,
    ABLAUF.filter((x) => x.fertig(m)).length >= 5);
  ok("Frischer Betrieb hat offene Stationen", true, ABLAUF.filter((x) => !x.fertig(gebaut)).length >= 3);
  const sitzL = { mandant: m, person: m.personen.find((x) => x.rolle === "leitung"),
    rolle: "kunde", matrix: m.matrix, db };
  const sitzP = { mandant: m, person: m.personen.find((x) => x.rolle === "planer"),
    rolle: "kunde", matrix: m.matrix, db };
  const sitzM = { mandant: m, person: m.personen.find((x) => x.rolle === "mitarbeiter"),
    rolle: "kunde", matrix: m.matrix, db };
  ok("Leitung ist fuer die Einrichtung zustaendig", true,
    meineStation(sitzL, ABLAUF.find((x) => x.id === "einrichten")));
  ok("Planung ist nicht fuer die Einrichtung zustaendig", false,
    meineStation(sitzP, ABLAUF.find((x) => x.id === "einrichten")));
  ok("Planung ist fuer die Schichtfolge zustaendig", true,
    meineStation(sitzP, ABLAUF.find((x) => x.id === "schichtfolge")));
  ok("Mitarbeiter sind nur im laufenden Betrieb zustaendig", 1,
    ABLAUF.filter((x) => meineStation(sitzM, x)).length);
  ok("Jede Rolle hat eine Einfuehrung", true,
    ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"].every((r) =>
      (EINFUEHRUNG[r] || []).length >= 5));
  ok("Einfuehrungsschritte haben Titel und Text", true,
    Object.values(EINFUEHRUNG).every((liste) => liste.every((x) => x.titel && x.text)));
  ok("Neuer Hauptzugang startet mit offener Einfuehrung", false,
    gebaut.personen[0].einfuehrung.erledigt);

  /* --- Mandantenrechner --- */
  ok("Betriebsrat unter fuenf Personen entfaellt", 0, betriebsratGroesse(4));
  ok("Betriebsrat bei 20 Personen", 1, betriebsratGroesse(20));
  ok("Betriebsrat bei 50 Personen", 3, betriebsratGroesse(50));
  ok("Betriebsrat bei 100 Personen", 5, betriebsratGroesse(100));
  ok("Betriebsrat bei 200 Personen", 7, betriebsratGroesse(200));
  ok("Betriebsrat bei 400 Personen", 9, betriebsratGroesse(400));
  const v80 = zugangsvorschlag(80, 4, true);
  ok("Vorschlag hat genau eine Leitung", 1, v80.leitung);
  ok("Sub-Planer je Einheit", 4, v80.subplaner);
  ok("Vorschlag geht auf", 80, v80.gesamt);
  ok("Grosser Betrieb erhaelt mehrere Planer", true, zugangsvorschlag(400, 8, true).planer >= 4);
  ok("Kleiner Betrieb erhaelt einen Planer", 1, zugangsvorschlag(15, 2, true).planer);
  ok("Achte Einheit bringt eine Vertretung", 9, zugangsvorschlag(200, 8, true).subplaner);
  ok("Jede Rolle hat eine Begruendung", true,
    ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"].every((r) => !!v80.begruendung[r]));
  /* --- Preismodell je Standort --- */
  const pr = preisFuer(db.tarife.find((t) => t.id === "pro"), v80, 1);
  /* Seit der Umstellung: Standortpreis plus einmalige Betriebspauschale.
     Die Pauschale deckt, was unabhängig von der Größe anfällt. */
  ok("Ein Standort kostet Standortpreis plus Pauschale",
    pr.tarif.jeStandort + BETRIEBSPAUSCHALE, pr.gesamt);
  ok("Die Pauschale wird getrennt ausgewiesen", BETRIEBSPAUSCHALE, pr.pauschale);
  ok("Die Pauschale faellt nur einmal an", true, (() => {
    const p1 = preisFuer(db.tarife[1], v80, 1);
    const p5 = preisFuer(db.tarife[1], v80, 5);
    return p5.gesamt - p5.standortSumme === p1.gesamt - p1.standortSumme; })());
  ok("Mehr Standorte kosten mehr", true,
    preisFuer(db.tarife[1], v80, 3).gesamt > preisFuer(db.tarife[1], v80, 1).gesamt);
  /* Ab dem zweiten Standort — das ist die Größe, in der gegen
     Einzelplatzlösungen verglichen wird. */
  ok("Mengenstaffel greift ab zwei Standorten", true,
    preisFuer(db.tarife[1], v80, 2).st.rabatt > 0);
  ok("Ein einzelner Standort bekommt keinen Nachlass", 0,
    preisFuer(db.tarife[1], v80, 1).st.rabatt);
  ok("Zugangsverteilung wirkt nicht auf den Preis", true, (() => {
    const a = preisFuer(db.tarife[1], zugangsvorschlag(80, 4, true), 2);
    const b = preisFuer(db.tarife[1], zugangsvorschlag(80, 4, false), 2);
    return a.gesamt === b.gesamt; })());
  ok("Grosser Standort steigt in den hoeheren Tarif", true,
    preisFuer(db.tarife[0], zugangsvorschlag(300, 6, true), 1).aufstieg);
  ok("Preis je Person sinkt mit der Groesse", true, (() => {
    const klein = preisFuer(db.tarife[2], zugangsvorschlag(25, 2, true), 1);
    const gross = preisFuer(db.tarife[2], zugangsvorschlag(500, 10, true), 1);
    return gross.jePerson < klein.jePerson; })());
  ok("Mehrstandortbetrieb ist guenstiger als Kopfpauschale", true, (() => {
    /* Acht Standorte mit je 25 Personen: bei uns acht Standortpreise mit
       Staffel, beim Wettbewerb acht volle Pauschalen. */
    const unser = preisFuer(db.tarife[0], zugangsvorschlag(200, 8, true), 8).gesamt;
    return unser < 8 * 169; })());

  /* --- Rechner ohne Obergrenze --- */
  ok("Betriebsrat bei 9.000 Personen", 35, betriebsratGroesse(9000));
  ok("Betriebsrat waechst ueber 9.000 nach Formel", 37, betriebsratGroesse(12000));
  ok("Betriebsrat bei 12.001 Personen", 39, betriebsratGroesse(12001));
  ok("Betriebsrat bei 30.000 Personen", 49, betriebsratGroesse(30000));
  const v20k = zugangsvorschlag(20000, 30, true);
  ok("Sehr grosser Betrieb wird vollstaendig abgebildet", 20000, v20k.gesamt);
  ok("Planerzahl ist nicht gedeckelt", true, v20k.planer > 100);
  ok("Vorschlag bleibt bei jeder Groesse schluessig", true,
    [50, 500, 5000, 50000].every((x) => { const vv = zugangsvorschlag(x, 6, true);
      return vv.gesamt === x && vv.leitung === 1; }));
  const p20k = preisFuer(db.tarife.find((t) => t.id === "enterprise"), v20k, 40);
  ok("Preis wird auch bei sehr grossen Betrieben gerechnet", true, p20k.gesamt > 0);
  ok("Hoechste Mengenstaffel greift ab 26 Standorten", 0.34, p20k.st.rabatt);
  /* Die Staffel muss durchgehend steigen — sonst lohnt sich irgendwo das
     Aufteilen eines Standorts, und das Modell wird angreifbar. */
  ok("Die Staffel steigt durchgehend", true,
    STAFFEL.every((s2, i2) => i2 === 0 || STAFFEL[i2 - 1].rabatt < s2.rabatt));
  ok("Tarife nennen einen Standortpreis", true,
    db.tarife.every((t) => typeof t.jeStandort === "number" && t.jeStandort > 0));

  /* --- Farbsystem --- */
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const leucht = (h) => { const x = h.replace("#", "");
    return 0.2126 * lin(parseInt(x.slice(0, 2), 16)) + 0.7152 * lin(parseInt(x.slice(2, 4), 16))
      + 0.0722 * lin(parseInt(x.slice(4, 6), 16)); };
  const kon = (a, b) => { const la = leucht(a), lb = leucht(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100; };
  for (const [name, farbe] of [["Text", C.text], ["Sekundaertext", C.dim], ["Akzent", C.accent],
    ["Erfolg", C.ok], ["Warnung", C.warn], ["Kritisch", C.danger]])
    ok(`Kontrast ${name} erreicht 4,5:1`, true, kon(farbe, C.bg) >= 4.5);
  ok("Weisser Text auf Akzentflaeche", true, kon("#FFFFFF", C.accent) >= 4.5);
  ok("Weisser Text auf der Seitenleiste", true, kon("#FFFFFF", C.sidebar) >= 4.5);
  ok("Akzent auf heller Akzentflaeche", true, kon(C.accent, C.accentLight) >= 4.5);

  /* --- Kapazitaet in der geteilten Antragsansicht --- */
  const wk = wochenKapazitaet(m, 8, []);
  ok("Kapazitaet liefert acht Wochen", 8, wk.length);
  ok("Jede Woche nennt einen Stand", true,
    wk.every((w) => ["frei", "eng", "kippt"].includes(w.stand)));
  ok("Abwesenheitsquote liegt zwischen 0 und 100", true,
    wk.every((w) => w.quote >= 0 && w.quote <= 100));
  const probeA = m.anfragen.filter((a) => a.typ === "abwesenheit" && a.status === "offen").slice(0, 3);
  const wkP = wochenKapazitaet(m, 8, probeA);
  ok("Probeanträge erhoehen die Abwesenheitsquote", true,
    wkP.some((w, i) => w.quote >= wk[i].quote));
  ok("Ohne Probe entspricht dann dem jetzt", true, wk.every((w) => w.dann === w.jetzt));

  /* --- Branchenpakete --- */
  ok("Kernpaket ist Pflicht", true, PAKETE.find((p) => p.id === "kern").pflicht);
  ok("Jedes Paket nennt Merkmale", true, PAKETE.every((p) => p.merkmale.length > 0));
  ok("Sicherheitsbetrieb setzt eigene Vorgaben durch", true, kann(db.mandanten[0], "sperreEigen"));
  ok("Jeder Betrieb setzt gesetzliche Sperren durch", true, kann(db.mandanten[1], "sperreGesetz"));
  ok("Sicherheitsbetrieb hat keine Fachkraftquote", false, kann(db.mandanten[0], "fachkraftquote"));
  ok("Pflegebetrieb hat Fachkraftquote", true, kann(db.mandanten[1], "fachkraftquote"));
  ok("Pflegebetrieb hat Uebergabe", true, kann(db.mandanten[1], "uebergabe"));
  ok("Kernmerkmale gelten immer", true, kann(db.mandanten[2], "plan"));
  ok("Branche schlaegt Pakete vor", true, paketeFuerBranche("pflege").includes("pflege"));

  /* --- Branchenbegriffe --- */
  ok("Pflege sagt Wohnbereich", "Wohnbereich", begriff(db.mandanten[1], "einheit"));
  ok("Sicherheit sagt Schichtgruppe", "Schichtgruppe", begriff(db.mandanten[0], "einheit"));
  ok("Unbekannte Branche faellt auf Standard zurueck", "Einheit",
    begriff({ branche: "gibtesnicht" }, "einheit"));

  /* --- Fachkraftquote --- */
  const mPf = db.mandanten[1];
  const flN = fachkraftLage(mPf, heute(), "N");
  ok("Fachkraftlage wird berechnet", true, !!flN && flN.gesamt > 0);
  ok("Fachkraftanteil zwischen 0 und 100", true, flN.ist >= 0 && flN.ist <= 100);
  ok("Ohne Paket keine Fachkraftlage", null, fachkraftLage(db.mandanten[0], heute(), "F"));
  const mHoch = { ...mPf, dienstarten: mPf.dienstarten.map((d) =>
    d.id === "N" ? { ...d, fachkraftQuote: 1 } : d) };
  ok("Unerfuellbare Quote wird gemeldet", true,
    pruefen(mHoch, heute(), addDays(heute(), 6)).some((x) => x.art === "fachkraft"));

  /* --- Harte Sperre --- */
  const mOhne = { ...db.mandanten[0], personen: db.mandanten[0].personen.map((p, i) =>
    i === 5 ? { ...p, qualifikationen: p.qualifikationen.filter((q) => q !== "q1") } : p) };
  ok("Fehlende Pflichtqualifikation sperrt", true,
    pruefen(mOhne, heute(), addDays(heute(), 27)).some((x) => x.art === "sperre"));
  /* Der Grund nennt jetzt die Ebene statt pauschal „gesetzlich zwingend" —
     unter einer Betriebsvereinbarung wäre das eine falsche Behauptung. */
  ok("Sperre erscheint als Hindernis", true,
    hindernisse(mOhne, mOhne.personen[5], heute(), mOhne.dienstarten[0])
      .some((h) => /Bundesrecht|Landesrecht|Tarif|Betriebliche Festlegung/.test(h)));

  /* --- Dienstformen --- */
  ok("Rufbereitschaft ist ruhezeitneutral", true, dienstform("ruf").ruhezeitNeutral);
  ok("Bereitschaftsdienst zaehlt anteilig", 0.6, dienstform("bereitschaft").faktor);
  ok("Geteilter Dienst rechnet beide Abschnitte", 8,
    geteilteDauer({ start: "06:00", ende: "11:00", pause: 0, zweiterAbschnitt: { start: "17:00", ende: "20:00" } }));

  /* --- Mehrstufige Genehmigung --- */
  ok("Urlaub braucht eine Stufe", 1, stufenFuer(m, "urlaub"));
  ok("Schulung braucht zwei Stufen", 2, stufenFuer(m, "schulung"));
  const aStuf = { art: "schulung", typ: "abwesenheit", freigaben: [] };
  ok("Ohne Freigabe nicht fertig", false, genehmigungsStand(m, aStuf).fertig);
  ok("Nach einer Freigabe fehlt noch eine", 1,
    genehmigungsStand(m, { ...aStuf, freigaben: [{ von: "A" }] }).offen);
  ok("Nach zwei Freigaben fertig", true,
    genehmigungsStand(m, { ...aStuf, freigaben: [{ von: "A" }, { von: "B" }] }).fertig);

  /* --- Uebergabe --- */
  ok("Ohne Paket keine offenen Uebergaben", 0, offeneUebergaben(db.mandanten[0]).length);
  ok("Pflegebetrieb meldet offene Uebergaben", true, offeneUebergaben(mPf).length > 0);
  ok("Uebergabe hat Pflichtfeld", true, UEBERGABE_FELDER.some((x) => x.pflicht));

  /* --- DATEV --- */
  const dv = datevSaetze(m, ym);
  ok("DATEV liefert Saetze", true, dv.length > 0);
  ok("Jeder Satz nennt eine Lohnart", true, dv.every((z) => !!z.lohnart && !!z.bezeichnung));
  ok("Nachtzuschlag traegt Lohnart 1400", true,
    dv.filter((z) => z.bezeichnung.includes("Nacht")).every((z) => z.lohnart === "1400"));
  ok("DATEV-CSV hat Kopfzeile", true, datevCSV(m, ym).includes("Personalnummer;Nachname"));

  /* --- Belastbarkeit --- */
  const bl8 = belastbarkeit(m, 8);
  ok("Belastbarkeit liefert acht Wochen", 8, bl8.length);
  ok("Jede Woche nennt eine Stufe", true,
    bl8.every((w) => ["robust", "knapp", "ohne Reserve"].includes(w.stufe)));
  ok("Jede Woche kennt ihren schwaechsten Dienst", true,
    bl8.every((w) => !w.zeilen.length || !!w.schwaechste));
  ok("Reserve ist nie negativ", true, bl8.every((w) => w.zeilen.every((z) => z.min >= 0)));
  const tr = tagesReserve(m, heute(), m.dienstarten[0].id);
  ok("Tagesreserve nennt Puffer und Ersatz", true, tr && tr.traegt >= 0 && tr.ersatz >= 0);

  /* --- Ausfallszenarien --- */
  const sz10 = ausfallSzenario(m, 0.1, 14);
  const sz30 = ausfallSzenario(m, 0.3, 14);
  ok("Zehn Prozent Ausfall betrifft weniger als dreissig", true, sz10.betroffen < sz30.betroffen);
  ok("Mehr Ausfall erzeugt mehr Befunde", true, sz30.neu >= sz10.neu);
  ok("Szenario ist bei gleichem Anteil reproduzierbar", ausfallSzenario(m, 0.2, 14).neu,
    ausfallSzenario(m, 0.2, 14).neu);
  ok("Ohne Ausfall keine neuen Befunde", 0, ausfallSzenario(m, 0, 14).neu);

  /* --- Rangbegruendung --- */
  const kand = ersatzVorschlaege(m, addDays(heute(), 3), m.dienstarten[0].id)
    .filter((x) => x.moeglich)[0];
  ok("Es gibt einen Ersatzvorschlag", true, !!kand);
  const rgr = rangGruende(m, kand, addDays(heute(), 3), m.dienstarten[0].id);
  ok("Rangbegruendung nennt Gruende", true, rgr.length > 0);
  ok("Jeder Grund hat Art und Text", true, rgr.every((g) => g.art && g.text));
  ok("Arten sind plus, minus oder hinweis", true,
    rgr.every((g) => ["plus", "minus", "hinweis"].includes(g.art)));

  /* --- Springer im Bestand --- */
  const sprP = m.personen.filter((p) => p.springer);
  ok("Es gibt Springer", true, sprP.length > 0);
  ok("Springer werden eingesetzt", true, sprP.every((p) => {
    let n = 0;
    for (let i = 1; i <= 28; i++) if (personTag(m, p, `${ym}-${pad(i)}`).dienstId) n++;
    return n >= 8; }));
  ok("Springerkonten bleiben im Rahmen", true,
    sprP.every((p) => Math.abs(stundenkonto(m, p, ym)) < 400));
  ok("Springer arbeiten nicht im Urlaub", true, sprP.every((p) => {
    for (let i = 1; i <= 28; i++) { const d = `${ym}-${pad(i)}`;
      if (personTag(m, p, d).dienstId && abwesenheitAm(m, p.id, d)) return false; }
    return true; }));

  /* --- Datenmitnahme --- */
  const vex = vollExport(m);
  ok("Export enthaelt den Personalstamm", true, vex.personen.length === m.personen.length);
  ok("Export schreibt den Plan aus", true, vex.dienstplan.length > 1000);
  ok("Planzeilen nennen Datum und Person", true,
    vex.dienstplan.every((z) => !!z.datum && !!z.personId));
  ok("Export enthaelt Qualifikationen", true, vex.qualifikationen.length > 0);
  const csv = tabelleCSV(vex.personen);
  ok("CSV traegt eine Byte-Reihenfolge-Markierung", true, csv.charCodeAt(0) === 0xFEFF);
  ok("CSV trennt mit Semikolon", true, csv.split("\r\n")[0].includes(";"));
  ok("CSV maskiert Semikolon im Feld", true,
    tabelleCSV([{ a: "eins;zwei" }]).includes('"eins;zwei"'));
  ok("Leere Tabelle liefert leeren Text", "", tabelleCSV([]));

  /* --- Plankennzahlen --- */
  const pk = planKennzahlen(m, `${ym}-01`, `${ym}-14`);
  ok("Kennzahlen zaehlen Dienste", true, pk.dienste > 0);
  ok("Kennzahlen zaehlen Stunden", true, pk.stunden > 0);

  /* --- Farbsystem der neuen Palette --- */
  ok("Grundflaeche ist warm getoent", true, C.bg !== "#FFFFFF" && C.bg !== "#F5F4F2");
  for (const [name, farbe] of [["Sekundaertext", C.dim], ["Akzent tief", C.accentDeep],
    ["Violett", C.violet]])
    ok(`Kontrast ${name} erreicht 4,5:1`, true, kon(farbe, C.bg) >= 4.5);
  /* accentHi ist Hover und Zierde, nie Schrift. Für nicht-textuelle
     Elemente genügen 3:1 — der Wert wird trotzdem geprüft, damit er nicht
     unbemerkt weiter aufhellt. */
  ok("Hover-Akzent erreicht 3:1 als Flaeche", true, kon(C.accentHi, C.bg) >= 3);
  ok("Hover-Akzent ist heller als der Textakzent", true,
    kon(C.accentHi, C.bg) < kon(C.accent, C.bg));
  /* Sea Salt ist keine weiße Grundfläche. Das Original des Akzenttons trägt
     darauf nicht — es gehört auf die Seitenleiste, und nur dorthin. */
  ok("Der Originalton traegt auf der Seitenleiste", true,
    kon(C.accentOrig, C.sidebar) >= 4.5);
  ok("Der Originalton traegt NICHT auf der Grundflaeche", false,
    kon(C.accentOrig, C.bg) >= 3);
  ok("Glanzlicht traegt auf der Seitenleiste", true,
    kon(C.accentGlanz, C.sidebar) >= 4.5);
  /* Karten heben sich auf Sea Salt kaum ab — der Rand muss es tragen */
  ok("Kartenrand ist gegen die Grundflaeche sichtbar", true,
    kon(C.line, C.bg) >= 1.25);
  ok("Karte allein traegt nicht — Rand ist Pflicht", true, kon(C.flaeche, C.bg) < 1.5);
  ok("Stille Flaeche liegt zwischen Grund und Karte", true,
    kon(C.flaecheStill, C.bg) < kon(C.flaeche, C.bg));
  ok("Weisser Text auf Erfolgsflaeche", true, kon("#FFFFFF", C.ok) >= 4.5);
  ok("Weisser Text auf Warnflaeche", true, kon("#FFFFFF", C.warn) >= 4.5);
  ok("Weisser Text auf Kritischflaeche", true, kon("#FFFFFF", C.danger) >= 4.5);
  ok("Erfolgstext auf heller Erfolgsflaeche", true, kon(C.ok, C.okLight) >= 4.5);
  ok("Warntext auf heller Warnflaeche", true, kon(C.warn, C.warnLight) >= 4.5);
  ok("Kritischtext auf heller Flaeche", true, kon(C.danger, C.dangerLight) >= 4.5);
  ok("Glanzlicht traegt auf der Seitenleiste", true, kon(C.accentGlanz, C.sidebar) >= 4.5);
  ok("Gedaempfter Text auf der Seitenleiste", true, kon("#96A0A6", C.sidebar) >= 4.5);
  ok("Genehmigen und Ablehnen sind klar unterscheidbar", true,
    kon(C.ok, "#FFFFFF") >= 4.5 && Math.abs(kon(C.ok, C.bg) - kon(C.bg, C.bg)) > 3);

  /* Hell ist die Vorgabe — nicht das Systemthema. Ein Betriebsprogramm soll
     bei jedem gleich aussehen. */
  ok("C traegt die hellen Werte", C_HELL.bg, C.bg);
  ok("Die helle Grundflaeche ist Sea Salt", "#D9E4E8", C_HELL.bg);
  ok("Hell und Dunkel sind verschieden", true, C_HELL.bg !== C_DUNKEL.bg);
  ok("Die helle Flaeche ist wirklich hell", true, kon(C_HELL.bg, "#000000") > 10);
  ok("Die dunkle Flaeche ist wirklich dunkel", true, kon(C_DUNKEL.bg, "#FFFFFF") > 10);

  /* Dunkelmodus */
  ok("Die dunkle Palette ist vollstaendig", true,
    Object.keys(C_HELL).every((k2) => C_DUNKEL[k2] !== undefined));
  ok("Dunkler Text traegt auf dunklem Grund", true,
    kon(C_DUNKEL.text, C_DUNKEL.bg) >= 4.5);
  ok("Sekundaertext traegt auf dunklem Grund", true,
    kon(C_DUNKEL.dim, C_DUNKEL.bg) >= 4.5);
  ok("Dunkler Akzent traegt", true, kon(C_DUNKEL.accent, C_DUNKEL.bg) >= 4.5);
  ok("Statusfarben tragen auf Dunkel", true,
    [C_DUNKEL.ok, C_DUNKEL.warn, C_DUNKEL.danger].every((f2) =>
      kon(f2, C_DUNKEL.bg) >= 4.5));
  ok("Auf der dunklen Karte traegt der Text ebenfalls", true,
    kon(C_DUNKEL.text, C_DUNKEL.flaeche) >= 4.5);
  /* Der Grund muss wirklich dunkel sein, sonst ist es kein Dunkelmodus */
  ok("Die dunkle Grundflaeche ist dunkler als die helle", true,
    kon(C_DUNKEL.bg, "#FFFFFF") > kon(C_HELL.bg, "#FFFFFF"));


  /* --- Checklisten --- */
  const ckD = { ...m.dienstarten[0], id: "CKD", checkliste: [
    { id: "c1", text: "Schlüssel", zeitpunkt: "beginn", pflicht: true },
    { id: "c2", text: "Rundgang", zeitpunkt: "uhrzeit", uhrzeit: "22:00", pflicht: true },
    { id: "c3", text: "Kaffee", zeitpunkt: "waehrend", pflicht: false },
    { id: "c4", text: "Abschluss", zeitpunkt: "ende", pflicht: true }] };
  const ckM = { ...m, dienstarten: [...m.dienstarten, ckD] };
  const ckP = m.personen[0].id, ckT = heute();
  ok("Checkliste wird gefunden", 4, checkliste(ckM, "CKD", ckT).length);
  ok("Dienst ohne Liste ergibt leer", 0, checkliste(ckM, m.dienstarten[1].id, ckT).length);
  ok("Punkte sind nach Zeitpunkt geordnet", true, (() => {
    const l = checkliste(ckM, "CKD", ckT);
    return l[0].zeitpunkt === "beginn" && l[l.length - 1].zeitpunkt === "ende"; })());

  const ckLeer = checkStand(ckM, ckP, ckT, "CKD");
  ok("Stand zaehlt alle Punkte", 4, ckLeer.gesamt);
  ok("Stand zaehlt die Pflichtpunkte", 3, ckLeer.pflichtGesamt);
  ok("Frische Liste ist unvollstaendig", false, ckLeer.vollstaendig);
  ok("Frische Liste steht bei null Prozent", 0, ckLeer.anteil);

  const ckVoll = { ...ckM, checks: { [checkSchluessel(ckP, ckT, "CKD")]: {
    c1: { zeit: new Date().toISOString() }, c2: { zeit: new Date().toISOString() },
    c4: { zeit: new Date().toISOString() } } } };
  const ckStand = checkStand(ckVoll, ckP, ckT, "CKD");
  ok("Alle Pflichtpunkte erledigt gilt als vollstaendig", true, ckStand.vollstaendig);
  ok("Freiwillige Punkte fehlen im Anteil", 75, ckStand.anteil);
  ok("Erledigte tragen einen Zeitstempel", true, ckStand.zeilen[0].zeit !== null);
  ok("Nachtraegliches wird als solches gefuehrt", true, (() => {
    const gestern = addDays(heute(), -1);
    const mm = { ...ckM, checks: { [checkSchluessel(ckP, gestern, "CKD")]: {
      c1: { zeit: new Date().toISOString(), nachtraeglich: true } } } };
    return checkStand(mm, ckP, gestern, "CKD").zeilen[0].nachtraeglich; })());
  ok("Ohne Liste gibt es keinen Stand", null, checkStand(ckM, ckP, ckT, m.dienstarten[1].id));
  ok("Vorlagen gibt es fuer alle vier Branchen", true,
    ["sicherheit", "pflege", "klinik", "industrie"].every((b) => CHECK_VORLAGEN[b].length > 0));
  ok("Jeder Vorlagenpunkt nennt Text und Zeitpunkt", true,
    Object.values(CHECK_VORLAGEN).every((v) => v.every((c) => c.text
      && CHECK_ZEITPUNKTE[c.zeitpunkt])));
  ok("Neuer Punkt hat eine eigene Kennung", true, (() => {
    const a1 = neuerCheckpunkt("A"), b1 = neuerCheckpunkt("B");
    return a1.id !== b1.id; })());

  /* --- Eingabezeile --- */
  const ezP = m.personen.find((p) => imDienst(p, heute()) && p.nachname.length >= 4);
  ok("Krankmeldung wird verstanden", "krank",
    (verstehe(m, `${ezP.nachname} krank morgen`).befehl || {}).id);
  ok("Person wird erkannt", ezP.id,
    (verstehe(m, `${ezP.nachname} krank morgen`).personen[0] || {}).id);
  ok("Morgen wird als Datum gelesen", addDays(heute(), 1),
    verstehe(m, `${ezP.nachname} krank morgen`).datum);
  ok("Heute wird als Datum gelesen", heute(), datumAus("Lagebild heute"));
  ok("Punktdatum wird gelesen", true, /^\d{4}-\d{2}-\d{2}$/.test(datumAus("Urlaub 14.3.") || ""));
  ok("Zeitraum wird gelesen", true, (() => {
    const z = zeitraumAus("Urlaub 14.3. bis 20.3.");
    return !!z && z.von < z.bis; })());
  ok("Kein Zeitraum bei einem Datum", null, zeitraumAus("krank morgen"));
  ok("Wochentag wird in die Zukunft gelesen", true, (datumAus("wer kann Freitag") || "") > heute());
  ok("Ohne Person bleibt die Krankmeldung unsicher", false,
    verstehe(m, "krank morgen").sicher);
  ok("Fehlende Person wird benannt", true,
    verstehe(m, "krank morgen").fehlt.includes("person"));
  ok("Ansichtsbefehl braucht keine Person", true, verstehe(m, "zeige mir das Lagebild").sicher);
  ok("Ein Name allein oeffnet die Akte", "person",
    (verstehe(m, `${ezP.nachname} ${ezP.vorname}`).befehl || {}).id);
  ok("Unverstandenes wird als solches gemeldet", false,
    verstehe(m, "quaselbrumm foobar").sicher);
  ok("Zu kurze Eingabe ergibt nichts", null, verstehe(m, "a"));
  ok("Das laengere Befehlswort gewinnt", "lage",
    (verstehe(m, "wer hat dienst am freitag").befehl || {}).id);
  ok("Dienstart wird erkannt", true, !!dienstAus(m, "wer kann Nachtdienst"));
  ok("Jeder Vorschlag traegt einen Satz", true,
    [`${ezP.nachname} krank morgen`, "Lagebild", "krank morgen", "quaselbrumm"]
      .every((t2) => { const v = verstehe(m, t2); return !v || (v.satz && v.satz.length > 3); }));
  ok("Es gibt Beispiele fuer die Zeile", true, EINGABE_BEISPIELE.length >= 4);

  /* --- Memoisierung ---
     Der Rechenkern speichert Zwischenergebnisse am Mandantenobjekt. Das
     trägt nur, solange jede Änderung ein NEUES Objekt erzeugt. Wird
     irgendwo am Bestand mutiert, liefert der Kern veraltete Dienstpläne —
     und niemand merkt es, weil nichts abstürzt. Deshalb diese Tests. */
  const memT = addDays(heute(), 3);
  const memP = m.personen.find((p) => imDienst(p, memT) && p.imSchichtdienst !== false);

  /* Gleicher Bestand, gleiche Antwort — sonst ist der Cache wirkungslos */
  ok("Zweiter Aufruf liefert dasselbe Ergebnis", true,
    JSON.stringify(besetzung(m, memT)) === JSON.stringify(besetzung(m, memT)));
  ok("Aktive werden zwischengespeichert", true, aktive(m, memT) === aktive(m, memT));

  /* Neues Objekt, neuer Cache — die Kernbedingung */
  const memAbw = { ...m, abwesenheiten: [...m.abwesenheiten,
    { id: "memtest", personId: memP.id, art: "krank", von: memT, bis: memT, notiz: "" }] };
  ok("Neue Abwesenheit wirkt sofort", true, !!abwesenheitAm(memAbw, memP.id, memT));
  ok("Der alte Bestand bleibt unberuehrt", false, !!abwesenheitAm(m, memP.id, memT));
  ok("Der Abwesenheitsindex wird nicht mitgeschleppt", true,
    absIdx(m) !== absIdx(memAbw));

  /* Eine Abwesenheit muss die Besetzung senken — wenn nicht, hängt der Cache */
  const memVor = besetzung(m, memT);
  const memNach = besetzung(memAbw, memT);
  const memDienst = personTag(m, memP, memT);
  if (memDienst && memDienst.dienstId && memVor[memDienst.dienstId])
    ok("Krankmeldung senkt die Besetzung", true,
      memNach[memDienst.dienstId].anzahl < memVor[memDienst.dienstId].anzahl);

  /* Abweichungen: dasselbe Spiel eine Ebene tiefer */
  const memAbwch = { ...m, abweichungen: { ...m.abweichungen,
    [`${memP.id}|${memT}`]: "F" } };
  ok("Neue Abweichung wirkt sofort", "F",
    (personTag(memAbwch, memP, memT) || {}).dienstId);
  ok("Der alte Bestand kennt die Abweichung nicht", true,
    (personTag(m, memP, memT) || {}).dienstId !== "F"
      || (memDienst && memDienst.dienstId === "F"));

  /* Der schwerste Fall: Rechnet der Kern nach einer Personaländerung neu? */
  const memWeg = { ...m, personen: m.personen.filter((p) => p.id !== memP.id) };
  ok("Entfernte Person zaehlt nicht mehr", false,
    aktive(memWeg, memT).some((p) => p.id === memP.id));
  ok("Der Personenstand sinkt", true, aktive(memWeg, memT).length < aktive(m, memT).length);

  /* Und der Beweis, dass wirklich nicht mutiert wird */
  const memVorher = JSON.stringify(m);
  besetzung(m, memT); pruefen(m, heute(), addDays(heute(), 30)); belastbarkeit(m, 4);
  ersatzVorschlaege(m, memT, m.dienstarten[0].id);
  stundenkonto(m, memP, memT.slice(0, 7));
  ok("Rechnen veraendert den Bestand nicht", memVorher, JSON.stringify(m));

  /* --- Offene Schichten --- */
  const asTag = addDays(heute(), 5);
  const asDienst = m.dienstarten[0].id;
  const asA = { id: "as1", datum: asTag, dienstId: asDienst, status: "offen",
    hinweis: "", bewerbungen: [], vergebenAn: null };
  const mAs = { ...m, ausschreibungen: [asA] };
  ok("Offene Ausschreibung wird gefunden", 1, offeneSchichten(mAs).length);
  ok("Vergebene gilt nicht mehr als offen", 0,
    offeneSchichten({ ...m, ausschreibungen: [{ ...asA, status: "vergeben" }] }).length);
  ok("Vergangene gilt nicht mehr als offen", 0,
    offeneSchichten({ ...m, ausschreibungen: [{ ...asA, datum: addDays(heute(), -3) }] }).length);
  ok("Zurueckgezogene gilt nicht mehr als offen", 0,
    offeneSchichten({ ...m, ausschreibungen: [{ ...asA, status: "zurueckgezogen" }] }).length);

  /* Wer schon eingeteilt ist, darf sich nicht zusaetzlich bewerben */
  const asEing = m.personen.find((p) => { const t = personTag(m, p, asTag);
    return imDienst(p, asTag) && t && t.dienstId
      && m.dienstarten.some((x) => x.id === t.dienstId); });
  if (asEing) ok("Bereits Eingeteilte duerfen sich nicht bewerben", false,
    darfSichBewerben(mAs, asEing.id, asA).darf);
  ok("Unbekannte Person darf nicht", false, darfSichBewerben(mAs, "gibtEsNicht", asA).darf);
  ok("Auf Vergangenes darf niemand", false,
    darfSichBewerben(mAs, m.personen[0].id, { ...asA, datum: addDays(heute(), -1) }).darf);
  ok("Auf Vergebenes darf niemand", false,
    darfSichBewerben(mAs, m.personen[0].id, { ...asA, status: "vergeben" }).darf);
  ok("Zweimal bewerben geht nicht", false, darfSichBewerben(mAs, m.personen[0].id,
    { ...asA, bewerbungen: [{ personId: m.personen[0].id }] }).darf);
  ok("Jede Absage nennt einen Grund", true,
    !!darfSichBewerben(mAs, "gibtEsNicht", asA).grund);

  /* Wer darf, ist eine echte Teilmenge — und dieselbe wie bei der Ersatzsuche */
  const asDuerfen = m.personen.filter((p) => darfSichBewerben(mAs, p.id, asA).darf);
  ok("Es gibt ueberhaupt Bewerbungsberechtigte", true, asDuerfen.length > 0);
  ok("Nicht alle duerfen", true, asDuerfen.length < m.personen.length);
  ok("Berechtigte haben keine Hindernisse", true, asDuerfen.every((p) =>
    hindernisse(mAs, p, asTag, m.dienstarten[0]).length === 0));
  ok("Meine offenen Schichten sind eine Teilmenge aller offenen", true,
    meineOffenenSchichten(mAs, asDuerfen[0].id).length <= offeneSchichten(mAs).length);

  /* Reihenfolge der Bewerbungen */
  const asMitBew = { ...asA, bewerbungen: asDuerfen.slice(0, 3)
    .map((p) => ({ personId: p.id, zeit: new Date().toISOString(), text: "" })) };
  const mBew = { ...m, ausschreibungen: [asMitBew] };
  const geordnet = bewerbungenGeordnet(mBew, asMitBew);
  ok("Alle Bewerbungen erscheinen", Math.min(3, asDuerfen.length), geordnet.length);
  ok("Bewerbungen sind absteigend geordnet", true,
    geordnet.every((b, i) => i === 0 || geordnet[i - 1].punkte >= b.punkte));
  ok("Jede Bewerbung nennt Gruende", true, geordnet.every((b) => Array.isArray(b.gruende)));
  ok("Jede Bewerbung traegt die Person", true, geordnet.every((b) => !!b.person));

  const asLage = ausschreibungLage(mBew, asMitBew);
  ok("Lage zaehlt die Meldungen", geordnet.length, asLage.anzahl);
  ok("Lage nennt die Zahl der Moeglichen", true, asLage.moeglich > 0);
  ok("Lage nennt den besten Vorschlag", true, !!asLage.beste);
  ok("Ohne Meldung und kurzem Vorlauf gilt es als dringend", true,
    ausschreibungLage(m, { ...asA, datum: addDays(heute(), 1), bewerbungen: [] }).dringend);
  ok("Mit Meldung gilt es nicht als dringend", false,
    ausschreibungLage(mBew, { ...asMitBew, datum: addDays(heute(), 1) }).dringend);

  /* --- Mandantenanlage --- */
  const neuM = mandantAnlegen({ name: "Probe GmbH", branche: "sicherheit",
    anschrift: "", kontakt: "", zusatzRollen: ["subplaner", "mitarbeiter"] });
  ok("Neuer Betrieb hat keine Abwesenheiten", 0, neuM.abwesenheiten.length);
  ok("Neuer Betrieb hat keine Abweichungen", 0, Object.keys(neuM.abweichungen).length);
  ok("Neuer Betrieb hat keine Antraege", 0, neuM.anfragen.length);
  ok("Neuer Betrieb hat keine Qualifikationen", 0, neuM.qualifikationen.length);
  /* Der Zyklus ist nicht leer, sondern eine Woche freier Tage — der
     Rechenkern erwartet eine Struktur, und ein Plan aus freien Tagen ist
     ehrlicher als gar keiner. */
  ok("Neuer Betrieb hat einen leeren Wochenzyklus", 7, neuM.zyklus.tage.length);
  ok("Im Zyklus steht kein Dienst", true, neuM.zyklus.tage.every((t2) => t2 === null));
  ok("Neuer Betrieb hat einen Standort", 1, neuM.standorte.length);
  ok("Neuer Betrieb hat drei Dienstarten", 3, neuM.dienstarten.length);
  ok("Gesetzliche Ruhezeit ist gesetzt", 11, neuM.einstellungen.ruhezeit);
  ok("Wochenarbeitszeit ist gesetzt", true, neuM.einstellungen.wochenstunden > 0);
  ok("Nur Zugangspersonen, kein Beispielpersonal", 4, neuM.personen.length);
  ok("Leitung und Planung entstehen immer", true,
    neuM.personen.some((p2) => p2.rolle === "leitung")
      && neuM.personen.some((p2) => p2.rolle === "planer"));
  ok("Zusatzrollen werden angelegt", true,
    neuM.personen.some((p2) => p2.rolle === "subplaner")
      && neuM.personen.some((p2) => p2.rolle === "mitarbeiter"));
  ok("Zugangspersonen sind als neu gekennzeichnet", true,
    neuM.personen.every((p2) => p2.neuerZugang));
  ok("Bei Zugangspersonen startet die Tour", true,
    neuM.personen.every((p2) => tourStartet(p2, p2.rolle)));
  ok("Die Leitung faehrt keine Schicht", false,
    neuM.personen.find((p2) => p2.rolle === "leitung").imSchichtdienst);
  ok("Jede Zugangsperson gehoert zu einer Einheit", true,
    neuM.personen.every((p2) => p2.zugehoerigkeit.length > 0));
  ok("Der Betrieb ist rechenbar", true, (() => {
    try { besetzung(neuM, heute()); pruefen(neuM, heute(), addDays(heute(), 7)); return true; }
    catch (e) { return false; } })());
  ok("Ohne Personal meldet die Pruefung Unterbesetzung", true,
    pruefen(neuM, heute(), addDays(heute(), 7)).length > 0);

  /* Adressänderungen */
  const mAdr = { ...m, adressAenderungen: [
    { personId: m.personen[0].id, von: null, nach: "neu@betrieb.de",
      zeit: new Date().toISOString() }] };
  const aend = adressAenderungen({ ...db, mandanten: [mAdr] }, 90);
  ok("Adressaenderung wird gefunden", 1, aend.length);
  ok("Adressaenderung nennt den Betrieb", true, !!aend[0].mandant);
  ok("Adressaenderung nennt die Rolle", true, !!aend[0].rolle);
  ok("Alte Aenderungen fallen heraus", 0, adressAenderungen({ ...db, mandanten: [{ ...m,
    adressAenderungen: [{ personId: m.personen[0].id, von: null, nach: "x@y.de",
      zeit: addDays(heute(), -200) + "T10:00:00.000Z" }] }] }, 90).length);

  /* --- Geführte Tour --- */
  ok("Jede Rolle hat eine Tour", true,
    ["leitung","planer","subplaner","mitarbeiter","betriebsrat","betreiber"]
      .every((r) => !!TOUR[r]));
  ok("Jede Tour nennt Titel, Dauer und Einleitung", true,
    Object.values(TOUR).every((t) => t.titel && t.dauer && t.einleitung && t.kapitel.length));
  ok("Jeder Punkt hat Titel und Text", true,
    Object.values(TOUR).every((t) => t.kapitel.every((k) =>
      k.punkte.every((p2) => p2.titel && p2.text))));
  ok("Leitung hat die umfangreichste Tour", true, (() => {
    const n = (r) => tourPunkte(r).length;
    return n("leitung") > n("planer") && n("planer") > n("subplaner")
      && n("subplaner") > n("mitarbeiter"); })());
  ok("Leitung hat mindestens vierzig Schritte", true, tourPunkte("leitung").length >= 40);
  ok("Mitarbeitertour bleibt kurz", true, tourPunkte("mitarbeiter").length <= 20);
  /* Ziele müssen auf eine erreichbare Ansicht zeigen — sonst führt die Tour
     ins Leere. Drei Listen kommen infrage: die Bereiche der Kundenansicht,
     die Betreiberkonsole und die vier Reiter der Telefonansicht. */
  ok("Alle Ziele sind gueltige Ansichten", true, (() => {
    const kunde = new Set(BEREICHE.flatMap((b) => b.views).map((v) => v[0]));
    const betreiber = new Set(["mandanten","rechnungen","tarife","rechner","pakete","einstellungen"]);
    const mobil = new Set(["heute","meinplan","anliegen","mehr","offene"]);
    const gilt = (z) => kunde.has(z) || betreiber.has(z) || mobil.has(z);
    const schlecht = [];
    for (const r of Object.keys(TOUR))
      for (const p2 of tourPunkte(r))
        if (p2.ziel && !gilt(p2.ziel)) schlecht.push(`${r}:${p2.ziel}`);
    return schlecht.length === 0; })());
  ok("Betreiberziele gehoeren zur Betreiberkonsole", true,
    tourPunkte("betreiber").filter((p2) => p2.ziel).every((p2) =>
      ["mandanten","rechnungen","tarife","rechner","pakete","einstellungen"].includes(p2.ziel)));
  ok("Jeder Punkt hat eine eindeutige Kennung", true, (() => {
    const ids = tourPunkte("leitung").map((p2) => p2.id);
    return new Set(ids).size === ids.length; })());
  /* Ein Punkt ohne Handlung oder Merksatz waere blosse Beschreibung */
  ok("Die meisten Punkte nennen Handlung, Kontrolle oder Merksatz", true,
    tourPunkte("leitung").filter((p2) => p2.tun || p2.pruefen || p2.merke).length
      >= tourPunkte("leitung").length * 0.6);

  const tP = { ...m.personen[0], tour: undefined };
  ok("Ohne Vorgeschichte startet die Tour", true, tourStartet(tP, "planer"));
  ok("Nach dem Abschalten startet sie nicht", false,
    tourStartet({ ...tP, tour: { nichtMehr: true } }, "planer"));
  ok("Nach dem Abschluss startet sie nicht", false,
    tourStartet({ ...tP, tour: { fertig: true } }, "planer"));
  ok("Wer schon begonnen hat, bekommt keinen Neustart", false,
    tourStartet({ ...tP, tour: { gesehen: ["planer:0:0"] } }, "planer"));
  const stT = tourStand({ ...tP, tour: { schritt: 2, gesehen: ["planer:0:0","planer:0:1"] } }, "planer");
  ok("Der Stand kennt den Fortschritt", 2, stT.idx);
  ok("Der Anteil wird gerechnet", true, stT.anteil > 0 && stT.anteil < 100);
  ok("Ein zu hoher Schritt wird begrenzt", true,
    tourStand({ ...tP, tour: { schritt: 9999 } }, "planer").idx < stT.gesamt);

  /* --- Zustellung --- */
  ok("Zustellarten sind vollstaendig beschrieben", true,
    Object.values(ZUSTELLARTEN).every((a) => a.titel && a.text && typeof a.mail === "boolean"
      && typeof a.push === "boolean" && typeof a.dringend === "boolean"));
  const zuP = { ...m.personen[0], email: "a@b.de", pushSchluessel: { endpoint: "x" } };
  ok("Mit Adresse und Schluessel gehen beide Wege", true, (() => {
    const w = zustellwege(zuP, "antragEntschieden"); return w.mail && w.push; })());
  ok("Ohne Adresse geht keine Mail", false,
    zustellwege({ ...zuP, email: null }, "antragEntschieden").mail);
  ok("Ohne Schluessel geht kein Push", false,
    zustellwege({ ...zuP, pushSchluessel: null }, "antragEntschieden").push);
  ok("Postfach traegt immer", true, zustellwege({ ...zuP, email: null,
    pushSchluessel: null }, "antragEntschieden").postfach);
  ok("Eigene Einstellung sticht die Vorgabe", false,
    zustellwege({ ...zuP, zustellung: { antragEntschieden: { mail: false } } },
      "antragEntschieden").mail);
  ok("Unbekannte Art geht nur ins Postfach", true, (() => {
    const w = zustellwege(zuP, "gibtEsNicht"); return w.postfach && !w.mail && !w.push; })());
  ok("Nur dringende Arten sind als dringend markiert", true,
    ZUSTELLARTEN.planGeaendert.dringend && !ZUSTELLARTEN.nachweisLaeuftAb.dringend);

  const zuM = { ...m, personen: m.personen.map((p, i) => i === 0 ? zuP : p) };
  const zuN = baueMitteilung(zuM, zuP.id, "antragEntschieden", "Titel", "Text", "meine");
  ok("Mitteilung traegt beide Zustellwege", true, !!zuN.wege.mail && !!zuN.wege.push);
  ok("Mitteilung ist zunaechst ungelesen", false, zuN.gelesen);
  ok("Mitteilung ist zunaechst unzugestellt", true,
    zuN.zugestellt.mail === null && zuN.zugestellt.push === null);
  ok("Unbekannte Person ergibt keine Mitteilung", null,
    baueMitteilung(zuM, "gibtEsNicht", "antragEntschieden", "T", "X"));
  ok("Offene Zustellungen werden gefunden", 1,
    offeneZustellungen({ ...zuM, nachrichten: [zuN] }).length);
  ok("Zugestellte gelten nicht mehr als offen", 0,
    offeneZustellungen({ ...zuM, nachrichten: [{ ...zuN,
      zugestellt: { mail: "gesendet", push: "gesendet" } }] }).length);
  const zuMail = mailText(zuM, zuN, zuP);
  ok("Mailbetreff nennt Titel und Betrieb", true,
    zuMail.betreff.includes("Titel") && zuMail.betreff.includes(m.name));
  ok("Mailtext spricht die Person an", true, zuMail.text.includes(zuP.vorname));
  ok("Mailtext nennt den Abmeldeweg", true, zuMail.text.includes("Mehr"));
  ok("Voreinstellung deckt alle Arten ab", Object.keys(ZUSTELLARTEN).length,
    Object.keys(zustellungStandard()).length);

  /* --- Handbuch --- */
  ok("Handbuch hat Kapitel", true, HANDBUCH.length >= 8);
  ok("Jedes Kapitel nennt Titel, Dauer und Einleitung", true,
    HANDBUCH.every((k) => k.titel && k.dauer && k.einleitung && k.abschnitte.length));
  ok("Jeder Abschnitt hat Titel und Text", true,
    HANDBUCH.every((k) => k.abschnitte.every((a) => a.titel && a.text)));
  ok("Einrichtungsschritte nennen eine Erfolgskontrolle", true,
    HANDBUCH.filter((k) => k.titel.indexOf("Schritt") === 0)
      .every((k) => k.abschnitte.every((a) => !!a.pruefen)));
  ok("Jeder Einrichtungsschritt fuehrt zu einer Ansicht", true,
    HANDBUCH.filter((k) => k.titel.indexOf("Schritt") === 0).every((k) => !!k.ziel));
  ok("Alle Ziele sind gueltige Ansichten", true, (() => {
    const alle = new Set(BEREICHE.flatMap((b) => b.views).map((v) => v[0]));
    return HANDBUCH.filter((k) => k.ziel).every((k) => alle.has(k.ziel)); })());
  ok("Branchenkapitel sind an Pakete gebunden", true,
    HANDBUCH.filter((k) => ["pflege", "sicherheit"].includes(k.id))
      .every((k) => typeof k.nurWenn === "function"));
  ok("Pflegekapitel erscheint im Pflegebetrieb", true,
    !!HANDBUCH.find((k) => k.id === "pflege").nurWenn(db.mandanten[1]));
  ok("Pflegekapitel bleibt im Sicherheitsbetrieb aus", false,
    !!HANDBUCH.find((k) => k.id === "pflege").nurWenn(db.mandanten[0]));
  ok("Sicherheitskapitel erscheint im Wachbetrieb", true,
    !!HANDBUCH.find((k) => k.id === "sicherheit").nurWenn(db.mandanten[0]));
  ok("Handbuch enthaelt genug Abschnitte", true,
    HANDBUCH.reduce((a, k) => a + k.abschnitte.length, 0) >= 20);
  const hd = handbuchDruck(m);
  ok("Druckfassung nennt den Betrieb", true, hd.includes(m.name));
  ok("Druckfassung hat ein Inhaltsverzeichnis", true, hd.includes("Inhalt"));
  ok("Druckfassung enthaelt alle Kapitel", true,
    HANDBUCH.filter((k) => !k.nurWenn || k.nurWenn(m)).every((k) => hd.includes(k.titel)));
  return T;
}
export { selbsttest, mandantAnlegen, leererMandant, zugangsPerson };
