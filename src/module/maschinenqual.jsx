/* ==========================================================================
   MASCHINENQUALIFIKATIONEN — Matrix Person × Anlage und Listen (WP-19, Strang C; WP-19.11)

   Liest die bestehenden Kompetenzen und Nachweise; schreibt nichts. Stände in
   Worten, nicht nur in Farbe. Je Rolle die Ansicht, die sie sehen darf
   (server/lib/modul-maschinenqual.mjs, matrixAnsicht): Planung und Leitung alle
   Personen, Beschäftigte und Schichtverantwortung die eigene Zeile, der
   Betriebsrat Zahlen ohne Personen (Gruppen unter 3 als „<3“), sonst nichts.
   Gerechnet wird nur aus dem, was die Rolle ohnehin ausgeliefert bekommt.

   Mobil (360 px): Karten je Person, ohne Querscrollen. Ab 640 px dieselben
   Daten als Tabelle. Beide stehen im Dokument; ein kleiner Stilblock blendet
   die jeweils andere aus. Eingehängt wird die Ansicht, wenn das Modul
   „vorläufig" ist (server/lib/branchenmodule.mjs) und das Registrieren in
   src/module/index.js (WP-19.0) vorliegt.
   ========================================================================== */
import {
  matrixAnsicht, befaehigtePersonenListe, ablaufListe, intervallHinweise, maschinenqualAuskunft,
} from "../../server/lib/modul-maschinenqual.mjs";

const WORT = { gueltig: "gültig", laeuft_ab: "läuft ab", abgelaufen: "abgelaufen", fehlt: "fehlt", unbekannt: "nicht bewertbar" };
const datumKurz = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
const kasten = { border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" };
const STIL = `.mq-karten{display:grid;gap:10px}.mq-tabelle{display:none}@media (min-width:640px){.mq-karten{display:none}.mq-tabelle{display:block}}`;

function zelle(c) {
  if (!c) return "nicht hinterlegt";
  const bis = c.bis && c.stand !== "fehlt" ? ` (bis ${datumKurz(c.bis)}${c.stand === "laeuft_ab" && typeof c.tage === "number" ? `, noch ${c.tage} Tage` : ""})` : "";
  return `${WORT[c.stand] || c.stand}${bis}`;
}

/**
 * @param {{ m: any, datum: string, stand: (k: any, n: any, d: string) => { stand: string, bis?: string|null, tage?: number|null },
 *   rolle?: string, ich?: any }} props
 *   Ohne `rolle` gilt die Ansicht der Planung (die Daten selbst begrenzt der Server je Rolle).
 */
export function QualifikationsMatrix({ m, datum, stand, rolle = "planer", ich }) {
  const a = matrixAnsicht(m, datum, stand, { rolle, ich });
  if (a.art === "keine") return <p>Für deine Rolle gibt es keine Ansicht der Qualifikationen.</p>;
  if (!a.anlagen.length) return <p>Noch keine Anlagen erfasst.</p>;
  if (a.art === "aggregat")
    return (
      <section aria-label="Qualifikationen je Anlage in Zahlen" style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
        <p style={{ margin: 0 }}>Anzahl der Personen je Stand und Anlage am {datumKurz(datum)}. Gruppen unter 3 Personen werden nicht ausgewiesen („&lt;3“); es gibt keine Namen.</p>
        {a.anlagen.map((x) => (
          <article key={x.id} style={kasten}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{x.name}</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "2px 12px", margin: "6px 0 0" }}>
              <dt>Personen mit Qualifikationsangabe</dt><dd style={{ margin: 0 }}>{x.personen}</dd>
              <dt>gültig</dt><dd style={{ margin: 0 }}>{x.gueltig}</dd>
              <dt>läuft ab</dt><dd style={{ margin: 0 }}>{x.laeuftAb}</dd>
              <dt>abgelaufen</dt><dd style={{ margin: 0 }}>{x.abgelaufen}</dd>
              <dt>fehlt</dt><dd style={{ margin: 0 }}>{x.fehlt}</dd>
            </dl>
          </article>))}
      </section>);
  const titel = a.art === "eigen" ? "Meine Qualifikationen" : "Qualifikationen je Anlage";
  if (!a.zeilen.length) return <p>{titel}: Für dich liegen keine Angaben vor.</p>;
  return (
    <section aria-label={`${titel} am ${datumKurz(datum)}`} style={{ maxWidth: "100%" }}>
      <style>{STIL}</style>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{titel} am {datumKurz(datum)}</h3>
      <div className="mq-karten" role="list">
        {a.zeilen.map((z) => (
          <article key={z.personId} role="listitem" style={kasten}>
            <h4 style={{ margin: 0, fontSize: 15 }}>{z.name}</h4>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {a.anlagen.map((x) => <li key={x.id}>{x.name}: {zelle(z.zellen[x.id])}</li>)}
            </ul>
          </article>))}
      </div>
      <div className="mq-tabelle" style={{ maxWidth: "100%", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <caption style={{ textAlign: "left", paddingBottom: 6 }}>{titel} am {datumKurz(datum)}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left", padding: "4px 8px" }}>Person</th>
              {a.anlagen.map((x) => <th key={x.id} scope="col" style={{ textAlign: "left", padding: "4px 8px" }}>{x.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {a.zeilen.map((z) => (
              <tr key={z.personId}>
                <th scope="row" style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>{z.name}</th>
                {a.anlagen.map((x) => <td key={x.id} style={{ padding: "4px 8px" }}>{zelle(z.zellen[x.id])}</td>)}
              </tr>))}
          </tbody>
        </table>
      </div>
    </section>);
}

/** Wer bald oder schon nicht mehr gültig unterwiesen ist — Hinweis für die Planung, keine Sperre. */
export function AblaufHinweise({ m, datum, stand }) {
  const l = ablaufListe(m, datum, stand);
  if (!l.length) return <p>Keine Unterweisung läuft in den nächsten Wochen ab und keine ist abgelaufen.</p>;
  return (
    <section aria-label="Ablauf der Unterweisungen" style={{ maxWidth: "100%" }}>
      <p style={{ margin: "0 0 6px" }}>Hinweis für die Planung (keine Sperre):</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {l.map((x) => (
          <li key={`${x.personId}|${x.anlageId}`} style={{ overflowWrap: "anywhere" }}>
            {x.name}, {x.anlageName}: {x.stand === "abgelaufen" ? `abgelaufen seit ${datumKurz(x.bis || "")}` : `läuft ab am ${datumKurz(x.bis || "")}${typeof x.tage === "number" ? ` (in ${x.tage} Tagen)` : ""}`}
          </li>))}
      </ul>
    </section>);
}

/** Personen mit „zur Prüfung befähigter Person“ je Anlage — mit Grundlage oder „nicht belegt“. */
export function BefaehigtePersonen({ m, datum, stand }) {
  const l = befaehigtePersonenListe(m, datum, stand);
  if (!l.length) return <p>Keine befähigten Personen erfasst.</p>;
  return (
    <section aria-label="Zur Prüfung befähigte Personen" style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {l.map((x) => (
        <article key={`${x.personId}|${x.kompetenzId}`} style={kasten}>
          <h4 style={{ margin: 0, fontSize: 15 }}>{x.name} — {x.anlageName}</h4>
          <p style={{ margin: "6px 0 0" }}>Stand: {WORT[x.stand] || x.stand}{x.bis ? ` (bis ${datumKurz(x.bis)})` : ""}</p>
          <p style={{ margin: "4px 0 0" }}>{x.belegt ? `Qualifikationsgrundlage: ${x.grundlage}` : "Grundlage nicht belegt"}</p>
        </article>))}
      <p style={{ margin: 0, fontSize: 13 }}>Die Angabe ist eine Dokumentation des Betriebs. Ob eine Person die Voraussetzungen erfüllt, prüft der Betrieb selbst (§ 2 Abs. 6 BetrSichV, TRBS 1203 — zu prüfen).</p>
    </section>);
}

/** Intervalle über dem Referenzwert und die Herkunft des Wertes. */
export function IntervallHinweise({ m, heute }) {
  const l = intervallHinweise(m, heute);
  const a = maschinenqualAuskunft(m, heute);
  return (
    <section aria-label="Unterweisungsintervall" style={{ display: "grid", gap: 8, maxWidth: "100%" }}>
      {l.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {l.map((x) => <li key={x.kompetenzId}>{x.name}: {x.wert} Monate. {x.hinweis}</li>)}
        </ul>)}
      <details>
        <summary>Woher kommt das Intervall?</summary>
        <p style={{ margin: "6px 0" }}>{a.bezeichnung} ({a.regelId}): {a.wert} {a.einheit} — {a.herkunft === "ausgangswert" ? "Ausgangswert" : "Wert des Betriebs"},
          {" "}Prüfstatus: {a.geprueft ? "geprüft (Quelle und Fundstelle hinterlegt)" : "vorläufig, zu prüfen"}.</p>
        {a.quelle && <p style={{ margin: "6px 0" }}>Quelle: {a.quelle}{a.fundstelle ? `, Fundstelle: ${a.fundstelle}` : ""}{a.version ? `, Stand: ${a.version}` : ""}.</p>}
        <p style={{ margin: "6px 0" }}>{a.hinweis} Fachnachweis {a.fachnachweis}. Höchste Stufe: Hinweis.</p>
      </details>
    </section>);
}
