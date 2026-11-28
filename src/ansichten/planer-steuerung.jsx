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

   Stufe 2 (nur lesen): PlanerVerteilung im Monatsplan zeigt Leitung und Planung die Verteilung der Nachtdienste je Person im Monat
   (Vorgabe verteilungsregel) und warum etwas nicht bewertbar ist. Gerechnet wird mit denselben Funktionen wie im Planer
   (engine/verteilung.mjs) auf dem Plan, wie er jetzt ist; nichts wird geschrieben, kein Planervorschlag, kein Schalter berührt.
   ========================================================================== */
import { useState, useMemo } from "react";
import { Card, CardHead, Pill, Btn, Schalter, Feldfehler, Lab } from "../ui/bausteine.jsx";
import { MON, heute } from "../lib/datum.js";
import { reifeFuerMonat } from "./planungsreife.jsx";
import { PLANER_TEXTE, MODUS_TEXT, planerRechte, planerZustand, hatVerteilungsvorgabe, verteilungErgebnis, verteilungAnzeige } from "../lib/planer-oberflaeche.js";
import { KI_PLANER_MODI } from "../../server/lib/ki-steuerung.mjs";
import * as SP from "../speicher.js";

/** Nur die Darstellung (Eigenschaften statt Zustand, damit sie ohne Browser prüfbar ist). */
export function PlanerSteuerungAnsicht({ z, steuern = false, demo = false, status = null, beschaeftigt = false, onSchalter = () => {}, onModus = () => {} }) {
  const T = PLANER_TEXTE;
  const wirksam = MODUS_TEXT[z.wirksam] || MODUS_TEXT.aus;
  const wirksamer = z.wirksam !== "aus";   // nur dann gilt der Schalter nicht bloß als „vorgemerkt“
  return (
    <Card role="region" aria-label={T.titel} data-testid="planer-steuerung">
      <CardHead right={<Pill tone={z.wirksam === "aus" || z.reifeFehlt ? "warn" : "ok"}>{z.reifeFehlt ? T.eingeschraenkt : wirksam.name}</Pill>}>{T.titel}</CardHead>
      <section aria-label={T.wirksam}>
        <p role="status"><strong>{T.wirksam}: {wirksam.name}{z.reifeFehlt ? ` (${T.eingeschraenkt})` : ""}</strong></p>
        <p>{!z.freigegeben ? T.globalAus : z.wirksam === "aus" ? T.wirksamAusGrund : z.reifeFehlt ? T.eingeschraenktHinweis : wirksam.hinweis}</p>
        {z.steuerungUnlesbar && <p role="alert">{T.steuerungUnlesbar}</p>}
      </section>

      <section aria-label={T.schalter}>
        <p><strong>{T.schalter}: {wirksamer ? (z.schalterAn ? "an" : "aus") : (z.schalterAn ? T.schalterAn : T.schalterAus)}</strong>
          {steuern && <>{" "}<Schalter an={z.schalterAn} label={T.schalter} onChange={(v) => onSchalter(v)} /></>}</p>
        {z.schalterUnlesbar && <p role="alert">{T.schalterUnlesbar}</p>}
      </section>

      <section aria-label={T.modus}>
        <p><strong>{T.modus}: {z.modusGespeichert ? MODUS_TEXT[z.modusGespeichert].name : T.modusNichtGewaehlt}{z.modusGespeichert && !wirksamer ? ` (${T.vorgemerkt})` : ""}</strong></p>
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

/* ------------------------------------------------------------------ Verteilung (Stufe 2, nur lesen) */

export const VERTEILUNG_TEXTE = Object.freeze({
  titel: "Verteilung der Nachtdienste (nur lesen)",
  hinweis: "Zeigt, wie die Nachtdienste im Plan dieses Monats auf die Personen verteilt sind, so wie der Plan jetzt ist (kein Planervorschlag; nichts wird geändert). „Nicht bewertbar“ heißt: Ein Wert ist unbekannt. Das gilt nie als erfüllt.",
  oeffnen: "Verteilung anzeigen",
  schliessen: "Verteilung ausblenden",
  fehler: "Die Verteilung ließ sich nicht berechnen. Sie gilt als nicht bewertbar.",
  wertHinweis: "Vergleichswert: Nachtdienste, Urlaubs- und Krankheitstage herausgerechnet.",
  teilzeitAn: "Teilzeit wird anteilig umgerechnet.",
  teilzeitAus: "Teilzeit wird nicht umgerechnet.",
  personen: "Personen im Vergleich",
  nichtBewertbar: "Nicht bewertbar",
  ausserhalb: "Nicht in der Vergleichsgruppe",
});
const ZUSTAND_TON = { erfuellt: "ok", nicht_erfuellt: "danger", nicht_bewertbar: "warn" };

/** Nur die Darstellung (Eigenschaften statt Zustand, damit sie ohne Browser prüfbar ist). `ergebnis`: verteilungErgebnis(m, ym) oder null (zu). */
export function PlanerVerteilungAnsicht({ m, ym, offen = false, onOffen = () => {}, ergebnis = null }) {
  const T = VERTEILUNG_TEXTE;
  const monat = `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const a = offen && ergebnis && ergebnis.ok && !ergebnis.keine ? verteilungAnzeige(ergebnis.bewertung, m) : null;
  return (
    <Card still data-testid="planer-verteilung" role="region" aria-label={`${T.titel}, ${monat}`}>
      <Lab>{T.titel}</Lab>
      <p>{T.hinweis}</p>
      <Btn size="sm" kind="quiet" aria-expanded={offen} aria-controls="planer-verteilung-inhalt" onClick={onOffen}>{offen ? T.schliessen : T.oeffnen}</Btn>
      {offen && <div id="planer-verteilung-inhalt">
        {(!ergebnis || !ergebnis.ok) && <p role="alert">{T.fehler}</p>}
        {a && <>
          <p role="status">{monat}: {a.erfuellt} erfüllt · {a.nichtErfuellt} nicht erfüllt · {a.nichtBewertbar} nicht bewertbar{a.gesamtBewertet ? "" : " (insgesamt nicht bewertet)"}</p>
          <ul>
            {a.regeln.map((r) => <li key={r.vorgabeId}>
              <strong>{r.name}</strong>{r.staerke ? ` (${r.staerke})` : ""}: erlaubter Unterschied höchstens {r.maxAbweichung}{" "}
              <Pill tone={ZUSTAND_TON[r.zustand]}>{r.zustandText}</Pill>
              {r.grund && <p>{r.grund}</p>}
              {r.spannweite !== null && r.zustand !== "nicht_bewertbar" && <p>Größter Unterschied im Monat: {r.spannweite}{r.ueberschreitung ? `, davon ${r.ueberschreitung} über der Grenze` : ""}.</p>}
              <p>{T.wertHinweis} {r.teilzeitAnteilig ? T.teilzeitAn : T.teilzeitAus}</p>
              {r.personen.length > 0 && <><p><strong>{T.personen}</strong></p><ul>
                {r.personen.map((p) => <li key={p.personId}>{p.name}: {p.nachtdienste} Nachtdienste, Vergleichswert {p.wert}, {p.abweichung} über dem niedrigsten</li>)}</ul></>}
              {r.nichtBewertbar.length > 0 && <><p><strong>{T.nichtBewertbar}</strong></p><ul>
                {r.nichtBewertbar.map((p) => <li key={p.personId}>{p.name}: {p.nachtdienste} Nachtdienste, nicht bewertbar. {p.grundText}</li>)}</ul></>}
              {r.ausserhalb.length > 0 && <><p><strong>{T.ausserhalb}</strong></p><ul>
                {r.ausserhalb.map((p) => <li key={p.personId}>{p.name}: {p.grundText}</li>)}</ul></>}
            </li>)}
          </ul></>}
      </div>}
    </Card>
  );
}

/** Die Fläche im Monatsplan: nur Leitung und Planung, nur mit aktiver Verteilungsvorgabe; gerechnet wird erst nach dem Öffnen. */
export function PlanerVerteilung({ m, ym, sitz }) {
  const [offen, setOffen] = useState(false);
  const zeigen = !!m && !!sitz && planerRechte(sitz).sehen && hatVerteilungsvorgabe(m);
  const ergebnis = useMemo(() => (zeigen && offen ? verteilungErgebnis(m, ym) : null), [zeigen, offen, m, ym]);
  if (!zeigen) return null;
  return <PlanerVerteilungAnsicht m={m} ym={ym} offen={offen} onOffen={() => setOffen((o) => !o)} ergebnis={ergebnis} />;
}
