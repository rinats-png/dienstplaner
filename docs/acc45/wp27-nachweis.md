# WP-27 — Betriebsrat-Auswertung aggregiert, reduzierte Sichten: Nachweis

Branch `acc45/rules/wp27-br-auswertung`, aufgesetzt auf `acc45/rules/wp22b-nachtrag` (braucht die Planrechnung aus
`server/lib/fachpruefung.mjs`) und `origin/integration/centric-complete` (9abf988).

## Akzeptanz

**Aggregation ohne Personenbezug unter Mindestgruppe.** `server/lib/br-auswertung.mjs` rechnet aus dem vollständigen
Bestand Summen je Monat und Einheit sowie für den Betrieb: Dienste, Nachtdienste (Nachtfenster des Betriebs),
Sonntagsdienste, Dienste über zehn Stunden, Ruhezeit unter 11 Stunden nach Plan, bestätigte Ist-Stunden und ihre Zahl —
sechs Monate zurück, zwei voraus. Unter drei Personen stehen keine Zahlen, nur „<3"; ist in einem Monat eine Einheit
gesperrt, fällt auch die Gesamtzeile weg (Zweitsperre gegen Differenzbildung). Keine Person, kein Name, keine Kennung.
Der Server liefert die Auswertung auf einem eigenen Weg (`GET /api/br-auswertung`, nur Betriebsrat mit `audit.view`, sonst 403), nicht im Bestand. Sie wird im Hintergrund in Häppchen (höchstens 12 ms am Stück) gerechnet und im Prozessspeicher je Raum, Betrieb und Tag gemerkt (Stand nach N1/K1); bis dahin antwortet der Weg 202 „wird berechnet“, und die Oberfläche wiederholt. Dauerhaft gespeichert wird nur das eingefrorene Ist je Monat (`brist:<raum>:<betrieb>:<monat>`, siehe „Nachtrag Opus-Nachprüfung“); die Aggregate stehen nie im Bestand.

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
- **Ist nach der Frist einfrieren (dauerhaft):** Die Planung kann bestätigte Zeiten auch nach Fristende noch korrigieren; zwei Ausgaben ergäben die Korrektur als Differenz — auch über einen Neustart hinweg. Darum steht das einmal ausgegebene Ist einer Zeile (Raum, Betrieb, Monat, Einheit) in der Ablage (`brist:<raum>:<betrieb>:<monat>:<einheit>`); jede spätere Ausgabe nimmt es von dort, Änderungen stehen nur als `istKorrigiert` (Oberfläche: †) ohne Zahl. Nicht lesbar oder nicht beschreibbar: das Ist der Zeile wird nicht ausgegeben. Aufgeräumt wird beim Rechnen (Monate vor dem Auswertungszeitraum) und mit `raumLoeschen`. Die zustandslose Alternative (nur Bestätigungen mit Zeitstempel bis Fristende) geht nicht: Selbstauskünfte (`erfassung`) tragen keinen Zeitstempel. *(Abgelöst durch den Nachtrag Opus-Nachprüfung, B1: ein Schlüssel je Monat statt je Zeile.)*
- **K1 Mandantentrennung:** Schlüssel von Ergebnis, laufender Rechnung und Eingefrorenem enthalten den Betrieb (Mandant) der Sitzung; zwei Betriebe in einem Raum teilen nichts.
- Datenschutz: Wartefrist, mindestens 3 Beitragende und Zweitsperre (F1) stecken in der Rechnung selbst; Zeitstempel und Zwischenspeicher geben nichts frei.

## Nachtrag Opus-Nachprüfung (WP-27b)

Branch `acc45/rules/wp27b-nachtrag` von `origin/integration/centric-complete` (764b1ab). Je Befund zuerst der Test rot
auf dem alten Stand (21 neue Prüfungen rot, alle bestehenden grün), dann die Korrektur, dann Mutanten (15, alle getötet).

- **B1 (MITTEL, Datenschutz): Komplementärrechnung über Zeilen mit verschiedenem Einfrierzeitpunkt.** Vorher wurde je
  Zeile und nur bei vorhandenem Ist eingefroren; eine Zeile, die beim ersten Mal kein Ist hatte, kam später frisch
  dazu. Sonde P1 (Mai 2026, heute 20.06.): A eingefroren 25,5 h, B und Gesamt wegen eines Dienstes in Prüfung null;
  danach Korrektur a0 +2 h (bis `ANTRAG_RUECKBLICK_TAGE` zurück möglich) und Bestätigung b2 → A 25,5†, B und Gesamt
  frisch: Gesamt − B − A = 2,0 h = die Korrektur einer Person. **Jetzt:** Das Ist eines Monats wird in EINEM Schlüssel
  `brist:<raum>:<betrieb>:<monat>` mit `setJSONWennNeu` (atomar) eingefroren, sobald irgendeine Zeile ein Ist hat —
  alle Zeilen, die in diesem Augenblick eines haben; danach wird der gespeicherte Rahmen erneut gelesen und nur er
  ausgegeben. Fehlt eine Zeile im Rahmen, bleibt ihr Ist dauerhaft weg (`istNichtVerfuegbar`, Oberfläche ‡). Ablage
  nicht les- oder schreibbar oder Rahmen unlesbar: der ganze Monat ohne Ist. Die Schlüssel je Einheit der Vorgängerfassung
  (nur im Integrationsstand) werden nicht mehr gelesen; die Raumlöschung nimmt sie über das Präfix mit. Prüfungen: Sonde
  P1 mit und ohne Ablage, Sonde P2 (vorübergehender Ablagefehler beim ersten Einfrieren — vorher blieb nur der
  Gesamtschlüssel offen), Invariante „Gesamt − Σ Einheiten = 0“ in jeder Ausgabe, ein Schlüssel je Monat, unlesbarer
  Rahmen. Mutanten: Freeze je Zeile, fehlende Zeilen nachgetragen (Monat nicht atomar), `setJSON` statt
  `setJSONWennNeu` — getötet.
- **B2 (NIEDRIG): Waisen nach `raumLoeschen`.** Geschrieben wird nur noch unter `unterRaumsperre(raum)` (dieselbe Sperre
  wie die Raumlöschung) und nur, solange `kern:<raum>` besteht; sonst kein Ist und kein Schlüssel. Prüfungen: Raum ohne
  Kern, Kern verschwindet während der Rechnung; Mutant ohne Kernprüfung getötet. Offen: Schlüssel eines aus dem Raum
  entfernten Betriebs bleiben bis zur Raumlöschung (höchstens ein Schlüssel je Monat, kein Personenbezug).
- **B3: Lesen, dann Schreiben nicht atomar.** Durch B1 erledigt (`setJSONWennNeu`, danach erneut lesen). Prüfung: ein
  anderer Lauf friert zwischen Lesen und Schreiben ein — ausgegeben wird dessen Rahmen. Mutanten `setJSON` und „eigener
  Wert statt erneut gelesen“ getötet.
- **B4: Aufräumen listete bei jedem Lauf die ganze Ablage.** Jetzt gezielt je Schlüssel, ohne `list`, einmal je
  Monatswechsel und Prozess: die `BR_AUFRAEUMEN_MONATE` (12) Monate vor dem Zeitraum. Prüfung: kein `list`, im selben
  Monat keine zweite Löschung, beim Monatswechsel wieder; Mutant „bei jedem Lauf“ getötet.
- **B5 (fachlich): Ist wie das Stundenkonto, Rufbereitschaft wie die Fachprüfung.** (a) Bestätigte ungeplante Dienste
  (WP-13) zählen im Ist und bei den Beitragenden (Sonde 6 statt 3), an einem Abwesenheitstag nicht — wie
  `ungeplantAm`. (b) Die Ist-Dauer kommt aus `istZeitFuer` (dieselbe Funktion wie Stundenkonto und Lohnausgabe): die bei
  der Korrektur genannte Pause gilt (Sonde 26 statt 25,5), dazu die Zeitumstellung. Dafür steht die Ist-Rechnung jetzt in
  `server/lib/istdaten.mjs` (das Serverbild enthält kein `src/`); `src/istdaten.js` reicht nur weiter (Muster
  `src/regelwerk.js`). (c) Rufbereitschaft über `rufbereitschaft()` aus `fachpruefung.mjs` (`form: "ruf"`,
  `rufbereitschaft`, `ruhezeitNeutral`): kein langer Dienst, keine Ruhezeit (Sonde 0 statt 3). Mutanten getötet: ungeplant
  übergangen, ungeplant auch am Abwesenheitstag, Planpause, nur `form: "ruf"`.
  *Abweichung zum Konto, bewusst:* Das Konto wertet Stunden mit dem Anrechnungsfaktor der Dienstform (`gewertet`,
  App.jsx); die Auswertung zählt tatsächliche Stunden (Arbeitszeit für § 3 ArbZG). Für Dienste ohne Faktor identisch.
  *Interaktion WP-16* (`acc45/time/wp16-pausen-und-monatsabschluss`, parallel): Friert der Monatsabschluss das Ist je
  Person und Tag ein, sollte die Auswertung dieses eingefrorene Ist über dieselbe Funktion lesen; nicht vorweggenommen.
  Ändert WP-16 `src/istdaten.js`, gehört die Änderung beim Zusammenführen nach `server/lib/istdaten.mjs`.
- **B6: Prüf- und Dokulücken.** HTTP-Prüfung mit zwei Betrieben in einem Raum am Endpunkt (Mutant
  `mit.bestand.mandanten[0]` statt eigener Mandant getötet); Kundenrolle und Betreiber am Endpunkt 403 (Mutant „nur
  `audit.view`“ getötet); Betrieb ohne Kennung: 409 mit Text statt endlos 202 (Mutanten getötet); CSV-Export: Einheitsnamen
  über `csvText` (`src/csvfeld.js`, neben dem dorthin verschobenen `csvFeld`) gegen Formel-Injection (führendes
  `= + - @`, auch nach Leerraum, Tabulator, Wagenrücklauf) und maskiert (`;`, `"`, Zeilenumbruch), Mutant getötet;
  veraltete Texte korrigiert (RECHTEMATRIX Abschnitt 2, dieser Nachweis, Modulkopf `br-auswertung.mjs`).
- **Anpassungen bestehender Prüfungen (keine Abschwächung):** Die Prüfablage der Gruppe „Ist eingefroren: dauerhaft“
  legt den Kern ihrer Räume an (ohne Kern schreibt die Auswertung seit B2 nichts) und kennt `setJSONWennNeu`; die
  Schreibsperre sperrt auch `setJSONWennNeu`; Aufräumen und Raumlöschung nutzen das neue Schlüsselformat je Monat. Alle
  Erwartungen sind unverändert.

## Prüfungen/

`pruefungen/br-auswertung.test.js` (Skript `pruefung:br-auswertung`, CI-Schritt „Betriebsrat-Auswertung"):
Mindestgruppe, Zweitsperre, Summen aus Plan und bestätigten Ist-Zeiten, kein Personenbezug, nur der Betriebsrat, ein
mitgeschicktes Feld wird nie im Bestand gespeichert, Oberfläche (Ansicht, Export, gesperrte Ansichten, „nicht bewertbar", kein NaN, „abwesend").

## Grenzen

- Qualifikationen mit `nurStatus` bekommt der Betriebsrat nicht; zählt eine Mindestbesetzung oder Aufgabe auf sie, meldet
  die Oberfläche für ihn eine fehlende Qualifikation (wie für Beschäftigte) — offen.
- Mehrarbeit gegenüber dem Soll und Konten sind nicht Teil der Auswertung (Konten enthalten Lohnbezug).
- Die Mindestgruppe 3 und der Umfang sind eine fachliche Festlegung für die Betriebsvereinbarung.
