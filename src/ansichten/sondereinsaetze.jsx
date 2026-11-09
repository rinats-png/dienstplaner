/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { addDays } from "../regelwerk.js";
import { C } from "../farben.js";
import { Leer, Card, CardHead, Lab, Btn, Inp, Field, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { heute, fLang } from "../lib/datum.js";
import { n1, zahl } from "../lib/format.js";
import { Grosszahl } from "../gestalt/ansichten.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { darf } from "../lib/berechtigung.js";
import { sondereinsaetze } from "../lib/belastung.js";


/* ==========================================================================
   SONDEREINSÄTZE
   Außerhalb des Regelplans, mit eigener Kostenstelle.
   ========================================================================== */
export function Sondereinsaetze({ sitz, akt }) {
  const m = sitz.mandant;
  const darfAendern = darf(sitz, "plan.edit.unit") || darf(sitz, "plan.edit.all");
  const [von, setVon] = useState(addDays(heute(), -30));
  const [bis, setBis] = useState(addDays(heute(), 60));
  const [neu, setNeu] = useState(false);
  const liste = useMemo(() => sondereinsaetze(m, von, bis), [m, von, bis]);

  const summe = liste.reduce((s, x) => s + (x.stunden ? x.stunden.gesamt : 0), 0);

  return (
    <div>
      <H1 rubrik="Planung"
        sub="Einsätze außerhalb des Regelplans: Veranstaltungen, zusätzlicher Objektschutz, Begleitungen. Mit eigener Kostenstelle, weil sie gesondert berechnet werden."
        right={darfAendern && <Btn kind="primary" onClick={() => setNeu(true)}>
          Einsatz anlegen</Btn>}>
        Sondereinsätze</H1>

      <Card style={{ marginBottom: 22 }}>
        <div style={{ padding: "18px var(--pad-x)", display: "flex", gap: 16,
          alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Von"><Inp type="date" value={von}
            onChange={(e) => setVon(e.target.value)} /></Field>
          <Field label="Bis"><Inp type="date" value={bis}
            onChange={(e) => setBis(e.target.value)} /></Field>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <Grosszahl wert={n1(summe)} label="Stunden im Zeitraum" />
          </div>
        </div>
      </Card>

      {liste.length === 0 ? (
        <Card><Leer titel="Keine Sondereinsätze"
          text="Ein Sondereinsatz läuft außerhalb der Schichtfolge — etwa eine Veranstaltung am Wochenende. Die Stunden erscheinen getrennt im Nachweis." /></Card>
      ) : (
        <Card>
          <CardHead right={<Lab>{zahl(liste.length)}</Lab>}>Einsätze</CardHead>
          {liste.map((s, i) => (
            <div key={s.id} style={{ padding: "16px var(--pad-x)",
              borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 620 }}>{s.bezeichnung}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>
                    {fLang(s.datum)} · {s.start}–{s.ende}
                    {s.ort ? ` · ${s.ort}` : ""}</div>
                  {s.kostenstelle && (
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>
                      Kostenstelle {s.kostenstelle}
                      {s.auftraggeber ? ` · ${s.auftraggeber}` : ""}</div>)}
                  <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                    {(s.zugeteilt || []).map((pid) => {
                      const p = m.personen.find((x) => x.id === pid);
                      return p ? (
                        <Pill key={pid} size="sm">{p.nachname}, {p.vorname.slice(0, 1)}.</Pill>) : null;
                    })}
                    {!(s.zugeteilt || []).length && (
                      <Pill size="sm" tone="warn">niemand zugeteilt</Pill>)}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 90 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, ...NUM }}>
                    {n1(s.stunden ? s.stunden.gesamt : 0)} h</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                    {zahl(s.stunden ? s.stunden.personen : 0)} × {n1(s.stunden ? s.stunden.jePerson : 0)} h</div>
                </div>
              </div>
            </div>))}
        </Card>)}

      {neu && (
        <Sheet open onClose={() => setNeu(false)} titel="Sondereinsatz anlegen" width={520}>
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Bezeichnung"><Inp id="se-bez" autoFocus
              placeholder="z. B. Stadtfest Absicherung" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Datum"><Inp id="se-datum" type="date" defaultValue={heute()} /></Field>
              <Field label="Von"><Inp id="se-start" type="time" defaultValue="18:00" /></Field>
              <Field label="Bis"><Inp id="se-ende" type="time" defaultValue="23:00" /></Field>
            </div>
            <Field label="Ort"><Inp id="se-ort" placeholder="Einsatzort" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Kostenstelle"
                hint="Für die getrennte Abrechnung.">
                <Inp id="se-ks" placeholder="z. B. SE-2026-014" /></Field>
              <Field label="Auftraggeber"><Inp id="se-ag" placeholder="Name" /></Field>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={() => {
                const g = (id) => (document.getElementById(id) || {}).value || "";
                if (!g("se-bez").trim()) return;
                akt.sondereinsatzAnlegen({
                  bezeichnung: g("se-bez").trim(), datum: g("se-datum"),
                  start: g("se-start"), ende: g("se-ende"), ort: g("se-ort"),
                  kostenstelle: g("se-ks"), auftraggeber: g("se-ag") });
                setNeu(false);
              }}>Anlegen</Btn>
            </div>
          </div>
        </Sheet>)}
    </div>);
}
