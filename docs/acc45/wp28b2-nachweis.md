# WP-28b/2 Nachweis — Sicherung unter parallelen Schreibvorgängen

Branch `claude/wp-28b-datensicherung-last-1yiwh0`, Basis `integration/release-v4` (`087fbe9`).
Nur Wegwerf-Daten in Temp-Verzeichnissen; kein Zugriff auf Produktion, VPS, Staging oder echte Sicherungen.

> **Status: sicherer, fail-closed arbeitender Teilfix — keine vollständige Lösung.**
> - Behoben: rohes `ENOENT` beim Store-Verzeichnis; Nachkopieren statt Verwerfen; veraltete Kopie bei gleicher Größe und
>   mtime (Inode); Werkstatt im Fehlerpfad.
> - **Nicht gelöst: eine zuverlässig abgeschlossene Sicherung unter Dauerlast.** Bei etwa 17 Schreibvorgängen pro
>   Sekunde auf 3000 Dateien gelang nur **1 von 14** Sicherungen (alle übrigen Code 3 + Fail-Ping, nie eine halbe
>   Sicherung). Dazu und zur Konsistenz über mehrere Dateien: §6 und §8.
> - Folgeaufgabe: konsistente Sicherung über einen kurzen koordinierten Schreib-Halt im Server, siehe
>   `docs/acc45/wp28b2-empfehlung-konsistente-sicherung.md`.

## 1. Ausgangslage

WP-28b (Teil 1, `docs/acc45/wp28b-nachweis.md`) hat `ENOENT` zwischen `readdir` und `stat` sowie beim `readFile`
bereits behoben und ist in `integration/release-v4` enthalten (`e88d1c1`, `5094749`). Dieser Nachweis prüft, ob die
Sicherung unter Last damit zuverlässig ist. Ergebnis: **nein, zwei Lücken blieben.**

### Ursache 1 — ENOENT beim Listen eines Store-Verzeichnisses (rohes `ENOENT`, keine Wiederholung)

`quelleAnsehen` liest erst die Wurzel, dann je Store-Verzeichnis (`readdir`). Verschwindet ein Store-Verzeichnis
dazwischen (verschoben, ersetzt — z. B. durch eine gleichzeitig laufende `wiederherstellen`, die Verzeichnisse
nach `.vor-wiederherstellung-…` schiebt), warf `readdir` ein rohes `ENOENT`: Abbruch mit Rückgabe 1, ohne
Wiederholung. Gleiche Klasse wie Befund 6, nur eine Stufe weiter oben.

### Ursache 2 — jede einzelne Änderung verwarf den ganzen Durchgang

`sichern` verglich nach dem Kopieren die Fingerabdrücke aller Dateien. Hatte sich **eine** Datei geändert, wurde
alles verworfen und von vorn kopiert. Damit braucht der Lauf eine Ruhe von der Dauer des gesamten Kopierens
(Lasttest-Messung: 5116 Dateien/51,6 MB = 4,8 s). Bei 13 Stempeln/s ist die Wahrscheinlichkeit dafür praktisch 0;
alle drei Versuche scheitern mit Code 3 (so im Lasttest S5 dokumentiert: „scheitert nach drei Versuchen“).
Das ist kein Datenverlust (fail-closed), aber die Sicherung unter Last kommt nie zustande.

## 2. Reproduktion vor der Korrektur

Tests in `pruefungen/wp28b-sicherung-last.test.js`, committet **vor** der Korrektur (Commit `232c157`):

| Test | Stand vor der Korrektur |
|---|---|
| Verzeichnis verschwindet zwischen Wurzel- und Innenliste | **rot** — `ENOENT: … scandir '…/centric-spur'` roh |
| Schreibwelle (20 Schreibvorgänge während des Kopierens) | **rot** — „Nach 3 Versuchen aufgegeben, keine Sicherung angelegt“ |
| Konto + Mitgliedschaft nicht zerrissen; gelöscht/verschoben/neu; Dauerlast bleibt Code 3; echte Schreiber | grün (Sicherheitsnetz, gilt vorher wie nachher) |

Ungemockter Stresstest (Wegwerf-Ablage über die echte `server/lib/ablage.mjs`, 4 Schreiber ≈ 19–25 Schreibvorgänge/s
auf 8–60 Schlüssel, zusätzlich Verschieben ganzer Store-Verzeichnisse, 40 `sichern`-Läufe je Modus):

| | vorher | nachher |
|---|---|---|
| Schreiber auf Dateien | 0/40 erfolgreich (alle Code 3) | **40/40** (Wiederholung nach Review: 30/30), jede besteht `pruefen` |
| Schreiber + verschobene Verzeichnisse | 0/40 | **40/40** (Wiederholung nach Review: 30/30), jede besteht `pruefen` |
| Volllast (> 1 Mio. Schreibvorgänge, Schreiber ohne Pause) | 30/30 Code 3 | (nicht erneut gefahren; Verhalten bleibt fail-closed, Test „Dauerlast“) |

In keinem Lauf trat ein anderer Fehler als Code 3 auf; kein rohes `ENOENT`.

## 3. Umsetzung (`werkzeug/ablage-sicherung.mjs`)

1. `quelleAnsehen`: `ENOENT` beim `readdir` eines Store-Verzeichnisses = Veränderung (`veraendert: true`), wie schon
   beim `stat`. Andere Fehler werden weiter geworfen. Die `stat`-Aufrufe laufen in Blöcken zu 64 gleichzeitig
   (5000 Dateien: ~220 ms → ~120 ms; kürzere Liste = kürzeres Fenster für Störungen). Ergebnis und Fehlerverhalten
   unverändert, bis auf die Rangfolge, wenn zugleich ein `stat`-Fehler (außer ENOENT) und ein Symlink/eine Fremddatei
   in einem späteren Store auftreten (früher der erste in Listenreihenfolge, jetzt zuerst Code 2). Review B7.
2. `sichern`: Nachkopieren statt Verwerfen. Je Versuch bis zu `runden` (Vorgabe 12) Runden:
   - Eine Datei gilt als gesichert, wenn ihre Kopie zum Fingerabdruck (Größe, mtime, Inode) aus der Liste **vor** dem Lesen
     gehört. Veraltete Kopien (Datei geändert, gelöscht, verschoben) werden sofort samt Datei in der Werkstatt
     verworfen.
   - Danach wird die Quelle erneut angesehen. **Stabil** ist ein Stand erst, wenn dieser Durchlauf keine
     Veränderung meldet, dieselbe Dateimenge liefert und jede Datei zum Fingerabdruck ihrer Kopie passt. Dann hat
     sich zwischen Lesen und Prüfdurchlauf nichts verändert, das sich an Größe, mtime, Inode oder Dateimenge
     zeigt — für alle Dateien zugleich (derselbe Maßstab wie bisher, nur dass nicht mehr alles neu kopiert werden
     muss; auch bisher kein Beweis eines je existierenden Zustands bei zyklisch wandernden Dateien).
   - Jeder Abbruch im Lauf (auch Code 1/2) räumt die Werkstatt `.unfertig-…` im Ziel weg (Review B6, war
     vorbestehend).
   - Sonst werden nur die abweichenden Dateien in der nächsten Runde neu gelesen. Nach `runden` Runden ohne Ruhe:
     Versuch verwerfen, Werkstatt löschen, Pause, nächster Versuch; nach `versuche` (3) Abbruch mit **Code 3**.
   - Manifest (`stores`, `ausgelassen`, `summe`) stammt aus der Liste des stabilen Durchlaufs.
   - Weiterhin: Gegenprobe `pruefen(werkstatt)` vor dem Umbenennen, `FERTIG` zuletzt, nie eine Sicherung ohne
     Gegenprobe.
3. **Ruhezeit `--ruhe <ms>`** (Kommandozeile Vorgabe 1000, Bibliotheksaufruf `ruhe` Vorgabe 0): Ist ein Stand stabil,
   wartet das Werkzeug `ruhe` ms (Monotonzeit) und prüft in einem zweiten vollständigen Durchlauf erneut; nur wenn
   auch dieser unverändert ist, gilt die Sicherung. Grund und Messung: §8. Eingeführt nach der Rückfrage, ob ein
   erfolgreicher dateiweiser Vergleich einen Gesamtzustand über zusammengehörige Dateien garantiert.

Bewusst **nicht** gemacht: ein Schnellverfahren über Verzeichnis-Zeitstempel (würde zwei Schreibvorgänge im
selben Zeitstempel-Takt übersehen = stiller Konsistenzfehler); Änderung von `versuche`; Änderung bestehender Tests.

## 4. Tests nach der Korrektur

- `npx vitest run pruefungen/wp28b-sicherung-last.test.js` → 15 von 15 grün (mehrfach wiederholt, stabil).
- Mutationsproben (jeweils Test rot): kein Fingerabdruck-Vergleich im Prüfdurchlauf (6 rot), gelöschte Kopien nicht
  verwerfen (1), geänderte Dateien nicht neu kopieren (2), `verwerfen` löscht die Datei nicht (6), `ENOENT` beim
  Store-`readdir` wieder roh (1). Eine erste Fassung der Mutation „gelöschte Kopien nicht verwerfen“ blieb grün und
  deckte einen echten Fehler in der ersten Umsetzung auf (veraltete Einträge verhinderten die Stabilität; der
  zweite Versuch verdeckte es) — behoben, Test um „gelingt in einem Versuch“ ergänzt (`einVersuch`).
- Betroffene Testfamilie (`ablage-pruefen*`, `sicherung-ablage`, `wp28b-sicherung-enoent`, `sicherungen`,
  `deploy-automatik`, `zweifaktor`): siehe PR-Beschreibung.

## 5. Wiederherstellungsprüfung

Im Test „Schreibwelle“: Sicherung unter Last → `pruefen` ok → Byte-Vergleich Sicherung = Quelle (Endstand) →
`wiederherstellen` in ein leeres Wegwerf-Ziel → Byte-Vergleich Ziel = Quelle. Im Test „gelöscht/verschoben/neu“
und „Größe ändert sich, dann weg“: Sicherung = Endstand, gelöschte Datei nicht enthalten, neue enthalten,
Manifest-Zahlen stimmen mit der Wirklichkeit.
Maßstab-Test (`~3000` Dateien à 3 kB, ~17 Schreibvorgänge/s, Konto/Mitgliedschaft in fester Reihenfolge
geschrieben): zwei Reihen mit 8 und 6 Läufen, davon 1 erfolgreich (alle übrigen Code 3, keine anderen Fehler). Die eine entstandene Sicherung
bestand `pruefen` und zeigte keine zerrissene Konto-Mitgliedschafts-Kombination. Eine Stichprobe von 1 belegt die
Konsistenz nicht statistisch; sie stützt sich auf die deterministischen Tests (Abschnitt 4).

## 6. Verbleibende Risiken

- **Unter Dauerlast gibt es keine zuverlässig abgeschlossene Sicherung.** Der Stand muss einmal für die Dauer eines
  Prüfdurchlaufs (5000 Dateien ≈ 120 ms) **und** der Ruhezeit (Vorgabe 1 s) still stehen. Gemessen (Maßstab-Test,
  ~3000 Dateien à 3 kB, ~17 Schreibvorgänge/s, ohne Ruhezeit): **1 von 14** Sicherungen gelang (vorher 0 von 14);
  mit Ruhezeit 1 s bei Transaktionen alle 100 ms **0 von 5**. Bei ~19–25 Schreibvorgängen/s auf wenige Dutzend
  Dateien (ohne Ruhezeit) 140/140 (vorher 0/80) — das zeigt den Gewinn durch Nachkopieren, ist aber **kein**
  Beleg für Dauerlast an der Produktionsgröße. Das Ergebnis ist dann Code 3 + Fail-Ping, nie eine halbe Sicherung;
  dasselbe Verhalten wie bisher, nur seltener nötig. Abhilfe unverändert: ruhiges Fenster (02:30) oder Server
  vorher stoppen. Echte Abhilfe: kurzer Schreib-Halt im Server (Empfehlung, nicht umgesetzt).
- **Ruhezeit kostet Zeit.** Eine erfolgreiche Sicherung braucht mindestens `ruhe` länger (gemessen ~3,3 s je Lauf bei
  kleinem Bestand); ein Fehlschlag unter Dauerlast ~18 s je Aufruf (bis zu 3 Versuche × 12 Runden × Ruhezeit).
- **Lücken länger als die Ruhezeit bleiben möglich** (z. B. wenn eine Transaktion auf die Raumsperre wartet, Grenze
  15 s). Ein Schnitt mitten in einer Anwendungstransaktion ist absturzgleich: die Anwendung fängt ihn fail-closed
  ab (Konto ohne Mitgliedschaft öffnet nicht, bis neu eingeladen wird; `accounts.mjs:732-762`).
- **Zeitstempel-Auflösung / Austausch (Review B1).** Auf ext4 (Kernel 6.18) bekamen 100 000 atomare Schreibvorgänge
  nur 50 012 verschiedene mtimes: Größe + mtime allein reichen nicht. Der Fingerabdruck enthält deshalb jetzt die
  Inode (jeder atomare Schreibvorgang der Ablage erzeugt eine neue). Restrisiko: Inode-Wiederverwendung bei drei
  Schreibvorgängen im selben mtime-Takt; zyklisches Wandern von Dateien. Auf Dateisystemen mit instabiler Inode
  (manche FUSE/Netzlaufwerke) würde der Lauf nie stabil → Code 3 (fail-closed, keine falsche Sicherung).
- **Windows.** Die ursprüngliche Beobachtung (Befund 6) stammt von Windows; transiente `EPERM/EBUSY/EACCES` beim
  `readFile`/`stat` während eines Ersetzens wurden hier **nicht** untersucht (kein Windows verfügbar) und bleiben
  ein rohes Fehlerbild (Rückgabe 1).
- **Dauer.** Ein verworfener Versuch kopiert wieder alles (5000 Dateien ≈ 5,8 s). Worst case 3 × (Kopie + 12 Runden).
- **S2/S5-Nachlauf (E-20)** bleibt Handstart des Betreibers; hier wurde nichts gegen Staging/VPS gefahren.
- `pruefungen/gesund.test.js` ist in dieser Sandbox bereits ohne diese Änderung rot (freier Plattenplatz 11,8 %
  → Stufe „warnung“); nicht Teil dieses Pakets.

## 7. Unabhängiger Review und Umgang mit den Befunden

Fresh-Agent-Review (nur lesend, Mutationen in einer Kopie; ~30 Experimente, u. a. 1817 Fuzz-Läufe mit heißem
Konto/Mitglied-Schreiber: 0 zerrissene Sicherungen, 0 sonstige Fehler). Befunde und Behandlung:

| Befund | Schwere | Behandlung |
|---|---|---|
| B1 Größe+mtime nicht eindeutig; veraltete Kopie kann als stabil durchgehen (vorbestehend, reproduziert mit erzwungener gleicher mtime) | mittel | **behoben**: Inode im Fingerabdruck; Test B1 vorher rot, Mutation „ohne Inode“ rot |
| B2 reine Löschung nach letzter Kopie ungetestet (Mutation `length`-Vergleich überlebte) | niedrig | Test B2; Mutation rot |
| B3 kein Test über Blockgröße 64 (Mutationen `STAT_BLOCK±1` überlebten) | niedrig | Test B3 (150 Dateien); beide Mutationen rot |
| B4 Test „echte Schreiber“ lief praktisch nur im Fehlerzweig | niedrig | Schreiber mit 25 ms Pause; verlangt ≥ 1 Erfolg von 4 |
| B5 leerer Store ungetestet (Mutation überlebte) | niedrig | Test B5 inkl. Wiederherstellung; Mutation rot |
| B6 Abbruch mit Code 1/2 hinterließ `.unfertig-…` (vorbestehend) | niedrig | **behoben** (try/catch um die Versuchsschleife); Test vorher rot |
| B7 Fehlerrangfolge bei parallelen `stat` minimal anders | niedrig | in Abschnitt 3 dokumentiert |
| B8 Nicht-ENOENT-Fehler (Windows EBUSY/EPERM, ENOTDIR) roh | offen | unverändert, Abschnitt 6 |
| Vorbehalt „gemeinsamer Zeitpunkt“ im Kommentar zu stark | – | Kommentar und Doku abgeschwächt |

## 8. Konsistenz über mehrere zusammengehörige Dateien (Rückfrage; gezielt gemessen)

**Aussage, die zu prüfen war:** Ein erfolgreicher dateiweiser Vergleich (Größe, mtime, Inode, Dateimenge) garantiert
nicht automatisch einen atomaren Gesamtzustand über zusammengehörige Dateien. **Das stimmt.** Der Vergleich beweist nur,
dass sich zwischen Lesen und Prüfdurchlauf nichts verändert hat. Schreibt die Anwendung Konto und danach Mitgliedschaft
(`accounts.mjs`, mehrere `await` dazwischen), kann der Schnitt in die Lücke fallen: Konto neu, Mitgliedschaft alt.
Dieser Stand ist dateisystemseitig echt, anwendungsseitig aber eine halbe Transaktion.

**Messung** (`paar.mjs`, Wegwerf-Ablage über die echte `server/lib/ablage.mjs`; ein Schreiber ändert Konto→Mitgliedschaft
mit Lücke *L* und Periode *P*; je erfolgreiche Sicherung wird `konto.gen − mitglied.gen` gelesen, 1 = Schnitt mitten in
der Transaktion):

| Szenario | Fassung | Läufe | gelungen | Schnitt mitten in der Transaktion |
|---|---|---|---|---|
| L 5 ms, P 100 ms (+ Rauschen alle 40 ms) | alt (`087fbe9`) | 400 | 4 | 0 |
| | neu, ohne Ruhezeit | 400 | 400 | **18 (4,5 %)** |
| | neu, `ruhe` 1000 | 5 | 0 (alle Code 3, 18 s je Lauf) | – |
| L 60 ms, P 1500 ms, kein Rauschen | alt (`087fbe9`) | 300 | 300 | **4 (1,3 %)** |
| | neu, ohne Ruhezeit | 300 | 300 | **11 (3,7 %)** |
| | neu, `ruhe` 1000 | 150 | 150 | **0** |
| L 5 ms, P 1500 ms (+ Rauschen alle 800 ms) | alt / neu ohne Ruhezeit | je 150 | 150 / 150 | 0 / 0 |

Befunde:
1. Die erste Fassung dieses PR (Nachkopieren ohne Ruhezeit) hat Verfügbarkeit gegen Konsistenz getauscht: Bei dichten
   Transaktionen lag fast jede 22. Sicherung mitten in einer Transaktion (alt: praktisch nie, weil sie kaum gelang).
2. Auch die **alte** Fassung war nicht immun: Ist die Lücke länger als das Prüffenster (hier 60 ms), lag 1,3 % mitten
   in der Transaktion.
3. Mit Ruhezeit schließt sich das für Lücken kürzer als `ruhe` **by construction** (die erste Datei muss vor dem ersten,
   die zweite darf nicht nach dem zweiten Durchlauf geschrieben sein) und in der Messung (0 von 150 gegenüber 11 von 300).
   Gemessen an der Wirkung stark, am Beweis: nur für Lücken < `ruhe`.
4. Rest: Lücken ≥ `ruhe`, Dateiuhr-Auflösung/Inode-Wiederverwendung (§6) und alles, was ohne Halt im Server nicht
   ausschließbar ist.

Umsetzung der Korrektur: Option `ruhe`/`--ruhe` (§3 Punkt 3). Tests: `pruefungen/wp28b-sicherung-last.test.js`,
Gruppe „Transaktions-Schnitt“ (vorher rot: Konto 2 / Mitgliedschaft 1; Kommandozeile kannte `--ruhe` nicht).

## 9. GitHub-Actions-Auswertung zu PR #100 (Kopf `c6fcce1`)

Die PR-Läufe testen den Merge in den damaligen Zielbranch (`7eae3d2`). Vergleich mit den Läufen des **unveränderten**
Zielbranchs (Runs 42354517030, 42354516992, 42354516982) und lokal reproduziert:

| Job (Workflow) | PR | Zielbranch `7eae3d2` | Ursache | Von diesem PR? |
|---|---|---|---|---|
| `pruefen` (Prüfung), Schritt „Typen“ | rot | rot | 20 TypeScript-Fehler in `modulschreibwege`, `regelbaukasten-erweitert`, `selbstauskunft`, `zweifaktor` (alle `server/lib/*.mjs`); lokal `npm run pruefung:typen`: **identische 20 Fehler** auf Zielbranch und PR-Kopf, keiner in einer von mir geänderten Datei | nein, Bestand |
| `muster` (Sicherheit) | rot | rot | Wort `dangerouslySetInnerHTML` in einem Kommentar von `src/ansichten/intelligence/KiEntwurf.jsx:16` | nein, Bestand (Intelligence-Bereich) |
| `interne-pruefung` (Sicherheit), Schritt „Statische Prüfung“ | rot | rot | `[hart] dangerouslySetInnerHTML: 1` (dieselbe Zeile); lokal `npm run sicherheit:statik` identisch auf beiden Ständen, Exit 1 | nein, Bestand |
| `bild-scan` (Lieferkette), Schritt „Bild bauen“ | rot | rot | `Dockerfile:88` kopiert `werkzeug/betreiber-faktor-vorlauf.mjs` (und `…2fa-zuruecksetzen.mjs`), `.dockerignore` gibt sie nicht frei (`werkzeug/*` ausgeschlossen, nur sechs Dateien ausgenommen) → „not found“ | nein, Bestand |
| `sicherung` (Betrieb Sicherung) | rot | (läuft nur bei Änderungen an `werkzeug/ablage-sicherung.mjs` o. ä.; daher nicht im Vergleich) | scheitert im **gleichen** Schritt „Bild bauen“ wie `bild-scan` (gleiche Ursache); der Ende-zu-Ende-Nachweis wurde dadurch **übersprungen** | Ursache nein; **Nachweis fehlt** |
| übrige (`shellcheck`, `skripte`, `compose`, `caddy-vorlage`, `abhaengigkeiten`, `geheimnisse`) | grün | grün | – | – |

Folgen und Vorbehalt:
- **PR-verursachte Fehler: keine gefunden.** Es wurde nichts an Bestandsfehlern „repariert“: Sie liegen in fremden
  Bereichen (Typen/Server, Intelligence, Docker-Kontext) und gehören dem Hauptorchestrator.
- **Das CI hat die Fachprüfungen dieses PR nie ausgeführt**: In `pruefung.yml` bricht der Schritt „Typen“ ab, alle
  folgenden Schritte (u. a. „Ablage“, „Sicherungen“, „Sicherung und Wiederherstellung“, „Gate-Proben“) sind
  *skipped*. Grün ist der PR deshalb nicht belegt; belegt ist er lokal (Testfamilie `ablage-pruefen*`, `sicherung-ablage`, `sicherungen`, `wp28b-*`, `deploy-automatik`,
  `zweifaktor`, `ablage`, `doku`: 12 Dateien, **389 bestanden, 3 übersprungen, 0 fehlgeschlagen**; Wiederherstellungsübung
  `npm run sicherheit:wiederherstellung`: 12 von 12 Schritten bestanden).
- **Ende-zu-Ende-Nachweis (`deploy/sicherung/ci/ende-zu-ende.sh`) nicht ausgeführt**: In der Sandbox gibt es weder
  Docker-Daemon noch `restic`. Er wird erst nach Behebung des Bildfehlers (`.dockerignore`: `betreiber-2fa-zuruecksetzen.mjs`
  und `betreiber-faktor-vorlauf.mjs` freigeben) belastbar. **Vorschlag an den Besitzer von `.dockerignore`/Dockerfile**,
  nicht Teil dieses PR (fremder Bereich, anderes Paket).
- Der PR-Zweig steht zwei Commits hinter dem Zielbranch (`7cee8ea`, `7eae3d2`); der CI-Merge war konfliktfrei.
