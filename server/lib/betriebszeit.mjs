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
