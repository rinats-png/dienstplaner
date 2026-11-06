/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { nachweisStand } from "../lib/fachlogik.js";
import { useState } from "react";
import { addDays } from "../regelwerk.js";
import { heute, fDatum } from "../lib/datum.js";
import { Sheet } from "../ui/leisten.jsx";
import { C } from "../farben.js";
import { Btn, Field, Inp } from "../ui/bausteine.jsx";

export function NachweisPflege({ sitz, akt, personId, qualId, onClose }) {
  const m = sitz.mandant;
  const p = m.personen.find((x) => x.id === personId);
  const q = m.qualifikationen.find((x) => x.id === qualId);
  const st = p && q ? nachweisStand(m, p, qualId) : null;
  const [ablauf, setAblauf] = useState(st && st.ablauf ? st.ablauf
    : q && q.gueltigMonate ? addDays(heute(), Math.round(q.gueltigMonate * 30.44)) : "");
  const [datei, setDatei] = useState(st && st.datei ? st.datei : "");
  const [vorhanden, setVorhanden] = useState(!!(st && st.stand === "gueltig" && st.nurStatus));
  if (!p || !q) return null;

  /* Nur der Status: liegt vor oder nicht. Keine Frist, keine Fundstelle —
     mehr darf zu diesem Nachweis nicht festgehalten werden. */
  if (q.nurStatus) {
    return (
      <Sheet open onClose={onClose} titel={`${q.name} · ${p.vorname} ${p.nachname}`} width={520}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>
            Für diesen Nachweis wird nur erfasst, ob er vorliegt. Datum, Datei oder Grund
            gehören nicht in die Dienstplanung{q.grundlage ? ` (${q.grundlage})` : ""}.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind={vorhanden ? "ok" : "plain"} onClick={() => setVorhanden(true)}>Liegt vor</Btn>
            <Btn kind={!vorhanden ? "danger" : "plain"} onClick={() => setVorhanden(false)}>Liegt nicht vor</Btn>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
            <Btn kind="primary" onClick={() => { akt.setzeNachweis(personId, qualId, null, null, vorhanden); onClose(); }}>
              Speichern</Btn>
          </div>
        </div>
      </Sheet>);
  }

  return (
    <Sheet open onClose={onClose} titel={`${q.name} · ${p.vorname} ${p.nachname}`} width={520}>
      {st && st.stand === "abgelaufen" && (
        <div style={{ padding: 14, borderRadius: 12, background: C.dangerLight, color: C.danger,
          fontSize: 13.5, marginBottom: 20, lineHeight: 1.5 }}>
          Seit {fDatum(st.ablauf)} ungültig. Solange kein neuer Nachweis vorliegt, zählt diese Qualifikation
          nicht für die Mindestbesetzung.
        </div>)}
      <div style={{ display: "grid", gap: 16 }}>
        {q.gueltigMonate
          ? <Field label="Gültig bis" hint={`Übliche Gültigkeit: ${q.gueltigMonate} Monate ab Ausstellung.`}>
              <Inp type="date" value={ablauf} onChange={(e) => setAblauf(e.target.value)} /></Field>
          : <div style={{ fontSize: 13.5, color: C.dim }}>Diese Qualifikation ist unbefristet.</div>}
        <Field label="Nachweis" hint="Dateiname oder Fundstelle. Das Dokument selbst gehört in die Personalakte.">
          <Inp value={datei} onChange={(e) => setDatei(e.target.value)}
            placeholder="z. B. Zertifikat_ErsteHilfe_2026.pdf" /></Field>
        {q.gueltigMonate && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn size="sm" kind="quiet" onClick={() => setAblauf(addDays(heute(), Math.round(q.gueltigMonate * 30.44)))}>
              Ab heute {q.gueltigMonate} Monate</Btn>
            <Btn size="sm" kind="quiet" onClick={() => setAblauf(addDays(heute(), 30))}>In 30 Tagen</Btn>
          </div>)}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" onClick={() => { akt.setzeNachweis(personId, qualId, ablauf || null, datei || null); onClose(); }}>
            Speichern</Btn>
        </div>
      </div>
    </Sheet>);
}
