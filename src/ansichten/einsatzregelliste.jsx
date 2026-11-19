/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { fKurz } from "../lib/datum.js";
import { Lab } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { n1 } from "../lib/format.js";
import { EINSATZREGEL_TEXTE } from "../regelwerk.js";

/* ============================== PERSONALAKTE ============================= */
/** Die Einsatzregeln einer Person — neutral, ohne Grund (Commit S1). */
export function EinsatzregelListe({ regeln }) {
  if (!Array.isArray(regeln)) return null;
  const zeitraum = (r) => (r.von || r.bis
    ? ` (${r.von ? `ab ${fKurz(r.von)}` : ""}${r.von && r.bis ? " " : ""}${r.bis ? `bis ${fKurz(r.bis)}` : ""})` : "");
  const zeilen = [...new Set(regeln.filter((r) => r && r.regel).map((r) => r.regel === "stundengrenzeWoche"
    ? `Wochenstundengrenze: höchstens ${n1(Number(r.wert) || 0)} h${zeitraum(r)}`
    : `${(EINSATZREGEL_TEXTE[r.regel] || EINSATZREGEL_TEXTE.unbekannt).replace(/\.$/, "")}${zeitraum(r)}`))];
  return (
    <div>
      <Lab style={{ marginBottom: 8 }}>Einsatzregeln</Lab>
      {zeilen.length === 0
        ? <div style={{ fontSize: 13, color: C.dim }}>Keine besonderen Einsatzregeln.</div>
        : zeilen.map((z) => <div key={z} style={{ fontSize: 13.5, lineHeight: 1.6 }}>{z}</div>)}
    </div>);
}
