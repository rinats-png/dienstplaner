# Betrieb: Sicherung außer Haus und Wiederherstellungsprobe (WP-04)

Stand: 2026-11-02 · Skripte: `deploy/sicherung/` · CI-Nachweis: `.github/workflows/betrieb-sicherung.yml`
Grundlagen: [BEREITSTELLUNG.md 5.4](../BEREITSTELLUNG.md) (Werkzeug `ablage-sicherung`, Pfeffer, Klassen A/B/C), Plan WP-04 (P0-BLOCK-WP02-04.md, Abschnitt 3)

> **Drei Entscheidungen liegen bei dir** und sind unten mit **[ENTSCHEIDUNG]** markiert:
> 1. Speicherziel (Empfehlung: Hetzner Storage Box über sftp, oder S3-kompatibel in der EU),
> 2. Verwahrung des restic-Passworts (Empfehlung: Passwortmanager + versiegelte Papierkopie),
> 3. Alarmdienst (Empfehlung: Healthchecks.io EU oder vergleichbarer Totmannschalter).
>
> Bis dahin ist nichts eingerichtet. Freigaben laut Plan: Cron-Eintrag, Anlegen des Repositorys, erster Produktivlauf, Fehlalarm-Probe.

## 1. Was die Skripte tun

**`sicherung-ausser-haus.sh`** (täglich 02:30 UTC, Benutzer `admin`, ohne sudo)

| # | Schritt | Bei Fehler |
|---|---|---|
| 0 | Konfiguration lesen (Env-Datei, Modus 600), Sperre nehmen, Start-Ping | Exit 78 (Konfiguration) bzw. 75 (anderer Lauf aktiv, **kein** Ping) |
| 1 | `restic cat config` — Repository erreichbar, Passwort richtig | Fail-Ping, `status.json` |
| 2 | `ablage-sicherung sichern` im **Produktionsbild per Digest**: `--network none --read-only --cap-drop ALL`, Daten `:ro`, eigene uid | 〃 |
| 3 | `ablage-sicherung pruefen` | 〃 |
| 4 | `restic backup` des Sicherungsordners, Tags `centric`, `datum=JJJJ-MM-TT`, `bild=sha256:…` | 〃 |
| 5 | `restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune` (nur Host-Kennung `centric`, Tag `centric`) | 〃 |
| 6 | `restic check --read-data-subset 5%` | 〃 |
| 7 | lokale Kopien bis auf `LOKAL_BEHALTEN` (2) löschen | 〃 |
| 8 | `~/sicherung/status.json`, Erfolgs-Ping | — |

`status.json`: `zeit, ergebnis (ok|fehler), schritt, sicherung, dateien, bytes, snapshot_id, daten_hinzugefuegt, dauer_s, bild`.

**`wiederherstellung-probe.sh`** (monatlich; `--snapshot ID` für einen bestimmten Stand)

1. `restic restore` des neuesten Snapshots in einen leeren Temp-Ordner unter `~/sicherung/probe/`,
2. `ablage-sicherung pruefen`,
3. `ablage-sicherung wiederherstellen` in ein leeres Datenziel — dabei prüft das Werkzeug den **Pfeffer aus der `.env` des Dienstes** gegen den Prüfwert der Sicherung,
4. Manifest-Abgleich Datei für Datei (SHA-256): `N gleich, 0 abweichend, 0 fehlend, 0 überzählig` ist Pflicht,
5. Probe-Container **ohne Netz** aus dem Produktionsbild auf dem Datenziel, `healthy` abwarten, Bestände über die Leseschicht des Servers zählen (`lesbar == erwartet`), Konten zählen,
6. Container und Temp-Ordner entfernen, `~/sicherung/probe-status.json`, Ping.

Die laufende Anwendung, `/opt/apps/centric-dienstplanung/data` und das Repository werden dabei nicht verändert.

**Schutzmaßnahmen in beiden Skripten:** `set -Eeuo pipefail`, `umask 077`, EXIT-Trap mit Fail-Ping und Statusdatei, gemeinsame Sperrdatei (`flock`), Konfiguration wird nicht ausgeführt (kein `source`, nur bekannte Schlüssel), `RESTIC_PASSWORD` ist verboten (nur `RESTIC_PASSWORD_FILE`), die Ping-URL geht über `curl -K -` (nicht in `ps`, nicht im Log), der Pfeffer nur per `--env-file`. Logs: `~/sicherung/log/`, 60 Tage.

## 2. Einrichtung Schritt für Schritt (VPS, Benutzer `admin`)

Alles im Home von `admin`, kein sudo. Vorher: Freigabe für Cron und ersten Lauf.

**2.1 Skripte ablegen** — aus einem geprüften Commit, nicht von Hand abgetippt:

    git -C ~/dienstplaner-quelle fetch && git -C ~/dienstplaner-quelle checkout <commit>   # oder Archiv des Commits
    mkdir -p ~/centric-sicherung && cp -r ~/dienstplaner-quelle/deploy/sicherung/. ~/centric-sicherung/
    chmod 700 ~/centric-sicherung

**2.2 restic installieren** (ohne sudo, gepinnt, Prüfsumme prüfen — dieselbe Version wie in CI):

    mkdir -p ~/.local/bin && cd /tmp
    curl -fsSLO https://github.com/restic/restic/releases/download/v0.18.1/restic_0.18.1_linux_amd64.bz2
    echo "680838f19d67151adba227e1570cdd8af12c19cf1735783ed1ba928bc41f363d  restic_0.18.1_linux_amd64.bz2" | sha256sum -c -
    bunzip2 -c restic_0.18.1_linux_amd64.bz2 > ~/.local/bin/restic && chmod 755 ~/.local/bin/restic
    ~/.local/bin/restic version

Außerdem nötig (auf Ubuntu vorhanden): `docker` (admin in der Gruppe docker), `curl`, `flock`.

**2.3 [ENTSCHEIDUNG 1] Speicherziel anlegen** — Zugangsdaten legst du selbst an.

*Hetzner Storage Box (sftp):* Unterkonto oder Hauptkonto, SSH aktivieren, eigenen Schlüssel nur für die Sicherung:

    ssh-keygen -t ed25519 -N "" -f ~/.ssh/centric-storagebox -C centric-sicherung
    # öffentlichen Schlüssel bei der Storage Box hinterlegen (Hetzner-Anleitung „SSH-Schlüssel“)
    cat >> ~/.ssh/config <<'EOF'
    Host centric-storagebox
      HostName uXXXXXX.your-storagebox.de
      User uXXXXXX
      Port 23
      IdentityFile ~/.ssh/centric-storagebox
      IdentitiesOnly yes
    EOF
    chmod 600 ~/.ssh/config
    ssh centric-storagebox ls   # Host-Schlüssel einmal bewusst bestätigen

→ `RESTIC_REPOSITORY=sftp:centric-storagebox:/./centric-restic`

*S3-kompatibel (EU):* eigener Bucket, Schlüssel nur mit Rechten auf diesen Bucket; `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in die Konfigurationsdatei (Modus 600), `RESTIC_REPOSITORY=s3:https://<endpunkt>/<bucket>/centric-restic`. Empfehlung: Objektsperre/Versionierung am Bucket, damit ein kompromittierter VPS die Sicherungen nicht löschen kann (siehe Grenzen).

Laut Plan zuerst ein **Test**-Repository (eigener Pfad, z. B. `/./centric-restic-test`), erst danach das produktive.

**2.4 [ENTSCHEIDUNG 2] restic-Passwort erzeugen und verwahren**

    mkdir -p -m 700 ~/.config/centric-sicherung
    ( umask 077; openssl rand -base64 36 > ~/.config/centric-sicherung/restic-passwort )

Dieses Passwort **sofort** in den Passwortmanager übertragen und zusätzlich auf Papier, versiegelt, außerhalb des Büros/Servers. **Ohne das Passwort ist jede Sicherung wertlos — es gibt keine Wiederherstellung des Passworts.** Nicht auf dem Bildschirm teilen, nicht in Chats, nicht ins Repository.

Zusätzlich gehören in den Passwortmanager (getrennt von den Sicherungen): `CENTRIC_PFEFFER` aus der `.env` (siehe BEREITSTELLUNG 5.4) und die Zugangsdaten des Speicherziels. Für den Ernstfall braucht man alle drei: **Passwort + Pfeffer + Zugang zum Speicherziel.**

**2.5 Konfiguration**

    cp ~/centric-sicherung/env.beispiel ~/.config/centric-sicherung/env
    chmod 600 ~/.config/centric-sicherung/env
    # eintragen: CENTRIC_PROD_IMAGE (Digest!), RESTIC_REPOSITORY, ALARM_PING_URL …
    docker inspect --format '{{index .RepoDigests 0}}' \
      "$(cd /opt/apps/centric-dienstplanung && docker compose images -q centric-dp-web)"

`CENTRIC_PROD_IMAGE` muss bei **jeder Auslieferung** nachgezogen werden (gleicher Digest wie der Dienst). Ein veraltetes Bild sichert weiter korrekt, solange es das Werkzeug enthält; die Probe startet dann aber die alte Fassung.

**2.6 Repository anlegen** (einmalig):

    export RESTIC_REPOSITORY=…  RESTIC_PASSWORD_FILE=~/.config/centric-sicherung/restic-passwort
    ~/.local/bin/restic init

**2.7 [ENTSCHEIDUNG 3] Alarm** — zwei Checks beim Totmannschalter:
- `centric-sicherung`: Periode 1 Tag, Kulanz 2–3 h → `ALARM_PING_URL`,
- `centric-probe`: Periode ~31 Tage, Kulanz 1 Tag → `PROBE_PING_URL`.
Benachrichtigung per Mail/Push an dich. Die Skripte rufen `<URL>/start`, `<URL>` (Erfolg, mit kurzer Zusammenfassung im Rumpf) und `<URL>/fail`.

**2.8 Probelauf, Probe, Fehlalarm-Probe** (mit Freigabe, zuerst gegen das Test-Repository):

    ~/centric-sicherung/sicherung-ausser-haus.sh && cat ~/sicherung/status.json
    ~/centric-sicherung/wiederherstellung-probe.sh && cat ~/sicherung/probe-status.json
    # Fehlalarm: Kopie der Konfiguration mit falscher Passwortdatei (Modus 600)
    ~/centric-sicherung/sicherung-ausser-haus.sh ~/.config/centric-sicherung/env.fehlalarm   # Exit ≠ 0, Alarm muss ankommen

Erwartet bei der Probe: `Manifest-Abgleich: N gleich, 0 abweichend, 0 fehlend, 0 überzählig` und `Bestände lesbar: X von X`.

**2.9 Cron** (`crontab -e`, Vorlage `deploy/sicherung/crontab.beispiel`): täglich 02:30 UTC Sicherung, am 3. jedes Monats 04:15 UTC Probe. Systemzeit vorher prüfen (`timedatectl`).

## 3. Ernstfall: Wiederherstellung

Ausgangslage: Daten verloren/beschädigt oder neuer Server. Benötigt: restic-Passwort, Zugang zum Speicherziel, `CENTRIC_PFEFFER`, das Bild (Digest steht im Snapshot-Tag `bild=…`).

1. **R0 – Anhalten.** `cd /opt/apps/centric-dienstplanung && docker compose stop -t 30` (kein Leck, kein Weiterschreiben auf einen kaputten Stand). Sicherung und Probe aus dem Cron nehmen oder warten (Sperre).
2. **Snapshot wählen und holen.**

        export RESTIC_REPOSITORY=…  RESTIC_PASSWORD_FILE=~/.config/centric-sicherung/restic-passwort
        restic snapshots --host centric --tag centric          # Zeit, Tags datum=…, bild=…
        mkdir -m 700 ~/notfall && restic restore <ID> --target ~/notfall
        S=$(dirname "$(find ~/notfall -name FERTIG -path '*/centric-sicherung-*')")

3. **Prüfen** (Bild = Digest aus dem Tag `bild=` bzw. aktueller Dienst):

        docker run --rm --network none --read-only --cap-drop ALL --user 1000:1000 \
          --env-file .env -v "$S:/s:ro" --entrypoint node <bild@sha256:…> \
          werkzeug/ablage-sicherung.mjs pruefen --sicherung /s

4. **Wiederherstellen** — Weg 1 aus BEREITSTELLUNG 5.4 (altes `data/` beiseite, neues leeres `data/`, Werkzeug `wiederherstellen`, Container neu erzeugen mit `--pull never`). Ohne sudo: `mkdir -m 700 data` als `admin` (uid 1000 = node).
5. **Start und Kontrolle.** `docker compose up -d --pull never`, `docker compose ps` (healthy), anmelden, Betrieb öffnen, Stichproben. Alle Nutzer müssen sich neu anmelden (Klasse C fehlt bewusst); seit der Sicherung Geschehenes (auch Zugangsentzüge, Passwortänderungen) ist zurückgenommen und muss erneut ausgeführt werden.
6. **Danach:** `~/notfall` und `data.vor-wiederherstellung-…` erst nach Bestätigung entfernen (enthalten Personaldaten), Cron wieder aktivieren, eine Sicherung von Hand anstoßen.

Neuer Server: Docker + Compose wie in BEREITSTELLUNG, `.env` mit **demselben** Pfeffer aus dem Passwortmanager, dann 2.2/2.3 (Schlüssel neu) und Schritt 2–5.

## 4. Grenzen (ehrlich)

- **Löschschutz:** Der VPS hat Schreibzugriff auf das Repository (für `forget --prune`). Ein Angreifer mit `admin`-Rechten könnte die Sicherungen löschen. Abhilfe (deine Entscheidung): Storage Box mit Snapshots/Unterkonto ohne Löschrecht, S3 mit Object Lock, oder `rest-server --append-only` und Prune von einem zweiten Rechner.
- **RPO 24 h:** Täglich eine Sicherung; was dazwischen geschieht, ist im Ernstfall verloren. Die In-App-Sicherungen im Betrieb (Klasse A) helfen nur bei fachlichen Fehlern, nicht bei Verlust des Servers.
- **Konsistenz:** Der Server läuft während der Sicherung; das Werkzeug erkennt Änderungen (Nachvergleich, drei Versuche) und bricht sonst ab → Fail-Ping. Mit WP-02 (Raumsperre) wird das seltener.
- **`restic check` liest täglich nur 5 %** der Daten; über ca. 20 Tage wird alles einmal gelesen (zufällig, ohne Garantie). Die monatliche Probe liest den neuesten Snapshot vollständig.
- **Probe prüft Lesbarkeit, nicht Fachlichkeit:** Bestände setzen sich zusammen, der Server wird healthy; eine Anmeldung prüft sie nicht (kein Netz, keine Zugangsdaten).
- **Pfeffer und Passwort liegen auf dem VPS** (in `.env` bzw. der Passwortdatei). Wer den VPS übernimmt, hat beides. Die Sicherung schützt gegen Verlust und gegen das Speicherziel, nicht gegen einen kompromittierten VPS.
- **Aufbewahrung** greift nur auf Snapshots mit Host-Kennung `centric` und Tag `centric`; `RESTIC_HOST` nie ändern. Ältester Snapshot bleibt, solange eine Regel freie Plätze hat (restic ≥ 0.17).
- **Bild-Digest:** muss nach jeder Auslieferung in der Konfiguration nachgezogen werden (siehe 2.5). Wird das alte Bild per `docker image prune` entfernt, scheitert der Lauf laut (Fail-Ping), nicht still.
- **Zeitzone:** Cron in Systemzeit; die Skripte selbst arbeiten in UTC.

## 5. Nachweis

CI (`betrieb-sicherung.yml`, `deploy/sicherung/ci/ende-zu-ende.sh`) mit echtem Bild, Testdaten über die Anwendungsschicht und lokalem restic-Repository: Modusprüfung, drei Sicherungen, Aufbewahrung gegen unabhängige Nachrechnung (40 künstliche Snapshots per `restic backup --time`, keine Uhrmanipulation), lokale Ausdünnung, zwei Wiederherstellungsproben, Fehlalarm (falsches Passwort → Fail-Ping), Probe mit fremdem Pfeffer (abgelehnt → Fail-Ping), Sperre gegen Doppellauf, keine Geheimnisse in Logs. Ergebnisse: [docs/acc45/wp04-nachweis.md](acc45/wp04-nachweis.md).

Offen und nicht Teil dieses Pakets: Ausdünnen der In-App-Sicherungen und der Spur (F-26, `server/lib/daten.mjs`, anderer Agent).
