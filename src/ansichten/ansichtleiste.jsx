/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { Rubrik, Btn, Inp } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { Icon } from "../gestalt/icons.jsx";
import { useState } from "react";

/* ==========================================================================
   GESPEICHERTE ANSICHTEN
   Wer täglich denselben Ausschnitt braucht, soll ihn nicht täglich neu bauen.
   ========================================================================== */
export function AnsichtLeiste({ sitz, akt, bereich, aktuell, anwenden }) {
  const m = sitz.mandant;
  const meine = (m.ansichten || []).filter((a) => a.personId === sitz.person.id && a.bereich === bereich);
  const [neu, setNeu] = useState(false);
  const [name, setName] = useState("");
  if (!meine.length && !aktuell) return null;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <Rubrik>Ansichten</Rubrik>
      {meine.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center" }}>
          <Btn size="sm" onClick={() => anwenden(a.zustand)}>{a.name}</Btn>
          <button onClick={() => akt.loescheAnsicht(a.id)} aria-label={`${a.name} löschen`}
            style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer",
              padding: "0 4px", display: "flex" }}><Icon n="x" size={14} strokeWidth={2.2} /></button>
        </div>))}
      {neu ? (
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <Inp value={name} placeholder="Name der Ansicht" autoFocus style={{ width: 180 }}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) {
              akt.speichereAnsicht(bereich, name, aktuell); setName(""); setNeu(false); } }} />
          <Btn size="sm" kind="primary" disabled={!name.trim()}
            onClick={() => { akt.speichereAnsicht(bereich, name, aktuell); setName(""); setNeu(false); }}>
            Sichern</Btn>
          <Btn size="sm" kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
        </div>
      ) : aktuell && (
        <Btn size="sm" kind="quiet" onClick={() => setNeu(true)}>+ Aktuelle Ansicht sichern</Btn>)}
    </div>);
}
