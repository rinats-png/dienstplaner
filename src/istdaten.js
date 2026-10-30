/* ==========================================================================
   IST-DATEN UND ROLLENSCHUTZ

   Die tatsächlich erfassten Arbeitszeiten (m.erfassung) erhält nicht jede
   Rolle: Beschäftigte nur die eigenen, der Betriebsrat keine
   (server/lib/rechte.mjs, bestandFuerRolle). Der Server vermerkt das in der
   Antwort als `m.sichtIstDaten`:

     { umfang: "eigene", person: <id> }   Beschäftigte
     { umfang: "keine" }                  Betriebsrat
     { umfang: "personen", personen: [] } Schichtverantwortung: sie selbst und
                                          der eigene Bereich
     (fehlt)                              alle Ist-Daten vorhanden

   Fehlt eine Erfassung, rechnet die Anwendung sonst mit der geplanten Zeit —
   für die Leitung richtig, denn dort heißt „keine Erfassung" wirklich
   „nicht erfasst". Wo die Erfassung nur aus Datenschutzgründen fehlt, wäre
   derselbe Rückfall falsch: Er zeigte die Planzeit als tatsächliche
   Arbeitszeit. Für diese Personen ist die Ist-Zeit deshalb „nicht
   verfügbar", nicht „gleich dem Plan".

   Reine Planinformation (Dienstplan, Ruhezeit nach Plan, Besetzung) bleibt
   davon unberührt.
   ========================================================================== */
import { dauerAm } from "./regelwerk.js";

export const ISTDATEN_TEXT = "Ist-Arbeitszeit für diese Rolle nicht personenbezogen verfügbar.";

/** Sind die Ist-Daten dieser Person in diesem Bestand vollständig zugänglich? */
export function istVerfuegbar(m, p) {
  const s = m && m.sichtIstDaten;
  if (!s) return true;
  if (s.umfang === "eigene") return !!p && s.person !== null && s.person !== undefined
    && String(p.id) === String(s.person);
  if (s.umfang === "personen") return !!p && Array.isArray(s.personen) && s.personen.includes(String(p.id));
  return false;
}

/**
 * Tatsächliche Dauer eines Dienstes: erfasste Zeit schlägt die geplante.
 * Ohne Zugang zu den Ist-Daten: std null und nichtVerfuegbar — nie die Planzeit.
 */
export function istZeitFuer(m, p, d, da) {
  if (!istVerfuegbar(m, p)) return { std: null, erfasst: false, abweichung: 0, nichtVerfuegbar: true };
  /* dauerAm statt dauer: In den beiden Nächten der Zeitumstellung dauert
     ein Nachtdienst sieben oder neun Stunden, nicht acht. */
  const e = m.erfassung ? m.erfassung[`${p.id}|${d}`] : null;
  if (!e || !e.bestaetigt) return { std: dauerAm(d, da), erfasst: false, abweichung: 0 };
  const roh = { start: e.start || da.start, ende: e.ende || da.ende, pause: da.pause || 0 };
  const std = dauerAm(d, roh);
  return { std, erfasst: true, abweichung: Math.round((std - dauerAm(d, da)) * 100) / 100 };
}

/**
 * Die Zeiten, gegen die Pause und Tagesgrenze geprüft werden: bestätigte
 * Erfassung, sonst der Plan. Ohne Zugang zu den Ist-Daten null — die Prüfung
 * ist dann nicht bewertbar.
 */
export function pruefZeitFuer(m, p, d, da) {
  if (!istVerfuegbar(m, p)) return null;
  const e = m.erfassung ? m.erfassung[`${p.id}|${d}`] : null;
  return e && e.bestaetigt
    ? { start: e.start || da.start, ende: e.ende || da.ende, pause: da.pause || 0 }
    : da;
}

/** Leeres Ergebnis von istStunden für Personen ohne zugängliche Ist-Daten. */
export const IST_NICHT_VERFUEGBAR = Object.freeze({
  geleistet: null, gutgeschrieben: null, gesamt: null, nacht: null,
  dienste: null, naechte: null, erfasst: null, nichtVerfuegbar: true,
});

/** Anzeige einer Stundenzahl, die fehlen darf: null → „–" statt „0". */
export const stundenText = (wert, format) => (wert === null || wert === undefined ? "–" : format(wert));
