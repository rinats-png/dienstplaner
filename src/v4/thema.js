import { C } from "../farben.js";
import { v4AlsAltePalette, V4_FARBEN } from "./tokens.js";
import { v4Stil } from "./stil.js";

/* ==========================================================================
   V4 GLASS — THEMAWAHL

   Reihenfolge: Nutzereinstellung > Systemeinstellung (prefers-color-scheme)
   > heller Fallback. Die Nutzereinstellung ist die Wahl „hell", „dunkel"
   oder „auto" aus den Einstellungen; die Anwendung legt sie nach dem
   Anmelden pro Gerät ab (v4ThemaMerken), damit Anmeldung, Registrierung,
   Fehler- und Ladezustände davor dieselbe Wahl zeigen. „auto" und keine
   Wahl bedeuten: dem System folgen.
   ========================================================================== */

const SCHLUESSEL = "centric.thema";
const WAHL = ["hell", "dunkel", "auto"];

/** Die gemerkte Wahl dieses Geräts, oder null. */
export function v4ThemaGemerkt() {
  try {
    const w = localStorage.getItem(SCHLUESSEL);
    return WAHL.includes(w) ? w : null;
  } catch { return null; }
}

/** Die Wahl der angemeldeten Person für dieses Gerät merken. Unbekanntes wird ignoriert. */
export function v4ThemaMerken(wahl) {
  if (!WAHL.includes(wahl)) return;
  try { localStorage.setItem(SCHLUESSEL, wahl); } catch { /* privater Modus: ohne Merken */ }
}

function systemDunkel() {
  try { return !!window.matchMedia("(prefers-color-scheme: dark)").matches; }
  catch { return false; }
}

/**
 * Reine Auflösung, ohne Browser: welches Erscheinungsbild gilt?
 * @param {string|null|undefined} wahl  Nutzereinstellung (hell|dunkel|auto)
 * @param {boolean|null|undefined} systemIstDunkel  Systemeinstellung, falls bekannt
 * @returns {"hell"|"dunkel"}
 */
export function v4ThemaAufloesen(wahl, systemIstDunkel) {
  if (wahl === "hell") return "hell";
  if (wahl === "dunkel") return "dunkel";
  return systemIstDunkel === true ? "dunkel" : "hell";
}

/** Das für den Einstieg gültige Erscheinungsbild dieses Geräts. */
export const v4ThemaEinstieg = () => v4ThemaAufloesen(v4ThemaGemerkt(), systemDunkel());

/**
 * Den Einstieg in dieses Erscheinungsbild setzen: Stil einhängen, Attribute am
 * Wurzelelement, Grundfarbe, theme-color, und die gemeinsame Palette C auf V4
 * umstellen (die Einstiegsseiten lesen C beim Zeichnen).
 */
export function v4EinstiegAnwenden() {
  const thema = v4ThemaEinstieg();
  Object.assign(C, v4AlsAltePalette(thema));
  try {
    const wurzel = document.documentElement;
    if (!document.getElementById("v4-stil")) {
      const s = document.createElement("style");
      s.id = "v4-stil";
      s.textContent = v4Stil();
      document.head.appendChild(s);
    }
    wurzel.setAttribute("data-v4-aktiv", "");
    wurzel.setAttribute("data-v4-thema", thema);
    wurzel.style.colorScheme = thema === "dunkel" ? "dark" : "light";
    document.body.style.background = V4_FARBEN[thema].bg;
    document.body.style.margin = "0";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", V4_FARBEN[thema].bg);
  } catch { /* ohne DOM: nur die Palette */ }
  return thema;
}

/** Den Einstieg verlassen: Markierung weg, damit die Anwendung ihr eigenes Thema setzt. */
export function v4EinstiegVerlassen() {
  try {
    const wurzel = document.documentElement;
    wurzel.removeAttribute("data-v4-aktiv");
    wurzel.removeAttribute("data-v4-thema");
  } catch { /* egal */ }
}

/** Auf Umstellung des Systemthemas hören (nur sinnvoll ohne feste Wahl). Gibt die Abmeldefunktion zurück. */
export function v4SystemthemaBeobachten(beiAenderung) {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", beiAenderung);
    return () => mq.removeEventListener("change", beiAenderung);
  } catch { return () => {}; }
}
