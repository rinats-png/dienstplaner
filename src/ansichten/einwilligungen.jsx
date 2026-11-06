/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { Lab, Sel, Inp, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { heute } from "../lib/datum.js";

/**
 * Einwilligungen nach dem Mutterschutzgesetz (Nutzerentscheidung, WP-11):
 * § 5 Abs. 2 (Arbeit 20–22 Uhr) und § 6 Abs. 1 (Sonn- und Feiertag), je mit
 * Zeitraum und dem Vermerk, dass die behördliche Genehmigung (§ 28) vorliegt.
 * Im Zeitraum meldet die Prüfung nur einen Hinweis; nach 22 Uhr bleibt
 * Nachtarbeit gesperrt. Wann und von wem geändert, setzt der Server.
 */
export function Einwilligungen({ p, akt }) {
  const gespeichert = Array.isArray(p.mutterschutzEinwilligungen) ? p.mutterschutzEinwilligungen : [];
  /* Ein Entwurf, der erst gespeichert wird, wenn er vollständig ist (Review N1):
     Art, Beginn und Ende sind Pflicht, das Ende nicht vor dem Beginn. */
  const [entwurf, setEntwurf] = useState(null);
  const liste = entwurf || gespeichert;
  const fehler = liste.map((e) => (!e.ab || !e.bis ? "Beginn und Ende angeben." : e.bis < e.ab ? "Das Ende liegt vor dem Beginn." : null));
  const aendere = (i, k, v) => setEntwurf(liste.map((e, j) => (j === i ? { art: e.art, ab: e.ab, bis: e.bis || null,
    ...(e.genehmigung ? { genehmigung: true } : {}), [k]: v } : e)));
  const speichern = () => { akt.setzePerson(p.id, "mutterschutzEinwilligungen", liste); setEntwurf(null); };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Lab>Einwilligungen (Mutterschutz)</Lab>
      {liste.map((e, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Sel value={e.art} style={{ width: 190 }} onChange={(x) => aendere(i, "art", x.target.value)}>
              <option value="nacht">20–22 Uhr (§ 5 Abs. 2)</option>
              <option value="sonntag">Sonntag (§ 6 Abs. 1)</option></Sel>
            <Inp type="date" value={e.ab || ""} style={{ width: 150 }} aria-label="gültig ab" onChange={(x) => aendere(i, "ab", x.target.value)} />
            <Inp type="date" value={e.bis || ""} style={{ width: 150 }} aria-label="gültig bis" onChange={(x) => aendere(i, "bis", x.target.value || null)} />
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={!!e.genehmigung} onChange={(x) => aendere(i, "genehmigung", x.target.checked)} />
              behördliche Genehmigung liegt vor</label>
            <Btn size="sm" kind="danger" onClick={() => setEntwurf(liste.filter((_, j) => j !== i))}>Entfernen</Btn>
          </div>
          {fehler[i] && <div role="alert" style={{ fontSize: 12, color: C.danger }}>{fehler[i]}</div>}
        </div>))}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn size="sm" onClick={() => setEntwurf([...liste, { art: "nacht", ab: heute(), bis: null }])}>Einwilligung erfassen</Btn>
        {entwurf && <Btn size="sm" kind="primary" disabled={fehler.some(Boolean)} onClick={speichern}>Speichern</Btn>}
        {entwurf && <Btn size="sm" kind="quiet" onClick={() => setEntwurf(null)}>Verwerfen</Btn>}
      </div>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
        Im Zeitraum meldet die Prüfung nur einen Hinweis. Arbeit nach 22 Uhr bleibt gesperrt. Feiertage prüft CENTRIC
        nicht gesondert. Ob ärztliche Unbedenklichkeit und behördliche Genehmigung vorliegen, verantwortet der Betrieb.
        Stehen bestehende Einteilungen einer Änderung entgegen, bitte erst umplanen.</div>
    </div>);
}
