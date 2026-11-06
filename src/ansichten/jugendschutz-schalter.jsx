/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { jugendMehrschichtig } from "../regelwerk.js";
import { Card, CardHead, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fDatum } from "../lib/datum.js";

/**
 * Jugendarbeitsschutz: mehrschichtiger Betrieb (§ 14 Abs. 2 Nr. 2 JArbSchG,
 * Nachprüfung WP-11). Eingeschaltet dürfen Jugendliche ab 16 Jahren bis 23 Uhr
 * eingeteilt werden — die Prüfung meldet dann nur einen Hinweis. Aus: Einsätze
 * 20–23 Uhr sind „Achtung" und brauchen eine Bestätigung. Unter 16 Jahren und
 * 23–6 Uhr sperrt die Prüfung in jedem Fall. Schalten darf, wer org.edit oder pattern.edit
 * hat; wann und von wem, setzt der Server.
 */
export function JugendschutzSchalter({ sitz, akt }) {
  const e = sitz.mandant.einstellungen || {};
  const an = jugendMehrschichtig(e);
  const j = e.jugendschutz || {};
  const durch = j.geaendertVon ? (sitz.mandant.personen.find((x) => String(x.id) === String(j.geaendertVon)) || {}) : null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill tone={an ? "ok" : undefined}>{an ? "mehrschichtig" : "nicht hinterlegt"}</Pill>}>
        Jugendarbeitsschutz: mehrschichtiger Betrieb</CardHead>
      <div style={{ padding: 22, fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
        In mehrschichtigen Betrieben dürfen Jugendliche ab 16 Jahren bis 23 Uhr beschäftigt werden
        (§ 14 Abs. 2 Nr. 2 JArbSchG). Ist das hinterlegt, meldet die Prüfung einen Einsatz bis 23 Uhr nur als
        Hinweis; sonst ist er „Achtung" und braucht eine Bestätigung. Unter 16 Jahren und zwischen 23 und 6 Uhr
        bleibt jeder Einsatz gesperrt. Weitere Branchenausnahmen (Gaststätten, Bäckereien, Landwirtschaft) kennt
        die Prüfung nicht.
        {j.geaendertAm && (
          <div style={{ marginTop: 10, ...NUM }}>Zuletzt geändert am {fDatum(String(j.geaendertAm).slice(0, 10))}
            {durch && (durch.vorname || durch.nachname) ? ` von ${`${durch.vorname || ""} ${durch.nachname || ""}`.trim()}` : ""}.</div>)}
        <div style={{ marginTop: 14 }}>
          <Btn kind={an ? undefined : "primary"} onClick={() => akt.setzeJugendMehrschichtig(!an)}>
            {an ? "Nicht mehr als mehrschichtig führen" : "Als mehrschichtigen Betrieb hinterlegen"}</Btn>
        </div>
      </div>
    </Card>);
}
