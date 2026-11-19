/* ==========================================================================
   OBJEKTBERICHT — Vorschau je Objekt und Zeitraum (WP-19, Strang A)

   Zeigt den Bericht aus objektberichtDaten: Soll, Ist und Fehlbestand je Tag,
   Dienst und Posten, ohne Namen. Wo die Dienstzeit unbekannt ist, steht
   „ungeklärt“, nie „0“. Ohne Rolle „voll“ (Planung, Leitung) erscheint kein
   Bericht. Keine feste Breite (360 px). Ausgabe als CSV ist gebaut
   (objektberichtCsv), hier noch nicht eingehängt.
   ========================================================================== */
import { objektberichtDaten } from "../../server/lib/modul-objektbericht.mjs";

/**
 * @param {{ m: any, von: string, bis: string, zugriff?: string, dienstzeit?: (datum: string, dienstId: string) => string[] | null }} props
 */
export function ObjektberichtVorschau({ m, von, bis, zugriff = "keiner", dienstzeit = () => null }) {
  const objekte = Array.isArray(m && m.objekte) ? m.objekte : [];
  if (!objekte.length) return <p>Noch keine Objekte erfasst.</p>;
  if (zugriff !== "voll") return <p>Der Objektbericht ist nur für Planung und Leitung.</p>;
  return (
    <section aria-label={`Objektbericht ${von} bis ${bis}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {objekte.map((o) => {
        const b = objektberichtDaten(m, { objektId: o.id, von, bis, zugriff, dienstzeit });
        if (b.grund) return <p key={o.id}>{o.name}: {b.grund}</p>;
        const zeilen = b.tage.flatMap((t) => t.zeilen.map((z) => ({ ...z, datum: t.datum })));
        return (
          <article key={o.id} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{o.name} · {von} bis {bis}</h3>
            {!zeilen.length ? <p>Keine Soll-Werte in diesem Zeitraum.</p>
              : <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {zeilen.map((z) => (
                  <li key={`${z.datum}|${z.dienst}|${z.posten}`}>
                    {z.datum} · {z.name}: {z.status === "ungeklärt" ? "Dienstzeit ungeklärt" : `${z.ist} von ${z.soll} besetzt${z.fehlt > 0 ? `, es fehlt ${z.fehlt}` : ""}`}
                  </li>))}
              </ul>}
            <p style={{ margin: "6px 0 0", fontSize: 13 }}>Ereignisse im Zeitraum: {b.ereignisse.length}</p>
          </article>);
      })}
    </section>);
}
