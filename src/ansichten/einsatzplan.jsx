/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { dim_, pad, dow, pISO } from "../regelwerk.js";
import { heute, MON, DOW, fKurz } from "../lib/datum.js";
import { darfEinheit, offeneAbweichungen, useSchutzkonflikte, aktive, abwesenheitAm, istStunden, sollStunden, personTag } from "../lib/fachlogik.js";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { H1, Seg, Lab, Card, klickbar } from "../ui/bausteine.jsx";
import { Scrollbereich } from "../ui/scrollbereich.jsx";
import { darf } from "../lib/berechtigung.js";
import { Zeitwahl } from "../gestalt/ansichten.jsx";
import { C } from "../farben.js";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { NUM } from "../ui/thema.js";
import { rolle } from "../lib/rollen.js";
import { Zelle } from "../ui/leisten.jsx";
import { WARNSTUFEN, befundText } from "../warnstufen.js";
import { ISTDATEN_TEXT } from "../istdaten.js";
import { n1, sgn } from "../lib/format.js";

/* ============================== EINSATZPLAN ============================== */
export function Einsatzplan({ sitz, ym, setYm, akt, oeffnePerson }) {
  const m = sitz.mandant;
  const eigene = sitz.person.bereich !== "ALLE" ? sitz.person.bereich : m.einheiten[0].id;
  const [eid, setEid] = useState(eigene);
  const [pinsel, setPinsel] = useState(m.dienstarten[0].id);
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const d0 = heute();
  const editierbar = darfEinheit(sitz, eid);
  const [suche, setSuche] = useState("");
  const [nurAbw, setNurAbw] = useState(false);
  const planVon = tage[0], planBis = tage[tage.length - 1];
  const bestaetigt = useMemo(() => offeneAbweichungen(m, planVon, planBis), [m, planVon, planBis]);
  const schutzkonflikte = useSchutzkonflikte(sitz);
  const leute = useMemo(() => {
    let l = aktive(m, tage[0]).filter((p) => einheitAm(p, tage[0]) === eid);
    const s2 = suche.trim().toLowerCase();
    if (s2) l = l.filter((p) => `${p.vorname} ${p.nachname} ${p.funktion}`.toLowerCase().includes(s2));
    if (nurAbw) l = l.filter((p) => tage.some((d) => m.abweichungen[`${p.id}|${d}`] !== undefined
      || abwesenheitAm(m, p.id, d)));
    return l;
  }, [m, eid, tage, suche, nurAbw]);

  const klick = (p, d) => {
    if (!editierbar) return;
    const cur = m.abweichungen[`${p.id}|${d}`];
    if (cur === undefined) akt.setzeAbweichung(p.id, d, pinsel);
    else if (cur === pinsel) akt.setzeAbweichung(p.id, d, "-");
    else akt.loescheAbweichung(p.id, d);
  };

  return (
    <div>
      <H1 sub="Klick auf ein Feld: Abweichung setzen, dann frei, dann zurück auf den Sollplan."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }} className="noprint">
          <Seg value={eid} onChange={setEid} options={m.einheiten.filter((e) => darf(sitz, "plan.view.all") || e.id === sitz.person.bereich || sitz.person.bereich === "ALLE")
            .map((e) => ({ id: e.id, label: e.name.replace(m.einheitLabel, "").trim() || e.name }))} />
          <Zeitwahl mitte={`${MON[mo - 1]} ${y}`}
            onZurueck={() => { const d = new Date(y, mo - 2, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }}
            onWeiter={() => { const d = new Date(y, mo, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }} />
        </div>}>Personaleinsatz</H1>

      {editierbar && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16, flexWrap: "wrap" }} className="noprint">
          <Lab>Abweichung eintragen als</Lab>
          {m.dienstarten.map((d) => (
            <button key={d.id} type="button" onClick={() => setPinsel(d.id)} className="chip" aria-pressed={pinsel === d.id}
              style={{ background: pinsel === d.id ? `${d.farbe}22` : C.flaeche, color: pinsel === d.id ? d.farbe : C.dim,
                borderColor: pinsel === d.id ? d.farbe : undefined, fontWeight: 600 }}>
              {d.kurz}</button>))}
        </div>)}

      <Card>
        <Scrollbereich label="Personaleinsatz, Tabelle mit allen Tagen des Monats">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1060 }}>
          <thead><tr>
            <th style={{ position: "sticky", left: 0, background: C.flaeche, zIndex: 2, textAlign: "left",
              padding: "15px 20px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 200 }}><Lab>Person</Lab></th>
            {tage.map((d) => { const fei = feiertag(d, m.bundesland);
              return (<th key={d} style={{ padding: "9px 0 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 29,
                background: d === d0 ? C.accentLight : fei ? C.dangerLight : dow(d) >= 5 ? C.flaecheStill : "transparent" }}>
                <div style={{ fontSize: 9.5, color: C.dimmer }}>{DOW[dow(d)]}</div>
                <div style={{ fontSize: 12, color: d === d0 ? C.accent : C.dim, fontWeight: 500, ...NUM }}>{pad(pISO(d).getDate())}</div></th>); })}
            <th style={{ padding: "9px 16px", borderBottom: `1px solid ${C.lineSoft}`, borderLeft: `1px solid ${C.lineSoft}` }}><Lab>Ist/Soll</Lab></th>
          </tr></thead>
          <tbody>{leute.map((p) => {
            const ist = istStunden(m, p, ym), soll = sollStunden(m, p, ym);
            const diff = ist.nichtVerfuegbar ? null : ist.gesamt - soll;
            return (<tr key={p.id} className="row">
              <td {...klickbar(() => oeffnePerson(p.id), `${p.nachname}, ${p.vorname} öffnen`)}
                style={{ position: "sticky", left: 0, background: C.flaeche,
                zIndex: 1, padding: "8px 20px", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer" }}>
                <div style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{p.nachname}, {p.vorname}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer }}>{p.funktion} · {rolle(p.rolle).kurz}</div></td>
              {tage.map((d) => { const t = personTag(m, p, d);
                return (<td key={d}
                  {...klickbar(editierbar ? () => klick(p, d) : null,
                    `${p.nachname}, ${p.vorname} am ${fKurz(d)}: ${map[t.dienstId] ? map[t.dienstId].name : "frei"}`)}
                  style={{ padding: "4px 1px", textAlign: "center",
                  borderBottom: `1px solid ${C.lineSoft}`, cursor: editierbar ? "pointer" : "default",
                  background: t.quelle === "abweichung" ? C.warnLight : d === d0 ? C.accentLight : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
                    <Zelle da={map[t.dienstId]} abw={t.abwesenheit} size={23} />
                    {schutzkonflikte.has(`${p.id}|${d}`) && (
                      /* Offener Schutzkonflikt (A2): bleibt markiert, bis umgeplant ist. */
                      <span title="Einteilung widerspricht einer Schutz- oder Einsatzregel der Person — bitte umplanen"
                        aria-label="Schutzkonflikt" style={{ position: "absolute", inset: -1, border: `2px solid ${C.danger}`,
                          borderRadius: 6, pointerEvents: "none" }} />)}
                    {(() => { const b = bestaetigt.get(`${p.id}|${d}`);
                      if (!b) return null;
                      /* Bewusst bestätigte Abweichung: bleibt sichtbar, bis sie behoben ist. */
                      return <span title={`${(WARNSTUFEN[b.stufe] || WARNSTUFEN.hinweis).label} bestätigt: ${(b.befunde || []).map((x) => x.text || befundText(x.regel)).join(" · ")}`}
                        aria-label={`${(WARNSTUFEN[b.stufe] || WARNSTUFEN.hinweis).label} bestätigt`}
                        style={{ position: "absolute", top: -2, right: 1, width: 7, height: 7, borderRadius: 4,
                          background: b.stufe === "recht" ? C.danger : C.warn, border: `1px solid ${C.flaeche}` }} />; })()}
                  </div></td>); })}
              <td style={{ padding: "8px 16px", borderBottom: `1px solid ${C.lineSoft}`, borderLeft: `1px solid ${C.lineSoft}`, whiteSpace: "nowrap" }}>
                {ist.nichtVerfuegbar ? (
                  <div title={ISTDATEN_TEXT} style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>–/{n1(soll)}</div>
                ) : (<>
                  <div style={{ fontSize: 12.5, ...NUM }}>{n1(ist.gesamt)}/{n1(soll)}</div>
                  <div style={{ fontSize: 11.5, color: Math.abs(diff) < 6 ? C.dimmer : diff > 0 ? C.warn : C.accent, ...NUM }}>{sgn(diff)} h</div>
                </>)}</td>
            </tr>); })}</tbody>
        </table>
        </Scrollbereich>
      </Card>
      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14 }}>Bernsteinfarben hinterlegte Felder weichen vom Sollplan ab.</div>
    </div>);
}
