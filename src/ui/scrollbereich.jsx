/* WP-21: Bereich mit eigenem Querscroll, der per Tastatur und Vorlesesoftware bedienbar ist.
   Passt der Inhalt, bleibt der Bereich unauffaellig (kein Tabstopp, keine Rolle, kein Hinweis). Ragt er ueber, bekommt er
   Fokus (Pfeiltasten scrollen), einen Namen und einen sichtbaren Hinweis. Stilregeln: geraeteStil() in geraete.js. */
import { useEffect, useRef, useState } from "react";
import { scrollHinweisNoetig } from "./geraete.js";

export function Scrollbereich({ label, children, style, hinweis = true }) {
  const ref = useRef(null);
  const [ragt, setRagt] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const messen = () => setRagt(scrollHinweisNoetig(el.scrollWidth, el.clientWidth));
    messen();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(messen) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    window.addEventListener("resize", messen);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", messen); };
  }, []);
  return (<>
    <div ref={ref} className="scrollbereich" style={style}
      {...(ragt ? { tabIndex: 0, role: "region", "aria-label": label } : {})}>{children}</div>
    {ragt && hinweis && <div className="scrollhinweis">Tabelle seitlich wischen oder mit den Pfeiltasten scrollen, um alle Spalten zu sehen.</div>}
  </>);
}
