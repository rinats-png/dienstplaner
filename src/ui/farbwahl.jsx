/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect, useRef } from "react";
import { C } from "../farben.js";
import { PALETTE, PALETTE_NAMEN } from "../lib/fachlogik.js";


/* --------------------------------- Datum --------------------------------- */
/* Diese Grundlagen stehen jetzt in src/regelwerk.js — dort, wo auch die
   Regeln liegen, die auf ihnen aufbauen, und wo sie geprüft werden. */

/**
 * Der Farbwähler — überall dieselbe Fläche mit denselben dreißig Kacheln,
 * egal ob für eine Dienstart, eine Einheit oder eine Qualifikation. Eine
 * einzige Stelle, die weiß, wie viele Farben es gibt und wie sie heißen.
 */
export function Farbwahl({ wert, onChange }) {
  return (
    <div role="group" aria-label="Farbe wählen"
      style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 4, maxWidth: 320 }}>
      {PALETTE.map((c, i) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          aria-pressed={wert === c} title={PALETTE_NAMEN[i] || c}
          style={{ width: 25, height: 25, borderRadius: 8, background: c, cursor: "pointer",
            border: wert === c ? "3px solid #fff" : "1px solid rgba(0,0,0,.12)",
            boxShadow: wert === c ? `0 0 0 2px ${c}` : "none" }} />))}
    </div>);
}

/**
 * Derselbe Farbwähler, hinter einem Punkt versteckt — für Listen, in denen
 * ein dauerhaft offenes Raster aus dreißig Kacheln pro Zeile die eigentliche
 * Liste erschlagen würde. Ein Klick auf den Punkt öffnet die Auswahl, ein
 * Klick daneben schließt sie wieder.
 */
export function Farbpunkt({ wert, onChange, titel = "Farbe ändern" }) {
  const [offen, setOffen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!offen) return;
    const schliessen = (e) => { if (box.current && !box.current.contains(e.target)) setOffen(false); };
    document.addEventListener("mousedown", schliessen);
    return () => document.removeEventListener("mousedown", schliessen);
  }, [offen]);

  return (
    <div ref={box} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOffen((o) => !o)} title={titel}
        aria-label={titel} aria-expanded={offen}
        style={{ width: 18, height: 18, borderRadius: 9, background: wert, cursor: "pointer",
          border: `1px solid ${C.lineStark}`, padding: 0 }} />
      {offen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20,
          background: C.flaeche, border: `1px solid ${C.line}`, borderRadius: 10,
          padding: 10, boxShadow: "0 10px 28px -10px rgba(7,19,23,.28)" }}>
          <Farbwahl wert={wert} onChange={(c) => { onChange(c); setOffen(false); }} />
        </div>)}
    </div>);
}
