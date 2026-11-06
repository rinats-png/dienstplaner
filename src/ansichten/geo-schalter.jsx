/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { Card, CardHead, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { GEO_SPOOFING_TEXT, GEO_MODUS_TEXT } from "../../server/lib/geo.mjs";
import { fDatum } from "../lib/datum.js";

export function GeoSchalter({ sitz, akt }) {
  const e = sitz.mandant.einstellungen || {};
  const an = e.geoPruefung === true;
  const pflicht = an && e.geoModus === "pflicht";
  const [geprueft, setGeprueft] = useState(false);
  const [modusGeprueft, setModusGeprueft] = useState(false);
  const durch = e.geoPruefungAktiviertVon
    ? (sitz.mandant.personen.find((x) => String(x.id) === String(e.geoPruefungAktiviertVon)) || {}) : null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill tone={an ? "ok" : undefined}>{an ? "eingeschaltet" : "aus"}</Pill>}>
        Standortprüfung beim Stempeln</CardHead>
      <div style={{ padding: 22, fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
        Ist sie eingeschaltet, prüft der Server beim Ein- und Ausstempeln einmalig, ob die Person am Standort
        ihrer Einheit ist. Gespeichert werden das Ergebnis, die Entfernung grob gerundet, die Messgenauigkeit und
        der Prüfort (Standort oder Einsatzort) — keine Koordinate, kein Verlauf. Die Arbeitszeit wird immer erfasst,
        auch ohne Position oder außerhalb des Umkreises.
        <div style={{ marginTop: 10 }}>{GEO_SPOOFING_TEXT}</div>
        {an && (
          <div style={{ marginTop: 14, color: C.text }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Prüfmodus: {pflicht ? "verpflichtend" : "Hinweis"}</div>
            <div style={{ color: C.dim }}>
              {pflicht
                ? "Ein Stempel, dessen Ort nicht bestätigt ist (außerhalb, ohne Position, nicht bewertbar), bekommt die Markierung „Ort nicht bestätigt“ und geht in die Klärung der Leitung. Die Arbeitszeit wird trotzdem erfasst."
                : "Das Ergebnis wird gespeichert und angezeigt; es entsteht keine Markierung."}
              {" "}Beim Außendienst gibt es keinen festen Ort — dort wird nichts gemessen.
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {pflicht ? <Btn onClick={() => akt.setzeGeoModus("hinweis")}>Auf Hinweis zurückstellen</Btn> : (<>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", maxWidth: 560 }}>
                  <input type="checkbox" checked={modusGeprueft} onChange={(x) => setModusGeprueft(x.target.checked)} />
                  <span>{GEO_MODUS_TEXT}</span>
                </label>
                <Btn disabled={!modusGeprueft} onClick={() => { akt.setzeGeoModus("pflicht"); setModusGeprueft(false); }}>Verpflichtend stellen</Btn></>)}
            </div>
          </div>)}
        {an && e.geoPruefungAktiviertAm && (
          <div style={{ marginTop: 10, ...NUM }}>Eingeschaltet am {fDatum(String(e.geoPruefungAktiviertAm).slice(0, 10))}
            {durch && (durch.vorname || durch.nachname) ? ` von ${`${durch.vorname || ""} ${durch.nachname || ""}`.trim()}` : ""}.</div>)}
        <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {an ? <Btn onClick={() => akt.setzeGeoPruefung(false)}>Ausschalten</Btn> : (<>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: C.text, maxWidth: 560 }}>
              <input type="checkbox" checked={geprueft} onChange={(x) => setGeprueft(x.target.checked)} />
              <span>Datenschutz und gegebenenfalls Mitbestimmung für diese Funktion wurden betrieblich geprüft.</span>
            </label>
            <Btn kind="primary" disabled={!geprueft} onClick={() => { akt.setzeGeoPruefung(true); setGeprueft(false); }}>
              Einschalten</Btn></>)}
        </div>
      </div>
    </Card>);
}
