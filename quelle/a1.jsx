
/* ==========================================================================
   CENTRIC — eine Anwendung, gestaffelte Zugriffstiefe
   Betreiber · Organisationsleitung · Planer · Sub-Planer · Mitarbeiter · Betriebsrat
   Branchenneutral für jeden Betrieb im durchgehenden Schichtbetrieb.
   ========================================================================== */

const C = {
  /* ------------------------------------------------------------------
     Warmes Blaugrau statt kaltem Teal. Die Familie stammt aus den
     Entwürfen, die Werte sind nachgedunkelt: dort lagen die Akzente bei
     3,0 bis 4,2:1 und trugen als Text nicht. Alle Farben hier erreichen
     mindestens 4,7:1 auf der Grundfläche und 6:1 als weißer Text.
     ------------------------------------------------------------------ */
  /* Flächen — leicht warm, nicht klinisch weiß */
  bg: "#F5F4F2", flaeche: "#FFFFFF", flaecheStill: "#FAF9F7",
  sidebar: "#1A2429", sidebarTief: "#141C20",
  /* Text */
  text: "#14201F", dim: "#5A6670", dimmer: "#5A6670", aus: "#5A6670",
  /* Linien */
  line: "#E3E1DD", lineSoft: "#EEECE8", lineStark: "#CFCCC6",
  /* Akzent */
  accent: "#3E6478", accentHi: "#4E7182", accentDeep: "#2C4E5C",
  accentLight: "#EDF2F5", accentGlanz: "#7FB2C4",
  /* Zustände — in derselben Wärme gehalten */
  ok: "#2F6B4F", warn: "#8A5518", danger: "#A8352C", violet: "#4A4368",
  okLight: "#EDF5F0", warnLight: "#FBF3E8", dangerLight: "#FBEFEE",
};

/* Dienstarten: entsättigte Tönungen mit dünner Akzentlinie — keine Farbflächen. */
const TON = (farbe, staerke = 1) => ({
  background: `${farbe}${staerke > 1 ? "1F" : "12"}`,
  borderLeft: `2.5px solid ${farbe}`,
});

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };

/** Globale Gestaltung. Hover- und Glaseffekte brauchen echtes CSS. */
const STYLES = `
:root{
  /* Dichte — systemweit umschaltbar zwischen Komfortabel und Kompakt */
  --zeile: 48px; --pad-y: 14px; --pad-x: 20px; --luft: 32px; --schrift: 14.5px;
  --block: 48px;                 /* Abstand zwischen Abschnitten — bewusst großzügig */
  --r: 10px; --r-gross: 14px;
  --schatten: 0 1px 2px rgba(17,24,39,.05);
  --schatten-hoch: 0 4px 6px -1px rgba(17,24,39,.07), 0 12px 24px -8px rgba(17,24,39,.10);
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
.sgruppe{font-size:10.5px; font-weight:700; letter-spacing:.10em; text-transform:uppercase;
  color:rgba(255,255,255,.38); padding:16px 12px 7px;}
.slink{
  display:flex; align-items:center; gap:11px; width:100%; border:none; background:transparent;
  color:rgba(255,255,255,.72); font-family:inherit; font-size:13.5px; font-weight:500;
  padding:9px 12px; border-radius:var(--r); cursor:pointer; text-align:left;
  transition:background .14s, color .14s; margin-bottom:1px; position:relative;
}
.slink:hover{background:rgba(255,255,255,.07); color:#fff;}
/* Aktiv über helle Fläche statt Akzentfarbe — Teal auf Anthrazit erreicht nur 2,7:1 */
.slink.on{background:rgba(255,255,255,.13); color:#fff; font-weight:600;}
.slink.on::before{content:""; position:absolute; left:0; top:8px; bottom:8px; width:3px;
  border-radius:0 3px 3px 0; background:${C.accentGlanz};}
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
.karte{background:${C.flaeche}; border:1px solid ${C.line}; border-radius:var(--r-gross);
  box-shadow:var(--schatten);}
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
  padding:9px 16px; font-size:13.5px; font-weight:550; font-family:inherit; cursor:pointer;
  border-radius:var(--r); border:1px solid ${C.line}; background:${C.flaeche}; color:${C.text};
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
.btn-sm{padding:6px 12px; font-size:12.5px; border-radius:8px;}

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

.pille{display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:6px;
  font-size:11.5px; font-weight:600; background:${C.bg}; color:${C.dim}; border:1px solid ${C.line};
  white-space:nowrap;}
.pille-ok{background:${C.okLight}; color:${C.ok}; border-color:#A7F3D0;}
.pille-warn{background:${C.warnLight}; color:${C.warn}; border-color:#FDE68A;}
.pille-danger{background:${C.dangerLight}; color:${C.danger}; border-color:#FECACA;}
.pille-accent{background:${C.accentLight}; color:${C.accent}; border-color:#99F6E4;}

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

.seg{display:inline-flex; background:${C.bg}; border:1px solid ${C.line}; border-radius:var(--r);
  padding:2px; gap:2px; max-width:100%; overflow-x:auto;}
.seg button{border:none; background:transparent; cursor:pointer; font-family:inherit; font-size:12.5px;
  font-weight:550; color:${C.dim}; padding:6px 13px; border-radius:7px; white-space:nowrap;
  flex-shrink:0; transition:background .14s, color .14s;}
.seg button.on{background:${C.flaeche}; color:${C.text}; box-shadow:var(--schatten);}

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

const TARIFE_STD = [
  { id: "basis", name: "Basis", grund: 49, preis: { leitung: 0, planer: 9, subplaner: 5, mitarbeiter: 1.8, betriebsrat: 0 },
    grenzen: { einheiten: 3, personen: 60 }, leistungen: ["Dienstplanung", "Anträge und Tausch", "Mobile Ansicht", "CSV-Export"] },
  { id: "pro", name: "Professional", grund: 149, preis: { leitung: 0, planer: 8, subplaner: 4.5, mitarbeiter: 1.6, betriebsrat: 0 },
    grenzen: { einheiten: 15, personen: 400 }, leistungen: ["Alles aus Basis", "Qualifikationsprüfung", "Eigene Dienstarten", "Kalenderdatei", "Protokoll"] },
  { id: "enterprise", name: "Enterprise", grund: 399, preis: { leitung: 0, planer: 6.5, subplaner: 3.5, mitarbeiter: 1.25, betriebsrat: 0 },
    grenzen: { einheiten: 200, personen: 5000 }, leistungen: ["Alles aus Professional", "Besetzungsnachweis", "Unternehmensanmeldung", "Schnittstelle Zeitwirtschaft", "Auftragsverarbeitung"] },
];
const STAFFEL = [
  { von: 0, bis: 49, rabatt: 0, label: "bis 49" }, { von: 50, bis: 149, rabatt: .10, label: "50 – 149" },
  { von: 150, bis: 399, rabatt: .18, label: "150 – 399" }, { von: 400, bis: 999, rabatt: .25, label: "400 – 999" },
  { von: 1000, bis: 1e6, rabatt: .32, label: "ab 1.000" },
];
const staffel = (n) => STAFFEL.find((s) => n >= s.von && n <= s.bis) || STAFFEL[0];

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
    harteSperre: !!q[5] }));      // ohne sie ist keine Einteilung möglich

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
