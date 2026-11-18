/* ==========================================================================
   BETRIEBSZEIT — der betriebliche Kalendertag (WP-ZEIT, Teilpaket ZEIT-A)

   Vertrag: docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md, § 1 und § 10.

   Vier Zeitbegriffe, streng getrennt:
   - Ereigniszeitpunkt: eindeutiger UTC-Zeitpunkt (ISO bzw. Date).
   - Eingangszeitpunkt: Serveruhr beim Eintreffen einer Anfrage (getrennt
     gespeichert, nie mit dem Ereigniszeitpunkt gleichgesetzt).
   - Betrieblicher Kalendertag: Kalenderdatum eines Zeitpunkts in der
     Betriebszeitzone — diese Datei.
   - Zugeordneter Schichttag: der Diensttag, zu dem ein Stempel gehört
     (stempelZiel in zeiterfassung.mjs; Nachtdienst 22–06 → Tag des Beginns).

   Hier steht nur der Kalendertag und die Wanduhrzeit eines Zeitpunkts in
   einer Zone — ohne Gerätezeitzone und ohne Prozesszeitzone. Die Rechnung
   nutzt ausschließlich Intl (keine Abhängigkeit) und läuft im Browser wie
   auf dem Server gleich.

   Betreiberentscheidung 2026-11-14 (E1): in Release 1 ist nur Europe/Berlin
   zugelassen. Die Funktionen nehmen die Zone als Parameter, damit ein
   späterer versionierter Zonenverlauf (ZEIT-B) sie durchreichen kann; eine
   Zone außerhalb der Positivliste wird abgewiesen (fail-closed), nie still
   auf Berlin umgedeutet. Die Gerätezeitzone wird weder gelesen noch
   gespeichert (E8).
   ========================================================================== */

/** Betriebszeitzone, solange es keinen Zonenverlauf gibt (implizite Version 1, Vertrag § 4.1). */
export const BETRIEBSZONE = "Europe/Berlin";

/** Positivliste (E1, Release 1): nur Europe/Berlin. */
export const ERLAUBTE_ZONEN = Object.freeze([BETRIEBSZONE]);

const ZONE_FORM = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/;

/** Ist `zone` eine zugelassene Betriebszeitzone (Form, Positivliste, von Intl angenommen)? */
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

/**
 * Betrieblicher Kalendertag „JJJJ-MM-TT" des Zeitpunkts `jetzt` in der Zone —
 * unabhängig von der Zeitzone des Geräts oder des Serverprozesses.
 * @param {Date|number|string} [jetzt] @param {string} [zone] @returns {string}
 */
export function betriebstag(jetzt = new Date(), zone = BETRIEBSZONE) {
  const t = teile(jetzt, zone);
  return `${t.year}-${t.month}-${t.day}`;
}

/**
 * Wanduhrzeit „HH:MM" (Minuten abgeschnitten) des Zeitpunkts in der Zone.
 * In der Herbstnacht mehrdeutig — eindeutig ist nur der Zeitpunkt selbst.
 * @param {Date|number|string} [jetzt] @param {string} [zone] @returns {string}
 */
export function wanduhr(jetzt = new Date(), zone = BETRIEBSZONE) {
  const t = teile(jetzt, zone);
  return `${t.hour}:${t.minute}`;
}

/**
 * Montag der Woche, in die der betriebliche Kalendertag von `jetzt` fällt
 * („JJJJ-MM-TT"). Reine Datumsrechnung auf dem Kalendertag.
 * @param {Date|number|string} [jetzt] @param {string} [zone] @returns {string}
 */
export function montagDerWoche(jetzt = new Date(), zone = BETRIEBSZONE) {
  const d = new Date(`${betriebstag(jetzt, zone)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const KALENDERTAG_FORM = /^\d{4}-\d{2}-\d{2}$/;

/** Fehlercode, wenn ein Kalendertag nicht existiert (P2-12, Variante B: nie still gerollt oder korrigiert). */
export const UNGUELTIGER_KALENDERTAG = "UNGUELTIGER_KALENDERTAG";

/**
 * Gibt es den Kalendertag „JJJJ-MM-TT" wirklich? Dieselbe Regel wie paketstand.tagGueltig: Form, Jahr 2000–2999,
 * Monat 1–12, Tag 1 bis Monatsende (Schaltjahre nach dem gregorianischen Kalender). „2026-02-30" oder „2026-13-01"
 * gibt es nicht — sie werden abgewiesen, nie auf einen anderen Tag gerollt (P2-12, Betreiberentscheidung 2026-11-18).
 * @param {unknown} s @returns {boolean}
 */
export function kalendertagEcht(s) {
  if (typeof s !== "string" || !KALENDERTAG_FORM.test(s)) return false;
  /* Ziffern direkt aus der (durch KALENDERTAG_FORM gesicherten) Form — ohne split/Date (Laufzeit, WP-48.7 Rest). */
  const j = (s.charCodeAt(0) - 48) * 1000 + (s.charCodeAt(1) - 48) * 100 + (s.charCodeAt(2) - 48) * 10 + (s.charCodeAt(3) - 48);
  const m = (s.charCodeAt(5) - 48) * 10 + (s.charCodeAt(6) - 48);
  const t = (s.charCodeAt(8) - 48) * 10 + (s.charCodeAt(9) - 48);
  if (j < 2000 || j > 2999 || m < 1 || m > 12 || t < 1) return false;
  return t <= tageImMonat(j, m);
}

/** Tage des Monats `m` (1–12) im Jahr `j` nach dem gregorianischen Kalender (wie Date.UTC(j, m, 0) für j ≥ 100). */
function tageImMonat(j, m) {
  if (m === 2) return (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/* --------------------------------------------------------------------------
   Schnellweg Europe/Berlin (Laufzeit, WP-48.7 Rest)

   Der Versatz zur UTC (Minuten) an einem Zeitpunkt kam je Aufruf aus Intl.formatToParts (~5 µs bis 30 µs je
   Aufruf; der Monatsabschluss bei 400 Personen × 36 Monaten ruft das hunderttausendfach). Für Europe/Berlin und
   die Jahre 2000–2999 gilt die EU-Regel: Sommerzeit (+120) ab dem letzten Märzsonntag 01:00 UTC, Winterzeit (+60)
   ab dem letzten Oktobersonntag 01:00 UTC. Je Jahr wird diese Tabelle einmal, lazy, gebaut und GEGEN Intl
   GEPRÜFT (an den Umstellungskanten je eine Minute davor und danach, an jedem Monatsersten und am Jahresende);
   stimmt ein Punkt nicht, rechnet das Jahr weiter vollständig über Intl. Der Schnellweg gilt nur für ganze
   Minuten (dort ist der gerundete Intl-Versatz exakt der Zonenversatz); alles andere — Bruchteile, NaN,
   Jahre außerhalb 2000–2999, andere Zonen — geht den bisherigen Intl-Weg (auch mit denselben Fehlern).
   -------------------------------------------------------------------------- */
const MINUTE = 60000;
const TAG_MS = 86400000;
/** Jahr → { m, o } (Umstellungszeitpunkte ms UTC) oder null (Tabelle widerspricht Intl: Intl-Weg). */
const BERLIN_JAHRE = new Map();

/** ms (UTC, 00:00) des letzten Sonntags im Monat `monat` (1–12) des Jahres `j` — ohne Date-Objekt. */
function letzterSonntagUtc(j, monat) {
  const t = Date.UTC(j, monat, 0);
  const wochentag = ((Math.floor(t / TAG_MS) + 4) % 7 + 7) % 7;   // 1970-01-01 war ein Donnerstag (4)
  return t - wochentag * TAG_MS;
}

function berlinJahr(j) {
  let e = BERLIN_JAHRE.get(j);
  if (e !== undefined) return e;
  const m = letzterSonntagUtc(j, 3) + 3600000;
  const o = letzterSonntagUtc(j, 10) + 3600000;
  const proben = [[m - MINUTE, 60], [m, 120], [o - MINUTE, 120], [o, 60], [Date.UTC(j + 1, 0, 1) - MINUTE, 60]];
  for (let mo = 0; mo < 12; mo++) {
    const t = Date.UTC(j, mo, 1);
    proben.push([t, t < m || t >= o ? 60 : 120]);
  }
  e = proben.every(([ms, v]) => versatzIntl(ms, BETRIEBSZONE) === v) ? { m, o } : null;
  BERLIN_JAHRE.set(j, e);
  return e;
}

/** Versatz (Minuten) eines ganzminütigen Zeitpunkts in Europe/Berlin aus der geprüften Jahrestabelle, sonst undefined. */
function berlinVersatzSchnell(ms) {
  let j = Math.floor(ms / 31556952000) + 1970;
  if (ms < Date.UTC(j, 0, 1)) j--;
  else if (ms >= Date.UTC(j + 1, 0, 1)) j++;
  if (j < 2000 || j > 2999) return undefined;
  const e = berlinJahr(j);
  if (e === null) return undefined;
  return ms < e.m || ms >= e.o ? 60 : 120;
}

/** Der bisherige Versatz über Intl (wörtlich die frühere innere Hilfe von zeitpunktAusWanduhr). */
function versatzIntl(ms, zone) {
  const p = teile(ms, zone);
  return Math.round((Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - ms) / 60000);
}

function versatzMinuten(ms, zone) {
  if (zone === BETRIEBSZONE && ms % MINUTE === 0) {
    const v = berlinVersatzSchnell(ms);
    if (v !== undefined) return v;
  }
  return versatzIntl(ms, zone);
}

/**
 * Der wirkliche Zeitpunkt (ms seit 1970, UTC) einer Wanduhrzeit in der Zone: Kalendertag `datum` (JJJJ-MM-TT) plus
 * `minuten` (auch über 1440 hinaus, dann Folgetag). Umkehrung von betriebstag/wanduhr, unabhängig von der Zeitzone
 * des Prozesses. Mehrdeutige Wanduhrzeiten fest aufgelöst: Die Frühjahrslücke (02:00–02:59 gibt es nicht) wird nach
 * vorn geschoben (Versatz vor dem Sprung, 02:30 → 03:30 Sommerzeit), die doppelte Herbststunde ist die spätere
 * (Winterzeit). Mitternachten sind in Europe/Berlin immer eindeutig.
 * Einen Kalendertag, den es nicht gibt (kalendertagEcht), rollt sie nicht still auf einen anderen Tag, sondern wirft
 * RangeError("UNGUELTIGER_KALENDERTAG") (P2-12, Variante B). Wer keinen Wurf will: zeitpunktAusWanduhrErgebnis.
 * @param {string} datum @param {number} minuten @param {string} [zone] @returns {number}
 */
export function zeitpunktAusWanduhr(datum, minuten, zone = BETRIEBSZONE) {
  if (!kalendertagEcht(datum)) throw new RangeError(UNGUELTIGER_KALENDERTAG);
  /* kalendertagEcht sichert die Form JJJJ-MM-TT (nur ASCII-Ziffern): Tag direkt aus den Zeichen, ohne split. */
  const j = (datum.charCodeAt(0) - 48) * 1000 + (datum.charCodeAt(1) - 48) * 100 + (datum.charCodeAt(2) - 48) * 10 + (datum.charCodeAt(3) - 48);
  const wand = Date.UTC(j, (datum.charCodeAt(5) - 48) * 10 + (datum.charCodeAt(6) - 48) - 1,
    (datum.charCodeAt(8) - 48) * 10 + (datum.charCodeAt(9) - 48)) + minuten * 60000;
  /* Kandidaten 60 und 120 in dieser Reihenfolge geprüft (wie früher [60, 120].filter); genau einer passt → der,
     sonst 60. versatzMinuten ist für jeden Zeitpunkt gleich dem früheren Intl-Versatz (Differenzialtest
     pruefungen/zeit-schnellweg.test.js). */
  const p60 = versatzMinuten(wand - 60 * 60000, zone) === 60;
  const p120 = versatzMinuten(wand - 120 * 60000, zone) === 120;
  const v = p60 && !p120 ? 60 : p120 && !p60 ? 120 : 60;
  return wand - v * 60000;
}

/**
 * Wie zeitpunktAusWanduhr, aber ohne Wurf bei einem Kalendertag, den es nicht gibt: { ok: true, ms } oder
 * { ok: false, grund: "UNGUELTIGER_KALENDERTAG", datum }. Andere Fehler (Zone nicht zugelassen) werfen wie bisher.
 * @param {string} datum @param {number} minuten @param {string} [zone]
 * @returns {{ok: true, ms: number} | {ok: false, grund: string, datum: unknown}}
 */
export function zeitpunktAusWanduhrErgebnis(datum, minuten, zone = BETRIEBSZONE) {
  if (!kalendertagEcht(datum)) return { ok: false, grund: UNGUELTIGER_KALENDERTAG, datum };
  return { ok: true, ms: zeitpunktAusWanduhr(datum, minuten, zone) };
}
