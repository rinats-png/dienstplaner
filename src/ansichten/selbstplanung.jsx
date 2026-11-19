/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { NICHT_UEBERNOMMEN_GRUENDE } from "../../server/lib/selbstplanung.mjs";
import { addDays, dow } from "../regelwerk.js";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Btn, Inp, Sel, Field, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { MON, heute, fKurz } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { Kennzahlen } from "../gestalt/ansichten.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { darf } from "../lib/berechtigung.js";
import { SELBSTPLAN_STATUS, laufendeRunde, selbstplanFortschritt, selbstplanLage } from "../lib/selbstplanung.js";


/* ==========================================================================
   SELBSTPLANUNG — Ansicht für die Planung
   Links der Stand der Runde, rechts das Monatsraster mit den offenen
   Diensten. Wer hat sich eingetragen, wo klaffen noch Lücken.
   ========================================================================== */
export function Selbstplanung({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  const darfFuehren = darf(sitz, "plan.edit.all") || darf(sitz, "plan.edit.unit");
  const [neu, setNeu] = useState(false);
  const [monat, setMonat] = useState(addDays(heute(), 40).slice(0, 7));
  const [tage, setTage] = useState(7);

  const runden = (m.selbstplanung || []);
  const laufend = laufendeRunde(m);
  const [gewaehlt, setGewaehlt] = useState(null);
  const r = runden.find((x) => x.id === gewaehlt) || laufend || runden[0] || null;
  const f = r ? selbstplanFortschritt(m, r) : null;
  const lage = r ? selbstplanLage(m, r) : [];

  return (
    <div>
      <H1 rubrik="Planung"
        sub="Die Belegschaft macht den Erstentwurf, du schließt die Lücken. Wer sich einträgt, bekommt den Dienst — geprüft wird beim Eintragen, nicht hinterher."
        right={darfFuehren && !laufend && <Btn kind="primary" onClick={() => setNeu(true)}>
          Runde öffnen</Btn>}>
        Selbstplanung</H1>

      {runden.length === 0 ? (
        <Card><Leer titel="Noch keine Runde"
          text="Öffne eine Runde für einen kommenden Monat. Die Belegschaft trägt sich ein, danach übernimmst du den Entwurf und füllst den Rest."
          aktion={darfFuehren && <Btn kind="primary" onClick={() => setNeu(true)}>Erste Runde öffnen</Btn>} />
        </Card>
      ) : (<>
        {/* ---------------------- Der Stand ------------------------- */}
        {r && f && (
          <Kennzahlen min={180} kacheln={[
            { label: "Belegt", wert: `${f.belegt} von ${f.gesamt}`, sub: `${f.anteil} %`,
              ton: f.anteil >= 80 ? "ok" : f.anteil >= 50 ? "warn" : "danger" },
            { label: "Beteiligung", wert: `${f.beteiligt} von ${f.moeglich}`, sub: `${f.beteiligung} %`,
              ton: f.beteiligung >= 60 ? "ok" : "warn" },
            { label: "Eintragungen", wert: zahl(f.eintraege), sub: "insgesamt" },
            { label: "Noch offen", wert: zahl(f.offen), sub: f.offen ? "Dienste" : "nichts",
              ton: f.offen ? "warn" : "ok" }]} />)}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,300px) minmax(0,1fr)",
          gap: 24, alignItems: "start" }}>

          {/* ------------------- Liste der Runden ------------------- */}
          <div>
            <Card style={{ marginBottom: 16 }}>
              <CardHead right={<Lab>{zahl(runden.length)}</Lab>}>Runden</CardHead>
              {runden.map((x, i) => {
                const st = SELBSTPLAN_STATUS[x.status] || SELBSTPLAN_STATUS.offen;
                const an = r && x.id === r.id;
                return (
                  <button key={x.id} onClick={() => setGewaehlt(x.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "13px var(--pad-x)", border: "none", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit", color: C.text,
                      background: an ? C.accentLight : "transparent",
                      borderLeft: `3px solid ${an ? C.accent : "transparent"}`,
                      borderBottom: i < runden.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: an ? 640 : 550 }}>
                        {MON[Number(x.monat.slice(5)) - 1]} {x.monat.slice(0, 4)}</span>
                      <span style={{ display: "block", fontSize: 12, color: C.dim, marginTop: 3 }}>
                        {(x.eintraege || []).length} Eintragungen</span>
                    </span>
                    <Pill size="sm" tone={st.ton}>{st.label}</Pill>
                  </button>);
              })}
            </Card>

            {r && darfFuehren && (
              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, marginBottom: 14 }}>
                  {(SELBSTPLAN_STATUS[r.status] || {}).text}
                  {r.status === "offen" && r.schliesst
                    ? ` Schließt am ${fKurz(r.schliesst)}.` : ""}
                </div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  {r.status === "offen" && (
                    <Btn size="sm" onClick={() => akt.rundeSchliessen(r.id)}>Schließen</Btn>)}
                  {r.status === "geschlossen" && (
                    <Btn size="sm" kind="primary" onClick={() => akt.mitWarnung(m, { titel: "Selbstplanung übernehmen",
                      eintraege: (r.eintraege || []).map((e, idx) => ({ personId: e.personId, datum: e.datum, dienstId: e.dienstId, idx })),
                      knopf: "Übernehmen",
                      fussnote: "Was du nicht auswählst, wird nicht übernommen und bleibt mit Grund an der Runde sichtbar.",
                      ausfuehren: (best) => akt.rundeUebernehmen(r.id, best) })}>
                      In den Plan übernehmen</Btn>)}
                  {r.status === "uebernommen" && (
                    <div style={{ fontSize: 13, color: C.ok }}>
                      {zahl(r.uebernommen || 0)} übernommen
                      {r.verworfen ? `, ${zahl(r.verworfen)} nicht übernommen` : ""}</div>)}
                </div>
                {r.status === "uebernommen" && (r.nichtUebernommen || []).length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12.5, color: C.dim, cursor: "pointer" }}>Nicht übernommen, mit Grund</summary>
                    {r.nichtUebernommen.map((e, k) => {
                      const pp = m.personen.find((x) => x.id === e.personId);
                      return (
                        <div key={k} style={{ fontSize: 12.5, color: C.dim, padding: "4px 0", lineHeight: 1.45 }}>
                          {pp ? `${pp.nachname}, ${pp.vorname}` : "?"} · {fKurz(e.datum)} · {NICHT_UEBERNOMMEN_GRUENDE[e.grund] || NICHT_UEBERNOMMEN_GRUENDE.befund}</div>);
                    })}
                  </details>)}
                {r.status === "geschlossen" && (
                  <div style={{ fontSize: 12.5, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
                    Beim Übernehmen wird jeder Eintrag noch einmal geprüft. Einträge mit Befund
                    zeigt der Warndialog; du entscheidest je Eintrag. Nichts wird still verworfen.
                  </div>)}
              </Card>)}
          </div>

          {/* --------------------- Das Monatsraster ----------------- */}
          {r && (
            <Card>
              <CardHead right={<Lab>Mindestbesetzung</Lab>}>
                {MON[Number(r.monat.slice(5)) - 1]} {r.monat.slice(0, 4)}</CardHead>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                  <thead><tr>
                    <th style={{ textAlign: "left", padding: "10px var(--pad-x)" }}><Lab>Tag</Lab></th>
                    {m.dienstarten.filter((d) => !d.posten).map((d) => (
                      <th key={d.id} style={{ padding: "10px 12px", textAlign: "center" }}>
                        <Lab>{d.kurz}</Lab></th>))}
                  </tr></thead>
                  <tbody>
                    {lage.map((t) => {
                      const we = [5, 6].includes(dow(t.datum));
                      return (
                        <tr key={t.datum} style={{ background: we ? C.flaecheStill : "transparent" }}>
                          <td style={{ padding: "8px var(--pad-x)", fontSize: 13,
                            borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: "nowrap" }}>
                            {fKurz(t.datum)}</td>
                          {t.dienste.map((x) => (
                            <td key={x.dienst.id} style={{ padding: "8px 12px", textAlign: "center",
                              borderBottom: `1px solid ${C.lineSoft}` }}>
                              {x.soll === 0 ? (
                                <span style={{ color: C.aus, fontSize: 12 }}>—</span>
                              ) : (
                                <span style={{ display: "inline-block", minWidth: 44,
                                  padding: "3px 8px", borderRadius: 8, fontSize: 12.5,
                                  fontWeight: 600, ...NUM,
                                  background: x.gedeckt ? C.okLight : x.drin > 0 ? C.warnLight : C.dangerLight,
                                  color: x.gedeckt ? C.ok : x.drin > 0 ? C.warn : C.danger }}>
                                  {x.drin}/{x.soll}</span>)}
                            </td>))}
                        </tr>);
                    })}
                  </tbody>
                </table>
              </div>
            </Card>)}
        </div>
      </>)}

      {/* ---------------------- Runde öffnen ---------------------- */}
      {neu && (
        <Sheet open onClose={() => setNeu(false)} titel="Selbstplanung öffnen" width={520}>
          <div style={{ display: "grid", gap: 18 }}>
            <Field label="Für welchen Monat?"
              hint="Sinnvoll ist der übernächste — die Belegschaft braucht Zeit, und danach willst du noch planen.">
              <Inp type="month" value={monat} onChange={(e) => setMonat(e.target.value)} /></Field>
            <Field label="Wie lange offen?"
              hint="Danach schließt die Runde und du füllst die Lücken.">
              <Sel value={tage} onChange={(e) => setTage(Number(e.target.value))}>
                {[3, 5, 7, 10, 14].map((v) => (
                  <option key={v} value={v}>{v} Tage</option>))}</Sel></Field>

            <Erklaerkasten>
              Alle Beschäftigten im Schichtdienst werden unterrichtet. Beim Eintragen
              prüft CENTRIC Ruhezeit, Qualifikation, Abwesenheit und das Stundenziel —
              wer sich einträgt, bekommt den Dienst auch.
            </Erklaerkasten>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={() => { akt.rundeOeffnen(monat, tage); setNeu(false); }}>
                Runde öffnen</Btn>
            </div>
          </div>
        </Sheet>)}
    </div>);
}
