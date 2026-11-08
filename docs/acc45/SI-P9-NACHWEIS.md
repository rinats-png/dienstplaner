# SI-P9 – Workflow-Härtung (Nachweis)

Restbefunde 1 und 2 aus `docs/acc45/SI-P8-NACHWEIS.md` (Abschnitt „Offene Risiken“).

## Ausgangslage (geprüft am 2026-11-08 gegen `integration/release-v4`)

| Workflow | checkout ohne `persist-credentials: false` | Top-Level-`permissions` |
|---|---|---|
| `betrieb-sicherung.yml` | 1 | ja (`contents: read`) |
| `sicherheit.yml` | 3 von 4 | ja |
| `pruefung.yml` | 1 | **nein** |
| `lieferkette.yml`, `lasttest.yml` | 0 (schon gehärtet) | ja |
| `deploy.yml`, `betrieb-deploy.yml` | nicht geändert (Betreiberfreigabe Deploy-Pipeline) | ja / ja |

## Änderung

- `sicherheit.yml`: `persist-credentials: false` bei den Checkouts der Jobs `abhaengigkeiten`, `geheimnisse`, `muster`.
- `pruefung.yml`: Top-Level `permissions: contents: read` (der Bau bleibt lokal, `load: true`, ohne Push). Der Aufrufer `deploy.yml` setzt ohnehin `contents: read`. `persist-credentials: false` beim Checkout.
- `betrieb-sicherung.yml`: `persist-credentials: false`. Der Workflow ruft kein `git` nach dem Checkout auf.
- Keine Berechtigung wurde erweitert, kein Trigger und keine Logik geändert.

## Tests

| Prüfung | Ergebnis |
|---|---|
| `pruefungen/workflow-haertung.test.js` (neu) | 7/7 grün: Regel mit grünen und roten Proben (fehlendes persist, `true`, fehlendes `permissions`, `packages: write`, `write-all`), Stand im Repository |
| `npm run pruefung:sicherheit-intern` | 55/55 grün (4 Dateien) |
| `node werkzeug/sicherheit/actions-pins.mjs` | 7 Dateien, 32 externe Referenzen, 2 lokale: ok |
| `node werkzeug/verdrahtung-pruefen.mjs` | ok, 281 Prüfdateien |
| Alle Workflow-Dateien parsen mit `js-yaml` | ja |

Nicht lokal ausführbar: die echten GitHub-Läufe. Sie laufen beim Push.

## Ausnahmen (bewusst offen)

- `deploy.yml` und `betrieb-deploy.yml`: Härtung erst nach Betreiberfreigabe der Deploy-Pipeline (Akzeptanz SI-P8).
- Restbefunde 3 bis 5 aus SI-P8 (gitleaks-Binary ohne Version, buildx ohne `version:`, `apt-get install shellcheck` ohne Version): eigene Pakete, weil sie das Verhalten der Pipeline ändern.
