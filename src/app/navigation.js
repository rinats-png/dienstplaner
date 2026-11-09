/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { kann } from "../lib/fachlogik.js";
import { darf } from "../lib/berechtigung.js";

/* Navigation der Anwendung (aus dem Abschnitt ANWENDUNG in src/App.jsx). */
export const SPEICHER = "schichtwerk:v5";
export const NAV_BETREIBER = [
  ["mandanten", "Mandanten"], ["selbststarts", "Selbststarts"], ["demos", "Demozugänge"],
  ["neu", "Neuer Mandant"], ["adressen", "Adressänderungen"],
  ["rechnungen", "Rechnungen"], ["tarife", "Tarife"], ["rechner", "Rechner"], ["pakete", "Pakete"],
  ["zweifaktor", "Zwei-Faktor"]];
/**
 * Navigation in sechs Bereichen statt neunzehn Einzelpunkten.
 * Jeder Bereich hat Unterreiter — die Kopfzeile bleibt lesbar, nichts ist versteckt.
 */
export const BEREICHE = [
  { id: "heute", label: "Im Dienst", views: [
    ["start", "Start", null],
    ["ablauf", "Ablauf", null],
    ["handbuch", "Handbuch", null],
    ["hilfe", "Hilfe", null],
    /* Übergaben, Dienstbuch und Belastbarkeit brauchen den vollständigen
       Betrieb. Beschäftigte und Betriebsrat bekommen ihn nicht (sicht.mjs) —
       die Ansichten wären für sie leer oder falsch gerechnet. */
    ["uebergabe", "Übergabe", "PAKET:uebergabe|plan.edit.unit"],
    ["meine", "Meine Schichten", "SCHICHT"],
    ["lage", "Lagebild", "plan.view.unit"],
    ["zeitachse", "Zeitachse", "plan.view.unit"],
  ]},
  { id: "planung", label: "Planen", views: [
    ["plan", "Monatsplan", "plan.view.all"],
    ["einsatz", "Personaleinsatz", "plan.view.unit"],
    ["jahr", "Jahresansicht", "plan.view.unit"],
    ["bereitschaft", "Bereitschaft", "plan.view.unit"],
    ["selbstplan", "Selbstplanung", "plan.edit.unit"],
    ["sonder", "Sondereinsätze", "OHNE_BR:plan.view.unit"],   // WP-27: Daten bekommt der Betriebsrat nicht — leer statt irreführend,
    ["folge", "Schichtfolge", "pattern.edit"],
  ]},
  { id: "anliegen", label: "Zu entscheiden", views: [
    ["notrufe", "Notrufe", "plan.view.unit"],
    ["offene", "Offene Schichten", null],
    ["antraege", "Anträge", "req.approve.unit"],
    ["boerse", "Tauschbörse", "req.create"],
    ["wuensche", "Wunschdienste", "SCHICHT"],
    ["aushang", "Schwarzes Brett", null],
    ["buch", "Dienstbuch", "plan.edit.unit"],
  ]},
  { id: "team", label: "Wer mitfährt", views: [
    ["personal", "Personal", "staff.view"],
    ["quals", "Qualifikationen", "staff.view"],
    ["nachweise", "Nachweise", "staff.view"],
    ["kompetenzen", "Kompetenzen", "staff.view"],
    ["einarbeitung", "Einarbeitung", "staff.view"],
    ["verteilung", "Verteilung", "staff.view"],
    ["mittel", "Betriebsmittel", "OHNE_BR:plan.view.unit"],
  ]},
  { id: "auswertung", label: "Nachsehen", views: [
    ["pruef", "Prüfung", "plan.view.all"],
    /* WP-27: Auswertung für den Betriebsrat — nur Aggregate (audit.view). */
    ["brauswertung", "Auswertung (Betriebsrat)", "BR:audit.view"],
    ["untergrenzen", "Untergrenzen", "plan.view.unit"],
    ["lenkzeiten", "Lenkzeiten", "OHNE_BR:plan.view.unit"],
    ["belastung", "Belastung", "plan.view.unit"],
    ["belastbarkeit", "Belastbarkeit", "plan.edit.unit"],
    ["planstand", "Planstand", "plan.view.unit"],
    /* WP-27: Ohne Übergaben (die der Betriebsrat nicht bekommt) wäre der Nachweis falsch — gesperrt. */
    ["nachweis", "Leistungsnachweis", "OHNE_BR:plan.view.unit"],
    ["abrechnung", "Abrechnungsdaten", "account.view.all"],
  ]},
  { id: "verwaltung", label: "Verwaltung", views: [
    ["betrieb", "Betrieb", "org.edit"],
    ["dienste", "Dienstarten", "org.edit"],
    ["einstellungen", "Einstellungen", null],
    ["mitnahme", "Datenmitnahme", "org.edit"],
    /* Die Datenschutzansicht gab es als Baustein seit langem — sie war nur
       nirgends eingehängt und damit für niemanden erreichbar. Aufgefallen
       beim Einbau des Löschlaufs: Die Tour verweist auf „Verwaltung →
       Datenschutz", und dort war nichts. */
    ["datenschutz", "Datenschutz", "org.edit"],
    /* Ohne Recht davor: Impressum und Datenschutzerklärung stehen jeder
       Rolle zu, auch der Aushilfe mit dem Mitarbeiterzugang. */
    ["rechtliches", "Rechtliches", null],
  ]},
];
export const NAV_KUNDE = BEREICHE.flatMap((b) => b.views);

/** Darf diese Sitzung die Ansicht öffnen? Die dritte Spalte in BEREICHE. */
export function ansichtErlaubt(sitz, recht) {
  /* WP-27: „BR:recht" nur für den Betriebsrat mit dem Recht; „OHNE_BR:recht"
     nicht für ihn — dort fehlen ihm die Daten, die Ansicht wäre falsch oder leer. */
  if (recht && recht.startsWith("BR:")) return sitz.person.rolle === "betriebsrat" && darf(sitz, recht.slice(3));
  if (recht && recht.startsWith("OHNE_BR:")) return sitz.person.rolle !== "betriebsrat" && darf(sitz, recht.slice(8));
  if (recht === "SCHICHT") return sitz.person.imSchichtdienst !== false;   // Geschäftszimmer fährt keine Schicht
  if (recht && recht.startsWith("PAKET:")) {
    const [paket, zusatz] = recht.slice(6).split("|");
    return kann(sitz.mandant, paket) && (!zusatz || darf(sitz, zusatz));
  }
  return !recht || darf(sitz, recht);
}


/**
 * Darf diese Sitzung die Urlaubshinweise anlegen? Der Lauf ändert fremde
 * Personen (`urlaubshinweis`) und legt Mitteilungen an — das darf nur, wem
 * der Server den vollen Schreibumfang meldet (`zugang.schreiben`, aus
 * GET /api/bestand: Leitung, Planung). Vorher genügte das Recht
 * req.approve.unit; damit lief der Lauf auch bei der Schichtverantwortung
 * (Schreibumfang „einheit"), und jede ihrer Anmeldungen endete mit
 * 403 „Keine Schreibberechtigung" — der Server lehnte zu Recht ab.
 */
export function urlaubshinweiseAnlegen(sitz, zugang) {
  if (!sitz || sitz.rolle === "betreiber" || !zugang || zugang.schreiben !== "voll") return false;
  return darf(sitz, "req.approve.unit") || darf(sitz, "org.edit");
}
