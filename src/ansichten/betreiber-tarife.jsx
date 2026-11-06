/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { H1, Card, CardHead, Field, Inp, Lab } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { leistungenAnzeige, ZUSATZ_PLANER } from "../stufen.js";
import { Icon } from "../gestalt/icons.jsx";
import { NUM } from "../ui/thema.js";
import { eur } from "../lib/format.js";
import { STANDORT_BAENDER } from "../standorte.js";



export function BetreiberTarife({ db, akt }) {
  return (
    <div>
      <H1 sub="Grundgebühr, enthaltenes Kontingent und Funktionstiefe je Stufe. Zusatz-Planer und der Standortzuschlag gelten stufenübergreifend — sie stehen unten.">Tarife</H1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 18 }}>
        {db.tarife.map((t) => (
          <Card key={t.id} hover>
            <CardHead>{t.name}</CardHead>
            <div style={{ padding: 22, display: "grid", gap: 13 }}>
              <Field label="Grundgebühr je Monat"
                hint="Enthält das Kontingent unten. Mitarbeiter, Sub-Planer und Betriebsrat sind unbegrenzt und stets kostenfrei.">
                <Inp type="number" step="1" value={t.grund}
                  onChange={(e) => akt.setzeTarifFeld(t.id, "grund", Number(e.target.value))} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Planer inklusive">
                  <Inp type="number" min={0} value={t.planerInklusive}
                    onChange={(e) => akt.setzeTarifFeld(t.id, "planerInklusive", Number(e.target.value))} /></Field>
                <Field label="Standorte inklusive" hint="Die größten zählen automatisch dazu.">
                  <Inp type="number" min={0} value={t.standorteInklusive}
                    onChange={(e) => akt.setzeTarifFeld(t.id, "standorteInklusive", Number(e.target.value))} /></Field>
              </div>
              <div style={{ paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
                <Lab style={{ marginBottom: 8 }}>Enthalten</Lab>
                {leistungenAnzeige(t.leistungen).map((f) => <div key={f} style={{ fontSize: 13, color: C.dim, marginBottom: 5 }}>
                  <span style={{ color: C.ok, marginRight: 8, display: "inline-flex", verticalAlign: "-2px" }}><Icon n="haken" size={14} strokeWidth={2.2} /></span>{f}</div>)}
              </div>
            </div>
          </Card>))}
      </div>
      <Card style={{ marginTop: 18 }}>
        <CardHead>Zusatz-Planer und Standortzuschlag</CardHead>
        <div style={{ padding: 22, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="karte" style={{ padding: "14px 18px", minWidth: 170 }}>
            <div style={{ fontSize: 12, color: C.dimmer }}>je zusätzlichem Planer</div>
            <div style={{ fontSize: 21, fontWeight: 650, ...NUM }}>{eur(ZUSATZ_PLANER)}</div>
          </div>
          {STANDORT_BAENDER.filter((b) => b.zuschlag > 0).map((b) => (
            <div key={b.label} className="karte" style={{ padding: "14px 18px", minWidth: 170 }}>
              <div style={{ fontSize: 12, color: C.dimmer, ...NUM }}>Standort, {b.label}</div>
              <div style={{ fontSize: 21, fontWeight: 650, ...NUM }}>{eur(b.zuschlag)}</div>
            </div>))}
        </div>
        <div style={{ padding: "0 22px 22px", fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
          Gilt nur für Standorte über dem Kontingent einer Stufe — die größten zählen
          immer zum Kontingent, unabhängig von ihrer Größe. Werte stehen in
          {" "}<code>src/standorte.js</code> und <code>ZUSATZ_PLANER</code> in App.jsx.
        </div>
      </Card>
    </div>);
}
