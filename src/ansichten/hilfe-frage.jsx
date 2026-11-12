import { useEffect, useId, useRef, useState } from "react";
import { C } from "../farben.js";
import { Btn, Card, CardHead, Inp, Lab } from "../ui/bausteine.jsx";
import { hilfeStatus, hilfeFrage } from "../speicher.js";

/* ==========================================================================
   HILFE-FRAGE (WP-I23, F9) — „Frage zur Hilfe“ in der Ansicht Hilfe

   Eine Frage zur Bedienung, beantwortet aus den Hilfetexten, die zur eigenen
   Rolle gehören. Ohne Gesundheits-, Kontakt- oder Personenangaben; die Frage
   wird nicht gespeichert (der Server legt sie nirgends ab).

   Gezeigt wird nur, was der Server sagt: modus „aus“ zeigt nichts. Von „KI“ ist
   ausschließlich die Rede, wenn der Server tatsächlich eine formulierte Antwort
   geliefert hat — sie trägt dann die Kennzeichnung Entwurf. Fehlt sie, stehen die
   gefundenen Hilfetexte allein da, und das ist die ganze Funktion.

   HilfeFrageAnsicht ist rein darstellend (kein Abruf, kein Zustand) und wird so
   geprüft; HilfeFrage hängt Abruf und Zustand daran.
   ========================================================================== */

export const HILFE_FRAGE_MAX = 300;

export const HILFE_TEXTE = Object.freeze({
  titelSuche: "Hilfe durchsuchen",
  titelAn: "Frage zur Hilfe",
  label: "Deine Frage zur Bedienung von CENTRIC",
  hinweis: "Bitte keine Namen, Kontaktdaten oder Gesundheitsangaben eintragen. Die Frage wird nicht gespeichert.",
  knopf: "Frage stellen",
  laedt: "Die Hilfetexte werden gesucht …",
  gefunden: "Das sagt die Hilfe dazu",
  keinTreffer: "Das steht nicht in der Hilfe.",
  keinTrefferWeiter: "Schreib uns unter „Uns fragen“ oder schau ins Handbuch.",
  modellNichtVerfuegbar: "Eine formulierte Antwort ist gerade nicht verfügbar. Die passenden Hilfetexte stehen hier:",
  entwurf: "KI-Entwurf, nur aus den Hilfetexten unten formuliert — bitte dort nachlesen.",
  fehlerLeer: "Bitte eine Frage eintragen.",
  fehlerLang: `Die Frage ist zu lang (höchstens ${HILFE_FRAGE_MAX} Zeichen).`,
  fehlerAllgemein: "Das hat nicht geklappt. Versuch es noch einmal.",
  fehlerZuViele: "Zu viele Fragen in kurzer Zeit. Bitte kurz warten.",
});

/** @param {{ modus: string, modell?: boolean, frage: string, setFrage: (s: string) => void, zustand: "leer"|"laedt"|"fertig"|"fehler",
 *   ergebnis?: any, fehler?: string|null, onSenden: () => void }} p */
export function HilfeFrageAnsicht({ modus, frage, setFrage, zustand, ergebnis, fehler, onSenden }) {
  const eigen = useId();
  const feldId = `${eigen}-frage`;
  const hinweisId = `${eigen}-hinweis`;
  const fehlerId = `${eigen}-fehler`;
  const antwortId = `${eigen}-antwort`;
  if (modus !== "suche" && modus !== "an") return null;

  const m = ergebnis && ergebnis.modell;
  return (
    <Card>
      <CardHead>{modus === "an" ? HILFE_TEXTE.titelAn : HILFE_TEXTE.titelSuche}</CardHead>
      <form onSubmit={(e) => { e.preventDefault(); onSenden(); }} noValidate style={{ padding: "0 var(--pad-x) 14px" }}>
        <label htmlFor={feldId} style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: 6 }}>
          {HILFE_TEXTE.label}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Inp id={feldId} type="text" value={frage} maxLength={HILFE_FRAGE_MAX} autoComplete="off" spellCheck="true"
              onChange={(e) => setFrage(e.target.value)}
              aria-describedby={fehler ? `${hinweisId} ${fehlerId}` : hinweisId} aria-invalid={fehler ? "true" : undefined}
              style={{ width: "100%" }} />
          </div>
          <Btn kind="primary" type="submit" disabled={zustand === "laedt"}>{HILFE_TEXTE.knopf}</Btn>
        </div>
        <span id={hinweisId} style={{ display: "block", fontSize: 12, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>
          {HILFE_TEXTE.hinweis}</span>
        {fehler && (
          <div id={fehlerId} role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 6,
            fontSize: 12.5, color: C.danger, lineHeight: 1.45 }}>
            <span aria-hidden="true" style={{ fontWeight: 700 }}>!</span><span>{fehler}</span>
          </div>)}
      </form>

      {/* Immer da, damit Vorlesesoftware Änderungen meldet */}
      <div id={antwortId} role="region" aria-label="Antwort der Hilfe" aria-live="polite" aria-busy={zustand === "laedt" ? "true" : "false"}
        style={{ padding: "0 var(--pad-x) 14px" }}>
        {zustand === "laedt" && <Lab>{HILFE_TEXTE.laedt}</Lab>}
        {zustand === "fertig" && ergebnis && (<>
          {m && m.status === "fertig" && m.text && (
            <div style={{ marginBottom: 12 }}>
              <Lab style={{ marginBottom: 4 }}>{HILFE_TEXTE.entwurf}</Lab>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.text}</div>
            </div>)}
          {m && m.status === "nicht_verfuegbar" && <div style={{ fontSize: 13, color: C.dim, marginBottom: 8 }}>{HILFE_TEXTE.modellNichtVerfuegbar}</div>}
          {ergebnis.keinTreffer
            ? (<div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{ergebnis.hinweis || HILFE_TEXTE.keinTreffer}</div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>{HILFE_TEXTE.keinTrefferWeiter}</div>
              </div>)
            : (<div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: 6 }}>{HILFE_TEXTE.gefunden}</div>
                {(ergebnis.passagen || []).map((p) => (
                  <section key={p.id} aria-labelledby={`${antwortId}-${p.id}`} style={{ marginBottom: 12 }}>
                    <h3 id={`${antwortId}-${p.id}`} style={{ fontSize: 14.5, fontWeight: 600, margin: "0 0 4px" }}>{p.titel}</h3>
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, color: C.text }}>{p.text}</p>
                  </section>))}
              </div>)}
        </>)}
      </div>
    </Card>);
}

/** Abruf und Zustand. `status` und `fragen` sind für Prüfungen austauschbar. */
export function HilfeFrage({ status = hilfeStatus, fragen = hilfeFrage }) {
  const [modus, setModus] = useState("aus");
  const [frage, setFrage] = useState("");
  const [zustand, setZustand] = useState("leer");
  const [ergebnis, setErgebnis] = useState(null);
  const [fehler, setFehler] = useState(null);
  const aktiv = useRef(true);
  useEffect(() => {
    aktiv.current = true;
    status().then((s) => { if (aktiv.current && s && typeof s.modus === "string") setModus(s.modus); }).catch(() => {});
    return () => { aktiv.current = false; };
  }, [status]);

  const senden = async () => {
    const t = frage.trim();
    if (!t) { setFehler(HILFE_TEXTE.fehlerLeer); return; }
    if ([...t].length > HILFE_FRAGE_MAX) { setFehler(HILFE_TEXTE.fehlerLang); return; }
    setFehler(null); setZustand("laedt");
    try {
      const r = await fragen(t);
      if (!aktiv.current) return;
      if (r.status === 200 && r.daten && r.daten.ok) { setErgebnis(r.daten); setZustand("fertig"); return; }
      setZustand("leer");
      setFehler(r.status === 429 ? HILFE_TEXTE.fehlerZuViele : (r.daten && typeof r.daten.text === "string" && r.status === 400 ? r.daten.text : HILFE_TEXTE.fehlerAllgemein));
    } catch {
      if (aktiv.current) { setZustand("leer"); setFehler(HILFE_TEXTE.fehlerAllgemein); }
    }
  };
  return <HilfeFrageAnsicht modus={modus} frage={frage} setFrage={setFrage} zustand={zustand} ergebnis={ergebnis} fehler={fehler} onSenden={senden} />;
}
