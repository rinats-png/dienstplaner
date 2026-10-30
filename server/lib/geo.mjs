/* ==========================================================================
   GEO-PRÜFUNG BEIM STEMPELN — die eine Stelle

   Bis hierher stand die Ortsprüfung in server/funktionen/daten.mjs (und als
   ungenutzte Kopie in der Oberfläche). Sie kannte weder die Genauigkeit der
   Messung noch gültige Wertebereiche: Ein Breitengrad jenseits von 90°
   konnte über die Periodizität der Haversine-Formel als „am Einsatzort"
   gelten, und gespeichert wurde die exakte Entfernung im Text.

   Grundsätze (Geo-Spezifikation, Entscheidungen E3, E4, E7):
   - Die Geo-Prüfung ist nie Voraussetzung für die Arbeitszeit. Jedes Urteil
     wird zusammen mit der Stempelzeit gespeichert, keines lehnt sie ab.
   - Drei Zustände: INNERHALB, AUSSERHALB, NICHT_BEWERTBAR. Ungültige oder
     fehlende Daten ergeben NICHT_BEWERTBAR — nie INNERHALB, nie AUSSERHALB.
   - Mit d = Entfernung, a = Genauigkeit, r = Radius:
       d + a ≤ r → INNERHALB;  d − a > r → AUSSERHALB;  sonst NICHT_BEWERTBAR.
     a > 100 m: Qualitätswarnung; a > 1000 m: zwingend NICHT_BEWERTBAR.
   - Rohkoordinate und exakte Entfernung leben nur in der Anfrage. Dauerhaft:
     Status, Grund, gerundete Entfernung, Genauigkeit, Referenzort.
   - Ist die Prüfung im Betrieb aus (einstellungen.geoPruefung, Vorgabe aus),
     wird nichts gemessen und nichts geprüft: NICHT_BEWERTBAR / pruefung_aus.

   Spätere Ortsquellen (Einsatzorte je Dienst) kommen in referenzOrt hinzu —
   hier, nicht in einer zweiten Prüfung.
   ========================================================================== */

export const INNERHALB = "INNERHALB";
export const AUSSERHALB = "AUSSERHALB";
export const NICHT_BEWERTBAR = "NICHT_BEWERTBAR";

export const RADIUS_VORGABE = 200;
export const RADIUS_MIN = 25;
export const RADIUS_MAX = 5000;
export const GENAUIGKEIT_WARNUNG = 100;
export const GENAUIGKEIT_GRENZE = 1000;
export const GENAUIGKEIT_MAX = 100000;

const zahl = (x) => typeof x === "number" && Number.isFinite(x);

/** Abstand zweier Koordinaten in Metern (Haversine, Erdradius 6 371 km), auf ganze Meter. */
export function abstandMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const bogen = (g) => (g * Math.PI) / 180;
  const dLat = bogen(lat2 - lat1);
  const dLon = bogen(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(bogen(lat1)) * Math.cos(bogen(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const koordinateGueltig = (lat, lon) => zahl(lat) && zahl(lon)
  && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
export const genauigkeitGueltig = (a) => zahl(a) && a > 0 && a <= GENAUIGKEIT_MAX;
export const radiusGueltig = (r) => zahl(r) && r >= RADIUS_MIN && r <= RADIUS_MAX;

/** Ist die Geo-Prüfung in diesem Betrieb eingeschaltet? Fehlt das Feld: aus. */
export const geoAktiv = (m) => !!(m && m.einstellungen && m.einstellungen.geoPruefung === true);

/**
 * Entfernung, wie sie dauerhaft gespeichert wird (E4): unter 1 km auf 50 m,
 * 1 bis 5 km auf 100 m, darüber nur „>5 km". Als Zeichenkette.
 */
export function entfernungRunden(d) {
  if (!zahl(d) || d < 0) return null;
  if (d < 1000) {
    const r = Math.round(d / 50) * 50;
    if (r < 1000) return String(r);
  }
  if (d <= 5000) return String(Math.min(5000, Math.round(d / 100) * 100));
  return ">5 km";
}

/** Lesbare Form einer gerundeten Entfernung. */
export function entfernungText(gerundet) {
  if (gerundet === null || gerundet === undefined) return "";
  if (gerundet === ">5 km") return "mehr als 5 km";
  const n = Number(gerundet);
  return n < 1000 ? `ca. ${n} m` : `ca. ${String(n / 1000).replace(".", ",")} km`;
}

/** Bundesland eines Standorts — ältere Bestände nennen das Feld „land". */
export const standortBundesland = (st) => (st && (st.bundesland || st.land)) || null;

/** Welche Einheit hat die Person an diesem Tag? */
export function einheitAm(person, datum) {
  const liste = (person && Array.isArray(person.zugehoerigkeit) ? person.zugehoerigkeit : [])
    .filter((z) => z && (!z.ab || z.ab <= datum))
    .sort((a, b) => String(a.ab || "").localeCompare(String(b.ab || "")));
  return liste.length ? liste[liste.length - 1].einheitId : null;
}

/** Der Referenzort für ein Stempelereignis: heute der Standort der Einheit am Tag. */
export function referenzOrt(m, person, datum) {
  const eid = einheitAm(person, datum);
  const einheit = (m && Array.isArray(m.einheiten) ? m.einheiten : []).find((x) => x && x.id === eid);
  const st = einheit && (Array.isArray(m.standorte) ? m.standorte : []).find((x) => x && x.id === einheit.standortId);
  return st || null;
}

const TEXTE = {
  pruefung_aus: "Ohne Standortprüfung erfasst",
  keine_position: "Ohne Standortfreigabe erfasst",
  ungueltige_koordinate: "Standort nicht bewertbar (ungültige Position)",
  ungueltige_genauigkeit: "Standort nicht bewertbar (Genauigkeit unbekannt)",
  kein_referenzort: "Kein Standort hinterlegt",
  keine_koordinate_am_referenzort: "Kein Standort hinterlegt",
  radius_ungueltig: "Standort nicht bewertbar (Umkreis ungültig)",
  genauigkeit_zu_schlecht: "Standort nicht bewertbar (Messung zu ungenau)",
};

/**
 * Das Geo-Urteil eines Stempelereignisses.
 * @param {{ m: any, person: any, datum: string, messung?: { lat?: any, lon?: any, accuracy?: any } | null }} e
 * @returns {{ geo: object, geprueft: boolean, innerhalb: (boolean|null), text: string }}
 *   geo: das gespeicherte Objekt; geprueft/innerhalb/text: die bisherigen Felder.
 */
export function geoUrteil({ m, person, datum, messung }) {
  const st = referenzOrt(m, person, datum);
  const referenz = st ? { art: "standort", id: st.id, name: st.name || null } : null;
  const nicht = (grund, extra = {}) => ({
    geo: { status: NICHT_BEWERTBAR, grund, entfernungGerundet: null, genauigkeitM: null,
      genauigkeitWarnung: false, referenz, ...extra },
    geprueft: false, innerhalb: null, text: TEXTE[grund] || "Standort nicht bewertbar",
  });

  if (!geoAktiv(m)) return nicht("pruefung_aus");
  const lat = messung && messung.lat, lon = messung && messung.lon, a = messung && messung.accuracy;
  if ((lat === null || lat === undefined) && (lon === null || lon === undefined)) return nicht("keine_position");
  if (!koordinateGueltig(lat, lon)) return nicht("ungueltige_koordinate");
  if (!genauigkeitGueltig(a)) return nicht("ungueltige_genauigkeit");
  const genauigkeitM = Math.round(a);
  const genauigkeitWarnung = a > GENAUIGKEIT_WARNUNG;
  if (!st) return nicht("kein_referenzort", { genauigkeitM, genauigkeitWarnung });
  if (!koordinateGueltig(st.lat, st.lon)) return nicht("keine_koordinate_am_referenzort", { genauigkeitM, genauigkeitWarnung });
  const r = st.radius === undefined || st.radius === null ? RADIUS_VORGABE : st.radius;
  if (!radiusGueltig(r)) return nicht("radius_ungueltig", { genauigkeitM, genauigkeitWarnung });

  const d = abstandMeter(lat, lon, st.lat, st.lon);            // exakt, nur hier
  const entfernungGerundet = entfernungRunden(d);
  if (a > GENAUIGKEIT_GRENZE) return nicht("genauigkeit_zu_schlecht", { entfernungGerundet, genauigkeitM, genauigkeitWarnung });
  const status = d + a <= r ? INNERHALB : d - a > r ? AUSSERHALB : NICHT_BEWERTBAR;
  if (status === NICHT_BEWERTBAR) return nicht("genauigkeit_zu_schlecht", { entfernungGerundet, genauigkeitM, genauigkeitWarnung });
  const geo = { status, grund: null, entfernungGerundet, genauigkeitM, genauigkeitWarnung, referenz };
  return {
    geo, geprueft: true, innerhalb: status === INNERHALB,
    text: status === INNERHALB ? "Am Standort" : `Abweichend, ${entfernungText(entfernungGerundet)} entfernt`,
  };
}
