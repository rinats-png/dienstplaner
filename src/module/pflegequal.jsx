/* ==========================================================================
   PFLEGEQUALIFIKATION — Verteilung je Dienst nach Niveau (WP-19, Strang B)

   Zeigt die Besetzung eines Dienstes nach Niveau: Fachkräfte, Pflegekräfte
   insgesamt und Betreuungskräfte gesondert (Q2 a). Die Zahlen sind eine
   Kennzahl, keine Prüfung gegen Besetzungswerte (Q3 b, offen). Keine feste
   Breite (360 px).
   ========================================================================== */
import { pflegeVerteilung } from "../../server/lib/modul-pflegequal.mjs";

/**
 * @param {{ m: any, personenImDienst: any[], qualGueltig: (m: any, p: any, qid: string, heute: string) => boolean, heute: string }} props
 */
export function PflegeVerteilung({ m, personenImDienst, qualGueltig, heute }) {
  const niveaus = Array.isArray(m && m.pflegeNiveaus) ? m.pflegeNiveaus : [];
  if (!niveaus.length) return <p>Noch keine Pflegeniveaus eingerichtet.</p>;
  if (typeof qualGueltig !== "function") return <p>Qualifikationen können hier nicht geprüft werden.</p>;
  const v = pflegeVerteilung(m, personenImDienst || [], { qualGueltig, heute });
  return (
    <section aria-label="Pflegequalifikationen im Dienst" style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      <p style={{ margin: 0 }}>Fachkräfte: {v.fachkraefte} · Pflegekräfte insgesamt: {v.pflegekraefte}</p>
      <p style={{ margin: 0 }}>Betreuungskräfte (nicht als Pflegekräfte gezählt): {v.betreuung}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {v.niveaus.map((n) => (
          <li key={n.id}>{n.name}: {n.anzahl}</li>))}
      </ul>
      {v.ohneNiveau > 0 && <p style={{ margin: 0 }}>Ohne zugeordnetes Niveau: {v.ohneNiveau}</p>}
    </section>);
}
