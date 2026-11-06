/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { Hinweisband } from "../gestalt/ansichten.jsx";
import { C } from "../farben.js";
import { fLang, DOW } from "../lib/datum.js";
import { dow, pISO } from "../regelwerk.js";
import { NUM } from "../ui/thema.js";

/**
 * Die Antwort über dem Raster. Wer nichts weiter tun muss, hat den Monat
 * hier bereits verstanden und kann die Ansicht schließen.
 */
export function Tagesfazit({ lage, onTag }) {
  if (!lage.tage.length) {
    return (
      <Hinweisband ton="ok" titel={<>Der Monat ist durchgehend besetzt.{" "}
        <span style={{ fontWeight: 400, color: C.dim }}>Keine Unterschreitung, keine offene Quote.</span></>} />);
  }
  const satz = lage.dringend && lage.knapp
    ? `${lage.dringend} Tag${lage.dringend > 1 ? "e sind" : " ist"} unterbesetzt, ${lage.knapp} weitere${lage.knapp > 1 ? "" : "r"} knapp.`
    : lage.dringend
      ? `${lage.dringend} Tag${lage.dringend > 1 ? "e brauchen" : " braucht"} Aufmerksamkeit.`
      : `${lage.knapp} Tag${lage.knapp > 1 ? "e sind" : " ist"} knapp besetzt.`;
  return (
    <Hinweisband ton={lage.dringend ? "danger" : "warn"} titel={satz}>
      <div className="noprint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        {lage.tage.slice(0, 8).map((t) => (
          <button key={t.datum} type="button" className="chip" onClick={() => onTag(t.datum)}
            title={`${fLang(t.datum)} · ${t.text}`}>
            <span className="punkt" style={{ background: t.stufe === 2 ? C.danger : C.warn }} />
            {DOW[dow(t.datum)]} <b>{pISO(t.datum).getDate()}.</b>
            <span style={{ color: C.dim }}>{t.text}</span>
          </button>))}
        {lage.tage.length > 8 && (
          <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>+{lage.tage.length - 8} weitere</span>)}
      </div>
    </Hinweisband>);
}
