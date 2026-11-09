/* ==========================================================================
   INTELLIGENCE-GATEWAY — NAMENSPOLITIK VOR FREITEXT-FUNKTIONEN (WP-I13)

   Bedingung 6 aus wp-i11-nachweis.md: bevor eine Funktion mit Fremdtext
   (Positivliste `fremdtext: true`: F5, F6, F7A, F9, F16) freigeschaltet
   wird, ist die Namenspolitik festgelegt. Sie ist ein Entscheidungsdatensatz
   der Produktverantwortung, KEINE Personendaten:

     version        Kennung der Fassung (z. B. "np-1")
     sperrliste     "betrieb"   — Sperrliste aus dem ganzen gespeicherten Betrieb
     kurznamen      "sperren"   — kurze Namen sperren (mehr Falsch-Positive, fail closed)
     doppelgaenger  "sperren"   — Doppelgänger-Zeichen normalisieren und sperren
     fremdeSchrift  "sperren"   — Text in fremder Schrift sperren
     freigabe       "produktverantwortung" — wer festgelegt hat (Rolle, nie ein Name)

   Jeder andere Wert ist keine Namenspolitik. Eine lockere Politik gibt es
   hier bewusst nicht: wer sie lockern will, ändert diese Datei mit Review.

   INVARIANTEN
   N1  Ohne gültige Namenspolitik verweigert das Gateway jede Freitext-Funktion
       vor Limits, Bestand und Anbieter (KI_FUNKTION, grund "namenspolitik").
   N2  Eine übergebene, aber ungültige Politik ist ein Konfigurationsfehler:
       das Gateway startet nicht (KI_INTERN) — es sperrt nicht still und
       öffnet nie.
   N3  Nur eigene Felder, genau diese Felder; Ergebnis ist eine eingefrorene Kopie.
   ========================================================================== */

import { KiFehler } from "../fehler.mjs";

export const NAMENSPOLITIK_WERTE = Object.freeze({
  sperrliste: "betrieb",
  kurznamen: "sperren",
  doppelgaenger: "sperren",
  fremdeSchrift: "sperren",
  freigabe: "produktverantwortung",
});
const SCHLUESSEL = Object.freeze(["version", ...Object.keys(NAMENSPOLITIK_WERTE)].sort());
const VERSION = /^np-[0-9a-z.-]{1,32}$/;

/**
 * @param {unknown} p
 * @returns {Readonly<{ version: string, sperrliste: string, kurznamen: string, doppelgaenger: string, fremdeSchrift: string, freigabe: string }>}
 */
export function namenspolitikPruefen(p) {
  const ungueltig = () => new KiFehler("KI_INTERN", "Namenspolitik ungültig.");
  if (!p || typeof p !== "object" || Array.isArray(p) || Object.getPrototypeOf(p) !== Object.prototype) throw ungueltig();
  const eigene = Object.getOwnPropertyNames(p).sort();
  if (eigene.length !== SCHLUESSEL.length || eigene.some((k, i) => k !== SCHLUESSEL[i])) throw ungueltig();
  if (typeof p.version !== "string" || !VERSION.test(p.version)) throw ungueltig();
  for (const [k, soll] of Object.entries(NAMENSPOLITIK_WERTE)) if (p[k] !== soll) throw ungueltig();
  return Object.freeze({ version: p.version, ...NAMENSPOLITIK_WERTE });
}
