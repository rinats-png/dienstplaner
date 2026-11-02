# WP-03 – Nachweis: Rücksprung nur über verifizierte Digests, R0

Stand: 2026-11-02 · Branch `acc45/infra/wp03-digest-rollback` (Basis `origin/feature/geo-zeiterfassung`, `a379095`) · Plan: [P0-BLOCK-WP02-04 §2](../P0-BLOCK-WP02-04.md), Befund 1 aus [H8-DEPLOY-REPORT](../H8-DEPLOY-REPORT.md)

Kein Schritt auf VPS, SSH oder Produktion. Keine reale `.env` geändert, kein Bild gezogen.

## Befund (rot vorher)

| | vorher (`a379095`) | nachher |
|---|---|---|
| `deploy/compose.yml` | `image: …/dienstplaner:${IMAGE_TAG:-latest}` | `image: …/dienstplaner@${IMAGE_DIGEST:?IMAGE_DIGEST fehlt – …}` |
| `docker compose config` ohne Variable | **läuft durch**, ergibt `image: ghcr.io/rinats-png/dienstplaner:latest` | **scheitert**: `required variable IMAGE_DIGEST is missing a value: IMAGE_DIGEST fehlt – nur verifizierte Digests` |
| nur `IMAGE_TAG=<commit>@sha256:…` | gültig | scheitert ebenso (IMAGE_TAG wird nicht mehr gelesen) |
| mit `IMAGE_DIGEST=sha256:0b192927…` | – | `image: ghcr.io/rinats-png/dienstplaner@sha256:0b1929273a79…e452f`, kein `latest` |
| BEREITSTELLUNG.md | „`IMAGE_TAG=<voriger Commit-Hash>` … nach dem Prüfen wieder auf `latest`“; Restore-Test mit `:latest` | Digest, `digest-pruefen.sh`, `ruecksprung.sh`/R0; Restore-Test mit `IMAGE_DIGEST` aus `.env` |
| Revision-Label | `deploy.yml` übergibt Labels nicht | `labels: ${{ steps.meta.outputs.labels }}` an beiden `build-push-action`-Schritten |

Beides belegt im CI-Lauf (Job `compose`): der Schritt „Nachweis rot vorher“ holt `a379095:deploy/compose.yml`, `config` ohne Variable ergibt `image: ghcr.io/rinats-png/dienstplaner:latest`; die neue Datei scheitert ohne `IMAGE_DIGEST`. Zusätzlich im Test `Befund vorher belegt: alte compose.yml hatte den Default latest`.

## Umgesetzt

| Datei | Inhalt |
|---|---|
| `deploy/compose.yml` | Bild nur per `IMAGE_DIGEST`, kein Default, kein Tag; Kopfkommentar mit Befehlen |
| `deploy/FREIGEGEBENE-IMAGES.md` | Tabelle `Digest \| Commit \| Datum \| Abnahmebericht \| Status \| Grund`: `0b192927…` aktiv (H8+, `274bfa0…`), `f03a8514…` gesperrt (P0-0), `sha256:0861adee` gesperrt (Präfix, alt). **Kein** `vorherig` |
| `deploy/freigabe-lib.sh` | gemeinsame Funktionen (Liste lesen und prüfen, Sperre auch per Präfix, `.env` lesen ohne Ausführen, Protokoll) |
| `deploy/digest-pruefen.sh` | Format → Liste stimmig → nicht gesperrt → eingetragen (aktiv/vorherig) → lokal vorhanden (kein Pull) → Bild-ID nicht gesperrt → Revision-Label = Commit (fehlend nur mit `--ohne-label`, abweichend nie). Exit 0/2/3/4/5/6 |
| `deploy/ruecksprung.sh` | Ziel nur `vorherig`; `digest-pruefen.sh`; `.env`-Sicherung; `IMAGE_DIGEST` setzen; `docker compose up -d --pull never centric-dp-web`; warten auf `healthy`; Bild-ID-Vergleich; Protokoll; `--trocken`. Verweigert gesperrte/fehlende Ziele und `.env` mit `IMAGE_TAG`, verweist auf R0; hält bei Fehlschlag **nicht** selbst an |
| `deploy/abschalten.sh` | R0: `docker compose stop` (Ersatz `docker stop`, falls Compose z. B. mangels `IMAGE_DIGEST` scheitert), prüft `exited` und Neustartzähler, Nachbeobachtung, Protokoll, Hinweis zur Wiederinbetriebnahme; `--trocken` |
| `.github/workflows/deploy.yml` | nur `labels:` an beiden Build-Schritten; Job `vps` unverändert |
| `.github/workflows/betrieb-deploy.yml` | neu: `shellcheck`, `compose config` rot/grün inkl. alter Datei, Skripttests |
| `pruefungen/deploy-skripte.test.js` | 31 Tests gegen Docker-Stub (protokolliert Aufrufe, Zustand im Temp-Verzeichnis, `pull` verboten) |
| `BEREITSTELLUNG.md` | Schritt 3 neu (Digest-Weg, 3.1 R0/Rücksprung, 3.2 Freigegebene Images pflegen, 3.3 Migration), Umgebungsvariable `IMAGE_DIGEST`, Restore-Test per Digest, Übersicht |

## Tests

| Lauf | Ergebnis |
|---|---|
| lokal, Windows 11 / Git Bash, vitest 4.1.10 | `pruefungen/deploy-skripte.test.js`: **31/31** bestanden (≈ 70 s, Git Bash langsam) |
| lokal `shellcheck` | nicht verfügbar (kein Binary installiert) → nur CI |
| CI „Betrieb: Deploy-Skripte“, Run 41482723150 (`58bc2b7`) | **rot**: Job `shellcheck` — SC1111 (Unicode-Anführungszeichen in 2 Meldungen), SC2034 (ungenutzte Variablen); `compose` und `skripte` grün |
| CI „Betrieb: Deploy-Skripte“, Run 41483207611 (`d0ded76`) | **grün**: `shellcheck` ✓, `compose` ✓ (ohne Digest scheitert, `IMAGE_TAG` allein scheitert, mit Digest ok, alte Datei → `:latest`), `skripte` ✓ **31/31** |

Abgedeckte Fälle (Stub): aktives H8+-Bild mit passendem Label zugelassen; `f03a8514` abgelehnt (Exit 3, Grund P0-0, Verweis `abschalten.sh`), auch wenn lokal vorhanden; jeder Digest mit Präfix `0861adee` abgelehnt; freigegebener Digest mit gesperrter Bild-ID abgelehnt; unbekannter Digest abgelehnt (4); Tags/`latest`/kaputte Digests abgelehnt ohne Docker-Aufruf (2); nicht lokal → 5, kein `pull`; falsches Label → 6 auch mit `--ohne-label`; fehlendes Label → 6, mit `--ohne-label` 0 + Warnung; fehlerhafte Liste (zwei aktiv, gesperrt ohne Grund, Liste fehlt) → 4. Rücksprung: richtige Befehlsfolge (`compose … up -d --pull never centric-dp-web`), `.env` nur in `IMAGE_DIGEST` geändert, Sicherung, Bild-ID, Protokoll; `--trocken` ändert nichts (`.env` bytegleich, kein `compose`, kein Protokoll, keine Sicherung); echte Liste ohne `vorherig` → verweigert mit R0; gesperrtes `vorherig` → verweigert; falsches Label → verweigert; `IMAGE_TAG` in `.env` → 4; unhealthy / falsches Bild / Zeitüberschreitung → 1 mit R0-Hinweis. R0: `compose stop` und Zustandsprüfung; Ersatz `docker stop`; Wiederanlauf erkannt → 1; `--trocken` hält nichts an; unbekannter Schalter → 2 ohne Aufruf.

## Migrationsschritt Produktions-`.env` (nur beschrieben, NICHT ausgeführt)

Gesondert freizugeben, im nächsten Deploy-Fenster (BEREITSTELLUNG.md 3.3):

    cd /opt/apps/centric-dienstplanung
    stempel=$(date -u +%Y%m%dT%H%M%SZ)
    cp -p .env ".env.vor-wp03-$stempel"; cp -p compose.yml "compose.yml.vor-wp03-$stempel"
    grep -c '^IMAGE_TAG=' .env                      # erwartet: 1
    digest=$(sed -n 's/^IMAGE_TAG=[0-9a-f]\{40\}@\(sha256:[0-9a-f]\{64\}\)$/\1/p' .env)
    echo "$digest"                                   # erwartet: sha256:0b192927…e452f
    # compose.yml, FREIGEGEBENE-IMAGES.md, freigabe-lib.sh, digest-pruefen.sh,
    # ruecksprung.sh, abschalten.sh aus deploy/ hierher kopieren (chmod +x *.sh)
    ./digest-pruefen.sh "$digest" --ohne-label       # H8+-Bild hat noch kein Revision-Label
    sed -i "s/^IMAGE_TAG=.*/IMAGE_DIGEST=$digest/" .env
    grep -E '^IMAGE_(TAG|DIGEST)=' .env              # erwartet: genau IMAGE_DIGEST=…
    docker compose config --no-env-resolution | grep image:
    docker compose up -d --pull never centric-dp-web # gleiches Bild; Neuerzeugung möglich (Sekunden)

Zurück: beide `.vor-wp03-…`-Dateien zurückkopieren, `docker compose up -d --pull never`.

## Abweichung vom Plan

P0-BLOCK §2.1 sah vor, `IMAGE_TAG=<sha>@sha256:<d>` übergangsweise gültig zu lassen. Nach dem Auftrag für dieses Paket wird `IMAGE_TAG` **nicht mehr** unterstützt; stattdessen ist die Migration beschrieben, und `ruecksprung.sh` verweigert eine `.env` mit `IMAGE_TAG`. `abschalten.sh` funktioniert auch vor der Migration (Ersatz `docker stop`).

## Offen

1. **VPS-Probe** (Plan §2 Tests): Bild A → B → `ruecksprung.sh` → A auf isoliertem Testcontainer, jeweils `healthy` und richtiger Digest — braucht Freigabe; hier nur gegen Stub geprüft.
2. **Einführung** in die Produktions-`compose.yml`/`.env` (Migration oben) und Kopie der Skripte auf den VPS — gesondert freizugeben.
3. **Lokales VPS-Tag `latest` → `alt-0861adee`** umbenennen — gesondert freizugeben.
4. **Voller Digest von `0861adee`** ist nicht belegt; gesperrt per Präfix (trifft Digest und Bild-ID). Bei der nächsten lesenden Prüfung auf dem VPS (`docker image inspect … --format '{{.Id}} {{.RepoDigests}}'`) nachtragen.
5. **H8+-Bild hat kein Revision-Label** (vor WP-03 gebaut) → bis zum nächsten Bau nur mit `--ohne-label`; Herkunft ist im H8-Bericht anders belegt.
6. **`.env.example`** enthält noch `IMAGE_TAG=latest` — nicht in meinem Dateibesitz; sollte auf `IMAGE_DIGEST=sha256:<aus FREIGEGEBENE-IMAGES.md>` geändert werden (ohne Folge für den Start: ohne `IMAGE_DIGEST` startet Compose ohnehin nicht).
7. **`/opt/bin/deploy.sh`** (Job `vps`, nicht im Repo) arbeitet laut Kommentar mit Kennzeichen und automatischem Rollback — vor dem Scharfschalten auf Digest, `digest-pruefen.sh` und R0 umstellen. Job `vps` bewusst unverändert.
8. Ein Revision-Label im neu gebauten Bild ist erst nach dem nächsten Lauf „Auslieferung“ nachweisbar (`docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'`).
