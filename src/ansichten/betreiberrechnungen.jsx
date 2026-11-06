/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { heute, fDatum } from "../lib/datum.js";
import { stat, BETREIBER_LEER } from "../lib/fachlogik.js";
import { H1, Inp, Btn, KpiRow, Kpi, Card, CardHead, Leer, Lab, Field } from "../ui/bausteine.jsx";
import { eur0, zahl, eur } from "../lib/format.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";

export function BetreiberRechnungen({ db, akt }) {
  const [monat, setMonat] = useState(heute().slice(0, 7));
  const offen = db.mandanten.filter((m) => stat(m.status).zahlt);
  const summe = db.rechnungen.reduce((a, r) => a + r.brutto, 0);
  return (
    <div>
      <H1 sub="Die Rechnung entsteht aus dem Zugangsbestand zum Zeitpunkt der Erstellung. Ausgabe als PDF oder als Word-Dokument."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Inp type="month" value={monat} onChange={(e) => setMonat(e.target.value)} style={{ width: 168 }} />
          <Btn kind="primary" onClick={() => akt.rechnungslauf(monat)}>Rechnungslauf starten</Btn>
        </div>}>Rechnungen</H1>

      <KpiRow min={200}>
        <Kpi label="Erzeugte Rechnungen" value={db.rechnungen.length} />
        <Kpi label="Gesamtbetrag brutto" value={eur0(summe)} tone="accent" />
        <Kpi label="Abzurechnende Mandanten" value={offen.length} sub="Status aktiv oder gekündigt" />
        <Kpi label="Umsatzsteuer" value={`${(db.betreiber || BETREIBER_LEER).steuersatz} %`} sub={`Zahlungsziel ${(db.betreiber || BETREIBER_LEER).zahlungsziel} Tage`} />
      </KpiRow>

      <Card style={{ marginTop: 20 }}>
        <CardHead right={db.rechnungen.length > 0 && <Btn size="sm" kind="danger" onClick={akt.rechnungenLeeren}>Alle löschen</Btn>}>
          Rechnungsausgang</CardHead>
        {db.rechnungen.length === 0
          ? <Leer titel="Noch keine Rechnungen" text="Der Rechnungslauf erzeugt für jeden abzurechnenden Mandanten eine Rechnung aus dem aktuellen Zugangsbestand." />
          : <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
              <thead><tr>{["Nummer", "Mandant", "Zeitraum", "Zugänge", "Netto", "USt", "Brutto", "Fällig", ""].map((h, i) => (
                <th key={i} style={{ textAlign: i > 2 ? "right" : "left", padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <Lab>{h}</Lab></th>))}</tr></thead>
              <tbody>{db.rechnungen.map((r) => (
                <tr key={r.nummer} className="row">
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, ...NUM }}>{r.nummer}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13.5 }}>{r.mandant}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.dim }}>{r.zeitraum}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 13, ...NUM }}>{zahl(r.zugaenge)}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 13, ...NUM }}>{eur(r.netto)}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 13, color: C.dim, ...NUM }}>{eur(r.steuer)}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 14, fontWeight: 600, ...NUM }}>{eur(r.brutto)}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 12.5, color: C.dim, ...NUM }}>{fDatum(r.faellig)}</td>
                  <td style={{ padding: "12px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Btn size="sm" onClick={() => akt.rechnungPDF(r)}>PDF</Btn>{" "}
                    <Btn size="sm" kind="quiet" onClick={() => akt.rechnungWord(r)}>Word</Btn></td>
                </tr>))}</tbody>
            </table></div>}
      </Card>

      <Card style={{ marginTop: 18 }}>
        <CardHead>Angaben auf der Rechnung</CardHead>
        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 15 }}>
          <Field label="Firma"><Inp value={(db.betreiber || BETREIBER_LEER).firma} onChange={(e) => akt.setzeBetreiber("firma", e.target.value)} /></Field>
          <Field label="Umsatzsteuer-Identifikationsnummer"><Inp value={(db.betreiber || BETREIBER_LEER).ustId} onChange={(e) => akt.setzeBetreiber("ustId", e.target.value)} /></Field>
          <Field label="IBAN"><Inp value={(db.betreiber || BETREIBER_LEER).iban} onChange={(e) => akt.setzeBetreiber("iban", e.target.value)} /></Field>
          <Field label="Umsatzsteuersatz in Prozent"><Inp type="number" value={(db.betreiber || BETREIBER_LEER).steuersatz}
            onChange={(e) => akt.setzeBetreiber("steuersatz", Number(e.target.value))} /></Field>
          <Field label="Zahlungsziel in Tagen"><Inp type="number" value={(db.betreiber || BETREIBER_LEER).zahlungsziel}
            onChange={(e) => akt.setzeBetreiber("zahlungsziel", Number(e.target.value))} /></Field>
          <Field label="Anschrift"><textarea className="inp" rows={3} value={(db.betreiber || BETREIBER_LEER).anschrift}
            onChange={(e) => akt.setzeBetreiber("anschrift", e.target.value)} /></Field>
        </div>
      </Card>
    </div>);
}
