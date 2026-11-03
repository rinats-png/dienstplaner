/* ==========================================================================
   KONTIMODELLE — Assistent (WP-19, Strang C; WP-19.12)

   Rechnet live, schreibt nichts von selbst. „Als Schichtfolge übernehmen“ reicht
   Folge, Gruppen und Versatz an den Aufrufer, der daraus wie bisher Schichtfolge
   und Einheiten setzt (Rechte: pattern.edit). Ein Freischicht-Vorschlag wird nur
   ausgewiesen; „Vorschlag übernehmen“ erscheint nur, wenn der Aufrufer einen
   Rückruf mitgibt, und bleibt gesperrt, bis die Bestätigung angehakt ist.

   Sollzeit und Freischichtdauer kommen aus den Regelwerten des Betriebs
   (server/lib/modul-regelwerte.mjs) — ohne Eintrag gibt es keinen Abgleich und
   keinen Vorschlag; es gibt keinen stillen Standard. Die alten Eigenschaften
   `sollWochenstunden` und `stundenJeFreischicht` gelten als ausdrückliche
   Angabe des Aufrufers, ohne Quelle.

   Gestaltung bewusst schlicht und ohne feste Breiten (360 px ohne Querscrollen).
   Eingehängt wird die Ansicht, wenn das Modul „vorläufig" ist
   (server/lib/branchenmodule.mjs) und das Registrieren in src/module/index.js
   (WP-19.0) vorliegt.
   ========================================================================== */
import { useMemo, useState } from "react";
import {
  kontiKennzahlen, versatzVorschlag, kontiHinweise, pruefeKontiModell, kontiAbgleich, kontiAuskunft, freischichtUebernahme,
  KONTI_WOCHEN_JE_JAHR,
} from "../../server/lib/modul-kontimodelle.mjs";
import { RegelwertFeld } from "./regelwerte.jsx";

const zahl = (x) => Number(x).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const ROTATION = { vorwaerts: "vorwärts (Früh – Spät – Nacht)", rueckwaerts: "rückwärts", gemischt: "gemischt", keine: "kein Wechsel zwischen verschiedenen Diensten" };
const kasten = { border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" };

/**
 * @param {{ dienstarten: Record<string, { start: string, ende: string }>, m?: any, heute?: string,
 *   sollWochenstunden?: number, stundenJeFreischicht?: number,
 *   start?: { tage: string[], gruppen: number, versatzTage: number, vollkonti?: boolean },
 *   onUebernehmen?: (m: { tage: string[], gruppen: number, versatzTage: number }) => void,
 *   onFreischichten?: (v: { anzahl: number, stundenJeFreischicht: number, sollWochenstunden: number, differenzJahr: number }) => void }} props
 */
export function KontiAssistent({ dienstarten, m, heute, sollWochenstunden, stundenJeFreischicht, start, onUebernehmen, onFreischichten }) {
  const [folge, setFolge] = useState((start && start.tage ? start.tage : ["F", "S", "N", "-"]).join(" "));
  const [gruppen, setGruppen] = useState(start ? start.gruppen : 4);
  const [versatz, setVersatz] = useState(start ? start.versatzTage : 1);
  const [vollkonti, setVollkonti] = useState(start ? start.vollkonti !== false : true);
  const [bestaetigt, setBestaetigt] = useState(false);

  const modell = useMemo(() => ({ tage: folge.trim().split(/\s+/).filter(Boolean), gruppen: Number(gruppen),
    versatzTage: Number(versatz), vollkonti }), [folge, gruppen, versatz, vollkonti]);
  const fehler = pruefeKontiModell(modell);
  const k = useMemo(() => (fehler ? null : kontiKennzahlen(modell, dienstarten)), [fehler, modell, dienstarten]);
  const vorschlag = useMemo(() => (fehler ? null : versatzVorschlag(modell.tage, modell.gruppen)), [fehler, modell]);
  /* Betrieb mit den Angaben des Aufrufers, wenn er keinen Betrieb mitgibt (ausdrückliche Angabe, ohne Quelle). */
  const betrieb = useMemo(() => {
    if (m) return m;
    const parameter = {};
    if (Number.isFinite(sollWochenstunden)) parameter.sollWochenstunden = sollWochenstunden;
    if (Number.isFinite(stundenJeFreischicht)) parameter.stundenJeFreischicht = stundenJeFreischicht;
    return { einstellungen: { branchenmodule: { kontimodelle: { an: true, parameter } } } };
  }, [m, sollWochenstunden, stundenJeFreischicht]);
  const abgleich = k ? kontiAbgleich(betrieb, k, heute) : null;
  const hinweise = k ? kontiHinweise(k, modell, { m: betrieb, heute }) : [];
  const auskunft = kontiAuskunft(betrieb, heute);
  const uebernahme = freischichtUebernahme(abgleich, { bestaetigt });

  return (
    <section aria-labelledby="konti-titel" style={{ display: "grid", gap: 14, maxWidth: "100%" }}>
      <h2 id="konti-titel" style={{ margin: 0, fontSize: 18 }}>Kontischichtmodell</h2>
      <label style={{ display: "grid", gap: 4 }}>Dienstfolge einer Gruppe (Kürzel, „-“ für frei)
        <input value={folge} onChange={(e) => setFolge(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4 }}>Gruppen
          <input type="number" min={1} max={40} value={gruppen} onChange={(e) => setGruppen(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>Versatz in Tagen
          <input type="number" min={0} value={versatz} onChange={(e) => setVersatz(e.target.value)} />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 44 }}>
          <input type="checkbox" checked={vollkonti} onChange={(e) => setVollkonti(e.target.checked)} />
          auch am Wochenende
        </label>
      </div>

      {fehler && <p role="alert">{fehler}</p>}
      {vorschlag && !fehler && (
        <p>{vorschlag.gleichmaessig
          ? <>Gleichmäßig besetzt mit Versatz {vorschlag.versatzTage}{Number(versatz) !== vorschlag.versatzTage
            && <> — <button type="button" onClick={() => setVersatz(vorschlag.versatzTage)}>übernehmen</button></>}</>
          : vorschlag.grund}</p>)}

      {k && (
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", margin: 0 }}>
          <dt>Wochenstunden</dt><dd style={{ margin: 0 }}>{zahl(k.wochenstunden)}</dd>
          <dt>Längste Serie</dt><dd style={{ margin: 0 }}>{k.maxSerie}</dd>
          <dt>Längste Nachtserie</dt><dd style={{ margin: 0 }}>{k.maxNacht}</dd>
          <dt>Nachtstunden je Woche (23 bis 6 Uhr)</dt><dd style={{ margin: 0 }}>{zahl(k.nachtStundenWoche)}</dd>
          <dt>Nachtdienste im Zyklus</dt><dd style={{ margin: 0 }}>{k.nachtDienste}</dd>
          <dt>Kürzeste Ruhe beim Wechsel</dt><dd style={{ margin: 0 }}>{k.kuerzesteRuhe === null ? "nicht bewertbar" : `${zahl(k.kuerzesteRuhe)} Stunden`}</dd>
          <dt>Wechsel unter 11 Stunden Ruhe</dt><dd style={{ margin: 0 }}>{k.ruheUnter11}</dd>
          <dt>Rotation</dt><dd style={{ margin: 0 }}>{ROTATION[k.rotation]}</dd>
          <dt>Lücken im Zyklus</dt><dd style={{ margin: 0 }}>{k.luecken}</dd>
        </dl>)}

      {abgleich && (abgleich.offen
        ? <p>{abgleich.text}</p>
        : (
          <div style={kasten}>
            <p style={{ margin: 0 }}>Jahresarbeitszeit gegenüber {zahl(abgleich.sollWochenstunden)} Wochenstunden (gerechnet mit {KONTI_WOCHEN_JE_JAHR} Wochen):
              {" "}{abgleich.differenzJahr > 0 ? "+" : ""}{zahl(abgleich.differenzJahr)} Stunden.</p>
            <p style={{ margin: "6px 0 0" }}>{abgleich.hinweis}</p>
            {abgleich.freischichtenVorschlag === null
              ? <p style={{ margin: "6px 0 0" }}>Freischichten zum Ausgleich: kein Vorschlag. {abgleich.freischichtHinweis}</p>
              : <p style={{ margin: "6px 0 0" }}>Freischichten zum Ausgleich (Vorschlag, nicht eingetragen): {abgleich.freischichtenVorschlag}
                {abgleich.freischichtenVorschlag > 0 ? ` zu je ${zahl(abgleich.stundenJeFreischicht)} Stunden` : ""}.</p>}
            {onFreischichten && abgleich.freischichtenVorschlag > 0 && (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
                  <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} />
                  Ich bestätige: Der Vorschlag wird bewusst übernommen und ist keine Zusage des Betriebs.
                </label>
                <div>
                  <button type="button" disabled={!uebernahme.ok} style={{ minHeight: 44 }}
                    onClick={() => { if (uebernahme.ok) onFreischichten(uebernahme.vorschlag); }}>Vorschlag übernehmen</button>
                </div>
              </div>)}
          </div>))}

      {hinweise.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {hinweise.map((x) => (
            <li key={x.kennung} style={{ overflowWrap: "anywhere" }}>
              {x.text}{x.regelId && <> <small>({x.regelId}, {x.pruefstatus === "geprueft" ? "geprüft" : "vorläufig"})</small></>}
            </li>))}
        </ul>)}

      <details>
        <summary>Woher kommen die Werte?</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {auskunft.map((a) => (
            <li key={a.regelId} style={{ overflowWrap: "anywhere" }}>
              {a.bezeichnung} ({a.regelId}): {a.wert === null ? "kein Wert" : `${zahl(a.wert)} ${a.einheit}`} —{" "}
              {a.herkunft === "ausgangswert" ? "Ausgangswert, ungeprüft" : a.herkunft === "nicht-gesetzt" ? "nicht gesetzt" : a.herkunft === "modulparameter" ? "Angabe ohne Quelle" : "Wert des Betriebs"}
              {a.quelle ? `, Quelle: ${a.quelle}` : ""}{a.fundstelle ? `, Fundstelle: ${a.fundstelle}` : ""}. Fachnachweis {a.fachnachweis}.
            </li>))}
        </ul>
      </details>

      {onUebernehmen && (
        <div>
          <button type="button" disabled={!!fehler} style={{ minHeight: 44 }}
            onClick={() => onUebernehmen({ tage: modell.tage, gruppen: modell.gruppen, versatzTage: modell.versatzTage })}>
            Als Schichtfolge übernehmen</button>
        </div>)}
    </section>);
}

/**
 * Die vier Regelwerte des Moduls zum Eintragen (nur Rollen mit org.edit speichern, der Server prüft).
 * @param {{ m: any, heute?: string, onAendern: (regelId: string, eintrag: any | null) => void }} props
 */
export function KontiRegelwerte({ m, heute, onAendern }) {
  return (
    <section aria-label="Werte des Betriebs für Kontischichtmodelle" style={{ display: "grid", gap: 12, maxWidth: "100%" }}>
      {["KONTI-ARBEITSZEIT-01", "KONTI-FREISCHICHT-01", "KONTI-RICHTWERT-SERIE-01", "KONTI-RICHTWERT-NACHT-01"].map((id) => (
        <RegelwertFeld key={id} regelId={id} m={m} heute={heute} onAendern={(e) => onAendern(id, e)} />))}
    </section>);
}
