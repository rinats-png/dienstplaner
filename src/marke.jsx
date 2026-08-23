/* ==========================================================================
   DIE BILDMARKE — einmal als Vektor, einmal für das Canvas

   Die Zeichnung stand zweimal im Quelltext: als Logo() in App.jsx und als
   Marke() in main.jsx, wo ein Kommentar die Dopplung bereits anmerkte. Mit
   der Startsequenz kam eine dritte Fassung dazu, die dieselbe Form auf ein
   Canvas malt — spätestens damit gehört sie an eine Stelle.

   Beide Fassungen zeichnen dieselben Pfade in derselben Reihenfolge. Das
   ist keine Kosmetik: Die Startsequenz tastet die Canvas-Fassung ab und
   blendet danach auf die Vektorfassung um. Liefen die beiden auseinander,
   wäre der Wechsel als Ruck zu sehen.
   ========================================================================== */
import React from "react";
import { C } from "./farben.js";

/* Die Geometrie im 100×100-Feld. Drei Balken, ein Schwung im obersten,
   eine Linie, die von rechts oben nach links unten durchläuft. */
const BALKEN = [
  { y: 8, ton: "sidebar" },
  { y: 37, ton: "marke" },
  { y: 66, ton: "sidebar" },
];
const SCHWUNG = "M52 8 C74 8 66 34 94 34 L94 8 Z";
const LINIE = "M92 26 C99 30 99 41 90 45 C78 50 62 44 50 47 C38 50 26 58 20 63 C13 69 13 78 20 82";

/**
 * Die Bildmarke als Vektor.
 *
 * `id` trennt die Farbverlaufs- und Beschneidungsnamen. Ohne das teilen
 * sich mehrere Marken auf einer Seite dieselbe `<defs>`-Kennung, und die
 * zweite zeigt den Verlauf der ersten.
 *
 * Übrige Eigenschaften gehen an das SVG. Die Startsequenz hängt darüber
 * `data-marke-ziel` an die Marke im Seitenkopf und misst deren Rechteck —
 * dort landet sie am Ende ihrer Reise.
 */
export function Marke({ size = 38, id = "m", style, ...rest }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
      {...rest} style={{ display: "block", flexShrink: 0, ...style }}>
      <defs>
        <linearGradient id={`${id}g`} x1="55%" y1="0%" x2="100%" y2="70%">
          <stop offset="0%" stopColor={C.sidebar} /><stop offset="100%" stopColor={C.accent} />
        </linearGradient>
        <clipPath id={`${id}c`}><rect x="6" y="8" width="88" height="26" rx="13" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect x="6" y="8" width="88" height="26" rx="13" fill={C.sidebar} />
        <path d={SCHWUNG} fill={`url(#${id}g)`} />
      </g>
      <rect x="6" y="37" width="88" height="26" rx="13" fill={C.marke} />
      <rect x="6" y="66" width="88" height="26" rx="13" fill={C.sidebar} />
      <path d={LINIE} stroke={C.sidebar} strokeWidth="1.9" fill="none"
        strokeLinecap="round" opacity=".92" />
    </svg>);
}

/** Abgerundetes Rechteck, auch für Browser ohne `roundRect`. */
function rr(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Dieselbe Marke auf ein Canvas, `groesse` Punkte im Quadrat.
 *
 * `palette` wird ausdrücklich übergeben statt aus C gelesen: Die
 * Startsequenz tastet die Marke einmal ab und braucht dabei die Palette,
 * die am Ende der Sequenz gilt — nicht die, die zufällig gerade in C
 * steht, während die Anwendung darunter noch auf Dunkel umschaltet.
 */
export function markeAufCanvas(c, groesse, palette) {
  const s = groesse / 100;
  c.save();
  c.scale(s, s);

  c.fillStyle = palette.sidebar; rr(c, 6, 8, 88, 26, 13); c.fill();

  c.save();
  rr(c, 6, 8, 88, 26, 13); c.clip();
  const g = c.createLinearGradient(55, 0, 100, 70);
  g.addColorStop(0, palette.sidebar); g.addColorStop(1, palette.accent);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(52, 8); c.bezierCurveTo(74, 8, 66, 34, 94, 34);
  c.lineTo(94, 8); c.closePath(); c.fill();
  c.restore();

  c.fillStyle = palette.marke; rr(c, 6, 37, 88, 26, 13); c.fill();
  c.fillStyle = palette.sidebar; rr(c, 6, 66, 88, 26, 13); c.fill();

  c.strokeStyle = palette.sidebar; c.lineWidth = 1.9;
  c.lineCap = "round"; c.globalAlpha = 0.92;
  c.beginPath();
  c.moveTo(92, 26);
  c.bezierCurveTo(99, 30, 99, 41, 90, 45); c.bezierCurveTo(78, 50, 62, 44, 50, 47);
  c.bezierCurveTo(38, 50, 26, 58, 20, 63); c.bezierCurveTo(13, 69, 13, 78, 20, 82);
  c.stroke();

  c.restore();
}

export { BALKEN };
