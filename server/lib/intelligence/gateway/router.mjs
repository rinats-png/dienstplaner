/* ==========================================================================
   INTELLIGENCE-GATEWAY — ROUTER: FUNKTION → STARTSTUFE (WP-I13)

   Reine, deterministische Tabelle nach CENTRIC-INTELLIGENCE.md 6.3.
   Stufen sind NUMMERN (1 = Haiku-Klasse, 2 = Sonnet-Klasse, 3 = Opus-Klasse);
   welches Modell dahintersteht, entscheidet allein der Adapter / die
   Betreiberkonfiguration (Model Registry, WP-I18). Wechsel nur NACH OBEN.

   Nicht in der Tabelle (Spezifikation nennt keine Startstufe): F6, F13, F16,
   F17, F18 — und F8/F7B hängen an der Sichtung. Für sie liefert der Router
   null; das Gateway verweigert sie (KI_FUNKTION), bis das entschieden ist
   (wpI-offene-fragen.md).
   ========================================================================== */

export const STARTSTUFE = Object.freeze({
  F1: 1, F2: 1, F5: 1, F9: 1, F7A: 1, F15: 1,
  F4: 1, F10: 1, F11: 1, F12: 1, F14: 1,
  F3: 2,
});

/** @returns {1|2|3|null} */
export function startstufe(funktion) {
  return Object.prototype.hasOwnProperty.call(STARTSTUFE, funktion) ? STARTSTUFE[funktion] : null;
}

/** Die Kette einer Funktion: von der Startstufe bis zur höchsten erlaubten (nur aufwärts). */
export function stufenKette(funktion, hoechste = 3) {
  const s = startstufe(funktion);
  if (s === null || !Number.isInteger(hoechste) || hoechste < s) return [];
  const kette = [];
  for (let i = s; i <= Math.min(3, hoechste); i++) kette.push(i);
  return kette;
}
