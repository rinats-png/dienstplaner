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

## 4a. Unlesbare Datei (ein Raum antwortet nur noch mit 503)

**Woran man es erkennt:** Für einen Raum antworten Anzeige, Speichern, Stempeln und auch das Wiederherstellen in der
App mit 503 („Der gespeicherte Stand ist gerade nicht vollständig lesbar“, Code `BESTAND_UNLESBAR`). Im
Serverprotokoll steht, welche Datei betroffen ist (`Kern`, `Scherbe …`, `Schreibjournal`, `Vermerk …`). Die nächtliche
Sicherung bricht dann ebenfalls ab (`… ist kein gültiger JSON-Umschlag`) — gewollt, damit niemand eine kaputte Ablage
für gesichert hält.

Das ist Absicht. Ein Bestand mit Lücke würde beim nächsten Speichern den fehlenden Monat löschen (WP-45, H1). Andere
Räume arbeiten normal weiter.

**Das Werkzeug läuft im Bild des Dienstes.** Auf dem VPS gibt es kein Node; `ablage-pruefen.mjs` und
`journal-pruefen.mjs` liegen unter `/app/werkzeug/` im Bild (Dockerfile). Aufruf immer so — im Verzeichnis
`/opt/apps/centric-dienstplanung`, mit **demselben Bild wie der Dienst** (`docker compose images`; bei Auslieferung
per Digest genau dieser Digest):

    W() { docker run --rm --network none --read-only --cap-drop ALL \
            --security-opt no-new-privileges:true --user 1000:1000 \
            -v "$PWD/data:/data" "$@"; }
    BILD=ghcr.io/rinats-png/dienstplaner@sha256:<digest des Dienstes>

    W "$BILD" node /app/werkzeug/ablage-pruefen.mjs [raum]

- **Nie als root** (`--user 1000:1000` nie weglassen, kein `sudo node …` auf dem Host). Das Werkzeug legt Dateien mit
  Modus 0600 an; als root angelegt, gehörten sie root, der Dienst (uid 1000) könnte sie nicht lesen — und der Raum
  antwortete wieder mit 503.
- `--network none`: Das Werkzeug braucht kein Netz und kann nichts senden. `/data` ist wie beim Dienst `./data`.
- **„Ablage … ist belegt“ direkt nach `docker compose stop`:** Hat der Dienst seine Sperre `data/.prozess` nicht selbst
  freigegeben (harter Abbruch), sieht das Werkzeug die Sperre eines anderen Rechnernamens (jeder Container hat seinen
  eigenen) und bleibt draußen, solange sie jünger als **45 Sekunden** ist. Dann 45 Sekunden warten und erneut
  aufrufen. Läuft der Dienst in Wahrheit noch, bleibt es bei „belegt“ — dann erst R0. Die Sperre nie von Hand löschen.
- Solange das Werkzeug arbeitet, frischt es die Sperre auf (Puls wie der Server). Ein versehentlich gestarteter
  Dienst sieht das und verweigert den Start.

**Ablauf**

1. **R0 – Anhalten:** `docker compose stop -t 30`.
2. **Prüfen (Trockenlauf, ändert nichts):** `W "$BILD" node /app/werkzeug/ablage-pruefen.mjs [raum]`

   Ohne Raumangabe werden alle Räume geprüft. Gemeldet wird je Raum:
   - jede **unlesbare** Datei: Kern, Altbestand, Scherbe (= ein Monat), Standvermerk, Standzeiger, Journal;
   - jede **fehlende** Datei: ein Kern, wenn es Scherben oder Vermerke des Raums gibt; der Vermerk des aktuellen
     Stands; und jede Scherbe, die der **Bezugsvermerk** nennt, die aber nicht da ist. Bezug ist bei einem gültigen
     Journal dessen Vermerk, sonst der jüngste *lesbare* Vermerk bis zum aktuellen Stand — auf der Platte oder, mit
     `--aus-sicherung`, in der Sicherung. Ein unlesbarer Kern, Zeiger oder aktueller Vermerk verhindert den Abgleich
     also nicht.
   - **„kein vollständiger Abgleich“:** Ist kein Vermerk lesbar, oder nur einer, der älter ist als der aktuelle Stand,
     wären Monate, die danach angelegt wurden, nicht erkennbar. Dann wird der Raum nicht angeglichen (Rückgabe 1).
     Abhilfe: eine Sicherung, die den aktuellen Vermerk enthält (`--aus-sicherung`), oder ausdrücklich
     `--ohne-vermerk <raum>` (Spur `beiseite:<raum>:<zeit>:stand:<raum>:ohne-abgleich` in der Ablage) — dann bleibt ein
     fehlender Monat unerkannt; die Leitung muss den Raum fachlich prüfen. Ein älterer Bezugsvermerk kann eine Scherbe
     nennen, die seitdem bewusst entfernt wurde; sie wird trotzdem als fehlend gemeldet (lieber einmal zu viel).
     Die Scherbenliste der Sicherung selbst ist kein Bezug: Sie enthielte auch Monate, die seit der Sicherung bewusst
     entfernt wurden, und holte sie zurück.
   - darunter jede **andere Datei** der Ablage, an der die nächtliche Sicherung scheitern würde (unten, „Andere
     Dateien“).

   Rückgabe 1 heißt „Unlesbares oder Fehlendes gefunden“, 2 „Fehler“ (Ablage belegt, Sicherung kaputt, Abbruch).

   **Fehlt der Kern oder fehlen Scherben, zuerst klären, ob der Raum gelöscht werden sollte.** Die Raumlöschung
   (`server/lib/raumloeschung.mjs`) entfernt Journal, Scherben, Vermerke und App-Sicherungen zuerst und den Kern erst
   danach. Eine abgebrochene Löschung sieht deshalb genauso aus wie ein Schaden: Scherben „fehlen“, oder der Kern fehlt
   neben übriggebliebenen Vermerken. Sollte der Raum weg, nicht zurückholen, sondern die Löschung in der App wiederholen.

   **Ein Raum wird nur ganz oder gar nicht bearbeitet.** Bliebe nach dem Plan des Werkzeugs auch nur eine Datei des
   Raums offen (nicht in der Sicherung, Kern ohne `--kern-zurueck`, fehlende Scherbe ohne `--fehlende-hinnehmen`),
   fasst es im Raum nichts an und meldet „Raum NICHT angefasst“ (Rückgabe 1). Sonst rechnete der nächste
   Schreibvorgang — das Angleichen ebenso wie der Wiederanlauf des Servers — den Vermerk ohne die offene Scherbe neu,
   und kein späterer Befund fände sie mehr. Die Schalter dürfen deshalb kombiniert werden, damit sich ein Raum in einem
   Lauf vollständig lösen lässt.
3. **Aus der Sicherung zurückholen (erste Wahl für Scherben):** die jüngste *vollständige* Sicherung vor dem Schaden
   holen (wie in §4, Schritte 2–4: proben, `restic restore` nach `~/notfall`), dann zusätzlich einbinden:

        W -v "$S:/s/sicherung:ro" "$BILD" node /app/werkzeug/ablage-pruefen.mjs --aus-sicherung /s/sicherung [raum]

   Die Sicherung wird vorher ganz geprüft (FERTIG, Manifest, Prüfsumme jeder Datei); stimmt etwas nicht, wird nichts
   angefasst.
   - **Scherben** (auch fehlende) werden byte-gleich zurückgeholt. Reihenfolge je Datei: Rückholung daneben schreiben
     und auf die Platte zwingen, die kaputte Datei als Kopie `beiseite:<raum>:<zeit>:<schlüssel>` ablegen, dann
     umbenennen und noch einmal vergleichen. Ein Abbruch (Strg-C, voller Datenträger, Stromausfall) an jeder Stelle
     lässt die alte Datei liegen; der Trockenlauf meldet sie weiter, ein zweiter Lauf macht weiter.
   - **Schreibjournal, Standvermerke und Standzeiger kommen nie aus der Sicherung.** Ein Journal ist der
     Festschreibepunkt eines Schreibvorgangs: Zurückgeholt, legte der nächste Zugriff es über Kern und Scherben, und
     alte Daten überschrieben neuere — ohne dass es jemand merkt. Vermerke und Zeiger sind aus Kern und Scherben
     abgeleitet; ein alter Vermerk verfälschte jeden späteren Abgleich. Das Werkzeug legt sie beiseite und lässt sie
     neu berechnen.
   - **Kern nur mit `--kern-zurueck`** (unten, „Kern aus der Sicherung“). Ohne dieses Flag bleibt er, und das Werkzeug
     nennt die Folgen.
   - **Nach einer vollständigen Wiederherstellung (§4)** beginnen die Standnummern wieder beim Stand der damals
     benutzten Sicherung. Sicherungen, die *nach* dieser, aber *vor* der Wiederherstellung entstanden, gehören zu
     einer verworfenen Folge: gleiche Nummer, anderer Inhalt. Für `--aus-sicherung` deshalb nur die damals benutzte,
     ältere oder nach der Wiederherstellung entstandene Sicherungen verwenden. `ablage-sicherung.mjs wiederherstellen`
     schreibt dafür `data/.wiederhergestellt.json` fort — eine Liste aller Wiederherstellungen (Zeitpunkt und
     Erstellzeit der benutzten Sicherung; nicht in der Sicherung, für die Anwendung unsichtbar).
     `ablage-pruefen.mjs` lehnt eine Sicherung ab, die in die verworfene Folge *irgendeiner* dieser
     Wiederherstellungen fällt (Rückgabe 2, nichts verändert). Ist die Datei vorhanden, aber unlesbar, brechen
     beide Werkzeuge ab (Rückgabe 2) — die Standfolge ist dann nicht prüfbar; Datei sichten, nicht still löschen.
     **Ausweg bei beschädigter Datei** (gilt für `ablage-pruefen` und für beide Wege der Wiederherstellung — auch
     `--ersetzen` lässt Punktdateien im Ziel stehen): bei gestopptem Dienst umbenennen,
     `sudo mv data/.wiederhergestellt.json "data/.wiederhergestellt.kaputt-$(date -u +%Y%m%dT%H%M%SZ)"`; noch
     lesbare Einträge möglichst von Hand in eine neue Datei übertragen
     (`{"wiederherstellungen":[{"zeit":"…","sicherungErstellt":"…"}]}`, Besitz 1000:1000, Modus 600). Geht das
     nicht, prüft das Werkzeug die Standfolge nicht mehr; dann gilt ohne Werkzeugprüfung die Regel „für
     `--aus-sicherung` nur Sicherungen nach der letzten Wiederherstellung verwenden“. Danach wiederherstellen bzw.
     `ablage-pruefen` erneut aufrufen.
     **Bei Weg 1 (neues, leeres `data/`)** die Datei vor dem Wiederherstellen aus dem beiseitegelegten Verzeichnis
     übernehmen, sonst gehen die früheren Einträge verloren:
     `cp -p data.vor-wiederherstellung-<Zeit>/.wiederhergestellt.json data/` (falls vorhanden; Punktdateien
     stören die Prüfung „Ziel leer“ nicht). Wiederherstellungen vor dieser Fassung haben keinen Vermerk — dann gilt
     die Regel ohne Prüfung durch das Werkzeug.
   - **Bezug unvollständig:** Liegt auf der Platte eine Scherbe, die der jüngste lesbare Vermerk nicht kennt (z. B.
     nach Kern- und Vermerkschaden mit gelöschtem Zeiger), ist er älter als das, was geschrieben wurde. Dann wird
     nicht angeglichen (Rückgabe 1), bis eine passende Sicherung oder `--ohne-vermerk <raum>` vorliegt.
   - **Wirkung:** Für den zurückgeholten Monat gilt der Stand der Sicherung; was seitdem in diesem Monat eingetragen
     wurde, fehlt.
4. **Sonst beiseitelegen:** wenn die Datei in keiner Sicherung liegt. Zusammen mit `--aus-sicherung` wird
   zurückgeholt, was in der Sicherung liegt, und nur der Rest beiseitegelegt.

        W "$BILD" node /app/werkzeug/ablage-pruefen.mjs --beiseitelegen [raum]

   Die Rohbytes wandern unverändert in einen Eintrag `beiseite:…`; gelöscht wird nichts.
   - **Scherbe (unlesbar):** **Dieser Monat gilt danach als leer** (Plan-Abweichungen, Ist-Zeiten, Stempel des
     Monats).
   - **Scherbe (fehlend):** `--beiseitelegen` nimmt sie **nie** hin. Ist sie in keiner Sicherung, nur ausdrücklich je
     Raum und Monat — der Raum ist Pflicht:

         W "$BILD" node /app/werkzeug/ablage-pruefen.mjs --fehlende-hinnehmen <raum>:<monat>   # oder <raum>:<betrieb>:<monat>

     Der Monat gilt dann als leer. In der Ablage bleibt eine Spur `beiseite:<raum>:<zeit>:<schlüssel>` mit
     `fehlte: true`, wer (`durch`) und wann (`zeit`).
   - **Vermerk, Zeiger, Journal:** werden neu berechnet. **Ein beiseitegelegtes Journal eines abgebrochenen
     Schreibvorgangs:** Dessen Zieldateien können teils schon geschrieben sein. Beim Angleichen (unten) wird dieser
     Zwischenstand als neuer Stand **festgeschrieben** — ein Eintrag, der von einem Monat in einen anderen wanderte,
     kann in beiden oder in keinem stehen. Den Raum danach fachlich prüfen lassen; im Zweifel stattdessen die
     vollständige Wiederherstellung (§4).
   - **Kern:** Einen unlesbaren Kern legt das Werkzeug **nicht** beiseite. Ohne Kern gäbe es den Raum nicht mehr, und
     eine neue Anlage könnte ihn überschreiben. Hier hilft nur Schritt 3 mit `--kern-zurueck` oder die vollständige
     Wiederherstellung (§4).

   **Stand angleichen:** Nach jeder Änderung an einem Raum (Schritt 3 oder 4) schreibt das Werkzeug dessen Stand
   einmal auf dem gewöhnlichen Weg neu (mit Journal) — **nur**, wenn ein nach allen Änderungen frisch erhobener
   Befund des Raums leer ist und der Abgleich gegen einen lesbaren Vermerk stattgefunden hat (ausgenommen nur der
   fehlende aktuelle Vermerk, den das Angleichen schreibt, und mit `--ohne-vermerk` der fehlende Abgleich). Sonst
   meldet es „Stand NICHT angeglichen“ mit dem, was offen ist (Rückgabe 1). Kern, Vermerk und Zeiger passen dann wieder zu dem, was auf der
   Platte liegt, und die Standnummer zählt weiter: Wer den Raum noch mit einem alten Stand im Browser offen hat,
   bekommt beim Speichern einen Abgleich, statt einen zurückgeholten oder geleerten Monat still zu überschreiben.
5. **Erneut prüfen** (Schritt 2, Rückgabe 0), dann `docker compose up -d --pull never`, anmelden, den Raum öffnen.
6. **Leitung informieren:** welcher Raum, welcher Monat, ob aus der Sicherung (Stand vom …) oder beiseitegelegt
   (Monat leer). Die Leitung prüft den Monat fachlich, trägt Fehlendes nach und bestätigt Ist-Zeiten erneut. Nach einer
   Kern-Rückholung zusätzlich der Text unten.
7. **Eine Sicherung von Hand anstoßen.** Sie muss wieder durchlaufen (Totmannschalter grün). Die `beiseite:`-Einträge
   werden mitgesichert und mit dem Raum gelöscht. Nach Abschluss der Klärung können sie beim Löschen des Raums oder im
   Rahmen der Aufbewahrung verschwinden.

**Kern aus der Sicherung (`--kern-zurueck`).** Der Kern trägt **alle nicht-monatlichen Daten** des Raums: Personen,
Dienstarten, Einheiten, Einstellungen, Zugänge im Betrieb. Wird er aus der Sicherung zurückgeholt, fällt all das auf
den Stand der Sicherung zurück — die Monate (Scherben) aber bleiben auf dem jetzigen Stand. Neuere Monate können dann
auf Personen oder Dienstarten verweisen, die es im Kern nicht mehr gibt (etwa eine nach der Sicherung eingestellte
Person mit Einträgen im laufenden Monat). Deshalb verlangt das Werkzeug das Flag ausdrücklich und gibt die Folgen aus.
Für einen unzerlegten Altbestand (`bestand:<raum>`) gilt dasselbe. Wer das nicht will, nimmt die vollständige
Wiederherstellung (§4) — dann ist alles auf einem Stand, auch die Monate.

*Text für die Leitung nach einer Kern-Rückholung:* „Für den Raum … wurden Personen, Dienstarten, Einheiten und
Einstellungen auf den Stand vom … (Sicherung) zurückgesetzt. Bitte prüfen: Wer wurde seitdem neu angelegt, geändert
oder entfernt? Gibt es Einträge im Plan, die auf eine Person oder Dienstart verweisen, die jetzt fehlt? Fehlendes bitte
neu anlegen. Monatsdaten (Plan, Ist-Zeiten, Stempel) sind nicht zurückgesetzt.“

**Andere Dateien, an denen die Sicherung scheitert.** Das Werkzeug meldet unter „Ablage: … weitere Datei(en)“ jede
Datei außerhalb der Bestände, die die nächtliche Sicherung abbrechen ließe: kein gültiger Umschlag, nicht lesbar
(Dateirechte), fremde Datei oder unerwartetes Verzeichnis in `data/`. Es **fasst sie nicht an** (Rückgabe 1). Je Art:

| Art (Schlüssel/Ort) | Wirkung, wenn sie fehlt | Vorgehen |
|---|---|---|
| App-Sicherung `centric/sicherung:<raum>:…` | Ein Wiederherstellungspunkt in der App fehlt; der Raum selbst ist nicht betroffen. | In Quarantäne verschieben (unten). |
| Konto, Passwort, Mitgliedschaft, Zugangscode, Token (`centric/konto:…`, `pw:…`, `az:…`, `t:…`, `ta:…` u. ä.) | Betroffene können sich nicht anmelden bzw. der Code gilt nicht. | In Quarantäne verschieben; Zugang oder Code in der App neu vergeben bzw. Passwort zurücksetzen. **Nicht** aus einer alten Sicherung zurückholen — das könnte widerrufene Zugänge oder alte Passwörter wiederbeleben. |
| Sitzung `centric-sitzungen/sk:…` | Die Person muss sich neu anmelden. | In Quarantäne verschieben. |
| Protokoll `centric-spur/…` | Lücke im Protokoll. | In Quarantäne verschieben, Lücke im Betriebsprotokoll vermerken. |
| Kalender, Zustellung, Push (`feed:…`, `zustellung:…`, `push:…`) | Wird bei Bedarf neu erzeugt bzw. neu abonniert. | In Quarantäne verschieben. |
| Fremde Datei oder Verzeichnis in `data/` | — | Herkunft klären; in Quarantäne verschieben. |
| Nicht lesbar wegen Dateirechten (`EACCES`) | — | Meist ein Aufruf als root. Besitz zurückgeben: `sudo chown 1000:1000 <datei> && sudo chmod 600 <datei>`, dann erneut prüfen. |

*Quarantäne:* bei gestopptem Dienst neben `data/` einen Ordner `install -d -m 700 quarantaene-$(date -u
+%Y%m%dT%H%M%SZ)` anlegen und die Datei mit `mv` dorthin verschieben. Nichts löschen; den Ordner nach der Klärung wie
eine Sicherung behandeln (er enthält Personaldaten). Danach Schritt 2 (Rückgabe 0) und Schritt 7.

**Warum das Wiederherstellen in der App eine unlesbare Scherbe nicht übergeht:** Das Wiederherstellen ersetzt nur den
*eigenen* Betrieb. Den Rest des Raums übernimmt es aus dem jetzigen Stand, also auch andere Betriebe desselben Raums.
Würde es dabei eine unlesbare Scherbe übergehen, schriebe es den Raum ohne diesen Monat zurück. Trifft es einen
anderen Betrieb, wäre dessen Monat gelöscht, ohne dass jemand es merkt. Außerdem wäre die automatische Sicherung vor
dem Wiederherstellen unvollständig. Deshalb bleibt es bei 503, und der Rückweg ist dieses Werkzeug.

`journal-pruefen.mjs` (nur Journale) wird genauso aufgerufen: `W "$BILD" node /app/werkzeug/journal-pruefen.mjs
[--beiseitelegen] [raum]`. `ablage-pruefen.mjs` deckt Journale mit ab.

## 5. Grenzen (ehrlich)

- **Löschschutz:** Der VPS hat Schreibzugriff auf das Repository (für `forget --prune`). Ein Angreifer mit `admin`-Rechten könnte die Sicherungen löschen. Abhilfe (deine Entscheidung): Storage Box mit Snapshots/Unterkonto ohne Löschrecht, S3 mit Object Lock, oder `rest-server --append-only` und Prune von einem zweiten Rechner.
- **Lokale Kopien:** die letzten 2 Sicherungen liegen **unverschlüsselt** unter `~/sicherung/lokal` auf derselben Platte wie die Daten (Modus 700, nur `admin`). Sie schützen nicht gegen Plattenverlust und sind für jeden mit `admin`-Zugriff lesbar — wie die Daten selbst.
- **RPO 24 h:** Täglich eine Sicherung; was dazwischen geschieht, ist im Ernstfall verloren.
- **Konsistenz:** Der Server läuft während der Sicherung; das Werkzeug erkennt Änderungen (Nachvergleich) und kopiert geänderte Dateien in bis zu zwölf Runden je Versuch nach (drei Versuche); sonst bricht es ab (Rückgabe 3, nichts angelegt) → Fail-Ping. Eine Sicherung gilt erst, wenn ein vollständiger Durchlauf jede Kopie unverändert bestätigt. Bei dauerhaft hoher Schreibrate (Größenordnung ≥ 15 Schreibvorgänge/s bei einigen Tausend Dateien) gelingt das nicht zuverlässig: dann in einem ruhigen Fenster sichern oder den Server vorher stoppen (WP-28b/2, `docs/acc45/wp28b2-nachweis.md`). Mit WP-02 (Raumsperre) seltener.
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
