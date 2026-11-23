# QS-2 Nachtrag: Wandzeit-Grenze im Selbsttest (2026-11-22)

## Befund

CI-Lauf 45027175416, Job 137222619614 (push, Kopf cca10181…): `pruefungen/selbsttest.test.js` rot mit
„Erster Aufbau unter 500 ms: erwartet true, ist false". Der pull_request-Lauf derselben SHA (Job 137222815647) war grün.
Der PR änderte nichts in `src/`. Der Log nennt die Messzeit nicht (nur die Zusicherung).

## Ursache (zum Teil belegt, zum Teil geschlossen)

- Gemessen wurde die Wandzeit (`Date.now`) eines **einmaligen** Durchlaufs: `stundenkonto`, `nachtJahr`, `urlaubskonto` für alle
  86 Personen des Demomandanten auf frischem Zwischenspeicher (2236 Berechnungen = 86 × (3 + 12 + 11), das heißt
  jede Berechnung genau einmal). Der Durchlauf enthält kaltes JIT und den Rechnerzustand zum Zeitpunkt.
- Das ist ein Leistungsvertrag mit einer einzigen Stichprobe und fester Absolutgrenze. Er misst den Runner mehr als den Code.
- Lokale Messung (4 Kerne, andere Agenten laufen): 20 Läufe, erster Aufbau 607 bis 1745 ms, Median etwa 1060 ms. Eine
  spätere lokale Messung des alten Werts (Review #478) ergab 811, 1165 und 2236 ms.
- **Geschlossen, nicht gemessen:** „Auf CI nahe der Grenze“ ist ein Schluss aus Gesamtlaufzeiten (Datei 5,7 s statt 23 bis 47 s
  lokal). Der Log des roten Laufs nennt keinen Messwert, der Wert auf CI ist also unbekannt. Gemessen ist nur die Dauer des
  Selbsttest-Schritts: rot (Job 137222619614) 5,69 s, grün (Jobs 45027241109, 45029713288, 45029718090, 45027537241) 4,16 bis
  5,16 s. Der rote Lauf war damit der langsamste der fünf; mehr belegt der Befund nicht. Ob die alte Grenze zwischen Normalwert
  und Störwert lag, bleibt offen.
- Zweite Wandzeit-Grenze derselben Stelle: „Zwischenspeicher greift" (`< 30 ms`), gleicher Mangel.

## Fix

In `src/pruefung.jsx` (Abschnitt vor „Qualifikationsprüfung schlägt an"):

1. Zähler: `memo` zählt Fehlgriffe (`fehl`). Zweiter Durchlauf: genau 0 neue Berechnungen (ersetzt `< 30 ms`).
   Erster Durchlauf: höchstens 1,25 × Personen × (3 + 12 + Monat).
2. Skalierung: Minimum aus 5 frischen Aufbauten für n und n/2 Personen; `Dauer(n) <= max(3,2 × Dauer(n/2), 5 ms)`.
   Ein rein linearer Aufbau gibt etwa 2, ein rein quadratischer etwa 4. Die Schwelle 3,2 schlägt aber nur an, wenn der
   quadratische Anteil bei n = 86 mindestens etwa das Dreifache des linearen Anteils ist: Mutant mit K = 60000 gibt 3,14 (grün),
   mit K = 20000 verdoppelt sich die Zeit und das Verhältnis ist 2,93 (grün). Beide Werte stammen vom selben Lauf, Rechnerlast
   kürzt sich heraus. Die Skalierung fängt also nur grobe Überlinearität; Architekturfehler (Cache, doppelte Berechnung) deckt
   vor allem der Zähler ab.
3. Grobgrenze relativ: Minimum aus 5 frischen Aufbauten `<=` 40 × Minimum einer festen Vergleichsarbeit (Map und Zeichenketten).
   Gemessen 8 bis 12; ein Mutant mit 10-facher Arbeit liegt bei 50.

Nicht abgeschwächt, mit Einschränkung (Review #478, A1): Keine Zusicherung wurde entfernt. „Erkennen mehr als vorher“ ist nur für den
Ausfall des Zwischenspeichers belegt (Zähler; vorher nur indirekt über die Zeit). Eine **gleichmäßige Verlangsamung** des Aufbaus
bleibt bis etwa 3,3-fach grün und wird erst ab etwa 4-fach rot (Messung des Reviewers: Mutant `istStunden` 5-fach, Gesamtaufbau
etwa 3,3-fach, grün; 7-fach, etwa 4-fach, rot). Die frühere absolute Grenze (500 ms) war für reine Verlangsamung empfindlicher,
aber nicht reproduzierbar (siehe Ursache). Wie viel Vorrat die neue Grenze auf CI hat, ist unbekannt: Der Log nennt keinen Messwert.
`pruefungen/sammelpruefung-bekannt.json` ist leer (der Windows-Eintrag betraf genau diese Zusicherung).

Folge im Schnitt „Selbsttest“ der V4-Radiusstufen: `pruefungen/v4-3b-selbsttest.test.js` legte `src/pruefung.jsx` byte-genau auf
die Basis fd9dea35 fest (7843 Zeilen, Prüfsumme). CI (Lauf auf 455be5fc, Schritt „Querschnittsprüfungen“) wurde dadurch rot:
7875 statt 7843 Zeilen, andere Prüfsumme. Die Festlegung bleibt byte-genau, gilt jetzt aber für Basis plus genau diese Änderung
(`NACHTRAG_QS2`: +32 Zeilen, Prüfsumme der Datei). Jede weitere Änderung an der Datei macht die Prüfung weiter rot.

## Nachweis

| Fall | Ergebnis |
|---|---|
| Unverändert, Rechner unter Last (3 Läufe) | Zähler 0 / 2236; Skalierung 2,23 / 2,0 / 1,67; relativ 8,3 bis 11,7; grün |
| 4 parallele Busy-Loops zusätzlich | `selbsttest.test.js` 2/2 grün |
| Mutant A: Zwischenspeicher für `nacht\|` aus | rot: „Zwischenspeicher greift: zweiter Durchlauf berechnet nichts neu" |
| Mutant B: quadratische Schleife in `stundenkonto` (n × 30000 je Aufruf) | rot: „skaliert nicht überlinear" (Verhältnis 4,0) und „im Verhältnis zur Vergleichsarbeit begrenzt" (Faktor 264) |
| Mutant C: 10-fache Arbeit in `istStunden` | rot: „im Verhältnis zur Vergleichsarbeit begrenzt" (Faktor 50) |

Mutanten nur zur Messung eingebaut, wieder entfernt. Restrisiko: Verlangsamung bis etwa Faktor 3,3 (Reviewer-Messung) bleibt grün,
Faktor 4 und mehr wird rot. Der Zähler deckt den Ausfall des Zwischenspeichers ab. Die Skalierung deckt Überlinearität nur, wenn der
quadratische Anteil bei n = 86 mindestens etwa das Dreifache des linearen ist (K = 60000: 3,14 grün; K = 20000: 2,93 grün).

Hinweis H3 (Review #478): Der Knopf „Selbsttest“ in der App führt jetzt etwa 12 Aufbauten plus die Vergleichsarbeit aus und dauert
auf langsamen Geräten länger als vorher. Das Verhältnis (8 bis 12) ist nur auf Node/V8 gemessen; auf iOS (JavaScriptCore) und anderen
Motoren ist es unbekannt, die Grobgrenze 40 ist dort nicht belegt.

Hinweis zur Pipeline (nicht geändert, Workflows sind tabu): Der Kommentar in `.github/workflows/pruefung.yml` (um Zeile 938) nennt noch
die alte Grenze „Erster Aufbau unter 500 ms“. Er gehört bei der nächsten Änderung der Datei auf die neuen Zusicherungen umgestellt.

## Weitere Wandzeit-Grenzen (Bewertung, vollständige Liste)

Der Reviewer (#478) fand mit `expect(Date.now() - t).toBeLessThan(…)` 43 Stellen in 17 Dateien, davon 12 mit höchstens 1000 ms.
Die Liste unten ist mit der weiter gefassten Suche `grep -rnE "toBeLessThan\(" pruefungen | grep -E "Date.now|performance.now|ms|dauer|Dauer"`
neu erzeugt und von Hand bereinigt (ohne Uhrenstände, Aufrufzähler und Datumsvergleiche): **46 Stellen in 22 Testdateien** plus
1 Stelle im Browserlauf. Jede Zusicherung ist einzeln gezählt; die Zahl weicht vom Reviewer ab, weil das Muster weiter gefasst ist.

**Einstufung** (aus Grenzhöhe und Art der Messung; die Normalwerte auf CI sind nicht gemessen, die Bemerkungen beruhen auf Stichproben
im Testtext): *hoch* = Grenze höchstens 500 ms bei reiner Rechenzeit oder Einzelmessung (ein Scheduler- oder GC-Stillstand genügt);
*mittel* = Grenze 600 bis 1500 ms oder Mittel je Aufruf; *niedrig* = Grenze ab 2000 ms oder Obergrenze gegen einen Hänger mit großem
Abstand zum Normalwert.

| Stelle (Datei:Zeile) | Grenze | Risiko | Bemerkung | Status (nach #484) |
|---|---|---|---|---|
| `hilfe-assistent-i23.test.js:444` | < 500 ms | hoch | drei Bereinigungen, reine Rechenzeit; Absicht „nicht quadratisch“ | **gehärtet** (abwechselnde Skalierung gleicher Gesamtlänge, Grenze 2, Grobgrenze 8000 ms) |
| `intelligence-gateway-anbieter.test.js:76` | < 500 ms | hoch | Zeitüberschreitung mit 30 ms Frist; Wartezeit | **gehärtet** (Fake-Uhr) |
| `intelligence-gateway-anbieter.test.js:84` | < 600 ms | mittel | wie oben | **gehärtet** (Fake-Uhr) |
| `intelligence-gateway-review.test.js:182` | < 450 ms | hoch | Gateway-Test mit Zeitgrenze | **gehärtet** (Fake-Uhr) |
| `intelligence-gateway-review2.test.js:211` | < 400 ms | hoch | Gateway-Test mit Zeitgrenze | **gehärtet** (Fake-Uhr) |
| `intelligence-gateway-review2.test.js:215`, `:229` | < 1500 / < 1000 ms | mittel | Gateway-Test mit Zeitgrenze | **gehärtet** (Mittelpaket; jetzt `:224` / `:238`: Fake-Uhr) |
| `intelligence-gateway-review3.test.js:160` | < 2000 ms | niedrig | Zeitüberschreitung | offen (Risiko niedrig, nicht angefasst) |
| `intelligence-gateway-kern.test.js:231`, `:243` | < 1200 / < 900 ms | mittel | Frist 40 ms, Gesamtfrist 1500 ms (:231) | **gehärtet** (Mittelpaket: Fake-Uhr) |
| `import-schichtmodell-vorschau-imp6.test.js:316`, `:376` | < 500 ms | hoch | Abweisung vor der Rechnung, Einzelmessung | **gehärtet** (Zähler + Verhältnis) |
| `import-schichtmodell-vorschau-imp6.test.js:250, 329, 337, 344` | < 5000 / 2000 ms | niedrig | Rechenlast, großer Abstand | **teilweise** (Mittelpaket; jetzt `:250` / `:341` / `:349` / `:356`; Präzisierung Restpaket: `:250` unverändert, nur Kommentar mit Messwert und Vorrat 68-fach; `:341` / `:349` / `:356` Minimum aus 3 Läufen, Grenze 2000 ms bleibt, Vorrat 17- bis 36-fach; Wandzeit bleibt bei allen vier Vertrag) |
| `intelligence-nachtrag.test.js:282`, `:289` | < 500 ms | hoch | Leckprüfung, reine Rechenzeit | **gehärtet** (Test F9: abwechselnde Skalierung gleicher Gesamtlänge, Grenze 2, Grobgrenze 2000 ms) |
| `dsgvo-server.test.js:201` | < 50 ms | mittel | Aufruf kostet Mikrosekunden; ein GC-Stillstand über 50 ms ist selten, aber möglich. Ein Aufrufzähler belegt „keine Schleife“ besser | **gehärtet** (Mittelpaket: Aufrufzähler `Date.UTC`) |
| `gesund.test.js:158`, `:164` | < 5000 ms | niedrig | Zeitgrenze der Zustandsprüfung | offen (niedrig) |
| `import-parser.test.js:326, 356, 455, 737, 1131, 1198, 1300, 1306, 1339, 1346, 1443` | 1000 bis 20000 ms | niedrig; `:1339` (1000 ms) mittel; **`:1346` / `:1350` (K2-PoC `parseDatei`, 3000 ms) hoch, nicht niedrig** (unter 4 Busy-Loops in 1 bis 5 von 10 Läufen rot, gemessen 3155 bis 7094 ms) | Größenprüfungen des Parsers | `:1339` **teilweise** (Mittelpaket: Minimum aus 3 Läufen, Grenze 1000 ms bleibt, gemessen 7 ms); `:1346` / `:1350` **gehärtet** (Restpaket, jetzt `:1346` bis `:1372`: Verhältnis zur Referenz im selben Lauf plus Grobgrenze 15 s); übrige offen (niedrig) |
| `intelligence-planungsreife.test.js:215`, `intelligence-regelbaukasten.test.js:440` | < 1000 ms | mittel | Rechenzeit | **gehärtet** (Mittelpaket: abwechselnde Skalierung gleicher Gesamtgröße, Grenze 2, Grobgrenze) |
| `post-smtp.test.js:199, 268, 328` | < 1500 ms | mittel | Zeitüberschreitung gegen Attrappe | **gehärtet** (Mittelpaket: Fake-Uhr mit Speicherverbindung; das echte Socket-Ergebnis bleibt ohne Wandzeit-Grenze geprüft) |
| `schreibhalt.test.js:202` | < 1500 ms | niedrig | Haltefrist 2000 ms | offen (niedrig) |
| `nachpruefung-wp11.test.js:469` | < 300 ms (nur mit `CI`) | mittel | 300 Personen; lokal nur Warnung, in CI hart | **Vorrat belegt, Test unverändert** (Restpaket: CI-Messwerte 43 bis 85 ms, Vorrat mindestens 3,5-fach; Messwerte im Kommentar) |
| `wp16c-korrekturrevision.test.js:742` | < 5 ms je Aufruf (Mittel aus 100) | mittel | | **teilweise** (Mittelpaket: Minimum aus 7 Blöcken, Grenze 5 ms bleibt, gemessen 0,001 ms) |
| `engine-rechenkern.test.js:176` | < 30000 ms | niedrig | Richtwert, Normalwert Sekunden | offen (niedrig) |
| `imp8-testmatrix.test.js:435`, `mail-push-anbieter.test.js:378, 389`, `monatsabschluss-nachtrag.test.js:189`, `passwoerter.test.js:194` | 5000 bis 120000 ms | niedrig | Obergrenzen gegen Hänger | offen (niedrig) |
| `pruefungen/browser/bereiche.mjs:173` | > 3500 ms meldet „langsam“ | mittel | Browserlauf, nicht Vitest; Einzelmessung, nur Meldung | offen (Browserlauf; Restpaket: geprüft, bewusst nicht geändert, siehe Abschnitt „Status-Nachtrag Restpaket“) |

Nicht geändert (Mangel nicht nachgewiesen). Warteschleifen mit Obergrenze 30 bis 120 s in `abnahme-c-absturz`, `br-auswertung`,
`dauerlauf-prozess` sind Zeitüberschreitungsgrenzen ohne Leistungsaussage.

**Empfehlung (Kleinpaket, nicht umgesetzt): „Wandzeit-Grenzen in Tests auf Zähler/Skalierung umstellen“.** Zuerst die Stellen mit
Risiko *hoch*: reine Rechenzeit durch das Verhältnis zweier Größen (n und n/2, wie im Selbsttest) oder durch einen Aufrufzähler
ersetzen; Fristen und Wartezeiten gegen die eingestellte Frist plus großen Puffer prüfen statt gegen eine feste Zahl. Je Stelle ein
Mutantenbeleg (Test auf der alten Fassung rot, auf der neuen grün), die Absicht des Tests bleibt. Danach die Stellen mit Risiko *mittel*.

## Status-Nachtrag 2026-11-22 (PR #484, gemergt 2026-11-22, Merge `acd7ce85`)

PR #484 hat die Stellen mit Risiko *hoch* gehärtet (Spalte „Status (nach #484)“ in der Tabelle oben). Die Zeilennummern der Tabelle
gelten für die Fassung vor #484; wo sich Zeilen verschoben haben, steht die neue Zeile in der Statusspalte.

**Gehärtet:**
- `intelligence-gateway-anbieter.test.js:76` und `:84`, `intelligence-gateway-review.test.js:182`, `intelligence-gateway-review2.test.js:211`: Fake-Uhr statt Wandzeit.
- `import-schichtmodell-vorschau-imp6.test.js:316` und `:376`: Aufrufzähler und Verhältnis statt fester Millisekunden.
- `hilfe-assistent-i23.test.js:444`: abwechselnde Messung von Läufen gleicher Gesamtlänge, Verhältnisgrenze 2, dazu Grobgrenze 8000 ms.
- `intelligence-nachtrag.test.js`, Test F9 (Leckprüfung): dieselbe Methode, Verhältnisgrenze 2, Grobgrenze 2000 ms.

**Offen (Risiko mittel oder niedrig, bewusst nicht angefasst):** `intelligence-gateway-review2.test.js` (:224, :238),
`intelligence-gateway-kern.test.js` (:231, :243), `import-schichtmodell-vorschau-imp6.test.js` (:250, :341, :349, :356),
`intelligence-planungsreife.test.js`, `intelligence-regelbaukasten.test.js`, `post-smtp.test.js`, `dsgvo-server.test.js:201`,
`wp16c-korrekturrevision.test.js` und weitere (alle Zeilen der Tabelle mit Status „offen“). Das Kleinpaket „Wandzeit-Grenzen auf
Zähler/Skalierung umstellen“ bleibt für diese Stellen offen.

**Ehrliche Reichweite (Delta-Review Opus, 2026-11-22):**
- Quadratanteile unter der Schwelle bleiben unerkannt: im Test F9 (`intelligence-nachtrag`) ein quadratischer Anteil mit x < 1, in
  `hilfe-assistent-i23` mit x < 1/6. Auch ein Aufwand der Ordnung n log n bleibt unerkannt.
- Der MAIL-Mutant in `hilfe-assistent-i23` ergibt ein Verhältnis von 2,5 bis 2,9 gegen die Grenze 2 (nicht 3,45).
- Methodik: Gemessen wird abwechselnd mit Läufen gleicher Gesamtlänge (viele kurze gegen wenige lange Läufe). Blöcke ungleicher Länge
  sind unter Last unzuverlässig, weil der Scheduler ungleich lange Läufe ungleich stört. Der Erstansatz mit größerem Längenfaktor schlug
  unter Last in 14 von 30 Läufen fehl (Verhältnis 8 bis 9 statt 3,7).
- Nachweis: 30 Läufe unter 6 Busy-Loops, 0 Rotfälle (i23 und nachtrag).

## Status-Nachtrag Mittelpaket (2026-11-23, Branch `acc45/test/wandzeit-grenzen-mittel`)

Nur Testdateien und diese Datei geändert; kein Produktcode, keine Workflows. Der Release-Kandidat `release/rc-2026-11-22` bleibt unverändert.
Die Zeilen der Tabelle oben gelten für die Fassung vor diesem Paket; die Statusspalte nennt den Stand jetzt.

| Stelle | alt | neu | Methode |
|---|---|---|---|
| `intelligence-gateway-review2.test.js` (Zählerspeicher hängt) | `< 1500 ms` Wandzeit bei Frist 30 ms | Fake-Uhr: bei 29 ms nicht fertig, bei 100 ms `KI_LIMIT` | Fake-Uhr |
| `intelligence-gateway-review2.test.js` (Notschalter bricht Aufruf ab) | `< 1000 ms` Wandzeit bei Takt 15 ms | Fake-Uhr: Aufruf läuft bei Schalter „an“, nach Umschalten und 100 ms `KI_AUS`, Stufenfrist 10 s | Fake-Uhr |
| `intelligence-gateway-kern.test.js` (Zeitüberschreitung, Stufe 40 ms) | `< 1200 ms` | Fake-Uhr: bei 39 ms nicht fertig, bei 100 ms fertig (Gesamtfrist 1500 ms) | Fake-Uhr |
| `intelligence-gateway-kern.test.js` (Adapter ignoriert Abbruch, Stufe 30 ms) | `< 900 ms` | Fake-Uhr: bei 29 ms nicht fertig, bei 100 ms fertig (Gesamtfrist 600 ms) | Fake-Uhr |
| `intelligence-planungsreife.test.js` (200 Läufe, 40 Personen) | `< 1000 ms` | abwechselnd 1 Lauf zu 160 Personen gegen 4 Läufe zu 40 (gleiche Gesamtgröße), Verhältnis höchstens 2 (plus 4 ms), Grobgrenze 2000 ms (gemessen 46 bis 58 ms) | Skalierung |
| `intelligence-regelbaukasten.test.js` (31 Tage × 40 Personen) | `< 1000 ms` | wie oben mit 160 gegen 4 × 40 Personen, Grobgrenze 1000 ms je Durchgang (gemessen 6,6 bis 8,3 ms, Vorrat über 100-fach) | Skalierung |
| `post-smtp.test.js` (Zeitüberschreitung, Flutung, 6 Mails bei hängendem Server) | `< 1500 ms` Wandzeit | Fake-Uhr mit Verbindung im Speicher: Frist 150 ms nicht verkürzt (149 ms offen, 200 ms fertig); Flutung endet vor 1000 ms Uhrzeit bei Frist 5000 ms; 6 Mails (2 Plätze, 4 Wartende) bei 399 ms offen, bei 450 ms alle fertig | Fake-Uhr |
| `dsgvo-server.test.js` (`minusMonate`) | `< 50 ms` Wandzeit | Aufrufzähler: `Date.UTC`-Aufrufe je Rechnung gleich für 12, 12000 und 1 000 000 Monate (1 Aufruf) | Zähler |
| `wp16c-korrekturrevision.test.js` (`hatLaufendeKorrektur`) | `< 5 ms` Mittel eines Blocks | Minimum der Mittel aus 7 Blöcken zu 100 Aufrufen, Grenze 5 ms bleibt (gemessen 0,001 ms) | Vertrag mit Vorrat |
| `import-parser.test.js` `:1339` (Prüfung der Sektorketten) | `< 1000 ms` Einzelmessung | Minimum aus 3 Läufen, Grenze 1000 ms bleibt (gemessen 7 ms) | Vertrag mit Vorrat |
| `import-schichtmodell-vorschau-imp6.test.js` `:341`, `:349`, `:356` | `< 2000 ms` Einzelmessung | Minimum aus 3 Läufen, Grenze bleibt (gemessen 115 / 79 / 55 ms) | Vertrag mit Vorrat |
| `import-schichtmodell-vorschau-imp6.test.js` `:250` | `< 5000 ms` | unverändert; Messwert 74 ms und Vorrat 68-fach im Kommentar | Vertrag mit Vorrat |

**Offen (Stand Mittelpaket; `nachpruefung-wp11` und der K2-PoC sind durch den Abschnitt „Status-Nachtrag Restpaket“ unten überholt):** `nachpruefung-wp11.test.js` (300 Personen, `< 300 ms`, nur mit `CI` hart). Lokal (belastete Maschine, mit `CI=1` erzwungen)
gemessen warm 349 bis 442 ms; der Vorrat zur Grenze ist hier unter 1, auf CI unbekannt. Ein Vorrat von mindestens 10 ist nicht belegbar.
Eine Ersetzung (Zähler plus Skalierung, grobe Wandzeit-Grenze) schwächt den Vertrag „unter 300 ms“ und braucht eine Entscheidung. Nicht angefasst.
Neuer Befund aus dem Lasttest: `import-parser.test.js` K2-PoC, `parseDatei` über die Schnittstelle (Grenze `< 3000 ms`, `:1346` vor dem Paket,
Risiko niedrig, nicht angefasst): unter 4 Busy-Loops in 5 von 10 Läufen rot (3155 bis 3852 ms; auch das Minimum aus drei Läufen lag bei 3155 bis 3662 ms,
ein Minimum hilft hier also nicht). Ohne Last grün. Der Vorrat unter Last ist etwa 1. Die Stelle braucht eine eigene Härtung (Zähler oder Verhältnis zu einer
Vergleichsarbeit) und bleibt offen; die zuvor gehärtete Vorprüfung `pruefeCfb` (`:1339`) war in allen 10 Lastläufen grün.
Ebenfalls offen: `pruefungen/browser/bereiche.mjs:173` (Browserlauf), alle Stellen mit Risiko niedrig (Grenzen ab 2000 ms, Timeouts, Warteschleifen).

**Nachweis (Mutation, eigene Messung):** gesichertes Verhalten im Produktcode absichtlich verändert, Test rot, danach per `git checkout` zurückgesetzt:
- Zählerfrist `zaehlerMs` mal 100 (`gateway.mjs`): review2 Test „9 hängender Zählerspeicher“ rot.
- Notschalter-Takt mal 1000: review2 Test „10 Der Notschalter bricht …“ rot.
- Stufenfrist mal 20 (`zeitJeVersuchMs` und Stufen-Deadline): kern „Zeitüberschreitung …“ und „Adapter … blockiert nicht“ rot.
- Planungsreife: zusätzliche Schleife über alle Personenpaare (n²): Verhältnis 3,56 gegen Grenze 2, rot.
- Regelbaukasten: zusätzlicher Quadratanteil in `verteilungsregel`: Verhältnis 2,43 gegen Grenze 2, rot.
- `post-smtp`: Hauptfrist mal 10: Zeitüberschreitung, 6 Mails und weitere Tests rot; Wartezeit nicht zur Frist gezählt (Warteschlangen-Zeitgeber mal 10 und volle Frist nach dem Warten): „6 Mails“ rot; Puffer-, Zeilenlänge- und Zeilenzahl-Grenze ausgeschaltet: „Flutung“ rot (beide Muster).
- `minusMonate` mit monatsweiser Schleife und `Date.UTC`: Zähler `[2, 1001, 4168]` statt gleich, rot.
- Nicht erfasst durch einen Mutanten: wp16c, import-parser `:1339`, imp6 (Wandzeit-Verträge mit Vorrat; Mutanten lägen im Bereich Faktor 100 und mehr).

**Reichweite (was NICHT erkannt wird):**
- Planungsreife und Regelbaukasten: Quadratanteile unter der Schwelle (Verhältnis 2,43 war nur knapp rot) und n log n bleiben unerkannt;
  eine gleichmäßige Verlangsamung erkennt nur die Grobgrenze (planungsreife: bis etwa 35-fach grün, vorher bis etwa 18-fach).
- `post-smtp` mit Verbindung im Speicher prüft die Fristlogik, nicht das Verhalten eines echten Sockets; die echten Socket-Tests bleiben und prüfen das
  Ergebnis ohne Wandzeit-Grenze. Einzelne Puffer-/Zeilen-Grenzen sind redundant: ein Mutant, der nur eine davon abschaltet, bleibt grün.
- `minusMonate`: Eine Schleife ohne Date-Aufruf bleibt unerkannt (der Zähler sieht nur `Date.UTC`); die Endlosschleife mit `Infinity` wird nicht rot, sondern hängt.
- Fake-Uhr-Tests ersetzen die Zeitgeber von Vitest (in `post-smtp` nur `Date`, `setTimeout`, `clearTimeout`); sie prüfen, dass die Frist nach der eingestellten Uhrzeit greift, nicht, wie lange der Code real rechnet. Eine Frist, die über andere Uhren läuft, wäre davon nicht erfasst.
- Minimum aus mehreren Läufen (wp16c, parser, imp6) filtert einen einzelnen Stillstand, nicht einen dauerhaft gestörten Runner.

## Status-Nachtrag Restpaket (2026-11-23, Branch `acc45/test/wandzeit-grenzen-rest`)

Rest aus dem Review #500 (Opus). Geändert: Testdateien, drei Werkzeuge in `werkzeug/` und diese Datei; kein Produktcode (`server/`, `src/`), keine
Workflows, kein `deploy/`. Der Release-Kandidat `release/rc-2026-11-22` (517993ca, PR #489) bleibt unverändert; dieses Paket gehört zum nächsten Kandidaten.
Die Zeilen der Tabellen oben gelten für die Fassung vor diesem Paket.

| Stelle | alt | neu | Methode |
|---|---|---|---|
| `import-parser.test.js` K2-PoC `parseDatei` (`:1346` / `:1350` vor dem Paket) | `< 3000 ms` Einzelmessung; Doku führte „Risiko niedrig“ (falsch: unter 4 Busy-Loops in 1 bis 5 von 10 Läufen rot, 3155 bis 7094 ms) | Risiko **hoch**, gehärtet: K2-Datei und kleine gültige XLS im Wechsel (Reihenfolge je Runde gedreht), Minimum aus 6 Messungen für K2 (die erste mit Speichermessung plus 5 im Wechsel) und 5 für die Referenz; K2 `<=` 2,5 × Referenz + 500 ms; Grobgrenze 15 s; Ergebniscode `BESCHAEDIGT` (nicht `ZEITLIMIT`) bei jeder Messung | Verhältnis im selben Lauf + Grobgrenze |
| `nachpruefung-wp11.test.js:469` (300 Personen) | `< 300 ms`, nur mit `CI` hart, Vorrat unbelegt | unverändert; Vorrat auf dem CI-Runner belegt (siehe unten) | Vertrag mit belegtem Vorrat |
| `dsgvo-server.test.js` „M5: eigene Bremse“ | Zeitgrenze 60 s; unter Last Zeitüberschreitung | Zeitgrenze 600 s, Ursache belegt (siehe unten); Absicht unverändert (31 echte Anfragen) | Ursache + Zeitgrenze |
| `pruefungen/browser/bereiche.mjs:173` | `> 3500 ms` meldet „langsam“, Einzelmessung | geprüft, **nicht geändert** (siehe unten) | nur dokumentiert |
| `werkzeug/ssot-abgleich.mjs`, `ssot-belege.mjs`, `ssot-nach-integration.mjs` | unbekannte Option (`--prs=F`, `--pr F`) still ignoriert, Rückfall auf gh (Netz); `--datei` in `ssot-nach-integration` ohne Prüfung | unbekannte Option oder `--datei` ohne Wert: Rückgabe 2 vor jedem gh-Aufruf; gültige Aufrufe unverändert | Aufrufprüfung (`optionenPruefen`) |

**K2-PoC `parseDatei`.** Absicht: Eine Datei mit absteigend verketteten freien Sektoren darf über die Schnittstelle weder lange rechnen noch hängen
(vor der Korrektur K2 etwa 10 s und 2 GB, danach `ok:true`). Die Wandzeit besteht fast nur aus Fixkosten (Start des Kindprozesses, Laden der
Bibliothek): ohne Last 270 bis 290 ms für K2 und 265 bis 310 ms für eine kleine gültige XLS; mit 4 Busy-Loops 1360 bis 2620 ms gegen 780 bis 1170 ms.
Eine feste Grenze gegen die Wandzeit misst deshalb den Rechner. Die neue Zusicherung vergleicht beide Seiten im selben Lauf; die Last kürzt sich heraus.
Ein Aufrufzähler ist hier nicht möglich (die Rechnung läuft im Kindprozess; die Vorprüfung im eigenen Prozess prüft der Test davor mit Minimum aus 3 Läufen).

**nachpruefung-wp11, CI-Messwerte.** Quelle: Logs von 10 erfolgreichen Läufen des Workflows Prüfung auf `integration/release-v4` und PR-Köpfen (2026-11-23,
`gh run view <id> --log`, Schritt „Eine Schutzprüfung“, Zeile „Nachrechnung 300 Personen … warm“; Läufe 45103969316, 45106676319, 45107126067, 45112524638,
45112576924, 45112667118, 45116214633, 45116788443, 45116810675, 45118540056). Werte für `warm` (Minimum aus 3, ms): 84,7 / 64,4 / 65,5 / 69,9 / 74,5 / 57,3 /
76,3 / 43,3 / 84,5 / 78,0. Maximum 84,7 ms, Median etwa 70 ms; kalt 98 bis 171 ms. Vorrat zur Grenze 300 ms: mindestens 3,5-fach, im Median etwa 4,3-fach
(Anforderung: mindestens 3-fach). Deshalb bleibt der Vertrag „unter 300 ms“ unverändert; die Messwerte stehen als Kommentar im Test. Die lokalen Werte
(349 bis 442 ms, belasteter Rechner, mit `CI=1` erzwungen) bleiben eine Warnung. Grenze der Aussage: 10 Läufe aus einem Tag; ein langsamerer Runner-Typ ist nicht
ausgeschlossen. Fällt der Vorrat unter 3-fach (Messwert über 100 ms), ist die Stelle neu zu bewerten.

**dsgvo-server M5, Ursache.** Jede `GET /api/auskunft` macht etwa 80 Dateizugriffe der Ablage (`FSREQPROMISE`, 79 je Anfrage) und 13 Dateigriffe mit `fsync`, nacheinander
(Zählung mit `async_hooks`, 2026-11-23). Ohne Last kostet eine Anfrage etwa 80 ms (alle 31 Anfragen: 2,6 s). Mit voll belegten Kernen wartet jeder dieser Zugriffe auf eine
Zeitscheibe (etwa 15 ms unter Windows): 1 bis 3,8 s je Anfrage; mit 4 Busy-Loops 44 bis 60 s je Test, mit 5 Busy-Loops 74 bis 91 s (10 Läufe). Das ist Langsamkeit durch
Zugriffszahl mal Zeitscheibe, keine Schleife und kein Hänger. Die Absicht (30 Auskünfte gehen durch, die 31. gibt 429, andere Personen bleiben frei) bleibt unverändert mit
31 echten Anfragen; nur die Zeitgrenze des Tests steigt auf 600 s (6,6-facher Vorrat zum schlechtesten Wert). Ein Hänger endet weiter an dieser Grenze. Nicht geändert: die
Zahl der Zugriffe je Anfrage (Produktcode, nicht Teil dieses Pakets).

**bereiche.mjs:173, geprüft und nicht geändert.** Die Zeile misst den Klick auf einen Reiter einmal (`click` bis bedienbar) und meldet bei mehr als 3500 ms einen Befund
(Rückgabe 1 des Browserlaufs). Ein Minimum aus 3 Messungen verlangt, denselben Reiter dreimal neu zu laden oder nacheinander anzuklicken. Ein zweiter Klick auf einen schon
aktiven Reiter misst nichts, und ein Wechsel hin und zurück ändert die Navigationsfolge, auf der die folgenden Messungen (`messen`, Wartezeiten) aufbauen. Das ist weder klein
noch sicher. Risiko bleibt mittel (Einzelmessung, Normalwert auf CI nicht belegt). Vorschlag für später: Wiederholung nur bei einem Treffer (zweiter Klick nach Wechsel
auf einen anderen Reiter und zurück) und Meldung nur, wenn beide Messungen über der Grenze liegen.

**Werkzeuge.** `optionenPruefen` (in `ssot-abgleich.mjs`) prüft alle Optionen gegen eine Liste. `--prs=F`, `--datei=F`, `--pr F` und Tippfehler ergeben Rückgabe 2 und
„Unbekannte Option …“, bevor `gh` oder eine Datei berührt wird. In `ssot-nach-integration.mjs` prüft `argWert` jetzt `--datei` (kein Wert, leerer Wert oder Option als Wert:
Rückgabe 2); die PR-Nummer kommt nur noch aus den Argumenten ohne Option (die Zahl hinter `--datei` zählt nicht mehr), ein fremdes Argument ist ein Fehler (Rückgabe 2).
Gültige Aufrufe bleiben unverändert (Gegenproben in `pruefungen/ssot-belege.test.js`, Wegwerf-Kopie wie bei den früheren CLI-Tests, Zeitlimit 120000 je Test).
Grenze: Argumente ohne Option bleiben bei `ssot-abgleich.mjs` und `ssot-belege.mjs` wie bisher ohne Wirkung.

**Nachweis (Mutation, eigene Messung).**
- K2-PoC: Kindskript `parser-worker.mjs` um 4 s Wartezeit für Eingaben über 1 MB ergänzt (nur K2 betroffen, wirkt in der Messschleife): mit 4 Busy-Loops Verhältnis 5,1,
  Zusicherung „K2 im Verhältnis zur Referenz begrenzt“ rot (5566 ms gegen Grenze 3227 ms). Danach per `git checkout` zurückgesetzt. Die alte Fassung (`< 3000 ms`) war
  an diesem Mutanten ebenfalls rot, aber auch ohne Mutant unter Last.
- M5: Bremsgrenze `auskunft` in `server/lib/schutz.mjs` von 30 auf 3000 Versuche gesetzt: der Test ist rot („expected 200 to be 429“, 31. Anfrage). Danach per `git checkout` zurückgesetzt.
- Werkzeuge: die neuen Tests auf der alten Fassung der drei Werkzeuge: beide Tests rot (`--prs=F` lief bis zum Abgleich mit gh weiter, `--pr 316` bis zum PR-Abruf);
  auf der neuen Fassung grün.
- nachpruefung-wp11: nur Kommentar, keine Mutation nötig.

**Nachweis (Last und Zeitzone).**
- 5 parallele Busy-Loops (Node, 100 % je Kern auf 4 Kernen): K2-PoC 11 von 11 Läufen grün (Minimum K2 2110 bis 2736 ms, Referenz 1448 bis 1897 ms, Verhältnis 1,11 bis 1,77
  gegen Grenze 2,5 × Referenz + 500); M5 10 von 10 grün (74 bis 91 s); die neuen CLI-Tests 10 von 10 grün. Danach alle Busy-Loops beendet.
- `TZ=UTC` und `TZ=Europe/Berlin`: `import-parser`, `dsgvo-server`, `ssot-belege`, `ssot-nach-integration`, `nachpruefung-wp11` je gesamt grün (siehe Bericht).
- Testanzahl: `import-parser.test.js` 139 (vorher 139), `dsgvo-server.test.js` 29 (29), `ssot-belege.test.js` 21 (19), `nachpruefung-wp11.test.js` unverändert; kein `.skip`, kein `.todo`.

**Reichweite (was NICHT erkannt wird).**
- K2-PoC (Präzisierung aus Review #501, Auflage A1): „Eine Verlangsamung unter etwa 1 s (ohne Last) bis 2 s (mit Last) bleibt unerkannt“ gilt nur für eine Verlangsamung, die allein K2 (Eingaben über 1 MB) trifft. Eine gleichmäßige Verlangsamung von Kindprozess und Bibliothek (für alle Eingaben, auch für die Referenz) bleibt bei jeder Größe unerkannt, bis zur Grobgrenze 15 s bzw. zum Testlimit 120 s, weil das Verhältnis zur Referenz gleich bleibt. Belege (Mutanten, Review #501): „+1 s für alle Eingaben“ ergibt Verhältnis 1,00, der Test bleibt grün; Mutant A „nur K2 +3 s“ ergibt Verhältnis 12,6, rot; Mutant C „nur K2 +1 s“ ergibt 1267 gegen 1146 ms Grenze, rot. Das Verhältnis zur Referenz ist kein Beleg für die Rechenzeit der Vorprüfung selbst.
  Die Grobgrenze 15 s hat nur etwa 6-fachen Vorrat zum Wert unter 5 Busy-Loops (2,1 bis 2,7 s); mehr ist nicht möglich, weil die Produktgrenze ZEITLIMIT bei 20 s liegt.
  Die Verhältnisbasis ist die Zeit einer kleinen gültigen XLS; ein Kindprozess, der nur für große Eingaben langsamer startet, würde als „K2 langsam“ gelten (Fehlalarm möglich).
- nachpruefung-wp11: 10 Läufe auf dem Runner-Typ von heute; eine Verlangsamung des Runners um mehr als 3,5-fach macht die Stelle rot.
- M5: Die Zeitgrenze 600 s erkennt keinen langsamen, aber endlichen Zugriffspfad. Dafür gibt es hier keine Leistungszusicherung; sie war auch vorher nicht der Zweck des Tests.
- Werkzeuge: Eine neue Option eines Werkzeugs muss in die Liste von `optionenPruefen` aufgenommen werden, sonst lehnt das Werkzeug sie ab (gewollt, fail-closed).

**Weiter offen:** `bereiche.mjs:173`, alle Stellen mit Risiko niedrig (Grenzen ab 2000 ms, Timeouts, Warteschleifen), die Zugriffszahl je Auskunftsanfrage (Produktcode).

**Offene Folgepunkte (Nachtrag 2026-11-23, aus Review #501; nur Text, kein Code):**
- H1: `pruefungen/dsgvo-server.test.js:184` hat das Zeitlimit 600000 ms. Hängt der Test wirklich, kostet das bis zu 10 Minuten. Das Job-Limit `pruefen` liegt bei 40 Minuten, die Dauer bei 27 bis 30 Minuten. Der Vorrat ist klein.
- H2: Eine doppelte Option (`--datei F --datei G`) wird in `optionenPruefen` und `argWert` still auf den ersten Wert reduziert. Später als Fehler werten (fail-closed).
  **Erledigt (Nachtrag 2026-11-23, Branch `acc45/haertung/tiefendeckel-doppeloption`):** Der gemeinsame Helfer `optionenPruefen` (`werkzeug/ssot-abgleich.mjs`) weist jede doppelte Option ab, mit Wert und als Schalter: Meldung „Option … doppelt angegeben (höchstens einmal erlaubt)“, Rückgabe 2, bevor gh oder eine Datei berührt wird. Das gilt für `ssot-abgleich.mjs`, `ssot-belege.mjs` und `ssot-nach-integration.mjs` (kein Duplikat). Beleg: `pruefungen/ssot-belege.test.js` (Einheit und CLI je Werkzeug, SSOT byte-gleich), vor der Änderung rot (3 Tests; `ssot-nach-integration` rief dabei gh auf). Mutationen: Prüfung für Optionen mit Wert entfernt → rot; Prüfung für Schalter entfernt → rot. Gegenprobe: 8 gültige und Fehler-Aufrufe auf einer Wegwerfkopie der echten SSOT, Ausgabe und Rückgabe vor und nach der Änderung byte-gleich, Kopie unverändert.
- H4: `bereiche.mjs:173` bleibt eine Einzelmessung. Risiko mittel, offen.
