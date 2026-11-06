/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { n1, sgn } from "../lib/format.js";

/**
 * Stundenkonto im skandinavischen Zuschnitt: eine große Zahl, eine dünne Linie,
 * viel Weißraum. Keine Gitternetze, keine Achsenbeschriftung, keine Farbflächen —
 * der Verlauf trägt die Aussage, alles andere tritt zurück.
 */
export function Kontoblatt({ m, verlauf, jetzt, trend }) {
  /* Fehlt das Konto (Datenschutz E1, neue Person ohne Ist-Zeiten), gibt es
     nichts zu zeichnen: ehrlicher Hinweis statt NaN-Linie oder Absturz. */
  if (!Array.isArray(verlauf) || !verlauf.length || !verlauf.every((x) => Number.isFinite(x.kto))
    || !Number.isFinite(jetzt) || !Number.isFinite(trend)) {
    return (
      <div style={{ background: C.flaeche, borderRadius: 24, padding: "24px 26px",
        border: `1px solid ${C.line}`, marginBottom: 12, color: C.dim, fontSize: 14.5, lineHeight: 1.5 }}>
        Für dein Stundenkonto liegen noch keine Werte vor.
      </div>);
  }
  const grenze = m.einstellungen.ausgleichGrenze || 40;
  const werte = verlauf.map((x) => x.kto);
  const min = Math.min(...werte, 0), max = Math.max(...werte, 0);
  const spanne = (max - min) || 1;
  const W = 300, H = 78;
  const x = (i) => (i / Math.max(1, verlauf.length - 1)) * W;
  const y = (v) => H - ((v - min) / spanne) * H;
  const linie = verlauf.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kto).toFixed(1)}`).join(" ");
  const letzterX = x(verlauf.length - 1), letzterY = y(jetzt);
  const ueber = Math.abs(jetzt) > grenze;
  const richtung = Math.abs(trend) < 3 ? "gleichbleibend" : trend > 0 ? "aufbauend" : "abbauend";

  return (
    <div style={{ background: C.flaeche, borderRadius: 24, padding: "30px 26px 26px",
      border: `1px solid ${C.line}`, marginBottom: 12 }}>
      {/* Die Zahl trägt alles */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: "-.045em", lineHeight: 1,
            color: ueber ? C.warn : C.text, ...NUM }}>
            {jetzt >= 0 ? "+" : "−"}{n1(Math.abs(jetzt))}
            <span style={{ fontSize: 19, fontWeight: 400, color: C.dimmer, marginLeft: 6 }}>h</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.dim, marginTop: 9 }}>
            {richtung}{Math.abs(trend) >= 3 ? ` · ${sgn(trend)} h in ${verlauf.length} Monaten` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", paddingTop: 5 }}>
          <div style={{ fontSize: 11, color: C.dimmer, letterSpacing: ".09em", textTransform: "uppercase" }}>
            Grenze</div>
          <div style={{ fontSize: 15, color: C.dim, marginTop: 4, ...NUM }}>± {n1(grenze)} h</div>
        </div>
      </div>

      {/* Eine dünne Linie, sonst nichts */}
      <div style={{ position: "relative", marginTop: 26 }}>
      <svg viewBox={`0 0 ${W} ${H + 14}`} preserveAspectRatio="none"
        style={{ width: "100%", height: 104, display: "block", overflow: "visible" }}>
        {min < 0 && max > 0 && (
          <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke={C.line} strokeWidth=".8"
            vectorEffect="non-scaling-stroke" />)}
        <path d={linie} fill="none" stroke={ueber ? C.warn : C.accentHi} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Endpunkt als HTML-Punkt (im gestreckten SVG würde er zur Ellipse) */}
      <span aria-hidden="true" style={{ position: "absolute", left: `${(letzterX / W) * 100}%`,
        top: (letzterY / (H + 14)) * 104, width: 10, height: 10, boxSizing: "border-box",
        transform: "translate(-50%, -50%)", borderRadius: "50%", background: C.flaeche,
        border: `2px solid ${ueber ? C.warn : C.accentHi}` }} />
      </div>

      {/* Monatsnamen nur an den Enden — der Rest ist selbsterklärend */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12,
        fontSize: 11.5, color: C.dimmer, letterSpacing: ".04em" }}>
        <span>{verlauf[0].label}</span>
        <span>{verlauf[verlauf.length - 1].label}</span>
      </div>

      {ueber && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.line}`,
          fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
          Dein Konto liegt über der vereinbarten Grenze. Sprich mit der Planung über Freizeitausgleich.
        </div>)}
    </div>);
}
