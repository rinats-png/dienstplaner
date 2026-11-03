# Pilot-Auswertung (Vorlage)

Vorlage zu `docs/acc45/PILOT-BETRIEBSKONZEPT.md`, Abschnitt 7. Je Pilot ein Bericht. Keine Personendaten, keine
Namen von Betrieben, Objekten, Beschäftigten oder Bewohnern, keine Hosts oder Zugangsdaten. Alles in `[…]` ist
auszufüllen; nichts davon ist vorbelegt. Wo ein Wert fehlt, steht „nicht erhoben" und der Grund, nicht eine Schätzung.

## 0. Kopf

- Pilot: [A Pflege | B Sicherheit]
- Betriebsform: [Form I intern, synthetische Daten | Form II geschlossen, echte Nutzer]
- Stufe laut Datenschutzrahmen: [1 | 2 | 3] · Stufenwechsel-Protokoll vom [Datum], freigegeben durch Rolle [Rolle]
- Zeitraum: Tag 1 am [Datum] bis Tag 14 am [Datum]
- Stand der Umgebung: [Commit oder Version am Anfang] bis [Commit oder Version am Ende]; Hotfix-Auslieferungen: [Anzahl]
- Berichtsstand und Verfasser (Rolle): [Datum], [Rolle]
- Beteiligte Rollen (Anzahl je Rolle, ohne Namen): [Planung n, Leitung n, Schichtverantwortung n, Mitarbeitende n, Betriebsrat n]

## 1. Zusammenfassung

[Fünf Sätze: Was wurde getestet, was lief, was nicht, wichtigste Fehler, Empfehlung.]

## 2. Szenarien

Quelle: Szenarienprotokoll. Stände: `bestanden`, `abweichend`, `blockiert`, `nicht-ausfuehrbar`, `offen`.

| Szenario | Voraussetzung | Stand | Fehler-IDs | Bemerkung (ein Satz) |
|---|---|---|---|---|
| [PS-P-01] | [Kern | Modul:WP | Extern] | [Stand] | [IDs] | [ ] |

Abdeckung: ausführbar [n] von [N]; bestanden [n]; Szenarioabdeckung A1 = [ ]; Ausführbarkeit A2 = [ ].
Nicht ausführbar wegen: [Modul nicht einschaltbar | Gerät fehlte | Daten fehlten | sonstiges].

## 3. Fehlerlage

| Priorität | gemeldet | behoben | verifiziert | zurückgestellt | offen am Ende | Behebungsziel eingehalten |
|---|---|---|---|---|---|---|
| P0 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| P1 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| P2 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| P3 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

Verlauf je Pilottag (neue Fehler je Priorität): [Verweis auf Tagesberichte].

Jeder P0 und P1 mit Eintrag: Fehler-ID, Bereich, Ursache in einem Satz, Korrektur (PR), Verifikation (Datum, Szenario).
Bei Sicherheitsthemen nur „Details nicht öffentlich".

## 4. Pausen und Stopp-Auslöser

| Datum | Auslöser nach Konzept 2.3 | Folge (Pause, Abbruch) | Wiederaufnahme am | Entscheidung durch Rolle |
|---|---|---|---|---|
| [ ] | [ ] | [ ] | [ ] | [ ] |

[Keine, wenn keine.]

## 5. Betrieb

- `/gesund`: Verlauf der Stufen, Störungen (Datum, Stufe, Ursache, Dauer): [ ]
- Alarme: [Anzahl]; mit Reaktion im Ziel: [Anzahl]; ohne Reaktion: [Anzahl] (Kriterium C2)
- Sicherung: erfolgreiche Tage [n] von [14] (C3); Wiederherstellungsprobe: [Datum, Ergebnis]
- Verfügbarkeit nach externem Check (C1): [Wert | nicht erhoben, weil kein externer Check]
- Auslieferungen und Rückwege (C4): [Anzahl, davon R0 oder Rücksprung: Anzahl]
- Monitoringlücken: [ ]

## 6. Kennzahlen

Schwellen wurden vor Pilotbeginn am [Datum] von [Rolle Pilotbetrieb] und [Rolle Betreiber] festgelegt.
Nachträgliche Änderungen: [Datum, Grund | keine].

| ID | Kennzahl | Basis (vorher, Messart) | Wert im Pilot | Schwelle | Urteil (erreicht / verfehlt / nicht bewertbar, Grund) |
|---|---|---|---|---|---|
| [P1] | [ ] | [ ] | [ ] | [ ] | [ ] |
| [S1] | [ ] | [ ] | [ ] | [ ] | [ ] |

Einordnung: Kennzahlen aus 14 Tagen und einer kleinen Gruppe sind Hypothesen und Eindrücke, kein Wirksamkeitsnachweis.
Messung: [Stoppuhr, Bogen, Zähler]; Mindestgruppe 3 eingehalten: [ja | nein, dann nicht berichtet].

## 7. Akzeptanz (aggregiert je Rolle, Mindestgruppe 3)

| Rolle | Würde im Alltag nutzen (Skala laut Pilotleitung) | Was fehlte | Was war unklar |
|---|---|---|---|
| [Planung] | [ ] | [ ] | [ ] |

[Rollen mit weniger als drei Personen werden zusammengefasst oder nicht berichtet.]

## 8. Lehren

- Abweichungen von der Planung: [ ]
- Fehlerklassen, die Tests nicht fingen: [ ]
- Szenarien, die geändert oder ergänzt werden müssen: [ ]
- Lücken im Monitoring und in den Alarmwegen: [ ]
- Aufwand der Pilotpersonen höher oder niedriger als erwartet: [ ]
- Für den Produktivbetrieb vor Freigabe zu schließen: [ ]
- Änderungen an Konzept, Runbook oder Szenarien: [ ]

## 9. Go/No-Go-Empfehlung

| Frage | Befund | Erfüllt |
|---|---|---|
| Datenintegrität: keine ungeklärte P0, alle P0 verifiziert | [ ] | [ja | nein] |
| Betrieb: Sicherung, Wiederherstellung, Alarmweg, externer Check | [ ] | [ja | nein] |
| Rollen und Rechte: Rechtematrix und Rollenszenarien ohne Abweichung | [ ] | [ja | nein] |
| Nutzen: festgelegte Schwellen erreicht oder Verfehlen begründet und akzeptiert | [ ] | [ja | nein] |
| Pilotprozess: Voraussetzungen aus `PILOT-MINDESTANFORDERUNGEN.md` und Datenschutzrahmen eingehalten | [ ] | [ja | nein] |
| Offene Punkte: jeder offene P1 mit Umgehung und Termin; externe Abnahmen mit Stand | [ ] | [ja | nein] |

Empfehlung: [Go | Go mit Auflagen | No-Go]. Auflagen mit Termin: [ ]. Nachbesserungen: [ ].
Aussage gilt für: [Form I: nur Empfehlung für Form II oder Weiterentwicklung | Form II: Empfehlung für Produktivbetrieb].

Entscheidung des Betreibers: [Datum, Entscheidung, Rolle]. Diese Vorlage ersetzt keine Entscheidung.

## 10. Rückbau und Ablage

- Entscheidung je Pilot: [Weiterbetrieb | Einfrieren | Löschen]
- Zugänge entzogen am: [Datum]; Daten gelöscht oder zurückgegeben am: [Datum]; Bestätigung abgelegt: [ja | nein]
- Ablage dieses Berichts: [Ort ohne Personenbezug]
