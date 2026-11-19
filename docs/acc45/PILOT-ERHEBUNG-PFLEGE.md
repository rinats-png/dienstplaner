# Pilot-Erhebung Pflege (Pilotbetrieb A)

Stand: 2026-11-03 · Branch `acc45/docs/pilot-erhebung` · Zieltermin Gesamtprodukt: 24.12.2026

**Zweck:** Erhebungsbogen für das Gespräch zwischen Betreiber und Pilotbetrieb A (Pflegebetrieb). Der Bogen wird im
Gespräch ausgefüllt. Er dient dazu, Dienstarten, Besetzungsregeln und Abläufe des Betriebs zu verstehen und daraus
synthetische Testdaten abzuleiten (siehe `PILOT-TESTSZENARIEN.md`).

**Regeln für das Ausfüllen (verbindlich):**

1. **Keine Personendaten.** Keine Namen, Geburtsdaten, Adressen, Kontaktdaten, Krankheits- oder Gesundheitsangaben,
   keine Bewohner-/Klientendaten. Nur Zahlen, Rollen, Regeln und Abläufe. Beispiele immer erfinden oder verallgemeinern.
2. **Keine Firmenkennung im Repository.** Der Bogen im Repository bleibt leer (Vorlage). Ausgefüllte Fassungen liegen
   außerhalb des öffentlichen Repositories (z. B. privat beim Betreiber) und nennen den Betrieb nur als „Pilot A".
3. **Keine Zugangsdaten, Hosts, IP-Adressen, Systembezeichnungen mit Mandantennamen.**
4. **Rechtliche Bezüge sind Fragen, keine Aussagen.** Wo eine Rechtsnorm genannt wird (z. B. § 113c SGB XI), fragt der
   Bogen, ob und wie der Betrieb damit umgeht. Das Dokument stellt nichts fest und gibt keine Rechtsauskunft.
5. **Schätzwerte kennzeichnen.** Bei jeder Zahl: gemessen (G), geschätzt (S) oder unbekannt (U).
6. **Offene Antworten sind zulässig.** „Weiß ich nicht" und „gibt es nicht" sind gültige Antworten und werden notiert.

Ausfüllhilfe: Feld „Antwort" im Gespräch ausfüllen, Feld „G/S/U" wie oben, Feld „Folge" für Anmerkungen zur Verwendung
(Testdaten, Modul, Rückfrage).

Bezug zum Produkt: Pflege-Paket aus `BRANCHENPAKETE-STRATEGIE.md` (Abschnitt A.2, D.2; Branch
`acc45/docs/branchenpakete-strategie`, noch nicht gemergt) und `WP19-MODULPLAN.md` (Module `bereichsplan` = WP-19.4,
`pflegequal` = WP-19.5). Beide Module sind laut `work-packages.json` noch nicht einschaltbar; der Erhebungsbogen
prüft, was der Betrieb tatsächlich braucht, nicht, was bereits fertig ist.

---

## 0. Kopfdaten

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 0.1 | Gesprächsdatum, Teilnehmende (nur Rollen, keine Namen) | | | |
| 0.2 | Versorgungsform (stationär, ambulant, teilstationär, gemischt)? | | | |
| 0.3 | Gibt es einen Betriebsrat oder eine Mitarbeitervertretung? Wer entscheidet über Einführung von Zeiterfassung und Planungssoftware? | | | |
| 0.4 | Welche Rolle hat die auskunftgebende Person (Pflegedienstleitung, Einrichtungsleitung, Verwaltung)? | | | |
| 0.5 | Gewünschter Pilotzeitraum und Ansprechpartner-Rolle für Rückfragen | | | |

## 1. Beschäftigte und Standorte

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 1.1 | Wie viele Beschäftigte werden in der Dienstplanung geführt (nur Zahl)? | | | |
| 1.2 | Davon: Vollzeit / Teilzeit / geringfügig / Aushilfe / Leiharbeit (Zahlen)? | | | |
| 1.3 | Wie viele Standorte, Einrichtungen, Wohnbereiche, Wohnbereiche je Standort? | | | |
| 1.4 | Gibt es einen Springer-Pool oder einen Pool über Standorte hinweg? Wie groß? | | | |
| 1.5 | Werden Auszubildende, Praktikantinnen/Praktikanten oder Ehrenamtliche mitgeplant? | | | |
| 1.6 | Wer plant (Rollen), wie viele Personen planen je Wohnbereich? | | | |
| 1.7 | Wer vertritt die Planung bei Abwesenheit? | | | |
| 1.8 | Fluktuation: Wie oft ändert sich der Personalstamm (grob je Quartal)? | | | |

## 2. Schichtmodelle und Dienstarten

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 2.1 | Welche Dienstarten gibt es (z. B. Früh, Spät, Nacht, geteilt, Bereitschaft)? Je Dienstart: Beginn, Ende, Pausenregel | | | |
| 2.2 | Gibt es geteilte Dienste (zwei Abschnitte)? Wie oft, für welche Gruppen? | | | |
| 2.3 | Rufbereitschaft oder Bereitschaftsdienst vorhanden? Wie wird die Inanspruchnahme erfasst? | | | |
| 2.4 | Wochenend- und Feiertagsregeln (Wunschfrei, Wechsel, Mindestanzahl freier Wochenenden)? | | | |
| 2.5 | Rotation (feste Schichtgruppen, Wechselmodell) oder freie Einzelplanung? | | | |
| 2.6 | Planungszeitraum (Woche, vier Wochen, Monat) und Vorlauf bis zur Veröffentlichung? | | | |
| 2.7 | Zeitkonten: Wie werden Plus-/Minusstunden geführt, gibt es Ausgleichszeiträume? | | | |
| 2.8 | Welcher Tarif- oder Vertragsrahmen gilt (nur Bezeichnung, z. B. Tarifwerk, kirchliche Regelung, Haustarif)? | | | |
| 2.9 | Welche Arbeitszeitregeln beachtet der Betrieb aktiv (Ruhezeit, Höchstarbeitszeit, Wechselschicht)? Woher kommen sie? | | | |

## 3. Qualifikationen

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 3.1 | Welche Qualifikationsstufen unterscheidet der Betrieb im Dienstplan (Fachkraft, Assistenz, Betreuung, Praxisanleitung, Leitung)? | | | |
| 3.2 | Welche Qualifikationen laufen ab und müssen überwacht werden (z. B. Unterweisungen, Fortbildungen, Erste Hilfe)? Mit welchem Intervall? | | | |
| 3.3 | Gibt es Qualifikationen, ohne die eine Aufgabe nicht übernommen werden darf (z. B. Medikamentengabe, Wundversorgung, Betäubungsmittel)? Wie ist das intern geregelt? | | | |
| 3.4 | Werden Betreuungskräfte (z. B. nach § 43b SGB XI) getrennt von Fachkräften geführt? Frage: Wie wird das heute getrennt? | | | |
| 3.5 | Wer pflegt die Qualifikationsstände, wie oft, in welchem System? | | | |
| 3.6 | Wie viele Personen haben mehrere Qualifikationsstufen oder Sonderrollen (Schichtleitung, Hygienebeauftragte)? | | | |

## 4. Besetzungsregeln

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 4.1 | Mindestbesetzung je Wohnbereich, Dienstart und Wochentag (Zahlen)? | | | |
| 4.2 | Welche Mindestanteile an Fachkräften gelten intern oder vertraglich? Frage: Woher stammt die Vorgabe (Heimaufsicht, Vertrag, interne Regel)? | | | |
| 4.3 | **Fachkraftquote:** Wird sie je Schicht, je Tag oder je Monat betrachtet? Wer prüft sie, wie oft, womit? | | | |
| 4.4 | **Bereichsplan:** Wird einer Person je Dienst ein Bereich/Wohnbereich/Tour zugeordnet? Wann (vorab im Plan oder zu Schichtbeginn)? | | | |
| 4.5 | **§ 113c SGB XI (Personalbemessung):** Frage an den Betrieb: Spielt der Bezug zu § 113c für die Planung oder für Nachweise eine Rolle? Welche Nachweise oder Auswertungen werden von Heimaufsicht, Kostenträgern oder Verbänden verlangt? (Es wird nichts unterstellt; Antwort „nicht relevant" ist zulässig.) | | | |
| 4.6 | Gibt es Nachtbesetzungsregeln (Mindestzahl, Mindestqualifikation)? | | | |
| 4.7 | Wie wird Unterbesetzung heute dokumentiert (Begründung, Meldung an Leitung/Aufsicht)? | | | |
| 4.8 | Welche Meldewege gibt es bei Unterschreitung (Rufbereitschaft, Springer, Leitung)? | | | |
| 4.9 | Welche Pausen- oder Ruhezeitregeln erzeugen in der Praxis die meisten Konflikte? | | | |

## 5. Bisherige Software, Excel, Papier

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 5.1 | Womit wird heute geplant (Tabellenblatt, Papier, Fachsoftware, Tafel)? Nur Produktkategorie, kein Produktname nötig | | | |
| 5.2 | Womit wird die Zeit erfasst (Stempeluhr, App, Handzettel, gar nicht)? | | | |
| 5.3 | Welche Dateien/Berichte entstehen monatlich und von wem? (Aufbau beschreiben, keine echten Dateien weitergeben) | | | |
| 5.4 | Welche Teile des heutigen Ablaufs sind verlässlich, welche fehleranfällig? | | | |
| 5.5 | Gibt es Wissen nur in Köpfen oder in Excel-Formeln, das beim Wechsel verloren ginge? | | | |
| 5.6 | Was soll aus dem Altsystem mitgenommen werden (Stammdaten, Qualifikationen, Zeitkontenstände)? Was ausdrücklich nicht? | | | |
| 5.7 | Sollen Altdaten importiert werden? Wenn ja: nur anonymisiert (siehe `PILOT-DATENSCHUTZ-RAHMEN.md`) | | | |

## 6. Typische Ausfälle und Umplanungen

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 6.1 | Wie viele kurzfristige Ausfälle (Krankheit, Kind krank) pro Woche und Wohnbereich (grob)? | | | |
| 6.2 | Wann erfährt die Leitung vom Ausfall (Uhrzeit-Spanne) und über welchen Kanal? | | | |
| 6.3 | Reihenfolge der Ersatzsuche: Wer wird zuerst gefragt (Springer, Teilzeit mit Wunsch, Rufbereitschaft, Leiharbeit)? | | | |
| 6.4 | Wie lange dauert es im Durchschnitt von der Ausfallmeldung bis zur bestätigten Ersatzbesetzung? (Basis für Kennzahl P1) | | | |
| 6.5 | Wie viele Telefonate/Nachrichten sind dafür typischerweise nötig? | | | |
| 6.6 | Welche Hürden gibt es bei der Ersatzsuche (Ruhezeit, Qualifikation, Höchstarbeitszeit, Wunschfrei)? | | | |
| 6.7 | Werden Diensttausche zwischen Beschäftigten erlaubt? Wer genehmigt, wie schnell? | | | |
| 6.8 | Wie wird das Einspringen vergütet oder ausgeglichen (nur Verfahren, keine Beträge)? | | | |
| 6.9 | Welche Umplanungen passieren nach Veröffentlichung des Plans, und wie werden Betroffene informiert? | | | |

## 7. Arbeitsabläufe und Exporte

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 7.1 | Ablauf von der Planerstellung bis zur Veröffentlichung (Schritte, Rollen, Dauer) | | | |
| 7.2 | Ablauf Monatsabschluss: Wer prüft Zeiten, korrigiert, gibt frei, übergibt an die Lohnabrechnung? Dauer? (Basis für Kennzahl P2) | | | |
| 7.3 | Lohnexport: Welches Format erwartet die Lohnabrechnung (Dateiart, Spalten in Worten, Lohnart-Schlüssel nur als Bezeichnung)? Interne oder externe Abrechnung? | | | |
| 7.4 | Welche Nachweise gehen an externe Stellen (Heimaufsicht, Kostenträger, Medizinischer Dienst)? In welcher Form und welchem Rhythmus? | | | |
| 7.5 | Welche Auswertungen braucht die Leitung regelmäßig (Besetzungsübersicht, Überstunden, Krankenstand-Zähler ohne Personenbezug)? | | | |
| 7.6 | Übergabe zwischen Schichten: Wie wird sie dokumentiert (Papier, Software, mündlich)? | | | |
| 7.7 | Wer darf was sehen? Welche Sichten sind betrieblich unerwünscht (z. B. Gesundheitsangaben für Planung)? | | | |
| 7.8 | Gibt es Fristen im Jahr, an denen Auswertungen fällig sind? | | | |

## 8. Mobile Nutzung

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 8.1 | Welche Geräte nutzen die Beschäftigten (privates Smartphone, Dienstgerät, keines)? Anteile grob | | | |
| 8.2 | Betriebssysteme (Android, iOS, ältere Geräte)? | | | |
| 8.3 | Netzabdeckung in den Einrichtungen (Keller, Wohnbereiche, ambulante Touren ohne Empfang)? Folge für Offline-Stempeln | | | |
| 8.4 | Wo soll gestempelt werden (Eingang, Wohnbereich, Tour, Fahrzeug)? Gibt es ein Tablet am Standort? | | | |
| 8.5 | Ist die private Nutzung dienstlicher Software auf dem eigenen Gerät betrieblich erlaubt? Wie ist die Abstimmung mit Vertretung/Betriebsrat? | | | |
| 8.6 | Wer braucht Push- oder Mailbenachrichtigung (Ausfälle, Planänderungen), wer ausdrücklich nicht? | | | |
| 8.7 | Sprachen und Lesefähigkeit der Beschäftigten (Bedarf an einfacher Sprache, weiteren Sprachen)? | | | |

## 9. Pilot-Kennzahlen (aus der Strategie, Abschnitt D.2)

Gemeinsame Regeln: Basismessung 2 bis 4 Wochen **vor** Aktivierung, Schwelle für „Erfolg" legen Betrieb und Betreiber
**vor Pilotbeginn** gemeinsam fest. Das Dokument nennt keine Zahl. Verfehlen ist ein zulässiges Ergebnis. Gemessen wird der
Vorgang, nicht die Person: keine Namen, kein Verlauf je Person, Zähler je Betrieb und Monat, Mindestgruppe 3. Die
Einführung der Messung ist mit der Mitbestimmung des Betriebs zu klären.

| Kennzahl | Definition | Basismessung heute (Messmethode, Zeitraum) | Messort/Verantwortung (Rolle) | Schwelle (vorab vereinbart) |
|---|---|---|---|---|
| **P1** Zeitaufwand Tagesbesetzung/Ausfallersatz | Minuten von Ausfallmeldung bis bestätigter Ersatzbesetzung je Ausfall; Zeit der Bereichsverteilung je Schicht | | | |
| **P2** Manuelle Korrekturen/Übertragungen | Zahl nachträglicher Bereichsänderungen und Papier-/Tabellenübertragungen je Woche | | | |
| **P3** Vollständigkeit Besetzungsnachweis | Anteil der Dienste mit nachgewiesener Qualifikationsbesetzung oder begründeter Unterdeckung | | | |

Rückfragen zur Messung:

| Nr | Frage | Antwort | G/S/U | Folge |
|---|---|---|---|---|
| 9.1 | Wer stoppt und protokolliert die Basismessung (Rolle), mit welchem Bogen? | | | |
| 9.2 | Sind Stoppuhrmessungen im Betrieb mitbestimmungsrelevant? Wer klärt das? | | | |
| 9.3 | Welche Zahl wäre für den Betrieb ein spürbarer Nutzen (Hypothese, keine Zusage)? | | | |
| 9.4 | Was wäre ein Abbruchkriterium für den Pilot? | | | |

## 10. Abschluss des Gesprächs

| Nr | Frage | Antwort |
|---|---|---|
| 10.1 | Was ist der größte Schmerzpunkt heute (ein Satz)? | |
| 10.2 | Was darf das neue System auf keinen Fall verschlechtern? | |
| 10.3 | Welche Szenarien aus `PILOT-TESTSZENARIEN.md` (PS-P-nn) sollen als erste gemeinsam durchgespielt werden? | |
| 10.4 | Offene Fragen an den Betreiber / an den Betrieb | |

## Ableitung für Testdaten (vom Betreiber nach dem Gespräch auszufüllen, ohne Personendaten)

| Parameter | Wert |
|---|---|
| Anzahl synthetischer Beschäftigter | |
| Anzahl Wohnbereiche | |
| Dienstarten (Kürzel, Zeiten) | |
| Qualifikationsstufen (Kürzel) | |
| Mindestbesetzung je Wohnbereich und Dienstart | |
| Typische Ausfallquote je Woche | |
