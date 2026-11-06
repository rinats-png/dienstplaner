/* Datums-Hilfen der Oberfläche (aus src/App.jsx herausgelöst, WP-39; unverändert). */
import { pad, iso, pISO, dow } from "../regelwerk.js";

export const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
/* Ausgeschrieben für die Tagesliste auf dem Telefon — dort ist Platz,
   und „Donnerstag" liest sich im Dienst schneller als „Do". */
export const DOW_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const MON = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
export const heute = () => iso(new Date());
export const fLang = (s) => { const d = pISO(s); return `${DOW[dow(s)]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; };
export const fKurz = (s) => (s ? `${pad(pISO(s).getDate())}.${pad(pISO(s).getMonth() + 1)}.` : "—");
export const fDatum = (s) => (s ? s.split("-").reverse().join(".") : "—");
export const zeitpunktText = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime())
  ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–"; };
