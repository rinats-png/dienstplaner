
/* ==========================================================================
   BELASTBARKEIT
   Ein Plan, der heute aufgeht, sagt nichts darüber, ob er morgen noch trägt.
   Diese Ansicht beantwortet die Frage vor dem Anruf, nicht danach.
   ========================================================================== */
function Belastbarkeit({ sitz, akt, oeffneTag }) {
  const m = sitz.mandant;
  const [wochen, setWochen] = useState(8);
  const [gewaehlt, setGewaehlt] = useState(null);
  const bl = useMemo(() => belastbarkeit(m, wochen), [m, wochen]);
  const szenarien = useMemo(() => [0.05, 0.1, 0.2, 0.3].map((a) => ausfallSzenario(m, a, 14)), [m]);
  const kritisch = bl.filter((w) => w.stufe === "ohne Reserve");
  const knapp = bl.filter((w) => w.stufe === "knapp");
  const grenze = szenarien.find((s) => !s.haltbar);

  const farbe = (stufe) => stufe === "robust" ? C.ok : stufe === "knapp" ? C.warn : C.danger;
  const flaeche = (stufe) => stufe === "robust" ? C.okLight : stufe === "knapp" ? C.warnLight : C.dangerLight;

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Wie viele Ausfälle verträgt welche Woche? Gerechnet wird echte Reserve: eingeteilter Überhang plus alle, die tatsächlich einspringen dürften — ohne Ruhezeitverstoß, ohne fehlende Qualifikation."
        right={<Seg value={String(wochen)} onChange={(v) => setWochen(Number(v))}
          options={[{ id: "4", label: "4 Wochen" }, { id: "8", label: "8 Wochen" },
            { id: "13", label: "Quartal" }]} />}>
        Belastbarkeit</H1>

      <KpiRow min={180}>
        <Kpi label="Wochen ohne Reserve" value={kritisch.length}
          tone={kritisch.length ? "danger" : "ok"}
          sub={kritisch.length ? `ab ${fKurz(kritisch[0].von)}` : "alle Wochen tragen"} />
        <Kpi label="Knappe Wochen" value={knapp.length} tone={knapp.length ? "warn" : "text"}
          sub="ein einziger Ausfall genügt" />
        <Kpi label="Belastungsgrenze" value={grenze ? `${Math.round(grenze.anteil * 100)} %` : "über 30 %"}
          tone={grenze && grenze.anteil <= 0.1 ? "danger" : grenze && grenze.anteil <= 0.2 ? "warn" : "ok"}
          sub="Ausfall, ab dem der Plan reißt" />
      </KpiRow>

      {/* ------------------------ Wochenbild ------------------------ */}
      <Card style={{ marginTop: 20 }}>
        <CardHead right={<Lab>Reserve je Woche</Lab>}>Wo bricht es zuerst</CardHead>
        <div style={{ padding: 18 }}>
          {bl.map((w) => (
            <div key={w.kw} onClick={() => setGewaehlt(gewaehlt === w.kw ? null : w.kw)}
              style={{ marginBottom: 6, borderRadius: 10, cursor: "pointer",
                background: gewaehlt === w.kw ? flaeche(w.stufe) : "transparent",
                outline: gewaehlt === w.kw ? `1.5px solid ${farbe(w.stufe)}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px" }}>
                <span style={{ fontSize: 12.5, color: C.dim, minWidth: 76, ...NUM }}>
                  ab {fKurz(w.von)}</span>
                <div style={{ flex: 1, display: "flex", gap: 3 }}>
                  {w.zeilen.map((z) => (
                    <div key={z.da.id} title={`${z.da.name}: trägt ${z.min} Ausfälle`}
                      style={{ flex: 1, height: 26, borderRadius: 6, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 11, fontWeight: 650,
                        background: `${farbe(z.stufe)}1C`, color: farbe(z.stufe),
                        borderBottom: `2px solid ${farbe(z.stufe)}` }}>
                      {z.da.kurz} {z.min}</div>))}
                </div>
                <span style={{ minWidth: 96, textAlign: "right", fontSize: 12.5, fontWeight: 600,
                  color: farbe(w.stufe) }}>{w.stufe}</span>
              </div>

              {gewaehlt === w.kw && (
                <div style={{ padding: "4px 12px 14px" }}>
                  <table className="raster" style={{ background: C.flaeche, borderRadius: 8 }}>
                    <thead><tr>{["Dienst", "trägt mindestens", "im Schnitt", "schwächster Tag"].map((h, i) => (
                      <th key={i} style={{ textAlign: i ? "right" : "left" }}>{h}</th>))}</tr></thead>
                    <tbody>
                      {w.zeilen.slice().sort((a, b) => a.min - b.min).map((z) => (
                        <tr key={z.da.id}>
                          <td><Zelle da={z.da} size={22} /> <span style={{ marginLeft: 8 }}>{z.da.name}</span></td>
                          <td style={{ textAlign: "right", fontWeight: 650, color: farbe(z.stufe), ...NUM }}>
                            {z.min} Ausfälle</td>
                          <td style={{ textAlign: "right", color: C.dim, ...NUM }}>{n1(z.schnitt)}</td>
                          <td style={{ textAlign: "right", ...NUM }}>
                            {z.minTag ? (
                              <button className="btn btn-sm btn-quiet" onClick={(e) => { e.stopPropagation();
                                oeffneTag(z.minTag); }}>{fKurz(z.minTag)}</button>) : "—"}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>)}
            </div>))}
        </div>
        <div style={{ padding: "0 20px 18px", fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
          Die Zahl im Balken ist die Anzahl gleichzeitiger Ausfälle, die dieser Dienst in der
          schwächsten Schicht der Woche verkraftet. Null bedeutet: der nächste Krankheitsfall
          führt zur Unterbesetzung.
        </div>
      </Card>

      {/* ---------------------- Ausfallszenarien --------------------- */}
      <Lab style={{ margin: "24px 0 12px" }}>Was passiert bei einer Krankheitswelle</Lab>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
        {szenarien.map((s) => (
          <Card key={s.anteil} style={{ padding: 20,
            borderColor: s.haltbar ? C.line : C.danger }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 12 }}>
              <Rubrik>{Math.round(s.anteil * 100)} % fallen aus</Rubrik>
              <Pill size="sm" tone={s.haltbar ? "ok" : "danger"}>{s.haltbar ? "hält" : "reißt"}</Pill>
            </div>
            <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.04em", ...NUM,
              color: s.haltbar ? C.text : C.danger }}>+{s.neu}</div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>zusätzliche Befunde</div>
            <div style={{ marginTop: 16, paddingTop: 13, borderTop: `1px solid ${C.lineSoft}`,
              display: "grid", gap: 6, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.dim }}>Betroffene</span><span style={NUM}>{s.betroffen} Personen</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.dim }}>Unterbesetzte Dienste</span>
                <span style={{ ...NUM, color: s.unter ? C.warn : C.dim }}>{s.unter}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.dim }}>Ganz ohne Besetzung</span>
                <span style={{ ...NUM, color: s.leer ? C.danger : C.dim }}>{s.leer}</span></div>
            </div>
          </Card>))}
      </div>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 14, lineHeight: 1.55, maxWidth: 760 }}>
        Gerechnet über die nächsten vierzehn Tage. Der Ausfall wird gleichmäßig über die Belegschaft
        verteilt, nicht zufällig — ein Zufallsergebnis wäre bei jedem Aufruf anders und damit
        wertlos. Eine echte Welle trifft meist eine Einheit stärker; der reale Verlauf ist also
        eher schlechter als hier gezeigt.
      </div>
    </div>);
}

/* ==========================================================================
   AUSSTIEGSSICHERHEIT
   Wer seine Dienstplanung auf ein System stellt, muss jederzeit vollständig
   wieder herauskommen. Diese Ansicht beantwortet die Frage nach der
   Abhängigkeit vom Anbieter — bevor sie im Vertragsgespräch gestellt wird.
   ========================================================================== */
function Datenmitnahme({ sitz, akt }) {
  const m = sitz.mandant;
  const tabellen = useMemo(() => vollExport(m), [m]);
  const namen = { personen: "Personalstamm", dienstplan: "Dienstplan des laufenden Jahres",
    abwesenheiten: "Abwesenheiten", erfassung: "Erfasste Zeiten", anfragen: "Anträge und Entscheidungen",
    qualifikationen: "Qualifikationen und Nachweise", protokoll: "Änderungsprotokoll" };
  const erklaerung = {
    dienstplan: "Ausgeschrieben Tag für Tag. In CENTRIC wird der Plan aus Zyklus und Versatz gerechnet — für andere Systeme muss er als Liste vorliegen.",
    protokoll: "Wer hat wann was geändert. Für Prüfungen und den Betriebsrat.",
  };

  return (
    <div>
      <H1 rubrik="Verwaltung"
        sub="Alle Daten dieses Betriebs, jederzeit vollständig und in offenem Format. Keine Sperre, keine Gebühr, kein Antrag — das gehört zum Vertrauen, das eine Dienstplanung braucht."
        right={<Btn kind="primary" onClick={akt.exportAlles}>Alles herunterladen</Btn>}>
        Datenmitnahme</H1>

      <Card>
        <CardHead right={<Lab>{Object.values(tabellen).reduce((a, t) => a + t.length, 0)} Zeilen insgesamt</Lab>}>
          Was ausgegeben wird</CardHead>
        {Object.entries(tabellen).map(([k, t], i) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 20px",
            borderBottom: i < Object.keys(tabellen).length - 1 ? `1px solid ${C.lineSoft}` : "none",
            flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{namen[k] || k}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>
                {erklaerung[k] || (t.length ? Object.keys(t[0]).slice(0, 6).join(" · ") : "keine Daten")}
              </div>
            </div>
            <span style={{ fontSize: 13.5, color: C.dim, minWidth: 90, textAlign: "right", ...NUM }}>
              {zahl(t.length)} Zeilen</span>
            <Btn size="sm" disabled={!t.length} onClick={() => akt.exportTabelle(k, t)}>Einzeln</Btn>
          </div>))}
      </Card>

      <Card style={{ marginTop: 18, padding: 22 }}>
        <Lab style={{ marginBottom: 11 }}>Was das bedeutet</Lab>
        <Haken punkte={[
          "Alle Dateien sind CSV mit Semikolon und Byte-Reihenfolge-Markierung — Excel öffnet sie ohne Nachfrage.",
          "Der Dienstplan ist Tag für Tag ausgeschrieben, nicht als Regel. Er lässt sich in jedes andere System einlesen.",
          "Personalnummern bleiben erhalten, damit die Zuordnung zur Lohnabrechnung nicht verloren geht.",
          "Die Ausgabe ist jederzeit möglich, ohne Ankündigung und ohne zusätzliche Kosten.",
        ]} />
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 16, lineHeight: 1.6, maxWidth: 740 }}>
          Eine Dienstplanung ist betriebskritisch. Die Frage, wie man wieder herauskommt, gehört
          deshalb an den Anfang eines Vertragsgesprächs und nicht an dessen Ende. Wer sie nicht
          beantworten kann, sollte kein betriebskritisches System verkaufen.
        </div>
      </Card>
    </div>);
}
