# Branch-Schutz: Prüfung und Checkliste (nur lesend)

Stand: 2026-11-14. Reine Dokumentation. **Es wurde keine GitHub-Einstellung geändert**, weder Branch-Schutz noch
Rulesets noch Berechtigungen. Das Setzen ist Betreiberaufgabe. Diese Datei fasst die vorhandenen Regeln zusammen,
hält den lesend gemessenen Ist-Stand fest und gibt eine Checkliste mit lesenden Kommandos.

Betreiberentscheidung 2026-11-14 (C4): Branch-Schutz nur vorbereiten und prüfen, keine Rechteänderung.

## 1. Quellen im Repository

| Quelle | Inhalt | Rang |
|---|---|---|
| `docs/acc45/BETREIBER-BRANCHSCHUTZ.md` (Stand 2026-11-10) | Rulesets für `main`, `integration/release-v4`, `koordination/lease`, Wirkungstest, Notausstieg, Eintragsfeld | maßgeblich |
| `docs/BRANCH-SCHUTZ.md` (Stand 2026-11-02, WP-32) | ältere Empfehlung (klassischer Schutz) für `main` und `integration/centric-complete` | Vorrang hat `BETREIBER-BRANCHSCHUTZ.md`, wo sie abweichen (`interne-pruefung` fehlt dort) |
| `werkzeug/branchschutz-pruefen.mjs` | lesender Prüfer (klassischer Schutz und Rulesets), fail-closed | Prüfwerkzeug |
| `werkzeug/koordination.mjs` | Lease auf dem Branch `koordination/lease`, nur Push ohne Force, löscht nie | Verbraucher des Schutzes |
| `docs/acc45/STAGING-PLAN-V4.md` Abschnitt 7 (O-5) | Aufgabe „Branch-Schutz einrichten“, blockiert den Merge nach `main` (WP-09) | Einordnung |

## 2. Ist-Stand (lesend gemessen am 2026-11-14)

| Branch | `gh api …/branches/<b>/protection` | Ergebnis von `node werkzeug/branchschutz-pruefen.mjs` |
|---|---|---|
| `main` | HTTP 404 „Branch not protected“ | LÜCKE: Force-Push erlaubt, Löschen erlaubt |
| `integration/release-v4` | HTTP 404 „Branch not protected“ | LÜCKE: Force-Push erlaubt, Löschen erlaubt |
| `koordination/lease` | HTTP 404 „Branch not protected“ | LÜCKE: Force-Push erlaubt, Löschen erlaubt |

Rulesets des Repositories (`gh api repos/rinats-png/dienstplaner/rulesets`): leere Liste. Der Befund entspricht
`BETREIBER-BRANCHSCHUTZ.md` Abschnitt 0 (Stand 2026-11-10): Nichts ist gesetzt. 404 auf die Schutz-Schnittstelle heißt
hier „kein klassischer Schutz“; ein Ruleset würde diese Schnittstelle nicht beantworten. Deshalb prüft das Werkzeug
zusätzlich `rules/branches/<Branch>`. Ein 403 oder ein anderer Fehler würde als „nicht belegbar“ (Exit 2) gelten, nie als
geschützt.

Folgen bis zur Einrichtung (`BETREIBER-BRANCHSCHUTZ.md` Abschnitt 9): Die Lease ist nur ein kooperativer Schutz; die
Pflicht-CI auf `main` und `integration/release-v4` ist nicht technisch erzwungen; Merge-Regeln gelten nur durch
Arbeitsdisziplin (kein Merge nach `main` ohne Betreiberfreigabe).

## 3. Soll-Einstellungen (Checkliste für den Betreiber)

Gemeinsam für alle drei Branches: Löschen sperren, Force-Push sperren, Bypass-Liste leer, Enforcement aktiv.

| Nr | Einstellung | `koordination/lease` | `integration/release-v4` | `main` |
|---|---|---|---|---|
| 1 | Ruleset-Name | `koordination-lease` | `integration-release-v4` | `main-schutz` |
| 2 | Restrict deletions | an | an | an |
| 3 | Block force pushes (non_fast_forward) | an | an | an |
| 4 | Pull-Request-Pflicht | **aus** (Lease wird absichtlich direkt ohne Force gepusht) | an, 0 Freigaben | an; 0 Freigaben, oder 1 mit Bypass nur für Administratoren im Modus „pull request“ |
| 5 | Pflicht-Checks | **keine** (auf dem Branch läuft keine CI) | `pruefen`, `abhaengigkeiten`, `geheimnisse`, `interne-pruefung`, `muster`, `bild-scan`, `caddy-vorlage`, `shellcheck`, `compose`, `skripte` (GitHub-Actions-App, `integration_id` 15368) | wie `integration/release-v4` |
| 6 | „Branch muss aktuell sein“ (strict) | – | aus | aus (laut `BETREIBER-BRANCHSCHUTZ.md`); die ältere Empfehlung `BRANCH-SCHUTZ.md` nennt `strict: true`, Abweichung bewusst entscheiden |
| 7 | Bypass-Liste | leer | leer | leer oder nur der genannte Admin-Eintrag |
| 8 | Nicht aktivieren | PR-Pflicht, Statuschecks, Signaturpflicht, Restrict updates, Merge-Queue | Linear history, Signaturpflicht, Restrict creations/updates, Merge-Queue | wie `integration/release-v4` |

Nicht als Pflicht-Check eintragen: `sicherung` (läuft nur pfadabhängig und würde andere PRs dauerhaft blockieren),
`Auslieferung` und `Lasttest` (nur von Hand).

Weitere Betreiberentscheidungen (laut `BETREIBER-BRANCHSCHUTZ.md` Abschnitt 1 und 8, Entscheidung offen):
- Zugang für Claude ohne Administratorrecht (nur Contents/Pull requests schreiben, Actions/Checks lesen).
- `main`: Freigabezahl 0 oder 1 mit Admin-Bypass im Modus „pull request“.
- `strict` ja/nein für `main` (siehe Zeile 6).

Was Claude braucht: Push auf PR-Branches, PRs nach `integration/release-v4` mergen (`gh pr merge --merge
--match-head-commit <SHA>`), Checks lesen, auf `koordination/lease` direkt ohne Force pushen. Claude merkt **nie** nach
`main` (verbindliche Vorgabe).

## 4. Lesende Prüfung (Kommandos, ändern nichts)

```bash
# A. Gesamtprüfung durch das Werkzeug (Exit 0 = alle drei geschützt, 1 = Lücke, 2 = nicht belegbar)
node werkzeug/branchschutz-pruefen.mjs
node werkzeug/branchschutz-pruefen.mjs --json

# B. Klassischer Schutz je Branch (404 = nicht geschützt)
gh api repos/rinats-png/dienstplaner/branches/main/protection
gh api repos/rinats-png/dienstplaner/branches/integration%2Frelease-v4/protection
gh api repos/rinats-png/dienstplaner/branches/koordination%2Flease/protection

# C. Rulesets und deren Wirkung auf den Branch (lesen)
gh api repos/rinats-png/dienstplaner/rulesets --jq '.[] | {id,name,enforcement}'
gh api repos/rinats-png/dienstplaner/rules/branches/main
gh api repos/rinats-png/dienstplaner/rules/branches/integration%2Frelease-v4
gh api repos/rinats-png/dienstplaner/rules/branches/koordination%2Flease

# D. Welche Checks sind als Pflicht verlangt (Namen gegen Abschnitt 3, Zeile 5 vergleichen)
gh api repos/rinats-png/dienstplaner/rules/branches/main --jq '[.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context]'
gh api repos/rinats-png/dienstplaner/rules/branches/integration%2Frelease-v4 --jq '[.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context]'

# E. Existieren die Check-Namen noch in den Workflows? (Umbenennung würde jeden PR blockieren)
grep -nE '^  (pruefen|abhaengigkeiten|geheimnisse|interne-pruefung|muster|bild-scan|caddy-vorlage|shellcheck|compose|skripte):' .github/workflows/*.yml

# F. Lease-Zustand lesen (Halter und Epoche notieren, vor und nach der Einrichtung)
node werkzeug/koordination.mjs status
```

Erwartung nach korrekter Einrichtung: A endet mit Exit 0 und drei Zeilen `GESCHUETZT`; C zeigt je Branch `deletion` und
`non_fast_forward`; D zeigt auf `main` und `integration/release-v4` die zehn Namen aus Abschnitt 3; auf
`koordination/lease` keine Statuschecks.

Wirkungstest (nur durch den Betreiber, ausschließlich mit Wegwerf-Branches unter `schutztest/`, Anleitung in
`BETREIBER-BRANCHSCHUTZ.md` Abschnitt 6) und Lease-Erneuerung nach dem Setzen (Abschnitt 7) bleiben Betreiberschritte.
Notausstieg: `gh api -X PUT repos/rinats-png/dienstplaner/rulesets/<id> -f enforcement=disabled` (nur durch den
Betreiber; ändert die Regel, nie Daten).

## 5. Eintrag des Betreibers (offen)

| Punkt | Stand |
|---|---|
| Rulesets gesetzt am | offen |
| `branchschutz-pruefen` Exit | zuletzt 1 (alle drei Branches Lücke, 2026-11-14) |
| Wirkungstest bestanden | offen |
| Lease-Erneuerung nach Setzen OK | offen |
| Claude-Zugang ohne Administratorrecht | offen (Entscheidung) |

## 6. Einordnung zum Release

Der Branch-Schutz blockiert nach `STAGING-PLAN-V4.md` (O-5) den Merge nach `main` (WP-09), nicht die technische
Entwicklung auf `integration/release-v4`. Bis dahin ersetzt keine Regel die Betreiberfreigabe für `main`.
