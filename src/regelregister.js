/* ==========================================================================
   REGELREGISTER — Metadaten zu den Regeln, die CENTRIC prüft

   Das ist keine zweite Regelmaschine. Die Prüfungen selbst stehen weiter in
   src/regelwerk.js und in der Planprüfung (App.jsx); neue Regeln laufen im
   Regelbaukasten (src/regelbaukasten.js). Hier steht nur, was zu jeder Regel
   gesagt werden können muss:

     welche Regel?        id, Bezeichnung, Regelart
     woraus folgt sie?    Ebene, Quelle, Fundstelle
     seit wann, bis wann? gueltigAb, gueltigBis
     wie sicher ist das?  Prüfstatus, geprüft am, Prüfhinweis
     in welchem Stand?    Regelstand
     für wen?             Geltungsbereich (Branche, Land, Beschäftigungsmodell)
     mit welchen Zahlen?  Parameter

   REGELSTAND (regelwerk.js) bleibt die Gesamtfassung der Prüfung. Eine
   einzelne Regel gehört zu einem Regelstand, wenn ihr Feld `regelstand` ihn
   nennt und ihr Prüfstatus sie zulässt.

   ---------------------------------------------------------------------------
   Prüfstatus

   verified         geprüft anhand einer belastbaren Quelle
   legacy_verified  Teil des bisherigen, geprüften Regelwerks. Die Metadaten
                    sind nachgezogen; das Verhalten ändert sich dadurch nicht
   provisional      Rechercheergebnis, noch nicht verifiziert. Wirkt höchstens
                    als Hinweis, nie als Achtung oder Rechtsverstoß
   watchlist        noch nicht geltendes oder noch unklares Recht. Wirkt nie
   deprecated       abgelöst. Wirkt nie, bleibt aber lesbar, damit ältere
                    Entscheidungen erklärbar bleiben

   Unbekannte Prüfstatus wirken nicht: Im Zweifel gilt eine Regel lieber
   nicht, als dass sie mit falscher Autorität spricht.

   ---------------------------------------------------------------------------
   Bewertung und Folge sind zwei Dinge

   Bewertung  Hinweis, Achtung, Rechtsverstoß — die Stufen aus E-19
              (src/warnstufen.js), keine neuen Begriffe.
   Folge      was danach geschieht: keine, Bestätigung, Nachweis, Berechnung,
              Bericht, Freigabe. Eine Regel kann hoch bewerten und nur
              berichten, oder niedrig bewerten und einen Nachweis verlangen.

   Dieses Modul importiert nichts aus der Oberfläche und nichts aus dem
   Server. Es ist reine Daten- und Hilfsfunktionen-Schicht.
   ========================================================================== */
import { REGELSTAND, HOECHST_TAG, DURCHSCHNITT_TAG, AUSGLEICH_WOCHEN, NACHT_TAGE_SCHWELLE,
  VORSORGE_MONATE, VORSORGE_MONATE_AB_50, FREIE_SONNTAGE_MIN, ERSATZ_TAGE_SONNTAG,
  ERSATZ_TAGE_FEIERTAG } from "./regelwerk.js";
import { stufeRang, RUHEZEIT_GESETZ } from "./warnstufen.js";
import { GRENZEN as FAHR_GRENZEN } from "./fahrzeit.js";
import { MINDESTERFUELLUNG as PPP_MINDEST } from "./ppprl.js";
import { TARIFWERKE } from "./tarifwerke.js";

/** Prüfstatus und was er der Regel erlaubt. wirkung: "voll" | "hinweis" | "keine". */
export const PRUEFSTATUS = {
  verified: { label: "geprüft", wirkung: "voll" },
  legacy_verified: { label: "Bestand, geprüft", wirkung: "voll" },
  provisional: { label: "vorläufig", wirkung: "hinweis" },
  watchlist: { label: "beobachtet", wirkung: "keine" },
  deprecated: { label: "abgelöst", wirkung: "keine" },
};

/** Regelarten. Die ersten vier rechnet der Regelbaukasten heute; die übrigen sind geplant (PLAN, 5.2). */
export const REGELARTEN = {
  zaehlregel: "Zählregel",
  grenzregel: "Grenzregel",
  besetzungsregel: "Besetzungsregel",
  paarregel: "Paarregel",
  musterregel: "Musterregel",
  blockregel: "Blockregel",
  verteilungsregel: "Verteilungsregel",
  wunschregel: "Wunschregel",
  /* Prüfungen im Bestand, die sich nicht als Zahlenregel ausdrücken lassen:
     Datenkonflikte, Berechtigung, Nachweis. Sie bleiben, wo sie sind. */
  bestandsregel: "Bestandsprüfung",
};

/** Folgen. „keine" heißt: nur anzeigen. */
export const FOLGEN = ["keine", "bestaetigung", "nachweis", "berechnung", "bericht", "freigabe"];

const OHNE_SCOPE = { branche: null, bundesland: null, beschaeftigungsmodell: null };

/* Gemeinsame Felder der Bestandsregeln: geprüft nach dem Stand, den
   REGELSTAND beschreibt. Nichts davon ist neu beurteilt worden. */
const BESTAND = {
  gueltigAb: null, gueltigBis: null,
  pruefstatus: "legacy_verified",
  geprueftAm: REGELSTAND.stand,
  regelstand: REGELSTAND.version,
  scope: OHNE_SCOPE,
  hoechsteStufe: null,   // Die Stufe bestimmt bei Bestandsregeln weiter die Prüfung selbst.
  folge: null,
};

/* --------------------------------------------------------------------------
   BESTAND

   Je Eintrag: `art` ist der Schlüssel, unter dem die Planprüfung den Befund
   führt; `anzeige` ist die Zeile, die die Prüfansicht unter dem Befund zeigt
   (vorher die Tabelle RECHTSQUELLE in App.jsx — Wortlaut unverändert).

   Wo `quelle` fehlt, ist die Regel eine betriebliche Festlegung. Das steht
   dann auch so in `anzeige`: Sonst behauptet die Anwendung ein Gesetz, das
   es nicht gibt.
   -------------------------------------------------------------------------- */
const bestand = (e) => ({ ...BESTAND, ...e });

const REGELN_BESTAND = [
  bestand({ id: "AZ-RUHE-01", art: "ruhezeit", typ: "grenzregel", bezeichnung: "Tägliche Ruhezeit",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 5 Abs. 1",
    parameter: { mindestRuhezeitStunden: RUHEZEIT_GESETZ },
    anzeige: { norm: "§ 5 Abs. 1 ArbZG",
      satz: "Nach Beendigung der Arbeitszeit eine ununterbrochene Ruhezeit von mindestens elf Stunden." } }),
  bestand({ id: "AZ-PAUSE-01", art: "pause", typ: "grenzregel", bezeichnung: "Ruhepausen",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 4",
    anzeige: { norm: "§ 4 ArbZG",
      satz: "Ruhepausen von mindestens 30 Minuten bei mehr als sechs, 45 Minuten bei mehr als neun Stunden." } }),
  bestand({ id: "AZ-TAG-01", art: "tagesgrenze", typ: "grenzregel", bezeichnung: "Werktägliche Höchstarbeitszeit",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 3 Satz 1 und 2",
    parameter: { regelStunden: DURCHSCHNITT_TAG, hoechstStunden: HOECHST_TAG },
    anzeige: { norm: "§ 3 Satz 1 und 2 ArbZG",
      satz: "Die werktägliche Arbeitszeit darf acht Stunden nicht überschreiten; auf zehn Stunden nur bei Ausgleich." } }),
  bestand({ id: "AZ-AUSGLEICH-01", art: "ausgleich", typ: "zaehlregel", bezeichnung: "Ausgleichszeitraum",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 3 Satz 2",
    parameter: { fensterWochen: AUSGLEICH_WOCHEN, durchschnittStunden: DURCHSCHNITT_TAG },
    anzeige: { norm: "§ 3 Satz 2 ArbZG",
      satz: "Zehn Stunden werktäglich nur, wenn im Durchschnitt von 24 Wochen acht Stunden nicht überschritten werden." } }),
  bestand({ id: "AZ-SONNTAG-01", art: "sonntagsfrei", typ: "zaehlregel", bezeichnung: "Beschäftigungsfreie Sonntage",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 11 Abs. 1",
    parameter: { mindestFreieSonntageJahr: FREIE_SONNTAGE_MIN },
    anzeige: { norm: "§ 11 Abs. 1 ArbZG",
      satz: "Mindestens fünfzehn Sonntage im Jahr müssen beschäftigungsfrei bleiben." } }),
  bestand({ id: "AZ-ERSATZRUHE-01", art: "ersatzruhe", typ: "musterregel", bezeichnung: "Ersatzruhetag",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 11 Abs. 3",
    parameter: { tageSonntag: ERSATZ_TAGE_SONNTAG, tageFeiertag: ERSATZ_TAGE_FEIERTAG },
    anzeige: { norm: "§ 11 Abs. 3 ArbZG",
      satz: "Für Sonntagsarbeit ist ein Ersatzruhetag innerhalb von zwei Wochen zu gewähren, für Feiertagsarbeit an einem Werktag innerhalb von acht Wochen." } }),
  bestand({ id: "AZ-VORSORGE-01", art: "vorsorge", typ: "zaehlregel", bezeichnung: "Arbeitsmedizinische Untersuchung bei Nachtarbeit",
    ebene: "bund", quelle: "ArbZG", fundstelle: "§ 6 Abs. 3",
    parameter: { nachttageSchwelle: NACHT_TAGE_SCHWELLE, intervallMonate: VORSORGE_MONATE, intervallMonateAb50: VORSORGE_MONATE_AB_50 },
    anzeige: { norm: "§ 6 Abs. 3 ArbZG",
      satz: "Nachtarbeitnehmer haben das Recht, sich arbeitsmedizinisch untersuchen zu lassen — regelmäßig nach höchstens drei Jahren, nach dem fünfzigsten Lebensjahr jährlich." } }),
  /* Die Zahl zulässiger Dienste in Folge steht in keinem Gesetz. Sie kommt
     aus dem Tarifvertrag, der Betriebsvereinbarung oder der eigenen
     Festlegung — hier ist sie eine betriebliche Grenze, und das muss dabei
     stehen. Die gesetzliche Anknüpfung nebenan ist echt, aber eine andere
     Frage. */
  bestand({ id: "AZ-FOLGE-01", art: "folge", typ: "musterregel", bezeichnung: "Dienste in Folge (betrieblich)",
    ebene: "betrieb", quelle: null, fundstelle: null,
    anzeige: { norm: "Betriebliche Grenze", betrieblich: true,
      satz: "Das Arbeitszeitgesetz begrenzt die Dienstfolge nicht unmittelbar. Gesetzlich gebunden ist der Sonntag: § 11 Abs. 1 ArbZG verlangt mindestens 15 beschäftigungsfreie Sonntage im Jahr." } }),
  bestand({ id: "AZ-NACHTFOLGE-01", art: "nachtfolge", typ: "musterregel", bezeichnung: "Nächte in Folge (betrieblich)",
    ebene: "betrieb", quelle: null, fundstelle: null,
    anzeige: { norm: "Betriebliche Grenze", betrieblich: true,
      satz: "Anknüpfung ist § 6 Abs. 1 ArbZG: Die Arbeitszeit der Nachtarbeitnehmer ist nach gesicherten arbeitswissenschaftlichen Erkenntnissen festzulegen. Die Zahl selbst legt der Betrieb fest." } }),
  bestand({ id: "PLAN-ABWESEND-01", art: "abwesend", typ: "bestandsregel", bezeichnung: "Abwesende stehen nicht zur Verfügung",
    ebene: "bund", quelle: "EFZG, BUrlG", fundstelle: "§ 3 EFZG; § 7 BUrlG",
    anzeige: { norm: "§ 3 EFZG, § 7 BUrlG",
      satz: "Wer arbeitsunfähig oder im Urlaub ist, steht für einen Dienst nicht zur Verfügung." } }),
  bestand({ id: "URLAUB-UEBERLAPPUNG-01", art: "ueberlappung", typ: "bestandsregel", bezeichnung: "Urlaub und andere Abwesenheit überschneiden sich",
    ebene: "bund", quelle: "BUrlG", fundstelle: "§ 7",
    anzeige: { norm: "§ 7 BUrlG",
      satz: "Ein Zeitraum kann nicht zugleich Urlaub und eine andere Abwesenheit sein." } }),
  bestand({ id: "URLAUB-WUNSCH-01", art: "urlaub", typ: "wunschregel", bezeichnung: "Urlaubswünsche",
    ebene: "bund", quelle: "BUrlG", fundstelle: "§ 7 Abs. 1",
    anzeige: { norm: "§ 7 Abs. 1 BUrlG",
      satz: "Urlaubswünsche sind zu berücksichtigen, soweit keine dringenden betrieblichen Belange entgegenstehen." } }),
  bestand({ id: "URLAUB-GRENZE-01", art: "urlaubsgrenze", typ: "grenzregel", bezeichnung: "Gleichzeitiger Urlaub (betrieblich)",
    ebene: "betrieb", quelle: null, fundstelle: null,
    anzeige: { norm: "Betriebliche Grenze", betrieblich: true,
      satz: "Wie viele gleichzeitig Urlaub haben dürfen, legt der Betrieb fest." } }),
  bestand({ id: "URLAUB-HINWEIS-01", art: null, typ: "bestandsregel", bezeichnung: "Hinweis auf drohenden Urlaubsverfall",
    ebene: "bund", quelle: "BUrlG", fundstelle: "§ 7 Abs. 3",
    parameter: { rechtsprechung: ["EuGH C-684/16", "BAG 9 AZR 541/15"] } }),
  bestand({ id: "NACHWEIS-UNTERWEISUNG-01", art: "nachweis", typ: "bestandsregel", bezeichnung: "Nachweise und Unterweisung",
    ebene: "bund", quelle: "ArbSchG", fundstelle: "§ 12",
    anzeige: { norm: "§ 12 ArbSchG",
      satz: "Beschäftigte sind vor Aufnahme der Tätigkeit ausreichend zu unterweisen; Nachweise sind zu erneuern." } }),
  /* Hier stand: „Bewachungstätigkeit setzt den Sachkundenachweis voraus."
     Das stimmt so nicht — § 34a Abs. 1a GewO verlangt die Sachkunde nur für
     bestimmte Tätigkeiten, für die übrigen genügt die Unterrichtung. Die
     Zeile greift nur noch, wenn die Qualifikation gar keine Grundlage
     nennt — und sagt dann genau das. */
  bestand({ id: "QUAL-SPERRE-01", art: "sperre", typ: "bestandsregel", bezeichnung: "Qualifikation ohne hinterlegte Grundlage",
    ebene: "betrieb", quelle: null, fundstelle: null,
    anzeige: { norm: "Keine Grundlage hinterlegt", betrieblich: true,
      satz: "Zu dieser Anforderung ist keine Rechtsgrundlage erfasst. Worauf sie sich stützt, steht unter Betrieb → Qualifikationen." } }),
  bestand({ id: "QUAL-GEFAEHRDUNG-01", art: "qualifikation", typ: "bestandsregel", bezeichnung: "Einsatz nach Gefährdungsbeurteilung",
    ebene: "bund", quelle: "ArbSchG", fundstelle: "§ 5",
    anzeige: { norm: "§ 5 ArbSchG",
      satz: "Der Arbeitgeber hat die Gefährdungen zu beurteilen und den Einsatz danach auszurichten." } }),
  bestand({ id: "KOMP-EINWEISUNG-01", art: "kompetenz", typ: "bestandsregel", bezeichnung: "Einweisung je Gerät oder Anlage",
    ebene: "bund", quelle: "MPBetreibV, BetrSichV", fundstelle: "§ 4 MPBetreibV; § 12 BetrSichV" }),
  bestand({ id: "BES-FACHKRAFT-01", art: "fachkraft", typ: "besetzungsregel", bezeichnung: "Fachkraftquote",
    ebene: "land", quelle: "Landesheimpersonalverordnung", fundstelle: null,
    anzeige: { norm: "Landesheimpersonalverordnung",
      satz: "Die Fachkraftquote richtet sich nach Landesrecht und ist je Bundesland verschieden; der hinterlegte Wert ist die betriebliche Vorgabe." } }),
  bestand({ id: "BES-MINDEST-01", art: "besetzung", typ: "besetzungsregel", bezeichnung: "Mindestbesetzung (betrieblich)",
    ebene: "betrieb", quelle: null, fundstelle: null,
    anzeige: { norm: "Betriebliche Grenze", betrieblich: true,
      satz: "Die Mindestbesetzung legt der Betrieb fest. Bleibt sie dauerhaft unerreicht, ist das nach § 5 ArbSchG als Gefährdung zu beurteilen." } }),
  bestand({ id: "PFLBG-AUFGABE-01", art: "aufgabe", typ: "besetzungsregel", bezeichnung: "Vorbehaltene Tätigkeiten je Schicht",
    ebene: "bund", quelle: "PflBG", fundstelle: "§ 4 Abs. 2" }),
  bestand({ id: "PPUGV-01", art: null, typ: "besetzungsregel", bezeichnung: "Pflegepersonaluntergrenzen",
    ebene: "bund", quelle: "PpUGV", fundstelle: "Fassung vom 09.11.2020" }),
  bestand({ id: "PLAN-EINSCHR-01", art: "einschraenkung", typ: "bestandsregel", bezeichnung: "Vereinbarte Einsatzbeschränkungen",
    ebene: "bund", quelle: "SGB IX, SGB V", fundstelle: "§ 164 Abs. 4 SGB IX; § 74 SGB V",
    anzeige: { norm: "§ 164 Abs. 4 SGB IX, § 74 SGB V",
      satz: "Vereinbarte Einsatzbeschränkungen und Wiedereingliederungspläne sind bindend." } }),
  bestand({ id: "KONF-REGELSATZ-01", art: "regelsatz", typ: "bestandsregel", bezeichnung: "Prüfung der hinterlegten Regel selbst",
    ebene: "betrieb", quelle: null, fundstelle: null,
    anzeige: { norm: "Konfiguration", betrieblich: true,
      satz: "Geprüft wird hier nicht der Plan, sondern die hinterlegte Regel — worauf sie sich stützt und wofür sie gilt." } }),
  /* Schutzvorschriften: schutzBefunde() in regelwerk.js liefert die
     Fundstelle je Befund selbst mit (Feld `regel`). `regeltext` ist genau
     diese Zeichenkette — damit lässt sich ein Befund seiner Regel zuordnen,
     ohne regelwerk.js anzufassen. */
  bestand({ id: "JARBSCHG-14", art: null, regeltext: "JArbSchG § 14", typ: "bestandsregel", bezeichnung: "Jugendliche: Nachtruhe",
    ebene: "bund", quelle: "JArbSchG", fundstelle: "§ 14" }),
  bestand({ id: "JARBSCHG-08", art: null, regeltext: "JArbSchG § 8", typ: "grenzregel", bezeichnung: "Jugendliche: tägliche Höchstarbeitszeit",
    ebene: "bund", quelle: "JArbSchG", fundstelle: "§ 8" }),
  bestand({ id: "JARBSCHG-16", art: null, regeltext: "JArbSchG §§ 16–17", typ: "bestandsregel", bezeichnung: "Jugendliche: Samstag und Sonntag",
    ebene: "bund", quelle: "JArbSchG", fundstelle: "§§ 16–17" }),
  bestand({ id: "MUSCHG-05", art: null, regeltext: "MuSchG § 5", typ: "bestandsregel", bezeichnung: "Mutterschutz: Nachtarbeit",
    ebene: "bund", quelle: "MuSchG", fundstelle: "§ 5" }),
  bestand({ id: "MUSCHG-06", art: null, regeltext: "MuSchG § 6", typ: "bestandsregel", bezeichnung: "Mutterschutz: Sonntagsarbeit",
    ebene: "bund", quelle: "MuSchG", fundstelle: "§ 6" }),
  bestand({ id: "SGBIX-207-01", art: null, regeltext: "SGB IX § 207", typ: "grenzregel", bezeichnung: "Schwerbehinderung: Mehrarbeit",
    ebene: "bund", quelle: "SGB IX", fundstelle: "§ 207" }),
];

/* --------------------------------------------------------------------------
   NEU, NOCH NICHT VERIFIZIERT

   Alles hier stammt aus der Rechtsrecherche vom Oktober 2026 und ist
   `provisional`: Es kann einen Hinweis erzeugen, niemals eine Achtung oder
   einen Rechtsverstoß, und es gehört zu keinem Regelstand. Jeder Eintrag
   sagt in `pruefhinweis`, was vor der Freigabe zu klären ist.

   Zurückgestellt und bewusst nicht hier: ein Aufzugswärter je Schicht (TRBS
   3121 verlangt Hilfeleistung in angemessener Zeit, keine Dauerpräsenz) und
   eine Sachkundepflicht „in jeder Öffnungsminute" (§ 50 AMG, vor einer
   Regel gesondert zu klären).
   -------------------------------------------------------------------------- */
const vorlaeufig = (e) => ({
  gueltigAb: null, gueltigBis: null, pruefstatus: "provisional", geprueftAm: null,
  regelstand: null, art: null, folge: null, ...e,
  scope: { ...OHNE_SCOPE, ...(e.scope || {}) },
});

const REGELN_VORLAEUFIG = [
  /* Neu (Oktober 2026): fehlendes Geburtsdatum bei einem Dienst, den Jugendliche nicht leisten dürften.
     Ein Hinweis „nicht bewertbar", kein Verstoß — deshalb vorläufig und nicht im Regelstand. */
  vorlaeufig({ id: "JARBSCHG-DATEN-01", regeltext: "JArbSchG (Geburtsdatum)", typ: "bestandsregel",
    bezeichnung: "Jugendschutz nicht bewertbar: Geburtsdatum fehlt", ebene: "bund", quelle: "JArbSchG", fundstelle: "§§ 8, 14",
    hoechsteStufe: "hinweis",
    pruefhinweis: "Verhalten festgelegt, Wortlaut und Umfang der Meldung (nur bei Diensten, die Jugendliche nicht leisten dürfen) mit der Praxis abstimmen." }),
  vorlaeufig({ id: "BESCH-WERKSTUDENT-01", typ: "grenzregel",
    bezeichnung: "Werkstudent: Wochenarbeitszeit in der Vorlesungszeit",
    ebene: "bund", quelle: "SGB V", fundstelle: "§ 6 Abs. 1 Nr. 3", hoechsteStufe: "achtung",
    scope: { beschaeftigungsmodell: ["werkstudent"] },
    parameter: { groesse: "wochenstunden", hoechstens: 20 },
    pruefhinweis: "20-Stunden-Grenze und ihre Ausnahmen (Abend, Nacht, Wochenende, Semesterferien) anhand der Grundsätzlichen Hinweise des GKV-Spitzenverbandes prüfen." }),
  vorlaeufig({ id: "BESCH-WERKSTUDENT-02", typ: "zaehlregel",
    bezeichnung: "Werkstudent: Wochen über 20 Stunden in zwölf Monaten",
    ebene: "bund", quelle: "SGB V", fundstelle: "§ 6 Abs. 1 Nr. 3", hoechsteStufe: "achtung",
    scope: { beschaeftigungsmodell: ["werkstudent"] },
    parameter: { ereignis: "woche_ueber_grenze", fenster: { art: "rollierend", einheit: "monate", laenge: 12 },
      richtung: "hoechstens", grenze: 26 },
    pruefhinweis: "26-Wochen-Grenze und ihre Zählung (Zeitjahr, nur Wochen mit zulässiger Ausnahme) prüfen." }),
  vorlaeufig({ id: "BESCH-KURZFRISTIG-01", typ: "zaehlregel",
    bezeichnung: "Kurzfristige Beschäftigung: Arbeitstage im Kalenderjahr",
    ebene: "bund", quelle: "SGB IV", fundstelle: "§ 8 Abs. 1 Nr. 2", hoechsteStufe: "achtung",
    scope: { beschaeftigungsmodell: ["kurzfristig"] },
    parameter: { ereignis: "arbeitstag", fenster: { art: "kalenderjahr" }, richtung: "hoechstens", grenze: 70 },
    pruefhinweis: "70-Arbeitstage-Grenze gilt bei Fünftagewoche; Zeitgrenze von drei Monaten und Berufsmäßigkeit mitprüfen." }),
  /* Der Wert ist ein Richtwert: ASR A2.2 nennt „in der Regel" fünf Prozent,
     und der Bedarf folgt aus der Gefährdungsbeurteilung. Eine starre
     Mindestquote je Schicht ist das nicht. */
  vorlaeufig({ id: "QUOTE-BRANDSCHUTZ-01", typ: "besetzungsregel",
    bezeichnung: "Brandschutzhelfer: Richtwert je Schicht",
    ebene: "betrieb", quelle: "ASR A2.2", fundstelle: "Abschnitt 7.3", hoechsteStufe: "hinweis",
    parameter: { richtwert: true,
      anforderungen: [{ art: "quoteMit", merkmal: "brandschutzhelfer", min: 0.05 }] },
    pruefhinweis: "Fünf Prozent sind ein Richtwert, kein Gesetz. Höhe nach Gefährdungsbeurteilung, Betriebsart und Abwesenheiten je Standort festlegen." }),
  vorlaeufig({ id: "KOPPLUNG-EUP-EFK-01", typ: "paarregel",
    bezeichnung: "Elektrotechnisch unterwiesene Person nur mit Elektrofachkraft",
    ebene: "betrieb", quelle: "DGUV Vorschrift 3, DIN VDE 1000-10", fundstelle: null, hoechsteStufe: "achtung",
    parameter: { wenn: "elektrotechnisch_unterwiesen", dann: "elektrofachkraft", min: 1 },
    pruefhinweis: "Verbindlichkeit (Unfallverhütungsvorschrift, Norm, Betriebsanweisung) und Anwesenheit versus Aufsicht klären." }),
];

/* --------------------------------------------------------------------------
   Fahrzeit, PPP-RL und Tarifvorlagen — nur die Zuordnung

   Diese drei rechnen in eigenen Modulen (fahrzeit.js, ppprl.js,
   tarifwerke.js) und tun es weiter dort. Das Register führt nur, woher ihre
   Werte stammen, damit ein Befund oder eine Vorlage eine stabile Kennung und
   Quelle hat. Die Zahlen werden nicht noch einmal eingetragen: Die Parameter
   verweisen auf die Konstanten der Module.

   Sie gehören (noch) nicht zu REGELSTAND.quellen und sind deshalb als
   „provisional" geführt: nicht im Regelstand 2026.09 geprüft, bis jemand sie
   dort aufnimmt. Das ändert nichts an ihrer Berechnung — die Begrenzung des
   Registers greift nur dort, wo ein Befund durch das Register bewertet wird.
   -------------------------------------------------------------------------- */
/** Die Module, die ihre Regeln selbst rechnen. Nur auf sie darf laufzeit "bestand" verweisen. */
export const RECHENMODULE = ["fahrzeit.js", "ppprl.js", "tarifwerke.js"];

const modul = (e) => vorlaeufig({ laufzeit: "bestand", ...e });

const REGELN_MODULE = [
  modul({ id: "FAHRZEIT-LENK-01", typ: "bestandsregel", bezeichnung: "Lenkzeit (Tag, Woche, Doppelwoche)",
    ebene: "bund", quelle: "VO (EG) 561/2006", fundstelle: "Art. 6", hoechsteStufe: null,
    parameter: { modul: "fahrzeit.js", grenzen: { tag: FAHR_GRENZEN.tagLenkzeit, woche: FAHR_GRENZEN.wocheLenkzeit, doppelwoche: FAHR_GRENZEN.doppelwocheLenkzeit } },
    pruefhinweis: "Fassung VO (EU) 2020/1054 und FPersV laut Modulkopf; im Regelstand noch nicht aufgeführt. Anwendungsbereich je Fahrzeug trägt der Betrieb." }),
  modul({ id: "FAHRZEIT-PAUSE-01", typ: "bestandsregel", bezeichnung: "Unterbrechung nach Lenkblock",
    ebene: "bund", quelle: "VO (EG) 561/2006", fundstelle: "Art. 7", hoechsteStufe: null,
    parameter: { modul: "fahrzeit.js", lenkblockMinuten: FAHR_GRENZEN.lenkblockOhnePause, unterbrechungMinuten: FAHR_GRENZEN.unterbrechung },
    pruefhinweis: "Wie FAHRZEIT-LENK-01." }),
  modul({ id: "FAHRZEIT-RUHE-01", typ: "bestandsregel", bezeichnung: "Tägliche und wöchentliche Ruhezeit (Fahrpersonal)",
    ebene: "bund", quelle: "VO (EG) 561/2006", fundstelle: "Art. 8", hoechsteStufe: null,
    parameter: { modul: "fahrzeit.js", tagesruheMinuten: FAHR_GRENZEN.tagesruhe, wochenruheMinuten: FAHR_GRENZEN.wochenruhe },
    pruefhinweis: "Wie FAHRZEIT-LENK-01." }),
  modul({ id: "PPPRL-01", typ: "bestandsregel", bezeichnung: "Personalausstattung Psychiatrie und Psychosomatik (PPP-RL)",
    ebene: "bund", quelle: "PPP-RL (Gemeinsamer Bundesausschuss)", fundstelle: null, hoechsteStufe: null,
    parameter: { modul: "ppprl.js", mindesterfuellung: PPP_MINDEST },
    pruefhinweis: "Die hinterlegten Richtwerte sind Ausgangswerte, keine Gesetzeswerte; die Einrichtung überschreibt sie. Fassung und Gültigkeit je Satz stehen in ppprl.js. Im Regelstand nicht aufgeführt." }),
  /* Eine Zeile je Tarifvorlage, aus TARIFWERKE abgeleitet — keine zweite Liste. */
  ...TARIFWERKE.map((t) => modul({
    id: `TARIF-${String(t.id).toUpperCase()}-01`, typ: "bestandsregel", bezeichnung: `Tarifvorlage ${t.kurz || t.name}`,
    ebene: "tarif", quelle: t.grundlage, fundstelle: null, hoechsteStufe: null,
    scope: { branche: t.branchen && t.branchen.length ? t.branchen : null },
    parameter: { modul: "tarifwerke.js", vorlage: t.id, stand: t.stand, link: t.quelle },
    pruefhinweis: `Vorlage überschreibt Betriebseinstellungen mit Fundstelle und Stand (${t.stand}); CENTRIC rechnet keine Löhne. Tarifwerte vor Verwendung gegen den aktuellen Tarifabschluss prüfen.` })),
];

/** Alle Regeln. Die Reihenfolge ist die der Anzeige und der Prüfung. */
export const REGELN = [...REGELN_BESTAND, ...REGELN_VORLAEUFIG, ...REGELN_MODULE];

/* --------------------------------------------------------------------------
   Nachschlagen
   -------------------------------------------------------------------------- */
const NACH_ID = new Map(REGELN.map((r) => [r.id, r]));
const NACH_ART = new Map(REGELN.filter((r) => r.art).map((r) => [r.art, r]));
const NACH_TEXT = new Map(REGELN.filter((r) => r.regeltext).map((r) => [r.regeltext, r]));

/** Die Regel zu einer Kennung, oder null. */
export const regel = (id) => NACH_ID.get(id) || null;

/** Die Regel zu dem Schlüssel, unter dem die Planprüfung einen Befund führt. */
export const regelFuerArt = (art) => NACH_ART.get(art) || null;
export const regelIdFuerArt = (art) => (NACH_ART.get(art) || {}).id || null;

/** Die Regel zu einem Schutzbefund — `regel` aus schutzBefunde(), z. B. „MuSchG § 5". */
export const regelIdFuerSchutz = (text) => (NACH_TEXT.get(String(text || "").trim()) || {}).id || null;

/**
 * Die Regelkennung zu einem Befund der Planprüfung (Feld `art`) oder einem
 * Befund der Einteilungsprüfung. Schutzbefunde tragen ihre Regel im Titel
 * („MuSchG § 5 — …").
 */
export function regelIdFuerBefund(b) {
  if (!b) return null;
  if (b.regelId) return b.regelId;
  if (b.art === "schutz")
    return regelIdFuerSchutz(String(b.titel || "").split(" — ")[0]) || regelIdFuerSchutz(b.quelle);
  return regelIdFuerArt(b.art);
}

/**
 * Die Tabelle, die die Prüfansicht unter einem Befund zeigt — früher
 * RECHTSQUELLE in App.jsx. Gleiche Schlüssel, gleicher Wortlaut.
 * @returns {Object<string, {norm: string, satz: string, betrieblich?: boolean}>}
 */
export function rechtsquelleTabelle() {
  const t = {};
  for (const r of REGELN) if (r.art && r.anzeige) t[r.art] = { ...r.anzeige };
  return t;
}

/* --------------------------------------------------------------------------
   Geltung, Wirkung, Stufe
   -------------------------------------------------------------------------- */

/**
 * Gilt die Regel an diesem Tag? Ohne Datum gilt nur, was keine Grenzen hat —
 * Unklares gilt im Zweifel nicht.
 */
export function gilt(r, datum) {
  if (!r) return false;
  const hatGrenze = !!(r.gueltigAb || r.gueltigBis);
  if (!datum) return !hatGrenze;
  if (r.gueltigAb && datum < r.gueltigAb) return false;
  if (r.gueltigBis && datum > r.gueltigBis) return false;
  return true;
}

/** „voll", „hinweis" oder „keine" — was der Prüfstatus der Regel erlaubt. Unbekanntes wirkt nicht. */
export function wirkung(r) {
  const s = r && PRUEFSTATUS[r.pruefstatus];
  return s ? s.wirkung : "keine";
}

/**
 * Begrenzt die Stufe eines Befunds auf das, was die Regel darf.
 *
 *   keine Wirkung (watchlist, deprecated, unbekannt)  → null, kein Befund
 *   provisional                                       → höchstens „hinweis"
 *                                                       (außer laufzeit "bestand": nicht herabgestuft)
 *   sonst                                             → höchstens die Regelgrenze,
 *                                                       sofern die Regel eine nennt
 *
 * Eine Regel, die nicht im Register steht, wird nicht angefasst: Das ist der
 * Weg der Bestandsprüfungen, die ihre Stufe selbst bestimmen.
 *
 * @param {object|string} regelOderId
 * @param {string|null} stufe "hinweis" | "achtung" | "recht"
 */
export function begrenzeStufe(regelOderId, stufe) {
  const r = typeof regelOderId === "string" ? regel(regelOderId) : regelOderId;
  if (!r) return stufe;
  const w = wirkung(r);
  if (w === "keine") return null;
  if (stufe == null) return stufe;
  /* Prüfstatus und Laufzeit sind zwei Fragen. „provisional" beschreibt, wie
     gut die QUELLE geprüft ist, und bremst neu eingeführte Regeln. Eine
     Regel, die ein getestetes Bestandsmodul schon rechnet (laufzeit
     "bestand": Fahrzeit, PPP-RL, Tarifvorlagen), wird dadurch nicht
     herabgestuft — ihre Stufe bestimmt weiter das Modul. */
  if (r.laufzeit === "bestand") return stufe;
  const grenze = w === "hinweis" ? "hinweis" : r.hoechsteStufe;
  if (!grenze) return stufe;
  return stufeRang(stufe) > stufeRang(grenze) ? grenze : stufe;
}

/**
 * Welche Regeln kommen für diesen Fall in Frage?
 * Nicht zugelassene Regeln (watchlist, deprecated) fehlen; vorläufige sind
 * dabei und tragen ihren Status.
 *
 * Ein Geltungsbereich ohne Angabe gilt für alle. Fehlt im Fall die Angabe,
 * zu der eine Regel einen Bereich nennt, passt sie nicht: Der Fall ist
 * dann nicht eindeutig, und die Regel soll nicht raten.
 */
export function regelnFuer({ datum, branche = null, bundesland = null, beschaeftigungsmodell = null } = {}, liste = REGELN) {
  const passt = (bereich, wert) => {
    if (bereich == null) return true;
    const l = Array.isArray(bereich) ? bereich : [bereich];
    return wert != null && l.includes(wert);
  };
  return liste.filter((r) => wirkung(r) !== "keine" && gilt(r, datum)
    && passt(r.scope && r.scope.branche, branche)
    && passt(r.scope && r.scope.bundesland, bundesland)
    && passt(r.scope && r.scope.beschaeftigungsmodell, beschaeftigungsmodell));
}

/**
 * Die Regeln, die zu einem Regelstand gehören: Sie nennen ihn und sind
 * zugelassen. Eine vorläufige Regel gehört zu keinem Regelstand.
 */
export function regelnImRegelstand(version = REGELSTAND.version, liste = REGELN) {
  return liste.filter((r) => r.regelstand === version && wirkung(r) === "voll");
}

/* --------------------------------------------------------------------------
   Selbstprüfung des Registers
   -------------------------------------------------------------------------- */
const ID_FORM = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}$/;

/**
 * Mängel im Register — nicht im Plan. Leere Liste heißt: stimmig.
 * @returns {string[]}
 */
export function pruefeRegister(liste = REGELN) {
  const m = [];
  const ids = new Set();
  const arten = new Set();
  for (const r of liste) {
    const wo = r && r.id ? r.id : "(ohne Kennung)";
    if (!r || !r.id || !ID_FORM.test(r.id)) { m.push(`${wo}: Kennung hat nicht die Form AZ-RUHE-01`); continue; }
    if (ids.has(r.id)) m.push(`${wo}: Kennung doppelt`);
    ids.add(r.id);
    if (r.art) { if (arten.has(r.art)) m.push(`${wo}: Befundart „${r.art}" doppelt`); arten.add(r.art); }
    if (!r.bezeichnung) m.push(`${wo}: Bezeichnung fehlt`);
    if (!REGELARTEN[r.typ]) m.push(`${wo}: Regelart „${r.typ}" unbekannt`);
    if (!PRUEFSTATUS[r.pruefstatus]) m.push(`${wo}: Prüfstatus „${r.pruefstatus}" unbekannt`);
    if (!["bund", "land", "tarif", "betrieb"].includes(r.ebene)) m.push(`${wo}: Ebene „${r.ebene}" unbekannt`);
    if (r.ebene !== "betrieb" && (!r.quelle)) m.push(`${wo}: Quelle fehlt (Ebene ${r.ebene})`);
    if (r.hoechsteStufe && !["hinweis", "achtung", "recht"].includes(r.hoechsteStufe))
      m.push(`${wo}: Stufe „${r.hoechsteStufe}" unbekannt`);
    if (r.folge && !FOLGEN.includes(r.folge)) m.push(`${wo}: Folge „${r.folge}" unbekannt`);
    if (r.gueltigAb && r.gueltigBis && r.gueltigBis < r.gueltigAb) m.push(`${wo}: gueltigBis liegt vor gueltigAb`);
    if (r.pruefstatus === "provisional") {
      if (!r.pruefhinweis) m.push(`${wo}: vorläufige Regel ohne Prüfhinweis`);
      if (r.regelstand) m.push(`${wo}: vorläufige Regel darf zu keinem Regelstand gehören`);
    }
    /* laufzeit "bestand" nimmt eine Regel von der Bremse für Vorläufiges aus. Das
       darf nur, wer auf ein bekanntes, getestetes Rechenmodul verweist — sonst
       ließe sich jede neue ungeprüfte Regel damit am Hinweis-Deckel vorbeischleusen. */
    if (r.laufzeit !== undefined && r.laufzeit !== null && r.laufzeit !== "bestand")
      m.push(`${wo}: laufzeit „${r.laufzeit}" unbekannt`);
    if (r.laufzeit === "bestand" && (r.typ !== "bestandsregel" || !r.parameter || !RECHENMODULE.includes(r.parameter.modul)))
      m.push(`${wo}: laufzeit "bestand" verlangt Regelart bestandsregel und ein bekanntes Rechenmodul (${RECHENMODULE.join(", ")})`);
    if (wirkung(r) === "voll" && r.pruefstatus === "legacy_verified" && r.regelstand !== REGELSTAND.version)
      m.push(`${wo}: Bestandsregel gehört nicht zum aktuellen Regelstand`);
    if (["zaehlregel", "grenzregel", "besetzungsregel", "paarregel"].includes(r.typ) && r.pruefstatus !== "legacy_verified") {
      if (!r.parameter) m.push(`${wo}: Parameter fehlen`);
      if (!r.hoechsteStufe) m.push(`${wo}: höchste Stufe fehlt`);
    }
  }
  return m;
}

/**
 * Welche Quellen nennt REGELSTAND, die im Register keine Regel haben, und
 * umgekehrt? Reine Auskunft über den Stand der Dokumentation, kein Fehler:
 * REGELSTAND.quellen ist der Umfang, zu dem sich die Anwendung bekennt, das
 * Register das, was sich einer Regel zuordnen lässt.
 *
 * Verglichen wird das Kürzel (erstes Wort der Quelle) — grob, aber ehrlich.
 */
export function regelstandAbdeckung(liste = REGELN) {
  /* „SGB IX" ist ein Gesetz, nicht „SGB". */
  const kuerzel = (s) => { const m = /^(SGB\s+[IVX]+|[^\s(,·]+)/.exec(String(s).trim()); return m ? m[1] : String(s); };
  const imRegister = new Set();
  for (const r of regelnImRegelstand(REGELSTAND.version, liste))
    for (const q of String(r.quelle || "").split(",")) if (q.trim()) imRegister.add(kuerzel(q.trim()));
  const imStand = new Set();
  for (const q of REGELSTAND.quellen)
    for (const teil of q.split("·")) if (teil.trim()) imStand.add(kuerzel(teil.trim()));
  return {
    ohneRegel: [...imStand].filter((k) => !imRegister.has(k)).sort(),
    ohneNennungImStand: [...imRegister].filter((k) => !imStand.has(k)).sort(),
  };
}
