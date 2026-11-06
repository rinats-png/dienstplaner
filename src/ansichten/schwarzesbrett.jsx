/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { darf } from "../lib/berechtigung.js";
import { H1, Btn, Card, Leer, Pill, Field, Inp, Schalter } from "../ui/bausteine.jsx";
import { Abschnittskopf } from "../gestalt/ansichten.jsx";
import { heute, fDatum } from "../lib/datum.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Sheet } from "../ui/leisten.jsx";

/* ============================ SCHWARZES BRETT ========================== */
export function SchwarzesBrett({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ titel: "", text: "", wichtig: false, bis: "" });
  const darfSchreiben = darf(sitz, "staff.edit") || darf(sitz, "org.edit") || darf(sitz, "plan.edit.unit");
  const eintraege = (m.aushang || []).slice().sort((a, b) => (a.wichtig === b.wichtig ? 0 : a.wichtig ? -1 : 1));

  return (
    <div>
      <H1 rubrik="Betrieb" sub="Aushänge für alle im Betrieb. Für Nachrichten an einzelne Personen gibt es die Mitteilungen."
        right={darfSchreiben && <Btn kind="primary" onClick={() => setNeu(true)}>Aushang verfassen</Btn>}>
        Schwarzes Brett</H1>

      {eintraege.length === 0
        ? <Card><Leer titel="Nichts angeschlagen" text="Hier stehen Mitteilungen, die alle im Betrieb betreffen — Termine, Änderungen, Hinweise." /></Card>
        : <>
          <Abschnittskopf titel="Angeschlagen"
            sub={`${eintraege.filter((x) => !(x.bis && x.bis < heute())).length} gelten · ${eintraege.filter((x) => x.wichtig).length} wichtig · ${eintraege.filter((x) => x.bis && x.bis < heute()).length} abgelaufen`}
            rechts="Wichtige zuerst, danach nach Eingang" />
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,420px),1fr))",
            alignItems: "start" }}>
            {eintraege.map((x) => {
              const abgelaufen = x.bis && x.bis < heute();
              return (
                <Card key={x.id} style={{ padding: 22, opacity: abgelaufen ? .55 : 1,
                  borderLeft: x.wichtig ? `4px solid ${C.danger}` : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                        {x.wichtig && <Pill size="sm" tone="danger">wichtig</Pill>}
                        {abgelaufen && <Pill size="sm">abgelaufen</Pill>}
                        <span style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-.015em" }}>{x.titel}</span>
                      </div>
                      <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{x.text}</div>
                      <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, ...NUM }}>
                        {x.von} · {x.zeit}{x.bis ? ` · aushängen bis ${fDatum(x.bis)}` : ""}</div>
                    </div>
                    {darfSchreiben && <Btn size="sm" kind="danger" onClick={() => akt.loescheAushang(x.id)}>Abnehmen</Btn>}
                  </div>
                </Card>);
            })}
          </div></>}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Aushang verfassen" width={580}>
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="Überschrift"><Inp value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} /></Field>
          <Field label="Text"><textarea className="inp" rows={6} value={f.text}
            onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, alignItems: "end" }}>
            <Field label="Aushängen bis" hint="Leer bedeutet unbefristet.">
              <Inp type="date" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></Field>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer", paddingBottom: 10 }}>
              <Schalter an={f.wichtig} onChange={() => setF({ ...f, wichtig: !f.wichtig })} />
              <span style={{ fontSize: 14 }}>Als wichtig hervorheben</span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.titel.trim()} onClick={() => {
              akt.neuerAushang(f); setF({ titel: "", text: "", wichtig: false, bis: "" }); setNeu(false); }}>
              Anschlagen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}
