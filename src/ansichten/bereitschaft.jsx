/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { H1, Card, Leer, klickbar, Pill } from "../ui/bausteine.jsx";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { fKurz, heute, DOW } from "../lib/datum.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { dow } from "../regelwerk.js";
import { Zelle } from "../ui/leisten.jsx";
import { bereitschaftsplan } from "../lib/fachlogik.js";

/* ============================== BEREITSCHAFT ========================== */
export function Bereitschaft({ sitz, akt, oeffneTag }) {
  const m = sitz.mandant;
  const plan = useMemo(() => bereitschaftsplan(m, heute(), 21), [m]);
  if (!plan) return (
    <div>
      <H1 rubrik="Planung" sub="Wer ist erreichbar und wer ist Rückfallebene. Rufbereitschaft zählt anteilig auf die Arbeitszeit und unterbricht die Ruhezeit nicht.">
        Bereitschaft</H1>
      <Card>
        <Leer titel="Keine Rufbereitschaft eingerichtet"
          text={'Lege unter Dienstarten eine Dienstart mit dem Kennzeichen „Rufbereitschaft" an. Sie wird anteilig auf die Arbeitszeit angerechnet und unterbricht die Ruhezeit nicht.'} />
      </Card>
    </div>);

  return (
    <div>
      <H1 rubrik="Planung" sub="Wer ist erreichbar und wer ist Rückfallebene. Rufbereitschaft zählt anteilig auf die Arbeitszeit und unterbricht die Ruhezeit nicht.">
        Bereitschaft</H1>
      <Card>
        {plan.tage.map((t, i) => {
          const fei = feiertag(t.datum, m.bundesland);
          return (
            <div key={t.datum} className="row" {...klickbar(() => oeffneTag(t.datum), `${fKurz(t.datum)} öffnen`)}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 22px", cursor: "pointer",
                borderBottom: i < plan.tage.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                background: t.datum === heute() ? C.accentLight : undefined, flexWrap: "wrap" }}>
              <div style={{ minWidth: 116 }}>
                <div style={{ fontSize: 13.5, fontWeight: t.datum === heute() ? 700 : 500, ...NUM }}>
                  {DOW[dow(t.datum)]} {fKurz(t.datum)}</div>
                {fei && <div style={{ fontSize: 11.5, color: C.danger }}>Feiertag</div>}
              </div>
              {t.eintraege.map((e) => (
                <div key={e.da.id} style={{ flex: 1, minWidth: 210, display: "flex", alignItems: "center", gap: 11 }}>
                  <Zelle da={e.da} size={26} />
                  {e.personen.length === 0
                    ? <Pill size="sm" tone="danger">nicht besetzt</Pill>
                    : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {e.personen.map((p, k) => (
                          <Pill key={p.id} size="sm" tone={k === 0 ? "accent" : "neutral"}>
                            {k === 0 ? "" : "Rückfall: "}{p.nachname}</Pill>))}
                      </div>}
                </div>))}
            </div>);
        })}
      </Card>
    </div>);
}
