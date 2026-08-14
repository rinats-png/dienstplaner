
/* ==========================================================================
   DIAGRAMME
   Vollständig als SVG gezeichnet — keine Fremdbibliothek, keine Ladezeit,
   Farben aus dem Farbschema. Ein Diagramm kommt nur dort zum Einsatz, wo
   ein Verlauf oder ein Vergleich die Aussage trägt. Wo eine Zahl reicht,
   steht eine Zahl.
   ========================================================================== */

/** Verlauf einer Größe über die Zeit, mit Nulllinie. */
function LinienDiagramm({ daten, hoehe = 168, wert = "y", label = "label", nulllinie = true,
  farbe = C.accent, einheit = "", format }) {
  const id = useRef(`ld${Math.random().toString(36).slice(2, 7)}`).current;
  const [aktiv, setAktiv] = useState(null);
  if (!daten || daten.length < 2) return null;
  const W = 100, H = 100, pad = 4;
  const werte = daten.map((d) => d[wert]);
  let max = Math.max(...werte, 0), min = Math.min(...werte, 0);
  if (max === min) { max += 1; min -= 1; }
  const spanne = max - min;
  const x = (i) => pad + (i / (daten.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / spanne) * (H - pad * 2);
  const punkte = daten.map((d, i) => `${x(i)},${y(d[wert])}`).join(" ");
  const flaeche = `${x(0)},${y(min)} ${punkte} ${x(daten.length - 1)},${y(min)}`;
  const f = format || ((v) => `${n1(v)}${einheit}`);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: "100%", height: hoehe, display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={farbe} stopOpacity=".22" />
            <stop offset="100%" stopColor={farbe} stopOpacity="0" />
          </linearGradient>
        </defs>
        {nulllinie && min < 0 && max > 0 && (
          <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke={C.line} strokeWidth=".5"
            strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />)}
        <polygon points={flaeche} fill={`url(#${id})`} />
        <polyline points={punkte} fill="none" stroke={farbe} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {daten.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d[wert])} r={aktiv === i ? 4 : 2.4} fill="#fff"
            stroke={farbe} strokeWidth="2" vectorEffect="non-scaling-stroke"
            onMouseEnter={() => setAktiv(i)} onMouseLeave={() => setAktiv(null)}
            style={{ cursor: "pointer" }} />))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {daten.map((d, i) => (
          <span key={i} style={{ fontSize: 10.5, color: aktiv === i ? C.text : C.dimmer,
            fontWeight: aktiv === i ? 700 : 500, flex: 1, textAlign: "center", ...NUM }}>{d[label]}</span>))}
      </div>
      {aktiv !== null && (
        <div style={{ position: "absolute", top: -6, left: `${(aktiv / (daten.length - 1)) * 100}%`,
          transform: "translateX(-50%)", background: C.accentDeep, color: "#fff", padding: "5px 10px",
          borderRadius: 9, fontSize: 12, fontWeight: 650, whiteSpace: "nowrap", pointerEvents: "none", ...NUM }}>
          {f(daten[aktiv][wert])}
        </div>)}
    </div>);
}

/** Balken über die Zeit — etwa Besetzungsquote oder Ablaufwellen. */
function BalkenDiagramm({ daten, hoehe = 150, wert = "y", label = "label", einheit = "",
  ziel, farbeVon, klick }) {
  const [aktiv, setAktiv] = useState(null);
  if (!daten || !daten.length) return null;
  const max = Math.max(...daten.map((d) => d[wert]), ziel || 0, 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: hoehe, position: "relative" }}>
        {ziel !== undefined && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(ziel / max) * 100}%`,
            borderTop: `1.5px dashed ${C.dimmer}`, pointerEvents: "none" }}>
            <span style={{ position: "absolute", right: 0, top: -16, fontSize: 10.5, color: C.dimmer, ...NUM }}>
              Ziel {ziel}{einheit}</span>
          </div>)}
        {daten.map((d, i) => {
          const h = Math.max(2, (d[wert] / max) * 100);
          const farbe = farbeVon ? farbeVon(d) : C.accent;
          return (
            <div key={i} onMouseEnter={() => setAktiv(i)} onMouseLeave={() => setAktiv(null)}
              onClick={() => klick && klick(d)}
              style={{ flex: 1, height: `${h}%`, background: farbe, borderRadius: "5px 5px 2px 2px",
                opacity: aktiv === null || aktiv === i ? 1 : .45, transition: "opacity .15s",
                cursor: klick ? "pointer" : "default", position: "relative", minWidth: 4 }}>
              {aktiv === i && (
                <div style={{ position: "absolute", bottom: "calc(100% + 7px)", left: "50%",
                  transform: "translateX(-50%)", background: C.accentDeep, color: "#fff", padding: "5px 10px",
                  borderRadius: 9, fontSize: 12, fontWeight: 650, whiteSpace: "nowrap", zIndex: 5, ...NUM }}>
                  {d[label]} · {n1(d[wert])}{einheit}
                </div>)}
            </div>);
        })}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
        {daten.map((d, i) => (
          <span key={i} style={{ flex: 1, fontSize: 10, color: aktiv === i ? C.text : C.dimmer,
            fontWeight: aktiv === i ? 700 : 500, textAlign: "center", overflow: "hidden",
            whiteSpace: "nowrap", ...NUM }}>{d[label]}</span>))}
      </div>
    </div>);
}

/** Abweichung vom Mittelwert — beidseitige Balken um eine Mittelachse. */
function AbweichungsDiagramm({ zeilen, wert, name, hoehe = 20, einheit = "" }) {
  if (!zeilen || !zeilen.length) return null;
  const max = Math.max(...zeilen.map((z) => Math.abs(z[wert])), 0.5);
  return (
    <div>
      {zeilen.map((z, i) => {
        const v = z[wert], pos = v >= 0;
        const breite = (Math.abs(v) / max) * 50;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 5 }}>
            <span style={{ width: 148, fontSize: 12.5, color: C.dim, textAlign: "right",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(z)}</span>
            <div style={{ flex: 1, position: "relative", height: hoehe }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
                background: C.line }} />
              <div style={{ position: "absolute", top: 3, bottom: 3, borderRadius: 4,
                left: pos ? "50%" : `${50 - breite}%`, width: `${breite}%`,
                background: Math.abs(v) < 1 ? C.dimmer : pos ? C.warn : C.ok, opacity: .85 }} />
            </div>
            <span style={{ width: 52, fontSize: 12, fontWeight: 600, ...NUM,
              color: Math.abs(v) < 1 ? C.dimmer : pos ? C.warn : C.ok }}>
              {v >= 0 ? "+" : "−"}{n1(Math.abs(v))}{einheit}</span>
          </div>);
      })}
      <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 12, color: C.dimmer }}>
        <span style={{ width: 148 }} />
        <span style={{ flex: 1, textAlign: "center" }}>Mittel der Belegschaft</span>
        <span style={{ width: 52 }} />
      </div>
    </div>);
}

/** Waagerechter Anteilsbalken — für Auslastung und Quoten. */
function AnteilBalken({ wert, max = 100, farbe, hoehe = 7, breite }) {
  const p = Math.max(0, Math.min(100, (wert / max) * 100));
  return (
    <div style={{ width: breite || "100%", height: hoehe, borderRadius: hoehe / 2,
      background: C.line, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: farbe || C.accent,
        borderRadius: hoehe / 2, transition: "width .3s" }} />
    </div>);
}

/** Gestapelte Anteile in einem Balken — etwa Dienstarten eines Tages. */
function StapelBalken({ teile, hoehe = 9 }) {
  const summe = teile.reduce((a, t) => a + t.wert, 0) || 1;
  return (
    <div style={{ display: "flex", height: hoehe, borderRadius: hoehe / 2, overflow: "hidden",
      background: C.lineSoft }}>
      {teile.map((t, i) => (
        <div key={i} title={`${t.name}: ${t.wert}`}
          style={{ width: `${(t.wert / summe) * 100}%`, background: t.farbe }} />))}
    </div>);
}
