
/* ==========================================================================
   MEINE SCHICHTEN — die Sicht der Mitarbeiterrolle
   ========================================================================== */
function MeineSchichten({ sitz, akt, ym }) {
  const { mandant: m, person: ich } = sitz;
  const [antrag, setAntrag] = useState(null);
  const [form, setForm] = useState({ art: "urlaub", von: heute(), bis: heute(), text: "" });
  const [tausch, setTausch] = useState({ datum: "", partnerId: "", text: "" });
  const [fehler, setFehler] = useState(null);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const ist = istStunden(m, ich, ym), soll = sollStunden(m, ich, ym);
  const url = urlaubskonto(m, ich, Number(ym.slice(0, 4)));
  const kto = stundenkonto(m, ich, ym);
  const tage = Array.from({ length: 28 }, (_, i) => addDays(heute(), i));
  const meine = m.anfragen.filter((a) => a.personId === ich.id).sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const offen = offeneErfassung(m, ich, addDays(heute(), -1));
  const einsatz = m.anfragen.filter((a) => a.personId === ich.id && a.typ === "einsatz" && a.status === "offen");
  const [korrektur, setKorrektur] = useState(null);
  const frei = freigabeStand(m, ym);
  const einheit = m.einheiten.find((e) => e.id === einheitAm(ich, heute()));

  const sendeUrlaub = () => {
    setFehler(null);
    if (form.bis < form.von) return setFehler("Das Ende liegt vor dem Beginn.");
    const k = m.abwesenheiten.find((a) => a.personId === ich.id && a.von <= form.bis && form.von <= a.bis);
    if (k) return setFehler(`Überschneidet sich mit ${abwArt(k.art).label} vom ${fKurz(k.von)} bis ${fKurz(k.bis)}.`);
    akt.stelleAntrag({ typ: "abwesenheit", art: form.art, von: form.von, bis: form.bis, text: form.text });
    setAntrag(null); setForm({ art: "urlaub", von: heute(), bis: heute(), text: "" });
  };
  const sendeTausch = () => {
    setFehler(null);
    if (!tausch.datum || !tausch.partnerId) return setFehler("Datum und Tauschpartner werden benötigt.");
    akt.stelleAntrag({ typ: "tausch", von: tausch.datum, bis: tausch.datum, partnerId: tausch.partnerId, text: tausch.text });
    setAntrag(null); setTausch({ datum: "", partnerId: "", text: "" });
  };

  return (
    <div>
      <H1 sub={`${ich.vorname} ${ich.nachname} · ${einheit ? einheit.name : "ohne Zuordnung"} · ${rolle(ich.rolle).label}`}
        right={<div style={{ display: "flex", gap: 9 }}>
          <Btn onClick={() => akt.oeffneWunsch(ich.id)}>Wunschdienste</Btn>
          <Btn onClick={() => akt.oeffneVerfuegbarkeit(ich.id)}>Verfügbarkeit</Btn>
          <Btn kind="danger" onClick={() => akt.oeffneKrankmeldung(ich.id)}>Krank melden</Btn>
          {darf(sitz, "req.create") && <>
            <Btn kind="primary" onClick={() => setAntrag("abwesenheit")}>Antrag stellen</Btn>
            <Btn onClick={() => setAntrag("tausch")}>Tausch anfragen</Btn></>}
          <Btn kind="quiet" onClick={() => akt.kalenderAbo(ich.id)}>Kalender</Btn>
        </div>}>Meine Schichten</H1>

      <KpiRow min={200}>
        <Kpi label="Stunden im Monat" value={n1(ist.gesamt)} unit="h" sub={`Soll ${n1(soll)} h · ${sgn(ist.gesamt - soll)} h`}
          tone={Math.abs(ist.gesamt - soll) < 7 ? "ok" : "warn"} />
        <Kpi label="Stundenkonto" value={sgn(kto)} unit="h" tone={Math.abs(kto) < 18 ? "ok" : "warn"} sub="kumuliert seit Jahresbeginn" />
        <Kpi label="Resturlaub" value={url.rest} unit="Tage" tone={url.rest < 5 ? "warn" : "ok"} sub={`von ${url.anspruch} Tagen`} />
        <Kpi label="Nachtstunden" value={n1(ist.nacht)} unit="h" sub={`${ist.naechte} Nachtdienste im Monat`} />
      </KpiRow>

      {einsatz.length > 0 && (
        <Card style={{ marginTop: 20, background: C.dangerLight }}>
          <CardHead right={<Pill tone="danger">{einsatz.length}</Pill>}>Einsatzanfragen</CardHead>
          {einsatz.map((a) => {
            const da = map[a.dienstId];
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px",
                borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                <Zelle da={da} size={32} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{fLang(a.von)}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                    {da ? `${da.name} · ${da.start}–${da.ende} · ${n1(dauer(da))} h` : a.dienstId}</div>
                </div>
                <Btn size="sm" kind="ok" onClick={() => akt.beantworteEinsatz(a.id, true)}>Zusagen</Btn>
                <Btn size="sm" kind="quiet" onClick={() => akt.beantworteEinsatz(a.id, false)}>Absagen</Btn>
              </div>); })}
        </Card>)}

      <Card style={{ marginTop: 20 }}>
        <CardHead right={<Lab>zwölf Monate</Lab>}>Mein Stundenkonto</CardHead>
        <div style={{ padding: "22px 24px 18px" }}>
          <LinienDiagramm daten={kontoVerlauf(m, ich, ym, 12)} wert="kto" label="label" einheit=" h"
            hoehe={140} farbe={stundenkonto(m, ich, ym) > 0 ? C.warn : C.ok} />
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
            Steigt die Linie über Monate, steht Freizeitausgleich an. Sprich das mit der Planung ab.
          </div>
        </div>
      </Card>

      {offen.length > 0 && (
        <Card style={{ marginTop: 20 }}>
          <CardHead right={<Pill tone="warn">{offen.length}</Pill>}>Zeiten bestätigen</CardHead>
          <div style={{ padding: "14px 22px 6px", fontSize: 13, color: C.dim, lineHeight: 1.5 }}>
            Solange die tatsächliche Zeit nicht bestätigt ist, bleibt das Stundenkonto eine Hochrechnung.
          </div>
          {offen.slice(0, 6).map((d) => {
            const t = personTag(m, ich, d), da = map[t.dienstId];
            return (
              <div key={d} className="row" style={{ display: "flex", alignItems: "center", gap: 14,
                padding: "12px 22px", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                <Zelle da={da} size={30} />
                <div style={{ flex: 1, minWidth: 130 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, ...NUM }}>{fKurz(d)} · {da.name}</div>
                  <div style={{ fontSize: 12, color: C.dimmer, ...NUM }}>geplant {da.start}–{da.ende} · {n1(dauer(da))} h</div>
                </div>
                <Btn size="sm" kind="ok" onClick={() => akt.bestaetigeZeit(ich.id, d, null, null, "")}>Wie geplant</Btn>
                <Btn size="sm" onClick={() => setKorrektur({ datum: d, start: da.start, ende: da.ende, grund: "" })}>Abweichend</Btn>
              </div>); })}
        </Card>)}

      {meine.length > 0 && (
        <Card style={{ marginTop: 20 }}>
          <CardHead>Meine Anträge</CardHead>
          <div>{meine.slice(0, 6).map((a) => (
            <div key={a.id} className="row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>
                {a.status === "offen" ? "offen" : a.status === "genehmigt" ? "genehmigt" : "abgelehnt"}</Pill>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>
                  {a.typ === "tausch" ? "Tauschanfrage" : abwArt(a.art).label}
                  <span style={{ color: C.dimmer, ...NUM }}> · {fKurz(a.von)}{a.bis !== a.von ? ` – ${fKurz(a.bis)}` : ""}</span>
                </div>
                {a.text && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 2 }}>{a.text}</div>}
                {a.antwort && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Antwort: {a.antwort}</div>}
              </div>
              {a.status === "offen" && <Btn size="sm" kind="quiet" onClick={() => akt.zieheAntragZurueck(a.id)}>Zurückziehen</Btn>}
            </div>))}</div>
        </Card>)}

      <Card style={{ marginTop: 20 }}>
        <CardHead right={<Pill size="sm" tone={frei ? "ok" : "warn"}>{frei ? "freigegeben" : "Entwurf"}</Pill>}>
          Kommende Dienste</CardHead>
        <div>{tage.map((d) => {
          const t = personTag(m, ich, d), da = map[t.dienstId], fei = feiertag(d, m.bundesland);
          return (
            <div key={d} className="row" style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 22px",
              borderBottom: `1px solid ${C.lineSoft}`, background: d === heute() ? "rgba(43,52,64,.055)" : "transparent" }}>
              <div style={{ width: 104, flexShrink: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: d === heute() ? 650 : 500, ...NUM }}>{fKurz(d)}</div>
                <div style={{ fontSize: 11.5, color: fei ? C.danger : C.dimmer }}>{DOW[dow(d)]}{fei ? " · Feiertag" : ""}</div>
              </div>
              <Zelle da={da} abw={t.abwesenheit} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>
                  {t.abwesenheit ? abwArt(t.abwesenheit.art).label : da ? da.name : "frei"}</div>
                {da && <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{da.start}–{da.ende} · {n1(dauer(da))} h · {da.ort}</div>}
              </div>
              {da && nachtAnteil(da) >= 2 && <Pill size="sm" tone="violet">Nacht</Pill>}
              {t.quelle === "abweichung" && <Pill size="sm" tone="warn">geändert</Pill>}
            </div>);
        })}</div>
      </Card>

      <Sheet open={!!korrektur} onClose={() => setKorrektur(null)} titel="Tatsächliche Zeit" width={520}>
        {korrektur && (<div style={{ display: "grid", gap: 15 }}>
          <div style={{ fontSize: 13.5, color: C.dim }}>{fLang(korrektur.datum)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Beginn"><Inp type="time" value={korrektur.start}
              onChange={(e) => setKorrektur({ ...korrektur, start: e.target.value })} /></Field>
            <Field label="Ende"><Inp type="time" value={korrektur.ende}
              onChange={(e) => setKorrektur({ ...korrektur, ende: e.target.value })} /></Field>
          </div>
          <Field label="Grund" hint="Zum Beispiel verlängerte Übergabe oder Einsatz über die Schicht hinaus.">
            <Inp value={korrektur.grund} onChange={(e) => setKorrektur({ ...korrektur, grund: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setKorrektur(null)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={() => { akt.bestaetigeZeit(ich.id, korrektur.datum, korrektur.start, korrektur.ende, korrektur.grund); setKorrektur(null); }}>
              Bestätigen</Btn>
          </div>
        </div>)}
      </Sheet>

      <Sheet open={!!antrag} onClose={() => { setAntrag(null); setFehler(null); }}
        titel={antrag === "tausch" ? "Tausch anfragen" : "Antrag stellen"} width={560}>
        {antrag === "abwesenheit" ? (
          <div style={{ display: "grid", gap: 15 }}>
            <Field label="Art"><Sel value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>
              {ABW.filter((a) => a.id !== "krank").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
              <Field label="Von"><Inp type="date" value={form.von} onChange={(e) => setForm({ ...form, von: e.target.value })} /></Field>
              <Field label="Bis"><Inp type="date" value={form.bis} onChange={(e) => setForm({ ...form, bis: e.target.value })} /></Field>
            </div>
            <Field label="Anmerkung"><Inp value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="freiwillig" /></Field>
            {fehler && <div style={{ padding: "11px 14px", borderRadius: 11, background: C.dangerLight, color: C.danger, fontSize: 13 }}>{fehler}</div>}
            <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              Beim Urlaub werden nur Tage angerechnet, an denen laut Schichtfolge Dienst gewesen wäre.
              Der Antrag geht an die Planung der eigenen Einheit.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setAntrag(null)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={sendeUrlaub}>Absenden</Btn></div>
          </div>) : (
          <div style={{ display: "grid", gap: 15 }}>
            <Field label="Dienst am" hint="Nur Tage, an denen du eingeteilt bist.">
              <Sel value={tausch.datum} onChange={(e) => setTausch({ ...tausch, datum: e.target.value })}>
                <option value="">— wählen —</option>
                {tage.filter((d) => personTag(m, ich, d).dienstId).map((d) => {
                  const da = map[personTag(m, ich, d).dienstId];
                  return <option key={d} value={d}>{fLang(d)} — {da.name}</option>; })}</Sel></Field>
            <Field label="Tauschpartner">
              <Sel value={tausch.partnerId} onChange={(e) => setTausch({ ...tausch, partnerId: e.target.value })}>
                <option value="">— wählen —</option>
                {m.personen.filter((p) => p.id !== ich.id && imDienst(p, heute()))
                  .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</Sel></Field>
            <Field label="Anmerkung"><Inp value={tausch.text} onChange={(e) => setTausch({ ...tausch, text: e.target.value })} /></Field>
            {fehler && <div style={{ padding: "11px 14px", borderRadius: 11, background: C.dangerLight, color: C.danger, fontSize: 13 }}>{fehler}</div>}
            <div style={{ fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              Bei Genehmigung werden beide Dienste getauscht. Ruhezeit und Besetzung werden dabei geprüft.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setAntrag(null)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={sendeTausch}>Absenden</Btn></div>
          </div>)}
      </Sheet>
    </div>);
}

/* ============================== LAGEBILD ================================= */
function Lagebild({ sitz, oeffneTag, akt }) {
  const m = sitz.mandant;
  const d0 = heute();
  const bes = useMemo(() => besetzung(m, d0), [m]);
  const kommend = useMemo(() => pruefen(m, d0, addDays(d0, 13)), [m]);
  const sim = useMemo(() => simulation(m), [m]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const aktiv = aktive(m, d0);
  const abwesend = aktiv.filter((p) => abwesenheitAm(m, p.id, d0)).length;
  const kritisch = kommend.filter((b) => b.schwere === "danger").length;
  const offen = m.anfragen.filter((a) => a.status === "offen").length;
  const kontenHoch = aktiv.filter((p) => stundenkonto(m, p, d0.slice(0, 7)) > (m.einstellungen.ausgleichGrenze || 40)).length;
  const woche = Array.from({ length: 14 }, (_, i) => addDays(d0, i));

  return (
    <div>
      <H1 sub={fLang(d0)} right={darfEinheit(sitz, sitz.person.bereich) &&
        <Btn kind="danger" onClick={() => akt.oeffneKrankmeldung(null)}>Krankmeldung erfassen</Btn>}>Lagebild</H1>
      <Card style={{ marginBottom: 20, overflow: "hidden" }}>
        <CardHead right={<Btn size="sm" onClick={() => oeffneTag(d0)}>Tag öffnen</Btn>}>Besetzung heute</CardHead>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))" }}>
          {m.dienstarten.map((d) => {
            const b = bes[d.id];
            const e = m.einheiten.find((x) => einheitDienst(m, x.id, d0) === (d.posten ? d.quelle : d.id));
            return (
              <div key={d.id} className={b.diff < 0 || b.qualFehlt ? "row" : ""}
                onClick={() => (b.diff < 0 || b.qualFehlt) && darfEinheit(sitz, sitz.person.bereich)
                  ? akt.oeffneSchnellbesetzung(d0, d.id) : oeffneTag(d0)}
                style={{ padding: "20px 22px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <Zelle da={d} size={24} />
                  <div><div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div>
                    <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>{d.start}–{d.ende}</div></div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ fontSize: 30, fontWeight: 650, color: b.diff < 0 ? C.danger : C.text, ...NUM }}>{b.anzahl}</span>
                  <span style={{ fontSize: 14, color: C.dimmer, ...NUM }}>/ {b.soll}</span></div>
                <div style={{ marginTop: 10 }}><Balken ist={b.anzahl} soll={b.soll} tone={b.status} /></div>
                <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 9 }}>{e ? `${e.name} im Regeldienst` : "aus Abweichungen besetzt"}</div>
                {b.qualFehlt && <div style={{ marginTop: 9 }}><Pill size="sm" tone="danger">Qualifikation fehlt</Pill></div>}
                {(b.diff < 0 || b.qualFehlt) && darfEinheit(sitz, sitz.person.bereich) && (
                  <div style={{ marginTop: 11 }}>
                    <Btn size="sm" kind="primary" onClick={(ev) => { if (ev) ev.stopPropagation();
                      akt.oeffneSchnellbesetzung(d0, d.id); }}>Besetzen oder anfragen</Btn>
                  </div>)}
              </div>);
          })}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 20, marginBottom: 20 }}>
        <KpiRow min={150}>
          <Kpi label="Personalstärke" value={aktiv.length} sub={`${m.einheiten.length} ${m.einheitLabel}n`} />
          <Kpi label="Heute abwesend" value={abwesend} tone={abwesend > aktiv.length * .2 ? "warn" : "ok"} />
          <Kpi label="Wochenarbeitszeit" value={n2(sim.wochenstunden)} unit="h" sub="aus dem Modell" />
          <Kpi label="Offene Anträge" value={offen} tone={offen ? "warn" : "ok"} />
          <Kpi label="Konten über Grenze" value={kontenHoch} tone={kontenHoch ? "warn" : "ok"}
            sub={`ab ${n1(m.einstellungen.ausgleichGrenze || 40)} h · Freizeitausgleich`} />
        </KpiRow>
        <Card>
          <CardHead right={<Lab>{kommend.length} Befunde</Lab>}>Nächste 14 Tage</CardHead>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {kommend.length === 0 && <div style={{ padding: 28, fontSize: 13.5, color: C.ok }}>
              Keine Befunde. Besetzung, Qualifikationen, Ruhezeiten und Urlaubsgrenzen sind eingehalten.</div>}
            {kommend.slice(0, 40).map((b, i) => (
              <div key={b.id + i} className="row"
                onClick={() => (b.art === "besetzung" || b.art === "qualifikation") && b.ref && darfEinheit(sitz, sitz.person.bereich)
                  ? akt.oeffneSchnellbesetzung(b.datum, String(b.ref).split("|")[0]) : oeffneTag(b.datum)}
                style={{ display: "flex", gap: 12, padding: "12px 22px", cursor: "pointer", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 4, borderRadius: 2, background: b.schwere === "danger" ? C.danger : C.warn, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: C.dimmer, minWidth: 52, ...NUM }}>{fKurz(b.datum)}</span>
                <span style={{ fontSize: 13.5, color: b.schwere === "danger" ? C.danger : C.warn, flex: 1 }}>{b.titel}</span>
              </div>))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead>Schichtfolge der kommenden zwei Wochen</CardHead>
        <div style={{ padding: 22, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr><th />{woche.map((d) => (
              <th key={d} style={{ padding: "0 4px 11px", minWidth: 40 }}>
                <div style={{ fontSize: 10.5, color: feiertag(d, m.bundesland) ? C.danger : C.dimmer }}>{DOW[dow(d)]}</div>
                <div style={{ fontSize: 12, color: d === d0 ? C.accent : C.dim, fontWeight: 500, ...NUM }}>{pad(pISO(d).getDate())}</div>
              </th>))}</tr></thead>
            <tbody>{m.einheiten.map((e) => (
              <tr key={e.id}><td style={{ paddingRight: 18, whiteSpace: "nowrap", fontSize: 13.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: e.farbe, display: "inline-block", marginRight: 9 }} />{e.name}</td>
                {woche.map((d) => <td key={d} style={{ padding: 3, textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center" }}><Zelle da={map[einheitDienst(m, e.id, d)]} size={25} /></div></td>)}
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>);
}

/* ============================== MONATSPLAN =============================== */
function Monatsplan({ sitz, ym, setYm, oeffneTag, akt }) {
  const [suche, setSuche] = useState("");
  const [filterDienst, setFilterDienst] = useState("");
  const [nurKnapp, setNurKnapp] = useState(false);
  const m = sitz.mandant;
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const d0 = heute();
  const bes = useMemo(() => Object.fromEntries(tage.map((d) => [d, besetzung(m, d)])), [m, ym]);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (
    <div>
      <H1 sub={`${m.name} · ${m.einheiten.length} ${m.einheitLabel}n`}
        right={<div style={{ display: "flex", gap: 9 }} className="noprint">
          {darf(sitz, "plan.view.unit") && <Btn onClick={() => akt.aushangPDF(ym, sitz.person.bereich !== "ALLE"
            ? sitz.person.bereich : (sitz.mandant.einheiten.find((x) => !x.pool) || {}).id)}>Aushang</Btn>}
          {darf(sitz, "plan.edit.unit") && <Btn onClick={akt.oeffneMehrfach}>Mehrfach ändern</Btn>}
          {darf(sitz, "pattern.edit") && <Btn onClick={akt.oeffneWizard}>Einrichtung</Btn>}
          {darf(sitz, "plan.edit.all") && <Btn kind="primary" onClick={akt.oeffneAssistent}>Planungsassistent</Btn>}
          <Btn onClick={() => shift(-1)}>‹</Btn><Btn onClick={() => setYm(d0.slice(0, 7))}>Heute</Btn>
          <Btn onClick={() => shift(1)}>›</Btn></div>}>{MON[mo - 1]} {y}</H1>

      <Freigabeleiste sitz={sitz} ym={ym} akt={akt} />

      <Filterleiste suche={suche} setSuche={setSuche} platzhalter={`${m.einheitLabel} oder Dienstart …`}
        rechts={<>
          <Sel value={filterDienst} onChange={(ev) => setFilterDienst(ev.target.value)} style={{ minWidth: 150 }}>
            <option value="">alle Dienstarten</option>
            {m.dienstarten.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <Schalter an={nurKnapp} onChange={() => setNurKnapp(!nurKnapp)} />
            <span style={{ fontSize: 13, color: C.dim }}>nur knappe Tage</span></label>
          <Btn size="sm" kind="quiet" onClick={() => { setSuche(""); setFilterDienst(""); setNurKnapp(false); }}>
            Zurücksetzen</Btn>
        </>} />

      <Card style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1040 }}>
          <thead><tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.flaeche, textAlign: "left",
              padding: "15px 20px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 160 }}><Lab>{m.einheitLabel}</Lab></th>
            {tage.map((d) => { const fei = feiertag(d, m.bundesland), we = dow(d) >= 5;
              const eng = Object.values(bes[d]).some((x) => x.status !== "ok");
              const blass = nurKnapp && !eng;
              return (<th key={d} onClick={() => oeffneTag(d)} title={fei || fLang(d)}
                style={{ padding: "9px 0 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 33, cursor: "pointer",
                  opacity: blass ? .3 : 1,
                  background: d === d0 ? "rgba(43,52,64,.075)" : fei ? C.dangerLight : we ? "rgba(20,20,25,.03)" : "transparent" }}>
                <div style={{ fontSize: 10.5, color: fei ? C.danger : we ? C.dim : C.dimmer, fontWeight: 500 }}>{DOW[dow(d)]}</div>
                <div style={{ fontSize: 13, color: d === d0 ? C.accent : C.text, fontWeight: d === d0 ? 700 : 500, ...NUM }}>{pad(pISO(d).getDate())}</div>
              </th>); })}
          </tr></thead>
          <tbody>
            {m.einheiten.filter((e) => !suche.trim()
              || e.name.toLowerCase().includes(suche.trim().toLowerCase())).map((e) => (
              <tr key={e.id} className="row">
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.flaeche, padding: "11px 20px",
                  borderBottom: `1px solid ${C.lineSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: e.farbe, flexShrink: 0 }} />
                    <div><div style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</div>
                      <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                        {aktive(m, tage[0]).filter((p) => einheitAm(p, tage[0]) === e.id).length} Pers. · Versatz {e.versatz}</div></div>
                  </div></td>
                {tage.map((d) => {
                  const da = map[einheitDienst(m, e.id, d)];
                  const fehlt = aktive(m, d).filter((p) => einheitAm(p, d) === e.id && abwesenheitAm(m, p.id, d)).length;
                  return (<td key={d} onClick={() => oeffneTag(d)} style={{ padding: "6px 2px", textAlign: "center",
                    borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer",
                    background: d === d0 ? "rgba(43,52,64,.035)" : dow(d) >= 5 ? "rgba(20,20,25,.02)" : "transparent" }}>
                    <Planzelle da={da} unten={fehlt > 0 ? `−${fehlt}` : null}
                      aktiv={d === d0} title={`${fLang(d)}${da ? ` · ${da.name}` : " · frei"}${fehlt > 0 ? ` · ${fehlt} abwesend` : ""}`} />
                  </td>); })}
              </tr>))}
            {m.dienstarten.filter((da) => (!filterDienst || da.id === filterDienst)
              && (!suche.trim() || da.name.toLowerCase().includes(suche.trim().toLowerCase())
                || da.kurz.toLowerCase().includes(suche.trim().toLowerCase()))).map((da, i) => (
              <tr key={da.id}>
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: "rgba(246,247,251,.97)", padding: "9px 20px",
                  borderTop: i === 0 ? `2px solid ${C.line}` : `1px solid ${C.lineSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Zelle da={da} size={21} />
                    <div><div style={{ fontSize: 12.5 }}>{da.name}</div>
                      <div style={{ fontSize: 11, color: C.dimmer }}>{da.ort}</div></div></div></td>
                {tage.map((d) => { const b = bes[d][da.id];
                  const col = b.status === "ok" ? C.dim : b.status === "warn" ? C.warn : C.danger;
                  return (<td key={d} onClick={() => oeffneTag(d)} title={`${b.anzahl} von ${b.soll}${b.qualFehlt ? " · Qualifikation fehlt" : ""}`}
                    style={{ textAlign: "center", padding: "8px 0", cursor: "pointer",
                      background: b.status === "danger" ? C.dangerLight : b.status === "warn" ? C.warnLight : "rgba(20,20,25,.02)",
                      borderTop: i === 0 ? `2px solid ${C.line}` : `1px solid ${C.lineSoft}` }}>
                    <span style={{ fontSize: 12.5, color: col, fontWeight: b.status === "ok" ? 500 : 700, ...NUM }}>{b.anzahl}</span>
                    <span style={{ fontSize: 10, color: C.dimmer, ...NUM }}>/{b.soll}</span></td>); })}
              </tr>))}
          </tbody>
        </table>
      </Card>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 18 }}>
        {m.dienstarten.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Zelle da={d} size={21} />
            <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{d.name} · {d.start}–{d.ende} · {n1(dauer(d))} h</span>
          </div>))}
      </div>
    </div>);
}

/* ============================== EINSATZPLAN ============================== */
function Einsatzplan({ sitz, ym, setYm, akt, oeffnePerson }) {
  const m = sitz.mandant;
  const eigene = sitz.person.bereich !== "ALLE" ? sitz.person.bereich : m.einheiten[0].id;
  const [eid, setEid] = useState(eigene);
  const [pinsel, setPinsel] = useState(m.dienstarten[0].id);
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const d0 = heute();
  const editierbar = darfEinheit(sitz, eid);
  const [suche, setSuche] = useState("");
  const [nurAbw, setNurAbw] = useState(false);
  const leute = useMemo(() => {
    let l = aktive(m, tage[0]).filter((p) => einheitAm(p, tage[0]) === eid);
    const s2 = suche.trim().toLowerCase();
    if (s2) l = l.filter((p) => `${p.vorname} ${p.nachname} ${p.funktion}`.toLowerCase().includes(s2));
    if (nurAbw) l = l.filter((p) => tage.some((d) => m.abweichungen[`${p.id}|${d}`] !== undefined
      || abwesenheitAm(m, p.id, d)));
    return l;
  }, [m, eid, tage, suche, nurAbw]);

  const klick = (p, d) => {
    if (!editierbar) return;
    const cur = m.abweichungen[`${p.id}|${d}`];
    if (cur === undefined) akt.setzeAbweichung(p.id, d, pinsel);
    else if (cur === pinsel) akt.setzeAbweichung(p.id, d, "-");
    else akt.loescheAbweichung(p.id, d);
  };

  return (
    <div>
      <H1 sub="Klick auf ein Feld: Abweichung setzen, dann frei, dann zurück auf den Sollplan."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }} className="noprint">
          <Seg value={eid} onChange={setEid} options={m.einheiten.filter((e) => darf(sitz, "plan.view.all") || e.id === sitz.person.bereich || sitz.person.bereich === "ALLE")
            .map((e) => ({ id: e.id, label: e.name.replace(m.einheitLabel, "").trim() || e.name }))} />
          <Btn size="sm" onClick={() => { const d = new Date(y, mo - 2, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }}>‹</Btn>
          <span style={{ fontSize: 13.5, color: C.dim, minWidth: 112, textAlign: "center", ...NUM }}>{MON[mo - 1]} {y}</span>
          <Btn size="sm" onClick={() => { const d = new Date(y, mo, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }}>›</Btn>
        </div>}>Personaleinsatz</H1>

      {editierbar && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16, flexWrap: "wrap" }} className="noprint">
          <Lab>Abweichung eintragen als</Lab>
          {m.dienstarten.map((d) => (
            <button key={d.id} onClick={() => setPinsel(d.id)} className="btn btn-sm"
              style={{ background: pinsel === d.id ? `${d.farbe}22` : C.bg, color: pinsel === d.id ? d.farbe : C.dim, fontWeight: 600 }}>
              {d.kurz}</button>))}
        </div>)}

      <Card style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1060 }}>
          <thead><tr>
            <th style={{ position: "sticky", left: 0, background: C.flaeche, zIndex: 2, textAlign: "left",
              padding: "15px 20px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 200 }}><Lab>Person</Lab></th>
            {tage.map((d) => { const fei = feiertag(d, m.bundesland);
              return (<th key={d} style={{ padding: "9px 0 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 29,
                background: d === d0 ? "rgba(43,52,64,.075)" : fei ? C.dangerLight : dow(d) >= 5 ? "rgba(20,20,25,.03)" : "transparent" }}>
                <div style={{ fontSize: 9.5, color: C.dimmer }}>{DOW[dow(d)]}</div>
                <div style={{ fontSize: 12, color: d === d0 ? C.accent : C.dim, fontWeight: 500, ...NUM }}>{pad(pISO(d).getDate())}</div></th>); })}
            <th style={{ padding: "9px 16px", borderBottom: `1px solid ${C.lineSoft}`, borderLeft: `1px solid ${C.lineSoft}` }}><Lab>Ist/Soll</Lab></th>
          </tr></thead>
          <tbody>{leute.map((p) => {
            const ist = istStunden(m, p, ym), soll = sollStunden(m, p, ym), diff = ist.gesamt - soll;
            return (<tr key={p.id} className="row">
              <td onClick={() => oeffnePerson(p.id)} style={{ position: "sticky", left: 0, background: C.flaeche,
                zIndex: 1, padding: "8px 20px", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer" }}>
                <div style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{p.nachname}, {p.vorname}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer }}>{p.funktion} · {rolle(p.rolle).kurz}</div></td>
              {tage.map((d) => { const t = personTag(m, p, d);
                return (<td key={d} onClick={() => klick(p, d)} style={{ padding: "4px 1px", textAlign: "center",
                  borderBottom: `1px solid ${C.lineSoft}`, cursor: editierbar ? "pointer" : "default",
                  background: t.quelle === "abweichung" ? C.warnLight : d === d0 ? "rgba(43,52,64,.05)" : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Zelle da={map[t.dienstId]} abw={t.abwesenheit} size={23} /></div></td>); })}
              <td style={{ padding: "8px 16px", borderBottom: `1px solid ${C.lineSoft}`, borderLeft: `1px solid ${C.lineSoft}`, whiteSpace: "nowrap" }}>
                <div style={{ fontSize: 12.5, ...NUM }}>{n1(ist.gesamt)}/{n1(soll)}</div>
                <div style={{ fontSize: 11.5, color: Math.abs(diff) < 6 ? C.dimmer : diff > 0 ? C.warn : C.accent, ...NUM }}>{sgn(diff)} h</div></td>
            </tr>); })}</tbody>
        </table>
      </Card>
      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14 }}>Bernsteinfarben hinterlegte Felder weichen vom Sollplan ab.</div>
    </div>);
}
