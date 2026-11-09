/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — „KiAntwort“ (WP-I17)

   Zeigt eine Gateway-Antwort direkt an: der Zustand wird aus der Antwort
   abgeleitet (anzeige.js), nicht vom Aufrufer gewählt. Rollensicht, Kennzeichnung,
   Rückfall-Hinweis und Textmaskierung kommen aus KiEntwurf. Nicht eingehängt.
   Keine Konsolenausgabe, kein Netz.
   ========================================================================== */
import { KiEntwurf } from "./KiEntwurf.jsx";
import { anzeigeAus } from "./anzeige.js";

/** @param {{ rolle: string, funktion?: string, antwort?: any, laedt?: boolean, aufloesen?: Function, bausteinText?: Function, titel?: string }} props */
export function KiAntwort({ antwort, laedt = false, ...rest }) {
  if (laedt) return <KiEntwurf {...rest} zustand="laedt" />;
  if (antwort === undefined || antwort === null) return <KiEntwurf {...rest} zustand="leer" />;
  const a = anzeigeAus(antwort);
  return <KiEntwurf {...rest} zustand={a.zustand} antwort={a.antwort} fehlercode={a.fehlercode} />;
}
