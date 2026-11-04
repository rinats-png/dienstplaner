# Pilot-Erhebung Sicherheitsdienst (Pilotbetrieb B)

Stand: 2026-11-03 · Branch `acc45/docs/pilot-erhebung` · Zieltermin Gesamtprodukt: 24.12.2026

**Zweck:** Erhebungsbogen für das Gespräch zwischen Betreiber und Pilotbetrieb B (junges Sicherheitsunternehmen). Der
Bogen wird im Gespräch ausgefüllt, dient dem Verständnis von Objekten, Posten, Schichtmodellen und Nachweisen und ist die
Grundlage für synthetische Testdaten (siehe `PILOT-TESTSZENARIEN.md`).

**Regeln für das Ausfüllen (verbindlich):**

1. **Keine Personendaten.** Keine Namen, Geburtsdaten, Adressen, Kontaktdaten, keine Angaben zu einzelnen Beschäftigten
   (auch keine Sachkundenachweise einzelner Personen). Nur Zahlen, Rollen, Regeln und Abläufe. Beispiele erfinden.
2. **Keine Auftraggeber- und Objektkennung.** Keine echten Objektnamen, Adressen, Auftraggeberfirmen, Zugangs-,
   Schlüssel- oder Alarmdaten. Objekte werden als „Objekt 1, 2, 3" mit Typ (z. B. Baustelle, Handel, Veranstaltung)
   beschrieben.
3. **Keine Firmenkennung im Repository.** Der Bogen im Repository bleibt leer (Vorlage). Ausgefüllte Fassungen liegen
   außerhalb des öffentlichen Repositories und nennen den Betrieb nur als „Pilot B".
4. **Rechtliche Bezüge sind Fragen, keine Aussagen.** Wo § 34a GewO oder die Bewachungsverordnung auftaucht, fragt der
   Bogen, wie der Betrieb damit umgeht. Das Dokument stellt nichts fest und gibt keine Rechtsauskunft.
5. **Schätzwerte kennzeichnen:** gemessen (G), geschätzt (S), unbekannt (U).
6. **Offene Antworten sind zulässig.**

Bezug zum Produkt: Sicherheits-Paket aus `BRANCHENPAKETE-STRATEGIE.md` (Abschnitt A.1, D.1; Branch
`acc45/docs/branchenpakete-strategie`, noch nicht gemergt) und `WP19-MODULPLAN.md` (Module `posten` = WP-19.1, `wachbuch` =
WP-19.2, `objektbericht` = WP-19.3). Diese Module sind laut `work-packages.json` noch nicht einschaltbar; der Bogen prüft,
was der Betrieb braucht, nicht, was schon fertig ist.

---

## 0. Kopfdaten

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 0.1 | Gesprächsdatum, Teilnehmende (nur Rollen, keine Namen) | | | |
| 0.2 | Seit wann besteht das Unternehmen, welche Dienstleistungen (Objektschutz, Veranstaltung, Revierdienst, Werttransport, Empfang, Pforte, Baustelle)? | | | |
| 0.3 | Gibt es einen Betriebsrat? Wenn nein: Wie werden Beschäftigte bei Einführung von Zeiterfassung eingebunden? | | | |
| 0.4 | Wer entscheidet über Software (Geschäftsführung, Disposition, Objektleitung)? | | | |
| 0.5 | Gewünschter Pilotzeitraum, Ansprechpartner-Rolle für Rückfragen | | | |
| 0.6 | Wachstumsplanung: Wie viele Beschäftigte und Objekte in 6 bis 12 Monaten (Zahl)? | | | |

## 1. Beschäftigte, Objekte, Standorte

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 1.1 | Wie viele Beschäftigte insgesamt? Davon Festangestellte / Teilzeit / geringfügig / Aushilfe / Subunternehmer (Zahlen) | | | |
| 1.2 | Wie viele Objekte werden betreut? Typen und Größenordnung (Zahl je Typ) | | | |
| 1.3 | Wie viele Posten je Objekt (Zahl, Spannweite)? Beispiele: Pforte, Streife, Zufahrt, Leitstelle | | | |
| 1.4 | Laufzeit der Aufträge: dauerhaft, befristet, Einzelveranstaltung? Wie oft ändern sich Objekte (je Quartal)? | | | |
| 1.5 | Gibt es Alleinarbeitsposten (eine Person allein)? Wie viele? Welche Schutzmaßnahmen sind betrieblich vorgesehen (Frage; es wird nichts unterstellt) | | | |
| 1.6 | Wer disponiert (Rollen), wie viele Personen? Gibt es Schichtverantwortliche je Objekt? | | | |
| 1.7 | Sitz des Betriebs / Einsatzgebiet: ein Ort, mehrere Orte, überregional (nur grob)? | | | |

## 2. Schichtmodelle und Dienstarten

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 2.1 | Welche Dienstarten gibt es (Früh, Spät, Nacht, 12-Stunden, Veranstaltungsdienst, Bereitschaft)? Beginn, Ende, Pausenregel | | | |
| 2.2 | Rund-um-die-Uhr-Objekte: Wie wird 24/7 besetzt (Modell, Gruppen)? | | | |
| 2.3 | Planungszeitraum und Vorlauf bis zur Veröffentlichung? Wie kurzfristig kommen Aufträge? | | | |
| 2.4 | Welche Wochenend-, Feiertags- und Nachtregeln gelten betrieblich? | | | |
| 2.5 | Wie wird Mehr-/Minderarbeit geführt (Zeitkonto, Ausgleichszeitraum)? | | | |
| 2.6 | Welcher Tarifrahmen gilt (nur Bezeichnung)? Gilt Mindestlohn-/Branchenregelung? (Frage nach dem Verfahren, keine Beträge) | | | |
| 2.7 | Welche Arbeitszeitregeln beachtet der Betrieb aktiv (Ruhezeit, Höchstarbeitszeit, Nachtarbeit)? Woher kommen sie? | | | |
| 2.8 | Werden Dienste auf mehrere Posten innerhalb einer Schicht aufgeteilt (Postenwechsel, Streife)? | | | |

## 3. Qualifikationen

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 3.1 | **§ 34a GewO:** Frage an den Betrieb: Welche Qualifikationsnachweise werden im Betrieb geführt und überwacht (Unterrichtung, Sachkundeprüfung, ggf. weitere)? Welche davon sind für welche Postenarten betrieblich oder vertraglich Voraussetzung? (Es wird nichts unterstellt; die Frage dient nur der Struktur der Qualifikationsliste.) | | | |
| 3.2 | Welche weiteren Qualifikationen gibt es (Ersthelfer, Brandschutzhelfer, Waffenschein/Waffensachkunde, Hundeführer, Fahrerlaubnis, Leitstellenschulung, Sprachkenntnisse)? | | | |
| 3.3 | Welche laufen ab und müssen überwacht werden? Intervall? | | | |
| 3.4 | Gibt es Posten, für die eine bestimmte Qualifikation vom Auftraggeber verlangt wird? Wie wird das heute sichergestellt? | | | |
| 3.5 | Wer pflegt die Nachweise, wo (Ordner, Tabelle, Software)? | | | |
| 3.6 | Gibt es Anteile ohne Nachweis (z. B. in Einarbeitung)? Wie werden sie eingesetzt? | | | |
| 3.7 | Werden Subunternehmer geführt? Wie wird deren Qualifikation nachgehalten (Frage; Datenschutzfolgen beachten)? | | | |

## 4. Besetzungsregeln

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 4.1 | Sollbesetzung je Objekt/Posten, Wochentag, Tageszeit (Zahlen)? Woher kommt das Soll (Vertrag, Leistungsverzeichnis)? | | | |
| 4.2 | Welche Mindestqualifikationen gelten je Posten? | | | |
| 4.3 | Welche Posten dürfen nicht unbesetzt bleiben? Was passiert bei Unterbesetzung (Meldung, Vertragsstrafe, Ersatz)? | | | |
| 4.4 | Wie wird Alleinarbeit abgesichert (Gegenstelle, Rückmeldeintervall)? Frage nach dem Verfahren | | | |
| 4.5 | Gibt es Kontrollgänge mit vorgeschriebenen Punkten/Zeiten? Wie werden sie heute nachgewiesen? | | | |
| 4.6 | Dürfen Personen auf bestimmten Objekten nicht eingesetzt werden (Auftraggeber-Sperre, Interessenkonflikt)? Wie wird das geführt (nur Verfahren, keine Namen)? | | | |
| 4.7 | Wie viel Reserve/Springer wird vorgehalten? | | | |

## 5. Bisherige Software, Excel, Papier

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 5.1 | Womit wird heute geplant (Tabellenblatt, Messenger-Gruppe, Fachsoftware)? Nur Kategorie | | | |
| 5.2 | Womit wird die Zeit erfasst (Stundenzettel, App, Stempeluhr, gar nicht)? | | | |
| 5.3 | Wie läuft die Kommunikation mit den Beschäftigten (Telefon, Messenger, E-Mail)? Probleme? | | | |
| 5.4 | Welche Berichte/Dateien entstehen monatlich und von wem (Aufbau beschreiben, keine echten Dateien weitergeben)? | | | |
| 5.5 | Was soll aus dem Altsystem übernommen werden, was ausdrücklich nicht? | | | |
| 5.6 | Sollen Altdaten importiert werden? Wenn ja: nur anonymisiert (siehe `PILOT-DATENSCHUTZ-RAHMEN.md`) | | | |

## 6. Typische Ausfälle und Umplanungen

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 6.1 | Wie viele kurzfristige Ausfälle je Woche (grob, je Objekttyp)? | | | |
| 6.2 | Wann und wie erfährt die Disposition vom Ausfall (Uhrzeit-Spanne, Kanal)? | | | |
| 6.3 | Reihenfolge der Ersatzsuche: Wer wird zuerst gefragt (Springer, Teilzeit, Aushilfe, Subunternehmer)? | | | |
| 6.4 | Dauer von der Ausfallmeldung bis zur bestätigten Ersatzbesetzung (Basis für eigene Messung, Teil von S1/S2) | | | |
| 6.5 | Wie oft bleibt ein Posten unbesetzt oder wird unterbesetzt, und wie wird das dokumentiert? | | | |
| 6.6 | Was passiert, wenn der Auftraggeber kurzfristig Mehrbedarf oder Wegfall meldet (Stunden, Posten)? | | | |
| 6.7 | Werden Diensttausche zugelassen? Wer genehmigt? | | | |
| 6.8 | Nacht-/Wochenendausfälle: Gibt es eine Bereitschaft der Disposition? | | | |

## 7. Arbeitsabläufe, Wachbuch, Berichte, Exporte

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 7.1 | Ablauf von der Auftragsannahme über die Planung bis zur Veröffentlichung (Schritte, Rollen) | | | |
| 7.2 | **Wachbuch:** Wird eines geführt (Papier, Datei, Software)? Pro Objekt? Wer trägt wann ein? Welche Ereignisarten (Rundgang, Vorkommnis, Übergabe, Schlüsselausgabe)? | | | |
| 7.3 | Wie werden Fehler im Wachbuch korrigiert (Nachtrag, Streichung)? Aufbewahrung: Welche Dauer ist betrieblich festgelegt und woher stammt die Vorgabe? (Frage; keine Aussage zu Pflichtfristen) | | | |
| 7.4 | **Objektbericht/Auftraggeberbericht:** Verlangen Auftraggeber regelmäßige Nachweise? Rhythmus, Inhalt (Soll/Ist-Stunden, Vorkommnisse, Kontrollgänge), Format (PDF, Tabelle)? (Basis für Kennzahl S1) | | | |
| 7.5 | Wie lange dauert die Erstellung eines Berichts je Objekt vom Monatsende bis zum Versand (Minuten/Stunden)? | | | |
| 7.6 | Rechnungsstellung: Werden Stunden nach Ist abgerechnet? Wer erstellt die Abrechnung, aus welchen Daten? (Frage zum Ablauf; Rechnungsstellung ist nicht Teil des Produkts) | | | |
| 7.7 | Monatsabschluss: Wer prüft Zeiten, korrigiert, übergibt an die Lohnabrechnung? Dauer? | | | |
| 7.8 | Lohnexport: Welches Format erwartet die Abrechnung (Dateiart, Spalten in Worten)? Intern oder extern? | | | |
| 7.9 | Welche Inhalte dürfen Auftraggebern gezeigt werden, welche nicht (z. B. keine Namen der Beschäftigten)? | | | |
| 7.10 | Wer darf welche Sichten sehen (Disposition, Objektleitung, Beschäftigte)? | | | |

## 8. Mobile Nutzung

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 8.1 | Geräte der Beschäftigten (privat, Dienst-Smartphone, keines)? Anteile grob | | | |
| 8.2 | Betriebssysteme, ältere Geräte? | | | |
| 8.3 | Netzabdeckung auf den Objekten (Tiefgarage, Keller, Baustelle, Freigelände)? Folge für Offline-Stempeln | | | |
| 8.4 | Wo soll gestempelt werden (am Posten, am Eingang, zentral)? Ist Ortsprüfung (Geofence) gewünscht oder bedenklich? Wer klärt das mit den Beschäftigten? | | | |
| 8.5 | Welche Mitteilungen sind nötig (Ausfall, Planänderung, Dienstbeginn)? Push, Mail, Telefon? | | | |
| 8.6 | Sprachen der Beschäftigten (Bedarf an einfacher Sprache oder weiteren Sprachen)? | | | |
| 8.7 | Ist private Gerätenutzung betrieblich abgestimmt? | | | |

## 9. Pilot-Kennzahlen (aus der Strategie, Abschnitt D.1)

Gemeinsame Regeln: Basismessung 2 bis 4 Wochen **vor** Aktivierung, Schwelle legen Betrieb und Betreiber **vor
Pilotbeginn** gemeinsam fest. Das Dokument nennt keine Zahl. Verfehlen ist ein zulässiges Ergebnis. Gemessen wird der
Vorgang, nicht die Person: keine Namen, kein Verlauf je Person, Zähler je Betrieb und Monat, Mindestgruppe 3. Die Messung
ist wie die Einführung selbst mit der betrieblichen Mitbestimmung bzw. Beteiligung der Beschäftigten zu klären.

| Kennzahl | Definition | Basismessung heute (Methode, Zeitraum) | Messort/Verantwortung (Rolle) | Schwelle (vorab vereinbart) |
|---|---|---|---|---|
| **S1** Zeitaufwand Auftraggeberbericht | Minuten vom Monatsende bis zum versandfertigen Bericht je Objekt | | | |
| **S2** Manuelle Korrekturen/Übertragungen | Zahl der Nachbearbeitungsschritte außerhalb des Systems (Tabelle, Abtippen) je Objekt und Monat; Korrekturanträge Ist | | | |
| **S3** Vollständigkeit/Nachvollziehbarkeit | Anteil der Postenschichten mit Soll und bestätigtem Ist; Anteil „ungeklärt" | | | |

Rückfragen zur Messung:

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 9.1 | Wer stoppt und protokolliert die Basismessung (Rolle), mit welchem Bogen? | | | |
| 9.2 | Wie viele Berichte je Monat fallen an, für wie viele Auftraggeber? | | | |
| 9.3 | Welche Zahl wäre ein spürbarer Nutzen (Hypothese, keine Zusage)? | | | |
| 9.4 | Was wäre ein Abbruchkriterium für den Pilot? | | | |

## 10. Abschluss des Gesprächs

| Nr | Frage | Antwort |
|---|---|---|
| 10.1 | Größter Schmerzpunkt heute (ein Satz)? | |
| 10.2 | Was darf das neue System auf keinen Fall verschlechtern? | |
| 10.3 | Welche Szenarien aus `PILOT-TESTSZENARIEN.md` (PS-S-nn) sollen zuerst gemeinsam durchgespielt werden? | |
| 10.4 | Offene Fragen an den Betreiber / an den Betrieb | |

## Ableitung für Testdaten (vom Betreiber nach dem Gespräch auszufüllen, ohne Personendaten)

| Parameter | Wert |
|---|---|
| Anzahl synthetischer Beschäftigter | |
| Anzahl Objekte und Posten je Objekt | |
| Dienstarten (Kürzel, Zeiten) | |
| Qualifikationen (Kürzel) | |
| Sollbesetzung je Posten | |
| Typische Ausfallquote je Woche | |
