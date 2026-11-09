/* WP-I6: Anzeige der Planungsreife (Pruefliste vor dem Planen).
   Der Rechenkern (server/lib/engine/planungsreife.mjs) liefert nur Kennungen;
   Namen werden erst hier aus dem Bestand aufgeloest. */
import { planungsreife } from "../engine/planungsreife.js";
import { C } from "../farben.js";

const tageImMonat = (j, mon) => new Date(Date.UTC(j, mon, 0)).getUTCDate();

/** Rechnet die Planungsreife fuer den angezeigten Monat (ym = "JJJJ-MM"). */
export function reifeFuerMonat(m, ym, heute) {
  const j = Number(String(ym).slice(0, 4)), mon = Number(String(ym).slice(5, 7));
  const gueltig = Number.isInteger(j) && mon >= 1 && mon <= 12;
  const zeitraum = gueltig ? { von: `${ym}-01`, bis: `${ym}-${String(tageImMonat(j, mon)).padStart(2, "0")}` } : { von: "", bis: "" };
  return { zeitraum, reife: planungsreife(m, { ...zeitraum, heute }) };
}

const URTEIL = {
  nicht_bereit: { text: "nicht bereit", farbe: () => C.danger },
  bereit_mit_hinweisen: { text: "bereit, mit Hinweisen", farbe: () => C.warn },
  bereit: { text: "bereit", farbe: () => C.ok },
};

const MAX_NAMEN = 8;

export function Planungsreife({ m, ym, heute }) {
  const { reife } = reifeFuerMonat(m, ym, heute);
  const u = URTEIL[reife.urteil] || URTEIL.nicht_bereit;
  const personen = new Map((m && Array.isArray(m.personen) ? m.personen : []).map((p) => [p.id, `${p.vorname || ""} ${p.nachname || ""}`.trim()]));
  const namen = (ids) => {
    const n = (ids || []).map((id) => personen.get(id)).filter(Boolean);
    if (!n.length) return "";
    return n.slice(0, MAX_NAMEN).join(", ") + (n.length > MAX_NAMEN ? ` und ${n.length - MAX_NAMEN} weitere` : "");
  };
  return (
    <div role="region" aria-label="Planungsreife" style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: "12px 14px", display: "grid", gap: 8 }}>
      <div style={{ fontSize: 14 }}>
        <b>Planungsreife</b>{": "}<span style={{ color: u.farbe(), fontWeight: 700 }}>{u.text}</span>
      </div>
      {reife.luecken.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: C.dim }}>
          {reife.luecken.map((l, i) => {
            const n = namen(l.ids);
            return (<li key={`${l.punkt}-${i}`}>{l.text}{n ? <span style={{ color: C.dimmer }}>{" "}({n})</span> : null}</li>);
          })}
        </ul>)}
    </div>);
}
