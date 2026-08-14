
/* ==========================================================================
   MANDANT ANLEGEN — vollständig konfigurierbar
   Fünf Schritte. Jeder Schritt hat sinnvolle Vorgaben, sodass ein Durchklicken
   ohne Eingaben zu einem tragfähigen Betrieb führt. Wer mehr will, stellt es
   hier ein statt später an sechs Stellen nachzupflegen.
   ========================================================================== */
function MandantAnlegen({ db, akt, onClose }) {
  const [schritt, setSchritt] = useState(0);
  const [f, setF] = useState(() => ({
    name: "", branche: "sicherheit", einheitLabel: "Schichtgruppe",
    tarif: "pro", status: "test", testTage: 90,
    kontakt: "", kontaktName: "", anschrift: "", ustId: "",
    standorte: [{ name: "Hauptstandort", land: "HE", radius: 200 }],
    wochenstunden: 40, ruhezeit: 11, maxFolge: 6, ausgleichGrenze: 40,
    modellId: "vier-x-vier-entzerrt", gruppen: 4,
    dienstarten: [], qualifikationen: [
      { name: "Fachkraft", kurz: "FK", gueltigMonate: null, nachweisPflicht: false },
      { name: "Schichtleitung", kurz: "SL", gueltigMonate: null, nachweisPflicht: false },
      { name: "Erste Hilfe", kurz: "EH", gueltigMonate: 24, nachweisPflicht: true },
    ],
    zuschlaege: [
      { name: "Nachtarbeit", art: "nacht", prozent: 25, aktiv: true },
      { name: "Sonntagsarbeit", art: "sonntag", prozent: 50, aktiv: true },
      { name: "Feiertagsarbeit", art: "feiertag", prozent: 125, aktiv: true },
    ],
  }));
  const modell = MODELLE.find((x) => x.id === f.modellId);
  const tarif = db.tarife.find((t) => t.id === f.tarif) || db.tarife[0];
  const SCHRITTE = ["Betrieb", "Standorte", "Schichtmodell", "Regelwerk", "Abschluss"];
  const setz = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // Vorschau der Kosten: was zahlt der Kunde bei welcher Größe?
  const kosten = (mitarbeiter) => {
    const p = tarif.preis;
    const zahlend = mitarbeiter + 2;
    const st = staffel(zahlend);
    return tarif.grund + (2 * p.planer + mitarbeiter * p.mitarbeiter) * (1 - st.rabatt);
  };

  const fertig = () => { akt.neuerMandant(f); onClose(); };

  return (
    <Sheet open onClose={onClose} titel="Neuen Mandanten einrichten" width={860}>
      <Schrittleiste aktuell={schritt} schritte={SCHRITTE} />

      {/* ---------- 1 Betrieb ---------- */}
      {schritt === 0 && (
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="Name des Betriebs">
            <Inp value={f.name} onChange={(e) => setz("name", e.target.value)}
              placeholder="z. B. Wachdienst Süd GmbH" autoFocus /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Branche" hint="Bestimmt die Vorschläge für Modell und Bezeichnungen.">
              <Sel value={f.branche} onChange={(e) => {
                const b = BRANCHEN.find((x) => x[0] === e.target.value);
                setF((x) => ({ ...x, branche: e.target.value, einheitLabel: b ? b[2] : x.einheitLabel,
                  modellId: (modellFuerBranche(e.target.value)[0] || MODELLE[0]).id }));
              }}>{BRANCHEN.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
            <Field label="Wie heißen die Einheiten?" hint="Erscheint überall in der Anwendung.">
              <Inp value={f.einheitLabel} onChange={(e) => setz("einheitLabel", e.target.value)} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Ansprechpartner">
              <Inp value={f.kontaktName} onChange={(e) => setz("kontaktName", e.target.value)}
                placeholder="Vor- und Nachname" /></Field>
            <Field label="E-Mail des Hauptzugangs" hint="Diese Person richtet alles Weitere selbst ein.">
              <Inp value={f.kontakt} onChange={(e) => setz("kontakt", e.target.value)}
                placeholder="leitung@kunde.de" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Rechnungsanschrift"><textarea className="inp" rows={3} value={f.anschrift}
              onChange={(e) => setz("anschrift", e.target.value)} placeholder={"Straße 1\n12345 Ort"} /></Field>
            <Field label="Umsatzsteuer-Ident" hint="Optional, erscheint auf der Rechnung.">
              <Inp value={f.ustId} onChange={(e) => setz("ustId", e.target.value)} placeholder="DE123456789" /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <Btn kind="primary" disabled={!f.name.trim()} onClick={() => setSchritt(1)}>Weiter</Btn></div>
        </div>)}

      {/* ---------- 2 Standorte ---------- */}
      {schritt === 1 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Jeder Standort hat ein eigenes Bundesland — Feiertage, Soll-Stunden und Urlaubsverbrauch
            richten sich danach. Der Umkreis gilt für die Standortprüfung beim Einstempeln.
          </div>
          {f.standorte.map((s, i) => (
            <Card key={i} style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
                <Field label="Bezeichnung"><Inp value={s.name}
                  onChange={(e) => setz("standorte", f.standorte.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} /></Field>
                <Field label="Bundesland"><Sel value={s.land}
                  onChange={(e) => setz("standorte", f.standorte.map((x, k) => k === i ? { ...x, land: e.target.value } : x))}>
                  {LAENDER.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
                <Field label="Umkreis in Metern"><Inp type="number" value={s.radius}
                  onChange={(e) => setz("standorte", f.standorte.map((x, k) => k === i ? { ...x, radius: Number(e.target.value) } : x))} /></Field>
                {f.standorte.length > 1 && <Btn size="sm" kind="danger" style={{ marginBottom: 8 }}
                  onClick={() => setz("standorte", f.standorte.filter((_, k) => k !== i))}>×</Btn>}
              </div>
            </Card>))}
          <Btn onClick={() => setz("standorte", [...f.standorte, { name: `Standort ${f.standorte.length + 1}`, land: "HE", radius: 200 }])}>
            Standort hinzufügen</Btn>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={() => setSchritt(0)}>Zurück</Btn>
            <Btn kind="primary" onClick={() => setSchritt(2)}>Weiter</Btn></div>
        </div>)}

      {/* ---------- 3 Schichtmodell ---------- */}
      {schritt === 2 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Das Modell lässt sich später jederzeit über den Einrichtungsassistenten ändern.
            Die Kennzahlen sind gerechnet, nicht geschätzt.
          </div>
          <div style={{ display: "grid", gap: 11 }}>
            {[...modellFuerBranche(f.branche), ...MODELLE.filter((x) => !x.branchen.includes(f.branche))]
              .map((mo) => {
                const r = modellPruefen(mo);
                const an = f.modellId === mo.id;
                return (
                  <div key={mo.id} onClick={() => setF((x) => ({ ...x, modellId: mo.id, gruppen: mo.gruppen }))}
                    className="karte" style={{ padding: 16, cursor: "pointer",
                      outline: an ? `2px solid ${C.accent}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 650 }}>{mo.name}</span>
                          {mo.empfohlen && <Pill size="sm" tone="ok">empfohlen</Pill>}
                        </div>
                        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>{mo.kurz}</div>
                      </div>
                      <div style={{ display: "flex", gap: 18, fontSize: 12.5, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ ...NUM }}><b>{n2(r.wochenstunden)}</b> h/Woche</span>
                        <span style={{ ...NUM }}><b>{mo.gruppen}</b> Gruppen</span>
                        <span style={{ color: r.maxSerie > 7 ? C.danger : C.dim, ...NUM }}>
                          Serie <b>{r.maxSerie}</b></span>
                      </div>
                    </div>
                    {an && <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.lineSoft}` }}>
                      <ModellVorschau modell={mo} tage={Math.min(35, mo.tage.length * 2)} /></div>}
                  </div>);
              })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={() => setSchritt(1)}>Zurück</Btn>
            <Btn kind="primary" onClick={() => setSchritt(3)}>Weiter</Btn></div>
        </div>)}

      {/* ---------- 4 Regelwerk ---------- */}
      {schritt === 3 && (
        <div>
          <Lab style={{ marginBottom: 11 }}>Arbeitszeit</Lab>
          <Card style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 13 }}>
              {[["wochenstunden", "Wochenarbeitszeit", "h"], ["ruhezeit", "Ruhezeit zwischen Diensten", "h"],
                ["maxFolge", "Dienste in Folge höchstens", ""], ["ausgleichGrenze", "Stundenkonto Ausgleichsgrenze", "h"]]
                .map(([k, l, e]) => (
                <Field key={k} label={l}>
                  <Inp type="number" step="0.5" value={f[k]} onChange={(ev) => setz(k, Number(ev.target.value))} />
                </Field>))}
            </div>
          </Card>

          <Lab style={{ marginBottom: 11 }}>Qualifikationen</Lab>
          <Card style={{ padding: 18, marginBottom: 20 }}>
            {f.qualifikationen.map((q, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 90px 130px auto auto", gap: 11,
                alignItems: "center", marginBottom: 10 }}>
                <Inp value={q.name} placeholder="Bezeichnung"
                  onChange={(e) => setz("qualifikationen", f.qualifikationen.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} />
                <Inp value={q.kurz} maxLength={4} placeholder="Kürzel"
                  onChange={(e) => setz("qualifikationen", f.qualifikationen.map((x, k) => k === i ? { ...x, kurz: e.target.value.toUpperCase() } : x))} />
                <Sel value={q.gueltigMonate === null ? "" : q.gueltigMonate}
                  onChange={(e) => setz("qualifikationen", f.qualifikationen.map((x, k) => k === i
                    ? { ...x, gueltigMonate: e.target.value === "" ? null : Number(e.target.value) } : x))}>
                  <option value="">unbefristet</option>
                  {[12, 24, 36, 60].map((n) => <option key={n} value={n}>{n} Monate</option>)}</Sel>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.dim }}>
                  <input type="checkbox" checked={q.nachweisPflicht}
                    onChange={(e) => setz("qualifikationen", f.qualifikationen.map((x, k) => k === i ? { ...x, nachweisPflicht: e.target.checked } : x))} />
                  Nachweis</label>
                <Btn size="sm" kind="danger"
                  onClick={() => setz("qualifikationen", f.qualifikationen.filter((_, k) => k !== i))}>×</Btn>
              </div>))}
            <Btn size="sm" onClick={() => setz("qualifikationen", [...f.qualifikationen,
              { name: "", kurz: "", gueltigMonate: null, nachweisPflicht: false }])}>Qualifikation hinzufügen</Btn>
          </Card>

          <Lab style={{ marginBottom: 11 }}>Zuschlagsregeln</Lab>
          <Card style={{ padding: 18 }}>
            {f.zuschlaege.map((z, i) => (
              <div key={i} style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <input type="checkbox" checked={z.aktiv}
                  onChange={(e) => setz("zuschlaege", f.zuschlaege.map((x, k) => k === i ? { ...x, aktiv: e.target.checked } : x))} />
                <Inp value={z.name} style={{ flex: 1, minWidth: 150 }}
                  onChange={(e) => setz("zuschlaege", f.zuschlaege.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} />
                <Sel value={z.art} style={{ width: 150 }}
                  onChange={(e) => setz("zuschlaege", f.zuschlaege.map((x, k) => k === i ? { ...x, art: e.target.value } : x))}>
                  {[["nacht", "Nachtarbeit"], ["sonntag", "Sonntag"], ["feiertag", "Feiertag"], ["samstag", "Samstag"]]
                    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
                <Inp type="number" value={z.prozent} style={{ width: 92 }}
                  onChange={(e) => setz("zuschlaege", f.zuschlaege.map((x, k) => k === i ? { ...x, prozent: Number(e.target.value) } : x))} />
                <span style={{ fontSize: 13, color: C.dimmer }}>%</span>
                <Btn size="sm" kind="danger" onClick={() => setz("zuschlaege", f.zuschlaege.filter((_, k) => k !== i))}>×</Btn>
              </div>))}
            <Btn size="sm" onClick={() => setz("zuschlaege", [...f.zuschlaege,
              { name: "Neue Regel", art: "nacht", prozent: 0, aktiv: false }])}>Regel hinzufügen</Btn>
          </Card>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={() => setSchritt(2)}>Zurück</Btn>
            <Btn kind="primary" onClick={() => setSchritt(4)}>Weiter</Btn></div>
        </div>)}

      {/* ---------- 5 Abschluss ---------- */}
      {schritt === 4 && (
        <div>
          <Lab style={{ marginBottom: 11 }}>Vertrag</Lab>
          <Card style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 13 }}>
              <Field label="Tarif"><Sel value={f.tarif} onChange={(e) => setz("tarif", e.target.value)}>
                {db.tarife.map((t) => <option key={t.id} value={t.id}>{t.name} — {eur0(t.grund)}</option>)}</Sel></Field>
              <Field label="Status"><Sel value={f.status} onChange={(e) => setz("status", e.target.value)}>
                <option value="test">Testphase</option><option value="aktiv">Aktiv</option></Sel></Field>
              {f.status === "test" && (
                <Field label="Testphase in Tagen" hint="In dieser Zeit wird nicht abgerechnet.">
                  <Inp type="number" value={f.testTage} onChange={(e) => setz("testTage", Number(e.target.value))} /></Field>)}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
              <Lab style={{ marginBottom: 9 }}>Was der Betrieb zahlen wird</Lab>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                {[20, 50, 100, 250].map((n) => (
                  <div key={n}>
                    <div style={{ fontSize: 11.5, color: C.dimmer }}>bei {n} Beschäftigten</div>
                    <div style={{ fontSize: 17, fontWeight: 650, marginTop: 3, ...NUM }}>{eur0(kosten(n))}</div>
                  </div>))}
              </div>
              <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 11, lineHeight: 1.5 }}>
                Grundgebühr {eur0(tarif.grund)} zuzüglich Zugänge, Mengenstaffel bereits berücksichtigt.
                Betriebsrat und Organisationsleitung sind kostenfrei.
              </div>
            </div>
          </Card>

          <Card style={{ padding: 20, background: C.okLight }}>
            <div style={{ fontSize: 15.5, fontWeight: 650, marginBottom: 10 }}>Das wird angelegt</div>
            <Haken punkte={[
              `${f.name} · ${(BRANCHEN.find((b) => b[0] === f.branche) || [])[1]} · Einheiten heißen „${f.einheitLabel}"`,
              `${f.standorte.length} Standort${f.standorte.length > 1 ? "e" : ""}: ${f.standorte.map((s) => `${s.name} (${s.land})`).join(", ")}`,
              modell ? `${modell.name} mit ${f.gruppen} Gruppen · ${n2(modellPruefen(modell).wochenstunden)} h je Woche` : "eigenes Modell",
              `${f.qualifikationen.filter((q) => q.name.trim()).length} Qualifikationen, ${f.zuschlaege.filter((z) => z.aktiv).length} aktive Zuschlagsregeln`,
              `Regelwerk: ${n1(f.wochenstunden)} h Woche · ${n1(f.ruhezeit)} h Ruhezeit · höchstens ${f.maxFolge} Dienste in Folge`,
              f.kontakt ? `Hauptzugang an ${f.kontakt}` : "Hauptzugang ohne E-Mail — bitte nachtragen",
            ]} />
          </Card>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={() => setSchritt(3)}>Zurück</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
              <Btn kind="primary" onClick={fertig}>Anlegen und Zugang erzeugen</Btn>
            </div>
          </div>
        </div>)}
    </Sheet>);
}

/** Schrittanzeige — eigenständig, damit sie überall gleich aussieht. */
function Schrittleiste({ aktuell, schritte }) {
  return (
    <div className="reiterreihe" style={{ marginBottom: 26 }}>
      {schritte.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, ...NUM,
            background: i < aktuell ? C.accentDeep : i === aktuell ? C.accent : C.lineSoft,
            color: i <= aktuell ? "#fff" : C.dim }}>
            {i < aktuell ? "✓" : i + 1}</span>
          <span style={{ fontSize: 13, fontWeight: i === aktuell ? 650 : 500,
            color: i === aktuell ? C.text : C.dimmer, whiteSpace: "nowrap" }}>{s}</span>
          {i < schritte.length - 1 && <span style={{ width: 24, height: 1.5,
            background: C.lineStark, margin: "0 8px" }} />}
        </div>))}
    </div>);
}
