# WP-28 — Lasttest und Skalierungsentscheid: Nachweis

Branch `acc45/infra/wp28-lasttest`, Basis `integration/centric-complete` (57717df). WP-17 (Serverdatum beim
Stempeln) ist noch nicht integriert: Das Werkzeug läuft nach dem Merge unverändert erneut (siehe „Wiederholung“).

## 1. Was gemessen wurde und womit

Werkzeug: [`werkzeug/last/lauf.mjs`](../../werkzeug/last/lauf.mjs) (eigener Messer, keine Abhängigkeit) mit
[`messfuehler.mjs`](../../werkzeug/last/messfuehler.mjs) im Server. Der Lauf startet einen **eigenen**
`server.mjs` auf `127.0.0.1` mit Wegwerfablage und erfundenen Daten; es gibt keinen Parameter für ein anderes Ziel.
Gemessen werden p50/p95/p99 und Fehlerquote je Szenario, Event-Loop-Verzögerung, Speicher, CPU und die Zeit in
Dateizugriffen im Server (Messfühler), Dateizahl und -größe der Ablage.

| Szenario | Inhalt | Zielwert Testplan 3.6 |
|---|---|---|
| S0 | Skalierungsreihe: Betrieb mit 250 / 1000 / 2000 / 4000 Personen; Lesen, Stempeln, 20 Stempel gleichzeitig in einem Raum | – (Kostenmodell) |
| S1 | Schichtwechsel: 200 Stempel/min, Bündel zu 10, über 10 min (2000 Stempel), auf zwei Betriebe à 1000 Personen verteilt; Gegenversuch mit einem Betrieb | p95 < 500 ms, 0 verlorene Stempel |
| S2 | 50 Planende, je PUT alle 30 s, 5 min, fünf Räume (einer mit 2000 Personen) | p95 < 1,5 s, nur echte 409 |
| S3 | Bestand 4,6 MB (nahe `RUMPF_MAX` 6 MB; 2000 Personen, 100 Tage Abweichungen): GET je Rolle, dann Dauerlast mit 20 Lesern | GET p95 < 2 s, Speicher stabil |
| S4 | Anmeldung mit Bremse: gültige Codes, Rateversuche, Gesamtaufkommen über 13 Betriebe | – |
| S5 | Mischlast 3 min (Stempel 100/min, Planende) mit Sicherungslauf in der Last und danach im Ruhezustand | – |
| S6 | Breite: 50 / 200 / 600 kleine Betriebe (50 Personen) | – |

Die 50 Planenden in S2 arbeiten an getrennten Monaten (jede Person ihr eigener Monat). 409 kommen daher nicht vor;
der echte Konfliktfall ist durch `pruefungen/datenintegritaet.test.js` (R2–R5) belegt, nicht hier.

**Zwei Umgebungen, getrennt ausgewertet.**

| | Linux, GitHub-Runner (CI) | Entwicklungs-Laptop |
|---|---|---|
| Rolle | **maßgeblich** (Linux, wie Produktion) | nur Gegenprobe, **kein Maßstab** |
| Maschine | 4 vCPU (AMD EPYC 9V74 bzw. Intel Xeon 8370C), 16 GB, Node 22 | 4 Kerne, Windows 11, 12 GB, Node 24, Virenschutz aktiv |
| Profil | `voll` (Grenzwerte aus dem Testplan, ≈ 24 min), zwei Läufe | `kurz` (S1 3 min, S2 2 min, S3 1 min, S5 1 min) |
| Läufe | Run 41594065948 (Stand 5d57ea4), Run 41609611866 (Stand 91499a9), S6: Run 41611535893 | je ein sauberer Lauf ohne andere Last |

Beide CI-Läufe sind aus **verschiedenen Runnern** (andere CPU-Typen); der Unterschied zwischen ihnen zeigt die
Schwankung von Gemeinschafts-Rechnern und ist unten sichtbar. Der Lasttest ist **keine** Messung des VPS.

## 2. Ergebnisse Linux-CI (maßgeblich)

### 2.1 Zielwerte aus Testplan 3.6

| Ziel | Lauf 1 | Lauf 2 | Urteil |
|---|---|---|---|
| Schichtwechsel 200/min × 10 min (2 Betriebe à 1000): p95 < 500 ms | p50 367 · **p95 988** · p99 1410 ms | p50 268 · **p95 456** · p99 508 ms | **nicht stabil erreicht** (456 ms und 988 ms); Fehlerquote 0 % |
| … 0 verlorene Stempel | 0 (2000/2000 gespeichert) | 0 (2000/2000) | **erreicht** |
| 50 Planende, PUT alle 30 s: p95 < 1,5 s | PUT p95 287 ms (500 PUT) | PUT p95 81 ms (499 PUT) | **erreicht**; 0 × 409 (getrennte Monate) |
| Bestand 4,6 MB: GET p95 < 2 s | einzeln 405–522 ms je Rolle; Dauerlast p95 **1673 ms** (p99 4,0 s) | einzeln 384–465 ms; Dauerlast p95 **1672 ms** (p99 3,9 s) | **erreicht**, aber an der Kante (siehe 2.3) |
| … Speicher stabil | im Fenster der Dauerlast 212 → 211 MB (Spitze 605 MB) | im Fenster der Dauerlast 248 → 288 MB (Spitze 569 MB) | **stabil**: über den ganzen Lauf (23 min) RSS 99 → 134 MB bzw. 96 → 120 MB, kein anhaltendes Wachstum; Spitzen durch gleichzeitige 4,7-MB-Antworten |

Der Schichtwechsel liegt knapp um das Ziel; die Streuung zwischen den Läufen (456 / 988 ms) ist größer als der
Abstand zum Zielwert. Die Ursache liegt im Aufbau der Probe: Zehn gleichzeitige Stempel in einem Raum laufen
nacheinander durch die Raumsperre (WP-02). Aussage daher: **mit zehn gleichzeitigen Stempeln je Betrieb und
1000 Personen ist p95 < 500 ms nicht zugesichert**; für kleinere Betriebe und kleinere Bündel gilt es deutlich.

### 2.2 Kostenmodell (S0): Haltedauer eines Stempels

20 Stempel gleichzeitig in **einem** Raum laufen durch die Raumsperre nacheinander; Gesamtdauer / 20 ist die
Haltedauer je Stempel und damit die obere Grenze für Stempel je Minute in diesem Raum **ohne** Bremse.

| Personen im Betrieb | Antwort Bestand | GET p95 (einzeln) | Stempel p95 (einzeln) | Haltedauer je Stempel (Lauf 1 / Lauf 2) | Obergrenze ohne Bremse |
|---|---|---|---|---|---|
| 250 | 45 KB | 22–30 ms | 32–149 ms | 17 / 18 ms | ≈ 3300–3600/min |
| 1000 | 177 KB | 14–17 ms | 41–46 ms | 29 / 31 ms | ≈ 1900–2100/min |
| 2000 | 355 KB | 20–24 ms | 53–228 ms | 124 / 48 ms | ≈ 480–1260/min |
| 4000 | 710 KB | 35–37 ms | 89–360 ms | 149 / 82 ms | ≈ 400–740/min |

Je Stempel-Anfrage fallen im Server rund 15 `fsync`, 8 `rename` und 17 `readFile` an (S1: 31 600 / 15 800 / 34 000 für
2000 Stempel, einschließlich Bremszähler, Sitzung und Protokoll); die Haltedauer wächst grob linear mit der
Betriebsgröße. Die Event-Loop blieb im Schichtwechsel unter 30 ms (p99), der Server-Prozessor im Mittel bei 13–16 %
(Spitze 55–89 %).

### 2.3 Große Bestände (S3)

Eine Antwort von 4,6 MB kostet im Server etwa 0,4 s Rechenzeit (JSON-Aufbereitung je Rolle). Mit 20 Lesern
gleichzeitig (≈ 3,3 Antworten/s ≈ 200/min) ist **ein Prozessorkern voll ausgelastet** (CPU 101–102 %,
Event-Loop-Verzögerung p99 bis 330 ms, p99 der Antworten 4 s). Das ist die Grenze für einen Betrieb dieser Größe;
die Lesebremse (300/min je Raum) liegt **darüber** und schützt hier nicht.

### 2.4 Anmeldung mit Bremse (S4)

* Rateversuche von einer Herkunft: ab dem 9. Versuch gebremst (8 erlaubt je 5 min) — wie vorgesehen.
* **Betriebslimit:** Von 277 ehrlichen Anmeldungen (gültige Codes, jeweils eigene Herkunft) **in einen Betrieb**
  kamen **40 durch, 237 wurden mit 429 abgewiesen**. Die Grenze „ziel“ (`WEITERE.anmelden.ziel`, 40 je 5 min)
  zählt jeden Versuch **einschließlich der erfolgreichen**.
* **Gesamtlimit:** Verteilt auf 13 Betriebe (je Betrieb unter 40) kamen im Lauf 2 354 von 455 durch; zusammen mit
  den 43 Anmeldungen davor sind das 397 — die Gesamtgrenze (`WEITERE.anmelden.gesamt`, 400 je 5 min für den
  ganzen Dienst) greift bei rund 400 gezählten Anmeldungen, ebenfalls einschließlich der erfolgreichen
  (Lauf 1: 351 + 40 = 391).

### 2.5 Mischlast und Sicherung (S5)

Stempel (100/min), Planende und Lesen gleichzeitig: Lauf 1 Stempel p95 1312 ms, Lauf 2 p95 586 ms, 0 Fehler,
0 verloren, PUT p95 81–354 ms.

**Sicherung in der Last:** `ablage-sicherung sichern` während dieser Last scheitert in beiden Läufen nach drei
Versuchen („Die Ablage hat sich während der Sicherung verändert“, Rückgabe 3, keine Sicherung angelegt). Das ist
das dokumentierte Verhalten (BETRIEB-SICHERUNG, Konsistenz: Nachvergleich, drei Versuche, Fail-Ping). **Im
Ruhezustand** danach: 5116 Dateien / 51,6 MB in **4,8 s**, vollständig. Fenster ohne Schreiblast sind also nötig;
nachts um 02:30 ist das gegeben, bei Dauerbetrieb mit Nachtschicht nicht zugesichert.

### 2.6 Breite (S6)

| Betriebe (je 50 Personen) | Dateien in der Ablage | GET p95 | Stempel p95 |
|---|---|---|---|
| 50 | 3474 | 21 ms | 34 ms |
| 200 | 4079 | 6 ms | 18 ms |
| 600 | 5399 | 7 ms | 24 ms |

Antwortzeiten hängen **nicht** von der Zahl der Betriebe ab (bis 600 geprüft); ein kleiner Betrieb belegt rund 9–10
Dateien plus je eine Datei je Sitzung. Der Dateizähler wächst mit Sitzungen, Protokoll (`centric-spur`) und
Bremszählern (`centric-takt`); im 24-min-Lauf waren es 11 800 Dateien / 50 MB bei 15 großen Betrieben.

## 3. Ergebnisse Entwicklungs-Laptop (Windows, nur Gegenprobe)

Die Zielwerte werden dort **verfehlt**; das ist ein Befund über diese Umgebung, nicht über Produktion.

| Messung | Laptop (kurz) | Linux-CI (voll) |
|---|---|---|
| Schichtwechsel, 200/min (3 min): Antworten ohne Fehler | 65 % (35 % 503/500) | 100 % |
| … Stempel p50 | 16 s | 0,27–0,37 s |
| Stempel einzeln (250 Personen) | p50 0,8 s | p50 21 ms |
| `readFile` im Server (Mittel, unter Last) | 40–900 ms | 0,1–9 ms |
| `fsync` (Mittel) | 12–170 ms | 0,5–6 ms |
| Sicherung in der Last | bricht mit `ENOENT` ab (siehe Befund 6) | scheitert nach 3 Versuchen |
| Sicherung im Ruhezustand | 27,9 MB in 102 s | 51,6 MB in 4,8 s |

Die 503 sind nach Lage des Codes **`SPEICHERN_BELEGT`** — die Raumsperre wurde innerhalb von 15 s nicht frei
(`SPERRE_ZEITGRENZE`; der Fehlercode wurde vom Werkzeug nicht mitgeschrieben); verloren ging dabei kein Stempel (die 503 sagen ausdrücklich „nichts gespeichert“; 1–5 mal
500 mit gespeichertem Stempel, siehe Befund 7). **Ursache ist die Dateiablage von Windows, nicht die Sperre:** Die
Zeit pro Dateizugriff ist 20- bis 100-mal höher als unter Linux (Messfühler), dadurch dauert jeder Stempel unter
der Sperre Sekunden und die Warteschlange läuft über die Zeitgrenze. Unter Linux bleibt dieselbe Last unter
einer Sekunde. Der Messfühler zeigt auch: Der Prozessor ist am Laptop nicht die Grenze (Mittel 45–55 %).

## 4. Befunde

| # | Befund | Zahlen | Bewertung |
|---|---|---|---|
| 1 | **Schreibbremse 120/min je Raum** macht den Schichtwechsel eines großen Betriebs unmöglich. Stempel, Planänderungen und alle weiteren Schreibvorgänge teilen sich das Konto „schreiben“ je Raum (`GRENZEN.schreiben`, Kennung = Raum). | Gegenversuch ein Betrieb, 200/min: **120 durch, 80 mit 429** (40 %), Server dabei fast unbelastet (Haltedauer 29 ms → Obergrenze ≈ 2000/min). Die Bremse liegt rund **17-mal unter** der Leistungsgrenze eines 1000-Personen-Betriebs. | **P1** (Verfügbarkeit): Ab etwa 1200 Personen mit 50 % Stempeln in 5 min (oder 1800 mit einem Drittel) lehnt der Server Stempel ab. Nicht geändert, siehe Vorschlag 5. |
| 2 | **50 Planende mit PUT alle 30 s in einem Betrieb** ergeben 100 PUT/min — 83 % der Schreibbremse. Mit Stempeln im selben Raum überschritten. | Im Test auf fünf Räume verteilt. | P2; in 5 mit abgedeckt. |
| 3 | **Anmeldung: 40 je 5 min und Betrieb** zählt auch erfolgreiche Anmeldungen. Sitzungen dauern 12 h; zum Schichtbeginn melden sich also viele auf einmal an. | 277 ehrliche Anmeldungen in einen Betrieb: **40 durch, 237 abgewiesen** („Bitte in 5 Minuten erneut versuchen“). | **P1** für den Echtbetrieb: Ein Betrieb mit 100+ Personen kann sich zum Schichtbeginn nicht in fünf Minuten anmelden. Nicht geändert, siehe Vorschlag 4. |
| 4 | **Dienstweites Anmeldelimit 400 je 5 min** zählt ebenfalls erfolgreiche Anmeldungen. | Greift bei ≈ 400 Anmeldungen (391–397 gemessen) im Dienst. | P2 (bei 20+ Betrieben mit gleichen Schichtzeiten relevant). |
| 5 | **Lesebremse schützt große Betriebe nicht:** 300 Antworten/min je Raum liegen über der Rechenleistung für 4,6-MB-Bestände (≈ 200/min). | Kern ausgelastet, p99 4 s. | P2; die Dateigröße je Antwort, nicht die Anzahl, ist die Kenngröße. |
| 6 | **`ablage-sicherung sichern` bricht unter Last mit `ENOENT` ab statt zu wiederholen** (nur Windows beobachtet, aber derselbe Code): `quelleAnsehen` ruft `stat` für eine Datei, die zwischen `readdir` und `stat` ersetzt wurde. Die Wiederholungsschleife (3 Versuche) greift nicht, weil der Fehler vorher geworfen wird. | Laptop S5: Rückgabe 1 nach 2–7 s in allen 4 Läufen, in 3 davon mit der Meldung `ENOENT … stat` belegt. | P3 (WP-04): `ENOENT` an dieser Stelle als „verändert“ behandeln und neu versuchen. Nicht Teil dieses Pakets. |
| 7 | **500 mit gespeichertem Stempel** (Laptop, Raumsperre-Zeitgrenze bei langsamen Platten): 1–5 mal ein Stempel mit Antwort 500 und trotzdem gespeichert. Unter Linux 0. | 1–5 von 600 | P3: Client darf bei 500 nicht blind wiederholen; ob ein Wiederholen doppelt stempelt, wurde hier nicht geprüft. |

## 5. Vorschlag Bremsenkonzept (nicht umgesetzt)

Ziel: Missbrauch begrenzen, aber ehrliche Spitzen durchlassen. Alle Zahlen sind Ausgangswerte für die Entscheidung des
Nutzers, abgeleitet aus Abschnitt 2.2.

1. **Stempeln von „schreiben“ trennen.** Eigene Bremsart `stempeln` mit zwei Ebenen: **je Sitzung/Person** (z. B. 10/min —
   niemand stempelt öfter) und **je Raum** als Schutz der Rechenleistung statt als Missbrauchsgrenze, abgestuft nach
   Betriebsgröße aus der Haltedauer (Höchstens die Hälfte der gemessenen Obergrenze): bis 1000 Personen 600/min,
   bis 2000 Personen 400/min, darüber 200/min.
2. **Planänderungen (PUT) getrennt** je Raum belassen (120/min, genügt für 50 Planende bei 30 s), damit eine
   Stempelspitze keine Planung blockiert und umgekehrt.
3. **Kennung je Sitzung statt je Raum** für alles, was eine Person auslöst: Ein fehlerhafter Client verbraucht nur sein
   eigenes Kontingent, nicht das der Kolleginnen.
4. **Anmeldung:** erfolgreiche Anmeldungen **nicht** auf `ziel` und `gesamt` anrechnen (wie bei der Herkunft schon:
   `entlasten`), oder die Grenzen auf das Mehrfache anheben (Betrieb ≥ 300, dienstweit ≥ 2000 je 5 min). Fehlversuche
   bleiben gedeckelt, damit das Raten weiter gebremst wird.
5. **429 darf nie wie ein verlorener Stempel aussehen:** Antwort mit `Retry-After`; der Offline-Stapel der App (WP-07)
   wiederholt mit Zurückweichen; die Oberfläche sagt „nicht erfasst, wird nachgetragen“, nicht „Fehler“.
6. **Beobachten:** Zähler 429 je Bremsart in `/gesund` (Warnung bei mehr als 1 % der Stempelanfragen in 5 min). So
   zeigt sich die Spitze, bevor Nutzende sie melden.

## 6. Entscheidung: Dateiablage oder Datenbank

**Die Dateiablage reicht** für den Pilot und die nächste Ausbaustufe, solange **alle** diese Schwellen eingehalten
werden. Die Schwellen folgen aus den Messungen (Linux-CI, eine Instanz mit 4 vCPU):

| Schwelle | Wert | Herleitung |
|---|---|---|
| Personen je Betrieb | **bis 2000** | Bestand 4,6 MB bei 2000 Personen mit 100 Tagen Abweichungen; darüber nähert sich die Antwort `RUMPF_MAX` (6 MB), und ein Kern schafft nur ≈ 200 Antworten/min. Einzel-GET 0,4–0,5 s. |
| Stempelspitze, alle Betriebe zusammen | **bis ≈ 800 Stempel/min** | S1: 200/min mit 13–16 % Prozessor, linear hochgerechnet ≈ 1250–1500/min bis zur Auslastung eines Kerns; **60 % Reserve** → 800/min. Das ist **hochgerechnet, nicht gemessen** (gemessen bis 200/min). |
| Personen insgesamt | **bis ≈ 10 000** (≈ 100 Betriebe à 100) | Bei einem Drittel der Belegschaft in 5 min: 800/min ↔ 12 000 Personen; mit Sicherheitsabschlag 10 000. Zeiten hängen nicht von der Zahl der Betriebe ab (bis 600 Betriebe geprüft). |
| Instanzen | **genau eine** | Raumsperre, Bremse und Zähler liegen im Prozess und in Dateien eines Verzeichnisses; zwei Instanzen auf derselben Ablage sind nicht vorgesehen (siehe `prozesssperre`). |
| Sicherungsfenster | tägliche Zeit ohne Schreiblast | Sicherung scheitert unter Last (2.5); ruhig 51 MB in 4,8 s. |

**Wechsel auf eine Datenbank (oder Aufteilung in Prozesse nach Raum)** wird nötig, wenn **eine** dieser Bedingungen
eintritt: (a) ein Betrieb über 2000 Personen oder Bestand über ≈ 5 MB; (b) Stempelspitze dauerhaft über ≈ 800/min;
(c) mehr als eine Instanz (Verfügbarkeit, Rollover ohne Pause); (d) Betrieb rund um die Uhr ohne ruhiges
Sicherungsfenster; (e) Dateizahl der Ablage über ≈ 100 000 (nicht gemessen; die `readdir`-Zeit stieg im Lauf von 0,8 auf 4,9 ms,
während die Stores wuchsen — Zusammenhang nicht gesondert geprüft). Für den Pilot (1–10 Betriebe) liegt jede Größe um mehr als eine Größenordnung
unter den Schwellen.

**Ehrliche Unsicherheiten**
* Alle Daten sind erfunden; Nutzungsmuster (wie viele öffnen die App wann, Wiederholungen bei Fehlern) sind nicht
  bekannt. Die Schwellen setzen die Annahme „ein Drittel in 5 min“ und eine App ohne Dauerabfrage voraus.
* Der Server-Rechner (VPS) ist nicht gemessen worden; `fsync` auf der Produktionsplatte kann schneller oder deutlich
  langsamer sein als auf dem Runner. Die 800/min sind ein Wert für **diese** Runner-Klasse. Eine Messung auf dem
  Staging-VPS (mit Zugriff durch den Nutzer) würde den Wert absichern.
* Die zwei CI-Läufe streuen (Schichtwechsel p95 456 vs. 988 ms); ein Lauf ist keine Aussage. Läufe über Stunden
  (Wachstum der Zähler- und Protokolldateien, Aufräumen) wurden nicht gemacht.
* Hochrechnung 800/min und 10 000 Personen sind **rechnerisch**, nicht gemessen; gemessen sind 200 Stempel/min und
  zwei Betriebe à 1000 Personen, dazu Einzelmessungen bis 4000 Personen.
* Die Stempelzahl je Person und Tag ist angenommen (zwei).

## 7. Wiederholung nach WP-17 und CI

```
node werkzeug/last/lauf.mjs --profil kurz|voll [--nur S1,S3] [--aus ergebnis.json]
```

CI: Workflow `Lasttest` (`.github/workflows/lasttest.yml`): von Hand (`workflow_dispatch`) — sobald die Datei auf
dem Standardzweig liegt. Solange sie nur auf dem Paketzweig liegt, löst ein Push auf
`werkzeug/last/ci-anforderung.txt` (Zeile `profil nur`, `-` = alle) den Lauf aus; **dieser Push-Auslöser ist beim
Zusammenführen zu entfernen**. Ergebnis: Zusammenfassung des Laufs und Artefakt `lasttest-ergebnis`. Der Workflow läuft
nie bei normalen Pushes oder PRs, braucht keine Secrets und spricht nur den Server im Runner an.

Nach WP-17 (Serverdatum) unverändert erneut ausführen; die Werkzeug-Aufrufe schicken das Datum weiter mit.
Ergebnisdateien der hier ausgewerteten Läufe: Artefakte der oben genannten CI-Läufe (Aufbewahrung 90 Tage);
Laptop-Ergebnisse nicht im Repository.
