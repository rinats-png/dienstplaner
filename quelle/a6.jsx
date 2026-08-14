
/* ============================== TAGESDETAIL ============================== */
function Tagesdetail({ sitz, datum, onClose, akt }) {
  const m = sitz.mandant;
  const [tab, setTab] = useState(m.dienstarten[0].id);
  const [ersatz, setErsatz] = useState(false);
  const bes = useMemo(() => besetzung(m, datum), [m, datum]);
  const fei = feiertag(datum, m.bundesland);
  const aktiv = bes[tab] ? tab : m.dienstarten[0].id;
  const e = bes[aktiv];
  const frei = useMemo(() => aktive(m, datum).filter((p) => {
    if (!darfEinheit(sitz, einheitAm(p, datum))) return false;
    const t = personTag(m, p, datum); return !t.dienstId && !t.abwesenheit; }), [m, datum, sitz]);

  return (
    <Sheet open onClose={onClose} titel={fLang(datum)} width={840}>
      {fei && <div style={{ padding: "11px 15px", marginBottom: 20, borderRadius: 12, background: "rgba(179,38,30,.085)",
        color: C.danger, fontSize: 13.5, fontWeight: 500 }}>Gesetzlicher Feiertag: {fei}</div>}
      <div className="reiterreihe">
        {m.dienstarten.map((d) => { const b = bes[d.id], on = aktiv === d.id;
          return (
            <Ablage key={d.id} id={`dienst:${d.id}`}
              nimmt={(l) => l.art === "person" && l.dienstId !== d.id}
              ablegen={(l) => akt.setzeAbweichung(l.personId, datum, d.id)}
              style={{ borderRadius: 999 }}>
              <button onClick={() => setTab(d.id)} className="btn"
                style={{ background: on ? `${d.farbe}1E` : C.bg, color: on ? d.farbe : C.dim,
                  fontWeight: on ? 650 : 500, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{d.kurz}</span><span style={NUM}>{b.anzahl}/{b.soll}</span>
                {b.diff < 0 && <span style={{ color: C.danger, fontWeight: 700 }}>−{Math.abs(b.diff)}</span>}
                {b.qualFehlt && <span style={{ color: C.warn }}>!</span>}</button>
            </Ablage>); })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16,
        borderBottom: `1px solid ${C.lineSoft}`, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 620 }}>{e.da.name}</div>
          <div style={{ fontSize: 13, color: C.dimmer, marginTop: 4, ...NUM }}>
            {e.da.start}–{e.da.ende} · {n1(dauer(e.da))} h{e.da.pause ? ` (${e.da.pause} min Pause)` : ""} · {n1(nachtAnteil(e.da))} h Nachtanteil · {e.da.ort}</div>
          {e.qual.length > 0 && <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
            {e.qual.map((q) => { const qn = m.qualifikationen.find((x) => x.id === q.qid);
              return <Pill key={q.qid} size="sm" tone={q.ok ? "ok" : "danger"}>{qn ? qn.kurz : q.qid} {q.ist}/{q.noetig}</Pill>; })}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 650, color: e.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {e.anzahl}<span style={{ fontSize: 15, color: C.dimmer, fontWeight: 500 }}>/{e.soll}</span></div>
          <div style={{ fontSize: 12, color: C.dimmer }}>{e.diff < 0 ? `${Math.abs(e.diff)} fehlen` : `${e.diff} über Soll`}</div>
        </div>
      </div>

      {darf(sitz, "plan.view.unit") && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn size="sm" kind="quiet" onClick={() => akt.oeffneNotizen(`tag|${datum}`, `Notizen zum ${fDatum(datum)}`)}>
            Notizen{notizenZu(m, `tag|${datum}`).length ? ` (${notizenZu(m, `tag|${datum}`).length})` : ""}</Btn>
        </div>)}

      {(e.diff < 0 || e.qualFehlt) && darfEinheit(sitz, sitz.person.bereich) && (
        <div style={{ marginBottom: 20 }}>
          <Btn kind="primary" onClick={() => setErsatz(!ersatz)}>
            {ersatz ? "Ersatzvorschläge ausblenden" : "Ersatz vorschlagen lassen"}</Btn>
          {ersatz && <div style={{ marginTop: 16 }}>
            <Ersatzliste sitz={sitz} datum={datum} dienstId={aktiv} akt={akt} /></div>}
        </div>)}

      <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12, lineHeight: 1.5 }}>
        Personen lassen sich zwischen den Spalten und auf die Reiter oben ziehen — oder wie bisher antippen.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        {[["Eingeteilt", e.personen, true], ["Verfügbar", frei, false]].map(([titel, liste, drin]) => (
          <Ablage key={titel} id={`spalte:${drin ? "drin" : "frei"}`}
            nimmt={(l) => l.art === "person" && (drin ? l.dienstId !== aktiv : !!l.dienstId)}
            ablegen={(l) => akt.setzeAbweichung(l.personId, datum, drin ? aktiv : "-")}
            style={{ borderRadius: 16, padding: 4 }}>
            <Lab style={{ marginBottom: 11 }}>{titel} · {liste.length}</Lab>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {liste.length === 0 && <div style={{ fontSize: 13, color: C.dimmer, padding: "8px 0" }}>
                {drin ? "Niemand eingeteilt." : "Keine freien Kräfte im Zuständigkeitsbereich."}</div>}
              {liste.map((p) => { const eid = einheitAm(p, datum);
                const eh = m.einheiten.find((x) => x.id === eid); const t = personTag(m, p, datum);
                return (<Ziehbar key={p.id} className="karte"
                  aktiv={darfEinheit(sitz, eid)}
                  nutzlast={{ art: "person", personId: p.id, dienstId: t.dienstId,
                    beschriftung: `${p.vorname} ${p.nachname}`, farbe: eh ? eh.farbe : C.accentDeep,
                    zeit: e.da ? `${e.da.start}–${e.da.ende}` : null }}
                  style={{ display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 9, padding: "10px 12px", marginBottom: 7 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.vorname} {p.nachname}</div>
                    <div style={{ fontSize: 11.5, color: C.dimmer }}>
                      <span style={{ color: eh ? eh.farbe : C.dimmer }}>{eh ? eh.name : "—"}</span>
                      {drin && t.quelle === "abweichung" && " · abweichend"}
                      {p.qualifikationen.length > 0 && ` · ${p.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).filter(Boolean).join(" ")}`}</div>
                  </div>
                  {darfEinheit(sitz, eid) && <Btn size="sm" kind={drin ? "danger" : "primary"}
                    onClick={() => akt.setzeAbweichung(p.id, datum, drin ? "-" : aktiv)}>{drin ? "Raus" : `+ ${e.da.kurz}`}</Btn>}
                </Ziehbar>); })}
            </div>
          </Ablage>))}
      </div>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 11 }}>Abwesend</Lab>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {aktive(m, datum).filter((p) => abwesenheitAm(m, p.id, datum)).map((p) => (
            <Pill key={p.id} size="sm">{p.nachname} · {abwArt(abwesenheitAm(m, p.id, datum).art).label}</Pill>))}
          {aktive(m, datum).filter((p) => abwesenheitAm(m, p.id, datum)).length === 0 &&
            <span style={{ fontSize: 13, color: C.dimmer }}>Niemand abwesend.</span>}
        </div>
      </div>
    </Sheet>);
}

/* ============================== SCHICHTFOLGE ============================= */
function Schichtfolge({ sitz, akt }) {
  const m = sitz.mandant;
  const sim = useMemo(() => simulation(m), [m]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [pinsel, setPinsel] = useState(m.dienstarten[0].id);
  const editierbar = darf(sitz, "pattern.edit");
  const soll = m.einstellungen.sollWochenstunden;
  const abw = sim.wochenstunden - soll;

  return (
    <div>
      <H1 sub={`Ein Zyklus über ${m.zyklus.tage.length} Tage, ${m.einheiten.filter((e) => !e.pool).length} ${m.einheitLabel}n mit eigenem Startpunkt. Der Plan wird daraus für jeden Tag berechnet — nichts wird ausgerollt, es gibt keine Jahresgrenze.`}
        right={editierbar && <Btn kind="primary" onClick={akt.oeffneWizard}>Neu einrichten</Btn>}>Schichtfolge</H1>

      <KpiRow>
        <Kpi label="Wochenarbeitszeit" value={n2(sim.wochenstunden)} unit="h"
          tone={Math.abs(abw) < .5 ? "ok" : Math.abs(abw) < 1.5 ? "warn" : "danger"} sub={`Soll ${n2(soll)} h · ${sgn(abw)} h`} />
        <Kpi label="Deckungslücken" value={sim.luecken.length} tone={sim.luecken.length ? "danger" : "ok"}
          sub={sim.luecken.length ? "Zyklus deckt nicht jeden Tag" : "jeder Tag vollständig gedeckt"} />
        <Kpi label="Dienste am Stück" value={sim.maxFolge} unit="max."
          tone={sim.maxFolge <= 5 ? "ok" : sim.maxFolge <= 7 ? "warn" : "danger"} sub={`Grenzwert ${m.einstellungen.maxFolge}`} />
        <Kpi label="Nächte am Stück" value={sim.maxNacht} unit="max." tone={sim.maxNacht <= 4 ? "ok" : "danger"} sub="empfohlen 3 bis 4" />
        <Kpi label="Einzeldienste" value={sim.einzel} tone={sim.einzel === 0 ? "ok" : "warn"} sub="isolierte Diensttage" />
      </KpiRow>

      {(sim.luecken.length > 0 || sim.konflikte.length > 0) && (
        <Card style={{ marginTop: 18, padding: 20, background: C.dangerLight }}>
          {sim.luecken.map((l) => <div key={l.da.id} style={{ fontSize: 13.5, color: C.danger, marginBottom: 6 }}>
            <b>{l.da.name}</b> ist an {l.tage} von {sim.len} Zyklustagen von keiner {m.einheitLabel} besetzt.</div>)}
          {sim.konflikte.slice(0, 5).map((k, i) => <div key={i} style={{ fontSize: 13.5, color: C.danger, marginBottom: 6 }}>
            Tag {k.tag + 1}: {k.von} → {k.nach} lässt nur {n1(k.ruhe)} h Ruhezeit. Das trifft jede {m.einheitLabel}.</div>)}
        </Card>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 20, marginTop: 20 }}>
        <Card>
          <CardHead right={editierbar && <Seg value={String(m.zyklus.wochen)}
            options={[3, 4, 5, 6].map((w) => ({ id: String(w), label: `${w} Wo.` }))}
            onChange={(v) => akt.setzeZyklusWochen(Number(v))} />}>Zyklusraster</CardHead>
          {editierbar && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 22px 0" }}>
            {m.dienstarten.filter((d) => !d.posten).map((d) => (
              <button key={d.id} onClick={() => setPinsel(d.id)} className="btn btn-sm"
                style={{ background: pinsel === d.id ? `${d.farbe}22` : C.bg, color: pinsel === d.id ? d.farbe : C.dim, fontWeight: 600 }}>{d.kurz}</button>))}
            <button onClick={() => setPinsel("-")} className="btn btn-sm"
              style={{ background: pinsel === "-" ? "rgba(20,20,25,.10)" : C.bg, color: C.dim, fontWeight: 600 }}>frei</button>
          </div>}
          <div style={{ padding: 22, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse" }}>
              <thead><tr><th style={{ paddingRight: 14 }}><Lab>Wo.</Lab></th>
                {DOW.map((d) => <th key={d} style={{ padding: "0 5px 12px", minWidth: 46 }}><Lab>{d}</Lab></th>)}
                <th style={{ paddingLeft: 18 }}><Lab>Stunden</Lab></th></tr></thead>
              <tbody>{Array.from({ length: m.zyklus.wochen }, (_, w) => {
                const woche = m.zyklus.tage.slice(w * 7, w * 7 + 7);
                const std = woche.reduce((s, id) => s + (map[id] ? dauer(map[id]) : 0), 0);
                return (<tr key={w}>
                  <td style={{ paddingRight: 14, fontSize: 13, color: C.dimmer, ...NUM }}>{pad(w + 1)}</td>
                  {woche.map((id, di) => (<td key={di} style={{ padding: 4, textAlign: "center" }}>
                    <div onClick={() => editierbar && akt.setzeZyklusTag(w * 7 + di, pinsel)}
                      style={{ display: "inline-block", cursor: editierbar ? "pointer" : "default" }}>
                      <Zelle da={map[id]} size={38} /></div></td>))}
                  <td style={{ paddingLeft: 18, fontSize: 13, color: std > 0 ? C.text : C.dimmer, ...NUM }}>{n1(std)} h</td>
                </tr>); })}</tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead>Vorlagen und Versatz</CardHead>
          <div style={{ padding: 22 }}>
            {VORLAGEN.map((v) => (
              <div key={v.id} className="karte" style={{ padding: 16, marginBottom: 13,
                background: m.zyklus.vorlage === v.id ? "rgba(43,52,64,.07)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.name}</div>
                  <Btn size="sm" kind={m.zyklus.vorlage === v.id ? "quiet" : "primary"} disabled={!editierbar}
                    onClick={() => akt.ladeVorlage(v.id)}>{m.zyklus.vorlage === v.id ? "aktiv" : "laden"}</Btn>
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7, lineHeight: 1.45 }}>{v.text}</div>
                <div style={{ fontSize: 12, color: C.dimmer, marginTop: 7, ...NUM }}>
                  {n2(v.wochenstunden)} h/Woche · benötigt {v.einheiten} {m.einheitLabel}n</div>
              </div>))}
            {m.einheiten.length !== m.zyklus.wochen && (
              <div style={{ padding: 14, borderRadius: 12, background: C.warnLight, color: C.warn, fontSize: 13, marginBottom: 14, lineHeight: 1.45 }}>
                Der Zyklus hat {m.zyklus.wochen} Wochen, es gibt {m.einheiten.length} {m.einheitLabel}n.
                Für lückenlose Deckung müssen beide Zahlen übereinstimmen.</div>)}
            <Lab style={{ margin: "20px 0 12px" }}>Startpunkt je {m.einheitLabel}</Lab>
            {m.einheiten.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: e.farbe }} />
                <span style={{ fontSize: 13.5, flex: 1 }}>{e.name}</span>
                <Sel value={versatzTageVon(e)} disabled={!editierbar}
                  onChange={(ev) => akt.setzeVersatz(e.id, Number(ev.target.value))} style={{ width: 210 }}>
                  {m.zyklus.tage.map((t2, i) => {
                    const dd = map[t2];
                    return <option key={i} value={i}>Tag {i + 1} — {dd ? dd.name : "frei"}</option>; })}</Sel>
                <div style={{ display: "flex", gap: 2 }}>
                  {Array.from({ length: Math.min(21, sim.len) }, (_, i) => {
                    const idx = (((i - versatzTageVon(e)) % sim.len) + sim.len) % sim.len;
                    return <Zelle key={i} da={map[m.zyklus.tage[idx]]} size={15} blass />; })}</div>
              </div>))}
          </div>
        </Card>
      </div>
    </div>);
}

/* ========================= DIENSTARTEN — frei gestaltbar ================== */
function Dienstarten({ sitz, akt }) {
  const m = sitz.mandant;
  const [bearbeitet, setBearbeitet] = useState(null);
  const editierbar = darf(sitz, "shift.edit");
  const leer = { name: "", kurz: "", start: "08:00", ende: "16:00", pause: 0, farbe: PALETTE[0], ort: "",
    posten: false, quelle: null, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
    mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} };
  const [f, setF] = useState(leer);
  const oeffnen = (d) => { setBearbeitet(d ? d.id : "neu"); setF(d ? JSON.parse(JSON.stringify(d)) : { ...leer, kurz: "" }); };
  const speichern = () => {
    if (!f.name.trim() || !f.kurz.trim()) return;
    if (bearbeitet === "neu") akt.neueDienstart(f); else akt.aendereDienstart(bearbeitet, f);
    setBearbeitet(null);
  };

  return (
    <div>
      <H1 sub="Dienstarten sind vollständig frei gestaltbar: Zeiten, Pause, Farbe, Ort, Mindestbesetzung je Wochentag und geforderte Qualifikationen. Ein Außenposten wird automatisch aus der Einheit besetzt, die den Quelldienst fährt."
        right={editierbar && <Btn kind="primary" onClick={() => oeffnen(null)}>Dienstart anlegen</Btn>}>Dienstarten</H1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
        {m.dienstarten.map((d) => {
          const verwendet = m.zyklus.tage.filter((t) => t === d.id).length
            + Object.values(m.abweichungen).filter((v) => v === d.id).length;
          return (
            <Card key={d.id} hover style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <Zelle da={d} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 620 }}>{d.name}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                    {d.start}–{d.ende} · {n1(dauer(d))} h{d.pause ? ` · ${d.pause} min Pause` : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                    {n1(nachtAnteil(d))} h Nachtanteil · {d.ort || "ohne Ort"}</div>
                </div>
                {d.posten && <Pill size="sm" tone="ok">Posten</Pill>}
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 16 }}>
                {[["Mo–Do", d.mindest.mo_do], ["Fr", d.mindest.fr], ["Sa", d.mindest.sa], ["So/Feiertag", d.mindest.so]].map(([l, v]) => (
                  <Pill key={l} size="sm">{l} {v}</Pill>))}
              </div>
              {Object.entries(d.mindestQual || {}).filter(([, n]) => n > 0).length > 0 && (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
                  {Object.entries(d.mindestQual).filter(([, n]) => n > 0).map(([qid, n]) => {
                    const q = m.qualifikationen.find((x) => x.id === qid);
                    return <Pill key={qid} size="sm" tone="accent">davon {n} × {q ? q.kurz : qid}</Pill>; })}</div>)}
              <div style={{ display: "flex", gap: 9, marginTop: 18, alignItems: "center" }}>
                {editierbar && <Btn size="sm" onClick={() => oeffnen(d)}>Bearbeiten</Btn>}
                {editierbar && <Btn size="sm" kind="danger" onClick={() => akt.loescheDienstart(d.id)}>Löschen</Btn>}
                <span style={{ fontSize: 11.5, color: C.dimmer, marginLeft: "auto", ...NUM }}>
                  {verwendet > 0 ? `${verwendet}× verwendet` : "nicht verwendet"}</span>
              </div>
            </Card>);
        })}
      </div>

      <Sheet open={!!bearbeitet} onClose={() => setBearbeitet(null)}
        titel={bearbeitet === "neu" ? "Neue Dienstart" : "Dienstart bearbeiten"} width={640}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Bezeichnung"><Inp value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="z. B. Zwischendienst" /></Field>
            <Field label="Kürzel" hint="Erscheint im Plan."><Inp value={f.kurz} maxLength={3}
              onChange={(e) => setF({ ...f, kurz: e.target.value.toUpperCase() })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
            <Field label="Beginn"><Inp type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Ende" hint="Früher als der Beginn bedeutet Folgetag."><Inp type="time" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} /></Field>
            <Field label="Pause in Minuten"><Inp type="number" min={0} value={f.pause || 0} onChange={(e) => setF({ ...f, pause: Number(e.target.value) })} /></Field>
          </div>
          <div className="karte" style={{ padding: 14, display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
            <div><Lab>Dauer</Lab><div style={{ fontSize: 19, fontWeight: 650, ...NUM }}>{n1(dauer(f))} h</div></div>
            <div><Lab>Brutto</Lab><div style={{ fontSize: 19, fontWeight: 650, color: C.dim, ...NUM }}>{n1(brutto(f))} h</div></div>
            <div><Lab>Nachtanteil 23–06 Uhr</Lab>
              <div style={{ fontSize: 19, fontWeight: 650, color: nachtAnteil(f) > 0 ? C.violet : C.dimmer, ...NUM }}>{n1(nachtAnteil(f))} h</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Bewertung auf das Stundenkonto"
              hint="1,0 ist volle Arbeitszeit. Rufbereitschaft wird üblicherweise mit 0,125 bis 0,25 gewertet.">
              <Inp type="number" step="0.025" min={0} max={1} value={f.faktor === undefined ? 1 : f.faktor}
                onChange={(e) => setF({ ...f, faktor: Number(e.target.value) })} /></Field>
            {(m.standorte || []).length > 1 && (
              <Field label="Standort" hint="Bestimmt die Feiertage für die Mindestbesetzung.">
                <Sel value={f.standortId || ""} onChange={(e) => setF({ ...f, standortId: e.target.value })}>
                  <option value="">Betriebsvorgabe</option>
                  {(m.standorte || []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</Sel></Field>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Ort oder Objekt"><Inp value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} /></Field>
            <Field label="Farbe">
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 4 }}>
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setF({ ...f, farbe: c })} 
                    style={{ width: 27, height: 27, borderRadius: 9, background: c, border: f.farbe === c ? "3px solid #fff" : "none",
                      boxShadow: f.farbe === c ? `0 0 0 2px ${c}` : "none", cursor: "pointer" }} />))}
              </div></Field>
          </div>
          <div className="karte" style={{ padding: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={!!f.posten} onChange={(e) => setF({ ...f, posten: e.target.checked, quelle: e.target.checked ? (f.quelle || m.dienstarten[0].id) : null })} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Außenposten — wird automatisch besetzt</span>
            </label>
            {f.posten && (<div style={{ marginTop: 13 }}>
              <Field label="Wird besetzt aus der Einheit im Dienst" hint="Die Besatzung wird rollierend gewählt und der Mindestbesetzung des Quelldienstes entnommen.">
                <Sel value={f.quelle || ""} onChange={(e) => setF({ ...f, quelle: e.target.value })}>
                  {m.dienstarten.filter((d) => !d.posten).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>
            </div>)}
          </div>
          <div>
            <Lab style={{ marginBottom: 10 }}>Mindestbesetzung</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 11 }}>
              {[["mo_do", "Mo – Do"], ["fr", "Freitag"], ["sa", "Samstag"], ["so", "So / Feiertag"]].map(([k, l]) => (
                <Field key={k} label={l}><Inp type="number" min={0} value={f.mindest[k]}
                  onChange={(e) => setF({ ...f, mindest: { ...f.mindest, [k]: Number(e.target.value) } })} /></Field>))}
            </div>
            <div style={{ fontSize: 12, color: C.dimmer, marginTop: 8 }}>Ein Feiertag hebt die Vorgabe an, senkt sie nie.</div>
          </div>
          {m.qualifikationen.length > 0 && (<div>
            <Lab style={{ marginBottom: 10 }}>Davon mit Qualifikation</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
              {m.qualifikationen.map((q) => (
                <Field key={q.id} label={q.name}><Inp type="number" min={0} value={(f.mindestQual || {})[q.id] || 0}
                  onChange={(e) => setF({ ...f, mindestQual: { ...(f.mindestQual || {}), [q.id]: Number(e.target.value) } })} /></Field>))}
            </div>
          </div>)}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
            <Btn kind="quiet" onClick={() => setBearbeitet(null)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={speichern}>Speichern</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

/* ================================ ANTRÄGE ================================ */
function Antraege({ sitz, akt }) {
  const m = sitz.mandant;
  const [reiter, setReiter] = useState("einzeln");
  const [f, setF] = useState("offen");
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const alle = m.anfragen.filter((a) => {
    const p = m.personen.find((x) => x.id === a.personId);
    return p && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(p, heute())));
  });
  const gezeigt = alle.filter((a) => f === "alle" || a.status === f).sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));

  return (
    <div>
      <H1 sub="Urlaubsanträge und Tauschanfragen aus dem eigenen Zuständigkeitsbereich. Bei Genehmigung werden Abwesenheit beziehungsweise Tausch unmittelbar in den Plan übernommen."
        right={<Seg value={reiter} onChange={setReiter}
          options={[{ id: "einzeln", label: "Einzelanträge" }, { id: "runde", label: "Jahresurlaubsrunde" }]} />}>
        Anträge</H1>

      {reiter === "runde" ? <Urlaubsrunde sitz={sitz} akt={akt} /> : (<>
      <Kapazitaetsvorschau sitz={sitz} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Seg value={f} onChange={setF} options={[
          { id: "offen", label: `Offen · ${alle.filter((a) => a.status === "offen").length}` },
          { id: "genehmigt", label: "Genehmigt" }, { id: "abgelehnt", label: "Abgelehnt" }, { id: "alle", label: "Alle" }]} />
      </div>

      <Card>
        {gezeigt.length === 0
          ? <Leer titel="Nichts zu entscheiden" text="In dieser Ansicht liegen derzeit keine Vorgänge." />
          : gezeigt.map((a, i) => {
            const p = m.personen.find((x) => x.id === a.personId);
            const partner = a.partnerId ? m.personen.find((x) => x.id === a.partnerId) : null;
            const eh = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
            const t = a.typ === "tausch" ? personTag(m, p, a.von) : null;
            return (
              <div key={a.id} className="row" style={{ display: "flex", gap: 16, padding: "17px 22px",
                borderBottom: i < gezeigt.length - 1 ? `1px solid ${C.lineSoft}` : "none", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0,
                  background: a.status === "offen" ? C.warn : a.status === "genehmigt" ? C.ok : C.danger }} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{p.vorname} {p.nachname}</span>
                    <Pill size="sm">{eh ? eh.name : "—"}</Pill>
                    <Pill size="sm" tone={a.typ === "tausch" ? "violet" : "accent"}>
                      {a.typ === "tausch" ? "Tausch" : abwArt(a.art).label}</Pill>
                  </div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 5, ...NUM }}>
                    {a.typ === "tausch"
                      ? `${fLang(a.von)} · ${t && t.dienstId ? (map[t.dienstId] || {}).name : "kein Dienst"} · mit ${partner ? `${partner.vorname} ${partner.nachname}` : "unbekannt"}`
                      : `${fKurz(a.von)} bis ${fKurz(a.bis)} · ${between(a.von, a.bis) + 1} Kalendertage`}
                  </div>
                  {a.text && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 4 }}>„{a.text}"</div>}
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4 }}>gestellt {a.erstellt}</div>
                  {a.antwort && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>Antwort: {a.antwort}</div>}
                </div>
                {a.status === "offen" ? (
                  <div style={{ display: "flex", gap: 9 }}>
                    <Btn size="sm" kind="ok" onClick={() => akt.entscheideAntrag(a.id, true)}>Genehmigen</Btn>
                    <Btn size="sm" kind="danger" onClick={() => akt.entscheideAntrag(a.id, false)}>Ablehnen</Btn>
                  </div>
                ) : <Pill tone={a.status === "genehmigt" ? "ok" : "danger"}>{a.status === "genehmigt" ? "genehmigt" : "abgelehnt"}</Pill>}
              </div>);
          })}
      </Card>
      </>)}
    </div>);
}

/* ================================ PERSONAL =============================== */
function Personal({ sitz, ym, akt, oeffnePerson }) {
  const m = sitz.mandant;
  const [q, setQ] = useState(""), [such, setSuch] = useState(""), [filter, setFilter] = useState("alle"), [neu, setNeu] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSuch(q), 200); return () => clearTimeout(t); }, [q]);
  const jahr = Number(ym.slice(0, 4)), d0 = heute();
  const zeigt = darf(sitz, "account.view.all");
  const [f, setF] = useState({ vorname: "", nachname: "", funktion: "Fachkraft", einheitId: m.einheiten[0].id,
    wochenstunden: m.einstellungen.sollWochenstunden, urlaubsanspruch: 30, eintritt: d0, rolle: "mitarbeiter" });

  const zeilen = useMemo(() => m.personen
    .filter((p) => imDienst(p, d0) || p.austritt)
    .filter((p) => filter === "alle" ? true : filter === "aus" ? !!p.austritt : einheitAm(p, d0) === filter)
    .filter((p) => such ? `${p.vorname} ${p.nachname}`.toLowerCase().includes(such.toLowerCase()) : true)
    .map((p) => ({ p, url: urlaubskonto(m, p, jahr), kto: stundenkonto(m, p, ym), nacht: nachtJahr(m, p, jahr) })), [m, filter, such, ym]);

  const preisWirkung = (r) => { const t = sitz.db.tarife.find((x) => x.id === m.tarif); return t ? t.preis[r] : 0; };

  return (
    <div>
      <H1 sub={`${m.personen.filter((p) => imDienst(p, d0)).length} Personen im Bestand. Jede vergebene Zugangsart wirkt unmittelbar auf die monatlichen Kosten des Betriebs.`}
        right={darf(sitz, "staff.edit") && <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={akt.oeffneImport}>Importieren</Btn>
          <Btn kind="primary" onClick={() => setNeu(true)}>Person hinzufügen</Btn></div>}>Personal</H1>

      {darf(sitz, "staff.edit") && m.personen.filter((p) => imDienst(p, d0)).length <= 1 && (
        <Card style={{ padding: 28, marginBottom: 22 }}>
          <Rubrik>Erster Schritt</Rubrik>
          <div style={{ fontSize: 23, fontWeight: 300, letterSpacing: "-.03em", margin: "10px 0 8px" }}>
            Der Betrieb hat noch <b style={{ fontWeight: 700 }}>kein Personal</b>.
          </div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, maxWidth: 620, marginBottom: 22 }}>
            Ohne Personal bleibt der Plan leer. Es gibt zwei Wege: eine vorhandene Liste aus
            Tabellenkalkulation oder Personalsystem einlesen, oder Personen einzeln anlegen.
            Beides lässt sich jederzeit ergänzen.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            <div className="karte" onClick={akt.oeffneImport}
              style={{ padding: 20, cursor: "pointer" }}>
              <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>Liste einlesen</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 14 }}>
                Aus Excel, CSV oder einem Personalsystem. Format wird erkannt, Spalten werden zugeordnet.
              </div>
              <span className="btn btn-sm btn-primary">Importieren</span>
            </div>
            <div className="karte" onClick={() => setNeu(true)}
              style={{ padding: 20, cursor: "pointer" }}>
              <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>Einzeln anlegen</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 14 }}>
                Name, Einheit, Wochenstunden. Zugangsart und Qualifikationen folgen danach.
              </div>
              <span className="btn btn-sm">Person hinzufügen</span>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 18, lineHeight: 1.5 }}>
            Die Zugangsart wird in der Liste unten je Person vergeben — sie bestimmt, was jemand sehen
            und ändern darf, und wirkt unmittelbar auf die monatlichen Kosten.
          </div>
        </Card>)}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <Inp value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name suchen" style={{ width: 210 }} />
        <Seg value={filter} onChange={setFilter} options={[{ id: "alle", label: "Alle" },
          ...m.einheiten.map((e) => ({ id: e.id, label: e.name.replace(m.einheitLabel, "").trim() || e.name })),
          { id: "aus", label: "Ausgetreten" }]} />
      </div>

      <Card style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
          <thead><tr>{["Person", m.einheitLabel, "Zugangsart", "Qualifikationen", "Resturlaub", "Stundenkonto", `Nacht ${jahr}`, ""].map((h, i) => (
            <th key={i} style={{ textAlign: i > 3 ? "right" : "left", padding: "14px 18px", borderBottom: `1px solid ${C.lineSoft}` }}><Lab>{h}</Lab></th>))}</tr></thead>
          <tbody>{zeilen.map(({ p, url, kto, nacht }) => {
            const e = m.einheiten.find((x) => x.id === einheitAm(p, d0));
            const r = rolle(p.rolle);
            return (<tr key={p.id} className="row">
              <td onClick={() => oeffnePerson(p.id)} style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer" }}>
                <div style={{ fontSize: 14, opacity: p.austritt ? .5 : 1 }}>{p.nachname}, {p.vorname}</div>
                <div style={{ fontSize: 12, color: C.dimmer }}>{p.funktion}{p.austritt ? ` · ausgetreten ${fKurz(p.austritt)}` : ""}</div></td>
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, color: e ? e.farbe : C.dimmer }}>{e ? e.name : "—"}</td>
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
                {darf(sitz, "roles.assign") ? (
                  <Sel value={p.rolle} onChange={(ev) => akt.setzeRolle(p.id, ev.target.value)} style={{ width: 180 }}>
                    {ROLLEN.filter((x) => !x.extern).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Sel>
                ) : <Pill size="sm">{r.label}</Pill>}
                <div style={{ fontSize: 11, color: C.dimmer, marginTop: 4, ...NUM }}>
                  {r.berechnet ? (preisWirkung(p.rolle) === 0 ? "im Tarif enthalten" : `${eur(preisWirkung(p.rolle))} je Monat`) : "kostenfrei"}</div></td>
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {p.qualifikationen.map((qid) => { const qq = m.qualifikationen.find((x) => x.id === qid);
                    return qq ? <Pill key={qid} size="sm">{qq.kurz}</Pill> : null; })}</div></td>
              {zeigt ? (<>
                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right" }}>
                  <div style={{ fontSize: 14, color: url.rest < 5 ? C.warn : C.text, ...NUM }}>{url.rest}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>von {url.anspruch}</div></td>
                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 14,
                  color: Math.abs(kto) < 12 ? C.dim : kto > 0 ? C.warn : C.accent, ...NUM }}>{sgn(kto)} h</td>
                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right" }}>
                  <div style={{ fontSize: 14, ...NUM }}>{n1(nacht.stunden)} h</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>{nacht.anzahl} Dienste</div></td>
              </>) : <td colSpan={3} style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 12.5, color: C.dimmer }}>
                Konten nur für die Planung sichtbar</td>}
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", color: C.dimmer }}>›</td>
            </tr>); })}</tbody>
        </table>
      </Card>

      {darf(sitz, "staff.edit") && (
        <Fussleiste>
          <span style={{ fontSize: 13.5, color: C.dim, flex: 1, minWidth: 130 }}>
            {zeilen.length} von {m.personen.filter((p) => imDienst(p, d0)).length} angezeigt</span>
          <Btn onClick={akt.oeffneImport}>Importieren</Btn>
          <Btn kind="primary" onClick={() => setNeu(true)}>Person hinzufügen</Btn>
        </Fussleiste>)}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Person hinzufügen" width={580}>
        <div style={{ display: "grid", gap: 15 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Vorname"><Inp value={f.vorname} onChange={(e) => setF({ ...f, vorname: e.target.value })} /></Field>
            <Field label="Nachname"><Inp value={f.nachname} onChange={(e) => setF({ ...f, nachname: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Funktion"><Sel value={f.funktion} onChange={(e) => setF({ ...f, funktion: e.target.value })}>
              {["Schichtleitung", "Stellvertretung", "Fachkraft", "Hilfskraft", "Auszubildende"].map((x) => <option key={x}>{x}</option>)}</Sel></Field>
            <Field label={m.einheitLabel}><Sel value={f.einheitId} onChange={(e) => setF({ ...f, einheitId: e.target.value })}>
              {m.einheiten.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Sel></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
            <Field label="Wochenstunden"><Inp type="number" step="0.5" value={f.wochenstunden} onChange={(e) => setF({ ...f, wochenstunden: Number(e.target.value) })} /></Field>
            <Field label="Urlaubsanspruch"><Inp type="number" value={f.urlaubsanspruch} onChange={(e) => setF({ ...f, urlaubsanspruch: Number(e.target.value) })} /></Field>
            <Field label="Eintritt"><Inp type="date" value={f.eintritt} onChange={(e) => setF({ ...f, eintritt: e.target.value })} /></Field>
          </div>
          <Field label="Zugangsart" hint={`${rolle(f.rolle).text} — ${rolle(f.rolle).berechnet && preisWirkung(f.rolle) > 0 ? `kostet ${eur(preisWirkung(f.rolle))} je Monat` : "ohne Zusatzkosten"}.`}>
            <Sel value={f.rolle} onChange={(e) => setF({ ...f, rolle: e.target.value })}>
              {ROLLEN.filter((x) => !x.extern).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Sel></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={() => { if (f.vorname && f.nachname) { akt.neuePerson(f); setNeu(false); setF({ ...f, vorname: "", nachname: "" }); } }}>Hinzufügen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

/* ============================== PERSONALAKTE ============================= */
function Personalakte({ sitz, personId, ym, onClose, akt }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === personId);
  const [form, setForm] = useState({ art: "urlaub", von: heute(), bis: heute() });
  const [vers, setVers] = useState({ einheitId: "", ab: heute() });
  const [fehler, setFehler] = useState(null);
  if (!p) return null;
  const jahr = Number(ym.slice(0, 4)), d0 = heute();
  const e = m.einheiten.find((x) => x.id === einheitAm(p, d0));
  const url = urlaubskonto(m, p, jahr), ist = istStunden(m, p, ym), soll = sollStunden(m, p, ym);
  const kto = stundenkonto(m, p, ym), nacht = nachtJahr(m, p, jahr);
  const editierbar = darf(sitz, "staff.edit") || darfEinheit(sitz, einheitAm(p, d0));
  const zeigt = darf(sitz, "account.view.all") || sitz.person.id === p.id;
  const nm = Array.from({ length: 12 }, (_, i) => istStunden(m, p, `${jahr}-${pad(i + 1)}`).nacht);
  const maxN = Math.max(1, ...nm);

  const eintragen = () => {
    setFehler(null);
    if (form.bis < form.von) return setFehler("Das Ende liegt vor dem Beginn.");
    const k = m.abwesenheiten.find((a) => a.personId === p.id && a.von <= form.bis && form.von <= a.bis);
    if (k) return setFehler(`Überschneidet sich mit ${abwArt(k.art).label} vom ${fKurz(k.von)} bis ${fKurz(k.bis)}. Bestehenden Eintrag zuerst kürzen oder löschen.`);
    akt.neueAbwesenheit(p.id, form.art, form.von, form.bis);
  };

  return (
    <Sheet open onClose={onClose} titel={`${p.vorname} ${p.nachname}`} width={800}>
      <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
        <Pill tone="accent">{e ? e.name : "ohne Zuordnung"}</Pill><Pill>{p.funktion}</Pill>
        {(m.standorte || []).length > 1 && <Pill>{((m.standorte || []).find((x) => x.id === (e || {}).standortId) || {}).name || "—"}</Pill>}
        {p.springer && <Pill tone="violet">Springer</Pill>}
        {p.teilzeit && p.teilzeit.aktiv && <Pill>Teilzeit {Math.round(teilzeitProfil(m, p).quote * 100)} %</Pill>}
        <Pill tone="violet">{rolle(p.rolle).label}</Pill><Pill>{n1(p.wochenstunden)} h/Woche</Pill>
        {p.austritt && <Pill tone="danger">ausgetreten {fKurz(p.austritt)}</Pill>}
      </div>

      {zeigt && (<>
        <KpiRow min={170}>
          <Kpi label="Resturlaub" value={url.rest} unit="Tage" tone={url.rest < 5 ? "warn" : "ok"} sub={`${url.genommen} von ${url.anspruch} genommen`} />
          <Kpi label={`Stunden ${MON[Number(ym.slice(5)) - 1]}`} value={sgn(ist.gesamt - soll)} unit="h"
            tone={Math.abs(ist.gesamt - soll) < 7 ? "ok" : "warn"} sub={`${n1(ist.gesamt)} von ${n1(soll)} h`} />
          <Kpi label="Konto kumuliert" value={sgn(kto)} unit="h" tone={Math.abs(kto) < 18 ? "ok" : "warn"} />
          <Kpi label={`Nachtstunden ${jahr}`} value={n1(nacht.stunden)} unit="h" sub={`${nacht.anzahl} Nachtdienste`} />
        </KpiRow>
        <div style={{ margin: "24px 0" }}>
          <Lab style={{ marginBottom: 11 }}>Nachtarbeit im Jahresverlauf</Lab>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
            {nm.map((v, i) => (<div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div title={`${MON[i]}: ${n1(v)} h`} style={{ height: Math.max(3, (v / maxN) * 56),
                background: i === Number(ym.slice(5)) - 1 ? C.accent : "rgba(43,52,64,.24)", borderRadius: "5px 5px 0 0",
                transition: "height .4s" }} />
              <div style={{ fontSize: 10, color: C.dimmer, marginTop: 5 }}>{MON[i].slice(0, 1)}</div></div>))}
          </div>
        </div>
      </>)}

      <Lab style={{ marginBottom: 11 }}>Qualifikationen</Lab>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        {m.qualifikationen.map((q) => { const an = p.qualifikationen.includes(q.id);
          return (<button key={q.id} disabled={!editierbar} onClick={() => akt.toggleQual(p.id, q.id)} className="btn btn-sm"
            style={{ background: an ? `${q.farbe}1C` : C.bg, color: an ? q.farbe : C.dimmer, fontWeight: 600 }}>
            {an ? "✓ " : ""}{q.name}</button>); })}
      </div>

      {editierbar && (<>
        <Lab style={{ marginBottom: 11 }}>Beschäftigungsform</Lab>
        <div className="karte" style={{ padding: 16, marginBottom: 22 }}>
          <div style={{ display: "grid", gap: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Wochenstunden" hint={`Vollzeit sind ${n1(m.einstellungen.sollWochenstunden)} h.`}>
                <Inp type="number" step="0.5" value={p.wochenstunden}
                  onChange={(e) => akt.setzePerson(p.id, "wochenstunden", Number(e.target.value))} /></Field>
              <Field label="Verteilung">
                <Sel value={p.springer ? "springer" : (p.teilzeit && p.teilzeit.aktiv ? p.teilzeit.modus : "voll")}
                  onChange={(e) => akt.setzeBeschaeftigung(p.id, e.target.value)}>
                  <option value="voll">Volle Rotation</option>
                  <option value="quote">Teilzeit · anteilige Dienste</option>
                  <option value="wochentage">Teilzeit · feste Wochentage</option>
                  <option value="springer">Springerpool · keine Rotation</option>
                </Sel></Field>
            </div>
            {p.teilzeit && p.teilzeit.aktiv && p.teilzeit.modus === "wochentage" && (
              <div>
                <Lab style={{ marginBottom: 8 }}>Arbeitstage</Lab>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {DOW.map((wt, i) => {
                    const an = (p.teilzeit.wochentage || []).includes(i);
                    return <button key={i} onClick={() => akt.toggleWochentag(p.id, i)} className="btn btn-sm"
                      style={{ background: an ? "rgba(43,52,64,.12)" : C.bg,
                        color: an ? C.text : C.dimmer, fontWeight: 600, minWidth: 44 }}>{wt}</button>; })}
                </div>
              </div>)}
            {(() => { const prof = teilzeitProfil(m, p);
              return (
                <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
                  {p.springer
                    ? "Springer folgen keiner Schichtfolge. Sie werden gezielt eingeteilt und stehen in der Ersatzsuche ganz oben."
                    : prof.teilzeit
                      ? `Leistet ${prof.dienste} von ${prof.gesamt} Diensten je Zyklus — das entspricht ${Math.round(prof.quote * 100)} Prozent. Die Dienste werden gleichmäßig über den Zyklus verteilt.`
                      : "Volle Rotation nach der Schichtfolge der Einheit."}
                </div>); })()}
          </div>
        </div>

        <Lab style={{ marginBottom: 11 }}>Stundenkonto über zwölf Monate</Lab>
      <Card style={{ padding: 22, marginBottom: 22 }}>
        {(() => {
          const kv = kontoVerlauf(m, p, ym, 12);
          const g = m.einstellungen.ausgleichGrenze || 40;
          return (<>
            <div style={{ display: "flex", gap: 22, marginBottom: 18, flexWrap: "wrap", alignItems: "baseline" }}>
              <div><Lab>Aktuell</Lab><div style={{ fontSize: 26, fontWeight: 650, ...NUM,
                color: Math.abs(kv.punkte[11].konto) > g ? C.warn : C.text }}>
                {sgn(kv.punkte[11].konto)} h</div></div>
              <div><Lab>Entwicklung</Lab><div style={{ fontSize: 15, fontWeight: 600, marginTop: 5,
                color: kv.richtung === "stabil" ? C.ok : kv.richtung === "steigend" ? C.warn : C.accent }}>
                {kv.richtung === "stabil" ? "stabil" : kv.richtung === "steigend"
                  ? `steigend, ${sgn(kv.trend)} h im Jahr` : `fallend, ${sgn(kv.trend)} h im Jahr`}</div></div>
            </div>
            <LinienDiagramm daten={kv.punkte.map((x) => ({ label: x.label, y: x.konto }))}
              farbe={C.accent} einheit=" h" />
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
              Das grüne Band ist der Bereich innerhalb der Ausgleichsgrenze von {n1(g)} h. Die Frage ist
              nicht der aktuelle Stand, sondern ob die Linie zurückläuft.
            </div>
          </>);
        })()}
      </Card>

      <Lab style={{ marginBottom: 11 }}>Notiz zur Planung</Lab>
      <Card style={{ padding: 18, marginBottom: 22 }}>
        <textarea className="inp" rows={2} value={p.notiz || ""} disabled={!editierbar}
          placeholder="z. B. neu im Nachtdienst, ab Mai reduziert, kann Stapler fahren"
          onChange={(e) => akt.setzePersonNotiz(p.id, e.target.value)} />
        <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 9, lineHeight: 1.5 }}>
          Planungswissen, das sonst im Kopf bleibt. Sichtbar für alle mit Personalzugriff, nicht für
          die Person selbst.
        </div>
      </Card>

      <Lab style={{ marginBottom: 11 }}>Einsatzeinschränkungen</Lab>
        <div className="karte" style={{ padding: 16, marginBottom: 22 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {[["keineNacht", "Keine Nachtdienste"], ["keinAlleindienst", "Darf nicht allein eingeteilt werden"]].map(([k, l]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
                <input type="checkbox" checked={!!(p.einschraenkungen || {})[k]}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, k, e.target.checked)} />
                <span style={{ fontSize: 13.5 }}>{l}</span></label>))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Höchstzahl Dienste je Woche" hint="Leer bedeutet keine Begrenzung.">
                <Inp type="number" min={0} value={(p.einschraenkungen || {}).maxDiensteWoche || ""}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, "maxDiensteWoche", e.target.value ? Number(e.target.value) : null)} /></Field>
              <Field label="Wiedereingliederung bis" hint="Leer beendet die Stufenregelung.">
                <Inp type="date" value={((p.einschraenkungen || {}).wiedereingliederung || {}).bis || ""}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, "wiedereingliederung", e.target.value
                    ? { von: heute(), bis: e.target.value, maxStundenWoche: ((p.einschraenkungen || {}).wiedereingliederung || {}).maxStundenWoche || 20 }
                    : null)} /></Field>
            </div>
            {(p.einschraenkungen || {}).wiedereingliederung && (
              <Field label="Zulässige Wochenstunden während der Wiedereingliederung">
                <Inp type="number" step="0.5" value={p.einschraenkungen.wiedereingliederung.maxStundenWoche}
                  onChange={(e) => akt.setzeEinschraenkung(p.id, "wiedereingliederung",
                    { ...p.einschraenkungen.wiedereingliederung, maxStundenWoche: Number(e.target.value) })} /></Field>)}
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
            Verstöße erscheinen in der Prüfung und in der Ersatzsuche werden betroffene Personen ausgeschlossen.
          </div>
        </div>
      </>)}

      <Lab style={{ marginBottom: 11 }}>Abwesenheiten {jahr}</Lab>
      {m.abwesenheiten.filter((a) => a.personId === p.id).length === 0 &&
        <div style={{ fontSize: 13, color: C.dimmer, marginBottom: 16 }}>Keine Einträge.</div>}
      {m.abwesenheiten.filter((a) => a.personId === p.id).sort((a, b) => (a.von < b.von ? -1 : 1)).map((a) => {
        const meta = abwArt(a.art), z = url.zeilen.find((r) => r.id === a.id);
        return (<div key={a.id} className="karte" style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "11px 14px", marginBottom: 8 }}>
          <div style={{ fontSize: 13.5 }}>
            <span style={{ color: meta.farbe, fontWeight: 600 }}>{meta.label}</span>
            <span style={{ color: C.dim, marginLeft: 11, ...NUM }}>{fKurz(a.von)} – {fKurz(a.bis)}</span>
            {z && z.tage > 0 && <span style={{ color: C.dimmer, marginLeft: 11, ...NUM }}>{z.tage} Urlaubstage</span>}</div>
          {editierbar && <Btn size="sm" kind="danger" onClick={() => akt.loescheAbwesenheit(a.id)}>Löschen</Btn>}
        </div>); })}

      {editierbar && (<>
        <div style={{ paddingTop: 20, marginTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 13 }}>Abwesenheit eintragen</Lab>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 11, alignItems: "end" }}>
            <Field label="Art"><Sel value={form.art} onChange={(e2) => setForm({ ...form, art: e2.target.value })}>
              {ABW.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></Field>
            <Field label="Von"><Inp type="date" value={form.von} onChange={(e2) => setForm({ ...form, von: e2.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={form.bis} onChange={(e2) => setForm({ ...form, bis: e2.target.value })} /></Field>
            <Btn kind="primary" onClick={eintragen}>Eintragen</Btn>
          </div>
          {fehler && <div style={{ marginTop: 11, padding: "11px 14px", borderRadius: 11, background: C.dangerLight, color: C.danger, fontSize: 13 }}>{fehler}</div>}
        </div>
        <div style={{ paddingTop: 20, marginTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
          <Lab style={{ marginBottom: 13 }}>Versetzung und Austritt</Lab>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 11, alignItems: "end", marginBottom: 12 }}>
            <Field label={`Neue ${m.einheitLabel}`}><Sel value={vers.einheitId} onChange={(e2) => setVers({ ...vers, einheitId: e2.target.value })}>
              <option value="">— wählen —</option>
              {m.einheiten.filter((x) => x.id !== einheitAm(p, d0)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Sel></Field>
            <Field label="Wirksam ab"><Inp type="date" value={vers.ab} onChange={(e2) => setVers({ ...vers, ab: e2.target.value })} /></Field>
            <Btn onClick={() => vers.einheitId && akt.versetze(p.id, vers.einheitId, vers.ab)}>Versetzen</Btn>
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 14, lineHeight: 1.45 }}>
            Vergangene Monate bleiben unverändert — die Zuordnung gilt erst ab dem Stichtag.</div>
          {p.zugehoerigkeit.length > 1 && <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 14 }}>
            Verlauf: {p.zugehoerigkeit.map((z) => `${fKurz(z.ab)} ${(m.einheiten.find((x) => x.id === z.einheitId) || {}).name || "?"}`).join(" → ")}</div>}
          {!p.austritt
            ? <Btn kind="danger" onClick={() => { const d = window.prompt("Austritt zum (JJJJ-MM-TT):", d0); if (d) akt.setzeAustritt(p.id, d); }}>Austritt eintragen</Btn>
            : <Btn onClick={() => akt.setzeAustritt(p.id, null)}>Austritt zurücknehmen</Btn>}
        </div>
      </>)}
    </Sheet>);
}

/* ================================ PRÜFUNG ================================ */
function Pruefung({ sitz, ym, oeffneTag }) {
  const m = sitz.mandant;
  const [y, mo] = ym.split("-").map(Number);
  const von = `${ym}-01`, bis = `${ym}-${pad(dim_(y, mo - 1))}`;
  const [f, setF] = useState("alle");
  const befunde = useMemo(() => pruefen(m, von, bis), [m, ym]);
  const arten = [["alle", "Alle"], ["besetzung", "Besetzung"], ["qualifikation", "Qualifikation"], ["ruhezeit", "Ruhezeit"],
    ["folge", "Dienstfolge"], ["nachtfolge", "Nachtfolge"], ["abwesend", "Abwesenheit"], ["ueberlappung", "Überlappung"], ["urlaub", "Urlaub"]];
  const gez = befunde.filter((b) => f === "alle" || b.art === f);
  const krit = befunde.filter((b) => b.schwere === "danger").length;

  return (
    <div>
      <H1 sub={`Geprüft werden Mindestbesetzung, Qualifikationen, Ruhezeit (${m.einstellungen.ruhezeit} h), Dienst- und Nachtfolgen, Dienst trotz Abwesenheit, überlappende Abwesenheiten und gleichzeitige Urlaube.`}>
        Prüfung · {MON[mo - 1]} {y}</H1>
      <KpiRow min={200}>
        <Kpi label="Befunde" value={befunde.length} tone={befunde.length ? "warn" : "ok"} />
        <Kpi label="Kritisch" value={krit} tone={krit ? "danger" : "ok"} sub="sofort klären" />
        <Kpi label="Betroffene Tage" value={new Set(befunde.map((b) => b.datum)).size} sub={`von ${dim_(y, mo - 1)}`} />
      </KpiRow>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 16px" }}>
        {arten.map(([id, l]) => { const n = id === "alle" ? befunde.length : befunde.filter((b) => b.art === id).length;
          return <Btn key={id} size="sm" kind={f === id ? "primary" : "plain"} onClick={() => setF(id)}>{l}{n > 0 ? ` · ${n}` : ""}</Btn>; })}
      </div>
      <Card>
        {gez.length === 0
          ? <Leer titel="Keine Befunde" text="Der Monat erfüllt in dieser Kategorie alle hinterlegten Regeln." />
          : gez.map((b, i) => (
            <div key={b.id + i} className="row" onClick={() => oeffneTag(b.datum)}
              style={{ display: "flex", gap: 15, padding: "15px 22px", cursor: "pointer",
                borderBottom: i < gez.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <span style={{ width: 5, borderRadius: 3, background: b.schwere === "danger" ? C.danger : C.warn, flexShrink: 0 }} />
              <div style={{ minWidth: 84 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, ...NUM }}>{fKurz(b.datum)}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer }}>{DOW[dow(b.datum)]}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: b.schwere === "danger" ? C.danger : C.warn, fontWeight: 500 }}>{b.titel}</div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{b.text}</div></div>
            </div>))}
      </Card>
    </div>);
}
