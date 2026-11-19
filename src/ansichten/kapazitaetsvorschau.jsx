/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { vorschau } from "../lib/fachlogik.js";
import { Card, CardHead, Lab } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fKurz } from "../lib/datum.js";

/* ===================== ANTRÄGE MIT VORSCHAU UND RUNDE ==================== */
export function Kapazitaetsvorschau({ sitz }) {
  const m = sitz.mandant;
  const v = useMemo(() => vorschau(m, 8), [m]);
  if (!v.offen.length && v.wochen.every((w) => w.status === "ok")) return null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Lab>{v.offen.length} offene Anträge einbezogen</Lab>}>Kapazität der nächsten acht Wochen</CardHead>
      <div style={{ padding: "18px 22px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {v.wochen.map((w, i) => (
          <div key={i} className="karte" style={{ padding: "12px 14px", minWidth: 116, flex: 1,
            background: w.status === "danger" ? C.dangerLight : w.status === "warn" ? C.warnLight : undefined }}>
            <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>ab {fKurz(w.von)}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 650, ...NUM,
                color: w.status === "danger" ? C.danger : w.status === "warn" ? C.warn : C.ok }}>{w.dann}</span>
              <span style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>Befunde</span>
            </div>
            <div style={{ fontSize: 11, color: C.dimmer, marginTop: 4, ...NUM }}>
              {w.neu > 0 ? `+${w.neu} durch Anträge` : w.antraege ? `${w.antraege} Anträge, tragbar` : "keine Anträge"}
            </div>
          </div>))}
      </div>
      <div style={{ padding: "0 22px 18px", fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
        Gezeigt wird der Zustand, der entstünde, wenn alle offenen Anträge genehmigt würden.
        Rot markierte Wochen kippen erst dadurch.
      </div>
    </Card>);
}
