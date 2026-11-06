/* Gemeinsame Quelle für Darstellungsmodus und Lesbarkeit (aus src/App.jsx herausgelöst, WP-39).
   Der Modus lebt hier genau einmal; App.jsx setzt ihn über dunkelSetzen(), alle Bausteine lesen ihn über istDunkel(). */
import { C } from "../farben.js";
import { aufhellenBis } from "../gestalt/lesbar.js";

let _dunkel = false;
export const istDunkel = () => _dunkel;
export const dunkelSetzen = (dunkel) => { _dunkel = !!dunkel; };

/* Dienstarten: entsättigte Tönungen mit dünner Akzentlinie — keine Farbflächen. */
export const TON = (farbe, staerke = 1) => ({
  background: `${farbe}${staerke > 1 ? "1F" : "12"}`,
  borderLeft: `2.5px solid ${lesbar(farbe, 3)}`,
});

/** Farben von Dienstarten und Einheiten sind Daten, gewählt für hellen Grund. Als Schrift
 *  oder Kante auf dem dunklen Kartengrund werden sie aufgehellt (nur Darstellung, siehe
 *  gestalt/lesbar.js). Im hellen Erscheinungsbild bleibt die Farbe, wie sie ist. */
/* Gegen beide Kartenflächen geprüft: auf `flaecheStill` (karte-still) ist der Grund heller als auf `flaeche`. */
export const lesbar = (farbe, mindest = 4.5) => (istDunkel()
  ? aufhellenBis(aufhellenBis(farbe, C.flaeche, mindest), C.flaecheStill || C.flaeche, mindest) : farbe);

export const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };
