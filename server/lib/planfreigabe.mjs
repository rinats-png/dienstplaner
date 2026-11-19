/* ==========================================================================
   PLANFREIGABE UND ENTWÜRFE (WP-23)

   Ein Monatsplan ist ein Entwurf, bis die Planung ihn freigibt
   (m.freigaben[JJJJ-MM]). Beschäftigte bekommen die Einteilungen eines
   Entwurfs nicht (server/lib/sicht.mjs). Diese Datei ist die EINE Stelle,
   die entscheidet,

   - ob der Betrieb die Freigabe benutzt (planFreigabeAktiv),
   - welcher Tag ein Entwurfstag ist (istEntwurfstag).

   Server (sicht.mjs) und Oberfläche (src/App.jsx) rechnen mit denselben
   Funktionen. Rein, einzige Abhängigkeit ist die ebenso reine Zeitbasis
   betriebszeit.mjs — damit die Oberfläche sie einbinden kann.

   Übergang für bestehende Betriebe: Ein Betrieb, der noch nie einen Monat
   freigegeben hat und die Pflicht nicht eingeschaltet hat, behält das alte
   Verhalten — Beschäftigte sehen den ganzen Plan. Sonst verschwände mit dem
   Ausrollen von heute auf morgen der Einsatz aller Beschäftigten (und die
   Oberfläche rechnete stattdessen die Schichtfolge). Neue Betriebe
   (Selbststart, Erstbefüllung, Testräume, Betrieb anlegen) starten mit
   `einstellungen.planFreigabePflicht: true`. Die Leitung bekommt in den
   Aufgaben den Hinweis „Planfreigabe aktivieren", solange der Filter aus ist.
   ========================================================================== */
import { betriebstag, wanduhr } from "./betriebszeit.mjs";

const MONAT_FORM = /^\d{4}-\d{2}$/;
const TAG_FORM = /^\d{4}-\d{2}-\d{2}$/;
const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Heute (JJJJ-MM-TT) in Berlin — zentrale Zeitbasis betriebszeit.mjs (WP-ZEIT). */
export function laufenderTag(jetzt = new Date()) {
  return betriebstag(jetzt);
}

/**
 * Sekunden bis zum nächsten Tageswechsel in Berlin (Mitternacht), gerechnet als 86400 minus Wanduhr-Sekunden des
 * Tages (am Umstellungstag also nicht die wirkliche Dauer — unverändert). Die Sekunde der Berliner Wanduhr ist die
 * UTC-Sekunde: Der Versatz zu UTC ist seit 1893 eine ganze Zahl von Minuten.
 */
export function sekundenBisTageswechsel(jetzt = new Date()) {
  const [h, min] = wanduhr(jetzt).split(":").map(Number);
  return 86400 - (h * 3600 + min * 60 + new Date(jetzt).getUTCSeconds());
}

/** Kalendertag JJJJ-MM-TT um n Tage versetzt (reine Kalenderrechnung, ohne Zeitzone). */
export function tagVersetzt(tag, n) {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Die freigegebenen Monate eines Betriebs (m.freigaben, Schlüssel JJJJ-MM). */
export function freigegebeneMonate(m) {
  const f = m && istObj(m.freigaben) ? m.freigaben : {};
  return new Set(Object.keys(f).filter((k) => MONAT_FORM.test(k) && f[k]));
}

/** Hat die Leitung die Planfreigabe ausdrücklich zur Pflicht gemacht? */
export const planFreigabePflicht = (m) => !!(m && istObj(m.einstellungen) && m.einstellungen.planFreigabePflicht === true);

/**
 * Wirkt für diesen Betrieb der Entwurfsfilter? Wenn er die Freigabe benutzt
 * (mindestens ein freigegebener Monat) oder die Pflicht eingeschaltet ist.
 */
export const planFreigabeAktiv = (m) => planFreigabePflicht(m) || freigegebeneMonate(m).size > 0;

/**
 * Ist dieser Tag ein Entwurfstag — liegt er nach heute und gehört zu einem
 * nicht freigegebenen Monat? Was heute oder früher liegt, ist in Kraft. Ein
 * ungültiger Tag gilt als Entwurf (fail-closed). Ohne aktive Freigabe ist
 * nichts ein Entwurf.
 * @param {any} m  der Betrieb
 * @param {string} tag  JJJJ-MM-TT
 * @param {string} [heute]  JJJJ-MM-TT, Vorgabe: heute in Berlin
 */
export function istEntwurfstag(m, tag, heute = laufenderTag()) {
  if (!planFreigabeAktiv(m)) return false;
  if (typeof tag !== "string" || !TAG_FORM.test(tag)) return true;
  if (tag <= heute) return false;
  return !freigegebeneMonate(m).has(tag.slice(0, 7));
}
