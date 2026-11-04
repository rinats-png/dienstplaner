/* ==========================================================================
   KORREKTURWORKFLOW (WP-14): Antrag → Freigabe → Ist

   Der Stempel ist das unveränderliche Original (WP-06). Wer sich vertippt,
   vergessen oder zu früh ausgestempelt hat, beantragt eine Korrektur:

     1. Die Person stellt einen Antrag an ihrem Stempel: gewünschter Beginn,
        gewünschtes Ende, Pause, Grund.
     2. Leitung oder Planung (staff.edit) entscheiden: genehmigen oder mit
        Begründung ablehnen. Die Person kann einen offenen Antrag
        zurückziehen.
     3. Genehmigt wird als Korrekturereignis am Stempel (korrekturAnhaengen:
        vorher, nachher, wer, wann, Grund, dazu die Antrags-Kennung und die
        Regelhinweise). Erst dann ändert sich die Ist-Zeit.

   Der Antrag liegt am Stempel selbst (einstempeln[k].antraege, nur anhängen
   und Status fortschreiben): Er hat dieselbe Sichtbarkeit wie der Stempel
   (Beschäftigte und Betriebsrat die eigenen, die Schichtverantwortung keine
   fremden — H8+), dieselbe Monatsscherbe, dieselbe Aufbewahrung. Das Original
   bleibt unverändert; der Antrag nennt Original und bisherige Ist-Zeit.

   Für Tage ohne Stempel gibt es den Antrag nicht: Dort bleibt es bei
   „Zeiten bestätigen" (Selbstauskunft) bzw. der Eintragung durch die Leitung.
   Ein Antrag auf einen Tag mit offenem Beginn (START_FEHLT, START_VERALTET,
   KONFLIKT, Ende fehlt) ist der Weg, ihn aufzulösen.
   ========================================================================== */

import { pauseZuLang } from "./zeitregeln.mjs";
import { korrekturAnhaengen, pauseFuerKorrektur, geplant24Stunden, zeitumstellungSperre, BEGINN_GLEICH_ENDE, KORREKTUR_GRUND_MIN, KORREKTUR_GRUND_MAX } from "./stempelintegritaet.mjs";
import { berlinZeitpunkt } from "./zeiterfassung.mjs";

export const ANTRAG_RUECKBLICK_TAGE = 62;
export const ANTRAEGE_JE_STEMPEL_MAX = 20;
export const ANTRAG_STATUS = ["offen", "genehmigt", "abgelehnt", "zurueckgezogen"];

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const tagPlus = (t, n) => new Date(Date.parse(`${t}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Der vergleichbare Teil einer Ist-Zeit (M5): Beginn, Ende, bestätigt, Pause — null ohne Ist-Zeit. */
const istStand = (e) => (objekt(e)
  ? JSON.stringify([e.start || null, e.ende || null, !!e.bestaetigt, e.pause !== undefined && e.pause !== null ? Number(e.pause) : null])
  : "null");
const wer = (w) => ({ personId: w && w.personId !== undefined ? w.personId : null, name: (w && w.name) || null, rolle: (w && w.rolle) || null });

/**
 * Einen Antrag stellen — für die eigene Person und einen Stempel der letzten Tage.
 * @param {any} m  gespeicherter Betrieb
 * @param {{personId: (string|number), name?: string, rolle?: string}} von  die antragstellende (eigene) Person
 * @param {{datum: string, start: string, ende: string, pause?: number, grund: string}} rumpf
 * @param {Date} jetzt
 * @param {string} id  Kennung des Antrags
 * @param {string} heute  Berliner Tag
 * @returns {{status: number, grund: string} | {mandant: object, eintrag: object, antrag: object}}
 */
export function antragStellen(m, von, rumpf, jetzt, id, heute) {
  const { datum, start, ende } = rumpf || {};
  const grund = typeof (rumpf && rumpf.grund) === "string" ? rumpf.grund.trim() : "";
  if (!TAG.test(String(datum || ""))) return { status: 400, grund: "Tag fehlt oder ist ungültig (JJJJ-MM-TT)." };
  if (datum > heute) return { status: 422, grund: "Für künftige Tage gibt es keine Korrektur." };
  if (datum < tagPlus(heute, -ANTRAG_RUECKBLICK_TAGE))
    return { status: 422, grund: `Ein Korrekturantrag geht höchstens ${ANTRAG_RUECKBLICK_TAGE} Tage zurück — danach klärt es die Leitung.` };
  if (!UHR.test(String(start || "")) || !UHR.test(String(ende || "")))
    return { status: 422, grund: "Beginn und Ende als Uhrzeit (HH:MM) angeben." };
  const pauseRoh = rumpf.pause;
  const pauseGegeben = pauseRoh !== undefined && pauseRoh !== null && String(pauseRoh) !== "";
  const pause = pauseGegeben ? Number(pauseRoh) : undefined;
  if (start === ende && !geplant24Stunden(m, von.personId, datum)) return { status: 422, grund: BEGINN_GLEICH_ENDE };   // M4 (WP-14b)
  if (pauseGegeben && !(Number.isInteger(pause) && pause >= 0 && pause <= 180))
    return { status: 422, grund: "Die Pause in Minuten angeben (0 bis 180)." };
  /* N3 (WP-14b): Gearbeitet ist, was vorbei ist — ein Ende nach der aktuellen Berliner Uhrzeit ist keine Korrektur. */
  const endeAm = berlinZeitpunkt(ende <= start ? tagPlus(datum, 1) : datum, ende);
  if (endeAm !== null && endeAm > jetzt.getTime())
    return { status: 422, grund: "Das Ende liegt in der Zukunft. Eine Korrektur gilt für Zeiten, die schon vorbei sind." };
  /* Die Pause, mit der die Genehmigung rechnen wird (genannt, sonst zuletzt erfasst, sonst Dienstart; N1),
     gegen die wirkliche Anwesenheit des Tages (Zeitumstellung, M2) — sonst nähme der Antrag an, was die
     Genehmigung später abweist, und er bliebe hängen. */
  const wirksamePause = pauseFuerKorrektur(m, von.personId, datum, pauseGegeben ? pause : undefined);
  if (pauseZuLang(start, ende, wirksamePause, datum))
    return { status: 422, grund: pauseGegeben ? "Die Pause muss kürzer sein als die Anwesenheit von Beginn bis Ende."
      : `Ohne Angabe gilt die bisherige Pause (${wirksamePause} min) — sie muss kürzer sein als die Anwesenheit von Beginn bis Ende. Bitte die Pause angeben.` };
  if (grund.length < KORREKTUR_GRUND_MIN || grund.length > KORREKTUR_GRUND_MAX)
    return { status: 422, grund: `Ein Antrag braucht einen Grund (${KORREKTUR_GRUND_MIN}–${KORREKTUR_GRUND_MAX} Zeichen).` };
  const schluessel = `${von.personId}|${datum}`;
  const stempel = (m.einstempeln || {})[schluessel];
  if (!objekt(stempel))
    return { status: 404, grund: "An diesem Tag gibt es keinen Stempel von dir. Eine Zeit ohne Stempel bestätigst du unter „Zeiten bestätigen“." };
  const bisher = Array.isArray(stempel.antraege) ? stempel.antraege : [];
  if (bisher.some((a) => a && a.status === "offen"))
    return { status: 409, grund: "Für diesen Tag liegt schon ein offener Antrag vor." };
  if (bisher.length >= ANTRAEGE_JE_STEMPEL_MAX)
    return { status: 409, grund: "Für diesen Stempel gibt es schon sehr viele Anträge — bitte die Leitung ansprechen." };
  const ist = (m.erfassung || {})[schluessel];
  const umstellung = zeitumstellungSperre(ist, start, ende);   // F3 (WP-14b): dieselbe Sperre wie die Genehmigung
  if (umstellung) return umstellung;
  if (objekt(ist) && ist.bestaetigt === true && ist.start === start && ist.ende === ende && (!pauseGegeben || ist.pause === pause))
    return { status: 409, grund: "Diese Zeit gilt schon so — nichts zu korrigieren." };
  const antrag = {
    id,
    von: wer(von),
    gestellt: jetzt.toISOString(),
    vorschlag: { start, ende, ...(pauseGegeben ? { pause } : {}) },
    grund,
    /* Das Original und die bisherige Ist-Zeit zum Zeitpunkt des Antrags — damit die Entscheidung sieht, wovon die Rede ist. */
    original: { start: stempel.start || null, ende: stempel.ende || null },
    ist: objekt(ist) ? { start: ist.start || null, ende: ist.ende || null, bestaetigt: !!ist.bestaetigt,
      ...(ist.pause !== undefined ? { pause: ist.pause } : {}) } : null,
    status: "offen",
    entschieden: null,
  };
  const eintrag = { ...stempel, antraege: [...bisher, antrag] };
  return { antrag, eintrag, mandant: { ...m, einstempeln: { ...(m.einstempeln || {}), [schluessel]: eintrag } } };
}

/**
 * Einen Antrag entscheiden: genehmigen (→ Korrekturereignis, Ist ändert sich), ablehnen oder
 * — nur die antragstellende Person — zurückziehen.
 * @param {any} m
 * @param {{personId: (string|number), datum: string, antragId: string, entscheidung: string, begruendung?: string}} r
 * @param {{personId: (string|number|null), name?: (string|null), rolle?: (string|null)}} durch  wer entscheidet
 * @param {Date} jetzt
 * @param {string} korrekturId  Kennung des Korrekturereignisses (nur bei „genehmigt")
 * @param {{nachWiederoeffnung?: (string|null)}} [zusatz]  WP-16: Kennung der Wiederöffnung des Monats für das Korrekturereignis
 * @returns {{status: number, grund: string} | {mandant: object, eintrag: object, antrag: object, erfassung?: object, ereignis?: object, hinweise?: Array<{code: string, text: string}>}}
 */
export function antragEntscheiden(m, r, durch, jetzt, korrekturId, zusatz = {}) {
  const { personId, datum, antragId, entscheidung } = r || {};
  const begruendung = typeof (r && r.begruendung) === "string" ? r.begruendung.trim() : "";
  if (!["genehmigt", "abgelehnt", "zurueckgezogen"].includes(entscheidung))
    return { status: 400, grund: "Entscheidung: genehmigt, abgelehnt oder zurueckgezogen." };
  const schluessel = `${personId}|${datum}`;
  const stempel = (m.einstempeln || {})[schluessel];
  const liste = objekt(stempel) && Array.isArray(stempel.antraege) ? stempel.antraege : [];
  const i = liste.findIndex((a) => a && a.id === antragId);
  if (i < 0) return { status: 404, grund: "Diesen Antrag gibt es nicht." };
  const antrag = liste[i];
  if (antrag.status !== "offen") return { status: 409, grund: "Dieser Antrag ist schon entschieden." };
  if (entscheidung === "zurueckgezogen" && String(antrag.von && antrag.von.personId) !== String(durch.personId))
    return { status: 403, grund: "Zurückziehen kann nur, wer den Antrag gestellt hat." };
  if (entscheidung === "abgelehnt" && (begruendung.length < KORREKTUR_GRUND_MIN || begruendung.length > KORREKTUR_GRUND_MAX))
    return { status: 422, grund: `Eine Ablehnung braucht eine Begründung (${KORREKTUR_GRUND_MIN}–${KORREKTUR_GRUND_MAX} Zeichen).` };

  /** @type {any} */
  const entschieden = { durch: wer(durch), wann: jetzt.toISOString(), ...(begruendung ? { begruendung } : {}) };
  let basis = m;
  let erg = {};
  if (entscheidung === "genehmigt") {
    /* M5 (WP-14b): Der Antrag nennt die Ist-Zeit, von der er ausging. Hat sich die Ist-Zeit seitdem geändert
       (direkte Korrektur, nachgereichtes Ende), überschriebe die Genehmigung diese Änderung ohne Rückfrage.
       Dann 409 — der Antrag bleibt offen; die Leitung lehnt ihn ab, oder die Person stellt einen neuen. */
    if (istStand(antrag.ist) !== istStand((m.erfassung || {})[schluessel]))
      return { status: 409, grund: "Der Antrag ist überholt: Die Ist-Zeit wurde nach dem Antrag geändert. "
        + "Bitte ablehnen (mit Hinweis auf die Änderung) oder einen neuen Antrag stellen lassen." };
    const k = korrekturAnhaengen(m, { personId: String(personId), datum, start: antrag.vorschlag.start, ende: antrag.vorschlag.ende,
      pause: antrag.vorschlag.pause, grund: `Antrag ${antrag.id}: ${antrag.grund}`.slice(0, KORREKTUR_GRUND_MAX) },
    wer(durch), jetzt, korrekturId, { ...zusatz, antrag: { id: antrag.id, vonPersonId: antrag.von ? antrag.von.personId : null } });
    if ("status" in k) return k;
    basis = k.mandant;
    erg = { erfassung: k.erfassung, ereignis: k.ereignis, hinweise: k.hinweise, hinweis: k.hinweis };
    entschieden.korrekturId = korrekturId;
  }
  const neuerAntrag = { ...antrag, status: entscheidung, entschieden };
  const stempelNeu = (basis.einstempeln || {})[schluessel];
  const antraege = (Array.isArray(stempelNeu.antraege) ? stempelNeu.antraege : liste).map((a) => (a && a.id === antrag.id ? neuerAntrag : a));
  const eintrag = { ...stempelNeu, antraege };
  return { ...erg, antrag: neuerAntrag, eintrag,
    mandant: { ...basis, einstempeln: { ...(basis.einstempeln || {}), [schluessel]: eintrag } } };
}
