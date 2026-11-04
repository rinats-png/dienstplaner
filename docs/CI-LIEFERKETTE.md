# CI Lieferkette: Bild-Scan mit Trivy

Workflow: `.github/workflows/lieferkette.yml`, Jobs `bild-scan` und
`caddy-vorlage`. Beide sind Pflicht-Checks (siehe `docs/BRANCH-SCHUTZ.md`).

## Störung ab 2026-11-03 ca. 22:30 UTC

Symptom: `bild-scan` scheiterte beim Installieren von Trivy (Schritt
"Install Trivy" in setup-trivy: `bash ./trivy/contrib/install.sh ... v0.70.0`,
Exit 6). Der Scan lief nie. Das ist kein Scan-Befund, sondern ein
Beschaffungsfehler; trotzdem wurde der Pflicht-Check rot.

Befund aus den Protokollen von 70 Läufen (Stand 2026-11-04 00:45 UTC):

| Trivy-Binary-Cache | Läufe | Ergebnis |
|---|---|---|
| Treffer (`trivy-binary-v0.70.0-Linux-X64`) | 33 | alle grün |
| kein Treffer, Installer läuft | 37 | 29 Exit 6, 8 grün (alle 8 vor 2026-11-03 23:40) |

- Die "38 %" sind der Anteil der Läufe ohne Cache-Treffer (der Cache ist an
  Branch bzw. Basisbranch gebunden; Pull-Request-Läufe treffen ihn, Push-Läufe
  neuer Branches nicht). Mit Cache-Treffer wird nie installiert.
- Gleiches Verhalten auf `ubuntu-26.04` (35 Läufe) und `ubuntu-24.04`
  (2 Läufe, ältere Läufe eines Nachweis-Branches): Das Runner-Image ist
  nicht die Ursache. `ubuntu-latest` bleibt deshalb unverändert. Der
  Fehler von `caddy-vorlage` auf dem Nachweis-Branch war eine fehlende Datei,
  nicht der Runner.
- Der Installer (`contrib/install.sh`, curl mit `-sL`, still) fragt die
  Version bei `api.github.com` ab (gelingt: "found version: 0.70.0") und
  scheitert ca. 20 ms später beim Herunterladen des Release-Archivs von
  `github.com/aquasecurity/trivy/releases/download/...` (Weiterleitung auf
  den Asset-Host). curl-Exit 6 heißt: Host nicht auflösbar. Dieser
  Download-Pfad ist die einzige Stelle, die versagt; Checkout, Docker, Registry
  und API desselben Laufs funktionieren.
- Wiederholungen des Installers helfen nicht verlässlich (der Fehler trat in
  3 aufeinanderfolgenden Versuchen auf, derselbe Commit lief über den
  Cache-Pfad grün). Eine reine Wiederholung wäre keine technische Änderung.

## Korrektur

Trivy kommt nicht mehr als Binary von GitHub-Release-Assets, sondern als
offizielles Container-Image, per Digest gepinnt:

```
ghcr.io/aquasecurity/trivy:0.70.0@sha256:be1190afcb28352bfddc4ddeb71470835d16462af68d310f9f4bca710961a41e
```

- Gleiche Trivy-Version (0.70.0) wie vorher, also gleiche Erkennungslogik.
- Bezug über Docker-Daemon und Registry, denselben Weg wie die übrigen
  Bilder des Jobs. Der Digest ist unveränderlich (kein umhängbarer Tag).
- `aquasecurity/trivy-action` und `setup-trivy` entfallen.
- Scanumfang und Gate unverändert:
  - Bericht: alle Schweregrade (`UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL`),
    `--exit-code 0`.
  - Gate: `--severity HIGH,CRITICAL --ignore-unfixed --ignorefile .trivyignore
    --exit-code 1`. Kein `continue-on-error`, kein Überspringen. Findet Trivy
    einen behobenen HIGH/CRITICAL-Befund, endet der Schritt mit Exit 1 und der
    Check wird rot.
  - Die Datenbank wird in einem eigenen Schritt geladen; scheitert das, ist
    der Job rot (nie grün ohne Scan). Bericht und Gate nutzen dieselbe
    Datenbank (`--skip-db-update`).

## Pflicht-Checks für den PR-Kopf

Für Pull Requests gegen die geschützten Branches gelten die Checks aus
`docs/BRANCH-SCHUTZ.md`: `pruefen`, `abhaengigkeiten`, `geheimnisse`,
`muster`, `bild-scan`, `caddy-vorlage`, `shellcheck`, `compose`, `skripte`.
Für diese Änderung ist `bild-scan` der entscheidende Check (Workflow
`Lieferkette`).

## Betrieb

- Trivy aktualisieren: neuen Tag wählen, Digest lesen
  (`docker buildx imagetools inspect ghcr.io/aquasecurity/trivy:<version>`),
  beide in `TRIVY_BILD` eintragen, Bericht auf neue Befunde prüfen.
  Dependabot erkennt Digests in Workflow-`env` nicht; Aktualisierung von Hand.
- Fällt der Bezug des Bildes oder der Datenbank aus, ist der Job rot. Das ist
  gewollt. Bei einer Störung von ghcr.io hilft nur erneutes Auslösen, wenn
  die Registry wieder erreichbar ist; das Gate wird nicht umgangen.
- Ausnahmen für Befunde: nur in `.trivyignore`, mit Begründung und Ablauf.

## Negativprobe (Gate greift)

Siehe PR-Beschreibung: ein Wegwerf-Lauf auf einem Probe-Branch zeigt, dass
das Gate mit einem bekannt verwundbaren, nur in der CI gebauten Bild rot wird.
