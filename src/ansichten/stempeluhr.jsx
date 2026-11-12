/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { personTag } from "../lib/fachlogik.js";
import { Icon } from "../gestalt/icons.jsx";
import { GEO_DATENSCHUTZ_TEXT } from "../../server/lib/geo.mjs";
import { C } from "../farben.js";
import { Inp, Btn, Pill } from "../ui/bausteine.jsx";
import { stempelVorgang, geoPruefungAn, positionHolen, koordMitGrund, MARKIERUNG_TEXT } from "../stempelvorgang.js";
import { heute } from "../lib/datum.js";
import { useState } from "react";
import { NUM } from "../ui/thema.js";

/* ==========================================================================
   TAGESSTART — der Einstieg für jede Rolle
   Nicht was alles existiert, sondern was heute ansteht.
   ========================================================================== */
export const AUFGABE_SYMBOL = { stempel: "uhr", zeiten: "uhr", nachweis: "warnung", nachweise: "warnung", post: "brief",
  einsatz: "warnung", antrag: "haken", boerse: "tausch", besetzung: "warnung", pruefung: "warnung",
  freigabe: "kreis-haken", konto: "saeulen" };
export const AufgabeSymbol = ({ art }) => AUFGABE_SYMBOL[art]
  ? <Icon n={AUFGABE_SYMBOL[art]} size={18} /> : <span aria-hidden="true">·</span>;

/* ------------------------------- Stempeluhr ------------------------------ */
/* Was bei eingeschalteter Geo-Prüfung gespeichert wird — und was nicht. */
export const GEO_HINWEIS = GEO_DATENSCHUTZ_TEXT;

/** Pause beim Ausstempeln (WP-16): vorbelegt mit der Pause der geplanten Dienstart, sonst leer. */
export function pauseVorgabe(m, p, datum) {
  const t = datum ? personTag(m, p, datum) : null;
  const da = t && t.dienstId ? (m.dienstarten || []).find((x) => x.id === t.dienstId) : null;
  return da && Number.isFinite(Number(da.pause)) && Number(da.pause) > 0 ? String(da.pause) : "";
}
/**
 * Welche Pause geht mit dem Stempel hinaus? Nur beim Ausstempeln eines
 * gestempelten Beginns — dort steht das Pausenfeld sichtbar daneben. Beim
 * „Dienstende stempeln“ ohne Beginn (nachtEnde, st null) gibt es kein Feld;
 * die vorbelegte Pause der Dienstart ginge sonst ungesehen als „genommene
 * Pause“ in das unveränderliche Original (WP-06). Dann: keine Angabe.
 */
export const pauseZumStempel = (art, st, pause) => (art === "ende" && st ? pause : null);
/** Eingabe der genommenen Pause neben „Ausstempeln“ (WP-16). Der Server prüft; eine ungültige Angabe kostet nie den Stempel. */
export function PauseFeld({ wert, setWert, gross }) {
  return (
    <label style={{ fontSize: gross ? 13.5 : 12, color: C.dim, display: "inline-flex", alignItems: "center", gap: 6 }}>
      Pause (min)
      <Inp type="number" min="0" max="180" inputMode="numeric" value={wert} onChange={(e) => setWert(e.target.value)}
        aria-label="Pause in Minuten" style={{ width: gross ? 84 : 70 }} />
    </label>);
}

export function Stempeluhr({ sitz, akt, vorgang }) {
  const m = sitz.mandant, p = sitz.person;
  const { datum, st, vortag, veraltet, nachtEnde } = vorgang || stempelVorgang(m, p, heute());
  const geoAn = geoPruefungAn(m);
  const [laeuft, setLaeuft] = useState(false);
  const [pause, setPause] = useState(() => pauseVorgabe(m, p, datum));

  /* Position nur bei eingeschalteter Geo-Prüfung; die Stempelzeit hängt nie davon ab. */
  const stempeln = (art, tag = datum) => {
    setLaeuft(true);
    /* Gesperrt bis zum Ende — auch der Wiederholungen nach 429 (WP-47,
       Review-Auflage N1); sonst tippt man währenddessen ein zweites Mal. */
    const pz = pauseZumStempel(art, st, pause);
    positionHolen(geoAn, (koord, grund) => { const ort = koordMitGrund(koord, grund); Promise.resolve(akt.stempeln(p.id, tag, art, ort, pz)).finally(() => setLaeuft(false)); });
  };
  const wartet = geoAn ? "Standort wird geprüft …" : "Wird gespeichert …";

  /* Nachtdienst von gestern ohne Einstempeln (F1): Dienstende anbieten. */
  if (!st && nachtEnde) return (
    <div style={{ textAlign: "right", maxWidth: 300 }}>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 8, lineHeight: 1.4 }}>
        Nachtdienst von gestern ohne Einstempeln? Das Dienstende lässt sich noch erfassen; den Beginn ergänzt die Leitung.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Btn kind="ok" disabled={laeuft} onClick={() => stempeln("ende")}>{laeuft ? wartet : "Dienstende stempeln"}</Btn>
        <Btn kind="quiet" disabled={laeuft} onClick={() => stempeln("start", heute())}>Einstempeln</Btn>
      </div>
    </div>);
  if (!st) return (
    <div style={{ textAlign: "right" }}>
      <Btn kind="primary" disabled={laeuft} onClick={() => stempeln("start")}>
        {laeuft ? wartet : "Einstempeln"}</Btn>
      {geoAn && <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 7, maxWidth: 230, lineHeight: 1.4 }}>
        {GEO_HINWEIS}</div>}
    </div>);
  /* Wie MStempel: ein veralteter Beginn ist kein normaler Abschluss. */
  if (!st.ende && veraltet) return (
    <div style={{ textAlign: "right", maxWidth: 280 }}>
      <div style={{ fontSize: 13, color: C.warn, marginBottom: 8, lineHeight: 1.4, ...NUM }}>
        {MARKIERUNG_TEXT.START_VERALTET} (Beginn {st.start}). Die Arbeitszeit ergänzt die Leitung.</div>
      <Btn kind="quiet" disabled={laeuft} onClick={() => stempeln("ende")}>
        {laeuft ? wartet : "Ende trotzdem erfassen"}</Btn>
    </div>);
  if (!st.ende) return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 8, ...NUM }}>
        Eingestempelt {vortag ? "gestern " : ""}{st.start}{st.ortStart ? ` · ${st.ortStart}` : ""}{st.vorlaeufig ? " · vorläufig (offline gespeichert)" : ""}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        <PauseFeld wert={pause} setWert={setPause} />
        <Btn kind="ok" disabled={laeuft} onClick={() => stempeln("ende")}>
          {laeuft ? wartet : "Ausstempeln"}</Btn>
      </div>
    </div>);
  return (
    <div style={{ textAlign: "right" }}>
      {st.vorlaeufig ? <Pill tone="warn">vorläufig (offline gespeichert)</Pill> : <Pill tone="ok">Dienst erfasst</Pill>}
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7, ...NUM }}>
        {st.start || "–"} – {st.ende}{st.ortStart ? ` · ${st.ortStart}` : ""}</div>
    </div>);
}

/* ============================= BETRIEBSMITTEL ========================== */
