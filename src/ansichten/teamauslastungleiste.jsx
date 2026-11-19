/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { C } from "../farben.js";
import { ISTDATEN_TEXT } from "../istdaten.js";
import { Statuszeile } from "../gestalt/ansichten.jsx";
import { Fortschritt } from "../gestalt/bausteine.jsx";
import { NUM } from "../ui/thema.js";

/**
 * Team-Auslastung auf einen Blick, über dem Raster statt erst in der
 * Belastungsansicht: wie voll der Monat für den Betrieb insgesamt ist, und
 * wie viele Personen darin einzeln über- oder unterplant sind.
 */
export function TeamAuslastungLeiste({ ta }) {
  if (!ta.personen) return null;
  if (ta.nichtVerfuegbar) return (
    <div className="noprint" style={{ padding: "13px 16px", background: C.flaecheStill, borderRadius: 6,
      marginBottom: 12, fontSize: 13.5, color: C.dim }}>Team-Auslastung: {ISTDATEN_TEXT}</div>);
  const teile = [`Team-Auslastung ${ta.pct} %`];
  if (ta.ueber) teile.push(`${ta.ueber} überplant`);
  if (ta.unter) teile.push(`${ta.unter} unterausgelastet`);
  return (
    <Statuszeile>
      <Fortschritt wert={Math.min(100, ta.pct)} hoehe={6} ton={ta.pct > 105 ? "warn" : ta.pct < 85 ? "neutral" : "ok"}
        label="Team-Auslastung" />
      <b style={{ ...NUM }}>{teile.join(" · ")}</b>
      <span style={{ color: C.dim }}>{ta.personen} Personen im Schichtdienst</span>
    </Statuszeile>);
}
