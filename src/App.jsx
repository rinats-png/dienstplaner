import { Component, Fragment, useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as SP from "./speicher.js";
import { exportWarnung, istUngeplant, bestaetigungsGrund, nurKorrekturGrund } from "./istdaten.js";
import { positionHolen, stempelVorgang, geoPruefungAn, MARKIERUNG_TEXT, stempelSchluessel, koordMitGrund } from "./stempelvorgang.js";
import { NICHT_UEBERNOMMEN_GRUENDE, grundKennung } from "../server/lib/selbstplanung.mjs";
import { RADIUS_VORGABE, EINSATZORT_RADIUS_VORGABE } from "../server/lib/geo.mjs";
/* Planrechnung und Fachprüfung einer Einteilung — dieselbe Fassung prüft der Server (WP-22). */
import { nachtFenster, nachtschwelle, nachtAnteil, einheitAm, imDienst, einheitDienst, landFuerEinheit } from "../server/lib/fachpruefung.mjs";
import { vergissSchutzkonflikte } from "./schutzkonflikte-hook.js";
import { verknuepfungsZiel, verknuepfungAnwenden, ohneVerknuepfung } from "./verknuepfung.js";
import { migriere, migrationstext } from "./migration.js";
import { pad, pISO, addDays, dow, between, dim_, montag, toMin, dauer, brutto, fenster, kompetenzStand, kompetenzGilt, kompetenzMaengel, KOMPETENZ_VORLAUF, REGELSTAND, AUFGABEN_PFLBG } from "./regelwerk.js";




import { csvFeld, csvText } from "./csvfeld.js";
import { v4ThemaMerken, v4ThemaGemerkt, v4SystemthemaBeobachten } from "./v4/thema.js";
import { v4AppStil } from "./v4/app-stil.js";

/* ==========================================================================
   MARKE — CENTRIC
   Das C-Zeichen kommt aus marke.jsx; hier bleibt nur der alte Name Logo()
   für die Aufrufer. Die Markenfarben sind fest, `hell` ändert nichts mehr.
   ========================================================================== */
function Logo({ size = 40, hell = false }) {
  return <Marke size={size} aria-hidden={undefined} role="img" aria-label="CENTRIC" />;
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
import { Leer, klickbar, Card, CardHead, Lab, Rubrik, Schalter, Filterleiste, Planzelle, Avatar, Btn, Inp, Sel, Field, Seg, H1, Kpi, KpiRow, Abschnitt, Pill } from "./ui/bausteine.jsx";
import { istDunkel, dunkelSetzen, lesbar, NUM } from "./ui/thema.js";
import { useDialogFokus } from "./ui/dialogfokus.js";
import { DOW, MON, heute, fLang, fKurz, fDatum } from "./lib/datum.js";
import { n1, n2, n1Ist, sgnIst, eur, zahl, uid } from "./lib/format.js";
import { Icon } from "./gestalt/icons.jsx";
import { Sparkline, Bogen, Fortschritt, Checkliste, Erklaerkasten } from "./gestalt/bausteine.jsx";
import { Kennzahlen, Leitraster, Seitenkarte, Hinweisband, Balkenzeile, Legende, Abschnittskopf, Punkt, Grosszahl, Zeitwahl } from "./gestalt/ansichten.jsx";
import { Kopfblock } from "./gestalt/rahmen.jsx";
import { Marke } from "./marke.jsx";
import { gestaltStil } from "./gestalt/stil.js";
import { Rechtliches, RechtFenster, RechtLeiste } from "./rechtstexte.jsx";
import { WARNSTUFEN, stufeRang, hoechsteStufe, ABWEICHUNG_GRUENDE } from "./warnstufen.js";
import { paketVon } from "./stufen.js";
import { paketSchalten, pilotSetzen,
  zustimmungErfassen, grundlageErfassen, grundEntziehen, paketTag, vertragsstandUebernehmen } from "./paketlogik.js";
import { hilfeVerweis,
  ANWENDUNG_URL } from "./kontakt.js";
import { nameGueltig } from "../server/lib/rollenvergabe.mjs";
import { einheitLabel as brancheEinheit } from "../server/lib/branchen.mjs";
import { BEREICHE as PPUGV_BEREICHE, bereichVon as ppugvBereich, monatslage as ppugvMonatslage } from "./ppugv.js";

import { BEREICHE as PPP_BEREICHE, ARTEN as PPP_ARTEN, BERUFSGRUPPEN as PPP_GRUPPEN,
  pruefeWoche as pppPruefen, MINDESTERFUELLUNG as PPP_MINDEST } from "./ppprl.js";
import { rechnungFaellig } from "./preisgestaltung.js";

import { tarifwerk, anwenden as tarifAnwenden } from "./tarifwerke.js";
import { fristen as loeschFristen, vorschau as loeschVorschau, raeumen as loeschlaufAusfuehren, anonymisiere as anonymPerson, berichtstext as loeschBericht, fristWert } from "./aufbewahrung.js";
/* WP-23: ob der Betrieb die Planfreigabe benutzt und welcher Tag ein Entwurf ist — dieselbe
   Entscheidung wie auf dem Server (server/lib/sicht.mjs). */

import { monatText } from "../server/lib/monatsabschluss.mjs";
/* Dienstformen, Anrechnungsfaktor und Standard-Lohnarten stehen seit WP-16 (Nachtrag dritter Review H-1/N-d) in
   server/lib/lohnrechnung.mjs: Der Monatsabschluss rechnet damit Ist-Summe und Konto zum Abschluss ein. */
import { DIENSTFORMEN, dienstform } from "../server/lib/lohnrechnung.mjs";
import { feiertag } from "../server/lib/feiertage.mjs";
/* WP-32: Zwei-Faktor für Verwalterschlüssel — eigenes Modul, hier nur eingehängt. */
import BetreiberZweifaktor from "./betreiber-2fa.jsx";
/* WP-25: Sicherungen in der Oberfläche — Regeln und Texte ohne React. */
import { darfSicherungenSehen, sicherungenAktionen } from "./sicherungen-ui.js";
/* WP-19.0: Branchenmodule — Aktivierung, Regelwerte und alle Moduloberflächen über einen Einhängepunkt (src/module/index.js). */
import { BranchenModule } from "./module/kern.jsx";
import { Notizen } from "./ansichten/notizen.jsx";
import { SelbstauskunftStatus } from "./ansichten/selbstauskunft.jsx";
import { lade } from "./lib/download.js";
import { EinheitWahl } from "./ansichten/einheitwahl.jsx";




import { Einsatzorte } from "./ansichten/einsatzorte.jsx";
import { AufgabeSymbol, GEO_HINWEIS, pauseVorgabe, PauseFeld, Stempeluhr } from "./ansichten/stempeluhr.jsx";
import { korrekturMeldung, ZeitFormular, KorrekturKarte, StempelBefunde } from "./ansichten/korrekturen.jsx";
import { Standorte } from "./ansichten/standorte.jsx";
import { PlanFreigabeSchalter } from "./ansichten/planfreigabeschalter.jsx";
import { Tarifwerk } from "./ansichten/tarifwerk.jsx";
import { Kontoblatt } from "./ansichten/kontoblatt.jsx";
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
import { StempelPuffer } from "./ansichten/stempelpuffer.jsx";
import { Tagesstart } from "./ansichten/tagesstart.jsx";
import { DienstKarte } from "./ansichten/dienstkarte.jsx";
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
import { Urlaubsrunde } from "./ansichten/urlaubsrunde.jsx";

import { Assistent } from "./ansichten/assistent.jsx";
import { Verteilung } from "./ansichten/verteilung.jsx";
import { Freigabeleiste } from "./ansichten/freigabeleiste.jsx";
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
import { Wochenliste } from "./ansichten/wochenliste.jsx";
import { TeamAuslastungLeiste } from "./ansichten/teamauslastungleiste.jsx";
import { Tagesfazit } from "./ansichten/tagesfazit.jsx";
import { Lagebild } from "./ansichten/lagebild.jsx";
import { MeineSchichten } from "./ansichten/meineschichten.jsx";
import { BetreiberRechnungen } from "./ansichten/betreiberrechnungen.jsx";
import { BetreiberDetail } from "./ansichten/betreiberdetail.jsx";

import { BetreiberMandanten } from "./ansichten/betreibermandanten.jsx";


import { Schritte, ModellVorschau } from "./ui/diagramme.jsx";
import { ZiehAnbieter, Ziehbar, Ablage, ZiehHinweis } from "./ui/ziehen.jsx";
import { Standortwahl, Standortleiste, Sprung, Zelle, Sheet } from "./ui/leisten.jsx";
import { gemeindeHinweis, BETREIBER_LEER, LAENDER, stat, BRANCHEN, ABW, abwArt, VORLAGEN, PALETTE, PALETTE_NAMEN, demobestand, DIENST_VORLAGEN, MODELLE, modellFuerBranche, modellPruefen, aktive, abwesenheitAm, personTag, besetzung, sollStunden, istStunden, ausgleichPruefen, urlaubskonto, stundenkonto, nachtJahr, pruefen, befundeFuer, darfEinheit, anBereichErlaubt, darfEntscheiden, eigeneEinheitVon, waehltEinheit, einheitName, preis, rechnungPDF, rechnungHTML, baueRechnung, offeneErfassung, hindernisBefunde, hindernisse, schutzSperre, befundeFuerEinteilung, abwesenheitTagAufheben, bestaetigungVermerken, useSchutzkonflikte, ersatzVorschlaege, freigabeStand, istFreigegeben, vorlauf, zuschlagStunden, zuschlagWert, datenauskunft, importParsen, importZuordnen, importPruefen, IMPORT_BEISPIEL, nachweisStand, kompetenzNachweis, mittelZuKompetenz, kompetenzLage, nachweisLage, auslastung, teamAuslastung, tagesaufgaben, planAbbild, wunschAm, kontoVerlauf, besetzungsVerlauf, kommandoSuche, briefingText, einrichtungsstand, antragUmsetzen, kann, begriff, fachkraftLage, AUFENTHALT, aufenthaltVon, bereitschaftHinweise, genehmigungsStand, darfStufe, UEBERGABE_FELDER, uebergabenVon, uebergabeAm, offeneUebergaben, datevSaetze, EXPORT_STAND, lohnexportStand, lohnausgabeDateiname, VORMONAT_KATEGORIEN, lohnexportRueckfrage, mehrarbeitNr, datevCSV, freezeZeilen, lohnWarnung, lohnausgabeText, belastbarkeit, vollExport, tabelleCSV, ALLE_STANDORTE, einheitenAmStandort } from "./lib/fachlogik.js";
import { Mandantenrechner } from "./ansichten/mandantenrechner.jsx";
import { BetreiberTarife } from "./ansichten/betreiber-tarife.jsx";
import { Pakete } from "./ansichten/pakete.jsx";
import { Hilfe } from "./ansichten/hilfe.jsx";
import { OfflineSchalter } from "./ansichten/offline-schalter.jsx";
import { Adressaenderungen } from "./ansichten/adressaenderungen.jsx";
import { JugendschutzSchalter } from "./ansichten/jugendschutz-schalter.jsx";
import { GeoSchalter } from "./ansichten/geo-schalter.jsx";
import { darf } from "./lib/berechtigung.js";
import { ROLLEN, rolle, anzahlWort, mehrzahl, ROLLENBEZEICHNUNG, ROLLEN_VORGABE, rollenName, RECHTE_GRUPPEN, ALLE_RECHTE, MATRIX_STD } from "./lib/rollen.js";
import { ZUSTELLARTEN, baueMitteilung, urlaubshinweiseFaellig, zustellungAusstehend, zustellwege } from "./lib/zustellung.js";
import { OFFEN_STATUS, ausschreibungLage, bewerbbarOhneHinweis, darfSichBewerben, meineOffenenSchichten } from "./lib/offene-schichten.js";
import { CHECK_VORLAGEN, CHECK_ZEITPUNKTE, checkSchluessel, checkStand, neuerCheckpunkt } from "./lib/checklisten.js";
import { baueAusAnlage, leererMandant, mandantAnlegen, zugangsPerson } from "./lib/mandant-anlage.js";
import { WECK_STD, kommendeWeckzeiten, verfuegbarkeitsBild } from "./lib/verfuegbarkeit.js";
import { SELBSTPLAN_STATUS, darfSelbstEintragen, laufendeRunde, selbstplanFortschritt, selbstplanLage, selbstplanStand } from "./lib/selbstplanung.js";
import { NOTRUF_ARTEN, notrufEmpfaenger, offeneNotrufe } from "./lib/notrufe.js";
import { auftraggeberBericht } from "./lib/auftraggeber.js";
import { ERMUEDUNG_STUFEN, ermuedungsBild, sondereinsaetze } from "./lib/belastung.js";
import { _handbuch, handbuchAbschnitte, handbuchDruck, handbuchKapitel, handbuchLaden } from "./lib/handbuch.js";
import { _tour, tourKapitel, tourLaden, tourStand, tourStartet } from "./lib/tour.js";
import { selbsttestLaden } from "./lib/selbsttest.js";
import { zelleBedienbar } from "./ui/raster.js";
import { anfrageText, folgenPruefen, monatsLage, ppugvZeilen, wochenKapazitaet } from "./lib/planhilfen.js";
import { BEREICHE, NAV_BETREIBER, NAV_KUNDE, ansichtErlaubt, urlaubshinweiseAnlegen } from "./app/navigation.js";


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

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";

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

/* --------------------------------- Datum --------------------------------- */
/* Diese Grundlagen stehen jetzt in src/regelwerk.js — dort, wo auch die
   Regeln liegen, die auf ihnen aufbauen, und wo sie geprüft werden. */

/**
 * Der Farbwähler — überall dieselbe Fläche mit denselben dreißig Kacheln,
 * egal ob für eine Dienstart, eine Einheit oder eine Qualifikation. Eine
 * einzige Stelle, die weiß, wie viele Farben es gibt und wie sie heißen.
 */
function Farbwahl({ wert, onChange }) {
  return (
    <div role="group" aria-label="Farbe wählen"
      style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 4, maxWidth: 320 }}>
      {PALETTE.map((c, i) => (
        <button key={c} type="button" onClick={() => onChange(c)}
          aria-pressed={wert === c} title={PALETTE_NAMEN[i] || c}
          style={{ width: 25, height: 25, borderRadius: 8, background: c, cursor: "pointer",
            border: wert === c ? "3px solid #fff" : "1px solid rgba(0,0,0,.12)",
            boxShadow: wert === c ? `0 0 0 2px ${c}` : "none" }} />))}
    </div>);
}

/**
 * Derselbe Farbwähler, hinter einem Punkt versteckt — für Listen, in denen
 * ein dauerhaft offenes Raster aus dreißig Kacheln pro Zeile die eigentliche
 * Liste erschlagen würde. Ein Klick auf den Punkt öffnet die Auswahl, ein
 * Klick daneben schließt sie wieder.
 */
function Farbpunkt({ wert, onChange, titel = "Farbe ändern" }) {
  const [offen, setOffen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!offen) return;
    const schliessen = (e) => { if (box.current && !box.current.contains(e.target)) setOffen(false); };
    document.addEventListener("mousedown", schliessen);
    return () => document.removeEventListener("mousedown", schliessen);
  }, [offen]);

  return (
    <div ref={box} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => setOffen((o) => !o)} title={titel}
        aria-label={titel} aria-expanded={offen}
        style={{ width: 18, height: 18, borderRadius: 9, background: wert, cursor: "pointer",
          border: `1px solid ${C.lineStark}`, padding: 0 }} />
      {offen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20,
          background: C.flaeche, border: `1px solid ${C.line}`, borderRadius: 10,
          padding: 10, boxShadow: "0 10px 28px -10px rgba(7,19,23,.28)" }}>
          <Farbwahl wert={wert} onChange={(c) => { onChange(c); setOffen(false); }} />
        </div>)}
    </div>);
}

/* ==========================================================================
   ANMELDUNG — bestimmt die Zugriffstiefe
   ========================================================================== */
function Anmeldung({ db, onLogin }) {
  /* Die gewählte Kennung wird einmal beim ersten Rendern festgelegt. Ändert
     sich der Bestand danach — weil der Server einen gefilterten Ausschnitt
     nachliefert oder ein frisch angelegter Raum noch keine Betriebe hat —,
     zeigte mid auf einen Betrieb, den es nicht mehr gibt. `find` gab dann
     undefined zurück und die nächste Zeile brach mit „Cannot read
     properties of undefined (reading 'personen')" ab.

     Statt darauf zu vertrauen, dass die Kennung passt, wird sie gegen den
     aktuellen Bestand geprüft und notfalls auf den ersten Betrieb
     zurückgeführt. */
  const betriebe = Array.isArray(db.mandanten) ? db.mandanten : [];
  const [mid, setMid] = useState(betriebe.length ? betriebe[0].id : null);
  const m = betriebe.find((x) => x.id === mid) || betriebe[0] || null;
  /* Impressum und Datenschutzerklärung müssen ohne Anmeldung erreichbar
     sein — „ständig verfügbar" nach § 5 DDG heißt: auch für jemanden, der
     noch gar keinen Zugang hat. */
  const [recht, setRecht] = useState(null);
  const proRolle = m && Array.isArray(m.personen)
    ? ROLLEN.filter((r) => r.id !== "betreiber").map((r) => ({
      r, person: m.personen.find((p) => p.rolle === r.id && p.status === "aktiv") }))
    : [];

  /* Ohne Betrieb gibt es keine Rollenauswahl. Das trifft einen Zugang, der
     auf einen leeren Raum zeigt — vorher endete das im Fehlerbildschirm. */
  if (!m) {
    return (
      <div className="sw-root">
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", padding: "5vh 20px" }}>
          <Card style={{ padding: 30, maxWidth: 460, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
              <Logo size={64} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 650, marginBottom: 10 }}>
              Dieser Zugang hat noch keinen Betrieb</div>
            <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: "0 0 20px" }}>
              Der Datenraum ist angelegt, aber noch leer. Die Organisationsleitung
              richtet den Betrieb ein — danach funktioniert dieser Zugang.</p>
            <Btn onClick={abmeldenMitHinweis}>Abmelden</Btn>
          </Card>
        </div>
        <RechtLeiste onOeffnen={setRecht} style={{ paddingBottom: 26 }} />
        {recht && <RechtFenster start={recht} onClose={() => setRecht(null)} />}
      </div>);
  }

  return (
    <div className="sw-root">
      <div style={{display:"none"}}><i /><i /><i /><i /></div>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "5vh 20px" }}>
        <div style={{ width: "100%", maxWidth: 860 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
              <Logo size={86} />
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-.03em", margin: 0 }}>CENTRIC</h1>
            <p style={{ fontSize: 16, color: C.dim, margin: "12px 0 0" }}>
              Dienstplanung für den durchgehenden Schichtbetrieb
            </p>
          </div>

          {/* --------------------------------------------------------------
              Dieser Bildschirm ist nicht die Anmeldung.

              Er sieht ihr aber zum Verwechseln ähnlich: Wer sich mit einem
              echten Zugangscode angemeldet hat, landet hier — und steht vor
              etwas, das erneut „anmelden" sagt. Beim Durchspielen war
              zweimal unklar, ob die erste Anmeldung fehlgeschlagen war.

              Der Unterschied stand bisher als graue Fußnote unter den
              Karten. Er gehört darüber, weil er die Frage beantwortet, die
              man beim Ansehen hat, nicht die, die man danach noch hat. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px",
            marginBottom: 22, background: C.warnLight, borderLeft: `3px solid ${C.warn}`,
            borderRadius: "0 8px 8px 0" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 640, marginBottom: 4 }}>
                Vorführfassung — du bist bereits angemeldet.</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
                Hier wird nur die Sicht gewechselt: Jede Rolle zeigt dieselben
                Daten in der Tiefe, die ihr zusteht. Im Echtbetrieb entfällt
                dieser Schritt — dort bestimmt der Zugangscode die Rolle.
              </div>
            </div>
          </div>

          <Card hover style={{ padding: 26, marginBottom: 18, cursor: "pointer" }}
            {...klickbar(() => onLogin({ rolle: "betreiber" }), "Zur Betreiberkonsole")}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: C.accent, color: C.aufAkzent,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>BE</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Zur Betreiberkonsole</div>
                <div style={{ fontSize: 13.5, color: C.dim, marginTop: 3 }}>
                  Mandanten, Tarife, Zugangszahlen und Rechnungen. Ohne Einsicht in Namen oder Pläne.
                </div>
              </div>
              <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={22} /></span>
            </div>
          </Card>

          <Card style={{ padding: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Sicht einer Rolle im Betrieb</div>
              <Sel value={mid} onChange={(e) => setMid(e.target.value)} style={{ width: 280 }}>
                {db.mandanten.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Sel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
              {proRolle.map(({ r, person }) => person && (
                <div key={r.id} className="karte"
                  {...klickbar(() => onLogin({ rolle: "kunde", mandantId: m.id, personId: person.id }),
                    `Als ${r.label} anmelden: ${person.vorname} ${person.nachname}`)}
                  style={{ padding: 16, cursor: "pointer", transition: "transform .2s, box-shadow .2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 26px rgba(16,16,24,.12)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: `${r.farbe}1E`, color: lesbar(r.farbe),
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{r.kurz}</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                  </div>
                  <div style={{ fontSize: 13, color: C.text }}>{person.vorname} {person.nachname}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4, lineHeight: 1.4 }}>{r.text}</div>
                </div>))}
            </div>
          </Card>

          {/* Der frühere Hinweis stand hier unten und ist nach oben gewandert,
              wo er gebraucht wird. Was bleibt, ist die eine Zusicherung, die
              man erst danach braucht. */}
          <div style={{ textAlign: "center", fontSize: 12.5, color: C.dimmer, marginTop: 22, lineHeight: 1.5 }}>
            Die Zugriffstiefe ergibt sich in der Vorführung wie im Echtbetrieb
            aus Rolle und Geltungsbereich — nichts daran ist nachgestellt.
          </div>

          <RechtLeiste onOeffnen={setRecht} style={{ marginTop: 18 }} />
        </div>
      </div>
      {recht && <RechtFenster start={recht} onClose={() => setRecht(null)} />}
    </div>);
}

function Assistent2({ sitz, akt, onClose }) {
  /* Der Einrichtungsassistent zeigt Nachtanteile, bevor der Betrieb steht.
     Er nimmt das Fenster des laufenden Betriebs — sonst zeigte er 23 Uhr,
     während die Prüfung danach mit 21 rechnet. */
  const einst = (sitz.mandant || {}).einstellungen;
  const m = sitz.mandant;
  const [schritt, setSchritt] = useState(0);
  const [branche, setBranche] = useState(m.branche || "sonstiges");
  const [eigeneBranche, setEigeneBranche] = useState("");
  const [einheitLabel, setEinheitLabel] = useState(m.einheitLabel || "Schichtgruppe");
  const [modellId, setModellId] = useState(null);
  const [dienste, setDienste] = useState([]);
  const [tage, setTage] = useState([]);
  const [gruppen, setGruppen] = useState([]);
  const [pinsel, setPinsel] = useState(null);
  const [importText, setImportText] = useState("");
  const [importZeilen, setImportZeilen] = useState(null);
  const [ankerDatum, setAnkerDatum] = useState(montag(heute()));

  const modell = MODELLE.find((x) => x.id === modellId);
  const vorschlaege = modellFuerBranche(branche);
  const andere = MODELLE.filter((x) => !x.branchen.includes(branche));

  /* Modell übernehmen: Dienstarten und Zyklus vorbelegen */
  const modellWaehlen = (mo) => {
    setModellId(mo.id);
    const ds = mo.dienste.map((k, i) => ({ ...DIENST_VORLAGEN[k], vorlageKey: k,
      id: DIENST_VORLAGEN[k].kurz + (i > 0 && mo.dienste.slice(0, i).some((x) => DIENST_VORLAGEN[x].kurz === DIENST_VORLAGEN[k].kurz) ? i : ""),
      pause: 0, ort: "", posten: false, quelle: null, faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false,
      mindest: { mo_do: 1, fr: 1, sa: mo.vollkonti ? 1 : 0, so: mo.vollkonti ? 1 : 0 }, mindestQual: {} }));
    setDienste(ds);
    const abbild = Object.fromEntries(mo.dienste.map((k, i) => [k, ds[i].id]));
    setTage(mo.tage.map((t) => (t && t !== "-" ? abbild[t] : "-")));
    setGruppen(Array.from({ length: mo.gruppen }, (_, i) => ({
      id: uid("e"), name: `${einheitLabel} ${i + 1}`, versatzTage: i * mo.versatzTage,
      farbe: PALETTE[i % PALETTE.length], pool: false })));
    setPinsel(ds[0] ? ds[0].id : null);
  };

  const freiStarten = () => {
    setModellId("frei");
    const ds = [
      { ...DIENST_VORLAGEN.F, id: "F", vorlageKey: "F", pause: 0, ort: "", posten: false, quelle: null, faktor: 1,
        ruhezeitNeutral: false, rufbereitschaft: false, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
      { ...DIENST_VORLAGEN.S, id: "S", vorlageKey: "S", pause: 0, ort: "", posten: false, quelle: null, faktor: 1,
        ruhezeitNeutral: false, rufbereitschaft: false, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
    ];
    setDienste(ds);
    setTage(Array(14).fill("-"));
    setGruppen([{ id: uid("e"), name: `${einheitLabel} 1`, versatzTage: 0, farbe: PALETTE[0], pool: false },
                { id: uid("e"), name: `${einheitLabel} 2`, versatzTage: 7, farbe: PALETTE[1], pool: false }]);
    setPinsel("F");
  };

  /* Live-Auswertung des zusammengestellten Modells */
  const auswertung = useMemo(() => {
    if (!tage.length || !dienste.length) return null;
    const map = Object.fromEntries(dienste.map((d) => [d.id, d]));
    const len = tage.length;
    const dau = (k) => { const v = map[k]; if (!v) return 0;
      let x = toMin(v.ende) - toMin(v.start); if (x <= 0) x += 1440; return x / 60 - (v.pause || 0) / 60; };
    const nach = (k) => { const v = map[k]; if (!v) return 0;
      const s = toMin(v.start); let e = toMin(v.ende); if (e <= s) e += 1440;
      let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
      return sum / 60; };
    let std = 0, anzahl = 0;
    for (const t of tage) if (t !== "-") { std += dau(t); anzahl++; }
    const proTag = [];
    for (let i = 0; i < len; i++) {
      const z = {};
      for (const g of gruppen) { if (g.pool) continue;
        const idx = (((i - g.versatzTage) % len) + len) % len;
        const t = tage[idx]; if (t !== "-") z[t] = (z[t] || 0) + 1; }
      proTag.push(z);
    }
    const vollkonti = !modell || modell.vollkonti;
    const luecken = {};
    for (const d of dienste) {
      luecken[d.id] = proTag.filter((z, i) => (vollkonti || i % 7 < 5) && !z[d.id]).length;
    }
    let maxSerie = 0, serie = 0, maxNacht = 0, ns = 0, ruhe = 0, einzel = 0;
    for (let i = 0; i < len; i++) {
      const c = tage[i], nx = tage[(i + 1) % len], pv = tage[(i - 1 + len) % len];
      if (c !== "-") {
        serie++; maxSerie = Math.max(maxSerie, serie);
        if (nach(c) >= 2) { ns++; maxNacht = Math.max(maxNacht, ns); } else ns = 0;
        if (pv === "-" && nx === "-") einzel++;
        if (nx !== "-" && map[c] && map[nx]) {
          let e = toMin(map[c].ende); if (e <= toMin(map[c].start)) e += 1440;
          if ((1440 + toMin(map[nx].start) - e) / 60 < 11) ruhe++;
        }
      } else { serie = 0; ns = 0; }
    }
    return { len, anzahl, wochenstunden: Math.round(std / (len / 7) * 100) / 100,
      luecken: Object.entries(luecken).filter(([, n]) => n > 0),
      maxSerie, maxNacht, ruhe, einzel, vollkonti,
      mind: Object.fromEntries(dienste.map((d) => [d.id,
        Math.min(...proTag.map((z, i) => (vollkonti || i % 7 < 5) ? (z[d.id] || 0) : 99))])) };
  }, [tage, dienste, gruppen, modell]);

  const setzeTag = (i, v) => setTage(tage.map((t, k) => (k === i ? v : t)));
  const zyklusLaengeAendern = (n) => setTage(Array.from({ length: n }, (_, i) => tage[i] || "-"));

  /* Startpunkt einer Gruppe: an welchem Tag beginnt sie mit welchem Dienst? */
  const startOptionen = useMemo(() => {
    const out = [];
    tage.forEach((t, i) => { if (t !== "-") out.push({ index: i, dienstId: t }); });
    return out;
  }, [tage]);
  const setzeStart = (gid, index) => setGruppen(gruppen.map((g) => g.id === gid ? { ...g, versatzTage: index } : g));

  const zeilenAusText = (txt) => {
    const zeilen = txt.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    if (!zeilen.length) return [];
    const tr = [";", "\t", ","].map((t) => ({ t, n: (zeilen[0].match(new RegExp(`\\${t}`, "g")) || []).length }))
      .sort((a, b) => b.n - a.n)[0].t;
    return zeilen.map((z) => z.split(tr).map((x) => x.trim()));
  };

  const uebernehmen = () => {
    akt.assistentUebernehmen({
      branche: eigeneBranche ? "sonstiges" : branche,
      brancheName: eigeneBranche || (BRANCHEN.find((b) => b[0] === branche) || [])[1],
      einheitLabel, dienstarten: dienste, tage, gruppen, anker: ankerDatum,
      personen: importZeilen || [],
    });
    onClose();
  };

  const SCHRITTE = ["Bereich", "Schichtmodell", "Dienstarten", "Gruppen", "Personal"];
  const weiter = () => setSchritt(Math.min(4, schritt + 1));
  const zurueck = () => setSchritt(Math.max(0, schritt - 1));

  return (
    <Sheet open onClose={onClose} titel="Schichtplanung einrichten" width={940}>
      <Schritte aktuell={schritt} schritte={SCHRITTE} />

      {/* ---------- 1 Bereich ---------- */}
      {schritt === 0 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 20 }}>
            Der Bereich bestimmt, welche Schichtmodelle vorgeschlagen werden und wie die
            Organisationseinheiten heißen. Beides lässt sich danach frei ändern.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 20 }}>
            {BRANCHEN.map(([id, name, label]) => {
              const an = branche === id && !eigeneBranche;
              return (
                <div key={id}
                  {...klickbar(() => { setBranche(id); setEigeneBranche(""); setEinheitLabel(label); })}
                  aria-pressed={an}
                  className="karte" style={{ padding: 15, cursor: "pointer",
                    outline: an ? `2px solid ${C.accent}` : "none" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 12, color: C.dimmer, marginTop: 4 }}>
                    Einheiten heißen „{label}" · {modellFuerBranche(id).length} Modelle</div>
                </div>);
            })}
          </div>
          <Card style={{ padding: 18 }}>
            <Lab style={{ marginBottom: 10 }}>Bereich nicht dabei?</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
              <Field label="Eigene Bezeichnung des Bereichs">
                <Inp value={eigeneBranche} onChange={(e) => setEigeneBranche(e.target.value)}
                  placeholder="z. B. Wasserwerk" /></Field>
              <Field label="Wie heißen die Einheiten?" hint="Erscheint überall in der Anwendung.">
                <Inp value={einheitLabel} onChange={(e) => setEinheitLabel(e.target.value)} /></Field>
            </div>
            {eigeneBranche && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 12 }}>
              Es werden alle Modelle zur Auswahl gestellt. Ein eigenes lässt sich im nächsten Schritt anlegen.
            </div>}
          </Card>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
            <Btn kind="primary" onClick={weiter}>Weiter zu den Modellen</Btn></div>
        </div>)}

      {/* ---------- 2 Modell ---------- */}
      {schritt === 1 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Die Kennzahlen sind gerechnet, nicht geschätzt: Wochenarbeitszeit, längste Dienstserie,
            Nachtserien und Deckung. Jedes Modell lässt sich anschließend anpassen.
          </div>
          {(eigeneBranche ? MODELLE : [...vorschlaege, ...andere]).map((mo, i) => {
            const r = modellPruefen(mo);
            const an = modellId === mo.id;
            const passend = eigeneBranche || mo.branchen.includes(branche);
            return (
              <div key={mo.id}>
                {!eigeneBranche && i === vorschlaege.length && vorschlaege.length > 0 && (
                  <Lab style={{ margin: "20px 0 12px" }}>Weitere Modelle</Lab>)}
                <div {...klickbar(() => modellWaehlen(mo), `Modell wählen: ${mo.name}`)} className="karte"
                  aria-pressed={an}
                  style={{ padding: 18, marginBottom: 12, cursor: "pointer",
                    outline: an ? `2px solid ${C.accent}` : "none", opacity: passend ? 1 : .82 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 230 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15.5, fontWeight: 650 }}>{mo.name}</span>
                        {mo.empfohlen && <Pill size="sm" tone="ok">empfohlen</Pill>}
                        {!mo.vollkonti && <Pill size="sm">ohne Wochenende</Pill>}
                      </div>
                      <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>{mo.kurz}</div>
                      <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 7, lineHeight: 1.5 }}>{mo.beschreibung}</div>
                      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7 }}><b>Passt wenn:</b> {mo.passt}</div>
                      {mo.hinweis && <div style={{ fontSize: 12.5, color: C.warn, marginTop: 7, lineHeight: 1.45 }}>
                        {mo.hinweis}</div>}
                    </div>
                    <div style={{ display: "grid", gap: 6, minWidth: 168 }}>
                      {[["Wochenarbeitszeit", `${n2(r.wochenstunden)} h`, Math.abs(r.wochenstunden - (m.einstellungen.sollWochenstunden || 40)) < 2 ? "ok" : "warn"],
                        ["Gruppen benötigt", `${mo.gruppen}`, "neutral"],
                        ["Dienste am Stück", `${r.maxSerie}`, r.maxSerie <= 5 ? "ok" : r.maxSerie <= 7 ? "warn" : "danger"],
                        ["Nächte am Stück", `${r.maxNacht}`, r.maxNacht <= 4 ? "ok" : "danger"],
                        ["Deckung", r.luecken === 0 ? "lückenlos" : `${r.luecken} Lücken`, r.luecken === 0 ? "ok" : "danger"],
                        ["Besetzung je Dienst", Object.values(r.mind).join(" / "), "neutral"]].map(([l, v, tone]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
                          <span style={{ color: C.dimmer }}>{l}</span>
                          <span style={{ fontWeight: 600, ...NUM,
                            color: tone === "ok" ? C.ok : tone === "warn" ? C.warn : tone === "danger" ? C.danger : C.text }}>{v}</span>
                        </div>))}
                    </div>
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
                    <Lab style={{ marginBottom: 7 }}>So sieht es für eine Gruppe aus · {mo.tage.length} Tage</Lab>
                    <ModellVorschau modell={mo} tage={Math.min(42, mo.tage.length * 2)} />
                  </div>
                </div>
              </div>);
          })}
          <div {...klickbar(freiStarten)} className="karte" aria-pressed={modellId === "frei"}
            style={{ padding: 18, cursor: "pointer", outline: modellId === "frei" ? `2px solid ${C.accent}` : "none" }}>
            <div style={{ fontSize: 15.5, fontWeight: 650 }}>Eigenes Modell aufbauen</div>
            <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>
              Leerer Zyklus, den du im nächsten Schritt Tag für Tag selbst zusammenstellst.
              Die Kennzahlen werden dabei laufend mitgerechnet.
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <Btn kind="primary" disabled={!modellId} onClick={weiter}>Weiter zu den Dienstarten</Btn></div>
        </div>)}

      {/* ---------- 3 Dienstarten und Zyklus ---------- */}
      {schritt === 2 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Zeiten, Namen und Mindestbesetzung anpassen. Der Zyklus darunter lässt sich Tag für Tag
            ändern — die Kennzahlen rechnen sofort mit.
          </div>
          <Card style={{ marginBottom: 18, overflowX: "auto" }}>
            <CardHead right={<Btn size="sm" onClick={() => setDienste([...dienste, {
              ...DIENST_VORLAGEN.Z, id: `D${dienste.length + 1}`, pause: 0, ort: "", posten: false, quelle: null,
              faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false,
              mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} }])}>Dienstart hinzufügen</Btn>}>
              Dienstarten</CardHead>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
              <thead><tr>{["", "Bezeichnung", "Kürzel", "Beginn", "Ende", "Dauer", "Nacht", "Mind. Mo–Do", "Sa/So", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}` }}><Lab>{h}</Lab></th>))}
              </tr></thead>
              <tbody>{dienste.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}><Zelle da={d} size={24} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp value={d.name} style={{ width: 140 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp value={d.kurz} maxLength={3} style={{ width: 66 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, kurz: e.target.value.toUpperCase() } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="time" value={d.start} style={{ width: 108 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, start: e.target.value } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="time" value={d.ende} style={{ width: 108 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i ? { ...x, ende: e.target.value } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.dim, ...NUM }}>
                    {n1(dauer(d))} h</td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, ...NUM,
                    color: nachtAnteil(d, einst) > 0 ? C.violet : C.dimmer }}>{n1(nachtAnteil(d, einst))} h</td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="number" min={0} value={d.mindest.mo_do} style={{ width: 62 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i
                        ? { ...x, mindest: { ...x.mindest, mo_do: Number(e.target.value), fr: Number(e.target.value) } } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <Inp type="number" min={0} value={d.mindest.sa} style={{ width: 62 }}
                      onChange={(e) => setDienste(dienste.map((x, k) => k === i
                        ? { ...x, mindest: { ...x.mindest, sa: Number(e.target.value), so: Number(e.target.value) } } : x))} /></td>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    {dienste.length > 1 && <Btn size="sm" kind="danger"
                      onClick={() => { setDienste(dienste.filter((_, k) => k !== i));
                        setTage(tage.map((t) => t === d.id ? "-" : t)); }} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>}</td>
                </tr>))}</tbody>
            </table>
          </Card>

          <Card>
            <CardHead right={
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Lab>Zykluslänge</Lab>
                {[7, 8, 11, 14, 16, 21, 28, 35].map((n) => (
                  <Btn key={n} size="sm" kind={tage.length === n ? "primary" : "plain"}
                    onClick={() => zyklusLaengeAendern(n)}>{n}</Btn>))}
              </div>}>Zyklus</CardHead>
            <div style={{ padding: "16px 22px 6px", fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
              Dienstart antippen und dann Tage anklicken — oder die Dienstart direkt auf einen Tag ziehen.
            </div>
            <div className="reiterreihe" style={{ padding: "0 22px", marginBottom: 0 }}>
              {dienste.map((d) => (
                <Ziehbar key={d.id} onClick={() => setPinsel(d.id)}
                  nutzlast={{ art: "dienstart", dienstId: d.id, beschriftung: d.name, farbe: d.farbe, zeit: `${d.start}–${d.ende}` }}>
                  <span className="btn btn-sm"
                    style={{ background: pinsel === d.id ? `${d.farbe}22` : C.bg,
                      color: pinsel === d.id ? d.farbe : C.dim, fontWeight: 600 }}>{d.kurz}</span>
                </Ziehbar>))}
              <Ziehbar onClick={() => setPinsel("-")}
                nutzlast={{ art: "dienstart", dienstId: "-", beschriftung: "frei", farbe: C.dim }}>
                <span className="btn btn-sm"
                  style={{ background: pinsel === "-" ? C.line : C.bg, color: C.dim, fontWeight: 600 }}>frei</span>
              </Ziehbar>
            </div>
            <div style={{ padding: 22, display: "flex", gap: 5, flexWrap: "wrap" }}>
              {tage.map((t, i) => {
                const d = dienste.find((x) => x.id === t);
                return (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, color: C.dimmer, marginBottom: 3 }}>{DOW[i % 7]}</div>
                    <Ablage id={`zt:${i}`} nimmt={(l) => l.art === "dienstart"}
                      ablegen={(l) => setzeTag(i, l.dienstId)} style={{ borderRadius: 12 }}>
                      <div {...klickbar(() => setzeTag(i, pinsel),
                        `Tag ${i + 1}: ${d ? d.name : "frei"} — mit dem gewählten Dienst belegen`)}
                        style={{ width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700, ...NUM,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: d ? `${d.farbe}22` : C.bg, color: d ? d.farbe : C.dimmer }}>
                        {d ? d.kurz : "·"}</div>
                    </Ablage>
                    <div style={{ fontSize: 8.5, color: C.dimmer, marginTop: 2, ...NUM }}>{i + 1}</div>
                  </div>);
              })}
            </div>
          </Card>

          {auswertung && (
            <Card style={{ marginTop: 18, display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", overflow: "hidden" }}>
              <Kpi label="Wochenarbeitszeit" value={n2(auswertung.wochenstunden)} unit="h"
                tone={Math.abs(auswertung.wochenstunden - (m.einstellungen.sollWochenstunden || 40)) < 1.5 ? "ok" : "warn"}
                sub={`Soll ${n2(m.einstellungen.sollWochenstunden || 40)} h`} />
              <Kpi label="Dienste am Stück" value={auswertung.maxSerie}
                tone={auswertung.maxSerie <= 5 ? "ok" : auswertung.maxSerie <= 7 ? "warn" : "danger"} />
              <Kpi label="Nächte am Stück" value={auswertung.maxNacht}
                tone={auswertung.maxNacht <= 4 ? "ok" : "danger"} />
              <Kpi label="Ruhezeitkonflikte" value={auswertung.ruhe}
                tone={auswertung.ruhe ? "danger" : "ok"} sub="im Muster selbst" />
              <Kpi label="Deckungslücken" value={auswertung.luecken.reduce((a, [, n]) => a + n, 0)}
                tone={auswertung.luecken.length ? "danger" : "ok"}
                sub={auswertung.vollkonti ? "rund um die Uhr" : "nur werktags gefordert"} />
            </Card>)}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <Btn kind="primary" disabled={!auswertung || !auswertung.anzahl} onClick={weiter}>Weiter zu den Gruppen</Btn></div>
        </div>)}

      {/* ---------- 4 Gruppen und Startpunkt ---------- */}
      {schritt === 3 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Für jede Gruppe wird festgelegt, an welcher Stelle des Zyklus sie beginnt. Alles Weitere
            schreibt sich von selbst fort — für jeden künftigen Tag, ohne Ausrollen.
          </div>
          <Field label="Erster Tag des Zyklus" hint="Ab diesem Datum gilt Zyklustag 1. Üblicherweise ein Montag.">
            <Inp type="date" value={ankerDatum} onChange={(e) => setAnkerDatum(e.target.value)} style={{ width: 200 }} /></Field>

          <div style={{ marginTop: 20 }}>
            {gruppen.map((g, gi) => {
              const start = startOptionen.find((o) => o.index === g.versatzTage);
              const d = start && dienste.find((x) => x.id === start.dienstId);
              return (
                <Card key={g.id} style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 13, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: lesbar(g.farbe, 3), marginBottom: 12 }} />
                    <Field label="Bezeichnung">
                      <Inp value={g.name} style={{ width: 190 }}
                        onChange={(e) => setGruppen(gruppen.map((x, k) => k === gi ? { ...x, name: e.target.value } : x))} /></Field>
                    <Field label="Beginnt am Zyklustag" hint={d ? `startet mit ${d.name}` : "startet mit einem freien Tag"}>
                      <Sel value={g.versatzTage} style={{ width: 240 }}
                        onChange={(e) => setzeStart(g.id, Number(e.target.value))}>
                        {tage.map((t, i) => {
                          const dd = dienste.find((x) => x.id === t);
                          return <option key={i} value={i}>Tag {i + 1} ({DOW[i % 7]}) — {dd ? dd.name : "frei"}</option>; })}
                      </Sel></Field>
                    <div style={{ flex: 1, minWidth: 180, marginBottom: 4 }}>
                      <Lab style={{ marginBottom: 5 }}>Erste 21 Tage</Lab>
                      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                        {Array.from({ length: 21 }, (_, i) => {
                          const idx = (((i - g.versatzTage) % tage.length) + tage.length) % tage.length;
                          const dd = dienste.find((x) => x.id === tage[idx]);
                          return <Zelle key={i} da={dd} size={15} blass />; })}
                      </div>
                    </div>
                    {gruppen.length > 1 && <Btn size="sm" kind="danger" style={{ marginBottom: 8 }}
                      onClick={() => setGruppen(gruppen.filter((_, k) => k !== gi))} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>}
                  </div>
                </Card>);
            })}
          </div>
          <Btn onClick={() => setGruppen([...gruppen, { id: uid("e"), name: `${einheitLabel} ${gruppen.length + 1}`,
            versatzTage: 0, farbe: PALETTE[gruppen.length % PALETTE.length], pool: false }])}>Gruppe hinzufügen</Btn>

          {auswertung && auswertung.luecken.length > 0 && (
            <Card style={{ marginTop: 18, padding: 16, background: C.dangerLight }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.danger, marginBottom: 6 }}>Deckungslücken</div>
              {auswertung.luecken.map(([id, n]) => {
                const d = dienste.find((x) => x.id === id);
                return <div key={id} style={{ fontSize: 13, color: C.danger, marginBottom: 4 }}>
                  {d ? d.name : id} ist an {n} von {auswertung.len} Zyklustagen von keiner Gruppe besetzt.</div>; })}
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>
                Meist hilft ein anderer Startpunkt oder eine weitere Gruppe. Bei gleichmäßigem Versatz
                muss jede Wochentagsspalte des Zyklus jede Dienstart genau einmal enthalten.
              </div>
            </Card>)}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <Btn kind="primary" onClick={weiter}>Weiter zum Personal</Btn></div>
        </div>)}

      {/* ---------- 5 Personal ---------- */}
      {schritt === 4 && (
        <div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, marginBottom: 18 }}>
            Personal kann jetzt oder später erfasst werden. Für den Anfang genügt eine Liste aus
            Tabellenkalkulation oder Personalsystem — Format wird automatisch erkannt.
          </div>
          <Card style={{ marginBottom: 18 }}>
            <CardHead>Liste einfügen</CardHead>
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 10, lineHeight: 1.5 }}>
                Eine Person je Zeile. Spalten: Nachname, Vorname, Gruppe, Wochenstunden.
                Trennzeichen Semikolon, Tabulator oder Komma. Kopfzeile wird erkannt.
              </div>
              <textarea className="inp" rows={7} value={importText}
                onChange={(e) => { setImportText(e.target.value); setImportZeilen(null); }}
                placeholder={"Nachname;Vorname;Gruppe;Wochenstunden\nMüller;Anna;Schichtgruppe 1;40\nSchmidt;Tom;Schichtgruppe 2;20"} />
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <Btn onClick={() => {
                  const roh = zeilenAusText(importText);
                  if (!roh.length) return;
                  const kopf = /nachname|name|vorname/i.test(roh[0].join(" "));
                  const daten = kopf ? roh.slice(1) : roh;
                  setImportZeilen(daten.map((z) => ({
                    nachname: z[0] || "", vorname: z[1] || "",
                    gruppe: z[2] || (gruppen[0] || {}).name || "",
                    wochenstunden: Number(String(z[3] || "").replace(",", ".")) || m.einstellungen.sollWochenstunden || 40,
                  })).filter((x) => x.nachname));
                }}>Liste prüfen</Btn>
                {importZeilen && <Btn kind="quiet" onClick={() => { setImportZeilen(null); setImportText(""); }}>Verwerfen</Btn>}
              </div>
            </div>
          </Card>

          {importZeilen && (
            <Card style={{ marginBottom: 18 }}>
              <CardHead right={<Pill tone="ok">{importZeilen.length} Personen erkannt</Pill>}>Vorschau</CardHead>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {importZeilen.slice(0, 30).map((z, i) => {
                  const treffer = gruppen.find((g) => g.name.toLowerCase() === String(z.gruppe).toLowerCase());
                  return (
                    <div key={i} style={{ display: "flex", gap: 14, padding: "8px 22px", fontSize: 13,
                      borderBottom: `1px solid ${C.lineSoft}` }}>
                      <span style={{ minWidth: 180 }}>{z.nachname}, {z.vorname}</span>
                      <span style={{ color: treffer ? C.ok : C.warn, minWidth: 160 }}>
                        {treffer ? treffer.name : `${z.gruppe} → erste Gruppe`}</span>
                      <span style={{ color: C.dimmer, ...NUM }}>{n1(z.wochenstunden)} h</span>
                    </div>); })}
              </div>
              {importZeilen.length > 30 && <div style={{ padding: "10px 22px", fontSize: 12.5, color: C.dimmer }}>
                und {importZeilen.length - 30} weitere</div>}
            </Card>)}

          <Card style={{ padding: 18, background: C.okLight }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>Zusammenfassung</div>
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7 }}>
              Bereich: <b>{eigeneBranche || (BRANCHEN.find((b) => b[0] === branche) || [])[1]}</b> ·
              Einheiten heißen <b>{einheitLabel}</b><br />
              Modell: <b>{modell ? modell.name : "eigenes Modell"}</b> mit {tage.length} Zyklustagen und {dienste.length} Dienstarten<br />
              {gruppen.length} Gruppen · {auswertung ? `${n2(auswertung.wochenstunden)} h je Woche` : ""} ·
              Zyklusbeginn {fDatum(ankerDatum)}<br />
              {importZeilen ? `${importZeilen.length} Personen werden angelegt` : "Personal wird später erfasst"}
            </div>
            {auswertung && (auswertung.luecken.length > 0 || auswertung.ruhe > 0) && (
              <div style={{ fontSize: 13, color: C.warn, marginTop: 12, lineHeight: 1.5 }}>
                Achtung: Das Modell hat noch
                {auswertung.luecken.length ? ` ${auswertung.luecken.reduce((a, [, n]) => a + n, 0)} Deckungslücken` : ""}
                {auswertung.luecken.length && auswertung.ruhe ? " und" : ""}
                {auswertung.ruhe ? ` ${auswertung.ruhe} Ruhezeitkonflikte` : ""}.
                Es lässt sich trotzdem übernehmen und später korrigieren.
              </div>)}
          </Card>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Btn kind="quiet" onClick={zurueck}>Zurück</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
              <Btn kind="primary" onClick={uebernehmen}>Einrichtung abschließen</Btn>
            </div>
          </div>
        </div>)}
    </Sheet>);
}

/**
 * Der Betriebsablauf in sechs Stationen. Jede Station nennt die zuständige
 * Rolle, prüft ihren eigenen Zustand und erklärt sich selbst.
 */
const ABLAUF = [
  {
    id: "einrichten", titel: "Betrieb einrichten", rolle: "leitung", ziel: "betrieb",
    kurz: "Standorte, Regelwerk, Dienstarten",
    was: "Wie der Betrieb aufgebaut ist: Standorte mit eigenem Bundesland, die vertragliche Wochenarbeitszeit, Ruhezeiten und die Höchstzahl von Diensten in Folge.",
    warum: "Alles Weitere rechnet damit. Feiertage richten sich nach dem Standort, die Prüfung nach dem Regelwerk.",
    fertig: (m) => (m.standorte || []).length > 0 && m.dienstarten.length > 0,
    stand: (m) => `${(m.standorte || []).length} Standort${(m.standorte || []).length === 1 ? "" : "e"} · ${m.dienstarten.length} Dienstarten · ${n1(m.einstellungen.sollWochenstunden)} h je Woche`,
  },
  {
    id: "personal", titel: "Personal anlegen", rolle: "leitung", ziel: "personal",
    kurz: "Menschen erfassen, Zugangsarten vergeben",
    was: "Wer im Betrieb arbeitet — einzeln angelegt oder aus einer Liste eingelesen. Danach bekommt jede Person eine Zugangsart, die bestimmt, was sie sehen und ändern darf.",
    warum: "Ohne Personal bleibt der Plan leer. Die Zugangsart entscheidet über Rechte und wirkt auf die monatlichen Kosten.",
    fertig: (m) => m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false).length >= 2,
    stand: (m) => {
      const n = m.personen.filter((p) => imDienst(p, heute())).length;
      const pl = m.personen.filter((p) => ["planer", "subplaner"].includes(p.rolle)).length;
      return `${n} Person${n === 1 ? "" : "en"} · ${pl} mit Planungsrechten`;
    },
  },
  {
    id: "quals", titel: "Qualifikationen zuordnen", rolle: "leitung", ziel: "quals",
    kurz: "Wer darf was, mit Ablaufdatum",
    was: "Sachkunde, Schichtleitung, Erste Hilfe. Qualifikationen mit Ablaufdatum brauchen einen Nachweis — läuft er ab, zählt die Qualifikation nicht mehr für die Besetzung.",
    warum: "Die Besetzungsprüfung und die Ersatzsuche greifen darauf zu. Ohne Zuordnung kann die App nicht erkennen, ob ein Dienst fachlich gedeckt ist.",
    fertig: (m) => (m.qualifikationen || []).length > 0
      && m.personen.some((p) => imDienst(p, heute()) && (p.qualifikationen || []).length),
    stand: (m) => `${(m.qualifikationen || []).length} Qualifikationen · ${m.personen.filter((p) => (p.qualifikationen || []).length).length} Personen zugeordnet`,
  },
  {
    id: "schichtfolge", titel: "Schichtfolge festlegen", rolle: "planer", ziel: "folge",
    kurz: "Modell wählen, Gruppen und Startpunkte",
    was: "Der Zyklus und der Startpunkt jeder Gruppe. Aus beidem berechnet CENTRIC den Plan für jeden Tag — es wird nichts ausgerollt, es gibt keine Jahresgrenze.",
    warum: "Das ist die eigentliche Planung. Der Einrichtungsassistent führt durch die Auswahl und zeigt bei jedem Modell die gerechneten Kennzahlen.",
    fertig: (m) => m.zyklus && m.zyklus.tage && m.zyklus.tage.some((t) => t && t !== "-")
      && m.einheiten.filter((e) => !e.pool).length >= 2,
    stand: (m) => `${m.zyklus.tage.length} Zyklustage · ${m.einheiten.filter((e) => !e.pool).length} ${mehrzahl(m.einheitLabel)}`,
  },
  {
    id: "pruefen", titel: "Plan prüfen und freigeben", rolle: "planer", ziel: "plan",
    kurz: "Befunde beheben, dann verbindlich machen",
    was: "Die Prüfung meldet Unterbesetzung, Ruhezeitverstöße, fehlende Qualifikationen und Einsatzeinschränkungen. Sind die Befunde geklärt, wird der Monat freigegeben.",
    warum: "Erst mit der Freigabe ist der Plan verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus.",
    fertig: (m) => Object.keys(m.freigaben || {}).length > 0,
    stand: (m) => {
      const n = Object.keys(m.freigaben || {}).length;
      return n ? `${n} Monat${n === 1 ? "" : "e"} freigegeben` : "noch keine Freigabe";
    },
  },
  {
    id: "betrieb", titel: "Laufender Betrieb", rolle: "alle", ziel: "start",
    kurz: "Dienst tun, Zeiten bestätigen, Lücken schließen",
    was: "Beschäftigte stempeln ein, bestätigen Zeiten, stellen Anträge und Tauschgesuche. Die Schichtverantwortung schließt Lücken, die Planung entscheidet Anträge.",
    warum: "Hier entsteht die Wahrheit über den Monat — Grundlage für Stundenkonten, Zuschläge und Abrechnung.",
    fertig: (m) => Object.keys(m.erfassung || {}).length > 0 || (m.anfragen || []).length > 0,
    stand: (m) => `${Object.keys(m.erfassung || {}).length} bestätigte Zeiten · ${(m.anfragen || []).length} Vorgänge`,
  },
];

/* Die Farbe der Rolle im Ablauf. Als Zugriffsfunktion, nicht als fester Wert:
   C wird beim Umschalten des Erscheinungsbildes ausgetauscht, und ein beim
   Laden eingefrorener Ton bliebe hell. */
const ROLLE_FARBE = {
  get leitung() { return C.accentDeep; }, get planer() { return C.violet; },
  get subplaner() { return C.accent; }, get alle() { return C.ok; } };
const ROLLE_KURZ = { leitung: "Organisationsleitung", planer: "Planung", subplaner: "Schichtverantwortung", alle: "Alle Beteiligten" };

/** Ist diese Station Sache der angemeldeten Person? */
function meineStation(sitz, st) {
  if (st.rolle === "alle") return true;
  if (st.rolle === "leitung") return darf(sitz, "org.edit");
  if (st.rolle === "planer") return darf(sitz, "pattern.edit") || darf(sitz, "plan.publish");
  if (st.rolle === "subplaner") return darf(sitz, "plan.edit.unit");
  return false;
}

/* ---------------------------- Das Ablaufdiagramm ------------------------- */
function Ablaufdiagramm({ sitz, gehZu, kompakt }) {
  const m = sitz.mandant;
  const [offen, setOffen] = useState(null);
  const stationen = ABLAUF.map((st) => ({ ...st, ok: st.fertig(m), mein: meineStation(sitz, st) }));
  const ersteOffene = stationen.findIndex((x) => !x.ok);

  return (
    <div>
      <div className="reiterreihe" style={{ marginBottom: kompakt ? 12 : 18, paddingBottom: 10 }}>
        {stationen.map((st, i) => {
          const aktuell = i === ersteOffene;
          const f = ROLLE_FARBE[st.rolle];
          return (
            <Fragment key={st.id}>
              <div {...klickbar(() => setOffen(offen === st.id ? null : st.id),
                `${st.titel} — ${st.ok ? "erledigt" : "offen"}`)}
                aria-expanded={offen === st.id}
                style={{ minWidth: kompakt ? 132 : 168, padding: kompakt ? "12px 13px" : "15px 16px",
                  borderRadius: 16, cursor: "pointer", position: "relative",
                  background: st.ok ? C.okLight : aktuell ? `${f}12` : C.bg,
                  outline: offen === st.id ? `2px solid ${C.accent}` : aktuell ? `2px solid ${f}` : "none",
                  opacity: st.mein ? 1 : .62 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...NUM,
                    background: st.ok ? C.ok : aktuell ? f : C.lineStark,
                    color: st.ok || aktuell ? C.aufAkzent : C.dimmer }}>{st.ok ? <Icon n="haken" size={12} strokeWidth={2.4} /> : i + 1}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em",
                    textTransform: "uppercase", color: f }}>{ROLLE_KURZ[st.rolle]}</span>
                </div>
                <div style={{ fontSize: kompakt ? 13 : 14, fontWeight: 620, lineHeight: 1.25 }}>{st.titel}</div>
                <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4, lineHeight: 1.35 }}>
                  {st.ok ? st.stand(m) : st.kurz}</div>
                {!st.mein && <div style={{ fontSize: 10.5, color: C.dimmer, marginTop: 6, fontStyle: "italic" }}>
                  nicht dein Bereich</div>}
              </div>
              {i < stationen.length - 1 && (
                <div aria-hidden="true" style={{ display: "flex", alignItems: "center", color: C.dimmer,
                  flexShrink: 0, padding: "0 2px" }}><Icon n="pfeil-rechts" size={16} /></div>)}
            </Fragment>);
        })}
      </div>

      {offen && (() => {
        const st = stationen.find((x) => x.id === offen);
        return (
          <Card style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
              alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <Rubrik style={{ color: ROLLE_FARBE[st.rolle] }}>{ROLLE_KURZ[st.rolle]}</Rubrik>
                <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-.02em", marginTop: 6 }}>{st.titel}</div>
              </div>
              <Pill tone={st.ok ? "ok" : st.mein ? "warn" : "neutral"}>
                {st.ok ? "erledigt" : st.mein ? "deine Aufgabe" : "wartet auf andere"}</Pill>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <Lab style={{ marginBottom: 5 }}>Was hier geschieht</Lab>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{st.was}</div>
              </div>
              <div>
                <Lab style={{ marginBottom: 5 }}>Warum es wichtig ist</Lab>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{st.warum}</div>
              </div>
              <div>
                <Lab style={{ marginBottom: 5 }}>Aktueller Stand</Lab>
                <div style={{ fontSize: 14, color: st.ok ? C.ok : C.text, lineHeight: 1.6, ...NUM }}>
                  {st.stand(m)}</div>
              </div>
            </div>
            {st.mein && (
              <div style={{ marginTop: 18 }}>
                <Btn kind={st.ok ? "plain" : "primary"} onClick={() => gehZu(st.ziel)}>
                  {st.ok ? "Ansehen und ändern" : "Jetzt erledigen"}</Btn>
              </div>)}
            {!st.mein && (
              <div style={{ marginTop: 16, fontSize: 12.5, color: C.dimmer, lineHeight: 1.5 }}>
                Diese Station gehört zur {ROLLE_KURZ[st.rolle]}. Du siehst sie, damit klar ist, worauf
                deine Arbeit aufsetzt — ändern kann sie nur, wer die entsprechenden Rechte hat.
              </div>)}
          </Card>);
      })()}
    </div>);
}

/* ------------------------- Rollenabhängige Einführung -------------------- */
/**
 * Was jede Rolle beim ersten Mal wissen muss. Bewusst knapp: eine Sache je
 * Schritt, mit dem Weg dorthin. Wer will, springt direkt in die Ansicht.
 */
const EINFUEHRUNG = {
  leitung: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du richtest den Betrieb ein. Dieser Rundgang zeigt in fünf Schritten, was dafür nötig ist — und wer danach übernimmt. Er lässt sich jederzeit abbrechen und später fortsetzen." },
    { titel: "Der Ablauf im Überblick", ziel: null, diagramm: true,
      text: "Sechs Stationen führen vom leeren Betrieb zum laufenden Plan. Die ersten drei sind deine, danach übernimmt die Planung. Jede Station lässt sich antippen und erklärt sich selbst." },
    { titel: "Betrieb einrichten", ziel: "betrieb",
      text: "Standorte mit eigenem Bundesland, vertragliche Wochenarbeitszeit, Ruhezeit und Höchstzahl der Dienste in Folge. Diese Werte sind die Grundlage jeder Prüfung — Feiertage und Sollstunden richten sich danach." },
    { titel: "Personal anlegen", ziel: "personal",
      text: "Zwei Wege: eine Liste aus Tabellenkalkulation einlesen oder Personen einzeln anlegen. Danach vergibst du je Person eine Zugangsart. Sie bestimmt, was jemand sehen und ändern darf." },
    { titel: "Qualifikationen zuordnen", ziel: "quals",
      text: "Wer darf was. Qualifikationen mit Ablaufdatum brauchen einen Nachweis; läuft er ab, zählt die Qualifikation nicht mehr für die Besetzung. Die Matrix zeigt zudem, wo eine Qualifikation an einer einzigen Person hängt." },
    { titel: "Danach übernimmt die Planung", ziel: null,
      text: "Sobald Personal und Qualifikationen stehen, legt die Planung die Schichtfolge fest und gibt den ersten Monat frei. Du behältst überall Einblick und kannst jederzeit eingreifen." },
  ],
  planer: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du planst die Dienste. Dieser Rundgang zeigt deinen Teil des Ablaufs — und was die Organisationsleitung bereits vorbereitet hat." },
    { titel: "Was schon steht", ziel: null, diagramm: true, vorher: true,
      text: "Die grün markierten Stationen sind erledigt. Darauf setzt deine Arbeit auf: Standorte und Regelwerk bestimmen, wie geprüft wird; Personal und Qualifikationen, wer eingeteilt werden kann." },
    { titel: "Schichtfolge festlegen", ziel: "folge",
      text: "Ein Zyklus und ein Startpunkt je Gruppe — daraus wird der Plan für jeden Tag berechnet. Der Einrichtungsassistent bietet geprüfte Modelle mit gerechneten Kennzahlen: Wochenstunden, längste Dienstserie, Deckungslücken." },
    { titel: "Planen und prüfen", ziel: "plan",
      text: "Der Monatsplan zeigt alle Gruppen. Die Prüfung meldet Unterbesetzung, Ruhezeitverstöße und fehlende Qualifikationen. Der Planungsassistent füllt offene Stellen automatisch — nichts wird ohne deine Freigabe übernommen." },
    { titel: "Freigeben", ziel: "plan",
      text: "Mit der Freigabe wird der Monat verbindlich. Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus, und der Planstandvergleich zeigt, was sich seither geändert hat." },
    { titel: "Im laufenden Betrieb", ziel: "lage",
      text: "Das Lagebild zeigt die Besetzung von heute. Bei einer Lücke führt ein Klick zur Schnellbesetzung: Ersatz vorschlagen lassen, Folgen prüfen, eintragen — oder eine Anfrage versenden." },
  ],
  subplaner: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du bist schichtverantwortlich und fährst selbst mit. Dieser Rundgang zeigt, was du in deiner Einheit tun kannst." },
    { titel: "Was schon steht", ziel: null, diagramm: true, vorher: true,
      text: "Betrieb, Personal und Schichtfolge sind eingerichtet, der Plan ist freigegeben. Deine Aufgabe beginnt im laufenden Betrieb." },
    { titel: "Dein Lagebild", ziel: "lage",
      text: "Die Besetzung deiner Einheit für heute. Ist ein Dienst unterbesetzt, führt ein Klick zur Schnellbesetzung — mit Ersatzvorschlägen und einer Prüfung der Folgen, bevor du einteilst." },
    { titel: "Anträge entscheiden", ziel: "antraege",
      text: "Urlaubsanträge und Tauschanfragen aus deiner Einheit. Die Kapazitätsvorschau zeigt vorab, welche Wochen kippen würden, wenn du alle offenen Anträge genehmigst." },
    { titel: "Deine eigenen Dienste", ziel: "meine",
      text: "Du fährst selbst mit: eigene Schichten, Zeiten bestätigen, Verfügbarkeit pflegen, Anträge stellen. Alles wie für jede andere Person im Schichtdienst." },
  ],
  mitarbeiter: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Hier findest du deinen Dienstplan, stempelst ein und stellst Anträge. Der Rundgang dauert eine Minute." },
    { titel: "Heute", ziel: null,
      text: "Der Startbildschirm zeigt deinen Dienst des Tages mit einem großen Knopf zum Ein- und Ausstempeln. Beim Stempeln wird einmalig der Standort geprüft — gespeichert werden Ergebnis, grob gerundete Entfernung, Messgenauigkeit und Prüfort, keine Koordinate und kein Verlauf." },
    { titel: "Mein Plan", ziel: null,
      text: "Kommende Dienste als Liste oder Monatsansicht. Ein Tipp auf einen Tag öffnet die Möglichkeiten: Tausch suchen, frei beantragen oder einen Wunsch hinterlegen." },
    { titel: "Anliegen", ziel: null,
      text: "Anträge, Krankmeldung, Tauschbörse und dein Stundenkonto. In der Tauschbörse stehen offene Gesuche aller — wer einspringen kann, meldet sich mit einem Tipp." },
    { titel: "Mehr", ziel: null,
      text: "Verfügbarkeit einstellen, Wunschdienste, Nachweise, Schwarzes Brett. Hier findest du auch den Feldmodus für größere Schrift und den Wechsel zur Rechneransicht." },
  ],
  betriebsrat: [
    { titel: "Willkommen bei CENTRIC", ziel: null,
      text: "Du hast einen rein lesenden Prüfzugang — kostenfrei und ohne Eingriffsmöglichkeit. Der Rundgang zeigt, was einsehbar ist." },
    { titel: "Der Ablauf", ziel: null, diagramm: true,
      text: "So entsteht der Dienstplan. Du siehst jede Station, änderst aber nichts." },
    { titel: "Belastungsverteilung", ziel: "verteilung",
      text: "Wochenendnächte, Feiertage, Nachtdienste und kurzfristige Änderungen je Person — mit Abweichung vom Mittel. Dazu die Kennzahl Planungssicherheit: der Anteil der Änderungen mit weniger als vierzehn Tagen Vorlauf." },
    { titel: "Prüfung und Nachweise", ziel: "pruef",
      text: "Alle Befunde zu Ruhezeiten, Höchstarbeitszeit, Unterbesetzung und Einsatzeinschränkungen. Dokumentierte Unterschreitungen sind mit Begründung hinterlegt." },
    { titel: "Protokoll", ziel: "betrieb",
      text: "Änderungen am Regelwerk und an der Schichtfolge sind nachvollziehbar festgehalten." },
  ],
};

function Einfuehrung({ sitz, akt, gehZu, onClose }) {
  const m = sitz.mandant, p = sitz.person;
  const rolleId = p.rolle;
  const schritte = EINFUEHRUNG[rolleId] || EINFUEHRUNG.mitarbeiter;
  const [i, setI] = useState(Math.min((p.einfuehrung || {}).schritt || 0, schritte.length - 1));
  const s = schritte[i];
  const letzter = i === schritte.length - 1;

  const weiter = () => { if (letzter) { akt.einfuehrungFertig(); onClose(); } else { akt.einfuehrungSchritt(i + 1); setI(i + 1); } };
  const springen = () => { if (s.ziel) { akt.einfuehrungSchritt(i); gehZu(s.ziel); onClose(); } };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 96, background: "var(--c-ueberlagerung)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div className="blatt" style={{ width: "min(760px,96vw)", maxHeight: "92vh", overflowY: "auto",
        padding: "28px 30px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 22, gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <Logo size={30} />
            <div>
              <Rubrik>{rolle(rolleId).label} · Schritt {i + 1} von {schritte.length}</Rubrik>
            </div>
          </div>
          <Btn size="sm" kind="quiet" onClick={() => { akt.einfuehrungFertig(); onClose(); }}>Überspringen</Btn>
        </div>

        {/* Fortschrittsbalken aus Punkten */}
        <div style={{ display: "flex", gap: 5, marginBottom: 24 }}>
          {schritte.map((_, k) => (
            <div key={k} aria-current={k === i ? "step" : undefined}
              {...klickbar(() => { setI(k); akt.einfuehrungSchritt(k); },
                `Schritt ${k + 1} von ${schritte.length}: ${schritte[k].titel}`)}
              style={{ flex: 1, height: 4, borderRadius: 2, cursor: "pointer",
                background: k <= i ? C.accentDeep : C.line, transition: "background .25s" }} />))}
        </div>

        <h2 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em", margin: "0 0 14px", lineHeight: 1.15 }}>
          {s.titel}</h2>
        <p style={{ fontSize: 15.5, color: C.dim, lineHeight: 1.65, margin: "0 0 22px", maxWidth: 640 }}>
          {s.text}</p>

        {s.diagramm && (
          <div style={{ marginBottom: 22 }}>
            <Ablaufdiagramm sitz={sitz} gehZu={gehZu} kompakt />
          </div>)}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap",
          paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
          <Btn kind="quiet" disabled={i === 0} onClick={() => { setI(i - 1); akt.einfuehrungSchritt(i - 1); }}>
            Zurück</Btn>
          <div style={{ display: "flex", gap: 10 }}>
            {s.ziel && <Btn onClick={springen}>Dorthin wechseln</Btn>}
            <Btn kind="primary" onClick={weiter}>{letzter ? "Rundgang beenden" : "Weiter"}</Btn>
          </div>
        </div>
      </div>
    </div>);
}

/* ---------------------- Ablaufansicht als eigener Punkt ------------------ */
function Ablaufansicht({ sitz, akt, gehZu }) {
  const m = sitz.mandant, p = sitz.person;
  const stationen = ABLAUF.map((st) => ({ ...st, ok: st.fertig(m), mein: meineStation(sitz, st) }));
  const meine = stationen.filter((x) => x.mein);
  const meineOffen = meine.filter((x) => !x.ok);

  return (
    <div>
      <H1 rubrik="Orientierung"
        sub="So entsteht ein Dienstplan — von der Einrichtung bis zum laufenden Betrieb. Jede Station gehört einer Rolle. Deine sind hervorgehoben, die übrigen zeigen, worauf deine Arbeit aufsetzt."
        right={<Btn onClick={akt.starteEinfuehrung}>Rundgang starten</Btn>}>
        Ablauf</H1>

      <Kennzahlen min={175} kacheln={[
        { label: "Stationen erledigt", wert: `${stationen.filter((x) => x.ok).length} / ${stationen.length}`,
          ton: stationen.every((x) => x.ok) ? "ok" : undefined },
        { label: "Deine Stationen", wert: meine.length, sub: ROLLE_KURZ[
          darf(sitz, "org.edit") ? "leitung" : darf(sitz, "pattern.edit") ? "planer"
            : darf(sitz, "plan.edit.unit") ? "subplaner" : "alle"] },
        { label: "Offen bei dir", wert: meineOffen.length, ton: meineOffen.length ? "warn" : "ok",
          sub: meineOffen.length ? meineOffen[0].titel : "nichts zu tun" }]} />

      <Card style={{ padding: "22px 22px 12px", marginBottom: 16 }}>
        <Ablaufdiagramm sitz={sitz} gehZu={gehZu} />
      </Card>

      <Card>
        <CardHead right={<Lab>Antippen für Erklärungen</Lab>}>Alle Stationen im Einzelnen</CardHead>
        {stationen.map((st, i) => (
          <div key={st.id} style={{ padding: "18px 22px",
            borderBottom: i < stationen.length - 1 ? `1px solid ${C.lineSoft}` : "none",
            opacity: st.mein ? 1 : .68 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap", marginBottom: 9 }}>
              <span style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, ...NUM,
                background: st.ok ? C.ok : C.line, color: st.ok ? C.aufAkzent : C.dimmer }}>
                {st.ok ? <Icon n="haken" size={13} strokeWidth={2.4} /> : i + 1}</span>
              <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: "-.015em" }}>{st.titel}</span>
              <Pill size="sm" style={{ background: `${ROLLE_FARBE[st.rolle]}18`, color: ROLLE_FARBE[st.rolle] }}>
                {ROLLE_KURZ[st.rolle]}</Pill>
              {st.mein && <Pill size="sm" tone="accent">dein Bereich</Pill>}
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: st.ok ? C.ok : C.dimmer, ...NUM }}>
                {st.stand(m)}</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, maxWidth: 780 }}>{st.was}</div>
            <div style={{ fontSize: 13, color: C.dimmer, lineHeight: 1.55, marginTop: 7, maxWidth: 780 }}>
              <b style={{ color: C.dim }}>Warum:</b> {st.warum}</div>
            {st.mein && <div style={{ marginTop: 13 }}>
              <Btn size="sm" kind={st.ok ? "plain" : "primary"} onClick={() => gehZu(st.ziel)}>
                {st.ok ? "Ansehen" : "Jetzt erledigen"}</Btn></div>}
          </div>))}
      </Card>
    </div>);
}

function AntraegeGeteilt({ sitz, akt }) {
  const m = sitz.mandant;
  const [filter, setFilter] = useState("offen");
  const [gewaehlt, setGewaehlt] = useState([]);          // Kennungen für Sammelaktionen
  const [zeiger, setZeiger] = useState(0);               // Tastaturzeiger
  const [reiter, setReiter] = useState("einzeln");
  const liste = useRef(null);

  const alle = useMemo(() => m.anfragen
    .filter((a) => a.typ !== "einsatz")
    .filter((a) => {
      const p = m.personen.find((x) => x.id === a.personId);
      return p && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(p, a.von)));
    })
    .filter((a) => filter === "alle" ? true : a.status === filter)
    .sort((a, b) => (a.von < b.von ? -1 : 1)), [m, filter, sitz]);

  const probe = useMemo(() => alle.filter((a) => gewaehlt.includes(a.id) && a.typ === "abwesenheit"),
    [alle, gewaehlt]);
  const wochen = useMemo(() => wochenKapazitaet(m, 8, probe), [m, probe]);
  const aktueller = alle[zeiger];

  /* --- Tastatur: J/K blättern, G genehmigen, A ablehnen, Leertaste wählt --- */
  useEffect(() => {
    const taste = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setZeiger((z) => Math.min(alle.length - 1, z + 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setZeiger((z) => Math.max(0, z - 1)); }
      else if (k === "g" && aktueller && aktueller.status === "offen") { e.preventDefault(); akt.entscheideAntrag(aktueller.id, true); }
      else if (k === "a" && aktueller && aktueller.status === "offen") { e.preventDefault(); akt.entscheideAntrag(aktueller.id, false); }
      else if (e.key === " " && aktueller) { e.preventDefault();
        setGewaehlt((g) => g.includes(aktueller.id) ? g.filter((x) => x !== aktueller.id) : [...g, aktueller.id]); }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [alle, zeiger, aktueller, akt]);

  useEffect(() => { setZeiger(0); setGewaehlt([]); }, [filter]);

  const offeneZahl = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
  const betroffen = (a) => {
    if (a.typ !== "abwesenheit") return [];
    return wochen.filter((w) => a.von <= w.bis && a.bis >= w.von).map((w) => w.kw);
  };
  const markiert = aktueller ? betroffen(aktueller) : [];

  return (
    <div>
      <H1 rubrik="Anliegen"
        sub="Erst die Anträge, daneben die Kapazität. Bei Auswahl eines Antrags werden die betroffenen Wochen hervorgehoben — so ist vor der Entscheidung sichtbar, was sie auslöst."
        right={<Seg value={reiter} onChange={setReiter}
          options={[{ id: "einzeln", label: "Einzelanträge" }, { id: "runde", label: "Jahresurlaubsrunde" }]} />}>
        Anträge</H1>

      {reiter === "runde" ? <Urlaubsrunde sitz={sitz} akt={akt} /> : (
        /* Zwei Spalten brauchen Platz. Bei 390 Pixeln blieb für die rechte
           Spalte ein Streifen von sechzig Pixeln übrig, und die linke wurde
           so schmal, dass der Untertitel Wort für Wort umbrach. Unterhalb
           von 900 Pixeln stehen sie deshalb untereinander. */
        <div className="zweispaltig" style={{ display: "grid",
          gridTemplateColumns: "minmax(0,1.25fr) minmax(300px,1fr)", gap: 18,
          alignItems: "start" }}>

          {/* ------------------------- Liste ------------------------- */}
          <Card style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
              borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
              <Seg value={filter} onChange={setFilter} options={[
                { id: "offen", label: `Offen ${offeneZahl ? `· ${offeneZahl}` : ""}` },
                { id: "genehmigt", label: "Genehmigt" }, { id: "abgelehnt", label: "Abgelehnt" },
                { id: "alle", label: "Alle" }]} />
              <div style={{ flex: 1 }} />
              {gewaehlt.length > 0 ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>{gewaehlt.length} gewählt</span>
                  <Btn size="sm" kind="ok" onClick={() => { gewaehlt.forEach((id) => akt.entscheideAntrag(id, true)); setGewaehlt([]); }}>
                    Alle genehmigen</Btn>
                  <Btn size="sm" kind="danger" onClick={() => { gewaehlt.forEach((id) => akt.entscheideAntrag(id, false)); setGewaehlt([]); }}>
                    Alle ablehnen</Btn>
                  <Btn size="sm" kind="quiet" onClick={() => setGewaehlt([])}>Auswahl leeren</Btn>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11.5, color: C.dim }}>
                  <span><kbd className="taste">J</kbd> <kbd className="taste">K</kbd> blättern</span>
                  <span><kbd className="taste">G</kbd> genehmigen</span>
                  <span><kbd className="taste">A</kbd> ablehnen</span>
                  <span><kbd className="taste">␣</kbd> wählen</span>
                </div>)}
            </div>

            <div ref={liste} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
              {alle.length === 0
                ? <Leer titel="Keine Anträge" text="In dieser Kategorie liegt derzeit nichts vor." />
                : alle.map((a, i) => {
                  const p = m.personen.find((x) => x.id === a.personId);
                  const e = p && m.einheiten.find((x) => x.id === einheitAm(p, a.von));
                  const anGewaehlt = gewaehlt.includes(a.id);
                  const amZeiger = i === zeiger;
                  const tage = between(a.von, a.bis) + 1;
                  return (
                    <div key={a.id} {...klickbar(() => setZeiger(i))}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", flexWrap: "wrap",
                        borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer",
                        background: amZeiger ? C.accentLight : anGewaehlt ? C.bg : "transparent",
                        borderLeft: amZeiger ? `3px solid ${C.accent}` : "3px solid transparent" }}>
                      <input type="checkbox" checked={anGewaehlt} aria-label={`Antrag von ${p ? `${p.nachname}, ${p.vorname}` : "unbekannt"} für Sammelentscheidung auswählen`} onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => setGewaehlt(ev.target.checked
                          ? [...gewaehlt, a.id] : gewaehlt.filter((x) => x !== a.id))}
                        style={{ width: 15, height: 15, flexShrink: 0, accentColor: C.accent }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                          {p && <Avatar person={p} size="sm" style={{ width: 24, height: 24, fontSize: 10 }} />}
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                            {p ? `${p.nachname}, ${p.vorname}` : "?"}</span>
                          {e && <span style={{ fontSize: 11.5, color: C.dim }}>{e.name}</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3, ...NUM }}>
                          {a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ·
                          {" "}{fKurz(a.von)}{tage > 1 ? ` bis ${fKurz(a.bis)} · ${tage} Tage` : ""}
                        </div>
                        {a.text && <div style={{ fontSize: 12, color: C.dim, marginTop: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>„{a.text}"</div>}
                      </div>
                      {a.status === "offen" ? (() => {
                        const st = genehmigungsStand(m, a);
                        const darfIch = darfStufe(sitz, a, st);
                        return (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            {st.noetig > 1 && (
                              <Pill size="sm" tone={st.erteilt ? "accent" : "warn"}>
                                Stufe {st.erteilt + 1} von {st.noetig}</Pill>)}
                            {darfIch ? (<>
                              <Btn size="sm" kind="ok" onClick={(ev) => { if (ev) ev.stopPropagation();
                                akt.entscheideAntrag(a.id, true); }}>
                                {st.noetig > 1 && st.offen > 1 ? "Mitzeichnen" : "Genehmigen"}</Btn>
                              <Btn size="sm" onClick={(ev) => { if (ev) ev.stopPropagation();
                                akt.entscheideAntrag(a.id, false); }}>Ablehnen</Btn>
                            </>) : (
                              <span style={{ fontSize: 12, color: C.dim }}>wartet auf {st.naechste}</span>)}
                          </div>);
                      })() : <Pill size="sm" tone={a.status === "genehmigt" ? "ok" : "danger"}>{a.status}</Pill>}
                    </div>);
                })}
            </div>
          </Card>

          {/* --------------------- Kapazitätsraster -------------------- */}
          <div style={{ position: "sticky", top: 76 }}>
            <Card>
              <CardHead right={<Lab>acht Wochen</Lab>}>Kapazität</CardHead>
              <div style={{ padding: 16 }}>
                {wochen.map((w) => {
                  const hervor = markiert.includes(w.kw);
                  const farbe = w.stand === "kippt" ? C.danger : w.stand === "eng" ? C.warn : C.ok;
                  const flaeche = w.stand === "kippt" ? C.dangerLight : w.stand === "eng" ? C.warnLight : C.okLight;
                  return (
                    <div key={w.kw} style={{ display: "flex", alignItems: "center", gap: 12,
                      padding: "9px 11px", borderRadius: 9, marginBottom: 5,
                      background: hervor ? flaeche : "transparent",
                      outline: hervor ? `1.5px solid ${farbe}` : "none" }}>
                      <span style={{ fontSize: 12, color: C.dim, minWidth: 62, ...NUM }}>
                        ab {fKurz(w.von)}</span>
                      {/* Auslastungsbalken */}
                      <div style={{ flex: 1, height: 22, borderRadius: 6, background: C.bg,
                        position: "relative", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, w.quote)}%`, height: "100%",
                          background: `${farbe}2E`, borderRight: `2px solid ${farbe}`,
                          transition: "width .25s" }} />
                        <span style={{ position: "absolute", left: 8, top: 3, fontSize: 11.5,
                          color: C.dim, ...NUM }}>{w.quote} % abwesend</span>
                      </div>
                      <span style={{ minWidth: 66, textAlign: "right", fontSize: 12, fontWeight: 600,
                        color: w.stand === "kippt" ? C.danger : w.stand === "eng" ? C.warn : C.dim, ...NUM }}>
                        {w.neu > 0 ? `+${w.neu} neu` : w.dann > 0 ? `${w.dann} Befund` : "frei"}</span>
                    </div>);
                })}
              </div>
              <div style={{ padding: "0 16px 16px", fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                {gewaehlt.length > 0
                  ? `Gerechnet mit ${probe.length} ausgewählten Anträgen. Rot bedeutet: diese Woche kippt erst dadurch.`
                  : aktueller
                    ? "Die hervorgehobenen Wochen betrifft der markierte Antrag."
                    : "Antrag auswählen, um die betroffenen Wochen zu sehen."}
              </div>
            </Card>

            {aktueller && (
              <Card style={{ marginTop: 14, padding: 16 }}>
                <Rubrik style={{ marginBottom: 9 }}>Markierter Antrag</Rubrik>
                {(() => {
                  const p = m.personen.find((x) => x.id === aktueller.personId);
                  if (!p) return null;
                  const jahr = Number(aktueller.von.slice(0, 4));
                  const uk = urlaubskonto(m, p, jahr);
                  return (<>
                    <div style={{ fontSize: 15, fontWeight: 650 }}>{p.vorname} {p.nachname}</div>
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{p.funktion}</div>
                    <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 12.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.dim }}>Urlaub übrig</span>
                        <span style={NUM}>{uk.rest} von {uk.anspruch} Tagen</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.dim }}>Stundenkonto</span>
                        <span style={NUM}>{sgnIst(stundenkonto(m, p, aktueller.von.slice(0, 7)))} h</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.dim }}>Auslastung</span>
                        <span style={NUM}>{auslastung(m, p, aktueller.von.slice(0, 7)).pct} %</span></div>
                    </div>
                  </>);
                })()}
              </Card>)}
          </div>
        </div>)}
    </div>);
}

function Monatsplan({ sitz, ym, setYm, oeffneTag, akt, schmal,
  standortId = ALLE_STANDORTE, setStandortId = () => {} }) {
  const [suche, setSuche] = useState("");
  const [filterDienst, setFilterDienst] = useState("");
  const [nurKnapp, setNurKnapp] = useState(false);
  const m = sitz.mandant;
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const d0 = heute();
  const bes = useMemo(() => Object.fromEntries(tage.map((d) => [d, besetzung(m, d)])), [m, ym]);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const lage = useMemo(() => monatsLage(m, tage, bes), [m, ym, bes]);
  const ta = useMemo(() => teamAuslastung(m, ym, tage[0], standortId), [m, ym, standortId]);
  /* Nur die Einheiten des gewählten Standorts erscheinen im Raster. Die
     Besetzungszeilen darunter bleiben, wie sie sind — eine Dienstart ist
     eine Eigenschaft des Betriebs, nicht eines Hauses. */
  const einheiten = einheitenAmStandort(m, standortId);
  const stName = standortId === ALLE_STANDORTE ? null
    : ((m.standorte || []).find((s) => s.id === standortId) || {}).name;

  return (
    <div>
      <H1 sub={`${stName || m.name} · ${anzahlWort(einheiten.length, m.einheitLabel)}`}
        right={<div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }} className="noprint">
          <Standortwahl m={m} wert={standortId} setWert={setStandortId} breit={180} />
          {darf(sitz, "plan.view.unit") && <Btn onClick={() => akt.aushangPDF(ym, sitz.person.bereich !== "ALLE"
            ? sitz.person.bereich : (einheiten.find((x) => !x.pool) || {}).id)}>Aushang</Btn>}
          {darf(sitz, "plan.edit.unit") && <Btn onClick={akt.oeffneMehrfach}>Mehrfach ändern</Btn>}
          {darf(sitz, "pattern.edit") && <Btn onClick={akt.oeffneWizard}>Einrichtung</Btn>}
          {darf(sitz, "plan.edit.all") && <Btn kind="primary" onClick={akt.oeffneAssistent}>Planungsassistent</Btn>}
          <Zeitwahl onZurueck={() => shift(-1)} onHeute={() => setYm(d0.slice(0, 7))} onWeiter={() => shift(1)} /></div>}>{MON[mo - 1]} {y}</H1>

      <Freigabeleiste sitz={sitz} ym={ym} akt={akt} />

      {standortId === ALLE_STANDORTE && (
        <Standortleiste m={m} wert={standortId} setWert={setStandortId} />)}

      <TeamAuslastungLeiste ta={ta} />

      <Tagesfazit lage={lage} onTag={oeffneTag} />

      {/* Auf dem Telefon tritt die Liste an die Stelle des Rasters. Kein
          geschrumpftes Raster, sondern eine eigene Form. */}
      {schmal ? <Wochenliste sitz={sitz} ym={ym} oeffneTag={oeffneTag} bes={bes} lage={lage} /> : <>

      <Filterleiste suche={suche} setSuche={setSuche} platzhalter={`${m.einheitLabel} oder Dienstart …`}
        rechts={<>
          <Sel value={filterDienst} aria-label="Nach Dienstart filtern"
            onChange={(ev) => setFilterDienst(ev.target.value)} style={{ minWidth: 150 }}>
            <option value="">alle Dienstarten</option>
            {m.dienstarten.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <Schalter an={nurKnapp} onChange={() => setNurKnapp(!nurKnapp)} />
            <span style={{ fontSize: 13, color: C.dim }}>nur knappe Tage</span></label>
          <Btn size="sm" kind="quiet" onClick={() => { setSuche(""); setFilterDienst(""); setNurKnapp(false); }}>
            Zurücksetzen</Btn>
        </>} />

      <Card style={{ overflowX: "auto" }}>
        <table role="grid" aria-label="Monatsplan — mit den Pfeiltasten bewegen, Eingabetaste öffnet den Tag"
          style={{ borderCollapse: "collapse", width: "100%", minWidth: 1040 }}>
          <thead>
            {/* Eine Zeile, die den ganzen Monat beantwortet: Höhe des Strichs
                ist die Dringlichkeit. Wer nur hier hinsieht, weiß Bescheid. */}
            <tr className="noprint">
              <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.flaeche, textAlign: "left",
                padding: "10px 20px 4px", minWidth: 160 }}><Lab>Aufmerksamkeit</Lab></th>
              {tage.map((d) => { const t = lage.tage.find((x) => x.datum === d);
                return (<th key={d}
                  {...zelleBedienbar(() => oeffneTag(d),
                    `Aufmerksamkeit · ${fLang(d)}${t ? ` · ${t.text}` : " · unauffällig"}`, d === tage[0])}
                  style={{ padding: "10px 0 4px", cursor: "pointer", verticalAlign: "bottom" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: 18 }}>
                    <span style={{ width: "58%", borderRadius: 2,
                      height: t ? (t.stufe === 2 ? 16 : 9) : 3,
                      background: t ? (t.stufe === 2 ? C.danger : C.warn) : C.line,
                      opacity: t ? 1 : .55 }} /></div></th>); })}
            </tr>
            <tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, background: C.flaeche, textAlign: "left",
              padding: "15px 20px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 160 }}><Lab>{m.einheitLabel}</Lab></th>
            {tage.map((d) => { const fei = feiertag(d, m.bundesland), we = dow(d) >= 5;
              const eng = Object.values(bes[d]).some((x) => x.status !== "ok");
              const blass = nurKnapp && !eng;
              return (<th key={d}
                {...zelleBedienbar(() => oeffneTag(d),
                  `Tag · ${fLang(d)}${fei ? ` · ${fei}` : ""}${eng ? " · Engpass" : ""}`)}
                style={{ padding: "9px 0 8px", borderBottom: `1px solid ${C.lineSoft}`, minWidth: 33, cursor: "pointer",
                  opacity: blass ? .3 : 1,
                  /* Nur noch der Kalender: Wochenende und Feiertag teilen sich
                     denselben stillen Ton. Vorher trug ein Feiertag C.dangerLight
                     — dieselbe Farbe wie eine Unterbesetzung, was beides
                     ununterscheidbar machte. */
                  background: d === d0 ? C.accentLight : (fei || we) ? C.flaecheStill : "transparent",
                  boxShadow: d === d0 ? `inset 0 -2px 0 ${C.accent}` : "none" }}>
                <div style={{ fontSize: 10.5, color: fei ? C.warn : we ? C.dim : C.dimmer, fontWeight: fei ? 700 : 500 }}>{fei ? "Fei" : DOW[dow(d)]}</div>
                <div style={{ fontSize: 13, color: d === d0 ? C.accent : C.text, fontWeight: d === d0 ? 700 : 500, ...NUM }}>{pad(pISO(d).getDate())}</div>
              </th>); })}
          </tr></thead>
          <tbody>
            {einheiten.filter((e) => !suche.trim()
              || e.name.toLowerCase().includes(suche.trim().toLowerCase())).map((e) => (
              <tr key={e.id} className="row">
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.flaeche, padding: "11px 20px",
                  borderBottom: `1px solid ${C.lineSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: lesbar(e.farbe, 3), flexShrink: 0 }} />
                    <div><div style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</div>
                      <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
                        {aktive(m, tage[0]).filter((p) => einheitAm(p, tage[0]) === e.id).length} Pers. · Versatz {e.versatz}</div></div>
                  </div></td>
                {tage.map((d) => {
                  const da = map[einheitDienst(m, e.id, d)];
                  const fehlt = aktive(m, d).filter((p) => einheitAm(p, d) === e.id && abwesenheitAm(m, p.id, d)).length;
                  return (<td key={d}
                    {...zelleBedienbar(() => oeffneTag(d),
                      `${fLang(d)} · ${e.name}${da ? ` · ${da.name}` : " · frei"}${fehlt > 0 ? ` · ${fehlt} abwesend` : ""}`)}
                    style={{ padding: "6px 2px", textAlign: "center",
                    borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer",
                    background: d === d0 ? C.accentLight
                      : (dow(d) >= 5 || feiertag(d, m.bundesland)) ? C.flaecheStill : "transparent" }}>
                    {/* Vorher stand hier „−2". Das liest sich wie eine
                        Unterbesetzung, gemeint sind aber Abwesende — und ob
                        der Dienst dadurch unterbesetzt ist, sagen erst die
                        Besetzungszeilen weiter unten. */}
                    <Planzelle da={da} unten={fehlt > 0 ? `${fehlt} ab` : null} aktiv={d === d0} />
                  </td>); })}
              </tr>))}
            {m.dienstarten.filter((da) => (!filterDienst || da.id === filterDienst)
              && (!suche.trim() || da.name.toLowerCase().includes(suche.trim().toLowerCase())
                || da.kurz.toLowerCase().includes(suche.trim().toLowerCase()))).map((da, i) => (
              <tr key={da.id}>
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: C.flaeche, padding: "9px 20px",
                  borderTop: i === 0 ? `2px solid ${C.line}` : `1px solid ${C.lineSoft}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Zelle da={da} size={21} />
                    <div><div style={{ fontSize: 12.5 }}>{da.name}</div>
                      <div style={{ fontSize: 11, color: C.dimmer }}>{da.ort}</div></div></div></td>
                {tage.map((d) => { const b = bes[d][da.id];
                  const col = b.status === "ok" ? C.dim : b.status === "warn" ? C.warn : C.danger;
                  const anteil = Math.min(100, Math.round((b.anzahl / Math.max(1, b.soll)) * 100));
                  const kalender = dow(d) >= 5 || feiertag(d, m.bundesland);
                  return (<td key={d}
                    {...zelleBedienbar(() => oeffneTag(d),
                      `${fLang(d)} · ${da.name} · ${b.anzahl} von ${b.soll}${b.qualFehlt ? " · Fachkraftquote nicht erfüllt" : ""}`)}
                    style={{ textAlign: "center", padding: "5px 1px", cursor: "pointer",
                      /* Fläche trägt den Kalender, nicht den Zustand. Der
                         Zustand steht in Zahl und Füllstand — „3/4" sagt, wie
                         weit es fehlt, eine rote Fläche sagt nur, dass etwas
                         fehlt. */
                      background: d === d0 ? C.accentLight : kalender ? C.flaecheStill : "transparent",
                      borderTop: i === 0 ? `2px solid ${C.line}` : `1px solid ${C.lineSoft}` }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{ fontSize: 11.5, lineHeight: 1.1, ...NUM }}>
                        <span style={{ color: col, fontWeight: b.status === "ok" ? 500 : 700 }}>{b.anzahl}</span>
                        <span style={{ color: C.dimmer, fontSize: 9.5 }}>/{b.soll}</span></div>
                      <div style={{ width: "72%", height: 3, borderRadius: 2, background: C.lineSoft, overflow: "hidden" }}>
                        <div style={{ width: `${anteil}%`, height: "100%",
                          background: b.status === "ok" ? C.ok : b.status === "warn" ? C.warn : C.danger }} /></div>
                      {b.qualFehlt && <div title="Fachkraftquote nicht erfüllt"
                        style={{ width: 5, height: 5, borderRadius: 3, background: C.danger }} />}
                    </div></td>); })}
              </tr>))}
          </tbody>
        </table>
      </Card>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 18 }}>
        {m.dienstarten.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Zelle da={d} size={21} />
            <span style={{ fontSize: 13, color: C.dim, ...NUM }}>{d.name} · {d.start}–{d.ende} · {n1(dauer(d))} h</span>
          </div>))}
      </div>
      </>}
    </div>);
}

/* ========================= DIENSTARTEN — frei gestaltbar ================== */
function Dienstarten({ sitz, akt }) {
  const m = sitz.mandant;
  const [bearbeitet, setBearbeitet] = useState(null);
  /* WP-22: Dienstarten ändern Leitung und Planung (org.edit oder pattern.edit,
     Nutzerentscheidung); der Server weist alle anderen Rollen ab. */
  const editierbar = darf(sitz, "shift.edit") && (darf(sitz, "org.edit") || darf(sitz, "pattern.edit"));
  const leer = { name: "", kurz: "", start: "08:00", ende: "16:00", pause: 0, farbe: PALETTE[0], ort: "",
    posten: false, quelle: null, form: "regel", fachkraftQuote: null, zweiterAbschnitt: null,
    aufenthalt: null, abrufMinuten: null, einsatzAnteil: null,
    mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} };
  const [f, setF] = useState(leer);
  const oeffnen = (d) => { setBearbeitet(d ? d.id : "neu"); setF(d ? JSON.parse(JSON.stringify(d)) : { ...leer, kurz: "" }); };
  const speichern = () => {
    if (!f.name.trim() || !f.kurz.trim()) return;
    if (bearbeitet === "neu") akt.neueDienstart(f); else akt.aendereDienstart(bearbeitet, f);
    setBearbeitet(null);
  };

  return (
    <div>
      <H1 sub="Dienstarten sind vollständig frei gestaltbar: Zeiten, Pause, Farbe, Ort, Mindestbesetzung je Wochentag und geforderte Qualifikationen. Ein Außenposten wird automatisch aus der Einheit besetzt, die den Quelldienst fährt."
        right={editierbar && <Btn kind="primary" onClick={() => oeffnen(null)}>Dienstart anlegen</Btn>}>Dienstarten</H1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
        {m.dienstarten.map((d) => {
          const verwendet = m.zyklus.tage.filter((t) => t === d.id).length
            + Object.values(m.abweichungen).filter((v) => v === d.id).length;
          return (
            <Card key={d.id} hover style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <Zelle da={d} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 620 }}>{d.name}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, ...NUM }}>
                    {d.start}–{d.ende} · {n1(dauer(d))} h{d.pause ? ` · ${d.pause} min Pause` : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                    {n1(nachtAnteil(d, m.einstellungen))} h Nachtanteil · {d.ort || "ohne Ort"}</div>
                </div>
                {d.posten && <Pill size="sm" tone="ok">Posten</Pill>}
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 16 }}>
                {[["Mo–Do", d.mindest.mo_do], ["Fr", d.mindest.fr], ["Sa", d.mindest.sa], ["So/Feiertag", d.mindest.so]].map(([l, v]) => (
                  <Pill key={l} size="sm">{l} {v}</Pill>))}
              </div>
              {Object.entries(d.mindestQual || {}).filter(([, n]) => n > 0).length > 0 && (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 }}>
                  {Object.entries(d.mindestQual).filter(([, n]) => n > 0).map(([qid, n]) => {
                    const q = m.qualifikationen.find((x) => x.id === qid);
                    return <Pill key={qid} size="sm" tone="accent">davon {n} × {q ? q.kurz : qid}</Pill>; })}</div>)}
              <div style={{ display: "flex", gap: 9, marginTop: 18, alignItems: "center" }}>
                {editierbar && <Btn size="sm" onClick={() => oeffnen(d)}>Bearbeiten</Btn>}
                {editierbar && <Btn size="sm" kind="danger" onClick={() => akt.loescheDienstart(d.id)}>Löschen</Btn>}
                <span style={{ fontSize: 11.5, color: C.dimmer, marginLeft: "auto", ...NUM }}>
                  {verwendet > 0 ? `${verwendet}× verwendet` : "nicht verwendet"}</span>
              </div>
            </Card>);
        })}
      </div>

      <Sheet open={!!bearbeitet} onClose={() => setBearbeitet(null)}
        titel={bearbeitet === "neu" ? "Neue Dienstart" : "Dienstart bearbeiten"} width={640}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Bezeichnung"><Inp value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="z. B. Zwischendienst" /></Field>
            <Field label="Kürzel" hint="Erscheint im Plan."><Inp value={f.kurz} maxLength={3}
              onChange={(e) => setF({ ...f, kurz: e.target.value.toUpperCase() })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
            <Field label="Beginn"><Inp type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Ende" hint="Früher als der Beginn bedeutet Folgetag."><Inp type="time" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} /></Field>
            <Field label="Pause in Minuten"><Inp type="number" min={0} value={f.pause || 0} onChange={(e) => setF({ ...f, pause: Number(e.target.value) })} /></Field>
          </div>
          <div className="karte-still" style={{ padding: 14, display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center", borderRadius: "var(--r)" }}>
            <div><Lab>Dauer</Lab><div style={{ fontSize: 19, fontWeight: 650, ...NUM }}>{n1(dauer(f))} h</div></div>
            <div><Lab>Brutto</Lab><div style={{ fontSize: 19, fontWeight: 650, color: C.dim, ...NUM }}>{n1(brutto(f))} h</div></div>
            <div><Lab>Nachtanteil {nachtFenster(m.einstellungen).von.slice(0, 2)}–{nachtFenster(m.einstellungen).bis.slice(0, 2)} Uhr</Lab>
              <div style={{ fontSize: 19, fontWeight: 650,
                color: nachtAnteil(f, m.einstellungen) > 0 ? C.violet : C.dimmer, ...NUM }}>
                {n1(nachtAnteil(f, m.einstellungen))} h</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Bewertung auf das Stundenkonto"
              hint="1,0 ist volle Arbeitszeit. Rufbereitschaft wird üblicherweise mit 0,125 bis 0,25 gewertet.">
              <Inp type="number" step="0.025" min={0} max={1} value={f.faktor === undefined ? 1 : f.faktor}
                onChange={(e) => setF({ ...f, faktor: Number(e.target.value) })} /></Field>
            {(m.standorte || []).length > 1 && (
              <Field label="Standort" hint="Bestimmt die Feiertage für die Mindestbesetzung.">
                <Sel value={f.standortId || ""} onChange={(e) => setF({ ...f, standortId: e.target.value })}>
                  <option value="">Betriebsvorgabe</option>
                  {(m.standorte || []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</Sel></Field>)}
          </div>

          {/* Die Dienstform stand im Quelltext, aber in keiner Maske.

              DIENSTFORMEN kennt seit jeher Bereitschaftsdienst,
              Rufbereitschaft und geteilten Dienst mit ihrer je eigenen
              Anrechnung — nur ließ sich keine davon einstellen. Die Formen
              entstanden allein beim Aufbau der Vorführdaten; ein echter
              Betrieb konnte eine Rufbereitschaft anlegen, sie aber nicht als
              solche kennzeichnen, und rechnete sie damit voll auf die
              Konten. */}
          <Field label="Art des Dienstes"
            hint={dienstform(f.form).hinweis}>
            <Sel value={f.form || "regel"} onChange={(e) => setF({ ...f, form: e.target.value,
              /* Die Vorschläge der Form übernehmen, solange nichts Eigenes
                 eingetragen ist. */
              faktor: f.faktor === undefined || f.faktor === null || f.faktor === dienstform(f.form).faktor
                ? dienstform(e.target.value).faktor : f.faktor,
              ruhezeitNeutral: dienstform(e.target.value).ruhezeitNeutral,
              rufbereitschaft: e.target.value === "ruf",
              aufenthalt: f.aufenthalt || dienstform(e.target.value).aufenthalt || null })}>
              {DIENSTFORMEN.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>

          {/* --- Bereitschaft: wie eng bindet sie? ---

              Ob eine Bereitschaft als Arbeitszeit zählt, entscheidet nicht
              ihr Name, sondern die Bindung. Diese drei Angaben sind die,
              nach denen im Streitfall gefragt wird. */}
          {(f.form === "ruf" || f.form === "bereitschaft") && (
            <div className="karte-still" style={{ padding: 16, borderRadius: "var(--r)" }}>
              <Lab style={{ marginBottom: 12 }}>Ausgestaltung der Bereitschaft</Lab>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
                <Field label="Aufenthalt" hint={aufenthaltVon(f.aufenthalt).text}>
                  <Sel value={f.aufenthalt || dienstform(f.form).aufenthalt || "frei"}
                    onChange={(e) => setF({ ...f, aufenthalt: e.target.value })}>
                    {AUFENTHALT.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel></Field>
                <Field label="Abrufzeit in Minuten"
                  hint="In welcher Zeit muss jemand am Einsatzort sein?">
                  <Inp type="number" min={0} step={5}
                    value={f.abrufMinuten === undefined || f.abrufMinuten === null ? "" : f.abrufMinuten}
                    onChange={(e) => setF({ ...f,
                      abrufMinuten: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
                <Field label="Einsatzanteil"
                  hint="Wie viel der Bereitschaft ist erfahrungsgemäß tatsächlich Einsatz? 0,2 sind 20 Prozent.">
                  <Inp type="number" min={0} max={1} step="0.05"
                    value={f.einsatzAnteil === undefined || f.einsatzAnteil === null ? "" : f.einsatzAnteil}
                    onChange={(e) => setF({ ...f,
                      einsatzAnteil: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              </div>
              {bereitschaftHinweise(f).map((h, i) => (
                <div key={i} style={{ marginTop: 11, fontSize: 12.5, lineHeight: 1.55,
                  color: h.schwere === "warn" ? C.warn : C.dim }}>{h.text}</div>))}
              <Erklaerkasten style={{ marginTop: 12 }}>
                Die Anwendung stuft nicht selbst ein — sie kennt weder den Tarifvertrag noch
                die tatsächliche Belastung. Sie hält fest, was für die Einstufung zählt, und
                sagt, wo die Angaben in eine andere Richtung zeigen als die gewählte Form.
              </Erklaerkasten>
            </div>)}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
            <Field label="Ort oder Objekt"><Inp value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} /></Field>
            <Field label="Farbe">
              <Farbwahl wert={f.farbe} onChange={(c) => setF({ ...f, farbe: c })} /></Field>
          </div>
          {/* WP-20: Worauf sich die Standortprüfung beim Stempeln dieser Dienstart bezieht. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Standortprüfung bezieht sich auf"
              hint="Wirkt nur, wenn die Standortprüfung im Betrieb eingeschaltet ist.">
              <Sel value={f.ortModus || "standort"}
                onChange={(e) => { const { einsatzortId, ...rest } = f; setF(e.target.value === "standort" ? { ...rest, ortModus: undefined }
                  : e.target.value === "einsatzort" ? { ...rest, ortModus: "einsatzort", einsatzortId: einsatzortId || "" } : { ...rest, ortModus: e.target.value }); }}>
                <option value="standort">Standort der Einheit</option>
                <option value="einsatzort">Einsatzort</option>
                <option value="aussendienst">Außendienst (kein fester Ort)</option></Sel></Field>
            {f.ortModus === "einsatzort" && (
              <Field label="Einsatzort" hint={(m.einsatzorte || []).length ? undefined : "Zuerst unter Betrieb einen Einsatzort anlegen."}>
                <Sel value={f.einsatzortId || ""} onChange={(e) => setF({ ...f, einsatzortId: e.target.value })}>
                  <option value="">— wählen —</option>
                  {(m.einsatzorte || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Sel></Field>)}
          </div>
          <div className="karte-still" style={{ padding: 16, borderRadius: "var(--r)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={!!f.posten} onChange={(e) => setF({ ...f, posten: e.target.checked, quelle: e.target.checked ? (f.quelle || m.dienstarten[0].id) : null })} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Außenposten — wird automatisch besetzt</span>
            </label>
            {f.posten && (<div style={{ marginTop: 13 }}>
              <Field label="Wird besetzt aus der Einheit im Dienst" hint="Die Besatzung wird rollierend gewählt und der Mindestbesetzung des Quelldienstes entnommen.">
                <Sel value={f.quelle || ""} onChange={(e) => setF({ ...f, quelle: e.target.value })}>
                  {m.dienstarten.filter((d) => !d.posten).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel></Field>
            </div>)}
          </div>
          <div>
            <Lab style={{ marginBottom: 10 }}>Mindestbesetzung</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 11 }}>
              {[["mo_do", "Mo – Do"], ["fr", "Freitag"], ["sa", "Samstag"], ["so", "So / Feiertag"]].map(([k, l]) => (
                <Field key={k} label={l}><Inp type="number" min={0} value={f.mindest[k]}
                  onChange={(e) => setF({ ...f, mindest: { ...f.mindest, [k]: Number(e.target.value) } })} /></Field>))}
            </div>
            <div style={{ fontSize: 12, color: C.dimmer, marginTop: 8 }}>Ein Feiertag hebt die Vorgabe an, senkt sie nie.</div>
          </div>
          {m.qualifikationen.length > 0 && (<div>
            <Lab style={{ marginBottom: 10 }}>Davon mit Qualifikation</Lab>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
              {m.qualifikationen.map((q) => (
                <Field key={q.id} label={q.name}><Inp type="number" min={0} value={(f.mindestQual || {})[q.id] || 0}
                  onChange={(e) => setF({ ...f, mindestQual: { ...(f.mindestQual || {}), [q.id]: Number(e.target.value) } })} /></Field>))}
            </div>
          </div>)}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
            <Btn kind="quiet" onClick={() => setBearbeitet(null)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={speichern}>Speichern</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

/* ==========================================================================
   NICHT GESPEICHERT

   Bisher stand hier eine Zeile: `melde("Nicht gespeichert: " + e.message)`.
   Ein Hinweis, der nach drei Sekunden verschwindet, und darin der rohe
   Text vom Server — „Failed to fetch" etwa. Wer gerade einen Monat geplant
   hat, konnte daraus weder ablesen, was verloren ist, noch was zu tun
   wäre. Und der schlimmste Fall meldete sich gar nicht: Bei abgelaufener
   Sitzung kehrte der Schreibvorgang wortlos zurück.

   Diese Leiste bleibt stehen, bis es geklärt ist. Sie sagt je nach Lage
   etwas anderes, weil je nach Lage etwas anderes zu tun ist — und sie
   bietet immer den Ausweg an, der nichts voraussetzt: die Arbeit als Datei
   sichern.
   ========================================================================== */
const SPEICHERLAGE = {
  abgemeldet: {
    titel: "Die Sitzung ist abgelaufen — die letzten Änderungen sind noch nicht gespeichert",
    text: "Nach dreißig Minuten ohne Eingabe endet die Sitzung. Gib den Zugangscode "
      + "hier ein: Die Anwendung meldet sich an und schickt die Arbeit sofort hinterher. "
      + "Bitte diesen Reiter dabei offen lassen — die Änderungen liegen nur hier.",
    neuAnmelden: true,
  },
  netz: {
    titel: "Keine Verbindung — die letzten Änderungen sind noch nicht gespeichert",
    text: "Die Anwendung erreicht den Server nicht. Das kann am Netz hier liegen oder "
      + "am Server. Die Arbeit ist nicht verloren, solange dieser Reiter offen bleibt.",
    nochmal: true,
  },
  server: {
    titel: "Der Server konnte nicht speichern",
    text: "Ein Fehler auf der Gegenseite. Ein zweiter Versuch hilft oft; hilft er nicht, "
      + "sichere die Arbeit als Datei und melde dich bei uns.",
    nochmal: true, hilfe: true,
  },
  keinRecht: {
    titel: "Diese Änderung ist mit deiner Rolle nicht zulässig",
    text: "Der Server hat sie abgewiesen. Was du siehst, ist noch dein Stand — "
      + "gespeichert ist er nicht. Lade die Seite neu, um den gültigen Stand zu sehen.",
    neuladen: true,
  },
  ausnahmeZurueck: {
    titel: "Die Datenschutz-Berichtigung oder -Löschung ist nicht gespeichert",
    text: "Der Server hat sie abgewiesen, oder der Bestand hat sich inzwischen geändert. Die Änderung wird "
      + "zurückgenommen: Lade die Seite neu und führe den Ausnahmeweg danach noch einmal aus.",
    neuladen: true,
  },
  stempelStand: {
    titel: "Der Bestand ist veraltet — bitte neu laden",
    text: "Seit du die Daten geladen hast, hat sich ein Stempel geändert, und gestempelte Werte bleiben unverändert. "
      + "Die Änderung ist nicht gespeichert. Lade den Bestand neu und trage sie dann noch einmal ein.",
    neuladen: true,
  },
  zuGross: {
    titel: "Der Bestand ist zu groß geworden",
    text: "Der Server hat die Übertragung abgewiesen. Sichere die Arbeit als Datei "
      + "und melde dich bei uns — das lässt sich lösen, aber nicht von hier aus.",
    hilfe: true,
  },
  unbekannt: {
    titel: "Die letzten Änderungen sind nicht gespeichert",
    text: "Woran es lag, ist von hier aus nicht zu erkennen. Ein zweiter Versuch ist "
      + "der erste Schritt; hilft er nicht, sichere die Arbeit als Datei.",
    nochmal: true, hilfe: true,
  },
};

function NichtGespeichert({ lage, melde, aufGeloest }) {
  const [laeuft, setLaeuft] = useState(false);
  const [code, setCode] = useState("");
  if (!lage) return null;
  const l = SPEICHERLAGE[lage.art] || SPEICHERLAGE.unbekannt;

  const nochmal = async () => {
    setLaeuft(true);
    try {
      const erg = await SP.nochmalSchreiben();
      if (erg.ok) { aufGeloest(); melde("Gespeichert."); }
      else melde("Es hat wieder nicht geklappt.");
    } catch { melde("Es hat wieder nicht geklappt."); }
    finally { setLaeuft(false); }
  };

  /* Anmelden muss in diesem Reiter geschehen, nicht in einem zweiten.

     Bei einer 401 verwirft speicher.js den Zugangsschlüssel — richtig, denn
     er ist tot. Nur: Ein neues Fenster legt seinen Schlüssel dort ab, wo
     dieser Reiter ihn nicht sieht. Der Rat „melde dich nebenan an und komm
     zurück" führte deshalb geradewegs in dieselbe Meldung. */
  const anmeldenUndSenden = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLaeuft(true);
    try {
      await SP.anmelden(c, SP.wirdGemerkt());
      const erg = await SP.nochmalSchreiben();
      if (erg.ok) { aufGeloest(); melde("Angemeldet und gespeichert."); }
      else melde("Angemeldet — das Speichern hat trotzdem nicht geklappt.");
    } catch (e) { melde(String(e.message || e)); }
    finally { setLaeuft(false); }
  };

  const sichern = () => {
    const b = SP.ausstehenderBestand();
    if (!b) return melde("Es liegt nichts mehr aus.");
    const marke = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    if (lade(`centric-ungespeichert-${marke}.json`, JSON.stringify(b, null, 2),
      "application/json;charset=utf-8"))
      melde("Als Datei gesichert.");
  };

  return (
    <div role="alert" style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 20,
      background: C.dangerLight, border: `1px solid ${C.danger}44` }}>
      <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>{l.titel}</div>
      <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "72ch" }}>
        {l.text}</p>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        {l.nochmal && <Btn kind="primary" size="sm" disabled={laeuft} onClick={nochmal}>
          {laeuft ? "Wird gesendet …" : "Noch einmal senden"}</Btn>}
        {l.neuAnmelden && (<>
          <Inp value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") anmeldenUndSenden(); }}
            placeholder="Zugangscode" aria-label="Zugangscode"
            style={{ width: 190, textTransform: "uppercase", letterSpacing: ".05em" }} />
          <Btn kind="primary" size="sm" disabled={laeuft || !code.trim()} onClick={anmeldenUndSenden}>
            {laeuft ? "Läuft …" : "Anmelden und senden"}</Btn>
        </>)}
        {/* Der Ausweg, der nichts voraussetzt — kein Netz, keine Sitzung,
            kein Recht. Er funktioniert immer. */}
        <Btn size="sm" onClick={sichern}>Als Datei sichern</Btn>
        {l.neuladen && <Btn size="sm" kind="quiet"
          onClick={() => window.location.reload()}>Seite neu laden</Btn>}
        {l.hilfe && <a href={hilfeVerweis({ betreff: "CENTRIC — Speichern schlägt fehl",
          zusatz: `Lage: ${lage.art}\nMeldung: ${lage.text}\nZeit: ${lage.zeit}` })}
          style={{ fontSize: 13, color: C.accent }}>Uns schreiben</a>}
        <span style={{ fontSize: 11.5, color: C.dimmer, marginLeft: "auto", ...NUM }}>
          {lage.text}</span>
      </div>
    </div>);
}

function Konfliktfenster({ lage, onSchliessen, onUebernehmen, melde }) {
  const rahmen = useRef(null);
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onSchliessen(); };
    window.addEventListener("keydown", f);
    if (rahmen.current) rahmen.current.focus();
    return () => window.removeEventListener("keydown", f);
  }, [onSchliessen]);

  const monate = Array.isArray(lage && lage.monate) ? lage.monate : [];
  const kern = !!(lage && lage.kernBetroffen);
  const wer = (lage && lage.durch) || "jemand anderes";
  const wann = lage && lage.zeit ? new Date(lage.zeit) : null;

  const sichern = () => {
    const marke = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    if (lade(`centric-mein-stand-${marke}.json`, JSON.stringify(lage.meiner ?? null, null, 2),
      "application/json;charset=utf-8")) melde("Als Datei gesichert.");
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Gleichzeitig bearbeitet"
      style={{ position: "fixed", inset: 0, background: "var(--c-ueberlagerung)",
        backdropFilter: "blur(6px)", zIndex: 90, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 20 }}>
      <div ref={rahmen} tabIndex={-1} className="blatt"
        style={{ maxWidth: 560, padding: 28, outline: "none" }}>
        <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 10 }}>
          {kern
            ? "Die Stammdaten wurden gleichzeitig geändert"
            : monate.length === 1
              ? `${monate[0]} wurde gleichzeitig bearbeitet`
              : monate.length > 1
                ? `${monate.length} Monate wurden gleichzeitig bearbeitet`
                : "Gleichzeitig bearbeitet"}
        </div>

        <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, margin: "0 0 14px" }}>
          {wer} hat gespeichert
          {wann && `, während du gearbeitet hast — zuletzt um ${
            wann.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}.
          Arbeit in verschiedenen Monaten führt CENTRIC von selbst zusammen;
          hier überschneidet sie sich wirklich.
        </p>

        {monate.length > 0 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {monate.map((mo) => <Pill key={mo} tone="warn" size="sm">{mo}</Pill>)}
          </div>)}

        <div style={{ display: "grid", gap: 10, marginBottom: 6 }}>
          <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Neu laden</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Du siehst den Stand von {wer}. Deine Änderungen seit dem letzten
              Speichern sind weg.</div>
            <Btn size="sm" kind="primary" onClick={() => window.location.reload()}>
              Neu laden</Btn>
          </div>

          <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Meinen Stand nehmen</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Dein Stand wird gespeichert. Was {wer}
              {monate.length ? ` in ${monate.join(", ")}` : ""} geändert hat, ist
              danach weg — bitte vorher kurz Rücksprache halten.</div>
            <Btn size="sm" kind="danger" onClick={() => {
              if (window.confirm(`Die Änderungen von ${wer}`
                + `${monate.length ? ` in ${monate.join(", ")}` : ""} werden überschrieben. `
                + "Das lässt sich nicht rückgängig machen.")) onUebernehmen();
            }}>Meinen Stand übernehmen</Btn>
          </div>

          <div className="karte" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
              Erst einmal sichern</div>
            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
              Legt deinen Stand als Datei ab. Nichts geht verloren, gespeichert
              ist damit aber auch nichts.</div>
            <Btn size="sm" onClick={sichern}>Als Datei sichern</Btn>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <Btn kind="quiet" onClick={onSchliessen}>Später entscheiden</Btn>
        </div>
      </div>
    </div>);
}

/* ==========================================================================
   OHNE NETZ

   Der Dienstarbeiter hält den zuletzt geladenen Plan bereit. Das ist genau
   dann nützlich, wenn es zählt — Kellergeschoss, Parkhaus, Funkloch — und
   genau dann gefährlich, wenn niemand merkt, dass der Stand alt ist.

   Deshalb diese Leiste. Sie sagt beides: dass die Verbindung fehlt und wie
   alt das ist, was auf dem Bildschirm steht.
   ========================================================================== */
function Offlineleiste({ lage }) {
  if (!lage) return null;
  const geholt = lage.geholt ? new Date(lage.geholt) : null;
  const minuten = geholt ? Math.round((Date.now() - geholt.getTime()) / 60000) : null;
  const alter = minuten === null ? null
    : minuten < 2 ? "gerade eben"
      : minuten < 60 ? `vor ${minuten} Minuten`
        : minuten < 1440 ? `vor ${Math.round(minuten / 60)} Stunden`
          : `vor ${Math.round(minuten / 1440)} Tagen`;

  return (
    <div role="status" style={{ padding: "12px 18px", borderRadius: 12, marginBottom: 20,
      background: C.warnLight, border: `1px solid ${C.warn}33`,
      display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, fontWeight: 640 }}>Keine Verbindung</span>
      <span style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, flex: 1, minWidth: 260 }}>
        Der Plan ist lesbar, aber Änderungen lassen sich nicht speichern.
        {alter ? ` Der angezeigte Stand wurde ${alter} geholt.` : ""}
        {" "}Sobald die Verbindung zurück ist, verschwindet dieser Hinweis.
      </span>
    </div>);
}

/* ===================== ABRECHNUNGSDATEN: ZUSCHLÄGE UND KONTEN ============ */
/**
 * Stempelbefunde eines Monats für die Leitung: je Stempel Start, Ende,
 * Geo-Befund, gerundete Entfernung, Genauigkeit, Referenzstandort und
 * Kennzeichen. Keine Karte, keine Koordinate, kein Verlauf.
 */
function Import({ sitz, akt, onClose }) {
  const m = sitz.mandant;
  const [text, setText] = useState("");
  const [pruef, setPruef] = useState(null);
  const [anlegen, setAnlegen] = useState(true);

  const analysieren = () => {
    const { kopf, daten } = importParsen(text);
    if (!daten.length) return;
    const { zu, herkunft } = importZuordnen(kopf, daten);
    setPruef({ ...importPruefen(m, kopf, daten, zu), kopf, zu, herkunft, daten });
  };

  /* Zuordnung von Hand ändern — die Erkennung ist gut, aber nicht unfehlbar. */
  const setzeSpalte = (feld, idx) => {
    const zu = { ...pruef.zu };
    if (idx === "") delete zu[feld]; else zu[feld] = Number(idx);
    setPruef({ ...importPruefen(m, pruef.kopf, pruef.daten, zu), kopf: pruef.kopf,
      zu, herkunft: { ...pruef.herkunft, [feld]: "hand" }, daten: pruef.daten });
  };

  return (
    <Sheet open onClose={onClose} titel="Personal importieren" width={860}>
      {!pruef && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.55 }}>
            Inhalt aus einer Tabelle einfügen — Semikolon, Tabulator oder Komma als Trenner.
            Die erste Zeile muss die Überschriften enthalten; sie werden automatisch zugeordnet.
            Erkannt werden Nachname, Vorname, Einheit, Funktion, Wochenstunden, Urlaub, Eintritt,
            Zugangsart, Qualifikationen und Teilzeit.
          </div>
          <textarea className="inp" rows={11} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={IMPORT_BEISPIEL} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <Btn kind="quiet" onClick={() => setText(IMPORT_BEISPIEL)}>Beispiel einfügen</Btn>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
              <Btn kind="primary" disabled={!text.trim()} onClick={analysieren}>Prüfen</Btn>
            </div>
          </div>
        </div>)}

      {pruef && (<>
        <Card style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <Lab>Erkannte Spalten</Lab>
            <span style={{ fontSize: 12.5, color: C.dim }}>
              {Object.keys(pruef.zu).length} von {pruef.kopf.length} Spalten zugeordnet</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12 }}>
            {[["nachname", "Nachname", true], ["vorname", "Vorname"], ["personalnummer", "Personalnummer"],
              ["einheit", m.einheitLabel], ["funktion", "Funktion"], ["wochenstunden", "Wochenstunden"],
              ["urlaubsanspruch", "Urlaubsanspruch"], ["eintritt", "Eintritt"], ["email", "E-Mail"],
              ["qualifikationen", "Qualifikationen"], ["rolle", "Zugangsart"]].map(([feld, label, pflicht]) => {
              const idx = pruef.zu[feld];
              const h = pruef.herkunft[feld];
              const ton = h === "genau" || h === "hand" ? "ok" : h === "aehnlich" ? "accent"
                : h === "inhalt" ? "warn" : null;
              return (
                <div key={feld}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.dim }}>
                      {label}{pflicht ? " *" : ""}</span>
                    {ton && <Pill size="sm" tone={ton}>
                      {h === "genau" ? "sicher" : h === "hand" ? "von Hand"
                        : h === "aehnlich" ? "ähnlich" : "aus dem Inhalt"}</Pill>}
                  </div>
                  <Sel value={idx === undefined ? "" : idx}
                    onChange={(e) => setzeSpalte(feld, e.target.value)}
                    style={{ borderColor: pflicht && idx === undefined ? C.danger : undefined }}>
                    <option value="">— nicht vorhanden —</option>
                    {pruef.kopf.map((h2, i) => (
                      <option key={i} value={i}>{h2 || `Spalte ${i + 1}`}</option>))}</Sel>
                </div>);
            })}
          </div>
          <div style={{ fontSize: 12.5, color: C.dim, marginTop: 14, lineHeight: 1.55 }}>
            Die Zuordnung entsteht aus der Überschrift und, wo die nicht eindeutig ist, aus dem
            Inhalt der Spalte. „Aus dem Inhalt" heißt: geraten anhand der Werte — bitte prüfen.
          </div>
        </Card>
      </>)}

      {pruef && (<div>
        <KpiRow min={150}>
          <Kpi label="Übernehmbar" value={pruef.gut} tone="ok" />
          <Kpi label="Fehlerhaft" value={pruef.fehlerhaft} tone={pruef.fehlerhaft ? "danger" : "ok"} />
          <Kpi label="Bereits vorhanden" value={pruef.doppelt} tone={pruef.doppelt ? "warn" : "ok"} />
          <Kpi label="Neue Einheiten" value={pruef.neueEinheiten.length} />
        </KpiRow>

        {(pruef.neueEinheiten.length > 0 || pruef.neueQuals.length > 0) && (
          <div className="karte" style={{ padding: 16, marginTop: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={anlegen} onChange={(e) => setAnlegen(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Fehlende Einheiten und Qualifikationen mit anlegen</span>
            </label>
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8, lineHeight: 1.5 }}>
              {pruef.neueEinheiten.length > 0 && <>Einheiten: {pruef.neueEinheiten.join(", ")}<br /></>}
              {pruef.neueQuals.length > 0 && <>Qualifikationen: {pruef.neueQuals.join(", ")}</>}
            </div>
          </div>)}

        <Card style={{ marginTop: 18, overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead><tr>{["", "Person", "Einheit", "Std.", "Zugang", "Qualifikationen", "Hinweis"].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}`,
                position: "sticky", top: 0, background: C.flaeche }}><Lab>{h}</Lab></th>))}</tr></thead>
            <tbody>{pruef.zeilen.map((z) => (
              <tr key={z.nr} className="row">
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, fontWeight: 700,
                    background: z.ok ? "rgba(46,107,79,.14)" : "rgba(179,38,30,.12)",
                    color: z.ok ? C.ok : C.danger }}>{z.ok ? <><Icon n="haken" size={13} strokeWidth={2.4} /><span className="nurLeser">ja</span></> : <><Icon n="x" size={13} strokeWidth={2.4} /><span className="nurLeser">nein</span></>}</span></td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                  {z.nachname}, {z.vorname}{z.teilzeit && <Pill size="sm" style={{ marginLeft: 6 }}>TZ</Pill>}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5,
                  color: z.einheitId ? C.dim : C.warn }}>{z.einheitName || "—"}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5, ...NUM }}>{n1(z.wochenstunden)}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12.5 }}>{rolle(z.rolle).kurz}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12 }}>
                  {z.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).kurz).join(" ")}
                  {z.fehlendeQuals.length > 0 && <span style={{ color: C.warn }}> +{z.fehlendeQuals.join(" ")}</span>}</td>
                <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12,
                  color: z.fehler.length ? C.danger : z.doppelt ? C.warn : C.dimmer }}>
                  {z.fehler.join(", ") || (z.doppelt ? "Name bereits vorhanden" : "")}</td>
              </tr>))}</tbody>
          </table>
        </Card>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <Btn kind="quiet" onClick={() => setPruef(null)}>Zurück</Btn>
          <Btn kind="quiet" onClick={onClose}>Abbrechen</Btn>
          <Btn kind="primary" disabled={!pruef.gut}
            onClick={() => { akt.importieren(pruef.zeilen.filter((z) => z.ok), anlegen); onClose(); }}>
            {pruef.gut} Personen übernehmen</Btn>
        </div>
      </div>)}
    </Sheet>);
}

/* ================================ DIENSTBUCH ============================ */
function Dienstbuch({ sitz, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [text, setText] = useState("");
  const [art, setArt] = useState("uebergabe");
  const arten = [["uebergabe", "Übergabe"], ["vorkommnis", "Vorkommnis"], ["hinweis", "Hinweis"]];
  const eintraege = (m.dienstbuch || []).filter((e) => e.datum === datum);
  const darfSchreiben = darf(sitz, "plan.view.unit");
  const [einheitId, setEinheitId] = useState(null);

  return (
    <div>
      <H1 sub="Was die nächste Schicht wissen muss. Ersetzt den Zettel am Wachtisch und bleibt nachvollziehbar."
        right={<Inp type="date" value={datum} aria-label="Tag des Dienstbuchs"
          onChange={(e) => setDatum(e.target.value)} style={{ width: 180 }} />}>
        Dienstbuch</H1>

      {darfSchreiben && (
        <Card style={{ marginBottom: 20 }}>
          <CardHead>Eintrag für {fLang(datum)}</CardHead>
          <div style={{ padding: 22, display: "grid", gap: 13 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {arten.map(([id, l]) => (
                <button key={id} onClick={() => setArt(id)} className="btn btn-sm" aria-pressed={art === id}
                  style={{ background: art === id ? C.accentLight : C.flaeche,
                    borderColor: art === id ? C.accent : undefined,
                    color: art === id ? C.accent : C.dim, fontWeight: 600 }}>{l}</button>))}
            </div>
            <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)}
              aria-label="Eintrag ins Dienstbuch"
              placeholder="Kurz und sachlich. Keine Gesundheitsdaten, keine Bewertungen von Personen." />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {waehltEinheit(sitz) && <EinheitWahl m={m} wert={einheitId} setWert={setEinheitId} style={{ marginRight: "auto" }} />}
              <Btn kind="primary" disabled={!text.trim()}
                onClick={() => { akt.dienstbuchEintrag(datum, art, text, einheitId); setText(""); }}>Eintragen</Btn>
            </div>
          </div>
        </Card>)}

      <Leitraster seiteBreite={340}
        haupt={<>
      <Card>
        <CardHead right={<Lab>{eintraege.length} Einträge</Lab>}>{fLang(datum)}</CardHead>
        {eintraege.length === 0
          ? <Leer titel="Kein Eintrag" text="Für diesen Tag wurde nichts vermerkt." />
          : eintraege.map((e, i) => (
            <div key={e.id} style={{ display: "flex", gap: 15, padding: "15px 22px",
              borderBottom: i < eintraege.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <span style={{ paddingTop: 6 }}><Punkt gross ton={e.art === "vorkommnis" ? "danger" : e.art === "hinweis" ? "warn" : "accent"} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <Pill size="sm" tone={e.art === "vorkommnis" ? "danger" : e.art === "hinweis" ? "warn" : "accent"}>
                    {(arten.find((a) => a[0] === e.art) || [])[1]}</Pill>
                  <span style={{ fontSize: 12.5, color: C.dimmer }}>{e.zeit} · {e.durch}{waehltEinheit(sitz) ? ` · ${einheitName(m, e.einheitId)}` : ""}</span>
                </div>
                <div style={{ fontSize: 14, color: C.text, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{e.text}</div>
              </div>
            </div>))}
      </Card>
        </>}
        seite={eintraege.length > 0 ? (
          <Seitenkarte titel="Einträge nach Art" sub={fLang(datum)}>
            {arten.map(([id, l]) => {
              const n = eintraege.filter((x) => x.art === id).length;
              return <Balkenzeile key={id} label={l} wert={n} anteil={(n / eintraege.length) * 100}
                ton={id === "vorkommnis" ? "danger" : id === "hinweis" ? "warn" : "accent"} punkt />;
            })}
          </Seitenkarte>) : null} />
    </div>);
}

function Schnellbesetzung({ sitz, datum, dienstId, akt, onClose }) {
  const m = sitz.mandant;
  const [gewaehlt, setGewaehlt] = useState(null);
  const [text, setText] = useState(null);
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const b = besetzung(m, datum)[dienstId];
  const liste = useMemo(() => ersatzVorschlaege(m, datum, dienstId), [m, datum, dienstId]);
  const [mitAbweichung, setMitAbweichung] = useState(false);
  const moeglich = liste.filter((x) => x.moeglich || mitAbweichung);
  const anzahlAbweichung = liste.filter((x) => !x.moeglich).length;
  const folgen = gewaehlt ? folgenPruefen(m, gewaehlt, datum, dienstId) : null;
  const nachricht = anfrageText(m, datum, dienstId, Math.max(0, -b.diff));

  const versenden = (weg) => {
    const t = encodeURIComponent(nachricht);
    const url = weg === "whatsapp" ? `https://wa.me/?text=${t}`
      : weg === "sms" ? `sms:?body=${t}`
      : `mailto:?subject=${encodeURIComponent("Dienstanfrage " + fKurz(datum))}&body=${t}`;
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { setText(nachricht); }
    akt.anfrageVermerken(datum, dienstId, weg);
  };

  return (
    <Sheet open onClose={onClose} titel="Dienst besetzen" width={780}>
      <div className="karte" style={{ padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Zelle da={da} size={40} />
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>{da.name}</div>
          <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{fLang(datum)} · {da.start}–{da.ende} · {da.ort}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 650, color: b.diff < 0 ? C.danger : C.ok, ...NUM }}>
            {b.anzahl}<span style={{ fontSize: 14, color: C.dimmer, fontWeight: 500 }}>/{b.soll}</span></div>
          <div style={{ fontSize: 11.5, color: C.dimmer }}>{b.diff < 0 ? `${Math.abs(b.diff)} fehlen` : "gedeckt"}</div>
        </div>
      </div>

      {/* Weg 1: direkt eintragen */}
      <Lab style={{ marginBottom: 10 }}>Direkt eintragen · nach Eignung sortiert</Lab>
      {moeglich.length === 0 && (
        <div style={{ padding: 14, borderRadius: 12, background: C.dangerLight, color: C.danger, fontSize: 13.5, marginBottom: 16 }}>
          Niemand einsetzbar, ohne Ruhezeit oder Einschränkungen zu verletzen. Nutze die Anfrage unten,
          die Eskalation im Tagesdetail oder wähle unten jemanden mit Abweichung.
        </div>)}
      <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 18 }}>
        {moeglich.slice(0, mitAbweichung ? 30 : 8).map((x, i) => {
          const an = gewaehlt && gewaehlt.id === x.person.id;
          return (
            <div key={x.person.id} aria-pressed={an}
              {...klickbar(() => setGewaehlt(an ? null : x.person),
                `${x.person.nachname}, ${x.person.vorname} — Vorschlag ${i + 1}`)}
              className="karte" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px",
                marginBottom: 7, cursor: "pointer", outline: an ? `2px solid ${C.accent}` : "none" }}>
              <span style={{ width: 25, height: 25, borderRadius: 9, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, ...NUM,
                background: i === 0 ? C.okLight : C.bg, color: i === 0 ? C.ok : C.dimmer }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{x.person.vorname} {x.person.nachname}</div>
                <div style={{ fontSize: 12, color: x.moeglich ? C.dimmer : C.danger }}>
                  {x.moeglich ? x.gruende.slice(0, 2).join(" · ") : `mit Abweichung: ${x.hindernisse[0]}`}</div>
              </div>
              <span style={{ fontSize: 12, color: C.dimmer }}>{an ? "gewählt" : "prüfen"}</span>
            </div>);
        })}
      </div>

      {folgen && (
        <div className="karte" style={{ padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 10 }}>
            Folgen für {gewaehlt.vorname} {gewaehlt.nachname}</div>
          {folgen.hindernisse.length > 0 && folgen.hindernisse.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
              <span style={{ color: C.danger, display: "flex", marginTop: 2 }}><Icon n="x" size={14} strokeWidth={2.2} /></span>
              <span style={{ fontSize: 13, color: C.danger }}>{h}</span></div>))}
          {folgen.hinweise.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700,
                color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dimmer }}>
                {h.art === "danger" ? <Icon n="x" size={14} strokeWidth={2.2} /> : h.art === "warn" ? <Icon n="warnung" size={14} /> : "·"}</span>
              <span style={{ fontSize: 13, color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dim }}>{h.text}</span>
            </div>))}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn kind="quiet" onClick={() => setGewaehlt(null)}>Andere wählen</Btn>
            <Btn kind={folgen.hindernisse.length ? "danger" : "primary"}
              onClick={() => akt.mitWarnung(m, { titel: "Dienst besetzen",
                eintraege: [{ personId: gewaehlt.id, datum, dienstId }], knopf: "Eintragen",
                alternative: (pid) => { akt.setzeEinsprung(pid, datum, dienstId); onClose(); },
                ausfuehren: (best) => { akt.setzeEinsprung(gewaehlt.id, datum, dienstId, best); onClose(); } })}>
              {folgen.hindernisse.length ? "Trotzdem eintragen …" : "Eintragen"}</Btn>
          </div>
        </div>)}

      {anzahlAbweichung > 0 && (
        <Btn size="sm" kind="quiet" onClick={() => setMitAbweichung(!mitAbweichung)} style={{ marginTop: -8, marginBottom: 16 }}>
          {mitAbweichung ? "Nur regelkonforme zeigen" : `Auch ${anzahlAbweichung} mit Abweichung zeigen`}</Btn>)}

      {/* Weg 2: offene Anfrage versenden */}
      <div style={{ paddingTop: 18, borderTop: `1px solid ${C.lineSoft}` }}>
        <Lab style={{ marginBottom: 10 }}>Oder Anfrage versenden</Lab>
        <pre className="karte" style={{ padding: 14, fontSize: 12.5, whiteSpace: "pre-wrap",
          fontFamily: FONT, color: C.dim, margin: "0 0 14px", lineHeight: 1.5 }}>{nachricht}</pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn kind="primary" onClick={() => versenden("whatsapp")}>Über WhatsApp</Btn>
          <Btn onClick={() => versenden("sms")}>Als SMS</Btn>
          <Btn onClick={() => versenden("mail")}>Per E-Mail</Btn>
          <Btn kind="quiet" onClick={() => { try { navigator.clipboard.writeText(nachricht); akt.melden("Text kopiert."); }
            catch (e) { setText(nachricht); } }}>Text kopieren</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
          Die Nachricht wird im gewählten Dienst geöffnet, die Empfänger wählst du dort. Wer zusagt,
          wird anschließend hier eingetragen — die Prüfung läuft dann genauso.
        </div>
        {text && <textarea readOnly value={text} onFocus={(e) => e.target.select()} className="inp"
          style={{ height: 150, marginTop: 12, fontSize: 12.5 }} />}
      </div>
    </Sheet>);
}

/* ==========================================================================
   WARNDIALOG — warnen statt sperren (E-19)

   Ein Dialog für alle Stellen, an denen eine Einteilung gegen eine Regel
   verstoßen würde. Er zeigt Was, Wo, Warum, Grundlage, Folgen und andere
   Wege. Entscheiden tut der Mensch: ändern oder dennoch fortfahren.
   Bei einem Rechtsverstoß ist „gelesen" anzukreuzen; der Grund ist
   freiwillig und lässt sich überspringen.
   ========================================================================== */
function Warndialog({ sitz, vorgang, onClose }) {
  const m = sitz.mandant;
  const eintraege = vorgang.geprueft;
  const mehrere = eintraege.length > 1;
  const ernst = (e) => e.technisch || e.befunde.some((b) => stufeRang(b.stufe) >= 2);
  const [auswahl, setAuswahl] = useState(() => new Set(eintraege
    .map((e, i) => i).filter((i) => !mehrere || !ernst(eintraege[i]))));
  const [gelesen, setGelesen] = useState(false);
  const [grundArt, setGrundArt] = useState("");
  const [grundText, setGrundText] = useState("");
  const [uebersprungen, setUebersprungen] = useState(false);

  const gewaehlt = eintraege.filter((_, i) => auswahl.has(i));
  const alleBefunde = gewaehlt.flatMap((e) => e.befunde);
  const stufe = hoechsteStufe(alleBefunde);
  const technisch = gewaehlt.filter((e) => e.technisch || e.befunde.some((b) => b.art === "bestand"));
  /* Harte Schutzbefunde (Kette B) lassen sich nicht wegbestätigen. */
  const geschuetzt = gewaehlt.filter((e) => e.befunde.some((b) => b.sperrt));
  const abwesend = gewaehlt.some((e) => e.befunde.some((b) => b.art === "abwesend"));
  const recht = stufe === "recht";
  /* Rechte bleiben (E-19, Grenzen): Eine Abwesenheit hebt nur auf, wer
     Abwesenheiten pflegen darf — die Schichtverantwortung nicht. */
  const abwesenheitGesperrt = abwesend && sitz.rolle === "subplaner";
  const kann = gewaehlt.length > 0 && !technisch.length && !geschuetzt.length && !abwesenheitGesperrt && (!recht || gelesen);
  const knopf = recht ? "Dennoch fortfahren" : stufe === "achtung" ? "Dennoch übernehmen" : (vorgang.knopf || "Übernehmen");
  const grund = ABWEICHUNG_GRUENDE.find((g) => g.id === grundArt);
  const einzel = !mehrere ? eintraege[0] : null;
  const folgen = einzel && einzel.person && einzel.da ? folgenPruefen(m, einzel.person, einzel.datum, einzel.dienstId).hinweise : [];
  const andere = einzel && vorgang.alternative && einzel.da
    ? ersatzVorschlaege(m, einzel.datum, einzel.dienstId).filter((x) => x.moeglich && x.person.id !== einzel.personId).slice(0, 3) : [];

  const umschalten = (i) => setAuswahl((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const ausfuehren = () => {
    vorgang.ausfuehren({
      eintraege: gewaehlt.map((e) => ({ personId: e.personId, datum: e.datum, dienstId: e.dienstId, idx: e.idx, befunde: e.befunde })),
      indizes: gewaehlt.map((e) => e.idx).filter((x) => x !== undefined),
      gelesen, grundArt: uebersprungen ? null : (grundArt || null), grundText: uebersprungen ? "" : grundText.trim(),
      abwesenheitAufheben: abwesend,
    });
    onClose();
  };
  const name = (e) => e.person ? `${e.person.vorname} ${e.person.nachname}` : "Unbekannte Person";
  const farbe = (s) => s === "recht" ? C.danger : s === "achtung" ? C.warn : C.dim;

  const Befund = ({ b }) => (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 8 }}>
      <Pill size="sm" tone={(WARNSTUFEN[b.stufe] || WARNSTUFEN.hinweis).ton}>{(WARNSTUFEN[b.stufe] || WARNSTUFEN.hinweis).label}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: farbe(b.stufe), lineHeight: 1.45 }}>{b.text}</div>
        {b.quelle && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 2 }}>Grundlage: {b.quelle}</div>}
      </div>
    </div>);

  return (
    <Sheet open onClose={onClose} titel={vorgang.titel || "Bitte prüfen"} width={720}>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55, marginBottom: 16 }}>
        {mehrere
          ? `${eintraege.filter((e) => !ernst(e)).length} von ${eintraege.length} Einträgen sind regelkonform und vorausgewählt. Einträge mit Befund kannst du einzeln dazunehmen.`
          : "CENTRIC sperrt nicht. Lies, was gegen die Einteilung spricht, und entscheide: ändern oder dennoch fortfahren."}
      </div>

      {eintraege.map((e, i) => (!mehrere || ernst(e) || e.befunde.length > 0) && (
        <div key={i} className="karte" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: e.befunde.length ? 10 : 0 }}>
            {mehrere && (
              <input type="checkbox" checked={auswahl.has(i)} onChange={() => umschalten(i)}
                aria-label={`${name(e)} am ${fKurz(e.datum)} übernehmen`} />)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{name(e)}</div>
              <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>
                {fLang(e.datum)} · {e.da ? `${e.da.name} ${e.da.start}–${e.da.ende}` : e.dienstId}</div>
            </div>
          </div>
          {e.technisch && <div style={{ fontSize: 13, color: C.danger }}>{e.technisch}</div>}
          {e.befunde.map((b, k) => <Befund key={k} b={b} />)}
        </div>))}

      {mehrere && eintraege.every((e) => !ernst(e) && !e.befunde.length) && (
        <div style={{ fontSize: 13.5, color: C.ok, marginBottom: 12 }}>Alle Einträge sind regelkonform.</div>)}

      {folgen.length > 0 && (
        <div style={{ margin: "6px 0 14px" }}>
          <Lab style={{ marginBottom: 8 }}>Folgen</Lab>
          {folgen.map((h, k) => (
            <div key={k} style={{ fontSize: 13, marginBottom: 5,
              color: h.art === "danger" ? C.danger : h.art === "warn" ? C.warn : C.dim }}>{h.text}</div>))}
        </div>)}

      {andere.length > 0 && stufe && stufeRang(stufe) >= 2 && (
        <div style={{ margin: "6px 0 14px" }}>
          <Lab style={{ marginBottom: 8 }}>Andere Wege ohne Befund</Lab>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {andere.map((x) => (
              <Btn key={x.person.id} size="sm" onClick={() => { vorgang.alternative(x.person.id); onClose(); }}>
                {x.person.vorname} {x.person.nachname} einteilen</Btn>))}
          </div>
        </div>)}

      {abwesend && (
        <div style={{ fontSize: 13, color: abwesenheitGesperrt ? C.danger : C.dim, background: C.bg, borderRadius: 10, padding: "10px 12px", margin: "6px 0 14px", lineHeight: 1.5 }}>
          {abwesenheitGesperrt
            ? "Eine Abwesenheit kann nur die Planung oder die Leitung aufheben. Bitte dort melden oder einen anderen Weg wählen."
            : "Die Abwesenheit wird für diesen Tag aufgehoben und die Person benachrichtigt. Der übrige Zeitraum bleibt bestehen."}
        </div>)}

      {technisch.length > 0 && (
        <div style={{ fontSize: 13, color: C.danger, margin: "6px 0 14px", lineHeight: 1.5 }}>
          Das geht technisch nicht: Die Person ist an diesem Tag nicht beschäftigt. Prüfe Eintritt und Austritt unter Personal.
        </div>)}

      {geschuetzt.length > 0 && !technisch.length && (
        <div style={{ fontSize: 13, color: C.danger, margin: "6px 0 14px", lineHeight: 1.5 }}>
          Für diese Einteilung gilt eine sperrende Regel (Schutz, Einschränkung, gesetzliche Qualifikation,
          Einweisung oder Ruhezeit unter 11 Stunden). Sie lässt sich nicht bestätigen — bitte einen anderen Weg wählen.
        </div>)}

      {recht && !technisch.length && !geschuetzt.length && (
        <div className="karte" style={{ padding: 14, margin: "6px 0 14px" }}>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, cursor: "pointer" }}>
            <input type="checkbox" checked={gelesen} onChange={(e) => setGelesen(e.target.checked)} />
            Ich habe den Hinweis gelesen. Die Einteilung verstößt gegen eine gesetzliche Vorgabe; die Verantwortung liegt beim Arbeitgeber.
          </label>
          {!uebersprungen && (
            <div style={{ marginTop: 12 }}>
              <Lab style={{ marginBottom: 6 }}>Grund (freiwillig)</Lab>
              <Sel value={grundArt} onChange={(e) => setGrundArt(e.target.value)} aria-label="Grund für die Abweichung">
                <option value="">Grund wählen …</option>
                {ABWEICHUNG_GRUENDE.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</Sel>
              {grund && <Inp value={grundText} onChange={(e) => setGrundText(e.target.value)}
                placeholder={grund.feld} aria-label={grund.feld} style={{ marginTop: 8 }} />}
            </div>)}
          <div style={{ marginTop: 10 }}>
            <Btn size="sm" kind="quiet" onClick={() => setUebersprungen(!uebersprungen)}>
              {uebersprungen ? "Doch einen Grund angeben" : "Überspringen"}</Btn>
          </div>
        </div>)}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
        <Btn kind="quiet" onClick={onClose}>Ändern</Btn>
        <Btn kind={recht ? "danger" : stufe === "achtung" ? "warn" : "primary"} disabled={!kann} onClick={ausfuehren}>
          {mehrere ? `${knopf} (${gewaehlt.length})` : knopf}</Btn>
      </div>
      {vorgang.fussnote && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>{vorgang.fussnote}</div>}
    </Sheet>);
}

const MITTEL_ARTEN = [["schluessel", "Schlüssel"], ["fahrzeug", "Fahrzeug"], ["geraet", "Gerät"],
  ["kleidung", "Dienstkleidung"], ["sonstiges", "Sonstiges"]];

function Betriebsmittel({ sitz, akt }) {
  const m = sitz.mandant;
  const [neu, setNeu] = useState(false);
  const [f, setF] = useState({ art: "schluessel", name: "", kennung: "", personId: "" });
  const liste = m.betriebsmittel || [];
  const darfPflegen = darf(sitz, "staff.edit") || darf(sitz, "org.edit");
  const jeArt = Object.fromEntries(MITTEL_ARTEN.map(([id]) => [id, liste.filter((x) => x.art === id).length]));
  const ausgegeben = liste.filter((x) => x.personId).length;

  return (
    <div>
      <H1 rubrik="Betrieb" sub="Schlüssel, Fahrzeuge, Geräte und Dienstkleidung — wer hat was, seit wann."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(true)}>Betriebsmittel anlegen</Btn>}>
        Betriebsmittel</H1>

      <Kennzahlen min={160} kacheln={[
        { label: "Erfasst", wert: liste.length },
        { label: "Ausgegeben", wert: ausgegeben, ton: ausgegeben ? "accent" : undefined,
          sub: `${liste.length - ausgegeben} im Bestand` },
        ...MITTEL_ARTEN.slice(0, 3).map(([id, l]) => ({ label: l, wert: jeArt[id] || 0 }))]} />

      <Card>
        {liste.length === 0
          ? <Leer titel="Noch nichts erfasst" text="Lege Schlüssel, Fahrzeuge oder Geräte an und weise sie Personen zu." />
          : liste.map((x, i) => {
            const p = x.personId && m.personen.find((y) => y.id === x.personId);
            return (
              <Ziehbar key={x.id} className="row" aktiv={darfPflegen}
                nutzlast={{ art: "mittel", mittelId: x.id, beschriftung: x.name, farbe: C.accentDeep }}
                style={{ display: "flex", alignItems: "center", gap: 16,
                padding: "14px 22px", borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                flexWrap: "wrap" }}>
                <Pill size="sm">{(MITTEL_ARTEN.find(([id]) => id === x.art) || [])[1]}</Pill>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{x.name}</div>
                  {x.kennung && <div style={{ fontSize: 12.5, color: C.dimmer, ...NUM }}>{x.kennung}</div>}
                </div>
                {darfPflegen
                  ? <Sel value={x.personId || ""} style={{ width: 220 }}
                      onChange={(e) => akt.setzeMittel(x.id, "personId", e.target.value || null)}>
                      <option value="">— im Bestand —</option>
                      {m.personen.filter((y) => imDienst(y, heute())).map((y) => (
                        <option key={y.id} value={y.id}>{y.nachname}, {y.vorname}</option>))}
                    </Sel>
                  : <Pill size="sm" tone={p ? "accent" : "neutral"}>{p ? `${p.nachname}` : "im Bestand"}</Pill>}
                {x.seit && <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>seit {fKurz(x.seit)}</span>}
                {darfPflegen && <Btn size="sm" kind="danger" onClick={() => akt.loescheMittel(x.id)} aria-label="Entfernen" title="Entfernen"><Icon n="x" size={14} strokeWidth={2.2} /></Btn>}
              </Ziehbar>);
          })}
      </Card>

      {darfPflegen && (<>
        <Lab style={{ margin: "24px 0 11px" }}>Ausgabe per Ziehen</Lab>
        <div style={{ fontSize: 12.5, color: C.dimmer, marginBottom: 12, lineHeight: 1.5 }}>
          Ein Betriebsmittel aus der Liste oben auf eine Person ziehen gibt es aus.
          Auf „Zurück in den Bestand" ziehen nimmt es zurück.
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Ablage id="mittel:bestand" nimmt={(l) => l.art === "mittel"}
            ablegen={(l) => akt.setzeMittel(l.mittelId, "personId", null)} style={{ borderRadius: 14 }}>
            <div className="karte" style={{ padding: "12px 16px", fontSize: 13.5, color: C.dim }}>
              Zurück in den Bestand</div>
          </Ablage>
          {m.personen.filter((p) => imDienst(p, heute())).slice(0, 24).map((p) => (
            <Ablage key={p.id} id={`mittel:p:${p.id}`} nimmt={(l) => l.art === "mittel"}
              ablegen={(l) => akt.setzeMittel(l.mittelId, "personId", p.id)} style={{ borderRadius: 14 }}>
              <div className="karte" style={{ padding: "12px 16px", fontSize: 13.5 }}>
                {p.nachname}, {p.vorname.slice(0, 1)}.
                <span style={{ color: C.dimmer, marginLeft: 7, ...NUM }}>
                  {liste.filter((x) => x.personId === p.id).length || ""}</span>
              </div>
            </Ablage>))}
        </div>
      </>)}

      <Sheet open={neu} onClose={() => setNeu(false)} titel="Betriebsmittel anlegen" width={520}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Art"><Sel value={f.art} onChange={(e) => setF({ ...f, art: e.target.value })}>
              {MITTEL_ARTEN.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Sel></Field>
            <Field label="Kennung" hint="Nummer, Kennzeichen oder Barcode.">
              <Inp value={f.kennung} onChange={(e) => setF({ ...f, kennung: e.target.value })} /></Field>
          </div>
          <Field label="Bezeichnung"><Inp value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="z. B. Generalschlüssel Haupthaus" /></Field>
          <Field label="Ausgegeben an" hint="Kann später jederzeit geändert werden.">
            <Sel value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}>
              <option value="">— im Bestand —</option>
              {m.personen.filter((y) => imDienst(y, heute())).map((y) => (
                <option key={y.id} value={y.id}>{y.nachname}, {y.vorname}</option>))}</Sel></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" disabled={!f.name.trim()} onClick={() => {
              akt.neuesMittel(f); setF({ art: "schluessel", name: "", kennung: "", personId: "" }); setNeu(false); }}>
              Anlegen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

/* ==========================================================================
   KOMMANDOLEISTE
   Bei vielen Ansichten ist Tippen schneller als Klicken.
   ========================================================================== */
function Kommandoleiste({ sitz, nav, akt, offen, onClose, gehZu, oeffneTag, oeffnePerson }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const feld = useRef(null);
  const treffer = useMemo(() => kommandoSuche(sitz, nav, q), [sitz.mandant, q, nav]);

  useEffect(() => { if (offen && feld.current) { feld.current.focus(); setQ(""); setI(0); } }, [offen]);
  useEffect(() => { setI(0); }, [q]);

  const waehlen = (t) => {
    if (!t) return;
    onClose();
    if (t.art === "ansicht") gehZu(t.id);
    else if (t.art === "person") oeffnePerson(t.id);
    else if (t.art === "datum") oeffneTag(t.id);
    else if (t.art === "aktion") {
      if (t.id === "krank") akt.oeffneKrankmeldung(null);
      else if (t.id === "verfuegbarkeit") akt.oeffneVerfuegbarkeit(sitz.person.id);
      else if (t.id === "assistent") akt.oeffneAssistent();
      else if (t.id === "wizard") akt.oeffneWizard();
      else if (t.id === "aushang") akt.aushangPDF(heute().slice(0, 7),
        sitz.person.bereich !== "ALLE" ? sitz.person.bereich : (sitz.mandant.einheiten.find((x) => !x.pool) || {}).id);
      else if (t.id === "feldmodus") akt.setzeKontrastmodus(!sitz.person.kontrastmodus);
    }
    /* Ein verstandener Satz: Ansicht öffnen und mitgeben, was schon bekannt
       ist. Ausgeführt wird nichts — die Entscheidung bleibt beim Menschen. */
    else if (t.art === "satz") {
      const v = t.satz;
      const p = v.personen[0];
      if (v.befehl.id === "krank" && p) akt.oeffneKrankmeldung(p.id,
        v.zeitraum ? v.zeitraum.von : v.datum || heute(),
        v.zeitraum ? v.zeitraum.bis : v.datum || heute());
      else if (v.befehl.id === "person" && p) oeffnePerson(p.id);
      else if (v.befehl.id === "urlaub" && p) akt.oeffneAbwesenheit(p.id, "urlaub",
        v.zeitraum ? v.zeitraum.von : v.datum, v.zeitraum ? v.zeitraum.bis : v.datum);
      else if ((v.befehl.id === "lage" || v.befehl.id === "wer") && v.datum) oeffneTag(v.datum);
      else gehZu(v.befehl.ziel);
    }
    else if (t.art === "unklar") { /* nichts tun — die Zeile bleibt offen */ }
  };

  if (!offen) return null;
  const SYM = { ansicht: "pfeil-rechts", person: "person", datum: "kalender", aktion: "stift", satz: "pfeil-rechts", unklar: "info" };
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Schnellsuche" style={{ position: "fixed", inset: 0, zIndex: 95, padding: "12vh 20px 20px",
      background: "var(--c-ueberlagerung)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}>
      <div onClick={(e) => e.stopPropagation()} className="blatt"
        style={{ maxWidth: 620, margin: "0 auto", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex",
          alignItems: "center", gap: 13 }}>
          <span aria-hidden="true" style={{ color: C.dimmer, display: "flex" }}><Icon n="suche" size={18} /></span>
          {/* Die Trefferliste wird mit Pfeiltasten bedient, nicht mit der
              Tabulatortaste. Für eine Vorlesesoftware ist das nur dann
              nachvollziehbar, wenn Feld und Liste als zusammengehörig
              ausgezeichnet sind: Das Feld nennt die Liste, die Liste nennt
              die gerade hervorgehobene Zeile. */}
          <input ref={feld} value={q} onChange={(e) => setQ(e.target.value)}
            role="combobox" aria-expanded={treffer.length > 0} aria-controls="suchtreffer"
            aria-autocomplete="list" aria-label="Ansicht, Person, Datum oder Aktion suchen"
            aria-activedescendant={treffer.length ? `suchtreffer-${i}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(treffer.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); waehlen(treffer[i]); }
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Ansicht, Person, Datum oder Aktion …"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent",
              fontFamily: FONT, fontSize: 17, color: C.text }} />
          <kbd style={{ fontSize: 11, color: C.dimmer, background: C.lineSoft,
            padding: "3px 7px", borderRadius: 6, ...NUM }}>Esc</kbd>
        </div>
        <div id="suchtreffer" role="listbox" aria-label="Treffer"
          style={{ maxHeight: "52vh", overflowY: "auto" }}>
          {treffer.length === 0
            ? <div style={{ padding: 30, textAlign: "center", color: C.dimmer, fontSize: 14 }}>
                Nichts gefunden. Suche nach einer Ansicht, einem Nachnamen oder einem Datum wie 16.9.
              </div>
            : treffer.map((t, k) => (
              <div key={k} id={`suchtreffer-${k}`} role="option" aria-selected={i === k}
                onMouseEnter={() => setI(k)} onClick={() => waehlen(t)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", cursor: "pointer",
                  background: i === k ? "rgba(43,44,37,.07)" : "transparent" }}>
                <span style={{ width: 27, height: 27, borderRadius: 9, flexShrink: 0, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.bg, color: C.dim }}><Icon n={SYM[t.art] || "info"} size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: i === k ? 620 : 500 }}>{t.titel}</div>
                  <div style={{ fontSize: 12, color: C.dimmer }}>{t.unter}</div>
                </div>
                {i === k && <kbd style={{ fontSize: 11, color: C.dimmer, ...NUM }}>↵</kbd>}
              </div>))}
        </div>
        <div style={{ padding: "11px 22px", borderTop: `1px solid ${C.lineSoft}`, fontSize: 11.5,
          color: C.dimmer, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <span>↑↓ wählen</span><span>↵ öffnen</span><span>Strg + K jederzeit</span>
        </div>
      </div>
    </div>);
}

/* ======================== QUALIFIKATIONSMATRIX ========================= */
/* ==========================================================================
   KOMPETENZEN

   Was jemand an einer bestimmten Sache darf. Die Ansicht führt drei Dinge
   zusammen, die bisher nebeneinanderlagen: das Betriebsmittel, die
   Einweisung darauf und die Dienstart, für die sie Voraussetzung ist.
   ========================================================================== */
const KOMPETENZ_ARTEN = [
  ["geraet", "Gerät", "Einweisung auf ein bestimmtes Betriebsmittel — § 4 MPBetreibV, § 12 BetrSichV"],
  ["anlage", "Anlage", "Freigabe für eine Anlage oder Spannungsebene, etwa eine Schaltberechtigung"],
  ["taetigkeit", "Tätigkeit", "Freigabe für eine Verrichtung ohne festes Gerät, etwa Behandlungspflege"],
];

/* --------------------------------------------------------------------------
   PPP-RL — therapeutisches Personal je Woche

   Steht in derselben Ansicht wie die PpUGV, weil beide dieselbe Frage
   beantworten: Ist genug Personal da, um behandeln zu dürfen? Gerechnet
   wird anders — nicht Köpfe je Schicht, sondern Minuten je Patient und
   Woche, aufgeteilt auf Berufsgruppen.
   -------------------------------------------------------------------------- */
function Therapieminuten({ sitz, akt, einheit }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "plan.edit.unit");
  const [woche, setWoche] = useState(montag(heute()));
  const e = (m.therapie || {})[`${einheit.id}|${woche}`] || {};

  const lage = useMemo(() => pppPruefen({
    bereich: einheit.pppBereich || null, art: einheit.pppArt || "vollstationaer",
    datum: woche, patienten: e.patienten === undefined ? null : e.patienten,
    minuten: e.minuten || {},
  }), [einheit, e, woche]);

  const ton = lage.urteil === "rot" ? "danger" : lage.urteil === "gelb" ? "warn"
    : lage.urteil === "grau" ? undefined : "ok";

  return (
    <div>
      <Card style={{ marginBottom: 22 }}>
        <div style={{ padding: "20px var(--pad-x)", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16 }}>
          <Field label="Behandlungsbereich">
            <Sel value={einheit.pppBereich || ""} disabled={!darf(sitz, "org.edit")}
              onChange={(ev) => akt.setzeEinheitPpp(einheit.id, ev.target.value || null, einheit.pppArt)}>
              <option value="">— kein Bereich der PPP-RL —</option>
              {PPP_BEREICHE.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Sel></Field>
          <Field label="Behandlungsart">
            <Sel value={einheit.pppArt || "vollstationaer"} disabled={!darf(sitz, "org.edit")}
              onChange={(ev) => akt.setzeEinheitPpp(einheit.id, einheit.pppBereich, ev.target.value)}>
              {PPP_ARTEN.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel></Field>
          <Field label="Woche">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn size="sm" onClick={() => setWoche(addDays(woche, -7))} aria-label="Woche zurück"><Icon n="chevron-links" size={16} /></Btn>
              <span style={{ fontSize: 13, ...NUM }}>{fKurz(woche)}–{fKurz(addDays(woche, 6))}</span>
              <Btn size="sm" onClick={() => setWoche(addDays(woche, 7))} aria-label="Woche vor"><Icon n="chevron-rechts" size={16} /></Btn>
            </div>
          </Field>
          <Field label="Patientinnen und Patienten"
            hint="Belegung im Wochenmittel. Leer heißt: nicht erhoben.">
            <Inp type="number" min="0" step="0.5" disabled={!darfPflegen}
              value={e.patienten ?? ""} placeholder="—"
              onChange={(ev) => akt.setzeTherapie(einheit.id, woche, "patienten", ev.target.value)} /></Field>
        </div>
      </Card>

      {!einheit.pppBereich ? (
        <Card><Leer titel="Kein Bereich der PPP-RL hinterlegt"
          text="Die Richtlinie gilt für die stationäre Psychiatrie, die Kinder- und Jugendpsychiatrie und die Psychosomatik. Wähle oben den Bereich, dann wird geprüft." /></Card>
      ) : (<>
        <Hinweisband ton={ton === "danger" ? "danger" : ton === "warn" ? "warn" : ton === "ok" ? "ok" : "accent"}
          icon={ton === "ok" ? "kreis-haken" : ton ? "warnung" : "info"}
          titel={<Pill size="sm" tone={ton}>
            {lage.urteil === "rot" ? "unter der Mindesterfüllung"
              : lage.urteil === "gelb" ? "unter der Vorgabe"
              : lage.urteil === "grau" ? "nicht bewertbar" : "erfüllt"}</Pill>}>
          <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.6 }}>{lage.text}</div>
          {lage.luecken && lage.luecken.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.warn, marginTop: 8 }}>
              Nicht erfasst: {lage.luecken.join(", ")}.</div>)}
        </Hinweisband>

        <Card>
          <CardHead right={<Lab>Minuten in dieser Woche</Lab>}>Berufsgruppen</CardHead>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: C.dim }}>
                {["Berufsgruppe", "Soll", "Ist", "Erfüllung"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600 }}>{h}</th>))}
              </tr></thead>
              <tbody>
                {(lage.zeilen || PPP_GRUPPEN.map((g) => ({ gruppe: g, soll: 0, ist: null, quote: null })))
                  .map((z) => {
                  const farbe = z.quote === null ? C.dimmer
                    : z.quote >= 1 ? C.ok : z.quote >= PPP_MINDEST ? C.warn : C.danger;
                  return (
                    <tr key={z.gruppe.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                      <td style={{ padding: "8px 14px" }}>{z.gruppe.name}</td>
                      <td style={{ padding: "8px 14px", ...NUM }}>{z.soll ? zahl(z.soll) : "—"}</td>
                      <td style={{ padding: "6px 14px" }}>
                        <Inp type="number" min="0" style={{ width: 96, padding: "6px 8px" }}
                          disabled={!darfPflegen}
                          value={(e.minuten || {})[z.gruppe.id] ?? ""} placeholder="—"
                          onChange={(ev) => akt.setzeTherapie(einheit.id, woche, z.gruppe.id, ev.target.value)}
                          aria-label={`Minuten ${z.gruppe.name} in der Woche ab ${woche}`} /></td>
                      <td style={{ padding: "8px 14px", minWidth: 150 }}>
                        <div style={{ color: farbe, fontWeight: 600, ...NUM }}>
                          {z.quote === null ? "nicht erfasst" : `${Math.round(z.quote * 100)} %`}</div>
                        {z.quote !== null && (
                          <div style={{ marginTop: 5 }}>
                            <Fortschritt wert={Math.min(100, z.quote * 100)} hoehe={5}
                              ton={z.quote >= 1 ? "ok" : z.quote >= PPP_MINDEST ? "warn" : "danger"}
                              label={`${z.gruppe.name}: ${Math.round(z.quote * 100)} Prozent Erfüllung`} /></div>)}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Erklaerkasten style={{ marginTop: 16 }}>
          <b style={{ color: C.text }}>Wonach gerechnet wird.</b>{" "}
          Die PPP-RL gibt Minuten je Patientin und Woche vor, getrennt nach
          Berufsgruppen. Unter {Math.round(PPP_MINDEST * 100)} Prozent Erfüllung drohen
          Vergütungsabschläge; dazwischen liegt der Bereich, in dem die Vorgabe verfehlt,
          die Mindesterfüllung aber gehalten ist.
          <div style={{ marginTop: 10 }}>
            Grundlage: {lage.richtwerte ? lage.richtwerte.fassung : "—"}
            {lage.richtwerte && lage.richtwerte.eigen ? " · von der Einrichtung angepasst" : ""}.
            Das Nachweisverfahren gegenüber den Kassen wurde zum 1. Januar 2026 umgestellt
            und läuft jährlich über eine eigene Spezifikation — was hier entsteht, ist die
            Grundlage dafür, nicht die Meldung selbst.
          </div>
        </Erklaerkasten>
      </>)}
    </div>);
}

function Untergrenzen({ sitz, akt, ym }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "plan.edit.unit");
  const einheiten = (m.einheiten || []).filter((e) => !e.pool);
  const [einheitId, setEinheitId] = useState((einheiten[0] || {}).id || "");
  const einheit = einheiten.find((e) => e.id === einheitId) || null;
  /* Zwei Vorgaben, eine Ansicht: die PpUGV rechnet je Schicht, die PPP-RL je
     Woche. Welche gilt, hängt am Bereich der Einheit — beide anzubieten ist
     ehrlicher, als eine zu verstecken. */
  const [reiter, setReiter] = useState("ppugv");
  const tage = useMemo(() => {
    const [y, mo] = ym.split("-").map(Number);
    return Array.from({ length: dim_(y, mo - 1) }, (_, i) => `${ym}-${pad(i + 1)}`);
  }, [ym]);

  const zeilen = useMemo(() => ppugvZeilen(m, einheit, tage), [m, einheit, tage]);
  const lage = useMemo(() => ppugvMonatslage(zeilen), [zeilen]);
  const bereich = einheit && einheit.ppugvBereich ? ppugvBereich(einheit.ppugvBereich) : null;

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Die Pflegepersonaluntergrenzen gelten je Schicht, nicht im Monatsmittel. Geprüft wird gegen die Ist-Belegung — ohne sie steht „nicht bewertbar“, nie „eingehalten“.">
        Untergrenzen · {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</H1>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ padding: "20px var(--pad-x)", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          <Field label={m.einheitLabel || "Einheit"}>
            <Sel value={einheitId} onChange={(e) => setEinheitId(e.target.value)}>
              {einheiten.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Sel></Field>
          <Field label="Pflegesensitiver Bereich"
            hint="Ohne Bereich gilt keine Untergrenze — und es lässt sich keine prüfen.">
            <Sel value={(einheit || {}).ppugvBereich || ""} disabled={!einheit || !darf(sitz, "org.edit")}
              onChange={(e) => akt.setzeEinheitBereich(einheit.id, e.target.value || null)}>
              <option value="">— kein pflegesensitiver Bereich —</option>
              {PPUGV_BEREICHE.map((b) => (
                <option key={b.id} value={b.id}>{b.name} · {b.paragraf}</option>))}</Sel></Field>
        </div>
      </Card>

      <div className="reiterreihe" style={{ margin: "0 0 16px" }}>
        <Seg value={reiter} onChange={setReiter}
          options={[{ id: "ppugv", label: "Pflegepersonaluntergrenzen" }, { id: "ppprl", label: "PPP-RL Psychiatrie" }]} />
      </div>

      {reiter === "ppprl" && (einheit
        ? <Therapieminuten sitz={sitz} akt={akt} einheit={einheit} />
        : <Card><Leer titel="Keine Einheit gewählt" text="Wähle oben eine Einheit." /></Card>)}

      {reiter === "ppugv" && (!bereich ? (
        <Card><Leer titel="Kein pflegesensitiver Bereich hinterlegt"
          text="Die PpUGV gilt für bestimmte Krankenhausbereiche — Intensivmedizin, Geriatrie, Kardiologie und weitere. Wähle oben den Bereich dieser Einheit, dann wird geprüft." /></Card>
      ) : (<>
        <Kennzahlen kacheln={[
          { label: "Eingehalten", wert: lage.gruen, ton: "ok", sub: `von ${zahl(lage.gesamt)} Schichten` },
          { label: "Unterschritten", wert: lage.rot, ton: lage.rot ? "danger" : "ok",
            hervor: lage.rot ? "danger" : undefined, sub: "meldepflichtig gegenüber den Kassen" },
          { label: "Nicht bewertbar", wert: lage.grau, ton: "neutral", sub: "Belegung fehlt" },
          { label: "Schlüssel", wert: `${(bereich.name || "").slice(0, 18)}`, sub: bereich.paragraf }]} />

        <Leitraster seiteBreite={340}
          haupt={
            <Card>
              <CardHead right={<Lab>Belegung eintragen, auch nachträglich</Lab>}>
                {MON[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</CardHead>
              <div style={{ overflowX: "auto" }}>
                <table className="raster" style={{ minWidth: 640 }}>
                  <thead><tr>
                    {["Tag", "Schicht", "Patienten", "Fachkräfte", "Hilfskräfte", "Nötig", "Urteil"].map((h) => (
                      <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {zeilen.map((z) => (
                      <tr key={`${z.datum}|${z.schicht}`}
                        style={z.urteil === "rot" ? { background: C.dangerLight } : undefined}>
                        <td style={{ whiteSpace: "nowrap", ...NUM }}>{fKurz(z.datum)}</td>
                        <td>{z.schicht === "nacht" ? "Nacht" : "Tag"}</td>
                        <td>
                          <Inp type="number" min="0" style={{ width: 82, padding: "6px 8px", minHeight: 34 }}
                            disabled={!darfPflegen}
                            value={(m.belegung || {})[`${einheit.id}|${z.datum}|${z.schicht}`]?.patienten ?? ""}
                            onChange={(e) => akt.setzeBelegung(einheit.id, z.datum, z.schicht, e.target.value)}
                            aria-label={`Patienten am ${z.datum}, ${z.schicht === "nacht" ? "Nacht" : "Tag"}`} />
                        </td>
                        <td style={NUM}>{z.fachkraefte ?? "—"}</td>
                        <td style={NUM}>
                          {z.hilfskraefte ?? "—"}
                          {z.hilfskraefteNichtAngerechnet > 0 && (
                            <span style={{ color: C.warn, fontSize: 11.5 }}>
                              {" "}(−{z.hilfskraefteNichtAngerechnet})</span>)}
                        </td>
                        <td style={NUM}>{z.noetig ?? "—"}</td>
                        <td>
                          {/* Nicht bewertbar ist ein eigener Zustand: grau, kein Verstoß und keine Einhaltung. */}
                          <span title={z.text} style={{ display: "inline-flex" }}>
                            <Pill size="sm" ton={z.urteil === "rot" ? "danger" : z.urteil === "grau" ? "neutral" : "ok"}>
                              {z.urteil === "rot" ? `unterschritten um ${z.fehlend}`
                                : z.urteil === "grau" ? "nicht bewertbar" : "eingehalten"}</Pill></span>
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </Card>}
          seite={<>
            <Seitenkarte titel="Schichten im Monat"
              sub={`${zahl(zeilen.length)} Schichten, Tag und Nacht`}>
              <Sparkline art="punkte" hoehe={60}
                daten={zeilen.map((z) => (z.urteil === "gruen" ? "ok" : z.urteil === "rot" ? "danger" : ""))}
                beschriftung={`${lage.gruen} Schichten eingehalten, ${lage.rot} unterschritten, ${lage.grau} nicht bewertbar`} />
              <Legende style={{ marginTop: 12 }} punkte={[
                { ton: "ok", label: "eingehalten" }, { ton: "danger", label: "unterschritten" },
                { ton: "neutral", label: "nicht bewertbar", farbig: false }]} />
            </Seitenkarte>
            <Erklaerkasten>
              <b style={{ color: C.text }}>Wonach gerechnet wird.</b>{" "}
              {bereich.paragraf}: höchstens {(zeilen[0] || {}).grenze?.patientenJeKraft ?? "—"} Patienten
              je Pflegekraft in der Tagschicht, in der Nacht entsprechend weniger.
              Pflegehilfskräfte zählen nur bis zu
              {" "}{Math.round(((zeilen[0] || {}).grenze?.hilfskraftAnteil ?? 0) * 100)} Prozent
              des Personals mit. Aufgerundet wird immer zur nächsten ganzen Kraft.
              <div style={{ marginTop: 10 }}>
                Die Fassung ist datiert hinterlegt: {(zeilen[0] || {}).grenze?.fassung || "—"}.
                Ändert sich die Verordnung, kommt ein neuer Satz dazu — der alte bleibt
                stehen, damit vergangene Monate nach dem Recht ihrer Zeit beurteilt werden.
              </div>
            </Erklaerkasten>
          </>} />
      </>))}
    </div>);
}

function Kompetenzen({ sitz, akt }) {
  const m = sitz.mandant;
  const darfPflegen = darf(sitz, "staff.edit");
  const [neu, setNeu] = useState(null);
  const [offen, setOffen] = useState(null);
  const [aufgabe, setAufgabe] = useState(null);
  const lage = useMemo(() => kompetenzLage(m), [m]);
  const liste = m.kompetenzen || [];
  const mittel = m.betriebsmittel || [];

  const leer = { name: "", art: "geraet", betriebsmittelId: "", stufe: "",
    freigabeStelle: "", wiederholungMonate: "", grundlage: "", pflichtFuer: [], zugedacht: [] };

  return (
    <div>
      <H1 rubrik="Personal"
        sub="Eine Qualifikation sagt, was jemand ist. Eine Kompetenz sagt, was jemand an einer bestimmten Sache darf — an diesem Gerät, an dieser Anlage. Das Recht verlangt die Einweisung je Gerät, nicht einmal im Leben."
        right={darfPflegen && <Btn kind="primary" onClick={() => setNeu(leer)}>Kompetenz anlegen</Btn>}>
        Kompetenzen</H1>

      <Kennzahlen min={180} kacheln={[
        { label: "Kompetenzen", wert: liste.length },
        { label: "Abgelaufen", wert: lage.abgelaufen.length, ton: lage.abgelaufen.length ? "danger" : "ok",
          hervor: lage.abgelaufen.length ? "danger" : undefined, sub: "Einsatz gesperrt, wo verlangt" },
        { label: "Laufen bald ab", wert: lage.bald.length, ton: lage.bald.length ? "warn" : "ok",
          sub: `in ${KOMPETENZ_VORLAUF} Tagen` },
        { label: "Fehlen", wert: lage.fehlt.length, ton: lage.fehlt.length ? "warn" : "ok",
          sub: "zugedacht, aber nicht erteilt" }]} />

      {liste.length === 0 ? (
        <Card>
          <Leer titel="Noch keine Kompetenz angelegt"
            text="Typische Fälle: die Einweisung auf ein Beatmungsgerät, die Schaltberechtigung für eine Anlage, die Freigabe für eine Tour. Wer eine Kompetenz an eine Dienstart hängt, verhindert die Einteilung ohne sie."
            aktion={darfPflegen && <Btn kind="primary" onClick={() => setNeu(leer)}>Kompetenz anlegen</Btn>} />
        </Card>
      ) : (
        <Card>
          <CardHead right={<Lab>{zahl(liste.length)} angelegt</Lab>}>Übersicht</CardHead>
          {liste.map((k, i) => {
            const bm = mittelZuKompetenz(m, k);
            const maengel = kompetenzMaengel(k);
            const traeger = m.personen.filter((p) => imDienst(p, heute())
              && kompetenzGilt(k, kompetenzNachweis(p, k.id), heute()));
            const auf = offen === k.id;
            return (
              <div key={k.id} style={{ borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div className="row" {...klickbar(() => setOffen(auf ? null : k.id))}
                  aria-expanded={auf}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{k.name || "Ohne Namen"}</div>
                    <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3 }}>
                      {(KOMPETENZ_ARTEN.find((a) => a[0] === k.art) || [])[1] || "Tätigkeit"}
                      {bm ? ` · ${bm.name}${bm.kennung ? ` (${bm.kennung})` : ""}` : ""}
                      {k.freigabeStelle ? ` · Freigabe: ${k.freigabeStelle}` : ""}
                    </div>
                  </div>
                  <Pill size="sm" tone={traeger.length ? "ok" : "warn"}>{zahl(traeger.length)} Personen</Pill>
                  {(k.pflichtFuer || []).length > 0 && (
                    <Pill size="sm" tone="danger">
                      Voraussetzung für {k.pflichtFuer.map((id) =>
                        (m.dienstarten.find((d) => d.id === id) || {}).kurz || id).join(", ")}</Pill>)}
                  {k.wiederholungMonate
                    ? <Pill size="sm">alle {k.wiederholungMonate} Monate</Pill>
                    : <Pill size="sm">ohne Frist</Pill>}
                  {maengel.some((x) => x.schwere === "warn") && <Pill size="sm" tone="warn">unvollständig</Pill>}
                  <span aria-hidden="true" style={{ color: C.dimmer, display: "flex" }}>{auf ? <Icon n="chevron-unten" size={18} /> : <Icon n="chevron-rechts" size={18} />}</span>
                </div>

                {auf && (
                  <div style={{ padding: "0 22px 20px" }}>
                    {k.grundlage && (
                      <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
                        <b style={{ color: C.text }}>Grundlage:</b> {k.grundlage}</div>)}
                    {maengel.map((x, j) => (
                      <div key={j} style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.5,
                        color: x.schwere === "warn" ? C.warn : C.dim }}>{x.text}</div>))}

                    <Lab style={{ margin: "14px 0 8px" }}>Wer sie hat</Lab>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {m.personen.filter((p) => imDienst(p, heute())).map((p) => {
                        const st = kompetenzStand(k, kompetenzNachweis(p, k.id), heute());
                        const ton = st.stand === "gueltig" ? "ok" : st.stand === "laeuft_ab" ? "warn"
                          : st.stand === "abgelaufen" ? "danger" : null;
                        if (!ton && !darfPflegen) return null;
                        const beschriftung = `${p.nachname}, ${p.vorname.slice(0, 1)}.`;
                        if (!darfPflegen) return <Pill key={p.id} size="sm" tone={ton}>{beschriftung}</Pill>;
                        return (
                          <Btn key={p.id} size="sm" kind={ton === "ok" ? "ok" : ton === "danger" ? "danger" : "plain"}
                            title={st.stand === "fehlt" ? "Kompetenz erteilen"
                              : st.bis ? `gültig bis ${fDatum(st.bis)}` : "unbefristet gültig"}
                            onClick={() => akt.setzeKompetenz(p.id, k.id, st.stand === "fehlt")}>
                            {beschriftung}
                            {st.stand === "abgelaufen" ? <><Icon n="x" size={13} strokeWidth={2.2} /><span className="nurLeser"> abgelaufen</span></>
                              : st.stand === "fehlt" ? null
                              : <><Icon n="haken" size={13} strokeWidth={2.2} /><span className="nurLeser"> {st.stand === "laeuft_ab" ? "läuft ab" : "gültig"}</span></>}</Btn>);
                      })}
                    </div>

                    {darfPflegen && (
                      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                        <Btn size="sm" onClick={() => setNeu({ ...k, bearbeiten: true })}>Bearbeiten</Btn>
                        <Btn size="sm" kind="danger" onClick={() => akt.loescheKompetenz(k.id)}>Löschen</Btn>
                      </div>)}
                  </div>)}
              </div>);
          })}
        </Card>)}

      {/* --- Vorbehaltene Aufgaben ---

          Sie stehen hier, weil sie dieselbe Frage beantworten wie eine
          Kompetenz — wer darf was —, nur eine Ebene höher: nicht an einem
          Gerät, sondern kraft Berufserlaubnis. */}
      <Card style={{ marginTop: 16 }}>
        <CardHead right={darfPflegen && !(m.aufgaben || []).length
          ? <Btn size="sm" onClick={akt.legeAufgabenVor}>Die drei aus § 4 PflBG anlegen</Btn>
          : <Lab>{zahl((m.aufgaben || []).length)} angelegt</Lab>}>
          Vorbehaltene Aufgaben</CardHead>
        <div style={{ padding: "0 22px 6px", fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
          Manche Tätigkeiten darf nur ausüben, wer eine bestimmte Berufserlaubnis hat.
          Anders als die Fachkraftquote — ein Anteil — ist das eine Anwesenheit:
          mindestens eine Person im Dienst, die es darf. Eine Schicht kann jede Quote
          erfüllen und trotzdem rechtswidrig sein, weil niemand da ist, der die
          Pflegeplanung verantworten darf.
        </div>
        {!(m.aufgaben || []).length ? (
          <div style={{ padding: "14px 22px 22px", fontSize: 13, color: C.dimmer }}>
            Noch keine hinterlegt.
          </div>
        ) : (m.aufgaben || []).map((a, i) => {
          const q = m.qualifikationen.find((x) => x.id === a.qualifikationId);
          return (
            <div key={a.id} className="row" style={{ display: "flex", alignItems: "center", gap: 14,
              padding: "13px 22px", flexWrap: "wrap",
              borderTop: `1px solid ${C.lineSoft}`, marginTop: i === 0 ? 10 : 0 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 3, lineHeight: 1.5 }}>
                  {a.grundlage || "Ohne Grundlage"}</div>
              </div>
              {q ? <Pill size="sm" tone="ok">{q.kurz || q.name}</Pill>
                : <Pill size="sm" tone="warn">keine Qualifikation</Pill>}
              {a.mindestens > 1 && <Pill size="sm">mindestens {a.mindestens}</Pill>}
              <Pill size="sm" tone={(a.dienstarten || []).length ? undefined : "warn"}>
                {(a.dienstarten || []).length
                  ? `geprüft bei ${a.dienstarten.map((id) =>
                      (m.dienstarten.find((d) => d.id === id) || {}).kurz || id).join(", ")}`
                  : "keinem Dienst zugeordnet"}</Pill>
              {darfPflegen && (
                <Btn size="sm" onClick={() => setAufgabe({ ...a })}>Bearbeiten</Btn>)}
            </div>);
        })}
      </Card>

      {aufgabe && (
        <Sheet open onClose={() => setAufgabe(null)} width={600} titel="Vorbehaltene Aufgabe">
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Aufgabe">
              <Inp value={aufgabe.name} onChange={(e) => setAufgabe({ ...aufgabe, name: e.target.value })} /></Field>
            <Field label="Grundlage" hint="Woraus folgt der Vorbehalt?">
              <Inp value={aufgabe.grundlage || ""}
                onChange={(e) => setAufgabe({ ...aufgabe, grundlage: e.target.value })} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 13 }}>
              <Field label="Wer darf sie ausüben?"
                hint="Ohne Qualifikation lässt sich nicht prüfen, ob jemand im Dienst ist, der es darf.">
                <Sel value={aufgabe.qualifikationId || ""}
                  onChange={(e) => setAufgabe({ ...aufgabe, qualifikationId: e.target.value || null })}>
                  <option value="">— keine —</option>
                  {m.qualifikationen.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Sel></Field>
              <Field label="Mindestens" hint="Wie viele müssen im Dienst sein?">
                <Inp type="number" min={1} value={aufgabe.mindestens || 1}
                  onChange={(e) => setAufgabe({ ...aufgabe, mindestens: Number(e.target.value) })} /></Field>
            </div>
            <div>
              <Lab style={{ marginBottom: 9 }}>Bei diesen Diensten geprüft</Lab>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {m.dienstarten.map((d) => {
                  const an = (aufgabe.dienstarten || []).includes(d.id);
                  return (
                    <Btn key={d.id} size="sm" kind={an ? "primary" : "plain"} aria-pressed={an}
                      onClick={() => setAufgabe({ ...aufgabe, dienstarten: an
                        ? aufgabe.dienstarten.filter((x) => x !== d.id)
                        : [...(aufgabe.dienstarten || []), d.id] })}>
                      {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{d.name}</Btn>);
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 6 }}>
              <Btn kind="danger" onClick={() => { akt.loescheAufgabe(aufgabe.id); setAufgabe(null); }}>Löschen</Btn>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn kind="quiet" onClick={() => setAufgabe(null)}>Abbrechen</Btn>
                <Btn kind="primary" onClick={() => { akt.speichereAufgabe(aufgabe); setAufgabe(null); }}>Speichern</Btn>
              </div>
            </div>
          </div>
        </Sheet>)}

      {neu && (
        <Sheet open onClose={() => setNeu(null)} width={620}
          titel={neu.bearbeiten ? "Kompetenz bearbeiten" : "Kompetenz anlegen"}>
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Bezeichnung" hint="Woran genau — nicht „Einweisung“, sondern „Beatmung Servo-u“.">
              <Inp value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })}
                placeholder="z. B. Beatmungsgerät Servo-u" autoFocus /></Field>

            <Field label="Art">
              <Sel value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>
                {KOMPETENZ_ARTEN.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Sel>
              <div style={{ fontSize: 12, color: C.dimmer, marginTop: 6, lineHeight: 1.5 }}>
                {(KOMPETENZ_ARTEN.find((a) => a[0] === neu.art) || [])[2]}</div>
            </Field>

            {neu.art === "geraet" && (
              <Field label="Betriebsmittel"
                hint={mittel.length ? "Die Einweisung gehört an das Gerät, auf das sie sich bezieht."
                  : "Es sind noch keine Betriebsmittel erfasst — unter Betriebsmittel anlegen."}>
                <Sel value={neu.betriebsmittelId || ""}
                  onChange={(e) => setNeu({ ...neu, betriebsmittelId: e.target.value })}>
                  <option value="">— keines zugeordnet —</option>
                  {mittel.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}{x.kennung ? ` (${x.kennung})` : ""}</option>))}
                </Sel></Field>)}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
              <Field label="Freigebende Stelle" hint="Wer darf sie erteilen?">
                <Inp value={neu.freigabeStelle || ""}
                  onChange={(e) => setNeu({ ...neu, freigabeStelle: e.target.value })}
                  placeholder="z. B. Medizintechnik, Anlagenbetreiber" /></Field>
              <Field label="Wiederholung" hint="Leer heißt: gilt bis zur Rücknahme.">
                <Sel value={neu.wiederholungMonate === null ? "" : (neu.wiederholungMonate || "")}
                  onChange={(e) => setNeu({ ...neu,
                    wiederholungMonate: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">ohne Frist</option>
                  {[6, 12, 24, 36, 60].map((n) => <option key={n} value={n}>alle {n} Monate</option>)}
                </Sel></Field>
            </div>

            <Field label="Grundlage"
              hint="Woraus folgt sie? Ohne Grundlage sperrt sie zwar, lässt sich aber nicht begründen.">
              <Inp value={neu.grundlage || ""} onChange={(e) => setNeu({ ...neu, grundlage: e.target.value })}
                placeholder="z. B. § 4 MPBetreibV — Einweisung je Gerät" /></Field>

            <div>
              <Lab style={{ marginBottom: 9 }}>Voraussetzung für diese Dienste</Lab>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10, lineHeight: 1.5 }}>
                Wer für einen dieser Dienste eingeteilt wird und die Kompetenz nicht
                hat, wird abgewiesen — wie bei einer gesetzlich vorbehaltenen Qualifikation.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {m.dienstarten.map((d) => {
                  const an = (neu.pflichtFuer || []).includes(d.id);
                  return (
                    <Btn key={d.id} size="sm" kind={an ? "primary" : "plain"} aria-pressed={an}
                      onClick={() => setNeu({ ...neu, pflichtFuer: an
                        ? neu.pflichtFuer.filter((x) => x !== d.id)
                        : [...(neu.pflichtFuer || []), d.id] })}>
                      {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{d.name}</Btn>);
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn kind="quiet" onClick={() => setNeu(null)}>Abbrechen</Btn>
              <Btn kind="primary" disabled={!String(neu.name || "").trim()}
                onClick={() => { akt.speichereKompetenz(neu); setNeu(null); }}>Speichern</Btn>
            </div>
          </div>
        </Sheet>)}
    </div>);
}

/* ==========================================================================
   SCHICHTÜBERGABE
   In Pflege und Klinik ein eigener, dokumentationspflichtiger Vorgang.
   Wer übergibt an wen, was ist offen, was ist besonders.
   ========================================================================== */
function Schichtuebergabe({ sitz, akt }) {
  const m = sitz.mandant;
  const [datum, setDatum] = useState(heute());
  const [dienstId, setDienstId] = useState(m.dienstarten.find((d) => !d.posten) ?.id || "");
  const [f, setF] = useState({ lage: "", offen: "", vorkommnis: "", material: "" });
  const [einheitId, setEinheitId] = useState(() => (waehltEinheit(sitz) ? null : eigeneEinheitVon(sitz)));
  const offeneListe = useMemo(() => offeneUebergaben(m, 3, einheitId), [m, einheitId]);
  const vorhanden = uebergabeAm(m, datum, dienstId, einheitId);
  const b = dienstId ? besetzung(m, datum)[dienstId] : null;
  const da = m.dienstarten.find((x) => x.id === dienstId);
  const darfSchreiben = darfEinheit(sitz, sitz.person.bereich) || darf(sitz, "plan.edit.unit");

  useEffect(() => {
    setF(vorhanden ? { lage: vorhanden.lage || "", offen: vorhanden.offen || "",
      vorkommnis: vorhanden.vorkommnis || "", material: vorhanden.material || "" }
      : { lage: "", offen: "", vorkommnis: "", material: "" });
  }, [datum, dienstId, vorhanden]);

  return (
    <div>
      <H1 rubrik={begriff(m, "einheit")}
        sub={`Die ${begriff(m, "uebergabe").toLowerCase()} hält fest, was die übernehmende Schicht wissen muss. Sie ist nachträglich nicht mehr änderbar — Ergänzungen werden angehängt.`}
        /* flexWrap: Einheit, Datum und Dienst passten bei 320 px (mit Einheitswahl bis 430 px) nicht in eine Zeile. */
        right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {waehltEinheit(sitz) && <EinheitWahl m={m} wert={einheitId} setWert={setEinheitId} />}
          <Inp type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ width: 160 }} />
          <Sel value={dienstId} onChange={(e) => setDienstId(e.target.value)} style={{ width: 170 }}>
            {m.dienstarten.filter((d) => !d.posten && d.form !== "ruf")
              .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
        </div>}>
        {begriff(m, "uebergabe")}</H1>

      {offeneListe.length > 0 && (
        <Hinweisband ton="warn"
          titel={`${offeneListe.length} ${offeneListe.length === 1 ? "Übergabe fehlt" : "Übergaben fehlen"}`}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {offeneListe.slice(0, 8).map((x, i) => (
              <Btn key={i} size="sm" onClick={() => { setDatum(x.datum); setDienstId(x.dienstart.id); }}>
                {fKurz(x.datum)} · {x.dienstart.kurz}</Btn>))}
          </div>
        </Hinweisband>)}

      <Leitraster seiteBreite={380}
        haupt={
        <Card>
          <CardHead right={vorhanden
            ? <Pill tone="ok">erfasst {vorhanden.zeit}</Pill>
            : <Pill tone="warn">offen</Pill>}>
            {da ? da.name : ""} · {fLang(datum)}</CardHead>
          <div style={{ padding: 20, display: "grid", gap: 18 }}>
            {UEBERGABE_FELDER.map((feld) => (
              <Field key={feld.id} label={feld.label + (feld.pflicht ? " *" : "")} hint={feld.hinweis}>
                <textarea className="inp" rows={feld.id === "lage" ? 4 : 2} value={f[feld.id]}
                  disabled={!!vorhanden || !darfSchreiben}
                  onChange={(e) => setF({ ...f, [feld.id]: e.target.value })} />
              </Field>))}

            {vorhanden ? (<>
              <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
                Übergeben von <b>{vorhanden.von}</b> an <b>{vorhanden.an || "die Folgeschicht"}</b> am {vorhanden.zeit}.
              </div>
              {(vorhanden.ergaenzungen || []).map((e, i) => (
                <div key={i} className="karte-still" style={{ padding: 13, borderRadius: "var(--r)" }}>
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 4, ...NUM }}>{e.zeit} · {e.von}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{e.text}</div>
                </div>))}
              {darfSchreiben && (
                <div style={{ display: "flex", gap: 10 }}>
                  <Inp placeholder="Ergänzung anhängen …" value={f.nachtrag || ""}
                    onChange={(e) => setF({ ...f, nachtrag: e.target.value })} />
                  <Btn disabled={!(f.nachtrag || "").trim()}
                    onClick={() => { akt.uebergabeErgaenzen(datum, dienstId, f.nachtrag, einheitId);
                      setF({ ...f, nachtrag: "" }); }}>Anhängen</Btn>
                </div>)}
            </>) : darfSchreiben && (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn kind="primary" disabled={!f.lage.trim()}
                  onClick={() => akt.uebergabeSpeichern(datum, dienstId, f, einheitId)}>
                  Übergabe abschließen</Btn>
              </div>)}
          </div>
        </Card>}
        seite={<>
          <Card>
            <CardHead>Besetzung dieser Schicht</CardHead>
            {b && b.personen.length ? b.personen.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 18px",
                borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 13.5, flex: 1 }}>{p.nachname}, {p.vorname}</span>
                <span style={{ fontSize: 12, color: C.dim }}>{p.funktion}</span>
              </div>))
              : <Leer titel="Niemand eingeteilt" />}
          </Card>

          {kann(m, "fachkraftquote") && (() => {
            const fl = fachkraftLage(m, datum, dienstId);
            if (!fl) return null;
            return (
              <Card style={{ padding: 18 }}>
                <Rubrik style={{ marginBottom: 10 }}>Fachkraftquote</Rubrik>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-.03em", ...NUM,
                    color: fl.erfuellt ? C.ok : C.danger }}>{fl.ist} %</span>
                  <span style={{ fontSize: 13, color: C.dim, ...NUM }}>gefordert {fl.soll} %</span>
                </div>
                <div style={{ position: "relative", marginTop: 12 }}>
                  <Fortschritt wert={fl.ist} ton={fl.erfuellt ? "ok" : "danger"} hoehe={6}
                    label={`Fachkraftquote ${fl.ist} Prozent, gefordert ${fl.soll} Prozent`} />
                  <div aria-hidden="true" style={{ position: "absolute", left: `${fl.soll}%`, top: -3, bottom: -3, width: 2,
                    background: C.text, opacity: .5 }} />
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
                  {fl.fk} von {fl.gesamt} sind {begriff(m, "fachkraft")}
                  {fl.erfuellt ? "." : ` — es fehlen ${fl.fehlt}.`}
                </div>
              </Card>);
          })()}
        </>} />
    </div>);
}

/* ==========================================================================
   HEUTE PRIORISIEREN
   Die Startseite sagt nicht, was alles da ist — sie sagt, was zuerst dran ist.
   Höchstens drei Karten, jede mit einer Zahl, einem Satz und einem Weg.
   Alles Weitere liegt darunter und ist eingeklappt.
   ========================================================================== */
function Prioritaeten({ sitz, akt, gehZu, oeffneTag }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  /* Nur für Planung und Leitung (dieselbe Bedingung wie die Pflichtaufgabe unten); entprellt, in Häppchen (Nachtrag WP-22b). */
  const schutzkonflikte = useSchutzkonflikte(sitz, darf(sitz, "pattern.edit") || darf(sitz, "org.edit"));
  const [alles, setAlles] = useState(false);
  const aufgaben = useMemo(() => tagesaufgaben(sitz), [m, p.id]);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meinDienst = p.imSchichtdienst !== false ? personTag(m, p, d0) : null;
  const meineDa = meinDienst && meinDienst.dienstId ? map[meinDienst.dienstId] : null;
  /* Eigene Zeiterfassung: wie in Tagesstart und MHeute — wer im Schichtdienst steht. */
  const vorgang = p.imSchichtdienst !== false ? stempelVorgang(m, p, d0) : null;
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen"
    : stunde < 18 ? "Guten Tag" : "Guten Abend";
  /* Ohne Vornamen wurde daraus „Guten Tag, ." — bei einem frisch angelegten
     Betrieb steht dort noch nichts. Der Satz ohne Anrede ist der bessere. */
  const anrede = (p.vorname || "").trim();

  /* Die drei wichtigsten Sachen — nach Dringlichkeit und Tragweite geordnet. */
  const oben = useMemo(() => {
    const l = [];
    const bes = besetzung(m, d0);
    const luecken = Object.values(bes).filter((b) => b.soll > 0 && b.diff < 0);
    if (luecken.length && darf(sitz, "plan.edit.unit"))
      l.push({ id: "luecke", zahl: luecken.reduce((a, b) => a + Math.abs(b.diff), 0),
        einheit: "Plätze", titel: "Heute fehlt Besetzung",
        text: luecken.map((b) => `${b.da.name} ${b.anzahl}/${b.soll}`).join(" · "),
        ton: "danger", weg: () => oeffneTag(d0), knopf: "Lücken schließen" });

    const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
    if (offen && darf(sitz, "req.approve.unit"))
      l.push({ id: "antraege", zahl: offen, einheit: offen === 1 ? "Antrag" : "Anträge",
        titel: "Warten auf Entscheidung",
        text: "Die Kapazitätsansicht zeigt vor der Entscheidung, welche Wochen dadurch kippen.",
        ton: "warn", weg: () => gehZu("antraege"), knopf: "Anträge ansehen" });

    if (darf(sitz, "staff.view")) {
      const nl = nachweisLage(m);
      if (nl.abgelaufen.length)
        l.push({ id: "nachweise", zahl: nl.abgelaufen.length, einheit: "Nachweise",
          titel: "Sind abgelaufen",
          text: nl.abgelaufen.slice(0, 3).map((x) => `${x.person.nachname} · ${x.qual.name}`).join(" · "),
          ton: "danger", weg: () => gehZu("nachweise"), knopf: "Nachweise prüfen" });
    }

    if (darf(sitz, "plan.view.unit")) {
      const bl = belastbarkeit(m, 4).filter((w) => w.stufe === "ohne Reserve");
      if (bl.length)
        l.push({ id: "reserve", zahl: bl.length, einheit: bl.length === 1 ? "Woche" : "Wochen",
          titel: "Ohne jede Reserve",
          text: `Ab ${fKurz(bl[0].von)} verträgt ${bl[0].schwaechste ? bl[0].schwaechste.da.name : "ein Dienst"} keinen einzigen Ausfall mehr.`,
          ton: "warn", weg: () => gehZu("belastbarkeit"), knopf: "Belastbarkeit ansehen" });
    }

    if (p.imSchichtdienst !== false) {
      const zeiten = offeneErfassung(m, p, addDays(d0, -1)).length;
      if (zeiten)
        l.push({ id: "zeiten", zahl: zeiten, einheit: "Tage", titel: "Zeiten bestätigen",
          text: "Solange sie offen sind, bleibt dein Stundenkonto eine Hochrechnung.",
          ton: "warn", weg: () => gehZu("meine"), knopf: "Jetzt bestätigen" });
    }

    const es = einrichtungsstand(m);
    if (!es.fertig && darf(sitz, "org.edit"))
      l.push({ id: "einrichtung", zahl: es.offen.length,
        einheit: es.offen.length === 1 ? "Schritt" : "Schritte", titel: "Bis zum laufenden Betrieb",
        text: es.offen[0].titel + " — " + es.offen[0].text,
        ton: "accent", weg: () => gehZu(es.offen[0].ziel), knopf: "Weiter einrichten" });

    /* Offene Schutzkonflikte (A2): eine Pflichtaufgabe für Planung und Leitung,
       bis umgeplant ist — vor allem anderen. */
    if (darf(sitz, "pattern.edit") || darf(sitz, "org.edit")) {
      const sk = [...schutzkonflikte.values()].sort((a, b) => (a.datum < b.datum ? -1 : 1));
      if (sk.length)
        l.unshift({ id: "schutzkonflikt", zahl: sk.length, einheit: sk.length === 1 ? "Einteilung" : "Einteilungen",
          titel: "Widersprechen einer Schutz- oder Einsatzregel",
          text: `${sk.slice(0, 3).map((x) => `${x.person.nachname} · ${fKurz(x.datum)}`).join(" · ")} — bitte umplanen.`,
          ton: "danger", weg: () => oeffneTag(sk[0].datum), knopf: "Umplanen" });
    }
    const rang = { danger: 0, warn: 1, accent: 2 };
    return l.sort((a, b) => rang[a.ton] - rang[b.ton]).slice(0, 3);
  }, [m, p.id, sitz, schutzkonflikte]);

  const rest = aufgaben.filter((a) => !oben.some((o) => o.id === a.art || o.id === a.ziel));
  const ton = (t) => t === "danger" ? C.danger : t === "warn" ? C.warn : C.accent;
  const flaeche = (t) => t === "danger" ? C.dangerLight : t === "warn" ? C.warnLight : C.accentLight;

  return (
    <div>
      {/* --------------------------- Anrede -------------------------- */}
      <div style={{ marginBottom: 40 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 className="titel" style={{ marginTop: 12 }}>
          {anrede ? <>{gruss}, <b>{anrede}</b>.</> : <>{gruss}.</>}
        </h1>
        <p className="untertitel">
          {oben.length === 0
            ? "Nichts braucht heute deine Aufmerksamkeit. Der Plan trägt."
            : oben.length === 1
              ? "Eine Sache steht heute an."
              : `${oben.length} Dinge stehen heute an — das erste zuerst.`}
        </p>
      </div>

      {/* Kennzahlen als einzelne Karten. Jede hat ihre Quelle in einer
          bestehenden Funktion (besetzung, pruefen, ppugv); fehlt die Grundlage
          (kein Soll, keine Untergrenzen-Bereiche), fehlt die Karte. */}
      {darf(sitz, "plan.view.unit") && (() => {
        const bes = besetzung(m, d0);
        const offen = Object.values(bes).filter((b) => b.soll > 0 && b.diff < 0)
          .reduce((a, b) => a + Math.abs(b.diff), 0);
        const frei = m.anfragen.filter((a) => a.status === "offen" && a.typ !== "einsatz").length;
        const abw = m.personen.filter((x) => imDienst(x, d0) && abwesenheitAm(m, x.id, d0)).length;
        const kommend = (() => { let n = 0;
          for (let i = 1; i <= 7; i++) { const d = addDays(d0, i);
            n += Object.values(besetzung(m, d)).filter((b) => b.soll > 0 && b.diff < 0).length; }
          return n; })();
        const sollHeute = Object.values(bes).reduce((a, b) => a + b.soll, 0);
        const istHeute = Object.values(bes).reduce((a, b) => a + Math.min(b.anzahl, b.soll), 0);
        const verlauf = besetzungsVerlauf(m, addDays(d0, -13), 14).filter((x) => x.soll > 0);
        /* Ruhezeit-Befunde der letzten 28 Tage gegen die 28 davor — beide
           Zeiträume kommen aus derselben Prüfung, sonst gäbe es keinen Trend. */
        const ruheJetzt = pruefen(m, addDays(d0, -27), d0).filter((x) => x.art === "ruhezeit").length;
        const ruheVorher = pruefen(m, addDays(d0, -55), addDays(d0, -28)).filter((x) => x.art === "ruhezeit").length;
        const diff = ruheJetzt - ruheVorher;
        return (
          <Kennzahlen style={{ marginBottom: 40 }} kacheln={[
            sollHeute > 0 && { label: "Besetzung heute", wert: Math.round((istHeute / sollHeute) * 100), einheit: "%",
              ton: istHeute >= sollHeute ? "ok" : "warn", sub: `${istHeute} von ${sollHeute} Plätzen besetzt`,
              bild: verlauf.length > 1 && (
                <Sparkline art="saeulen" daten={verlauf.map((x) => x.quote)} hoehe={34}
                  beschriftung={`Besetzungsgrad der letzten ${verlauf.length} Tage, heute ${verlauf[verlauf.length - 1].quote} Prozent`} />) },
            { label: "Offene Schichten", wert: offen, ton: offen ? "danger" : "ok", hervor: offen ? "danger" : undefined,
              sub: offen ? "Plätze heute" : "alles besetzt" },
            { label: "Freigaben warten", wert: frei, ton: frei ? "warn" : "ok", sub: frei ? "zu entscheiden" : "nichts offen" },
            { label: "Abwesenheiten heute", wert: abw, sub: "Urlaub, krank, Schulung" },
            { label: "Nächste 7 Tage", wert: kommend, ton: kommend ? "warn" : "ok",
              sub: kommend ? "Lücken erwartet" : "durchgehend gedeckt" },
            { label: "Ruhezeit-Befunde", wert: ruheJetzt, ton: ruheJetzt ? "warn" : "ok",
              sub: "letzte 28 Tage, gegen die 28 davor",
              trend: ruheJetzt + ruheVorher === 0 ? undefined
                : { text: diff === 0 ? "wie zuvor" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`,
                  ton: diff > 0 ? "warn" : diff < 0 ? "ok" : "neutral",
                  richtung: diff > 0 ? "auf" : diff < 0 ? "ab" : "gleich" } },
          ]} />);
      })()}

      {/* Einrichtung und Untergrenzen: nur, wo es etwas zu zeigen gibt. */}
      {(() => {
        const es = einrichtungsstand(m);
        const zeigEinr = !es.fertig && darf(sitz, "org.edit");
        const ugEinh = darf(sitz, "plan.view.unit")
          ? (m.einheiten || []).filter((e) => !e.pool && e.ppugvBereich) : [];
        if (!zeigEinr && !ugEinh.length) return null;
        const [y0, mo0] = d0.split("-").map(Number);
        const tageMonat = Array.from({ length: dim_(y0, mo0 - 1) }, (_, i) => `${d0.slice(0, 7)}-${pad(i + 1)}`);
        const ug = ugEinh.map((e) => ({ e, l: ppugvMonatslage(ppugvZeilen(m, e, tageMonat)) }));
        const gesamt = ug.reduce((a, x) => a + x.l.gesamt, 0);
        const gruen = ug.reduce((a, x) => a + x.l.gruen, 0);
        const rot = ug.reduce((a, x) => a + x.l.rot, 0);
        const grau = ug.reduce((a, x) => a + x.l.grau, 0);
        return (
          <div className="startpaar">
            {zeigEinr && (
              <Seitenkarte titel="Einrichtung" sub="Diese Schritte fehlen noch für den vollständigen Betrieb.">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}><Fortschritt wert={es.anteil} hoehe={8} label="Einrichtung" /></div>
                  <b style={{ color: C.accent, fontSize: 13, ...NUM }}>{es.anteil} %</b>
                </div>
                <Checkliste punkte={es.schritte.map((st) => ({
                  text: st.titel, erledigt: st.erledigt, onClick: st.erledigt ? undefined : () => gehZu(st.ziel) }))} />
              </Seitenkarte>)}
            {ug.length > 0 && (
              <Seitenkarte titel="Untergrenzen im Monat" sub="Schichten je Bereich nach PpUGV, Stand dieses Monats.">
                <Bogen segmente={[{ wert: gruen, ton: "ok", label: `${gruen} eingehalten` },
                  { wert: rot, ton: "danger", label: `${rot} unterschritten` },
                  { wert: grau, label: `${grau} nicht bewertbar` }]}
                  zahl={gesamt ? `${Math.round((gruen / gesamt) * 100)} %` : "—"} kopf="Eingehalten"
                  beschriftung={`${gruen} von ${gesamt} Schichten eingehalten, ${rot} unterschritten, ${grau} nicht bewertbar`} />
                <div style={{ marginTop: 14 }}>
                  {ug.map(({ e, l }) => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: 10, padding: "6px 0", fontSize: 13.5 }}>
                      <span>{e.name}</span>
                      <Pill size="sm" tone={l.rot ? "danger" : l.grau ? "neutral" : "ok"}>
                        {l.rot ? `${l.rot} unterschritten` : l.grau ? `${l.grau} nicht bewertbar` : "eingehalten"}</Pill>
                    </div>))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Btn size="sm" onClick={() => gehZu("untergrenzen")}>Untergrenzen öffnen</Btn></div>
              </Seitenkarte>)}
          </div>);
      })()}

      {/* ------------------------ Die drei Karten -------------------- */}
      {oben.length === 0 ? (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <div style={{ color: C.ok, marginBottom: 14, display: "flex", justifyContent: "center" }}><Icon n="kreis-haken" size={38} /></div>
          <div style={{ fontSize: 19, fontWeight: 620, marginBottom: 8 }}>Alles im Lauf</div>
          <div style={{ fontSize: 14.5, color: C.dim, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            Keine offenen Entscheidungen, keine Lücken, keine abgelaufenen Nachweise.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <h2 className="abschnitt-titel" style={{ marginBottom: 2 }}>Heute zu erledigen</h2>
          {oben.map((x, i) => (
            <Card key={x.id} className="karte-hover" onClick={x.weg}
              style={{ padding: "30px 32px", cursor: "pointer", display: "flex",
                alignItems: "center", gap: 32, flexWrap: "wrap",
                borderLeft: `3px solid ${ton(x.ton)}`,
                background: i === 0 ? flaeche(x.ton) : C.flaeche }}>
              <div style={{ minWidth: 92 }}>
                <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: "-.05em", lineHeight: 1,
                  color: ton(x.ton), ...NUM }}>{x.zahl}</div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 6 }}>{x.einheit}</div>
              </div>
              <div style={{ flex: 1, minWidth: 250 }}>
                <div style={{ fontSize: 20, fontWeight: 640, letterSpacing: "-.02em", marginBottom: 8 }}>
                  {x.titel}</div>
                <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{x.text}</div>
              </div>
              <Btn kind={i === 0 ? "primary" : "plain"} style={{ flexShrink: 0 }}
                onClick={(e) => { if (e) e.stopPropagation(); x.weg(); }}>{x.knopf}</Btn>
            </Card>))}
        </div>)}

      {/* ------------------------ Mein Dienst ------------------------ */}
      {/* Bisher nur Anzeige und Verweis — am Rechner gab es keine Stempeluhr
          (Tagesstart, die sie trug, ist nicht eingebunden). Jetzt dieselbe
          Karte wie dort: geplanter Dienst oder offener Beginn, mit Stempeluhr. */}
      {(meineDa || (vorgang && vorgang.offen)) && (
        <div className="abschnitt">
          <h2 className="abschnitt-titel">Mein Dienst heute</h2>
          <p className="abschnitt-sub">Was für dich persönlich ansteht.</p>
          <DienstKarte sitz={sitz} akt={akt} vorgang={vorgang} meineDa={meineDa}>
            <Btn onClick={() => gehZu("meine")}>Meine Schichten</Btn>
          </DienstKarte>
        </div>)}
      {sitz.person && <KorrekturKarte sitz={sitz} akt={akt} />}

      {/* --------------------- Alles Weitere, eingeklappt ------------- */}
      {rest.length > 0 && (
        <div className="abschnitt">
          <button className={`mehr${alles ? " auf" : ""}`} onClick={() => setAlles(!alles)}
            aria-expanded={alles}>
            <span aria-hidden="true" style={{ display: "flex" }}><Icon n="chevron-rechts" size={14} /></span>
            {alles ? "Weniger anzeigen" : `Alles Weitere anzeigen (${rest.length})`}
          </button>
          {alles && (
            <Card style={{ marginTop: 14 }}>
              {rest.map((a, i) => (
                <div key={i} {...klickbar(a.ziel ? () => gehZu(a.ziel) : null)}
                  className="zeile-hover"
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 22px",
                    cursor: a.ziel ? "pointer" : "default",
                    borderBottom: i < rest.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 14,
                    background: a.dringend ? C.dangerLight : C.bg,
                    color: a.dringend ? C.danger : C.dim }}><AufgabeSymbol art={a.art} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 550 }}>{a.titel}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.5 }}>{a.text}</div>
                  </div>
                  {a.ziel && <span aria-hidden="true" style={{ color: C.dim, display: "flex" }}><Icon n="chevron-rechts" size={18} /></span>}
                </div>))}
            </Card>)}
        </div>)}

      {/* ------------------------ Lage in Zahlen --------------------- */}
      {darf(sitz, "plan.view.unit") && (
        <div className="abschnitt">
          <h2 className="abschnitt-titel">Die Lage in Zahlen</h2>
          <p className="abschnitt-sub">Stand heute, über alle {mehrzahl(m.einheitLabel)}.</p>
          {(() => {
            const bes = besetzung(m, d0);
            const eingeteilt = Object.values(bes).reduce((a, b) => a + b.anzahl, 0);
            const abw = m.personen.filter((x) => imDienst(x, d0) && abwesenheitAm(m, x.id, d0)).length;
            const bl = belastbarkeit(m, 4);
            const schwach = bl.filter((w) => w.stufe !== "robust").length;
            return (
              <Kennzahlen style={{ marginBottom: 0 }} kacheln={[
                { label: "Heute im Dienst", wert: eingeteilt, ton: "accent", sub: `von ${aktive(m, d0).length} Beschäftigten` },
                { label: "Abwesend", wert: abw, sub: "Urlaub, krank, Schulung" },
                { label: "Wochen ohne Puffer", wert: schwach, ton: schwach ? "warn" : "ok", sub: "in den nächsten vier" }]} />);
          })()}
        </div>)}

      {/* ------------------------ Dienstbuch ------------------------- */}
      {darf(sitz, "plan.view.unit") && (m.dienstbuch || []).length > 0 && (() => {
        const arten = { uebergabe: ["Übergabe", "accent"], vorkommnis: ["Vorkommnis", "danger"], hinweis: ["Hinweis", "warn"] };
        const letzte = [...m.dienstbuch].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0)).slice(0, 5);
        return (
          <div className="abschnitt">
            <Abschnittskopf titel="Dienstbuch" sub="Die letzten Einträge."
              rechts={<Btn size="sm" onClick={() => gehZu("buch")}>Dienstbuch öffnen</Btn>} />
            <Card>
              {letzte.map((e) => (
                <div key={e.id} className="listenzeile" style={{ alignItems: "flex-start" }}>
                  <Pill size="sm" tone={(arten[e.art] || [])[1]}>{(arten[e.art] || [e.art])[0]}</Pill>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5,
                    overflowWrap: "anywhere" }}>{e.text}</div>
                  <span style={{ fontSize: 12, color: C.dim, whiteSpace: "nowrap", ...NUM }}>{fKurz(e.datum)}</span>
                </div>))}
            </Card>
          </div>);
      })()}
    </div>);
}

/* ==========================================================================
   HANDBUCHANSICHT
   Zwei Nutzungsarten in einer Ansicht: durchgehend lesen bei der Einrichtung,
   gezielt nachschlagen im laufenden Betrieb. Deshalb Kapitelliste links,
   Suche oben und ein Haken je Abschnitt.
   ========================================================================== */
function Handbuch({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  /* Der Inhalt wird erst beim Öffnen geholt. Bis dahin steht hier ein
     Gerüst — kein Drehrad und kein leerer Bildschirm. */
  const [alle, setAlle] = useState(_handbuch);
  const [ladefehler, setLadefehler] = useState(null);
  useEffect(() => {
    if (alle) return;
    let weg = false;
    handbuchLaden().then((h) => { if (!weg) setAlle(h); })
      .catch(() => { if (!weg) setLadefehler(true); });
    return () => { weg = true; };
  }, [alle]);

  const kapitel = useMemo(() => handbuchKapitel(alle, m), [alle, m]);
  const [offen, setOffen] = useState(null);
  const [suche, setSuche] = useState("");
  const gelesen = (sitz.person.handbuch || []);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (s.length < 2) return null;
    return handbuchAbschnitte(alle, m).filter((a) =>
      `${a.titel} ${a.text} ${(a.schritte || []).join(" ")} ${a.merke || ""} ${a.kapitel}`
        .toLowerCase().includes(s));
  }, [suche, alle, m]);

  if (ladefehler) return (
    <div>
      <H1>Handbuch</H1>
      <Card>
        <Leer titel="Das Handbuch ließ sich nicht nachladen" symbol="offline"
          text="Der Inhalt wird beim Öffnen geholt; dabei ist die Verbindung abgebrochen. Alles andere in der Anwendung ist davon nicht betroffen."
          aktion={<Btn kind="primary" onClick={() => { setLadefehler(null); handbuchLaden()
            .then(setAlle).catch(() => setLadefehler(true)); }}>Erneut versuchen</Btn>} />
      </Card>
    </div>);

  if (!alle) return (
    <div>
      <H1 sub="Wird geholt …">Handbuch</H1>
      <div className="handbuchraster">
        <div className="pulsiert karte" style={{ height: 300 }} />
        <div className="pulsiert karte" style={{ height: 420 }} />
      </div>
      <div className="nurLeser" role="status" aria-live="polite">Handbuch wird geladen</div>
    </div>);

  const k = kapitel.find((x) => x.id === offen) || kapitel[0];
  const anteil = Math.round((gelesen.length /
    Math.max(1, kapitel.reduce((a, x) => a + x.abschnitte.length, 0))) * 100);

  const Abschnitt = ({ a, kapId, kapZiel }) => {
    const schluessel = `${kapId}:${a.titel}`;
    const ok = gelesen.includes(schluessel);
    return (
      <Card style={{ padding: 26, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <button type="button" onClick={() => akt.handbuchHaken(schluessel)}
            aria-label={ok ? "Als ungelesen markieren" : "Als erledigt markieren"}
            style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, cursor: "pointer",
              marginTop: 2, border: `1.5px solid ${ok ? C.ok : C.steuer}`,
              background: ok ? C.ok : "transparent", color: C.aufAkzent, padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
            {ok ? <Icon n="haken" size={15} strokeWidth={2.4} /> : null}</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 18, fontWeight: 640, letterSpacing: "-.02em", margin: 0,
              opacity: ok ? .6 : 1 }}>{a.titel}</h3>
            {suche && <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{a.kapitel}</div>}
          </div>
        </div>

        <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.65, margin: "0 0 18px" }}>{a.text}</p>

        {a.schritte && (
          <ol style={{ margin: "0 0 18px", padding: 0, listStyle: "none", counterReset: "s" }}>
            {a.schritte.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 13, padding: "8px 0", fontSize: 14,
                lineHeight: 1.6, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
                  background: C.accentLight, color: C.accent, fontSize: 11.5, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", ...NUM }}>{i + 1}</span>
                <span>{s}</span>
              </li>))}
          </ol>)}

        {a.pruefen && (
          <Hinweisband ton="ok" style={{ boxShadow: "none", marginBottom: 12, background: C.okLight }}
            titel={<span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em",
              textTransform: "uppercase", color: C.ok }}>Woran du merkst, dass es geklappt hat</span>}>
            <span style={{ fontSize: 13.5, lineHeight: 1.6, color: C.text }}>{a.pruefen}</span>
          </Hinweisband>)}

        {a.merke && <Erklaerkasten style={{ fontSize: 13.5, lineHeight: 1.6 }}>{a.merke}</Erklaerkasten>}

        {(kapZiel || a.ziel) && !suche && (
          <div style={{ marginTop: 16 }}>
            <Btn size="sm" onClick={() => gehZu(kapZiel || a.ziel)}>Dorthin wechseln</Btn>
          </div>)}
      </Card>);
  };

  return (
    <div>
      <H1 rubrik="Hilfe"
        sub="Ein durchgehender Weg von der leeren Anwendung bis zum laufenden Betrieb — und danach ein Nachschlagewerk. Jeder Schritt nennt, woran du merkst, dass es geklappt hat."
        right={<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={akt.druckeHandbuch}>Als PDF drucken</Btn>
        </div>}>
        Handbuch</H1>

      <Filterleiste suche={suche} setSuche={setSuche} platzhalter="Im Handbuch suchen …" label="Im Handbuch suchen"
        rechts={<>
          {treffer && <span style={{ fontSize: 13, color: C.dim, ...NUM }}>
            {treffer.length} {treffer.length === 1 ? "Abschnitt" : "Abschnitte"}</span>}
          {suche && <Btn size="sm" kind="quiet" onClick={() => setSuche("")}>Zurücksetzen</Btn>}
          {gelesen.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 90 }}><Fortschritt wert={anteil} ton="ok" hoehe={6} label="Handbuch gelesen" /></span>
              <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>{anteil} % durch</span>
            </span>)}
        </>} />

      {treffer ? (
        treffer.length === 0
          ? <Leer titel="Nichts gefunden" text="Versuch einen anderen Begriff — etwa „Ruhezeit“, „Urlaub“ oder „Zuschlag“." />
          : treffer.map((a, i) => <Abschnitt key={i} a={a} kapId={a.kapitelId} kapZiel={a.ziel} />)
      ) : (
        <div className="handbuchraster">

          {/* --------------------- Kapitelliste --------------------- */}
          <Card className="kapitelliste">
            {kapitel.map((x, i) => {
              const fertig = x.abschnitte.every((a) => gelesen.includes(`${x.id}:${a.titel}`));
              const an = x.id === offen;
              return (
                <button key={x.id} onClick={() => setOffen(x.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
                    padding: "14px 16px", border: "none", cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit", color: C.text,
                    background: an ? C.accentLight : "transparent",
                    borderLeft: `3px solid ${an ? C.accent : "transparent"}`,
                    borderBottom: i < kapitel.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, ...NUM,
                    background: fertig ? C.ok : an ? C.accent : C.flaecheStill,
                    color: fertig || an ? C.aufAkzent : C.dim }}>{fertig ? <Icon n="haken" size={13} strokeWidth={2.4} /> : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: an ? 640 : 550,
                      lineHeight: 1.35 }}>{x.titel}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.dim, marginTop: 3 }}>
                      {x.dauer} · {x.abschnitte.length} {x.abschnitte.length === 1 ? "Abschnitt" : "Abschnitte"}</span>
                  </span>
                </button>);
            })}
          </Card>

          {/* ----------------------- Kapitel ------------------------ */}
          <div>
            {k && (<>
              <div style={{ marginBottom: 22 }}>
                <Rubrik>{k.dauer}</Rubrik>
                <h2 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em",
                  margin: "10px 0 10px" }}>{k.titel}</h2>
                <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.6, margin: 0, maxWidth: 620 }}>
                  {k.einleitung}</p>
              </div>
              {k.abschnitte.map((a, i) => <Abschnitt key={i} a={a} kapId={k.id} kapZiel={k.ziel} />)}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <Btn kind="quiet" disabled={kapitel.indexOf(k) === 0}
                  onClick={() => setOffen(kapitel[kapitel.indexOf(k) - 1].id)}>Vorheriges Kapitel</Btn>
                <Btn kind="primary" disabled={kapitel.indexOf(k) === kapitel.length - 1}
                  onClick={() => { setOffen(kapitel[kapitel.indexOf(k) + 1].id);
                    window.scrollTo({ top: 0, behavior: "smooth" }); }}>Nächstes Kapitel</Btn>
              </div>
            </>)}
          </div>

          {/* ------------------ Stand in diesem Kapitel ------------------ */}
          {k && (
            <div className="rechts">
              <Seitenkarte titel="In diesem Kapitel"
                sub={`${k.abschnitte.filter((a) => gelesen.includes(`${k.id}:${a.titel}`)).length} von ${k.abschnitte.length} als erledigt markiert`}>
                <Checkliste punkte={k.abschnitte.map((a) => ({ text: a.titel,
                  erledigt: gelesen.includes(`${k.id}:${a.titel}`),
                  onClick: () => akt.handbuchHaken(`${k.id}:${a.titel}`) }))} />
              </Seitenkarte>
            </div>)}
        </div>)}
    </div>);
}

/* ==========================================================================
   OFFENE SCHICHTEN — Ansicht für die Planung
   Links die Ausschreibungen, rechts wer sich gemeldet hat und warum diese
   Person oben steht. Ein Griff, und sie ist eingeteilt.
   ========================================================================== */
function OffeneSchichten({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  const darfVergeben = darf(sitz, "plan.edit.unit") || darf(sitz, "plan.edit.all");
  const [gewaehlt, setGewaehlt] = useState(null);
  const [neu, setNeu] = useState(null);

  const alle = (m.ausschreibungen || []);
  const offen = alle.filter((a) => a.status === "offen" && a.datum >= heute())
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const erledigt = alle.filter((a) => a.status !== "offen" || a.datum < heute())
    .sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 20);
  const a = offen.find((x) => x.id === gewaehlt) || offen[0] || null;
  const lage = a ? ausschreibungLage(m, a) : null;

  /* Lücken der nächsten vierzehn Tage, die noch nicht ausgeschrieben sind */
  const luecken = useMemo(() => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(heute(), i);
      const bes = besetzung(m, d);
      for (const [dienstId, b] of Object.entries(bes)) {
        if (b.soll > 0 && b.diff < 0 && !alle.some((x) => x.datum === d
          && x.dienstId === dienstId && x.status === "offen"))
          out.push({ datum: d, dienstId, fehlt: Math.abs(b.diff) });
      }
    }
    return out;
  }, [m, alle]);

  return (
    <div>
      <H1 rubrik="Anliegen"
        sub="Statt zehn Leute anzurufen: die Lücke sichtbar machen. Wer sich meldet, darf auch — Ruhezeit, Qualifikation und Abwesenheit sind vorher geprüft."
        right={darfVergeben && luecken.length > 0 && (
          <Btn kind="primary" onClick={() => setNeu(luecken[0])}>Lücke ausschreiben</Btn>)}>
        Offene Schichten</H1>

      {/* --------------------- Nicht ausgeschriebene Lücken -------------- */}
      {darfVergeben && luecken.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <CardHead right={<Lab>{zahl(luecken.length)} in vierzehn Tagen</Lab>}>
            Lücken ohne Ausschreibung</CardHead>
          <div style={{ padding: "4px 0" }}>
            {luecken.slice(0, 6).map((l, i) => {
              const da = m.dienstarten.find((x) => x.id === l.dienstId);
              const tage = between(heute(), l.datum);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14,
                  padding: "13px var(--pad-x)",
                  borderBottom: i < Math.min(5, luecken.length - 1) ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2,
                    background: da ? da.farbe : C.line }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 550 }}>
                      {fLang(l.datum)} · {da ? da.name : l.dienstId}</div>
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                      {zahl(l.fehlt)} {l.fehlt === 1 ? "Person fehlt" : "Personen fehlen"}
                      {tage <= 2 ? " · dringend" : ` · in ${tage} Tagen`}</div>
                  </div>
                  <Btn size="sm" onClick={() => setNeu(l)}>Ausschreiben</Btn>
                </div>);
            })}
          </div>
        </Card>)}

      {offen.length === 0 ? (
        <Card><Leer titel="Nichts ausgeschrieben"
          text="Wenn jemand ausfällt, kannst du die Lücke hier zur Bewerbung freigeben statt herumzutelefonieren." /></Card>
      ) : (
        <div className="zweispaltig" style={{ display: "grid", gridTemplateColumns: "minmax(280px,340px) minmax(0,1fr)",
          gap: 24, alignItems: "start" }}>

          {/* ------------------------ Die Liste ------------------------ */}
          <Card style={{ position: "sticky", top: 76 }}>
            <CardHead right={<Lab>{zahl(offen.length)}</Lab>}>Ausgeschrieben</CardHead>
            {offen.map((x, i) => {
              const da = m.dienstarten.find((y) => y.id === x.dienstId);
              const l = ausschreibungLage(m, x);
              const an = a && x.id === a.id;
              return (
                <button key={x.id} onClick={() => setGewaehlt(x.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "14px var(--pad-x)", border: "none", cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit", color: C.text,
                    background: an ? C.accentLight : "transparent",
                    borderLeft: `3px solid ${an ? C.accent : "transparent"}`,
                    borderBottom: i < offen.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <span style={{ width: 4, alignSelf: "stretch", minHeight: 34, borderRadius: 2,
                    background: da ? da.farbe : C.line }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: an ? 640 : 550 }}>
                      {fKurz(x.datum)} · {da ? da.name : x.dienstId}</span>
                    <span style={{ display: "block", fontSize: 12, color: C.dim, marginTop: 3 }}>
                      {!darfVergeben ? (l.dringend ? "offen · dringend" : "offen")
                        : l.anzahl === 0
                        ? l.dringend ? "noch niemand · dringend" : "noch niemand"
                        : `${zahl(l.anzahl)} ${l.anzahl === 1 ? "Meldung" : "Meldungen"}`}</span>
                  </span>
                  {l.anzahl > 0 && <Pill size="sm" tone="ok">{zahl(l.anzahl)}</Pill>}
                  {l.dringend && <Pill size="sm" tone="danger">!</Pill>}
                </button>);
            })}
          </Card>

          {/* ---------------------- Die Bewerbungen -------------------- */}
          {a && lage && (() => {
            const da = m.dienstarten.find((x) => x.id === a.dienstId);
            return (
              <div>
                <Card style={{ marginBottom: 18 }}>
                  <div style={{ padding: "22px var(--pad-x)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <Rubrik>{fLang(a.datum)}</Rubrik>
                      {lage.dringend && <Pill size="sm" tone="danger">dringend</Pill>}
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 300, letterSpacing: "-.035em",
                      margin: "9px 0 8px" }}>
                      {da ? da.name : a.dienstId}
                      {da && <span style={{ fontSize: 16, color: C.dim, fontWeight: 400 }}>
                        {" "}· {da.start}–{da.ende}</span>}</h2>
                    {a.hinweis && <p style={{ fontSize: 14, color: C.dim, margin: "0 0 12px",
                      lineHeight: 1.55 }}>{a.hinweis}</p>}
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13,
                      color: C.dim, marginTop: 12 }}>
                      {darfVergeben && <span>{zahl(lage.moeglich)} kämen infrage</span>}
                      {darfVergeben && <span>{zahl(lage.anzahl)} {lage.anzahl === 1 ? "Meldung" : "Meldungen"}</span>}
                      <span>{lage.tage <= 0 ? "heute" : `in ${zahl(lage.tage)} Tagen`}</span>
                    </div>
                    {darfVergeben && (
                      <div style={{ marginTop: 18 }}>
                        <Btn size="sm" kind="quiet"
                          onClick={() => akt.ziehAusschreibungZurueck(a.id)}>Zurückziehen</Btn>
                      </div>)}
                  </div>
                </Card>

                {/* Wer sich gemeldet hat und in welcher Rangfolge, sieht nur, wer vergibt.
                    Beschäftigte bekommen fremde Meldungen vom Server nicht (sicht.mjs). */}
                {!darfVergeben ? null : lage.anzahl === 0 ? (
                  <Card><Leer titel="Noch niemand hat sich gemeldet"
                    text={lage.moeglich === 0
                      ? "Niemand kann diese Schicht ohne Befund übernehmen — Ruhezeit, Qualifikation oder Abwesenheit stehen im Weg. Die Ersatzsuche zeigt, wer nur mit Abweichung infrage kommt."
                      : `${zahl(lage.moeglich)} Personen wurden unterrichtet. Bei kurzem Vorlauf lohnt zusätzlich die gezielte Anfrage.`} />
                    {lage.moeglich > 0 && (
                      <div style={{ padding: "0 var(--pad-x) 22px" }}>
                        <Btn onClick={() => gehZu("lage")}>Zur gezielten Ersatzsuche</Btn>
                      </div>)}
                  </Card>
                ) : (
                  <Card>
                    <CardHead right={<Lab>nach Eignung geordnet</Lab>}>Meldungen</CardHead>
                    {lage.bewerbungen.map((b, i) => (
                      <div key={b.personId} style={{ padding: "18px var(--pad-x)",
                        borderBottom: i < lage.bewerbungen.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                        background: i === 0 ? C.accentLight : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <Avatar person={b.person} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600 }}>
                              {b.person.nachname}, {b.person.vorname}
                              {i === 0 && <span style={{ fontSize: 12, color: C.accent,
                                fontWeight: 600 }}> · Vorschlag</span>}</div>
                            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                              {b.person.funktion} · gemeldet {fKurz(b.zeit.slice(0, 10))}</div>
                          </div>
                          {darfVergeben && (
                            <Btn size="sm" kind={i === 0 ? "primary" : undefined}
                              onClick={() => akt.mitWarnung(m, { titel: "Offene Schicht vergeben",
                                eintraege: [{ personId: b.personId, datum: a.datum, dienstId: a.dienstId }],
                                knopf: "Einteilen",
                                ausfuehren: (best) => akt.vergibSchicht(a.id, b.personId, best) })}>Einteilen</Btn>)}
                        </div>
                        {b.text && (
                          <div style={{ fontSize: 13.5, color: C.dim, marginTop: 10,
                            paddingLeft: 52, lineHeight: 1.5, fontStyle: "italic" }}>„{b.text}"</div>)}
                        {(() => { const dx = m.dienstarten.find((x) => x.id === a.dienstId);
                          const h = dx ? hindernisse(m, b.person, a.datum, dx) : [];
                          return h.length > 0 && (
                            <div style={{ display: "flex", gap: 7, fontSize: 12.5, color: C.warn, marginTop: 8, paddingLeft: 52, lineHeight: 1.45 }}>
                              <Icon n="warnung" size={14} /><span>mit Hinweis: {h.join(" · ")}</span></div>); })()}
                        {b.gruende && b.gruende.length > 0 && (
                          <div style={{ marginTop: 12, paddingLeft: 52, display: "grid", gap: 5 }}>
                            {b.gruende.slice(0, 3).map((g, gi) => (
                              <div key={gi} style={{ display: "flex", gap: 8, fontSize: 12.5,
                                color: g.art === "minus" ? C.warn : C.dim, lineHeight: 1.45 }}>
                                <span style={{ fontWeight: 700, flexShrink: 0 }}>
                                  {g.art === "plus" ? "+" : g.art === "minus" ? "−" : "·"}</span>
                                <span>{g.text}</span>
                              </div>))}
                          </div>)}
                      </div>))}
                  </Card>)}
              </div>);
          })()}
        </div>)}

      {/* ------------------------ Bereits erledigt ---------------------- */}
      {erledigt.length > 0 && (
        <details style={{ marginTop: 32 }}>
          <summary style={{ cursor: "pointer", fontSize: 13.5, color: C.dim, padding: "10px 0" }}>
            Frühere Ausschreibungen ({zahl(erledigt.length)})</summary>
          <Card style={{ marginTop: 12 }}>
            {erledigt.map((x, i) => {
              const da = m.dienstarten.find((y) => y.id === x.dienstId);
              const p = x.vergebenAn ? m.personen.find((y) => y.id === x.vergebenAn) : null;
              const st = OFFEN_STATUS[x.status] || OFFEN_STATUS.offen;
              return (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 14,
                  padding: "12px var(--pad-x)",
                  borderBottom: i < erledigt.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{fKurz(x.datum)} · {da ? da.name : x.dienstId}</div>
                    {p && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                      an {p.nachname}, {p.vorname}</div>}
                  </div>
                  <Pill size="sm" tone={st.ton}>{st.label}</Pill>
                </div>);
            })}
          </Card>
        </details>)}

      {/* ------------------------ Ausschreiben -------------------------- */}
      {neu && (
        <Sheet open onClose={() => setNeu(null)} titel="Schicht ausschreiben" width={520}>
          {(() => {
            const da = m.dienstarten.find((x) => x.id === neu.dienstId);
            const moeglich = m.personen.filter((p) => imDienst(p, neu.datum)
              && bewerbbarOhneHinweis(m, p.id, { datum: neu.datum, dienstId: neu.dienstId,
                status: "offen", bewerbungen: [] })).length;
            return (
              <div style={{ display: "grid", gap: 18 }}>
                <div>
                  <Rubrik>{fLang(neu.datum)}</Rubrik>
                  <div style={{ fontSize: 20, fontWeight: 620, marginTop: 8 }}>
                    {da ? da.name : neu.dienstId}
                    {da && <span style={{ fontSize: 15, color: C.dim, fontWeight: 400 }}>
                      {" "}· {da.start}–{da.ende}</span>}</div>
                </div>

                <div style={{ padding: "14px 16px", borderRadius: 10,
                  background: moeglich > 0 ? C.okLight : C.warnLight,
                  border: `1px solid ${moeglich > 0 ? C.ok : C.warn}66` }}>
                  <div style={{ fontSize: 14, lineHeight: 1.55,
                    color: moeglich > 0 ? C.text : C.warn }}>
                    {moeglich > 0
                      ? `${zahl(moeglich)} Personen dürfen diese Schicht übernehmen und werden unterrichtet.`
                      : "Niemand darf diese Schicht übernehmen — Ruhezeit, Qualifikation oder Abwesenheit stehen im Weg. Eine Ausschreibung brächte nichts."}
                  </div>
                </div>

                <Field label="Hinweis (freiwillig)"
                  hint="Ein Satz, warum die Schicht offen ist. Das erhöht die Bereitschaft spürbar.">
                  <Inp id="as-hinweis" placeholder="z. B. Krankmeldung, kurzfristig" /></Field>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Btn kind="quiet" onClick={() => setNeu(null)}>Abbrechen</Btn>
                  <Btn kind="primary" disabled={moeglich === 0} onClick={() => {
                    const el = document.getElementById("as-hinweis");
                    akt.schreibeAus(neu.datum, neu.dienstId, el ? el.value : "");
                    setNeu(null);
                  }}>Ausschreiben</Btn>
                </div>
              </div>);
          })()}
        </Sheet>)}
    </div>);
}

/**
 * Lädt den Tourinhalt und gibt ihn zurück, sobald er da ist.
 * Vorher null — der Aufrufer stellt so lange nichts dar.
 */
function useTour(gebraucht = true) {
  const [t, setT] = useState(_tour);
  useEffect(() => {
    if (!gebraucht || t) return;
    let weg = false;
    tourLaden().then((x) => { if (!weg) setT(x); }).catch(() => {});
    return () => { weg = true; };
  }, [gebraucht, t]);
  return t;
}

/* ==========================================================================
   TOUR-OBERFLÄCHE

   Ein Streifen am unteren Rand, kein Vollbild. Wer die Anwendung dabei
   bedienen kann, behält mehr als jemand, der nur Text liest.

   Zwei Größen, weil eine nicht reicht. Ausgeklappt nahm die Tour über die
   volle Breite rund ein Viertel der Bildschirmhöhe und stand damit in
   jeder Ansicht im Weg — auch dann, wenn gerade gar nicht gelernt, sondern
   gearbeitet wurde. Sie ist deshalb erstens eine schwebende Karte
   geworden statt einer angedockten Leiste, und zweitens einklappbar auf
   eine Zeile: Kapitel, Fortschritt, Weiter. Der Faden bleibt sichtbar,
   der Platz bleibt beim Inhalt.
   ========================================================================== */
/* Ist gerade ein Dialog offen (aria-modal)? Die Tour liegt als feste Karte
   über allem und verdeckte sonst Schaltflächen im Dialog (belegt:
   „Hinzufügen" in „Person hinzufügen"). Beobachtet wird das Dokument statt
   jedes Dialogs einzeln — so gilt es für alle Blatt- und Bestätigungsarten. */
function useModalOffen() {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return undefined;
    /* Auch die geöffnete Seitenleiste (Schublade auf schmalen Ansichten) gilt als Dialog */
    const pruefe = () => setOffen(!!document.querySelector('[aria-modal="true"], .seitenleiste.offen'));
    pruefe();
    const mo = new MutationObserver(pruefe);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return offen;
}

function TourLeiste({ sitz, akt, gehZu }) {
  const p = sitz.person;
  const rolleId = sitz.rolle === "betreiber" ? "betreiber" : (p.rolle || "mitarbeiter");
  const dialogOffen = useModalOffen();
  /* Die Leiste erscheint erst, wenn der Inhalt da ist. Ein leerer Streifen
     am unteren Rand wäre schlimmer als eine halbe Sekunde ohne ihn. */
  const tour = useTour(true);
  const st = tourStand(p, rolleId, tour);
  const punkt = st.alle[st.idx];
  const t = (tour || {})[rolleId] || (tour || {}).mitarbeiter;
  if (!tour || !punkt || !t) return null;

  const kapitel = tourKapitel(tour, rolleId, st.gesehen);
  const jetzt = kapitel.find((k) => st.idx >= k.von && st.idx <= k.bis) || kapitel[0];
  const imKapitel = jetzt ? st.idx - jetzt.von + 1 : 1;
  /* Steht der nächste Schritt in einem anderen Kapitel? Dann ist hier ein
     natürlicher Halt — und der gehört angeboten, statt stillschweigend
     weiterzulaufen. */
  const amKapitelende = !!jetzt && st.idx === jetzt.bis && st.idx < st.gesamt - 1;

  const weiter = () => {
    if (st.idx >= st.gesamt - 1) { akt.tourBeenden(); return; }
    const n = st.alle[st.idx + 1];
    akt.tourSchritt(st.idx + 1, punkt.id);
    if (n.ziel) gehZu(n.ziel);
  };
  const zurueck = () => { if (st.idx > 0) akt.tourSchritt(st.idx - 1, null); };
  const springe = (ziel) => {
    const n = st.alle[ziel];
    if (!n) return;
    akt.tourSchritt(ziel, null);
    if (n.ziel) gehZu(n.ziel);
  };

  /* Auf dem Telefon beginnt die Tour eingeklappt: aufgeklappt deckt sie bis zu 85 % der Fläche
     (Browserprobe 320 px). Wer sie ausdrücklich aufklappt, behält sie aufgeklappt. */
  const schmalerSchirm = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 560px)").matches;
  const eingeklappt = (p.tour || {}).eingeklappt === undefined ? schmalerSchirm : !!(p.tour || {}).eingeklappt;

  /* Gemeinsamer Rahmen beider Größen: eine schwebende Karte über dem
     Inhalt, nicht die volle Breite des Fensters. */
  const rahmen = {
    position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 900,
    maxWidth: eingeklappt ? 560 : 940, margin: "0 auto",
    background: C.flaeche, border: `1px solid ${C.lineStark}`, borderRadius: "var(--r-gross)",
    overflow: "hidden", boxShadow: "var(--schatten-blatt)",
    /* Nur ausgeblendet, nicht abgebaut: Schritt und Zustand bleiben, die Tour
       erscheint nach dem Schließen des Dialogs an derselben Stelle. */
    display: dialogOffen ? "none" : undefined,
  };

  /* ---------------------------- Eingeklappt ---------------------------
     Eine Zeile. Sie beantwortet nur noch, wo man steht und wie es
     weitergeht — alles Übrige ist einen Klick entfernt. */
  if (eingeklappt) {
    return (
      <div role="dialog" aria-label="Geführte Tour, eingeklappt" className="tourleiste" style={rahmen}>
        <div style={{ height: 3, background: C.bg }}>
          <div style={{ width: `${((st.idx + 1) / st.gesamt) * 100}%`, height: "100%",
            background: C.accent, transition: "width .25s" }} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 16px" }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
              textTransform: "uppercase", color: C.accent, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>{punkt.kapitel}</span>
            <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {punkt.titel}</span>
          </span>
          <span style={{ fontSize: 11.5, color: C.dimmer, flexShrink: 0, ...NUM }}>
            {st.idx + 1}/{st.gesamt}</span>
          <Btn size="sm" onClick={() => akt.tourEinklappen(false)}>Aufklappen</Btn>
          <Btn size="sm" kind="primary" onClick={weiter}>
            {st.idx >= st.gesamt - 1 ? "Fertig" : "Weiter"}</Btn>
          <button type="button" onClick={() => akt.tourSchliessen(false)} aria-label="Tour schließen"
            title="Tour schließen — unter Einstellungen fortsetzbar"
            style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer",
              fontFamily: "inherit", padding: "6px 8px", flexShrink: 0, display: "flex" }}><Icon n="x" size={18} strokeWidth={2.2} /></button>
        </div>
      </div>);
  }

  return (
    <div role="dialog" aria-label="Geführte Tour" className="tourleiste" style={rahmen}>

      {/* Fortschritt als dünner Balken ganz oben */}
      <div style={{ height: 3, background: C.bg }}>
        <div style={{ width: `${((st.idx + 1) / st.gesamt) * 100}%`, height: "100%",
          background: C.accent, transition: "width .25s" }} /></div>

      <div style={{ padding: "16px 20px 18px",
        display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
            flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
              textTransform: "uppercase", color: C.accent }}>{punkt.kapitel}</span>
            {/* Der Bezug im Kapitel trägt, der aufs Ganze entmutigt: „3 von 6"
                ist zu schaffen, „17 von 44" nicht. */}
            <span style={{ fontSize: 11.5, color: C.dim, ...NUM }}>
              Schritt {imKapitel} von {jetzt ? jetzt.anzahl : st.gesamt}</span>
            <span style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
              · Kapitel {(jetzt ? jetzt.idx : 0) + 1} von {kapitel.length}</span>
          </div>

          {/* Kapitel als Sprungmarken. Wer den Betrieb schon eingerichtet
              hat, muss die Einrichtung nicht noch einmal durchklicken. */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {kapitel.map((k) => {
              const hier = jetzt && k.idx === jetzt.idx;
              return (
                <button key={k.idx} type="button" onClick={() => springe(k.von)}
                  aria-current={hier ? "step" : undefined}
                  title={`${k.name} — ${k.gesehen} von ${k.anzahl} gesehen`}
                  style={{ padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11.5, lineHeight: 1.5,
                    border: `1px solid ${hier ? C.accent : C.lineSoft}`,
                    background: hier ? C.accentLight : "transparent",
                    color: hier ? C.accentDeep : k.fertig ? C.ok : C.dim,
                    fontWeight: hier ? 620 : 500 }}>
                  {k.fertig && !hier && <Icon n="haken" size={13} strokeWidth={2.4} />}{k.name}
                </button>);
            })}
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 640, letterSpacing: "-.02em",
            margin: "0 0 8px" }}>{punkt.titel}</h2>
          <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: 0, maxWidth: 640 }}>
            {punkt.text}</p>

          {punkt.tun && (
            <div style={{ display: "flex", gap: 9, marginTop: 12, fontSize: 14,
              alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ color: C.accent, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={14} /></span>
              <span style={{ fontWeight: 550 }}>{punkt.tun}</span>
            </div>)}

          {punkt.pruefen && (
            <div style={{ display: "flex", gap: 9, marginTop: 8, fontSize: 13.5,
              color: C.ok, alignItems: "flex-start", lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, display: "flex", marginTop: 2 }}><Icon n="haken" size={16} strokeWidth={2.2} /></span>
              <span>{punkt.pruefen}</span>
            </div>)}

          {punkt.merke && (
            <div style={{ marginTop: 12, paddingLeft: 13, borderLeft: `3px solid ${C.line}`,
              fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>{punkt.merke}</div>)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 190 }}>
          <div style={{ display: "flex", gap: 9 }}>
            <Btn size="sm" kind="quiet" disabled={st.idx === 0} onClick={zurueck}>Zurück</Btn>
            <Btn size="sm" kind="primary" onClick={weiter} style={{ flex: 1 }}>
              {st.idx >= st.gesamt - 1 ? "Fertig" : "Weiter"}</Btn>
          </div>
          {/* Einklappen steht vor dem Schließen: Wer nur Platz braucht,
              soll nicht den Faden verlieren müssen. */}
          <Btn size="sm" onClick={() => akt.tourEinklappen(true)}>Einklappen</Btn>
          {/* Am Kapitelende ausdrücklich anbieten aufzuhören. Wer weiß, dass
              hier ein Halt ist, hört seltener mittendrin auf — und findet
              beim nächsten Mal wieder hinein. */}
          {amKapitelende && (
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.45,
              padding: "8px 10px", borderRadius: 8, background: C.okLight }}>
              Ende von „{jetzt.name}". Guter Punkt für eine Pause — beim
              nächsten Mal geht es hier weiter.
            </div>)}
          <button onClick={() => akt.tourSchliessen(false)}
            style={{ border: "none", background: "transparent", color: C.dim, fontFamily: "inherit",
              fontSize: 13, cursor: "pointer", padding: "4px 0", textAlign: "left" }}>
            {amKapitelende ? "Für heute genug" : "Später fortsetzen"}</button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
            color: C.dim, cursor: "pointer" }}>
            <input type="checkbox" onChange={(e) => { if (e.target.checked) akt.tourSchliessen(true); }}
              style={{ width: 16, height: 16, accentColor: C.accent, cursor: "pointer" }} />
            Nächstes Mal nicht mehr anzeigen
          </label>
        </div>
      </div>
    </div>);
}

/* ==========================================================================
   EINSTELLUNGEN
   Was jede Rolle für sich ändern darf. Bewusst getrennt von der Verwaltung:
   Hier stehen persönliche Vorlieben, dort betriebliche Festlegungen.
   ========================================================================== */
function Einstellungen({ sitz, akt, gehZu }) {
  /* Der Betreiber hat keinen Mandanten und keine Person im Betrieb —
     für ihn bleibt nur, was ohne beides auskommt. */
  const p = sitz.person || { id: "betreiber", rolle: "betreiber", vorname: "", nachname: "" };
  const m = sitz.mandant;
  const rolleId = sitz.rolle === "betreiber" ? "betreiber" : (p.rolle || "mitarbeiter");
  const tour = useTour(true);
  const st = tourStand(p, rolleId, tour);
  const t = (tour || {})[rolleId] || (tour || {}).mitarbeiter;
  const [gespeichert, setGespeichert] = useState(null);
  const melde = (was) => { setGespeichert(was); setTimeout(() => setGespeichert(null), 2200); };
  /* Sicherungen (WP-25): Was die Rolle darf, sagt der Server über den
     Zugang (rolle aus dem Zugangscode), nicht die Rolle der Person im Plan. */
  const serverRolle = (SP.zugangsdaten() || {}).rolle || null;
  const [sicherungsRunde, setSicherungsRunde] = useState(0);
  /* Eine schlichte Rückmeldung am oberen Rand — die Anwendung hat dafür
     keinen eigenen Baustein, und für zwei Zeilen lohnt keiner. */
  const Hinweis = ({ children }) => <div role="status" className="toast">{children}</div>;

  /* Die Beschriftung steht links, das Bedienelement rechts — für das Auge
     eindeutig, für eine Vorlesesoftware zunächst nicht: Sie liest den Titel
     als Fließtext und danach ein namenloses Feld. Die Verbindung entsteht
     erst durch die Auszeichnung als Gruppe mit benanntem Titel. */
  const Zeile = ({ titel, text, children }) => {
    const kennung = `einst-${String(titel).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
    return (
      <div style={{ display: "flex", gap: 20, padding: "18px var(--pad-x)",
        borderBottom: `1px solid ${C.lineSoft}`, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div id={kennung} style={{ fontSize: 14.5, fontWeight: 600 }}>{titel}</div>
          {text && <div style={{ fontSize: 13, color: C.dim, marginTop: 4, lineHeight: 1.55 }}>
            {text}</div>}
        </div>
        <div role="group" aria-labelledby={kennung} style={{ flexShrink: 0, maxWidth: "100%" }}>{children}</div>
      </div>);
  };


  return (
    <div>
      <H1 rubrik="Verwaltung"
        sub="Was du für dich einstellen kannst. Betriebliche Festlegungen wie Arbeitszeitregeln stehen unter Betrieb.">
        Einstellungen</H1>

      {gespeichert && <Hinweis>{gespeichert}</Hinweis>}

      <div className="spalten2">
      <div>
      {/* ------------------------- Darstellung ------------------------- */}
      <Card>
        <CardHead>Darstellung</CardHead>
        <Zeile titel="Dichte"
          text="Kompakt zeigt mehr auf einmal, komfortabel ist ruhiger zu lesen.">
          <Seg value={p.dichte || "komfortabel"}
            onChange={(v) => { akt.setzeMeineEinstellung("dichte", v); melde("Dichte geändert."); }}
            options={[{ id: "komfortabel", label: "Komfortabel" }, { id: "kompakt", label: "Kompakt" }]} />
        </Zeile>
        <Zeile titel="Farbstimmung"
          text={"Vorgabe ist die Einstellung des Geräts. Dunkel schont die Augen im Nachtdienst — wer will, legt Hell oder Dunkel fest."}>
          <Seg value={p.thema || "auto"}
            onChange={(v) => { akt.setzeMeineEinstellung("thema", v);
              melde(v === "dunkel" ? "Dunkle Ansicht." : v === "hell" ? "Helle Ansicht."
                : "Folgt dem Gerät."); }}
            options={[{ id: "hell", label: "Hell" }, { id: "dunkel", label: "Dunkel" },
              { id: "auto", label: "Wie das Gerät" }]} />
        </Zeile>
        <Zeile titel="Erhöhter Kontrast"
          text="Verstärkt Ränder und Schrift. Hilft bei hellem Umgebungslicht und schwacher Sicht.">
          <Schalter an={!!p.kontrastmodus} label="Erhöhter Kontrast"
            onChange={(v) => { akt.setzeMeineEinstellung("kontrastmodus", v);
              melde(v ? "Kontrast erhöht." : "Kontrast normal."); }} />
        </Zeile>
        <Zeile titel="Bewegung reduzieren"
          text="Schaltet Übergänge und Animationen ab.">
          <Schalter an={!!p.wenigerBewegung} label="Bewegung reduzieren"
            onChange={(v) => { akt.setzeMeineEinstellung("wenigerBewegung", v); melde("Übernommen."); }} />
        </Zeile>
        <Zeile titel="Startansicht"
          text="Womit die Anwendung nach dem Anmelden öffnet.">
          <Sel value={p.startansicht || "start"} aria-label="Startansicht"
            onChange={(e) => { akt.setzeMeineEinstellung("startansicht", e.target.value);
              melde("Startansicht geändert."); }}>
            {(sitz.mandant ? NAV_KUNDE.filter((v) => ansichtErlaubt(sitz, v[2])) : [])
              .slice(0, 12).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>))}
          </Sel>
        </Zeile>
      </Card>

      {/* --------------------------- Zugang ---------------------------- */}
      <Card>
        <CardHead>Zugang</CardHead>
        <Zeile titel="Anmeldeadresse"
          text="Unter dieser Adresse erreichen dich Mitteilungen. Eine Änderung wird dem Betreiber angezeigt.">
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
            <Inp type="email" defaultValue={p.email || ""} id="ein-mail" aria-label="Anmeldeadresse"
              placeholder="name@betrieb.de" style={{ minWidth: 0, flex: "1 1 200px" }} />
            <Btn size="sm" onClick={() => {
              const el = document.getElementById("ein-mail");
              if (!el) return;
              const wert = el.value.trim();
              if (wert && !wert.includes("@")) { melde("Das sieht nicht nach einer Adresse aus."); return; }
              akt.setzeAnmeldeadresse(wert);
              melde("Adresse geändert.");
            }}>Übernehmen</Btn>
          </div>
        </Zeile>
        {p.emailGeaendert && (
          <Zeile titel="Zuletzt geändert"
            text={`Am ${fLang(String(p.emailGeaendert).slice(0, 10))} — der Betreiber wurde unterrichtet.`}>
            <Pill size="sm" tone="accent">vermerkt</Pill>
          </Zeile>)}
        <Zeile titel="Rolle"
          text="Wird von der Organisationsleitung vergeben und lässt sich hier nicht ändern.">
          <Pill tone="accent">{ROLLEN.find((r) => r.id === p.rolle)?.label || sitz.rolle}</Pill>
        </Zeile>
      </Card>

      {/* ------------------------ Geführte Tour ------------------------
          Der Inhalt kommt nachgeladen. Bis er da ist, bleibt die Karte weg —
          eine Karte mit leeren Feldern sieht aus wie ein Fehler. */}
      {t && (<Card>
        <CardHead right={st.anteil > 0 ? <Lab>{st.anteil} % durch</Lab> : null}>
          Geführte Tour</CardHead>
        <Zeile titel={t.titel}
          text={`${t.einleitung} Dauer: ${t.dauer}, ${st.gesamt} Schritte.`}>
          <div style={{ display: "flex", gap: 9 }}>
            {st.gesehen.length > 0 && !st.fertig && (
              <Btn size="sm" onClick={() => { akt.tourStarten(false); melde("Tour fortgesetzt."); }}>
                Fortsetzen</Btn>)}
            <Btn size="sm" kind="primary" onClick={() => { akt.tourStarten(true);
              melde("Tour beginnt von vorn."); }}>
              {st.gesehen.length ? "Von vorn" : "Starten"}</Btn>
          </div>
        </Zeile>
        <Zeile titel="Beim Anmelden anzeigen"
          text="Solange die Tour nicht abgeschlossen ist, startet sie beim Öffnen von selbst.">
          <Schalter an={!st.unterdrueckt} label="Tour beim Anmelden"
            onChange={(v) => { akt.setzeTourAnzeige(v);
              melde(v ? "Tour wird wieder angezeigt." : "Tour wird nicht mehr angezeigt."); }} />
        </Zeile>
        {st.fertig && (
          <Zeile titel="Abgeschlossen"
            text="Du hast die Tour vollständig durchlaufen. Sie lässt sich jederzeit erneut starten.">
            <Pill size="sm" tone="ok">fertig</Pill>
          </Zeile>)}

        {/* Kapitelweise einsteigen. Vierundvierzig Schritte am Stück macht
            niemand; ein Kapitel von sechs schon. */}
        <div style={{ padding: "16px var(--pad-x) 20px" }}>
          <Lab style={{ marginBottom: 9 }}>Kapitel</Lab>
          <div style={{ display: "grid", gap: 7 }}>
            {tourKapitel(tour, rolleId, st.gesehen).map((k) => (
              <div key={k.idx} style={{ display: "flex", gap: 12, alignItems: "center",
                padding: "9px 12px", borderRadius: "var(--r)", border: `1px solid ${C.lineSoft}`,
                flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 160, display: "inline-flex", gap: 7,
                  alignItems: "center", color: k.fertig ? C.dim : C.text }}>
                  {k.fertig && <Icon n="haken" size={14} strokeWidth={2.3} />}{k.name}</span>
                <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>
                  {k.gesehen} von {k.anzahl}</span>
                <Btn size="sm" kind={k.fertig ? "plain" : "quiet"}
                  onClick={() => { akt.tourAbKapitel(k.von); melde(`„${k.name}" gestartet.`); }}>
                  {k.gesehen ? "Erneut" : "Starten"}</Btn>
              </div>))}
          </div>
        </div>
      </Card>)}

      {/* ------------------- Kalender und Weckzeiten ------------------- */}
      {sitz.mandant && sitz.person && sitz.person.imSchichtdienst !== false && (
        <Card>
          <CardHead>Kalender und Weckzeiten</CardHead>

          <Zeile titel="Dienstplan im eigenen Kalender"
            text={p.kalenderVerweis
              ? "Der Verweis ist eingerichtet. Er aktualisiert sich von selbst, wenn sich dein Plan ändert."
              : "Abonniere deinen Plan in Apple, Google oder Outlook. Er aktualisiert sich dann von selbst — du musst nichts abtippen."}>
            <div style={{ display: "flex", gap: 9 }}>
              {p.kalenderVerweis && (
                <Btn size="sm" onClick={() => {
                  try { navigator.clipboard.writeText(p.kalenderVerweis); melde("Verweis kopiert."); }
                  catch { melde("Kopieren nicht möglich."); }
                }}>Verweis kopieren</Btn>)}
              <Btn size="sm" kind={p.kalenderVerweis ? undefined : "primary"}
                onClick={async () => { await akt.kalenderEinrichten();
                  melde(p.kalenderVerweis ? "Neuer Verweis erzeugt." : "Kalender eingerichtet."); }}>
                {p.kalenderVerweis ? "Neu erzeugen" : "Einrichten"}</Btn>
            </div>
          </Zeile>

          {p.kalenderVerweis && (<>
            <Zeile titel="Dein Verweis"
              text="Wer ihn hat, sieht deine Dienste. Nicht öffentlich teilen — bei Verdacht neu erzeugen.">
              <code style={{ fontSize: 11.5, padding: "7px 11px", borderRadius: 8,
                background: C.bg, border: `1px solid ${C.line}`, maxWidth: 300,
                display: "block", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", ...NUM }}>{p.kalenderVerweis}</code>
            </Zeile>
            <Zeile titel="Abschalten"
              text="Der Verweis wird ungültig, abonnierte Kalender leeren sich.">
              <Btn size="sm" onClick={async () => { await akt.kalenderLoeschen();
                melde("Kalender abgeschaltet."); }}>Entfernen</Btn>
            </Zeile>
          </>)}

          <Zeile titel="Weckruf zur Schicht"
            text="CENTRIC kennt deinen Plan — der Weckruf richtet sich danach, ohne dass du etwas einträgst.">
            <Schalter an={!!(p.weckzeit || {}).aktiv} label="Weckruf"
              onChange={(v) => { akt.setzeWeckzeit({ aktiv: v });
                melde(v ? "Weckruf eingeschaltet." : "Weckruf aus."); }} />
          </Zeile>
          {(p.weckzeit || {}).aktiv && (<>
            <Zeile titel="Vorlauf zum Aufstehen"
              text="Wie lange du vom Wecken bis zum Losfahren brauchst.">
              <Sel value={(p.weckzeit || {}).vorlauf || 75}
                onChange={(e) => akt.setzeWeckzeit({ vorlauf: Number(e.target.value) })}>
                {[30, 45, 60, 75, 90, 120].map((v) => (
                  <option key={v} value={v}>{v} Minuten</option>))}</Sel>
            </Zeile>
            <Zeile titel="Anfahrt"
              text="Wird zum Vorlauf addiert.">
              <Sel value={(p.weckzeit || {}).anfahrt ?? 20}
                onChange={(e) => akt.setzeWeckzeit({ anfahrt: Number(e.target.value) })}>
                {[0, 10, 15, 20, 30, 45, 60].map((v) => (
                  <option key={v} value={v}>{v === 0 ? "keine" : `${v} Minuten`}</option>))}</Sel>
            </Zeile>
            {(() => {
              const k = kommendeWeckzeiten(m, p.id, 7);
              return (
                <Zeile titel="Die nächsten Weckrufe"
                  text={k.length ? "" : "In den nächsten sieben Tagen hast du keinen Dienst."}>
                  {k.length > 0 && (
                    <div style={{ display: "grid", gap: 5, fontSize: 13, textAlign: "right" }}>
                      {k.slice(0, 4).map((w, i) => (
                        <div key={i}>
                          <b style={{ ...NUM }}>{w.zeit}</b>
                          <span style={{ color: C.dim }}>
                            {" "}{fKurz(w.datum)}{w.vortag ? " (Vortag)" : ""} · {w.dienst}</span>
                        </div>))}
                    </div>)}
                </Zeile>);
            })()}
          </>)}

          <Zeile titel="Verfügbarkeit teilen"
            text="Zeigt der Familie nur, wann du frei bist — keine Dienstart, kein Ort, kein Betriebsname.">
            <Btn size="sm" onClick={() => { akt.verfuegbarkeitTeilen(14);
              melde("Übersicht in die Zwischenablage kopiert."); }}>
              Nächste 14 Tage</Btn>
          </Zeile>
        </Card>)}


      {/* ----------------------- Datenschutz --------------------------- */}
      {sitz.mandant ? (<Card>
        <CardHead>Deine Daten</CardHead>
        <Zeile titel="Auskunft nach Artikel 15"
          text="Alles, was über dich gespeichert ist, als Datei.">
          <Btn size="sm" onClick={() => { akt.auskunftErzeugen(p.id); melde("Auskunft erzeugt."); }}>
            Erzeugen</Btn>
        </Zeile>
        <Zeile titel="Was gespeichert wird"
          text="Dienste, Zeiten, Anträge, Qualifikationen und Nachweise. Beim Stempeln werden Ergebnis, grob gerundete Entfernung, Messgenauigkeit und Prüfort festgehalten — keine Koordinate, kein Verlauf.">
          <Btn size="sm" kind="quiet" onClick={() => gehZu("handbuch")}>Im Handbuch</Btn>
        </Zeile>
        <Zeile titel="Verbindung trennen"
          text="Meldet dich auf diesem Gerät ab. Der Zugangscode bleibt gültig.">
          <Btn size="sm" onClick={() => akt.verbindungTrennen()}>Abmelden</Btn>
        </Zeile>
      </Card>) : (<Card>
        <CardHead>Zugang</CardHead>
        <Zeile titel="Verbindung trennen"
          text="Meldet dich auf diesem Gerät ab.">
          <Btn size="sm" onClick={() => akt.verbindungTrennen()}>Abmelden</Btn>
        </Zeile>
      </Card>)}
      </div>
      <div>
      {/* ---------------------- Benachrichtigungen --------------------- */}
      {sitz.mandant && <Card>
        <CardHead>Benachrichtigungen</CardHead>
        <Zeile titel="Mitteilungen auf diesem Gerät"
          text={SP.pushMoeglich()
            ? "Bei kurzfristigen Änderungen wirst du sofort unterrichtet."
            : "Dieses Gerät unterstützt keine Mitteilungen. Auf dem iPhone muss CENTRIC dafür auf dem Startbildschirm liegen."}>
          <Schalter an={SP.pushErlaubt()} label="Mitteilungen"
            onChange={(v) => akt.pushUmschalten(v)} />
        </Zeile>
        {/* WP-30: Sammelschalter je Kanal — aus bedeutet: über diesen Weg geht nichts hinaus. */}
        {[["mail", "E-Mail insgesamt", "Aus: keine Benachrichtigung per E-Mail, gleich welche Art."],
          ["push", "Gerätemitteilungen insgesamt", "Aus: keine Benachrichtigung auf dieses oder ein anderes Gerät."]].map(([weg, titel, text]) => {
          const an = !(p.zustellung && p.zustellung.kanal && p.zustellung.kanal[weg] === false);
          return (
            <Zeile key={weg} titel={titel} text={text}>
              <Schalter an={an} label={titel} onChange={(v) => akt.setzeZustellungKanal(p.id, weg, v)} />
            </Zeile>);
        })}
        {Object.entries(ZUSTELLARTEN).map(([id, a]) => {
          const w = zustellwege(p, id);
          return (
            <Zeile key={id} titel={a.titel} text={a.text}>
              <div style={{ display: "flex", gap: 8 }}>
                {[["mail", "E-Mail", w.mail], ["push", "Gerät", w.push]].map(([weg, label, an]) => (
                  <button key={weg} type="button" className="chip" aria-pressed={!!an}
                    onClick={() => akt.setzeZustellung(p.id, id, weg, !an)}
                    style={{ minWidth: 82, justifyContent: "center", fontWeight: 600,
                      borderColor: an ? C.accent : undefined,
                      background: an ? C.accentLight : C.flaeche, color: an ? C.accent : C.dim }}>
                    {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{label}</button>))}
              </div>
            </Zeile>);
        })}
      </Card>}

      {/* ------------------- Nur für die Leitung ----------------------- */}
      {sitz.mandant && darf(sitz, "mandant.edit") && (
        <Card>
          <CardHead>Für den Betrieb</CardHead>
          <Zeile titel="Arbeitszeitregeln, Standorte, Dienstarten"
            text="Betriebliche Festlegungen stehen getrennt — sie gelten für alle, nicht nur für dich.">
            <Btn size="sm" onClick={() => gehZu("betrieb")}>Zum Betrieb</Btn>
          </Zeile>
          <Zeile titel="Datenmitnahme"
            text="Alle Daten als CSV, jederzeit, ohne Gebühr.">
            <Btn size="sm" onClick={() => gehZu("mitnahme")}>Öffnen</Btn>
          </Zeile>
          <Zeile titel="Sicherung anlegen"
            text="Legt eine Kopie des heutigen Standes an. Zurückspielen kann die Leitung unten unter „Sicherungen“.">
            <Btn size="sm" onClick={async () => { await akt.sicherungAnlegen(); melde("Sicherung angelegt."); setSicherungsRunde((n) => n + 1); }}>
              Jetzt sichern</Btn>
          </Zeile>
        </Card>)}

      {/* ------------- Sicherungen: Liste und Zurückspielen (WP-25) ------------- */}
      {sitz.mandant && SP.angemeldet() && darfSicherungenSehen(serverRolle) && (
        <SicherungenVerwalten key={sicherungsRunde} rolle={serverRolle}
          laden={akt.sicherungenLaden} zurueckspielen={akt.zurueckspielen} />)}

      </div>
      </div>
    </div>);
}

/* ==========================================================================
   MANDANT ANLEGEN — Betreiberansicht
   Ein Formular, ein Knopf, danach die Zugangscodes. Sie erscheinen genau
   einmal; danach sind sie nur noch als Prüfsumme gespeichert und lassen
   sich nicht wiederherstellen. Deshalb steht das auch so dort.
   ========================================================================== */
function MandantNeuAnlegen({ db, akt, onFertig }) {
  const [name, setName] = useState("");
  const [branche, setBranche] = useState("sicherheit");
  const [anschrift, setAnschrift] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [extra, setExtra] = useState(["subplaner", "mitarbeiter"]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  /* SI-P6: Code des zweiten Faktors; und: steht der Raum schon, fehlen nur noch die Zugänge (kein zweites Anlegen). */
  const [faktor, setFaktor] = useState("");
  const [angelegt, setAngelegt] = useState(null);

  const raum = name.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  const anlegen = async () => {
    if (!name.trim() || laeuft) return;
    setLaeuft(true); setFehler(null);
    try {
      const m = angelegt ? angelegt.m : mandantAnlegen({ name: name.trim(), branche, anschrift, kontakt,
        zusatzRollen: extra });
      const zielRaum = angelegt ? angelegt.raum : raum;
      /* Erst der Raum, dann die Zugänge. Andersherum gäbe es Codes, die
         ins Leere führen. */
      if (!angelegt) {
        await SP.bestandAnlegen(raum, { version: 5, mandanten: [m], session: null,
          tarife: db.tarife, betreiber: db.betreiber || BETREIBER_LEER, stand: 1 });
        setAngelegt({ m, raum });
      }
      const codes = await SP.zugaengeErzeugen(zielRaum,
        m.personen.map((p) => ({ rolle: p.rolle, personId: p.id, name: m.name })), faktor.trim());
      setFaktor("");
      setErgebnis({ mandant: m, raum: zielRaum, codes: codes.map((c) => ({ ...c,
        label: ROLLEN.find((r) => r.id === c.rolle)?.label || c.rolle })) });
      akt.mandantVermerken({ id: m.id, name: m.name, branche, raum: zielRaum,
        angelegt: new Date().toISOString(), zugaenge: codes.length });
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(false); }
  };

  if (ergebnis) return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ padding: "20px 22px", borderRadius: 12, background: C.okLight,
        border: `1px solid ${C.ok}33` }}>
        <div style={{ fontSize: 17, fontWeight: 640, marginBottom: 6 }}>
          {ergebnis.mandant.name} ist angelegt</div>
        <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>
          Der Betrieb startet leer — kein Beispielpersonal, keine erfundenen Dienstpläne.
          Ein Standort, drei Dienstarten und die gesetzlichen Grundwerte sind vorbereitet.
        </div>
      </div>

      <Card>
        <CardHead right={<Lab>{zahl(ergebnis.codes.length)} Zugänge</Lab>}>Zugangscodes</CardHead>
        <div style={{ padding: "16px var(--pad-x)", fontSize: 13.5, color: C.danger,
          lineHeight: 1.55, borderBottom: `1px solid ${C.lineSoft}` }}>
          <b>Jetzt notieren.</b> Die Codes werden nur als Prüfsumme gespeichert und lassen
          sich nicht wiederherstellen. Geht einer verloren, muss ein neuer erzeugt werden.
        </div>
        {ergebnis.codes.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16,
            padding: "15px var(--pad-x)",
            borderBottom: i < ergebnis.codes.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>
                {ROLLEN.find((r) => r.id === c.rolle)?.beschreibung || ""}</div>
            </div>
            <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".08em",
              padding: "9px 14px", borderRadius: 8, background: C.bg,
              border: `1px solid ${C.line}`, ...NUM }}>{c.code}</code>
            <Btn size="sm" onClick={() => {
              try { navigator.clipboard.writeText(c.code); } catch { /* egal */ }
            }}>Kopieren</Btn>
          </div>))}
        <div style={{ padding: "16px var(--pad-x)", display: "flex", gap: 10 }}>
          <Btn onClick={() => {
            const txt = [`CENTRIC — Zugänge für ${ergebnis.mandant.name}`, "",
              ...ergebnis.codes.map((c) => `${c.label.padEnd(24)} ${c.code}`),
              "", ANWENDUNG_URL,
              "Der Code gilt zwölf Stunden je Anmeldung.",
              "Beim ersten Öffnen startet die geführte Tour."].join("\\n");
            const b = new Blob([txt], { type: "text/plain;charset=utf-8" });
            const u = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = u; a.download = `zugaenge-${ergebnis.raum}.txt`; a.click();
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          }}>Als Datei sichern</Btn>
          <Btn kind="primary" onClick={onFertig}>Fertig</Btn>
        </div>
      </Card>
    </div>);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Name des Betriebs" hint="Erscheint in der Anwendung und auf Rechnungen.">
        <Inp value={name} autoFocus onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Nordwacht Sicherheitsdienste" /></Field>

      {name.trim() && (
        <div style={{ fontSize: 13, color: C.dim, marginTop: -8 }}>
          Datenraum: <code style={{ ...NUM }}>{raum}</code>
        </div>)}

      <Field label="Branche" hint="Bestimmt Begriffe und verfügbare Pakete.">
        <Sel value={branche} onChange={(e) => setBranche(e.target.value)}>
          <option value="sicherheit">Sicherheitsdienst</option>
          <option value="pflege">Pflege</option>
          <option value="klinik">Klinik</option>
          <option value="industrie">Produktion</option>
          <option value="sonstige">Sonstige</option>
        </Sel></Field>

      <Field label="Anschrift"><Inp value={anschrift}
        onChange={(e) => setAnschrift(e.target.value)} placeholder="Straße, PLZ Ort" /></Field>
      <Field label="Ansprechpartner"><Inp value={kontakt}
        onChange={(e) => setKontakt(e.target.value)} placeholder="Name, Telefon" /></Field>

      <div>
        <Lab>Zugänge</Lab>
        <div style={{ fontSize: 13, color: C.dim, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Organisationsleitung und Planung entstehen immer. Weitere kannst du gleich
          mitgeben oder später erzeugen.
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          {[["leitung", "Organisationsleitung", true], ["planer", "Planung", true],
            ["subplaner", "Schichtverantwortung", false],
            ["mitarbeiter", "Beschäftigte", false],
            ["betriebsrat", "Betriebsrat (kostenfrei)", false]].map(([id, label, fest]) => (
            <label key={id} style={{ display: "flex", alignItems: "center", gap: 11,
              padding: "11px 14px", borderRadius: 10, cursor: fest ? "default" : "pointer",
              border: `1px solid ${fest || extra.includes(id) ? C.accent : C.line}`,
              background: fest || extra.includes(id) ? C.accentLight : "transparent" }}>
              <input type="checkbox" disabled={fest} checked={fest || extra.includes(id)}
                onChange={(e) => setExtra(e.target.checked
                  ? [...extra, id] : extra.filter((x) => x !== id))}
                style={{ width: 17, height: 17, accentColor: C.accent }} />
              <span style={{ fontSize: 14, fontWeight: 550 }}>{label}</span>
              {fest && <span style={{ fontSize: 12, color: C.dim, marginLeft: "auto" }}>
                immer dabei</span>}
            </label>))}
        </div>
      </div>

      <Field label="Code aus der Authenticator-App (zweiter Faktor)"
        hint={angelegt
          ? "Der Betrieb steht schon. Es fehlen nur die Zugänge: bitte den nächsten Code abwarten und eingeben."
          : "Pflicht, sobald für deinen Betreibercode ein zweiter Faktor eingerichtet ist. Jeder Code gilt nur einmal."}>
        <Inp value={faktor} inputMode="numeric" autoComplete="one-time-code" maxLength={16}
          onChange={(e) => setFaktor(e.target.value)} placeholder="6-stelliger Code" /></Field>

      {fehler && (
        <div role="alert" style={{ padding: "13px 16px", borderRadius: 10,
          background: C.dangerLight, color: C.danger, fontSize: 13.5, lineHeight: 1.5 }}>
          {fehler}</div>)}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn kind="quiet" onClick={onFertig}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!name.trim() || laeuft} onClick={anlegen}>
          {laeuft ? "Wird angelegt …" : "Anlegen und Zugänge erzeugen"}</Btn>
      </div>
    </div>);
}

/* ==========================================================================
   SELBSTPLANUNG — Ansicht für die Planung
   Links der Stand der Runde, rechts das Monatsraster mit den offenen
   Diensten. Wer hat sich eingetragen, wo klaffen noch Lücken.
   ========================================================================== */
function Selbstplanung({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  const darfFuehren = darf(sitz, "plan.edit.all") || darf(sitz, "plan.edit.unit");
  const [neu, setNeu] = useState(false);
  const [monat, setMonat] = useState(addDays(heute(), 40).slice(0, 7));
  const [tage, setTage] = useState(7);

  const runden = (m.selbstplanung || []);
  const laufend = laufendeRunde(m);
  const [gewaehlt, setGewaehlt] = useState(null);
  const r = runden.find((x) => x.id === gewaehlt) || laufend || runden[0] || null;
  const f = r ? selbstplanFortschritt(m, r) : null;
  const lage = r ? selbstplanLage(m, r) : [];

  return (
    <div>
      <H1 rubrik="Planung"
        sub="Die Belegschaft macht den Erstentwurf, du schließt die Lücken. Wer sich einträgt, bekommt den Dienst — geprüft wird beim Eintragen, nicht hinterher."
        right={darfFuehren && !laufend && <Btn kind="primary" onClick={() => setNeu(true)}>
          Runde öffnen</Btn>}>
        Selbstplanung</H1>

      {runden.length === 0 ? (
        <Card><Leer titel="Noch keine Runde"
          text="Öffne eine Runde für einen kommenden Monat. Die Belegschaft trägt sich ein, danach übernimmst du den Entwurf und füllst den Rest."
          aktion={darfFuehren && <Btn kind="primary" onClick={() => setNeu(true)}>Erste Runde öffnen</Btn>} />
        </Card>
      ) : (<>
        {/* ---------------------- Der Stand ------------------------- */}
        {r && f && (
          <Kennzahlen min={180} kacheln={[
            { label: "Belegt", wert: `${f.belegt} von ${f.gesamt}`, sub: `${f.anteil} %`,
              ton: f.anteil >= 80 ? "ok" : f.anteil >= 50 ? "warn" : "danger" },
            { label: "Beteiligung", wert: `${f.beteiligt} von ${f.moeglich}`, sub: `${f.beteiligung} %`,
              ton: f.beteiligung >= 60 ? "ok" : "warn" },
            { label: "Eintragungen", wert: zahl(f.eintraege), sub: "insgesamt" },
            { label: "Noch offen", wert: zahl(f.offen), sub: f.offen ? "Dienste" : "nichts",
              ton: f.offen ? "warn" : "ok" }]} />)}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,300px) minmax(0,1fr)",
          gap: 24, alignItems: "start" }}>

          {/* ------------------- Liste der Runden ------------------- */}
          <div>
            <Card style={{ marginBottom: 16 }}>
              <CardHead right={<Lab>{zahl(runden.length)}</Lab>}>Runden</CardHead>
              {runden.map((x, i) => {
                const st = SELBSTPLAN_STATUS[x.status] || SELBSTPLAN_STATUS.offen;
                const an = r && x.id === r.id;
                return (
                  <button key={x.id} onClick={() => setGewaehlt(x.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "13px var(--pad-x)", border: "none", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit", color: C.text,
                      background: an ? C.accentLight : "transparent",
                      borderLeft: `3px solid ${an ? C.accent : "transparent"}`,
                      borderBottom: i < runden.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: an ? 640 : 550 }}>
                        {MON[Number(x.monat.slice(5)) - 1]} {x.monat.slice(0, 4)}</span>
                      <span style={{ display: "block", fontSize: 12, color: C.dim, marginTop: 3 }}>
                        {(x.eintraege || []).length} Eintragungen</span>
                    </span>
                    <Pill size="sm" tone={st.ton}>{st.label}</Pill>
                  </button>);
              })}
            </Card>

            {r && darfFuehren && (
              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, marginBottom: 14 }}>
                  {(SELBSTPLAN_STATUS[r.status] || {}).text}
                  {r.status === "offen" && r.schliesst
                    ? ` Schließt am ${fKurz(r.schliesst)}.` : ""}
                </div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  {r.status === "offen" && (
                    <Btn size="sm" onClick={() => akt.rundeSchliessen(r.id)}>Schließen</Btn>)}
                  {r.status === "geschlossen" && (
                    <Btn size="sm" kind="primary" onClick={() => akt.mitWarnung(m, { titel: "Selbstplanung übernehmen",
                      eintraege: (r.eintraege || []).map((e, idx) => ({ personId: e.personId, datum: e.datum, dienstId: e.dienstId, idx })),
                      knopf: "Übernehmen",
                      fussnote: "Was du nicht auswählst, wird nicht übernommen und bleibt mit Grund an der Runde sichtbar.",
                      ausfuehren: (best) => akt.rundeUebernehmen(r.id, best) })}>
                      In den Plan übernehmen</Btn>)}
                  {r.status === "uebernommen" && (
                    <div style={{ fontSize: 13, color: C.ok }}>
                      {zahl(r.uebernommen || 0)} übernommen
                      {r.verworfen ? `, ${zahl(r.verworfen)} nicht übernommen` : ""}</div>)}
                </div>
                {r.status === "uebernommen" && (r.nichtUebernommen || []).length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12.5, color: C.dim, cursor: "pointer" }}>Nicht übernommen, mit Grund</summary>
                    {r.nichtUebernommen.map((e, k) => {
                      const pp = m.personen.find((x) => x.id === e.personId);
                      return (
                        <div key={k} style={{ fontSize: 12.5, color: C.dim, padding: "4px 0", lineHeight: 1.45 }}>
                          {pp ? `${pp.nachname}, ${pp.vorname}` : "?"} · {fKurz(e.datum)} · {NICHT_UEBERNOMMEN_GRUENDE[e.grund] || NICHT_UEBERNOMMEN_GRUENDE.befund}</div>);
                    })}
                  </details>)}
                {r.status === "geschlossen" && (
                  <div style={{ fontSize: 12.5, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
                    Beim Übernehmen wird jeder Eintrag noch einmal geprüft. Einträge mit Befund
                    zeigt der Warndialog; du entscheidest je Eintrag. Nichts wird still verworfen.
                  </div>)}
              </Card>)}
          </div>

          {/* --------------------- Das Monatsraster ----------------- */}
          {r && (
            <Card>
              <CardHead right={<Lab>Mindestbesetzung</Lab>}>
                {MON[Number(r.monat.slice(5)) - 1]} {r.monat.slice(0, 4)}</CardHead>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                  <thead><tr>
                    <th style={{ textAlign: "left", padding: "10px var(--pad-x)" }}><Lab>Tag</Lab></th>
                    {m.dienstarten.filter((d) => !d.posten).map((d) => (
                      <th key={d.id} style={{ padding: "10px 12px", textAlign: "center" }}>
                        <Lab>{d.kurz}</Lab></th>))}
                  </tr></thead>
                  <tbody>
                    {lage.map((t) => {
                      const we = [5, 6].includes(dow(t.datum));
                      return (
                        <tr key={t.datum} style={{ background: we ? C.flaecheStill : "transparent" }}>
                          <td style={{ padding: "8px var(--pad-x)", fontSize: 13,
                            borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: "nowrap" }}>
                            {fKurz(t.datum)}</td>
                          {t.dienste.map((x) => (
                            <td key={x.dienst.id} style={{ padding: "8px 12px", textAlign: "center",
                              borderBottom: `1px solid ${C.lineSoft}` }}>
                              {x.soll === 0 ? (
                                <span style={{ color: C.aus, fontSize: 12 }}>—</span>
                              ) : (
                                <span style={{ display: "inline-block", minWidth: 44,
                                  padding: "3px 8px", borderRadius: 8, fontSize: 12.5,
                                  fontWeight: 600, ...NUM,
                                  background: x.gedeckt ? C.okLight : x.drin > 0 ? C.warnLight : C.dangerLight,
                                  color: x.gedeckt ? C.ok : x.drin > 0 ? C.warn : C.danger }}>
                                  {x.drin}/{x.soll}</span>)}
                            </td>))}
                        </tr>);
                    })}
                  </tbody>
                </table>
              </div>
            </Card>)}
        </div>
      </>)}

      {/* ---------------------- Runde öffnen ---------------------- */}
      {neu && (
        <Sheet open onClose={() => setNeu(false)} titel="Selbstplanung öffnen" width={520}>
          <div style={{ display: "grid", gap: 18 }}>
            <Field label="Für welchen Monat?"
              hint="Sinnvoll ist der übernächste — die Belegschaft braucht Zeit, und danach willst du noch planen.">
              <Inp type="month" value={monat} onChange={(e) => setMonat(e.target.value)} /></Field>
            <Field label="Wie lange offen?"
              hint="Danach schließt die Runde und du füllst die Lücken.">
              <Sel value={tage} onChange={(e) => setTage(Number(e.target.value))}>
                {[3, 5, 7, 10, 14].map((v) => (
                  <option key={v} value={v}>{v} Tage</option>))}</Sel></Field>

            <Erklaerkasten>
              Alle Beschäftigten im Schichtdienst werden unterrichtet. Beim Eintragen
              prüft CENTRIC Ruhezeit, Qualifikation, Abwesenheit und das Stundenziel —
              wer sich einträgt, bekommt den Dienst auch.
            </Erklaerkasten>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={() => { akt.rundeOeffnen(monat, tage); setNeu(false); }}>
                Runde öffnen</Btn>
            </div>
          </div>
        </Sheet>)}
    </div>);
}

/* ==========================================================================
   NOTRUFE — Ansicht für Planung und Schichtverantwortung
   Was offen ist, steht oben und bleibt dort, bis jemand bestätigt.
   ========================================================================== */
function Notrufe({ sitz, akt }) {
  const m = sitz.mandant;
  const offen = offeneNotrufe(m);
  const erledigt = (m.notrufe || []).filter((n) => n.bestaetigt)
    .sort((a, b) => b.zeit.localeCompare(a.zeit)).slice(0, 30);

  const Zeile = ({ n, offen: istOffen }) => {
    const p = m.personen.find((x) => x.id === n.personId);
    const a = NOTRUF_ARTEN[n.art] || NOTRUF_ARTEN.hilfe;
    const alter = Math.round((Date.now() - new Date(n.zeit).getTime()) / 60000);
    return (
      <div style={{ padding: "18px var(--pad-x)", borderBottom: `1px solid ${C.lineSoft}`,
        background: istOffen && a.dringend ? C.dangerLight : "transparent" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, flexShrink: 0,
            background: istOffen ? (a.dringend ? C.danger : C.warn) : C.ok }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 640,
              color: istOffen && a.dringend ? C.danger : C.text }}>{a.label}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              {p ? `${p.vorname} ${p.nachname}` : "unbekannt"}
              {n.dienst ? ` · ${n.dienst}` : ""}{n.ort ? ` · ${n.ort}` : ""}</div>
            {n.notiz && <div style={{ fontSize: 13.5, color: C.dim, marginTop: 6,
              lineHeight: 1.5 }}>{n.notiz}</div>}
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 7, ...NUM }}>
              {new Date(n.zeit).toLocaleString("de-DE")}
              {istOffen ? ` · vor ${alter < 60 ? `${alter} Min` : `${Math.round(alter / 60)} Std`}` : ""}
              {n.bestaetigt ? ` · bestätigt von ${n.durch || "unbekannt"}` : ""}</div>
          </div>
          {istOffen && (
            <Btn size="sm" kind="primary" onClick={() => akt.notrufBestaetigen(n.id)}>
              Übernehme ich</Btn>)}
        </div>
      </div>);
  };

  return (
    <div>
      <H1 rubrik="Heute"
        sub="Notrufe aus Alleindiensten. Was offen ist, bleibt hier stehen, bis jemand bestätigt — auch nach einem Neuladen.">
        Notrufe</H1>

      {offen.length === 0 && erledigt.length === 0 ? (
        <Card><Leer titel="Keine Notrufe"
          text="Beschäftigte im Alleindienst können über die Telefonansicht Hilfe anfordern. Die Meldung geht zuerst an die Schichtverantwortung, dann an die Planung." /></Card>
      ) : (
        <Leitraster seiteBreite={340}
          haupt={<>
            {offen.length > 0 && (
              <Card style={{ borderColor: C.danger, borderWidth: 2 }}>
                <CardHead right={<Pill tone="danger">{zahl(offen.length)} offen</Pill>}>
                  Nicht bestätigt</CardHead>
                {offen.map((n) => <Zeile key={n.id} n={n} offen />)}
              </Card>)}

            {erledigt.length > 0 && (
              <Card>
                <CardHead right={<Lab>letzte {zahl(erledigt.length)}</Lab>}>Bestätigt</CardHead>
                {erledigt.map((n) => <Zeile key={n.id} n={n} offen={false} />)}
              </Card>)}
          </>}
          seite={(() => {
            /* Der Rückblick zählt, was im Bestand steht — sieben Tage,
               nach Art. Die Quittierzeit ist der Abstand zwischen Meldung
               und Bestätigung, wo beides vorliegt. */
            const grenze = Date.now() - 7 * 86400000;
            const woche = (m.notrufe || []).filter((n) => new Date(n.zeit).getTime() >= grenze);
            if (!woche.length) return null;
            const nachArt = Object.entries(NOTRUF_ARTEN).map(([id, a]) => ({ id, a,
              n: woche.filter((n) => (NOTRUF_ARTEN[n.art] ? n.art : "hilfe") === id).length })).filter((x) => x.n > 0);
            const hoechst = Math.max(...nachArt.map((x) => x.n));
            const zeiten = woche.filter((n) => n.bestaetigt).map((n) =>
              (new Date(n.bestaetigt).getTime() - new Date(n.zeit).getTime()) / 1000).filter((x) => x >= 0);
            const mittel = zeiten.length ? zeiten.reduce((x, y) => x + y, 0) / zeiten.length : null;
            const text = (sek) => sek < 90 ? `${Math.round(sek)} s` : sek < 5400 ? `${Math.round(sek / 60)} min`
              : `${n1(sek / 3600)} h`;
            return (<>
              <Seitenkarte titel="Sieben Tage im Rückblick" sub={`${zahl(woche.length)} ${woche.length === 1 ? "Meldung" : "Meldungen"}`}>
                {nachArt.map((x) => (
                  <Balkenzeile key={x.id} label={x.a.label} wert={x.n} anteil={(x.n / hoechst) * 100}
                    ton={x.a.dringend ? "danger" : "warn"} punkt />))}
              </Seitenkarte>
              {mittel !== null && (
                <Seitenkarte titel="Mittlere Quittierzeit" sub={`aus ${zahl(zeiten.length)} bestätigten Meldungen`}>
                  <Grosszahl wert={text(mittel)} />
                </Seitenkarte>)}
            </>);
          })()} />
      )}
    </div>);
}

/* ==========================================================================
   BERICHT AN DEN AUFTRAGGEBER
   Was nach außen darf, in einer Fassung zum Weitergeben.
   ========================================================================== */
function Auftraggeberbericht({ sitz, akt }) {
  const m = sitz.mandant;
  const [von, setVon] = useState(addDays(heute(), -30));
  const [bis, setBis] = useState(heute());
  const [einheit, setEinheit] = useState(m.einheiten[0] ? m.einheiten[0].id : "");
  const [anmerkung, setAnmerkung] = useState("");
  const b = useMemo(() => einheit ? auftraggeberBericht(m, von, bis, einheit) : null,
    [m, von, bis, einheit]);
  const e = m.einheiten.find((x) => x.id === einheit);
  /* Wie viele Übergaben es im Zeitraum überhaupt gibt — die Antwort auf
     „warum steht hier nichts". */
  const uebergabenImZeitraum = uebergabenVon(m)
    .filter((u) => u && u.datum >= von && u.datum <= bis).length;

  const alsText = () => {
    if (!b) return "";
    const anm = anmerkung.trim();
    return [
      `Leistungsnachweis ${m.name}`,
      e ? `${m.einheitLabel || "Einheit"}: ${e.name}` : "",
      `Zeitraum: ${fLang(b.von)} bis ${fLang(b.bis)}`,
      "",
      `Besetzung vollständig an ${b.vollstaendig} von ${b.tage} Tagen` +
        (b.quote !== null ? ` (${b.quote} %)` : "") +
        (b.betriebsweit ? " — Betrieb gesamt; die Mindestbesetzung ist je Dienstart hinterlegt, nicht je Einheit" : ""),
      `Dienste aus ${e ? e.name : "der Einheit"}: ${b.diensteEinheit}` +
        (b.tageOhneEinheit ? ` · ${b.tageOhneEinheit} Tage ohne Dienst aus dieser Einheit` : ""),
      "",
      ...(b.eintraege.length ? ["Besondere Vorkommnisse:", ""] : ["Keine besonderen Vorkommnisse."]),
      ...b.eintraege.map((z) => `${fKurz(z.datum)}${z.dienst ? `  ${z.dienst}` : ""}  ${z.vorkommnis}`),
      /* Die Anmerkung steht unter eigener Überschrift, nicht zwischen den
         Vorkommnissen. Ein Nachweis verliert seinen Wert, sobald sich
         Erfasstes und nachträglich Geschriebenes nicht mehr unterscheiden
         lassen. */
      ...(anm ? ["", "Anmerkung des Betriebs (nachträglich erfasst):", "", anm] : []),
      "",
      "———",
      "Erstellt mit CENTRIC. Personenbezogene Angaben sind nicht enthalten.",
      "Vorkommnisse stammen aus den Schichtübergaben des Zeitraums.",
    ].filter((x) => x !== null).join("\n");
  };

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Ein Blatt zum Weitergeben an den Auftraggeber: Wie zuverlässig war die Besetzung im Zeitraum, und was ist vorgefallen? Ohne Namen, ohne interne Aufgaben, ohne Krankmeldungen — ein Auftraggeber bekommt Nachweis, keine Personalakte.">
        Leistungsnachweis</H1>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ padding: "20px var(--pad-x)", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
          <Field label="Von"><Inp type="date" value={von}
            onChange={(ev) => setVon(ev.target.value)} /></Field>
          <Field label="Bis"><Inp type="date" value={bis}
            onChange={(ev) => setBis(ev.target.value)} /></Field>
          <Field label={m.einheitLabel || "Einheit"}>
            <Sel value={einheit} onChange={(ev) => setEinheit(ev.target.value)}>
              {m.einheiten.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>))}</Sel></Field>
        </div>
      </Card>

      {b && (<>
        <Kennzahlen min={180} kacheln={[
          { label: "Zeitraum", wert: `${zahl(b.tage)} Tage`, sub: `${fKurz(b.von)} bis ${fKurz(b.bis)}` },
          { label: "Vollständig besetzt", wert: `${zahl(b.vollstaendig)}`, ton: "ok",
            sub: `von ${zahl(b.tage)} Tagen${b.betriebsweit ? " · Betrieb gesamt" : ""}` },
          { label: "Deckungsquote", wert: b.quote === null ? "—" : `${b.quote} %`,
            ton: b.quote === null ? undefined : b.quote >= 95 ? "ok" : "warn",
            sub: (b.quote !== null && b.quote >= 98 ? "sehr gut" : b.quote >= 95 ? "gut" : "mit Lücken")
              + (b.betriebsweit ? " · Mindestbesetzung gilt je Dienstart, nicht je Einheit" : "") },
          { label: `Dienste aus ${e ? e.name : "der Einheit"}`, wert: zahl(b.diensteEinheit),
            sub: b.tageOhneEinheit ? `${zahl(b.tageOhneEinheit)} Tage ohne Dienst aus dieser Einheit` : "an jedem Tag im Dienst" },
          { label: "Vorkommnisse", wert: zahl(b.eintraege.length), ton: b.eintraege.length ? "warn" : "ok",
            sub: "aus den Übergaben" }]} />

        <Leitraster seiteBreite={370}
          haupt={<>
        <Card>
          <CardHead right={<div style={{ display: "flex", gap: 9 }}>
            <Btn size="sm" onClick={() => {
              try { navigator.clipboard.writeText(alsText()); } catch { /* egal */ }
            }}>Kopieren</Btn>
            <Btn size="sm" onClick={() => {
              const blob = new Blob([alsText()], { type: "text/plain;charset=utf-8" });
              const u = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = u; a.download = `leistungsnachweis-${von}-${bis}.txt`; a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
            }}>Herunterladen</Btn>
          </div>}>Vorschau</CardHead>
          <pre style={{ margin: 0, padding: "20px var(--pad-x)", fontSize: 13,
            lineHeight: 1.65, whiteSpace: "pre-wrap", fontFamily: "inherit",
            color: C.text }}>{alsText()}</pre>
        </Card>

          </>}
          seite={<>
        {/* Woher die Vorkommnisse kommen — und was zu tun ist, wenn keine
            da sind. Ohne diesen Hinweis wirkt ein leerer Nachweis wie ein
            Fehler der Anwendung. */}
        <Erklaerkasten>
          <div>
            <b style={{ color: C.text }}>Der Nachweis wird nicht geschrieben, sondern abgeleitet.</b>{" "}
            Die Besetzungszahlen kommen aus dem Plan, die Vorkommnisse ausschließlich aus dem
            Feld „Vorkommnis" der abgeschlossenen Schichtübergaben. Das ist Absicht: Was einem
            Auftraggeber als Nachweis vorgelegt wird, soll niemand nachträglich hineinschreiben
            können.
            <div style={{ marginTop: 10 }}>
              {uebergabenImZeitraum === 0
                ? <>Im gewählten Zeitraum ist <b style={{ color: C.text }}>keine einzige Übergabe</b> erfasst —
                    deshalb steht hier nichts. Erfasst werden sie unter <b style={{ color: C.text }}>Übergabe</b>.</>
                : <>Im Zeitraum sind {anzahlWort(uebergabenImZeitraum, "Übergabe")} erfasst,
                    davon {zahl(b.eintraege.length)} mit einem Vorkommnis.</>}
            </div>
          </div>
        </Erklaerkasten>

        {/* Freie Anmerkung — bewusst getrennt, bewusst nicht gespeichert. */}
        <Card>
          <CardHead right={<Lab>freiwillig</Lab>}>Eigene Anmerkung</CardHead>
          <div style={{ padding: "16px var(--pad-x) 20px" }}>
            <textarea className="inp" rows={3} value={anmerkung} aria-label="Eigene Anmerkung zum Nachweis"
              placeholder="Zum Beispiel: Hinweis auf eine Absprache, eine geplante Maßnahme, eine Einordnung."
              onChange={(ev) => setAnmerkung(ev.target.value)} />
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 10, lineHeight: 1.55 }}>
              Erscheint im Nachweis unter eigener Überschrift und ausdrücklich als nachträglich
              erfasst — getrennt von den Vorkommnissen aus den Übergaben. Sie wird nicht
              gespeichert, sondern gilt nur für dieses eine Blatt.
            </div>
          </div>
        </Card>

        <Erklaerkasten>
          Nicht enthalten sind Namen, Stundenkonten, Krankmeldungen und die internen
          Felder der Übergabe. Wer einem Auftraggeber mehr geben will, sollte es
          bewusst tun — nicht, weil eine Ausgabe es versehentlich mitliefert.
          <div style={{ marginTop: 10 }}>
            Zur Einordnung der Zahlen: Besetzung und Deckungsquote gelten für den
            gesamten Betrieb, nicht für die oben gewählte {m.einheitLabel || "Einheit"} —
            die Mindestbesetzung ist je Dienstart hinterlegt, nicht je{" "}
            {m.einheitLabel || "Einheit"}. Die Auswahl oben grenzt die Vorkommnisse ein,
            nicht die Besetzungszahlen.
          </div>
        </Erklaerkasten>
          </>} />
      </>)}
    </div>);
}

/* ==========================================================================
   BELASTUNG — Ansicht für Planung und Leitung
   Wer trägt gerade zu viel? Nicht als Sperre, sondern als Hinweis vor der
   nächsten Planungsrunde.
   ========================================================================== */
function Belastung({ sitz, akt, gehZu }) {
  const m = sitz.mandant;
  const [tage, setTage] = useState(28);
  const bild = useMemo(() => ermuedungsBild(m, tage), [m, tage]);
  const [offen, setOffen] = useState(null);

  const zaehl = {
    hoch: bild.filter((x) => x.e.stufe === "hoch").length,
    erhoeht: bild.filter((x) => x.e.stufe === "erhoeht").length,
    normal: bild.filter((x) => x.e.stufe === "normal").length,
  };

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Die Ruhezeitprüfung sieht immer nur zwei Dienste. Hier steht, was sich über Wochen aufbaut — Nachtanteil, Serien, Rückwärtswechsel, Stundenkonto."
        right={<Seg value={String(tage)} onChange={(v) => setTage(Number(v))}
          options={[{ id: "14", label: "14 Tage" }, { id: "28", label: "28 Tage" },
            { id: "56", label: "8 Wochen" }]} />}>
        Belastung</H1>

      <Kennzahlen kacheln={[
        { label: "Hoch", wert: zahl(zaehl.hoch), ton: "danger", hervor: zaehl.hoch ? "danger" : undefined,
          sub: "vor weiteren Einsätzen ansprechen" },
        { label: "Erhöht", wert: zahl(zaehl.erhoeht), ton: "warn", hervor: zaehl.erhoeht ? "warn" : undefined,
          sub: "bei der nächsten Planung beachten" },
        { label: "Unauffällig", wert: zahl(zaehl.normal), ton: "ok", sub: "im üblichen Rahmen" },
        { label: "Betrachtet", wert: zahl(bild.length), sub: `Personen über ${tage} Tage` }]} />

      <Leitraster seiteBreite={340}
        haupt={bild.length === 0 ? (
          <Card><Leer titel="Keine Daten"
            text="Sobald Dienste geplant und gefahren wurden, entsteht hier das Bild." /></Card>
        ) : (
          <Card>
            <CardHead right={<Lab>nach Belastung geordnet</Lab>}>Personen</CardHead>
            {bild.map(({ person: p, e }, i) => {
              const st = ERMUEDUNG_STUFEN[e.stufe];
              const auf = offen === p.id;
              return (
                <div key={p.id} style={{ borderBottom: i < bild.length - 1
                  ? `1px solid ${C.lineSoft}` : "none" }}>
                  <button onClick={() => setOffen(auf ? null : p.id)} aria-expanded={auf}
                    style={{ display: "flex", alignItems: "center", gap: 14, width: "100%",
                      padding: "13px var(--pad-x)", border: "none", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit", color: C.text,
                      background: e.stufe === "hoch" ? C.dangerLight
                        : e.stufe === "erhoeht" ? C.warnLight : "transparent" }}>
                    <Avatar person={p} size="sm" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 550 }}>
                        {p.nachname}, {p.vorname}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginTop: 3 }}>
                        {zahl(e.dienste)} Dienste · {e.nachtanteil} % nachts
                        {e.serie > 0 ? ` · längste Serie ${e.serie} Tage` : ""}</span>
                    </span>
                    {/* Ein Balken sagt mehr als eine Zahl */}
                    <span style={{ width: 110, flexShrink: 0 }}>
                      <Fortschritt wert={Math.min(100, e.punkte)} hoehe={7}
                        ton={e.stufe === "hoch" ? "danger" : e.stufe === "erhoeht" ? "warn" : "ok"}
                        label={`Belastung ${Math.round(e.punkte)} von 100 Punkten`} /></span>
                    <Pill size="sm" tone={st.ton}>{st.label}</Pill>
                  </button>

                  {auf && (
                    <div style={{ padding: "0 var(--pad-x) 20px 62px" }}>
                      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6,
                        marginBottom: 14 }}>{st.text}</div>
                      {e.gruende.length === 0 ? (
                        <div style={{ fontSize: 13.5, color: C.dim }}>
                          Keine auffälligen Einzelwerte.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 9 }}>
                          {e.gruende.map((g, gi) => (
                            <div key={gi} style={{ display: "flex", alignItems: "center", gap: 12,
                              fontSize: 13.5 }}>
                              <span style={{ minWidth: 200, fontWeight: 550 }}>{g.was}</span>
                              <span style={{ flex: 1, color: C.dim }}>{g.wert}</span>
                              <span style={{ color: C.dim, ...NUM }}>+{g.punkte}</span>
                            </div>))}
                        </div>)}
                      <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 12.5,
                        color: C.dim, flexWrap: "wrap" }}>
                        <span>Nachtanteil {e.nachtanteil} %</span>
                        <span>Wochenenden {e.wochenendanteil} %</span>
                        <span>Rückwärtswechsel {zahl(e.wechsel)}</span>
                        <span>Stundenkonto {e.konto} h</span>
                      </div>
                    </div>)}
                </div>);
            })}
          </Card>)}
        seite={<>
          {bild.length > 0 && (
            <Seitenkarte titel="Verteilung im Betrieb" sub="Personen je Punktebereich, von 0 bis 100.">
              <Sparkline art="saeulen" hoehe={70} hervor={10}
                daten={Array.from({ length: 10 }, (_, k) => bild.filter((x) =>
                  Math.min(99, Math.floor(x.e.punkte)) >= k * 10 && Math.min(99, Math.floor(x.e.punkte)) < (k + 1) * 10).length)}
                beschriftung={`Verteilung der Belastungspunkte auf zehn Bereiche: ${zaehl.normal} unauffällig, ${zaehl.erhoeht} erhöht, ${zaehl.hoch} hoch`} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.dim, marginTop: 6 }}>
                <span>0 Punkte</span><span>100 Punkte</span></div>
            </Seitenkarte>)}
          <Seitenkarte titel="Was die Stufen bedeuten">
            {Object.entries(ERMUEDUNG_STUFEN).map(([id, st]) => (
              <div key={id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                  <Punkt ton={st.ton || "ok"} /><b>{st.label}</b>
                  <span style={{ fontSize: 12, color: C.dim }}>ab {st.ab} Punkte</span></div>
                <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginTop: 3, paddingLeft: 16 }}>{st.text}</div>
              </div>))}
          </Seitenkarte>
          <Erklaerkasten>
            Die Bewertung sperrt niemanden. Wer sperrt, wo das Gesetz es nicht verlangt,
            erzeugt Umgehungen — und dann steht die Belastung nirgends mehr. Sie ist als
            Hinweis vor der nächsten Planungsrunde gedacht, nicht als Urteil.
          </Erklaerkasten>
        </>} />
    </div>);
}

/* ==========================================================================
   SONDEREINSÄTZE
   Außerhalb des Regelplans, mit eigener Kostenstelle.
   ========================================================================== */
function Sondereinsaetze({ sitz, akt }) {
  const m = sitz.mandant;
  const darfAendern = darf(sitz, "plan.edit.unit") || darf(sitz, "plan.edit.all");
  const [von, setVon] = useState(addDays(heute(), -30));
  const [bis, setBis] = useState(addDays(heute(), 60));
  const [neu, setNeu] = useState(false);
  const liste = useMemo(() => sondereinsaetze(m, von, bis), [m, von, bis]);

  const summe = liste.reduce((s, x) => s + (x.stunden ? x.stunden.gesamt : 0), 0);

  return (
    <div>
      <H1 rubrik="Planung"
        sub="Einsätze außerhalb des Regelplans: Veranstaltungen, zusätzlicher Objektschutz, Begleitungen. Mit eigener Kostenstelle, weil sie gesondert berechnet werden."
        right={darfAendern && <Btn kind="primary" onClick={() => setNeu(true)}>
          Einsatz anlegen</Btn>}>
        Sondereinsätze</H1>

      <Card style={{ marginBottom: 22 }}>
        <div style={{ padding: "18px var(--pad-x)", display: "flex", gap: 16,
          alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Von"><Inp type="date" value={von}
            onChange={(e) => setVon(e.target.value)} /></Field>
          <Field label="Bis"><Inp type="date" value={bis}
            onChange={(e) => setBis(e.target.value)} /></Field>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <Grosszahl wert={n1(summe)} label="Stunden im Zeitraum" />
          </div>
        </div>
      </Card>

      {liste.length === 0 ? (
        <Card><Leer titel="Keine Sondereinsätze"
          text="Ein Sondereinsatz läuft außerhalb der Schichtfolge — etwa eine Veranstaltung am Wochenende. Die Stunden erscheinen getrennt im Nachweis." /></Card>
      ) : (
        <Card>
          <CardHead right={<Lab>{zahl(liste.length)}</Lab>}>Einsätze</CardHead>
          {liste.map((s, i) => (
            <div key={s.id} style={{ padding: "16px var(--pad-x)",
              borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 620 }}>{s.bezeichnung}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>
                    {fLang(s.datum)} · {s.start}–{s.ende}
                    {s.ort ? ` · ${s.ort}` : ""}</div>
                  {s.kostenstelle && (
                    <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>
                      Kostenstelle {s.kostenstelle}
                      {s.auftraggeber ? ` · ${s.auftraggeber}` : ""}</div>)}
                  <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                    {(s.zugeteilt || []).map((pid) => {
                      const p = m.personen.find((x) => x.id === pid);
                      return p ? (
                        <Pill key={pid} size="sm">{p.nachname}, {p.vorname.slice(0, 1)}.</Pill>) : null;
                    })}
                    {!(s.zugeteilt || []).length && (
                      <Pill size="sm" tone="warn">niemand zugeteilt</Pill>)}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 90 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, ...NUM }}>
                    {n1(s.stunden ? s.stunden.gesamt : 0)} h</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                    {zahl(s.stunden ? s.stunden.personen : 0)} × {n1(s.stunden ? s.stunden.jePerson : 0)} h</div>
                </div>
              </div>
            </div>))}
        </Card>)}

      {neu && (
        <Sheet open onClose={() => setNeu(false)} titel="Sondereinsatz anlegen" width={520}>
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Bezeichnung"><Inp id="se-bez" autoFocus
              placeholder="z. B. Stadtfest Absicherung" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Datum"><Inp id="se-datum" type="date" defaultValue={heute()} /></Field>
              <Field label="Von"><Inp id="se-start" type="time" defaultValue="18:00" /></Field>
              <Field label="Bis"><Inp id="se-ende" type="time" defaultValue="23:00" /></Field>
            </div>
            <Field label="Ort"><Inp id="se-ort" placeholder="Einsatzort" /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Kostenstelle"
                hint="Für die getrennte Abrechnung.">
                <Inp id="se-ks" placeholder="z. B. SE-2026-014" /></Field>
              <Field label="Auftraggeber"><Inp id="se-ag" placeholder="Name" /></Field>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
              <Btn kind="primary" onClick={() => {
                const g = (id) => (document.getElementById(id) || {}).value || "";
                if (!g("se-bez").trim()) return;
                akt.sondereinsatzAnlegen({
                  bezeichnung: g("se-bez").trim(), datum: g("se-datum"),
                  start: g("se-start"), ende: g("se-ende"), ort: g("se-ort"),
                  kostenstelle: g("se-ks"), auftraggeber: g("se-ag") });
                setNeu(false);
              }}>Anlegen</Btn>
            </div>
          </div>
        </Sheet>)}
    </div>);
}

const M_TABS = [
  { id: "heute", label: "Heute", icon: "heute" },
  { id: "plan", label: "Mein Plan", icon: "kalender" },
  { id: "anliegen", label: "Anliegen", icon: "stift" },
  { id: "mehr", label: "Mehr", icon: "menue" },
];

/* ------------------------------- Bausteine ------------------------------- */
const MKarte = ({ children, onClick, ton, style }) => (
  <div {...klickbar(onClick)} style={{ background: C.flaeche,
    border: `1px solid ${ton === "danger" ? `${C.danger}66` : ton === "warn" ? `${C.warn}66` : C.line}`,
    borderRadius: 18, padding: 16, marginBottom: 10, cursor: onClick ? "pointer" : "default",
    boxShadow: "var(--schatten)", ...style }}>{children}</div>);

const MZeile = ({ links, rechts, unten, onClick, ton }) => (
  <div {...klickbar(onClick)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 4px",
    minHeight: 46, cursor: onClick ? "pointer" : "default", borderBottom: `1px solid ${C.lineSoft}` }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15.5, fontWeight: 500,
        color: ton === "danger" ? C.danger : ton === "warn" ? C.warn : C.text }}>{links}</div>
      {unten && <div style={{ fontSize: 13, color: C.dimmer, marginTop: 3, lineHeight: 1.4 }}>{unten}</div>}
    </div>
    {rechts}
    {onClick && <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={20} /></span>}
  </div>);

const MTitel = ({ children, rubrik, rechts }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    gap: 12, marginBottom: 18 }}>
    <div>
      {rubrik && <Rubrik style={{ marginBottom: 6 }}>{rubrik}</Rubrik>}
      <h1 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em", margin: 0, lineHeight: 1.15 }}>
        {children}</h1>
    </div>
    {rechts}
  </div>);

/** Blatt, das von unten hereinfährt — auf dem Telefon die übliche Form. */
const MBlatt = ({ offen, onClose, titel, children }) => {
  /* WP-40: Fokus hinein, Tab bleibt darin, Escape schließt, Fokus zurück. */
  const blattRef = useRef(null);
  useDialogFokus(blattRef, offen, onClose);
  if (!offen) return null;
  return (
    <div onClick={onClose} className="m-blattrahmen" role="dialog" aria-modal="true" aria-label={titel || "Blatt"}>
      <div ref={blattRef} tabIndex={-1} style={{ outline: "none" }} onClick={(e) => e.stopPropagation()} className="m-blatt">
        <div className="m-griff" aria-hidden="true" />
        {titel && <div className="m-blatttitel">{titel}</div>}
        {children}
      </div>
    </div>);
};

/* ================================ HEUTE ================================= */
function MHeute({ sitz, akt, setTab, oeffnen }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const t = personTag(m, p, d0);
  const da = t.dienstId && map[t.dienstId];
  const vorgang = stempelVorgang(m, p, d0);
  const morgen = personTag(m, p, addDays(d0, 1));
  const morgenDa = morgen.dienstId && map[morgen.dienstId];
  const aufgaben = useMemo(() => tagesaufgaben(sitz).filter((a) => a.art !== "stempel"), [m, p.id]);
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
  const wichtig = (m.aushang || []).filter((x) => x.wichtig && (!x.bis || x.bis >= d0));

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.04em", margin: "8px 0 0", lineHeight: 1.12 }}>
          {(p.vorname || "").trim()
            ? <>{gruss},<br /><b style={{ fontWeight: 700 }}>{p.vorname.trim()}</b>.</>
            : <>{gruss}.</>}
        </h1>
      </div>

      {/* Der Dienst des Tages — die wichtigste Karte. Ein offener Dienst von
          gestern (über Mitternacht) geht vor: zuerst ausstempeln. */}
      {vorgang.vortag ? (
        <MKarte style={{ padding: 22 }}>
          <Rubrik>Offener Dienst von gestern</Rubrik>
          <div style={{ fontSize: 23, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px" }}>
            Eingestempelt gestern {vorgang.st.start}</div>
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></div>
        </MKarte>
      ) : da ? (
        <MKarte style={{ padding: 22, background: `${da.farbe}0E`, border: `1px solid ${da.farbe}33` }}>
          <Rubrik style={{ color: lesbar(da.farbe) }}>Dein Dienst heute</Rubrik>
          <div style={{ fontSize: 27, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px" }}>
            {da.name}</div>
          <div style={{ fontSize: 17, color: C.dim, ...NUM }}>
            {da.start} – {da.ende} · {n1(dauer(da))} h</div>
          {da.ort && <div style={{ fontSize: 14, color: C.dimmer, marginTop: 5 }}>{da.ort}</div>}
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></div>
        </MKarte>
      ) : vorgang.offen ? (
        /* Eingestempelt, aber heute kein Dienst (mehr) im Plan — etwa nach
           einer Planänderung. Der Beginn bleibt sichtbar und beendbar. */
        <MKarte style={{ padding: 22 }}>
          <Rubrik>Offener Dienst ohne Plan</Rubrik>
          <div style={{ fontSize: 23, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px", ...NUM }}>
            Eingestempelt {vorgang.st.start}</div>
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></div>
        </MKarte>
      ) : istUngeplant((m.erfassung || {})[`${p.id}|${d0}`]) ? (
        <MKarte style={{ padding: 22 }}><UngeplantHinweis m={m} p={p} d={d0} /></MKarte>
      ) : (
        <MKarte style={{ padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 6 }}>
            {t.abwesenheit ? abwArt(t.abwesenheit.art).label : "Heute frei"}</div>
          <div style={{ fontSize: 14.5, color: C.dim }}>
            {t.abwesenheit ? `bis ${fDatum(t.abwesenheit.bis)}`
              : morgenDa ? `Nächster Dienst morgen: ${morgenDa.name} ab ${morgenDa.start}`
                : morgen.quelle === "entwurf" ? "Der Plan für morgen ist noch nicht veröffentlicht." : "Auch morgen kein Dienst."}
          </div>
        </MKarte>)}

      <KorrekturKarte sitz={sitz} akt={akt} />

      {da && morgenDa && (
        <MKarte style={{ padding: "15px 18px", display: "flex", alignItems: "center", gap: 13 }}>
          <Zelle da={morgenDa} size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: C.dimmer }}>Morgen</div>
            <div style={{ fontSize: 15, fontWeight: 500, ...NUM }}>
              {morgenDa.name} · {morgenDa.start}–{morgenDa.ende}</div>
          </div>
        </MKarte>)}

      {wichtig.length > 0 && wichtig.map((x) => (
        <MKarte key={x.id} ton="danger" onClick={() => oeffnen("aushang")}>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ color: C.danger, fontSize: 17, fontWeight: 700 }}>!</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 620 }}>{x.titel}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{x.text}</div>
            </div>
          </div>
        </MKarte>))}

      {aufgaben.length > 0 && (<>
        <Rubrik style={{ margin: "26px 0 12px" }}>Das wartet auf dich</Rubrik>
        {aufgaben.map((a, i) => (
          <MKarte key={i} ton={a.dringend ? "danger" : undefined}
            onClick={() => { if (a.ziel === "meine") setTab("plan"); else if (a.ziel === "antraege" || a.ziel === "boerse") setTab("anliegen"); else oeffnen(a.ziel); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700,
                background: a.dringend ? C.dangerLight : C.bg,
                color: a.dringend ? C.danger : C.dim }}><AufgabeSymbol art={a.art} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 620 }}>{a.titel}</div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>{a.text}</div>
              </div>
              <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={20} /></span>
            </div>
          </MKarte>))}
      </>)}

      {aufgaben.length === 0 && (
        <MKarte style={{ textAlign: "center", padding: 30 }}>
          <div style={{ color: C.ok, marginBottom: 8, display: "flex", justifyContent: "center" }}><Icon n="kreis-haken" size={36} /></div>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>Nichts zu erledigen</div>
        </MKarte>)}
    </div>);
}

/** Große Stempelfläche — das häufigste Tippen überhaupt. */
function MStempel({ sitz, akt, vorgang }) {
  const m = sitz.mandant, p = sitz.person;
  const { datum, st, vortag, veraltet, nachtEnde } = vorgang || stempelVorgang(m, p, heute());
  const geoAn = geoPruefungAn(m);
  const [laeuft, setLaeuft] = useState(false);
  const [pause, setPause] = useState(() => pauseVorgabe(m, p, datum));
  const stempeln = (art, tag = datum) => {
    setLaeuft(true);
    /* Gesperrt bis zum Ende, auch der Wiederholungen nach 429 (Review-Auflage N1). */
    positionHolen(geoAn, (k, grund) => { const ort = koordMitGrund(k, grund); Promise.resolve(akt.stempeln(p.id, tag, art, ort, art === "ende" ? pause : null)).finally(() => setLaeuft(false)); });
  };
  const Flaeche = ({ kind, onClick, children }) => (
    <button onClick={onClick} disabled={laeuft} className={`btn btn-${kind}`}
      style={{ width: "100%", height: 56, fontSize: 16.5, fontWeight: 650, borderRadius: 18 }}>
      {laeuft ? (geoAn ? "Standort wird geprüft …" : "Wird gespeichert …") : children}</button>);

  /* Nachtdienst von gestern ohne Einstempeln (WP-17, F1/W3). */
  if (!st && nachtEnde) return (<>
    <div style={{ fontSize: 14, color: C.dim, marginBottom: 11, lineHeight: 1.45 }}>
      Nachtdienst von gestern ohne Einstempeln? Das Dienstende lässt sich noch erfassen; den Beginn ergänzt die Leitung.</div>
    <Flaeche kind="ok" onClick={() => stempeln("ende")}>Dienstende stempeln</Flaeche>
    <div style={{ height: 10 }} />
    <Flaeche kind="quiet" onClick={() => stempeln("start", heute())}>Einstempeln</Flaeche></>);
  if (!st) return (<>
    <Flaeche kind="primary" onClick={() => stempeln("start")}>Einstempeln</Flaeche>
    {geoAn && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 9, lineHeight: 1.45 }}>{GEO_HINWEIS}</div>}</>);
  /* Beginn über 20 Stunden alt: kein normaler Abschluss. Das Ende lässt sich
     trotzdem erfassen (der Server markiert es START_VERALTET), damit nichts
     verloren geht; die Arbeitszeit ergänzt die Leitung. */
  if (!st.ende && veraltet) return (<>
    <div style={{ fontSize: 14, color: C.warn, marginBottom: 11, lineHeight: 1.45, ...NUM }}>
      {MARKIERUNG_TEXT.START_VERALTET} (Beginn {st.start}). Die Arbeitszeit ergänzt die Leitung.</div>
    <Flaeche kind="quiet" onClick={() => stempeln("ende")}>Ende trotzdem erfassen</Flaeche></>);
  if (!st.ende) return (<>
    <div style={{ fontSize: 14, color: C.dim, marginBottom: 11, ...NUM }}>
      Eingestempelt {vortag ? "gestern " : ""}{st.start}{st.ortStart ? ` · ${st.ortStart}` : ""}{st.vorlaeufig ? " · vorläufig (offline gespeichert)" : ""}</div>
    <div style={{ marginBottom: 10 }}><PauseFeld wert={pause} setWert={setPause} gross /></div>
    <Flaeche kind="ok" onClick={() => stempeln("ende")}>Ausstempeln</Flaeche></>);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      {st.vorlaeufig ? <Pill tone="warn">vorläufig (offline gespeichert)</Pill> : <Pill tone="ok">Dienst erfasst</Pill>}
      <span style={{ fontSize: 14, color: C.dim, ...NUM }}>{st.start || "–"} – {st.ende}</span>
    </div>);
}

/* =============================== MEIN PLAN ============================== */
function MPlan({ sitz, akt, oeffnen }) {
  const m = sitz.mandant, ich = sitz.person;
  const [ansicht, setAnsicht] = useState("liste");
  const [schnell, setSchnell] = useState("alle");
  const [ym, setYm] = useState(heute().slice(0, 7));
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [gewaehlt, setGewaehlt] = useState(null);
  const offen = offeneErfassung(m, ich, addDays(heute(), -1));
  const frei = freigabeStand(m, ym);

  const tage = Array.from({ length: 42 }, (_, i) => addDays(heute(), i))
    .map((d) => ({ d, t: personTag(m, ich, d) }))
    .filter((x) => {
      const da = x.t.dienstId && map[x.t.dienstId];
      if (schnell === "dienst") return !!x.t.dienstId;
      if (schnell === "frei") return !x.t.dienstId;
      if (schnell === "nacht") return da && nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen);
      if (schnell === "we") return dow(x.d) >= 5;
      return x.t.dienstId || x.t.abwesenheit;
    });

  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym}-01`);
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym}-${pad(i)}`);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (
    <div>
      <MTitel rubrik={frei ? `Freigegeben · Stand ${frei.stand}` : "Entwurf"}
        rechts={<Seg value={ansicht} onChange={setAnsicht}
          options={[{ id: "liste", label: "Liste" }, { id: "monat", label: "Monat" }]} />}>
        Mein Plan</MTitel>

      {/* Swipebare Schnellfilter — auf dem Telefon schneller als jedes Auswahlfeld */}
      <div className="reiterreihe" style={{ marginBottom: 16 }}>
        {[["alle", "Alle"], ["dienst", "Nur Dienste"], ["frei", "Nur frei"],
          ["nacht", "Nachtdienste"], ["we", "Wochenende"]].map(([id, l]) => (
          <button key={id} onClick={() => setSchnell(id)} className="btn btn-sm"
            style={{ background: schnell === id ? C.accent : C.flaeche,
              borderColor: schnell === id ? C.accent : C.line,
              color: schnell === id ? C.aufAkzent : C.dim, fontWeight: schnell === id ? 650 : 500 }}>
            {l}</button>))}
      </div>

      {/* WP-15: eigene Zeiten-Anträge (Selbstauskunft) — auch in der Smartphone-Ansicht. */}
      <SelbstauskunftStatus m={m} ich={ich} onErgebnis={akt.uebernehmeSelbstauskunft} melde={akt.melde} />

      {offen.length > 0 && (
        <MKarte ton="warn" onClick={() => oeffnen("zeiten")}>
          <MZeile ton="warn" links={`${offen.length} Zeiten bestätigen`}
            unten="Solange offen, bleibt dein Stundenkonto eine Hochrechnung" onClick={() => {}} />
        </MKarte>)}

      {ansicht === "liste" ? (
        tage.length === 0
          ? <MKarte style={{ textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Keine Dienste in den nächsten sechs Wochen</div>
            </MKarte>
          : tage.map(({ d, t }) => {
            const da = t.dienstId && map[t.dienstId];
            const istHeute = d === heute();
            return (
              <MKarte key={d} onClick={() => setGewaehlt({ datum: d, t })}
                style={{ padding: 16, display: "flex", alignItems: "center", gap: 15,
                  outline: istHeute ? `2px solid ${C.accent}` : "none" }}>
                <div style={{ width: 50, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 11.5, color: C.dimmer, textTransform: "uppercase",
                    letterSpacing: ".07em" }}>{DOW[dow(d)]}</div>
                  <div style={{ fontSize: 23, fontWeight: 650, lineHeight: 1.1, ...NUM,
                    color: istHeute ? C.accent : feiertag(d, m.bundesland) ? C.danger : C.text }}>
                    {Number(d.slice(8))}</div>
                  <div style={{ fontSize: 10.5, color: C.dimmer, ...NUM }}>{MON[Number(d.slice(5, 7)) - 1].slice(0, 3)}</div>
                </div>
                <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2,
                  background: da ? lesbar(da.farbe, 3) : t.abwesenheit ? lesbar(abwArt(t.abwesenheit.art).farbe, 3) : "transparent" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-.015em" }}>
                    {da ? da.name : abwArt(t.abwesenheit.art).label}</div>
                  <div style={{ fontSize: 14, color: C.dim, marginTop: 3, ...NUM }}>
                    {da ? `${da.start} – ${da.ende} · ${n1(dauer(da))} h` : `bis ${fDatum(t.abwesenheit.bis)}`}
                  </div>
                  {da && da.ort && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 2 }}>{da.ort}</div>}
                </div>
                <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={20} /></span>
              </MKarte>);
          })
      ) : (
        <MKarte style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Btn size="sm" onClick={() => shift(-1)} aria-label="Zurück"><Icon n="chevron-links" size={16} /></Btn>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{MON[mo - 1]} {y}</span>
            <Btn size="sm" onClick={() => shift(1)} aria-label="Weiter"><Icon n="chevron-rechts" size={16} /></Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
            {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11,
              fontWeight: 600, color: i >= 5 ? C.dimmer : C.dim }}>{d.slice(0, 2)}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {zellen.map((d, i) => {
              if (!d) return <div key={i} />;
              const t = personTag(m, ich, d);
              const da = t.dienstId && map[t.dienstId];
              return (
                <div key={d} {...klickbar(() => setGewaehlt({ datum: d, t }),
                  `${fKurz(d)}: ${da ? da.name : t.abwesenheit ? abwArt(t.abwesenheit.art).label : "frei"}`)}
                  style={{ aspectRatio: "1", borderRadius: 12, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2,
                    background: da ? `${da.farbe}1C` : t.abwesenheit ? `${abwArt(t.abwesenheit.art).farbe}1C` : C.bg,
                    outline: d === heute() ? `2px solid ${C.accent}` : "none" }}>
                  <span style={{ fontSize: 12, color: C.dim, ...NUM }}>{Number(String(d).slice(8))}</span>
                  {(da || t.abwesenheit) && <span style={{ fontSize: 11, fontWeight: 700, ...NUM,
                    color: da ? lesbar(da.farbe) : lesbar(abwArt(t.abwesenheit.art).farbe) }}>
                    {da ? da.kurz : abwArt(t.abwesenheit.art).kurz}</span>}
                </div>);
            })}
          </div>
        </MKarte>)}

      <MBlatt offen={!!gewaehlt} onClose={() => setGewaehlt(null)}
        titel={gewaehlt ? fLang(gewaehlt.datum) : ""}>
        {gewaehlt && (() => {
          const da = gewaehlt.t.dienstId && map[gewaehlt.t.dienstId];
          const w = wunschAm(m, ich.id, gewaehlt.datum);
          return (<>
            {da && (
              <MKarte style={{ background: `${da.farbe}0E`, border: `1px solid ${da.farbe}33` }}>
                <div style={{ fontSize: 20, fontWeight: 650 }}>{da.name}</div>
                <div style={{ fontSize: 15.5, color: C.dim, marginTop: 4, ...NUM }}>
                  {da.start} – {da.ende} · {n1(dauer(da))} h</div>
                {da.ort && <div style={{ fontSize: 13.5, color: C.dimmer, marginTop: 4 }}>{da.ort}</div>}
                {nachtAnteil(da, m.einstellungen) > 0 && <div style={{ fontSize: 13, color: C.violet, marginTop: 8, ...NUM }}>
                  davon {n1(nachtAnteil(da, m.einstellungen))} h Nachtarbeit</div>}
              </MKarte>)}
            {da && (
              <div style={{ display: "grid", gap: 10 }}>
                <Btn kind="primary" style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.tauschAusPlan(gewaehlt.datum); setGewaehlt(null); }}>
                  Tausch für diesen Tag suchen</Btn>
                <Btn style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.oeffneAntrag(gewaehlt.datum); setGewaehlt(null); }}>
                  Frei beantragen</Btn>
              </div>)}
            {!da && gewaehlt.datum >= heute() && (
              <div style={{ display: "grid", gap: 10 }}>
                <Btn kind={w && w.art === "moechte" ? "primary" : "plain"}
                  style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.setzeWunsch(ich.id, gewaehlt.datum); setGewaehlt(null); }}>
                  Würde an diesem Tag gern arbeiten</Btn>
              </div>)}
            {da && gewaehlt.datum >= heute() && (
              <div style={{ marginTop: 10 }}>
                <Btn kind={w && w.art === "lieber_nicht" ? "danger" : "quiet"}
                  style={{ width: "100%", height: 46, borderRadius: 16, fontSize: 14.5 }}
                  onClick={() => { akt.setzeWunsch(ich.id, gewaehlt.datum); setGewaehlt(null); }}>
                  {w ? (w.art === "moechte" ? "Doch lieber nicht" : "Wunsch zurücknehmen") : "Lieber nicht arbeiten"}</Btn>
              </div>)}
          </>);
        })()}
      </MBlatt>
    </div>);
}

/* =============================== ANLIEGEN =============================== */
function MAnliegen({ sitz, akt, oeffnen }) {
  const m = sitz.mandant, ich = sitz.person;
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meine = m.anfragen.filter((a) => a.personId === ich.id)
    .sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const einsatz = meine.filter((a) => a.typ === "einsatz" && a.status === "offen");
  const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen"
    && !a.partnerId && a.personId !== ich.id);
  const ktoV = useMemo(() => kontoVerlauf(m, ich, heute().slice(0, 7), 6), [m, ich.id]);
  const ktoJetzt = ktoV.length ? ktoV[ktoV.length - 1].kto : 0;
  const ktoTrend = ktoV.length > 1 ? ktoJetzt - ktoV[0].kto : 0;

  return (
    <div>
      <MTitel rubrik="Deine Vorgänge">Anliegen</MTitel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <Btn kind="primary" style={{ height: 52, borderRadius: 17, fontSize: 15 }}
          onClick={() => akt.oeffneAntrag(null)}>Frei beantragen</Btn>
        <Btn kind="danger" style={{ height: 52, borderRadius: 17, fontSize: 15 }}
          onClick={() => akt.oeffneKrankmeldung(ich.id)}>Krank melden</Btn>
      </div>

      {einsatz.length > 0 && (<>
        <Rubrik style={{ marginBottom: 11 }}>Einsatzanfragen</Rubrik>
        {einsatz.map((a) => {
          const da = map[a.dienstId];
          return (
            <MKarte key={a.id} ton="danger">
              <div style={{ fontSize: 16, fontWeight: 620 }}>{fLang(a.von)}</div>
              <div style={{ fontSize: 14, color: C.dim, marginTop: 4, ...NUM }}>
                {da ? `${da.name} · ${da.start}–${da.ende} · ${n1(dauer(da))} h` : a.dienstId}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <Btn kind="ok" style={{ height: 46, borderRadius: 15 }}
                  onClick={() => akt.beantworteEinsatz(a.id, true)}>Zusagen</Btn>
                <Btn kind="quiet" style={{ height: 46, borderRadius: 15 }}
                  onClick={() => akt.beantworteEinsatz(a.id, false)}>Absagen</Btn>
              </div>
            </MKarte>);
        })}
      </>)}

      {boerse.length > 0 && (<>
        <Rubrik style={{ margin: "24px 0 11px" }}>Tauschbörse · {boerse.length} offen</Rubrik>
        {boerse.slice(0, 6).map((a) => {
          const p = m.personen.find((x) => x.id === a.personId);
          const t = p && personTag(m, p, a.von);
          const da = t && map[t.dienstId];
          const gemeldet = (a.interessenten || []).includes(ich.id);
          return (
            <MKarte key={a.id}>
              <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
                <Zelle da={da} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{fKurz(a.von)}{da ? ` · ${da.name}` : ""}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 3 }}>
                    {p ? `${p.vorname} ${p.nachname}` : "?"} sucht Tausch</div>
                </div>
              </div>
              {a.text && <div style={{ fontSize: 13, color: C.dimmer, marginTop: 9 }}>„{a.text}"</div>}
              <Btn kind={gemeldet ? "quiet" : "primary"} style={{ width: "100%", height: 46, marginTop: 13, borderRadius: 15 }}
                onClick={() => gemeldet ? akt.tauschAbmelden(a.id) : akt.tauschMelden(a.id)}>
                {gemeldet ? "Meldung zurücknehmen" : "Ich übernehme"}</Btn>
            </MKarte>);
        })}
      </>)}

      <Rubrik style={{ margin: "28px 0 12px" }}>Mein Stundenkonto</Rubrik>
      <Kontoblatt m={m} verlauf={ktoV} jetzt={ktoJetzt} trend={ktoTrend} />

      {meine.filter((a) => a.typ !== "einsatz").length > 0 && (<>
        <Rubrik style={{ margin: "24px 0 11px" }}>Meine Anträge</Rubrik>
        <MKarte style={{ padding: "4px 18px" }}>
          {meine.filter((a) => a.typ !== "einsatz").slice(0, 8).map((a) => (
            <MZeile key={a.id}
              links={`${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fKurz(a.von)}`}
              unten={a.bis !== a.von ? `bis ${fKurz(a.bis)}` : a.antwort || null}
              rechts={<Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>
                {a.status}</Pill>} />))}
        </MKarte>
      </>)}
    </div>);
}

/* ================================= MEHR ================================= */
function MMehr({ sitz, akt, oeffnen, aufRechner }) {
  const m = sitz.mandant, p = sitz.person;
  const ungelesen = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen).length;
  const nachweise = p.qualifikationen.map((q) => nachweisStand(m, p, q))
    .filter((s) => s.stand === "abgelaufen" || s.stand === "laeuft_ab");
  const e = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
  const ausl = auslastung(m, p, heute().slice(0, 7));

  return (
    <div>
      <MTitel rubrik={e ? e.name : ""}>{p.vorname} {p.nachname}</MTitel>

      <MKarte style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {[["Auslastung", ausl.pct == null ? "–" : `${ausl.pct} %`], ["Wochenstunden", `${n1(p.wochenstunden)} h`],
          ["Urlaub übrig", (() => { const r = urlaubskonto(m, p, new Date().getFullYear()).rest; return r == null ? "–" : `${r} Tage`; })()]].map(([l, v]) => (
          <div key={l} style={{ flex: "1 1 90px" }}>
            <div style={{ fontSize: 11.5, color: C.dimmer }}>{l}</div>
            <div style={{ fontSize: 19, fontWeight: 650, marginTop: 3, ...NUM }}>{v}</div>
          </div>))}
      </MKarte>

      <MKarte style={{ padding: "4px 18px" }}>
        {(() => {
          const t = personTag(m, p, heute());
          const st = t && t.dienstId ? checkStand(m, p.id, heute(), t.dienstId) : null;
          if (!st) return null;
          return (
            <MZeile links="Checkliste heute"
              rechts={st.vollstaendig ? <span style={{ color: C.ok, display: "flex" }}><Icon n="haken" size={18} strokeWidth={2.2} /></span> : `${st.fertig}/${st.gesamt}`}
              unten={st.vollstaendig ? "alles erledigt"
                : `noch ${st.pflichtGesamt - st.pflichtFertig} Pflichtpunkte`}
              onClick={() => oeffnen("checkliste")} />);
        })()}
        {laufendeRunde(m) && (
          <MZeile links="Selbstplanung"
            rechts={selbstplanStand(m, laufendeRunde(m), p.id).eingetragen || undefined}
            unten={`Bis ${fKurz(laufendeRunde(m).schliesst)} deine Dienste wählen`}
            onClick={() => oeffnen("selbstplan")} />)}
        <MZeile links="Offene Schichten"
          rechts={meineOffenenSchichten(m, p.id).length || undefined}
          unten={meineOffenenSchichten(m, p.id).length
            ? "Dienste, die du übernehmen kannst" : "gerade nichts frei"}
          onClick={() => oeffnen("offene")} />
        <MZeile links="Hilfe anfordern"
          unten="Notruf an die Schichtverantwortung"
          onClick={() => oeffnen("notruf")} />
        <MZeile links="Benachrichtigungen" unten="E-Mail und Gerät einstellen"
          onClick={() => oeffnen("melden")} />
        <MZeile links="Mitteilungen" unten={ungelesen ? `${ungelesen} ungelesen` : "keine neuen"}
          rechts={ungelesen > 0 ? <Pill size="sm" tone="danger">{ungelesen}</Pill> : null}
          onClick={() => oeffnen("post")} />
        <MZeile links="Verfügbarkeit" unten="Wann kannst du arbeiten?"
          onClick={() => akt.oeffneVerfuegbarkeit(p.id)} />
        <MZeile links="Wunschdienste" unten="Gern oder lieber nicht"
          onClick={() => oeffnen("wuensche")} />
        <MZeile links="Meine Nachweise" ton={nachweise.some((x) => x.stand === "abgelaufen") ? "danger" : undefined}
          unten={nachweise.length ? nachweise.map((x) => x.qual.name).join(", ") : "alle gültig"}
          onClick={() => oeffnen("nachweise")} />
        <MZeile links="Schwarzes Brett" unten={`${(m.aushang || []).length} Aushänge`}
          onClick={() => oeffnen("aushang")} />
        <MZeile links="Kalender abonnieren" unten="Dienste im Telefonkalender"
          onClick={() => akt.exportICS(p.id)} />
      </MKarte>

      <MKarte style={{ padding: "4px 18px" }}>
        <MZeile links="Feldmodus" unten="Größere Schrift, maximaler Kontrast"
          rechts={<Schalter an={!!p.kontrastmodus} label="Feldmodus" onChange={() => akt.setzeKontrastmodus(!p.kontrastmodus)} />} />
        {/* Erscheinungsbild: Hell, Dunkel oder dem Gerät folgen — die Wahl bleibt gespeichert. */}
        <div style={{ padding: "15px 4px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ fontSize: 15.5, fontWeight: 500 }}>Erscheinungsbild</div>
          <div style={{ fontSize: 13, color: C.dimmer, marginTop: 3, lineHeight: 1.4 }}>„Wie das Gerät“ folgt der Systemeinstellung, auch wenn sie sich später ändert.</div>
          <div style={{ marginTop: 10 }}>
            <Seg value={p.thema || "auto"} onChange={(v) => akt.setzeMeineEinstellung("thema", v)}
              options={[{ id: "hell", label: "Hell" }, { id: "dunkel", label: "Dunkel" }, { id: "auto", label: "Wie das Gerät" }]} />
          </div>
        </div>
        <MZeile links="Rundgang wiederholen" unten="Wie CENTRIC funktioniert, in fünf Schritten"
          onClick={akt.starteEinfuehrung} />
        <MZeile links="Rechneransicht" unten="Alle Tabellen und Auswertungen"
          onClick={aufRechner} />
      </MKarte>

      <div style={{ padding: "10px 4px 0" }}>
        <Btn kind="quiet" style={{ width: "100%", height: 46, borderRadius: 15 }}
          onClick={akt.abmelden}>Abmelden</Btn>
      </div>
      <div style={{ textAlign: "center", fontSize: 11.5, color: C.dimmer, padding: "18px 0 6px" }}>
        CENTRIC · {m.name}
      </div>
    </div>);
}

/* =========================== MOBILE SCHALE ============================== */
/** Verknüpfung des Manifests für diese Sitzung (WP-37): Navigation samt Rechten wie in der Oberfläche. */
function verknuepfungFuer(sitz, ziel) {
  if (!sitz || !ziel) return null;
  const betreiber = sitz.rolle === "betreiber";
  const nav = betreiber ? NAV_BETREIBER : NAV_KUNDE.filter(([, , recht]) => ansichtErlaubt(sitz, recht));
  const mobil = !betreiber && sitz.person.rolle === "mitarbeiter" && sitz.person.imSchichtdienst !== false;
  return verknuepfungAnwenden({ betreiber, navIds: nav.map(([id]) => id),
    personId: betreiber ? null : sitz.person.id, mobil }, ziel);
}

function MobilSchale({ sitz, akt: aktRoh, aufRechner, dialoge, startTab }) {
  const [tab, setTab] = useState(startTab || "heute");
  useEffect(() => { if (startTab) setTab(startTab); }, [startTab]);   // Verknüpfung (WP-37)
  const [blatt, setBlatt] = useState(null);
  const [antrag, setAntrag] = useState(null);
  const m = sitz.mandant, p = sitz.person;
  const ungelesen = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen).length;
  const oeffnen = (was) => setBlatt(was);
  // Der Antrag wird hier als Blatt gezeigt, nicht als Ansichtswechsel
  const akt = { ...aktRoh, oeffneAntrag: (d) => setAntrag({ art: "urlaub",
    von: d || heute(), bis: d || heute(), text: "" }) };

  return (
    <div className="m-schale">
      <header className="m-kopf">
        <Logo size={24} />
        <span className="m-wort">CENTRIC</span>
        <button onClick={() => oeffnen("post")} className="m-postknopf"
          aria-label={`Mitteilungen${ungelesen ? `, ${ungelesen} ungelesen` : ""}`}>
          <Icon n="brief" size={19} />
          {ungelesen > 0 && <span className="m-zahl">{ungelesen}</span>}
        </button>
      </header>

      <main style={{ padding: "20px 18px 10px" }}>
        {tab === "heute" && <MHeute sitz={sitz} akt={akt} setTab={setTab} oeffnen={oeffnen} />}
        {tab === "plan" && <MPlan sitz={sitz} akt={akt} oeffnen={oeffnen} />}
        {tab === "anliegen" && <MAnliegen sitz={sitz} akt={akt} oeffnen={oeffnen} />}
        {tab === "mehr" && <MMehr sitz={sitz} akt={akt} oeffnen={oeffnen} aufRechner={aufRechner} />}
      </main>

      <nav className="m-tabs" aria-label="Bereiche">
        {M_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? "on" : ""}
            aria-current={tab === t.id ? "page" : undefined}>
            <Icon n={t.icon} size={22} />{t.label}
          </button>))}
      </nav>

      {/* Blätter für die selteneren Ansichten */}
      <MBlatt offen={blatt === "post"} onClose={() => { akt.alleGelesen(); setBlatt(null); }} titel="Mitteilungen">
        {(m.nachrichten || []).filter((n) => n.personId === p.id).length === 0
          ? <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px" }}>
              Hier erscheinen Entscheidungen zu deinen Anträgen und Änderungen an deinen Diensten.</div>
          : (m.nachrichten || []).filter((n) => n.personId === p.id).slice(0, 30).map((n) => (
            <MKarte key={n.id} ton={n.art === "warn" ? "warn" : undefined}
              style={{ borderLeft: n.gelesen ? undefined : `3px solid ${n.art === "warn" ? C.warn : C.accent}` }}>
              <div style={{ fontSize: 15.5, fontWeight: n.gelesen ? 500 : 650 }}>{n.titel}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{n.text}</div>
              <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 8, ...NUM }}>{n.zeit}</div>
            </MKarte>))}
      </MBlatt>

      <MBlatt offen={blatt === "checkliste"} onClose={() => setBlatt(null)} titel="Checkliste">
        {(() => {
          const t = personTag(m, p, heute());
          const st = t && t.dienstId ? checkStand(m, p.id, heute(), t.dienstId) : null;
          if (!st) return (
            <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px", lineHeight: 1.6 }}>
              Für deinen heutigen Dienst ist keine Checkliste hinterlegt.</div>);
          const gruppen = {};
          for (const z of st.zeilen) (gruppen[z.zeitpunkt] = gruppen[z.zeitpunkt] || []).push(z);
          return (<>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 620 }}>
                  {st.fertig} von {st.gesamt} erledigt</div>
                <div style={{ fontSize: 13, color: st.vollstaendig ? C.ok : C.dim, marginTop: 3 }}>
                  {st.vollstaendig ? "Alle Pflichtpunkte erledigt"
                    : `noch ${st.pflichtGesamt - st.pflichtFertig} Pflichtpunkte offen`}</div>
              </div>
              <div style={{ width: 54, height: 54, borderRadius: 27, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: st.vollstaendig ? C.okLight : C.flaecheStill,
                color: st.vollstaendig ? C.ok : C.dim, fontSize: 16, fontWeight: 700, ...NUM }}>
                {st.anteil}%</div>
            </div>

            {Object.entries(CHECK_ZEITPUNKTE).map(([id, zp]) => {
              const liste = gruppen[id];
              if (!liste || !liste.length) return null;
              return (
                <div key={id} style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                    textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>{zp.label}</div>
                  {liste.map((z) => (
                    <button key={z.id} disabled={z.erledigt}
                      onClick={() => akt.hakeAb(p.id, heute(), t.dienstId, z.id, "")}
                      style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%",
                        padding: "16px 18px", marginBottom: 8, borderRadius: 14, minHeight: 56,
                        border: `1px solid ${z.erledigt ? C.okLight : C.line}`,
                        background: z.erledigt ? C.okLight : C.flaeche, textAlign: "left",
                        fontFamily: "inherit", color: C.text,
                        cursor: z.erledigt ? "default" : "pointer" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                        marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1.5px solid ${z.erledigt ? C.ok : C.lineStark}`,
                        background: z.erledigt ? C.ok : "transparent", color: C.aufAkzent,
                        fontSize: 14 }}>{z.erledigt ? <Icon n="haken" size={14} strokeWidth={2.4} /> : ""}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 15.5,
                          fontWeight: z.erledigt ? 500 : 600,
                          opacity: z.erledigt ? .65 : 1 }}>{z.text}</span>
                        {z.uhrzeit && !z.erledigt && (
                          <span style={{ display: "block", fontSize: 13, color: C.dim,
                            marginTop: 3 }}>fällig um {z.uhrzeit}</span>)}
                        {z.erledigt && (
                          <span style={{ display: "block", fontSize: 12.5, color: C.dim,
                            marginTop: 4 }}>
                            {new Date(z.zeit).toLocaleTimeString("de-DE",
                              { hour: "2-digit", minute: "2-digit" })} Uhr
                            {z.nachtraeglich ? " · nachgetragen" : ""}</span>)}
                        {!z.pflicht && !z.erledigt && (
                          <span style={{ display: "block", fontSize: 12.5, color: C.dimmer,
                            marginTop: 3 }}>freiwillig</span>)}
                      </span>
                    </button>))}
                </div>);
            })}

            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55, paddingBottom: 20 }}>
              Ein Haken lässt sich nicht zurücknehmen. Wenn du dich vertan hast,
              melde es der Schichtverantwortung — eine nachträglich änderbare
              Dokumentation wäre als Nachweis wertlos.
            </div>
          </>);
        })()}
      </MBlatt>

      {/* ------------------------ Selbstplanung ---------------------- */}
      <MBlatt offen={blatt === "selbstplan"} onClose={() => setBlatt(null)} titel="Selbstplanung">
        {(() => {
          const r = laufendeRunde(m);
          if (!r) return (
            <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px", lineHeight: 1.6 }}>
              Gerade läuft keine Runde. Wenn die Planung eine öffnet, bekommst du
              eine Mitteilung und kannst dir deine Dienste selbst aussuchen.
            </div>);
          const st = selbstplanStand(m, r, p.id);
          const [j, mo] = r.monat.split("-").map(Number);
          const tage = dim_(j, mo - 1);
          return (<>
            <MKarte style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 640 }}>
                {MON[mo - 1]} {j}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                Bis {fKurz(r.schliesst)} kannst du dir deine Dienste aussuchen.
                Was du einträgst, bekommst du auch.
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 300, ...NUM }}>{st.eingetragen}</div>
                  <div style={{ fontSize: 12, color: C.dim }}>Dienste gewählt</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 300, ...NUM,
                    color: st.fertig ? C.ok : C.text }}>{n1(st.stunden)} h</div>
                  <div style={{ fontSize: 12, color: C.dim }}>von {n1(st.soll)} h</div>
                </div>
                {!st.fertig && (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 300, ...NUM,
                      color: C.warn }}>{st.etwaNochDienste}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>fehlen etwa</div>
                  </div>)}
              </div>
              {st.fertig && (
                <div style={{ marginTop: 12, fontSize: 13.5, color: C.ok, fontWeight: 550 }}>
                  Dein Stundenziel ist erreicht.</div>)}
            </MKarte>

            {st.eintraege.length > 0 && (<>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: C.dim, margin: "20px 0 11px" }}>
                Deine Wahl</div>
              {st.eintraege.map((e) => {
                const da = m.dienstarten.find((x) => x.id === e.dienstId);
                return (
                  <MKarte key={e.datum} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{fLang(e.datum)}</div>
                        <div style={{ fontSize: 13.5, color: C.dim, marginTop: 3 }}>
                          {da ? `${da.name} · ${da.start}–${da.ende}` : e.dienstId}</div>
                      </div>
                      <button onClick={() => akt.selbstAustragen(e.datum)}
                        style={{ padding: "9px 14px", borderRadius: 10, minHeight: 44,
                          border: `1px solid ${C.line}`, background: "transparent",
                          color: C.dim, fontFamily: "inherit", fontSize: 13.5,
                          fontWeight: 600, cursor: "pointer" }}>Weg</button>
                    </div>
                  </MKarte>);
              })}
            </>)}

            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
              textTransform: "uppercase", color: C.dim, margin: "24px 0 11px" }}>
              Freie Dienste</div>
            {Array.from({ length: tage }, (_, i) => `${r.monat}-${pad(i + 1)}`)
              .map((d) => {
                const moeglich = m.dienstarten.filter((da) => !da.posten)
                  .map((da) => ({ da, pruef: darfSelbstEintragen(m, r, p.id, d, da.id) }))
                  .filter((x) => x.pruef.darf);
                if (!moeglich.length) return null;
                return (
                  <MKarte key={d} style={{ marginBottom: 9 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 9 }}>
                      {fLang(d)}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {moeglich.map(({ da, pruef }) => (
                        <button key={da.id} onClick={() => akt.selbstEintragen(d, da.id)}
                          style={{ flex: "1 1 auto", minWidth: 100, minHeight: 48,
                            padding: "11px 14px", borderRadius: 11, cursor: "pointer",
                            border: `1px solid ${da.farbe}`, background: `${da.farbe}12`,
                            color: C.text, fontFamily: "inherit", textAlign: "left" }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
                            {da.name}</span>
                          <span style={{ display: "block", fontSize: 12, color: C.dim,
                            marginTop: 2 }}>{da.start}–{da.ende}
                            {pruef.offen ? ` · ${pruef.offen} frei` : ""}</span>
                          {(pruef.hinweise || []).length > 0 && (
                            <span style={{ display: "flex", gap: 5, alignItems: "flex-start", fontSize: 12, color: C.warn,
                              marginTop: 5, lineHeight: 1.35 }}>
                              <Icon n="warnung" size={13} />{pruef.hinweise[0]}</span>)}
                        </button>))}
                    </div>
                  </MKarte>);
              })}
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 16, lineHeight: 1.55,
              paddingBottom: 20 }}>
              Ruhezeit, Qualifikationen und deine Abwesenheiten sind bereits geprüft. Spricht
              etwas dagegen, steht ein Hinweis am Dienst. Du kannst dich trotzdem eintragen;
              die Planung entscheidet.
            </div>
          </>);
        })()}
      </MBlatt>

      {/* --------------------------- Notruf -------------------------- */}
      <MBlatt offen={blatt === "notruf"} onClose={() => setBlatt(null)} titel="Hilfe anfordern">
        <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, marginBottom: 22 }}>
          {/* Bis der Server selbst zustellt, wird niemand aktiv benachrichtigt —
              der Text verspricht nur, was geschieht. */}
          Dein Hilferuf wird erfasst und ist für Schichtverantwortung, Planung und
          Leitung in CENTRIC sichtbar. Dienst und Einsatzort werden vermerkt.
        </div>
        {Object.entries(NOTRUF_ARTEN).map(([id, a]) => (
          <button key={id} onClick={() => { akt.notrufSenden(id, ""); setBlatt(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 11,
              padding: "18px 20px", borderRadius: 14, cursor: "pointer", minHeight: 64,
              border: `1px solid ${a.dringend ? C.danger : C.line}`,
              background: a.dringend ? C.dangerLight : "transparent",
              fontFamily: "inherit", color: C.text }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 640,
              color: a.dringend ? C.danger : C.text }}>{a.label}</span>
            <span style={{ display: "block", fontSize: 13.5, color: C.dim, marginTop: 4,
              lineHeight: 1.45 }}>{a.text}</span>
          </button>))}
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 18, lineHeight: 1.55,
          paddingBottom: 20 }}>
          Bei Gefahr für Leib und Leben wähle zuerst 112. Diese Meldung ersetzt
          keinen Notruf bei Polizei oder Rettungsdienst.
        </div>
      </MBlatt>

      <MBlatt offen={blatt === "offene"} onClose={() => setBlatt(null)} titel="Offene Schichten">
        {(() => {
          const meine = meineOffenenSchichten(m, p.id);
          const beworben = (m.ausschreibungen || []).filter((a) => a.status === "offen"
            && (a.bewerbungen || []).some((b) => b.personId === p.id));
          if (!meine.length && !beworben.length)
            return (
              <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px", lineHeight: 1.6 }}>
                Gerade ist nichts offen, das du übernehmen könntest. Sobald eine Schicht
                ausgeschrieben wird, die zu deinem Plan passt, erscheint sie hier.
              </div>);
          return (<>
            {beworben.length > 0 && (<>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: C.dim, margin: "4px 0 12px" }}>Beworben</div>
              {beworben.map((a) => {
                const da = m.dienstarten.find((x) => x.id === a.dienstId);
                const anzahl = (a.bewerbungen || []).length;
                return (
                  <MKarte key={a.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 620 }}>
                      {fLang(a.datum)}</div>
                    <div style={{ fontSize: 14.5, color: C.dim, marginTop: 4 }}>
                      {da ? `${da.name} · ${da.start}–${da.ende}` : a.dienstId}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>
                      {anzahl === 1 ? "Du bist bisher die einzige Meldung."
                        : `${anzahl} haben sich gemeldet. Die Planung entscheidet.`}</div>
                    <button onClick={() => akt.ziehBewerbungZurueck(a.id)}
                      style={{ marginTop: 12, padding: "11px 18px", borderRadius: 12,
                        border: `1px solid ${C.line}`, background: "transparent", color: C.dim,
                        fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
                        minHeight: 48 }}>Zurückziehen</button>
                  </MKarte>);
              })}
            </>)}

            {meine.length > 0 && (<>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: C.dim, margin: "22px 0 12px" }}>Frei</div>
              {meine.map((a) => {
                const da = m.dienstarten.find((x) => x.id === a.dienstId);
                const tage = between(heute(), a.datum);
                return (
                  <MKarte key={a.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 620 }}>{fLang(a.datum)}</div>
                    <div style={{ fontSize: 14.5, color: C.dim, marginTop: 4 }}>
                      {da ? `${da.name} · ${da.start}–${da.ende}` : a.dienstId}
                      {da ? ` · ${n1(dauer(da))} h` : ""}</div>
                    {a.hinweis && <div style={{ fontSize: 13.5, color: C.dim, marginTop: 8,
                      lineHeight: 1.5, fontStyle: "italic" }}>„{a.hinweis}"</div>}
                    {(() => { const h = darfSichBewerben(m, p.id, a).hinweise || [];
                      return h.length > 0 && (
                        <div style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13.5, color: C.warn,
                          marginTop: 8, lineHeight: 1.45 }}>
                          <Icon n="warnung" size={15} />
                          <span>{h[0]}{h.length > 1 ? ` (und ${h.length - 1} weitere)` : ""}. Du kannst dich trotzdem melden; die Planung entscheidet.</span>
                        </div>); })()}
                    <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8 }}>
                      {tage <= 1 ? "morgen" : `in ${tage} Tagen`}
                      {(a.bewerbungen || []).length > 0
                        ? ` · ${(a.bewerbungen || []).length} haben sich schon gemeldet` : ""}</div>
                    <button onClick={() => akt.bewirbDich(a.id, "")}
                      style={{ marginTop: 14, width: "100%", padding: "14px", borderRadius: 12,
                        border: "none", background: C.accent, color: C.aufAkzent, fontFamily: "inherit",
                        fontSize: 15.5, fontWeight: 600, cursor: "pointer", minHeight: 48 }}>
                      Ich übernehme das</button>
                  </MKarte>);
              })}
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 16, lineHeight: 1.55,
                paddingBottom: 20 }}>
                Ruhezeit, Qualifikationen und deine Abwesenheiten sind bereits geprüft. Spricht
                etwas dagegen, steht es dabei — melden kannst du dich trotzdem.
              </div>
            </>)}
          </>);
        })()}
      </MBlatt>

      <MBlatt offen={blatt === "melden"} onClose={() => setBlatt(null)} titel="Mitteilungen">
        <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, marginBottom: 20 }}>
          Wähle, worüber du unterrichtet werden willst. Im Postfach erscheint alles —
          hier geht es nur um E-Mail und Mitteilungen auf dem Gerät.
        </div>

        {/* Push zuerst: ohne Erlaubnis nützt jede Einstellung nichts */}
        <MKarte style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span aria-hidden="true" style={{ color: C.accent, display: "flex" }}><Icon n="glocke" size={22} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 620 }}>Mitteilungen auf diesem Gerät</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                {!SP.pushMoeglich()
                  ? "Dieses Gerät unterstützt keine Mitteilungen. Auf dem iPhone muss CENTRIC dafür auf dem Startbildschirm liegen."
                  : SP.pushErlaubt()
                    ? "Eingeschaltet. Du wirst bei kurzfristigen Änderungen unterrichtet."
                    : "Ausgeschaltet. Du erfährst von Änderungen erst beim nächsten Öffnen."}
              </div>
              {SP.pushMoeglich() && (
                <button onClick={() => akt.pushUmschalten(!SP.pushErlaubt())}
                  style={{ marginTop: 12, padding: "11px 18px", borderRadius: 12, border: "none",
                    background: SP.pushErlaubt() ? C.flaecheStill : C.accent,
                    color: SP.pushErlaubt() ? C.text : C.aufAkzent, fontFamily: "inherit",
                    fontSize: 14.5, fontWeight: 600, cursor: "pointer", minHeight: 48 }}>
                  {SP.pushErlaubt() ? "Ausschalten" : "Einschalten"}</button>)}
            </div>
          </div>
        </MKarte>

        {/* E-Mail-Adresse */}
        <MKarte style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15.5, fontWeight: 620, marginBottom: 8 }}>E-Mail-Adresse</div>
          <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
            {p.email ? "Entscheidungen zu deinen Anträgen gehen hierhin."
              : "Ohne Adresse bekommst du keine E-Mails. Das ist in Ordnung — im Postfach steht alles."}
          </div>
          <input type="email" aria-label="E-Mail-Adresse" defaultValue={p.email || ""} placeholder="name@betrieb.de"
            onBlur={(e) => akt.setzeEmail(p.id, e.target.value.trim())}
            style={{ width: "100%", padding: "13px 15px", fontSize: 16, borderRadius: 12,
              border: `1px solid ${C.steuer}`, fontFamily: "inherit", boxSizing: "border-box",
              background: C.bg, color: C.text, minHeight: 48 }} />
        </MKarte>

        {/* Je Art getrennt */}
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
          textTransform: "uppercase", color: C.dim, margin: "22px 0 12px" }}>Wobei</div>
        {Object.entries(ZUSTELLARTEN).map(([id, a]) => {
          const w = zustellwege(p, id);
          return (
            <MKarte key={id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{a.titel}</div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{a.text}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {[["mail", "E-Mail", w.mail], ["push", "Gerät", w.push]].map(([weg, label, an]) => (
                  <button key={weg} onClick={() => akt.setzeZustellung(p.id, id, weg, !an)}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, minHeight: 44,
                      border: `1px solid ${an ? C.accent : C.line}`, cursor: "pointer",
                      background: an ? C.accentLight : "transparent", color: an ? C.accent : C.dim,
                      fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 }}>
                    {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{label}</button>))}
              </div>
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "nachweise"} onClose={() => setBlatt(null)} titel="Meine Nachweise">
        {p.qualifikationen.map((q) => {
          const s = nachweisStand(m, p, q);
          if (!s.qual) return null;
          const tone = s.stand === "abgelaufen" ? "danger" : s.stand === "laeuft_ab" ? "warn" : "ok";
          return (
            <MKarte key={q} ton={tone === "ok" ? undefined : tone}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{s.qual.name}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>
                    {s.stand === "abgelaufen" ? `abgelaufen am ${fDatum(s.ablauf)}`
                      : s.stand === "laeuft_ab" ? `läuft in ${s.tage} Tagen ab`
                      : s.stand === "fehlt" ? (s.nurStatus ? "noch nicht bestätigt" : "nicht hinterlegt")
                      : s.nurStatus ? "liegt vor"
                      : s.unbefristet ? "unbefristet gültig" : `gültig bis ${fDatum(s.ablauf)}`}</div>
                </div>
                <Pill size="sm" tone={tone}>{s.stand === "gueltig" ? "gültig" : s.stand === "laeuft_ab" ? "bald" : "abgelaufen"}</Pill>
              </div>
              {s.stand === "abgelaufen" && (
                <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10, lineHeight: 1.45 }}>
                  Bitte einen neuen Nachweis bei der Planung einreichen. Bis dahin zählt diese Qualifikation
                  nicht für die Besetzung.</div>)}
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "aushang"} onClose={() => setBlatt(null)} titel="Schwarzes Brett">
        {(m.aushang || []).length === 0
          ? <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px" }}>Nichts angeschlagen.</div>
          : (m.aushang || []).map((x) => (
            <MKarte key={x.id} ton={x.wichtig ? "danger" : undefined}>
              {x.wichtig && <Pill size="sm" tone="danger" style={{ marginBottom: 8 }}>wichtig</Pill>}
              <div style={{ fontSize: 16.5, fontWeight: 650 }}>{x.titel}</div>
              <div style={{ fontSize: 14, color: C.dim, marginTop: 7, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {x.text}</div>
              <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 10, ...NUM }}>{x.von} · {x.zeit}</div>
            </MKarte>))}
      </MBlatt>

      <MBlatt offen={blatt === "zeiten"} onClose={() => setBlatt(null)} titel="Zeiten bestätigen">
        <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
          Solange die tatsächliche Zeit nicht bestätigt ist, bleibt dein Stundenkonto eine Hochrechnung.
        </div>
        {offeneErfassung(m, p, addDays(heute(), -1)).map((d) => {
          const t = personTag(m, p, d);
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          if (!da) return null;
          return (
            <MKarte key={d}>
              <div style={{ fontSize: 15.5, fontWeight: 600, ...NUM }}>{fLang(d)}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4, ...NUM }}>
                geplant {da.start}–{da.ende} · {n1(dauer(da))} h</div>
              <Btn kind="ok" style={{ width: "100%", height: 46, marginTop: 13, borderRadius: 15 }}
                onClick={() => akt.bestaetigeZeit(p.id, d, null, null, "")}>Wie geplant</Btn>
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "wuensche"} onClose={() => setBlatt(null)} titel="Wunschdienste">
        <MWuensche sitz={sitz} akt={akt} />
      </MBlatt>

      <MBlatt offen={!!antrag} onClose={() => setAntrag(null)} titel="Frei beantragen">
        {antrag && (
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Art">
              <Sel value={antrag.art} onChange={(e) => setAntrag({ ...antrag, art: e.target.value })}>
                {ABW.filter((a) => a.id !== "krank" && a.id !== "ausgleich" && a.selbst !== false)
                  .map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></Field>
            <Field label="Von"><Inp type="date" value={antrag.von}
              onChange={(e) => setAntrag({ ...antrag, von: e.target.value })} /></Field>
            <Field label="Bis"><Inp type="date" value={antrag.bis}
              onChange={(e) => setAntrag({ ...antrag, bis: e.target.value })} /></Field>
            <Field label="Anmerkung"><Inp value={antrag.text}
              onChange={(e) => setAntrag({ ...antrag, text: e.target.value })} /></Field>
            <Btn kind="primary" style={{ height: 52, borderRadius: 17, fontSize: 15.5 }}
              onClick={() => { akt.stelleAntrag({ typ: "abwesenheit", art: antrag.art,
                von: antrag.von, bis: antrag.bis, text: antrag.text }); setAntrag(null); }}>
              Antrag stellen</Btn>
          </div>)}
      </MBlatt>

      {dialoge}
    </div>);
}

/** Wunschraster in kompakter Form fürs Telefon. */
function MWuensche({ sitz, akt }) {
  const m = sitz.mandant, ich = sitz.person;
  const [ym, setYm] = useState(heute().slice(0, 7));
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym}-01`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym}-${pad(i)}`);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (<>
    <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
      Tippen wechselt zwischen „würde gern", „lieber nicht" und leer. Kein Antrag — nur ein Hinweis
      an die Planung.
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <Btn size="sm" onClick={() => shift(-1)} aria-label="Zurück"><Icon n="chevron-links" size={16} /></Btn>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{MON[mo - 1]} {y}</span>
      <Btn size="sm" onClick={() => shift(1)} aria-label="Weiter"><Icon n="chevron-rechts" size={16} /></Btn>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
      {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600,
        color: i >= 5 ? C.dimmer : C.dim }}>{d.slice(0, 2)}</div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 20 }}>
      {zellen.map((d, i) => {
        if (!d) return <div key={i} />;
        const w = wunschAm(m, ich.id, d);
        const t = personTag(m, ich, d);
        const da = t.dienstId && map[t.dienstId];
        const vergangen = d < heute();
        return (
          <div key={d}
            {...(vergangen ? {} : klickbar(() => akt.setzeWunsch(ich.id, d),
              `${fLang(d)}${w ? `, ${w.art === "moechte" ? "möchte arbeiten" : "lieber nicht"}` : ""}`))}
            style={{ aspectRatio: "1", borderRadius: 12, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 1, opacity: vergangen ? .4 : 1,
              background: w ? (w.art === "moechte" ? C.okLight : C.warnLight)
                : C.bg }}>
            <span style={{ fontSize: 12, color: C.dim, ...NUM }}>{Number(d.slice(8))}</span>
            {w ? <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", color: w.art === "moechte" ? C.ok : C.warn }}>
              {w.art === "moechte" ? <><Icon n="haken" size={13} strokeWidth={2.4} /><span className="nurLeser">möchte arbeiten</span></> : <><Icon n="x" size={13} strokeWidth={2.4} /><span className="nurLeser">lieber nicht</span></>}</span>
              : da && <span style={{ fontSize: 9.5, color: lesbar(da.farbe), fontWeight: 700 }}>{da.kurz}</span>}
          </div>);
      })}
    </div>
  </>);
}

const REGELFELDER = [
  ["ruhezeit", "Mindestruhezeit zwischen Diensten in Stunden", "strenger_ist_hoeher"],
  ["maxFolge", "Höchstzahl Dienste in Folge", "strenger_ist_niedriger"],
  ["maxNachtFolge", "Höchstzahl Nachtdienste in Folge", "strenger_ist_niedriger"],
  ["maxUrlaubJeEinheit", null, "strenger_ist_niedriger"],
  ["sollWochenstunden", "Vertragliche Wochenarbeitszeit", null],
];

/** Die Befundarten, die unmittelbar an einer Regelgrenze hängen. */
const REGELBEFUNDE = ["ruhezeit", "folge", "nachtfolge", "urlaub"];

function Regelwerk({ m, akt }) {
  const ym = heute().slice(0, 7);
  const [y, mo] = ym.split("-").map(Number);
  const von = `${ym}-01`, bis = `${ym}-${pad(dim_(y, mo - 1))}`;

  /* Der Ausgangsstand wird einmal festgehalten, beim Öffnen der Seite.
     Ihn bei jeder Änderung nachzuziehen hieße, dass der Vergleich immer
     null ergibt — dann zeigte die Anzeige nie etwas an. */
  const ausgang = useRef(m.einstellungen);
  /* Beim laufenden Stand auf dem Mandanten selbst prüfen, nicht auf einer
     Kopie: Die Zwischenergebnisse hängen am Objekt, und eine Kopie wirft
     sie alle weg. Nur der Vergleichsstand braucht eine. */
  const zaehle = (einst) => (einst === m.einstellungen
    ? pruefen(m, von, bis)
    : pruefen({ ...m, einstellungen: einst }, von, bis))
    .filter((b) => REGELBEFUNDE.includes(b.art)).length;

  const jetzt = useMemo(() => zaehle(m.einstellungen), [m, ym]);
  const vorher = useMemo(() => zaehle(ausgang.current), [m, ym]);

  /* Strenger geworden oder lockerer? Nicht an der Zahl der Befunde
     abzulesen, sondern an der Grenze selbst. */
  const richtung = REGELFELDER.reduce((acc, [k, , art]) => {
    if (!art || acc) return acc;
    const a = Number(ausgang.current[k]), b = Number(m.einstellungen[k]);
    if (a === b) return acc;
    const strenger = art === "strenger_ist_hoeher" ? b > a : b < a;
    return strenger ? "strenger" : "lockerer";
  }, null);

  return (
    <Card>
      <CardHead>Regelwerk</CardHead>
      <div style={{ padding: 22, display: "grid", gap: 14 }}>
        {REGELFELDER.map(([k, l]) => (
          <Field key={k} label={l || `Gleichzeitige Urlaube je ${m.einheitLabel}`}>
            <Inp type="number" step="0.5" value={m.einstellungen[k]}
              onChange={(e) => akt.setzeEinstellung(k, Number(e.target.value))} /></Field>))}

        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 16, marginTop: 2 }}>
          <Lab style={{ marginBottom: 9 }}>Was das für {MON[mo - 1]} bedeutet</Lab>
          {jetzt === vorher ? (
            <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>
              {jetzt === 0
                ? "Die Prüfung meldet keinen Verstoß gegen diese Grenzen."
                : `Die Prüfung meldet ${zahl(jetzt)} Befund${jetzt > 1 ? "e" : ""} zu Ruhezeit, Dienst- und Nachtfolgen.`}
            </div>
          ) : (<>
            <Sprung gross={false} vorher={zahl(vorher)} nachher={zahl(jetzt)}
              einheit={`Befund${jetzt === 1 ? "" : "e"}`}
              ton={richtung === "lockerer" ? "warn" : "ok"}
              differenz={`${jetzt > vorher ? "+" : "−"}${zahl(Math.abs(jetzt - vorher))}`} />
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 10, maxWidth: 520 }}>
              {richtung === "lockerer"
                ? "Die Grenze ist gelockert. An den geplanten Diensten ändert das nichts — sie werden nur nicht mehr gemeldet."
                : "Die Grenze ist verschärft. Die zusätzlichen Befunde bestehen seit jeher; sie fielen bisher unter die alte Grenze."}
            </div>
          </>)}
        </div>
      </div>
    </Card>);
}

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

/* WP-07 (Review A2): Abmelden mit Hinweis, wenn Stempel noch auf das Netz
   warten. Sie bleiben auf dem Gerät und werden nach der nächsten Anmeldung
   derselben Person gesendet; eine andere Person sieht und sendet sie nicht. */
function abmeldenMitHinweis() {
  const n = SP.stempelWartendAnzahl();
  if (n && typeof window !== "undefined" && typeof window.confirm === "function"
    && !window.confirm(`${n === 1 ? "Ein Stempel wartet" : `${n} Stempel warten`} noch auf das Netz. `
      + "Er bleibt auf diesem Gerät gespeichert und wird gesendet, sobald du dich wieder anmeldest. Trotzdem abmelden?")) return;
  /* Gemerkte Schutzkonflikte gehören zur Sitzung (WP-22b): vor dem Abmelden leeren. */
  vergissSchutzkonflikte();
  SP.abmelden();
  window.location.reload();
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
