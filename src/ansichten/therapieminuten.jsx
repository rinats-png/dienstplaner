/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { addDays, montag } from "../regelwerk.js";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Btn, Inp, Sel, Field, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { heute, fKurz } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Icon } from "../gestalt/icons.jsx";
import { Fortschritt, Erklaerkasten } from "../gestalt/bausteine.jsx";
import { Hinweisband } from "../gestalt/ansichten.jsx";
import { BEREICHE as PPP_BEREICHE, ARTEN as PPP_ARTEN, BERUFSGRUPPEN as PPP_GRUPPEN, pruefeWoche as pppPruefen, MINDESTERFUELLUNG as PPP_MINDEST } from "../ppprl.js";
import { darf } from "../lib/berechtigung.js";


/* --------------------------------------------------------------------------
   PPP-RL — therapeutisches Personal je Woche

   Steht in derselben Ansicht wie die PpUGV, weil beide dieselbe Frage
   beantworten: Ist genug Personal da, um behandeln zu dürfen? Gerechnet
   wird anders — nicht Köpfe je Schicht, sondern Minuten je Patient und
   Woche, aufgeteilt auf Berufsgruppen.
   -------------------------------------------------------------------------- */
export function Therapieminuten({ sitz, akt, einheit }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "plan.edit.unit");
  const [woche, setWoche] = useState(montag(heute()));
  const e = (m.therapie || {})[`${einheit.id}|${woche}`] || {};

  const lage = useMemo(() => pppPruefen({
    bereich: einheit.pppBereich || null, art: einheit.pppArt || "vollstationaer",
    datum: woche, patienten: e.patienten === undefined ? null : e.patienten,
    minuten: e.minuten || {},
  }), [einheit, e, woche]);

  const ton = lage.urteil === "rot" ? "danger" : lage.urteil === "gelb" ? "warn"
    : lage.urteil === "grau" ? undefined : "ok";

  return (
    <div>
      <Card style={{ marginBottom: 22 }}>
        <div style={{ padding: "20px var(--pad-x)", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16 }}>
          <Field label="Behandlungsbereich">
            <Sel value={einheit.pppBereich || ""} disabled={!darf(sitz, "org.edit")}
              onChange={(ev) => akt.setzeEinheitPpp(einheit.id, ev.target.value || null, einheit.pppArt)}>
              <option value="">— kein Bereich der PPP-RL —</option>
              {PPP_BEREICHE.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Sel></Field>
          <Field label="Behandlungsart">
            <Sel value={einheit.pppArt || "vollstationaer"} disabled={!darf(sitz, "org.edit")}
              onChange={(ev) => akt.setzeEinheitPpp(einheit.id, einheit.pppBereich, ev.target.value)}>
              {PPP_ARTEN.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel></Field>
          <Field label="Woche">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn size="sm" onClick={() => setWoche(addDays(woche, -7))} aria-label="Woche zurück"><Icon n="chevron-links" size={16} /></Btn>
              <span style={{ fontSize: 13, ...NUM }}>{fKurz(woche)}–{fKurz(addDays(woche, 6))}</span>
              <Btn size="sm" onClick={() => setWoche(addDays(woche, 7))} aria-label="Woche vor"><Icon n="chevron-rechts" size={16} /></Btn>
            </div>
          </Field>
          <Field label="Patientinnen und Patienten"
            hint="Belegung im Wochenmittel. Leer heißt: nicht erhoben.">
            <Inp type="number" min="0" step="0.5" disabled={!darfPflegen}
              value={e.patienten ?? ""} placeholder="—"
              onChange={(ev) => akt.setzeTherapie(einheit.id, woche, "patienten", ev.target.value)} /></Field>
        </div>
      </Card>

      {!einheit.pppBereich ? (
        <Card><Leer titel="Kein Bereich der PPP-RL hinterlegt"
          text="Die Richtlinie gilt für die stationäre Psychiatrie, die Kinder- und Jugendpsychiatrie und die Psychosomatik. Wähle oben den Bereich, dann wird geprüft." /></Card>
      ) : (<>
        <Hinweisband ton={ton === "danger" ? "danger" : ton === "warn" ? "warn" : ton === "ok" ? "ok" : "accent"}
          icon={ton === "ok" ? "kreis-haken" : ton ? "warnung" : "info"}
          titel={<Pill size="sm" tone={ton}>
            {lage.urteil === "rot" ? "unter der Mindesterfüllung"
              : lage.urteil === "gelb" ? "unter der Vorgabe"
              : lage.urteil === "grau" ? "nicht bewertbar" : "erfüllt"}</Pill>}>
          <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.6 }}>{lage.text}</div>
          {lage.luecken && lage.luecken.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.warn, marginTop: 8 }}>
              Nicht erfasst: {lage.luecken.join(", ")}.</div>)}
        </Hinweisband>

        <Card>
          <CardHead right={<Lab>Minuten in dieser Woche</Lab>}>Berufsgruppen</CardHead>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: C.dim }}>
                {["Berufsgruppe", "Soll", "Ist", "Erfüllung"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600 }}>{h}</th>))}
              </tr></thead>
              <tbody>
                {(lage.zeilen || PPP_GRUPPEN.map((g) => ({ gruppe: g, soll: 0, ist: null, quote: null })))
                  .map((z) => {
                  const farbe = z.quote === null ? C.dimmer
                    : z.quote >= 1 ? C.ok : z.quote >= PPP_MINDEST ? C.warn : C.danger;
                  return (
                    <tr key={z.gruppe.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                      <td style={{ padding: "8px 14px" }}>{z.gruppe.name}</td>
                      <td style={{ padding: "8px 14px", ...NUM }}>{z.soll ? zahl(z.soll) : "—"}</td>
                      <td style={{ padding: "6px 14px" }}>
                        <Inp type="number" min="0" style={{ width: 96, padding: "6px 8px" }}
                          disabled={!darfPflegen}
                          value={(e.minuten || {})[z.gruppe.id] ?? ""} placeholder="—"
                          onChange={(ev) => akt.setzeTherapie(einheit.id, woche, z.gruppe.id, ev.target.value)}
                          aria-label={`Minuten ${z.gruppe.name} in der Woche ab ${woche}`} /></td>
                      <td style={{ padding: "8px 14px", minWidth: 150 }}>
                        <div style={{ color: farbe, fontWeight: 600, ...NUM }}>
                          {z.quote === null ? "nicht erfasst" : `${Math.round(z.quote * 100)} %`}</div>
                        {z.quote !== null && (
                          <div style={{ marginTop: 5 }}>
                            <Fortschritt wert={Math.min(100, z.quote * 100)} hoehe={5}
                              ton={z.quote >= 1 ? "ok" : z.quote >= PPP_MINDEST ? "warn" : "danger"}
                              label={`${z.gruppe.name}: ${Math.round(z.quote * 100)} Prozent Erfüllung`} /></div>)}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Erklaerkasten style={{ marginTop: 16 }}>
          <b style={{ color: C.text }}>Wonach gerechnet wird.</b>{" "}
          Die PPP-RL gibt Minuten je Patientin und Woche vor, getrennt nach
          Berufsgruppen. Unter {Math.round(PPP_MINDEST * 100)} Prozent Erfüllung drohen
          Vergütungsabschläge; dazwischen liegt der Bereich, in dem die Vorgabe verfehlt,
          die Mindesterfüllung aber gehalten ist.
          <div style={{ marginTop: 10 }}>
            Grundlage: {lage.richtwerte ? lage.richtwerte.fassung : "—"}
            {lage.richtwerte && lage.richtwerte.eigen ? " · von der Einrichtung angepasst" : ""}.
            Das Nachweisverfahren gegenüber den Kassen wurde zum 1. Januar 2026 umgestellt
            und läuft jährlich über eine eigene Spezifikation — was hier entsteht, ist die
            Grundlage dafür, nicht die Meldung selbst.
          </div>
        </Erklaerkasten>
      </>)}
    </div>);
}
