/* ==========================================================================
   SELBSTAUSKUNFT ALS ANTRAG (WP-15) — Oberfläche

   - SelbstauskunftStatus: „Meine Zeiten-Anträge" in „Meine Schichten": offener Antrag
     (zählt noch nicht), freigegeben, abgelehnt mit Begründung; „Zurückziehen".
   - SelbstauskunftFreigabe: Leitung und Planung — offene Selbstauskünfte mit Plan,
     Vorschlag und der vom Server gerechneten Abweichung; „Freigeben" (nie die eigene)
     und „Ablehnen" mit Begründung.

   Die Daten kommen aus erfassung[Person|Tag].selbstauskunft, so wie der Server sie
   der Rolle liefert (Beschäftigte nur die eigenen, Betriebsrat und Dritte keine).
   Gespeichert wird über POST /api/selbstauskunft-entscheiden; `onErgebnis(pid, datum, erg)`
   übernimmt den neuen Stand (erg.eintrag) in den Zustand der Anwendung, `melde(text)`
   zeigt die Meldung.
   ========================================================================== */
import { useState } from "react";
import { Card, CardHead, Pill, Btn } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fDatum } from "../lib/datum.js";
import { selbstauskunftEntscheiden } from "../speicher.js";

const STATUS_TEXT = { offen: "offen — zählt noch nicht", genehmigt: "freigegeben", abgelehnt: "abgelehnt", zurueckgezogen: "zurückgezogen" };
const STATUS_TON = { offen: "warn", genehmigt: "ok", abgelehnt: "danger" };
const MARKEN = { BEGINN: "Beginn", ENDE: "Ende", DAUER: "Dauer", PAUSE: "Pause" };

/** Alle Selbstauskünfte aus erfassung, optional nur einer Person; neueste Tage zuerst. */
export function selbstauskuenfteVon(m, personId) {
  return Object.entries((m && m.erfassung) || {})
    .filter(([k, e]) => e && typeof e === "object" && e.selbstauskunft && typeof e.selbstauskunft === "object"
      && (personId === undefined || k.split("|")[0] === String(personId)))
    .map(([k, e]) => ({ personId: k.split("|")[0], datum: k.split("|")[1], antrag: e.selbstauskunft }))
    .sort((a, b) => b.datum.localeCompare(a.datum));
}

const zeitText = (v) => (!v || (v.start === null && v.ende === null)
  ? "wie geplant" : `${v.start}–${v.ende}${v.pause !== undefined ? `, Pause ${v.pause} min` : ""}`);
const min = (n) => `${n > 0 ? "+" : ""}${n} min`;

function Abweichung({ a }) {
  const ab = a && a.abweichung;
  if (!ab) return <span style={{ color: C.dim }}>kein Plan hinterlegt</span>;
  if (!ab.abweichend) return <span style={{ color: C.dim }}>keine Abweichung vom Plan</span>;
  return (<span>
    <b>Abweichung vom Plan</b> ({ab.plan.start}–{ab.plan.ende}, Pause {ab.plan.pause} min):{" "}
    {ab.marken.map((x) => MARKEN[x] || x).join(", ")}
    {" "}(Beginn {min(ab.beginnMin)}, Ende {min(ab.endeMin)}, Dauer {min(ab.dauerMin)}{ab.pauseMin ? `, Pause ${min(ab.pauseMin)}` : ""})</span>);
}

async function entscheide(p, entscheidung, begruendung, onErgebnis, melde) {
  try {
    const erg = await selbstauskunftEntscheiden(p.personId, p.datum, p.antrag.id, entscheidung, begruendung);
    if (onErgebnis) onErgebnis(p.personId, p.datum, erg);
    const hinweise = Array.isArray(erg.hinweise) ? erg.hinweise.map((h) => h.text).join(" ") : "";
    if (melde) melde(entscheidung === "genehmigt" ? `Zeit freigegeben.${hinweise ? ` Hinweise: ${hinweise}` : ""}`
      : entscheidung === "abgelehnt" ? "Antrag abgelehnt — die Begründung steht am Antrag." : "Antrag zurückgezogen.");
    return true;
  } catch (e) {
    if (melde) melde(e.message || "Die Entscheidung ließ sich nicht speichern.");
    return false;
  }
}

/** Die eigenen Zeiten-Anträge der angemeldeten Person. */
export function SelbstauskunftStatus({ m, ich, onErgebnis, melde }) {
  const liste = ich ? selbstauskuenfteVon(m, ich.id).slice(0, 10) : [];
  if (!liste.length) return null;
  const offen = liste.filter((x) => x.antrag.status === "offen").length;
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHead right={<Pill tone={offen ? "warn" : undefined}>{offen} offen</Pill>}>Meine Zeiten-Anträge</CardHead>
      <div style={{ padding: "6px 18px 14px" }}>
        {liste.map((p) => (
          <div key={`${p.personId}|${p.datum}`} style={{ padding: "10px 0", borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={NUM}>{fDatum(p.datum)}</b>
              <Pill tone={STATUS_TON[p.antrag.status]}>{STATUS_TEXT[p.antrag.status] || p.antrag.status}</Pill>
              <span>{zeitText(p.antrag.vorschlag)}</span>
              {p.antrag.status === "offen" && (
                <Btn kind="quiet" onClick={() => entscheide(p, "zurueckgezogen", "", onErgebnis, melde)}>Antrag zurückziehen</Btn>)}
            </div>
            {p.antrag.status === "offen" && <div style={{ color: C.dim, marginTop: 4 }}>
              Bis zur Freigabe durch die Leitung zählt für diesen Tag die Planzeit.</div>}
            {p.antrag.status === "abgelehnt" && p.antrag.entschieden && p.antrag.entschieden.begruendung && (
              <div style={{ color: C.dim, marginTop: 4 }}>Begründung: {p.antrag.entschieden.begruendung}</div>)}
          </div>))}
      </div>
    </Card>);
}

/** Offene Selbstauskünfte zur Freigabe (Leitung, Planung). `ichId`: die eigene Person — ihr Antrag bleibt unfreigebbar. */
export function SelbstauskunftFreigabe({ m, ichId, onErgebnis, melde }) {
  const [grund, setGrund] = useState({});
  const offen = selbstauskuenfteVon(m).filter((x) => x.antrag.status === "offen").reverse();
  if (!offen.length) return null;
  const name = (pid) => {
    const p = (m.personen || []).find((x) => String(x.id) === String(pid));
    return p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "?";
  };
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHead right={<Pill tone="warn">{offen.length}</Pill>}>Selbstauskünfte zur Freigabe</CardHead>
      <div style={{ padding: "6px 18px 14px" }}>
        {offen.map((p) => {
          const k = `${p.personId}|${p.datum}`;
          const eigene = ichId !== undefined && ichId !== null && String(ichId) === String(p.personId);
          return (
            <div key={k} style={{ padding: "10px 0", borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
              <div><b>{name(p.personId)}</b> · <span style={NUM}>{fDatum(p.datum)}</span> · {zeitText(p.antrag.vorschlag)}</div>
              <div style={{ marginTop: 3 }}><Abweichung a={p.antrag} /></div>
              {p.antrag.grund ? <div style={{ color: C.dim, marginTop: 3 }}>Grund: {p.antrag.grund}</div> : null}
              <div style={{ color: C.dim, marginTop: 3 }}>
                Stempelabgleich beim Stellen: kein Stempel für diesen Tag. Bei der Freigabe prüft der Server erneut.</div>
              {eigene ? <div style={{ marginTop: 6, color: C.dim }}>Die eigene Selbstauskunft gibt eine andere Person frei.</div> : (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn kind="primary" onClick={() => entscheide(p, "genehmigt", "", onErgebnis, melde)}>Freigeben</Btn>
                  <input aria-label={`Begründung für ${name(p.personId)}`} placeholder="Begründung der Ablehnung (mind. 10 Zeichen)"
                    value={grund[k] || ""} onChange={(e) => setGrund({ ...grund, [k]: e.target.value })}
                    style={{ minWidth: 240, padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 6 }} />
                  <Btn onClick={() => entscheide(p, "abgelehnt", grund[k] || "", onErgebnis, melde)}>Ablehnen</Btn>
                </div>)}
            </div>);
        })}
      </div>
    </Card>);
}
