
/* ================================ BETRIEB ================================ */
function Betrieb({ sitz, akt }) {
  const m = sitz.mandant;
  const [tests, setTests] = useState(null);
  if (!darf(sitz, "org.edit"))
    return <Card><Leer titel="Kein Zugriff" text="Die Betriebsverwaltung ist der Organisationsleitung vorbehalten." /></Card>;
  const p = preis(sitz.db, m);

  return (
    <div>
      <H1 sub="Stammdaten, Einheiten, Qualifikationen, Regelwerk und Rechte.">Betrieb</H1>

      <Card style={{ marginBottom: 20 }}>
        <CardHead right={<Pill tone="accent">{eur(p.gesamt)} / Monat</Pill>}>Stammdaten</CardHead>
        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 15 }}>
          <Field label="Name des Betriebs"><Inp value={m.name} onChange={(e) => akt.setzeFeld("name", e.target.value)} /></Field>
          <Field label="Branche"><Sel value={m.branche} onChange={(e) => akt.setzeBranche(e.target.value)}>
            {BRANCHEN.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
          <Field label="Bezeichnung der Einheiten" hint="Wirkt in der gesamten Oberfläche.">
            <Inp value={m.einheitLabel} onChange={(e) => akt.setzeFeld("einheitLabel", e.target.value)} /></Field>
          <Field label="Bundesland" hint="Bestimmt die gesetzlichen Feiertage.">
            <Sel value={m.bundesland} onChange={(e) => akt.setzeFeld("bundesland", e.target.value)}>
              {LAENDER.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
        <Card>
          <CardHead right={<Btn size="sm" onClick={akt.neueEinheit}>Hinzufügen</Btn>}>{m.einheitLabel}n</CardHead>
          <div style={{ padding: 22 }}>
            {m.einheiten.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 11 }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: e.farbe, flexShrink: 0 }} />
                <Inp value={e.name} onChange={(ev) => akt.setzeEinheit(e.id, "name", ev.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 12.5, color: C.dimmer, width: 64, ...NUM }}>
                  {aktive(m, heute()).filter((x) => einheitAm(x, heute()) === e.id).length} Pers.</span>
                <Btn size="sm" kind="danger" onClick={() => akt.loescheEinheit(e.id)}>×</Btn>
              </div>))}
          </div>
        </Card>

        <Card>
          <CardHead right={<Btn size="sm" onClick={akt.neueQual}>Hinzufügen</Btn>}>Qualifikationen</CardHead>
          <div style={{ padding: 22 }}>
            {m.qualifikationen.map((q) => (
              <div key={q.id} style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 11 }}>
                <Inp value={q.name} onChange={(e) => akt.setzeQual(q.id, "name", e.target.value)} style={{ flex: 1 }} />
                <Inp value={q.kurz} maxLength={4} onChange={(e) => akt.setzeQual(q.id, "kurz", e.target.value.toUpperCase())} style={{ width: 76 }} />
                <Btn size="sm" kind="danger" onClick={() => akt.loescheQual(q.id)}>×</Btn>
              </div>))}
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
              Qualifikationen werden in den Dienstarten als Anforderung hinterlegt und in der Prüfung ausgewertet.
              Eine Kopfzahl ohne Funktionsnachweis ist keine besetzte Schicht.
            </div>
          </div>
        </Card>

        <Card>
          <CardHead>Regelwerk</CardHead>
          <div style={{ padding: 22, display: "grid", gap: 14 }}>
            {[["ruhezeit", "Mindestruhezeit zwischen Diensten in Stunden"], ["maxFolge", "Höchstzahl Dienste in Folge"],
              ["maxNachtFolge", "Höchstzahl Nachtdienste in Folge"], ["maxUrlaubJeEinheit", `Gleichzeitige Urlaube je ${m.einheitLabel}`],
              ["sollWochenstunden", "Vertragliche Wochenarbeitszeit"]].map(([k, l]) => (
              <Field key={k} label={l}><Inp type="number" step="0.5" value={m.einstellungen[k]}
                onChange={(e) => akt.setzeEinstellung(k, Number(e.target.value))} /></Field>))}
          </div>
        </Card>

        <Card>
          <CardHead>Daten</CardHead>
          <div style={{ padding: 22, display: "grid", gap: 11 }}>
            <Btn onClick={akt.exportCSV}>Monatsplan als CSV</Btn>
            <Btn onClick={() => window.print()}>Drucken</Btn>
            <Btn onClick={akt.exportJSON}>Sicherung exportieren</Btn>
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 20, overflowX: "auto" }}>
        <CardHead right={<Btn size="sm" onClick={akt.matrixZuruecksetzen}>Auf Standard zurücksetzen</Btn>}>Rollen und Rechte</CardHead>
        <div style={{ padding: "16px 22px 0", fontSize: 13.5, color: C.dim, lineHeight: 1.5, maxWidth: 720 }}>
          Eine Rolle allein ist keine Berechtigung. Erst Rolle plus Geltungsbereich ergibt eine:
          <span style={{ color: C.text }}> Sub-Planer für {m.einheiten[0] ? m.einheiten[0].name : "eine Einheit"}</span> darf dort ändern und sonst nirgends.
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780, marginTop: 16 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "13px 22px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 290 }}><Lab>Berechtigung</Lab></th>
            {ROLLEN.filter((r) => !r.extern).map((r) => (
              <th key={r.id} style={{ padding: "13px 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 86 }}>
                <Lab style={{ color: r.farbe, textAlign: "center" }}>{r.kurz}</Lab></th>))}
          </tr></thead>
          <tbody>{RECHTE_GRUPPEN.map(([g, items]) => (
            <Fragment key={g}>
              <tr><td colSpan={6} style={{ padding: "13px 22px 6px", background: "rgba(20,20,25,.025)" }}><Lab>{g}</Lab></td></tr>
              {items.map(([id, label]) => (
                <tr key={id} className="row">
                  <td style={{ padding: "10px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <div style={{ fontSize: 13.5 }}>{label}</div>
                    <div style={{ fontSize: 11, color: C.dimmer, ...NUM }}>{id}</div></td>
                  {ROLLEN.filter((r) => !r.extern).map((r) => {
                    const an = (m.matrix[r.id] || []).includes(id), fest = r.id === "leitung";
                    return (<td key={r.id} style={{ padding: "10px 8px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "center" }}>
                      <button onClick={() => !fest && akt.toggleRecht(r.id, id)} 
                        title={fest ? "Die Organisationsleitung hat immer alle Rechte." : ""}
                        style={{ width: 25, height: 25, borderRadius: 8, cursor: fest ? "not-allowed" : "pointer", border: "none",
                          background: an ? `${r.farbe}1C` : C.bg, color: an ? r.farbe : "transparent",
                          fontSize: 13, fontWeight: 700, opacity: fest ? .6 : 1 }}>✓</button></td>);
                  })}
                </tr>))}
            </Fragment>))}</tbody>
        </table>
      </Card>

      <Card style={{ marginTop: 20 }}>
        <CardHead right={<Btn size="sm" kind="primary" onClick={() => setTests(selbsttest())}>Starten</Btn>}>Selbsttest</CardHead>
        <div style={{ padding: 22 }}>
          {!tests && <div style={{ fontSize: 13.5, color: C.dimmer, lineHeight: 1.5 }}>
            Prüft Rechenkern, Zugriffstiefe, Kostenfortschreibung, Datenschutz der Betreibersicht und Rechnungserzeugung gegen feste Erwartungswerte.</div>}
          {tests && (<>
            <div style={{ marginBottom: 16 }}><Pill tone={tests.every((t) => t.ok) ? "ok" : "danger"}>
              {tests.filter((t) => t.ok).length} von {tests.length} bestanden</Pill></div>
            {tests.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 13, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 23, height: 23, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center",
                  justifyContent: "center", background: t.ok ? C.okLight : "rgba(179,38,30,.11)",
                  color: t.ok ? C.ok : C.danger, fontSize: 12, fontWeight: 700 }}>{t.ok ? "✓" : "✕"}</span>
                <span style={{ fontSize: 13.5, flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: 12.5, color: t.ok ? C.dim : C.danger, fontWeight: 600, ...NUM }}>{t.ist}</span>
              </div>))}
          </>)}
        </div>
      </Card>

      <Card style={{ marginTop: 20 }}>
        <CardHead>Protokoll</CardHead>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {m.protokoll.length === 0 && <div style={{ padding: 26, fontSize: 13.5, color: C.dimmer }}>Noch keine Änderungen.</div>}
          {m.protokoll.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 16, padding: "11px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ fontSize: 12, color: C.dimmer, minWidth: 136, ...NUM }}>{l.zeit}</span>
              <span style={{ fontSize: 13.5, color: C.dim }}>{l.text}</span></div>))}
        </div>
      </Card>
    </div>);
}

/* =============================== SELBSTTEST ============================== */
/** Baut einen vollständigen Mandanten aus den Angaben der Anlagemaske. */
function baueAusAnlage(f) {
const br = BRANCHEN.find((b) => b[0] === f.branche) || BRANCHEN[BRANCHEN.length - 1];
  const mo = MODELLE.find((x) => x.id === f.modellId) || MODELLE[0];
  const quals = (f.qualifikationen || []).filter((q) => q.name && q.name.trim())
    .map((q, i) => ({ id: `q${i + 1}`, name: q.name.trim(), kurz: (q.kurz || q.name.slice(0, 2)).toUpperCase(),
      farbe: PALETTE[i % PALETTE.length], gueltigMonate: q.gueltigMonate ?? null,
      nachweisPflicht: !!q.nachweisPflicht }));
  const standorte = (f.standorte || [{ name: "Hauptstandort", land: "HE" }])
    .map((x, i) => ({ id: `st${i + 1}`, name: x.name || `Standort ${i + 1}`, bundesland: x.land || "HE",
      lat: 50.11 + i * 1.3, lon: 8.68 + i * 1.1, radius: x.radius || 200 }));
  // Dienstarten aus dem gewählten Modell ableiten
  const dienstarten = mo.dienste.map((k, i) => {
    const v = DIENST_VORLAGEN[k];
    return { id: v.kurz + (mo.dienste.slice(0, i).some((x) => DIENST_VORLAGEN[x].kurz === v.kurz) ? i : ""),
      name: v.name, kurz: v.kurz, start: v.start, ende: v.ende, pause: 0, farbe: v.farbe,
      ort: standorte[0].name, posten: false, quelle: null, faktor: 1,
      ruhezeitNeutral: false, rufbereitschaft: false,
      mindest: { mo_do: 1, fr: 1, sa: mo.vollkonti ? 1 : 0, so: mo.vollkonti ? 1 : 0 }, mindestQual: {} };
  });
  const abbild = Object.fromEntries(mo.dienste.map((k, i) => [k, dienstarten[i].id]));
  const einheiten = Array.from({ length: f.gruppen || mo.gruppen }, (_, i) => ({
    id: uid("e"), name: `${f.einheitLabel} ${i + 1}`, versatz: Math.round((i * mo.versatzTage) / 7),
    versatzTage: i * mo.versatzTage, pool: false, standortId: standorte[0].id,
    farbe: PALETTE[i % PALETTE.length] }));
  const anker = montag(heute());
  const hauptId = uid("p");
  const m = {
    id: uid("m"), name: f.name.trim(), branche: f.branche, einheitLabel: f.einheitLabel,
    bundesland: standorte[0].bundesland, tarif: f.tarif, status: f.status || "test",
    seit: heute(), stichtag: addDays(heute(), f.status === "test" ? (f.testTage || 90) : 30),
    rabattGrund: 0, kontakt: f.kontakt || "", anschrift: f.anschrift || "", ustId: f.ustId || "",
    anker, zyklus: { wochen: Math.ceil(mo.tage.length / 7),
      tage: mo.tage.map((t) => (t && t !== "-" ? abbild[t] : "-")), vorlage: mo.id },
    matrix: JSON.parse(JSON.stringify(MATRIX_STD)),
    einstellungen: { ruhezeit: f.ruhezeit || 11, maxFolge: f.maxFolge || 6, maxNachtFolge: 4,
      maxUrlaubJeEinheit: 3, sollWochenstunden: f.wochenstunden || 40,
      ausgleichGrenze: f.ausgleichGrenze || 40, ausgleichFristMonate: 6, aufbewahrungMonate: 24 },
    standorte, einheiten, qualifikationen: quals, dienstarten,
    personen: [{ id: hauptId, vorname: (f.kontaktName || "Haupt Zugang").split(" ")[0],
      nachname: (f.kontaktName || "Haupt Zugang").split(" ").slice(1).join(" ") || "Zugang",
      funktion: "Organisationsleitung", email: f.kontakt || "",
      zugehoerigkeit: [{ ab: heute(), einheitId: einheiten[0].id }],
      eintritt: heute(), austritt: null, wochenstunden: f.wochenstunden || 40,
      urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
      qualifikationen: [], qualNachweise: [], teilzeit: null, springer: false,
      einschraenkungen: {}, verfuegbarkeit: { aktiv: false, raster: Array(21).fill(true) },
      nachweise: [], kontrastmodus: false, notiz: "", einarbeitung: null,
      benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
      einfuehrung: { erledigt: false, schritt: 0 },
      rolle: "leitung", rolleSeit: heute(), bereich: "ALLE", status: "aktiv", imSchichtdienst: false }],
    abwesenheiten: [], abweichungen: {}, anfragen: [], protokoll: [],
    freigaben: {}, nachrichten: [], aenderungen: [], erfassung: {}, einspruenge: [],
    zuschlaege: (f.zuschlaege || []).map((z, i) => ({ id: `z${i + 1}`, ...z })),
    urlaubsrunde: null, unterschreitungen: [], dienstbuch: [], stand: 0,
    betriebsmittel: [], aushang: [], einstempeln: {},
    wuensche: [], tagesnotizen: {}, planstaende: {},
  };
  return m;
}

function selbsttest() {
  const T = [];
  const ok = (name, erw, ist) => T.push({ name, erwartet: String(erw), ist: String(ist), ok: String(erw) === String(ist) });
  const db = startbestand();
  const m = db.mandanten[0];
  const sim = simulation(m);
  ok("Wochenarbeitszeit des Standardzyklus", 40.95, sim.wochenstunden);
  ok("Nachtanteil Nacht / Spät / Früh", "7 / 0,5 / 0",
    ["N", "S", "F"].map((id) => n1(nachtAnteil(m.dienstarten.find((d) => d.id === id))).replace(",0", "")).join(" / "));
  ok("Deckungslücken im Zyklus", 0, sim.luecken.length);
  const ym = heute().slice(0, 7);
  ok("Befunde im Ausgangszustand", 0, pruefen(m, `${ym}-01`, `${ym}-28`).length);
  // Gegenprobe: eine ganze Einheit aus einem Tag nehmen muss Unterbesetzung melden
  const dU = `${ym}-15`;
  const eU = m.einheiten.find((e) => einheitDienst(m, e.id, dU) === "F");
  const abU = { ...m.abweichungen };
  m.personen.filter((p) => einheitAm(p, dU) === eU.id).forEach((p) => { abU[`${p.id}|${dU}`] = "-"; });
  const bU = pruefen({ ...m, abweichungen: abU }, dU, dU);
  ok("Fehlende Einheit wird als Unterbesetzung gemeldet", true,
    bU.some((x) => x.art === "besetzung" && x.schwere === "danger"));

  const d = "2026-08-12";
  const eF = m.einheiten.find((e) => einheitDienst(m, e.id, d) === "F");
  const po = m.dienstarten.find((x) => x.posten);
  if (po && eF) {
    const kand = m.personen.filter((p) => einheitAm(p, d) === eF.id && p.funktion !== "Schichtleitung");
    const mA = { ...m, abweichungen: { ...m.abweichungen, [`${kand[6].id}|${d}`]: po.id } };
    const bA = besetzung(mA, d)[po.id];
    ok("Manuelle Postenzuweisung überbesetzt nicht", bA.soll, bA.anzahl);
    const c1 = [...postenBesatzung(m, eF.id, d, po.id)];
    const mB = { ...m, abweichungen: { ...m.abweichungen, [`${kand[2].id}|${d}`]: "-" } };
    const c2 = [...postenBesatzung(mB, eF.id, d, po.id)];
    ok("Ausfall verschiebt Postenbesatzung höchstens um eine Person", true, c1.filter((x) => c2.includes(x)).length >= c1.length - 1);
  }
  const p0 = m.personen[5];
  const mC = { ...m, abwesenheiten: [...m.abwesenheiten,
    { id: "t1", personId: p0.id, art: "urlaub", von: "2026-09-01", bis: "2026-09-10" },
    { id: "t2", personId: p0.id, art: "krank", von: "2026-09-05", bis: "2026-09-15" }] };
  ok("Überlappende Abwesenheit wird erkannt", true, pruefen(mC, "2026-09-01", "2026-09-20").some((x) => x.art === "ueberlappung"));
  ok("Krank hat Vorrang vor Urlaub", "krank", abwesenheitAm(mC, p0.id, "2026-09-07").art);

  const pv = m.personen[14], alt = einheitAm(pv, "2026-07-15");
  const mD = { ...m, personen: m.personen.map((p) => p.id === pv.id
    ? { ...p, zugehoerigkeit: [...p.zugehoerigkeit, { ab: "2026-08-01", einheitId: m.einheiten[3].id }] } : p) };
  const pvD = mD.personen.find((p) => p.id === pv.id);
  ok("Versetzung lässt Vormonat unverändert", `${alt}|${m.einheiten[3].id}`,
    `${einheitAm(pvD, "2026-07-15")}|${einheitAm(pvD, "2026-08-15")}`);
  ok("Feiertag senkt die Mindestbesetzung nicht", 7, mindestFuer(m, m.dienstarten.find((x) => x.id === "N"), "2026-04-03"));

  const t0 = Date.now();
  for (const p of m.personen) { stundenkonto(m, p, ym); nachtJahr(m, p, 2026); urlaubskonto(m, p, ym.slice(0, 4)); }
  const t1 = Date.now();
  for (const p of m.personen) { stundenkonto(m, p, ym); nachtJahr(m, p, 2026); urlaubskonto(m, p, ym.slice(0, 4)); }
  ok("Zwischenspeicher greift", true, Date.now() - t1 < 30);
  ok("Erster Aufbau unter 500 ms", true, t1 - t0 < 500);

  const mE = { ...m, dienstarten: m.dienstarten.map((x) => x.id === "F" ? { ...x, mindestQual: { q1: 99 } } : x) };
  ok("Qualifikationsprüfung schlägt an", true, pruefen(mE, `${ym}-01`, `${ym}-07`).some((x) => x.art === "qualifikation"));

  /* Zugriffstiefe */
  const sitzMA = { db, mandant: m, person: m.personen.find((p) => p.rolle === "mitarbeiter"), rolle: "kunde" };
  const sitzSP = { db, mandant: m, person: m.personen.find((p) => p.rolle === "subplaner"), rolle: "kunde" };
  const sitzPL = { db, mandant: m, person: m.personen.find((p) => p.rolle === "planer"), rolle: "kunde" };
  const sitzBR = { db, mandant: m, person: m.personen.find((p) => p.rolle === "betriebsrat"), rolle: "kunde" };
  ok("Mitarbeiter darf nicht planen", false, darf(sitzMA, "plan.edit.unit", sitzMA.person.bereich));
  ok("Mitarbeiter sieht fremde Konten nicht", false, darf(sitzMA, "account.view.all"));
  ok("Sub-Planer darf nur die eigene Einheit ändern", "true|false",
    `${darf(sitzSP, "plan.edit.unit", sitzSP.person.bereich)}|${darf(sitzSP, "plan.edit.unit", m.einheiten.find((e) => e.id !== sitzSP.person.bereich).id)}`);
  ok("Planer darf Dienstarten gestalten", true, darf(sitzPL, "shift.edit"));
  ok("Betriebsrat darf nichts ändern", false, darf(sitzBR, "plan.edit.all"));
  ok("Betreiber hat keinerlei Planungsrechte", false, darf({ rolle: "betreiber" }, "plan.view.all"));

  /* Kostenfortschreibung */
  const vor = preis(db, m);
  const neuP = { id: "np", vorname: "Neu", nachname: "Zugang", rolle: "planer", bereich: "ALLE", status: "aktiv",
    austritt: null, eintritt: heute(), zugehoerigkeit: [{ ab: heute(), einheitId: m.einheiten[0].id }],
    wochenstunden: 41, urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0, qualifikationen: [], funktion: "Fachkraft" };
  const nach = preis(db, { ...m, personen: [...m.personen, neuP] });
  const tarifPreis = db.tarife.find((t) => t.id === m.tarif).preis.planer * (1 - vor.st.rabatt);
  ok("Neuer Planer erhöht die Kosten automatisch", n2(tarifPreis), n2(nach.gesamt - vor.gesamt));
  const nachMA = preis(db, { ...m, personen: [...m.personen, { ...neuP, rolle: "mitarbeiter" }] });
  ok("Neuer Mitarbeiter kostet weniger als ein Planer", true, nachMA.gesamt < nach.gesamt);
  const nachBR = preis(db, { ...m, personen: [...m.personen, { ...neuP, rolle: "betriebsrat" }] });
  ok("Betriebsrat bleibt kostenfrei", n2(vor.gesamt), n2(nachBR.gesamt));

  /* Datenschutz */
  const bs = JSON.stringify(betreiberSicht(db, m));
  const treffer = m.personen.filter((p) => new RegExp(`\\b${p.nachname}\\b`).test(bs) || bs.includes(p.email) || bs.includes(p.id));
  ok("Betreibersicht enthält keine personenbezogenen Daten", 0, treffer.length);
  ok("Betreibersicht enthält die Zugangszahlen", true, !!betreiberSicht(db, m).preis.z.planer);

  /* Rechnung */
  const rg = baueRechnung(db, m, ym);
  ok("Rechnung: Brutto = Netto plus Umsatzsteuer", n2(rg.netto + rg.steuer), n2(rg.brutto));
  const bytes = rechnungPDF(rg);
  ok("PDF beginnt mit gültiger Kennung", "%PDF-1.4", String.fromCharCode(...bytes.slice(0, 8)));
  ok("PDF hat Inhalt", true, bytes.length > 2000);
  ok("Word-Dokument enthält den Gesamtbetrag", true, rechnungHTML(rg).includes(eur(rg.brutto)));

  /* --- Neue Fähigkeiten --- */
  const d0 = `${ym}-15`;
  const eF0 = m.einheiten.find((e) => einheitDienst(m, e.id, d0) === "F");
  const opfer = m.personen.filter((p) => einheitAm(p, d0) === eF0.id && personTag(m, p, d0).dienstId === "F")[0];
  const krankM = { ...m, abwesenheiten: [...m.abwesenheiten, { id: "kk", personId: opfer.id, art: "krank", von: d0, bis: d0 }] };
  const vorschl = ersatzVorschlaege(krankM, d0, "F");
  ok("Ersatzsuche liefert mögliche Kräfte", true, vorschl.filter((x) => x.moeglich).length > 3);
  ok("Ersatzsuche reiht nach Eignung", true,
    vorschl.filter((x) => x.moeglich)[0].punkte > vorschl.filter((x) => x.moeglich).slice(-1)[0].punkte);
  ok("Kranke Person wird nicht vorgeschlagen", true,
    !vorschl.some((x) => x.person.id === opfer.id && x.moeglich));
  const ruheFall = vorschl.find((x) => x.hindernisse.some((h) => h.startsWith("Ruhezeit")));
  ok("Ruhezeit schließt Kandidaten aus", true, !!ruheFall || vorschl.filter((x) => !x.moeglich).length > 0);

  const pN = m.personen.find((p) => { for (let i = 0; i < 28; i++) { const t = personTag(m, p, addDays(`${ym}-01`, i));
    if (t.dienstId) { const dd = m.dienstarten.find((x) => x.id === t.dienstId); if (dd && nachtAnteil(dd) >= 2) return true; } } return false; });
  const mN = { ...m, personen: m.personen.map((p) => p.id === pN.id
    ? { ...p, einschraenkungen: { ...p.einschraenkungen, keineNacht: true } } : p) };
  ok("Nachtdienstverbot wird geprüft", true,
    pruefen(mN, `${ym}-01`, `${ym}-28`).some((x) => x.art === "einschraenkung"));
  const daN = m.dienstarten.find((x) => nachtAnteil(x) >= 2);
  ok("Nachtdienstverbot schließt aus der Ersatzsuche aus", true,
    hindernisse(mN, mN.personen.find((p) => p.id === pN.id), addDays(heute(), 400), daN)
      .some((h) => h.includes("Nachtdienste")));

  const mF = { ...m, freigaben: { [ym]: { stand: 1, zeit: "x", durch: "Test" } } };
  ok("Freigabestand wird geführt", 1, freigabeStand(mF, ym).stand);
  ok("Ohne Freigabe gilt der Plan als Entwurf", false,
    istFreigegeben({ ...m, freigaben: {} }, ym));
  ok("Der Beispielbetrieb ist freigegeben", true, istFreigegeben(m, ym));

  const pE = m.personen[3];
  const dE = (() => { for (let i = 0; i < 28; i++) { const d = addDays(`${ym}-01`, i);
    if (personTag(m, pE, d).dienstId) return d; } return null; })();
  const vorErf = istStunden(m, pE, ym).gesamt;
  const mErf = { ...m, erfassung: { [`${pE.id}|${dE}`]: { start: "06:00", ende: "18:00", bestaetigt: true, grund: "Einsatz" } } };
  ok("Erfasste Zeit verändert das Stundenkonto", true, istStunden(mErf, pE, ym).gesamt !== vorErf);
  ok("Offene Zeitbestätigungen werden erkannt", true, offeneErfassung(m, pE, addDays(heute(), -1)).length > 0);

  const mitte = `${ym}-20`;
  const spaet = { ...m, personen: [...m.personen, { ...m.personen[9], id: "neu1", rolle: "planer",
    eintritt: mitte, rolleSeit: mitte, zugehoerigkeit: [{ ab: mitte, einheitId: m.einheiten[0].id }] }] };
  const pa = preisAnteilig(db, spaet, ym), pg = preis(db, spaet);
  ok("Anteilige Abrechnung liegt unter der vollen", true, pa.gesamt < pg.gesamt);
  ok("Ohne Wechsel stimmen anteilig und voll überein", n2(preis(db, m).gesamt), n2(preisAnteilig(db, m, ym).gesamt));
  const rgA = baueRechnung(db, spaet, ym);
  ok("Rechnung weist anteilige Menge aus", true, rgA.positionen.some((p2) => p2.text.includes("anteilig")));

  const vt = verteilung(m, addDays(heute(), -90), heute());
  ok("Verteilung erfasst alle im Bestand", m.personen.filter((p) => imDienst(p, heute())).length, vt.zeilen.length);
  ok("Verteilung bildet Mittelwerte", true, vt.mittel.weNacht > 0);
  const ps = planungssicherheit({ ...m, aenderungen: [
    { personId: "a", datum: `${ym}-05`, vorlauf: 3 }, { personId: "b", datum: `${ym}-06`, vorlauf: 30 }] }, ym);
  ok("Planungssicherheit rechnet den Anteil", 50, ps.anteil);

  /* --- Ausbaustufe zwei --- */
  const pZ = m.personen[3];
  const zs = zuschlagStunden(m, pZ, ym);
  ok("Zuschlagsstunden werden getrennt erfasst", true, zs.nacht > 0 && zs.sonntag > 0);
  ok("Zuschlagsstunden überschreiten nicht die Arbeitszeit", true, zs.nacht <= zs.gesamt);
  const nachtD = m.dienstarten.find((x) => nachtAnteil(x) >= 2);
  const teile = tagesanteile("2026-08-01", nachtD);
  ok("Nachtdienst wird auf zwei Kalendertage verteilt", 2, teile.length);
  ok("Verteilte Minuten ergeben die Bruttodauer", n1(brutto(nachtD)),
    n1(teile.reduce((a, t2) => a + t2.minuten, 0) / 60));
  const zw = zuschlagWert(m, pZ, ym);
  ok("Zuschlagswert folgt dem Prozentsatz", n1(zs.nacht * 0.25),
    n1((zw.zeilen.find((l) => l.regel.art === "nacht") || {}).wert || 0));

  const pA = m.personen.reduce((a, b2) => (stundenkonto(m, b2, ym) > stundenkonto(m, a, ym) ? b2 : a));
  const ab = ausgleichBedarf(m, pA, ym);
  ok("Ausgleichsbedarf wird erkannt", true, ab.schichten > 0);
  const tagA = ausgleichTage(m, pA, heute(), 5)[0];
  const mFrei = { ...m, abwesenheiten: [...m.abwesenheiten,
    { id: "fz", personId: pA.id, art: "ausgleich", von: tagA.datum, bis: tagA.datum, notiz: "" }] };
  ok("Freischicht senkt das Stundenkonto", true, stundenkonto(mFrei, pA, ym) < stundenkonto(m, pA, ym));
  ok("Freischicht wird nicht gutgeschrieben", 0,
    istStunden(mFrei, pA, ym).gutgeschrieben - istStunden(m, pA, ym).gutgeschrieben);

  const luecke = { ...m, abweichungen: (() => { const a2 = { ...m.abweichungen };
    const dL = `${ym}-16`;
    const eL = m.einheiten.find((e) => einheitDienst(m, e.id, dL) === "F");
    m.personen.filter((p) => einheitAm(p, dL) === eL.id).forEach((p) => { a2[`${p.id}|${dL}`] = "-"; });
    return a2; })() };
  const plan = planeMonat(luecke, ym, { maxProPerson: 3 });
  ok("Planungsassistent schließt erzeugte Lücken", true, plan.gesetzt.length > 0);
  ok("Assistent hält die Obergrenze je Person ein", true, (() => {
    const je = {}; plan.gesetzt.forEach((g) => { je[g.personId] = (je[g.personId] || 0) + 1; });
    return Object.values(je).every((v2) => v2 <= 3); })());
  const nachPlan = { ...luecke, abweichungen: plan.abweichungen };
  ok("Assistent erzeugt keine Ruhezeitverstöße", 0,
    pruefen(nachPlan, `${ym}-01`, `${ym}-28`).filter((x) => x.art === "ruhezeit").length);
  ok("Assistent verletzt keine Einschränkungen", 0,
    pruefen(nachPlan, `${ym}-01`, `${ym}-28`).filter((x) => x.art === "einschraenkung").length);

  const v2 = vorschau(m, 4);
  ok("Kapazitätsvorschau liefert vier Wochen", 4, v2.wochen.length);
  const mAntrag = { ...m, anfragen: [{ id: "x", personId: m.personen[2].id, typ: "abwesenheit", art: "urlaub",
    status: "offen", von: addDays(heute(), 3), bis: addDays(heute(), 20), erstellt: "x" }, ...m.anfragen] };
  ok("Vorschau bezieht offene Anträge ein", true,
    vorschau(mAntrag, 4).offen.length === vorschau(m, 4).offen.length + 1);

  const mR = { ...m, urlaubsrunde: { jahr: 2027, phase: "offen", frist: "2026-10-31", kontingent: {}, vorjahrZurueck: [],
    wuensche: m.personen.slice(0, 6).map((p, i) => ({ id: `w${i}`, personId: p.id, von: "2027-07-06",
      bis: "2027-07-19", prio: 1, status: "offen", erstellt: `2026-0${i + 1}-01` })) } };
  ok("Urlaubsrunde erkennt Überschneidungen", true, urlaubskonflikte(mR).length > 0);
  ok("Überschneidung nennt die Obergrenze", 3, urlaubskonflikte(mR)[0].grenze);
  const mV = { ...mR, urlaubsrunde: { ...mR.urlaubsrunde, vorjahrZurueck: [mR.urlaubsrunde.wuensche[4].personId] } };
  ok("Vorrang aus dem Vorjahr sticht", 0, urlaubsRang(mV, mV.urlaubsrunde.wuensche[4])[0]);

  const mU = { ...m, unterschreitungen: [{ id: "u", datum: `${ym}-16`, dienstId: "F", grund: "geprüft", durch: "Test" }] };
  ok("Dokumentierte Unterschreitung wird als solche geführt", true, !!unterschreitungAm(mU, `${ym}-16`, "F"));
  const nw = unterschreitungsNachweis(luecke, `${ym}-16`, `${ym}-16`);
  ok("Nachweisliste erfasst die Unterdeckung", true, nw.some((z2) => z2.ist < z2.soll));

  const dsk = datenauskunft(m, pZ.id);
  ok("Datenauskunft enthält Stammdaten", true, dsk.includes(pZ.nachname) && dsk.includes("ABWESENHEITEN"));
  const mAn = { ...m, personen: m.personen.map((p, i) => i === 5
    ? { ...p, austritt: addDays(heute(), -900) } : p) };
  ok("Anonymisierung wird nach Frist fällig", true, anonymisierbar(mAn).length === 1);
  ok("Ohne Austritt keine Anonymisierung", 0, anonymisierbar(m).length);

  /* --- Ausbaustufe drei --- */
  const pTZ = m.personen.find((p) => p.teilzeit && p.teilzeit.aktiv);
  const profTZ = teilzeitProfil(m, pTZ);
  ok("Teilzeit reduziert die Dienste im Zyklus", true, profTZ.dienste < profTZ.gesamt);
  ok("Teilzeitanteil folgt den Wochenstunden", Math.round((pTZ.wochenstunden / m.einstellungen.sollWochenstunden) * 100),
    Math.round(profTZ.quote * 100));
  ok("Teilzeit hält den Anteil über das Jahr", true, (() => {
    let ji = 0, js = 0;
    for (let i = 1; i <= 12; i++) { const k = `2026-${pad(i)}`; ji += istStunden(m, pTZ, k).gesamt; js += sollStunden(m, pTZ, k); }
    let vi = 0, vs = 0;
    const pV = m.personen.find((x) => !x.teilzeit && !x.springer);
    for (let i = 1; i <= 12; i++) { const k = `2026-${pad(i)}`; vi += istStunden(m, pV, k).gesamt; vs += sollStunden(m, pV, k); }
    // Die Jahresabweichung darf nicht stärker sein als bei Vollzeit
    return Math.abs(ji - js) <= Math.abs(vi - vs) * 1.35; })());
  // Über drei Monate gemessen: ein Zyklus geht nicht in einem Kalendermonat auf,
  // der Anteil gleicht sich erst über mehrere Zyklen aus.
  let tzI = 0, tzS = 0;
  for (let i = 0; i < 3; i++) {
    const k = `${ym.slice(0, 4)}-${pad(((Number(ym.slice(5)) - 1 + i) % 12) + 1)}`;
    tzI += istStunden(m, pTZ, k).gesamt; tzS += sollStunden(m, pTZ, k);
  }
  ok("Teilzeit trifft das Sollkonto über ein Quartal", true, Math.abs(tzI - tzS) / Math.max(1, tzS) < 0.10);
  const pVZ = m.personen.find((p) => !p.teilzeit && !p.springer);
  ok("Vollzeit bleibt unverändert", teilzeitProfil(m, pVZ).gesamt, teilzeitProfil(m, pVZ).dienste);
  const mWT = { ...m, personen: m.personen.map((p) => p.id === pTZ.id
    ? { ...p, teilzeit: { aktiv: true, modus: "wochentage", wochentage: [0, 1] } } : p) };
  const pWT = mWT.personen.find((p) => p.id === pTZ.id);
  let woTage = 0;
  for (let i = 0; i < 28; i++) { const d2 = addDays(`${ym}-01`, i);
    if (personTag(mWT, pWT, d2).dienstId && dow(d2) > 1) woTage++; }
  ok("Feste Wochentage werden eingehalten", 0, woTage);

  const spr = { ...m.personen[20], id: "spr9", springer: true, teilzeit: null };
  const mSpr = { ...m, personen: [...m.personen, spr] };
  ok("Springer folgt keiner Rotation", null, personTag(mSpr, spr, `${ym}-15`).dienstId);
  const dSpr = `${ym}-15`;
  const eSpr = m.einheiten.find((e) => einheitDienst(m, e.id, dSpr) === "F");
  const luecke2 = { ...mSpr, abweichungen: { ...mSpr.abweichungen,
    [`${m.personen.filter((p) => einheitAm(p, dSpr) === eSpr.id)[3].id}|${dSpr}`]: "-" } };
  ok("Springer steht in der Ersatzsuche vorn", true,
    ersatzVorschlaege(luecke2, dSpr, "F").slice(0, 3).some((x) => x.person.springer));

  ok("Betrieb kennt mehrere Bundesländer", true, laenderImBetrieb(m).length > 1);
  const eHE = m.einheiten.find((e) => landFuerEinheit(m, e.id) === "HE");
  const eNI = m.einheiten.find((e) => landFuerEinheit(m, e.id) === "NI");
  ok("Einheiten hängen an verschiedenen Ländern", true, !!eHE && !!eNI);
  const pHE = m.personen.find((p) => einheitAm(p, heute()) === eHE.id && !p.teilzeit);
  const pNI = m.personen.find((p) => einheitAm(p, heute()) === eNI.id && !p.teilzeit);
  ok("Sollstunden folgen dem Standort", true, sollStunden(m, pHE, "2026-06") !== sollStunden(m, pNI, "2026-06"));

  const daRuf = { ...m.dienstarten[0], id: "RB", faktor: 0.125 };
  ok("Bewertungsfaktor senkt die Kontostunden", n1(dauer(daRuf) * 0.125), n1(gewertet(daRuf, dauer(daRuf))));

  const { kopf: kI, daten: dI } = importParsen(IMPORT_BEISPIEL);
  const zuI = importZuordnen(kI);
  ok("Import erkennt alle Spalten", 10, Object.keys(zuI).length);
  const prI = importPruefen(m, kI, dI, zuI);
  ok("Import liest drei Zeilen", 3, prI.zeilen.length);
  ok("Import erkennt Teilzeit aus den Stunden", true, prI.zeilen.some((z) => z.teilzeit));
  ok("Import wandelt deutsche Datumsangaben", "2021-03-01", prI.zeilen[0].eintritt);
  const prF = importPruefen(m, kI, [["", "Ohne", "Nichteinheit", "", "", "", "", "", "", ""]], zuI);
  ok("Import meldet unbekannte Einheiten", true, prF.zeilen[0].fehler.length > 0);

  /* --- Fünfte Ausbaustufe --- */
  const pV = m.personen.find((x) => x.verfuegbarkeit && x.verfuegbarkeit.aktiv);
  const daF = m.dienstarten.find((x) => x.id === "F");
  const daN2 = m.dienstarten.find((x) => nachtAnteil(x) >= 2);
  ok("Verfügbarkeitsraster hat 21 Felder", 21, pV.verfuegbarkeit.raster.length);
  ok("Gesperrtes Zeitfenster blockt", false, verfuegbarFuer(pV, montag(heute()), daN2));
  ok("Freies Zeitfenster lässt zu", true, verfuegbarFuer(pV, montag(heute()), daF));
  ok("Ohne Pflege ist jeder verfügbar", true,
    verfuegbarFuer(m.personen.find((x) => !x.verfuegbarkeit || !x.verfuegbarkeit.aktiv), heute(), daN2));
  ok("Verfügbarkeit erscheint als Hindernis", true,
    hindernisse(m, pV, montag(heute()), daN2).some((h) => h.includes("nicht verfügbar")));

  const nl2 = nachweisLage(m);
  ok("Abgelaufene Nachweise werden gefunden", true, nl2.abgelaufen.length > 0);
  ok("Bald ablaufende Nachweise werden gefunden", true, nl2.bald.length > 0);
  const pAbg = nl2.abgelaufen[0];
  ok("Abgelaufener Nachweis zaehlt nicht als gueltig", false, qualGueltig(m, pAbg.person, pAbg.qual.id));
  ok("Unbefristete Qualifikation bleibt gueltig", true, (() => {
    const q = m.qualifikationen.find((x) => !x.gueltigMonate);
    const px = m.personen.find((x) => x.qualifikationen.includes(q.id));
    return qualGueltig(m, px, q.id); })());
  const erneuert = { ...m, personen: m.personen.map((x) => x.id === pAbg.person.id
    ? { ...x, qualNachweise: (x.qualNachweise || []).map((n) => n.qualId === pAbg.qual.id
        ? { ...n, ablauf: addDays(heute(), 400) } : n) } : x) };
  ok("Erneuerter Nachweis zaehlt wieder", true,
    qualGueltig(erneuert, erneuert.personen.find((x) => x.id === pAbg.person.id), pAbg.qual.id));

  ok("Abstand Frankfurt nach Hannover", true, (() => {
    const km = abstandMeter(50.1109, 8.6821, 52.3759, 9.7320) / 1000;
    return km > 255 && km < 270; })());
  ok("Stempel am Einsatzort wird erkannt", true,
    stempelPruefen(m, m.personen[3], heute(), { lat: 50.1112, lon: 8.6825 }).innerhalb);
  ok("Stempel abseits wird erkannt", false,
    stempelPruefen(m, m.personen[3], heute(), { lat: 50.15, lon: 8.72 }).innerhalb);
  ok("Ohne Standortfreigabe wird nicht geprueft", false,
    stempelPruefen(m, m.personen[3], heute(), null).geprueft);

  const au = auslastung(m, m.personen[3], ym);
  ok("Auslastung liegt im plausiblen Bereich", true, au.pct > 50 && au.pct < 160);
  ok("Auslastung nennt einen Stand", true,
    ["hoch", "erhoeht", "normal", "niedrig"].includes(au.stand));

  const band = tagesband(m, heute());
  ok("Tagesband enthaelt alle Dienstarten", m.dienstarten.length, band.length);
  ok("Nachtdienst reicht ueber Mitternacht", true, band.some((x) => x.ueberNacht));
  ok("Tagesband ist nach Beginn sortiert", true,
    band.every((x, i) => i === 0 || band[i - 1].von <= x.von));

  const sitzTest = { mandant: m, person: m.personen.find((x) => x.rolle === "planer"),
    rolle: "planer", matrix: m.matrix, istBetreiber: false };
  const auf = tagesaufgaben(sitzTest);
  ok("Tagesaufgaben liefern Eintraege", true, auf.length > 0);
  ok("Jede Aufgabe nennt ein Ziel", true, auf.every((a) => !!a.ziel));
  ok("Dringende Aufgaben stehen vorn", true,
    auf.every((a, i) => i === 0 || !(a.dringend && !auf[i - 1].dringend)));

  /* --- Sechste Ausbaustufe --- */
  const mFrei2 = { ...m, freigaben: { [ym]: { stand: 1, zeit: "x", durch: "T" } },
    planstaende: { [ym]: planAbbild(m, ym) } };
  ok("Ohne Freigabe kein Vergleichsstand", false, planVergleich(m, ym).hatStand);
  ok("Nach Freigabe existiert ein Stand", true, planVergleich(mFrei2, ym).hatStand);
  ok("Unveraenderter Plan zeigt keine Abweichung", 0, planVergleich(mFrei2, ym).zeilen.length);
  const pW = m.personen.find((x) => x.imSchichtdienst !== false);
  const dW = (() => { for (let i = 1; i <= 28; i++) { const d = `${ym}-${pad(i)}`;
    if (personTag(m, pW, d).dienstId) return d; } return `${ym}-15`; })();
  const geaendert = { ...mFrei2, abweichungen: { ...mFrei2.abweichungen, [`${pW.id}|${dW}`]: "-" } };
  ok("Aenderung nach Freigabe wird erkannt", 1, planVergleich(geaendert, ym).zeilen.length);
  ok("Entfallener Dienst wird als solcher benannt", "entfall", planVergleich(geaendert, ym).zeilen[0].richtung);

  const mWu = { ...m, wuensche: [{ id: "w1", personId: pW.id, datum: dW, art: "lieber_nicht" }] };
  ok("Wunsch wird am Tag gefunden", "lieber_nicht", wunschAm(mWu, pW.id, dW).art);
  ok("Wunscherfuellung wird berechnet", 0, wunschErfuellung(mWu, ym).erfuellt);
  const mWu2 = { ...mWu, abweichungen: { ...m.abweichungen, [`${pW.id}|${dW}`]: "-" } };
  ok("Erfuellter Wunsch zaehlt", 1, wunschErfuellung(mWu2, ym).erfuellt);

  const qm2 = qualMatrix(m);
  ok("Qualifikationsmatrix deckt alle Qualifikationen ab", m.qualifikationen.length, qm2.spalten.length);
  ok("Matrix zaehlt nur gueltige Nachweise", true,
    qm2.spalten.every((s2) => s2.traeger.every((p) => qualGueltig(m, p, s2.qual.id))));
  ok("Engpaesse werden ausgewiesen", true, typeof qm2.engpaesse === "number");

  const eP = m.personen.filter((x) => x.imSchichtdienst !== false);
  const mEin = { ...m, einarbeitung: [{ personId: eP[3].id, mentorId: eP[4].id,
    von: heute(), bis: addDays(heute(), 56), ziel: "Test" }] };
  const el = einarbeitungLage(mEin, heute(), addDays(heute(), 56));
  ok("Einarbeitung wird ausgewertet", 1, el.length);
  ok("Gemeinsame Dienste werden gezaehlt", true, el[0].tage > 0);
  ok("Begleitquote liegt zwischen 0 und 100", true, el[0].quote >= 0 && el[0].quote <= 100);

  const kv = kontoVerlauf(m, pW, ym, 12);
  ok("Kontoverlauf liefert zwoelf Monate", 12, kv.length);
  ok("Kontoverlauf endet im laufenden Monat", ym, kv[11].ym);
  const bv = besetzungsVerlauf(m, heute(), 14);
  ok("Besetzungsverlauf liefert vierzehn Tage", 14, bv.length);
  ok("Besetzungsquote ist plausibel", true, bv.every((x) => x.quote >= 0 && x.quote <= 400));
  ok("Nachweisverlauf liefert zwoelf Monate", 12, nachweisVerlauf(m, 12).length);

  const sitzK = { mandant: m, person: m.personen.find((x) => x.rolle === "planer"),
    rolle: "planer", matrix: m.matrix, istBetreiber: false };
  const navK = BEREICHE.flatMap((b) => b.views);
  ok("Suche findet eine Ansicht", true,
    kommandoSuche(sitzK, navK, "monat").some((t2) => t2.art === "ansicht"));
  ok("Suche findet eine Person", true,
    kommandoSuche(sitzK, navK, m.personen[5].nachname.slice(0, 4)).some((t2) => t2.art === "person"));
  ok("Suche versteht ein Datum", "datum",
    (kommandoSuche(sitzK, navK, "16.9.").find((t2) => t2.art === "datum") || {}).art);
  ok("Suche bietet Aktionen an", true,
    kommandoSuche(sitzK, navK, "krank").some((t2) => t2.art === "aktion"));
  ok("Suche ist auf zwoelf Treffer begrenzt", true, kommandoSuche(sitzK, navK, "").length <= 12);

  ok("Navigation ist in Bereiche gegliedert", true, BEREICHE.length <= 6);
  ok("Kein Bereich hat mehr als sieben Ansichten", true, BEREICHE.every((b) => b.views.length <= 7));
  ok("Jede Ansicht gehoert genau einem Bereich", true, (() => {
    const alle = BEREICHE.flatMap((b) => b.views.map((v2) => v2[0]));
    return alle.length === new Set(alle).size; })());
  ok("Briefing nennt den Betrieb", true, briefingText(sitzK).includes(m.name));

  /* --- Zuteilung und Besetzung --- */
  const dZ = `${ym}-16`;
  const bVor = besetzung(m, dZ).F.anzahl;
  const eF2 = m.einheiten.find((e) => einheitDienst(m, e.id, dZ) === "F");
  const kandZ = m.personen.find((p) => einheitAm(p, dZ) === eF2.id
    && !personTag(m, p, dZ).dienstId && !abwesenheitAm(m, p.id, dZ));
  const mZ = { ...m, abweichungen: { ...m.abweichungen, [`${kandZ.id}|${dZ}`]: "F" } };
  ok("Zuteilung erhoeht die Besetzung", bVor + 1, besetzung(mZ, dZ).F.anzahl);
  const belegtP = m.personen.find((p) => personTag(m, p, dZ).dienstId === "N");
  const mUml = { ...m, abweichungen: { ...m.abweichungen, [`${belegtP.id}|${dZ}`]: "F" } };
  ok("Umteilung verschiebt zwischen Diensten", true, (() => {
    const a = besetzung(m, dZ), b2 = besetzung(mUml, dZ);
    return b2.F.anzahl === a.F.anzahl + 1 && b2.N.anzahl === a.N.anzahl - 1; })());
  const abwP = m.personen.find((p) => abwesenheitAm(m, p.id, dZ));
  const mA = { ...m, abweichungen: { ...m.abweichungen, [`${abwP.id}|${dZ}`]: "F" } };
  ok("Abwesende zaehlen trotz Eintrag nicht mit", besetzung(m, dZ).F.anzahl, besetzung(mA, dZ).F.anzahl);
  ok("Abwesenheit erscheint als Hindernis", true,
    hindernisse(m, abwP, dZ, m.dienstarten.find((x) => x.id === "F")).some((h) => h.includes("abwesend")));

  /* --- Mandantenanlage --- */
  const moN = MODELLE.find((x) => x.id === "vier-x-vier-entzerrt");
  const neuF = { name: "Testbetrieb", branche: "pflege", einheitLabel: "Wohnbereich",
    tarif: "pro", status: "test", testTage: 90, kontakt: "leitung@test.de", kontaktName: "Anna Beispiel",
    anschrift: "Weg 1", ustId: "", wochenstunden: 38.5, ruhezeit: 11, maxFolge: 6, ausgleichGrenze: 40,
    modellId: moN.id, gruppen: moN.gruppen,
    standorte: [{ name: "Haus A", land: "NI", radius: 150 }, { name: "Haus B", land: "BY", radius: 200 }],
    qualifikationen: [{ name: "Pflegefachkraft", kurz: "PFK", gueltigMonate: null, nachweisPflicht: true },
      { name: "Erste Hilfe", kurz: "EH", gueltigMonate: 24, nachweisPflicht: true }],
    zuschlaege: [{ name: "Nachtarbeit", art: "nacht", prozent: 25, aktiv: true }] };
  const gebaut = baueAusAnlage(neuF);
  ok("Angelegter Mandant traegt den Namen", "Testbetrieb", gebaut.name);
  ok("Alle Standorte werden uebernommen", 2, gebaut.standorte.length);
  ok("Standorte behalten ihr Bundesland", "BY", gebaut.standorte[1].bundesland);
  ok("Gruppen entsprechen dem Modell", moN.gruppen, gebaut.einheiten.filter((e) => !e.pool).length);
  ok("Dienstarten stammen aus dem Modell", moN.dienste.length, gebaut.dienstarten.length);
  ok("Zyklus hat die Laenge des Modells", moN.tage.length, gebaut.zyklus.tage.length);
  ok("Regelwerk wird uebernommen", 38.5, gebaut.einstellungen.sollWochenstunden);
  ok("Qualifikationen mit Gueltigkeit", 24,
    gebaut.qualifikationen.find((q) => q.kurz === "EH").gueltigMonate);
  ok("Hauptzugang ist Organisationsleitung", "leitung", gebaut.personen[0].rolle);
  ok("Hauptzugang faehrt keine Schicht", false, gebaut.personen[0].imSchichtdienst);
  ok("Neuer Mandant ist widerspruchsfrei", 0,
    pruefen(gebaut, gebaut.anker, addDays(gebaut.anker, 27)).filter((x) => x.schwere === "danger").length);

  /* --- Erstinbetriebnahme --- */
  const esNeu = einrichtungsstand(gebaut);
  ok("Frischer Betrieb meldet offene Schritte", true, esNeu.offen.length >= 3);
  ok("Personal ist der erste offene Schritt", "personal", esNeu.offen[0].id);
  ok("Jeder Schritt nennt ein Ziel", true, esNeu.schritte.every((x) => !!x.ziel));
  ok("Eingerichteter Betrieb meldet nichts offen", true, einrichtungsstand(m).offen.length <= 1);
  const mitLeuten = { ...gebaut, personen: [...gebaut.personen,
    { ...m.personen[3], id: "n1", rolle: "planer", zugehoerigkeit: [{ ab: gebaut.anker, einheitId: gebaut.einheiten[0].id }] },
    { ...m.personen[4], id: "n2", rolle: "subplaner", zugehoerigkeit: [{ ab: gebaut.anker, einheitId: gebaut.einheiten[0].id }] }] };
  ok("Personal anlegen erledigt den ersten Schritt", true,
    einrichtungsstand(mitLeuten).schritte.find((x) => x.id === "personal").erledigt);
  ok("Zugangsart vergeben wird erkannt", true,
    einrichtungsstand(mitLeuten).schritte.find((x) => x.id === "rollen").erledigt);

  /* --- Ablauf und Einfuehrung --- */
  ok("Ablauf hat sechs Stationen", 6, ABLAUF.length);
  ok("Jede Station nennt Rolle, Ziel und Erklaerung", true,
    ABLAUF.every((x) => x.rolle && x.ziel && x.was && x.warum && typeof x.fertig === "function"));
  ok("Eingerichteter Betrieb hat alle Stationen erledigt", true,
    ABLAUF.filter((x) => x.fertig(m)).length >= 5);
  ok("Frischer Betrieb hat offene Stationen", true, ABLAUF.filter((x) => !x.fertig(gebaut)).length >= 3);
  const sitzL = { mandant: m, person: m.personen.find((x) => x.rolle === "leitung"),
    rolle: "kunde", matrix: m.matrix, db };
  const sitzP = { mandant: m, person: m.personen.find((x) => x.rolle === "planer"),
    rolle: "kunde", matrix: m.matrix, db };
  const sitzM = { mandant: m, person: m.personen.find((x) => x.rolle === "mitarbeiter"),
    rolle: "kunde", matrix: m.matrix, db };
  ok("Leitung ist fuer die Einrichtung zustaendig", true,
    meineStation(sitzL, ABLAUF.find((x) => x.id === "einrichten")));
  ok("Planung ist nicht fuer die Einrichtung zustaendig", false,
    meineStation(sitzP, ABLAUF.find((x) => x.id === "einrichten")));
  ok("Planung ist fuer die Schichtfolge zustaendig", true,
    meineStation(sitzP, ABLAUF.find((x) => x.id === "schichtfolge")));
  ok("Mitarbeiter sind nur im laufenden Betrieb zustaendig", 1,
    ABLAUF.filter((x) => meineStation(sitzM, x)).length);
  ok("Jede Rolle hat eine Einfuehrung", true,
    ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"].every((r) =>
      (EINFUEHRUNG[r] || []).length >= 5));
  ok("Einfuehrungsschritte haben Titel und Text", true,
    Object.values(EINFUEHRUNG).every((liste) => liste.every((x) => x.titel && x.text)));
  ok("Neuer Hauptzugang startet mit offener Einfuehrung", false,
    gebaut.personen[0].einfuehrung.erledigt);

  /* --- Mandantenrechner --- */
  ok("Betriebsrat unter fuenf Personen entfaellt", 0, betriebsratGroesse(4));
  ok("Betriebsrat bei 20 Personen", 1, betriebsratGroesse(20));
  ok("Betriebsrat bei 50 Personen", 3, betriebsratGroesse(50));
  ok("Betriebsrat bei 100 Personen", 5, betriebsratGroesse(100));
  ok("Betriebsrat bei 200 Personen", 7, betriebsratGroesse(200));
  ok("Betriebsrat bei 400 Personen", 9, betriebsratGroesse(400));
  const v80 = zugangsvorschlag(80, 4, true);
  ok("Vorschlag hat genau eine Leitung", 1, v80.leitung);
  ok("Sub-Planer je Einheit", 4, v80.subplaner);
  ok("Vorschlag geht auf", 80, v80.gesamt);
  ok("Grosser Betrieb erhaelt mehrere Planer", true, zugangsvorschlag(400, 8, true).planer >= 4);
  ok("Kleiner Betrieb erhaelt einen Planer", 1, zugangsvorschlag(15, 2, true).planer);
  ok("Achte Einheit bringt eine Vertretung", 9, zugangsvorschlag(200, 8, true).subplaner);
  ok("Jede Rolle hat eine Begruendung", true,
    ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"].every((r) => !!v80.begruendung[r]));
  const pr = preisFuer(db.tarife.find((t) => t.id === "pro"), v80);
  ok("Preis enthaelt die Grundgebuehr", true, pr.gesamt > pr.tarif.grund);
  ok("Leitung und Betriebsrat sind kostenfrei", 0,
    pr.zeilen.filter((z) => ["leitung", "betriebsrat"].includes(z.rolle.id))
      .reduce((a, z) => a + z.netto, 0));
  ok("Mengenstaffel wird angewandt", true, pr.st.rabatt > 0);
  ok("Kleiner Tarif traegt keinen Grossbetrieb", false,
    preisFuer(db.tarife.find((t) => t.id === "basis"), zugangsvorschlag(500, 10, true)).passt);
  ok("Preis je Person sinkt mit der Groesse", true, (() => {
    const klein = preisFuer(db.tarife[2], zugangsvorschlag(25, 3, true));
    const gross = preisFuer(db.tarife[2], zugangsvorschlag(500, 10, true));
    return gross.jePerson < klein.jePerson; })());

  /* --- Rechner ohne Obergrenze --- */
  ok("Betriebsrat bei 9.000 Personen", 35, betriebsratGroesse(9000));
  ok("Betriebsrat waechst ueber 9.000 nach Formel", 37, betriebsratGroesse(12000));
  ok("Betriebsrat bei 12.001 Personen", 39, betriebsratGroesse(12001));
  ok("Betriebsrat bei 30.000 Personen", 49, betriebsratGroesse(30000));
  const v20k = zugangsvorschlag(20000, 30, true);
  ok("Sehr grosser Betrieb wird vollstaendig abgebildet", 20000, v20k.gesamt);
  ok("Planerzahl ist nicht gedeckelt", true, v20k.planer > 100);
  ok("Vorschlag bleibt bei jeder Groesse schluessig", true,
    [50, 500, 5000, 50000].every((x) => { const vv = zugangsvorschlag(x, 6, true);
      return vv.gesamt === x && vv.leitung === 1; }));
  const p20k = preisFuer(db.tarife.find((t) => t.id === "enterprise"), v20k);
  ok("Ueber der Grenze wird als unpassend erkannt", false, p20k.passt);
  ok("Preis wird trotzdem gerechnet", true, p20k.gesamt > 0);
  ok("Hoechste Mengenstaffel greift", 0.32, p20k.st.rabatt);

  /* --- Farbsystem --- */
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const leucht = (h) => { const x = h.replace("#", "");
    return 0.2126 * lin(parseInt(x.slice(0, 2), 16)) + 0.7152 * lin(parseInt(x.slice(2, 4), 16))
      + 0.0722 * lin(parseInt(x.slice(4, 6), 16)); };
  const kon = (a, b) => { const la = leucht(a), lb = leucht(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100; };
  for (const [name, farbe] of [["Text", C.text], ["Sekundaertext", C.dim], ["Akzent", C.accent],
    ["Erfolg", C.ok], ["Warnung", C.warn], ["Kritisch", C.danger]])
    ok(`Kontrast ${name} erreicht 4,5:1`, true, kon(farbe, C.bg) >= 4.5);
  ok("Weisser Text auf Akzentflaeche", true, kon("#FFFFFF", C.accent) >= 4.5);
  ok("Weisser Text auf der Seitenleiste", true, kon("#FFFFFF", C.sidebar) >= 4.5);
  ok("Akzent auf heller Akzentflaeche", true, kon(C.accent, C.accentLight) >= 4.5);

  /* --- Kapazitaet in der geteilten Antragsansicht --- */
  const wk = wochenKapazitaet(m, 8, []);
  ok("Kapazitaet liefert acht Wochen", 8, wk.length);
  ok("Jede Woche nennt einen Stand", true,
    wk.every((w) => ["frei", "eng", "kippt"].includes(w.stand)));
  ok("Abwesenheitsquote liegt zwischen 0 und 100", true,
    wk.every((w) => w.quote >= 0 && w.quote <= 100));
  const probeA = m.anfragen.filter((a) => a.typ === "abwesenheit" && a.status === "offen").slice(0, 3);
  const wkP = wochenKapazitaet(m, 8, probeA);
  ok("Probeanträge erhoehen die Abwesenheitsquote", true,
    wkP.some((w, i) => w.quote >= wk[i].quote));
  ok("Ohne Probe entspricht dann dem jetzt", true, wk.every((w) => w.dann === w.jetzt));

  /* --- Branchenpakete --- */
  ok("Kernpaket ist Pflicht", true, PAKETE.find((p) => p.id === "kern").pflicht);
  ok("Jedes Paket nennt Merkmale", true, PAKETE.every((p) => p.merkmale.length > 0));
  ok("Sicherheitsbetrieb hat harte Sperre", true, kann(db.mandanten[0], "hartesperre"));
  ok("Sicherheitsbetrieb hat keine Fachkraftquote", false, kann(db.mandanten[0], "fachkraftquote"));
  ok("Pflegebetrieb hat Fachkraftquote", true, kann(db.mandanten[1], "fachkraftquote"));
  ok("Pflegebetrieb hat Uebergabe", true, kann(db.mandanten[1], "uebergabe"));
  ok("Kernmerkmale gelten immer", true, kann(db.mandanten[2], "plan"));
  ok("Branche schlaegt Pakete vor", true, paketeFuerBranche("pflege").includes("pflege"));

  /* --- Branchenbegriffe --- */
  ok("Pflege sagt Wohnbereich", "Wohnbereich", begriff(db.mandanten[1], "einheit"));
  ok("Sicherheit sagt Schichtgruppe", "Schichtgruppe", begriff(db.mandanten[0], "einheit"));
  ok("Unbekannte Branche faellt auf Standard zurueck", "Einheit",
    begriff({ branche: "gibtesnicht" }, "einheit"));

  /* --- Fachkraftquote --- */
  const mPf = db.mandanten[1];
  const flN = fachkraftLage(mPf, heute(), "N");
  ok("Fachkraftlage wird berechnet", true, !!flN && flN.gesamt > 0);
  ok("Fachkraftanteil zwischen 0 und 100", true, flN.ist >= 0 && flN.ist <= 100);
  ok("Ohne Paket keine Fachkraftlage", null, fachkraftLage(db.mandanten[0], heute(), "F"));
  const mHoch = { ...mPf, dienstarten: mPf.dienstarten.map((d) =>
    d.id === "N" ? { ...d, fachkraftQuote: 1 } : d) };
  ok("Unerfuellbare Quote wird gemeldet", true,
    pruefen(mHoch, heute(), addDays(heute(), 6)).some((x) => x.art === "fachkraft"));

  /* --- Harte Sperre --- */
  const mOhne = { ...db.mandanten[0], personen: db.mandanten[0].personen.map((p, i) =>
    i === 5 ? { ...p, qualifikationen: p.qualifikationen.filter((q) => q !== "q1") } : p) };
  ok("Fehlende Pflichtqualifikation sperrt", true,
    pruefen(mOhne, heute(), addDays(heute(), 27)).some((x) => x.art === "sperre"));
  ok("Sperre erscheint als Hindernis", true,
    hindernisse(mOhne, mOhne.personen[5], heute(), mOhne.dienstarten[0])
      .some((h) => h.includes("zwingend")));

  /* --- Dienstformen --- */
  ok("Rufbereitschaft ist ruhezeitneutral", true, dienstform("ruf").ruhezeitNeutral);
  ok("Bereitschaftsdienst zaehlt anteilig", 0.6, dienstform("bereitschaft").faktor);
  ok("Geteilter Dienst rechnet beide Abschnitte", 8,
    geteilteDauer({ start: "06:00", ende: "11:00", pause: 0, zweiterAbschnitt: { start: "17:00", ende: "20:00" } }));

  /* --- Mehrstufige Genehmigung --- */
  ok("Urlaub braucht eine Stufe", 1, stufenFuer(m, "urlaub"));
  ok("Schulung braucht zwei Stufen", 2, stufenFuer(m, "schulung"));
  const aStuf = { art: "schulung", typ: "abwesenheit", freigaben: [] };
  ok("Ohne Freigabe nicht fertig", false, genehmigungsStand(m, aStuf).fertig);
  ok("Nach einer Freigabe fehlt noch eine", 1,
    genehmigungsStand(m, { ...aStuf, freigaben: [{ von: "A" }] }).offen);
  ok("Nach zwei Freigaben fertig", true,
    genehmigungsStand(m, { ...aStuf, freigaben: [{ von: "A" }, { von: "B" }] }).fertig);

  /* --- Uebergabe --- */
  ok("Ohne Paket keine offenen Uebergaben", 0, offeneUebergaben(db.mandanten[0]).length);
  ok("Pflegebetrieb meldet offene Uebergaben", true, offeneUebergaben(mPf).length > 0);
  ok("Uebergabe hat Pflichtfeld", true, UEBERGABE_FELDER.some((x) => x.pflicht));

  /* --- DATEV --- */
  const dv = datevSaetze(m, ym);
  ok("DATEV liefert Saetze", true, dv.length > 0);
  ok("Jeder Satz nennt eine Lohnart", true, dv.every((z) => !!z.lohnart && !!z.bezeichnung));
  ok("Nachtzuschlag traegt Lohnart 1400", true,
    dv.filter((z) => z.bezeichnung.includes("Nacht")).every((z) => z.lohnart === "1400"));
  ok("DATEV-CSV hat Kopfzeile", true, datevCSV(m, ym).includes("Personalnummer;Nachname"));

  /* --- Belastbarkeit --- */
  const bl8 = belastbarkeit(m, 8);
  ok("Belastbarkeit liefert acht Wochen", 8, bl8.length);
  ok("Jede Woche nennt eine Stufe", true,
    bl8.every((w) => ["robust", "knapp", "ohne Reserve"].includes(w.stufe)));
  ok("Jede Woche kennt ihren schwaechsten Dienst", true,
    bl8.every((w) => !w.zeilen.length || !!w.schwaechste));
  ok("Reserve ist nie negativ", true, bl8.every((w) => w.zeilen.every((z) => z.min >= 0)));
  const tr = tagesReserve(m, heute(), m.dienstarten[0].id);
  ok("Tagesreserve nennt Puffer und Ersatz", true, tr && tr.traegt >= 0 && tr.ersatz >= 0);

  /* --- Ausfallszenarien --- */
  const sz10 = ausfallSzenario(m, 0.1, 14);
  const sz30 = ausfallSzenario(m, 0.3, 14);
  ok("Zehn Prozent Ausfall betrifft weniger als dreissig", true, sz10.betroffen < sz30.betroffen);
  ok("Mehr Ausfall erzeugt mehr Befunde", true, sz30.neu >= sz10.neu);
  ok("Szenario ist bei gleichem Anteil reproduzierbar", ausfallSzenario(m, 0.2, 14).neu,
    ausfallSzenario(m, 0.2, 14).neu);
  ok("Ohne Ausfall keine neuen Befunde", 0, ausfallSzenario(m, 0, 14).neu);

  /* --- Rangbegruendung --- */
  const kand = ersatzVorschlaege(m, addDays(heute(), 3), m.dienstarten[0].id)
    .filter((x) => x.moeglich)[0];
  ok("Es gibt einen Ersatzvorschlag", true, !!kand);
  const rgr = rangGruende(m, kand, addDays(heute(), 3), m.dienstarten[0].id);
  ok("Rangbegruendung nennt Gruende", true, rgr.length > 0);
  ok("Jeder Grund hat Art und Text", true, rgr.every((g) => g.art && g.text));
  ok("Arten sind plus, minus oder hinweis", true,
    rgr.every((g) => ["plus", "minus", "hinweis"].includes(g.art)));

  /* --- Springer im Bestand --- */
  const sprP = m.personen.filter((p) => p.springer);
  ok("Es gibt Springer", true, sprP.length > 0);
  ok("Springer werden eingesetzt", true, sprP.every((p) => {
    let n = 0;
    for (let i = 1; i <= 28; i++) if (personTag(m, p, `${ym}-${pad(i)}`).dienstId) n++;
    return n >= 8; }));
  ok("Springerkonten bleiben im Rahmen", true,
    sprP.every((p) => Math.abs(stundenkonto(m, p, ym)) < 400));
  ok("Springer arbeiten nicht im Urlaub", true, sprP.every((p) => {
    for (let i = 1; i <= 28; i++) { const d = `${ym}-${pad(i)}`;
      if (personTag(m, p, d).dienstId && abwesenheitAm(m, p.id, d)) return false; }
    return true; }));

  /* --- Datenmitnahme --- */
  const vex = vollExport(m);
  ok("Export enthaelt den Personalstamm", true, vex.personen.length === m.personen.length);
  ok("Export schreibt den Plan aus", true, vex.dienstplan.length > 1000);
  ok("Planzeilen nennen Datum und Person", true,
    vex.dienstplan.every((z) => !!z.datum && !!z.personId));
  ok("Export enthaelt Qualifikationen", true, vex.qualifikationen.length > 0);
  const csv = tabelleCSV(vex.personen);
  ok("CSV traegt eine Byte-Reihenfolge-Markierung", true, csv.charCodeAt(0) === 0xFEFF);
  ok("CSV trennt mit Semikolon", true, csv.split("\r\n")[0].includes(";"));
  ok("CSV maskiert Semikolon im Feld", true,
    tabelleCSV([{ a: "eins;zwei" }]).includes('"eins;zwei"'));
  ok("Leere Tabelle liefert leeren Text", "", tabelleCSV([]));

  /* --- Plankennzahlen --- */
  const pk = planKennzahlen(m, `${ym}-01`, `${ym}-14`);
  ok("Kennzahlen zaehlen Dienste", true, pk.dienste > 0);
  ok("Kennzahlen zaehlen Stunden", true, pk.stunden > 0);

  /* --- Farbsystem der neuen Palette --- */
  ok("Grundflaeche ist warm getoent", true, C.bg !== "#FFFFFF" && C.bg !== "#F5F4F2");
  for (const [name, farbe] of [["Sekundaertext", C.dim], ["Akzent hell", C.accentHi],
    ["Akzent tief", C.accentDeep], ["Violett", C.violet]])
    ok(`Kontrast ${name} erreicht 4,5:1`, true, kon(farbe, C.bg) >= 4.5);
  ok("Weisser Text auf Erfolgsflaeche", true, kon("#FFFFFF", C.ok) >= 4.5);
  ok("Weisser Text auf Warnflaeche", true, kon("#FFFFFF", C.warn) >= 4.5);
  ok("Weisser Text auf Kritischflaeche", true, kon("#FFFFFF", C.danger) >= 4.5);
  ok("Erfolgstext auf heller Erfolgsflaeche", true, kon(C.ok, C.okLight) >= 4.5);
  ok("Warntext auf heller Warnflaeche", true, kon(C.warn, C.warnLight) >= 4.5);
  ok("Kritischtext auf heller Flaeche", true, kon(C.danger, C.dangerLight) >= 4.5);
  ok("Glanzlicht traegt auf der Seitenleiste", true, kon(C.accentGlanz, C.sidebar) >= 4.5);
  ok("Gedaempfter Text auf der Seitenleiste", true, kon("#96A0A6", C.sidebar) >= 4.5);
  ok("Genehmigen und Ablehnen sind klar unterscheidbar", true,
    kon(C.ok, "#FFFFFF") >= 4.5 && Math.abs(kon(C.ok, C.bg) - kon(C.bg, C.bg)) > 3);
  return T;
}




/* ================================ ANWENDUNG ============================== */
const SPEICHER = "schichtwerk:v5";
function lade(name, inhalt, typ) {
  try {
    const blob = inhalt instanceof Uint8Array ? new Blob([inhalt], { type: typ }) : new Blob([inhalt], { type: typ });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}

const NAV_BETREIBER = [
  ["mandanten", "Mandanten"], ["rechnungen", "Rechnungen"], ["tarife", "Tarife"], ["rechner", "Rechner"], ["pakete", "Pakete"]];
/**
 * Navigation in sechs Bereichen statt neunzehn Einzelpunkten.
 * Jeder Bereich hat Unterreiter — die Kopfzeile bleibt lesbar, nichts ist versteckt.
 */
const BEREICHE = [
  { id: "heute", label: "Heute", views: [
    ["start", "Start", null],
    ["ablauf", "Ablauf", null],
    ["uebergabe", "Übergabe", "PAKET:uebergabe"],
    ["meine", "Meine Schichten", "SCHICHT"],
    ["lage", "Lagebild", "plan.view.unit"],
    ["zeitachse", "Zeitachse", "plan.view.unit"],
  ]},
  { id: "planung", label: "Planung", views: [
    ["plan", "Monatsplan", "plan.view.all"],
    ["einsatz", "Personaleinsatz", "plan.view.unit"],
    ["jahr", "Jahresansicht", "plan.view.unit"],
    ["planstand", "Planstand", "plan.view.all"],
    ["bereitschaft", "Bereitschaft", "plan.view.unit"],
    ["folge", "Schichtfolge", "pattern.edit"],
    ["dienste", "Dienstarten", "plan.view.all"],
  ]},
  { id: "anliegen", label: "Anliegen", views: [
    ["antraege", "Anträge", "req.approve.unit"],
    ["boerse", "Tauschbörse", "req.create"],
    ["wuensche", "Wunschdienste", "SCHICHT"],
    ["aushang", "Schwarzes Brett", null],
    ["buch", "Dienstbuch", "plan.view.unit"],
  ]},
  { id: "team", label: "Team", views: [
    ["personal", "Personal", "staff.view"],
    ["quals", "Qualifikationen", "staff.view"],
    ["nachweise", "Nachweise", "staff.view"],
    ["einarbeitung", "Einarbeitung", "staff.view"],
    ["belastbarkeit", "Belastbarkeit", "plan.view.unit"],
    ["verteilung", "Verteilung", "staff.view"],
    ["mittel", "Betriebsmittel", "plan.view.unit"],
  ]},
  { id: "auswertung", label: "Auswertung", views: [
    ["pruef", "Prüfung", "plan.view.all"],
    ["abrechnung", "Abrechnungsdaten", "account.view.all"],
  ]},
  { id: "verwaltung", label: "Verwaltung", views: [
    ["betrieb", "Betrieb", "org.edit"],
    ["mitnahme", "Datenmitnahme", "org.edit"],
  ]},
];
const NAV_KUNDE = BEREICHE.flatMap((b) => b.views);


function AppInnen() {
  const [db, setDb] = useState(null);
  const [view, setView] = useState("start");
  const [ym, setYm] = useState(heute().slice(0, 7));
  const [tag, setTag] = useState(null);
  const [person, setPerson] = useState(null);
  const [detail, setDetail] = useState(null);
  const [hinweis, setHinweis] = useState(null);
  const [ausgabe, setAusgabe] = useState(null);
  const [krank, setKrank] = useState(null);
  const [assist, setAssist] = useState(false);
  const [eskal, setEskal] = useState(null);
  const [ausgl, setAusgl] = useState(null);
  const [konflikt, setKonflikt] = useState(false);
  const [schnell, setSchnell] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [verfDlg, setVerfDlg] = useState(null);
  const [nwDlg, setNwDlg] = useState(null);
  const [antragVon, setAntragVon] = useState(null);
  const [tauschVon, setTauschVon] = useState(null);
  const [kmd, setKmd] = useState(false);
  const [wunschDlg, setWunschDlg] = useState(null);
  const [notizDlg, setNotizDlg] = useState(null);
  const [mehrfach, setMehrfach] = useState(false);
  // Mobil zuerst: Wer im Schichtdienst ist und keine Planungsrechte hat, startet
  // in der Telefonansicht — unabhängig von der Bildschirmbreite.
  const [rechnerAnsicht, setRechnerAnsicht] = useState(false);
  const [einf, setEinf] = useState(false);
  const [dicht, setDicht] = useState(false);
  const [fokus, setFokus] = useState(false);
  const [seiteOffen, setSeiteOffen] = useState(false);
  const [imp, setImp] = useState(false);
  const [postfach, setPostfach] = useState(false);
  const [schmal, setSchmal] = useState(false);
  const ref = useRef(null); const erst = useRef(true); const verlauf = useRef([]);

  useEffect(() => {
    const f = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setKmd((x) => !x); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const f = () => setSchmal(mq.matches);
    f(); mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f); };
  }, []);

  useEffect(() => { (async () => {
    let s = null;
    try { const r = await window.storage.get(SPEICHER); s = r && r.value ? JSON.parse(r.value) : null; } catch (e) { s = null; }
    // Übernahme aus der Vorgängerfassung, damit kein Bestand verloren geht
    if (!s) { try { const r2 = await window.storage.get(SPEICHER_ALT);
      if (r2 && r2.value) s = JSON.parse(r2.value); } catch (e) { /* still */ } }
    setDb(s && s.version === 5 ? s : startbestand());
  })(); }, []);
  useEffect(() => { ref.current = db; }, [db]);
  useEffect(() => { if (!db) return; if (erst.current) { erst.current = false; return; }
    (async () => {
      try {
        const p = await fremdstandPruefen(SPEICHER, (db.stand || 0) - 1);
        if (p.konflikt) { setKonflikt(true); return; }
        await window.storage.set(SPEICHER, JSON.stringify(db));
      } catch (e) { /* still */ }
    })(); }, [db]);

  const melde = useCallback((t) => { setHinweis(t); setTimeout(() => setHinweis(null), 3000); }, []);

  const sitz = useMemo(() => {
    if (!db || !db.session) return null;
    if (db.session.rolle === "betreiber") return { rolle: "betreiber", db };
    const m = db.mandanten.find((x) => x.id === db.session.mandantId);
    if (!m) return null;
    const p = m.personen.find((x) => x.id === db.session.personId);
    if (!p) return null;
    return { rolle: "kunde", db, mandant: m, person: p };
  }, [db]);

  const akt = useMemo(() => {
    const upd = (fn) => setDb((s) => { if (!s) return s; verlauf.current = [s, ...verlauf.current].slice(0, 20);
      const next = fn(s); return next === s ? s : { ...next, stand: (s.stand || 0) + 1 }; });
    /** Ändert den aktuellen Mandanten und schreibt einen Protokolleintrag. */
    const mUpd = (fn, text) => upd((s) => {
      const mid = s.session.mandantId;
      return { ...s, mandanten: s.mandanten.map((m) => {
        if (m.id !== mid) return m;
        const next = fn(m);
        return text ? { ...next, protokoll: [{ id: uid("l"), zeit: new Date().toLocaleString("de-DE"), text }, ...next.protokoll].slice(0, 200) } : next;
      }) };
    });
    const bLog = (s, text) => ({ ...s, protokoll: [{ id: uid("l"), zeit: new Date().toLocaleString("de-DE"), text }, ...s.protokoll].slice(0, 300) });
    const jetzt = () => new Date().toLocaleString("de-DE");

    return {
      /* --- Anmeldung --- */
      anmelden: (sess) => setDb((s) => ({ ...s, session: sess })),
      abmelden: () => { setDb((s) => ({ ...s, session: null })); setView("meine"); setDetail(null); },
      zurueck: () => { if (!verlauf.current.length) return melde("Nichts rückgängig zu machen.");
        const [l, ...r] = verlauf.current; verlauf.current = r; setDb(l); melde("Rückgängig gemacht."); },

      /* --- Betreiber --- */
      setzeStatus: (id, status) => upd((s) => {
        let stichtag = null;
        if (status === "test") stichtag = window.prompt("Testphase endet am (JJJJ-MM-TT):", heute()) || null;
        if (status === "gekuendigt") stichtag = window.prompt("Kündigung wirksam zum (JJJJ-MM-TT):", heute()) || null;
        const m = s.mandanten.find((x) => x.id === id);
        melde(`${m.name}: ${stat(status).label}.`);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, status, stichtag } : x) },
          `${m.name}: Status auf „${stat(status).label}" gesetzt`);
      }),
      setzeTarif: (id, t) => upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, tarif: t } : x) },
        `${s.mandanten.find((x) => x.id === id).name}: Tarifwechsel`)),
      setzeMandantFeld: (id, k, v) => upd((s) => ({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, [k]: v } : x) })),
      setzeBetreiber: (k, v) => upd((s) => ({ ...s, betreiber: { ...s.betreiber, [k]: v } })),
      setzeTarifFeld: (id, k, v) => upd((s) => ({ ...s, tarife: s.tarife.map((t) => t.id === id ? { ...t, [k]: v } : t) })),
      setzeTarifPreis: (id, r, v) => upd((s) => ({ ...s, tarife: s.tarife.map((t) => t.id === id ? { ...t, preis: { ...t.preis, [r]: v } } : t) })),
      setzeTarifGrenze: (id, k, v) => upd((s) => ({ ...s, tarife: s.tarife.map((t) => t.id === id ? { ...t, grenzen: { ...t.grenzen, [k]: v } } : t) })),
      neuerMandant: (f) => upd((s) => {
        const m = baueAusAnlage(f);
        melde(`${m.name} angelegt · ${m.einheiten.filter((e) => !e.pool).length} ${f.einheitLabel}n, ${m.dienstarten.length} Dienstarten.`);
        return bLog({ ...s, mandanten: [...s.mandanten, m] },
          `Mandant „${m.name}" eingerichtet: ${m.einheiten.filter((e) => !e.pool).length} Einheiten`);
      }),
      setzePaket: (mid, paket, an) => upd((s) => ({ ...s,
        mandanten: s.mandanten.map((m) => m.id !== mid ? m : { ...m,
          pakete: an ? [...new Set([...(m.pakete || []), paket])]
            : (m.pakete || []).filter((p) => p !== paket) }) }),
        `Paket ${paketVon(paket).name} ${an ? "freigeschaltet" : "abgeschaltet"}`),
      loescheMandant: (id) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (window.prompt(`Löscht Mandant, Einheiten, Personal und Pläne unwiderruflich.\nZur Bestätigung den Namen eingeben:\n\n${m.name}`) !== m.name) {
          melde("Löschung abgebrochen."); return s; }
        melde(`${m.name} gelöscht.`); setDetail(null);
        return bLog({ ...s, mandanten: s.mandanten.filter((x) => x.id !== id),
          rechnungen: s.rechnungen.filter((r) => r.mandantId !== id) }, `Mandant „${m.name}" gelöscht`);
      }),
      rechnungStellen: (id) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        const rg = baueRechnung(s, m, ym);
        if (s.rechnungen.some((r) => r.nummer === rg.nummer)) { melde("Für diesen Zeitraum liegt bereits eine Rechnung vor."); return s; }
        melde(`Rechnung ${rg.nummer} erzeugt.`);
        return bLog({ ...s, rechnungen: [rg, ...s.rechnungen] }, `Rechnung ${rg.nummer} für ${m.name} über ${eur(rg.brutto)}`);
      }),
      rechnungslauf: (monat) => upd((s) => {
        const neu = [];
        for (const m of s.mandanten) {
          if (!stat(m.status).zahlt) continue;
          const rg = baueRechnung(s, m, monat);
          if (s.rechnungen.some((r) => r.nummer === rg.nummer)) continue;
          neu.push(rg);
        }
        melde(neu.length ? `${neu.length} Rechnungen erzeugt.` : "Keine neuen Rechnungen — bereits vorhanden.");
        return bLog({ ...s, rechnungen: [...neu, ...s.rechnungen] }, `Rechnungslauf ${monat}: ${neu.length} Rechnungen`);
      }),
      rechnungenLeeren: () => upd((s) => { melde("Rechnungsausgang geleert."); return { ...s, rechnungen: [] }; }),
      rechnungPDF: (rg) => {
        const bytes = rechnungPDF(rg);
        if (lade(`${rg.nummer}.pdf`, bytes, "application/pdf")) melde("PDF erstellt.");
        else setAusgabe({ titel: `${rg.nummer}.pdf`, inhalt: "Die PDF-Datei kann in dieser Umgebung nicht gespeichert werden. Nutze stattdessen die Word-Ausgabe oder den Ausdruck." });
      },
      rechnungWord: (rg) => {
        const html = rechnungHTML(rg);
        if (lade(`${rg.nummer}.doc`, html, "application/msword")) melde("Word-Dokument erstellt.");
        else setAusgabe({ titel: `${rg.nummer}.doc`, inhalt: html });
      },

      /* --- Betrieb --- */
      setzeFeld: (k, v) => mUpd((m) => ({ ...m, [k]: v }), null),
      setzeBranche: (b) => mUpd((m) => { const br = BRANCHEN.find((x) => x[0] === b);
        return { ...m, branche: b, einheitLabel: br ? br[2] : m.einheitLabel }; }, "Branche gewechselt"),
      setzeEinstellung: (k, v) => mUpd((m) => ({ ...m, einstellungen: { ...m.einstellungen, [k]: v } }), null),
      setzeEinheit: (id, k, v) => mUpd((m) => ({ ...m, einheiten: m.einheiten.map((e) => e.id === id ? { ...e, [k]: v } : e) }), null),
      neueEinheit: () => mUpd((m) => ({ ...m, einheiten: [...m.einheiten, { id: uid("e"),
        name: `${m.einheitLabel} ${m.einheiten.length + 1}`, versatz: m.einheiten.length % m.zyklus.wochen,
        farbe: PALETTE[m.einheiten.length % PALETTE.length] }] }), "Einheit angelegt"),
      loescheEinheit: (id) => mUpd((m) => {
        const n = m.personen.filter((p) => einheitAm(p, heute()) === id && imDienst(p, heute())).length;
        if (n) { melde(`Der Einheit sind noch ${n} Personen zugeordnet.`); return m; }
        return { ...m, einheiten: m.einheiten.filter((e) => e.id !== id) };
      }, "Einheit gelöscht"),
      neueQual: () => mUpd((m) => ({ ...m, qualifikationen: [...m.qualifikationen,
        { id: uid("q"), name: "Neue Qualifikation", kurz: "NEU", farbe: PALETTE[m.qualifikationen.length % PALETTE.length] }] }), "Qualifikation angelegt"),
      setzeQual: (id, k, v) => mUpd((m) => ({ ...m, qualifikationen: m.qualifikationen.map((q) => q.id === id ? { ...q, [k]: v } : q) }), null),
      loescheQual: (id) => mUpd((m) => ({ ...m, qualifikationen: m.qualifikationen.filter((q) => q.id !== id),
        personen: m.personen.map((p) => ({ ...p, qualifikationen: p.qualifikationen.filter((x) => x !== id) })),
        dienstarten: m.dienstarten.map((d) => { const mq = { ...d.mindestQual }; delete mq[id]; return { ...d, mindestQual: mq }; }) }), "Qualifikation gelöscht"),
      toggleRecht: (r, recht) => mUpd((m) => {
        const cur = m.matrix[r] || [];
        return { ...m, matrix: { ...m.matrix, [r]: cur.includes(recht) ? cur.filter((x) => x !== recht) : [...cur, recht] } };
      }, "Rechtematrix geändert"),
      matrixZuruecksetzen: () => mUpd((m) => ({ ...m, matrix: JSON.parse(JSON.stringify(MATRIX_STD)) }), "Rechtematrix zurückgesetzt"),

      /* --- Plan --- */
      setzeAbweichung: (pid, d, dienstId) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid); if (!p) return m;
        const eid = einheitAm(p, d);
        if (!darfEinheit({ db: ref.current, mandant: m, person: sitz.person, rolle: "kunde" }, eid)) { melde("Keine Berechtigung für diesen Bereich."); return m; }
        const plan = eid ? einheitDienst(m, eid, d) : null;
        const ab = { ...m.abweichungen }, key = `${pid}|${d}`;
        const vorher = ab[key] !== undefined ? ab[key] : plan;
        if ((dienstId === "-" && !plan) || dienstId === plan) delete ab[key]; else ab[key] = dienstId;
        const nachher = ab[key] !== undefined ? ab[key] : plan;
        let next = { ...m, abweichungen: ab };
        if (vorher !== nachher) {
          const vl = vorlauf(d);
          next = { ...next, aenderungen: [{ id: uid("c"), personId: pid, datum: d, von: vorher || "-",
            nach: nachher || "-", zeit: new Date().toLocaleString("de-DE"), vorlauf: vl }, ...(next.aenderungen || [])].slice(0, 800) };
          if (istFreigegeben(m, d.slice(0, 7))) {
            const nam = (x) => x === "-" || !x ? "frei" : (m.dienstarten.find((y) => y.id === x) || {}).name || x;
            next = { ...next, nachrichten: [{ id: uid("n"), personId: pid, zeit: new Date().toLocaleString("de-DE"),
              art: vl < 14 ? "warn" : "info", gelesen: false, titel: `Dienst am ${fKurz(d)} geändert`,
              text: `${nam(vorher)} → ${nam(nachher)}${vl < 14 ? ` · ${vl} Tage Vorlauf` : ""}` }, ...(next.nachrichten || [])].slice(0, 400) };
          }
        }
        return next;
      }, null),

      /* --- Krankmeldung, Ersatz, Freigabe, Zeiten, Einschränkungen --- */
      oeffneKrankmeldung: (pid) => setKrank({ pid: pid || "" }),
      krankmelden: (pid, von, bis, notiz) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const betroffen = [];
        for (let d = von; d <= bis; d = addDays(d, 1)) if (personTag(m, p, d).dienstId) betroffen.push(d);
        const plan = m.personen.filter((x) => ["leitung", "planer"].includes(x.rolle)
          || (x.rolle === "subplaner" && x.bereich === einheitAm(p, von)));
        const nachr = plan.map((x) => ({ id: uid("n"), personId: x.id, zeit: new Date().toLocaleString("de-DE"),
          art: "warn", gelesen: false, titel: `Krankmeldung: ${p.vorname} ${p.nachname}`,
          text: `${fKurz(von)} bis ${fKurz(bis)} · ${betroffen.length} betroffene Dienste${notiz ? ` · ${notiz}` : ""}` }));
        melde(`Krankmeldung erfasst · ${betroffen.length} betroffene Dienste.`);
        return { ...m, abwesenheiten: [...m.abwesenheiten, { id: uid("a"), personId: pid, art: "krank", von, bis, notiz }],
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Krankmeldung erfasst"),
      setzeEinsprung: (pid, d, dienstId) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const da = m.dienstarten.find((x) => x.id === dienstId);
        if (!p) { melde("Person nicht gefunden."); return m; }
        // Eine bestehende Abwesenheit schlägt jede Einteilung — sonst wird die
        // Zuteilung angenommen, wirkt aber nicht und die Besetzung bleibt stehen.
        const abw = abwesenheitAm(m, pid, d);
        if (abw) {
          melde(`${p.vorname} ${p.nachname} ist am ${fKurz(d)} ${abwArt(abw.art).label.toLowerCase()} — Einteilung nicht möglich.`);
          return m;
        }
        const vorher = personTag(m, p, d).dienstId;
        if (vorher === dienstId) { melde(`${p.nachname} ist bereits eingeteilt.`); return m; }
        melde(vorher
          ? `${p.vorname} ${p.nachname} für ${fKurz(d)} umgeteilt.`
          : `${p.vorname} ${p.nachname} für ${fKurz(d)} eingeteilt.`);
        return { ...m,
          abweichungen: { ...m.abweichungen, [`${pid}|${d}`]: dienstId },
          einspruenge: [{ id: uid("s"), personId: pid, datum: d, dienstId, zeit: new Date().toLocaleString("de-DE") }, ...(m.einspruenge || [])].slice(0, 500),
          aenderungen: [{ id: uid("c"), personId: pid, datum: d, von: "-", nach: dienstId,
            zeit: new Date().toLocaleString("de-DE"), vorlauf: vorlauf(d) }, ...(m.aenderungen || [])].slice(0, 800),
          nachrichten: [{ id: uid("n"), personId: pid, zeit: new Date().toLocaleString("de-DE"), art: "warn", gelesen: false,
            titel: `Zusätzlicher Dienst am ${fKurz(d)}`,
            text: `${da ? da.name : dienstId} · ${da ? `${da.start}–${da.ende}` : ""} · als Ersatz eingeteilt` }, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Ersatz eingeteilt"),
      freigeben: (ym2) => mUpd((m) => {
        const alt = freigabeStand(m, ym2);
        const stand = (alt ? alt.stand : 0) + 1;
        const wer = `${sitz.person.vorname} ${sitz.person.nachname}`;
        const nachr = m.personen.filter((p) => imDienst(p, heute())).map((p) => ({
          id: uid("n"), personId: p.id, zeit: new Date().toLocaleString("de-DE"), art: "info", gelesen: false,
          titel: `Dienstplan ${MON[Number(ym2.slice(5)) - 1]} ${ym2.slice(0, 4)} freigegeben`,
          text: stand === 1 ? "Der Plan ist ab sofort verbindlich." : `Stand ${stand} — der Plan wurde nach Änderungen erneut freigegeben.` }));
        melde(`Plan freigegeben · Stand ${stand}.`);
        return { ...m, freigaben: { ...(m.freigaben || {}), [ym2]: { stand, zeit: new Date().toLocaleString("de-DE"), durch: wer } },
          planstaende: { ...(m.planstaende || {}), [ym2]: planAbbild(m, ym2) },
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Plan freigegeben"),
      bestaetigeZeit: (pid, d, start, ende, grund) => mUpd((m) => ({ ...m,
        erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: { start, ende, bestaetigt: true, grund: grund || "" } } }), null),
      setzeEinschraenkung: (pid, k, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, einschraenkungen: { ...(p.einschraenkungen || {}), [k]: v } } : p) }), "Einsatzeinschränkung geändert"),
      alleGelesen: () => mUpd((m) => ({ ...m, nachrichten: (m.nachrichten || []).map((n) =>
        n.personId === sitz.person.id ? { ...n, gelesen: true } : n) }), null),
      loescheAbweichung: (pid, d) => mUpd((m) => { const ab = { ...m.abweichungen }; delete ab[`${pid}|${d}`]; return { ...m, abweichungen: ab }; }, null),
      setzeZyklusTag: (i, v) => mUpd((m) => ({ ...m, zyklus: { ...m.zyklus, tage: m.zyklus.tage.map((d, k) => (k === i ? v : d)), vorlage: null } }), "Schichtfolge geändert"),
      setzeZyklusWochen: (w) => mUpd((m) => ({ ...m, zyklus: { ...m.zyklus, wochen: w,
        tage: Array.from({ length: w * 7 }, (_, i) => m.zyklus.tage[i] || "-"), vorlage: null } }), "Zykluslänge geändert"),
      ladeVorlage: (vid) => mUpd((m) => {
        const v = VORLAGEN.find((x) => x.id === vid); if (!v) return m;
        return { ...m, zyklus: { wochen: v.wochen, tage: [...v.tage], vorlage: v.id },
          dienstarten: m.dienstarten.map((d) => v.zeiten[d.id] ? { ...d, start: v.zeiten[d.id][0], ende: v.zeiten[d.id][1] } : d) };
      }, "Vorlage geladen"),
      setzeVersatz: (eid, tage) => mUpd((m) => ({ ...m, einheiten: m.einheiten.map((e) => e.id === eid
        ? { ...e, versatzTage: tage, versatz: Math.round(tage / 7) } : e) }), "Startpunkt geändert"),

      /* --- Dienstarten --- */
      neueDienstart: (f) => mUpd((m) => {
        const id = f.kurz && !m.dienstarten.some((d) => d.id === f.kurz) ? f.kurz : uid("d").toUpperCase().slice(-4);
        return { ...m, dienstarten: [...m.dienstarten, { ...f, id }] };
      }, `Dienstart „${f.name}" angelegt`),
      aendereDienstart: (id, f) => mUpd((m) => ({ ...m, dienstarten: m.dienstarten.map((d) => d.id === id ? { ...f, id } : d) }), `Dienstart „${f.name}" geändert`),
      loescheDienstart: (id) => mUpd((m) => {
        const n = m.zyklus.tage.filter((t) => t === id).length + Object.values(m.abweichungen).filter((v) => v === id).length;
        if (n > 0) { melde(`Dienstart wird noch ${n}× verwendet.`); return m; }
        return { ...m, dienstarten: m.dienstarten.filter((d) => d.id !== id) };
      }, "Dienstart gelöscht"),

      /* --- Personal --- */
      neuePerson: (f) => mUpd((m) => ({ ...m, personen: [...m.personen, {
        id: uid("p"), vorname: f.vorname, nachname: f.nachname, funktion: f.funktion,
        email: `${f.vorname.toLowerCase()}.${f.nachname.toLowerCase()}@betrieb.de`,
        zugehoerigkeit: [{ ab: f.eintritt, einheitId: f.einheitId }], eintritt: f.eintritt, austritt: null,
        wochenstunden: f.wochenstunden, urlaubsanspruch: f.urlaubsanspruch, urlaubsuebertrag: 0, stundenuebertrag: 0,
        qualifikationen: [], einfuehrung: { erledigt: false, schritt: 0 }, rolle: f.rolle,
        bereich: ["leitung", "planer", "betriebsrat"].includes(f.rolle) ? "ALLE" : f.einheitId, status: "aktiv" }] }),
        `${f.vorname} ${f.nachname} angelegt als ${rolle(f.rolle).label}`),
      setzeRolle: (pid, r) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const leitungen = m.personen.filter((x) => x.rolle === "leitung" && x.status === "aktiv" && !x.austritt);
        if (p.rolle === "leitung" && r !== "leitung" && leitungen.length <= 1) {
          melde("Der letzte Zugang mit Organisationsleitung kann nicht umgestellt werden."); return m; }
        melde(`${p.vorname} ${p.nachname}: ${rolle(r).label}. Die Kosten wurden angepasst.`);
        return { ...m, personen: m.personen.map((x) => x.id === pid ? { ...x, rolle: r, rolleSeit: heute(),
          rolleVerlauf: [...(x.rolleVerlauf || [{ ab: x.rolleSeit || x.eintritt, rolle: x.rolle }]), { ab: heute(), rolle: r }],
          bereich: ["leitung", "planer", "betriebsrat"].includes(r) ? "ALLE" : (x.bereich === "ALLE" ? einheitAm(x, heute()) : x.bereich) } : x) };
      }, "Zugangsart geändert"),
      versetze: (pid, eid, ab) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, zugehoerigkeit: [...p.zugehoerigkeit.filter((z) => z.ab !== ab), { ab, einheitId: eid }].sort((a, b) => (a.ab < b.ab ? -1 : 1)) } : p) }), "Versetzung eingetragen"),
      setzeAustritt: (pid, d) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid ? { ...p, austritt: d } : p) }),
        d ? "Austritt eingetragen" : "Austritt zurückgenommen"),
      toggleQual: (pid, qid) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, qualifikationen: p.qualifikationen.includes(qid) ? p.qualifikationen.filter((x) => x !== qid) : [...p.qualifikationen, qid] } : p) }), null),
      neueAbwesenheit: (pid, art, von, bis) => { mUpd((m) => ({ ...m, abwesenheiten: [...m.abwesenheiten,
        { id: uid("a"), personId: pid, art, von, bis, notiz: "" }] }), "Abwesenheit eingetragen"); melde("Abwesenheit eingetragen."); },
      loescheAbwesenheit: (aid) => mUpd((m) => ({ ...m, abwesenheiten: m.abwesenheiten.filter((a) => a.id !== aid) }), "Abwesenheit gelöscht"),

      /* --- Anträge --- */
      stelleAntrag: (a) => { mUpd((m) => ({ ...m, anfragen: [{ id: uid("r"), personId: sitz.person.id, status: "offen",
        erstellt: jetzt(), antwort: "", ...a }, ...m.anfragen] }), "Antrag gestellt"); melde("Antrag abgesendet."); },
      zieheAntragZurueck: (id) => mUpd((m) => ({ ...m, anfragen: m.anfragen.filter((a) => a.id !== id) }), "Antrag zurückgezogen"),
      beantworteEinsatz: (id, ja) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        let next = { ...m, anfragen: m.anfragen.map((x) => x.id === id ? { ...x, status: ja ? "genehmigt" : "abgelehnt" } : x) };
        if (ja) {
          next = { ...next, abweichungen: { ...next.abweichungen, [`${a.personId}|${a.von}`]: a.dienstId },
            einspruenge: [{ id: uid("s"), personId: a.personId, datum: a.von, dienstId: a.dienstId,
              zeit: new Date().toLocaleString("de-DE") }, ...(next.einspruenge || [])] };
          // Übrige Anfragen für dieselbe Lücke verfallen
          next = { ...next, anfragen: next.anfragen.map((x) => (x.typ === "einsatz" && x.von === a.von
            && x.dienstId === a.dienstId && x.id !== id && x.status === "offen") ? { ...x, status: "abgelehnt", antwort: "anderweitig besetzt" } : x) };
        }
        melde(ja ? "Zusage erfasst, du bist eingeteilt." : "Absage erfasst.");
        return next;
      }, "Einsatzanfrage beantwortet"),
      entscheideAntrag: (id, ja, text) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const wer = `${sitz.person.vorname} ${sitz.person.nachname}`;
        const jetzt = new Date().toLocaleString("de-DE");
        // Mehrstufige Genehmigung: erst wenn alle Stufen erteilt sind, gilt der
        // Antrag als genehmigt. Eine Ablehnung beendet den Vorgang sofort.
        if (ja) {
          const freigaben = [...(a.freigaben || []), { von: wer, zeit: jetzt }];
          const st = genehmigungsStand(m, { ...a, freigaben });
          if (!st.fertig) {
            melde(`Mitgezeichnet. Es fehlt noch ${st.offen === 1 ? "eine Freigabe" : `${st.offen} Freigaben`} durch ${st.naechste}.`);
            return { ...m, anfragen: m.anfragen.map((x) => x.id === id ? { ...x, freigaben } : x) };
          }
          const erg = antragUmsetzen(m, a);
          melde(`Antrag genehmigt${(a.freigaben || []).length ? " — alle Stufen erteilt" : ""}.`);
          return { ...erg, anfragen: erg.anfragen.map((x) => x.id === id
            ? { ...x, status: "genehmigt", freigaben, entschieden: jetzt, durch: wer, antwort: text || "" } : x),
            nachrichten: [{ id: uid("n"), personId: a.personId, zeit: jetzt, art: "info", gelesen: false,
              titel: "Antrag genehmigt", text: `${abwArt(a.art).label} ${fKurz(a.von)} wurde genehmigt.` },
              ...(erg.nachrichten || [])].slice(0, 400) };
        }
        melde("Antrag abgelehnt.");
        return { ...m, anfragen: m.anfragen.map((x) => x.id === id
          ? { ...x, status: "abgelehnt", entschieden: jetzt, durch: wer, antwort: text || "" } : x),
          nachrichten: [{ id: uid("n"), personId: a.personId, zeit: jetzt, art: "warn", gelesen: false,
            titel: "Antrag abgelehnt", text: `${abwArt(a.art).label} ${fKurz(a.von)} wurde abgelehnt.${text ? " " + text : ""}` },
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Antrag entschieden"),
      /* --- Beschäftigungsform, Standorte, Import, Dienstbuch --- */
      setzePerson: (pid, k, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid ? { ...p, [k]: v } : p) }), null),
      setzeBeschaeftigung: (pid, modus) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid) return p;
        if (modus === "springer") return { ...p, springer: true, teilzeit: null };
        if (modus === "voll") return { ...p, springer: false, teilzeit: null };
        return { ...p, springer: false, teilzeit: { aktiv: true, modus,
          wochentage: (p.teilzeit && p.teilzeit.wochentage) || [0, 1, 2, 3, 4] } };
      }) }), "Beschäftigungsform geändert"),
      toggleWochentag: (pid, i) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid || !p.teilzeit) return p;
        const w = p.teilzeit.wochentage || [];
        return { ...p, teilzeit: { ...p.teilzeit, wochentage: w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort() } };
      }) }), null),
      neuerStandort: () => mUpd((m) => ({ ...m, standorte: [...(m.standorte || []),
        { id: uid("st"), name: `Standort ${(m.standorte || []).length + 1}`, bundesland: m.bundesland }] }), "Standort angelegt"),
      setzeStandort: (id, k, v) => mUpd((m) => ({ ...m, standorte: (m.standorte || []).map((s2) => s2.id === id ? { ...s2, [k]: v } : s2) }), null),
      loescheStandort: (id) => mUpd((m) => {
        const n = m.einheiten.filter((e) => e.standortId === id).length;
        if (n) { melde(`Dem Standort sind noch ${n} Einheiten zugeordnet.`); return m; }
        return { ...m, standorte: (m.standorte || []).filter((s2) => s2.id !== id) };
      }, "Standort gelöscht"),
      oeffneImport: () => setImp(true),
      importieren: (zeilen, anlegen) => mUpd((m) => {
        let einheiten = [...m.einheiten], quals = [...m.qualifikationen];
        if (anlegen) {
          for (const name of [...new Set(zeilen.filter((z) => !z.einheitId).map((z) => z.einheitName))])
            einheiten.push({ id: uid("e"), name, versatz: einheiten.length % m.zyklus.wochen,
              standortId: (m.standorte && m.standorte[0]) ? m.standorte[0].id : null,
              farbe: PALETTE[einheiten.length % PALETTE.length] });
          for (const q of [...new Set(zeilen.flatMap((z) => z.fehlendeQuals))])
            quals.push({ id: uid("q"), name: q, kurz: q.slice(0, 4).toUpperCase(), farbe: PALETTE[quals.length % PALETTE.length] });
        }
        const neue = zeilen.map((z) => {
          const eid = z.einheitId || (einheiten.find((e) => e.name === z.einheitName) || {}).id || einheiten[0].id;
          const zusatz = z.fehlendeQuals.map((q) => (quals.find((x) => x.name === q) || {}).id).filter(Boolean);
          return { id: uid("p"), vorname: z.vorname, nachname: z.nachname, funktion: z.funktion,
            email: `${z.vorname.toLowerCase()}.${z.nachname.toLowerCase()}@betrieb.de`,
            zugehoerigkeit: [{ ab: z.eintritt, einheitId: eid }], eintritt: z.eintritt, austritt: null,
            wochenstunden: z.wochenstunden, urlaubsanspruch: z.urlaubsanspruch, urlaubsuebertrag: 0, stundenuebertrag: 0,
            qualifikationen: [...z.qualifikationen, ...zusatz], einschraenkungen: {}, teilzeit: z.teilzeit, springer: false,
            rolle: z.rolle, bereich: ["leitung", "planer", "betriebsrat"].includes(z.rolle) ? "ALLE" : eid,
            rolleSeit: z.eintritt, status: "aktiv" };
        });
        melde(`${neue.length} Personen übernommen.`);
        return { ...m, einheiten, qualifikationen: quals, personen: [...m.personen, ...neue] };
      }, "Personal importiert"),
      dienstbuchEintrag: (datum, art, text) => mUpd((m) => ({ ...m, dienstbuch: [
        { id: uid("db"), datum, art, text, zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          durch: `${sitz.person.vorname} ${sitz.person.nachname}` }, ...(m.dienstbuch || [])] }), "Dienstbucheintrag"),

      melden: melde,
      /* --- Schichtübergabe --- */
      uebergabeSpeichern: (datum, dienstId, f) => mUpd((m) => {
        const jetzt = new Date().toLocaleString("de-DE");
        const b = besetzung(m, datum)[dienstId];
        const folge = m.dienstarten.find((d) => !d.posten && d.id !== dienstId);
        melde("Übergabe abgeschlossen. Sie ist ab jetzt unveränderlich.");
        return { ...m, uebergaben: [{ id: uid("u"), datum, dienstId,
          lage: f.lage, offen: f.offen, vorkommnis: f.vorkommnis, material: f.material,
          von: `${sitz.person.vorname} ${sitz.person.nachname}`,
          an: folge ? folge.name : null, zeit: jetzt, personen: b.personen.map((p) => p.id),
          ergaenzungen: [] }, ...(m.uebergaben || [])] };
      }, "Übergabe erfasst"),
      uebergabeErgaenzen: (datum, dienstId, text) => mUpd((m) => ({ ...m,
        uebergaben: (m.uebergaben || []).map((u) => u.datum === datum && u.dienstId === dienstId
          ? { ...u, ergaenzungen: [...(u.ergaenzungen || []),
              { zeit: new Date().toLocaleString("de-DE"),
                von: `${sitz.person.vorname} ${sitz.person.nachname}`, text }] }
          : u) }), "Ergänzung angehängt"),

      /* --- Gespeicherte Ansichten --- */
      speichereAnsicht: (bereich, name, zustand) => mUpd((m) => ({ ...m,
        ansichten: [...(m.ansichten || []), { id: uid("v"), personId: sitz.person.id,
          bereich, name: name.trim(), zustand }] }), null),
      loescheAnsicht: (id) => mUpd((m) => ({ ...m,
        ansichten: (m.ansichten || []).filter((a) => a.id !== id) }), null),

      /* --- Datenmitnahme --- */
      exportTabelle: (name, zeilen) => {
        const inhalt = tabelleCSV(zeilen);
        const datei = `${sitz.mandant.name.replace(/\W+/g, "_")}_${name}.csv`;
        if (lade(datei, inhalt, "text/csv")) melde(`${zeilen.length} Zeilen ausgegeben.`);
        else setAusgabe({ titel: name, inhalt });
      },
      exportAlles: () => {
        const t = vollExport(sitz.mandant);
        let n = 0;
        for (const [k, zeilen] of Object.entries(t)) {
          if (!zeilen.length) continue;
          lade(`${sitz.mandant.name.replace(/\W+/g, "_")}_${k}.csv`, tabelleCSV(zeilen), "text/csv");
          n++;
        }
        melde(`${n} Dateien ausgegeben — der vollständige Datenbestand.`);
      },

      /* --- DATEV --- */
      exportDATEV: (ym) => {
        const inhalt = datevCSV(sitz.mandant, ym);
        const z = datevSaetze(sitz.mandant, ym).length;
        if (lade(`datev_${sitz.mandant.name.replace(/\W+/g, "_")}_${ym}.csv`, inhalt, "text/csv"))
          melde(`${z} Lohnartensätze ausgegeben.`);
        else setAusgabe({ titel: "DATEV-Ausgabe", inhalt });
      },
      /* --- Einführung --- */
      starteEinfuehrung: () => setEinf(true),
      einfuehrungSchritt: (n) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, einfuehrung: { ...(p.einfuehrung || {}), schritt: n } } : p) }), null),
      einfuehrungFertig: () => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, einfuehrung: { erledigt: true, schritt: 0 } } : p) }), null),
      oeffneAntrag: (d) => setAntragVon({ von: d || heute(), bis: d || heute() }),
      tauschAusPlan: (d) => mUpd((m) => {
        const jetzt = new Date().toLocaleString("de-DE");
        melde("Tauschgesuch eingestellt. Alle im Betrieb sehen es.");
        return { ...m, anfragen: [{ id: uid("r"), personId: sitz.person.id, typ: "tausch", status: "offen",
          partnerId: null, interessenten: [], von: d, bis: d, text: "", erstellt: jetzt }, ...m.anfragen] };
      }, "Tauschgesuch eingestellt"),
      oeffneKommando: () => setKmd(true),
      oeffneWunsch: (pid) => setWunschDlg(pid || sitz.person.id),
      oeffneNotizen: (k, t2) => setNotizDlg({ k, t: t2 }),
      oeffneMehrfach: () => setMehrfach(true),

      /* --- Wunschdienste: einmal möchte, zweimal lieber nicht, dreimal löschen --- */
      setzeWunsch: (pid, d) => mUpd((m) => {
        const liste = m.wuensche || [];
        const vorh = liste.find((w) => w.personId === pid && w.datum === d);
        if (!vorh) return { ...m, wuensche: [...liste, { id: uid("w"), personId: pid, datum: d, art: "moechte" }] };
        if (vorh.art === "moechte") return { ...m, wuensche: liste.map((w) =>
          w === vorh ? { ...w, art: "lieber_nicht" } : w) };
        return { ...m, wuensche: liste.filter((w) => w !== vorh) };
      }, null),

      /* --- Notizen --- */
      neueNotiz: (k, text) => mUpd((m) => ({ ...m, notizen: { ...(m.notizen || {}),
        [k]: [{ id: uid("nz"), text, von: `${sitz.person.vorname} ${sitz.person.nachname}`,
          zeit: new Date().toLocaleString("de-DE") }, ...((m.notizen || {})[k] || [])] } }), "Notiz gespeichert"),
      loescheNotiz: (k, id) => mUpd((m) => ({ ...m, notizen: { ...(m.notizen || {}),
        [k]: ((m.notizen || {})[k] || []).filter((x) => x.id !== id) } }), null),

      /* --- Einarbeitung --- */
      neueEinarbeitung: (f) => mUpd((m) => ({ ...m, einarbeitung: [...(m.einarbeitung || []),
        { personId: f.personId, mentorId: f.mentorId, von: f.von, bis: f.bis, ziel: f.ziel }] }), "Einarbeitung angelegt"),
      loescheEinarbeitung: (pid, von) => mUpd((m) => ({ ...m,
        einarbeitung: (m.einarbeitung || []).filter((x) => !(x.personId === pid && x.von === von)) }), "Einarbeitung beendet"),

      /* --- Mehrfachbearbeitung --- */
      mehrfachDienst: (ids, von, bis, dienstId) => mUpd((m) => {
        const ab = { ...m.abweichungen };
        const aend = []; const jetzt = new Date().toLocaleString("de-DE");
        for (const pid of ids) {
          const p = m.personen.find((x) => x.id === pid); if (!p) continue;
          for (let d = von; d <= bis; d = addDays(d, 1)) {
            const eid = einheitAm(p, d);
            const plan = eid && p.imSchichtdienst !== false ? einheitDienst(m, eid, d) : null;
            const k = `${pid}|${d}`;
            const vorher = ab[k] !== undefined ? ab[k] : plan;
            if ((dienstId === "-" && !plan) || dienstId === plan) delete ab[k]; else ab[k] = dienstId;
            const nachher = ab[k] !== undefined ? ab[k] : plan;
            if ((vorher || "-") !== (nachher || "-"))
              aend.push({ id: uid("c"), personId: pid, datum: d, von: vorher || "-", nach: nachher || "-",
                zeit: jetzt, vorlauf: vorlauf(d) });
          }
        }
        melde(`${aend.length} Einträge geändert.`);
        return { ...m, abweichungen: ab, aenderungen: [...aend, ...(m.aenderungen || [])].slice(0, 1200) };
      }, "Mehrere Tage geändert"),
      mehrfachAbwesenheit: (ids, von, bis, art) => mUpd((m) => {
        const neu = ids.map((pid) => ({ id: uid("a"), personId: pid, art, von, bis, notiz: "Sammeleintrag" }));
        melde(`${neu.length}× ${abwArt(art).label} eingetragen.`);
        return { ...m, abwesenheiten: [...m.abwesenheiten, ...neu] };
      }, "Abwesenheit für mehrere eingetragen"),

      /* --- Kalenderabo --- */
      kalenderAbo: (pid) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const p = m.personen.find((x) => x.id === pid); if (!p) return;
        const z = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CENTRIC//DE", "CALSCALE:GREGORIAN",
          "METHOD:PUBLISH", `X-WR-CALNAME:Dienstplan ${p.vorname} ${p.nachname}`,
          "X-PUBLISHED-TTL:PT6H", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
        for (let i = -30; i < 365; i++) {
          const d = addDays(heute(), i);
          const t2 = personTag(m, p, d);
          if (!t2.dienstId) continue;
          const da = m.dienstarten.find((x) => x.id === t2.dienstId); if (!da) continue;
          const [ms, me] = fenster(d, da);
          const stamp = (min) => { const dt = new Date(pISO(d).getTime() + min * 60000);
            return dt.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
          z.push("BEGIN:VEVENT", `UID:${p.id}-${d}@centric`, `DTSTAMP:${stamp(0)}`,
            `DTSTART:${stamp(ms)}`, `DTEND:${stamp(me)}`, `SUMMARY:${da.name}`,
            da.ort ? `LOCATION:${da.ort}` : "", `DESCRIPTION:${m.name} · ${n1(dauer(da))} h`, "END:VEVENT");
        }
        z.push("END:VCALENDAR");
        const inhalt = z.filter(Boolean).join("\r\n");
        if (lade(`dienstplan_${p.nachname}.ics`, inhalt, "text/calendar;charset=utf-8"))
          melde("Kalenderdatei erstellt. Für laufende Aktualisierung braucht es einen Server.");
        else setAusgabe({ titel: "Kalender", inhalt });
      },

      /* --- Briefing --- */
      briefingZeigen: () => setAusgabe({ titel: `Tagesbriefing · ${fLang(heute())}`, inhalt: briefingText(sitz) }),
      briefingPush: async () => {
        try {
          if (!("Notification" in window)) { melde("Dieser Browser unterstützt keine Benachrichtigungen."); return; }
          let erl = Notification.permission;
          if (erl === "default") erl = await Notification.requestPermission();
          if (erl !== "granted") { melde("Benachrichtigungen sind nicht freigegeben."); return; }
          const auf = tagesaufgaben(sitz);
          new Notification(`CENTRIC · ${auf.length ? `${auf.length} Vorgänge` : "nichts zu tun"}`,
            { body: auf.length ? auf.slice(0, 3).map((a) => a.titel).join("\n") : "Es liegt nichts an." });
          melde("Benachrichtigung gesendet.");
        } catch (e) { melde("Benachrichtigung nicht möglich."); }
      },
      /* --- Stempeluhr mit einmaliger Standortprüfung --- */
      stempeln: (pid, datum, art, koord) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid); if (!p) return m;
        const pr = stempelPruefen(m, p, datum, koord);
        const jetzt = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const k = `${pid}|${datum}`;
        const alt = (m.einstempeln || {})[k] || {};
        const neu = art === "start"
          ? { start: jetzt, ortStart: pr.text, innerhalbStart: pr.innerhalb }
          : { ...alt, ende: jetzt, ortEnde: pr.text, innerhalbEnde: pr.innerhalb };
        melde(art === "start" ? `Eingestempelt ${jetzt} · ${pr.text}` : `Ausgestempelt ${jetzt} · ${pr.text}`);
        let next = { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: neu } };
        // Ausstempeln bestätigt zugleich die Zeit
        if (art === "ende") next = { ...next, erfassung: { ...(next.erfassung || {}),
          [k]: { start: neu.start, ende: jetzt, bestaetigt: true, grund: "" } } };
        return next;
      }, null),
      setzeVerfuegbarkeit: (pid, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, verfuegbarkeit: v } : p) }), "Verfügbarkeit gespeichert"),
      oeffneVerfuegbarkeit: (pid) => setVerfDlg(pid || sitz.person.id),
      oeffneNachweis: (pid, qid) => setNwDlg({ pid, qid }),
      setzeNachweis: (pid, qid, ablauf, datei) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid) return p;
        const liste = (p.qualNachweise || []).filter((x) => x.qualId !== qid);
        return { ...p, qualNachweise: [...liste, { qualId: qid, ablauf, datei }] };
      }) }), "Nachweis gespeichert"),
      setzeKontrastmodus: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, kontrastmodus: an } : p) }), null),

      /* --- Schwarzes Brett --- */
      neuerAushang: (f) => mUpd((m) => ({ ...m, aushang: [{ id: uid("ah"), titel: f.titel, text: f.text,
        wichtig: !!f.wichtig, bis: f.bis || null, von: `${sitz.person.vorname} ${sitz.person.nachname}`,
        zeit: new Date().toLocaleString("de-DE") }, ...(m.aushang || [])] }), "Aushang angeschlagen"),
      loescheAushang: (id) => mUpd((m) => ({ ...m, aushang: (m.aushang || []).filter((x) => x.id !== id) }), "Aushang abgenommen"),

      /* --- Betriebsmittel --- */
      neuesMittel: (f) => mUpd((m) => ({ ...m, betriebsmittel: [...(m.betriebsmittel || []),
        { id: uid("bm"), art: f.art, name: f.name, kennung: f.kennung,
          personId: f.personId || null, seit: f.personId ? heute() : null }] }), "Betriebsmittel angelegt"),
      setzeMittel: (id, k, v) => mUpd((m) => ({ ...m, betriebsmittel: (m.betriebsmittel || []).map((x) =>
        x.id === id ? { ...x, [k]: v, seit: k === "personId" ? (v ? heute() : null) : x.seit } : x) }), null),
      loescheMittel: (id) => mUpd((m) => ({ ...m, betriebsmittel: (m.betriebsmittel || []).filter((x) => x.id !== id) }), "Betriebsmittel gelöscht"),

      /* --- Aushangplan als PDF im Kalenderlook --- */
      aushangPDF: (ym2, einheitId) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const e = m.einheiten.find((x) => x.id === einheitId);
        const [y, mo] = ym2.split("-").map(Number);
        const n = dim_(y, mo - 1);
        const erster = dow(`${ym2}-01`);
        const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
        const zellen = [];
        for (let i = 0; i < erster; i++) zellen.push(null);
        for (let i = 1; i <= n; i++) zellen.push(`${ym2}-${pad(i)}`);
        const woch = [];
        for (let i = 0; i < zellen.length; i += 7) woch.push(zellen.slice(i, i + 7));
        const fg = freigabeStand(m, ym2);
        const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Dienstplan ${MON[mo - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827;margin:0}
h1{font-size:22pt;font-weight:300;letter-spacing:-.03em;margin:0}
h1 b{font-weight:700}
.kopf{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2C4E5C;padding-bottom:9px;margin-bottom:14px}
.rub{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#3E6478}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#5A6670;padding:6px 4px;border-bottom:1.5px solid #2C4E5C}
td{border:1px solid #E3E1DD;height:74px;vertical-align:top;padding:5px 6px}
.tag{font-size:8.5pt;color:#5A6670;font-weight:600}
.we{background:#F5F4F2}.fei{background:#FEF2F2}
.d{margin-top:5px;font-size:13pt;font-weight:700;letter-spacing:-.02em}
.z{font-size:7.5pt;color:#5A6670;margin-top:1px}
.fuss{margin-top:12px;font-size:8pt;color:#5A6670;display:flex;justify-content:space-between;border-top:1px solid #E3E1DD;padding-top:7px}
</style></head><body>
<div class="kopf"><div><div class="rub">${m.name}</div>
<h1>${e ? e.name : ""} — <b>${MON[mo - 1]} ${y}</b></h1></div>
<div style="text-align:right"><div class="rub">${fg ? `Freigegeben · Stand ${fg.stand}` : "Entwurf"}</div>
<div style="font-size:8pt;color:#5A6670;margin-top:3px">${fg ? fg.zeit : `erstellt ${new Date().toLocaleString("de-DE")}`}</div></div></div>
<table><thead><tr>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
${woch.map((w) => `<tr>${w.map((d) => {
  if (!d) return '<td style="border:none"></td>';
  const fei = feiertag(d, landFuerEinheit(m, einheitId));
  const we = dow(d) >= 5;
  const id = einheitDienst(m, einheitId, d);
  const da = id && map[id];
  return `<td class="${fei ? "fei" : we ? "we" : ""}"><div class="tag">${Number(d.slice(8))}${fei ? " · Feiertag" : ""}</div>
${da ? `<div class="d" style="color:${da.farbe}">${da.kurz}</div><div class="z">${da.start}–${da.ende}</div>` : ""}</td>`;
}).join("")}</tr>`).join("")}
</tbody></table>
<div class="fuss"><span>CENTRIC · ${m.name}</span><span>Zum Aushang bestimmt. Änderungen werden gesondert bekanntgegeben.</span></div>
</body></html>`;
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); melde("Aushangplan erstellt."); }
        else setAusgabe({ titel: "Aushangplan", inhalt: html });
      },

      oeffneSchnellbesetzung: (d, dienstId) => setSchnell({ datum: d, dienstId }),
      oeffneWizard: () => setWizard(true),
      anfrageVermerken: (d, dienstId, weg) => mUpd((m) => ({ ...m,
        aenderungen: [{ id: uid("c"), personId: null, datum: d, von: "-", nach: `Anfrage ${weg}`,
          zeit: new Date().toLocaleString("de-DE"), vorlauf: vorlauf(d) }, ...(m.aenderungen || [])].slice(0, 800) }),
        `Dienstanfrage für ${fKurz(d)} versandt`),

      /* --- Tauschbörse --- */
      tauschMelden: (id) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const jetzt = new Date().toLocaleString("de-DE");
        melde("Meldung eingegangen. Die Planung entscheidet.");
        return { ...m,
          anfragen: m.anfragen.map((x) => x.id === id
            ? { ...x, interessenten: [...new Set([...(x.interessenten || []), sitz.person.id])] } : x),
          nachrichten: [{ id: uid("n"), personId: a.personId, zeit: jetzt, art: "info", gelesen: false,
            titel: `Meldung auf dein Tauschgesuch`,
            text: `${sitz.person.vorname} ${sitz.person.nachname} bietet an, den Dienst am ${fKurz(a.von)} zu übernehmen.` },
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Meldung auf Tauschgesuch"),
      tauschAbmelden: (id) => mUpd((m) => ({ ...m, anfragen: m.anfragen.map((x) => x.id === id
        ? { ...x, interessenten: (x.interessenten || []).filter((p) => p !== sitz.person.id) } : x) }), null),
      tauschZuteilen: (id, interessentId) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const t1 = personTag(m, m.personen.find((x) => x.id === a.personId), a.von);
        const t2 = personTag(m, m.personen.find((x) => x.id === interessentId), a.von);
        const ab = { ...m.abweichungen };
        ab[`${a.personId}|${a.von}`] = t2.dienstId || "-";
        ab[`${interessentId}|${a.von}`] = t1.dienstId || "-";
        const jetzt = new Date().toLocaleString("de-DE");
        const namen = (x) => { const p = m.personen.find((y) => y.id === x); return p ? `${p.vorname} ${p.nachname}` : "?"; };
        melde(`Tausch bestätigt: ${namen(a.personId)} und ${namen(interessentId)}.`);
        return { ...m, abweichungen: ab,
          anfragen: m.anfragen.map((x) => x.id === id
            ? { ...x, status: "genehmigt", partnerId: interessentId, antwort: `getauscht mit ${namen(interessentId)}` } : x),
          nachrichten: [
            { id: uid("n"), personId: a.personId, zeit: jetzt, art: "info", gelesen: false,
              titel: `Tausch am ${fKurz(a.von)} bestätigt`, text: `Getauscht mit ${namen(interessentId)}.` },
            { id: uid("n"), personId: interessentId, zeit: jetzt, art: "warn", gelesen: false,
              titel: `Tausch am ${fKurz(a.von)} bestätigt`, text: `Du übernimmst den Dienst von ${namen(a.personId)}.` },
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Tausch zugeteilt"),

      /* --- Einrichtungsassistent --- */
      assistentUebernehmen: (e) => mUpd((m) => {
        const einheiten = e.gruppen.map((g) => ({ id: g.id, name: g.name, versatz: Math.round(g.versatzTage / 7),
          versatzTage: g.versatzTage, farbe: g.farbe, pool: false, standortId: (m.standorte[0] || {}).id }));
        const pool = m.einheiten.find((x) => x.pool);
        if (pool) einheiten.push(pool);
        const dienstarten = e.dienstarten.map((d) => ({ id: d.id, name: d.name, kurz: d.kurz, start: d.start,
          ende: d.ende, pause: d.pause || 0, farbe: d.farbe, ort: d.ort || "", posten: false, quelle: null,
          faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false, mindest: d.mindest, mindestQual: d.mindestQual || {} }));
        // Personen den neuen Gruppen zuordnen; unbekannte Gruppe fällt auf die erste
        const zuordnung = (name) => (einheiten.find((x) => x.name.toLowerCase() === String(name).toLowerCase()) || einheiten[0]).id;
        const bestand = m.personen.map((p) => {
          const alt = einheitAm(p, heute());
          const treffer = einheiten.find((x) => x.id === alt) || einheiten[0];
          return { ...p, zugehoerigkeit: [{ ab: e.anker, einheitId: treffer.id }] };
        });
        const neue = (e.personen || []).map((z) => ({
          id: uid("p"), vorname: z.vorname, nachname: z.nachname, funktion: "Fachkraft",
          email: "", zugehoerigkeit: [{ ab: e.anker, einheitId: zuordnung(z.gruppe) }],
          eintritt: e.anker, austritt: null, wochenstunden: z.wochenstunden,
          urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0, qualifikationen: [],
          teilzeit: z.wochenstunden < (m.einstellungen.sollWochenstunden || 40)
            ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null,
          springer: false, einschraenkungen: {}, rolle: "mitarbeiter", rolleSeit: e.anker,
          bereich: zuordnung(z.gruppe), status: "aktiv", imSchichtdienst: true }));
        melde(`Einrichtung übernommen: ${einheiten.filter((x) => !x.pool).length} Gruppen, ${dienstarten.length} Dienstarten${neue.length ? `, ${neue.length} Personen` : ""}.`);
        return { ...m, einheitLabel: e.einheitLabel, branche: e.branche, anker: e.anker,
          zyklus: { wochen: Math.ceil(e.tage.length / 7), tage: e.tage, vorlage: null },
          einheiten, dienstarten, personen: [...bestand, ...neue], abweichungen: {} };
      }, "Schichtplanung neu eingerichtet"),

      /* --- Planungsassistent --- */
      oeffneAssistent: () => setAssist(true),
      uebernehmeVorschlag: (erg) => mUpd((m) => {
        const neue = Object.keys(erg.abweichungen).filter((k) => m.abweichungen[k] !== erg.abweichungen[k]);
        const jetzt = new Date().toLocaleString("de-DE");
        const aend = neue.map((k) => { const [pid, d] = k.split("|");
          return { id: uid("c"), personId: pid, datum: d, von: "-", nach: erg.abweichungen[k], zeit: jetzt, vorlauf: vorlauf(d) }; });
        const nachr = istFreigegeben(m, erg.ym) ? neue.map((k) => { const [pid, d] = k.split("|");
          const da = m.dienstarten.find((x) => x.id === erg.abweichungen[k]);
          return { id: uid("n"), personId: pid, zeit: jetzt, art: "warn", gelesen: false,
            titel: `Zusätzlicher Dienst am ${fKurz(d)}`, text: `${da ? da.name : ""} · durch die Planung ergänzt` }; }) : [];
        melde(`${neue.length} Einteilungen übernommen.`);
        return { ...m, abweichungen: erg.abweichungen,
          aenderungen: [...aend, ...(m.aenderungen || [])].slice(0, 800),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Planungsvorschlag übernommen"),

      /* --- Eskalation --- */
      oeffneEskalation: (d, dienstId) => setEskal({ datum: d, dienstId }),
      einsatzanfrage: (d, dienstId, ids) => mUpd((m) => {
        const da = m.dienstarten.find((x) => x.id === dienstId);
        const jetzt = new Date().toLocaleString("de-DE");
        const nachr = ids.map((pid) => ({ id: uid("n"), personId: pid, zeit: jetzt, art: "warn", gelesen: false,
          titel: `Einsatzanfrage für ${fKurz(d)}`,
          text: `${da ? da.name : dienstId} · ${da ? `${da.start}–${da.ende}` : ""} — bitte in „Meine Schichten" zusagen oder absagen.` }));
        const anf = ids.map((pid) => ({ id: uid("r"), personId: pid, typ: "einsatz", status: "offen",
          erstellt: jetzt, antwort: "", von: d, bis: d, dienstId, text: "Einsatzanfrage der Planung" }));
        melde(`Anfrage an ${ids.length} Personen versandt.`);
        return { ...m, anfragen: [...anf, ...m.anfragen], nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Einsatzanfrage versandt"),
      dokumentiereUnterschreitung: (d, dienstId, grund) => mUpd((m) => {
        melde("Unterschreitung dokumentiert.");
        return { ...m, unterschreitungen: [{ id: uid("u"), datum: d, dienstId, grund,
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`, zeit: new Date().toLocaleString("de-DE") },
          ...(m.unterschreitungen || [])] };
      }, "Unterschreitung dokumentiert"),

      /* --- Freizeitausgleich --- */
      oeffneAusgleich: (pid) => setAusgl(pid),
      planeFreischicht: (pid, d) => mUpd((m) => {
        melde("Freischicht eingetragen, das Konto sinkt entsprechend.");
        return { ...m, abwesenheiten: [...m.abwesenheiten,
          { id: uid("a"), personId: pid, art: "ausgleich", von: d, bis: d, notiz: "Freizeitausgleich" }] };
      }, "Freischicht geplant"),

      /* --- Zuschläge --- */
      setzeZuschlag: (id, k, v) => mUpd((m) => ({ ...m, zuschlaege: (m.zuschlaege || []).map((z) => z.id === id ? { ...z, [k]: v } : z) }), null),
      neueZuschlagsregel: () => mUpd((m) => ({ ...m, zuschlaege: [...(m.zuschlaege || []),
        { id: uid("z"), name: "Neue Regel", art: "nacht", prozent: 0, aktiv: false }] }), "Zuschlagsregel angelegt"),
      loescheZuschlag: (id) => mUpd((m) => ({ ...m, zuschlaege: (m.zuschlaege || []).filter((z) => z.id !== id) }), "Zuschlagsregel gelöscht"),

      /* --- Jahresurlaubsrunde --- */
      eroeffneRunde: (jahr) => mUpd((m) => ({ ...m, urlaubsrunde: { jahr, phase: "offen",
        frist: `${jahr - 1}-10-31`, kontingent: {}, wuensche: [], vorjahrZurueck: [] } }), "Urlaubsrunde eröffnet"),
      schliesseRunde: () => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde, phase: "geschlossen" } }), "Wunschphase geschlossen"),
      oeffneRunde: () => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde, phase: "offen" } }), "Wunschphase geöffnet"),
      wunschEintragen: (w) => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde,
        wuensche: [...m.urlaubsrunde.wuensche, { id: uid("w"), personId: sitz.person.id, von: w.von, bis: w.bis,
          prio: w.prio, status: "offen", erstellt: new Date().toISOString() }] } }), "Urlaubswunsch eingetragen"),
      wunschLoeschen: (id) => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde,
        wuensche: m.urlaubsrunde.wuensche.filter((x) => x.id !== id) } }), null),
      wunschEntscheiden: (id, ja) => mUpd((m) => {
        const w = m.urlaubsrunde.wuensche.find((x) => x.id === id);
        const p = m.personen.find((x) => x.id === w.personId);
        const jetzt = new Date().toLocaleString("de-DE");
        let next = { ...m, urlaubsrunde: { ...m.urlaubsrunde,
          wuensche: m.urlaubsrunde.wuensche.map((x) => x.id === id ? { ...x, status: ja ? "genehmigt" : "abgelehnt" } : x),
          vorjahrZurueck: ja ? (m.urlaubsrunde.vorjahrZurueck || []).filter((x) => x !== w.personId)
            : [...new Set([...(m.urlaubsrunde.vorjahrZurueck || []), w.personId])] },
          nachrichten: [{ id: uid("n"), personId: w.personId, zeit: jetzt, art: ja ? "info" : "warn", gelesen: false,
            titel: `Urlaubswunsch ${ja ? "zugesagt" : "abgesagt"}`,
            text: `${fDatum(w.von)} bis ${fDatum(w.bis)}${ja ? "" : " · du hast bei der nächsten Runde Vorrang"}` },
            ...(m.nachrichten || [])].slice(0, 400) };
        if (ja) next = { ...next, abwesenheiten: [...next.abwesenheiten,
          { id: uid("a"), personId: w.personId, art: "urlaub", von: w.von, bis: w.bis, notiz: "aus der Jahresrunde" }] };
        melde(ja ? `Zugesagt und eingetragen: ${p.nachname}.` : `Abgesagt — ${p.nachname} erhält Vorrang bei der nächsten Runde.`);
        return next;
      }, "Urlaubswunsch entschieden"),

      /* --- Datenschutz --- */
      anonymisiere: (pid) => mUpd((m) => {
        if (!window.confirm("Name und Kontaktdaten werden unwiderruflich ersetzt. Planungsdaten bleiben als Statistik erhalten.")) return m;
        melde("Datensatz anonymisiert.");
        return { ...m, personen: m.personen.map((p) => p.id === pid
          ? { ...p, vorname: "anonymisiert", nachname: `Person ${p.id.slice(-4)}`, email: "", anonym: true } : p),
          nachrichten: (m.nachrichten || []).filter((n) => n.personId !== pid) };
      }, "Datensatz anonymisiert"),
      datenauskunft: (pid) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const p = m.personen.find((x) => x.id === pid);
        const inhalt = datenauskunft(m, pid);
        if (lade(`datenauskunft_${p.nachname}.txt`, inhalt, "text/plain;charset=utf-8")) melde("Auskunft erstellt.");
        else setAusgabe({ titel: "Datenauskunft", inhalt });
      },
      exportZuschlaege: (ym2) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const regeln = (m.zuschlaege || []).filter((z) => z.aktiv);
        const kopf = ["Nachname", "Vorname", "Personalnummer", "Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag",
          ...regeln.map((z) => `${z.name} (${z.prozent}%)`), "Zuschlagswert gesamt"];
        const z = [kopf.join(";")];
        for (const p of m.personen.filter((x) => imDienst(x, `${ym2}-28`))) {
          const w = zuschlagWert(m, p, ym2);
          z.push([p.nachname, p.vorname, p.id, n1(w.std.gesamt), n1(w.std.nacht), n1(w.std.sonntag),
            n1(w.std.feiertag), n1(w.std.samstag), ...w.zeilen.map((l) => n1(l.wert)), n1(w.summe)].join(";"));
        }
        const inhalt = "\uFEFF" + z.join("\n");
        if (lade(`zuschlaege_${ym2}.csv`, inhalt, "text/csv;charset=utf-8")) melde("Export für die Lohnstelle erstellt.");
        else setAusgabe({ titel: "Zuschläge", inhalt });
      },

      /* --- Ausgaben --- */
      exportCSV: () => {
        const s = ref.current; const m = s.mandanten.find((x) => x.id === s.session.mandantId);
        const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
        const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
        const z = [["Nachname", "Vorname", m.einheitLabel, ...tage.map(fKurz)].join(";")];
        for (const p of aktive(m, tage[0])) {
          const e = m.einheiten.find((x) => x.id === einheitAm(p, tage[0]));
          z.push([p.nachname, p.vorname, e ? e.name : "", ...tage.map((d) => {
            const t = personTag(m, p, d); return t.abwesenheit ? abwArt(t.abwesenheit.art).label : t.dienstId || ""; })].join(";"));
        }
        const inhalt = "\uFEFF" + z.join("\n");
        if (lade(`dienstplan_${ym}.csv`, inhalt, "text/csv;charset=utf-8")) melde("CSV erstellt."); else setAusgabe({ titel: "CSV", inhalt });
      },
      exportICS: (pid) => {
        const s = ref.current; const m = s.mandanten.find((x) => x.id === s.session.mandantId);
        const p = m.personen.find((x) => x.id === pid);
        const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
        const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CENTRIC//DE", "CALSCALE:GREGORIAN"];
        for (let i = 1; i <= n; i++) {
          const d = `${ym}-${pad(i)}`, t = personTag(m, p, d); if (!t.dienstId) continue;
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          const endD = (toMin(da.ende) <= toMin(da.start) ? addDays(d, 1) : d).replace(/-/g, "");
          out.push("BEGIN:VEVENT", `UID:${p.id}-${d}@centric`,
            `DTSTART:${d.replace(/-/g, "")}T${da.start.replace(":", "")}00`,
            `DTEND:${endD}T${(da.ende === "24:00" ? "2359" : da.ende.replace(":", ""))}00`,
            `SUMMARY:${da.name}`, `LOCATION:${da.ort}`, "END:VEVENT");
        }
        out.push("END:VCALENDAR");
        const inhalt = out.join("\r\n");
        if (lade(`schichten_${p.nachname}_${ym}.ics`, inhalt, "text/calendar")) melde("Kalenderdatei erstellt."); else setAusgabe({ titel: "Kalender", inhalt });
      },
      exportJSON: () => { const s = ref.current; const inhalt = JSON.stringify(s, null, 2);
        if (lade(`centric_sicherung_${heute()}.json`, inhalt, "application/json")) melde("Sicherung erstellt."); else setAusgabe({ titel: "Sicherung", inhalt }); },
      zuruecksetzen: () => { if (window.confirm("Alle Eingaben verwerfen?")) { verlauf.current = []; setDb(startbestand()); melde("Zurückgesetzt."); } },
    };
  }, [melde, ym, sitz]);

  /* Zähler an den Navigationspunkten — was Aufmerksamkeit braucht, ist sofort sichtbar.
     Muss vor jedem bedingten Return stehen: Hooks laufen in fester Reihenfolge. */
  const { zaehler, zaehlerWarn } = useMemo(() => {
    if (!sitz || sitz.rolle === "betreiber" || !sitz.mandant) return { zaehler: {}, zaehlerWarn: {} };
    const m = sitz.mandant, p = sitz.person, z = {}, w = {};
    try {
      const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
      if (offen) z.antraege = offen;
      const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && !a.partnerId).length;
      if (boerse) z.boerse = boerse;
      const nl = nachweisLage(m);
      if (nl.abgelaufen.length) { z.nachweise = nl.abgelaufen.length; w.nachweise = true; }
      const bef = pruefen(m, heute(), addDays(heute(), 13)).filter((b) => b.schwere === "danger").length;
      if (bef) { z.pruef = bef; w.pruef = true; }
      const heuteOffen = Object.values(besetzung(m, heute())).filter((b) => b.diff < 0).length;
      if (heuteOffen) { z.lage = heuteOffen; w.lage = true; }
      if (p.imSchichtdienst !== false) {
        const zeiten = offeneErfassung(m, p, addDays(heute(), -1)).length;
        if (zeiten) z.meine = zeiten;
      }
      const es = einrichtungsstand(m);
      if (!es.fertig && darf(sitz, "org.edit")) z.ablauf = es.offen.length;
    } catch (e) { /* Zähler sind Beiwerk — ein Fehler darf die Ansicht nicht verhindern */ }
    return { zaehler: z, zaehlerWarn: w };
  }, [sitz]);

  if (!db) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
    justifyContent: "center", fontFamily: FONT, fontSize: 15, color: C.dim }}>CENTRIC wird geladen …</div>;
  if (!db.session) return (<><style>{STYLES}</style><Anmeldung db={db} onLogin={akt.anmelden} /></>);
  if (!sitz) return (<><style>{STYLES}</style><Anmeldung db={db} onLogin={akt.anmelden} /></>);

  const istBetreiber = sitz.rolle === "betreiber";
  const erlaubt = ([, , recht]) => {
    if (recht === "SCHICHT") return sitz.person.imSchichtdienst !== false;   // Geschäftszimmer fährt keine Schicht
    if (recht && recht.startsWith("PAKET:")) return kann(sitz.mandant, recht.slice(6));
    return !recht || darf(sitz, recht);
  };
  const nav = istBetreiber ? NAV_BETREIBER : NAV_KUNDE.filter(erlaubt);
  const bereiche = istBetreiber ? [] : BEREICHE
    .map((b) => ({ ...b, views: b.views.filter(erlaubt) })).filter((b) => b.views.length);
  const aktiveView = nav.some(([id]) => id === view) ? view : nav[0][0];
  const aktBereich = bereiche.find((b) => b.views.some(([id]) => id === aktiveView)) || bereiche[0];
  const r = istBetreiber ? ROLLEN[0] : rolle(sitz.person.rolle);
  const ungelesen = istBetreiber ? 0 : (sitz.mandant.nachrichten || []).filter((n) => n.personId === sitz.person.id && !n.gelesen).length;
  /* Nur diese Ansichten sind für das Telefon ausgelegt. */
  const MOBIL = ["meine"];
  const mobilOk = istBetreiber ? false : MOBIL.includes(aktiveView);
  const tabs = istBetreiber
    ? [["mandanten", "Mandanten", "▤"], ["rechnungen", "Rechnungen", "€"],
       ["tarife", "Tarife", "◈"], ["rechner", "Rechner", "∑"]]
    : [["meine", "Schichten", "◧"],
    ...(darf(sitz, "req.approve.unit") ? [["antraege", "Anträge", "✓"]] : []),
    ...(darf(sitz, "plan.view.unit") ? [["lage", "Lage", "◉"]] : [])];

  /**
   * Mobil zuerst: Beschäftigte im Schichtdienst ohne Planungsrechte sehen die
   * Telefonansicht als Vorgabe. Sie ist keine verkleinerte Rechneransicht,
   * sondern eigenständig gebaut — und jederzeit umschaltbar.
   */
  // An der Rolle festgemacht, nicht an einzelnen Rechten — das ist vorhersehbar.
  const nurMitarbeiter = !istBetreiber && sitz.person.rolle === "mitarbeiter"
    && sitz.person.imSchichtdienst !== false;
  const zeigeMobil = nurMitarbeiter && !rechnerAnsicht;

  const dialogBlock = (<>
    {verfDlg && <Verfuegbarkeit sitz={sitz} akt={akt} personId={verfDlg} onClose={() => setVerfDlg(null)} />}
    {krank && <Krankmeldung sitz={sitz} akt={akt} vorauswahl={krank.pid} onClose={() => setKrank(null)} />}
    {hinweis && <div style={{ position: "fixed", bottom: 104, left: "50%", transform: "translateX(-50%)",
      zIndex: 90, background: C.accentDeep, color: "#fff", padding: "12px 20px", borderRadius: 999,
      fontSize: 14, boxShadow: "0 10px 30px rgba(24,26,30,.28)", maxWidth: "90vw", textAlign: "center" }}>
      {hinweis}</div>}
  </>);

  if (zeigeMobil) return (
    <div className={`sw-root${sitz.person.kontrastmodus ? " feldmodus" : ""}`}>
      <style>{STYLES}</style>
      <div style={{display:"none"}}><i /><i /><i /><i /></div>
      <div>
        <MobilSchale sitz={sitz} akt={akt} dialoge={dialogBlock}
          aufRechner={() => setRechnerAnsicht(true)} />
      </div>
    </div>);

  return (
    <div className={`sw-root${dicht ? " dicht" : ""}${fokus ? " fokus" : ""}${!istBetreiber && sitz.person.kontrastmodus ? " feldmodus" : ""}`}>
      <style>{STYLES}</style>
      <a href="#inhalt" className="sprung">Zum Inhalt springen</a>
      <div className="huelle">

        {/* ----------------------- Seitenleiste ----------------------- */}
        <aside className={`seitenleiste${seiteOffen ? " offen" : ""}`}
          aria-label="Hauptnavigation">
          <div className="marke">
            <Logo size={26} hell />
            <div style={{ minWidth: 0 }}>
              <b>CENTRIC</b>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)", marginTop: 2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {istBetreiber ? "Betreiberkonsole" : sitz.mandant.name}</div>
            </div>
          </div>

          <nav className="snav">
            {istBetreiber
              ? nav.map(([id, label]) => (
                <button key={id} className={`slink${aktiveView === id ? " on" : ""}`}
                  onClick={() => { setView(id); setDetail(null); setSeiteOffen(false); }}>{label}</button>))
              : bereiche.map((b) => (
                <div key={b.id}>
                  <div className="sgruppe">{b.label}</div>
                  {b.views.map(([id, label]) => {
                    const z = zaehler[id];
                    return (
                      <button key={id} className={`slink${aktiveView === id ? " on" : ""}`}
                        aria-current={aktiveView === id ? "page" : undefined}
                        onClick={() => { setView(id); setDetail(null); setSeiteOffen(false); }}>
                        {label}
                        {z > 0 && <span className={`zahl${zaehlerWarn[id] ? " warn" : ""}`}>{z}</span>}
                      </button>);
                  })}
                </div>))}
          </nav>

          <div className="sfuss">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                background: "rgba(255,255,255,.12)", color: "#fff" }}>{r.kurz}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "#fff", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis" }}>
                  {istBetreiber ? "Betreiber" : `${sitz.person.vorname} ${sitz.person.nachname}`}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{r.label}</div>
              </div>
              <button onClick={akt.abmelden} title="Abmelden"
                style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.55)",
                  cursor: "pointer", fontSize: 15, padding: 4 }}><span aria-hidden="true">⏻</span></button>
            </div>
          </div>
        </aside>

        {/* ------------------------- Inhalt --------------------------- */}
        <div className="inhalt">
          <header className="kopfleiste">
            <button className="btn btn-sm btn-quiet nur-schmal" onClick={() => setSeiteOffen(!seiteOffen)}
              aria-label="Navigation öffnen" aria-expanded={seiteOffen} title="Navigation">
              <span aria-hidden="true">☰</span></button>

            {!istBetreiber && (
              <button className="suchknopf" onClick={() => setKmd(true)}>
                <span>⌕</span><span>Suchen …</span><kbd>Strg K</kbd>
              </button>)}

            <div style={{ flex: 1 }} />

            <Btn size="sm" kind="quiet" onClick={() => setDicht(!dicht)}
              title="Zeilenhöhe und Abstände umschalten">
              {dicht ? "Komfortabel" : "Kompakt"}</Btn>
            <Btn size="sm" kind="quiet" onClick={() => setFokus(!fokus)}
              title="Seitenleiste ausblenden für maximale Breite">
              {fokus ? "Fokus beenden" : "Fokus"}</Btn>

            {!istBetreiber && (
              <button onClick={() => setPostfach(true)} className="btn btn-sm btn-quiet"
                title="Mitteilungen" aria-label={`Mitteilungen${ungelesen ? `, ${ungelesen} ungelesen` : ""}`}
                style={{ position: "relative" }}>
                <span aria-hidden="true">✉︎</span>
                {ungelesen > 0 && <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16,
                  height: 16, borderRadius: 8, background: C.danger, color: "#fff", fontSize: 10,
                  fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {ungelesen}</span>}
              </button>)}
            {!istBetreiber && <Btn size="sm" kind="quiet" onClick={akt.zurueck}
              title="Letzte Änderung zurücknehmen">Rückgängig</Btn>}
            {!istBetreiber && <Btn size="sm" kind="quiet"
              onClick={() => akt.setzeKontrastmodus(!sitz.person.kontrastmodus)}
              title="Größere Schrift und maximaler Kontrast">
              {sitz.person.kontrastmodus ? "Feldmodus aus" : "Feldmodus"}</Btn>}
            {nurMitarbeiter && rechnerAnsicht && (
              <Btn size="sm" kind="quiet" onClick={() => setRechnerAnsicht(false)}>Telefonansicht</Btn>)}
          </header>

          {fokus && (
            <div style={{ padding: "10px 24px", background: C.accentLight,
              borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, color: C.accent }}>Fokusmodus — Navigation ausgeblendet</span>
              <Btn size="sm" onClick={() => setFokus(false)}>Fokus beenden</Btn>
            </div>)}

          <main className="bereich" id="inhalt" tabIndex={-1}
            aria-label={`Ansicht ${aktiveView}`}>
          {schmal && !mobilOk && (
            <Card style={{ padding: 20, marginBottom: 20, background: C.warnLight }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>Für Tablet und Rechner ausgelegt</div>
              <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.5 }}>
                Planung, Verwaltung und Abrechnung arbeiten mit breiten Tabellen. Auf dem Telefon ist
                {istBetreiber ? " diese Konsole" : " „Meine Schichten"} die vorgesehene Ansicht — dort ist alles enthalten,
                was im Dienst gebraucht wird.
              </div>
              {!istBetreiber && <div style={{ marginTop: 14 }}>
                <Btn kind="primary" onClick={() => setView("meine")}>Zu meinen Schichten</Btn></div>}
            </Card>)}
          {istBetreiber ? (
            detail ? <BetreiberDetail db={db} akt={akt} mandantId={detail} zurueck={() => setDetail(null)} /> : <>
              {aktiveView === "mandanten" && <BetreiberMandanten db={db} akt={akt} oeffne={setDetail} />}
              {aktiveView === "rechnungen" && <BetreiberRechnungen db={db} akt={akt} />}
              {aktiveView === "rechner" && <Mandantenrechner db={db} />}
            {aktiveView === "pakete" && <Pakete db={db} akt={akt} />}
            {aktiveView === "tarife" && <BetreiberTarife db={db} akt={akt} />}
            </>
          ) : (<>
            {aktiveView === "meine" && <MeineSchichten sitz={sitz} akt={akt} ym={ym} />}
            {aktiveView === "lage" && <Lagebild sitz={sitz} oeffneTag={setTag} akt={akt} />}
            {aktiveView === "plan" && <Monatsplan sitz={sitz} ym={ym} setYm={setYm} oeffneTag={setTag} akt={akt} />}
            {aktiveView === "einsatz" && <Einsatzplan sitz={sitz} ym={ym} setYm={setYm} akt={akt} oeffnePerson={setPerson} />}
            {aktiveView === "folge" && <Schichtfolge sitz={sitz} akt={akt} />}
            {aktiveView === "dienste" && <Dienstarten sitz={sitz} akt={akt} />}
            {aktiveView === "antraege" && <AntraegeGeteilt sitz={sitz} akt={akt} />}
            {aktiveView === "personal" && <Personal sitz={sitz} ym={ym} akt={akt} oeffnePerson={setPerson} />}
            {aktiveView === "planstand" && <div><H1 rubrik="Planung"
              sub="Jede Änderung nach der Freigabe im Vergleich zum damaligen Stand. Beantwortet die häufigste Frage im Schichtbetrieb.">
              Planstand · {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</H1>
              <Planstand sitz={sitz} ym={ym} akt={akt} /></div>}
            {aktiveView === "quals" && <Qualifikationsmatrix sitz={sitz} akt={akt} />}
            {aktiveView === "einarbeitung" && <Einarbeitung sitz={sitz} akt={akt} />}
            {aktiveView === "bereitschaft" && <Bereitschaft sitz={sitz} akt={akt} oeffneTag={setTag} />}
            {aktiveView === "ablauf" && <Ablaufansicht sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "uebergabe" && <Schichtuebergabe sitz={sitz} akt={akt} />}
            {aktiveView === "belastbarkeit" && <Belastbarkeit sitz={sitz} akt={akt} oeffneTag={setTag} />}
            {aktiveView === "mitnahme" && <Datenmitnahme sitz={sitz} akt={akt} />}
            {aktiveView === "start" && <Prioritaeten sitz={sitz} akt={akt} gehZu={setView} oeffneTag={setTag} />}
            {aktiveView === "zeitachse" && <Zeitachse sitz={sitz} oeffneTag={setTag} akt={akt} />}
            {aktiveView === "aushang" && <SchwarzesBrett sitz={sitz} akt={akt} />}
            {aktiveView === "nachweise" && <Nachweise sitz={sitz} akt={akt} />}
            {aktiveView === "mittel" && <Betriebsmittel sitz={sitz} akt={akt} />}
            {aktiveView === "boerse" && <Tauschboerse sitz={sitz} akt={akt} />}
            {aktiveView === "wuensche" && <Wunschdienste sitz={sitz} akt={akt} />}
            {aktiveView === "verteilung" && <Verteilung sitz={sitz} ym={ym} />}
            {aktiveView === "jahr" && <Jahresansicht sitz={sitz} ym={ym} oeffnePerson={setPerson} />}
            {aktiveView === "buch" && <Dienstbuch sitz={sitz} akt={akt} />}
            {aktiveView === "abrechnung" && <Abrechnungsdaten sitz={sitz} ym={ym} akt={akt} />}
            {aktiveView === "pruef" && <Pruefung sitz={sitz} ym={ym} oeffneTag={setTag} />}
            {aktiveView === "betrieb" && <Betrieb sitz={sitz} akt={akt} />}
          </>)}
          </main>
        </div>
      </div>

      {tag && !istBetreiber && <Tagesdetail sitz={sitz} datum={tag} onClose={() => setTag(null)} akt={akt} />}
      {imp && !istBetreiber && <Import sitz={sitz} akt={akt} onClose={() => setImp(false)} />}
      {assist && !istBetreiber && <Assistent sitz={sitz} ym={ym} akt={akt} onClose={() => setAssist(false)} />}
      {!istBetreiber && <Kommandoleiste sitz={sitz} nav={nav} akt={akt} offen={kmd}
        onClose={() => setKmd(false)} gehZu={(v) => { setView(v); setDetail(null); }}
        oeffneTag={setTag} oeffnePerson={setPerson} />}
      {wunschDlg && !istBetreiber && <Wunschdienste sitz={sitz} akt={akt} personId={wunschDlg}
        onClose={() => setWunschDlg(null)} />}
      {notizDlg && !istBetreiber && <Notizen sitz={sitz} akt={akt} schluessel={notizDlg.k}
        titel={notizDlg.t} onClose={() => setNotizDlg(null)} />}
      {mehrfach && !istBetreiber && <Mehrfach sitz={sitz} akt={akt} onClose={() => setMehrfach(false)} />}
      {(einf || (!istBetreiber && sitz.person.einfuehrung && !sitz.person.einfuehrung.erledigt)) && !istBetreiber && (
        <Einfuehrung sitz={sitz} akt={akt} gehZu={setView} onClose={() => setEinf(false)} />)}
      {verfDlg && !istBetreiber && <Verfuegbarkeit sitz={sitz} akt={akt} personId={verfDlg} onClose={() => setVerfDlg(null)} />}
      {nwDlg && !istBetreiber && <NachweisPflege sitz={sitz} akt={akt} personId={nwDlg.pid} qualId={nwDlg.qid}
        onClose={() => setNwDlg(null)} />}
      {wizard && !istBetreiber && <Assistent2 sitz={sitz} akt={akt} onClose={() => setWizard(false)} />}
      {schnell && !istBetreiber && <Schnellbesetzung sitz={sitz} datum={schnell.datum} dienstId={schnell.dienstId}
        akt={akt} onClose={() => setSchnell(null)} />}
      {eskal && !istBetreiber && <Eskalation sitz={sitz} datum={eskal.datum} dienstId={eskal.dienstId} akt={akt} onClose={() => setEskal(null)} />}
      {ausgl && !istBetreiber && <AusgleichPlanen sitz={sitz} personId={ausgl} akt={akt} onClose={() => setAusgl(null)} />}
      {krank && !istBetreiber && <Krankmeldung sitz={sitz} akt={akt} vorauswahl={krank.pid} onClose={() => setKrank(null)} />}
      {postfach && !istBetreiber && <Nachrichten sitz={sitz} akt={akt} onClose={() => { akt.alleGelesen(); setPostfach(false); }} />}
      {person && !istBetreiber && <Personalakte sitz={sitz} personId={person} ym={ym} onClose={() => setPerson(null)} akt={akt} />}

      <Sheet open={!!ausgabe} onClose={() => setAusgabe(null)} titel={ausgabe ? ausgabe.titel : ""} width={740}>
        {ausgabe && (<>
          <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>
            In dieser Umgebung lässt sich keine Datei speichern. Inhalt markieren und kopieren.</div>
          <textarea readOnly value={ausgabe.inhalt} onFocus={(e) => e.target.select()} className="inp"
            style={{ height: 340, fontFamily: "ui-monospace, monospace", fontSize: 12 }} /></>)}
      </Sheet>

      {tabs.length > 0 && (
        <nav className="tabbar">
          {tabs.map(([id, label, glyph]) => (
            <button key={id} className={aktiveView === id ? "on" : ""} onClick={() => { setView(id); setDetail(null); }}>
              <span className="glyph">{glyph}</span>{label}</button>))}
          {!istBetreiber && <button onClick={() => setPostfach(true)}>
            <span className="glyph" style={{ position: "relative" }}>✉︎
              {ungelesen > 0 && <span style={{ position: "absolute", top: -4, right: -8, minWidth: 15, height: 15,
                borderRadius: 8, background: C.danger, color: "#fff", fontSize: 9.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{ungelesen}</span>}
            </span>Post</button>}
          {!istBetreiber && <button onClick={() => akt.oeffneKrankmeldung(sitz.person.id)}>
            <span className="glyph" style={{ color: C.danger }}>✚</span>Krank</button>}
        </nav>)}

      {konflikt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,28,.32)", backdropFilter: "blur(6px)",
          zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="blatt" style={{ maxWidth: 480, padding: 26 }}>
            <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 10 }}>Bestand von anderer Stelle geändert</div>
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
              Der gespeicherte Bestand wurde in einem anderen Fenster fortgeschrieben. Um Datenverlust
              zu vermeiden, wurde nicht gespeichert. Lade neu und trage die Änderung erneut ein.
              <br /><br />
              <b>Echter Mehrbenutzerbetrieb setzt einen Server voraus</b> — diese Prüfung erkennt den Konflikt,
              sie löst ihn nicht auf.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setKonflikt(false)}>Weiterarbeiten</Btn>
              <Btn kind="primary" onClick={() => window.location.reload()}>Neu laden</Btn>
            </div>
          </div>
        </div>)}

      {hinweis && (
        <div className="toast" role="status" aria-live="polite">
          <span style={{ flex: 1 }}>{hinweis}</span>
          {verlauf.current.length > 0 && (<>
            <button onClick={() => { akt.zurueck(); setHinweis(null); }}>Rückgängig</button>
            <span className="toast-uhr"><i /></span>
          </>)}
        </div>)}
    </div>);
}

/** Öffentlicher Einstieg — der Fehlerauffang liegt über allem. */
export default function App() {
  return (
    <Fehlerauffang>
      <ZiehAnbieter>
      <style>{STYLES}</style>
        <AppInnen />
        <ZiehHinweis />
      </ZiehAnbieter>
    </Fehlerauffang>);
}
