/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { NUM } from "../ui/thema.js";
import { C } from "../farben.js";
import { Icon } from "../gestalt/icons.jsx";

/** Schrittanzeige — eigenständig, damit sie überall gleich aussieht. */
export function Schrittleiste({ aktuell, schritte }) {
  return (
    <div className="reiterreihe" style={{ marginBottom: 26 }}>
      {schritte.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, ...NUM,
            background: i < aktuell ? C.accentDeep : i === aktuell ? C.accent : C.lineSoft,
            color: i <= aktuell ? C.aufAkzent : C.dim }}>
            {i < aktuell ? <Icon n="haken" size={13} strokeWidth={2.4} /> : i + 1}</span>
          <span style={{ fontSize: 13, fontWeight: i === aktuell ? 650 : 500,
            color: i === aktuell ? C.text : C.dimmer, whiteSpace: "nowrap" }}>{s}</span>
          {i < schritte.length - 1 && <span style={{ width: 24, height: 1.5,
            background: C.lineStark, margin: "0 8px" }} />}
        </div>))}
    </div>);
}

/* ==========================================================================
   ABLAUFDIAGRAMM UND EINFÜHRUNG
   Jede Rolle sieht denselben Gesamtablauf — aber nur ihr eigener Abschnitt ist
   handlungsfähig. Was andere bereits erledigt haben, wird gezeigt und erklärt,
   damit klar ist, worauf die eigene Arbeit aufsetzt.
   ========================================================================== */
