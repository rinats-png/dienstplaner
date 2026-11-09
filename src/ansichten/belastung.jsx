/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Avatar, Seg, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { zahl } from "../lib/format.js";
import { Sparkline, Fortschritt, Erklaerkasten } from "../gestalt/bausteine.jsx";
import { Kennzahlen, Leitraster, Seitenkarte, Punkt } from "../gestalt/ansichten.jsx";
import { ERMUEDUNG_STUFEN, ermuedungsBild } from "../lib/belastung.js";


/* ==========================================================================
   BELASTUNG — Ansicht für Planung und Leitung
   Wer trägt gerade zu viel? Nicht als Sperre, sondern als Hinweis vor der
   nächsten Planungsrunde.
   ========================================================================== */
export function Belastung({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  const [tage, setTage] = useState(28);
  const bild = useMemo(() => ermuedungsBild(m, tage), [m, tage]);
  const [offen, setOffen] = useState(null);

  const zaehl = {
    hoch: bild.filter((x) => x.e.stufe === "hoch").length,
    erhoeht: bild.filter((x) => x.e.stufe === "erhoeht").length,
    normal: bild.filter((x) => x.e.stufe === "normal").length,
  };

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Die Ruhezeitprüfung sieht immer nur zwei Dienste. Hier steht, was sich über Wochen aufbaut — Nachtanteil, Serien, Rückwärtswechsel, Stundenkonto."
        right={<Seg value={String(tage)} onChange={(v) => setTage(Number(v))}
          options={[{ id: "14", label: "14 Tage" }, { id: "28", label: "28 Tage" },
            { id: "56", label: "8 Wochen" }]} />}>
        Belastung</H1>

      <Kennzahlen kacheln={[
        { label: "Hoch", wert: zahl(zaehl.hoch), ton: "danger", hervor: zaehl.hoch ? "danger" : undefined,
          sub: "vor weiteren Einsätzen ansprechen" },
        { label: "Erhöht", wert: zahl(zaehl.erhoeht), ton: "warn", hervor: zaehl.erhoeht ? "warn" : undefined,
          sub: "bei der nächsten Planung beachten" },
        { label: "Unauffällig", wert: zahl(zaehl.normal), ton: "ok", sub: "im üblichen Rahmen" },
        { label: "Betrachtet", wert: zahl(bild.length), sub: `Personen über ${tage} Tage` }]} />

      <Leitraster seiteBreite={340}
        haupt={bild.length === 0 ? (
          <Card><Leer titel="Keine Daten"
            text="Sobald Dienste geplant und gefahren wurden, entsteht hier das Bild." /></Card>
        ) : (
          <Card>
            <CardHead right={<Lab>nach Belastung geordnet</Lab>}>Personen</CardHead>
            {bild.map(({ person: p, e }, i) => {
              const st = ERMUEDUNG_STUFEN[e.stufe];
              const auf = offen === p.id;
              return (
                <div key={p.id} style={{ borderBottom: i < bild.length - 1
                  ? `1px solid ${C.lineSoft}` : "none" }}>
                  <button onClick={() => setOffen(auf ? null : p.id)} aria-expanded={auf}
                    style={{ display: "flex", alignItems: "center", gap: 14, width: "100%",
                      padding: "13px var(--pad-x)", border: "none", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit", color: C.text,
                      background: e.stufe === "hoch" ? C.dangerLight
                        : e.stufe === "erhoeht" ? C.warnLight : "transparent" }}>
                    <Avatar person={p} size="sm" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 550 }}>
                        {p.nachname}, {p.vorname}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                        {zahl(e.dienste)} Dienste · {e.nachtanteil} % nachts
                        {e.serie > 0 ? ` · längste Serie ${e.serie} Tage` : ""}</span>
                    </span>
                    {/* Ein Balken sagt mehr als eine Zahl */}
                    <span style={{ width: 110, flexShrink: 0 }}>
                      <Fortschritt wert={Math.min(100, e.punkte)} hoehe={7}
                        ton={e.stufe === "hoch" ? "danger" : e.stufe === "erhoeht" ? "warn" : "ok"}
                        label={`Belastung ${Math.round(e.punkte)} von 100 Punkten`} /></span>
                    <Pill size="sm" tone={st.ton}>{st.label}</Pill>
                  </button>

                  {auf && (
                    <div style={{ padding: "0 var(--pad-x) 20px 62px" }}>
                      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6,
                        marginBottom: 14 }}>{st.text}</div>
                      {e.gruende.length === 0 ? (
                        <div style={{ fontSize: 13.5, color: C.dim }}>
                          Keine auffälligen Einzelwerte.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 9 }}>
                          {e.gruende.map((g, gi) => (
                            <div key={gi} style={{ display: "flex", alignItems: "center", gap: 12,
                              fontSize: 13.5 }}>
                              <span style={{ minWidth: 200, fontWeight: 550 }}>{g.was}</span>
                              <span style={{ flex: 1, color: C.dim }}>{g.wert}</span>
                              <span style={{ color: C.dim, ...NUM }}>+{g.punkte}</span>
                            </div>))}
                        </div>)}
                      <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 12.5,
                        color: C.dim, flexWrap: "wrap" }}>
                        <span>Nachtanteil {e.nachtanteil} %</span>
                        <span>Wochenenden {e.wochenendanteil} %</span>
                        <span>Rückwärtswechsel {zahl(e.wechsel)}</span>
                        <span>Stundenkonto {e.konto} h</span>
                      </div>
                    </div>)}
                </div>);
            })}
          </Card>)}
        seite={<>
          {bild.length > 0 && (
            <Seitenkarte titel="Verteilung im Betrieb" sub="Personen je Punktebereich, von 0 bis 100.">
              <Sparkline art="saeulen" hoehe={70} hervor={10}
                daten={Array.from({ length: 10 }, (_, k) => bild.filter((x) =>
                  Math.min(99, Math.floor(x.e.punkte)) >= k * 10 && Math.min(99, Math.floor(x.e.punkte)) < (k + 1) * 10).length)}
                beschriftung={`Verteilung der Belastungspunkte auf zehn Bereiche: ${zaehl.normal} unauffällig, ${zaehl.erhoeht} erhöht, ${zaehl.hoch} hoch`} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.dim, marginTop: 6 }}>
                <span>0 Punkte</span><span>100 Punkte</span></div>
            </Seitenkarte>)}
          <Seitenkarte titel="Was die Stufen bedeuten">
            {Object.entries(ERMUEDUNG_STUFEN).map(([id, st]) => (
              <div key={id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                  <Punkt ton={st.ton || "ok"} /><b>{st.label}</b>
                  <span style={{ fontSize: 12, color: C.dim }}>ab {st.ab} Punkte</span></div>
                <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginTop: 3, paddingLeft: 16 }}>{st.text}</div>
              </div>))}
          </Seitenkarte>
          <Erklaerkasten>
            Die Bewertung sperrt niemanden. Wer sperrt, wo das Gesetz es nicht verlangt,
            erzeugt Umgehungen — und dann steht die Belastung nirgends mehr. Sie ist als
            Hinweis vor der nächsten Planungsrunde gedacht, nicht als Urteil.
          </Erklaerkasten>
        </>} />
    </div>);
}
