/* ==========================================================================
   BROWSER-ABNAHME V4 — reine Bewertungsfunktionen

   Kein Browser, kein Netz, kein Dateizugriff. Die Funktionen bekommen
   Messwerte, die pruefungen/browser/v4-abnahme.mjs im Browser einsammelt,
   und sagen, ob sie einem Kriterium genügen. Getrennt gehalten, damit die
   Bewertung ohne Chromium unter vitest geprüft werden kann
   (pruefungen/browser-abnahme-kern.test.js).

   Kriterien (WCAG 2.2): 1.4.10 Reflow, 2.4.7 Fokus sichtbar, 2.4.11 Fokus
   nicht verdeckt, 2.5.8 Zielgröße (Mindestmaß), 3.3.1 Fehlerbenennung.
   ========================================================================== */

/** Die Abnahme läuft nur gegen die eigene Maschine. Alles andere ist ein Fehlaufruf. */
export function istLoopback(basis) {
  let u;
  try { u = new URL(basis); } catch { return false; }
  if (u.protocol !== "http:") return false;
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
}

/** 1.4.10: Die Seite darf bei 320 CSS-Pixeln nicht breiter sein als das Fenster (1 px Rundungsspielraum). */
export function reflowOk(scrollWidth, fensterBreite, toleranz = 1) {
  return Number.isFinite(scrollWidth) && Number.isFinite(fensterBreite) && scrollWidth - fensterBreite <= toleranz;
}

/**
 * 2.5.8 Zielgröße (Mindestmaß, AA): ein Ziel besteht, wenn es mindestens `min` x `min` CSS-Pixel misst.
 * Ausnahmen der Norm, soweit messbar:
 *  - Abstand: ein Kreis von `min` Durchmesser um die Mitte des Ziels schneidet kein anderes Ziel
 *    und keinen Kreis eines anderen zu kleinen Ziels.
 *  - Inline: Ziel steht in einem Satz oder Textblock (inline === true).
 * ziele: [{ id, x, y, w, h, inline? }] in Seitenkoordinaten. Rückgabe: die Ziele, die NICHT bestehen.
 */
export function zielgroessenBefunde(ziele, min = 24) {
  const r = min / 2;
  const mitte = (z) => ({ cx: z.x + z.w / 2, cy: z.y + z.h / 2 });
  const kreisSchneidetRechteck = (c, z) => {
    const nx = Math.max(z.x, Math.min(c.cx, z.x + z.w));
    const ny = Math.max(z.y, Math.min(c.cy, z.y + z.h));
    return (c.cx - nx) ** 2 + (c.cy - ny) ** 2 < r * r;
  };
  const klein = (z) => z.w < min || z.h < min;
  const befunde = [];
  for (const z of ziele) {
    if (!klein(z) || z.inline) continue;
    const c = mitte(z);
    const kollidiert = ziele.some((a) => {
      if (a === z) return false;
      if (kreisSchneidetRechteck(c, a)) return true;
      if (klein(a) && !a.inline) { const d = mitte(a); return (c.cx - d.cx) ** 2 + (c.cy - d.cy) ** 2 < min * min; }
      return false;
    });
    if (kollidiert) befunde.push(z);
  }
  return befunde;
}

/**
 * 2.4.7: Hat das fokussierte Element einen sichtbaren Fokusindikator?
 * Eingabe: berechnete Stile des Elements im Fokus (nach Tastaturbedienung, also :focus-visible).
 */
export function fokusSichtbar({ outlineStyle, outlineWidth, outlineColor, boxShadow, borderColor, borderColorFokusfrei } = {}) {
  const breite = parseFloat(outlineWidth);
  const linie = outlineStyle && outlineStyle !== "none" && breite >= 1 && !/^rgba\([^)]*,\s*0\)$/.test(outlineColor || "");
  const schatten = typeof boxShadow === "string" && boxShadow !== "none" && boxShadow.trim() !== "";
  const rahmenWechsel = !!borderColor && !!borderColorFokusfrei && borderColor !== borderColorFokusfrei;
  return !!(linie || schatten || rahmenWechsel);
}

/**
 * 2.4.11: Der Fokus darf nicht vollständig von festen Inhalten verdeckt sein. Eingabe: Rechteck des
 * Elements und der Treffer in dessen Mitte und Ecken (Element selbst, Nachfahre oder Vorfahre = frei).
 * Rückgabe true, wenn mindestens einer der Prüfpunkte frei ist.
 */
export function fokusNichtVerdeckt(punkte) {
  return Array.isArray(punkte) && punkte.some((p) => p && p.frei === true);
}

/** 3.3.1: Ein Fehler ist benannt, wenn ein sichtbarer Text da ist (nicht nur Farbe oder Symbol). */
export function fehlertextOk(meldungen, mindestZeichen = 8) {
  const liste = (Array.isArray(meldungen) ? meldungen : []).map((t) => String(t || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return liste.length > 0 && liste.some((t) => t.length >= mindestZeichen && /[A-Za-zÄÖÜäöüß]{3}/.test(t));
}

/** Zusammenfassung für die Ausgabe: Befunde nach Art gezählt. */
export function zaehleBefunde(befunde) {
  const nach = {};
  for (const b of befunde) nach[b.k] = (nach[b.k] || 0) + 1;
  return nach;
}
