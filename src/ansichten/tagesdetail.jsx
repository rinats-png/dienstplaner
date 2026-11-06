/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { besetzung, aktive, darfEinheit, personTag, notizenZu, abwesenheitAm, abwArt } from "../lib/fachlogik.js";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { einheitAm, nachtAnteil } from "../../server/lib/fachpruefung.mjs";
import { Sheet } from "../ui/leisten.jsx";
import { fLang, fDatum } from "../lib/datum.js";
import { C } from "../farben.js";
import { Ablage, Ziehbar } from "../ui/ziehen.jsx";
import { NUM } from "../ui/thema.js";
import { n1 } from "../lib/format.js";
import { dauer } from "../regelwerk.js";
import { Pill, Btn, Lab } from "../ui/bausteine.jsx";
import { darf } from "../lib/berechtigung.js";
import { Ersatzliste } from "./ersatzliste.jsx";


/* ============================== TAGESDETAIL ============================== */
export function Tagesdetail({ sitz, datum, onClose, akt }) {
  const m = sitz.mandant;
  const [tab, setTab] = useState(m.dienstarten[0].id);
  const [ersatz, setErsatz] = useState(false);
  const bes = useMemo(() => besetzung(m, datum), [m, datum]);
  const fei = feiertag(datum, m.bundesland);
  const aktiv = bes[tab] ? tab : m.dienstarten[0].id;
  const e = bes[aktiv];
  const frei = useMemo(() => aktive(m, datum).filter((p) => {
    if (!darfEinheit(sitz, einheitAm(p, datum))) return false;
    const t = personTag(m, p, datum); return !t.dienstId && !t.abwesenheit; }), [m, datum, sitz]);

  return (
    <Sheet open onClose={onClose} titel={fLang(datum)} width={840}>
      {fei && <div style={{ padding: "11px 15px", marginBottom: 20, borderRadius: 12, background: "rgba(179,38,30,.085)",
        color: C.danger, fontSize: 13.5, fontWeight: 500 }}>Gesetzlicher Feiertag: {fei}</div>}
      <div className="reiterreihe">
        {m.dienstarten.map((d) => { const b = bes[d.id], on = aktiv === d.id;
          return (
            <Ablage key={d.id} id={`dienst:${d.id}`}
              nimmt={(l) => l.art === "person" && l.dienstId !== d.id}
              ablegen={(l) => akt.setzeAbweichung(l.personId, datum, d.id)}
              style={{ borderRadius: 999 }}>
              <button onClick={() => setTab(d.id)} className="btn"
                style={{ background: on ? `${d.farbe}1E` : C.bg, color: on ? d.farbe : C.dim,
                  fontWeight: on ? 650 : 500, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{d.kurz}</span><span style={NUM}>{b.anzahl}/{b.soll}</span>
                {b.diff < 0 && <span style={{ color: C.danger, fontWeight: 700 }}>−{Math.abs(b.diff)}</span>}
                {b.qualFehlt && <span style={{ color: C.warn }}>!</span>}</button>
            </Ablage>); })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16,
        borderBottom: `1px solid ${C.lineSoft}`, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 620 }}>{e.da.name}</div>
          <div style={{ fontSize: 13, color: C.dimmer, marginTop: 4, ...NUM }}>
            {e.da.start}–{e.da.ende} · {n1(dauer(e.da))} h{e.da.pause ? ` (${e.da.pause} min Pause)` : ""} · {n1(nachtAnteil(e.da, m.einstellungen))} h Nachtanteil · {e.da.ort}</div>
          {e.qual.length > 0 && <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
            {e.qual.map((q) => { const qn = m.qualifikationen.find((x) => x.id === q.qid);
              return <Pill key={q.qid} size="sm" tone={q.ok ? "ok" : "danger"}>{qn ? qn.kurz : q.qid} {q.ist}/{q.noetig}</Pill>; })}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 650, color: e.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {e.anzahl}<span style={{ fontSize: 15, color: C.dimmer, fontWeight: 500 }}>/{e.soll}</span></div>
          <div style={{ fontSize: 12, color: C.dimmer }}>{e.diff < 0 ? `${Math.abs(e.diff)} fehlen` : `${e.diff} über Soll`}</div>
        </div>
      </div>

      {/* Tagesnotizen sind Planungswissen — „sichtbar für alle mit Planungsrecht“. */}
      {darf(sitz, "plan.edit.unit") && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn size="sm" kind="quiet" onClick={() => akt.oeffneNotizen(`tag|${datum}`, `Notizen zum ${fDatum(datum)}`)}>
            Notizen{notizenZu(m, `tag|${datum}`).length ? ` (${notizenZu(m, `tag|${datum}`).length})` : ""}</Btn>
        </div>)}

      {(e.diff < 0 || e.qualFehlt) && darfEinheit(sitz, sitz.person.bereich) && (
        <div style={{ marginBottom: 20 }}>
          <Btn kind="primary" onClick={() => setErsatz(!ersatz)}>
            {ersatz ? "Ersatzvorschläge ausblenden" : "Ersatz vorschlagen lassen"}</Btn>
          {ersatz && <div style={{ marginTop: 16 }}>
            <Ersatzliste sitz={sitz} datum={datum} dienstId={aktiv} akt={akt} /></div>}
        </div>)}

      <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12, lineHeight: 1.5 }}>
        Personen lassen sich zwischen den Spalten und auf die Reiter oben ziehen — oder wie bisher antippen.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        {[["Eingeteilt", e.personen, true], ["Verfügbar", frei, false]].map(([titel, liste, drin]) => (
          <Ablage key={titel} id={`spalte:${drin ? "drin" : "frei"}`}
            nimmt={(l) => l.art === "person" && (drin ? l.dienstId !== aktiv : !!l.dienstId)}
            ablegen={(l) => akt.setzeAbweichung(l.personId, datum, drin ? aktiv : "-")}
            style={{ borderRadius: 16, padding: 4 }}>
            <Lab style={{ marginBottom: 11 }}>{titel} · {liste.length}</Lab>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {liste.length === 0 && <div style={{ fontSize: 13, color: C.dimmer, padding: "8px 0" }}>
                {drin ? "Niemand eingeteilt." : "Keine freien Kräfte im Zuständigkeitsbereich."}</div>}
              {liste.map((p) => { const eid = einheitAm(p, datum);
                const eh = m.einheiten.find((x) => x.id === eid); const t = personTag(m, p, datum);
                return (<Ziehbar key={p.id} className="karte"
                  aktiv={darfEinheit(sitz, eid)}
                  nutzlast={{ art: "person", personId: p.id, dienstId: t.dienstId,
                    beschriftung: `${p.vorname} ${p.nachname}`, farbe: eh ? eh.farbe : C.accentDeep,
                    zeit: e.da ? `${e.da.start}–${e.da.ende}` : null }}
                  style={{ display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 9, padding: "10px 12px", marginBottom: 7 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.vorname} {p.nachname}</div>
                    <div style={{ fontSize: 11.5, color: C.dimmer }}>
                      <span style={{ color: eh ? eh.farbe : C.dimmer }}>{eh ? eh.name : "—"}</span>
                      {drin && t.quelle === "abweichung" && " · abweichend"}
                      {p.qualifikationen.length > 0 && ` · ${p.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).filter(Boolean).join(" ")}`}</div>
                  </div>
                  {darfEinheit(sitz, eid) && <Btn size="sm" kind={drin ? "danger" : "primary"}
                    onClick={() => akt.setzeAbweichung(p.id, datum, drin ? "-" : aktiv)}>{drin ? "Raus" : `+ ${e.da.kurz}`}</Btn>}
                </Ziehbar>); })}
            </div>
          </Ablage>))}
      </div>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 11 }}>Abwesend</Lab>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {aktive(m, datum).filter((p) => abwesenheitAm(m, p.id, datum)).map((p) => (
            <Pill key={p.id} size="sm">{p.nachname} · {abwArt(abwesenheitAm(m, p.id, datum).art).label}</Pill>))}
          {aktive(m, datum).filter((p) => abwesenheitAm(m, p.id, datum)).length === 0 &&
            <span style={{ fontSize: 13, color: C.dimmer }}>Niemand abwesend.</span>}
        </div>
      </div>
    </Sheet>);
}
