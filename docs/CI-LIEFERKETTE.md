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
`docs/acc45/BETREIBER-BRANCHSCHUTZ.md` (älter: `docs/BRANCH-SCHUTZ.md`): `pruefen-a`, `pruefen-b`,
`pruefen-c`, `browser-abnahme`, `abhaengigkeiten`, `geheimnisse`, `interne-pruefung`, `muster`, `bild-scan`, `caddy-vorlage`, `shellcheck`, `compose`, `skripte`.
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

Wegwerf-Branch (inzwischen gelöscht), Gate-Schritt gegen das öffentliche,
bekannt verwundbare `alpine:3.10` statt gegen das Projektbild: Lauf 41750461290,
`Total: 1 (HIGH: 0, CRITICAL: 1)`, Schritt "Gate" endet mit Exit 1, Job rot.
Nichts davon steht im Repository.

## Ergebnis der Korrektur

10 von 10 Läufen mit der neuen Fassung grün (3 Push-, 7 manuell ausgelöste
Läufe, alle ohne Trivy-Binary-Cache, also im früheren Fehlerpfad). Ein
elfter Lauf scheiterte sofort an einem Tippfehler (fehlende Umgebungsvariable)
im ersten Commit, nicht an Trivy; ein zwölfter wurde von Hand abgebrochen.
Bezug von `ghcr.io` (Bild und Datenbank): 10 von 10 erfolgreich.

## Nachtrag 2026-11-24: Cache-504 im Bildbau (`cache-to: type=gha`)

- **Befund:** Der Schritt `docker/build-push-action` (Bild bauen) scheiterte
  zweimal mit `error writing layer blob: failed to parse error response 504`
  (HTML-504-Seite des GitHub-Cache-Backends): Lauf 45427085462 (Job
  `sicherung`/Bildbau, Wiederholung grün) und Lauf 45432642405 (`pruefen-c`,
  push-Lauf; derselbe SHA im pull_request-Lauf grün). Der Build selbst war in
  Ordnung. Es schlug das SCHREIBEN des Build-Caches fehl.
- **Gegenmaßnahme:** `cache-to: type=gha,mode=max,ignore-error=true` in
  `pruefung.yml` (`pruefen-c`), `deploy.yml` (Job `bild`, Prüfbau) und
  `betrieb-sicherung.yml`. Ein Fehler beim Cache-EXPORT ist dann nicht mehr
  fatal. Ein echter Build- oder Push-Fehler bleibt fatal. `cache-from` ist
  unverändert. `pruefungen/workflow-haertung.test.js` verlangt das Attribut an
  jedem `cache-to: type=gha`.
- **Risiko:** Ein fehlgeschlagener Cache-Export bleibt für den Lauf stumm.
  BuildKit schreibt eine Warnung ins Log des Schrittes (nach `cache-to`
  suchen). Folgeläufe sind dann langsamer (Cache fehlt). Der Lauf selbst
  bleibt korrekt.
- **Weiterhin Rot und Wiederholung:** Ein 504 beim Bezug (Registry,
  `cache-from`, Basis-Bilder) bleibt ein Fehler. Dann hilft ein erneuter Lauf
  der fehlgeschlagenen Jobs; im Bericht benennen, kein "Flake" ohne Ursache.
