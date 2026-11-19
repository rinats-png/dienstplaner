/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { heute } from "../lib/datum.js";
import { addDays } from "../regelwerk.js";
import { Sheet } from "../ui/leisten.jsx";
import { C } from "../farben.js";
import { Field, Inp, Seg, Sel, Lab, Btn } from "../ui/bausteine.jsx";
import { entgeltHinweis, entgeltZusatz } from "../abwesenheitsarten.js";
import { abwArt, ABW } from "../lib/fachlogik.js";
import { einheitAm } from "../../server/lib/fachpruefung.mjs";
import { lesbar } from "../ui/thema.js";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { darf } from "../lib/berechtigung.js";
import { darfEinheit } from "../lib/fachlogik.js";
import { between } from "../regelwerk.js";

/* ========================== MEHRFACHBEARBEITUNG ======================== */
export function Mehrfach({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const [f, setF] = useState({ von: heute(), bis: addDays(heute(), 6), dienstId: "-", personen: [] });
  const [art, setArt] = useState("dienst");
  const [abwArtId, setAbwArtId] = useState("schulung");
  const kandidaten = m.personen.filter((p) => imDienst(p, f.von) && p.imSchichtdienst !== false
    && (darf(sitz, "plan.edit.all") || darfEinheit(sitz, einheitAm(p, f.von))));
  const tage = Math.max(0, between(f.von, f.bis) + 1);
  const betroffen = f.personen.length * tage;

  return (
    <Sheet open onClose={onClose} titel="Mehrere Tage auf einmal ändern" width={680}>
      <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 20 }}>
        Zeitraum und Personen wählen, dann in einem Zug ändern. Erspart das Einzelklicken bei Lehrgängen,
        längeren Abwesenheiten oder Umsetzungen.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginBottom: 18 }}>
        <Field label="Von"><Inp type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></Field>
        <Field label="Bis"><Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
      </div>

      <Seg value={art} onChange={setArt} options={[{ id: "dienst", label: "Dienst setzen" },
        { id: "abwesenheit", label: "Abwesenheit eintragen" }]} />

      <div style={{ margin: "16px 0 20px" }}>
        {art === "dienst"
          ? <Field label="Dienstart" hint={`„frei" nimmt die betroffenen Personen aus dem Plan.`}>
              <Sel value={f.dienstId} onChange={(e) => setF({ ...f, dienstId: e.target.value })}>
                <option value="-">frei</option>
                {m.dienstarten.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>
          : <Field label="Art der Abwesenheit" hint={entgeltHinweis(abwArt(abwArtId)) || undefined}>
              <Sel value={abwArtId} onChange={(e) => setAbwArtId(e.target.value)}>
                {ABW.filter((a) => a.id !== "krank").map((a) => (
                  <option key={a.id} value={a.id}>{a.label}{entgeltZusatz(a)}</option>))}</Sel></Field>}
      </div>

      <Lab style={{ marginBottom: 10 }}>Personen · {f.personen.length} gewählt</Lab>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn size="sm" kind="quiet" onClick={() => setF({ ...f, personen: kandidaten.map((p) => p.id) })}>Alle</Btn>
        <Btn size="sm" kind="quiet" onClick={() => setF({ ...f, personen: [] })}>Keine</Btn>
        {m.einheiten.filter((e) => !e.pool).map((e) => (
          <Btn key={e.id} size="sm" kind="quiet" onClick={() => setF({ ...f,
            personen: kandidaten.filter((p) => einheitAm(p, f.von) === e.id).map((p) => p.id) })}>{e.name}</Btn>))}
      </div>
      <div style={{ maxHeight: 210, overflowY: "auto", marginBottom: 18 }}>
        {kandidaten.map((p) => {
          const an = f.personen.includes(p.id);
          const e = m.einheiten.find((x) => x.id === einheitAm(p, f.von));
          return (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={an} onChange={() => setF({ ...f,
                personen: an ? f.personen.filter((x) => x !== p.id) : [...f.personen, p.id] })} />
              <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
              <span style={{ fontSize: 12, color: e ? lesbar(e.farbe) : C.dimmer }}>{e ? e.name : ""}</span>
            </label>);
        })}
      </div>

      <div className="karte" style={{ padding: 15, marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: betroffen > 0 ? C.text : C.dimmer }}>
          {betroffen === 0 ? "Noch nichts ausgewählt."
            : <>Ändert <b>{betroffen}</b> Einträge: {f.personen.length} Personen × {tage} Tage
              {art === "dienst" ? ` auf „${f.dienstId === "-" ? "frei" : (m.dienstarten.find((d) => d.id === f.dienstId) || {}).name}"`
                : ` als ${abwArt(abwArtId).label}`}.</>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!betroffen} onClick={() => {
          if (art === "dienst") akt.mehrfachDienst(f.personen, f.von, f.bis, f.dienstId);
          else akt.mehrfachAbwesenheit(f.personen, f.von, f.bis, abwArtId);
          onClose(); }}>
          {betroffen} Einträge ändern</Btn>
      </div>
    </Sheet>);
}
