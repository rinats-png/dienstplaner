/* ==========================================================================
   HILFE-KORPUS (WP-I23, F9 Hilfe-Assistent) — GESCHLOSSEN

   Der Assistent antwortet NUR aus diesen Texten. Sie liegen im Repository,
   nicht in der Datenablage, und enthalten keine Betriebsdaten: keine Namen,
   keine Zahlen eines Betriebs, nichts, was ein Faktenpaket bräuchte. Wer einen
   Text ändert, ändert ihn hier und in der Prüfung (hilfe-assistent-i23.test.js).

   Jeder Text nennt ein RECHT aus der Rechtetabelle (server/lib/rechte.mjs,
   MATRIX) — kein neues Recht. Eine Rolle bekommt nur die Texte, deren Recht sie
   nach darf() hat; Planung-Texte erreichen Beschäftigte also nie, weder als
   Treffer noch über die Reihenfolge der Treffer (gefiltert wird VOR dem Suchen).

   `modell: false` markiert Texte, die ein Gesundheitsthema berühren (Krankmeldung):
   sie werden der Person gezeigt, gehen aber nie an ein Modell, und eine Frage,
   die auf sie trifft, wird nie an ein Modell gestellt.

   Quelle der Inhalte: src/handbuch-inhalt.js (Handbuch) und die Ansichten selbst,
   gekürzt auf das, was eine Person beim Arbeiten nachschlägt.
   ========================================================================== */

import { darf } from "../../rechte.mjs";

/** @typedef {{ id: string, titel: string, text: string, recht: string, schlagworte: string, modell: boolean }} Hilfetext */

/** @type {readonly Hilfetext[]} */
export const HILFE_KORPUS = Object.freeze([
  /* ------------------------------------------------------------ alle Rollen */
  { id: "h-mein-plan", titel: "Mein Plan: wann arbeite ich?", recht: "plan.view.own", modell: true,
    schlagworte: "dienstplan schichten schicht wann arbeite ich kommende dienste monat liste ansicht",
    text: "Deine kommenden Dienste stehen im Reiter „Mein Plan“, wahlweise als Liste oder als Monatsansicht. Der Dienst des heutigen Tages steht außerdem im Reiter „Heute“ ganz oben. Ist ein Monat noch nicht veröffentlicht, siehst du dort den Hinweis „Plan noch nicht veröffentlicht“." },
  { id: "h-standort-privat", titel: "Sieht die Leitung, wo ich bin?", recht: "plan.view.own", modell: true,
    schlagworte: "standort position ort gps datenschutz ueberwachung privatsphaere koordinate",
    text: "Nein. Ist die Standortprüfung beim Stempeln eingeschaltet, wird einmalig beim Stempeln geprüft, ob du am Standort bist. Gespeichert werden nur das Ergebnis, die Entfernung grob gerundet und die Genauigkeit der Messung. Eine Koordinate und ein Bewegungsverlauf werden nicht gespeichert. Ein auffälliges Ergebnis ist ein Anlass zur Rückfrage, kein Beweis." },
  { id: "h-hilfe-kontakt", titel: "Was nicht in der Hilfe steht", recht: "plan.view.own", modell: true,
    schlagworte: "kontakt support hilfe fragen stoerung fehler email mail problem handbuch",
    text: "Wenn die Hilfe eine Frage nicht beantwortet, öffne die Ansicht „Hilfe“. Dort steht das Handbuch, und dort findest du die Wege zu uns: Störung melden, Vorschlag senden, Fragen zu Vertrag oder Datenschutz. Betrieb, Rolle und Ansicht werden bei der E-Mail mitgeschickt, das spart die erste Rückfrage." },
  { id: "h-auswertung-protokoll", titel: "Änderungsprotokoll und Auswertungen lesen", recht: "audit.view", modell: true,
    schlagworte: "protokoll aenderungsprotokoll auswertung betriebsrat wer hat geaendert nachweis lesen",
    text: "Das Änderungsprotokoll hält fest, wer wann was geändert hat. Wer das Recht zur Einsicht hat, liest es unter den Auswertungen. Die Rolle Betriebsrat prüft und liest, sie ändert den Plan nicht und kann keine Einträge verändern." },

  /* -------------------------------------------- Beschäftigte und Antragsrechte */
  { id: "h-stempeln", titel: "Ein- und Ausstempeln", recht: "req.create", modell: true,
    schlagworte: "stempeln einstempeln ausstempeln kommen gehen zeit erfassen heute knopf pause dienstbeginn dienstende",
    text: "Im Reiter „Heute“ steht der Dienst des Tages mit einem großen Knopf zum Einstempeln und Ausstempeln. Gestempelt wird in dem Moment, in dem du den Knopf drückst; der Server hält die Zeit fest, nicht das Gerät. Ohne Netz wird der Stempel auf dem Gerät gemerkt und später nachgereicht. Wer vergessen hat zu stempeln, bittet Planung oder Leitung um eine Korrektur." },
  { id: "h-tausch", titel: "Einen Dienst tauschen", recht: "req.create", modell: true,
    schlagworte: "tausch tauschen tauschboerse dienst tauschen wechseln kollegen gesuch",
    text: "Öffne „Mein Plan“, tippe den Tag an und wähle „Tausch suchen“. Das Gesuch sehen alle. Der Stand deines Gesuchs steht unter „Anliegen“, auch die Tauschbörse findest du dort." },
  { id: "h-antrag-urlaub", titel: "Urlaub oder Freizeitausgleich beantragen", recht: "req.create", modell: true,
    schlagworte: "urlaub antrag beantragen freizeitausgleich wunsch frei abwesenheit anliegen genehmigt abgelehnt",
    text: "Anträge stellst du im Reiter „Anliegen“. Wähle die Art, den Zeitraum und bei Bedarf einen kurzen Grund. Über den Antrag entscheidet die zuständige Person; du bekommst eine Mitteilung. Den Urlaubsrest siehst du im Reiter „Mehr“ oben in den Kennzahlen." },
  { id: "h-krankmeldung-eigene", titel: "Sich krank melden", recht: "req.create", modell: false,
    schlagworte: "krank krankmeldung krankgemeldet ausfall nicht arbeiten kann melden anliegen",
    text: "Im Reiter „Anliegen“ gibt es die Krankmeldung. Trage den ersten und, wenn bekannt, den letzten Tag ein. Die Planung erhält eine Mitteilung und sucht Ersatz. Eine Meldung ist zunächst vorläufig; endgültig bestätigen sie Planung oder Leitung. Der Grund der Abwesenheit bleibt für Kolleginnen und Kollegen unsichtbar." },
  { id: "h-urlaubsrest-konto", titel: "Stundenkonto und Urlaubsrest ansehen", recht: "account.view.own", modell: true,
    schlagworte: "stundenkonto konto minus plus ueberstunden urlaubsrest urlaubstage verlauf saldo",
    text: "Das Stundenkonto steht im Reiter „Anliegen“ mit dem Verlauf über sechs Monate; so siehst du, warum es im Plus oder im Minus steht. Der Urlaubsrest steht im Reiter „Mehr“ oben in den Kennzahlen." },

  /* --------------------------------------------- Schichtverantwortung, Planung */
  { id: "h-antraege-entscheiden", titel: "Anträge entscheiden", recht: "req.approve.unit", modell: true,
    schlagworte: "antraege entscheiden genehmigen ablehnen urlaub tausch schulung kapazitaet tastatur",
    text: "Öffne „Anliegen“ und dann „Anträge“. Links steht die Liste, rechts die Kapazität der nächsten acht Wochen. Beim Markieren eines Antrags färben sich die betroffenen Wochen; rot heißt, dass diese Woche erst durch den Antrag kippt. Mit der Tastatur geht es schneller: J und K blättern, G genehmigt, A lehnt ab, die Leertaste wählt aus." },
  { id: "h-ersatz-luecke", titel: "Eine Lücke besetzen, Ersatz finden", recht: "plan.edit.unit", modell: true,
    schlagworte: "luecke besetzen ersatz einspringen unterbesetzt eingeteilt kann nicht ruhezeit qualifikation vorschlag warum",
    text: "Öffne das Lagebild oder tippe den Tag im Monatsplan an und wähle bei der unterbesetzten Dienstart „Besetzen“. Vorgeschlagen werden Personen nach Eignung; wer nicht kann, steht unten mit Grund: Ruhezeit, abwesend, Qualifikation fehlt oder abgelaufen, Einsatzeinschränkung. Der Knopf „warum?“ erklärt die Reihenfolge. Vor dem Eintragen zeigt CENTRIC die Folgen für Ruhezeit und Wochenstunden. Wer abwesend ist, kann nicht eingeteilt werden." },
  { id: "h-schicht-ausschreiben", titel: "Offene Schichten ausschreiben", recht: "plan.edit.unit", modell: true,
    schlagworte: "ausschreiben offene schichten luecke melden freiwillige anliegen unterrichtet einteilen",
    text: "Unter „Anliegen“ und „Offene Schichten“ stehen die Lücken der nächsten vierzehn Tage. Mit „Ausschreiben“ wird die Lücke sichtbar; vorher zeigt CENTRIC, wie viele Personen die Schicht übernehmen dürfen. Unterrichtet wird nur, wer sie nehmen darf. Die Meldungen sind nach Eignung geordnet, nicht nach Eingang; mit „Einteilen“ übernimmst du eine Meldung." },
  { id: "h-krankmeldung-erfassen", titel: "Eine Krankmeldung erfassen und Ersatz suchen", recht: "plan.edit.unit", modell: false,
    schlagworte: "krankmeldung krank erfassen ersatz suchen vorlaeufig ausfall luecken mitteilung",
    text: "Die Krankmeldung ist auf jeder Ansicht oben erreichbar: Person und Zeitraum wählen, CENTRIC zeigt die entstehenden Lücken. Je Lücke suchst du Ersatz; findet sich niemand, geht eine erweiterte Anfrage an mehrere Personen. Eine Meldung ist vorläufig, bis Planung oder Leitung sie endgültig bestätigt. Die Betroffenen bekommen eine Mitteilung." },
  { id: "h-gleichzeitig-gespeichert", titel: "Zwei Personen haben gleichzeitig gespeichert", recht: "plan.edit.unit", modell: true,
    schlagworte: "gleichzeitig speichern konflikt ueberschrieben hinweis andere person zeit stand",
    text: "CENTRIC überschreibt nicht stillschweigend. Es erscheint ein Hinweis mit Name und Zeit der anderen Speicherung, der fremde Stand bleibt erhalten, und du nimmst deine Änderung noch einmal vor." },

  /* ----------------------------------------------------------------- Planung */
  { id: "h-krankmeldung-endgueltig", titel: "Eine Krankmeldung endgültig bestätigen", recht: "plan.edit.all", modell: false,
    schlagworte: "krankmeldung endgueltig bestaetigen vorlaeufig abwesenheit eintragen",
    text: "Planung und Leitung bestätigen eine vorläufige Krankmeldung endgültig. Erst dann gilt die Abwesenheit als eingetragen. Ändern oder Entfernen einer Krank-Abwesenheit ist ebenfalls diesen beiden Rollen vorbehalten." },
  { id: "h-plan-pruefung", titel: "Die Prüfung lesen", recht: "plan.edit.all", modell: true,
    schlagworte: "pruefung befund befunde rot gelb ruhezeit unterbesetzung qualifikation arbeitszeitgesetz warnung",
    text: "Unter „Auswertung“ und „Prüfung“ prüft CENTRIC den Plan laufend gegen Arbeitszeitgesetz, Mindestbesetzung und Qualifikationen. Rote Befunde sind kritisch, etwa Ruhezeitverstoß, Unterbesetzung oder fehlende Pflichtqualifikation. Gelbe sind Hinweise, etwa ein hohes Stundenkonto. Jeder Befund nennt Person, Datum und Grund, ein Klick führt zum Tag. Gelbe Befunde müssen nicht verschwinden, rote sollten es vor der Freigabe." },
  { id: "h-plan-freigeben", titel: "Den Monatsplan freigeben", recht: "plan.publish", modell: true,
    schlagworte: "freigeben freigabe veroeffentlichen monatsplan verbindlich entwurf planstand benachrichtigung",
    text: "Unter „Planung“, „Monatsplan“ gibst du den Monat mit „Freigeben“ frei. Vorher ist alles Entwurf und niemand wird benachrichtigt, auch Beschäftigte sehen den Monat nicht. Danach ist der Monat verbindlich, und jede Änderung löst eine Mitteilung an die Betroffenen aus. Der Planstandvergleich zeigt, was sich seit der Freigabe geändert hat. Freigeben dürfen nur Planung und Leitung." },
  { id: "h-plan-falsch", titel: "Der Plan sieht falsch aus", recht: "plan.edit.all", modell: true,
    schlagworte: "plan falsch fehler schichtfolge versatz anker zyklus eintrittsdatum befunde hunderte ruhezeit zu streng",
    text: "Meist liegt es an einem von drei Dingen: Arbeiten zwei Gruppen gleichzeitig dieselbe Schicht, prüfe den Versatz unter „Schichtfolge“. Fängt der Zyklus am falschen Tag an, prüfe das Ankerdatum. Fehlen einzelne Personen, prüfe Eintrittsdatum und Einheitenzuordnung. Erscheinen auf einmal Hunderte Befunde, ist fast immer ein Wert zu streng gesetzt, etwa die Ruhezeit auf zwölf statt elf Stunden." },
  { id: "h-checklisten", titel: "Checklisten an Dienstarten", recht: "shift.edit", modell: true,
    schlagworte: "checkliste dienstart vorlage pflicht rundgang schluessel haken nachgetragen",
    text: "Unter „Verwaltung“, „Betrieb“, „Dienstarten“ öffnest du eine Dienstart und wählst „Vorlage übernehmen“. Je Punkt legst du den Zeitpunkt fest und ob er Pflicht ist. Beschäftigte sehen die Liste unter „Heute“, sobald sie im Dienst sind. Ein gesetzter Haken lässt sich nicht zurücknehmen; wer nachträglich abhakt, erzeugt einen Eintrag mit dem Vermerk „nachgetragen“." },
  { id: "h-personal-anlegen", titel: "Personal anlegen oder einlesen", recht: "staff.edit", modell: true,
    schlagworte: "personal anlegen person hinzufuegen importieren einlesen liste tabelle eintrittsdatum teilzeit wochenstunden",
    text: "Unter „Team“, „Personal“ gibt es zwei Wege. Mit „Importieren“ fügst du eine Tabelle ein, ordnest die Spalten zu und prüfst die Vorschau; fehlerhafte Zeilen werden benannt, nicht übersprungen, und erst „Übernehmen“ speichert. Mit „Person hinzufügen“ legst du eine Person einzeln an. Setze das Eintrittsdatum, davor erscheint die Person in keinem Plan, und bei Teilzeit die tatsächlichen Wochenstunden." },
  { id: "h-zeiten-lohn", titel: "Zeiten, Zuschläge und Lohnausgabe", recht: "staff.edit", modell: true,
    schlagworte: "zeiten zuschlaege lohn lohnausgabe csv abrechnungsdaten lohnart stunden monatsabschluss",
    text: "Beschäftigte bestätigen ihre Zeiten in der Telefonansicht, „wie geplant“ oder mit Abweichung. Unter „Auswertung“, „Abrechnungsdaten“ stehen die Zuschläge tagesgenau. Die Lohnausgabe erzeugt eine CSV-Datei mit Stunden je Person und Lohnart; sie ist kein amtliches Importformat, die Lohnartennummern stimmst du vorher mit der Lohnbuchhaltung ab. CENTRIC rechnet Stunden, keine Beträge." },
  { id: "h-belastbarkeit", titel: "Belastbarkeit des Plans", recht: "plan.edit.all", modell: true,
    schlagworte: "belastbarkeit ausfall szenario schwaechste schicht reserve auswertung",
    text: "Unter „Auswertung“, „Belastbarkeit“ steht je Woche und Dienst, wie viele gleichzeitige Ausfälle die schwächste Schicht verträgt. Null bedeutet, dass der nächste Krankheitsfall zur Unterbesetzung führt. Darunter stehen vier Ausfallszenarien von fünf bis dreißig Prozent. Öffne die Ansicht einmal pro Woche." },

  /* ----------------------------------------------------------------- Leitung */
  { id: "h-zugangsarten", titel: "Zugangsarten und Rollen vergeben", recht: "roles.assign", modell: true,
    schlagworte: "rolle rollen zugangsart zugang vergeben rechte leitung planung schichtverantwortung betriebsrat beschaeftigte",
    text: "In der Personalliste wählst du je Person die Zugangsart. Organisationsleitung darf alles und ist je Betrieb genau einmal vorhanden. Planung kümmert sich um Schichtfolge, Monatsplan, Freigabe und alle Anträge. Schichtverantwortung betrifft nur die eigene Einheit. Beschäftigte sehen den eigenen Plan, stellen Anträge und erfassen Zeiten. Der Betriebsrat liest nur. Im Zweifel vergibst du weniger Rechte; erweitern ist leicht, entziehen unangenehm." },
  { id: "h-betrieb-regeln", titel: "Standorte und Arbeitszeitregeln festlegen", recht: "org.edit", modell: true,
    schlagworte: "standort bundesland feiertag arbeitszeit ruhezeit wochenarbeitszeit dienste in folge ausgleich verwaltung betrieb",
    text: "Unter „Verwaltung“, „Betrieb“ legst du die Standorte mit eigenem Bundesland an; das bestimmt die Feiertage. Dazu stellst du die Arbeitszeitregeln ein: Wochenarbeitszeit, Ruhezeit zwischen zwei Diensten (gesetzlich elf Stunden), Höchstzahl Dienste in Folge und die Ausgleichsgrenze des Stundenkontos. Stimme diese Werte mit dem Betriebsrat ab. Die Standortprüfung beim Stempeln schaltet die Organisationsleitung ein; sie ist von Haus aus aus." },
  { id: "h-datenmitnahme-auskunft", titel: "Datenmitnahme, Auskunft und Löschung", recht: "org.edit", modell: true,
    schlagworte: "datenmitnahme export csv auskunft loeschung datenschutz dsgvo aufbewahrung anonymisieren artikel 15",
    text: "Unter „Verwaltung“, „Datenmitnahme“ erhältst du jederzeit alle Daten als CSV-Tabellen, ohne Gebühr. Unter „Verwaltung“, „Datenschutz“ erzeugst du die Auskunft nach Artikel 15 für eine einzelne Person und stellst die Aufbewahrungsdauer ein; nach Ablauf werden alte Daten anonymisiert. Das Änderungsprotokoll hält fest, wer wann was geändert hat." },
]);

/**
 * Die Texte, die eine Rolle sehen darf — nach der Rechtetabelle, nie nach einer
 * eigenen Liste. Eine unbekannte Rolle bekommt nichts.
 * @param {string} rolle
 * @returns {Hilfetext[]}
 */
export function korpusFuerRolle(rolle) {
  if (typeof rolle !== "string") return [];
  return HILFE_KORPUS.filter((t) => darf(rolle, t.recht));
}
