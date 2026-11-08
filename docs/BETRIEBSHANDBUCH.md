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
| `CENTRIC_ZUSTAND` | Schlüsselepoche der Sicherungsschlüssel (Wiederherstellungsschutz), AUSSERHALB von `CENTRIC_DATEN`, nie sichern oder zurückspielen; nicht nutzbar → keine Sicherungsschlüssel (BEREITSTELLUNG 5.4) | `<CENTRIC_DATEN>-zustand` (compose: `/zustand`) | ja |
| `CENTRIC_SCHREIBHALT_MAX_MS` | längster Schreib-Halt für die Sicherung unter Last (WP-28c, `server/lib/schreibhalt.mjs`): Die nächtliche Sicherung bittet über `<CENTRIC_ZUSTAND>/schreibhalt` (Dateikanal, kein Netz) um einen kurzen Halt neuer Schreibvorgänge; danach läuft immer alles weiter. Ganze Millisekunden, höchstens `10000`; `0` schaltet den Kanal ab (Sicherung dann nur mit Ruhezeit); Unlesbares → Vorgabe. Nie gehalten: Lesen, Sitzungs- und Bremsdaten, Einmal-Token-Einträge selbst, Schlüsselepoche/`skbindung`. Kurz verzögert (bis zur Freigabe, höchstens bis zur Frist), nie abgewiesen: alles, was gesicherte Daten schreibt oder eine der Reihen betritt — u. a. Stempel, Speichern, Einlösen von Einladungs-/Rücksetz-Token (token.mjs), Zwei-Faktor-Einrichtung und -Anmeldung auch der Betreiber (zweifaktor.mjs), Protokolleinträge (`centric-spur`). **Release-Hinweis (Betreiberfreigabe):** nach der Auslieferung sofort aktiv; während eines Halts (typisch 0,1–0,5 s, höchstens die Frist) dauern Stempel und Speichern entsprechend länger (BETRIEB-SICHERUNG §5) | `3000` | ja |
| `CENTRIC_BASIS` | öffentliche Adresse; Herkunftsprüfung, Links in Mails, Cookie | Adresse der Anwendung | ja |
| `CENTRIC_PFEFFER` | Pfeffer für Code- und Konten-Prüfsummen, Schlüssel für Zwei-Faktor-Geheimnisse; **nie ändern** | — (Pflicht) | ja |
| `CENTRIC_VERTRAUTE_PROXYS` | wem X-Forwarded-For geglaubt wird: **nur Caddys feste Adresse** (das Subnetz ist nicht empfohlen); leer = niemandem, und `deploy.sh` liefert nicht aus; ungültig = kein Start | leer | ja |
| `CENTRIC_ADMIN` | Ursprungsschlüssel für das erste Verwalterkonto. **Produktion:** nach dem ersten benannten Verwalterkonto entfernen. **Staging:** die Gate-Proben brauchen ihn — nur für deren Dauer setzen | — | ja |

### Funktionen

| Variable | Bedeutung | Vorgabe | Vorlage |
|---|---|---|---|
| `CENTRIC_PUBLIC_REGISTRATION` | öffentliche Selbstregistrierung; nur genau `true` schaltet ein | aus | ja (auskommentiert) |
| `CENTRIC_SELBSTSTART` | öffentlicher Selbststart (Raum und Betrieb anlegen); nur genau `true` schaltet ein | aus | ja (auskommentiert) |
| `CENTRIC_DEMO` | öffentlicher Demozugang (`/api/demo`, `/api/demos`, Beispielbetriebe auf der Anmeldeseite); nur genau `true` schaltet ein; unabhängig von `CENTRIC_SELBSTSTART` | aus | ja (auskommentiert) |
| `CENTRIC_AUFRAEUMEN` | täglicher Löschlauf abgelaufener Testbetriebe; `aus` schaltet ab — **und mit ihm den Datenschutzlauf** (gleicher Block) | an | ja (auskommentiert) |
| `CENTRIC_DATENSCHUTZLAUF` | Aufbewahrungsfristen auf dem Server (WP-26), täglich mit dem Löschlauf: `aus` — gar nicht; `vorschau` — rechnet und berichtet (Protokoll, Vermerk `datenschutzlauf:letzter`), löscht nichts; `an` — löscht nach den Fristen, vorher je Raum eine automatische Sicherung. Derselbe Lauf räumt die alten, vom Gerät gerechneten Kalender-Termine `feeddaten:*` (WP-24; `vorschau` zählt sie, `an` löscht sie). Erst `an`, wenn der Vorschau-Bericht geprüft und die Fristen mit der Leitung abgestimmt sind. **Achtung beim Zurückschalten:** Nach `an` → `vorschau` (oder `aus`) räumt auch das Zurückspielen einer Sicherung nicht mehr nach Fristen; eine ältere Sicherung bringt damit bereits fristgerecht gelöschte Angaben (z. B. Gründe) zurück, bis wieder `an` gilt (bewusst so, WP-26 N-3; das Ergebnis des Zurückspielens meldet, was fällig wäre). | vorschau | ja (auskommentiert) |
| `CENTRIC_ZWEIFAKTOR_PFLICHT` | `1`: Verwalterschlüssel ohne zweiten Faktor nur zur Einrichtung (ab dem ersten eingerichteten Faktor ohnehin) | aus | ja (auskommentiert) |
| `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` | `1`: Betreibercode ohne zweiten Faktor bekommt keine Sitzung. **Unter `NODE_ENV=production` (Docker-Image) immer Pflicht und nicht abschaltbar (WP-32d)**; Wiederherstellung offline: `werkzeug/betreiber-2fa-zuruecksetzen.mjs` | nur außerhalb production aus | ja (auskommentiert) |
| `RESEND_API_KEY`, `CENTRIC_ABSENDER` | E-Mail-Versand (ohne: Trockenlauf) | aus | ja |
| `CENTRIC_MAIL_WEG` | `smtp` schaltet den IONOS-SMTP-Weg ein (gebaut, ausgeschaltet; docs/MAIL-SMTP-IONOS.md) | aus | nein |
| `CENTRIC_SMTP_HOST`, `CENTRIC_SMTP_BENUTZER`, `CENTRIC_SMTP_ABSENDER` | Server, Anmeldename und Absender des SMTP-Wegs | – | ja |
| `CENTRIC_SMTP_PASSWORT` | Postfach-Passwort des SMTP-Wegs (nur Produktions-`.env`) | – | ja |
| `CENTRIC_SMTP_PORT`, `CENTRIC_SMTP_SICHER` | Port (465/587) und `tls`/`starttls` | 465, tls | nein |
| `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_KONTAKT` | Web-Push (beide Hälften nötig) | aus | ja |
| `CENTRIC_ZUSTELL_BACKOFF` | Mail/Push (WP-30): Wartezeiten in Sekunden vor Wiederholung 2, 3, …, Komma-getrennt; Anzahl + 1 = höchste Versuchszahl | `60,300,1800,7200` | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_PERSON_MAIL`, `CENTRIC_ZUSTELL_PERSON_PUSH` | Tageskontingent je Person und Kanal (dringende Arten ausgenommen); `0` sperrt den Kanal | 10 / 30 | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_BETRIEB_MAIL`, `CENTRIC_ZUSTELL_BETRIEB_PUSH` | Tageskontingent je Betrieb und Kanal (Tag nach Berliner Zeit); erreicht → zurückgestellt bis Mitternacht, nicht verworfen | 200 / 1000 | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_RESERVE_MAIL`, `CENTRIC_ZUSTELL_RESERVE_PUSH` | Teil der Betriebsgrenze nur für echte Notrufe; alle anderen Arten (auch dringende der Planung) belegen höchstens den Rest | ¼ der Betriebsgrenze, höchstens 50 / 250 | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL`, `CENTRIC_ZUSTELL_DRINGEND_PAAR_PUSH` | dringende Mitteilungen je Empfänger und Quelle und Tag (Flut-Schutz; Notruf darüber zurückgestellt) | 5 / 10 | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL`, `CENTRIC_ZUSTELL_DRINGEND_QUELLE_PUSH` | Notrufe einer Person je Tag (gezählt je Notruf, nicht je Mail; darüber zurückgestellt) | 20 / 40 | ja (auskommentiert) |
| `CENTRIC_NOTRUF_JE_STUNDE` | Notrufe je Person und Stunde, die Mitteilungen auslösen (weitere werden gespeichert, nicht zugestellt) | 3 | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_SPERREN_AUFHEBEN` | `ja`: das nächste Zustellaufräumen hebt alle Adresssperren auf (nach einem Konfigurationsfix); danach entfernen | leer | ja (auskommentiert) |
| `CENTRIC_ZUSTELLPROTOKOLL_TAGE` | Aufbewahrung des Zustellprotokolls (1–365); wirkt im Datenschutzlauf (`CENTRIC_DATENSCHUTZLAUF`: `vorschau` zählt, `an` löscht) | 30 | ja (auskommentiert) |
| `CENTRIC_PUSH_HOSTS` | zusätzliche erlaubte Hosts für Push-Endpunkte (Komma; `*.endung`); Vorgabe sind die Dienste von Chrome/Edge, Firefox, Safari, Windows | leer | ja (auskommentiert) |
| `CENTRIC_PUSH_JE_BETRIEB_MAX` | höchste Zahl angemeldeter Geräte je Betrieb | 5000 | ja (auskommentiert) |
| `CENTRIC_TESTRAUM_MAIL` | `ja`: Mail auch aus Test- und Demoräumen (Raum `t-…`/`demo-…` oder selbst angelegter Betrieb) — nur mit Freigabe des Betreibers; sonst gehen von dort keine Mails hinaus (Grund „testraum“), Push bleibt (SI-P3) | aus | ja (auskommentiert) |
| `CENTRIC_TESTRAUM_MAIL_TAG_MAX` | bei Freigabe: höchstens so viele Mails je Test-/Demoraum und Tag (1–1000; darüber „testraum-grenze“) | 20 | ja (auskommentiert) |
| `CENTRIC_TESTRAUM_MAIL_GESAMT_MAX` | bei Freigabe: höchstens so viele Mails je Tag über alle Test-/Demoräume zusammen (1–100000) | 200 | ja (auskommentiert) |
| `CENTRIC_ZUSTELL_TAKT` | `aus` stellt den Takt der Zustell-Warteschlange ab (nur Wartung) | an | ja (auskommentiert) |
| `CENTRIC_GESUND_ZUSTELLUNG_WARNUNG` | Warnung, wenn so viele Zustellungen je Kanal in einer Stunde endgültig fehlschlagen und mehr als gelingen | 3 | ja (auskommentiert) |

Einrichtung Schritt für Schritt (DNS, Anbieter, VAPID, Zustelltest, Fehlersuche): [MAIL-PUSH-EINRICHTUNG.md](MAIL-PUSH-EINRICHTUNG.md).
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | atomare Bremse über Instanzen | aus (Ablage + Prozess) | ja |

### Überwachung (WP-05, [BETRIEB-UEBERWACHUNG.md](BETRIEB-UEBERWACHUNG.md))

| Variable | Bedeutung | Vorgabe | Vorlage |
|---|---|---|---|
| `CENTRIC_UEBERWACHUNG` | `aus` stellt den Prüftakt ab (/gesund prüft weiter) | an | ja (auskommentiert) |
| `CENTRIC_GESUND_TAKT_S` | Prüftakt | 60 | ja (auskommentiert) |
| `CENTRIC_GESUND_CACHE_MS` | Zwischenspeicher /gesund | 10000 | ja (auskommentiert) |
| `CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT` | freier Platz: Warnung | 15 | ja (auskommentiert) |
| `CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT` | freier Platz: kritisch (auch deploy.sh) | 3 | ja (auskommentiert) |
| `CENTRIC_GESUND_PLATZ_KRITISCH_MB` | freier Platz: kritisch absolut (auch deploy.sh) | 200 | ja (auskommentiert) |
| `CENTRIC_GESUND_SICHERUNG_WARNUNG_STUNDEN` | Alter der letzten Sicherung | 26 | ja (auskommentiert) |
| `CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN` | Alter des letzten Löschlaufs | 26 | ja (auskommentiert) |
| `CENTRIC_GESUND_5XX_WARNUNG` | 5xx je 15 min bis zur Warnung | 10 | ja (auskommentiert) |
| `CENTRIC_GESUND_429_WARNUNG` | Abweisungen durch eine **Lastgrenze** (Stempeln je Person/Raum, gelungene Anmeldungen je Betrieb) je 15 min bis zur Warnung — ehrliche Anfragen, die der Server abgewiesen hat; Fehlversuche beim Anmelden zählen nicht | 20 | ja (auskommentiert) |
| `CENTRIC_SICHERUNG_STATUS` | Pfad zur Statusdatei der Sicherung im Container (mit dem Mount in `deploy/compose.yml`) | leer (Prüfung „nicht eingerichtet“) | ja (auskommentiert) |
| `CENTRIC_ALARM_WEBHOOK` | Alarmkanal (nur https); Geheimnis | aus | ja (auskommentiert) |
| `CENTRIC_GESUND_ZEITGRENZE_MS` | Zeitgrenze einer Zustandsprüfung (danach „Ablage kritisch: Zeitgrenze“) | 15000 | ja (auskommentiert) |
| `CENTRIC_ALARM_ENTPRELLUNG_S` | Entprellung des Alarms | 120 | ja (auskommentiert) |
| `CENTRIC_ALARM_WIEDERHOLUNG_S` | Erinnerung bei anhaltender Störung | 21600 | ja (auskommentiert) |

### Anmeldesperre (SI-P7)

Die Anmeldung mit Zugangscode zählt Fehlversuche je Herkunft: acht in fünf Minuten, dann Sperre (verdoppelt sich je Wiederholung bis zwei
Stunden; die Stufe baut sich um eine je Stunde ohne Sperre ab). **Ein gültiger Zugangscode (kein Betreibercode) wird von der Sperre der
Herkunft und von den Grenzen je Betrieb und für den Dienst nicht abgewiesen** — hinter einem Stations-NAT sperrt ein Tippfehler die anderen
nicht mehr aus. Gültige Anmeldungen zählen nicht und nehmen auch keine Fehlversuche zurück.

Wer während einer Sperre weiter rät, wird weiter gezählt: mehr als acht abgewiesene Anfragen in derselben Sperre, und diese Herkunft ist bis
zum Ende der Sperre auch für gültige Codes gesperrt (höchstens 16 Rateversuche je Sperre, früher acht). Bei mehr als 1200 abgewiesenen
Anfragen je fünf Minuten im ganzen Dienst (jede Herkunft trägt höchstens neun bei, eine einzelne kann das also nicht auslösen) gilt die
Durchlässigkeit für niemanden mehr, bis das Fenster endet: Der Dienst steht dann unter verteiltem Raten. Betreibercodes behalten die volle
Bremse. Die Last je Code (20 Anmeldungen in fünf Minuten) und je Betrieb bleibt begrenzt. Die Zähler der Sperrversuche liegen im
Prozessspeicher (ein Prozess je Container). Gleichzeitige Anfragen ändern daran nichts: Ein gültiger Code wartet, bis die Fehlversuche, die
vor ihm von derselben Herkunft kamen, gezählt sind (höchstens 10 s; danach geht er den Weg eines Fehlversuchs über die Bremse, mit gleicher Antwort — nicht gleicher Antwortzeit, Restrisiko siehe SI-P7-NACHWEIS), und entscheidet erst dann. Fällt die
Zählerablage aus, weist die Bremse jeden Fehlversuch ab (fail-closed); die Sperrzählung läuft dann in festen Abschnitten von 300 s
(höchstens acht Sperrversuche je Abschnitt, danach bis zu dessen Ende auch für gültige Codes gesperrt). Mehr als 100 000 Herkünfte mit
laufender Zählung (verteiltes Raten über sehr viele /64) schalten die Durchlässigkeit bis zum Ende des Fensters für alle ab. Die
Steigerungsstufe baut sich ab dem Ende einer Sperre ab; wer ohne Pause anrennt, erreicht die zwei Stunden.

**IPv6 zählt je /64** (Geräte wechseln ihre Adresse darin frei). Das gilt für ALLE Bremsen, die je Herkunft zählen — Zugangscode, Konto-Anmeldung,
Registrierung, Einrichten, Demo und der zweite Faktor —, nicht nur für die Anmeldung mit Zugangscode: Ein /64 ist wie eine IPv4-Adresse hinter
einem NAT ein Anschluss. Folge: In einem IPv6-Netz, in dem viele Geräte ein /64 teilen, zählen deren Fehlversuche gemeinsam; die Spur zeigt
das Kürzel des /64, nicht der Einzeladresse. IPv4-gemappte Adressen (auch in Hex-Schreibweise) und NAT64 (64:ff9b::/96) zählen wie die
eingebettete IPv4-Adresse. Hinter dem Proxy muss `CENTRIC_VERTRAUTE_PROXYS` stimmen, sonst teilen sich alle Nutzer eine Herkunft
([CADDY-UND-XFF.md](CADDY-UND-XFF.md)).

### Nur für Prüfungen und Werkzeuge (nicht in die Produktions-.env)

| Variable | Zweck |
|---|---|
| `CENTRIC_STATIK` | anderes Verzeichnis statt `dist/` (Prüfungen; in `.env.example` unter „nie in Produktion“) |
| `CENTRIC_PRUEFLINK` | `ja`: Prüflink in Antworten — nur ohne Versandschlüssel und nie bei `NODE_ENV=production` |
| `CENTRIC_PROBE_BASIS` | wird von den Gate-Proben (`werkzeug/staging-*.mjs`) bewusst **abgelehnt** (feste Adresse) |

Der Umgebungsbericht `GET /einrichten/umgebung` (Verwalterschlüssel) sagt für die wichtigen Variablen „gesetzt
ja/nein“ und warnt, nie mit Wert ([BEREITSTELLUNG.md](../BEREITSTELLUNG.md), Schritt 2a).

Alle Variablen stehen in `.env.example` (die optionalen auskommentiert, Prüf-Variablen unter „nie in Produktion“);
`pruefungen/doku.test.js` hält das fest.

### Nur für deploy.sh (Shell, nicht die .env)

| Variable | Bedeutung | Vorgabe |
|---|---|---|
| `CENTRIC_DEPLOY_BEHALTEN` | vollständige Auslieferungs-Sicherungen, die bleiben (die geschützte immer) | 5 |
| `CENTRIC_DEPLOY_SICHERUNGEN` | Verzeichnis der Auslieferungs-Sicherungen | `deploy-sicherungen/` |
| `CENTRIC_DATEN_PFAD` | Datenverzeichnis auf dem Host | `data/` |
| `CENTRIC_WARTEZEIT` | Warten auf healthy (mindestens 90 s) | 150 |
| `CENTRIC_TAKT` | Abfragetakt dabei | 2 |

## 3. Routinen

| Wann | Was | Wo |
|---|---|---|
| täglich (automatisch) | Sicherung außer Haus 02:30, Alarm per Totmannschalter, wenn sie ausbleibt | [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §1–3 |
| täglich (automatisch) | Löschlauf abgelaufener Testbetriebe (Start + 24 h) | `CENTRIC_AUFRAEUMEN` |
| täglich (automatisch) | Datenschutzlauf: Aufbewahrungsfristen; in der Vorgabe `vorschau` nur Bericht, kein Löschen | `CENTRIC_DATENSCHUTZLAUF` |
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
| Sicherungsschlüssel der Leitung (Vollausgabe) | bei der Leitung | Widerruf über die vollständige Kennung; endet endgültig (Widerrufsvermerk `skw:`, kein Wiederaufleben), wenn die Person, die ihn angelegt hat, gesperrt wird, ausscheidet, herabgestuft wird, ihr Passwort ändert oder die Kontosicherheit zurückgesetzt wird (SI-P1; das Skript sieht 401 mit Grund, bei `curl -f` einen Fehlercode). Standard 90 Tage, höchstens 365; höchstens fünf aktive je Betrieb. Schlüssel aus der Zeit davor tragen keinen Ersteller und gelten nicht mehr: neu anlegen |
| SSH-Schlüssel der Auslieferung, Alarm-Webhook | GitHub-Umgebung bzw. `.env` | [DEPLOY-AUTOMATISIERUNG.md](DEPLOY-AUTOMATISIERUNG.md) §3 |

Der Verlust eines Codes ist kein Notfall: zurückziehen, neu anlegen. Der Verlust des Pfeffers ist einer:
ohne ihn ist keine Sicherung mehr gegenprüfbar und kein Code mehr gültig.
