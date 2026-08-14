
/* ========================== PLANUNGSASSISTENT ============================ */
function Assistent({ sitz, ym, akt, onClose }) {
  const m = sitz.mandant;
  const [max, setMax] = useState(3);
  const [ergebnis, setErgebnis] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));

  const rechnen = () => {
    setLaeuft(true);
    setTimeout(() => { setErgebnis(planeMonat(m, ym, { maxProPerson: max })); setLaeuft(false); }, 30);
  };

  return (
    <Sheet open onClose={onClose} titel={`Planungsassistent · ${MON[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`} width={760}>
      {!ergebnis && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.55 }}>
            Der Assistent geht jeden Tag des Monats durch, sucht offene Stellen und schlägt Besetzungen vor.
            Er verwendet dieselbe Bewertung wie die Ersatzsuche: Qualifikation, Stundenkonto gegen den Median,
            Belastungsausgleich. Ruhezeiten und Einsatzeinschränkungen werden eingehalten.
            <b> Nichts wird ohne deine Freigabe übernommen.</b>
          </div>
          <Field label="Höchstzahl zusätzlicher Dienste je Person"
            hint="Verhindert, dass der Assistent die Last auf wenige Schultern legt.">
            <Inp type="number" min={1} max={10} value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
            <Btn kind="primary" disabled={laeuft} onClick={rechnen}>{laeuft ? "rechnet …" : "Vorschlag berechnen"}</Btn>
          </div>
        </div>)}

      {ergebnis && (<div>
        <KpiRow min={160}>
          <Kpi label="Vorgeschlagen" value={ergebnis.gesetzt.length} tone="accent" sub="zusätzliche Einteilungen" />
          <Kpi label="Betroffene Personen" value={ergebnis.betroffene} />
          <Kpi label="Bleibt offen" value={ergebnis.offen.length} tone={ergebnis.offen.length ? "danger" : "ok"}
            sub={ergebnis.offen.length ? "nicht deckbar" : "vollständig gedeckt"} />
        </KpiRow>

        {ergebnis.gesetzt.length === 0 && ergebnis.offen.length === 0 && (
          <div style={{ marginTop: 18 }}><Leer titel="Nichts zu tun"
            text="Der Monat ist bereits vollständig besetzt. Der Assistent hat keine offene Stelle gefunden." /></div>)}

        {ergebnis.gesetzt.length > 0 && (<>
          <Lab style={{ margin: "20px 0 10px" }}>Vorschläge</Lab>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {ergebnis.gesetzt.map((g, i) => (
              <div key={i} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "10px 13px", marginBottom: 7 }}>
                <span style={{ fontSize: 12.5, color: C.dim, minWidth: 52, ...NUM }}>{fKurz(g.datum)}</span>
                <Zelle da={map[g.dienstId]} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer }}>{g.grund}</div>
                </div>
                <Pill size="sm">{g.punkte}</Pill>
              </div>))}
          </div>
        </>)}

        {ergebnis.offen.length > 0 && (<>
          <Lab style={{ margin: "20px 0 10px" }}>Nicht deckbar · {ergebnis.offen.length}</Lab>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {ergebnis.offen.slice(0, 12).map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 12.5 }}>
                <span style={{ color: C.dim, minWidth: 52, ...NUM }}>{fKurz(o.datum)}</span>
                <span style={{ color: C.text, minWidth: 130 }}>{(map[o.dienstId] || {}).name}</span>
                <span style={{ color: C.danger }}>
                  {o.fehlt > 0 ? `${o.fehlt} fehlen` : ""}{o.qualFehlt ? (o.fehlt > 0 ? " · " : "") + "Qualifikation fehlt" : ""}</span>
              </div>))}
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 10, lineHeight: 1.5 }}>
            Für diese Stellen findet sich niemand, ohne Ruhezeit oder Einschränkungen zu verletzen.
            Hier greift die Eskalation: erweiterte Anfrage, Mehrarbeit oder dokumentierte Unterschreitung.
          </div>
        </>)}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22,
          paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          <Btn kind="quiet" onClick={() => setErgebnis(null)}>Neu rechnen</Btn>
          <Btn kind="quiet" onClick={onClose}>Verwerfen</Btn>
          <Btn kind="primary" disabled={!ergebnis.gesetzt.length}
            onClick={() => { akt.uebernehmeVorschlag(ergebnis); onClose(); }}>
            {ergebnis.gesetzt.length} Einteilungen übernehmen</Btn>
        </div>
      </div>)}
    </Sheet>);
}

/* ===================== ANTRÄGE MIT VORSCHAU UND RUNDE ==================== */
function Kapazitaetsvorschau({ sitz }) {
  const m = sitz.mandant;
  const v = useMemo(() => vorschau(m, 8), [m]);
  if (!v.offen.length && v.wochen.every((w) => w.status === "ok")) return null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Lab>{v.offen.length} offene Anträge einbezogen</Lab>}>Kapazität der nächsten acht Wochen</CardHead>
      <div style={{ padding: "18px 22px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {v.wochen.map((w, i) => (
          <div key={i} className="karte" style={{ padding: "12px 14px", minWidth: 116, flex: 1,
            background: w.status === "danger" ? C.dangerLight : w.status === "warn" ? C.warnLight : undefined }}>
            <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>ab {fKurz(w.von)}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 650, ...NUM,
                color: w.status === "danger" ? C.danger : w.status === "warn" ? C.warn : C.ok }}>{w.dann}</span>
              <span style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>Befunde</span>
            </div>
            <div style={{ fontSize: 11, color: C.dimmer, marginTop: 4, ...NUM }}>
              {w.neu > 0 ? `+${w.neu} durch Anträge` : w.antraege ? `${w.antraege} Anträge, tragbar` : "keine Anträge"}
            </div>
          </div>))}
      </div>
      <div style={{ padding: "0 22px 18px", fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
        Gezeigt wird der Zustand, der entstünde, wenn alle offenen Anträge genehmigt würden.
        Rot markierte Wochen kippen erst dadurch.
      </div>
    </Card>);
}

function Urlaubsrunde({ sitz, akt }) {
  const m = sitz.mandant;
  const r = m.urlaubsrunde;
  const jahr = new Date().getFullYear() + 1;
  const konflikte = useMemo(() => urlaubskonflikte(m), [m]);
  const darfLeiten = darf(sitz, "req.approve.all") || darf(sitz, "org.edit");
  const [w, setW] = useState({ von: `${jahr}-07-01`, bis: `${jahr}-07-14`, prio: 1 });

  if (!r) return (
    <Card>
      <Leer titel="Keine Runde eröffnet"
        text="Die Jahresurlaubsrunde sammelt die Wünsche für das Folgejahr, macht Überschneidungen sichtbar und entscheidet nach Vorrangregel." />
      {darfLeiten && <div style={{ padding: "0 24px 28px", textAlign: "center" }}>
        <Btn kind="primary" onClick={() => akt.eroeffneRunde(jahr)}>Runde für {jahr} eröffnen</Btn></div>}
    </Card>);

  const meine = r.wuensche.filter((x) => x.personId === sitz.person.id);
  const sortiert = [...r.wuensche].sort((a, b) => {
    const ra = urlaubsRang(m, a), rb = urlaubsRang(m, b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
    return 0;
  });

  return (
    <div>
      <Card style={{ marginBottom: 20, padding: "16px 22px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Pill tone={r.phase === "offen" ? "accent" : r.phase === "entschieden" ? "ok" : "neutral"}>
          {r.phase === "offen" ? "Wunschphase läuft" : r.phase === "entschieden" ? "entschieden" : "geschlossen"}</Pill>
        <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: C.dim }}>
          Urlaubsjahr {r.jahr} · Frist {fDatum(r.frist)} · {r.wuensche.length} Wünsche · {konflikte.length} Überschneidungstage
        </div>
        {darfLeiten && r.phase === "offen" && <Btn onClick={() => akt.schliesseRunde()}>Wunschphase schließen</Btn>}
        {darfLeiten && r.phase !== "offen" && <Btn kind="quiet" onClick={() => akt.oeffneRunde()}>Wieder öffnen</Btn>}
      </Card>

      {r.phase === "offen" && darf(sitz, "req.create") && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead right={<Lab>{meine.length} eigene Wünsche</Lab>}>Wunsch eintragen</CardHead>
          <div style={{ padding: 22, display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 12, alignItems: "end" }}>
            <Field label="Von"><Inp type="date" value={w.von} onChange={(e) => setW({ ...w, von: e.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={w.bis} onChange={(e) => setW({ ...w, bis: e.target.value })} /></Field>
            <Field label="Priorität" hint="1 ist der wichtigste Wunsch.">
              <Sel value={w.prio} onChange={(e) => setW({ ...w, prio: Number(e.target.value) })} style={{ width: 96 }}>
                {[1, 2, 3].map((x) => <option key={x} value={x}>{x}</option>)}</Sel></Field>
            <Btn kind="primary" onClick={() => akt.wunschEintragen(w)}>Eintragen</Btn>
          </div>
          {meine.length > 0 && <div style={{ padding: "0 22px 20px" }}>
            {meine.map((x) => (
              <div key={x.id} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "10px 13px", marginBottom: 7 }}>
                <Pill size="sm" tone={x.status === "genehmigt" ? "ok" : x.status === "abgelehnt" ? "danger" : "warn"}>
                  Priorität {x.prio}</Pill>
                <span style={{ fontSize: 13.5, flex: 1, ...NUM }}>{fDatum(x.von)} bis {fDatum(x.bis)}</span>
                <span style={{ fontSize: 12.5, color: C.dimmer }}>{x.status}</span>
                {x.status === "offen" && <Btn size="sm" kind="quiet" onClick={() => akt.wunschLoeschen(x.id)}>×</Btn>}
              </div>))}
          </div>}
        </Card>)}

      {konflikte.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead right={<Pill tone="warn">{konflikte.length} Tage</Pill>}>Überschneidungen</CardHead>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {konflikte.slice(0, 30).map((k, i) => {
              const e = m.einheiten.find((x) => x.id === k.einheitId);
              return (<div key={i} style={{ display: "flex", gap: 14, padding: "10px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 13, color: C.dim, minWidth: 90, ...NUM }}>{fDatum(k.datum)}</span>
                <span style={{ fontSize: 13, color: e ? e.farbe : C.dim, minWidth: 130 }}>{e ? e.name : k.einheitId}</span>
                <span style={{ fontSize: 13, color: C.danger, ...NUM }}>{k.anzahl} Wünsche bei {k.grenze} Plätzen</span>
                <span style={{ fontSize: 12.5, color: C.dimmer, flex: 1 }}>
                  {k.wuensche.map((x) => (m.personen.find((p) => p.id === x.personId) || {}).nachname).join(", ")}</span>
              </div>); })}
          </div>
        </Card>)}

      {darfLeiten && (
        <Card>
          <CardHead right={<Lab>nach Vorrangregel sortiert</Lab>}>Entscheidung</CardHead>
          <div style={{ padding: "14px 22px 0", fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
            Vorrang hat, wer im Vorjahr zurückstecken musste. Danach die selbst vergebene Priorität, danach der Eingang.
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", marginTop: 12 }}>
            {sortiert.map((x) => {
              const p = m.personen.find((y) => y.id === x.personId);
              const e = p ? m.einheiten.find((y) => y.id === einheitAm(p, x.von)) : null;
              const strittig = konflikte.some((k) => k.wuensche.some((y) => y.id === x.id));
              const zurueck = ((r.vorjahrZurueck) || []).includes(x.personId);
              return (
                <div key={x.id} className="row" style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 22px", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ fontSize: 13.5 }}>{p ? `${p.nachname}, ${p.vorname}` : "?"}
                      {zurueck && <Pill size="sm" tone="accent" style={{ marginLeft: 8 }}>Vorrang</Pill>}</div>
                    <div style={{ fontSize: 11.5, color: e ? e.farbe : C.dimmer }}>{e ? e.name : "—"}</div>
                  </div>
                  <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{fDatum(x.von)} – {fDatum(x.bis)}</span>
                  <Pill size="sm">Prio {x.prio}</Pill>
                  {strittig && <Pill size="sm" tone="warn">strittig</Pill>}
                  {x.status === "offen" ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn size="sm" kind="ok" onClick={() => akt.wunschEntscheiden(x.id, true)}>Zusagen</Btn>
                      <Btn size="sm" kind="danger" onClick={() => akt.wunschEntscheiden(x.id, false)}>Absagen</Btn>
                    </div>
                  ) : <Pill tone={x.status === "genehmigt" ? "ok" : "danger"}>{x.status}</Pill>}
                </div>);
            })}
          </div>
        </Card>)}
    </div>);
}

/* ===================== ABRECHNUNGSDATEN: ZUSCHLÄGE UND KONTEN ============ */
function Abrechnungsdaten({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const [reiter, setReiter] = useState("zuschlaege");
  const zeilen = useMemo(() => m.personen.filter((p) => imDienst(p, `${ym}-28`))
    .map((p) => ({ p, z: zuschlagWert(m, p, ym), a: ausgleichBedarf(m, p, ym), ist: istStunden(m, p, ym) })), [m, ym]);
  const summe = (f) => zeilen.reduce((a, z) => a + z.z.std[f], 0);
  const faellig = zeilen.filter((z) => z.a.faellig);

  return (
    <div>
      <H1 sub="Was die Lohnstelle braucht — und was das Stundenkonto verlangt. Entgelte bleiben bewusst außerhalb: Löhne gehören in die Lohnabrechnung, nicht in die Dienstplanung."
        right={<div style={{ display: "flex", gap: 10 }}>
          <Seg value={reiter} onChange={setReiter} options={[{ id: "zuschlaege", label: "Zuschläge" },
            { id: "ausgleich", label: "Freizeitausgleich" }, { id: "lohn", label: "Lohnausgabe" }]} />
          <Btn onClick={() => akt.exportZuschlaege(ym)}>Export</Btn></div>}>
        Abrechnungsdaten · {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</H1>

      {reiter === "zuschlaege" && (<>
        <KpiRow min={170}>
          <Kpi label="Nachtstunden" value={n1(summe("nacht"))} unit="h" sub="23 bis 6 Uhr" />
          <Kpi label="Sonntagsstunden" value={n1(summe("sonntag"))} unit="h" />
          <Kpi label="Feiertagsstunden" value={n1(summe("feiertag"))} unit="h" />
          <Kpi label="Samstagsstunden" value={n1(summe("samstag"))} unit="h" />
        </KpiRow>

        <Card style={{ marginTop: 20, overflowX: "auto" }}>
          <CardHead right={<Lab>Zuschlagswert in Stunden</Lab>}>Je Person</CardHead>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 840 }}>
            <thead><tr>{["Person", "Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag", "Zuschlagswert"].map((h, i) => (
              <th key={i} style={{ textAlign: i ? "right" : "left", padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <Lab>{h}</Lab></th>))}</tr></thead>
            <tbody>{zeilen.map(({ p, z }) => (
              <tr key={p.id} className="row">
                <td style={{ padding: "11px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13.5 }}>
                  {p.nachname}, {p.vorname}</td>
                {["gesamt", "nacht", "sonntag", "feiertag", "samstag"].map((f) => (
                  <td key={f} style={{ padding: "11px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right",
                    fontSize: 13, color: z.std[f] ? C.text : C.dimmer, ...NUM }}>{n1(z.std[f])}</td>))}
                <td style={{ padding: "11px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right",
                  fontSize: 14, fontWeight: 600, ...NUM }}>{n1(z.summe)} h</td>
              </tr>))}</tbody>
          </table>
        </Card>

        <Card style={{ marginTop: 20 }}>
          <CardHead right={darf(sitz, "org.edit") && <Btn size="sm" onClick={akt.neueZuschlagsregel}>Regel hinzufügen</Btn>}>
            Zuschlagsregeln</CardHead>
          <div style={{ padding: 22 }}>
            {(m.zuschlaege || []).map((z) => (
              <div key={z.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 11, flexWrap: "wrap" }}>
                <input type="checkbox" checked={z.aktiv} disabled={!darf(sitz, "org.edit")}
                  onChange={(e) => akt.setzeZuschlag(z.id, "aktiv", e.target.checked)} />
                <Inp value={z.name} disabled={!darf(sitz, "org.edit")} style={{ flex: 1, minWidth: 160 }}
                  onChange={(e) => akt.setzeZuschlag(z.id, "name", e.target.value)} />
                <Sel value={z.art} disabled={!darf(sitz, "org.edit")} style={{ width: 150 }}
                  onChange={(e) => akt.setzeZuschlag(z.id, "art", e.target.value)}>
                  {[["nacht", "Nachtarbeit"], ["sonntag", "Sonntag"], ["feiertag", "Feiertag"], ["samstag", "Samstag"]]
                    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
                <Inp type="number" value={z.prozent} disabled={!darf(sitz, "org.edit")} style={{ width: 96 }}
                  onChange={(e) => akt.setzeZuschlag(z.id, "prozent", Number(e.target.value))} />
                <span style={{ fontSize: 13, color: C.dimmer }}>%</span>
                {darf(sitz, "org.edit") && <Btn size="sm" kind="danger" onClick={() => akt.loescheZuschlag(z.id)}>×</Btn>}
              </div>))}
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
              Der Zuschlagswert wird in Stunden ausgegeben: geleistete Stunden mal Prozentsatz. Die Umrechnung
              in Entgelt erfolgt in der Lohnabrechnung mit dem dort hinterlegten Stundensatz.
            </div>
          </div>
        </Card>
      </>)}

      {reiter === "lohn" && <Lohnausgabe sitz={sitz} ym={ym} akt={akt} />}
      {reiter === "ausgleich" && (<>
        <KpiRow min={190}>
          <Kpi label="Über der Ausgleichsgrenze" value={faellig.length} tone={faellig.length ? "warn" : "ok"}
            sub={`Grenze ${n1(m.einstellungen.ausgleichGrenze || 40)} h`} />
          <Kpi label="Summe Überhang" value={n1(faellig.reduce((a, z) => a + z.a.ueber, 0))} unit="h" />
          <Kpi label="Entspricht Freischichten" value={faellig.reduce((a, z) => a + Math.ceil(z.a.ueber / (z.a.mittel || 8)), 0)} />
        </KpiRow>
        <Card style={{ marginTop: 20 }}>
          <CardHead>Konten mit Ausgleichsbedarf</CardHead>
          {faellig.length === 0
            ? <Leer titel="Alle Konten im Rahmen" text="Kein Stundenkonto liegt über der eingestellten Ausgleichsgrenze." />
            : faellig.map(({ p, a }) => (
              <div key={p.id} className="row" style={{ display: "flex", alignItems: "center", gap: 14,
                padding: "13px 22px", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 13.5 }}>{p.nachname}, {p.vorname}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                    {sgn(a.kto)} h · {a.ueber > 0 ? `${n1(a.ueber)} h über der Grenze` : "im Rahmen"}</div>
                </div>
                <Pill tone={a.kto > (a.grenze * 1.5) ? "danger" : "warn"}>{Math.ceil(a.ueber / (a.mittel || 8))} Freischichten</Pill>
                {darfEinheit(sitz, einheitAm(p, heute())) &&
                  <Btn size="sm" kind="primary" onClick={() => akt.oeffneAusgleich(p.id)}>Freischicht planen</Btn>}
              </div>))}
        </Card>
      </>)}
    </div>);
}

function AusgleichPlanen({ sitz, personId, akt, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === personId);
  const ym = heute().slice(0, 7);
  if (!p) return null;
  const a = ausgleichBedarf(m, p, ym);
  const tage = useMemo(() => ausgleichTage(m, p, heute(), 12), [m, personId]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  return (
    <Sheet open onClose={onClose} titel={`Freizeitausgleich · ${p.vorname} ${p.nachname}`} width={620}>
      <div className="karte" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 22, flexWrap: "wrap" }}>
        <div><Lab>Stundenkonto</Lab><div style={{ fontSize: 22, fontWeight: 650, color: C.warn, ...NUM }}>{sgn(a.kto)} h</div></div>
        <div><Lab>Über der Grenze</Lab><div style={{ fontSize: 22, fontWeight: 650, ...NUM }}>{n1(a.ueber)} h</div></div>
        <div><Lab>Freischichten nötig</Lab><div style={{ fontSize: 22, fontWeight: 650, ...NUM }}>{Math.ceil(a.ueber / (a.mittel || 8))}</div></div>
      </div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
        Eine Freischicht nimmt den geplanten Dienst heraus und schreibt die Stunden nicht gut —
        das Konto sinkt entsprechend. Vorgeschlagen werden nur Tage, an denen die Besetzung es trägt.
      </div>
      <Lab style={{ marginBottom: 10 }}>Geeignete Tage</Lab>
      {tage.map((t) => (
        <div key={t.datum} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
          padding: "11px 13px", marginBottom: 7, opacity: t.moeglich ? 1 : .55 }}>
          <span style={{ fontSize: 13, color: C.dim, minWidth: 74, ...NUM }}>{fKurz(t.datum)}</span>
          <Zelle da={map[t.dienstId]} size={26} />
          <div style={{ flex: 1, fontSize: 12.5, color: t.moeglich ? C.ok : C.danger }}>
            {t.moeglich ? `Besetzung trägt es (${t.puffer > 0 ? "+" : ""}${t.puffer})` : "Besetzung ist bereits knapp"}
          </div>
          <Btn size="sm" kind={t.moeglich ? "primary" : "quiet"}
            onClick={() => { akt.planeFreischicht(p.id, t.datum); onClose(); }}>Freischicht</Btn>
        </div>))}
    </Sheet>);
}

/* ====================== ESKALATION BEI UNTERDECKUNG ===================== */
function Eskalation({ sitz, datum, dienstId, akt, onClose }) {
  const m = sitz.mandant;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const [grund, setGrund] = useState("");
  const [empfaenger, setEmpfaenger] = useState([]);
  const kandidaten = m.personen.filter((p) => imDienst(p, datum) && !personTag(m, p, datum).dienstId
    && !abwesenheitAm(m, p.id, datum));

  return (
    <Sheet open onClose={onClose} titel="Lücke eskalieren" width={640}>
      <div className="karte" style={{ padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <Zelle da={da} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600}}>{da.name} · {fLang(datum)}</div>
          <div style={{ fontSize: 12.5, color: C.danger, ...NUM }}>
            {b.anzahl} von {b.soll}{b.qualFehlt ? " · Qualifikation fehlt" : ""}</div>
        </div>
      </div>

      <Lab style={{ marginBottom: 10 }}>Stufe 1 · Erweiterte Anfrage</Lab>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
        Fragt mehrere Personen gleichzeitig. Wer zusagt, wird eingeteilt — die übrigen Anfragen verfallen.
      </div>
      <div style={{ maxHeight: 170, overflowY: "auto", marginBottom: 12 }}>
        {kandidaten.slice(0, 20).map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={empfaenger.includes(p.id)}
              onChange={(e) => setEmpfaenger(e.target.checked ? [...empfaenger, p.id] : empfaenger.filter((x) => x !== p.id))} />
            <span style={{ fontSize: 13.5 }}>{p.nachname}, {p.vorname}</span>
          </label>))}
      </div>
      <Btn disabled={!empfaenger.length} onClick={() => { akt.einsatzanfrage(datum, dienstId, empfaenger); onClose(); }}>
        Anfrage an {empfaenger.length} Personen</Btn>

      <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 10 }}>Stufe 2 · Unterschreitung dokumentieren</Lab>
        <div style={{ fontSize: 13, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
          Wenn niemand einsetzbar ist, bleibt die Unterschreitung. Die Begründung ist das,
          was die verantwortliche Person absichert — und in der Pflege ist sie vorgeschrieben.
        </div>
        <Field label="Begründung und getroffene Maßnahmen">
          <textarea className="inp" rows={3} value={grund} onChange={(e) => setGrund(e.target.value)}
            placeholder="z. B. zwei kurzfristige Krankmeldungen, Anfrage an neun Personen ohne Zusage, Aufgaben priorisiert" /></Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="danger" disabled={!grund.trim()}
            onClick={() => { akt.dokumentiereUnterschreitung(datum, dienstId, grund); onClose(); }}>
            Unterschreitung dokumentieren</Btn>
        </div>
      </div>
    </Sheet>);
}

/* ========================== DATENSCHUTZBETRIEB ========================== */
function Datenschutz({ sitz, akt }) {
  const m = sitz.mandant;
  const [pid, setPid] = useState("");
  const kandidaten = anonymisierbar(m);
  return (
    <Card>
      <CardHead>Datenschutz</CardHead>
      <div style={{ padding: 22, display: "grid", gap: 18 }}>
        <Field label="Aufbewahrungsfrist nach Austritt in Monaten"
          hint="Danach dürfen Name und Kontaktdaten anonymisiert werden. Planungsdaten bleiben als Statistik erhalten.">
          <Inp type="number" value={m.einstellungen.aufbewahrungMonate || 24}
            onChange={(e) => akt.setzeEinstellung("aufbewahrungMonate", Number(e.target.value))} /></Field>

        <div>
          <Lab style={{ marginBottom: 8 }}>Zur Anonymisierung fällig · {kandidaten.length}</Lab>
          {kandidaten.length === 0
            ? <div style={{ fontSize: 13, color: C.dimmer }}>Keine Datensätze über der Frist.</div>
            : kandidaten.map((p) => (
              <div key={p.id} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "10px 13px", marginBottom: 7 }}>
                <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
                <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>ausgetreten {fDatum(p.austritt)}</span>
                <Btn size="sm" kind="danger" onClick={() => akt.anonymisiere(p.id)}>Anonymisieren</Btn>
              </div>))}
        </div>

        <div style={{ paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 8 }}>Datenauskunft nach Artikel 15</Lab>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12, lineHeight: 1.5 }}>
            Vollständige Aufstellung aller zu einer Person gespeicherten Daten, als Datei zur Aushändigung.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Sel value={pid} onChange={(e) => setPid(e.target.value)} style={{ flex: 1, minWidth: 220 }}>
              <option value="">— Person wählen —</option>
              {m.personen.map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</Sel>
            <Btn kind="primary" disabled={!pid} onClick={() => akt.datenauskunft(pid)}>Auskunft erzeugen</Btn>
          </div>
        </div>
      </div>
    </Card>);
}


/**
 * Lohnausgabe nach DATEV-Schema. Bewusst als Stunden je Lohnart — Entgelte
 * gehören in die Lohnabrechnung, nicht in die Dienstplanung.
 */
function Lohnausgabe({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const saetze = useMemo(() => datevSaetze(m, ym), [m, ym]);
  const nachLohnart = useMemo(() => {
    const g = {};
    for (const z of saetze) {
      if (!g[z.lohnart]) g[z.lohnart] = { nr: z.lohnart, text: z.bezeichnung, stunden: 0, personen: 0 };
      g[z.lohnart].stunden += z.stunden; g[z.lohnart].personen++;
    }
    return Object.values(g).sort((a, b) => (a.nr < b.nr ? -1 : 1));
  }, [saetze]);

  return (
    <div>
      <KpiRow min={170}>
        <Kpi label="Lohnartensätze" value={saetze.length} sub={`für ${MON[Number(ym.slice(5, 7)) - 1]}`} />
        <Kpi label="Lohnarten" value={nachLohnart.length} />
        <Kpi label="Betroffene Personen" value={new Set(saetze.map((z) => z.personalnummer)).size} />
      </KpiRow>

      <Card style={{ marginTop: 18 }}>
        <CardHead right={<Btn kind="primary" onClick={() => akt.exportDATEV(ym)}>
          Als CSV ausgeben</Btn>}>Summen je Lohnart</CardHead>
        <table className="raster">
          <thead><tr>{["Lohnart", "Bezeichnung", "Personen", "Stunden"].map((h, i) => (
            <th key={i} style={{ textAlign: i >= 2 ? "right" : "left" }}>{h}</th>))}</tr></thead>
          <tbody>
            {nachLohnart.map((l) => (
              <tr key={l.nr}>
                <td style={NUM}>{l.nr}</td>
                <td>{l.text}</td>
                <td style={{ textAlign: "right", ...NUM }}>{l.personen}</td>
                <td style={{ textAlign: "right", fontWeight: 600, ...NUM }}>{n2(l.stunden)}</td>
              </tr>))}
          </tbody>
        </table>
        <div style={{ padding: "14px 20px", fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
          Die Datei enthält je Person und Lohnart eine Zeile mit Stunden. Entgelte werden bewusst
          nicht berechnet — Stundensätze, Tarifgruppen und Steuerfreibeträge gehören in die
          Lohnabrechnung. Die Lohnartennummern lassen sich je Betrieb anpassen.
        </div>
      </Card>
    </div>);
}
