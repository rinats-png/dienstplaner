# WP-28b/2 Nachweis — Sicherung unter parallelen Schreibvorgängen

Branch `claude/wp-28b-datensicherung-last-1yiwh0`, Basis `integration/release-v4` (`087fbe9`).
Nur Wegwerf-Daten in Temp-Verzeichnissen; kein Zugriff auf Produktion, VPS, Staging oder echte Sicherungen.

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
| Schreiber auf Dateien | 0/40 erfolgreich (alle Code 3) | **40/40**, jede besteht `pruefen` |
| Schreiber + verschobene Verzeichnisse | 0/40 | **40/40**, jede besteht `pruefen` |
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

Bewusst **nicht** gemacht: ein Schnellverfahren über Verzeichnis-Zeitstempel (würde zwei Schreibvorgänge im
selben Zeitstempel-Takt übersehen = stiller Konsistenzfehler); Änderung von `versuche`; Änderung bestehender Tests.

## 4. Tests nach der Korrektur

- `npx vitest run pruefungen/wp28b-sicherung-last.test.js` → 12 von 12 grün (mehrfach wiederholt, stabil).
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

- **Hohe Dauer-Schreibrate bleibt ein Problem.** Der Stand muss einmal für die Dauer eines Prüfdurchlaufs ruhen
  (5000 Dateien ≈ 120 ms). Im Maßstab-Test (~3000 Dateien, ~17 Schreibvorgänge/s) gelang 1 von 14 Läufen (vorher 0): **bei dieser Last ist die
  Sicherung weiterhin nicht zuverlässig**. Bei ~19–25 Schreibvorgängen/s auf wenige Dutzend Dateien dagegen 70/70
  (vorher 0/80).
  Ergebnis dann Code 3 + Fail-Ping, nie eine halbe Sicherung. Abhilfe unverändert: ruhiges Fenster (02:30) oder
  Server vorher stoppen. Ein echter Fortschritt wäre ein kurzer Schreib-Halt im Server (Raumsperre), nicht im Werkzeug.
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
