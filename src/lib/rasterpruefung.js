/* ==========================================================================
   WP-I2 — LIVE-PRÜFUNG DES ZYKLUSRASTERS

   Keine eigene Regellogik: Der Plan wird aus dem Raster berechnet, und die
   bestehende Planprüfung (pruefen) bewertet ihn. Diese Datei wählt nur das
   Fenster (ein voller Zyklus ab dem Montag der laufenden Woche, damit jeder
   Startpunkt einer Einheit einmal vorkommt) und die Befundarten, die vom
   Raster abhängen. Besetzung, Quoten und Qualifikationen hängen am Tagesplan,
   nicht am Raster, und gehören nicht dazu.
   ========================================================================== */
import { pruefen } from "./fachlogik.js";
import { heute } from "./datum.js";
import { addDays, montag } from "../regelwerk.js";

/** Befundarten, die das Raster erzeugen kann (Ruhezeit, Folge, Höchstarbeitszeit, Ausgleich, Schutz). */
export const RASTER_ARTEN = ["ruhezeit", "folge", "nachtfolge", "tagesgrenze", "pause", "ersatzruhe", "sonntagsfrei", "schutz"];
const STUFE = { danger: 0, warn: 1, info: 2 };

/** Befunde des Rasters im Zustand von `m` (auch ungespeichert). `datum` nur für Tests. */
export function rasterBefunde(m, datum = heute()) {
  const len = Math.max(7, (m.zyklus && m.zyklus.tage ? m.zyklus.tage.length : 7));
  const von = montag(datum);
  const bis = addDays(von, len - 1);
  const arten = new Set(RASTER_ARTEN);
  const befunde = pruefen(m, von, bis).filter((b) => arten.has(b.art));
  const je = new Map();
  for (const b of befunde) {
    const g = je.get(b.art) || { art: b.art, schwere: b.schwere, anzahl: 0, beispiel: b };
    g.anzahl++;
    if ((STUFE[b.schwere] ?? 9) < (STUFE[g.schwere] ?? 9)) { g.schwere = b.schwere; g.beispiel = b; }
    je.set(b.art, g);
  }
  const gruppen = [...je.values()].sort((a, b) => (STUFE[a.schwere] ?? 9) - (STUFE[b.schwere] ?? 9) || RASTER_ARTEN.indexOf(a.art) - RASTER_ARTEN.indexOf(b.art));
  return { von, bis, befunde, gruppen };
}
