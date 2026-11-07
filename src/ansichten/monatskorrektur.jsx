/* WP-16c: Korrekturrevision nach bestätigtem Lohnexport — Oberfläche (Leitung). Eigene Datei; eingehängt wird sie in den
   Stempelbefunden hinter <Monatsabschluss …/> (Snippet: docs/acc45/wp16c-nachweis.md). Alle Entscheidungen trifft der Server
   (lib/monatsabschluss.mjs); die Oberfläche zeigt den Stand und löst die Schritte aus. */
import { useState } from "react";
import { darf } from "../lib/berechtigung.js";
import { C } from "../farben.js";
import { monatText, KORREKTUR_ANLAESSE } from "../../server/lib/monatsabschluss.mjs";
import { zeitpunktText } from "../lib/datum.js";
import { NUM } from "../ui/thema.js";
import { Btn, Sel, Inp } from "../ui/bausteine.jsx";

/**
 * @param {{sitz: any, ym: string, akt: {monatKorrektur?: (aktion: string, monat: string, extra?: object) => Promise<any>} | null}} p
 */
export function MonatsKorrektur({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const [offen, setOffen] = useState(false);
  const [anlass, setAnlass] = useState("");
  const [grund, setGrund] = useState("");
  const [differenz, setDifferenz] = useState(null);
  if (!ym || !akt || !akt.monatKorrektur || !darf(sitz, "org.edit")) return null;
  const e = m.monatsabschluss && typeof m.monatsabschluss[ym] === "object" ? m.monatsabschluss[ym] : null;
  if (!e) return null;
  const revisionen = Array.isArray(e.revisionen) ? e.revisionen : [];
  const kor = e.korrektur && typeof e.korrektur === "object" ? e.korrektur : null;
  const exportiert = e.abgeschlossen === true && !!e.lohnexport && typeof e.lohnexport === "object";
  const laeuft = !!kor && kor.offen === true;
  if (!exportiert && !laeuft && !revisionen.length) return null;
  const revision = Number.isInteger(e.revision) ? e.revision : 1;
  const beginnen = async () => { const r = await akt.monatKorrektur("korrektur-beginnen", ym, { anlass, grund }); if (r && r.ok) { setOffen(false); setGrund(""); setAnlass(""); } };
  const freigeben = async () => {
    /* Erst die Differenz ansehen (der Server liefert sie mit 409), dann mit ihrer Prüfsumme freigeben. */
    const erg = await akt.monatKorrektur("korrektur-freigeben", ym, differenz ? { differenz: differenz.abdruck } : {});
    if (erg && erg.differenz && !erg.ok) setDifferenz(erg.differenz); else if (erg && erg.ok) setDifferenz(null);
  };
  /* Ausweg bei hängender Korrektur (nur Leitung, Grund Pflicht, keine zweite Person): Sperren fallen, Revision N bleibt. */
  const verwerfen = async () => {
    const g = typeof window !== "undefined" ? window.prompt("Grund für das Verwerfen der Korrektur (mindestens 10 Zeichen)") : null;
    if (g && g.trim().length >= 10) await akt.monatKorrektur("korrektur-verwerfen", ym, { grund: g.trim() });
  };
  return (
    <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>Korrektur nach Lohnexport — {monatText(ym)}</b>
        <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>Revision {revision}{revisionen.length ? ` · ${revisionen.length} abgelegt` : ""}</span>
        {exportiert && !offen && <Btn size="sm" onClick={() => setOffen(true)}>Korrektur beginnen</Btn>}
        {laeuft && <span style={{ fontSize: 12.5, color: C.warn }}>Korrektur läuft seit {zeitpunktText(kor.am)} — {KORREKTUR_ANLAESSE[kor.anlass] || kor.anlass}</span>}
        {laeuft && <Btn size="sm" onClick={verwerfen}>Korrektur verwerfen</Btn>}
        {laeuft && <Btn size="sm" onClick={freigeben}>{differenz ? "Differenz freigeben" : "Differenz ansehen / freigeben"}</Btn>}
      </div>
      {laeuft && kor.freigabe && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>
        Freigegeben von {kor.freigabe.wer && kor.freigabe.wer.name ? kor.freigabe.wer.name : "einer zweiten Person"} ({kor.freigabe.n} Lohnzeilen) — gilt nur für den jetzigen Stand.</div>}
      {differenz && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12.5, color: C.warn }}>
            Die Korrektur ändert {differenz.n} Lohnzeilen (Summe {differenz.summe} h). Zweite Person: bitte prüfen und „Differenz freigeben“.</div>
          {/* Die Freigabe sieht, was sie freigibt: Personalnummer, Lohnart, Stunden (nur für org.edit). */}
          <table style={{ fontSize: 12.5, marginTop: 4, borderCollapse: "collapse", ...NUM }}>
            <tbody>{(Array.isArray(differenz.zeilen) ? differenz.zeilen : []).map((z, i) => (
              <tr key={i}><td style={{ padding: "1px 10px 1px 0" }}>{z.personalnummer}</td><td style={{ padding: "1px 10px 1px 0" }}>{z.lohnart}</td>
                <td style={{ padding: "1px 10px 1px 0" }}>{z.bezeichnung}</td><td style={{ textAlign: "right" }}>{z.stunden > 0 ? "+" : ""}{z.stunden} h</td></tr>))}</tbody>
          </table>
        </div>)}
      {offen && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <Sel value={anlass} aria-label="Anlass der Korrektur" onChange={(x) => setAnlass(x.target.value)}>
            <option value="">— Anlass wählen —</option>
            {Object.entries(KORREKTUR_ANLAESSE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </Sel>
          <Inp value={grund} onChange={(x) => setGrund(x.target.value)} aria-label="Grund der Korrektur" placeholder="Grund (mindestens 10 Zeichen)" style={{ flex: 1, minWidth: 240 }} />
          <Btn size="sm" kind="primary" disabled={!anlass || grund.trim().length < 10} onClick={beginnen}>Korrektur beginnen</Btn>
          <Btn size="sm" onClick={() => setOffen(false)}>Abbrechen</Btn>
        </div>)}
    </div>);
}
