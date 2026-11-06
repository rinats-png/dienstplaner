/* Darstellende Grundbausteine (aus src/App.jsx herausgelöst, WP-39; Text unverändert).
   Palette C und Darstellungsmodus kommen aus denselben Quellen wie in App.jsx (farben.js, ui/thema.js). */
import React, { useId } from "react";
import { C, avatarToene } from "../farben.js";
import { Icon } from "../gestalt/icons.jsx";
import { Pille, Trend } from "../gestalt/bausteine.jsx";
import { lesbar, NUM } from "./thema.js";

/** Einheitlicher Leerzustand — mit Symbol, Erklärung und optionalem Weg. */
export const Leer = ({ titel, text, symbol = "kreis-leer", aktion }) => (
  <div style={{ padding: "56px 28px", textAlign: "center" }}>
    <div style={{ width: 46, height: 46, borderRadius: 14, margin: "0 auto 16px", display: "flex",
      alignItems: "center", justifyContent: "center", background: C.flaecheStill, color: C.dim }}>
      <Icon n={symbol} size={22} /></div>
    <div style={{ fontSize: 15.5, fontWeight: 620, marginBottom: 7 }}>{titel}</div>
    {text && <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, maxWidth: 380,
      margin: "0 auto" }}>{text}</div>}
    {aktion && <div style={{ marginTop: 20 }}>{aktion}</div>}
  </div>);

/** Ladezustand als Platzhalterstreifen — ruhiger als ein Kreisel. */
export const Laden = ({ zeilen = 5, text }) => (
  <div style={{ padding: 20 }} aria-busy="true" aria-live="polite">
    {text && <div style={{ fontSize: 13, color: C.dim, marginBottom: 14 }}>{text}</div>}
    {Array.from({ length: zeilen }, (_, i) => (
      <div key={i} style={{ height: 14, borderRadius: 5, marginBottom: 10,
        width: `${100 - (i % 3) * 14}%`, background: C.bg,
        animation: "pulsieren 1.4s ease-in-out infinite", animationDelay: `${i * .08}s` }} />))}
  </div>);

/** Fehlerhinweis am Feld statt irgendwo im Formular. */
export const Feldfehler = ({ text }) => text ? (
  <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 6,
    fontSize: 12.5, color: C.danger, lineHeight: 1.45 }}>
    <span aria-hidden="true" style={{ fontWeight: 700 }}>!</span><span>{text}</span>
  </div>) : null;

/* ==========================================================================
   UI-BAUSTEINE
   ========================================================================== */

/**
 * Ein Element, das keine Schaltfläche ist, aber wie eine funktioniert.
 *
 * Die Anwendung hat rund vierzig davon: Planzellen, Zeilen einer Liste,
 * Karten der Telefonansicht. Mit der Maus einwandfrei — mit der Tastatur
 * unerreichbar, und für eine Vorlesesoftware unsichtbar, weil ein `div`
 * nichts darüber sagt, dass man es drücken kann.
 *
 * Ein echtes `<button>` wäre der saubere Weg, scheitert aber an der
 * Gestaltung: Die Zellen tragen Raster, Seitenverhältnisse und
 * Verschachtelungen, die ein Knopf nicht mitmacht. Deshalb die
 * Ersatzteile, die dieselbe Wirkung haben: Rolle, Fokus, Leer- und
 * Eingabetaste.
 *
 * @param {Function} onClick was beim Drücken geschieht
 * @param {string} [label] Beschriftung für Vorlesesoftware, wenn der
 *   sichtbare Inhalt allein nicht trägt (etwa eine Zahl in einer Zelle)
 */
export function klickbar(onClick, label) {
  if (!onClick) return {};
  return {
    onClick,
    role: "button",
    tabIndex: 0,
    ...(label ? { "aria-label": label } : {}),
    onKeyDown: (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      /* Manche dieser Flächen tragen ein eigenes Bedienelement in sich — ein
         Kästchen in der Antragsliste, eine Schaltfläche auf einer Karte.
         Tastendrücke steigen auf: Ohne diese Abfrage schluckte die Zeile die
         Leertaste, und das Kästchen ließe sich nicht mehr mit der Tastatur
         setzen. Wer das nächstgelegene bedienbare Element ist, entscheidet. */
      const eigen = e.target.closest
        && e.target.closest("button, a[href], input, select, textarea, [tabindex]");
      if (eigen && eigen !== e.currentTarget) return;
      /* Die Leertaste rollt sonst die Seite weiter, während man drückt. */
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    },
  };
}

/** `still`: eingelassene Fläche (E1) statt Karte — Hinweiskasten, Einsatzfläche. */
export const Card = ({ children, style, hover, glanz, still, className = "", ...p }) => (
  <div {...p} className={`${still ? "karte-still" : "karte"} ${hover ? "karte-hover" : ""} ${className}`}
    style={style}>{children}</div>);
export const CardHead = ({ children, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
    padding: "18px 24px", borderBottom: `1px solid ${C.lineSoft}` }}>
    <div style={{ fontSize: 15.5, fontWeight: 620, letterSpacing: "-.015em" }}>{children}</div>{right}
  </div>);
export const Lab = ({ children, style }) => (<div style={{ fontSize: 12, fontWeight: 500, color: C.dim, ...style }}>{children}</div>);
export const Rubrik = ({ children, style }) => (<div className="rubrik" style={style}>{children}</div>);
export const Schalter = ({ an, onChange, label }) => (
  <button type="button" className={`schalter${an ? " on" : ""}`} onClick={() => onChange(!an)}
    role="switch" aria-checked={!!an} aria-label={label}><i /></button>);
export const Haken = ({ punkte }) => (
  <ul className="hakenliste">{punkte.map((p, i) => <li key={i}>{p}</li>)}</ul>);
export const Fussleiste = ({ children }) => <div className="fussleiste noprint">{children}</div>;
/**
 * Filterleiste sitzt unmittelbar über der Tabelle, nicht in der Kopfzeile —
 * dort wird gesucht, und dort erwartet man die Bedienelemente.
 */
export const Filterleiste = ({ suche, setSuche, platzhalter = "Suchen …", label, children, rechts }) => (
  <div className="filterleiste noprint">
    {setSuche && (
      <div className="suchfeld">
        <span className="lupe"><Icon n="suche" size={16} /></span>
        {/* Ein Platzhalter verschwindet, sobald etwas im Feld steht — er
            ist deshalb keine Beschriftung (WCAG 3.3.2). Beides zu setzen
            kostet nichts und trägt auch dann noch. */}
        <input className="inp" value={suche} placeholder={platzhalter} aria-label={label || platzhalter}
          onChange={(e) => setSuche(e.target.value)} />
      </div>)}
    {children}
    {rechts && <div style={{ marginLeft: "auto", display: "flex", gap: 9, alignItems: "center",
      flexWrap: "wrap" }}>{rechts}</div>}
  </div>);
/** Verdichtete Planzelle: Dienst und Person in einem Block statt zwei Zeilen. */
export const Planzelle = ({ da, unten, aktiv, ausfall, onClick, title }) => {
  /* Die leere Zelle trägt keinen Text. Ohne eigene Beschriftung meldet eine
     Vorlesesoftware nur „Schaltfläche" und lässt offen, wofür. */
  if (!da) return (
    <div {...klickbar(onClick, title || "Freie Zelle besetzen")} title={title} className="planzelle"
      style={{ background: C.bg, cursor: onClick ? "pointer" : "default", minHeight: 34 }} />);
  return (
    <div {...klickbar(onClick, title || `${da.name}${unten ? ` · ${unten}` : ""}`)}
      title={title || `${da.name}${unten ? ` · ${unten}` : ""}`} className="planzelle"
      style={{ background: `${da.farbe}1C`, color: lesbar(da.farbe, 5.4), cursor: onClick ? "pointer" : "default",
        minHeight: 34, outline: aktiv ? `2px solid ${C.accent}` : "none",
        textDecoration: ausfall ? "line-through" : "none", opacity: ausfall ? .5 : 1 }}>
      <div className="oben">{da.kurz}</div>
      {unten && <div className="unten">{unten}</div>}
    </div>);
};
/**
 * Namenszeichen statt Foto. Echte Bilder hätten wir nicht, und ein grauer
 * Platzhalterkopf für jede Person sieht nach unfertiger Software aus.
 * Die Farbe leitet sich vom Namen ab — dieselbe Person bekommt immer
 * dieselbe, ohne dass etwas gespeichert werden muss.
 */
export const Avatar = ({ person, size, style }) => {
  const n = `${person.vorname || ""} ${person.nachname || ""}`.trim();
  const kuerzel = ((person.vorname || " ")[0] + (person.nachname || " ")[0]).toUpperCase();
  let summe = 0; for (let i = 0; i < n.length; i++) summe = (summe * 31 + n.charCodeAt(i)) % 997;
  const toene = avatarToene();
  const [flaeche, farbe] = toene[summe % toene.length];
  return (
    <span className={`avatar${size === "sm" ? " avatar-sm" : ""}`} aria-hidden="true"
      style={{ background: flaeche, color: farbe, ...style }}>{kuerzel}</span>);
};

export const Btn = ({ children, kind = "plain", size, onClick, disabled, style, title, className = "", ...rest }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={title} {...rest}
    className={`btn btn-${kind}${size === "sm" ? " btn-sm" : ""} ${className}`} style={style}>
    {children}</button>);

export const Inp = (p) => <input {...p} className={`inp ${p.className || ""}`} />;
export const Sel = ({ children, ...p }) => <select {...p} className={`sel ${p.className || ""}`}>{children}</select>;

/**
 * Beschriftetes Eingabefeld.
 *
 * Das umschließende label verknüpfte Beschriftung und Feld bereits — daran
 * war nichts falsch. Zwei Dinge fehlten trotzdem:
 *
 * Der Hinweistext stand nur daneben, ohne Verbindung zum Feld. Ein
 * Bildschirmleser las ihn nicht mit, obwohl er oft die eigentliche
 * Erklärung trägt.
 *
 * Und die Verknüpfung war nur mittelbar. Sobald ein Feld in einer
 * Überlagerung landet oder mehrere Bedienelemente in einer Beschriftung
 * stehen, trägt sie nicht mehr. Die ausdrückliche Zuordnung über id hält
 * in beiden Fällen.
 */
export const Field = ({ label, hint, children, style }) => {
  const eigen = useId();
  const istElement = React.isValidElement(children);
  const feldId = istElement ? (children.props.id || eigen) : undefined;
  const hinweisId = hint ? `${eigen}-hinweis` : undefined;
  const feld = istElement
    ? React.cloneElement(children, {
      id: feldId,
      "aria-describedby": [children.props["aria-describedby"], hinweisId]
        .filter(Boolean).join(" ") || undefined,
    })
    : children;
  return (
    <div style={{ display: "block", ...style }}>
      <label htmlFor={feldId} style={{ display: "block", fontSize: 12.5, fontWeight: 600,
        color: C.dim, marginBottom: 6 }}>{label}</label>
      {feld}
      {hint && <span id={hinweisId} style={{ display: "block", fontSize: 12, color: C.dim,
        marginTop: 5, lineHeight: 1.45 }}>{hint}</span>}
    </div>);
};

export const Seg = ({ value, onChange, options }) => (
  <div className="seg" role="tablist">
    {options.map((o) => (
      <button key={o.id} role="tab" aria-selected={value === o.id}
        className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>))}
  </div>);

export const H1 = ({ children, rubrik, sub, right, style }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    gap: 24, flexWrap: "wrap", marginBottom: 32, ...style }}>
    {/* `flex: 1` mit minWidth 0 klang richtig und war es nicht: Die Knöpfe
        rechts tragen flexShrink 0, also gaben sie nicht nach — bei 390
        Pixeln blieb für die Überschrift ein Streifen von sechzig Pixeln, und
        der Untertitel brach Wort für Wort um. Mit einer Mindestbreite als
        Basis rutscht die rechte Gruppe stattdessen in die nächste Zeile. */}
    <div style={{ minWidth: 0, flex: "1 1 300px" }}>
      {rubrik && <Rubrik style={{ marginBottom: 10 }}>{rubrik}</Rubrik>}
      <h1 className="titel">{children}</h1>
      {sub && <p className="untertitel">{sub}</p>}
    </div>
    {/* maxWidth: Die Gruppe schrumpft nicht (flexShrink 0), durfte aber
        bisher breiter werden als die Seite — eine Knopfzeile mit fünf
        Aktionen schob „Meine Schichten" bei 390 px auf 528 bis 822 px.
        Jetzt endet sie am Rand, und was darin umbricht, bricht um. */}
    {right && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      flexShrink: 0, maxWidth: "100%", minWidth: 0 }}>{right}</div>}
  </div>)

/**
 * Kennzahl. `trend` und `bild` sind optional; ohne sie bleibt die Karte, wie
 * sie war.
 *
 * @param {{text:string, ton?:string, richtung?:"auf"|"ab"|"gleich"}} [trend]
 *   Trendpille — nur übergeben, wenn beide Zeiträume vorliegen. Fehlt der
 *   Vergleich, steht dort nichts (kein Strich, kein Platzhalter).
 * @param {React.ReactNode} [bild] Mikro-Diagramm (Sparkline) unter der Zahl;
 *   die Zahl daneben bleibt die Aussage.
 */
export function Kpi({ label, value, unit, tone = "text", sub, trend, bild }) {
  const col = { ok: C.ok, warn: C.warn, danger: C.danger, accent: C.accent, text: C.text }[tone];
  return (<div style={{ padding: "calc(var(--pad-y) + 8px) calc(var(--pad-x) + 4px)" }}>
    <Lab style={{ color: C.aus }}>{label}</Lab>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
      <span style={{ fontSize: 31, fontWeight: 650, letterSpacing: "-.035em", color: col, ...NUM }}>{value}</span>
      {unit && <span style={{ fontSize: 14, color: C.aus, fontWeight: 500 }}>{unit}</span>}
      {trend && trend.text && <Trend ton={trend.ton} richtung={trend.richtung}>{trend.text}</Trend>}
    </div>
    {sub && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    {bild && <div style={{ marginTop: 14 }}>{bild}</div>}
  </div>);
}
export const KpiRow = ({ children, min = 190 }) => (
  <Card style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, overflow: "hidden" }}>{children}</Card>);

/**
 * Zwischenüberschrift für lange Verwaltungsseiten.
 *
 * Die Betriebsseite reihte ein Dutzend gleich gewichteter weißer Karten
 * aneinander — Tarifwerk, Standorte, Stammdaten, Einheiten, Regelwerk,
 * Rechte, Protokoll. Wer sie kennt, findet sich zurecht; wer sie zum
 * ersten Mal sieht, hat keinen Einstieg, weil nichts sagt, was
 * zusammengehört und wo man anfängt.
 *
 * Die Überschrift trennt nicht nur optisch: Sie benennt den Zweck einer
 * Gruppe, damit man ganze Abschnitte überspringen kann, statt jede Karte
 * einzeln zu lesen.
 */
export const Abschnitt = ({ children, sub, erste }) => (
  <div style={{ marginTop: erste ? 0 : 38, marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".09em",
        textTransform: "uppercase", color: C.dim, margin: 0, flexShrink: 0 }}>{children}</h2>
      <span style={{ flex: 1, height: 1, background: C.lineSoft }} />
    </div>
    {sub && <p style={{ fontSize: 13, color: C.dimmer, lineHeight: 1.5,
      margin: "7px 0 0", maxWidth: 680 }}>{sub}</p>}
  </div>);


export const Pill = Pille;
