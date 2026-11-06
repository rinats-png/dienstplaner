/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { jeStandort as aufstellungJeStandort, standortZuschlag } from "../standorte.js";
import { heute } from "../lib/datum.js";
import { Card, CardHead, Lab, Pill } from "../ui/bausteine.jsx";
import { eur, zahl } from "../lib/format.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { mehrzahl, rollenName } from "../lib/rollen.js";



/* ==========================================================================
   STANDORTE, GESPIEGELT

   Standorte kosten nichts mehr, solange sie zum Kontingent der Stufe
   gehören — das Anlegen ist deshalb keine Vertragsänderung mehr, über die
   der Betreiber informiert werden müsste. Was noch zählt: welche
   Standorte über das Kontingent hinausgewachsen sind und was sie kosten.

   Es bleiben Zahlen. Keine Namen, keine Dienstpläne — der Betreiber
   verkauft Software, er führt den Betrieb nicht.
   ========================================================================== */
export function StandorteSpiegel({ m, p }) {
  const aufstellung = aufstellungJeStandort(m, heute());
  const nachGroesse = [...aufstellung].sort((a, b) => b.personen - a.personen);

  return (
    <Card>
      <CardHead right={<Lab>
        {p.summeStandorte > 0 ? `+${eur(p.summeStandorte)} / Monat` : "kostenlos enthalten"}</Lab>}>
        Standorte</CardHead>

      <div style={{ padding: "0 22px 4px", fontSize: 12.5, color: C.dimmer }}>
        {zahl(p.stufe.standorteInklusive)} der größten Standorte sind in {p.stufe.name} enthalten.
      </div>

      <div style={{ padding: 22, display: "grid", gap: 10 }}>
        {aufstellung.map((a) => {
          const rang = nachGroesse.findIndex((x) => x.standort.id === a.standort.id);
          const inklusive = rang > -1 && rang < p.stufe.standorteInklusive;
          const zuschlag = inklusive ? 0 : standortZuschlag(a.personen);
          return (
            <div key={a.standort.id} style={{ display: "flex", alignItems: "center", gap: 12,
              background: C.bg, borderRadius: 10, padding: "12px 14px", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 550 }}>{a.standort.name}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                  {zahl(a.einheiten)} {mehrzahl(m.einheitLabel)} · {zahl(a.personen)} Personen
                  {a.standort.bundesland ? ` · ${a.standort.bundesland}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {Object.entries(a.rollen).filter(([, n]) => n > 0).map(([r, n]) => (
                  <Pill key={r} size="sm">{n}× {rollenName(m, r)}</Pill>))}
              </div>
              <span style={{ fontSize: 13, width: 110, textAlign: "right",
                color: zuschlag > 0 ? C.warn : C.dimmer, fontWeight: zuschlag > 0 ? 600 : 400, ...NUM }}>
                {inklusive ? "im Kontingent" : zuschlag > 0 ? `+${eur(zuschlag)}` : "unter Schwelle"}</span>
            </div>);
        })}
      </div>
    </Card>);
}
