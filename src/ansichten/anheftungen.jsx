/* Anheften sichtbar und bedienbar (WP-I7 Teil 6, Stufe B; Betreiberentscheidung 27.11.: Zustand nachvollziehbar und sichtbar).
   Lesen: welche Einteilungen des Monats angeheftet sind und welche durch eine manuelle Änderung nicht mehr angeheftet sind
   (Vermerk der Karte `angeheftet`, server/lib/anheften.mjs). Eine unlesbare Karte wird genannt, nie still weggelassen. Die Karte
   bekommen nur Planung und Leitung (sicht.mjs); ohne Karte, ohne Einträge und ohne Recht zeigt die Leiste nichts.
   Bedienen (Stufe 1 der Planer-Oberfläche): Leitung und Planung heften eine Einteilung an, lösen sie oder heften erneut an. Die Rechte
   zeigt planerRechte (src/lib/planer-oberflaeche.js, dieselben Tabellen wie der Server); entschieden wird am Server. Erfolg meldet die
   Ansicht erst, wenn der Server es bestätigt hat (src/lib/planer-aktionen.js); Fehler stehen als Warnung da. */
import { useState } from "react";
import { anheftungenLesen, ANGEHEFTET_FELD } from "../../server/lib/engine/anheften.mjs";
import { Card, Lab, Btn, Sel, Field, Feldfehler } from "../ui/bausteine.jsx";
import { fKurz } from "../lib/datum.js";
import { planerRechte, tageImMonat, einteilungZumAnheften } from "../lib/planer-oberflaeche.js";
import * as SP from "../speicher.js";

const ROLLE = { leitung: "Leitung", planer: "Planung", kunde: "Kundenrolle" };

export const ANHEFTEN_TEXTE = Object.freeze({
  titel: "Angeheftete Einteilungen (der Planer ändert sie nicht)",
  unlesbar: "Die Anheftungen des Betriebs sind nicht lesbar. Der Planer rechnet nicht, bis die Leitung sie neu setzt. Anheften und Lösen sind hier solange nicht möglich.",
  leer: "Im Moment ist keine Einteilung dieses Monats angeheftet.",
  anheften: "Einteilung anheften",
  hinweis: "Die gewählte Einteilung (Dienst oder frei) wird festgehalten; eine Einteilung aus der Schichtfolge wird dabei als eigene Einteilung eingetragen. Ändert jemand sie manuell, löst sich nur diese Anheftung.",
  person: "Person",
  tag: "Tag",
  personWahl: "Person wählen",
  tagWahl: "Tag wählen",
  loesen: "Lösen",
  erneut: "Erneut anheften",
  speichern: "Wird gespeichert …",
});

/**
 * Anheftungen eines Monats für die Anzeige.
 * @param {any} m Betrieb @param {string} ym JJJJ-MM
 * @returns {{ unlesbar: boolean, aktiv: { schluessel: string, personId: string, tag: string }[], aufgehoben: { schluessel: string, personId: string, tag: string, am: string, rolle: string }[] }}
 */
export function anheftungenImMonat(m, ym) {
  const l = anheftungenLesen(m);
  if (!l.ok) return { unlesbar: true, aktiv: [], aufgehoben: [] };
  const karte = m && m[ANGEHEFTET_FELD] && typeof m[ANGEHEFTET_FELD] === "object" ? m[ANGEHEFTET_FELD] : {};
  const teile = (s) => { const i = s.lastIndexOf("|"); return { schluessel: s, personId: s.slice(0, i), tag: s.slice(i + 1) }; };
  const imMonat = (s) => s.slice(-10, -3) === ym;
  return {
    unlesbar: false,
    aktiv: [...l.aktiv].filter(imMonat).sort().map(teile),
    aufgehoben: [...l.aufgehoben].filter(imMonat).sort().map((s) => ({ ...teile(s), am: String(karte[s].aufgehobenAm).slice(0, 10),
      rolle: ROLLE[karte[s].aufgehobenVonRolle] || "andere Rolle" })),
  };
}

/** Nur die Darstellung (Eigenschaften statt Zustand, damit sie ohne Browser prüfbar ist). */
export function AnheftungenAnsicht({ m, ym, darfBedienen = false, status = null, beschaeftigt = false,
  personId = "", tag = "", onPerson = () => {}, onTag = () => {}, onAnheften = () => {}, onLoesen = () => {} }) {
  const T = ANHEFTEN_TEXTE;
  const a = anheftungenImMonat(m, ym);
  if (!a.unlesbar && !a.aktiv.length && !a.aufgehoben.length && !darfBedienen && !status) return null;
  const personen = (m.personen || []).map((p) => ({ id: String(p.id), name: `${p.vorname || ""} ${p.nachname || ""}`.trim() || "Person" }))
    .sort((x, y) => x.name.localeCompare(y.name, "de"));
  const name = (pid) => { const p = personen.find((x) => x.id === pid); return p ? p.name : "Person"; };
  const bedienbar = darfBedienen && !a.unlesbar;
  /* Welche Einteilung würde erneut angeheftet? Der Wert steht auf dem Knopf (Dienstname oder „frei“). */
  const wertText = (pid, t) => { const e = einteilungZumAnheften(m, pid, t); if (!e.ok) return null;
    if (e.wert === "-") return "frei"; const d = (m.dienstarten || []).find((x) => String(x.id) === e.wert); return d && d.name ? d.name : e.wert; };
  return (
    <Card still data-testid="anheftungen">
      <Lab>{T.titel}</Lab>
      {a.unlesbar && <p role="alert">{T.unlesbar}</p>}
      {a.aktiv.length > 0 && <ul>
        {a.aktiv.map((x) => <li key={x.schluessel}>{fKurz(x.tag)} · {name(x.personId)}: angeheftet
          {bedienbar && <>{" "}<Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={() => onLoesen(x.schluessel)}
            aria-label={`${T.loesen}: ${name(x.personId)}, ${fKurz(x.tag)}`}>{T.loesen}</Btn></>}</li>)}
      </ul>}
      {a.aufgehoben.length > 0 && <ul>
        {a.aufgehoben.map((x) => <li key={x.schluessel}>{fKurz(x.tag)} · {name(x.personId)}: nicht mehr angeheftet — manuell geändert am {fKurz(x.am)} ({x.rolle})
          {bedienbar && wertText(x.personId, x.tag) !== null && <>{" "}<Btn size="sm" kind="quiet" disabled={beschaeftigt} onClick={() => onAnheften(x.personId, x.tag)}
            aria-label={`${T.erneut}: ${wertText(x.personId, x.tag)} — ${name(x.personId)}, ${fKurz(x.tag)}`}>{T.erneut}: {wertText(x.personId, x.tag)}</Btn></>}</li>)}
      </ul>}
      {!a.unlesbar && !a.aktiv.length && !a.aufgehoben.length && <p>{T.leer}</p>}
      {bedienbar && (
        <details>
          <summary>{T.anheften}</summary>
          <p>{T.hinweis}</p>
          <Field label={T.person}>
            <Sel value={personId} onChange={(ev) => onPerson(ev.target.value)}>
              <option value="">{T.personWahl}</option>
              {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Sel>
          </Field>
          <Field label={T.tag}>
            <Sel value={tag} onChange={(ev) => onTag(ev.target.value)}>
              <option value="">{T.tagWahl}</option>
              {tageImMonat(ym).map((d) => <option key={d} value={d}>{fKurz(d)}</option>)}
            </Sel>
          </Field>
          <Btn kind="primary" disabled={beschaeftigt || !personId || !tag} onClick={() => onAnheften(personId, tag)}>{T.anheften}</Btn>
        </details>)}
      {beschaeftigt && <p role="status">{T.speichern}</p>}
      {status && (status.ok ? <p role="status">{status.text}</p> : <Feldfehler text={status.text} />)}
    </Card>
  );
}

/** Die Leiste im Monatsplan: Zustand für Auswahl, Rückmeldung und laufendes Speichern. */
export function Anheftungen({ m, ym, sitz, akt }) {
  const [personId, setPersonId] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const demo = !!sitz && (sitz.demo === true || (SP.zugangsdaten() || {}).demo === true);
  const darfBedienen = !!sitz && !!akt && planerRechte(sitz, { demo }).anheften;
  const ausfuehren = async (fn) => {
    if (beschaeftigt || !darfBedienen) return;
    setBeschaeftigt(true); setStatus(null);
    try { setStatus(await fn()); } catch { setStatus({ ok: false, text: "Die Änderung konnte nicht gespeichert werden." }); } finally { setBeschaeftigt(false); }
  };
  return <AnheftungenAnsicht m={m} ym={ym} darfBedienen={darfBedienen} status={status} beschaeftigt={beschaeftigt}
    personId={personId} tag={tag} onPerson={setPersonId} onTag={setTag}
    onAnheften={(p, t) => ausfuehren(() => akt.anheftenEinteilung(p, t))} onLoesen={(s) => ausfuehren(() => akt.loeseAnheftung(s))} />;
}
