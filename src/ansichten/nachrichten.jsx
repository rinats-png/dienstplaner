/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { Sheet } from "../ui/leisten.jsx";
import { Leer, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";

/* ============================== NACHRICHTEN ============================== */
export function Nachrichten({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const meine = (m.nachrichten || []).filter((n) => n.personId === sitz.person.id);
  return (
    <Sheet open onClose={onClose} titel="Mitteilungen" width={600}>
      {meine.length === 0
        ? <Leer titel="Nichts Neues" text="Hier erscheinen Entscheidungen zu deinen Anträgen und Änderungen an deinen Diensten." />
        : (<>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn size="sm" kind="quiet" onClick={akt.alleGelesen}>Alle als gelesen markieren</Btn></div>
          {meine.map((n) => (
            <div key={n.id} className="karte" style={{ padding: 14, marginBottom: 9,
              borderLeft: `3px solid ${n.gelesen ? "transparent" : n.art === "warn" ? C.warn : C.accent}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontSize: 14, fontWeight: n.gelesen ? 500 : 650 }}>{n.titel}</div>
                <span style={{ fontSize: 11.5, color: C.dimmer, whiteSpace: "nowrap", ...NUM }}>{n.zeit}</span>
              </div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{n.text}</div>
            </div>))}
        </>)}
    </Sheet>);
}
