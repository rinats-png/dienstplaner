# Betreiberaufgabe (prioritär): Branch-Schutz für main, integration/release-v4, koordination/lease

Stand 2026-11-10. **Nichts davon ist gesetzt.** Das Setzen ändert, wer was im Repository darf. Es ist
Betreiberaufgabe; Claude ändert keine GitHub-Berechtigungen und keine Rulesets.

## 0. Kurzfassung
- Beleg Ist-Stand (nur lesend, `node werkzeug/branchschutz-pruefen.mjs`, Exit 1): Für **alle drei** Branches ist
  Force-Push erlaubt und Löschen erlaubt. Es gibt weder klassischen Schutz noch Rulesets.
- Folge: Die Lease (`werkzeug/koordination.mjs`) ist bis dahin nur ein **kooperativer** Schutz. Wer den Branch
  `koordination/lease` per Force-Push überschreibt oder löscht, setzt die Epoche zurück und umgeht ihn.
- Ziel: Je ein Ruleset je Branch (GitHub: *Settings → Rules → Rulesets*). Danach muss
  `node werkzeug/branchschutz-pruefen.mjs` mit **Exit 0** enden und der Wirkungstest (Abschnitt 6) bestanden sein.

## 1. Rechte: Wer braucht was
| Wer | Heute | Nach der Einrichtung nötig |
|---|---|---|
| Betreiber (Inhaber) | Administrator | Administrator, nur zum Setzen und Ändern der Rulesets |
| Claude (Werkzeug `gh`, Konto `rinats-png`) | **Administrator** des Repositories, Token-Scopes `repo`, `workflow` | Schreibrecht (`push`): Branches pushen, Pull Requests anlegen und mergen, Checks lesen |

Konsequenzen:
- Claude braucht **kein** Administratorrecht. Empfehlung: ein eigener Zugang oder feingranulares Token für Claude
  mit *Contents: write, Pull requests: write, Actions: read, Checks: read, Metadata: read* und **ohne**
  *Administration*. Dann kann Claude Schutzregeln weder abschalten noch versehentlich ändern. Das ist eine
  Betreiberentscheidung; bis dahin läuft Claude mit dem Admin-Token des Inhabers.
- Rulesets mit **leerer Bypass-Liste** gelten auch für Administratoren. Das ist gewollt: Auch ein Fehlgriff mit dem
  Admin-Token kann dann weder die Lease noch die Integration überschreiben oder löschen.
- Der Prüfer liest Rulesets über `rules/branches/<Branch>`. Fehlt ihm eine Berechtigung, meldet er Exit 2
  (nicht belegbar, gilt als ungeschützt), nie fälschlich „geschützt“.

## 2. Gemeinsame Regeln für alle drei Branches
Aktivieren: **Restrict deletions**, **Block force pushes**. Bypass-Liste: **leer**. Enforcement: **Active**.

**Nicht aktivieren** (blockiert die Arbeit, bringt hier nichts):
- *Require linear history*: Die Integration besteht aus Merge-Commits (`gh pr merge --merge`).
- *Require signed commits*: Agentenbranches und die Lease-Commits (`git commit-tree`, Autor
  `koordination@centric.invalid`) sind nicht signiert.
- *Restrict creations*, *Restrict updates*, *Require merge queue*, *Require deployments*.
- *Require status checks* oder *Require a pull request* auf `koordination/lease` (siehe 3).

## 3. koordination/lease
| Einstellung | Wert |
|---|---|
| Ruleset-Name | `koordination-lease` |
| Target | *Include by pattern* `koordination/lease` |
| Restrict deletions | an |
| Block force pushes | an |
| Require a pull request | **aus** (Lease wird absichtlich per direktem Push ohne Force geschrieben) |
| Require status checks | **aus** (auf dem Branch läuft keine CI; er enthält nur `lease.json`, keine Workflow-Datei) |
| Erforderliche CI-Checks | **keine** |
| Bypass-Liste | leer |

```bash
gh api -X POST repos/rinats-png/dienstplaner/rulesets --input - <<'JSON'
{
  "name": "koordination-lease",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/koordination/lease"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ]
}
JSON
```
Claude braucht hier: **direkter Push ohne Force** auf diesen Branch (Werkzeug `werkzeug/koordination.mjs`:
`uebernehmen`, `erneuern`, `freigeben`, `push`). Das Werkzeug verwendet nie Force und löscht den Branch nie
(durch Tests belegt, `pruefungen/koordination.test.js`).

## 4. integration/release-v4
| Einstellung | Wert |
|---|---|
| Ruleset-Name | `integration-release-v4` |
| Target | *Include by pattern* `integration/release-v4` |
| Restrict deletions / Block force pushes | an / an |
| Require a pull request | an, **0** erforderliche Freigaben (ein Inhaber kann die eigene Freigabe nicht geben) |
| Require status checks | an, *Require branches to be up to date* **aus** (sonst muss jeder PR nach jedem anderen neu gebaut werden) |
| Bypass-Liste | leer |

**Erforderliche CI-Checks** (Name = Job-Kennung; Quelle: GitHub Actions, `integration_id` 15368). Alle laufen
bei jedem Pull Request und bei jedem Push (`.github/workflows/*.yml`: `pull_request`, `push: ["**"]`):

| Check | Workflow |
|---|---|
| `pruefen` | Prüfung |
| `abhaengigkeiten` | Sicherheit |
| `geheimnisse` | Sicherheit |
| `interne-pruefung` | Sicherheit |
| `muster` | Sicherheit |
| `bild-scan` | Lieferkette |
| `caddy-vorlage` | Lieferkette |
| `shellcheck` | Betrieb: Deploy-Skripte |
| `compose` | Betrieb: Deploy-Skripte |
| `skripte` | Betrieb: Deploy-Skripte |

**Nicht eintragen:** `sicherung` (Workflow „Betrieb Sicherung“ läuft nur bei Änderungen an bestimmten Pfaden; ein
Pflicht-Check, der nicht startet, blockiert jeden anderen PR dauerhaft), `Auslieferung` und `Lasttest` (nur von Hand).
Wird ein Job umbenannt, muss dieses Ruleset mitgezogen werden, sonst wartet jeder PR auf einen Check, den es
nicht mehr gibt. `bild-scan` kann ohne Codeänderung rot werden (neue Schwachstellenmeldung); die Antwort ist ein
Fix oder eine begründete, befristete Zeile in `.trivyignore`, nicht das Abschalten.

```bash
gh api -X POST repos/rinats-png/dienstplaner/rulesets --input - <<'JSON'
{
  "name": "integration-release-v4",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/integration/release-v4"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false, "require_last_push_approval": false,
        "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "pruefen",          "integration_id": 15368 },
          { "context": "abhaengigkeiten",  "integration_id": 15368 },
          { "context": "geheimnisse",      "integration_id": 15368 },
          { "context": "interne-pruefung", "integration_id": 15368 },
          { "context": "muster",           "integration_id": 15368 },
          { "context": "bild-scan",        "integration_id": 15368 },
          { "context": "caddy-vorlage",    "integration_id": 15368 },
          { "context": "shellcheck",       "integration_id": 15368 },
          { "context": "compose",          "integration_id": 15368 },
          { "context": "skripte",          "integration_id": 15368 } ] } }
  ]
}
JSON
```
(Schemafehler meldet `gh` sofort; dann ist nichts gesetzt.)

Claude braucht hier: **PRs mergen** (`gh pr merge --merge --match-head-commit <SHA>`), Branches der PRs pushen,
Checks lesen. Claude braucht **nicht**: direkten Push auf `integration/release-v4`. Danach sind direkte Pushes dort
nicht mehr möglich, auch nicht für den Inhaber. Vorher prüfen, dass kein Skript direkt dorthin pusht (die
SSOT-Werkzeuge schreiben auf PR-Branches).

## 5. main
| Einstellung | Wert |
|---|---|
| Ruleset-Name | `main-schutz` |
| Target | *Include by pattern* `main` |
| Restrict deletions / Block force pushes | an / an |
| Require a pull request | an. Freigaben: 0, oder 1 mit Bypass nur für Administratoren im Modus *pull request* (`bypass_actors`: `RepositoryRole` Administrator, `bypass_mode: pull_request`), damit der Inhaber die eigene Änderung mergen kann |
| Require status checks | wie in 4, dieselbe Liste |
| Bypass-Liste | leer oder nur der genannte Admin-Eintrag im Modus *pull request* |

Claude merkt **nie** nach `main` (verbindliche Vorgabe). Claude braucht hier kein Recht außer Lesen. Ältere
Empfehlung für `main` und `integration/centric-complete`: `docs/BRANCH-SCHUTZ.md` (klassischer Schutz, gleiche
Check-Liste; diese Datei hat Vorrang, wo sie abweicht, weil `interne-pruefung` dort noch fehlt).

## 6. Gefahrlos testen (nie gegen die echten Branches)
Wegwerf-Branches unter `schutztest/`. Ein Fehlschlag kann nichts zerstören.

1. **Force-Push und Löschen (Form der Lease/Integration):** Zweites Ruleset `schutztest-force`, Target
   `schutztest/*`, Regeln `deletion` und `non_fast_forward`, Bypass leer.
   ```bash
   git push origin HEAD:refs/heads/schutztest/probe                    # anlegen: erlaubt
   git commit --allow-empty -m probe && git push origin HEAD:refs/heads/schutztest/probe   # vorwärts: erlaubt
   git push --force origin HEAD~1:refs/heads/schutztest/probe          # erwartet: abgelehnt (GH013)
   git push origin :refs/heads/schutztest/probe                        # erwartet: abgelehnt (GH013)
   ```
2. **PR-Pflicht und Checks (Form der Integration/main):** Drittes Ruleset `schutztest-pr`, Target `schutztest-pr/*`,
   Regeln `pull_request` (0 Freigaben) und `required_status_checks` mit `pruefen`.
   `git push origin HEAD:refs/heads/schutztest-pr/probe` **erwartet: abgelehnt** (Änderung nur per Pull Request).
3. **Aufräumen:** beide Test-Rulesets auf *Disabled* stellen, Branches löschen
   (`git push origin :refs/heads/schutztest/probe`), Test-Rulesets löschen.
4. **Echte Rulesets belegen (lesend):** `node werkzeug/branchschutz-pruefen.mjs` muss alle drei Zeilen
   `GESCHUETZT` und Exit 0 zeigen.
5. **Integration funktional:** Der nächste reguläre PR nach der Einrichtung wird von Claude wie gewohnt mit grünem CI
   gemergt. Gelingt das, ist die PR-/Check-Regel richtig dimensioniert. Meldet GitHub einen fehlenden oder
   „erwarteten“ Check, stimmt die Check-Liste nicht (Abschnitt 4).

## 7. Lease nicht blockieren
Vor dem Setzen: `node werkzeug/koordination.mjs status` (Halter und Epoche notieren). **Nach** dem Setzen von
`koordination-lease`, mit dem echten Halter:
```bash
node werkzeug/koordination.mjs erneuern --halter <Halter> --epoche <Epoche>     # erwartet: OK
node werkzeug/koordination.mjs pruefen  --halter <Halter> --epoche <Epoche>     # erwartet: Exit 0
```
`erneuern` ist ein normaler Push ohne Force auf den echten Lease-Branch und beweist, dass die Regeln die
Lease-Verwaltung nicht blockieren. Er ändert nur `erneuert_am` und `gueltig_bis` des Halters.
Blockieren würden nur: Pull-Request-Pflicht, Statuscheck-Pflicht, Signaturpflicht, *Restrict updates* oder ein
Eintrag, der Pushes auf bestimmte Personen einschränkt, jeweils auf `koordination/lease`. Keine davon setzen.

**Notausstieg** (ändert nur die Regel, nie Daten): Ruleset-ID mit
`gh api repos/rinats-png/dienstplaner/rulesets --jq '.[] | {id,name,enforcement}'` lesen, dann
`gh api -X PUT repos/rinats-png/dienstplaner/rulesets/<id> -f enforcement=disabled`. Danach Ursache klären und
wieder auf `active` stellen.

## 8. Eintrag des Betreibers
- Rulesets gesetzt am: _offen_ (`koordination-lease`, `integration-release-v4`, `main-schutz`)
- `branchschutz-pruefen` Exit: _offen_
- Wirkungstest (Abschnitt 6, Schritte 1 und 2) bestanden: _offen_
- Lease-Erneuerung nach Setzen (Abschnitt 7) OK: _offen_
- Claude-Zugang ohne Administratorrecht eingerichtet: _offen_ (Entscheidung)

## 9. Bis dahin gilt
- Die Lease schützt nur kooperativ (versehentliche Doppel-Schreiber), nicht gegen Überschreiben des Branches.
- Ein gelöschter Lease-Branch zählt als „keine Lease“, die Epoche beginnt wieder bei 1. Koordinatoren arbeiten
  nach einem unerklärten Epochensprung nach unten nicht weiter, bis der Zustand geklärt ist.
- Kein Merge nach `main`, kein produktives Deployment ohne Betreiberfreigabe, keine Änderung von
  GitHub-Berechtigungen durch Claude.
