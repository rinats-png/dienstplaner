/* ==========================================================================
   RINGREGLER — ein Wert, im Kreis eingestellt

   Dasselbe Bauteil, das auf der Website im Preisrechner steht. Die Form
   kommt aus dem Rotationsdiagramm der Marke: Segmente auf einem Ring,
   gefüllt bis zum eingestellten Wert, die Zahl in der Mitte.

   Drei Entscheidungen, die von der ersten Skizze abweichen — jede aus
   einem Grund, der sich am Bildschirm zeigt:

   Erstens ist der Ring unten offen. Ein geschlossener Ring hat an zwölf
   Uhr eine Naht, an der das Kleinste und das Größte aneinanderstoßen. Wer
   dort vorbeizieht, springt von dreißig Standorten auf einen. Die Öffnung
   von sechzig Grad macht aus der Naht einen Anschlag: über das Ende hinaus
   passiert nichts.

   Zweitens bleibt vom leeren Teil der Skala fast nur der Strich. Die
   freien Stufen sind schmale, blasse Kerben auf der Führungsspur — genug,
   um zu zeigen, wo die Rasten sitzen, zu wenig, um mit dem eingestellten
   Wert zu konkurrieren. Hell wird allein, was belegt ist.

   Die belegten Segmente leuchten dabei auch im Ruhezustand, gedämpft und
   ohne Schein. Ein Bedienelement, das erst beim Anfassen sichtbar wird,
   sagt niemandem, dass es angefasst werden will. Der Schein kommt beim
   Ziehen dazu; das ist der Teil, der sich lebendig anfühlt, und er kostet
   keine Erkennbarkeit.

   Drittens ist jedes Segment einzeln anklickbar. Drehen ist auf dem
   Telefon ungenau — der Finger verdeckt genau die Stelle, die man treffen
   will. Wer die Fünf antippt, bekommt die Fünf. Ziehen bleibt für das
   Überstreichen, die Tasten und die Tastatur für den letzten Schritt.

   Bedienung vollständig über die Tastatur: Pfeile ±1, Bild ±5, Pos1 und
   Ende auf die Grenzen. Nach außen ist das Bauteil ein Schieberegler
   (role="slider"), Vorlesewerkzeuge lesen es als solchen.
   ========================================================================== */

import React, { useCallback, useRef, useState } from "react";
import { C } from "./farben.js";

const LUECKE = 60;                 // Öffnung unten, in Grad
const BOGEN = 360 - LUECKE;        // nutzbarer Winkel

const klemme = (x, a, b) => Math.min(b, Math.max(a, x));
const deutsch = (n) => n.toLocaleString("de-DE");

/** Punkt auf dem Ring. Null Grad ist oben, positive Winkel laufen im Uhrzeigersinn. */
function punkt(cx, cy, r, grad) {
  const b = (grad * Math.PI) / 180;
  return [cx + r * Math.sin(b), cy - r * Math.cos(b)];
}

/** Ein Segment als Kreisbogen. */
function bogen(cx, cy, r, von, bis) {
  const [x1, y1] = punkt(cx, cy, r, von);
  const [x2, y2] = punkt(cx, cy, r, bis);
  const gross = bis - von > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${gross} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function Ringregler({
  wert,
  min = 1,
  max = 10,
  schritt = 1,
  beschriftung,                    // sichtbare Überschrift, z. B. "Standorte"
  einheit,                         // unter der Zahl, z. B. "Zugänge"
  hinweis,                         // erklärender Satz unter dem Ring
  groesse = 216,
  mitTasten = true,
  onChange,
}) {
  const svgRef = useRef(null);
  const letzter = useRef(0);                      // Index beim letzten Zeigerschritt
  const [aktiv, setAktiv] = useState(false);      // gezogen oder mit Tastatur im Fokus
  const [gefasst, setGefasst] = useState(false);

  const stufen = Math.max(1, Math.floor((max - min) / schritt) + 1);
  const index = klemme(Math.round((wert - min) / schritt), 0, stufen - 1);

  const setzeIndex = useCallback((i) => {
    const neu = min + klemme(i, 0, stufen - 1) * schritt;
    if (neu !== wert && onChange) onChange(neu);
  }, [min, schritt, stufen, wert, onChange]);

  /* Winkel eines Segments. Bei nur einer Stufe steht es oben. */
  const winkel = (i) => (stufen > 1
    ? -BOGEN / 2 + (BOGEN * i) / (stufen - 1)
    : 0);

  /* Zeigerposition in einen Index übersetzen.

     Der Winkel kommt aus atan2 und liegt damit in (−180°, +180°]. Die
     Öffnung liegt symmetrisch um 180°, also ist jeder Winkel jenseits von
     +150° näher am oberen Anschlag und jeder unterhalb von −150° näher am
     unteren. Es genügt deshalb, an den Enden zu klemmen — wer über die
     Öffnung hinauszieht, bleibt am Anschlag stehen, statt umzuspringen. */
  const ausZeiger = (ev) => {
    const k = svgRef.current.getBoundingClientRect();
    const dx = ev.clientX - (k.left + k.width / 2);
    const dy = ev.clientY - (k.top + k.height / 2);
    const a = klemme((Math.atan2(dx, -dy) * 180) / Math.PI, -BOGEN / 2, BOGEN / 2);
    if (stufen === 1) return 0;
    return Math.round(((a + BOGEN / 2) / BOGEN) * (stufen - 1));
  };

  const zeigerAb = (ev) => {
    ev.preventDefault();
    setGefasst(true); setAktiv(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const i = ausZeiger(ev);
    letzter.current = i;
    setzeIndex(i);           // Antippen darf überall hin springen
  };

  /* Beim Ziehen dagegen nicht: Wer unten quer durch die Öffnung fährt —
     auf dem Telefon geschieht das schnell, der Daumen läuft am Rand
     entlang — würde sonst von dreißig Standorten auf einen fallen. Ein
     Sprung über mehr als die halbe Skala gilt deshalb als Überfahren des
     Anschlags und wird dort festgehalten. */
  const zeigerBewegt = (ev) => {
    if (!gefasst) return;
    let i = ausZeiger(ev);
    if (Math.abs(i - letzter.current) > Math.max(2, stufen / 2)) {
      i = letzter.current < stufen / 2 ? 0 : stufen - 1;
    }
    letzter.current = i;
    setzeIndex(i);
  };
  const zeigerAuf = () => setGefasst(false);

  const taste = (ev) => {
    const sprung = {
      ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1,
    }[ev.key];
    if (sprung !== undefined) { ev.preventDefault(); setzeIndex(index + sprung); return; }
    if (ev.key === "PageUp") { ev.preventDefault(); setzeIndex(index + 5); return; }
    if (ev.key === "PageDown") { ev.preventDefault(); setzeIndex(index - 5); return; }
    if (ev.key === "Home") { ev.preventDefault(); setzeIndex(0); return; }
    if (ev.key === "End") { ev.preventDefault(); setzeIndex(stufen - 1); }
  };

  /* ------------------------------ Zeichnung ------------------------------ */
  const M = 100;                                  // Mittelpunkt im viewBox-Raum
  const R = 78;                                   // Radius der Segmentspur
  /* Strichstärke und Segmentlänge folgen der Teilung. Die runden Enden
     tragen je die halbe Strichstärke über den Bogen hinaus — wer das nicht
     abzieht, bekommt bei dreißig Rasten einen durchgehenden Klumpen statt
     einzelner Marken. Bei dichter Teilung schrumpfen die Segmente zu
     Punkten; das ist dieselbe Dichte wie im Rotationsdiagramm. */
  const teilung = (2 * Math.PI * R * (BOGEN / 360)) / stufen;
  const gesamt = teilung * 0.62;
  const dicke = klemme(gesamt, 4.5, 14);
  const halb = Math.max(0.3, ((gesamt - dicke) / 2 / R) * (180 / Math.PI));

  const segmente = [];
  for (let i = 0; i < stufen; i++) {
    const belegt = i <= index;
    const griff = i === index;
    const w = winkel(i);
    segmente.push(
      <path
        key={i}
        d={bogen(M, M, R, w - halb, w + halb)}
        fill="none"
        strokeLinecap="round"
        strokeWidth={belegt ? (griff ? dicke + 4 : dicke) : 2.2}
        stroke={belegt ? (griff ? C.accentHi : C.accent) : C.lineSoft}
        opacity={belegt ? 1 : 0.85}
        style={{
          transition: "stroke .18s ease, opacity .18s ease, stroke-width .18s ease",
          filter: aktiv && belegt ? `drop-shadow(0 0 6px ${C.accentHi})` : "none",
        }}
      />,
    );
  }

  const zahl = min + index * schritt;
  const beschr = beschriftung || einheit || "Wert";

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 14 }}>
      {beschriftung && (
        <div style={{
          fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
          textTransform: "uppercase", color: C.aus, justifySelf: "stretch",
        }}>
          {beschriftung}
        </div>
      )}

      <div
        role="slider"
        tabIndex={0}
        aria-label={beschr}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={zahl}
        aria-valuetext={einheit ? `${zahl} ${einheit}` : String(zahl)}
        aria-orientation="horizontal"
        onKeyDown={taste}
        onFocus={() => setAktiv(true)}
        onBlur={() => { setAktiv(false); setGefasst(false); }}
        style={{
          /* Nie breiter als die Spalte — in engen Karten schrumpft der
             Ring mit, statt überzustehen. */
          width: `min(${groesse}px, 100%)`, aspectRatio: "1",
          borderRadius: "50%", outlineOffset: 4,
          cursor: gefasst ? "grabbing" : "pointer", touchAction: "none",
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          width="100%"
          height="100%"
          onPointerDown={zeigerAb}
          onPointerMove={zeigerBewegt}
          onPointerUp={zeigerAuf}
          onPointerCancel={zeigerAuf}
          style={{ display: "block", overflow: "visible" }}
        >
          {/* Führungsspur — sagt schon im Ruhezustand, wie weit es geht */}
          <path
            d={bogen(M, M, R, -BOGEN / 2, BOGEN / 2)}
            fill="none"
            stroke={C.line}
            strokeWidth={1}
            opacity={0.7}
          />
          {segmente}

          <text
            x={M} y={M + 6}
            textAnchor="middle"
            style={{
              fontSize: 44, fontWeight: 300, letterSpacing: "-.04em",
              fill: C.text, fontVariantNumeric: "tabular-nums",
            }}
          >
            {deutsch(zahl)}
          </text>
          {einheit && (
            <text
              x={M} y={M + 28}
              textAnchor="middle"
              style={{
                fontSize: 11, letterSpacing: ".16em",
                fill: C.aus,
              }}
            >
              {einheit.toUpperCase()}
            </text>
          )}
        </svg>
      </div>

      {mitTasten && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Taste
            title={`${beschr} verringern`}
            aus={index <= 0}
            onClick={() => setzeIndex(index - 1)}
          >−</Taste>
          <span style={{ fontSize: 12.5, color: C.aus, minWidth: 82, textAlign: "center",
            fontVariantNumeric: "tabular-nums" }}>
            {deutsch(min)} bis {deutsch(max)}
          </span>
          <Taste
            title={`${beschr} erhöhen`}
            aus={index >= stufen - 1}
            onClick={() => setzeIndex(index + 1)}
          >+</Taste>
        </div>
      )}

      {hinweis && (
        <p style={{
          fontSize: 12.5, color: C.dim, lineHeight: 1.55, margin: 0,
          textAlign: "center", maxWidth: 300,
        }}>{hinweis}</p>
      )}
    </div>
  );
}

/** Kleine, ruhige Schaltfläche für den letzten Schritt. */
function Taste({ children, title, aus, onClick }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={aus}
      onClick={onClick}
      style={{
        width: 34, height: 34, borderRadius: 9, cursor: aus ? "default" : "pointer",
        border: `1px solid ${C.line}`, background: C.flaeche, color: C.text,
        fontFamily: "inherit", fontSize: 17, lineHeight: 1, opacity: aus ? 0.4 : 1,
      }}
    >{children}</button>
  );
}
