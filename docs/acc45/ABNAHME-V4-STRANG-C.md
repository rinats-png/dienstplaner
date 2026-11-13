# Abnahme V4 — Strang C: Sicherung, Fehlerzustände, Module, KI und Import aus

> **Art des Nachweises: lokale Integrationsabnahme.** Alles hier lief auf einem Windows-Entwicklungsrechner gegen
> echte, lokal gestartete Serverprozesse (`node server.mjs`) mit Wegwerf-Ablagen und ausschließlich synthetischen
> Daten. Das ist **keine vollständige Staging-Abnahme**: kein Docker-Bild, kein Caddy/TLS, keine Staging-Umgebung,
> kein VPS. Was nur dort nachweisbar ist, steht im Abschnitt „Nur in produktionsähnlichem Staging nachweisbar“.

| | |
|---|---|
| Auftrag | Betreiberauftrag 2026-11-13 „Vollständige Staging- und Release-Abnahme“, Strang C = Bereiche 12, 13, 15, 16 |
| Geprüfter Stand | `integration/release-v4` @ `0638c10185c0171da3cc1d2ae4a2195adf9c42f4` (Merge #270) bei Beginn. Bis zum Ende rückte die Integration auf `ca45a0a2` vor (#271 WP-48-GB Öffnen, #272 Rollenauswahl; nur Oberfläche, `package.json`-Kette, Workflow) — die Läufe hier gelten für `0638c101`; der Zweig `feature/abnahme-v4-strang-c` ist danach mit `ca45a0a2` zusammengeführt (Kette: `wp48-gb-oeffnen`, `abnahme-c`, `wcag-wp40`, `sammelpruefung` zuletzt) |
| CI auf demselben Commit | „Prüfung“ Lauf 43392304855 **success** (Jobs `pruefen`, `browser-abnahme`; darin „Bild bauen (lokal, für die Prüfung)“, „Container starten“, „Gate-Proben im Bild“, „Rückweg-Werkzeuge im Bild“ grün); „Betrieb: Deploy-Skripte“ 43392304782 success; „Sicherheit“ 43392304615 success; „Lieferkette“ 43392304696 success |
| Umgebung | Windows 11, Git Bash, Node wie `package.json`; Docker **nicht installiert**; andere Prüfstränge liefen zeitgleich auf demselben Rechner (Last → Zeitüberschreitungen, siehe unten) |
| Grenzen | kein Merge, keine Produktion, kein VPS/SSH, keine Freischaltung gesperrter Funktionen, keine Änderung an Rechten/Branch-Schutz; keine Prüfung abgeschwächt |
| Bewertung | **bestanden** / **nicht bestanden** / **nicht ausführbar (Grund)**. Fehlende Prüfung zählt nie als Erfolg. Befundklassen P0 (Sicherheit/Datenschutz/Datenverlust) · P1 (releasekritisch) · P2 (Umgehung nötig) · P3 (gering) |

## 0. Neue Prüfungen dieses Strangs

| Datei | Was sie zusätzlich zu den vorhandenen Prüfungen belegt |
|---|---|
| `pruefungen/abnahme-c-absturz.test.js` | Echter Prozess, **SIGKILL mitten in laufenden Schreibvorgängen** (4 Runden), Neustart auf derselben Ablage, Übernahme der verwaisten Prozesssperre, Sitzung bleibt gültig, kein Mischstand, **keine bestätigte (200) Schreibung verloren**, `ablage-pruefen.mjs` sauber; abgebrochene Anfrage (halber Rumpf); sichere Wiederholung eines PUT; Sicherung → Schaden → 503 → beschädigte Sicherung abgelehnt → anderer Pfeffer abgelehnt → Wiederherstellung **byteweise** (leeres Ziel und `--ersetzen`); SIGTERM (nur Linux) |
| `pruefungen/abnahme-c-module.test.js` | Echter Handler `PUT /api/bestand` mit echten Sitzungen für **Leitung, Kundenrolle, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat** × fünf Manipulationen (alle Module an samt Bestätigung; alle Pakete + `status: freigegeben`; Datenfelder aller Module; Prototyp-/Schreibweisen-Kennungen als roher JSON-Text; Serverfelder). Ein gespeicherter Schalter „an“ mit allen Paketen macht trotzdem nichts wirksam |
| `pruefungen/abnahme-c-schalter.test.js` | Echter Server mit `NODE_ENV=production`: **Vorgabe gegen elf Verstümmelungen** (`1`, `TRUE`, ` true`, `true `, `yes`, `on`, `AN`, `True`, `SUCHE`, ` suche`, `An `) aller Schalter zugleich — jede Probe Wort für Wort wie die Vorgabe; **Gegenprobe** mit den dokumentierten Werten (Proben sind empfindlich); **Netzwache** (`--import`, meldet und blockiert jede Verbindung nach außen; Selbstprobe); statischer Importgraph ohne Gateway-Modul; Sicherheitsköpfe, `/gesund`, keine Debug-/KI-Wege, keine Geheimnisse im Startprotokoll, Startverweigerung bei ungültiger `CENTRIC_VERTRAUTE_PROXYS` |

Verdrahtung: Skript `pruefung:abnahme-c` (in der Kette `pruefung` vor `pruefung:wcag-wp40`, `pruefung:sammelpruefung` bleibt
letztes Glied) und Schritt „Abnahme V4 Strang C …“ in `.github/workflows/pruefung.yml` nach „Integrationsabnahme Kette A + B“.
`node werkzeug/ci-abdeckung.mjs` ok (166 Skripte), `node werkzeug/verdrahtung-pruefen.mjs` ok (377 Prüfdateien),
`node werkzeug/sammelpruefung.mjs --trocken` ok (166 Glieder), `npx vitest run pruefungen/ci-abdeckung.test.js
pruefungen/sammelpruefung.test.js` grün, `pruefungen/verdrahtung.test.js` grün (mit `--testTimeout=120000`; mit
Vorgabe 5 s unter Fremdlast einmal Zeitüberschreitung), `eslint` auf den neuen Dateien 0 Befunde, `npm run pruefung:typen` Exit 0.

### Rot bei Defekt (lokale Mutation, nie committet; in einem getrennten, danach entfernten Wegwerf-Arbeitsbaum)

| Mutation | Erwartet | Ergebnis |
|---|---|---|
| `server/lib/schalter.mjs`: `importAn` normalisiert (`trim().toLowerCase() === "true"`) | `abnahme-c-schalter` rot | **rot**: „import/upload LT bei "TRUE": status 201 statt 404“ |
| `server/lib/branchenmodule.mjs`: Vorgabestatus `geplant` → `vorlaeufig` | `abnahme-c-module` rot | **rot**: Registry-Test, M1 (Zustand `nicht-gebucht` statt `in-vorbereitung`), gespeicherter Schalter (`posten` wirkt) |
| `werkzeug/ablage-sicherung.mjs`: Wiederherstellung setzt Store `centric` nicht ein | `abnahme-c-absturz` rot | **rot**: byteweiser Vergleich 18 statt 33 Dateien (leeres Ziel und `--ersetzen`) |
| dieselbe Stelle, aber nur Store `centric-sitzungen` ausgelassen | — | **blieb grün** (die Testablage hat keine `sk:`-Einträge; Restrisiko R-C3) |

## 1. Ergebnisse je Bereich

Befehl je Zeile, wenn nicht anders vermerkt: `npx vitest run pruefungen/<datei> --testTimeout=120000`, **jede Datei
einzeln**, Commit `0638c101` (neue Dateien: Zweig `feature/abnahme-v4-strang-c` auf `0638c101`). „Einzellauf“ = nach
einer Zeitüberschreitung unter Fremdlast noch einmal allein gestartet; beide Ergebnisse sind genannt.

### Bereich 12 — Datensicherung, Wiederherstellung, Rücksprung

| Prüfung | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|
| `abnahme-c-absturz.test.js` Teil 4 (neu) | **bestanden** (Datei 11/11, 1 übersprungen = SIGTERM unter Windows) | `abnahme-c-absturz.test.js:254–341` | — | R-C3 |
| `sicherungen.test.js` | **bestanden** 33/33 | In-App-Sicherung/Wiederherstellen nur eigener Betrieb | — | Vorbehalt In-App-Wiederherstellen (Rollback-Nachweis 2) |
| `wiederherstellung-schutz.test.js` | **bestanden** 9/9 | | — | |
| `wiederherstellen-ui.test.js` | **bestanden** 21/21 | | — | |
| `wiederherstellung-neu.test.js` | **bestanden** 16/16 | | — | |
| `sicherungsschluessel-wiederherstellung.test.js` | **bestanden** 27/27 (+2 übersprungen) im Einzellauf; unter Fremdlast zweimal 1 Zeitüberschreitung (60 s, W4) | | — | |
| `ablage-pruefen.test.js` | **bestanden** 8/8 | | — | |
| `ablage-pruefen-rueckweg.test.js` | **bestanden** 23/23 (+1) im Einzellauf; unter Fremdlast zweimal 3 Zeitüberschreitungen | | — | |
| `ablage-pruefen-matrix.test.js` | **bestanden** 140/140 (981 s) | | — | |
| `wp28b-sicherung-enoent.test.js` | **bestanden** 4/4 | | — | R-C5 |
| `dockerignore-copy.test.js`, `auslieferung.test.js` | **bestanden** 19/19, 4/4 | Bild enthält nur Betriebsdateien | — | |
| `sicherung-ablage.test.js` | **nicht bestanden (lokal)** 13/14 in drei Läufen, jedes Mal derselbe Fall „meldet eine Quelle, die sich beim Sichern ändert …“: Zeitüberschreitung 60 s (bekannter Windows-Zeitbefund laut Auftrag); in CI 43392304855 grün | | kein Produktbefund | Fall lokal unbelegt |
| `ablage.test.js` | **nicht bestanden (lokal, Windows)** 21/24: Dateimodus 0600 (Windows meldet 0666), `EPERM` bei `rename` über eine gerade gelesene Datei; Linux-Semantik, in CI grün | | C-3 | Windows ist keine Zielplattform |
| Rücksprung/Compose | siehe „Rollback-Nachweis“ | | | |

### Bereich 13 — Fehlerzustände, Verbindungsabbrüche, Wiederanlauf

| Prüfung | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|
| `abnahme-c-absturz.test.js` Teile 1–3 (neu): 4× SIGKILL mitten im Schreiben, Wiederanlauf, Sperrübernahme, Sitzung bleibt, kein Mischstand, nichts Bestätigtes verloren; halber Rumpf; sichere Wiederholung | **bestanden** | `abnahme-c-absturz.test.js:156–252` | — | R-C4 |
| `abnahme-c-absturz.test.js` Teil 5: SIGTERM | **nicht ausführbar** (Windows stellt das Signal nicht zu; `kill("SIGTERM")` beendet hart) — läuft in CI/Linux | `:343` | — | R-C2 |
| `server.test.js` | 17/18; „hört auf SIGTERM sauber auf“ **nicht ausführbar unter Windows** (gleicher Grund); CI grün | | C-3 | R-C2 |
| `atomar.test.js` | **bestanden** 2/2 | | — | |
| `lesefehler.test.js` (beschädigte Datei → 503, nichts gelöscht) | **bestanden** 8/8 | | — | |
| `prozesssperre.test.js` | **bestanden** 7/7 | | — | |
| `schreibhalt.test.js` | **bestanden** 15/15 (+1) | | — | |
| `abnahme-409.test.js` (409 und unverändert zurück) | **bestanden** 5/5 | | — | |
| `journal-lesen.test.js`, `loeschsperre.test.js` | **bestanden** 8/8, 5/5 | | — | |
| `bremse-lokal.test.js` (Ratenbegrenzung) | **bestanden** 21/21 | | — | |
| `anmeldesperre.test.js` | **bestanden** 38/38 im Einzellauf; unter Fremdlast 2 Zeitüberschreitungen | | — | |
| `gesund.test.js` (Ablage nicht beschreibbar/Platz → kritisch/503) | **bestanden** 24/24 | | — | R-C5 |
| `sitzungsrennen.test.js` | **bestanden** 13/13 | | — | |

### Bereich 15 — Branchenmodule (WP-19) nur im freigegebenen Aktivierungsstatus

| Prüfung | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|
| `abnahme-c-module.test.js` (neu): 6 Rollen × M1–M5 über echten PUT, Prototyp-Kennungen, gespeicherter Schalter „an“ | **bestanden** 8/8 | `abnahme-c-module.test.js:139–212` | — | bei M5 (Serverfelder) antwortet der Server 200 und setzt die Felder still auf den gespeicherten Stand zurück — gewollt |
| `modulaktiv-allowlist.test.js` | **bestanden** 722/722 | | — | |
| `modul-rechte-wp19.test.js` | **bestanden** 54/54 | | — | |
| `branchenmodule.test.js`, `modul-integritaet-quer.test.js` | **bestanden** 25/25, 16/16 | | — | |

Alle zwölf Module stehen in der Registry auf „geplant“ (`server/lib/branchenmodule.mjs:156`, Test `abnahme-c-module.test.js:140`).

### Bereich 16 — deaktivierte KI- und Importfunktionen bleiben aus

| Prüfung | Ergebnis | Beleg | Befund | Restrisiko |
|---|---|---|---|---|
| `abnahme-c-schalter.test.js` (neu): Vorgabe vs. 11 Verstümmelungen, Gegenprobe, Netzwache, Importgraph, Köpfe, Startprotokoll, Startverweigerung | **bestanden** 21/21 | `abnahme-c-schalter.test.js:186–356` | C-2 | Netzwache prüft im Prozess, nicht auf Netzebene |
| `import-schalter.test.js` | **bestanden** 34/34 | | — | |
| `import-endpunkt.test.js` | **bestanden** 75/75 | | — | |
| `hilfe-assistent-i23-grenzen.test.js` | **bestanden** 6/6 | `hilfeGateway()` = null | — | |
| `intelligence-gateway-kern`, `-anbieter`, `intelligence-kostenschutz-i15`, `intelligence-leck` | **bestanden** 52, 20, 24, 77 | | — | |
| `routen-inventar.test.js` | **bestanden** 10/10 | | — | |
| `registrierung-schalter`, `selbststart-schalter`, `demo-schalter` | **bestanden** 14, 18, 19 | | — | |
| `herkunft-xff.test.js`, `betreiber-zweifaktor-pflicht.test.js` | **bestanden** 10, 30 | | — | |
| Bau `npx vite build --outDir <scratch>` und Suche im Ergebnis | **bestanden**: Exit 0; 0 Treffer für `anthropic`, `api.openai`, `claude.ai`, `/api/ki`, `CENTRIC_KI`, `CENTRIC_IMPORT_AKTIV`, `CENTRIC_TEILSPEICHERUNG`, `CENTRIC_HILFE`, `x-api-key`, `sourceMappingURL`; `/api/import/upload` kommt im Bündel nicht vor (`IMPORT_DATEI_AKTIV = false`, `src/lib/import-schnittstelle.js:17`); externe Hosts nur Verweise (Gesetze, Tarif, w3.org) | | — | |
| Produktionsstart ohne `CENTRIC_PFEFFER` (Handprobe, Port 4103, Wegwerf-Ablage) | startet, `/gesund` ok, kein Hinweis im Log | | **C-1** | R-C1 |

Schaltersemantik (`server/lib/schalter.mjs`, durch die Tests bestätigt): `CENTRIC_IMPORT_AKTIV`,
`CENTRIC_TEILSPEICHERUNG`, `CENTRIC_DEMO`, `CENTRIC_PUBLIC_REGISTRATION`, `CENTRIC_SELBSTSTART` nur genau `true`;
`CENTRIC_HILFE_ASSISTENT` nur genau `suche` oder `an` (auch dann kein Modell: `modell.status = nicht_verfuegbar`);
`CENTRIC_KI_MODUS` liest kein Serverweg (Gateway nicht verdrahtet; Importgraph ohne `server/lib/intelligence/gateway/*`).

### Nicht ausgeführt (lokal) — zählt nicht als Erfolg

Wegen Laufzeit unter Fremdlast anderer Stränge auf demselben Rechner (`ablage-pruefen-matrix` allein 981 s) lokal
**nicht** gelaufen; Grundlage ist nur der CI-Lauf 43392304855 auf demselben Commit: `ablage-pruefen-matrix2`,
`wp28b-sicherung-last`, `schreibhalt-messung`, `schreibhalt-last`, `deploy-automatik`, `deploy-skripte` (Workflow
„Betrieb: Deploy-Skripte“), `datenintegritaet`, `sitzungen`, `stempel-429-client`, `bremse-wp47`, `modul-abnahme`,
`modul-b1-schreibweg`, `import-rumpfgrenze`, `import-sonden`, `hilfe-assistent-i23`, `import-ki-schnittstelle-imp9`,
`sicherheit-intern`.

### Zählung

| | Anzahl |
|---|---|
| bestanden (lokal) | 42 Dateien (davon 3 neu; 3 erst im Einzellauf) |
| nicht bestanden (lokal; Plattform/Zeit, in CI grün, kein Produktbefund) | 2 Dateien (`sicherung-ablage`, `ablage`) |
| nicht ausführbar | 2 Fälle SIGTERM unter Windows; Compose-Rücksprung, `ruecksprung.sh` echt, Bild mit Compose-Härtung, Caddy/TLS (Docker/VPS/Staging) |
| nicht ausgeführt (lokal) | 17 Dateien (oben) |

## Rollback-Nachweis

**Bewiesen (lokal oder in CI auf `0638c101`):**

1. *Sichern/Prüfen/Wiederherstellen der Ablage* (`werkzeug/ablage-sicherung.mjs`): byteweise Gleichheit aller
   gesicherten Dateien nach Wiederherstellung in ein leeres Ziel und mit `--ersetzen` über eine beschädigte Ablage;
   alter Inhalt wird beiseitegelegt, nicht gelöscht; beschädigte Sicherung und fremder Pfeffer werden abgelehnt, das
   Ziel bleibt unberührt; flüchtige Sitzungen (Klasse C) werden bewusst nicht zurückgespielt (alte Sitzung → 401);
   der Server startet auf der wiederhergestellten Ablage (`abnahme-c-absturz.test.js:254–341`, dazu
   `sicherung-ablage.test.js`, `ablage-pruefen*.test.js`).
2. *In-App-Wiederherstellen* (`POST /api/wiederherstellen`): nur Leitung, nur der eigene Betrieb, nur auf den zuletzt
   gesehenen Stand, vorher automatische Sicherung des jetzigen Stands (`sicherungen.test.js`, `wiederherstellen-ui`,
   `wiederherstellung-schutz`, `wiederherstellung-neu`). **Vorbehalt (fachlich, kein Befund):** Das Zurückspielen
   setzt den eigenen Betrieb auf den Stand der Sicherung zurück; seither Gespeichertes dieses Betriebs liegt danach nur
   noch in der Sicherung „vor Wiederherstellung“. Eine unlesbare Scherbe wird nicht übergangen (503; Rückweg ist
   `ablage-pruefen.mjs`, docs/BETRIEB-SICHERUNG.md).
3. *Bildbau und Container-Start* im CI-Job `pruefen` (Lauf 43392304855, Schritt „Bild bauen (lokal, für die Prüfung)“,
   „Container starten“, „Rückweg-Werkzeuge im Bild“ = `pruefungen/werkzeuge-im-bild.sh`): grün.
4. *Rücksprung-Skript* `deploy/ruecksprung.sh` (Ziel nur `vorherig`, kein `latest`, `--pull never`, `.env`-Sicherung,
   Verweigerung bei gesperrtem Ziel oder gesetztem `IMAGE_DIGEST` in der Shell, `--trocken`): `pruefungen/deploy-skripte.test.js`
   gegen einen Docker-Stub im Workflow „Betrieb: Deploy-Skripte“ (Lauf 43392304782 grün). Lokal **nicht ausgeführt**
   (Docker-Stub-Lauf ist Linux-/Bash-gebunden; CI-Ergebnis übernommen, nicht selbst erzeugt).
5. *Staging-Rückweg Kette B* (docs/STAGING-KETTE-B.md im Hauptarbeitsbaum, untracked): dort am 2026-11-02 belegt —
   Sicherung 477/477 Dateien bytegleich in leeres Ziel, Rückweg `cp compose.yml.vor-… compose.yml` +
   `docker compose rm -f -s` + `up -d --pull never` beschrieben, **nicht ausgelöst** („Rollback nötig: nein“).

**Nicht ausführbar in dieser Abnahme (Betreiberseite, Docker/VPS nötig):** tatsächlicher Compose-Rücksprung auf ein
vorheriges Bild; `ruecksprung.sh` gegen echtes Docker; Wiederherstellung im Container (`--read-only`, uid 1000) auf
einem Staging-Datenträger; restic-Sicherung außer Haus (Workflow „Betrieb Sicherung“ lief auf diesem Commit nicht,
letzter grüner Lauf 43391685313 auf einem PR-Zweig). Laut BEREITSTELLUNG.md 3.1 gibt es derzeit **keinen** Eintrag
`vorherig` in `FREIGEGEBENE-IMAGES.md` — im Fehlerfall gilt R0 (`abschalten.sh`).

## Nur in produktionsähnlichem Staging nachweisbar

| Punkt | Warum lokal nicht | Was dort zu prüfen ist |
|---|---|---|
| Docker-Bild im Betrieb: `read_only: true`, `user: "1000:1000"`, `tmpfs /tmp`, `cap_drop`, Healthcheck | kein Docker lokal; CI startet das Bild, aber nicht mit der Compose-Härtung des VPS | Container aus `deploy/compose.yml` mit Staging-`.env`: Start, `healthy`, Schreibversuch außerhalb `/data` scheitert, Prozess-UID 1000 |
| Caddy/TLS-Köpfe | lokal nur die Köpfe der Anwendung (geprüft) | HSTS, nosniff, CSP über Caddy; `X-Forwarded-For` nur vom Caddy-Netz (`CENTRIC_VERTRAUTE_PROXYS`); HTTP→HTTPS |
| Realistische Umgebung | lokal synthetische `.env` | Staging-`.env` ohne gesperrte Schalter (`CENTRIC_IMPORT_AKTIV`, `CENTRIC_TEILSPEICHERUNG`, `CENTRIC_HILFE_ASSISTENT`, `CENTRIC_DEMO`, `CENTRIC_PUBLIC_REGISTRATION`, `CENTRIC_SELBSTSTART` fehlen oder ≠ Einschaltwert), `CENTRIC_PFEFFER` gesetzt (R-C1) |
| SIGTERM durch Docker (`stop`, 10 s) | Windows kennt kein SIGTERM-Signal; Test läuft nur in CI/Linux | `docker compose stop` während Last: Exit 0, `.prozess` entfernt, kein halber Stand |
| Ausgehender Verkehr auf Netzebene | lokal per Vorlade-Wache im Prozess | Firewall/Egress-Log des Containers während eines Smoke-Laufs: keine Verbindung außer Mail/Push, falls konfiguriert |

### Sicheres Vorgehen für den Sicherungs-/Wiederherstellungs-/Rücksprung-Nachweis in isoliertem Staging

*Nur Staging, nie Production. Kein Schritt berührt `/opt/apps/centric-dienstplanung` der Produktion, deren `.env`,
Daten oder Pfeffer.*

**Vorher prüfen (Abbruch, wenn eines nicht stimmt):**
1. Host und Compose-Projekt sind das Staging-Projekt (`docker compose ls`, Dienstname `centric-staging-web`), nicht `centric-dp-web`.
2. Staging-Datenverzeichnis ist ein **eigener** Pfad, kein Bind auf das Production-`/data`.
3. Staging hat einen **eigenen Pfeffer**: Pfeffer-Prüfwert der jüngsten Staging-Sicherung ≠ dem der Production-Sicherung (so in STAGING-KETTE-B.md §2 belegt).
4. `FREIGEGEBENE-IMAGES.md`: Ziel- und Rücksprungbild stehen mit Digest darin; Rücksprungziel nicht `gesperrt`.
5. `printenv IMAGE_DIGEST` leer; freier Platz ≥ 3 × Größe der Ablage.

**Ablauf:**
1. `compose.yml` und `.env` mit Zeitstempel kopieren (`*.vor-abnahme-<UTC>`).
2. Sicherung bei **gestopptem** Dienst: `docker compose stop`, dann `W node werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen`, danach `pruefen` → „In Ordnung“.
3. Wiederherstellung in ein **neues leeres** Verzeichnis (`restore-abnahme-<UTC>/`) mit demselben Staging-Pfeffer; dann Datei für Datei SHA-256 gegen die Quelle: **0 abweichend, 0 fehlend, 0 zusätzlich** (Klasse C ausgenommen).
4. Probecontainer `--network none --read-only --user 1000:1000` auf einer **Kopie** dieser Wiederherstellung: `/gesund` = `{"status":"ok"}`, `ablage-pruefen.mjs` Exit 0.
5. Rücksprung: `ruecksprung.sh --trocken` (Ziel, `.env`-Änderung), dann echt; `docker inspect` Bild-ID = Ziel; `healthy` binnen `CENTRIC_WARTEZEIT`; Smoke (`staging-smoke.mjs`) grün; danach Vorwärts-Wechsel zurück aufs RC mit `deploy.sh` und erneuter Smoke.
6. Protokoll `betrieb-protokoll.log` sichern; Wegwerfverzeichnisse nach Freigabe entfernen.

**Abbruchkriterien:** jede Abweichung im Byte-Vergleich; Pfeffer-Prüfwert gleich dem von Production; `digest-pruefen.sh`
lehnt ab; Container nicht `healthy` binnen Wartezeit; `ablage-pruefen.mjs` ≠ 0; Smoke rot; jede Spur, dass ein
Production-Pfad berührt wurde → sofort R0 für Staging (`abschalten.sh`), Bericht, keine Wiederholung ohne Freigabe.

**Was danach weiter unbewiesen bleibt:** Wiederherstellung aus der restic-Kopie außer Haus unter echtem Speicherziel;
Verhalten bei vollem Datenträger im Container; Rücksprung über eine Ablageformat-Änderung hinweg (bisher keine
Formatänderung zwischen den Bildern); Wiederanlauf nach Stromausfall/Kernel-Absturz (fsync-Pfad nur mit Prozess-Kill,
nicht mit Betriebssystem-Absturz geprüft).

## Befunde

| Nr. | Klasse | Befund | Nachweis | Umgang |
|---|---|---|---|---|
| C-1 | P3 | `server.mjs` startet mit `NODE_ENV=production` auch **ohne `CENTRIC_PFEFFER`** und erwähnt das im Startprotokoll nicht (nur `/einrichten`-Umgebungsbericht warnt; `deploy/deploy.sh` bricht mit Code 4 ab). Die einzigen Startverweigerungen der Anwendung sind ungültige `CENTRIC_VERTRAUTE_PROXYS` und eine belegte Ablage. | lokaler Start auf Port 4103 mit leerer Ablage: `/gesund` 200, kein „PFEFFER“ im Log; `server.mjs:50–59, 394–407` | gemeldet, nicht behoben (Betriebsentscheidung: harte Startverweigerung oder Startwarnung) |
| C-2 | P3 (Hinweis) | Pfade ohne Dateiendung wie `/.env`, `/ki`, `/debug` liefern 200 mit `index.html` (Rückfall der Oberfläche) — **kein** Datenabfluss, aber Scanner melden 200 | `abnahme-c-schalter.test.js:319` | kein Handlungsbedarf; im Pentest-Bericht einordnen |
| C-3 | P3 (Hinweis) | `server.test.js` „hört auf SIGTERM sauber auf“ scheitert unter Windows (Signal wird nicht zugestellt), ebenso `ablage.test.js` (Dateimodus 0600, `EPERM` bei `rename`) — Plattformsemantik, in CI/Linux grün | lokale Läufe | kein Produktbefund (Betrieb im Linux-Container) |

Keine P0-, P1- oder P2-Befunde in den Bereichen 12, 13, 15, 16. Kein Defekt erforderte einen eigenen Fix-Zweig.

## Restrisiken

- **R-C1** Pfeffer-Pflicht nur im Deploy-Skript, nicht in der Anwendung (C-1).
- **R-C2** Sauberes Beenden (SIGTERM) lokal nicht ausführbar (Windows); belegt nur durch den CI-Lauf unter Linux.
- **R-C3** Die Wiederherstellung von `centric-sitzungen/sk:` (Sicherungsschlüssel) ist im neuen Test nicht empfindlich geprüft (Mutation blieb grün); abgedeckt nur durch `sicherungsschluessel-wiederherstellung.test.js`.
- **R-C4** Absturz = Prozess-Kill. Ein Betriebssystem- oder Stromausfall (Seitencache verloren) ist nicht nachgestellt.
- **R-C5** Datenträger voll / Rechtefehler: nur über `/gesund` (Ablage nicht beschreibbar → kritisch/503, `gesund.test.js`) und Werkzeuge (`wp28b-sicherung-enoent`), nicht mit echtem vollem Datenträger.
