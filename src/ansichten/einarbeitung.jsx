/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { heute, fDatum, fKurz } from "../lib/datum.js";
import { addDays } from "../regelwerk.js";
import { H1, Btn, Card, Leer, Lab, Field, Sel, Inp } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { AnteilBalken } from "../ui/diagramme.jsx";
import { Sheet } from "../ui/leisten.jsx";
import { imDienst, einheitAm } from "../../server/lib/fachpruefung.mjs";
import { Hinweisband } from "../gestalt/ansichten.jsx";
import { mehrzahl } from "../lib/rollen.js";
import { einarbeitungLage } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";

/* ============================== EINARBEITUNG =========================== */
export function Einarbeitung({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ personId: "", mentorId: "", von: heute(), bis: addDays(heute(), 56), ziel: "" });
  const lage = useMemo(() => einarbeitungLage(m, heute(), addDays(heute(), 90)), [m]);
  const darfPflegen = darf(sitz, "staff.edit") || darf(sitz, "plan.edit.unit");

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Neue Kräfte werden einer festen Begleitung zugeordnet. CENTRIC prüft für jeden Diensttag, ob beide tatsächlich zusammen eingeteilt sind."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(true)}>Einarbeitung anlegen</Btn>}>
        Einarbeitung</H1>

      {lage.length === 0
        ? <Card><Leer titel="Keine laufende Einarbeitung"
            text="Ordne einer neuen Kraft eine Begleitung zu — die App prüft dann, ob beide gemeinsam Dienst haben." /></Card>
        : <div style={{ display: "grid", gap: 16 }}>
            {lage.map((e) => (
              <Card key={e.personId + e.von} style={{ padding: 22 }}>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-.015em" }}>
                      {e.person.vorname} {e.person.nachname}</div>
                    <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4 }}>
                      Begleitung: {e.mentor ? `${e.mentor.vorname} ${e.mentor.nachname}` : "nicht zugeordnet"}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                      {fDatum(e.von)} bis {fDatum(e.bis)}</div>
                    {e.ziel && <div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>{e.ziel}</div>}
                  </div>
                  <div style={{ minWidth: 210 }}>
                    <Lab style={{ marginBottom: 7 }}>Gemeinsame Dienste</Lab>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 27, fontWeight: 650, ...NUM,
                        color: e.quote === null ? C.dimmer : e.quote >= 80 ? C.ok : e.quote >= 50 ? C.warn : C.danger }}>
                        {e.quote === null ? "—" : `${e.quote}%`}</span>
                      <span style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                        {e.begleitet} von {e.tage} Diensten</span>
                    </div>
                    <AnteilBalken wert={e.quote || 0}
                      farbe={e.quote >= 80 ? C.ok : e.quote >= 50 ? C.warn : C.danger} />
                    {e.allein.length > 0 && (
                      <div style={{ fontSize: 12, color: C.warn, marginTop: 9, lineHeight: 1.45 }}>
                        Ohne Begleitung: {e.allein.slice(0, 5).map(fKurz).join(", ")}
                        {e.allein.length > 5 ? ` und ${e.allein.length - 5} weitere` : ""}
                      </div>)}
                  </div>
                  {darfPflegen && <Btn size="sm" kind="danger"
                    onClick={() => akt.loescheEinarbeitung(e.personId, e.von)}>Beenden</Btn>}
                </div>
              </Card>))}
          </div>}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Einarbeitung anlegen" width={560}>
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="Neue Kraft">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— wählen —</option>
              {m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false)
                .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname} · {p.funktion}</option>)}
            </Sel></Field>
          <Field label="Begleitung" hint="Sollte derselben Einheit angehören, sonst treffen sich beide selten im Dienst.">
            <Sel value={f.mentorId} onChange={(e) => setF({ ...f, mentorId: e.target.value })}>
              <option value="">— wählen —</option>
              {m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false && p.id !== f.personId)
                .map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname} · {p.funktion}</option>)}
            </Sel></Field>
          {f.personId && f.mentorId && einheitAm(m.personen.find((p) => p.id === f.personId), heute())
            !== einheitAm(m.personen.find((p) => p.id === f.mentorId), heute()) && (
            <Hinweisband ton="warn" style={{ marginBottom: 0, boxShadow: "none" }}>
              Beide gehören verschiedenen {mehrzahl(m.einheitLabel)} an. Sie werden dadurch kaum gemeinsam Dienst haben.
            </Hinweisband>)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Von"><Inp type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
          </div>
          <Field label="Ziel der Einarbeitung">
            <Inp value={f.ziel} onChange={(e) => setF({ ...f, ziel: e.target.value })}
              placeholder="z. B. selbstständiger Nachtdienst nach acht Wochen" /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.personId || !f.mentorId}
              onClick={() => { akt.neueEinarbeitung(f); setNeu(false);
                setF({ personId: "", mentorId: "", von: heute(), bis: addDays(heute(), 56), ziel: "" }); }}>
              Anlegen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
