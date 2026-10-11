# Production-Deploy-Bericht — Release Candidate `main@64d08a4`

| | |
|---|---|
| Datum | 2026-10-11 (alle Zeiten UTC) |
| Grundlage | [PRODUCTION-MIGRATION-PLAN.md](PRODUCTION-MIGRATION-PLAN.md), GO des Betreibers |
| Ziel | `centric-dp-web` in `/opt/apps/centric-dienstplanung` |
| Ergebnis | **PRODUCTION DEPLOYMENT BESTANDEN** |

Nach Plan ausgeführt, ausschließlich per Digest. Es gab keine Änderung an Caddy oder DNS, kein
Pull über `latest`, keine Datenmigration, und die Registrierung blieb aus. Ausgaben enthalten
nur Zählungen, Hashes und Pseudonyme — keine Codes, Schlüssel oder Inhalte.

---

## A. Preflight (nur lesend)

- **Ziel:** Pfad `/opt/apps/centric-dienstplanung`, Container `centric-dp-web`, Compose-Projekt
  `centric-dienstplanung`.
- **Laufender Stand:** Image `sha256:0861adee…` (`IMAGE_TAG=latest`), seit
  `2026-09-15T02:06:02Z`, 0 Neustarts, healthy, `/gesund` 200.
- **Konfiguration:** Netz `proxy`, keine Ports, `user 1000:1000`, read-only, `cap_drop ALL`,
  `no-new-privileges`, 512 MB, Bind-Mount `./data → /data`, `tmpfs /tmp`, `unless-stopped`.
- **Registrierung:** `CENTRIC_PUBLIC_REGISTRATION` weder in `.env` noch im Container gesetzt;
  `RESEND_API_KEY` nicht gesetzt.
- **Ressourcen:** 224 GB frei; Daten 24 065 B in 152 Dateien.
- **Ablage:**
  - `centric`: 9 `konto:`, 2 `verwalter:`, `selbststarts`, `aufraeumen:letzter`;
  - `centric-sitzungen`: 5 `t:`;
  - `centric-takt`: 98 `v:`;
  - `centric-spur`: 36.
- **Lesbarkeit:**
  - alle 9 Codes lesbar (3 Betreiber, 6 Leitung, alle mit Raum, 6 Demo);
  - 2 Verwalter lesbar (1 aktiv, 1 gesperrt);
  - Selbststarts leer;
  - Protokoll: 6 erfolgreiche Code-Anmeldungen in der Vergangenheit.
- **Lokal vorhanden:** RC-Image `f03a8514…`; kein Pull nötig.

**Grenze:** Ein direkter Login mit den bestehenden Codes oder Verwalterschlüsseln ist nicht
möglich, ohne Klartext-Geheimnisse zu verwenden. Nach Plan wurden keine echten Codes benutzt.
Die bestehenden Zugänge sind belegt durch:

- unveränderte Datensätze (Hash vorher/nachher);
- Lesbarkeit mit dem neuen Image;
- einen Smoke-Code und einen Smoke-Verwalter mit dem Production-Pfeffer.

## B. Alter Production-Stand

| | |
|---|---|
| Image | `sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1` (aus `main@1a56988`, Auslieferung `34919567232`) |
| Lokaler Anker | `ghcr.io/rinats-png/dienstplaner:prod-vor-rc-1a56988` → `0861adee…` (gesetzt vor jeder Änderung) |
| Container (alt) | `ccad65996cb245fa…`, gestartet 2026-09-15T02:06:02Z |

## C. Backup und Rohkopie (Container gestoppt)

| | |
|---|---|
| Rohkopie | `data.vor-rc-20261011T005932Z` — 152 Dateien, 24 065 B, Prüfsummenliste `data.vor-rc-20261011T005932Z.sha256`, Baumhash `1a3ede3efac5d56e58536294e4a99f0eb617332bc461f7436de9ff8648eb8f33`, `sha256sum -c` ok, gleiche Dateiliste |
| Kopien | `compose.yml.vor-rc-20261011T005932Z`, `.env.vor-rc-20261011T005932Z` (beide byte-gleich, 600), `inspect.vor-rc-20261011T005932Z.json` (600, enthält die Umgebung), `dateiliste.vor-rc-20261011T005932Z.txt` |
| Logische Sicherung | `sicherungen/centric-sicherung-20261011T005933Z` mit dem Werkzeug aus dem RC-Image, Daten nur lesend gemountet. `pruefen`: **„In Ordnung: 49 Dateien“** (152 − 5 Sitzungen − 98 Zählfenster, Klasse C bewusst ausgelassen). Baumhash `32fe643863433d89bd85a0196620d153210453320aca12de4d5bc89a0fdc9161` |
| Extern | `C:\Users\RR\centric-sicherungen\production\centric-sicherung-20261011T005933Z` auf dem Betreiber-Rechner — 52 Dateien, byte-gleich mit dem Server |

**Abdruck vor dem Deploy:**

| Speicher | Dateien | Hash der Prüfsummenliste |
|---|---|---|
| `centric` | 13 | `7d0a9bf330114084` |
| `centric-spur` | 36 | `c4390fb9c63fd9f3` |
| `centric-sitzungen` | 5 | `c5ec62ce1cde1e76` |
| `centric-takt` | 98 | `f493b219e513c6d1` |

- **Persistenter Kern** (`konto:`, `verwalter:`, `selbststarts`):
  `5a42be4c5af6efe8b3d3ef129c97b0b3c77da459d970f5a23c9755c3f94138a7`.
- **Vor dem Deploy keine Account-Daten:** 0 `account:`, 0 Account-Sitzungen.

## D. Deploy-Image

`ghcr.io/rinats-png/dienstplaner:64d08a4957c5374e1f04c17be2b75162c07573d2@sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79`

- **Digests:** amd64 `sha256:dd1fd37b…95f0`, Config `sha256:ad3737a6…81ba`.
- **Herkunft:** Auslieferung `38098836621`; SLSA-Provenance `vcs:revision = 64d08a4…`.
- **`.env`:** `IMAGE_TAG=latest` → `IMAGE_TAG=64d08a4…@sha256:f03a8514…`. Sonst keine Zeile geändert
  (geprüft per Diff gegen die Kopie).
- **Start:** `docker compose up -d --pull never --force-recreate centric-dp-web`; neuer Container
  `50e108ff78cd…`.

## E. Downtime

Stopp `00:59:32.5Z` → healthy `01:01:01.5Z` = **89 s** (geplant: unter 5 min).

## F. Health

- **Container:** healthy nach 8 s, 0 Neustarts.
- **`/gesund`:** intern 200; von außen `https://app.centric-dienstplanung.de/gesund` 200
  (über Caddy, 31.70.142.71).
- **Startseite:** 200 mit dem neuen Bundle `index-DOWrrTP_.js`.
- **Logs:** nur Start- und Löschlauf-Zeilen, keine Fehler.
- **Unverändert:** Netz `proxy` (gleiche IP), keine Ports, Benutzer, read-only, `cap_drop`,
  `no-new-privileges`, Speichergrenze, Mount, `tmpfs`, Restart-Policy.
- Caddy (gestartet 2026-09-14, 0 Neustarts) und DNS unverändert.

## G. Registrierung aus

- `CENTRIC_PUBLIC_REGISTRATION` weder in `.env` noch im Container gesetzt.
- `POST /api/registrierung`, `…/verifizieren` und `…/passwort` liefern:
  - **von außen über Caddy:** 404 `nicht-verfuegbar`;
  - **intern, mit und ohne Origin:** ebenfalls 404, ohne Rumpfinhalte in der Antwort.
- Dateiabdruck vor/nach allen Aufrufen (50 Dateien) unverändert:
  - keine neue oder geänderte Datei;
  - kein `account:`, kein `token:`, kein Zählerstand, kein Protokolleintrag;
  - keine neue Logzeile;
  - kein Mailversand möglich.

## H. Auth / Legacy

Mit einem temporären, pseudonymen Smoke-Betrieb (zwei Räume, zwei Konten, zwei Codes, ein
Verwalter), angelegt über die Produktwege:

| Prüfung | Ergebnis |
|---|---|
| Zugangscode-Anmeldung (Production-Pfeffer) + lesen | 200/200 |
| ungültiger Code | 401 |
| Verwalter-Zugang `GET /einrichten/umgebung` | gültiger Schlüssel 200, falscher 401 |
| bestehende Verwalter | weiter lesbar |
| `/api/account/anmelden` ohne Konto | 401 |
| Konto-Anmeldung, Betrieb öffnen, lesen | 200 |
| Logout → Sitzung | 401 (siehe I/F1) |

## I. F1 / F3 / R1 / F4

| | Ergebnis |
|---|---|
| F1 | Nach Logout 401 auf `/api/bestand`, allen fünf frühen Pfaden, Kalender und Kontositzung; `as:`/`t:` entfernt; zweites Gerät gültig |
| F3 | unbekanntes Merkmal 401 auf allen geschützten Pfaden |
| R1 | Nach über 60 s Aktivität: `as:`/`t:` unverändert, `az:` geschrieben, `t:` mit Herkunft; ein spätes `az:` nach Logout belebt nichts |
| F4 | Code-Sitzung: `t:` unverändert, `ta:` geschrieben, ohne Herkunft; nach Sperren des (Smoke-)Codes 401, ein spätes `ta:` belebt nichts, Neuanmeldung abgewiesen |
| Mandantentrennung | B öffnen 403; Lesen mit `?bestand=B` bleibt in A; `zugaenge`/`raum-loeschen` für B 403; Export ohne B; fremder Kalender-Verweis 404; B bit-gleich |

## J. Datenintegrität

- **Persistenter Kern** (9 Codes, 2 Verwalter, Selbststarts): vor und nach dem Deploy sowie
  nach allen Prüfungen **byte-gleich**.
- **Hauptspeicher `centric`:** Nach dem Abbau des Smoke-Betriebs schlüssel- und inhaltsgleich
  mit dem Stand vor dem Smoke.
- **Sitzungen und Takt** haben sich nach Design verändert (Aufräumlauf, siehe L).
- **Das Audit-Protokoll** `centric-spur` ist um die Einträge der Prüfungen gewachsen und bleibt
  so.

## K. Funktions-Smoke

**API (Smoke-Betrieb):**
- Kalender: gültig 200, ICS mit Umlauten, 24:00 → 00:00 des Folgetags.
- Kalender: ungültiger Termin 400, eingeschleuster Zeilenumbruch 400.
- Feed abgeschaltet.
- Zeiterfassung: Stempeln Start/Ende, die Leitung sieht die Erfassung; Vollausgabe für
  Mitarbeiter 403.

**Oberfläche:**
- Startseite 200, `text/html; charset=utf-8`.
- Alle Assets 200 (JS, CSS, Icons), Manifest 200, Service Worker 200.
- Der Baumhash von `dist/` im Production-Container ist identisch mit Staging (`87e33de6…`). Dort
  hat dasselbe Image (gleicher Digest) die vollständige Browserprüfung bestanden:
  - Ansichten: Monatsplan, Jahresansicht, Personal, Qualifikationen, Anträge, Tauschbörse,
    Zeiterfassung, Mobil;
  - Person hinzufügen.

**Abweichung:** Die Browser-Automation war während des Production-Smokes nicht verbunden. Ein
Klicktest im Browser gegen Production fand deshalb nicht statt. Empfohlen: kurzer manueller
Blick des Betreibers mit einem eigenen Code.

**Smoke-Daten:** vollständig entfernt — die Räume über `raumLoeschen`, dazu Konten, Verwalter
und Zählfenster einzeln. Ein verwaistes `ta:` aus dem F4-Test wurde nach Prüfung einzeln
entfernt.

## L. Aufräumlauf

- **Lauf:** `01:01:55Z`, eine Minute nach dem Start; 0 Fehler, kein Abbruch, nichts übersprungen.
- **Gelöscht:**
  - 5 `t:`: die Zugangscode-Sitzungen vom 14./15.09.; ihr absolutes Ende lag 624–626 h zurück;
  - 98 alte Zählfenster.
- **Erhalten:** 9 Codes, 2 Verwalter. Keine gültige Sitzung ging verloren.

## M. Sicherung nach dem Deploy

`/opt/apps/centric-dienstplanung/sicherungen/centric-sicherung-20261011T010812Z`, erstellt
`2026-10-11T01:08:12Z` mit dem neuen Image:

- `pruefen`: **„In Ordnung: 75 Dateien“**;
- 78 Dateien insgesamt, 35 086 B;
- Baumhash `d8bc785c0b5726b82852b826a36c5bcf5b19540a5299d34d9bcd51b0a28df7aa`;
- extern abgelegt unter `C:\Users\RR\centric-sicherungen\production\`, byte-gleich.

## N. Rollback nötig?

**Nein.** Alle GO-Kriterien sind grün:

- Health;
- Auth;
- Registrierung aus;
- F1/F3/R1/F4;
- Mandantentrennung;
- Datenintegrität;
- Funktions-Smoke;
- Aufräumlauf;
- Sicherung.

Der Rückweg bleibt vorbereitet: Anker-Tag, Rohkopie, Sicherungen, Compose-/`.env`-Kopien und
Ablauf V des Plans.

## O. Production-Image nach Abschluss

`centric-dp-web` = `sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79`
(`64d08a4`), `IMAGE_TAG` per Digest festgenagelt.

## P. Offene Risiken

1. **Kein Klicktest im Browser gegen Production** (Automation nicht verbunden). Das Bundle ist
   byte-gleich mit dem auf Staging vollständig geprüften.
2. **Bestehende Codes und Verwalter nur indirekt geprüft** (keine Klartexte verwendet).
   Empfohlen: eine echte Anmeldung durch den Betreiber.
3. **`latest` in GHCR** zeigt auf `f03a8514…`; lokal zeigt `latest` weiterhin auf `0861adee…`
   (das alte Image). Production ist per Digest festgenagelt und hängt von keinem der beiden ab.
4. **Sicherungsdisziplin:** Production hat jetzt eine Sicherungsablage. Eine regelmäßige
   Sicherung außer Haus ist noch einzurichten (BEREITSTELLUNG 5.3/5.4).
5. **Aufgehobene Dateien** (bewusst, nicht löschen): `data.vor-rc-20261011T005932Z`, beide
   Sicherungen, Compose-/`.env`-/inspect-Kopien, Anker-Tag.

## Q. Monitoringplan und Messpunkte

| Zeitpunkt | Ergebnis |
|---|---|
| T+0 (01:01:01Z) | healthy, `/gesund` 200 intern und extern |
| T+8 (01:09:02Z) | healthy, 0 Neustarts, Log 4 Zeilen / 0 Fehler, konto 9, verwalter 2, account/token 0, Sitzungen 0, Protokoll-Fehler 0, `/gesund` extern 200, Registrierung 404, 224 GB frei |
| T+15 (01:16:22Z) | healthy, 0 Neustarts, Log 4 Zeilen / 0 Fehler, konto 9, verwalter 2, account/token 0, Sitzungen 0, Protokoll-Fehler 0, `/gesund` extern 200, Registrierung 404 — unverändert |
| T+30 (01:31:26Z) | healthy, 0 Neustarts, Log 4 Zeilen / 0 Fehler, konto 9, verwalter 2, account/token 0, Sitzungen 0, Protokoll-Fehler 0, `/gesund` extern 200, Registrierung 404 — unverändert |
| T+60 (02:01:07Z) | healthy, 0 Neustarts, Log 4 Zeilen / 0 Fehler, konto 9, verwalter 2, account/token 0, Sitzungen 0, Protokoll-Fehler 0, `/gesund` extern 200, Registrierung 404 — unverändert |
| T+24 h | **offen:** zweiter Aufräumlauf fehlerfrei; keine `account:`-Einträge; Sitzungs- und Takt-Dateien wachsen nicht unkontrolliert; Codes und Verwalter unverändert |
| T+7 d | **offen:** Rückblick; Rohkopie und Sicherungen bleiben stehen |

Eine echte Login-Prüfung im Monitoring erfordert einen Code des Betreibers. Gemessen wurden
Health, Neustarts, Log-Fehler, Schlüsselzählungen, Protokoll-Fehler, Registrierung und
Speicherplatz.

---

**PRODUCTION DEPLOYMENT BESTANDEN**
