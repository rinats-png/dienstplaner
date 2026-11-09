/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { Marke } from "../marke.jsx";


/* ==========================================================================
   MARKE — CENTRIC
   Das C-Zeichen kommt aus marke.jsx; hier bleibt nur der alte Name Logo()
   für die Aufrufer. Die Markenfarben sind fest, `hell` ändert nichts mehr.
   ========================================================================== */
export function Logo({ size = 40, hell = false }) {
  return <Marke size={size} aria-hidden={undefined} role="img" aria-label="CENTRIC" />;
}
