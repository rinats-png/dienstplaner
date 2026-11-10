/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { einheitAm, einheitDienst } from "../../server/lib/fachpruefung.mjs";
import { pad, pISO, dow, dim_, dauer } from "../regelwerk.js";
import { C } from "../farben.js";
import { Card, Lab, Schalter, Filterleiste, Planzelle, Btn, Sel, H1 } from "../ui/bausteine.jsx";
import { Scrollbereich } from "../ui/scrollbereich.jsx";
import { lesbar, NUM } from "../ui/thema.js";
import { DOW, MON, heute, fLang } from "../lib/datum.js";
import { n1 } from "../lib/format.js";
import { Zeitwahl } from "../gestalt/ansichten.jsx";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { Freigabeleiste } from "./freigabeleiste.jsx";
import { Wochenliste } from "./wochenliste.jsx";
import { TeamAuslastungLeiste } from "./teamauslastungleiste.jsx";
import { Tagesfazit } from "./tagesfazit.jsx";
import { Standortwahl, Standortleiste, Zelle } from "../ui/leisten.jsx";
import { aktive, abwesenheitAm, besetzung, teamAuslastung, ALLE_STANDORTE, einheitenAmStandort } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { anzahlWort } from "../lib/rollen.js";
import { zelleBedienbar } from "../ui/raster.js";
import { monatsLage } from "../lib/planhilfen.js";


export function Monatsplan({ sitz, ym, setYm, oeffneTag, akt, schmal,
  standortId = ALLE_STANDORTE, setStandortId = () => {} }) {
  const [suche, setSuche] = useState("");
  const [filterDienst, setFilterDienst] = useState("");
  const [nurKnapp, setNurKnapp] = useState(false);
  const m = sitz.mandant;
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const d0 = heute();
  const bes = useMemo(() => Object.fromEntries(tage.map((d) => [d, besetzung(m, d)])), [m, ym]);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const lage = useMemo(() => monatsLage(m, tage, bes), [m, ym, bes]);
  const ta = useMemo(() => teamAuslastung(m, ym, tage[0], standortId), [m, ym, standortId]);
  /* Nur die Einheiten des gewählten Standorts erscheinen im Raster. Die
     Besetzungszeilen darunter bleiben, wie sie sind — eine Dienstart ist
     eine Eigenschaft des Betriebs, nicht eines Hauses. */
  const einheiten = einheitenAmStandort(m, standortId);
  const stName = standortId === ALLE_STANDORTE ? null
    : ((m.standorte || []).find((s) => s.id === standortId) || {}).name;

  return (
    <div>
      <H1 sub={`${stName || m.name} · ${anzahlWort(einheiten.length, m.einheitLabel)}`}
        right={<div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }} className="noprint">
          <Standortwahl m={m} wert={standortId} setWert={setStandortId} breit={180} />
          {darf(sitz, "plan.view.unit") && <Btn onClick={() => akt.aushangPDF(ym, sitz.person.bereich !== "ALLE"
            ? sitz.person.bereich : (einheiten.find((x) => !x.pool) || {}).id)}>Aushang</Btn>}
          {darf(sitz, "plan.edit.unit") && <Btn onClick={akt.oeffneMehrfach}>Mehrfach ändern</Btn>}
          {darf(sitz, "pattern.edit") && <Btn onClick={akt.oeffneWizard}>Einrichtung</Btn>}
          {darf(sitz, "plan.edit.all") && <Btn kind="primary" onClick={akt.oeffneAssistent}>Planungsassistent</Btn>}
          <Zeitwahl onZurueck={() => shift(-1)} onHeute={() => setYm(d0.slice(0, 7))} onWeiter={() => shift(1)} /></div>}>{MON[mo - 1]} {y}</H1>

      <Freigabeleiste sitz={sitz} ym={ym} akt={akt} />

      {standortId === ALLE_STANDORTE && (
        <Standortleiste m={m} wert={standortId} setWert={setStandortId} />)}

      <TeamAuslastungLeiste ta={ta} />

      <Tagesfazit lage={lage} onTag={oeffneTag} />

      {/* Auf dem Telefon tritt die Liste an die Stelle des Rasters. Kein
          geschrumpftes Raster, sondern eine eigene Form. */}
      {schmal ? <Wochenliste sitz={sitz} ym={ym} oeffneTag={oeffneTag} bes={bes} lage={lage} /> : <>

      <Filterleiste suche={suche} setSuche={setSuche} platzhalter={`${m.einheitLabel} oder Dienstart …`}
        rechts={<>
          <Sel value={filterDienst} aria-label="Nach Dienstart filtern"
            onChange={(ev) => setFilterDienst(ev.target.value)} style={{ minWidth: 150 }}>
            <option value="">alle Dienstarten</option>
            {m.dienstarten.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <Schalter an={nurKnapp} onChange={() => setNurKnapp(!nurKnapp)} />
            <span style={{ fontSize: 13, color: C.dim }}>nur knappe Tage</span></label>
          <Btn size="sm" kind="quiet" onClick={() => { setSuche(""); setFilterDienst(""); setNurKnapp(false); }}>
            Zurücksetzen</Btn>
        </>} />

      <Card>
        <Scrollbereich label="Monatsplan, Tabelle mit allen Tagen des Monats">
        <table role="grid" aria-label="Monatsplan — mit den Pfeiltasten bewegen, Eingabetaste öffnet den Tag"
          style={{ borderCollapse: "collapse", width: "100%", minWidth: 1040 }}>
          <thead>
            {/* Eine Zeile, die den ganzen Monat beantwortet: Höhe des Strichs
                ist die Dringlichkeit. Wer nur hier hinsieht, weiß Bescheid. */}
            <tr className="noprint">
              <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.flaeche, textAlign: "left",
                padding: "10px 20px 4px", minWidth: 160 }}><Lab>Aufmerksamkeit</Lab></th>
              {tage.map((d) => { const t = lage.tage.find((x) => x.datum === d);
                return (<th key={d}
                  {...zelleBedienbar(() => oeffneTag(d),
                    `Aufmerksamkeit · ${fLang(d)}${t ? ` · ${t.text}` : " · unauffällig"}`, d === tage[0])}
                  style={{ padding: "10px 0 4px", cursor: "pointer", verticalAlign: "bottom" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: 18 }}>
                    <span style={{ width: "58%", borderRadius: 2,
                      height: t ? (t.stufe === 2 ? 16 : 9) : 3,
                      background: t ? (t.stufe === 2 ? C.danger : C.warn) : C.line,
                      opacity: t ? 1 : .55 }} /></div></th>); })}
            </tr>
            <tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.flaeche, textAlign: "left",
              padding: "15px 20px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 160 }}><Lab>{m.einheitLabel}</Lab></th>
            {tage.map((d) => { const fei = feiertag(d, m.bundesland), we = dow(d) >= 5;
              const eng = Object.values(bes[d]).some((x) => x.status !== "ok");
              const blass = nurKnapp && !eng;
              return (<th key={d}
                {...zelleBedienbar(() => oeffneTag(d),
                  `Tag · ${fLang(d)}${fei ? ` · ${fei}` : ""}${eng ? " · Engpass" : ""}`)}
                style={{ padding: "9px 0 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 33, cursor: "pointer",
                  opacity: blass ? .3 : 1,
                  /* Nur noch der Kalender: Wochenende und Feiertag teilen sich
                     denselben stillen Ton. Vorher trug ein Feiertag C.dangerLight
                     — dieselbe Farbe wie eine Unterbesetzung, was beides
                     ununterscheidbar machte. */
                  background: d === d0 ? C.accentLight : (fei || we) ? C.flaecheStill : "transparent",
                  boxShadow: d === d0 ? `inset 0 -2px 0 ${C.accent}` : "none" }}>
                <div style={{ fontSize: 10.5, color: fei ? C.warn : we ? C.dim : C.dimmer, fontWeight: fei ? 700 : 500 }}>{fei ? "Fei" : DOW[dow(d)]}</div>
                <div style={{ fontSize: 13, color: d === d0 ? C.accent : C.text, fontWeight: d === d0 ? 700 : 500, ...NUM }}>{pad(pISO(d).getDate())}</div>
              </th>); })}
          </tr></thead>
          <tbody>
            {einheiten.filter((e) => !suche.trim()
              || e.name.toLowerCase().includes(suche.trim().toLowerCase())).map((e) => (
              <tr key={e.id} className="row">
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.flaeche, padding: "11px 20px",
                  borderBottom: `1px solid ${C.lineSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: lesbar(e.farbe, 3), flexShrink: 0 }} />
                    <div><div style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</div>
                      <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                        {aktive(m, tage[0]).filter((p) => einheitAm(p, tage[0]) === e.id).length} Pers. · Versatz {e.versatz}</div></div>
                  </div></td>
                {tage.map((d) => {
                  const da = map[einheitDienst(m, e.id, d)];
                  const fehlt = aktive(m, d).filter((p) => einheitAm(p, d) === e.id && abwesenheitAm(m, p.id, d)).length;
                  return (<td key={d}
                    {...zelleBedienbar(() => oeffneTag(d),
                      `${fLang(d)} · ${e.name}${da ? ` · ${da.name}` : " · frei"}${fehlt > 0 ? ` · ${fehlt} abwesend` : ""}`)}
                    style={{ padding: "6px 2px", textAlign: "center",
                    borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer",
                    background: d === d0 ? C.accentLight
                      : (dow(d) >= 5 || feiertag(d, m.bundesland)) ? C.flaecheStill : "transparent" }}>
                    {/* Vorher stand hier „−2". Das liest sich wie eine
                        Unterbesetzung, gemeint sind aber Abwesende — und ob
                        der Dienst dadurch unterbesetzt ist, sagen erst die
                        Besetzungszeilen weiter unten. */}
                    <Planzelle da={da} unten={fehlt > 0 ? `${fehlt} ab` : null} aktiv={d === d0} />
                  </td>); })}
              </tr>))}
            {m.dienstarten.filter((da) => (!filterDienst || da.id === filterDienst)
              && (!suche.trim() || da.name.toLowerCase().includes(suche.trim().toLowerCase())
                || da.kurz.toLowerCase().includes(suche.trim().toLowerCase()))).map((da, i) => (
              <tr key={da.id}>
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.flaeche, padding: "9px 20px",
                  borderTop: i === 0 ? `2px solid ${C.line}` : `1px solid ${C.lineSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Zelle da={da} size={21} />
                    <div><div style={{ fontSize: 12.5 }}>{da.name}</div>
                      <div style={{ fontSize: 11, color: C.dimmer }}>{da.ort}</div></div></div></td>
                {tage.map((d) => { const b = bes[d][da.id];
                  const col = b.status === "ok" ? C.dim : b.status === "warn" ? C.warn : C.danger;
                  const anteil = Math.min(100, Math.round((b.anzahl / Math.max(1, b.soll)) * 100));
                  const kalender = dow(d) >= 5 || feiertag(d, m.bundesland);
                  return (<td key={d}
                    {...zelleBedienbar(() => oeffneTag(d),
                      `${fLang(d)} · ${da.name} · ${b.anzahl} von ${b.soll}${b.qualFehlt ? " · Fachkraftquote nicht erfüllt" : ""}`)}
                    style={{ textAlign: "center", padding: "5px 1px", cursor: "pointer",
                      /* Fläche trägt den Kalender, nicht den Zustand. Der
                         Zustand steht in Zahl und Füllstand — „3/4" sagt, wie
                         weit es fehlt, eine rote Fläche sagt nur, dass etwas
                         fehlt. */
                      background: d === d0 ? C.accentLight : kalender ? C.flaecheStill : "transparent",
                      borderTop: i === 0 ? `2px solid ${C.line}` : `1px solid ${C.lineSoft}` }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{ fontSize: 11.5, lineHeight: 1.1, ...NUM }}>
                        <span style={{ color: col, fontWeight: b.status === "ok" ? 500 : 700 }}>{b.anzahl}</span>
                        <span style={{ color: C.dimmer, fontSize: 9.5 }}>/{b.soll}</span></div>
                      <div style={{ width: "72%", height: 3, borderRadius: 2, background: C.lineSoft, overflow: "hidden" }}>
                        <div style={{ width: `${anteil}%`, height: "100%",
                          background: b.status === "ok" ? C.ok : b.status === "warn" ? C.warn : C.danger }} /></div>
                      {b.qualFehlt && <div title="Fachkraftquote nicht erfüllt"
                        style={{ width: 5, height: 5, borderRadius: 3, background: C.danger }} />}
                    </div></td>); })}
              </tr>))}
          </tbody>
        </table>
        </Scrollbereich>
      </Card>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 18 }}>
        {m.dienstarten.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Zelle da={d} size={21} />
            <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{d.name} · {d.start}–{d.ende} · {n1(dauer(d))} h</span>
          </div>))}
      </div>
      </>}
    </div>);
}
