/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { notizenZu, waehltEinheit, einheitName } from "../lib/fachlogik.js";
import { Sheet } from "../ui/leisten.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Btn, Field } from "../ui/bausteine.jsx";
import { EinheitWahl } from "../ansichten/einheitwahl.jsx";

/* ================================ NOTIZEN ============================== */
export function Notizen({ sitz, akt, schluessel, titel, onClose }) {
  const m = sitz.mandant;
  const [text, setText] = useState("");
  const [einheitId, setEinheitId] = useState(null);
  const liste = notizenZu(m, schluessel);
  /* Tagesnotizen tragen eine Einheit (Commit C3): Planung und Leitung wählen,
     die Schichtverantwortung schreibt für ihre eigene und löscht nur eigene. */
  const darfLoeschen = (x) => waehltEinheit(sitz) || x.vonId === sitz.person.id;
  return (
    <Sheet open onClose={onClose} titel={titel} width={540}>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
        Planungswissen, das sonst im Kopf bleibt. Sichtbar für alle mit Planungsrecht.
        Keine Personaldaten, keine Gesundheitsangaben.
      </div>
      {liste.length > 0 && <div style={{ marginBottom: 18 }}>
        {liste.map((x) => (
          <div key={x.id} className="karte" style={{ padding: 14, marginBottom: 9 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{x.text}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
              <span style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>{x.von} · {x.zeit}{waehltEinheit(sitz) ? ` · ${einheitName(m, x.einheitId)}` : ""}</span>
              {darfLoeschen(x) && <Btn size="sm" kind="quiet" onClick={() => akt.loescheNotiz(schluessel, x.id)}>Löschen</Btn>}
            </div>
          </div>))}
      </div>}
      <Field label="Neue Notiz">
        <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="z. B. neu im Team, bis Ende Mai nicht allein einteilen" /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        {waehltEinheit(sitz) && <EinheitWahl m={m} wert={einheitId} setWert={setEinheitId} style={{ marginRight: "auto" }} />}
        <Btn kind="quiet" onClick={onClose}>Schließen</Btn>
        <Btn kind="primary" disabled={!text.trim()}
          onClick={() => { akt.neueNotiz(schluessel, text, einheitId); setText(""); }}>Hinzufügen</Btn>
      </div>
    </Sheet>);
}
