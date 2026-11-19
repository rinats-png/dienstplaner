/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { belastbarkeit, ausfallSzenario, RESERVE_STUFEN } from "../lib/fachlogik.js";
import { C } from "../farben.js";
import { H1, Seg, Card, CardHead, Lab, klickbar, Rubrik, Pill } from "../ui/bausteine.jsx";
import { Hinweisband, Kennzahlen, Leitraster, Seitenkarte } from "../gestalt/ansichten.jsx";
import { fKurz } from "../lib/datum.js";
import { NUM } from "../ui/thema.js";
import { Zelle } from "../ui/leisten.jsx";
import { zahl, n1 } from "../lib/format.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { belastbarkeitSatz } from "../lib/fachlogik.js";

/* ==========================================================================
   BELASTBARKEIT
   Ein Plan, der heute aufgeht, sagt nichts darüber, ob er morgen noch trägt.
   Diese Ansicht beantwortet die Frage vor dem Anruf, nicht danach.
   ========================================================================== */
export function Belastbarkeit({ sitz, akt, oeffneTag }) {
  const m = sitz.mandant;
  const [wochen, setWochen] = useState(8);
  const [gewaehlt, setGewaehlt] = useState(null);
  const bl = useMemo(() => belastbarkeit(m, wochen), [m, wochen]);
  const szenarien = useMemo(() => [0.05, 0.1, 0.2, 0.3].map((a) => ausfallSzenario(m, a, 14)), [m]);
  const kritisch = bl.filter((w) => w.stufe === "ohne Reserve");
  const knapp = bl.filter((w) => w.stufe === "knapp");
  const grenze = szenarien.find((s) => !s.haltbar);

  const farbe = (stufe) => stufe === "robust" ? C.ok : stufe === "knapp" ? C.warn : C.danger;
  const flaeche = (stufe) => stufe === "robust" ? C.okLight : stufe === "knapp" ? C.warnLight : C.dangerLight;

  const befund = belastbarkeitSatz(bl, grenze);

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Eine Frage: Wie viele Krankmeldungen hält der Plan noch aus, bevor eine Schicht unterbesetzt ist? Gezählt wird nur, wer wirklich einspringen dürfte — ohne Ruhezeitverstoß und mit der geforderten Qualifikation."
        right={<Seg value={String(wochen)} onChange={(v) => setWochen(Number(v))}
          options={[{ id: "4", label: "4 Wochen" }, { id: "8", label: "8 Wochen" },
            { id: "13", label: "Quartal" }]} />}>
        Belastbarkeit</H1>

      {/* Der Befund in Worten, bevor die erste Zahl kommt. */}
      <Hinweisband ton={befund.ton === "danger" ? "danger" : befund.ton === "warn" ? "warn" : "ok"}
        titel={befund.satz}>{befund.dazu}</Hinweisband>

      <Kennzahlen kacheln={[
        { label: "Wochen ohne Reserve", wert: kritisch.length, ton: kritisch.length ? "danger" : "ok",
          hervor: kritisch.length ? "danger" : undefined,
          sub: kritisch.length ? `ab ${fKurz(kritisch[0].von)} — dort ist kein Ausfall mehr auffangbar`
            : "keine Woche steht ohne Reserve da" },
        { label: "Knappe Wochen", wert: knapp.length, ton: knapp.length ? "warn" : "ok", hervor: knapp.length ? "warn" : undefined,
          sub: "höchstens zwei gleichzeitige Ausfälle auffangbar" },
        { label: "Belastungsgrenze", wert: grenze ? `${Math.round(grenze.anteil * 100)}` : "über 30", einheit: "% der Belegschaft",
          ton: grenze && grenze.anteil <= 0.1 ? "danger" : grenze && grenze.anteil <= 0.2 ? "warn" : "ok",
          hervor: grenze && grenze.anteil <= 0.2 ? "warn" : undefined,
          sub: "fallen so viele gleichzeitig aus, reißt der Plan" }]} />

      <Leitraster seiteBreite={370}
        haupt={<>
            <Card>
        <CardHead right={<Lab>Reserve je Woche</Lab>}>Wo bricht es zuerst</CardHead>

        {/* Was die Zahlen bedeuten, steht vor den Zahlen — nicht als Fußnote
            darunter, wo es erst gelesen wird, wenn man schon geraten hat. */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.lineSoft}`,
          fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
          Jeder Balken ist eine Dienstart. Die Zahl darin sagt, wie viele Personen
          in dieser Woche <b style={{ color: C.text }}>gleichzeitig ausfallen dürften</b>,
          bevor die schwächste Schicht der Woche unterbesetzt ist.
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
            {RESERVE_STUFEN.map((s) => (
              <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
                <span style={{ width: 26, height: 16, borderRadius: 4, flexShrink: 0,
                  background: `${farbe(s.id)}1C`, borderBottom: `2px solid ${farbe(s.id)}` }} />
                <b style={{ color: farbe(s.id), fontWeight: 650 }}>{s.id}</b>
                <span style={{ color: C.dimmer }}>· {s.text}</span>
              </span>))}
          </div>
        </div>

        <div style={{ padding: 18 }}>
          {/* Ohne Mindestbesetzung gibt es nichts zu tragen — dann stünden hier
              acht leere Zeilen mit dem Urteil „robust", was schlicht falsch
              klingt. Besser sagen, woran es liegt. */}
          {bl.every((w) => !w.zeilen.length) && (
            <div style={{ padding: "18px 12px", fontSize: 13.5, color: C.dim, lineHeight: 1.6 }}>
              Für keine Dienstart ist eine Mindestbesetzung hinterlegt — ohne sie lässt sich
              nicht sagen, ab wann eine Schicht unterbesetzt ist. Die Mindestbesetzung je
              Wochentag steht unter <b style={{ color: C.text }}>Dienstarten</b>.
            </div>)}
          {bl.map((w) => w.zeilen.length === 0 ? null : (
            <div key={w.kw} aria-expanded={gewaehlt === w.kw}
              {...klickbar(() => setGewaehlt(gewaehlt === w.kw ? null : w.kw), `Kalenderwoche ${w.kw}`)}
              style={{ marginBottom: 6, borderRadius: 10, cursor: "pointer",
                background: gewaehlt === w.kw ? flaeche(w.stufe) : "transparent",
                outline: gewaehlt === w.kw ? `1.5px solid ${farbe(w.stufe)}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px" }}>
                <span style={{ fontSize: 12.5, color: C.dim, minWidth: 76, ...NUM }}>
                  ab {fKurz(w.von)}</span>
                <div style={{ flex: 1, display: "flex", gap: 3 }}>
                  {w.zeilen.map((z) => (
                    <div key={z.da.id}
                      title={`${z.da.name}: verkraftet ${z.min} gleichzeitige Ausfälle in der schwächsten Schicht dieser Woche`}
                      style={{ flex: 1, height: 26, borderRadius: 6, display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 11, fontWeight: 650,
                        background: `${farbe(z.stufe)}1C`, color: farbe(z.stufe),
                        borderBottom: `2px solid ${farbe(z.stufe)}` }}>
                      {z.da.kurz} {z.min}</div>))}
                </div>
                <span style={{ minWidth: 96, textAlign: "right", fontSize: 12.5, fontWeight: 600,
                  color: farbe(w.stufe) }}>{w.stufe}</span>
              </div>

              {gewaehlt === w.kw && (
                <div style={{ padding: "4px 12px 14px" }}>
                  <table className="raster" style={{ background: C.flaeche, borderRadius: 8 }}>
                    <thead><tr>{["Dienst", "verkraftet am schwächsten Tag", "im Wochenschnitt",
                      "schwächster Tag"].map((h, i) => (
                      <th key={i} style={{ textAlign: i ? "right" : "left" }}>{h}</th>))}</tr></thead>
                    <tbody>
                      {w.zeilen.slice().sort((a, b) => a.min - b.min).map((z) => (
                        <tr key={z.da.id}>
                          <td><Zelle da={z.da} size={22} /> <span style={{ marginLeft: 8 }}>{z.da.name}</span></td>
                          <td style={{ textAlign: "right", fontWeight: 650, color: farbe(z.stufe), ...NUM }}>
                            {zahl(z.min)} {z.min === 1 ? "Ausfall" : "Ausfälle"}</td>
                          <td style={{ textAlign: "right", color: C.dim, ...NUM }}>{n1(z.schnitt)}</td>
                          <td style={{ textAlign: "right", ...NUM }}>
                            {z.minTag ? (
                              <button className="btn btn-sm btn-quiet" onClick={(e) => { e.stopPropagation();
                                oeffneTag(z.minTag); }}>{fKurz(z.minTag)}</button>) : "—"}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>)}
            </div>))}
        </div>
        <div style={{ padding: "0 20px 18px", fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
          Die Zahl setzt sich aus zwei Teilen zusammen: den bereits über der Mindestbesetzung
          eingeteilten Personen und allen, die kurzfristig einspringen dürften. Wer wegen
          Ruhezeit, fehlender Qualifikation oder eigener Abwesenheit nicht einspringen darf,
          zählt nicht mit — deshalb steht hier oft eine kleinere Zahl, als die Personalliste
          vermuten lässt. Eine Woche anklicken zeigt die Dienste einzeln.
        </div>
      </Card>

        </>}
        seite={<>
          <Seitenkarte titel="Was passiert bei einer Krankheitswelle"
            sub={'Vier Durchrechnungen für die nächsten vierzehn Tage: Was bricht, wenn 5, 10, 20 oder 30 Prozent der Belegschaft gleichzeitig krank werden? „Hält" heißt, dass keine Schicht ganz unbesetzt bliebe und kaum neue Regelverstöße entstünden.'}>
            <div style={{ display: "grid", gap: 10 }}>
              {szenarien.map((s) => (
                <div key={s.anteil} className="karte-still" style={{ padding: "14px 16px",
                  borderColor: s.haltbar ? undefined : C.danger }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Rubrik>{Math.round(s.anteil * 100)} % fallen aus</Rubrik>
                    <Pill size="sm" tone={s.haltbar ? "ok" : "danger"}>{s.haltbar ? "hält" : "reißt"}</Pill>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-.04em", ...NUM,
                      color: s.haltbar ? C.text : C.danger }}>{s.neu < 0 ? "−" : "+"}{Math.abs(s.neu)}</span>
                    <span style={{ fontSize: 12.5, color: C.dim }}>zusätzliche Regelverstöße gegenüber heute</span>
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}`,
                    display: "grid", gap: 4, fontSize: 12.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.dim }}>Betroffene</span><span style={NUM}>{s.betroffen} Personen</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.dim }}>Unterbesetzte Dienste</span>
                      <span style={{ ...NUM, color: s.unter ? C.warn : C.dim }}>{s.unter}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.dim }}>Ganz ohne Besetzung</span>
                      <span style={{ ...NUM, color: s.leer ? C.danger : C.dim }}>{s.leer}</span></div>
                  </div>
                </div>))}
            </div>
          </Seitenkarte>
          <Erklaerkasten>
            Gerechnet über die nächsten vierzehn Tage. Der Ausfall wird gleichmäßig über die Belegschaft
            verteilt, nicht zufällig — ein Zufallsergebnis wäre bei jedem Aufruf anders und damit
            wertlos. Eine echte Welle trifft meist eine Einheit stärker; der reale Verlauf ist also
            eher schlechter als hier gezeigt.
          </Erklaerkasten>
        </>} />
    </div>);
}
