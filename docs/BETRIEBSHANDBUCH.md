# Betriebshandbuch CENTRIC

Stand 2026-11-03, Integrationsstand b84de34 (WP-41). Einstieg für den Betrieb des Dienstes. Dieses
Handbuch verknüpft die Einzeldokumente, statt sie zu wiederholen — maßgeblich ist jeweils das
verlinkte Dokument. Es enthält keine Adressen, Zugangsdaten, Codes oder Schlüssel.

| Thema | Dokument |
|---|---|
| Auslieferung von Hand, Umgebung, erste Einrichtung | [BEREITSTELLUNG.md](../BEREITSTELLUNG.md) |
| Auslieferung automatisiert (deploy.sh, Freigabe) | [DEPLOY-AUTOMATISIERUNG.md](DEPLOY-AUTOMATISIERUNG.md) |
| Sicherung außer Haus, Probe-Restore, Ernstfall | [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) |
| Überwachung, /gesund, Alarm | [BETRIEB-UEBERWACHUNG.md](BETRIEB-UEBERWACHUNG.md) |
| Störungen Schritt für Schritt | [INCIDENT-RUNBOOK.md](INCIDENT-RUNBOOK.md) |
| Welcher Wiederherstellungsweg wann | [RESTORE-ANLEITUNG.md](RESTORE-ANLEITUNG.md) |
| Sicherheitsmaßnahmen und Restrisiken | [SICHERHEIT.md](../SICHERHEIT.md) |
| Proxy und X-Forwarded-For | [CADDY-UND-XFF.md](CADDY-UND-XFF.md) |
| Branch-Schutz (Empfehlung) | [BRANCH-SCHUTZ.md](BRANCH-SCHUTZ.md) |
| Wer sieht was | [RECHTEMATRIX.md](../RECHTEMATRIX.md) |
| Handbuch je Rolle | [handbuch/README.md](handbuch/README.md) |
| Vorlage der Laufzeitumgebung | [.env.example](../.env.example) |
| Freigegebene Bilder | [deploy/FREIGEGEBENE-IMAGES.md](../deploy/FREIGEGEBENE-IMAGES.md) |

## 1. Architektur in Kürze

    Browser ─ HTTPS ─ Caddy (TLS, Sicherheitsköpfe) ─ Netz „proxy“ ─ Container centric-dp-web:3000
                                                                       node server.mjs
                                                                       ├─ dist/ (Oberfläche)
                                                                       ├─ server/funktionen/*.mjs (API)
                                                                       └─ Dateiablage /data (Bind-Mount ./data)

- **Ein Prozess je Ablage.** Die Prozesssperre (`/data/.prozess`) verhindert einen zweiten; nach einem harten
  Abbruch übernimmt der neue Container sie nach bis zu ~50 s.
- **Keine Datenbank.** Stores unter `/data`: `centric` (Betriebe, Konten, Zugänge, Sicherungen),
  `centric-sitzungen`, `centric-accountsitzungen`, `centric-takt` (Bremse), `centric-spur` (Protokoll);
  Punkt-Ordner `.gesund/` für die Probe von /gesund.
- **Bild nur per Digest** (`IMAGE_DIGEST` in der `.env`, Freigabeliste), Basisbild per Digest gepinnt, im Endbild
  kein npm. Kein Port nach außen; Caddy erreicht den Container über das Docker-Netz.
- **Zugänge:** Zugangscodes je Rolle und Betrieb; Konten mit E-Mail und Passwort (öffentliche Registrierung
  vorerst aus); Verwalterschlüssel für `/einrichten` (Skripte des Betreibers); Zwei-Faktor für
  Verwalterschlüssel und Betreibercodes (TOTP).

## 2. Konfiguration

Alle Variablen, die der Code liest (abgeleitet aus `server/`, `server.mjs`, `werkzeug/`), mit Vorgabe. „Vorlage“ =
steht in [.env.example](../.env.example). Werte mit Geheimnischarakter stehen nie im Repository.

### Pflicht und Grundlagen

| Variable | Bedeutung | Vorgabe | Vorlage |
|---|---|---|---|
| `IMAGE_DIGEST` | Bild per Digest (nur Compose) | keine — ohne bricht Compose ab | ja |
| `NODE_ENV` | `production` im Betrieb | — | ja |
| `PORT` | Port im Container | `3000` | ja |
| `CENTRIC_DATEN` | Wurzel der Ablage | `/data` | ja |
| `CENTRIC_ABLAGE` | nur `dateien` zulässig | `dateien` | ja |
| `CENTRIC_BASIS` | öffentliche Adresse; Herkunftsprüfung, Links in Mails, Cookie | Adresse der Anwendung | ja |
| `CENTRIC_PFEFFER` | Pfeffer für Code- und Konten-Prüfsummen, Schlüssel für Zwei-Faktor-Geheimnisse; **nie ändern** | — (Pflicht) | ja |
| `CENTRIC_VERTRAUTE_PROXYS` | wem X-Forwarded-For geglaubt wird (Caddys feste Adresse); leer = niemandem; ungültig = kein Start | leer | ja |
| `CENTRIC_ADMIN` | Ursprungsschlüssel für das erste Verwalterkonto; danach entfernen | — | ja |

### Funktionen

| Variable | Bedeutung | Vorgabe | Vorlage |
|---|---|---|---|
| `CENTRIC_PUBLIC_REGISTRATION` | öffentliche Selbstregistrierung; nur genau `true` schaltet ein | aus | ja (auskommentiert) |
| `CENTRIC_AUFRAEUMEN` | täglicher Löschlauf abgelaufener Testbetriebe; `aus` schaltet ab | an | ja (auskommentiert) |
| `CENTRIC_ZWEIFAKTOR_PFLICHT` | `1`: Verwalterschlüssel ohne zweiten Faktor nur zur Einrichtung (ab dem ersten eingerichteten Faktor ohnehin) | aus | ja (auskommentiert) |
| `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` | `1`: Betreibercode ohne zweiten Faktor bekommt keine Sitzung | aus | ja (auskommentiert) |
| `RESEND_API_KEY`, `CENTRIC_ABSENDER` | E-Mail-Versand (ohne: Trockenlauf) | aus | ja |
| `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_KONTAKT` | Web-Push (beide Hälften nötig) | aus | ja |
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | atomare Bremse über Instanzen | aus (Ablage + Prozess) | ja |

### Überwachung (WP-05, [BETRIEB-UEBERWACHUNG.md](BETRIEB-UEBERWACHUNG.md))

| Variable | Bedeutung | Vorgabe | Vorlage |
|---|---|---|---|
| `CENTRIC_UEBERWACHUNG` | `aus` stellt den Prüftakt ab (/gesund prüft weiter) | an | **nein** |
| `CENTRIC_GESUND_TAKT_S` | Prüftakt | 60 | **nein** |
| `CENTRIC_GESUND_CACHE_MS` | Zwischenspeicher /gesund | 10000 | **nein** |
| `CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT` | freier Platz: Warnung | 15 | ja (auskommentiert) |
| `CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT` | freier Platz: kritisch (auch deploy.sh) | 3 | ja (auskommentiert) |
| `CENTRIC_GESUND_PLATZ_KRITISCH_MB` | freier Platz: kritisch absolut (auch deploy.sh) | 200 | ja (auskommentiert) |
| `CENTRIC_GESUND_SICHERUNG_WARNUNG_STUNDEN` | Alter der letzten Sicherung | 26 | ja (auskommentiert) |
| `CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN` | Alter des letzten Löschlaufs | 26 | **nein** |
| `CENTRIC_GESUND_5XX_WARNUNG` | 5xx je 15 min bis zur Warnung | 10 | **nein** |
| `CENTRIC_SICHERUNG_STATUS` | Pfad zur Statusdatei der Sicherung im Container | leer (Prüfung „nicht eingerichtet“) | **nein** (in `deploy/compose.yml` auskommentiert) |
| `CENTRIC_ALARM_WEBHOOK` | Alarmkanal (nur https); Geheimnis | aus | ja (auskommentiert) |
| `CENTRIC_ALARM_ENTPRELLUNG_S` | Entprellung des Alarms | 120 | ja (auskommentiert) |
| `CENTRIC_ALARM_WIEDERHOLUNG_S` | Erinnerung bei anhaltender Störung | 21600 | **nein** |

### Nur für Prüfungen und Werkzeuge (nicht in die Produktions-.env)

| Variable | Zweck |
|---|---|
| `CENTRIC_STATIK` | anderes Verzeichnis statt `dist/` (Prüfungen) |
| `CENTRIC_PRUEFLINK` | `ja`: Prüflink in Antworten — nur ohne Versandschlüssel und nie bei `NODE_ENV=production` |
| `CENTRIC_PROBE_BASIS` | wird von den Gate-Proben (`werkzeug/staging-*.mjs`) bewusst **abgelehnt** (feste Adresse) |

Der Umgebungsbericht `GET /einrichten/umgebung` (Verwalterschlüssel) sagt für die wichtigen Variablen „gesetzt
ja/nein“ und warnt, nie mit Wert ([BEREITSTELLUNG.md](../BEREITSTELLUNG.md), Schritt 2a).

**Lücken der Vorlage** (siehe [Nachweis](acc45/wp41-nachweis.md)): Die mit „nein“ markierten Variablen fehlen in
`.env.example`. Sie haben brauchbare Vorgaben; nur `CENTRIC_SICHERUNG_STATUS` braucht man nach WP-04 tatsächlich.

## 3. Routinen

| Wann | Was | Wo |
|---|---|---|
| täglich (automatisch) | Sicherung außer Haus 02:30, Alarm per Totmannschalter, wenn sie ausbleibt | [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §1–3 |
| täglich (automatisch) | Löschlauf abgelaufener Testbetriebe (Start + 24 h) | `CENTRIC_AUFRAEUMEN` |
| laufend (automatisch) | Zustandsprüfung jede Minute, Alarm bei Störung | [BETRIEB-UEBERWACHUNG.md](BETRIEB-UEBERWACHUNG.md) |
| täglich (Blick) | Alarme und externer Check; bei Bedarf Einzelheiten per `docker exec` (nur lesend) | [INCIDENT-RUNBOOK.md](INCIDENT-RUNBOOK.md) |
| wöchentlich | Dependabot-Vorschläge und der Wochenlauf „Lieferkette“ (Trivy); `.trivyignore` auf abgelaufene Ausnahmen prüfen | `.github/dependabot.yml`, `.github/workflows/lieferkette.yml` |
| wöchentlich | `betrieb-protokoll.log` (Auslieferungen, R0, Rücksprung) durchsehen | VPS, Verzeichnis der Anwendung |
| monatlich (automatisch) | Probe-Restore am 3. um 04:15 | [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) |
| monatlich | Ergebnis der Probe lesen (`probe-status.json`); Verwalterkonten und Betreibercodes durchsehen (wer hat Zugang, Zwei-Faktor eingerichtet?) | [RESTORE-ANLEITUNG.md](RESTORE-ANLEITUNG.md) §4 |
| je Release | Freigabeliste pflegen (aktiv / vorherig / gesperrt mit Grund) | [deploy/FREIGEGEBENE-IMAGES.md](../deploy/FREIGEGEBENE-IMAGES.md) |

## 4. Auslieferung und Rückweg

- **Weg:** nur freigegebene Digests. Von Hand: [BEREITSTELLUNG.md](../BEREITSTELLUNG.md) Schritt 3; automatisiert:
  `deploy/deploy.sh` mit Freigabe in der GitHub-Umgebung `produktion`
  ([DEPLOY-AUTOMATISIERUNG.md](DEPLOY-AUTOMATISIERUNG.md)). Immer zuerst Trockenlauf.
- **R0 (Standard bei Fehlern):** `./abschalten.sh` — Dienst kontrolliert anhalten. Lieber kein Dienst als ein
  unsicheres Bild.
- **Rücksprung:** `./ruecksprung.sh` nur auf den Eintrag `vorherig` der Freigabeliste, nie auf ein gesperrtes Bild,
  nie auf ein Kennzeichen. `deploy.sh --bei-fehler=ruecksprung` nur, wenn das neue Bild noch nichts geschrieben hat.
- **Nach jeder Auslieferung:** Freigabeliste nachziehen (`aktiv`, `vorherig`; das Verlassene ggf. `gesperrt` mit
  Grund), Smoke und Alarmruhe abwarten.

## 5. Schlüssel und Codes (ohne Geheimnisse)

| Was | Wo verwahrt | Wechsel / Entzug |
|---|---|---|
| `CENTRIC_PFEFFER` | `.env` (Modus 600) **und** Passwortmanager | nie ändern — alle Codes, Konten-Prüfsummen und Zwei-Faktor-Geheimnisse hängen daran |
| restic-Passwort, Zugang zum Speicherziel | Passwortmanager, Dateien mit Modus 600 auf dem VPS | [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §2 |
| Verwalterschlüssel (`/einrichten`) | je Person, nur bei ihr | einzeln sperren (`DELETE /einrichten/verwalter`, mit Code); Zwei-Faktor einrichten |
| `CENTRIC_ADMIN` | nur vorübergehend in der `.env` | nach dem ersten Verwalterkonto entfernen |
| Betreibercodes, Zugangscodes | erscheinen genau einmal bei der Anlage | zurückziehen in der Konsole bzw. per Leitung; Sitzungen enden mit |
| Zwei-Faktor-Wiederherstellungscodes | offline bei der Person | jeder gilt einmal |
| Sicherungsschlüssel der Leitung (Vollausgabe) | bei der Leitung | Widerruf über die vollständige Kennung |
| SSH-Schlüssel der Auslieferung, Alarm-Webhook | GitHub-Umgebung bzw. `.env` | [DEPLOY-AUTOMATISIERUNG.md](DEPLOY-AUTOMATISIERUNG.md) §3 |

Der Verlust eines Codes ist kein Notfall: zurückziehen, neu anlegen. Der Verlust des Pfeffers ist einer:
ohne ihn ist keine Sicherung mehr gegenprüfbar und kein Code mehr gültig.
