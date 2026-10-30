/* ==========================================================================
   STEMPELN IN DER OBERFLÄCHE — Positionsabfrage, offener Vorgang, Befund

   Rein und ohne React, damit es sich prüfen lässt. Das Urteil selbst fällt
   der Server (server/lib/geo.mjs); hier wird nur entschieden, ob überhaupt
   gemessen wird, welcher Tag gestempelt wird und wie ein gespeicherter
   Befund angezeigt wird.
   ========================================================================== */
import { addDays } from "./regelwerk.js";
import { entfernungText, INNERHALB, AUSSERHALB } from "../server/lib/geo.mjs";

/** Eine frische, möglichst genaue Messung je Stempelereignis (Geo-Spezifikation B4). */
export const POSITION_OPTIONEN = Object.freeze({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });

/** Ist die Geo-Prüfung im Betrieb eingeschaltet? Fehlt das Feld: aus. */
export const geoPruefungAn = (m) => !!(m && m.einstellungen && m.einstellungen.geoPruefung === true);

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
 */
export function stempelVorgang(m, p, heute) {
  const tab = (m && m.einstempeln) || {};
  const gestern = addDays(heute, -1);
  const offen = p ? tab[`${p.id}|${gestern}`] : null;
  if (offen && offen.start && !offen.ende) return { datum: gestern, st: offen, vortag: true };
  return { datum: heute, st: p ? tab[`${p.id}|${heute}`] || null : null, vortag: false };
}

export const MARKIERUNG_TEXT = Object.freeze({
  START_FEHLT: "Start fehlt",
  UNGEPLANTER_DIENST: "ohne geplanten Dienst",
});

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
    if (geo.status === INNERHALB) return { symbol: "✓", ton: "ok", text: "Standort bestätigt", ...basis };
    if (geo.status === AUSSERHALB) return { symbol: "!", ton: "warn", text: "Standort abweichend", ...basis };
    if (geo.grund === "pruefung_aus") return { symbol: "○", ton: "text", text: "Geo-Prüfung aus", ...basis };
    return { symbol: "?", ton: "text", text: "Standort nicht bewertbar", ...basis };
  }
  /* Altbestand: nur das bisherige Urteil. Der alte Text trug die exakte
     Entfernung; er wird nicht angezeigt. */
  const innerhalb = eintrag[`innerhalb${phase}`];
  const leer = { entfernung: "", genauigkeit: null, warnung: false, referenz: null };
  if (innerhalb === true) return { symbol: "✓", ton: "ok", text: "Standort bestätigt", ...leer };
  if (innerhalb === false) return { symbol: "!", ton: "warn", text: "Standort abweichend", ...leer };
  return { symbol: "?", ton: "text", text: "Standort nicht bewertbar", ...leer };
}
