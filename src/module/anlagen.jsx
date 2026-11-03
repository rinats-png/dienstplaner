/* ==========================================================================
   ANLAGEN — Übersicht, Pflege und Laufzeitkalender (WP-19, Strang C; WP-19.10)

   Zeigt je Anlage, ob sie an einem Tag läuft und welche Mindestbesetzung je
   Dienstart sie verlangt, samt Grundlage. Anlagen ohne Laufzeitkalender
   heißen „nicht bewertbar", nie „läuft" oder „steht".

   Gepflegt wird in AnlagenPflege (Mindestbesetzung, Wochenmuster, Grundlage)
   und LaufzeitKalender (Ausnahmen je Tag). Beide sind gesteuert: Sie rechnen
   nichts selbst, sondern rufen die reinen Funktionen aus modul-anlagen.mjs
   und melden die neue Anlage über `onAendern`. Der Aufrufer speichert (Recht:
   wie Betriebsmittel, Planung und Leitung); der Server prüft die Form erneut
   und antwortet bei einem Fehler mit 422.

   Gestaltung ohne feste Breiten: Raster mit minmax(0, 1fr), Umbruch statt
   Querscrollen (360 px). Zustände stehen in Worten, nicht nur in Farbe.
   Eingehängt wird die Ansicht, wenn das Modul „vorläufig" ist
   (server/lib/branchenmodule.mjs) und das Registrieren in src/module/index.js
   (WP-19.0) vorliegt.
   ========================================================================== */
import {
  istAnlage, anlageLaeuft, ANLAGEN_GRUNDLAGE_ARTEN, ANLAGEN_GRENZEN, grundlageText, laufzeitMonat,
  wochenmusterSetzen, ausnahmeSetzen, ausnahmeEntfernen, anlagenProbleme, anlagenAuskunft,
} from "../../server/lib/modul-anlagen.mjs";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WOCHENTAG_LANG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const ART_WORT = { gefaehrdungsbeurteilung: "Gefährdungsbeurteilung", betriebsanweisung: "Betriebsanweisung",
  betriebsvereinbarung: "Betriebsvereinbarung", sonstige: "Sonstige Grundlage" };
const datumKurz = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const kasten = { border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere" };

/** @param {{ m: any, datum: string }} props */
export function AnlagenUebersicht({ m, datum }) {
  const anlagen = (Array.isArray(m && m.betriebsmittel) ? m.betriebsmittel : []).filter(istAnlage);
  const dienstName = (id) => ((m.dienstarten || []).find((d) => d.id === id) || {}).name || id;
  if (!anlagen.length) return <p>Noch keine Anlagen erfasst. Lege sie als Betriebsmittel der Art „Anlage“ an.</p>;
  return (
    <section aria-label={`Anlagen am ${datum}`} style={{ display: "grid", gap: 10, maxWidth: "100%" }}>
      {anlagen.map((a) => {
        const l = anlageLaeuft(a, datum);
        const besetzung = Object.entries(a.mindestBesetzung || {}).filter(([, n]) => n > 0);
        const grundlage = grundlageText(a.grundlage);
        return (
          <article key={a.id} style={kasten}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{a.name}</h3>
            <p style={{ margin: "6px 0" }}>
              {l.offen ? "Laufzeit nicht hinterlegt — nicht bewertbar" : l.laeuft ? "läuft" : "steht"}
              {!l.offen && a.laufzeit && (
                <span> · {WOCHENTAGE.filter((_, i) => a.laufzeit.wochentage[i]).join(", ") || "kein Wochentag"}</span>)}
            </p>
            {besetzung.length > 0
              ? <ul style={{ margin: 0, paddingLeft: 18 }}>
                {besetzung.map(([d, n]) => <li key={d}>{dienstName(d)}: mindestens {n}</li>)}
              </ul>
              : <p style={{ margin: 0 }}>Keine Mindestbesetzung hinterlegt.</p>}
            <p style={{ margin: "6px 0 0" }}>{grundlage ? `Grundlage: ${grundlage}` : "Grundlage nicht hinterlegt (Vorgabe des Betriebs)"}</p>
          </article>);
      })}
    </section>);
}

/**
 * Pflege einer Anlage: Mindestbesetzung je Dienstart, Wochenmuster, Grundlage.
 * @param {{ anlage: any, dienstarten: { id: string, name?: string }[], onAendern: (a: any) => void, onFehler?: (grund: string) => void }} props
 */
export function AnlagenPflege({ anlage, dienstarten, onAendern, onFehler = () => {} }) {
  const besetzung = anlage.mindestBesetzung || {};
  const wt = anlage.laufzeit && Array.isArray(anlage.laufzeit.wochentage) ? anlage.laufzeit.wochentage : null;
  const g = anlage.grundlage || {};
  const geaendert = (neu) => onAendern(neu);
  const grundlageAendern = (feld, wert) => {
    const neu = { ...g, [feld]: wert };
    if (feld === "datum" && !wert) delete neu.datum;
    geaendert({ ...anlage, grundlage: neu.bezug === undefined && !neu.datum ? null : { art: neu.art || ANLAGEN_GRUNDLAGE_ARTEN[0], ...neu } });
  };
  return (
    <section aria-label={`Anlage ${anlage.name} pflegen`} style={{ display: "grid", gap: 14, maxWidth: "100%" }}>
      <label style={{ display: "grid", gap: 4 }}>Name der Anlage
        <input value={anlage.name || ""} maxLength={60} style={{ width: "100%", boxSizing: "border-box" }}
          onChange={(e) => geaendert({ ...anlage, name: e.target.value })} />
      </label>

      <fieldset style={{ ...kasten, margin: 0 }}>
        <legend>Mindestbesetzung je Dienstart</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {dienstarten.map((d) => (
            <label key={d.id} style={{ display: "grid", gap: 4 }}>{d.name || d.id}
              <input type="number" inputMode="numeric" min={0} max={ANLAGEN_GRENZEN.besetzungMax} value={besetzung[d.id] ?? 0}
                style={{ width: "100%", boxSizing: "border-box" }}
                onChange={(e) => {
                  const n = e.target.value === "" ? 0 : Number(e.target.value);
                  geaendert({ ...anlage, mindestBesetzung: { ...besetzung, [d.id]: n } });
                }} />
            </label>))}
        </div>
      </fieldset>

      <fieldset style={{ ...kasten, margin: 0 }}>
        <legend>Wochenmuster: an welchen Tagen läuft die Anlage?</legend>
        {!wt && <p style={{ margin: "0 0 8px" }}>Laufzeit nicht hinterlegt — die Besetzung ist nicht bewertbar, bis du das Wochenmuster festlegst.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {WOCHENTAGE.map((k, i) => (
            <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 44 }}>
              <input type="checkbox" checked={wt ? wt[i] === true : false}
                onChange={(e) => {
                  const neu = (wt || new Array(7).fill(false)).map((x, j) => (j === i ? e.target.checked : x));
                  const r = wochenmusterSetzen(anlage, neu);
                  if (r.grund) onFehler(r.grund); else geaendert(r.anlage);
                }} />
              {k}
            </label>))}
        </div>
      </fieldset>

      <fieldset style={{ ...kasten, margin: 0 }}>
        <legend>Grundlage der Mindestbesetzung</legend>
        <p style={{ margin: "0 0 8px" }}>Worauf beruht die Vorgabe (etwa die Gefährdungsbeurteilung des Betriebs)? Ohne Eintrag heißt der Hinweis
          „Vorgabe des Betriebs, Grundlage nicht hinterlegt“.</p>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>Art
            <select value={g.art || ""} onChange={(e) => grundlageAendern("art", e.target.value)} style={{ width: "100%", boxSizing: "border-box" }}>
              <option value="" disabled>bitte wählen</option>
              {ANLAGEN_GRUNDLAGE_ARTEN.map((a) => <option key={a} value={a}>{ART_WORT[a]}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>Bezeichnung oder Fundstelle im Dokument
            <input value={g.bezug || ""} maxLength={ANLAGEN_GRENZEN.bezugMax} style={{ width: "100%", boxSizing: "border-box" }}
              onChange={(e) => grundlageAendern("bezug", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>Stand des Dokuments
            <input type="date" value={g.datum || ""} style={{ width: "100%", boxSizing: "border-box" }}
              onChange={(e) => grundlageAendern("datum", e.target.value)} />
          </label>
        </div>
      </fieldset>
    </section>);
}

/**
 * Monatsraster der Laufzeit. Ein Tipp auf einen Tag schaltet: Wochenmuster → Ausnahme (das Gegenteil) → wieder Wochenmuster.
 * @param {{ anlage: any, monat: string, onAusnahme: (datum: string, laeuft: boolean | null) => void }} props
 *   `onAusnahme(datum, null)` heißt: Ausnahme entfernen.
 */
export function LaufzeitKalender({ anlage, monat, onAusnahme }) {
  const { tage } = laufzeitMonat(anlage, monat);
  const [jahr, mm] = monat.split("-").map(Number);
  const versatz = tage.length ? tage[0].wochentag : 0;
  return (
    <section aria-label={`Laufzeitkalender ${anlage.name}`} style={{ maxWidth: "100%" }}>
      <h4 style={{ margin: "0 0 6px", fontSize: 15 }}>{MONATE[mm - 1]} {jahr}</h4>
      <div role="grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
        {WOCHENTAGE.map((k, i) => <div key={k} role="columnheader" aria-label={WOCHENTAG_LANG[i]} style={{ textAlign: "center", fontSize: 12 }}>{k}</div>)}
        {Array.from({ length: versatz }, (_, i) => <div key={`l${i}`} role="gridcell" aria-hidden="true" />)}
        {tage.map((t) => {
          const wort = t.offen ? "nicht bewertbar" : t.laeuft ? "läuft" : "steht";
          const name = `${datumKurz(t.datum)}, ${WOCHENTAG_LANG[t.wochentag]}: ${wort}${t.ausnahme ? " (Ausnahme)" : ""}`;
          return (
            <button key={t.datum} type="button" role="gridcell" aria-label={name} title={name} disabled={t.offen}
              onClick={() => {
                if (t.ausnahme) onAusnahme(t.datum, null);
                else onAusnahme(t.datum, !t.laeuft);
              }}
              style={{ minHeight: 44, padding: 2, display: "grid", justifyItems: "center", fontSize: 13,
                border: t.ausnahme ? "2px solid currentColor" : "1px solid currentColor", borderRadius: 6, background: "transparent", color: "inherit" }}>
              <span>{Number(t.datum.slice(8))}</span>
              <span aria-hidden="true" style={{ fontSize: 11 }}>{t.offen ? "?" : t.laeuft ? "●" : "○"}{t.ausnahme ? "*" : ""}</span>
            </button>);
        })}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13 }}>● läuft · ○ steht · * Ausnahme vom Wochenmuster (ein Tipp setzt die Ausnahme, ein weiterer nimmt sie zurück).
        {tage.some((t) => t.offen) && " Ohne Wochenmuster ist der Kalender nicht bewertbar."}</p>
    </section>);
}

/** Pflegehinweise zu den Anlagen und die Herkunft der Regel — ohne Behauptung, ohne Sperre. */
export function AnlagenHinweise({ m }) {
  const probleme = anlagenProbleme(m);
  const a = anlagenAuskunft();
  return (
    <section aria-label="Hinweise zu den Anlagen" style={{ display: "grid", gap: 8, maxWidth: "100%" }}>
      {probleme.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>{probleme.map((p) => <li key={`${p.anlageId}${p.art}`}>{p.text}</li>)}</ul>)}
      <details>
        <summary>Woher kommt der Hinweis zur Besetzung?</summary>
        <p style={{ margin: "6px 0" }}>{a.bezeichnung} ({a.regelId}, Prüfstatus: {a.pruefstatus === "provisional" ? "vorläufig" : a.pruefstatus}).</p>
        <p style={{ margin: "6px 0" }}>Quelle: {a.quelle}. Fundstelle: {a.fundstelle}.</p>
        <p style={{ margin: "6px 0" }}>{a.hinweis}</p>
      </details>
    </section>);
}

export { ausnahmeSetzen, ausnahmeEntfernen };
