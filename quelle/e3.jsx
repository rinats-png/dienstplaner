
/* ==========================================================================
   SCHICHTÜBERGABE
   In Pflege und Klinik ein eigener, dokumentationspflichtiger Vorgang.
   Wer übergibt an wen, was ist offen, was ist besonders.
   ========================================================================== */
function Schichtuebergabe({ sitz, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [dienstId, setDienstId] = useState(m.dienstarten.find((d) => !d.posten) ?.id || "");
  const [f, setF] = useState({ lage: "", offen: "", vorkommnis: "", material: "" });
  const offeneListe = useMemo(() => offeneUebergaben(m, 3), [m]);
  const vorhanden = uebergabeAm(m, datum, dienstId);
  const b = dienstId ? besetzung(m, datum)[dienstId] : null;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const darfSchreiben = darfEinheit(sitz, sitz.person.bereich) || darf(sitz, "plan.edit.unit");

  useEffect(() => {
    setF(vorhanden ? { lage: vorhanden.lage || "", offen: vorhanden.offen || "",
      vorkommnis: vorhanden.vorkommnis || "", material: vorhanden.material || "" }
      : { lage: "", offen: "", vorkommnis: "", material: "" });
  }, [datum, dienstId, vorhanden]);

  return (
    <div>
      <H1 rubrik={begriff(m, "einheit")}
        sub={`Die ${begriff(m, "uebergabe").toLowerCase()} hält fest, was die übernehmende Schicht wissen muss. Sie ist nachträglich nicht mehr änderbar — Ergänzungen werden angehängt.`}
        right={<div style={{ display: "flex", gap: 10 }}>
          <Inp type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ width: 160 }} />
          <Sel value={dienstId} onChange={(e) => setDienstId(e.target.value)} style={{ width: 170 }}>
            {m.dienstarten.filter((d) => !d.posten && d.form !== "ruf")
              .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
        </div>}>
        {begriff(m, "uebergabe")}</H1>

      {offeneListe.length > 0 && (
        <Card style={{ padding: 18, marginBottom: 18, background: C.warnLight, borderColor: "#FDE68A" }}>
          <div style={{ fontSize: 14.5, fontWeight: 620, color: C.warn, marginBottom: 8 }}>
            {offeneListe.length} {offeneListe.length === 1 ? "Übergabe fehlt" : "Übergaben fehlen"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {offeneListe.slice(0, 8).map((x, i) => (
              <Btn key={i} size="sm" onClick={() => { setDatum(x.datum); setDienstId(x.dienstart.id); }}>
                {fKurz(x.datum)} · {x.dienstart.kurz}</Btn>))}
          </div>
        </Card>)}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(280px,1fr)", gap: 18,
        alignItems: "start" }}>
        <Card>
          <CardHead right={vorhanden
            ? <Pill tone="ok">erfasst {vorhanden.zeit}</Pill>
            : <Pill tone="warn">offen</Pill>}>
            {da ? da.name : ""} · {fLang(datum)}</CardHead>
          <div style={{ padding: 20, display: "grid", gap: 18 }}>
            {UEBERGABE_FELDER.map((feld) => (
              <Field key={feld.id} label={feld.label + (feld.pflicht ? " *" : "")} hint={feld.hinweis}>
                <textarea className="inp" rows={feld.id === "lage" ? 4 : 2} value={f[feld.id]}
                  disabled={!!vorhanden || !darfSchreiben}
                  onChange={(e) => setF({ ...f, [feld.id]: e.target.value })} />
              </Field>))}

            {vorhanden ? (<>
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
                Übergeben von <b>{vorhanden.von}</b> an <b>{vorhanden.an || "die Folgeschicht"}</b> am {vorhanden.zeit}.
              </div>
              {(vorhanden.ergaenzungen || []).map((e, i) => (
                <div key={i} className="karte" style={{ padding: 13, background: C.bg }}>
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 4, ...NUM }}>{e.zeit} · {e.von}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{e.text}</div>
                </div>))}
              {darfSchreiben && (
                <div style={{ display: "flex", gap: 10 }}>
                  <Inp placeholder="Ergänzung anhängen …" value={f.nachtrag || ""}
                    onChange={(e) => setF({ ...f, nachtrag: e.target.value })} />
                  <Btn disabled={!(f.nachtrag || "").trim()}
                    onClick={() => { akt.uebergabeErgaenzen(datum, dienstId, f.nachtrag);
                      setF({ ...f, nachtrag: "" }); }}>Anhängen</Btn>
                </div>)}
            </>) : darfSchreiben && (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn kind="primary" disabled={!f.lage.trim()}
                  onClick={() => akt.uebergabeSpeichern(datum, dienstId, f)}>
                  Übergabe abschließen</Btn>
              </div>)}
          </div>
        </Card>

        <div>
          <Card>
            <CardHead>Besetzung dieser Schicht</CardHead>
            {b && b.personen.length ? b.personen.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 18px",
                borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
                <span style={{ fontSize: 12, color: C.dim }}>{p.funktion}</span>
              </div>))
              : <Leer titel="Niemand eingeteilt" symbol="◌" />}
          </Card>

          {kann(m, "fachkraftquote") && (() => {
            const fl = fachkraftLage(m, datum, dienstId);
            if (!fl) return null;
            return (
              <Card style={{ marginTop: 14, padding: 18 }}>
                <Rubrik style={{ marginBottom: 10 }}>Fachkraftquote</Rubrik>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-.03em", ...NUM,
                    color: fl.erfuellt ? C.ok : C.danger }}>{fl.ist} %</span>
                  <span style={{ fontSize: 13, color: C.dim, ...NUM }}>gefordert {fl.soll} %</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.bg, marginTop: 12, position: "relative" }}>
                  <div style={{ width: `${Math.min(100, fl.ist)}%`, height: "100%", borderRadius: 3,
                    background: fl.erfuellt ? C.ok : C.danger }} />
                  <div style={{ position: "absolute", left: `${fl.soll}%`, top: -3, bottom: -3, width: 2,
                    background: C.text, opacity: .5 }} />
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
                  {fl.fk} von {fl.gesamt} sind {begriff(m, "fachkraft")}
                  {fl.erfuellt ? "." : ` — es fehlen ${fl.fehlt}.`}
                </div>
              </Card>);
          })()}
        </div>
      </div>
    </div>);
}

/* ==========================================================================
   PAKETVERWALTUNG (Betreiber)
   ========================================================================== */
function Pakete({ db, akt }) {
  const [gewaehlt, setGewaehlt] = useState(db.mandanten[0] ? db.mandanten[0].id : null);
  const m = db.mandanten.find((x) => x.id === gewaehlt);

  return (
    <div>
      <H1 rubrik="Betreiber"
        sub="Ein Kern, mehrere Branchen. Was ein Betrieb braucht, wird als Paket freigeschaltet — der Rechenkern bleibt für alle derselbe.">
        Branchenpakete</H1>

      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <Card>
          <CardHead>Betriebe</CardHead>
          {db.mandanten.map((x) => (
            <div key={x.id} onClick={() => setGewaehlt(x.id)}
              style={{ padding: "12px 16px", cursor: "pointer", borderBottom: `1px solid ${C.lineSoft}`,
                background: x.id === gewaehlt ? C.accentLight : "transparent",
                borderLeft: x.id === gewaehlt ? `3px solid ${C.accent}` : "3px solid transparent" }}>
              <div style={{ fontSize: 13.5, fontWeight: 550 }}>{x.name}</div>
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>
                {(x.pakete || []).length ? (x.pakete || []).map((p) => paketVon(p).name).join(", ") : "nur Kern"}
              </div>
            </div>))}
        </Card>

        {m && (
          <div style={{ display: "grid", gap: 14 }}>
            {PAKETE.map((p) => {
              const an = p.pflicht || (m.pakete || []).includes(p.id);
              const empfohlen = paketeFuerBranche(m.branche).includes(p.id);
              return (
                <Card key={p.id} style={{ padding: 20, borderColor: an ? C.accent : C.line }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
                    alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16, fontWeight: 650 }}>{p.name}</span>
                        {p.pflicht && <Pill size="sm">immer enthalten</Pill>}
                        {empfohlen && !an && <Pill size="sm" tone="accent">für diese Branche empfohlen</Pill>}
                      </div>
                      <div style={{ fontSize: 13.5, color: C.dim, marginTop: 7, lineHeight: 1.55 }}>
                        {p.beschreibung}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
                        {p.merkmale.map((x) => <Pill key={x} size="sm">{x}</Pill>)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 130 }}>
                      {p.aufpreis
                        ? <div style={{ fontSize: 19, fontWeight: 650, ...NUM }}>+{eur0(p.aufpreis)}
                            <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}> /Monat</span></div>
                        : <div style={{ fontSize: 13, color: C.dim }}>im Grundpreis</div>}
                      {!p.pflicht && (
                        <div style={{ marginTop: 12 }}>
                          <Schalter an={an} onChange={() => akt.setzePaket(m.id, p.id, !an)} />
                        </div>)}
                    </div>
                  </div>
                </Card>);
            })}

            <Card style={{ padding: 20 }}>
              <Rubrik style={{ marginBottom: 10 }}>Monatlicher Aufpreis</Rubrik>
              <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-.03em", ...NUM }}>
                {eur0(PAKETE.filter((p) => (m.pakete || []).includes(p.id))
                  .reduce((a, p) => a + (p.aufpreis || 0), 0))}
              </div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, lineHeight: 1.55 }}>
                Zusätzlich zur Grundgebühr und den Zugängen. Pakete lassen sich jederzeit zu- und
                abschalten — abgerechnet wird tagesgenau.
              </div>
            </Card>
          </div>)}
      </div>
    </div>);
}

/* ==========================================================================
   GESPEICHERTE ANSICHTEN
   Wer täglich denselben Ausschnitt braucht, soll ihn nicht täglich neu bauen.
   ========================================================================== */
function AnsichtLeiste({ sitz, akt, bereich, aktuell, anwenden }) {
  const m = sitz.mandant;
  const meine = (m.ansichten || []).filter((a) => a.personId === sitz.person.id && a.bereich === bereich);
  const [neu, setNeu] = useState(false);
  const [name, setName] = useState("");
  if (!meine.length && !aktuell) return null;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <Rubrik>Ansichten</Rubrik>
      {meine.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center" }}>
          <Btn size="sm" onClick={() => anwenden(a.zustand)}>{a.name}</Btn>
          <button onClick={() => akt.loescheAnsicht(a.id)} aria-label={`${a.name} löschen`}
            style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer",
              fontSize: 15, padding: "0 4px" }}>×</button>
        </div>))}
      {neu ? (
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <Inp value={name} placeholder="Name der Ansicht" autoFocus style={{ width: 180 }}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) {
              akt.speichereAnsicht(bereich, name, aktuell); setName(""); setNeu(false); } }} />
          <Btn size="sm" kind="primary" disabled={!name.trim()}
            onClick={() => { akt.speichereAnsicht(bereich, name, aktuell); setName(""); setNeu(false); }}>
            Sichern</Btn>
          <Btn size="sm" kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
        </div>
      ) : aktuell && (
        <Btn size="sm" kind="quiet" onClick={() => setNeu(true)}>+ Aktuelle Ansicht sichern</Btn>)}
    </div>);
}
