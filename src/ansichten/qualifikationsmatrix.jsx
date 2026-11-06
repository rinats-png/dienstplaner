/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useMemo } from "react";
import { qualMatrix, nachweisVerlauf } from "../lib/fachlogik.js";
import { H1, Card, CardHead, Lab, Pill } from "../ui/bausteine.jsx";
import { Kennzahlen } from "../gestalt/ansichten.jsx";

import { lesbar, NUM } from "../ui/thema.js";
import { C } from "../farben.js";
import { AnteilBalken, BalkenDiagramm } from "../ui/diagramme.jsx";



export function Qualifikationsmatrix({ sitz, akt }) {
  const m = sitz.mandant;
  const qm = useMemo(() => qualMatrix(m), [m]);
  const einheiten = m.einheiten.filter((e) => !e.pool);

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Wer kann was — und wo hängt eine Qualifikation an zu wenigen Personen. Der Engpass zeigt sich sonst erst bei der Krankmeldung."
        >Qualifikationen</H1>

      <Kennzahlen min={180} kacheln={[
        { label: "Qualifikationen", wert: qm.spalten.length },
        { label: "Engpässe", wert: qm.engpaesse, ton: qm.engpaesse ? "warn" : "ok", sub: "knapp über dem Bedarf" },
        { label: "Kritisch", wert: qm.kritische, ton: qm.kritische ? "danger" : "ok",
          hervor: qm.kritische ? "danger" : undefined, sub: "unter dem Bedarf in einer Einheit" },
        { label: "Im Schichtdienst", wert: qm.personen.length }]} />

      <Card>
        <CardHead right={<Lab>gültige Nachweise je {m.einheitLabel}</Lab>}>Abdeckung</CardHead>
        <div style={{ padding: 22 }}>
          {qm.spalten.map((s) => (
            <div key={s.qual.id} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9, flexWrap: "wrap" }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: lesbar(s.qual.farbe, 3) }} />
                <span style={{ fontSize: 14.5, fontWeight: 620 }}>{s.qual.name}</span>
                <span style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{s.anzahl} Personen</span>
                {s.bedarf > 0 && <Pill size="sm">Bedarf {s.bedarf} je Dienst</Pill>}
                {s.kritisch && <Pill size="sm" tone="danger">
                  {s.schwaechsteEinheit ? s.schwaechsteEinheit.name : ""} hat nur {s.schwaechsteAnzahl}</Pill>}
                {!s.kritisch && s.engpass && <Pill size="sm" tone="warn">
                  knapp in {s.schwaechsteEinheit ? s.schwaechsteEinheit.name : ""}</Pill>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,108px),1fr))", gap: 9 }}>
                {einheiten.map((e) => {
                  const n = s.jeEinheit[e.id] || 0;
                  const kritisch = s.bedarf > 0 && n < s.bedarf;
                  const knapp = s.bedarf > 0 && n === s.bedarf;
                  return (
                    <div key={e.id} className="karte-still" style={{ padding: "11px 13px", borderRadius: "var(--r)",
                      background: kritisch ? C.dangerLight : knapp ? C.warnLight : C.flaecheStill }}>
                      <div style={{ fontSize: 11.5, color: lesbar(e.farbe), fontWeight: 600, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                      <div style={{ fontSize: 19, fontWeight: 650, marginTop: 3, ...NUM,
                        color: kritisch ? C.danger : knapp ? C.warn : C.text }}>{n}</div>
                      {s.bedarf > 0 && <div style={{ marginTop: 6 }}>
                        <AnteilBalken wert={n} max={Math.max(s.bedarf * 2, n)} hoehe={4}
                          farbe={kritisch ? C.danger : knapp ? C.warn : C.ok} /></div>}
                    </div>);
                })}
              </div>
            </div>))}
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <CardHead>Wann laufen Nachweise ab</CardHead>
        <div style={{ padding: "22px 24px 18px" }}>
          <BalkenDiagramm daten={nachweisVerlauf(m, 12)} wert="anzahl" label="label" hoehe={130}
            farbeVon={(d) => d.anzahl > 6 ? C.danger : d.anzahl > 2 ? C.warn : C.accent} />
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14, lineHeight: 1.5 }}>
            Hohe Balken kündigen eine Welle an: In diesem Monat müssen mehrere Nachweise gleichzeitig
            erneuert werden. Wer das früh sieht, kann Schulungen bündeln.
          </div>
        </div>
      </Card>
    </div>);
}
