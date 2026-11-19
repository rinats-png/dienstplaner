/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { mehrereStandorte, ALLE_STANDORTE, abwArt } from "../lib/fachlogik.js";
import { jeStandort as aufstellungJeStandort } from "../standorte.js";
import { C } from "../farben.js";
import { Sel, Pill, Btn } from "./bausteine.jsx";
import { heute } from "../lib/datum.js";
import { useMemo, useRef, useEffect } from "react";
import { NUM, lesbar } from "./thema.js";
import { zahl } from "../lib/format.js";
import { anzahlWort } from "../lib/rollen.js";
import { Icon } from "../gestalt/icons.jsx";

/** Die Auswahl selbst. Gibt `null` zurück, wenn es nichts zu wählen gibt. */
export function Standortwahl({ m, wert, setWert, breit = 220 }) {
  if (!mehrereStandorte(m)) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ fontSize: 12.5, color: C.dim, whiteSpace: "nowrap" }}>Standort</span>
      <Sel value={wert} onChange={(e) => setWert(e.target.value)} style={{ minWidth: breit }}>
        <option value={ALLE_STANDORTE}>Alle Standorte</option>
        {(m.standorte || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Sel>
    </label>);
}

/**
 * Die Aufstellung über alle Standorte — Personen und Einheiten je Haus.
 *
 * Steht dort, wo „Alle Standorte" gewählt ist: Wer den Überblick behält,
 * soll auch sehen, woraus er besteht. Ein Klick wechselt in den Standort.
 */
export function Standortleiste({ m, wert, setWert }) {
  const d0 = heute();
  const zeilen = useMemo(() => aufstellungJeStandort(m, d0), [m, d0]);
  if (!mehrereStandorte(m)) return null;
  return (
    <div className="noprint" style={{ display: "grid", gap: 10, marginBottom: 20,
      gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
      {zeilen.map((z) => {
        const hier = wert === z.standort.id;
        return (
          <button key={z.standort.id} type="button" className="standortkarte"
            onClick={() => setWert(hier ? ALLE_STANDORTE : z.standort.id)}
            aria-pressed={hier}>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>{z.standort.name}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4, ...NUM }}>
              {z.personen === 1 ? "1 Person" : `${zahl(z.personen)} Personen`}
              {" · "}{anzahlWort(z.einheiten, m.einheitLabel)}
            </div>
          </button>);
      })}
    </div>);
}

/**
 * Vorher → Nachher, mit dem Unterschied daneben.
 *
 * Der Aufbau stammt aus dem Fenster, das den Preissprung beim Anlegen
 * eines Standorts zeigt: alte Zahl klein und blass, neue Zahl groß, die
 * Differenz als eigene Pille. Er hat sich dort bewährt, weil er die
 * Rechnung zeigt statt nur ihr Ergebnis — wer den Sprung nachvollziehen
 * kann, hält ihn nicht für einen Fehler.
 *
 * Herausgezogen, weil dasselbe überall dort gebraucht wird, wo eine
 * Eingabe etwas verändert, das man nicht an der Eingabe sieht: eine
 * Regelgrenze, die die Zahl der Befunde verschiebt; eine Wochenstundenzahl,
 * die das Stundenkonto umschreibt. Bisher zeigte die Oberfläche in solchen
 * Fällen nur das Feld und überließ die Folge der nächsten Prüfung.
 *
 * @param {object}  p
 * @param {string}  p.vorher     Ausgangswert, fertig formatiert
 * @param {string}  p.nachher    neuer Wert, fertig formatiert
 * @param {string} [p.differenz] der Unterschied, fertig formatiert
 * @param {string} [p.ton]       Farbe der Differenzpille
 * @param {string} [p.einheit]   steht klein hinter der neuen Zahl
 */
export function Sprung({ vorher, nachher, differenz, ton = "neutral", einheit, gross = true }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: gross ? 30 : 20, fontWeight: 300, color: C.dimmer, ...NUM }}>{vorher}</span>
      <span style={{ fontSize: gross ? 18 : 14, color: C.dimmer }} aria-label="wird zu"><Icon n="pfeil-rechts" size={gross ? 20 : 16} /></span>
      <span style={{ fontSize: gross ? 34 : 23, fontWeight: 650, ...NUM }}>{nachher}</span>
      {einheit && <span style={{ fontSize: 13.5, color: C.dimmer }}>{einheit}</span>}
      {differenz && <Pill tone={ton}>{differenz}</Pill>}
    </div>);
}

/* Die Pille selbst steht in gestalt/bausteine.jsx; hier der bisherige Name. */
export function Zelle({ da, abw, size = 28, blass }) {
  if (abw) { const m = abwArt(abw.art);
    return <div title={m.label}  style={{ width: size, height: size, borderRadius: Math.round(size * .3),
      display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px dashed ${m.farbe}88`,
      color: lesbar(m.farbe), fontSize: size < 24 ? 10 : 12, fontWeight: 700, ...NUM }}>{m.kurz}</div>; }
  if (!da) return <div style={{ width: size, height: size, borderRadius: Math.round(size * .3),
    background: "rgba(20,20,25,.045)", display: "flex", alignItems: "center", justifyContent: "center",
    color: C.dimmer, fontSize: 13 }}>·</div>;
  return <div title={`${da.name} ${da.start}–${da.ende}`} 
    style={{ width: size, height: size, borderRadius: Math.round(size * .3), display: "flex", alignItems: "center",
      justifyContent: "center", background: blass ? `${da.farbe}18` : `${da.farbe}22`, color: lesbar(da.farbe, 5.4),
      fontSize: size < 24 ? 10 : 12, fontWeight: 700, ...NUM }}>{da.kurz}</div>;
}
export function Balken({ ist, soll, tone }) {
  const pct = Math.min(100, (ist / Math.max(1, soll)) * 100);
  const col = tone === "danger" ? C.danger : tone === "warn" ? C.warn : C.ok;
  return <div style={{ height: 5, background: "rgba(20,20,25,.08)", borderRadius: 3, overflow: "hidden" }}>
    <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width .4s cubic-bezier(.4,0,.2,1)" }} /></div>;
}
/* Welche Blätter gerade offen sind, in der Reihenfolge des Öffnens.
   Escape schließt immer nur das oberste — sonst räumt ein Tastendruck
   gleich zwei Ebenen ab. */
export const blattStapel = [];

export function Sheet({ open, onClose, titel, children, width = 700 }) {
  const blatt = useRef(null);
  const vorher = useRef(null);
  /* onClose steht in einer Ref, nicht in den Abhängigkeiten des Effekts.
     Aufrufer reichen es fast immer als Pfeilfunktion herein — bei jedem
     Rendern eine neue. Hing der Effekt daran, lief er bei jedem Tastendruck
     in einem Feld des Blatts neu: Aufräumen gab den Fokus zurück, der neue
     Lauf setzte ihn auf das erste Element — „Fertig". Wer „Ömer" tippte,
     bekam „Ö". */
  const schliessen = useRef(onClose);
  schliessen.current = onClose;

  /* Fokus führen.

     Vorher blieb der Tastaturfokus hinter dem Blatt: Wer mit der Tastatur
     arbeitet, tabbte durch die verdeckte Seite. Drei Dinge fehlten — Fokus
     beim Öffnen hinein, Fokus darin halten, beim Schließen zurück zum
     auslösenden Element. Escape schließt jetzt ebenfalls. */
  useEffect(() => {
    if (!open) return undefined;
    vorher.current = document.activeElement;
    const knoten = blatt.current;
    if (!knoten) return undefined;

    const fokussierbar = () => Array.from(knoten.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]),'
      + ' select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null);

    const erste = fokussierbar()[0];
    if (erste) erste.focus();
    else knoten.focus();

    /* Escape auch dann, wenn der Fokus nicht im Blatt liegt.

       Der Griff hing bisher am Blatt selbst. Wer daneben klickte — auf den
       abgedunkelten Hintergrund, auf eine Stelle ohne Fokus — hatte den
       Fokus am `body`, und Escape lief ins Leere. Man saß in einem Blatt
       fest, das sich mit der Tastatur nicht mehr schließen ließ.

       Deshalb zusätzlich am Dokument, aber nur für das oberste Blatt. */
    const kennung = {};
    blattStapel.push(kennung);
    const escAmDokument = (e) => {
      if (e.key !== "Escape") return;
      if (blattStapel[blattStapel.length - 1] !== kennung) return;
      if (knoten.contains(document.activeElement)) return;   // erledigt der Griff unten
      e.stopPropagation();
      schliessen.current();
    };
    document.addEventListener("keydown", escAmDokument);

    const taste = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); schliessen.current(); return; }
      if (e.key !== "Tab") return;
      const liste = fokussierbar();
      if (!liste.length) return;
      const ersteE = liste[0], letzteE = liste[liste.length - 1];
      if (e.shiftKey && document.activeElement === ersteE) { e.preventDefault(); letzteE.focus(); }
      else if (!e.shiftKey && document.activeElement === letzteE) { e.preventDefault(); ersteE.focus(); }
    };
    knoten.addEventListener("keydown", taste);
    return () => {
      knoten.removeEventListener("keydown", taste);
      document.removeEventListener("keydown", escAmDokument);
      const i = blattStapel.indexOf(kennung);
      if (i >= 0) blattStapel.splice(i, 1);
      /* Zurück zu dem, was das Blatt geöffnet hat — sonst landet der Fokus
         am Seitenanfang und man sucht sich zurück. */
      const z = vorher.current;
      if (z && typeof z.focus === "function" && document.contains(z)) z.focus();
    };
  }, [open]);

  if (!open) return null;
  return (<div className="sheet-back" onClick={onClose}>
    <div className="blatt" ref={blatt} tabIndex={-1} role="dialog" aria-modal="true"
      aria-label={typeof titel === "string" ? titel : undefined}
      onClick={(e) => e.stopPropagation()} style={{ maxWidth: width }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px",
        borderBottom: `1px solid ${C.lineSoft}` }}>
        <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-.02em" }}>{titel}</div>
        <Btn size="sm" kind="quiet" onClick={onClose}>Fertig</Btn>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div></div>);
}
