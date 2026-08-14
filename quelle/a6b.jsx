
/* ==========================================================================
   KRANKMELDUNG UND ERSATZSUCHE
   Das häufigste Ereignis im Schichtbetrieb — und der eigentliche Prüfstein.
   ========================================================================== */
function Ersatzliste({ sitz, datum, dienstId, akt, onFertig }) {
  const m = sitz.mandant;
  const [alle, setAlle] = useState(false);
  const [begruendung, setBegruendung] = useState(null);
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const liste = useMemo(() => ersatzVorschlaege(m, datum, dienstId), [m, datum, dienstId]);
  const moeglich = liste.filter((x) => x.moeglich);
  const gesperrt = liste.filter((x) => !x.moeglich);
  const gezeigt = alle ? moeglich : moeglich.slice(0, 6);

  return (
    <div>
      <div className="karte" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center",
        gap: 14, flexWrap: "wrap" }}>
        <Zelle da={da} size={38} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{da.name} · {fKurz(datum)}</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{da.start}–{da.ende} · {da.ort}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 650, color: b.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {b.anzahl}<span style={{ fontSize: 13, color: C.dimmer, fontWeight: 500 }}>/{b.soll}</span></div>
          <div style={{ fontSize: 11.5, color: C.dimmer }}>{b.diff < 0 ? `${Math.abs(b.diff)} fehlen` : "gedeckt"}</div>
        </div>
      </div>
      {b.qual && b.qual.filter((q) => !q.ok).length > 0 && (
        <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
          {b.qual.filter((q) => !q.ok).map((q) => {
            const qn = m.qualifikationen.find((x) => x.id === q.qid);
            return <Pill key={q.qid} size="sm" tone="danger">fehlt: {qn ? qn.name : q.qid} ({q.ist}/{q.noetig})</Pill>; })}
        </div>)}

      <Lab style={{ marginBottom: 10 }}>Vorschläge · nach Eignung sortiert</Lab>
      {gezeigt.length === 0 && <div style={{ fontSize: 13.5, color: C.dimmer, padding: "10px 0" }}>
        Niemand verfügbar, der Ruhezeit und Einschränkungen einhält.</div>}
      {gezeigt.map((x, i) => (
        <div key={x.person.id} className="karte" style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px" }}>
          <span style={{ width: 26, height: 26, borderRadius: 9, background: i === 0 ? C.okLight : C.bg,
            color: i === 0 ? C.ok : C.dimmer, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11.5, fontWeight: 700, flexShrink: 0, ...NUM }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{x.person.vorname} {x.person.nachname}</div>
            <div style={{ fontSize: 12, color: C.dimmer, lineHeight: 1.4 }}>{x.gruende.slice(0, 3).join(" · ")}</div>
          </div>
          <Btn size="sm" kind={i === 0 ? "primary" : "plain"}
            onClick={() => { akt.setzeEinsprung(x.person.id, datum, dienstId); if (onFertig) onFertig(); }}>
            Einteilen</Btn>
          <button onClick={() => setBegruendung(begruendung === x.person.id ? null : x.person.id)}
            aria-label="Warum steht diese Person hier?"
            style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer",
              fontSize: 13, padding: "0 6px" }}>{begruendung === x.person.id ? "▴" : "warum?"}</button>
        </div>
        {begruendung === x.person.id && (
          <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.lineSoft}`, marginTop: 2 }}>
            <div style={{ fontSize: 11.5, color: C.dim, padding: "11px 0 8px", lineHeight: 1.5 }}>
              Diese Reihenfolge entsteht aus nachvollziehbaren Kriterien, nicht aus einem Modell.
              Jeder Punkt lässt sich einzeln prüfen.
            </div>
            {rangGruende(m, x, datum, dienstId).map((g, k) => (
              <div key={k} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "4px 0",
                fontSize: 12.5, lineHeight: 1.45 }}>
                <span style={{ flexShrink: 0, fontWeight: 700, width: 12, textAlign: "center",
                  color: g.art === "plus" ? C.ok : g.art === "minus" ? C.warn : C.dim }}>
                  {g.art === "plus" ? "+" : g.art === "minus" ? "−" : "·"}</span>
                <span style={{ color: g.art === "hinweis" ? C.dim : C.text }}>{g.text}</span>
              </div>))}
          </div>)}
        </div>))}
      {moeglich.length > 6 && (
        <Btn size="sm" kind="quiet" onClick={() => setAlle(!alle)} style={{ marginTop: 4 }}>
          {alle ? "Weniger zeigen" : `Alle ${moeglich.length} zeigen`}</Btn>)}

      {moeglich.length === 0 && (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: C.dangerLight }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Keine Kraft einsetzbar</div>
          <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 14 }}>
            Damit endet die automatische Suche. Der nächste Schritt ist die Eskalation:
            erweiterte Anfrage an mehrere Personen oder — wenn auch das nicht trägt — die
            dokumentierte Unterschreitung.
          </div>
          <Btn kind="danger" onClick={() => akt.oeffneEskalation(datum, dienstId)}>Eskalation öffnen</Btn>
        </div>)}
      {moeglich.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Btn size="sm" kind="quiet" onClick={() => akt.oeffneEskalation(datum, dienstId)}>Stattdessen eskalieren</Btn>
        </div>)}

      {gesperrt.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 10 }}>Nicht einsetzbar · {gesperrt.length}</Lab>
          {gesperrt.slice(0, 5).map((x) => (
            <div key={x.person.id} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ color: C.dim, minWidth: 150 }}>{x.person.nachname}, {x.person.vorname}</span>
              <span style={{ color: C.danger }}>{x.hindernisse[0]}</span>
            </div>))}
          {gesperrt.length > 5 && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 6 }}>
            und {gesperrt.length - 5} weitere</div>}
        </div>)}
    </div>);
}

function Krankmeldung({ sitz, akt, onClose, vorauswahl }) {
  const m = sitz.mandant;
  const [schritt, setSchritt] = useState(vorauswahl ? 2 : 1);
  const [f, setF] = useState({ personId: vorauswahl || "", von: heute(), bis: heute(), notiz: "" });
  const [luecken, setLuecken] = useState([]);
  const [idx, setIdx] = useState(0);
  const eigene = sitz.person && !darf(sitz, "staff.edit") && !darfEinheit(sitz, sitz.person.bereich);

  const melden = () => {
    const p = m.personen.find((x) => x.id === f.personId);
    if (!p || f.bis < f.von) return;
    const offen = [];
    for (let d = f.von; d <= f.bis; d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (t.dienstId) offen.push({ datum: d, dienstId: t.dienstId });
    }
    akt.krankmelden(f.personId, f.von, f.bis, f.notiz);
    setLuecken(offen); setIdx(0); setSchritt(offen.length ? 3 : 4);
  };

  const kandidaten = m.personen.filter((p) => imDienst(p, heute()) &&
    (darf(sitz, "staff.edit") || darfEinheit(sitz, einheitAm(p, heute())) || p.id === sitz.person.id));

  return (
    <Sheet open onClose={onClose} titel="Krankmeldung" width={720}>
      {schritt <= 2 && (
        <div style={{ display: "grid", gap: 15 }}>
          <Field label="Person">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— wählen —</option>
              {kandidaten.map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</Sel></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Von"><Inp type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></Field>
            <Field label="Voraussichtlich bis"><Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
          </div>
          <Field label="Anmerkung" hint="Kein Grund, keine Diagnose — nur was für die Planung nötig ist.">
            <Inp value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} /></Field>
          <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
            Die Meldung wirkt sofort. Anschließend zeigt die App jede entstandene Lücke und schlägt Ersatz vor.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.personId} onClick={melden}>Krank melden</Btn>
          </div>
        </div>)}

      {schritt === 3 && luecken[idx] && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <Pill tone="danger">Lücke {idx + 1} von {luecken.length}</Pill>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn size="sm" kind="quiet" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹</Btn>
              <Btn size="sm" kind="quiet" onClick={() => (idx + 1 < luecken.length ? setIdx(idx + 1) : setSchritt(4))}>
                {idx + 1 < luecken.length ? "Überspringen ›" : "Fertig"}</Btn>
            </div>
          </div>
          <Ersatzliste sitz={sitz} datum={luecken[idx].datum} dienstId={luecken[idx].dienstId} akt={akt}
            onFertig={() => (idx + 1 < luecken.length ? setIdx(idx + 1) : setSchritt(4))} />
        </div>)}

      {schritt === 4 && (
        <div style={{ textAlign: "center", padding: "26px 0" }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Krankmeldung erfasst</div>
          <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 20, lineHeight: 1.5 }}>
            {luecken.length === 0
              ? "Es waren keine Dienste betroffen."
              : "Die Planung wurde benachrichtigt. Verbliebene Lücken erscheinen in der Prüfung."}
          </div>
          <Btn kind="primary" onClick={onClose}>Schließen</Btn>
        </div>)}
    </Sheet>);
}

/* ============================== NACHRICHTEN ============================== */
function Nachrichten({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const meine = (m.nachrichten || []).filter((n) => n.personId === sitz.person.id);
  return (
    <Sheet open onClose={onClose} titel="Mitteilungen" width={600}>
      {meine.length === 0
        ? <Leer titel="Nichts Neues" text="Hier erscheinen Entscheidungen zu deinen Anträgen und Änderungen an deinen Diensten." />
        : (<>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn size="sm" kind="quiet" onClick={akt.alleGelesen}>Alle als gelesen markieren</Btn></div>
          {meine.map((n) => (
            <div key={n.id} className="karte" style={{ padding: 14, marginBottom: 9,
              borderLeft: `3px solid ${n.gelesen ? "transparent" : n.art === "warn" ? C.warn : C.accent}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontSize: 14, fontWeight: n.gelesen ? 500 : 650 }}>{n.titel}</div>
                <span style={{ fontSize: 11.5, color: C.dimmer, whiteSpace: "nowrap", ...NUM }}>{n.zeit}</span>
              </div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{n.text}</div>
            </div>))}
        </>)}
    </Sheet>);
}

/* =========================== FREIGABE DES PLANS ========================== */
function Freigabeleiste({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const f = freigabeStand(m, ym);
  const darfFreigeben = darf(sitz, "plan.publish");
  const sicher = planungssicherheit(m, ym);
  return (
    <Card style={{ padding: "14px 20px", marginBottom: 18, display: "flex", alignItems: "center",
      gap: 16, flexWrap: "wrap" }}>
      <Pill tone={f ? "ok" : "warn"}>{f ? `Freigegeben · Stand ${f.stand}` : "Entwurf"}</Pill>
      <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: C.dim }}>
        {f
          ? `Veröffentlicht ${f.zeit} durch ${f.durch}. Änderungen danach lösen eine Mitteilung an die Betroffenen aus.`
          : "Der Plan ist noch nicht verbindlich. Beschäftigte sehen ihn als Entwurf."}
      </div>
      {sicher.gesamt > 0 && (
        <Pill tone={sicher.anteil > 30 ? "danger" : sicher.anteil > 15 ? "warn" : "ok"}>
          {sicher.kurzfristig} von {sicher.gesamt} Änderungen kurzfristig
        </Pill>)}
      {darfFreigeben && <Btn kind={f ? "plain" : "primary"} onClick={() => akt.freigeben(ym)}>
        {f ? "Erneut freigeben" : "Plan freigeben"}</Btn>}
    </Card>);
}

/* ======================= VERTEILUNGSGERECHTIGKEIT ======================== */
function Verteilung({ sitz, ym }) {
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

      <KpiRow min={200}>
        <Kpi label="Planungssicherheit" value={`${100 - sicher.anteil} %`}
          tone={sicher.anteil > 30 ? "danger" : sicher.anteil > 15 ? "warn" : "ok"}
          sub={`${sicher.kurzfristig} von ${sicher.gesamt} Änderungen unter ${sicher.grenze} Tagen Vorlauf`} />
        {spalten.slice(0, 3).map(([f, l]) => (
          <Kpi key={f} label={`Spannweite ${l}`} value={spanne(f)} tone={spanne(f) > 4 ? "warn" : "ok"}
            sub={`Mittel ${n1(v.mittel[f])}`} />))}
      </KpiRow>

      {spanne("weNacht") <= 1 && spanne("feier") <= 1 && (
        <Card style={{ marginTop: 18, padding: 18, background: C.okLight }}>
          <div style={{ fontSize: 13.5, color: C.ok, lineHeight: 1.5 }}>
            Die Belastung ist annähernd gleich verteilt. Das ist die Eigenschaft eines sauberen Rotationsmodells —
            Ungleichheit entsteht erst durch Abweichungen, Einsprünge und kurzfristige Änderungen. Genau die zeigt
            diese Ansicht, sobald sie auftreten.
          </div>
        </Card>)}

      <Card style={{ marginTop: 18 }}>
        <CardHead right={<Lab>Abweichung vom Mittel</Lab>}>Wochenendnächte je Person</CardHead>
        <div style={{ padding: "22px 24px 18px", maxHeight: 420, overflowY: "auto" }}>
          <AbweichungsDiagramm zeilen={v.zeilen.slice(0, 24).map((z) => ({ ...z, abwWeNacht: z.abw.weNacht }))}
            wert="abwWeNacht" name={(z) => `${z.person.nachname}, ${z.person.vorname}`} />
        </div>
      </Card>

      <Card style={{ marginTop: 18, padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 28 }}>
          {spalten.slice(0, 4).map(([f, l]) => (
            <div key={f}>
              <Lab style={{ marginBottom: 10 }}>{l}</Lab>
              <AbweichungsDiagramm wert="abw" name={(z) => z.nm}
                zeilen={v.zeilen.slice(0, 14).map((z) => ({
                  nm: `${z.person.nachname}, ${z.person.vorname}`, abw: z.abw[f] }))} />
            </div>))}
        </div>
        <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 18, lineHeight: 1.55 }}>
          Jeder Punkt ist eine Person. Farbig hervorgehoben sind die Ausreißer — gelb bedeutet
          überdurchschnittlich belastet, grün unterdurchschnittlich. Häufen sich die Punkte um die
          Mittellinie, ist die Verteilung in Ordnung.
        </div>
      </Card>

      <Card style={{ marginTop: 18, overflowX: "auto" }}>
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
                <div style={{ fontSize: 11.5, color: e ? e.farbe : C.dimmer }}>{e ? e.name : "—"}</div></td>
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
      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14, lineHeight: 1.55, maxWidth: 760 }}>
        Die kleine Zahl unter jedem Wert ist die Abweichung vom Mittel der Belegschaft. Hervorgehoben wird ab
        zwei Diensten Unterschied — darunter ist es Zufall, darüber wird es zur Frage.
      </div>
    </div>);
}
