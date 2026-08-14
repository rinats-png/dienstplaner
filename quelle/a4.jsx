
/* ==========================================================================
   BETREIBERANSICHT
   Zeigt ausschließlich Zahlen. Keine Namen, keine E-Mail-Adressen, keine Pläne.
   ========================================================================== */
function BetreiberMandanten({ db, akt, oeffne }) {
  const [neu, setNeu] = useState(false);
  const [form, setForm] = useState({ name: "", branche: "sicherheit", tarif: "pro", kontakt: "", anschrift: "" });
  const sichten = db.mandanten.map((m) => betreiberSicht(db, m));
  const mrr = sichten.reduce((a, s) => a + s.preis.wirksam, 0);
  const zug = sichten.reduce((a, s) => a + s.preis.zahlend, 0);

  return (
    <div>
      <H1 sub="Je Kunde ein Mandant und ein Hauptzugang. Alles Weitere verwaltet der Kunde selbst — die Zugangszahlen und damit die Kosten schreiben sich dabei von allein fort."
        right={<Btn kind="primary" onClick={() => setNeu(true)}>Mandant anlegen</Btn>}>Mandanten</H1>

      <KpiRow>
        <Kpi label="Wiederkehrender Umsatz" value={eur0(mrr)} unit="/ Monat" tone="accent"
          sub={`${sichten.filter((s) => s.preis.zahlt).length} von ${sichten.length} zahlend`} />
        <Kpi label="Vergebene Zugänge" value={zahl(zug)} sub="kostenpflichtig, über alle Mandanten" />
        <Kpi label="Erlös je Zugang" value={zug ? eur(mrr / zug) : eur(0)} sub="Mischkalkulation" />
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
                  const z = s.preis.z[r.id] || 0;
                  return (
                    <div key={r.id} className="karte" style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                        <span style={{ width: 21, height: 21, borderRadius: 7, background: `${r.farbe}1E`, color: r.farbe,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{r.kurz}</span>
                        <span style={{ fontSize: 11.5, color: C.dim }}>{r.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                        <span style={{ fontSize: 22, fontWeight: 650, ...NUM }}>{z}</span>
                        <span style={{ fontSize: 11, color: C.dimmer, ...NUM }}>
                          {r.berechnet ? (s.preis.t.preis[r.id] === 0 ? "inkl." : `à ${eur(s.preis.t.preis[r.id])}`) : "frei"}</span>
                      </div>
                    </div>);
                })}
                <div className="karte" style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 7 }}>Einheiten</div>
                  <div style={{ fontSize: 22, fontWeight: 650, color: s.preis.ueberEinheiten ? C.danger : C.text, ...NUM }}>
                    {s.einheiten}<span style={{ fontSize: 12, color: C.dimmer, fontWeight: 400 }}>/{s.preis.t.grenzen.einheiten}</span></div>
                </div>
                <div className="karte" style={{ padding: "12px 14px", background: "rgba(43,52,64,.06)" }}>
                  <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 7 }}>Monatspreis</div>
                  <div style={{ fontSize: 20, fontWeight: 650, color: s.preis.zahlt ? C.accent : C.dimmer, ...NUM }}>{eur(s.preis.gesamt)}</div>
                  <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                    Staffel −{Math.round(s.preis.st.rabatt * 100)} % · {eur(s.preis.jeKopf)}/Zugang</div>
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

function BetreiberDetail({ db, akt, mandantId, zurueck }) {
  const m = db.mandanten.find((x) => x.id === mandantId);
  if (!m) return null;
  const s = betreiberSicht(db, m);
  const p = s.preis;
  const rgs = db.rechnungen.filter((r) => r.mandantId === m.id);
  return (
    <div>
      <Btn size="sm" kind="quiet" onClick={zurueck} style={{ marginBottom: 16 }}>‹ Alle Mandanten</Btn>
      <H1 sub={`${(BRANCHEN.find((b) => b[0] === s.branche) || [])[1]} · Tarif ${p.t.name} · ${stat(s.status).label}`}
        right={<div style={{ display: "flex", gap: 9 }}>
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
        <Kpi label="Zugänge" value={zahl(p.zahlend)} sub="kostenpflichtig" />
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
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: C.dim, marginBottom: 13 }}>
              <span>Grundgebühr {p.t.name}{m.rabattGrund ? ` (−${Math.round(m.rabattGrund * 100)} %)` : ""}</span>
              <span style={NUM}>{eur(p.grund)}</span></div>
            {p.zeilen.map((l) => (
              <div key={l.rolle.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, background: `${l.rolle.farbe}1C`, color: l.rolle.farbe,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{l.rolle.kurz}</span>
                <span style={{ fontSize: 13.5, color: C.dim, flex: 1 }}>{l.rolle.label}
                  <span style={{ color: C.dimmer, ...NUM }}> × {zahl(l.anzahl)}</span></span>
                <span style={{ fontSize: 12.5, color: C.dimmer, width: 66, textAlign: "right", ...NUM }}>
                  {l.einzel === 0 ? "inkl." : eur(l.einzel)}</span>
                <span style={{ fontSize: 13.5, width: 88, textAlign: "right", ...NUM }}>{eur(l.netto)}</span>
              </div>))}
            <div style={{ marginTop: 16, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.ok, marginBottom: 11 }}>
                <span>Mengenstaffel ({p.st.label} Zugänge)</span><span style={NUM}>−{Math.round(p.st.rabatt * 100)} %</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 15 }}>Netto monatlich</span>
                <span style={{ fontSize: 26, fontWeight: 650, ...NUM }}>{eur(p.gesamt)}</span></div>
              {!p.zahlt && <div style={{ marginTop: 11 }}><Pill tone="warn">Status „{stat(m.status).label}" — wird nicht berechnet</Pill></div>}
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}`, display: "grid", gap: 13 }}>
              <Field label="Rabatt auf die Grundgebühr in Prozent">
                <Inp type="number" min={0} max={50} value={Math.round((m.rabattGrund || 0) * 100)}
                  onChange={(e) => akt.setzeMandantFeld(m.id, "rabattGrund", Math.min(50, Math.max(0, Number(e.target.value))) / 100)} /></Field>
              <Field label="Rechnungsanschrift"><textarea className="inp" rows={3} value={m.anschrift || ""}
                onChange={(e) => akt.setzeMandantFeld(m.id, "anschrift", e.target.value)} /></Field>
            </div>
          </div>
        </Card>

        <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <Card>
            <CardHead>Kontingente</CardHead>
            <div style={{ padding: 22 }}>
              {[["Einheiten", s.einheiten, p.t.grenzen.einheiten], ["Zugänge", p.zahlend, p.t.grenzen.personen]].map(([l, ist, max]) => {
                const pct = Math.min(100, (ist / max) * 100);
                const col = pct > 90 ? C.danger : pct > 70 ? C.warn : C.ok;
                return (<div key={l} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                    <span style={{ color: C.dim }}>{l}</span>
                    <span style={{ color: col, fontWeight: 600, ...NUM }}>{zahl(ist)} / {zahl(max)}</span></div>
                  <Balken ist={ist} soll={max} tone={pct > 90 ? "danger" : pct > 70 ? "warn" : "ok"} />
                </div>);
              })}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
                <Lab style={{ marginBottom: 10 }}>Im Tarif enthalten</Lab>
                {p.t.leistungen.map((f) => <div key={f} style={{ fontSize: 13.5, color: C.dim, marginBottom: 7 }}>
                  <span style={{ color: C.ok, marginRight: 9 }}>✓</span>{f}</div>)}
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

function BetreiberRechnungen({ db, akt }) {
  const [monat, setMonat] = useState(heute().slice(0, 7));
  const offen = db.mandanten.filter((m) => stat(m.status).zahlt);
  const summe = db.rechnungen.reduce((a, r) => a + r.brutto, 0);
  return (
    <div>
      <H1 sub="Die Rechnung entsteht aus dem Zugangsbestand zum Zeitpunkt der Erstellung. Ausgabe als PDF oder als Word-Dokument."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Inp type="month" value={monat} onChange={(e) => setMonat(e.target.value)} style={{ width: 168 }} />
          <Btn kind="primary" onClick={() => akt.rechnungslauf(monat)}>Rechnungslauf starten</Btn>
        </div>}>Rechnungen</H1>

      <KpiRow min={200}>
        <Kpi label="Erzeugte Rechnungen" value={db.rechnungen.length} />
        <Kpi label="Gesamtbetrag brutto" value={eur0(summe)} tone="accent" />
        <Kpi label="Abzurechnende Mandanten" value={offen.length} sub="Status aktiv oder gekündigt" />
        <Kpi label="Umsatzsteuer" value={`${db.betreiber.steuersatz} %`} sub={`Zahlungsziel ${db.betreiber.zahlungsziel} Tage`} />
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
          <Field label="Firma"><Inp value={db.betreiber.firma} onChange={(e) => akt.setzeBetreiber("firma", e.target.value)} /></Field>
          <Field label="Umsatzsteuer-Identifikationsnummer"><Inp value={db.betreiber.ustId} onChange={(e) => akt.setzeBetreiber("ustId", e.target.value)} /></Field>
          <Field label="IBAN"><Inp value={db.betreiber.iban} onChange={(e) => akt.setzeBetreiber("iban", e.target.value)} /></Field>
          <Field label="Umsatzsteuersatz in Prozent"><Inp type="number" value={db.betreiber.steuersatz}
            onChange={(e) => akt.setzeBetreiber("steuersatz", Number(e.target.value))} /></Field>
          <Field label="Zahlungsziel in Tagen"><Inp type="number" value={db.betreiber.zahlungsziel}
            onChange={(e) => akt.setzeBetreiber("zahlungsziel", Number(e.target.value))} /></Field>
          <Field label="Anschrift"><textarea className="inp" rows={3} value={db.betreiber.anschrift}
            onChange={(e) => akt.setzeBetreiber("anschrift", e.target.value)} /></Field>
        </div>
      </Card>
    </div>);
}

function BetreiberTarife({ db, akt }) {
  return (
    <div>
      <H1 sub="Grundgebühr und Preis je Zugangsart. Die Mengenstaffel greift auf die Summe aller kostenpflichtigen Zugänge eines Mandanten.">Tarife</H1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 18 }}>
        {db.tarife.map((t) => (
          <Card key={t.id} hover>
            <CardHead>{t.name}</CardHead>
            <div style={{ padding: 22, display: "grid", gap: 13 }}>
              <Field label="Grundgebühr je Monat"><Inp type="number" step="1" value={t.grund}
                onChange={(e) => akt.setzeTarifFeld(t.id, "grund", Number(e.target.value))} /></Field>
              {ROLLEN.filter((r) => r.berechnet).map((r) => (
                <Field key={r.id} label={`Preis je ${r.label}`}>
                  <Inp type="number" step="0.05" value={t.preis[r.id]}
                    onChange={(e) => akt.setzeTarifPreis(t.id, r.id, Number(e.target.value))} /></Field>))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Einheiten"><Inp type="number" value={t.grenzen.einheiten}
                  onChange={(e) => akt.setzeTarifGrenze(t.id, "einheiten", Number(e.target.value))} /></Field>
                <Field label="Personen"><Inp type="number" value={t.grenzen.personen}
                  onChange={(e) => akt.setzeTarifGrenze(t.id, "personen", Number(e.target.value))} /></Field>
              </div>
              <div style={{ paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
                <Lab style={{ marginBottom: 8 }}>Enthalten</Lab>
                {t.leistungen.map((f) => <div key={f} style={{ fontSize: 13, color: C.dim, marginBottom: 5 }}>
                  <span style={{ color: C.ok, marginRight: 8 }}>✓</span>{f}</div>)}
              </div>
            </div>
          </Card>))}
      </div>
      <Card style={{ marginTop: 18 }}>
        <CardHead>Mengenstaffel</CardHead>
        <div style={{ padding: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {STAFFEL.map((s) => (
            <div key={s.label} className="karte" style={{ padding: "14px 18px", minWidth: 130 }}>
              <div style={{ fontSize: 12, color: C.dimmer, ...NUM }}>{s.label} Zugänge</div>
              <div style={{ fontSize: 21, fontWeight: 650, color: s.rabatt ? C.ok : C.dim, ...NUM }}>−{Math.round(s.rabatt * 100)} %</div>
            </div>))}
        </div>
      </Card>
    </div>);
}
