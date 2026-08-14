/** Einheitlicher Leerzustand — mit Symbol, Erklärung und optionalem Weg. */
const Leer = ({ titel, text, symbol = "◌", aktion }) => (
  <div style={{ padding: "56px 28px", textAlign: "center" }}>
    <div style={{ width: 46, height: 46, borderRadius: 14, margin: "0 auto 16px", display: "flex",
      alignItems: "center", justifyContent: "center", background: C.bg, color: C.dim, fontSize: 20 }}>
      {symbol}</div>
    <div style={{ fontSize: 15.5, fontWeight: 620, marginBottom: 7 }}>{titel}</div>
    {text && <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, maxWidth: 380,
      margin: "0 auto" }}>{text}</div>}
    {aktion && <div style={{ marginTop: 20 }}>{aktion}</div>}
  </div>);

/** Ladezustand als Platzhalterstreifen — ruhiger als ein Kreisel. */
const Laden = ({ zeilen = 5, text }) => (
  <div style={{ padding: 20 }} aria-busy="true" aria-live="polite">
    {text && <div style={{ fontSize: 13, color: C.dim, marginBottom: 14 }}>{text}</div>}
    {Array.from({ length: zeilen }, (_, i) => (
      <div key={i} style={{ height: 14, borderRadius: 5, marginBottom: 10,
        width: `${100 - (i % 3) * 14}%`, background: C.bg,
        animation: "pulsieren 1.4s ease-in-out infinite", animationDelay: `${i * .08}s` }} />))}
  </div>);

/** Fehlerhinweis am Feld statt irgendwo im Formular. */
const Feldfehler = ({ text }) => text ? (
  <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 6,
    fontSize: 12.5, color: C.danger, lineHeight: 1.45 }}>
    <span aria-hidden="true" style={{ fontWeight: 700 }}>!</span><span>{text}</span>
  </div>) : null;

/* ==========================================================================
   UI-BAUSTEINE
   ========================================================================== */
const Card = ({ children, style, hover, glanz, className = "", ...p }) => (
  <div {...p} className={`karte ${hover ? "karte-hover" : ""} ${className}`}
    style={style}>{children}</div>);
const CardHead = ({ children, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    padding: "18px 24px", borderBottom: `1px solid ${C.lineSoft}` }}>
    <div style={{ fontSize: 15.5, fontWeight: 620, letterSpacing: "-.015em" }}>{children}</div>{right}
  </div>);
const Lab = ({ children, style }) => (<div style={{ fontSize: 12, fontWeight: 500, color: C.dim, ...style }}>{children}</div>);
const Rubrik = ({ children, style }) => (<div className="rubrik" style={style}>{children}</div>);
const Schalter = ({ an, onChange }) => (
  <button type="button" className={`schalter${an ? " on" : ""}`} onClick={onChange}
    style={{ background: an ? C.ok : C.lineStark }} aria-pressed={an}><i /></button>);
const Haken = ({ punkte }) => (
  <ul className="hakenliste">{punkte.map((p, i) => <li key={i}>{p}</li>)}</ul>);
const Fussleiste = ({ children }) => <div className="fussleiste noprint">{children}</div>;
/**
 * Filterleiste sitzt unmittelbar über der Tabelle, nicht in der Kopfzeile —
 * dort wird gesucht, und dort erwartet man die Bedienelemente.
 */
const Filterleiste = ({ suche, setSuche, platzhalter = "Suchen …", children, rechts }) => (
  <div className="filterleiste noprint">
    {setSuche && (
      <div className="suchfeld">
        <span className="lupe">⌕</span>
        <input className="inp" value={suche} placeholder={platzhalter}
          onChange={(e) => setSuche(e.target.value)} />
      </div>)}
    {children}
    {rechts && <div style={{ marginLeft: "auto", display: "flex", gap: 9, alignItems: "center",
      flexWrap: "wrap" }}>{rechts}</div>}
  </div>);
/** Verdichtete Planzelle: Dienst und Person in einem Block statt zwei Zeilen. */
const Planzelle = ({ da, unten, aktiv, ausfall, onClick, title }) => {
  if (!da) return (
    <div onClick={onClick} title={title} className="planzelle"
      style={{ background: C.bg, cursor: onClick ? "pointer" : "default", minHeight: 34 }} />);
  return (
    <div onClick={onClick} title={title || `${da.name}${unten ? ` · ${unten}` : ""}`} className="planzelle"
      style={{ background: `${da.farbe}1C`, color: da.farbe, cursor: onClick ? "pointer" : "default",
        minHeight: 34, outline: aktiv ? `2px solid ${C.accent}` : "none",
        textDecoration: ausfall ? "line-through" : "none", opacity: ausfall ? .5 : 1 }}>
      <div className="oben">{da.kurz}</div>
      {unten && <div className="unten">{unten}</div>}
    </div>);
};
const Btn = ({ children, kind = "plain", size, onClick, disabled, style, title, className = "" }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={title}
    className={`btn btn-${kind}${size === "sm" ? " btn-sm" : ""} ${className}`} style={style}>
    {children}</button>);

const Inp = (p) => <input {...p} className={`inp ${p.className || ""}`} />;
const Sel = ({ children, ...p }) => <select {...p} className={`sel ${p.className || ""}`}>{children}</select>;

const Field = ({ label, hint, children, style }) => (
  <label style={{ display: "block", ...style }}>
    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.dim,
      marginBottom: 6 }}>{label}</span>
    {children}
    {hint && <span style={{ display: "block", fontSize: 12, color: C.dim, marginTop: 5,
      lineHeight: 1.45 }}>{hint}</span>}
  </label>);

const Seg = ({ value, onChange, options }) => (
  <div className="seg" role="tablist">
    {options.map((o) => (
      <button key={o.id} role="tab" aria-selected={value === o.id}
        className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>))}
  </div>);

const H1 = ({ children, rubrik, sub, right, style }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    gap: 24, flexWrap: "wrap", marginBottom: 32, ...style }}>
    <div style={{ minWidth: 0, flex: 1 }}>
      {rubrik && <Rubrik style={{ marginBottom: 10 }}>{rubrik}</Rubrik>}
      <h1 className="titel">{children}</h1>
      {sub && <p className="untertitel">{sub}</p>}
    </div>
    {right && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      flexShrink: 0 }}>{right}</div>}
  </div>)

function Kpi({ label, value, unit, tone = "text", sub }) {
  const col = { ok: C.ok, warn: C.warn, danger: C.danger, accent: C.accent, text: C.text }[tone];
  return (<div style={{ padding: "22px 24px" }}>
    <Lab>{label}</Lab>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 9 }}>
      <span style={{ fontSize: 31, fontWeight: 650, letterSpacing: "-.035em", color: col, ...NUM }}>{value}</span>
      {unit && <span style={{ fontSize: 14, color: C.dimmer, fontWeight: 500 }}>{unit}</span>}
    </div>
    {sub && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
  </div>);
}
const KpiRow = ({ children, min = 190 }) => (
  <Card style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, overflow: "hidden" }}>{children}</Card>);

function Pill({ children, tone = "neutral", size }) {
  const t = { neutral: ["rgba(20,20,25,.06)", C.dim], ok: [C.okLight, C.ok],
    warn: ["rgba(179,91,0,.12)", C.warn], danger: ["rgba(211,36,56,.11)", C.danger],
    accent: ["rgba(43,52,64,.09)", C.accent], violet: ["rgba(76,70,104,.12)", C.violet] }[tone];
  return <span style={{ background: t[0], color: t[1], borderRadius: 20, padding: size === "sm" ? "2px 9px" : "4px 11px",
    fontSize: size === "sm" ? 11.5 : 12.5, fontWeight: 600, whiteSpace: "nowrap", ...NUM }}>{children}</span>;
}
function Zelle({ da, abw, size = 28, blass }) {
  if (abw) { const m = abwArt(abw.art);
    return <div title={m.label}  style={{ width: size, height: size, borderRadius: Math.round(size * .3),
      display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px dashed ${m.farbe}88`,
      color: m.farbe, fontSize: size < 24 ? 10 : 12, fontWeight: 700, ...NUM }}>{m.kurz}</div>; }
  if (!da) return <div style={{ width: size, height: size, borderRadius: Math.round(size * .3),
    background: "rgba(20,20,25,.045)", display: "flex", alignItems: "center", justifyContent: "center",
    color: C.dimmer, fontSize: 13 }}>·</div>;
  return <div title={`${da.name} ${da.start}–${da.ende}`} 
    style={{ width: size, height: size, borderRadius: Math.round(size * .3), display: "flex", alignItems: "center",
      justifyContent: "center", background: blass ? `${da.farbe}18` : `${da.farbe}22`, color: da.farbe,
      fontSize: size < 24 ? 10 : 12, fontWeight: 700, ...NUM }}>{da.kurz}</div>;
}
function Balken({ ist, soll, tone }) {
  const pct = Math.min(100, (ist / Math.max(1, soll)) * 100);
  const col = tone === "danger" ? C.danger : tone === "warn" ? C.warn : C.ok;
  return <div style={{ height: 5, background: "rgba(20,20,25,.08)", borderRadius: 3, overflow: "hidden" }}>
    <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width .4s cubic-bezier(.4,0,.2,1)" }} /></div>;
}
function Sheet({ open, onClose, titel, children, width = 700 }) {
  if (!open) return null;
  return (<div className="sheet-back" onClick={onClose}>
    <div className="blatt" onClick={(e) => e.stopPropagation()} style={{ maxWidth: width }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px",
        borderBottom: `1px solid ${C.lineSoft}` }}>
        <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-.02em" }}>{titel}</div>
        <Btn size="sm" kind="quiet" onClick={onClose}>Fertig</Btn>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div></div>);
}


/* ==========================================================================
   ANMELDUNG — bestimmt die Zugriffstiefe
   ========================================================================== */
function Anmeldung({ db, onLogin }) {
  const [mid, setMid] = useState(db.mandanten[0].id);
  const m = db.mandanten.find((x) => x.id === mid);
  const proRolle = ROLLEN.filter((r) => r.id !== "betreiber").map((r) => ({
    r, person: m.personen.find((p) => p.rolle === r.id && p.status === "aktiv") }));

  return (
    <div className="sw-root">
      <div style={{display:"none"}}><i /><i /><i /><i /></div>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "5vh 20px" }}>
        <div style={{ width: "100%", maxWidth: 860 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
              <Logo size={86} />
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-.03em", margin: 0 }}>CENTRIC</h1>
            <p style={{ fontSize: 16, color: C.dim, margin: "12px 0 0" }}>
              Dienstplanung für den durchgehenden Schichtbetrieb
            </p>
          </div>

          <Card hover style={{ padding: 26, marginBottom: 18, cursor: "pointer" }} onClick={() => onLogin({ rolle: "betreiber" })}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: C.accent, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>BE</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Als Betreiber anmelden</div>
                <div style={{ fontSize: 13.5, color: C.dim, marginTop: 3 }}>
                  Mandanten, Tarife, Zugangszahlen und Rechnungen. Ohne Einsicht in Namen oder Pläne.
                </div>
              </div>
              <span style={{ color: C.dimmer, fontSize: 22 }}>›</span>
            </div>
          </Card>

          <Card style={{ padding: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Als Beschäftigte anmelden</div>
              <Sel value={mid} onChange={(e) => setMid(e.target.value)} style={{ width: 280 }}>
                {db.mandanten.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Sel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
              {proRolle.map(({ r, person }) => person && (
                <div key={r.id} className="karte" onClick={() => onLogin({ rolle: "kunde", mandantId: m.id, personId: person.id })}
                  style={{ padding: 16, cursor: "pointer", transition: "transform .2s, box-shadow .2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 26px rgba(16,16,24,.12)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: `${r.farbe}1E`, color: r.farbe,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{r.kurz}</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                  </div>
                  <div style={{ fontSize: 13, color: C.text }}>{person.vorname} {person.nachname}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4, lineHeight: 1.4 }}>{r.text}</div>
                </div>))}
            </div>
          </Card>

          <div style={{ textAlign: "center", fontSize: 12.5, color: C.dimmer, marginTop: 22, lineHeight: 1.5 }}>
            Vorführfassung. Die Anmeldung ersetzt hier das Kennwortverfahren —
            die Zugriffstiefe ergibt sich in beiden Fällen aus Rolle und Geltungsbereich.
          </div>
        </div>
      </div>
    </div>);
}
