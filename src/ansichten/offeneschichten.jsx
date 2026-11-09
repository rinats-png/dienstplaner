/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { addDays, between } from "../regelwerk.js";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Rubrik, Avatar, Btn, Inp, Field, H1, Pill } from "../ui/bausteine.jsx";
import { heute, fLang, fKurz } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Icon } from "../gestalt/icons.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { besetzung, hindernisse } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";
import { OFFEN_STATUS, ausschreibungLage, bewerbbarOhneHinweis } from "../lib/offene-schichten.js";


/* ==========================================================================
   OFFENE SCHICHTEN — Ansicht für die Planung
   Links die Ausschreibungen, rechts wer sich gemeldet hat und warum diese
   Person oben steht. Ein Griff, und sie ist eingeteilt.
   ========================================================================== */
export function OffeneSchichten({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  const darfVergeben = darf(sitz, "plan.edit.unit") || darf(sitz, "plan.edit.all");
  const [gewaehlt, setGewaehlt] = useState(null);
  const [neu, setNeu] = useState(null);

  const alle = (m.ausschreibungen || []);
  const offen = alle.filter((a) => a.status === "offen" && a.datum >= heute())
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const erledigt = alle.filter((a) => a.status !== "offen" || a.datum < heute())
    .sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 20);
  const a = offen.find((x) => x.id === gewaehlt) || offen[0] || null;
  const lage = a ? ausschreibungLage(m, a) : null;

  /* Lücken der nächsten vierzehn Tage, die noch nicht ausgeschrieben sind */
  const luecken = useMemo(() => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(heute(), i);
      const bes = besetzung(m, d);
      for (const [dienstId, b] of Object.entries(bes)) {
        if (b.soll > 0 && b.diff < 0 && !alle.some((x) => x.datum === d
          && x.dienstId === dienstId && x.status === "offen"))
          out.push({ datum: d, dienstId, fehlt: Math.abs(b.diff) });
      }
    }
    return out;
  }, [m, alle]);

  return (
    <div>
      <H1 rubrik="Anliegen"
        sub="Statt zehn Leute anzurufen: die Lücke sichtbar machen. Wer sich meldet, darf auch — Ruhezeit, Qualifikation und Abwesenheit sind vorher geprüft."
        right={darfVergeben && luecken.length > 0 && (
          <Btn kind="primary" onClick={() => setNeu(luecken[0])}>Lücke ausschreiben</Btn>)}>
        Offene Schichten</H1>

      {/* --------------------- Nicht ausgeschriebene Lücken -------------- */}
      {darfVergeben && luecken.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <CardHead right={<Lab>{zahl(luecken.length)} in vierzehn Tagen</Lab>}>
            Lücken ohne Ausschreibung</CardHead>
          <div style={{ padding: "4px 0" }}>
            {luecken.slice(0, 6).map((l, i) => {
              const da = m.dienstarten.find((x) => x.id === l.dienstId);
              const tage = between(heute(), l.datum);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14,
                  padding: "13px var(--pad-x)",
                  borderBottom: i < Math.min(5, luecken.length - 1) ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2,
                    background: da ? da.farbe : C.line }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 550 }}>
                      {fLang(l.datum)} · {da ? da.name : l.dienstId}</div>
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                      {zahl(l.fehlt)} {l.fehlt === 1 ? "Person fehlt" : "Personen fehlen"}
                      {tage <= 2 ? " · dringend" : ` · in ${tage} Tagen`}</div>
                  </div>
                  <Btn size="sm" onClick={() => setNeu(l)}>Ausschreiben</Btn>
                </div>);
            })}
          </div>
        </Card>)}

      {offen.length === 0 ? (
        <Card><Leer titel="Nichts ausgeschrieben"
          text="Wenn jemand ausfällt, kannst du die Lücke hier zur Bewerbung freigeben statt herumzutelefonieren." /></Card>
      ) : (
        <div className="zweispaltig" style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) minmax(0,1fr)",
          gap: 24, alignItems: "start" }}>

          {/* ------------------------ Die Liste ------------------------ */}
          <Card style={{ position: "sticky", top: 76 }}>
            <CardHead right={<Lab>{zahl(offen.length)}</Lab>}>Ausgeschrieben</CardHead>
            {offen.map((x, i) => {
              const da = m.dienstarten.find((y) => y.id === x.dienstId);
              const l = ausschreibungLage(m, x);
              const an = a && x.id === a.id;
              return (
                <button key={x.id} onClick={() => setGewaehlt(x.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "14px var(--pad-x)", border: "none", cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit", color: C.text,
                    background: an ? C.accentLight : "transparent",
                    borderLeft: `3px solid ${an ? C.accent : "transparent"}`,
                    borderBottom: i < offen.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 4, alignSelf: "stretch", minHeight: 34, borderRadius: 2,
                    background: da ? da.farbe : C.line }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: an ? 640 : 550 }}>
                      {fKurz(x.datum)} · {da ? da.name : x.dienstId}</span>
                    <span style={{ display: "block", fontSize: 12, color: C.dim, marginTop: 3 }}>
                      {!darfVergeben ? (l.dringend ? "offen · dringend" : "offen")
                        : l.anzahl === 0
                        ? l.dringend ? "noch niemand · dringend" : "noch niemand"
                        : `${zahl(l.anzahl)} ${l.anzahl === 1 ? "Meldung" : "Meldungen"}`}</span>
                  </span>
                  {l.anzahl > 0 && <Pill size="sm" tone="ok">{zahl(l.anzahl)}</Pill>}
                  {l.dringend && <Pill size="sm" tone="danger">!</Pill>}
                </button>);
            })}
          </Card>

          {/* ---------------------- Die Bewerbungen -------------------- */}
          {a && lage && (() => {
            const da = m.dienstarten.find((x) => x.id === a.dienstId);
            return (
              <div>
                <Card style={{ marginBottom: 18 }}>
                  <div style={{ padding: "22px var(--pad-x)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <Rubrik>{fLang(a.datum)}</Rubrik>
                      {lage.dringend && <Pill size="sm" tone="danger">dringend</Pill>}
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 300, letterSpacing: "-.035em",
                      margin: "9px 0 8px" }}>
                      {da ? da.name : a.dienstId}
                      {da && <span style={{ fontSize: 16, color: C.dim, fontWeight: 400 }}>
                        {" "}· {da.start}–{da.ende}</span>}</h2>
                    {a.hinweis && <p style={{ fontSize: 14, color: C.dim, margin: "0 0 12px",
                      lineHeight: 1.55 }}>{a.hinweis}</p>}
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13,
                      color: C.dim, marginTop: 12 }}>
                      {darfVergeben && <span>{zahl(lage.moeglich)} kämen infrage</span>}
                      {darfVergeben && <span>{zahl(lage.anzahl)} {lage.anzahl === 1 ? "Meldung" : "Meldungen"}</span>}
                      <span>{lage.tage <= 0 ? "heute" : `in ${zahl(lage.tage)} Tagen`}</span>
                    </div>
                    {darfVergeben && (
                      <div style={{ marginTop: 18 }}>
                        <Btn size="sm" kind="quiet"
                          onClick={() => akt.ziehAusschreibungZurueck(a.id)}>Zurückziehen</Btn>
                      </div>)}
                  </div>
                </Card>

                {/* Wer sich gemeldet hat und in welcher Rangfolge, sieht nur, wer vergibt.
                    Beschäftigte bekommen fremde Meldungen vom Server nicht (sicht.mjs). */}
                {!darfVergeben ? null : lage.anzahl === 0 ? (
                  <Card><Leer titel="Noch niemand hat sich gemeldet"
                    text={lage.moeglich === 0
                      ? "Niemand kann diese Schicht ohne Befund übernehmen — Ruhezeit, Qualifikation oder Abwesenheit stehen im Weg. Die Ersatzsuche zeigt, wer nur mit Abweichung infrage kommt."
                      : `${zahl(lage.moeglich)} Personen wurden unterrichtet. Bei kurzem Vorlauf lohnt zusätzlich die gezielte Anfrage.`} />
                    {lage.moeglich > 0 && (
                      <div style={{ padding: "0 var(--pad-x) 22px" }}>
                        <Btn onClick={() => gehZu("lage")}>Zur gezielten Ersatzsuche</Btn>
                      </div>)}
                  </Card>
                ) : (
                  <Card>
                    <CardHead right={<Lab>nach Eignung geordnet</Lab>}>Meldungen</CardHead>
                    {lage.bewerbungen.map((b, i) => (
                      <div key={b.personId} style={{ padding: "18px var(--pad-x)",
                        borderBottom: i < lage.bewerbungen.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                        background: i === 0 ? C.accentLight : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <Avatar person={b.person} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>
                              {b.person.nachname}, {b.person.vorname}
                              {i === 0 && <span style={{ fontSize: 12, color: C.accent,
                                fontWeight: 600 }}> · Vorschlag</span>}</div>
                            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                              {b.person.funktion} · gemeldet {fKurz(b.zeit.slice(0, 10))}</div>
                          </div>
                          {darfVergeben && (
                            <Btn size="sm" kind={i === 0 ? "primary" : undefined}
                              onClick={() => akt.mitWarnung(m, { titel: "Offene Schicht vergeben",
                                eintraege: [{ personId: b.personId, datum: a.datum, dienstId: a.dienstId }],
                                knopf: "Einteilen",
                                ausfuehren: (best) => akt.vergibSchicht(a.id, b.personId, best) })}>Einteilen</Btn>)}
                        </div>
                        {b.text && (
                          <div style={{ fontSize: 13.5, color: C.dim, marginTop: 10,
                            paddingLeft: 52, lineHeight: 1.5, fontStyle: "italic" }}>„{b.text}"</div>)}
                        {(() => { const dx = m.dienstarten.find((x) => x.id === a.dienstId);
                          const h = dx ? hindernisse(m, b.person, a.datum, dx) : [];
                          return h.length > 0 && (
                            <div style={{ display: "flex", gap: 7, fontSize: 12.5, color: C.warn, marginTop: 8, paddingLeft: 52, lineHeight: 1.45 }}>
                              <Icon n="warnung" size={14} /><span>mit Hinweis: {h.join(" · ")}</span></div>); })()}
                        {b.gruende && b.gruende.length > 0 && (
                          <div style={{ marginTop: 12, paddingLeft: 52, display: "grid", gap: 5 }}>
                            {b.gruende.slice(0, 3).map((g, gi) => (
                              <div key={gi} style={{ display: "flex", gap: 8, fontSize: 12.5,
                                color: g.art === "minus" ? C.warn : C.dim, lineHeight: 1.45 }}>
                                <span style={{ fontWeight: 700, flexShrink: 0 }}>
                                  {g.art === "plus" ? "+" : g.art === "minus" ? "−" : "·"}</span>
                                <span>{g.text}</span>
                              </div>))}
                          </div>)}
                      </div>))}
                  </Card>)}
              </div>);
          })()}
        </div>)}

      {/* ------------------------ Bereits erledigt ---------------------- */}
      {erledigt.length > 0 && (
        <details style={{ marginTop: 32 }}>
          <summary style={{ cursor: "pointer", fontSize: 13.5, color: C.dim, padding: "10px 0" }}>
            Frühere Ausschreibungen ({zahl(erledigt.length)})</summary>
          <Card style={{ marginTop: 12 }}>
            {erledigt.map((x, i) => {
              const da = m.dienstarten.find((y) => y.id === x.dienstId);
              const p = x.vergebenAn ? m.personen.find((y) => y.id === x.vergebenAn) : null;
              const st = OFFEN_STATUS[x.status] || OFFEN_STATUS.offen;
              return (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 14,
                  padding: "12px var(--pad-x)",
                  borderBottom: i < erledigt.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{fKurz(x.datum)} · {da ? da.name : x.dienstId}</div>
                    {p && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      an {p.nachname}, {p.vorname}</div>}
                  </div>
                  <Pill size="sm" tone={st.ton}>{st.label}</Pill>
                </div>);
            })}
          </Card>
        </details>)}

      {/* ------------------------ Ausschreiben -------------------------- */}
      {neu && (
        <Sheet open onClose={() => setNeu(null)} titel="Schicht ausschreiben" width={520}>
          {(() => {
            const da = m.dienstarten.find((x) => x.id === neu.dienstId);
            const moeglich = m.personen.filter((p) => imDienst(p, neu.datum)
              && bewerbbarOhneHinweis(m, p.id, { datum: neu.datum, dienstId: neu.dienstId,
                status: "offen", bewerbungen: [] })).length;
            return (
              <div style={{ display: "grid", gap: 18 }}>
                <div>
                  <Rubrik>{fLang(neu.datum)}</Rubrik>
                  <div style={{ fontSize: 20, fontWeight: 620, marginTop: 8 }}>
                    {da ? da.name : neu.dienstId}
                    {da && <span style={{ fontSize: 15, color: C.dim, fontWeight: 400 }}>
                      {" "}· {da.start}–{da.ende}</span>}</div>
                </div>

                <div style={{ padding: "14px 16px", borderRadius: 10,
                  background: moeglich > 0 ? C.okLight : C.warnLight,
                  border: `1px solid ${moeglich > 0 ? C.ok : C.warn}66` }}>
                  <div style={{ fontSize: 14, lineHeight: 1.55,
                    color: moeglich > 0 ? C.text : C.warn }}>
                    {moeglich > 0
                      ? `${zahl(moeglich)} Personen dürfen diese Schicht übernehmen und werden unterrichtet.`
                      : "Niemand darf diese Schicht übernehmen — Ruhezeit, Qualifikation oder Abwesenheit stehen im Weg. Eine Ausschreibung brächte nichts."}
                  </div>
                </div>

                <Field label="Hinweis (freiwillig)"
                  hint="Ein Satz, warum die Schicht offen ist. Das erhöht die Bereitschaft spürbar.">
                  <Inp id="as-hinweis" placeholder="z. B. Krankmeldung, kurzfristig" /></Field>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Btn kind="quiet" onClick={() => setNeu(null)}>Abbrechen</Btn>
                  <Btn kind="primary" disabled={moeglich === 0} onClick={() => {
                    const el = document.getElementById("as-hinweis");
                    akt.schreibeAus(neu.datum, neu.dienstId, el ? el.value : "");
                    setNeu(null);
                  }}>Ausschreiben</Btn>
                </div>
              </div>);
          })()}
        </Sheet>)}
    </div>);
}
