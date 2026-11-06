/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { heute } from "../lib/datum.js";
import { addDays } from "../regelwerk.js";
import { verteilung, planungssicherheit } from "../lib/fachlogik.js";
import { H1, Seg, Card, Lab, CardHead } from "../ui/bausteine.jsx";
import { Kennzahlen, Hinweisband, Leitraster } from "../gestalt/ansichten.jsx";
import { n1 } from "../lib/format.js";
import { C } from "../farben.js";
import { lesbar, NUM } from "../ui/thema.js";
import { AbweichungsDiagramm } from "../ui/diagramme.jsx";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";

/* ======================= VERTEILUNGSGERECHTIGKEIT ======================== */
export function Verteilung({ sitz, ym }) {
  const m = sitz.mandant;
  const [zeitraum, setZeitraum] = useState("90");
  const bis = heute(), von = addDays(bis, -Number(zeitraum));
  const v = useMemo(() => verteilung(m, von, bis), [m, von, bis]);
  const sicher = planungssicherheit(m, ym);
  const spalten = [["weNacht", "Wochenendnächte"], ["feier", "Feiertagsdienste"], ["naechte", "Nachtdienste"],
    ["wochenenden", "Wochenenddienste"], ["kurzfristig", "kurzfristige Änderungen"]];
  const spanne = (f) => { const w = v.zeilen.map((z) => z[f]); return Math.max(...w, 0) - Math.min(...w, 0); };

  return (
    <div>
      <H1 sub="Gestritten wird nicht über den Plan, sondern über die Verteilung. Solange niemand mitschreibt, gewinnt, wer am lautesten reklamiert."
        right={<Seg value={zeitraum} onChange={setZeitraum}
          options={[{ id: "90", label: "90 Tage" }, { id: "180", label: "6 Monate" }, { id: "365", label: "12 Monate" }]} />}>
        Belastungsverteilung</H1>

      <Kennzahlen kacheln={[
        { label: "Planungssicherheit", wert: `${100 - sicher.anteil} %`,
          ton: sicher.anteil > 30 ? "danger" : sicher.anteil > 15 ? "warn" : "ok",
          hervor: sicher.anteil > 15 ? (sicher.anteil > 30 ? "danger" : "warn") : undefined,
          sub: `${sicher.kurzfristig} von ${sicher.gesamt} Änderungen unter ${sicher.grenze} Tagen Vorlauf` },
        ...spalten.slice(0, 3).map(([fe, l]) => ({ label: `Spannweite ${l}`, wert: spanne(fe),
          ton: spanne(fe) > 4 ? "warn" : "ok", hervor: spanne(fe) > 4 ? "warn" : undefined,
          sub: `Mittel ${n1(v.mittel[fe])}` }))]} />

      {spanne("weNacht") <= 1 && spanne("feier") <= 1 && (
        <Hinweisband ton="ok">
          Die Belastung ist annähernd gleich verteilt. Das ist die Eigenschaft eines sauberen Rotationsmodells —
          Ungleichheit entsteht erst durch Abweichungen, Einsprünge und kurzfristige Änderungen. Genau die zeigt
          diese Ansicht, sobald sie auftreten.
        </Hinweisband>)}

      <Leitraster seiteBreite={380}
        haupt={<>
      <Card style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 880 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "14px 20px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 200 }}>
              <Lab>Person</Lab></th>
            {spalten.map(([f, l]) => (
              <th key={f} style={{ textAlign: "right", padding: "14px 16px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <Lab>{l}</Lab></th>))}
            <th style={{ textAlign: "right", padding: "14px 20px", borderBottom: `1px solid ${C.lineSoft}` }}><Lab>Dienste</Lab></th>
          </tr></thead>
          <tbody>{v.zeilen.map((z) => {
            const e = m.einheiten.find((x) => x.id === einheitAm(z.person, bis));
            return (<tr key={z.person.id} className="row">
              <td style={{ padding: "12px 20px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ fontSize: 13.5 }}>{z.person.nachname}, {z.person.vorname}</div>
                <div style={{ fontSize: 11.5, color: e ? lesbar(e.farbe) : C.dimmer }}>{e ? e.name : "—"}</div></td>
              {spalten.map(([f]) => {
                const a = z.abw[f];
                const auf = Math.abs(a) >= 2;
                return (<td key={f} style={{ padding: "12px 16px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: auf ? 650 : 400,
                    color: !auf ? C.text : a > 0 ? C.warn : C.ok, ...NUM }}>{z[f]}</div>
                  <div style={{ fontSize: 11, color: C.dimmer, ...NUM }}>{a >= 0 ? "+" : "−"}{n1(Math.abs(a))}</div>
                </td>); })}
              <td style={{ padding: "12px 20px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 13.5, color: C.dim, ...NUM }}>
                {z.dienste}</td>
            </tr>); })}</tbody>
        </table>
      </Card>
      <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>
        Die kleine Zahl unter jedem Wert ist die Abweichung vom Mittel der Belegschaft. Hervorgehoben wird ab
        zwei Diensten Unterschied — darunter ist es Zufall, darüber wird es zur Frage.
      </div>
          </>}
        seite={<>
      <Card>
        <CardHead right={<Lab>Abweichung vom Mittel</Lab>}>Wochenendnächte je Person</CardHead>
        <div style={{ padding: "22px 24px 18px", maxHeight: 420, overflowY: "auto" }}>
          <AbweichungsDiagramm zeilen={v.zeilen.slice(0, 24).map((z) => ({ ...z, abwWeNacht: z.abw.weNacht }))}
            wert="abwWeNacht" name={(z) => `${z.person.nachname}, ${z.person.vorname}`} />
        </div>
      </Card>

        </>} />
      <div style={{ marginTop: 16 }}>
      <Card style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 28 }}>
          {spalten.slice(0, 4).map(([f, l]) => (
            <div key={f}>
              <Lab style={{ marginBottom: 10 }}>{l}</Lab>
              <AbweichungsDiagramm wert="abw" name={(z) => z.nm}
                zeilen={v.zeilen.slice(0, 14).map((z) => ({
                  nm: `${z.person.nachname}, ${z.person.vorname}`, abw: z.abw[f] }))} />
            </div>))}
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 18, lineHeight: 1.55 }}>
          Jeder Punkt ist eine Person. Farbig hervorgehoben sind die Ausreißer — gelb bedeutet
          überdurchschnittlich belastet, grün unterdurchschnittlich. Häufen sich die Punkte um die
          Mittellinie, ist die Verteilung in Ordnung.
        </div>
      </Card>

      </div>
    </div>);
}
