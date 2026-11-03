/* ==========================================================================
   STEMPELN IN DER OBERFLÄCHE — Positionsabfrage, offener Vorgang, Befund

   Rein und ohne React, damit es sich prüfen lässt. Das Urteil selbst fällt
   der Server (server/lib/geo.mjs); hier wird nur entschieden, ob überhaupt
   gemessen wird, welcher Tag gestempelt wird und wie ein gespeicherter
   Befund angezeigt wird.
   ========================================================================== */
import { addDays } from "./regelwerk.js";
import { entfernungText, geoAktiv, INNERHALB, AUSSERHALB } from "../server/lib/geo.mjs";
import { startZuordenbar, nachtdienstOffen, heuteBerlin, uhrzeitBerlin } from "../server/lib/zeiterfassung.mjs";
import { vorlaeufige } from "./stempelpuffer.js";

/**
 * Die gespeicherten Stempel, ergänzt um die noch nicht quittierten aus dem
 * Stempelpuffer (WP-07) — nur für die Anzeige, nie für den Bestand: Ein
 * vorläufiger Eintrag trägt `vorlaeufig: true` und landet nie im Speichern
 * (das wiese ihn als erfundenen Stempel ab, WP-06). So zeigt die Stempeluhr
 * nach einem Einstempeln ohne Netz „Ausstempeln" und nicht noch einmal
 * „Einstempeln".
 */
export function mitVorlaeufigen(tab, pid, ereignisse) {
  const wartend = (Array.isArray(ereignisse) ? ereignisse : []).filter((e) => e && e.zustand === "wartet");
  if (!pid || !wartend.length) return tab || {};
  const t = { ...(tab || {}) };
  for (const ev of wartend) {
    const am = new Date(ev.erfasstAm);
    if (!Number.isFinite(am.getTime())) continue;
    const zeit = uhrzeitBerlin(am);
    if (ev.art === "start") {
      const k = `${pid}|${heuteBerlin(am)}`;
      if (!t[k]) t[k] = { start: zeit, startAm: ev.erfasstAm, vorlaeufig: true };
    } else {
      const k = `${pid}|${typeof ev.datum === "string" && ev.datum ? ev.datum : heuteBerlin(am)}`;
      const e = t[k];
      if (e && e.start && !e.ende) t[k] = { ...e, ende: zeit, endeAm: ev.erfasstAm, vorlaeufig: true };
      else if (!e) t[k] = { ende: zeit, endeAm: ev.erfasstAm, vorlaeufig: true };
    }
  }
  return t;
}

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
 * (zeiterfassung.mjs, stempelZiel: Ende beim offenen Beginn von gestern).
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
 * nicht mehr zuordenbar. Ein Ende dazu speichert der Server am selben Tag
 * mit START_VERALTET; liegt der Beginn auf gestern, als eigenes Ende auf
 * heute (START_FEHLT), und der alte Vorgang wird KONFLIKT (zeiterfassung.mjs,
 * stempelZiel). Beides ist kein normaler Abschluss.
 */
export function stempelVorgang(m, p, heute, jetzt = new Date(), ereignisse = vorlaeufige()) {
  const tab = mitVorlaeufigen((m && m.einstempeln) || {}, p && p.id, ereignisse);
  const gestern = addDays(heute, -1);
  const vom = p ? tab[`${p.id}|${gestern}`] : null;
  if (vom && vom.start && !vom.ende && startZuordenbar(gestern, vom.start, jetzt, vom.startAm))
    return { datum: gestern, st: vom, vortag: true, offen: true, veraltet: false };
  const st = p ? tab[`${p.id}|${heute}`] || null : null;
  /* Einstempeln am Abend vergessen (WP-17, F1/W3): Gestern war ein Dienst
     über Mitternacht geplant, für gestern gibt es keinen Stempel, und sein
     Ende ist höchstens vier Stunden vorbei. Dann bietet die Oberfläche
     neben „Einstempeln" auch „Dienstende stempeln" an — der Server ordnet
     dieses Ende nach derselben Regel dem Nachtdienst von gestern zu
     (zeiterfassung.mjs, nachtdienstOffen), als Ende ohne Beginn. */
  if (p && !st && nachtdienstOffen({ ...m, einstempeln: tab }, p, heute, jetzt))
    return { datum: gestern, st: null, vortag: true, offen: false, veraltet: false, nachtEnde: true };
  const offen = !!st && !!st.start && !st.ende;
  return { datum: heute, st, vortag: false, offen, veraltet: offen && !startZuordenbar(heute, st.start, jetzt, st.startAm) };
}

/**
 * Unter welchem Schlüssel steht ein gerade gestempelter Eintrag? Der Tag, den
 * der Server gewählt hat (erg.datum), nicht der des Geräts — seit WP-17
 * bestimmt der Server den Tag; mit dem Gerätedatum landete die lokale Kopie
 * bei falsch gestellter Uhr auf dem falschen Tag und ging beim nächsten
 * Speichern als Duplikat hinaus (W2).
 */
export const stempelSchluessel = (pid, erg, geraeteDatum) =>
  `${pid}|${(erg && typeof erg.datum === "string" && erg.datum) || geraeteDatum}`;

/** Ein offener Beginn, zu dem kein Ende mehr automatisch passt (für die Anzeige der Leitung). */
export const endeFehlt = (datum, e, jetzt = new Date()) =>
  !!e && !!e.start && !e.ende && !startZuordenbar(datum, e.start, jetzt, e.startAm);

export const MARKIERUNG_TEXT = Object.freeze({
  START_FEHLT: "Start fehlt",
  START_VERALTET: "Beginn über 20 Stunden alt — nicht zugeordnet",
  ENDE_FEHLT: "Ende fehlt",
  UNGEPLANTER_DIENST: "ohne geplanten Dienst",
  KONFLIKT: "Konflikt — bitte durch die Leitung klären",
  GERAETEDATUM_ABWEICHEND: "Datum des Geräts wich ab",
  LANGER_DIENST: "länger als geplant + 2 Stunden — Ist-Zeit zur Prüfung",
  OFFLINE_ERFASST: "offline erfasst",
  GERAETEZEIT_ABWEICHEND: "Uhr des Geräts wich ab — Zeit zur Prüfung",
  OFFLINE_ALT: "offline erfasst, über 48 Stunden alt — zur Prüfung",
  OFFLINE_PRUEFEN: "offline gestempelt — Ist-Zeit zur Prüfung",
  DAUER_NULL: "Beginn gleich Ende — Zeiten über die Korrektur eintragen",
  ORT_PRUEFEN: "Ort nicht bestätigt — bitte klären",
  UNGEPLANT_PRUEFUNG: "ohne geplanten Dienst — Dauer zur Bestätigung",
});

/** Anzeigetext eines Stempelereignisses im Puffer (WP-07). */
export function pufferZustandText(ev) {
  if (!ev) return "";
  if (ev.zustand === "wartet") return "vorläufig (offline gespeichert)";
  if (ev.zustand === "bestaetigt") return "bestätigt";
  if (ev.zustand === "abgelehnt") return `abgelehnt: ${(ev.fehler && ev.fehler.grund) || "ohne Angabe"}`;
  return "";
}

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
    /* Einsatzorte speichern nur die Abstandsklasse (WP-20), keine Entfernung. */
    const KLASSE = { bis_1km: "weniger als 1 km", bis_5km: "1 bis 5 km", ueber_5km: "mehr als 5 km" };
    const basis = { entfernung: geo.entfernungGerundet != null ? entfernungText(geo.entfernungGerundet) : KLASSE[geo.abstandsklasse] || "",
      genauigkeit: geo.genauigkeitM ?? null,
      warnung: !!geo.genauigkeitWarnung, referenz: geo.referenz && geo.referenz.name ? geo.referenz.name : null };
    if (geo.status === INNERHALB) return { symbol: HAKEN, ton: "ok", text: "Standort bestätigt", ...basis };
    if (geo.status === AUSSERHALB) return { symbol: "!", ton: "warn", text: "Standort abweichend", ...basis };
    if (geo.grund === "pruefung_aus") return { symbol: "○", ton: "text", text: "Geo-Prüfung aus", ...basis };
    if (geo.grund === "aussendienst") return { symbol: "○", ton: "text", text: "Außendienst — ohne festen Ort", ...basis };
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
