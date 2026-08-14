import React, { Component, Fragment, createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ==========================================================================
   MARKE — CENTRIC
   Bildmarke: drei gestapelte Balken, verbunden durch eine durchlaufende
   S-Kurve. Vollständig als Vektor gezeichnet, damit sie in jeder Größe
   scharf bleibt und die Farben aus dem Farbschema kommen.
   ========================================================================== */
const MARKE = {
  dunkel: "#2C4E5C",       // tiefes Teal — trägt die Bildmarke
  dunkelHell: "#3E6478",
  limette: "#7FB2C4",      // helles Teal als Glanzlicht statt Limette
  creme: "#F5F4F2",
};

function Logo({ size = 40, wortmarke = false, hell = false }) {
  const id = useRef(`lg${Math.random().toString(36).slice(2, 8)}`).current;
  const w = size, h = size * (wortmarke ? 1.42 : 1.0);
  const d = hell ? "#FFFFFF" : MARKE.dunkel;
  const dh = hell ? "rgba(255,255,255,.72)" : MARKE.dunkelHell;
  return (
    <svg width={w} height={h} viewBox={`0 0 100 ${wortmarke ? 142 : 100}`} fill="none"
      style={{ display: "block", flexShrink: 0 }} aria-label="CENTRIC">
      <defs>
        {/* Feines Rautennetz auf den dunklen Balken */}
        <pattern id={`${id}n`} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 0 L14 14 M14 0 L0 14 M7 0 L7 14 M0 7 L14 7"
            stroke={hell ? "rgba(0,0,0,.20)" : "rgba(255,255,255,.075)"} strokeWidth=".7" />
        </pattern>
        {/* Weicher Verlauf auf dem oberen Balken, wie in der Vorlage */}
        <linearGradient id={`${id}g`} x1="55%" y1="0%" x2="100%" y2="70%">
          <stop offset="0%" stopColor={d} /><stop offset="100%" stopColor={dh} />
        </linearGradient>
        <clipPath id={`${id}c1`}><rect x="6" y="8" width="88" height="26" rx="13" /></clipPath>
        <clipPath id={`${id}c3`}><rect x="6" y="66" width="88" height="26" rx="13" /></clipPath>
        <clipPath id={`${id}c2`}><rect x="6" y="37" width="88" height="26" rx="13" /></clipPath>
      </defs>

      {/* Oberer Balken */}
      <g clipPath={`url(#${id}c1)`}>
        <rect x="6" y="8" width="88" height="26" rx="13" fill={d} />
        <path d="M52 8 C74 8 66 34 94 34 L94 8 Z" fill={`url(#${id}g)`} />
        <rect x="6" y="8" width="88" height="26" rx="13" fill={`url(#${id}n)`} />
      </g>

      {/* Mittlerer Balken in Limette, mit weicher Schattierung unter der Kurve */}
      <g clipPath={`url(#${id}c2)`}>
        <rect x="6" y="37" width="88" height="26" rx="13" fill={MARKE.limette} />
        <path d="M6 50 C6 43 20 43 28 47 C40 53 52 57 62 51 C72 45 80 41 94 41 L94 63 L6 63 Z"
          fill="rgba(0,0,0,.06)" />
      </g>

      {/* Unterer Balken */}
      <g clipPath={`url(#${id}c3)`}>
        <rect x="6" y="66" width="88" height="26" rx="13" fill={d} />
        <rect x="6" y="66" width="88" height="26" rx="13" fill={`url(#${id}n)`} />
      </g>

      {/* Durchlaufende S-Kurve — verbindet alle drei Balken */}
      <path d="M92 26 C99 30 99 41 90 45 C78 50 62 44 50 47 C38 50 26 58 20 63 C13 69 13 78 20 82"
        stroke={d} strokeWidth="1.9" fill="none" strokeLinecap="round" opacity=".92" />

      {wortmarke && (
        <text x="50" y="126" textAnchor="middle" fill={d}
          style={{ font: `800 20px Inter, -apple-system, system-ui, sans-serif`, letterSpacing: "-.4px" }}>
          CENTRIC
        </text>)}
    </svg>);
}

/* ==========================================================================
   FEHLERAUFFANG
   Ein unbehandelter Fehler zeigt sonst eine weiße Seite ohne Hinweis —
   im Testbetrieb der schlechteste denkbare Zustand.
   ========================================================================== */
class Fehlerauffang extends Component {
  constructor(p) { super(p); this.state = { fehler: null, stelle: null }; }
  static getDerivedStateFromError(fehler) { return { fehler }; }
  componentDidCatch(fehler, info) { this.setState({ stelle: info && info.componentStack }); }
  render() {
    if (!this.state.fehler) return this.props.children;
    const meldung = String(this.state.fehler && this.state.fehler.message || this.state.fehler);
    return (
      <div style={{ minHeight: "100vh", background: MARKE.creme, color: "#111827", fontFamily: FONT,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 620, width: "100%", background: "rgba(255,255,255,.8)",
          border: "1px solid rgba(255,255,255,.9)", borderRadius: 22, padding: 30,
          boxShadow: "0 20px 60px rgba(24,26,30,.14)" }}>
          <div style={{ marginBottom: 18 }}><Logo size={38} /></div>
          <h1 style={{ fontSize: 22, fontWeight: 650, margin: "0 0 10px", letterSpacing: "-.02em" }}>
            Da ist etwas schiefgegangen</h1>
          <p style={{ fontSize: 14.5, color: "#5A5F66", lineHeight: 1.55, margin: "0 0 18px" }}>
            Die Anwendung konnte diese Ansicht nicht darstellen. Deine Daten sind gespeichert und
            gehen nicht verloren. Bitte melde den folgenden Text zusammen mit dem, was du zuletzt
            gemacht hast.
          </p>
          <pre style={{ background: "rgba(20,20,25,.05)", borderRadius: 12, padding: 14, fontSize: 12,
            overflowX: "auto", margin: "0 0 20px", whiteSpace: "pre-wrap" }}>{meldung}</pre>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} className="btn btn-primary">Neu laden</button>
            <button onClick={() => this.setState({ fehler: null, stelle: null })} className="btn btn-plain">
              Zurück versuchen</button>
            <button className="btn btn-quiet" onClick={() => {
              const t = `CENTRIC Fehlerbericht\n${new Date().toLocaleString("de-DE")}\n\n${meldung}\n\n${this.state.stelle || ""}`;
              try { navigator.clipboard.writeText(t); } catch (e) { window.prompt("Text kopieren:", t); }
            }}>Bericht kopieren</button>
          </div>
        </div>
      </div>);
  }
}

/* ==========================================================================
   DATENMODELL — verbindliche Beschreibung
   Kein Ersatz für echte Typprüfung, aber die Stelle, an der nachzulesen ist,
   welche Form ein Objekt hat. Widersprüche zwischen Teilen der Anwendung
   fallen so beim Lesen auf, nicht erst im Betrieb.

   Datenbestand
     { version, stand, tarife[], mandanten[], rechnungen[], protokoll[],
       betreiber{}, session{} }

   Mandant (ein Betrieb)
     id, name, branche, einheitLabel, bundesland, tarif, status, seit,
     stichtag, rabattGrund, kontakt, anschrift, anker (Montag), zyklus{},
     matrix{}, einstellungen{}, standorte[], einheiten[], qualifikationen[],
     dienstarten[], personen[], abwesenheiten[], abweichungen{}, anfragen[],
     protokoll[], freigaben{}, nachrichten[], aenderungen[], erfassung{},
     einspruenge[], zuschlaege[], urlaubsrunde, unterschreitungen[], dienstbuch[]

   Person
     id, vorname, nachname, funktion, email,
     zugehoerigkeit[{ ab, einheitId }]   Versetzungen mit Stichtag
     eintritt, austritt, wochenstunden, urlaubsanspruch, urlaubsuebertrag,
     stundenuebertrag, qualifikationen[],
     teilzeit { aktiv, modus: "quote"|"wochentage", wochentage[] },
     springer (bool), einschraenkungen{}, rolle, rolleSeit, rolleVerlauf[],
     bereich ("ALLE" oder einheitId), status

   Dienstart
     id, name, kurz, start, ende ("HH:MM", Ende < Start bedeutet Folgetag),
     pause (Minuten), farbe, ort, posten (bool), quelle (Dienstart-ID),
     faktor (Anrechnung, 1 = voll), ruhezeitNeutral, rufbereitschaft,
     mindest { mo_do, fr, sa, so }, mindestQual { qualId: Anzahl }

   Abweichung   Schlüssel "personId|JJJJ-MM-TT" → Dienstart-ID oder "-"
   Zyklus       { wochen, tage[wochen*7], vorlage }
   ========================================================================== */
