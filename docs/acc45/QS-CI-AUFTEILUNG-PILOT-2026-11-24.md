# QS-CI: Aufteilung des Prüf-Jobs (Pilot f1), 2026-11-24

Status: **Pilot ausgewertet, Entwurfs-PR.** Entscheidung des Auftraggebers (2026-11-24): f1 + G1 werden nach einem
unabhängigen Opus-Review gemergt. E2E_WORKERS 4 wird NICHT übernommen (gemessen, dann per `git revert` als eigener
Commit zurückgenommen). Der Kandidat `release/rc-2026-11-22` ist ein fester älterer Commit mit eigenem Werkzeug und vom
Merge nicht betroffen.
Grundlage: CI-Analyse vom 24.11. (Hebel f1), Masterprompt V6 §4/§8 (CI-Optimierung, kleine gezielte Änderungen;
der Release-Kandidat besteht weiter ALLE Prüfungen). Kandidat `release/rc-2026-11-22` (517993ca, PR #489) bleibt unverändert.

## 1. Änderung

| Commit | Inhalt |
|---|---|
| 1 | `pruefungen/ci-aufteilung.test.js` (zuerst, rot auf Basis: 7 von 8 Tests rot), verdrahtet in `pruefung:ci-abdeckung` |
| 2 | `.github/workflows/pruefung.yml`: Job `pruefen` wird `pruefen-a`, `pruefen-b`, `pruefen-c` |
| 3 | G1 (`werkzeug/release-pruefung.mjs`): Pflicht-Checks `pruefen-a`, `pruefen-b`, `pruefen-c` statt `pruefen`; Tests, Fixture, BETREIBER-BRANCHSCHUTZ.md |
| 4 | dieses Dokument |
| cd3f0ec7 | `E2E_WORKERS: 4` für `browser-abnahme` (nur Messung, eigener Commit) |
| ee017fa7 | Revert von cd3f0ec7: E2E_WORKERS 4 nicht übernommen (Grund: Abschnitt 6) |
| 483051b4 | Merge von `origin/integration/release-v4` (4ce5d395) ohne Konflikt |

Aufteilung: zusammenhängende Abschnitte der alten Schrittfolge, Schnitte nach gemessener Schrittdauer (Median je Schritt
aus 5 Läufen vom 24.11.: 45367341524, 45375789676, 45375843119, 45380803903, 45380816980). Erzeugt mit einem Einmal-Skript
(optimaler Zwei-Schnitt, kleinste größte Teilsumme; Bild-Teil bleibt ganz in Teil c).

| Teil | Schritte (ohne Einstieg) | erster Schritt | letzter Schritt | Summe Schrittdauer (geschätzt aus Messung) |
|---|---|---|---|---|
| `pruefen-a` | 47 | Linter | Synthetische Testdateien und Testmatrix des Imports (IMP-8) | 531 s |
| `pruefen-b` | 109 | Teilspeicherung je Segment mit Versionen (WP-48.3) | Zwei-Faktor für Betreibercodes | 583 s |
| `pruefen-c` | 99 | Sitzungen | Container-Logs (bei Fehler) | 572 s |

Jeder Teil: checkout (ohne Token), setup-node 22 mit npm-Cache, `npm ci`. `env BILD` nur in `pruefen-c`.
`browser-abnahme`, `on:`, `permissions:` unverändert.

## 2. Nachweis Vollständigkeit

- Einmal-Beleg (geparste Schrittobjekte, alle Felder): alter Job 258 Schritte; neu 50 + 112 + 102 = 264 (3 x 3 Einstieg);
  vereinigt ohne doppelten Einstieg 258; **fehlend 0, zusätzlich 0**; Reihenfolge a|b|c = Original: **ja**;
  Jobkopf alt = `pruefen-c` (runs-on, timeout, env); `browser-abnahme`, `on`, `permissions` unverändert.
- Dauerhaft: `pruefungen/ci-aufteilung.test.js` (in `pruefung:ci-abdeckung`):
  Jobliste genau `pruefen-a/b/c` + `browser-abnahme`, kein eigenes `name:` (Check-Run-Name = Job-ID); gleicher Einstieg;
  kein Schritt und kein `npm run X` in zwei Teilen; Pflichtschritte außerhalb der Sammelkette je genau einmal
  (Übersetzen, Gate-Proben im Bild, Rückweg-Werkzeuge, Verwalterkonten, Container-Skript, Container-Logs);
  Bild-Teil: Gate-Proben gegen frischen Server (Port 3000) vor Übersetzen vor Bild vor Container-Skript vor erstem Containerstart,
  keine Container-Prüfung vor dem ersten Start, Container-Logs letzter Schritt mit `if: failure()`; kein anderer Teil nutzt
  `$BILD`, Container-Skript, `centric-pruefung` oder `127.0.0.1:3000`. G1-Bindung: jeder Job der Prüfung ist Pflicht-Check,
  jeder Pflicht-Check ist Job eines Workflows, keine Duplikate.
- Die Sammelkette (`npm run pruefung:*`) bewacht weiter `pruefung:ci-abdeckung` (liest den Text der ganzen Datei; alle
  Teile bleiben in `pruefung.yml`).
- Mutationsproben (im Test): Schritt außerhalb der Kette entfernt, Schritt doppelt, Gate-Proben in anderen Teil,
  Container-Prüfung in anderen Teil, Einstieg ohne `npm ci`, Teil fehlt, Job mit `name:`, alter Einzeljob: alle rot.

## 3. Messung

Gemessen (GitHub-API, `gh run view --json jobs`; Wand = Lauf erstellt bis letzter Job fertig; Queue = Lauf erstellt bis erster Job startet):

| Kopf | Lauf | Ereignis | Ergebnis | Queue | Wand | pruefen-a | pruefen-b | pruefen-c | browser-abnahme |
|---|---|---|---|---|---|---|---|---|---|
| Basis c61a6dba (vorher, ein Job `pruefen`) | 45386093245 | push | success | 2 s | 1884 s (31,4 min) | `pruefen` 1882 s | | | 535 s |
| 96b85820 (Lauf 1) | 45389767483 | push | success | 2 s | 686 s (11,4 min) | 492 s | 513 s | 683 s | 568 s |
| 96b85820 (Lauf 1) | 45389821787 | pull_request | success | 34 s | 704 s (11,7 min) | 595 s | 537 s | 536 s | 657 s |
| 07118798 (Lauf 2) | 45391790921 | push | success | 2 s | 683 s (11,4 min) | 591 s | 500 s | 542 s | 680 s |
| 07118798 (Lauf 2) | 45391799267 | pull_request | success | 10 s | 692 s (11,5 min) | 568 s | 616 s | 648 s | 677 s |
| 256cd979 (Lauf 3) | 45393771454 | push | success | 2 s | 706 s (11,8 min) | 565 s | 657 s | 704 s | 560 s |
| 256cd979 (Lauf 3) | 45393788734 | pull_request | success | 2 s | 628 s (10,5 min) | 586 s | 496 s | 515 s | 626 s |
| cd3f0ec7 (E2E_WORKERS 4, Lauf 1) | 45395819521 | push | success | 2 s | 682 s (11,4 min) | 585 s | 680 s | 635 s | 385 s |
| cd3f0ec7 (E2E_WORKERS 4, Lauf 1) | 45395838371 | pull_request | success | 39 s | 638 s (10,6 min) | 527 s | 590 s | 591 s | 386 s |
| 93797b37 (E2E_WORKERS 4, Lauf 2) | 45397761713 | push | success | 2 s | 640 s (10,7 min) | 477 s | 568 s | 638 s | 475 s |
| 93797b37 (E2E_WORKERS 4, Lauf 2) | 45397770110 | pull_request | success | 13 s | 716 s (11,9 min) | 588 s | 665 s | 653 s | 367 s |
| e9a5ce81 (E2E_WORKERS 4, Lauf 3) | 45399840458 | push | success | 3 s | 659 s (11,0 min) | 513 s | 656 s | 652 s | 503 s |
| e9a5ce81 (E2E_WORKERS 4, Lauf 3) | 45399850052 | pull_request | success | 14 s | 639 s (10,7 min) | 589 s | 549 s | 511 s | 380 s |

Auswertung (gemessen, getrennt von der Schätzung):

| Größe | vorher (gemessen) | f1 allein (6 Läufe, gemessen) | f1 + E2E_WORKERS 4 (Läufe siehe Tabelle, gemessen) | Schätzung vorab |
|---|---|---|---|---|
| Wand je Lauf | 1884 s (c61a6dba); Analyse: 24,5 bis 31 min | 628 bis 706 s, Median 689 s (11,5 min) | 638 bis 716 s, Median 650 s (10,8 min) | ca. 11 min |
| längster Prüf-Teil | `pruefen` 1485 bis 1882 s | 586 bis 704 s | 589 bis 680 s | 583 s + 15 s Einstieg |
| browser-abnahme | 535 bis 674 s | 560 bis 680 s | 367 bis 503 s | 2 bis 4 min weniger (Hypothese) |
| Queue | 2 s | 2 bis 34 s | 2 bis 39 s | 0 bis 3 s |
| Ergebnis | grün | 6 von 6 grün | 6 von 6 grün | |

- f1 senkt die Wand von ca. 31 min auf ca. 11,5 min (gemessen). Die Runner-Zeit steigt um ca. 2 x (Einstieg ca. 15 s) plus
  Streuung; Summe der Prüf-Teile 1600 bis 1830 s gegen 1882 s vorher (ein Job lief länger als die Summe der Teile).
- Streuung je Teil: bis ca. 150 s zwischen Läufen (Bildbau 10 bis 57 s, Gate-Proben 100 bis 125 s, BE-2 A1 213 bis 232 s).
- E2E_WORKERS 4: Browser-Job ca. 35 % schneller (Playwright 8,5 min auf 5,9 bis 6,0 min, gleiche Zahl: 752 Tests,
  218 bestanden, 534 übersprungen, kein „flaky“, `retries: 0`). Die Wand sinkt dadurch NICHT: Nach f1 bestimmen die
  Prüf-Teile die Wand (ca. 10,5 bis 12 min). Nutzen erst mit einer Teilung in 4 Prüf-Jobs.
- Flakes: in allen Läufen des Pilots kein roter Schritt. Keine Wiederholung, kein Re-run.

## 4. Risiken

- **G1 (Release-Gate):** `pflichtChecks` nennt jetzt `pruefen-a/b/c` statt `pruefen`. Review #514 (Auflage A2) sah ein
  Fehlblockade-Risiko: Startet jemand das Werkzeug aus einem neueren Stand als dem Kandidaten, wäre ein Kandidat vor der
  Aufteilung (z. B. 517993ca) fälschlich G1-NO-GO. Zwei Maßnahmen:
  (a) RELEASE-PROZESS.md §4: für die Vorprüfung das Werkzeug aus dem Kandidaten-Commit starten (`git worktree add <Pfad> <kandidat>`); die Endprüfung läuft auf `main`-HEAD (G10 erzwingt dort das Werkzeug des Kandidaten).
  (b) **Übergangsregel in G1** (`uebergangPruefen`): G1 nimmt GENAU zwei vollständige Formen an, Form NEU
  (`pruefen-a`, `pruefen-b`, `pruefen-c`) oder Form ALT (`pruefen`); die übrigen Pflicht-Checks gelten in beiden. Ist ein Teil
  der Form NEU vorhanden, muss Form NEU vollständig sein (keine Mischform). Jeder Lauf eines Namens beider Formen muss
  `success` sein (auch `skipped`/`neutral` sind NO-GO). Fehlt beides, nennt NO-GO beide Formen. Tests zuerst (6 rot auf
  444b1d1e), dazu 2 Code-Mutationen: Form ALT entfernt → 2 Tests rot; Vollständigkeit gelockert → 4 Tests rot.
  Ein Test bindet `uebergangPruefen.neu` an die Jobs von `pruefung.yml`.
- **Reihenfolge/Zustand:** Die Teile sind zusammenhängende Abschnitte der alten Folge. Ein Schritt in b oder c kann sich
  nicht mehr auf Seiteneffekte früherer Teile verlassen (z. B. Dateien, die ein früherer Schritt erzeugt). In 12 grünen
  Läufen trat das nicht auf. Port 3000, `$BILD`, Container-Skript und `GITHUB_ENV`-Nachweis liegen nur in `pruefen-c`
  (Test). Feste Ports kollidieren nicht über Jobs (eigene Runner).
- **Pflichtchecks später (Branch-Schutz):** heute keiner (API 404). Beim Einrichten die drei Namen eintragen
  (BETREIBER-BRANCHSCHUTZ.md angepasst; `browser-abnahme` und `interne-pruefung` stehen dort ebenfalls in der Liste). `docs/BRANCH-SCHUTZ.md` und `docs/CI-LIEFERKETTE.md` sind nachgezogen (Review #514, Auflage A3).
- **Neuer Schritt künftig:** Wer einen Schritt anhängt, wählt einen Teil. Die Sammelkette prüft weiter
  `pruefung:ci-abdeckung`; Schritte außerhalb der Kette prüft die feste Liste in `ci-aufteilung.test.js` nur für die
  heutigen Pflichtschritte. Die Teile driften mit der Zeit auseinander (neu messen, Schnitte nachziehen).
- **Parallelität:** 4 statt 2 gleichzeitige Jobs je Lauf (Grenze 20). Bei push + pull_request je Kopf 8 Jobs.
- **Andere Workflows:** `deploy.yml` ruft `pruefung.yml` per `workflow_call`; `needs: [pruefung]` wartet auf alle Jobs
  des Aufrufs, also auf alle drei Teile: keine Änderung nötig. Check-Run-Namen dort: „pruefung / pruefen-a“ usw. (G1 zählt
  sie als Nicht-Pflicht-Checks, sie müssen success/skipped/neutral sein, unverändert). `betrieb-*.yml`, `sicherheit.yml`,
  `lieferkette.yml`, `lasttest.yml`, `staging-gate.yml` hängen nicht an den Jobnamen (nur Kommentare).

**Offener Punkt (nach Release v4-r1):** Form ALT der Übergangsregel zurückbauen (`uebergangPruefen.alt` und den Zweig in
`g1Ci` entfernen, Tests der Form ALT auf NO-GO umstellen), sobald kein Kandidat mehr den alten Workflow (Job `pruefen`) hat.
Nachverfolgung: `docs/acc45/ENTSCHEIDUNGSLISTE.md` Abschnitt D (technischer Nachtrag, keine Betreiberentscheidung).

## 5. Rückbau

- Alles: `git revert` des Merge-Commits (ein Revert). Danach wieder ein Job `pruefen`, G1 wieder `pruefen`.
- E2E_WORKERS 4 ist im Endstand bereits zurückgenommen (ee017fa7); `browser-abnahme` ist wieder wie vor dem Pilot.
- G1 und Workflow gehören zusammen: nie nur einen der beiden zurücknehmen (der Test `ci-aufteilung` wird sonst rot).

## 6. Empfehlung

- f1 (Aufteilung + G1): **mergen: ja**, nach unabhängigem Opus-Review von G1 und Vollständigkeit. Gewinn 13 bis 20 min Wand je
  Kopf (gemessen 31,4 auf 10,8 bis 17,7 min je Kopf; Streuung durch Runner-Wartezeit bei gleichzeitigen Workflows), 12 von 12 Läufen grün, alle Prüfungen unverändert vorhanden.
- Zeitpunkt: NACH dem laufenden Release v4-r1 (Kandidat 517993ca prüft mit seinem eigenen Werkzeug weiter; kein Kandidat
  mischt Alt und Neu).
- E2E_WORKERS 4: **gemessen, nicht übernommen.** Grund: Der Browser-Job wird ca. 35 % schneller, die Wand aber nicht,
  denn nach f1 bestimmen die Prüf-Teile die Wand (Median 689 s ohne, 650 s mit; Streuung je Teil bis ca. 150 s, also im
  Rauschen). Mehr CPU-Druck ohne messbaren Nutzen. Zurückgenommen mit ee017fa7. Neu bewerten erst mit einer Teilung in
  4 Prüf-Jobs. Die Messzahlen oben bleiben als Beleg unverändert.
- Befund (Review #514, Auflage A1, erledigt): In BETREIBER-BRANCHSCHUTZ.md fehlte `browser-abnahme` in Tabelle und
  `gh api`-JSON, und der JSON-Block nannte noch `pruefen`. Jetzt stehen dort `pruefen-a`, `pruefen-b`, `pruefen-c` und
  `browser-abnahme`; ebenso im Prüfbefehl E in BRANCH-SCHUTZ-PRUEFUNG.md.
- Pflege: Jeder neue Schritt der Prüfung muss genau einem Teil zugeordnet werden (sonst rot: ci-abdeckung bzw.
  ci-aufteilung). Die Teile driften mit neuen Schritten auseinander; bei mehr als ca. 2 min Unterschied zwischen den
  Teilen die Schnitte neu messen und nachziehen.
