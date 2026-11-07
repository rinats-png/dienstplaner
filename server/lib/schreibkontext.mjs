/* ==========================================================================
   SCHREIBKONTEXT (WP-16c)

   Wer schreibt gerade? Der Handler (funktionen/daten.mjs) setzt die handelnde Person einmal je Anfrage; der gemeinsame
   Schreibpunkt (bestand.mjs, bestandSchreiben) liest sie, um bei einer offenen Korrekturrevision die Mitwirkenden zu
   vermerken (monatsabschluss.mjs, korrekturAutorVermerken) — für JEDEN Schreibweg, nicht je Endpunkt. Ohne Kontext
   (Löschlauf, Sicherung, Prüfungen) wird nichts vermerkt.
   ========================================================================== */
import { AsyncLocalStorage } from "node:async_hooks";

/** @type {AsyncLocalStorage<{person: (string|number|null)}>} */
export const schreibKontext = new AsyncLocalStorage();
