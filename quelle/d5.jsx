
/* ==========================================================================
   MANDANTENRECHNER
   Aus der Zahl der Beschäftigten wird ein Vorschlag für die Zugangsverteilung
   und daraus der monatliche Preis. Die Empfehlung ist ein Erfahrungswert und
   wird als solcher gekennzeichnet — nur die Betriebsratsgröße folgt einer
   gesetzlichen Regel.
   ========================================================================== */

/**
 * Größe des Betriebsrats nach § 9 Betriebsverfassungsgesetz.
 * Der Zugang ist kostenfrei, die Zahl aber für die Planung des Betreibers
 * relevant — deshalb wird sie korrekt ausgewiesen statt geschätzt.
 */
const BR_STAFFEL = [
  [5, 20, 1], [21, 50, 3], [51, 100, 5], [101, 200, 7], [201, 400, 9],
  [401, 700, 11], [701, 1000, 13], [1001, 1500, 15], [1501, 2000, 17],
  [2001, 2500, 19], [2501, 3000, 21], [3001, 3500, 23], [3501, 4000, 25],
  [4001, 4500, 27], [4501, 5000, 29], [5001, 6000, 31], [6001, 7000, 33],
  [7001, 9000, 35],
];
/**
 * Über 9.000 Beschäftigten wächst der Betriebsrat je angefangene weitere
 * 3.000 um zwei Mitglieder — die Staffel endet also nicht, sie wird zur Formel.
 */
const betriebsratGroesse = (n) => {
  if (n < 5) return 0;
  const t = BR_STAFFEL.find(([von, bis]) => n >= von && n <= bis);
  if (t) return t[2];
  return 35 + Math.ceil((n - 9000) / 3000) * 2;
};

/**
 * Vorschlag für die Zugangsverteilung.
 *
 * Grundlagen:
 *   Organisationsleitung — genau eine, kostenfrei
 *   Planer              — Geschäftszimmer, etwa eine Person je 120 Beschäftigte,
 *                          ab 250 zusätzlich eine Vertretung
 *   Sub-Planer          — die Schichtverantwortlichen, eine je Einheit,
 *                          ab acht Einheiten zusätzlich eine Vertretung
 *   Betriebsrat         — nach § 9 BetrVG, kostenfrei
 *   Mitarbeiter         — alle Übrigen im Schichtdienst
 */
function zugangsvorschlag(beschaeftigte, einheiten, brWaehlen = true) {
  // beschaeftigte = Gesamtbelegschaft einschließlich Leitung und Planung
  const n = Math.max(0, Math.round(beschaeftigte));
  const e = Math.max(1, Math.round(einheiten));
  const leitung = n > 0 ? 1 : 0;
  const planer = n === 0 ? 0 : n <= 40 ? 1 : Math.ceil(n / 120) + (n > 250 ? 1 : 0);
  const subplaner = n === 0 ? 0 : Math.min(n, e + (e >= 8 ? 1 : 0));
  const betriebsrat = brWaehlen ? Math.min(betriebsratGroesse(n), n) : 0;
  // n ist die Gesamtbelegschaft. Leitung und Planer sitzen im Geschäftszimmer,
  // Sub-Planer fahren mit — alle Übrigen erhalten einen Mitarbeiterzugang.
  const mitarbeiter = Math.max(0, n - leitung - planer - subplaner);
  return { leitung, planer, subplaner, mitarbeiter, betriebsrat,
    gesamt: leitung + planer + subplaner + mitarbeiter,
    begruendung: {
      leitung: "Eine Organisationsleitung je Betrieb — kostenfrei.",
      planer: n <= 40 ? "Bei dieser Größe genügt eine Person im Geschäftszimmer."
        : n > 250 ? "Etwa eine Person je 120 Beschäftigte, zuzüglich einer Vertretung."
        : "Etwa eine Person je 120 Beschäftigte.",
      subplaner: e >= 8 ? `Eine Schichtverantwortung je ${e} Einheiten, zuzüglich einer Vertretung.`
        : `Eine Schichtverantwortung je Einheit.`,
      betriebsrat: n < 5 ? "Unter fünf Beschäftigten ist kein Betriebsrat wählbar."
        : `${betriebsratGroesse(n)} Mitglieder nach § 9 Betriebsverfassungsgesetz — Zugang kostenfrei.`,
      mitarbeiter: "Alle Übrigen der Belegschaft.",
    } };
}

/** Monatspreis für eine gegebene Verteilung und einen Tarif. */
function preisFuer(tarif, v) {
  const zahlend = ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (v[r.id] || 0), 0);
  const st = staffel(zahlend);
  const zeilen = ROLLEN.filter((r) => !r.extern).map((r) => {
    const anzahl = v[r.id] || 0;
    const einzel = tarif.preis[r.id] || 0;
    return { rolle: r, anzahl, einzel, brutto: anzahl * einzel,
      netto: Math.round(anzahl * einzel * (1 - st.rabatt) * 100) / 100 };
  });
  const zugaenge = Math.round(zeilen.reduce((a, z) => a + z.netto, 0) * 100) / 100;
  const gesamt = Math.round((tarif.grund + zugaenge) * 100) / 100;
  return { tarif, st, zeilen, zugaenge, zahlend, grund: tarif.grund, gesamt,
    jePerson: v.gesamt > 0 ? Math.round((gesamt / v.gesamt) * 100) / 100 : 0,
    passt: v.gesamt <= tarif.grenzen.personen };
}

/* ------------------------------- Die Ansicht ----------------------------- */
function Mandantenrechner({ db }) {
  const [n, setN] = useState(80);
  const [e, setE] = useState(4);
  const [eingabe, setEingabe] = useState("");
  const [br, setBr] = useState(true);
  const [eigen, setEigen] = useState(null);      // manuell übersteuerte Verteilung

  const vorschlag = useMemo(() => zugangsvorschlag(n, e, br), [n, e, br]);
  const v = eigen || vorschlag;
  const preise = db.tarife.map((t) => preisFuer(t, v));
  const passende = preise.filter((p) => p.passt);
  const ueberGrenze = passende.length === 0;
  // Über der größten Tarifgrenze wird der größte Tarif als Grundlage genommen
  // und ausdrücklich als Richtwert gekennzeichnet.
  const guenstigster = (passende.length ? passende : [preise.reduce((a, b) =>
    (a.tarif.grenzen.personen > b.tarif.grenzen.personen ? a : b))])
    .sort((a, b) => a.gesamt - b.gesamt)[0];
  const kurve = useMemo(() => {
    const punkte = [];
    for (const anzahl of [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000]) {
      const vv = zugangsvorschlag(anzahl, Math.max(2, Math.round(anzahl / 20)), br);
      const alle = db.tarife.map((t) => preisFuer(t, vv));
      const beste = (alle.filter((p) => p.passt).length ? alle.filter((p) => p.passt) : alle)
        .sort((a, b) => a.gesamt - b.gesamt)[0];
      if (beste) punkte.push({ label: anzahl >= 1000 ? `${anzahl / 1000}k` : String(anzahl),
        y: Math.round(beste.gesamt / vv.gesamt * 100) / 100 });
    }
    return punkte;
  }, [db, br]);

  const setzeEigen = (k, wert) => setEigen({ ...v, [k]: Math.max(0, wert),
    gesamt: ROLLEN.filter((r) => r.berechnet).reduce((a, r) =>
      a + (r.id === k ? Math.max(0, wert) : (v[r.id] || 0)), 0) });

  return (
    <div>
      <H1 rubrik="Betreiber"
        sub="Aus der Zahl der Beschäftigten ergibt sich ein Vorschlag für die Zugangsverteilung und daraus der Monatspreis. Die Empfehlung ist ein Erfahrungswert — nur die Betriebsratsgröße folgt einer gesetzlichen Regel."
        right={eigen && <Btn kind="quiet" onClick={() => setEigen(null)}>Vorschlag wiederherstellen</Btn>}>
        Mandantenrechner</H1>

      {/* Eingaben */}
      <Card style={{ padding: 26, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 26 }}>
          <div>
            <Lab style={{ marginBottom: 9 }}>Beschäftigte insgesamt</Lab>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-.04em", ...NUM }}>{zahl(n)}</span>
              <span style={{ fontSize: 14, color: C.dimmer }}>Personen</span>
            </div>
            {/* Der Regler arbeitet logarithmisch, damit von 1 bis 20.000 alles
                mit gleicher Feinheit erreichbar bleibt. */}
            <input type="range" min={0} max={1000} value={Math.round(Math.log10(Math.max(1, n)) / Math.log10(20000) * 1000)}
              style={{ width: "100%" }}
              onChange={(ev) => {
                const p = Number(ev.target.value) / 1000;
                const roh = Math.pow(20000, p);
                const stufe = roh < 50 ? 1 : roh < 200 ? 5 : roh < 1000 ? 10 : roh < 5000 ? 50 : 100;
                setN(Math.max(1, Math.round(roh / stufe) * stufe)); setEigen(null);
              }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              {[25, 100, 500, 2000, 10000].map((x) => (
                <Btn key={x} size="sm" kind={n === x ? "primary" : "plain"}
                  onClick={() => { setN(x); setEigen(null); }}>{zahl(x)}</Btn>))}
              <Inp type="number" min={1} placeholder="frei" value={eingabe} style={{ width: 104 }}
                onChange={(ev) => {
                  setEingabe(ev.target.value);
                  const w = Number(ev.target.value);
                  if (w >= 1) { setN(Math.round(w)); setEigen(null); }
                }} />
            </div>
          </div>
          <div>
            <Lab style={{ marginBottom: 9 }}>Einheiten oder Schichtgruppen</Lab>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-.04em", ...NUM }}>{e}</span>
              <span style={{ fontSize: 14, color: C.dimmer }}>Gruppen</span>
            </div>
            <input type="range" min={1} max={40} value={Math.min(40, e)} style={{ width: "100%" }}
              onChange={(ev) => { setE(Number(ev.target.value)); setEigen(null); }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Inp type="number" min={1} value={e} style={{ width: 96 }}
                onChange={(ev) => { const w = Number(ev.target.value); if (w >= 1) { setE(Math.round(w)); setEigen(null); } }} />
              <span style={{ fontSize: 12.5, color: C.dimmer }}>frei eingebbar</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 10, lineHeight: 1.5 }}>
              Ergibt sich aus dem Schichtmodell: vier bei 4x4, fünf beim 5-Schicht-Modell,
              acht bis elf bei Stufenmodellen. Große Betriebe führen häufig mehrere Standorte
              mit eigenen Gruppen.
            </div>
          </div>
          <div>
            <Lab style={{ marginBottom: 9 }}>Betriebsrat</Lab>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 12 }}>
              <Schalter an={br} onChange={() => { setBr(!br); setEigen(null); }} />
              <span style={{ fontSize: 14.5 }}>{br ? "vorhanden" : "nicht vorhanden"}</span>
            </label>
            <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              {n < 5 ? "Unter fünf Beschäftigten ist kein Betriebsrat wählbar."
                : `Bei ${n} Beschäftigten sind es ${betriebsratGroesse(n)} Mitglieder nach § 9 BetrVG. Der Zugang ist kostenfrei.`}
            </div>
          </div>
        </div>
      </Card>

      {/* Vorschlag */}
      <Card style={{ marginBottom: 20 }}>
        <CardHead right={<Lab>{eigen ? "eigene Verteilung" : "Vorschlag"}</Lab>}>Zugangsverteilung</CardHead>
        {ROLLEN.filter((r) => !r.extern).map((r) => {
          const anzahl = v[r.id] || 0;
          const preis = (guenstigster ? guenstigster.tarif.preis[r.id] : 0) || 0;
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 22px",
              borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
              <span style={{ width: 34, height: 34, borderRadius: 12, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                background: `${r.farbe}18`, color: r.farbe }}>{r.kurz}</span>
              <div style={{ flex: 1, minWidth: 190 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, lineHeight: 1.45 }}>
                  {vorschlag.begruendung[r.id]}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Btn size="sm" kind="quiet" onClick={() => setzeEigen(r.id, anzahl - 1)}>−</Btn>
                <span style={{ fontSize: 21, fontWeight: 650, minWidth: 44, textAlign: "center", ...NUM }}>
                  {anzahl}</span>
                <Btn size="sm" kind="quiet" onClick={() => setzeEigen(r.id, anzahl + 1)}>+</Btn>
              </div>
              <div style={{ minWidth: 110, textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600, ...NUM }}>
                  {preis === 0 ? "kostenfrei" : `${eur(anzahl * preis)}`}</div>
                {preis > 0 && <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                  {eur(preis)} je Zugang</div>}
              </div>
            </div>);
        })}
        <div style={{ padding: "14px 22px", display: "flex", justifyContent: "space-between",
          fontSize: 13.5, color: C.dim, flexWrap: "wrap", gap: 10 }}>
          <span>{v.gesamt} Zugänge insgesamt · davon {preise[0].zahlend} kostenpflichtig</span>
          <span>Mengenstaffel {preise[0].st.label} · {Math.round(preise[0].st.rabatt * 100)} % Nachlass</span>
        </div>
      </Card>

      {/* Tarifvergleich */}
      {ueberGrenze && (
        <Card style={{ padding: 22, marginBottom: 16, background: C.warnLight }}>
          <div style={{ fontSize: 15.5, fontWeight: 650, color: C.warn, marginBottom: 8 }}>
            Über der größten Tarifgrenze</div>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, maxWidth: 720 }}>
            Mit {zahl(v.gesamt)} Zugängen liegt dieser Betrieb über der Grenze von
            {" "}{zahl(Math.max(...db.tarife.map((t) => t.grenzen.personen)))} Personen im größten Tarif.
            Die Zahl unten ist eine <b>Hochrechnung nach den Enterprise-Sätzen</b> — ein Betrieb dieser
            Größe bekommt ein eigenes Angebot mit verhandelter Grundgebühr, eigenem Betriebssystem
            und Auftragsverarbeitung.
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
            Als Verhandlungsgrundlage taugt der Wert trotzdem: Er zeigt, was die reine Mengenrechnung
            ergäbe, bevor über Grundgebühr und Leistungsumfang gesprochen wird.
          </div>
        </Card>)}

      <Lab style={{ marginBottom: 12 }}>Was es monatlich kostet</Lab>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
        {preise.map((p) => {
          const best = guenstigster && p.tarif.id === guenstigster.tarif.id;
          return (
            <Card key={p.tarif.id} glanz={best}
              style={{ padding: 24, opacity: p.passt ? 1 : .5,
                outline: best ? `2px solid ${C.ok}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Rubrik>{p.tarif.name}</Rubrik>
                {best && !ueberGrenze && <Pill size="sm" tone="ok">günstigster</Pill>}
                {best && ueberGrenze && <Pill size="sm" tone="warn">Hochrechnung</Pill>}
                {!p.passt && !best && <Pill size="sm" tone="danger">zu klein</Pill>}
              </div>
              <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: "-.04em", ...NUM }}>
                {eur0(p.gesamt)}</div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>je Monat, netto</div>
              <div style={{ marginTop: 18, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}`,
                display: "grid", gap: 7, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.dimmer }}>Grundgebühr</span>
                  <span style={NUM}>{eur(p.grund)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.dimmer }}>Zugänge</span>
                  <span style={NUM}>{eur(p.zugaenge)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>je Person</span><span style={NUM}>{eur(p.jePerson)}</span></div>
              </div>
              {!p.passt && (
                <div style={{ fontSize: 12.5, color: best ? C.warn : C.danger, marginTop: 12, lineHeight: 1.45 }}>
                  {best ? `Über der Grenze von ${zahl(p.tarif.grenzen.personen)} Personen — Richtwert für ein eigenes Angebot.`
                    : `Grenze bei ${zahl(p.tarif.grenzen.personen)} Personen — für diesen Betrieb zu klein.`}
                </div>)}
              <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
                {p.tarif.leistungen.slice(0, 3).join(" · ")}
              </div>
            </Card>);
        })}
      </div>

      {/* Aufstellung und Kurve */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18, marginTop: 20 }}>
        {guenstigster && (
          <Card>
            <CardHead right={<Lab>{guenstigster.tarif.name}{ueberGrenze ? " · Richtwert" : ""}</Lab>}>
              Aufstellung</CardHead>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Zugangsart", "Anzahl", "Einzeln", "Summe"].map((h, i) => (
                <th key={i} style={{ textAlign: i ? "right" : "left", padding: "11px 20px",
                  borderBottom: `1px solid ${C.lineSoft}` }}><Lab>{h}</Lab></th>))}</tr></thead>
              <tbody>
                {guenstigster.zeilen.filter((z) => z.anzahl > 0).map((z) => (
                  <tr key={z.rolle.id}>
                    <td style={{ padding: "10px 20px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13.5 }}>
                      {z.rolle.label}</td>
                    <td style={{ padding: "10px 20px", borderBottom: `1px solid ${C.lineSoft}`,
                      textAlign: "right", fontSize: 13.5, ...NUM }}>{z.anzahl}</td>
                    <td style={{ padding: "10px 20px", borderBottom: `1px solid ${C.lineSoft}`,
                      textAlign: "right", fontSize: 13, color: C.dim, ...NUM }}>
                      {z.einzel === 0 ? "—" : eur(z.einzel)}</td>
                    <td style={{ padding: "10px 20px", borderBottom: `1px solid ${C.lineSoft}`,
                      textAlign: "right", fontSize: 13.5, fontWeight: 600, ...NUM }}>
                      {z.einzel === 0 ? "kostenfrei" : eur(z.netto)}</td>
                  </tr>))}
                <tr>
                  <td colSpan={3} style={{ padding: "12px 20px", fontSize: 13.5, color: C.dim }}>
                    Grundgebühr {guenstigster.tarif.name}</td>
                  <td style={{ padding: "12px 20px", textAlign: "right", fontSize: 13.5, ...NUM }}>
                    {eur(guenstigster.grund)}</td>
                </tr>
                <tr style={{ background: C.bg }}>
                  <td colSpan={3} style={{ padding: "14px 20px", fontSize: 15, fontWeight: 650 }}>
                    {ueberGrenze ? "Richtwert monatlich netto" : "Monatlich netto"}</td>
                  <td style={{ padding: "14px 20px", textAlign: "right", fontSize: 17, fontWeight: 650, ...NUM }}>
                    {eur(guenstigster.gesamt)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ padding: "14px 20px", fontSize: 12.5, color: C.dimmer, lineHeight: 1.55 }}>
              Zuzüglich Umsatzsteuer. Die Mengenstaffel von {Math.round(guenstigster.st.rabatt * 100)} %
              ist bereits abgezogen. Organisationsleitung und Betriebsrat sind in jedem Tarif kostenfrei.
            </div>
          </Card>)}

        <Card style={{ padding: 24 }}>
          <CardHead style={{ padding: 0, border: "none", marginBottom: 16 }}
            right={<Lab>günstigster Tarif</Lab>}>Preis je Person nach Betriebsgröße</CardHead>
          <LinienDiagramm daten={kurve} farbe={C.ok} nulllinie={false} einheit=" €" hoehe={150} />
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14, lineHeight: 1.55 }}>
            Mit der Betriebsgröße sinkt der Preis je Person — durch die Mengenstaffel und weil sich
            Grundgebühr und Planungszugänge auf mehr Schultern verteilen.
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 20, padding: 22 }}>
        <Lab style={{ marginBottom: 11 }}>Wie der Vorschlag zustande kommt</Lab>
        <Haken punkte={[
          "Organisationsleitung: genau eine je Betrieb, kostenfrei.",
          "Planer sitzen im Geschäftszimmer und fahren keine Schicht — etwa eine Person je 120 Beschäftigte, ab 250 zusätzlich eine Vertretung.",
          "Sub-Planer sind die Schichtverantwortlichen und arbeiten mit — eine je Einheit, ab acht Einheiten zusätzlich eine Vertretung.",
          "Betriebsratsgröße nach § 9 Betriebsverfassungsgesetz, Zugang kostenfrei.",
          "Alle Übrigen erhalten einen Mitarbeiterzugang.",
        ]} />
        <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14, lineHeight: 1.55 }}>
          Die Werte für Planer und Sub-Planer sind Erfahrungswerte, keine Norm. Sie lassen sich oben
          mit den Plus- und Minus-Schaltflächen überschreiben — die Kosten rechnen sofort mit.
        </div>
      </Card>
    </div>);
}
