/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { darf } from "../lib/berechtigung.js";
import { freezeGeloescht, lohnexportRueckfrage, VORMONAT_KATEGORIEN, freezeZeilen } from "../lib/fachlogik.js";
import { abschlussLuecken, abschlussLueckeText } from "../../server/lib/isteinfrieren.mjs";
import { heute, zeitpunktText, fKurz } from "../lib/datum.js";
import { C } from "../farben.js";
import { monatText } from "../../server/lib/monatsabschluss.mjs";
import { NUM } from "../ui/thema.js";
import { Btn, Sel, Inp } from "../ui/bausteine.jsx";

/**
 * Stand des Monats in den Stempelbefunden — nur für Leitung und Planung (staff.edit). Abgeschlossen:
 * Wann, Wer, Verlauf mit Grund, nach dem Abschluss abgewiesene Stempel; „Wiederöffnen“ nur mit
 * org.edit (Leitung), mit Grund. Offen und vergangen: „Monat abschließen“. Laufender Monat: Hinweis.
 */
export function Monatsabschluss({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const [grund, setGrund] = useState("");
  const [oeffnen, setOeffnen] = useState(false);
  /* Überstimmung offener/geänderter Vormonate beim Lohnexport (WP-16, Nachtrag vierter Review A-2): Kategorie und Begründung. */
  const [trotz, setTrotz] = useState(null);
  if (!darf(sitz, "staff.edit") || !ym) return null;
  const e = m.monatsabschluss && m.monatsabschluss[ym] && typeof m.monatsabschluss[ym] === "object" ? m.monatsabschluss[ym] : null;
  const zu = !!e && e.abgeschlossen === true;
  const exportiert = zu && !!e.lohnexport && typeof e.lohnexport === "object";
  const luecken = zu && !freezeGeloescht(m, ym) ? abschlussLuecken(m, ym) : [];
  const rueckfrage = zu && !exportiert ? lohnexportRueckfrage(m, ym) : null;
  const bestaetigen = () => { if (rueckfrage && rueckfrage.vormonate) setTrotz({ kategorie: "", grund: "" }); else akt.lohnexportBestaetigen(ym); };
  const laufend = ym >= heute().slice(0, 7);
  const name = (pid) => { const x = m.personen.find((q) => String(q.id) === String(pid)); return x ? `${x.vorname} ${x.nachname}` : pid; };
  const verlauf = e && Array.isArray(e.verlauf) ? e.verlauf : [];
  const abgewiesen = e && Array.isArray(e.abgewiesen) ? e.abgewiesen : [];
  /* Review M3: weitere über der Obergrenze je Person nur gezählt. */
  const gezaehlt = e && e.abgewiesenGezaehlt && typeof e.abgewiesenGezaehlt === "object"
    ? Object.entries(e.abgewiesenGezaehlt).filter(([, n]) => Number(n) > 0) : [];
  const anzahlAbgewiesen = abgewiesen.reduce((a, x) => a + (Number(x.anzahl) || 1), 0) + gezaehlt.reduce((a, [, n]) => a + Number(n), 0);
  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{zu ? `${monatText(ym)} abgeschlossen` : laufend ? `${monatText(ym)} läuft` : `${monatText(ym)} ist offen`}</b>
        {zu && <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>am {zeitpunktText(e.am)}{e.wer && e.wer.name ? ` von ${e.wer.name}` : ""}</span>}
        {!zu && !laufend && akt && <Btn size="sm" kind="primary" onClick={() => akt.monatAbschliessen(ym)}>Monat abschließen</Btn>}
        {zu && akt && darf(sitz, "org.edit") && !oeffnen && !exportiert && <Btn size="sm" onClick={() => { setOeffnen(true); setGrund(""); }}>Wiederöffnen</Btn>}
        {/* Lohnexport bestätigen (Betreiberentscheidung 2026-11-03): danach kein einfaches Wiederöffnen mehr. */}
        {zu && akt && akt.lohnexportBestaetigen && darf(sitz, "org.edit") && !exportiert && !oeffnen && !trotz
          && <Btn size="sm" onClick={bestaetigen}>Lohnexport bestätigen</Btn>}
        {exportiert && <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>Lohnexport bestätigt am {zeitpunktText(e.lohnexport.am)}{e.lohnexport.wer && e.lohnexport.wer.name ? ` von ${e.lohnexport.wer.name}` : ""}</span>}
      </div>
      {exportiert && <div style={{ fontSize: 12.5, color: C.warn, marginTop: 4 }}>
        Der Lohnexport ist bestätigt — der Abschluss lässt sich nicht mehr einfach wiederöffnen; eine Änderung braucht den Korrekturprozess.</div>}
      {luecken.length > 0 && <div style={{ fontSize: 12.5, color: C.warn, marginTop: 4 }}>
        {luecken.length === 1 ? "1 Person" : `${luecken.length} Personen`} ohne eingefrorenes Ist ({luecken.map((p) => `${p.vorname} ${p.nachname}`).join(", ")}): {abschlussLueckeText(m, ym)}</div>}
      {trotz && zu && !exportiert && (
        <div style={{ marginTop: 8, padding: "10px 12px", border: `1px solid ${C.warn}`, borderRadius: 6 }}>
          <div style={{ fontSize: 12.5, color: C.warn, whiteSpace: "pre-line", lineHeight: 1.45 }}>{rueckfrage ? rueckfrage.text : ""}</div>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>Bestätigen nur ausdrücklich: Kategorie wählen und begründen (steht im Verlauf).</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <Sel value={trotz.kategorie} aria-label="Kategorie der Begründung" onChange={(x) => setTrotz({ ...trotz, kategorie: x.target.value })}>
              <option value="">— Kategorie wählen —</option>
              {VORMONAT_KATEGORIEN.map((k) => <option key={k.id} value={k.id}>{k.text}</option>)}</Sel>
            <Inp value={trotz.grund} maxLength={500} onChange={(x) => setTrotz({ ...trotz, grund: x.target.value })} aria-label="Begründung für den Lohnexport trotz Vormonat"
              placeholder="Begründung (10–500 Zeichen)" style={{ flex: 1, minWidth: 240 }} />
            <Btn size="sm" kind="danger" disabled={!trotz.kategorie || trotz.grund.trim().length < 10 || trotz.grund.trim().length > 500}
              onClick={async () => { if (await akt.lohnexportBestaetigen(ym, { kategorie: trotz.kategorie, grund: trotz.grund.trim() })) setTrotz(null); }}>Trotz Vormonat bestätigen</Btn>
            <Btn size="sm" onClick={() => setTrotz(null)}>Abbrechen</Btn>
          </div>
        </div>)}
      {/* Freeze-Hinweise (WP-16, Nachtrag dritter Review H-1/M-1/N-d): Format, offene Vormonate, Rechenstand, entfernte Personen. */}
      {zu && freezeZeilen(m, ym).filter(Boolean).map((t, i) => <div key={i} style={{ fontSize: 12.5, color: /^ACHTUNG/.test(t) ? C.warn : C.dim, marginTop: 4 }}>{t}</div>)}
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>
        {zu ? "Ist-Zeiten, Stempel, Korrekturen, Anträge und Selbstauskunft dieses Monats sind gesperrt; Stundenkonto und Lohnausgabe rechnen mit dem Ist zum Abschluss — spätere Änderungen an Plan, Dienstarten oder Abwesenheiten wirken erst, wenn der Monat wieder offen ist. Wieder öffnen kann ihn nur die Leitung, mit Grund."
          : laufend ? "Abschließen lässt sich ein Monat erst nach dem Monatsende."
            : "Mit dem Abschluss werden Ist-Zeiten, Stempel, Korrekturen, Anträge und Selbstauskunft dieses Monats gesperrt."}</div>
      {oeffnen && zu && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <Inp value={grund} onChange={(x) => setGrund(x.target.value)} aria-label="Grund für das Wiederöffnen" placeholder="Grund (mindestens 10 Zeichen)" style={{ flex: 1, minWidth: 240 }} />
          <Btn size="sm" kind="danger" disabled={grund.trim().length < 10}
            onClick={async () => { if (await akt.monatWiederoeffnen(ym, grund)) setOeffnen(false); }}>Monat wiederöffnen</Btn>
          <Btn size="sm" onClick={() => setOeffnen(false)}>Abbrechen</Btn>
        </div>)}
      {anzahlAbgewiesen > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.warn }}>
            {anzahlAbgewiesen === 1 ? "1 Stempel nach dem Abschluss abgewiesen" : `${anzahlAbgewiesen} Stempel nach dem Abschluss abgewiesen`}</div>
          <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.45 }}>
            {exportiert
              ? "Nicht gespeichert, nicht verloren: auf dem Gerät der Person sichtbar. Der Lohnexport ist bestätigt — ein Nachtrag geht nur noch über den Korrekturprozess, nicht durch erneutes Senden."
              : "Nicht gespeichert, nicht verloren: auf dem Gerät der Person sichtbar. Ist der Monat wieder offen, lässt er sich dort erneut senden."}</div>
          {abgewiesen.map((x, i) => (
            <div key={`${x.ereignis || i}`} style={{ fontSize: 12.5, ...NUM }}>
              {name(x.personId)} · {fKurz(x.datum)} · {x.art === "start" ? "Beginn" : "Ende"} {x.zeit || ""}{x.offline ? " · offline erfasst" : ""}{x.alt ? ", erst nach über 48 Stunden gesendet" : ""}{Number(x.anzahl) > 1 ? ` · ${x.anzahl}-mal` : ""}</div>))}
          {gezaehlt.map(([pid, n]) => (
            <div key={`gezaehlt-${pid}`} style={{ fontSize: 12.5, color: C.dim, ...NUM }}>
              {name(pid)} · {n} weitere nur gezählt (über der Obergrenze je Person)</div>))}
        </div>)}
      {verlauf.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {verlauf.map((x) => (
            <div key={x.id} style={{ fontSize: 12.5, color: C.dim, ...NUM }}>
              {x.art === "wiederoeffnung" ? "wiedergeöffnet" : x.art === "lohnexport" ? "Lohnexport bestätigt" : "abgeschlossen"} {zeitpunktText(x.am)}{x.wer && x.wer.name ? ` · ${x.wer.name}` : ""}{x.grund ? ` — ${x.grund}` : ""}{x.art === "wiederoeffnung" && Number(x.istNeu) > 0 ? ` · Ist an ${x.istNeu} Personentagen seit dem Abschluss geändert (Plan, Dienstart oder Abwesenheit)` : ""}</div>))}
        </div>)}
    </div>);
}
