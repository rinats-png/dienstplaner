
/* ==========================================================================
   ZIEHEN UND ABLEGEN
   Bewusst mit Zeigerereignissen statt der HTML5-Schnittstelle: die funktioniert
   auf Telefonen und Tablets nicht. Diese Umsetzung trägt auf Maus, Stift und
   Finger gleichermaßen.

   Aufbau: Ein Anbieter hält den Zustand, `Ziehbar` startet den Vorgang,
   `Ablage` nimmt entgegen. Jede Ablage nennt selbst, was sie annimmt.
   ========================================================================== */
const ZiehKontext = createContext(null);

function ZiehAnbieter({ children }) {
  const [last, setLast] = useState(null);        // { art, nutzlast, beschriftung }
  const [zeiger, setZeiger] = useState({ x: 0, y: 0 });
  const [ueber, setUeber] = useState(null);      // Kennung der Ablage darunter
  const ablagen = useRef(new Map());

  const anmelden = useCallback((id, daten) => {
    ablagen.current.set(id, daten);
    return () => ablagen.current.delete(id);
  }, []);

  const beginnen = useCallback((nutzlast, x, y) => {
    setLast({ ...nutzlast, start: { x, y } }); setZeiger({ x, y }); setUeber(null);
  }, []);

  useEffect(() => {
    if (!last) return;
    const bewegen = (e) => {
      const p = e.touches ? e.touches[0] : e;
      setZeiger({ x: p.clientX, y: p.clientY });
      let treffer = null;
      for (const [id, d] of ablagen.current) {
        if (!d.el || !d.el.getBoundingClientRect) continue;
        const r = d.el.getBoundingClientRect();
        if (p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom) {
          if (!d.nimmt || d.nimmt(last)) treffer = id;
        }
      }
      setUeber(treffer);
      if (e.cancelable) e.preventDefault();
    };
    const loslassen = () => {
      if (ueber != null) {
        const d = ablagen.current.get(ueber);
        if (d && d.ablegen) d.ablegen(last);
      }
      setLast(null); setUeber(null);
    };
    window.addEventListener("pointermove", bewegen, { passive: false });
    window.addEventListener("pointerup", loslassen);
    window.addEventListener("pointercancel", loslassen);
    return () => {
      window.removeEventListener("pointermove", bewegen);
      window.removeEventListener("pointerup", loslassen);
      window.removeEventListener("pointercancel", loslassen);
    };
  }, [last, ueber]);

  return (
    <ZiehKontext.Provider value={{ last, ueber, beginnen, anmelden }}>
      {children}
      {/* Führungslinie vom Ursprung zum Zeiger — zeigt den Weg des Elements */}
      {last && last.start && (
        <svg style={{ position: "fixed", inset: 0, zIndex: 998, pointerEvents: "none" }}>
          <line x1={last.start.x} y1={last.start.y} x2={zeiger.x} y2={zeiger.y}
            stroke={C.accent} strokeWidth="1.5" strokeDasharray="5 4" opacity=".55" />
          <circle cx={last.start.x} cy={last.start.y} r="4" fill="none"
            stroke={C.accent} strokeWidth="1.5" opacity=".55" />
        </svg>)}

      {/* Der Begleiter am Zeiger — zeigt, was gerade getragen wird */}
      {last && (
        <div style={{ position: "fixed", left: zeiger.x, top: zeiger.y, zIndex: 999,
          transform: "translate(-50%,-140%)", pointerEvents: "none",
          background: last.farbe ? `${last.farbe}` : C.accentDeep, color: "#fff",
          padding: "8px 14px", borderRadius: 12, fontSize: 13.5, fontWeight: 600,
          boxShadow: "0 10px 26px rgba(17,24,39,.28)", whiteSpace: "nowrap" }}>
          {last.beschriftung}
          {last.zeit && <span style={{ opacity: .75, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>
            {last.zeit}</span>}
        </div>)}
    </ZiehKontext.Provider>);
}

/** Startet einen Ziehvorgang. Ein kurzer Tipp bleibt ein Klick. */
function Ziehbar({ nutzlast, onClick, children, style, className, aktiv = true }) {
  const ctx = useContext(ZiehKontext);
  const start = useRef(null);
  const [greift, setGreift] = useState(false);

  const runter = (e) => {
    if (!aktiv || !ctx) return;
    const p = e.touches ? e.touches[0] : e;
    start.current = { x: p.clientX, y: p.clientY, zeit: Date.now(), gezogen: false };
  };
  const bewegen = (e) => {
    if (!start.current || start.current.gezogen) return;
    const p = e.touches ? e.touches[0] : e;
    const weg = Math.hypot(p.clientX - start.current.x, p.clientY - start.current.y);
    if (weg > 9) {                       // erst ab neun Pixeln ist es ein Ziehen
      start.current.gezogen = true;
      setGreift(true);
      ctx.beginnen(nutzlast, p.clientX, p.clientY);
    }
  };
  const hoch = () => {
    const s = start.current;
    start.current = null; setGreift(false);
    if (s && !s.gezogen && onClick) onClick();
  };

  return (
    <div className={className} onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch}
      onPointerCancel={() => { start.current = null; setGreift(false); }}
      style={{ touchAction: "none", cursor: aktiv ? "grab" : (onClick ? "pointer" : "default"),
        opacity: greift ? .38 : 1, transition: "opacity .15s", userSelect: "none", ...style }}>
      {children}
    </div>);
}

/** Nimmt Gezogenes entgegen. `nimmt` entscheidet, ob diese Ablage passt. */
function Ablage({ id, nimmt, ablegen, children, style, className, aktivStil }) {
  const ctx = useContext(ZiehKontext);
  const el = useRef(null);
  useEffect(() => {
    if (!ctx || !el.current) return;
    return ctx.anmelden(id, { el: el.current, nimmt, ablegen });
  }, [ctx, id, nimmt, ablegen]);
  const drueber = ctx && ctx.ueber === id;
  const moeglich = ctx && ctx.last && (!nimmt || nimmt(ctx.last));
  return (
    <div ref={el} className={className}
      style={{ transition: "outline-color .15s, background .15s",
        outline: drueber ? `2px solid ${C.ok}` : moeglich ? `1.5px dashed ${C.dim}` : "2px solid transparent",
        outlineOffset: 2,
        background: drueber ? C.okLight : undefined,
        ...style, ...(drueber && aktivStil ? aktivStil : {}) }}>
      {children}
    </div>);
}

/** Hinweisleiste, die während eines Ziehvorgangs erklärt, was möglich ist. */
function ZiehHinweis({ text }) {
  const ctx = useContext(ZiehKontext);
  if (!ctx || !ctx.last) return null;
  return (
    <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 998,
      background: C.text, color: "#fff", padding: "11px 20px", borderRadius: 999,
      fontSize: 13.5, boxShadow: "0 12px 34px rgba(24,26,30,.30)", pointerEvents: "none" }}>
      {text || "Auf ein Ziel ziehen und loslassen"}
    </div>);
}
