/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { betreiberSicht, BRANCHEN, stat } from "../lib/fachlogik.js";
import { Btn, H1, Card, Kpi, CardHead, Lab, Pill, Field } from "../ui/bausteine.jsx";
import { Icon } from "../gestalt/icons.jsx";
import { fDatum, heute, MON } from "../lib/datum.js";
import { between } from "../regelwerk.js";
import { eur0, zahl, eur } from "../lib/format.js";
import { LinienDiagramm } from "../ui/diagramme.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { paketAnzeige, leistungenAnzeige } from "../stufen.js";
import { StandorteSpiegel } from "../ansichten/standortespiegel.jsx";
import { Balken } from "../ui/leisten.jsx";
import { Preisgestaltung } from "./preisgestaltung.jsx";

export function BetreiberDetail({ db, akt, mandantId, zurueck }) {
  const m = db.mandanten.find((x) => x.id === mandantId);
  if (!m) return null;
  const s = betreiberSicht(db, m);
  const p = s.preis;
  const rgs = db.rechnungen.filter((r) => r.mandantId === m.id);
  return (
    <div>
      <Btn size="sm" kind="quiet" onClick={zurueck} style={{ marginBottom: 16 }}><Icon n="chevron-links" size={14} /> Alle Mandanten</Btn>
      <H1 sub={`${(BRANCHEN.find((b) => b[0] === s.branche) || [])[1]} · Tarif ${p.t.name} · ${stat(s.status).label}`}
        right={<div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Btn kind="primary" onClick={() => akt.rechnungStellen(m.id)}>Rechnung erzeugen</Btn>
          <Btn kind="danger" onClick={() => akt.loescheMandant(m.id)}>Löschen</Btn></div>}>{s.name}</H1>

      <Card style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
        overflow: "hidden", marginBottom: 18 }}>
        <Kpi label="Kunde seit" value={fDatum(s.seit)} sub={(() => {
          const t = between(s.seit, heute());
          const mo = Math.floor(t / 30.44);
          return t < 0 ? "Vertragsbeginn liegt in der Zukunft"
            : mo < 1 ? `${t} Tage` : mo < 24 ? `${mo} Monate` : `${Math.floor(mo / 12)} Jahre ${mo % 12} Monate`;
        })()} />
        <Kpi label="Bisheriger Umsatz" value={eur0(db.rechnungen.filter((r) => r.mandantId === s.id)
          .reduce((a, r) => a + r.brutto, 0))} sub={`${db.rechnungen.filter((r) => r.mandantId === s.id).length} Rechnungen`} />
        <Kpi label="Organisationseinheiten" value={s.einheiten} sub={`${s.dienstarten} Dienstarten`} />
        <Kpi label="Standorte" value={zahl(p.standorte)} sub={`${zahl(p.personen)} Personen`} />
        <Kpi label="Letzte Änderung" value={s.letzteAenderung ? s.letzteAenderung.split(",")[0] : "—"}
          sub={s.letzteAenderung ? "im Betrieb" : "keine Aktivität erfasst"} />
      </Card>

      {(() => {
        const rg = db.rechnungen.filter((r) => r.mandantId === s.id)
          .sort((a, b) => (a.monat < b.monat ? -1 : 1)).slice(-12);
        if (rg.length < 2) return null;
        return (
          <Card style={{ marginBottom: 18 }}>
            <CardHead right={<Lab>letzte {rg.length} Monate</Lab>}>Umsatzverlauf</CardHead>
            <div style={{ padding: "22px 24px 18px" }}>
              <LinienDiagramm daten={rg.map((r) => ({ label: r.monat.slice(5), wert: r.brutto }))}
                wert="wert" label="label" hoehe={150} farbe={C.accent}
                format={(x) => eur(x)} nulllinie={false} />
            </div>
          </Card>); })()}

      {(() => {
        const rg = db.rechnungen.filter((r) => r.mandantId === s.id)
          .sort((a, b) => (a.monat < b.monat ? -1 : 1)).slice(-12);
        if (rg.length < 2) return null;
        return (
          <Card style={{ padding: 24, marginBottom: 18 }}>
            <CardHead style={{ padding: 0, border: "none", marginBottom: 16 }}
              right={<Lab>{rg.length} Monate</Lab>}>Umsatzentwicklung</CardHead>
            <LinienDiagramm farbe={C.ok} nulllinie={false} einheit=" €"
              daten={rg.map((r) => ({ label: MON[Number(r.monat.slice(5, 7)) - 1].slice(0, 3), y: r.brutto }))} />
          </Card>);
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        <Card>
          <CardHead>Aktuelle Abrechnung</CardHead>
          <div style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <span style={{ width: 24, height: 24, borderRadius: 8, background: C.accentLight,
                color: C.accent, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700 }}><Icon n="kreis-haken" size={14} /></span>
              <span style={{ fontSize: 13.5, color: C.dim, flex: 1 }}>Grundgebühr {p.stufe.name}</span>
              <span style={{ fontSize: 13.5, width: 88, textAlign: "right", ...NUM }}>{eur(p.grund)}</span>
            </div>
            {p.zusatzPlaner > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, background: C.bg,
                  color: C.dim, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700 }}>+</span>
                <span style={{ fontSize: 13.5, color: C.dim, flex: 1 }}>
                  {zahl(p.zusatzPlaner)} zusätzliche{p.zusatzPlaner === 1 ? "r" : ""} Planer</span>
                <span style={{ fontSize: 13.5, width: 88, textAlign: "right", ...NUM }}>{eur(p.summePlaner)}</span>
              </div>)}
            {p.standortzuschlaege.posten.map((posten, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, background: C.bg,
                  color: C.dim, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700 }}>+</span>
                <span style={{ fontSize: 13.5, color: C.dim, flex: 1 }}>
                  Standort über dem Kontingent
                  <span style={{ color: C.dimmer, ...NUM }}> · {zahl(posten.personen)} Personen</span></span>
                <span style={{ fontSize: 13.5, width: 88, textAlign: "right", ...NUM }}>{eur(posten.zuschlag)}</span>
              </div>))}
            {p.pakete.map((pk) => (
              <div key={pk.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, background: C.bg,
                  color: C.dim, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700 }}>+</span>
                <span style={{ fontSize: 13.5, color: C.dim, flex: 1 }}>Paket {pk.name}
                  {(p.paketeNichtBerechnet || []).some((x) => x.id === pk.id)
                    && <span style={{ color: C.dimmer }}> · {paketAnzeige(pk.id, { pilot: p.pilot,
                      zustimmungFehlt: (p.paketeOhneGrund || []).some((x) => x.id === pk.id) })} Nicht berechnet. Keine Zahlungsaufforderung.</span>}</span>
                <span style={{ fontSize: 13.5, width: 88, textAlign: "right", ...NUM }}>
                  {(p.paketeNichtBerechnet || []).some((x) => x.id === pk.id) ? eur(0) : eur(pk.aufpreis)}</span>
              </div>))}
            <div style={{ marginTop: 16, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}` }}>
              {/* Weicht die Vereinbarung vom Tarif ab, steht beides da.
                  Nur den Endbetrag zu zeigen hieße, in einem Jahr nicht mehr
                  zu wissen, ob der Preis günstig war. */}
              {p.gestaltung.herkunft === "sonderpreis" && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5,
                  color: C.dimmer, marginBottom: 9 }}>
                  <span>Nach Tarif wären es</span>
                  <span style={{ ...NUM, textDecoration: "line-through" }}>{eur(p.tarifwert)}</span></div>)}
              {p.gestaltung.rabatt > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5,
                  color: C.ok, marginBottom: 9 }}>
                  <span>Vereinbarter Nachlass</span>
                  <span style={NUM}>−{Math.round(p.gestaltung.rabatt * 100)} %</span></div>)}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 15 }}>Netto monatlich</span>
                <span style={{ fontSize: 26, fontWeight: 650, ...NUM }}>{eur(p.gesamt)}</span></div>
              <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 6 }}>{p.gestaltung.text}</div>
              {!p.zahlt && <div style={{ marginTop: 11 }}><Pill tone="warn">Status „{stat(m.status).label}" — wird nicht berechnet</Pill></div>}
              {(p.gestaltung.frei || p.gestaltung.ausgesetzt) && (
                <div style={{ marginTop: 11 }}><Pill tone="warn">
                  Für diesen Monat entsteht keine Rechnung</Pill></div>)}
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}`, display: "grid", gap: 13 }}>
              <Field label="Rechnungsanschrift"><textarea className="inp" rows={3} value={m.anschrift || ""}
                onChange={(e) => akt.setzeMandantFeld(m.id, "anschrift", e.target.value)} /></Field>
            </div>
          </div>
        </Card>

        <StandorteSpiegel m={m} p={p} />

        <Preisgestaltung m={m} p={p} akt={akt} />

        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <Card>
            <CardHead>Kontingente</CardHead>
            <div style={{ padding: 22 }}>
              {[["Planer-Zugänge", p.planerGesamt, p.stufe.planerInklusive],
                ["Standorte", s.standorte, p.stufe.standorteInklusive]].map(([l, ist, inkl]) => {
                const zusatz = Math.max(0, ist - inkl);
                const pct = Math.min(100, (Math.min(ist, inkl) / Math.max(1, inkl)) * 100);
                return (<div key={l} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                    <span style={{ color: C.dim }}>{l}</span>
                    <span style={{ color: zusatz > 0 ? C.warn : C.ok, fontWeight: 600, ...NUM }}>
                      {zahl(ist)} / {zahl(inkl)} inkl.{zusatz > 0 ? ` · ${zahl(zusatz)} zusätzlich` : ""}</span></div>
                  <Balken ist={Math.min(ist, inkl)} soll={inkl} tone={zusatz > 0 ? "warn" : "ok"} />
                </div>);
              })}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
                <Lab style={{ marginBottom: 10 }}>Im Tarif enthalten</Lab>
                {leistungenAnzeige(p.t.leistungen).map((f) => <div key={f} style={{ fontSize: 13.5, color: C.dim, marginBottom: 7 }}>
                  <span style={{ color: C.ok, marginRight: 9, display: "inline-flex", verticalAlign: "-2px" }}><Icon n="haken" size={14} strokeWidth={2.2} /></span>{f}</div>)}
              </div>
            </div>
          </Card>
          <Card>
            <CardHead right={<Pill size="sm">{rgs.length}</Pill>}>Rechnungen</CardHead>
            <div>
              {rgs.length === 0 && <div style={{ padding: 22, fontSize: 13.5, color: C.dimmer }}>Noch keine Rechnung erzeugt.</div>}
              {rgs.map((r) => (
                <div key={r.nummer} className="row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px",
                  borderBottom: `1px solid ${C.lineSoft}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, ...NUM }}>{r.nummer}</div>
                    <div style={{ fontSize: 11.5, color: C.dimmer }}>{r.zeitraum} · {zahl(r.zugaenge)} Zugänge</div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, ...NUM }}>{eur(r.brutto)}</span>
                  <Btn size="sm" onClick={() => akt.rechnungPDF(r)}>PDF</Btn>
                  <Btn size="sm" kind="quiet" onClick={() => akt.rechnungWord(r)}>Word</Btn>
                </div>))}
            </div>
          </Card>
        </div>
      </div>
    </div>);
}
