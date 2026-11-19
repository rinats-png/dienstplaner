/* ==========================================================================
   SELBSTPLANUNG — Rundenkopf und „nicht übernommen" (WP-10 Review K1)

   Beim Übernehmen einer Runde hielt die Oberfläche fest, was nicht in den
   Plan kam — mit dem Wortlaut des Befunds als Grund („MuSchG § 5 …",
   „abwesend (Krank)"). Der Rundenkopf ging per {...r} an Beschäftigte und
   Schichtverantwortung, auch aus fremden Bereichen: Gesundheits- und
   Mutterschutzgründe Dritter (Art. 9 DSGVO).

   Jetzt:
   - Der Grund ist eine Kennung aus NICHT_UEBERNOMMEN_GRUENDE, nie Text.
     Schutz- und Einsatzregeln heißen alle gleich („schutz"), ohne Gesetz
     und ohne Merkmal; eine Abwesenheit nur „abwesend", ohne Art.
   - Der Server nimmt nichtUebernommen nur in dieser Form an
     (nichtUebernommenNormal), unbekannte Gründe werden „befund".
   - Gelesen wird der Rundenkopf per Positivliste (RUNDENKOPF, sicht.mjs);
     nichtUebernommen nur nach Rolle (eigene / eigener Bereich am Tag).

   Rein, ohne Abhängigkeiten — die Oberfläche liest die Bezeichnungen hier.
   ========================================================================== */

/** Gründe, aus denen ein Eintrag nicht übernommen wurde — Kennung → Text. */
export const NICHT_UEBERNOMMEN_GRUENDE = {
  fehlt: "Person oder Dienstart nicht mehr vorhanden",
  schutz: "Schutz- oder Einsatzregel",
  abwesend: "abwesend",
  befund: "Befund der Planprüfung",
  auswahl: "nicht ausgewählt",
};

/** Kennung für einen Befund aus hindernisBefunde (App.jsx). */
export function grundKennung(befund) {
  if (!befund) return "auswahl";
  if (befund.art === "schutz") return "schutz";
  if (befund.art === "abwesend") return "abwesend";
  return "befund";
}

/** Die Felder eines Rundenkopfs, die hinausgehen (sicht.mjs). */
export const RUNDENKOPF = ["id", "monat", "status", "deckelung", "geoeffnet", "schliesst", "geschlossen",
  "uebernommenAm", "uebernommen", "verworfen"];

const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Ein Eintrag „nicht übernommen" in der erlaubten Form, oder null. */
export function nichtUebernommenEintrag(e) {
  if (!e || typeof e !== "object" || typeof e.datum !== "string" || !TAG.test(e.datum)) return null;
  if (!(typeof e.personId === "string" || typeof e.personId === "number")) return null;
  const aus = { personId: e.personId, datum: e.datum,
    grund: Object.prototype.hasOwnProperty.call(NICHT_UEBERNOMMEN_GRUENDE, e.grund) ? e.grund : "befund" };
  if (typeof e.dienstId === "string" || typeof e.dienstId === "number") aus.dienstId = e.dienstId;
  return aus;
}

/** Die ganze Liste in erlaubter Form; Ungültiges fällt weg. */
export function nichtUebernommenNormal(liste) {
  return (Array.isArray(liste) ? liste : []).map(nichtUebernommenEintrag).filter(Boolean).slice(0, 2000);
}
