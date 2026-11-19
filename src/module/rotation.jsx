/* ==========================================================================
   ROTATION — Einsätze je Tag und Ziele je Person (WP-19, Strang B)

   Zeigt je Person, in welcher Einheit sie am Tag eingesetzt ist (Einsatz vor
   Zugehörigkeit), Überschneidungen als Hinweis und die Zielliste (Pflicht-
   stationen). Erfüllt heißt: abgeschlossener Einsatz in der Einheit; das
   ersetzt keine Weiterbildungsbescheinigung. Eingetragen wird über den
   Schreibweg (in Vorbereitung). Keine feste Breite (360 px).
   ========================================================================== */
import { einheitAm, rotationUeberschneidungen, rotationZiele, rotationListe } from "../../server/lib/modul-rotation.mjs";

/**
 * @param {{ m: any, datum: string, heute: string, personen?: Record<string, string> }} props
 */
export function RotationUebersicht({ m, datum, heute, personen = {} }) {
  const einheiten = Object.fromEntries((Array.isArray(m && m.einheiten) ? m.einheiten : []).map((e) => [e.id, e.name]));
  const w = m && m.rotationen;
  const ids = [...new Set(rotationListe(w).filter((e) => e.art !== "ziel").map((e) => e.personId))].sort();
  const ueber = rotationUeberschneidungen(w);
  if (!ids.length) return <p>Noch keine Rotation geplant.</p>;
  return (
    <section aria-label={`Rotation am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {ueber.length > 0 && <p role="status">Hinweis: {ueber.length === 1 ? "eine Überschneidung" : `${ueber.length} Überschneidungen`} von Einsätzen gefunden.</p>}
      {ids.map((pid) => {
        const e = einheitAm(w, pid, datum);
        const ziele = rotationZiele(w, pid, heute);
        return (
          <article key={pid} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{personen[pid] || "Person"}</h3>
            <p style={{ margin: "6px 0 0" }}>{e ? `eingesetzt in ${einheiten[e] || "einer Einheit"}` : "am Tag keiner Einheit zugeordnet"}</p>
            {ziele.length > 0 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {ziele.map((z) => (
                  <li key={z.id}>{einheiten[z.einheitId] || "Einheit"}{z.pflicht ? " (Pflicht)" : ""}: {z.erfuellt ? "erfüllt" : "offen"}</li>))}
              </ul>)}
          </article>);
      })}
    </section>);
}
