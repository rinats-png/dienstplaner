/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";

import { darf } from "../lib/berechtigung.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fKurz } from "../lib/datum.js";
import { Btn, Inp } from "../ui/bausteine.jsx";
import { antragUeberholt } from "../istdaten.js";

/**
 * Offene Korrekturanträge für Leitung und Planung (WP-14): Original, bisherige Ist-Zeit und Vorschlag
 * nebeneinander; Genehmigen oder Ablehnen mit Begründung. Wie überall in den Stempelbefunden kein
 * Zugriff für die Schichtverantwortung (sie sieht fremde Stempel nicht, H8+).
 */
export function KorrekturAntraege({ sitz, akt }) {
  const m = sitz.mandant;
  const [ablehnen, setAblehnen] = useState(null);
  const [text, setText] = useState("");
  const darfEntscheiden = darf(sitz, "staff.edit");
  const name = (pid) => { const x = m.personen.find((q) => String(q.id) === String(pid)); return x ? `${x.vorname} ${x.nachname}` : pid; };
  const liste = [];
  for (const [k, e] of Object.entries(m.einstempeln || {})) {
    const [pid, datum] = k.split("|");
    for (const a of (e && Array.isArray(e.antraege) ? e.antraege : [])) if (a && a.status === "offen") liste.push({ pid, datum, a });
  }
  liste.sort((x, y) => x.a.gestellt.localeCompare(y.a.gestellt));
  if (!liste.length) return null;
  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
        {liste.length === 1 ? "1 Korrekturantrag" : `${liste.length} Korrekturanträge`}</div>
      {liste.map(({ pid, datum, a }) => {
        /* WP-14c (F7): Hat sich die Ist-Zeit seit dem Antrag geändert, ist er überholt (der Server weist die Genehmigung ab):
           „gilt bisher“ zeigt die aktuelle Ist-Zeit, Genehmigen ist gesperrt, Ablehnen bleibt möglich. */
        const aktuell = (m.erfassung || {})[`${pid}|${datum}`];
        const ueberholt = antragUeberholt(a, aktuell);
        return (
        <div key={a.id} style={{ padding: "6px 0", borderTop: `1px solid ${C.lineSoft}` }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ minWidth: 200, ...NUM }}>{name(pid)} · {fKurz(datum)}</span>
            <span style={{ ...NUM }}>Original {a.original.start || "–"}–{a.original.ende || "–"}</span>
            {(ueberholt ? aktuell : a.ist) && <span style={{ color: C.dim, ...NUM }}>gilt bisher {(ueberholt ? aktuell : a.ist).start || "–"}–{(ueberholt ? aktuell : a.ist).ende || "–"}</span>}
            {ueberholt && <span style={{ color: C.warn, fontWeight: 600 }}>überholt — die Ist-Zeit wurde nach dem Antrag geändert</span>}
            <b style={{ ...NUM }}>beantragt {a.vorschlag.start}–{a.vorschlag.ende}{a.vorschlag.pause !== undefined ? ` · Pause ${a.vorschlag.pause} min` : ""}</b>
            {darfEntscheiden && akt && <>
              <Btn size="sm" kind="ok" disabled={ueberholt} title={ueberholt ? "Überholt: bitte ablehnen und einen neuen Antrag stellen lassen" : undefined}
                onClick={() => akt.korrekturEntscheiden(pid, datum, a.id, "genehmigt")}>Genehmigen</Btn>
              <Btn size="sm" kind="danger" onClick={() => { setAblehnen(a.id); setText(""); }}>Ablehnen</Btn></>}
          </div>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>Grund: {a.grund}</div>
          {ablehnen === a.id && darfEntscheiden && akt && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <Inp value={text} onChange={(e) => setText(e.target.value)} aria-label="Begründung der Ablehnung" placeholder="Begründung (mindestens 10 Zeichen)" style={{ flex: 1, minWidth: 240 }} />
              <Btn size="sm" kind="danger" disabled={text.trim().length < 10}
                onClick={async () => { if (await akt.korrekturEntscheiden(pid, datum, a.id, "abgelehnt", text)) setAblehnen(null); }}>Ablehnung speichern</Btn>
              <Btn size="sm" onClick={() => setAblehnen(null)}>Abbrechen</Btn>
            </div>)}
        </div>);
      })}
    </div>);
}
