/* ==========================================================================
   FUNKTIONSDIENST — Übersicht je Dienst und Tag (WP-19, Strang B)

   Zeigt je Funktionsbereich Soll, Ist und Fehlbestand in Worten, ohne Namen.
   Wo die Dienstzeit des Tages unbekannt ist, steht „ungeklärt“, nie „0“.
   Gepflegt werden Bereiche und Einteilungen in der Planung; diese Übersicht
   hängt dort ein, wenn das Modul „vorläufig“ ist. Keine feste Breite (360 px).
   ========================================================================== */
import { funktionsLage } from "../../server/lib/modul-funktionsdienst.mjs";

/** @param {{ m: any, datum: string, dienstId: string, personenImDienst: any[] | null }} props */
export function FunktionsUebersicht({ m, datum, dienstId, personenImDienst }) {
  const bereiche = Array.isArray(m && m.funktionsbereiche) ? m.funktionsbereiche : [];
  if (!bereiche.length) return <p>Noch keine Funktionsbereiche erfasst.</p>;
  const lage = funktionsLage(m, datum, dienstId, personenImDienst);
  const nach = new Map(lage.map((x) => [x.bereich, x]));
  return (
    <section aria-label={`Funktionsbereiche am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {bereiche.map((b) => {
        const x = nach.get(b.id);
        return (
          <article key={b.id} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{b.name}</h3>
            <p style={{ margin: "6px 0 0" }}>
              {!x ? "kein Soll in diesem Dienst"
                : x.status === "ungeklaert" ? `Soll ${x.soll} · Dienstzeit ungeklärt`
                  : `${x.ist.length} von ${x.soll} besetzt${x.fehlt > 0 ? ` — es fehlt ${x.fehlt === 1 ? "eine Person" : `${x.fehlt} Personen`}` : ""}`}
            </p>
          </article>);
      })}
    </section>);
}
