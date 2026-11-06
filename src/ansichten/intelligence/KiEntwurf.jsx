/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — „KI-ENTWURF“ (WP-I17)

   Eigenständige Komponente, in App.jsx nicht eingehängt (Einhängepunkt:
   docs/acc45/wp-i17-nachweis.md). Zeigt die Antwort des Gateways in genau einem
   von fünf Zuständen: leer, laedt, fertig, rueckfall, fehler.

   INVARIANTEN
   O1  Rollensicht: Nur Leitung, Planung und Beschäftigte (für F9) sehen Intelligence-
       Oberflächen. Betriebsrat, Betreiber, Schichtverantwortung, Kunde und jede unbekannte
       Rolle bekommen NICHTS gerendert (kein Platzhalter, kein Hinweis auf die Funktion).
   O2  Jede fertige Antwort trägt sichtbar die Kennzeichnung „KI-Entwurf“ und „Nicht
       veröffentlicht“ — fehlt sie in der Antwort oder ist sie anders, wird nichts angezeigt
       (Zustand fehler). Es gibt keine Schaltfläche „Veröffentlichen“; Übernahme ist Sache des
       aufrufenden Orts (normaler Rechte- und Auditpfad).
   O3  Antworttext wird nur als Text gerendert (React-Escaping; kein dangerouslySetInnerHTML,
       keine Links). Platzhalter {{person:<kennung>}} werden über `aufloesen` aus der Sicht des
       Aufrufers ersetzt, nie aus Antwortdaten; ohne Auflösung steht ein neutraler Text.
   O4  Fehler zeigen einen festen Text je Code, nie Code, Anbieter-, Token- oder Modellangaben.
   O5  Barrierefrei: Statusmeldungen mit role/aria-live, Ladezustand aria-busy, keine
       reine Farbkodierung (alle Hinweise als Text), Farben nur currentColor.
   O6  Kein console.*, kein Netz in dieser Datei.
   ========================================================================== */
import { KI_TEXTE, kiFehlerText } from "./texte.js";
import { antwortLesen } from "./ki-client.js";

export const KI_ROLLEN = Object.freeze(["leitung", "planer", "mitarbeiter"]);
const PLATZHALTER = /\{\{(person|einheit|objekt|dienst):([A-Za-z0-9_.:-]{1,64})\}\}/g;

const kasten = { border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere", maxWidth: "100%" };

/** Text in Stücke: Klartext und aufgelöste Platzhalter (O3). */
export function textTeile(text, aufloesen) {
  const teile = [];
  let letzter = 0;
  for (const m of String(text).matchAll(PLATZHALTER)) {
    if (m.index > letzter) teile.push(text.slice(letzter, m.index));
    let name = null;
    try { name = typeof aufloesen === "function" ? aufloesen(m[1], m[2]) : null; } catch { name = null; }
    teile.push(typeof name === "string" && name.trim() ? name : KI_TEXTE[m[1]]);
    letzter = m.index + m[0].length;
  }
  if (letzter < text.length) teile.push(text.slice(letzter));
  return teile;
}

/**
 * @param {{
 *   rolle: string,
 *   zustand?: "leer"|"laedt"|"fertig"|"rueckfall"|"fehler",
 *   antwort?: any,
 *   fehlercode?: string|null,
 *   aufloesen?: (typ: string, kennung: string) => string|null,
 *   bausteinText?: (id: string, parameter: {name: string, wert: any}[]) => string|null,
 *   titel?: string,
 * }} props
 */
export function KiEntwurf({ rolle, zustand = "leer", antwort, fehlercode = null, aufloesen, bausteinText, titel }) {
  if (!KI_ROLLEN.includes(rolle)) return null;
  const kopf = titel ? <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{titel}</h3> : null;

  if (zustand === "laedt")
    return (
      <section aria-label="Intelligence" aria-busy="true" style={kasten}>
        {kopf}<p role="status" aria-live="polite" style={{ margin: 0 }}>{KI_TEXTE.laedt}</p>
      </section>);

  if (zustand === "rueckfall")
    return (
      <section aria-label="Intelligence" style={kasten}>
        {kopf}<p role="status" aria-live="polite" style={{ margin: 0 }}>{KI_TEXTE.rueckfall}</p>
      </section>);

  if (zustand === "fehler")
    return (
      <section aria-label="Intelligence" style={kasten}>
        {kopf}<p role="alert" style={{ margin: 0 }}>{kiFehlerText(fehlercode)}</p>
      </section>);

  if (zustand !== "fertig")
    return (
      <section aria-label="Intelligence" style={kasten}>
        {kopf}<p style={{ margin: 0 }}>{KI_TEXTE.leer}</p>
      </section>);

  /* fertig: die Antwort wird hier ERNEUT gegen Schema und Kennzeichnung geprüft (O2). */
  const l = antwortLesen(antwort);
  if (l.zustand !== "fertig")
    return (
      <section aria-label="Intelligence" style={kasten}>
        {kopf}<p role="alert" style={{ margin: 0 }}>{KI_TEXTE.unbekannteAntwort}</p>
      </section>);

  const e = l.antwort.ergebnis;
  const text = typeof e.text === "string" && e.text.trim() ? e.text : null;
  const baustein = Array.isArray(e.bausteine) && typeof bausteinText === "function"
    ? e.bausteine.map((b) => { try { return bausteinText(b.id, b.parameter || []); } catch { return null; } }).filter((t) => typeof t === "string" && t.trim())
    : [];
  const leer = !text && baustein.length === 0;

  return (
    <section aria-label="Intelligence" style={kasten}>
      {kopf}
      <p style={{ margin: "0 0 8px" }}>
        <strong>{KI_TEXTE.kennzeichnung}</strong> · <span>{KI_TEXTE.nichtVeroeffentlicht}</span>
      </p>
      {leer && <p style={{ margin: 0 }}>{KI_TEXTE.leer}</p>}
      {text && <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{textTeile(text, aufloesen).map((t, i) => <span key={i}>{t}</span>)}</p>}
      {baustein.length > 0 && <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{baustein.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      <p style={{ margin: 0, fontSize: 13 }}>{KI_TEXTE.hinweis}</p>
    </section>);
}
