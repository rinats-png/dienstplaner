/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { simulation, VORLAGEN } from "../lib/fachlogik.js";
import { H1, Btn, Card, CardHead, Seg, Lab, klickbar, Sel } from "../ui/bausteine.jsx";
import { mehrzahl } from "../lib/rollen.js";
import { Kennzahlen, Hinweisband } from "../gestalt/ansichten.jsx";
import { n2, sgn, n1 } from "../lib/format.js";
import { C } from "../farben.js";
import { DOW } from "../lib/datum.js";
import { NUM, lesbar } from "../ui/thema.js";
import { pad } from "../regelwerk.js";
import { Zelle } from "../ui/leisten.jsx";
import { versatzTageVon } from "../../server/lib/fachpruefung.mjs";
import { useState } from "react";
import { darf } from "../lib/berechtigung.js";
import { dauer } from "../regelwerk.js";

/* ============================== SCHICHTFOLGE ============================= */
export function Schichtfolge({ sitz, akt }) {
  const m = sitz.mandant;
  const sim = useMemo(() => simulation(m), [m]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [pinsel, setPinsel] = useState(m.dienstarten[0].id);
  const editierbar = darf(sitz, "pattern.edit");
  const soll = m.einstellungen.sollWochenstunden;
  const abw = sim.wochenstunden - soll;

  return (
    <div>
      <H1 sub={`Ein Zyklus über ${m.zyklus.tage.length} Tage, ${m.einheiten.filter((e) => !e.pool).length} ${mehrzahl(m.einheitLabel)} mit eigenem Startpunkt. Der Plan wird daraus für jeden Tag berechnet — nichts wird ausgerollt, es gibt keine Jahresgrenze.`}
        right={editierbar && <Btn kind="primary" onClick={akt.oeffneWizard}>Neu einrichten</Btn>}>Schichtfolge</H1>

      <Kennzahlen min={170} kacheln={[
        { label: "Wochenarbeitszeit", wert: n2(sim.wochenstunden), einheit: "h",
          ton: Math.abs(abw) < .5 ? "ok" : Math.abs(abw) < 1.5 ? "warn" : "danger", sub: `Soll ${n2(soll)} h · ${sgn(abw)} h` },
        { label: "Deckungslücken", wert: sim.luecken.length, ton: sim.luecken.length ? "danger" : "ok",
          hervor: sim.luecken.length ? "danger" : undefined,
          sub: sim.luecken.length ? "Zyklus deckt nicht jeden Tag" : "jeder Tag vollständig gedeckt" },
        { label: "Dienste am Stück", wert: sim.maxFolge, einheit: "max.",
          ton: sim.maxFolge <= 5 ? "ok" : sim.maxFolge <= 7 ? "warn" : "danger", sub: `Grenzwert ${m.einstellungen.maxFolge}` },
        { label: "Nächte am Stück", wert: sim.maxNacht, einheit: "max.", ton: sim.maxNacht <= 4 ? "ok" : "danger", sub: "empfohlen 3 bis 4" },
        { label: "Einzeldienste", wert: sim.einzel, ton: sim.einzel === 0 ? "ok" : "warn", sub: "isolierte Diensttage" }]} />

      {(sim.luecken.length > 0 || sim.konflikte.length > 0) && (
        <Hinweisband ton="danger">
          {sim.luecken.map((l) => <div key={l.da.id} style={{ color: C.danger, marginBottom: 6 }}>
            <b>{l.da.name}</b> ist an {l.tage} von {sim.len} Zyklustagen von keiner {m.einheitLabel} besetzt.</div>)}
          {sim.konflikte.slice(0, 5).map((k, i) => <div key={i} style={{ color: C.danger, marginBottom: 6 }}>
            Tag {k.tag + 1}: {k.von} → {k.nach} lässt nur {n1(k.ruhe)} h Ruhezeit. Das trifft jede {m.einheitLabel}.</div>)}
        </Hinweisband>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 16 }}>
        <Card style={{ minWidth: 0 }}>
          <CardHead right={editierbar && <Seg value={String(m.zyklus.wochen)}
            options={[3, 4, 5, 6].map((w) => ({ id: String(w), label: `${w} Wo.` }))}
            onChange={(v) => akt.setzeZyklusWochen(Number(v))} />}>Zyklusraster</CardHead>
          {editierbar && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 22px 0" }}>
            {m.dienstarten.filter((d) => !d.posten).map((d) => (
              <button key={d.id} type="button" onClick={() => setPinsel(d.id)} className="chip" aria-pressed={pinsel === d.id}
                style={{ background: pinsel === d.id ? `${d.farbe}22` : C.flaeche, color: pinsel === d.id ? d.farbe : C.dim,
                  borderColor: pinsel === d.id ? d.farbe : undefined, fontWeight: 600 }}>{d.kurz}</button>))}
            <button type="button" onClick={() => setPinsel("-")} className="chip" aria-pressed={pinsel === "-"}
              style={{ background: pinsel === "-" ? C.flaecheStill : C.flaeche, color: C.dim,
                borderColor: pinsel === "-" ? C.steuer : undefined, fontWeight: 600 }}>frei</button>
          </div>}
          <div style={{ padding: 22, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse" }}>
              <thead><tr><th style={{ paddingRight: 14 }}><Lab>Wo.</Lab></th>
                {DOW.map((d) => <th key={d} style={{ padding: "0 5px 12px", minWidth: 46 }}><Lab>{d}</Lab></th>)}
                <th style={{ paddingLeft: 18 }}><Lab>Stunden</Lab></th></tr></thead>
              <tbody>{Array.from({ length: m.zyklus.wochen }, (_, w) => {
                const woche = m.zyklus.tage.slice(w * 7, w * 7 + 7);
                const std = woche.reduce((s, id) => s + (map[id] ? dauer(map[id]) : 0), 0);
                return (<tr key={w}>
                  <td style={{ paddingRight: 14, fontSize: 13, color: C.dimmer, ...NUM }}>{pad(w + 1)}</td>
                  {woche.map((id, di) => (<td key={di} style={{ padding: 4, textAlign: "center" }}>
                    <div {...klickbar(editierbar ? () => akt.setzeZyklusTag(w * 7 + di, pinsel) : null,
                      `Woche ${w + 1}, ${DOW[di]}: ${map[id] ? map[id].name : "frei"} — mit dem gewählten Dienst belegen`)}
                      style={{ display: "inline-block", cursor: editierbar ? "pointer" : "default" }}>
                      <Zelle da={map[id]} size={38} /></div></td>))}
                  <td style={{ paddingLeft: 18, fontSize: 13, color: std > 0 ? C.text : C.dimmer, ...NUM }}>{n1(std)} h</td>
                </tr>); })}</tbody>
            </table>
          </div>
        </Card>

        <Card style={{ minWidth: 0 }}>
          <CardHead>Vorlagen und Versatz</CardHead>
          <div style={{ padding: 22 }}>
            {VORLAGEN.map((v) => (
              <div key={v.id} className="karte" style={{ padding: 16, marginBottom: 13,
                background: m.zyklus.vorlage === v.id ? C.accentLight : undefined,
                borderColor: m.zyklus.vorlage === v.id ? C.accent : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.name}</div>
                  <Btn size="sm" kind={m.zyklus.vorlage === v.id ? "quiet" : "primary"} disabled={!editierbar}
                    onClick={() => akt.ladeVorlage(v.id)}>{m.zyklus.vorlage === v.id ? "aktiv" : "laden"}</Btn>
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7, lineHeight: 1.45 }}>{v.text}</div>
                <div style={{ fontSize: 12, color: C.dimmer, marginTop: 7, ...NUM }}>
                  {n2(v.wochenstunden)} h/Woche · benötigt {v.einheiten} {mehrzahl(m.einheitLabel)}</div>
              </div>))}
            {m.einheiten.length !== m.zyklus.wochen && (
              <Hinweisband ton="warn" style={{ marginBottom: 14, boxShadow: "none" }}>
                Der Zyklus hat {m.zyklus.wochen} Wochen, es gibt {m.einheiten.length} {m.einheitLabel}n.
                Für lückenlose Deckung müssen beide Zahlen übereinstimmen.</Hinweisband>)}
            <Lab style={{ margin: "20px 0 12px" }}>Startpunkt je {m.einheitLabel}</Lab>
            {m.einheiten.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "8px 13px", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: lesbar(e.farbe, 3) }} />
                <span style={{ fontSize: 13.5, flex: "1 1 120px", minWidth: 0 }}>{e.name}</span>
                <Sel value={versatzTageVon(e)} disabled={!editierbar}
                  aria-label={`Startpunkt im Zyklus für ${e.name}`}
                  onChange={(ev) => akt.setzeVersatz(e.id, Number(ev.target.value))} style={{ width: 210 }}>
                  {m.zyklus.tage.map((t2, i) => {
                    const dd = map[t2];
                    return <option key={i} value={i}>Tag {i + 1} — {dd ? dd.name : "frei"}</option>; })}</Sel>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {Array.from({ length: Math.min(21, sim.len) }, (_, i) => {
                    const idx = (((i - versatzTageVon(e)) % sim.len) + sim.len) % sim.len;
                    return <Zelle key={i} da={map[m.zyklus.tage[idx]]} size={15} blass />; })}</div>
              </div>))}
          </div>
        </Card>
      </div>
    </div>);
}
