/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect, useMemo } from "react";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Rubrik, Btn, Inp, Sel, Field, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { heute, fLang, fKurz } from "../lib/datum.js";
import { Fortschritt } from "../gestalt/bausteine.jsx";
import { Leitraster, Hinweisband } from "../gestalt/ansichten.jsx";
import { EinheitWahl } from "./einheitwahl.jsx";
import { besetzung, darfEinheit, eigeneEinheitVon, waehltEinheit, kann, begriff, fachkraftLage, UEBERGABE_FELDER, uebergabeAm, offeneUebergaben } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";


/* ==========================================================================
   SCHICHTÜBERGABE
   In Pflege und Klinik ein eigener, dokumentationspflichtiger Vorgang.
   Wer übergibt an wen, was ist offen, was ist besonders.
   ========================================================================== */
export function Schichtuebergabe({ sitz, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [dienstId, setDienstId] = useState(m.dienstarten.find((d) => !d.posten) ?.id || "");
  const [f, setF] = useState({ lage: "", offen: "", vorkommnis: "", material: "" });
  const [einheitId, setEinheitId] = useState(() => (waehltEinheit(sitz) ? null : eigeneEinheitVon(sitz)));
  const offeneListe = useMemo(() => offeneUebergaben(m, 3, einheitId), [m, einheitId]);
  const vorhanden = uebergabeAm(m, datum, dienstId, einheitId);
  const b = dienstId ? besetzung(m, datum)[dienstId] : null;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const darfSchreiben = darfEinheit(sitz, sitz.person.bereich) || darf(sitz, "plan.edit.unit");

  useEffect(() => {
    setF(vorhanden ? { lage: vorhanden.lage || "", offen: vorhanden.offen || "",
      vorkommnis: vorhanden.vorkommnis || "", material: vorhanden.material || "" }
      : { lage: "", offen: "", vorkommnis: "", material: "" });
  }, [datum, dienstId, vorhanden]);

  return (
    <div>
      <H1 rubrik={begriff(m, "einheit")}
        sub={`Die ${begriff(m, "uebergabe").toLowerCase()} hält fest, was die übernehmende Schicht wissen muss. Sie ist nachträglich nicht mehr änderbar — Ergänzungen werden angehängt.`}
        /* flexWrap: Einheit, Datum und Dienst passten bei 320 px (mit Einheitswahl bis 430 px) nicht in eine Zeile. */
        right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {waehltEinheit(sitz) && <EinheitWahl m={m} wert={einheitId} setWert={setEinheitId} />}
          <Inp type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ width: 160 }} />
          <Sel value={dienstId} onChange={(e) => setDienstId(e.target.value)} style={{ width: 170 }}>
            {m.dienstarten.filter((d) => !d.posten && d.form !== "ruf")
              .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
        </div>}>
        {begriff(m, "uebergabe")}</H1>

      {offeneListe.length > 0 && (
        <Hinweisband ton="warn"
          titel={`${offeneListe.length} ${offeneListe.length === 1 ? "Übergabe fehlt" : "Übergaben fehlen"}`}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {offeneListe.slice(0, 8).map((x, i) => (
              <Btn key={i} size="sm" onClick={() => { setDatum(x.datum); setDienstId(x.dienstart.id); }}>
                {fKurz(x.datum)} · {x.dienstart.kurz}</Btn>))}
          </div>
        </Hinweisband>)}

      <Leitraster seiteBreite={380}
        haupt={
        <Card>
          <CardHead right={vorhanden
            ? <Pill tone="ok">erfasst {vorhanden.zeit}</Pill>
            : <Pill tone="warn">offen</Pill>}>
            {da ? da.name : ""} · {fLang(datum)}</CardHead>
          <div style={{ padding: 20, display: "grid", gap: 18 }}>
            {UEBERGABE_FELDER.map((feld) => (
              <Field key={feld.id} label={feld.label + (feld.pflicht ? " *" : "")} hint={feld.hinweis}>
                <textarea className="inp" rows={feld.id === "lage" ? 4 : 2} value={f[feld.id]}
                  disabled={!!vorhanden || !darfSchreiben}
                  onChange={(e) => setF({ ...f, [feld.id]: e.target.value })} />
              </Field>))}

            {vorhanden ? (<>
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
                Übergeben von <b>{vorhanden.von}</b> an <b>{vorhanden.an || "die Folgeschicht"}</b> am {vorhanden.zeit}.
              </div>
              {(vorhanden.ergaenzungen || []).map((e, i) => (
                <div key={i} className="karte-still" style={{ padding: 13, borderRadius: "var(--r)" }}>
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 4, ...NUM }}>{e.zeit} · {e.von}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{e.text}</div>
                </div>))}
              {darfSchreiben && (
                <div style={{ display: "flex", gap: 10 }}>
                  <Inp placeholder="Ergänzung anhängen …" value={f.nachtrag || ""}
                    onChange={(e) => setF({ ...f, nachtrag: e.target.value })} />
                  <Btn disabled={!(f.nachtrag || "").trim()}
                    onClick={() => { akt.uebergabeErgaenzen(datum, dienstId, f.nachtrag, einheitId);
                      setF({ ...f, nachtrag: "" }); }}>Anhängen</Btn>
                </div>)}
            </>) : darfSchreiben && (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn kind="primary" disabled={!f.lage.trim()}
                  onClick={() => akt.uebergabeSpeichern(datum, dienstId, f, einheitId)}>
                  Übergabe abschließen</Btn>
              </div>)}
          </div>
        </Card>}
        seite={<>
          <Card>
            <CardHead>Besetzung dieser Schicht</CardHead>
            {b && b.personen.length ? b.personen.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 18px",
                borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
                <span style={{ fontSize: 12, color: C.dim }}>{p.funktion}</span>
              </div>))
              : <Leer titel="Niemand eingeteilt" />}
          </Card>

          {kann(m, "fachkraftquote") && (() => {
            const fl = fachkraftLage(m, datum, dienstId);
            if (!fl) return null;
            return (
              <Card style={{ padding: 18 }}>
                <Rubrik style={{ marginBottom: 10 }}>Fachkraftquote</Rubrik>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-.03em", ...NUM,
                    color: fl.erfuellt ? C.ok : C.danger }}>{fl.ist} %</span>
                  <span style={{ fontSize: 13, color: C.dim, ...NUM }}>gefordert {fl.soll} %</span>
                </div>
                <div style={{ position: "relative", marginTop: 12 }}>
                  <Fortschritt wert={fl.ist} ton={fl.erfuellt ? "ok" : "danger"} hoehe={6}
                    label={`Fachkraftquote ${fl.ist} Prozent, gefordert ${fl.soll} Prozent`} />
                  <div aria-hidden="true" style={{ position: "absolute", left: `${fl.soll}%`, top: -3, bottom: -3, width: 2,
                    background: C.text, opacity: .5 }} />
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
                  {fl.fk} von {fl.gesamt} sind {begriff(m, "fachkraft")}
                  {fl.erfuellt ? "." : ` — es fehlen ${fl.fehlt}.`}
                </div>
              </Card>);
          })()}
        </>} />
    </div>);
}
