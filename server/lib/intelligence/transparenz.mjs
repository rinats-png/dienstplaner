/* ==========================================================================
   INTELLIGENCE — TRANSPARENZANSICHT (WP-I16, Teil 1)

   Eine lesende Struktur für die Betriebssteuerung: welche Funktionen es gibt,
   ob sie im Betrieb an oder aus sind, wer das wann gesetzt hat (nur Rolle und
   Zeit, nie Namen) und welche Datenkategorien die Funktion überhaupt nutzen
   darf (aus der Positivliste, ohne Dateninhalt).

   - Rein: bekommt den schon gelesenen Stand (kiSteuerungLesen, server/lib/ki-steuerung.mjs)
     und liest weder Bestand noch Umgebung.
   - Sichtbar für Leitung, Planung und Betriebsrat. Der Plan nennt für Beschäftigte und
     Schichtverantwortung nichts (die Mitarbeiterinformation ist ein eigenes Paket):
     sie bekommen null.
   - Ist der Prozessschalter nicht „an“, steht dort nur „nicht verfügbar“ — keine Funktionsliste,
     keine Behauptung, dass etwas laufe.
   ========================================================================== */

import { FELDER } from "./felder.mjs";
import { FUNKTIONEN_IDS } from "./schemas.mjs";
import { FUNKTIONEN, FREISCHALTUNG_GESPERRT } from "./positivliste.mjs";

/** Rollen, die die Transparenzansicht sehen. */
export const TRANSPARENZ_ROLLEN = Object.freeze(["leitung", "planer", "betriebsrat"]);

/** Datenkategorien (Präfix des Feldnamens → Klartext). Unbekannte Präfixe zeigen den Präfix selbst. */
export const KATEGORIE_TEXT = Object.freeze({
  schicht: "Schichten und Dienste",
  dienstart: "Dienstarten und Zeiten",
  zyklus: "Schichtfolge",
  qualifikation: "Qualifikationen (Katalog)",
  einheit: "Bereiche",
  person: "Personen (nur als Alias, ohne Namen)",
  abwesenheit: "Abwesenheitszeiträume (ohne Art und Grund)",
  befund: "Regelbefunde",
  kandidat: "Ersatzkandidaten (Alias)",
  konto: "Stundenkonto (Plan)",
  ruhezeit: "Geplante Ruhezeiten",
  aenderung: "Planänderungen (Art)",
  besetzung: "Besetzung je Dienst und Tag",
  kennzahl: "Kennzahlen ohne Personenbezug",
  regel: "Regelarten",
});

const kategorien = (felder) => {
  const nach = new Map();
  for (const f of felder) {
    const k = String(f).split(".")[0];
    if (!nach.has(k)) nach.set(k, []);
    nach.get(k).push(f);
  }
  return [...nach.entries()].map(([k, fs]) => ({ kategorie: k, text: Object.hasOwn(KATEGORIE_TEXT, k) ? KATEGORIE_TEXT[k] : k,
    felder: fs.map((f) => ({ feld: f, zweck: Object.hasOwn(FELDER, f) ? FELDER[f].zweck : "" })) }));
};

const stempel = (x) => (x && typeof x === "object" ? { am: typeof x.am === "string" ? x.am : null, vonRolle: typeof x.vonRolle === "string" ? x.vonRolle : null } : null);

/**
 * @param {null | { betrieb: any, funktionen: Record<string, any>, betriebsratFrage: any, pause: any, pauseUngueltig?: boolean, protokoll: any[] }} zustand
 * @param {string} rolle
 * @param {{ prozess?: unknown }} [o]
 * @returns {null | { verfuegbar: false } | { verfuegbar: true, betrieb: any, betriebsratFrage: any, pause: any, funktionen: any[], protokollZahl: number }}
 */
export function transparenz(zustand, rolle, o = {}) {
  if (typeof rolle !== "string" || !TRANSPARENZ_ROLLEN.includes(rolle)) return null;
  if (!o || o.prozess !== "an") return { verfuegbar: false };
  const z = zustand && typeof zustand === "object" ? zustand : null;
  const fn = z && z.funktionen && typeof z.funktionen === "object" ? z.funktionen : {};
  return {
    verfuegbar: true,
    betrieb: { an: !!(z && z.betrieb && z.betrieb.an === true), ...(z && z.betrieb ? stempel(z.betrieb) : { am: null, vonRolle: null }) },
    betriebsratFrage: z && z.betriebsratFrage ? { antwort: z.betriebsratFrage.antwort, ...stempel(z.betriebsratFrage) } : null,
    pause: { aktiv: !!(z && (z.pauseUngueltig || (z.pause && z.pause.aktiv === true))), ...(z && z.pause ? stempel(z.pause) : { am: null, vonRolle: null }) },
    funktionen: FUNKTIONEN_IDS.map((id) => {
      const e = FUNKTIONEN[id];
      const s = Object.hasOwn(fn, id) ? fn[id] : null;
      return { id, name: e.name, klasse: e.klasse, zweck: e.zweck, rollen: [...e.rollen], personenbezug: e.personenbezug, fremdtext: e.fremdtext,
        gesperrt: Object.hasOwn(FREISCHALTUNG_GESPERRT, id), an: !!(s && s.an === true), ...(s ? stempel(s) : { am: null, vonRolle: null }),
        datenkategorien: kategorien(e.felder) };
    }),
    protokollZahl: z && Array.isArray(z.protokoll) ? z.protokoll.length : 0,
  };
}
