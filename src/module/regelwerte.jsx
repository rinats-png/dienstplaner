/* ==========================================================================
   REGELWERTFELD — ein Wert des Betriebs mit Herkunft (WP-19.11, 19.12)

   Zeigt, was gilt (Ausgangswert oder Wert des Betriebs, geprüft oder
   vorläufig), und lässt den Wert samt Quelle, Fundstelle, Version und
   Gültigkeit eintragen. Gesteuert: Der Aufrufer speichert (nur Rollen mit
   org.edit; der Server prüft Form und Recht und setzt Wer und Wann). Nichts
   hier behauptet, ein Wert sei gesetzlich vorgeschrieben: „geprüft“ heißt
   „vom Betrieb mit Quelle und Fundstelle belegt“.

   Ohne feste Breiten (360 px); jedes Feld hat eine sichtbare Beschriftung.
   ========================================================================== */
import { regelwertDef, regelwertEintrag, regelwertWirksam } from "../../server/lib/modul-regelwerte.mjs";

const HERKUNFT = { ausgangswert: "Ausgangswert, nicht geprüft", betrieb: "Wert des Betriebs", "nicht-gesetzt": "nicht gesetzt" };
const feld = { display: "grid", gap: 4 };
const eingabe = { width: "100%", boxSizing: "border-box" };

/**
 * @param {{ regelId: string, m: any, heute?: string, onAendern: (eintrag: any | null) => void }} props
 *   `onAendern(null)` setzt zurück (der Ausgangswert gilt wieder).
 */
export function RegelwertFeld({ regelId, m, heute, onAendern }) {
  const d = regelwertDef(regelId);
  if (!d) return <p role="alert">Unbekannter Regelwert.</p>;
  const w = regelwertWirksam(m, regelId, heute);
  const e = regelwertEintrag(m, regelId) || { pruefstatus: "provisional" };
  const setze = (teil) => onAendern({ wert: e.wert, quelle: e.quelle, fundstelle: e.fundstelle, version: e.version,
    gueltigAb: e.gueltigAb, gueltigBis: e.gueltigBis, pruefstatus: e.pruefstatus || "provisional", ...teil });
  const leer = (v) => (v === "" ? undefined : v);
  return (
    <fieldset style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, margin: 0, display: "grid", gap: 10, maxWidth: "100%" }}>
      <legend>{d.bezeichnung} ({regelId})</legend>
      <p style={{ margin: 0 }}>
        Es gilt: {w.wert === null ? "kein Wert" : `${w.wert} ${d.einheit}`} — {HERKUNFT[w.herkunft]}
        {w.herkunft === "betrieb" && (w.geprueft ? ", geprüft" : ", nicht geprüft")}.
      </p>
      <p style={{ margin: 0 }}>Ausgangswert: {d.ausgangswert === null ? "keiner" : `${d.ausgangswert} ${d.einheit}`} — {d.ausgangswertText} ({d.fachnachweis}).</p>
      <label style={feld}>Wert ({d.einheit})
        <input type="number" inputMode="decimal" min={d.min} max={d.max} step={d.ganzzahl ? 1 : "any"} value={e.wert ?? ""} style={eingabe}
          onChange={(ev) => setze({ wert: ev.target.value === "" ? undefined : Number(ev.target.value) })} />
      </label>
      <label style={feld}>Quelle (etwa Tarifvertrag, Betriebsvereinbarung, Gefährdungsbeurteilung)
        <input value={e.quelle || ""} maxLength={200} style={eingabe} onChange={(ev) => setze({ quelle: leer(ev.target.value) })} />
      </label>
      <label style={feld}>Fundstelle
        <input value={e.fundstelle || ""} maxLength={120} style={eingabe} onChange={(ev) => setze({ fundstelle: leer(ev.target.value) })} />
      </label>
      <label style={feld}>Version oder Stand
        <input value={e.version || ""} maxLength={40} style={eingabe} onChange={(ev) => setze({ version: leer(ev.target.value) })} />
      </label>
      <label style={feld}>Gültig ab
        <input type="date" value={e.gueltigAb || ""} style={eingabe} onChange={(ev) => setze({ gueltigAb: leer(ev.target.value) })} />
      </label>
      <label style={feld}>Gültig bis
        <input type="date" value={e.gueltigBis || ""} style={eingabe} onChange={(ev) => setze({ gueltigBis: leer(ev.target.value) })} />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" checked={e.pruefstatus === "geprueft"} onChange={(ev) => setze({ pruefstatus: ev.target.checked ? "geprueft" : "provisional" })} />
        Quelle ist geprüft (Quelle und Fundstelle sind dann Pflicht)
      </label>
      <div>
        <button type="button" onClick={() => onAendern(null)} style={{ minHeight: 44 }}>Zurücksetzen auf den Ausgangswert</button>
      </div>
    </fieldset>);
}
