/* ==========================================================================
   STEMPELN IN DER OBERFLÄCHE — Positionsabfrage, offener Vorgang, Befund

   Rein und ohne React, damit es sich prüfen lässt. Das Urteil selbst fällt
   der Server (server/lib/geo.mjs); hier wird nur entschieden, ob überhaupt
   gemessen wird, welcher Tag gestempelt wird und wie ein gespeicherter
   Befund angezeigt wird.
   ========================================================================== */
import { addDays } from "./regelwerk.js";
import { entfernungText, geoAktiv, INNERHALB, AUSSERHALB } from "../server/lib/geo.mjs";
import { startZuordenbar } from "../server/lib/zeiterfassung.mjs";

/** Eine frische, möglichst genaue Messung je Stempelereignis (Geo-Spezifikation B4). */
export const POSITION_OPTIONEN = Object.freeze({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });

/** Ist die Geo-Prüfung im Betrieb eingeschaltet? Dieselbe Regel wie auf dem Server (geo.mjs). */
export const geoPruefungAn = geoAktiv;

/**
 * Position für ein Stempelereignis holen — nur, wenn die Prüfung an ist.
 * Bei „aus", fehlender Schnittstelle oder Ablehnung: fertig(null). Die
 * Stempelung hängt nie davon ab.
 */
export function positionHolen(aktiv, fertig, geolocation = (typeof navigator !== "undefined" ? navigator.geolocation : null)) {
  if (!aktiv || !geolocation) return fertig(null);
  geolocation.getCurrentPosition(
    (pos) => fertig({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
    () => fertig(null), POSITION_OPTIONEN);
}

/**
 * Welcher Vorgang wird gestempelt? Ein offener Beginn von gestern (Dienst
 * über Mitternacht) geht vor: Dann heißt es „Ausstempeln" für gestern, nicht
 * „Einstempeln" für heute. Der Server lässt genau das zu
 * (stempelDatumPruefen: gestern, Ende, offener Beginn).
 *
 * Aber nur, solange der Beginn höchstens 20 Stunden zurückliegt — dieselbe
 * Grenze wie auf dem Server (startZuordenbar). Ein älterer offener Beginn
 * ist ein vergessenes Ausstempeln; dann wird heute neu eingestempelt, und
 * der alte Vorgang bleibt offen für die Korrektur.
 *
 * `offen`: Beginn ohne Ende — unabhängig davon, ob für den Tag (noch) ein
 * Dienst geplant ist; ein offener Beginn muss beendbar bleiben, auch wenn
 * der Dienst nach dem Einstempeln aus dem Plan genommen wurde.
 * `veraltet`: offen, aber nach derselben 20-Stunden-Grenze wie auf dem Server
 * nicht mehr zuordenbar — ein Ende dazu speichert der Server mit
 * START_VERALTET, ohne Erfassung. Das ist kein normaler Abschluss.
 */
export function stempelVorgang(m, p, heute, jetzt = new Date()) {
  const tab = (m && m.einstempeln) || {};
  const gestern = addDays(heute, -1);
  const vom = p ? tab[`${p.id}|${gestern}`] : null;
  if (vom && vom.start && !vom.ende && startZuordenbar(gestern, vom.start, jetzt, vom.startAm))
    return { datum: gestern, st: vom, vortag: true, offen: true, veraltet: false };
  const st = p ? tab[`${p.id}|${heute}`] || null : null;
  const offen = !!st && !!st.start && !st.ende;
  return { datum: heute, st, vortag: false, offen, veraltet: offen && !startZuordenbar(heute, st.start, jetzt, st.startAm) };
}

/** Ein offener Beginn, zu dem kein Ende mehr automatisch passt (für die Anzeige der Leitung). */
export const endeFehlt = (datum, e, jetzt = new Date()) =>
  !!e && !!e.start && !e.ende && !startZuordenbar(datum, e.start, jetzt, e.startAm);

export const MARKIERUNG_TEXT = Object.freeze({
  START_FEHLT: "Start fehlt",
  START_VERALTET: "Beginn über 20 Stunden alt — nicht zugeordnet",
  ENDE_FEHLT: "Ende fehlt",
  UNGEPLANTER_DIENST: "ohne geplanten Dienst",
});

/* Kennung für „bestätigt“. Als Escape geschrieben: Die Oberfläche zeigt sie
   als Icon (App.jsx, GEO_SYMBOL_ICON), nicht als Textzeichen (Gestaltprüfung). */
const HAKEN = "\u2713";

/**
 * Anzeige eines gespeicherten Befunds für Start oder Ende — auch für alte
 * Einträge ohne geoStart/geoEnde (aus innerhalb… und geprueft… abgeleitet).
 * @param {any} eintrag  einstempeln-Eintrag
 * @param {"Start"|"Ende"} phase
 */
export function geoAnzeige(eintrag, phase) {
  if (!eintrag || !eintrag[phase === "Start" ? "start" : "ende"]) return null;
  const geo = eintrag[`geo${phase}`];
  if (geo && typeof geo === "object") {
    const basis = { entfernung: entfernungText(geo.entfernungGerundet), genauigkeit: geo.genauigkeitM ?? null,
      warnung: !!geo.genauigkeitWarnung, referenz: geo.referenz && geo.referenz.name ? geo.referenz.name : null };
    if (geo.status === INNERHALB) return { symbol: HAKEN, ton: "ok", text: "Standort bestätigt", ...basis };
    if (geo.status === AUSSERHALB) return { symbol: "!", ton: "warn", text: "Standort abweichend", ...basis };
    if (geo.grund === "pruefung_aus") return { symbol: "○", ton: "text", text: "Geo-Prüfung aus", ...basis };
    return { symbol: "?", ton: "text", text: "Standort nicht bewertbar", ...basis };
  }
  /* Altbestand: nur das bisherige Urteil. Der alte Text trug die exakte
     Entfernung; er wird nicht angezeigt. */
  const innerhalb = eintrag[`innerhalb${phase}`];
  const leer = { entfernung: "", genauigkeit: null, warnung: false, referenz: null };
  if (innerhalb === true) return { symbol: HAKEN, ton: "ok", text: "Standort bestätigt", ...leer };
  if (innerhalb === false) return { symbol: "!", ton: "warn", text: "Standort abweichend", ...leer };
  return { symbol: "?", ton: "text", text: "Standort nicht bewertbar", ...leer };
}
