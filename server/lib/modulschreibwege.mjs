/* ==========================================================================
   MODULSCHREIBWEGE — Einhängepunkt der Branchenmodule im Schreibweg (WP-19.0)

   Der Schreibweg des Servers (zusammenfuehren, server/lib/rechte.mjs) ruft
   diese Datei an genau einer Stelle — für Planung/Leitung (voll) und
   Schichtverantwortung (einheit), nachdem deren eigene Prüfungen gelaufen
   sind. Neue Module hängen ihren Schreibweg hier ein (MODUL_SCHREIBWEGE)
   statt einer weiteren Zeile in rechte.mjs.

   Zwei Dinge geschehen hier:

     1. Nur-Lesen nach dem Abschalten (Entscheidung G3): Ist ein Modul
        ausgeschaltet oder sein Paket abbestellt (modulNurLesen), sind seine
        Datenfelder (Registry, `datenfelder`) nur lesbar. Ändern oder Löschen
        über den Schreibweg wird abgewiesen; fehlt ein Feld in der
        Übermittlung, füllt der Server es aus dem gespeicherten Stand auf.
        Gelöscht wird nur über die Aufbewahrungsfristen (Datenschutzlauf,
        WP-26) — nie durch Speichern.
     2. Die Schreibwege der Module (Form, Wann/Wer) — in der Reihenfolge der
        Liste. Jeder Eintrag: { modul, felder, zusammen(altM, neuM, ktx) →
        { mandant } | { grund } }. Ein Modul prüft nur seine `felder`; ein
        Grund wird zur Abweisung (403).

   Die fünf Module, die vor WP-19.0 eine eigene Zeile in rechte.mjs bekamen
   (anlagen, maschinenqual, geteilterdienst, posten, bereichsplan), bleiben
   dort; nichts wird umgehängt.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { BRANCHENMODULE, modulVon, modulNurLesen } from "./branchenmodule.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => istObjekt(o) && Object.prototype.hasOwnProperty.call(o, k);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @typedef {{ sitzung?: any, rolle?: string, umfang?: string }} SchreibKontext
 * @typedef {{ modul: string, felder: string[],
 *   zusammen: (altM: any, neuM: any, ktx: SchreibKontext) => ({ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }) }} ModulSchreibweg
 */

/**
 * Die Schreibwege der Module, die nach WP-19.0 dazukommen. Eintragen in
 * WP-19.1 ff. — mit eigener Prüfung in pruefungen/modul-<id>.test.js.
 * @type {readonly ModulSchreibweg[]}
 */
export const MODUL_SCHREIBWEGE = Object.freeze([]);

/**
 * Vertrag der Liste: bekanntes Modul, nur dessen Datenfelder, eine Funktion.
 * @param {readonly any[]} [wege]
 * @param {readonly any[]} [liste]
 * @returns {string[]}
 */
export function pruefeModulSchreibwege(wege = MODUL_SCHREIBWEGE, liste = BRANCHENMODULE) {
  const m = [];
  for (const w of wege) {
    const mod = w && modulVon(w.modul, liste);
    if (!mod) { m.push(`Schreibweg: Modul „${w && w.modul}" unbekannt`); continue; }
    if (typeof w.zusammen !== "function") m.push(`${mod.id}: zusammen fehlt`);
    if (!Array.isArray(w.felder) || !w.felder.length) m.push(`${mod.id}: felder fehlt`);
    for (const f of w.felder || []) if (!mod.datenfelder.includes(f)) m.push(`${mod.id}: Feld „${f}" steht nicht in den Datenfeldern des Moduls`);
  }
  return m;
}

/**
 * Nur-Lesen nach dem Abschalten (G3). Der Schalterstand kommt aus der
 * Übermittlung (nach dem Schreibweg der Moduleinstellungen, also vom Server
 * geprüft), die Pakete aus dem gespeicherten Betrieb (Vertragsfeld).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb
 * @param {readonly any[]} [liste]
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function moduldatenZusammen(altM, neuM, liste = BRANCHENMODULE) {
  if (!istObjekt(altM) || !istObjekt(neuM)) return { mandant: neuM };
  const stand = { ...altM, einstellungen: istObjekt(neuM.einstellungen) ? neuM.einstellungen : altM.einstellungen };
  let aus = neuM;
  for (const mod of liste) {
    if (!mod || !Array.isArray(mod.datenfelder) || !mod.datenfelder.length) continue;
    if (!modulNurLesen(stand, mod.id, liste)) continue;
    for (const feld of mod.datenfelder) {
      if (!hat(aus, feld)) {
        if (hat(altM, feld)) aus = { ...aus, [feld]: altM[feld] };
        continue;
      }
      if (!gleich(altM[feld], aus[feld]))
        return { grund: `Branchenmodul ${mod.name} ist ausgeschaltet; seine Daten (${feld}) sind nur lesbar. `
          + "Gelöscht wird nur nach den Aufbewahrungsfristen." };
    }
  }
  return { mandant: aus };
}

/**
 * Der eine Aufruf aus dem Schreibweg (rechte.mjs): erst Nur-Lesen, dann die
 * Schreibwege der Module.
 * @param {any} altM
 * @param {any} neuM
 * @param {SchreibKontext & { wege?: readonly ModulSchreibweg[], liste?: readonly any[] }} [o]
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function modulSchreibwegeAnwenden(altM, neuM, { wege = MODUL_SCHREIBWEGE, liste = BRANCHENMODULE, ...ktx } = {}) {
  const lesen = moduldatenZusammen(altM, neuM, liste);
  if (lesen.grund) return lesen;
  let aus = lesen.mandant;
  for (const w of wege) {
    const r = w.zusammen(altM, aus, ktx);
    if (!r || r.grund) return { grund: (r && r.grund) || `Branchenmodul ${w.modul}: Schreibweg ohne Ergebnis.` };
    aus = r.mandant;
  }
  return { mandant: aus };
}
