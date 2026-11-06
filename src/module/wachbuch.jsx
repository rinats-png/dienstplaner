/* ==========================================================================
   WACHBUCH — Einträge eines Tages je Objekt (WP-19, Strang A)

   Zeigt die Einträge, die die Zugriffsstufe der Rolle sehen darf (W4 a+b),
   je Objekt in Uhrzeit-Reihenfolge; Nachträge stehen unter ihrem Eintrag.
   Die Stufe und die Einträge bestimmt der Server; diese Ansicht rechnet nur
   die Ausgabe (wachbuchAusgabe). Eintragen ist noch nicht freigeschaltet:
   der Schreibweg und die Zeile in RECHTEMATRIX.md sind offen, deshalb steht
   hier kein Formular. Keine feste Breite (360 px).
   ========================================================================== */
import { wachbuchAusgabe, WACHBUCH_ARTEN } from "../../server/lib/modul-wachbuch.mjs";

const ART = { vorkommnis: "Vorkommnis", kontrollgang: "Kontrollgang", uebergabe: "Übergabe", hinweis: "Hinweis" };

/**
 * @param {{ m: any, datum: string, zugriff?: string, person?: string | null, eigeneEinheit?: string | null }} props
 */
export function WachbuchTages({ m, datum, zugriff = "keiner", person = null, eigeneEinheit = null }) {
  const objekte = Array.isArray(m && m.objekte) ? m.objekte : [];
  if (!objekte.length) return <p>Noch keine Objekte erfasst.</p>;
  const namen = Object.fromEntries(objekte.map((o) => [o.id, o.name]));
  return (
    <section aria-label={`Wachbuch am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {objekte.map((o) => {
        const ausgabe = wachbuchAusgabe(m.wachbuch, { objektId: o.id, von: datum, bis: datum, zugriff, person, eigeneEinheit });
        const eintraege = ausgabe.eintraege || [];
        return (
          <article key={o.id} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{namen[o.id]}</h3>
            {ausgabe.grund ? <p>{ausgabe.grund}</p>
              : !eintraege.length ? <p>Keine sichtbaren Einträge an diesem Tag.</p>
                : <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {eintraege.map((e) => (
                    <li key={e.id}>
                      <strong>{e.uhrzeit}</strong>{" · "}{ART[e.art] || e.art}{": "}{e.text}
                      {(e.nachtraege || []).map((n) => (
                        <div key={n.id} style={{ marginLeft: 12, fontSize: 13 }}>
                          Nachtrag {n.erfasst}: {n.text}
                        </div>))}
                    </li>))}
                </ol>}
          </article>);
      })}
    </section>);
}

/** Die Ereignisarten, wie der Server sie kennt (für Hilfetexte und Tests). */
export const WACHBUCH_ART_NAMEN = Object.freeze(WACHBUCH_ARTEN.map((a) => ART[a]));
