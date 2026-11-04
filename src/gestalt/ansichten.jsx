import { C } from "../farben.js";
import { Icon } from "./icons.jsx";
import { Pille, Fortschritt, Trend } from "./bausteine.jsx";

/* ==========================================================================
   ANSICHTEN — gemeinsame Teile der Übersichts- und Entscheidungsansichten

   Alles hier ist Darstellung. Die Zahlen, die hereinkommen, sind schon
   gerechnet (regelwerk, ppugv, ppprl, fahrzeit …); nichts wird hier
   nachgerechnet, geraten oder ergänzt. Fehlt ein Wert, fehlt die Stelle —
   kein Strich, kein Platzhalter (Master-Prompt, Teil J).

   Das Grundmuster der Entwürfe:

     Kennzahlen      eine Reihe einzelner Karten, je mit Farbpunkt, Zahl, Zeile
     Leitraster      links die Arbeitsfläche, rechts die erklärenden Karten
     Seitenkarte     Karte mit Überschrift für die rechte Spalte
     Hinweisband     der Befund in Worten vor den Zahlen
     Balkenzeile     Name, Zahl, Balken — für Verteilungen in Seitenkarten

   Farben nur über C oder var(--c-…), damit Hell und Dunkel von allein stimmen.
   Die Klassen dazu stehen in stil.js (Abschnitt 5).
   ========================================================================== */

export const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };

/** Tonname → Farbe. Unbekannt: neutral (Rand), damit nie eine Farbe „erfunden" wird. */
export const tonFarbe = (ton) => ({ ok: C.ok, warn: C.warn, danger: C.danger, accent: C.accent,
  violet: C.violet, text: C.text }[ton] || C.steuer);

/** Ein kleines Quadrat in der Statusfarbe. Trägt nie allein: Der Text steht daneben. */
export const Punkt = ({ ton, gross }) => (
  <span aria-hidden="true" className={`punkt${gross ? " gross" : ""}`} style={{ background: tonFarbe(ton) }} />);

/* ----------------------------- Kennzahlen ------------------------------- */
/**
 * Eine Reihe einzelner Kennzahlkarten.
 *
 * @param {{label:string, wert:any, einheit?:string, sub?:any, ton?:string,
 *          hervor?:"warn"|"danger", bild?:any, trend?:{text:string, ton?:string, richtung?:string},
 *          onClick?:Function}[]} p.kacheln  Falsche Einträge (null, false) fallen weg.
 * @param {number} [p.min] Mindestbreite einer Karte
 *
 * `ton` färbt nur den Punkt vor dem Namen; die Zahl bleibt in Textfarbe. Die
 * Aussage trägt das Wort in `sub`. `hervor` färbt den Rand — für die eine oder
 * zwei Karten, bei denen etwas zu tun ist.
 */
export function Kennzahlen({ kacheln, min = 200, style }) {
  const liste = (kacheln || []).filter(Boolean);
  return (
    <div className="kachelreihe" style={{ "--kmin": `${min}px`, ...style }}>
      {liste.map((k, i) => {
        const inhalt = (<>
          <div className="kachel-kopf">
            {k.ton && <Punkt ton={k.ton} />}
            <span>{k.label}</span>
            {k.rechts}
          </div>
          <div className="kachel-wert">
            <span className="zahl" style={NUM}>{k.wert}</span>
            {k.einheit && <span className="einheit">{k.einheit}</span>}
            {k.trend && k.trend.text
              && <Trend ton={k.trend.ton} richtung={k.trend.richtung}>{k.trend.text}</Trend>}
          </div>
          {k.sub && <div className="kachel-sub">{k.sub}</div>}
          {k.bild && <div className="kachel-bild">{k.bild}</div>}
        </>);
        const kl = `karte kachel${k.hervor ? ` hervor-${k.hervor}` : ""}${k.onClick ? " karte-hover klickbar" : ""}`;
        return k.onClick
          ? <button key={k.label || i} type="button" className={kl} onClick={k.onClick}>{inhalt}</button>
          : <div key={k.label || i} className={kl}>{inhalt}</div>;
      })}
    </div>);
}

/* ------------------------------ Leitraster ------------------------------ */
/** Links die Arbeitsfläche, rechts die Seitenkarten; unter 1100 px untereinander. */
export function Leitraster({ haupt, seite, seiteBreite = 360, style }) {
  return (
    <div className="leitraster" style={{ "--seite": `${seiteBreite}px`,
      ...(seite ? {} : { gridTemplateColumns: "minmax(0,1fr)" }), ...style }}>
      <div className="haupt">{haupt}</div>
      {seite && <div className="seite">{seite}</div>}
    </div>);
}

/* ----------------------------- Seitenkarte ------------------------------ */
/** Karte mit Überschrift, für schmale Spalten. `still`: eingelassene Fläche (E1). */
export function Seitenkarte({ titel, sub, rechts, children, still, style, className = "" }) {
  return (
    <section className={`${still ? "karte-still" : "karte"} seitenkarte ${className}`} style={style}>
      {(titel || rechts) && (
        <div className="skopf">
          <div style={{ minWidth: 0 }}>
            {titel && <h2 className="stitel">{titel}</h2>}
            {sub && <div className="ssub">{sub}</div>}
          </div>
          {rechts}
        </div>)}
      {children}
    </section>);
}

/* ----------------------------- Hinweisband ------------------------------ */
/**
 * Der Befund in Worten, bevor die erste Zahl kommt. Randstreifen und Icon in
 * der Statusfarbe, die Fläche bleibt Karte; das Wort steht im Titel.
 */
export function Hinweisband({ ton = "warn", icon, titel, children, aktion, style, role }) {
  const sym = icon || (ton === "ok" ? "kreis-haken" : ton === "accent" || ton === "violet" ? "info" : "warnung");
  return (
    <div className="karte hinweisband" role={role} style={{ borderLeftColor: tonFarbe(ton), ...style }}>
      <span className="sym" aria-hidden="true" style={{ color: tonFarbe(ton) }}><Icon n={sym} size={20} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {titel && <div className="titel">{titel}</div>}
        {children && <div className="text">{children}</div>}
      </div>
      {aktion}
    </div>);
}

/* ----------------------------- Balkenzeile ------------------------------ */
/**
 * Name links, Zahl rechts, darunter ein Balken. Für Verteilungen („nach Art
 * der Änderung", „Kategorien", „Rückblick").
 * @param {number} p.anteil 0–100
 */
export function Balkenzeile({ label, wert, anteil, ton = "accent", sub, punkt }) {
  return (
    <div className="balkenzeile">
      <div className="kopf">
        <span className="name">{punkt && <Punkt ton={punkt === true ? ton : punkt} />}{label}</span>
        <span className="wert" style={NUM}>{wert}</span>
      </div>
      <Fortschritt wert={anteil} ton={ton} hoehe={6} label={typeof label === "string" ? label : undefined} />
      {sub && <div className="sub">{sub}</div>}
    </div>);
}

/* ------------------------------- Legende -------------------------------- */
/** Zeile mit Farbpunkt, Wort und Erklärung. Die Farbe trägt nie allein. */
export function Legende({ punkte, style }) {
  return (
    <ul className="legende" style={style}>
      {punkte.map((p, i) => (
        <li key={i}>
          <Punkt ton={p.ton} />
          <b style={{ color: p.farbig === false ? C.text : tonFarbe(p.ton) }}>{p.label}</b>
          {p.text && <span>{p.text}</span>}
        </li>))}
    </ul>);
}

/* ------------------------------ Namenschip ------------------------------ */
/** Person als Pille mit rundem Namenszeichen davor. */
export function Namenschip({ avatar, children, rechts, title }) {
  return (
    <span className="namenschip" title={title}>
      {avatar}
      <span className="n">{children}</span>
      {rechts}
    </span>);
}

/* --------------------------- Zahl und Beschriftung ---------------------- */
/** Große Zahl mit Wort darunter — für Karten, die eine Aussage tragen. */
export function Grosszahl({ wert, einheit, label, ton }) {
  return (
    <div className="grosszahl">
      <div>
        <span className="zahl" style={{ ...NUM, color: ton ? tonFarbe(ton) : C.text }}>{wert}</span>
        {einheit && <span className="einheit">{einheit}</span>}
      </div>
      {label && <div className="label">{label}</div>}
    </div>);
}

/* ---------------------------- Nummerierte Schritte ---------------------- */
/** „So läuft es": Kreis mit Zahl, Titel, Satz. */
export function Ablaufschritte({ schritte }) {
  return (
    <ol className="schritte">
      {schritte.map((s, i) => (
        <li key={i}>
          <span className={`nr${s.hell ? " hell" : ""}`} aria-hidden="true">{i + 1}</span>
          <div>
            <div className="t">{s.titel}</div>
            {s.text && <div className="x">{s.text}</div>}
          </div>
        </li>))}
    </ol>);
}

/** Dünne Trennlinie mit Abschnittstitel links und Zusatz rechts. */
export function Abschnittskopf({ titel, sub, rechts, style }) {
  return (
    <div className="abschnittskopf" style={style}>
      <div style={{ minWidth: 0 }}>
        <h2>{titel}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {rechts && <div className="rechts">{rechts}</div>}
    </div>);
}

/* ------------------------------- Zeitwahl ------------------------------- */
/**
 * Zurück, Heute, Weiter als eine Pillengruppe — die Monats- und Wochenwahl der
 * Arbeitsebene. Die Beschriftungen bleiben die der einzelnen Knöpfe davor
 * („Zurück", „Heute", „Weiter"), damit Vorlesesoftware und Prüfungen dasselbe
 * finden. `mitte` ist ein Text zwischen den Pfeilen (z. B. „September 2026").
 */
export function Zeitwahl({ onZurueck, onWeiter, onHeute, mitte, zurueck = "Zurück", weiter = "Weiter", heute = "Heute", style }) {
  return (
    <div className="zeitwahl noprint" role="group" aria-label="Zeitraum wechseln" style={style}>
      <button type="button" onClick={onZurueck} aria-label={zurueck}><Icon n="chevron-links" size={16} /></button>
      {mitte && <span className="mitte">{mitte}</span>}
      {onHeute && <button type="button" onClick={onHeute}>{heute}</button>}
      <button type="button" onClick={onWeiter} aria-label={weiter}><Icon n="chevron-rechts" size={16} /></button>
    </div>);
}

/* ------------------------------ Statuszeile ----------------------------- */
/** Schmale eingelassene Zeile über einer Arbeitsfläche: Zustand in Worten, ggf. mit Balken. */
export function Statuszeile({ children, style, className = "" }) {
  return <div className={`statuszeile noprint ${className}`} style={style}>{children}</div>;
}

/* ------------------------------ Fehlerband ------------------------------ */
/** Meldung im Formular: Tönung und Wort, ohne Rand; wird vorgelesen (role="alert"). */
export function Fehlerband({ children, style }) {
  return <div className="fehlerband" role="alert" style={style}>{children}</div>;
}

export { Pille };
