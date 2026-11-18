/* ==========================================================================
   ZEIT-SCHNELLWEG — REFERENZ „ALT“ FÜR DEN DIFFERENZIALTEST

   Wörtliche Kopie der Zeitrechnung vor dem Schnellweg (integration/release-v4
   @ 1163c54f): server/lib/betriebszeit.mjs (zoneErlaubt, teileIn, zeitpunkt,
   teile, kalendertagEcht, zeitpunktAusWanduhr) und server/lib/regelwerk.mjs
   (letzterSonntag, uhrsprung, uhrversatz). Nur der Kopf (Importe, Konstanten)
   ist ergänzt. pruefungen/zeit-schnellweg.test.js vergleicht damit die neuen
   Fassungen. Nicht ändern — sonst vergleicht der Test nicht mehr mit dem
   bisherigen Weg.
   ========================================================================== */
import { iso, addDays } from "../../server/lib/schutzpruefung.mjs";

export const BETRIEBSZONE = "Europe/Berlin";
export const ERLAUBTE_ZONEN = Object.freeze([BETRIEBSZONE]);
const ZONE_FORM = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/;
export const UNGUELTIGER_KALENDERTAG = "UNGUELTIGER_KALENDERTAG";

/* ---- server/lib/betriebszeit.mjs (alt) ---------------------------------- */
export function zoneErlaubt(zone) {
  if (typeof zone !== "string" || zone.length > 64 || !ZONE_FORM.test(zone)) return false;
  if (!ERLAUBTE_ZONEN.includes(zone)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

const formate = new Map();
function teileIn(zone) {
  let f = formate.get(zone);
  if (!f) {
    if (!zoneErlaubt(zone)) throw new RangeError(`Zeitzone nicht zugelassen: ${String(zone)}`);
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formate.set(zone, f);
  }
  return f;
}

function zeitpunkt(jetzt) {
  const d = jetzt instanceof Date ? jetzt : new Date(jetzt);
  if (!Number.isFinite(d.getTime())) throw new RangeError("Ungültiger Zeitpunkt.");
  return d;
}

function teile(jetzt, zone) {
  return Object.fromEntries(teileIn(zone).formatToParts(zeitpunkt(jetzt)).map((x) => [x.type, x.value]));
}

const KALENDERTAG_FORM = /^\d{4}-\d{2}-\d{2}$/;

export function kalendertagEcht(s) {
  if (typeof s !== "string" || !KALENDERTAG_FORM.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  if (j < 2000 || j > 2999 || m < 1 || m > 12 || t < 1) return false;
  return t <= new Date(Date.UTC(j, m, 0)).getUTCDate();
}

export function zeitpunktAusWanduhr(datum, minuten, zone = BETRIEBSZONE) {
  if (!kalendertagEcht(datum)) throw new RangeError(UNGUELTIGER_KALENDERTAG);
  const [j, mo, t] = String(datum).split("-").map(Number);
  const wand = Date.UTC(j, mo - 1, t) + minuten * 60000;
  const versatz = (ms) => {
    const p = teile(ms, zone);
    return Math.round((Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - ms) / 60000);
  };
  const passend = [60, 120].filter((v) => versatz(wand - v * 60000) === v);
  const v = passend.length === 1 ? passend[0] : 60;
  return wand - v * 60000;
}

/* ---- server/lib/regelwerk.mjs (alt) ------------------------------------- */
/** Der letzte Sonntag eines Monats, als ISO-Tag. */
export function letzterSonntag(jahr, monat) {
  const d = new Date(jahr, monat, 0);              // letzter Tag des Monats
  d.setDate(d.getDate() - ((d.getDay() + 7) % 7)); // zurück auf Sonntag
  return iso(d);
}

export function uhrsprung(datum) {
  const jahr = Number(String(datum).slice(0, 4));
  if (datum === letzterSonntag(jahr, 3)) return -60;
  if (datum === letzterSonntag(jahr, 10)) return 60;
  return 0;
}

export function uhrversatz(von, bis) {
  if (!(bis > von)) return 0;
  let summe = 0;
  const ersterTag = Math.floor(von / 1440);
  const letzterTag = Math.floor((bis - 1) / 1440);
  for (let t = ersterTag; t <= letzterTag; t++) {
    const tag = addDays("2000-01-01", t);
    const sprung = uhrsprung(tag);
    if (!sprung) continue;
    const punkt = t * 1440 + 120;
    if (punkt > von && punkt < bis) summe += sprung;
  }
  return summe;
}
