
/* ==========================================================================
   KOMMANDOLEISTE
   Bei vielen Ansichten ist Tippen schneller als Klicken.
   ========================================================================== */
function Kommandoleiste({ sitz, nav, akt, offen, onClose, gehZu, oeffneTag, oeffnePerson }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const feld = useRef(null);
  const treffer = useMemo(() => kommandoSuche(sitz, nav, q), [sitz.mandant, q, nav]);

  useEffect(() => { if (offen && feld.current) { feld.current.focus(); setQ(""); setI(0); } }, [offen]);
  useEffect(() => { setI(0); }, [q]);

  const waehlen = (t) => {
    if (!t) return;
    onClose();
    if (t.art === "ansicht") gehZu(t.id);
    else if (t.art === "person") oeffnePerson(t.id);
    else if (t.art === "datum") oeffneTag(t.id);
    else if (t.art === "aktion") {
      if (t.id === "krank") akt.oeffneKrankmeldung(null);
      else if (t.id === "verfuegbarkeit") akt.oeffneVerfuegbarkeit(sitz.person.id);
      else if (t.id === "assistent") akt.oeffneAssistent();
      else if (t.id === "wizard") akt.oeffneWizard();
      else if (t.id === "aushang") akt.aushangPDF(heute().slice(0, 7),
        sitz.person.bereich !== "ALLE" ? sitz.person.bereich : (sitz.mandant.einheiten.find((x) => !x.pool) || {}).id);
      else if (t.id === "feldmodus") akt.setzeKontrastmodus(!sitz.person.kontrastmodus);
    }
  };

  if (!offen) return null;
  const SYM = { ansicht: "▸", person: "◍", datum: "▤", aktion: "⚡" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, padding: "12vh 20px 20px",
      background: "rgba(24,24,20,.30)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="blatt"
        style={{ maxWidth: 620, margin: "0 auto", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex",
          alignItems: "center", gap: 13 }}>
          <span style={{ fontSize: 17, color: C.dimmer }}>⌕</span>
          <input ref={feld} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(treffer.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); waehlen(treffer[i]); }
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Ansicht, Person, Datum oder Aktion …"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent",
              fontFamily: FONT, fontSize: 17, color: C.text }} />
          <kbd style={{ fontSize: 11, color: C.dimmer, background: C.lineSoft,
            padding: "3px 7px", borderRadius: 6, ...NUM }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
          {treffer.length === 0
            ? <div style={{ padding: 30, textAlign: "center", color: C.dimmer, fontSize: 14 }}>
                Nichts gefunden. Suche nach einer Ansicht, einem Nachnamen oder einem Datum wie 16.9.
              </div>
            : treffer.map((t, k) => (
              <div key={k} onMouseEnter={() => setI(k)} onClick={() => waehlen(t)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", cursor: "pointer",
                  background: i === k ? "rgba(43,44,37,.07)" : "transparent" }}>
                <span style={{ width: 27, height: 27, borderRadius: 9, flexShrink: 0, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.bg, color: C.dim }}>{SYM[t.art]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: i === k ? 620 : 500 }}>{t.titel}</div>
                  <div style={{ fontSize: 12, color: C.dimmer }}>{t.unter}</div>
                </div>
                {i === k && <kbd style={{ fontSize: 11, color: C.dimmer, ...NUM }}>↵</kbd>}
              </div>))}
        </div>
        <div style={{ padding: "11px 22px", borderTop: `1px solid ${C.lineSoft}`, fontSize: 11.5,
          color: C.dimmer, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <span>↑↓ wählen</span><span>↵ öffnen</span><span>Strg + K jederzeit</span>
        </div>
      </div>
    </div>);
}

/* ========================== PLANSTAND-VERGLEICH ========================= */
function Planstand({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const v = useMemo(() => planVergleich(m, ym), [m, ym]);
  const fg = freigabeStand(m, ym);

  if (!v.hatStand) return (
    <Card style={{ padding: 26 }}>
      <div style={{ fontSize: 15, fontWeight: 620, marginBottom: 8 }}>Kein Vergleichsstand vorhanden</div>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>
        Sobald der Monat freigegeben wird, hält CENTRIC den damaligen Stand fest. Jede spätere Änderung
        erscheint dann hier — mit Vorlauf und Betroffenen. Das beantwortet die häufigste Frage im
        Schichtbetrieb: „Ich hatte doch Frühdienst?"
      </div>
    </Card>);

  return (
    <div>
      <KpiRow min={165}>
        <Kpi label="Änderungen seit Freigabe" value={v.zeilen.length}
          tone={v.zeilen.length > 20 ? "warn" : "text"} sub={fg ? `Stand ${fg.stand} · ${v.zeit}` : ""} />
        <Kpi label="Zusätzlich" value={v.zusatz} tone={v.zusatz ? "warn" : "ok"} />
        <Kpi label="Entfallen" value={v.entfall} />
        <Kpi label="Getauscht" value={v.wechsel} />
        <Kpi label="Kurzfristig" value={v.zeilen.filter((z) => z.vorlauf < 14).length}
          tone={v.zeilen.filter((z) => z.vorlauf < 14).length ? "danger" : "ok"} sub="unter 14 Tagen Vorlauf" />
      </KpiRow>

      <Card style={{ marginTop: 20 }}>
        <CardHead right={<Lab>nach Datum</Lab>}>Was sich geändert hat</CardHead>
        {v.zeilen.length === 0
          ? <Leer titel="Unverändert" text="Seit der Freigabe wurde nichts am Plan geändert." />
          : v.zeilen.slice(0, 80).map((z, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px",
              borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.dim, minWidth: 82, ...NUM }}>{fKurz(z.datum)}</span>
              <span style={{ fontSize: 13.5, flex: 1, minWidth: 150 }}>{z.person.nachname}, {z.person.vorname}</span>
              <span style={{ fontSize: 13, color: C.dimmer }}>{z.von}</span>
              <span style={{ color: C.dimmer }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600,
                color: z.richtung === "zusatz" ? C.warn : z.richtung === "entfall" ? C.dim : C.accent }}>{z.nach}</span>
              {z.vorlauf < 14 && z.vorlauf >= 0 && <Pill size="sm" tone="danger">{z.vorlauf} Tage Vorlauf</Pill>}
            </div>))}
      </Card>
    </div>);
}

/* ======================== QUALIFIKATIONSMATRIX ========================= */
function Qualifikationsmatrix({ sitz, akt }) {
  const m = sitz.mandant;
  const qm = useMemo(() => qualMatrix(m), [m]);
  const einheiten = m.einheiten.filter((e) => !e.pool);

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Wer kann was — und wo hängt eine Qualifikation an zu wenigen Personen. Der Engpass zeigt sich sonst erst bei der Krankmeldung."
        >Qualifikationen</H1>

      <KpiRow min={180}>
        <Kpi label="Qualifikationen" value={qm.spalten.length} />
        <Kpi label="Engpässe" value={qm.engpaesse} tone={qm.engpaesse ? "warn" : "ok"}
          sub="knapp über dem Bedarf" />
        <Kpi label="Kritisch" value={qm.kritische} tone={qm.kritische ? "danger" : "ok"}
          sub="unter dem Bedarf in einer Einheit" />
        <Kpi label="Im Schichtdienst" value={qm.personen.length} />
      </KpiRow>

      <Card style={{ marginTop: 22 }}>
        <CardHead right={<Lab>gültige Nachweise je {m.einheitLabel}</Lab>}>Abdeckung</CardHead>
        <div style={{ padding: 22 }}>
          {qm.spalten.map((s) => (
            <div key={s.qual.id} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9, flexWrap: "wrap" }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: s.qual.farbe }} />
                <span style={{ fontSize: 14.5, fontWeight: 620 }}>{s.qual.name}</span>
                <span style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{s.anzahl} Personen</span>
                {s.bedarf > 0 && <Pill size="sm">Bedarf {s.bedarf} je Dienst</Pill>}
                {s.kritisch && <Pill size="sm" tone="danger">
                  {s.schwaechsteEinheit ? s.schwaechsteEinheit.name : ""} hat nur {s.schwaechsteAnzahl}</Pill>}
                {!s.kritisch && s.engpass && <Pill size="sm" tone="warn">
                  knapp in {s.schwaechsteEinheit ? s.schwaechsteEinheit.name : ""}</Pill>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(einheiten.length, 6)},1fr)`, gap: 9 }}>
                {einheiten.map((e) => {
                  const n = s.jeEinheit[e.id] || 0;
                  const kritisch = s.bedarf > 0 && n < s.bedarf;
                  const knapp = s.bedarf > 0 && n === s.bedarf;
                  return (
                    <div key={e.id} className="karte" style={{ padding: "11px 13px",
                      background: kritisch ? C.dangerLight : knapp ? C.warnLight : undefined }}>
                      <div style={{ fontSize: 11.5, color: e.farbe, fontWeight: 600, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                      <div style={{ fontSize: 19, fontWeight: 650, marginTop: 3, ...NUM,
                        color: kritisch ? C.danger : knapp ? C.warn : C.text }}>{n}</div>
                      {s.bedarf > 0 && <div style={{ marginTop: 6 }}>
                        <AnteilBalken wert={n} max={Math.max(s.bedarf * 2, n)} hoehe={4}
                          farbe={kritisch ? C.danger : knapp ? C.warn : C.ok} /></div>}
                    </div>);
                })}
              </div>
            </div>))}
        </div>
      </Card>

      <Card style={{ marginTop: 20 }}>
        <CardHead>Wann laufen Nachweise ab</CardHead>
        <div style={{ padding: "22px 24px 18px" }}>
          <BalkenDiagramm daten={nachweisVerlauf(m, 12)} wert="anzahl" label="label" hoehe={130}
            farbeVon={(d) => d.anzahl > 6 ? C.danger : d.anzahl > 2 ? C.warn : C.accent} />
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14, lineHeight: 1.5 }}>
            Hohe Balken kündigen eine Welle an: In diesem Monat müssen mehrere Nachweise gleichzeitig
            erneuert werden. Wer das früh sieht, kann Schulungen bündeln.
          </div>
        </div>
      </Card>
    </div>);
}

/* ============================== EINARBEITUNG =========================== */
function Einarbeitung({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ personId: "", mentorId: "", von: heute(), bis: addDays(heute(), 56), ziel: "" });
  const lage = useMemo(() => einarbeitungLage(m, heute(), addDays(heute(), 90)), [m]);
  const darfPflegen = darf(sitz, "staff.edit") || darf(sitz, "plan.edit.unit");

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Neue Kräfte werden einer festen Begleitung zugeordnet. CENTRIC prüft für jeden Diensttag, ob beide tatsächlich zusammen eingeteilt sind."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(true)}>Einarbeitung anlegen</Btn>}>
        Einarbeitung</H1>

      {lage.length === 0
        ? <Card><Leer titel="Keine laufende Einarbeitung"
            text="Ordne einer neuen Kraft eine Begleitung zu — die App prüft dann, ob beide gemeinsam Dienst haben." /></Card>
        : <div style={{ display: "grid", gap: 16 }}>
            {lage.map((e) => (
              <Card key={e.personId + e.von} style={{ padding: 22 }}>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-.015em" }}>
                      {e.person.vorname} {e.person.nachname}</div>
                    <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4 }}>
                      Begleitung: {e.mentor ? `${e.mentor.vorname} ${e.mentor.nachname}` : "nicht zugeordnet"}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                      {fDatum(e.von)} bis {fDatum(e.bis)}</div>
                    {e.ziel && <div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>{e.ziel}</div>}
                  </div>
                  <div style={{ minWidth: 210 }}>
                    <Lab style={{ marginBottom: 7 }}>Gemeinsame Dienste</Lab>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 27, fontWeight: 650, ...NUM,
                        color: e.quote === null ? C.dimmer : e.quote >= 80 ? C.ok : e.quote >= 50 ? C.warn : C.danger }}>
                        {e.quote === null ? "—" : `${e.quote}%`}</span>
                      <span style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                        {e.begleitet} von {e.tage} Diensten</span>
                    </div>
                    <AnteilBalken wert={e.quote || 0}
                      farbe={e.quote >= 80 ? C.ok : e.quote >= 50 ? C.warn : C.danger} />
                    {e.allein.length > 0 && (
                      <div style={{ fontSize: 12, color: C.warn, marginTop: 9, lineHeight: 1.45 }}>
                        Ohne Begleitung: {e.allein.slice(0, 5).map(fKurz).join(", ")}
                        {e.allein.length > 5 ? ` und ${e.allein.length - 5} weitere` : ""}
                      </div>)}
                  </div>
                  {darfPflegen && <Btn size="sm" kind="danger"
                    onClick={() => akt.loescheEinarbeitung(e.personId, e.von)}>Beenden</Btn>}
                </div>
              </Card>))}
          </div>}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Einarbeitung anlegen" width={560}>
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="Neue Kraft">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— wählen —</option>
              {m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false)
                .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname} · {p.funktion}</option>)}
            </Sel></Field>
          <Field label="Begleitung" hint="Sollte derselben Einheit angehören, sonst treffen sich beide selten im Dienst.">
            <Sel value={f.mentorId} onChange={(e) => setF({ ...f, mentorId: e.target.value })}>
              <option value="">— wählen —</option>
              {m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false && p.id !== f.personId)
                .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname} · {p.funktion}</option>)}
            </Sel></Field>
          {f.personId && f.mentorId && einheitAm(m.personen.find((p) => p.id === f.personId), heute())
            !== einheitAm(m.personen.find((p) => p.id === f.mentorId), heute()) && (
            <div style={{ padding: 13, borderRadius: 11, background: C.warnLight, color: C.warn, fontSize: 13 }}>
              Beide gehören verschiedenen {m.einheitLabel}n an. Sie werden dadurch kaum gemeinsam Dienst haben.
            </div>)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Von"><Inp type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
          </div>
          <Field label="Ziel der Einarbeitung">
            <Inp value={f.ziel} onChange={(e) => setF({ ...f, ziel: e.target.value })}
              placeholder="z. B. selbstständiger Nachtdienst nach acht Wochen" /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.personId || !f.mentorId}
              onClick={() => { akt.neueEinarbeitung(f); setNeu(false);
                setF({ personId: "", mentorId: "", von: heute(), bis: addDays(heute(), 56), ziel: "" }); }}>
              Anlegen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

/* ============================== BEREITSCHAFT ========================== */
function Bereitschaft({ sitz, akt, oeffneTag }) {
  const m = sitz.mandant;
  const plan = useMemo(() => bereitschaftsplan(m, heute(), 21), [m]);
  if (!plan) return (
    <Card style={{ padding: 30 }}>
      <div style={{ fontSize: 15.5, fontWeight: 620, marginBottom: 8 }}>Keine Rufbereitschaft eingerichtet</div>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 560 }}>
        Lege unter Dienstarten eine Dienstart mit dem Kennzeichen „Rufbereitschaft" an. Sie wird anteilig
        auf die Arbeitszeit angerechnet und unterbricht die Ruhezeit nicht.
      </div>
    </Card>);

  return (
    <div>
      <H1 rubrik="Planung" sub="Wer ist erreichbar und wer ist Rückfallebene. Rufbereitschaft zählt anteilig auf die Arbeitszeit und unterbricht die Ruhezeit nicht.">
        Bereitschaft</H1>
      <Card>
        {plan.tage.map((t, i) => {
          const fei = feiertag(t.datum, m.bundesland);
          return (
            <div key={t.datum} className="row" onClick={() => oeffneTag(t.datum)}
              style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 22px", cursor: "pointer",
                borderBottom: i < plan.tage.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                background: t.datum === heute() ? "rgba(43,44,37,.045)" : undefined, flexWrap: "wrap" }}>
              <div style={{ minWidth: 116 }}>
                <div style={{ fontSize: 13.5, fontWeight: t.datum === heute() ? 700 : 500, ...NUM }}>
                  {DOW[dow(t.datum)]} {fKurz(t.datum)}</div>
                {fei && <div style={{ fontSize: 11.5, color: C.danger }}>Feiertag</div>}
              </div>
              {t.eintraege.map((e) => (
                <div key={e.da.id} style={{ flex: 1, minWidth: 210, display: "flex", alignItems: "center", gap: 11 }}>
                  <Zelle da={e.da} size={26} />
                  {e.personen.length === 0
                    ? <span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>nicht besetzt</span>
                    : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {e.personen.map((p, k) => (
                          <Pill key={p.id} size="sm" tone={k === 0 ? "accent" : "neutral"}>
                            {k === 0 ? "" : "Rückfall: "}{p.nachname}</Pill>))}
                      </div>}
                </div>))}
            </div>);
        })}
      </Card>
    </div>);
}

/* ============================== WUNSCHDIENSTE ========================= */
function Wunschdienste({ sitz, akt, personId, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === (personId || sitz.person.id));
  const [monat, setMonat] = useState(heute().slice(0, 7));
  if (!p) return null;
  const [y, mo] = monat.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${monat}-01`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const zellen = [...Array(erster).fill(null), ...Array.from({ length: n }, (_, i) => `${monat}-${pad(i + 1)}`)];
  const meine = (m.wuensche || []).filter((w) => w.personId === p.id && w.datum.startsWith(monat));
  const shift = (d) => { const x = new Date(y, mo - 1 + d, 1); setMonat(`${x.getFullYear()}-${pad(x.getMonth() + 1)}`); };

  return (
    <Sheet open onClose={onClose} titel={`Wunschdienste · ${p.vorname} ${p.nachname}`} width={640}>
      <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
        Tippe einen Tag an: einmal für <b>möchte arbeiten</b>, zweimal für <b>lieber nicht</b>, dreimal zum Löschen.
        Wünsche sind keine Anträge — die Planung berücksichtigt sie, soweit die Besetzung es zulässt.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Btn size="sm" onClick={() => shift(-1)}>‹</Btn>
        <span style={{ fontSize: 16, fontWeight: 620 }}>{MON[mo - 1]} {y}</span>
        <Btn size="sm" onClick={() => shift(1)}>›</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 8 }}>
        {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 600,
          color: i >= 5 ? C.dimmer : C.dim }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {zellen.map((d, i) => {
          if (!d) return <div key={i} />;
          const w = wunschAm(m, p.id, d);
          const art = w ? WUNSCH_ARTEN.find((a) => a.id === w.art) : null;
          const t = personTag(m, p, d);
          const da = t.dienstId && map[t.dienstId];
          const vergangen = d < heute();
          return (
            <button key={d} disabled={vergangen} onClick={() => akt.setzeWunsch(p.id, d)}
               style={{ padding: "8px 4px", borderRadius: 11, border: "none",
                cursor: vergangen ? "default" : "pointer", textAlign: "center", opacity: vergangen ? .38 : 1,
                background: art ? `${art.farbe}1C` : C.bg,
                outline: art ? `1.5px solid ${art.farbe}66` : "none" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: art ? art.farbe : C.dim, ...NUM }}>
                {Number(d.slice(8))}</div>
              <div style={{ fontSize: 10.5, marginTop: 2, color: da ? da.farbe : "transparent", ...NUM }}>
                {da ? da.kurz : "·"}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: art ? art.farbe : "transparent", lineHeight: 1 }}>
                {art ? art.zeichen : "·"}</div>
            </button>);
        })}
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" }}>
        {WUNSCH_ARTEN.map((a) => (
          <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
            <span style={{ width: 17, height: 17, borderRadius: 6, background: `${a.farbe}1C`,
              color: a.farbe, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center",
              justifyContent: "center" }}>{a.zeichen}</span>{a.label}</span>))}
        <span style={{ fontSize: 13, color: C.dimmer, marginLeft: "auto", ...NUM }}>
          {meine.length} Wünsche in diesem Monat</span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
        <Btn kind="primary" onClick={onClose}>Fertig</Btn>
      </div>
    </Sheet>);
}

/* ================================ NOTIZEN ============================== */
function Notizen({ sitz, akt, schluessel, titel, onClose }) {
  const m = sitz.mandant;
  const [text, setText] = useState("");
  const liste = notizenZu(m, schluessel);
  return (
    <Sheet open onClose={onClose} titel={titel} width={540}>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
        Planungswissen, das sonst im Kopf bleibt. Sichtbar für alle mit Planungsrecht.
        Keine Personaldaten, keine Gesundheitsangaben.
      </div>
      {liste.length > 0 && <div style={{ marginBottom: 18 }}>
        {liste.map((x) => (
          <div key={x.id} className="karte" style={{ padding: 14, marginBottom: 9 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{x.text}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
              <span style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>{x.von} · {x.zeit}</span>
              <Btn size="sm" kind="quiet" onClick={() => akt.loescheNotiz(schluessel, x.id)}>Löschen</Btn>
            </div>
          </div>))}
      </div>}
      <Field label="Neue Notiz">
        <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="z. B. neu im Team, bis Ende Mai nicht allein einteilen" /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn kind="quiet" onClick={onClose}>Schließen</Btn>
        <Btn kind="primary" disabled={!text.trim()}
          onClick={() => { akt.neueNotiz(schluessel, text); setText(""); }}>Hinzufügen</Btn>
      </div>
    </Sheet>);
}

/* ========================== MEHRFACHBEARBEITUNG ======================== */
function Mehrfach({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const [f, setF] = useState({ von: heute(), bis: addDays(heute(), 6), dienstId: "-", personen: [] });
  const [art, setArt] = useState("dienst");
  const [abwArtId, setAbwArtId] = useState("schulung");
  const kandidaten = m.personen.filter((p) => imDienst(p, f.von) && p.imSchichtdienst !== false
    && (darf(sitz, "plan.edit.all") || darfEinheit(sitz, einheitAm(p, f.von))));
  const tage = Math.max(0, between(f.von, f.bis) + 1);
  const betroffen = f.personen.length * tage;

  return (
    <Sheet open onClose={onClose} titel="Mehrere Tage auf einmal ändern" width={680}>
      <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 20 }}>
        Zeitraum und Personen wählen, dann in einem Zug ändern. Erspart das Einzelklicken bei Lehrgängen,
        längeren Abwesenheiten oder Umsetzungen.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginBottom: 18 }}>
        <Field label="Von"><Inp type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></Field>
        <Field label="Bis"><Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
      </div>

      <Seg value={art} onChange={setArt} options={[{ id: "dienst", label: "Dienst setzen" },
        { id: "abwesenheit", label: "Abwesenheit eintragen" }]} />

      <div style={{ margin: "16px 0 20px" }}>
        {art === "dienst"
          ? <Field label="Dienstart" hint={`„frei" nimmt die betroffenen Personen aus dem Plan.`}>
              <Sel value={f.dienstId} onChange={(e) => setF({ ...f, dienstId: e.target.value })}>
                <option value="-">frei</option>
                {m.dienstarten.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>
          : <Field label="Art der Abwesenheit">
              <Sel value={abwArtId} onChange={(e) => setAbwArtId(e.target.value)}>
                {ABW_ARTEN.filter((a) => a.id !== "krank").map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>))}</Sel></Field>}
      </div>

      <Lab style={{ marginBottom: 10 }}>Personen · {f.personen.length} gewählt</Lab>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn size="sm" kind="quiet" onClick={() => setF({ ...f, personen: kandidaten.map((p) => p.id) })}>Alle</Btn>
        <Btn size="sm" kind="quiet" onClick={() => setF({ ...f, personen: [] })}>Keine</Btn>
        {m.einheiten.filter((e) => !e.pool).map((e) => (
          <Btn key={e.id} size="sm" kind="quiet" onClick={() => setF({ ...f,
            personen: kandidaten.filter((p) => einheitAm(p, f.von) === e.id).map((p) => p.id) })}>{e.name}</Btn>))}
      </div>
      <div style={{ maxHeight: 210, overflowY: "auto", marginBottom: 18 }}>
        {kandidaten.map((p) => {
          const an = f.personen.includes(p.id);
          const e = m.einheiten.find((x) => x.id === einheitAm(p, f.von));
          return (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={an} onChange={() => setF({ ...f,
                personen: an ? f.personen.filter((x) => x !== p.id) : [...f.personen, p.id] })} />
              <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
              <span style={{ fontSize: 12, color: e ? e.farbe : C.dimmer }}>{e ? e.name : ""}</span>
            </label>);
        })}
      </div>

      <div className="karte" style={{ padding: 15, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: betroffen > 0 ? C.text : C.dimmer }}>
          {betroffen === 0 ? "Noch nichts ausgewählt."
            : <>Ändert <b>{betroffen}</b> Einträge: {f.personen.length} Personen × {tage} Tage
              {art === "dienst" ? ` auf „${f.dienstId === "-" ? "frei" : (m.dienstarten.find((d) => d.id === f.dienstId) || {}).name}"`
                : ` als ${abwArt(abwArtId).label}`}.</>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!betroffen} onClick={() => {
          if (art === "dienst") akt.mehrfachDienst(f.personen, f.von, f.bis, f.dienstId);
          else akt.mehrfachAbwesenheit(f.personen, f.von, f.bis, abwArtId);
          onClose(); }}>
          {betroffen} Einträge ändern</Btn>
      </div>
    </Sheet>);
}
