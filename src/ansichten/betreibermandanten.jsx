/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { betreiberSicht, stat, BRANCHEN, STATUS } from "../lib/fachlogik.js";
import { H1, Btn, KpiRow, Kpi, Card, Pill, Sel } from "../ui/bausteine.jsx";
import { eur0, zahl, eur } from "../lib/format.js";
import { C } from "../farben.js";
import { fDatum } from "../lib/datum.js";
import { ROLLEN } from "../lib/rollen.js";
import { lesbar, NUM } from "../ui/thema.js";
import { MandantAnlegen } from "../ansichten/mandantanlegen.jsx";

/* ==========================================================================
   BETREIBERANSICHT
   Zeigt ausschließlich Zahlen. Keine Namen, keine E-Mail-Adressen, keine Pläne.
   ========================================================================== */
export function BetreiberMandanten({ db, akt, oeffne }) {
  const [neu, setNeu] = useState(false);
  const [form, setForm] = useState({ name: "", branche: "sicherheit", tarif: "pro", kontakt: "", anschrift: "" });
  const sichten = db.mandanten.map((m) => betreiberSicht(db, m));
  const mrr = sichten.reduce((a, s) => a + s.preis.wirksam, 0);
  const zusatzPlaner = sichten.reduce((a, s) => a + (s.preis.zusatzPlaner || 0), 0);
  const zuschlagsstandorte = sichten.reduce((a, s) => a + (s.preis.standortzuschlaege.posten.length || 0), 0);

  return (
    <div>
      <H1 sub="Je Kunde ein Mandant und eine Stufe. Was den Preis bewegt, entscheidet der Kunde selbst — ein zusätzlicher Planer-Zugang oder ein Standort über dem Kontingent."
        right={<Btn kind="primary" onClick={() => setNeu(true)}>Mandant anlegen</Btn>}>Mandanten</H1>

      <KpiRow>
        <Kpi label="Wiederkehrender Umsatz" value={eur0(mrr)} unit="/ Monat" tone="accent"
          sub={`${sichten.filter((s) => s.preis.zahlt).length} von ${sichten.length} zahlend`} />
        <Kpi label="Zusatz-Planer" value={zahl(zusatzPlaner)} sub="über alle Mandanten hinweg" />
        <Kpi label="Zuschlagspflichtige Standorte" value={zahl(zuschlagsstandorte)} sub="über dem jeweiligen Kontingent" />
        <Kpi label="Jahreswert" value={eur0(mrr * 12)} sub="bei unverändertem Bestand" />
      </KpiRow>

      <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
        {sichten.map((s) => {
          const st = stat(s.status);
          return (
            <Card key={s.id} hover style={{ padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
                <div style={{ minWidth: 210, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                    <span style={{ fontSize: 18, fontWeight: 620, letterSpacing: "-.02em" }}>{s.name}</span>
                    <Pill size="sm" tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.dimmer }}>
                    {(BRANCHEN.find((b) => b[0] === s.branche) || [])[1]} · seit {fDatum(s.seit)}
                    {s.stichtag ? ` · Stichtag ${fDatum(s.stichtag)}` : ""} · {s.kontakt}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                  <Sel value={s.status} onChange={(e) => akt.setzeStatus(s.id, e.target.value)} style={{ width: 146 }}>
                    {STATUS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Sel>
                  <Sel value={s.tarif} onChange={(e) => akt.setzeTarif(s.id, e.target.value)} style={{ width: 152 }}>
                    {db.tarife.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Sel>
                  <Btn size="sm" onClick={() => oeffne(s.id)}>Details</Btn>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(128px,1fr))", gap: 14, marginTop: 20 }}>
                {ROLLEN.filter((r) => !r.extern).map((r) => {
                  const z = s.zugaenge[r.id] || 0;
                  const planerZeile = r.id === "planer";
                  return (
                    <div key={r.id} className="karte" style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                        <span style={{ width: 21, height: 21, borderRadius: 7, background: `${r.farbe}1E`, color: lesbar(r.farbe),
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{r.kurz}</span>
                        <span style={{ fontSize: 11.5, color: C.dim }}>{r.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                        <span style={{ fontSize: 22, fontWeight: 650, ...NUM }}>{z}</span>
                        <span style={{ fontSize: 11, color: C.dimmer, ...NUM }}>
                          {planerZeile
                            ? (s.preis.zusatzPlaner > 0 ? `${s.preis.zusatzPlaner} zusätzlich` : "im Kontingent")
                            : "kostenfrei"}</span>
                      </div>
                    </div>);
                })}
                <div className="karte" style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 7 }}>Standorte</div>
                  <div style={{ fontSize: 22, fontWeight: 650,
                    color: s.preis.standortzuschlaege.posten.length ? C.warn : C.text, ...NUM }}>
                    {s.standorte}<span style={{ fontSize: 12, color: C.dimmer, fontWeight: 400 }}>
                      /{s.preis.stufe.standorteInklusive} inkl.</span></div>
                </div>
                <div className="karte" style={{ padding: "12px 14px", background: "rgba(43,52,64,.06)" }}>
                  <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 7 }}>Monatspreis</div>
                  <div style={{ fontSize: 20, fontWeight: 650, color: s.preis.zahlt ? C.accent : C.dimmer, ...NUM }}>{eur(s.preis.gesamt)}</div>
                  <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                    {eur(s.preis.grund)} Grund
                    {s.preis.summePlaner > 0 ? ` + ${eur(s.preis.summePlaner)} Planer` : ""}
                    {s.preis.summeStandorte > 0 ? ` + ${eur(s.preis.summeStandorte)} Standort` : ""}</div>
                </div>
              </div>
            </Card>);
        })}
      </div>

      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 18, lineHeight: 1.55, maxWidth: 760 }}>
        Diese Ansicht enthält keine personenbezogenen Daten. Sichtbar sind Anzahl und Art der vergebenen
        Zugänge, nicht die Personen dahinter. Vergibt ein Planer im Betrieb einen weiteren Zugang, ändert
        sich hier unmittelbar die Zahl und der Monatspreis.
      </div>

      {neu && <MandantAnlegen db={db} akt={akt} onClose={() => setNeu(false)} />}
    </div>);
}
