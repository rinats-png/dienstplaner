# Production-Migrationsplan — Release Candidate auf `centric-dp-web`

| | |
|---|---|
| Stand | 2026-10-10 |
| Status | **Plan. Nicht ausgeführt.** Production ist unverändert. Ausführung nur nach ausdrücklichem GO des Betreibers. |
| Grundlage | [PHASE-A1-STAGING-REPORT.md](PHASE-A1-STAGING-REPORT.md), [PRE-PRODUCTION-GATE.md](PRE-PRODUCTION-GATE.md), BEREITSTELLUNG.md 5.4/5.7 |

Alle Angaben zu Production sind **nur lesend** erhoben (`docker inspect`, Verzeichnisliste,
Schlüsselnamen ohne Inhalte). Es wurden keine Production-Daten kopiert oder verändert.

---

## 0. Harte Production-Regeln

1. **Vor jeder Änderung ein Production-Backup**: Rohkopie der Daten plus logische Sicherung,
   beide verifiziert (Abschnitt D/E). Ohne verifiziertes Backup keine Änderung.
2. **Altes Image festhalten**: Digest `sha256:0861adee…` notieren und lokal mit einem
   eigenen Tag sichern. Das Image wird nicht gelöscht, `docker image prune` ist verboten.
3. **Compose und `.env` sichern**, bevor eine Zeile geändert wird.
4. **Keine alten Sicherungen löschen** — weder auf Production noch auf Staging.
5. **Rollback jederzeit möglich**: altes Image per Digest, alte Daten als Rohkopie, alte
   Konfiguration als Kopie.
6. **Keine Migration ohne verifiziertes Backup.** (Für diesen Schritt ist keine
   Datenmigration nötig, siehe C.)
7. **Keine Daten überschreiben ohne Rückweg**: Statt zu löschen wird beiseitegelegt
   (`mv … .defekt-<TS>`), nie `rm`.
8. **Bei Fehlern fail closed**: lieber abweisen als falsch erlauben. Ein 500 ohne Interna
   ist akzeptabel, ein falsches 200 nicht.
9. **Bei einem Tenant- oder Auth-Fehler sofort Rollback** (V).
10. **Bei einem Datenintegritätsfehler sofort Rollback**, notfalls mit Datenrückspielung (G).
11. Nur `/opt/apps/centric-dienstplanung` und `centric-dp-web` anfassen. Nicht anfassen:
    `caddy`, `centric-dienstplanung-test`, Staging, DNS, Caddyfile, Netzwerk `proxy`.
12. Vor jeder potenziell zerstörenden Aktion `pwd -P` prüfen: muss
    `/opt/apps/centric-dienstplanung` sein.

---

## A. Aktueller Production-Stand

| | |
|---|---|
| Container | `centric-dp-web`, Id `ccad65996cb245fa4ed90640bbaec33ee4d30a88ef33859a996c3bf0f287e2dd` |
| Gestartet | `2026-09-15T02:06:02Z`, 0 Neustarts, healthy |
| Image | `ghcr.io/rinats-png/dienstplaner:latest` → lokal `sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1` (erstellt 2026-09-15T02:01:59Z) |
| Herkunft | Auslieferung Run `34919567232`, `main@1a56988` („feat: Netlify-Ausstieg und Release-Härtung“) |
| Compose | `/opt/apps/centric-dienstplanung/compose.yml`, Projekt `centric-dienstplanung`, Image `ghcr.io/rinats-png/dienstplaner:${IMAGE_TAG:-latest}` |
| `.env` (Schlüssel) | `IMAGE_TAG=latest`, `NODE_ENV`, `PORT`, `CENTRIC_DATEN`, `CENTRIC_ABLAGE`, `CENTRIC_BASIS`, `CENTRIC_PFEFFER`, `VAPID_KONTAKT` — **kein** `RESEND_API_KEY` |
| Härtung | `user 1000:1000`, `read_only`, `tmpfs /tmp`, `cap_drop ALL`, `no-new-privileges`, 512 MB, keine Ports, Netz `proxy` |
| Daten | `./data` → `/data`, 640 KB |
| Ablage | `centric`: 9 Zugangscodes (`konto:p1:…`), 2 `verwalter:`, `selbststarts`, `aufraeumen:letzter`. **Kein Bestand, keine Accounts, keine Mitgliedschaften.** `centric-sitzungen`: 5 `t:` (Zugangscode). `centric-takt`: 98 `v:`. `centric-spur`: 36 Einträge |
| Sicherungen | **keine** (`sicherungen/` existiert nicht; das alte Image enthält das Sicherungswerkzeug noch nicht) |
| Sonstiges im Ordner | `README.md`, `.env.example`, `zugaenge-2026-09-14.txt(.save)` — nicht anfassen |

**Achtung `latest`:** Ein Image-Build auf `main` verschiebt das GHCR-Tag `latest` auf den
Release Candidate. Der laufende Container bleibt davon unberührt, solange niemand in
`/opt/apps/centric-dienstplanung` `docker compose pull` oder `up` mit Pull ausführt. Deshalb
nennt dieser Plan jedes Image ausschließlich per **Digest**.

## B. Release Candidate

| | |
|---|---|
| `main` | `e676b8ebaf74df294bc36a061b079a3a6a8484b7` (Fast-Forward von `223dd385`, CI grün: Prüfung `38093723503`, Sicherheit `38093723552`) |
| Auf Staging geprüftes Image | `ghcr.io/rinats-png/dienstplaner:9c3130e507cbc6729313c7c7548bd6466d735bf7@sha256:a3ed1f09b585e25c3a0118b7fe0d56af990c73a0331c13a43a10801c53e40aed` |
| Image vom `main`-Commit | **wird nach dem Build eingetragen** (Tag `e676b8e…`, Index-, amd64- und Config-Digest) |
| Inhaltliche Gleichheit | `9c3130e` → `e676b8e` ändert nur `docs/PRE-PRODUCTION-GATE.md`; `docs/` gelangt nicht ins Laufzeit-Image (Dockerfile kopiert nur `dist`, `server`, `server.mjs`, `package.json`, das Sicherungswerkzeug) |

**Deploy-Ziel:** das `main`-Image, sobald es gebaut und auf Staging kurz bestätigt ist (siehe
Abschluss). Ersatzweise das bereits vollständig geprüfte `9c3130e@sha256:a3ed1f09…`.

## C. Unterschiede Production → Release Candidate

`1a56988..e676b8e`: 45 Commits, 66 Dateien (15 feat, 9 fix, 7 ci, 6 test, 5 docs, 1 refactor,
1 chore, 1 build).

| Bereich | Inhalt |
|---|---|
| Persönliche Accounts | Speicher, Registrierung (öffentlich), E-Mail-Verifizierung, Passwort setzen, Account-Anmeldung, Betriebsauswahl, Mitgliedschaften mit Generation |
| Sitzungen (Phase A.1) | Arbeitssitzung an Account-Sitzung gebunden, ein Prüfpunkt für alle Pfade (F3), Aktivität getrennt von der Autorität (R1/F4), Abmelden räumt auf (F1), täglicher Aufräumlauf (F2) |
| Sicherung | `werkzeug/ablage-sicherung.mjs` im Image (sichern/prüfen/wiederherstellen) |
| Kalender | Termine werden geprüft, Fehler protokolliert, ICS-Zeileninjektion geschlossen |
| Oberfläche | Fokus in Blättern (Dialoge) bleibt beim Tippen im Feld |
| CI | vollständiges Gate, Auslieferung daran gebunden |

**Datenformat:** `codes.mjs`, `konten.mjs`, `verwalter.mjs` und `ablage.mjs` sind seit
`1a56988` unverändert. `selbststarts` hat dasselbe Format. Die vorhandenen Production-Schlüssel
bleiben also ohne Migration lesbar.

**Belegt durch eine Generalprobe** (2026-10-10, isoliert, ohne Netz, synthetische Daten,
danach entfernt):

1. Das echte Production-Image `0861adee` hat Production-förmige Daten angelegt: Zugangscodes
   mit Pfeffer, Verwalter, Selbststarts, Code-Sitzungen über den echten HTTP-Weg.
2. Upgrade auf den Release Candidate:
   - Alte Code-Sitzungen bleiben gültig.
   - Alte Codes melden an, Verwalter gültig, Selbststarts lesbar (Umlaute).
   - Ungültiges Merkmal ergibt 401.
   - Der Aufräumlauf lief mit 0 Fehlern und hat nichts Gültiges gelöscht.
3. Sicherung mit dem RC-Image bei nur lesend gemounteten Daten: „In Ordnung“.
4. Zurück auf `0861adee`: Alles gilt weiter, auch eine im RC angelegte Code-Sitzung.

**Neu öffentlich erreichbar:** `/api/registrierung*` und `/api/account/*`. Die Oberfläche nutzt
sie noch nicht. Ohne `RESEND_API_KEY` geht keine Mail hinaus (Trockenlauf). Eine Registrierung
lässt sich deshalb nicht abschließen, erzeugt aber einen eingeladenen Account-Datensatz; das ist
durch die Bremse begrenzt. Siehe Risiken.

## D. Backup vor dem Deploy

Im Wartungsfenster, **Container kurz gestoppt**, damit die Kopie konsistent ist (die Daten sind
640 KB groß, das dauert Sekunden).

```sh
cd /opt/apps/centric-dienstplanung && [ "$(pwd -P)" = /opt/apps/centric-dienstplanung ] || exit 9
TS=$(date -u +%Y%m%dT%H%M%SZ)
ALT=ghcr.io/rinats-png/dienstplaner@sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1
RC=<RC-Image per Digest, siehe B>

# 1. Zustand festhalten
docker inspect centric-dp-web > inspect.vor-rc-$TS.json
cp -p compose.yml compose.yml.vor-rc-$TS
cp -p .env .env.vor-rc-$TS && chmod 600 .env.vor-rc-$TS
docker tag sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1 \
  ghcr.io/rinats-png/dienstplaner:prod-vor-rc-1a56988      # lokaler Anker, nie löschen
docker pull "$RC"                                            # vorab, damit der Deploy ohne Netz geht

# 2. Stoppen (Beginn der Downtime)
docker compose stop centric-dp-web
```

## E. Vollständige Datenkopie und Sicherheitskopie

```sh
# 3. Rohkopie (Rückweg G) + Prüfsumme
cp -a data data.vor-rc-$TS
( cd data && find . -type f -print0 | sort -z | xargs -0 sha256sum ) > data.vor-rc-$TS.sha256
( cd data.vor-rc-$TS && sha256sum -c --quiet ../data.vor-rc-$TS.sha256 ) && echo "Rohkopie OK"

# 4. Logische Sicherung mit dem Werkzeug aus dem RC-Image (Daten nur lesend gemountet)
mkdir -p sicherungen && chmod 700 sicherungen
docker run --rm --network none --user 1000:1000 --read-only --tmpfs /tmp --cap-drop ALL \
  --env-file .env -v "$PWD/data:/data:ro" -v "$PWD/sicherungen:/sicherungen" \
  --entrypoint node "$RC" werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen </dev/null
S=$(ls -t sicherungen | head -1)
docker run --rm --network none --user 1000:1000 --read-only --tmpfs /tmp --cap-drop ALL \
  --env-file .env -v "$PWD/sicherungen:/sicherungen:ro" \
  --entrypoint node "$RC" werkzeug/ablage-sicherung.mjs pruefen --sicherung /sicherungen/$S </dev/null
#   erwartet: "In Ordnung: N Dateien". Sitzungen/Takt sind bewusst nicht enthalten (Klasse C).

# 5. Außerhalb des Servers ablegen (vom Betreiber-Rechner aus)
#   scp -r admin@<vps>:/opt/apps/centric-dienstplanung/sicherungen/$S  <sicherer Ort>
```

**Abbruchregel:** Scheitert 3, 4 oder 5, wird nicht deployt. Dann
`docker compose up -d --pull never centric-dp-web` mit dem unveränderten Stand.

## F. Rollback-Image

`ghcr.io/rinats-png/dienstplaner@sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1`
(dazu der lokale Anker-Tag `prod-vor-rc-1a56988`). **Nicht** `latest`, denn das zeigt nach dem
`main`-Build auf den RC.

## G. Rollback-Datenstrategie

- **Normalfall: keine Daten zurückspielen.** Der RC verändert die vorhandenen Schlüsselformate
  nicht. Das alte Image liest, was der RC schreibt; das belegt die Generalprobe.
- **Vor dem Zurückrollen** (BEREITSTELLUNG 5.7): Kontobezogene Sitzungen kennt das alte Image
  nicht. Deshalb werden `t:` in `centric-sitzungen` und alles in `centric-accountsitzungen`
  **beiseitegelegt** (nicht gelöscht). `sk:` bleibt. Production hat heute keine Accounts; zu
  erwarten sind höchstens Sitzungen, die nach dem Deploy entstanden sind.
- **Bei einem Datenintegritätsfehler:** Container stoppen, `mv data data.defekt-<TS>`,
  `cp -a data.vor-rc-$TS data`, Prüfsumme gegen `data.vor-rc-$TS.sha256`, altes Image
  starten. Änderungen nach dem Deploy (neue Anmeldungen, Codes) gehen dabei verloren; sie
  liegen aber in `data.defekt-<TS>` und lassen sich prüfen.
- **Letzte Stufe:** `wiederherstellen --sicherung … --ziel <neuer Ordner>` aus E4 in einen
  neuen Ordner, prüfen, dann umhängen. Nie den laufenden Ordner überschreiben.

## H. Verhalten bestehender Sitzungen

| Sitzungsart | Production heute | Nach dem Upgrade |
|---|---|---|
| Zugangscode-Sitzung (`t:` ohne Herkunft) | 5 | **bleibt gültig**; Aktivität ab dann in `ta:` (F4) |
| Konto-Anmeldung (`as:`) | 0 | — |
| Konto-Arbeitssitzung (`t:` mit Herkunft) | 0 | — |
| Abgelaufene Sitzungen | ggf. unter den 5 | räumt der Aufräumlauf 1 min nach dem Start weg, sofern eindeutig seit über 1 h tot |

## I. Hinweis zur Ausrollregel

**Konto-Arbeitssitzungen aus dem alten Stand werden beim Upgrade ungültig**: kein
Übergangsmodus; wer gerade in einem Betrieb arbeitet, bekommt „Nicht angemeldet“ und muss neu
öffnen (BEREITSTELLUNG 5.7). In der heutigen Production gibt es keine Konto-Sitzungen. Die
Regel trifft daher niemanden, gilt aber für jeden späteren Deploy in gleicher Weise.

## J. Wartungsfenster

- Ein ruhiger Zeitraum, z. B. werktags 06:00–06:30 Europe/Berlin, mit dem Betreiber abgestimmt.
- Vorher erledigt: das `main`-Image ist gebaut und auf Staging bestätigt, der Plan freigegeben
  und die Person mit SSH-Zugang anwesend.
- Kein paralleler Eingriff an Caddy, DNS oder anderen Containern.

## K. Erwartete Downtime

- Stopp bis Ende der Sicherung: ca. 1–2 min (D2 bis E4).
- Neuerstellung bis healthy: ca. 10–20 s (Staging und Generalprobe: 8 s).
- **Geplant: unter 5 min.** Abbruch und Rollback (V) zusätzlich ca. 2 min.

## L. Benutzerkommunikation

- Vorab, falls Zugangscodes aktiv genutzt werden: „Kurze Wartung am <Datum> zwischen <Zeit>
  und <Zeit>. Ihre Zugänge bleiben gültig; ggf. einmal die Seite neu laden.“
- Nachher nur bei Störung: „Die Wartung ist abgeschlossen“ bzw. „Wir haben die Änderung
  zurückgenommen, Ihre Daten sind unverändert.“
- Neu öffentlich erreichbare Account-Endpunkte werden nicht beworben; die Oberfläche zeigt
  sie nicht.

## M. Deployment-Befehle

```sh
cd /opt/apps/centric-dienstplanung && [ "$(pwd -P)" = /opt/apps/centric-dienstplanung ] || exit 9
# Image per Digest festnageln (Tag@Digest); damit spielt `latest` keine Rolle mehr
RC_TAG='<commit-sha>@sha256:<index-digest>'                 # aus B
grep -q '^IMAGE_TAG=latest$' .env || { echo "STOPP: .env unerwartet"; exit 9; }
sed -i "s#^IMAGE_TAG=latest\$#IMAGE_TAG=$RC_TAG#" .env
grep '^IMAGE_TAG=' .env
docker compose up -d --pull never --force-recreate centric-dp-web
until [ "$(docker inspect centric-dp-web --format '{{.State.Health.Status}}')" = healthy ]; do sleep 2; done
```

Danach `docker inspect` gegen A vergleichen: gleiches Netz, gleicher Benutzer, read-only,
keine Ports, gleicher Mount. Nur Image und Id sind neu.

## N. Health Checks

- `docker inspect centric-dp-web`: `healthy`, 0 Neustarts, Image = RC-Digest.
- `docker exec centric-dp-web node -e 'fetch("http://127.0.0.1:3000/gesund")…'` ergibt 200.
- Über Caddy von außen: `https://<produktive Adresse>/gesund` ergibt 200, und die Startseite
  lädt das neue Bundle.
- `docker logs centric-dp-web`: Startzeilen, keine Fehler; nach 1 min
  `Löschlauf: … 0 Fehler`.
- `aufraeumen:letzter` → `sitzungen.fehler = 0`, `abgebrochen = false`.

## O. Login/Logout-Smoke

Ein **eigener, temporärer Smoke-Betrieb** `smoke-<TS>`: angelegt über die Produktwege
(`baueLeerenBetrieb`, Account, Mitgliedschaft, Zugangscode), mit `@example.org`-Adressen, im
Container per `docker exec`. **Nie echte Codes oder echte Betriebe verwenden.** Vorher und
nachher einen Abdruck aller Schlüssel nehmen; danach mit `raumLoeschen` plus den exakten
Account-Schlüsseln wieder entfernen. Danach muss der Hauptspeicher bis auf den Vermerk des
Aufräumlaufs gleich sein.

- Konto-Anmeldung, Betrieb öffnen, lesen, abmelden → danach 401.
- Zugangscode-Anmeldung, lesen.
- **Bestand:** eine der vorhandenen Code-Sitzungen bleibt gültig. Nur den Status prüfen, keine
  Inhalte lesen.

## P. F1/F3/R1/F4-Kurzregression (am Smoke-Betrieb)

- **F1:** Nach dem Abmelden 401 auf `/api/bestand`, allen fünf frühen Pfaden und dem Kalender;
  `as:`/`t:` sind entfernt; ein zweites Gerät bleibt gültig.
- **F3:** Ein unbekanntes Merkmal ergibt überall 401.
- **R1:** Nach mehr als 60 s Aktivität sind `as:`/`t:` unverändert, `az:` ist geschrieben.
- **F4:** Bei einer Code-Sitzung bleibt `t:` unverändert, `ta:` ist geschrieben.

## Q. Tenant-Isolation-Smoke

Ein zweiter Smoke-Betrieb B:

- A öffnet B: 403.
- Lesen mit `?bestand=B` bleibt in A.
- `zugaenge` und `raum-loeschen` für B: 403.
- Der Export von A enthält B nicht.
- Kalender-Daten mit einem Verweis aus A in der Sitzung von B: 404.
- B ist danach bit-gleich.

## R. Kalender

Am Smoke-Betrieb:

- Ein gültiger Termin ergibt 200, der ICS-Feed liefert 200 (Umlaute, 24:00 → 00:00).
- Ein ungültiger Termin ergibt 400 mit Feld.
- Zeilenumbrüche werden maskiert.
- Feed abschalten.

## S. Person hinzufügen

Im Browser mit dem Smoke-Code:

- Vor- und Nachname vollständig tippen, mit Umlauten, Tab zum nächsten Feld.
- Speichern, Reload; die Person steht in der Liste.
- Serverseitig im Smoke-Betrieb byte-genau gespeichert.

## T. Backup nach dem Deploy

E4 noch einmal mit dem RC-Image und dem laufenden Container: `sichern` und `pruefen` ergeben
„In Ordnung“. Die Sicherung außerhalb des Servers ablegen. Die Sicherung vor dem Deploy,
`data.vor-rc-$TS`, die Compose- und `.env`-Kopien und der Anker-Tag bleiben stehen.

## U. Rollback-Kriterien (jedes einzelne genügt)

- Nicht `healthy` nach 2 min, oder Neustart-Schleife.
- `/gesund` über Caddy nicht 200.
- **Auth:** Eine Anmeldung, die gelingen muss, scheitert. Oder etwas, das scheitern muss, gelingt
  (F1/F3 verletzt, falsches 200). → **sofort**
- **Tenant:** irgendein Zugriff auf B aus A. → **sofort**
- **Daten:** vorhandene Codes melden nicht mehr an, Verwalter ungültig, Abdruck vorher/nachher
  weicht außerhalb des Erwarteten ab, `pruefen` meldet nicht „In Ordnung“. → **sofort**
- Aufräumlauf mit Fehlern oder Löschungen gültiger Einträge.
- Wiederholte 500 im Protokoll (`centric-spur`, Art `fehler`) ohne erklärbare Ursache.

## V. Rollback-Ablauf

```sh
cd /opt/apps/centric-dienstplanung && [ "$(pwd -P)" = /opt/apps/centric-dienstplanung ] || exit 9
RB=$(date -u +%Y%m%dT%H%M%SZ)
docker compose stop centric-dp-web
# 1. Kontobezogene Sitzungen beiseitelegen (BEREITSTELLUNG 5.7), sk: bleibt
mkdir -p sitzungen-vor-rollback-$RB/centric-sitzungen sitzungen-vor-rollback-$RB/centric-accountsitzungen
find data/centric-sitzungen -maxdepth 1 -type f -name 't%3A*' -exec mv -t sitzungen-vor-rollback-$RB/centric-sitzungen/ {} +
find data/centric-accountsitzungen -maxdepth 1 -type f -exec mv -t sitzungen-vor-rollback-$RB/centric-accountsitzungen/ {} + 2>/dev/null || true
#    Hinweis: Damit enden auch die Zugangscode-Sitzungen; die Codes selbst bleiben, Neuanmeldung genügt.
# 2. Altes Image per Digest
cp -p .env .env.vor-rollback-$RB
sed -i "s#^IMAGE_TAG=.*#IMAGE_TAG=latest@sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1#" .env
# 3. Nur bei Datenintegritätsfehler: Rohkopie zurück (G)
#    mv data data.defekt-$RB && cp -a data.vor-rc-$TS data && (cd data && sha256sum -c --quiet ../data.vor-rc-$TS.sha256)
docker compose up -d --pull never --force-recreate centric-dp-web
until [ "$(docker inspect centric-dp-web --format '{{.State.Health.Status}}')" = healthy ]; do sleep 2; done
```

Danach Health (N) und die Anmeldung mit einem Smoke-Code prüfen; Image-Digest =
`0861adee…`. In der Generalprobe ist dieser Ablauf (RC → altes Image) erfolgreich gelaufen.

## W. Post-Deploy-Monitoring

| Zeitpunkt | Prüfung |
|---|---|
| T+1 min | Löschlauf-Zeile, `aufraeumen:letzter` fehlerfrei |
| T+15 min | Health, Neustarts = 0, keine neuen `fehler`-Einträge in `centric-spur`, Speicher unter 512 MB (`docker stats --no-stream`) |
| T+24 h | Zweiter Aufräumlauf fehlerfrei; Anzahl `konto:`/`verwalter:` unverändert; Sitzungsdateien nicht unbegrenzt gewachsen |
| T+7 d | Rückblick; die Rohkopie `data.vor-rc-*` bleibt trotzdem stehen |

Zusätzlich beobachten: ob über `/api/registrierung` eingeladene Accounts entstehen (siehe
Risiken).

## X. Entscheidungspunkt GO / ROLLBACK

| Punkt | Bedingung | Entscheidung |
|---|---|---|
| X1 vor dem Stopp | B-Image gebaut und auf Staging bestätigt, Plan freigegeben | GO für D |
| X2 nach E | Rohkopie OK, Sicherung „In Ordnung“, extern abgelegt | GO für M, sonst Abbruch ohne Änderung |
| X3 nach N–S (ca. T+10 min) | alle Prüfungen grün, Smoke-Daten wieder entfernt | **GO** (Betrieb bleibt) oder **ROLLBACK** (V) |
| X4 T+24 h | W ohne Befund | Abschluss; `IMAGE_TAG` bleibt per Digest festgenagelt |

Jede Entscheidung trifft der Betreiber und protokolliert sie mit Uhrzeit.

---

## Offene Risiken

1. **Neue öffentliche Account-Endpunkte ohne Mailversand:** Registrierungen lassen sich nicht
   abschließen, legen aber eingeladene Datensätze an (begrenzt durch die Bremse, ohne
   automatisches Aufräumen). Vor dem Deploy entscheiden: so akzeptieren, `RESEND_API_KEY`
   setzen oder die Endpunkte in einem eigenen Schritt per Schalter abschalten.
2. **`latest` verschiebt sich mit dem `main`-Build.** Abgefangen durch die Digest-Pins in F und
   M. Bis zum Deploy darf in `/opt/apps/centric-dienstplanung` kein `pull` laufen.
3. **Production hat bisher keine Sicherung**, und das alte Image kann keine erstellen. Die erste
   Sicherung entsteht in E4 mit dem RC-Werkzeug; geprobt in der Generalprobe.
4. **Generalprobe mit synthetischen Daten:** Die echten 9 Codes und 2 Verwalter wurden nicht
   kopiert (Regel). Formatgleichheit ist im Code belegt (unveränderte Bibliotheken) und in der
   Generalprobe nachgestellt.
