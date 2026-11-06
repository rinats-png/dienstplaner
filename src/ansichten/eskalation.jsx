/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { besetzung } from "../lib/fachlogik.js";
import { useState } from "react";
import { Sheet, Zelle } from "../ui/leisten.jsx";
import { fLang } from "../lib/datum.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Lab, Btn, Field } from "../ui/bausteine.jsx";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { personTag } from "../lib/fachlogik.js";
import { abwesenheitAm } from "../lib/fachlogik.js";

/* ====================== ESKALATION BEI UNTERDECKUNG ===================== */
export function Eskalation({ sitz, datum, dienstId, akt, onClose }) {
  const m = sitz.mandant;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const [grund, setGrund] = useState("");
  const [empfaenger, setEmpfaenger] = useState([]);
  const kandidaten = m.personen.filter((p) => imDienst(p, datum) && !personTag(m, p, datum).dienstId
    && !abwesenheitAm(m, p.id, datum));

  return (
    <Sheet open onClose={onClose} titel="Lücke eskalieren" width={640}>
      <div className="karte" style={{ padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <Zelle da={da} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600}}>{da.name} · {fLang(datum)}</div>
          <div style={{ fontSize: 12.5, color: C.danger, ...NUM }}>
            {b.anzahl} von {b.soll}{b.qualFehlt ? " · Qualifikation fehlt" : ""}</div>
        </div>
      </div>

      <Lab style={{ marginBottom: 10 }}>Stufe 1 · Erweiterte Anfrage</Lab>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
        Fragt mehrere Personen gleichzeitig. Wer zusagt, wird eingeteilt — die übrigen Anfragen verfallen.
      </div>
      <div style={{ maxHeight: 170, overflowY: "auto", marginBottom: 12 }}>
        {kandidaten.slice(0, 20).map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
            <input type="checkbox" checked={empfaenger.includes(p.id)}
              onChange={(e) => setEmpfaenger(e.target.checked ? [...empfaenger, p.id] : empfaenger.filter((x) => x !== p.id))} />
            <span style={{ fontSize: 13.5 }}>{p.nachname}, {p.vorname}</span>
          </label>))}
      </div>
      <Btn disabled={!empfaenger.length} onClick={() => { akt.einsatzanfrage(datum, dienstId, empfaenger); onClose(); }}>
        Anfrage an {empfaenger.length} Personen</Btn>

      <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 10 }}>Stufe 2 · Unterschreitung dokumentieren</Lab>
        <div style={{ fontSize: 13, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
          Wenn niemand einsetzbar ist, bleibt die Unterschreitung. Die Begründung ist das,
          was die verantwortliche Person absichert — und in der Pflege ist sie vorgeschrieben.
        </div>
        <Field label="Begründung und getroffene Maßnahmen">
          <textarea className="inp" rows={3} value={grund} onChange={(e) => setGrund(e.target.value)}
            placeholder="z. B. zwei kurzfristige Krankmeldungen, Anfrage an neun Personen ohne Zusage, Aufgaben priorisiert" /></Field>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="danger" disabled={!grund.trim()}
            onClick={() => { akt.dokumentiereUnterschreitung(datum, dienstId, grund); onClose(); }}>
            Unterschreitung dokumentieren</Btn>
        </div>
      </div>
    </Sheet>);
}
