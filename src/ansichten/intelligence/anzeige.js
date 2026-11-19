/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — ANZEIGEZUSTAND (WP-I17)

   Macht aus einer Gateway-Antwort (Attrappe oder später live) den Zustand der
   Oberfläche. Reine Funktion: kein Netz, keine Ausgabe, kein Wurf. Nur Antworten,
   die Schema und Kennzeichnung bestehen, sind "fertig"; ein Rückfall bleibt
   Rückfall; alles andere ist "fehler". Rohantworten gelangen nie in das Ergebnis.
   ========================================================================== */
import { antwortLesen } from "./ki-client.js";

/** @returns {{ zustand: "fertig"|"rueckfall"|"laedt"|"fehler", antwort?: any, fehlercode?: string|null }} */
export function anzeigeAus(gatewayAntwort) {
  const l = antwortLesen(gatewayAntwort);
  if (l.zustand === "fertig" || l.zustand === "rueckfall" || l.zustand === "laedt") return { zustand: l.zustand, antwort: l.antwort };
  return { zustand: "fehler", fehlercode: l.fehlercode ?? null };
}
