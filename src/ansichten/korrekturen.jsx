/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { monatAbgeschlossen } from "../../server/lib/monatsabschluss.mjs";
import { useState } from "react";
import { C } from "../farben.js";
import { Inp, Btn, Card, Rubrik, Pill, CardHead, Lab } from "../ui/bausteine.jsx";
import { heute, fKurz } from "../lib/datum.js";
import { addDays } from "../regelwerk.js";
import { endeFehlt, MARKIERUNG_TEXT, geoAnzeige } from "../stempelvorgang.js";
import { NUM } from "../ui/thema.js";
import { erfassungenZurPruefung, istUngeplant, UNGEPLANT_ABWESEND_TEXT, nurKorrekturGrund, gemesseneDauerMin, dauerMinText } from "../istdaten.js";
import { darf } from "../lib/berechtigung.js";
import { Icon } from "../gestalt/icons.jsx";
import { GEO_SPOOFING_TEXT } from "../../server/lib/geo.mjs";
import { abwesenheitAm } from "../lib/fachlogik.js";
import { Monatsabschluss } from "./monatsabschluss.jsx";
import { KorrekturAntraege } from "./korrekturantraege.jsx";
import { MonatsKorrektur } from "./monatskorrektur.jsx";
import { SelbstauskunftFreigabe } from "./selbstauskunft.jsx";
import { KorrekturOffene } from "./korrekturoffene.jsx";

/* Die Befundkennung aus geoAnzeige (stempelvorgang.js) ist Daten; das
   Häkchen zeigt die Oberfläche als Icon aus dem Satz, nicht als Textzeichen. */
export const GEO_SYMBOL_ICON = { "\u2713": "haken" };

/** Die Meldung nach einer Korrektur: Hinweis zu vielen Korrekturen oder die Regelhinweise (C3/C4), sonst der Standardsatz. */
export function korrekturMeldung(erg) {
  const h = (erg && Array.isArray(erg.hinweise) ? erg.hinweise : []).map((x) => x.text);
  const kopf = (erg && erg.hinweis) || "Korrektur gespeichert — der Stempel bleibt unverändert.";
  return h.length ? `${kopf} Hinweise: ${h.join(" ")}` : kopf;
}

/* --------------------------------------------------------------------------
   KORREKTURWORKFLOW (WP-14) — Oberfläche
   -------------------------------------------------------------------------- */
export const UHR_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ANTRAG_STATUS_TEXT = { offen: "offen", genehmigt: "genehmigt", abgelehnt: "abgelehnt", zurueckgezogen: "zurückgezogen" };

/* --------------------------------------------------------------------------
   MONATSABSCHLUSS (WP-16) — Oberfläche
   -------------------------------------------------------------------------- */
/** Ist der Monat dieses Tages abgeschlossen? Dieselbe Regel wie der Server (lib/monatsabschluss.mjs). */
export const monatGesperrt = (m, datum) => monatAbgeschlossen(m, datum);
/** Beginn, Ende, Pause und Grund — für Antrag und direkte Korrektur. */
export function ZeitFormular({ start = "", ende = "", pause = "", knopf, onSenden, onAbbrechen, grundHilfe = "Grund (mindestens 10 Zeichen)" }) {
  const [v, setV] = useState({ start, ende, pause: pause === undefined || pause === null ? "" : String(pause), grund: "" });
  const gueltig = UHR_FORMAT.test(v.start) && UHR_FORMAT.test(v.ende) && v.grund.trim().length >= 10;
  const set = (f) => (e) => setV((x) => ({ ...x, [f]: e.target.value }));
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: "8px 0" }}>
      <label style={{ fontSize: 12, color: C.dim }}>Beginn<br /><Inp type="time" value={v.start} onChange={set("start")} aria-label="Beginn" style={{ width: 110 }} /></label>
      <label style={{ fontSize: 12, color: C.dim }}>Ende<br /><Inp type="time" value={v.ende} onChange={set("ende")} aria-label="Ende" style={{ width: 110 }} /></label>
      <label style={{ fontSize: 12, color: C.dim }}>Pause (min)<br /><Inp type="number" min="0" max="180" value={v.pause} onChange={set("pause")} aria-label="Pause in Minuten" style={{ width: 90 }} /></label>
      <label style={{ fontSize: 12, color: C.dim, flex: 1, minWidth: 220 }}>Grund<br /><Inp value={v.grund} onChange={set("grund")} aria-label="Grund" placeholder={grundHilfe} style={{ width: "100%" }} /></label>
      <Btn size="sm" kind="primary" disabled={!gueltig} onClick={() => onSenden(v)}>{knopf}</Btn>
      {onAbbrechen && <Btn size="sm" onClick={onAbbrechen}>Abbrechen</Btn>}
    </div>);
}

/**
 * Die eigenen Stempel der letzten 14 Tage mit „Korrektur beantragen“ (WP-14). Das Original bleibt;
 * der Antrag nennt Beginn, Ende, Pause und Grund, die Leitung entscheidet. Offene Anträge lassen
 * sich zurückziehen; abgelehnte zeigen die Begründung.
 */
export function KorrekturKarte({ sitz, akt }) {
  const m = sitz.mandant, p = sitz.person;
  const [offen, setOffen] = useState(null);
  if (!p) return null;
  const d0 = heute();
  const tage = Object.entries(m.einstempeln || {})
    .map(([k, e]) => { const [pid, datum] = k.split("|"); return { pid, datum, e }; })
    .filter((z) => String(z.pid) === String(p.id) && z.datum && z.datum <= d0 && z.datum >= addDays(d0, -14) && z.e)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  if (!tage.length) return null;
  return (
    <Card style={{ padding: 20, marginTop: 16 }}>
      <Rubrik>Meine Stempel · Korrektur beantragen</Rubrik>
      <div style={{ fontSize: 12.5, color: C.dim, margin: "6px 0 10px", lineHeight: 1.45 }}>
        Dein Stempel bleibt, wie er ist. Eine Korrektur beantragst du mit Grund; die Leitung genehmigt oder lehnt ab.</div>
      {tage.map(({ datum, e }) => {
        const antraege = Array.isArray(e.antraege) ? e.antraege : [];
        const letzter = antraege[antraege.length - 1];
        const ist = (m.erfassung || {})[`${p.id}|${datum}`];
        const marken = [...(e.markierungen || []), ...(endeFehlt(datum, e) ? ["ENDE_FEHLT"] : [])];
        /* Monatsabschluss (WP-16): im abgeschlossenen Monat kein Antrag — der Server nimmt ihn nicht an. */
        const zu = monatGesperrt(m, datum);
        return (
          <div key={datum} style={{ padding: "8px 0", borderTop: `1px solid ${C.lineSoft}` }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ minWidth: 90, ...NUM }}>{fKurz(datum)}</span>
              <span style={{ ...NUM }}>Stempel {e.start || "–"}–{e.ende || "–"}</span>
              {ist && ist.bestaetigt && <span style={{ color: C.dim, ...NUM }}>gilt {ist.start}–{ist.ende}{ist.pause !== undefined ? ` · Pause ${ist.pause} min` : ""}</span>}
              {marken.map((x) => <Pill key={x} size="sm" tone="warn">{MARKIERUNG_TEXT[x] || x}</Pill>)}
              {letzter && <Pill size="sm" tone={letzter.status === "genehmigt" ? "ok" : letzter.status === "abgelehnt" ? "danger" : "accent"}>
                Antrag {ANTRAG_STATUS_TEXT[letzter.status] || letzter.status}</Pill>}
              {zu && <Pill size="sm" tone="neutral">Monat abgeschlossen — Korrektur nur nach Wiederöffnen durch die Leitung</Pill>}
              {!zu && (!letzter || letzter.status !== "offen") && offen !== datum &&
                <Btn size="sm" onClick={() => setOffen(datum)}>Korrektur beantragen</Btn>}
              {!zu && letzter && letzter.status === "offen" &&
                <Btn size="sm" onClick={() => akt.korrekturEntscheiden(String(p.id), datum, letzter.id, "zurueckgezogen")}>Antrag zurückziehen</Btn>}
            </div>
            {letzter && letzter.status === "offen" && (
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4, ...NUM }}>
                Beantragt: {letzter.vorschlag.start}–{letzter.vorschlag.ende}{letzter.vorschlag.pause !== undefined ? ` · Pause ${letzter.vorschlag.pause} min` : ""} — {letzter.grund}</div>)}
            {letzter && letzter.status === "abgelehnt" && letzter.entschieden && (
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>Abgelehnt: {letzter.entschieden.begruendung}</div>)}
            {offen === datum && (
              <ZeitFormular start={e.start || ""} ende={e.ende || ""} pause={ist && ist.pause !== undefined ? ist.pause : ""} knopf="Antrag stellen"
                onAbbrechen={() => setOffen(null)}
                onSenden={async (v) => { if (await akt.korrekturBeantragen(datum, v.start, v.ende, v.pause, v.grund)) setOffen(null); }} />)}
          </div>);
      })}
    </Card>);
}

export function StempelBefunde({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const name = (pid) => { const x = m.personen.find((q) => String(q.id) === String(pid)); return x ? `${x.vorname} ${x.nachname}` : pid; };
  /* Lange Dienste zur Prüfung (WP-17, W1): Die Stempeluhr bestätigt eine
     Dauer über geplanter Dauer + 2 h nicht selbst. Bis die Leitung oder
     Planung hier bestätigt, zählt im Konto die Planzeit — sichtbar, nicht
     still. Bestätigen steht im Betriebsprotokoll. */
  const pruef = erfassungenZurPruefung(m, ym);
  /* Bestätigen nur Leitung und Planung (staff.edit) — nicht die
     Schichtverantwortung und nie die eigene Zeit (WP-17, Nachprüfung 3). */
  const darfBestaetigen = darf(sitz, "staff.edit");
  const eigene = sitz.person ? String(sitz.person.id) : null;
  const zeilen = Object.entries(m.einstempeln || {})
    .map(([k, e]) => { const [pid, datum] = k.split("|"); return { pid, datum, e }; })
    .filter((z) => z.datum && z.datum.startsWith(ym) && z.e)
    .sort((a, b) => (b.datum.localeCompare(a.datum)) || String(name(a.pid)).localeCompare(String(name(b.pid))));
  const Befund = ({ e, phase }) => {
    const g = geoAnzeige(e, phase);
    if (!g) return <span style={{ color: C.dimmer }}>–</span>;
    const titel = [g.text, g.grundText, g.warnung ? "Genauigkeit schlechter als 100 m" : ""].filter(Boolean).join(" — ");
    return (<span title={titel} style={{ ...NUM }}>
      <b style={{ color: g.ton === "ok" ? C.ok : g.ton === "warn" ? C.warn : C.dim }}>{GEO_SYMBOL_ICON[g.symbol]
        ? <Icon n={GEO_SYMBOL_ICON[g.symbol]} size={14} style={{ verticalAlign: "-2px" }} /> : g.symbol}</b>
      {g.entfernung ? ` ${g.entfernung}` : ""}
      {g.genauigkeit !== null ? <span style={{ color: g.warnung ? C.warn : C.dimmer }}>{` ±${g.genauigkeit} m`}</span> : null}
    </span>);
  };
  return (
    <Card>
      <CardHead right={<Lab><Icon n="haken" size={13} style={{ verticalAlign: "-2px" }} /> bestätigt · ! abweichend · ? nicht bewertbar · ○ Prüfung aus</Lab>}>Stempelbefunde</CardHead>
      <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5, color: C.dim, lineHeight: 1.45 }}>
        {GEO_SPOOFING_TEXT}</div>
      {pruef.length > 0 && (
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
            {pruef.length === 1 ? "1 Ist-Zeit zur Prüfung" : `${pruef.length} Ist-Zeiten zur Prüfung`}</div>
          <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10, lineHeight: 1.45 }}>
            Länger als geplant + 2 Stunden gestempelt: bis zur Bestätigung zählt im Stundenkonto die Planzeit. Ohne geplanten
            Dienst gestempelt (ungeplant): bis zur Bestätigung zählt der Dienst nicht — danach mit der gestempelten Dauer.
            Offline gestempelt und spät eingegangen oder mit abweichender Geräteuhr: bis zur Bestätigung zählt die Planzeit.
            Der Export (Zuschläge) und die Lohnausgabe fragen vor dem Download noch einmal nach.</div>
          {pruef.map(({ personId, datum, erfassung }) => (
            <div key={`${personId}|${datum}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: "5px 0", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 180, ...NUM }}>{name(personId)} · {fKurz(datum)} · {erfassung.start || "–"}–{erfassung.ende || "–"}</span>
              <Pill size="sm" tone="warn">{String(erfassung.grund || "").startsWith("DAUER_NULL") ? MARKIERUNG_TEXT.DAUER_NULL
                : String(erfassung.grund || "").startsWith("ZEITUMSTELLUNG") ? MARKIERUNG_TEXT.ZEITUMSTELLUNG
                : String(erfassung.grund || "").startsWith("PAUSE_ZU_LANG") ? MARKIERUNG_TEXT.PAUSE_ZU_LANG
                : String(erfassung.grund || "").startsWith("OFFLINE_PRUEFEN") ? MARKIERUNG_TEXT.OFFLINE_PRUEFEN
                : istUngeplant(erfassung) ? MARKIERUNG_TEXT.UNGEPLANT_PRUEFUNG : MARKIERUNG_TEXT.LANGER_DIENST}</Pill>
              {istUngeplant(erfassung) && abwesenheitAm(m, personId, datum) && (
                <Pill size="sm" tone="danger">Abwesenheit an diesem Tag — {UNGEPLANT_ABWESEND_TEXT}, auch nach der Bestätigung</Pill>)}
              {/* Dauer 0 (Nachprüfung B1): nicht „wie gestempelt" bestätigen — 06:00–06:00 zählte als 24 Stunden;
                  die Zeiten trägt die Leitung über die Korrektur ein. */}
              {/* WP-14c (F5): die gemessene Dauer (zwischen den eindeutigen Zeitpunkten) neben den Uhrzeiten. */}
              {gemesseneDauerMin((m.einstempeln || {})[`${personId}|${datum}`]) !== null && (
                <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>gestempelt {dauerMinText(gemesseneDauerMin((m.einstempeln || {})[`${personId}|${datum}`]))}</span>)}
              {darfBestaetigen && akt && String(personId) !== eigene && (nurKorrekturGrund(erfassung.grund)
                ? <span style={{ fontSize: 12.5, color: C.dim }}>Zeiten über „Korrigieren“ eintragen</span>
                : <Btn size="sm" kind="ok" onClick={() => akt.langerDienstBestaetigen(personId, datum)}>Bestätigen</Btn>)}
            </div>))}
        </div>)}
      <Monatsabschluss sitz={sitz} ym={ym} akt={akt} />
      <MonatsKorrektur sitz={sitz} ym={ym} akt={akt} />
      {akt && darf(sitz, "staff.edit") && <SelbstauskunftFreigabe m={m} ichId={sitz.person && sitz.person.id}
        onErgebnis={akt.uebernehmeSelbstauskunft} melde={akt.melde} />}
      <KorrekturAntraege sitz={sitz} akt={akt} />
      <KorrekturOffene sitz={sitz} ym={ym} akt={akt} />
      {zeilen.length === 0 ? <div style={{ padding: 22, color: C.dim }}>In diesem Monat wurde nicht gestempelt.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left" }}>{["Person", "Tag", "Start", "Befund Start", "Ende", "Befund Ende", "Standort", "Kennzeichen"]
            .map((h) => <th key={h} style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}` }}><Lab>{h}</Lab></th>)}</tr></thead>
          <tbody>{zeilen.map(({ pid, datum, e }) => {
            const ref = (e.geoStart && e.geoStart.referenz) || (e.geoEnde && e.geoEnde.referenz);
            return (<tr key={`${pid}|${datum}`} className="row">
              <td style={{ padding: "8px 14px" }}>{name(pid)}</td>
              <td style={{ padding: "8px 14px", ...NUM }}>{fKurz(datum)}</td>
              <td style={{ padding: "8px 14px", ...NUM }}>{e.start || "–"}</td>
              <td style={{ padding: "8px 14px" }}><Befund e={e} phase="Start" /></td>
              <td style={{ padding: "8px 14px", ...NUM }}>{e.ende || "–"}</td>
              <td style={{ padding: "8px 14px" }}><Befund e={e} phase="Ende" /></td>
              <td style={{ padding: "8px 14px" }}>{ref && ref.name ? ref.name : "–"}</td>
              <td style={{ padding: "8px 14px" }}>{[...(e.markierungen || []), ...(endeFehlt(datum, e) ? ["ENDE_FEHLT"] : [])].map((x) => (
                <Pill key={x} size="sm" tone="warn">{MARKIERUNG_TEXT[x] || x}</Pill>))}
                {/* Korrekturereignisse (WP-06): das Original steht links, die
                    gültige Ist-Zeit nach der letzten Korrektur hier. */}
                {Array.isArray(e.korrekturen) && e.korrekturen.length > 0 && (() => {
                  const z = e.korrekturen[e.korrekturen.length - 1];
                  return (<span title={e.korrekturen.map((x) => `${x.wann ? new Date(x.wann).toLocaleString("de-DE") : ""} · ${(x.wer && x.wer.name) || "–"}: ${x.vorher ? `${x.vorher.start || "–"}–${x.vorher.ende || "–"}` : "ohne Ist-Zeit"} → ${x.nachher.start}–${x.nachher.ende} (${x.grund})${Array.isArray(x.hinweise) && x.hinweise.length ? ` · Hinweise: ${x.hinweise.map((h) => h.text).join(" ")}` : ""}`).join("\n")}><Pill size="sm" tone="accent">
                    {`korrigiert${e.korrekturen.length > 1 ? ` (${e.korrekturen.length}×)` : ""}: ${z.nachher.start}–${z.nachher.ende}`}</Pill></span>);
                })()}</td>
            </tr>);
          })}</tbody>
        </table>)}
    </Card>);
}

/* ============================== PERSONALIMPORT ========================== */
