/* ==========================================================================
   BEREITSCHAFTSDIENST — Dienste je Tag mit Anrechnung (WP-19, Strang B)

   Zeigt je Person die Bereitschaft oder Rufbereitschaft des Tages mit Stufe,
   Arbeitszeit und Vergütungsbewertung. Arbeitszeit und Vergütung stehen
   getrennt (R2 c). Ohne Tarifwert der Stufe steht „ungeklärt“, nie „0“.
   Eingetragen wird über den Schreibweg (in Vorbereitung); diese Ansicht rechnet nur.
   Keine feste Breite (360 px).
   ========================================================================== */
import { bereitschaftAnrechnung } from "../../server/lib/modul-bereitschaftsdienst.mjs";

const stunden = (min) => `${Math.round(min / 6) / 10} h`;

/** @param {{ m: any, datum: string, personen?: Record<string, string> }} props  personen: Kennung → Anzeigename */
export function BereitschaftsUebersicht({ m, datum, personen = {} }) {
  const stufen = Array.isArray(m && m.bereitschaftStufen) ? m.bereitschaftStufen : [];
  const dienste = Object.entries((m && m.bereitschaft) || {})
    .filter(([k]) => k.slice(k.lastIndexOf("|") + 1) === datum)
    .map(([k, e]) => ({ pid: k.slice(0, k.lastIndexOf("|")), e, stufe: stufen.find((s) => s.id === e.stufe) }))
    .filter((x) => x.stufe);
  if (!dienste.length) return <p>Keine Bereitschaft an diesem Tag.</p>;
  return (
    <section aria-label={`Bereitschaft am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {dienste.map(({ pid, e, stufe }) => {
        const a = bereitschaftAnrechnung(e, stufe);
        return (
          <article key={pid} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{personen[pid] || "Person"}</h3>
            <p style={{ margin: "6px 0 0" }}>
              {stufe.name} ({stufe.art === "rufbereitschaft" ? "Rufbereitschaft" : "Bereitschaft"}) · {e.beginn}–{e.ende}
              {" · "}Arbeitszeit {stunden(a.arbeitszeitMinuten)}
              {" · "}Vergütung {a.verguetungsMinuten === null ? "ungeklärt (Tarifwert fehlt)" : stunden(a.verguetungsMinuten)}
            </p>
            {(e.inanspruchnahmen || []).length > 0 && (
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                Inanspruchnahme: {e.inanspruchnahmen.map((i) => `${i.von}–${i.bis}`).join(", ")}
              </p>)}
          </article>);
      })}
    </section>);
}

