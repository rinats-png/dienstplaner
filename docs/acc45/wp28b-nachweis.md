# WP-28b Nachweis — Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab

Branch `feature/ready-kleinpakete`, Basis `9aac167` (integration/release-v4).

## Was

Befund 6 aus `docs/acc45/wp28-nachweis.md` (Abschnitt 4): `werkzeug/ablage-sicherung.mjs` warf bei einer Datei,
die zwischen `readdir` und `stat` ersetzt oder entfernt wurde, sofort `ENOENT`. Die Wiederholungsschleife
(3 Versuche) griff nicht, weil der Fehler vorher geworfen wurde.

Umsetzung:

- `quelleAnsehen()` behandelt `ENOENT` beim `stat` als Veränderung der Quelle: die Datei wird übersprungen und
  das Ergebnis trägt `veraendert: true`. Andere Fehler werden unverändert geworfen.
- `sichern()` wertet `veraendert` nach dem Vorab-Ansehen und nach dem Nachher-Ansehen wie eine Änderung aus:
  Versuch wird verworfen, nach Pause wiederholt. Nach drei Versuchen Abbruch mit Code 3, keine Sicherung angelegt.

Fail-closed bleibt: Es wird nie eine Sicherung ohne Gegenprobe angelegt; ein Dauerfehler endet mit Code 3.

## Tests (rot vor der Änderung, grün danach)

Neue Datei `pruefungen/wp28b-sicherung-enoent.test.js` (stört gezielt `stat` über `vi.mock`, Rest echtes Dateisystem):

| Test | Vorher | Nachher |
|---|---|---|
| wiederholt einmal und legt danach eine geprüfte Sicherung an | rot (ENOENT roh geworfen) | grün |
| bricht nach drei ENOENT-Versuchen mit Code 3 ab und legt nichts an | rot (Code `ENOENT`) | grün |

Gezielte Läufe nach der Änderung (`npx vitest run` über alle Dateien, die `ablage-sicherung` bzw. `quelleAnsehen`
nutzen): `wp28b-sicherung-enoent`, `sicherung-ablage`, `ablage-pruefen`, `ablage-pruefen-matrix`,
`ablage-pruefen-matrix2`, `ablage-pruefen-rueckweg`, `sicherungen`: **7 Dateien, 274 bestanden, 1 übersprungen, 0 fehlgeschlagen.** `npx eslint` auf die geänderten Dateien: ohne Befund.

Bestehende Tests wurden nicht verändert.

## Offen: Auswertung des Nachlaufs S2/S5

Der Nachlauf ist E-20 (Handstart durch den Betreiber). In diesem Paket wurde **nichts gegen Staging, VPS oder
Last ausgeführt**. Es gibt keine neuen Rohdaten zu S2 und S5; `docs/acc45/wp28-rohdaten/` enthält nur die
bisherigen Läufe. Die Auswertung wird nachgetragen, sobald E-20 Rohdaten liefert (Nachtrag in
`docs/acc45/wp28-nachweis.md`, Abschnitt „WP-28b Nachtrag“).

## Nicht geändert

- `werkzeug/last/` (Lasttest-Werkzeug) nicht ausgeführt; kein Lauf im Paket.
- Befund 7 (500 mit gespeichertem Stempel) gehört zu WP-07b, nicht hierher.

## Review-Runde (Opus-Review zu fb79daa)

- **Kaputter Symlink (Review 5).** `quelleAnsehen` bricht bei einem symbolischen Link im Store mit Code 2 ab,
  statt ihn als Veränderung (Exit 3) zu melden. Test: fake Dirent über den `fs`-Mock, weil Symlinks auf diesem Rechner
  nicht anlegbar sind (EPERM).
- **Prüfung meldet Veränderung (Review 5).** `werkzeug/ablage-pruefen.mjs` `sicherbarkeit()` meldet eine während des
  Ansehens veränderte Ablage als Befund („verändert“), statt sie still durchzulassen. Test vorher rot.
- Gezielt: `wp28b-sicherung-enoent` (4), `sicherung-ablage` (14), `sicherungen` (33), `ablage-pruefen` (8),
  `ablage-pruefen-matrix` (140), `-matrix2` (54), `-rueckweg` (23 + 1 übersprungen).

## WP-28b/3 (2026-11-18): Befund 6 unter Last nachgeprüft, Klammer des Schreib-Halts abgesichert

Branch `fix/wp28b-sicherung-unter-last`, Basis `integration/release-v4` (`dfcd8309`). Nur Wegwerf-Daten in
Temp-Verzeichnissen; nichts gegen Produktion, VPS oder Staging; `lasttest.yml`/E-20 nicht angefasst.

### Ursache (Befund 6) und Stand auf der Basis

- **ENOENT-Abbruch:** auf der Basis nicht mehr vorhanden. Alle Stellen, an denen eine Datei zwischen Auflisten und
  Lesen verschwinden kann (Store-`readdir`, `stat`, `readFile` beim Kopieren, auch im gehaltenen Durchgang), melden
  „verändert“ und laufen in die begrenzte Wiederholung (Runden × Versuche), danach Code 3 ohne Sicherung
  (PR #100, WP-28b/2). Die „Dauerlast“-Lücke aus der Notiz (17/s: 1 von 14) gilt für den Weg **ohne** Schreib-Halt;
  mit Halt (WP-28c, PR #110) gelingt die Sicherung unter Dauerlast (`docs/acc45/wp28c-nachweis.md`: 1000/1000 bei
  105 Schreibvorgängen/s, 0 Schnitte in Transaktionen). `deploy/sicherung/sicherung-ausser-haus.sh` und S5 nutzen den
  Halt.
- **Windows, `sicherung-ablage` „Quelle, die sich beim Sichern ändert“ (60 s, ENOTEMPTY):** andere Ursache, reiner
  Windows-Testartefakt. Nachgemessen mit dem Testaufbau (300 Schlüssel, Schreiber ohne Pause): eine Runde dauert unter
  Windows ~9 s (jede Kopie mit `fsync`, der Schreiber ersetzt in jeder Runde fast alle Dateien), zwei Versuche × zwölf
  Runden also mehrere Minuten — das Werkzeug arbeitet korrekt (nur Nachkopier-Meldungen, kein ENOENT, kein anderer
  Fehler) und endet mit Code 3. Das 60-s-Limit läuft vorher ab; danach räumt `afterAll` das Wegwerfverzeichnis weg,
  während Sicherung und Schreiber noch schreiben: daher `ENOTEMPTY` beim `rmdir`. Unter Linux (CI) bleibt die Runde
  im Millisekundenbereich. Folgefehler derselben Ursache: Die weiterlaufende Sicherung bremst den nächsten Test
  derselben Datei („erkennt jede Art von Schaden“, ebenfalls 60 s) aus. Nicht geändert (keine Testabschwächung).
- **Windows, `wp28b-sicherung-last` „echte parallele Schreiber“:** rot durch `EPERM` beim `rename` des **Test-Schreibers**
  (er hat keine Wiederholung wie `ablage.mjs` `umbenennen`), während die Sicherung die Zieldatei liest — kein Fehler
  der Sicherung. Gemessen: Leser (`stat`/`readFile`) gegen laufendes Ersetzen unter Windows 11, 2400 Lesevorgänge,
  0 Fehler beim Leser, 42 × `EPERM` beim Schreiber. Der in WP-28b/2 offene Punkt B8 (EPERM/EBUSY beim **Lesen**)
  war damit nicht reproduzierbar und bleibt dokumentiertes Restrisiko (roh, Rückgabe 1 — fail-closed, keine Sicherung).

### Neu: `pruefungen/wp28b-sicherung-klammer.test.js` (in `pruefung:schreibhalt`)

Deterministische Haken an `readFile`, Halte-Kanal als Ersatz; bei jeder Freigabe wird der Stand der Quelle
festgehalten (Ende der Klammer). Jede erfolgreiche Sicherung muss genau diesen Stand enthalten (Byte-Vergleich,
Manifest-Zahl, `pruefen`), und eine Wiederherstellung muss ihn exakt ergeben.

| Test | Störung im gehaltenen Durchgang | Erwartung |
|---|---|---|
| ENOENT beim Lesen | Datei steht in der Liste, ist beim Lesen weg | Durchgang zählt nicht, zweiter Halt gilt, Sicherung = Klammer |
| Nach dem Lesen neu geschrieben | Schreiber ohne Halt ersetzt die Datei nach dem Lesen | keine veraltete Kopie, Sicherung = Klammer |
| Endgültig gelöscht | Datei verschwindet im Halt | Sicherung ohne die Datei, Wiederherstellung = Klammer |
| Dauerstörung | jeder Halt gestört | genau versuche × runden Halte, Code 3, klare Meldung, Ziel leer |

Mutationen (lokal, Windows):

| Mutation in `werkzeug/ablage-sicherung.mjs` | bisherige Prüfungen (`wp28b-*`, `schreibhalt`, `schreibhalt-last`) | mit dem neuen Test |
|---|---|---|
| Gegenprobe unter Halt entfernt (`ok = !u`) | **grün (Lücke)** | rot |
| Halt-Bestätigung ignoriert | rot (`schreibhalt-last`) | – (dort schon abgedeckt) |
| ENOENT beim Kopieren roh geworfen | rot | rot (3 Tests) |
| Wiederholung entfernt (ein Versuch) | rot | rot (Dauerstörung) |
| Gegenprobe ohne Halt entfernt | rot (9 Tests) | – |
| ENOENT bei `stat` geschluckt ohne „verändert“ | rot | – |

Gleichwertige Mutanten (keine Lücke, deshalb ohne eigenen Test): ENOENT beim Kopieren bzw. beim Store-`readdir`
**schlucken** ohne Unruhe-Meldung. Die fehlende Kopie fällt in der anschließenden Gegenprobe auf (Menge der Kopien ≠
Liste) oder die Datei ist wirklich weg — dann ist die Sicherung ohne sie der richtige Stand. Die Gegenprobe ist die
eigentliche Sicherung gegen einen halben Stand; ihr Entfernen ist in beiden Wegen (mit und ohne Halt) jetzt rot.

### Lokaler Lauf (Windows 11, `--maxWorkers=1`)

Grün: `wp28b-sicherung-klammer` (4), `wp28b-sicherung-enoent` (4), `schreibhalt` (15 + 1 übersprungen), `doku`,
`rb2-krankmeldung`, `endgeraete-speicher`, `verdrahtung-pruefen`, `ci-abdeckung`, `tsc`, `eslint`.
Unter Windows rot, Ursache Laufzeit bzw. Test-Schreiber (Werkzeug und Halt byte-gleich zur Basis, also Basisverhalten):
`wp28b-sicherung-last` „echte parallele Schreiber“ (EPERM des Test-Schreibers), `sicherung-ablage` (zwei Tests, 60 s),
`schreibhalt-last` „10 Sicherungen“ (180 s), `schreibhalt-messung` „30 Sicherungen“ (240 s) und `ablage` (3, Rechte/EPERM,
schon in `docs/acc45/wp28c-nachweis.md` §3 als Windows-Befund geführt). Grün außerdem: `sicherungen` (33),
`ablage-pruefen` (8), `ablage-pruefen-matrix` (140), `-matrix2` (54), `-rueckweg` (23 + 1 übersprungen),
`wp39-app-aufbau` (4), `prozess-wachen` (15), `verdrahtung` (8), `be1-konto-widerrufbuch` (11),
`be3-widerrufbuch-sicherung` (24). Maßgeblich ist die
Linux-CI.

### Bewusst nicht geändert

- Keine Änderung am Werkzeug, am Schreib-Halt (Frist, Verhalten unter Last) oder an `deploy/`: Die Behebung war
  bereits integriert; die Lücke lag in der Prüfung.
- Offen bleiben: Nachlauf S2/S5 (E-20, Handstart des Betreibers) und der Nachweis der Ende-zu-Ende-Prüfung mit
  Docker/restic in der CI; B8 (Windows-Lesefehler) als Restrisiko.
