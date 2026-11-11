/* RB-2 (Betreiberentscheidung 2026-11-11): Krankmeldungen in Bearbeitung.

   Zeigt die Fälle aus `m.krankmeldungen`, die der Server dieser Person ausliefert (sicht.mjs: eigene;
   die Schichtverantwortung zusätzlich ihren Bereich ohne Anmerkung; Planung und Leitung alle), mit dem
   Status „Eingegangen“ / „Vorläufig bestätigt“. Angeboten wird nur der Schritt, den der Server dieser
   Rolle erlaubt (krankSchrittErlaubt, dieselbe Funktion wie auf dem Server): vorläufig die
   Schichtverantwortung, endgültig Planung und Leitung; nie die eigene Meldung. Die Oberfläche spiegelt
   nur — entscheiden tut der Server (POST /api/krankmeldung). */
import { useState } from "react";
import { Card, CardHead, Btn, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { fKurz } from "../lib/datum.js";
import { KRANK_STATUS, krankSchrittErlaubt, fallOffen, meldendePerson, svZustaendig } from "../../server/lib/krankmeldung.mjs";

export const KRANK_STATUS_TEXT = Object.freeze({
  [KRANK_STATUS.EINGEGANGEN]: "Eingegangen",
  [KRANK_STATUS.VORLAEUFIG]: "Vorläufig bestätigt",
  [KRANK_STATUS.ENDGUELTIG]: "Endgültig bestätigt",
  [KRANK_STATUS.ABGELEHNT]: "Abgelehnt",
  [KRANK_STATUS.ZURUECKGEZOGEN]: "Zurückgezogen",
});

/** Welche Schritte bietet die Oberfläche dieser Person für diesen Fall an? Dieselben Regeln wie der Server
    (krankmeldungSchritt) — die Anzeige spiegelt nur, entscheiden tut der Server. Am eigenen Fall nur
    „zurückziehen“, und das nur, wer ihn gemeldet hat. Die Schichtverantwortung bekommt „vorläufig“ nur,
    wenn die Bereichsregel des Servers (erster und letzter Tag, svZustaendig) erfüllt ist (Review RB-2, L3). */
export function krankSchritteFuer(sitz, fall) {
  const ich = sitz && sitz.person;
  if (!ich || !fall || sitz.rolle === "betreiber" || !fallOffen(fall)) return [];
  const aus = [];
  const eigenerFall = String(fall.personId) === String(ich.id);
  const vonMir = fall.gemeldetVonMir === true || String(meldendePerson(fall)) === String(ich.id);
  if (!eigenerFall) {
    if (fall.status === KRANK_STATUS.EINGEGANGEN && krankSchrittErlaubt(ich.rolle, "vorlaeufig")
      && svZustaendig(sitz.mandant, ich, fall.personId, fall.von, fall.bis)) aus.push("vorlaeufig");
    if (krankSchrittErlaubt(ich.rolle, "endgueltig")) aus.push("endgueltig");
    if (krankSchrittErlaubt(ich.rolle, "ablehnen")) aus.push("ablehnen");
  }
  if (vonMir && krankSchrittErlaubt(ich.rolle, "zurueckziehen")) aus.push("zurueckziehen");
  return aus;
}

export function KrankmeldungenOffen({ sitz, akt }) {
  const m = sitz.mandant;
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(null);
  const faelle = (Array.isArray(m.krankmeldungen) ? m.krankmeldungen : [])
    .filter((f) => fallOffen(f));
  if (!faelle.length) return null;
  const name = (pid) => {
    const p = (m.personen || []).find((x) => String(x.id) === String(pid));
    return p ? `${p.vorname} ${p.nachname}` : "Person";
  };
  const schritt = async (fall, s) => {
    setFehler(null); setLaeuft(`${fall.id}|${s}`);
    const ok = await akt.krankBestaetigen(fall.id, s);
    setLaeuft(null);
    if (!ok) setFehler({ id: fall.id, text: "Der Schritt wurde nicht gespeichert. Die Meldung oben nennt den Grund." });
  };
  return (
    <Card style={{ marginBottom: 18 }} aria-labelledby="km-offen-kopf">
      <CardHead><span id="km-offen-kopf">Krankmeldungen in Bearbeitung</span></CardHead>
      <div style={{ padding: "4px 20px 6px", fontSize: 13, color: C.dim, lineHeight: 1.5 }}>
        Vorläufig bestätigt heißt: noch nicht wirksam. Erst die endgültige Bestätigung durch Planung oder Leitung
        trägt die Abwesenheit in den Plan ein.
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: "0 20px 14px" }}>
        {faelle.map((f) => {
          const angebot = krankSchritteFuer(sitz, f);
          return (
            <li key={f.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 0",
              borderTop: `1px solid ${C.lineSoft}` }}>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{name(f.personId)}</div>
                <div style={{ fontSize: 12.5, color: C.dim }}>{fKurz(f.von)}{f.bis && f.bis !== f.von ? ` bis ${fKurz(f.bis)}` : ""}</div>
              </div>
              <Pill tone={f.status === KRANK_STATUS.VORLAEUFIG ? "warn" : "neutral"}>{KRANK_STATUS_TEXT[f.status] || "Eingegangen"}</Pill>
              {angebot.includes("vorlaeufig") && (
                <Btn onClick={() => schritt(f, "vorlaeufig")} disabled={!!laeuft}
                  aria-label={`Krankmeldung von ${name(f.personId)} vorläufig bestätigen`}>Vorläufig bestätigen</Btn>)}
              {angebot.includes("endgueltig") && (
                <Btn kind="primary" onClick={() => schritt(f, "endgueltig")} disabled={!!laeuft}
                  aria-label={`Krankmeldung von ${name(f.personId)} endgültig bestätigen`}>Endgültig bestätigen</Btn>)}
              {angebot.includes("ablehnen") && (
                <Btn onClick={() => schritt(f, "ablehnen")} disabled={!!laeuft}
                  aria-label={`Krankmeldung von ${name(f.personId)} ablehnen`}>Ablehnen</Btn>)}
              {angebot.includes("zurueckziehen") && (
                <Btn kind="quiet" onClick={() => schritt(f, "zurueckziehen")} disabled={!!laeuft}
                  aria-label={`Krankmeldung von ${name(f.personId)} zurückziehen`}>Zurückziehen</Btn>)}
              {fehler && fehler.id === f.id && (
                <div role="alert" style={{ flexBasis: "100%", fontSize: 12.5, color: C.danger }}>{fehler.text}</div>)}
            </li>);
        })}
      </ul>
    </Card>);
}
