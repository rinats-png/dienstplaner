
/* ==========================================================================
   EINRICHTUNGSASSISTENT
   Fünf Schritte: Bereich → Modell → Dienstarten → Gruppen mit Startpunkt →
   Personal. Jeder Schritt lässt sich überspringen oder frei gestalten.
   ========================================================================== */
function Schritte({ aktuell, schritte }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 26, flexWrap: "wrap" }}>
      {schritte.map((s, i) => (
        <Fragment key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, ...NUM,
              background: i < aktuell ? C.accentDeep : i === aktuell ? C.accent : C.lineSoft,
              color: i <= aktuell ? "#fff" : C.dim }}>
              {i < aktuell ? "✓" : i + 1}</span>
            <span style={{ fontSize: 13, fontWeight: i === aktuell ? 650 : 500,
              color: i === aktuell ? C.text : C.dimmer, whiteSpace: "nowrap" }}>{s}</span>
          </div>
          {i < schritte.length - 1 && <div style={{ width: 26, height: 1.5, background: C.lineStark, margin: "0 12px" }} />}
        </Fragment>))}
    </div>);
}

/** Kleine Vorschau: wie sieht der Zyklus einer Gruppe aus? */
function ModellVorschau({ modell, tage = 28, gruppe = 0 }) {
  const len = modell.tage.length;
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {Array.from({ length: Math.min(tage, len * 2) }, (_, i) => {
        const idx = (((i - gruppe * modell.versatzTage) % len) + len) % len;
        const k = modell.tage[idx];
        const v = DIENST_VORLAGEN[k];
        return (
          <div key={i} title={v ? v.name : "frei"}
            style={{ width: 17, height: 17, borderRadius: 5, fontSize: 8.5, fontWeight: 700, ...NUM,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: v ? `${v.farbe}22` : C.bg, color: v ? v.farbe : C.dimmer }}>
            {v ? v.kurz : ""}</div>);
      })}
    </div>);
}

function Assistent2({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const [schritt, setSchritt] = useState(0);
  const [branche, setBranche] = useState(m.branche || "sonstiges");
  const [eigeneBranche, setEigeneBranche] = useState("");
  const [einheitLabel, setEinheitLabel] = useState(m.einheitLabel || "Schichtgruppe");
  const [modellId, setModellId] = useState(null);
  const [dienste, setDienste] = useState([]);
  const [tage, setTage] = useState([]);
  const [gruppen, setGruppen] = useState([]);
  const [pinsel, setPinsel] = useState(null);
  const [importText, setImportText] = useState("");
  const [importZeilen, setImportZeilen] = useState(null);
  const [ankerDatum, setAnkerDatum] = useState(montag(heute()));

  const modell = MODELLE.find((x) => x.id === modellId);
  const vorschlaege = modellFuerBranche(branche);
  const andere = MODELLE.filter((x) => !x.branchen.includes(branche));

  /* Modell übernehmen: Dienstarten und Zyklus vorbelegen */
  const modellWaehlen = (mo) => {
    setModellId(mo.id);
    const ds = mo.dienste.map((k, i) => ({ ...DIENST_VORLAGEN[k], vorlageKey: k,
      id: DIENST_VORLAGEN[k].kurz + (i > 0 && mo.dienste.slice(0, i).some((x) => DIENST_VORLAGEN[x].kurz === DIENST_VORLAGEN[k].kurz) ? i : ""),
      pause: 0, ort: "", posten: false, quelle: null, faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false,
      mindest: { mo_do: 1, fr: 1, sa: mo.vollkonti ? 1 : 0, so: mo.vollkonti ? 1 : 0 }, mindestQual: {} }));
    setDienste(ds);
    const abbild = Object.fromEntries(mo.dienste.map((k, i) => [k, ds[i].id]));
    setTage(mo.tage.map((t) => (t && t !== "-" ? abbild[t] : "-")));
    setGruppen(Array.from({ length: mo.gruppen }, (_, i) => ({
      id: uid("e"), name: `${einheitLabel} ${i + 1}`, versatzTage: i * mo.versatzTage,
      farbe: PALETTE[i % PALETTE.length], pool: false })));
    setPinsel(ds[0] ? ds[0].id : null);
  };

  const freiStarten = () => {
    setModellId("frei");
    const ds = [
      { ...DIENST_VORLAGEN.F, id: "F", vorlageKey: "F", pause: 0, ort: "", posten: false, quelle: null, faktor: 1,
        ruhezeitNeutral: false, rufbereitschaft: false, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
      { ...DIENST_VORLAGEN.S, id: "S", vorlageKey: "S", pause: 0, ort: "", posten: false, quelle: null, faktor: 1,
        ruhezeitNeutral: false, rufbereitschaft: false, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
    ];
    setDienste(ds);
    setTage(Array(14).fill("-"));
    setGruppen([{ id: uid("e"), name: `${einheitLabel} 1`, versatzTage: 0, farbe: PALETTE[0], pool: false },
                { id: uid("e"), name: `${einheitLabel} 2`, versatzTage: 7, farbe: PALETTE[1], pool: false }]);
    setPinsel("F");
  };

  /* Live-Auswertung des zusammengestellten Modells */
  const auswertung = useMemo(() => {
    if (!tage.length || !dienste.length) return null;
    const map = Object.fromEntries(dienste.map((d) => [d.id, d]));
    const len = tage.length;
    const dau = (k) => { const v = map[k]; if (!v) return 0;
      let x = toMin(v.ende) - toMin(v.start); if (x <= 0) x += 1440; return x / 60 - (v.pause || 0) / 60; };
    const nach = (k) => { const v = map[k]; if (!v) return 0;
      const s = toMin(v.start); let e = toMin(v.ende); if (e <= s) e += 1440;
      let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
      return sum / 60; };
    let std = 0, anzahl = 0;
    for (const t of tage) if (t !== "-") { std += dau(t); anzahl++; }
    const proTag = [];
    for (let i = 0; i < len; i++) {
      const z = {};
      for (const g of gruppen) { if (g.pool) continue;
        const idx = (((i - g.versatzTage) % len) + len) % len;
        const t = tage[idx]; if (t !== "-") z[t] = (z[t] || 0) + 1; }
      proTag.push(z);
    }
    const vollkonti = !modell || modell.vollkonti;
    const luecken = {};
    for (const d of dienste) {
      luecken[d.id] = proTag.filter((z, i) => (vollkonti || i % 7 < 5) && !z[d.id]).length;
    }
    let maxSerie = 0, serie = 0, maxNacht = 0, ns = 0, ruhe = 0, einzel = 0;
    for (let i = 0; i < len; i++) {
      const c = tage[i], nx = tage[(i + 1) % len], pv = tage[(i - 1 + len) % len];
      if (c !== "-") {
        serie++; maxSerie = Math.max(maxSerie, serie);
        if (nach(c) >= 2) { ns++; maxNacht = Math.max(maxNacht, ns); } else ns = 0;
        if (pv === "-" && nx === "-") einzel++;
        if (nx !== "-" && map[c] && map[nx]) {
          let e = toMin(map[c].ende); if (e <= toMin(map[c].start)) e += 1440;
          if ((1440 + toMin(map[nx].start) - e) / 60 < 11) ruhe++;
        }
      } else { serie = 0; ns = 0; }
    }
    return { len, anzahl, wochenstunden: Math.round(std / (len / 7) * 100) / 100,
      luecken: Object.entries(luecken).filter(([, n]) => n > 0),
      maxSerie, maxNacht, ruhe, einzel, vollkonti,
      mind: Object.fromEntries(dienste.map((d) => [d.id,
        Math.min(...proTag.map((z, i) => (vollkonti || i % 7 < 5) ? (z[d.id] || 0) : 99))])) };
  }, [tage, dienste, gruppen, modell]);

  const setzeTag = (i, v) => setTage(tage.map((t, k) => (k === i ? v : t)));
  const zyklusLaengeAendern = (n) => setTage(Array.from({ length: n }, (_, i) => tage[i] || "-"));

  /* Startpunkt einer Gruppe: an welchem Tag beginnt sie mit welchem Dienst? */
  const startOptionen = useMemo(() => {
    const out = [];
    tage.forEach((t, i) => { if (t !== "-") out.push({ index: i, dienstId: t }); });
    return out;
  }, [tage]);
  const setzeStart = (gid, index) => setGruppen(gruppen.map((g) => g.id === gid ? { ...g, versatzTage: index } : g));

  const zeilenAusText = (txt) => {
    const zeilen = txt.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    if (!zeilen.length) return [];
    const tr = [";", "\t", ","].map((t) => ({ t, n: (zeilen[0].match(new RegExp(`\\${t}`, "g")) || []).length }))
      .sort((a, b) => b.n - a.n)[0].t;
    return zeilen.map((z) => z.split(tr).map((x) => x.trim()));
  };

  const uebernehmen = () => {
    akt.assistentUebernehmen({
      branche: eigeneBranche ? "sonstiges" : branche,
      brancheName: eigeneBranche || (BRANCHEN.find((b) => b[0] === branche) || [])[1],
      einheitLabel, dienstarten: dienste, tage, gruppen, anker: ankerDatum,
      personen: importZeilen || [],
    });
    onClose();
  };

  const SCHRITTE = ["Bereich", "Schichtmodell", "Dienstarten", "Gruppen", "Personal"];
  const weiter = () => setSchritt(Math.min(4, schritt + 1));
  const zurueck = () => setSchritt(Math.max(0, schritt - 1));

  return (
    <Sheet open onClose={onClose} titel="Schichtplanung einrichten" width={940}>
      <Schritte aktuell={schritt} schritte={SCHRITTE} />

      {/* ---------- 1 Bereich ---------- */}
      {schritt === 0 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 20 }}>
            Der Bereich bestimmt, welche Schichtmodelle vorgeschlagen werden und wie die
            Organisationseinheiten heißen. Beides lässt sich danach frei ändern.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 20 }}>
            {BRANCHEN.map(([id, name, label]) => {
              const an = branche === id && !eigeneBranche;
              return (
                <div key={id} onClick={() => { setBranche(id); setEigeneBranche(""); setEinheitLabel(label); }}
                  className="karte" style={{ padding: 15, cursor: "pointer",
                    outline: an ? `2px solid ${C.accent}` : "none" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 12, color: C.dimmer, marginTop: 4 }}>
                    Einheiten heißen „{label}" · {modellFuerBranche(id).length} Modelle</div>
                </div>);
            })}
          </div>
          <Card style={{ padding: 18 }}>
            <Lab style={{ marginBottom: 10 }}>Bereich nicht dabei?</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
              <Field label="Eigene Bezeichnung des Bereichs">
                <Inp value={eigeneBranche} onChange={(e) => setEigeneBranche(e.target.value)}
                  placeholder="z. B. Wasserwerk" /></Field>
              <Field label="Wie heißen die Einheiten?" hint="Erscheint überall in der Anwendung.">
                <Inp value={einheitLabel} onChange={(e) => setEinheitLabel(e.target.value)} /></Field>
            </div>
            {eigeneBranche && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 12 }}>
              Es werden alle Modelle zur Auswahl gestellt. Ein eigenes lässt sich im nächsten Schritt anlegen.
            </div>}
          </Card>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
            <Btn kind="primary" onClick={weiter}>Weiter zu den Modellen</Btn></div>
        </div>)}

      {/* ---------- 2 Modell ---------- */}
      {schritt === 1 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Die Kennzahlen sind gerechnet, nicht geschätzt: Wochenarbeitszeit, längste Dienstserie,
            Nachtserien und Deckung. Jedes Modell lässt sich anschließend anpassen.
          </div>
          {(eigeneBranche ? MODELLE : [...vorschlaege, ...andere]).map((mo, i) => {
            const r = modellPruefen(mo);
            const an = modellId === mo.id;
            const passend = eigeneBranche || mo.branchen.includes(branche);
            return (
              <div key={mo.id}>
                {!eigeneBranche && i === vorschlaege.length && vorschlaege.length > 0 && (
                  <Lab style={{ margin: "20px 0 12px" }}>Weitere Modelle</Lab>)}
                <div onClick={() => modellWaehlen(mo)} className="karte"
                  style={{ padding: 18, marginBottom: 12, cursor: "pointer",
                    outline: an ? `2px solid ${C.accent}` : "none", opacity: passend ? 1 : .82 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 230 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15.5, fontWeight: 650 }}>{mo.name}</span>
                        {mo.empfohlen && <Pill size="sm" tone="ok">empfohlen</Pill>}
                        {!mo.vollkonti && <Pill size="sm">ohne Wochenende</Pill>}
                      </div>
                      <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>{mo.kurz}</div>
                      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 7, lineHeight: 1.5 }}>{mo.beschreibung}</div>
                      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7 }}><b>Passt wenn:</b> {mo.passt}</div>
                      {mo.hinweis && <div style={{ fontSize: 12.5, color: C.warn, marginTop: 7, lineHeight: 1.45 }}>
                        {mo.hinweis}</div>}
                    </div>
                    <div style={{ display: "grid", gap: 6, minWidth: 168 }}>
                      {[["Wochenarbeitszeit", `${n2(r.wochenstunden)} h`, Math.abs(r.wochenstunden - (m.einstellungen.sollWochenstunden || 40)) < 2 ? "ok" : "warn"],
                        ["Gruppen benötigt", `${mo.gruppen}`, "neutral"],
                        ["Dienste am Stück", `${r.maxSerie}`, r.maxSerie <= 5 ? "ok" : r.maxSerie <= 7 ? "warn" : "danger"],
                        ["Nächte am Stück", `${r.maxNacht}`, r.maxNacht <= 4 ? "ok" : "danger"],
                        ["Deckung", r.luecken === 0 ? "lückenlos" : `${r.luecken} Lücken`, r.luecken === 0 ? "ok" : "danger"],
                        ["Besetzung je Dienst", Object.values(r.mind).join(" / "), "neutral"]].map(([l, v, tone]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
                          <span style={{ color: C.dimmer }}>{l}</span>
                          <span style={{ fontWeight: 600, ...NUM,
                            color: tone === "ok" ? C.ok : tone === "warn" ? C.warn : tone === "danger" ? C.danger : C.text }}>{v}</span>
                        </div>))}
                    </div>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
                    <Lab style={{ marginBottom: 7 }}>So sieht es für eine Gruppe aus · {mo.tage.length} Tage</Lab>
                    <ModellVorschau modell={mo} tage={Math.min(42, mo.tage.length * 2)} />
                  </div>
                </div>
              </div>);
          })}
          <div onClick={freiStarten} className="karte"
            style={{ padding: 18, cursor: "pointer", outline: modellId === "frei" ? `2px solid ${C.accent}` : "none" }}>
            <div style={{ fontSize: 15.5, fontWeight: 650 }}>Eigenes Modell aufbauen</div>
            <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>
              Leerer Zyklus, den du im nächsten Schritt Tag für Tag selbst zusammenstellst.
              Die Kennzahlen werden dabei laufend mitgerechnet.
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <Btn kind="primary" disabled={!modellId} onClick={weiter}>Weiter zu den Dienstarten</Btn></div>
        </div>)}

      {/* ---------- 3 Dienstarten und Zyklus ---------- */}
      {schritt === 2 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Zeiten, Namen und Mindestbesetzung anpassen. Der Zyklus darunter lässt sich Tag für Tag
            ändern — die Kennzahlen rechnen sofort mit.
          </div>
          <Card style={{ marginBottom: 18, overflowX: "auto" }}>
            <CardHead right={<Btn size="sm" onClick={() => setDienste([...dienste, {
              ...DIENST_VORLAGEN.Z, id: `D${dienste.length + 1}`, pause: 0, ort: "", posten: false, quelle: null,
              faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false,
              mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} }])}>Dienstart hinzufügen</Btn>}>
              Dienstarten</CardHead>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
              <thead><tr>{["", "Bezeichnung", "Kürzel", "Beginn", "Ende", "Dauer", "Nacht", "Mind. Mo–Do", "Sa/So", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}` }}><Lab>{h}</Lab></th>))}
              </tr></thead>
              <tbody>{dienste.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}><Zelle da={d} size={24} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp value={d.name} style={{ width: 140 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp value={d.kurz} maxLength={3} style={{ width: 66 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, kurz: e.target.value.toUpperCase() } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="time" value={d.start} style={{ width: 108 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, start: e.target.value } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="time" value={d.ende} style={{ width: 108 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, ende: e.target.value } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.dim, ...NUM }}>
                    {n1(dauer(d))} h</td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, ...NUM,
                    color: nachtAnteil(d) > 0 ? C.violet : C.dimmer }}>{n1(nachtAnteil(d))} h</td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="number" min={0} value={d.mindest.mo_do} style={{ width: 62 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i
                        ? { ...x, mindest: { ...x.mindest, mo_do: Number(e.target.value), fr: Number(e.target.value) } } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="number" min={0} value={d.mindest.sa} style={{ width: 62 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i
                        ? { ...x, mindest: { ...x.mindest, sa: Number(e.target.value), so: Number(e.target.value) } } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    {dienste.length > 1 && <Btn size="sm" kind="danger"
                      onClick={() => { setDienste(dienste.filter((_, k) => k !== i));
                        setTage(tage.map((t) => t === d.id ? "-" : t)); }}>×</Btn>}</td>
                </tr>))}</tbody>
            </table>
          </Card>

          <Card>
            <CardHead right={
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Lab>Zykluslänge</Lab>
                {[7, 8, 11, 14, 16, 21, 28, 35].map((n) => (
                  <Btn key={n} size="sm" kind={tage.length === n ? "primary" : "plain"}
                    onClick={() => zyklusLaengeAendern(n)}>{n}</Btn>))}
              </div>}>Zyklus</CardHead>
            <div style={{ padding: "16px 22px 6px", fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              Dienstart antippen und dann Tage anklicken — oder die Dienstart direkt auf einen Tag ziehen.
            </div>
            <div className="reiterreihe" style={{ padding: "0 22px", marginBottom: 0 }}>
              {dienste.map((d) => (
                <Ziehbar key={d.id} onClick={() => setPinsel(d.id)}
                  nutzlast={{ art: "dienstart", dienstId: d.id, beschriftung: d.name, farbe: d.farbe, zeit: `${d.start}–${d.ende}` }}>
                  <span className="btn btn-sm"
                    style={{ background: pinsel === d.id ? `${d.farbe}22` : C.bg,
                      color: pinsel === d.id ? d.farbe : C.dim, fontWeight: 600 }}>{d.kurz}</span>
                </Ziehbar>))}
              <Ziehbar onClick={() => setPinsel("-")}
                nutzlast={{ art: "dienstart", dienstId: "-", beschriftung: "frei", farbe: C.dim }}>
                <span className="btn btn-sm"
                  style={{ background: pinsel === "-" ? C.line : C.bg, color: C.dim, fontWeight: 600 }}>frei</span>
              </Ziehbar>
            </div>
            <div style={{ padding: 22, display: "flex", gap: 5, flexWrap: "wrap" }}>
              {tage.map((t, i) => {
                const d = dienste.find((x) => x.id === t);
                return (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, color: C.dimmer, marginBottom: 3 }}>{DOW[i % 7]}</div>
                    <Ablage id={`zt:${i}`} nimmt={(l) => l.art === "dienstart"}
                      ablegen={(l) => setzeTag(i, l.dienstId)} style={{ borderRadius: 12 }}>
                      <div onClick={() => setzeTag(i, pinsel)} 
                        style={{ width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700, ...NUM,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: d ? `${d.farbe}22` : C.bg, color: d ? d.farbe : C.dimmer }}>
                        {d ? d.kurz : "·"}</div>
                    </Ablage>
                    <div style={{ fontSize: 8.5, color: C.dimmer, marginTop: 2, ...NUM }}>{i + 1}</div>
                  </div>);
              })}
            </div>
          </Card>

          {auswertung && (
            <Card style={{ marginTop: 18, display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", overflow: "hidden" }}>
              <Kpi label="Wochenarbeitszeit" value={n2(auswertung.wochenstunden)} unit="h"
                tone={Math.abs(auswertung.wochenstunden - (m.einstellungen.sollWochenstunden || 40)) < 1.5 ? "ok" : "warn"}
                sub={`Soll ${n2(m.einstellungen.sollWochenstunden || 40)} h`} />
              <Kpi label="Dienste am Stück" value={auswertung.maxSerie}
                tone={auswertung.maxSerie <= 5 ? "ok" : auswertung.maxSerie <= 7 ? "warn" : "danger"} />
              <Kpi label="Nächte am Stück" value={auswertung.maxNacht}
                tone={auswertung.maxNacht <= 4 ? "ok" : "danger"} />
              <Kpi label="Ruhezeitkonflikte" value={auswertung.ruhe}
                tone={auswertung.ruhe ? "danger" : "ok"} sub="im Muster selbst" />
              <Kpi label="Deckungslücken" value={auswertung.luecken.reduce((a, [, n]) => a + n, 0)}
                tone={auswertung.luecken.length ? "danger" : "ok"}
                sub={auswertung.vollkonti ? "rund um die Uhr" : "nur werktags gefordert"} />
            </Card>)}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <Btn kind="primary" disabled={!auswertung || !auswertung.anzahl} onClick={weiter}>Weiter zu den Gruppen</Btn></div>
        </div>)}

      {/* ---------- 4 Gruppen und Startpunkt ---------- */}
      {schritt === 3 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Für jede Gruppe wird festgelegt, an welcher Stelle des Zyklus sie beginnt. Alles Weitere
            schreibt sich von selbst fort — für jeden künftigen Tag, ohne Ausrollen.
          </div>
          <Field label="Erster Tag des Zyklus" hint="Ab diesem Datum gilt Zyklustag 1. Üblicherweise ein Montag.">
            <Inp type="date" value={ankerDatum} onChange={(e) => setAnkerDatum(e.target.value)} style={{ width: 200 }} /></Field>

          <div style={{ marginTop: 20 }}>
            {gruppen.map((g, gi) => {
              const start = startOptionen.find((o) => o.index === g.versatzTage);
              const d = start && dienste.find((x) => x.id === start.dienstId);
              return (
                <Card key={g.id} style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 13, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: g.farbe, marginBottom: 12 }} />
                    <Field label="Bezeichnung">
                      <Inp value={g.name} style={{ width: 190 }}
                        onChange={(e) => setGruppen(gruppen.map((x, k) => k === gi ? { ...x, name: e.target.value } : x))} /></Field>
                    <Field label="Beginnt am Zyklustag" hint={d ? `startet mit ${d.name}` : "startet mit einem freien Tag"}>
                      <Sel value={g.versatzTage} style={{ width: 240 }}
                        onChange={(e) => setzeStart(g.id, Number(e.target.value))}>
                        {tage.map((t, i) => {
                          const dd = dienste.find((x) => x.id === t);
                          return <option key={i} value={i}>Tag {i + 1} ({DOW[i % 7]}) — {dd ? dd.name : "frei"}</option>; })}
                      </Sel></Field>
                    <div style={{ flex: 1, minWidth: 180, marginBottom: 4 }}>
                      <Lab style={{ marginBottom: 5 }}>Erste 21 Tage</Lab>
                      <div style={{ display: "flex", gap: 2 }}>
                        {Array.from({ length: 21 }, (_, i) => {
                          const idx = (((i - g.versatzTage) % tage.length) + tage.length) % tage.length;
                          const dd = dienste.find((x) => x.id === tage[idx]);
                          return <Zelle key={i} da={dd} size={15} blass />; })}
                      </div>
                    </div>
                    {gruppen.length > 1 && <Btn size="sm" kind="danger" style={{ marginBottom: 8 }}
                      onClick={() => setGruppen(gruppen.filter((_, k) => k !== gi))}>×</Btn>}
                  </div>
                </Card>);
            })}
          </div>
          <Btn onClick={() => setGruppen([...gruppen, { id: uid("e"), name: `${einheitLabel} ${gruppen.length + 1}`,
            versatzTage: 0, farbe: PALETTE[gruppen.length % PALETTE.length], pool: false }])}>Gruppe hinzufügen</Btn>

          {auswertung && auswertung.luecken.length > 0 && (
            <Card style={{ marginTop: 18, padding: 16, background: C.dangerLight }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.danger, marginBottom: 6 }}>Deckungslücken</div>
              {auswertung.luecken.map(([id, n]) => {
                const d = dienste.find((x) => x.id === id);
                return <div key={id} style={{ fontSize: 13, color: C.danger, marginBottom: 4 }}>
                  {d ? d.name : id} ist an {n} von {auswertung.len} Zyklustagen von keiner Gruppe besetzt.</div>; })}
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>
                Meist hilft ein anderer Startpunkt oder eine weitere Gruppe. Bei gleichmäßigem Versatz
                muss jede Wochentagsspalte des Zyklus jede Dienstart genau einmal enthalten.
              </div>
            </Card>)}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <Btn kind="primary" onClick={weiter}>Weiter zum Personal</Btn></div>
        </div>)}

      {/* ---------- 5 Personal ---------- */}
      {schritt === 4 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Personal kann jetzt oder später erfasst werden. Für den Anfang genügt eine Liste aus
            Tabellenkalkulation oder Personalsystem — Format wird automatisch erkannt.
          </div>
          <Card style={{ marginBottom: 18 }}>
            <CardHead>Liste einfügen</CardHead>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 10, lineHeight: 1.5 }}>
                Eine Person je Zeile. Spalten: Nachname, Vorname, Gruppe, Wochenstunden.
                Trennzeichen Semikolon, Tabulator oder Komma. Kopfzeile wird erkannt.
              </div>
              <textarea className="inp" rows={7} value={importText}
                onChange={(e) => { setImportText(e.target.value); setImportZeilen(null); }}
                placeholder={"Nachname;Vorname;Gruppe;Wochenstunden\nMüller;Anna;Schichtgruppe 1;40\nSchmidt;Tom;Schichtgruppe 2;20"} />
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <Btn onClick={() => {
                  const roh = zeilenAusText(importText);
                  if (!roh.length) return;
                  const kopf = /nachname|name|vorname/i.test(roh[0].join(" "));
                  const daten = kopf ? roh.slice(1) : roh;
                  setImportZeilen(daten.map((z) => ({
                    nachname: z[0] || "", vorname: z[1] || "",
                    gruppe: z[2] || (gruppen[0] || {}).name || "",
                    wochenstunden: Number(String(z[3] || "").replace(",", ".")) || m.einstellungen.sollWochenstunden || 40,
                  })).filter((x) => x.nachname));
                }}>Liste prüfen</Btn>
                {importZeilen && <Btn kind="quiet" onClick={() => { setImportZeilen(null); setImportText(""); }}>Verwerfen</Btn>}
              </div>
            </div>
          </Card>

          {importZeilen && (
            <Card style={{ marginBottom: 18 }}>
              <CardHead right={<Pill tone="ok">{importZeilen.length} Personen erkannt</Pill>}>Vorschau</CardHead>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {importZeilen.slice(0, 30).map((z, i) => {
                  const treffer = gruppen.find((g) => g.name.toLowerCase() === String(z.gruppe).toLowerCase());
                  return (
                    <div key={i} style={{ display: "flex", gap: 14, padding: "8px 22px", fontSize: 13,
                      borderBottom: `1px solid ${C.lineSoft}` }}>
                      <span style={{ minWidth: 180 }}>{z.nachname}, {z.vorname}</span>
                      <span style={{ color: treffer ? C.ok : C.warn, minWidth: 160 }}>
                        {treffer ? treffer.name : `${z.gruppe} → erste Gruppe`}</span>
                      <span style={{ color: C.dimmer, ...NUM }}>{n1(z.wochenstunden)} h</span>
                    </div>); })}
              </div>
              {importZeilen.length > 30 && <div style={{ padding: "10px 22px", fontSize: 12.5, color: C.dimmer }}>
                und {importZeilen.length - 30} weitere</div>}
            </Card>)}

          <Card style={{ padding: 18, background: C.okLight }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>Zusammenfassung</div>
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7 }}>
              Bereich: <b>{eigeneBranche || (BRANCHEN.find((b) => b[0] === branche) || [])[1]}</b> ·
              Einheiten heißen <b>{einheitLabel}</b><br />
              Modell: <b>{modell ? modell.name : "eigenes Modell"}</b> mit {tage.length} Zyklustagen und {dienste.length} Dienstarten<br />
              {gruppen.length} Gruppen · {auswertung ? `${n2(auswertung.wochenstunden)} h je Woche` : ""} ·
              Zyklusbeginn {fDatum(ankerDatum)}<br />
              {importZeilen ? `${importZeilen.length} Personen werden angelegt` : "Personal wird später erfasst"}
            </div>
            {auswertung && (auswertung.luecken.length > 0 || auswertung.ruhe > 0) && (
              <div style={{ fontSize: 13, color: C.warn, marginTop: 12, lineHeight: 1.5 }}>
                Achtung: Das Modell hat noch
                {auswertung.luecken.length ? ` ${auswertung.luecken.reduce((a, [, n]) => a + n, 0)} Deckungslücken` : ""}
                {auswertung.luecken.length && auswertung.ruhe ? " und" : ""}
                {auswertung.ruhe ? ` ${auswertung.ruhe} Ruhezeitkonflikte` : ""}.
                Es lässt sich trotzdem übernehmen und später korrigieren.
              </div>)}
          </Card>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
              <Btn kind="primary" onClick={uebernehmen}>Einrichtung abschließen</Btn>
            </div>
          </div>
        </div>)}
    </Sheet>);
}
