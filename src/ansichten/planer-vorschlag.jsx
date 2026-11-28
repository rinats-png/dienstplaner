/* ==========================================================================
   PLANVORSCHLAG ÜBERNEHMEN UND ZURÜCKNEHMEN (WP-I7 Stufe 3, Oberfläche für Leitung und Planung)

   Ablauf (jeder Schritt ein ausdrücklicher Klick, nie automatisch, auch nicht im Modus „Automatisch“):
   1. „Vorschlag erstellen“ (Server: POST /api/planer-vorschlag). Ohne Freigabe des Planers (PLANER_AN bleibt AUS) ist der Knopf aus und
      sagt warum; ein Vorschlag entsteht dann nicht.
   2. Die vorgeschlagenen Einteilungen stehen als Liste mit je einer Auswahl (Namen nur hier, aus dem eigenen Bestand; die Antwort des
      Servers trägt nur Kennungen). Ausgewählt ist anfangs nichts. Offene Lücken und die Gründe abgelehnter Einteilungen stehen dabei.
   3. „Auswahl prüfen“: der Server prüft alles, ohne zu schreiben. Erst danach erscheint „Übernahme bestätigen“; jede Änderung der
      Auswahl nimmt die Prüfung zurück.
   4. „Übernahme bestätigen“ schreibt (ein Schreibvorgang am Server). Danach wird der Stand neu geladen. Es werden KEINE Beschäftigten
      benachrichtigt; die Planfreigabe bleibt ein eigener Schritt (der Text sagt das ausdrücklich).
   Zurücknehmen: die offenen Übernahmen des Monats stehen als Liste (Server: POST /api/planer-rueckgaengig-liste), auch bei
   ausgeschaltetem Planer. „Rückgängig“ zeigt zuerst die Prüfung samt Besetzungshinweis („nicht bewertbar“ ist nie „keine Lücke“),
   erst „Rücknahme bestätigen“ schreibt.
   Rechte: nur Leitung und Planung, nie Demo (planerRechte); entschieden wird am Server. Texte je Kennung: src/lib/planer-oberflaeche.js
   (VORSCHLAG_FEHLER), nie Servertexte oder Rohkennungen. Mehrfachklick: ein Knopf ist während der Anfrage aus, und die Aktionen
   (src/lib/planer-aktionen.js) senden nie zwei Anfragen zugleich.
   Barrierefrei: nur Bausteine mit Mindestgröße (Btn, Card), Zustände als Text, keine Farbe als einziger Träger, keine Inline-Stile. EINE ständig
   vorhandene Ansage-Region (role="status", zuerst leer) pro Fläche statt vieler Regionen, die samt Inhalt erst eingehängt werden; nach der
   Bestätigung (Übernahme, Rücknahme) bekommt die Ergebnisüberschrift den Fokus, weil der Knopf mit der Bestätigung verschwindet.
   Monatswechsel: ein Ergebnis gilt nur für den Monat, in dem die Anfrage gestartet wurde (ymRef); es wird nie in einen anderen Monat
   geschrieben. Eine bestätigte Übernahme oder Rücknahme, die erst nach dem Wechsel antwortet, wird ehrlich als solche gemeldet.
   ========================================================================== */
import { useState, useMemo, useEffect, useRef } from "react";
import { Card, Btn, Feldfehler } from "../ui/bausteine.jsx";
import { fKurz, DOW } from "../lib/datum.js";
import { dow } from "../regelwerk.js";
import { planerRechte, planerZustand, vorschlagErstellenGrund, vorschlagZeilen, ablehnungen, unterbesetztAnzeige, andererMonatHinweis } from "../lib/planer-oberflaeche.js";
import * as SP from "../speicher.js";

export const VORSCHLAG_TEXTE = Object.freeze({
  titel: "Planvorschlag übernehmen",
  hinweis: "Der Planer schlägt Einteilungen für offene Lücken dieses Monats vor. Nichts ändert sich, bevor Einteilungen ausdrücklich ausgewählt, geprüft und die Übernahme bestätigt ist; auch im Modus „Automatisch“ übernimmt der Planer nichts von selbst.",
  oeffnen: "Planvorschlag anzeigen",
  schliessen: "Planvorschlag ausblenden",
  erstellen: "Vorschlag erstellen",
  erstellenLaeuft: "Vorschlag wird erstellt …",
  keiner: "Der Planer hat für diesen Monat keine Einteilung vorgeschlagen.",
  liste: "Vorgeschlagene Einteilungen",
  gesamt: "Einteilungen vorgeschlagen",
  offeneLuecken: "Offene Lücken nach diesem Vorschlag",
  offeneLueckenUnbekannt: "Offene Lücken nach diesem Vorschlag: nicht bewertbar",
  verfall: "Der Vorschlag gilt höchstens 24 Stunden und verfällt, sobald sich Plan oder Regeln ändern.",
  alle: "Alle auswählen",
  keine: "Keine auswählen",
  waehlen: "Auswählen",
  gewaehlt: "Ausgewählt",
  waehlenName: "Einteilung übernehmen",
  pruefen: "Auswahl prüfen",
  pruefenKeine: "Zum Prüfen mindestens eine Einteilung auswählen.",
  bestaetigen: "Übernahme bestätigen",
  bestaetigenHinweis: "Mit der Bestätigung werden genau diese Einteilungen in den Plan eingetragen. Beschäftigte werden dabei nicht benachrichtigt. Bis zum genannten Datum lässt sich die Übernahme zurücknehmen.",
  verwerfen: "Vorschlag verwerfen",
  laeuft: "Wird ausgeführt …",
  nichtMoeglich: "Nicht möglich",
  ergebnisTitel: "Übernahme gespeichert",
  keineMitteilung: "Es wurde keine Benachrichtigung an Beschäftigte versendet; die Planfreigabe bleibt ein eigener Schritt.",
  mitteilungUnklar: "Ob Beschäftigte benachrichtigt wurden, meldet der Server nicht eindeutig. Bitte nicht davon ausgehen.",
  monatFreigegeben: "Dieser Monat ist bereits für die Beschäftigten freigegeben: Sie sehen die Änderung, ohne darüber benachrichtigt worden zu sein.",
  verdraengt: "Hinweis: Dafür wurde der älteste gespeicherte Rücknahme-Datensatz verworfen; die dazugehörige frühere Übernahme lässt sich nicht mehr zurücknehmen.",
  rueckTitel: "Frühere Übernahmen zurücknehmen",
  rueckHinweis: "Eine Rücknahme stellt nur den Stand vor der Übernahme wieder her, solange die Einteilungen seitdem nicht verändert wurden. Sie ist auch möglich, wenn der Planer ausgeschaltet ist.",
  rueckLeer: "Für diesen Monat gibt es zurzeit nichts zurückzunehmen.",
  rueckLaden: "Die Liste wird geladen …",
  rueckNeu: "Liste neu laden",
  rueckgaengig: "Rückgängig",
  rueckPruefung: "Prüfung der Rücknahme",
  rueckBestaetigen: "Rücknahme bestätigen",
  rueckBestaetigenHinweis: "Mit der Bestätigung werden diese Einteilungen auf den Stand vor der Übernahme zurückgesetzt. Beschäftigte werden dabei nicht benachrichtigt.",
  abbrechen: "Abbrechen",
  rueckErgebnisTitel: "Rücknahme gespeichert",
  luecken: "Nach der Rücknahme fehlt Besetzung",
  keineLuecke: "Für die betroffenen Tage und Dienste entsteht durch die Rücknahme keine Besetzungslücke.",
  nichtBewertbar: "Nicht bewertbar: Ob nach der Rücknahme Besetzungslücken entstehen, ließ sich nicht prüfen. Das ist nicht dasselbe wie „keine Lücke“.",
  fehlt: "fehlt",
  qualFehlt: "Qualifikation fehlt",
  voraussetzungen: "Was für diesen Monat fehlt",
  fehlerAllgemein: "Die Anfrage konnte nicht ausgeführt werden. Es wurde nichts bestätigt. Bitte den Plan neu laden und prüfen.",
});

/** „Do 03.12.“ — Wochentag und Tag, damit die Liste ohne Kalender lesbar ist. */
const tagText = (d) => `${DOW[dow(d)]} ${fKurz(d)}`;
/** „07.01.2027“. */
const datumLang = (d) => `${fKurz(d)}${String(d).slice(0, 4)}`;
const zeitraumText = (z) => (z && z.von && z.bis ? (z.von === z.bis ? tagText(z.von) : `${tagText(z.von)} bis ${tagText(z.bis)}`) : "");
const einteilungen = (n) => `${n} ${n === 1 ? "Einteilung" : "Einteilungen"}`;

/** Besetzungshinweis nach einer Rücknahme als ein Satz (für die Ansage): Lücken, keine Lücke oder nicht bewertbar (nie „keine“ bei unbekannt). */
function besetzungSatz(u, m) {
  const T = VORSCHLAG_TEXTE;
  const a = unterbesetztAnzeige(u, m);
  if (a.zustand === "nicht_bewertbar") return T.nichtBewertbar;
  if (a.zustand === "keine") return T.keineLuecke;
  return `${T.luecken}: ${a.zeilen.map((z) => `${tagText(z.datum)} ${z.dienstName}`).join("; ")}.`;
}
/** Dasselbe sichtbar (bei Lücken als Liste). */
function Besetzung({ u, m }) {
  const T = VORSCHLAG_TEXTE;
  const a = unterbesetztAnzeige(u, m);
  if (a.zustand === "nicht_bewertbar") return <p>{T.nichtBewertbar}</p>;
  if (a.zustand === "keine") return <p>{T.keineLuecke}</p>;
  return <><p><strong>{T.luecken}:</strong></p>
    <ul aria-label={T.luecken}>
      {a.zeilen.map((z) => <li key={`${z.datum}|${z.dienstName}`}>{tagText(z.datum)} · {z.dienstName}: {z.fehlt > 0 ? `${z.fehlt} ${T.fehlt}` : ""}{z.fehlt > 0 && z.qualFehlt ? ", " : ""}{z.qualFehlt ? T.qualFehlt : ""}</li>)}
    </ul></>;
}

/**
 * Nur die Darstellung (Eigenschaften statt Zustand, damit sie ohne Browser prüfbar ist).
 * `vorschlag`: null oder { zeilen: vorschlagZeilen(...), offen: Zahl | null }; `auswahl`: Vorschlags-Indizes; `geprueft`: null oder { anzahl };
 * `abgelehnt`: [{ index, text }]; `ergebnis` / `rueckErgebnis`: Rückmeldung nach dem Speichern; `liste`: { zustand: "laden" | "fertig" | "fehler",
 * eintraege, text }; `rueck`: null oder { uebernahme, anzahl, unterbesetzt }; `status`: null oder { ok, text, punkte? }.
 * `ansageArt`: was die Ansage-Region gerade sagt ("vorschlag" | "geprueft" | "ergebnis" | "rueckPruefung" | "rueckErgebnis" | "status" | null);
 * `ergebnisRef` / `rueckRef`: Referenzen auf die Ergebnisüberschriften (Fokus nach der Bestätigung).
 */
export function PlanerVorschlagAnsicht({ m, ym, offen = false, onOffen = () => {}, erstellenGrund = null, beschaeftigt = false,
  vorschlag = null, auswahl = [], geprueft = null, abgelehnt = [], ergebnis = null, rueckErgebnis = null,
  liste = { zustand: "laden", eintraege: [], text: "" }, rueck = null, status = null, ansageArt = null, ergebnisRef = null, rueckRef = null,
  onErstellen = () => {}, onToggle = () => {}, onAlle = () => {}, onKeine = () => {}, onPruefen = () => {}, onBestaetigen = () => {}, onVerwerfen = () => {},
  onListeNeu = () => {}, onRueckPruefen = () => {}, onRueckBestaetigen = () => {}, onRueckAbbrechen = () => {} }) {
  const T = VORSCHLAG_TEXTE;
  const monat = `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
  const gewaehlt = new Set(auswahl);
  const grund = (i) => { const a = abgelehnt.find((x) => x.index === i); return a ? a.text : null; };
  const mitteilung = ergebnis && (ergebnis.versandt === false ? T.keineMitteilung : T.mitteilungUnklar);
  /* Die Sätze stehen sichtbar und (je nach Schritt) einmal in der Ansage-Region. */
  const vorSatz = vorschlag ? `${einteilungen(vorschlag.zeilen.length)} vorgeschlagen.` : "";
  const offenSatz = vorschlag ? (vorschlag.offen === null ? T.offeneLueckenUnbekannt : `${T.offeneLuecken}: ${vorschlag.offen}`) : "";
  const gepSatz = geprueft ? `Geprüft: ${einteilungen(geprueft.anzahl)} können übernommen werden. Bisher wurde nichts geändert.` : "";
  const ergSatz = ergebnis ? `${T.ergebnisTitel}: ${einteilungen(ergebnis.anzahl)}${zeitraumText(ergebnis.zeitraum) ? ` (${zeitraumText(ergebnis.zeitraum)})` : ""}.` : "";
  const fristSatz = ergebnis && ergebnis.rueckgaengigBis ? `Zurücknehmen ist möglich bis ${datumLang(ergebnis.rueckgaengigBis)}.` : "";
  const rueckPSatz = rueck ? `${T.rueckPruefung}: ${einteilungen(rueck.anzahl)} werden auf den Stand vor der Übernahme zurückgesetzt. Bisher wurde nichts geändert.` : "";
  const rueckESatz = rueckErgebnis ? `${T.rueckErgebnisTitel}: ${einteilungen(rueckErgebnis.anzahl)}${zeitraumText(rueckErgebnis.zeitraum) ? ` (${zeitraumText(rueckErgebnis.zeitraum)})` : ""}.` : "";
  const ansage = ({ vorschlag: `${vorSatz} ${offenSatz}`, geprueft: gepSatz, ergebnis: `${fristSatz} ${mitteilung}`, status: status && status.ok ? status.text : "",
    rueckPruefung: `${rueckPSatz} ${rueck ? besetzungSatz(rueck.unterbesetzt, m) : ""}`,
    rueckErgebnis: `Beschäftigte wurden dabei nicht benachrichtigt. ${rueckErgebnis ? besetzungSatz(rueckErgebnis.unterbesetzt, m) : ""}` })[ansageArt] || "";
  return (
    <Card still data-testid="planer-vorschlag" role="region" aria-label={`${T.titel}, ${monat}`}>
      <h2 className="abschnitt-titel" id="planer-vorschlag-titel">{T.titel}</h2>
      <div className="nurLeser" role="status" aria-live="polite" aria-atomic="true" data-testid="planer-vorschlag-ansage">{ansage.replace(/\s+/g, " ").trim()}</div>
      <p>{T.hinweis}</p>
      <Btn size="sm" kind="quiet" aria-expanded={offen} aria-controls="planer-vorschlag-inhalt" onClick={onOffen}>{offen ? T.schliessen : T.oeffnen}</Btn>
      {offen && <div id="planer-vorschlag-inhalt">
        <section aria-label={T.erstellen}>
          <Btn kind="primary" disabled={!!erstellenGrund || beschaeftigt} onClick={onErstellen}>{beschaeftigt ? T.laeuft : T.erstellen}</Btn>
          {erstellenGrund && <p>{erstellenGrund}</p>}
        </section>

        {vorschlag && <section aria-label={T.liste}>
          <p><strong>{vorSatz}</strong>{" "}{offenSatz}</p>
          <p>{T.verfall}</p>
          <p><Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={onAlle}>{T.alle}</Btn>{" "}
            <Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={onKeine}>{T.keine}</Btn>{" "}
            {auswahl.length} von {vorschlag.zeilen.length} ausgewählt</p>
          <ul aria-label={T.liste}>
            {vorschlag.zeilen.map((z) => <li key={z.index}>
              {tagText(z.datum)} · {z.personName}: {z.dienstName}{" "}
              <Btn size="sm" kind={gewaehlt.has(z.index) ? "primary" : "quiet"} aria-pressed={gewaehlt.has(z.index)} disabled={beschaeftigt}
                aria-label={`${T.waehlenName}: ${z.personName}, ${tagText(z.datum)}, ${z.dienstName}`} onClick={() => onToggle(z.index)}>
                {gewaehlt.has(z.index) ? T.gewaehlt : T.waehlen}</Btn>
              {grund(z.index) && <p>{T.nichtMoeglich}: {grund(z.index)}.</p>}
            </li>)}
          </ul>
          <p><Btn kind={geprueft ? "quiet" : "primary"} disabled={beschaeftigt || auswahl.length === 0} onClick={onPruefen}>{T.pruefen}</Btn>{" "}
            <Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={onVerwerfen}>{T.verwerfen}</Btn></p>
          {auswahl.length === 0 && <p>{T.pruefenKeine}</p>}
          {geprueft && <>
            <p><strong>{gepSatz}</strong></p>
            <p>{T.bestaetigenHinweis}</p>
            <Btn kind="primary" disabled={beschaeftigt} onClick={onBestaetigen}>{T.bestaetigen}</Btn>
          </>}
        </section>}

        {ergebnis && <section aria-label={T.ergebnisTitel}>
          <h3 tabIndex={-1} ref={ergebnisRef}>{ergSatz}</h3>
          <p>{fristSatz}</p>
          <p>{mitteilung}</p>
          {ergebnis.planFreigegeben === true && <p>{T.monatFreigegeben}</p>}
          {ergebnis.verdraengt > 0 && <p>{T.verdraengt}</p>}
        </section>}

        {status && (status.ok ? <p>{status.text}</p> : <Feldfehler text={status.text} />)}
        {status && Array.isArray(status.punkte) && status.punkte.length > 0 && <>
          <p><strong>{T.voraussetzungen}</strong></p>
          <ul aria-label={T.voraussetzungen}>{status.punkte.map((p) => <li key={p}>{p}</li>)}</ul></>}

        <section aria-label={T.rueckTitel}>
          <h3>{T.rueckTitel}</h3>
          <p>{T.rueckHinweis}</p>
          {liste.zustand === "laden" && <p>{T.rueckLaden}</p>}
          {liste.zustand === "fehler" && <><Feldfehler text={liste.text} /><Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={onListeNeu}>{T.rueckNeu}</Btn></>}
          {liste.zustand === "fertig" && liste.eintraege.length === 0 && <p>{T.rueckLeer}</p>}
          {liste.zustand === "fertig" && liste.eintraege.length > 0 && <ul aria-label={T.rueckTitel}>
            {liste.eintraege.map((e) => <li key={e.uebernahme}>
              {einteilungen(e.anzahl)}, {zeitraumText({ von: e.von, bis: e.bis })}; zurücknehmbar bis {datumLang(e.rueckgaengigBis)}{" "}
              <Btn size="sm" kind="quiet" disabled={beschaeftigt} aria-label={`${T.rueckgaengig}: ${einteilungen(e.anzahl)}, ${zeitraumText({ von: e.von, bis: e.bis })}`}
                onClick={() => onRueckPruefen(e.uebernahme)}>{T.rueckgaengig}</Btn>
              {rueck && rueck.uebernahme === e.uebernahme && <div>
                <p><strong>{rueckPSatz}</strong></p>
                <Besetzung u={rueck.unterbesetzt} m={m} />
                <p>{T.rueckBestaetigenHinweis}</p>
                <Btn kind="primary" disabled={beschaeftigt} onClick={onRueckBestaetigen}>{T.rueckBestaetigen}</Btn>{" "}
                <Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={onRueckAbbrechen}>{T.abbrechen}</Btn>
              </div>}
            </li>)}
          </ul>}
          {rueckErgebnis && <div>
            <h4 tabIndex={-1} ref={rueckRef}>{rueckESatz}</h4>
            <p>Beschäftigte wurden dabei nicht benachrichtigt.</p>
            <Besetzung u={rueckErgebnis.unterbesetzt} m={m} />
          </div>}
        </section>
      </div>}
    </Card>
  );
}

/** Eine einzelne Absage als Anzeige: Text und die Voraussetzungen (nur ihr Text, nie die Kennung) bei „nicht planungsreif“. */
const statusAus = (r) => ({ ok: false, text: r.text,
  punkte: r.code === "nicht-planungsreif" && r.daten && Array.isArray(r.daten.voraussetzungen)
    ? r.daten.voraussetzungen.map((v) => (v && typeof v.text === "string" ? v.text.replace(/\s+/g, " ").trim().slice(0, 200) : "")).filter(Boolean).slice(0, 10) : [] });

/**
 * Die Fläche im Monatsplan: nur Leitung und Planung (nicht Demo), nur mit den Aktionen aus src/lib/planer-aktionen.js. Gerechnet und gefragt
 * wird erst nach dem Öffnen. `startOffen` und `freigegeben` nur für Prüfungen (Vorgabe: zu bzw. die globale Freigabe des Planers).
 * @param {{ m: any, ym: string, sitz: any, akt: any, startOffen?: boolean, freigegeben?: boolean }} p
 */
export function PlanerVorschlag({ m, ym, sitz, akt, startOffen = false, freigegeben }) {
  const [offen, setOffen] = useState(startOffen === true);
  const [vorschlag, setVorschlag] = useState(null);   // { id, eintraege, offen }
  const [auswahl, setAuswahl] = useState([]);
  const [geprueft, setGeprueft] = useState(null);     // { schluessel, anzahl }
  const [abgelehnt, setAbgelehnt] = useState([]);
  const [ergebnis, setErgebnis] = useState(null);
  const [rueckErgebnis, setRueckErgebnis] = useState(null);
  const [liste, setListe] = useState({ zustand: "laden", eintraege: [], text: "" });
  const [rueck, setRueck] = useState(null);
  const [status, setStatus] = useState(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [ansageArt, setAnsageArt] = useState(null);   // was die eine Ansage-Region gerade sagt
  const sperre = useRef(false);        // Mehrfachklick: steht vor dem ersten await, anders als der Zustand
  const zaehler = useRef(0);           // veraltete Antworten der Liste verwerfen
  const aktRef = useRef(akt);
  aktRef.current = akt;
  const ymRef = useRef(ym);            // der Monat, der jetzt angezeigt wird: nach jedem await prüfen, ob die Anfrage noch zu ihm gehört
  ymRef.current = ym;
  const epoche = useRef(0);            // zählt jeden Monatswechsel: Dez → Jan → Dez während einer Anfrage ist nicht derselbe Stand wie davor
  const ergebnisKopf = useRef(null);   // Fokus nach der Bestätigung: der Bestätigungsknopf verschwindet
  const rueckKopf = useRef(null);
  const demo = !!sitz && (sitz.demo === true || (SP.zugangsdaten() || {}).demo === true);
  const rechte = planerRechte(sitz, { demo });
  /* Übernehmen und Zurücknehmen dürfen dieselben Rollen wie Anheften (Leitung, Planung, nie Demo; die Prüfung vergleicht beide Listen). */
  const zeigen = !!m && rechte.sehen && rechte.anheften && !!akt && typeof akt.planerVorschlagErzeugen === "function";

  const alleZurueck = () => { setVorschlag(null); setAuswahl([]); setGeprueft(null); setAbgelehnt([]); setErgebnis(null); setRueckErgebnis(null); setRueck(null); setStatus(null); setAnsageArt(null);
    setListe({ zustand: "laden", eintraege: [], text: "" }); };
  useEffect(() => { epoche.current += 1; alleZurueck(); }, [ym]);   // ein Vorschlag gilt für genau einen Monat
  useEffect(() => { if (ergebnis && ergebnisKopf.current) ergebnisKopf.current.focus(); }, [ergebnis]);
  useEffect(() => { if (rueckErgebnis && rueckKopf.current) rueckKopf.current.focus(); }, [rueckErgebnis]);

  /** Die Liste der offenen Rücknahmen für `monat`; gilt nur, solange dieser Monat noch angezeigt wird (nie die Liste eines anderen Monats). */
  const ladeListe = async (monat) => {
    if (ymRef.current !== monat) return;
    const mein = ++zaehler.current;
    setListe((l) => ({ ...l, zustand: "laden" }));
    let r;
    try { r = await aktRef.current.planerRueckgaengigListe(monat); } catch { r = { ok: false, text: VORSCHLAG_TEXTE.fehlerAllgemein }; }
    if (mein !== zaehler.current || ymRef.current !== monat) return;
    setListe(r.ok ? { zustand: "fertig", eintraege: r.daten.eintraege.filter((e) => e && typeof e.uebernahme === "string" && Number.isInteger(e.anzahl)), text: "" }
      : { zustand: "fehler", eintraege: [], text: r.text });
  };
  useEffect(() => { if (zeigen && offen) ladeListe(ym); }, [zeigen, offen, ym]); // laden beim Öffnen und beim Monatswechsel

  const zeilen = useMemo(() => (vorschlag ? vorschlagZeilen(m, vorschlag.eintraege) : []), [vorschlag, m]);
  if (!zeigen) return null;
  const sortiert = [...auswahl].sort((a, b) => a - b);
  const schluessel = sortiert.join(",");

  /** `fn(monat, gilt)`: `monat` ist der Monat beim Klick, `gilt()` sagt, ob er noch angezeigt wird und seitdem nicht gewechselt wurde (sonst das Ergebnis nicht in diese Fläche schreiben). */
  const ausfuehren = async (fn) => {
    if (sperre.current) return;
    sperre.current = true; setBeschaeftigt(true); setStatus(null); setAnsageArt(null);
    const monat = ym, ep = epoche.current, gilt = () => ymRef.current === monat && epoche.current === ep;
    try { await fn(monat, gilt); } catch { if (gilt()) setStatus({ ok: false, text: VORSCHLAG_TEXTE.fehlerAllgemein }); } finally { sperre.current = false; setBeschaeftigt(false); }
  };
  /** Eine bestätigte Übernahme oder Rücknahme antwortet erst nach dem Monatswechsel: ehrlich melden, nichts in die neue Fläche eintragen. */
  const fremderMonat = (art, monat, r) => {
    const hier = ymRef.current === monat;   // Rückkehr in denselben Monat: der Stand und die Liste sind inzwischen neu, die Liste wurde vor dem Ergebnis gelesen
    const h = andererMonatHinweis(art, monat, r, hier); setStatus(h); setAnsageArt(h.ok ? "status" : null);
    if (hier) ladeListe(monat);
  };
  const planerAktion = () => aktRef.current;

  const erstellen = () => ausfuehren(async (monat, gilt) => {
    setErgebnis(null); setRueckErgebnis(null); setGeprueft(null); setAbgelehnt([]); setRueck(null);
    const r = await planerAktion().planerVorschlagErzeugen(monat);
    if (!gilt()) return;   // anderer Monat: am Plan hat sich nichts geändert, der Vorschlag verfällt am Server
    if (!r.ok) { setVorschlag(null); setAuswahl([]); setStatus(statusAus(r)); return; }
    const d = r.daten;
    const n = Array.isArray(d.eintraege) ? d.eintraege.length : 0;
    if (!d.vorschlag || n === 0) {
      setVorschlag(null); setAuswahl([]);
      setAnsageArt("status");
      setStatus({ ok: true, text: `${VORSCHLAG_TEXTE.keiner} ${Number.isInteger(d.offen) ? `${VORSCHLAG_TEXTE.offeneLuecken}: ${d.offen}.` : VORSCHLAG_TEXTE.offeneLueckenUnbekannt + "."}` });
      return;
    }
    setVorschlag({ id: d.vorschlag, eintraege: d.eintraege, offen: Number.isInteger(d.offen) ? d.offen : null });
    setAuswahl([]); setAnsageArt("vorschlag");
  });
  const waehle = (neu) => { setAuswahl(neu); setGeprueft(null); setAbgelehnt([]); setStatus(null); setAnsageArt(null); };
  const umschalten = (i) => waehle(auswahl.includes(i) ? auswahl.filter((x) => x !== i) : [...auswahl, i]);
  const pruefen = () => ausfuehren(async (monat, gilt) => {
    if (!vorschlag || !sortiert.length) return;
    const r = await planerAktion().planerAuswahlPruefen(vorschlag.id, sortiert);
    if (!gilt()) return;   // die Prüfung schreibt nichts und gehört zum anderen Monat
    if (r.ok) { setGeprueft({ schluessel, anzahl: Number.isInteger(r.daten.anzahl) ? r.daten.anzahl : sortiert.length }); setAbgelehnt([]); setAnsageArt("geprueft"); return; }
    setGeprueft(null);
    setAbgelehnt(ablehnungen(r.daten && r.daten.abgelehnt, sortiert));
    setStatus(statusAus(r));
    if (r.verbraucht) { setVorschlag(null); setAuswahl([]); }
  });
  const bestaetigen = () => ausfuehren(async (monat, gilt) => {
    if (!vorschlag || !geprueft || geprueft.schluessel !== schluessel) return;   // nur genau die geprüfte Auswahl
    const r = await planerAktion().planerUebernehmen(vorschlag.id, sortiert);   // die Aktion lädt den Stand bei Erfolg und bei unklarem Ausgang selbst neu
    if (!gilt()) { fremderMonat("uebernahme", monat, r); return; }   // geschrieben sein kann es trotzdem: nie still verwerfen
    if (r.ok) {
      const d = r.daten, mt = d.mitteilungen && typeof d.mitteilungen === "object" ? d.mitteilungen : {};
      setErgebnis({ anzahl: Number.isInteger(d.anzahl) ? d.anzahl : sortiert.length, zeitraum: d.zeitraum, rueckgaengigBis: typeof d.rueckgaengigBis === "string" ? d.rueckgaengigBis : null,
        verdraengt: Number.isInteger(d.rueckgaengigVerdraengt) ? d.rueckgaengigVerdraengt : 0, versandt: mt.versandt, planFreigegeben: mt.planFreigegeben === true });
      setVorschlag(null); setAuswahl([]); setGeprueft(null); setAbgelehnt([]); setRueckErgebnis(null); setAnsageArt("ergebnis");
    } else {
      if (r.code !== "schreiben-fehlgeschlagen") setGeprueft(null);   // nur nach „nichts geschrieben, später noch einmal“ bleibt die Prüfung stehen
      setAbgelehnt(ablehnungen(r.daten && r.daten.abgelehnt, sortiert));
      setStatus(statusAus(r));
      if (r.verbraucht) { setVorschlag(null); setAuswahl([]); }
    }
    await ladeListe(monat);   // auch bei unklarem Ausgang: die Liste zeigt, ob der Datensatz entstanden ist
  });
  const rueckPruefen = (id) => ausfuehren(async (monat, gilt) => {
    setRueck(null); setRueckErgebnis(null);
    const r = await planerAktion().planerRueckgaengigPruefen(id);
    if (!gilt()) return;   // nur geprüft, nichts geschrieben
    if (r.ok) { setRueck({ uebernahme: id, anzahl: Number.isInteger(r.daten.anzahl) ? r.daten.anzahl : 0, unterbesetzt: Object.hasOwn(r.daten, "unterbesetzt") ? r.daten.unterbesetzt : null }); setAnsageArt("rueckPruefung"); return; }
    setStatus(statusAus(r));
    await ladeListe(monat);
  });
  const rueckBestaetigen = () => ausfuehren(async (monat, gilt) => {
    if (!rueck) return;
    const r = await planerAktion().planerRueckgaengigAusfuehren(rueck.uebernahme);
    if (!gilt()) { fremderMonat("rueckgaengig", monat, r); return; }
    if (r.ok) {
      const d = r.daten;
      setRueckErgebnis({ anzahl: Number.isInteger(d.anzahl) ? d.anzahl : rueck.anzahl, zeitraum: d.zeitraum, unterbesetzt: Object.hasOwn(d, "unterbesetzt") ? d.unterbesetzt : null });
      setErgebnis(null); setAnsageArt("rueckErgebnis");
    } else setStatus(statusAus(r));
    setRueck(null);
    await ladeListe(monat);
  });

  const z = planerZustand(m.einstellungen, { freigegeben });
  return <PlanerVorschlagAnsicht m={m} ym={ym} offen={offen} onOffen={() => setOffen((o) => !o)} erstellenGrund={vorschlagErstellenGrund(z)} beschaeftigt={beschaeftigt}
    vorschlag={vorschlag ? { zeilen, offen: vorschlag.offen } : null} auswahl={auswahl} geprueft={geprueft && geprueft.schluessel === schluessel ? geprueft : null}
    abgelehnt={abgelehnt} ergebnis={ergebnis} rueckErgebnis={rueckErgebnis} liste={liste} rueck={rueck} status={status}
    ansageArt={ansageArt} ergebnisRef={ergebnisKopf} rueckRef={rueckKopf}
    onErstellen={erstellen} onToggle={umschalten} onAlle={() => waehle(zeilen.map((x) => x.index))} onKeine={() => waehle([])} onPruefen={pruefen}
    onBestaetigen={bestaetigen} onVerwerfen={() => { setVorschlag(null); setAuswahl([]); setGeprueft(null); setAbgelehnt([]); setStatus(null); setAnsageArt(null); }}
    onListeNeu={() => ladeListe(ym)} onRueckPruefen={rueckPruefen} onRueckBestaetigen={rueckBestaetigen} onRueckAbbrechen={() => setRueck(null)} />;
}
