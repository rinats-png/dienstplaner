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

import { geplanterDienst } from "./zeiterfassung.mjs";

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

/* --------------------------------------------------------------------------
   STANDORTANGABEN BEIM SCHREIBEN

   Dieselben Wertebereiche wie in der Prüfung, an einer Stelle: Breite
   −90…90, Länge −180…180, Umkreis 25…5000 m, jeweils als endliche Zahl.
   Fehlende Werte (undefined, null) sind erlaubt — ein Standort ohne
   Koordinaten ist gültig, er ist nur nicht prüfbar.

   Geprüft wird nur, was neu ist oder sich ändert. Ein früher gespeicherter
   ungültiger Wert blockiert keinen unabhängigen Schreibvorgang; die Prüfung
   beim Stempeln behandelt ihn als NICHT_BEWERTBAR. Ungültiges wird
   abgewiesen, nicht still korrigiert.
   -------------------------------------------------------------------------- */
const STANDORT_FELDER = {
  lat: { gueltig: (x) => zahl(x) && x >= -90 && x <= 90, text: "Der Breitengrad muss eine Zahl zwischen −90 und 90 sein." },
  lon: { gueltig: (x) => zahl(x) && x >= -180 && x <= 180, text: "Der Längengrad muss eine Zahl zwischen −180 und 180 sein." },
  radius: { gueltig: radiusGueltig, text: `Der Umkreis muss eine Zahl zwischen ${RADIUS_MIN} und ${RADIUS_MAX} Metern sein.` },
};
const gesetzt = (x) => x !== undefined && x !== null;

/** Grund, warum eine neue oder geänderte Standortangabe ungültig ist — oder null. */
export function standorteFehler(alteStandorte, neueStandorte) {
  const alt = new Map((Array.isArray(alteStandorte) ? alteStandorte : []).filter((s) => s && typeof s === "object")
    .map((s) => [String(s.id), s]));
  for (const st of Array.isArray(neueStandorte) ? neueStandorte : []) {
    if (!st || typeof st !== "object") continue;
    const vorher = alt.get(String(st.id));
    for (const [feld, regel] of Object.entries(STANDORT_FELDER)) {
      const wert = st[feld];
      if (!gesetzt(wert)) continue;
      if (vorher && Object.is(vorher[feld], wert)) continue;          // unverändert: Altbestand blockiert nicht
      if (!regel.gueltig(wert)) return `Standort „${st.name || st.id}": ${regel.text}`;
    }
  }
  return null;
}

/** Dasselbe über alle Betriebe eines Bestands (zugeordnet über die Betriebskennung). */
export function bestandStandorteFehler(altBestand, neuBestand) {
  const alt = new Map((altBestand && Array.isArray(altBestand.mandanten) ? altBestand.mandanten : [])
    .filter((m) => m && typeof m === "object").map((m) => [String(m.id), m]));
  for (const m of neuBestand && Array.isArray(neuBestand.mandanten) ? neuBestand.mandanten : []) {
    if (!m || typeof m !== "object") continue;
    const vorher = alt.get(String(m.id)) || {};
    const grund = standorteFehler(vorher.standorte, m.standorte) || standorteFehler(vorher.einsatzorte, m.einsatzorte);   // Einsatzorte: dieselben Wertebereiche (WP-20)
    if (grund) return grund;
  }
  return null;
}

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

/* --------------------------------------------------------------------------
   ORT JE DIENST (WP-20)

   Eine Dienstart kann ihren eigenen Referenzort haben (dienstart.ortModus):
     standort      (Vorgabe) der Standort der Einheit am Tag
     einsatzort    ein Einsatzort des Betriebs aus m.einsatzorte (dienstart.einsatzortId);
                   getrennt von den Standorten, die Preis und Feiertage bestimmen
     aussendienst  kein fester Ort — nichts wird gemessen oder verglichen
   Der Betrieb wählt außerdem, wie streng geprüft wird (geoModus):
     aus       Schalter geoPruefung aus: nichts wird gemessen
     hinweis   (Vorgabe, wenn an) Ergebnis wird gespeichert und angezeigt
     pflicht   dazu bekommt ein Stempel, dessen Ort nicht bestätigt ist, die
               Markierung ORT_PRUEFEN — die Leitung klärt es. Abgelehnt wird
               nie (E3): Die Arbeitszeit wird in jedem Fall erfasst.
   -------------------------------------------------------------------------- */
export const ORT_MODI = Object.freeze(["standort", "einsatzort", "aussendienst"]);
export const GEO_MODI = Object.freeze(["aus", "hinweis", "pflicht"]);
export const MARKIERUNG_ORT = "ORT_PRUEFEN";
/** Die Bestätigung, die die Leitung für den Pflichtmodus gibt (Server verlangt sie in derselben Anfrage). */
export const GEO_MODUS_TEXT = "Datenschutz und Mitbestimmung für die verpflichtende Standortprüfung (Markierung bei abweichendem Ort) wurden betrieblich geprüft.";

/** Der Ortsmodus einer Dienstart; fehlend oder unbekannt: der Standort der Einheit. */
export const dienstOrtModus = (da) => (da && typeof da === "object" && ORT_MODI.includes(da.ortModus) ? da.ortModus : "standort");

/** Der Prüfmodus des Betriebs. „pflicht" wirkt nur bei eingeschaltetem Schalter. */
export function geoModus(m) {
  if (!geoAktiv(m)) return "aus";
  return m.einstellungen.geoModus === "pflicht" ? "pflicht" : "hinweis";
}

/**
 * Abstandsklasse statt Zahl: innerhalb | bis_1km | bis_5km | ueber_5km, oder
 * null, wenn kein Abstand bekannt ist. Mehr als die Klasse braucht niemand,
 * der den Befund liest — und bei Einsatzorten wird nur sie gespeichert.
 */
export function abstandsklasse(status, d) {
  if (status === INNERHALB) return "innerhalb";
  if (!zahl(d) || d < 0) return null;
  return d <= 1000 ? "bis_1km" : d <= 5000 ? "bis_5km" : "ueber_5km";
}
const KLASSE_TEXT = { bis_1km: "weniger als 1 km", bis_5km: "1 bis 5 km", ueber_5km: "mehr als 5 km" };

/** Die Dienstart, die an diesem Tag für die Person geplant ist (oder null). */
function dienstartAm(m, person, datum) {
  try {
    const id = geplanterDienst(m, person, datum);
    return id ? (Array.isArray(m.dienstarten) ? m.dienstarten : []).find((x) => x && x.id === id) || null : null;
  } catch { return null; }
}

/**
 * Der Referenzort für ein Stempelereignis: der Standort der Einheit am Tag,
 * bei einer Dienstart mit ortModus „einsatzort" deren Einsatzort. Bei
 * „aussendienst" gibt es keinen (null). Ist das Ziel eines Einsatzorts nicht
 * auffindbar, gibt es ebenfalls keinen — nie einen Rückfall auf den Standort,
 * der aus „irgendwo beim Kunden" ein falsches „außerhalb" machte.
 */
export function referenzOrt(m, person, datum, dienstart) {
  const orte = m && Array.isArray(m.standorte) ? m.standorte : [];
  const modus = dienstOrtModus(dienstart);
  if (modus === "aussendienst") return null;
  if (modus === "einsatzort") return (Array.isArray(m && m.einsatzorte) ? m.einsatzorte : []).find((x) => x && typeof dienstart.einsatzortId === "string" && x.id === dienstart.einsatzortId) || null;
  const eid = einheitAm(person, datum);
  const einheit = (m && Array.isArray(m.einheiten) ? m.einheiten : []).find((x) => x && x.id === eid);
  const st = einheit && orte.find((x) => x && x.id === einheit.standortId);
  return st || null;
}

const TEXTE = {
  aussendienst: "Außendienst — ohne festen Ort",
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
 *
 * Der Referenzort kommt von der Dienstart, die an dem Tag für die Person
 * geplant ist (dienstId überschreibt das; undefined: aus dem Plan). Die
 * Koordinate des Geräts ist nur Eingabe — das Urteil fällt der Server.
 * @param {{ m: any, person: any, datum: string, messung?: { lat?: any, lon?: any, accuracy?: any } | null, dienstId?: (string|null) }} e
 * @returns {{ geo: object, geprueft: boolean, innerhalb: (boolean|null), text: string, markierungen: string[] }}
 *   geo: das gespeicherte Objekt; geprueft/innerhalb/text: die bisherigen Felder;
 *   markierungen: Kennzeichen für den Stempel (nur im Modus „pflicht").
 */
export function geoUrteil({ m, person, datum, messung, dienstId }) {
  const modus = geoModus(m);
  const da = dienstId === undefined ? dienstartAm(m, person, datum)
    : (Array.isArray(m && m.dienstarten) ? m.dienstarten : []).find((x) => x && x.id === dienstId) || null;
  const ortModus = dienstOrtModus(da);
  const st = referenzOrt(m, person, datum, da);
  const referenz = ortModus === "aussendienst" ? { art: "aussendienst", id: null, name: "Außendienst" }
    : ortModus === "einsatzort"
      ? { art: "einsatzort", id: st ? st.id : (da && typeof da.einsatzortId === "string" ? da.einsatzortId : null), name: st ? st.name || null : null }
      : st ? { art: "standort", id: st.id, name: st.name || null } : null;
  const klar = (grund) => grund !== "pruefung_aus" && grund !== "aussendienst";
  const nicht = (grund, extra = {}) => ({
    geo: { status: NICHT_BEWERTBAR, grund, entfernungGerundet: null, abstandsklasse: null, genauigkeitM: null,
      genauigkeitWarnung: false, referenz, ...extra },
    geprueft: false, innerhalb: null, text: TEXTE[grund] || "Standort nicht bewertbar",
    markierungen: modus === "pflicht" && klar(grund) ? [MARKIERUNG_ORT] : [],
  });

  if (!geoAktiv(m)) return nicht("pruefung_aus");
  /* Außendienst: kein fester Ort. Die mitgeschickte Position wird weder
     verglichen noch gespeichert. */
  if (ortModus === "aussendienst") return nicht("aussendienst");
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
  /* Die gerundete Entfernung bleibt am Standort der Einheit (E4). Bei einem
     Einsatzort — beim Kunden, vielleicht in der Wohnung — wird nur die Klasse gespeichert. */
  const entfernungGerundet = ortModus === "standort" ? entfernungRunden(d) : null;
  if (a > GENAUIGKEIT_GRENZE) return nicht("genauigkeit_zu_schlecht", { entfernungGerundet, genauigkeitM, genauigkeitWarnung });
  const status = d + a <= r ? INNERHALB : d - a > r ? AUSSERHALB : NICHT_BEWERTBAR;
  const klasse = abstandsklasse(status, d);
  if (status === NICHT_BEWERTBAR) return nicht("genauigkeit_zu_schlecht", { entfernungGerundet, abstandsklasse: klasse, genauigkeitM, genauigkeitWarnung });
  const geo = { status, grund: null, entfernungGerundet, abstandsklasse: klasse, genauigkeitM, genauigkeitWarnung, referenz };
  const ortWort = ortModus === "einsatzort" ? "Am Einsatzort" : "Am Standort";
  return {
    geo, geprueft: true, innerhalb: status === INNERHALB,
    text: status === INNERHALB ? ortWort
      : `Abweichend, ${ortModus === "standort" ? entfernungText(entfernungGerundet) : KLASSE_TEXT[klasse]} entfernt`,
    markierungen: status === AUSSERHALB && modus === "pflicht" ? [MARKIERUNG_ORT] : [],
  };
}

/* --------------------------------------------------------------------------
   DIENSTARTEN BEIM SCHREIBEN (WP-20)

   ortModus nur aus ORT_MODI; „einsatzort" braucht einen vorhandenen Ort in
   m.einsatzorte. Geprüft wird nur, was neu ist oder sich ändert (Altbestand
   blockiert nichts) — außer einem Ort, der verschwindet, auf den eine
   Dienstart noch zeigt: Das wäre ein neuer Fehler, den die Prüfung beim
   Stempeln nur als „nicht bewertbar" sähe.
   -------------------------------------------------------------------------- */
/** Grund, warum die Ortsangaben der Dienstarten ungültig sind — oder null. */
export function dienstartOrtFehler(alteDienstarten, neueDienstarten, einsatzorte, alteEinsatzorte) {
  const alt = new Map((Array.isArray(alteDienstarten) ? alteDienstarten : []).filter((d) => d && typeof d === "object")
    .map((d) => [String(d.id), d]));
  const ids = new Set((Array.isArray(einsatzorte) ? einsatzorte : []).filter((s) => s && typeof s === "object").map((s) => String(s.id)));
  const idsAlt = new Set((Array.isArray(alteEinsatzorte) ? alteEinsatzorte : []).filter((s) => s && typeof s === "object").map((s) => String(s.id)));
  for (const d of Array.isArray(neueDienstarten) ? neueDienstarten : []) {
    if (!d || typeof d !== "object") continue;
    const vorher = alt.get(String(d.id));
    const name = `Dienstart „${d.name || d.id}"`;
    const geaendert = !vorher || !Object.is(vorher.ortModus, d.ortModus) || !Object.is(vorher.einsatzortId, d.einsatzortId);
    if (geaendert) {
      if (gesetzt(d.ortModus) && !ORT_MODI.includes(d.ortModus))
        return `${name}: Der Ortsmodus muss „standort", „einsatzort" oder „aussendienst" sein.`;
      if (d.ortModus === "einsatzort" && !(typeof d.einsatzortId === "string" && d.einsatzortId && ids.has(d.einsatzortId)))
        return `${name}: Für einen Einsatzort muss ein vorhandener Ort gewählt sein.`;
    } else if (d.ortModus === "einsatzort" && typeof d.einsatzortId === "string" && idsAlt.has(d.einsatzortId) && !ids.has(d.einsatzortId)) {
      return `${name}: Der gewählte Einsatzort wird noch verwendet und lässt sich nicht entfernen.`;
    }
  }
  return null;
}

/** Dasselbe über alle Betriebe eines Bestands. */
export function bestandDienstartOrtFehler(altBestand, neuBestand) {
  const alt = new Map((altBestand && Array.isArray(altBestand.mandanten) ? altBestand.mandanten : [])
    .filter((m) => m && typeof m === "object").map((m) => [String(m.id), m]));
  for (const m of neuBestand && Array.isArray(neuBestand.mandanten) ? neuBestand.mandanten : []) {
    if (!m || typeof m !== "object") continue;
    const vorher = alt.get(String(m.id)) || {};
    const grund = dienstartOrtFehler(vorher.dienstarten, m.dienstarten, m.einsatzorte, vorher.einsatzorte);
    if (grund) return grund;
  }
  return null;
}
