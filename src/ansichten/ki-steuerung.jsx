/* ==========================================================================
   INTELLIGENCE: STEUERUNG UND TRANSPARENZ (WP-I16, Teil 1)

   Abschnitt in den Einstellungen. Sichtbar für Leitung, Planung und Betriebsrat
   (der Plan nennt nichts für Beschäftigte und Schichtverantwortung: sie bekommen
   keinen Abschnitt). Solange der Prozessschalter nicht „an“ ist — und er ist es
   nicht, die Verdrahtung ist Betreiberfreigabe —, steht dort nur „nicht verfügbar“:
   keine Funktionsliste, keine Behauptung, dass etwas laufe.

   Bedienen:  Leitung: Hauptschalter, Funktionen, Frage nach der Vertretung.
              Betriebsrat: ausschließlich die Pause (setzen/aufheben).
              Planung: nur lesen.
   Die Oberfläche richtet sich nur nach der Rolle; entschieden wird allein vom Server
   (server/lib/rechte.mjs, zusammenfuehren).

   Barrierefrei: Zustände stehen als Text, nicht nur als Farbe; Schalter sind echte
   Schalter mit Namen; Bedienziele mindestens 24 px; Details als <details>; Umbruch statt
   Querscrollen (Gerätematrix WP-21).
   ========================================================================== */
import { Card, CardHead, Pill, Btn, Schalter } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { fDatum } from "../lib/datum.js";
import { kiSteuerungLesen } from "../../server/lib/ki-steuerung.mjs";
import { transparenz, TRANSPARENZ_ROLLEN } from "../../server/lib/intelligence/transparenz.mjs";

/** Nur Anzeige: Der Server entscheidet. Bleibt aus, bis der Betreiber den Prozessschalter verdrahtet und freigibt. */
export const KI_STEUERUNG_PROZESS = "aus";

export const KI_STEUERUNG_TEXTE = Object.freeze({
  titel: "Intelligence: Steuerung und Transparenz",
  nichtVerfuegbar: "nicht verfügbar",
  nichtVerfuegbarText: "Dieser Bereich ist für diesen Betrieb derzeit nicht verfügbar.",
  haupt: "Intelligence für diesen Betrieb",
  an: "an", aus: "aus",
  frage: "Gibt es einen Betriebsrat, Personalrat oder eine Mitarbeitervertretung?",
  frageHinweis: "Bei „ja“ bleibt alles pausiert, bis der Betriebsrat die Pause aufhebt. Ohne Antwort lässt sich nichts einschalten.",
  ja: "Ja", nein: "Nein", unbeantwortet: "noch nicht beantwortet",
  pause: "Pause durch den Betriebsrat",
  pauseAktiv: "pausiert",
  pauseAus: "keine Pause",
  pauseSetzen: "Pause setzen",
  pauseAufheben: "Pause aufheben",
  pauseHinweisBetriebsrat: "Der Betriebsrat kann alle Intelligence-Funktionen dieses Betriebs sofort pausieren und wieder freigeben. Die Leitung kann die Pause nicht aufheben.",
  pauseHinweisAndere: "Die Pause setzt und hebt nur der Betriebsrat auf.",
  funktionen: "Funktionen",
  daten: "Daten, die diese Funktion nutzen darf",
  keinePersonen: "ohne Personenbezug",
  personen: "mit Personenbezug (nur als Alias, ohne Namen)",
  gesperrt: "noch nicht freischaltbar",
  geaendert: "zuletzt geändert",
  nie: "noch nie geändert",
  nurLesen: "Nur lesen: Schalten kann die Leitung.",
});

const ROLLENNAME = Object.freeze({ leitung: "Leitung", betriebsrat: "Betriebsrat", planer: "Planung", system: "System" });
const wann = (am) => (typeof am === "string" && am.length >= 10 ? fDatum(am.slice(0, 10)) : null);
const wer = (s) => {
  const d = wann(s && s.am);
  if (!d) return KI_STEUERUNG_TEXTE.nie;
  const r = s.vonRolle && Object.hasOwn(ROLLENNAME, s.vonRolle) ? ` (${ROLLENNAME[s.vonRolle]})` : "";
  return `${KI_STEUERUNG_TEXTE.geaendert} ${d}${r}`;
};
const ZIEL = { minWidth: 24, minHeight: 24 };

/**
 * @param {{ sitz: any, akt: any, prozess?: string }} p
 * `akt.setzeKiSteuerung(absicht)` und `akt.setzeKiPause(aktiv)` kommen aus src/lib/ki-steuerung-aktionen.js.
 */
export function KiSteuerung({ sitz, akt, prozess = KI_STEUERUNG_PROZESS }) {
  const rolle = sitz && sitz.person && sitz.person.rolle ? sitz.person.rolle : sitz && sitz.rolle;
  if (!TRANSPARENZ_ROLLEN.includes(rolle)) return null;
  const T = KI_STEUERUNG_TEXTE;
  const m = sitz.mandant || {};
  const t = transparenz(kiSteuerungLesen(m.einstellungen), rolle, { prozess });
  if (!t || t.verfuegbar !== true) {
    return (
      <Card style={{ marginBottom: 20 }}>
        <CardHead right={<Pill tone="warn">{T.nichtVerfuegbar}</Pill>}>{T.titel}</CardHead>
        <div role="status" style={{ padding: 22, fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760 }}>{T.nichtVerfuegbarText}</div>
      </Card>);
  }
  const leitung = rolle === "leitung";
  const br = rolle === "betriebsrat";
  const frage = t.betriebsratFrage ? t.betriebsratFrage.antwort : null;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardHead right={<Pill tone={t.betrieb.an && !t.pause.aktiv ? "ok" : "warn"}>
        {t.pause.aktiv ? T.pauseAktiv : t.betrieb.an ? T.an : T.aus}</Pill>}>{T.titel}</CardHead>
      <div style={{ padding: 22, fontSize: 13.5, color: C.dim, lineHeight: 1.55, maxWidth: 760, overflowWrap: "anywhere" }}>
        <section aria-label={T.haupt} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ color: C.text }}>{T.haupt}: {t.betrieb.an ? T.an : T.aus}</strong>
            {leitung && <Schalter an={t.betrieb.an} label={T.haupt} onChange={(v) => akt.setzeKiSteuerung({ betrieb: { an: v } })} />}
          </div>
          <div style={NUM}>{wer(t.betrieb)}</div>
          {!leitung && <div>{T.nurLesen}</div>}
        </section>

        <section aria-label={T.frage} style={{ marginBottom: 18 }}>
          <div><strong style={{ color: C.text }}>{T.frage}</strong></div>
          <div>{T.frageHinweis}</div>
          <div role="status" style={{ marginTop: 6 }}>{frage === "ja" ? T.ja : frage === "nein" ? T.nein : T.unbeantwortet}
            {t.betriebsratFrage ? <span style={NUM}>{" · "}{wer(t.betriebsratFrage)}</span> : null}</div>
          {leitung && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn style={ZIEL} kind={frage === "ja" ? "primary" : undefined} aria-pressed={frage === "ja"}
                onClick={() => akt.setzeKiSteuerung({ betriebsratFrage: { antwort: "ja" } })}>{T.ja}</Btn>
              <Btn style={ZIEL} kind={frage === "nein" ? "primary" : undefined} aria-pressed={frage === "nein"}
                onClick={() => akt.setzeKiSteuerung({ betriebsratFrage: { antwort: "nein" } })}>{T.nein}</Btn>
            </div>)}
        </section>

        <section aria-label={T.pause} style={{ marginBottom: 18 }}>
          <div><strong style={{ color: C.text }}>{T.pause}: {t.pause.aktiv ? T.pauseAktiv : T.pauseAus}</strong></div>
          <div style={NUM}>{wer(t.pause)}</div>
          <div>{br ? T.pauseHinweisBetriebsrat : T.pauseHinweisAndere}</div>
          {br && (
            <div style={{ marginTop: 8 }}>
              <Btn style={ZIEL} kind={t.pause.aktiv ? "primary" : undefined} onClick={() => akt.setzeKiPause(!t.pause.aktiv)}>
                {t.pause.aktiv ? T.pauseAufheben : T.pauseSetzen}</Btn>
            </div>)}
        </section>

        <section aria-label={T.funktionen}>
          <div style={{ marginBottom: 8 }}><strong style={{ color: C.text }}>{T.funktionen}</strong></div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {t.funktionen.map((f) => (
              <li key={f.id} style={{ borderTop: `1px solid ${C.lineSoft}`, padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ color: C.text }}>{f.id} {f.name}: {f.an ? T.an : T.aus}</strong>
                  {leitung && !f.gesperrt && <Schalter an={f.an} label={`${f.id} ${f.name}`}
                    onChange={(v) => akt.setzeKiSteuerung({ funktionen: { [f.id]: { an: v } } })} />}
                  {f.gesperrt && <Pill tone="warn">{T.gesperrt}</Pill>}
                </div>
                <div>{f.zweck}</div>
                <div style={NUM}>{wer(f)}</div>
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: "pointer", minHeight: 24 }}>{T.daten} ({f.personenbezug ? T.personen : T.keinePersonen})</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {f.datenkategorien.length === 0 ? <li>{T.keinePersonen}</li>
                      : f.datenkategorien.map((k) => <li key={k.kategorie}>{k.text}</li>)}
                  </ul>
                </details>
              </li>))}
          </ul>
        </section>
      </div>
    </Card>);
}
