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

/* Die Geometrie im 100×100-Feld (neues-logo/centric-bildmarke.svg): ein
   dunkles Quadrat, ein weißes C als offener Bogen, ein Punkt in der Öffnung.
   Die Markenfarben sind fest und folgen nicht dem Farbschema der Oberfläche. */
const MARKENFARBE = { grund: "#10222A", c: "#FFFFFF", punkt: "#0B7C7C" };
const GRUND = { x: 0, y: 0, b: 100, r: 23 };
const BOGEN = "M66.7 36.6 A20.5 20.5 0 1 0 66.7 63.4";
const BOGEN_BREITE = 10.4;
const PUNKT = { x: 69, y: 50, r: 5.1 };

/**
 * Die Bildmarke als Vektor.
 *
 * Übrige Eigenschaften gehen an das SVG. Die Startsequenz hängt darüber
 * `data-marke-ziel` an die Marke im Seitenkopf und misst deren Rechteck —
 * dort landet sie am Ende ihrer Reise. `id` bleibt für bestehende Aufrufer
 * erhalten; die Zeichnung braucht keine Verlaufs- oder Beschneidungsnamen mehr.
 */
export function Marke({ size = 38, id = "m", style, ...rest }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
      {...rest} style={{ display: "block", flexShrink: 0, ...style }}>
      <rect x={GRUND.x} y={GRUND.y} width={GRUND.b} height={GRUND.b} rx={GRUND.r} fill={MARKENFARBE.grund} />
      <path d={BOGEN} stroke={MARKENFARBE.c} fill="none" strokeWidth={BOGEN_BREITE} strokeLinecap="round" />
      <circle cx={PUNKT.x} cy={PUNKT.y} r={PUNKT.r} fill={MARKENFARBE.punkt} />
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
 * Der Bogen ist der Kreisbogen aus BOGEN: Radius 20,5, von (66,7 | 36,6)
 * gegen den Uhrzeigersinn über links nach (66,7 | 63,4). Der Mittelpunkt
 * folgt aus der Sehne, damit Canvas und Vektor dieselbe Linie zeichnen.
 *
 * `palette` bleibt als Parameter, damit die Aufrufer unverändert sind; die
 * Markenfarben sind fest und werden nicht aus der Palette gelesen.
 */
export function markeAufCanvas(c, groesse, palette) {
  const s = groesse / 100;
  c.save();
  c.scale(s, s);

  c.fillStyle = MARKENFARBE.grund; rr(c, GRUND.x, GRUND.y, GRUND.b, GRUND.b, GRUND.r); c.fill();

  const R = 20.5, ex = 66.7, ey1 = 36.6, ey2 = 63.4;
  const halbe = (ey2 - ey1) / 2, my = (ey1 + ey2) / 2;
  const cx = ex - Math.sqrt(R * R - halbe * halbe);
  const w = Math.atan2(halbe, ex - cx);
  c.strokeStyle = MARKENFARBE.c; c.lineWidth = BOGEN_BREITE; c.lineCap = "round";
  c.beginPath();
  c.arc(cx, my, R, -w, w, true);
  c.stroke();

  c.fillStyle = MARKENFARBE.punkt;
  c.beginPath(); c.arc(PUNKT.x, PUNKT.y, PUNKT.r, 0, Math.PI * 2); c.fill();

  c.restore();
}
