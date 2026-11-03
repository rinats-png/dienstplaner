/* ==========================================================================
   ANLAGEN — Übersicht je Tag (WP-19, Strang C)

   Zeigt je Anlage, ob sie an einem Tag läuft und welche Mindestbesetzung je
   Dienstart sie verlangt. Anlagen ohne Laufzeitkalender heißen „nicht
   bewertbar", nie „läuft" oder „steht". Gepflegt werden die Felder in der
   Betriebsmittelansicht; eingehängt wird diese Übersicht, wenn das Modul
   „vorläufig" ist (server/lib/branchenmodule.mjs).
   ========================================================================== */
import { istAnlage, anlageLaeuft } from "../../server/lib/modul-anlagen.mjs";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** @param {{ m: any, datum: string }} props */
export function AnlagenUebersicht({ m, datum }) {
  const anlagen = (Array.isArray(m && m.betriebsmittel) ? m.betriebsmittel : []).filter(istAnlage);
  const dienstName = (id) => ((m.dienstarten || []).find((d) => d.id === id) || {}).name || id;
  if (!anlagen.length) return <p>Noch keine Anlagen erfasst. Lege sie als Betriebsmittel der Art „Anlage“ an.</p>;
  return (
    <section aria-label={`Anlagen am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {anlagen.map((a) => {
        const l = anlageLaeuft(a, datum);
        const besetzung = Object.entries(a.mindestBesetzung || {}).filter(([, n]) => n > 0);
        return (
          <article key={a.id} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{a.name}</h3>
            <p style={{ margin: "6px 0" }}>
              {l.offen ? "Laufzeit nicht hinterlegt — nicht bewertbar" : l.laeuft ? "läuft" : "steht"}
              {!l.offen && a.laufzeit && (
                <span> · {WOCHENTAGE.filter((_, i) => a.laufzeit.wochentage[i]).join(", ") || "kein Wochentag"}</span>)}
            </p>
            {besetzung.length > 0
              ? <ul style={{ margin: 0, paddingLeft: 18 }}>
                {besetzung.map(([d, n]) => <li key={d}>{dienstName(d)}: mindestens {n}</li>)}
              </ul>
              : <p style={{ margin: 0 }}>Keine Mindestbesetzung hinterlegt.</p>}
          </article>);
      })}
    </section>);
}
