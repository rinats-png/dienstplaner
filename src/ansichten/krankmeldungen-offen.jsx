/* RB-2 (Betreiberentscheidung 2026-11-11): Krankmeldungen in Bearbeitung.

   Zeigt die Fälle aus `m.krankmeldungen`, die der Server dieser Person ausliefert (sicht.mjs: eigene;
   die Schichtverantwortung zusätzlich ihren Bereich ohne Anmerkung; Planung und Leitung alle), mit dem
   Status „Eingegangen“ / „Vorläufig bestätigt“. Angeboten wird nur der Schritt, den der Server dieser
   Rolle erlaubt (krankSchrittErlaubt, dieselbe Funktion wie auf dem Server): vorläufig die
   Schichtverantwortung, endgültig Planung und Leitung; nie die eigene Meldung. Die Oberfläche spiegelt
   nur — entscheiden tut der Server (POST /api/krankmeldung). */
import { useState, useMemo } from "react";
import { Card, CardHead, Btn, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { fKurz } from "../lib/datum.js";
import { KRANK_STATUS, krankSchrittErlaubt, fallOffen, meldendePerson, svZustaendig } from "../../server/lib/krankmeldung.mjs";
import { KLAERUNG_ROLLEN, ERSATZ_ROLLEN, KLAERUNG_HINWEIS, VORSCHLAG_HINWEIS, ersatzVorbereiten } from "../../server/lib/klaerung.mjs";

/* RB-5 (Betreiberentscheidung 2026-11-11): Der veröffentlichte Plan bleibt bis zur endgültigen Bestätigung
   unverändert. Intern markiert der Server die betroffenen Dienste („Besetzung klärungsbedürftig“, `m.klaerung`,
   abgeleitet beim Lesen, server/lib/klaerung.mjs) — nur für Planung, Leitung und die zuständige
   Schichtverantwortung. Planung und Leitung können mögliche Unterbesetzung und Ersatz vorbereiten lassen:
   gerechnet auf einer gedachten Kopie, angezeigt als Vorschlag, nie gespeichert. Einteilen bleibt eine Handlung
   in der Tagesansicht. */

/** Die Markierungen, die diese Person sehen darf (doppelte Sicherung zur Serverregel). */
export function klaerungFuer(sitz) {
  const ich = sitz && sitz.person;
  const m = sitz && sitz.mandant;
  if (!ich || !m || sitz.rolle === "betreiber" || !KLAERUNG_ROLLEN.includes(ich.rolle) || !Array.isArray(m.klaerung)) return [];
  return m.klaerung.filter((k) => k && typeof k === "object");
}
/** Ist der Dienst dieser Person an diesem Tag klärungsbedürftig (für diese Person sichtbar)? */
export const klaerungAm = (sitz, personId, datum, dienstId) => klaerungFuer(sitz)
  .some((k) => String(k.personId) === String(personId) && k.datum === datum && (dienstId === undefined || k.dienstId === dienstId));
/** Darf diese Person Ersatz vorbereiten lassen? Wer einteilen und endgültig bestätigen darf. */
export const ersatzVorbereitbar = (sitz) => !!(sitz && sitz.person && sitz.rolle !== "betreiber" && ERSATZ_ROLLEN.includes(sitz.person.rolle));

/** Vorbereiteter Ersatz zu einem Fall: rechnet erst beim Öffnen, schreibt nichts. */
export function ErsatzVorbereitet({ m, fallId, name, dienstName, oeffneTag }) {
  const vorschlaege = useMemo(() => ersatzVorbereiten(m, { fallId }), [m, fallId]);
  if (!vorschlaege.length) return <div style={{ fontSize: 12.5, color: C.dim }}>Keine Dienste zu prüfen.</div>;
  return (
    <div role="region" aria-label="Vorbereiteter Ersatz" style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.warn }}>{VORSCHLAG_HINWEIS}</div>
      {vorschlaege.map((v) => {
        const b = v.besetzung;
        return (
          <div key={`${v.datum}|${v.dienstId}`} style={{ fontSize: 12.5, lineHeight: 1.5, padding: "6px 0", borderTop: `1px dashed ${C.lineSoft}` }}>
            <div style={{ fontWeight: 600 }}>{fKurz(v.datum)} · {dienstName(v.dienstId)}</div>
            <div style={{ color: C.dim }}>
              Ohne Änderung: {b.ohne}/{b.soll}{b.fehlt > 0 ? ` · ${b.fehlt} fehlt` : " · besetzt"}{b.qualFehlt.length ? " · Qualifikation fehlt" : ""}</div>
            <div>{v.direkt.length ? `Infrage: ${v.direkt.slice(0, 3).map((k) => name(k.personId)).join(", ")}` : "Niemand ohne Hindernis."}
              {v.nahe.length ? ` · Knapp (Ruhezeit): ${v.nahe.slice(0, 2).map((k) => name(k.personId)).join(", ")}` : ""}</div>
            {oeffneTag && <Btn size="sm" kind="quiet" onClick={() => oeffneTag(v.datum)}
              aria-label={`Tag ${fKurz(v.datum)} in der Planung öffnen`}>Tag öffnen</Btn>}
          </div>);
      })}
    </div>);
}

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

export function KrankmeldungenOffen({ sitz, akt, oeffneTag }) {
  const m = sitz.mandant;
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(null);
  const [ersatzFall, setErsatzFall] = useState(null);
  const klaerung = klaerungFuer(sitz);
  const ersatzErlaubt = ersatzVorbereitbar(sitz);
  const dienstName = (id) => { const d = (m.dienstarten || []).find((x) => x.id === id); return d ? (d.kurz || d.name || id) : id; };
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
              {klaerung.some((k) => k.fallId === String(f.id)) && (
                <div style={{ flexBasis: "100%", fontSize: 12.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <Pill tone="warn">{KLAERUNG_HINWEIS}</Pill>
                  <span style={{ color: C.dim }}>{klaerung.filter((k) => k.fallId === String(f.id)).slice(0, 7)
                    .map((k) => `${fKurz(k.datum)} ${dienstName(k.dienstId)}`).join(" · ")}</span>
                  {ersatzErlaubt && (
                    <Btn size="sm" onClick={() => setErsatzFall(ersatzFall === f.id ? null : f.id)} aria-expanded={ersatzFall === f.id}
                      aria-label={`Ersatz für ${name(f.personId)} vorbereiten`}>{ersatzFall === f.id ? "Vorschlag ausblenden" : "Ersatz vorbereiten"}</Btn>)}
                </div>)}
              {ersatzErlaubt && ersatzFall === f.id && (
                <div style={{ flexBasis: "100%" }}>
                  <ErsatzVorbereitet m={m} fallId={String(f.id)} name={name} dienstName={dienstName} oeffneTag={oeffneTag} /></div>)}
              {fehler && fehler.id === f.id && (
                <div role="alert" style={{ flexBasis: "100%", fontSize: 12.5, color: C.danger }}>{fehler.text}</div>)}
            </li>);
        })}
      </ul>
    </Card>);
}
