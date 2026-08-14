
/* ==========================================================================
   TAGESSTART — der Einstieg für jede Rolle
   Nicht was alles existiert, sondern was heute ansteht.
   ========================================================================== */
const AUFGABE_SYMBOL = { stempel: "◷", zeiten: "◷", nachweis: "⚠", nachweise: "⚠", post: "✉",
  einsatz: "!", antrag: "✓", boerse: "⇄", besetzung: "!", pruefung: "⚠", freigabe: "◎", konto: "Σ" };

function Tagesstart({ sitz, akt, gehZu, oeffneTag }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  const aufgaben = useMemo(() => tagesaufgaben(sitz), [m, p.id]);
  const dringend = aufgaben.filter((a) => a.dringend);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meinDienst = p.imSchichtdienst !== false ? personTag(m, p, d0) : null;
  const meineDa = meinDienst && meinDienst.dienstId ? map[meinDienst.dienstId] : null;
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 style={{ fontSize: 38, fontWeight: 300, letterSpacing: "-.04em", margin: "10px 0 0", lineHeight: 1.08 }}>
          {gruss}, <b style={{ fontWeight: 700 }}>{p.vorname}</b>.
        </h1>
        <p style={{ fontSize: 16.5, color: C.dim, margin: "12px 0 0", maxWidth: 640, lineHeight: 1.5 }}>
          {aufgaben.length === 0
            ? "Nichts liegt an. Alle Anträge sind entschieden, alle Nachweise gültig, die Besetzung trägt."
            : dringend.length
              ? `${dringend.length} ${dringend.length === 1 ? "Sache braucht" : "Sachen brauchen"} deine Aufmerksamkeit${aufgaben.length > dringend.length ? `, ${aufgaben.length - dringend.length} weitere warten` : ""}.`
              : `${aufgaben.length} ${aufgaben.length === 1 ? "Vorgang wartet" : "Vorgänge warten"} auf dich.`}
        </p>
      </div>

      {(() => {
        const es = einrichtungsstand(m);
        if (es.fertig || !darf(sitz, "org.edit")) return null;
        return (
          <Card style={{ padding: 26, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <Rubrik>Einrichtung</Rubrik>
                <div style={{ fontSize: 21, fontWeight: 300, letterSpacing: "-.03em", marginTop: 8 }}>
                  Noch <b style={{ fontWeight: 700 }}>{es.offen.length} Schritt{es.offen.length === 1 ? "" : "e"}</b> bis zum laufenden Betrieb
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 650, ...NUM }}>{es.anteil} %</div>
                <div style={{ fontSize: 11.5, color: C.dimmer }}>fertig</div>
              </div>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: "hidden",
              marginBottom: 18 }}>
              <div style={{ width: `${es.anteil}%`, height: "100%", background: C.ok, transition: "width .4s" }} />
            </div>
            {es.schritte.map((x) => (
              <div key={x.id} onClick={() => !x.erledigt && gehZu(x.ziel)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0",
                  cursor: x.erledigt ? "default" : "pointer", opacity: x.erledigt ? .5 : 1,
                  borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                  background: x.erledigt ? C.okLight : C.lineSoft,
                  color: x.erledigt ? C.ok : C.dimmer }}>{x.erledigt ? "✓" : "·"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: x.erledigt ? 400 : 600,
                    textDecoration: x.erledigt ? "line-through" : "none" }}>{x.titel}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 2 }}>{x.text}</div>
                </div>
                {!x.erledigt && <span style={{ color: C.dimmer, fontSize: 19 }}>›</span>}
              </div>))}
          </Card>);
      })()}

      {meineDa && (
        <Card style={{ padding: 24, marginBottom: 20, display: "flex", alignItems: "center",
          gap: 20, flexWrap: "wrap" }}>
          <Zelle da={meineDa} size={54} />
          <div style={{ flex: 1, minWidth: 190 }}>
            <Rubrik>Dein Dienst heute</Rubrik>
            <div style={{ fontSize: 21, fontWeight: 600, marginTop: 5 }}>{meineDa.name}</div>
            <div style={{ fontSize: 14, color: C.dim, marginTop: 3, ...NUM }}>
              {meineDa.start}–{meineDa.ende} · {n1(dauer(meineDa))} h{meineDa.ort ? ` · ${meineDa.ort}` : ""}</div>
          </div>
          <Stempeluhr sitz={sitz} akt={akt} datum={d0} />
        </Card>)}

      {aufgaben.length === 0
        ? <Card style={{ padding: 44, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 12, color: C.ok }}>✓</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 7 }}>Alles erledigt</div>
            <div style={{ fontSize: 14, color: C.dim, maxWidth: 380, margin: "0 auto", lineHeight: 1.5 }}>
              Nichts erfordert derzeit eine Entscheidung. Über die Navigation kommst du zu allen Ansichten.
            </div>
          </Card>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 14 }}>
            {aufgaben.map((a, i) => (
              <Card key={i} hover onClick={() => gehZu(a.ziel)}
                style={{ padding: 20, cursor: "pointer", position: "relative", overflow: "hidden" }}>
                {a.dringend && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                  background: C.danger }} />}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 13, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700,
                    background: a.dringend ? C.dangerLight : C.bg,
                    color: a.dringend ? C.danger : C.dim }}>{AUFGABE_SYMBOL[a.art] || "·"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 620, letterSpacing: "-.01em" }}>{a.titel}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{a.text}</div>
                    {a.aktion && <div style={{ marginTop: 12 }}>
                      <span className="btn btn-sm btn-primary">{a.aktion}</span></div>}
                  </div>
                  <span style={{ color: C.dimmer, fontSize: 19, flexShrink: 0 }}>›</span>
                </div>
              </Card>))}
          </div>}

      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
        <Btn size="sm" kind="quiet" onClick={akt.briefingZeigen}>Briefing als Text</Btn>
        <Btn size="sm" kind="quiet" onClick={akt.briefingPush}>Als Benachrichtigung</Btn>
        <Btn size="sm" kind="quiet" onClick={akt.oeffneKommando}>Suchen · Strg + K</Btn>
      </div>

      {(m.aushang || []).filter((x) => !x.bis || x.bis >= d0).length > 0 && (
        <Card style={{ marginTop: 22 }}>
          <CardHead right={<Btn size="sm" kind="quiet" onClick={() => gehZu("aushang")}>Alle ansehen</Btn>}>
            Am Schwarzen Brett</CardHead>
          {(m.aushang || []).filter((x) => !x.bis || x.bis >= d0).slice(0, 3).map((x) => (
            <div key={x.id} style={{ padding: "14px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {x.wichtig && <Pill size="sm" tone="danger">wichtig</Pill>}
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{x.titel}</span>
                <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>{x.zeit}</span>
              </div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>{x.text}</div>
            </div>))}
        </Card>)}
    </div>);
}

/* ------------------------------- Stempeluhr ------------------------------ */
function Stempeluhr({ sitz, akt, datum }) {
  const m = sitz.mandant, p = sitz.person;
  const st = stempelStand(m, p, datum);
  const [laeuft, setLaeuft] = useState(false);

  const stempeln = (art) => {
    setLaeuft(true);
    const fertig = (koord) => { akt.stempeln(p.id, datum, art, koord); setLaeuft(false); };
    if (!navigator.geolocation) return fertig(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => fertig({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => fertig(null), { timeout: 6000, maximumAge: 60000 });
  };

  if (!st) return (
    <div style={{ textAlign: "right" }}>
      <Btn kind="primary" disabled={laeuft} onClick={() => stempeln("start")}>
        {laeuft ? "Standort wird geprüft …" : "Einstempeln"}</Btn>
      <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 7, maxWidth: 210, lineHeight: 1.4 }}>
        Der Standort wird einmalig geprüft. Gespeichert wird nur, ob du am Einsatzort warst — keine Koordinate,
        kein Verlauf.
      </div>
    </div>);
  if (!st.ende) return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 8, ...NUM }}>
        Eingestempelt {st.start}{st.ortStart ? ` · ${st.ortStart}` : ""}</div>
      <Btn kind="ok" disabled={laeuft} onClick={() => stempeln("ende")}>
        {laeuft ? "Standort wird geprüft …" : "Ausstempeln"}</Btn>
    </div>);
  return (
    <div style={{ textAlign: "right" }}>
      <Pill tone="ok">Dienst erfasst</Pill>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7, ...NUM }}>
        {st.start} – {st.ende}{st.ortStart ? ` · ${st.ortStart}` : ""}</div>
    </div>);
}

/* ============================== VERFÜGBARKEIT =========================== */
function Verfuegbarkeit({ sitz, akt, personId, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === (personId || sitz.person.id));
  const [v, setV] = useState(() => p.verfuegbarkeit && p.verfuegbarkeit.raster
    ? { ...p.verfuegbarkeit, raster: [...p.verfuegbarkeit.raster] }
    : { aktiv: false, raster: Array(21).fill(true) });
  if (!p) return null;
  const um = (i) => setV({ ...v, raster: v.raster.map((x, k) => (k === i ? !x : x)) });
  const zeile = (f) => setV({ ...v, raster: v.raster.map((x, k) => (k % 3 === f ? !v.raster.slice(0, 21).filter((_, j) => j % 3 === f).every(Boolean) : x)) });
  const frei = v.raster.filter(Boolean).length;

  return (
    <Sheet open onClose={onClose} titel={`Verfügbarkeit · ${p.vorname} ${p.nachname}`} width={620}>
      <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 20 }}>
        Tippe die Felder an, in denen du arbeiten kannst. Die Angabe gilt <b>wöchentlich wiederkehrend</b>.
        Für gesperrte Zeiten wirst du weder eingeplant noch angefragt.
      </div>

      <label className="karte" style={{ display: "flex", alignItems: "center", gap: 13, padding: 16,
        marginBottom: 20, cursor: "pointer" }}>
        <Schalter an={v.aktiv} onChange={() => setV({ ...v, aktiv: !v.aktiv })} />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Verfügbarkeit einschränken</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3 }}>
            Ausgeschaltet bedeutet: jederzeit einsetzbar.</div>
        </div>
      </label>

      <div style={{ opacity: v.aktiv ? 1 : .42, pointerEvents: v.aktiv ? "auto" : "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: "104px repeat(7,1fr)", gap: 7, marginBottom: 8 }}>
          <div />
          {DOW.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600,
              color: i >= 5 ? C.dim : C.text }}>{d}</div>))}
        </div>
        {FENSTER.map((f) => (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: "104px repeat(7,1fr)", gap: 7, marginBottom: 7 }}>
            <button onClick={() => zeile(f.id)} className="btn btn-sm btn-quiet"
              style={{ justifyContent: "flex-start", textAlign: "left" }}>{f.name}</button>
            {DOW.map((_, d) => {
              const i = d * 3 + f.id, an = v.raster[i];
              return (
                <button key={d} onClick={() => um(i)} 
                  style={{ height: 46, borderRadius: 12, border: "none", cursor: "pointer",
                    background: an ? C.okLight : C.bg,
                    color: an ? C.ok : "transparent", fontSize: 17, fontWeight: 700 }}>✓</button>);
            })}
          </div>))}
        <div style={{ display: "flex", gap: 18, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
            <span style={{ width: 15, height: 15, borderRadius: 5, background: C.okLight }} />verfügbar</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.dim }}>
            <span style={{ width: 15, height: 15, borderRadius: 5, background: C.bg }} />gesperrt</span>
          <span style={{ fontSize: 13, color: C.dimmer, marginLeft: "auto", ...NUM }}>
            {frei} von 21 Zeitfenstern frei</span>
        </div>
        {v.aktiv && frei < 8 && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: C.warnLight,
            color: C.warn, fontSize: 13, lineHeight: 1.5 }}>
            Bei {frei} freigegebenen Fenstern bist du kaum noch einplanbar. Bitte sprich das mit der Planung ab.
          </div>)}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
        <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" onClick={() => { akt.setzeVerfuegbarkeit(p.id, v); onClose(); }}>Speichern</Btn>
      </div>
    </Sheet>);
}

/* =============================== NACHWEISE ============================== */
function Nachweise({ sitz, akt }) {
  const m = sitz.mandant;
  const nl = useMemo(() => nachweisLage(m), [m]);
  const [f, setF] = useState("alle");
  const alleZeilen = useMemo(() => m.personen.filter((p) => imDienst(p, heute()))
    .flatMap((p) => p.qualifikationen.map((q) => ({ person: p, ...nachweisStand(m, p, q) })))
    .filter((x) => x.qual), [m]);
  const gezeigt = alleZeilen.filter((x) => f === "alle" ? true
    : f === "kritisch" ? (x.stand === "abgelaufen" || x.stand === "fehlt")
    : f === "bald" ? x.stand === "laeuft_ab" : x.stand === "gueltig")
    .sort((a, b) => (a.tage === undefined ? 9e9 : a.tage) - (b.tage === undefined ? 9e9 : b.tage));

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Sachkunde, Erste Hilfe, Führungszeugnis und Fahrerlaubnis laufen ab. Ein abgelaufener Nachweis zählt für die Besetzung nicht mehr mit — die Prüfung schlägt an, bevor jemand ohne gültige Qualifikation im Dienst steht.">
        Nachweise</H1>

      <KpiRow min={190}>
        <Kpi label="Abgelaufen" value={nl.abgelaufen.length} tone={nl.abgelaufen.length ? "danger" : "ok"}
          sub="zählen nicht mehr für die Besetzung" />
        <Kpi label="Laufen bald ab" value={nl.bald.length} tone={nl.bald.length ? "warn" : "ok"}
          sub={`in den nächsten ${NACHWEIS_VORLAUF} Tagen`} />
        <Kpi label="Fehlen" value={nl.fehlt.length} tone={nl.fehlt.length ? "warn" : "ok"} sub="pflichtig, aber nicht hinterlegt" />
        <Kpi label="Gültig" value={alleZeilen.filter((x) => x.stand === "gueltig").length} tone="ok" />
      </KpiRow>

      <div className="reiterreihe" style={{ margin: "22px 0 16px" }}>
        {[["alle", "Alle"], ["kritisch", `Kritisch · ${nl.abgelaufen.length + nl.fehlt.length}`],
          ["bald", `Bald · ${nl.bald.length}`], ["gueltig", "Gültig"]].map(([id, l]) => (
          <Btn key={id} size="sm" kind={f === id ? "primary" : "plain"} onClick={() => setF(id)}>{l}</Btn>))}
      </div>

      <Card>
        {gezeigt.length === 0
          ? <Leer titel="Nichts in dieser Kategorie" text="Wechsle den Filter, um andere Nachweise zu sehen." />
          : gezeigt.slice(0, 60).map((x, i) => {
            const tone = x.stand === "abgelaufen" ? "danger" : x.stand === "laeuft_ab" ? "warn"
              : x.stand === "fehlt" ? "warn" : "ok";
            return (
              <div key={i} className="row" style={{ display: "flex", alignItems: "center", gap: 16,
                padding: "14px 22px", borderBottom: i < gezeigt.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                flexWrap: "wrap" }}>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0,
                  background: tone === "danger" ? C.danger : tone === "warn" ? C.warn : "transparent" }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{x.person.nachname}, {x.person.vorname}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer }}>{x.qual.name}</div>
                </div>
                <Pill size="sm" tone={tone}>
                  {x.stand === "abgelaufen" ? `abgelaufen ${fKurz(x.ablauf)}`
                    : x.stand === "laeuft_ab" ? `noch ${x.tage} Tage`
                    : x.stand === "fehlt" ? "nicht hinterlegt"
                    : x.unbefristet ? "unbefristet" : `bis ${fKurz(x.ablauf)}`}</Pill>
                {x.datei && <Pill size="sm">Datei hinterlegt</Pill>}
                {darf(sitz, "staff.edit") && (
                  <Btn size="sm" onClick={() => akt.oeffneNachweis(x.person.id, x.qual.id)}>
                    {x.stand === "gueltig" && x.unbefristet ? "Ansehen" : "Erneuern"}</Btn>)}
              </div>);
          })}
      </Card>
    </div>);
}

function NachweisPflege({ sitz, akt, personId, qualId, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === personId);
  const q = m.qualifikationen.find((x) => x.id === qualId);
  const st = p && q ? nachweisStand(m, p, qualId) : null;
  const [ablauf, setAblauf] = useState(st && st.ablauf ? st.ablauf
    : q && q.gueltigMonate ? addDays(heute(), Math.round(q.gueltigMonate * 30.44)) : "");
  const [datei, setDatei] = useState(st && st.datei ? st.datei : "");
  if (!p || !q) return null;

  return (
    <Sheet open onClose={onClose} titel={`${q.name} · ${p.vorname} ${p.nachname}`} width={520}>
      {st && st.stand === "abgelaufen" && (
        <div style={{ padding: 14, borderRadius: 12, background: C.dangerLight, color: C.danger,
          fontSize: 13.5, marginBottom: 20, lineHeight: 1.5 }}>
          Seit {fDatum(st.ablauf)} ungültig. Solange kein neuer Nachweis vorliegt, zählt diese Qualifikation
          nicht für die Mindestbesetzung.
        </div>)}
      <div style={{ display: "grid", gap: 16 }}>
        {q.gueltigMonate
          ? <Field label="Gültig bis" hint={`Übliche Gültigkeit: ${q.gueltigMonate} Monate ab Ausstellung.`}>
              <Inp type="date" value={ablauf} onChange={(e) => setAblauf(e.target.value)} /></Field>
          : <div style={{ fontSize: 13.5, color: C.dim }}>Diese Qualifikation ist unbefristet.</div>}
        <Field label="Nachweis" hint="Dateiname oder Fundstelle. Das Dokument selbst gehört in die Personalakte.">
          <Inp value={datei} onChange={(e) => setDatei(e.target.value)}
            placeholder="z. B. Zertifikat_ErsteHilfe_2026.pdf" /></Field>
        {q.gueltigMonate && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn size="sm" kind="quiet" onClick={() => setAblauf(addDays(heute(), Math.round(q.gueltigMonate * 30.44)))}>
              Ab heute {q.gueltigMonate} Monate</Btn>
            <Btn size="sm" kind="quiet" onClick={() => setAblauf(addDays(heute(), 30))}>In 30 Tagen</Btn>
          </div>)}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" onClick={() => { akt.setzeNachweis(personId, qualId, ablauf || null, datei || null); onClose(); }}>
            Speichern</Btn>
        </div>
      </div>
    </Sheet>);
}

/* =========================== TAGES- UND WOCHENBAND ====================== */
function Zeitachse({ sitz, oeffneTag, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [modus, setModus] = useState("woche");
  const [suche, setSuche] = useState("");
  const [nurKnapp, setNurKnapp] = useState(false);
  const woche = Array.from({ length: 7 }, (_, i) => addDays(montag(datum), i));
  const VON = 0, BIS = 24;                      // dargestellter Zeitraum
  const STD = Array.from({ length: BIS - VON + 1 }, (_, i) => VON + i);
  const ZH = 30;                                // Höhe einer Stunde in Pixeln

  const spuren = useMemo(() => {
    const roh = modus === "tag" ? [{ d: datum, b: tagesband(m, datum) }]
      : woche.map((d) => ({ d, b: tagesband(m, d) }));
    const s2 = suche.trim().toLowerCase();
    if (!s2) return roh;
    return roh.map((x) => ({ ...x, b: x.b.filter((y) =>
      y.da.name.toLowerCase().includes(s2) || y.da.kurz.toLowerCase().includes(s2)
      || y.personen.some((p) => `${p.vorname} ${p.nachname}`.toLowerCase().includes(s2))) }));
  }, [m, datum, modus, suche]);

  /** Ein Dienst als senkrechter Balken auf der Stundenachse. */
  const Balken = ({ s, spalten, index, tag }) => {
    const oben = ((s.von / 60) - VON) * ZH;
    const hoehe = Math.max(20, ((Math.min(s.bis, BIS * 60) - s.von) / 60) * ZH);
    const breite = 100 / Math.max(1, spalten);
    const namen = s.personen.slice(0, 3).map((p) => p.nachname).join(", ");
    return (
      <div onClick={() => oeffneTag(tag)}
        title={`${s.da.name} ${s.da.start}–${s.da.ende} · ${s.anzahl} von ${s.soll}${namen ? ` · ${namen}` : ""}`}
        style={{ position: "absolute", top: oben, height: hoehe,
          left: `calc(${index * breite}% + 2px)`, width: `calc(${breite}% - 4px)`,
          background: `${s.da.farbe}1C`, borderLeft: `3px solid ${s.da.farbe}`,
          borderRadius: 9, padding: "5px 7px", overflow: "hidden", cursor: "pointer",
          outline: s.status === "danger" ? `2px solid ${C.danger}` : s.status === "warn" ? `2px solid ${C.warn}` : "none" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: s.da.farbe, lineHeight: 1.2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.da.kurz}</div>
        {hoehe > 40 && (
          <div style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.25,
            color: s.status === "ok" ? C.dim : s.status === "warn" ? C.warn : C.danger, ...NUM }}>
            {s.anzahl}/{s.soll}</div>)}
        {hoehe > 62 && namen && (
          <div style={{ fontSize: 10, color: C.dimmer, marginTop: 2, lineHeight: 1.25,
            overflow: "hidden" }}>{namen}</div>)}
      </div>);
  };

  const spalten = modus === "tag" ? 1 : 7;
  const knapp = (b) => b.some((x) => x.status !== "ok");

  /* Waagerechte Belegung eines Tages: eine Zeile je Person, Balken über die
     Stundenachse. Zeigt Überschneidungen und Übergaben unmittelbar. */
  const zeilen = useMemo(() => {
    if (modus !== "personen") return [];
    const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
    const s2 = suche.trim().toLowerCase();
    return aktive(m, datum)
      .filter((p) => p.imSchichtdienst !== false)
      .map((p) => {
        const t = personTag(m, p, datum);
        const da = t.dienstId && map[t.dienstId];
        const e = m.einheiten.find((x) => x.id === einheitAm(p, datum));
        return { p, da, e, abw: t.abwesenheit };
      })
      .filter((z) => z.da || z.abw)
      .filter((z) => !s2 || `${z.p.vorname} ${z.p.nachname} ${z.da ? z.da.name : ""}`
        .toLowerCase().includes(s2))
      .sort((a, b) => {
        if (!!a.da !== !!b.da) return a.da ? -1 : 1;
        if (a.da && b.da && a.da.start !== b.da.start) return a.da.start < b.da.start ? -1 : 1;
        return a.p.nachname < b.p.nachname ? -1 : 1;
      });
  }, [m, datum, modus, suche]);

  return (
    <div>
      <H1 rubrik="Belegung"
        sub="Wann gearbeitet wird, nicht nur ob. Die Stundenachse steht links — dadurch lassen sich die Tage untereinander vergleichen und Übergaben werden sichtbar."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Seg value={modus} onChange={setModus} options={[{ id: "tag", label: "Tag" },
            { id: "woche", label: "Woche" }, { id: "personen", label: "Personen" }]} />
          <Btn size="sm" onClick={() => setDatum(addDays(datum, modus === "tag" ? -1 : -7))}>‹</Btn>
          <Btn size="sm" onClick={() => setDatum(heute())}>Heute</Btn>
          <Btn size="sm" onClick={() => setDatum(addDays(datum, modus === "tag" ? 1 : 7))}>›</Btn>
        </div>}>
        {modus === "tag" ? fLang(datum) : `Woche ab ${fDatum(montag(datum))}`}</H1>

      {modus === "personen" ? (
        <Card style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 940 }}>
            {/* Stundenleiste */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 2,
              background: C.bg, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 210, flexShrink: 0, padding: "10px 16px" }}>
                <Lab>{zeilen.length} Personen</Lab></div>
              <div style={{ flex: 1, display: "flex" }}>
                {Array.from({ length: 12 }, (_, i) => i * 2).map((h) => (
                  <div key={h} style={{ flex: 1, padding: "10px 0 10px 6px", fontSize: 11,
                    color: C.dim, borderLeft: `1px solid ${C.line}`, ...NUM }}>
                    {pad(h)}:00</div>))}
              </div>
            </div>
            {zeilen.length === 0
              ? <Leer titel="Niemand im Dienst" text="An diesem Tag ist keine Person eingeteilt." />
              : zeilen.map((z, i) => {
                const von = z.da ? toMin(z.da.start) : 0;
                let bis = z.da ? toMin(z.da.ende) : 0;
                if (z.da && bis <= von) bis += 1440;
                const links = (von / 1440) * 100;
                const breite = z.da ? Math.min(100 - links, ((bis - von) / 1440) * 100) : 0;
                const ueber = z.da && bis > 1440;      // läuft über Mitternacht
                return (
                  <div key={z.p.id} className="zeile-hover"
                    style={{ display: "flex", alignItems: "center", minHeight: "var(--zeile)",
                      borderBottom: i < zeilen.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ width: 210, flexShrink: 0, padding: "0 16px", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 550, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis" }}>
                        {z.p.nachname}, {z.p.vorname.slice(0, 1)}.</div>
                      <div style={{ fontSize: 11.5, color: C.dim }}>{z.e ? z.e.name : ""}</div>
                    </div>
                    <div style={{ flex: 1, position: "relative", height: "var(--zeile)" }}>
                      {/* Stundenraster */}
                      {Array.from({ length: 12 }, (_, k) => (
                        <div key={k} style={{ position: "absolute", left: `${(k / 12) * 100}%`,
                          top: 0, bottom: 0, width: 1, background: C.lineSoft }} />))}
                      {z.da ? (
                        <div onClick={() => oeffneTag(datum)}
                          title={`${z.da.name} ${z.da.start}–${z.da.ende}`}
                          style={{ position: "absolute", left: `${links}%`, width: `${breite}%`,
                            top: 7, bottom: 7, borderRadius: 7, cursor: "pointer",
                            background: `${z.da.farbe}22`, borderLeft: `3px solid ${z.da.farbe}`,
                            display: "flex", alignItems: "center", padding: "0 9px", overflow: "hidden" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 650, color: z.da.farbe,
                            whiteSpace: "nowrap" }}>{z.da.kurz}</span>
                          <span style={{ fontSize: 11, color: C.dim, marginLeft: 8,
                            whiteSpace: "nowrap", ...NUM }}>{z.da.start}–{z.da.ende}</span>
                        </div>
                      ) : (
                        <div style={{ position: "absolute", left: 0, right: 0, top: 12, bottom: 12,
                          borderRadius: 6, background: `${abwArt(z.abw.art).farbe}12`,
                          display: "flex", alignItems: "center", padding: "0 10px" }}>
                          <span style={{ fontSize: 11.5, color: abwArt(z.abw.art).farbe }}>
                            {abwArt(z.abw.art).label}</span>
                        </div>)}
                      {ueber && (
                        <div style={{ position: "absolute", left: 0, width: `${((bis - 1440) / 1440) * 100}%`,
                          top: 7, bottom: 7, borderRadius: 7, background: `${z.da.farbe}18`,
                          borderLeft: `3px solid ${z.da.farbe}`, opacity: .65 }} />)}
                    </div>
                  </div>);
              })}
          </div>
        </Card>
      ) : null}

      {modus !== "personen" && <Filterleiste suche={suche} setSuche={setSuche} platzhalter="Dienstart oder Person …"
        rechts={<>
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <Schalter an={nurKnapp} onChange={() => setNurKnapp(!nurKnapp)} />
            <span style={{ fontSize: 13, color: C.dim }}>nur knappe Tage</span>
          </label>
          <Btn size="sm" kind="quiet" onClick={() => { setSuche(""); setNurKnapp(false); }}>Zurücksetzen</Btn>
        </>} />}

      {modus !== "personen" && (
      <Card style={{ padding: "20px 20px 14px", overflowX: "auto" }}>
        <div style={{ minWidth: modus === "woche" ? 820 : 340 }}>
          {/* Kopfzeile mit den Tagen */}
          <div style={{ display: "flex", marginBottom: 10 }}>
            <div style={{ width: 58, flexShrink: 0 }} />
            {(modus === "tag" ? [datum] : woche).map((d) => {
              const fei = feiertag(d, m.bundesland);
              const eintrag = spuren.find((x) => x.d === d);
              const eng = eintrag && knapp(eintrag.b);
              const aus = nurKnapp && !eng;
              return (
                <div key={d} onClick={() => oeffneTag(d)} style={{ flex: 1, textAlign: "center",
                  cursor: "pointer", opacity: aus ? .3 : 1, padding: "0 3px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: dow(d) >= 5 ? C.dim : C.text }}>
                    {DOW[dow(d)]}</div>
                  <div style={{ fontSize: 15, fontWeight: d === heute() ? 700 : 400, ...NUM,
                    color: d === heute() ? C.accent : fei ? C.danger : C.text, marginTop: 2 }}>
                    {Number(d.slice(8))}</div>
                  {fei && <div style={{ fontSize: 10, color: C.danger }}>Feiertag</div>}
                  {eng && <div style={{ fontSize: 10, color: C.warn }}>knapp</div>}
                </div>);
            })}
          </div>

          {/* Stundenachse links, Tagesspalten rechts */}
          <div style={{ display: "flex", position: "relative" }}>
            <div style={{ width: 58, flexShrink: 0, position: "relative", height: (BIS - VON) * ZH }}>
              {STD.map((h) => (
                <div key={h} style={{ position: "absolute", top: (h - VON) * ZH - 7, right: 11,
                  fontSize: 11, color: h % 6 === 0 ? C.dim : C.dimmer, fontWeight: h % 6 === 0 ? 600 : 400, ...NUM }}>
                  {h < 24 ? `${pad(h)}:00` : ""}</div>))}
            </div>
            <div style={{ flex: 1, display: "flex", gap: 5, position: "relative", height: (BIS - VON) * ZH }}>
              {/* Waagerechte Stundenlinien über die ganze Breite */}
              {STD.map((h) => (
                <div key={h} style={{ position: "absolute", left: 0, right: 0, top: (h - VON) * ZH,
                  height: 1, background: h % 6 === 0 ? "rgba(30,30,22,.13)" : C.bg,
                  pointerEvents: "none" }} />))}
              {(modus === "tag" ? [datum] : woche).map((d) => {
                const eintrag = spuren.find((x) => x.d === d) || { b: [] };
                const eng = knapp(eintrag.b);
                const aus = nurKnapp && !eng;
                // Überlappende Dienste nebeneinander legen
                const sortiert = [...eintrag.b].sort((a, b) => a.von - b.von);
                const lagen = [];
                for (const sp of sortiert) {
                  let l = 0;
                  while (lagen[l] && lagen[l].some((o) => sp.von < o.bis && o.von < sp.bis)) l++;
                  (lagen[l] = lagen[l] || []).push(sp);
                }
                const anzahlLagen = Math.max(1, lagen.length);
                return (
                  <div key={d} style={{ flex: 1, position: "relative", opacity: aus ? .22 : 1,
                    background: d === heute() ? "rgba(43,44,37,.035)" : "transparent", borderRadius: 9 }}>
                    {lagen.map((lage, li) => lage.map((sp) => (
                      <Balken key={`${d}${sp.da.id}`} s={sp} spalten={anzahlLagen} index={li} tag={d} />)))}
                  </div>);
              })}
            </div>
          </div>
        </div>
      </Card>)}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 18 }}>
        {m.dienstarten.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 14, height: 14, borderRadius: 5, background: `${d.farbe}2A`,
              borderLeft: `3px solid ${d.farbe}` }} />
            <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{d.name} · {d.start}–{d.ende}</span>
          </div>))}
        <span style={{ fontSize: 12.5, color: C.dimmer, marginLeft: "auto" }}>
          Dienste über Mitternacht enden an der unteren Kante und beginnen am Folgetag oben.
        </span>
      </div>
    </div>);
}

/* ============================ SCHWARZES BRETT ========================== */
function SchwarzesBrett({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ titel: "", text: "", wichtig: false, bis: "" });
  const darfSchreiben = darf(sitz, "staff.edit") || darf(sitz, "org.edit") || darf(sitz, "plan.edit.unit");
  const eintraege = (m.aushang || []).slice().sort((a, b) => (a.wichtig === b.wichtig ? 0 : a.wichtig ? -1 : 1));

  return (
    <div>
      <H1 rubrik="Betrieb" sub="Aushänge für alle im Betrieb. Für Nachrichten an einzelne Personen gibt es die Mitteilungen."
        right={darfSchreiben && <Btn kind="primary" onClick={() => setNeu(true)}>Aushang verfassen</Btn>}>
        Schwarzes Brett</H1>

      {eintraege.length === 0
        ? <Card><Leer titel="Nichts angeschlagen" text="Hier stehen Mitteilungen, die alle im Betrieb betreffen — Termine, Änderungen, Hinweise." /></Card>
        : <div style={{ display: "grid", gap: 14 }}>
            {eintraege.map((x) => {
              const abgelaufen = x.bis && x.bis < heute();
              return (
                <Card key={x.id} style={{ padding: 22, opacity: abgelaufen ? .55 : 1,
                  borderLeft: x.wichtig ? `4px solid ${C.danger}` : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                        {x.wichtig && <Pill size="sm" tone="danger">wichtig</Pill>}
                        {abgelaufen && <Pill size="sm">abgelaufen</Pill>}
                        <span style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-.015em" }}>{x.titel}</span>
                      </div>
                      <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{x.text}</div>
                      <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, ...NUM }}>
                        {x.von} · {x.zeit}{x.bis ? ` · aushängen bis ${fDatum(x.bis)}` : ""}</div>
                    </div>
                    {darfSchreiben && <Btn size="sm" kind="danger" onClick={() => akt.loescheAushang(x.id)}>Abnehmen</Btn>}
                  </div>
                </Card>);
            })}
          </div>}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Aushang verfassen" width={580}>
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="Überschrift"><Inp value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} /></Field>
          <Field label="Text"><textarea className="inp" rows={6} value={f.text}
            onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, alignItems: "end" }}>
            <Field label="Aushängen bis" hint="Leer bedeutet unbefristet.">
              <Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer", paddingBottom: 10 }}>
              <Schalter an={f.wichtig} onChange={() => setF({ ...f, wichtig: !f.wichtig })} />
              <span style={{ fontSize: 14 }}>Als wichtig hervorheben</span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.titel.trim()} onClick={() => {
              akt.neuerAushang(f); setF({ titel: "", text: "", wichtig: false, bis: "" }); setNeu(false); }}>
              Anschlagen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

/* ============================= BETRIEBSMITTEL ========================== */
const MITTEL_ARTEN = [["schluessel", "Schlüssel"], ["fahrzeug", "Fahrzeug"], ["geraet", "Gerät"],
  ["kleidung", "Dienstkleidung"], ["sonstiges", "Sonstiges"]];

function Betriebsmittel({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ art: "schluessel", name: "", kennung: "", personId: "" });
  const liste = m.betriebsmittel || [];
  const darfPflegen = darf(sitz, "staff.edit") || darf(sitz, "org.edit");
  const jeArt = Object.fromEntries(MITTEL_ARTEN.map(([id]) => [id, liste.filter((x) => x.art === id).length]));
  const ausgegeben = liste.filter((x) => x.personId).length;

  return (
    <div>
      <H1 rubrik="Betrieb" sub="Schlüssel, Fahrzeuge, Geräte und Dienstkleidung — wer hat was, seit wann."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(true)}>Betriebsmittel anlegen</Btn>}>
        Betriebsmittel</H1>

      <KpiRow min={160}>
        <Kpi label="Erfasst" value={liste.length} />
        <Kpi label="Ausgegeben" value={ausgegeben} tone={ausgegeben ? "accent" : "text"}
          sub={`${liste.length - ausgegeben} im Bestand`} />
        {MITTEL_ARTEN.slice(0, 3).map(([id, l]) => <Kpi key={id} label={l} value={jeArt[id] || 0} />)}
      </KpiRow>

      <Card style={{ marginTop: 22 }}>
        {liste.length === 0
          ? <Leer titel="Noch nichts erfasst" text="Lege Schlüssel, Fahrzeuge oder Geräte an und weise sie Personen zu." />
          : liste.map((x, i) => {
            const p = x.personId && m.personen.find((y) => y.id === x.personId);
            return (
              <Ziehbar key={x.id} className="row" aktiv={darfPflegen}
                nutzlast={{ art: "mittel", mittelId: x.id, beschriftung: x.name, farbe: C.accentDeep }}
                style={{ display: "flex", alignItems: "center", gap: 16,
                padding: "14px 22px", borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                flexWrap: "wrap" }}>
                <Pill size="sm">{(MITTEL_ARTEN.find(([id]) => id === x.art) || [])[1]}</Pill>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{x.name}</div>
                  {x.kennung && <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{x.kennung}</div>}
                </div>
                {darfPflegen
                  ? <Sel value={x.personId || ""} style={{ width: 220 }}
                      onChange={(e) => akt.setzeMittel(x.id, "personId", e.target.value || null)}>
                      <option value="">— im Bestand —</option>
                      {m.personen.filter((y) => imDienst(y, heute())).map((y) => (
                        <option key={y.id} value={y.id}>{y.nachname}, {y.vorname}</option>))}
                    </Sel>
                  : <Pill size="sm" tone={p ? "accent" : "neutral"}>{p ? `${p.nachname}` : "im Bestand"}</Pill>}
                {x.seit && <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>seit {fKurz(x.seit)}</span>}
                {darfPflegen && <Btn size="sm" kind="danger" onClick={() => akt.loescheMittel(x.id)}>×</Btn>}
              </Ziehbar>);
          })}
      </Card>

      {darfPflegen && (<>
        <Lab style={{ margin: "24px 0 11px" }}>Ausgabe per Ziehen</Lab>
        <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12, lineHeight: 1.5 }}>
          Ein Betriebsmittel aus der Liste oben auf eine Person ziehen gibt es aus.
          Auf „Zurück in den Bestand" ziehen nimmt es zurück.
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Ablage id="mittel:bestand" nimmt={(l) => l.art === "mittel"}
            ablegen={(l) => akt.setzeMittel(l.mittelId, "personId", null)} style={{ borderRadius: 14 }}>
            <div className="karte" style={{ padding: "12px 16px", fontSize: 13.5, color: C.dim }}>
              Zurück in den Bestand</div>
          </Ablage>
          {m.personen.filter((p) => imDienst(p, heute())).slice(0, 24).map((p) => (
            <Ablage key={p.id} id={`mittel:p:${p.id}`} nimmt={(l) => l.art === "mittel"}
              ablegen={(l) => akt.setzeMittel(l.mittelId, "personId", p.id)} style={{ borderRadius: 14 }}>
              <div className="karte" style={{ padding: "12px 16px", fontSize: 13.5 }}>
                {p.nachname}, {p.vorname.slice(0, 1)}.
                <span style={{ color: C.dimmer, marginLeft: 7, ...NUM }}>
                  {liste.filter((x) => x.personId === p.id).length || ""}</span>
              </div>
            </Ablage>))}
        </div>
      </>)}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Betriebsmittel anlegen" width={520}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Art"><Sel value={f.art} onChange={(e) => setF({ ...f, art: e.target.value })}>
              {MITTEL_ARTEN.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Sel></Field>
            <Field label="Kennung" hint="Nummer, Kennzeichen oder Barcode.">
              <Inp value={f.kennung} onChange={(e) => setF({ ...f, kennung: e.target.value })} /></Field>
          </div>
          <Field label="Bezeichnung"><Inp value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="z. B. Generalschlüssel Haupthaus" /></Field>
          <Field label="Ausgegeben an" hint="Kann später jederzeit geändert werden.">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— im Bestand —</option>
              {m.personen.filter((y) => imDienst(y, heute())).map((y) => (
                <option key={y.id} value={y.id}>{y.nachname}, {y.vorname}</option>))}</Sel></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.name.trim()} onClick={() => {
              akt.neuesMittel(f); setF({ art: "schluessel", name: "", kennung: "", personId: "" }); setNeu(false); }}>
              Anlegen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
