
/* ==========================================================================
   MOBILE MITARBEITERANSICHT
   Für Beschäftigte im Schichtdienst ist das Telefon der Regelfall, nicht die
   Ausnahme. Diese Schale ist eigenständig aufgebaut: keine Tabellen, keine
   waagerechte Rollbewegung, Tap-Ziele ab 46 Pixel, Blätter von unten.
   Der Wechsel zur Rechneransicht ist jederzeit möglich.
   ========================================================================== */

const M_TABS = [
  { id: "heute", label: "Heute", glyph: "◉" },
  { id: "plan", label: "Mein Plan", glyph: "▤" },
  { id: "anliegen", label: "Anliegen", glyph: "✎" },
  { id: "mehr", label: "Mehr", glyph: "☰" },
];

/* ------------------------------- Bausteine ------------------------------- */
const MKarte = ({ children, onClick, ton, style }) => (
  <div onClick={onClick} style={{ background: C.flaeche,
    border: `1px solid ${ton === "danger" ? "#FECACA" : ton === "warn" ? "#FDE68A" : C.line}`,
    borderRadius: 14, padding: 16, marginBottom: 10, cursor: onClick ? "pointer" : "default",
    boxShadow: "var(--schatten)", ...style }}>{children}</div>);

const MZeile = ({ links, rechts, unten, onClick, ton }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 4px",
    minHeight: 46, cursor: onClick ? "pointer" : "default", borderBottom: `1px solid ${C.lineSoft}` }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15.5, fontWeight: 500,
        color: ton === "danger" ? C.danger : ton === "warn" ? C.warn : C.text }}>{links}</div>
      {unten && <div style={{ fontSize: 13, color: C.dimmer, marginTop: 3, lineHeight: 1.4 }}>{unten}</div>}
    </div>
    {rechts}
    {onClick && <span style={{ color: C.dimmer, fontSize: 20, flexShrink: 0 }}>›</span>}
  </div>);

const MTitel = ({ children, rubrik, rechts }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    gap: 12, marginBottom: 18 }}>
    <div>
      {rubrik && <Rubrik style={{ marginBottom: 6 }}>{rubrik}</Rubrik>}
      <h1 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em", margin: 0, lineHeight: 1.15 }}>
        {children}</h1>
    </div>
    {rechts}
  </div>);

/** Blatt, das von unten hereinfährt — auf dem Telefon die übliche Form. */
const MBlatt = ({ offen, onClose, titel, children }) => {
  if (!offen) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80,
      background: "rgba(17,24,39,.42)", backdropFilter: "blur(5px)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "92vh", overflowY: "auto",
        background: C.flaeche, borderRadius: "26px 26px 0 0",
        padding: "10px 20px calc(28px + env(safe-area-inset-bottom))" }}>
        <div style={{ width: 42, height: 4.5, borderRadius: 3, background: C.lineStark,
          margin: "6px auto 16px" }} />
        {titel && <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-.02em", marginBottom: 18 }}>
          {titel}</div>}
        {children}
      </div>
    </div>);
};

/* ================================ HEUTE ================================= */
function MHeute({ sitz, akt, setTab, oeffnen }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const t = personTag(m, p, d0);
  const da = t.dienstId && map[t.dienstId];
  const morgen = personTag(m, p, addDays(d0, 1));
  const morgenDa = morgen.dienstId && map[morgen.dienstId];
  const aufgaben = useMemo(() => tagesaufgaben(sitz).filter((a) => a.art !== "stempel"), [m, p.id]);
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
  const wichtig = (m.aushang || []).filter((x) => x.wichtig && (!x.bis || x.bis >= d0));

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.04em", margin: "8px 0 0", lineHeight: 1.12 }}>
          {gruss},<br /><b style={{ fontWeight: 700 }}>{p.vorname}</b>.
        </h1>
      </div>

      {/* Der Dienst des Tages — die wichtigste Karte */}
      {da ? (
        <MKarte style={{ padding: 22, background: `${da.farbe}0E`, border: `1px solid ${da.farbe}33` }}>
          <Rubrik style={{ color: da.farbe }}>Dein Dienst heute</Rubrik>
          <div style={{ fontSize: 27, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px" }}>
            {da.name}</div>
          <div style={{ fontSize: 17, color: C.dim, ...NUM }}>
            {da.start} – {da.ende} · {n1(dauer(da))} h</div>
          {da.ort && <div style={{ fontSize: 14, color: C.dimmer, marginTop: 5 }}>{da.ort}</div>}
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} datum={d0} /></div>
        </MKarte>
      ) : (
        <MKarte style={{ padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 6 }}>
            {t.abwesenheit ? abwArt(t.abwesenheit.art).label : "Heute frei"}</div>
          <div style={{ fontSize: 14.5, color: C.dim }}>
            {t.abwesenheit ? `bis ${fDatum(t.abwesenheit.bis)}`
              : morgenDa ? `Nächster Dienst morgen: ${morgenDa.name} ab ${morgenDa.start}` : "Auch morgen kein Dienst."}
          </div>
        </MKarte>)}

      {da && morgenDa && (
        <MKarte style={{ padding: "15px 18px", display: "flex", alignItems: "center", gap: 13 }}>
          <Zelle da={morgenDa} size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: C.dimmer }}>Morgen</div>
            <div style={{ fontSize: 15, fontWeight: 500, ...NUM }}>
              {morgenDa.name} · {morgenDa.start}–{morgenDa.ende}</div>
          </div>
        </MKarte>)}

      {wichtig.length > 0 && wichtig.map((x) => (
        <MKarte key={x.id} ton="danger" onClick={() => oeffnen("aushang")}>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ color: C.danger, fontSize: 17, fontWeight: 700 }}>!</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 620 }}>{x.titel}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{x.text}</div>
            </div>
          </div>
        </MKarte>))}

      {aufgaben.length > 0 && (<>
        <Rubrik style={{ margin: "26px 0 12px" }}>Das wartet auf dich</Rubrik>
        {aufgaben.map((a, i) => (
          <MKarte key={i} ton={a.dringend ? "danger" : undefined}
            onClick={() => { if (a.ziel === "meine") setTab("plan"); else if (a.ziel === "antraege" || a.ziel === "boerse") setTab("anliegen"); else oeffnen(a.ziel); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700,
                background: a.dringend ? C.dangerLight : C.bg,
                color: a.dringend ? C.danger : C.dim }}>{AUFGABE_SYMBOL[a.art] || "·"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 620 }}>{a.titel}</div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>{a.text}</div>
              </div>
              <span style={{ color: C.dimmer, fontSize: 20 }}>›</span>
            </div>
          </MKarte>))}
      </>)}

      {aufgaben.length === 0 && (
        <MKarte style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 30, color: C.ok, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>Nichts zu erledigen</div>
        </MKarte>)}
    </div>);
}

/** Große Stempelfläche — das häufigste Tippen überhaupt. */
function MStempel({ sitz, akt, datum }) {
  const m = sitz.mandant, p = sitz.person;
  const st = stempelStand(m, p, datum);
  const [laeuft, setLaeuft] = useState(false);
  const stempeln = (art) => {
    setLaeuft(true);
    const fertig = (k) => { akt.stempeln(p.id, datum, art, k); setLaeuft(false); };
    if (!navigator.geolocation) return fertig(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => fertig({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => fertig(null), { timeout: 6000, maximumAge: 60000 });
  };
  const Flaeche = ({ kind, onClick, children }) => (
    <button onClick={onClick} disabled={laeuft} className={`btn btn-${kind}`}
      style={{ width: "100%", height: 56, fontSize: 16.5, fontWeight: 650, borderRadius: 18 }}>
      {laeuft ? "Standort wird geprüft …" : children}</button>);

  if (!st) return (<>
    <Flaeche kind="primary" onClick={() => stempeln("start")}>Einstempeln</Flaeche>
    <div style={{ fontSize: 12, color: C.dimmer, marginTop: 9, lineHeight: 1.45 }}>
      Der Standort wird einmal geprüft. Gespeichert wird nur, ob du am Einsatzort warst.
    </div></>);
  if (!st.ende) return (<>
    <div style={{ fontSize: 14, color: C.dim, marginBottom: 11, ...NUM }}>
      Eingestempelt {st.start}{st.ortStart ? ` · ${st.ortStart}` : ""}</div>
    <Flaeche kind="ok" onClick={() => stempeln("ende")}>Ausstempeln</Flaeche></>);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <Pill tone="ok">Dienst erfasst</Pill>
      <span style={{ fontSize: 14, color: C.dim, ...NUM }}>{st.start} – {st.ende}</span>
    </div>);
}

/* =============================== MEIN PLAN ============================== */
function MPlan({ sitz, akt, oeffnen }) {
  const m = sitz.mandant, ich = sitz.person;
  const [ansicht, setAnsicht] = useState("liste");
  const [schnell, setSchnell] = useState("alle");
  const [ym, setYm] = useState(heute().slice(0, 7));
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [gewaehlt, setGewaehlt] = useState(null);
  const offen = offeneErfassung(m, ich, addDays(heute(), -1));
  const frei = freigabeStand(m, ym);

  const tage = Array.from({ length: 42 }, (_, i) => addDays(heute(), i))
    .map((d) => ({ d, t: personTag(m, ich, d) }))
    .filter((x) => {
      const da = x.t.dienstId && map[x.t.dienstId];
      if (schnell === "dienst") return !!x.t.dienstId;
      if (schnell === "frei") return !x.t.dienstId;
      if (schnell === "nacht") return da && nachtAnteil(da) >= 2;
      if (schnell === "we") return dow(x.d) >= 5;
      return x.t.dienstId || x.t.abwesenheit;
    });

  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym}-01`);
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym}-${pad(i)}`);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (
    <div>
      <MTitel rubrik={frei ? `Freigegeben · Stand ${frei.stand}` : "Entwurf"}
        rechts={<Seg value={ansicht} onChange={setAnsicht}
          options={[{ id: "liste", label: "Liste" }, { id: "monat", label: "Monat" }]} />}>
        Mein Plan</MTitel>

      {/* Swipebare Schnellfilter — auf dem Telefon schneller als jedes Auswahlfeld */}
      <div className="reiterreihe" style={{ marginBottom: 16 }}>
        {[["alle", "Alle"], ["dienst", "Nur Dienste"], ["frei", "Nur frei"],
          ["nacht", "Nachtdienste"], ["we", "Wochenende"]].map(([id, l]) => (
          <button key={id} onClick={() => setSchnell(id)} className="btn btn-sm"
            style={{ background: schnell === id ? C.accent : C.flaeche,
              borderColor: schnell === id ? C.accent : C.line,
              color: schnell === id ? "#fff" : C.dim, fontWeight: schnell === id ? 650 : 500 }}>
            {l}</button>))}
      </div>

      {offen.length > 0 && (
        <MKarte ton="warn" onClick={() => oeffnen("zeiten")}>
          <MZeile ton="warn" links={`${offen.length} Zeiten bestätigen`}
            unten="Solange offen, bleibt dein Stundenkonto eine Hochrechnung" onClick={() => {}} />
        </MKarte>)}

      {ansicht === "liste" ? (
        tage.length === 0
          ? <MKarte style={{ textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Keine Dienste in den nächsten sechs Wochen</div>
            </MKarte>
          : tage.map(({ d, t }) => {
            const da = t.dienstId && map[t.dienstId];
            const istHeute = d === heute();
            return (
              <MKarte key={d} onClick={() => setGewaehlt({ datum: d, t })}
                style={{ padding: 16, display: "flex", alignItems: "center", gap: 15,
                  outline: istHeute ? `2px solid ${C.accent}` : "none" }}>
                <div style={{ width: 50, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 11.5, color: C.dimmer, textTransform: "uppercase",
                    letterSpacing: ".07em" }}>{DOW[dow(d)]}</div>
                  <div style={{ fontSize: 23, fontWeight: 650, lineHeight: 1.1, ...NUM,
                    color: istHeute ? C.accent : feiertag(d, m.bundesland) ? C.danger : C.text }}>
                    {Number(d.slice(8))}</div>
                  <div style={{ fontSize: 10.5, color: C.dimmer, ...NUM }}>{MON[Number(d.slice(5, 7)) - 1].slice(0, 3)}</div>
                </div>
                <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2,
                  background: da ? da.farbe : t.abwesenheit ? abwArt(t.abwesenheit.art).farbe : "transparent" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-.015em" }}>
                    {da ? da.name : abwArt(t.abwesenheit.art).label}</div>
                  <div style={{ fontSize: 14, color: C.dim, marginTop: 3, ...NUM }}>
                    {da ? `${da.start} – ${da.ende} · ${n1(dauer(da))} h` : `bis ${fDatum(t.abwesenheit.bis)}`}
                  </div>
                  {da && da.ort && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 2 }}>{da.ort}</div>}
                </div>
                <span style={{ color: C.dimmer, fontSize: 20 }}>›</span>
              </MKarte>);
          })
      ) : (
        <MKarte style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Btn size="sm" onClick={() => shift(-1)}>‹</Btn>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{MON[mo - 1]} {y}</span>
            <Btn size="sm" onClick={() => shift(1)}>›</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
            {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11,
              fontWeight: 600, color: i >= 5 ? C.dimmer : C.dim }}>{d.slice(0, 2)}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {zellen.map((d, i) => {
              if (!d) return <div key={i} />;
              const t = personTag(m, ich, d);
              const da = t.dienstId && map[t.dienstId];
              return (
                <div key={d} onClick={() => setGewaehlt({ datum: d, t })}
                  style={{ aspectRatio: "1", borderRadius: 12, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2,
                    background: da ? `${da.farbe}1C` : t.abwesenheit ? `${abwArt(t.abwesenheit.art).farbe}1C` : C.bg,
                    outline: d === heute() ? `2px solid ${C.accent}` : "none" }}>
                  <span style={{ fontSize: 12, color: C.dim, ...NUM }}>{Number(String(d).slice(8))}</span>
                  {(da || t.abwesenheit) && <span style={{ fontSize: 11, fontWeight: 700, ...NUM,
                    color: da ? da.farbe : abwArt(t.abwesenheit.art).farbe }}>
                    {da ? da.kurz : abwArt(t.abwesenheit.art).kurz}</span>}
                </div>);
            })}
          </div>
        </MKarte>)}

      <MBlatt offen={!!gewaehlt} onClose={() => setGewaehlt(null)}
        titel={gewaehlt ? fLang(gewaehlt.datum) : ""}>
        {gewaehlt && (() => {
          const da = gewaehlt.t.dienstId && map[gewaehlt.t.dienstId];
          const w = wunschAm(m, ich.id, gewaehlt.datum);
          return (<>
            {da && (
              <MKarte style={{ background: `${da.farbe}0E`, border: `1px solid ${da.farbe}33` }}>
                <div style={{ fontSize: 20, fontWeight: 650 }}>{da.name}</div>
                <div style={{ fontSize: 15.5, color: C.dim, marginTop: 4, ...NUM }}>
                  {da.start} – {da.ende} · {n1(dauer(da))} h</div>
                {da.ort && <div style={{ fontSize: 13.5, color: C.dimmer, marginTop: 4 }}>{da.ort}</div>}
                {nachtAnteil(da) > 0 && <div style={{ fontSize: 13, color: C.violet, marginTop: 8, ...NUM }}>
                  davon {n1(nachtAnteil(da))} h Nachtarbeit</div>}
              </MKarte>)}
            {da && (
              <div style={{ display: "grid", gap: 10 }}>
                <Btn kind="primary" style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.tauschAusPlan(gewaehlt.datum); setGewaehlt(null); }}>
                  Tausch für diesen Tag suchen</Btn>
                <Btn style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.oeffneAntrag(gewaehlt.datum); setGewaehlt(null); }}>
                  Frei beantragen</Btn>
              </div>)}
            {!da && gewaehlt.datum >= heute() && (
              <div style={{ display: "grid", gap: 10 }}>
                <Btn kind={w && w.art === "moechte" ? "primary" : "plain"}
                  style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.setzeWunsch(ich.id, gewaehlt.datum); setGewaehlt(null); }}>
                  Würde an diesem Tag gern arbeiten</Btn>
              </div>)}
            {da && gewaehlt.datum >= heute() && (
              <div style={{ marginTop: 10 }}>
                <Btn kind={w && w.art === "lieber_nicht" ? "danger" : "quiet"}
                  style={{ width: "100%", height: 46, borderRadius: 16, fontSize: 14.5 }}
                  onClick={() => { akt.setzeWunsch(ich.id, gewaehlt.datum); setGewaehlt(null); }}>
                  {w ? (w.art === "moechte" ? "Doch lieber nicht" : "Wunsch zurücknehmen") : "Lieber nicht arbeiten"}</Btn>
              </div>)}
          </>);
        })()}
      </MBlatt>
    </div>);
}

/* =============================== ANLIEGEN =============================== */
function MAnliegen({ sitz, akt, oeffnen }) {
  const m = sitz.mandant, ich = sitz.person;
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meine = m.anfragen.filter((a) => a.personId === ich.id)
    .sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const einsatz = meine.filter((a) => a.typ === "einsatz" && a.status === "offen");
  const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen"
    && !a.partnerId && a.personId !== ich.id);
  const ktoV = useMemo(() => kontoVerlauf(m, ich, heute().slice(0, 7), 6), [m, ich.id]);
  const ktoJetzt = ktoV.length ? ktoV[ktoV.length - 1].kto : 0;
  const ktoTrend = ktoV.length > 1 ? ktoJetzt - ktoV[0].kto : 0;

  return (
    <div>
      <MTitel rubrik="Deine Vorgänge">Anliegen</MTitel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <Btn kind="primary" style={{ height: 52, borderRadius: 17, fontSize: 15 }}
          onClick={() => akt.oeffneAntrag(null)}>Frei beantragen</Btn>
        <Btn kind="danger" style={{ height: 52, borderRadius: 17, fontSize: 15 }}
          onClick={() => akt.oeffneKrankmeldung(ich.id)}>Krank melden</Btn>
      </div>

      {einsatz.length > 0 && (<>
        <Rubrik style={{ marginBottom: 11 }}>Einsatzanfragen</Rubrik>
        {einsatz.map((a) => {
          const da = map[a.dienstId];
          return (
            <MKarte key={a.id} ton="danger">
              <div style={{ fontSize: 16, fontWeight: 620 }}>{fLang(a.von)}</div>
              <div style={{ fontSize: 14, color: C.dim, marginTop: 4, ...NUM }}>
                {da ? `${da.name} · ${da.start}–${da.ende} · ${n1(dauer(da))} h` : a.dienstId}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <Btn kind="ok" style={{ height: 46, borderRadius: 15 }}
                  onClick={() => akt.beantworteEinsatz(a.id, true)}>Zusagen</Btn>
                <Btn kind="quiet" style={{ height: 46, borderRadius: 15 }}
                  onClick={() => akt.beantworteEinsatz(a.id, false)}>Absagen</Btn>
              </div>
            </MKarte>);
        })}
      </>)}

      {boerse.length > 0 && (<>
        <Rubrik style={{ margin: "24px 0 11px" }}>Tauschbörse · {boerse.length} offen</Rubrik>
        {boerse.slice(0, 6).map((a) => {
          const p = m.personen.find((x) => x.id === a.personId);
          const t = p && personTag(m, p, a.von);
          const da = t && map[t.dienstId];
          const gemeldet = (a.interessenten || []).includes(ich.id);
          return (
            <MKarte key={a.id}>
              <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
                <Zelle da={da} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{fKurz(a.von)}{da ? ` · ${da.name}` : ""}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 3 }}>
                    {p ? `${p.vorname} ${p.nachname}` : "?"} sucht Tausch</div>
                </div>
              </div>
              {a.text && <div style={{ fontSize: 13, color: C.dimmer, marginTop: 9 }}>„{a.text}"</div>}
              <Btn kind={gemeldet ? "quiet" : "primary"} style={{ width: "100%", height: 46, marginTop: 13, borderRadius: 15 }}
                onClick={() => gemeldet ? akt.tauschAbmelden(a.id) : akt.tauschMelden(a.id)}>
                {gemeldet ? "Meldung zurücknehmen" : "Ich übernehme"}</Btn>
            </MKarte>);
        })}
      </>)}

      <Rubrik style={{ margin: "28px 0 12px" }}>Mein Stundenkonto</Rubrik>
      <Kontoblatt m={m} verlauf={ktoV} jetzt={ktoJetzt} trend={ktoTrend} />

      {meine.filter((a) => a.typ !== "einsatz").length > 0 && (<>
        <Rubrik style={{ margin: "24px 0 11px" }}>Meine Anträge</Rubrik>
        <MKarte style={{ padding: "4px 18px" }}>
          {meine.filter((a) => a.typ !== "einsatz").slice(0, 8).map((a) => (
            <MZeile key={a.id}
              links={`${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fKurz(a.von)}`}
              unten={a.bis !== a.von ? `bis ${fKurz(a.bis)}` : a.antwort || null}
              rechts={<Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>
                {a.status}</Pill>} />))}
        </MKarte>
      </>)}
    </div>);
}

/**
 * Stundenkonto im skandinavischen Zuschnitt: eine große Zahl, eine dünne Linie,
 * viel Weißraum. Keine Gitternetze, keine Achsenbeschriftung, keine Farbflächen —
 * der Verlauf trägt die Aussage, alles andere tritt zurück.
 */
function Kontoblatt({ m, verlauf, jetzt, trend }) {
  const grenze = m.einstellungen.ausgleichGrenze || 40;
  const werte = verlauf.map((x) => x.kto);
  const min = Math.min(...werte, 0), max = Math.max(...werte, 0);
  const spanne = (max - min) || 1;
  const W = 300, H = 78;
  const x = (i) => (i / Math.max(1, verlauf.length - 1)) * W;
  const y = (v) => H - ((v - min) / spanne) * H;
  const linie = verlauf.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kto).toFixed(1)}`).join(" ");
  const letzterX = x(verlauf.length - 1), letzterY = y(jetzt);
  const ueber = Math.abs(jetzt) > grenze;
  const richtung = Math.abs(trend) < 3 ? "gleichbleibend" : trend > 0 ? "aufbauend" : "abbauend";

  return (
    <div style={{ background: C.flaeche, borderRadius: 24, padding: "30px 26px 26px",
      border: `1px solid ${C.line}`, marginBottom: 12 }}>
      {/* Die Zahl trägt alles */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: "-.045em", lineHeight: 1,
            color: ueber ? C.warn : C.text, ...NUM }}>
            {jetzt >= 0 ? "+" : "−"}{n1(Math.abs(jetzt))}
            <span style={{ fontSize: 19, fontWeight: 400, color: C.dimmer, marginLeft: 6 }}>h</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.dim, marginTop: 9 }}>
            {richtung}{Math.abs(trend) >= 3 ? ` · ${sgn(trend)} h in ${verlauf.length} Monaten` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", paddingTop: 5 }}>
          <div style={{ fontSize: 11, color: C.dimmer, letterSpacing: ".09em", textTransform: "uppercase" }}>
            Grenze</div>
          <div style={{ fontSize: 15, color: C.dim, marginTop: 4, ...NUM }}>± {n1(grenze)} h</div>
        </div>
      </div>

      {/* Eine dünne Linie, sonst nichts */}
      <svg viewBox={`0 0 ${W} ${H + 14}`} preserveAspectRatio="none"
        style={{ width: "100%", height: 104, display: "block", marginTop: 26, overflow: "visible" }}>
        {min < 0 && max > 0 && (
          <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke={C.line} strokeWidth=".8"
            vectorEffect="non-scaling-stroke" />)}
        <path d={linie} fill="none" stroke={ueber ? C.warn : C.accentHi} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={letzterX} cy={letzterY} r="4" fill={C.flaeche}
          stroke={ueber ? C.warn : C.accentHi} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Monatsnamen nur an den Enden — der Rest ist selbsterklärend */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12,
        fontSize: 11.5, color: C.dimmer, letterSpacing: ".04em" }}>
        <span>{verlauf[0].label}</span>
        <span>{verlauf[verlauf.length - 1].label}</span>
      </div>

      {ueber && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.line}`,
          fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
          Dein Konto liegt über der vereinbarten Grenze. Sprich mit der Planung über Freizeitausgleich.
        </div>)}
    </div>);
}

/* ================================= MEHR ================================= */
function MMehr({ sitz, akt, oeffnen, aufRechner }) {
  const m = sitz.mandant, p = sitz.person;
  const ungelesen = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen).length;
  const nachweise = p.qualifikationen.map((q) => nachweisStand(m, p, q))
    .filter((s) => s.stand === "abgelaufen" || s.stand === "laeuft_ab");
  const e = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
  const ausl = auslastung(m, p, heute().slice(0, 7));

  return (
    <div>
      <MTitel rubrik={e ? e.name : ""}>{p.vorname} {p.nachname}</MTitel>

      <MKarte style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {[["Auslastung", `${ausl.pct} %`], ["Wochenstunden", `${n1(p.wochenstunden)} h`],
          ["Urlaub übrig", `${urlaubskonto(m, p, new Date().getFullYear()).rest} Tage`]].map(([l, v]) => (
          <div key={l} style={{ flex: "1 1 90px" }}>
            <div style={{ fontSize: 11.5, color: C.dimmer }}>{l}</div>
            <div style={{ fontSize: 19, fontWeight: 650, marginTop: 3, ...NUM }}>{v}</div>
          </div>))}
      </MKarte>

      <MKarte style={{ padding: "4px 18px" }}>
        <MZeile links="Mitteilungen" unten={ungelesen ? `${ungelesen} ungelesen` : "keine neuen"}
          rechts={ungelesen > 0 ? <Pill size="sm" tone="danger">{ungelesen}</Pill> : null}
          onClick={() => oeffnen("post")} />
        <MZeile links="Verfügbarkeit" unten="Wann kannst du arbeiten?"
          onClick={() => akt.oeffneVerfuegbarkeit(p.id)} />
        <MZeile links="Wunschdienste" unten="Gern oder lieber nicht"
          onClick={() => oeffnen("wuensche")} />
        <MZeile links="Meine Nachweise" ton={nachweise.some((x) => x.stand === "abgelaufen") ? "danger" : undefined}
          unten={nachweise.length ? nachweise.map((x) => x.qual.name).join(", ") : "alle gültig"}
          onClick={() => oeffnen("nachweise")} />
        <MZeile links="Schwarzes Brett" unten={`${(m.aushang || []).length} Aushänge`}
          onClick={() => oeffnen("aushang")} />
        <MZeile links="Kalender abonnieren" unten="Dienste im Telefonkalender"
          onClick={() => akt.exportICS(p.id)} />
      </MKarte>

      <MKarte style={{ padding: "4px 18px" }}>
        <MZeile links="Feldmodus" unten="Größere Schrift, maximaler Kontrast"
          rechts={<Schalter an={!!p.kontrastmodus} onChange={() => akt.setzeKontrastmodus(!p.kontrastmodus)} />} />
        <MZeile links="Rundgang wiederholen" unten="Wie CENTRIC funktioniert, in fünf Schritten"
          onClick={akt.starteEinfuehrung} />
        <MZeile links="Rechneransicht" unten="Alle Tabellen und Auswertungen"
          onClick={aufRechner} />
      </MKarte>

      <div style={{ padding: "10px 4px 0" }}>
        <Btn kind="quiet" style={{ width: "100%", height: 46, borderRadius: 15 }}
          onClick={akt.abmelden}>Abmelden</Btn>
      </div>
      <div style={{ textAlign: "center", fontSize: 11.5, color: C.dimmer, padding: "18px 0 6px" }}>
        CENTRIC · {m.name}
      </div>
    </div>);
}

/* =========================== MOBILE SCHALE ============================== */
function MobilSchale({ sitz, akt: aktRoh, aufRechner, dialoge }) {
  const [tab, setTab] = useState("heute");
  const [blatt, setBlatt] = useState(null);
  const [antrag, setAntrag] = useState(null);
  const m = sitz.mandant, p = sitz.person;
  const ungelesen = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen).length;
  const oeffnen = (was) => setBlatt(was);
  // Der Antrag wird hier als Blatt gezeigt, nicht als Ansichtswechsel
  const akt = { ...aktRoh, oeffneAntrag: (d) => setAntrag({ art: "urlaub",
    von: d || heute(), bis: d || heute(), text: "" }) };

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 92 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 40, padding: "12px 18px",
        background: "rgba(255,255,255,.94)", backdropFilter: "saturate(200%) blur(24px)",
        WebkitBackdropFilter: "saturate(200%) blur(24px)", borderBottom: `1px solid ${C.line}`,
        display: "flex", alignItems: "center", gap: 12 }}>
        <Logo size={24} />
        <span style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.02em", flex: 1 }}>CENTRIC</span>
        <button onClick={() => oeffnen("post")} style={{ position: "relative", border: "none",
          background: C.bg, width: 38, height: 38, borderRadius: 13, cursor: "pointer",
          fontSize: 15, color: C.dim }}>✉︎
          {ungelesen > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18,
            borderRadius: 9, background: C.danger, color: "#fff", fontSize: 10.5, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center" }}>{ungelesen}</span>}
        </button>
      </header>

      <main style={{ padding: "20px 18px 10px" }}>
        {tab === "heute" && <MHeute sitz={sitz} akt={akt} setTab={setTab} oeffnen={oeffnen} />}
        {tab === "plan" && <MPlan sitz={sitz} akt={akt} oeffnen={oeffnen} />}
        {tab === "anliegen" && <MAnliegen sitz={sitz} akt={akt} oeffnen={oeffnen} />}
        {tab === "mehr" && <MMehr sitz={sitz} akt={akt} oeffnen={oeffnen} aufRechner={aufRechner} />}
      </main>

      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "flex",
        background: "rgba(255,255,255,.96)", backdropFilter: "saturate(200%) blur(28px)",
        WebkitBackdropFilter: "saturate(200%) blur(28px)", borderTop: `1px solid ${C.line}`,
        padding: "8px 6px calc(8px + env(safe-area-inset-bottom))" }}>
        {M_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, border: "none", background: tab === t.id ? C.accentLight : "transparent",
              cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4, padding: "8px 2px", borderRadius: 15, minHeight: 52,
              color: tab === t.id ? C.text : C.dimmer, fontSize: 11, fontWeight: 600,
              boxShadow: tab === t.id ? `inset 0 -2px 0 ${C.accent}` : "none" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.glyph}</span>{t.label}
          </button>))}
      </nav>

      {/* Blätter für die selteneren Ansichten */}
      <MBlatt offen={blatt === "post"} onClose={() => { akt.alleGelesen(); setBlatt(null); }} titel="Mitteilungen">
        {(m.nachrichten || []).filter((n) => n.personId === p.id).length === 0
          ? <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px" }}>
              Hier erscheinen Entscheidungen zu deinen Anträgen und Änderungen an deinen Diensten.</div>
          : (m.nachrichten || []).filter((n) => n.personId === p.id).slice(0, 30).map((n) => (
            <MKarte key={n.id} ton={n.art === "warn" ? "warn" : undefined}
              style={{ borderLeft: n.gelesen ? undefined : `3px solid ${n.art === "warn" ? C.warn : C.accent}` }}>
              <div style={{ fontSize: 15.5, fontWeight: n.gelesen ? 500 : 650 }}>{n.titel}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{n.text}</div>
              <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 8, ...NUM }}>{n.zeit}</div>
            </MKarte>))}
      </MBlatt>

      <MBlatt offen={blatt === "nachweise"} onClose={() => setBlatt(null)} titel="Meine Nachweise">
        {p.qualifikationen.map((q) => {
          const s = nachweisStand(m, p, q);
          if (!s.qual) return null;
          const tone = s.stand === "abgelaufen" ? "danger" : s.stand === "laeuft_ab" ? "warn" : "ok";
          return (
            <MKarte key={q} ton={tone === "ok" ? undefined : tone}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{s.qual.name}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>
                    {s.stand === "abgelaufen" ? `abgelaufen am ${fDatum(s.ablauf)}`
                      : s.stand === "laeuft_ab" ? `läuft in ${s.tage} Tagen ab`
                      : s.unbefristet ? "unbefristet gültig" : `gültig bis ${fDatum(s.ablauf)}`}</div>
                </div>
                <Pill size="sm" tone={tone}>{s.stand === "gueltig" ? "gültig" : s.stand === "laeuft_ab" ? "bald" : "abgelaufen"}</Pill>
              </div>
              {s.stand === "abgelaufen" && (
                <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10, lineHeight: 1.45 }}>
                  Bitte einen neuen Nachweis bei der Planung einreichen. Bis dahin zählt diese Qualifikation
                  nicht für die Besetzung.</div>)}
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "aushang"} onClose={() => setBlatt(null)} titel="Schwarzes Brett">
        {(m.aushang || []).length === 0
          ? <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px" }}>Nichts angeschlagen.</div>
          : (m.aushang || []).map((x) => (
            <MKarte key={x.id} ton={x.wichtig ? "danger" : undefined}>
              {x.wichtig && <Pill size="sm" tone="danger" style={{ marginBottom: 8 }}>wichtig</Pill>}
              <div style={{ fontSize: 16.5, fontWeight: 650 }}>{x.titel}</div>
              <div style={{ fontSize: 14, color: C.dim, marginTop: 7, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {x.text}</div>
              <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 10, ...NUM }}>{x.von} · {x.zeit}</div>
            </MKarte>))}
      </MBlatt>

      <MBlatt offen={blatt === "zeiten"} onClose={() => setBlatt(null)} titel="Zeiten bestätigen">
        <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
          Solange die tatsächliche Zeit nicht bestätigt ist, bleibt dein Stundenkonto eine Hochrechnung.
        </div>
        {offeneErfassung(m, p, addDays(heute(), -1)).map((d) => {
          const t = personTag(m, p, d);
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          if (!da) return null;
          return (
            <MKarte key={d}>
              <div style={{ fontSize: 15.5, fontWeight: 600, ...NUM }}>{fLang(d)}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4, ...NUM }}>
                geplant {da.start}–{da.ende} · {n1(dauer(da))} h</div>
              <Btn kind="ok" style={{ width: "100%", height: 46, marginTop: 13, borderRadius: 15 }}
                onClick={() => akt.bestaetigeZeit(p.id, d, null, null, "")}>Wie geplant</Btn>
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "wuensche"} onClose={() => setBlatt(null)} titel="Wunschdienste">
        <MWuensche sitz={sitz} akt={akt} />
      </MBlatt>

      <MBlatt offen={!!antrag} onClose={() => setAntrag(null)} titel="Frei beantragen">
        {antrag && (
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Art">
              <Sel value={antrag.art} onChange={(e) => setAntrag({ ...antrag, art: e.target.value })}>
                {ABW_ARTEN.filter((a) => a.id !== "krank" && a.id !== "ausgleich")
                  .map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></Field>
            <Field label="Von"><Inp type="date" value={antrag.von}
              onChange={(e) => setAntrag({ ...antrag, von: e.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={antrag.bis}
              onChange={(e) => setAntrag({ ...antrag, bis: e.target.value })} /></Field>
            <Field label="Anmerkung"><Inp value={antrag.text}
              onChange={(e) => setAntrag({ ...antrag, text: e.target.value })} /></Field>
            <Btn kind="primary" style={{ height: 52, borderRadius: 17, fontSize: 15.5 }}
              onClick={() => { akt.stelleAntrag({ typ: "abwesenheit", art: antrag.art,
                von: antrag.von, bis: antrag.bis, text: antrag.text }); setAntrag(null); }}>
              Antrag stellen</Btn>
          </div>)}
      </MBlatt>

      {dialoge}
    </div>);
}

/** Wunschraster in kompakter Form fürs Telefon. */
function MWuensche({ sitz, akt }) {
  const m = sitz.mandant, ich = sitz.person;
  const [ym, setYm] = useState(heute().slice(0, 7));
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym}-01`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym}-${pad(i)}`);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (<>
    <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
      Tippen wechselt zwischen „würde gern", „lieber nicht" und leer. Kein Antrag — nur ein Hinweis
      an die Planung.
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <Btn size="sm" onClick={() => shift(-1)}>‹</Btn>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{MON[mo - 1]} {y}</span>
      <Btn size="sm" onClick={() => shift(1)}>›</Btn>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
      {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600,
        color: i >= 5 ? C.dimmer : C.dim }}>{d.slice(0, 2)}</div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 20 }}>
      {zellen.map((d, i) => {
        if (!d) return <div key={i} />;
        const w = wunschAm(m, ich.id, d);
        const t = personTag(m, ich, d);
        const da = t.dienstId && map[t.dienstId];
        const vergangen = d < heute();
        return (
          <div key={d} onClick={() => !vergangen && akt.setzeWunsch(ich.id, d)}
            style={{ aspectRatio: "1", borderRadius: 12, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 1, opacity: vergangen ? .4 : 1,
              background: w ? (w.art === "moechte" ? C.okLight : C.warnLight)
                : C.bg }}>
            <span style={{ fontSize: 12, color: C.dim, ...NUM }}>{Number(d.slice(8))}</span>
            {w ? <span style={{ fontSize: 13, fontWeight: 700, color: w.art === "moechte" ? C.ok : C.warn }}>
              {w.art === "moechte" ? "✓" : "✕"}</span>
              : da && <span style={{ fontSize: 9.5, color: da.farbe, fontWeight: 700 }}>{da.kurz}</span>}
          </div>);
      })}
    </div>
  </>);
}
