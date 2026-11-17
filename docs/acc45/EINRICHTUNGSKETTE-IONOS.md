# Einrichtungskette IONOS: Object Storage, restic, Alarm, Restore (Staging-VM zurückgestellt)

Stand 2026-11-17, Basis `integration/release-v4` @ `8300c346`. Grundlage: Betreiberentscheidung 2026-11-17 (Punkte 1–5),
[IONOS-BESTANDSPRUEFUNG.md](IONOS-BESTANDSPRUEFUNG.md), [INFRA-VORBEREITUNG-STAGING-BACKUP.md](INFRA-VORBEREITUNG-STAGING-BACKUP.md),
[STAGING-O2-VORBEREITUNG.md](STAGING-O2-VORBEREITUNG.md), [ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md](ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md),
[../BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md).

**Nichts davon ist ausgeführt.** Kein Login bei IONOS, keine Bestellung, keine Kosten, keine Verbindung zum VPS, keine
Zugangsdaten gelesen. Alle Werte in Vorlagen sind `<PLATZHALTER>`. Kennzeichnung je Schritt: **[AUTO]** = Claude kann es ohne
weitere Entscheidung (im Repository oder mit einem ausdrücklich freigegebenen Zugang) ausführen; **[BETREIBER]** = nur der
Betreiber bzw. nach gesonderter Freigabe.

## 0. Bestell- und Aktivierungsschritte (Kurzfassung für den Betreiber)

Preise laut offizieller IONOS-Quelle, Abruf 2026-11-17 (Quellen in §1). „bestätigt“ = so auf der offiziellen Seite;
„unbestätigt“ = dort nicht eindeutig → im Bestellprozess bzw. beim Support klären, **bevor** bestellt wird.

**Betreiberentscheidung 2026-11-17 (Nachtrag, ersetzt Punkt 1):** Während der Produktentwicklung **keine** dauerhafte
Staging-VM, kein zweiter VPS, keine neue kostenpflichtige Staging-Infrastruktur. Der vorhandene VPS Linux L+ bleibt Produktion,
Cloud Backup Starter 100 bleibt. Phasen: **A** Feature Complete → **B** Internal Test Ready (synthetische Daten, isolierte
lokale Umgebung bzw. CI-Runner) → **C** Pilot Ready → **D** Final Staging & Release Validation (nach dem Pilot, isolierte
Umgebung, ggf. temporäre Infrastruktur nach Freigabe) → **E** Production Ready. Gefährliche Restore-, Migrations-, Last- und
Ausfalltests **nie** auf dem laufenden Produktionssystem. Die Staging-Teile (§2–§4) sind deshalb **ZURÜCKGESTELLT bis Phase D**;
Testwege bis dahin: §1a.

| Schritt | Kosten | Kosten bestätigt? | Entscheidung / Klärung nötig |
|---|---|---|---|
| S-1 IONOS Object Storage aktivieren | 0,007 €/GB je 30 Tage netto, stundengenau; API-Aufrufe und Eingang frei; Ausgang erste 2 TB/Monat frei, dann 0,030 €/GB; keine Mindestabnahme | Preise **bestätigt** (Preisliste IONOS Cloud GmbH); ob der bestehende Hosting-Vertrag genügt oder ein **IONOS-Cloud-Vertrag (DCD)** nötig ist: **unbestätigt**; Bezug der 2-TB-Freigrenze: unbestätigt | Vertragsweg klären (F-11); Region **eu-central-3 (Berlin)** oder **eu-central-4 (Frankfurt)**; Aufbewahrungsfrist Object Lock (§5, hängt an C-9) |
| S-2 zwei Buckets mit Object Lock (Governance) | Speicher wie S-1; Object Lock verlängert die Lagerdauer gelöschter Stände bis Fristende | Funktion **bestätigt**; Kostenhöhe hängt an Datenmenge (unbelegt bis Messung §B) | Frist `<TAGE_SPERRFRIST>`; Policy-Variante L oder S (§5.3) |
| S-3 zwei Nutzer + Schlüssel je Bucket | 0 € | Bucket-Policy mit Nutzer-Principal **bestätigt**; IAM gibt es **nicht**; Wirksamkeit von Deny/Delete-Aktionen **unbestätigt** → Test-Bucket-Probe S-6 | keine (Teil der Freigabe S-1) |
| A-1 Totmannschalter (vier Checks) | je nach Dienst 0 € (z. B. kostenloser Plan) | nicht geprüft (Dienst nicht gewählt) | Dienst wählen |
| B-1 Cloud Backup Starter 100 (vorhanden) | 7 €/Monat inkl. MwSt. (bereits gebucht); Mehrverbrauch automatisch je GB | 7 € bestätigt am 2026-11-16 (ionos.de); am 2026-11-17 nur die US-Seite erneut gelesen; Preis je Mehr-GB **unbestätigt** (F-2) | Agent installieren, Plan anlegen (§8); Ausschluss `zustand/` (F-14) |
| R-1 produktiver Restore jeder Art | 0 € | — | **gesonderte Freigabe**, nie ohne |

Neue wiederkehrende Kosten (S-1/S-2, A-1 falls kostenpflichtig) nur mit **endgültiger Betreiberbestätigung**; nichts davon
wird automatisch aktiviert. Reihenfolge: Klärung F-11/F-15/F-17 → Freigabe S-1 → S3-Probe auf Test-Buckets (§5.4 S-6) →
restic-Übung auf isoliertem Testweg (§1a) → erst danach Produktion (§7) mit gesonderter Freigabe.

Zurückgestellt bis Phase D (nur Stand notiert, nicht priorisiert verifiziert): VPS M+ 2 vCores/4 GB/120 GB, 4 €/Monat für
3 Monate inkl. MwSt., 10 € Einrichtung, danach angezeigt 12 €/Monat (Folgepreis, Laufzeit, Kündigungsfrist unbestätigt);
Quelle [ionos.de/server/vps](https://www.ionos.de/server/vps), Abruf 2026-11-17.

## 1a. Isolierte Testwege ohne VM (Phasen A–C)

| Nr. | Art | Testweg | Was er belegt | Grenze |
|---|---|---|---|---|
| L-1 | [AUTO] | Lokal (Arbeitsrechner, Git Bash, Stubs): `npm run pruefung:staging-o2`, `pruefung:be3-widerrufbuch-sicherung`, `npx vitest run pruefungen/deploy-skripte.test.js` | Skriptlogik, Vorlagen, Rücksprung-/Vereinigungslogik mit synthetischen Daten | kein echtes restic, kein Docker |
| L-2 | [AUTO] | CI-Runner `betrieb-sicherung.yml`: echtes restic 0.18.1, **lokales** Repository auf dem Runner, Skripte der Ablage Ende-zu-Ende, shellcheck | Sicherung und Restore-Probe der Ablage mit echtem restic | kein S3, keine Widerrufbücher |
| L-3 | [AUTO] | CI-Erweiterung B-1 (`INFRA-VORBEREITUNG-STAGING-BACKUP.md` §8 B): BE-3-Job und `widerrufbuch-probe.sh` mit echtem restic auf dem Runner, mindestens drei Snapshots, Rücksprung → Exit 3, Vereinigung | schließt B3-8 ohne VM | eigener PR |
| L-4 | [BETREIBER] (Freigabe Test-Buckets und Test-Schlüssel) | S3-Probe S-6 gegen **Test-Buckets** vom Arbeitsrechner des Betreibers (restic 0.18.1 und AWS CLI installiert) oder einem Wegwerf-Runner ohne gespeicherte Geheimnisse; **nie** vom Produktions-VPS und nie mit Produktionsschlüsseln | Object Lock, Deny, Löschmarker, Trennung der Schlüssel, restic-Kompatibilität | Cent-Kosten; Test-Schlüssel danach widerrufen |
| L-5 | [AUTO] | Restore-Probe mit synthetischen Daten lokal/CI: `restic restore` in leeres Verzeichnis, `wiederherstellung-probe.sh` (Stub lokal, echt in L-2) | Wiederherstellbarkeit, Manifest-Abgleich | keine Produktionsdaten |

Keine Kopie, Sicherung oder Export der Produktion in diese Testwege (`INFRA-VORBEREITUNG-STAGING-BACKUP.md` §4.5).

## 1. Verifizierte Bedingungen (Quelle, Abruf 2026-11-17)

Abruf durch einen Recherche-Agenten mit Seitenzusammenfassung; Zahlen wörtlich übernommen. Vor Bestellung im Bestellprozess
gegenprüfen.

| Aussage | Status | Quelle |
|---|---|---|
| VPS M+: 2 vCores, 4 GB RAM, 120 GB NVMe | bestätigt | [ionos.de/server/vps](https://www.ionos.de/server/vps) |
| VPS M+: „4 € für 3 Monate“, Preise inkl. MwSt.; daneben „12 €“; Einrichtung 10 € | Aktion und Einrichtung bestätigt; 12 € als Folgepreis **unbestätigt** | ebd. |
| Angebote „teils abhängig von Mindestvertragslaufzeiten“; Laufzeit für M+ nicht genannt | bestätigt (Fußnote); Laufzeit **unbestätigt** | ebd. |
| AGB-Grundregel 12 Monate Mindestlaufzeit, Kündigung 1 Monat zum Ende | **unbestätigt** (nur Suchzusammenfassung, AGB nicht geöffnet) | [ionos.de AGB](https://www.ionos.de/terms-gtc/terms/) |
| Traffic unbegrenzt bis 1 Gbit/s; 1 IPv4 inklusive, IPv6-/80-Netz inklusive | bestätigt | [ionos.de/server/vps](https://www.ionos.de/server/vps) |
| Standortwahl „EU, USA und Großbritannien“; Rechenzentren u. a. Berlin, Frankfurt | Region EU bestätigt; Auswahl Deutschland **unbestätigt** | ebd., [Newsroom 2023](https://www.ionos.de/newsroom/news/ionos-vps-auf-neuer-plattform-mehr-performance-und-besseres-preis-leistungsverhaeltnis/) |
| Anbieter-Firewall im Cloud Panel, für einen oder mehrere Server | bestätigt | [ionos.de/server/vps](https://www.ionos.de/server/vps) |
| Abrechnung monatlich oder stündlich | **unbestätigt** | — |
| Object Storage ist ein Produkt von **IONOS Cloud** (DCD/API/S3); „kein fester Vertrag, keine Mindestabnahme“; nur Geschäftskunden; Preise zzgl. MwSt. | bestätigt | [cloud.ionos.de Object Storage](https://cloud.ionos.de/storage/object-storage) |
| Nutzung aus einem Hosting-/VPS-Vertrag ohne IONOS-Cloud-Vertrag | **unbestätigt** → F-11 | — |
| Bucket-Typen: contract-owned (Regionen eu-central-3 Berlin, eu-central-4 Frankfurt, us-central-1; Freigabe per Bucket-Policy) und user-owned (de, eu-central-2, eu-south-2; Freigabe per ACL) | bestätigt | [Bucket types](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/bucket-types), [Endpoints](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/endpoints) |
| Endpunkte contract-owned: `s3.eu-central-3.ionoscloud.com`, `s3.eu-central-4.ionoscloud.com`; HTTPS | bestätigt | [Endpoints](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/endpoints) |
| Preise: 0,007 €/GB je 30 Tage netto, stundengenau; API frei; Eingang frei; Ausgang erste 2 TB frei, danach 0,030 €/GB (bis 10 TB) | bestätigt (Bezug der Freigrenze unbestätigt) | [Preisliste IONOS Cloud GmbH](https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de) |
| Object Lock: beide Bucket-Typen; Governance und Compliance; **nur beim Anlegen** aktivierbar; schaltet Versionierung dauerhaft ein; Standardfrist je Bucket; Legal Hold; im DCD bis 365 Tage, länger nur per API | bestätigt; Widerspruch in der API-Doku contract-owned („does not provide object locking“) **unbestätigt** → Probe S-6 | [Object Lock](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/settings/object-lock) |
| Versionierung und Löschmarker; Lifecycle mit „noncurrent versions löschen“ und „abgelaufene Löschmarker entfernen“; Object Lock hat Vorrang vor Lifecycle | bestätigt (Lifecycle nur aus Zusammenfassung); Zusammenspiel der Löschmarker-Regel **unbestätigt** | [S3 API compatibility](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/concepts/s3-api-compatibility), [Lifecycle](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/settings/lifecycle) |
| **Kein IAM, kein STS**; Bucket-Policy mit Principal `arn:aws:iam:::user/<VERTRAGSNUMMER>:<NUTZER_UUID>` (contract-owned) | bestätigt | [Bucket policy](https://docs.ionos.com/cloud/backup-and-storage/ionos-object-storage/settings/bucket-policy) |
| Vollständige Liste der Policy-Aktionen; Wirkung von `Deny` auf `s3:DeleteObjectVersion`/`s3:BypassGovernanceRetention`; Schlüssel je Nutzer | **unbestätigt** → Probe S-6, Support F-15 | — |
| Offizielle restic-Anleitung; Path-Style/Virtual-Host; Regionsparameter mit restic | **unbestätigt** (Anleitungen nur für rclone, s3cmd, AWS CLI) → Probe S-6 | [rclone](https://docs.ionos.com/cloud/storage-and-backup/ionos-object-storage/s3-tools/rclone) |

Zusätzliche Supportfragen (Ergänzung zu F-1…F-14 in `IONOS-BESTANDSPRUEFUNG.md` §9): **F-15** Welche S3-Aktionen werten
Bucket-Policies aus, wirkt `Deny` für Nutzer desselben Vertrags, und hat ein Nutzer ohne Policy-Eintrag Zugriff auf
contract-owned Buckets? **F-16** VPS M+: Preis ab Monat 4, Mindestlaufzeit, Kündigungsfrist, Abrechnungsart, Standort
Deutschland wählbar? **F-17** Gilt die API-Aussage „does not provide object locking“ für contract-owned Buckets noch?

## 2. Staging-VM (VPS M+) — ZURÜCKGESTELLT bis Phase D

Inhalt bleibt als Vorlage für Phase D (dann ggf. temporär, mit eigener Freigabe); bis dahin nichts bestellen, Testwege §1a.

| Nr. | Art | Aktion / Befehl | Zugang | Risiko | Dauer | Abbruch / Rücksprung | Kosten |
|---|---|---|---|---|---|---|---|
| V-1 | [BETREIBER] | Nach Bestätigung von Folgepreis, Laufzeit, Kündigungsfrist: VPS M+ bestellen, Ubuntu LTS, Standort Deutschland/EU, **kein** privates Netz zur Produktion, eigener Name `centric-staging` | IONOS-Konto | Kosten | 30 min | vor Abschluss Warenkorb verwerfen; danach Kündigung nach Vertrag | siehe §0 |
| V-2 | [BETREIBER] | Eigenen SSH-Schlüssel erzeugen `ssh-keygen -t ed25519 -f ~/.ssh/centric-staging`, nur den öffentlichen Teil hinterlegen; Alias `centric-staging` mit `IdentitiesOnly yes`; Passwort-Login aus | Arbeitsrechner, Cloud Panel | gering | 15 min | Schlüssel im Panel entfernen | 0 € |
| V-3 | [BETREIBER] | `timedatectl set-timezone UTC`; Benutzer `admin` (uid 1000); Updates | VM | gering | 20 min | VM neu aufsetzen | 0 € |

## 3. Firewall, DNS, TLS — ZURÜCKGESTELLT bis Phase D

| Nr. | Art | Aktion / Befehl | Zugang | Risiko | Dauer | Abbruch / Rücksprung | Kosten |
|---|---|---|---|---|---|---|---|
| F-1 | [BETREIBER] | Firewall-Richtlinie **im Cloud Panel** nur für die Staging-VM: 22/tcp nur Betreiberadresse; **80/443 offen** (TLS-Weg **T1**: Begrenzung macht Caddy per `STAGING_ERLAUBT`, Fremde 403); sonst alles zu; IPv6 gleich behandeln | Cloud Panel | Caddy aus dem Internet erreichbar (nur 403) | 15 min | Regel zurücknehmen | 0 € |
| F-2 | [BETREIBER] | **Docker umgeht ufw** (DNAT vor INPUT): ufw schützt 80/443 nicht. Erste Linie bleibt F-1. Optional zweite Linie in `DOCKER-USER`, z. B. `iptables -I DOCKER-USER -i <iface> -p tcp -m multiport ! --dports 80,443 -j DROP` — erst nach Probe, dauerhaft per `iptables-persistent` | VM (sudo) | Fehlregel sperrt Staging | 20 min | `iptables -D DOCKER-USER 1` | 0 € |
| F-3 | [AUTO] | Prüfung der Wirksamkeit von außen nach F-1/F-2 (Port 22 nur Betreiber, 80/443 → 403 für Fremde) mit dem vorhandenen `werkzeug/staging-smoke.mjs` bzw. `curl -I`, **nur** mit freigegebenem Staging-Zugang | Staging-URL | keins | 10 min | — | 0 € |
| D-1 | [BETREIBER] | DNS: **nur** `A`-Eintrag `staging.<domain>` → Staging-IPv4; **kein `AAAA`** (solange `STAGING_ERLAUBT` keine IPv6-Bereiche hat) | DNS-Verwaltung | Fehleintrag trifft nur Staging | 15 min + TTL | Eintrag löschen | 0 € |
| T-1 | [BETREIBER] | TLS = T1 (`INFRA-VORBEREITUNG-STAGING-BACKUP.md` §4.3): Caddy holt das Zertifikat per HTTP-01; für erste Versuche Test-CA (`acme_ca …acme-staging…`), vor Abnahme K3 entfernen. **Kein** DNS-API-Schlüssel auf der VM (T2 nur mit auf Staging beschränkter Zone) | VM | Ratenbegrenzung bei Fehlversuchen | 15 min | Test-CA nutzen | 0 € |

## 4. Docker, Deployment per Digest, Testdaten, Rücksprung — ZURÜCKGESTELLT bis Phase D

| Nr. | Art | Aktion / Befehl | Zugang | Risiko | Dauer | Abbruch / Rücksprung | Kosten |
|---|---|---|---|---|---|---|---|
| K-1 | [BETREIBER] | Docker Engine + Compose-Plugin aus offizieller Quelle; `admin` in Gruppe `docker` (root-gleich, auf Staging hingenommen) | VM | gering | 20 min | Pakete entfernen | 0 € |
| K-2 | [BETREIBER] | `deploy/staging-o2/` nach `/opt/centric-staging` kopieren; `.env` aus `env.staging.beispiel` mit **auf der VM erzeugten** Zufallswerten (nie anzeigen) | VM | gering | 20 min | `.env` löschen | 0 € |
| K-3 | [BETREIBER] | GHCR-Pull **per Digest**: Token nur `read:packages`, befristet, `read -rs`, danach `docker logout ghcr.io`; `docker pull ghcr.io/rinats-png/dienstplaner@sha256:<DIGEST>` und `caddy@sha256:<CADDY_DIGEST>` (kein `docker save/load`) | VM, GHCR | Token-Rest in `~/.docker` | 15 min | Token widerrufen | 0 € |
| K-4 | [AUTO] nach Freigabe eines Staging-SSH-Zugangs, sonst [BETREIBER] | `./betrieb.sh pruefen` → `docker compose config -q` → `docker compose up -d --pull never` → K1–K12 (`STAGING-O2-VORBEREITUNG.md` §7) | Staging-SSH | gering (synthetisch) | 2–4 h | `docker compose stop` | 0 € |
| K-5 | [AUTO] | Nur synthetische Testdaten: `/einrichten` mit Staging-Verwalterschlüssel, `werkzeug/staging-smoke.mjs` (Räume `ppg-gate-a/-b`), erfundene Personen. **Nie** Produktionsdaten, -sicherungen, -exporte | Staging | keins | 30 min | `./data`, `./zustand` leeren | 0 € |
| K-6 | [AUTO] wie K-4 | Rücksprung A→B→A: `./betrieb.sh merken <digest-A>`, Wechsel, `./betrieb.sh zurueck` (Sperrliste, fail-closed); Notstopp `docker compose stop` | Staging-SSH | gering | 30 min | VM verwerfen | 0 € |
| K-7 | [BETREIBER] | Gate: `STAGING_GATE_AKTIV=true` setzen — **nicht** Teil dieser Kette, eigene Freigabe | GitHub | — | — | Variable entfernen | 0 € |

## 5. IONOS Object Storage: zwei Buckets, zwei Nutzer, Löschschutz

### 5.1 Ziel

Je Repository (Ablage WP-04, Widerrufbücher BE-3) ein **eigener Bucket** mit Object Lock **Governance** (Start; später
Compliance nach Probe), ein **eigener Nutzer mit eigenem Schlüssel**, der nur seinen Bucket erreicht. Ein dritter Zugang
(Betreiber/Vertragsinhaber, **nie** auf dem VPS) verwaltet Policy, Lifecycle und Notfall-Wiederherstellung.

### 5.2 Löschschutz gegen `forget --prune` (Sicherheitsbefund)

Beide Jobs rufen auf dem Host `restic forget … --prune` auf (`sicherung-ausser-haus.sh`, `widerrufbuch-sicherung.sh`), und
restic **löscht bei jedem Lauf seine Sperrdateien** (`locks/`). Eine Policy nur mit `PutObject`/`GetObject`/`ListBucket`
**ohne** `DeleteObject` ist daher mit dem heutigen Job **nicht vereinbar**: Prune scheitert (Exit ≠ 0 → Fehler-Ping jede Nacht
bzw. jede Stunde), und liegengebliebene Sperren blockieren `check`/`prune` (Schluss aus dem restic-Verhalten, in S-6 zu
belegen). Das bestätigt `INFRA-VORBEREITUNG-STAGING-BACKUP.md` S-1.

Der Löschschutz entsteht deshalb **beim Anbieter**, nicht durch Weglassen von `DeleteObject`:

- Object Lock schaltet Versionierung fest ein. Ein `DeleteObject` **ohne** Versionsangabe legt nur einen **Löschmarker** an; die
  Version bleibt erhalten, auch nach `forget --prune` eines Angreifers mit dem Host-Schlüssel.
- **Grenze der Sperrfrist:** Retention schützt eine Version nur, solange sie **jünger als die Sperrfrist** ist. Langlebige Objekte
  (`config`, `keys/`, alte Packs, die restic nie neu schreibt) haben danach **keine** Sperre mehr; sie schützt dann allein das
  `Deny` auf `s3:DeleteObjectVersion` — dessen Wirkung bei IONOS ist **unbestätigt** (F-15) und wird in S-6 (3) gezielt an einem
  Objekt mit **abgelaufener** Retention geprüft.
- Das eigentliche Löschen (`s3:DeleteObjectVersion`), das Umgehen der Governance-Sperre (`s3:BypassGovernanceRetention`) und
  jede Änderung an Sperre, Versionierung, Lifecycle und Policy werden dem Host-Nutzer **ausdrücklich verweigert** (`Deny`).
- Alte Versionen entfernt **nur** eine Lifecycle-Regel des Betreibers (`NoncurrentVersionExpiration`), und zwar erst nach
  Ablauf der Sperrfrist (Object Lock hat Vorrang vor Lifecycle, bestätigt).

Restrisiko: Löschmarker selbst sind nicht geschützt; ein Angreifer kann Stände „verstecken“, aber nicht vernichten — **solange
die Lifecycle-Regel die verdeckten Versionen noch nicht entfernt hat**. Das Erkennungsfenster ist `NoncurrentDays` der
Lifecycle-Regel (für Objekte jünger als die Sperrfrist mindestens bis Fristende); ein Angriff muss innerhalb dieses Fensters
bemerkt werden (Totmannschalter, `/gesund`, Probe). Zweites Restrisiko **Kosten-DoS**: Mit dem Host-Schlüssel lassen sich
beliebig viele Objekte schreiben, die unter Object Lock bis Fristende kostenpflichtig bleiben → im IONOS-Konto einen
Budget-/Kostenalarm einrichten (Betreiber; Verfügbarkeit unbestätigt, F-15). Rückweg siehe §5.6. Wirkung von `Deny` bei IONOS ist **unbestätigt** → Probe S-6, ohne bestandene Probe kein Produktivbetrieb.

### 5.3 Entscheidungsvorlage Policy (keine stille Abschwächung)

| Variante | Host-Nutzer darf | Job unverändert? | Löschschutz | Empfehlung |
|---|---|---|---|---|
| **L** Löschmarker (Vorlagen `deploy/sicherung/s3-policy-*.json.beispiel`) | List, Get, Put, `DeleteObject`; **Deny** auf Versionen löschen, Bypass, Sperre/Versionierung/Lifecycle/Policy/ACL ändern, Bucket löschen; zusätzlich **Deny `s3:*`** für den jeweils anderen Host-Nutzer | ja | anbieterseitig bis Fristende (Object Lock + Deny) | **empfohlen** |
| **S** strikt ohne `DeleteObject` | List, Get, Put | **nein**: braucht Schalter „Aufbewahrung nicht auf dem Host“ (B-4) in beiden Jobs, `forget --prune`, `unlock` und Sperrbereinigung von einem **zweiten Rechner** mit eigenem Schlüssel | wie L plus kein Löschmarker vom Host | nur, wenn der Betreiber den zweiten Rechner betreiben will; Umsetzung erst nach Entscheidung |

Mit **L** ist die Vorgabe „ohne DeleteObject“ **bewusst nicht** wörtlich erfüllt; der Schutz liegt in Object Lock + Deny. Das
ist Entscheidungspunkt **P3-8 (a)** in `ENTSCHEIDUNGSLISTE.md`.

### 5.4 Schritte

| Nr. | Art | Aktion / Befehl | Zugang | Risiko | Dauer | Abbruch / Rücksprung | Kosten |
|---|---|---|---|---|---|---|---|
| S-1 | [BETREIBER] | Vertragsweg klären (F-11/F-17), Object Storage aktivieren; Region eu-central-3 oder eu-central-4; Bucket-Typ **contract-owned** (Bucket-Policy mit Nutzer-Principal) | IONOS (DCD) | Kosten | 30 min | nicht aktivieren | §0 |
| S-2 | [BETREIBER] | Zwei Test-Buckets `<BUCKET_TEST_ABLAGE>`, `<BUCKET_TEST_WIDERRUFBUCH>` **mit Object Lock** (nur beim Anlegen möglich!), Governance, kurze Frist (z. B. 1 Tag) — für die Probe S-6 | DCD | gering | 15 min | Buckets nach Fristende löschen | Cent |
| S-3 | [BETREIBER] | Zwei DCD-Nutzer ohne Verwaltungsrechte (`<NUTZER_UUID_HOST_ABLAGE>`, `<NUTZER_UUID_HOST_WIDERRUFBUCH>`), je **ein** S3-Schlüssel; Schlüssel nur in den Passwortmanager | DCD | Schlüsselabfluss | 20 min | Schlüssel widerrufen | 0 € |
| S-4 | [AUTO] (Vorlage) / [BETREIBER] (anwenden) | Policy aus `deploy/sicherung/s3-policy-ablage.json.beispiel` bzw. `…-widerrufbuch.json.beispiel`, Platzhalter ersetzen, mit dem **Verwaltungszugang** setzen (z. B. `aws s3api put-bucket-policy --endpoint-url https://s3.<REGION>.ionoscloud.com --bucket <BUCKET> --policy file://…`) | Verwaltungszugang | Fehlpolicy sperrt aus | 15 min | Policy entfernen | 0 € |
| S-5 | [BETREIBER] | Lifecycle aus `deploy/sicherung/s3-lifecycle.json.beispiel` (`<TAGE_NICHT_AKTUELL>` als Zahl ≥ Sperrfrist) | Verwaltungszugang | zu kurze Frist | 10 min | Regel entfernen | 0 € |
| S-6 | [BETREIBER] (Testweg L-4; [AUTO] nur, wenn der Betreiber einen isolierten Runner mit Test-Schlüsseln freigibt) | **Probe auf Test-Buckets**, alles mit restic 0.18.1: (1) `restic init`, `backup`, `forget --prune`, `check` gelingen mit Variante L; (2) Host-Schlüssel A erreicht Bucket B **nicht** (403) und umgekehrt; (3) `aws s3api delete-object --version-id …` mit Host-Schlüssel → verweigert, und zwar **auch** an einem Objekt, dessen Retention **abgelaufen** ist (Test-Bucket mit 1-Tag-Frist, Objekt älter als 1 Tag) — nur so ist das Deny selbst belegt; (3b) Host-Schlüssel A auf Bucket B: jede Aktion verweigert (Deny `s3:*` für den anderen Principal); (4) nach `forget --prune` sind alte Versionen per `list-object-versions` noch da; (5) `restic -o s3.bucket-lookup=path` nötig? (Endpunkt-/Regionsfrage); (6) verlangt Object Lock einen Prüfsummenkopf, den restic sendet? Ergebnis in die Nachweistabelle | Arbeitsrechner/Wegwerf-Runner, Test-Schlüssel | gering | 1–2 h | Test-Buckets verfallen lassen | Cent |
| S-7 | [BETREIBER] | Erst nach bestandener S-6 und Entscheidung C-9 (Frist): Produktions-Buckets `<BUCKET_ABLAGE>`, `<BUCKET_WIDERRUFBUCH>` mit Object Lock Governance, Frist `<TAGE_SPERRFRIST>`; Policy und Lifecycle wie S-4/S-5 | DCD | Frist verlängert Speicherdauer (C-9) | 30 min | Bucket leer verfallen lassen | §0 |

Sperrfrist: mindestens die Zeit bis zur sicheren Entdeckung eines Angriffs (Vorschlag 30 Tage), höchstens die rechtlich
zulässige Aufbewahrung (C-9, `docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md`). Object Lock verlängert faktisch die
Speicherdauer gelöschter Stände bis Fristende.

### 5.5 restic-Konfiguration (Platzhalter, keine Werte)

Vorlagen `deploy/sicherung/env.beispiel` und `widerrufbuch.env.beispiel` (der Parser kennt `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` bereits):

    RESTIC_REPOSITORY=s3:https://s3.<REGION>.ionoscloud.com/<BUCKET_ABLAGE>/centric-restic
    AWS_DEFAULT_REGION=<REGION>
    AWS_ACCESS_KEY_ID=<SCHLUESSEL_ID_NUTZER_ABLAGE>
    AWS_SECRET_ACCESS_KEY=<GEHEIMNIS_NUTZER_ABLAGE>

Die Widerrufbücher analog mit `<BUCKET_WIDERRUFBUCH>` und dem **anderen** Nutzer. Dateien Modus 600; Werte nie anzeigen.
`restic init` je Repository mit eigener Passwortdatei (`BETRIEB-SICHERUNG.md` §2, §7). Der Job verweigert dasselbe Repository
(Exit 78); getrennte Schlüssel machen die Trennung zusätzlich technisch.

### 5.6 Wiederherstellung nach Löschangriff (Löschmarker)

1. [BETREIBER] Host-Schlüssel beider Nutzer widerrufen; Anwendung bleibt laufen, Jobs per `crontab -e` auskommentieren.
2. [BETREIBER] Mit dem Verwaltungszugang `list-object-versions` je Bucket; die **Löschmarker** nach dem Angriffszeitpunkt
   entfernen (`delete-object --version-id <MARKER>`; Löschmarker sind nicht gesperrt) oder den Stand zum Zeitpunkt T in einen
   neuen Bucket kopieren.
3. [AUTO] mit neuem, freigegebenem Lesezugang: `restic snapshots`, `restic check --read-data` (nur lesen).
4. Weiter nach §7/§8; neue Schlüssel, neue Policy. Diese Übung gehört in S-6 (auf Test-Buckets), nie zuerst produktiv.

## 6. Cron/Timer, Alarmierung, Restore-Probe

| Nr. | Art | Aktion / Befehl | Zugang | Risiko | Dauer | Abbruch / Rücksprung | Kosten |
|---|---|---|---|---|---|---|---|
| C-1 | [BETREIBER] | cron des Benutzers `admin` nach `deploy/sicherung/crontab.beispiel` (4 Zeilen: 02:30 Ablage, 04:15 am 3. Probe, Minute 17 Widerrufbuch, 04:45 am 5. Probe). **Kein** zusätzlicher systemd-Timer (doppelte Alarme) | VPS | Last kurz | 10 min | Zeilen auskommentieren | 0 € |
| A-1 | [BETREIBER] | Totmannschalter mit **vier** Checks: `centric-sicherung` (1 d, Karenz 2–3 h), `centric-probe` (31 d, 1 d), `centric-widerrufbuch` (1 h, 2 h), `centric-widerrufbuch-probe` (31 d, 1 d). URLs sind Geheimnisse (`ALARM_PING_URL`, `PROBE_PING_URL` je Datei) | Alarmdienst | leere URL = stiller Ausfall | 30 min | Checks pausieren | §0 |
| A-2 | [BETREIBER] | Fehlalarm-Probe je Check (falsche Passwortdatei → Exit ≠ 0 → Alarm kommt an) | VPS | keins | 20 min | Datei zurück | 0 € |
| P-1 | [AUTO] (CI) / [BETREIBER] (Test-Buckets) | Übung mit echtem restic: Ablage auf dem CI-Runner (L-2), Widerrufbücher per CI-Erweiterung (L-3), danach gegen **Test-Buckets** (L-4/S-6); die VM-Variante `INFRA-VORBEREITUNG-STAGING-BACKUP.md` §5.5 erst in Phase D; `wiederherstellung-probe.sh`, `widerrufbuch-probe.sh` (Exit 0, `gegenprobe: erkannt`) | CI-Runner/Test-Buckets | gering | 2 h | Repos löschen | Cent |
| P-2 | [BETREIBER] | Object-Lock-/Löschmarker-Probe: nach `forget --prune` Versionen noch vorhanden; Löschmarker entfernen stellt den Stand wieder her (§5.6); Restore in **leeres** Verzeichnis | Test-Buckets | gering | 1 h | — | Cent |

## 7. Produktion: restic aktivieren (gesonderte Freigabe)

[BETREIBER], erst nach §5.4 S-7, A-1, C-9 und Klärung des laufenden Bilds (P1-5): restic 0.18.1 gepinnt, ganzen Ordner
`deploy/sicherung/` kopieren, zwei Passwörter, `restic init` ×2, Konfigurationen, Handläufe, Fehlalarm-Proben, Cron, Status-Mounts
(`INFRA-VORBEREITUNG-STAGING-BACKUP.md` §8 C-11/C-12). Rückweg: Cron auskommentieren; Sicherungen bleiben im Bucket.

## 8. Cloud Backup (Acronis): Host-Image und Restore-Runbook mit BE-1 bis BE-3

Einrichtung [BETREIBER]: Agent aus dem Cloud Panel (Rechenzentrum Europa), Plan „ganzer Server“, Verschlüsselung **an**
(Passwort getrennt von restic), kurze Aufbewahrung (7–14 Tage), Verzeichnis `zustand/` **ausschließen**, wenn Acronis das bei
Image-Sicherung erlaubt (F-14; sonst gilt die Regel unten unverändert). Kosten: Paket vorhanden, Mehrverbrauch automatisch (F-2).

**Runbook Image-Restore** (Reihenfolge verbindlich; jeder produktive Restore braucht eine **gesonderte Freigabe**; **nie** auf
eine Staging- oder Testumgebung, weil das Image Produktionsdaten und Geheimnisse enthält):

0. **Vor** Restore und erstem Boot den Zugang sperren: `deploy/compose.yml` hat `restart: unless-stopped` — der Stack startet
   nach dem Boot von selbst mit dem **alten** `data/` und `zustand/` aus dem Image; der Rücksprung bliebe unerkannt, widerrufene
   Codes könnten wieder gelten. Deshalb in der **Anbieter-Firewall** (Cloud Panel) 80/443 für alle sperren (SSH nur
   Betreiberadresse) **oder** im Rescue-System `docker.service` deaktivieren (`systemctl disable docker.service docker.socket` im
   gemounteten System). Erst nach bestandener Prüfung in Schritt 5 wieder öffnen bzw. aktivieren.
1. Image zurückspielen; nach dem Boot sofort `docker compose stop` im Anwendungsordner (falls Docker doch lief) und die
   **Crontab** des Benutzers `admin` stilllegen (`crontab -l > ~/crontab.vor-restore`, dann alle Zeilen auskommentieren, wie
   §5.6): Sonst sichert der Ablage-Job um 02:30 das zurückgerollte `data/` als neuesten Snapshot, und der Widerrufbuch-Job läuft
   gegen alte Bücher. Erst in Schritt 5 wieder einsetzen.
2. `zustand/` aus dem Image **nicht** verwenden: Schlüsselepoche nie zurückspielen (`deploy/compose.yml`).
   - War `zustand/` **ausgeschlossen**: Hostverlust — `wiederherstellen --widerrufbuch-kopie` aus dem restic-Repository der
     Widerrufbücher (BE-3 §2.3).
   - War `zustand/` **nicht** ausgeschlossen: den Image-Stand **beiseitelegen, nicht löschen** (`mv zustand zustand.image-<DATUM>`,
     nur für `admin` lesbar; Beleg und Rückfall), dann ebenfalls `wiederherstellen --widerrufbuch-kopie` in ein leeres
     `zustand/`. Der beiseitegelegte Stand wird nie zurückkopiert.
3. `data/` aus dem restic-Repository **Ablage** wiederherstellen (neuester geprüfter Stand, `BETRIEB-SICHERUNG.md`), nicht aus
   dem Image.
4. Widerrufbücher **vereinen**, nie ersetzen: `widerrufbuch-vereinen` mit dem neuesten Stand aus dem restic-Repository
   Widerrufbücher (BE-3 §6.2). Das deckt Zugangs-Widerrufbuch (Codes), Konto-Widerrufbuch (BE-1: Sperren, entzogene
   Mitgliedschaften) und die Abschnitte von BE-2 A1 (aktiver Faktor, verbrauchte Wiederherstellungscodes) ab. **Ein widerrufener
   oder verbrauchter Code darf danach nie wieder gültig sein**: Probe mit einem bekannten widerrufenen Testcode bzw. Prüfung
   `widerrufbuch-probe.sh` (Exit 0).
5. Erst jetzt starten (Docker wieder aktivieren, falls in Schritt 0 deaktiviert); `/gesund` prüfen (kein Rücksprung,
   Widerrufbuch-Alter) und die Testcode-Probe aus Schritt 4 bestehen; **dann** Firewall 80/443 wieder öffnen und die Crontab
   wieder einsetzen; nächster Job-Lauf Exit 0.
6. Abbruch: bei jedem Fehler in 0–5 bleiben Anwendung, Firewall-Sperre und Cron gestoppt (fail-closed); Eskalation an den Betreiber.

Probe [BETREIBER]: Datei-Restore einzelner, unkritischer Systemdateien in ein **getrenntes Zielverzeichnis** (nie an Ort und
Stelle, nie `data/`/`zustand/`, Anwendung unberührt). Ein Voll-Image-Restore ist ein gefährlicher Test und läuft **nie** auf dem
Produktionssystem: erst in Phase D auf temporärer, danach gelöschter Infrastruktur mit eigener Freigabe (Kosten).

## 9. Auslastungsmessung des Produktions-VPS (nur lesend)

Skript `deploy/auslastung-messen.sh` (Prüfung `pruefungen/staging-o2.test.js`, Abschnitt „IONOS: Auslastungsmessung“). Es misst
nproc, Last, Steal, Speicher, Platz, `docker stats --no-stream`, `docker system df`, lauschende Ports (nur Port, Adressklasse,
Prozessname), ufw/`DOCKER-USER` (Adressen maskiert), Acronis-Agent ja/nein, Größe von `data/`/`zustand/`, und bewertet gegen
`IONOS-BESTANDSPRUEFUNG.md` §1d. Es liest nie `.env`, nie `docker inspect`, nie Prozessumgebungen; `sudo` nur als `sudo -n`.

| Nr. | Art | Aktion | Zugang | Risiko | Dauer |
|---|---|---|---|---|---|
| M-1 | [BETREIBER] | `ssh <alias> 'bash -s -- --ohne-sudo' < deploy/auslastung-messen.sh > messung-ruhe.txt`, dann mit sudo-Recht ohne `--ohne-sudo`; zweimal: Ruhezeit und Lastzeit | SSH Produktion (vorhanden beim Betreiber) | keins (nur lesen) | 2× 5 min |
| M-2 | [AUTO] | Auswertung der übergebenen Ausgabe (keine Adressen enthalten) gegen §1d, Eintrag in `IONOS-BESTANDSPRUEFUNG.md` | Repository | keins | 30 min |

Befund 2026-11-17 auf dem Arbeitsrechner (nur Existenz geprüft): keine `~/.ssh/config`, kein laufender SSH-Agent, eine
öffentliche Schlüsseldatei vorhanden; im Repository ist **kein** für Messungen autorisierter Zugang dokumentiert. Darum wurde
**nicht** verbunden; M-1 bleibt beim Betreiber.

## 10. Nicht geprüft

Alles im IONOS-Konto, auf dem VPS und in der Backup-Konsole; echtes restic gegen IONOS (S-6); Wirkung der Policy-Aktionen;
Bestellprozess (Folgepreis, Laufzeit); Acronis-Ausschlüsse. Lokal geprüft: `bash -n`, Stub-Lauf des Messskripts,
`pruefung:staging-o2`, `pruefung:be3-widerrufbuch-sicherung`, `pruefung:doku`, `pruefung:acc45-status`, `lint`.
