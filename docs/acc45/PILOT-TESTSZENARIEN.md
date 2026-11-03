# Pilot-Testszenarien (Pflege und Sicherheitsdienst)

Stand: 2026-11-03 · Branch `acc45/docs/pilot-erhebung` · Zieltermin Gesamtprodukt: 24.12.2026

**Zweck:** Reproduzierbare Szenarien für die beiden Pilotbetriebe (A = Pflege, B = Sicherheitsdienst) als Design- und
Testpartner. Alle Ausgangsdaten sind **synthetisch** und erfunden. Sie enthalten keine Personen-, Firmen-, Objekt- oder
Bewohnerdaten und sind keine Abbildung der echten Betriebe. Die Szenarien ändern keinen Produktcode und laufen
ausschließlich gegen Demo-/Testmandanten, niemals gegen Produktion oder Echtdaten (siehe `PILOT-DATENSCHUTZ-RAHMEN.md`).

**Status der Aussagen:** Die „erwarteten Ergebnisse" beschreiben das **Sollverhalten laut den verlinkten Arbeitspaketen**.
Wo ein Szenario ein WP-19-Modul braucht (Spalte `Voraussetzung`), ist es erst ausführbar, wenn das Modul eingehängt und
einschaltbar ist (laut `work-packages.json` derzeit nicht der Fall). Bis dahin gelten diese Szenarien als **geplant**; sie
sind kein Nachweis, dass das Verhalten bereits besteht. Rechts- und Tarifwerte in den Daten sind **Platzhalter** und
keine geltenden Regeln.

Referenzen: `docs/acc45/work-packages.json` (WP-IDs), `WP19-MODULPLAN.md`, `WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`,
`BRANCHENPAKETE-STRATEGIE.md` (Branch `acc45/docs/branchenpakete-strategie`, noch nicht gemergt).

---

## Maschinenlesbarer Kopf

Spalten: `ID` (eindeutig, Muster `PS-P-nn` Pflege, `PS-S-nn` Sicherheit) · `Titel` · `Rolle` (Hauptrolle) · `WP`
(kommagetrennte WP-IDs aus `work-packages.json`) · `Kategorie` · `Voraussetzung` (`Kern` = mit Integrationsstand ausführbar,
sobald Testmandant vorhanden; `Modul:<WP>` = erst nach Freischaltung des Moduls; `Extern` = braucht externe Abnahme/Gerät) ·
`Status` (`geplant` bis zum ersten dokumentierten Lauf).

| ID | Titel | Rolle | WP | Kategorie | Voraussetzung | Status |
|---|---|---|---|---|---|---|
| PS-P-01 | Wochenplan mit Unterbesetzung erkennen | Planung | WP-22,WP-23 | Planung | Kern | geplant |
| PS-P-02 | Krankmeldung Frühdienst, Ersatzsuche mit Schutzprüfung | Planung | WP-11,WP-22 | Ausfall/Umplanung | Kern | geplant |
| PS-P-03 | Fachkraftquote in der Nacht unterschritten | Planung | WP-11,WP-19.5 | Besetzung | Modul:WP-19.5 | geplant |
| PS-P-04 | Bereichszuordnung je Dienst und Änderungsprotokoll | Schichtverantwortung | WP-19.4 | Besetzung | Modul:WP-19.4 | geplant |
| PS-P-05 | Planentwurf bleibt bis zur Freigabe unsichtbar | Mitarbeitende | WP-23 | Planung | Kern | geplant |
| PS-P-06 | Diensttausch verletzt Ruhezeitregel | Mitarbeitende | WP-11,WP-22 | Ausfall/Umplanung | Kern | geplant |
| PS-P-07 | Offline-Stempeln ohne Netz, Sync ohne Doppelbuchung | Mitarbeitende | WP-06,WP-07,WP-17 | Offline-Stempeln | Kern | geplant |
| PS-P-08 | Stempelkorrektur durch Antrag und Freigabe | Leitung | WP-06,WP-14 | Zeiterfassung | Kern | geplant |
| PS-P-09 | Monatsabschluss mit Pausenprüfung und Lohnexport | Leitung | WP-16,WP-16c | Monatsabschluss | Kern (WP-16 noch Review) | geplant |
| PS-P-10 | Geteilter Dienst mit zwei Stempelpaaren | Mitarbeitende | WP-19.7,WP-07 | Offline-Stempeln | Modul:WP-19.7 | geplant |
| PS-P-11 | Betriebsrat-Auswertung nur aggregiert, Mindestgruppe 3 | Betriebsrat | WP-27,WP-43 | Datenschutz | Kern | geplant |
| PS-P-12 | Besetzungsnachweis exportieren, Sichten je Rolle | Leitung | WP-26,WP-43,WP-19.4 | Export | Kern, teils Modul:WP-19.4 | geplant |
| PS-S-01 | Objekt mit Posten anlegen, Sollbesetzung | Planung | WP-19.1 | Planung | Modul:WP-19.1 | geplant |
| PS-S-02 | Posten ohne Mindestqualifikation besetzt: Hinweis, keine Sperre | Planung | WP-11,WP-19.1 | Besetzung | Modul:WP-19.1 | geplant |
| PS-S-03 | Ausfall Nachtposten (Alleinarbeit), Ersatz finden | Planung | WP-11,WP-22,WP-19.1 | Ausfall/Umplanung | Modul:WP-19.1 | geplant |
| PS-S-04 | Kurzfristiger Mehrbedarf des Auftraggebers, Umplanung nach Freigabe | Planung | WP-23,WP-22 | Ausfall/Umplanung | Kern | geplant |
| PS-S-05 | Offline-Stempeln auf Objekt ohne Netz, Sync | Mitarbeitende | WP-06,WP-07,WP-17 | Offline-Stempeln | Kern | geplant |
| PS-S-06 | Stempeln mit Ortsprüfung (Geofence) am Objekt | Mitarbeitende | WP-20,WP-29 | Zeiterfassung | Kern, Extern (Gerät, E-4) | geplant |
| PS-S-07 | Wachbuch-Eintrag, Nachtrag statt Überschreiben | Schichtverantwortung | WP-19.2 | Wachbuch | Modul:WP-19.2 | geplant |
| PS-S-08 | Wachbuch-Eintrag berichtigen/sperren durch Leitung mit Begründung | Leitung | WP-19.2 | Wachbuch | Modul:WP-19.2 | geplant |
| PS-S-09 | Objektbericht mit Soll, bestätigtem Ist und „ungeklärt" (PDF und CSV) | Leitung | WP-19.3,WP-06 | Export | Modul:WP-19.3 | geplant |
| PS-S-10 | Monatsabschluss mit Korrekturanträgen und Lohnexport | Leitung | WP-14,WP-16,WP-16c | Monatsabschluss | Kern (WP-16 noch Review) | geplant |
| PS-S-11 | Schichtverantwortung sieht nur eigenen Zuständigkeitsbereich | Schichtverantwortung | WP-43,WP-27 | Datenschutz | Kern | geplant |

Hinweis zur Zählung: Pflege 12 Szenarien (PS-P-01 bis PS-P-12), Sicherheit 11 Szenarien (PS-S-01 bis PS-S-11).

---

## Teil 0: Gemeinsame Vorbereitung und Regeln

**Mandant:** ausschließlich ein eigens angelegter Test-/Demomandant (Staging oder lokale Entwicklungsumgebung), nie
Produktion, nie mit Echtdaten. Keine Adressen oder Zugangsdaten in dieses Dokument schreiben.

**Zeitbezug:** Alle Tage relativ zu einer **Referenzwoche** (Tag 1 = Montag, Tag 7 = Sonntag, vier Wochen Vorlauf-Plan als
Ausgangsstand). Konkrete Kalenderdaten werden beim Lauf in der Testumgebung gesetzt und im Protokoll vermerkt.

**Rollenkonten (synthetisch):** je ein Testkonto mit den Rollen Mitarbeitende, Schichtverantwortung, Planung, Leitung,
Betriebsrat. Bezeichnung nur „Testkonto Planung" usw.

**Protokoll je Lauf:** Szenario-ID, Datum, Stand (Commit/Version der Testumgebung), Ergebnis (bestanden / abweichend /
blockiert), Abweichung in einem Satz, Verweis auf Beobachtung. Keine Screenshots mit echten Daten. Abweichungen werden als
Befund an das jeweilige WP gehängt, nicht still behoben.

**Grundregeln, die jedes Szenario mitprüft (nicht einzeln wiederholt):**

- Warnen statt sperren bleibt Grundsatz; eine Bestätigung macht Rechtswidriges nicht rechtmäßig (Produktentscheidung
  G5, Abschnitt 1 der Entscheidungen).
- Bestehende zwingende Sperren und Berechtigungsgrenzen werden nicht aufgeweicht.
- Rollen sehen nur, was die Rechtematrix vorsieht (`docs/RECHTEMATRIX.md`).

---

## Teil A: Synthetischer Datensatz Pflege („SD-P")

Alle Werte erfunden und rein illustrativ. Keine Abbildung einer echten Einrichtung. Pausen-/Ruhezeitwerte sind
**Testparameter**, keine Rechtsaussage.

| Element | Definition |
|---|---|
| Einrichtung | „Einrichtung P", 1 Standort, 3 Wohnbereiche `WB-A`, `WB-B`, `WB-C` |
| Beschäftigte | 24 Testpersonen `MA-P01` bis `MA-P24` (Anzeigename „Testperson P01" usw.) |
| Qualifikationen | `FK` Fachkraft (10 Personen), `AS` Assistenz (8), `BK` Betreuungskraft (4), `PA` Praxisanleitung (2, zusätzlich zu FK); je Person Ablaufdatum der Unterweisung `UW`, davon `MA-P09` abgelaufen (Referenzwoche Tag 0) |
| Dienstarten | `F` Früh 06:00 bis 14:30 (Pause 30 min), `S` Spät 13:30 bis 22:00 (Pause 30 min), `N` Nacht 21:30 bis 06:30 (Pause 45 min), `G` geteilt 06:00 bis 10:00 und 16:00 bis 20:00 |
| Mindestbesetzung (Testwerte) | je Wohnbereich: `F` 3 (davon mind. 1 FK), `S` 3 (davon mind. 1 FK), `N` 1 (alle drei Wohnbereiche zusammen mind. 2 FK in der Nacht) |
| Qualifikationsregel (Platzhalter) | Fachkraftanteil je Schicht mind. 50 Prozent (Testparameter, Status `provisional`, nicht als geltende Quote zu lesen) |
| Ruhezeit (Testparameter) | 11 Stunden zwischen Diensten |
| Rollenkonten | Testkonten Planung, Leitung, Schichtverantwortung `WB-A`, Betriebsrat, drei Mitarbeitende-Konten (`MA-P03`, `MA-P07`, `MA-P12`) |
| Ausgangsplan | vierwöchiger Plan, **freigegeben** für Wochen 1 bis 2, **Entwurf** für Wochen 3 bis 4; Wochenplan Tag 3 `WB-A` Frühdienst vollständig besetzt (`MA-P01` FK, `MA-P02` FK, `MA-P03` AS) |
| Abwesenheiten | `MA-P05` Urlaub Tag 3 bis Tag 5 (genehmigt); `MA-P08` Wunschfrei Tag 6 |
| Springer | `MA-P20`, `MA-P21`, `MA-P22` (FK/AS/AS), Springer-Pool |

---

### PS-P-01 Wochenplan mit Unterbesetzung erkennen

- **Rolle:** Planung · **WP:** WP-22, WP-23 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-P; Tag 4 `WB-B` Spätdienst: nur `MA-P10` (FK) und `MA-P11` (AS) eingeteilt (Soll 3).
- **Schritte:**
  1. Als Planung anmelden, Plan der Referenzwoche öffnen.
  2. Besetzungsübersicht/Lagebild für Tag 4 öffnen.
  3. Den Befund „unterbesetzt" für `WB-B` `S` ansehen.
  4. Dritte Person (`MA-P12`, AS) einteilen, Übersicht erneut ansehen.
- **Erwartet:** Schritt 3 zeigt eine Unterschreitung von 1 Person, Ursache nachvollziehbar (Soll 3, Ist 2). Nach Schritt 4
  verschwindet der Befund; die Fachkraftbedingung (mind. 1 FK) bleibt erfüllt.
- **Abgrenzung:** Keine automatische Sperre. Wird die Unterdeckung bewusst belassen, ist sie mit Begründung zu
  dokumentieren (dokumentierte Unterdeckung).

### PS-P-02 Krankmeldung Frühdienst, Ersatzsuche mit Schutzprüfung

- **Rolle:** Planung · **WP:** WP-11, WP-22 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-P; Tag 3 `WB-A` `F`: `MA-P01` (FK) meldet sich um 05:15 krank. `MA-P20` (Springer, FK) hat am Vortag
  `S` bis 22:00 gearbeitet (Ruhezeit-Konflikt für `F` 06:00). `MA-P21` (Springer, AS) frei. `MA-P22` (Springer, AS) frei.
- **Schritte:**
  1. Krankmeldung für `MA-P01` Tag 3 erfassen.
  2. Befund „unterbesetzt/keine Fachkraft" für `WB-A` `F` ansehen.
  3. Ersatzvorschläge öffnen.
  4. Versuchen, `MA-P20` einzuteilen.
  5. Danach `MA-P22` einteilen.
- **Erwartet:** Vorschlagsliste berücksichtigt Qualifikation und Ruhezeit; `MA-P20` ist mit Konflikt (Ruhezeit)
  gekennzeichnet, nicht stillschweigend ausgeschlossen. Der Server prüft die Einteilung nach (Schutzprüfung). Nach Schritt 4
  Warnung mit Bestätigungspflicht bzw. zwingende Sperre, je nach hinterlegter Regelart; die Bestätigung wird protokolliert
  (Zeit, Person, Regel). Nach Schritt 5 ist die Mindestbesetzung der Anzahl nach erfüllt, die Fachkraftbedingung bleibt als
  Befund sichtbar (keine FK im Dienst).
- **Messbezug:** Zeit von Schritt 1 bis bestätigter Ersatzbesetzung als Beispiel für Kennzahl P1 (nur Vorgang, nicht Person).

### PS-P-03 Fachkraftquote in der Nacht unterschritten

- **Rolle:** Planung · **WP:** WP-11, WP-19.5 · **Voraussetzung:** Modul:WP-19.5
- **Ausgangsdaten:** SD-P; Tag 2 Nacht: drei Wohnbereiche je 1 Person; eingeteilt `MA-P13` (FK), `MA-P14` (AS), `MA-P15` (BK).
  Testregel: mindestens 2 FK über alle Wohnbereiche (`provisional`).
- **Schritte:**
  1. Nachtbesetzung Tag 2 prüfen.
  2. Modul Pflegequalifikation einschalten (durch Leitung/Organisationsadministration, G2).
  3. Befund zur Fachkraftbesetzung ansehen.
  4. `MA-P14` durch `MA-P16` (FK) ersetzen.
- **Erwartet:** Vor Schritt 2: Verhalten wie im Kern (Quote nach Paketlage; **Soll gemäß Strategie: Quote darf nicht hinter
  einem Paket verschwinden**, Befund im Ergebnisprotokoll vermerken). Nach Schritt 3: Befund mit Regel-ID, Status
  „provisional", Hinweis statt Sperre; Anzeige nennt keine Rechtsaussage. Nach Schritt 4: Befund entfällt.
- **Rückfrage an Pilot A:** Welche Quote gilt wirklich (siehe `PILOT-ERHEBUNG-PFLEGE.md`, 4.2/4.3), woher stammt sie?

### PS-P-04 Bereichszuordnung je Dienst und Änderungsprotokoll

- **Rolle:** Schichtverantwortung · **WP:** WP-19.4 · **Voraussetzung:** Modul:WP-19.4
- **Ausgangsdaten:** SD-P; Tag 5 `F`: sechs Personen eingeteilt, Bereiche `WB-A` bis `WB-C` je 2 Personen laut Soll.
  `MA-P05` fehlt (Urlaub).
- **Schritte:**
  1. Als Schichtverantwortung `WB-A` anmelden, Bereichsplan Tag 5 öffnen.
  2. Eine Person von `WB-B` nach `WB-A` verschieben.
  3. Änderungsprotokoll ansehen.
  4. Als Mitarbeitende (`MA-P12`) anmelden und die eigene Zuordnung ansehen.
- **Erwartet:** Schritt 2 nur im Zuständigkeitsbereich erlaubt; Soll je Bereich wird neu bewertet. Schritt 3: Änderung mit
  Zeit, Rolle und Grund nachvollziehbar. Schritt 4: nur die eigene Zuordnung sichtbar, keine Angaben zu anderen Personen
  jenseits des Notwendigen (Rechtematrix).

### PS-P-05 Planentwurf bleibt bis zur Freigabe unsichtbar

- **Rolle:** Mitarbeitende · **WP:** WP-23 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-P; Wochen 3 und 4 als Entwurf; Wochen 1 und 2 freigegeben.
- **Schritte:**
  1. Als `MA-P03` anmelden, Plan ansehen und Kalender-Feed aufrufen.
  2. Als Planung einen Dienst in Woche 3 ändern (Entwurf).
  3. Als `MA-P03` erneut ansehen.
  4. Als Planung Woche 3 freigeben.
  5. Als `MA-P03` erneut ansehen.
- **Erwartet:** Schritte 1 und 3: Wochen 3 und 4 sind für Mitarbeitende nicht sichtbar, auch nicht im Feed. Nach Schritt 4
  werden nur freigegebene Wochen ausgeliefert.

### PS-P-06 Diensttausch verletzt Ruhezeitregel

- **Rolle:** Mitarbeitende · **WP:** WP-11, WP-22 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-P; `MA-P03` hat Tag 2 `S` bis 22:00; Tag 3 `F` ab 06:00 wäre bei Tausch mit `MA-P07` nötig (Ruhezeit
  8 Stunden, Testparameter 11).
- **Schritte:**
  1. Als `MA-P03` Tausch Tag 3 `F` von `MA-P07` anfragen.
  2. Als `MA-P07` zustimmen.
  3. Als Planung den Tausch prüfen.
- **Erwartet:** Der Konflikt wird vor der Bestätigung angezeigt; der Server prüft nach. Je nach Regelart Warnung mit
  Bestätigung oder Sperre. Die Entscheidung (wer, wann, welche Regel) ist protokolliert. Keine stillschweigende Annahme.

### PS-P-07 Offline-Stempeln ohne Netz, Sync ohne Doppelbuchung

- **Rolle:** Mitarbeitende · **WP:** WP-06, WP-07, WP-17 · **Voraussetzung:** Kern (Gerätetest E-2/E-3/E-6 extern)
- **Ausgangsdaten:** SD-P; `MA-P07` hat Tag 3 `F` laut Plan; Testgerät mit installierter PWA.
- **Schritte:**
  1. Netz am Testgerät abschalten (Flugmodus).
  2. Einstempeln um Dienstbeginn, später Ausstempeln.
  3. Beide Ereignisse als „wartend" kontrollieren.
  4. Netz einschalten, Synchronisierung abwarten.
  5. Die gleiche Synchronisierung erneut auslösen (z. B. App schließen und öffnen).
- **Erwartet:** Ereignisse behalten ihren Erfassungszeitpunkt; nach Sync genau ein Einstempeln und ein Ausstempeln
  (Idempotenz über Ereignis-Kennung); Wiederholung erzeugt keine Dopplung; Originalereignisse sind unveränderlich.
  Bei Serverfehler nach Speicherung ist Wiederholung ohne Dopplung möglich (Sonderfall siehe WP-07b, noch offen).

### PS-P-08 Stempelkorrektur durch Antrag und Freigabe

- **Rolle:** Leitung · **WP:** WP-06, WP-14 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-P; `MA-P07` hat Tag 3 `F` eingestempelt 06:40 (vergessen früher), tatsächlicher Beginn 06:00.
- **Schritte:**
  1. Als `MA-P07` Korrekturantrag mit Begründung stellen (Beginn 06:00).
  2. Als Leitung den Antrag ansehen und freigeben.
  3. Zeitnachweis des Tages ansehen.
  4. Original-Stempelereignis ansehen.
- **Erwartet:** Das Original bleibt unverändert; die Korrektur steht als eigenes Ereignis mit Antragsteller, Freigeber,
  Zeit und Begründung. Ist-Zeiten im Nachweis nutzen die korrigierte Zeit. Ohne Berechtigung (z. B. als `MA-P12`) kann der
  Antrag nicht bearbeitet werden.

### PS-P-09 Monatsabschluss mit Pausenprüfung und Lohnexport

- **Rolle:** Leitung · **WP:** WP-16, WP-16c · **Voraussetzung:** Kern (WP-16 noch in Review, nicht integriert)
- **Ausgangsdaten:** SD-P; Monat mit 4 Wochen Plan; ein Dienst mit zu kurzer Pause (Ist 15 min bei Soll 30), ein Dienst
  ohne Ausstempeln, zwei offene Korrekturanträge.
- **Schritte:**
  1. Monatsabschluss starten.
  2. Offene Punkte (Pause, fehlendes Ausstempeln, offene Anträge) ansehen und abarbeiten.
  3. Abschluss bestätigen.
  4. Lohnexport erzeugen.
  5. Nach Export ein Stempelereignis nachträglich ändern wollen.
- **Erwartet:** Abschluss lässt sich nicht still mit offenen Prüffällen beenden (Prüffälle sichtbar, Entscheidung
  protokolliert). Der Export enthält nur abgeschlossene Zeiten. Schritt 5: Änderung nur über Korrekturrevision mit
  Differenz und Korrekturexport (WP-16c, derzeit blockiert; Szenario bis dahin nur bis Schritt 4 ausführbar).
- **Rückfrage an Pilot A:** Welches Exportformat verlangt die Lohnabrechnung (siehe `PILOT-ERHEBUNG-PFLEGE.md`, 7.3)?

### PS-P-10 Geteilter Dienst mit zwei Stempelpaaren

- **Rolle:** Mitarbeitende · **WP:** WP-19.7, WP-07 · **Voraussetzung:** Modul:WP-19.7
- **Ausgangsdaten:** SD-P; `MA-P18` Tag 4 `G` (06:00 bis 10:00, 16:00 bis 20:00).
- **Schritte:**
  1. Modul geteilter Dienst einschalten.
  2. Als `MA-P18` zum ersten Abschnitt ein- und ausstempeln, zum zweiten ein- und ausstempeln (ein Paket offline).
  3. Tagesnachweis ansehen.
- **Erwartet:** Zwei getrennte Zeitabschnitte, Pause dazwischen nicht als Arbeitszeit; Gesamtzeit korrekt; Offline-Paket
  wird einmalig synchronisiert. Hinweis: Stempelpfade dürfen nicht doppelt belegt werden (nur ein Paket gleichzeitig laut
  Strategie, Abschnitt A.4).

### PS-P-11 Betriebsrat-Auswertung nur aggregiert, Mindestgruppe 3

- **Rolle:** Betriebsrat · **WP:** WP-27, WP-43 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-P; Auswertungszeitraum Referenzmonat; eine Gruppe mit 2 Personen, eine mit 5 Personen.
- **Schritte:**
  1. Als Testkonto Betriebsrat Auswertung öffnen.
  2. Zahlen für die Gruppe mit 5 Personen ansehen.
  3. Zahlen für die Gruppe mit 2 Personen ansehen.
  4. Versuchen, Einzelstempel oder Einzelpläne aufzurufen.
- **Erwartet:** Gruppe 5: Aggregate. Gruppe 2: unterdrückt (Mindestgruppe 3). Kein Zugriff auf Einzelstempel oder
  personenbezogene Zeiten; Abfrage wird abgewiesen, nicht leer angezeigt.

### PS-P-12 Besetzungsnachweis exportieren, Sichten je Rolle

- **Rolle:** Leitung · **WP:** WP-26, WP-43, WP-19.4 · **Voraussetzung:** Kern, teils Modul:WP-19.4
- **Ausgangsdaten:** SD-P; Referenzmonat mit einer dokumentierten Unterdeckung und einer Warnbestätigung.
- **Schritte:**
  1. Als Leitung Besetzungs-/Leistungsnachweis für den Monat exportieren.
  2. Inhalt prüfen (Soll, Ist, Unterdeckung mit Begründung, ohne Namen, soweit Datenschutzfilter).
  3. Gleichen Export als Planung und als Schichtverantwortung versuchen.
  4. Auskunftsexport (Art. 15 DSGVO) für ein Testkonto auslösen.
  5. Mit Bereichsplan: Nachweis je Bereich und Dienst ansehen.
- **Erwartet:** Export nur mit Berechtigung; Inhalt entspricht der Rolle; keine Daten außerhalb des Zuständigkeitsbereichs.
  Auskunftsexport enthält nur Daten des Testkontos. Schritt 5 nur, wenn das Modul Bereichsplan eingehängt ist.

---

## Teil B: Synthetischer Datensatz Sicherheitsdienst („SD-S")

Alle Werte erfunden. Qualifikationsbezeichnungen sind **neutrale Platzhalter** und geben keine gesetzlichen Inhalte
wieder; welche Nachweise im Betrieb tatsächlich gelten, ist Gegenstand der Erhebung (`PILOT-ERHEBUNG-SICHERHEIT.md`, 3.1).

| Element | Definition |
|---|---|
| Unternehmen | „Unternehmen S", 1 Standort |
| Beschäftigte | 16 Testpersonen `MA-S01` bis `MA-S16` (Anzeigename „Testperson S01" usw.) |
| Qualifikationen (Platzhalter) | `QS-1` Grundnachweis (14 Personen), `QS-2` erweiterter Nachweis (5 Personen), `ER` Ersthelfer (6), `BS` Brandschutzhelfer (4); `MA-S12` ohne `QS-1` (in Einarbeitung), `MA-S07` `ER` abgelaufen |
| Objekte | `OBJ-1` Handel (Tagdienst, Posten `P1-Eingang`, `P1-Streife`), `OBJ-2` Baustelle (nachts, Posten `P2-Tor`, **Alleinarbeit-Merkmal**), `OBJ-3` Veranstaltung (einmalig, 6 Posten `P3-A` bis `P3-F`) |
| Dienstarten | `T` Tag 07:00 bis 19:00 (Pause 30 min), `N` Nacht 19:00 bis 07:00 (Pause 30 min), `V` Veranstaltung 16:00 bis 02:00 (Pause 30 min); alle 12-h-Dienste; Werte Testparameter |
| Sollbesetzung (Testwerte) | `OBJ-1`: `P1-Eingang` 1, `P1-Streife` 1 (mind. `QS-1`); `OBJ-2` nachts: `P2-Tor` 1 (`QS-1`, Alleinarbeit); `OBJ-3`: je Posten 1, `P3-A` mit `QS-2` |
| Ruhezeit (Testparameter) | 11 Stunden |
| Rollenkonten | Testkonten Planung (Disposition), Leitung, Schichtverantwortung `OBJ-1`, Betriebsrat (synthetisch, auch wenn der echte Betrieb keinen hat), drei Mitarbeitende-Konten (`MA-S02`, `MA-S05`, `MA-S09`) |
| Ausgangsplan | zweiwöchiger Plan, Woche 1 freigegeben, Woche 2 Entwurf |
| Reserve | `MA-S14`, `MA-S15`, `MA-S16` (Reservepool, `MA-S16` mit `QS-2`) |

---

### PS-S-01 Objekt mit Posten anlegen, Sollbesetzung

- **Rolle:** Planung · **WP:** WP-19.1 · **Voraussetzung:** Modul:WP-19.1
- **Ausgangsdaten:** SD-S; Objekt `OBJ-1` noch nicht angelegt.
- **Schritte:**
  1. Modul Posten durch Leitung einschalten.
  2. `OBJ-1` als Objekt anlegen, Typ Handel, Posten `P1-Eingang` und `P1-Streife` mit Sollbesetzung.
  3. Dienstart `T` für beide Posten zuordnen, Personen für Tag 1 einteilen.
  4. Bestehende Posten-Dienstarten des Betriebs prüfen.
- **Erwartet:** Objekt ist eigener Datensatz mit mehreren Posten; Objekt ist nicht automatisch Geo-Einsatzort (Produkt-
  entscheidung P1). Bestehende Posten-Dienstarten bleiben unverändert verfügbar (G10). Ohne Einschalten ist das Modul nicht
  wirksam (G1).

### PS-S-02 Posten ohne Mindestqualifikation besetzt: Hinweis, keine Sperre

- **Rolle:** Planung · **WP:** WP-11, WP-19.1 · **Voraussetzung:** Modul:WP-19.1
- **Ausgangsdaten:** SD-S; `P1-Streife` Tag 2 `T` verlangt `QS-1`; `MA-S12` (ohne `QS-1`) wird eingeteilt.
- **Schritte:**
  1. `MA-S12` auf `P1-Streife` einteilen.
  2. Hinweis ansehen.
  3. Hinweis bestätigen (Begründung eintragen).
  4. Bestätigungsprotokoll ansehen.
- **Erwartet:** Nachvollziehbarer Hinweis mit Regel-ID und Status „provisional" (Produktentscheidung P3); Einteilung nicht
  automatisch gesperrt, soweit keine zwingende Rechtsgrenze greift (G5); Bestätigung protokolliert (Zeit, Person, Regel).
  Keine Aussage, dass die Einteilung zulässig sei.
- **Rückfrage an Pilot B:** Welche Nachweise sind betrieblich/vertraglich Voraussetzung (Erhebung 3.1)?

### PS-S-03 Ausfall Nachtposten (Alleinarbeit), Ersatz finden

- **Rolle:** Planung · **WP:** WP-11, WP-22, WP-19.1 · **Voraussetzung:** Modul:WP-19.1
- **Ausgangsdaten:** SD-S; `OBJ-2` Tag 3 `N`: `MA-S03` (`QS-1`) meldet sich um 16:00 krank. Reserve: `MA-S14` (`QS-1`, hat Tag 3
  `T` bis 19:00 gearbeitet, 12 h Dienst, Ruhezeit-Konflikt), `MA-S15` (`QS-1`, frei), `MA-S16` (`QS-2`, frei).
- **Schritte:**
  1. Ausfall `MA-S03` erfassen.
  2. Befund „Posten unbesetzt, Alleinarbeit" ansehen.
  3. Ersatzvorschläge öffnen; `MA-S14` versuchen.
  4. `MA-S15` einteilen.
- **Erwartet:** Befund nennt Alleinarbeit-Merkmal und hinterlegten Hinweis auf Schutzanforderungen, ohne zu behaupten, dass
  eine bestimmte Schutzausrüstung rechtlich zwingend sei (Produktentscheidung P4). `MA-S14` mit Ruhezeitkonflikt markiert.
  `MA-S15` erfüllt Sollbesetzung und Qualifikation; Befund entfällt.
- **Messbezug:** Zeit bis bestätigter Ersatzbesetzung (nur Vorgang).

### PS-S-04 Kurzfristiger Mehrbedarf des Auftraggebers, Umplanung nach Freigabe

- **Rolle:** Planung · **WP:** WP-23, WP-22 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-S; Woche 1 freigegeben; Auftraggeber meldet für Tag 5 zusätzlichen Posten (Nachtdienst) auf `OBJ-1`
  (als offene Schicht).
- **Schritte:**
  1. Offene Schicht Tag 5 `N` anlegen.
  2. Änderung nach Freigabe als Planänderung kenntlich machen/erneut freigeben.
  3. Als `MA-S05` die Offene Schicht ansehen und annehmen (Selbstplanung).
  4. Server-seitige Prüfung (Ruhezeit, Qualifikation) beobachten.
- **Erwartet:** Planänderung nach Freigabe ist nachvollziehbar (Planstand/Freigabe); Beschäftigte sehen nur freigegebene
  Stände; Annahme wird geprüft (Ruhezeit/Qualifikation) und ggf. mit Hinweis oder Sperre beantwortet.

### PS-S-05 Offline-Stempeln auf Objekt ohne Netz, Sync

- **Rolle:** Mitarbeitende · **WP:** WP-06, WP-07, WP-17 · **Voraussetzung:** Kern (Gerätetest extern, E-2/E-3/E-6)
- **Ausgangsdaten:** SD-S; `MA-S02` Tag 1 `N` auf `OBJ-2` (Baustelle, kein Netz auf dem Gelände).
- **Schritte:**
  1. Offline einstempeln beim Dienstbeginn; Gerät später ins Netz bringen.
  2. Offline ausstempeln beim Dienstende; Netz.
  3. Synchronisierung auslösen, danach erneut.
  4. Zeitnachweis ansehen.
- **Erwartet:** Erfassungszeitpunkte erhalten; ein Ein- und ein Ausstempeln; keine Dopplung bei Wiederholung; Original
  unveränderlich. Sync-Verzögerung beeinflusst nicht die Reihenfolge.

### PS-S-06 Stempeln mit Ortsprüfung (Geofence) am Objekt

- **Rolle:** Mitarbeitende · **WP:** WP-20, WP-29 · **Voraussetzung:** Kern; Gerät/Ort extern (E-4)
- **Ausgangsdaten:** SD-S; Leitung hat für `OBJ-1` einen synthetischen Einsatzort mit Radius und Modus (Warnung) eingestellt
  (Koordinaten nur aus einem Testort, keine echte Objektadresse).
- **Schritte:**
  1. Als Leitung Ortsprüfung für `OBJ-1` einschalten (Modus Warnung).
  2. Als `MA-S02` innerhalb des Radius einstempeln.
  3. Als `MA-S05` außerhalb des Radius einstempeln.
  4. Ergebnis als Leitung ansehen.
- **Erwartet:** Innerhalb: unauffällig. Außerhalb: Hinweis/Kennzeichnung gemäß Modus, kein stilles Verwerfen. Es werden keine
  Bewegungsprofile gespeichert, nur das Prüfergebnis zum Stempelzeitpunkt (Datenschutzgrenzen WP-20/29). Einschalten ist
  Leitungsentscheidung; Beteiligung der Beschäftigten ist betrieblich zu klären (nicht Teil des Tests).

### PS-S-07 Wachbuch-Eintrag, Nachtrag statt Überschreiben

- **Rolle:** Schichtverantwortung · **WP:** WP-19.2 · **Voraussetzung:** Modul:WP-19.2
- **Ausgangsdaten:** SD-S; `OBJ-1` Tag 2 `T`; Wachbuch eingeschaltet (Mitbestimmungsvoraussetzungen als geklärt bestätigt,
  protokolliert, G6).
- **Schritte:**
  1. Als Schichtverantwortung `OBJ-1` Eintrag „Rundgang 10:00 ohne Befund" (Ereignisart Kontrollgang) anlegen.
  2. Fehler bemerken: Uhrzeit war 10:30. Nachtrag erfassen.
  3. Versuchen, den Originaleintrag zu überschreiben.
  4. Als Mitarbeitende (`MA-S09`) eigene Einträge ansehen.
- **Erwartet:** Originaleintrag bleibt; Nachtrag verweist darauf; Überschreiben nicht möglich. Mitarbeitende sehen nur
  ihre eigenen Einträge ohne Offenlegung über andere Personen (W4). Aufbewahrungsfristen sind **nicht** automatisch
  gesetzt (W3, offen); es läuft kein ungeprüfter Löschlauf.

### PS-S-08 Wachbuch-Eintrag berichtigen/sperren durch Leitung mit Begründung

- **Rolle:** Leitung · **WP:** WP-19.2 · **Voraussetzung:** Modul:WP-19.2
- **Ausgangsdaten:** SD-S; ein Eintrag mit versehentlich genanntem Klarnamen einer Testperson im Freitext.
- **Schritte:**
  1. Als Leitung den Eintrag aufrufen und Berichtigung/Sperre auslösen.
  2. Begründung eintragen.
  3. Eintrag als Planung und als Schichtverantwortung ansehen.
  4. Audit-/Änderungsspur ansehen.
- **Erwartet:** Kontrollierter Prozess nur für berechtigte Leitung mit Begründung; gesperrter Inhalt wird für andere Rollen
  nicht angezeigt; Audit zeigt Wer/Wann/Warum; Inhalt der Sperrung ist nicht unkontrolliert gelöscht (rechtliche
  Löschgrundlage ist extern zu klären, siehe `WP19-OFFENE-FACHNACHWEISE.md`).

### PS-S-09 Objektbericht mit Soll, bestätigtem Ist und „ungeklärt" (PDF und CSV)

- **Rolle:** Leitung · **WP:** WP-19.3, WP-06 · **Voraussetzung:** Modul:WP-19.3
- **Ausgangsdaten:** SD-S; `OBJ-1`, Referenzmonat; für 28 von 30 Postenschichten bestätigtes Ist; eine Schicht ohne
  Ausstempeln, eine ohne Einstempeln.
- **Schritte:**
  1. Als Leitung Objektbericht für `OBJ-1` und den Monat erzeugen (PDF und CSV).
  2. Zeilen mit fehlenden Zeitstempeln ansehen.
  3. Namen/Personenkennungen im Bericht prüfen.
  4. Gleiche Erzeugung als Planung und als Schichtverantwortung versuchen.
- **Erwartet:** Je Posten Soll und bestätigtes Ist; fehlende Zeitstempel ausdrücklich „ungeklärt", nicht still gleich Soll
  (O3). Standard ohne Namen (O1); PDF und CSV mit gleicher Rechteprüfung und gleichem Datenschutzfilter (O4). Kein
  automatischer Freitext (O2). Berechtigung je Rolle gemäß Matrix.
- **Messbezug:** Zeit bis zum versandfertigen Bericht (Kennzahl S1), Anteil „ungeklärt" (S3): 2 von 30 hier als Prüfwert.

### PS-S-10 Monatsabschluss mit Korrekturanträgen und Lohnexport

- **Rolle:** Leitung · **WP:** WP-14, WP-16, WP-16c · **Voraussetzung:** Kern (WP-16 noch Review)
- **Ausgangsdaten:** SD-S; Referenzmonat; drei Korrekturanträge (zwei gestellt, einer abgelehnt), ein 12-h-Dienst mit
  zu kurzer Pause.
- **Schritte:**
  1. Offene Korrekturanträge bearbeiten (freigeben/ablehnen mit Begründung).
  2. Monatsabschluss starten, Prüffälle abarbeiten.
  3. Abschluss bestätigen, Lohnexport erzeugen.
  4. Nach Export eine Korrektur nachträglich wollen.
- **Erwartet:** Wie PS-P-09; zusätzlich: abgelehnter Antrag bleibt mit Begründung sichtbar; Export enthält nur
  abgeschlossene Zeiten; Schritt 4 nur über Revision (WP-16c, derzeit blockiert).

### PS-S-11 Schichtverantwortung sieht nur eigenen Zuständigkeitsbereich

- **Rolle:** Schichtverantwortung · **WP:** WP-43, WP-27 · **Voraussetzung:** Kern
- **Ausgangsdaten:** SD-S; Schichtverantwortung für `OBJ-1`; `MA-S02` auf `OBJ-1`, `MA-S09` auf `OBJ-2`.
- **Schritte:**
  1. Als Schichtverantwortung `OBJ-1` Stempel und Zeiten des eigenen Bereichs ansehen.
  2. Stempel/Zeiten von `MA-S09` (`OBJ-2`) aufrufen.
  3. Ist-Zeiten ansehen, bei denen Stempel gar nicht freigegeben sind.
  4. Als Betriebsrat Auswertung ansehen (nur Aggregat).
- **Erwartet:** Eigener Bereich sichtbar, ohne Stempelgrund; fremder Bereich nicht abrufbar (Abweisung, nicht leere Anzeige);
  bei geschützten Ist-Zeiten „nicht verfügbar" statt Planzeit (Hotfix-Stand H8+); Betriebsrat nur Aggregat.

---

## Abdeckungsmatrix (Kategorien)

| Kategorie | Pflege | Sicherheit |
|---|---|---|
| Ausfall/Umplanung | PS-P-02, PS-P-06 | PS-S-03, PS-S-04 |
| Monatsabschluss | PS-P-09 | PS-S-10 |
| Offline-Stempeln | PS-P-07, PS-P-10 | PS-S-05 |
| Export | PS-P-12 | PS-S-09 |
| Datenschutz/Sichten | PS-P-05, PS-P-11 | PS-S-11 |
| Branchenmodul | PS-P-03, PS-P-04, PS-P-10 | PS-S-01, PS-S-02, PS-S-07, PS-S-08, PS-S-09 |

## Offene Punkte

- Die Ausgangsdaten müssen als ladbare Fixtures (Seed) in der Testumgebung umgesetzt werden. Das ist **nicht Teil dieses
  Dokuments** (nur Doku, kein Produktcode); die Umsetzung gehört zu `WP-S1` (Staging-Vorbereitung) oder einem eigenen
  Auftrag.
- Szenarien mit `Modul:` können erst laufen, wenn das Modul eingehängt und einschaltbar ist (`work-packages.json`).
- Parameter (Soll, Ruhezeit, Quoten) werden nach den Gesprächen aus den Erhebungsbögen angepasst, bleiben aber
  synthetisch.
