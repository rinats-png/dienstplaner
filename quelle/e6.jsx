
/* ==========================================================================
   HEUTE PRIORISIEREN
   Die Startseite sagt nicht, was alles da ist — sie sagt, was zuerst dran ist.
   Höchstens drei Karten, jede mit einer Zahl, einem Satz und einem Weg.
   Alles Weitere liegt darunter und ist eingeklappt.
   ========================================================================== */
function Prioritaeten({ sitz, akt, gehZu, oeffneTag }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  const [alles, setAlles] = useState(false);
  const aufgaben = useMemo(() => tagesaufgaben(sitz), [m, p.id]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meinDienst = p.imSchichtdienst !== false ? personTag(m, p, d0) : null;
  const meineDa = meinDienst && meinDienst.dienstId ? map[meinDienst.dienstId] : null;
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen"
    : stunde < 18 ? "Guten Tag" : "Guten Abend";

  /* Die drei wichtigsten Sachen — nach Dringlichkeit und Tragweite geordnet. */
  const oben = useMemo(() => {
    const l = [];
    const bes = besetzung(m, d0);
    const luecken = Object.values(bes).filter((b) => b.soll > 0 && b.diff < 0);
    if (luecken.length && darf(sitz, "plan.edit.unit"))
      l.push({ id: "luecke", zahl: luecken.reduce((a, b) => a + Math.abs(b.diff), 0),
        einheit: "Plätze", titel: "Heute fehlt Besetzung",
        text: luecken.map((b) => `${b.da.name} ${b.anzahl}/${b.soll}`).join(" · "),
        ton: "danger", weg: () => oeffneTag(d0), knopf: "Lücken schließen" });

    const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
    if (offen && darf(sitz, "req.approve.unit"))
      l.push({ id: "antraege", zahl: offen, einheit: offen === 1 ? "Antrag" : "Anträge",
        titel: "Warten auf Entscheidung",
        text: "Die Kapazitätsansicht zeigt vor der Entscheidung, welche Wochen dadurch kippen.",
        ton: "warn", weg: () => gehZu("antraege"), knopf: "Anträge ansehen" });

    if (darf(sitz, "staff.view")) {
      const nl = nachweisLage(m);
      if (nl.abgelaufen.length)
        l.push({ id: "nachweise", zahl: nl.abgelaufen.length, einheit: "Nachweise",
          titel: "Sind abgelaufen",
          text: nl.abgelaufen.slice(0, 3).map((x) => `${x.person.nachname} · ${x.qual.name}`).join(" · "),
          ton: "danger", weg: () => gehZu("nachweise"), knopf: "Nachweise prüfen" });
    }

    if (darf(sitz, "plan.view.unit")) {
      const bl = belastbarkeit(m, 4).filter((w) => w.stufe === "ohne Reserve");
      if (bl.length)
        l.push({ id: "reserve", zahl: bl.length, einheit: bl.length === 1 ? "Woche" : "Wochen",
          titel: "Ohne jede Reserve",
          text: `Ab ${fKurz(bl[0].von)} verträgt ${bl[0].schwaechste ? bl[0].schwaechste.da.name : "ein Dienst"} keinen einzigen Ausfall mehr.`,
          ton: "warn", weg: () => gehZu("belastbarkeit"), knopf: "Belastbarkeit ansehen" });
    }

    if (p.imSchichtdienst !== false) {
      const zeiten = offeneErfassung(m, p, addDays(d0, -1)).length;
      if (zeiten)
        l.push({ id: "zeiten", zahl: zeiten, einheit: "Tage", titel: "Zeiten bestätigen",
          text: "Solange sie offen sind, bleibt dein Stundenkonto eine Hochrechnung.",
          ton: "warn", weg: () => gehZu("meine"), knopf: "Jetzt bestätigen" });
    }

    const es = einrichtungsstand(m);
    if (!es.fertig && darf(sitz, "org.edit"))
      l.push({ id: "einrichtung", zahl: es.offen.length,
        einheit: es.offen.length === 1 ? "Schritt" : "Schritte", titel: "Bis zum laufenden Betrieb",
        text: es.offen[0].titel + " — " + es.offen[0].text,
        ton: "accent", weg: () => gehZu(es.offen[0].ziel), knopf: "Weiter einrichten" });

    const rang = { danger: 0, warn: 1, accent: 2 };
    return l.sort((a, b) => rang[a.ton] - rang[b.ton]).slice(0, 3);
  }, [m, p.id, sitz]);

  const rest = aufgaben.filter((a) => !oben.some((o) => o.id === a.art || o.id === a.ziel));
  const ton = (t) => t === "danger" ? C.danger : t === "warn" ? C.warn : C.accent;
  const flaeche = (t) => t === "danger" ? C.dangerLight : t === "warn" ? C.warnLight : C.accentLight;

  return (
    <div>
      {/* --------------------------- Anrede -------------------------- */}
      <div style={{ marginBottom: 40 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 className="titel" style={{ marginTop: 12 }}>
          {gruss}, <b>{p.vorname}</b>.
        </h1>
        <p className="untertitel">
          {oben.length === 0
            ? "Nichts braucht heute deine Aufmerksamkeit. Der Plan trägt."
            : oben.length === 1
              ? "Eine Sache steht heute an."
              : `${oben.length} Dinge stehen heute an — das erste zuerst.`}
        </p>
      </div>

      {/* ------------------------ Die drei Karten -------------------- */}
      {oben.length === 0 ? (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 34, color: C.ok, marginBottom: 14 }}>✓</div>
          <div style={{ fontSize: 19, fontWeight: 620, marginBottom: 8 }}>Alles im Lauf</div>
          <div style={{ fontSize: 14.5, color: C.dim, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Keine offenen Entscheidungen, keine Lücken, keine abgelaufenen Nachweise.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {oben.map((x, i) => (
            <Card key={x.id} className="karte-hover" onClick={x.weg}
              style={{ padding: "30px 32px", cursor: "pointer", display: "flex",
                alignItems: "center", gap: 32, flexWrap: "wrap",
                borderLeft: `3px solid ${ton(x.ton)}`,
                background: i === 0 ? flaeche(x.ton) : C.flaeche }}>
              <div style={{ minWidth: 92 }}>
                <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: "-.05em", lineHeight: 1,
                  color: ton(x.ton), ...NUM }}>{x.zahl}</div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 6 }}>{x.einheit}</div>
              </div>
              <div style={{ flex: 1, minWidth: 250 }}>
                <div style={{ fontSize: 20, fontWeight: 640, letterSpacing: "-.02em", marginBottom: 8 }}>
                  {x.titel}</div>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{x.text}</div>
              </div>
              <Btn kind={i === 0 ? "primary" : "plain"} style={{ flexShrink: 0 }}
                onClick={(e) => { if (e) e.stopPropagation(); x.weg(); }}>{x.knopf}</Btn>
            </Card>))}
        </div>)}

      {/* ------------------------ Mein Dienst ------------------------ */}
      {meineDa && (
        <div className="abschnitt">
          <h2 className="abschnitt-titel">Mein Dienst heute</h2>
          <p className="abschnitt-sub">Was für dich persönlich ansteht.</p>
          <Card style={{ padding: 24, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <Zelle da={meineDa} size={48} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 19, fontWeight: 620 }}>{meineDa.name}</div>
              <div style={{ fontSize: 14.5, color: C.dim, marginTop: 4, ...NUM }}>
                {meineDa.start} – {meineDa.ende} · {n1(dauer(meineDa))} h
                {meineDa.ort ? ` · ${meineDa.ort}` : ""}</div>
            </div>
            <Btn onClick={() => gehZu("meine")}>Meine Schichten</Btn>
          </Card>
        </div>)}

      {/* --------------------- Alles Weitere, eingeklappt ------------- */}
      {rest.length > 0 && (
        <div className="abschnitt">
          <button className={`mehr${alles ? " auf" : ""}`} onClick={() => setAlles(!alles)}
            aria-expanded={alles}>
            <span aria-hidden="true">›</span>
            {alles ? "Weniger anzeigen" : `Alles Weitere anzeigen (${rest.length})`}
          </button>
          {alles && (
            <Card style={{ marginTop: 14 }}>
              {rest.map((a, i) => (
                <div key={i} onClick={() => a.ziel && gehZu(a.ziel)}
                  className="zeile-hover"
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px",
                    cursor: a.ziel ? "pointer" : "default",
                    borderBottom: i < rest.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 14,
                    background: a.dringend ? C.dangerLight : C.bg,
                    color: a.dringend ? C.danger : C.dim }}>{AUFGABE_SYMBOL[a.art] || "·"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 550 }}>{a.titel}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.5 }}>{a.text}</div>
                  </div>
                  {a.ziel && <span style={{ color: C.dim, fontSize: 18 }}>›</span>}
                </div>))}
            </Card>)}
        </div>)}

      {/* ------------------------ Lage in Zahlen --------------------- */}
      {darf(sitz, "plan.view.unit") && (
        <div className="abschnitt">
          <h2 className="abschnitt-titel">Die Lage in Zahlen</h2>
          <p className="abschnitt-sub">Stand heute, über alle {m.einheitLabel}n.</p>
          <KpiRow min={200}>
            {(() => {
              const bes = besetzung(m, d0);
              const eingeteilt = Object.values(bes).reduce((a, b) => a + b.anzahl, 0);
              const abw = m.personen.filter((x) => imDienst(x, d0) && abwesenheitAm(m, x.id, d0)).length;
              const bl = belastbarkeit(m, 4);
              const schwach = bl.filter((w) => w.stufe !== "robust").length;
              return (<>
                <Kpi label="Heute im Dienst" value={eingeteilt} sub={`von ${aktive(m, d0).length} Beschäftigten`} />
                <Kpi label="Abwesend" value={abw} sub="Urlaub, krank, Schulung" />
                <Kpi label="Wochen ohne Puffer" value={schwach} tone={schwach ? "warn" : "ok"}
                  sub="in den nächsten vier" />
              </>);
            })()}
          </KpiRow>
        </div>)}
    </div>);
}
