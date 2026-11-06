/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */

import { BESTAETIGUNG } from "../sicherungen-ui.js";



/* ==========================================================================
   SICHERUNGEN VERWALTEN (WP-25)
   Liste der In-App-Sicherungen des eigenen Betriebs und Zurückspielen mit
   Bestätigung. Sehen: Leitung und Kundenrolle; zurückspielen: nur die
   Leitung (wie der Server, server/lib/sicherungen.mjs). Was eine Antwort
   bedeutet, steht in src/sicherungen-ui.js.
   `vorgabe` ({ liste, fehler, auswahl }) nur für Prüfungen ohne Netz.
   ========================================================================== */
/** Der Bestätigungstext vor dem Zurückspielen: was bleibt, was auf die Sicherung zurückgeht. */
export function BestaetigungsText() {
  const Abschnitt = ({ titel, punkte }) => (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{titel}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 13.5 }}>
        {punkte.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </div>);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 13.5 }}>{BESTAETIGUNG.umfang}</div>
      <Abschnitt titel="Das bleibt, wie es jetzt ist" punkte={BESTAETIGUNG.bleibt} />
      <Abschnitt titel="Das geht auf den Stand der Sicherung zurück" punkte={BESTAETIGUNG.zurueck} />
      <Abschnitt titel="Gut zu wissen" punkte={BESTAETIGUNG.hinweise} />
    </div>);
}
