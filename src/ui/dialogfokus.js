/* Fokusführung für Blätter und Dialoge, die sich über den Inhalt legen (WP-40).

   Was ein modaler Dialog nach WCAG und dem WAI-ARIA-Muster braucht:
   - der Fokus wandert beim Öffnen hinein (2.4.3 Fokus-Reihenfolge),
   - Tab und Umschalt-Tab bleiben darin (2.1.2 keine Tastaturfalle nach außen, hier umgekehrt:
     der Fokus verlässt das Blatt nicht, solange es offen ist),
   - Escape schließt (2.1.1 Tastatur, Muster „Dialog"),
   - beim Schließen kehrt der Fokus an die auslösende Stelle zurück.

   Der Hook trägt die Rückgabe an die Stelle, von der aus geöffnet wurde. Der Aufrufer
   setzt role="dialog", aria-modal und tabIndex={-1} auf das Blatt selbst. */
import { useEffect, useRef } from "react";

const FOKUSIERBAR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFokus(ref, offen, onClose) {
  const schliessen = useRef(onClose);
  schliessen.current = onClose;

  useEffect(() => {
    if (!offen || typeof document === "undefined") return undefined;
    const vorher = document.activeElement;
    const knoten = ref.current;
    if (knoten && typeof knoten.focus === "function") knoten.focus();

    const taste = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (schliessen.current) schliessen.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const felder = [...ref.current.querySelectorAll(FOKUSIERBAR)];
      if (felder.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const erste = felder[0];
      const letzte = felder[felder.length - 1];
      const innen = ref.current.contains(document.activeElement);
      if (!innen) { e.preventDefault(); (e.shiftKey ? letzte : erste).focus(); return; }
      if (e.shiftKey && document.activeElement === erste) { e.preventDefault(); letzte.focus(); }
      else if (!e.shiftKey && document.activeElement === letzte) { e.preventDefault(); erste.focus(); }
    };
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("keydown", taste);
      if (vorher && typeof vorher.focus === "function" && document.contains(vorher)) vorher.focus();
    };
  }, [offen]); // eslint-disable-line react-hooks/exhaustive-deps -- ref und onClose werden über Refs gelesen
}
