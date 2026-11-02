# Branch-Schutz — Empfehlung

Stand 2026-11-02 (WP-32). **Nicht gesetzt.** Eine Repository-Einstellung
ändert, wer was darf; sie braucht eine eigene Freigabe des Inhabers. Bei
Erstellung dieses Dokuments ergab
`gh api repos/rinats-png/dienstplaner/branches/main/protection` die Antwort
`404 Branch not protected`.

Gilt für `main` und `integration/centric-complete`.

## Regeln

| Regel | Wert | Warum |
|---|---|---|
| Änderungen nur per Pull Request | ja | Kein direkter Push, auch nicht versehentlich aus einem Agenten-Worktree. |
| Erforderliche Freigaben | 1 | Jede Änderung hat ein zweites Paar Augen gesehen. |
| Veraltete Freigaben verwerfen | ja | Ein neuer Commit nach der Freigabe braucht eine neue. |
| Gespräche müssen erledigt sein | ja | Offene Review-Anmerkungen blockieren das Mergen. |
| Pflicht-Checks | siehe unten | |
| Branch muss aktuell sein (`strict`) | ja | Die Checks liefen gegen den Stand, der gemergt wird. |
| Force-Push | verboten | Verlauf ist Beleg (Freigabeliste, Nachweise). |
| Löschen des Branches | verboten | |
| Für Administratoren | **nicht** erzwungen (`enforce_admins: false`) | Das Repository hat einen Inhaber. Mit Erzwingen könnte er seine eigenen Pull Requests nie mergen (GitHub lässt die eigene Freigabe nicht zählen). Jede Umgehung zeigt GitHub im Pull Request an. Sobald es eine zweite Person mit Schreibrecht gibt: auf `true` stellen. |

## Pflicht-Checks

Namen = Job-Kennungen in den Workflows, so wie GitHub sie als Check zeigt.
Gebunden an die GitHub-Actions-App (`app_id` 15368), damit ein beliebiger
Commit-Status gleichen Namens sie nicht erfüllt.

| Check | Workflow | Datei |
|---|---|---|
| `pruefen` | Prüfung | `.github/workflows/pruefung.yml` |
| `abhaengigkeiten` | Sicherheit | `.github/workflows/sicherheit.yml` |
| `geheimnisse` | Sicherheit | `.github/workflows/sicherheit.yml` |
| `muster` | Sicherheit | `.github/workflows/sicherheit.yml` |
| `bild-scan` | Lieferkette | `.github/workflows/lieferkette.yml` |
| `caddy-vorlage` | Lieferkette | `.github/workflows/lieferkette.yml` |
| `shellcheck` | Betrieb: Deploy-Skripte | `.github/workflows/betrieb-deploy.yml` |
| `compose` | Betrieb: Deploy-Skripte | `.github/workflows/betrieb-deploy.yml` |
| `skripte` | Betrieb: Deploy-Skripte | `.github/workflows/betrieb-deploy.yml` |

Bewusst **nicht** Pflicht:

- `sicherung` (Betrieb Sicherung) — läuft nur bei Änderungen an bestimmten
  Pfaden. Ein Pflicht-Check, der nicht startet, blockiert jeden anderen
  Pull Request für immer.
- `Auslieferung` (`deploy.yml`) — wird von Hand gestartet, nicht bei Pull
  Requests.

Hinweis zu `bild-scan`: Neue Schwachstellenmeldungen erscheinen ohne
Änderung am Quelltext. Dann wird ein Pull Request rot, der nichts damit zu
tun hat. Das ist gewollt — die Antwort ist ein Fix oder eine begründete,
befristete Zeile in `.trivyignore`, nicht das Abschalten des Checks.

Wird ein Job umbenannt, muss diese Liste und die Einstellung im
Repository mitgezogen werden — sonst wartet jeder Pull Request auf einen
Check, den es nicht mehr gibt.

## Setzen (nach Freigabe)

Einmal je Branch, mit einem Token mit Administrationsrecht auf das
Repository (`gh auth status` zeigt den Umfang).

```bash
for ZWEIG in main integration/centric-complete; do
gh api -X PUT "repos/rinats-png/dienstplaner/branches/${ZWEIG}/protection" \
  -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "pruefen",          "app_id": 15368 },
      { "context": "abhaengigkeiten",  "app_id": 15368 },
      { "context": "geheimnisse",      "app_id": 15368 },
      { "context": "muster",           "app_id": 15368 },
      { "context": "bild-scan",        "app_id": 15368 },
      { "context": "caddy-vorlage",    "app_id": 15368 },
      { "context": "shellcheck",       "app_id": 15368 },
      { "context": "compose",          "app_id": 15368 },
      { "context": "skripte",          "app_id": 15368 }
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
done
```

Prüfen:

```bash
gh api repos/rinats-png/dienstplaner/branches/main/protection \
  --jq '{checks: [.required_status_checks.checks[].context], strict: .required_status_checks.strict,
         reviews: .required_pull_request_reviews.required_approving_review_count,
         force: .allow_force_pushes.enabled, loeschen: .allow_deletions.enabled}'
```

Zurücknehmen:

```bash
gh api -X DELETE repos/rinats-png/dienstplaner/branches/main/protection
```

## Vor dem Setzen

- Die API nimmt jeden Check-Namen an, auch einen, der nie läuft.
  `bild-scan` und `caddy-vorlage` laufen erst, wenn WP-32
  (`.github/workflows/lieferkette.yml`) auf dem Quell-Branch des Pull
  Requests liegt — für `main` also **erst setzen, wenn WP-32 dort gemergt
  ist**, sonst wartet jeder Pull Request auf einen Check, der nicht kommt.
- Offene Pull Requests werden nach dem Setzen an den neuen Regeln gemessen.
