/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { vorschau as loeschVorschau, FRIST_GRENZEN, PLANDATEN_MINDEST } from "../aufbewahrung.js";
import { heute, fDatum } from "../lib/datum.js";
import { Field, Inp, Card, CardHead, Lab, Pill, Btn, Sel } from "../ui/bausteine.jsx";

import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Leitraster, Hinweisband, Seitenkarte } from "../gestalt/ansichten.jsx";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";

/* ========================== DATENSCHUTZBETRIEB ========================== */
export function Datenschutz({ sitz, akt }) {
  const m = sitz.mandant;
  const [pid, setPid] = useState("");
  /* Vorschau und Ausführung rechnen mit demselben Code. Was hier steht, ist
     genau das, was der Knopf tut — keine zweite Zählung, die abweichen kann. */
  const v = useMemo(() => loeschVorschau(m, heute()), [m]);
  const f = v.stichtage.fristen;

  const FristFeld = ({ schluessel, label, hint, wert }) => (
    <Field label={label} hint={hint}>
      <Inp type="number" min={FRIST_GRENZEN.min} max={FRIST_GRENZEN.max} step="1" value={wert}
        onChange={(e) => akt.setzeAufbewahrung(schluessel, Number(e.target.value))} />
    </Field>);

  const Posten = ({ zahl, was, ab }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0",
      borderBottom: `1px solid ${C.lineSoft}` }}>
      <span style={{ fontSize: 15, fontWeight: 640, minWidth: 44, textAlign: "right",
        color: zahl ? C.text : C.dim, ...NUM }}>{zahl}</span>
      <span style={{ fontSize: 13.5, flex: 1 }}>{was}</span>
      <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>vor {fDatum(ab)}</span>
    </div>);

  return (
    <Leitraster seiteBreite={380}
      haupt={<>
      <Card>
        <CardHead right={<Lab>{f.zuletztGeraeumt
          ? `zuletzt ${fDatum(f.zuletztGeraeumt)}` : "noch nie ausgeführt"}</Lab>}>Datenschutz</CardHead>
        <div style={{ padding: "var(--pad-y) var(--pad-x) calc(var(--pad-y) + 8px)", display: "grid", gap: 18 }}>

          <Erklaerkasten>
            Artikel 17 DSGVO verlangt, dass personenbezogene Daten gelöscht werden,
            sobald der Zweck entfällt. Drei Fristen, drei verschiedene Eingriffe —
            und alle drei sind hier nachrechenbar, bevor etwas geschieht.
          </Erklaerkasten>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
            <FristFeld schluessel="plandatenMonate" wert={f.plandatenMonate}
              label="Plandaten in Monaten"
              hint={`Schichten, Zeiten, Stempelungen. § 16 Abs. 2 ArbZG verlangt mindestens ${PLANDATEN_MINDEST} Monate.`} />
            <FristFeld schluessel="stammdatenMonate" wert={f.stammdatenMonate}
              label="Stammdaten nach Austritt"
              hint="Danach wird die Person anonymisiert, nicht gelöscht — sonst zerfallen alte Pläne." />
            <FristFeld schluessel="gruendeMonate" wert={f.gruendeMonate}
              label="Abwesenheitsgründe in Monaten"
              hint="Freitexte sind Gesundheitsangaben nach Artikel 9 DSGVO und gehören am kürzesten aufbewahrt." />
          </div>

          {v.warnung && <Hinweisband ton="danger" style={{ boxShadow: "none", marginBottom: 0 }}>{v.warnung}</Hinweisband>}
        </div>
      </Card>

      <Card>
        <CardHead right={<Pill size="sm" tone={v.gesamt ? "warn" : "ok"}>{v.gesamt ? `${v.gesamt} fällig` : "nichts fällig"}</Pill>}>
          Löschlauf</CardHead>
        <div style={{ padding: "var(--pad-y) var(--pad-x) calc(var(--pad-y) + 8px)", display: "grid", gap: 18 }}>
          <div>
            <Lab style={{ marginBottom: 8 }}>Heute fällig · {v.gesamt}</Lab>
            {v.gesamt === 0
              ? <div style={{ fontSize: 13, color: C.dim }}>
                  Nichts über der Frist. Alle Aufbewahrungsfristen sind eingehalten.</div>
              : (<div>
                {v.personen.length > 0 && <Posten zahl={v.personen.length} ab={v.stichtage.stamm}
                  was={`${v.personen.length === 1 ? "Person wird" : "Personen werden"} anonymisiert — Name, Kontakt und Schutzangaben`} />}
                {v.planSumme > 0 && <Posten zahl={v.planSumme} ab={v.stichtage.plan}
                  was="Plan-, Zeit- und Stempeleinträge werden gelöscht" />}
                {v.aenderungen > 0 && <Posten zahl={v.aenderungen} ab={v.stichtage.plan}
                  was="Änderungsvermerke werden gelöscht" />}
                {v.gruende > 0 && <Posten zahl={v.gruende} ab={v.stichtage.grund}
                  was="Abwesenheitsgründe werden entfernt — Art und Zeitraum bleiben" />}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                  <Btn kind="danger" onClick={akt.loeschlauf}>Löschlauf ausführen</Btn>
                  <Btn kind="quiet" onClick={async () => { await akt.sicherungAnlegen(); }}>Vorher sichern</Btn>
                </div>
              </div>)}
          </div>

          {v.personen.length > 0 && (
            <div>
              <Lab style={{ marginBottom: 8 }}>Einzeln anonymisieren</Lab>
              {v.personen.map((p) => (
                <div key={p.id} className="karte-still" style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 13px", marginBottom: 7, borderRadius: "var(--r)" }}>
                  <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
                  <span style={{ fontSize: 12, color: C.dim, ...NUM }}>ausgetreten {fDatum(p.austritt)}</span>
                  <Btn size="sm" kind="danger" onClick={() => akt.anonymisiere(p.id)}>Anonymisieren</Btn>
                </div>))}
            </div>)}
        </div>
      </Card>
      </>}
      seite={
      <Seitenkarte titel="Datenauskunft nach Artikel 15"
        sub="Vollständige Aufstellung aller zu einer Person gespeicherten Daten, als Datei zur Aushändigung.">
        <div style={{ display: "grid", gap: 12 }}>
          <Sel value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Person für die Datenauskunft">
            <option value="">— Person wählen —</option>
            {m.personen.map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname}</option>)}</Sel>
          <Btn kind="primary" disabled={!pid} onClick={() => akt.datenauskunft(pid)}>Auskunft erzeugen</Btn>
        </div>
      </Seitenkarte>} />);
}
