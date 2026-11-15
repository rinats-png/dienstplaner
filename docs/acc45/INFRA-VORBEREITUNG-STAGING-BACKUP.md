# Infrastruktur-Vorbereitung: Staging-VM, Sicherung und Wiederherstellung

Stand 2026-11-15, Basis `integration/release-v4` @ `19f3ac8b` (enthält #313 BE-3 und #299 Staging O2).
Auftrag: Betreiber, Vorbereitung der offenen Betreiberaufgaben für Staging, Backup und Wiederherstellung, zunächst nur lesend.

**Art dieses Dokuments:** Vorbereitung im Repository. **Nichts wurde ausgeführt:** keine VM bestellt, keine Verbindung zu einem
VPS, kein DNS, kein Speicherziel, keine Zugangsdaten gelesen, erzeugt oder geändert, keine GitHub-Variable, kein Deployment.
Die Staging-Passwortdatei wurde nicht angefasst. Alle Werte in neuen Vorlagen sind Platzhalter.

Neu in diesem Paket (alles andere ist vorhanden und wird nur verwendet):

| Datei | Zweck |
|---|---|
| `deploy/sicherung/widerrufbuch-probe.sh` | monatliche Wiederherstellungsprobe des Widerrufbuch-Repositorys: `check --read-data`, Rückholung neuester und ältester Snapshot, sha256-Prüfsummen, laufendes Buch vollständig, **Rollback-Gegenprobe** (§5.4) |
| `deploy/sicherung/gemeinsam.sh` | `restic_version_pruefen`, `RETRY_LOCK` aus `widerrufbuch-sicherung.sh` hierher verschoben (gemeinsam für Job und Probe, unverändert) |
| `deploy/sicherung/widerrufbuch.env.beispiel`, `crontab.beispiel`, `README.md` | eigener Check `PROBE_PING_URL`, auskommentierte Cron-Zeile der Probe |
| `deploy/staging-o2/sicherung.env.beispiel`, `deploy/staging-o2/widerrufbuch.env.beispiel` | Konfiguration für die restic-Übung auf der Staging-VM: zwei **lokale** Repositorys, eigene Passwortdateien, nur Staging-Pfade |
| `pruefungen/be3-widerrufbuch-sicherung.test.js` | zwei neue Fälle (Probe bestanden mit Gegenprobe; Probe bei zurückgerolltem Buch Code 3), Versions- und restic-Fehlerfall |
| `pruefungen/staging-o2.test.js` | Vorlagen der Übung: nur bekannte Schlüssel, zwei getrennte lokale Repositorys, keine Produktionspfade; Abschnitte dieses Dokuments |

## 1. Bestand (gelesen)

| Bereich | Vorhanden | Ort |
|---|---|---|
| Produktion Compose | Anwendung per `IMAGE_DIGEST`, gehärtet; Status-Mounts für Sicherung **auskommentiert** | `deploy/compose.yml` |
| Deployment, Rücksprung, Abschalten | Digest-Pflicht, Freigabeliste, gesperrte Bilder `f03a8514`, `0861adee`; kein `vorherig` → R0 | `deploy/deploy.sh`, `ruecksprung.sh`, `abschalten.sh`, `digest-pruefen.sh`, `freigabe-lib.sh`, `FREIGEGEBENE-IMAGES.md` |
| Caddy Produktion | Vorlage | `deploy/caddy/Caddyfile.vorlage`, `docs/CADDY-UND-XFF.md` |
| Staging O2 | Compose (App + Caddy, eigenes Netz, nur 80/443), Caddyfile mit IP-Liste und 403, `.env`-Vorlage, `betrieb.sh` (pruefen/sichern/wiederherstellen/merken/zurueck, `--trocken`), Gate-Workflow (aus) | `deploy/staging-o2/`, `.github/workflows/staging-gate.yml`, `STAGING-O2-VORBEREITUNG.md` |
| Sicherung der Ablage (WP-04) | täglich, restic, `forget 7/4/12`, `check 5 %`, Totmannschalter; monatliche Probe mit Manifest-Abgleich (sha256) und Probe-Container ohne Netz | `deploy/sicherung/sicherung-ausser-haus.sh`, `wiederherstellung-probe.sh`, `docs/BETRIEB-SICHERUNG.md` §1–6 |
| Sicherung der Widerrufbücher (BE-3, #313) | stündlich, **eigenes Repository Pflicht** (Job verweigert das der Ablage, Exit 78), `forget --keep-last 200 --keep-daily 90`, Rücksprungerkennung, Nachweis je Lauf; `/gesund` warnt nach 3 h | `widerrufbuch-sicherung.sh`, `widerrufbuch.env.beispiel`, `BETRIEB-SICHERUNG.md` §7, `ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md` |
| Überwachung | `/gesund` mit Prüfungen inkl. Sicherungsalter (26 h) und Widerrufbuch (3 h, nur Warnung); Webhook-Alarm Vorgabe AUS; externer Check nur dokumentiert | `docs/BETRIEB-UEBERWACHUNG.md`, `server/lib/gesund.mjs` |
| CI-Nachweis Sicherung | baut das Bild, **echtes restic 0.18.1**, lokales Repository, fährt die Skripte der Ablage, shellcheck über `deploy/sicherung/*.sh` | `.github/workflows/betrieb-sicherung.yml`, `deploy/sicherung/ci/ende-zu-ende.sh` |
| Bildfrage | Produktion möglicherweise auf gesperrtem Bild; nur lesende Kommandos | `PROD-DIGEST-ABWEICHUNG.md` (P1-5) |
| Aufbewahrung rechtlich | 12 Monatsstände widersprechen der früheren Löschzusage; Optionen A/B/C offen | `docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md` |

## 2. Lokal geprüfte Zugänge (Arbeitsrechner, 2026-11-15, nur Existenz)

| Werkzeug / Zugang | Befund | Folge |
|---|---|---|
| `gh` | angemeldet; Token mit `repo`, `workflow` | technisch könnte er Variablen setzen (`STAGING_GATE_AKTIV`) — bewusst **nicht** benutzt; nur lesen, PR öffnen |
| `ssh` | Client vorhanden (OpenSSH 10.3); **keine** `~/.ssh/config`; Dateien in `~/.ssh` nicht gelesen | kein vorbereiteter Host-Alias für VPS, Staging oder Speicherziel; keine Verbindung versucht |
| `restic` | **nicht installiert** | kein lokaler Trockenlauf mit echtem restic; Ersatz: Stub-Prüfung lokal, echtes restic in CI (`betrieb-sicherung.yml`) und in der Staging-Übung |
| `docker`, `caddy`, `shellcheck`, `actionlint`, `flock` | nicht installiert | `caddy validate`, Compose-Start, shellcheck laufen nicht lokal; shellcheck läuft in CI |
| `node` 24, `bash` 5.3 (Git Bash), `openssl`, `sha256sum`, `curl` | vorhanden | Prüfungen mit Stubs lauffähig |

Ergebnis: Von diesem Rechner ist **keine** Infrastrukturhandlung möglich oder vorgesehen. Alles auf VM, VPS, DNS, Speicherziel
und Alarmdienst braucht den Betreiber (Abschnitt 8 C).

## 3. Voraussetzungen: erfüllt / fehlen wirklich

**Erfüllt (im Repository, geprüft):** Staging-Stack per Digest mit TLS-Caddy und IP-Liste; Betriebsskript mit Rücksprung gegen
die Sperrliste; beide Sicherungsjobs mit getrennten Konfigurationen, Sperren, Statusdateien und Alarmpunkten; Probe der Ablage;
**neu** Probe der Widerrufbücher mit Gegenprobe; Vorlagen für die Staging-Übung; CI mit echtem restic für die Ablage.

**Fehlen wirklich (keine Repository-Arbeit kann sie ersetzen):**

1. Staging-VM, Cloud-Firewall, DNS-Eintrag, SSH-Schlüssel (Betreiber, Kosten).
2. Entscheidung TLS-Ausstellung bei IP-begrenztem Staging (§4.3).
3. Lesezugang der Staging-VM zu GHCR (Token nur `read:packages` oder öffentliches Paket).
4. **Speicherziel(e) außer Haus** für die Produktion, mit **getrennten Zugangsdaten je Repository**, Löschschutz-Entscheidung, Kosten.
5. restic-Passwörter (zwei, verschieden) im Passwortmanager; Totmannschalter-Konto mit **vier** Checks (§5.3).
6. Rechtliche Entscheidung zur Aufbewahrung (12 Monate vs. Löschzusage) **vor** dem ersten produktiven restic-Lauf.
7. Klärung des laufenden Produktionsbilds (P1-5) — sonst ist `CENTRIC_PROD_IMAGE` der Sicherung ungewiss.
8. Nachweis mit **echtem** restic für den BE-3-Job und die neue Probe (B3-8) — Staging-Übung oder CI-Erweiterung (§8 B-1).

## 4. Isolierte Staging-VM — Einrichtungsplan

Grundlage `STAGING-O2-VORBEREITUNG.md` §2–7 (bleibt maßgeblich); hier nur Ergänzungen, Reihenfolge und Risiken.

### 4.1 Isolation (Pflicht)

- **Eigene VM**, nicht die des Produktions-VPS; nicht im privaten Netz der Produktion (bei IONOS kein gemeinsames „Privates
  Netzwerk“ anhängen). Am besten eigener Vertrag/Unterbenutzer; mindestens eigene Firewall-Richtlinie.
- **Eigener SSH-Schlüssel** nur für Staging (`ssh-keygen -t ed25519 -f ~/.ssh/centric-staging`), Alias `centric-staging` mit
  `IdentitiesOnly yes`; nie der Schlüssel des Produktions-VPS; Passwort-Login aus.
- **Eigene Geheimnisse** (Pfeffer, Verwalterschlüssel, restic-Passwörter) werden **auf der VM** erzeugt und nie angezeigt.
- Kein Produktionszugang auf der VM: keine `.env`, kein Speicherziel, keine Ping-URL, kein GHCR-Token mit Schreibrecht,
  kein DNS-API-Schlüssel der Produktion.

### 4.2 Netz und Ports

- **Cloud-Firewall außerhalb der VM** (IONOS Cloud Panel, Firewall-Richtlinie) als erste Linie: 22/tcp nur Betreiberadresse;
  80/443 siehe §4.3; sonst alles zu.
- **Achtung Docker und ufw:** Von Docker veröffentlichte Ports umgehen `ufw` (DNAT vor der INPUT-Kette). Eine `ufw`-Regel auf der VM
  schützt 80/443 **nicht**. Deshalb Firewall beim Anbieter, oder Regeln in der Kette `DOCKER-USER`.
- Anwendung ohne veröffentlichten Port (schon so in `deploy/staging-o2/compose.yml`); nur Caddy auf 80/443.
- IPv6: kein `AAAA`-Eintrag für Staging, solange `STAGING_ERLAUBT` keine IPv6-Bereiche des Betreibers enthält (sonst 403 für
  IPv6-Clients bzw. ungefilterter Pfad, falls die Firewall IPv6 nicht abdeckt).

### 4.3 TLS mit Caddy bei IP-Begrenzung (Entscheidung C-3)

Let's Encrypt prüft über Port 80 (HTTP-01) bzw. 443 (TLS-ALPN-01) **aus dem Internet**. Ist die Cloud-Firewall auf die
Betreiberadressen begrenzt, scheitert Ausstellung und Erneuerung.

| Option | Wie | Risiko | Empfehlung |
|---|---|---|---|
| T1 | Firewall 80/443 offen, Zugriff begrenzt **Caddy** (`remote_ip`, sonst 403, vorhanden) | Caddy ist aus dem Internet erreichbar (nur 403/Weiterleitung, keine Anwendung) | **empfohlen** (einfach, keine Zusatzschlüssel) |
| T2 | DNS-01 mit eigenem Caddy-Bau (DNS-Modul des Anbieters) | DNS-API-Schlüssel auf der Staging-VM; bei IONOS gilt ein API-Schlüssel nach unserem Kenntnisstand für das ganze Konto **[unsicher, Quelle prüfen]** → Staging könnte DNS der Produktion ändern | nur mit auf Staging beschränktem Schlüssel/eigener Zone |
| T3 | Firewall nur zur Ausstellung/Erneuerung öffnen | Erneuerung alle ~60 Tage von Hand, sonst Zertifikat abgelaufen | nicht empfohlen |

Für erste Versuche optional die Test-CA von Let's Encrypt (`acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` im
globalen Block), um Ratenbegrenzungen zu vermeiden; vor der Abnahme (K3) wieder entfernen.

### 4.4 Docker und Bilder per unveränderlichem Digest

1. Docker Engine + Compose-Plugin aus dem offiziellen Paketquell, Benutzer `admin` (uid 1000) in der Gruppe `docker`
   (Hinweis: Gruppe `docker` ist root-gleich; auf der Staging-VM hingenommen). `timedatectl` → UTC.
2. GHCR-Zugang: öffentliches Paket **oder** befristetes Token nur `read:packages`;
   `read -rs TOKEN && printf '%s' "$TOKEN" | docker login ghcr.io -u <benutzer> --password-stdin; unset TOKEN` (keine
   Shell-History), Pull, danach `docker logout ghcr.io`
   (sonst liegt das Token in `~/.docker/config.json`).
3. `docker pull ghcr.io/rinats-png/dienstplaner@sha256:<DIGEST>` und `docker pull caddy@sha256:<CADDY_DIGEST>` —
   **nicht** `docker save | docker load` vom Arbeitsrechner: dabei gehen die RepoDigests verloren und
   `image: …@sha256:` mit `pull_policy: never` findet das Bild nicht.
4. `./betrieb.sh pruefen` → `docker compose config -q` → `docker compose up -d --pull never` → K1/K2 aus
   `STAGING-O2-VORBEREITUNG.md` §7 (Digest und Revisionslabel = Kandidat).
5. Kandidat nie ein gesperrtes Bild; Rücksprungziele nur über `./betrieb.sh merken/zurueck` (Sperrliste, fail-closed).

### 4.5 Testdaten (nur synthetisch)

`./data` und `./zustand` beginnen **leer**. Daten nur über `/einrichten` mit dem Staging-Verwalterschlüssel, die Gate-Proben
(`werkzeug/staging-smoke.mjs`, Räume `ppg-gate-a/-b`) und erfundene Personen. **Nie** eine Sicherung, ein Export oder eine Kopie
der Produktion (auch nicht die Kopie für den Erkennungslauf P1-0) auf die Staging-VM. Mail/Push ohne Anbieter.

### 4.6 Rücksprung und Notstopp

A→B→A mit `./betrieb.sh merken <digest-A>`, Wechsel auf B, `./betrieb.sh zurueck` (K10). Notstopp `docker compose stop`.
Staging verwerfen: VM löschen (Betreiber) — es gibt dort nichts Schützenswertes außer synthetischen Daten.

## 5. Zwei getrennte restic-Repositorys

### 5.1 Trennung

| | Ablage (WP-04) | Widerrufbücher (BE-3) |
|---|---|---|
| Skript | `sicherung-ausser-haus.sh` (täglich 02:30 UTC) | `widerrufbuch-sicherung.sh` (stündlich, Minute 17) |
| Probe | `wiederherstellung-probe.sh` (monatlich am 3., 04:15) | **`widerrufbuch-probe.sh`** (monatlich am 5., 04:45, neu) |
| Konfiguration | `~/.config/centric-sicherung/env` | `~/.config/centric-sicherung/widerrufbuch.env` (selber Ordner → Repository-Vergleich greift) |
| Repository | eigenes Ziel | **anderes** Ziel (Job verweigert dasselbe, Exit 78) |
| Passwortdatei | `restic-passwort` | `widerrufbuch-restic-passwort` (anderes Passwort) |
| Zugangsdaten Speicherziel | eigenes Unterkonto/eigener Schlüssel | **eigenes** Unterkonto/eigener Schlüssel (Empfehlung; das Skript prüft nur die Repository-Angabe, B3-9) |
| Sperre | `lauf.lock` (Sicherung + Probe) | `widerrufbuch.lock` (Job + Probe) |
| Aufbewahrung | `--keep-daily 7 --keep-weekly 4 --keep-monthly 12` (fest) | `--keep-last 200 --keep-daily 90` (fest) |
| `check` je Lauf | 5 % | Vorgabe 5 %; **Empfehlung `CHECK_ANTEIL=100%`** (Repository winzig); monatlich `--read-data` in der Probe |
| Alarm | `ALARM_PING_URL` (1 Tag, Karenz 2–3 h), `PROBE_PING_URL` (31 Tage, Karenz 1 Tag) | `ALARM_PING_URL` (1 h, Karenz 2 h), `PROBE_PING_URL` (31 Tage, Karenz 1 Tag) |
| `/gesund` | `CENTRIC_SICHERUNG_STATUS` (Warnung > 26 h) | `CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS` (Warnung > 3 h, Rücksprung, ungesicherte Änderung > 90 min) |

Aufbewahrung ändert dieses Paket nicht (Betreibervorgabe 2026-11-07 „Technik unverändert“); die Frist der Ablage ist rechtlich
offen (C-9).

### 5.2 Cron oder systemd

Die Vorlage bleibt **cron** des Benutzers `admin` (`deploy/sicherung/crontab.beispiel`, kein sudo). systemd-Timer hätten
`Persistent=true` (verpasste Läufe nachholen), bräuchten als Benutzer-Timer aber `loginctl enable-linger admin` (sudo) bzw.
System-Units — nicht vorgesehen. Verpasste Läufe meldet der Totmannschalter. Nie beides gleichzeitig einrichten (die Sperren
verhindern zwar Doppelläufe, aber Alarme würden doppelt bzw. irreführend).

### 5.3 Alarmierung (vier Checks, fail-closed nur mit gesetzten URLs)

`centric-sicherung` (1 d), `centric-probe` (31 d), `centric-widerrufbuch` (1 h), `centric-widerrufbuch-probe` (31 d). Leere
Ping-URL heißt: **kein** Alarm — vor der Aktivierung alle vier setzen und je eine Fehlalarm-Probe (falsche Passwortdatei, Exit ≠ 0,
Alarm kommt an). Ping-URLs sind Geheimnisse (gehen über `curl -K -`, nie in Log oder Prozessliste). Zusätzlich externer Check auf
`/gesund` (`BETRIEB-UEBERWACHUNG.md` §4) und Status-Mount in `deploy/compose.yml` einkommentieren (C-12).

### 5.4 Restore-Proben

| Probe | Wie oft | Nachweis |
|---|---|---|
| Ablage `wiederherstellung-probe.sh` | monatlich | restore in leeres Ziel, Werkzeug `pruefen`, `wiederherstellen` (Pfeffer), **Manifest-Abgleich sha256** (gleich/abweichend/fehlend/überzählig), Probe-Container ohne Netz healthy, Bestände lesbar |
| Widerrufbücher, je Lauf (im Job) | stündlich | neuester Snapshot zurückgeholt, **bytegleich** mit der Stufe, Siegel gültig |
| **Widerrufbücher `widerrufbuch-probe.sh`** | monatlich | `check --read-data` (ganzes Repository); neuester und Vergleichs-Snapshot (Vorgabe ältester, `--alt ID`) in leere Ordner; **sha256 beider Stände** im Log, neuester in `widerrufbuch-probe-status.json` (`pruefsummen`); bytegleich mit der Stufe des letzten Jobs; Siegel; laufendes Buch ⊇ neuester Snapshot (sonst **Exit 3**); **Rollback-Gegenprobe**: älterer Stand gegen neuesten → Werkzeug muss Rücksprung melden (`gegenprobe: erkannt`), gleicher Inhalt → `nicht-aussagekraeftig` (Hinweis) |
| Ernstfall-Übung (Staging) | vor Aktivierung, danach halbjährlich | BE-3 §6.1 Schritt 4 (Sperrprobe, Host-Kennung, Hostverlust mit `wiederherstellen --widerrufbuch-kopie`, Rücksprung-Übung mit `widerrufbuch-vereinen`); Ablage: Restore in leeres Verzeichnis, Start, Anmeldung, Smoke (K9) |

Die Probe der Widerrufbücher liest nur: Die beiden Bücher werden in einen Temp-Ordner **kopiert** (nie das ganze
Zustandsverzeichnis mit der Schlüsselepoche einbinden), Prüfung im Produktionsbild ohne Netz, kein `backup`, kein `forget`.
Die Reihenfolge der Ausgabe von `restic snapshots --json` wird **nicht** angenommen: neuester und ältester Snapshot nach dem Feld
`time` (Nanosekunden, zeitzonenfest); unlesbare Zeit, nicht eindeutiger neuester Stand oder ein Vergleichsstand, der nicht älter ist,
ergeben Exit 1. Meldet der letzte Job `ok`, muss sein Snapshot der neueste sein (sonst Exit 1). Codes von Werkzeug/Container
(4, 75, 78, 124–126) werden in der Probe auf 1 abgebildet; 3 bleibt dem Rücksprung vorbehalten.

### 5.5 Übung auf der Staging-VM mit echtem restic (schließt B3-8)

Nur lokale Repositorys auf der VM, keine Kosten, keine Zugangsdaten eines Anbieters
(Vorlagen `deploy/staging-o2/sicherung.env.beispiel`, `deploy/staging-o2/widerrufbuch.env.beispiel`):

    mkdir -p -m 700 ~/centric-sicherung ~/sicherung-uebung ~/.config/centric-sicherung ~/restic-uebung
    cp -r <geprüfter-checkout>/deploy/sicherung/. ~/centric-sicherung/          # ganzer Ordner: gemeinsam.sh gehört dazu
    # restic 0.18.1 gepinnt mit Prüfsumme installieren: docs/BETRIEB-SICHERUNG.md §2.2
    ( umask 077; openssl rand -base64 36 > ~/.config/centric-sicherung/restic-passwort-uebung-ablage
                 openssl rand -base64 36 > ~/.config/centric-sicherung/restic-passwort-uebung-widerrufbuch )
    install -m 600 <checkout>/deploy/staging-o2/sicherung.env.beispiel     ~/.config/centric-sicherung/env
    install -m 600 <checkout>/deploy/staging-o2/widerrufbuch.env.beispiel  ~/.config/centric-sicherung/widerrufbuch.env
    # Platzhalter <DIGEST_DES_STAGING_KANDIDATEN> durch IMAGE_DIGEST der Staging-.env ersetzen (Wert nicht anzeigen)
    RESTIC_PASSWORD_FILE=~/.config/centric-sicherung/restic-passwort-uebung-ablage        ~/.local/bin/restic init -r ~/restic-uebung/ablage
    RESTIC_PASSWORD_FILE=~/.config/centric-sicherung/restic-passwort-uebung-widerrufbuch  ~/.local/bin/restic init -r ~/restic-uebung/widerrufbuch
    ~/centric-sicherung/sicherung-ausser-haus.sh       && ~/centric-sicherung/wiederherstellung-probe.sh
    ~/centric-sicherung/widerrufbuch-sicherung.sh      # Exit 0, Log „Eigenes Repository: verschieden …“, „restic 0.18.1 (>= 0.16.0)“
    # synthetischen Widerruf auslösen (Testkonto sperren), Job erneut → 2 Snapshots mit Unterschied
    ~/centric-sicherung/widerrufbuch-probe.sh          # Exit 0, "gegenprobe":"erkannt"
    # Gegenproben: gleiches Repository in widerrufbuch.env → Exit 78; RESTIC_HOST ändern → Exit 5;
    # `restic -r ~/restic-uebung/widerrufbuch check` in zweiter Sitzung während des Jobs → Job wartet (--retry-lock) und gelingt;
    # Rücksprung-Übung: Dienst stoppen, ältere Bücher (aus `restic restore <alt>`) nach ./zustand, starten →
    #   Job Exit 3, Probe Exit 3 → widerrufbuch-vereinen (BE-3 §6.2) → Job 0, Probe 0

Nachweis: Statusdateien (enthalten keine Geheimnisse), Logauszüge, Datum, Digest. Danach `~/restic-uebung` löschen.

## 6. Sicherheitsprüfung (kritisch)

| Nr. | Befund | Bewertung / Maßnahme |
|---|---|---|
| S-1 | **Kein Löschschutz:** Der Host darf `forget --prune` in beiden Repositorys; ein Angreifer mit `admin` löscht alle Sicherungen (B3-3, BETRIEB-SICHERUNG §5). | Entscheidung C-7. Ohne Skriptänderung möglich: Speicherziel mit **anbieterseitigen Snapshots/Versionierung**, die der Host-Zugang nicht löschen kann. `rest-server --append-only` oder S3 ohne Löschrecht verträgt sich **nicht** mit dem heutigen `forget --prune` im Job (jeder Lauf endete Exit 4) — dann braucht es einen Schalter „Aufbewahrung nicht auf dem Host“ und Prune von einem zweiten Rechner (B-4, nach Entscheidung). |
| S-2 | Trennung der Repositorys prüft das Skript nur über die Angabe in den beiden Konfigurationen (B3-9). | **Getrennte Zugangsdaten je Repository** (eigenes Unterkonto/eigener Bucket-Schlüssel), dann ist die Trennung auch technisch erzwungen. |
| S-3 | Passwortdatei, Pfeffer und Speicherzugang liegen auf dem Host. | Hingenommen (Schutz gegen Verlust, nicht gegen kompromittierten Host); Kopien im Passwortmanager, versiegelte Papierkopie. |
| S-4 | Leere Ping-URL = stiller Ausfall; Probe-Status liest `/gesund` nicht. | Vor Aktivierung alle vier Checks setzen (C-8) und Fehlalarm-Probe; sonst nicht fail-closed. |
| S-5 | `CHECK_ANTEIL` 5 % beim winzigen Widerrufbuch-Repository. | `100%` empfohlen; monatlich ohnehin `--read-data` in der Probe. |
| S-6 | Aufbewahrung 12 Monate enthält Personaldaten länger als frühere Zusage. | **Vor** dem ersten produktiven Lauf rechtlich entscheiden (C-9). |
| S-7 | Staging darf nie Produktionsdaten/-zugänge sehen. | Vorlagen mit nur lokalen Repositorys und Staging-Pfaden, geprüft in `pruefungen/staging-o2.test.js`; keine Produktionskopie (§4.5); eigener SSH-Schlüssel; kein DNS-API-Schlüssel (§4.3). |
| S-8 | Docker umgeht `ufw`. | Anbieter-Firewall bzw. `DOCKER-USER` (§4.2). |
| S-9 | GHCR-Token auf der VM. | nur `read:packages`, befristet, `docker logout` nach dem Pull (§4.4). |
| S-10 | Gemischte Skriptstände nach Teilkopie (z. B. neues `widerrufbuch-sicherung.sh` mit altem `gemeinsam.sh`). | Immer den **ganzen** Ordner kopieren (`cp -r deploy/sicherung/.`); eine Teilkopie scheitert laut (Funktion fehlt → Fehler-Ping), nicht still. |
| S-11 | Probe und Job teilen die Sperre: Läuft die Probe zur Minute 17, wird der Job abgewiesen (Exit 75, kein Ping). | Probe um 04:45 (dauert Sekunden bis Minuten); Karenz des stündlichen Checks 2 h fängt einen ausgelassenen Lauf ab. |
| S-12 | Produktion unberührt? | Ja: keine Datei unter `deploy/compose.yml`, `deploy.sh`, Workflows der Auslieferung geändert. Die Verschiebung in `gemeinsam.sh` wirkt erst, wenn der Betreiber Skripte neu kopiert (heute ist nichts eingerichtet). |
| S-13 | Produktionsbild ungeklärt (P1-5). | `CENTRIC_PROD_IMAGE` der Sicherung erst nach Klärung eintragen; nie ein gesperrtes Bild. |

## 7. Was lokal geprüft wurde und was nicht

- Lokal (Windows, Git Bash, Stubs für restic/docker/flock/stat): `npm run pruefung:be3-widerrufbuch-sicherung` (inkl. der neuen
  Probe-Fälle), `npm run pruefung:staging-o2`, `bash -n` aller geänderten Skripte, `npm run lint`.
- **Nicht** lokal: echtes restic (nicht installiert), Docker/Compose, Caddy (`caddy validate`), shellcheck, actionlint.
  shellcheck und die Ende-zu-Ende-Prüfung der Ablage mit echtem restic 0.18.1 laufen in CI (`betrieb-sicherung.yml`, löst bei
  Änderungen unter `deploy/sicherung/**` aus). Der BE-3-Job und die neue Probe mit echtem restic: offen (B-1 bzw. §5.5).

## 8. Priorisierte Checkliste

### A. Bereits technisch vorbereitet und nachgewiesen

| Nr. | Punkt | Beleg |
|---|---|---|
| A-1 | Staging-Stack per Digest, Caddy TLS + IP-Liste, Betriebsskript mit Sperrprüfung | #299, `pruefung:staging-o2` |
| A-2 | Staging-Gate (aus bis `STAGING_GATE_AKTIV`) | #299 |
| A-3 | Sicherung der Ablage + Probe, echtes restic in CI | `betrieb-sicherung.yml`, `wp04-nachweis.md` |
| A-4 | Sicherung der Widerrufbücher, eigenes Repository erzwungen, Rücksprungerkennung (Stubs) | #313, `pruefung:be3-widerrufbuch-sicherung` |
| A-5 | **Neu:** Probe der Widerrufbücher mit Prüfsummen und Rollback-Gegenprobe (Stubs) | dieses Paket, `pruefung:be3-widerrufbuch-sicherung` |
| A-6 | **Neu:** Vorlagen der Staging-Übung mit zwei lokalen Repositorys | dieses Paket, `pruefung:staging-o2` |

### B. Durch Claude ohne weitere Betreiberentscheidung ausführbar

| Nr. | Schritt | Befehl / Aktion | Zugang | Risiko | Dauer |
|---|---|---|---|---|---|
| B-1 | BE-3-Job **und** Probe mit **echtem restic** in CI (schließt B3-8 ohne VM): Ende-zu-Ende in `deploy/sicherung/ci/` um Widerrufbücher erweitern (Server im Bild erzeugt Bücher, Widerruf, Job ×3 mit **mindestens drei Snapshots**, Probe mit Auswahl nach `time`, Rücksprung → 3) | neuer PR, CI `betrieb-sicherung.yml` | Repository (vorhanden) | gering; CI-Laufzeit + ~5 min | 0,5–1 Tag |
| B-2 | CI dieses PR auswerten (shellcheck der neuen Probe, Ende-zu-Ende der Ablage nach Verschiebung in `gemeinsam.sh`) | `gh pr checks <PR>` | vorhanden | keins | 30 min |
| B-3 | SSOT-Nachtrag BE-3/Probe nach Merge | `node werkzeug/ssot-nach-integration.mjs <PR>` | vorhanden | gering | 15 min |
| B-4 | **Nach** Entscheidung C-7 für Append-only: Schalter „Aufbewahrung nicht auf dem Host“ in beiden Jobs + Prune-Runbook für zweiten Rechner, mit Tests | PR | vorhanden | mittel (Verhalten der Jobs) | 1 Tag |
| B-5 | Nachweisvorlage für die Staging-Übung (Tabelle K1–K12 + §5.5) ausfüllen, sobald Betreiber Ergebnisse liefert | Doku | vorhanden | keins | 1 h |

### C. Nur durch den Betreiber bzw. nach ausdrücklicher Freigabe

| Nr. | Schritt | Befehl / Aktion | Zugang | Risiko | Dauer |
|---|---|---|---|---|---|
| C-1 | P1-5 klären: welches Bild läuft | lesende Kommandos `PROD-DIGEST-ABWEICHUNG.md` §4 | SSH Produktion | keins (nur lesen) | 15 min |
| C-2 | Staging-VM bestellen (2 vCPU, 4 GB, 40 GB, Ubuntu LTS), eigene Firewall-Richtlinie, kein privates Netz zur Produktion | IONOS Cloud Panel | IONOS-Konto | Kosten | 30 min |
| C-3 | TLS-Weg wählen (Empfehlung T1) und Firewall setzen: 22 nur Betreiber-IP, 80/443 nach Wahl | Cloud Panel | IONOS | T1: Caddy öffentlich erreichbar | 15 min |
| C-4 | DNS `staging.<domain>` A-Eintrag (kein AAAA ohne IPv6 in der IP-Liste) | DNS-Verwaltung | Domain | Fehlkonfiguration nur Staging | 15 min + TTL |
| C-5 | SSH-Schlüssel nur für Staging, Docker installieren, `admin` uid 1000, UTC | `ssh-keygen -t ed25519 -f ~/.ssh/centric-staging`; Docker-Anleitung | VM | gering | 1 h |
| C-6 | Staging `.env` mit eigenen Zufallswerten, GHCR-Pull per Digest (Token `read:packages`, danach `docker logout`), Start, K1–K12 | `STAGING-O2-VORBEREITUNG.md` §4, §7 | VM, GHCR | gering (synthetisch) | 2–4 h |
| C-7 | **Speicherziel(e)** außer Haus wählen: zwei Repositorys, getrennte Zugangsdaten, **Löschschutz** (anbieterseitige Snapshots/Versionierung oder append-only + Prune extern), Region EU, Kosten | Anbieterkonto | Anbieter | Kosten; ohne Löschschutz S-1 | 1–2 h |
| C-8 | Totmannschalter: vier Checks (§5.3), Benachrichtigung | Alarmdienst | Konto | ohne: stiller Ausfall | 30 min |
| C-9 | Aufbewahrung rechtlich entscheiden (A/B/C in `BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md`) **vor** produktivem Lauf | Entscheidung | — | Rechtsrisiko | — |
| C-10 | Staging-Übung mit echtem restic nach §5.5 (oder Claude per Staging-SSH nach Freigabe) | §5.5 | Staging-SSH | gering | 2 h |
| C-11 | Produktion: restic 0.18.1 gepinnt, Skripte (ganzer Ordner), zwei Passwörter, `restic init` ×2 (zuerst Test-Repositorys), Konfigurationen, Handläufe, Fehlalarm-Proben | `BETRIEB-SICHERUNG.md` §2, §7 | SSH Produktion, Speicherziel | Last/Platz auf dem VPS; Sperre | 2–3 h |
| C-12 | Cron einkommentieren (4 Zeilen), Status-Mounts + Variablen in `deploy/compose.yml`, Dienst neu starten | `crontab -e`; Compose | SSH Produktion | Neustart = kurze Auszeit | 30 min |
| C-13 | `STAGING_GATE_AKTIV=true` und erster Gate-Lauf | GitHub Einstellungen | Admin | keins für Produktion | 30 min |
| C-14 | Branch-Schutz (P3-3) | `BETREIBER-BRANCHSCHUTZ.md` | Admin | — | 30 min |

**Echte Blocker:** C-2/C-3/C-4 (keine VM), C-7 (kein Speicherziel, kein Löschschutz), C-9 (Aufbewahrung rechtlich offen),
C-1 (Bild ungeklärt). B3-8 ist ohne VM über B-1 schließbar.
