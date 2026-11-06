/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — HOOK (WP-I17)

   Hält den Zustand eines Vorgangs (leer → laedt → fertig | rueckfall | fehler). Ein später
   gestarteter Vorgang überholt einen früheren (dessen Ergebnis wird verworfen); nach dem
   Aushängen der Komponente setzt nichts mehr Zustand. Keine console-Ausgabe, kein Netz
   (der Client wird übergeben).
   ========================================================================== */
import { useCallback, useEffect, useRef, useState } from "react";

export function useKiVorgang(client) {
  const [stand, setStand] = useState({ zustand: "leer" });
  const lauf = useRef(0);
  useEffect(() => () => { lauf.current = -1; }, []);
  const starten = useCallback(async (anfrage) => {
    const nr = ++lauf.current;
    setStand({ zustand: "laedt" });
    const r = await client.anfragen(anfrage);
    if (lauf.current === nr) setStand(r);
  }, [client]);
  const zuruecksetzen = useCallback(() => { lauf.current += 1; setStand({ zustand: "leer" }); }, []);
  return { ...stand, starten, zuruecksetzen };
}
