# WP-27c Nachweis — Betriebsrat-Auswertung: Nachtrag

Branch `feature/ready-kleinpakete`, Basis `9aac167`. Quelle des Nachtrags: `docs/acc45/wp27-nachweis.md`,
Abschnitt „Nachtrag Opus-Nachprüfung (WP-27b)“, und der Titel von WP-27c in `work-packages.json`.

Die Akzeptanz verlangt vier Punkte aus dem Nachtrag, je mit Test, und keinen Personenbezug unter der
Mindestgruppe. Zwei der vier Punkte sind eindeutig umgesetzt bzw. bereits belegt; zwei sind nicht eindeutig
formuliert und deshalb als Fragen offen (`docs/acc45/wp-kleinpakete-fragen.md`, Fragen 6 und 7).

## Die vier Punkte

| # | Punkt (Titel WP-27c) | Stand | Beleg |
|---|---|---|---|
| 1 | Aufräumen von −2 | **offen**: Titel mehrdeutig (Frage 6). Nicht geändert. | – |
| 2 | Ungeplanter Dienst sperrt Gesamtzeile | **Test neu**: ungeplant bestätigte Dienste zählen als Beitrag; trägt eine Einheit mit 1–2 Personen bei, ist die Gesamtzeile des Monats gesperrt. Auslegung in Frage 7. | `pruefungen/wp27c-nachtrag.test.js` |
| 3 | Rufbereitschaft im Ist | bereits umgesetzt (WP-27b B5c) | `pruefungen/br-auswertung.test.js`, Block „Nachtrag WP-27b B5“ (c) |
| 4 | Test Weiterleitung | bereits vorhanden: `src/istdaten.js` enthält nur `export * from` auf `server/lib/istdaten.mjs` | `pruefungen/istdaten.test.js` (Zeile 50) |

Punkt 2 hat keinen Codeänderung; die Prüfung bestätigt das bestehende Verhalten. Die Fassung „Gesamtzeile
gesperrt“ folgt der bestehenden Zweitsperre (`server/lib/br-auswertung.mjs`, Zeilen 175–183).

## Tests

Neue Datei `pruefungen/wp27c-nachtrag.test.js`: **3 Tests**, alle grün.

- zwei Beitragende allein aus ungeplanten Diensten: Einheit gesperrt (keine Zahl), Gesamtzeile gesperrt, ohne Ist
- drei Beitragende aus ungeplanten Diensten: Gesamtzeile zeigt die Summe
- kein Personenbezug unter der Mindestgruppe: Namen der Zwei-Personen-Einheit erscheinen nicht in der Ausgabe

Gezielt zusammen mit `br-auswertung.test.js` und `istdaten.test.js`: **3 Dateien, 110 Tests, alle grün** (davon 3 neu).

## Vor der Umsetzung

Der erste Test (Gesamtzeile gesperrt) schlug mit einer Annahme über das Feld `istStunden` fehl; die Gesamtzeile ist
bei Sperre ohne Zahlenfelder. Der Test wurde auf die tatsächliche Form der Zeile gebracht (`gesperrt: true`), die
Aussage blieb gleich. Die Prüfung war damit nicht abgeschwächt, sondern zeigte den bestehenden Vertrag.

## Offen

- Punkt 1 (Aufräumen von −2) und die Bestätigung von Punkt 2 und 3/4 als vollständiger Nachtrag: Fragen 6–8.
