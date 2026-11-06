/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useRef, useState, useEffect } from "react";
import { C } from "../farben.js";
import { fKurz } from "../lib/datum.js";
import { Btn } from "../ui/bausteine.jsx";

/**
 * Der Server will warnende Befunde bestätigt haben (WP-22, 409 mit
 * `fachbefunde`) — etwa nach einer geänderten Schichtfolge, die neue
 * Einteilungen erzeugt. Die Texte kommen neutral aus dem Befundkatalog.
 * Bestätigen legt die Einträge im Bestätigungsprotokoll an; der nächste
 * Speichervorgang nimmt sie mit. Abbrechen speichert nichts.
 */
export function Bestaetigungsfrage({ lage, m, onSchliessen, onBestaetigen }) {
  const rahmen = useRef(null);
  const [gelesen, setGelesen] = useState(false);
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onSchliessen(); };
    window.addEventListener("keydown", f);
    if (rahmen.current) rahmen.current.focus();
    return () => window.removeEventListener("keydown", f);
  }, [onSchliessen]);
  const eintraege = Array.isArray(lage && lage.fachbefunde) ? lage.fachbefunde : [];
  const recht = eintraege.some((f) => (f.befunde || []).some((b) => b.stufe === "recht"));
  const name = (pid) => { const p = (m.personen || []).find((x) => String(x.id) === String(pid)); return p ? `${p.vorname} ${p.nachname}` : "Person"; };
  const dienst = (id) => { const d = (m.dienstarten || []).find((x) => String(x.id) === String(id)); return d ? d.name : String(id); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Bestätigung nötig"
      style={{ position: "fixed", inset: 0, background: "var(--c-ueberlagerung)",
        backdropFilter: "blur(6px)", zIndex: 90, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 20 }}>
      <div ref={rahmen} tabIndex={-1} className="blatt"
        style={{ maxWidth: 600, maxHeight: "85vh", overflow: "auto", padding: 28, outline: "none" }}>
        <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 10 }}>Diese Änderung braucht eine Bestätigung</div>
        <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px" }}>
          Der Server hat die Einteilungen geprüft, die durch die Änderung neu entstehen. Gespeichert wird erst,
          wenn du die Befunde bestätigst — die Bestätigung kommt ins Protokoll.</p>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {eintraege.slice(0, 50).map((f) => (
            <div key={`${f.personId}|${f.datum}`} className="karte" style={{ padding: "10px 13px", fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{name(f.personId)} · {fKurz(f.datum)} · {dienst(f.dienstId)}</div>
              {(f.befunde || []).map((b) => (
                <div key={b.regel} style={{ color: b.stufe === "recht" ? C.danger : C.dim }}>{b.text}</div>))}
            </div>))}
          {eintraege.length > 50 && <div style={{ fontSize: 12.5, color: C.dim }}>… und {eintraege.length - 50} weitere</div>}
        </div>
        {recht && (
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, marginBottom: 12 }}>
            <input type="checkbox" checked={gelesen} onChange={(x) => setGelesen(x.target.checked)} />
            <span>Ich habe die gesetzlichen Vorgaben gelesen und weiche bewusst ab.</span>
          </label>)}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn kind="quiet" onClick={onSchliessen}>Abbrechen — nicht speichern</Btn>
          {/* Review B1: viele Einteilungen auf einmal — eine Bestätigung je Regel, Einheit und Zeitraum. */}
          {Array.isArray(lage.sammelVorschlag) && lage.sammelVorschlag.length > 0 && eintraege.length > 10 && (
            <Btn disabled={recht && !gelesen} onClick={() => onBestaetigen(gelesen, true)}>
              Gesammelt bestätigen ({lage.sammelVorschlag.length})</Btn>)}
          <Btn kind="primary" disabled={recht && !gelesen} onClick={() => onBestaetigen(gelesen, false)}>Bestätigen und speichern</Btn>
        </div>
      </div>
    </div>);
}
