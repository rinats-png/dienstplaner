/* ==========================================================================
   PLANER: SCHALTER UND BETRIEBSMODUS (WP-I7 Teil 6, Stufe 1 der Planer-Oberfläche)

   Abschnitt in den Einstellungen, nur für Leitung (schaltet) und Planung (liest). Gezeigt wird der WIRKSAME Zustand des Planers
   (planerModusWirksam, dieselbe Funktion wie der Server): Solange der Planer global nicht freigegeben ist, steht dort „AUS“ und
   „global nicht freigegeben“ — Schalter und Betriebsmodus des Betriebs sind dann nur vorgemerkt. Die Voraussetzungen (Pause,
   Hauptschalter, Frage nach der Vertretung, Schalter des Planers, Planungsreife des Monats) stehen einzeln da.
   Bedienen: Schalter „Planer für diesen Betrieb“ und Betriebsmodus AUS / Auf Knopfdruck / Automatisch. Die Rückmeldung „geändert“
   kommt erst, wenn der Server die Änderung bestätigt hat (src/lib/planer-aktionen.js); Fehler stehen als Warnung (role=alert) da.
   Rechte: planerRechte (src/lib/planer-oberflaeche.js, Tabellen des Servers); entschieden wird allein am Server.
   Barrierefrei: Zustände stehen als Text; Schalter und Knöpfe haben Namen; keine Farbe als einziger Träger.
   ========================================================================== */
import { useState, useMemo } from "react";
import { Card, CardHead, Pill, Btn, Schalter, Feldfehler } from "../ui/bausteine.jsx";
import { MON, heute } from "../lib/datum.js";
import { reifeFuerMonat } from "./planungsreife.jsx";
import { PLANER_TEXTE, MODUS_TEXT, planerRechte, planerZustand } from "../lib/planer-oberflaeche.js";
import { KI_PLANER_MODI } from "../../server/lib/ki-steuerung.mjs";
import * as SP from "../speicher.js";

/** Nur die Darstellung (Eigenschaften statt Zustand, damit sie ohne Browser prüfbar ist). */
export function PlanerSteuerungAnsicht({ z, steuern = false, demo = false, status = null, beschaeftigt = false, onSchalter = () => {}, onModus = () => {} }) {
  const T = PLANER_TEXTE;
  const wirksam = MODUS_TEXT[z.wirksam] || MODUS_TEXT.aus;
  return (
    <Card role="region" aria-label={T.titel} data-testid="planer-steuerung">
      <CardHead right={<Pill tone={z.wirksam === "aus" ? "warn" : "ok"}>{wirksam.name}</Pill>}>{T.titel}</CardHead>
      <section aria-label={T.wirksam}>
        <p role="status"><strong>{T.wirksam}: {wirksam.name}</strong></p>
        <p>{!z.freigegeben ? T.globalAus : z.wirksam === "aus" ? T.wirksamAusGrund : wirksam.hinweis}</p>
        {z.steuerungUnlesbar && <p role="alert">{T.steuerungUnlesbar}</p>}
      </section>

      <section aria-label={T.schalter}>
        <p><strong>{T.schalter}: {z.schalterAn ? T.schalterAn : T.schalterAus}</strong>
          {steuern && <>{" "}<Schalter an={z.schalterAn} label={T.schalter} onChange={(v) => onSchalter(v)} /></>}</p>
        {z.schalterUnlesbar && <p role="alert">{T.schalterUnlesbar}</p>}
      </section>

      <section aria-label={T.modus}>
        <p><strong>{T.modus}: {z.modusGespeichert ? MODUS_TEXT[z.modusGespeichert].name : T.modusNichtGewaehlt}</strong></p>
        {z.modusUnlesbar && <p role="alert">{T.modusUnlesbar}</p>}
        {steuern && (
          <ul>
            {KI_PLANER_MODI.map((id) => (
              <li key={id}>
                <Btn kind={z.modusGespeichert === id ? "primary" : undefined} aria-pressed={z.modusGespeichert === id} disabled={beschaeftigt}
                  onClick={() => onModus(id)}>{MODUS_TEXT[id].name}</Btn>{" "}{MODUS_TEXT[id].hinweis}
              </li>))}
          </ul>)}
      </section>

      <section aria-label={T.voraussetzungen}>
        <p><strong>{T.voraussetzungen}</strong></p>
        <p>{T.voraussetzungenHinweis}</p>
        <ul>
          {z.voraussetzungen.map((v) => <li key={v.id}>{v.text} — {v.ok ? T.ok : T.fehlt}</li>)}
        </ul>
      </section>

      {!steuern && <p>{demo ? T.demoLesen : T.nurLesen}</p>}
      {beschaeftigt && <p role="status">{T.speichern}</p>}
      {status && (status.ok ? <p role="status">{status.text}</p> : <Feldfehler text={status.text} />)}
    </Card>
  );
}

/**
 * @param {{ sitz: any, akt: any, freigegeben?: boolean }} p
 * `akt.setzePlanerSteuerung(absicht)` kommt aus src/lib/planer-aktionen.js. `freigegeben`: nur für Prüfungen (Vorgabe: die globale Freigabe).
 */
export function PlanerSteuerung({ sitz, akt, freigegeben }) {
  const [status, setStatus] = useState(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const m = sitz && sitz.mandant ? sitz.mandant : null;
  const ym = heute().slice(0, 7);
  const reife = useMemo(() => { try { return reifeFuerMonat(m, ym, heute()).reife; } catch { return null; } }, [m, ym]);
  const demo = !!sitz && (sitz.demo === true || (SP.zugangsdaten() || {}).demo === true);
  const rechte = planerRechte(sitz, { demo });
  if (!rechte.sehen) return null;
  const monatText = `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const z = planerZustand(m.einstellungen, { freigegeben, reife, monatText });
  const steuern = rechte.steuern && !!akt && typeof akt.setzePlanerSteuerung === "function";
  const aendern = async (absicht) => {
    if (beschaeftigt || !steuern) return;
    setBeschaeftigt(true); setStatus(null);
    try { setStatus(await akt.setzePlanerSteuerung(absicht)); } catch { setStatus({ ok: false, text: "Die Änderung konnte nicht gespeichert werden." }); } finally { setBeschaeftigt(false); }
  };
  return <PlanerSteuerungAnsicht z={z} steuern={steuern} demo={demo} status={status} beschaeftigt={beschaeftigt}
    onSchalter={(an) => aendern({ planerSchalter: { an } })} onModus={(modus) => aendern({ planerModus: { modus } })} />;
}
