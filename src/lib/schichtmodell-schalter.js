/* ==========================================================================
   Schalter der Pflegeoberfläche „Schichtmodelle je Person“ (IMP-6, P2-24 B, Betreiberentscheidung 2026-11-20)

   Quelle ist allein der Server: CENTRIC_SCHICHTMODELL_PFLEGE (server/lib/schalter.mjs, Vorgabe AUS). Ist er an,
   meldet GET /api/bestand `schichtmodellPflege: true`; src/speicher.js (lies) setzt diesen Merker. Fehlt die Angabe,
   bleibt die Pflege verborgen (fail-closed). Der Merker steuert nur die Anzeige: Gespeicherte Modelle und
   Zuordnungen bleiben im Zustand der Oberfläche und gehen beim Speichern unverändert mit (kein Datenverlust).
   ========================================================================== */
let an = false;
/** Nur aus src/speicher.js (Antwort des Servers) und aus Prüfungen. @param {unknown} wert */
export function schichtmodellPflegeSetzen(wert) { an = wert === true; }
/** Zeigt die Oberfläche die Pflege? */
export const schichtmodellPflegeAn = () => an;
