# WP-27c Nachweis — Betriebsrat-Auswertung: Nachtrag

Branch `folge/wp-27c-nachtrag` von `origin/integration/release-v4`. Auf dieser Basis liegt bereits die frühere
Teilumsetzung (`docs/acc45/wp27c-nachweis.md`, `pruefungen/wp27c-nachtrag.test.js`). Hier wurde nur die Lücke geschlossen.

## Die vier Punkte

| # | Punkt | Stand vor diesem Branch | Stand jetzt |
|---|---|---|---|
| 1 | Aufräumen von −2 | Titel mehrdeutig (Frage 6), ohne Test der Grenze | Verhalten unverändert. Neue Grenzprüfung `pruefungen/wp27c-aufraeumen.test.js`: gelöscht werden nur die zwölf Monate unmittelbar vor dem Zeitraum; Monate im Zeitraum (auch +1, +2) und ältere als −12 bleiben. Die Auslegung von „−2“ bleibt offen. |
| 2 | Ungeplanter Dienst sperrt Gesamtzeile | bereits umgesetzt und getestet (`wp27c-nachtrag.test.js`, 3 Tests) | unverändert |
| 3 | Rufbereitschaft im Ist | bereits umgesetzt (WP-27b B5c, `br-auswertung.test.js`) | unverändert |
| 4 | Test Weiterleitung | bereits vorhanden (`istdaten.test.js`; `src/istdaten.js` reicht nur weiter) | unverändert |

## Tests

Die neue Prüfung ist eine Festschreibung des bestehenden Verhaltens und war deshalb auf dem alten Stand nicht rot
(kein Codefehler gefunden). Gezielt `wp27c-aufraeumen`, `wp27c-nachtrag`, `br-auswertung`, `istdaten`:
4 Dateien, 111 Tests, alle grün (1 neu). Kein bestehender Test geändert, abgeschwächt oder entfernt.
Produktivcode unverändert; kein neuer Lese- oder Schreibpfad; keine Personendaten in Test oder Nachweis.

## Offen

- Fachliche Auslegung von „Aufräumen von −2“ (Frage 6 in `docs/acc45/wp-kleinpakete-fragen.md`).
- Bestätigung der Fragen 7 und 8 (Auslegung Punkt 2 sowie Vollständigkeit der Punkte 3 und 4).
