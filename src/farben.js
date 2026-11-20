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
import { v4AlsAltePalette, v4AvatarPaare } from "./v4/tokens.js";

const C = { ...v4AlsAltePalette("hell") };
const C_DUNKEL = v4AlsAltePalette("dunkel");

/* Umschalten ohne Umbau: Statt tausend Verwendungsstellen zu ändern, werden
   die Werte in C ausgetauscht. Wer C.text liest, bekommt danach den dunklen
   Wert — die Anwendung merkt davon nichts. Ein Zähler in der Oberfläche
   erzwingt den Neuaufbau. */
const C_HELL = { ...C };

/* Namenszeichen (Avatar): acht Paare aus den V4-Tokens (v4AvatarPaare) —
   Fläche ist eine Tönung, Schrift die Volltönung, jedes Paar ≥ 4,5:1
   (kontrast.test.js). Im Dunkelmodus dunkle Tönung mit heller Schrift.
   V4-2: vorher standen hier eigene V3-Töne. Reihenfolge: [Fläche, Schrift]. */
const AVATAR_HELL = v4AvatarPaare("hell");
const AVATAR_DUNKEL = v4AvatarPaare("dunkel");
/** Gilt gerade das dunkle Erscheinungsbild? (Einstieg und Anwendung schreiben beide in C.) */
const dunkelAktiv = () => C.bg === C_DUNKEL.bg;
/** Die Paare des gerade gültigen Erscheinungsbildes. */
const avatarToene = () => (dunkelAktiv() ? AVATAR_DUNKEL : AVATAR_HELL);

export { C, C_DUNKEL, C_HELL, AVATAR_HELL, AVATAR_DUNKEL, avatarToene, dunkelAktiv };

/* Die Palette als CSS-Variablen. Sie erreichen Stellen, an die ein
   JavaScript-Objekt nicht kommt: Bildlaufleisten, Auswahlfelder und die
   Datumsauswahl des Browsers. */
export const alsVariablen = (palette) => Object.entries(palette)
  .map(([k, v]) => `--c-${k.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}:${v};`)
  .join("");
