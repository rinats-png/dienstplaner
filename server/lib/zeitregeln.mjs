/* ==========================================================================
   REGELHINWEISE ZU GESTEMPELTEN ZEITEN (WP-14, C3 und C4)

   Eine gestempelte Zeit ohne geplanten Dienst — und jede Korrektur einer
   Ist-Zeit — durchläuft vorher keine der Prüfungen, die der Plan durchläuft.
   Hier laufen sie nach: Pause (§ 4 ArbZG), Tageshöchstzeit (§ 3), Ruhezeit
   (§ 5) gegen die Nachbartage, Mutterschutz und Jugendschutz.

   Es sind Hinweise, keine Absagen: Gearbeitet ist gearbeitet, und die
   Leitung entscheidet mit dem Wissen darüber. Sie stehen im Korrekturereignis
   (`hinweise`) und in der Antwort. Ein Hinweis ist ein Text mit Kennung:
   { code, text }.
   ========================================================================== */

import { brutto, pausePflicht, ruhezeitStunden, HOECHST_TAG } from "./regelwerk.mjs";
import { alterAm } from "./schutzpruefung.mjs";

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const tagPlus = (t, n) => new Date(Date.parse(`${t}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const zeitText = (h) => String(Math.round(h * 10) / 10).replace(".", ",");

/** Nacht im Sinne der Schutzgesetze für Hinweise: vor 6 oder nach 20 Uhr. */
const NACHT_VOR = "06:00", NACHT_NACH = "20:00";
function inderNacht(start, ende) {
  const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  const e = Number(ende.slice(0, 2)) * 60 + Number(ende.slice(3));
  const nv = 6 * 60, nn = 20 * 60;
  return s < nv || s >= nn || e > nn || e <= nv || e <= s;      // über Mitternacht zählt immer
}

/**
 * Auflage C1: Die Pause muss kleiner sein als die Anwesenheit (Beginn bis Ende, auch über Mitternacht).
 * Sonst wäre die Netto-Dauer null oder negativ — und Konto, Lohn und Export mit ihr.
 * @param {string} start "HH:MM"
 * @param {string} ende  "HH:MM"
 * @param {number} pause Minuten
 * @returns {boolean} true, wenn die Pause die Anwesenheit erreicht oder übersteigt
 */
export function pauseZuLang(start, ende, pause) {
  return Number(pause) >= Math.round(brutto({ start, ende }) * 60);
}

/**
 * Hinweise zu einer Ist-Zeit.
 * @param {any} m        Betrieb (personen, erfassung, einstellungen)
 * @param {string|number} personId
 * @param {string} datum "JJJJ-MM-TT"
 * @param {{start: string, ende: string, pause?: (number|null)}} ist
 * @returns {Array<{code: string, text: string}>}
 */
export function regelHinweise(m, personId, datum, ist) {
  const aus = [];
  if (!objekt(ist) || !UHR.test(String(ist.start)) || !UHR.test(String(ist.ende)) || !TAG.test(String(datum))) return aus;
  const pause = Number.isFinite(Number(ist.pause)) && ist.pause !== null ? Number(ist.pause) : 0;
  const dienst = { start: ist.start, ende: ist.ende, pause };
  const anwesend = brutto(dienst);
  const netto = anwesend - pause / 60;
  const p = (m && Array.isArray(m.personen) ? m.personen : []).find((x) => x && String(x.id) === String(personId));
  const alter = p ? alterAm(p.geburtstag, datum) : null;
  const jugendlich = alter !== null && alter < 18;

  /* C4: Pause (§ 4 ArbZG; Jugendliche § 11 JArbSchG, WP-16) — gegen die Anwesenheit gerechnet. */
  const noetig = pausePflicht(netto, jugendlich);
  const norm = jugendlich ? "§ 11 JArbSchG" : "§ 4 ArbZG";
  if (pause < noetig)
    aus.push({ code: "PAUSE", text: pause
      ? `Pause ${pause} min eingetragen, nötig sind ${noetig} min bei ${zeitText(anwesend)} h Anwesenheit (${norm}).`
      : `Keine Pause erfasst, nötig sind ${noetig} min bei ${zeitText(anwesend)} h Anwesenheit (${norm}).` });

  /* Die Pause macht den größten Teil der Anwesenheit aus: ein Hinweis, keine Sperre (die Sperre ist pauseZuLang). */
  if (pause > 0 && pause * 2 > anwesend * 60 && !pauseZuLang(ist.start, ist.ende, pause))
    aus.push({ code: "PAUSE_LANG", text: `Pause ${pause} min bei ${zeitText(anwesend)} h Anwesenheit — die Pause ist der größte Teil der Schicht. Bitte prüfen.` });

  /* C3: Tageshöchstzeit (§ 3 ArbZG). */
  if (netto > HOECHST_TAG)
    aus.push({ code: "TAGESGRENZE", text: `${zeitText(netto)} h netto — mehr als ${HOECHST_TAG} h werktäglich lässt § 3 ArbZG auch mit Ausgleich nicht zu.` });

  /* C3: Ruhezeit (§ 5 ArbZG) zu den bestätigten Zeiten des Vor- und Folgetags. */
  const erf = objekt(m && m.erfassung) ? m.erfassung : {};
  const noetigRuhe = (m && m.einstellungen && Number(m.einstellungen.ruhezeit)) || 11;
  const nachbar = (t) => {
    const e = erf[`${personId}|${t}`];
    return objekt(e) && e.bestaetigt === true && UHR.test(String(e.start)) && UHR.test(String(e.ende)) ? { start: e.start, ende: e.ende } : null;
  };
  const davor = nachbar(tagPlus(datum, -1));
  if (davor) {
    const h = ruhezeitStunden(tagPlus(datum, -1), davor, dienst, 1);
    if (h < noetigRuhe) aus.push({ code: "RUHEZEIT", text: `Nur ${zeitText(h)} h Ruhezeit seit dem Dienst am Vortag (nötig: ${noetigRuhe} h, § 5 ArbZG).` });
  }
  const danach = nachbar(tagPlus(datum, 1));
  if (danach) {
    const h = ruhezeitStunden(datum, dienst, danach, 1);
    if (h < noetigRuhe) aus.push({ code: "RUHEZEIT", text: `Nur ${zeitText(h)} h Ruhezeit bis zum Dienst am Folgetag (nötig: ${noetigRuhe} h, § 5 ArbZG).` });
  }

  /* C3: Mutterschutz und Jugendschutz — Zeiten vor 6 und nach 20 Uhr. */
  if (p && inderNacht(ist.start, ist.ende)) {
    if (p.mutterschutz === true)
      aus.push({ code: "MUTTERSCHUTZ", text: `Arbeit zwischen ${NACHT_NACH} und ${NACHT_VOR} Uhr bei Mutterschutz (§ 5 MuSchG) — bitte prüfen.` });
    if (jugendlich)
      aus.push({ code: "JUGENDSCHUTZ", text: `Arbeit zwischen ${NACHT_NACH} und ${NACHT_VOR} Uhr bei einer Person unter 18 Jahren (§ 14 JArbSchG) — bitte prüfen.` });
  }
  return aus;
}
