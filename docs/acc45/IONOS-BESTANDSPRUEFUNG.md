# IONOS-Bestandsprüfung: reicht VPS Linux L+ und Cloud Backup Starter 100 für Staging, Sicherung und Wiederherstellung?

Stand 2026-11-16, Basis `integration/release-v4` @ `ba5055e4`. Auftrag: Betreiber, **ausschließlich lesend**.
Vorarbeit: [INFRA-VORBEREITUNG-STAGING-BACKUP.md](INFRA-VORBEREITUNG-STAGING-BACKUP.md),
[ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md](ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md), [../BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md),
[STAGING-O2-VORBEREITUNG.md](STAGING-O2-VORBEREITUNG.md), [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md), `deploy/compose.yml`,
`deploy/staging-o2/*`.

**Nichts ausgeführt:** keine Verbindung zum VPS, kein Login bei IONOS, keine Zugangsdaten oder Geheimnisdateien gelesen,
keine Bestellung, keine Kosten, keine Sicherung ausgeführt oder verändert. Web-Inhalte wurden nur als Daten gelesen
(Abruf 2026-11-16). Preise gelten **„laut Quelle, vom Betreiber zu bestätigen“**; Aktionspreise und Vertragsstand des
Betreibers können abweichen.

Belegstatus: **belegt** = offizielle IONOS-Quelle oder Repository-Datei genannt; **unbelegt** = Erfahrungswert, Schluss
oder in der Doku nicht gefunden (dann Supportfrage in §9).

## 0. Ergebnis in Kürze

| Bereich | Empfehlung | Kernbegründung | Zusatzkosten laut Quelle |
|---|---|---|---|
| (i) Staging | **C** — eigene kleine VM (bleibt Betreiberentscheidung O2) | Ressourcen auf dem L+ reichen wahrscheinlich, die **Isolation nicht**: gemeinsamer Docker-Daemon (Gruppe `docker` = root), gemeinsamer Kernel, 80/443 belegt der Produktions-Caddy, Kandidatenbilder liefen auf dem Produktionshost | VPS M+ (2 vCores, 4 GB, 120 GB): 12 €/Monat vor Aktion, 4 €/Monat 3 Monate Aktion, 10 € Einrichtung ([ionos.de/server/vps](https://www.ionos.de/server/vps)) |
| (ii) Ziel der zwei restic-Repositorys | **C** — externer S3-Speicher (Empfehlung IONOS Object Storage, zwei Buckets mit Object Lock, zwei Nutzer/Schlüssel) | Cloud Backup ist laut IONOS-Doku ein Acronis-Agentendienst; **kein** SFTP/S3/REST-Zugang dokumentiert → kein restic-Backend; zwei unabhängige Zugangsdaten dort nicht abbildbar | Object Storage 0,007 €/GB je 30 Tage, Eingang frei, Ausgang erste 2 TB/Monat frei ([Preisliste IONOS Cloud GmbH, v2026-10-29](https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de)); bei ~20 GB unter 1 €/Monat (Rechnung, unbelegt Datenmenge) |
| (iii) Host-Disaster-Recovery | **B** — Cloud Backup Starter 100 (vorhanden) als Image-/Systemsicherung des Hosts, mit Ergänzungen | passt fachlich (Image, Dateien, Zeitplan, Aufbewahrung, Verschlüsselung aktivierbar); Ergänzungen: Verschlüsselung an, EU-Rechenzentrum, Rücksprungschutz `zustand/` beachten (§6.3), Probe-Restore, Kostenobergrenze | keine, solange 100 GB reichen; Mehrverbrauch wird laut IONOS **automatisch** je GB berechnet ([Overview Backup Package](https://ionos.com/help/server-cloud-infrastructure/cloud-backup/overview-backup-package)) |

Die vorhandene Infrastruktur deckt damit **nicht** alles ab: Staging (wegen der Entscheidung O2 und der Isolation) und das
restic-Ziel brauchen Ergänzungen; die Host-Wiederherstellung kann das vorhandene Paket tragen.

## 1. VPS Linux L+: Tarifdaten, Ist-Stand, lesende Befehle

### 1a. Offizielle Tarifdaten (belegt, [ionos.de/server/vps](https://www.ionos.de/server/vps), Abruf 2026-11-16)

| Tarif | vCores | RAM | NVMe | Preis (Durchstreichpreis / Aktion) | Einrichtung |
|---|---|---|---|---|---|
| VPS M+ | 2 | 4 GB | 120 GB | 12 € / 4 € für 3 Monate | 10 € |
| **VPS L+** | **4** | **8 GB** | **240 GB** | 22 € / 7 € für 3 Monate | 10 € |
| VPS XL+ | 8 | 16 GB | 480 GB | 41 € / 12 € für 3 Monate | 10 € |

Traffic „unbegrenzt bis zu 1 Gbit/s“, Verfügbarkeit 99,99 % (gleiche Quelle). Die Seite weist Backup (Acronis) „ab 6 Cent
pro GB/Monat“ und „High-Speed-Images“ als Point-in-Time-Snapshots aus; ob Images im Tarif enthalten sind, ist dort nicht
eindeutig (**unbelegt**). Der Vertrag des Betreibers kann ein älterer Stand („VPS Linux L“) sein; die Werte stimmen nach der
Produktseite überein, der Preis nicht zwingend (**vom Betreiber zu bestätigen**).

### 1b. Was Repository und Doku zum Ist-Stand hergeben

| Aussage | Quelle | Status |
|---|---|---|
| Produktion: Docker-Container hinter Caddy auf IONOS-VPS, **keine Datenbank**, Daten als Dateien unter `/data` | `docs/IST-STAND.md:80` | belegt (Doku) |
| Anwendung: Speichergrenze `memory: 512m`, kein CPU-Limit, kein veröffentlichter Port, Netz `proxy` (extern) | `deploy/compose.yml` | belegt (Repository; Ist auf dem VPS nicht geprüft) |
| Caddy der Produktion liegt außerhalb des Repositorys (`/opt/proxy/Caddyfile`, `/opt/proxy/sites/…`), nie gelesen | `deploy/caddy/Caddyfile.vorlage`, `docs/CADDY-UND-XFF.md` | belegt (Doku) |
| Laufendes Produktionsbild ungeklärt | `PROD-DIGEST-ABWEICHUNG.md` (P1-5) | belegt offen |
| CPU-, RAM-, Platz-Auslastung, weitere Dienste (z. B. Website) auf dem VPS | — | **unbelegt**: nirgends im Repository |

### 1c. Lesende Befehle für den Betreiber (auf dem VPS, Benutzer `admin`; nichts davon ändert etwas)

    nproc; lscpu | grep -E 'Model name|^CPU\(s\)'; uname -r; grep PRETTY /etc/os-release
    uptime; vmstat 5 6                                 # Last, Steal-Zeit (Spalte st)
    free -h; grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo
    df -h; df -i                                       # Platz und Inodes
    docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
    docker system df                                   # Bilder, Container, Volumes, Build-Cache
    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
    docker network ls; docker network inspect proxy --format '{{range .Containers}}{{.Name}} {{end}}'
    sudo ss -tlnp                                      # wer lauscht auf 80/443/22/…
    du -sh /opt/apps/centric-dienstplanung/data /opt/apps/centric-dienstplanung/zustand
    sudo ufw status verbose; sudo iptables -S DOCKER-USER   # nur anzeigen
    systemctl list-units --type=service | grep -iE 'acronis|cyber|mms'   # Backup-Agent schon installiert?

Ausgaben ohne Adressen, Tokens oder `.env`-Inhalte weitergeben (öffentliches Repository). Messung zweimal: Ruhezeit und
Lastzeit (z. B. während einer Planfreigabe).

### 1d. Schwellenwert-Rahmen für einen zusätzlichen Stack auf demselben VPS

| Posten | Bedarf | Status |
|---|---|---|
| Staging-Anwendung | Grenze 512 MiB (`deploy/staging-o2/compose.yml`) | belegt (Limit) |
| Staging-Caddy | kein Limit gesetzt; typisch 30–100 MB | unbelegt (Erfahrungswert) |
| restic-Läufe (beide Jobs, klein) | typisch 100–300 MB kurzzeitig | unbelegt (Erfahrungswert) |
| Acronis-Agent | im Lauf mehrere 100 MB; Anforderungen in der IONOS-Doku nicht genannt | unbelegt → Supportfrage F-3 |
| Reserve Kernel, Docker, Seitencache | mindestens 1 GB | unbelegt (Faustregel) |

Rahmen (unbelegt, Vorschlag): Zusätzlicher Stack nur, wenn unter Last `MemAvailable` **≥ 2,5 GiB** (512 MiB Anwendung +
Caddy + restic + Agent + Reserve), Swap kaum benutzt, Load-Average dauerhaft **< 2** bei 4 vCores, Steal-Zeit < 10 %,
freier Platz **≥ 40 %** von 240 GB und nach Abzug der lokalen Sicherungskopien (`LOKAL_BEHALTEN` = 2) und zweier
Bilder je Stack (`docker system df`). Ressourcen sind nach dem Tarif **voraussichtlich ausreichend**; entscheidend gegen
Staging auf diesem Host ist die Isolation (§3), nicht die Größe.

## 2. Docker- und Caddy-Konfiguration im Repository (gelesen)

| Punkt | Produktion (`deploy/compose.yml`) | Staging O2 (`deploy/staging-o2/compose.yml`, `Caddyfile`) |
|---|---|---|
| Ports | keiner veröffentlicht; erreichbar nur über Caddy im Netz `proxy` | nur Caddy `80:80`, `443:443` (Host-Bindung auf allen Adressen) |
| Netz | `proxy`, **extern** (gehört zum Caddy-Stack unter `/opt/proxy`) | eigenes Bridge-Netz `staging-intern`, feste Adressen, `CENTRIC_VERTRAUTE_PROXYS` auf dieses Netz |
| Volumes | `./data`, `./zustand` (Bind), Status-Mount auskommentiert | `./data`, `./zustand`, `./caddy-daten`, `./caddy-konfig` |
| Limits | `memory: 512m`, kein CPU-Limit | Anwendung 512m; Caddy ohne Limit |
| Härtung | uid 1000, `read_only`, `cap_drop ALL`, `no-new-privileges`, Logrotation | gleich; Caddy nur `NET_BIND_SERVICE` |
| Bild | nur Digest, `pull_policy: never` | beide Bilder nur Digest |
| Caddy | extern, `admin`-Endpunkt und globale Optionen nicht gelesen | `admin off`, IP-Liste mit 403, `noindex` |

**Docker gegen ufw (belegt im Repository, `INFRA-VORBEREITUNG-STAGING-BACKUP.md` §4.2, S-8):** veröffentlichte Ports umgehen
`ufw`; Schutz nur über die Firewall im IONOS-Konto oder die Kette `DOCKER-USER`. Dass es eine Firewall im IONOS-Konto
gibt, die ohne Portfreigaben für den Backup-Agenten auskommt, ist belegt ([IONOS Hilfe, Backup-Agent Linux](https://www.ionos.com/help/server-cloud-infrastructure/cloud-backup/installing-the-backup-agent/installing-the-backup-agent-linux/)).

**Befund aus `docs/CADDY-UND-XFF.md`:** Jeder Container im Netz `proxy` erreicht `centric-dp-web:3000` direkt und kann jeden
Kopf setzen. Ein Staging, das man an das Netz `proxy` hängt, wäre damit **ein Angreifer im Vertrauensbereich der Produktion**.

## 3. Staging auf dem vorhandenen VPS? (Bewertung)

| Trennung | Auf demselben VPS erreichbar? | Restrisiko |
|---|---|---|
| Netz | ja, eigenes Bridge-Netz, **nie** `proxy` | Produktions-Caddy muss das Staging aber erreichen (80/443 belegt) → Staging-Caddy entfällt oder Caddy wird in zwei Netze gehängt; Konfiguration der Produktion wird geändert |
| Ports | nein ohne Eingriff: 80/443 hält der Produktions-Caddy | eigener Staging-Caddy auf anderen Ports hieße Zertifikat ohne HTTP-01; Änderung an `/opt/proxy` = Eingriff in die Produktion |
| Volumes | ja (anderes Verzeichnis) | gleicher Benutzer uid 1000 schreibt beide; Fehlpfad trifft Produktionsdaten |
| Geheimnisse | ja (eigene `.env`) | Host-root/`docker`-Gruppe liest beide |
| Domain | ja (`staging.<domain>` als zweite Site) | Zertifikate im selben Caddy |
| Ressourcen | voraussichtlich ja (§1d) | kein CPU-Limit; Last- und Speicherspitzen eines Kandidaten (z. B. Importe) treffen die Produktion; OOM des Hosts möglich |
| Blast-Radius | **nein** | Kandidatenbilder, GHCR-Token, Testläufe und Fehlbedienungen laufen auf dem Produktionshost; gemeinsamer Docker-Daemon und Kernel |
| Datenschutz | nur, wenn streng synthetisch | Nähe zu `data/` der Produktion begünstigt „schnell mal kopieren“; verboten nach §4.5 der Infra-Vorbereitung |

**Bewertung:** Technisch möglich, aber **nicht sicher isoliert**. Das stimmt mit der Betreiberentscheidung **C1 Staging O2
(eigene VM)** überein; diese Prüfung weicht davon **nicht** ab. Eine Abweichung („Staging auf dem Produktions-VPS“) bräuchte
eine ausdrückliche neue Betreiberentscheidung, die (a) die Änderung des Produktions-Caddy, (b) den gemeinsamen
Docker-Daemon und (c) Kandidatenbilder auf dem Produktionshost als Risiko annimmt, plus Auflagen: eigenes Netz ohne
`proxy`, CPU- und Speichergrenzen für alle Staging-Container (`cpus`, `mem_limit`), eigenes Verzeichnis außerhalb
`/opt/apps`, keine Ablage-Kopie, Abschaltung nach jeder Probe. **Nicht empfohlen.**

## 4. Cloud Backup Starter 100: Zugriffsmöglichkeiten

| Merkmal | Befund | Status, Quelle |
|---|---|---|
| Basis | „Powered by Acronis“; Agent heißt in der Hilfe Backup-Agent / Cyber Protection Agent | belegt: [ionos.de/cloud/cloud-backup](https://www.ionos.de/cloud/cloud-backup), [Hilfe bei Problemen](https://www.ionos.com/help/server-cloud-infrastructure/cloud-backup/cloud-backup-and-mydefender-help-in-case-of-problems/) |
| Paket | Starter 100 GB: 7 €/Monat inkl. MwSt. | belegt: ionos.de/cloud/cloud-backup |
| Geräteanzahl | auf ionos.de nicht genannt; Fremdquellen nennen „3 Geräte je Typ“ | **unbelegt** → F-1 |
| Mehrverbrauch | zusätzliche GB werden automatisch erstellt und berechnet | belegt: [Overview Backup Package](https://ionos.com/help/server-cloud-infrastructure/cloud-backup/overview-backup-package); Preis je GB für Starter **unbelegt** → F-2 |
| Linux-Server | Agent für „jeden Windows- oder Linux-Server“; Download im Cloud Panel, Installation per Skript, Registrierung in der Backup-Konsole | belegt: ionos.de, [Hilfe Agent Linux](https://www.ionos.com/help/server-cloud-infrastructure/cloud-backup/installing-the-backup-agent/installing-the-backup-agent-linux/) |
| Sicherungsarten | ganzer Server, einzelne Laufwerke oder einzelne Dateien; voll/inkrementell; Image | belegt: Overview Backup Package, ionos.de |
| Aufbewahrung | in der Backup-Konsole einstellbar; keine Werte genannt | belegt (Funktion), Werte unbelegt |
| Restore | einzelne Dateien, Verzeichnisse oder ganze System-Images | belegt: ionos.de (Werbetext); Bare-Metal-Weg für einen VPS (Boot-Medium?) **unbelegt** → F-4 |
| Verschlüsselung | in der Konsole aktivierbar; Transport „SSL-verschlüsselt“; Verfahren nicht genannt | belegt (aktivierbar), Verfahren **unbelegt** → F-5 |
| Löschschutz / Immutability | nicht erwähnt; Ransomware-Schutz nur in Plus/Premium (Agent-Schutz, kein Speicher-Löschschutz) | **unbelegt** → F-6 |
| SFTP / rsync / S3 / NFS / WebDAV | nicht erwähnt; Zugriff nur über Agent und Konsole | **unbelegt (nicht dokumentiert)** → F-7 |
| API | nicht erwähnt | **unbelegt** → F-8 |
| Mehrere Zugänge / Rollen | nicht erwähnt; Konsole je Rechenzentrum, Mail-Benachrichtigung | **unbelegt** → F-9 |
| Ports | ausgehend 443, 8443, 7770–7800, 44445, falls eine eigene Firewall ausgehend filtert | belegt: Hilfe Agent Linux |
| Rechenzentrum | Europa oder USA, beim Download des Agenten wählbar | belegt: ionos.de, Hilfe Agent Linux |
| VPS-Snapshot | ein Snapshot je Server, automatische Löschung nach 3 Tagen; Image als langfristige Kopie im Cloud Panel | belegt: [Unterschiede Snapshot/Image/Backup Package](https://www.ionos.com/help/server-cloud-infrastructure/general-information/differences-between-a-snapshot-an-image-and-a-backup-package/) (Artikel von ionos.com; Geltung für den deutschen VPS-Vertrag → F-10) |

## 5. Zwei getrennte restic-Repositorys: wo realisierbar?

restic braucht ein Backend: lokal, sftp, rest-server, S3-kompatibel u. a. (restic-Doku). **Cloud Backup bietet nach der
IONOS-Dokumentation keines davon** (§4, F-7). Damit gilt: **Die beiden restic-Repositorys können nicht direkt auf Cloud
Backup liegen**, und zwei unabhängige Zugangsdaten lassen sich dort nicht abbilden (ein Konto, eine Konsole). Bestätigung
durch IONOS: F-7.

| Option | Getrennte Zugangsdaten | Löschschutz | Passt zum heutigen Job (`forget --prune`) | Status |
|---|---|---|---|---|
| **O1 IONOS Object Storage (S3)**, zwei Buckets mit Object Lock | ja: je Bucket ein eigener Nutzer mit eigenem Schlüssel, Freigabe über Bucket-Policy; höchstens 5 Schlüssel je Nutzer | ja: Object Lock nur beim Anlegen, schaltet Versionierung fest ein; Governance (übersteuerbar) oder Compliance (nicht übersteuerbar), im DCD bis 365 Tage | **ja, mit Kostenfolge**: Löschen erzeugt nur Löschmarker, geschützte Versionen bleiben bis Fristende; Löschmarker selbst sind nicht geschützt. Wiederherstellung nach Angriff = ältere Versionen zurückholen (Übung nötig) | Object Lock und Schlüssel belegt: [Object Lock](https://docs.ionos.com/cloud/storage-and-backup/s3-object-storage/settings/object-lock), [Access Management](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/access-management), [Key Management](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/key-management); Verhalten von restic mit Löschmarkern **unbelegt** (Schluss, in Staging-Übung prüfen) |
| O2 `rest-server --append-only` auf zweiter VM | ja (je Repository eigener Nutzer) | ja, solange die VM nicht kompromittiert ist | **nein**: Prune vom Host scheitert; braucht Schalter „Aufbewahrung nicht auf dem Host“ (B-4) | Repository-Befund (S-1) |
| O3 restic lokal auf dem VPS + Cloud Backup sichert den Ordner | nein (ein Konto) | nur so gut wie Acronis-Aufbewahrung; Repo liegt beim Angreifer | ja | Notlösung, **nicht** empfohlen: eine Kopie am selben Ort, keine Trennung |
| O4 Fremdanbieter sftp (z. B. Storage Box, bisherige Doku-Empfehlung) | über Unterkonten | über anbieterseitige Snapshots | ja | in `BETRIEB-SICHERUNG.md` beschrieben; Preis hier **nicht** geprüft |

**Kosten O1 (laut Quelle, vom Betreiber zu bestätigen):** 0,007 € je GB und 30 Tage, Abrechnung stündlich, API-Aufrufe frei,
Eingang frei, Ausgang je Vertrag erste 2 TB/Monat frei, danach 0,030 €/GB
([Preisliste IONOS Cloud GmbH, v2026-10-29](https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de)).
Object Storage gehört zu **IONOS Cloud** (Data Center Designer); ob der bestehende Hosting-Vertrag genügt oder ein eigener
Cloud-Vertrag nötig ist: **unbelegt** → F-11. Region Deutschland/EU wählen; Rechenzentrumsliste für Object Lock nicht
geprüft → F-12.

**Empfohlene Ausprägung O1:** Bucket `…-ablage` und `…-widerrufbuch`, je mit Object Lock **Governance** zum Start (später
Compliance), Standardfrist ≥ längste restic-Aufbewahrung, die nicht durch rechtliche Frist C-9 begrenzt ist; zwei
Nutzer, jeder nur auf seinen Bucket (Bucket-Policy), Schlüssel nur auf dem VPS in den jeweiligen Konfigurationen; ein
dritter Nutzer (nicht auf dem VPS) für Prüfung/Notfall. Die Frist kollidiert mit der offenen Rechtsfrage (12 Monate,
C-9): Object Lock verlängert faktisch die Speicherdauer gelöschter Stände bis Fristende.

## 6. Zusätzliche Backup-Funktionen und Zusammenspiel mit restic

### 6.1 Rollen

| Ebene | Werkzeug | Zweck | Konsistenz |
|---|---|---|---|
| Anwendungsdaten | restic-Job Ablage (`ablage-sicherung sichern` im Produktionsbild, dann restic) | anwendungskonsistente Sicherung mit Pfeffer-Prüfwert, Manifest, Probe | konsistent: das Werkzeug erstellt den Sicherungsstand selbst (`BETRIEB-SICHERUNG.md` §1) |
| Widerrufbücher | restic-Job BE-3, stündlich, eigenes Repository | Rücksprungerkennung, RPO ≤ 1 h | Siegel/HMAC-Prüfung je Lauf (BE-3 §2) |
| Host | Cloud Backup (Acronis) Image/Laufwerk | Betriebssystem, Docker, `/opt/proxy`, Konfiguration schnell zurück | absturzkonsistent für laufende Dateien (unbelegt, F-13) |
| Vor Änderungen | VPS-Snapshot (1 je Server, 3 Tage) oder Image | Rückweg nach Update/Konfigurationsänderung | wie oben |

Die Anwendung hat **keine Datenbank** (keine SQLite-Datei, `docs/IST-STAND.md:80`); konsistente Daten liefert der
restic-Job über das Werkzeug `ablage-sicherung`, nicht ein Datei- oder Image-Abzug. Ein Image ist daher **Ergänzung**
(Host-Wiederaufbau), **kein Ersatz** für die beiden restic-Repositorys.

### 6.2 Was in einen Acronis-Plan gehört

- Ganzer Server oder Systemlaufwerk; Verschlüsselung **an** (Passwort im Passwortmanager, getrennt von restic-Passwörtern);
  Rechenzentrum Europa; Aufbewahrung kurz halten (z. B. 7–14 Tage), weil das Image Personaldaten aus `data/` enthält und die
  Rechtsfrage C-9 auch dafür gilt.
- Das Image enthält `.env` (Pfeffer, Verwalterschlüssel), restic-Passwortdateien und Speicherzugänge. Das ist ein weiterer
  Ort mit Geheimnissen → Verschlüsselung Pflicht; Zugang zur Backup-Konsole mit zweitem Faktor (ob möglich: F-9).

### 6.3 Kritisch: Image-Restore rollt `zustand/` zurück

`deploy/compose.yml` verlangt: Schlüsselepoche in `zustand/` **nie mitsichern, nie zurückspielen**. Ein Image- oder
Snapshot-Restore setzt `data/` **und** `zustand/` gemeinsam auf einen älteren Stand — genau der Fall R-1 aus BE-3 §2.4
(älterer, gültig gesiegelter Stand, ohne Kopie außer Haus nicht erkennbar). Folgen und Pflichten:

1. Im Acronis-Plan `zustand/` **ausschließen** (oder nie einzeln zurückspielen); bei Ausschluss gilt nach Image-Restore
   „Hostverlust“: `wiederherstellen --widerrufbuch-kopie` aus dem restic-Repository Widerrufbücher (BE-3 §2.3).
2. Nach **jedem** Image- oder Snapshot-Restore: Anwendung gestoppt lassen, `data/` aus dem restic-Repository Ablage
   wiederherstellen (neuester geprüfter Stand) und Widerrufbücher nach BE-3 §6.2 vereinen; erst dann starten.
3. Darum braucht die Host-Wiederherstellung **zwingend** das externe restic-Ziel (§5). Cloud Backup allein reicht nicht.
4. Ob Acronis Ausschlüsse für Verzeichnisse bei Image-Sicherung erlaubt: F-14.

## 7. Vergleich der Optionen

| Option | Sicherheit | Wiederherstellbarkeit | Kosten (laut Quelle) | Aufwand |
|---|---|---|---|---|
| Staging auf Produktions-VPS | schlecht (gemeinsamer Daemon/Kernel, Caddy-Eingriff) | — | 0 € | mittel, Eingriff in `/opt/proxy` |
| **Staging auf eigener VPS M+** | gut (eigene VM, eigene Firewall-Richtlinie) | VM wegwerfbar | 12 €/Monat (Aktion 4 € 3 Monate) + 10 € einmalig | wie geplant (`STAGING-O2-VORBEREITUNG.md`) |
| restic auf Cloud Backup | nicht möglich (kein Backend dokumentiert) | — | — | — |
| restic lokal + Acronis (O3) | schwach (keine Trennung, Angreifer am Ort) | mittel | 0 € zusätzlich | gering |
| **restic auf IONOS Object Storage mit Object Lock (O1)** | gut (zwei Nutzer, Löschschutz anbieterseitig) | gut (restic-Restore; nach Angriff Versionen zurückholen) | ~0,007 €/GB/30 Tage, Ausgang bis 2 TB frei | gering: `RESTIC_REPOSITORY=s3:…`, `AWS_*` in den Konfigurationen (Skripte reichen `AWS_*` schon durch) |
| restic + `rest-server --append-only` (O2) | gut | gut | zweite VM | mittel + Skriptänderung B-4 |
| **Host-DR mit Cloud Backup (vorhanden)** | mittel (Geheimnisse im Image; Löschschutz unbelegt) | gut für Host; Daten nur zusammen mit restic (§6.3) | 7 €/Monat (bereits gebucht), Mehrverbrauch automatisch | gering: Agent installieren, Plan anlegen, Probe |
| Nur VPS-Snapshot | schwach (1 Stand, 3 Tage, gleicher Ort) | kurzfristiger Rückweg | unbelegt | gering |

## 8. Empfehlung je Bereich

- **(i) Staging: C.** Eigene VM (VPS M+ genügt: 2 vCores, 4 GB, 120 GB ≥ Plan 2/4/40). Begründung: Isolation und
  Blast-Radius (§3), Betreiberentscheidung O2. Zusatzkosten laut Quelle 12 €/Monat nach Aktion, 10 € Einrichtung. Keine
  Abweichung von O2.
- **(ii) Ziel der zwei restic-Repositorys: C.** Externer S3-Speicher; Empfehlung IONOS Object Storage mit Object Lock
  (Governance zum Start), zwei Buckets, zwei Nutzer. Begründung: Cloud Backup bietet kein restic-Backend und keine
  getrennten Zugangsdaten (§4, §5). Zusatzkosten laut Quelle: Cent-Beträge je Monat bei erwarteter Datenmenge (Menge erst
  nach `du -sh` aus §1c belastbar). Entscheidung ersetzt die offene Zielwahl C-7 / P3-6 (b),(c).
- **(iii) Host-Disaster-Recovery: B.** Vorhandenes Cloud Backup Starter 100 mit Acronis-Agent für Image-Sicherung des VPS,
  ergänzt um: Verschlüsselung an, EU-Rechenzentrum, kurze Aufbewahrung, `zustand/`-Regel und Wiederherstellungsablauf
  nach §6.3, Kostenwarnung wegen automatischem Mehrverbrauch. Ein Image-Restore auf die Staging-VM ist **verboten**
  (Image enthält Produktionsdaten); die Probe besteht aus einem Datei-Restore einzelner Systemdateien auf dem VPS und den
  dokumentierten Bare-Metal-Schritten (F-4). Ein Probe-Restore des ganzen Images braucht einen eigenen, danach gelöschten
  VPS und eine eigene Freigabe. Keine Zusatzkosten, solange 100 GB reichen.

Reihenfolge: Antworten F-1 bis F-14 einholen → Messwerte §1c → Entscheidungen P3-7 (Liste) → Bestellung nur mit Freigabe.

## 9. Offene Fragen an den IONOS-Support (Fragenliste)

| Nr. | Frage |
|---|---|
| F-1 | Wie viele Server-Geräte (Agenten) umfasst Cloud Backup **Starter 100 GB**, und zählt ein Linux-VPS als „Server“? |
| F-2 | Preis je zusätzlichem GB im Starter-Paket; lässt sich der automatische Mehrverbrauch abschalten oder deckeln? |
| F-3 | Systemvoraussetzungen des Linux-Agenten (Distributionen, Kernel-Modul für Image-Sicherung, RAM/CPU im Lauf), Betrieb auf dem VPS-Tarif L+ freigegeben? |
| F-4 | Wie läuft eine vollständige Wiederherstellung (Bare Metal) eines VPS aus einem Cloud-Backup-Image: Boot-Medium, Wiederherstellung auf einen **neuen** VPS möglich? |
| F-5 | Verschlüsselungsverfahren der Sicherungen (Algorithmus, clientseitig vor Übertragung?), wer kennt das Passwort, was passiert bei Verlust? |
| F-6 | Gibt es Löschschutz/Immutable Storage für Cloud-Backup-Sicherungen (auch im Starter-Paket)? Kann ein kompromittierter Server mit installiertem Agenten Sicherungen löschen? |
| F-7 | Gibt es einen Speicherzugriff außerhalb des Agenten (SFTP, rsync, S3, WebDAV, NFS), z. B. um eigene verschlüsselte Archive (restic) abzulegen? |
| F-8 | Gibt es eine API für Cloud Backup (Status, Pläne, Restore)? |
| F-9 | Mehrere Benutzer/Rollen für die Backup-Konsole, getrennte Zugänge je Gerät, zweiter Faktor für die Konsole? |
| F-10 | Gilt „ein Snapshot je Server, Löschung nach 3 Tagen“ für den deutschen VPS-Tarif L+? Sind Images im Tarif enthalten oder kostenpflichtig, wie viele? |
| F-11 | Kann ein Hosting-Kunde (VPS-Vertrag) IONOS Object Storage nutzen, oder ist ein eigener IONOS-Cloud-Vertrag nötig (Mindestlaufzeit, Grundgebühr)? |
| F-12 | In welchen deutschen Rechenzentren ist Object Storage mit Object Lock verfügbar; wird Verkehr VPS → Object Storage berechnet? |
| F-13 | Erstellt der Agent unter Linux konsistente Sicherungen laufender Dateien (Snapshot-Mechanismus), oder nur absturzkonsistent? |
| F-14 | Lassen sich bei Image-/Laufwerkssicherung einzelne Verzeichnisse ausschließen? |

## 10. Was geprüft wurde

- Gelesen: die oben genannten Repository-Dateien, offizielle IONOS-Seiten (verlinkt, Abruf 2026-11-16). Keine Fremdquelle
  als Beleg verwendet.
- Lokal geprüft: `npm run pruefung:doku`, `npm run pruefung:acc45-status` (je einzeln).
- Nicht geprüft: alles auf dem VPS, im IONOS-Konto oder in der Backup-Konsole.
