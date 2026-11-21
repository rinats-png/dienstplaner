/* V4-3b: Zuordnungsregel der Inline-Radien auf die Radiusstufen V4_RADIEN (src/v4/tokens.js), gemeinsam für die
   Prüfungen je Hauptansicht (v4-3b-plan.test.js, v4-3b-personal.test.js). Nur für Tests; keine Laufzeitwirkung.

   Regel (wie V4-3a, Nachtrag V4-3b in docs/acc45/V4-IST-STAND-2026-11-20.md):
     - Radius >= halbe kleinere Kante (Punkte, Leisten) oder 999 → pille (der Browser kappt auf dieselbe Form);
     - sonst gleicher Wert → gleiche Stufe, sonst die nächste Stufe; bei Gleichstand die größere
       (10 → mittel wie .slink in V4-3a). */
import { V4_RADIEN } from "../src/v4/tokens.js";
import { ohneKommentare } from "../werkzeug/v4-inventar.mjs";

const FESTE_STUFEN = Object.entries(V4_RADIEN).filter(([s]) => s !== "pille").map(([s, px]) => [s, parseFloat(px)]);

/** Stufe für einen alten Radius `alt` (px); `kante` = kleinere Kante des Elements (px), falls fest. */
export function regelStufe(alt, kante) {
  if (alt >= 999 || (kante !== undefined && alt >= kante / 2)) return "pille";
  let beste = null;
  for (const [s, px] of FESTE_STUFEN) {
    const d = Math.abs(px - alt);
    if (!beste || d <= beste.d) beste = { s, d };
  }
  return beste.s;
}

/** Radiusstufen im Quelltext (ohne Kommentare) in Reihenfolge: var(--v4-r-<stufe>). */
export const stufenIn = (text) => [...ohneKommentare(text).matchAll(/var\(--v4-r-([a-z]+)\)/g)].map((m) => m[1]);
