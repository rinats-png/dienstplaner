/* ==========================================================================
   DIENSTZEIT DES OBJEKTBERICHTS AUS DER BESTÄTIGTEN IST-ZEIT (WP-19.3, OB-2)

   Der Objektbericht (server/lib/modul-objektbericht.mjs, O3 a) zählt als Ist
   nur, wer an dem Tag nachweislich im Dienst war. Quelle ist allein die
   bestätigte Ist-Erfassung (Stempel/Selbstauskunft/Korrektur;
   m.erfassung["Person|Tag"], bestaetigt === true, WP-16) — nie die Planzeit.
   `bestaetigt` setzt auch das gewöhnliche Ausstempeln (außer Prüffällen wie
   LANGER_DIENST) und die eigene Selbstauskunft (server/lib/zeiterfassung.mjs),
   nicht nur die Leitung. Fehlt sie, ist sie unbestätigt oder ohne Beginn/Ende
   (etwa Selbstauskunft „wie geplant“), ist die Dienstzeit null mit einem
   Grundcode; der Bericht zeigt dann „ungeklärt“, nie „0“ und nie den Plan.
   Bei offenem Korrekturantrag gilt der zuletzt übernommene bestätigte Wert.

   Rollenschutz (E1, H8+, „Ist-Zeiten unter Rollenschutz: nicht verfügbar
   statt Planzeit“): Ob die Ist-Zeit einer Person zugänglich ist, entscheidet
   dieselbe Regel wie überall — istVerfuegbar (server/lib/istdaten.mjs) auf
   dem Bestand, den der Server der Rolle liefert (sichtIstDaten aus
   server/lib/sicht.mjs): Beschäftigte nur die eigene, Schichtverantwortung
   sich und den eigenen Bereich (tagesgenau), Betriebsrat keine, Planung und
   Leitung alle. Die Quelle für den Bericht selbst gibt es zusätzlich nur bei
   Berichtszugriff „voll“ (Planung, Leitung; berichtZugriffFuer, R-5) und nur
   für den Betrieb der Sitzung (R-8) — restriktivste Lesart, keine neuen Rechte.

   Datensparsam: Ergebnis ist Beginn und Ende der bestätigten Erfassung, keine
   Pause, kein Korrekturgrund, keine Abwesenheit, keine Gesundheitsangabe.
   Für den Bericht gehen nur Personenkennungen hinaus (wie bisher die Schnitt-
   stelle `dienstzeit(datum, dienstId)`).

   Rein: keine Ablage, keine Uhr. Das Modul bleibt „geplant“ (keine Wirkung).
   ========================================================================== */
import { istVerfuegbar } from "../../server/lib/istdaten.mjs";
import { aktive, personTag } from "../../server/lib/engine/plan.mjs";
import { fenster, bruttoAm } from "../../server/lib/regelwerk.mjs";
import { berichtZugriffFuer } from "./zugriff.js";

/** Grundcodes, wenn keine bestätigte Dienstzeit vorliegt. */
export const DIENSTZEIT_GRUND = Object.freeze({
  KEIN_ZUGRIFF: "kein-zugriff",                 // Rolle ohne Berichtszugriff oder fremder Betrieb
  TAG_UNGUELTIG: "tag-ungueltig",
  PERSON_UNBEKANNT: "person-unbekannt",         // nicht in diesem Betrieb
  IST_NICHT_VERFUEGBAR: "ist-nicht-verfuegbar", // Rollenschutz (sichtIstDaten)
  KEINE_ERFASSUNG: "keine-erfassung",
  NICHT_BESTAETIGT: "nicht-bestaetigt",
  ZEITEN_UNVOLLSTAENDIG: "zeiten-unvollstaendig",
  DIENST_UNBEKANNT: "dienst-unbekannt",
  AUSSERHALB_DIENST: "ausserhalb-dienst",       // bestätigt, aber ohne Überschneidung mit dem Dienst
});

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const echterTag = (s) => { if (typeof s !== "string" || !TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
const folgetag = (t) => new Date(Date.parse(`${t}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

/**
 * Die bestätigte Dienstzeit einer Person an einem Tag (Tag = Beginn des Dienstes).
 * Ein Ende vor oder gleich dem Beginn liegt am Folgetag (Nachtdienst, wie regelwerk.fenster).
 * @param {any} m Betrieb in der Sicht der Rolle (mit sichtIstDaten vom Server)
 * @param {any} personId
 * @param {string} datum JJJJ-MM-TT
 * @returns {{ dienstzeit: { beginn: string, ende: string, von: string, bis: string, endeTag: string, anwesenheitStd: number }, grund: null }
 *   | { dienstzeit: null, grund: string }}
 */
export function bestaetigteDienstzeit(m, personId, datum) {
  const nein = (grund) => ({ dienstzeit: null, grund });
  if (!echterTag(datum)) return nein(DIENSTZEIT_GRUND.TAG_UNGUELTIG);
  const p = (Array.isArray(m && m.personen) ? m.personen : [])
    .find((x) => istObjekt(x) && x.id !== undefined && x.id !== null && personId !== undefined && personId !== null && String(x.id) === String(personId));
  if (!p) return nein(DIENSTZEIT_GRUND.PERSON_UNBEKANNT);
  if (!istVerfuegbar(m, p, datum)) return nein(DIENSTZEIT_GRUND.IST_NICHT_VERFUEGBAR);
  const e = istObjekt(m.erfassung) ? m.erfassung[`${p.id}|${datum}`] : null;
  if (!istObjekt(e)) return nein(DIENSTZEIT_GRUND.KEINE_ERFASSUNG);
  if (e.bestaetigt !== true) return nein(DIENSTZEIT_GRUND.NICHT_BESTAETIGT);
  /* Kein Rückfall auf die Dienstart (anders als istZeitFuer): ohne erfassten Beginn und Ende keine Dienstzeit. */
  if (!UHR.test(String(e.start)) || !UHR.test(String(e.ende))) return nein(DIENSTZEIT_GRUND.ZEITEN_UNVOLLSTAENDIG);
  const endeTag = e.ende <= e.start ? folgetag(datum) : datum;
  return { dienstzeit: { beginn: `${datum}T${e.start}`, ende: `${endeTag}T${e.ende}`, von: e.start, bis: e.ende, endeTag,
    anwesenheitStd: Math.round(bruttoAm(datum, { start: e.start, ende: e.ende }) * 100) / 100 }, grund: null };
}

/** Gleicher Betrieb wie die Sitzung? Ohne Sitzungsbetrieb nein (fail-closed). */
function eigenerBetrieb(sitz, m) {
  const sm = sitz && istObjekt(sitz.mandant) ? sitz.mandant : null;
  if (!sm || !istObjekt(m)) return false;
  if (sm === m) return true;
  return sm.id !== undefined && sm.id !== null && m.id !== undefined && m.id !== null && String(sm.id) === String(m.id);
}

/**
 * Wer war in diesem Dienst an diesem Tag nachweislich im Dienst? Alle für den Dienst eingeteilten
 * Personen brauchen eine bestätigte Dienstzeit, die sich mit dem Dienst überschneidet — sonst ist der
 * Dienst „ungeklärt“ (personen null) mit dem ersten Grund. Keine Abwesenheitsangabe im Ergebnis.
 * @param {any} m
 * @param {any} sitz Sitzung (rolle, mandant)
 * @param {string} datum
 * @param {string} dienstId
 * @returns {{ personen: string[], grund: null } | { personen: null, grund: string }}
 */
export function dienstzeitStand(m, sitz, datum, dienstId) {
  const nein = (grund) => ({ personen: null, grund });
  const rolle = sitz && typeof sitz.rolle === "string" ? sitz.rolle : null;
  if (berichtZugriffFuer(rolle) !== "voll" || !eigenerBetrieb(sitz, m)) return nein(DIENSTZEIT_GRUND.KEIN_ZUGRIFF);
  if (!echterTag(datum)) return nein(DIENSTZEIT_GRUND.TAG_UNGUELTIG);
  const da = (Array.isArray(m.dienstarten) ? m.dienstarten : []).find((d) => istObjekt(d) && d.id === dienstId);
  if (!da || !UHR.test(String(da.start)) || !UHR.test(String(da.ende))) return nein(DIENSTZEIT_GRUND.DIENST_UNBEKANNT);
  /* Eingeteilt wie in besetzung (engine/plan.mjs): Plan mit Abweichung, ohne Abwesende — nur die Einteilung, keine Zeit. */
  const eingeteilt = aktive(m, datum).filter((p) => personTag(m, p, datum).dienstId === dienstId);
  const [dVon, dBis] = fenster(datum, da);
  const aus = [];
  for (const p of eingeteilt) {
    const r = bestaetigteDienstzeit(m, p.id, datum);
    if (!r.dienstzeit) return nein(r.grund);
    const [iVon, iBis] = fenster(datum, { start: r.dienstzeit.von, ende: r.dienstzeit.bis });
    if (!(iVon < dBis && dVon < iBis)) return nein(DIENSTZEIT_GRUND.AUSSERHALB_DIENST);
    aus.push(String(p.id));
  }
  return { personen: aus.sort(), grund: null };
}

/**
 * Die Quelle `dienstzeit(datum, dienstId)` für den Objektbericht (modulKontext, kontext.dienstzeit).
 * Ohne Berichtszugriff oder für einen fremden Betrieb liefert sie immer null („ungeklärt“).
 * @param {any} m
 * @param {any} sitz
 * @returns {(datum: string, dienstId: string) => string[] | null}
 */
export function objektberichtDienstzeit(m, sitz) {
  return (datum, dienstId) => dienstzeitStand(m, sitz, datum, dienstId).personen;
}
