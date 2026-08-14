
/* ============================== PERSONALIMPORT ========================== */
function Import({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const [text, setText] = useState("");
  const [pruef, setPruef] = useState(null);
  const [anlegen, setAnlegen] = useState(true);

  const analysieren = () => {
    const { kopf, daten } = importParsen(text);
    if (!daten.length) return;
    setPruef({ ...importPruefen(m, kopf, daten, importZuordnen(kopf)), kopf });
  };

  return (
    <Sheet open onClose={onClose} titel="Personal importieren" width={860}>
      {!pruef && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.55 }}>
            Inhalt aus einer Tabelle einfügen — Semikolon, Tabulator oder Komma als Trenner.
            Die erste Zeile muss die Überschriften enthalten; sie werden automatisch zugeordnet.
            Erkannt werden Nachname, Vorname, Einheit, Funktion, Wochenstunden, Urlaub, Eintritt,
            Zugangsart, Qualifikationen und Teilzeit.
          </div>
          <textarea className="inp" rows={11} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={IMPORT_BEISPIEL} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <Btn kind="quiet" onClick={() => setText(IMPORT_BEISPIEL)}>Beispiel einfügen</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
              <Btn kind="primary" disabled={!text.trim()} onClick={analysieren}>Prüfen</Btn>
            </div>
          </div>
        </div>)}

      {pruef && (<div>
        <KpiRow min={150}>
          <Kpi label="Übernehmbar" value={pruef.gut} tone="ok" />
          <Kpi label="Fehlerhaft" value={pruef.fehlerhaft} tone={pruef.fehlerhaft ? "danger" : "ok"} />
          <Kpi label="Bereits vorhanden" value={pruef.doppelt} tone={pruef.doppelt ? "warn" : "ok"} />
          <Kpi label="Neue Einheiten" value={pruef.neueEinheiten.length} />
        </KpiRow>

        {(pruef.neueEinheiten.length > 0 || pruef.neueQuals.length > 0) && (
          <div className="karte" style={{ padding: 16, marginTop: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={anlegen} onChange={(e) => setAnlegen(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Fehlende Einheiten und Qualifikationen mit anlegen</span>
            </label>
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8, lineHeight: 1.5 }}>
              {pruef.neueEinheiten.length > 0 && <>Einheiten: {pruef.neueEinheiten.join(", ")}<br /></>}
              {pruef.neueQuals.length > 0 && <>Qualifikationen: {pruef.neueQuals.join(", ")}</>}
            </div>
          </div>)}

        <Card style={{ marginTop: 18, overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead><tr>{["", "Person", "Einheit", "Std.", "Zugang", "Qualifikationen", "Hinweis"].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}`,
                position: "sticky", top: 0, background: C.flaeche }}><Lab>{h}</Lab></th>))}</tr></thead>
            <tbody>{pruef.zeilen.map((z) => (
              <tr key={z.nr} className="row">
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, fontWeight: 700,
                    background: z.ok ? "rgba(46,107,79,.14)" : "rgba(179,38,30,.12)",
                    color: z.ok ? C.ok : C.danger }}>{z.ok ? "✓" : "✕"}</span></td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                  {z.nachname}, {z.vorname}{z.teilzeit && <Pill size="sm" style={{ marginLeft: 6 }}>TZ</Pill>}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5,
                  color: z.einheitId ? C.dim : C.warn }}>{z.einheitName || "—"}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5, ...NUM }}>{n1(z.wochenstunden)}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5 }}>{rolle(z.rolle).kurz}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12 }}>
                  {z.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).join(" ")}
                  {z.fehlendeQuals.length > 0 && <span style={{ color: C.warn }}> +{z.fehlendeQuals.join(" ")}</span>}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12,
                  color: z.fehler.length ? C.danger : z.doppelt ? C.warn : C.dimmer }}>
                  {z.fehler.join(", ") || (z.doppelt ? "Name bereits vorhanden" : "")}</td>
              </tr>))}</tbody>
          </table>
        </Card>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <Btn kind="quiet" onClick={() => setPruef(null)}>Zurück</Btn>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" disabled={!pruef.gut}
            onClick={() => { akt.importieren(pruef.zeilen.filter((z) => z.ok), anlegen); onClose(); }}>
            {pruef.gut} Personen übernehmen</Btn>
        </div>
      </div>)}
    </Sheet>);
}

/* =============================== JAHRESANSICHT ========================== */
function Jahresansicht({ sitz, ym, oeffnePerson }) {
  const m = sitz.mandant;
  const [jahr, setJahr] = useState(Number(ym.slice(0, 4)));
  const [eid, setEid] = useState(sitz.person.bereich !== "ALLE" ? sitz.person.bereich : m.einheiten[0].id);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const leute = aktive(m, `${jahr}-06-15`).filter((p) => einheitAm(p, `${jahr}-06-15`) === eid);
  const monate = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div>
      <H1 sub="Zwölf Monate auf einen Blick — für Urlaubsgespräche, Belastungsvergleiche und die Jahresplanung."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Seg value={eid} onChange={setEid}
            options={m.einheiten.map((e) => ({ id: e.id, label: e.name.replace(m.einheitLabel, "").trim() || e.name }))} />
          <Btn size="sm" onClick={() => setJahr(jahr - 1)}>‹</Btn>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 52, textAlign: "center", ...NUM }}>{jahr}</span>
          <Btn size="sm" onClick={() => setJahr(jahr + 1)}>›</Btn>
        </div>}>Jahresansicht</H1>

      <Card style={{ overflowX: "auto" }}>
        <div style={{ padding: 20, minWidth: 1080 }}>
          {leute.map((p) => {
            const jahresIst = monate.reduce((a, i) => a + istStunden(m, p, `${jahr}-${pad(i + 1)}`).gesamt, 0);
            const jahresSoll = monate.reduce((a, i) => a + sollStunden(m, p, `${jahr}-${pad(i + 1)}`), 0);
            const url = urlaubskonto(m, p, jahr);
            return (
              <div key={p.id} style={{ marginBottom: 18 }}>
                <div onClick={() => oeffnePerson(p.id)} style={{ display: "flex", alignItems: "baseline",
                  gap: 12, marginBottom: 7, cursor: "pointer", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{p.nachname}, {p.vorname}</span>
                  {p.teilzeit && p.teilzeit.aktiv && <Pill size="sm">Teilzeit {Math.round(teilzeitProfil(m, p).quote * 100)} %</Pill>}
                  {p.springer && <Pill size="sm" tone="violet">Springer</Pill>}
                  <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>
                    {n1(jahresIst)} von {n1(jahresSoll)} h · {sgn(jahresIst - jahresSoll)} h · Urlaub {url.genommen}/{url.anspruch}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {monate.map((mo) => {
                    const tage = dim_(jahr, mo);
                    return (
                      <div key={mo}>
                        <div style={{ fontSize: 9.5, color: C.dimmer, marginBottom: 3, textAlign: "center" }}>{MON[mo].slice(0, 3)}</div>
                        <div style={{ display: "flex", gap: 1 }}>
                          {Array.from({ length: tage }, (_, i) => {
                            const d = `${jahr}-${pad(mo + 1)}-${pad(i + 1)}`;
                            const t = personTag(m, p, d);
                            const da = map[t.dienstId];
                            const fei = feiertagFuer(m, d, p);
                            const farbe = t.abwesenheit ? abwArt(t.abwesenheit.art).farbe
                              : da ? da.farbe : fei ? C.danger : null;
                            return <div key={i} title={`${fKurz(d)} · ${t.abwesenheit ? abwArt(t.abwesenheit.art).label : da ? da.name : fei || "frei"}`}
                              style={{ width: 5, height: 15, borderRadius: 1.5,
                                background: farbe ? `${farbe}${t.abwesenheit ? "66" : "CC"}` : "rgba(20,20,25,.06)" }} />;
                          })}
                        </div>
                      </div>);
                  })}
                </div>
              </div>);
          })}
        </div>
      </Card>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16 }}>
        {m.dienstarten.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: `${d.farbe}CC` }} />
            <span style={{ fontSize: 12.5, color: C.dim }}>{d.name}</span></div>))}
        {ABW.slice(0, 3).map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: `${a.farbe}66` }} />
            <span style={{ fontSize: 12.5, color: C.dim }}>{a.label}</span></div>))}
      </div>
    </div>);
}

/* ================================ DIENSTBUCH ============================ */
function Dienstbuch({ sitz, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [text, setText] = useState("");
  const [art, setArt] = useState("uebergabe");
  const arten = [["uebergabe", "Übergabe"], ["vorkommnis", "Vorkommnis"], ["hinweis", "Hinweis"]];
  const eintraege = (m.dienstbuch || []).filter((e) => e.datum === datum);
  const darfSchreiben = darf(sitz, "plan.view.unit");

  return (
    <div>
      <H1 sub="Was die nächste Schicht wissen muss. Ersetzt den Zettel am Wachtisch und bleibt nachvollziehbar."
        right={<Inp type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ width: 180 }} />}>
        Dienstbuch</H1>

      {darfSchreiben && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead>Eintrag für {fLang(datum)}</CardHead>
          <div style={{ padding: 22, display: "grid", gap: 13 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {arten.map(([id, l]) => (
                <button key={id} onClick={() => setArt(id)} className="btn btn-sm"
                  style={{ background: art === id ? "rgba(43,52,64,.10)" : C.bg,
                    color: art === id ? C.text : C.dim, fontWeight: 600 }}>{l}</button>))}
            </div>
            <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Kurz und sachlich. Keine Gesundheitsdaten, keine Bewertungen von Personen." />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn kind="primary" disabled={!text.trim()}
                onClick={() => { akt.dienstbuchEintrag(datum, art, text); setText(""); }}>Eintragen</Btn>
            </div>
          </div>
        </Card>)}

      <Card>
        <CardHead right={<Lab>{eintraege.length} Einträge</Lab>}>{fLang(datum)}</CardHead>
        {eintraege.length === 0
          ? <Leer titel="Kein Eintrag" text="Für diesen Tag wurde nichts vermerkt." />
          : eintraege.map((e, i) => (
            <div key={e.id} style={{ display: "flex", gap: 15, padding: "15px 22px",
              borderBottom: i < eintraege.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <span style={{ width: 4, borderRadius: 2, flexShrink: 0,
                background: e.art === "vorkommnis" ? C.danger : e.art === "hinweis" ? C.warn : C.accent }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <Pill size="sm" tone={e.art === "vorkommnis" ? "danger" : e.art === "hinweis" ? "warn" : "accent"}>
                    {(arten.find((a) => a[0] === e.art) || [])[1]}</Pill>
                  <span style={{ fontSize: 12.5, color: C.dimmer }}>{e.zeit} · {e.durch}</span>
                </div>
                <div style={{ fontSize: 14, color: C.text, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{e.text}</div>
              </div>
            </div>))}
      </Card>
    </div>);
}
