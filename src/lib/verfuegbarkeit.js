/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { pad, pISO, addDays } from "../regelwerk.js";
import { heute } from "./datum.js";
import { abwesenheitAm, personTag } from "./fachlogik.js";


/** Voreinstellung: 75 Minuten vor Dienstbeginn plus Anfahrt. */
export const WECK_STD = { vorlauf: 75, anfahrt: 20, aktiv: false, nurWerktags: false };

export const minuten = (hhmm) => {
  const [h, mi] = String(hhmm).split(":").map(Number);
  return h * 60 + mi;
};
export const alsZeit = (min) => {
  const m2 = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m2 / 60))}:${pad(m2 % 60)}`;
};

/**
 * Der Weckruf für einen Tag. Gibt auch zurück, ob er in den Vortag fällt —
 * bei einem Frühdienst um 06:00 mit 95 Minuten Vorlauf ist das nicht der
 * Fall, bei einer Nachtschicht um 00:30 sehr wohl.
 */
export function weckzeit(m, personId, datum) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return null;
  const w = { ...WECK_STD, ...(p.weckzeit || {}) };
  if (!w.aktiv) return null;
  if (!imDienst(p, datum) || abwesenheitAm(m, p.id, datum)) return null;
  const t = personTag(m, p, datum);
  if (!t || !t.dienstId) return null;
  const da = m.dienstarten.find((x) => x.id === t.dienstId);
  if (!da) return null;
  if (w.nurWerktags && [0, 6].includes(pISO(datum).getDay())) return null;

  const beginn = minuten(da.start);
  const roh = beginn - w.vorlauf - w.anfahrt;
  return {
    zeit: alsZeit(roh), vortag: roh < 0,
    datum: roh < 0 ? addDays(datum, -1) : datum,
    dienst: da.name, dienstbeginn: da.start,
    vorlauf: w.vorlauf, anfahrt: w.anfahrt,
  };
}

/** Die nächsten Weckrufe — für die Übersicht auf dem Telefon. */
export function kommendeWeckzeiten(m, personId, tage) {
  const out = [];
  for (let i = 0; i <= (tage || 7); i++) {
    const d = addDays(heute(), i);
    const w = weckzeit(m, personId, d);
    if (w) out.push({ ...w, fuerDatum: d });
  }
  return out;
}

/* --------------------------------------------------------------------------
   VERFÜGBARKEIT TEILEN
   Für die Familie: nur „frei" oder „arbeitet". Keine Dienstart, kein Ort,
   kein Betriebsname. Wer den Verweis hat, soll planen können — nicht
   erfahren, wo jemand arbeitet.
   -------------------------------------------------------------------------- */

export function verfuegbarkeitsBild(m, personId, tage) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return [];
  const out = [];
  for (let i = 0; i < (tage || 14); i++) {
    const d = addDays(heute(), i);
    if (!imDienst(p, d)) { out.push({ datum: d, frei: true }); continue; }
    if (abwesenheitAm(m, p.id, d)) { out.push({ datum: d, frei: true }); continue; }
    const t = personTag(m, p, d);
    const da = t && t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
    out.push(da
      /* Nur die grobe Lage — vormittags, nachmittags, nachts. Das reicht
         zum Verabreden und verrät nichts über den Betrieb. */
      ? { datum: d, frei: false, lage: minuten(da.start) < 660 ? "vormittags"
          : minuten(da.start) < 1020 ? "nachmittags" : "nachts" }
      : { datum: d, frei: true });
  }
  return out;
}

/** Gemeinsam freie Tage zweier Bilder — für den Vergleich mit der Familie. */
export const gemeinsamFrei = (a, b) => a
  .filter((x) => x.frei && b.some((y) => y.datum === x.datum && y.frei))
  .map((x) => x.datum);
