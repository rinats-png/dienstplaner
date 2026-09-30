import React, { useEffect, useRef } from "react";
import { C } from "../farben.js";
import { Icon } from "./icons.jsx";

/* ==========================================================================
   BAUSTEINE — kleine Teile des Leitstand-Stils

   Alles hier ist Darstellung. Keine Zahl wird berechnet, die nicht schon
   berechnet hereinkommt: Ein Mikro-Diagramm ist Illustration, die Zahl daneben
   ist die Wahrheit (Master-Prompt, Teil J). Deshalb verlangen die Diagramme
   eine Beschriftung in Worten — sie ist das, was eine Vorlesesoftware liest
   und was bleibt, wenn man die Farben nicht unterscheiden kann.

   Farben nur über C (farben.js), damit Hell und Dunkel von allein stimmen.
   ========================================================================== */

const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };
/** Tonname → Vordergrundfarbe. Unbekannt oder leer: der Akzent. */
const tonFarbe = (ton) => ({ ok: C.ok, warn: C.warn, danger: C.danger, accent: C.accent, violet: C.violet,
  neutral: C.dim, text: C.text }[ton] || C.accent);

/* ------------------------------- Pille ---------------------------------- */
/** Tönung plus Wort, kein Rand. Die Klassen stehen in bauStyles (.pille-…).
 *  `tone` ist der bisherige Name des Arguments (App.jsx ruft die Pille überall
 *  so auf); beide gelten, `ton` gewinnt. Vorher las die Pille nur `ton` — jeder
 *  Aufruf mit `tone` wurde dadurch neutral. */
export function Pille({ children, ton, tone, size, style }) {
  const wahl = ton !== undefined ? ton : tone;
  const t = ["neutral", "ok", "warn", "danger", "accent", "violet"].includes(wahl) ? wahl : "neutral";
  return <span className={`pille pille-${t}${size === "sm" ? " pille-sm" : ""}`} style={style}>{children}</span>;
}

/** Trendpille: Pfeil und Text. Nur zeigen, wenn beide Zeiträume vorliegen. */
export function Trend({ ton = "neutral", richtung = "gleich", children }) {
  const wort = { auf: "gestiegen", ab: "gesunken", gleich: "unverändert" }[richtung] || "";
  const drehung = { auf: -45, ab: 45, gleich: 0 }[richtung] || 0;
  return (
    <Pille ton={ton} size="sm">
      <Icon n="pfeil-rechts" size={12} strokeWidth={2} style={{ transform: `rotate(${drehung}deg)` }} />
      <span className="nurLeser">{wort} </span>{children}
    </Pille>);
}

/* ----------------------------- Sparkline -------------------------------- */
/**
 * Mikro-Diagramm ohne Achsen.
 *
 * @param {number[]|string[]} p.daten   art "linie" und "saeulen": Zahlen; art "punkte": "ok" | "warn" | "danger" | sonst leer
 * @param {"linie"|"saeulen"|"punkte"} [p.art]
 * @param {number} [p.hoehe]            Pixel, Vorgabe 40
 * @param {string} p.beschriftung       in Worten, z. B. „Besetzungsgrad der letzten 12 Wochen, zuletzt 97 %"
 * @param {number} [p.hervor]           art "saeulen": so viele letzte Säulen in Akzentfarbe
 */
export function Sparkline({ daten, art = "linie", hoehe = 40, beschriftung, hervor = 3, ton = "accent" }) {
  const a11y = beschriftung ? { role: "img", "aria-label": beschriftung } : { "aria-hidden": "true" };
  if (!Array.isArray(daten) || daten.length === 0) return null;

  if (art === "punkte") {
    const farbe = (d) => (d === "ok" ? C.ok : d === "warn" ? C.warn : d === "danger" ? C.danger : C.steuer);
    return (
      <div {...a11y} style={{ display: "flex", flexWrap: "wrap", gap: 3, alignContent: "flex-end", minHeight: hoehe }}>
        {daten.map((d, i) => <span key={i} style={{ width: 4, height: 4, borderRadius: 1, background: farbe(d) }} />)}
      </div>);
  }

  const zahlen = daten.map(Number).filter((x) => Number.isFinite(x));
  if (zahlen.length === 0) return null;
  const min = Math.min(...zahlen), max = Math.max(...zahlen), spanne = max - min || 1;

  if (art === "saeulen") {
    return (
      <div {...a11y} style={{ display: "flex", alignItems: "flex-end", gap: 3, height: hoehe }}>
        {zahlen.map((z, i) => {
          const h = 10 + ((z - min) / spanne) * 90;
          const neu = i >= zahlen.length - hervor;
          return <span key={i} style={{ flex: "1 1 0", minWidth: 3, maxWidth: 6, height: `${h}%`, borderRadius: 2,
            background: neu ? tonFarbe(ton) : C.lineStark }} />;
        })}
      </div>);
  }

  /* Linie mit Fläche. viewBox 100 breit, gestreckt; non-scaling-stroke hält
     den Strich dünn. Der Endpunkt ist ein HTML-Punkt, weil ein Kreis im
     gestreckten SVG zur Ellipse würde. */
  if (zahlen.length < 2) return null;
  const rand = 4;
  const y = (z) => rand + (1 - (z - min) / spanne) * (hoehe - 2 * rand);
  const x = (i) => (i / (zahlen.length - 1)) * 100;
  const punkte = zahlen.map((z, i) => `${x(i).toFixed(2)},${y(z).toFixed(2)}`).join(" ");
  const letzte = zahlen[zahlen.length - 1];
  return (
    <div {...a11y} style={{ position: "relative", height: hoehe, paddingRight: 4 }}>
      <svg viewBox={`0 0 100 ${hoehe}`} preserveAspectRatio="none" width="100%" height={hoehe}
        style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        <polygon points={`0,${hoehe} ${punkte} 100,${hoehe}`} fill={C.accentLight} />
        <polyline points={punkte} fill="none" stroke={tonFarbe(ton)} strokeWidth="1.8" strokeLinejoin="round"
          strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ position: "absolute", right: 0, top: y(letzte) - 4, width: 8, height: 8, borderRadius: "50%",
        background: tonFarbe(ton), boxShadow: `0 0 0 1.5px ${C.flaeche}` }} />
    </div>);
}

/* ------------------------------- Bogen ---------------------------------- */
/**
 * Halbkreis mit Segmenten von links nach rechts.
 *
 * Die Segmentfarben tragen nie allein: Die Zahl steht in der Mitte als Text,
 * und die Legende darunter nennt jedes Segment mit Worten.
 *
 * @param {{wert:number, ton?:"ok"|"warn"|"danger", label?:string}[]} p.segmente
 * @param {string} p.zahl        Text in der Mitte, z. B. „94 %"
 * @param {string} [p.kopf]      kleine Zeile über der Zahl
 * @param {string} p.beschriftung Zusammenfassung in Worten
 */
export function Bogen({ segmente, zahl, kopf, beschriftung, breite = 196 }) {
  const R = 72, SW = 13, CX = 98, CY = 98;
  const gesamt = (segmente || []).reduce((a, s) => a + Math.max(0, s.wert || 0), 0);
  const farbe = (t) => (t === "ok" ? C.ok : t === "warn" ? C.warn : t === "danger" ? C.danger : C.lineStark);
  const pfad = `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  let start = 0;
  const teile = gesamt > 0 ? segmente.filter((s) => s.wert > 0).map((s) => {
    const laenge = (s.wert / gesamt) * 100;
    const t = { ...s, start, laenge };
    start += laenge;
    return t;
  }) : [];
  const luecke = teile.length > 1 ? 1 : 0;
  return (
    <div role="group" aria-label={beschriftung}>
      <div style={{ position: "relative", width: breite, maxWidth: "100%", aspectRatio: "196 / 112", margin: "0 auto" }}>
        <svg viewBox="0 0 196 112" width="100%" height="100%" style={{ display: "block" }} aria-hidden="true">
          <path d={pfad} pathLength="100" fill="none" stroke={C.flaecheStill} strokeWidth={SW} />
          {teile.map((t, i) => (
            <path key={i} d={pfad} pathLength="100" fill="none" stroke={farbe(t.ton)} strokeWidth={SW}
              strokeDasharray={`${Math.max(0, t.laenge - luecke)} 100`}
              strokeDashoffset={-(t.start + luecke / 2)} />))}
          {teile.length > 0 && <circle cx={CX - R} cy={CY} r={SW / 2} fill={farbe(teile[0].ton)} />}
          {teile.length > 0 && <circle cx={CX + R} cy={CY} r={SW / 2} fill={farbe(teile[teile.length - 1].ton)} />}
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "6%", textAlign: "center" }}>
          {kopf && <div style={{ fontSize: 11, color: C.aus, marginBottom: 1 }}>{kopf}</div>}
          <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.03em", lineHeight: 1.1, ...NUM }}>{zahl}</div>
        </div>
      </div>
      {teile.some((t) => t.label) && (
        <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexWrap: "wrap",
          gap: "4px 14px", justifyContent: "center", fontSize: 12, color: C.dim }}>
          {teile.filter((t) => t.label).map((t, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: farbe(t.ton) }} />
              {t.label}
            </li>))}
        </ul>)}
    </div>);
}

/* ----------------------------- Fortschritt ------------------------------ */
/** Balken 6 px in Listen, 8 px in Karten. `wert` in Prozent. */
export function Fortschritt({ wert, hoehe = 6, ton = "accent", label }) {
  const w = Math.max(0, Math.min(100, Number(wert) || 0));
  return (
    <div className="fortschritt" role="progressbar" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(w)} aria-label={label} style={{ height: hoehe }}>
      <i style={{ width: `${w}%`, background: tonFarbe(ton) }} />
    </div>);
}

/* ----------------------------- Checkliste ------------------------------- */
/**
 * @param {{text:string, erledigt?:boolean, rechts?:string, onClick?:Function}[]} p.punkte
 * Offen ist ein Kreis in `steuer` (≥ 3:1), erledigt ein Haken in `ok` und
 * durchgestrichener Text. Der Zustand steht zusätzlich als Wort im Text.
 */
export function Checkliste({ punkte }) {
  return (
    <ul className="checkliste">
      {punkte.map((p, i) => {
        const inhalt = (<>
          <span aria-hidden="true" style={{ color: p.erledigt ? C.ok : C.steuer, display: "flex" }}>
            <Icon n={p.erledigt ? "kreis-haken" : "kreis-leer"} size={18} /></span>
          <span className="text">{p.text}</span>
          <span className="rechts">{p.rechts || <span className="nurLeser">{p.erledigt ? "erledigt" : "offen"}</span>}</span>
        </>);
        return (
          <li key={i} className={p.erledigt ? "erledigt" : ""}>
            {p.onClick
              ? <button type="button" onClick={p.onClick} className="menue-punkt" style={{ padding: 0, minHeight: 0 }}>{inhalt}</button>
              : inhalt}
          </li>);
      })}
    </ul>);
}

/* ---------------------------- Erklärkasten ------------------------------ */
/** Hinweis in Ruhe: eingelassene Fläche, Info-Icon, Text in `dim`. */
export function Erklaerkasten({ children, titel, style }) {
  return (
    <div className="erklaerkasten" role="note" style={style}>
      <span className="icon" aria-hidden="true"><Icon n="info" size={18} /></span>
      <div style={{ minWidth: 0 }}>
        {titel && <div style={{ fontWeight: 620, color: C.text, marginBottom: 2 }}>{titel}</div>}
        {children}
      </div>
    </div>);
}

/* -------------------------------- Menü ---------------------------------- */
const FOKUSSIERBAR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
  + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Popover unter einem Auslöser. Der Aufrufer legt einen Umschlag mit
 * `position: relative` um Auslöser und Menü.
 *
 * Tastatur: Der Fokus wandert beim Öffnen hinein und bleibt darin (Tab
 * läuft im Kreis), Escape schließt und gibt ihn dem Auslöser zurück, ein
 * Klick daneben schließt. Bei rolle="menu" bewegen die Pfeiltasten (Auf,
 * Ab, Pos1, Ende) zwischen den Einträgen mit role="menuitem".
 *
 * @param {boolean} p.offen
 * @param {Function} p.onSchliessen
 * @param {React.RefObject} p.ausloeser Knopf, der das Menü öffnet
 * @param {string} p.label Name für Vorlesesoftware
 * @param {"dialog"|"menu"} [p.rolle]
 * @param {"rechts"|"links"} [p.ausrichtung] an welcher Kante des Auslösers
 */
export function Menue({ offen, onSchliessen, ausloeser, label, rolle = "dialog", ausrichtung = "rechts", breite = 320, children }) {
  const feld = useRef(null);

  useEffect(() => {
    if (!offen) return undefined;
    const knoten = feld.current;
    if (!knoten) return undefined;
    const liste = () => Array.from(knoten.querySelectorAll(FOKUSSIERBAR)).filter((e) => e.offsetParent !== null);
    const ersteMarke = knoten.querySelector('[role="menuitem"]') || liste()[0];
    (ersteMarke || knoten).focus();

    const zumAusloeser = () => { const a = ausloeser && ausloeser.current; if (a) a.focus(); };
    const escape = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onSchliessen();
      zumAusloeser();
    };
    const aussen = (e) => {
      const a = ausloeser && ausloeser.current;
      if (knoten.contains(e.target) || (a && a.contains(e.target))) return;
      onSchliessen();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("mousedown", aussen);
    document.addEventListener("touchstart", aussen, { passive: true });
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("mousedown", aussen);
      document.removeEventListener("touchstart", aussen);
    };
  }, [offen, onSchliessen, ausloeser]);

  if (!offen) return null;

  const taste = (e) => {
    const knoten = feld.current;
    if (!knoten) return;
    const alle = Array.from(knoten.querySelectorAll(FOKUSSIERBAR)).filter((x) => x.offsetParent !== null);
    if (e.key === "Tab" && alle.length) {
      const erste = alle[0], letzte = alle[alle.length - 1];
      if (e.shiftKey && document.activeElement === erste) { e.preventDefault(); letzte.focus(); }
      else if (!e.shiftKey && document.activeElement === letzte) { e.preventDefault(); erste.focus(); }
      return;
    }
    if (rolle !== "menu") return;
    const punkte = Array.from(knoten.querySelectorAll('[role="menuitem"]')).filter((x) => x.offsetParent !== null);
    const i = punkte.indexOf(document.activeElement);
    let neu = null;
    if (e.key === "ArrowDown") neu = punkte[(i + 1) % punkte.length];
    else if (e.key === "ArrowUp") neu = punkte[(i - 1 + punkte.length) % punkte.length];
    else if (e.key === "Home") neu = punkte[0];
    else if (e.key === "End") neu = punkte[punkte.length - 1];
    if (neu) { e.preventDefault(); neu.focus(); }
  };

  return (
    <div ref={feld} className={`menue ${ausrichtung}`} role={rolle} aria-label={label} tabIndex={-1}
      onKeyDown={taste} style={{ width: breite }}>
      {children}
    </div>);
}
