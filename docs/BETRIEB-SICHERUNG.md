# Betrieb: Sicherung außer Haus und Wiederherstellungsprobe (WP-04)

Stand: 2026-11-02 · Skripte: `deploy/sicherung/` · CI-Nachweis: `.github/workflows/betrieb-sicherung.yml` · Ergebnisse: [acc45/wp04-nachweis.md](acc45/wp04-nachweis.md)
Grundlage: [BEREITSTELLUNG.md 5.4](../BEREITSTELLUNG.md) (Werkzeug `ablage-sicherung`, Pfeffer, Klassen A/B/C)

> **Drei Entscheidungen liegen bei dir** und sind unten mit **[ENTSCHEIDUNG]** markiert:
> 1. Speicherziel (Empfehlung: Hetzner Storage Box über sftp, oder S3-kompatibel in der EU),
> 2. Verwahrung des restic-Passworts (Empfehlung: Passwortmanager + versiegelte Papierkopie),
> 3. Alarmdienst (Empfehlung: Healthchecks.io EU oder vergleichbarer Totmannschalter).
>
> Bis dahin ist nichts eingerichtet. Freigaben: Cron-Eintrag, Anlegen des Repositorys, erster Produktivlauf, Fehlalarm-Probe.

## 1. Was die Skripte tun

**`sicherung-ausser-haus.sh`** (täglich 02:30 UTC, Benutzer `admin`, ohne sudo)

| # | Schritt (`schritt` in status.json) | Bei Fehler |
|---|---|---|
| 0 | `konfiguration`, `sperre`: Env-Datei (Modus 600) lesen und prüfen, Sperre nehmen, Start-Ping | Exit 78 bzw. 75 (anderer Lauf aktiv, **kein** Ping) |
| 1 | `repository-zugang`: `restic cat config` — Repository erreichbar, Passwort richtig | Fail-Ping, `status.json` |
| 2 | `sichern`: `ablage-sicherung sichern` im **Produktionsbild per Digest**: `--network none --read-only --cap-drop ALL`, Daten `:ro`, eigene uid, nur `CENTRIC_PFEFFER` im Container | 〃 |
| 2a | `plausibilitaet`: Abbruch bei 0 Dateien, leerem Store `centric`, Rückgang der Dateizahl gegenüber dem letzten Erfolg um mehr als `SCHWUND_GRENZE_PROZENT` (20 %), oder wenn das Werkzeug keinen Pfeffer sah | 〃 |
| 3 | `pruefen`: `ablage-sicherung pruefen` | 〃 |
| 4 | `restic-backup`: Tags `centric`, `datum=JJJJ-MM-TT`, `bild=sha256:…` | 〃 |
| 5 | `restic-forget`: `--keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune` (Host-Kennung `centric`, Tag `centric`, gruppiert nur nach Host) | 〃 |
| 6 | `restic-check`: `--read-data-subset 5%` | 〃 |
| 7 | `lokal-ausduennen`: lokale Kopien bis auf `LOKAL_BEHALTEN` (2) löschen | 〃 |
| 8 | `fertig`: `~/sicherung/status.json` und `letzte-erfolgreiche.json`, Erfolgs-Ping | — |

`status.json`: `zeit, ergebnis (ok|fehler), schritt, sicherung, dateien, bytes, snapshot_id, daten_hinzugefuegt, dauer_s, bild`. Log je Lauf: `~/sicherung/log/sicherung-<UTC>.log` (60 Tage).

**`wiederherstellung-probe.sh`** (monatlich; `--snapshot ID` für einen bestimmten Stand)

1. `restic restore` des neuesten Snapshots (`--group-by host --latest 1`) in einen leeren Temp-Ordner unter `~/sicherung/probe/`,
2. `ablage-sicherung pruefen`,
3. `ablage-sicherung wiederherstellen` in ein leeres Datenziel — dabei prüft das Werkzeug den **Pfeffer aus der `.env` des Dienstes** gegen den Prüfwert der Sicherung,
4. Manifest-Abgleich Datei für Datei (SHA-256): `N gleich, 0 abweichend, 0 fehlend, 0 überzählig` ist Pflicht,
5. Probe-Container **ohne Netz** aus dem Produktionsbild auf dem Datenziel (nur Pfeffer in der Umgebung), `healthy` abwarten, Bestände über die Leseschicht des Servers zählen (`lesbar == erwartet`), Konten zählen,
6. Container und Temp-Ordner entfernen, `~/sicherung/probe-status.json`, Ping. Log: `~/sicherung/log/probe-<UTC>.log`.

Die laufende Anwendung, `/opt/apps/centric-dienstplanung/data` und das Repository werden dabei nicht verändert.

**Schutzmaßnahmen in beiden Skripten**
- `set -Eeuo pipefail`, `umask 077`, EXIT-Trap mit Fail-Ping und Statusdatei; gemeinsame Sperrdatei (`flock`).
- **Zeitgrenzen:** jeder restic-Aufruf `ZEITGRENZE_RESTIC` (Vorgabe 7200 s), jeder Container `ZEITGRENZE_CONTAINER` (900 s), jeweils `timeout --kill-after=60`. Bei Ablauf: Container wird entfernt, Exit 124, Fail-Ping — die Sperre hängt nie dauerhaft.
- Konfiguration wird nicht ausgeführt (kein `source`, nur bekannte Schlüssel). In die Umgebung gehen nur `RESTIC_*`- und `AWS_*`/`B2_*`-Werte für restic; Ping-URLs bleiben Shell-Variablen und gehen über `curl -K -` hinein (nicht in `ps`, nicht im Log). Ping-URLs müssen `http(s)://` sein und dürfen kein `"`, `\`, `'` oder Leerzeichen enthalten.
- `RESTIC_PASSWORD` ist verboten (nur `RESTIC_PASSWORD_FILE`).
- **Pfeffer:** Container bekommen nicht die ganze `.env`, sondern eine Temp-Datei (Modus 600, im Trap gelöscht) nur mit `CENTRIC_PFEFFER`. Steht er in der `.env` in Anführungszeichen (`"…"` oder `'…'`), werden sie entfernt — genau wie `docker compose` (env_file) es beim Dienst tut; `docker run --env-file` täte es nicht und sähe sonst einen anderen Pfeffer. Fehlt der Pfeffer, bricht die Sicherung ab.
- Status-, Lokal- und Probeordner werden **vor** dem Anlegen geprüft: Sie dürfen weder `CENTRIC_DATEN_PFAD` sein noch darin liegen.

## 2. Einrichtung Schritt für Schritt (VPS, Benutzer `admin`)

Alles im Home von `admin`, kein sudo. Vorher: Freigabe für Cron und ersten Lauf.

**2.1 Skripte und Ordner**

    # Skripte aus einem geprüften Commit (Archiv oder Checkout), nicht von Hand abgetippt
    mkdir -p -m 700 ~/centric-sicherung ~/sicherung
    cp -r <checkout>/deploy/sicherung/. ~/centric-sicherung/

**2.2 restic installieren** (ohne sudo, gepinnt, Prüfsumme prüfen — dieselbe Version wie in CI):

    mkdir -p ~/.local/bin && cd /tmp
    curl -fsSLO https://github.com/restic/restic/releases/download/v0.18.1/restic_0.18.1_linux_amd64.bz2
    echo "680838f19d67151adba227e1570cdd8af12c19cf1735783ed1ba928bc41f363d  restic_0.18.1_linux_amd64.bz2" | sha256sum -c -
    bunzip2 -c restic_0.18.1_linux_amd64.bz2 > ~/.local/bin/restic && chmod 755 ~/.local/bin/restic
    ~/.local/bin/restic version

Außerdem nötig (auf Ubuntu vorhanden): `docker` (admin in der Gruppe docker), `curl`, `flock`, `timeout`, `realpath`.

**2.3 [ENTSCHEIDUNG 1] Speicherziel anlegen** — Zugangsdaten legst du selbst an.

*Hetzner Storage Box (sftp):* SSH aktivieren, eigener Schlüssel nur für die Sicherung:

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

*S3-kompatibel (EU):* eigener Bucket, Schlüssel nur für diesen Bucket; `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in die Konfigurationsdatei (Modus 600), `RESTIC_REPOSITORY=s3:https://<endpunkt>/<bucket>/centric-restic`. Empfehlung: Object Lock/Versionierung (siehe Grenzen).

Zuerst ein **Test**-Repository (eigener Pfad, z. B. `/./centric-restic-test`), erst danach das produktive.

**2.4 [ENTSCHEIDUNG 2] restic-Passwort erzeugen und verwahren**

    mkdir -p -m 700 ~/.config/centric-sicherung
    ( umask 077; openssl rand -base64 36 > ~/.config/centric-sicherung/restic-passwort )

Sofort in den Passwortmanager übertragen und zusätzlich auf Papier, versiegelt, außerhalb von Büro und Server. **Ohne das Passwort ist jede Sicherung wertlos — es lässt sich nicht wiederherstellen.** Nicht teilen, nicht in Chats, nicht ins Repository.

Ebenfalls in den Passwortmanager, getrennt von den Sicherungen: `CENTRIC_PFEFFER` (BEREITSTELLUNG 5.4) und die Zugangsdaten des Speicherziels. Im Ernstfall braucht man alle drei: **Passwort + Pfeffer + Zugang zum Speicherziel.**

**2.5 Konfiguration**

    cp ~/centric-sicherung/env.beispiel ~/.config/centric-sicherung/env
    chmod 600 ~/.config/centric-sicherung/env
    # eintragen: CENTRIC_PROD_IMAGE (Digest!), RESTIC_REPOSITORY, ALARM_PING_URL …
    docker inspect --format '{{index .RepoDigests 0}}' \
      "$(cd /opt/apps/centric-dienstplanung && docker compose images -q centric-dp-web)"

`CENTRIC_PROD_IMAGE` muss bei **jeder Auslieferung** nachgezogen werden (gleicher Digest wie der Dienst).

**2.6 Repository anlegen** (einmalig):

    export RESTIC_REPOSITORY=…  RESTIC_PASSWORD_FILE=~/.config/centric-sicherung/restic-passwort
    ~/.local/bin/restic init

**2.7 [ENTSCHEIDUNG 3] Alarm** — zwei Checks beim Totmannschalter:
- `centric-sicherung`: Periode 1 Tag, Kulanz 2–3 h → `ALARM_PING_URL`,
- `centric-probe`: Periode ~31 Tage, Kulanz 1 Tag → `PROBE_PING_URL`.
Benachrichtigung per Mail/Push an dich. Die Skripte rufen `<URL>/start`, `<URL>` (Erfolg, kurze Zusammenfassung im Rumpf) und `<URL>/fail`.

**2.8 Probelauf, Probe, Fehlalarm-Probe** (mit Freigabe, zuerst gegen das Test-Repository):

    ~/centric-sicherung/sicherung-ausser-haus.sh && cat ~/sicherung/status.json
    ~/centric-sicherung/wiederherstellung-probe.sh && cat ~/sicherung/probe-status.json
    # Fehlalarm: Kopie der Konfiguration mit falscher Passwortdatei (Modus 600)
    ~/centric-sicherung/sicherung-ausser-haus.sh ~/.config/centric-sicherung/env.fehlalarm   # Exit ≠ 0, Alarm muss ankommen

Erwartet bei der Probe: `Manifest-Abgleich: N gleich, 0 abweichend, 0 fehlend, 0 überzählig` und `Bestände lesbar: X von X`.

**2.9 Cron** (`crontab -e`, Vorlage `deploy/sicherung/crontab.beispiel`): täglich 02:30 UTC Sicherung, am 3. jedes Monats 04:15 UTC Probe. Vorher `mkdir -p -m 700 ~/sicherung` (für `cron.log`) und Systemzeit prüfen (`timedatectl`). `cron.log` kürzen die Skripte selbst auf die letzten 5000 Zeilen, sobald es 1 MiB übersteigt.

## 3. Alarm erhalten — was tun

1. **Wo steht es?** `cat ~/sicherung/status.json` (bzw. `probe-status.json`): Feld `schritt` nennt die Stelle, `zeit` den Lauf. Das Log dazu: `ls -t ~/sicherung/log/ | head` und die neueste Datei lesen (enthält keine Geheimnisse). Kam gar kein Ping (Totmannschalter meldet Ausbleiben): `~/sicherung/cron.log`, `crontab -l`, ob ein Lauf hängt (`ps -ef | grep -E 'restic|ablage-sicherung'`).
2. **Typische Ursachen nach `schritt`:**

| schritt | häufige Ursache | Abhilfe |
|---|---|---|
| `konfiguration` | Modus der Env-/Passwortdatei ≠ 600, Tippfehler, Ordner im Datenpfad | Meldung im cron.log/Log; korrigieren |
| `repository-zugang` | Ziel nicht erreichbar (Netz, Storage Box, Zugangsdaten), falsches Passwort (restic Exit 12), **verwaiste restic-Sperre** nach Abbruch | Erreichbarkeit prüfen (`ssh centric-storagebox ls`); bei „repository is already locked“: erst sicherstellen, dass **kein** restic-Prozess mehr läuft (`ps`), dann `restic list locks` und `restic unlock` — nie während ein Lauf aktiv ist |
| `sichern` | **veralteter Bild-Digest** (Bild per `docker image prune` entfernt oder nach Auslieferung nicht nachgezogen), Ablage änderte sich dreimal während des Kopierens, unbekannter Store | Digest in der Konfiguration aktualisieren (2.5); bei Änderungen: erneut starten, notfalls Dienst kurz anhalten |
| `plausibilitaet` | falscher `CENTRIC_DATEN_PFAD`, Datenverlust, **oder** gewollte große Löschung | Daten prüfen! Ist der Rückgang gewollt: `~/sicherung/letzte-erfolgreiche.json` entfernen und von Hand sichern |
| `pruefen` | Platte/Dateisystem, beschädigte lokale Kopie | Plattenzustand prüfen, erneut sichern |
| `restic-backup`, `restic-forget`, `restic-check` | Netz, Speicher voll, Sperre (s. o.), Fehler im Repository | Log lesen; bei `check`-Fehlern **nicht** `prune`/`forget` erzwingen, sondern `restic check --read-data` und Rücksprache |
| Exit 124 / „ZEITÜBERSCHREITUNG“ | Ziel sehr langsam, hängende Verbindung | Ursache klären; Grenzen (`ZEITGRENZE_*`) nur bewusst erhöhen |
| Probe: `wiederherstellen` | Pfeffer in `.env` passt nicht zur Sicherung | **Ernst nehmen**: Pfeffer gegen den Passwortmanager prüfen |
| Probe: `probe-container`, `bestaende-lesen` | Bild passt nicht zu den Daten, Lesefehler | Log (enthält die letzten Container-Zeilen) |

3. Nach der Behebung von Hand einen Lauf starten und `status.json` prüfen; der Totmannschalter wird mit dem Erfolgs-Ping wieder grün.

## 4. Ernstfall: Wiederherstellung

Ausgangslage: Daten verloren/beschädigt oder neuer Server. Benötigt: restic-Passwort, Zugang zum Speicherziel, `CENTRIC_PFEFFER`, das Bild (Digest steht im Snapshot-Tag `bild=…`).

1. **R0 – Anhalten.** `cd /opt/apps/centric-dienstplanung && docker compose stop -t 30` (kein Leck, kein Weiterschreiben auf einen kaputten Stand). Sicherungs-Cron auskommentieren.
2. **Snapshot wählen:**

        export RESTIC_REPOSITORY=…  RESTIC_PASSWORD_FILE=~/.config/centric-sicherung/restic-passwort
        restic snapshots --host centric --tag centric          # Zeit, Tags datum=…, bild=…

3. **Erst proben, dann zurückspielen:** `~/centric-sicherung/wiederherstellung-probe.sh --snapshot <ID>`. Sie prüft den Snapshot vollständig, gleicht ab, prüft den Pfeffer und startet ihn testweise ohne Netz — ohne `data/` anzufassen. Nur bei „bestanden“ weiter; sonst einen älteren Snapshot proben.
4. **Holen und prüfen:**

        mkdir -m 700 ~/notfall && restic restore <ID> --target ~/notfall
        S=$(dirname "$(find ~/notfall -name FERTIG -path '*/centric-sicherung-*')")

5. **Wiederherstellen** — Weg 1 aus BEREITSTELLUNG 5.4 (altes `data/` beiseite, neues leeres `data/`, Werkzeug `wiederherstellen` mit `--env-file`, das nur den Pfeffer enthält, Container neu erzeugen mit `--pull never`). Ohne sudo: `mkdir -m 700 data` als `admin` (uid 1000 = node).
6. **Start und Kontrolle.** `docker compose up -d --pull never`, `docker compose ps` (healthy), anmelden, Betrieb öffnen, Stichproben. Alle müssen sich neu anmelden (Klasse C fehlt bewusst); seit der Sicherung Geschehenes (auch Zugangsentzüge, Passwortänderungen) ist zurückgenommen und muss erneut ausgeführt werden.
7. **Danach:** `~/notfall` und `data.vor-wiederherstellung-…` erst nach Bestätigung entfernen (Personaldaten), Cron wieder aktivieren, `CENTRIC_PROD_IMAGE` prüfen, eine Sicherung von Hand anstoßen.

**Bild beschaffen, wenn der VPS verloren ist.** Das Bild liegt in GHCR: `docker pull ghcr.io/rinats-png/dienstplaner@sha256:<digest aus dem Tag bild=…>` (vorher `docker login ghcr.io` mit einem Token, das Pakete lesen darf). Ist der Digest dort nicht mehr verfügbar: aus dem Commit des Releases neu bauen (`docker build` wie im Dockerfile beschrieben, gleiche `VITE_*`-Werte) — das Werkzeug `ablage-sicherung.mjs` muss dieselbe Formatfassung haben (`FORMAT = 1`). Danach der neue Server: Docker und Compose wie in BEREITSTELLUNG, `.env` mit **demselben** Pfeffer aus dem Passwortmanager, 2.2/2.3 (neuer Schlüssel), dann Schritte 2–6.

## 5. Grenzen (ehrlich)

- **Löschschutz:** Der VPS hat Schreibzugriff auf das Repository (für `forget --prune`). Ein Angreifer mit `admin`-Rechten könnte die Sicherungen löschen. Abhilfe (deine Entscheidung): Storage Box mit Snapshots/Unterkonto ohne Löschrecht, S3 mit Object Lock, oder `rest-server --append-only` und Prune von einem zweiten Rechner.
- **Lokale Kopien:** die letzten 2 Sicherungen liegen **unverschlüsselt** unter `~/sicherung/lokal` auf derselben Platte wie die Daten (Modus 700, nur `admin`). Sie schützen nicht gegen Plattenverlust und sind für jeden mit `admin`-Zugriff lesbar — wie die Daten selbst.
- **RPO 24 h:** Täglich eine Sicherung; was dazwischen geschieht, ist im Ernstfall verloren.
- **Konsistenz:** Der Server läuft während der Sicherung; das Werkzeug erkennt Änderungen (Nachvergleich, drei Versuche) und bricht sonst ab → Fail-Ping. Mit WP-02 (Raumsperre) seltener.
- **Schwund-Prüfung:** erkennt einen großen Rückgang der Dateizahl, nicht inhaltliche Beschädigung bei gleicher Dateizahl. Eine gewollte große Löschung löst einmal Alarm aus (siehe Abschnitt 3).
- **`restic check` liest täglich nur 5 %** der Daten (zufällig, über ~20 Tage etwa alles, ohne Garantie). Die monatliche Probe liest den neuesten Snapshot vollständig.
- **Probe prüft Lesbarkeit, nicht Fachlichkeit:** Bestände setzen sich zusammen, der Server wird healthy; eine Anmeldung prüft sie nicht (kein Netz, keine Zugangsdaten).
- **Pfeffer und Passwort liegen auf dem VPS** (in `.env` bzw. der Passwortdatei). Wer den VPS übernimmt, hat beides. Die Sicherung schützt gegen Verlust und gegen das Speicherziel, nicht gegen einen kompromittierten VPS. Im laufenden Sicherungs-Container steht der Pfeffer zwangsläufig in dessen Umgebung (`docker inspect`), nur dieser Wert.
- **Aufbewahrung** greift nur auf Snapshots mit Host-Kennung `centric` und Tag `centric`; `RESTIC_HOST` nie ändern. Der älteste Snapshot bleibt, solange eine Regel freie Plätze hat (restic ≥ 0.17). Snapshot-Pfade sind absolut (`…/sicherung/lokal/centric-sicherung-<UTC>`); die Probe sucht die Sicherung über `FERTIG`.
- **Bild-Digest:** muss nach jeder Auslieferung nachgezogen werden (2.5); ein entferntes Bild lässt den Lauf laut scheitern (Fail-Ping), nicht still.
- **Zeitzone:** Cron in Systemzeit; die Skripte arbeiten in UTC.

## 6. Nachweis

CI (`betrieb-sicherung.yml`, `deploy/sicherung/ci/ende-zu-ende.sh`) mit echtem Bild, Testdaten über die Anwendungsschicht und lokalem restic-Repository — Einzelheiten und Kennzahlen: [acc45/wp04-nachweis.md](acc45/wp04-nachweis.md).

Offen und nicht Teil dieses Pakets: Ausdünnen der In-App-Sicherungen und der Spur (F-26, `server/lib/daten.mjs`, anderer Agent).
