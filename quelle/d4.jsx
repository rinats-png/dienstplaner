
/* ==========================================================================
   ABLAUFDIAGRAMM UND EINFÜHRUNG
   Jede Rolle sieht denselben Gesamtablauf — aber nur ihr eigener Abschnitt ist
   handlungsfähig. Was andere bereits erledigt haben, wird gezeigt und erklärt,
   damit klar ist, worauf die eigene Arbeit aufsetzt.
   ========================================================================== */

/**
 * Der Betriebsablauf in sechs Stationen. Jede Station nennt die zuständige
 * Rolle, prüft ihren eigenen Zustand und erklärt sich selbst.
 */
const ABLAUF = [
  {
    id: "einrichten", titel: "Betrieb einrichten", rolle: "leitung", ziel: "betrieb",
    kurz: "Standorte, Regelwerk, Dienstarten",
    was: "Wie der Betrieb aufgebaut ist: Standorte mit eigenem Bundesland, die vertragliche Wochenarbeitszeit, Ruhezeiten und die Höchstzahl von Diensten in Folge.",
    warum: "Alles Weitere rechnet damit. Feiertage richten sich nach dem Standort, die Prüfung nach dem Regelwerk.",
    fertig: (m) => (m.standorte || []).length > 0 && m.dienstarten.length > 0,
    stand: (m) => `${(m.standorte || []).length} Standort${(m.standorte || []).length === 1 ? "" : "e"} · ${m.dienstarten.length} Dienstarten · ${n1(m.einstellungen.sollWochenstunden)} h je Woche`,
  },
  {
    id: "personal", titel: "Personal anlegen", rolle: "leitung", ziel: "personal",
    kurz: "Menschen erfassen, Zugangsarten vergeben",
    was: "Wer im Betrieb arbeitet — einzeln angelegt oder aus einer Liste eingelesen. Danach bekommt jede Person eine Zugangsart, die bestimmt, was sie sehen und ändern darf.",
    warum: "Ohne Personal bleibt der Plan leer. Die Zugangsart entscheidet über Rechte und wirkt auf die monatlichen Kosten.",
    fertig: (m) => m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false).length >= 2,
    stand: (m) => {
      const n = m.personen.filter((p) => imDienst(p, heute())).length;
      const pl = m.personen.filter((p) => ["planer", "subplaner"].includes(p.rolle)).length;
      return `${n} Person${n === 1 ? "" : "en"} · ${pl} mit Planungsrechten`;
    },
  },
  {
    id: "quals", titel: "Qualifikationen zuordnen", rolle: "leitung", ziel: "quals",
    kurz: "Wer darf was, mit Ablaufdatum",
    was: "Sachkunde, Schichtleitung, Erste Hilfe. Qualifikationen mit Ablaufdatum brauchen einen Nachweis — läuft er ab, zählt die Qualifikation nicht mehr für die Besetzung.",
    warum: "Die Besetzungsprüfung und die Ersatzsuche greifen darauf zu. Ohne Zuordnung kann die App nicht erkennen, ob ein Dienst fachlich gedeckt ist.",
    fertig: (m) => (m.qualifikationen || []).length > 0
      && m.personen.some((p) => imDienst(p, heute()) && (p.qualifikationen || []).length),
    stand: (m) => `${(m.qualifikationen || []).length} Qualifikationen · ${m.personen.filter((p) => (p.qualifikationen || []).length).length} Personen zugeordnet`,
  },
  {
    id: "schichtfolge", titel: "Schichtfolge festlegen", rolle: "planer", ziel: "folge",
    kurz: "Modell wählen, Gruppen und Startpunkte",
    was: "Der Zyklus und der Startpunkt jeder Gruppe. Aus beidem berechnet CENTRIC den Plan für jeden Tag — es wird nichts ausgerollt, es gibt keine Jahresgrenze.",
    warum: "Das ist die eigentliche Planung. Der Einrichtungsassistent führt durch die Auswahl und zeigt bei jedem Modell die gerechneten Kennzahlen.",
    fertig: (m) => m.zyklus && m.zyklus.tage && m.zyklus.tage.some((t) => t && t !== "-")
      && m.einheiten.filter((e) => !e.pool).length >= 2,
    stand: (m) => `${m.zyklus.tage.length} Zyklustage · ${m.einheiten.filter((e) => !e.pool).length} ${m.einheitLabel}n`,
  },
  {
    id: "pruefen", titel: "Plan prüfen und freigeben", rolle: "planer", ziel: "plan",
    kurz: "Befunde beheben, dann verbindlich machen",
    was: "Die Prüfung meldet Unterbesetzung, Ruhezeitverstöße, fehlende Qualifikationen und Einsatzeinschränkungen. Sind die Befunde geklärt, wird der Monat freigegeben.",
    warum: "Erst mit der Freigabe ist der Plan verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus.",
    fertig: (m) => Object.keys(m.freigaben || {}).length > 0,
    stand: (m) => {
      const n = Object.keys(m.freigaben || {}).length;
      return n ? `${n} Monat${n === 1 ? "" : "e"} freigegeben` : "noch keine Freigabe";
    },
  },
  {
    id: "betrieb", titel: "Laufender Betrieb", rolle: "alle", ziel: "start",
    kurz: "Dienst tun, Zeiten bestätigen, Lücken schließen",
    was: "Beschäftigte stempeln ein, bestätigen Zeiten, stellen Anträge und Tauschgesuche. Die Schichtverantwortung schließt Lücken, die Planung entscheidet Anträge.",
    warum: "Hier entsteht die Wahrheit über den Monat — Grundlage für Stundenkonten, Zuschläge und Abrechnung.",
    fertig: (m) => Object.keys(m.erfassung || {}).length > 0 || (m.anfragen || []).length > 0,
    stand: (m) => `${Object.keys(m.erfassung || {}).length} bestätigte Zeiten · ${(m.anfragen || []).length} Vorgänge`,
  },
];

const ROLLE_FARBE = { leitung: "#2C5A8A", planer: "#5B4A87", subplaner: "#2C6B63", alle: "#4A6B2E" };
const ROLLE_KURZ = { leitung: "Organisationsleitung", planer: "Planung", subplaner: "Schichtverantwortung", alle: "Alle Beteiligten" };

/** Ist diese Station Sache der angemeldeten Person? */
function meineStation(sitz, st) {
  if (st.rolle === "alle") return true;
  if (st.rolle === "leitung") return darf(sitz, "org.edit");
  if (st.rolle === "planer") return darf(sitz, "pattern.edit") || darf(sitz, "plan.publish");
  if (st.rolle === "subplaner") return darf(sitz, "plan.edit.unit");
  return false;
}

/* ---------------------------- Das Ablaufdiagramm ------------------------- */
function Ablaufdiagramm({ sitz, gehZu, kompakt }) {
  const m = sitz.mandant;
  const [offen, setOffen] = useState(null);
  const stationen = ABLAUF.map((st) => ({ ...st, ok: st.fertig(m), mein: meineStation(sitz, st) }));
  const ersteOffene = stationen.findIndex((x) => !x.ok);

  return (
    <div>
      <div className="reiterreihe" style={{ marginBottom: kompakt ? 12 : 18, paddingBottom: 10 }}>
        {stationen.map((st, i) => {
          const aktuell = i === ersteOffene;
          const f = ROLLE_FARBE[st.rolle];
          return (
            <Fragment key={st.id}>
              <div onClick={() => setOffen(offen === st.id ? null : st.id)}
                style={{ minWidth: kompakt ? 132 : 168, padding: kompakt ? "12px 13px" : "15px 16px",
                  borderRadius: 16, cursor: "pointer", position: "relative",
                  background: st.ok ? C.okLight : aktuell ? `${f}12` : C.bg,
                  outline: offen === st.id ? `2px solid ${C.accent}` : aktuell ? `2px solid ${f}` : "none",
                  opacity: st.mein ? 1 : .62 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...NUM,
                    background: st.ok ? C.ok : aktuell ? f : C.lineStark,
                    color: st.ok || aktuell ? "#fff" : C.dimmer }}>{st.ok ? "✓" : i + 1}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
                    textTransform: "uppercase", color: f }}>{ROLLE_KURZ[st.rolle]}</span>
                </div>
                <div style={{ fontSize: kompakt ? 13 : 14, fontWeight: 620, lineHeight: 1.25 }}>{st.titel}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4, lineHeight: 1.35 }}>
                  {st.ok ? st.stand(m) : st.kurz}</div>
                {!st.mein && <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 6, fontStyle: "italic" }}>
                  nicht dein Bereich</div>}
              </div>
              {i < stationen.length - 1 && (
                <div style={{ display: "flex", alignItems: "center", color: C.dimmer, fontSize: 16,
                  flexShrink: 0, padding: "0 2px" }}>→</div>)}
            </Fragment>);
        })}
      </div>

      {offen && (() => {
        const st = stationen.find((x) => x.id === offen);
        return (
          <Card style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
              alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <Rubrik style={{ color: ROLLE_FARBE[st.rolle] }}>{ROLLE_KURZ[st.rolle]}</Rubrik>
                <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-.02em", marginTop: 6 }}>{st.titel}</div>
              </div>
              <Pill tone={st.ok ? "ok" : st.mein ? "warn" : "neutral"}>
                {st.ok ? "erledigt" : st.mein ? "deine Aufgabe" : "wartet auf andere"}</Pill>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <Lab style={{ marginBottom: 5 }}>Was hier geschieht</Lab>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{st.was}</div>
              </div>
              <div>
                <Lab style={{ marginBottom: 5 }}>Warum es wichtig ist</Lab>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{st.warum}</div>
              </div>
              <div>
                <Lab style={{ marginBottom: 5 }}>Aktueller Stand</Lab>
                <div style={{ fontSize: 14, color: st.ok ? C.ok : C.text, lineHeight: 1.6, ...NUM }}>
                  {st.stand(m)}</div>
              </div>
            </div>
            {st.mein && (
              <div style={{ marginTop: 18 }}>
                <Btn kind={st.ok ? "plain" : "primary"} onClick={() => gehZu(st.ziel)}>
                  {st.ok ? "Ansehen und ändern" : "Jetzt erledigen"}</Btn>
              </div>)}
            {!st.mein && (
              <div style={{ marginTop: 16, fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
                Diese Station gehört zur {ROLLE_KURZ[st.rolle]}. Du siehst sie, damit klar ist, worauf
                deine Arbeit aufsetzt — ändern kann sie nur, wer die entsprechenden Rechte hat.
              </div>)}
          </Card>);
      })()}
    </div>);
}

/* ------------------------- Rollenabhängige Einführung -------------------- */
/**
 * Was jede Rolle beim ersten Mal wissen muss. Bewusst knapp: eine Sache je
 * Schritt, mit dem Weg dorthin. Wer will, springt direkt in die Ansicht.
 */
const EINFUEHRUNG = {
  leitung: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du richtest den Betrieb ein. Dieser Rundgang zeigt in fünf Schritten, was dafür nötig ist — und wer danach übernimmt. Er lässt sich jederzeit abbrechen und später fortsetzen." },
    { titel: "Der Ablauf im Überblick", ziel: null, diagramm: true,
      text: "Sechs Stationen führen vom leeren Betrieb zum laufenden Plan. Die ersten drei sind deine, danach übernimmt die Planung. Jede Station lässt sich antippen und erklärt sich selbst." },
    { titel: "Betrieb einrichten", ziel: "betrieb",
      text: "Standorte mit eigenem Bundesland, vertragliche Wochenarbeitszeit, Ruhezeit und Höchstzahl der Dienste in Folge. Diese Werte sind die Grundlage jeder Prüfung — Feiertage und Sollstunden richten sich danach." },
    { titel: "Personal anlegen", ziel: "personal",
      text: "Zwei Wege: eine Liste aus Tabellenkalkulation einlesen oder Personen einzeln anlegen. Danach vergibst du je Person eine Zugangsart. Sie bestimmt Rechte und wirkt unmittelbar auf die monatlichen Kosten — Betriebsrat und Organisationsleitung sind kostenfrei." },
    { titel: "Qualifikationen zuordnen", ziel: "quals",
      text: "Wer darf was. Qualifikationen mit Ablaufdatum brauchen einen Nachweis; läuft er ab, zählt die Qualifikation nicht mehr für die Besetzung. Die Matrix zeigt zudem, wo eine Qualifikation an einer einzigen Person hängt." },
    { titel: "Danach übernimmt die Planung", ziel: null,
      text: "Sobald Personal und Qualifikationen stehen, legt die Planung die Schichtfolge fest und gibt den ersten Monat frei. Du behältst überall Einblick und kannst jederzeit eingreifen." },
  ],
  planer: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du planst die Dienste. Dieser Rundgang zeigt deinen Teil des Ablaufs — und was die Organisationsleitung bereits vorbereitet hat." },
    { titel: "Was schon steht", ziel: null, diagramm: true, vorher: true,
      text: "Die grün markierten Stationen sind erledigt. Darauf setzt deine Arbeit auf: Standorte und Regelwerk bestimmen, wie geprüft wird; Personal und Qualifikationen, wer eingeteilt werden kann." },
    { titel: "Schichtfolge festlegen", ziel: "folge",
      text: "Ein Zyklus und ein Startpunkt je Gruppe — daraus wird der Plan für jeden Tag berechnet. Der Einrichtungsassistent bietet geprüfte Modelle mit gerechneten Kennzahlen: Wochenstunden, längste Dienstserie, Deckungslücken." },
    { titel: "Planen und prüfen", ziel: "plan",
      text: "Der Monatsplan zeigt alle Gruppen. Die Prüfung meldet Unterbesetzung, Ruhezeitverstöße und fehlende Qualifikationen. Der Planungsassistent füllt offene Stellen automatisch — nichts wird ohne deine Freigabe übernommen." },
    { titel: "Freigeben", ziel: "plan",
      text: "Mit der Freigabe wird der Monat verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus, und der Planstandvergleich zeigt, was sich seither geändert hat." },
    { titel: "Im laufenden Betrieb", ziel: "lage",
      text: "Das Lagebild zeigt die Besetzung von heute. Bei einer Lücke führt ein Klick zur Schnellbesetzung: Ersatz vorschlagen lassen, Folgen prüfen, eintragen — oder eine Anfrage versenden." },
  ],
  subplaner: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du bist schichtverantwortlich und fährst selbst mit. Dieser Rundgang zeigt, was du in deiner Einheit tun kannst." },
    { titel: "Was schon steht", ziel: null, diagramm: true, vorher: true,
      text: "Betrieb, Personal und Schichtfolge sind eingerichtet, der Plan ist freigegeben. Deine Aufgabe beginnt im laufenden Betrieb." },
    { titel: "Dein Lagebild", ziel: "lage",
      text: "Die Besetzung deiner Einheit für heute. Ist ein Dienst unterbesetzt, führt ein Klick zur Schnellbesetzung — mit Ersatzvorschlägen und einer Prüfung der Folgen, bevor du einteilst." },
    { titel: "Anträge entscheiden", ziel: "antraege",
      text: "Urlaubsanträge und Tauschanfragen aus deiner Einheit. Die Kapazitätsvorschau zeigt vorab, welche Wochen kippen würden, wenn du alle offenen Anträge genehmigst." },
    { titel: "Deine eigenen Dienste", ziel: "meine",
      text: "Du fährst selbst mit: eigene Schichten, Zeiten bestätigen, Verfügbarkeit pflegen, Anträge stellen. Alles wie für jede andere Person im Schichtdienst." },
  ],
  mitarbeiter: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Hier findest du deinen Dienstplan, stempelst ein und stellst Anträge. Der Rundgang dauert eine Minute." },
    { titel: "Heute", ziel: null,
      text: "Der Startbildschirm zeigt deinen Dienst des Tages mit einem großen Knopf zum Ein- und Ausstempeln. Beim Stempeln wird einmalig der Standort geprüft — gespeichert wird nur, ob du am Einsatzort warst, keine Koordinate und kein Verlauf." },
    { titel: "Mein Plan", ziel: null,
      text: "Kommende Dienste als Liste oder Monatsansicht. Ein Tipp auf einen Tag öffnet die Möglichkeiten: Tausch suchen, frei beantragen oder einen Wunsch hinterlegen." },
    { titel: "Anliegen", ziel: null,
      text: "Anträge, Krankmeldung, Tauschbörse und dein Stundenkonto. In der Tauschbörse stehen offene Gesuche aller — wer einspringen kann, meldet sich mit einem Tipp." },
    { titel: "Mehr", ziel: null,
      text: "Verfügbarkeit einstellen, Wunschdienste, Nachweise, Schwarzes Brett. Hier findest du auch den Feldmodus für größere Schrift und den Wechsel zur Rechneransicht." },
  ],
  betriebsrat: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du hast einen rein lesenden Prüfzugang — kostenfrei und ohne Eingriffsmöglichkeit. Der Rundgang zeigt, was einsehbar ist." },
    { titel: "Der Ablauf", ziel: null, diagramm: true,
      text: "So entsteht der Dienstplan. Du siehst jede Station, änderst aber nichts." },
    { titel: "Belastungsverteilung", ziel: "verteilung",
      text: "Wochenendnächte, Feiertage, Nachtdienste und kurzfristige Änderungen je Person — mit Abweichung vom Mittel. Dazu die Kennzahl Planungssicherheit: der Anteil der Änderungen mit weniger als vierzehn Tagen Vorlauf." },
    { titel: "Prüfung und Nachweise", ziel: "pruef",
      text: "Alle Befunde zu Ruhezeiten, Höchstarbeitszeit, Unterbesetzung und Einsatzeinschränkungen. Dokumentierte Unterschreitungen sind mit Begründung hinterlegt." },
    { titel: "Protokoll", ziel: "betrieb",
      text: "Änderungen am Regelwerk und an der Schichtfolge sind nachvollziehbar festgehalten." },
  ],
};

function Einfuehrung({ sitz, akt, gehZu, onClose }) {
  const m = sitz.mandant, p = sitz.person;
  const rolleId = p.rolle;
  const schritte = EINFUEHRUNG[rolleId] || EINFUEHRUNG.mitarbeiter;
  const [i, setI] = useState(Math.min((p.einfuehrung || {}).schritt || 0, schritte.length - 1));
  const s = schritte[i];
  const letzter = i === schritte.length - 1;

  const weiter = () => { if (letzter) { akt.einfuehrungFertig(); onClose(); } else { akt.einfuehrungSchritt(i + 1); setI(i + 1); } };
  const springen = () => { if (s.ziel) { akt.einfuehrungSchritt(i); gehZu(s.ziel); onClose(); } };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(24,24,20,.42)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div className="blatt" style={{ width: "min(760px,96vw)", maxHeight: "92vh", overflowY: "auto",
        padding: "28px 30px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 22, gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <Logo size={30} />
            <div>
              <Rubrik>{rolle(rolleId).label} · Schritt {i + 1} von {schritte.length}</Rubrik>
            </div>
          </div>
          <Btn size="sm" kind="quiet" onClick={() => { akt.einfuehrungFertig(); onClose(); }}>Überspringen</Btn>
        </div>

        {/* Fortschrittsbalken aus Punkten */}
        <div style={{ display: "flex", gap: 5, marginBottom: 24 }}>
          {schritte.map((_, k) => (
            <div key={k} onClick={() => { setI(k); akt.einfuehrungSchritt(k); }}
              style={{ flex: 1, height: 4, borderRadius: 2, cursor: "pointer",
                background: k <= i ? C.accentDeep : C.line, transition: "background .25s" }} />))}
        </div>

        <h2 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em", margin: "0 0 14px", lineHeight: 1.15 }}>
          {s.titel}</h2>
        <p style={{ fontSize: 15.5, color: C.dim, lineHeight: 1.65, margin: "0 0 22px", maxWidth: 640 }}>
          {s.text}</p>

        {s.diagramm && (
          <div style={{ marginBottom: 22 }}>
            <Ablaufdiagramm sitz={sitz} gehZu={gehZu} kompakt />
          </div>)}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap",
          paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
          <Btn kind="quiet" disabled={i === 0} onClick={() => { setI(i - 1); akt.einfuehrungSchritt(i - 1); }}>
            Zurück</Btn>
          <div style={{ display: "flex", gap: 10 }}>
            {s.ziel && <Btn onClick={springen}>Dorthin wechseln</Btn>}
            <Btn kind="primary" onClick={weiter}>{letzter ? "Rundgang beenden" : "Weiter"}</Btn>
          </div>
        </div>
      </div>
    </div>);
}

/* ---------------------- Ablaufansicht als eigener Punkt ------------------ */
function Ablaufansicht({ sitz, akt, gehZu }) {
  const m = sitz.mandant, p = sitz.person;
  const stationen = ABLAUF.map((st) => ({ ...st, ok: st.fertig(m), mein: meineStation(sitz, st) }));
  const meine = stationen.filter((x) => x.mein);
  const meineOffen = meine.filter((x) => !x.ok);

  return (
    <div>
      <H1 rubrik="Orientierung"
        sub="So entsteht ein Dienstplan — von der Einrichtung bis zum laufenden Betrieb. Jede Station gehört einer Rolle. Deine sind hervorgehoben, die übrigen zeigen, worauf deine Arbeit aufsetzt."
        right={<Btn onClick={akt.starteEinfuehrung}>Rundgang starten</Btn>}>
        Ablauf</H1>

      <KpiRow min={175}>
        <Kpi label="Stationen erledigt" value={`${stationen.filter((x) => x.ok).length} / ${stationen.length}`}
          tone={stationen.every((x) => x.ok) ? "ok" : "text"} />
        <Kpi label="Deine Stationen" value={meine.length} sub={ROLLE_KURZ[
          darf(sitz, "org.edit") ? "leitung" : darf(sitz, "pattern.edit") ? "planer"
            : darf(sitz, "plan.edit.unit") ? "subplaner" : "alle"]} />
        <Kpi label="Offen bei dir" value={meineOffen.length}
          tone={meineOffen.length ? "warn" : "ok"}
          sub={meineOffen.length ? meineOffen[0].titel : "nichts zu tun"} />
      </KpiRow>

      <div style={{ marginTop: 24 }}>
        <Ablaufdiagramm sitz={sitz} gehZu={gehZu} />
      </div>

      <Card style={{ marginTop: 8 }}>
        <CardHead right={<Lab>Antippen für Erklärungen</Lab>}>Alle Stationen im Einzelnen</CardHead>
        {stationen.map((st, i) => (
          <div key={st.id} style={{ padding: "18px 22px",
            borderBottom: i < stationen.length - 1 ? `1px solid ${C.lineSoft}` : "none",
            opacity: st.mein ? 1 : .68 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap", marginBottom: 9 }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, ...NUM,
                background: st.ok ? C.ok : C.line, color: st.ok ? "#fff" : C.dimmer }}>
                {st.ok ? "✓" : i + 1}</span>
              <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: "-.015em" }}>{st.titel}</span>
              <Pill size="sm" style={{ background: `${ROLLE_FARBE[st.rolle]}18`, color: ROLLE_FARBE[st.rolle] }}>
                {ROLLE_KURZ[st.rolle]}</Pill>
              {st.mein && <Pill size="sm" tone="accent">dein Bereich</Pill>}
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: st.ok ? C.ok : C.dimmer, ...NUM }}>
                {st.stand(m)}</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, maxWidth: 780 }}>{st.was}</div>
            <div style={{ fontSize: 13, color: C.dimmer, lineHeight: 1.55, marginTop: 7, maxWidth: 780 }}>
              <b style={{ color: C.dim }}>Warum:</b> {st.warum}</div>
            {st.mein && <div style={{ marginTop: 13 }}>
              <Btn size="sm" kind={st.ok ? "plain" : "primary"} onClick={() => gehZu(st.ziel)}>
                {st.ok ? "Ansehen" : "Jetzt erledigen"}</Btn></div>}
          </div>))}
      </Card>
    </div>);
}
