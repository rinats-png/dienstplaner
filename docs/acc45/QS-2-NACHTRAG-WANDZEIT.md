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

| Stelle (Datei:Zeile) | Grenze | Risiko | Bemerkung |
|---|---|---|---|
| `hilfe-assistent-i23.test.js:444` | < 500 ms | hoch | drei Bereinigungen, reine Rechenzeit; Absicht „nicht quadratisch“ |
| `intelligence-gateway-anbieter.test.js:76` | < 500 ms | hoch | Zeitüberschreitung mit 30 ms Frist; Wartezeit |
| `intelligence-gateway-anbieter.test.js:84` | < 600 ms | mittel | wie oben |
| `intelligence-gateway-review.test.js:182` | < 450 ms | hoch | Gateway-Test mit Zeitgrenze |
| `intelligence-gateway-review2.test.js:211` | < 400 ms | hoch | Gateway-Test mit Zeitgrenze |
| `intelligence-gateway-review2.test.js:215`, `:229` | < 1500 / < 1000 ms | mittel | Gateway-Test mit Zeitgrenze |
| `intelligence-gateway-review3.test.js:160` | < 2000 ms | niedrig | Zeitüberschreitung |
| `intelligence-gateway-kern.test.js:231`, `:243` | < 1200 / < 900 ms | mittel | Frist 40 ms, Gesamtfrist 1500 ms (:231) |
| `import-schichtmodell-vorschau-imp6.test.js:316`, `:376` | < 500 ms | hoch | Abweisung vor der Rechnung, Einzelmessung |
| `import-schichtmodell-vorschau-imp6.test.js:250, 329, 337, 344` | < 5000 / 2000 ms | niedrig | Rechenlast, großer Abstand |
| `intelligence-nachtrag.test.js:282`, `:289` | < 500 ms | hoch | Leckprüfung, reine Rechenzeit |
| `dsgvo-server.test.js:201` | < 50 ms | mittel | Aufruf kostet Mikrosekunden; ein GC-Stillstand über 50 ms ist selten, aber möglich. Ein Aufrufzähler belegt „keine Schleife“ besser |
| `gesund.test.js:158`, `:164` | < 5000 ms | niedrig | Zeitgrenze der Zustandsprüfung |
| `import-parser.test.js:326, 356, 455, 737, 1131, 1198, 1300, 1306, 1339, 1346, 1443` | 1000 bis 20000 ms | niedrig, `:1339` (1000 ms) mittel | Größenprüfungen des Parsers |
| `intelligence-planungsreife.test.js:215`, `intelligence-regelbaukasten.test.js:440` | < 1000 ms | mittel | Rechenzeit |
| `post-smtp.test.js:199, 268, 328` | < 1500 ms | mittel | Zeitüberschreitung gegen Attrappe |
| `schreibhalt.test.js:202` | < 1500 ms | niedrig | Haltefrist 2000 ms |
| `nachpruefung-wp11.test.js:469` | < 300 ms (nur mit `CI`) | mittel | 300 Personen; lokal nur Warnung, in CI hart |
| `wp16c-korrekturrevision.test.js:742` | < 5 ms je Aufruf (Mittel aus 100) | mittel | |
| `engine-rechenkern.test.js:176` | < 30000 ms | niedrig | Richtwert, Normalwert Sekunden |
| `imp8-testmatrix.test.js:435`, `mail-push-anbieter.test.js:378, 389`, `monatsabschluss-nachtrag.test.js:189`, `passwoerter.test.js:194` | 5000 bis 120000 ms | niedrig | Obergrenzen gegen Hänger |
| `pruefungen/browser/bereiche.mjs:173` | > 3500 ms meldet „langsam“ | mittel | Browserlauf, nicht Vitest; Einzelmessung, nur Meldung |

Nicht geändert (Mangel nicht nachgewiesen). Warteschleifen mit Obergrenze 30 bis 120 s in `abnahme-c-absturz`, `br-auswertung`,
`dauerlauf-prozess` sind Zeitüberschreitungsgrenzen ohne Leistungsaussage.

**Empfehlung (Kleinpaket, nicht umgesetzt): „Wandzeit-Grenzen in Tests auf Zähler/Skalierung umstellen“.** Zuerst die Stellen mit
Risiko *hoch*: reine Rechenzeit durch das Verhältnis zweier Größen (n und n/2, wie im Selbsttest) oder durch einen Aufrufzähler
ersetzen; Fristen und Wartezeiten gegen die eingestellte Frist plus großen Puffer prüfen statt gegen eine feste Zahl. Je Stelle ein
Mutantenbeleg (Test auf der alten Fassung rot, auf der neuen grün), die Absicht des Tests bleibt. Danach die Stellen mit Risiko *mittel*.
