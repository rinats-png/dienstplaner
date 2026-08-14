
/* ==========================================================================
   SCHICHTWERK — eine Anwendung, gestaffelte Zugriffstiefe
   Betreiber · Organisationsleitung · Planer · Sub-Planer · Mitarbeiter · Betriebsrat
   Branchenneutral für jeden Betrieb im durchgehenden Schichtbetrieb.
   ========================================================================== */

const C = {
  /* Chrom: Graphit. Trägt keine Bedeutung, konkurriert deshalb nicht mit den Daten. */
  text: "#1B1E23", dim: "#5A5F66", dimmer: "#656A73",
  line: "rgba(28,30,34,.11)", lineSoft: "rgba(28,30,34,.055)",
  accent: "#2B3440", accentDeep: "#1F2731", accentHi: "#39434F",
  /* Semantik: tief und entsättigt — Zustandssignale, keine Identität. */
  ok: "#2E6B4F", warn: "#8A5A00", danger: "#B3261E", violet: "#4C4668",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Inter, system-ui, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };

/** Globale Gestaltung. Hover- und Glaseffekte brauchen echtes CSS. */
const STYLES = `
:root{
  --glass: rgba(253,253,252,.72);
  --glass-strong: rgba(255,255,255,.88);
  --glass-line: rgba(255,255,255,.82);
  --shadow-1: 0 1px 2px rgba(24,26,30,.05), 0 8px 22px rgba(24,26,30,.055);
  --shadow-2: 0 2px 6px rgba(24,26,30,.07), 0 18px 42px rgba(24,26,30,.10);
  --r: 18px;
}
*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}
body{margin:0;}
.sw-root{
  min-height:100vh; position:relative; overflow-x:hidden;
  background:#EDEDEA; color:${C.text}; font-family:${FONT};
  -webkit-font-smoothing:antialiased;
}
/* Farbschleier im Hintergrund — Grundlage für den Glaseffekt */
.sw-aurora{position:fixed; inset:-20%; z-index:0; pointer-events:none; filter:blur(110px); opacity:.16;}
.sw-aurora i{position:absolute; display:block; border-radius:50%;}
.sw-aurora i:nth-child(1){width:52vw;height:52vw;left:-8vw;top:-10vw;background:radial-gradient(circle,#9AA3B2,transparent 70%);}
.sw-aurora i:nth-child(2){width:44vw;height:44vw;right:-6vw;top:4vw;background:radial-gradient(circle,#B0A99C,transparent 70%);}
.sw-aurora i:nth-child(3){width:48vw;height:48vw;left:26vw;bottom:-16vw;background:radial-gradient(circle,#9FB0A8,transparent 70%);}
.sw-aurora i:nth-child(4){display:none;}
.sw-layer{position:relative; z-index:1;}

.glass{
  background:var(--glass); backdrop-filter:saturate(180%) blur(26px);
  -webkit-backdrop-filter:saturate(180%) blur(26px);
  border:1px solid var(--glass-line); border-radius:var(--r); box-shadow:var(--shadow-1);
  transition:box-shadow .28s cubic-bezier(.4,0,.2,1), transform .28s cubic-bezier(.4,0,.2,1), background .28s;
}
.glass-hover:hover{transform:translateY(-2px); box-shadow:var(--shadow-2); background:var(--glass-strong);}
.glass-flat{background:rgba(255,255,255,.55); border:1px solid rgba(255,255,255,.72); border-radius:14px;}

.bar{
  position:sticky; top:0; z-index:40;
  background:rgba(240,240,237,.76); backdrop-filter:saturate(200%) blur(30px);
  -webkit-backdrop-filter:saturate(200%) blur(30px);
  border-bottom:1px solid rgba(255,255,255,.6);
}
.navlink{
  padding:9px 14px; border:none; background:transparent; cursor:pointer; font-family:inherit;
  font-size:13.5px; font-weight:500; color:${C.dim}; border-radius:11px; white-space:nowrap;
  transition:background .2s, color .2s, transform .2s;
}
.navlink:hover{background:rgba(255,255,255,.75); color:${C.text}; transform:translateY(-1px);}
.navlink.on{background:rgba(255,255,255,.92); color:${C.text}; font-weight:600; box-shadow:var(--shadow-1);}

.btn{
  border:1px solid transparent; border-radius:11px; cursor:pointer; font-family:inherit;
  font-weight:550; white-space:nowrap; padding:9px 17px; font-size:13.5px;
  transition:transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s, filter .18s, background .18s;
}
.btn:hover:not(:disabled){transform:translateY(-1px); box-shadow:0 6px 18px rgba(16,16,24,.13);}
.btn:active:not(:disabled){transform:translateY(0) scale(.985);}
.btn:disabled{opacity:.38; cursor:not-allowed;}
.btn-sm{padding:5px 12px; font-size:12.5px; border-radius:9px;}
.btn-primary{background:linear-gradient(180deg,${C.accentHi},${C.accent}); color:#fff; box-shadow:0 2px 10px rgba(27,30,35,.24);}
.btn-plain{background:rgba(255,255,255,.72); color:${C.text}; border-color:rgba(255,255,255,.9);}
.btn-plain:hover:not(:disabled){background:rgba(255,255,255,.95);}
.btn-quiet{background:rgba(20,20,25,.05); color:${C.dim};}
.btn-danger{background:rgba(179,38,30,.10); color:${C.danger};}
.btn-ok{background:rgba(46,107,79,.13); color:${C.ok};}

.row{transition:background .18s;}
.row:hover{background:rgba(255,255,255,.55);}
.cellbtn{transition:transform .16s, filter .16s;}
.cellbtn:hover{transform:scale(1.14); filter:saturate(1.3);}
.seg{display:inline-flex; background:rgba(20,20,25,.055); border-radius:12px; padding:3px; gap:3px;}
.seg button{border:none; background:transparent; cursor:pointer; font-family:inherit; font-size:13px;
  font-weight:500; color:${C.dim}; padding:6px 14px; border-radius:9px; transition:all .2s; white-space:nowrap;}
.seg button:hover{color:${C.text};}
.seg button.on{background:#fff; color:${C.text}; font-weight:600; box-shadow:0 1px 3px rgba(16,16,24,.12);}
input,select,textarea{font-family:inherit;}
.inp{width:100%; background:rgba(255,255,255,.75); border:1px solid rgba(20,20,25,.12); border-radius:11px;
  color:${C.text}; padding:10px 12px; font-size:14px; outline:none; transition:border-color .2s, box-shadow .2s, background .2s;}
.inp:hover{background:rgba(255,255,255,.92);}
.inp:focus{border-color:${C.accent}; box-shadow:0 0 0 4px rgba(43,52,64,.15); background:#fff;}
.sheet-back{position:fixed; inset:0; background:rgba(20,20,28,.30); backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px); z-index:60; display:flex; align-items:flex-start;
  justify-content:center; padding:5vh 16px; overflow-y:auto; animation:fade .22s ease;}
.sheet{width:100%; background:rgba(252,252,254,.92); backdrop-filter:saturate(180%) blur(30px);
  -webkit-backdrop-filter:saturate(180%) blur(30px); border:1px solid rgba(255,255,255,.8);
  border-radius:24px; box-shadow:0 30px 90px rgba(16,16,24,.28); animation:rise .3s cubic-bezier(.2,.8,.2,1);}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes rise{from{opacity:0; transform:translateY(14px) scale(.985)}to{opacity:1; transform:none}}
::-webkit-scrollbar{height:11px; width:11px;}
::-webkit-scrollbar-thumb{background:rgba(20,20,25,.18); border-radius:6px; border:3px solid transparent; background-clip:content-box;}
::-webkit-scrollbar-thumb:hover{background:rgba(20,20,25,.30); background-clip:content-box;}
::-webkit-scrollbar-track{background:transparent;}
/* Telefon: ausschließlich die Mitarbeitersicht wird umgebrochen. */
@media (max-width: 820px){
  .sw-layer main{padding:18px 14px 96px !important;}
  .bar .barwrap{padding:0 14px !important;}
  .nur-breit{display:none !important;}
  .m-stack{display:block !important;}
  .m-stack > *{margin-bottom:12px;}
  .m-full{width:100% !important;}
  .tabbar{
    position:fixed; left:0; right:0; bottom:0; z-index:50; display:flex;
    background:rgba(240,240,237,.86); backdrop-filter:saturate(200%) blur(28px);
    -webkit-backdrop-filter:saturate(200%) blur(28px);
    border-top:1px solid rgba(255,255,255,.7); padding:7px 6px calc(7px + env(safe-area-inset-bottom));
  }
  .tabbar button{
    flex:1; border:none; background:transparent; cursor:pointer; font-family:inherit;
    display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 2px;
    font-size:10.5px; font-weight:600; color:${C.dim}; border-radius:12px; transition:background .2s,color .2s;
  }
  .tabbar button.on{color:${C.text}; background:rgba(255,255,255,.85);}
  .tabbar .glyph{font-size:17px; line-height:1;}
  .sheet-back{padding:0 !important; align-items:flex-end !important;}
  .sheet{max-width:100% !important; border-radius:22px 22px 0 0 !important; max-height:94vh; overflow-y:auto;}
}
@media (min-width: 821px){ .tabbar{display:none;} .nur-schmal{display:none !important;} }
@media print{
  .sw-aurora,.bar,.noprint{display:none !important;}
  .sw-root{background:#fff !important;}
  .glass{background:#fff !important; box-shadow:none !important; border:1px solid #bbb !important; backdrop-filter:none !important;}
  tr{page-break-inside:avoid;} @page{size:landscape; margin:12mm;}
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
const PALETTE = ["#1D4ED8","#7C3AED","#0F766E","#B03A0A","#BE185D","#446F0D","#0369A1","#8A5309"];

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
  const standorte = (cfg.standorte || [{ name: cfg.ort || "Hauptstandort", land: cfg.land }])
    .map((x, i) => ({ id: `st${i + 1}`, name: x.name, bundesland: x.land }));
  const einheiten = Array.from({ length: v.einheiten }, (_, i) => ({
    id: uid("e"), name: `${cfg.einheitLabel} ${i + 1}`, versatz: i, pool: false,
    standortId: standorte[i % standorte.length].id, farbe: PALETTE[i % PALETTE.length] }));
  // Springerpool: keine Rotation, wird gezielt in Lücken eingesetzt
  if (cfg.pool) einheiten.push({ id: uid("e"), name: "Springerpool", versatz: 0, pool: true,
    standortId: standorte[0].id, farbe: "#0369A1" });
  const quals = cfg.qualifikationen.map((q, i) => ({ id: `q${i + 1}`, name: q[0], kurz: q[1], farbe: PALETTE[i % PALETTE.length] }));

  const dienstarten = [
    { id: "F", name: "Frühdienst", kurz: "F", start: v.zeiten.F[0], ende: v.zeiten.F[1], pause: 0, farbe: "#1D4ED8",
      ort: cfg.ort, posten: false, quelle: null, anrechnung: 100, ruhezeitNeutral: false, rufbereitschaft: false, mindest: cfg.mindest.F, mindestQual: cfg.mindestQual.F || {} },
    { id: "S", name: "Spätdienst", kurz: "S", start: v.zeiten.S[0], ende: v.zeiten.S[1], pause: 0, farbe: "#B03A0A",
      ort: cfg.ort, posten: false, quelle: null, anrechnung: 100, ruhezeitNeutral: false, rufbereitschaft: false, mindest: cfg.mindest.S, mindestQual: cfg.mindestQual.S || {} },
    { id: "N", name: "Nachtdienst", kurz: "N", start: v.zeiten.N[0], ende: v.zeiten.N[1], pause: 0, farbe: "#7C3AED",
      ort: cfg.ort, posten: false, quelle: null, anrechnung: 100, ruhezeitNeutral: false, rufbereitschaft: false, mindest: cfg.mindest.N, mindestQual: cfg.mindestQual.N || {} },
  ];
  if (cfg.posten) dienstarten.push(
    { id: "PF", name: cfg.posten.name, kurz: "PF", start: cfg.posten.start, ende: cfg.posten.ende, pause: 0,
      farbe: "#0F766E", ort: cfg.posten.ort, posten: true, quelle: "F", anrechnung: 100, ruhezeitNeutral: false, rufbereitschaft: false,
      anrechnung: 100, ruhezeitNeutral: false, rufbereitschaft: false, faktor: 1,
      mindest: { mo_do: cfg.posten.n, fr: cfg.posten.n, sa: cfg.posten.n, so: cfg.posten.n }, mindestQual: {} });

  if (cfg.rufbereitschaft) dienstarten.push({ id: "RB", name: "Rufbereitschaft", kurz: "RB",
    start: "17:00", ende: "07:00", pause: 0, farbe: "#8A5309", ort: cfg.ort, posten: false, quelle: null,
    anrechnung: 12.5, ruhezeitNeutral: true, rufbereitschaft: true,
    mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} });

  const personen = [];
  const belegt = new Set();
  einheiten.forEach((e, ei) => {
    const groesse = e.pool ? (cfg.pool || 0) : cfg.groesse + (ei % 2);
    for (let i = 0; i < groesse; i++) {
      let vn, nn, k;
      do { vn = VN[Math.floor(r() * VN.length)]; nn = NN[Math.floor(r() * NN.length)]; k = vn + nn; } while (belegt.has(k));
      belegt.add(k);
      const qs = [quals[0].id];
      if (i < 3 && quals[1]) qs.push(quals[1].id);
      if (r() > .6 && quals[2]) qs.push(quals[2].id);
      personen.push({ id: uid("p"), vorname: vn, nachname: nn,
        funktion: e.pool ? "Springer" : i === 0 ? "Schichtleitung" : i === 1 ? "Stellvertretung"
          : i === groesse - 2 ? "Auszubildende" : "Fachkraft",
        email: `${vn.toLowerCase()}.${nn.toLowerCase().replace(/[^a-z]/g, "")}@${cfg.domain}`,
        zugehoerigkeit: [{ ab: `${jahr - 2}-01-01`, einheitId: e.id }],
        eintritt: `${jahr - 2}-01-01`, austritt: null,
        wochenstunden: (!e.pool && i === 5) ? Math.round(cfg.wochenstunden * 0.5 * 2) / 2
          : (!e.pool && i === 10) ? Math.round(cfg.wochenstunden * 0.75 * 2) / 2 : cfg.wochenstunden,
        urlaubsanspruch: 30, urlaubsuebertrag: i % 5 === 0 ? 3 : 0,
        stundenuebertrag: Math.round((r() * 60 - 75) * 10) / 10, qualifikationen: qs,
        einschraenkungen: { keineNacht: false, keinAlleindienst: !e.pool && i === groesse - 2,
          maxDiensteWoche: null, wiedereingliederung: null },
        teilzeitVersatz: i,
        springer: !!e.pool,
        rolle: (!e.pool && i === 0 && ei === 0) ? "leitung" : (!e.pool && i === 0) ? "planer"
          : (!e.pool && i === 1) ? "subplaner" : (!e.pool && i === groesse - 1 && ei === 0) ? "betriebsrat" : "mitarbeiter",
        bereich: (!e.pool && (i === 0 || (i === groesse - 1 && ei === 0))) ? "ALLE" : e.id,
        rolleSeit: `${jahr - 2}-01-01`, status: "aktiv" });
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
    abweichungen: {}, anfragen: [], protokoll: [],
    freigaben: {},        // "JJJJ-MM" -> { stand, zeit, durch }
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
  };
}

function startbestand() {
  const j = new Date().getFullYear();
  const mandanten = [
    baueMandant({ name: "Nordwacht Sicherheitsdienste GmbH", branche: "sicherheit", einheitLabel: "Schichtgruppe",
      land: "HE", tarif: "pro", status: "aktiv", seit: `${j}-02-01`, kontakt: "leitung@nordwacht.de",
      anschrift: "Hafenstraße 14\n60327 Frankfurt am Main", domain: "nordwacht.de", vorlage: "v5",
      standorte: [{ name: "Leitstelle Frankfurt", land: "HE" }, { name: "Niederlassung Hannover", land: "NI" }],
      wochenstunden: 41, groesse: 15, ort: "Leitstelle", pool: 4, rufbereitschaft: true,
      qualifikationen: [["Sachkunde §34a", "SK"], ["Schichtleitung", "SL"], ["Ersthelfer", "EH"]],
      mindest: { F: { mo_do: 7, fr: 7, sa: 7, so: 7 }, S: { mo_do: 7, fr: 7, sa: 7, so: 7 }, N: { mo_do: 6, fr: 7, sa: 7, so: 6 } },
      mindestQual: { F: { q1: 5, q2: 1 }, S: { q1: 5, q2: 1 }, N: { q1: 4, q2: 1 } },
      posten: { name: "Objektwache Tag", ort: "Objekt Nord", start: "06:00", ende: "16:00", n: 4 } }, 4711),
    baueMandant({ name: "Seniorenzentrum Lindenhof", branche: "pflege", einheitLabel: "Wohnbereich",
      land: "NW", tarif: "pro", status: "aktiv", seit: `${j}-04-15`, kontakt: "leitung@lindenhof.de",
      anschrift: "Lindenallee 3\n44135 Dortmund", domain: "lindenhof.de", vorlage: "v4",
      wochenstunden: 38.5, groesse: 12, ort: "Haupthaus", pool: 3, pool: 3, teilzeit: [7, 8, 9],
      qualifikationen: [["Pflegefachkraft", "PFK"], ["Wohnbereichsleitung", "WBL"]],
      mindest: { F: { mo_do: 6, fr: 6, sa: 5, so: 5 }, S: { mo_do: 5, fr: 5, sa: 4, so: 4 }, N: { mo_do: 3, fr: 3, sa: 3, so: 3 } },
      mindestQual: { F: { q1: 3 }, S: { q1: 3 }, N: { q1: 2 } }, posten: null }, 1234),
    baueMandant({ name: "Steinbach Fertigung GmbH", branche: "produktion", einheitLabel: "Schichtgruppe",
      land: "BY", tarif: "basis", status: "test", seit: `${j}-07-10`, stichtag: `${j}-08-24`,
      kontakt: "personal@steinbach.de", anschrift: "Industriering 8\n86167 Augsburg", domain: "steinbach.de",
      vorlage: "v4", wochenstunden: 35, groesse: 10, ort: "Werk Ost", pool: 2, pool: 2, teilzeit: [6],
      qualifikationen: [["Anlagenführer", "AF"], ["Staplerschein", "STA"]],
      mindest: { F: { mo_do: 5, fr: 5, sa: 4, so: 3 }, S: { mo_do: 5, fr: 5, sa: 4, so: 3 }, N: { mo_do: 4, fr: 4, sa: 3, so: 3 } },
      mindestQual: { F: { q1: 2 }, S: { q1: 2 }, N: { q1: 2 } }, posten: null }, 9876),
  ];
  return { version: 5, stand: 0, tarife: JSON.parse(JSON.stringify(TARIFE_STD)), mandanten, rechnungen: [], protokoll: [],
    betreiber: { firma: "Schichtwerk Software", anschrift: "Musterweg 1\n64839 Münster", ustId: "DE000000000",
      iban: "DE00 0000 0000 0000 0000 00", steuersatz: 19, zahlungsziel: 14 },
    session: null };
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

/** Bundesland einer Einheit — Feiertage folgen dem Standort, nicht dem Mandanten. */
function landFuer(m, einheitId) {
  const e = (m.einheiten || []).find((x) => x.id === einheitId);
  const st = e && (m.standorte || []).find((x) => x.id === e.standortId);
  return (st && st.bundesland) || m.bundesland;
}
const landPerson = (m, p, d) => landFuer(m, einheitAm(p, d));

function einheitAm(p, d) { let t = null; for (const z of p.zugehoerigkeit) if (z.ab <= d) t = z; return t ? t.einheitId : null; }
function imDienst(p, d) { if (p.eintritt && d < p.eintritt) return false; if (p.austritt && d > p.austritt) return false; return p.status !== "gesperrt"; }
const aktive = (m, d) => memo(m, `akt|${d}`, () => m.personen.filter((p) => imDienst(p, d)));

function abwesenheitAm(m, pid, d) {
  const l = absIdx(m).get(pid); if (!l) return null;
  let best = null;
  for (const a of l) if (a.von <= d && a.bis >= d && (!best || abwArt(a.art).rang > abwArt(best.art).rang)) best = a;
  return best;
}
function einheitDienst(m, eid, d) {
  const e = m.einheiten.find((x) => x.id === eid); if (!e || e.pool) return null;
  const len = m.zyklus.wochen * 7;
  const i = (((between(m.anker, d) + e.versatz * 7) % len) + len) % len;
  const id = m.zyklus.tage[i];
  return id && id !== "-" ? id : null;
}
/** Positionen des Zyklus, an denen überhaupt Dienst ist. */
function dienstPositionen(m) {
  return memo(m, "dienstpos", () => {
    const out = [];
    m.zyklus.tage.forEach((t, i) => { if (t && t !== "-") out.push(i); });
    return out;
  });
}
/**
 * Beschäftigungsgrad einer Person, bezogen auf die vertragliche Vollzeit.
 * Teilzeitkräfte leisten nur einen entsprechenden Anteil der Zyklusdienste —
 * gleichmäßig verteilt und je Person versetzt, damit nicht alle am selben Tag fehlen.
 */
function grad(m, p) {
  const voll = m.einstellungen.sollWochenstunden || 40;
  return Math.max(0, Math.min(1, (p.wochenstunden || voll) / voll));
}
/** Dienst einer Teilzeitkraft: der Sollplan wird anteilig gedünnt. */
function teilzeitDienst(m, p, d, roh) {
  if (!roh) return null;
  return arbeitetAn(m, p, d, einheitAm(p, d)) ? roh : null;
}
function arbeitetAn(m, p, d, eid) {
  if (p.springer) return true;
  const f = grad(m, p);
  if (f >= 0.999) return true;
  const e = m.einheiten.find((x) => x.id === eid);
  if (!e || e.pool) return true;
  const len = m.zyklus.wochen * 7;
  const pos = dienstPositionen(m);
  if (!pos.length) return true;
  const roh = between(m.anker, d) + e.versatz * 7;
  const i = ((roh % len) + len) % len;
  const rang = pos.indexOf(i);
  if (rang < 0) return true;
  const zyklusNr = Math.floor((roh - i) / len);
  const g = zyklusNr * pos.length + rang + (p.teilzeitVersatz || 0);
  return Math.floor((g + 1) * f) > Math.floor(g * f);
}
function mindestFuer(m, da, d) {
  const w = dow(d);
  const wt = w === 6 ? da.mindest.so : w === 5 ? da.mindest.sa : w === 4 ? da.mindest.fr : da.mindest.mo_do;
  const land = da.standortId && m.standorte
    ? ((m.standorte.find((x) => x.id === da.standortId) || {}).bundesland || m.bundesland) : m.bundesland;
  return Math.max(wt, feiertag(d, land) ? da.mindest.so : 0);
}
/** Postenbesetzung: manuelle Zuweisungen zählen an, Pool bleibt stabil. */
function postenBesatzung(m, eid, d, pid) {
  const c = cache(m), k = `${eid}|${d}|${pid}`;
  if (c.posten.has(k)) return c.posten.get(k);
  const posten = m.dienstarten.find((x) => x.id === pid);
  const soll = posten ? mindestFuer(m, posten, d) : 0;
  const manuell = m.personen.filter((p) => imDienst(p, d) && m.abweichungen[`${p.id}|${d}`] === pid).map((p) => p.id);
  const rest = Math.max(0, soll - manuell.length);
  const out = new Set(manuell);
  if (rest === 0) { c.posten.set(k, out); return out; }
  const pool = m.personen.filter((p) => imDienst(p, d) && einheitAm(p, d) === eid && p.funktion !== "Schichtleitung")
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
  const roh = (eid && !p.springer) ? einheitDienst(m, eid, d) : null;
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
        const ist = e.personen.filter((p) => p.qualifikationen.includes(qid)).length;
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
    const len = m.zyklus.wochen * 7;
    const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
    let std = 0, dienste = 0;
    for (const id of m.zyklus.tage) if (id && id !== "-" && map[id]) { std += dauer(map[id]); dienste++; }
    const wochenstunden = Math.round(std / m.zyklus.wochen * 100) / 100;
    const deckung = [];
    for (let i = 0; i < len; i++) {
      const z = {};
      for (const e of m.einheiten) { const idx = (((i + e.versatz * 7) % len) + len) % len;
        const id = m.zyklus.tage[idx]; if (id && id !== "-") z[id] = (z[id] || 0) + 1; }
      deckung.push(z);
    }
    const luecken = m.dienstarten.filter((d) => !d.posten)
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
function preis(db, m) {
  const t = db.tarife.find((x) => x.id === m.tarif) || db.tarife[0];
  const z = zugaenge(m);
  const zahlend = ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (z[r.id] || 0), 0);
  const st = staffel(zahlend);
  const zeilen = ROLLEN.filter((r) => !r.extern).map((r) => {
    const anzahl = z[r.id] || 0, einzel = t.preis[r.id] || 0;
    return { rolle: r, anzahl, einzel, netto: anzahl * einzel * (1 - st.rabatt) };
  });
  const summeZugaenge = zeilen.reduce((a, l) => a + l.netto, 0);
  const grund = t.grund * (1 - (m.rabattGrund || 0));
  const gesamt = grund + summeZugaenge;
  const zahlt = stat(m.status).zahlt;
  return { t, z, zahlend, st, zeilen, grund, summeZugaenge, gesamt, zahlt, wirksam: zahlt ? gesamt : 0,
    jeKopf: zahlend ? gesamt / zahlend : 0,
    ueberEinheiten: m.einheiten.length > t.grenzen.einheiten, ueberPersonen: zahlend > t.grenzen.personen };
}
/** Datenschutz: die Betreibersicht enthält ausschließlich Zahlen. */
function betreiberSicht(db, m) {
  const p = preis(db, m);
  return { id: m.id, name: m.name, branche: m.branche, status: m.status, seit: m.seit, stichtag: m.stichtag,
    kontakt: m.kontakt, anschrift: m.anschrift, tarif: m.tarif, rabattGrund: m.rabattGrund,
    einheiten: m.einheiten.length, dienstarten: m.dienstarten.length, preis: p,
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
  const positionen = [{ text: `Grundgebühr Tarif ${p.t.name}`, menge: "", einzel: "", betrag: eur(p.grund) }];
  for (const l of p.zeilen) {
    if (!l.anzahl) continue;
    const anteilig = Math.abs(l.anzahl - l.ganz) > 0.005;
    positionen.push({ text: `Zugang ${l.rolle.label}${anteilig ? " (anteilig)" : ""}`,
      menge: anteilig ? n2(l.anzahl) : zahl(l.ganz),
      einzel: l.einzel === 0 ? "inklusive" : eur(l.einzel), betrag: eur(l.netto) });
  }
  if (p.st.rabatt > 0) positionen.push({ text: `Mengenstaffel ${p.st.label} Zugänge`, menge: "", einzel: "", betrag: `−${Math.round(p.st.rabatt * 100)} %` });
  const netto = p.gesamt;
  const steuer = Math.round(netto * db.betreiber.steuersatz) / 100;
  return { nummer: nr, datum: heute(), faellig: addDays(heute(), db.betreiber.zahlungsziel),
    zeitraum: `${MON[Number(monatISO.slice(5, 7)) - 1]} ${monatISO.slice(0, 4)}`,
    mandantId: m.id, mandant: m.name, anschrift: m.anschrift, betreiber: db.betreiber,
    positionen, netto, rabattBetrag: 0, rabattText: "", steuersatz: db.betreiber.steuersatz,
    steuer, brutto: Math.round((netto + steuer) * 100) / 100,
    zugaenge: p.zahlendStichtag, zugaengeAnteilig: p.zahlendAnteilig, tarif: p.t.name };
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
    const passendeQuals = fehlendeQuals.filter((q) => p.qualifikationen.includes(q));
    const gruende = [];
    let punkte = 0;
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
  const t = db.tarife.find((x) => x.id === m.tarif) || db.tarife[0];
  const z = zugaengeAnteilig(m, ym);
  const stichtag = zugaenge(m);
  const zahlendStichtag = ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (stichtag[r.id] || 0), 0);
  const st = staffel(zahlendStichtag);
  const zeilen = ROLLEN.filter((r) => !r.extern).map((r) => {
    const anzahl = z[r.id] || 0, einzel = t.preis[r.id] || 0;
    return { rolle: r, anzahl: Math.round(anzahl * 100) / 100, ganz: stichtag[r.id] || 0,
      einzel, netto: Math.round(anzahl * einzel * (1 - st.rabatt) * 100) / 100 };
  });
  const summeZugaenge = Math.round(zeilen.reduce((a, l) => a + l.netto, 0) * 100) / 100;
  const grund = t.grund * (1 - (m.rabattGrund || 0));
  const gesamt = Math.round((grund + summeZugaenge) * 100) / 100;
  return { t, z, st, zeilen, grund, summeZugaenge, gesamt, zahlendStichtag,
    zahlendAnteilig: Math.round(ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (z[r.id] || 0), 0) * 100) / 100,
    zahlt: stat(m.status).zahlt };
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
const db=startbestand(); const m=db.mandanten[0]; const ym=heute().slice(0,7);
console.log("Standorte:", m.standorte.map(s=>`${s.name} (${s.bundesland})`).join(", "));
console.log("Einheiten:", m.einheiten.map(e=>`${e.name}${e.pool?" [Pool]":""}`).join(", "));
console.log("Springer:", m.personen.filter(p=>p.springer).length, "| Teilzeit:", m.personen.filter(p=>grad(m,p)<0.999).length);
const tz=m.personen.filter(p=>grad(m,p)<0.999 && !p.springer);
for (const p of tz.slice(0,3)) {
  let n=0; for(let i=0;i<35;i++) if(personTag(m,p,addDays(`${ym}-01`,i)).dienstId) n++;
  const ist=istStunden(m,p,ym), sl=sollStunden(m,p,ym);
  console.log(`   ${p.nachname} ${p.wochenstunden}h (${Math.round(grad(m,p)*100)}%): ${n} Dienste/35 Tage · Ist ${n1(ist.gesamt)} vs Soll ${n1(sl)} → ${sgn(ist.gesamt-sl)} h`);
}
const voll=m.personen.find(p=>grad(m,p)>=0.999&&!p.springer);
let nv=0; for(let i=0;i<35;i++) if(personTag(m,voll,addDays(`${ym}-01`,i)).dienstId) nv++;
console.log(`   Vollzeit-Vergleich ${voll.nachname}: ${nv} Dienste/35 Tage`);
const sp=m.personen.find(p=>p.springer);
let ns=0; for(let i=0;i<35;i++) if(personTag(m,sp,addDays(`${ym}-01`,i)).dienstId) ns++;
console.log(`   Springer ${sp.nachname}: ${ns} Sollplan-Dienste (soll 0 sein)`);
console.log("Besetzung heute:", Object.entries(besetzung(m,heute())).map(([k,v])=>`${k}:${v.anzahl}/${v.soll}`).join("  "));
console.log("Befunde:", pruefen(m,`${ym}-01`,`${ym}-28`).length);
const e2=m.einheiten.find(e=>landFuer(m,e.id)!=="HE");
console.log("Zweiter Standort:", e2? `${e2.name} → ${landFuer(m,e2.id)}` : "keiner");
