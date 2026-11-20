#!/usr/bin/env node
/* ==========================================================================
   V4-1: Inventar der Oberflächendateien mit V4-Status (MIGRATION Schritt 2).

   Rein lesend und deterministisch: liest Quelltext unter src/, die Navigation (src/app/navigation.js), die Rollenmatrix
   (src/lib/rollen.js) und die Flächenlisten der Browserproben. Keine Uhr, kein Netz, keine Kindprozesse, schreibt nichts.
   Zählungen sind Textzählungen (Regex) über den Rohtext; nur Farbliterale (rgb/rgba, Hex) werden ohne Kommentare gezählt.

   Aufruf:
     node werkzeug/v4-inventar.mjs              Kurzfassung (Zählstand)
     node werkzeug/v4-inventar.mjs --markdown   Tabellen für docs/acc45/V4-INVENTAR.md
     node werkzeug/v4-inventar.mjs --json       vollständige Daten
     node werkzeug/v4-inventar.mjs --streng     Exit 1 bei Datei ohne ZUORDNUNG oder verschwundener Datei im Dokument
     node werkzeug/v4-inventar.mjs --hauptansichten   Formebene je Hauptansicht (docs/acc45/V4-IST-STAND-2026-11-20.md)
   Test: pruefungen/v4-inventar.test.js, pruefungen/v4-ist-stand.test.js (npm run pruefung:querschnitt).
   ========================================================================== */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Erfasste Orte. Rekursion nur in src/ansichten (Unterordner intelligence). */
export const ORTE = [
  { dir: "src", muster: /\.jsx$/, rekursiv: false, gruppe: "Schale/Einstieg" },
  { dir: "src/ansichten", muster: /\.jsx$/, rekursiv: true, gruppe: "Ansicht" },
  { dir: "src/module", muster: /\.jsx$/, rekursiv: false, gruppe: "Branchenmodul" },
  { dir: "src/ui", muster: /\.(jsx|js)$/, rekursiv: false, gruppe: "Baustein ui" },
  { dir: "src/gestalt", muster: /\.(jsx|js)$/, rekursiv: false, gruppe: "Baustein gestalt" },
  { dir: "src/v4", muster: /\.(jsx|js)$/, rekursiv: false, gruppe: "V4" },
];

/** Die zehn Seitenfamilien aus design/v4-glass/DESIGNSYSTEM.md plus Querschnitt (keine Seite). */
export const FAMILIEN = {
  lage: "Dienstlage / Dashboard",
  plan: "Monats-, Tages-, Jahresplan",
  personal: "Personal / Qualifikationen",
  standort: "Standorte / Besetzung",
  zeit: "Zeit, Urlaub, Abwesenheit",
  auswertung: "Auswertung / Export",
  pruefung: "Regelprüfung / Prüfungen",
  einstellung: "Rollen / Einstellungen / Login",
  betreiber: "Betreiberkonsole",
  website: "Öffentliche Website",
  querschnitt: "Querschnitt (Baustein, Schale, Dialog)",
  offen: "Nicht zugeordnet (neue Datei, ZUORDNUNG ergänzen)",
};

/**
 * Familie und Zweck je Datei. Zuordnung ist ein Urteil (Dateiname, Exporte, Navigation), keine Messung.
 * Fehlt eine Datei hier, bekommt sie die Familie „offen“; der Test warnt, `--streng` endet mit Exit 1.
 */
export const ZUORDNUNG = {
  "src/App.jsx": ["querschnitt", "Anwendungsschale: Navigation, Ansichtswahl, Dialogblock, Stil"],
  "src/betreiber-2fa.jsx": ["einstellung", "Zwei-Faktor für Betreiber und Zugänge"],
  "src/main.jsx": ["einstellung", "Einstieg: Anmeldung, Registrierung, Fehlerseiten vor der App"],
  "src/marke.jsx": ["querschnitt", "C-Bildmarke (SVG/Canvas)"],
  "src/pruefung.jsx": ["pruefung", "Selbsttest/Prüfanzeige (dynamisch geladen)"],
  "src/rechtstexte.jsx": ["einstellung", "Impressum, Datenschutzerklärung, Rechtsfenster"],
  "src/ringregler.jsx": ["querschnitt", "Ringregler (Eingabebaustein)"],
  "src/startbild.jsx": ["querschnitt", "Startbild/Ladebild"],
  "src/verlustweg.jsx": ["einstellung", "Kontowiederherstellung bei Geräteverlust"],
  "src/ansichten/ablauf.jsx": ["lage", "Ablaufdiagramm und Einführung je Rolle"],
  "src/ansichten/abrechnungsdaten.jsx": ["auswertung", "Abrechnungsdaten"],
  "src/ansichten/adressaenderungen.jsx": ["betreiber", "Adressänderungen der Mandanten"],
  "src/ansichten/anmeldung.jsx": ["einstellung", "Anmeldung in der App"],
  "src/ansichten/ansichtleiste.jsx": ["querschnitt", "Leiste zur Ansichtswahl"],
  "src/ansichten/antraege.jsx": ["zeit", "Anträge bearbeiten"],
  "src/ansichten/antraegegeteilt.jsx": ["zeit", "Anträge, Liste und Detail"],
  "src/ansichten/assistent.jsx": ["einstellung", "Einrichtungsassistent"],
  "src/ansichten/assistent2.jsx": ["einstellung", "Einrichtungsassistent, zweite Fassung"],
  "src/ansichten/auftraggeberbericht.jsx": ["auswertung", "Leistungsnachweis für Auftraggeber"],
  "src/ansichten/ausgleichplanen.jsx": ["plan", "Ausgleich planen"],
  "src/ansichten/belastbarkeit.jsx": ["auswertung", "Belastbarkeit des Plans"],
  "src/ansichten/belastung.jsx": ["auswertung", "Belastung je Person"],
  "src/ansichten/bereitschaft.jsx": ["plan", "Bereitschaftsplan"],
  "src/ansichten/bestaetigungsfrage.jsx": ["querschnitt", "Bestätigungsdialog"],
  "src/ansichten/bestaetigungstext.jsx": ["querschnitt", "Bestätigung per Texteingabe"],
  "src/ansichten/betreiber-tarife.jsx": ["betreiber", "Tarife"],
  "src/ansichten/betreiberdetail.jsx": ["betreiber", "Mandantendetail"],
  "src/ansichten/betreibermandanten.jsx": ["betreiber", "Mandantenliste"],
  "src/ansichten/betreiberrechnungen.jsx": ["betreiber", "Rechnungen"],
  "src/ansichten/betriebsmittel.jsx": ["standort", "Betriebsmittel"],
  "src/ansichten/datenmitnahme.jsx": ["auswertung", "Datenmitnahme (Export)"],
  "src/ansichten/datenschutz.jsx": ["einstellung", "Datenschutz und Löschlauf"],
  "src/ansichten/demozugaenge.jsx": ["betreiber", "Demozugänge"],
  "src/ansichten/dienstarten.jsx": ["standort", "Dienstarten und Mindestbesetzung (Soll)"],
  "src/ansichten/dienstbuch.jsx": ["lage", "Dienstbuch"],
  "src/ansichten/dienstkarte.jsx": ["plan", "Karte eines Dienstes"],
  "src/ansichten/einarbeitung.jsx": ["personal", "Einarbeitung"],
  "src/ansichten/einheitwahl.jsx": ["querschnitt", "Einheitenwahl"],
  "src/ansichten/einladungen.jsx": ["einstellung", "Einladungen und Zugänge"],
  "src/ansichten/einsatzorte.jsx": ["standort", "Einsatzorte mit Koordinaten"],
  "src/ansichten/einsatzplan.jsx": ["plan", "Personaleinsatz"],
  "src/ansichten/einsatzregelliste.jsx": ["pruefung", "Einsatzregeln"],
  "src/ansichten/einstellungen.jsx": ["einstellung", "Einstellungen"],
  "src/ansichten/einwilligungen.jsx": ["einstellung", "Einwilligungen"],
  "src/ansichten/ersatzliste.jsx": ["standort", "Ersatzvorschläge"],
  "src/ansichten/eskalation.jsx": ["lage", "Eskalation bei Unterdeckung"],
  "src/ansichten/fenster.jsx": ["querschnitt", "Dialograhmen (Fenster)"],
  "src/ansichten/freigabeleiste.jsx": ["plan", "Leiste Planfreigabe"],
  "src/ansichten/geo-schalter.jsx": ["einstellung", "Schalter Geo-Prüfung"],
  "src/ansichten/handbuch.jsx": ["querschnitt", "Handbuch"],
  "src/ansichten/hilfe-frage.jsx": ["querschnitt", "Hilfe: Frage stellen"],
  "src/ansichten/hilfe.jsx": ["querschnitt", "Hilfe"],
  "src/ansichten/import-datei.jsx": ["personal", "Personalimport aus Datei"],
  "src/ansichten/import.jsx": ["personal", "Import"],
  "src/ansichten/jahresansicht.jsx": ["plan", "Jahresansicht"],
  "src/ansichten/jugendschutz-schalter.jsx": ["einstellung", "Schalter Jugendschutz"],
  "src/ansichten/kapazitaetsvorschau.jsx": ["standort", "Kapazitätsvorschau"],
  "src/ansichten/kommandoleiste.jsx": ["querschnitt", "Befehlsleiste/Suche"],
  "src/ansichten/kompetenzen.jsx": ["personal", "Kompetenzen"],
  "src/ansichten/kontoblatt.jsx": ["zeit", "Stundenkonto-Blatt"],
  "src/ansichten/korrekturantraege.jsx": ["zeit", "Korrekturanträge"],
  "src/ansichten/korrekturen.jsx": ["zeit", "Zeitkorrekturen (Formular)"],
  "src/ansichten/korrekturoffene.jsx": ["zeit", "Offene Korrekturen"],
  "src/ansichten/krankmeldung.jsx": ["zeit", "Krankmeldung"],
  "src/ansichten/krankmeldungen-offen.jsx": ["zeit", "Krankmeldungen in Bearbeitung"],
  "src/ansichten/ladefehler.jsx": ["querschnitt", "Ladefehlerseite"],
  "src/ansichten/lagebild.jsx": ["lage", "Lagebild"],
  "src/ansichten/lenkzeiten.jsx": ["pruefung", "Lenkzeiten"],
  "src/ansichten/lohnausgabe.jsx": ["auswertung", "Lohnausgabe"],
  "src/ansichten/mailbestaetigung.jsx": ["einstellung", "Mailadresse bestätigen"],
  "src/ansichten/mandantanlegen.jsx": ["betreiber", "Mandant anlegen"],
  "src/ansichten/mandantenrechner.jsx": ["betreiber", "Mandantenrechner"],
  "src/ansichten/mandantneuanlegen.jsx": ["betreiber", "Neuer Mandant"],
  "src/ansichten/mehrfach.jsx": ["plan", "Mehrfachbearbeitung im Plan"],
  "src/ansichten/meineschichten.jsx": ["plan", "Meine Schichten"],
  "src/ansichten/mobil.jsx": ["querschnitt", "Telefonschale der Beschäftigten (Heute, Mein Plan, Anliegen, Mehr)"],
  "src/ansichten/monatsabschluss.jsx": ["zeit", "Monatsabschluss"],
  "src/ansichten/monatskorrektur.jsx": ["zeit", "Korrekturrevision nach Lohnexport"],
  "src/ansichten/monatsplan.jsx": ["plan", "Monatsplan"],
  "src/ansichten/nachrichten.jsx": ["lage", "Nachrichten"],
  "src/ansichten/nachweise.jsx": ["personal", "Nachweise/Zertifikate"],
  "src/ansichten/nachweispflege.jsx": ["personal", "Nachweispflege"],
  "src/ansichten/notizen.jsx": ["lage", "Tagesnotizen"],
  "src/ansichten/notrufe.jsx": ["lage", "Notrufe"],
  "src/ansichten/offeneschichten.jsx": ["standort", "Offene Schichten"],
  "src/ansichten/offline-schalter.jsx": ["einstellung", "Schalter Offlinebetrieb"],
  "src/ansichten/pakete.jsx": ["betreiber", "Pakete"],
  "src/ansichten/personal.jsx": ["personal", "Personal"],
  "src/ansichten/personalakte.jsx": ["personal", "Personalakte"],
  "src/ansichten/planfreigabeschalter.jsx": ["einstellung", "Schalter Planfreigabe"],
  "src/ansichten/planstand.jsx": ["plan", "Planstand"],
  "src/ansichten/planungsreife.jsx": ["pruefung", "Planungsreife (Prüfliste vor dem Planen)"],
  "src/ansichten/preisgestaltung.jsx": ["betreiber", "Preisgestaltung"],
  "src/ansichten/prioritaeten.jsx": ["lage", "Start: Prioritäten"],
  "src/ansichten/pruefung.jsx": ["pruefung", "Prüfung"],
  "src/ansichten/qualifikationsmatrix.jsx": ["personal", "Qualifikationen"],
  "src/ansichten/regelwerk.jsx": ["pruefung", "Regelwerk einstellen"],
  "src/ansichten/schichtfolge.jsx": ["plan", "Schichtfolge"],
  "src/ansichten/schichtuebergabe.jsx": ["lage", "Übergabe"],
  "src/ansichten/schnellbesetzung.jsx": ["standort", "Schnellbesetzung"],
  "src/ansichten/schrittleiste.jsx": ["querschnitt", "Schrittleiste"],
  "src/ansichten/schwarzesbrett.jsx": ["lage", "Schwarzes Brett"],
  "src/ansichten/selbstauskunft.jsx": ["personal", "Selbstauskunft"],
  "src/ansichten/selbstplanung.jsx": ["plan", "Selbstplanung"],
  "src/ansichten/selbststarts.jsx": ["betreiber", "Selbststarts"],
  "src/ansichten/sicherungausserhaus.jsx": ["einstellung", "Sicherung außer Haus"],
  "src/ansichten/sicherungenverwalten.jsx": ["einstellung", "Sicherungen verwalten"],
  "src/ansichten/sondereinsaetze.jsx": ["plan", "Sondereinsätze"],
  "src/ansichten/speicherlage.jsx": ["querschnitt", "Speicher-, Offline- und Konfliktzustand"],
  "src/ansichten/standorte.jsx": ["standort", "Standorte"],
  "src/ansichten/standortespiegel.jsx": ["standort", "Standortespiegel"],
  "src/ansichten/stempelpuffer.jsx": ["zeit", "Stempelpuffer (offline)"],
  "src/ansichten/stempeluhr.jsx": ["zeit", "Stempeluhr"],
  "src/ansichten/tagesdetail.jsx": ["plan", "Tagesdetail"],
  "src/ansichten/tagesfazit.jsx": ["lage", "Tagesfazit"],
  "src/ansichten/tagesstart.jsx": ["lage", "Tagesstart"],
  "src/ansichten/tarifwerk.jsx": ["einstellung", "Tarifwerk"],
  "src/ansichten/tauschboerse.jsx": ["zeit", "Tauschbörse"],
  "src/ansichten/teamauslastungleiste.jsx": ["plan", "Leiste Teamauslastung"],
  "src/ansichten/teilkonflikt.jsx": ["querschnitt", "Teilkonflikt beim Speichern"],
  "src/ansichten/testablauf.jsx": ["querschnitt", "Testablauf (Selbsttest-Anzeige)"],
  "src/ansichten/therapieminuten.jsx": ["auswertung", "Therapieminuten"],
  "src/ansichten/tourleiste.jsx": ["querschnitt", "Tour/Einführung"],
  "src/ansichten/ungeplanthinweis.jsx": ["zeit", "Hinweis ungeplanter Dienst"],
  "src/ansichten/untergrenzen.jsx": ["pruefung", "Untergrenzen"],
  "src/ansichten/urlaubsrunde.jsx": ["zeit", "Urlaubsrunde"],
  "src/ansichten/verfuegbarkeit.jsx": ["personal", "Verfügbarkeit"],
  "src/ansichten/verteilung.jsx": ["personal", "Verteilung"],
  "src/ansichten/vorgaben.jsx": ["pruefung", "Interne Vorgaben"],
  "src/ansichten/warndialog.jsx": ["pruefung", "Warndialog bei Regelbefund"],
  "src/ansichten/wochenliste.jsx": ["plan", "Wochenliste"],
  "src/ansichten/wunschdienste.jsx": ["zeit", "Wunschdienste"],
  "src/ansichten/zeitachse.jsx": ["lage", "Zeitachse"],
  "src/ansichten/intelligence/Aenderungsuebersicht.jsx": ["plan", "KI: Änderungsübersicht"],
  "src/ansichten/intelligence/KiAntwort.jsx": ["querschnitt", "KI: Antwort"],
  "src/ansichten/intelligence/KiEntwurf.jsx": ["plan", "KI: Planentwurf"],
  "src/module/anlagen.jsx": ["standort", "Branchenmodul Anlagen"],
  "src/module/bereichsplan.jsx": ["plan", "Branchenmodul Bereichsplan"],
  "src/module/bereitschaftsdienst.jsx": ["plan", "Branchenmodul Bereitschaftsdienst"],
  "src/module/funktionsdienst.jsx": ["plan", "Branchenmodul Funktionsdienst"],
  "src/module/geteilterdienst.jsx": ["plan", "Branchenmodul geteilter Dienst"],
  "src/module/kern.jsx": ["einstellung", "Branchenmodule: Kern und Ausnahmeweg"],
  "src/module/kontimodelle.jsx": ["plan", "Branchenmodul Kontimodelle"],
  "src/module/maschinenqual.jsx": ["personal", "Branchenmodul Maschinenqualifikation"],
  "src/module/objektbericht.jsx": ["auswertung", "Branchenmodul Objektbericht"],
  "src/module/pflegequal.jsx": ["personal", "Branchenmodul Pflegequalifikation"],
  "src/module/posten.jsx": ["standort", "Branchenmodul Posten"],
  "src/module/rotation.jsx": ["plan", "Branchenmodul Rotation"],
  "src/module/wachbuch.jsx": ["lage", "Branchenmodul Wachbuch"],
  "src/ui/bausteine.jsx": ["querschnitt", "Grundbausteine: Card, Btn, Inp, Field, Leer, Laden …"],
  "src/ui/diagramme.jsx": ["querschnitt", "Diagramme"],
  "src/ui/dialogfokus.js": ["querschnitt", "Fokusführung in Dialogen"],
  "src/ui/farbwahl.jsx": ["querschnitt", "Farbwahl"],
  "src/ui/geraete.js": ["querschnitt", "Gerätematrix (Viewports)"],
  "src/ui/leisten.jsx": ["querschnitt", "Leisten, Zellen, Balken, Standortwahl"],
  "src/ui/logo.jsx": ["querschnitt", "Logo"],
  "src/ui/raster.js": ["querschnitt", "Rasterberechnung"],
  "src/ui/schriftart.js": ["querschnitt", "Schriftart"],
  "src/ui/scrollbereich.jsx": ["querschnitt", "Scrollbereich"],
  "src/ui/thema.js": ["querschnitt", "Themenbrücke (lesbar, NUM)"],
  "src/ui/ziehen.jsx": ["querschnitt", "Ziehen und Ablegen"],
  "src/gestalt/ansichten.jsx": ["querschnitt", "Gestalt: Seitenkarte, Kennzahlen, Fehlerband …"],
  "src/gestalt/bausteine.jsx": ["querschnitt", "Gestalt: Pille, Trend, Sparkline …"],
  "src/gestalt/icons.jsx": ["querschnitt", "Symbole"],
  "src/gestalt/lesbar.js": ["querschnitt", "Kontrastaufhellung"],
  "src/gestalt/rahmen.jsx": ["querschnitt", "Gestalt: Kopfblock, Bildmarke"],
  "src/gestalt/stil.js": ["querschnitt", "Gestalt-Stil (Leitstand)"],
  "src/v4/app-stil.js": ["querschnitt", "V4-Oberflächenschicht (Overlay)"],
  "src/v4/komponenten.jsx": ["querschnitt", "V4-Basiskomponenten"],
  "src/v4/stil.js": ["querschnitt", "V4-Stil der Basiskomponenten"],
  "src/v4/thema.js": ["querschnitt", "Themenwahl hell/dunkel"],
  "src/v4/tokens.js": ["querschnitt", "V4-Tokens (Quelle)"],
};

/** Bausteindateien und V4 sind Querschnitt; Zweck aus dem Dateinamen. */
const QUERSCHNITT_ORT = /^src\/(ui|gestalt|v4)\//;

/* ------------------------------------------------------------------ Zählen */
const zaehle = (text, re) => (text.match(re) || []).length;
const RE = {
  rgb: /\brgba?\(/g,
  hex: /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
  tokenVar: /var\(--v4-/g,
  v4Import: /from\s+["'][^"']*\/v4\/[^"']+["']/,
  v4Baustein: /<V4(?:Karte|Knopf|Feld|Dialog|Hinweis)\b/g,
  palette: /from\s+["'][^"']*\/farben\.js["']/,
  bausteinImport: /from\s+["'][^"']*\/(?:ui\/bausteine|gestalt\/[a-z]+)\.jsx?["']/,
  inlineStil: /style=\{\{/g,
  backdrop: /backdrop-filter\s*:|backdropFilter\s*:/g,
  rueckfall: /prefers-reduced-transparency|@supports/,
  aria: /\baria-[a-z]+=/g,
  rolle: /\brole=["{]/g,
  dialog: /role=["'](?:alert)?dialog["']|<(?:Fenster|MBlatt|Warndialog|Bestaetigungsfrage|V4Dialog|RechtFenster|Konfliktfenster|Teilkonfliktfenster)\b/g,
  zustand: /<(?:Leer|Laden|Fehlerband|Feldfehler)\b/g,
  klassenAttr: /className=\{?\s*[`"']([^`"']*)[`"']/g,
  importe: /(?:from\s+|import\(\s*)["'](\.{1,2}\/[^"']+)["']/g,
};

/* ------------------------------------------- Formebene (V4-IST, 2026-11-20)
   Die V4-Form erreicht eine Datei auf vier Wegen: V4-Basiskomponenten (<V4Karte …>), Klassen der Oberflächenschicht
   direkt im className (auch in Ternären), über einen Baustein, der eine solche Klasse setzt (<Card>, <Btn>, <Inp>,
   <Seitenkarte>, <Fenster> …), oder über var(--v4-…) im Inline-Stil (Einstieg). Die ursprüngliche Spalte „V4-Bst.“
   zählt nur den ersten Weg; die Zählung „0 %“ beschreibt daher die Komponenten-API, nicht das Bild. */

/** Klassen der Oberflächenschicht, die nur Breite/Druck betreffen und keine Form geben. */
export const NUR_LAYOUT_KLASSEN = ["noprint", "inhalt"];
export const formKlassen = (overlayKlassen) => overlayKlassen.filter((k) => !NUR_LAYOUT_KLASSEN.includes(k));

/** Ausdruck eines className-Attributs: "…"/'…' bis zum Schlussquote, {…} bis zur passenden Klammer. */
function klassenAusdruck(text, ab) {
  const q = text[ab];
  if (q === '"' || q === "'") { const z = text.indexOf(q, ab + 1); return text.slice(ab + 1, z < 0 ? undefined : z); }
  if (q !== "{") return "";
  let tiefe = 0;
  for (let i = ab; i < text.length; i++) {
    if (text[i] === "{") tiefe++;
    else if (text[i] === "}" && --tiefe === 0) return text.slice(ab + 1, i);
  }
  return text.slice(ab + 1);
}

/** Textliterale eines JS-Ausdrucks: "…", '…' und die festen Teile von `…${…}…` (auch verschachtelt). */
function literaleIn(expr) {
  const raus = [];
  let i = 0;
  const ausdruck = (bisKlammer) => {
    let tiefe = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (c === '"' || c === "'") { const z = expr.indexOf(c, i + 1); raus.push(expr.slice(i + 1, z < 0 ? expr.length : z)); i = z < 0 ? expr.length : z + 1; continue; }
      if (c === "`") { i++; vorlage(); continue; }
      if (c === "{") tiefe++;
      else if (c === "}") { if (bisKlammer && tiefe === 0) { i++; return; } tiefe--; }
      i++;
    }
  };
  const vorlage = () => {
    let puffer = "";
    while (i < expr.length) {
      const c = expr[i];
      if (c === "`") { raus.push(puffer); i++; return; }
      if (c === "$" && expr[i + 1] === "{") { raus.push(puffer); puffer = ""; i += 2; ausdruck(true); continue; }
      puffer += c; i++;
    }
    raus.push(puffer);
  };
  ausdruck(false);
  return raus;
}

/** Alle Klassenwörter aus className-Ausdrücken, auch aus Ternären und Vorlagen (Bezeichner in `${…}` zählen nicht). */
export function klassenWoerter(text) {
  const t = String(text), raus = [];
  for (const m of t.matchAll(/className=/g)) {
    const ab = m.index + m[0].length;
    const a = klassenAusdruck(t, ab);
    const teile = t[ab] === "{" ? literaleIn(a) : [a];
    for (const s of teile) for (const w of s.split(/\s+/)) if (w) raus.push(w);
  }
  return raus;
}

/** Dateien, deren exportierte Komponenten als Formträger in Frage kommen (Bausteine und gemeinsame Dialograhmen). */
export const TRAEGER_DATEIEN = [
  "src/ui/bausteine.jsx", "src/ui/leisten.jsx", "src/ui/scrollbereich.jsx",
  "src/gestalt/ansichten.jsx", "src/gestalt/bausteine.jsx", "src/gestalt/rahmen.jsx",
  "src/ansichten/fenster.jsx", "src/ansichten/bestaetigungsfrage.jsx", "src/ansichten/teilkonflikt.jsx",
  "src/ansichten/warndialog.jsx",
];

/** Exportierte Komponenten eines Quelltexts, deren Rumpf eine Formklasse setzt (sortiert). */
export function formTraegerIn(text, klassen) {
  const fk = new Set(klassen);
  const namen = [];
  /* Abschnitt = von einem Export bis zur nächsten Deklaration auf oberster Ebene (lokale Helfer gehören nicht dazu). */
  for (const s of String(text).split(/\n(?=export\s|function\s|const\s|class\s)/)) {
    const m = s.match(/^export\s+(?:const|function)\s+([A-Z]\w*)/);
    if (m && klassenWoerter(s).some((w) => fk.has(w))) namen.push(m[1]);
  }
  return namen.sort();
}

/** Inline-Formwerte, die an den Tokens vorbeigehen: borderRadius als Zahl oder Zeichenkette (nicht var(…)),
 *  boxShadow als Zeichenkette (nicht "none", nicht var(…)). Gezählt im Text ohne Kommentare. */
const RE_FORM_LITERAL = /borderRadius:\s*(?:\d|["'`](?!\s*var\())|boxShadow:\s*["'`](?!\s*(?:none|var\())/g;
/** Erzeugt die Datei Markup (JSX-Element, className oder Inline-Stil)? Reine Logik-/Stilquellen sind nicht „sichtbar“. */
const RE_SICHTBAR = /<[a-z][a-z0-9]*[\s>/]|className=|style=\{/;

/** Formkennzahlen einer Datei. `traeger`: Namen der Formträger-Bausteine; gezählt nur, wenn die Datei sie importiert. */
export function formKennzahlen(text, overlayKlassen = [], traeger = []) {
  const fk = new Set(formKlassen(overlayKlassen));
  const importiert = new Set();
  for (const m of String(text).matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const n of m[1].split(",")) importiert.add(n.trim().split(/\s+as\s+/).pop().trim());
  }
  const tr = new Set(traeger.filter((n) => importiert.has(n)));
  const code = ohneKommentare(String(text));
  return {
    sichtbar: RE_SICHTBAR.test(code),
    formDirekt: klassenWoerter(text).filter((w) => fk.has(w)).length,
    formBaustein: [...String(text).matchAll(/<([A-Z]\w*)\b/g)].filter((m) => tr.has(m[1])).length,
    formLiterale: zaehle(code, RE_FORM_LITERAL),
  };
}

/** Formstufe (Rangfolge): V4-Baustein, Overlay direkt, Overlay über Baustein, Token direkt, ohne V4-Form, nicht sichtbar. */
export function formStufe(k) {
  if (k.v4Baustein > 0) return "V4-Baustein";
  if (k.formDirekt > 0) return "Overlay direkt";
  if (k.formBaustein > 0) return "Overlay über Baustein";
  if (k.tokenVar > 0) return "Token direkt";
  return k.sichtbar ? "ohne V4-Form" : "nicht sichtbar";
}
/** Farbstufe: Literale (rgb/Hex im Code), V4 (Tokens, Palette C oder Bausteine), geerbt (sichtbar, aber ohne eigene
 *  Farbangabe: erbt Text- und Grundfarbe der V4-Schale), ohne Farbe (kein Markup). */
export function farbStufe(k) {
  if (k.gruppe === "V4") return "Quelle";
  if (k.rgb + k.hex > 0) return "Literale";
  if (k.tokens === "direkt" || k.tokens === "Palette" || k.tokens === "Bausteine") return "V4";
  return k.sichtbar ? "geerbt" : "ohne Farbe";
}
export const FORM_STUFEN = ["V4-Baustein", "Overlay direkt", "Overlay über Baustein", "Token direkt", "ohne V4-Form", "nicht sichtbar"];
const FORM_ERREICHT = new Set(FORM_STUFEN.slice(0, 4));
export const formErreicht = (stufe) => FORM_ERREICHT.has(stufe);

/**
 * Hauptansicht (Gliederung des Ist-Stands, Urteil): Einstieg, Speicherlage, Telefonschale und Import nach Datei,
 * sonst nach Familie. Rein für die Auswertung in docs/acc45/V4-IST-STAND-2026-11-20.md.
 */
export const HAUPTANSICHT_DATEIEN = {
  Einstieg: ["src/main.jsx", "src/startbild.jsx", "src/verlustweg.jsx", "src/betreiber-2fa.jsx", "src/rechtstexte.jsx",
    "src/marke.jsx", "src/ansichten/anmeldung.jsx", "src/ansichten/mailbestaetigung.jsx", "src/ansichten/ladefehler.jsx"],
  Telefonschale: ["src/ansichten/mobil.jsx"],
  Speicherlage: ["src/ansichten/speicherlage.jsx", "src/ansichten/teilkonflikt.jsx"],
  Import: ["src/ansichten/import.jsx", "src/ansichten/import-datei.jsx"],
  Selbsttest: ["src/pruefung.jsx", "src/ansichten/testablauf.jsx"],
};
export const HAUPTANSICHTEN = ["Einstieg", "Plan/Dienstplan", "Personal", "Zeit/Abrechnung", "Import",
  "Einstellungen/Verwaltung", "Telefonschale", "Speicherlage", "Lage/Dashboard", "Betreiberkonsole", "Branchenmodule",
  "Querschnitt/Bausteine", "Selbsttest"];
export function hauptansicht(e) {
  for (const [h, liste] of Object.entries(HAUPTANSICHT_DATEIEN)) if (liste.includes(e.datei)) return h;
  if (e.gruppe === "Branchenmodul") return "Branchenmodule";
  return {
    plan: "Plan/Dienstplan", standort: "Plan/Dienstplan", personal: "Personal", zeit: "Zeit/Abrechnung",
    auswertung: "Zeit/Abrechnung", einstellung: "Einstellungen/Verwaltung", pruefung: "Einstellungen/Verwaltung",
    lage: "Lage/Dashboard", betreiber: "Betreiberkonsole",
  }[e.familie] || "Querschnitt/Bausteine";
}

/** Quelltext ohne Block- und Zeilenkommentare (für Farbliterale: „#348“ in Kommentaren ist eine PR-Nummer, keine Farbe). */
export function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, "$1");
}

/** Kennzahlen eines Quelltexts. `overlayKlassen`: Klassen der V4-Oberflächenschicht (src/v4/app-stil.js). */
export function kennzahlen(text, overlayKlassen = []) {
  const ov = new Set(overlayKlassen);
  let klassenAttr = 0, overlay = 0;
  for (const m of text.matchAll(RE.klassenAttr)) {
    klassenAttr++;
    for (const k of m[1].replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (ov.has(k)) overlay++;
  }
  const backdrop = zaehle(text, RE.backdrop);
  const code = ohneKommentare(text);
  return {
    zeilen: text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
    rgb: zaehle(code, RE.rgb),
    hex: zaehle(code, RE.hex),
    tokenVar: zaehle(text, RE.tokenVar),
    v4Import: RE.v4Import.test(text),
    v4Baustein: zaehle(text, RE.v4Baustein),
    palette: RE.palette.test(text),
    bausteinImport: RE.bausteinImport.test(text),
    inlineStil: zaehle(text, RE.inlineStil),
    klassenAttr,
    overlay,
    backdrop,
    backdropOhneRueckfall: backdrop > 0 && !RE.rueckfall.test(text) ? backdrop : 0,
    aria: zaehle(text, RE.aria),
    rolle: zaehle(text, RE.rolle),
    dialog: zaehle(text, RE.dialog),
    zustand: zaehle(text, RE.zustand),
  };
}

/** Token-Nutzung als Stufe: direkt (var(--v4-…) oder Import aus src/v4), Palette C (aus Tokens abgeleitet), nur über Bausteine, keine. */
export function tokenStufe(k) {
  if (k.tokenVar > 0 || k.v4Import) return "direkt";
  if (k.palette) return "Palette";
  if (k.bausteinImport) return "Bausteine";
  return "keine";
}

/** Grobe Aufwandsklasse (Schätzung): Zeilen plus Farbliterale, Inline-Stile und Dialogstellen. */
export const PT_JE_KLASSE = { S: 0.1, M: 0.25, L: 0.5, XL: 1 };
export function aufwandsklasse(k) {
  const last = k.zeilen + 10 * (k.rgb + k.hex) + 2 * k.inlineStil + 20 * k.dialog;
  if (last < 300) return "S";
  if (last < 900) return "M";
  if (last < 2500) return "L";
  return "XL";
}

/* ------------------------------------------------------------- Dateien */
function dateienIn(dir, muster, rekursiv) {
  const voll = join(WURZEL, dir);
  if (!existsSync(voll)) return [];
  const raus = [];
  for (const e of readdirSync(voll, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (rekursiv) raus.push(...dateienIn(rel, muster, rekursiv)); }
    else if (muster.test(e.name)) raus.push(rel);
  }
  return raus;
}

export function dateiliste() {
  const alle = [];
  for (const o of ORTE) for (const d of dateienIn(o.dir, o.muster, o.rekursiv)) alle.push({ datei: d, gruppe: o.gruppe });
  return alle.sort((a, b) => (a.datei < b.datei ? -1 : a.datei > b.datei ? 1 : 0));
}

const lies = (rel) => readFileSync(join(WURZEL, rel), "utf8").replace(/\r\n/g, "\n");

function importAufloesen(von, ziel) {
  const p = relative(WURZEL, resolve(WURZEL, dirname(von), ziel)).replace(/\\/g, "/");
  for (const kand of [p, `${p}.jsx`, `${p}.js`]) if (existsSync(join(WURZEL, kand))) return kand;
  return null;
}

/* ------------------------------------------------- Navigation und Rollen */
const SUITE_ROLLEN = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"];
const ROLLEN_ORDNUNG = ["betreiber", ...SUITE_ROLLEN.flatMap((r) => [r, `${r}+Paket`]), "mitarbeiter (Telefon)", "alle", "vor Anmeldung"];
/** Eindeutig und in fester Reihenfolge; „x“ neben „x+Paket“ macht den Paketvermerk überflüssig. */
export function ordneRollen(liste) {
  const s = new Set(liste);
  for (const r of SUITE_ROLLEN) if (s.has(r)) s.delete(`${r}+Paket`);
  const rang = (r) => (ROLLEN_ORDNUNG.indexOf(r) < 0 ? 999 : ROLLEN_ORDNUNG.indexOf(r));
  return [...s].sort((a, b) => rang(a) - rang(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Ansicht → Komponente aus App.jsx (`aktiveView === "id" && <Komp`), Komponente → Datei aus den Importen. */
export function ansichtenAusApp(appText) {
  const komp = new Map();
  for (const m of appText.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](\.\/[^"']+)["']/g)) {
    const datei = importAufloesen("src/App.jsx", m[2]);
    for (const n of m[1].split(",")) {
      const name = n.trim().split(/\s+as\s+/).pop().trim();
      if (name && datei) komp.set(name, datei);
    }
  }
  for (const m of appText.matchAll(/import\s+([A-Z][A-Za-z0-9]*)\s+from\s*["'](\.\/[^"']+)["']/g)) {
    const datei = importAufloesen("src/App.jsx", m[2]);
    if (datei) komp.set(m[1], datei);
  }
  const ansichten = [];
  const dateiVon = (name) => komp.get(name) || (new RegExp(`\\nfunction ${name}\\(`).test(appText) ? "src/App.jsx" : null);
  for (const m of appText.matchAll(/aktiveView === "([a-z0-9]+)" &&/g)) {
    /* Ausdruck bis zum nächsten Ansichtszweig; Rahmen aus ui/ und gestalt/ (H1, Card) zählen nicht als Ansicht. */
    const rest = appText.slice(m.index + m[0].length, m.index + 1200);
    const fenster = rest.split(/aktiveView === "/)[0];
    const tag = [...fenster.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((t) => t[1])
      .find((n) => !QUERSCHNITT_ORT.test(dateiVon(n) || ""));
    if (!tag) continue;
    const datei = dateiVon(tag);
    if (!ansichten.some((a) => a.id === m[1] && a.datei === datei)) ansichten.push({ id: m[1], komponente: tag, datei });
  }
  return ansichten;
}

async function rollenJeAnsicht() {
  const nav = await import(pathToFileURL(join(WURZEL, "src/app/navigation.js")).href);
  const { MATRIX_STD } = await import(pathToFileURL(join(WURZEL, "src/lib/rollen.js")).href);
  const label = new Map(), rollen = new Map();
  for (const [id, name] of nav.NAV_BETREIBER) { label.set(id, name); rollen.set(id, ["betreiber"]); }
  for (const [id, name, recht] of nav.NAV_KUNDE) {
    label.set(id, name);
    let r = recht, paket = false;
    if (r && r.startsWith("PAKET:")) { paket = true; r = r.slice(6).split("|")[1] || null; }
    const erlaubt = SUITE_ROLLEN.filter((rolle) => nav.ansichtErlaubt({
      rolle, person: { rolle, imSchichtdienst: true, bereich: "ALLE" }, mandant: { matrix: MATRIX_STD },
    }, r));
    rollen.set(id, paket ? erlaubt.map((x) => `${x}+Paket`) : erlaubt);
  }
  return { label, rollen };
}

/** Beschriftungen, die die Browserproben ansteuern (axe-Suite, WP-40-Browserskript). */
function probenBeschriftungen() {
  const axe = new Set(), wp40 = new Set();
  const rollenMuster = /"(?:leitung|planer|subplaner|mitarbeiter|betriebsrat)",\s*"([^"]+)"/g;
  for (const f of ["e2e/barrierefreiheit.spec.mjs", "e2e/weitere-flaechen.mjs"]) {
    if (existsSync(join(WURZEL, f))) for (const m of lies(f).matchAll(rollenMuster)) axe.add(m[1]);
  }
  const abnahmeB = existsSync(join(WURZEL, "e2e/abnahme-b-flaechen.mjs"))
    ? [...lies("e2e/abnahme-b-flaechen.mjs").matchAll(/:\s*"(abnahme-b-[^"]+)"/g)].map((m) => m[1]) : [];
  const f = "pruefungen/browser/wcag-wp40.mjs";
  if (existsSync(join(WURZEL, f))) {
    const t = lies(f), a = t.indexOf("const ANSICHTEN = {"), z = t.indexOf("};", a);
    if (a >= 0) for (const m of t.slice(a, z).matchAll(/"([^"]+)"/g)) wp40.add(m[1]);
  }
  return { axe, wp40, abnahmeB };
}

const TESTS = {
  "v4-tokens": "pruefungen/v4-tokens.test.js",
  "v4-app-stil": "pruefungen/v4-app-stil.test.js",
  kontrast: "pruefungen/kontrast.test.js",
  "wcag-wp40": "pruefungen/wcag-wp40.test.js",
};

/* -------------------------------------------------------------- Inventar */
export async function inventar() {
  const { V4_APP_KLASSEN } = await import(pathToFileURL(join(WURZEL, "src/v4/app-stil.js")).href);
  const liste = dateiliste();
  const texte = new Map(liste.map((d) => [d.datei, lies(d.datei)]));
  const testTexte = Object.fromEntries(Object.entries(TESTS).map(([k, p]) => [k, existsSync(join(WURZEL, p)) ? lies(p) : ""]));
  const fk = formKlassen(V4_APP_KLASSEN);
  const traeger = [...new Set(TRAEGER_DATEIEN.filter((d) => existsSync(join(WURZEL, d)))
    .flatMap((d) => formTraegerIn(texte.get(d) ?? lies(d), fk)))].sort();
  const appAnsichten = ansichtenAusApp(texte.get("src/App.jsx") || "");
  const { label, rollen } = await rollenJeAnsicht();
  const proben = probenBeschriftungen();

  /* Importgraph über alle Quelldateien unter src/ (auch nicht inventarisierte wie src/module/index.js) */
  const quellen = dateienIn("src", /\.(jsx|js|mjs)$/, true).sort();
  const importiertVon = new Map(quellen.map((d) => [d, []]));
  for (const datei of quellen) {
    const text = texte.get(datei) ?? lies(datei);
    const ziele = new Set();
    for (const m of text.matchAll(RE.importe)) {
      const z = importAufloesen(datei, m[1]);
      if (z && importiertVon.has(z) && z !== datei) ziele.add(z);
    }
    for (const z of ziele) importiertVon.get(z).push(datei);
  }

  const routen = new Map();
  for (const a of appAnsichten) if (a.datei) {
    if (!routen.has(a.datei)) routen.set(a.datei, []);
    if (!routen.get(a.datei).includes(a.id)) routen.get(a.datei).push(a.id);
  }

  const direkteRollen = (datei) => {
    if (datei === "src/ansichten/mobil.jsx") return ["mitarbeiter (Telefon)"];
    const ids = routen.get(datei) || [];
    return [...new Set(ids.flatMap((id) => rollen.get(id) || []))];
  };
  /** Rollen über die einbindenden Ansichten (Breitensuche, ohne Schale App.jsx, ohne Bausteine). */
  const geerbteRollen = (datei) => {
    const gesehen = new Set([datei]), r = new Set();
    let rand = [datei];
    while (rand.length) {
      const neu = [];
      for (const d of rand) for (const p of importiertVon.get(d) || []) {
        if (gesehen.has(p) || p === "src/App.jsx" || QUERSCHNITT_ORT.test(p)) continue;
        gesehen.add(p);
        const dr = direkteRollen(p);
        if (dr.length) dr.forEach((x) => r.add(x)); else neu.push(p);
      }
      rand = neu;
    }
    return [...r];
  };

  const eintraege = liste.map(({ datei, gruppe }) => {
    const text = texte.get(datei);
    const k = kennzahlen(text, V4_APP_KLASSEN);
    const tokens = gruppe === "V4" ? "Quelle" : tokenStufe(k);
    const zu = ZUORDNUNG[datei] || (QUERSCHNITT_ORT.test(datei) ? ["querschnitt", null] : ["offen", null]);
    const ids = routen.get(datei) || [];
    let rollenSicht, rollenArt;
    if (QUERSCHNITT_ORT.test(datei)) { rollenSicht = []; rollenArt = "Querschnitt"; }
    else if (datei === "src/main.jsx") { rollenSicht = ["vor Anmeldung"]; rollenArt = "Einstieg"; }
    else if (datei === "src/App.jsx") { rollenSicht = ["alle"]; rollenArt = "Schale"; }
    else if (direkteRollen(datei).length) { rollenSicht = direkteRollen(datei); rollenArt = "Navigation"; }
    else {
      const g = geerbteRollen(datei);
      if (g.length) { rollenSicht = g; rollenArt = "geerbt"; }
      else {
        const von = importiertVon.get(datei) || [];
        rollenSicht = [];
        rollenArt = von.length === 0 ? "nicht importiert"
          : von.includes("src/App.jsx") ? "Schale/Dialog"
            : von.includes("src/module/index.js") ? "Branchenmodul"
              : "offen";
      }
    }
    rollenSicht = ordneRollen(rollenSicht);
    const labels = ids.map((id) => label.get(id)).filter(Boolean);
    const base = datei.split("/").pop().replace(/\.jsx?$/, "");
    const axe = labels.some((l) => proben.axe.has(l))
      || (datei === "src/ansichten/mobil.jsx" && proben.axe.has("Mein Plan"))
      || (base.length >= 6 && proben.abnahmeB.some((n) => n.includes(base)));
    const wp40Browser = labels.some((l) => proben.wp40.has(l))
      || (datei === "src/ansichten/mobil.jsx" && proben.wp40.has("Mein Plan"));
    const pfad = datei.replace(/\.jsx?$/, "");
    const tests = Object.keys(TESTS).filter((t) => testTexte[t].includes(pfad.replace(/^src\//, "src/")) || testTexte[t].includes(`../${pfad}`));
    if (axe) tests.push("e2e-flaechen/axe");
    if (wp40Browser) tests.push("wp40-browser");
    const klasse = aufwandsklasse(k);
    const f = formKennzahlen(text, V4_APP_KLASSEN, traeger);
    const eintrag = {
      datei, gruppe, familie: zu[0], zweck: zu[1], ansichten: ids, beschriftung: labels,
      rollen: rollenSicht, rollenArt, faninAnzahl: (importiertVon.get(datei) || []).length,
      ...k, tokens, tests, aufwand: klasse, pt: PT_JE_KLASSE[klasse],
      ...f,
    };
    eintrag.form = gruppe === "V4" ? "Quelle" : formStufe(eintrag);
    eintrag.farbe = farbStufe(eintrag);
    eintrag.hauptansicht = hauptansicht(eintrag);
    return eintrag;
  });
  return { eintraege, appAnsichten, navAnzahl: label.size, formTraeger: traeger };
}

/* --------------------------------------------------------- Zusammenfassen */
export function zusammenfassung(inv) {
  const e = inv.eintraege;
  const n = e.length;
  const summe = (f) => e.reduce((s, x) => s + f(x), 0);
  const anzahl = (f) => e.filter(f).length;
  const jeFamilie = {};
  for (const fam of Object.keys(FAMILIEN)) jeFamilie[fam] = anzahl((x) => x.familie === fam);
  const jeGruppe = {};
  for (const x of e) jeGruppe[x.gruppe] = (jeGruppe[x.gruppe] || 0) + 1;
  const tokens = {};
  for (const s of ["Quelle", "direkt", "Palette", "Bausteine", "keine"]) tokens[s] = anzahl((x) => x.tokens === s);
  const ptSumme = Math.round(summe((x) => x.pt) * 100) / 100;
  return {
    dateien: n,
    zeilen: summe((x) => x.zeilen),
    jeGruppe,
    jeFamilie,
    ohneFamilie: e.filter((x) => !ZUORDNUNG[x.datei]).map((x) => x.datei),
    navigationseintraege: inv.navAnzahl,
    gerouteteAnsichten: inv.appAnsichten.length,
    tokens,
    mitV4Baustein: anzahl((x) => x.v4Baustein > 0),
    v4BausteinStellen: summe((x) => x.v4Baustein),
    v4BausteinStellenAusserhalbV4: summe((x) => (x.gruppe === "V4" ? 0 : x.v4Baustein)),
    mitRgb: anzahl((x) => x.rgb > 0), rgb: summe((x) => x.rgb),
    mitHex: anzahl((x) => x.hex > 0), hex: summe((x) => x.hex),
    farbrein: anzahl((x) => x.rgb === 0 && x.hex === 0),
    mitOverlay: anzahl((x) => x.overlay > 0), overlayStellen: summe((x) => x.overlay),
    inlineStil: summe((x) => x.inlineStil), mitInlineStil: anzahl((x) => x.inlineStil > 0),
    mitBackdropOhneRueckfall: e.filter((x) => x.backdropOhneRueckfall > 0).map((x) => `${x.datei} (${x.backdropOhneRueckfall})`),
    mitAria: anzahl((x) => x.aria + x.rolle > 0),
    dialogStellen: summe((x) => x.dialog), mitDialog: anzahl((x) => x.dialog > 0),
    zustandStellen: summe((x) => x.zustand), mitZustand: anzahl((x) => x.zustand > 0),
    mitAxe: anzahl((x) => x.tests.includes("e2e-flaechen/axe")),
    mitWp40Browser: anzahl((x) => x.tests.includes("wp40-browser")),
    mitTestbezug: anzahl((x) => x.tests.length > 0),
    rollenArt: e.reduce((o, x) => ({ ...o, [x.rollenArt]: (o[x.rollenArt] || 0) + 1 }), {}),
    aufwand: e.reduce((o, x) => ({ ...o, [x.aufwand]: (o[x.aufwand] || 0) + 1 }), {}),
    ptSumme,
    /* Nenner für Anteile: alle erfassten Dateien außer src/v4 (die V4-Quelle zählt nicht als „migriert“). */
    ohneV4: (() => {
      const o = e.filter((x) => x.gruppe !== "V4");
      const z = (f) => o.filter(f).length;
      return {
        dateien: o.length,
        mitV4Baustein: z((x) => x.v4Baustein > 0),
        tokenDirekt: z((x) => x.tokens === "direkt"),
        tokenPaletteOderDirekt: z((x) => x.tokens === "direkt" || x.tokens === "Palette"),
        farbrein: z((x) => x.rgb === 0 && x.hex === 0),
        rgb: o.reduce((s, x) => s + x.rgb, 0),
        hex: o.reduce((s, x) => s + x.hex, 0),
        mitOverlay: z((x) => x.overlay > 0),
        ohneBackdropLuecke: z((x) => x.backdropOhneRueckfall === 0),
        mitAxe: z((x) => x.tests.includes("e2e-flaechen/axe")),
        mitTestbezug: z((x) => x.tests.length > 0),
        /* Formebene und sichtbarer Nenner (V4-IST 2026-11-20) */
        sichtbar: z((x) => x.sichtbar),
        form: Object.fromEntries(FORM_STUFEN.map((s) => [s, z((x) => x.form === s)])),
        formErreicht: z((x) => formErreicht(x.form)),
        formLiterale: o.reduce((s, x) => s + x.formLiterale, 0),
        mitFormLiteralen: z((x) => x.formLiterale > 0),
        farbe: Object.fromEntries(["V4", "geerbt", "Literale", "ohne Farbe"].map((s) => [s, z((x) => x.farbe === s)])),
        sichtbarFarbrein: z((x) => x.sichtbar && x.rgb + x.hex === 0),
        sichtbarVoll: z((x) => x.sichtbar && formErreicht(x.form) && x.rgb + x.hex === 0 && x.formLiterale === 0),
      };
    })(),
    jeHauptansicht: jeHauptansicht(inv),
  };
}

/** Kennzahlen je Hauptansicht (ohne src/v4). */
export function jeHauptansicht(inv) {
  const raus = {};
  for (const h of HAUPTANSICHTEN) {
    const e = inv.eintraege.filter((x) => x.gruppe !== "V4" && x.hauptansicht === h);
    const s = e.filter((x) => x.sichtbar);
    raus[h] = {
      dateien: e.length, sichtbar: s.length, zeilen: e.reduce((a, x) => a + x.zeilen, 0),
      formErreicht: s.filter((x) => formErreicht(x.form)).length,
      overlayDirekt: s.filter((x) => x.form === "Overlay direkt").length,
      ueberBaustein: s.filter((x) => x.form === "Overlay über Baustein").length,
      tokenDirekt: s.filter((x) => x.form === "Token direkt").length,
      ohneForm: s.filter((x) => x.form === "ohne V4-Form").map((x) => x.datei),
      farbrein: s.filter((x) => x.rgb + x.hex === 0).length,
      farbLiterale: e.reduce((a, x) => a + x.rgb + x.hex, 0),
      formLiterale: e.reduce((a, x) => a + x.formLiterale, 0),
      inlineStil: e.reduce((a, x) => a + x.inlineStil, 0),
      dialog: e.reduce((a, x) => a + x.dialog, 0),
      zustand: e.reduce((a, x) => a + x.zustand, 0),
      axe: e.filter((x) => x.tests.includes("e2e-flaechen/axe")).length,
      wp40: e.filter((x) => x.tests.includes("wp40-browser")).length,
      voll: s.filter((x) => formErreicht(x.form) && x.rgb + x.hex === 0 && x.formLiterale === 0).length,
    };
  }
  return raus;
}

/** Tabelle je Hauptansicht für docs/acc45/V4-IST-STAND-2026-11-20.md. */
export function hauptansichtenMarkdown(inv) {
  const h = jeHauptansicht(inv);
  const z = ["| Hauptansicht | Dateien (sichtbar) | Zeilen | Form erreicht | davon direkt / Baustein / Token | Farbrein | Farbliterale | Form-Literale | Inline-Stile | Dialog | Zustand | axe | WP-40 | voll V4 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for (const [name, x] of Object.entries(h)) {
    z.push(`| ${name} | ${x.dateien} (${x.sichtbar}) | ${x.zeilen} | ${x.formErreicht}/${x.sichtbar} | ${x.overlayDirekt} / ${x.ueberBaustein} / ${x.tokenDirekt} | ${x.farbrein}/${x.sichtbar} | ${x.farbLiterale} | ${x.formLiterale} | ${x.inlineStil} | ${x.dialog} | ${x.zustand} | ${x.axe} | ${x.wp40} | ${x.voll}/${x.sichtbar} |`);
  }
  return z.join("\n");
}

/* -------------------------------------------------------------- Ausgabe */
const zelle = (v) => String(v).replace(/\|/g, "\\|");
export function alsMarkdown(inv) {
  const z = zusammenfassung(inv);
  const zeilen = [];
  zeilen.push(`Dateien: ${z.dateien}, Zeilen: ${z.zeilen}, geroutete Ansichten in App.jsx: ${z.gerouteteAnsichten}, Navigationseinträge: ${z.navigationseintraege}`);
  zeilen.push("");
  const fams = [...Object.keys(FAMILIEN)];
  for (const fam of fams) {
    const e = inv.eintraege.filter((x) => x.familie === fam);
    if (fam === "offen" && !e.length) continue;
    zeilen.push(`### ${FAMILIEN[fam]} (${e.length})`, "");
    if (!e.length) { zeilen.push("Keine Datei im App-Repository.", ""); continue; }
    zeilen.push("| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |");
    zeilen.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const x of e) {
      const rollen = x.rollen.length ? `${x.rollen.join(", ")} (${x.rollenArt})` : x.rollenArt;
      zeilen.push(`| ${zelle(x.datei.replace(/^src\//, ""))} | ${zelle(x.zweck || "–")} | ${zelle(rollen)} | ${x.tokens} | ${x.v4Baustein} | ${x.rgb}/${x.hex} | ${x.overlay} | ${x.inlineStil} | ${x.backdropOhneRueckfall} | ${x.aria}+${x.rolle} | ${x.dialog} | ${x.zustand} | ${x.tests.join(", ") || "–"} | ${x.aufwand} |`);
    }
    zeilen.push("");
  }
  return zeilen.join("\n");
}

/** Dateinamen aus den Tabellen des Inventardokuments (Pfade relativ zu src/). */
export function dokumentDateien(text) {
  return [...String(text).matchAll(/^\| ((?:ansichten|module|ui|gestalt|v4)\/[^ |]+|[A-Za-z0-9-]+\.jsx) \|/gm)].map((m) => `src/${m[1]}`);
}

/**
 * Strenge Befunde für V4-Wellen und Koordinator (im Test nur Warnung):
 * Dateien ohne ZUORDNUNG und im Dokument genannte, aber verschwundene Dateien.
 */
export function strengeBefunde(inv, dokText, gibtEs = (d) => existsSync(join(WURZEL, d))) {
  return {
    ohneZuordnung: inv.eintraege.filter((x) => !ZUORDNUNG[x.datei]).map((x) => x.datei),
    verschwundenImDokument: dokumentDateien(dokText).filter((d) => !gibtEs(d)),
  };
}
export const strengerAusgang = (b) => (b.ohneZuordnung.length || b.verschwundenImDokument.length ? 1 : 0);

async function hauptprogramm(argv) {
  const inv = await inventar();
  if (argv.includes("--streng")) {
    const pfad = join(WURZEL, "docs/acc45/V4-INVENTAR.md");
    const b = strengeBefunde(inv, existsSync(pfad) ? readFileSync(pfad, "utf8") : "");
    console.log(JSON.stringify(b, null, 1));
    process.exitCode = strengerAusgang(b);
    return;
  }
  if (argv.includes("--json")) { console.log(JSON.stringify({ zusammenfassung: zusammenfassung(inv), ...inv }, null, 1)); return; }
  if (argv.includes("--markdown")) { console.log(alsMarkdown(inv)); return; }
  if (argv.includes("--hauptansichten")) {
    console.log(hauptansichtenMarkdown(inv));
    for (const [n, x] of Object.entries(jeHauptansicht(inv))) if (x.ohneForm.length) console.log(`ohne V4-Form – ${n}: ${x.ohneForm.join(", ")}`);
    return;
  }
  console.log(JSON.stringify(zusammenfassung(inv), null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hauptprogramm(process.argv.slice(2)).catch((f) => { console.error(f); process.exit(1); });
}
