/* ==========================================================================
   OFFENE SCHUTZKONFLIKTE IN DER OBERFLÄCHE (Nachtrag WP-22b, Reste)

   Der Haken useSchutzkonflikte liegt hier (nicht in App.jsx), damit sein
   Verhalten ohne Browser prüfbar ist (react-dom/server in
   pruefungen/schutzkonflikte.test.js):
   - Startwert: die letzte fertige Rechnung für genau diese Sitzung (Betrieb,
     Person, Rolle), sonst leer — nichts „verschwindet“ beim erneuten Zeigen.
   - aktiv=false: keine Rechnung, immer leer (auch wenn etwas gemerkt ist).
   - Das Gemerkte gehört zur Sitzung: Abmelden und Rollenwechsel leeren es
     (vergissSchutzkonflikte), und der Schlüssel trägt Person und Rolle —
     das Ergebnis enthält Personen und darf nie in eine andere Sitzung gelangen.
   ========================================================================== */
import { useEffect, useState } from "react";
import { planeSchutzkonflikte } from "../server/lib/fachpruefung.mjs";

const LEER = new Map();
const LETZTE = new Map();
export const SCHUTZKONFLIKT_VERZOEGERUNG_MS = 250;

/** Schlüssel einer Sitzung: Betrieb, Person und Rolle. */
export const schutzkonfliktSchluessel = (sitz) => `${sitz.mandant.id}|${sitz.person.id}|${sitz.person.rolle}`;
/** Gemerktes Ergebnis oder null. */
export const gemerkteSchutzkonflikte = (schluessel) => LETZTE.get(schluessel) || null;
/** Ergebnis für eine Sitzung merken. */
export const merkeSchutzkonflikte = (schluessel, r) => { LETZTE.set(schluessel, r); };
/** Alles Gemerkte verwerfen (Abmelden, Rollenwechsel). */
export const vergissSchutzkonflikte = () => LETZTE.clear();

/**
 * @param {any} sitz aufgelöste Sitzung (mandant, person)
 * @param {boolean} aktiv false: nicht rechnen, leer zurück
 * @param {(m: any) => any} planFn der Plan der Oberfläche (heute, dienstAm)
 * @param {() => string} heuteFn heutiger Tag — wechselt er, wird neu gerechnet
 */
export function useSchutzkonflikte(sitz, aktiv, planFn, heuteFn) {
  const m = sitz.mandant;
  const schluessel = schutzkonfliktSchluessel(sitz);
  const h = heuteFn();
  const [stand, setStand] = useState(() => ({ schluessel, r: gemerkteSchutzkonflikte(schluessel) || LEER }));
  useEffect(() => {
    if (!aktiv) return undefined;
    return planeSchutzkonflikte(m, planFn(m), (r) => { merkeSchutzkonflikte(schluessel, r); setStand({ schluessel, r }); },
      { verzoegerungMs: LETZTE.has(schluessel) ? SCHUTZKONFLIKT_VERZOEGERUNG_MS : 0 });
  }, [m, h, aktiv, schluessel]);
  /* Wechselt die Sitzung bei eingehängtem Bauteil, gilt nie das Ergebnis der vorigen. */
  return aktiv ? (stand.schluessel === schluessel ? stand.r : gemerkteSchutzkonflikte(schluessel) || LEER) : LEER;
}
