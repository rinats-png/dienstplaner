# Release-Automatisierung — Lückenanalyse (Stand 2026-11-20)

Betreiberauftrag 2026-11-20: schrittweises Produktionsdeployment einrichten. Stufe 1 (REL-1): Lücken bestimmen,
Release-Gates als Werkzeug, Release-Richtlinie. Basis: `origin/integration/release-v4` @ `014c86ab`.

**Nicht getan:** kein Zugriff auf VPS, Produktion oder SSH; kein Workflow gestartet; keine Secrets, Variablen oder
Umgebungen angelegt; keine Workflow-Datei geändert. Gelesen: Repository, `gh api` (nur GET).

Kennzeichnung wie im [Produktionsweg-Dokument](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md): **[belegt]** mit Datei:Zeile,
**[nicht belegt]** nur auf dem VPS feststellbar. Aufwand ist eine **SCHÄTZUNG** in Personentagen (PT) für Claude;
Betreiberhandlungen sind getrennt genannt (Nummern B-x, V-x aus dem Produktionsweg-Dokument §2).

## 1. Übersicht

| Nr | Anforderung | Stand | Paket | Aufwand Claude | Betreiber |
|---|---|---|---|---|---|
| 1 | Reproduzierbare, unveränderliche Release-Bilder mit Digest | teilweise | REL-2, REL-3 | 0,5–1 PT | — |
| 2 | Automatische Release-Gates | teilweise → Werkzeug da (REL-1) | REL-1 ✓, REL-2 | 0,5–1 PT (Workflow) | Freigabedatei |
| 3 | Ausschluss unfertiger Funktionen | teilweise → G3 (REL-1) | REL-1 ✓ | 0,25 PT | V-6 |
| 4 | Sicherung vor jedem Deployment | vorhanden (Code), VPS nicht belegt | — | — | B-7, B-8 |
| 5 | Nachweisbare Wiederherstellung | teilweise (nur CI) | REL-3 | 0,5 PT (Begleitung) | B-8, B-11 |
| 6 | Sichere Behandlung von Datenmigrationen | teilweise → G5 (REL-1) | REL-3 | 1–2 PT | Freigabe je Release, B-11 (K4) |
| 7 | Schutz vor parallelen Deployments | teilweise | REL-2 | 0,25–0,5 PT | — |
| 8 | Automatische Smoke-Tests nach Deployment | teilweise | REL-2 | 0,5 PT | — |
| 9 | Überwachung der wichtigsten Funktionen | teilweise | REL-4 | 0,5 PT | E-8 |
| 10 | Fehlerbehandlung und sicherer Rückweg | teilweise | REL-3, REL-4 | 0,5 PT | O-1, O-2, E-14 |
| 11 | Gruppierung kompatibler Änderungen zu Release-Paketen | fehlte → Richtlinie (REL-1) | REL-1 ✓ | — | Kadenz bestätigen |

Kurz: Das Deploy-Skript ist stark, der Weg davor und danach ist schwach. Es fehlen ein Bild aus `main`, belegte
Sicherungen auf dem VPS, eine Freigabe je Release und eine Prüfung vor dem Job `vps`.

## 2. Einzelbefunde

### 2.1 Reproduzierbare, unveränderliche Bilder (teilweise)

- **vorhanden:** Compose nimmt nur einen Digest (`deploy/compose.yml:27`), zieht nie selbst (`:30`). Basisbild per
  Digest gepinnt (`Dockerfile:37`, `:54`, `:60`), `npm ci` aus Lockfile (`Dockerfile:41`, `:57`). Revisionslabel aus
  `metadata-action` (`.github/workflows/deploy.yml:113-115`, `:173-175`). Bau nur nach `pruefung` und `sicherheit`
  (`deploy.yml:74-78`, `:84`).
- **Lücken:**
  - L1.1 Der Job `bild` baut von **jedem** Branch (`deploy.yml:85`: nur `inputs.bauen`). Belegt: rc-Bilder aus
    `rc-2026-11-04/05` (Produktionsweg §1.1).
  - L1.2 Provenienz und SBOM sind nicht ausdrücklich gesetzt; die Vorgabe von buildx gilt. Das `aktiv`-Bild
    `274bfa0` hat **kein** Revisionslabel (Produktionsweg §1.1 Befund 3).
  - L1.3 Tag `latest` wird weiter geschrieben (`deploy.yml:105`), obwohl Compose es nicht mehr liest.
  - L1.4 Bit-genaue Reproduzierbarkeit ist nicht belegt (Zeitstempel im Bild, `cache-from: type=gha`). Für die
    Sicherheit reicht der Digest als unveränderliche Kennung; Reproduzierbarkeit bleibt ein Ziel, kein Gate.
  - L1.5 Kein Bild aus `integration/release-v4` oder aus dem heutigen `main` (Produktionsweg §1.1 Befund 1).
- **Neu:** G4 prüft Label **und** Provenienz gegen den Kandidaten-Commit.

### 2.2 Automatische Release-Gates (teilweise → REL-1)

- **vorhanden:** Volle CI als wiederverwendete Workflows vor `bild` und `vps` (`deploy.yml:74-78`, `:201`).
  `deploy.sh` prüft Liste, Sperre, Status, Bild-ID und Label (`deploy/deploy.sh:153-163`, `:199-203`;
  `deploy/digest-pruefen.sh:72-81`, `:110-118`).
- **Lücken (vor REL-1):** Keine Prüfung, dass der ausgelieferte Digest zu einem Commit mit grüner CI gehört (`vps`
  liefert einen beliebigen gelisteten Digest aus, `deploy.yml:185-188`). Kein Review-, SSOT- oder Befund-Gate. Keine
  Freigabe je Release (nur die Umgebung `produktion`, die noch fehlt: Produktionsweg §1.5).
- **Neu:** `werkzeug/release-pruefung.mjs` mit G1–G10. **Offen (REL-2):** Einbau als Job vor `vps`
  ([RELEASE-PROZESS.md](RELEASE-PROZESS.md) Anhang A.2).

### 2.3 Ausschluss unfertiger Funktionen (teilweise → REL-1)

- **vorhanden:** Schalter mit Vorgabe AUS, nur genau `true` schaltet ein (`server/lib/schalter.mjs:20-21`, `:36`,
  `:52`, `:67`, `:81-84`). Vorlage auskommentiert (`.env.example:127`, `:138`, `:145`, `:153`, `:172`). Tests je
  Schalter (z. B. `pruefung:import-schalter`).
- **Lücken (vor REL-1):** Keine Liste unfertiger Funktionen; keine Prüfung über alle Vorlagen. Push und Mail hängen
  nicht an einem Schalter, sondern an gesetzten Schlüsseln (`VAPID_*`, `RESEND_API_KEY`, `CENTRIC_SMTP_*`).
- **Neu:** [RELEASE-UNFERTIG.json](RELEASE-UNFERTIG.json) und G3 (Vorlagen `.env.example`, `deploy/compose.yml`,
  `Dockerfile`, Staging-Vorlagen; Oberflächenkonstante `IMPORT_DATEI_AKTIV`). Heute GO.
- **Rest:** Die echte Produktions-`.env` prüft G3 nicht (liegt nur auf dem VPS). Vorschlag REL-3: Betreiber liefert die
  **Schlüsselnamen** nach V-6; ein Zusatz prüft sie gegen die Liste. Werte bleiben auf dem VPS.

### 2.4 Sicherung vor jedem Deployment (Code vorhanden, VPS nicht belegt)

- **vorhanden:** `deploy.sh` hält den Dienst an, sichert mit dem Werkzeug des neuen Bilds, prüft die Sicherung und
  bricht sonst vor dem Wechsel ab (`deploy/deploy.sh:361-378`). Platzprüfung (`:233-262`, `:433-445`). Aufbewahrung mit
  geschützter letzter erfolgreicher Sicherung (`:380-431`). Getestet in `pruefungen/deploy-automatik.test.js`.
- **Lücken:** `deploy.sh` lief nie auf dem VPS (Produktionsweg §1.1 Befund 5). Sicherung außer Haus ohne Speicherziel
  (B-7). Die Sicherung aus Schritt 4 bleibt auf demselben Host.
- **Betreiber:** B-7 (Speicherziele), B-8 (Sicherung vor dem ersten Wechsel, Restore auf Kopie).

### 2.5 Nachweisbare Wiederherstellung (teilweise)

- **vorhanden:** `deploy/sicherung/wiederherstellung-probe.sh` schreibt `probe-status.json` (`:67`);
  Widerrufbuch-Probe (`deploy/sicherung/widerrufbuch-probe.sh:110`). CI Ende-zu-Ende in `betrieb-sicherung.yml`.
- **Lücke:** Kein Restore auf echten Daten belegt (Produktionsweg §1.4). Kein Nachweis gelangt bisher in den
  Release-Ablauf.
- **Neu:** G6 verlangt die drei Statusdateien, jünger als 26 h bzw. 35 Tage, `ergebnis` `ok`, `abweichend` und
  `fehlend` 0.

### 2.6 Datenmigrationen (teilweise → G5)

- **vorhanden:** Es gibt kein Migrationsgerüst; Änderungen laufen beim Start (W-1…W-9, Produktionsweg §3.2).
  `deploy.sh` verweigert einen Rücksprung, sobald das neue Bild geschrieben hat (`deploy/deploy.sh:315-319`,
  `:329-331`). Manifestabgleich nach dem Start (`:505-519`). Einzelprobe `deploy/migrationsprobe-lokal.mjs:1-4` (von
  Hand, Wegwerfkopie).
- **Lücken:** Keine Versionsnummer des Datenstands; keine Liste, die mit dem Code mitwächst; ein neuer
  Startschreibvorgang fiele nur im Review auf.
- **Neu:** G5 vergleicht die Quellen von W-1…W-9 und `server.mjs` mit dem vorigen Release und erzeugt einen
  Migrationsbericht; geändert ⇒ NO-GO bis Betreiberfreigabe. **Grenze:** G5 erkennt Änderungen an **Dateien**, nicht
  an Semantik. Ein neuer Startschreibvorgang in einer anderen Datei bleibt unerkannt, außer im `server.mjs`-Startblock.
  REL-3: Test, der die Startschreibvorgänge im Code inventarisiert und gegen die Liste in der Konfiguration hält
  (1–2 PT), plus Probe K4 (B-11).

### 2.7 Parallele Deployments (teilweise)

- **vorhanden:** `flock` auf `.deploy.lock` (`deploy/deploy.sh:143-151`); Concurrency-Gruppe `produktion` im Job `vps`
  (`deploy.yml:209-211`).
- **Lücken:** `deploy/ruecksprung.sh` und `deploy/abschalten.sh` nehmen keine Sperre — ein Aufruf von Hand während
  `deploy.sh` läuft, wird nicht verhindert. Job `bild` ohne Concurrency (zwei Läufe schreiben `latest`).
- **Vorschlag:** RELEASE-PROZESS Anhang A.1 (REL-2).

### 2.8 Smoke-Tests nach dem Deployment (teilweise)

- **vorhanden:** healthy-Warten, Bild-ID-Abgleich, Smoke im Container, Log-Prüfung, Manifestabgleich
  (`deploy/deploy.sh:474-519`; Inhalt `deploy/deploy-smoke.mjs:8-16`).
- **Lücken:** Smoke nur im Container, nicht über Caddy, TLS und Domain. Keine angemeldete Probe (bewusst: keine
  Zugangsdaten im Smoke). Kein Ergebnis im Workflow sichtbar.
- **Vorschlag:** Anhang A.3 (REL-2); angemeldete Probe mit eigenem Testbetrieb erst in REL-4.

### 2.9 Überwachung (teilweise)

- **vorhanden:** `/gesund` mit Prüfungen und Alarm über Webhook, Vorgabe aus (`server/lib/gesund.mjs:317-334`);
  externer Check nur dokumentiert (`docs/BETRIEB-UEBERWACHUNG.md:119-134`).
- **Lücken:** Kein Alarmkanal, kein externer Uptime-Check eingerichtet (E-8). Keine Beobachtungsliste je Release.
- **REL-4:** Beobachtungsplan 24 h, Alarm-Einrichtung begleiten, Live-Abnahme-Vermerk als Vorlage.

### 2.10 Fehlerbehandlung und Rückweg (teilweise)

- **vorhanden:** R0 (`deploy/deploy.sh:288-295`), Wiederanlauf vor dem Wechsel (`:297-311`), Rücksprung nur auf
  `vorherig` (`:321-344`; `deploy/ruecksprung.sh:64-68`), feste Sperrliste (`deploy/freigabe-lib.sh:29-32`).
  Entscheidungsbaum mit Zeitgrenzen (Produktionsweg §3.6).
- **Lücken:** Keine Zeile `vorherig` (`deploy/FREIGEGEBENE-IMAGES.md:41-43`); erster Wechsel nur R0 oder
  Vorwärts-Reparatur. Rücksprung-Übung A→B→A nie gelaufen (E-14). O-1/O-2 offen.
- **Neu:** G7 verlangt eine dokumentierte Strategie; ohne `vorherig` die Entscheidungen O-1 und O-2.

### 2.11 Gruppierung zu Release-Paketen (fehlte → Richtlinie)

- **vorher:** Keine Regel. `main` und `integration/release-v4` sind auseinandergelaufen (Produktionsweg Kopf).
- **Neu:** [RELEASE-PROZESS.md](RELEASE-PROZESS.md) §2 (Kriterien, Kadenz-Vorschlag). Das Werkzeug gibt das Paket aus
  (`paket.prs`: PRs zwischen vorigem Release und Kandidat, aus Merge-Commits).

## 3. Probelauf des Werkzeugs gegen den heutigen Stand

Lauf am 2026-11-20 (online: `git` lokal, `gh api` nur GET). Kandidat `origin/integration/release-v4` @ `014c86ab`,
Basis `274bfa0` (Zeile `aktiv`), Platzhalter-Digest, ohne Bildangaben, ohne Nachweise, ohne Freigabedatei.
Ergebnis: **NO-GO** (erwartet).

| Gate | Ergebnis | Grund |
|---|---|---|
| G1 | GO | alle 11 Pflicht-Check-Runs `success` auf `014c86ab` |
| G2 | NO-GO | 339 PRs im Paket. 314 ohne Beleg aus GitHub-Review, `REVIEW-NACHWEIS*.md` oder PR-Text. Mit der Zusatzquelle „SSOT-Paket reviewt = true“ (nach dem Lauf ergänzt, offline gegen dieselbe PR-Liste gerechnet) bleiben **202** |
| G3 | GO | keine Vorlage schaltet einen Schalter oder eine unfertige Funktion ein |
| G4 | NO-GO | keine Bildangaben, Digest nicht in der Liste (erwartet: kein Bild aus `main`) |
| G5 | NO-GO | W-1…W-9 und Startblock seit `274bfa0` geändert → Migrationsfreigabe nötig |
| G6 | NO-GO | keine Sicherungs- und Probe-Nachweise |
| G7, G10 | NO-GO | keine Freigabedatei |
| G8 | NO-GO | 13 P0/P1-Pakete nicht fertig, aber mit PR im Paket (u. a. WP-16, WP-16c, WP-48, WP-19, WP-21, WP-14c) |
| G9 | NO-GO | offene P1-Befunde WP-14c, WP-07b, ABN-A2, ABN-S2, V4-2b |

**Befund G2:** Für ältere PRs (vor etwa #377) gibt es keinen maschinenlesbaren Review-Beleg. Zwei Wege: (a) der
Betreiber bestätigt die Liste in `reviewBestaetigt`; (b) Claude legt einen Nachtrag `REVIEW-NACHWEIS-NACHTRAG.md` mit
belegten Reviews an (Quelle: Nachweisdateien je Paket). Weg (b) ist ehrlicher, aber nur, soweit Belege existieren.
**Befund G8:** Das Paket enthält Code unfertiger P0/P1-Pakete. Ein Release braucht für jedes davon eine Annahme mit
Grund in `akzeptiertePakete` (z. B. „hinter Schalter AUS“) oder den Abschluss des Pakets.

## 4. Konkret fehlende Betreiberhandlungen für den ersten Release

In der Reihenfolge des Ablaufs. Einzelheiten im Produktionsweg-Dokument §2.

1. **B-4 (dringend):** Schreib-Deploy-Key des Produktionsservers klären (`main` ungeschützt).
2. **Branch-Schutz `main`** ([BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md)).
3. **B-1:** V-1…V-9 auf dem VPS, nur lesend; Ergebnis melden.
4. **B-7:** Speicherziele für restic wählen; Sicherung außer Haus einrichten (liefert `letzte-erfolgreiche.json`).
5. **B-8, B-11:** Sicherung von Hand und Restore-Probe K0–K11 auf einer Kopie (liefert `probe-status.json`,
   `widerrufbuch-probe-status.json`; K4 belegt den Migrationsbericht G5).
6. **B-12:** Entscheidungen O-1 bis O-7; für REL-1 nötig: O-1, O-2 (G7), Kadenz (RELEASE-PROZESS §2).
7. **B-3, B-5:** Umgebung `produktion` mit Prüfer, Werte nur dort (erst für den zweiten Wechsel über `deploy.yml`).
8. **Migrationsfreigabe** und **Freigabedatei** `docs/acc45/releases/<id>.freigabe.json` commiten (RELEASE-PROZESS §5).
9. **Merge-Freigabe nach `main`** für den Kandidaten (B-9) — Voraussetzung für das Bild (REL-3).
