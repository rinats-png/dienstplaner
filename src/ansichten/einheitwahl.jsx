/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { Sel } from "../ui/bausteine.jsx";

/** Einheit oder „Betriebsweit" — nur für Planung und Leitung. */
export function EinheitWahl({ m, wert, setWert, style }) {
  return (
    <Sel value={wert ?? ""} onChange={(e) => setWert(e.target.value || null)} style={{ width: 190, ...style }}>
      <option value="">Betriebsweit</option>
      {(m.einheiten || []).map((e) => <option key={e.id} value={e.id}>{e.name || e.id}</option>)}
    </Sel>);
}
