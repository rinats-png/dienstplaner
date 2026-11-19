/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { Sheet } from "../ui/leisten.jsx";
import { C } from "../farben.js";
import { Schalter, Btn } from "../ui/bausteine.jsx";
import { DOW } from "../lib/datum.js";
import { FENSTER } from "../lib/fachlogik.js";
import { Icon } from "../gestalt/icons.jsx";
import { NUM } from "../ui/thema.js";

/* ============================== VERFÜGBARKEIT =========================== */
export function Verfuegbarkeit({ sitz, akt, personId, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === (personId || sitz.person.id));
  const [v, setV] = useState(() => p.verfuegbarkeit && p.verfuegbarkeit.raster
    ? { ...p.verfuegbarkeit, raster: [...p.verfuegbarkeit.raster] }
    : { aktiv: false, raster: Array(21).fill(true) });
  if (!p) return null;
  const um = (i) => setV({ ...v, raster: v.raster.map((x, k) => (k === i ? !x : x)) });
  const zeile = (f) => setV({ ...v, raster: v.raster.map((x, k) => (k % 3 === f ? !v.raster.slice(0, 21).filter((_, j) => j % 3 === f).every(Boolean) : x)) });
  const frei = v.raster.filter(Boolean).length;

  return (
    <Sheet open onClose={onClose} titel={`Verfügbarkeit · ${p.vorname} ${p.nachname}`} width={620}>
      <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 20 }}>
        Tippe die Felder an, in denen du arbeiten kannst. Die Angabe gilt <b>wöchentlich wiederkehrend</b>.
        Für gesperrte Zeiten wirst du weder eingeplant noch angefragt.
      </div>

      <label className="karte" style={{ display: "flex", alignItems: "center", gap: 13, padding: 16,
        marginBottom: 20, cursor: "pointer" }}>
        <Schalter an={v.aktiv} onChange={() => setV({ ...v, aktiv: !v.aktiv })} />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Verfügbarkeit einschränken</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3 }}>
            Ausgeschaltet bedeutet: jederzeit einsetzbar.</div>
        </div>
      </label>

      <div style={{ opacity: v.aktiv ? 1 : .42, pointerEvents: v.aktiv ? "auto" : "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: "104px repeat(7,1fr)", gap: 7, marginBottom: 8 }}>
          <div />
          {DOW.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600,
              color: i >= 5 ? C.dim : C.text }}>{d}</div>))}
        </div>
        {FENSTER.map((f) => (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "104px repeat(7,1fr)", gap: 7, marginBottom: 7 }}>
            <button onClick={() => zeile(f.id)} className="btn btn-sm btn-quiet"
              style={{ justifyContent: "flex-start", textAlign: "left" }}>{f.name}</button>
            {DOW.map((_, d) => {
              const i = d * 3 + f.id, an = v.raster[i];
              return (
                <button key={d} onClick={() => um(i)} aria-label={`${DOW[d]}, ${f.name}`} aria-pressed={!!an}
                  style={{ height: 46, borderRadius: 12, border: "none", cursor: "pointer",
                    background: an ? C.okLight : C.bg,
                    color: C.ok, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {an && <Icon n="haken" size={20} strokeWidth={2.4} />}</button>);
            })}
          </div>))}
        <div style={{ display: "flex", gap: 18, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
            <span style={{ width: 15, height: 15, borderRadius: 5, background: C.okLight }} />verfügbar</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
            <span style={{ width: 15, height: 15, borderRadius: 5, background: C.bg }} />gesperrt</span>
          <span style={{ fontSize: 13, color: C.dimmer, marginLeft: "auto", ...NUM }}>
            {frei} von 21 Zeitfenstern frei</span>
        </div>
        {v.aktiv && frei < 8 && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: C.warnLight,
            color: C.warn, fontSize: 13, lineHeight: 1.5 }}>
            Bei {frei} freigegebenen Fenstern bist du kaum noch einplanbar. Bitte sprich das mit der Planung ab.
          </div>)}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
        <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" onClick={() => { akt.setzeVerfuegbarkeit(p.id, v); onClose(); }}>Speichern</Btn>
      </div>
    </Sheet>);
}
