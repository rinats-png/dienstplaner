/* Datums-Hilfen der Oberfläche (aus src/App.jsx herausgelöst, WP-39; unverändert). */
import { pISO, dow } from "../regelwerk.js";

export { DOW } from "../../server/lib/engine/textformat.mjs";
import { DOW } from "../../server/lib/engine/textformat.mjs";
/* Ausgeschrieben für die Tagesliste auf dem Telefon — dort ist Platz,
   und „Donnerstag" liest sich im Dienst schneller als „Do". */
export const DOW_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const MON = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
export { heute } from "../../server/lib/engine/zeit.mjs";
export const fLang = (s) => { const d = pISO(s); return `${DOW[dow(s)]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; };
export { fKurz } from "../../server/lib/engine/textformat.mjs";
export const fDatum = (s) => (s ? s.split("-").reverse().join(".") : "—");
export const zeitpunktText = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime())
  ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–"; };
