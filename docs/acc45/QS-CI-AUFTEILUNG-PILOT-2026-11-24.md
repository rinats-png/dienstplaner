# QS-CI: Aufteilung des Prüf-Jobs (Pilot f1), 2026-11-24

Status: **Pilot, Entwurfs-PR, nicht mergen.** Über den Merge entscheidet der Auftraggeber nach Auswertung.
Grundlage: CI-Analyse vom 24.11. (Hebel f1), Masterprompt V6 §4/§8 (CI-Optimierung, kleine gezielte Änderungen;
der Release-Kandidat besteht weiter ALLE Prüfungen). Kandidat `release/rc-2026-11-22` (517993ca, PR #489) bleibt unverändert.

## 1. Änderung

| Commit | Inhalt |
|---|---|
| 1 | `pruefungen/ci-aufteilung.test.js` (zuerst, rot auf Basis: 7 von 8 Tests rot), verdrahtet in `pruefung:ci-abdeckung` |
| 2 | `.github/workflows/pruefung.yml`: Job `pruefen` wird `pruefen-a`, `pruefen-b`, `pruefen-c` |
| 3 | G1 (`werkzeug/release-pruefung.mjs`): Pflicht-Checks `pruefen-a`, `pruefen-b`, `pruefen-c` statt `pruefen`; Tests, Fixture, BETREIBER-BRANCHSCHUTZ.md |
| 4 | dieses Dokument |
| später | `E2E_WORKERS: 4` für `browser-abnahme` (eigener Commit, getrennt revertierbar) |

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

## 4. Risiken

(wird nach den Läufen gefüllt)

## 5. Rückbau

(wird nach den Läufen gefüllt)

## 6. Empfehlung

(wird nach den Läufen gefüllt)
