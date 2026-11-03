# WP-27 — Betriebsrat-Auswertung aggregiert, reduzierte Sichten: Nachweis

Branch `acc45/rules/wp27-br-auswertung`, aufgesetzt auf `acc45/rules/wp22b-nachtrag` (braucht die Planrechnung aus
`server/lib/fachpruefung.mjs`) und `origin/integration/centric-complete` (9abf988).

## Akzeptanz

**Aggregation ohne Personenbezug unter Mindestgruppe.** `server/lib/br-auswertung.mjs` rechnet aus dem vollständigen
Bestand Summen je Monat und Einheit sowie für den Betrieb: Dienste, Nachtdienste (Nachtfenster des Betriebs),
Sonntagsdienste, Dienste über zehn Stunden, Ruhezeit unter 11 Stunden nach Plan, bestätigte Ist-Stunden und ihre Zahl —
sechs Monate zurück, zwei voraus. Unter drei Personen stehen keine Zahlen, nur „<3"; ist in einem Monat eine Einheit
gesperrt, fällt auch die Gesamtzeile weg (Zweitsperre gegen Differenzbildung). Keine Person, kein Name, keine Kennung.
Der Server liefert die Auswertung auf einem eigenen Weg (`GET /api/br-auswertung`, nur Betriebsrat mit `audit.view`, sonst 403), nicht im Bestand. Sie wird im Hintergrund in Häppchen (höchstens 12 ms am Stück) gerechnet und je Raum, Stand der Ablage und Tag gemerkt; bis dahin antwortet der Weg 202 „wird berechnet“, und die Oberfläche wiederholt. Nichts davon wird gespeichert.

**Leistungsnachweis/Belastung korrekt oder gesperrt.** Prüfung der für den Betriebsrat erreichbaren Ansichten:
- Leistungsnachweis: ohne Übergaben (die der Betriebsrat nicht bekommt) stünde dort „keine besonderen Vorkommnisse" —
  für den Betriebsrat gesperrt (`OHNE_BR:`). Ebenso Sondereinsätze, Betriebsmittel, Lenkzeiten (Daten fehlen, leer).
- Prüfung, Ausgleichszeitraum § 3 ArbZG: ohne Ist-Daten „nicht bewertbar" statt „eingehalten".
- Jahresansicht: ohne Kontoangaben kein „Urlaub x/NaN".
- Abwesenheiten, die der Betriebsrat nur als „abwesend" bekommt, heißen „abwesend" statt „Sonstiges".
- Belastung, Verteilung, Personaleinsatz, Untergrenzen, Planstand, Zeitachse, Lagebild: planbasiert bzw. schon richtig
  gekennzeichnet („Ist nicht verfügbar", Konten nur für die Planung).

**Rechte des Betriebsrats.** `audit.view` öffnet die Ansicht „Auswertung (Betriebsrat)", `export.data` den CSV-Export
genau dieser Aggregate. Vorher hatten beide Rechte keine Wirkung. Leitung und Kundenrolle haben die Rechte auch, sehen
aber ohnehin die Einzelwerte; die Ansicht ist dem Betriebsrat vorbehalten (`BR:`). RECHTEMATRIX Abschnitt 2.

## Nachbesserung nach dem Review (88cefbe)

- **F1 Ist-Zeiten (Datenschutz):** Das Ist erscheint nur, wenn der Monat abgeschlossen und die Frist zum nachträglichen Bestätigen (`RUECKBLICK_TAGE`, 14 Tage) vorbei ist und mindestens 3 Personen zum Ist beitragen; trägt eine Einheit mit 1–2 Personen bei, fehlt das Ist auch in der Gesamtzeile. Vorher: Zeile `personen: 4, istErfasst: 1, istStunden: 8.5` machte die Zeit einer Person sichtbar, und zwei Abrufe an aufeinanderfolgenden Tagen ergaben sie als Differenz. Grenze: Korrekturen der Planung an bestätigten Zeiten nach Ablauf der Frist ändern die Summe weiterhin (befugte Änderung, keine Selbstauskunft).
- **F2 Zwischenspeicher:** Schlüssel Raum + Tag statt Betriebskennung + `m.stand` (das Feld gibt es nicht); Vortage eines Raums werden verworfen, Obergrenze 40 Einträge.
- **F3 Blockieren:** Die Rechnung ist ein Generator und läuft im Hintergrund; 2000 Personen blockieren den Prozess nicht mehr (Test mit Ereignisschleifen-Messung, CI hart bei 50 ms Median).
- **F4:** Test für Betriebsrat ohne `audit.view` und für jede andere Rolle (403); `export.data` schaltet nur die Schaltfläche (der Export enthält dieselben Zahlen) — dokumentiert in `RECHTEMATRIX.md`.

## Nachprüfung N1 (Schreiblast) und Restpunkt Ist-Korrektur

- **N1:** Der Stand der Ablage ist kein Schlüssel mehr: Jeder Schreibvorgang (auch Stempeln) machte einen neuen Stand, unter Schreiblast wurde nie etwas fertig, und jeder Abruf startete eine neue Vollrechnung. Jetzt: je Raum und Tag das letzte Ergebnis, immer ausgeliefert, mit `berechnetUm`; neu gerechnet frühestens nach 5 Minuten (`BR_NEUBERECHNUNG_MS`), höchstens ein Lauf je Raum, höchstens 3 insgesamt; eine laufende Rechnung wird nicht durch einen neuen Stand ersetzt. Test: Standwechsel bei jedem Abruf, 600 Personen — fertig, genau ein Lauf.
- **Ist nach der Frist einfrieren:** Die Planung kann bestätigte Zeiten auch nach Fristende noch korrigieren; zwei Ausgaben ergäben die Korrektur als Differenz. Darum bleibt das einmal ausgegebene Ist einer Zeile (Raum, Monat, Einheit) bis zum Neustart des Prozesses gleich; hat sich der Bestand geändert, steht an der Zeile `istKorrigiert` (Oberfläche: †) — ohne Zahl. Grenze: Nach einem Neustart gilt der dann aktuelle Wert.
- Datenschutz: Wartefrist, mindestens 3 Beitragende und Zweitsperre (F1) stecken in der Rechnung selbst; Zeitstempel und Zwischenspeicher geben nichts frei.

## Prüfungen/

`pruefungen/br-auswertung.test.js` (Skript `pruefung:br-auswertung`, CI-Schritt „Betriebsrat-Auswertung"):
Mindestgruppe, Zweitsperre, Summen aus Plan und bestätigten Ist-Zeiten, kein Personenbezug, nur der Betriebsrat, nie
gespeichert, Oberfläche (Ansicht, Export, gesperrte Ansichten, „nicht bewertbar", kein NaN, „abwesend").

## Grenzen

- Qualifikationen mit `nurStatus` bekommt der Betriebsrat nicht; zählt eine Mindestbesetzung oder Aufgabe auf sie, meldet
  die Oberfläche für ihn eine fehlende Qualifikation (wie für Beschäftigte) — offen.
- Mehrarbeit gegenüber dem Soll und Konten sind nicht Teil der Auswertung (Konten enthalten Lohnbezug).
- Die Mindestgruppe 3 und der Umfang sind eine fachliche Festlegung für die Betriebsvereinbarung.
