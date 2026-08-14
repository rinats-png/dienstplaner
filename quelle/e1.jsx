
/* ==========================================================================
   ANTRÄGE — GETEILTE ANSICHT
   Links die Liste mit Auswahl und Sammelaktionen, rechts die Kapazität der
   nächsten acht Wochen. Wer einen Antrag auswählt, sieht sofort, welche
   Wochen dadurch kippen. Vollständig über die Tastatur bedienbar.
   ========================================================================== */

/** Kapazität einer Woche mit und ohne die ausgewählten Anträge. */
function wochenKapazitaet(m, wochen, probeAnfragen) {
  const start = montag(heute());
  const mitProbe = probeAnfragen && probeAnfragen.length
    ? { ...m, abwesenheiten: [...m.abwesenheiten, ...probeAnfragen.map((a) => ({
        id: `p_${a.id}`, personId: a.personId, art: a.art, von: a.von, bis: a.bis, notiz: "Probe" }))] }
    : m;
  const out = [];
  for (let w = 0; w < wochen; w++) {
    const von = addDays(start, w * 7), bis = addDays(von, 6);
    const jetzt = pruefen(m, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
    const dann = pruefen(mitProbe, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
    // Auslastungsgrad: wie viele Personen sind in dieser Woche abwesend?
    let abw = 0, gesamt = 0;
    for (const p of m.personen) {
      if (!imDienst(p, von) || p.imSchichtdienst === false) continue;
      gesamt++;
      for (let i = 0; i < 7; i++) if (abwesenheitAm(mitProbe, p.id, addDays(von, i))) { abw++; break; }
    }
    out.push({ kw: w, von, bis, jetzt: jetzt.length, dann: dann.length,
      neu: Math.max(0, dann.length - jetzt.length),
      quote: gesamt ? Math.round((abw / gesamt) * 100) : 0,
      stand: dann.length > jetzt.length ? "kippt" : dann.length ? "eng" : "frei" });
  }
  return out;
}

function AntraegeGeteilt({ sitz, akt }) {
  const m = sitz.mandant;
  const [filter, setFilter] = useState("offen");
  const [gewaehlt, setGewaehlt] = useState([]);          // Kennungen für Sammelaktionen
  const [zeiger, setZeiger] = useState(0);               // Tastaturzeiger
  const [reiter, setReiter] = useState("einzeln");
  const liste = useRef(null);

  const alle = useMemo(() => m.anfragen
    .filter((a) => a.typ !== "einsatz")
    .filter((a) => {
      const p = m.personen.find((x) => x.id === a.personId);
      return p && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(p, a.von)));
    })
    .filter((a) => filter === "alle" ? true : a.status === filter)
    .sort((a, b) => (a.von < b.von ? -1 : 1)), [m, filter, sitz]);

  const probe = useMemo(() => alle.filter((a) => gewaehlt.includes(a.id) && a.typ === "abwesenheit"),
    [alle, gewaehlt]);
  const wochen = useMemo(() => wochenKapazitaet(m, 8, probe), [m, probe]);
  const aktueller = alle[zeiger];

  /* --- Tastatur: J/K blättern, G genehmigen, A ablehnen, Leertaste wählt --- */
  useEffect(() => {
    const taste = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setZeiger((z) => Math.min(alle.length - 1, z + 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setZeiger((z) => Math.max(0, z - 1)); }
      else if (k === "g" && aktueller && aktueller.status === "offen") { e.preventDefault(); akt.entscheideAntrag(aktueller.id, true); }
      else if (k === "a" && aktueller && aktueller.status === "offen") { e.preventDefault(); akt.entscheideAntrag(aktueller.id, false); }
      else if (e.key === " " && aktueller) { e.preventDefault();
        setGewaehlt((g) => g.includes(aktueller.id) ? g.filter((x) => x !== aktueller.id) : [...g, aktueller.id]); }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [alle, zeiger, aktueller, akt]);

  useEffect(() => { setZeiger(0); setGewaehlt([]); }, [filter]);

  const offeneZahl = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
  const betroffen = (a) => {
    if (a.typ !== "abwesenheit") return [];
    return wochen.filter((w) => a.von <= w.bis && a.bis >= w.von).map((w) => w.kw);
  };
  const markiert = aktueller ? betroffen(aktueller) : [];

  return (
    <div>
      <H1 rubrik="Anliegen"
        sub="Links die Anträge, rechts die Kapazität. Bei Auswahl eines Antrags werden die betroffenen Wochen hervorgehoben — so ist vor der Entscheidung sichtbar, was sie auslöst."
        right={<Seg value={reiter} onChange={setReiter}
          options={[{ id: "einzeln", label: "Einzelanträge" }, { id: "runde", label: "Jahresurlaubsrunde" }]} />}>
        Anträge</H1>

      {reiter === "runde" ? <Urlaubsrunde sitz={sitz} akt={akt} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(300px,1fr)", gap: 18,
          alignItems: "start" }}>

          {/* ------------------------- Liste ------------------------- */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
              borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
              <Seg value={filter} onChange={setFilter} options={[
                { id: "offen", label: `Offen ${offeneZahl ? `· ${offeneZahl}` : ""}` },
                { id: "genehmigt", label: "Genehmigt" }, { id: "abgelehnt", label: "Abgelehnt" },
                { id: "alle", label: "Alle" }]} />
              <div style={{ flex: 1 }} />
              {gewaehlt.length > 0 ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>{gewaehlt.length} gewählt</span>
                  <Btn size="sm" kind="ok" onClick={() => { gewaehlt.forEach((id) => akt.entscheideAntrag(id, true)); setGewaehlt([]); }}>
                    Alle genehmigen</Btn>
                  <Btn size="sm" kind="danger" onClick={() => { gewaehlt.forEach((id) => akt.entscheideAntrag(id, false)); setGewaehlt([]); }}>
                    Alle ablehnen</Btn>
                  <Btn size="sm" kind="quiet" onClick={() => setGewaehlt([])}>Auswahl leeren</Btn>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11.5, color: C.dim }}>
                  <span><kbd className="taste">J</kbd> <kbd className="taste">K</kbd> blättern</span>
                  <span><kbd className="taste">G</kbd> genehmigen</span>
                  <span><kbd className="taste">A</kbd> ablehnen</span>
                  <span><kbd className="taste">␣</kbd> wählen</span>
                </div>)}
            </div>

            <div ref={liste} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
              {alle.length === 0
                ? <Leer titel="Keine Anträge" text="In dieser Kategorie liegt derzeit nichts vor." />
                : alle.map((a, i) => {
                  const p = m.personen.find((x) => x.id === a.personId);
                  const e = p && m.einheiten.find((x) => x.id === einheitAm(p, a.von));
                  const anGewaehlt = gewaehlt.includes(a.id);
                  const amZeiger = i === zeiger;
                  const tage = between(a.von, a.bis) + 1;
                  return (
                    <div key={a.id} onClick={() => setZeiger(i)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                        borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer",
                        background: amZeiger ? C.accentLight : anGewaehlt ? C.bg : "transparent",
                        borderLeft: amZeiger ? `3px solid ${C.accent}` : "3px solid transparent" }}>
                      <input type="checkbox" checked={anGewaehlt} onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => setGewaehlt(ev.target.checked
                          ? [...gewaehlt, a.id] : gewaehlt.filter((x) => x !== a.id))}
                        style={{ width: 15, height: 15, flexShrink: 0, accentColor: C.accent }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                            {p ? `${p.nachname}, ${p.vorname}` : "?"}</span>
                          {e && <span style={{ fontSize: 11.5, color: C.dim }}>{e.name}</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3, ...NUM }}>
                          {a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ·
                          {" "}{fKurz(a.von)}{tage > 1 ? ` bis ${fKurz(a.bis)} · ${tage} Tage` : ""}
                        </div>
                        {a.text && <div style={{ fontSize: 12, color: C.dim, marginTop: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>„{a.text}"</div>}
                      </div>
                      {a.status === "offen" ? (() => {
                        const st = genehmigungsStand(m, a);
                        const darfIch = darfStufe(sitz, a, st);
                        return (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {st.noetig > 1 && (
                              <Pill size="sm" tone={st.erteilt ? "accent" : "warn"}>
                                Stufe {st.erteilt + 1} von {st.noetig}</Pill>)}
                            {darfIch ? (<>
                              <Btn size="sm" kind="ok" onClick={(ev) => { if (ev) ev.stopPropagation();
                                akt.entscheideAntrag(a.id, true); }}>
                                {st.noetig > 1 && st.offen > 1 ? "Mitzeichnen" : "Genehmigen"}</Btn>
                              <Btn size="sm" onClick={(ev) => { if (ev) ev.stopPropagation();
                                akt.entscheideAntrag(a.id, false); }}>Ablehnen</Btn>
                            </>) : (
                              <span style={{ fontSize: 12, color: C.dim }}>wartet auf {st.naechste}</span>)}
                          </div>);
                      })() : <Pill size="sm" tone={a.status === "genehmigt" ? "ok" : "danger"}>{a.status}</Pill>}
                    </div>);
                })}
            </div>
          </Card>

          {/* --------------------- Kapazitätsraster -------------------- */}
          <div style={{ position: "sticky", top: 76 }}>
            <Card>
              <CardHead right={<Lab>acht Wochen</Lab>}>Kapazität</CardHead>
              <div style={{ padding: 16 }}>
                {wochen.map((w) => {
                  const hervor = markiert.includes(w.kw);
                  const farbe = w.stand === "kippt" ? C.danger : w.stand === "eng" ? C.warn : C.ok;
                  const flaeche = w.stand === "kippt" ? C.dangerLight : w.stand === "eng" ? C.warnLight : C.okLight;
                  return (
                    <div key={w.kw} style={{ display: "flex", alignItems: "center", gap: 12,
                      padding: "9px 11px", borderRadius: 9, marginBottom: 5,
                      background: hervor ? flaeche : "transparent",
                      outline: hervor ? `1.5px solid ${farbe}` : "none" }}>
                      <span style={{ fontSize: 12, color: C.dim, minWidth: 62, ...NUM }}>
                        ab {fKurz(w.von)}</span>
                      {/* Auslastungsbalken */}
                      <div style={{ flex: 1, height: 22, borderRadius: 6, background: C.bg,
                        position: "relative", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, w.quote)}%`, height: "100%",
                          background: `${farbe}2E`, borderRight: `2px solid ${farbe}`,
                          transition: "width .25s" }} />
                        <span style={{ position: "absolute", left: 8, top: 3, fontSize: 11.5,
                          color: C.dim, ...NUM }}>{w.quote} % abwesend</span>
                      </div>
                      <span style={{ minWidth: 66, textAlign: "right", fontSize: 12, fontWeight: 600,
                        color: w.stand === "kippt" ? C.danger : w.stand === "eng" ? C.warn : C.dim, ...NUM }}>
                        {w.neu > 0 ? `+${w.neu} neu` : w.dann > 0 ? `${w.dann} Befund` : "frei"}</span>
                    </div>);
                })}
              </div>
              <div style={{ padding: "0 16px 16px", fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                {gewaehlt.length > 0
                  ? `Gerechnet mit ${probe.length} ausgewählten Anträgen. Rot bedeutet: diese Woche kippt erst dadurch.`
                  : aktueller
                    ? "Die hervorgehobenen Wochen betrifft der markierte Antrag."
                    : "Antrag auswählen, um die betroffenen Wochen zu sehen."}
              </div>
            </Card>

            {aktueller && (
              <Card style={{ marginTop: 14, padding: 16 }}>
                <Rubrik style={{ marginBottom: 9 }}>Markierter Antrag</Rubrik>
                {(() => {
                  const p = m.personen.find((x) => x.id === aktueller.personId);
                  if (!p) return null;
                  const jahr = Number(aktueller.von.slice(0, 4));
                  const uk = urlaubskonto(m, p, jahr);
                  return (<>
                    <div style={{ fontSize: 15, fontWeight: 650 }}>{p.vorname} {p.nachname}</div>
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{p.funktion}</div>
                    <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 12.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.dim }}>Urlaub übrig</span>
                        <span style={NUM}>{uk.rest} von {uk.anspruch} Tagen</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.dim }}>Stundenkonto</span>
                        <span style={NUM}>{sgn(stundenkonto(m, p, aktueller.von.slice(0, 7)))} h</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.dim }}>Auslastung</span>
                        <span style={NUM}>{auslastung(m, p, aktueller.von.slice(0, 7)).pct} %</span></div>
                    </div>
                  </>);
                })()}
              </Card>)}
          </div>
        </div>)}
    </div>);
}
