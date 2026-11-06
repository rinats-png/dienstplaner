/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { planeMonat } from "../lib/fachlogik.js";
import { Sheet, Zelle } from "../ui/leisten.jsx";
import { MON, fKurz } from "../lib/datum.js";
import { C } from "../farben.js";
import { Field, Inp, Btn, KpiRow, Kpi, Leer, Lab, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";

/* ========================== PLANUNGSASSISTENT ============================ */
export function Assistent({ sitz, ym, akt, onClose }) {
  const m = sitz.mandant;
  const [max, setMax] = useState(3);
  const [ergebnis, setErgebnis] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));

  const rechnen = () => {
    setLaeuft(true);
    setTimeout(() => { setErgebnis(planeMonat(m, ym, { maxProPerson: max })); setLaeuft(false); }, 30);
  };

  return (
    <Sheet open onClose={onClose} titel={`Planungsassistent · ${MON[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`} width={760}>
      {!ergebnis && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.55 }}>
            Der Assistent geht jeden Tag des Monats durch, sucht offene Stellen und schlägt Besetzungen vor.
            Er verwendet dieselbe Bewertung wie die Ersatzsuche: Qualifikation, Stundenkonto gegen den Median,
            Belastungsausgleich. Ruhezeiten und Einsatzeinschränkungen werden eingehalten.
            <b> Nichts wird ohne deine Freigabe übernommen.</b>
          </div>
          <Field label="Höchstzahl zusätzlicher Dienste je Person"
            hint="Verhindert, dass der Assistent die Last auf wenige Schultern legt.">
            <Inp type="number" min={1} max={10} value={max} onChange={(e) => setMax(Number(e.target.value))} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
            <Btn kind="primary" disabled={laeuft} onClick={rechnen}>{laeuft ? "rechnet …" : "Vorschlag berechnen"}</Btn>
          </div>
        </div>)}

      {ergebnis && (<div>
        <KpiRow min={160}>
          <Kpi label="Vorgeschlagen" value={ergebnis.gesetzt.length} tone="accent" sub="zusätzliche Einteilungen" />
          <Kpi label="Betroffene Personen" value={ergebnis.betroffene} />
          <Kpi label="Bleibt offen" value={ergebnis.offen.length} tone={ergebnis.offen.length ? "danger" : "ok"}
            sub={ergebnis.offen.length ? "nicht deckbar" : "vollständig gedeckt"} />
        </KpiRow>

        {ergebnis.gesetzt.length === 0 && ergebnis.offen.length === 0 && (
          <div style={{ marginTop: 18 }}><Leer titel="Nichts zu tun"
            text="Der Monat ist bereits vollständig besetzt. Der Assistent hat keine offene Stelle gefunden." /></div>)}

        {ergebnis.gesetzt.length > 0 && (<>
          <Lab style={{ margin: "20px 0 10px" }}>Vorschläge</Lab>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {ergebnis.gesetzt.map((g, i) => (
              <div key={i} className="karte" style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "10px 13px", marginBottom: 7 }}>
                <span style={{ fontSize: 12.5, color: C.dim, minWidth: 52, ...NUM }}>{fKurz(g.datum)}</span>
                <Zelle da={map[g.dienstId]} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer }}>{g.grund}</div>
                </div>
                <Pill size="sm">{g.punkte}</Pill>
              </div>))}
          </div>
        </>)}

        {ergebnis.offen.length > 0 && (<>
          <Lab style={{ margin: "20px 0 10px" }}>Nicht deckbar · {ergebnis.offen.length}</Lab>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {ergebnis.offen.slice(0, 12).map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 12.5 }}>
                <span style={{ color: C.dim, minWidth: 52, ...NUM }}>{fKurz(o.datum)}</span>
                <span style={{ color: C.text, minWidth: 130 }}>{(map[o.dienstId] || {}).name}</span>
                <span style={{ color: C.danger }}>
                  {o.fehlt > 0 ? `${o.fehlt} fehlen` : ""}{o.qualFehlt ? (o.fehlt > 0 ? " · " : "") + "Qualifikation fehlt" : ""}</span>
              </div>))}
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 10, lineHeight: 1.5 }}>
            Für diese Stellen findet sich niemand, ohne Ruhezeit oder Einschränkungen zu verletzen.
            Hier greift die Eskalation: erweiterte Anfrage, Mehrarbeit oder dokumentierte Unterschreitung.
          </div>
        </>)}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22,
          paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
          <Btn kind="quiet" onClick={() => setErgebnis(null)}>Neu rechnen</Btn>
          <Btn kind="quiet" onClick={onClose}>Verwerfen</Btn>
          <Btn kind="primary" disabled={!ergebnis.gesetzt.length}
            onClick={() => { akt.uebernehmeVorschlag(ergebnis); onClose(); }}>
            {ergebnis.gesetzt.length} Einteilungen übernehmen</Btn>
        </div>
      </div>)}
    </Sheet>);
}
