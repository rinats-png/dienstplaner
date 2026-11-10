import { Component, Fragment, useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as SP from "./speicher.js";

import { MARKIERUNG_TEXT, stempelSchluessel } from "./stempelvorgang.js";


/* Planrechnung und Fachprüfung einer Einteilung — dieselbe Fassung prüft der Server (WP-22). */
import { einheitAm, imDienst } from "../server/lib/fachpruefung.mjs";
import { verknuepfungsZiel, ohneVerknuepfung } from "./verknuepfung.js";
import { migriere, migrationstext } from "./migration.js";
import { addDays } from "./regelwerk.js";




import { csvFeld, csvText } from "./csvfeld.js";
import { v4ThemaMerken, v4ThemaGemerkt, v4SystemthemaBeobachten } from "./v4/thema.js";
import { v4AppStil } from "./v4/app-stil.js";

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
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {/* Die Fehlerseite ersetzt die ganze Anwendung, auch deren Stilblock — ohne ihn wären die Knöpfe unformatiert. */}
        <style>{bauStyles()}</style>
        <div style={{ maxWidth: 620, width: "100%", background: C.flaeche,
          border: `1px solid ${C.line}`, borderRadius: "var(--r-gross)", padding: 30,
          boxShadow: "var(--schatten-blatt)" }}>
          <div style={{ marginBottom: 18 }}><Logo size={38} /></div>
          <h1 style={{ fontSize: 22, fontWeight: 650, margin: "0 0 10px", letterSpacing: "-.02em" }}>
            Da ist etwas schiefgegangen</h1>
          <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, margin: "0 0 18px" }}>
            Die Anwendung konnte diese Ansicht nicht darstellen. Deine Daten sind gespeichert und
            gehen nicht verloren. Bitte melde den folgenden Text zusammen mit dem, was du zuletzt
            gemacht hast.
          </p>
          <pre style={{ background: C.flaecheStill, borderRadius: 12, padding: 14, fontSize: 12,
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
     beschaeftigungsmodell (optional, src/beschaeftigung.js), stundenGrenzeMonat (optional),
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

/* ==========================================================================
   CENTRIC — eine Anwendung, gestaffelte Zugriffstiefe
   Betreiber · Organisationsleitung · Planer · Sub-Planer · Mitarbeiter · Betriebsrat
   Branchenneutral für jeden Betrieb im durchgehenden Schichtbetrieb.
   ========================================================================== */

import { C, C_DUNKEL, C_HELL, alsVariablen } from "./farben.js";
import { Leer, Card, CardHead, Lab, Btn, Inp, Sel, Field, H1, Abschnitt, Pill } from "./ui/bausteine.jsx";
import { istDunkel, dunkelSetzen, lesbar, NUM } from "./ui/thema.js";
import { MON, heute, fKurz } from "./lib/datum.js";
import { eur, uid } from "./lib/format.js";
import { Icon } from "./gestalt/icons.jsx";
import { Erklaerkasten } from "./gestalt/bausteine.jsx";
import { Kopfblock } from "./gestalt/rahmen.jsx";
import { gestaltStil } from "./gestalt/stil.js";
import { geraeteStil, SEITENLEISTE_SCHLIESSEN, SEITENLEISTE_ID, seitenleisteFokus, telefonTauglich } from "./ui/geraete.js";
import { Scrollbereich } from "./ui/scrollbereich.jsx";
import { Rechtliches } from "./rechtstexte.jsx";


import { vertragsstandUebernehmen } from "./paketlogik.js";







/* WP-23: ob der Betrieb die Planfreigabe benutzt und welcher Tag ein Entwurf ist — dieselbe
   Entscheidung wie auf dem Server (server/lib/sicht.mjs). */


/* Dienstformen, Anrechnungsfaktor und Standard-Lohnarten stehen seit WP-16 (Nachtrag dritter Review H-1/N-d) in
   server/lib/lohnrechnung.mjs: Der Monatsabschluss rechnet damit Ist-Summe und Konto zum Abschluss ein. */

/* WP-32: Zwei-Faktor für Verwalterschlüssel — eigenes Modul, hier nur eingehängt. */
import BetreiberZweifaktor from "./betreiber-2fa.jsx";
/* WP-25: Sicherungen in der Oberfläche — Regeln und Texte ohne React. */

/* WP-19.0: Branchenmodule — Aktivierung, Regelwerte und alle Moduloberflächen über einen Einhängepunkt (src/module/index.js). */
import { BranchenModule } from "./module/kern.jsx";
import { Notizen } from "./ansichten/notizen.jsx";
import { lade } from "./lib/download.js";




import { Einsatzorte } from "./ansichten/einsatzorte.jsx";
import { Stempeluhr } from "./ansichten/stempeluhr.jsx";
import { korrekturMeldung, ZeitFormular, KorrekturKarte, StempelBefunde } from "./ansichten/korrekturen.jsx";
import { Standorte } from "./ansichten/standorte.jsx";
import { PlanFreigabeSchalter } from "./ansichten/planfreigabeschalter.jsx";
import { Tarifwerk } from "./ansichten/tarifwerk.jsx";
import { Demozugaenge } from "./ansichten/demozugaenge.jsx";
import { Selbststarts } from "./ansichten/selbststarts.jsx";
import { SicherungenVerwalten } from "./ansichten/sicherungenverwalten.jsx";
import { Datenmitnahme } from "./ansichten/datenmitnahme.jsx";
import { Belastbarkeit } from "./ansichten/belastbarkeit.jsx";
import { Mehrfach } from "./ansichten/mehrfach.jsx";
import { Wunschdienste } from "./ansichten/wunschdienste.jsx";
import { Bereitschaft } from "./ansichten/bereitschaft.jsx";
import { Einarbeitung } from "./ansichten/einarbeitung.jsx";
import { Qualifikationsmatrix } from "./ansichten/qualifikationsmatrix.jsx";
import { Lenkzeiten } from "./ansichten/lenkzeiten.jsx";
import { Planstand } from "./ansichten/planstand.jsx";
import { SchwarzesBrett } from "./ansichten/schwarzesbrett.jsx";
import { Zeitachse } from "./ansichten/zeitachse.jsx";
import { NachweisPflege } from "./ansichten/nachweispflege.jsx";
import { Nachweise } from "./ansichten/nachweise.jsx";
import { Verfuegbarkeit } from "./ansichten/verfuegbarkeit.jsx";
import { Tagesstart } from "./ansichten/tagesstart.jsx";
import { UngeplantHinweis } from "./ansichten/ungeplanthinweis.jsx";
import { Tauschboerse } from "./ansichten/tauschboerse.jsx";
import { Jahresansicht } from "./ansichten/jahresansicht.jsx";

import { Datenschutz } from "./ansichten/datenschutz.jsx";
import { Eskalation } from "./ansichten/eskalation.jsx";
import { AusgleichPlanen } from "./ansichten/ausgleichplanen.jsx";
import { Abrechnungsdaten } from "./ansichten/abrechnungsdaten.jsx";
import { KorrekturOffene } from "./ansichten/korrekturoffene.jsx";
import { KorrekturAntraege } from "./ansichten/korrekturantraege.jsx";
import { Monatsabschluss } from "./ansichten/monatsabschluss.jsx";

import { Assistent } from "./ansichten/assistent.jsx";
import { Verteilung } from "./ansichten/verteilung.jsx";
import { Nachrichten } from "./ansichten/nachrichten.jsx";
import { Krankmeldung } from "./ansichten/krankmeldung.jsx";

import { Pruefung } from "./ansichten/pruefung.jsx";
import { Bestaetigungsfrage } from "./ansichten/bestaetigungsfrage.jsx";
import { Testablauf } from "./ansichten/testablauf.jsx";
import { Personalakte } from "./ansichten/personalakte.jsx";
import { Personal } from "./ansichten/personal.jsx";
import { Einladungen } from "./ansichten/einladungen.jsx";
import { Schichtfolge } from "./ansichten/schichtfolge.jsx";
import { Tagesdetail } from "./ansichten/tagesdetail.jsx";
import { Einsatzplan } from "./ansichten/einsatzplan.jsx";
import { Lagebild } from "./ansichten/lagebild.jsx";
import { MeineSchichten } from "./ansichten/meineschichten.jsx";
import { BetreiberRechnungen } from "./ansichten/betreiberrechnungen.jsx";
import { BetreiberDetail } from "./ansichten/betreiberdetail.jsx";

import { BetreiberMandanten } from "./ansichten/betreibermandanten.jsx";


import { ZiehAnbieter, ZiehHinweis } from "./ui/ziehen.jsx";
import { Sheet } from "./ui/leisten.jsx";
import { gemeindeHinweis, LAENDER, BRANCHEN, ABW, demobestand, aktive, personTag, besetzung, sollStunden, istStunden, ausgleichPruefen, stundenkonto, nachtJahr, pruefen, befundeFuer, preis, offeneErfassung, hindernisBefunde, hindernisse, schutzSperre, bestaetigungVermerken, zuschlagStunden, zuschlagWert, datenauskunft, nachweisLage, tagesaufgaben, einrichtungsstand, datevSaetze, lohnexportStand, lohnausgabeDateiname, VORMONAT_KATEGORIEN, lohnexportRueckfrage, mehrarbeitNr, datevCSV, freezeZeilen, lohnausgabeText, ALLE_STANDORTE } from "./lib/fachlogik.js";
import { Mandantenrechner } from "./ansichten/mandantenrechner.jsx";
import { BetreiberTarife } from "./ansichten/betreiber-tarife.jsx";
import { Pakete } from "./ansichten/pakete.jsx";
import { Hilfe } from "./ansichten/hilfe.jsx";
import { OfflineSchalter } from "./ansichten/offline-schalter.jsx";
import { Adressaenderungen } from "./ansichten/adressaenderungen.jsx";
import { JugendschutzSchalter } from "./ansichten/jugendschutz-schalter.jsx";
import { GeoSchalter } from "./ansichten/geo-schalter.jsx";
import { darf } from "./lib/berechtigung.js";
import { ROLLEN, rolle, mehrzahl, ROLLENBEZEICHNUNG, ROLLEN_VORGABE, rollenName, RECHTE_GRUPPEN, ALLE_RECHTE, MATRIX_STD } from "./lib/rollen.js";
import { baueMitteilung, urlaubshinweiseFaellig, zustellungAusstehend } from "./lib/zustellung.js";


import { leererMandant, zugangsPerson } from "./lib/mandant-anlage.js";




import { tourStartet } from "./lib/tour.js";
import { selbsttestLaden } from "./lib/selbsttest.js";
import { BEREICHE, NAV_BETREIBER, NAV_KUNDE, ansichtErlaubt, urlaubshinweiseAnlegen } from "./app/navigation.js";
import { FONT } from "./ui/schriftart.js";
import { Logo } from "./ui/logo.jsx";
import { Farbpunkt } from "./ui/farbwahl.jsx";
import { abmeldenMitHinweis } from "./app/abmelden.js";
import { Anmeldung } from "./ansichten/anmeldung.jsx";
import { Assistent2 } from "./ansichten/assistent2.jsx";
import { Ablaufansicht, Einfuehrung } from "./ansichten/ablauf.jsx";
import { AntraegeGeteilt } from "./ansichten/antraegegeteilt.jsx";
import { Monatsplan } from "./ansichten/monatsplan.jsx";
import { Dienstarten } from "./ansichten/dienstarten.jsx";
import { Konfliktfenster, NichtGespeichert, Offlineleiste } from "./ansichten/speicherlage.jsx";
import { Import } from "./ansichten/import.jsx";
import { Dienstbuch } from "./ansichten/dienstbuch.jsx";
import { Schnellbesetzung } from "./ansichten/schnellbesetzung.jsx";
import { Warndialog } from "./ansichten/warndialog.jsx";
import { Betriebsmittel } from "./ansichten/betriebsmittel.jsx";
import { Kommandoleiste } from "./ansichten/kommandoleiste.jsx";
import { Untergrenzen } from "./ansichten/untergrenzen.jsx";
import { Kompetenzen } from "./ansichten/kompetenzen.jsx";
import { Schichtuebergabe } from "./ansichten/schichtuebergabe.jsx";
import { Prioritaeten } from "./ansichten/prioritaeten.jsx";
import { Handbuch } from "./ansichten/handbuch.jsx";
import { OffeneSchichten } from "./ansichten/offeneschichten.jsx";
import { TourLeiste } from "./ansichten/tourleiste.jsx";import { Einstellungen } from "./ansichten/einstellungen.jsx";
import { MandantNeuAnlegen } from "./ansichten/mandantneuanlegen.jsx";
import { Selbstplanung } from "./ansichten/selbstplanung.jsx";
import { Notrufe } from "./ansichten/notrufe.jsx";
import { Auftraggeberbericht } from "./ansichten/auftraggeberbericht.jsx";
import { Belastung } from "./ansichten/belastung.jsx";
import { Sondereinsaetze } from "./ansichten/sondereinsaetze.jsx";
import { Regelwerk } from "./ansichten/regelwerk.jsx";
import { MHeute, MStempel, MobilSchale, verknuepfungFuer } from "./ansichten/mobil.jsx";
import { aktionenBetreiber } from "./app/aktionen/betreiber.js";
import { aktionenBetrieb } from "./app/aktionen/betrieb.js";
import { aktionenPlan } from "./app/aktionen/plan.js";
import { aktionenStammdaten } from "./app/aktionen/stammdaten.js";
import { aktionenPlanung } from "./app/aktionen/planung.js";
import { aktionenEinstellungen } from "./app/aktionen/einstellungen.js";
import { aktionenAusschreibung } from "./app/aktionen/ausschreibung.js";
import { aktionenBegleitung } from "./app/aktionen/begleitung.js";
import { aktionenZeiterfassung } from "./app/aktionen/zeiterfassung.js";
import { aktionenBranchen } from "./app/aktionen/branchen.js";
import { aktionenAssistenz } from "./app/aktionen/assistenz.js";
import { aktionenAusgaben } from "./app/aktionen/ausgaben.js";


/* Die Palette zusätzlich als CSS-Variablen ausgeben.
   Zwei Gründe: Erstens erreichen Variablen Stellen, an die ein
   JavaScript-Objekt nicht kommt — Bildlaufleisten, Auswahlfelder, die
   Datumsauswahl des Browsers. Zweitens wechselt das Thema damit ohne
   Neuaufbau der Oberfläche; eine memoisierte Komponente behält sonst die
   Farben des alten Themas. */
function themaSetzen(dunkel) {
  dunkelSetzen(dunkel);
  Object.assign(C, dunkel ? C_DUNKEL : C_HELL);
  if (typeof document !== "undefined") {
    const wurzel = document.documentElement;
    wurzel.style.colorScheme = dunkel ? "dark" : "light";
    wurzel.setAttribute("data-thema", dunkel ? "dunkel" : "hell");
    wurzel.setAttribute("data-v4-app", "");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dunkel ? C_DUNKEL.bg : C_HELL.bg);
    /* Der Einstieg setzt den Körper inline (v4/thema.js); nach der Anmeldung muss er dem
       gewählten Erscheinungsbild folgen, sonst bleibt hinter der Anwendung die Farbe des Einstiegs. */
    document.body.style.background = dunkel ? C_DUNKEL.bg : C_HELL.bg;
  }
}

/** Folgt dem Systemthema, solange niemand von Hand gewählt hat. */
function themaVomSystem() {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; }
  catch { return false; }
}

/** Globale Gestaltung. Hover- und Glaseffekte brauchen echtes CSS. */
const bauStyles = () => `
:root{
  ${alsVariablen(C_HELL)}
  /* Dichte — systemweit umschaltbar zwischen Komfortabel und Kompakt */
  --zeile: 48px; --pad-y: 14px; --pad-x: 20px; --luft: 32px; --schrift: 14.5px;
  --block: 48px;                 /* Abstand zwischen Abschnitten — bewusst großzügig */
  --r: 12px; --r-gross: 18px; --r-pille: 999px;
  /* Ebenen: E2 Karte, E3 Karte im Hover, E5 Blatt und Menü, E6 Toast */
  --schatten: 0 1px 2px rgba(7,19,23,.04), 0 8px 22px rgba(7,19,23,.05);
  --schatten-hoch: 0 4px 12px -2px rgba(7,19,23,.10), 0 16px 32px -12px rgba(7,19,23,.14);
  --schatten-blatt: 0 20px 48px rgba(7,19,23,.18);
  --schatten-toast: 0 12px 32px rgba(7,19,23,.28);
  --sidebar-breite: 252px;
  --kopf-hoehe: 64px; --unter-hoehe: 48px;
}
/* Die dunkle Palette als eigener Satz. Das Attribut setzt themaSetzen.
   Auf Dunkel trägt der Rand die Karte, nicht der Schatten. */
:root[data-thema="dunkel"]{ ${alsVariablen(C_DUNKEL)}
  --schatten: 0 1px 2px rgba(0,0,0,.30); --schatten-hoch: 0 1px 2px rgba(0,0,0,.30);
  --schatten-blatt: 0 20px 48px rgba(0,0,0,.5); --schatten-toast: 0 12px 32px rgba(0,0,0,.5); }
.dicht{ --zeile: 36px; --pad-y: 8px; --pad-x: 14px; --luft: 20px; --block: 26px; --schrift: 13.5px; }

*{box-sizing:border-box; -webkit-tap-highlight-color:transparent;}
/* Sichtbarer Fokusring für Tastaturbedienung — überall, nicht nur bei Knöpfen */
:focus-visible{outline:2px solid ${C.accent}; outline-offset:2px; border-radius:4px;}
/* Nur für Bildschirmleser */
.nurLeser{position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
  clip:rect(0,0,0,0); white-space:nowrap; border:0;}
/* Sprungmarke zum Inhalt */
.sprung{position:absolute; left:8px; top:-48px; z-index:100; background:${C.accent}; color:${C.aufAkzent};
  padding:10px 16px; border-radius:8px; font-size:13.5px; font-weight:600; text-decoration:none;
  transition:top .16s;}
.sprung:focus{top:8px;}
body{margin:0;}
.sw-root{
  min-height:100vh; background:${C.bg}; color:${C.text}; font-family:${FONT};
  font-size:var(--schrift); -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}

/* ------------------------------- Gerüst -------------------------------- */
.huelle{display:flex; min-height:100vh;}
.seitenleiste{
  width:var(--sidebar-breite); flex-shrink:0; background:${C.sidebar}; color:#fff;
  display:flex; flex-direction:column; position:fixed; left:0; top:0; bottom:0; z-index:40;
  transition:transform .24s cubic-bezier(.4,0,.2,1);
}
.inhalt{flex:1; margin-left:0; min-width:0; display:flex; flex-direction:column;}
.fokus .seitenleiste{transform:translateX(-100%);}

.marke{padding:22px 20px 18px; display:flex; align-items:center; gap:11px;
  border-bottom:1px solid rgba(255,255,255,.08);}
.marke b{font-size:16px; font-weight:700; letter-spacing:-.02em;}

.snav{flex:1; overflow-y:auto; padding:14px 12px 20px;}
.snav::-webkit-scrollbar{width:5px;}
.snav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16); border-radius:3px;}
.sgruppe{font-size:10.5px; font-weight:700; letter-spacing:.11em; text-transform:uppercase;
  color:rgba(255,255,255,.40); padding:20px 14px 8px;}
.slink{
  display:flex; align-items:center; gap:12px; width:100%; border:none; background:transparent;
  color:rgba(255,255,255,.74); font-family:inherit; font-size:14px; font-weight:500;
  padding:11px 14px; border-radius:10px; cursor:pointer; text-align:left;
  transition:background .14s, color .14s; margin-bottom:1px; position:relative;
}
.slink:hover{background:rgba(255,255,255,.07); color:#fff;}
/* Aktiv über helle Fläche statt Akzentfarbe — Teal auf Anthrazit erreicht nur 2,7:1 */
.slink.on{background:rgba(255,255,255,.13); color:#fff; font-weight:600;}
.slink.on::before{content:""; position:absolute; left:0; top:9px; bottom:9px; width:3px;
  border-radius:0 3px 3px 0; background:${C.accentOrig};}
.slink .zahl{margin-left:auto; font-size:11px; font-weight:700; padding:2px 7px; border-radius:999px;
  background:rgba(255,255,255,.14); ${'' /* Zähler */}}
.slink .zahl.warn{background:${C.danger}; color:${istDunkel() ? C.bg : "#fff"};}
.sfuss{padding:14px 16px; border-top:1px solid rgba(255,255,255,.08); font-size:12px;
  color:rgba(255,255,255,.55);}

/* Die Kopfzeile sitzt im klebenden .kopfblock (gestalt/stil.js), zusammen mit der Unterleiste. */
.kopfleiste{
  padding:0 16px; height:var(--kopf-hoehe);
  display:flex; align-items:center; gap:12px;
}
.suchknopf{
  display:flex; align-items:center; gap:9px; border:1px solid ${C.line}; background:${C.flaeche};
  border-radius:var(--r-pille); height:40px; padding:0 8px 0 14px; cursor:pointer; font-family:inherit;
  font-size:13px; color:${C.dim}; min-width:0; flex-shrink:0; transition:border-color .14s;
}
.suchknopf:hover{border-color:${C.steuer};}
.suchknopf kbd{margin-left:6px; font-size:10.5px; font-family:inherit; padding:2px 6px;
  border-radius:6px; background:${C.flaecheStill}; border:1px solid ${C.lineSoft}; color:${C.dim};}

main.bereich{flex:1; padding:var(--luft) var(--luft) 96px; max-width:1720px; width:100%;}

/* ------------------------------ Bausteine ------------------------------ */
/* Auf Sea Salt hebt sich Weiß nur mit 1,3:1 ab. Der Rand macht die Kante
   sichtbar, der Schatten gibt die Ebene — beides zusammen trägt. */
.karte{background:${C.flaeche}; border:1px solid ${C.line}; border-radius:var(--r-gross);
  box-shadow:var(--schatten);}
/* E1: eingelassene Gruppe — Tabellenkopf, Hinweiskasten, Einsatzfläche */
.karte-still{background:${C.flaecheStill}; border:1px solid ${C.lineSoft}; border-radius:var(--r-gross);}
/* Typografische Sprünge statt gleichmäßiger Stufen — das Auge soll sofort
   wissen, wo es anfängt. */
h1.titel{font-size:38px; font-weight:300; letter-spacing:-.045em; line-height:1.08;
  margin:0 0 10px; color:${C.text};}
h1.titel b{font-weight:680;}
.untertitel{font-size:15.5px; color:${C.dim}; line-height:1.6; max-width:680px; margin:0;}
.abschnitt{margin-top:var(--block);}
.abschnitt-titel{font-size:19px; font-weight:640; letter-spacing:-.02em; margin:0 0 4px;}
.abschnitt-sub{font-size:13.5px; color:${C.dim}; line-height:1.5; margin:0 0 18px;}
/* Aufklapper für Zweitrangiges */
.mehr{border:none; background:transparent; color:${C.accent}; font-family:inherit; font-size:13.5px;
  font-weight:600; cursor:pointer; padding:8px 0; display:inline-flex; align-items:center; gap:7px;}
.mehr:hover{color:${C.accentDeep};}
.mehr span{transition:transform .18s;}
.mehr.auf span{transform:rotate(90deg);}
.karte-kopf{display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding:var(--pad-y) var(--pad-x); border-bottom:1px solid ${C.line};}
.karte-hover{transition:box-shadow .16s, border-color .16s;}
.karte-hover:hover{box-shadow:var(--schatten-hoch); border-color:${C.lineStark};}

.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  min-height:40px; padding:0 18px; font-size:13.5px; font-weight:560; font-family:inherit; cursor:pointer;
  border-radius:var(--r-pille); border:1px solid ${C.line}; background:${C.flaeche}; color:${C.text};
  transition:background .14s, border-color .14s, color .14s; white-space:nowrap; line-height:1.2;
}
.btn:hover{background:${C.bg}; border-color:${C.steuer};}
.btn:active{transform:translateY(.5px);}
.btn:disabled{opacity:.45; cursor:not-allowed; transform:none;}
.btn:focus-visible{outline:2px solid ${C.accent}; outline-offset:2px;}
.btn-primary{background:${C.accent}; border-color:${C.accent}; color:${C.aufAkzent};}
.btn-primary:hover{background:${C.accentHi}; border-color:${C.accentHi}; color:${C.aufAkzent};}
.btn-quiet{background:transparent; border-color:transparent; color:${C.dim};}
.btn-quiet:hover{background:${C.bg}; color:${C.text};}
.btn-danger{background:${C.dangerLight}; border-color:${C.dangerLight}; color:${C.danger};}
.btn-danger:hover{background:${C.flaeche}; border-color:${C.danger};}
.btn-ok{background:${C.ok}; border-color:${C.ok}; color:${C.aufAkzent};}
.btn-ok:hover{filter:brightness(1.08);}
.btn-warn{background:${C.warnLight}; border-color:${C.warnLight}; color:${C.text};}
.btn-warn:hover{background:${C.flaeche}; border-color:${C.warn};}
.btn-sm{min-height:34px; padding:0 14px; font-size:12.5px;}

.inp,.sel,textarea.inp{
  width:100%; min-height:40px; padding:9px 12px; border-radius:var(--r); border:1px solid ${C.line};
  background:${C.flaeche}; color:${C.text}; font-size:13.5px; font-family:inherit;
  transition:border-color .14s, box-shadow .14s;
}
.inp:hover,.sel:hover{border-color:${C.steuer};}
.inp:focus,.sel:focus,textarea.inp:focus{outline:none; border-color:${C.accent};
  box-shadow:0 0 0 3px ${C.accentLight};}
.inp::placeholder{color:${C.dim}; opacity:.72;}
.sel{appearance:none; padding-right:32px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' stroke='%236B7280' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 12px center;}

.pille{display:inline-flex; align-items:center; gap:5px; padding:4px 11px; border-radius:999px;
  font-size:12.5px; font-weight:600; background:${C.flaecheStill}; color:${C.dim};
  white-space:nowrap; font-variant-numeric:tabular-nums;}
.pille-sm{padding:2px 9px; font-size:11.5px;}
/* Ohne Rand: die Tönung trägt, das Wort daneben ist die Aussage. */
.pille-ok{background:${C.okLight}; color:${C.ok};}
.pille-warn{background:${C.warnLight}; color:${C.warn};}
.pille-danger{background:${C.dangerLight}; color:${C.danger};}
.pille-accent{background:${C.accentLight}; color:${C.accent};}

/* Rundes Namenszeichen — ersetzt Fotos, die wir nicht haben */
.avatar{width:38px; height:38px; border-radius:50%; flex-shrink:0; display:flex;
  align-items:center; justify-content:center; font-size:13px; font-weight:650;
  background:${C.flaecheStill}; color:${C.dim}; letter-spacing:-.02em;}
.avatar-sm{width:30px; height:30px; font-size:11.5px;}
/* Schichtmarke mit linkem Akzentstrich statt voller Farbfläche */
.schicht{display:flex; flex-direction:column; gap:1px; padding:7px 10px; border-radius:9px;
  line-height:1.25; min-width:0;}
.schicht b{font-size:12px; font-weight:640;}
.schicht span{font-size:11px; opacity:.78; white-space:nowrap;}
/* Freie Zelle im Plan — sichtbar, aber ruhig */
.leerzelle{border:1.5px dashed ${C.line}; border-radius:9px; background:transparent;}

.rubrik{font-size:11px; font-weight:700; letter-spacing:.10em; text-transform:uppercase; color:${C.dim};}

/* Tabellen — der Kern jeder Planungsansicht */
table.raster{border-collapse:separate; border-spacing:0; width:100%;}
table.raster th{font-size:11.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color:${C.dim}; padding:10px var(--pad-x); border-bottom:1px solid ${C.line}; text-align:left;
  background:${C.bg}; position:sticky; top:0; z-index:2;}
table.raster td{padding:0 var(--pad-x); height:var(--zeile); border-bottom:1px solid ${C.lineSoft};
  font-size:13.5px; vertical-align:middle;}
table.raster tbody tr:hover td{background:${C.bg};}
table.raster tbody tr[data-gewaehlt="1"] td{background:${C.accentLight};}

/* Filter als einzelne Pillen statt als Schalterleiste — luftiger und
   auf dem Telefon leichter zu treffen. */
.seg{display:inline-flex; gap:8px; max-width:100%; overflow-x:auto; padding:2px;}
.seg button{border:1px solid ${C.line}; background:${C.flaeche}; cursor:pointer;
  font-family:inherit; font-size:13px; font-weight:550; color:${C.dim};
  padding:8px 16px; border-radius:999px; white-space:nowrap; flex-shrink:0;
  transition:background .14s, color .14s, border-color .14s;}
.seg button:hover{border-color:${C.steuer};}
.seg button.on{background:${C.accentLight}; color:${C.accent}; border-color:${C.accent}; font-weight:620;}

.reiterreihe{display:flex; gap:7px; flex-wrap:nowrap; overflow-x:auto; padding-bottom:5px;
  margin-bottom:14px; scrollbar-width:thin;}
.reiterreihe::-webkit-scrollbar{height:4px;}
.reiterreihe::-webkit-scrollbar-thumb{background:${C.lineStark}; border-radius:2px;}
.reiterreihe > *{flex-shrink:0;}

.hakenliste{list-style:none; padding:0; margin:0;}
.hakenliste li{display:flex; gap:10px; align-items:flex-start; padding:7px 0; font-size:13.5px;}

.schalter{width:40px; height:23px; border-radius:999px; border:none; cursor:pointer; padding:0;
  position:relative; transition:background .18s; flex-shrink:0; background:${C.steuer};}
.schalter.on{background:${C.accent};}
.schalter i{position:absolute; top:2.5px; left:2.5px; width:18px; height:18px; border-radius:50%;
  background:${C.aufAkzent}; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .18s;}
.schalter.on i{transform:translateX(17px);}

/* Tastaturkürzel als Marke im Text */
kbd.taste{display:inline-flex; align-items:center; justify-content:center; min-width:19px; height:19px;
  padding:0 5px; border-radius:5px; background:${C.bg}; border:1px solid ${C.line};
  font-family:inherit; font-size:11px; font-weight:600; color:${C.dim};}

/* Blätter und Überlagerungen */
.blatt{background:${C.flaeche}; border-radius:var(--r-gross); box-shadow:var(--schatten-blatt);
  border:1px solid ${C.line};}
/* Der Rücken hinter einem Blatt.

   Diese Regel fehlte, und zwar für alle achtundzwanzig Dialoge der
   Anwendung zugleich. Ohne sie war der Rücken ein gewöhnlicher Block im
   Textfluss: keine feste Lage, keine Ebene, keine Abdunklung. Das Blatt
   landete am linken Seitenrand — also unter der festen Seitenleiste, die
   es zur Hälfte verdeckte. Auf breiten Bildschirmen fiel das am stärksten
   auf, weil der Inhalt daneben mittig steht und der Dialog nicht.

   „margin:auto" auf dem Blatt statt „align-items:center" ist Absicht: Ein
   Dialog, der höher ist als das Fenster, wird bei zentrierter Ausrichtung
   oben abgeschnitten, und der abgeschnittene Teil ist nicht erreichbar.
   So zentriert er, solange Platz ist, und lässt sonst scrollen. */
.sheet-back{position:fixed; inset:0; z-index:90; display:flex; justify-content:center;
  background:var(--c-ueberlagerung); backdrop-filter:blur(6px);
  padding:24px; overflow-y:auto; overscroll-behavior:contain;
  animation:blattauf .16s cubic-bezier(.4,0,.2,1);}
.sheet-back > .blatt{width:100%; margin:auto; outline:none;}
@keyframes blattauf{from{opacity:0;} to{opacity:1;}}
.zeile-hover:hover{background:${C.bg};}

/* Meldungsstreifen mit Rücknahme */
.toast{position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:95;
  background:${C.text}; color:${C.flaeche}; padding:12px 16px; border-radius:var(--r); font-size:13.5px;
  box-shadow:var(--schatten-toast); display:flex; align-items:center; gap:14px;
  max-width:92vw; animation:auf .2s cubic-bezier(.4,0,.2,1);}
@keyframes auf{from{opacity:0; transform:translate(-50%,10px);} to{opacity:1; transform:translate(-50%,0);}}
.toast button{border:none; background:transparent; color:${C.accentGlanz}; font-family:inherit;
  font-size:13px; font-weight:650; cursor:pointer; padding:0;}
/* Fünf Sekunden Rücknahmefrist, sichtbar als schrumpfender Ring */
.toast-uhr{width:16px; height:16px; border-radius:50%; border:2px solid ${C.steuer};
  position:relative; flex-shrink:0;}
.toast-uhr i{position:absolute; inset:-2px; border-radius:50%; border:2px solid ${C.accentGlanz};
  border-right-color:transparent; border-bottom-color:transparent;
  animation:uhr 5s linear forwards;}
@keyframes uhr{from{transform:rotate(0deg); opacity:1;} to{transform:rotate(360deg); opacity:.25;}}
@keyframes pulsieren{0%,100%{opacity:.55;} 50%{opacity:1;}}
/* Ladegerüst: ein ruhiges Pulsieren statt eines Drehrads */
.pulsiert{animation:pulsieren 1.6s ease-in-out infinite;}
@media (max-width: 1024px){ .nur-breit{display:none !important;} }
/* Zweispaltige Ansichten stapeln, sobald es eng wird — sonst quetscht sich
   die schmale Spalte auf einen unbrauchbaren Streifen. */
@media (max-width: 900px){ .zweispaltig{grid-template-columns:1fr !important;} }
/* Rechtstexte: auf dem Telefon steht die Auswahl über dem Text, nicht daneben */
@media (max-width: 900px){ .rechtsraster{grid-template-columns:1fr !important; gap:16px !important;}
  .rechtsraster > nav{flex-direction:row !important; position:static !important; overflow-x:auto;} }
@media (prefers-reduced-motion: reduce){
  *{animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important;}
  .toast-uhr i{animation:none; opacity:.5;}
  .toast{animation:none;}
  .sheet-back{animation:none;}
  *{scroll-behavior:auto !important;}
}

::-webkit-scrollbar{width:10px; height:10px;}
::-webkit-scrollbar-thumb{background:${C.lineStark}; border-radius:5px; border:3px solid ${C.bg};}
::-webkit-scrollbar-track{background:transparent;}

/* Kontrastmodus für den Feldeinsatz */
.feldmodus{--schrift:16px;}
.feldmodus .karte{border-color:${C.lineStark};}
.feldmodus table.raster td{border-bottom-color:${C.line};}

@media (max-width: 1024px){
  .seitenleiste{transform:translateX(-100%); box-shadow:0 0 40px rgba(0,0,0,.3);}
  .seitenleiste.offen{transform:translateX(0);}
  .inhalt{margin-left:0;}
  main.bereich{padding:16px 14px 96px;}
}
@media (min-width: 1025px){ .nur-schmal{display:none !important;} }

/* Der Umbruchpunkt, der fehlte.

   Bis hierher gab es genau einen bei 1024px — für eine Anwendung, die den
   Beschäftigten ausdrücklich eine Telefonansicht verspricht, endete die
   Anpassung also dort, wo sie erst anfangen müsste. Zwischen 320 und 480
   Pixeln passierte nichts mehr.

   Ein Raster mit einunddreißig Spalten lässt sich auf dieser Breite nicht
   retten. Es bekommt stattdessen Tippflächen, die mit dem Daumen zu treffen
   sind, und alles daneben wird ruhiger statt gedrängter. */
@media (max-width: 560px){
  .pille{max-width:100%; white-space:normal; text-align:left;}
  .btn{white-space:normal; max-width:100%; padding-top:8px; padding-bottom:8px; text-align:center;}
  main.bereich{padding:12px 10px 88px;}
  /* Die Kopfleiste schob das Dokument auf 769px auf einem 390px breiten
     Gerät — gemessen, nicht geschätzt. Die Werkzeuge rechts sind auf dem
     Telefon ohnehin zweitrangig; die Suche bleibt, der Rest tritt ab. */
  .kopfleiste{padding-left:8px; padding-right:8px; gap:8px;}
  .kopfleiste .kopf-werkzeuge{display:none !important;}
  .suchknopf kbd{display:none;}
  .suchknopf{min-width:0; flex:1 1 auto;}
  /* Vierundvierzig Pixel sind die Untergrenze für eine Fläche, die mit dem
     Daumen getroffen werden soll. */
  .planzelle{min-height:44px !important;}
  .seg button{padding:8px 13px;}
  /* Unter sechzehn Pixeln zoomt iOS beim Antippen in das Feld hinein */
  .inp,.sel,textarea{font-size:16px !important;}
  .karte{border-radius:10px;}
  /* Auf dem Telefon zählt jeder Millimeter Breite: der Rand um ein Blatt
     schrumpft, das Blatt selbst nimmt die volle Breite. */
  .sheet-back{padding:10px;}
  .sheet-back > .blatt{border-radius:12px;}
}

/* WP-35: Datentabelle der Abrechnungsdaten (Zuschlaege je Person) ohne
   Querscrollen bis 480px. Jede Zeile wird zur Karte; die Spaltenkoepfe
   bleiben fuer Vorlesesoftware im Dokument (nur unsichtbar), jede Zelle
   traegt ihre Beschriftung ueber data-label. */
@media (max-width: 480px){
  table.raster-stapel{min-width:0 !important; display:block;}
  table.raster-stapel thead{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0);}
  table.raster-stapel tbody, table.raster-stapel tr{display:block;}
  table.raster-stapel tr{padding:8px 0; border-bottom:1px solid ${C.line};}
  table.raster-stapel td{display:flex; justify-content:space-between; align-items:center; gap:12px; height:auto; min-height:30px; border-bottom:0;}
  table.raster-stapel td::before{content:attr(data-label); font-size:11.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:${C.dim};}
  table.raster-stapel td:first-child::before{content:none;}
  /* Reiterleiste der Abrechnungsdaten: umbrechen statt innen zu scrollen */
  .seg-umbruch .seg{flex-wrap:wrap; overflow-x:visible;}
}

@media print{
  .seitenleiste,.kopfblock,.kopfleiste,.noprint,.toast{display:none !important;}
  .inhalt{margin-left:0;}
  .sw-root{background:#fff;}
  .karte{border-color:#D1D5DB; box-shadow:none; break-inside:avoid;}
}
${gestaltStil()}
${v4AppStil()}
${geraeteStil()}
`;

function Betrieb({ sitz, akt }) {
  const m = sitz.mandant;
  const [tests, setTests] = useState(null);
  const [laeuftTest, setLaeuftTest] = useState(false);

  /* Die Planung bekommt kein leeres Blatt mehr. Sie darf Standorte führen
     und die Rollen benennen — beides braucht sie täglich; alles Übrige
     bleibt der Leitung. */
  if (!darf(sitz, "org.edit")) {
    if (sitz.person.rolle === "planer")
      return (
        <div>
          <H1 sub="Standorte und Bezeichnungen. Stammdaten und Regelwerk führt die Organisationsleitung.">Betrieb</H1>
          <Standorte sitz={sitz} akt={akt} />
          {/* Jugendarbeitsschutz „mehrschichtig“: auch die Planung (pattern.edit, Nutzerentscheidung). */}
          {darf(sitz, "pattern.edit") && <JugendschutzSchalter sitz={sitz} akt={akt} />}
          {/* WP-19.0: Branchenmodule — die Planung sieht den Stand und nutzt eingeschaltete Module, schaltet nicht. */}
          <BranchenModule sitz={sitz} akt={akt} darf={(r) => darf(sitz, r)}
            kontext={{ personenImDienst: (t, daId) => ((besetzung(m, t) || {})[daId] || { personen: [] }).personen }} />
        </div>);
    return <Card><Leer titel="Kein Zugriff" text="Die Betriebsverwaltung ist der Organisationsleitung vorbehalten." /></Card>;
  }
  const p = preis(sitz.db, m);

  return (
    <div>
      <H1 sub="Stammdaten, Einheiten, Qualifikationen, Regelwerk und Rechte.">Betrieb</H1>

      {/* Die Reihenfolge folgt jetzt der Häufigkeit, nicht der
          Entstehungsgeschichte: Was den Vertrag betrifft, steht oben und
          wird selten angefasst; die tägliche Struktur in der Mitte; die
          Werkzeuge zuletzt. */}
      <Abschnitt erste sub="Bindet den Betrieb an Tarif, Standorte und Preis. Änderungen hier wirken auf die Abrechnung.">
        Vertrag und Standorte</Abschnitt>

      <Tarifwerk sitz={sitz} akt={akt} />

      <Standorte sitz={sitz} akt={akt} />

      <GeoSchalter sitz={sitz} akt={akt} />

      <OfflineSchalter sitz={sitz} akt={akt} />

      <Einsatzorte sitz={sitz} akt={akt} />

      <PlanFreigabeSchalter sitz={sitz} akt={akt} />

      <JugendschutzSchalter sitz={sitz} akt={akt} />

      {/* WP-19.0: Branchenmodule — Einschalten nur mit org.edit, Wann/Wer und Prüfung beim Server. */}
      <BranchenModule sitz={sitz} akt={akt} darf={(r) => darf(sitz, r)}
        kontext={{ personenImDienst: (t, daId) => ((besetzung(m, t) || {})[daId] || { personen: [] }).personen }} />

      <Abschnitt sub="Name, Branche und Bundesland. Das Bundesland bestimmt die gesetzlichen Feiertage im ganzen Plan.">
        Stammdaten</Abschnitt>

      <Card style={{ marginBottom: 16 }}>
        <CardHead right={<Pill tone="accent">{eur(p.gesamt)} / Monat</Pill>}>Stammdaten</CardHead>
        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 15 }}>
          <Field label="Name des Betriebs"><Inp value={m.name} onChange={(e) => akt.setzeFeld("name", e.target.value)} /></Field>
          <Field label="Branche"><Sel value={m.branche} onChange={(e) => akt.setzeBranche(e.target.value)}>
            {BRANCHEN.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
          <Field label="Bezeichnung der Einheiten" hint="Wirkt in der gesamten Oberfläche.">
            <Inp value={m.einheitLabel} onChange={(e) => akt.setzeFeld("einheitLabel", e.target.value)} /></Field>
          <Field label="Bundesland"
            hint={gemeindeHinweis(m.bundesland)
              ? `Bestimmt die gesetzlichen Feiertage. ${gemeindeHinweis(m.bundesland)} Bitte für euren Ort prüfen.`
              : "Bestimmt die gesetzlichen Feiertage."}>
            <Sel value={m.bundesland} onChange={(e) => akt.setzeFeld("bundesland", e.target.value)}>
              {LAENDER.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Sel></Field>
        </div>
      </Card>

      <Abschnitt sub={`Woraus der Betrieb besteht und welche Grenzen für die Planung gelten. Das Regelwerk ist die Grundlage jeder Prüfung — was hier steht, meldet die Prüfung später als Verstoß.`}>
        Struktur und Regelwerk</Abschnitt>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
        <Card>
          <CardHead right={<Btn size="sm" onClick={akt.neueEinheit}>Hinzufügen</Btn>}>{mehrzahl(m.einheitLabel)}</CardHead>
          <div style={{ padding: 22 }}>
            {m.einheiten.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 11 }}>
                <Farbpunkt wert={e.farbe} onChange={(c) => akt.setzeEinheit(e.id, "farbe", c)}
                  titel={`Farbe von ${e.name}`} />
                <Inp value={e.name} aria-label="Name der Einheit" onChange={(ev) => akt.setzeEinheit(e.id, "name", ev.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 12.5, color: C.dimmer, width: 64, ...NUM }}>
                  {aktive(m, heute()).filter((x) => einheitAm(x, heute()) === e.id).length} Pers.</span>
                <Btn size="sm" kind="danger" onClick={() => akt.loescheEinheit(e.id)} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>
              </div>))}
          </div>
        </Card>

        <Card>
          <CardHead right={<Btn size="sm" onClick={akt.neueQual}>Hinzufügen</Btn>}>Qualifikationen</CardHead>
          <div style={{ padding: 22 }}>
            {m.qualifikationen.map((q) => (
              <div key={q.id} style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 11 }}>
                <Farbpunkt wert={q.farbe} onChange={(c) => akt.setzeQual(q.id, "farbe", c)}
                  titel={`Farbe von ${q.name}`} />
                <Inp value={q.name} aria-label="Name der Qualifikation" onChange={(e) => akt.setzeQual(q.id, "name", e.target.value)} style={{ flex: 1 }} />
                <Inp value={q.kurz} maxLength={4} aria-label="Kürzel der Qualifikation" onChange={(e) => akt.setzeQual(q.id, "kurz", e.target.value.toUpperCase())} style={{ width: 76 }} />
                <Btn size="sm" kind="danger" onClick={() => akt.loescheQual(q.id)} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>
              </div>))}
            <Erklaerkasten style={{ marginTop: 12 }}>
              Qualifikationen werden in den Dienstarten als Anforderung hinterlegt und in der Prüfung ausgewertet.
              Eine Kopfzahl ohne Funktionsnachweis ist keine besetzte Schicht.
            </Erklaerkasten>
          </div>
        </Card>

        <Regelwerk m={m} akt={akt} />

      </div>

      <Abschnitt sub="Wer was darf und wie die Rollen bei euch heißen. Beides ändert nichts an den Daten — nur daran, wer sie sieht und wie sie genannt werden.">
        Rechte und Sprache</Abschnitt>

      {/* ------------------------ Eigene Rollennamen ---------------------
          Umbenannt wird die Anzeige, nie die Kennung. Die Rechtematrix,
          der Vergaberang und die Preisberechnung hängen an `subplaner` und
          bleiben davon unberührt — sichtbar an der Kennung, die unter
          jedem Feld stehen bleibt.                                        */}
      {/* Leitung und Planung dürfen umbenennen — beide arbeiten täglich mit
          den Begriffen. Die Schichtverantwortung nicht: Sie führt eine
          Einheit, nicht die Sprache des Hauses. */}
      {["leitung", "planer"].includes(sitz.person.rolle) && (
        <Card>
          <CardHead right={Object.keys(m.rollennamen || {}).length > 0
            ? <Btn size="sm" onClick={() => akt.rollennamenZuruecksetzen()}>Auf Vorgabe zurücksetzen</Btn>
            : null}>Eigene Rollenbezeichnungen</CardHead>
          <div style={{ padding: "16px 22px 0", fontSize: 13.5, color: C.dim, lineHeight: 1.5, maxWidth: 720 }}>
            Wie heißen diese Rollen bei euch? In der Klinik ist die
            Schichtverantwortung eine Stationsleitung, in der Pflege eine
            Wohnbereichsleitung. Geändert wird nur, was auf dem Bildschirm
            steht — Rechte und Kosten bleiben, wie sie sind.
          </div>
          <div style={{ padding: 22, display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
            {ROLLEN.filter((r) => !r.extern).map((r) => (
              <Field key={r.id} label={ROLLEN_VORGABE[r.id]} hint={r.id}>
                <Inp value={(m.rollennamen || {})[r.id] || ""} placeholder={ROLLEN_VORGABE[r.id]}
                  onChange={(e) => akt.setzeRollenname(r.id, e.target.value)} /></Field>))}
          </div>
        </Card>)}

      <Card style={{ marginTop: 16 }}>
        <CardHead right={<Btn size="sm" onClick={akt.matrixZuruecksetzen}>Auf Standard zurücksetzen</Btn>}>Rollen und Rechte</CardHead>
        <div style={{ padding: "16px 22px 0", fontSize: 13.5, color: C.dim, lineHeight: 1.5, maxWidth: 720 }}>
          Eine Rolle allein ist keine Berechtigung. Erst Rolle plus Geltungsbereich ergibt eine:
          <span style={{ color: C.text }}> {rollenName(m, "subplaner")} für {m.einheiten[0] ? m.einheiten[0].name : "eine Einheit"}</span> darf dort ändern und sonst nirgends.
        </div>
        {/* WP-21 Teil 2: Tabelle mit eigenem Querscroll (780 px) als benannter, per Tastatur erreichbarer Bereich mit Hinweis. */}
        <Scrollbereich label="Rollen und Rechte, Tabelle der Berechtigungen je Rolle">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780, marginTop: 16 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "13px 22px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 290 }}><Lab>Berechtigung</Lab></th>
            {/* Über jeder Spalte steht, wie viele Rechte diese Rolle trägt.
                Ohne diese Zahl musste man die ganze Spalte gegen den
                Kontrast durchzählen, um „was darf eine Schichtverantwortung
                eigentlich" zu beantworten — die häufigste Frage an diese
                Tabelle, und die einzige, die sie nicht beantwortete. */}
            {ROLLEN.filter((r) => !r.extern).map((r) => {
              const hat = (m.matrix || MATRIX_STD)[r.id] || [];
              const zahl = r.id === "leitung" ? ALLE_RECHTE.length : hat.length;
              return (
                <th key={r.id} style={{ padding: "13px 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 86 }}>
                  <Lab style={{ color: lesbar(r.farbe), textAlign: "center", fontWeight: 700 }}>{r.kurz}</Lab>
                  <div title={`${rollenName(m, r.id)} — ${zahl} von ${ALLE_RECHTE.length} Rechten`}
                    style={{ fontSize: 11, color: C.dimmer, textAlign: "center", marginTop: 3, ...NUM }}>
                    {zahl}/{ALLE_RECHTE.length}</div>
                </th>); })}
          </tr></thead>
          <tbody>{RECHTE_GRUPPEN.map(([g, items]) => (
            <Fragment key={g}>
              <tr><td colSpan={6} style={{ padding: "13px 22px 6px", background: C.flaecheStill }}><Lab>{g}</Lab></td></tr>
              {items.map(([id, label]) => (
                <tr key={id} className="row">
                  <td style={{ padding: "10px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <div style={{ fontSize: 13.5 }}>{label}</div>
                    <div style={{ fontSize: 11, color: C.dimmer, ...NUM }}>{id}</div></td>
                  {ROLLEN.filter((r) => !r.extern).map((r) => {
                    const an = ((m.matrix || MATRIX_STD)[r.id] || []).includes(id), fest = r.id === "leitung";
                    return (<td key={r.id} style={{ padding: "10px 8px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "center" }}>
                      {/* Gesetzt: gefüllte Fläche in der Rollenfarbe mit
                          weißem Haken. Nicht gesetzt: ein leerer Ring, kein
                          durchsichtiger Haken auf grauem Grund — der war bei
                          flüchtigem Blick von einem gesetzten kaum zu
                          unterscheiden, und genau das ist bei einer
                          Rechtetabelle der teuerste Lesefehler. */}
                      <button onClick={() => !fest && akt.toggleRecht(r.id, id)}
                        aria-pressed={an}
                        aria-label={`${label} — ${rollenName(m, r.id)}: ${an ? "erlaubt" : "nicht erlaubt"}`}
                        title={fest ? "Die Organisationsleitung hat immer alle Rechte."
                          : `${rollenName(m, r.id)}: ${an ? "erlaubt" : "nicht erlaubt"}`}
                        style={{ width: 25, height: 25, borderRadius: 8, cursor: fest ? "not-allowed" : "pointer",
                          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
                          border: an ? "none" : `1.5px solid ${C.steuer}`,
                          background: an ? r.farbe : "transparent", color: an ? "white" : "transparent",
                          opacity: fest ? .55 : 1 }}>
                        <Icon n="haken" size={14} strokeWidth={2.5} /></button></td>);
                  })}
                </tr>))}
            </Fragment>))}</tbody>
        </table>
        </Scrollbereich>
      </Card>

      <Abschnitt sub="Ausgabe, Prüfung und Nachweis. Nichts hiervon verändert den Betrieb — es liest ihn nur aus.">
        Werkzeuge und Nachweis</Abschnitt>

      <Card style={{ marginBottom: 16 }}>
        <CardHead>Daten</CardHead>
        <div style={{ padding: 22, display: "flex", gap: 11, flexWrap: "wrap" }}>
          <Btn onClick={akt.exportCSV}>Monatsplan als CSV</Btn>
          <Btn onClick={() => window.print()}>Drucken</Btn>
          <Btn onClick={akt.exportJSON}>Sicherung exportieren</Btn>
        </div>
      </Card>

      <Card>
        <CardHead right={<Btn size="sm" kind="primary" disabled={laeuftTest}
          onClick={async () => { setLaeuftTest(true);
            try { const f = await selbsttestLaden(); setTests(f()); }
            catch (e) { setTests([{ name: "Prüfungen konnten nicht geladen werden", ok: false,
              erwartet: "", ist: String(e.message) }]); }
            finally { setLaeuftTest(false); } }}>
          {laeuftTest ? "Lädt …" : "Starten"}</Btn>}>Selbsttest</CardHead>
        <div style={{ padding: 22 }}>
          {!tests && <div style={{ fontSize: 13.5, color: C.dimmer, lineHeight: 1.5 }}>
            Prüft Rechenkern, Zugriffstiefe, Kostenfortschreibung, Datenschutz der Betreibersicht und Rechnungserzeugung gegen feste Erwartungswerte. Die Prüfungen werden erst beim Starten geladen — sie gehören nicht ins Gepäck eines Kunden.</div>}
          {tests && (<>
            <div style={{ marginBottom: 16 }}><Pill tone={tests.every((t) => t.ok) ? "ok" : "danger"}>
              {tests.filter((t) => t.ok).length} von {tests.length} bestanden</Pill></div>
            {tests.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 13, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 23, height: 23, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center",
                  justifyContent: "center", background: t.ok ? C.okLight : C.dangerLight,
                  color: t.ok ? C.ok : C.danger }}>
                  <Icon n={t.ok ? "haken" : "x"} size={13} strokeWidth={2.5} />
                  <span className="nurLeser">{t.ok ? "bestanden" : "nicht bestanden"}</span></span>
                <span style={{ fontSize: 13.5, flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: 12.5, color: t.ok ? C.dim : C.danger, fontWeight: 600, ...NUM }}>{t.ist}</span>
              </div>))}
          </>)}
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <CardHead>Protokoll</CardHead>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {m.protokoll.length === 0 && <div style={{ padding: 26, fontSize: 13.5, color: C.dimmer }}>Noch keine Änderungen.</div>}
          {m.protokoll.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 16, padding: "11px 22px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ fontSize: 12, color: C.dimmer, minWidth: 136, ...NUM }}>{l.zeit}</span>
              <span style={{ fontSize: 13.5, color: C.dim }}>{l.text}</span></div>))}
        </div>
      </Card>
    </div>);
}





/**
 * Auswertung für den Betriebsrat (WP-27): Summen je Monat und Einheit aus dem
 * vollständigen Bestand, vom Server gerechnet (server/lib/br-auswertung.mjs).
 * Unter drei Personen stehen keine Zahlen. Mit export.data als CSV — nur diese
 * Aggregate, nie Personen.
 */
function BetriebsratAuswertung({ sitz, melde }) {
  const m = sitz.mandant;
  /* Der Server rechnet im Hintergrund (GET /api/br-auswertung): bis das Ergebnis da ist, kommt „wird berechnet“ — dann wiederholen. */
  const [stand, setStand] = useState({ status: "laedt" });
  useEffect(() => {
    let vorbei = false, uhr = null;
    const hole = async () => {
      try {
        const r = await SP.brAuswertung();
        if (vorbei) return;
        setStand(r);
        if (r.status === "berechnet") uhr = setTimeout(hole, r.retryNachMs || 1500);
      } catch (e) { if (!vorbei) setStand({ status: "fehler", text: e.message }); }
    };
    hole();
    return () => { vorbei = true; if (uhr) clearTimeout(uhr); };
  }, [m.id]);
  const a = stand.status === "fertig" ? stand.auswertung : null;
  const berechnetUm = stand.status === "fertig" && stand.berechnetUm ? new Date(stand.berechnetUm).toLocaleString("de-DE") : null;
  const einheit = (id) => (id === null ? "Betrieb gesamt" : ((m.einheiten || []).find((e) => e.id === id) || {}).name || id);
  const SPALTEN = [["personen", "Personen"], ["dienste", "Dienste"], ["nachtdienste", "Nachtdienste"], ["sonntagsdienste", "Sonntagsdienste"],
    ["langeDienste", "Dienste über 10 h"], ["ruhezeitUnter11", "Ruhezeit unter 11 h"], ["istStunden", "Ist-Stunden"], ["istErfasst", "Ist erfasst"]];
  if (stand.status === "laedt" || stand.status === "berechnet")
    return <Card><Leer titel="Die Auswertung wird berechnet" text="Das dauert bei großen Betrieben einen Moment. Die Seite aktualisiert sich von selbst." /></Card>;
  if (!a || !Array.isArray(a.zeilen))
    return <Card><Leer titel="Keine Auswertung" text={stand.text || "Die Auswertung liefert der Server nur an den Betriebsrat."} /></Card>;
  const istSpalte = (k) => k === "istStunden" || k === "istErfasst";
  /* † = seit der ersten Ausgabe wurden Zeiten korrigiert; die Zahl bleibt, wie sie ausgegeben wurde.
     ‡ = der Monat wurde ohne diese Zeile eingefroren; ihr Ist bleibt dauerhaft nicht verfügbar (WP-27b, B1). */
  const zelle = (z, k) => (z.gesperrt && k !== "personen" ? "–" : String(z[k] ?? "–") + (z.istKorrigiert && istSpalte(k) ? " †" : "") + (z.istNichtVerfuegbar && istSpalte(k) ? " ‡" : ""));
  const csv = () => {
    const kopf = ["Monat", "Einheit", ...SPALTEN.map(([, l]) => l)].map(csvFeld).join(";");
    /* Einheitsnamen sind frei benennbar: maskiert und gegen Formel-Injection geschützt (WP-27b, B6). */
    const reihen = a.zeilen.map((z) => [csvFeld(z.monat), csvText(einheit(z.einheitId)), ...SPALTEN.map(([k]) => csvFeld(zelle(z, k)))].join(";"));
    if (lade(`auswertung-betriebsrat-${a.stand}.csv`, [kopf, ...reihen].join("\n"), "text/csv;charset=utf-8")) melde("Auswertung als CSV gespeichert.");
  };
  return (
    <div>
      <H1 sub={`Summen je Monat und ${m.einheitLabel || "Einheit"}, ${a.von} bis ${a.bis}. Unter ${a.mindestgruppe} Personen stehen keine Zahlen; ist eine Einheit gesperrt, fehlt auch die Gesamtzeile des Monats. Die tatsächlichen Zeiten (Ist) erscheinen erst, wenn der Monat abgeschlossen ist, nachträgliches Bestätigen nicht mehr möglich ist und mindestens ${a.mindestgruppe} Personen bestätigt haben. Personen werden nie genannt.${berechnetUm ? ` Berechnet am ${berechnetUm} (höchstens alle paar Minuten neu).` : ""}${a.zeilen.some((z) => z.istKorrigiert) ? " † Seit der ersten Ausgabe wurden bestätigte Zeiten korrigiert; die Zahl bleibt unverändert." : ""}${a.zeilen.some((z) => z.istNichtVerfuegbar) ? " ‡ Ist nicht verfügbar: Der Monat wurde ohne diese Zeile festgeschrieben, ein späteres Ist bleibt aus Datenschutzgründen weg." : ""}`}
        right={darf(sitz, "export.data") && <Btn onClick={csv}>Als CSV exportieren</Btn>}>Auswertung</H1>
      <Card>
        <Scrollbereich label="Auswertung für den Betriebsrat, Tabelle je Monat und Einheit">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Monat", "Einheit", ...SPALTEN.map(([, l]) => l)].map((l) => (
            <th key={l} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.line}` }}>{l}</th>))}</tr></thead>
          <tbody>{a.zeilen.map((z) => (
            <tr key={`${z.monat}|${z.einheitId}`} style={{ color: z.gesperrt ? C.dim : undefined }}>
              <td style={{ padding: "6px 10px" }}>{z.monat}</td><td style={{ padding: "6px 10px" }}>{einheit(z.einheitId)}</td>
              {SPALTEN.map(([k]) => <td key={k} style={{ padding: "6px 10px", ...NUM }}>{zelle(z, k)}</td>)}
            </tr>))}</tbody>
        </table>
        </Scrollbereich>
      </Card>
    </div>);
}

/* ================================ ANWENDUNG ============================== */
function AppInnen() {
  const [db, setDb] = useState(null);
  const [view, setView] = useState("start");
  const [ym, setYm] = useState(heute().slice(0, 7));
  /* Der gewählte Standort gilt über die Ansichten hinweg. Wer in der
     Personalliste Hannover einstellt und in den Monatsplan wechselt, will
     dort nicht wieder alle Häuser sehen. */
  const [standortId, setStandortId] = useState(ALLE_STANDORTE);
  const [tag, setTag] = useState(null);
  const [person, setPerson] = useState(null);
  const [detail, setDetail] = useState(null);
  const [hinweis, setHinweis] = useState(null);
  const [ausgabe, setAusgabe] = useState(null);
  const [krank, setKrank] = useState(null);
  const [assist, setAssist] = useState(false);
  const [eskal, setEskal] = useState(null);
  const [warnung, setWarnung] = useState(null);
  const [ausgl, setAusgl] = useState(null);
  const [konflikt, setKonflikt] = useState(false);
  /* WP-22: warnende Befunde, die der Server bestätigt haben will (409). */
  const [fachFrage, setFachFrage] = useState(null);
  /* Was beim Speichern schiefging. Kein Hinweis, der nach drei Sekunden
     verschwindet — bei ungespeicherter Arbeit ist das die falsche Form. */
  const [nichtGespeichert, setNichtGespeichert] = useState(null);
  /* Kommt der angezeigte Plan aus dem Speicher des Dienstarbeiters? Dann
     muss das dranstehen — samt Alter. */
  const [offline, setOffline] = useState(null);
  const [schnell, setSchnell] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [verfDlg, setVerfDlg] = useState(null);
  const [nwDlg, setNwDlg] = useState(null);
  const [antragVon, setAntragVon] = useState(null);
  const [tauschVon, setTauschVon] = useState(null);
  const [kmd, setKmd] = useState(false);
  const [wunschDlg, setWunschDlg] = useState(null);
  const [notizDlg, setNotizDlg] = useState(null);
  const [mehrfach, setMehrfach] = useState(false);
  // Mobil zuerst: Wer im Schichtdienst ist und keine Planungsrechte hat, startet
  // in der Telefonansicht — unabhängig von der Bildschirmbreite.
  const [rechnerAnsicht, setRechnerAnsicht] = useState(false);
  const [einf, setEinf] = useState(false);
  const [vorbelegung, setVorbelegung] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [ladefehler, setLadefehler] = useState(null);
  /* Zähler, der das Laden erneut anstößt. Seit das Abmelden die Seite neu
     lädt, wird er nur noch beim Anmelden hochgezählt — er bleibt, weil das
     Laden weiterhin an ihm hängt. */
  const [angemeldetStand] = useState(0);
  const [dicht, setDicht] = useState(false);
  const [fokus, setFokus] = useState(false);
  const [seiteOffen, setSeiteOffen] = useState(false);
  /* WP-21 Teil 2: Fokus hinein beim Öffnen der Seitenleiste, zurück zur Menütaste beim Schließen. */
  const seiteWarOffen = useRef(false);
  useEffect(() => { seitenleisteFokus(document, seiteOffen, seiteWarOffen.current); seiteWarOffen.current = seiteOffen; }, [seiteOffen]);
  const [imp, setImp] = useState(false);
  const [postfach, setPostfach] = useState(false);
  const [schmal, setSchmal] = useState(false);
  const ref = useRef(null); const erst = useRef(true); const verlauf = useRef([]);

  useEffect(() => {
    const f = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setKmd((x) => !x); }
      /* WP-21: Escape schliesst die geoeffnete Seitenleiste (Telefon, Tablet); bei geschlossener ist es ein No-op. */
      if (e.key === "Escape") setSeiteOffen(false);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  useEffect(() => {
    const wieder = () => { setOffline(null); };
    const weg = () => setOffline((o) => o || { geholt: null });
    window.addEventListener("online", wieder);
    window.addEventListener("offline", weg);
    if (typeof navigator !== "undefined" && navigator.onLine === false) weg();
    return () => { window.removeEventListener("online", wieder);
      window.removeEventListener("offline", weg); };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const f = () => setSchmal(mq.matches);
    f(); mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f); };
  }, []);

  /* Bestand vom Server holen. Ist noch keiner da, wird der Beispielbetrieb
     angelegt — so ist ein frisch eingerichteter Zugang sofort benutzbar. */
  /* Der Ladevorgang ist abbrechbar. Läuft der Effekt ein zweites Mal
     (React.StrictMode tut das in der Entwicklung; eine spätere Änderung
     der Abhängigkeiten täte es überall), setzte bisher jeder der beiden
     Läufe seinen Bestand — der zweite überschrieb dabei alles, was
     zwischendurch schon geschah, etwa den Start der Tour. Sichtbar wurde
     es als grundloser PUT mit unverändertem Inhalt kurz nach der
     Anmeldung. Jetzt zählt nur der jüngste Lauf. */
  useEffect(() => { let lebt = true; (async () => {
    if (!SP.angemeldet()) { setLaedt(false); return; }
    try {
      const { bestand, zugang, ausSpeicher, geholt } = await SP.lies();
      if (!lebt) return;
      if (ausSpeicher) setOffline({ geholt });

      /* Migration statt Wegwerfen. Ein Bestand aus einer älteren Fassung
         wird schrittweise hochgezogen; einer aus einer neueren bleibt
         unangetastet und die Anwendung sagt, was zu tun ist. Vorher wurde
         beides gleich behandelt: durch Beispieldaten ersetzt. */
      let b;
      if (!bestand) {
        /* Einen leeren Raum befüllt die Oberfläche nicht mehr selbst — bis
           Oktober 2026 schrieb hier der erste Client den Startbestand. Den
           Raum richtet der Betreiber ein (/api/bestand-anlegen). */
        setLadefehler({ titel: "Dieser Raum ist noch nicht eingerichtet.",
          text: zugang && zugang.rolle === "betreiber"
            ? "Als Betreiber kannst du ihn mit dem Demo-Bestand einrichten (Nordwacht, Lindenhof, Steinbach)."
            : "Bitte wende dich an die Organisationsleitung oder an den Betreiber.",
          demoAnlegen: !!(zugang && zugang.rolle === "betreiber") });
        setLaedt(false);
        return;
      } else {
        const erg = migriere(bestand);
        if (!erg.ok) {
          setLadefehler(migrationstext(erg));
          setLaedt(false);
          return;
        }
        b = erg.bestand;
        if (erg.schritte > 0) {
          /* Sofort zurückschreiben, damit die Migration nicht bei jedem
             Öffnen erneut läuft — und damit ein Fehler darin früh auffällt. */
          SP.schreib(b, { durch: "Migration", sofort: true });
        }
      }
      /* Der Zugangscode bestimmt die Rolle. Ein Demozugang landet damit
         unmittelbar dort, wo er hingehört — ohne Rollenauswahl.

         Hier stand `&& !b.session`, und das kehrte die Aussage um: Lag im
         Betrieb schon eine Sitzung, gewann sie gegen den Zugangscode.
         `session` ist aber ein Feld des Bestands und für jede Rolle
         beschreibbar — die Sitzung *irgendeines* Besuchers wurde damit für
         alle folgenden verbindlich.

         Sichtbar wurde es an den Demobetrieben: Wer einen davon öffnete,
         hinterließ dort seine Person. Der Betreiber meldete sich danach
         mit seinem Code an, bekam die fremde Sitzung untergeschoben und
         landete als Pflegekraft im Monatsplan — ohne Schreibrecht, weil
         sein Token in Wahrheit „betreiber" trug. Die Betreiberkonsole war
         auf diesem Weg nicht mehr erreichbar.

         Der Code in der Hand entscheidet, nicht der Rückstand im Speicher. */
      /* Demo (Betreiberentscheidung D.2): Der Rollenwähler hängt am Merkmal demo des Zugangs, nicht an der Rolle „kunde“. Er ändert nur die Ansicht; Rechte und Daten bestimmt weiter die Rolle des Tokens, und Verwaltungswege sind für Demo-Sitzungen serverseitig gesperrt. „kunde“ bleibt als Altbestand gleich behandelt, bis die Umstellung gelaufen ist. */
      if (zugang && zugang.rolle && zugang.rolle !== "kunde" && zugang.demo !== true) {
        if (zugang.rolle === "betreiber") b = { ...b, session: { rolle: "betreiber" } };
        else {
          const mand = b.mandanten[zugang.betrieb || 0] || b.mandanten[0];
          if (mand) {
            const kand = mand.personen.filter((p) => p.rolle === zugang.rolle && imDienst(p, heute()));
            /* `zugang.person` war hier ein Array-Index. Die Betreiberkonsole
               hinterlegt beim Ausstellen eines Codes aber die Kennung der
               Person — „p1", nicht 1. `mand.personen["p1"]` ist undefined,
               es entstand keine Sitzung, und jede Beschäftigte mit einem
               personengebundenen Code landete auf dem Rollenwähler der
               Vorführfassung. Nur Codes ohne Person oder mit numerischem
               Index kamen durch.

               Aufgelöst wird jetzt zuerst über die Kennung, dann über den
               Index. Und ein gesetzter Wert, der auf niemanden passt, fällt
               nicht mehr auf den ersten Kandidaten zurück — das meldete
               jemanden als eine andere Person an. Er führt zu keiner
               Sitzung und zu einer klaren Meldung. */
            let p = null;
            if (zugang.person == null) p = kand[0];
            else {
              p = mand.personen.find((x) => x.id === zugang.person)
                || (Number.isInteger(zugang.person) ? mand.personen[zugang.person] : null)
                || null;
              if (!p && mand.personen.length)
                setLadefehler(`Der Zugangscode gehört zu einer Person, die es in „${mand.name}" nicht mehr gibt. `
                  + "Bitte einen neuen Code ausstellen lassen.");
            }

            /* Ein frisch angelegter Betrieb hat noch keine Person — und ohne
               Person gibt es keine Sitzung, also auch keinen Weg hinein. Der
               Selbststart endete damit auf einer Rollenauswahl ohne Auswahl.

               Die erste Person ist die, die den Zugangscode in der Hand hält.
               Sie wird hier angelegt, mit der Rolle aus dem Code und Zugriff
               auf alle Einheiten. Umbenennen lässt sich sie unter Personal. */
            if (!p && !mand.personen.length) {
              const ersteEinheit = (mand.einheiten || [])[0];
              p = {
                id: uid("p"),
                vorname: "",
                nachname: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
                funktion: ROLLENBEZEICHNUNG[zugang.rolle] || "Leitung",
                email: mand.kontakt || "",
                zugehoerigkeit: ersteEinheit
                  ? [{ ab: mand.seit || heute(), einheitId: ersteEinheit.id }] : [],
                eintritt: mand.seit || heute(),
                austritt: null,
                wochenstunden: (mand.einstellungen || {}).wochenstunden || 40,
                urlaubsanspruch: (mand.einstellungen || {}).urlaubsanspruch || 30,
                urlaubsuebertrag: 0,
                stundenuebertrag: 0,
                qualifikationen: [],
                teilzeit: null,
                springer: false,
                einschraenkungen: {},
                rolle: zugang.rolle,
                rolleSeit: heute(),
                rolleVerlauf: [],
                /* Alle Einheiten: Wer den Betrieb einrichtet, muss überall
                   hinsehen können. */
                bereich: "ALLE",
                status: "aktiv",
                /* Die Leitung fährt nicht zwangsläufig selbst Schicht — das
                   entscheidet sie später unter Personal. */
                imSchichtdienst: false,
              };
              const mitPerson = { ...mand, personen: [p] };
              b = { ...b, mandanten: b.mandanten.map((x) => x.id === mand.id ? mitPerson : x) };
            }

            if (p) b = { ...b, session: { rolle: "kunde", mandantId: mand.id, personId: p.id } };
          }
        }
      }
      setDb(b);
    } catch (e) {
      if (lebt && String(e.message) !== "nicht-angemeldet") setLadefehler(String(e.message));
    } finally { if (lebt) setLaedt(false); }
  })(); return () => { lebt = false; }; }, [angemeldetStand]);

  useEffect(() => { ref.current = db; }, [db]);


  /* Zustellung anstoßen — erst nachdem gespeichert ist (Commit 4). Der
     Server stellt nur zu, was in seinem gespeicherten Stand steht; vorher
     lief dieser Lauf schon beim Ändern los und schickte Adresse, Betreff,
     Text und Push-Titel selbst mit. Jetzt gehen nur die Kennungen der hier
     angelegten Mitteilungen hinaus. Was der Server als „offen" meldet
     (vorübergehender Fehler), wird beim nächsten Speichern erneut
     angestoßen; doppelt geht nichts hinaus — das verhindert der Server.
     Notruf und Tauschmeldung stellt der Server beim Speichern selbst zu. */
  const zustellungAnstossen = useCallback(async (geschrieben) => {
    const mid = (ref.current && ref.current.session || {}).mandantId;
    const m = (geschrieben.mandanten || []).find((x) => x && x.id === mid);
    if (!m) return;
    const da = new Set((m.nachrichten || []).map((n) => n && n.id));
    const ids = [...zustellungAusstehend].filter((id) => da.has(id)).slice(0, 200);
    if (!ids.length) return;
    for (const id of ids) zustellungAusstehend.delete(id);
    try {
      const { ergebnis, fehler } = await SP.zustellen(ids);
      if (fehler) { for (const id of ids) zustellungAusstehend.add(id); return; }
      for (const e of ergebnis || []) if (e && e.stand === "offen") zustellungAusstehend.add(e.id);
    } catch (e) { for (const id of ids) zustellungAusstehend.add(id); }   // Zustellung ist nie kritisch
  }, []);

  /* Zurückschreiben, verzögert gebündelt. Bei einem Konflikt wird nicht
     stillschweigend überschrieben — die Person erfährt davon. */
  /* Zwei Sicherungen vor dem Schreiben.

     Erstens: Nicht schreiben, wenn sich nichts geändert hat. Der Effekt
     hängt am Objekt, nicht am Inhalt — ein setDb mit gleichem Inhalt löste
     bisher einen vollen PUT aus. Beim Betriebsrat wurde daraus ein 403 des
     Servers und ein Dialog „Diese Änderung ist mit deiner Rolle nicht
     zulässig", der die Seitenleiste verdeckte — für eine Änderung, die es
     nie gab. Verglichen wird der Inhalt ohne den Stand, denn den zählt der
     Server selbst hoch.

     Zweitens: Wer nur lesen darf, schreibt nie von selbst. Ein Betriebsrat
     kann in der Oberfläche nichts ändern; ein automatischer Schreibversuch
     wäre in jedem Fall abgewiesen und würde ihm nur die Sperre einbringen. */
  /* Verglichen wird ohne `stand` und ohne `session`: Den Stand zählt der
     Server, die Sitzung ist Zustand dieses Reiters und geht nie hinaus.
     Beim Anmelden wird der Bestand zweimal gesetzt — erst ohne, dann mit
     Sitzung. Zählte die Sitzung mit, unterschieden sich die beiden, und
     genau dieser Unterschied war der grundlose PUT nach jeder Anmeldung. */
  /* Die Schlüssel werden sortiert: Zwei Bestände gleichen Inhalts, deren
     Objekte nur in anderer Reihenfolge aufgebaut wurden (etwa weil die
     Sitzung einmal fehlt und einmal in der Mitte steht), sind sonst als
     Text verschieden — und lösten so den nächsten grundlosen PUT aus. */
  const abbildVon = (d) => {
    const { stand, session, ...rest } = d; // eslint-disable-line no-unused-vars
    return JSON.stringify(rest, (k, v) => v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((s) => [s, v[s]])) : v);
  };
  const zuletztGeschrieben = useRef(null);
  useEffect(() => { if (!db) return; if (erst.current) { erst.current = false; zuletztGeschrieben.current = abbildVon(db); return; }
    const abbild = abbildVon(db);
    if (abbild === zuletztGeschrieben.current) return;
    if (db.session && db.session.personId) {
      const mm = db.mandanten.find((x) => x.id === db.session.mandantId);
      const pp = mm && mm.personen.find((x) => x.id === db.session.personId);
      if (pp && pp.rolle === "betriebsrat") return;
    }
    zuletztGeschrieben.current = abbild;
    SP.schreib(db, {
      durch: db.session && db.session.personId
        ? (() => { const mm = db.mandanten.find((x) => x.id === db.session.mandantId);
            const pp = mm && mm.personen.find((x) => x.id === db.session.personId);
            return pp ? `${pp.vorname} ${pp.nachname}` : "Betreiber"; })()
        : "Betreiber",
      onKonflikt: (d) => setKonflikt({ ...d, meiner: ref.current }),
      onFachbefunde: (d) => setFachFrage(d),
      onFehler: (lage) => setNichtGespeichert(lage),
      onGespeichert: (b) => { zustellungAnstossen(b); },
      onServerstand: (st) => setDb((s) => vertragsstandUebernehmen(s, st)),
    });
  }, [db, zustellungAnstossen]);

  const melde = useCallback((t) => { setHinweis(t); setTimeout(() => setHinweis(null), 3000); }, []);

  const sitz = useMemo(() => {
    if (!db || !db.session) return null;
    if (db.session.rolle === "betreiber") return { rolle: "betreiber", db };
    const m = db.mandanten.find((x) => x.id === db.session.mandantId);
    if (!m) return null;
    const p = m.personen.find((x) => x.id === db.session.personId);
    if (!p) return null;
    return { rolle: "kunde", db, mandant: m, person: p };
  }, [db]);

  /* Dichte: Die Einstellung der Person ist die Quelle — in den Einstellungen wie im Kopfmenü.
     Vorher speicherte die Einstellung nur p.dichte, und nichts las sie: die Umschaltung blieb wirkungslos. */
  const dichtePerson = sitz && sitz.person ? sitz.person.dichte : undefined;
  useEffect(() => { if (dichtePerson === "kompakt" || dichtePerson === "komfortabel") setDicht(dichtePerson === "kompakt"); }, [dichtePerson]);

  /* Beim ersten Anmelden startet die Tour von selbst — außer sie wurde
     abgeschlossen oder abgeschaltet.

     Vorher las diese Stelle db.session.personId und suchte Betrieb und
     Person selbst zusammen. Bei einem selbst angelegten Betrieb wird die
     erste Person aber erst beim Anmelden erzeugt; in dem Rendern, in dem
     die Sitzung stand, gab es sie noch nicht — der Merker war da schon
     gesetzt, und die Tour startete nie. Genau dort, wo sie am nötigsten
     ist: beim allerersten Öffnen eines leeren Betriebs.

     Jetzt hängt sie an `sitz`. Das ist dieselbe aufgelöste Sitzung, die
     auch die Oberfläche benutzt — gibt es sie, gibt es die Person. */
  const tourGeprueft = useRef(false);
  useEffect(() => {
    if (tourGeprueft.current) return;
    if (!sitz || !sitz.person || !sitz.mandant) return;
    const pp = sitz.person, mm = sitz.mandant;
    tourGeprueft.current = true;
    if (tourStartet(pp, pp.rolle || "mitarbeiter"))
      setDb((d) => ({ ...d, mandanten: d.mandanten.map((x) => x.id !== mm.id ? x
        : { ...x, personen: x.personen.map((y) => y.id !== pp.id ? y
          : { ...y, tour: { ...(y.tour || {}), offen: true, schritt: 0 } }) }) }));
  }, [sitz]);

  /* --- Urlaubshinweise auslösen ---

     Läuft einmal je Sitzung, nicht bei jeder Änderung. Der Hinweis ist eine
     Pflicht des Arbeitgebers, keine Erinnerung für die Belegschaft: Ohne ihn
     verfällt der Urlaub gar nicht erst, und er häuft sich über Jahre an.

     Festgehalten wird das Datum an der Person — so wird niemand zweimal im
     selben Jahr angeschrieben, auch nicht nach einem Gerätewechsel. */
  const urlaubsLauf = useRef(false);
  useEffect(() => {
    if (!db || urlaubsLauf.current) return;
    if (!urlaubshinweiseAnlegen(sitz, SP.zugangsdaten())) return;
    const m = sitz.mandant;
    let faellig = [];
    try { faellig = urlaubshinweiseFaellig(m, heute()); }
    catch (e) { return; }
    if (!faellig.length) return;
    urlaubsLauf.current = true;

    setDb((s2) => {
      if (!s2) return s2;
      const mm = s2.mandanten.find((x) => x.id === m.id);
      if (!mm) return s2;
      const neueNachrichten = faellig.map((f) => baueMitteilung(mm, f.person.id, "urlaubVerfaellt",
        `${f.offen} ${f.offen === 1 ? "Urlaubstag" : "Urlaubstage"} verfallen zum Jahresende`,
        `${f.text} Übertragung ins nächste Jahr ist nur bei dringenden betrieblichen oder `
        + `persönlichen Gründen möglich, dann bis zum ${fKurz(f.uebertragBis)}. `
        + "Bitte plane deinen Urlaub rechtzeitig ein.",
        "meine")).filter(Boolean);
      if (!neueNachrichten.length) return s2;
      const heuteIso = heute();
      return { ...s2, mandanten: s2.mandanten.map((x) => x.id !== mm.id ? x : {
        ...x,
        nachrichten: [...(x.nachrichten || []), ...neueNachrichten],
        personen: x.personen.map((pp) => faellig.some((f) => f.person.id === pp.id)
          ? { ...pp, urlaubshinweis: heuteIso } : pp),
      }) };
    });
    melde(`${faellig.length} ${faellig.length === 1 ? "Hinweis" : "Hinweise"} zum Resturlaub verschickt.`);
  }, [db, sitz]);


  const [themaZaehler, setThemaZaehler] = useState(0);
  /* Betreiber haben keine Person, an der die Wahl hängt: Ihre Wahl gilt für dieses Gerät
     (derselbe Speicher wie im Einstieg, v4/thema.js). */
  const [betreiberThema, setBetreiberThema] = useState(() => v4ThemaGemerkt() || "auto");

  /* Vorrang: ausdrückliche Wahl (Hell/Dunkel der Person, sonst die auf diesem
     Gerät gemerkte) vor der Systemeinstellung. Ohne Wahl — oder bei "Wie das
     Gerät" — folgt die Anwendung dem System und späteren Änderungen daran.
     Dieselbe Regel gilt im Einstieg (v4/thema.js); die Wahl wird pro Gerät
     gemerkt, damit beide übereinstimmen. */
  useEffect(() => {
    const p = sitz && sitz.person;
    const eigene = p ? p.thema : betreiberThema;
    v4ThemaMerken(eigene);
    const wahl = eigene === "hell" || eigene === "dunkel" ? eigene : (eigene === "auto" ? null : v4ThemaGemerkt());
    if (wahl === "hell" || wahl === "dunkel") {
      themaSetzen(wahl === "dunkel");
      setThemaZaehler((n) => n + 1);
      return undefined;
    }
    themaSetzen(themaVomSystem());
    setThemaZaehler((n) => n + 1);
    return v4SystemthemaBeobachten((e) => { themaSetzen(e.matches); setThemaZaehler((n) => n + 1); });
  }, [sitz && sitz.person && sitz.person.thema, sitz && !sitz.person ? betreiberThema : null]);


  const akt = useMemo(() => {
    /* Rückgängig-Tiefe an der Bestandsgröße ausrichten.

       Zwanzig vollständige Kopien sind bei einem Betrieb von fünf Megabyte
       hundert Megabyte im Reiter — auf einem älteren Diensttelefon der
       Grund, warum die Anwendung „einfach zuklappt". Bei kleinen Beständen
       bleibt es bei zwanzig, bei großen schrumpft die Tiefe. */
    const verlaufTiefe = (s) => {
      try {
        const kb = JSON.stringify(s).length / 1024;
        if (kb < 400) return 20;
        if (kb < 1500) return 10;
        if (kb < 4000) return 5;
        return 3;
      } catch { return 5; }
    };
    const upd = (fn) => setDb((s) => { if (!s) return s; verlauf.current = [s, ...verlauf.current].slice(0, verlaufTiefe(s));
      const next = fn(s); return next === s ? s : { ...next, stand: (s.stand || 0) + 1 }; });
    /** Ändert den aktuellen Mandanten und schreibt einen Protokolleintrag. */
    const mUpd = (fn, text) => upd((s) => {
      const mid = s.session.mandantId;
      return { ...s, mandanten: s.mandanten.map((m) => {
        if (m.id !== mid) return m;
        const next = fn(m);
        /* Beschäftigte bekommen das Protokoll vom Server nicht mit (siehe
           bestandFuerRolle). Ohne den Rückfall auf die leere Liste brach
           hier jede Änderung einer beschäftigten Person — „next.protokoll
           is not iterable" — und am Telefon ging kein Antrag mehr hinaus. */
        return text ? { ...next, protokoll: [{ id: uid("l"), zeit: new Date().toLocaleString("de-DE"), text }, ...(next.protokoll || [])].slice(0, 200) } : next;
      }) };
    });
    const bLog = (s, text) => ({ ...s, protokoll: [{ id: uid("l"), zeit: new Date().toLocaleString("de-DE"), text }, ...(s.protokoll || [])].slice(0, 300) });
    const jetzt = () => new Date().toLocaleString("de-DE");
    /** Wer gerade bestätigt — für das Bestätigungsprotokoll. */
    const wer = () => ({ personId: sitz && sitz.person ? sitz.person.id : null,
      name: sitz && sitz.person ? `${sitz.person.vorname} ${sitz.person.nachname}` : "unbekannt",
      rolle: sitz ? sitz.rolle : null });

    /* Die Antworten des Servers auf Stempel übernehmen (WP-07: auch für
       Stempel aus dem Puffer, die später durchkamen). Mehrere Quittungen
       eines Sendelaufs kommen gesammelt — ein Nachladen, nicht eines je
       Stempel (Review L6). eintraege: [{ datum, art, erg }]. */
    /* Nach einem eigenen Serverweg (Monatsabschluss, WP-16): den gespeicherten Stand samt ETag
       nachladen — wie stempelUebernehmen —, damit kein PUT mit altem ETag hinterherläuft und am
       geänderten Kern scheitert. Steht lokal etwas aus, wird die Antwort nur gespiegelt. */
    const serverstandNachladen = async (spiegeln) => {
      if (ref.current && !SP.schreibenAusstehend() && abbildVon(ref.current) === zuletztGeschrieben.current) {
        try {
          const neu = await SP.lies();
          const mig = neu.bestand && !neu.ausSpeicher ? migriere(neu.bestand) : null;
          const jetzt = ref.current;
          if (mig && mig.ok && mig.schritte === 0 && jetzt && !SP.schreibenAusstehend()
            && abbildVon(jetzt) === zuletztGeschrieben.current) {
            const naechster = { ...mig.bestand, session: jetzt.session, stand: (jetzt.stand || 0) + 1 };
            zuletztGeschrieben.current = abbildVon(naechster);
            setDb(naechster);
            return;
          }
        } catch { /* nachladen gescheitert: lokal spiegeln */ }
      }
      upd(spiegeln);
    };
    const stempelUebernehmen = async (pid, eintraege) => {
      if (!eintraege.length) return;
      /* Gab es danach nichts Ungespeichertes, ist der lokale Stand der
         zuletzt gesendete — nur dann darf er durch den Serverstand
         ersetzt werden, ohne dass Arbeit verloren geht. (Ein
         gescheiterter Versuch bleibt in SP.ausstehend und im Hinweis
         „nicht gespeichert" erhalten.) */
      const ohneOffenes = !!ref.current && !SP.schreibenAusstehend()
        && abbildVon(ref.current) === zuletztGeschrieben.current;
      const meldungVon = ({ art, erg }) => {
        const kz = (erg.markierungen || []).map((x) => MARKIERUNG_TEXT[x] || x);
        return `${art === "start" ? "Eingestempelt" : "Ausgestempelt"} ${erg.zeit}${erg.ort ? ` · ${erg.ort}` : ""}${kz.length ? ` · ${kz.join(", ")}` : ""}${erg.offline ? " · bestätigt" : ""}`;
      };
      const meldung = eintraege.length === 1 ? meldungVon(eintraege[0])
        : `${eintraege.length} Stempel bestätigt · zuletzt: ${meldungVon(eintraege[eintraege.length - 1])}`;
      /* Geschrieben hat der Server. Bisher wurde seine Antwort lokal
         eingetragen — das änderte den Bestand, der Speicher-Effekt
         schickte daraufhin den ganzen Bestand per PUT mit dem alten
         ETag hinterher, und der Server wies ihn mit 409 ab. Jetzt wird
         der gespeicherte Stand samt ETag nachgeladen und als
         geschrieben vermerkt: kein zweiter Schreibvorgang, und die
         Versionskontrolle bleibt unangetastet (Bestand und ETag
         gehören zusammen). */
      if (ohneOffenes) {
        try {
          const neu = await SP.lies();
          const mig = neu.bestand && !neu.ausSpeicher ? migriere(neu.bestand) : null;
          const jetzt = ref.current;
          /* Nur wenn sich zwischendurch lokal nichts getan hat und kein Schreiben ansteht. */
          if (mig && mig.ok && mig.schritte === 0 && jetzt && !SP.schreibenAusstehend()
            && abbildVon(jetzt) === zuletztGeschrieben.current) {
            const naechster = { ...mig.bestand, session: jetzt.session, stand: (jetzt.stand || 0) + 1 };
            zuletztGeschrieben.current = abbildVon(naechster);
            setDb(naechster);
            melde(meldung);
            return;
          }
        } catch { /* nachladen gescheitert: unten wie bisher lokal nachziehen */ }
      }
      /* Sonst: die Serverantwort lokal nachziehen, damit die Ansicht
         sofort stimmt. Lag Ungespeichertes vor, geht es wie jede andere
         Änderung auf den regulären Schreibweg — ein 409 führt dann in
         den Konfliktdialog, nichts wird verworfen. */
      const spiegeln = (s2) => {
        const m = s2.mandanten.find((x) => x.id === (s2.session || {}).mandantId);
        if (!m) return s2;
        let mm = m;
        for (const { datum, art, erg } of eintraege) {
          const k = stempelSchluessel(pid, erg, datum);
          /* Übernommen wird, was der Server gespeichert hat (eintrag,
             erfassung) — nicht eine hier gebaute Kopie. Ein Fehler (etwa
             409 bei gleichzeitigem Speichern) landet unten im catch und
             ändert lokal nichts. */
          mm = { ...mm, einstempeln: { ...(mm.einstempeln || {}), [k]: erg.eintrag } };
          if (art === "ende" && erg.erfassung) mm = { ...mm, erfassung: { ...(mm.erfassung || {}),
            [k]: erg.erfassung } };
        }
        return { ...s2, mandanten: s2.mandanten.map((x) => x.id === m.id ? mm : x) };
      };
      const jetzt = ref.current;
      if (ohneOffenes && jetzt && !SP.schreibenAusstehend() && abbildVon(jetzt) === zuletztGeschrieben.current) {
        /* Nachladen ging nicht (etwa offline): Der Eintrag ist trotzdem
           nur das Spiegelbild dessen, was der Server schon hat — als
           geschrieben vermerkt, kein PUT. Der ETag bleibt der alte; die
           nächste echte Änderung läuft damit regulär in die
           Konfliktprüfung, statt fremde Änderungen zu überschreiben. */
        const naechster = { ...spiegeln(jetzt), stand: (jetzt.stand || 0) + 1 };
        zuletztGeschrieben.current = abbildVon(naechster);
        setDb(naechster);
      } else upd(spiegeln);
      melde(meldung);
    };

    /* WP-39: Kontext fuer die Aktionen in src/app/aktionen/ (dieselben Werte wie bisher im Abschluss). */
    const aktKontext = { bLog, db, jetzt, mUpd, melde, ref, serverstandNachladen, setAntragVon, setAssist, setAusgabe, setAusgl, setDetail, setEinf, setEskal, setImp, setKmd, setKrank, setMehrfach, setNotizDlg, setNwDlg, setSchnell, setVerfDlg, setView, setVorbelegung, setWarnung, setWizard, setWunschDlg, sitz, stempelUebernehmen, upd, wer, ym,
      /* akt entsteht erst mit diesem useMemo: beim Aufruf lesen, nicht beim Aufbau. */
      get akt() { return akt; } };
    return {
      /* Kurze Rückmeldung am unteren Rand. Bausteine, die selbst mit dem
         Server reden, brauchen sie — bisher hatte nur AppInnen sie. */
      melde,
      /* --- Anmeldung ---------------------------------------------------
         `abmelden` löschte bis hierher nur `db.session` — ein Feld des
         Bestands. Der Zugang selbst blieb bestehen: Token in
         sessionStorage, Token in localStorage, gültige Sitzung auf dem
         Server. Wer auf das Ausschaltzeichen in der Seitenleiste drückte,
         landete deshalb auf der Rollenauswahl der Vorführfassung — dem
         alten Anmeldebildschirm — und war in Wahrheit weiter angemeldet.
         Ein Klick auf eine Rolle führte ohne Code zurück hinein.

         Das ist an einem geteilten Stationsrechner genau der Fall, für
         den es den Knopf gibt. Abmelden heißt jetzt abmelden: Token weg,
         Offlinespeicher weg, Seite neu.

         Das Neuladen ist nicht Bequemlichkeit, sondern nötig. Ohne es
         bleibt die äußere Hülle in main.jsx bei „angemeldet" stehen,
         während der Bestand hier schon null ist — sichtbar als
         Ladeskelett, das nie fertig wird. */
      anmelden: (sess) => setDb((s) => ({ ...s, session: sess })),
      abmelden: abmeldenMitHinweis,
      verbindungTrennen: abmeldenMitHinweis,
      zurueck: () => { if (!verlauf.current.length) return melde("Nichts rückgängig zu machen.");
        const [l, ...r] = verlauf.current; verlauf.current = r; setDb(l); melde("Rückgängig gemacht."); },

      ...aktionenBetreiber(aktKontext),
      ...aktionenBetrieb(aktKontext),
      ...aktionenPlan(aktKontext),
      ...aktionenStammdaten(aktKontext),
      ...aktionenPlanung(aktKontext),
      ...aktionenEinstellungen(aktKontext),
      ...aktionenAusschreibung(aktKontext),
      ...aktionenBegleitung(aktKontext),
      ...aktionenZeiterfassung(aktKontext),
      ...aktionenBranchen(aktKontext),
      ...aktionenAssistenz(aktKontext),
      ...aktionenAusgaben(aktKontext),
    };
  }, [melde, ym, sitz]);

  /* WP-07: Stempelpuffer — senden beim Start, bei Netz und im Vordergrund;
     neu zeichnen, wenn er sich ändert (vorläufige Stempel in der Stempeluhr). */
  const aktRef = useRef(null);
  aktRef.current = akt;
  const [, setPufferStand] = useState(0);
  useEffect(() => SP.stempelBeobachten(() => setPufferStand((n) => n + 1)), []);
  useEffect(() => SP.stempelSyncEinrichten((ev, d) => { if (aktRef.current) aktRef.current.stempelQuittung(ev, d); }), []);

  /* WP-37: Verknüpfungen des Manifests (/?ansicht=meine, /?ansicht=krank).
     Einmal je Seitenaufruf, sobald die Person angemeldet ist; die Angabe
     wird danach aus der Adresszeile entfernt. Es gilt dieselbe Navigation
     samt Rechten wie sonst — eine nicht erlaubte Ansicht öffnet nichts. */
  const verknuepfungErledigt = useRef(false);
  const [mobilStart, setMobilStart] = useState(null);
  useEffect(() => {
    if (verknuepfungErledigt.current || !sitz || typeof window === "undefined") return;
    verknuepfungErledigt.current = true;
    const ziel = verknuepfungsZiel(window.location.search);
    if (!ziel) return;
    try { window.history.replaceState(null, "", ohneVerknuepfung(window.location.href)); }
    catch { /* Adresszeile bleibt, wie sie ist */ }
    const e = verknuepfungFuer(sitz, ziel);
    if (!e) return;
    if (e.art === "ansicht") { setView(e.id); setDetail(null); if (e.mobilTab) setMobilStart(e.mobilTab); }
    else if (aktRef.current) aktRef.current.oeffneKrankmeldung(e.personId);
  }, [sitz]);

  /* Zähler an den Navigationspunkten — was Aufmerksamkeit braucht, ist sofort sichtbar.
     Muss vor jedem bedingten Return stehen: Hooks laufen in fester Reihenfolge. */
  const { zaehler, zaehlerWarn } = useMemo(() => {
    if (!sitz || sitz.rolle === "betreiber" || !sitz.mandant) return { zaehler: {}, zaehlerWarn: {} };
    const m = sitz.mandant, p = sitz.person, z = {}, w = {};
    try {
      const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
      if (offen) z.antraege = offen;
      const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && !a.partnerId).length;
      if (boerse) z.boerse = boerse;
      const nl = nachweisLage(m);
      if (nl.abgelaufen.length) { z.nachweise = nl.abgelaufen.length; w.nachweise = true; }
      const bef = befundeFuer(sitz, pruefen(m, heute(), addDays(heute(), 13))).filter((b) => b.schwere === "danger").length;
      if (bef) { z.pruef = bef; w.pruef = true; }
      const heuteOffen = Object.values(besetzung(m, heute())).filter((b) => b.diff < 0).length;
      if (heuteOffen) { z.lage = heuteOffen; w.lage = true; }
      if (p.imSchichtdienst !== false) {
        const zeiten = offeneErfassung(m, p, addDays(heute(), -1)).length;
        if (zeiten) z.meine = zeiten;
      }
      const es = einrichtungsstand(m);
      if (!es.fertig && darf(sitz, "org.edit")) z.ablauf = es.offen.length;
    } catch (e) { /* Zähler sind Beiwerk — ein Fehler darf die Ansicht nicht verhindern */ }
    return { zaehler: z, zaehlerWarn: w };
  }, [sitz]);

  /* Ladefehler wurden bisher in einen Zustand geschrieben, den niemand
     rendert — sie verschwanden stumm, und die Anwendung blieb beim
     Ladehinweis stehen. Jetzt sind sie sichtbar; die Migration braucht das,
     weil ihre wichtigste Antwort lautet „nichts angefasst, bitte neu laden". */
  if (ladefehler) {
    const f = typeof ladefehler === "string"
      ? { titel: "Die Daten lassen sich nicht laden", text: ladefehler, neuladen: true }
      : ladefehler;
    return (<><style>{bauStyles()}</style>
      <div className="sw-root"><div style={{ minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", padding: "5vh 20px" }}>
        <Card style={{ padding: 30, maxWidth: 520 }}>
          <div role="alert">
            <div style={{ fontSize: 19, fontWeight: 650, marginBottom: 10 }}>{f.titel}</div>
            <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: "0 0 20px" }}>{f.text}</p>
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {f.neuladen && <Btn kind="primary" onClick={() => window.location.reload()}>Neu laden</Btn>}
            {f.demoAnlegen && <Btn kind="primary" onClick={async () => {
              try { await SP.bestandAnlegen(null, demobestand(), "demo"); window.location.reload(); }
              catch (e) { setLadefehler(String(e.message || e)); }
            }}>Demo-Bestand anlegen</Btn>}
            <Btn onClick={abmeldenMitHinweis}>Abmelden</Btn>
          </div>
        </Card></div></div></>);
  }

  /* Gerüst statt Satz.

     Zwischen Anmeldung und fertiger Oberfläche stand „CENTRIC wird geladen …"
     in der Bildmitte. Bei mehreren Megabyte über Mobilfunk sind das mehrere
     Sekunden ohne Fortschritt. Ein Umriss dessen, was gleich kommt, lässt
     dieselbe Wartezeit kürzer wirken und zeigt zugleich, dass etwas
     passiert. */
  if (!db) return (<><style>{bauStyles()}</style>
    <div className="sw-root" style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ width: 252, background: C.sidebar, flexShrink: 0 }} className="nur-breit" />
      <div style={{ flex: 1, padding: "28px 32px" }}>
        <div className="pulsiert" style={{ width: 220, height: 34, borderRadius: 8,
          background: C.flaecheStill, marginBottom: 12 }} />
        <div className="pulsiert" style={{ width: 320, height: 16, borderRadius: 6,
          background: C.flaecheStill, marginBottom: 30 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12, marginBottom: 26 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pulsiert" style={{ height: 92, borderRadius: 12,
              background: C.flaeche, border: `1px solid ${C.lineSoft}` }} />))}
        </div>
        <div className="pulsiert" style={{ height: 240, borderRadius: 12,
          background: C.flaeche, border: `1px solid ${C.lineSoft}` }} />
        <div className="nurLeser" role="status" aria-live="polite">CENTRIC wird geladen</div>
      </div>
    </div></>);
  if (!db.session) return (<><style>{bauStyles()}</style><Anmeldung db={db} onLogin={akt.anmelden} /></>);
  if (!sitz) return (<><style>{bauStyles()}</style><Anmeldung db={db} onLogin={akt.anmelden} /></>);

  const istBetreiber = sitz.rolle === "betreiber";
  const erlaubt = ([, , recht]) => ansichtErlaubt(sitz, recht);
  const nav = istBetreiber ? NAV_BETREIBER : NAV_KUNDE.filter(erlaubt);
  const bereiche = istBetreiber ? [] : BEREICHE
    .map((b) => ({ ...b, views: b.views.filter(erlaubt) })).filter((b) => b.views.length);
  const aktiveView = nav.some(([id]) => id === view) ? view : nav[0][0];
  const aktBereich = bereiche.find((b) => b.views.some(([id]) => id === aktiveView)) || bereiche[0];
  const r = istBetreiber ? ROLLEN[0] : rolle(sitz.person.rolle);
  const ungelesen = istBetreiber ? 0 : (sitz.mandant.nachrichten || []).filter((n) => n.personId === sitz.person.id && !n.gelesen).length;
  /* Für das Telefon ausgelegt. Der Monatsplan kam hinzu, seit er dort als
     Tagesliste statt als Raster erscheint — siehe Wochenliste. */
  /* Welche Ansichten auf dem Telefon ohne Vorbehalt taugen.

     „antraege" und „lage" standen hier nicht drin, obwohl die Leiste am
     unteren Rand beide anbietet: Wer sie antippte, landete auf einer Seite
     mit dem Hinweis „Für Tablet und Rechner ausgelegt". Die Leiste lud also
     irgendwohin ein, wo die Anwendung dann abriet.

     Beide arbeiten mit Karten, nicht mit breiten Tabellen, und laufen bei
     390 Pixeln ohne waagerechten Überlauf. Und beide sind genau das, was
     eine Schichtverantwortliche abends vom Sofa aus braucht: einen Antrag
     entscheiden und sehen, ob morgen jemand fehlt. */
  /* WP-21 Teil 2: Die Liste steht jetzt in src/ui/geraete.js (TELEFON_ANSICHTEN), samt Beleg in der Gerätematrix. */
  const mobilOk = telefonTauglich(aktiveView, istBetreiber);
  const tabs = istBetreiber
    ? [["mandanten", "Mandanten", "raster"], ["rechnungen", "Rechnungen", "euro"],
       ["tarife", "Tarife", "tarif"], ["rechner", "Rechner", "rechner"]]
    : [["meine", "Schichten", "kalender"],
    ...(darf(sitz, "req.approve.unit") ? [["antraege", "Anträge", "haken"]] : []),
    ...(darf(sitz, "plan.view.unit") ? [["lage", "Lage", "raster"]] : [])];

  /**
   * Mobil zuerst: Beschäftigte im Schichtdienst ohne Planungsrechte sehen die
   * Telefonansicht als Vorgabe. Sie ist keine verkleinerte Rechneransicht,
   * sondern eigenständig gebaut — und jederzeit umschaltbar.
   */
  // An der Rolle festgemacht, nicht an einzelnen Rechten — das ist vorhersehbar.
  const nurMitarbeiter = !istBetreiber && sitz.person.rolle === "mitarbeiter"
    && sitz.person.imSchichtdienst !== false;
  const zeigeMobil = nurMitarbeiter && !rechnerAnsicht;

  const dialogBlock = (<>
    {verfDlg && <Verfuegbarkeit sitz={sitz} akt={akt} personId={verfDlg} onClose={() => setVerfDlg(null)} />}
    {krank && <Krankmeldung sitz={sitz} akt={akt} vorauswahl={krank.pid} onClose={() => setKrank(null)} />}
    {warnung && <Warndialog sitz={sitz} vorgang={warnung} onClose={() => setWarnung(null)} />}
    {/* WP-21: Die Live-Region steht immer im Dokument, nur der Text kommt dazu; so liest Vorlesesoftware auch die
        Absage eines Stempels („Stempel abgelehnt: …“) vor. Eine erst mit dem Text entstehende Region wird oft überhört. */}
    <div role="status" aria-live="polite">
      {hinweis && <div style={{ position: "fixed", bottom: 104, left: "50%", transform: "translateX(-50%)",
        zIndex: 90, background: C.accentDeep, color: C.aufAkzent, padding: "12px 20px", borderRadius: 999,
        fontSize: 14, boxShadow: "var(--schatten-toast)", maxWidth: "90vw", textAlign: "center" }}>
        {hinweis}</div>}
    </div>
  </>);

  if (zeigeMobil) return (
    <div className={`sw-root${sitz.person.kontrastmodus ? " feldmodus" : ""}`}>
      <style>{bauStyles()}</style>
      <div style={{display:"none"}}><i /><i /><i /><i /></div>
      <div>
        <MobilSchale sitz={sitz} akt={akt} dialoge={dialogBlock} startTab={mobilStart}
          aufRechner={() => setRechnerAnsicht(true)} />
      </div>
    </div>);

  return (
    <div className={`sw-root${dicht ? " dicht" : ""}${fokus ? " fokus" : ""}${!istBetreiber && sitz.person.kontrastmodus ? " feldmodus" : ""}`}>
      <style>{bauStyles()}</style>
      <a href="#inhalt" className="sprung">Zum Inhalt springen</a>
      <div className="huelle">

        {/* ----------------------- Seitenleiste ----------------------- */}
        {seiteOffen && <button type="button" tabIndex={-1} className="seiten-abdunkelung nur-schmal"
          aria-label={SEITENLEISTE_SCHLIESSEN} onClick={() => setSeiteOffen(false)} />}
        <aside id={SEITENLEISTE_ID} className={`seitenleiste${seiteOffen ? " offen" : ""}`}
          aria-label="Hauptnavigation">
          <div className="marke">
            <Logo size={26} hell />
            <div style={{ minWidth: 0 }}>
              <b>CENTRIC</b>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)", marginTop: 2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {istBetreiber ? "Betreiberkonsole" : sitz.mandant.name}</div>
            </div>
          </div>

          <nav className="snav">
            {istBetreiber
              ? nav.map(([id, label]) => (
                <button key={id} className={`slink${aktiveView === id ? " on" : ""}`}
                  onClick={() => { setView(id); setDetail(null); setSeiteOffen(false); }}>{label}</button>))
              : bereiche.map((b) => (
                <div key={b.id}>
                  <div className="sgruppe">{b.label}</div>
                  {b.views.map(([id, label]) => {
                    const z = zaehler[id];
                    return (
                      <button key={id} className={`slink${aktiveView === id ? " on" : ""}`}
                        aria-current={aktiveView === id ? "page" : undefined}
                        onClick={() => { setView(id); setDetail(null); setSeiteOffen(false); }}>
                        {label}
                        {z > 0 && <span className={`zahl${zaehlerWarn[id] ? " warn" : ""}`}>{z}</span>}
                      </button>);
                  })}
                </div>))}
          </nav>

          <div className="sfuss">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                background: "rgba(255,255,255,.12)", color: "#fff" }}>{r.kurz}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "#fff", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis" }}>
                  {istBetreiber ? "Betreiber" : `${sitz.person.vorname} ${sitz.person.nachname}`}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{r.label}</div>
              </div>
              <button onClick={akt.abmelden} title="Abmelden" aria-label="Abmelden"
                style={{ border: "none", background: "transparent", color: "rgba(255,255,255,.55)",
                  cursor: "pointer", padding: 11, margin: -7, display: "flex" }}><Icon n="abmelden" size={18} /></button>
            </div>
          </div>
        </aside>

        {/* ------------------------- Inhalt --------------------------- */}
        <div className="inhalt">
          <Kopfblock istBetreiber={istBetreiber}
            betrieb={istBetreiber ? "Betreiberkonsole" : sitz.mandant.name}
            bereiche={istBetreiber ? [{ id: "betreiber", label: "Betreiberkonsole", views: nav }] : bereiche}
            aktiveView={aktiveView} zaehler={zaehler} zaehlerWarn={zaehlerWarn}
            konto={{
              name: istBetreiber ? "Betreiber" : `${sitz.person.vorname} ${sitz.person.nachname}`,
              kurz: istBetreiber ? "BE" : (((sitz.person.vorname || " ")[0] + (sitz.person.nachname || " ")[0]).toUpperCase().trim() || r.kurz),
              rolle: r.label }}
            ungelesen={ungelesen}
            dicht={dicht} fokus={fokus} onFokus={setFokus}
            onDicht={(an) => { setDicht(an); if (!istBetreiber) akt.setzeMeineEinstellung("dichte", an ? "kompakt" : "komfortabel"); }}
            feldmodus={!istBetreiber && !!sitz.person.kontrastmodus}
            onFeldmodus={istBetreiber ? undefined : (an) => akt.setzeKontrastmodus(an)}
            thema={istBetreiber ? betreiberThema : sitz.person.thema}
            onThema={istBetreiber ? setBetreiberThema : (v) => akt.setzeMeineEinstellung("thema", v)}
            onAnsicht={(id) => { setView(id); setDetail(null); setSeiteOffen(false); }}
            onSuche={() => setKmd(true)} onZurueck={akt.zurueck} onPostfach={() => setPostfach(true)}
            onDrawer={() => setSeiteOffen(!seiteOffen)} drawerOffen={seiteOffen}
            onAbmelden={akt.abmelden}
            telefonansicht={nurMitarbeiter && rechnerAnsicht ? () => setRechnerAnsicht(false) : null} />

          {fokus && (
            <div style={{ padding: "10px 24px", background: C.accentLight,
              borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, color: C.accent }}>Fokusmodus — Navigation ausgeblendet</span>
              <Btn size="sm" onClick={() => setFokus(false)}>Fokus beenden</Btn>
            </div>)}

          <main className="bereich" id="inhalt" tabIndex={-1}
            aria-label={`Ansicht ${aktiveView}`}>
          {!istBetreiber && <Testablauf mandant={sitz.mandant} darfEinrichten={darf(sitz, "org.edit")} />}
          <Offlineleiste lage={offline} />
          <NichtGespeichert lage={nichtGespeichert} melde={melde}
            aufGeloest={() => setNichtGespeichert(null)} />
          {schmal && !mobilOk && (
            <Card style={{ padding: 20, marginBottom: 20, background: C.warnLight }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>Für Tablet und Rechner ausgelegt</div>
              <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.5 }}>
                Planung, Verwaltung und Abrechnung arbeiten mit breiten Tabellen. Auf dem Telefon ist
                {istBetreiber ? " diese Konsole" : " „Meine Schichten"} die vorgesehene Ansicht — dort ist alles enthalten,
                was im Dienst gebraucht wird.
              </div>
              {!istBetreiber && <div style={{ marginTop: 14 }}>
                <Btn kind="primary" onClick={() => setView("meine")}>Zu meinen Schichten</Btn></div>}
            </Card>)}
          {istBetreiber ? (
            detail ? <BetreiberDetail db={db} akt={akt} mandantId={detail} zurueck={() => setDetail(null)} /> : <>
              {aktiveView === "mandanten" && <BetreiberMandanten db={db} akt={akt} oeffne={setDetail} />}
              {aktiveView === "neu" && (
                <div>
                  <H1 rubrik="Betreiber"
                    sub="Ein neuer Betrieb startet leer — kein Beispielpersonal, keine erfundenen Dienstpläne. Die Zugangscodes erscheinen genau einmal.">
                    Neuer Mandant</H1>
                  <Card style={{ padding: 26, maxWidth: 640 }}>
                    <MandantNeuAnlegen db={db} akt={akt} onFertig={() => setView("mandanten")} />
                  </Card>
                </div>)}
              {aktiveView === "selbststarts" && <Selbststarts db={db} akt={akt} />}
              {aktiveView === "demos" && <Demozugaenge />}
              {aktiveView === "adressen" && (
                <div>
                  <H1 rubrik="Betreiber"
                    sub="Wenn jemand seine Anmeldeadresse ändert, erscheint das hier. So merkst du, wenn ein Zugang den Besitzer wechselt.">
                    Adressänderungen</H1>
                  <Adressaenderungen db={db} />
                </div>)}
              {aktiveView === "rechnungen" && <BetreiberRechnungen db={db} akt={akt} />}
              {aktiveView === "rechner" && <Mandantenrechner db={db} />}
            {aktiveView === "pakete" && <Pakete db={db} akt={akt} />}
            {aktiveView === "tarife" && <BetreiberTarife db={db} akt={akt} />}
            {aktiveView === "zweifaktor" && <BetreiberZweifaktor ui={{ H1, Card, CardHead, Btn, Inp, Field }} />}
            </>
          ) : (<>
            {aktiveView === "meine" && <MeineSchichten sitz={sitz} akt={akt} ym={ym} />}
            {aktiveView === "lage" && <Lagebild sitz={sitz} oeffneTag={setTag} akt={akt} />}
            {aktiveView === "plan" && <Monatsplan sitz={sitz} ym={ym} setYm={setYm} oeffneTag={setTag} akt={akt} schmal={schmal}
              standortId={standortId} setStandortId={setStandortId} />}
            {aktiveView === "einsatz" && <Einsatzplan sitz={sitz} ym={ym} setYm={setYm} akt={akt} oeffnePerson={setPerson} />}
            {aktiveView === "folge" && <Schichtfolge sitz={sitz} akt={akt} />}
            {aktiveView === "dienste" && <Dienstarten sitz={sitz} akt={akt} />}
            {aktiveView === "antraege" && <AntraegeGeteilt sitz={sitz} akt={akt} />}
            {aktiveView === "personal" && <Personal sitz={sitz} ym={ym} akt={akt} oeffnePerson={setPerson}
              standortId={standortId} setStandortId={setStandortId} />}
            {/* WP-18: Einladungen — nur mit Rollenvergabe und nicht im Demozugang; der Server prüft erneut. */}
            {aktiveView === "personal" && darf(sitz, "roles.assign") && !(SP.zugangsdaten() || {}).demo
              && <Einladungen sitz={sitz} />}
            {aktiveView === "planstand" && <div><H1 rubrik="Planung"
              sub="Jede Änderung nach der Freigabe im Vergleich zum damaligen Stand. Beantwortet die häufigste Frage im Schichtbetrieb.">
              Planstand · {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</H1>
              <Planstand sitz={sitz} ym={ym} akt={akt} /></div>}
            {aktiveView === "quals" && <Qualifikationsmatrix sitz={sitz} akt={akt} />}
            {aktiveView === "kompetenzen" && <Kompetenzen sitz={sitz} akt={akt} />}
            {aktiveView === "untergrenzen" && <Untergrenzen sitz={sitz} akt={akt} ym={ym} />}
            {aktiveView === "lenkzeiten" && <Lenkzeiten sitz={sitz} akt={akt} />}
            {aktiveView === "einarbeitung" && <Einarbeitung sitz={sitz} akt={akt} />}
            {aktiveView === "bereitschaft" && <Bereitschaft sitz={sitz} akt={akt} oeffneTag={setTag} />}
            {aktiveView === "ablauf" && <Ablaufansicht sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "handbuch" && <Handbuch sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "offene" && <OffeneSchichten sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "einstellungen" && <Einstellungen sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "hilfe" && <Hilfe sitz={sitz} gehZu={setView} />}
            {aktiveView === "datenschutz" && <div>
              <H1 sub="Aufbewahrungsfristen, Löschlauf und Auskunft nach Artikel 15. Was hier steht, ist nachgerechnet — die Vorschau benutzt denselben Code wie die Ausführung.">
                Datenschutz</H1>
              <Datenschutz sitz={sitz} akt={akt} /></div>}
            {aktiveView === "rechtliches" && <div>
              <H1 sub="Impressum, Datenschutzerklärung, Geschäftsbedingungen und die Unterlagen zur Auftragsverarbeitung. Änderungen an diesen Texten geschehen an einer Stelle — im Ordner rechtliches/ — und erscheinen hier.">
                Rechtliches</H1>
              <Rechtliches flaeche /></div>}
            {aktiveView === "selbstplan" && <Selbstplanung sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "notrufe" && <Notrufe sitz={sitz} akt={akt} />}
            {aktiveView === "belastung" && <Belastung sitz={sitz} akt={akt} gehZu={setView} />}
            {aktiveView === "sonder" && <Sondereinsaetze sitz={sitz} akt={akt} />}
            {aktiveView === "nachweis" && <Auftraggeberbericht sitz={sitz} akt={akt} />}
            {aktiveView === "uebergabe" && <Schichtuebergabe sitz={sitz} akt={akt} />}
            {aktiveView === "belastbarkeit" && <Belastbarkeit sitz={sitz} akt={akt} oeffneTag={setTag} />}
            {aktiveView === "mitnahme" && <Datenmitnahme sitz={sitz} akt={akt} />}
            {aktiveView === "start" && <Prioritaeten sitz={sitz} akt={akt} gehZu={setView} oeffneTag={setTag} />}
            {aktiveView === "zeitachse" && <Zeitachse sitz={sitz} oeffneTag={setTag} akt={akt} />}
            {aktiveView === "aushang" && <SchwarzesBrett sitz={sitz} akt={akt} />}
            {aktiveView === "nachweise" && <Nachweise sitz={sitz} akt={akt} />}
            {aktiveView === "mittel" && <Betriebsmittel sitz={sitz} akt={akt} />}
            {aktiveView === "boerse" && <Tauschboerse sitz={sitz} akt={akt} />}
            {aktiveView === "wuensche" && <Wunschdienste sitz={sitz} akt={akt} />}
            {aktiveView === "verteilung" && <Verteilung sitz={sitz} ym={ym} />}
            {aktiveView === "jahr" && <Jahresansicht sitz={sitz} ym={ym} oeffnePerson={setPerson} />}
            {aktiveView === "buch" && <Dienstbuch sitz={sitz} akt={akt} />}
            {aktiveView === "abrechnung" && <Abrechnungsdaten sitz={sitz} ym={ym} akt={akt} />}
            {aktiveView === "pruef" && <Pruefung sitz={sitz} ym={ym} setYm={setYm} oeffneTag={setTag} />}
            {aktiveView === "brauswertung" && <BetriebsratAuswertung sitz={sitz} melde={melde} />}
            {aktiveView === "betrieb" && <Betrieb sitz={sitz} akt={akt} />}
          </>)}
          </main>
            {/* Offen ist die Tour, wenn sie ausdrücklich offen steht — oder
                wenn sie noch nie lief und nicht abbestellt wurde.

                Der zweite Fall stand vorher nur in einem Effekt, der den
                Zustand erst wegschreiben musste. Bei einem selbst angelegten
                Betrieb entsteht die erste Person aber im selben Zug wie die
                Anmeldung, und der Effekt kam dabei zu spät: Die Tour startete
                genau dort nie, wo sie am nötigsten ist — beim allerersten
                Öffnen eines leeren Betriebs. Nachgestellt und bestätigt.

                Die Frage wird deshalb beim Darstellen gestellt, nicht in
                einem Effekt daneben. Der Effekt schreibt den Zustand
                weiterhin fest, sobald er einmal zustande gekommen ist. */}
            {sitz.person && ((sitz.person.tour || {}).offen
              || tourStartet(sitz.person, sitz.person.rolle || "mitarbeiter")) && (
              <TourLeiste sitz={sitz} akt={akt} gehZu={setView} />)}
        </div>
      </div>

      {tag && !istBetreiber && <Tagesdetail sitz={sitz} datum={tag} onClose={() => setTag(null)} akt={akt} />}
      {imp && !istBetreiber && <Import sitz={sitz} akt={akt} onClose={() => setImp(false)} />}
      {assist && !istBetreiber && <Assistent sitz={sitz} ym={ym} akt={akt} onClose={() => setAssist(false)} />}
      {!istBetreiber && <Kommandoleiste sitz={sitz} nav={nav} akt={akt} offen={kmd}
        onClose={() => setKmd(false)} gehZu={(v) => { setView(v); setDetail(null); }}
        oeffneTag={setTag} oeffnePerson={setPerson} />}
      {wunschDlg && !istBetreiber && <Wunschdienste sitz={sitz} akt={akt} personId={wunschDlg}
        onClose={() => setWunschDlg(null)} />}
      {notizDlg && !istBetreiber && <Notizen sitz={sitz} akt={akt} schluessel={notizDlg.k}
        titel={notizDlg.t} onClose={() => setNotizDlg(null)} />}
      {mehrfach && !istBetreiber && <Mehrfach sitz={sitz} akt={akt} onClose={() => setMehrfach(false)} />}
      {(einf || (!istBetreiber && sitz.person.einfuehrung && !sitz.person.einfuehrung.erledigt)) && !istBetreiber && (
        <Einfuehrung sitz={sitz} akt={akt} gehZu={setView} onClose={() => setEinf(false)} />)}
      {verfDlg && !istBetreiber && <Verfuegbarkeit sitz={sitz} akt={akt} personId={verfDlg} onClose={() => setVerfDlg(null)} />}
      {nwDlg && !istBetreiber && <NachweisPflege sitz={sitz} akt={akt} personId={nwDlg.pid} qualId={nwDlg.qid}
        onClose={() => setNwDlg(null)} />}
      {wizard && !istBetreiber && <Assistent2 sitz={sitz} akt={akt} onClose={() => setWizard(false)} />}
      {schnell && !istBetreiber && <Schnellbesetzung sitz={sitz} datum={schnell.datum} dienstId={schnell.dienstId}
        akt={akt} onClose={() => setSchnell(null)} />}
      {eskal && !istBetreiber && <Eskalation sitz={sitz} datum={eskal.datum} dienstId={eskal.dienstId} akt={akt} onClose={() => setEskal(null)} />}
      {ausgl && !istBetreiber && <AusgleichPlanen sitz={sitz} personId={ausgl} akt={akt} onClose={() => setAusgl(null)} />}
      {krank && !istBetreiber && <Krankmeldung sitz={sitz} akt={akt} vorauswahl={krank.pid} onClose={() => setKrank(null)} />}
      {postfach && !istBetreiber && <Nachrichten sitz={sitz} akt={akt} onClose={() => { akt.alleGelesen(); setPostfach(false); }} />}
      {person && !istBetreiber && <Personalakte sitz={sitz} personId={person} ym={ym} onClose={() => setPerson(null)} akt={akt} />}
      {/* Der Warndialog steht zuletzt: Er öffnet sich aus anderen Blättern
          heraus (Krankmeldung, Personalakte) und muss über ihnen liegen. */}
      {warnung && !istBetreiber && <Warndialog sitz={sitz} vorgang={warnung} onClose={() => setWarnung(null)} />}

      <Sheet open={!!ausgabe} onClose={() => setAusgabe(null)} titel={ausgabe ? ausgabe.titel : ""} width={740}>
        {ausgabe && (<>
          <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>
            In dieser Umgebung lässt sich keine Datei speichern. Inhalt markieren und kopieren.</div>
          <textarea readOnly value={ausgabe.inhalt} onFocus={(e) => e.target.select()} className="inp"
            style={{ height: 340, fontFamily: "ui-monospace, monospace", fontSize: 12 }} /></>)}
      </Sheet>

      {tabs.length > 0 && (
        <nav className="tabbar">
          {tabs.map(([id, label, glyph]) => (
            <button key={id} className={aktiveView === id ? "on" : ""} onClick={() => { setView(id); setDetail(null); }}>
              <Icon n={glyph} size={20} />{label}</button>))}
          {!istBetreiber && <button onClick={() => setPostfach(true)}>
            <span className="glyph" style={{ position: "relative", display: "flex" }}><Icon n="brief" size={20} />
              {ungelesen > 0 && <span style={{ position: "absolute", top: -4, right: -8, minWidth: 15, height: 15,
                borderRadius: 8, background: C.danger, color: istDunkel() ? C.bg : "#fff", fontSize: 9.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{ungelesen}</span>}
            </span>Post</button>}
          {!istBetreiber && <button onClick={() => akt.oeffneKrankmeldung(sitz.person.id)}>
            <span className="glyph" style={{ color: C.danger, display: "flex" }}><Icon n="krank" size={20} /></span>Krank</button>}
        </nav>)}

      {konflikt && (
        <Konfliktfenster lage={konflikt} melde={melde}
          onSchliessen={() => setKonflikt(false)}
          onUebernehmen={() => {
            /* Denselben Stand noch einmal schicken. speicher.js hat den
               ETag aus der Absage bereits übernommen, der zweite Versuch
               läuft also gegen den aktuellen Stand und geht durch. */
            SP.schreib(ref.current, { durch: "Übernahme nach Konflikt", sofort: true,
              onFehler: (l) => setNichtGespeichert(l) });
            setKonflikt(false);
            melde("Dein Stand wurde übernommen.");
          }} />)}

      {fachFrage && sitz && sitz.mandant && (
        <Bestaetigungsfrage lage={fachFrage} m={sitz.mandant}
          onSchliessen={() => { setFachFrage(null); melde("Nicht gespeichert — die Änderung braucht eine Bestätigung."); }}
          onBestaetigen={(gelesen, gesammelt) => {
            /* Die Einträge kommen ins Bestätigungsprotokoll; die Änderung des
               Bestands löst den nächsten Speichervorgang aus — mit Bestätigung. */
            if (gesammelt) {
              /* Sammelbestätigung (Review B1): je Regel, Einheit und Zeitraum; Wer,
                 Zeit und die Zahl der gedeckten Einteilungen setzt der Server. */
              const sammel = (fachFrage.sammelVorschlag || []).map((g) => ({ id: uid("bs"), art: "sammel", regel: g.regel,
                einheitId: g.einheitId, von: g.von, bis: g.bis, aktion: "speichern", gelesen }));
              setDb((alt) => ({ ...alt, mandanten: alt.mandanten.map((mm) => (mm.id === sitz.mandant.id
                ? { ...mm, bestaetigungen: [...sammel, ...(mm.bestaetigungen || [])] } : mm)) }));
              setFachFrage(null);
              return;
            }
            const wer = { personId: sitz.person.id, name: `${sitz.person.vorname} ${sitz.person.nachname}`, rolle: sitz.person.rolle };
            const best = { eintraege: fachFrage.fachbefunde.map((f) => ({ personId: f.personId, datum: f.datum, dienstId: f.dienstId,
              befunde: f.befunde })), gelesen, grundArt: null };
            setDb((alt) => ({ ...alt, mandanten: alt.mandanten.map((mm) => (mm.id === sitz.mandant.id
              ? bestaetigungVermerken(mm, best, wer, "speichern") : mm)) }));
            setFachFrage(null);
          }} />)}

      {hinweis && (
        <div className="toast" role="status" aria-live="polite">
          <span style={{ flex: 1 }}>{hinweis}</span>
          {verlauf.current.length > 0 && (<>
            <button onClick={() => { akt.zurueck(); setHinweis(null); }}>Rückgängig</button>
            <span className="toast-uhr"><i /></span>
          </>)}
        </div>)}
    </div>);
}

/** Öffentlicher Einstieg — der Fehlerauffang liegt über allem. */
export default function App() {
  return (
    <Fehlerauffang>
      <ZiehAnbieter>
      <style>{bauStyles()}</style>
        <AppInnen />
        <ZiehHinweis />
      </ZiehAnbieter>
    </Fehlerauffang>);
}

/* Für die Render-Prüfung (pruefungen/oberflaeche-render.test.js): die
   Ansichten aus F1/F2 und die Konstruktoren, mit denen die Oberfläche selbst
   Betriebe und Personen anlegt — damit die Prüfung echte Komponenten mit
   echten Daten rendert statt den Quelltext zu durchsuchen. */
export { SicherungenVerwalten };
export { BestaetigungsText } from "./ansichten/bestaetigungstext.jsx";
export { verknuepfungFuer, Monatsabschluss, Stempeluhr, MStempel, KorrekturKarte, KorrekturAntraege, KorrekturOffene, ZeitFormular, korrekturMeldung, Einstellungen, hindernisBefunde, hindernisse, schutzSperre, MeineSchichten, Personalakte, MHeute, Tagesstart, Prioritaeten, leererMandant, zugangsPerson, urlaubshinweiseAnlegen,
  istStunden, stundenkonto, zuschlagStunden, zuschlagWert, datevSaetze, datevCSV, lohnausgabeText, Abrechnungsdaten, StempelBefunde, UngeplantHinweis,
  PlanFreigabeSchalter, tagesaufgaben, personTag, Einsatzorte, Standorte, GeoSchalter, OfflineSchalter, abmeldenMitHinweis, Betrieb,
  demobestand, sollStunden, ausgleichPruefen, offeneErfassung, datenauskunft, nachtJahr,
  /* WP-16, Nachtrag dritter Review: Abgleich der Rechenkonstanten mit dem Server, Exportstand, Dateiname, Hinweise. */
  ABW, lohnexportStand, lohnausgabeDateiname, freezeZeilen,
  /* WP-16, Nachtrag vierter Review: Rückfrage mit Vormonaten, Kategorien der Überstimmung, Lohnart des Kontostands. */
  lohnexportRueckfrage, VORMONAT_KATEGORIEN, mehrarbeitNr };
