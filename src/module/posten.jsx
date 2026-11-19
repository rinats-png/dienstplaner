/* ==========================================================================
   POSTEN — Übersicht je Dienst und Tag (WP-19, Strang A)

   Zeigt je Objekt die Posten mit Soll, Ist und Fehlbestand in Worten.
   Gepflegt werden Objekte und Einteilungen in der Planung; diese Übersicht
   hängt dort ein, wenn das Modul „vorläufig" ist
   (server/lib/branchenmodule.mjs). Keine feste Breite (360 px).
   ========================================================================== */
import { postenLage } from "../../server/lib/modul-posten.mjs";

/** @param {{ m: any, datum: string, dienstId: string, personenImDienst: any[] }} props */
export function PostenUebersicht({ m, datum, dienstId, personenImDienst }) {
  const objekte = Array.isArray(m && m.objekte) ? m.objekte : [];
  if (!objekte.length) return <p>Noch keine Objekte erfasst.</p>;
  const lage = postenLage(m, datum, dienstId, personenImDienst);
  const nach = new Map(lage.map((x) => [x.posten, x]));
  const name = (id) => {
    const p = (personenImDienst || []).find((x) => x.id === id);
    return p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "?";
  };
  return (
    <section aria-label={`Posten am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {objekte.map((o) => (
        <article key={o.id} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{o.name}</h3>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {(o.posten || []).map((p) => {
              const x = nach.get(p.id);
              return (
                <li key={p.id}>
                  <strong>{p.name}</strong>{": "}
                  {x
                    ? <>{x.ist.length} von {x.soll} besetzt{x.fehlt > 0 ? ` — es fehlt ${x.fehlt === 1 ? "eine Person" : `${x.fehlt} Personen`}` : ""}
                      {x.ist.length > 0 && <> ({x.ist.map(name).join(", ")})</>}</>
                    : "kein Soll in diesem Dienst"}
                </li>);
            })}
          </ul>
        </article>))}
    </section>);
}
