# Staging-Plan V4 — produktionsnahe Staging-Abnahme, kritischer Pfad, Release-Empfehlung

Auftrag: Betreiberauftrag 2026-11-13 — nach den vier lokalen Abnahmeströmen (S0 Matrix, A, B, C) einen **eigenen,
priorisierten Plan** für die noch erforderliche **produktionsnahe Staging-Abnahme**, einen **aktualisierten kritischen
Pfad** bis zum ersten sicheren Go-live und die **zweigeteilte Release-Empfehlung** vorlegen.

Art dieses Dokuments: **reiner Plan.** Nichts hiervon wurde ausgeführt. Kein VPS, keine Produktion, kein SSH, kein
Deployment, kein Merge nach `main`, keine Änderung an GitHub-Rechten. Alle Zahlen zu Aufwand und Dauer sind
**Schätzungen** mit den in Abschnitt 8.4 genannten Annahmen; Ergebnisse werden nur zitiert, wenn sie in einem der
Quelldokumente belegt sind.

Quellen (gelesen am 2026-11-13, nach `git fetch origin`):

| Quelle | Ort |
|---|---|
| Matrix, RC, Baseline, VPS-Schritte, Betreiberfragen (S0) | `docs/acc45/ABNAHME-V4-MATRIX.md` auf `origin/docs/abnahme-v4-matrix` (PR #278) |
| Strang A (Bereiche 1–5, 11) | `docs/acc45/ABNAHME-V4-STRANG-A.md` auf `origin/feature/abnahme-v4-strang-a-sq` (PR #275) |
| Strang B (Bereiche 6–10, 14) | `docs/acc45/ABNAHME-V4-STRANG-B.md` auf `origin/feature/abnahme-v4-strang-b` (PR #274) |
| Strang C (Bereiche 12, 13, 15, 16) | `docs/acc45/ABNAHME-V4-STRANG-C.md` auf `origin/feature/abnahme-v4-strang-c` (PR #276) |
| Befund A-2, Einladungsbremse | PR #277 (`fix/einladungsbremse-je-raum`) |
| Staging Kette B (2026-11-02) | `docs/STAGING-KETTE-B.md` — **nur im Arbeitsverzeichnis des Hauptrepos, nicht versioniert** (S0-B6) |
| Test- und Abnahmeplan, Gerätematrix Stufe F | `docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` — **nur lokal** (in `.git/info/exclude`, auf keinem Branch) |
| Betrieb | `BEREITSTELLUNG.md` (Schritt 2, 3.1, 3.2, 5.4, 5.5, 5.7, 5.8, Schritt 6), `deploy/compose.yml`, `deploy/caddy/Caddyfile.vorlage`, `docs/CADDY-UND-XFF.md` §7, `deploy/FREIGEGEBENE-IMAGES.md` |
| Frühere Staging-Läufe | `docs/PHASE-A1-STAGING-REPORT.md` (2026-10-10, inkl. Restore und Rollback), `docs/PRE-PRODUCTION-GATE.md` §8 |
| Steuerung | `docs/acc45/work-packages.json` (SSOT, 202 Pakete), `docs/acc45/STATUS.md`, `docs/acc45/GESAMTPLAN.md` §7, `docs/acc45/WIEDERAUFNAHME.md`, `docs/acc45/BETREIBER-BRANCHSCHUTZ.md`, `docs/acc45/ENTSCHEIDUNG-BETREIBER-2026-11-13.md` |
| Workflows | `.github/workflows/deploy.yml` („Auslieferung“), `pruefung.yml`, `sicherheit.yml`, `lieferkette.yml`, `betrieb-deploy.yml`, `betrieb-sicherung.yml` |

---

## 1. Zusammenfassung und ehrlicher Stand

**Kurz:** Der Integrationsstand ist **lokal und in der CI technisch geprüft**, aber **nicht produktionsnah abgenommen**.
Kein Teil der vier Ströme lief mit dem ausgelieferten Docker-Bild hinter Caddy mit TLS, mit der Compose-Härtung des VPS,
mit realistischer `.env`, auf echten Telefonen oder mit einem echten Restore/Rücksprung auf einem Linux-Host. Diese Lücke
schließt nur eine Staging-Abnahme (SSOT-Paket **E-1**, dazu E-2/E-3/E-5/E-6, E-7, E-14).

### 1.1 Was die lokale Integrationsabnahme belegt hat

| Belegt | Quelle |
|---|---|
| RC `0638c101` (Merge #270): CI vollständig grün (Prüfung inkl. Bildbau und ~30 HTTP-Prüfungen je frischem gehärteten Container, Browser-Abnahme 57 bestanden/7 planmäßig übersprungen; Sicherheit; Lieferkette; Deploy-Skripte gegen Docker-Stub). Folgeköpfe `bbd5e6e0` (#271) und `ca45a0a2` (#272): CI grün | Matrix §1.1 |
| Lokale Kette `npm run pruefung` (Windows): 160 bestanden, 4 plattformbedingt nicht ausführbar (in CI Linux grün), 0 fachlich rot | Matrix §2.3 |
| Isolierte lokale Instanz mit **Produktionsvorgaben** (`NODE_ENV=production`, eigener Pfeffer): Demo 403, Selbststart 403, Registrierung 404, Import 404; Gate-Proben Smoke 51/51, Geo 30/30 (frische Instanz), Aufräumen 18/18 und 17/17 | Matrix §3, L7–L10 |
| Strang A: 41 vorhandene Prüfungen bestanden, 1 nicht ausführbar (`jq`), neue API-Abläufe 24/24 und Browser-Spec 6/6; Befunde A-2 (P2, Fix PR #277), A-3 (P2), A-4 (P3), A-5 (P2, Fix #272 gemergt) | Strang A §2–3 |
| Strang B: 43 vitest-Dateien bestanden, neue Abläufe 4/4, Browser-Volllauf 8 Viewports **102 bestanden, 0 fehlgeschlagen**; Befunde B-1/B-2 (P3, axe-Ausnahme), B-3 (P3, Prüfwerkzeug) | Strang B §1, §3.8 |
| Strang C: 42 Dateien bestanden, 2 nur Windows-rot (CI grün); Sicherung/Wiederherstellung **auf Bibliotheks- und Prozessebene** byteweise belegt; Schalter-Matrix 21/21; Bundle ohne KI-Hosts/Schalternamen/Sourcemaps; Befunde C-1 (P3, Start ohne Pfeffer nicht verweigert), C-2, C-3 (Hinweise) | Strang C |
| Kein P0, kein P1 in allen vier Strömen | alle vier |

### 1.2 Was ausdrücklich **nicht** belegt ist

| Nicht belegt | Warum | Schließt |
|---|---|---|
| Das **ausgelieferte Bild** des RC (GHCR-Digest) | Für `0638c101`/`ca45a0a2` wurde „Auslieferung“ nicht ausgelöst: **kein Bild, kein Digest** | Betreiberaktion O-2 |
| Compose-Härtung des VPS mit Staging-`.env` (`read_only`, uid 1000, `/zustand`, Healthcheck, `restart`, Speicherlimit) | lokal kein Docker; CI startet das Bild per `docker run`, nicht per `deploy/compose.yml`, und mit `CENTRIC_SELBSTSTART=true`/`CENTRIC_DEMO=true` (S0-B5) | ST-B (Abschnitt 4) |
| Caddy, TLS, HSTS über den Proxy, `X-Forwarded-For`/`CENTRIC_VERTRAUTE_PROXYS`, Origin mit echtem Hostnamen, Cookies `Secure` | lokal HTTP ohne Proxy; Staging nach BEREITSTELLUNG §5.5 **ohne** Caddy | ST-C |
| Service Worker/PWA unter HTTPS, Installation | in Playwright gesperrt, lokal HTTP | ST-D, Geräte |
| Echte Android-/iOS-Geräte, Tablet, Bildschirmleser, Textvergrößerung, echtes Funkloch | nur Chromium-Emulation | Abschnitt 6 (E-2/E-3/E-5/E-6) |
| Sicherung, Restore in leeres Verzeichnis, Rücksprung A→B→A **im Container auf Linux** mit echtem Compose | lokal Windows; `ruecksprung.sh` nur gegen Docker-Stub | Abschnitt 5 (E-7-Teil, E-14-Probe) |
| Mail-/Push-Zustellung, Alarmweg | keine Anbieter konfiguriert | E-9, E-8 |
| Dauerbetrieb (Löschlauf, Überwachung, Bremsfenster über Stunden), Last | nur kurze Läufe; Lastnachlauf E-20 offen | ST-F |
| Produktionsmodus im durchgehenden Fachablauf (zweiter Faktor Pflicht) | Strang A lief mit `NODE_ENV=development` | ST-E |
| Fachliche Bestätigung durch Betreiber/Fachleute | nicht Teil der Ströme | Stufe B (Abschnitt 9) |

**Ehrliches Urteil:** Die lokalen Ergebnisse sind eine belastbare **technische** Grundlage (Stufe A). Sie sind **keine**
Staging-Abnahme und ersetzen keine. Ein Go-live allein auf dieser Grundlage wäre nicht sicher.

### 1.3 Stand der Umgebungen (zu bestätigen)

- Integrationskopf heute: `ca45a0a2` (Merge #272). Offen gegen ihn: #274, #275, #276 (Strang-Dokumente samt neuer Prüfungen),
  #277 (A-2, Codeänderung), #278 (Matrix). Alle fünf stehen auf `UNSTABLE`; der rote Job ist `interne-pruefung` (laut
  Koordinator ein Secret-Scan-Treffer auf einem **veralteten** Branch; Entscheidung des Betreibers offen, O-4).
- **Produktion:** Die Matrix nennt `64d08a4` (Bild `f03a8514…`). `deploy/FREIGEGEBENE-IMAGES.md` führt dagegen
  `sha256:0b192927…` (`274bfa0`, H8+, 2026-11-02) als **`aktiv`** und `f03a8514…` als **`gesperrt`** (P0-0). Welches Bild
  wirklich läuft, ist vom Betreiber lesend zu bestätigen (Frage F-1 in Abschnitt 7). Für den Rücksprung-Nachweis ist das
  entscheidend: `f03a8514…` darf nie Rücksprungziel sein.
- **VPS-Staging** (`/opt/apps/centric-staging`): zuletzt belegt am 2026-11-02 (Kette B, Bild `de43c056…`); danach laut
  Betreiberstand ein Browsertest auf `a379095`. Aktueller Zustand unbekannt (Matrix §5.1, Fragen 1–7).

---

## 2. Lässt sich ein isoliertes Staging unabhängig von der Produktion aufsetzen?

**Ja.** Vier Varianten sind realistisch. Sie decken unterschiedliche Teile ab; keine allein deckt alles.

### 2.1 Variante O1 — `centric-staging` neben der Produktion auf demselben VPS (heutiges Muster)

Belegt dreimal (Phase A.1 2026-10-10, Pre-Production-Gate, Kette B 2026-11-02): eigenes Verzeichnis, eigenes
Compose-Projekt, eigener Container/Alias, eigene Daten (eigene Inodes), **eigener Pfeffer** (Prüfwert ≠ Produktion),
nur Netz `proxy`, keine Ports, kein Caddy-Eintrag, Bild per Digest, Prüfungen per `docker exec` oder kurzlebigem
Probe-Container, Browser nur über SSH-Tunnel.

| Vorteile | Nachteile / Risiken des gemeinsamen Hosts |
|---|---|
| vorhanden, Verfahren erprobt (Sicherung, Restore 477/477 bytegleich, Rollback und Vorwärts in A.1) | **ein Docker-Daemon, ein Kernel, eine Platte, ein RAM** für Produktion und Staging: ein voller Datenträger, ein OOM oder ein Daemon-Neustart trifft beide |
| identisches Host-Betriebssystem, Docker-Version, Dateisystem und Bind-Mount-Semantik (uid 1000) wie die Produktion — für Restore/Rechte/Rücksprung am realistischsten | **Netz `proxy` ist gemeinsam**: Der Staging-Container kann `centric-dp-web:3000` direkt erreichen. Stünde in der Produktion das ganze `proxy`-Subnetz in `CENTRIC_VERTRAUTE_PROXYS`, könnte Staging dort seine Herkunft fälschen (CADDY-UND-XFF §7 „nicht empfohlen“) |
| keine Zusatzkosten | Bedienfehler mit Produktionsfolgen: falscher Projektname in `docker compose`, falsches Verzeichnis, `docker compose config` ohne `--no-env-resolution` zeigt Geheimnisse |
| | **Caddy/TLS nicht prüfbar**, ohne die Caddy-Konfiguration der **Produktion** anzufassen (Port 443 gehört dem Produktions-Caddy); damit kein HSTS/XFF/Origin/Cookie-Nachweis über den echten Weg |
| | echte Telefone kommen nicht heran (kein DNS, kein Port; Tunnel auf dem Telefon unpraktisch, Service Worker braucht HTTPS mit vertrauenswürdigem Zertifikat) |
| | Last- und Dauerläufe belasten die Produktion |

Härtung, falls O1 genutzt wird: Staging in ein **eigenes** Netz (`staging-intern`, `internal: true`) statt `proxy`;
eigener Staging-Caddy nur in diesem Netz, an `127.0.0.1:<hoher Port>` des Hosts gebunden, `tls internal`, Zugriff nur per
SSH-Tunnel. Für Telefone wäre zusätzlich ein privater Zugang nötig (z. B. ein tsnet-/Tailscale-Helfer mit eigenem
HTTPS-Namen, wie im Testplan Stufe F vorgeschlagen) — das ist ein Drittanbieter und eine eigene Betreiberentscheidung.

### 2.2 Variante O2 — eigener kleiner VPS/VM nur für Staging (empfohlen)

Ein zweiter, kleiner Server (gleiches Betriebssystem und gleiche Docker-Version wie die Produktion), eigene Subdomain
z. B. `staging.centric-dienstplanung.de` mit Let's-Encrypt-Zertifikat, Caddy aus `deploy/caddy/Caddyfile.vorlage` mit
geändertem Hostnamen, Compose aus `deploy/compose.yml` mit eigenem Projektnamen, Zugang auf Freigabeliste (IP-Allowlist
und zusätzlich Basic-Auth in Caddy vor der Anwendung).

| Vorteile | Nachteile |
|---|---|
| **vollständige Trennung**: kein gemeinsamer Daemon, kein gemeinsames Netz, kein gemeinsamer Datenträger, keine Pfeffer-/Datenverwechslung möglich | laufende Kosten (kleiner Monatsbetrag; Betreiber beauftragt — Preis hier nicht geschätzt) |
| **echter Caddy, echtes TLS, echter Hostname**: HSTS, XFF, Origin, Cookies, Body-Grenzen, HTTP→HTTPS, Service Worker, PWA-Installation prüfbar | Einrichtung ca. 1–2 Betreibertage (Schätzung), DNS-Eintrag |
| echte Telefone über das Internet erreichbar (hinter Allowlist/Basic-Auth) | Abweichung von der Produktion möglich (Kernel, Docker-Version, Dateisystem) — muss beim Einrichten festgehalten und angeglichen werden |
| Last-, Dauer- und Zerstörungsproben (voller Datenträger, Kill, Neustart) ohne Produktionsrisiko | Hoster-AVV (E-32) gilt auch hier, auch wenn nur synthetische Daten liegen |
| kann nach der Abnahme als **isolierte Testinstanz für den internen Piloten** (synthetische Daten, Betreiberentscheidung 2026-11-04) weiterlaufen | Basic-Auth vor der Anwendung verändert den Anmeldeweg leicht (zusätzlicher Dialog) — für Geräteprüfungen dokumentieren |

Wichtig: `VITE_ANWENDUNG_URL` wird **beim Bauen** eingesetzt (BEREITSTELLUNG Schritt 2). Das RC-Bild trägt die
Produktionsadresse. Die Origin-Prüfung (`herkunftErlaubt`, `server/lib/schutz.mjs`) nutzt `Host`/`X-Forwarded-Host`
und funktioniert mit jedem Hostnamen; Links in Mails (`CENTRIC_BASIS`) und Verweise im Bundle zeigen aber auf die
Produktionsadresse. Für Staging deshalb `CENTRIC_BASIS=https://staging.…` setzen und **dasselbe** Bild verwenden
(kein eigenes Staging-Bild, sonst ist es nicht der RC); Restabweichung im Bundle-Text dokumentieren.

### 2.3 Variante O3 — Docker Desktop auf dem Rechner des Betreibers

| Vorteile | Nachteile |
|---|---|
| keine Kosten, kein VPS-Risiko | Windows + WSL2: Bind-Mounts über eine Zwischenschicht, uid/Dateimodus-Semantik (0600, `rename`) wie in C-3 **nicht** repräsentativ — gerade Restore/Rechte sind dort wenig aussagekräftig |
| schnell für Bild-, Header-, Schalterproben | TLS nur mit eigener CA (`tls internal`/mkcert); Telefone müssen der CA vertrauen (iOS: Profil installieren und Vollvertrauen einschalten) — fehleranfällig, nicht produktionsnah |
| | Rechner muss für Gerätetests im selben Netz laufen; Lizenzbedingungen von Docker Desktop prüfen |
| | heute **nicht installiert** (Strang C) |

### 2.4 Variante O4 — GitHub-gehosteter Runner: Compose + Caddy + Playwright gegen das Bild

Ein neuer, manuell auslösbarer Workflow (Vorschlag: „Staging-Gate“) zieht das RC-Bild **per Digest** aus GHCR, startet
es mit `deploy/compose.yml` (Projektname `centric-staging-ci`), davor Caddy aus der Vorlage mit `tls internal` und
Hostnamen `staging.test` (Eintrag in `/etc/hosts`, Caddy-Root-CA in den Trust-Store des Runners), und führt die Proben aus
Abschnitt 4 sowie die Playwright-Suite **über HTTPS durch Caddy** aus; dazu Sicherung/Restore/Rücksprung (Abschnitt 5)
mit dem vorherigen freigegebenen Digest.

| Vorteile | Nachteile |
|---|---|
| reproduzierbar, je RC automatisch, null Produktionsrisiko, kein Betreiberaufwand je Lauf | kein echter Hostname/öffentliches Zertifikat (eigene CA), keine echten Telefone |
| prüft genau das Bild per Digest, die Compose-Datei und die Caddy-Vorlage aus dem Repo | nicht der Produktionshost (Kernel, Docker-Version, Dateisystem des Runners) |
| deckt Härtung, Header, XFF (Fälschungsversuch am Proxy vorbei), Origin, Body-Grenzen, Cookies, Startverweigerung, Restore-Bytevergleich, Rücksprung A→B→A ab | begrenzte Laufzeit je Job (kein Dauerbetrieb über Tage) |
| | **Codeänderung** (neuer Workflow + Probenskript) — eigenes Paket mit PR, CI, Review; nicht Teil dieses Doku-Auftrags. Braucht nur `packages: read` |

### 2.5 Empfehlung

1. **O4 als automatisches Staging-Gate** für alles Deterministische (Abschnitt 4: ST-B, ST-C, ST-G, Teile von ST-D/ST-E;
   Abschnitt 5 im Runner). Neues Arbeitspaket, Vorschlag **WP-ST1**, Agentenaufwand 2–4 PT (Schätzung). Läuft je RC.
2. **O2 als produktionsnahe Staging-Umgebung** für E-1: echter Hostname, öffentliches TLS, echte Telefone (E-2/E-3/E-5/
   E-6), Dauerlauf, Mail/Push-Zustellung (E-9) mit Sandbox-Zielen, Sicherung/Restore/Rücksprung auf Linux mit
   Compose (Abschnitt 5). Danach als isolierte Testinstanz für den internen Piloten (synthetische Daten) nutzbar.
3. **O1 nur, wenn der Betreiber O2 ablehnt** — dann in der gehärteten Form (eigenes internes Netz, kein `proxy`,
   Staging-Caddy nur auf `127.0.0.1`, Zugriff per Tunnel), **ohne** Änderung am Produktions-Caddy; Telefone dann nur über
   einen privaten HTTPS-Zugang (Betreiberentscheidung). Last- und Zerstörungsproben in O1 **nicht** ausführen.
4. **O3 nicht** als Abnahmeumgebung; höchstens als Werkbank des Betreibers.

Der Rücksprung-Nachweis **auf dem Produktionshost** selbst (E-14, A→B→A) bleibt unabhängig davon ein eigener,
freigabepflichtiger Schritt kurz vor dem Go-live (Abschnitt 8).

---

## 3. Fehlende Voraussetzungen

| # | Voraussetzung | Stand heute | Wer | Aufwand (Schätzung) |
|---|---|---|---|---|
| V-1 | **RC festlegen**: Kopf nach Merge von #277 (A-2) und der Strang-PRs #274–#276/#278, danach Fixes A-3/A-4 und C-1 (falls entschieden), lokale Kette einmal **ohne** Parallellast wiederholen | RC-Kandidat `ca45a0a2`; #274–#278 `UNSTABLE` (Secret-Scan) | Koordinator; Merge-Freigaben Betreiber | 2–7 AT |
| V-2 | **Bild bauen**: Actions → „Auslieferung“ → `workflow_dispatch` auf `integration/release-v4` am RC-Commit, `bauen=true`, `ausliefern=false`. Der Job `bild` läuft nach `pruefung` und `sicherheit` (inkl. `browser-abnahme`, der Playwright-Browser aus dem Netz lädt) | nicht ausgelöst; **kein GHCR-Bild, kein Digest** | **Betreiber** (Agenten lösen keine Auslieferung aus) | 15 min Betreiber + ca. 40–60 min Laufzeit |
| V-3 | **Digest belegen**: Lauf-ID, Manifest-Digest `sha256:…`, Label `org.opencontainers.image.revision` = RC-SHA; Kennzeichen ist der volle Commit-Hash (kein `latest` außerhalb `main`) | — | Betreiber liest ab, Koordinator dokumentiert | 15 min |
| V-4 | **Freigabeliste für Staging**: `digest-pruefen.sh` lässt nur `aktiv`/`vorherig` aus `FREIGEGEBENE-IMAGES.md` zu. Vorschlag: auf dem **Staging-Host** eine eigene Kopie der Liste (RC = `aktiv`, `0b192927…` = `vorherig`); im Repo den RC erst nach Abnahme eintragen. Alternativ eine Statusspalte `staging` (Skriptänderung, eigenes Paket) | ungeklärt (Matrix §5.2) | Betreiberentscheidung, Umsetzung Koordinator | 0,5 AT |
| V-5 | **Staging-Umgebung** nach Abschnitt 2 (O2: VM, gleiches OS/Docker wie Produktion; O1: Härtung prüfen) inkl. `zustand/` (uid 1000, 0700) und `CENTRIC_ZUSTAND=/zustand` | O2 nicht vorhanden; O1-Zustand unbekannt | **Betreiber** | O2: 1–2 AT; O1: 0,5 AT |
| V-6 | **Domain/TLS**: O2 `staging.centric-dienstplanung.de` (A/AAAA-Eintrag, Let's Encrypt über Caddy); O1/O4 `tls internal` mit eigener CA; selbstsigniert nur für O4 | fehlt | Betreiber (DNS) | 0,25 AT + DNS-Wartezeit |
| V-7 | **Caddy-Konfiguration** aus `Caddyfile.vorlage` mit Staging-Hostname, plus Basic-Auth und IP-Allowlist vor der Anwendung; Caddy mit **fester Adresse** im Staging-Netz | fehlt | Betreiber, Vorlage vom Koordinator | 0,25 AT |
| V-8 | **Staging-`.env`** (Rechte 600): `CENTRIC_PFEFFER` **eigener** (`openssl rand -base64 32`, Prüfwert ≠ Produktion, Kopie in Passwortmanager), `IMAGE_DIGEST`, `CENTRIC_VERTRAUTE_PROXYS=<feste Staging-Caddy-Adresse>`, `CENTRIC_BASIS=https://staging.…`; **nicht gesetzt**: `CENTRIC_ADMIN` (nur kurzlebig im Probe-Container), `CENTRIC_SELBSTSTART`, `CENTRIC_DEMO`, `CENTRIC_PUBLIC_REGISTRATION`, `CENTRIC_IMPORT_AKTIV`, `CENTRIC_TEILSPEICHERUNG`, `CENTRIC_HILFE_ASSISTENT`; Mail/Push zunächst **aus** (`RESEND_API_KEY`, `VAPID_*` leer), für E-9 getrennt mit Sandbox-Zielen; `CENTRIC_ALARM_WEBHOOK` leer oder Test-Kanal | fehlt | Betreiber | 0,25 AT |
| V-9 | **2FA**: Betreiber- und Leitungszugänge auf Staging mit eigener Authenticator-Instanz (Testkonten), Ersteinrichtungscode-Weg (OPT-1-F Option A) | fehlt | Betreiber | 0,25 AT |
| V-10 | **Synthetische Daten**: Seeds SD-P/SD-S (`docs/acc45/PILOT-SEEDS.md`) nur mit Markerdatei `.centric-test-umgebung`; Konten mit `example.org`; **nie** ein Abzug aus der Produktion | fehlt | Koordinator (Skript), Betreiber (Start) | 0,5 AT |
| V-11 | **Sicherungsziel** für den Nachweis: lokales Verzeichnis `sicherungen/` (uid 1000, 0700) auf dem Staging-Host plus ein **zweites** Ziel außerhalb des Hosts (für E-7-Teilprobe, restic oder `rsync`); restic-Passwort im Passwortmanager | fehlt; E-7 Speicherziel offen | Betreiber | 0,5 AT + Anbieterwartezeit |
| V-12 | **Echte Geräte**: Android aktuell (Pixel des Betreibers), Android älter, iPhone aktuelles iOS, iPhone/iPad Vorgängerversion, Tablet (E-3/E-5: iPhone beschaffen oder leihen) | iPhone fehlt | Betreiber | Wartezeit 0–10 AT |
| V-13 | **Testkonten je Rolle** (Betreiber, Leitung, Planung, SV, Beschäftigte ×2, Betriebsrat) in zwei Testbetrieben (Mandantentrennung), je mit `example.org`-Adresse und eigenem Faktor | fehlt | Koordinator legt Liste an, Betreiber richtet ein | 0,5 AT |
| V-14 | **Browserzugang** für die Ströme: O2 direkt (Allowlist); O1 nur per SSH-Tunnel (eigene Freigabe, Matrix §5.1 Frage 7) | fehlt | Betreiber | 0,1 AT |
| V-15 | `docs/STAGING-KETTE-B.md` und `docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` **versionieren** (heute nur lokal, S0-B6), damit Runbook und Gerätematrix im RC liegen | fehlt | Koordinator (Doku-PR) | 0,25 AT |
| V-16 | Runbook-Nachtrag zu S0-B4: je Gate-Probe eigener kurzlebiger Probe-Container oder `CENTRIC_ZWEIFAKTOR_NACHWEIS` übergeben | fehlt | Koordinator (Doku) | 0,1 AT |

---

## 4. Prüfungen, die nur mit Docker, echtem Caddy, TLS und realistischer Umgebung aussagekräftig sind

Umgebung: **R** = Runner (O4), **S** = Staging O2 (bzw. O1 gehärtet). Jede Prüfung wird mit **bestanden / nicht
bestanden / nicht ausführbar (Grund)** protokolliert; fehlende Prüfung zählt nie als Erfolg. Keine Ausgabe von
Geheimnissen; `docker compose config` nur mit `--no-env-resolution`.

### ST-B — Container und Compose-Härtung

| ID | Prüfung | Erwartung | Umg. |
|---|---|---|---|
| ST-B1 | `docker inspect <web> --format '{{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'` | Bild-ID = Digest des RC, Label = RC-SHA | R, S |
| ST-B2 | `docker exec <web> id -u; id -g` | `1000`/`1000` | R, S |
| ST-B3 | `docker exec <web> sh -c 'touch /app/x'` bzw. Node-Einzeiler, falls keine Shell | scheitert (read-only); `/tmp` und `/data` beschreibbar; `/zustand` beschreibbar, Modus 0700 | R, S |
| ST-B4 | `docker exec <web> grep -E 'CapEff|NoNewPrivs' /proc/1/status` | `CapEff: 0000000000000000`, `NoNewPrivs: 1` | R, S |
| ST-B5 | `docker inspect` → `HostConfig.Memory`, `RestartPolicy`, `ReadonlyRootfs`, `PortBindings`, Netze | 512 MiB, `unless-stopped`, `true`, **keine** Port-Bindung, nur das vorgesehene Netz | R, S |
| ST-B6 | Healthcheck: `docker inspect --format '{{.State.Health.Status}}'` nach Start | `healthy` binnen `start_period` + 3 Intervalle | R, S |
| ST-B7 | Neustartverhalten: Node-Prozess im Container hart beenden (`docker kill --signal KILL`) | Container startet wieder (`unless-stopped`), wird `healthy`, Daten unverändert (Bytevergleich gegen Vorher-Liste) | S |
| ST-B8 | sauberes Beenden: `docker compose stop` während einer Schreiblast | Exit 0 binnen 10 s, `.prozess`-Sperre entfernt, kein halber Stand (`ablage-pruefen.mjs` Exit 0) — schließt R-C2/C-3 | R, S |
| ST-B9 | Recreate: `docker compose rm -f -s` + `up -d --pull never` | neue Id, `healthy`, Konfiguration und Daten unverändert (wie A.1 §15) | S |
| ST-B10 | Zeitzone/Uhr im Container: Stempeln kurz vor/nach Mitternacht und am Monatswechsel (Europe/Berlin) | Tages- und Monatszuordnung wie in den Unit-Tests | S |
| ST-B11 | Ausgehender Verkehr: Egress-Mitschnitt des Containers (Host-Firewall-Log oder `conntrack`) während Smoke | keine Verbindung nach außen, solange Mail/Push aus sind | S |

### ST-C — Proxy, TLS, Köpfe, Herkunft

| ID | Prüfung | Erwartung | Umg. |
|---|---|---|---|
| ST-C1 | `curl -sI http://<host>/` | Weiterleitung 308 auf HTTPS | S |
| ST-C2 | `curl -sI https://<host>/` | genau **ein** `Strict-Transport-Security: max-age=31536000; includeSubDomains`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: SAMEORIGIN`; `Referrer-Policy`; `Permissions-Policy` mit `geolocation=(self), camera=()…`; CSP der Anwendung (`default-src 'self'; script-src 'self'; … object-src 'none'`) unverändert durch Caddy; kein `Server`/`X-Powered-By` | R, S |
| ST-C3 | Zertifikat: Kette, Gültigkeit, Hostname; TLS-Protokolle (nur 1.2/1.3) | gültig (O2 öffentlich; R eigene CA) | R, S |
| ST-C4 | Start-Log nach `CENTRIC_VERTRAUTE_PROXYS=<Caddy-Adresse>` | „X-Forwarded-For wird von 1 vertrauten Einträgen angenommen“, **keine** `WARNUNG: Anfrage mit X-Forwarded-For`; `/einrichten/umgebung` → `vertrauteProxys: true` (CADDY-UND-XFF §7) | R, S |
| ST-C5 | XFF-Fälschung über Caddy: Client sendet `X-Forwarded-For: 203.0.113.9` | Server sieht die echte Client-Adresse (Caddy ersetzt den Kopf); Bremse und Protokoll zählen die echte Adresse | R, S |
| ST-C6 | XFF-Fälschung **am Proxy vorbei**: Probe-Container im Staging-Netz ruft `web:3000` direkt mit gefälschtem XFF | Kopf verworfen, Gegenstelle zählt | R, S |
| ST-C7 | Bremse je echter Herkunft: 9 Fehlanmeldungen von Client A, dann Anmeldung von Client B | A gesperrt (429), B frei; nach Merge von #277: Leitung lädt ≥ 25 Personen ein, Absagen anderer Rollen sperren sie nicht | R, S |
| ST-C8 | Origin-Prüfung mit echtem Hostnamen: zustandsändernde Anfrage mit `Origin: https://<host>` vs. `Origin: https://evil.example` vs. ohne Origin mit Account-Cookie | 2xx / 403 / 403 (strengere Cookie-Prüfung, `sec-fetch-site`) | R, S |
| ST-C9 | Cookie-Flags des Account-Cookies über HTTPS | `Secure`, `HttpOnly`, `SameSite` wie im Code (`server/lib/accountanmeldung.mjs`) — Sollwert **vor** dem Lauf aus dem Code festhalten, nicht aus dem Ergebnis ableiten | R, S |
| ST-C10 | Rumpfgrenzen durch Caddy: `PUT /api/bestand` 6 MB + 1 Byte; Anmeldung > 16 KB; Einladung > 4 KB | Ablehnung (413 bzw. Code der Anwendung) ohne Teilschreiben; Caddy-Vorlage setzt **keine** eigene `request_body`-Grenze → festhalten, ob gewollt (Pentest-Hinweis) | R, S |
| ST-C11 | Proxy-Zeitgrenzen: langsame Antwort > 60 s (`response_header_timeout`) | definierter 502/504, Stempel nicht doppelt (Idempotenz `clientEventId`) | R |
| ST-C12 | Gemischte Inhalte: Playwright sammelt Konsole auf allen Seiten der Suite | keine `Mixed Content`- und keine CSP-Verletzungsmeldung | R, S |
| ST-C13 | Zwischenspeicher: zwei Mandanten parallel, gleiche URLs | keine fremde Antwort (kein Cache von API-Antworten; `Cache-Control` der API prüfen) | S |

### ST-D — PWA, Service Worker, Benachrichtigungen

| ID | Prüfung | Erwartung | Umg. |
|---|---|---|---|
| ST-D1 | Manifest und Service Worker über HTTPS (Desktop-Chrome DevTools/Playwright mit SW erlaubt) | SW registriert, Scope korrekt, Manifest installierbar | R, S |
| ST-D2 | Aktualisierung: Bild A → Bild B (gleiche Origin) | neuer SW übernimmt nach dokumentiertem Weg, kein veraltetes Bundle gegen neue API | S |
| ST-D3 | Offline-Start der Hülle nach erstem Besuch | Hülle lädt, klare Offline-Anzeige, keine Datenansicht aus fremdem Mandanten | R, S |
| ST-D4 | Mail/Push **aus** (Vorgabe) | keine Zustellversuche, Oberfläche zeigt keinen Fehler; Log ohne Geheimnisse | R, S |
| ST-D5 | E-9 getrennt: Mail an eigene Testpostfächer (verifizierte Absenderdomain, SPF/DKIM/DMARC), Push an Testgeräte (VAPID-Paar vollständig) | Einladung, „Plan freigegeben“, Krankmeldung kommen an; Links zeigen auf `CENTRIC_BASIS` | S |

### ST-E — Produktionsvorgaben, Schalter, Startverweigerung

| ID | Prüfung | Erwartung | Umg. |
|---|---|---|---|
| ST-E1 | Schalter aus im **Bild mit Staging-`.env`** (nicht CI-Container, S0-B5): `POST /api/registrierung` | 404 `nicht-verfuegbar`, **keine** Datei unter `/data` neu | R, S |
| ST-E2 | `POST /starten`, `POST /api/demo`, `GET /api/demos` | 403, 403, `{"demos":[]}` | R, S |
| ST-E3 | `POST /api/import/analyse` und alle `/api/import/*` | 404 | R, S |
| ST-E4 | KI/Hilfe/Teilspeicherung mit gültiger Leitungssitzung: `/api/hilfe/status`, `/api/hilfe/frage`, `/api/ki`, `/api/bestand/teile` | aus (404/403 laut Schaltertests), keine Route für Intelligence | R, S |
| ST-E5 | Ausgeliefertes Bundle (per `curl` von `https://<host>/assets/*.js`) nach `anthropic`, `api.openai`, `claude.ai`, `CENTRIC_KI`, `CENTRIC_IMPORT_AKTIV`, `x-api-key`, `sourceMappingURL` durchsuchen | 0 Treffer (wie Strang C lokal, jetzt gegen das Bild) | R, S |
| ST-E6 | Modul-Registry im Bild | alle zwölf WP-19-Module `geplant`, Schreibwege zu (`modul-b1-schreibweg`) | R, S |
| ST-E7 | kein Debug: fehlerhaftes JSON, unbekannte Route, `/.env`, `/debug` | 400/404 ohne Stacktrace; `/.env` liefert `index.html` (C-2, bekannt, kein Datenabfluss) | R, S |
| ST-E8 | **Startverweigerung** bei unsicherer Konfiguration: (a) ungültige `CENTRIC_VERTRAUTE_PROXYS`, (b) belegte Ablage, (c) **fehlender `CENTRIC_PFEFFER`** (C-1), (d) fehlendes `IMAGE_DIGEST`, (e) fehlendes `/zustand` | (a)(b) Start verweigert; (c) **heute Start mit 200** — Sollverhalten nach Betreiberentscheidung O-6 (Verweigerung oder laute Warnung); (d) Compose bricht ab; (e) Faktor-Aktivierung 503 (fail-closed), übrige Funktionen laufen | R |
| ST-E9 | durchgehender Fachablauf **mit Faktorpflicht** (`NODE_ENV=production`): Betreiber legt Betrieb an, Leitung richtet Faktor ein (Ersteinrichtungscode), lädt Rollen ein, Planung veröffentlicht, Beschäftigte sieht Dienst | jeder Schritt erfolgreich; ohne frischen Faktor 403 | S |
| ST-E10 | Logs ohne Personendaten: nach dem vollen Lauf Server-Log nach allen synthetischen Markern (Namen, `example.org`-Adressen, Zugangscodes, Schlüssel, Koordinaten) durchsuchen | 0 Treffer; nur gerundete Entfernungen | R, S |

### ST-F — Gate-Proben, Browser-Abläufe, Dauerbetrieb

| ID | Prüfung | Erwartung | Umg. |
|---|---|---|---|
| ST-F1 | Gate-Proben je **eigenem** kurzlebigen Probe-Container (gleiches Bild, Staging-`.env` per `--env-file`, Datenkopie der geprüften Wiederherstellung, `--network none`, gehärtet, `CENTRIC_ADMIN` nur über die Prozessumgebung): `staging-smoke`, `staging-geo`, `staging-aufraeumen` | Smoke, Geo, Aufräumen bestanden (Zählung protokollieren); Schlüssel danach in keinem Log, keiner Datei, keiner Shell-Variable | S |
| ST-F2 | `werkzeug/staging-abnahme-3.mjs --ziel https://<host>` | PASS-Zählung, die MANUELL-Punkte im Browser abhaken | S |
| ST-F3 | Playwright-Suiten der Ströme A/B (`e2e/barrierefreiheit`, `e2e/abnahme-a-ablauf`, `e2e/abnahme-b-ablaeufe`) **gegen `https://<host>`** statt Entwicklungsserver | gleiche Zählung wie lokal/CI, keine Konsolenfehler | R, S |
| ST-F4 | Zwei echte Sitzungen (Planung, Leitung) öffnen denselben Plan | **kein** 409 beim bloßen Öffnen (S0-B1, behoben in #271) | S |
| ST-F5 | Dauerlauf ≥ 24 h mit synthetischer Grundlast | täglicher Löschlauf läuft (Vermerk `aufraeumen:letzter`), Überwachung alle 60 s, Speicher stabil, keine Fehler im Log | S |
| ST-F6 | Lastnachlauf E-20 (S2/S5) auf Linux — nur O2/R, **nie** O1 | Grenzwerte laut Testplan 3.6 (vorher mit Betreiber bestätigen) | S |

---

## 5. Sicherung, Wiederherstellung und Rücksprung — sicherer Nachweis in der isolierten Umgebung

Grundlage: BEREITSTELLUNG §5.4/§5.5/§5.7, Strang C „Sicheres Vorgehen“, Kette B §2–3, Phase A.1 §16–19. **Nur
Staging. Kein Schritt berührt `/opt/apps/centric-dienstplanung`, deren `.env`, Daten, Pfeffer, Caddy oder Container.**

### 5.1 Vorprüfung (lesend; jede Abweichung = Abbruch vor dem ersten Schreibschritt)

| # | Prüfung | Soll |
|---|---|---|
| P-1 | Host: `hostname`, `docker compose ls` | O2: Staging-Host, kein Projekt `centric-dienstplanung`; O1: beide Projekte sichtbar, Arbeitsverzeichnis = `/opt/apps/centric-staging` |
| P-2 | Projekt- und Dienstname | `centric-staging` / `centric-staging-web`; **nie** `centric-dp-web` |
| P-3 | Mounts: `docker inspect centric-staging-web --format '{{json .Mounts}}'` | nur `…/centric-staging/data` und `…/centric-staging/zustand`; `stat -c %i` ≠ Inode der Produktionsdaten (O1) |
| P-4 | Pfeffer: Prüfwert der jüngsten Staging-Sicherung (Manifest) ≠ Prüfwert der jüngsten Produktionssicherung — **nur Prüfwerte vergleichen, nie den Wert** | verschieden |
| P-5 | Bild: `docker inspect` Bild-ID und Revision; Ziel (RC, „B“) und Rücksprungziel („A“) per `digest-pruefen.sh` gegen die Staging-Freigabeliste (V-4) | beide zugelassen; A ist **nicht** `f03a8514…` und nicht `0861adee…` (gesperrt) |
| P-6 | Umgebung der Shell: `printenv IMAGE_DIGEST`, `printenv CENTRIC_ADMIN` | leer |
| P-7 | Platz: `df -h` am Datenpfad | frei ≥ 3 × Größe der Ablage |
| P-8 | O1 zusätzlich: Produktionsreferenz festhalten — Id, Bild, Startzeit, Neustartzähler, Health von `centric-dp-web`; `curl -s https://app.centric-dienstplanung.de/gesund` | 200; Werte notiert für den Vergleich am Ende |

### 5.2 Ablauf

1. **Rückweg anlegen:** `cp -p compose.yml compose.yml.vor-abnahme-<UTC>`; `cp -p .env .env.vor-abnahme-<UTC>` (Rechte 600).
2. **Sicherung:** Dienst stoppen (`docker compose stop centric-staging-web`), dann
   `docker compose run -T --rm --no-deps -v "$PWD/sicherungen:/sicherungen" centric-staging-web node werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen`;
   danach `… ablage-sicherung.mjs pruefen --sicherung /sicherungen/<Ordner>` → „In Ordnung: N Dateien“. `FERTIG` vorhanden.
3. **Kopie außer Haus** (E-7-Teilprobe): Ordner unverändert auf das zweite Ziel kopieren, dort `pruefen` erneut.
4. **Wiederherstellung in ein neues, leeres Verzeichnis** `restore-abnahme-<UTC>/` mit demselben Staging-Pfeffer (Pfeffer
   aus dem **Passwortmanager**, nicht vom Server — BEREITSTELLUNG §5.4), per `--env-file`, nie per `-e` mit Wert.
5. **Bytevergleich:** Für `daten/` der Sicherung und das Ziel je `find … -type f -print0 | sort -z | xargs -0 sha256sum`
   mit relativen Pfaden; `diff` muss leer sein: **0 abweichend, 0 fehlend, 0 zusätzlich** (Klasse C ist nicht gesichert und
   zählt nicht als Abweichung).
6. **Startprobe auf einer Kopie** der Wiederherstellung: Probe-Container `--network none --read-only --tmpfs /tmp
   --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges`: `/gesund` = `{"status":"ok"}`;
   `ablage-pruefen.mjs` Exit 0; Konto-Anmeldung und Code-Anmeldung je Rolle; alte Sitzungen 401 (gewollt).
7. **Beschädigungsübung** (nur auf **Kopien** der Sicherung): (a) ein Byte in einer Datei unter `daten/` kippen,
   (b) `FERTIG` entfernen, (c) `MANIFEST.json` um eine Zeile kürzen, (d) falscher Pfeffer.
   Soll: `pruefen` schlägt in (a)–(c) fehl; `wiederherstellen` verweigert in (a)–(d); das Ziel bleibt unberührt (leer
   bzw. unverändert, Bytevergleich).
8. **Rücksprung A→B→A per Compose** (B = RC, A = zugelassener Vorgänger, z. B. `0b192927…`, falls Betreiber bestätigt):
   1. vorher: alle `t:` in `centric-sitzungen` und alles in `centric-accountsitzungen` **beiseitelegen** (verschieben),
      `sk:` bleibt nachweislich liegen (Anzahl vor/nach) — BEREITSTELLUNG §5.7;
   2. `./ruecksprung.sh --trocken` (zeigt Ziel und `.env`-Änderung), dann `./ruecksprung.sh`; `docker inspect` Bild-ID = A;
      `healthy` binnen `CENTRIC_WARTEZEIT`; Smoke im Probe-Container grün; Daten bytegleich zum Stand vor dem Rücksprung
      (außer erklärbaren Abweichungen: Protokoll, `aufraeumen:letzter`, Klasse C);
   3. **Formatprüfung:** Kann A den mit B geschriebenen Bestand lesen (insbesondere `/zustand`-Epoche, Faktor-/
      Wiederherstellungscodes seit WR-2)? Jeder Lesefehler ist ein **Befund**, kein Abbruchgrund für die Übung, aber ein
      Abbruchgrund für A als Rücksprungziel in der Produktion;
   4. vorwärts auf B mit `deploy.sh` (bzw. Bildzeile/`IMAGE_DIGEST` zurück, `rm -f -s`, `up -d --pull never`), `healthy`,
      Smoke grün, Konto-Arbeitssitzung aus A → 401 (Ausrollregel), Code-Sitzung gültig.
9. **R0-Probe:** `./abschalten.sh --trocken`, dann `./abschalten.sh`; Container `exited` und läuft nicht wieder an;
   Wiederinbetriebnahme nach Skriptausgabe.
10. **Nachkontrolle:** O1: Produktionsreferenzen aus P-8 **bitgleich**; Caddy unverändert. Protokoll
    `betrieb-protokoll.log` sichern. Wegwerfverzeichnisse erst nach Freigabe entfernen.

### 5.3 Abbruchkriterien (sofort R0 nur für Staging, Bericht, keine Wiederholung ohne Freigabe)

- eine Vorprüfung P-1…P-8 weicht ab;
- Pfeffer-Prüfwert gleich dem der Produktion;
- jede Abweichung im Bytevergleich (Schritt 5) oder in der Beschädigungsübung ein Durchlass statt Ablehnung;
- `digest-pruefen.sh` lehnt ab; Container nicht `healthy` binnen Wartezeit; `ablage-pruefen.mjs` ≠ 0; Smoke rot;
- **jede Spur, dass ein Produktionspfad, -container oder der Produktions-Caddy berührt wurde.**

### 5.4 Festzuhaltende Nachweise

Datum/Uhrzeit (UTC), Host, Projekt, Bild-ID und Revision von A und B, Freigabelisten-Stand, Sicherungsordner, Dateizahl,
Größe, Baumhash/Manifest-Prüfsumme, Ergebnis `pruefen` (vor und nach Kopie), Bytevergleich (Zahlen 0/0/0), Ergebnisse der
vier Beschädigungsfälle, Rücksprung-Zeiten bis `healthy`, Smoke-Zählungen, Anzahl `sk:` vor/nach, Produktionsreferenzen
vor/nach (O1), Liste der entfernten Wegwerfordner. **Nie:** Pfeffer, Schlüssel, Zugangscodes, Sitzungsmerkmale.

### 5.5 Was danach weiter unbewiesen bleibt

Restore aus der restic-Kopie unter dem echten Speicherziel der Produktion (E-7 vollständig), voller Datenträger im
Container (nur auf O2 nachstellbar), Strom-/Kernel-Absturz (nur Prozess-Kill), Rücksprung über eine künftige
Ablageformat-Änderung, und der Rücksprung **auf dem Produktionshost** (E-14).

---

## 6. Prüfungen mit echten Android- und iOS-Geräten

### 6.1 Mindestsatz Geräte und Browser

| Kürzel | Gerät | Browser / Form | Pflicht |
|---|---|---|---|
| G-A1 | Android-Telefon, aktuelle Android-Version (Pixel des Betreibers) | Chrome aktuell, Browser **und** installierte PWA | ja |
| G-A2 | Android-Telefon, ältere Version (mind. eine Hauptversion zurück, kleiner Bildschirm ~360 px) | Chrome aktuell | ja |
| G-I1 | iPhone, aktuelle iOS-Hauptversion | Safari, Browser **und** Home-Bildschirm-PWA | ja (beschaffen/leihen, E-3) |
| G-I2 | iPhone oder iPad, Vorgänger-Hauptversion von iOS | Safari | ja (darf das Tablet sein) |
| G-T | Tablet (iPad oder Android-Tablet), quer und hoch | Safari/Chrome | ja (E-5) |
| G-W | Windows-Rechner | Edge, Firefox, Chrome | ja (Testplan Stufe F) |
| G-M | macOS | Safari | wünschenswert |

Konkrete Versionsnummern trägt der Betreiber beim Lauf ein (hier nicht festgelegt).

### 6.2 Prüfskripte (je Gerät; Ergebnis bestanden / nicht bestanden / nicht ausführbar mit Grund; Bildschirmfotos ohne Personendaten)

| ID | Ablauf | Erwartung |
|---|---|---|
| GT-01 | Erste Anmeldung mit Code/Konto, zweiter Faktor, Abmelden | gelingt; Autofill/Passwortmanager stören nicht; Abmelden beendet die Sitzung (zweites Gerät bleibt angemeldet) |
| GT-02 | PWA installieren (Android „Installieren“, iOS „Zum Home-Bildschirm“), aus dem Startbildschirm starten | eigenes Fenster, Symbol und Name korrekt, Anmeldung bleibt bzw. ist klar neu anzufordern |
| GT-03 | „Mein Plan“ nach Freigabe durch die Planung | Dienst sichtbar, Datum/Zeitzone richtig, kein Entwurf sichtbar |
| GT-04 | **Offline-Stempeln:** Flugmodus → Start stempeln → App in den Hintergrund → App vom System beenden → Gerät neu starten → online → App öffnen | Stempel bleibt gepuffert („vorläufig (offline gespeichert)“), wird genau **einmal** übertragen, Serverzeit/Ereigniszeit korrekt, kein Doppelstempel |
| GT-05 | Funkloch statt Flugmodus (z. B. Aufzug/Keller) und langsames Netz (Entwicklertools-Drosselung bzw. schwaches Mobilnetz) | klare Rückmeldung, Wiederholung idempotent, keine hängende Oberfläche |
| GT-06 | Geräteuhr falsch gestellt (± 1 h) | Server entscheidet über Datum; Hinweis statt stiller Fehlzuordnung |
| GT-07 | **Standort** (nur in einem Testbetrieb mit eingeschaltetem Geo; in der Produktion bleibt Geo bis E-4 aus): Berechtigung erteilen, verweigern, später erteilen; innerhalb/außerhalb/ungenau | Abfrage nur beim Stempeln, Verweigerung führt zu „nicht bewertbar“ statt Blockade, keine Rohkoordinate sichtbar |
| GT-08 | **Kamera/Mikrofon:** `Permissions-Policy` setzt `camera=()`, `microphone=()` | keine Berechtigungsabfrage für Kamera/Mikrofon an irgendeiner Stelle |
| GT-09 | Krankmeldung am Telefon (Beschäftigte) → SV bestätigt vorläufig → Planung endgültig | wie Strang-B-Spec B8, jetzt auf Gerät; Push kommt an, wenn E-9 eingerichtet |
| GT-10 | Trefferflächen und Gesten: alle Knöpfe der Stempeluhr, Blattdialoge, Monatsplan mit dem Finger | ≥ 24 px (WCAG 2.5.8), kein Fehltreffer, Wischen scrollt statt auszulösen |
| GT-11 | Bildschirmtastatur: Einladungsannahme, Passwort, Notizfelder | Eingabefeld bleibt sichtbar, Schaltflächen nicht verdeckt, sichere Bereiche (Notch) beachtet |
| GT-12 | **Bildschirmleser:** TalkBack (G-A1), VoiceOver (G-I1): Anmeldung, Stempeln, Statuszeile (`role=status`), Blattüberschrift, Fehlermeldungen, Monatsplan | jede Aktion erreichbar und benannt, Status wird angesagt, Fokus kehrt nach Dialog zurück |
| GT-13 | Textvergrößerung auf Systemmaximum bzw. 200 % | kein abgeschnittener Text, keine Überlappung, horizontal nur bei Tabellen |
| GT-14 | Dunkelmodus des Systems | Kontraste lesbar (Toasts, Statuszeilen), keine weißen Flächen ohne Inhalt |
| GT-15 | Drehen während einer Eingabe (hoch ↔ quer) | Eingabe bleibt erhalten, Layout passt sich an |
| GT-16 | Aktualisierung: neues Bild auf Staging ausrollen, App offen lassen | definierter Wechsel auf neue Fassung, kein Mischzustand |
| GT-17 | Mandantentrennung am Gerät: zweiter Testbetrieb, anderer Zugang auf demselben Telefon nacheinander | keine Daten des ersten Betriebs sichtbar (auch nicht offline aus dem Puffer) |

Aufwand je Gerät (Schätzung): 2–4 h für GT-01…GT-17; mit Bildschirmleser GT-12 zusätzlich 1–2 h je Plattform.

---

## 7. Betreiberaktionen und Entscheidungen

Aufwand = Arbeitszeit des Betreibers (Schätzung), ohne Wartezeit Dritter. „Blockiert“ bezieht sich auf den ersten Go-live
mit echten Nutzern (G1, Abschnitt 8.1).

### 7.1 Sofort (diese Woche)

| # | Aktion | Wer | Aufwand | Blockiert |
|---|---|---|---|---|
| O-1 | **Staging-Variante wählen** (Empfehlung O2 + O4; Abschnitt 2.5) und bei O2 die VM beauftragen, DNS-Eintrag `staging.…` anlegen | Betreiber | 0,5–1 AT | E-1 |
| O-2 | **Bild bauen** für den RC: „Auslieferung“, `bauen=true`, `ausliefern=false`; Lauf-ID und Digest an den Koordinator | Betreiber | 0,25 h + Laufzeit | E-1 |
| O-3 | **S-1/S-2 aus PR #277** (Restrisiken der Einladungsbremse: installationsweite Gesamtgrenze 40/10 min von anderen Betrieben füllbar; `liste`/`widerrufen` und `zweifaktor`-Zähler weiter je Raum) annehmen oder Nacharbeit verlangen | Betreiber | 0,25 h | RC |
| O-4 | **Secret-Scan-Treffer** (roter Job `interne-pruefung` auf #274–#278): veralteten Branch löschen **oder** begründete Allowlist-Ausnahme freigeben; vorher bestätigen, dass der Wert nie gültig war oder rotiert ist | Betreiber | 0,5 h | RC (Merges #274–#278) |
| O-5 | **Branch-Schutz** für `main`, `integration/release-v4`, `koordination/lease` nach `BETREIBER-BRANCHSCHUTZ.md` einrichten; `node werkzeug/branchschutz-pruefen.mjs` Exit 0 | Betreiber (Claude ändert keine Rechte) | 1–2 h | Merge nach `main` (WP-09) |
| O-6 | **C-1-Regel:** Start ohne `CENTRIC_PFEFFER` in `production` hart verweigern (Empfehlung) oder nur laut warnen | Betreiber | 0,1 h | RC (kleiner Fix danach) |
| O-7 | **Externe Aufträge anstoßen**, die am längsten warten: E-32 (Dienstleister-AVVs: Hoster, Mail, Alarm, Backup-Ziel), E-17a (Pentest-Anbieter anfragen), Kanzlei für E-18/E-30/E-31 | Betreiber | 0,5–1,5 AT | G1 (Pfad 8.3) |
| O-8 | **iPhone beschaffen oder leihen** (E-3) und Gerätesatz 6.1 zusammenstellen | Betreiber | 0,25 AT + Lieferzeit | E-3/E-5 |

### 7.2 Vor bzw. während der Staging-Abnahme

| # | Aktion | Wer | Aufwand | Blockiert |
|---|---|---|---|---|
| O-9 | Staging-Umgebung einrichten (V-5…V-11, V-13, V-14) | Betreiber, Vorlagen vom Koordinator | 1–2 AT | E-1 |
| O-10 | Fragen der Matrix §5.1 (1–7) beantworten, dazu **F-1:** Welches Bild läuft in der Produktion (`0b192927…`/`274bfa0` laut Freigabeliste oder `f03a8514…` laut Matrix)? | Betreiber (lesend auf dem VPS) | 0,5 h | Rücksprungziel |
| O-11 | Freigabeliste für Staging entscheiden (V-4) | Betreiber | 0,1 h | E-1 |
| O-12 | **WP-ST1** (Runner-Staging-Gate, O4) als Paket freigeben | Betreiber | 0,1 h | — (beschleunigt) |
| O-13 | Geräteläufe 6.2 selbst ausführen oder eine Person benennen | Betreiber | 1–3 AT | E-2/E-3/E-5/E-6 |
| O-14 | Mail/Push für Staging: Absenderdomain verifizieren (SPF/DKIM/DMARC), VAPID-Paar, Testpostfächer (E-9) | Betreiber | 0,5–1 AT + DNS-Wartezeit | E-9 |
| O-15 | Fachliche Bestätigung der Abläufe auf Staging (Stufe B) mit den Pilotszenarien `PILOT-TESTSZENARIEN.md` | Betreiber/Fachperson | 1–2 AT | Stufe B |

### 7.3 Vor dem ersten Go-live (Produktion)

| # | Aktion | Wer | Aufwand | Blockiert |
|---|---|---|---|---|
| O-16 | E-10 Betreiber-2FA, E-11 GitHub-Umgebung `produktion` mit Pflichtprüfer und Forced-Command-Schlüssel, E-12 `CENTRIC_VERTRAUTE_PROXYS` + feste Caddy-Adresse, E-13 `.env`-Migration auf `IMAGE_DIGEST` und gesperrte Bilder/Tags entfernen | Betreiber | 1–1,5 AT | E-23 |
| O-17 | E-7 Sicherung außer Haus (Speicherziel, restic-Passwort) und echter Restore; E-8 Alarmweg (Uptime-Check, Webhook) | Betreiber | 1–1,5 AT + Anbieter | E-23 |
| O-18 | E-15 Code-Rotation Z1–Z7 | Betreiber | 0,25–0,5 AT | E-23 (P0 laut Übergabeliste) |
| O-19 | E-14 Rücksprung-Probe A→B→A auf dem Produktionshost (nach E-13), dann E-23 Deploy mit Checkliste; Merge nach `main` (WP-09) | Betreiber, Koordinator bereitet vor | 0,5–1 AT | Go-live |
| O-20 | „CDN/Browser-Job als Gate“: Soll `browser-abnahme` (lädt Playwright-Browser aus dem Netz) die Auslieferung blockieren? Empfehlung: ja, mit dokumentiertem Wiederholungsweg bei CDN-Ausfall | Betreiber | 0,1 h | Auslieferung |

### 7.4 Entscheidungen: blockieren sie den ersten Go-live (G1) oder nicht?

| Entscheidung | Blockiert G1? | Begründung |
|---|---|---|
| S-1/S-2 (#277), Secret-Scan (O-4), C-1 (O-6), Branch-Schutz (O-5) | **ja** | RC-Bildung, Merge-Gates, sichere Startkonfiguration |
| E-21 Fachentscheidungen (warnen/sperren, Mindestbesetzung, JArbSchG/MuSchG; zurückgestellt 4/6/7) | **ja**, soweit die Pilotbetriebe betroffen sind (Übergabeliste: „ja (JArbSchG/MuSchG)“) | vor dem Produktiv-Release erneut vorzulegen |
| WP-14c zwei Fragen (Tag mit 0 h bestätigt; Altdaten-Prüffälle blockieren Monatsabschluss?) + F6a/F6b; WP-16c-Fragen; E-29 (P0, externe Prüfung Korrekturrevisionen) | **ja, wenn** der Pilot Monatsabschluss/Lohnexport nutzt; sonst **nein** bei ausdrücklichem Ausschluss im Pilotvertrag | Lohnrelevanz |
| A-3 (Leitungscode ohne Person → Rollenwähler der Vorführfassung) | **ja** (P2, irreführend am Einstieg) — Produktentscheidung zum Weg nötig | Erstkontakt jedes Pilotbetriebs |
| A-4 (Dienstart ohne `mindest` lässt Oberfläche abstürzen) | nein (P3), aber vor Import/IMP-7 beheben | Weg nur über API |
| B-3 (Prüfwerkzeug Windows) | nein | Testwerkzeug |
| IMP-6 Q1–Q8, IMP-7 | **nein** — Import bleibt aus | Schalter aus, 404 belegt |
| WP-I4 fünf Fragen, PR #238 (Betriebsrat-Pause), E-25/E-26/E-27/E-28 (KI) | **nein** — Intelligence bleibt aus | keine Route, Gateway Attrappe |
| Modulrechte R-1…R-12/G8, WP-19.5 §43b (Q2a), WP-19-B6 Art. 16, E-22 FN-01…34 | **nein**, solange alle zwölf Module `geplant` bleiben; **ja** für jedes Modul, das im Pilot eingeschaltet werden soll | Registry-Status |
| Urlaubshinweis-Fragen | nein (Hinweis schreibt seit #271 nicht mehr beim Öffnen) | — |
| E-4 Geo | **nein**, Geo bleibt in der Produktion aus; ja vor dem Einschalten | Betreiberentscheidung 2026-11-03 |
| E-9 Mail/Push, E-10 2FA | **ja** | Betreiberentscheidung 2026-11-03: Pflicht |
| E-32, E-18, E-30, E-31 (AVV Dienstleister, Rechtstexte, Gesamtprüfung, Pilotvertrag/AV-Vertrag Pilot) | **ja für echte Personaldaten** | BEREITSTELLUNG Schritt 6; Betreiberregel: zwingende externe Anforderungen nie verschieben |
| E-19 Mitbestimmung | **ja** in einem Pilotbetrieb mit Betriebsrat, bevor Zeiterfassung genutzt wird (§ 87 Abs. 1 Nr. 6 BetrVG); kundenseitig | Schritt 6.3 |
| E-17 Pentest | **Betreiberentscheidung**: laut Betreiberregel 2026-11-04 extern **nach** dem Piloten; rechtlich nicht zwingend. Empfehlung: Pentest **vor** echten Personaldaten, sonst Risikoannahme schriftlich | Sicherheitsrisiko |
| Repository öffentlich (Schritt 6.5) | nein, aber bewusst entscheiden | Sicherheitsarchitektur lesbar |

---

## 8. Priorisierter Plan und aktualisierter kritischer Pfad

### 8.1 Begriffe

| Stufe | Bedeutung | Daten |
|---|---|---|
| **G0** interner Pilot | Betreiber + eine Person, isolierte Testinstanz (z. B. Staging-VM O2), Ziel 2026-12-24 | nur synthetisch |
| **G1 erster sicherer Go-live** | RC auf der Produktion (E-23), geschlossener Pilot mit echten Nutzern eines Betriebs (E-24) | echte Personaldaten |
| G1-tech | nur die technische Seite von G1: RC staging-abgenommen und auf der Produktion ausgerollt, ohne echte Nutzer | Testdaten (heutiger Produktionsinhalt) |

Umfang für G1 (Annahme): **heutiger Integrationsumfang** mit allen Schaltern aus (Import, KI/Intelligence, Teilspeicherung,
Selbststart, Demo, Registrierung aus; WP-19-Module `geplant`; Geo aus). Wird der volle Umfang (zwölf Module, Intelligence)
zur Bedingung, gelten die längeren Zahlen aus `GESAMTPLAN.md` §7.3 (C1 realistisch 49 AT ab 2026-11-04).

### 8.2 Plan (P-Reihenfolge, Schätzungen in Arbeitstagen AT, best/wahrscheinlich/schlecht)

| P | Schritt | hängt ab von | parallel zu | Dauer AT | Wer |
|---|---|---|---|---|---|
| P1 | RC festlegen: O-3, O-4, O-6; Merges #277, #274–#276, #278; Fix C-1, A-3 (nach Produktentscheidung), A-4; Kette ohne Parallellast | Betreiberentscheidungen O-3/O-4/O-6 | P2, P3, P4, P9, P10 | 2 / 4 / 7 | Koordinator + Betreiber |
| P2 | Staging-Umgebung O2 (V-5…V-14) | O-1 | P1 | 2 / 3 / 6 (inkl. Beauftragung/DNS) | Betreiber |
| P3 | WP-ST1 Runner-Staging-Gate (O4) bauen, reviewen, integrieren | O-12 | P1, P2 | 2 / 3 / 5 | Agenten |
| P4 | Doku: V-15, V-16, Staging-Freigabeliste (V-4) | O-11 | P1 | 0,5 / 0,5 / 1 | Koordinator |
| P5 | Bild bauen, Digest belegen (V-2, V-3) | P1 | — | 0,5 / 1 / 2 | Betreiber |
| P6 | **Staging-Abnahme E-1**: ST-B…ST-F, Abschnitt 5 (Sicherung/Restore/Rücksprung/R0), Gate-Proben, Browser-Suiten über HTTPS | P2, P5 (P3 hilfreich) | P7 | 2 / 3 / 5 | Koordinator führt, Betreiber Schritte auf dem Host |
| P7 | **Geräte E-2/E-3/E-5/E-6** (Abschnitt 6) | P2, P5, O-8 | P6 | 1 / 2 / 4 | Betreiber |
| P8 | Befundschleife: Fixes aus P6/P7, neuer RC, Delta-Staging (nur betroffene ST/GT + Smoke) | P6, P7 | — | 1 / 4 / 10 | Agenten + Betreiber |
| P9 | Produktionsvorbereitung O-16, O-17, O-18, E-9 | — (sofort) | alles | 3 / 7 / 15 (überwiegend Wartezeit) | Betreiber |
| P10 | Rechtliches/Organisation: E-32 → WP-36 (Rechtstexte nachführen) → E-18 (Kanzlei) → Einarbeitung; parallel E-30, E-31; E-19 im Pilotbetrieb | O-7 | alles | siehe 8.3 | Betreiber, Kanzlei, Agenten |
| P11 | Pentest E-17a → E-17 → Befundbehebung (wenn vor G1 verlangt) | O-7, E-1 bestanden (eingefrorener Stand) | P10 | siehe 8.3 | Betreiber, Anbieter, Agenten |
| P12 | E-14 Rücksprung-Probe auf dem Produktionshost, E-23 Deploy, Merge nach `main` (WP-09), Nachkontrolle | P8, P9, (P10, P11 für G1) | — | 1 / 2 / 4 | Betreiber |
| P13 | E-24 geschlossener Pilot (2 Wochen ohne P0/P1) | P12, E-31 | — | 10 / 10 / 15 | Betreiber, Pilotbetrieb |

### 8.3 Kritischer Pfad (Tag 1 = Montag 2026-11-16; Arbeitstage Mo–Fr ohne 24.12., 25.12., 31.12., 1.1.)

**Technische Kette (G1-tech):** P1 → P5 → P6 (mit P7) → P8 → P12

| | best | wahrscheinlich | schlecht |
|---|---|---|---|
| P1 | 2 | 4 | 7 |
| P5 | 0,5 | 1 | 2 |
| P6 (P7 parallel) | 2 | 3 | 5 |
| P8 | 1 | 4 | 10 |
| P12 | 1 | 2 | 4 |
| **Summe G1-tech** | **6,5 ≈ 7 AT → 2026-11-24** | **14 AT → 2026-12-03** | **28 AT → 2026-12-23** |

P2 (Staging, 2/3/6) und P9 (3/7/15) laufen ab Tag 1 parallel und liegen im wahrscheinlichen Fall nicht auf dem Pfad; im
schlechten Fall kann P9 (Mail-DNS bis 15 AT Wartezeit) gleichziehen. Die iPhone-Beschaffung (0–10 AT) liegt nur dann
auf dem Pfad, wenn O-8 nicht sofort angestoßen wird.

**Rechtliche Kette (für echte Personaldaten):** E-32 → WP-36 → E-18 → Einarbeitung

| | best | wahrscheinlich | schlecht |
|---|---|---|---|
| E-32 Dienstleister-AVVs (Wartezeit laut SSOT 10–15) | 10 | 12 | 15 |
| WP-36 Rechtstexte nachführen (Agenten) | 1 | 2 | 3 |
| E-18 Kanzlei-Freigabe (Wartezeit laut SSOT 10–30) | 10 | 20 | 30 |
| Einarbeitung, neuer RC nur bei Textänderung im Bundle | 1 | 2 | 3 |
| **Summe** | **22** | **36** | **51** |

E-30 (15–30) und E-31 (10–20) laufen parallel und liegen innerhalb dieser Kette, wenn sie in derselben Woche beauftragt
werden.

**Pentest-Kette (nur wenn vor G1 verlangt):** E-17a (10/20/30, ab sofort) und E-1 bestanden (P1 + P5 + P6: Tag 5/8/14) → E-17
(5/10/15) → Behebung (3/5/8): **18 / 35 / 53 AT**.

**Ergebnis — erster sicherer Go-live G1 (echte Nutzer):**

| | best | wahrscheinlich | schlecht |
|---|---|---|---|
| ohne Pentest vor dem Piloten (Betreiberregel 2026-11-04, Risikoannahme) | **22 AT → 2026-12-15** | **36 AT → 2027-01-08** | **51 AT → 2027-01-29** |
| mit Pentest vor dem Piloten (Empfehlung) | **22 AT → 2026-12-15** | **36 AT → 2027-01-08** | **53 AT → 2027-02-02** |
| nur technisch (G1-tech, Testdaten) | 7 AT → 2026-11-24 | 14 AT → 2026-12-03 | 28 AT → 2026-12-23 |

Der Pilotabschluss E-24 (zwei Wochen ohne P0/P1) kommt 10–15 AT danach. **G0** (interner Pilot, synthetisch) ist auf
der Staging-VM möglich, sobald P6 bestanden ist (best Tag 5, wahrscheinlich Tag 8, schlecht Tag 14) — das
Ziel 2026-12-24 ist damit in allen drei Fällen technisch erreichbar, sofern O-1 und O-2 diese Woche erfolgen.

Abgleich mit `GESAMTPLAN.md` §7.3: Dort ist die realistische Treiberkette für C1 ebenfalls E-32 → WP-36 → E-18 → WP-42
→ E-23 → E-24 (Deploy realistisch 2026-12-23). Die Zahlen hier sind kürzer im Technikteil, weil G1 auf den heutigen
Umfang mit Schaltern aus begrenzt ist, und länger im Rechtsteil, weil die Beauftragung noch nicht erfolgt ist (Start
frühestens 2026-11-16 statt 2026-11-04).

### 8.4 Annahmen (gelten für alle Zahlen)

- Schätzungen, keine Messungen. Externe Wartezeiten aus `work-packages.json` (`wartezeitAT`), dort selbst als **ANNAHMEN**
  gekennzeichnet.
- Der Betreiber reagiert auf jede Anfrage binnen eines Arbeitstags; jede Woche späterer Beauftragung (O-7) verschiebt
  G1 um bis zu eine Woche, jeder Tag Verzögerung bei O-1/O-2 verschiebt G1-tech und G0 um einen Tag.
- Die Befundschleife P8 enthält höchstens einen weiteren RC; ein P0/P1-Befund im Staging oder Pentest setzt die Kette ab
  P5 neu an (schlechter Fall deckt einen zusätzlichen Durchlauf ab, nicht zwei).
- Pilotbetrieb nutzt keinen Monatsabschluss mit Lohnexport, **oder** WP-14c/WP-16c/E-29 werden bis zum Go-live geklärt
  (sonst verlängert E-29 mit 10–30 AT Wartezeit die Kette).
- E-19 (Betriebsvereinbarung) ist Sache des Pilotkunden und läuft vor seinem Start; ein Pilotbetrieb ohne Betriebsrat
  verkürzt nichts an der Kette oben.
- Agentenkapazität wie `GESAMTPLAN.md` „realistisch“ (3 parallel); die Konfliktzone `src/App.jsx` kann A-3-Fix und
  Entwicklungsarbeit gegenseitig verzögern.

### 8.5 Was der Betreiber steuert

Fast der ganze Pfad: Staging-Umgebung und Bildbau (O-1, O-2), die vier RC-Entscheidungen (O-3…O-6), den Zeitpunkt der
externen Beauftragungen (O-7 — **größter Hebel**: bestimmt die rechtliche Kette und damit G1), Geräte (O-8, O-13),
Produktionsvorbereitung (O-16…O-19) und die Entscheidung Pentest vor oder nach dem Piloten. Nicht steuerbar: Antwortzeiten
von Kanzlei, Pentest-Anbieter und Dienstleistern; Befunde aus Staging und Pentest.

---

## 9. Release-Empfehlung (zweigeteilt) und vier Stufen

### 9.1 A — Lokaler Release-Kandidat technisch annehmbar?

**Ja, mit Auflagen.** Kein P0/P1 in vier Strömen, CI auf allen Köpfen grün, Produktionsvorgaben an der isolierten
Instanz belegt. Auflagen:

1. RC = Integrationskopf **nach** Merge von #277 (A-2) und den Strang-PRs #274–#276/#278 (Voraussetzung O-3, O-4); der
   heutige Kopf `ca45a0a2` enthält #271 (S0-B1) und #272 (A-5), aber noch nicht #277.
2. C-1 nach Betreiberregel O-6 behoben oder als bewusste Warnung dokumentiert; A-3 mit Produktentscheidung behoben oder
   als bekannter P2 im Pilotvertrag benannt; A-4 behoben oder als P3 geführt.
3. Lokale Kette auf dem neuen Kopf einmal ohne Parallellast; CI grün auf genau diesem Kopf (Merge nur mit
   `--match-head-commit`).
4. S0-B2 bleibt als bekannte Teillücke geführt (fachliche Browser-E2E nur teilweise durch Strang A/B geschlossen;
   Ersatzplanung im Browser fehlt).

### 9.2 B — RC geeignet für die Betreiberfreigabe nach produktionsnaher Staging-Abnahme?

**Noch nicht.** Genau diese Bedingungen fehlen:

1. GHCR-Bild und Digest des RC (O-2), Eintrag in der Staging-Freigabeliste (V-4).
2. Staging nach Abschnitt 2.5 eingerichtet; Vorprüfung 5.1 belegt (eigener Pfeffer, eigene Daten, kein Produktionspfad).
3. ST-B, ST-C, ST-D (ohne D5), ST-E, ST-F1–F4 **bestanden** auf genau diesem Digest; ST-E8 (c) nach Regel O-6.
4. Abschnitt 5 vollständig bestanden: Sicherung, `pruefen`, Kopie außer Haus, Restore in leeres Verzeichnis **0/0/0**,
   Beschädigungsübung 4/4 abgelehnt, Rücksprung A→B→A mit `healthy` und grünem Smoke, R0-Probe; Nachweise 5.4.
5. Geräte: GT-01…GT-17 auf G-A1, G-I1 und G-T ohne Funktionsfehler; G-A2/G-I2 mindestens GT-01–GT-05, GT-10–GT-13.
6. Keine offenen P0/P1 aus Staging/Geräten; P2 nur mit schriftlicher Betreiberentscheidung.
7. Fachliche Bestätigung der Kernabläufe durch Betreiber/Fachperson (O-15).

Erst danach folgt die Betreiberfreigabe für E-14/E-23 — und für **echte Personaldaten** zusätzlich Stufe C (9.3).

### 9.3 Vier Stufen — Stand und fehlende Nachweise

| Stufe | Stand | Fehlende Nachweise |
|---|---|---|
| **A technisch getestet** | **erreicht für `0638c101`** (lokale Kette + CI + isolierte Instanz) und **CI-belegt** für `ca45a0a2`; Ströme A/B/C ohne P0/P1 | Lauf auf dem endgültigen RC-Kopf (nach #277, C-1, A-3/A-4); Bild im Container mit Compose-Härtung und Caddy/TLS (ST-B/ST-C) — gehört technisch noch zu A, ist aber nur im Staging belegbar |
| **B fachlich bestätigt** | **offen** | O-15 (Betreiber/Fachperson bestätigt Abläufe auf Staging); E-21 (Fachentscheidungen inkl. zurückgestellte 4/6/7); WP-14c-Fragen und F6a/F6b, WP-16c-Fragen (falls Monatsabschluss im Pilot); A-3-Produktentscheidung; REVIEW-Pakete WP-15/16/16c/14c/16b/07b/19.0; E-22 nur für einzuschaltende Module |
| **C extern freigegeben** | **offen** | E-1 Staging-Abnahme (dieser Plan), E-2/E-3/E-5/E-6 Geräte, E-4 nur vor Geo; E-32 AVVs Dienstleister, E-18 Rechtsfreigabe, E-30 Gesamtprüfung, E-31 Pilotvertrag/AV-Vertrag Pilot, E-19 Mitbestimmung (kundenseitig), E-17 Pentest (Betreiberentscheidung vor/nach Pilot), E-29 nur bei Lohnexport im Pilot |
| **D produktionsreif** | **offen** | Branch-Schutz (O-5); E-7 Sicherung außer Haus mit echtem Restore, E-8 Alarm, E-9 Mail/Push, E-10 Betreiber-2FA, E-11 Umgebung `produktion`, E-12 `CENTRIC_VERTRAUTE_PROXYS`/Caddy, E-13 `.env`-Migration, E-15 Code-Rotation, E-14 Rücksprung-Probe auf dem Produktionshost, E-23 Deploy mit Checkliste und Nachkontrolle, WP-09 Merge nach `main`; danach E-24 Pilot zwei Wochen ohne P0/P1 |

---

## 10. Offene Punkte dieses Plans

- Die Zahlen sind ohne Rückmeldung des Betreibers zu O-1, O-7 und F-1 berechnet; nach deren Beantwortung neu rechnen
  und in `work-packages.json` (E-1, neue Pakete WP-ST1) übernehmen — nicht in diesem PR.
- `docs/STAGING-KETTE-B.md` und `docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` sind weiterhin nicht versioniert (V-15).
- Widerspruch Produktionsbild Matrix (`64d08a4`) vs. Freigabeliste (`274bfa0`, `aktiv`) ist ungeklärt (F-1).
