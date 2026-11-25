/* ==========================================================================
   POSTEN — Übersicht, Einteilung und Pflege (WP-19.1)

   PostenUebersicht (Ort „tag"): je Objekt die Posten mit Soll, Ist und
   Fehlbestand in Worten; bei Alleinarbeit mit nur einer Person ein Hinweis
   (ohne Namen, ohne Zusage eines Notsignals). Mit `schreibe` (nur Leitung und
   Planung, zugriff.js) kommt je Person im Dienst ein Auswahlfeld für den
   Posten dazu — eine Einteilung verrät, wo eine Person ist: Die Felder stehen
   nur dort, wo die Namen ohnehin sichtbar sind, und der Server prüft jeden
   Schreibweg noch einmal.

   PostenPflege (Ort „betrieb"): Objekte und Posten pflegen — Name, Soll je
   Dienstart, verlangte Qualifikationen, Alleinarbeit mit Verweis auf die
   Gefährdungsbeurteilung — und die Posten-Dienstarten des Bestands als
   Vorschlag übernehmen. Gearbeitet wird an einem Entwurf; erst „Änderungen
   übernehmen" schreibt (und nur, wenn pruefeObjekte nichts beanstandet).

   Beides hängt im Modulkern (index.js) und erscheint nur, wenn das Modul im
   Betrieb wirkt (server/lib/branchenmodule.mjs). Keine feste Breite (360 px).
   ========================================================================== */
import { useState } from "react";
import {
  postenLage, pruefeObjekte, einteilungSetzen, objektHinzufuegen, postenHinzufuegen, postenAendern, sollSetzen,
  objektEntfernen, postenEntfernen, objekteAusDienstarten, postenIndex, POSTEN_GRENZEN,
} from "../../server/lib/modul-posten.mjs";

const RAHMEN = { border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere" };
const FELD = { display: "grid", gap: 4, maxWidth: "100%" };
const EINGABE = { maxWidth: "100%", boxSizing: "border-box", width: "100%" };
const ZEILE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

const personName = (p) => `${(p && p.vorname) || ""} ${(p && p.nachname) || ""}`.trim() || "?";

/** @param {{ m: any, datum: string, dienstId: string, personenImDienst: any[], schreibe?: ((feld: string, wert: any) => void) | null }} props */
export function PostenUebersicht({ m, datum, dienstId, personenImDienst, schreibe = null }) {
  const [fehler, setFehler] = useState("");
  const objekte = Array.isArray(m && m.objekte) ? m.objekte : [];
  if (!objekte.length) return <p>Noch keine Objekte erfasst.</p>;
  const lage = postenLage(m, datum, dienstId, personenImDienst);
  const nach = new Map(lage.map((x) => [x.posten, x]));
  const name = (id) => {
    const p = (personenImDienst || []).find((x) => x.id === id);
    return p ? personName(p) : "?";
  };
  const alle = [...postenIndex(m).values()];
  const plan = m && m.postenPlan && typeof m.postenPlan === "object" ? m.postenPlan : {};
  const waehle = (person, wert) => {
    const r = einteilungSetzen(m, person.id, datum, wert);
    if ("grund" in r) { setFehler(r.grund); return; }
    setFehler("");
    schreibe("postenPlan", r.plan);
  };
  return (
    <section aria-label={`Posten am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {objekte.map((o) => (
        <article key={o.id} style={{ ...RAHMEN }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{o.name}</h3>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {(o.posten || []).map((p) => {
              const x = nach.get(p.id);
              return (
                <li key={p.id}>
                  <strong>{p.name}</strong>{": "}
                  {x
                    ? <>{x.ist.length} von {x.soll} besetzt{x.fehlt > 0 ? ` — es fehlt ${x.fehlt === 1 ? "eine Person" : `${x.fehlt} Personen`}` : ""}
                      {x.ist.length > 0 && <> ({x.ist.map(name).join(", ")})</>}
                      {x.alleinarbeitHinweis && <p role="note" style={{ margin: "4px 0 0" }}><strong>{x.alleinarbeitHinweis}</strong></p>}</>
                    : "kein Soll in diesem Dienst"}
                </li>);
            })}
          </ul>
        </article>))}
      {schreibe && (personenImDienst || []).length > 0 && (
        <div style={{ ...RAHMEN, display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Einteilung am {datum}</h3>
          {(personenImDienst || []).map((p) => {
            const aktuell = plan[`${p.id}|${datum}`];
            const bekannt = alle.some((e) => e.posten.id === aktuell);
            return (
              <label key={p.id} style={FELD}>{personName(p)}
                <select aria-label={`Posten für ${personName(p)} am ${datum}`} style={EINGABE}
                  value={aktuell === undefined ? "" : aktuell} onChange={(e) => waehle(p, e.target.value)}>
                  <option value="">— kein Posten —</option>
                  {aktuell !== undefined && !bekannt && <option value={aktuell}>unbekannter Posten</option>}
                  {alle.map((e) => <option key={e.posten.id} value={e.posten.id}>{e.objekt.name}: {e.posten.name}</option>)}
                </select></label>);
          })}
          {fehler && <p role="alert" style={{ margin: 0 }}>{fehler}</p>}
        </div>)}
    </section>);
}

/** Posten eines Entwurfs bearbeiten. */
function PostenFeld({ objekt, posten, dienstarten, qualifikationen, setze, entferne }) {
  const a = (patch) => setze(patch);
  const quals = Array.isArray(posten.qualifikationen) ? posten.qualifikationen : [];
  return (
    <fieldset style={{ ...RAHMEN, display: "grid", gap: 8, margin: 0 }}>
      <legend>Posten {posten.name}</legend>
      <label style={FELD}>Name des Postens
        <input value={posten.name} maxLength={POSTEN_GRENZEN.textMax} style={EINGABE} onChange={(e) => a({ name: e.target.value })} /></label>
      {dienstarten.map((d) => (
        <label key={d.id} style={FELD}>Soll im Dienst {d.name || d.id}
          <input type="number" min={0} max={POSTEN_GRENZEN.sollMax} step={1} style={EINGABE}
            value={posten.soll && posten.soll[d.id] !== undefined ? posten.soll[d.id] : ""}
            onChange={(e) => a({ soll: sollSetzen(posten.soll, d.id, e.target.value === "" ? undefined : Number(e.target.value)) })} /></label>))}
      {qualifikationen.length > 0 && (
        <fieldset style={{ margin: 0, display: "grid", gap: 4 }}>
          <legend>Verlangte Qualifikationen</legend>
          {qualifikationen.map((q) => (
            <label key={q.id} style={ZEILE}>
              <input type="checkbox" checked={quals.includes(q.id)}
                onChange={(e) => a({ qualifikationen: e.target.checked ? [...quals, q.id] : quals.filter((x) => x !== q.id) })} />
              <span>{q.name || q.id}</span></label>))}
        </fieldset>)}
      <label style={ZEILE}>
        <input type="checkbox" checked={posten.alleinarbeit === true} onChange={(e) => a({ alleinarbeit: e.target.checked })} />
        <span>Alleinarbeitsposten (eine Person allein)</span></label>
      {posten.alleinarbeit === true && (
        <label style={FELD}>Verweis auf die Gefährdungsbeurteilung (Dokument oder Nummer, keine Namen)
          <input value={posten.gefaehrdungsbeurteilung || ""} maxLength={POSTEN_GRENZEN.textMax} style={EINGABE}
            onChange={(e) => a({ gefaehrdungsbeurteilung: e.target.value })} /></label>)}
      <div><button type="button" onClick={() => entferne(objekt.id, posten.id)}>Posten {posten.name} entfernen</button></div>
    </fieldset>);
}

/** @param {{ m: any, schreibe?: ((feld: string, wert: any) => void) | null }} props */
export function PostenPflege({ m, schreibe = null }) {
  const gespeichert = Array.isArray(m && m.objekte) ? m.objekte : [];
  const [entwurf, setEntwurf] = useState(gespeichert);
  const [meldung, setMeldung] = useState("");
  if (!schreibe) return <p>Objekte und Posten pflegt die Leitung oder die Planung.</p>;
  const dienstarten = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((d) => d && d.id && !d.posten);
  const qualifikationen = (Array.isArray(m.qualifikationen) ? m.qualifikationen : []).filter((q) => q && q.id);
  const fehler = pruefeObjekte(entwurf);
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(gespeichert);
  /* Entfernen prüft gegen den gespeicherten Postenplan: ein eingeteilter Posten bleibt, bis die Einteilung gelöst ist. */
  const stand = { objekte: entwurf, postenPlan: m.postenPlan };
  const ersetze = (r) => { if ("grund" in r) setMeldung(r.grund); else { setMeldung(""); setEntwurf(r.objekte); } };
  return (
    <section aria-label="Objekte und Posten pflegen" style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      <p style={{ margin: 0 }}>Objekte und ihre Posten mit Soll je Dienstart. Die Einteilung der Personen auf Posten steht im Tagesbereich.
        Fehlende Besetzung oder Qualifikation sind Hinweise, keine Sperre.</p>
      {entwurf.map((o) => (
        <article key={o.id} style={{ ...RAHMEN, display: "grid", gap: 8 }}>
          <label style={FELD}>Name des Objekts
            <input value={o.name} maxLength={POSTEN_GRENZEN.textMax} style={EINGABE}
              onChange={(e) => setEntwurf(entwurf.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)))} /></label>
          {(o.posten || []).map((p) => (
            <PostenFeld key={p.id} objekt={o} posten={p} dienstarten={dienstarten} qualifikationen={qualifikationen}
              setze={(patch) => setEntwurf(postenAendern(entwurf, o.id, p.id, patch))}
              entferne={(oid, pid) => ersetze(postenEntfernen(stand, pid))} />))}
          <div style={ZEILE}>
            <button type="button" onClick={() => setEntwurf(postenHinzufuegen(entwurf, o.id, ""))}>Posten hinzufügen</button>
            <button type="button" onClick={() => ersetze(objektEntfernen(stand, o.id))}>Objekt {o.name} entfernen</button>
          </div>
        </article>))}
      <div style={ZEILE}>
        <button type="button" onClick={() => setEntwurf(objektHinzufuegen(entwurf, ""))}>Objekt hinzufügen</button>
        <button type="button" onClick={() => {
          const r = objekteAusDienstarten({ dienstarten: m.dienstarten, objekte: entwurf });
          setEntwurf(r.objekte);
          setMeldung(r.neu ? `${r.neu} Posten aus den Posten-Dienstarten vorgeschlagen — bitte prüfen und übernehmen.` : "Keine neuen Posten-Dienstarten zum Übernehmen.");
        }}>Aus den Posten-Dienstarten vorschlagen</button>
      </div>
      {(meldung || fehler) && <p role="alert" style={{ margin: 0 }}>{fehler || meldung}</p>}
      <div style={ZEILE}>
        <button type="button" disabled={!geaendert || !!fehler} onClick={() => { schreibe("objekte", entwurf); setMeldung("Übernommen — wird gespeichert."); }}>Änderungen übernehmen</button>
        <button type="button" disabled={!geaendert} onClick={() => { setEntwurf(gespeichert); setMeldung(""); }}>Verwerfen</button>
      </div>
    </section>);
}
