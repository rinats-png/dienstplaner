/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect, useMemo, useRef } from "react";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { heute } from "../lib/datum.js";
import { Icon } from "../gestalt/icons.jsx";
import { kommandoSuche } from "../lib/fachlogik.js";
import { FONT } from "../ui/schriftart.js";


/* ==========================================================================
   KOMMANDOLEISTE
   Bei vielen Ansichten ist Tippen schneller als Klicken.
   ========================================================================== */
export function Kommandoleiste({ sitz, nav, akt, offen, onClose, gehZu, oeffneTag, oeffnePerson }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const feld = useRef(null);
  const treffer = useMemo(() => kommandoSuche(sitz, nav, q), [sitz.mandant, q, nav]);

  useEffect(() => { if (offen && feld.current) { feld.current.focus(); setQ(""); setI(0); } }, [offen]);
  useEffect(() => { setI(0); }, [q]);

  const waehlen = (t) => {
    if (!t) return;
    onClose();
    if (t.art === "ansicht") gehZu(t.id);
    else if (t.art === "person") oeffnePerson(t.id);
    else if (t.art === "datum") oeffneTag(t.id);
    else if (t.art === "aktion") {
      if (t.id === "krank") akt.oeffneKrankmeldung(null);
      else if (t.id === "verfuegbarkeit") akt.oeffneVerfuegbarkeit(sitz.person.id);
      else if (t.id === "assistent") akt.oeffneAssistent();
      else if (t.id === "wizard") akt.oeffneWizard();
      else if (t.id === "aushang") akt.aushangPDF(heute().slice(0, 7),
        sitz.person.bereich !== "ALLE" ? sitz.person.bereich : (sitz.mandant.einheiten.find((x) => !x.pool) || {}).id);
      else if (t.id === "feldmodus") akt.setzeKontrastmodus(!sitz.person.kontrastmodus);
    }
    /* Ein verstandener Satz: Ansicht öffnen und mitgeben, was schon bekannt
       ist. Ausgeführt wird nichts — die Entscheidung bleibt beim Menschen. */
    else if (t.art === "satz") {
      const v = t.satz;
      const p = v.personen[0];
      if (v.befehl.id === "krank" && p) akt.oeffneKrankmeldung(p.id,
        v.zeitraum ? v.zeitraum.von : v.datum || heute(),
        v.zeitraum ? v.zeitraum.bis : v.datum || heute());
      else if (v.befehl.id === "person" && p) oeffnePerson(p.id);
      else if (v.befehl.id === "urlaub" && p) akt.oeffneAbwesenheit(p.id, "urlaub",
        v.zeitraum ? v.zeitraum.von : v.datum, v.zeitraum ? v.zeitraum.bis : v.datum);
      else if ((v.befehl.id === "lage" || v.befehl.id === "wer") && v.datum) oeffneTag(v.datum);
      else gehZu(v.befehl.ziel);
    }
    else if (t.art === "unklar") { /* nichts tun — die Zeile bleibt offen */ }
  };

  if (!offen) return null;
  const SYM = { ansicht: "pfeil-rechts", person: "person", datum: "kalender", aktion: "stift", satz: "pfeil-rechts", unklar: "info" };
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Schnellsuche" style={{ position: "fixed", inset: 0, zIndex: 95, padding: "12vh 20px 20px",
      background: "var(--c-ueberlagerung)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="blatt"
        style={{ maxWidth: 620, margin: "0 auto", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex",
          alignItems: "center", gap: 13 }}>
          <span aria-hidden="true" style={{ color: C.dimmer, display: "flex" }}><Icon n="suche" size={18} /></span>
          {/* Die Trefferliste wird mit Pfeiltasten bedient, nicht mit der
              Tabulatortaste. Für eine Vorlesesoftware ist das nur dann
              nachvollziehbar, wenn Feld und Liste als zusammengehörig
              ausgezeichnet sind: Das Feld nennt die Liste, die Liste nennt
              die gerade hervorgehobene Zeile. */}
          <input ref={feld} value={q} onChange={(e) => setQ(e.target.value)}
            role="combobox" aria-expanded={treffer.length > 0} aria-controls="suchtreffer"
            aria-autocomplete="list" aria-label="Ansicht, Person, Datum oder Aktion suchen"
            aria-activedescendant={treffer.length ? `suchtreffer-${i}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(treffer.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); waehlen(treffer[i]); }
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Ansicht, Person, Datum oder Aktion …"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent",
              fontFamily: FONT, fontSize: 17, color: C.text }} />
          <kbd style={{ fontSize: 11, color: C.dimmer, background: C.lineSoft,
            padding: "3px 7px", borderRadius: 6, ...NUM }}>Esc</kbd>
        </div>
        <div id="suchtreffer" role="listbox" aria-label="Treffer"
          style={{ maxHeight: "52vh", overflowY: "auto" }}>
          {treffer.length === 0
            ? <div style={{ padding: 30, textAlign: "center", color: C.dimmer, fontSize: 14 }}>
                Nichts gefunden. Suche nach einer Ansicht, einem Nachnamen oder einem Datum wie 16.9.
              </div>
            : treffer.map((t, k) => (
              <div key={k} id={`suchtreffer-${k}`} role="option" aria-selected={i === k}
                onMouseEnter={() => setI(k)} onClick={() => waehlen(t)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", cursor: "pointer",
                  background: i === k ? "rgba(43,44,37,.07)" : "transparent" }}>
                <span style={{ width: 27, height: 27, borderRadius: 9, flexShrink: 0, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.bg, color: C.dim }}><Icon n={SYM[t.art] || "info"} size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: i === k ? 620 : 500 }}>{t.titel}</div>
                  <div style={{ fontSize: 12, color: C.dimmer }}>{t.unter}</div>
                </div>
                {i === k && <kbd style={{ fontSize: 11, color: C.dimmer, ...NUM }}>↵</kbd>}
              </div>))}
        </div>
        <div style={{ padding: "11px 22px", borderTop: `1px solid ${C.lineSoft}`, fontSize: 11.5,
          color: C.dimmer, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <span>↑↓ wählen</span><span>↵ öffnen</span><span>Strg + K jederzeit</span>
        </div>
      </div>
    </div>);
}
