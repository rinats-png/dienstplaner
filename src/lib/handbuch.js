/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { heute, fLang } from "./datum.js";
import { kann } from "./fachlogik.js";


/* ==========================================================================
   HANDBUCH
   Ein durchgehender Weg von der leeren Anwendung bis zum laufenden Betrieb —
   und danach ein Nachschlagewerk für jede Einzelfrage.

   Geschrieben für jemanden, der zum ersten Mal davorsitzt. Jeder Schritt
   nennt: was zu tun ist, warum es nötig ist, und woran man merkt, dass es
   geklappt hat. Die letzte Angabe fehlt in den meisten Anleitungen und ist
   die wichtigste.
   ========================================================================== */

/* Der Inhalt liegt in src/handbuch-inhalt.js und wird erst geholt, wenn
   jemand ihn braucht — siehe dort. */
export let _handbuch = null;
export let _handbuchLaeuft = null;

/** Holt den Handbuchinhalt. Mehrfache Aufrufe teilen sich ein Versprechen. */
export function handbuchLaden() {
  if (_handbuch) return Promise.resolve(_handbuch);
  if (!_handbuchLaeuft) {
    _handbuchLaeuft = import("../handbuch-inhalt.js")
      .then((mod) => { _handbuch = mod.HANDBUCH; return _handbuch; })
      .catch((e) => { _handbuchLaeuft = null; throw e; });
  }
  return _handbuchLaeuft;
}

/** Welche Kapitel gelten für diesen Betrieb? */
export const handbuchKapitel = (alle, m) => (alle || []).filter((k) =>
  !k.merkmale || !m || k.merkmale.some((x) => kann(m, x)));


/** Alle Abschnitte flach, für die Suche. */
/** Alle Abschnitte flach, für die Suche. */
export const handbuchAbschnitte = (alle, m) => handbuchKapitel(alle, m)
  .flatMap((k) => k.abschnitte.map((a) => ({ ...a, kapitel: k.titel, kapitelId: k.id, ziel: k.ziel })));

/** Handbuch als druckbare Seite — zum Mitgeben nach der Einrichtung. */
export function handbuchDruck(m, alle) {
  const kapitel = handbuchKapitel(alle, m);
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
