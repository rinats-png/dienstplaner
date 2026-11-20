/* ==========================================================================
   SERVER-EINSTIEG DER PLANWIRKUNG (IMP-6, ENTSCHEIDUNGSLISTE P2-4 Punkt 6) — Vorgabe AUS

   Die Planrechnung (server/lib/fachpruefung.mjs) liest keine Umgebung: Sie
   erreicht auch die Oberfläche. Dieser Einstieg verbindet ihre Quelle mit dem
   Schalter CENTRIC_SCHICHTMODELL_WIRKUNG (server/lib/schalter.mjs). Übergeben
   wird die Funktion, nicht ihr Wert: Gelesen wird bei jedem Aufruf, wie bei
   allen Schaltern; nur genau `true` schaltet ein, eine werfende Quelle gilt
   als aus (fachpruefung.mjs, fail-closed).

   Eingebunden in server.mjs (Prozess) und server/funktionen/daten.mjs
   (Datenweg, auch ohne server.mjs geprüft). Der Schalter bleibt AUS; er
   wird nur mit Betreiberfreigabe gesetzt (Vorbedingungen:
   docs/acc45/IMP-6-MEHRFACHMODELLE.md, „Planwirkung“).
   ========================================================================== */
import { schichtmodellWirkungSetzen } from "./fachpruefung.mjs";
import { schichtmodellWirkungAn } from "./schalter.mjs";

/** Die Quelle der Planwirkung mit dem Schalter verbinden (beim Laden einmal; danach liest jeder Aufruf die Umgebung). */
export function schichtmodellWirkungVerbinden() {
  schichtmodellWirkungSetzen(schichtmodellWirkungAn);
}

schichtmodellWirkungVerbinden();
