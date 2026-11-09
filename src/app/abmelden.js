/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import * as SP from "../speicher.js";
import { vergissSchutzkonflikte } from "../schutzkonflikte-hook.js";


/* WP-07 (Review A2): Abmelden mit Hinweis, wenn Stempel noch auf das Netz
   warten. Sie bleiben auf dem Gerät und werden nach der nächsten Anmeldung
   derselben Person gesendet; eine andere Person sieht und sendet sie nicht. */
export function abmeldenMitHinweis() {
  const n = SP.stempelWartendAnzahl();
  if (n && typeof window !== "undefined" && typeof window.confirm === "function"
    && !window.confirm(`${n === 1 ? "Ein Stempel wartet" : `${n} Stempel warten`} noch auf das Netz. `
      + "Er bleibt auf diesem Gerät gespeichert und wird gesendet, sobald du dich wieder anmeldest. Trotzdem abmelden?")) return;
  /* Gemerkte Schutzkonflikte gehören zur Sitzung (WP-22b): vor dem Abmelden leeren. */
  vergissSchutzkonflikte();
  SP.abmelden();
  window.location.reload();
}
