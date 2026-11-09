import { Component, Fragment, useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as SP from "./speicher.js";
import { exportWarnung, bestaetigungsGrund, nurKorrekturGrund } from "./istdaten.js";
import { MARKIERUNG_TEXT, stempelSchluessel } from "./stempelvorgang.js";
import { grundKennung } from "../server/lib/selbstplanung.mjs";
import { RADIUS_VORGABE, EINSATZORT_RADIUS_VORGABE } from "../server/lib/geo.mjs";
/* Planrechnung und Fachprüfung einer Einteilung — dieselbe Fassung prüft der Server (WP-22). */
import { einheitAm, imDienst, einheitDienst, landFuerEinheit } from "../server/lib/fachpruefung.mjs";
import { verknuepfungsZiel, ohneVerknuepfung } from "./verknuepfung.js";
import { migriere, migrationstext } from "./migration.js";
import { pad, pISO, addDays, dow, dim_, toMin, dauer, fenster, REGELSTAND, AUFGABEN_PFLBG } from "./regelwerk.js";




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
import { DOW, MON, heute, fLang, fKurz, fDatum } from "./lib/datum.js";
import { n1, n1Ist, eur, uid } from "./lib/format.js";
import { Icon } from "./gestalt/icons.jsx";
import { Erklaerkasten } from "./gestalt/bausteine.jsx";
import { Kopfblock } from "./gestalt/rahmen.jsx";
import { gestaltStil } from "./gestalt/stil.js";
import { Rechtliches } from "./rechtstexte.jsx";
import { stufeRang } from "./warnstufen.js";
import { paketVon } from "./stufen.js";
import { paketSchalten, pilotSetzen,
  zustimmungErfassen, grundlageErfassen, grundEntziehen, paketTag, vertragsstandUebernehmen } from "./paketlogik.js";
import { nameGueltig } from "../server/lib/rollenvergabe.mjs";
import { einheitLabel as brancheEinheit } from "../server/lib/branchen.mjs";

import { rechnungFaellig } from "./preisgestaltung.js";

import { tarifwerk, anwenden as tarifAnwenden } from "./tarifwerke.js";
import { fristen as loeschFristen, vorschau as loeschVorschau, raeumen as loeschlaufAusfuehren, anonymisiere as anonymPerson, berichtstext as loeschBericht, fristWert } from "./aufbewahrung.js";
/* WP-23: ob der Betrieb die Planfreigabe benutzt und welcher Tag ein Entwurf ist — dieselbe
   Entscheidung wie auf dem Server (server/lib/sicht.mjs). */

import { monatText } from "../server/lib/monatsabschluss.mjs";
/* Dienstformen, Anrechnungsfaktor und Standard-Lohnarten stehen seit WP-16 (Nachtrag dritter Review H-1/N-d) in
   server/lib/lohnrechnung.mjs: Der Monatsabschluss rechnet damit Ist-Summe und Konto zum Abschluss ein. */
import { feiertag } from "../server/lib/feiertage.mjs";
/* WP-32: Zwei-Faktor für Verwalterschlüssel — eigenes Modul, hier nur eingehängt. */
import BetreiberZweifaktor from "./betreiber-2fa.jsx";
/* WP-25: Sicherungen in der Oberfläche — Regeln und Texte ohne React. */
import { sicherungenAktionen } from "./sicherungen-ui.js";
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
import { gemeindeHinweis, LAENDER, stat, BRANCHEN, ABW, abwArt, VORLAGEN, PALETTE, demobestand, aktive, abwesenheitAm, personTag, besetzung, sollStunden, istStunden, ausgleichPruefen, stundenkonto, nachtJahr, pruefen, befundeFuer, darfEinheit, anBereichErlaubt, eigeneEinheitVon, waehltEinheit, preis, rechnungPDF, rechnungHTML, baueRechnung, offeneErfassung, hindernisBefunde, hindernisse, schutzSperre, befundeFuerEinteilung, abwesenheitTagAufheben, bestaetigungVermerken, freigabeStand, istFreigegeben, vorlauf, zuschlagStunden, zuschlagWert, datenauskunft, nachweisLage, tagesaufgaben, planAbbild, briefingText, einrichtungsstand, antragUmsetzen, genehmigungsStand, uebergabenVon, uebergabeAm, datevSaetze, EXPORT_STAND, lohnexportStand, lohnausgabeDateiname, VORMONAT_KATEGORIEN, lohnexportRueckfrage, mehrarbeitNr, datevCSV, freezeZeilen, lohnWarnung, lohnausgabeText, vollExport, tabelleCSV, ALLE_STANDORTE } from "./lib/fachlogik.js";
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
import { darfSichBewerben } from "./lib/offene-schichten.js";
import { CHECK_VORLAGEN, checkSchluessel, neuerCheckpunkt } from "./lib/checklisten.js";
import { baueAusAnlage, leererMandant, zugangsPerson } from "./lib/mandant-anlage.js";
import { WECK_STD, verfuegbarkeitsBild } from "./lib/verfuegbarkeit.js";
import { darfSelbstEintragen, laufendeRunde } from "./lib/selbstplanung.js";
import { notrufEmpfaenger } from "./lib/notrufe.js";
import { handbuchDruck, handbuchLaden } from "./lib/handbuch.js";
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

@media print{
  .seitenleiste,.kopfblock,.kopfleiste,.noprint,.toast{display:none !important;}
  .inhalt{margin-left:0;}
  .sw-root{background:#fff;}
  .karte{border-color:#D1D5DB; box-shadow:none; break-inside:avoid;}
}
${gestaltStil()}
${v4AppStil()}
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

      <Card style={{ marginTop: 16, overflowX: "auto" }}>
        <CardHead right={<Btn size="sm" onClick={akt.matrixZuruecksetzen}>Auf Standard zurücksetzen</Btn>}>Rollen und Rechte</CardHead>
        <div style={{ padding: "16px 22px 0", fontSize: 13.5, color: C.dim, lineHeight: 1.5, maxWidth: 720 }}>
          Eine Rolle allein ist keine Berechtigung. Erst Rolle plus Geltungsbereich ergibt eine:
          <span style={{ color: C.text }}> {rollenName(m, "subplaner")} für {m.einheiten[0] ? m.einheiten[0].name : "eine Einheit"}</span> darf dort ändern und sonst nirgends.
        </div>
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
      <Card style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Monat", "Einheit", ...SPALTEN.map(([, l]) => l)].map((l) => (
            <th key={l} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.line}` }}>{l}</th>))}</tr></thead>
          <tbody>{a.zeilen.map((z) => (
            <tr key={`${z.monat}|${z.einheitId}`} style={{ color: z.gesperrt ? C.dim : undefined }}>
              <td style={{ padding: "6px 10px" }}>{z.monat}</td><td style={{ padding: "6px 10px" }}>{einheit(z.einheitId)}</td>
              {SPALTEN.map(([k]) => <td key={k} style={{ padding: "6px 10px", ...NUM }}>{zelle(z, k)}</td>)}
            </tr>))}</tbody>
        </table>
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
  const [imp, setImp] = useState(false);
  const [postfach, setPostfach] = useState(false);
  const [schmal, setSchmal] = useState(false);
  const ref = useRef(null); const erst = useRef(true); const verlauf = useRef([]);

  useEffect(() => {
    const f = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setKmd((x) => !x); }
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

      /* --- Betreiber --- */
      setzeStatus: (id, status) => upd((s) => {
        let stichtag = null;
        if (status === "test") stichtag = window.prompt("Testphase endet am (JJJJ-MM-TT):", heute()) || null;
        if (status === "gekuendigt") stichtag = window.prompt("Kündigung wirksam zum (JJJJ-MM-TT):", heute()) || null;
        const m = s.mandanten.find((x) => x.id === id);
        melde(`${m.name}: ${stat(status).label}.`);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, status, stichtag } : x) },
          `${m.name}: Status auf „${stat(status).label}" gesetzt`);
      }),
      setzeTarif: (id, t) => upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, tarif: t } : x) },
        `${s.mandanten.find((x) => x.id === id).name}: Tarifwechsel`)),
      setzeMandantFeld: (id, k, v) => upd((s) => ({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, [k]: v } : x) })),
      setzeBetreiber: (k, v) => upd((s) => ({ ...s, betreiber: { ...s.betreiber, [k]: v } })),

      /* --------------------------- Preisgestaltung ---------------------
         Alles, was jenseits der drei Tarifstufen vereinbart wurde. Die
         Änderungen werden protokolliert, weil sie Geld betreffen — wer
         einem Betrieb einen Sonderpreis gibt, soll das später erklären
         können.                                                          */
      setzeGestaltung: (id, k, v) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (!m) return s;
        const alt = m.preisgestaltung || {};
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === id
          ? { ...x, preisgestaltung: { ...alt, [k]: v } } : x)) },
        `Preisgestaltung ${m.name}: ${k} gesetzt`);
      }),
      aussetzungHinzu: (id, von, bis, grund) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (!m) return s;
        if (!/^\d{4}-\d{2}$/.test(von || "")) { melde("Bitte einen Monat als JJJJ-MM angeben."); return s; }
        const b = /^\d{4}-\d{2}$/.test(bis || "") ? bis : von;
        if (b < von) { melde("Das Ende liegt vor dem Anfang."); return s; }
        const alt = m.preisgestaltung || {};
        const liste = [...(alt.aussetzungen || []), { von, bis: b, grund: grund || "" }]
          .sort((x, y) => (x.von < y.von ? -1 : 1));
        melde(`Zahlung ausgesetzt: ${von} bis ${b}.`);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === id
          ? { ...x, preisgestaltung: { ...alt, aussetzungen: liste } } : x)) },
        `Zahlung ausgesetzt für ${m.name}: ${von} bis ${b}`);
      }),
      aussetzungWeg: (id, i) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (!m) return s;
        const alt = m.preisgestaltung || {};
        const liste = (alt.aussetzungen || []).filter((_, k) => k !== i);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === id
          ? { ...x, preisgestaltung: { ...alt, aussetzungen: liste } } : x)) },
        `Aussetzung zurückgenommen bei ${m.name}`);
      }),
      setzeTarifFeld: (id, k, v) => upd((s) => ({ ...s, tarife: s.tarife.map((t) => t.id === id ? { ...t, [k]: v } : t) })),
      neuerMandant: (f) => upd((s) => {
        const m = baueAusAnlage(f);
        melde(`${m.name} angelegt · ${m.einheiten.filter((e) => !e.pool).length} ${mehrzahl(f.einheitLabel)}, ${m.dienstarten.length} Dienstarten.`);
        return bLog({ ...s, mandanten: [...s.mandanten, m] },
          `Mandant „${m.name}" eingerichtet: ${m.einheiten.filter((e) => !e.pool).length} Einheiten`);
      }),
      /* Pilotbetrieb: nur der Betreiber (diese Konsole), mit Protokoll. */
      /* Pilot: gesonderte, protokollierte Betreiberentscheidung je Betrieb, mit Pflichtgrund.
         Kein Standard- und kein Migrationspfad setzt ihn. */
      setzePilot: (mid, an) => {
        const grund = an ? (window.prompt("Grund für den Pilotbetrieb (Pflicht, wird protokolliert):") || "") : "";
        return upd((s) => {
          const m = s.mandanten.find((x) => x.id === mid);
          if (!m) return s;
          const alt = pilotSetzen(m, an, paketTag(), grund);
          if (!alt) { melde("Ohne Grund kein Pilotbetrieb."); return s; }
          return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === mid ? { ...x, preisgestaltung: alt } : x)) },
            `Pilotbetrieb ${an ? "gesetzt" : "beendet"} bei ${m.name}${an ? ` (Grund: ${grund.trim()})` : ""}`);
        });
      },
      /* Abrechnungsgrund (a): ausdrückliche Zustimmung des Kunden, mit Paket, Preis und Intervall bestätigt. */
      erfasseZustimmung: (mid, paket) => {
        const m0 = db.mandanten.find((x) => x.id === mid);
        const r0 = m0 ? zustimmungErfassen(m0, paket, paketTag(), "Betreiber (Zustimmung des Kunden liegt vor)") : null;
        if (!r0 || !r0.ok) return melde(r0 ? r0.grund : "Betrieb nicht gefunden.");
        const e = r0.eintrag;
        if (!window.confirm(`Zustimmung des Kunden festhalten?\n\nPaket: ${paketVon(paket).name}\nPreis: ${e.preis} € ${e.intervall} (wiederkehrend)\nBerechnet wird erst ab dem Folgemonat; das Datum setzt der Server.`)) return;
        upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id !== mid ? x
          : { ...x, paketZustimmungen: [...(Array.isArray(x.paketZustimmungen) ? x.paketZustimmungen : []).filter((z) => z.paket !== paket), e] })) },
          `Zustimmung zu Paket ${paketVon(paket).name} bei ${m0.name} festgehalten (${e.preis} € ${e.intervall})`));
      },
      /* Abrechnungsgrund (b): vom Betreiber dokumentierte vertragliche Grundlage JE PAKET mit Preis
         (Review M2; Wirksamkeit prüft der Betreiber/Jurist). */
      setzeGrundlage: (mid, paket) => {
        const m0 = db.mandanten.find((x) => x.id === mid);
        const notiz = window.prompt(`Vertragliche Grundlage für die Berechnung des Pakets ${paketVon(paket).name} (Verweis/Notiz, Pflicht):`) || "";
        const r0 = m0 ? grundlageErfassen(m0, paket, paketTag(), notiz, "Betreiber") : null;
        if (!r0 || !r0.ok) return melde(r0 ? r0.grund : "Betrieb nicht gefunden.");
        const e = r0.eintrag;
        if (!window.confirm(`Vertragliche Grundlage festhalten?\n\nPaket: ${paketVon(paket).name}\nPreis: ${e.preis} € ${e.intervall} (wiederkehrend)\nVerweis: ${e.notiz}\nBerechnet wird erst ab dem Folgemonat; das Datum setzt der Server.`)) return;
        upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id !== mid ? x
          : { ...x, paketGrundlage: [...(Array.isArray(x.paketGrundlage) ? x.paketGrundlage : []).filter((g) => g.paket !== paket), e] })) },
          `Vertragliche Grundlage für Paket ${paketVon(paket).name} bei ${m0.name} festgehalten (${e.preis} € ${e.intervall})`));
      },
      /* G9: unter Zustand 5 lässt sich ein Paket nur im Pilot zubuchen (nicht berechnet);
         Abschalten geht immer und entzieht Zustimmung/Grundlage des Pakets (Review M1).
         Die Entscheidung steht in paketlogik.js (paketSchalten, grundEntziehen). */
      setzePaket: (mid, paket, an) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === mid);
        if (!m) return s;
        const r = paketSchalten(m, paket, an);
        if (!r.ok) { melde(r.grund); return s; }
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === mid ? { ...x, pakete: r.pakete, ...(an ? {} : grundEntziehen(x, paket)) } : x)) },
          `Paket ${paketVon(paket).name} bei ${m.name} ${an ? "zugebucht" : "abgeschaltet"}`);
      }),
      loescheMandant: (id) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (window.prompt(`Löscht Mandant, Einheiten, Personal und Pläne unwiderruflich.\nZur Bestätigung den Namen eingeben:\n\n${m.name}`) !== m.name) {
          melde("Löschung abgebrochen."); return s; }
        /* Der Datenraum auf dem Server geht mit — Bestand, Monatsscherben,
           Sicherungen, Zugangscodes und offene Sitzungen. Vorher verschwand
           der Betrieb nur aus der Konsole; die Daten lagen weiter im
           Speicher, ohne dass jemand sie je wieder erreicht hätte. Das
           Löschkonzept verlangt, dass „gelöscht" auch gelöscht heißt.
           SI-P6 (Review M1): Aus der Liste geht der Mandant erst, wenn der
           Server die Löschung als vollständig meldet. Sonst bleibt er stehen,
           damit dieselbe Löschung erneut ausgeführt werden kann — ein halb
           gelöschter Raum ist bis dahin für neue Zugänge gesperrt. */
        const entfernen = (st) => bLog({ ...st, mandanten: st.mandanten.filter((x) => x.id !== id),
          rechnungen: st.rechnungen.filter((r) => r.mandantId !== id) }, `Mandant „${m.name}" gelöscht`);
        if (!m.raum) { melde(`${m.name} gelöscht.`); setDetail(null); return entfernen(s); }
        SP.raumLoeschen(m.raum)
          .then((r) => { melde(`${m.name} gelöscht — Datenraum „${m.raum}" (${r.geloescht} Einträge).`); setDetail(null); upd(entfernen); })
          .catch((e) => melde(`Löschung unvollständig – erneut ausführen. ${e.message}`));
        return s;
      }),
      rechnungStellen: (id) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        /* Eine Rechnung über null Euro ist keine Freundlichkeit, sondern ein
           Beleg, den jemand ablegen, prüfen und acht Jahre aufbewahren muss
           (Buchungsbeleg, § 147 Abs. 3 AO). */
        const f = rechnungFaellig(m, ym);
        if (!f.faellig) {
          melde(f.grund === "ausgesetzt"
            ? "Für diesen Monat ist die Zahlung ausgesetzt — keine Rechnung."
            : "Dieser Monat ist kostenlos vereinbart — keine Rechnung.");
          return s;
        }
        const rg = baueRechnung(s, m, ym);
        if (s.rechnungen.some((r) => r.nummer === rg.nummer)) { melde("Für diesen Zeitraum liegt bereits eine Rechnung vor."); return s; }
        melde(`Rechnung ${rg.nummer} erzeugt.`);
        return bLog({ ...s, rechnungen: [rg, ...s.rechnungen] }, `Rechnung ${rg.nummer} für ${m.name} über ${eur(rg.brutto)}`);
      }),
      rechnungslauf: (monat) => upd((s) => {
        const neu = [];
        let uebersprungen = 0;
        for (const m of s.mandanten) {
          if (!stat(m.status).zahlt) continue;
          const f = rechnungFaellig(m, monat);
          if (!f.faellig) { uebersprungen++; continue; }
          const rg = baueRechnung(s, m, monat);
          if (s.rechnungen.some((r) => r.nummer === rg.nummer)) continue;
          neu.push(rg);
        }
        /* Übersprungene werden genannt, nicht verschwiegen. Ein Lauf, der
           still weniger Rechnungen erzeugt als erwartet, ist der Anfang
           eines langen Suchtages. */
        const nachsatz = uebersprungen
          ? ` · ${uebersprungen} ${uebersprungen === 1 ? "Betrieb" : "Betriebe"} ausgesetzt oder kostenlos`
          : "";
        melde(neu.length
          ? `${neu.length} Rechnungen erzeugt.${nachsatz}`
          : `Keine neuen Rechnungen.${nachsatz}`);
        return bLog({ ...s, rechnungen: [...neu, ...s.rechnungen] },
          `Rechnungslauf ${monat}: ${neu.length} Rechnungen${nachsatz}`);
      }),
      rechnungenLeeren: () => upd((s) => { melde("Rechnungsausgang geleert."); return { ...s, rechnungen: [] }; }),
      rechnungPDF: (rg) => {
        const bytes = rechnungPDF(rg);
        if (lade(`${rg.nummer}.pdf`, bytes, "application/pdf")) melde("PDF erstellt.");
        else setAusgabe({ titel: `${rg.nummer}.pdf`, inhalt: "Die PDF-Datei kann in dieser Umgebung nicht gespeichert werden. Nutze stattdessen die Word-Ausgabe oder den Ausdruck." });
      },
      rechnungWord: (rg) => {
        const html = rechnungHTML(rg);
        if (lade(`${rg.nummer}.doc`, html, "application/msword")) melde("Word-Dokument erstellt.");
        else setAusgabe({ titel: `${rg.nummer}.doc`, inhalt: html });
      },

      /* --- Betrieb --- */
      setzeFeld: (k, v) => mUpd((m) => ({ ...m, [k]: v }), null),
      setzeBranche: (b) => mUpd((m) => ({ ...m, branche: b, einheitLabel: brancheEinheit(b) }),
        "Branche gewechselt"),
      setzeEinstellung: (k, v) => mUpd((m) => ({ ...m, einstellungen: { ...m.einstellungen, [k]: v } }), null),
      /* WP-19.0: Ausnahmeweg Art. 16/17/18 — Änderung lokal, die Angabe einmalig beim Speichern (speicher.js). */
      moduldatenAusnahme: (angabe, aendern, erkennt) => { if (!sitz || !sitz.mandant) return; SP.ausnahmeMitschicken(sitz.mandant.id, angabe, erkennt); mUpd(aendern, null); },
      /* Aufbewahrungsfristen liegen je Betrieb, nicht in den Einstellungen —
         sie gehören zum Löschkonzept, nicht zum Regelwerk. */
      /* Direkt in ein Kapitel springen — die Tour öffnet sich dort. */
      tourAbKapitel: (index) => mUpd((m) => ({ ...m,
        personen: m.personen.map((p) => (p.id === sitz.person.id
          ? { ...p, tour: { ...(p.tour || {}), offen: true, schritt: index, fertig: false } }
          : p)) }), null),
      tarifwerkAnwenden: (id) => {
        const s2 = ref.current;
        const m0 = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const vor = tarifAnwenden(m0, id, heute());
        if (!vor.geaendert.length) return melde("Es ändert sich nichts.");
        if (!window.confirm(
          `${vor.geaendert.length} Werte im Regelwerk werden gesetzt. `
          + "Personal, Dienstarten und Einheiten bleiben unberührt.\n\n"
          + "Bereits gerechnete Stunden ändern sich rückwirkend, weil Nachtfenster "
          + "und Wochenarbeitszeit in jede Auswertung eingehen.")) return;
        mUpd((m) => tarifAnwenden(m, id, heute()).mandant,
          `Tarifwerk angewendet: ${(tarifwerk(id) || {}).name || id}`);
        melde(`${(tarifwerk(id) || {}).name || id} angewendet.`);
      },
      setzeAufbewahrung: (k, v) => mUpd((m) => ({ ...m,
        aufbewahrung: { ...loeschFristen(m), [k]: fristWert(v) } }), null),
      setzeEinheit: (id, k, v) => mUpd((m) => ({ ...m, einheiten: m.einheiten.map((e) => e.id === id ? { ...e, [k]: v } : e) }), null),
      neueEinheit: () => mUpd((m) => ({ ...m, einheiten: [...m.einheiten, { id: uid("e"),
        name: `${m.einheitLabel} ${m.einheiten.length + 1}`, versatz: m.einheiten.length % m.zyklus.wochen,
        farbe: PALETTE[m.einheiten.length % PALETTE.length] }] }), "Einheit angelegt"),
      loescheEinheit: (id) => mUpd((m) => {
        const n = m.personen.filter((p) => einheitAm(p, heute()) === id && imDienst(p, heute())).length;
        if (n) { melde(`Der Einheit sind noch ${n} Personen zugeordnet.`); return m; }
        return { ...m, einheiten: m.einheiten.filter((e) => e.id !== id) };
      }, "Einheit gelöscht"),
      neueQual: () => mUpd((m) => ({ ...m, qualifikationen: [...m.qualifikationen,
        { id: uid("q"), name: "Neue Qualifikation", kurz: "NEU", farbe: PALETTE[m.qualifikationen.length % PALETTE.length] }] }), "Qualifikation angelegt"),
      setzeQual: (id, k, v) => mUpd((m) => ({ ...m, qualifikationen: m.qualifikationen.map((q) => q.id === id ? { ...q, [k]: v } : q) }), null),
      loescheQual: (id) => mUpd((m) => ({ ...m, qualifikationen: m.qualifikationen.filter((q) => q.id !== id),
        personen: m.personen.map((p) => ({ ...p, qualifikationen: p.qualifikationen.filter((x) => x !== id) })),
        dienstarten: m.dienstarten.map((d) => { const mq = { ...d.mindestQual }; delete mq[id]; return { ...d, mindestQual: mq }; }) }), "Qualifikation gelöscht"),
      toggleRecht: (r, recht) => mUpd((m) => {
        /* Ohne eigene Matrix gilt die Vorgabe — der erste Klick macht sie
           zur betrieblichen Matrix, statt auf undefined zu greifen. */
        const basis = m.matrix || JSON.parse(JSON.stringify(MATRIX_STD));
        const cur = basis[r] || [];
        return { ...m, matrix: { ...basis, [r]: cur.includes(recht) ? cur.filter((x) => x !== recht) : [...cur, recht] } };
      }, "Rechtematrix geändert"),
      matrixZuruecksetzen: () => mUpd((m) => ({ ...m, matrix: JSON.parse(JSON.stringify(MATRIX_STD)) }), "Rechtematrix zurückgesetzt"),

      /* --------------------- Eigene Rollenbezeichnungen ----------------
         Nur die Anzeige. Ein leerer Name setzt auf die Vorgabe zurück,
         statt eine leere Marke im Plan stehen zu lassen.                 */
      setzeRollenname: (id, name) => mUpd((m) => {
        const urteil = nameGueltig(name);
        if (!urteil.ok) { melde(urteil.grund); return m; }
        const alt = { ...(m.rollennamen || {}) };
        if (urteil.wert) alt[id] = urteil.wert; else delete alt[id];
        return { ...m, rollennamen: alt };
      }, "Rollenbezeichnung geändert"),
      rollennamenZuruecksetzen: () => mUpd((m) => {
        const ohne = { ...m };
        delete ohne.rollennamen;
        return ohne;
      }, "Rollenbezeichnungen auf Vorgabe zurückgesetzt"),

      /* --- Plan --- */
      setzeAbweichung: (pid, d, dienstId) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid); if (!p) return m;
        const eid = einheitAm(p, d);
        if (!darfEinheit({ db: ref.current, mandant: m, person: sitz.person, rolle: "kunde" }, eid)) { melde("Keine Berechtigung für diesen Bereich."); return m; }
        const plan = eid ? einheitDienst(m, eid, d) : null;
        const ab = { ...m.abweichungen }, key = `${pid}|${d}`;
        const vorher = ab[key] !== undefined ? ab[key] : plan;
        if ((dienstId === "-" && !plan) || dienstId === plan) delete ab[key]; else ab[key] = dienstId;
        const nachher = ab[key] !== undefined ? ab[key] : plan;
        let next = { ...m, abweichungen: ab };
        if (vorher !== nachher) {
          const vl = vorlauf(d);
          next = { ...next, aenderungen: [{ id: uid("c"), personId: pid, datum: d, von: vorher || "-",
            nach: nachher || "-", zeit: new Date().toLocaleString("de-DE"), regelstand: REGELSTAND.version, vorlauf: vl }, ...(next.aenderungen || [])].slice(0, 800) };
          if (istFreigegeben(m, d.slice(0, 7))) {
            const nam = (x) => x === "-" || !x ? "frei" : (m.dienstarten.find((y) => y.id === x) || {}).name || x;
            next = { ...next, nachrichten: [baueMitteilung(next, pid, "planGeaendert", `Dienst am ${fKurz(d)} geändert`,
              `${nam(vorher)} → ${nam(nachher)}${vl < 14 ? ` · ${vl} Tage Vorlauf` : ""}`, "meine", d), ...(next.nachrichten || [])].slice(0, 400) };
          }
        }
        return next;
      }, null),

      /* --- Krankmeldung, Ersatz, Freigabe, Zeiten, Einschränkungen --- */
      oeffneKrankmeldung: (pid, von, bis) => setKrank({ pid: pid || "",
        von: von || heute(), bis: bis || von || heute() }),
      oeffneAbwesenheit: (pid, art, von, bis) => { setView("antraege");
        setVorbelegung({ pid, art: art || "urlaub", von: von || heute(),
          bis: bis || von || heute() }); },
      krankmelden: (pid, von, bis, notiz) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const betroffen = [];
        for (let d = von; d <= bis; d = addDays(d, 1)) if (personTag(m, p, d).dienstId) betroffen.push(d);
        const plan = m.personen.filter((x) => ["leitung", "planer"].includes(x.rolle)
          || (x.rolle === "subplaner" && x.bereich === einheitAm(p, von)));
        const nachr = plan.map((x) => baueMitteilung(m, x.id, "planGeaendert",
          `Krankmeldung: ${p.vorname} ${p.nachname}`,
          `${fKurz(von)} bis ${fKurz(bis)} · ${betroffen.length} betroffene Dienste${notiz ? ` · ${notiz}` : ""}`,
          "lage")).filter(Boolean);
        melde(`Krankmeldung erfasst · ${betroffen.length} betroffene Dienste.`);
        return { ...m, abwesenheiten: [...m.abwesenheiten, { id: uid("a"), personId: pid, art: "krank", von, bis, notiz }],
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Krankmeldung erfasst"),
      setzeEinsprung: (pid, d, dienstId, best) => mUpd((m0) => {
        let m = m0;
        const p = m.personen.find((x) => x.id === pid);
        const da = m.dienstarten.find((x) => x.id === dienstId);
        if (!p) { melde("Person nicht gefunden."); return m; }
        const sperre = schutzSperre(m, p, d, da);
        if (sperre) { melde(`Nicht möglich: ${sperre.text}.`); return m; }
        /* Eine bestehende Abwesenheit schlägt jede Einteilung — sonst wird
           die Zuteilung angenommen, wirkt aber nicht. Gesperrt wird nicht:
           Der Warndialog bietet an, die Abwesenheit für diesen Tag
           aufzuheben (best.abwesenheitAufheben). */
        const abw = abwesenheitAm(m, pid, d);
        if (abw && !(best && best.abwesenheitAufheben)) {
          melde(`${p.vorname} ${p.nachname} ist am ${fKurz(d)} ${abwArt(abw.art).label.toLowerCase()}. Erst die Abwesenheit für diesen Tag aufheben.`);
          return m;
        }
        let nachrAbw = [];
        if (abw) {
          const r = abwesenheitTagAufheben(m, pid, d);
          m = { ...m, abwesenheiten: r.abwesenheiten };
          nachrAbw = [baueMitteilung(m, pid, "antragEntschieden", `${abwArt(abw.art).label} am ${fKurz(d)} aufgehoben`,
            `Die Planung hat dich für ${da ? da.name : dienstId} eingeteilt. Der übrige Zeitraum bleibt bestehen.`, "meine")].filter(Boolean);
        }
        const vorher = personTag(m, p, d).dienstId;
        /* War die Person ohne die Abwesenheit ohnehin für diesen Dienst
           geplant, ist sie mit dem Aufheben wieder eingeteilt — das ist
           kein „bereits eingeteilt", und die Bestätigung gehört ins Protokoll. */
        if (vorher === dienstId && !abw) { melde(`${p.nachname} ist bereits eingeteilt.`); return m; }
        melde(abw && vorher === dienstId
          ? `${p.vorname} ${p.nachname} für ${fKurz(d)} wieder eingeteilt.`
          : vorher
            ? `${p.vorname} ${p.nachname} für ${fKurz(d)} umgeteilt.`
            : `${p.vorname} ${p.nachname} für ${fKurz(d)} eingeteilt.`);
        m = bestaetigungVermerken(m, best, wer(), "einsprung");
        if (nachrAbw.length) m = { ...m, nachrichten: [...nachrAbw, ...(m.nachrichten || [])].slice(0, 400) };
        return { ...m,
          abweichungen: { ...m.abweichungen, [`${pid}|${d}`]: dienstId },
          einspruenge: [{ id: uid("s"), personId: pid, datum: d, dienstId, zeit: new Date().toLocaleString("de-DE") }, ...(m.einspruenge || [])].slice(0, 500),
          aenderungen: [{ id: uid("c"), personId: pid, datum: d, von: "-", nach: dienstId,
            zeit: new Date().toLocaleString("de-DE"), regelstand: REGELSTAND.version, vorlauf: vorlauf(d) }, ...(m.aenderungen || [])].slice(0, 800),
          nachrichten: [baueMitteilung(m, pid, "planGeaendert", `Zusätzlicher Dienst am ${fKurz(d)}`,
            `${da ? da.name : dienstId} · ${da ? `${da.start}–${da.ende}` : ""} · als Ersatz eingeteilt`, "meine", d), ...(m.nachrichten || [])].slice(0, 400) };
      }, "Ersatz eingeteilt"),
      freigeben: (ym2) => mUpd((m) => {
        const alt = freigabeStand(m, ym2);
        const stand = (alt ? alt.stand : 0) + 1;
        const wer = `${sitz.person.vorname} ${sitz.person.nachname}`;
        const nachr = m.personen.filter((p) => imDienst(p, heute())).map((p) =>
          baueMitteilung(m, p.id, "planFreigegeben",
            `Dienstplan ${MON[Number(ym2.slice(5)) - 1]} ${ym2.slice(0, 4)} freigegeben`,
            stand === 1 ? "Der Plan ist ab sofort verbindlich."
              : `Stand ${stand} — der Plan wurde nach Änderungen erneut freigegeben.`,
            "meine")).filter(Boolean);
        melde(`Plan freigegeben · Stand ${stand}.`);
        return { ...m, freigaben: { ...(m.freigaben || {}), [ym2]: { stand, zeit: new Date().toLocaleString("de-DE"), durch: wer } },
          planstaende: { ...(m.planstaende || {}), [ym2]: planAbbild(m, ym2) },
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Plan freigegeben"),
      /* Die eigene Zeit bestätigt der Server über einen eigenen Weg und sagt,
         ob es geklappt hat; erst dann wird hier nachgezogen. Vorher verschwand
         der Tag aus „Zeiten bestätigen", auch wenn der Server die Angabe
         verworfen hatte. Für andere Personen (Leitung, Planung) bleibt es beim
         gewöhnlichen Speichern. */
      /* Lange Dienste zur Prüfung (WP-17, W1): Die Leitung bestätigt die
         gestempelte Zeit; danach zählt sie im Konto. Vermerk im Protokoll. */
      /* Stempelkorrektur (WP-06): Die Ist-Zeit eines gestempelten Tages
         ändert nur der Server, als Ereignis mit Grund am Stempel — das
         Original bleibt. Übernommen wird, was er gespeichert hat. */
      stempelKorrigieren: async (pid, d, start, ende, grund, pause) => {
        try {
          const erg = await SP.stempelKorrektur(pid, d, start, ende, grund, pause);
          const k = `${pid}|${d}`;
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: erg.eintrag },
              erfassung: { ...(m.erfassung || {}), [k]: erg.erfassung } }) }));
          melde(korrekturMeldung(erg));
          return true;
        } catch (e) {
          melde(e.message || "Die Korrektur ließ sich nicht speichern.");
          return false;
        }
      },
      /* Korrekturworkflow (WP-14): Antrag stellen, zurückziehen, entscheiden. Übernommen wird,
         was der Server gespeichert hat. */
      /* Monatsabschluss (WP-16): Abschließen (Leitung, Planung) und Wiederöffnen (nur Leitung, mit Grund)
         laufen über den Server; übernommen wird der Eintrag, den er gespeichert hat. Offene Prüffälle:
         einmal nachfragen, dann ausdrücklich „trotzdem“. */
      monatAbschliessen: async (monat) => {
        const uebernehmen = (erg) => serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
          : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
        try {
          await uebernehmen(await SP.monatsabschluss("abschliessen", monat));
          melde("Monat abgeschlossen — Ist-Zeiten, Stempel, Korrekturen und Anträge dieses Monats sind gesperrt.");
          return true;
        } catch (e) {
          if (e && e.code === "ABSCHLUSS_PRUEFFAELLE" && typeof window !== "undefined" && window.confirm(e.message)) {
            try {
              await uebernehmen(await SP.monatsabschluss("abschliessen", monat, { trotzPrueffaellen: true }));
              melde("Monat abgeschlossen — die offenen Prüffälle stehen im Verlauf.");
              return true;
            } catch (e2) { melde(e2.message || "Der Monat ließ sich nicht abschließen."); return false; }
          }
          melde((e && e.message) || "Der Monat ließ sich nicht abschließen.");
          return false;
        }
      },
      monatWiederoeffnen: async (monat, grund) => {
        try {
          const erg = await SP.monatsabschluss("wiederoeffnen", monat, { grund });
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
          melde("Monat wiedergeöffnet — Korrekturen stehen weiter als Ereignis am Stempel.");
          return true;
        } catch (e) {
          melde((e && e.message) || "Der Monat ließ sich nicht wiederöffnen.");
          return false;
        }
      },
      /* Lohnexport bestätigen (WP-16 Nachtrag, Betreiberentscheidung 2026-11-03): Wann, Wer, Prüfsumme — sperrt einfaches Wiederöffnen. */
      lohnexportBestaetigen: async (monat, trotzVormonat = null) => {
        /* Bestätigt wird genau die ausgegebene Datei (WP-16, Nachtrag dritter Review H-2): Prüfsumme, Abschluss, Revision
           und Zeilen-Prüfsumme des Standes, aus dem sie entstand. Der Server vergleicht mit dem heutigen Abschluss.
           Der ausgegebene Stand gilt nur in dieser Sitzung — nach dem Neuladen erst die Lohnausgabe neu erzeugen
           (sonst EXPORTSTAND_FEHLT, fail-closed). */
        const schluessel = `${sitz.mandant.id}|${monat}`;
        const exportStand = EXPORT_STAND.get(schluessel);
        if (!exportStand) { melde(`Bitte zuerst die Lohnausgabe für ${monatText(monat)} erzeugen — bestätigt wird genau die ausgegebene Datei.`); return false; }
        /* Offene oder geänderte Vormonate (Nachtrag vierter Review A-2): Die Rückfrage nennt sie; ohne Überstimmung
           (Kategorie und Begründung aus dem Monatsabschluss) bestätigt der Server nicht. */
        const rf = lohnexportRueckfrage(sitz.mandant, monat);
        if (rf.vormonate && !trotzVormonat) { melde(`${rf.text} Bestätigen nur mit Kategorie und Begründung.`); return false; }
        if (!window.confirm(`Lohnexport für ${monatText(monat)} bestätigen (Revision ${exportStand.revision}, Prüfsumme ${String(exportStand.abdruck).slice(0, 12)})?`
          + (rf.vormonate ? `\n\n${rf.text}\nBegründung: ${trotzVormonat.grund}` : "")
          + "\n\nDanach lässt sich der Monat nicht mehr einfach wiederöffnen — Änderungen brauchen den Korrekturprozess.")) return false;
        try {
          const erg = await SP.monatsabschluss("lohnexport", monat, { exportStand, trotzVormonat });
          EXPORT_STAND.delete(schluessel);
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
          melde("Lohnexport bestätigt.");
          return true;
        } catch (e) {
          if (e && (e.code === "EXPORTSTAND_ABWEICHEND" || e.code === "FREEZE_NICHT_REPRODUZIERBAR")) EXPORT_STAND.delete(schluessel);
          melde((e && e.message) || "Der Lohnexport ließ sich nicht bestätigen.");
          return false;
        }
      },
      /* WP-16c: Korrekturrevision nach bestätigtem Lohnexport (der Server entscheidet; die Differenz kommt mit dem Fehler). */
      monatKorrektur: async (aktion, monat, extra = {}) => {
        try {
          const erg = await SP.monatsabschluss(aktion, monat, extra);
          /* Wie Abschließen/Wiederöffnen: den Serverstand nachladen, sonst läuft ein PUT mit altem ETag hinterher (Konfliktdialog). */
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
          melde(aktion === "korrektur-beginnen" ? "Korrektur begonnen — der exportierte Stand ist als Revision abgelegt."
            : aktion === "korrektur-verwerfen" ? "Korrektur verworfen." : "Freigabe gespeichert.");
          return { ok: true, ...erg };
        } catch (e) {
          if (e && e.code === "KORREKTUR_DIFFERENZ_FEHLT" && e.differenz) return { ok: false, differenz: e.differenz };
          melde((e && e.message) || "Der Schritt ließ sich nicht ausführen.");
          return { ok: false };
        }
      },
      /* WP-15: neuer Stand einer Selbstauskunft (Antrag) in erfassung übernehmen. */
      uebernehmeSelbstauskunft: (pid, d, erg) => serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) =>
        m.id !== (s2.session || {}).mandantId ? m
          : { ...m, erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: erg.eintrag } }) })),
      korrekturBeantragen: async (datum, start, ende, pause, grund) => {
        try {
          const erg = await SP.korrekturAntrag(datum, start, ende, pause, grund);
          const k = `${sitz.person.id}|${datum}`;
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: erg.eintrag } }) }));
          melde("Antrag gestellt — die Leitung entscheidet. Dein Stempel bleibt unverändert.");
          return true;
        } catch (e) {
          melde(e.message || "Der Antrag ließ sich nicht stellen.");
          return false;
        }
      },
      korrekturEntscheiden: async (pid, datum, antragId, entscheidung, begruendung) => {
        try {
          const erg = await SP.korrekturEntscheiden(pid, datum, antragId, entscheidung, begruendung);
          const k = `${pid}|${datum}`;
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: erg.eintrag },
              ...(erg.erfassung ? { erfassung: { ...(m.erfassung || {}), [k]: erg.erfassung } } : {}) }) }));
          melde(entscheidung === "genehmigt" ? korrekturMeldung(erg)
            : entscheidung === "abgelehnt" ? "Antrag abgelehnt — die Begründung steht am Antrag." : "Antrag zurückgezogen.");
          return true;
        } catch (e) {
          melde(e.message || "Die Entscheidung ließ sich nicht speichern.");
          return false;
        }
      },
      /* Lange Dienste zur Prüfung (WP-17, W1): Die Leitung bestätigt die
         gestempelte Zeit — seit WP-06 als Korrekturereignis mit Grund. */
      langerDienstBestaetigen: (pid, d) => {
        const e = (sitz.mandant.erfassung || {})[`${pid}|${d}`];
        /* Dauer 0 nie unverändert bestätigen (Nachprüfung B1). */
        if (!e || nurKorrekturGrund(e.grund)) return;      // WP-14b: Herbstnacht ebenso
        return akt.stempelKorrigieren(pid, d, e.start, e.ende, bestaetigungsGrund(e));
      },
      bestaetigeZeit: async (pid, d, start, ende, grund) => {
        if (!sitz.person || pid !== sitz.person.id) {
          /* Gestempelter Tag: nur als Korrektur (WP-06). */
          if ((sitz.mandant.einstempeln || {})[`${pid}|${d}`])
            return akt.stempelKorrigieren(pid, d, start, ende, grund || "Zeit durch die Leitung bestätigt");
          mUpd((m) => ({ ...m,
            erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: { start, ende, bestaetigt: true, grund: grund || "" } } }), null);
          return;
        }
        try {
          const erg = await SP.zeitBestaetigen(d, start, ende, grund);
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: erg.eintrag } }) }));
          melde("Zeit beantragt — sie zählt nach der Freigabe durch die Leitung (WP-15).");
        } catch (e) {
          melde(e.message || "Die Zeit ließ sich nicht bestätigen.");
        }
      },
      setzeEinschraenkung: (pid, k, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, einschraenkungen: { ...(p.einschraenkungen || {}), [k]: v } } : p) }), "Einsatzeinschränkung geändert"),
      alleGelesen: () => mUpd((m) => ({ ...m, nachrichten: (m.nachrichten || []).map((n) =>
        n.personId === sitz.person.id ? { ...n, gelesen: true } : n) }), null),
      loescheAbweichung: (pid, d) => mUpd((m) => { const ab = { ...m.abweichungen }; delete ab[`${pid}|${d}`]; return { ...m, abweichungen: ab }; }, null),
      setzeZyklusTag: (i, v) => mUpd((m) => ({ ...m, zyklus: { ...m.zyklus, tage: m.zyklus.tage.map((d, k) => (k === i ? v : d)), vorlage: null } }), "Schichtfolge geändert"),
      setzeZyklusWochen: (w) => mUpd((m) => ({ ...m, zyklus: { ...m.zyklus, wochen: w,
        tage: Array.from({ length: w * 7 }, (_, i) => m.zyklus.tage[i] || "-"), vorlage: null } }), "Zykluslänge geändert"),
      ladeVorlage: (vid) => mUpd((m) => {
        const v = VORLAGEN.find((x) => x.id === vid); if (!v) return m;
        return { ...m, zyklus: { wochen: v.wochen, tage: [...v.tage], vorlage: v.id },
          dienstarten: m.dienstarten.map((d) => v.zeiten[d.id] ? { ...d, start: v.zeiten[d.id][0], ende: v.zeiten[d.id][1] } : d) };
      }, "Vorlage geladen"),
      setzeVersatz: (eid, tage) => mUpd((m) => ({ ...m, einheiten: m.einheiten.map((e) => e.id === eid
        ? { ...e, versatzTage: tage, versatz: Math.round(tage / 7) } : e) }), "Startpunkt geändert"),

      /* --- Dienstarten --- */
      neueDienstart: (f) => mUpd((m) => {
        const id = f.kurz && !m.dienstarten.some((d) => d.id === f.kurz) ? f.kurz : uid("d").toUpperCase().slice(-4);
        return { ...m, dienstarten: [...m.dienstarten, { ...f, id }] };
      }, `Dienstart „${f.name}" angelegt`),
      aendereDienstart: (id, f) => mUpd((m) => ({ ...m, dienstarten: m.dienstarten.map((d) => d.id === id ? { ...f, id } : d) }), `Dienstart „${f.name}" geändert`),
      loescheDienstart: (id) => mUpd((m) => {
        const n = m.zyklus.tage.filter((t) => t === id).length + Object.values(m.abweichungen).filter((v) => v === id).length;
        if (n > 0) { melde(`Dienstart wird noch ${n}× verwendet.`); return m; }
        return { ...m, dienstarten: m.dienstarten.filter((d) => d.id !== id) };
      }, "Dienstart gelöscht"),

      /* --- Personal --- */
      neuePerson: (f) => mUpd((m) => ({ ...m, personen: [...m.personen, {
        id: uid("p"), vorname: f.vorname, nachname: f.nachname, funktion: f.funktion,
        email: `${f.vorname.toLowerCase()}.${f.nachname.toLowerCase()}@betrieb.de`,
        zugehoerigkeit: [{ ab: f.eintritt, einheitId: f.einheitId }], eintritt: f.eintritt, austritt: null,
        wochenstunden: f.wochenstunden, urlaubsanspruch: f.urlaubsanspruch, urlaubsuebertrag: 0, stundenuebertrag: 0,
        qualifikationen: [], einfuehrung: { erledigt: false, schritt: 0 }, rolle: f.rolle,
        bereich: ["leitung", "planer", "betriebsrat"].includes(f.rolle) ? "ALLE" : f.einheitId, status: "aktiv" }] }),
        `${f.vorname} ${f.nachname} angelegt als ${rolle(f.rolle).label}`),
      setzeRolle: (pid, r) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const leitungen = m.personen.filter((x) => x.rolle === "leitung" && x.status === "aktiv" && !x.austritt);
        if (p.rolle === "leitung" && r !== "leitung" && leitungen.length <= 1) {
          melde("Der letzte Zugang mit Organisationsleitung kann nicht umgestellt werden."); return m; }
        melde(`${p.vorname} ${p.nachname}: ${rolle(r).label}. Die Kosten wurden angepasst.`);
        return { ...m, personen: m.personen.map((x) => x.id === pid ? { ...x, rolle: r, rolleSeit: heute(),
          rolleVerlauf: [...(x.rolleVerlauf || [{ ab: x.rolleSeit || x.eintritt, rolle: x.rolle }]), { ab: heute(), rolle: r }],
          bereich: ["leitung", "planer", "betriebsrat"].includes(r) ? "ALLE" : (x.bereich === "ALLE" ? einheitAm(x, heute()) : x.bereich) } : x) };
      }, "Zugangsart geändert"),
      versetze: (pid, eid, ab) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, zugehoerigkeit: [...p.zugehoerigkeit.filter((z) => z.ab !== ab), { ab, einheitId: eid }].sort((a, b) => (a.ab < b.ab ? -1 : 1)) } : p) }), "Versetzung eingetragen"),
      setzeAustritt: (pid, d) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid ? { ...p, austritt: d } : p) }),
        d ? "Austritt eingetragen" : "Austritt zurückgenommen"),
      toggleQual: (pid, qid) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, qualifikationen: p.qualifikationen.includes(qid) ? p.qualifikationen.filter((x) => x !== qid) : [...p.qualifikationen, qid] } : p) }), null),
      neueAbwesenheit: (pid, art, von, bis) => { mUpd((m) => ({ ...m, abwesenheiten: [...m.abwesenheiten,
        { id: uid("a"), personId: pid, art, von, bis, notiz: "" }] }), "Abwesenheit eingetragen"); melde("Abwesenheit eingetragen."); },
      loescheAbwesenheit: (aid) => mUpd((m) => ({ ...m, abwesenheiten: m.abwesenheiten.filter((a) => a.id !== aid) }), "Abwesenheit gelöscht"),

      /* --- Anträge --- */
      /* Zweimal derselbe Antrag ist keiner.

         Ein Doppelklick auf „Antrag stellen" — auf dem Telefon im Bus,
         bei stockender Verbindung der Normalfall — legte zwei offene
         Anträge derselben Person für denselben Zeitraum an. Die Planung
         sah doppelt, genehmigte einmal und ließ den zweiten stehen.

         Gefunden wird über Person, Art und Zeitraum, nicht über die
         Kennung: Die ist bei jedem Klick eine neue. */
      stelleAntrag: (a) => {
        const schonDa = (sitz.mandant.anfragen || []).some((x) => x.personId === sitz.person.id
          && x.status === "offen" && (x.typ || "abwesenheit") === (a.typ || "abwesenheit")
          && x.art === a.art && x.von === a.von && x.bis === a.bis);
        if (schonDa) { melde("Dieser Antrag liegt bereits offen vor."); return; }
        mUpd((m) => ({ ...m, anfragen: [{ id: uid("r"), personId: sitz.person.id, status: "offen",
          erstellt: jetzt(), antwort: "", ...a }, ...m.anfragen] }), "Antrag gestellt");
        melde("Antrag abgesendet."); },
      zieheAntragZurueck: (id) => mUpd((m) => ({ ...m, anfragen: m.anfragen.filter((a) => a.id !== id) }), "Antrag zurückgezogen"),
      beantworteEinsatz: (id, ja) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        let next = { ...m, anfragen: m.anfragen.map((x) => x.id === id ? { ...x, status: ja ? "genehmigt" : "abgelehnt" } : x) };
        if (ja) {
          next = { ...next, abweichungen: { ...next.abweichungen, [`${a.personId}|${a.von}`]: a.dienstId },
            einspruenge: [{ id: uid("s"), personId: a.personId, datum: a.von, dienstId: a.dienstId,
              zeit: new Date().toLocaleString("de-DE") }, ...(next.einspruenge || [])] };
          // Übrige Anfragen für dieselbe Lücke verfallen
          next = { ...next, anfragen: next.anfragen.map((x) => (x.typ === "einsatz" && x.von === a.von
            && x.dienstId === a.dienstId && x.id !== id && x.status === "offen") ? { ...x, status: "abgelehnt", antwort: "anderweitig besetzt" } : x) };
        }
        melde(ja ? "Zusage erfasst, du bist eingeteilt." : "Absage erfasst.");
        return next;
      }, "Einsatzanfrage beantwortet"),
      entscheideAntrag: (id, ja, text) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const wer = `${sitz.person.vorname} ${sitz.person.nachname}`;
        const jetzt = new Date().toLocaleString("de-DE");
        // Mehrstufige Genehmigung: erst wenn alle Stufen erteilt sind, gilt der
        // Antrag als genehmigt. Eine Ablehnung beendet den Vorgang sofort.
        if (ja) {
          const freigaben = [...(a.freigaben || []), { von: wer, zeit: jetzt }];
          const st = genehmigungsStand(m, { ...a, freigaben });
          if (!st.fertig) {
            melde(`Mitgezeichnet. Es fehlt noch ${st.offen === 1 ? "eine Freigabe" : `${st.offen} Freigaben`} durch ${st.naechste}.`);
            return { ...m, anfragen: m.anfragen.map((x) => x.id === id ? { ...x, freigaben } : x) };
          }
          const erg = antragUmsetzen(m, a);
          melde(`Antrag genehmigt${(a.freigaben || []).length ? " — alle Stufen erteilt" : ""}.`);
          return { ...erg, anfragen: erg.anfragen.map((x) => x.id === id
            ? { ...x, status: "genehmigt", freigaben, entschieden: jetzt, durch: wer, antwort: text || "" } : x),
            nachrichten: [baueMitteilung(m, a.personId, "antragEntschieden", "Antrag genehmigt", `${abwArt(a.art).label} ${fKurz(a.von)} wurde genehmigt.`, "meine"),
              ...(erg.nachrichten || [])].slice(0, 400) };
        }
        melde("Antrag abgelehnt.");
        return { ...m, anfragen: m.anfragen.map((x) => x.id === id
          ? { ...x, status: "abgelehnt", entschieden: jetzt, durch: wer, antwort: text || "" } : x),
          nachrichten: [baueMitteilung(m, a.personId, "planGeaendert", "Antrag abgelehnt", `${abwArt(a.art).label} ${fKurz(a.von)} wurde abgelehnt.${text ? " " + text : ""}`, "meine"),
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Antrag entschieden"),
      /* --- Beschäftigungsform, Standorte, Import, Dienstbuch --- */
      setzePerson: (pid, k, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid ? { ...p, [k]: v } : p) }), null),
      setzeBeschaeftigung: (pid, modus) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid) return p;
        if (modus === "springer") return { ...p, springer: true, teilzeit: null };
        if (modus === "voll") return { ...p, springer: false, teilzeit: null };
        return { ...p, springer: false, teilzeit: { aktiv: true, modus,
          wochentage: (p.teilzeit && p.teilzeit.wochentage) || [0, 1, 2, 3, 4] } };
      }) }), "Beschäftigungsform geändert"),
      toggleWochentag: (pid, i) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid || !p.teilzeit) return p;
        const w = p.teilzeit.wochentage || [];
        return { ...p, teilzeit: { ...p.teilzeit, wochentage: w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort() } };
      }) }), null),
      /* ------------------------------ Standorte ------------------------
         Anlegen ist ein Verwaltungsvorgang, keine Vertragsänderung mehr —
         ein neuer Standort ist leer und kostet nichts. Was zählt, ist,
         ob er später über die Schwelle in standorte.js hinauswächst;
         das zeigt die Standorte-Seite an, ohne etwas zu blockieren. */
      standortAnlegen: (name, bundesland) => mUpd((m) => ({
        ...m,
        standorte: [...(m.standorte || []),
          { id: uid("st"), name: String(name).trim(), bundesland: bundesland || m.bundesland, radius: RADIUS_VORGABE }],
      }), `Standort „${String(name).trim()}" angelegt`),
      setzeStandort: (id, k, v) => mUpd((m) => ({ ...m, standorte: (m.standorte || []).map((s2) => s2.id === id ? { ...s2, [k]: v } : s2) }), null),
      /* Mehrere Felder in einem Speichervorgang — etwa beide Koordinaten aus
         „Aktuelle Position übernehmen". */
      setzeStandortFelder: (id, felder) => mUpd((m) => ({ ...m, standorte: (m.standorte || []).map((s2) => s2.id === id ? { ...s2, ...felder } : s2) }), null),
      /* Geo-Prüfung beim Stempeln: schalten darf nur die Leitung; wann und von
         wem eingeschaltet wurde, setzt der Server. */
      /* Einschalten nur mit der Bestätigung der betrieblichen Prüfung; der
         Server verlangt das Merkmal in derselben Anfrage und speichert es nie. */
      setzeGeoPruefung: (an) => mUpd((m) => {
        const e = { ...(m.einstellungen || {}), geoPruefung: !!an };
        if (an) e.geoPruefungBestaetigt = true; else delete e.geoPruefungBestaetigt;
        return { ...m, einstellungen: e };
      }, an ? "Standortprüfung beim Stempeln eingeschaltet" : "Standortprüfung beim Stempeln ausgeschaltet"),
      /* Offline-Stempel vertrauen (WP-07): nur org.edit; wann und von wem, setzt der Server. */
      setzeOfflineVertrauen: (an) => mUpd((m) => ({ ...m,
        einstellungen: { ...(m.einstellungen || {}), offlineStempelVertrauen: !!an } }),
        an ? "Stempeln ohne Netz: Prüfung gelockert" : "Stempeln ohne Netz: wieder streng geprüft"),
      /* Prüfmodus der Standortprüfung (WP-20): nur die Leitung; „pflicht" mit Bestätigung in derselben
         Anfrage (Mitbestimmung), Wann/Wer setzt der Server. */
      setzeGeoModus: (modus) => mUpd((m) => {
        const e = { ...(m.einstellungen || {}), geoModus: modus };
        if (modus === "pflicht") e.geoPruefungBestaetigt = true; else delete e.geoPruefungBestaetigt;
        return { ...m, einstellungen: e };
      }, modus === "pflicht" ? "Standortprüfung verpflichtend gestellt" : "Standortprüfung auf Hinweis gestellt"),
      /* Einsatzorte (WP-20): getrennt von den Standorten. */
      einsatzortAnlegen: (name) => mUpd((m) => ({ ...m,
        einsatzorte: [...(m.einsatzorte || []), { id: uid("eo"), name, art: "sonstiger", aktiv: true, radius: EINSATZORT_RADIUS_VORGABE }] }), `Einsatzort „${name}“ angelegt`),
      setzeEinsatzort: (id, felder) => mUpd((m) => ({ ...m,
        einsatzorte: (m.einsatzorte || []).map((o) => o.id === id ? { ...o, ...felder } : o) }), null),
      loescheEinsatzort: (id) => mUpd((m) => {
        const n = (m.dienstarten || []).filter((d) => d.ortModus === "einsatzort" && d.einsatzortId === id).length;
        if (n) { melde(`Der Einsatzort wird noch von ${n} Dienstart(en) verwendet.`); return m; }
        return { ...m, einsatzorte: (m.einsatzorte || []).filter((o) => o.id !== id) };
      }, "Einsatzort gelöscht"),
      /* Planfreigabe als Pflicht (WP-23): nur org.edit; wann und von wem, setzt der Server. */
      setzePlanFreigabePflicht: (an) => mUpd((m) => ({ ...m,
        einstellungen: { ...(m.einstellungen || {}), planFreigabePflicht: !!an } }),
        an ? "Planfreigabe aktiviert" : "Planfreigabe ausgeschaltet"),
      /* Jugendarbeitsschutz „mehrschichtig" (Nachprüfung WP-11): org.edit oder pattern.edit;
         wann und von wem, setzt der Server. */
      setzeJugendMehrschichtig: (an) => mUpd((m) => ({ ...m,
        einstellungen: { ...(m.einstellungen || {}), jugendschutz: { mehrschichtig: !!an } } }),
        an ? "Als mehrschichtiger Betrieb hinterlegt" : "Nicht mehr als mehrschichtiger Betrieb hinterlegt"),
      loescheStandort: (id) => mUpd((m) => {
        const n = m.einheiten.filter((e) => e.standortId === id).length;
        if (n) { melde(`Dem Standort sind noch ${n} Einheiten zugeordnet.`); return m; }
        return { ...m, standorte: (m.standorte || []).filter((s2) => s2.id !== id) };
      }, "Standort gelöscht"),
      oeffneImport: () => setImp(true),
      importieren: (zeilen, anlegen) => mUpd((m) => {
        let einheiten = [...m.einheiten], quals = [...m.qualifikationen];
        if (anlegen) {
          for (const name of [...new Set(zeilen.filter((z) => !z.einheitId).map((z) => z.einheitName))])
            einheiten.push({ id: uid("e"), name, versatz: einheiten.length % m.zyklus.wochen,
              standortId: (m.standorte && m.standorte[0]) ? m.standorte[0].id : null,
              farbe: PALETTE[einheiten.length % PALETTE.length] });
          for (const q of [...new Set(zeilen.flatMap((z) => z.fehlendeQuals))])
            quals.push({ id: uid("q"), name: q, kurz: q.slice(0, 4).toUpperCase(), farbe: PALETTE[quals.length % PALETTE.length] });
        }
        const neue = zeilen.map((z) => {
          const eid = z.einheitId || (einheiten.find((e) => e.name === z.einheitName) || {}).id || einheiten[0].id;
          const zusatz = z.fehlendeQuals.map((q) => (quals.find((x) => x.name === q) || {}).id).filter(Boolean);
          return { id: uid("p"), vorname: z.vorname, nachname: z.nachname, funktion: z.funktion,
            email: `${z.vorname.toLowerCase()}.${z.nachname.toLowerCase()}@betrieb.de`,
            zugehoerigkeit: [{ ab: z.eintritt, einheitId: eid }], eintritt: z.eintritt, austritt: null,
            wochenstunden: z.wochenstunden, urlaubsanspruch: z.urlaubsanspruch, urlaubsuebertrag: 0, stundenuebertrag: 0,
            qualifikationen: [...z.qualifikationen, ...zusatz], einschraenkungen: {}, teilzeit: z.teilzeit, springer: false,
            rolle: z.rolle, bereich: ["leitung", "planer", "betriebsrat"].includes(z.rolle) ? "ALLE" : eid,
            rolleSeit: z.eintritt, status: "aktiv" };
        });
        melde(`${neue.length} Personen übernommen.`);
        return { ...m, einheiten, qualifikationen: quals, personen: [...m.personen, ...neue] };
      }, "Personal importiert"),
      dienstbuchEintrag: (datum, art, text, einheitId = null) => mUpd((m) => ({ ...m, dienstbuch: [
        { id: uid("db"), datum, art, text, zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`, vonId: sitz.person.id,
          einheitId: waehltEinheit(sitz) ? einheitId : eigeneEinheitVon(sitz) }, ...(m.dienstbuch || [])] }), "Dienstbucheintrag"),

      melden: melde,
      /* --- Schichtübergabe --- */
      uebergabeSpeichern: (datum, dienstId, f, einheitWahl = null) => mUpd((m) => {
        const jetzt = new Date().toLocaleString("de-DE");
        const einheitId = waehltEinheit(sitz) ? einheitWahl : eigeneEinheitVon(sitz);
        if (uebergabeAm(m, datum, dienstId, einheitId)) { melde("Für diese Schicht und Einheit gibt es schon eine Übergabe."); return m; }
        const b = besetzung(m, datum)[dienstId];
        const beteiligt = einheitId ? b.personen.filter((p) => einheitAm(p, datum) === einheitId) : b.personen;
        const folge = m.dienstarten.find((d) => !d.posten && d.id !== dienstId);
        melde("Übergabe abgeschlossen. Sie ist ab jetzt unveränderlich.");
        return { ...m, uebergaben: [{ id: uid("u"), datum, dienstId, einheitId,
          lage: f.lage, offen: f.offen, vorkommnis: f.vorkommnis, material: f.material,
          von: `${sitz.person.vorname} ${sitz.person.nachname}`,
          an: folge ? folge.name : null, zeit: jetzt, personen: beteiligt.map((p) => p.id),
          ergaenzungen: [] }, ...uebergabenVon(m)] };
      }, "Übergabe erfasst"),
      uebergabeErgaenzen: (datum, dienstId, text, einheitWahl = null) => mUpd((m) => ({ ...m,
        uebergaben: uebergabenVon(m).map((u) => u === uebergabeAm(m, datum, dienstId,
          waehltEinheit(sitz) ? einheitWahl : eigeneEinheitVon(sitz))
          ? { ...u, ergaenzungen: [...(u.ergaenzungen || []),
              { zeit: new Date().toLocaleString("de-DE"),
                von: `${sitz.person.vorname} ${sitz.person.nachname}`, text }] }
          : u) }), "Ergänzung angehängt"),

      /* --- Gespeicherte Ansichten --- */
      speichereAnsicht: (bereich, name, zustand) => mUpd((m) => ({ ...m,
        ansichten: [...(m.ansichten || []), { id: uid("v"), personId: sitz.person.id,
          bereich, name: name.trim(), zustand }] }), null),
      loescheAnsicht: (id) => mUpd((m) => ({ ...m,
        ansichten: (m.ansichten || []).filter((a) => a.id !== id) }), null),

      /* --- Datenmitnahme --- */
      exportTabelle: (name, zeilen) => {
        const inhalt = tabelleCSV(zeilen);
        const datei = `${sitz.mandant.name.replace(/\W+/g, "_")}_${name}.csv`;
        if (lade(datei, inhalt, "text/csv")) melde(`${zeilen.length} Zeilen ausgegeben.`);
        else setAusgabe({ titel: name, inhalt });
      },
      exportAlles: () => {
        const t = vollExport(sitz.mandant);
        let n = 0;
        for (const [k, zeilen] of Object.entries(t)) {
          if (!zeilen.length) continue;
          lade(`${sitz.mandant.name.replace(/\W+/g, "_")}_${k}.csv`, tabelleCSV(zeilen), "text/csv");
          n++;
        }
        melde(`${n} Dateien ausgegeben — der vollständige Datenbestand.`);
      },

      /* --- DATEV --- */
      exportDATEV: (ym) => {
        /* Ist-Zeiten zur Prüfung (WP-17, W1): Die Datei rechnet dort vorläufig
           mit der Planzeit — vor dem Download ausdrücklich sagen. */
        const warnung = lohnWarnung(sitz.mandant, ym, exportWarnung(sitz.mandant, ym));
        if (warnung && !window.confirm(warnung)) return;
        const inhalt = datevCSV(sitz.mandant, ym);
        const z = datevSaetze(sitz.mandant, ym).length;
        /* Den Stand der ausgegebenen Datei merken (WP-16, Nachtrag dritter Review H-2): Bestätigt wird genau er. */
        const stand = lohnexportStand(sitz.mandant, ym);
        if (stand) EXPORT_STAND.set(`${sitz.mandant.id}|${ym}`, stand); else EXPORT_STAND.delete(`${sitz.mandant.id}|${ym}`);
        if (lade(lohnausgabeDateiname(sitz.mandant, ym, "csv"), inhalt, "text/csv"))
          melde(`${z} Lohnartensätze ausgegeben.`);
        else setAusgabe({ titel: "Lohnausgabe", inhalt });
      },
      exportLohnBlatt: (ym) => {
        const inhalt = lohnausgabeText(sitz.mandant, ym);
        if (lade(lohnausgabeDateiname(sitz.mandant, ym, "txt"),
          inhalt, "text/plain;charset=utf-8")) melde("Blatt zum Gegenlesen heruntergeladen.");
        else setAusgabe({ titel: "Lohnausgabe zum Gegenlesen", inhalt });
      },
      /* --- Checklisten --- */
      hakeAb: (personId, datum, dienstId, punktId, notiz) => mUpd((m) => {
        const k = checkSchluessel(personId, datum, dienstId);
        const bisher = (m.checks || {})[k] || {};
        if (bisher[punktId]) {
          /* Bereits abgehakt: Erledigungen sind unveränderlich. Wer sich
             vertan hat, meldet das der Leitung — ein stiller Rückzieher
             würde die Dokumentation wertlos machen. */
          melde("Bereits erledigt. Einträge lassen sich nicht zurücknehmen.");
          return m;
        }
        /* Nachträglich heißt: nach Ablauf des Diensttages */
        const nachtraeglich = datum < heute();
        return { ...m, checks: { ...(m.checks || {}), [k]: { ...bisher,
          [punktId]: { zeit: new Date().toISOString(), nachtraeglich,
            notiz: notiz || "", durch: personId } } } };
      }, "Punkt abgehakt"),

      setzeCheckliste: (dienstId, liste) => mUpd((m) => ({ ...m,
        dienstarten: m.dienstarten.map((d) => d.id === dienstId
          ? { ...d, checkliste: liste } : d) }), "Checkliste geändert"),

      uebernimmCheckVorlage: (dienstId) => mUpd((m) => {
        const branche = (m.pakete || []).find((p) => CHECK_VORLAGEN[p]) || "sicherheit";
        const vorlage = CHECK_VORLAGEN[branche] || [];
        if (!vorlage.length) { melde("Für diese Branche gibt es keine Vorlage."); return m; }
        melde(`${vorlage.length} Punkte übernommen — jetzt anpassen.`);
        return { ...m, dienstarten: m.dienstarten.map((d) => d.id === dienstId
          ? { ...d, checkliste: vorlage.map((c) => ({ ...neuerCheckpunkt(), ...c })) } : d) };
      }, "Vorlage übernommen"),

      /* --- Sondereinsätze --- */
      sondereinsatzAnlegen: (daten) => mUpd((m) => ({ ...m,
        sondereinsaetze: [{ id: uid("se"), ...daten, pause: 0, zugeteilt: [],
          angelegt: new Date().toISOString() }, ...(m.sondereinsaetze || [])].slice(0, 300) }),
        "Sondereinsatz angelegt"),
      sondereinsatzZuteilen: (id, personId) => mUpd((m) => ({ ...m,
        sondereinsaetze: (m.sondereinsaetze || []).map((s) => s.id !== id ? s
          : { ...s, zugeteilt: (s.zugeteilt || []).includes(personId)
              ? (s.zugeteilt || []).filter((x) => x !== personId)
              : [...(s.zugeteilt || []), personId] }) }), "Zuteilung geändert"),

      /* --- Reihenfolge --- */
      setzeReihenfolge: (art) => mUpd((m) => ({ ...m,
        einstellungen: { ...m.einstellungen, reihenfolge: art } }),
        "Reihenfolge geändert"),

      /* --- Selbstplanung --- */
      rundeOeffnen: (monat, tage) => mUpd((m) => {
        if ((m.selbstplanung || []).some((r) => r.status === "offen")) {
          melde("Es läuft bereits eine Runde."); return m; }
        const r = { id: uid("sp"), monat, status: "offen", deckelung: true,
          geoeffnet: new Date().toISOString(),
          schliesst: addDays(heute(), tage || 7), eintraege: [] };
        /* Nur unterrichten, wer im Schichtdienst ist — die Planung selbst
           trägt sich nicht ein. */
        const nachr = m.personen.filter((p) => imDienst(p, heute())
          && p.imSchichtdienst !== false)
          .map((p) => baueMitteilung(m, p.id, "offeneSchicht",
            `Selbstplanung für ${MON[Number(monat.slice(5)) - 1]} ist offen`,
            `Trag dich bis zum ${fKurz(r.schliesst)} für deine Wunschdienste ein.`,
            "selbstplan")).filter(Boolean);
        melde(`Runde offen · ${nachr.length} Personen unterrichtet.`);
        return { ...m, selbstplanung: [r, ...(m.selbstplanung || [])].slice(0, 24),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Selbstplanung geöffnet"),

      selbstEintragen: (datum, dienstId) => mUpd((m) => {
        const r = laufendeRunde(m);
        const pid = sitz.person ? sitz.person.id : null;   // die Sitzung liegt über dem Betrieb, nicht in ihm
        if (!r || !pid) return m;
        const pruef = darfSelbstEintragen(m, r, pid, datum, dienstId);
        if (!pruef.darf) { melde(`Nicht möglich: ${pruef.grund}.`); return m; }
        /* Mit Hinweis eintragen ist erlaubt (E-19). Der Eintrag trägt den
           Hinweis, die Planung entscheidet bei der Übernahme. */
        if ((pruef.hinweise || []).length) melde(`Eingetragen, mit Hinweis: ${pruef.hinweise[0]}. Die Planung entscheidet.`);
        return { ...m, selbstplanung: m.selbstplanung.map((x) => x.id !== r.id ? x
          : { ...x, eintraege: [...(x.eintraege || []),
              { personId: pid, datum, dienstId, zeit: new Date().toISOString(),
                ...((pruef.hinweise || []).length ? { hinweise: pruef.hinweise } : {}) }] }) };
      }, "Selbst eingetragen"),

      selbstAustragen: (datum) => mUpd((m) => {
        const r = laufendeRunde(m);
        const pid = sitz.person ? sitz.person.id : null;   // die Sitzung liegt über dem Betrieb, nicht in ihm
        if (!r || !pid) return m;
        return { ...m, selbstplanung: m.selbstplanung.map((x) => x.id !== r.id ? x
          : { ...x, eintraege: (x.eintraege || []).filter((e) =>
              !(e.personId === pid && e.datum === datum)) }) };
      }, "Eintrag zurückgenommen"),

      rundeSchliessen: (id) => mUpd((m) => ({ ...m,
        selbstplanung: (m.selbstplanung || []).map((r) => r.id === id
          ? { ...r, status: "geschlossen", geschlossen: new Date().toISOString() } : r) }),
        "Selbstplanung geschlossen"),

      rundeUebernehmen: (id, best) => mUpd((m0) => {
        let m = m0;
        const r = (m.selbstplanung || []).find((x) => x.id === id);
        if (!r) return m;
        /* Jeder Eintrag wird zur Abweichung. Vor dem Übernehmen wird noch
           einmal geprüft — zwischen Eintragung und Übernahme können Tage
           liegen. Nichts wird mehr still verworfen: Was die Planung im
           Warndialog nicht ausgewählt hat, steht mit Grund an der Runde.
           Ohne Auswahl (best fehlt) gilt die alte Vorauswahl: alles
           Regelkonforme. */
        const gewaehlt = best && Array.isArray(best.indizes) ? new Set(best.indizes) : null;
        const neu = { ...m.abweichungen };
        let uebernommen = 0;
        const nicht = [];
        /* Der Grund ist eine Kennung, nie der Befundtext (Review K1): Der
           Rundenkopf geht an Beschäftigte und Schichtverantwortung; ein
           Wortlaut wie „MuSchG § 5“ oder „abwesend (Krank)“ verriete Dritten
           Gesundheitsangaben (server/lib/selbstplanung.mjs). */
        const nichtEintrag = (e, grund) => ({ personId: e.personId, datum: e.datum, dienstId: e.dienstId, grund });
        (r.eintraege || []).forEach((e, i) => {
          const p = m.personen.find((x) => x.id === e.personId);
          const da = m.dienstarten.find((x) => x.id === e.dienstId);
          if (!p || !da) { nicht.push(nichtEintrag(e, "fehlt")); return; }
          const bef = hindernisBefunde(m, p, e.datum, da);
          const ernst = bef.filter((b) => stufeRang(b.stufe) >= 2);
          const sperre = bef.find((b) => b.sperrt);
          if (sperre) { nicht.push(nichtEintrag(e, grundKennung(sperre))); return; }
          const nehmen = gewaehlt ? gewaehlt.has(i) : ernst.length === 0;
          if (!nehmen) { nicht.push(nichtEintrag(e, ernst.length ? grundKennung(ernst[0]) : "auswahl")); return; }
          if (bef.some((b) => b.art === "abwesend") && best && best.abwesenheitAufheben)
            m = { ...m, abwesenheiten: abwesenheitTagAufheben(m, e.personId, e.datum).abwesenheiten };
          neu[`${e.personId}|${e.datum}`] = e.dienstId;
          uebernommen++;
        });
        m = bestaetigungVermerken(m, best, wer(), "selbstplanung");
        melde(`${uebernommen} übernommen${nicht.length ? `, ${nicht.length} nicht übernommen` : ""}.`);
        return { ...m, abweichungen: neu,
          selbstplanung: m.selbstplanung.map((x) => x.id === id
            ? { ...x, status: "uebernommen", uebernommenAm: new Date().toISOString(),
                uebernommen, verworfen: nicht.length, nichtUebernommen: nicht } : x) };
      }, "Selbstplanung übernommen"),

      /* --- Notruf --- */
      notrufSenden: (art, notiz) => mUpd((m) => {
        const pid = sitz.person ? sitz.person.id : null;   // die Sitzung liegt über dem Betrieb, nicht in ihm
        const p = m.personen.find((x) => x.id === pid);
        if (!p) return m;
        const empf = notrufEmpfaenger(m, pid, heute());
        const t = personTag(m, p, heute());
        const da = t && t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
        const n = { id: uid("nr"), personId: pid, art, notiz: notiz || "",
          zeit: new Date().toISOString(), datum: heute(),
          dienst: da ? da.name : null, ort: da ? da.ort : null,
          empfaenger: empf.map((x) => x.id), bestaetigt: null };
        /* Die Mitteilungen an die Empfänger erzeugt und verschickt der Server
           beim Speichern (Commit 4) — auch für Beschäftigte, deren Notruf
           vorher ohne E-Mail und Push blieb. */
        melde("Hilferuf erfasst. Er ist für die zuständigen Rollen in CENTRIC sichtbar.");
        return { ...m, notrufe: [n, ...(m.notrufe || [])].slice(0, 200) };
      }, "Notruf abgesetzt"),

      notrufBestaetigen: (id) => mUpd((m) => ({ ...m,
        notrufe: (m.notrufe || []).map((n) => n.id === id
          ? { ...n, bestaetigt: new Date().toISOString(),
              durch: `${sitz.person.vorname} ${sitz.person.nachname}` } : n) }),
        "Notruf bestätigt"),

      /* --- Kalender, Weckzeit, Verfügbarkeit --- */
      kalenderEinrichten: async () => {
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        const pid = (ref.current.session || {}).personId;
        if (!mm || !pid) return;
        const pp = mm.personen.find((x) => x.id === pid);
        try {
          const d = await SP.kalenderEinrichten(pid, pp && pp.kalenderGeheim);
          /* WP-24: Der Feed rechnet der Server bei jedem Abruf live aus dem Bestand
             (server/lib/kalenderfeed.mjs) — das Gerät schickt keine Termine mehr. */
          mUpd((m) => ({ ...m, personen: m.personen.map((x) => x.id === pid
            ? { ...x, kalenderVerweis: d.verweis, kalenderGeheim: d.geheim,
                kalenderStand: new Date().toISOString() } : x) }), null);
        } catch (e) { melde(e.message); }
      },
      kalenderLoeschen: async () => {
        const pid = (ref.current.session || {}).personId;
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        const pp = mm && mm.personen.find((x) => x.id === pid);
        try { if (pp && pp.kalenderGeheim) await SP.kalenderLoeschen(pp.kalenderGeheim); }
        catch (e) { /* auch bei Fehler lokal entfernen */ }
        mUpd((m) => ({ ...m, personen: m.personen.map((x) => x.id === pid
          ? { ...x, kalenderVerweis: null, kalenderGeheim: null } : x) }), null);
      },
      setzeWeckzeit: (teil) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id
          ? { ...x, weckzeit: { ...WECK_STD, ...(x.weckzeit || {}), ...teil } } : x) }), null),
      verfuegbarkeitTeilen: (tage) => {
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        const pid = (ref.current.session || {}).personId;
        if (!mm || !pid) return;
        const bild = verfuegbarkeitsBild(mm, pid, tage || 14);
        const zeilen = bild.map((t) => `${fKurz(t.datum)}  ${t.frei ? "frei" : t.lage}`);
        const text = ["Wann ich Zeit habe:", "", ...zeilen, "",
          "Erstellt mit CENTRIC · zeigt nur frei oder belegt"].join("\n");
        try { navigator.clipboard.writeText(text); } catch { /* egal */ }
      },

      /* --- Betreiber: Mandanten --- */
      mandantVermerken: (eintrag) => upd((d) => ({ ...d,
        angelegteMandanten: [eintrag, ...(d.angelegteMandanten || [])].slice(0, 200) }),
        "Mandant angelegt"),

      /* --- Tour und Einstellungen --- */
      /* Wer die Tour ausdrücklich startet, hebt damit auch das frühere
         Wegklicken und Einklappen auf — sonst öffnete sich eine Tour, die
         man gerade angefordert hat, sofort wieder einzeilig. */
      tourStarten: (vonVorn) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: vonVorn
          ? { schritt: 0, gesehen: [], fertig: false, nichtMehr: false, offen: true,
              zurueckgestellt: false, eingeklappt: false }
          : { ...(x.tour || {}), offen: true, fertig: false,
              zurueckgestellt: false, eingeklappt: false } } : x) }), null),
      tourSchritt: (idx, gesehenId) => mUpd((m) => ({ ...m, personen: m.personen.map((x) => {
        if (x.id !== sitz.person.id) return x;
        const t = x.tour || {};
        const g = gesehenId && !(t.gesehen || []).includes(gesehenId)
          ? [...(t.gesehen || []), gesehenId] : (t.gesehen || []);
        return { ...x, tour: { ...t, schritt: idx, gesehen: g, offen: true } };
      }) }), null),
      /* Schließen unterscheidet zwei Fälle: „später fortsetzen" merkt sich die
         Stelle, „nicht mehr anzeigen" schaltet den Selbststart ab. Beides ist
         reversibel — unter Einstellungen.
         `zurueckgestellt` hält das Wegklicken über den Ansichtswechsel
         hinweg: ohne das startete die Tour sofort wieder, solange noch kein
         Schritt gesehen war. */
      tourSchliessen: (fuerImmer) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), offen: false,
          zurueckgestellt: true, ...(fuerImmer ? { nichtMehr: true } : {}) } } : x) }), null),
      /* Eingeklappt heißt: weiterhin da, aber einzeilig. Der Zustand gehört
         zur Person, nicht in eine Sitzungsvariable — sonst steht die Tour
         nach jedem Neuladen wieder in voller Höhe im Bild. */
      tourEinklappen: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), eingeklappt: !!an } } : x) }), null),
      tourBeenden: () => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), offen: false,
          fertig: true, schritt: 0 } } : x) }), null),
      /* Der Schalter verspricht „startet beim Öffnen von selbst". Wird er
         wieder eingeschaltet, muss deshalb auch ein früheres Wegklicken
         fallen — sonst bliebe das Versprechen ohne Wirkung. */
      setzeTourAnzeige: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), nichtMehr: !an,
          ...(an ? { zurueckgestellt: false } : {}) } } : x) }), null),

      /* Persönliche Vorliebe — nicht zu verwechseln mit setzeEinstellung,
         das betriebsweite Festlegungen ändert. */
      setzeMeineEinstellung: (feld, wert) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, [feld]: wert } : x) }), null),

      /* Eine geänderte Anmeldeadresse wird vermerkt — der Betreiber sieht
         daran, wenn ein Zugang den Besitzer wechselt. */
      setzeAnmeldeadresse: (wert) => mUpd((m) => {
        const alt = sitz.person.email || null;
        if (alt === (wert || null)) return m;
        return { ...m, personen: m.personen.map((x) => x.id === sitz.person.id
          ? { ...x, email: wert || null, emailGeaendert: new Date().toISOString(),
              emailVorher: alt } : x),
          adressAenderungen: [{ personId: sitz.person.id, von: alt, nach: wert || null,
            zeit: new Date().toISOString() }, ...(m.adressAenderungen || [])].slice(0, 200) };
      }, "Anmeldeadresse geändert"),

      sicherungAnlegen: async () => { try { await SP.sicherung(); } catch (e) { melde(e.message); } },
      /* WP-25: Liste und Zurückspielen (sicherungenLaden, zurueckspielen) — die Einstellungen
         reichen sie an SicherungenVerwalten weiter. Fehlten sie hier, bliebe die Liste bei „Lädt …“. */
      ...sicherungenAktionen(SP),
      auskunftErzeugen: (pid) => {
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        if (!mm) return;
        const pp = mm.personen.find((x) => x.id === pid);
        if (!pp) return;
        const inhalt = JSON.stringify({ person: pp,
          abwesenheiten: mm.abwesenheiten.filter((a) => a.personId === pid),
          anfragen: mm.anfragen.filter((a) => a.personId === pid),
          erstellt: new Date().toISOString() }, null, 2);
        const b = new Blob([inhalt], { type: "application/json" });
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u; a.download = `auskunft-${pp.nachname}-${heute()}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      },

      /* --- Offene Schichten --- */
      schreibeAus: (datum, dienstId, hinweis) => mUpd((m) => {
        if ((m.ausschreibungen || []).some((a) => a.datum === datum
          && a.dienstId === dienstId && a.status === "offen")) {
          melde("Diese Schicht ist bereits ausgeschrieben."); return m;
        }
        const da = m.dienstarten.find((x) => x.id === dienstId);
        const a = { id: uid("as"), datum, dienstId, hinweis: hinweis || "", status: "offen",
          erstellt: new Date().toISOString(),
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`,
          bewerbungen: [], vergebenAn: null };
        /* Nur die unterrichten, die sich tatsächlich bewerben dürfen —
           eine Mitteilung über einen Dienst, den man nicht nehmen kann,
           ist Lärm. */
        /* Die Schichtverantwortung unterrichtet nur ihren Bereich (Commit C1);
           die verantwortende Einheit setzt der Server. */
        const nachr = m.personen
          .filter((p) => { const r = darfSichBewerben({ ...m, ausschreibungen: [...(m.ausschreibungen || []), a] },
            p.id, a); return r.darf && !(r.hinweise || []).length && anBereichErlaubt(sitz, p); })
          .map((p) => baueMitteilung(m, p.id, "offeneSchicht",
            `Offene Schicht am ${fKurz(datum)}`,
            `${da ? da.name : dienstId}${da ? ` · ${da.start}–${da.ende}` : ""}${hinweis ? ` · ${hinweis}` : ""}`,
            "offene")).filter(Boolean);
        melde(`Ausgeschrieben · ${nachr.length} Personen unterrichtet.`);
        return { ...m, ausschreibungen: [a, ...(m.ausschreibungen || [])].slice(0, 500),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Schicht ausgeschrieben"),

      bewirbDich: (asId, text) => mUpd((m) => {
        const a = (m.ausschreibungen || []).find((x) => x.id === asId);
        /* Die eigene Person aus der Sitzung — nie aus dem Betrieb (Commit D1c). */
        const pid = sitz.person.id;
        if (!a) { melde("Ausschreibung nicht gefunden."); return m; }
        const pruef = darfSichBewerben(m, pid, a);
        if (!pruef.darf) { melde(`Bewerbung nicht möglich: ${pruef.grund}.`); return m; }
        const hinw = pruef.hinweise || [];
        melde(hinw.length ? `Bewerbung eingegangen, mit Hinweis: ${hinw[0]}. Die Planung entscheidet.`
          : "Bewerbung eingegangen. Die Planung entscheidet.");
        return { ...m, ausschreibungen: m.ausschreibungen.map((x) => x.id !== asId ? x
          : { ...x, bewerbungen: [...(x.bewerbungen || []),
              { personId: pid, zeit: new Date().toISOString(), text: text || "",
                ...(hinw.length ? { hinweise: hinw } : {}) }] }) };
      }, "Auf offene Schicht beworben"),

      ziehBewerbungZurueck: (asId) => mUpd((m) => {
        const pid = sitz.person.id;
        melde("Bewerbung zurückgezogen.");
        return { ...m, ausschreibungen: (m.ausschreibungen || []).map((x) => x.id !== asId ? x
          : { ...x, bewerbungen: (x.bewerbungen || []).filter((b) => b.personId !== pid) }) };
      }, "Bewerbung zurückgezogen"),

      vergibSchicht: (asId, personId, best) => mUpd((m0) => {
        let m = m0;
        const a = (m.ausschreibungen || []).find((x) => x.id === asId);
        if (!a) { melde("Ausschreibung nicht gefunden."); return m; }
        const p = m.personen.find((x) => x.id === personId);
        const da = m.dienstarten.find((x) => x.id === a.dienstId);
        if (!p) { melde("Person nicht gefunden."); return m; }
        const sperre = schutzSperre(m, p, a.datum, da);
        if (sperre) { melde(`Nicht möglich: ${sperre.text}.`); return m; }
        /* Zwischen Bewerbung und Zuschlag können Tage liegen. Geprüft wird
           im Warndialog vor dem Aufruf; hier wird nicht mehr abgebrochen,
           sondern die Bestätigung festgehalten (E-19). */
        const abw = abwesenheitAm(m, personId, a.datum);
        if (abw && !(best && best.abwesenheitAufheben)) {
          melde(`${p.vorname} ${p.nachname} ist am ${fKurz(a.datum)} abwesend. Erst die Abwesenheit für diesen Tag aufheben.`);
          return m;
        }
        if (abw) m = { ...m, abwesenheiten: abwesenheitTagAufheben(m, personId, a.datum).abwesenheiten };
        m = bestaetigungVermerken(m, best, wer(), "ausschreibung");
        const jetzt = new Date().toLocaleString("de-DE");
        const abgelehnt = (a.bewerbungen || []).filter((b) => b.personId !== personId);
        const nachr = [
          baueMitteilung(m, personId, "planGeaendert",
            `Du hast die Schicht am ${fKurz(a.datum)}`,
            `${da ? da.name : a.dienstId}${da ? ` · ${da.start}–${da.ende}` : ""} — du bist eingeteilt.`,
            "meine"),
          ...abgelehnt.filter((b) => anBereichErlaubt(sitz, m.personen.find((x) => x.id === b.personId)))
            .map((b) => baueMitteilung(m, b.personId, "antragEntschieden",
            `Schicht am ${fKurz(a.datum)} anderweitig vergeben`,
            "Danke für die Meldung — beim nächsten Mal hast du Vorrang.", "offene")),
        ].filter(Boolean);
        melde(`${p.vorname} ${p.nachname} eingeteilt.`);
        return { ...m,
          abweichungen: { ...m.abweichungen, [`${personId}|${a.datum}`]: a.dienstId },
          aenderungen: [{ id: uid("c"), personId, datum: a.datum, von: "-", nach: a.dienstId,
            zeit: jetzt, regelstand: REGELSTAND.version, vorlauf: vorlauf(a.datum) }, ...(m.aenderungen || [])].slice(0, 800),
          ausschreibungen: m.ausschreibungen.map((x) => x.id !== asId ? x
            : { ...x, status: "vergeben", vergebenAn: personId, vergebenZeit: jetzt }),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Offene Schicht vergeben"),

      ziehAusschreibungZurueck: (asId) => mUpd((m) => {
        melde("Ausschreibung zurückgezogen.");
        return { ...m, ausschreibungen: (m.ausschreibungen || []).map((x) => x.id !== asId ? x
          : { ...x, status: "zurueckgezogen" }) };
      }, "Ausschreibung zurückgezogen"),

      /* --- Zustellung --- */
      setzeEmail: (pid, wert) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, email: wert || null } : p) }), null),
      setzeZustellung: (pid, art, weg, an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, zustellung: { ...(p.zustellung || {}),
          [art]: { ...((p.zustellung || {})[art] || {}), [weg]: an } } } : p) }), null),
      setzeZustellungKanal: (pid, weg, an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, zustellung: { ...(p.zustellung || {}),
          kanal: { ...((p.zustellung || {}).kanal || {}), [weg]: an } } } : p) }), null),
      pushUmschalten: async (ein) => {
        const pid = (ref.current.session || {}).personId;
        if (!pid) return;
        try {
          if (ein) {
            /* Die Anmeldung selbst liegt nur im Push-Register des Servers;
               an der Person steht ein Merker (Commit 4). */
            await SP.pushEinschalten(pid);
            mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
              p.id === pid ? { ...p, pushSchluessel: true } : p) }), null);
            melde("Mitteilungen eingeschaltet.");
          } else {
            await SP.pushAusschalten(pid);
            mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
              p.id === pid ? { ...p, pushSchluessel: null } : p) }), null);
            melde("Mitteilungen ausgeschaltet.");
          }
        } catch (e) { melde(e.message); }
      },

      /* --- Handbuch --- */
      handbuchHaken: (schluessel) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, handbuch: (p.handbuch || []).includes(schluessel)
          ? (p.handbuch || []).filter((x) => x !== schluessel)
          : [...(p.handbuch || []), schluessel] } : p) }), null),
      druckeHandbuch: async () => {
        /* Das Fenster zuerst öffnen: Ein window.open nach einem await gilt
           dem Browser nicht mehr als Folge des Klicks und wird geblockt. */
        const w = window.open("", "_blank");
        if (!w) return melde("Der Druck wurde vom Browser blockiert.");
        try {
          const alle = await handbuchLaden();
          w.document.write(handbuchDruck(sitz.mandant, alle));
          w.document.close();
          setTimeout(() => { try { w.print(); } catch (e) { /* still */ } }, 400);
        } catch {
          w.close();
          melde("Der Handbuchinhalt ließ sich nicht laden. Bitte erneut versuchen.");
        }
      },

      /* --- Einführung --- */
      starteEinfuehrung: () => setEinf(true),
      einfuehrungSchritt: (n) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, einfuehrung: { ...(p.einfuehrung || {}), schritt: n } } : p) }), null),
      einfuehrungFertig: () => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, einfuehrung: { erledigt: true, schritt: 0 } } : p) }), null),
      oeffneAntrag: (d) => setAntragVon({ von: d || heute(), bis: d || heute() }),
      tauschAusPlan: (d) => mUpd((m) => {
        const jetzt = new Date().toLocaleString("de-DE");
        melde("Tauschgesuch eingestellt. Alle im Betrieb sehen es.");
        return { ...m, anfragen: [{ id: uid("r"), personId: sitz.person.id, typ: "tausch", status: "offen",
          partnerId: null, interessenten: [], von: d, bis: d, text: "", erstellt: jetzt }, ...m.anfragen] };
      }, "Tauschgesuch eingestellt"),
      oeffneKommando: () => setKmd(true),
      oeffneWunsch: (pid) => setWunschDlg(pid || sitz.person.id),
      oeffneNotizen: (k, t2) => setNotizDlg({ k, t: t2 }),
      oeffneMehrfach: () => setMehrfach(true),

      /* --- Wunschdienste: einmal möchte, zweimal lieber nicht, dreimal löschen --- */
      setzeWunsch: (pid, d) => mUpd((m) => {
        const liste = m.wuensche || [];
        const vorh = liste.find((w) => w.personId === pid && w.datum === d);
        if (!vorh) return { ...m, wuensche: [...liste, { id: uid("w"), personId: pid, datum: d, art: "moechte" }] };
        if (vorh.art === "moechte") return { ...m, wuensche: liste.map((w) =>
          w === vorh ? { ...w, art: "lieber_nicht" } : w) };
        return { ...m, wuensche: liste.filter((w) => w !== vorh) };
      }, null),

      /* --- Notizen --- */
      neueNotiz: (k, text, einheitId = null) => mUpd((m) => ({ ...m, notizen: { ...(m.notizen || {}),
        [k]: [{ id: uid("nz"), text, von: `${sitz.person.vorname} ${sitz.person.nachname}`, vonId: sitz.person.id,
          zeit: new Date().toLocaleString("de-DE"),
          einheitId: waehltEinheit(sitz) ? einheitId : eigeneEinheitVon(sitz) }, ...((m.notizen || {})[k] || [])] } }), "Notiz gespeichert"),
      loescheNotiz: (k, id) => mUpd((m) => ({ ...m, notizen: { ...(m.notizen || {}),
        [k]: ((m.notizen || {})[k] || []).filter((x) => x.id !== id) } }), null),

      /* --- Einarbeitung --- */
      neueEinarbeitung: (f) => mUpd((m) => ({ ...m, einarbeitung: [...(m.einarbeitung || []),
        { personId: f.personId, mentorId: f.mentorId, von: f.von, bis: f.bis, ziel: f.ziel }] }), "Einarbeitung angelegt"),
      loescheEinarbeitung: (pid, von) => mUpd((m) => ({ ...m,
        einarbeitung: (m.einarbeitung || []).filter((x) => !(x.personId === pid && x.von === von)) }), "Einarbeitung beendet"),

      /* --- Mehrfachbearbeitung --- */
      mehrfachDienst: (ids, von, bis, dienstId) => mUpd((m) => {
        const ab = { ...m.abweichungen };
        const aend = []; const jetzt = new Date().toLocaleString("de-DE");
        for (const pid of ids) {
          const p = m.personen.find((x) => x.id === pid); if (!p) continue;
          for (let d = von; d <= bis; d = addDays(d, 1)) {
            const eid = einheitAm(p, d);
            const plan = eid && p.imSchichtdienst !== false ? einheitDienst(m, eid, d) : null;
            const k = `${pid}|${d}`;
            const vorher = ab[k] !== undefined ? ab[k] : plan;
            if ((dienstId === "-" && !plan) || dienstId === plan) delete ab[k]; else ab[k] = dienstId;
            const nachher = ab[k] !== undefined ? ab[k] : plan;
            if ((vorher || "-") !== (nachher || "-"))
              aend.push({ id: uid("c"), personId: pid, datum: d, von: vorher || "-", nach: nachher || "-",
                zeit: jetzt, regelstand: REGELSTAND.version, vorlauf: vorlauf(d) });
          }
        }
        melde(`${aend.length} Einträge geändert.`);
        return { ...m, abweichungen: ab, aenderungen: [...aend, ...(m.aenderungen || [])].slice(0, 1200) };
      }, "Mehrere Tage geändert"),
      mehrfachAbwesenheit: (ids, von, bis, art) => mUpd((m) => {
        const neu = ids.map((pid) => ({ id: uid("a"), personId: pid, art, von, bis, notiz: "Sammeleintrag" }));
        melde(`${neu.length}× ${abwArt(art).label} eingetragen.`);
        return { ...m, abwesenheiten: [...m.abwesenheiten, ...neu] };
      }, "Abwesenheit für mehrere eingetragen"),

      /* --- Kalenderabo --- */
      kalenderAbo: (pid) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const p = m.personen.find((x) => x.id === pid); if (!p) return;
        const z = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CENTRIC//DE", "CALSCALE:GREGORIAN",
          "METHOD:PUBLISH", `X-WR-CALNAME:Dienstplan ${p.vorname} ${p.nachname}`,
          "X-PUBLISHED-TTL:PT6H", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
        for (let i = -30; i < 365; i++) {
          const d = addDays(heute(), i);
          const t2 = personTag(m, p, d);
          if (!t2.dienstId) continue;
          const da = m.dienstarten.find((x) => x.id === t2.dienstId); if (!da) continue;
          const [ms, me] = fenster(d, da);
          const stamp = (min) => { const dt = new Date(pISO(d).getTime() + min * 60000);
            return dt.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
          z.push("BEGIN:VEVENT", `UID:${p.id}-${d}@centric`, `DTSTAMP:${stamp(0)}`,
            `DTSTART:${stamp(ms)}`, `DTEND:${stamp(me)}`, `SUMMARY:${da.name}`,
            da.ort ? `LOCATION:${da.ort}` : "", `DESCRIPTION:${m.name} · ${n1(dauer(da))} h`, "END:VEVENT");
        }
        z.push("END:VCALENDAR");
        const inhalt = z.filter(Boolean).join("\r\n");
        if (lade(`dienstplan_${p.nachname}.ics`, inhalt, "text/calendar;charset=utf-8"))
          melde("Kalenderdatei erstellt. Für laufende Aktualisierung braucht es einen Server.");
        else setAusgabe({ titel: "Kalender", inhalt });
      },

      /* --- Briefing --- */
      briefingZeigen: () => setAusgabe({ titel: `Tagesbriefing · ${fLang(heute())}`, inhalt: briefingText(sitz) }),
      briefingPush: async () => {
        try {
          if (!("Notification" in window)) { melde("Dieser Browser unterstützt keine Benachrichtigungen."); return; }
          let erl = Notification.permission;
          if (erl === "default") erl = await Notification.requestPermission();
          if (erl !== "granted") { melde("Benachrichtigungen sind nicht freigegeben."); return; }
          const auf = tagesaufgaben(sitz);
          new Notification(`CENTRIC · ${auf.length ? `${auf.length} Vorgänge` : "nichts zu tun"}`,
            { body: auf.length ? auf.slice(0, 3).map((a) => a.titel).join("\n") : "Es liegt nichts an." });
          melde("Benachrichtigung gesendet.");
        } catch (e) { melde("Benachrichtigung nicht möglich."); }
      },
      /* --- Stempeluhr: der Server entscheidet ---

         Vorher rechnete der Browser den Abstand zum Einsatzort und schrieb
         sein eigenes Urteil in den Bestand. Jetzt gehen nur die
         Rohkoordinaten hinaus; Standort, Radius, Uhrzeit und Bewertung
         liegen auf dem Server, und von dort kommt das Ergebnis zurück. */
      /* WP-07: Jedes Stempeln geht zuerst in den Stempelpuffer des Geräts
         (SP.stempelErfassen) und dann hinaus. Kommt es durch, übernimmt
         stempelQuittung die Antwort — dieselbe Stelle für sofort und später
         (Netz zurück, Neustart) gesendete Stempel. Kommt es nicht durch,
         bleibt es vorläufig (offline gespeichert) und wird wiederholt; eine
         Absage des Servers wird mit Grund gemeldet und bleibt sichtbar
         (OfflineStempel). */
      stempeln: async (pid, datum, art, koord, pause = null) => {
        /* Mindestpause (WP-16): ein Hinweis, keine Sperre — gespeichert ist der Stempel ohnehin. */
        const pauseHinweis = (d) => {
          const hw = (d && Array.isArray(d.hinweise) ? d.hinweise : []).filter((x) => x && x.code === "PAUSE");
          if (hw.length) melde(`Ausgestempelt. Hinweis: ${hw[0].text}`);
        };
        try {
          /* Zuerst ablegen (Review L1): Der Stempel ist gesichert, bevor
             irgendetwas anderes ins Netz geht. */
          const ev = await SP.stempelErfassen(datum, art, koord, pause);
          if (!ev) {
            /* Inhaber unbekannt (Antwort eines älteren Servers): direkt wie bisher. */
            await SP.schreibenAbschliessen();
            const erg = await SP.stempeln(datum, art, koord, pause);
            await stempelUebernehmen(pid, [{ datum, art, erg }]);
            pauseHinweis(erg);
            return;
          }
          /* Was noch zum Schreiben ansteht, geht vorher regulär hinaus — sonst
             liefe es nach dem Stempeln mit dem alten ETag in einen 409.
             Höchstens fünf Sekunden gewartet; der Stempel hängt nicht davon ab. */
          await Promise.race([SP.schreibenAbschliessen(), new Promise((ok) => setTimeout(ok, 5000))]);
          const lauf = await SP.stempelSenden({ sofort: true });
          const r = lauf.ergebnisse[ev.id];
          if (r && r.art === "ok") { pauseHinweis(r.daten); return; }
          if (r && r.art === "abgelehnt") { melde(`Stempel abgelehnt: ${r.grund}`); return; }
          if (lauf.angehalten === "abgemeldet" || lauf.angehalten === "fremde-sitzung") {
            melde("Die Anmeldung ist abgelaufen — der Stempel ist auf dem Gerät gespeichert und wird nach der Anmeldung gesendet.");
            return;
          }
          melde(`${art === "start" ? "Einstempeln" : "Ausstempeln"} vorläufig (offline gespeichert) — wird gesendet, sobald Netz da ist.`);
        } catch (e) {
          melde(e.message || "Das Stempeln hat nicht geklappt.");
        }
      },
      /* Ein vom Server quittierter Stempel aus dem Puffer — auch einer, der im
         Hintergrund (Netz zurück, Neustart) gesendet wurde. */
      stempelQuittung: (liste) => {
        const pid = ref.current && ref.current.session ? ref.current.session.personId : null;
        if (!pid || !Array.isArray(liste)) return;
        stempelUebernehmen(pid, liste.filter((q) => q && q.daten)
          .map((q) => ({ datum: q.ev.datum, art: q.ev.art, erg: q.daten }))).catch(() => {});
      },
      stempelErneut: (id) => SP.stempelErneut(id),
      stempelVerwerfen: (id) => SP.stempelVerwerfen(id),
      setzeVerfuegbarkeit: (pid, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, verfuegbarkeit: v } : p) }), "Verfügbarkeit gespeichert"),
      oeffneVerfuegbarkeit: (pid) => setVerfDlg(pid || sitz.person.id),
      oeffneNachweis: (pid, qid) => setNwDlg({ pid, qid }),
      setzeNachweis: (pid, qid, ablauf, datei, vorhanden) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid) return p;
        const liste = (p.qualNachweise || []).filter((x) => x.qualId !== qid);
        /* Ein Nur-Status-Nachweis trägt nur „vorhanden" — nie Datum oder Datei. */
        const q = m.qualifikationen.find((x) => x.id === qid);
        const eintrag = q && q.nurStatus
          ? { qualId: qid, ablauf: null, datei: null, vorhanden: !!vorhanden }
          : { qualId: qid, ablauf, datei };
        return { ...p, qualNachweise: [...liste, eintrag] };
      }) }), "Nachweis gespeichert"),
      /* --- Lenk- und Ruhezeiten ---

         Ein leeres Feld löscht den Wert, statt ihn auf null zu setzen: Was
         nicht erfasst ist, darf nicht als „null Minuten gefahren" gelten.
         Die Unterbrechungen kommen als Text („15, 30") und werden zu einer
         Liste — die Reihenfolge zählt, weil das Gesetz sie vorschreibt. */
      setzeFahrzeit: (pid, datum, feld, wert) => mUpd((m) => {
        const k = `${pid}|${datum}`;
        const alt = (m.fahrzeiten || {})[k] || {};
        const neu = { ...alt };
        if (feld === "unterbrechungen") {
          const liste = String(wert).split(/[^0-9]+/).map(Number).filter((n) => n > 0);
          if (liste.length) neu.unterbrechungen = liste; else delete neu.unterbrechungen;
        } else if (feld === "kennzeichen") {
          const t = String(wert).trim();
          if (t) neu.kennzeichen = t.slice(0, 20); else delete neu.kennzeichen;
        } else {
          const roh = String(wert).trim();
          if (roh === "") delete neu[feld];
          else {
            const n = Number(roh);
            if (!Number.isFinite(n) || n < 0) return m;
            neu[feld] = Math.round(n);
          }
        }
        const alle = { ...(m.fahrzeiten || {}) };
        if (Object.keys(neu).length) alle[k] = neu; else delete alle[k];
        return { ...m, fahrzeiten: alle };
      }, null),

      /* --- PPP-RL: therapeutisches Personal je Woche --- */
      setzeTherapie: (einheitId, woche, feld, wert) => mUpd((m) => {
        const k = `${einheitId}|${woche}`;
        const alt = (m.therapie || {})[k] || {};
        const neu = { ...alt, minuten: { ...(alt.minuten || {}) } };
        const roh = String(wert).trim();
        const zahl = roh === "" ? null : Number(roh);
        if (roh !== "" && (!Number.isFinite(zahl) || zahl < 0)) return m;
        if (feld === "patienten") {
          if (roh === "") delete neu.patienten; else neu.patienten = Math.round(zahl * 10) / 10;
        } else if (roh === "") delete neu.minuten[feld];
        else neu.minuten[feld] = Math.round(zahl);
        if (!Object.keys(neu.minuten).length) delete neu.minuten;
        const alle = { ...(m.therapie || {}) };
        if (Object.keys(neu).length) alle[k] = neu; else delete alle[k];
        return { ...m, therapie: alle };
      }, null),

      setzeEinheitPpp: (einheitId, bereich, art) => mUpd((m) => ({ ...m,
        einheiten: m.einheiten.map((e) => (e.id === einheitId
          ? { ...e, pppBereich: bereich, pppArt: art || e.pppArt || "vollstationaer" } : e)),
      }), "Behandlungsbereich gesetzt"),

      /* --- Vorbehaltene Aufgaben ---

         Anders als eine Quote ist das eine Anwesenheit: mindestens eine
         Person im Dienst, die sie ausüben darf. Der Vorschlag aus § 4 PflBG
         wird beim Anlegen mit der Fachkraftqualifikation des Betriebs
         verknüpft — steht keine bereit, bleibt das Feld offen und die
         Prüfung sagt das, statt stillschweigend „gedeckt" zu melden. */
      legeAufgabenVor: () => mUpd((m) => {
        const fk = m.qualifikationen.find((q) => q.fachkraft);
        const vorhanden = new Set((m.aufgaben || []).map((a) => a.name));
        const neue = AUFGABEN_PFLBG.filter((a) => !vorhanden.has(a.name)).map((a) => ({
          id: uid("af"), name: a.name, grundlage: a.grundlage, vorbehalten: true,
          qualifikationId: fk ? fk.id : null, mindestens: 1, dienstarten: [],
        }));
        if (!neue.length) return m;
        return { ...m, aufgaben: [...(m.aufgaben || []), ...neue] };
      }, "Vorbehaltene Aufgaben angelegt"),

      speichereAufgabe: (a) => mUpd((m) => {
        const rein = {
          id: a.id || uid("af"),
          name: String(a.name || "").trim(),
          grundlage: String(a.grundlage || "").trim(),
          vorbehalten: a.vorbehalten !== false,
          qualifikationId: a.qualifikationId || null,
          mindestens: Math.max(1, Number(a.mindestens) || 1),
          dienstarten: a.dienstarten || [],
        };
        const liste = m.aufgaben || [];
        return { ...m, aufgaben: liste.some((x) => x.id === rein.id)
          ? liste.map((x) => (x.id === rein.id ? rein : x)) : [...liste, rein] };
      }, "Aufgabe gespeichert"),

      loescheAufgabe: (id) => mUpd((m) => ({ ...m,
        aufgaben: (m.aufgaben || []).filter((x) => x.id !== id) }), "Aufgabe gelöscht"),

      /* --- Pflegepersonaluntergrenzen ---

         Die Belegung ist eine Zahl je Einheit, Tag und Schicht. Ein leeres
         Feld löscht den Eintrag, statt ihn auf null zu setzen: „nichts
         eingetragen" und „null Patienten" sind zwei verschiedene Aussagen,
         und nur die zweite darf als eingehalten gelten. */
      setzeBelegung: (einheitId, datum, schicht, wert) => mUpd((m) => {
        const k = `${einheitId}|${datum}|${schicht}`;
        const b = { ...(m.belegung || {}) };
        const roh = String(wert).trim();
        if (roh === "") delete b[k];
        else {
          const n = Number(roh);
          if (!Number.isFinite(n) || n < 0) return m;
          b[k] = { patienten: Math.round(n) };
        }
        return { ...m, belegung: b };
      }, null),

      setzeEinheitBereich: (einheitId, bereich) => mUpd((m) => ({ ...m,
        einheiten: m.einheiten.map((e) => (e.id === einheitId ? { ...e, ppugvBereich: bereich } : e)),
      }), "Pflegesensitiver Bereich gesetzt"),

      /* --- Kompetenzen ---

         Anlegen, ändern, löschen — und die Freigabe an einer Person. Wer
         eine Freigabe zurücknimmt, löscht sie nicht: Der Eintrag bleibt mit
         Datum stehen, damit nachvollziehbar ist, dass es sie einmal gab.
         Bei einer Prüfung ist das der Unterschied zwischen „war nie da" und
         „wurde entzogen". */
      speichereKompetenz: (k) => mUpd((m) => {
        const rein = {
          id: k.id || uid("kp"),
          name: String(k.name || "").trim(),
          art: k.art || "taetigkeit",
          betriebsmittelId: k.art === "geraet" ? (k.betriebsmittelId || null) : null,
          stufe: k.stufe || "",
          freigabeStelle: String(k.freigabeStelle || "").trim(),
          wiederholungMonate: k.wiederholungMonate === "" ? null : (k.wiederholungMonate ?? null),
          grundlage: String(k.grundlage || "").trim(),
          pflichtFuer: k.pflichtFuer || [],
          zugedacht: k.zugedacht || [],
        };
        const liste = m.kompetenzen || [];
        return { ...m, kompetenzen: liste.some((x) => x.id === rein.id)
          ? liste.map((x) => (x.id === rein.id ? rein : x)) : [...liste, rein] };
      }, "Kompetenz gespeichert"),

      loescheKompetenz: (kid) => mUpd((m) => ({ ...m,
        kompetenzen: (m.kompetenzen || []).filter((x) => x.id !== kid),
        personen: m.personen.map((p) => ({ ...p,
          kompetenzNachweise: (p.kompetenzNachweise || []).filter((n) => n.kompetenzId !== kid) })),
      }), "Kompetenz gelöscht"),

      setzeKompetenz: (pid, kid, erteilen) => mUpd((m) => ({ ...m,
        personen: m.personen.map((p) => {
          if (p.id !== pid) return p;
          const liste = (p.kompetenzNachweise || []).filter((x) => x.kompetenzId !== kid);
          if (!erteilen) {
            const vorher = (p.kompetenzNachweise || []).find((x) => x.kompetenzId === kid);
            if (!vorher) return { ...p, kompetenzNachweise: liste };
            return { ...p, kompetenzNachweise: [...liste,
              { ...vorher, zurueckgenommen: heute(),
                durch: `${sitz.person.vorname} ${sitz.person.nachname}` }] };
          }
          return { ...p, kompetenzNachweise: [...liste,
            { kompetenzId: kid, ab: heute(), bis: null, zurueckgenommen: null,
              durch: `${sitz.person.vorname} ${sitz.person.nachname}` }] };
        }),
      }), "Kompetenz erteilt oder zurückgenommen"),

      setzeKontrastmodus: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, kontrastmodus: an } : p) }), null),

      /* --- Schwarzes Brett --- */
      neuerAushang: (f) => mUpd((m) => ({ ...m, aushang: [{ id: uid("ah"), titel: f.titel, text: f.text,
        wichtig: !!f.wichtig, bis: f.bis || null, von: `${sitz.person.vorname} ${sitz.person.nachname}`,
        zeit: new Date().toLocaleString("de-DE") }, ...(m.aushang || [])] }), "Aushang angeschlagen"),
      loescheAushang: (id) => mUpd((m) => ({ ...m, aushang: (m.aushang || []).filter((x) => x.id !== id) }), "Aushang abgenommen"),

      /* --- Betriebsmittel --- */
      neuesMittel: (f) => mUpd((m) => ({ ...m, betriebsmittel: [...(m.betriebsmittel || []),
        { id: uid("bm"), art: f.art, name: f.name, kennung: f.kennung,
          personId: f.personId || null, seit: f.personId ? heute() : null }] }), "Betriebsmittel angelegt"),
      setzeMittel: (id, k, v) => mUpd((m) => ({ ...m, betriebsmittel: (m.betriebsmittel || []).map((x) =>
        x.id === id ? { ...x, [k]: v, seit: k === "personId" ? (v ? heute() : null) : x.seit } : x) }), null),
      loescheMittel: (id) => mUpd((m) => ({ ...m, betriebsmittel: (m.betriebsmittel || []).filter((x) => x.id !== id) }), "Betriebsmittel gelöscht"),

      /* --- Aushangplan als PDF im Kalenderlook --- */
      aushangPDF: (ym2, einheitId) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const e = m.einheiten.find((x) => x.id === einheitId);
        const [y, mo] = ym2.split("-").map(Number);
        const n = dim_(y, mo - 1);
        const erster = dow(`${ym2}-01`);
        const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
        const zellen = [];
        for (let i = 0; i < erster; i++) zellen.push(null);
        for (let i = 1; i <= n; i++) zellen.push(`${ym2}-${pad(i)}`);
        const woch = [];
        for (let i = 0; i < zellen.length; i += 7) woch.push(zellen.slice(i, i + 7));
        const fg = freigabeStand(m, ym2);
        /* Daten aus dem Bestand nur maskiert ins HTML (SI-03): Betriebs-,
           Einheiten- und Dienstartnamen sind Freitext anderer Rollen. */
        const h = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const farbeSicher = (x) => (/^#[0-9a-f]{3,8}$/i.test(String(x || "")) ? x : "inherit");
        const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Dienstplan ${MON[mo - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827;margin:0}
h1{font-size:22pt;font-weight:300;letter-spacing:-.03em;margin:0}
h1 b{font-weight:700}
.kopf{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2C4E5C;padding-bottom:9px;margin-bottom:14px}
.rub{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#3E6478}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#5A6670;padding:6px 4px;border-bottom:1.5px solid #2C4E5C}
td{border:1px solid #E3E1DD;height:74px;vertical-align:top;padding:5px 6px}
.tag{font-size:8.5pt;color:#5A6670;font-weight:600}
.we{background:#F5F4F2}.fei{background:#FEF2F2}
.d{margin-top:5px;font-size:13pt;font-weight:700;letter-spacing:-.02em}
.z{font-size:7.5pt;color:#5A6670;margin-top:1px}
.fuss{margin-top:12px;font-size:8pt;color:#5A6670;display:flex;justify-content:space-between;border-top:1px solid #E3E1DD;padding-top:7px}
</style></head><body>
<div class="kopf"><div><div class="rub">${h(m.name)}</div>
<h1>${e ? h(e.name) : ""} — <b>${MON[mo - 1]} ${y}</b></h1></div>
<div style="text-align:right"><div class="rub">${fg ? `Freigegeben · Stand ${h(fg.stand)}` : "Entwurf"}</div>
<div style="font-size:8pt;color:#5A6670;margin-top:3px">${fg ? h(fg.zeit) : `erstellt ${new Date().toLocaleString("de-DE")}`}</div></div></div>
<table><thead><tr>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
${woch.map((w) => `<tr>${w.map((d) => {
  if (!d) return '<td style="border:none"></td>';
  const fei = feiertag(d, landFuerEinheit(m, einheitId));
  const we = dow(d) >= 5;
  const id = einheitDienst(m, einheitId, d);
  const da = id && map[id];
  return `<td class="${fei ? "fei" : we ? "we" : ""}"><div class="tag">${Number(d.slice(8))}${fei ? " · Feiertag" : ""}</div>
${da ? `<div class="d" style="color:${farbeSicher(da.farbe)}">${h(da.kurz)}</div><div class="z">${h(da.start)}–${h(da.ende)}</div>` : ""}</td>`;
}).join("")}</tr>`).join("")}
</tbody></table>
<div class="fuss"><span>CENTRIC · ${h(m.name)}</span><span>Zum Aushang bestimmt. Änderungen werden gesondert bekanntgegeben.</span></div>
</body></html>`;
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); melde("Aushangplan erstellt."); }
        else setAusgabe({ titel: "Aushangplan", inhalt: html });
      },

      oeffneSchnellbesetzung: (d, dienstId) => setSchnell({ datum: d, dienstId }),
      oeffneWizard: () => setWizard(true),
      anfrageVermerken: (d, dienstId, weg) => mUpd((m) => ({ ...m,
        aenderungen: [{ id: uid("c"), personId: null, datum: d, von: "-", nach: `Anfrage ${weg}`,
          zeit: new Date().toLocaleString("de-DE"), regelstand: REGELSTAND.version, vorlauf: vorlauf(d) }, ...(m.aenderungen || [])].slice(0, 800) }),
        `Dienstanfrage für ${fKurz(d)} versandt`),

      /* --- Tauschbörse --- */
      tauschMelden: (id) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const jetzt = new Date().toLocaleString("de-DE");
        melde("Meldung eingegangen. Die Planung entscheidet.");
        /* Die Mitteilung an die Person des Gesuchs erzeugt der Server (Commit 4). */
        return { ...m,
          anfragen: m.anfragen.map((x) => x.id === id
            ? { ...x, interessenten: [...new Set([...(x.interessenten || []), sitz.person.id])] } : x) };
      }, "Meldung auf Tauschgesuch"),
      tauschAbmelden: (id) => mUpd((m) => ({ ...m, anfragen: m.anfragen.map((x) => x.id === id
        ? { ...x, interessenten: (x.interessenten || []).filter((p) => p !== sitz.person.id) } : x) }), null),
      tauschZuteilen: (id, interessentId, best) => mUpd((m0) => {
        const a0 = m0.anfragen.find((x) => x.id === id); if (!a0) return m0;
        /* Harte Schutzbefunde sperren auch beim Tausch (Kette B), in beide Richtungen. */
        const pA = m0.personen.find((x) => x.id === a0.personId), pI = m0.personen.find((x) => x.id === interessentId);
        const daVon = (p) => p ? m0.dienstarten.find((x) => x.id === personTag(m0, p, a0.von).dienstId) : null;
        const sperre = schutzSperre(m0, pI, a0.von, daVon(pA)) || schutzSperre(m0, pA, a0.von, daVon(pI));
        if (sperre) { melde(`Nicht möglich: ${sperre.text}.`); return m0; }
        const m = bestaetigungVermerken(m0, best, wer(), "tausch");
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const t1 = personTag(m, m.personen.find((x) => x.id === a.personId), a.von);
        const t2 = personTag(m, m.personen.find((x) => x.id === interessentId), a.von);
        const ab = { ...m.abweichungen };
        ab[`${a.personId}|${a.von}`] = t2.dienstId || "-";
        ab[`${interessentId}|${a.von}`] = t1.dienstId || "-";
        const jetzt = new Date().toLocaleString("de-DE");
        const namen = (x) => { const p = m.personen.find((y) => y.id === x); return p ? `${p.vorname} ${p.nachname}` : "?"; };
        melde(`Tausch bestätigt: ${namen(a.personId)} und ${namen(interessentId)}.`);
        return { ...m, abweichungen: ab,
          anfragen: m.anfragen.map((x) => x.id === id
            ? { ...x, status: "genehmigt", partnerId: interessentId, antwort: `getauscht mit ${namen(interessentId)}` } : x),
          nachrichten: [
            baueMitteilung(m, a.personId, "antragEntschieden", `Tausch am ${fKurz(a.von)} bestätigt`, `Getauscht mit ${namen(interessentId)}.`, "meine"),
            baueMitteilung(m, interessentId, "planGeaendert", `Tausch am ${fKurz(a.von)} bestätigt`, `Du übernimmst den Dienst von ${namen(a.personId)}.`, "meine"),
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Tausch zugeteilt"),

      /* --- Einrichtungsassistent --- */
      assistentUebernehmen: (e) => mUpd((m) => {
        const einheiten = e.gruppen.map((g) => ({ id: g.id, name: g.name, versatz: Math.round(g.versatzTage / 7),
          versatzTage: g.versatzTage, farbe: g.farbe, pool: false, standortId: (m.standorte[0] || {}).id }));
        const pool = m.einheiten.find((x) => x.pool);
        if (pool) einheiten.push(pool);
        const dienstarten = e.dienstarten.map((d) => ({ id: d.id, name: d.name, kurz: d.kurz, start: d.start,
          ende: d.ende, pause: d.pause || 0, farbe: d.farbe, ort: d.ort || "", posten: false, quelle: null,
          faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false, mindest: d.mindest, mindestQual: d.mindestQual || {} }));
        // Personen den neuen Gruppen zuordnen; unbekannte Gruppe fällt auf die erste
        const zuordnung = (name) => (einheiten.find((x) => x.name.toLowerCase() === String(name).toLowerCase()) || einheiten[0]).id;
        const bestand = m.personen.map((p) => {
          const alt = einheitAm(p, heute());
          const treffer = einheiten.find((x) => x.id === alt) || einheiten[0];
          return { ...p, zugehoerigkeit: [{ ab: e.anker, einheitId: treffer.id }] };
        });
        const neue = (e.personen || []).map((z) => ({
          id: uid("p"), vorname: z.vorname, nachname: z.nachname, funktion: "Fachkraft",
          email: "", zugehoerigkeit: [{ ab: e.anker, einheitId: zuordnung(z.gruppe) }],
          eintritt: e.anker, austritt: null, wochenstunden: z.wochenstunden,
          urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0, qualifikationen: [],
          teilzeit: z.wochenstunden < (m.einstellungen.sollWochenstunden || 40)
            ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null,
          springer: false, einschraenkungen: {}, rolle: "mitarbeiter", rolleSeit: e.anker,
          bereich: zuordnung(z.gruppe), status: "aktiv", imSchichtdienst: true }));
        melde(`Einrichtung übernommen: ${einheiten.filter((x) => !x.pool).length} Gruppen, ${dienstarten.length} Dienstarten${neue.length ? `, ${neue.length} Personen` : ""}.`);
        return { ...m, einheitLabel: e.einheitLabel, branche: e.branche, anker: e.anker,
          zyklus: { wochen: Math.ceil(e.tage.length / 7), tage: e.tage, vorlage: null },
          einheiten, dienstarten, personen: [...bestand, ...neue], abweichungen: {} };
      }, "Schichtplanung neu eingerichtet"),

      /* --- Planungsassistent --- */
      oeffneAssistent: () => setAssist(true),
      uebernehmeVorschlag: (erg) => mUpd((m) => {
        const neue = Object.keys(erg.abweichungen).filter((k) => m.abweichungen[k] !== erg.abweichungen[k]);
        const jetzt = new Date().toLocaleString("de-DE");
        const aend = neue.map((k) => { const [pid, d] = k.split("|");
          return { id: uid("c"), personId: pid, datum: d, von: "-", nach: erg.abweichungen[k], zeit: jetzt, vorlauf: vorlauf(d) }; });
        const nachr = istFreigegeben(m, erg.ym) ? neue.map((k) => { const [pid, d] = k.split("|");
          const da = m.dienstarten.find((x) => x.id === erg.abweichungen[k]);
          return baueMitteilung(m, pid, "planGeaendert", `Zusätzlicher Dienst am ${fKurz(d)}`,
            `${da ? da.name : ""} · durch die Planung ergänzt`, "meine"); }).filter(Boolean) : [];
        melde(`${neue.length} Einteilungen übernommen.`);
        return { ...m, abweichungen: erg.abweichungen,
          aenderungen: [...aend, ...(m.aenderungen || [])].slice(0, 800),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Planungsvorschlag übernommen"),

      /* --- Warnen statt sperren (E-19) ---
         Prüft die Einträge eines Vorgangs. Ohne ernsten Befund läuft die
         Aktion sofort, sonst öffnet der Warndialog. Gesperrt wird nie. */
      mitWarnung: (m, vorgang) => {
        const geprueft = (vorgang.eintraege || []).map((e) => ({ ...e,
          ...befundeFuerEinteilung(m, e.personId, e.datum, e.dienstId) }));
        const ernst = geprueft.some((e) => e.technisch || e.befunde.some((b) => stufeRang(b.stufe) >= 2));
        if (!ernst && !vorgang.immerZeigen) {
          vorgang.ausfuehren({ eintraege: geprueft.map((e) => ({ personId: e.personId, datum: e.datum,
            dienstId: e.dienstId, idx: e.idx, befunde: e.befunde })),
          indizes: geprueft.map((e) => e.idx).filter((x) => x !== undefined), gelesen: false, grundArt: null });
          return;
        }
        setWarnung({ ...vorgang, geprueft });
      },

      /* --- Eskalation --- */
      oeffneEskalation: (d, dienstId) => setEskal({ datum: d, dienstId }),
      einsatzanfrage: (d, dienstId, ids) => mUpd((m) => {
        const da = m.dienstarten.find((x) => x.id === dienstId);
        const jetzt = new Date().toLocaleString("de-DE");
        const nachr = ids.map((pid) => baueMitteilung(m, pid, "einspringen",
          `Einsatzanfrage für ${fKurz(d)}`,
          `${da ? da.name : dienstId} · ${da ? `${da.start}–${da.ende}` : ""} — bitte in „Meine Schichten" zusagen oder absagen.`,
          "meine")).filter(Boolean);
        const anf = ids.map((pid) => ({ id: uid("r"), personId: pid, typ: "einsatz", status: "offen",
          erstellt: jetzt, antwort: "", von: d, bis: d, dienstId, text: "Einsatzanfrage der Planung" }));
        melde(`Anfrage an ${ids.length} Personen versandt.`);
        return { ...m, anfragen: [...anf, ...m.anfragen], nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Einsatzanfrage versandt"),
      dokumentiereUnterschreitung: (d, dienstId, grund) => mUpd((m) => {
        melde("Unterschreitung dokumentiert.");
        return { ...m, unterschreitungen: [{ id: uid("u"), datum: d, dienstId, grund,
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`, zeit: new Date().toLocaleString("de-DE") },
          ...(m.unterschreitungen || [])] };
      }, "Unterschreitung dokumentiert"),

      /* --- Freizeitausgleich --- */
      oeffneAusgleich: (pid) => setAusgl(pid),
      planeFreischicht: (pid, d) => mUpd((m) => {
        melde("Freischicht eingetragen, das Konto sinkt entsprechend.");
        return { ...m, abwesenheiten: [...m.abwesenheiten,
          { id: uid("a"), personId: pid, art: "ausgleich", von: d, bis: d, notiz: "Freizeitausgleich" }] };
      }, "Freischicht geplant"),

      /* --- Zuschläge --- */
      setzeZuschlag: (id, k, v) => mUpd((m) => ({ ...m, zuschlaege: (m.zuschlaege || []).map((z) => z.id === id ? { ...z, [k]: v } : z) }), null),
      neueZuschlagsregel: () => mUpd((m) => ({ ...m, zuschlaege: [...(m.zuschlaege || []),
        { id: uid("z"), name: "Neue Regel", art: "nacht", prozent: 0, aktiv: false }] }), "Zuschlagsregel angelegt"),
      loescheZuschlag: (id) => mUpd((m) => ({ ...m, zuschlaege: (m.zuschlaege || []).filter((z) => z.id !== id) }), "Zuschlagsregel gelöscht"),

      /* --- Jahresurlaubsrunde --- */
      eroeffneRunde: (jahr) => mUpd((m) => ({ ...m, urlaubsrunde: { jahr, phase: "offen",
        frist: `${jahr - 1}-10-31`, kontingent: {}, wuensche: [], vorjahrZurueck: [] } }), "Urlaubsrunde eröffnet"),
      schliesseRunde: () => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde, phase: "geschlossen" } }), "Wunschphase geschlossen"),
      oeffneRunde: () => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde, phase: "offen" } }), "Wunschphase geöffnet"),
      wunschEintragen: (w) => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde,
        wuensche: [...m.urlaubsrunde.wuensche, { id: uid("w"), personId: sitz.person.id, von: w.von, bis: w.bis,
          prio: w.prio, status: "offen", erstellt: new Date().toISOString() }] } }), "Urlaubswunsch eingetragen"),
      wunschLoeschen: (id) => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde,
        wuensche: m.urlaubsrunde.wuensche.filter((x) => x.id !== id) } }), null),
      wunschEntscheiden: (id, ja) => mUpd((m) => {
        const w = m.urlaubsrunde.wuensche.find((x) => x.id === id);
        const p = m.personen.find((x) => x.id === w.personId);
        const jetzt = new Date().toLocaleString("de-DE");
        let next = { ...m, urlaubsrunde: { ...m.urlaubsrunde,
          wuensche: m.urlaubsrunde.wuensche.map((x) => x.id === id ? { ...x, status: ja ? "genehmigt" : "abgelehnt" } : x),
          vorjahrZurueck: ja ? (m.urlaubsrunde.vorjahrZurueck || []).filter((x) => x !== w.personId)
            : [...new Set([...(m.urlaubsrunde.vorjahrZurueck || []), w.personId])] },
          nachrichten: [baueMitteilung(m, w.personId, "antragEntschieden", `Urlaubswunsch ${ja ? "zugesagt" : "abgesagt"}`,
            `${fDatum(w.von)} bis ${fDatum(w.bis)}${ja ? "" : " · du hast bei der nächsten Runde Vorrang"}`, "antraege"),
            ...(m.nachrichten || [])].slice(0, 400) };
        if (ja) next = { ...next, abwesenheiten: [...next.abwesenheiten,
          { id: uid("a"), personId: w.personId, art: "urlaub", von: w.von, bis: w.bis, notiz: "aus der Jahresrunde" }] };
        melde(ja ? `Zugesagt und eingetragen: ${p.nachname}.` : `Abgesagt — ${p.nachname} erhält Vorrang bei der nächsten Runde.`);
        return next;
      }, "Urlaubswunsch entschieden"),

      /* --- Datenschutz --- */
      anonymisiere: (pid) => mUpd((m) => {
        if (!window.confirm("Name und Kontaktdaten werden unwiderruflich ersetzt. Planungsdaten bleiben als Statistik erhalten.")) return m;
        melde("Datensatz anonymisiert.");
        return { ...m, personen: m.personen.map((p) => p.id === pid
          ? { ...anonymPerson(p), anonymSeit: heute() } : p),
          nachrichten: (m.nachrichten || []).filter((n) => n.personId !== pid) };
      }, "Datensatz anonymisiert"),

      /* Der Löschlauf über alle drei Fristen. Bis hierher standen die
         Fristen im Bestand und taten nichts — Artikel 17 DSGVO verlangt
         die Löschung, nicht die Absicht dazu. */
      loeschlauf: () => {
        const s2 = ref.current;
        const m0 = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const vor = loeschVorschau(m0, heute());
        if (vor.gesamt === 0) { melde("Nichts fällig — alle Fristen eingehalten."); return; }
        if (!window.confirm(
          `${loeschBericht(vor)}\n\nDas lässt sich nicht rückgängig machen. `
          + "Bei Zweifel vorher eine Sicherung anlegen.")) return;
        let text = "";
        mUpd((m) => {
          const { mandant, bericht } = loeschlaufAusfuehren(m, heute());
          text = loeschBericht(bericht);
          return mandant;
        }, `Löschlauf: ${loeschBericht(vor)}`);
        melde(text || "Löschlauf ausgeführt.");
      },
      datenauskunft: (pid) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const p = m.personen.find((x) => x.id === pid);
        const inhalt = datenauskunft(m, pid);
        if (lade(`datenauskunft_${p.nachname}.txt`, inhalt, "text/plain;charset=utf-8")) melde("Auskunft erstellt.");
        else setAusgabe({ titel: "Datenauskunft", inhalt });
      },
      exportZuschlaege: (ym2) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        /* Dieselbe Rückfrage wie bei der Lohnausgabe (Nachprüfung WP-17, A1):
           Auch hier zählen Ist-Zeiten zur Prüfung vorläufig mit der Planzeit. */
        const warnung = lohnWarnung(m, ym2, exportWarnung(m, ym2));
        if (warnung && !window.confirm(warnung)) return;
        const regeln = (m.zuschlaege || []).filter((z) => z.aktiv);
        const kopf = ["Nachname", "Vorname", "Personalnummer", "Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag",
          ...regeln.map((z) => `${z.name} (${z.prozent}%)`), "Zuschlagswert gesamt"];
        const z = [kopf.map(csvText).join(";")];   // Freitext gegen Formel-Injection (SI-02)
        for (const p of m.personen.filter((x) => imDienst(x, `${ym2}-28`))) {
          const w = zuschlagWert(m, p, ym2);
          z.push([csvText(p.nachname), csvText(p.vorname), csvText(p.id), n1(w.std.gesamt), n1(w.std.nacht), n1(w.std.sonntag),
            n1(w.std.feiertag), n1(w.std.samstag), ...w.zeilen.map((l) => n1(l.wert)), n1Ist(w.summe)].join(";"));
        }
        const inhalt = "\uFEFF" + z.join("\n");
        if (lade(`zuschlaege_${ym2}.csv`, inhalt, "text/csv;charset=utf-8")) melde("Export für die Lohnstelle erstellt.");
        else setAusgabe({ titel: "Zuschläge", inhalt });
      },

      /* --- Ausgaben --- */
      exportCSV: () => {
        const s = ref.current; const m = s.mandanten.find((x) => x.id === s.session.mandantId);
        const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
        const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
        const z = [["Nachname", "Vorname", m.einheitLabel, ...tage.map(fKurz)].map(csvText).join(";")];
        for (const p of aktive(m, tage[0])) {
          const e = m.einheiten.find((x) => x.id === einheitAm(p, tage[0]));
          /* Freitext gegen Formel-Injection und Trennzeichen (SI-02) */
          z.push([csvText(p.nachname), csvText(p.vorname), csvText(e ? e.name : ""), ...tage.map((d) => {
            const t = personTag(m, p, d); return csvText(t.abwesenheit ? abwArt(t.abwesenheit.art).label : t.dienstId || ""); })].join(";"));
        }
        const inhalt = "\uFEFF" + z.join("\n");
        if (lade(`dienstplan_${ym}.csv`, inhalt, "text/csv;charset=utf-8")) melde("CSV erstellt."); else setAusgabe({ titel: "CSV", inhalt });
      },
      exportICS: (pid) => {
        const s = ref.current; const m = s.mandanten.find((x) => x.id === s.session.mandantId);
        const p = m.personen.find((x) => x.id === pid);
        const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
        const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CENTRIC//DE", "CALSCALE:GREGORIAN"];
        for (let i = 1; i <= n; i++) {
          const d = `${ym}-${pad(i)}`, t = personTag(m, p, d); if (!t.dienstId) continue;
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          const endD = (toMin(da.ende) <= toMin(da.start) ? addDays(d, 1) : d).replace(/-/g, "");
          out.push("BEGIN:VEVENT", `UID:${p.id}-${d}@centric`,
            `DTSTART:${d.replace(/-/g, "")}T${da.start.replace(":", "")}00`,
            `DTEND:${endD}T${(da.ende === "24:00" ? "2359" : da.ende.replace(":", ""))}00`,
            `SUMMARY:${da.name}`, `LOCATION:${da.ort}`, "END:VEVENT");
        }
        out.push("END:VCALENDAR");
        const inhalt = out.join("\r\n");
        if (lade(`schichten_${p.nachname}_${ym}.ics`, inhalt, "text/calendar")) melde("Kalenderdatei erstellt."); else setAusgabe({ titel: "Kalender", inhalt });
      },
      exportJSON: () => { const s = ref.current; const inhalt = JSON.stringify(s, null, 2);
        if (lade(`centric_sicherung_${heute()}.json`, inhalt, "application/json")) melde("Sicherung erstellt."); else setAusgabe({ titel: "Sicherung", inhalt }); },
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
  const MOBIL = ["meine", "plan", "antraege", "lage", "hilfe", "rechtliches"];
  const mobilOk = istBetreiber ? false : MOBIL.includes(aktiveView);
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
    {hinweis && <div style={{ position: "fixed", bottom: 104, left: "50%", transform: "translateX(-50%)",
      zIndex: 90, background: C.accentDeep, color: C.aufAkzent, padding: "12px 20px", borderRadius: 999,
      fontSize: 14, boxShadow: "var(--schatten-toast)", maxWidth: "90vw", textAlign: "center" }}>
      {hinweis}</div>}
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
        <aside className={`seitenleiste${seiteOffen ? " offen" : ""}`}
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
