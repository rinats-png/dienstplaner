/* ==========================================================================
   FARBEN — die eine Quelle

   Diese Palette stand dreifach im Quelltext: als C in App.jsx, noch einmal
   als C in pruefung.jsx und als gekürztes F in main.jsx. Eine Farbänderung
   musste an drei Stellen nachgezogen werden, und beim Umbau auf den
   helleren Grund fiel sofort auf, dass die Anmeldeseite den alten Ton
   behalten hatte.

   Jetzt gibt es eine Datei. Wer C verändert — themaSetzen tut das beim
   Umschalten auf Dunkel — verändert sie für alle Teile zugleich, weil alle
   dasselbe Objekt vor sich haben.
   ========================================================================== */

/* V4 Glass (Phase 2): Die Werte kommen aus src/v4/tokens.js, der einen Quelle.
   Hier steht keine Farbe mehr; die Form (die Schlüssel von C) blieb, damit die
   Oberfläche, die C.text, C.accent … liest, unverändert weiterläuft. Die
   Verlaufs- und Kopfzeilenwerte sind Deckkräfte, deren Kontrast
   pruefungen/kontrast.test.js und v4-tokens.test.js nachrechnen. */
import { v4AlsAltePalette } from "./v4/tokens.js";

const C = { ...v4AlsAltePalette("hell") };
const C_DUNKEL = v4AlsAltePalette("dunkel");

/* Umschalten ohne Umbau: Statt tausend Verwendungsstellen zu ändern, werden
   die Werte in C ausgetauscht. Wer C.text liest, bekommt danach den dunklen
   Wert — die Anwendung merkt davon nichts. Ein Zähler in der Oberfläche
   erzwingt den Neuaufbau. */
const C_HELL = { ...C };

/* Namenszeichen (Avatar): acht Paare aus der Palette — Fläche ist die
   Tönung, Schrift die Volltönung, jedes Paar ≥ 4,5:1 (kontrast.test.js).
   Im Dunkelmodus dunkle Tönung mit heller Schrift. Die Paare stehen hier
   und nicht in der Oberfläche, damit keine Farbe außerhalb dieser Datei
   erfunden wird. Reihenfolge: [Fläche, Schrift]. */
const AVATAR_HELL = [
  ["#DFF0F0", "#017070"], ["#E4EDF1", "#316C81"], ["#DFF0F0", "#023441"], ["#FFE0C0", "#955410"],
  ["#DFEFE7", "#0E6B45"], ["#E4E9F1", "#35506B"], ["#ECEAF3", "#4C4668"], ["#DFEFE7", "#2E6B4F"],
];
const AVATAR_DUNKEL = [
  ["#13292C", "#3FBFBF"], ["#152A33", "#7FC4DC"], ["#13292C", "#7FE0E0"], ["#2A2013", "#F0B060"],
  ["#0F2620", "#4ADE9B"], ["#16222E", "#8FB1D4"], ["#1E1B2C", "#B5AEDB"], ["#122820", "#7FD1A6"],
];
/** Die Paare des gerade gültigen Erscheinungsbildes. */
const avatarToene = () => (C.bg === C_DUNKEL.bg ? AVATAR_DUNKEL : AVATAR_HELL);

export { C, C_DUNKEL, C_HELL, AVATAR_HELL, AVATAR_DUNKEL, avatarToene };

/* Die Palette als CSS-Variablen. Sie erreichen Stellen, an die ein
   JavaScript-Objekt nicht kommt: Bildlaufleisten, Auswahlfelder und die
   Datumsauswahl des Browsers. */
export const alsVariablen = (palette) => Object.entries(palette)
  .map(([k, v]) => `--c-${k.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}:${v};`)
  .join("");
