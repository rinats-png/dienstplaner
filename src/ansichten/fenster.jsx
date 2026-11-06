/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useRef, useEffect } from "react";

/* ==========================================================================
   KONFLIKT

   Der alte Text stammte aus der Zeit ohne Server: „Echter
   Mehrbenutzerbetrieb setzt einen Server voraus — diese Prüfung erkennt den
   Konflikt, sie löst ihn nicht auf." Beides stimmt so nicht mehr. Der
   Server führt getrennte Monate längst zusammen; hierher kommt nur noch,
   wer wirklich denselben Monat bearbeitet hat wie jemand anderes.

   Angeboten wurde trotzdem nur „Neu laden" — also: die eigene Arbeit
   wegwerfen. Für jemanden, der gerade zwei Stunden geplant hat, ist das
   keine Wahl, sondern eine Mitteilung.

   Jetzt stehen drei Wege da, und alle drei sagen, was sie kosten:

     Neu laden          — meine Änderungen sind weg
     Meinen Stand nehmen — die Arbeit der anderen Person in diesen Monaten
                           ist weg
     Als Datei sichern   — nichts ist weg, aber auch nichts gespeichert

   Welcher richtig ist, weiß nur, wer beide Seiten kennt. Deshalb steht
   dabei, wer wann gespeichert hat und welche Monate betroffen sind.
   ========================================================================== */
/**
 * Ein einfaches Fenster für Rückfragen.
 *
 * Das Konfliktfenster darunter hatte seinen Rahmen bisher selbst gebaut.
 * Ein zweites Fenster mit eigenem Rahmen hätte zwei Fenster ergeben, die
 * beinahe gleich aussehen — und beinahe ist bei einem Dialog schlimmer als
 * anders. Escape schließt, der Rahmen bekommt den Tastaturfokus.
 */
export function Fenster({ titel, breit = 520, onClose, children }) {
  const rahmen = useRef(null);
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", f);
    if (rahmen.current) rahmen.current.focus();
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={titel}
      style={{ position: "fixed", inset: 0, background: "var(--c-ueberlagerung)",
        backdropFilter: "blur(6px)", zIndex: 90, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 20 }}>
      <div ref={rahmen} tabIndex={-1} className="blatt"
        style={{ maxWidth: breit, width: "100%", outline: "none" }}>
        <div style={{ padding: "24px 24px 0", fontSize: 18, fontWeight: 650 }}>{titel}</div>
        {children}
      </div>
    </div>);
}
