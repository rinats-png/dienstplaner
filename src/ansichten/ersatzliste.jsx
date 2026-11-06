/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { besetzung, ersatzVorschlaege, rangGruende } from "../lib/fachlogik.js";
import { Zelle } from "../ui/leisten.jsx";
import { fKurz } from "../lib/datum.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Pill, Lab, Btn } from "../ui/bausteine.jsx";

/* ==========================================================================
   KRANKMELDUNG UND ERSATZSUCHE
   Das häufigste Ereignis im Schichtbetrieb — und der eigentliche Prüfstein.
   ========================================================================== */
export function Ersatzliste({ sitz, datum, dienstId, akt, onFertig }) {
  const m = sitz.mandant;
  const [alle, setAlle] = useState(false);
  const [alleGesperrt, setAlleGesperrt] = useState(false);
  const [begruendung, setBegruendung] = useState(null);
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const liste = useMemo(() => ersatzVorschlaege(m, datum, dienstId), [m, datum, dienstId]);
  const moeglich = liste.filter((x) => x.moeglich);
  const gesperrt = liste.filter((x) => !x.moeglich);
  const gezeigt = alle ? moeglich : moeglich.slice(0, 6);

  return (
    <div>
      <div className="karte" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center",
        gap: 14, flexWrap: "wrap" }}>
        <Zelle da={da} size={38} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{da.name} · {fKurz(datum)}</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{da.start}–{da.ende} · {da.ort}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 650, color: b.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {b.anzahl}<span style={{ fontSize: 13, color: C.dimmer, fontWeight: 500 }}>/{b.soll}</span></div>
          <div style={{ fontSize: 11.5, color: C.dimmer }}>{b.diff < 0 ? `${Math.abs(b.diff)} fehlen` : "gedeckt"}</div>
        </div>
      </div>
      {b.qual && b.qual.filter((q) => !q.ok).length > 0 && (
        <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
          {b.qual.filter((q) => !q.ok).map((q) => {
            const qn = m.qualifikationen.find((x) => x.id === q.qid);
            return <Pill key={q.qid} size="sm" tone="danger">fehlt: {qn ? qn.name : q.qid} ({q.ist}/{q.noetig})</Pill>; })}
        </div>)}

      <Lab style={{ marginBottom: 10 }}>Vorschläge · nach Eignung sortiert</Lab>
      {gezeigt.length === 0 && <div style={{ fontSize: 13.5, color: C.dimmer, padding: "10px 0" }}>
        Niemand verfügbar, der Ruhezeit und Einschränkungen einhält.</div>}
      {gezeigt.map((x, i) => (
        <div key={x.person.id} className="karte" style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px" }}>
          <span style={{ width: 26, height: 26, borderRadius: 9, background: i === 0 ? C.okLight : C.bg,
            color: i === 0 ? C.ok : C.dimmer, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11.5, fontWeight: 700, flexShrink: 0, ...NUM }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{x.person.vorname} {x.person.nachname}</div>
            <div style={{ fontSize: 12, color: C.dimmer, lineHeight: 1.4 }}>{x.gruende.slice(0, 3).join(" · ")}</div>
          </div>
          <Btn size="sm" kind={i === 0 ? "primary" : "plain"}
            onClick={() => akt.mitWarnung(m, { titel: "Ersatz einteilen",
              eintraege: [{ personId: x.person.id, datum, dienstId }], knopf: "Einteilen",
              ausfuehren: (best) => { akt.setzeEinsprung(x.person.id, datum, dienstId, best); if (onFertig) onFertig(); } })}>
            Einteilen</Btn>
          <button onClick={() => setBegruendung(begruendung === x.person.id ? null : x.person.id)}
            aria-label="Warum steht diese Person hier?"
            style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer",
              fontSize: 13, padding: "0 6px" }}>{begruendung === x.person.id ? "▴" : "warum?"}</button>
        </div>
        {begruendung === x.person.id && (
          <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.lineSoft}`, marginTop: 2 }}>
            <div style={{ fontSize: 11.5, color: C.dim, padding: "11px 0 8px", lineHeight: 1.5 }}>
              Diese Reihenfolge entsteht aus nachvollziehbaren Kriterien, nicht aus einem Modell.
              Jeder Punkt lässt sich einzeln prüfen.
            </div>
            {rangGruende(m, x, datum, dienstId).map((g, k) => (
              <div key={k} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "4px 0",
                fontSize: 12.5, lineHeight: 1.45 }}>
                <span style={{ flexShrink: 0, fontWeight: 700, width: 12, textAlign: "center",
                  color: g.art === "plus" ? C.ok : g.art === "minus" ? C.warn : C.dim }}>
                  {g.art === "plus" ? "+" : g.art === "minus" ? "−" : "·"}</span>
                <span style={{ color: g.art === "hinweis" ? C.dim : C.text }}>{g.text}</span>
              </div>))}
          </div>)}
        </div>))}
      {moeglich.length > 6 && (
        <Btn size="sm" kind="quiet" onClick={() => setAlle(!alle)} style={{ marginTop: 4 }}>
          {alle ? "Weniger zeigen" : `Alle ${moeglich.length} zeigen`}</Btn>)}

      {moeglich.length === 0 && (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: C.dangerLight }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Niemand ohne Befund einsetzbar</div>
          <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 14 }}>
            Regelkonform findet die Suche niemanden. Du kannst eskalieren — erweiterte Anfrage
            oder dokumentierte Unterschreitung — oder unten jemanden mit Abweichung einteilen.
          </div>
          <Btn kind="danger" onClick={() => akt.oeffneEskalation(datum, dienstId)}>Eskalation öffnen</Btn>
        </div>)}
      {moeglich.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Btn size="sm" kind="quiet" onClick={() => akt.oeffneEskalation(datum, dienstId)}>Stattdessen eskalieren</Btn>
        </div>)}

      {gesperrt.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 6 }}>Nur mit Abweichung · {gesperrt.length}</Lab>
          <div style={{ fontSize: 12, color: C.dimmer, marginBottom: 8, lineHeight: 1.45 }}>
            CENTRIC sperrt niemanden. Wer hier steht, verletzt eine Regel; vor dem Einteilen zeigt der Warndialog, welche.</div>
          {(alleGesperrt ? gesperrt : gesperrt.slice(0, 5)).map((x) => (
            <div key={x.person.id} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 12.5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.dim, minWidth: 150 }}>{x.person.nachname}, {x.person.vorname}</span>
              <span style={{ color: C.danger, flex: 1, minWidth: 160 }}>{x.hindernisse[0]}</span>
              <Btn size="sm" kind="quiet" onClick={() => akt.mitWarnung(m, { titel: "Ersatz einteilen",
                eintraege: [{ personId: x.person.id, datum, dienstId }], knopf: "Einteilen",
                alternative: (pid) => { akt.setzeEinsprung(pid, datum, dienstId); if (onFertig) onFertig(); },
                ausfuehren: (best) => { akt.setzeEinsprung(x.person.id, datum, dienstId, best); if (onFertig) onFertig(); } })}>
                Prüfen …</Btn>
            </div>))}
          {gesperrt.length > 5 && (
            <Btn size="sm" kind="quiet" onClick={() => setAlleGesperrt(!alleGesperrt)} style={{ marginTop: 6 }}>
              {alleGesperrt ? "Weniger zeigen" : `und ${gesperrt.length - 5} weitere zeigen`}</Btn>)}
        </div>)}
    </div>);
}
