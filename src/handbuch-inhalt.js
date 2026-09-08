/* ==========================================================================
   HANDBUCHINHALT

   Vierundsiebzig Kilobyte Text, die beim ersten Laden der Anwendung
   mitkamen und in den allermeisten Sitzungen nie gebraucht wurden. Wer
   morgens seinen Dienstplan aufruft, liest kein Handbuch.

   Jetzt liegt der Inhalt in einer eigenen Datei und wird erst geholt, wenn
   jemand das Handbuch öffnet oder druckt. Für die Anwendung ändert sich
   nichts außer der Ladezeit.

   Eine Änderung war dafür nötig: Kapitel, die nur bei bestimmten
   Branchenpaketen erscheinen, trugen bisher `nurWenn: (m) => kann(m, …)`
   und hingen damit an einer Funktion aus App.jsx. Sie nennen ihre
   Voraussetzung jetzt als Liste von Merkmalen; ausgewertet wird sie dort,
   wo `kann` ohnehin zu Hause ist.
   ========================================================================== */

export const HANDBUCH = [
  /* ------------------------------------------------------------------ */
  {
    id: "start", titel: "Bevor es losgeht", dauer: "5 Minuten",
    einleitung: "Was du bereithalten solltest, damit die Einrichtung in einem Zug durchläuft.",
    abschnitte: [
      {
        titel: "Was du brauchst",
        text: "Die Einrichtung dauert je nach Betriebsgröße ein bis drei Stunden. Wer diese vier Dinge bereitliegen hat, ist in einem Zug durch.",
        schritte: [
          "Eine Liste aller Beschäftigten mit Name, Funktion und Wochenstunden — am besten als Tabelle aus der Lohnbuchhaltung.",
          "Den aktuellen Dienstplan, egal ob Excel, Papier oder Wandkalender. Er wird nicht eingelesen, aber du brauchst ihn zum Vergleichen.",
          "Die Antwort auf die Frage: Nach welchem Modell wird gearbeitet? Vier Gruppen im Wechsel? Fünf? Feste Schichten?",
          "Wer darf was? Wer plant, wer vertritt, wer sieht nur den eigenen Plan.",
        ],
        merke: "Die Liste der Beschäftigten ist der einzige Punkt, der wirklich Zeit kostet. Alles andere ist in Minuten erledigt.",
      },
      {
        titel: "Wie CENTRIC den Plan berechnet",
        text: "Das ist der wichtigste Unterschied zu anderen Programmen — und wer ihn versteht, versteht alles Weitere.",
        schritte: [
          "Andere Programme rollen einen Plan aus: Für jeden Tag und jede Person wird ein Eintrag gespeichert. Ein Jahr für achtzig Personen sind fast dreißigtausend Einträge.",
          "CENTRIC speichert stattdessen die Regel: den Zyklus und den Startpunkt jeder Gruppe. Daraus wird jeder Tag berechnet — vorwärts wie rückwärts, ohne Grenze.",
          "Gespeichert werden nur die Abweichungen von der Regel: wer einspringt, wer tauscht, wer fehlt.",
        ],
        merke: "Deshalb gibt es keine Jahresgrenze und keine Massenänderung, wenn das Modell wechselt. Du änderst die Regel, und der ganze Plan folgt.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "betrieb", titel: "Schritt 1 — Den Betrieb einrichten", dauer: "15 Minuten",
    ziel: "betrieb",
    einleitung: "Standorte, Arbeitszeitregeln und Dienstarten. Alles Weitere rechnet mit diesen Werten.",
    abschnitte: [
      {
        titel: "Standorte anlegen",
        text: "Jeder Standort hat ein eigenes Bundesland. Das ist keine Formalie: Feiertage unterscheiden sich, und ein Feiertagszuschlag hängt daran.",
        schritte: [
          "Verwaltung → Betrieb öffnen.",
          "Für jeden Standort Bezeichnung, Bundesland und Umkreis in Metern eintragen.",
          "Der Umkreis gilt für die Standortprüfung beim Einstempeln. 200 Meter sind ein guter Anfang — bei großen Werksgeländen mehr.",
        ],
        pruefen: "Im Monatsplan sind die Feiertage deines Bundeslandes rot markiert. Stimmt das nicht, ist das Bundesland falsch.",
        merke: "Betriebe mit mehreren Standorten in verschiedenen Bundesländern legen jeden einzeln an — sonst rechnet CENTRIC mit den falschen Feiertagen.",
      },
      {
        titel: "Arbeitszeitregeln festlegen",
        text: "Die Werte, gegen die jede Prüfung läuft. Sie stammen aus dem Arbeitszeitgesetz und dem Tarif- oder Arbeitsvertrag.",
        schritte: [
          "Wochenarbeitszeit: die vertragliche Regelarbeitszeit einer Vollzeitkraft.",
          "Ruhezeit zwischen zwei Diensten: gesetzlich elf Stunden, in Pflege und Klinik unter Bedingungen zehn.",
          "Höchstzahl Dienste in Folge: üblich sechs, in manchen Modellen sieben.",
          "Ausgleichsgrenze für das Stundenkonto: ab wann wird gewarnt. Vierzig Stunden sind verbreitet.",
        ],
        pruefen: "Prüfung öffnen. Erscheinen dort auf einmal Hunderte Befunde, ist ein Wert zu streng gesetzt.",
        merke: "Diese Werte lieber einmal mit dem Betriebsrat abstimmen als später alle Befunde erklären.",
      },
      {
        titel: "Dienstarten anlegen",
        text: "Früh, Spät, Nacht — oder was auch immer bei euch gefahren wird. Jede Dienstart braucht Zeiten, eine Farbe und eine Mindestbesetzung.",
        schritte: [
          "Verwaltung → Betrieb → Dienstarten.",
          "Name, Kürzel, Beginn und Ende eintragen. Über Mitternacht laufende Dienste werden automatisch erkannt.",
          "Dienstform wählen: Regeldienst, Bereitschaftsdienst, Rufbereitschaft oder geteilter Dienst.",
          "Mindestbesetzung je Wochentag — getrennt für Montag bis Donnerstag, Freitag, Samstag und Sonntag.",
          "Erforderliche Qualifikationen zuordnen, falls ein Dienst ohne bestimmte Kräfte nicht laufen darf.",
        ],
        pruefen: "Lagebild öffnen. Jede Dienstart zeigt eine Zahl wie 8/10 — eingeteilt gegen gefordert. Steht dort 8/0, fehlt die Mindestbesetzung.",
        merke: "Die Dienstform ist wichtiger, als sie aussieht: Rufbereitschaft unterbricht die Ruhezeit nicht, Bereitschaftsdienst zählt nur anteilig aufs Konto.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "personal", titel: "Schritt 2 — Personal anlegen", dauer: "20 bis 60 Minuten",
    ziel: "personal",
    einleitung: "Der einzige Schritt, der wirklich Zeit kostet. Es gibt zwei Wege.",
    abschnitte: [
      {
        titel: "Liste einlesen",
        text: "Der schnellere Weg, wenn eine Tabelle vorliegt.",
        schritte: [
          "Team → Personal → Importieren.",
          "Die Tabelle aus Excel kopieren und in das Feld einfügen. Komma, Semikolon und Tabulator werden erkannt.",
          "Spalten zuordnen: Vorname, Nachname, Funktion, Wochenstunden, Einheit.",
          "Die Vorschau zeigt jede Zeile mit Befund. Fehlerhafte Zeilen werden benannt, nicht stillschweigend übersprungen.",
          "Erst wenn die Vorschau stimmt, auf Übernehmen.",
        ],
        pruefen: "Die Personalliste zeigt danach die erwartete Anzahl. Fehlt jemand, stand in der Zeile ein unbekannter Einheitenname.",
        merke: "Personalnummern gleich mit einlesen, wenn vorhanden. Sie werden für die Lohnausgabe gebraucht und lassen sich später nur einzeln nachtragen.",
      },
      {
        titel: "Einzeln anlegen",
        text: "Für kleine Betriebe oder Nachzügler.",
        schritte: [
          "Team → Personal → Person hinzufügen.",
          "Name, Funktion, Einheit und Wochenstunden eintragen.",
          "Eintrittsdatum setzen — davor erscheint die Person in keinem Plan.",
          "Bei Teilzeit die tatsächlichen Wochenstunden eintragen; CENTRIC verteilt die Dienste entsprechend.",
        ],
        pruefen: "Die Person erscheint im Monatsplan ab dem Eintrittsdatum mit Diensten.",
      },
      {
        titel: "Zugangsarten vergeben",
        text: "Wer darf was sehen und ändern. Anders als bei vielen Anbietern kostet das nichts extra — gerechnet wird je Standort, nicht je Kopf.",
        schritte: [
          "In der Personalliste steht je Zeile ein Auswahlfeld für die Zugangsart.",
          "Organisationsleitung: alles. Genau eine je Betrieb, kostenfrei.",
          "Planung: Schichtfolge, Monatsplan, Freigabe, alle Anträge. Sitzt im Geschäftszimmer und fährt keine Schicht.",
          "Schichtverantwortung: nur die eigene Einheit, fährt selbst mit.",
          "Beschäftigte: eigener Plan, Anträge, Zeiterfassung.",
          "Betriebsrat: rein lesend, kostenfrei.",
        ],
        pruefen: "Die geänderte Zugangsart erscheint sofort in der Liste, und die betroffene Person sieht beim nächsten Anmelden die neuen Ansichten.",
        merke: "Im Zweifel weniger Rechte vergeben. Nachträglich erweitern ist leicht, entziehen ist unangenehm. Kosten spielen dabei keine Rolle — wer jemanden zur Planung befördert, zahlt keinen Aufpreis.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "quals", titel: "Schritt 3 — Qualifikationen", dauer: "20 Minuten",
    ziel: "quals",
    einleitung: "Wer darf was. Grundlage für Besetzungsprüfung und Ersatzsuche.",
    abschnitte: [
      {
        titel: "Qualifikationen anlegen",
        text: "Sachkunde, Schichtleitung, Erste Hilfe, Fachweiterbildungen — was in eurem Betrieb zählt.",
        schritte: [
          "Team → Qualifikationen → Hinzufügen.",
          "Bezeichnung und Kürzel eintragen.",
          "Gültigkeitsdauer festlegen: unbefristet oder in Monaten. Erste Hilfe läuft üblicherweise nach 24 Monaten ab.",
          "Nachweispflicht setzen, wenn ein Dokument vorliegen muss.",
          "Zwei besondere Schalter: „zählt als Fachkraft\" für die Quote in Pflege und Klinik, „gesetzlich zwingend\" für Qualifikationen wie die Sachkunde nach § 34a.",
        ],
        pruefen: "Bei einer Qualifikation mit Ablauf erscheint in der Personalakte ein Feld für das Ablaufdatum.",
        merke: "„Gesetzlich zwingend\" wirkt hart: Ohne diese Qualifikation ist gar kein Einsatz zulässig, unabhängig vom Dienst. Nur dort setzen, wo es wirklich so ist.",
      },
      {
        titel: "Personen zuordnen",
        text: "Ohne Zuordnung kann CENTRIC nicht erkennen, ob ein Dienst fachlich gedeckt ist.",
        schritte: [
          "Personalakte öffnen → Qualifikationen.",
          "Zutreffende auswählen und bei befristeten das Ablaufdatum eintragen.",
          "Bei vielen Personen ist der Weg über die Qualifikationsmatrix schneller: Team → Qualifikationen → Matrix.",
        ],
        pruefen: "Die Matrix zeigt je Einheit und Qualifikation, wie viele Personen sie haben. Rot bedeutet: hängt an einer einzigen Person.",
        merke: "Die Engpassanzeige der Matrix ist eine der nützlichsten Ansichten überhaupt — sie zeigt, wo ein einziger Ausfall den Betrieb lahmlegt.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "folge", titel: "Schritt 4 — Schichtfolge festlegen", dauer: "15 Minuten",
    ziel: "folge",
    einleitung: "Das Herzstück. Aus Zyklus und Startpunkt entsteht der ganze Plan.",
    abschnitte: [
      {
        titel: "Modell wählen",
        text: "Neun geprüfte Modelle stehen bereit, jedes mit gerechneten Kennzahlen.",
        schritte: [
          "Planung → Schichtfolge → Einrichtungsassistent.",
          "Die Liste zeigt je Modell: Wochenstunden, Anzahl Gruppen, längste Dienstserie.",
          "Ein Klick öffnet die Vorschau mit dem tatsächlichen Zyklus.",
          "Wenn keines passt: eigenen Zyklus bauen — Dienstart antippen, dann auf Tage klicken. Oder die Dienstart direkt auf einen Tag ziehen.",
        ],
        pruefen: "Die Kennzahl „Wochenstunden\" muss zur vertraglichen Arbeitszeit passen. Weicht sie um mehr als eine Stunde ab, entstehen dauerhaft Plus- oder Minusstunden.",
        merke: "Die Zahlen sind gerechnet, nicht geschätzt. Ein Modell mit 42 Stunden bei 40 Stunden Vertrag erzeugt zwei Plusstunden je Woche — je Person, jede Woche.",
      },
      {
        titel: "Gruppen und Startpunkte",
        text: "Jede Gruppe startet an einer anderen Stelle des Zyklus. Der Versatz bestimmt, wer wann arbeitet.",
        schritte: [
          "Anzahl Gruppen festlegen — meist gibt das Modell sie vor.",
          "Den Versatz je Gruppe prüfen. Bei gleichmäßigem Versatz deckt jede Gruppe reihum jede Dienstart ab.",
          "Ankerdatum setzen: der Tag, an dem Gruppe 1 am Zyklusanfang steht.",
        ],
        pruefen: "Im Monatsplan durchlaufen alle Gruppen dieselbe Abfolge, nur zeitversetzt. Arbeiten zwei Gruppen gleichzeitig dieselbe Schicht, stimmt der Versatz nicht.",
        merke: "Das Ankerdatum lässt sich später ändern, verschiebt dann aber den gesamten Plan. Vor der ersten Freigabe klären.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "plan", titel: "Schritt 5 — Prüfen und freigeben", dauer: "20 Minuten",
    ziel: "plan",
    einleitung: "Vor der Freigabe alle kritischen Befunde klären. Danach ist der Plan verbindlich.",
    abschnitte: [
      {
        titel: "Die Prüfung lesen",
        text: "CENTRIC prüft laufend gegen Arbeitszeitgesetz, Mindestbesetzung und Qualifikationen.",
        schritte: [
          "Auswertung → Prüfung öffnen.",
          "Rote Befunde sind kritisch: Ruhezeitverstoß, Unterbesetzung, fehlende Pflichtqualifikation.",
          "Gelbe sind Hinweise: hohes Stundenkonto, viele Dienste in Folge, ablaufender Nachweis.",
          "Jeder Befund nennt Person, Datum und Grund. Ein Klick führt zum betroffenen Tag.",
        ],
        pruefen: "Nach dem Beheben verschwindet der Befund sofort — die Prüfung rechnet bei jeder Änderung neu.",
        merke: "Gelbe Befunde müssen nicht verschwinden. Rote sollten es, bevor freigegeben wird.",
      },
      {
        titel: "Lücken schließen",
        text: "Wenn ein Dienst unterbesetzt ist.",
        schritte: [
          "Lagebild öffnen oder den Tag im Monatsplan anklicken.",
          "Bei der unterbesetzten Dienstart auf „Besetzen\".",
          "CENTRIC schlägt Personen vor, geordnet nach Eignung. Wer nicht kann, steht unten mit Begründung.",
          "Der Knopf „warum?\" zeigt, weshalb jemand oben steht: Stundenkonto unter dem Mittel, Wunschdienst hinterlegt, lange nicht eingesprungen.",
          "Vor dem Eintragen zeigt CENTRIC die Folgen: Ruhezeit, Wochenstunden, nächste Dienste.",
        ],
        pruefen: "Die Zahl im Lagebild steigt von 8/10 auf 9/10.",
        merke: "Wer abwesend ist, kann nicht eingeteilt werden — CENTRIC lehnt das ab statt es stillschweigend anzunehmen.",
      },
      {
        titel: "Freigeben",
        text: "Mit der Freigabe wird der Monat verbindlich.",
        schritte: [
          "Planung → Monatsplan → Freigeben.",
          "Ab dann löst jede Änderung eine Mitteilung an die Betroffenen aus.",
          "Der Planstandvergleich zeigt, was sich seit der Freigabe geändert hat.",
        ],
        pruefen: "In der Kopfzeile steht „Freigegeben\" mit Datum und Name.",
        merke: "Vor der Freigabe ist alles Entwurf und niemand wird benachrichtigt. Danach zählt jede Änderung in die Planungssicherheit.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "betrieb2", titel: "Der laufende Betrieb", dauer: "täglich",
    ziel: "start",
    einleitung: "Was nach der Einrichtung jeden Tag passiert.",
    abschnitte: [
      {
        titel: "Krankmeldung und Ersatz",
        text: "Der häufigste Vorgang überhaupt — und der eigentliche Prüfstein.",
        schritte: [
          "Auf jeder Ansicht oben: Krankmeldung erfassen.",
          "Person und Zeitraum wählen. CENTRIC zeigt sofort alle entstehenden Lücken.",
          "Je Lücke Ersatz suchen. Wer möglich ist, steht oben; wer nicht, unten mit Grund.",
          "Findet sich niemand: erweiterte Anfrage an mehrere Personen gleichzeitig.",
          "Bleibt es unbesetzt: dokumentierte Unterschreitung mit Begründung — nachweisbar für Prüfungen.",
        ],
        pruefen: "Die betroffenen Personen erhalten eine Mitteilung, sichtbar im Postfach.",
      },
      {
        titel: "Offene Schichten ausschreiben",
        text: "Statt zehn Leute anzurufen: die Lücke sichtbar machen und warten, wer sich meldet.",
        schritte: [
          "Anliegen → Offene Schichten.",
          "Oben stehen die Lücken der nächsten vierzehn Tage, die noch nicht ausgeschrieben sind.",
          "Auf „Ausschreiben\" — CENTRIC zeigt vorher, wie viele Personen die Schicht überhaupt übernehmen dürfen.",
          "Ein Satz zum Grund erhöht die Bereitschaft spürbar: „Krankmeldung, kurzfristig\".",
          "Unterrichtet wird nur, wer sie auch nehmen darf — Ruhezeit, Qualifikation und Abwesenheit sind vorher geprüft.",
          "Meldungen erscheinen nach Eignung geordnet, mit Begründung. Ein Griff auf „Einteilen\".",
        ],
        pruefen: "Nach dem Ausschreiben meldet CENTRIC, wie viele Personen unterrichtet wurden. Steht dort null, darf niemand — dann hilft nur die gezielte Ersatzsuche.",
        merke: "Die Reihenfolge der Meldungen richtet sich nicht danach, wer zuerst kam. Sonst gewinnt, wer am häufigsten aufs Telefon schaut. Stattdessen zählen Stundenkonto, Auslastung und wie oft jemand zuletzt eingesprungen ist.",
      },
      {
        titel: "Anträge entscheiden",
        text: "Urlaub, Tausch, Schulung — mit Blick auf die Folgen.",
        schritte: [
          "Anliegen → Anträge öffnen.",
          "Links die Liste, rechts die Kapazität der nächsten acht Wochen.",
          "Beim Markieren eines Antrags färben sich die betroffenen Wochen. Rot heißt: diese Woche kippt erst dadurch.",
          "Mehrere auswählen zeigt die Wirkung aller zusammen.",
          "Tastatur: J und K blättern, G genehmigt, A lehnt ab, Leertaste wählt aus.",
        ],
        pruefen: "Unter dem markierten Antrag stehen Urlaubsrest, Stundenkonto und Auslastung der Person.",
        merke: "Wer täglich vierzig Anträge entscheidet, sollte die Tastatur nutzen. Das ist der Unterschied zwischen zwanzig Minuten und fünf.",
      },
      {
        titel: "Checklisten an Schichten",
        text: "Was zu einem Dienst gehört, aber nicht im Plan steht: Rundgang, Schlüsselübergabe, Betäubungsmittelschrank.",
        schritte: [
          "Verwaltung → Betrieb → Dienstarten → gewünschte Dienstart öffnen.",
          "Auf „Vorlage übernehmen\" — je nach Branchenpaket erscheinen passende Punkte zum Anpassen.",
          "Je Punkt festlegen: Zeitpunkt (Beginn, laufend, Ende oder feste Uhrzeit) und ob er Pflicht ist.",
          "Beschäftigte sehen die Liste unter Heute, sobald sie im Dienst sind.",
        ],
        merke: "Ein gesetzter Haken lässt sich nicht zurücknehmen, und wer nachträglich abhakt, erzeugt einen Eintrag mit dem Vermerk „nachgetragen\". Eine rückwirkend änderbare Dokumentation wäre als Nachweis wertlos — und genau dafür wird sie gebraucht.",
      },
      {
        titel: "Schneller tippen als klicken",
        text: "Die Suche oben versteht ganze Sätze, nicht nur einzelne Begriffe.",
        schritte: [
          "Suchfeld öffnen und schreiben, was gemeint ist: „Müller krank morgen\".",
          "CENTRIC zeigt, was es verstanden hat, bevor etwas geschieht.",
          "Auch möglich: „Urlaub Schmidt 14.3. bis 20.3.\", „wer kann Freitag Nachtdienst\", „Lagebild morgen\".",
          "Bei mehreren gleichen Namen wird nachgefragt statt geraten.",
        ],
        merke: "Die Zeile führt nie selbst etwas aus. Sie öffnet die passende Ansicht mit vorausgefüllten Feldern — entscheiden tut ein Mensch. Das ist Absicht: ein Dienstplan braucht Vorhersagbarkeit, kein Raten.",
      },
      {
        titel: "Zeiten und Zuschläge",
        text: "Was tatsächlich gearbeitet wurde.",
        schritte: [
          "Beschäftigte bestätigen ihre Zeiten in der Telefonansicht — „wie geplant\" oder mit Abweichung.",
          "Auswertung → Abrechnungsdaten zeigt Zuschläge tagesgenau zerlegt.",
          "Lohnausgabe erzeugt eine CSV-Datei mit Stunden je Person und Lohnart — kein amtliches "
            + "DATEV-Importformat, sondern eine Spaltenliste zum Einlesen oder Übernehmen. "
            + "Die Lohnartennummern vorher mit der Lohnbuchhaltung abstimmen.",
        ],
        pruefen: "Die Summe je Lohnart stimmt mit der Zuschlagsübersicht überein.",
        merke: "CENTRIC rechnet Stunden, keine Beträge. Stundensätze und Steuerfreibeträge gehören in die Lohnabrechnung.",
      },
      {
        titel: "Belastbarkeit im Blick behalten",
        text: "Die Frage vor dem Anruf, nicht danach.",
        schritte: [
          "Auswertung → Belastbarkeit.",
          "Je Woche und Dienst: wie viele gleichzeitige Ausfälle verträgt die schwächste Schicht.",
          "Null bedeutet: der nächste Krankheitsfall führt zur Unterbesetzung.",
          "Darunter vier Ausfallszenarien von fünf bis dreißig Prozent.",
        ],
        merke: "Diese Ansicht einmal die Woche öffnen. Sie zeigt Probleme, bevor sie eintreten.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "beschaeftigte", titel: "Für Beschäftigte", dauer: "5 Minuten",
    einleitung: "Was die Belegschaft auf dem Telefon sieht. Diesen Teil ausdrucken und aushängen.",
    abschnitte: [
      {
        titel: "Die vier Reiter",
        text: "Beschäftigte landen automatisch in der Telefonansicht, unabhängig vom Gerät.",
        schritte: [
          "Heute: der Dienst des Tages mit großem Knopf zum Ein- und Ausstempeln.",
          "Mein Plan: kommende Dienste als Liste oder Monatsansicht. Tippen öffnet Tausch, Antrag und Wunsch.",
          "Anliegen: Anträge, Krankmeldung, Tauschbörse, Stundenkonto.",
          "Mehr: Verfügbarkeit, Wunschdienste, Nachweise, Schwarzes Brett, Feldmodus.",
        ],
        merke: "Beim Stempeln wird der Standort einmalig geprüft. Gespeichert wird nur, ob jemand am Einsatzort war — keine Koordinate, kein Verlauf, keine Dauerortung.",
      },
      {
        titel: "Häufige Fragen",
        text: "Was in der Einführung immer gefragt wird.",
        schritte: [
          "„Wann arbeite ich?\" — Reiter Heute, ganz oben.",
          "„Wie viele Urlaubstage habe ich noch?\" — Mehr, oben in den Kennzahlen.",
          "„Kann ich tauschen?\" — Mein Plan, Tag antippen, Tausch suchen. Das Gesuch sehen alle.",
          "„Warum steht mein Konto im Minus?\" — Anliegen, Stundenkonto, mit Verlauf über sechs Monate.",
          "„Sieht der Chef, wo ich bin?\" — Nein. Nur ob du beim Stempeln am Einsatzort warst.",
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "pflege", titel: "Besonderheiten Pflege und Klinik", dauer: "10 Minuten",
    merkmale: ["fachkraftquote", "uebergabe"],
    einleitung: "Was in diesen Branchen zusätzlich gilt.",
    abschnitte: [
      {
        titel: "Fachkraftquote",
        text: "Der Mindestanteil examinierter Kräfte je Dienst — als Anteil geführt, nicht als feste Zahl.",
        schritte: [
          "Bei der Qualifikation den Schalter „zählt als Fachkraft\" setzen.",
          "Bei jeder Dienstart den Mindestanteil wählen: 40 Prozent tagsüber, 50 Prozent nachts sind verbreitet.",
          "Die Prüfung meldet Unterschreitungen als kritischen Befund.",
        ],
        merke: "Eine feste Zahl wäre bei wechselnder Besetzungsstärke ohne Aussage. Zwei Fachkräfte bei vier Personen sind etwas anderes als zwei bei zehn.",
      },
      {
        titel: "Schichtübergabe",
        text: "Ein eigener, dokumentationspflichtiger Vorgang.",
        schritte: [
          "Heute → Übergabe.",
          "Vier Felder: Lage und Besonderheiten (Pflicht), offene Aufgaben, besondere Vorkommnisse, Material.",
          "Nach dem Abschließen nicht mehr änderbar — Ergänzungen werden mit Zeitstempel angehängt.",
          "Fehlende Übergaben der letzten drei Tage stehen oben als Schnellzugriff.",
        ],
        merke: "Die Unveränderbarkeit ist Absicht. Eine nachträglich geänderte Übergabe wäre als Nachweis wertlos.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "sicherheit", titel: "Besonderheiten Sicherheitsdienst", dauer: "8 Minuten",
    merkmale: ["sperreEigen", "posten"],
    einleitung: "Was im Bewachungsgewerbe zusätzlich gilt.",
    abschnitte: [
      {
        titel: "Sachkunde nach § 34a",
        text: "Gesetzlich zwingend — ohne sie ist kein Einsatz zulässig.",
        schritte: [
          "Bei der Qualifikation den Schalter „gesetzlich zwingend\" setzen.",
          "CENTRIC sperrt daraufhin jeden Einsatz ohne diese Qualifikation, unabhängig von der Dienstart.",
          "Auch die Ersatzsuche schließt betroffene Personen aus, mit Begründung.",
        ],
        merke: "Anders als eine normale Mindestqualifikation gilt die harte Sperre für alle Dienste. Das entspricht der Rechtslage.",
      },
      {
        titel: "Außenposten",
        text: "Objekte, die aus dem laufenden Dienst heraus besetzt werden.",
        schritte: [
          "Dienstart anlegen und „Außenposten\" setzen.",
          "Quelldienst wählen — aus welchem Dienst die Besetzung kommt.",
          "CENTRIC verteilt die Posten reihum, damit nicht immer dieselben dort stehen.",
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "probleme", titel: "Wenn etwas nicht stimmt", dauer: "Nachschlagen",
    einleitung: "Die Fälle, die in der Einführung am häufigsten auftreten.",
    abschnitte: [
      {
        titel: "Der Plan sieht falsch aus",
        text: "Meist liegt es an einem von drei Dingen.",
        schritte: [
          "Arbeiten zwei Gruppen gleichzeitig dieselbe Schicht? → Versatz prüfen unter Schichtfolge.",
          "Fängt der Zyklus am falschen Tag an? → Ankerdatum prüfen.",
          "Fehlen einzelne Personen? → Eintrittsdatum und Einheitenzuordnung prüfen.",
        ],
      },
      {
        titel: "Hunderte Befunde auf einmal",
        text: "Fast immer ein zu streng gesetzter Wert.",
        schritte: [
          "Ruhezeit auf zwölf Stunden gesetzt, obwohl elf gelten? → Verwaltung, Betrieb.",
          "Wochenstunden des Modells passen nicht zum Vertrag? → Schichtfolge, Kennzahlen prüfen.",
          "Mindestbesetzung höher als die Gruppenstärke? → Dienstarten prüfen.",
        ],
      },
      {
        titel: "Jemand kann nicht eingeteilt werden",
        text: "Die Ersatzliste nennt immer den Grund.",
        schritte: [
          "Ruhezeit — der Dienst läge zu dicht am vorherigen.",
          "Abwesend — Urlaub, krank oder Schulung.",
          "Qualifikation fehlt oder ist abgelaufen.",
          "Einsatzeinschränkung — keine Nacht, kein Alleindienst, Wiedereingliederung.",
        ],
        merke: "Steht dort nichts, ist die Person schlicht schon eingeteilt.",
      },
      {
        titel: "Zwei Personen haben gleichzeitig gespeichert",
        text: "CENTRIC überschreibt nicht stillschweigend.",
        schritte: [
          "Es erscheint ein Hinweis mit Name und Zeit der anderen Speicherung.",
          "Der fremde Stand bleibt erhalten. Die eigene Änderung noch einmal vornehmen.",
        ],
        merke: "Ohne diesen Schutz würde bei zwei gleichzeitig arbeitenden Planern still Arbeit verloren gehen.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: "daten", titel: "Daten und Datenschutz", dauer: "5 Minuten",
    ziel: "mitnahme",
    einleitung: "Was gespeichert wird, wie lange, und wie man wieder herauskommt.",
    abschnitte: [
      {
        titel: "Datenmitnahme",
        text: "Jederzeit vollständig, in offenem Format, ohne Gebühr.",
        schritte: [
          "Verwaltung → Datenmitnahme.",
          "Sieben Tabellen als CSV: Personalstamm, Dienstplan, Abwesenheiten, Zeiten, Anträge, Qualifikationen, Protokoll.",
          "Der Dienstplan wird Tag für Tag ausgeschrieben — so lässt er sich in jedes andere System einlesen.",
        ],
        merke: "Eine Dienstplanung ist betriebskritisch. Die Frage, wie man wieder herauskommt, gehört an den Anfang eines Vertrags, nicht ans Ende.",
      },
      {
        titel: "Auskunft und Löschung",
        text: "Rechte nach der Datenschutz-Grundverordnung.",
        schritte: [
          "Verwaltung → Datenschutz → Auskunft nach Artikel 15 für eine einzelne Person erzeugen.",
          "Aufbewahrungsdauer einstellen — nach Ablauf werden alte Daten anonymisiert.",
          "Das Änderungsprotokoll hält fest, wer wann was geändert hat.",
        ],
      },
    ],
  },
];
