# Abnahme V4 — Release-Kandidat, Baseline und Testmatrix (Strom S0)

Auftrag: Betreiberauftrag 2026-11-13 „Vollständige Staging- und Release-Abnahme“, Strom S0 (Baseline und Testmatrix).
Die Ströme A (Bereiche 1–5, 11), B (6–10, 14) und C (12, 13, 15, 16) führen die fachlichen Abläufe aus und tragen ihr
Ergebnis in die Spalten „ausgeführt“ ein; S0 führt diese Abläufe **nicht** aus.

**Wichtig (Betreiberregel 2026-11-13):** Alles, was in diesem Dokument als ausgeführt geführt wird, ist eine
**lokale Integrationsabnahme** (Windows-Entwicklungsrechner, `node server.mjs`, synthetische Daten, kein Docker, kein Caddy,
kein TLS, keine echten Geräte) bzw. ein CI-Lauf auf GitHub Actions. Es ist **keine Staging-Abnahme** und ersetzt sie nicht.
Was zusätzlich eine produktionsnahe Staging-Umgebung braucht, steht je Bereich in der Spalte „Staging erforderlich“ und
gesammelt in Abschnitt 6.

Kennzeichnung überall: **bestanden** / **nicht bestanden** / **nicht ausführbar** (mit Grund). Fehlende Tests zählen nie als
Erfolg; sie stehen als **Lücke** mit Vorschlag. Befundklassen: P0 (Sicherheit/Datenschutz/Datenverlust), P1
(release-kritisch), P2 (Umgehung möglich), P3 (gering).

---

## 1. Release-Kandidat (RC)

| | |
|---|---|
| Branch | `origin/integration/release-v4` |
| **Geprüfter Commit** | `0638c10185c0171da3cc1d2ae4a2195adf9c42f4` (Merge #270 „SSOT: Stand nach Nachholreviews und Fixes (#265–#269)“, 2026-11-13 09:19 +0100) |
| Abgerufen | `git fetch origin`, 2026-11-13 ca. 08:20 UTC |
| Code-Stand gegenüber `2f55d243` | #270 ändert nur `docs/acc45/work-packages.json`/Doku (SSOT); Code identisch mit `2f55d243` (Merge #266) |
| Nachkontrolle am Ende | 2026-11-13 11:51 UTC: `origin/integration/release-v4` steht inzwischen auf **`ca45a0a2102fbbe5787a7a60ce402b3e5b38091a`** (nach dem geprüften RC gemergt: **#271** WP-48-GB, Merge `bbd5e6e0` 08:45 UTC, 6 Dateien u. a. `src/App.jsx`, `src/app/oeffnen.js`; **#272** Rollenauswahl in „Personal“ mit Namen, WCAG 4.1.2, 3 Dateien). CI auf beiden Köpfen grün (siehe 1.1). Die lokale Kette (Abschnitt 2) lief auf `0638c101`; auf `bbd5e6e0` lokal nur die Delta-Prüfung `pruefung:wp48-gb-oeffnen` (**bestanden**, 9/9, 14 s). Für den Folgekopf `ca45a0a2` gilt: CI-belegt, lokal nicht erneut gelaufen. |
| `main` / Produktion | unverändert (laut Gedächtnis-/Betreiberstand `64d08a4`, Bild `f03a8514…`); in diesem Strom nicht angefasst |

### 1.1 CI-Ergebnisse auf dem RC-Commit `0638c101`

| Workflow | Lauf | Jobs | Ergebnis |
|---|---|---|---|
| Prüfung (`pruefung.yml`) | 43392304855 | `pruefen` (Linter, Typen, ~235 Schritte inkl. Docker-Bild bauen und HTTP-Prüfungen je frischem Container), `browser-abnahme` (Playwright + axe, 8 Viewports) | **bestanden**: `pruefen` 246 von 247 Schritten success, 1 übersprungen (Container-Logs, nur bei Fehler), 19 min; `browser-abnahme` 10/10 Schritte, Playwright **57 bestanden, 7 übersprungen** (der Test „Ausnahmeliste axe ist begründet“ läuft planmäßig nur in einem der 8 Projekte), 8,8 min |
| Sicherheit (`sicherheit.yml`) | 43392304615 | geheimnisse, abhaengigkeiten, interne-pruefung, muster | **bestanden** (alle success) |
| Lieferkette (`lieferkette.yml`) | 43392304696 | caddy-vorlage, bild-scan | **bestanden** (alle success) |
| Betrieb: Deploy-Skripte (`betrieb-deploy.yml`) | 43392304782 | compose, skripte (Deploy-/Rücksprung-Skripte gegen Docker-Stub), shellcheck | **bestanden** (alle success) |
| Auslieferung (`deploy.yml`, Bild nach GHCR) | — | — | **nicht ausgeführt** für diesen RC (letzter Lauf 2026-11-05 auf `rc-2026-11-05`, `265d575b`). Es gibt **kein GHCR-Bild und keinen Digest** für `0638c101`. Auslösen ist Betreibersache (Abschnitt 5.3). |

Vorgänger mit gleichem Code: Prüfung auf `2f55d243`, Lauf 43388728783: **success** (beide Jobs).

Folgeköpfe (während dieses Laufs gemergt, **nicht** lokal als Kette geprüft):

| Kopf | Inhalt | Prüfung | Sicherheit | Lieferkette | Deploy-Skripte |
|---|---|---|---|---|---|
| `bbd5e6e0` | + #271 (WP-48-GB) | 43395741570 **bestanden** (`pruefen` 247/248 Schritte success, 1 übersprungen; `browser-abnahme` 57 bestanden, 7 übersprungen) | 43395741622 bestanden | 43395741565 bestanden | 43395741573 bestanden |
| `ca45a0a2` | + #272 (Rollenauswahl mit Namen, WCAG 4.1.2) | 43403781160 bestanden | 43403781300 bestanden | 43403781192 bestanden | 43403781201 bestanden |

### 1.2 Offene PRs (Stand 2026-11-13 ca. 08:30 UTC) und was sie für den RC bedeuten

| PR | Ziel | Inhalt | Wirkung auf den RC |
|---|---|---|---|
| **#271** | integration/release-v4 | WP-48-GB: Öffnen des Plans schreibt nicht mehr (Tour-Selbststart und Urlaubshinweis schrieben beim Öffnen in den Bestandskern → zweite Sitzung sieht „Gleichzeitig bearbeitet“, 409) | **Im geprüften RC nicht enthalten**; während des Laufs gemergt (08:45 UTC, Kopf `bbd5e6e0`). Befund S0-B1 gilt für `0638c101`, ist ab `bbd5e6e0` behoben. |
| #272 | integration/release-v4 | Rollenauswahl in „Personal“ mit Namen (WCAG 4.1.2) | während des Laufs gemergt (Kopf `ca45a0a2`), CI grün |
| #274, #275, #276 | integration/release-v4 | Abnahme V4 Strang B, A, C (Dokumente der Ströme) | offen; Ergebnisse der Ströme, keine Codeänderung erwartet |
| **#277** | integration/release-v4 | Abnahme V4 A-2: Einladungsbremse sperrt die Leitung nicht mehr aus | offen; **Befund aus Strom A mit Codeänderung** — nach Merge neuer RC |
| #238 | integration/release-v4 | WP-I16 Teil 1, Betriebsrat-Pause (neues BR-Schreibrecht) | blockiert durch Betreiberentscheidung; nicht im RC; KI bleibt aus |
| #177 (Entwurf) | integration/release-v4 | WP-I4 Vorgaben-Verwaltung (veraltet) | nicht im RC; Teil 1 ist über #256 integriert |
| #175 (Entwurf) | integration/release-v4 | OPT-1-F Anmeldeweg Leitungskonten | gesperrt (OPT-1); nicht im RC |
| #168, #129, #127, #115 | integration/release-v4 | nur Doku/Backlog | keine Wirkung auf den Code |
| #139 | integration/release-v4 | WP-I12c planKennzahlen | nicht im RC (Intelligence, aus) |
| #104 (Entwurf) | integration/release-v4 | „NICHT INTEGRIEREN“ – Referenz | keine |
| #97, #96, #94, #92, #91 | integration/centric-complete bzw. V4-Phasenbranches | alte Kandidaten-/V4-Zweige | nicht Basis dieses RC |
| #18, #17, #16, #15, #7, #6 | Kette B / main / Altzweige | historische Security-/Geo-/Regelwerk-Ketten | nicht Basis dieses RC; #16 und #7 sind gegen `main` DIRTY |

### 1.3 Bekannte Release-Blocker (aus SSOT und Doku, nicht neu bewertet)

Quellen: `docs/acc45/work-packages.json` (202 Pakete: DONE 3, INTEGRATED 86, IN_PROGRESS 19, REVIEW 7, BLOCKED 71, READY 16),
`docs/acc45/WIEDERAUFNAHME.md`, `docs/acc45/BEREITSCHAFTSANALYSE-2026-11-12.md` (Nachtrag 2026-11-13), `docs/PRE-PRODUCTION-GATE.md`,
`BEREITSTELLUNG.md` §5.5, `docs/STAGING-KETTE-B.md` (nur im Arbeitsverzeichnis des Hauptrepos, nicht im RC versioniert),
`docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` (nur auf `hotfix/stempel-datenschutz-sv`, **nicht im RC**).

| Blocker | Art | Wer |
|---|---|---|
| WP-09 „Kette B nach main“ IN_PROGRESS | Merge nach `main` nur mit Freigabe nach Staging-Abnahme E-1 | Betreiber |
| E-1 Staging-Abnahme des Integrationsstands (WP-12 Prüfpunkte 3.1–3.4) | BLOCKED | Betreiber |
| E-2/E-3/E-5/E-6 echte Geräte Android/iOS/Tablet, Offline/Wiederanlauf | BLOCKED | Betreiber |
| E-4 Geo/GPS am Einsatzort | BLOCKED | Betreiber |
| E-7 Backup außer Haus + echter Restore, E-14 Rücksprung-Probe A→B→A (nach E-13) | READY/BLOCKED | Betreiber |
| E-8 Monitoring/Alarm, E-9 Mail (SPF/DKIM/DMARC), VAPID, Zustelltest | READY | Betreiber |
| E-10 Betreiber-2FA, E-11 GitHub-Umgebung `produktion`, E-12 `CENTRIC_VERTRAUTE_PROXYS`/Caddy/Branch-Schutz, E-13 `.env`-Migration auf `IMAGE_DIGEST` | READY/BLOCKED | Betreiber |
| E-17/E-17a externer Pentest | BLOCKED/READY | Betreiber + Anbieter |
| E-18 Rechtsfreigabe Rechtstexte, E-27/E-28/E-30 Kanzlei/DSB | BLOCKED/READY | Kanzlei/DSB |
| E-19 Mitbestimmung / Betriebsvereinbarungen | READY | Betreiber/Betriebsrat |
| E-21 Fachentscheidungen (warnen/sperren, Mindestbesetzung, …), E-22 WP-19-Fachnachweise FN-01…34 | READY | Betreiber/Fachleute |
| E-23 Produktions-Deployment mit Freigabe-Checkliste, E-24 Pilot | BLOCKED | Betreiber |
| REVIEW: WP-15, WP-16, WP-16c, WP-14c, WP-16b, WP-07b, WP-19.0 | Koordinator-/Fachentscheidung (u. a. F6a/F6b, wp16c-fragen) | Koordinator/Betreiber |
| IN_PROGRESS: WP-21, WP-33, WP-40 (Geräte, Screenreader, Zoom, Safari), WP-48 (Teilspeicherung bleibt aus), WP-28b (Linux-Lastnachlauf E-20), WP-19.13/WP-PILOT, IMP-6/IMP-8, OPT-4, WP-I* | Teilumfang; Funktionen hinter Schaltern aus | siehe SSOT |
| Offene Fachbefunde: WP-19.5 M-PQ1 und mittlere Befunde 19.2/19.5/19.6/19.9 | Module bleiben `geplant` (nicht aktivierbar) | Koordinator |

Daraus folgt: Der RC kann **technisch** bewertet werden; eine **Betreiberfreigabe** setzt mindestens E-1 (produktionsnahes Staging),
die Geräteabnahmen E-2/E-3/E-5/E-6 und die betrieblichen Pakete E-7/E-8/E-12/E-13/E-14 voraus.

---

## 2. Automatisierte Prüfkette auf dem RC (lokale Integrationsabnahme)

Umgebung: Windows 11 Pro 10.0.26200, Node v24.18.0 (CI: Node 22), eigener Worktree auf `0638c101` (Branch `docs/abnahme-v4-matrix`),
`node_modules` als Verbindung (Junction) auf das Hauptrepo. Kein Docker lokal.

### 2.1 Was die CI ausführt und was lokal davon läuft

`pruefung.yml` hat zwei Jobs:
- `pruefen`: `npm ci`, dann ~235 Einzelschritte: Linter, Verdrahtung, CI-Abdeckung, Sammelprüfung (Trockenlauf), alle
  `pruefung:*`-Skripte der Kette, zusätzliche Import-/Konto-/Modul-Skripte, `npm run build`, **Docker-Bild bauen**
  (`docker/build-push-action`, `load: true`, nicht gepusht) und **rund 30 HTTP-Prüfungen je frischem, gehärtetem Container**
  (`--read-only`, `--cap-drop ALL`, Benutzer 1000, 512 MB, `NODE_ENV=production` aus dem Bild; Gate-Proben
  `staging-smoke`/`staging-geo`/`staging-aufraeumen` im Container).
- `browser-abnahme`: Chromium, `npm run e2e` (Playwright + axe, 8 Viewports).

Lokal ausgeführt (dieser Strom):

| # | Befehl | Exit | Zählung | Dauer |
|---|---|---|---|---|
| L1 | `node werkzeug/sammelpruefung.mjs --bericht …` (führt **jedes** der 165 Glieder der Kette `npm run pruefung` aus, bricht nicht ab; enthält `lint`, `pruefung:typen`, `pruefung:verdrahtung`, `pruefung:serverlauf`, `pruefung:staging-proben` u. a.; `pruefung:ci-abdeckung` ist kein Glied und lief unter L4) | 1 | 164 Glieder ausgeführt: **141 bestanden**, 22 Fehler, 1 bekannt (`pruefung:selbst`, win32), 1 übersprungen (`pruefung:sammelpruefung`, Selbstaufruf; separat unter L4 bestanden). Nach Einzelwiederholung (2.2): **160 bestanden, 4 unter Windows nicht ausführbar**, 0 offen | 9195 s (153 min, unter Parallellast) |
| L2 | Wiederholungen bekannter Windows-Flakes, je **einzeln** | siehe 2.2 | | |
| L3 | `npm run pruefung:serverlauf` (25 Serverläufe ohne Docker, Entwicklungsabkürzung; in CI begründet ausgenommen, dort als HTTP-Prüfungen gegen das Bild) | 0 | ist Glied der Kette und lief in L1 mit (**bestanden**) | 399 s |
| L4 | CI-Zusatzskripte ohne Docker, die nicht in der Kette stehen (`einladungen`, `abnahme-ab`, `accounts`, `account-isolation`, `registrierung`, `starten`, `provisionierung`, `registrierung-http`, `registrierung-schalter`, `selbststart-schalter`, `demo-schalter`, `passwort-http`, `accountanmeldung`, `anmeldung-http`, `betriebsauswahl`, `konto-anmeldeweg`, `generation`, `arbeitssitzung`, `sicherung-ablage`, dazu `pruefung:ci-abdeckung` und `pruefung:sammelpruefung`; alle vitest-Aufrufe mit `--testTimeout=120000`) | je Skript, siehe 2.2 | 21 Skripte: **19 bestanden** (u. a. `ci-abdeckung` 8/8, `sammelpruefung` 13/13, `anmeldung-http` 70/70; `accountanmeldung` erst in der Einzelwiederholung 59/59), **2 lokal nicht bestanden** (`einladungen` 93/94, `sicherung-ablage` 13/14), beide CI Linux bestanden, siehe 2.2 | ca. 16 min |
| L5 | `npm run build` (vite) | 0 | — | 67 s |
| L6 | `E2E_PORT=3261 npm run e2e` (Playwright + axe, Chromium 8 Viewports; Chromium-Browser lokal vorhanden) | 1 (Befehl nicht gefunden) | **nicht ausführbar**: `@playwright/test` 1.64.1 und `axe-core` 4.14.0 fehlen in der gemeinsamen `node_modules` des Hauptrepos (alle übrigen direkten Abhängigkeiten erfüllen `package.json`); `npm ci` in die gemeinsame `node_modules` ist ausgeschlossen. Beleg stattdessen CI 43392304855 `browser-abnahme`: 57 bestanden, 7 übersprungen | 3 s |
| L7 | `node werkzeug/staging-abnahme-3.mjs --ziel http://127.0.0.1:3999` gegen die isolierte RC-Instanz (Abschnitt 3) | 0 | 10 PASS · 0 FAIL · 4 MANUELL | 2 s |
| L8 | Gate-Proben gegen frische isolierte RC-Instanz (`NODE_ENV=production`, Port 3000): `staging-smoke.mjs` | 0 | **51/51** | 81 s |
| L9 | `staging-geo.mjs`, erster Versuch im **zweiten** Prozess nach dem Smoke auf derselben Instanz | 1 | Abbruch bei der Anlage (`einrichten 401`, `anlegen 403`) | 3 s |
| L9w | `staging-geo.mjs` auf **frischer** Instanz (Wiederholung, allein) | 0 | **30/30** | 31 s |
| L10 | `staging-aufraeumen.mjs` nach L8/L9 bzw. L9w | 0 / 0 | 18/18 bzw. 17/17 | 2 s / 4 s |

Zu L9: Ursache ist die Testanordnung, kein Produktfehler. In `production` verlangt der Server für den Verwalterschlüssel einen
zweiten Faktor (WP-32d). `werkzeug/betreiber-faktor-vorlauf.mjs` richtet ihn im **ersten** Prozess (Smoke) ein und hält den
Nachweis nur im Arbeitsspeicher; ein zweiter Prozess kann den Faktor nicht erneut einrichten. Die CI reicht deshalb
`CENTRIC_ZWEIFAKTOR_NACHWEIS` aus dem Containerstart an `staging-geo` weiter (`pruefung.yml` Zeile ~962). Für das VPS-Staging
heißt das: jede Gate-Probe in einem **eigenen** kurzlebigen Probe-Container mit frischer Datenkopie, oder den Nachweis übergeben
(Abschnitt 5). Schlüssel in allen Probe- und Serverlogs: 0 Treffer.

### 2.2 Wiederholungen (einzeln, ehrlich protokolliert)

Die 22 Fehler und der eine „bekannte“ Fehler aus L1 wurden **einzeln** wiederholt (nacheinander, je `npm run <skript>`;
Ströme A/B/C liefen weiter parallel auf demselben Rechner). Was in Runde 1 nur an Zeitgrenzen (5 s) scheiterte, lief in Runde 2
mit `--testTimeout=120000` (Vorgabe des Auftrags für vitest) nur für die betroffenen Dateien.

| Skript | L1 (Kette) | Runde 1 einzeln | Runde 2 einzeln, `--testTimeout=120000` | Bewertung |
|---|---|---|---|---|
| `pruefung:verdrahtung` | Fehler (Zeitgrenze 5 s) | **bestanden**, 8/8, 15 s | — | Last |
| `pruefung:geo` | Fehler | **bestanden**, 162/162, 37 s | — | Last |
| `pruefung:branchenmodule` | Fehler (Zeitgrenzen, Folgefehler 409/403) | **bestanden**, 647/647, 130 s | — | Last |
| `pruefung:aufraeumen` | Fehler | **bestanden**, 35/35, 31 s | — | Last |
| `pruefung:bremse-wp47` | Fehler | **bestanden**, 32/32, 70 s | — | Last |
| `pruefung:preisanzeige` | Fehler | **bestanden**, 2/2, 10 s | — | Last |
| `pruefung:zeiterfassung` | Fehler | **bestanden**, 473/473, 180 s | — | Last |
| `pruefung:datenintegritaet` | Fehler | **bestanden**, 335 + 1 übersprungen, 200 s | — | Last |
| `pruefung:kalender-rechte` | Fehler | **bestanden**, 16/16, 22 s | — | Last |
| `pruefung:mandanten-session` | Fehler | **bestanden**, 28/28, 22 s | — | Last |
| `pruefung:rollen-eintritt` | Fehler | **bestanden**, 10/10, 20 s | — | Last |
| `pruefung:mail-push-produktion` | Fehler | **bestanden**, 75/75, 281 s | — | bekannter Windows-Flake (QS-2) |
| `pruefung:mail-push-handler` | Fehler | **bestanden**, 20/20, 22 s | — | Last |
| `pruefung:zweifaktor` | Fehler | **bestanden**, 30/30, 34 s | — | Last |
| `pruefung:intelligence` | Fehler | nicht bestanden: 3 Zeitgrenzen in `intelligence-vorgaben-wege` (1152/1155) | `intelligence-vorgaben-wege`: **bestanden** 55/55, 71 s | Last |
| `pruefung:betreiber-zweifaktor` | Fehler | nicht bestanden: 3 Zeitgrenzen (92/95) | `betreiber-zweifaktor` 18/18, `rollen-zweifaktor` 40/40: **bestanden** | Last |
| `pruefung:entwuerfe` | Fehler | nicht bestanden: 1 Zeitgrenze + 1 Folgefehler (84/86) | `entwuerfe` **bestanden** 68/68, 47 s | Last |
| `pruefung:schreibhalt` | Fehler | nicht bestanden: `wp28b-sicherung-last` (EPERM/ENOTEMPTY, Zeitgrenze) | `wp28b-sicherung-last` **bestanden** 15/15, 33 s | bekannter Windows-Befund (WIEDERAUFNAHME, QS-3) |
| `pruefung:wp-nachtraege` | Fehler | nicht bestanden: nur `wp28b-sicherung-last` (154/157) | wie oben **bestanden** | wie oben |
| `pruefung:selbst` | bekannt (win32) | nicht bestanden, 1/2 (Erster Aufbau > 500 ms) | — | **nicht ausführbar unter Windows** (eingetragen in `sammelpruefung-bekannt.json`); in CI (Linux) bestanden |
| `pruefung:ablage` | Fehler | nicht bestanden, 21/24: Dateirechte `0o666` statt `0o600` (NTFS), `EPERM` beim Umbenennen | — | **nicht ausführbar unter Windows** (POSIX-Rechte/rename); CI Linux bestanden. Nicht in `sammelpruefung-bekannt.json` → S0-B8 |
| `pruefung:server` | Fehler | nicht bestanden, 17/18: „hört auf SIGTERM sauber auf“ (Windows kennt kein SIGTERM-Handling wie POSIX) | — | **nicht ausführbar unter Windows**; CI Linux bestanden → S0-B8 |
| `pruefung:zugaenge` | Fehler | nicht bestanden, 0/7: „jq fehlt“ (Bereitstellungsskript braucht `jq`) | — | **nicht ausführbar** (Werkzeug `jq` fehlt lokal); CI Linux bestanden → S0-B8 |

Zusätzlich L4 (CI-Zusatzskripte), einzeln wiederholt:

| Skript | erster Lauf | Einzelwiederholung (`--testTimeout=120000`) | Bewertung |
|---|---|---|---|
| `pruefung:accountanmeldung` | nicht bestanden, 58/59 („gibt die Kette nach der Zeitgrenze frei …“: `nicht erreicht: dritter Schreibvorgang`) | **bestanden**, 59/59, 48 s | Last; Flake-Klasse bekannt (`docs/acc45/FLAKE-ACCOUNTANMELDUNG.md`) |
| `pruefung:einladungen` | nicht bestanden, 93/94 | nicht bestanden, 93/94 | Testanordnung: vergleicht `Date.now()` zweier Prozesse ohne Toleranz (`bereitAm` des Kindes 1 ms nach `losAm` des Elternprozesses); das fachliche Ergebnis im Fehlertext stimmt (genau ein Gewinner 200, der andere 410 „schon vermerkt“). CI Linux bestanden → S0-B9 |
| `pruefung:sicherung-ablage` | nicht bestanden, 13/14 (60-s-Frist) | nicht bestanden, 13/14 | bekannte Windows-Grenze (`docs/acc45/TESTINFRASTRUKTUR.md` Z. 47); CI Linux bestanden |


### 2.3 Zusammenfassung der Kette

| | bestanden | nicht bestanden | nicht ausführbar (Grund) |
|---|---|---|---|
| L1 Kette `npm run pruefung` (164 + 1 Selbstaufruf), nach L2 | **160** | 0 | **4** unter Windows: `selbst` (500-ms-Grenze, bekannt), `ablage` (POSIX-Dateirechte/rename), `server` (SIGTERM), `zugaenge` (`jq` fehlt); alle vier in CI Linux bestanden |
| L4 CI-Zusatzskripte ohne Docker (21) | **19** | **2** lokal (`einladungen`: Uhrvergleich zwischen Prozessen; `sicherung-ablage`: 60-s-Frist); beide CI bestanden, keine Produktfehler | 0 |
| L6 Playwright/axe lokal | 0 | 0 | 1 (Abhängigkeit fehlt lokal; CI: 57 bestanden, 7 übersprungen) |
| L7–L10 isolierte Instanz und Gate-Proben | 5 Läufe (10 PASS/4 MANUELL; Smoke 51/51; Geo 30/30; Aufräumen 18/18 und 17/17) | 1 (L9, Testanordnung; wiederholt bestanden) | 0 |
| Docker-Bild, HTTP-Prüfungen im Container (~30), Rücksprung-Skripte | — | — | lokal kein Docker → **nur CI**: 43392304855 und 43392304782 bestanden |

Ergebnis: Auf dem RC ist keine Prüfung fachlich rot. Jede lokale Abweichung ist entweder in der Einzelwiederholung bestanden oder
plattformbedingt (Windows) und in der CI (Linux, Docker) für denselben Commit bestanden. Die Kette lief unter Parallellast der
Ströme A/B/C (4 logische Prozessoren); das erklärt die Zeitgrenzen in L1.

---

## 3. Testumgebung: isolierte, produktionsnahe Instanz des RC (lokal)

### 3.1 Start

Voraussetzungen: Worktree auf dem RC-Commit, `npm ci` (bzw. vorhandene `node_modules`), `npm run build` (erzeugt `dist/`).
Alle Daten in einem neuen, leeren Temp-Ordner; nur synthetische Daten; Geheimnisse werden im Prozess erzeugt und nie ausgegeben.

```bash
# Skript: start-rc.sh <worktree> <leerer-ordner>
set -euo pipefail
WT="$1"; R="$2"; mkdir -p "$R/data" "$R/zustand"
export NODE_ENV=production PORT=3999 \
  CENTRIC_DATEN="$R/data" CENTRIC_ABLAGE=dateien CENTRIC_ZUSTAND="$R/zustand" \
  CENTRIC_STATIK="$WT/dist" CENTRIC_VERTRAUTE_PROXYS=127.0.0.1,::1 CENTRIC_AUFRAEUMEN=aus
export CENTRIC_PFEFFER="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
cd "$WT" && exec node server.mjs
```

Bewusst **nicht** gesetzt (Vorgabe aus, wie in `deploy/compose.yml`/`BEREITSTELLUNG.md` Schritt 2):
`CENTRIC_SELBSTSTART`, `CENTRIC_DEMO`, `CENTRIC_PUBLIC_REGISTRATION`, `CENTRIC_IMPORT_AKTIV`, `CENTRIC_TEILSPEICHERUNG`,
`CENTRIC_HILFE_ASSISTENT`, `CENTRIC_ADMIN` (nur für Gate-Proben, kurzlebig, siehe L8), `RESEND_API_KEY`, `VAPID_*`, `REDIS_REST_*`.
Unterschiede zur Produktion: kein Container (`--read-only`, Benutzer 1000, `cap-drop` fehlen), kein Caddy/TLS (HSTS-Kopf wird
trotzdem gesendet), kein `X-Forwarded-For` von einem echten Proxy, Windows-Dateisystem statt Linux-Bind-Mount, keine Mail, kein Push.

Hinweis zur CI: Die CI-Container setzen zusätzlich `CENTRIC_SELBSTSTART=true` und `CENTRIC_DEMO=true` (für die Demo-/Selbststart-
Prüfungen). Die CI belegt deshalb **nicht** das Verhalten mit Produktionsvorgaben; die isolierte Instanz oben tut es (3.2).

### 3.2 Nachweis, dass die Instanz dem RC entspricht und Produktionsvorgaben gelten (ausgeführt 2026-11-13)

| Probe | Ergebnis |
|---|---|
| Worktree-Commit | `git rev-parse HEAD` = `0638c10185c0171da3cc1d2ae4a2195adf9c42f4`, Arbeitsbaum sauber außer diesem Dokument |
| Build-Info-Endpunkt | **nicht vorhanden.** Weder `/gesund` noch ein anderer Weg nennt Commit oder Bauzeit; die Identität ist nur über den Worktree (lokal) bzw. das Bildlabel `org.opencontainers.image.revision` und den Digest (Staging) belegbar → Befund S0-B3 (P3) |
| `GET /gesund` | 200 `{"status":"ok"}` |
| `GET /` | 200, HTML, CSP `default-src 'self'; script-src 'self'; …; object-src 'none'`, HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy` |
| `GET /api/demos` / `POST /api/demo` | 200 `{"demos":[]}` / 403 „Demozugang … nicht freigeschaltet“ |
| `POST /starten` | 403 „Selbststart ist derzeit nicht freigeschaltet“ |
| `POST /api/registrierung` | 404 `nicht-verfuegbar` |
| `POST /api/import/analyse` | 404 „Gibt es nicht.“ (Serverschalter `CENTRIC_IMPORT_AKTIV` aus) |
| `GET /api/hilfe/status`, `POST /api/hilfe/frage`, `GET /api/ki`, `POST /api/bestand/teile` | 401 (ohne Sitzung; Schalterwirkung mit Sitzung belegen die Tests `hilfe-assistent-i23*`, `wp48-teilweg`, siehe Matrix 15/16) |
| Startprotokoll | Herkunft: 2 vertraute Einträge; Schreibhalt bereit; Ablage im Temp-Ordner; Überwachung alle 60 s, Alarmkanal aus |
| `staging-abnahme-3 --ziel` | 10 PASS, 0 FAIL, 4 MANUELL |

Aufräumen: Server beendet, Port 3999 frei; die Temp-Ordner enthalten nur Wegwerfdaten.

---

## 4. Zentrale Testmatrix (16 Bereiche × Prüfdimensionen)

„L1“ bedeutet: in der Kette bestanden **oder** nach Einzelwiederholung (2.2) bestanden; die vier unter Windows nicht ausführbaren Skripte sind in der Zelle eigens genannt.

Lesart je Zelle: **Test(s)** (Datei, Aufruf) · **Status** (lokale Integrationsabnahme L1/L3/L4/L6–L10 oder CI-Lauf 43392304855) ·
oder **Lücke** mit Vorschlag. „Kette“ = Teil von `npm run pruefung` (L1). Dimensionen: E2E = Browser-E2E, API = API/Rechte,
DS = Datenschutz/Mandanten, DI = Datenintegrität/Revision, A11y = Barrierefreiheit, Resp = responsive, Fehler = Fehlerbehandlung,
Wdh = sichere Wiederholbarkeit (Idempotenz, Doppelabsendung), WH = Wiederherstellung.

Allgemeine Feststellung zur Dimension **Browser-E2E**: Die Playwright-Suite (`e2e/barrierefreiheit.spec.mjs`) prüft heute nur
**Anmeldung und je Rollenfamilie eine Planansicht mit axe an 8 Viewports**. Sie führt **keinen fachlichen Ablauf** aus (anlegen,
veröffentlichen, stempeln, krankmelden, abschließen). Fachliche Abläufe sind in jsdom-/Render-Tests (`geraete-wp21-ablaeufe*`,
`*-oberflaeche*.test.js`) und HTTP-Tests belegt, nicht im echten Browser. Diese Lücke betrifft alle Bereiche 1–13 (Befund S0-B2).

### 4.0 Übersicht und Eintragsspalten der Ströme

Die Spalten „ausgeführt“ tragen die Ströme ein (Ergebnis: bestanden / nicht bestanden / nicht ausführbar, mit Verweis auf ihr
eigenes Dokument). Sie sind **lokale Integrationsabnahme**, keine Staging-Abnahme.

| # | Bereich | Strom | S0: automatisiert belegt (lokale Integrationsabnahme + CI) | S0: Lücken | Strom A ausgeführt (lokale Integrationsabnahme) | Strom B ausgeführt (lokale Integrationsabnahme) | Strom C ausgeführt (lokale Integrationsabnahme) | Staging erforderlich |
|---|---|---|---|---|---|---|---|---|
| 1 | Betrieb anlegen/konfigurieren | A | API, DS, DI, Fehler, Wdh | E2E-Ablauf | | — | — | Docker-Bild mit Prod-Vorgaben (Selbststart/Demo aus), Caddy/XFF für die Bremse |
| 2 | Benutzer/Rollen einrichten | A | API, DS, DI, A11y (Ansicht) | E2E-Ablauf Zugänge/Einladung | | — | — | Mail-Zustellung der Einladung (E-9), Betreiber-2FA (E-10) |
| 3 | Personal anlegen / Import **aus** | A | API, DS, Schalter-aus (404) | E2E Person anlegen | | — | — | Prüfen, dass `CENTRIC_IMPORT_AKTIV` in der Staging-`.env` fehlt |
| 4 | Schichtmodelle zuordnen (IMP-6 serverseitig, ohne UI) | A | API/Bibliothek, DI | jede UI (gewollt), HTTP-Schreibweg | | — | — | keiner zusätzlich (keine UI, Import aus) |
| 5 | Dienstpläne erstellen/ändern/veröffentlichen | A | API (RB-1), DI (ETag, Konsistenz), Wdh (409) | E2E-Ablauf; Befund S0-B1 (409 beim Öffnen) | | — | — | Mehrere echte Sitzungen über Caddy; Push/Mail nach Veröffentlichung |
| 6 | Pläne mobil anzeigen | B | Resp (jsdom/Render 8 Viewports), A11y (axe 8 Viewports, CI+lokal) | echte Geräte, Browser-Ablauf | — | | — | echte Android/iOS/Tablet (E-2/E-3/E-5), HTTPS für PWA |
| 7 | Zeit erfassen / offline puffern / synchronisieren | B | API, DS, DI, Wdh (clientEventId), Geo (Gate-Probe 30/30) | echter Netzabbruch im Browser | — | | — | echte Geräte offline (E-6), GPS (E-4), Service Worker unter HTTPS |
| 8 | Krankmeldung zweistufig | B | API (RB-2/RB-3), DS, Benachrichtigung (RB-4), RB-5 | E2E-Ablauf, echte Zustellung | — | | — | Mail/Push (E-9) |
| 9 | Schichtausfall / Ersatzplanung | B | API/Logik (Schutzregeln-Ersatzsuche, RB-5) | E2E-Ablauf; KI-Ausfallvorschlag bleibt aus | — | | — | Push an Ersatzkandidaten (E-9) |
| 10 | Monatsabschluss / Zeitkorrekturen | B | API, DI/Revision (WP-16c), DS | E2E; Fachentscheidungen F6a/F6b, wp16c-fragen | — | | — | Lohnexport mit Fachstelle (E-29) |
| 11 | Mandantentrennung / Berechtigungen | A | API, DS (Kette + CI-HTTP je frischem Container), Gate-Smoke 51/51 | Mandantentrennung im Browser | | — | — | Caddy/XFF, echte Kontenmigration (OPT-4) |
| 12 | Datensicherung / Wiederherstellung / Rücksprung | C | DI/WH (Bibliothek, CI-HTTP `sicherung`), Deploy-/Rücksprung-Skripte gegen Docker-Stub | echter Restore, Rücksprung A→B→A | — | — | | VPS: §5.4-Sicherung, Restore in leeren Ordner, Rücksprung (E-7, E-14) |
| 13 | Fehlerzustände / Verbindungsabbrüche / Wiederanlauf | C | Fehler (Lesefehler, atomar, Schreibhalt, Prozesssperre, Bremse, `/gesund`) | echter Neustart unter Last, Netzabbruch | — | — | | Container-Neustart/Healthcheck, Dauerbetrieb, Alarm (E-8) |
| 14 | Barrierefreiheit / mobile Viewports / Bedienbarkeit | B | A11y (axe 8 Viewports: 57 bestanden CI), Kontrast, WCAG-Kern | Screenreader, Zoom 200 %, Tastatur in Abläufen, Safari | — | | — | echte Geräte, Vorlesesoftware (WP-40, E-5) |
| 15 | Branchenmodule nur im freigegebenen Aktivierungsstatus | C | API (B1 Schreibweg zu), modulAktiv-Allowlist, UI ohne Schreibaktion (B5), Abnahmematrix 400 Serverzellen | Browser-Ablauf im Prüfmodus | — | — | | Prüfen, dass Registry im Bild `geplant` ist |
| 16 | Deaktivierte KI-/Importfunktionen bleiben aus | C | Import 404 (lokal belegt), Import-KI ohne Aktivierung, Hilfe-Assistent aus, Intelligence ohne Route, Teilspeicherung aus | Schaltermatrix gegen das Bild mit Staging-`.env` | — | — | | `.env`-Abgleich: keine der Schaltervariablen gesetzt |

### 4.1 Bereich 1 — Betrieb anlegen/konfigurieren (Strom A)

| Dimension | vorhandene Tests (Aufruf) | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — (Playwright prüft nur Ansichten) | — | **Lücke** → Playwright-Spec „Betreiber legt Betrieb an, Leitung konfiguriert Grunddaten“ gegen `e2e/global-setup.mjs`-Server |
| API/Rechte | `erstbefuellung`, `altcodes` (`pruefung:erstbefuellung`, Kette); `rechte-betreiber` (`pruefung:betreiber`, Kette); `standorte`, `adressen` (Kette); HTTP: `pruefung:erstbefuellung-http`, `pruefung:rechte`, `pruefung:betreiber-sicht-http` (CI) | bestanden (L1; CI 43392304855) | — |
| DS/Mandanten | `betreiberfelder` (Kette), `betreiber-sicht` (Kette + CI-HTTP) | bestanden (L1; CI) | — |
| DI/Revision | `einstellungen-wirkung` (`pruefung:querschnitt`), `etag-pflicht` (`pruefung:querschnitt`) | bestanden (L1) | — |
| A11y | `e2e` Anmeldung (axe) | bestanden (CI 57/57 ausgeführt, 7 übersprungen planmäßig) | Leitungs-Einstellungsseite nicht axe-geprüft → in `FLAECHEN` aufnehmen |
| Resp | `geraete-wp21` (Kette) | bestanden (L1) | — |
| Fehler | `starten`, `provisionierung`, `selbststart-schalter`, `demo-schalter`, `registrierung-schalter` (CI, nicht in der Kette); lokal: 403/404 mit Prod-Vorgaben (3.2) | bestanden (CI; lokale Instanz 3.2) | — |
| Wdh | `erstbefuellung` (doppelter/zusätzlicher Betrieb abgewiesen, reproduzierbar), Bremse `/einrichten` (`bremse-lokal`, Kette) | bestanden (L1) | — |
| WH | — | — | Lücke → Betrieb anlegen, sichern, in leeren Ordner wiederherstellen (siehe 12) |

### 4.2 Bereich 2 — Benutzer/Rollen einrichten (Strom A)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Spec „Leitung legt Zugang an, Person meldet sich an, Rolle wirkt“ |
| API/Rechte | `zugaenge-anlegen` (`pruefung:zugaenge`), `rollenvergabe` (`pruefung:rollen`), `rechtematrix`/`rechtematrix-zeilen` (`pruefung:rechtematrix`), `rollen-failclosed`, `rollen-eintritt`, `betreiber-zweifaktor` (alle Kette); `einladungen` (`pruefung:einladungen`, CI); HTTP `pruefung:rechte`, `verwalter` (CI) | bestanden (L1; CI) — Ausnahmen lokal: `pruefung:zugaenge` nicht ausführbar (`jq` fehlt), `einladungen` 93/94 (S0-B9); beide CI bestanden | — |
| DS | `sitzung-ohne-rolle` (`pruefung:querschnitt`), `kundenraumschutz` (`pruefung:zugaenge-faktor`) | bestanden (L1) | — |
| DI | `mitgliedschaftsgeneration` (`pruefung:generation`, CI), `sitzungsrennen` (Kette) | bestanden (L1; CI) | — |
| A11y/Resp | `e2e` 5 Rollenansichten × 8 Viewports | bestanden (CI) | Zugangsverwaltung selbst nicht axe-geprüft |
| Fehler | `anmeldesperre` (Kette), `passwort-http`, `anmeldung-http` (CI) | bestanden (L1; CI) | — |
| Wdh | `sitzungsrennen`, `arbeitssitzung` (CI) | bestanden (L1; CI) | — |
| WH | `konto-wiederherstellung-kern`, `wiederherstellung-neu`, `kontowiederherstellung-*` (Kette) | bestanden (L1) | — |

### 4.3 Bereich 3 — Personal anlegen / Import (Import gesperrt, Prüfung: bleibt AUS) (Strom A)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — (`import-personal-e2e` ist jsdom/HTTP, kein Browser) | — | **Lücke** → Spec „Person anlegen im Dialog“ (Altbefund A aus PRE-PRODUCTION-GATE: Fokus) |
| API/Rechte | `person-eintritt`, `bestand-personalnummer`, `speicher-personalnummer` (`pruefung:person-eintritt`), `personendaten` (Kette) | bestanden (L1) | — |
| Import AUS | `import-schalter` (`pruefung:import-schalter`, Kette): alle `/api/import/*` 404 ohne Schalter; lokale Instanz: `POST /api/import/analyse` → 404 | bestanden (L1; lokal 3.2) | — |
| DS | `import-sonden`, `import-rumpfgrenze` (`pruefung:import-endpunkt`, CI); `personendaten` | bestanden (L1; CI) | — |
| DI | `imp8-testmatrix` (Kette, Teilumfang IMP-8) | bestanden (L1) | Browser-E2E der 20 Fälle (IMP-8) offen — bewusst, Import aus |
| A11y/Resp | `import-oberflaeche-imp4` (Oberfläche, aus) | bestanden (L1) | — |
| Fehler/Wdh/WH | `import-endpunkt` (Rumpfgrenze, 422) | bestanden (CI) | — |

### 4.4 Bereich 4 — Schichtmodelle zuordnen (IMP-6, serverseitig, keine UI) (Strom A)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — (keine UI vorgesehen) | nicht ausführbar (keine Oberfläche, Funktion aus) | — |
| API/Bibliothek | `import-schichtmodelle-imp6`, `imp6-mehrfachmodelle`, `import-schichtmodell-vorschau-imp6`, `import-analyse-cache-imp6` (Kette) | bestanden (L1) | Schreiben der Modelle in den Bestand fehlt (IMP-6 IN_PROGRESS, Q1–Q8 offen) |
| DI | `imp6-mehrfachmodelle` (keine stille Auflösung von Überschneidungen) | bestanden (L1) | HTTP-Schreibweg erst nach IMP-6-Rest |
| DS/Fehler | Vorschau ohne Modell-/Kopfzeilentexte im Echo, Übernahme 422 | bestanden (L1) | — |
| A11y/Resp/Wdh/WH | — | nicht ausführbar (keine UI, kein Schreibweg) | — |

### 4.5 Bereich 5 — Dienstpläne erstellen/ändern/veröffentlichen (Strom A)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Spec „Planung erstellt, Leitung veröffentlicht, Mitarbeitende sieht“ |
| API/Rechte | `rb1-plan-publish` (nur Leitung/Planung), `rb3-kunde-ohne-publish` (Kette); `entwuerfe` (Kette) | bestanden (L1) | — |
| DS | `sicht`, `sicht-planung-leitung`, `vollausgabe` (Kette + CI-HTTP) | bestanden (L1; CI) | — |
| DI/Revision | `konsistenz`, `regelwerk`, `warnen`, `kette-a-rundreise` (Kette); `etag-pflicht`; `wp48-speicherkern`, `wp48-rundweg` (`pruefung:datenintegritaet`) | bestanden (L1) | — |
| A11y/Resp | `e2e` Planansichten; `geraete-wp21-ablaeufe(-render)` | bestanden (CI; L1) | — |
| Fehler | `abnahme-409` (CI) | bestanden (CI) | — |
| Wdh | Drei-Wege-Abgleich/409 (`abnahme-409`, `wp48-rundweg`) | bestanden (CI; L1) | **Befund S0-B1** (P2): Öffnen ohne Eingabe schreibt (Tour, Urlaubshinweis) → zweite Sitzung 409; Behebung in PR #271, nicht im RC |
| WH | `wiederherstellen-ui` (Kette) | bestanden (L1) | — |

### 4.6 Bereich 6 — Pläne mobil anzeigen (Strom B)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | `e2e` (8 Viewports, je Rolle eine Planansicht, nur axe) | bestanden (CI 57 bestanden, 7 übersprungen; L6 lokal nicht ausführbar, Playwright fehlt) | fachlicher Mobil-Ablauf im Browser fehlt; `pruefung:geraete-browser`, `geraete-ablaeufe-browser` existieren, laufen nur lokal mit Edge, nicht in CI → aufnehmen |
| Resp | `geraete-wp21`, `geraete-wp21-ablaeufe`, `geraete-wp21-ablaeufe-render`, `geraete-wp21-sv-uebergabe`, `darstellung-wp35` (Kette) | bestanden (L1) | — |
| A11y | axe je Viewport (e2e), `wcag-wp40` | bestanden (CI; L1) | Textvergrößerung, Screenreader |
| DS | `sicht-tagesgenau` (`pruefung:rechtematrix`) | bestanden (L1) | — |
| Fehler/Wdh | `pwa` (Service Worker, Kette), `endgeraete-speicher` | bestanden (L1) | Service Worker unter HTTPS nur auf Staging |
| DI/WH | — | — | n. a. (reine Anzeige) |

### 4.7 Bereich 7 — Zeit erfassen / offline puffern / synchronisieren (Strom B)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Playwright mit `context.setOffline(true)`: stempeln, Puffer, wieder online, Abgleich |
| API/Rechte | `zeiterfassung`, `stempeln`, `serverdatum`, `stempel-fachpruefung`, `ungeplante-dienste`, `nachtdienst-ohne-einstempeln` (Kette); CI-HTTP `zeiterfassung-http`, `geo-http`; Gate-Probe `staging-geo` 30/30 (L9w) | bestanden (L1; CI; L9w) | — |
| DS | `stempel-datenschutz` (`pruefung:stempeldaten`), `istdaten` (Kette); Gate-Smoke E1-Proben 51/51 (L8) | bestanden (L1; L8) | — |
| DI | `stempel-integritaet`, `pausenerfassung` (Kette) | bestanden (L1) | — |
| Wdh | `offline-stempeln` (clientEventId, Idempotenz), `wp07b-stempel-500`, `stempel-429-client` (Kette) | bestanden (L1) | — |
| Offline-Puffer | `stempelpuffer` (Logik mit nachgebildetem Speicher, kein Browser) | bestanden (L1) | echter Browser-Offline fehlt (siehe E2E); Gerät E-6 |
| A11y/Resp | `stempel-oberflaeche`, `geraete-wp21-ablaeufe` | bestanden (L1) | — |
| Fehler | `stempel-429-client` (Bremse), `smoke-tageswechsel` | bestanden (L1) | — |
| WH | — | — | Lücke → Puffer nach Neustart des Servers (Wiederanlauf) automatisieren |

### 4.8 Bereich 8 — Krankmeldung zweistufig (Strom B)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Spec „Mitarbeitende meldet krank, SV bestätigt vorläufig, Leitung endgültig“ (Gerätevorlage `geraete-wp21-sv-uebergabe` als Ausgangspunkt) |
| API/Rechte | `rb2-krankmeldung`, `rb3-kunde-ohne-publish` (Kette) | bestanden (L1) | — |
| Benachrichtigung | `rb4-krankmeldung-benachrichtigung`, `mail-push-handler`, `post` (Kette) | bestanden (L1) | echte Zustellung (E-9) |
| DS | `schichtverantwortung`, `sicht-schichtverantwortung` (Kette + CI-HTTP) | bestanden (L1; CI) | — |
| DI | `rb5-klaerung` (veröffentlichter Plan bleibt bis zur Bestätigung unverändert) | bestanden (L1) | — |
| Resp | `geraete-wp21-sv-uebergabe` | bestanden (L1) | — |
| A11y/Fehler/Wdh/WH | — | — | Lücke → doppelte Krankmeldung/Doppelklick im HTTP-Test ergänzen |

### 4.9 Bereich 9 — Schichtausfall / Ersatzplanung (Strom B)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Spec „offene Schicht, Ersatzsuche, Vergabe“ |
| API/Logik | `schutzregeln-ersatzsuche` (`hindernisse()`), `rb5-klaerung`, `fachpruefung-server`, `schutzkonflikte` (Kette) | bestanden (L1) | — |
| DS | `bereich-ausschreibungen` (Kette + CI-HTTP) | bestanden (L1; CI) | — |
| KI aus | `intelligence-ausfallvorschlag` (Schalter aus, keine Route) | bestanden (L1) | — |
| DI/Wdh/Fehler | `warnen` (Warnen statt Sperren, Protokoll) | bestanden (L1) | Doppelvergabe derselben offenen Schicht in zwei Sitzungen → HTTP-Test ergänzen |
| A11y/Resp/WH | — | — | Lücke (Browser) |

### 4.10 Bereich 10 — Monatsabschluss / Zeitkorrekturen (Strom B)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Spec „Korrekturantrag, Freigabe, Monatsabschluss“ |
| API/Rechte | `monatsabschluss`, `monatsabschluss-lib`, `monatsabschluss-ist`, `-nachtrag(3/4)`, `korrekturworkflow`, `korrektur-nachtrag` (Kette) | bestanden (L1) | — |
| DI/Revision | `wp16c-korrekturrevision`, `wp14c-folgebefunde`, `wp16b-spur` (`pruefung:wp-nachtraege`); `wp16c-messung` (Kette) | bestanden (L1) | Fachentscheidungen F6a/F6b, wp16c-fragen offen (REVIEW) |
| DS | `selbstauskunft*` (`pruefung:selbstauskunft-ui`) | bestanden (L1) | — |
| A11y/Resp | `monatsabschluss-oberflaeche`, `korrektur-oberflaeche` | bestanden (L1) | — |
| Fehler/Wdh/WH | `monatsabschluss-nachtrag4` (Vormonat offen/geändert → 409, Überstimmung protokolliert; Löschlauf nach Export) | bestanden (L1) | Lohnexport mit Fachstelle (E-29) |

### 4.11 Bereich 11 — Mandantentrennung / Berechtigungen (Strom A)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Spec „zwei Betriebe, Sitzung A versucht Daten B“ |
| API/Rechte | `rechtematrix`, `leserechte`, `sicht`, `verwaltungswege`, `kalender-rechte`, `zustellung-rechte`, `bereich-*` (Kette); CI-HTTP: `rechte`, `mandanten-http`, `vollausgabe-http`, `verwaltungswege-http`, `kalender-rechte-http`, `zustellung-rechte-http`, `bereich-*-http`, `session-kanal-http` (je frischer Container) | bestanden (L1; CI) | — |
| DS/Mandanten | `mandanten`, `mandanten-session`, `account-isolation` (CI), `schutzmerkmale-sicht`, `dsgvo-server`, `aufbewahrung` (Kette); Gate-Smoke Mandantentrennung mit zwei Wegwerfbetrieben 51/51 (L8) | bestanden (L1; CI; L8) | — |
| DI | `session-kanal`, `sitzungsbindung` | bestanden (L1) | — |
| Fehler | `herkunft-xff` (`pruefung:herkunft`), `ip-kuerzel` | bestanden (L1) | XFF hinter echtem Caddy nur auf Staging/Produktion |
| Wdh/WH/A11y/Resp | — | — | n. a. |

### 4.12 Bereich 12 — Datensicherung / Wiederherstellung / Rücksprung (Strom C)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | `wiederherstellen-ui` (jsdom) | bestanden (L1) | Browser-Ablauf fehlt |
| API/Rechte | `sicherungen` (Kette), CI-HTTP `sicherungen-http`, `sicherung` | bestanden (L1; CI) | — |
| DI/WH | `sicherung-ablage` (CI, nicht Kette), `wiederherstellung-schutz`, `sicherungsschluessel-*` (Kette), `ablage-pruefen`, `ablage-pruefen-rueckweg`, `-matrix(2)`, `journal-lesen`, `atomar` (`pruefung:datenintegritaet`) | bestanden (L1; `sicherung-ablage` L2 nicht bestanden lokal (60-s-Frist, bekannt), CI bestanden) | — |
| Last | `wp28b-sicherung-last`, `wp28b-sicherung-enoent`, `schreibhalt-last` | bestanden (L1) | Linux-Lastnachlauf E-20 |
| Rücksprung | `deploy-skripte`, `deploy-automatik` (Workflow „Betrieb: Deploy-Skripte“ 43392304782, gegen Docker-Stub) | bestanden (CI) | echter Rücksprung A→B→A auf VPS (E-14) |
| DS | Pfeffer-Prüfwert bei Restore (`sicherungsschluessel-wiederherstellung`) | bestanden (L1) | — |
| Fehler | `wp28b-sicherung-enoent` | bestanden (L1) | — |
| A11y/Resp | — | — | n. a. |

### 4.13 Bereich 13 — Fehlerzustände / Verbindungsabbrüche / Wiederanlauf (Strom C)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | **Lücke** → Playwright: Server während offener Sitzung neu starten, Netz trennen, Wiederaufnahme prüfen |
| API | `lesefehler`, `loeschsperre`, `atomar`, `schreibhalt`, `prozesssperre`, `gesund`, `lebendigkeit` (Kette); `bremse-lokal`, `bremse-wp47`, `wp47b-lesebremse` (Kette); CI-HTTP `bremse` | bestanden (L1; CI) | — |
| DI | `datenintegritaet`, `wp48-rundweg` | bestanden (L1) | — |
| Wdh | `offline-stempeln`, `wp07b-stempel-500` | bestanden (L1) | — |
| Wiederanlauf | Serverneustart je Prüfung (`pruefung:serverlauf`, L3 bestanden, 399 s); CI startet je HTTP-Prüfung einen frischen Container | bestanden (L1); CI bestanden | Neustart mit **bestehender** Ablage und offenen Sitzungen nicht systematisch geprüft → Test ergänzen |
| Fehler (Client) | `stempel-429-client` (`pruefung:bremse-wp47`) | bestanden (L1) | — |
| DS | `gesund` (Details nur lokal) | bestanden (L1) | — |
| A11y/Resp | — | — | n. a. |

### 4.14 Bereich 14 — Barrierefreiheit / mobile Viewports / Bedienbarkeit (Strom B)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E (axe) | `npm run e2e`: Anmeldung + 5 Rollenansichten × 8 Viewports, WCAG 2.2 AA, Gate serious/critical, Ausnahmen begründet (`e2e/axe-ausnahmen.json`) | bestanden (CI 57 bestanden, 7 übersprungen; L6 lokal nicht ausführbar, Playwright fehlt) | Dialoge, Formulare, Fehlerzustände nicht axe-geprüft |
| Kontrast/Gestalt | `kontrast`, `gestalt`, `v4-tokens`, `v4-app-stil` (Kette) | bestanden (L1) | — |
| WCAG-Kern | `wcag-wp40`, `wp40-zugaenglichkeit`, `browser-abnahme-kern`, `tour-dialog` | bestanden (L1) | `pruefung:wcag-wp40-browser` nur lokal (Edge), nicht in CI |
| Resp | `darstellung-wp35`, `geraete-wp21*` | bestanden (L1) | — |
| Bedienbarkeit | — | — | Tastaturbedienung je Ablauf, Zoom 200 %, Screenreader (NVDA/VoiceOver) → manuell (WP-40) |
| DS/DI/Wdh/WH | — | — | n. a. |

### 4.15 Bereich 15 — Branchenmodule nur im freigegebenen Aktivierungsstatus (Strom C)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| E2E | — | — | Lücke → Browser-Ablauf im Prüfmodus (WP-19.13 Rest) |
| API/Rechte | `modul-b1-schreibweg` (alle Schreibwege bei `geplant` zu), `modulaktiv-allowlist` (nur `vorlaeufig`/`freigegeben` wirksam, fail-closed), `modul-rechte-wp19`, `branchenmodule`, `branchen-andock` (Kette) | bestanden (L1) | — |
| UI | `modul-altwege-oberflaeche` (keine Schreibaktion bei `geplant`), `modul-abnahme-oberflaeche` (360/390/768 px) | bestanden (L1) | — |
| Abnahmematrix | `modul-abnahme` (12 Module × Rollen, 400 Serverzellen) | bestanden (L1) | — |
| DI/DS | `modul-integritaet-quer`, `modul-kern*` (Kette) | bestanden (L1) | Fachnachweise FN-01…34 (E-22) |
| A11y/Resp/Fehler/Wdh/WH | über `modul-abnahme-oberflaeche` (Viewports) | bestanden (L1) | — |

### 4.16 Bereich 16 — Deaktivierte KI- und Importfunktionen bleiben aus (Strom C)

| Dimension | vorhandene Tests | Status | Lücke → Vorschlag |
|---|---|---|---|
| Import aus | `import-schalter` (Kette): `/api/import/*` 404 ohne `CENTRIC_IMPORT_AKTIV=true`; lokale Instanz 404 (3.2) | bestanden (L1; lokal) | — |
| Import-KI | `import-ki-schnittstelle-imp9` (`pruefung:import-ki`, Kette) | bestanden (L1) | — |
| Hilfe-Assistent | `hilfe-assistent-i23*` (`pruefung:hilfe-assistent`): Vorgabe aus, `suche`/`an` nur mit Schalter | bestanden (L1) | — |
| Intelligence | `intelligence-*` (`pruefung:intelligence`, Kette): Funktionen ohne Route, Gateway nur Attrappe, Positivliste, Leckprüfung; `intelligence-oberflaeche-browser` | bestanden (L1) | — |
| Teilspeicherung | `wp48-teilweg` (`CENTRIC_TEILSPEICHERUNG` aus → Weg aus) | bestanden (L1) | — |
| Selbststart/Demo/Registrierung | `selbststart-schalter`, `demo-schalter`, `registrierung-schalter` (CI); lokal 403/403/404 (3.2) | bestanden (CI; lokal) | — |
| Live-Schalter | `ki-schichtfolge-live` (`pruefung:schichtfolge-live`) | bestanden (L1) | — |
| E2E | — | — | Lücke → Playwright: Leitung sieht keine KI-/Import-Einstiege (Oberfläche) |
| Staging | — | — | `.env`-Abgleich auf Staging: `CENTRIC_IMPORT_AKTIV`, `CENTRIC_TEILSPEICHERUNG`, `CENTRIC_HILFE_ASSISTENT`, `CENTRIC_DEMO`, `CENTRIC_SELBSTSTART`, `CENTRIC_PUBLIC_REGISTRATION` nicht gesetzt (nur Namen prüfen, keine Werte ausgeben) |


---

## 5. VPS-Staging für den RC — vorbereitete Bereitstellung (NICHT ausgeführt)

Grundlage: `BEREITSTELLUNG.md` §5.5 und §5.4, `docs/STAGING-KETTE-B.md` (Staging-Lauf 2026-11-02 auf `8d5086f`),
`deploy/compose.yml`, `.github/workflows/deploy.yml`. Nichts davon wurde ausgeführt; alle Schritte sind Betreiberschritte.

### 5.1 Ist ein isoliertes Staging neben der Produktion vorhanden? (Fragen an den Betreiber)

Belegt ist nur der Stand vom 2026-11-02 (`STAGING-KETTE-B.md`): `/opt/apps/centric-staging`, Compose-Projekt `centric-staging`,
Container `centric-staging-web`, nur Netz `proxy`, keine Ports, kein Caddy-Eintrag, **eigener Pfeffer** (Prüfwert
`cdf7aa5e…` ≠ Produktion), eigene Daten (eigene Inodes, 0 gemeinsame Räume), Bild damals `de43c056…` (Kette B, `8d5086f`).
Seitdem lief laut Gedächtnis ein Browsertest auf `a379095` (Image `sha256:1fdd88bf…`, Run 41437583763). Für den aktuellen RC
ist **offen und vom Betreiber zu bestätigen**:

1. Läuft `centric-staging-web` noch, mit welchem Digest, und ist es weiterhin nur im Netz `proxy` ohne Port und ohne Caddy-Eintrag?
2. Ist der Staging-Pfeffer weiterhin ein eigener (Prüfwert ≠ Produktion)? Ist `CENTRIC_ADMIN` in der Staging-`.env` leer?
3. Hat Staging ein Verzeichnis `zustand/` (uid 1000, 700) und `CENTRIC_ZUSTAND=/zustand`? Die `compose.yml` von Kette B stammt aus
   der Zeit **vor** WR-2/Sicherungsschlüssel-Epoche; ohne `zustand` antworten Faktor-Aktivierung und Wiederherstellungscodes 503.
4. Ist `CENTRIC_VERTRAUTE_PROXYS` gesetzt (für Staging ohne Caddy: leer lassen oder nur die Adresse des Probe-Clients)?
5. Wurde E-16 (`brist:`-Schlüssel auf Staging löschen) erledigt? Altbestände `stg-alpha`/`stg-beta` und Wegwerfordner
   `probe-daten-*`, `restore-*` vom 02.11. noch vorhanden?
6. Ist das Staging-`.env`-Format bereits auf `IMAGE_DIGEST` umgestellt (E-13), oder steht der Digest direkt in der Staging-`compose.yml`?
7. Welcher Zugangsweg für Browser-/Gerätetests ist freigegeben (SSH-Tunnel, tsnet-Helfer)? Ohne ihn sind Bereiche 6, 14 und alle
   Browser-E2E auf Staging **nicht ausführbar**.

### 5.2 Fehlende Voraussetzungen für diesen RC

| Voraussetzung | Stand |
|---|---|
| GHCR-Bild + Digest für `0638c101` (bzw. den dann aktuellen RC) | **fehlt** — `deploy.yml` nicht ausgelöst |
| Eintrag in `deploy/FREIGEGEBENE-IMAGES.md` (Status für Staging) | fehlt; `digest-pruefen.sh` lässt nur gelistete Digests zu |
| Staging-`compose.yml` auf aktuellem Stand (`CENTRIC_ZUSTAND`, `tmpfs /tmp`, read-only, uid 1000) | zu prüfen (Frage 3) |
| Browser-Zugang (Tunnel) | Freigabe fehlt |
| echte Geräte Android/iOS/Tablet | E-2/E-3/E-5 offen |
| Caddy/TLS für Staging | **nicht vorgesehen** (§5.5: kein DNS, kein Caddy); Caddy-/XFF-Verhalten ist damit auf Staging **nicht** prüfbar, nur die CI-Vorlage `caddy-vorlage` (Lieferkette) |
| Mail/Push | ohne `RESEND_API_KEY`/VAPID nicht prüfbar (E-9) |

### 5.3 Betreiberschritte (Reihenfolge)

1. **Bild bauen (GitHub Actions, Betreiber):** Actions → „Auslieferung“ → `workflow_dispatch` auf `integration/release-v4` beim
   RC-Commit, Eingaben `bauen=true`, `ausliefern=false`. Ergebnis: Digest `sha256:…` und Label
   `org.opencontainers.image.revision=<RC-sha>`. Belegen: Lauf-ID, Jobs Prüfung/Sicherheit/Bild grün.
2. **Digest eintragen:** `deploy/FREIGEGEBENE-IMAGES.md` per PR (Status nur für Staging; nicht `aktiv` für Produktion).
3. **Vorprüfung lesend auf dem VPS (SSH, Betreiber):** Produktion und Staging je `docker inspect` (Id, Bild, Startzeit,
   Neustartzähler, Health, Mounts, Ports); `curl -s https://app.centric-dienstplanung.de/gesund`; Pfeffer-Prüfwerte vergleichen
   (nur Prüfwert, nie den Wert); `df -h`, `free -m`.
4. **Sicherung Staging** nach §5.4 (Dienstname `centric-staging-web`), `pruefen`, Wiederherstellungstest in leeren Ordner.
5. **Umstellung nur Staging:**
   ```bash
   cd /opt/apps/centric-staging
   docker pull ghcr.io/rinats-png/dienstplaner@sha256:<digest>
   ./digest-pruefen.sh sha256:<digest>            # falls auf Staging vorhanden
   cp -p compose.yml compose.yml.vor-rc-<UTC>     # Rückweg
   # genau die Bildzeile (bzw. IMAGE_DIGEST) ersetzen; diff zeigt nur diese Zeile
   docker compose config --no-env-resolution       # Ausgabe nicht weitergeben
   docker compose rm -f -s centric-staging-web
   docker compose up -d --pull never centric-staging-web
   ```
6. **Identität belegen:** `docker inspect centric-staging-web --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'`
   = Digest und RC-sha; `docker exec centric-staging-web wget -qO- http://127.0.0.1:3000/gesund` (bzw. node-Einzeiler).
7. **Gate-Proben je in eigenem kurzlebigen Probe-Container** (wie `STAGING-KETTE-B.md` §5): gleiches Bild, Staging-`.env`,
   `--network none`, `--read-only`, `--tmpfs /tmp`, `--tmpfs /zustand`, `1000:1000`, `--cap-drop ALL`, `no-new-privileges`,
   Datenkopie der geprüften Wiederherstellung; `CENTRIC_ADMIN` nur über die Prozessumgebung (`-e CENTRIC_ADMIN` ohne Wert), danach
   `unset`. **Je Probe ein frischer Container** (`staging-smoke`, `staging-geo`, `staging-aufraeumen`), weil der zweite Faktor
   des Verwalterschlüssels nur im ersten Prozess eingerichtet wird (L9). Danach `staging-abnahme-3.mjs --ziel` über den Tunnel.
8. **Browser-/Gerätetests** der Ströme A/B/C gegen Staging nur über den freigegebenen Tunnel, nur synthetische Daten
   (`example.org`), Seeds SD-P/SD-S nur mit Markerdatei `.centric-test-umgebung`.
9. **Rückweg (nur Staging):** `cp -p compose.yml.vor-rc-<UTC> compose.yml`, `rm -f -s`, `up -d --pull never`; bei Datenproblemen
   Wiederherstellung nach §5.4 Weg 1; Sitzungen nach §5.7.
10. **Nachkontrolle Produktion:** Id, Bild, Startzeit, Neustartzähler, Health bitgleich; `/gesund` 200; Caddy unverändert.

### 5.4 Bedingungen für die Trennung von der Produktion (müssen vor und nach jedem Schritt belegt sein)

- eigenes Verzeichnis, eigenes Compose-Projekt, eigener Dienst-/Containername und Alias im Netz `proxy` (nie `centric-dp-web`);
- eigener Pfeffer (Prüfwert verschieden), eigene Daten (verschiedene Inodes, 0 gemeinsame Räume), nie ein Abzug der Produktion;
- keine Port-Bindung, kein Caddy-Eintrag, kein DNS;
- Bild nur per Digest, `--pull never`; `latest` und Produktions-`IMAGE_DIGEST` unverändert;
- keine Geheimnisse in Ausgaben (`docker compose config --no-env-resolution`), `CENTRIC_ADMIN` nur kurzlebig im Probe-Container;
- Produktionsreferenzen vor/nach bitgleich; jede Abweichung = Abbruch und Rückweg.

---

## 6. Staging erforderlich (gesammelt)

| Thema | Warum lokal/CI nicht ausreichend | Bereiche |
|---|---|---|
| Docker-Bild im Betrieb (read-only, uid 1000, `/zustand`, Healthcheck, Neustart) | lokal kein Docker; CI baut und startet das Bild, aber nicht mit Staging-`.env`/Mounts | 12, 13, alle |
| Echter Reverse Proxy (Caddy) und `X-Forwarded-For` | §5.5 sieht Staging ohne Caddy vor; nur die CI-Vorlagenprüfung `caddy-vorlage` | 11, 13 |
| TLS/HSTS, Service Worker unter HTTPS, PWA-Installation | lokal HTTP; SW/Installierbarkeit erst unter HTTPS realistisch | 6, 7, 14 |
| realistische Umgebungsvariablen (Mail, VAPID, Redis, Sicherung außer Haus, Alarm-Webhook) | lokal und CI ohne diese | 7, 8, 9, 12, 13 |
| echte Android-/iOS-Geräte, Tablet, Textvergrößerung, Screenreader | nur Emulation (Viewport) bzw. jsdom | 6, 7, 14 |
| Offline-Puffer und Wiederanlauf mit echtem Netzabbruch | nur Logik mit nachgebildetem Speicher (`stempelpuffer.test.js`) | 7, 13 |
| VPS-Sicherung, Restore in leeren Ordner, Rücksprung A→B→A | lokal nur Bibliotheks-/Stub-Tests; E-7/E-14 | 12 |
| Dauerbetrieb (Löschlauf, Überwachung, Takt) über Stunden | lokale Läufe sind kurz | 13 |

---

## 7. Vier-Stufen-Trennung (nur das bisher Belegte)

| Stufe | Bedeutung | Stand für RC `0638c101` |
|---|---|---|
| **A technisch getestet** | automatisierte Prüfungen grün, lokal + CI | **erreicht für `0638c101`** (lokale Integrationsabnahme + CI): CI alle vier Workflows grün; lokale Kette 160/164 bestanden, 4 plattformbedingt nicht ausführbar (CI bestanden); Gate-Proben gegen isolierte `production`-Instanz bestanden. Einschränkungen: kein fachlicher Browser-E2E (S0-B2), lokal kein Docker und kein Playwright. Folgekopf `ca45a0a2`: nur CI-belegt. |
| **B fachlich bestätigt** | Fachabläufe durch Betreiber/Fachleute bestätigt | **offen**: Ströme A/B/C laufen erst (lokale Integrationsabnahme); fachliche Bestätigung durch den Betreiber fehlt; offene Fachentscheidungen E-21, E-22 (FN-01…34), F6a/F6b (WP-14c), wp16c-fragen (WP-16c), IMP-6 Q1–Q8, WP-I4-Fragen; REVIEW-Pakete WP-15/16/16c/14c/16b/07b/19.0 |
| **C extern freigegeben** | Staging-Abnahme, Geräte, Pentest, Recht | **offen**: E-1 (Staging), E-2/E-3/E-5/E-6 (Geräte, Offline), E-4 (GPS), E-17 (Pentest), E-18/E-27/E-28/E-30 (Kanzlei/DSB), E-19 (Mitbestimmung) |
| **D produktionsreif** | Betrieb, Freigabe, Deployment | **offen**: E-7 (Restore außer Haus), E-8 (Monitoring), E-9 (Mail/Push), E-10 (Betreiber-2FA), E-11/E-12/E-13 (Umgebung `produktion`, Caddy/XFF, `.env`-Migration), E-14 (Rücksprung-Probe), E-23 (Deployment mit Checkliste), WP-09 (Merge nach `main` mit Freigabe) |

## 8. Release-Empfehlung (zweigeteilt)

- **A — lokaler RC technisch annehmbar:** **ja, mit Auflagen.** Der RC ist technisch annehmbar: CI vollständig grün, lokale Kette ohne fachlichen Fehler, Produktionsvorgaben (Import, Demo, Selbststart, Registrierung aus) an der isolierten Instanz belegt. Auflagen: (1) Als RC den Kopf **mit #271** nehmen (`bbd5e6e0` oder neuer, derzeit `ca45a0a2`), weil S0-B1 dort behoben ist; auf diesem Kopf die lokale Kette einmal ohne Parallellast wiederholen. (2) Ergebnisse der Ströme A/B/C und die offenen Abnahme-PRs #274–#277 (u. a. #277 „Einladungsbremse sperrt die Leitung nicht mehr aus“) einarbeiten; jeder Merge ist ein neuer RC. (3) S0-B2 (fachliche Browser-E2E) als bekannte Lücke führen.
- **B — RC geeignet für Betreiberfreigabe nach produktionsnaher Staging-Abnahme:** **noch nicht.** Voraussetzungen: GHCR-Bild
  und Digest für den RC (5.3 Schritt 1–2), Staging-Umstellung und Gate-Proben auf dem VPS (5.3), Browser-/Gerätetests über
  den Tunnel (Bereiche 6, 7, 14), Restore-/Rücksprung-Probe (Bereich 12, E-7/E-14), Entscheidung über #271 (S0-B1) und
  Ergebnisse der Ströme A/B/C. Danach Stufe B/C der Tabelle 7 durch Betreiber und externe Stellen.

## 9. Befunde dieses Stroms

Keiner der Befunde wurde in diesem Strom behoben (Auftrag: nicht beheben, beschreiben).

| ID | Klasse | Befund | Reproduktion | Fundstelle |
|---|---|---|---|---|
| S0-B1 | **P2** | Im RC schreibt das bloße Öffnen eines Plans in den Bestandskern: Tour-Selbststart (`tour: { offen: true, schritt: 0 }` an die eigene Person) und Urlaubshinweise (ab Oktober, in jeder Sitzung mit vollem Schreibumfang). Öffnen Planung und Leitung denselben Betrieb ohne Eingabe, erhält eine Sitzung 409 und sieht „Gleichzeitig bearbeitet“. Kein Datenverlust (Drei-Wege-Abgleich greift), aber störend und verdeckt in E2E-Läufen die Navigation. Umgehung: neu laden. | Zwei Browser-Sitzungen (Planung, Leitung) im selben Betrieb, beide nur öffnen; zweite zeigt den Konfliktdialog (Nebenbefund WP-33, Analyse `docs/acc45/WP-48-GB-ANALYSE.md` in PR #271) | `src/App.jsx:1333-1343` (Tour-Effekt, `tourGeprueft`), `src/App.jsx:1346-1381` (Urlaubshinweise); Behebung **PR #271**, nicht im RC |
| S0-B2 | **P2** (Testlücke) | Die Browser-E2E-Suite prüft nur Anmeldung und eine Planansicht je Rollenfamilie mit axe; kein fachlicher Ablauf (Betrieb anlegen, Plan veröffentlichen, stempeln, offline, krankmelden, Monatsabschluss, Mandantentrennung) läuft im echten Browser automatisiert. Die Browser-Skripte `pruefung:geraete-browser`, `geraete-ablaeufe-browser`, `darstellung-browser`, `wcag-wp40-browser`, `verlustweg-browser` laufen nur lokal (Edge), nicht in der CI. | `e2e/barrierefreiheit.spec.mjs` lesen; `package.json`/`pruefung.yml` vergleichen | `e2e/barrierefreiheit.spec.mjs:6-33`; Matrix 4.1–4.13 „E2E“ |
| S0-B3 | P3 | Kein Build-Info-Endpunkt: Die laufende Instanz nennt weder Commit noch Bauzeit (`/gesund` liefert nur `{"status":"ok"}`). Die RC-Identität ist auf Staging nur über Bilddigest und Label `org.opencontainers.image.revision` belegbar, im Browser gar nicht. | `curl /gesund` gegen die isolierte Instanz | `server.mjs:440-449`, `server/lib/gesund.mjs` |
| S0-B4 | P3 (Testanordnung) | `staging-geo.mjs` scheitert mit `einrichten 401 / anlegen 403`, wenn es nach `staging-smoke.mjs` als **zweiter Prozess** gegen dieselbe `production`-Instanz läuft: Der Faktor-Vorlauf richtet den zweiten Faktor des Verwalterschlüssels nur im ersten Prozess ein und behält den Nachweis im Speicher. In der CI wird `CENTRIC_ZWEIFAKTOR_NACHWEIS` übergeben; das Runbook `STAGING-KETTE-B.md` §5 (vor WP-32d) kennt das noch nicht. | L8 dann L9 (Abschnitt 2.1); auf frischer Instanz 30/30 (L9w) | `werkzeug/betreiber-faktor-vorlauf.mjs`, `.github/workflows/pruefung.yml` (~Zeile 962) |
| S0-B5 | P3 | Die HTTP-Prüfungen der CI laufen mit `CENTRIC_SELBSTSTART=true` und `CENTRIC_DEMO=true`; das Verhalten mit Produktionsvorgaben belegen nur die Schaltertests und die lokale Instanz (3.2). | `pruefung.yml`, Schritt „Container-Start bereitlegen“ | `.github/workflows/pruefung.yml:903-913` |
| S0-B6 | P3 (Doku) | `docs/STAGING-KETTE-B.md` (unversioniert im Hauptrepo) und `docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` (nur auf `hotfix/stempel-datenschutz-sv`) sind **nicht im RC**; die Staging-Anleitung im RC ist nur `BEREITSTELLUNG.md` §5.5. | `git ls-tree origin/integration/release-v4` | — |
| S0-B7 | Umgebung | Lokale Kette lief unter starker Parallellast (4 logische Prozessoren, Ströme A/B/C gleichzeitig mit eigenen vitest-Läufen) und mit Node 24.18.0 statt Node 22 (CI). Zeitgrenzen (5 s) wurden überschritten; Folgefehler (409/403) in zustandsbehafteten `describe`-Blöcken. Bewertung je Skript erst nach Einzelwiederholung (2.2). | — | — |
| S0-B8 | P3 (Testinfrastruktur) | `pruefung:ablage` (Dateirechte 0o600, rename EPERM), `pruefung:server` (SIGTERM) und `pruefung:zugaenge` (`jq`) scheitern unter Windows reproduzierbar, stehen aber nicht in `pruefungen/sammelpruefung-bekannt.json`; die Sammelprüfung meldet sie als „FEHLER“ statt „BEKANNT“. | `npm run pruefung:ablage` / `:server` / `:zugaenge` unter Windows | `pruefungen/ablage.test.js` („schreibt mit Rechten nur für den Eigentümer“), `pruefungen/server.test.js` („hört auf SIGTERM sauber auf“), `pruefungen/zugaenge-anlegen.test.js` („Bereitstellungsskript“) |
| S0-B9 | P3 (Testanordnung) | `einladungen.test.js` B3 vergleicht Zeitstempel zweier Prozesse ohne Toleranz; unter Windows 1 ms Versatz → rot, obwohl das Ergebnis (genau ein Gewinner) stimmt. | `npm run pruefung:einladungen` unter Windows/Last | `pruefungen/einladungen.test.js:1235` |
| S0-B10 | Umgebung | Die gemeinsame `node_modules` des Hauptrepos enthält `@playwright/test` und `axe-core` nicht (seit #262 in `package.json`); lokale Playwright-Läufe in Worktrees mit Verbindung sind dadurch nicht möglich. | `npm run e2e` im Worktree | `package.json` devDependencies |

Bewertung: **kein P0, kein P1** aus diesem Strom. S0-B1 (P2) ist auf dem Folgekopf behoben (#271).
