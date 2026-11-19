/* ==========================================================================
   GESETZLICHE FEIERTAGE ALLER BUNDESLÄNDER

   Stand bis WP-16 nur in src/App.jsx. Der Server braucht sie seit dem
   Einfrieren des Ist beim Monatsabschluss (Review WP-16, H1): Die Besetzung
   der Posten hängt an der Mindestbesetzung, und die steigt an Feiertagen
   (mindestFuer). Eine Fassung für Oberfläche und Server.
   ========================================================================== */
import { iso, dow, addDays } from "./schutzpruefung.mjs";

export function ostern(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(y, mo - 1, da));
}
function bubettag(y) { let d = `${y}-11-22`; while (dow(d) !== 2) d = addDays(d, -1); return d; }
const fCache = {};
/** Alle Feiertage eines Jahres in einem Land: { "JJJJ-MM-TT": Name }. */
export function feiertage(y, land) {
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
/** Der Feiertag eines Tages in einem Land — oder null. */
export const feiertag = (d, land) => feiertage(Number(d.slice(0, 4)), land)[d] || null;
