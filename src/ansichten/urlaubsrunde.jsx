/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo, useState } from "react";
import { urlaubskonflikte, urlaubsRang } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { Card, Leer, Btn, Pill, CardHead, Lab, Field, Inp, Sel } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { fDatum } from "../lib/datum.js";
import { NUM, lesbar } from "../ui/thema.js";
import { Icon } from "../gestalt/icons.jsx";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";

export function Urlaubsrunde({ sitz, akt }) {
  const m = sitz.mandant;
  const r = m.urlaubsrunde;
  const jahr = new Date().getFullYear() + 1;
  const konflikte = useMemo(() => urlaubskonflikte(m), [m]);
  const darfLeiten = darf(sitz, "req.approve.all") || darf(sitz, "org.edit");
  const [w, setW] = useState({ von: `${jahr}-07-01`, bis: `${jahr}-07-14`, prio: 1 });

  if (!r) return (
    <Card>
      <Leer titel="Keine Runde eröffnet"
        text="Die Jahresurlaubsrunde sammelt die Wünsche für das Folgejahr, macht Überschneidungen sichtbar und entscheidet nach Vorrangregel." />
      {darfLeiten && <div style={{ padding: "0 24px 28px", textAlign: "center" }}>
        <Btn kind="primary" onClick={() => akt.eroeffneRunde(jahr)}>Runde für {jahr} eröffnen</Btn></div>}
    </Card>);

  const meine = r.wuensche.filter((x) => x.personId === sitz.person.id);
  const sortiert = [...r.wuensche].sort((a, b) => {
    const ra = urlaubsRang(m, a), rb = urlaubsRang(m, b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
    return 0;
  });

  return (
    <div>
      <Card style={{ marginBottom: 20, padding: "16px 22px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Pill tone={r.phase === "offen" ? "accent" : r.phase === "entschieden" ? "ok" : "neutral"}>
          {r.phase === "offen" ? "Wunschphase läuft" : r.phase === "entschieden" ? "entschieden" : "geschlossen"}</Pill>
        <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: C.dim }}>
          Urlaubsjahr {r.jahr} · Frist {fDatum(r.frist)} · {r.wuensche.length} Wünsche · {konflikte.length} Überschneidungstage
        </div>
        {darfLeiten && r.phase === "offen" && <Btn onClick={() => akt.schliesseRunde()}>Wunschphase schließen</Btn>}
        {darfLeiten && r.phase !== "offen" && <Btn kind="quiet" onClick={() => akt.oeffneRunde()}>Wieder öffnen</Btn>}
      </Card>

      {r.phase === "offen" && darf(sitz, "req.create") && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead right={<Lab>{meine.length} eigene Wünsche</Lab>}>Wunsch eintragen</CardHead>
          <div style={{ padding: 22, display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 12, alignItems: "end" }}>
            <Field label="Von"><Inp type="date" value={w.von} onChange={(e) => setW({ ...w, von: e.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={w.bis} onChange={(e) => setW({ ...w, bis: e.target.value })} /></Field>
            <Field label="Priorität" hint="1 ist der wichtigste Wunsch.">
              <Sel value={w.prio} onChange={(e) => setW({ ...w, prio: Number(e.target.value) })} style={{ width: 96 }}>
                {[1, 2, 3].map((x) => <option key={x} value={x}>{x}</option>)}</Sel></Field>
            <Btn kind="primary" onClick={() => akt.wunschEintragen(w)}>Eintragen</Btn>
          </div>
          {meine.length > 0 && <div style={{ padding: "0 22px 20px" }}>
            {meine.map((x) => (
              <div key={x.id} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "10px 13px", marginBottom: 7 }}>
                <Pill size="sm" tone={x.status === "genehmigt" ? "ok" : x.status === "abgelehnt" ? "danger" : "warn"}>
                  Priorität {x.prio}</Pill>
                <span style={{ fontSize: 13.5, flex: 1, ...NUM }}>{fDatum(x.von)} bis {fDatum(x.bis)}</span>
                <span style={{ fontSize: 12.5, color: C.dimmer }}>{x.status}</span>
                {x.status === "offen" && <Btn size="sm" kind="quiet" onClick={() => akt.wunschLoeschen(x.id)} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>}
              </div>))}
          </div>}
        </Card>)}

      {konflikte.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead right={<Pill tone="warn">{konflikte.length} Tage</Pill>}>Überschneidungen</CardHead>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {konflikte.slice(0, 30).map((k, i) => {
              const e = m.einheiten.find((x) => x.id === k.einheitId);
              return (<div key={i} style={{ display: "flex", gap: 14, padding: "10px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 13, color: C.dim, minWidth: 90, ...NUM }}>{fDatum(k.datum)}</span>
                <span style={{ fontSize: 13, color: e ? lesbar(e.farbe) : C.dim, minWidth: 130 }}>{e ? e.name : k.einheitId}</span>
                <span style={{ fontSize: 13, color: C.danger, ...NUM }}>{k.anzahl} Wünsche bei {k.grenze} Plätzen</span>
                <span style={{ fontSize: 12.5, color: C.dimmer, flex: 1 }}>
                  {k.wuensche.map((x) => (m.personen.find((p) => p.id === x.personId) || {}).nachname).join(", ")}</span>
              </div>); })}
          </div>
        </Card>)}

      {darfLeiten && (
        <Card>
          <CardHead right={<Lab>nach Vorrangregel sortiert</Lab>}>Entscheidung</CardHead>
          <div style={{ padding: "14px 22px 0", fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
            Vorrang hat, wer im Vorjahr zurückstecken musste. Danach die selbst vergebene Priorität, danach der Eingang.
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", marginTop: 12 }}>
            {sortiert.map((x) => {
              const p = m.personen.find((y) => y.id === x.personId);
              const e = p ? m.einheiten.find((y) => y.id === einheitAm(p, x.von)) : null;
              const strittig = konflikte.some((k) => k.wuensche.some((y) => y.id === x.id));
              const zurueck = ((r.vorjahrZurueck) || []).includes(x.personId);
              return (
                <div key={x.id} className="row" style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 22px", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ fontSize: 13.5 }}>{p ? `${p.nachname}, ${p.vorname}` : "?"}
                      {zurueck && <Pill size="sm" tone="accent" style={{ marginLeft: 8 }}>Vorrang</Pill>}</div>
                    <div style={{ fontSize: 11.5, color: e ? lesbar(e.farbe) : C.dimmer }}>{e ? e.name : "—"}</div>
                  </div>
                  <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{fDatum(x.von)} – {fDatum(x.bis)}</span>
                  <Pill size="sm">Prio {x.prio}</Pill>
                  {strittig && <Pill size="sm" tone="warn">strittig</Pill>}
                  {x.status === "offen" ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn size="sm" kind="ok" onClick={() => akt.wunschEntscheiden(x.id, true)}>Zusagen</Btn>
                      <Btn size="sm" kind="danger" onClick={() => akt.wunschEntscheiden(x.id, false)}>Absagen</Btn>
                    </div>
                  ) : <Pill tone={x.status === "genehmigt" ? "ok" : "danger"}>{x.status}</Pill>}
                </div>);
            })}
          </div>
        </Card>)}
    </div>);
}
