/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { darf } from "../lib/berechtigung.js";
import { istUngeplant } from "../istdaten.js";
import { personTag } from "../lib/fachlogik.js";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fKurz } from "../lib/datum.js";
import { Pill, Btn } from "../ui/bausteine.jsx";
import { MARKIERUNG_TEXT } from "../stempelvorgang.js";
import { ZeitFormular } from "./korrekturen.jsx";

/**
 * Für die Leitung (WP-14, B3 und C5): Stempel, die sich nur mit einer Korrektur auflösen lassen
 * — Beginn oder Ende fehlt, veralteter Beginn, Konflikt — und Altbestand: ungeplante Dienste, die
 * früher ohne Prüfung als bestätigt galten (sie zählen nicht, bis die Leitung sie prüft).
 */
export function KorrekturOffene({ sitz, ym, akt }) {
  const m = sitz.mandant;
  const [offen, setOffen] = useState(null);
  const darfKorrigieren = darf(sitz, "staff.edit");
  const name = (pid) => { const x = m.personen.find((q) => String(q.id) === String(pid)); return x ? `${x.vorname} ${x.nachname}` : pid; };
  const fehlend = [], altbestand = [];
  for (const [k, e] of Object.entries(m.einstempeln || {})) {
    const [pid, datum] = k.split("|");
    if (!datum || !datum.startsWith(ym) || !e) continue;
    const ist = (m.erfassung || {})[k];
    const marken = e.markierungen || [];
    const offenerFall = !e.start || !e.ende || marken.includes("KONFLIKT") || marken.includes("START_VERALTET") || marken.includes("START_FEHLT");
    if (offenerFall && !(ist && ist.bestaetigt === true && ist.korrigiert === true)) fehlend.push({ pid, datum, e, ist });
    const person = m.personen.find((q) => String(q.id) === String(pid));
    /* WP-14b (M3): auch eine früher korrigierte Ist-Zeit ohne Marke — sie zählte nie (DAUER_NULL-Tag ohne Plan). */
    if (marken.includes("UNGEPLANTER_DIENST") && ist && ist.bestaetigt === true && !istUngeplant(ist)
        && person && !personTag(m, person, datum).dienstId) altbestand.push({ pid, datum, e, ist });
  }
  fehlend.sort((a, b) => b.datum.localeCompare(a.datum));
  altbestand.sort((a, b) => b.datum.localeCompare(a.datum));
  if (!fehlend.length && !altbestand.length) return null;
  const zeile = ({ pid, datum, e, ist }, art) => {
    const kennung = `${art}|${pid}|${datum}`;
    return (
      <div key={kennung} style={{ padding: "6px 0", borderTop: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ minWidth: 200, ...NUM }}>{name(pid)} · {fKurz(datum)}</span>
          <span style={{ ...NUM }}>Stempel {e.start || "–"}–{e.ende || "–"}</span>
          {ist && ist.bestaetigt && <span style={{ color: C.dim, ...NUM }}>gilt {ist.start}–{ist.ende}</span>}
          {(e.markierungen || []).map((x) => <Pill key={x} size="sm" tone="warn">{MARKIERUNG_TEXT[x] || x}</Pill>)}
          {art === "altbestand" && <Pill size="sm" tone="warn">früher ohne Prüfung bestätigt — zählt nicht</Pill>}
          {darfKorrigieren && akt && offen !== kennung &&
            <Btn size="sm" onClick={() => setOffen(kennung)}>{art === "altbestand" ? "Prüfen und bestätigen" : "Korrigieren"}</Btn>}
        </div>
        {offen === kennung && (
          <ZeitFormular start={(ist && ist.start) || e.start || ""} ende={(ist && ist.ende) || e.ende || ""} pause={ist && ist.pause !== undefined ? ist.pause : ""}
            knopf={art === "altbestand" ? "Als geprüft bestätigen" : "Korrektur speichern"} onAbbrechen={() => setOffen(null)}
            onSenden={async (v) => { if (await akt.stempelKorrigieren(pid, datum, v.start, v.ende, v.grund, v.pause)) setOffen(null); }} />)}
      </div>);
  };
  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
      {fehlend.length > 0 && (<>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
          {fehlend.length === 1 ? "1 Stempel braucht eine Korrektur" : `${fehlend.length} Stempel brauchen eine Korrektur`}</div>
        <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 6, lineHeight: 1.45 }}>
          Beginn oder Ende fehlt, der Beginn ist veraltet oder es gab einen Konflikt. Die Korrektur steht als Ereignis am Stempel
          (vorher, nachher, wer, wann, Grund); der Stempel bleibt unverändert.</div>
        {fehlend.map((z) => zeile(z, "offen"))}</>)}
      {altbestand.length > 0 && (<>
        <div style={{ fontSize: 13.5, fontWeight: 600, margin: "12px 0 6px" }}>
          {altbestand.length === 1 ? "1 ungeplanter Dienst ohne Prüfung (Altbestand)" : `${altbestand.length} ungeplante Dienste ohne Prüfung (Altbestand)`}</div>
        <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 6, lineHeight: 1.45 }}>
          Diese Tage wurden früher ohne Prüfung als bestätigt angelegt und zählen nicht im Stundenkonto. Mit der Prüfung — Pause und
          Grund — zählt der Dienst mit der gestempelten Dauer.</div>
        {altbestand.map((z) => zeile(z, "altbestand"))}</>)}
    </div>);
}
