/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { vorlagenFuer as tarifVorlagen, tarifwerk, FELDNAME as TARIF_FELD, wertText as tarifWert } from "../tarifwerke.js";

import { Card, CardHead, Lab, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { fDatum } from "../lib/datum.js";
import { NUM } from "../ui/thema.js";
import { Icon } from "../gestalt/icons.jsx";
import { anwenden as tarifAnwenden } from "../tarifwerke.js";
import { heute } from "../lib/datum.js";

/* ================================ BETRIEB ================================ */
/* ==========================================================================
   TARIFWERK

   Ein neuer Betrieb startete mit vierzig Wochenstunden und der gesetzlichen
   Nachtzeit ab 23 Uhr. In der Pflege stimmt beides fast nie: Der TVöD-P
   kennt 38,5 Stunden und zieht die Nachtgrenze bei 21 Uhr. Wer das nicht
   nachträgt, sammelt ein Jahr lang Minusstunden, die es nicht gibt, und
   zahlt Spätdiensten bis 22 Uhr keinen Nachtzuschlag.

   Die Vorlage ändert das Regelwerk, nicht den Betrieb: Personal,
   Dienstarten und Einheiten bleiben unberührt. Was sie ändert, steht
   vorher da — mit dem alten und dem neuen Wert nebeneinander.
   ========================================================================== */
export function Tarifwerk({ sitz, akt }) {
  const m = sitz.mandant;
  const [gewaehlt, setGewaehlt] = useState(null);
  const vorlagen = useMemo(() => tarifVorlagen(m.branche), [m.branche]);
  const t = gewaehlt ? tarifwerk(gewaehlt) : null;
  const vorschau = useMemo(
    () => (t ? tarifAnwenden(m, t.id, heute()) : null), [m, t]);
  const aktuell = m.tarifwerk || null;

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHead right={aktuell
        ? <Lab>{aktuell.name} · Stand {aktuell.stand}</Lab>
        : <Lab>keines hinterlegt</Lab>}>Tarifwerk</CardHead>
      <div style={{ padding: 22 }}>
        <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 16px", maxWidth: "72ch" }}>
          Eine Vorlage setzt Wochenarbeitszeit, Urlaub, Zusatzurlaub, das
          Nachtfenster und die Zuschlagssätze. Entgelttabellen enthält sie
          bewusst nicht — CENTRIC gibt Stunden je Zuschlagsart aus, den Betrag
          rechnet die Lohnstelle. Personal, Dienstarten und Einheiten bleiben
          unberührt.
        </p>

        {aktuell && (
          <Erklaerkasten style={{ marginBottom: 16 }}>
            Angewendet am {fDatum(aktuell.angewendet)} · Stand der Werte {aktuell.stand} ·{" "}
            <a href={aktuell.quelle} target="_blank" rel="noreferrer"
              style={{ color: C.accent }}>Fundstelle</a>
          </Erklaerkasten>)}

        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {vorlagen.map((v) => (
            <div key={v.id} className="karte"
              style={{ padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start",
                flexWrap: "wrap", boxShadow: "none", borderRadius: "var(--r)",
                borderColor: gewaehlt === v.id ? C.accent : undefined }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 14.5, fontWeight: 620, display: "flex", gap: 8,
                  alignItems: "center", flexWrap: "wrap" }}>
                  {v.name}
                  {aktuell && aktuell.id === v.id && <Pill size="sm" tone="ok">aktiv</Pill>}
                  {v.branchen.includes(m.branche) && <Pill size="sm" tone="accent">passt zur Branche</Pill>}
                </div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 4, lineHeight: 1.55 }}>
                  {v.beschreibung}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 5 }}>
                  {v.grundlage} · Stand {v.stand}</div>
              </div>
              <Btn size="sm" kind={gewaehlt === v.id ? "primary" : "plain"}
                onClick={() => setGewaehlt(gewaehlt === v.id ? null : v.id)}>
                {gewaehlt === v.id ? "Vorschau schließen" : "Vorschau"}</Btn>
            </div>))}
        </div>

        {t && vorschau && (
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
            <Lab style={{ marginBottom: 10 }}>
              Was sich ändert · {vorschau.geaendert.length}</Lab>
            {vorschau.geaendert.length === 0
              ? <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 14 }}>
                  Nichts. Der Betrieb steht bereits auf diesen Werten.</div>
              : (<div style={{ marginBottom: 16 }}>
                {vorschau.geaendert.map((g) => (
                  <div key={g.feld} style={{ display: "flex", gap: 12, alignItems: "baseline",
                    padding: "7px 0", borderBottom: `1px solid ${C.lineSoft}`, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, flex: 1, minWidth: 200 }}>
                      {TARIF_FELD[g.feld] || g.feld}</span>
                    <span style={{ fontSize: 13, color: C.dimmer, ...NUM }}>{tarifWert(g.von)}</span>
                    <span aria-hidden="true" style={{ color: C.dimmer, display: "flex" }}><Icon n="pfeil-rechts" size={14} /></span>
                    <span style={{ fontSize: 13, fontWeight: 620, ...NUM }}>{tarifWert(g.nach)}</span>
                  </div>))}
              </div>)}

            <Lab style={{ marginBottom: 8 }}>Was die Vorlage nicht kann</Lab>
            <ul style={{ margin: "0 0 18px", paddingLeft: 20, fontSize: 13,
              color: C.dim, lineHeight: 1.6 }}>
              {t.hinweise.map((h, i) => <li key={i} style={{ marginBottom: 5 }}>{h}</li>)}
            </ul>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Btn kind="primary" disabled={vorschau.geaendert.length === 0}
                onClick={() => { akt.tarifwerkAnwenden(t.id); setGewaehlt(null); }}>
                {t.name} anwenden</Btn>
              <Btn kind="quiet" onClick={() => setGewaehlt(null)}>Abbrechen</Btn>
              <a href={t.quelle} target="_blank" rel="noreferrer"
                style={{ fontSize: 13, color: C.accent }}>Fundstelle ansehen</a>
            </div>
          </div>)}
      </div>
    </Card>);
}
