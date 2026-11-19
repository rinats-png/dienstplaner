/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect, useMemo } from "react";
import { C } from "../farben.js";
import { Leer, Card, Rubrik, Filterleiste, Btn, H1 } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { Icon } from "../gestalt/icons.jsx";
import { Fortschritt, Checkliste, Erklaerkasten } from "../gestalt/bausteine.jsx";
import { Seitenkarte, Hinweisband } from "../gestalt/ansichten.jsx";
import { _handbuch, handbuchAbschnitte, handbuchKapitel, handbuchLaden } from "../lib/handbuch.js";


/* ==========================================================================
   HANDBUCHANSICHT
   Zwei Nutzungsarten in einer Ansicht: durchgehend lesen bei der Einrichtung,
   gezielt nachschlagen im laufenden Betrieb. Deshalb Kapitelliste links,
   Suche oben und ein Haken je Abschnitt.
   ========================================================================== */
export function Handbuch({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  /* Der Inhalt wird erst beim Öffnen geholt. Bis dahin steht hier ein
     Gerüst — kein Drehrad und kein leerer Bildschirm. */
  const [alle, setAlle] = useState(_handbuch);
  const [ladefehler, setLadefehler] = useState(null);
  useEffect(() => {
    if (alle) return;
    let weg = false;
    handbuchLaden().then((h) => { if (!weg) setAlle(h); })
      .catch(() => { if (!weg) setLadefehler(true); });
    return () => { weg = true; };
  }, [alle]);

  const kapitel = useMemo(() => handbuchKapitel(alle, m), [alle, m]);
  const [offen, setOffen] = useState(null);
  const [suche, setSuche] = useState("");
  const gelesen = (sitz.person.handbuch || []);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (s.length < 2) return null;
    return handbuchAbschnitte(alle, m).filter((a) =>
      `${a.titel} ${a.text} ${(a.schritte || []).join(" ")} ${a.merke || ""} ${a.kapitel}`
        .toLowerCase().includes(s));
  }, [suche, alle, m]);

  if (ladefehler) return (
    <div>
      <H1>Handbuch</H1>
      <Card>
        <Leer titel="Das Handbuch ließ sich nicht nachladen" symbol="offline"
          text="Der Inhalt wird beim Öffnen geholt; dabei ist die Verbindung abgebrochen. Alles andere in der Anwendung ist davon nicht betroffen."
          aktion={<Btn kind="primary" onClick={() => { setLadefehler(null); handbuchLaden()
            .then(setAlle).catch(() => setLadefehler(true)); }}>Erneut versuchen</Btn>} />
      </Card>
    </div>);

  if (!alle) return (
    <div>
      <H1 sub="Wird geholt …">Handbuch</H1>
      <div className="handbuchraster">
        <div className="pulsiert karte" style={{ height: 300 }} />
        <div className="pulsiert karte" style={{ height: 420 }} />
      </div>
      <div className="nurLeser" role="status" aria-live="polite">Handbuch wird geladen</div>
    </div>);

  const k = kapitel.find((x) => x.id === offen) || kapitel[0];
  const anteil = Math.round((gelesen.length /
    Math.max(1, kapitel.reduce((a, x) => a + x.abschnitte.length, 0))) * 100);

  const Abschnitt = ({ a, kapId, kapZiel }) => {
    const schluessel = `${kapId}:${a.titel}`;
    const ok = gelesen.includes(schluessel);
    return (
      <Card style={{ padding: 26, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <button type="button" onClick={() => akt.handbuchHaken(schluessel)}
            aria-label={ok ? "Als ungelesen markieren" : "Als erledigt markieren"}
            style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, cursor: "pointer",
              marginTop: 2, border: `1.5px solid ${ok ? C.ok : C.steuer}`,
              background: ok ? C.ok : "transparent", color: C.aufAkzent, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
            {ok ? <Icon n="haken" size={15} strokeWidth={2.4} /> : null}</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 18, fontWeight: 640, letterSpacing: "-.02em", margin: 0,
              opacity: ok ? .6 : 1 }}>{a.titel}</h3>
            {suche && <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{a.kapitel}</div>}
          </div>
        </div>

        <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.65, margin: "0 0 18px" }}>{a.text}</p>

        {a.schritte && (
          <ol style={{ margin: "0 0 18px", padding: 0, listStyle: "none", counterReset: "s" }}>
            {a.schritte.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 13, padding: "8px 0", fontSize: 14,
                lineHeight: 1.6, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
                  background: C.accentLight, color: C.accent, fontSize: 11.5, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", ...NUM }}>{i + 1}</span>
                <span>{s}</span>
              </li>))}
          </ol>)}

        {a.pruefen && (
          <Hinweisband ton="ok" style={{ boxShadow: "none", marginBottom: 12, background: C.okLight }}
            titel={<span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em",
              textTransform: "uppercase", color: C.ok }}>Woran du merkst, dass es geklappt hat</span>}>
            <span style={{ fontSize: 13.5, lineHeight: 1.6, color: C.text }}>{a.pruefen}</span>
          </Hinweisband>)}

        {a.merke && <Erklaerkasten style={{ fontSize: 13.5, lineHeight: 1.6 }}>{a.merke}</Erklaerkasten>}

        {(kapZiel || a.ziel) && !suche && (
          <div style={{ marginTop: 16 }}>
            <Btn size="sm" onClick={() => gehZu(kapZiel || a.ziel)}>Dorthin wechseln</Btn>
          </div>)}
      </Card>);
  };

  return (
    <div>
      <H1 rubrik="Hilfe"
        sub="Ein durchgehender Weg von der leeren Anwendung bis zum laufenden Betrieb — und danach ein Nachschlagewerk. Jeder Schritt nennt, woran du merkst, dass es geklappt hat."
        right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={akt.druckeHandbuch}>Als PDF drucken</Btn>
        </div>}>
        Handbuch</H1>

      <Filterleiste suche={suche} setSuche={setSuche} platzhalter="Im Handbuch suchen …" label="Im Handbuch suchen"
        rechts={<>
          {treffer && <span style={{ fontSize: 13, color: C.dim, ...NUM }}>
            {treffer.length} {treffer.length === 1 ? "Abschnitt" : "Abschnitte"}</span>}
          {suche && <Btn size="sm" kind="quiet" onClick={() => setSuche("")}>Zurücksetzen</Btn>}
          {gelesen.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 90 }}><Fortschritt wert={anteil} ton="ok" hoehe={6} label="Handbuch gelesen" /></span>
              <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>{anteil} % durch</span>
            </span>)}
        </>} />

      {treffer ? (
        treffer.length === 0
          ? <Leer titel="Nichts gefunden" text="Versuch einen anderen Begriff — etwa „Ruhezeit“, „Urlaub“ oder „Zuschlag“." />
          : treffer.map((a, i) => <Abschnitt key={i} a={a} kapId={a.kapitelId} kapZiel={a.ziel} />)
      ) : (
        <div className="handbuchraster">

          {/* --------------------- Kapitelliste --------------------- */}
          <Card className="kapitelliste">
            {kapitel.map((x, i) => {
              const fertig = x.abschnitte.every((a) => gelesen.includes(`${x.id}:${a.titel}`));
              const an = x.id === offen;
              return (
                <button key={x.id} onClick={() => setOffen(x.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
                    padding: "14px 16px", border: "none", cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit", color: C.text,
                    background: an ? C.accentLight : "transparent",
                    borderLeft: `3px solid ${an ? C.accent : "transparent"}`,
                    borderBottom: i < kapitel.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, ...NUM,
                    background: fertig ? C.ok : an ? C.accent : C.flaecheStill,
                    color: fertig || an ? C.aufAkzent : C.dim }}>{fertig ? <Icon n="haken" size={13} strokeWidth={2.4} /> : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: an ? 640 : 550,
                      lineHeight: 1.35 }}>{x.titel}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.dim, marginTop: 3 }}>
                      {x.dauer} · {x.abschnitte.length} {x.abschnitte.length === 1 ? "Abschnitt" : "Abschnitte"}</span>
                  </span>
                </button>);
            })}
          </Card>

          {/* ----------------------- Kapitel ------------------------ */}
          <div>
            {k && (<>
              <div style={{ marginBottom: 22 }}>
                <Rubrik>{k.dauer}</Rubrik>
                <h2 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em",
                  margin: "10px 0 10px" }}>{k.titel}</h2>
                <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.6, margin: 0, maxWidth: 620 }}>
                  {k.einleitung}</p>
              </div>
              {k.abschnitte.map((a, i) => <Abschnitt key={i} a={a} kapId={k.id} kapZiel={k.ziel} />)}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <Btn kind="quiet" disabled={kapitel.indexOf(k) === 0}
                  onClick={() => setOffen(kapitel[kapitel.indexOf(k) - 1].id)}>Vorheriges Kapitel</Btn>
                <Btn kind="primary" disabled={kapitel.indexOf(k) === kapitel.length - 1}
                  onClick={() => { setOffen(kapitel[kapitel.indexOf(k) + 1].id);
                    window.scrollTo({ top: 0, behavior: "smooth" }); }}>Nächstes Kapitel</Btn>
              </div>
            </>)}
          </div>

          {/* ------------------ Stand in diesem Kapitel ------------------ */}
          {k && (
            <div className="rechts">
              <Seitenkarte titel="In diesem Kapitel"
                sub={`${k.abschnitte.filter((a) => gelesen.includes(`${k.id}:${a.titel}`)).length} von ${k.abschnitte.length} als erledigt markiert`}>
                <Checkliste punkte={k.abschnitte.map((a) => ({ text: a.titel,
                  erledigt: gelesen.includes(`${k.id}:${a.titel}`),
                  onClick: () => akt.handbuchHaken(`${k.id}:${a.titel}`) }))} />
              </Seitenkarte>
            </div>)}
        </div>)}
    </div>);
}
