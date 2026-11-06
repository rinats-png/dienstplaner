/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { planFreigabePflicht, planFreigabeAktiv } from "../../server/lib/planfreigabe.mjs";
import { Card, CardHead, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fDatum } from "../lib/datum.js";

/**
 * Planfreigabe als Pflicht (WP-23). Eingeschaltet (oder sobald ein Monat freigegeben ist) sehen
 * Beschäftigte die Einteilungen eines nicht freigegebenen Monats nicht — sie sehen dort „noch nicht
 * veröffentlicht“. Schalten darf, wer org.edit hat; wann und von wem, setzt der Server.
 */
export function PlanFreigabeSchalter({ sitz, akt }) {
  const m = sitz.mandant;
  const e = m.einstellungen || {};
  const pflicht = planFreigabePflicht(m);
  const wirkt = planFreigabeAktiv(m);
  const durch = e.planFreigabePflichtGeaendertVon
    ? (m.personen.find((x) => String(x.id) === String(e.planFreigabePflichtGeaendertVon)) || {}) : null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill tone={wirkt ? "ok" : "warn"}>{wirkt ? "Entwürfe verborgen" : "Beschäftigte sehen Entwürfe"}</Pill>}>
        Planfreigabe</CardHead>
      <div style={{ padding: 22, fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
        Ein Monatsplan ist ein Entwurf, bis er freigegeben wird. Ist die Planfreigabe eingeschaltet, sehen
        Beschäftigte die Einteilungen eines nicht freigegebenen Monats nicht — dort steht „noch nicht
        veröffentlicht“. Heute und frühere Tage zählen nie als Entwurf. Betriebsrat, Schichtverantwortung und
        Planung sehen weiter alles. {!pflicht && wirkt && "Die Pflicht ist aus, wirkt aber, weil schon ein Monat freigegeben wurde. "}
        {!wirkt && "Solange sie aus ist und noch kein Monat freigegeben wurde, sehen Beschäftigte auch Entwürfe."}
        {e.planFreigabePflichtGeaendertAm && (
          <div style={{ marginTop: 10, ...NUM }}>Zuletzt geändert am {fDatum(String(e.planFreigabePflichtGeaendertAm).slice(0, 10))}
            {durch && (durch.vorname || durch.nachname) ? ` von ${`${durch.vorname || ""} ${durch.nachname || ""}`.trim()}` : ""}.</div>)}
        <div style={{ marginTop: 14 }}>
          <Btn kind={pflicht ? undefined : "primary"} onClick={() => akt.setzePlanFreigabePflicht(!pflicht)}>
            {pflicht ? "Planfreigabe ausschalten" : "Planfreigabe aktivieren"}</Btn>
        </div>
      </div>
    </Card>);
}
