
/* ==========================================================================
   SCHNELLBESETZUNG — aus dem Lagebild heraus
   Zeigt vor dem Eintragen, welche Folgen die Einteilung hätte, und bietet
   als Alternative die Anfrage über einen Nachrichtendienst an.
   ========================================================================== */
/** Was passiert, wenn diese Person diesen Dienst übernimmt? */
function folgenPruefen(m, person, datum, dienstId) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return { hindernisse: [], hinweise: [] };
  const hind = hindernisse(m, person, datum, da);
  const hinweise = [];
  const map = Object.fromEntries(m.dienstarten.map((x) => [x.id, x]));

  // Folgeschichten in beide Richtungen ausdrücklich benennen
  for (const off of [-1, 1]) {
    const dd = addDays(datum, off);
    const t = personTag(m, person, dd);
    if (!t.dienstId) continue;
    const other = map[t.dienstId];
    if (!other) continue;
    const [nS, nE] = fenster(datum, da);
    const [oS, oE] = fenster(dd, other);
    const ruhe = off > 0 ? (oS - nE) / 60 : (nS - oE) / 60;
    hinweise.push({ art: ruhe < m.einstellungen.ruhezeit ? "danger" : "info",
      text: off > 0
        ? `Am Folgetag ${fKurz(dd)} bereits ${other.name} (${other.start}–${other.ende}) — Ruhezeit ${n1(Math.max(0, ruhe))} h`
        : `Am Vortag ${fKurz(dd)} bereits ${other.name} (${other.start}–${other.ende}) — Ruhezeit ${n1(Math.max(0, ruhe))} h` });
  }
  // Dienste in Folge nach der Einteilung
  let serie = 1;
  for (let i = 1; i <= 10; i++) { if (personTag(m, person, addDays(datum, -i)).dienstId) serie++; else break; }
  for (let i = 1; i <= 10; i++) { if (personTag(m, person, addDays(datum, i)).dienstId) serie++; else break; }
  if (serie > m.einstellungen.maxFolge)
    hinweise.push({ art: "danger", text: `Ergibt ${serie} Dienste am Stück, Grenzwert ist ${m.einstellungen.maxFolge}` });
  else if (serie >= m.einstellungen.maxFolge - 1)
    hinweise.push({ art: "warn", text: `Ergibt ${serie} Dienste am Stück` });

  // Wochenarbeitszeit
  const mo = montag(datum);
  let std = dauer(da);
  for (let i = 0; i < 7; i++) { const t = personTag(m, person, addDays(mo, i));
    if (t.dienstId && addDays(mo, i) !== datum) { const x = map[t.dienstId]; if (x) std += dauer(x); } }
  if (std > 48) hinweise.push({ art: "danger", text: `Ergibt ${n1(std)} h in dieser Kalenderwoche — über der Höchstgrenze von 48 h` });
  else if (std > 44) hinweise.push({ art: "warn", text: `Ergibt ${n1(std)} h in dieser Kalenderwoche` });

  const kto = stundenkonto(m, person, datum.slice(0, 7));
  hinweise.push({ art: "info", text: `Stundenkonto danach etwa ${sgn(kto + dauer(da))} h` });
  return { hindernisse: hind, hinweise, dienstart: da };
}

/** Vorformulierte Anfrage für einen Nachrichtendienst. */
function anfrageText(m, datum, dienstId, fehlt) {
  const da = m.dienstarten.find((x) => x.id === dienstId);
  return [
    `${m.name} — kurzfristige Dienstanfrage`,
    ``,
    `${fLang(datum)}`,
    `${da ? `${da.name}, ${da.start} bis ${da.ende} Uhr` : dienstId}`,
    da && da.ort ? `Ort: ${da.ort}` : ``,
    fehlt > 0 ? `Es fehlen ${fehlt} Personen.` : `Verstärkung gesucht.`,
    ``,
    `Wer übernehmen kann, bitte kurz zurückmelden.`,
  ].filter(Boolean).join("\n");
}

function Schnellbesetzung({ sitz, datum, dienstId, akt, onClose }) {
  const m = sitz.mandant;
  const [gewaehlt, setGewaehlt] = useState(null);
  const [text, setText] = useState(null);
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const liste = useMemo(() => ersatzVorschlaege(m, datum, dienstId), [m, datum, dienstId]);
  const moeglich = liste.filter((x) => x.moeglich);
  const folgen = gewaehlt ? folgenPruefen(m, gewaehlt, datum, dienstId) : null;
  const nachricht = anfrageText(m, datum, dienstId, Math.max(0, -b.diff));

  const versenden = (weg) => {
    const t = encodeURIComponent(nachricht);
    const url = weg === "whatsapp" ? `https://wa.me/?text=${t}`
      : weg === "sms" ? `sms:?body=${t}`
      : `mailto:?subject=${encodeURIComponent("Dienstanfrage " + fKurz(datum))}&body=${t}`;
    try { window.open(url, "_blank"); } catch (e) { setText(nachricht); }
    akt.anfrageVermerken(datum, dienstId, weg);
  };

  return (
    <Sheet open onClose={onClose} titel="Dienst besetzen" width={780}>
      <div className="karte" style={{ padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Zelle da={da} size={40} />
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{da.name}</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{fLang(datum)} · {da.start}–{da.ende} · {da.ort}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 650, color: b.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {b.anzahl}<span style={{ fontSize: 14, color: C.dimmer, fontWeight: 500 }}>/{b.soll}</span></div>
          <div style={{ fontSize: 11.5, color: C.dimmer }}>{b.diff < 0 ? `${Math.abs(b.diff)} fehlen` : "gedeckt"}</div>
        </div>
      </div>

      {/* Weg 1: direkt eintragen */}
      <Lab style={{ marginBottom: 10 }}>Direkt eintragen · nach Eignung sortiert</Lab>
      {moeglich.length === 0 && (
        <div style={{ padding: 14, borderRadius: 12, background: C.dangerLight, color: C.danger, fontSize: 13.5, marginBottom: 16 }}>
          Niemand einsetzbar, ohne Ruhezeit oder Einschränkungen zu verletzen. Nutze die Anfrage unten
          oder die Eskalation im Tagesdetail.
        </div>)}
      <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 18 }}>
        {moeglich.slice(0, 8).map((x, i) => {
          const an = gewaehlt && gewaehlt.id === x.person.id;
          return (
            <div key={x.person.id} onClick={() => setGewaehlt(an ? null : x.person)}
              className="karte" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px",
                marginBottom: 7, cursor: "pointer", outline: an ? `2px solid ${C.accent}` : "none" }}>
              <span style={{ width: 25, height: 25, borderRadius: 9, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, ...NUM,
                background: i === 0 ? C.okLight : C.bg, color: i === 0 ? C.ok : C.dimmer }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{x.person.vorname} {x.person.nachname}</div>
                <div style={{ fontSize: 12, color: C.dimmer }}>{x.gruende.slice(0, 2).join(" · ")}</div>
              </div>
              <span style={{ fontSize: 12, color: C.dimmer }}>{an ? "gewählt" : "prüfen"}</span>
            </div>);
        })}
      </div>

      {folgen && (
        <div className="karte" style={{ padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>
            Folgen für {gewaehlt.vorname} {gewaehlt.nachname}</div>
          {folgen.hindernisse.length > 0 && folgen.hindernisse.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
              <span style={{ color: C.danger, fontWeight: 700, fontSize: 13 }}>✕</span>
              <span style={{ fontSize: 13, color: C.danger }}>{h}</span></div>))}
          {folgen.hinweise.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700,
                color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dimmer }}>
                {h.art === "danger" ? "✕" : h.art === "warn" ? "!" : "·"}</span>
              <span style={{ fontSize: 13, color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dim }}>{h.text}</span>
            </div>))}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn kind="quiet" onClick={() => setGewaehlt(null)}>Andere wählen</Btn>
            <Btn kind={folgen.hindernisse.length ? "danger" : "primary"}
              onClick={() => { akt.setzeEinsprung(gewaehlt.id, datum, dienstId); onClose(); }}>
              {folgen.hindernisse.length ? "Trotzdem eintragen" : "Eintragen"}</Btn>
          </div>
        </div>)}

      {/* Weg 2: offene Anfrage versenden */}
      <div style={{ paddingTop: 18, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 10 }}>Oder Anfrage versenden</Lab>
        <pre className="karte" style={{ padding: 14, fontSize: 12.5, whiteSpace: "pre-wrap",
          fontFamily: FONT, color: C.dim, margin: "0 0 14px", lineHeight: 1.5 }}>{nachricht}</pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn kind="primary" onClick={() => versenden("whatsapp")}>Über WhatsApp</Btn>
          <Btn onClick={() => versenden("sms")}>Als SMS</Btn>
          <Btn onClick={() => versenden("mail")}>Per E-Mail</Btn>
          <Btn kind="quiet" onClick={() => { try { navigator.clipboard.writeText(nachricht); akt.melden("Text kopiert."); }
            catch (e) { setText(nachricht); } }}>Text kopieren</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
          Die Nachricht wird im gewählten Dienst geöffnet, die Empfänger wählst du dort. Wer zusagt,
          wird anschließend hier eingetragen — die Prüfung läuft dann genauso.
        </div>
        {text && <textarea readOnly value={text} onFocus={(e) => e.target.select()} className="inp"
          style={{ height: 150, marginTop: 12, fontSize: 12.5 }} />}
      </div>
    </Sheet>);
}

/* ==========================================================================
   TAUSCHBÖRSE — offene Gesuche ohne festen Partner
   ========================================================================== */
function Tauschboerse({ sitz, akt }) {
  const m = sitz.mandant;
  const ich = sitz.person;
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ datum: "", partnerId: "", text: "" });
  const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && !a.partnerId);
  const meine = m.anfragen.filter((a) => a.typ === "tausch" && a.personId === ich.id);
  const eigeneDienste = Array.from({ length: 45 }, (_, i) => addDays(heute(), i))
    .filter((d) => personTag(m, ich, d).dienstId);

  return (
    <div>
      <H1 sub="Wer keinen festen Tauschpartner hat, stellt ein offenes Gesuch ein. Alle im Betrieb sehen es und können sich melden. Erst danach entscheidet die Planung."
        right={darf(sitz, "req.create") && ich.imSchichtdienst !== false &&
          <Btn kind="primary" onClick={() => setNeu(true)}>Gesuch einstellen</Btn>}>Tauschbörse</H1>

      <Card style={{ marginBottom: 20 }}>
        <CardHead right={<Pill tone={boerse.length ? "accent" : "neutral"}>{boerse.length} offen</Pill>}>
          Offene Gesuche</CardHead>
        {boerse.length === 0
          ? <Leer titel="Keine offenen Gesuche" text="Sobald jemand einen Dienst zum Tausch anbietet, erscheint er hier für alle sichtbar." />
          : boerse.map((a, i) => {
            const p = m.personen.find((x) => x.id === a.personId);
            const t = p ? personTag(m, p, a.von) : null;
            const da = t && map[t.dienstId];
            const eigen = a.personId === ich.id;
            const schonGemeldet = (a.interessenten || []).includes(ich.id);
            const eigenerDienst = personTag(m, ich, a.von);
            return (
              <div key={a.id} className="row" style={{ display: "flex", gap: 15, padding: "16px 22px", alignItems: "flex-start",
                borderBottom: i < boerse.length - 1 ? `1px solid ${C.lineSoft}` : "none", flexWrap: "wrap" }}>
                <Zelle da={da} size={38} />
                <div style={{ flex: 1, minWidth: 210 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {fLang(a.von)}{da ? ` · ${da.name}` : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                    {p ? `${p.vorname} ${p.nachname}` : "?"} sucht Tausch
                    {da ? ` · ${da.start}–${da.ende}` : ""}
                  </div>
                  {a.text && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 4 }}>„{a.text}"</div>}
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4 }}>
                    eingestellt {a.erstellt}
                    {(a.interessenten || []).length > 0 && ` · ${a.interessenten.length} Meldung${a.interessenten.length > 1 ? "en" : ""}`}
                  </div>
                  {(a.interessenten || []).length > 0 && darfEntscheiden(sitz, einheitAm(p, a.von)) && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
                      {a.interessenten.map((iid) => {
                        const ip = m.personen.find((x) => x.id === iid);
                        if (!ip) return null;
                        const konflikt = da ? hindernisse(m, ip, a.von, da).length > 0 : false;
                        return (
                          <Btn key={iid} size="sm" kind={konflikt ? "danger" : "ok"}
                            title={konflikt ? "Einteilung würde Vorgaben verletzen" : "Tausch mit dieser Person bestätigen"}
                            onClick={() => akt.tauschZuteilen(a.id, iid)}>
                            {konflikt ? "! " : "✓ "}{ip.nachname}
                          </Btn>);
                      })}
                    </div>)}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {eigen
                    ? <Btn size="sm" kind="quiet" onClick={() => akt.zieheAntragZurueck(a.id)}>Zurückziehen</Btn>
                    : ich.imSchichtdienst !== false && (
                      schonGemeldet
                        ? <Btn size="sm" kind="quiet" onClick={() => akt.tauschAbmelden(a.id)}>Meldung zurücknehmen</Btn>
                        : <Btn size="sm" kind="primary" onClick={() => akt.tauschMelden(a.id)}>Ich übernehme</Btn>)}
                </div>
                {!eigen && eigenerDienst.dienstId && (
                  <div style={{ width: "100%", fontSize: 12, color: C.warn }}>
                    Du hast an diesem Tag bereits {(map[eigenerDienst.dienstId] || {}).name} — bei einer
                    Meldung würden die Dienste getauscht.
                  </div>)}
              </div>);
          })}
      </Card>

      {meine.length > 0 && (
        <Card>
          <CardHead>Meine Tauschvorgänge</CardHead>
          {meine.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 22px",
              borderBottom: `1px solid ${C.lineSoft}` }}>
              <Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>{a.status}</Pill>
              <span style={{ fontSize: 13.5, flex: 1, ...NUM }}>
                {fKurz(a.von)}{a.partnerId ? ` · mit ${(m.personen.find((x) => x.id === a.partnerId) || {}).nachname}` : " · offenes Gesuch"}
              </span>
              {a.antwort && <span style={{ fontSize: 12.5, color: C.dim }}>{a.antwort}</span>}
            </div>))}
        </Card>)}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Tauschgesuch einstellen" width={560}>
        <div style={{ display: "grid", gap: 15 }}>
          <Field label="Dienst, den du abgeben möchtest">
            <Sel value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })}>
              <option value="">— wählen —</option>
              {eigeneDienste.map((d) => {
                const da = map[personTag(m, ich, d).dienstId];
                return <option key={d} value={d}>{fLang(d)} — {da ? da.name : ""}</option>; })}
            </Sel></Field>
          <Field label="Tauschpartner" hint="Ohne Auswahl wird das Gesuch für alle sichtbar eingestellt.">
            <Sel value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}>
              <option value="">— offenes Gesuch für alle —</option>
              {m.personen.filter((p) => p.id !== ich.id && imDienst(p, heute()) && p.imSchichtdienst !== false)
                .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}
            </Sel></Field>
          <Field label="Anmerkung"><Inp value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })}
            placeholder="z. B. Familienfeier, tausche gern gegen einen Spätdienst" /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.datum} onClick={() => {
              akt.stelleAntrag({ typ: "tausch", von: f.datum, bis: f.datum,
                partnerId: f.partnerId || null, text: f.text, interessenten: [] });
              setF({ datum: "", partnerId: "", text: "" }); setNeu(false); }}>Einstellen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
