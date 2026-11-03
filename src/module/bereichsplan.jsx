/* ==========================================================================
   BEREICHSPLAN — Übersicht je Einheit, Dienst und Tag (WP-19, Strang B)

   Zeigt je Bereich Soll, Ist und Fehlbestand in Worten, dazu wer im Dienst
   noch keinem Bereich zugeordnet ist. Gepflegt wird die Zuordnung im
   Tagesplan (Planung, Leitung, Schichtverantwortung im eigenen Bereich);
   die Übersicht hängt dort ein, wenn das Modul „vorläufig" ist
   (server/lib/branchenmodule.mjs). Die Wörter folgen der Branche
   (B3 a: Wachabteilung im Rettungsdienst). Keine feste Breite (360 px).
   ========================================================================== */
import { bereichsLage } from "../../server/lib/modul-bereichsplan.mjs";

/** Wie die Branche ihre Bereiche nennt. */
const BEGRIFF = { rettung: "Rettungsmittel", feuerwehr: "Wachabteilung", pflege: "Bereich", klinik: "Bereich" };

/** @param {{ m: any, einheitId: any, datum: string, dienstId: string, personenImDienst: any[] }} props */
export function BereichsUebersicht({ m, einheitId, datum, dienstId, personenImDienst }) {
  const einheit = (Array.isArray(m && m.einheiten) ? m.einheiten : []).find((e) => String(e.id) === String(einheitId));
  const bereiche = einheit && Array.isArray(einheit.bereiche) ? einheit.bereiche : [];
  const wort = BEGRIFF[m && m.branche] || "Bereich";
  if (!bereiche.length) return <p>Für diese Einheit sind noch keine Bereiche angelegt.</p>;
  const lage = bereichsLage(m, einheitId, datum, dienstId, personenImDienst);
  const nach = new Map(lage.bereiche.map((x) => [x.bereich, x]));
  const name = (id) => {
    const p = (personenImDienst || []).find((x) => x.id === id);
    return p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "?";
  };
  return (
    <section aria-label={`${wort}e am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {bereiche.map((b) => {
          const x = nach.get(b.id);
          return (
            <li key={b.id} style={{ overflowWrap: "anywhere" }}>
              <strong>{b.name}</strong>{": "}
              {x
                ? <>{x.ist.length} von {x.soll} besetzt{x.fehlt > 0 ? ` — es fehlt ${x.fehlt === 1 ? "eine Person" : `${x.fehlt} Personen`}` : ""}
                  {x.ist.length > 0 && <> ({x.ist.map(name).join(", ")})</>}</>
                : "kein Soll in diesem Dienst"}
            </li>);
        })}
      </ul>
      {lage.nichtZugeordnet.length > 0 && (
        <p style={{ margin: 0 }}>Noch nicht zugeordnet: {lage.nichtZugeordnet.map(name).join(", ")} (nicht zugeordnet zu einem {wort}).</p>)}
    </section>);
}
