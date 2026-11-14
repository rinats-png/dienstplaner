# Staging O2 — Vorbereitung (C1 Staging-VM, C2 Staging-Gate)

Stand 2026-11-14. Auftrag: Betreiberentscheidung 2026-11-14 (verbindlich), Variante **O2 = eigene Staging-VM**.

**Art dieses Dokuments:** reine Vorbereitung im Repository. **Nichts wurde ausgeführt.** Keine VM bestellt, kein DNS geändert,
kein Docker gestartet, kein Bild veröffentlicht, keine GitHub-Einstellung, keine Branch-Schutzregel, kein Zugriff auf einen VPS, kein
Geheimnis gelesen oder erzeugt (die Staging-Passwortdatei wurde nicht angefasst). Alle Werte in den Vorlagen sind Platzhalter.

## 1. Was Claude vorbereitet hat

| Neu | Ort | Inhalt |
|---|---|---|
| Compose für die Staging-VM | `deploy/staging-o2/compose.yml` | Anwendung und Caddy in **eigenem** Stack/Netz; beide Bilder nur per Digest-Variable ohne Vorgabe; Härtung wie `deploy/compose.yml` (read_only, uid 1000, cap_drop ALL, no-new-privileges, Speicherlimit, Healthcheck); Anwendung ohne veröffentlichten Port; nur Caddy auf 80/443 |
| Caddy mit TLS und Zugriffsbegrenzung | `deploy/staging-o2/Caddyfile` | automatisches TLS für `{$STAGING_HOST}`; Zugriff nur aus `{$STAGING_ERLAUBT}` (sonst 403); `X-Robots-Tag`, kein Admin-Endpunkt, kein `trusted_proxies` (wie `docs/CADDY-UND-XFF.md`) |
| Umgebungsvorlage | `deploy/staging-o2/env.staging.beispiel` | nur `<Platzhalter>`; eigene Staging-Geheimnisse, Vorgabe AUS für Selbststart/Demo wie in der Produktion |
| Betrieb auf der VM | `deploy/staging-o2/betrieb.sh` | `pruefen`, `sichern`, `wiederherstellen`, `zurueck`, `merken`; jeder ändernde Befehl mit `--trocken`; zeigt nie Werte der `.env` |
| Staging-Gate (C2) | `.github/workflows/staging-gate.yml` | nur `workflow_dispatch`, `contents: read`, Job zusätzlich `packages: read`; ausgeschaltet bis Variable `STAGING_GATE_AKTIV=true`; zieht das Bild per Digest, gleicht Digest und Commit-Label ab, läuft Gate-Proben und Playwright/axe gegen genau dieses Bild, lädt einen Nachweis hoch |
| Haken in vorhandener Suite | `e2e/global-setup.mjs` | Neue optionale Variable `E2E_EXTERN_ADMIN`: nutzt einen bereits laufenden Container statt eigenen Server. Ohne die Variable unverändert; die Beschränkung auf `127.0.0.1` bleibt |
| Offline-Prüfung | `pruefungen/staging-o2.test.js`, Skript `pruefung:staging-o2` | Compose, Vorlage, Caddyfile, Skript, Workflow (dispatch-only, nur lesende Rechte, keine Auslieferung, kein Aufruf aus anderen Workflows, actionlint falls vorhanden), Dokumentabschnitte |

**Wiederverwendet statt neu gebaut:** Härtung und Gesundheitsprobe aus `deploy/compose.yml`; Caddy-Grundsätze aus
`deploy/caddy/Caddyfile.vorlage` und `docs/CADDY-UND-XFF.md`; Digest-Regeln aus `deploy/digest-pruefen.sh` und
`deploy/FREIGEGEBENE-IMAGES.md`; Gate-Proben `werkzeug/staging-smoke.mjs`, `staging-geo.mjs`, `staging-aufraeumen.mjs` (Container-Start
und Zweifaktor-Vorlauf nach dem Muster in `pruefung.yml`); Playwright/axe-Suite `e2e/` samt `axe-ausnahmen.json`
(WP-33, `docs/acc45/WP-33-PLAYWRIGHT-AXE.md`); Sicherungsgrundsätze aus `docs/BETRIEB-SICHERUNG.md` (Schlüsselepoche `./zustand` nie
sichern, nie zurückspielen); Planungsgrundlage `docs/acc45/STAGING-PLAN-V4.md` und `V4-STAGING-VORAUSSETZUNGEN.md`.

**Unverändert:** `deploy.yml`, `betrieb-deploy.yml`, `pruefung.yml` (bis auf einen zusätzlichen Schritt für die neue Offline-Prüfung),
alle bestehenden Prüfungen. Das Gate ist nirgends angebunden.

## 2. Was der Betreiber tun muss

Reihenfolge; jeder Schritt ist eine Betreiberhandlung (Kosten, DNS, Rechte oder Geheimnisse).

1. **VM bestellen** (kostenpflichtig): Linux (Ubuntu LTS), 2 vCPU, 4 GB RAM, 40 GB; getrennt von der Produktion (anderes Konto/Projekt
   oder zumindest anderes Netz). Cloud-Firewall: eingehend 80/443 nur von `STAGING_ERLAUBT`, 22 nur von der Betreiberadresse.
2. **Docker und Compose installieren**; Benutzer `admin` (uid 1000) anlegen, SSH nur mit Schlüssel.
3. **DNS:** A-Eintrag `staging.<domain>` auf die VM-Adresse (Platzhalter bis zur Entscheidung über die Domain).
4. **Verzeichnis anlegen und Dateien kopieren:** `/opt/centric-staging` mit `compose.yml`, `Caddyfile`, `betrieb.sh`,
   `env.staging.beispiel` aus `deploy/staging-o2/`; `chmod +x betrieb.sh`; `install -d -m 700 -o 1000 -g 1000 zustand data`.
5. **`.env` auf der VM füllen** (`cp env.staging.beispiel .env; chmod 600 .env`): eigene Zufallswerte für `CENTRIC_ADMIN` und
   `CENTRIC_PFEFFER` (nie die der Produktion; nie anzeigen oder weitergeben), `STAGING_HOST`, `STAGING_ERLAUBT`,
   `CENTRIC_BASIS=https://staging.<domain>`.
6. **Bilder bereitstellen:** Release-Kandidat per Digest aus GHCR (`docker pull ghcr.io/rinats-png/dienstplaner@sha256:...`, Digest
   aus dem Bildlauf der Auslieferung) und das geprüfte Caddy-Bild per Digest. Beide Digests in `.env` eintragen.
7. **Start:** `./betrieb.sh pruefen`, dann `docker compose up -d --pull never`; Abnahme nach Abschnitt 7.
8. **Staging-Gate einschalten (C2):** Repository-Variable `STAGING_GATE_AKTIV=true` setzen (GitHub-Einstellung, nur der Betreiber).
   Danach pro Kandidat: Actions, „Staging-Gate“, **auf dem Commit des Bilds** starten, Digest eingeben. Ohne Variable bleibt der Job
   übersprungen.
9. **Weiterhin offen und Betreiberentscheidung:** Zeitpunkt der ersten Abnahme, Testadressen für Mail (Staging ohne Anbieter), wer die
   Nachweise freigibt, Umgang mit Branch-Schutz (`docs/acc45/BETREIBER-BRANCHSCHUTZ.md`).

## 3. Was externe Stellen tun

| Stelle | Aufgabe |
|---|---|
| Cloud-Anbieter | VM, Firewall, Abrechnung; Snapshots nach Betreiberwahl |
| DNS-Anbieter | A-Eintrag `staging.<domain>` |
| Let's Encrypt | Zertifikat; braucht Erreichbarkeit von Port 80/443 zur Ausstellung (Zugriffsliste gilt für Inhalte, die Ausstellung läuft über Caddy selbst; falls die Ausstellung an der Liste scheitert: kurzzeitig Port 80 für die Ausstellung freigeben oder DNS-Challenge, Betreiberentscheidung) |
| GitHub | Variable `STAGING_GATE_AKTIV`, GHCR-Leserecht für das Gate (`GITHUB_TOKEN` mit `packages: read`; bei privatem Paket muss das Paket dem Repository den Lesezugriff erlauben) |
| Prüfgeräte/Prüfende | Test von echten Geräten (Telefon-Test), Bildschirmleser; Fachleute für Fachabnahme (nicht Teil dieser Vorbereitung) |

## 4. Installationsanleitung

Reproduzierbar, in dieser Reihenfolge auf der VM (nach Abschnitt 2, Schritt 1 bis 6):

```
cd /opt/centric-staging
./betrieb.sh pruefen                      # Form der .env, Digests, zustand/ (zeigt keine Werte)
docker compose config -q                  # Compose liest .env und prüft die Pflichtvariablen
docker compose up -d --pull never
docker compose ps                         # beide Dienste healthy/running
curl -sf https://staging.<domain>/gesund  # von einer erlaubten Adresse; von einer anderen: 403
```

Bei Fehlern: `docker compose logs --tail=100 centric-staging-web` (die Anwendung protokolliert keine Geheimnisse und keine
Klartextadressen). Kein Tag, kein `latest`, kein `docker pull` ohne Digest; die Bilder müssen lokal liegen (`pull_policy: never`).

## 5. Synthetische Daten

- Die Staging-Ablage `./data` ist **leer** und gehört nur diesem Staging. Es wird nichts aus der Produktion kopiert, keine
  Sicherung der Produktion zurückgespielt, keine echte Person angelegt.
- Daten entstehen ausschließlich synthetisch: Betrieb über `/einrichten` mit dem Staging-Verwalterschlüssel, Demo-Bestand mit
  erfundenen Personen (derselbe Weg wie `e2e/global-setup.mjs`), und die Gate-Proben `werkzeug/staging-smoke.mjs` (Räume
  `ppg-gate-a`/`-b`, Kennzeichnung „PPG-GATE“, Entfernung nur über `werkzeug/staging-aufraeumen.mjs`).
- Mail und Push: kein Anbieter im Staging; Zustellung nur an Testadressen nach Betreiberentscheidung. Geheimnisse (Verwalterschlüssel,
  Pfeffer, Zugangscodes) stehen nur in der `.env` auf der VM und in Gedächtnis oder Passwortverwaltung des Betreibers, nie im Repository.
- Der CI-Lauf (C2) erzeugt Schlüssel und Pfeffer zufällig je Lauf, maskiert sie und wirft sie mit dem Runner weg.

## 6. Sicherung, Wiederherstellung und Rücksprung

Alle Befehle mit `--trocken` vorab ausprobieren.

| Fall | Befehl | Wirkung |
|---|---|---|
| Sicherung | `./betrieb.sh sichern` | Anwendung kurz anhalten, `./data` als Archiv mit Prüfsumme unter `./sicherungen` ablegen, starten. `./zustand` wird nie gesichert |
| Wiederherstellung | `./betrieb.sh wiederherstellen sicherungen/data-<zeit>.tar.gz` | Prüfsumme prüfen, altes `./data` als `data.vor-wiederherstellung-<zeit>` behalten, Archiv entpacken, starten. Danach melden sich alle neu an (Schlüsselepoche, `docs/BETRIEBSHANDBUCH.md`) |
| Merken vor Wechsel | `./betrieb.sh merken sha256:<digest>` | den **bisher laufenden** Digest für den Rücksprung ablegen |
| Rücksprung | `./betrieb.sh zurueck` | `IMAGE_DIGEST` auf den gemerkten Vorgänger setzen und neu erstellen (Bild muss lokal liegen) |
| Notstopp | `docker compose stop` | Dienst anhalten; lieber kein Dienst als ein unsicheres Bild |

Der echte Ablauf (Sicherung, Wiederherstellung in ein leeres Verzeichnis, Rücksprung A, B, A) ist erst auf der VM nachzuweisen
(Abschnitt 7, Kriterien K9 und K10); das Muster ist `docs/PHASE-A1-STAGING-REPORT.md`.

## 7. Abnahmekriterien und Nachweisformat

Nachweis je Kriterium: Befehl oder Prüfung, Ergebnis (bestanden/nicht), Datum, **Digest und Commit des geprüften Bilds**. Ein Nachweis
ohne Digest gilt nicht.

| Nr. | Kriterium | Prüfung | Erwartung |
|---|---|---|---|
| K1 | Bild ist der Kandidat | `docker image inspect` (RepoDigest, Label `org.opencontainers.image.revision`) | Digest = Eingabe, Commit = geprüfter Quellstand |
| K2 | Start gehärtet | `docker compose ps`, `docker inspect` | healthy; read_only; uid 1000; kein Port außer Caddy |
| K3 | TLS | `curl -sI https://staging.<domain>` | gültiges Zertifikat, HSTS; http leitet auf https |
| K4 | Zugriffsbegrenzung | Aufruf von erlaubter und nicht erlaubter Adresse | 200 bzw. 403 |
| K5 | Gate-Proben im Bild | `staging-smoke`, `staging-geo`, `staging-aufraeumen` per `docker exec` | Exit 0, danach keine Gate-Reste |
| K6 | Browserabnahme | `npm run e2e` (Playwright, 8 Viewports) | 0 fehlgeschlagen; Ausnahmen nur aus `e2e/axe-ausnahmen.json` |
| K7 | Barrierefreiheit | axe WCAG 2.2 AA (in K6) | keine Funde „serious“/„critical“ außer begründeter Ausnahme |
| K8 | Produktionsvorgaben | Antworten von `/api/demo`, `/starten`, Registrierung, Import | wie Produktion: gesperrt (403/404) |
| K9 | Sicherung und Wiederherstellung | Abschnitt 6 in leeres Verzeichnis, Zähler vorher/nachher | Bestände gleich, Anmeldung nach Wiederherstellung neu |
| K10 | Rücksprung | A, B, A | läuft, healthy, Smoke grün |
| K11 | Keine Geheimnisse im Nachweis | Durchsicht von Artefakt und Logs | keine Schlüssel, Pfeffer, Codes, Tokens |
| K12 | Echte Geräte | Telefon-Test (Smartphone), Bildschirmleser | Betreiber/Prüfende, nicht automatisierbar |

**Nachweisformat des Gates (C2):** Artefakt `staging-nachweis` mit `staging-nachweis.json`
(`digest`, `commit`, `lauf`, `ergebnis`, `browserabnahme`, `erstellt`) sowie `e2e/ergebnisse/ergebnis.json` und den axe-Befunden.
K1, K5, K6, K7 werden vom Gate belegt; K2 bis K4 und K8 bis K12 gehören auf die VM.

**Grenzen des Gates, ehrlich:** Es läuft auf einem Wegwerf-Runner, nicht hinter Caddy mit TLS (K2 bis K4 nicht belegt). Die
Browserabnahme verwendet dasselbe Bild, aber mit `NODE_ENV=development`, `CENTRIC_DEMO=true` und `CENTRIC_SELBSTSTART=true`, weil der
Demo-Bestand der Suite sonst nicht anlegbar ist (das Produktionsverhalten belegt der erste Container, K5). Es veröffentlicht nichts
und liefert nichts aus.

## 8. Checkliste

Spalten: Erledigt von (Claude/Betreiber/Extern), Datum, Beleg.

- [x] Compose, Caddyfile, Umgebungsvorlage, Betriebsskript im Repository (Claude, 2026-11-14)
- [x] Staging-Gate-Workflow, dispatch-only, nur lesend, ausgeschaltet (Claude, 2026-11-14)
- [x] Offline-Prüfung `pruefung:staging-o2` und Eintrag in der CI-Abdeckung (Claude, 2026-11-14)
- [ ] VM bestellt, Firewall gesetzt (Betreiber)
- [ ] DNS `staging.<domain>` (Betreiber/DNS-Anbieter)
- [ ] `.env` auf der VM mit eigenen Geheimnissen (Betreiber)
- [ ] Bilder per Digest auf der VM, `./betrieb.sh pruefen` grün (Betreiber)
- [ ] Variable `STAGING_GATE_AKTIV=true` (Betreiber)
- [ ] Erster Gate-Lauf auf dem Commit des Kandidaten, Nachweis gespeichert (Betreiber/Claude)
- [ ] K1 bis K12 mit Digest dokumentiert (Betreiber/Claude)
- [ ] Freigabe des Nachweises durch den Betreiber

## 9. Nicht Teil dieser Vorbereitung

Bestellung einer VM, DNS-Änderung, jede Änderung an externer Infrastruktur, GitHub-Rechte und Branch-Schutz, Veröffentlichung von
Bildern, automatische Auslieferung in die Produktion (das Gate hängt an keinem Deploy-Weg), Anbindung von Mail- und Push-Anbietern,
Fachabnahme, Lasttest.
