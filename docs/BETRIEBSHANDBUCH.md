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
| Import von Personal- und Schichtdaten aus Dateien (Funktion bleibt aus) | Abschnitt 6 dieses Handbuchs |
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
| `CENTRIC_TEILSPEICHERUNG` | Teilspeicherung je Segment mit Versionen (WP-48.3: `POST /api/bestand/teile`, `teile` im `GET /api/bestand`); nur genau `true` schaltet ein, alles andere bleibt aus (fail-closed: Weg 404, GET ohne `teile`, Speichern über den Voll-PUT). Stand WP-48: Server-Teilweg fertig, Oberfläche (48.5) fehlt — erst mit 48.5 und nach Betreiberfreigabe einschalten (`docs/acc45/WP48-TEILSPEICHERUNG.md` 7.2) | aus | ja (auskommentiert) |
| `CENTRIC_HILFE_ASSISTENT` | Hilfe-Assistent (WP-I23): `aus` (Vorgabe), `suche` (Hilfe-Suche über feste Hilfetexte, kein Modell) oder `an` (zusätzlich eine vom Gateway formulierte Antwort, nur wenn ein Gateway eingehängt ist; heute keines). Jeder andere Wert bedeutet aus. Datenschutz: die Frage wird weder gespeichert noch protokolliert; E-Mail, Telefon und IBAN werden vor dem Gateway entfernt | aus | ja (auskommentiert) |
| `CENTRIC_IMPORT_AKTIV` | Personalimport (IMP-1…IMP-4): alle Wege `/api/import/*` (`upload`, `analyse`, `vorschau`, `uebernahme`, `verwerfen`). Nur genau `true` schaltet ein; alles andere (`TRUE`, `1`, `yes`, `true ` mit Leerzeichen, leer) bleibt aus (fail-closed): jeder Weg antwortet 404, bevor `server.mjs` einen Rumpf liest — kein Parser-Kindprozess, kein Importvorgang, keine Änderung am Bestand, auch nicht für einen vorher offenen Vorgang. Der Schalter der Oberfläche (`IMPORT_DATEI_AKTIV` in `src/lib/import-schnittstelle.js`) ist nur Anzeige und schützt den Server **nicht**. Einschalten erst nach der Prüfung IMP-9 §13 und Betreiberfreigabe (`docs/acc45/IMPORT-VERTRAG.md`); Nachweis `pruefungen/import-schalter.test.js` | aus | ja (auskommentiert) |
| `CENTRIC_IMPORT_ADRESSRAUM_KB` | Import-Parser (IMP-2): Adressraum-Limit (`ulimit -v`, in KB) für den Kindprozess, der hochgeladene Tabellendateien liest; begrenzt auch Speicher außerhalb des JS-Heaps (Heap selbst: 256 MB). **Wirkt nur unter Linux** (Docker-Image); unter Windows/macOS (Entwicklung) gibt es kein Adressraum-Limit. Werte über 4194304 (4 GB) werden auf 4 GB geklemmt, ungültige Werte führen zur Vorgabe, beides mit Warnung im Protokoll. `0` schaltet das Limit aus, ebenfalls mit Warnung bei jedem Parser-Lauf — nur für Ausnahmefälle (z. B. wenn Node unter dem Limit nicht startet). Lässt sich das Limit nicht setzen, wird die Datei nicht verarbeitet (fail closed). Dass Node im Zielbild (`node:22-alpine`) unter der Vorgabe startet und das Limit greift, ist erst mit dem Linux-Test `H1 (nur Linux) …` in `pruefungen/import-parser.test.js` nachgewiesen; dieser Test ist noch nicht auf Linux gelaufen (docs/acc45/IMPORT-VERTRAG.md §4, docs/acc45/IMP-2-NACHWEIS.md §11) | 1500000 | ja (auskommentiert) |
| `CENTRIC_AUFRAEUMEN` | täglicher Löschlauf abgelaufener Testbetriebe; `aus` schaltet ab — **und mit ihm den Datenschutzlauf** (gleicher Block) | an | ja (auskommentiert) |
| `CENTRIC_DATENSCHUTZLAUF` | Aufbewahrungsfristen auf dem Server (WP-26), täglich mit dem Löschlauf: `aus` — gar nicht; `vorschau` — rechnet und berichtet (Protokoll, Vermerk `datenschutzlauf:letzter`), löscht nichts; `an` — löscht nach den Fristen, vorher je Raum eine automatische Sicherung. Derselbe Lauf räumt die alten, vom Gerät gerechneten Kalender-Termine `feeddaten:*` (WP-24; `vorschau` zählt sie, `an` löscht sie). Erst `an`, wenn der Vorschau-Bericht geprüft und die Fristen mit der Leitung abgestimmt sind. **Achtung beim Zurückschalten:** Nach `an` → `vorschau` (oder `aus`) räumt auch das Zurückspielen einer Sicherung nicht mehr nach Fristen; eine ältere Sicherung bringt damit bereits fristgerecht gelöschte Angaben (z. B. Gründe) zurück, bis wieder `an` gilt (bewusst so, WP-26 N-3; das Ergebnis des Zurückspielens meldet, was fällig wäre). | vorschau | ja (auskommentiert) |
| `CENTRIC_ZWEIFAKTOR_PFLICHT` | `1`: Verwalterschlüssel ohne zweiten Faktor nur zur Einrichtung (ab dem ersten eingerichteten Faktor ohnehin) | aus | ja (auskommentiert) |
| `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` | `1`: Betreibercode ohne zweiten Faktor bekommt keine Sitzung. **Unter `NODE_ENV=production` (Docker-Image) immer Pflicht und nicht abschaltbar (WP-32d)**, ebenso bei fehlender oder unbekannter `NODE_ENV`; Betreibersitzungen ohne bestandenen Faktor gelten dann bei keiner Anfrage; Wiederherstellung offline: `werkzeug/betreiber-2fa-zuruecksetzen.mjs` | aus nur bei `NODE_ENV=development` oder `test` | ja (auskommentiert) |
| `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT` | Nur `1` schaltet ein; jeder andere Wert lässt die Pflicht aus und erscheint als Warnung in `/api/einrichten/umgebung`. Mit `1` (SI-P4): (a) Zugangscode der Rolle Leitung, Planung (planer, subplaner) oder Kunde — und Mitarbeitercode, dessen Person im Betrieb Leitung oder Planung ist — ohne eingerichteten zweiten Faktor bekommt keine Sitzung, nur die Einrichtung (403); (b) die Betriebsauswahl über ein Konto (E-Mail und Passwort) öffnet keinen Betrieb, in dem Mitgliedschaft oder Person eine dieser Rollen hat (403, `zweifaktor-pflicht`) — dafür gilt der Zugangscode mit Faktor; die Konto-Anmeldung selbst bleibt eine Identität ohne Rolle. **Achtung, über das Konto angelegte Betriebe** (Testbetrieb aus der Registrierung, `lib/provisionierung.mjs`): Ihre Leitung hat nur die Konto-Mitgliedschaft `leitung` und **keinen Zugangscode** — unter Pflicht ist dieser Betrieb für seine Leitung deshalb **nicht erreichbar** (Betriebsauswahl 403 `zweifaktor-pflicht`, Hinweis auf Zugangscode). Vor dem Einschalten der Pflicht prüfen, ob solche Betriebe genutzt werden; ein Rückweg (Zugangscode anlegen, Zurücksetzen durch den Betreiber) war offen (docs/acc45/SI-P4-NACHWEIS.md, Delta-Auflage 2). Entschieden 2026-11-09 (OPT-1, `lib/zugangscode-ersteinrichtung.mjs`): Die Provisionierung kann auf Wunsch (`ersteinrichtung: true`) einen Ersteinrichtungscode für die Leitung anlegen — einmal angezeigt, nie per E-Mail, 72 Stunden gültig, an Konto, Person und Betrieb gebunden, nach fünf falschen Werten aus der App gesperrt. OPT-1-F (Option A): Der Code richtet zusammen mit Adresse und Passwort den zweiten Faktor **am Konto** ein (`POST /api/account/anmelden`, `zweifaktorAktion` `beginnen`/`bestaetigen`, Feld `ersteinrichtungscode`); Adresse und Passwort allein richten keinen Faktor ein. Danach gilt die Kontoanmeldung mit Passwort und Code aus der App, und die Betriebsauswahl öffnet den Betrieb als Leitung. Auf dem Zugangscode-Weg gilt der Code nie (wie unbekannt). Aufrufer ist allein das Betreiberwerkzeug `werkzeug/testbetrieb-anlegen.mjs --ersteinrichtung` (Server gestoppt, kein Netzweg). Das Werkzeug ist **nicht im Docker-Image** (Dockerfile unverändert; Aufnahme ist eine Betreiber-/Infra-Entscheidung): Aufruf auf dem Host mit Quellstand und `node_modules` in der Fassung des laufenden Bildes, nach `docker compose -f deploy/compose.yml stop centric-dp-web`, mit `CENTRIC_DATEN` = Pfad des Datenvolumes auf dem Host (`deploy/data`), `CENTRIC_PFEFFER` wie im Dienst, als uid 1000, danach `start` — nur mit Betreiberfreigabe; ohne den Schalter bleibt es beim Betrieb ohne Code (docs/acc45/OPT-1-NACHWEIS.md). Hat ein Konto einen aktiven Faktor, gilt keine Kontositzung und keine daraus geöffnete Arbeitssitzung ohne bestandenen Faktor mehr; (c) jede bestehende Sitzung mit einer dieser Rollen ohne bestandenen zweiten Faktor endet bei ihrer nächsten Anfrage (401 `neu-anmelden`, in `/api/…` und in `/zustellung/senden`), auch wenn die Person erst nach der Anmeldung hochgestuft wurde; (d) fehlt `CENTRIC_PFEFFER`, gibt es für diese Rollen 503 statt einer Sitzung. Ausnahmen: öffentlicher Demozugang in `demo-*`-Räumen, Sicherungsschlüssel, Betreiber (eigene Pflicht). Ein eingerichteter Faktor gilt immer, auch ohne Pflicht; fehlt danach der Pfeffer oder wird er gewechselt: 503. „Zugang merken“ ist für diese Rollen ohne Faktor immer gesperrt. Verloren: neuer Zugangscode, alter wird gesperrt | aus | ja (auskommentiert) |
| `CENTRIC_KONTOWIEDERHERSTELLUNG` | Nur `1` schaltet ein (WR-3, `lib/kontowiederherstellung-zugang.mjs`): Verlustfall für Zugangscodes der Rollen Leitung, Planung, Kunde, die Gerät **und** Wiederherstellungscodes verloren haben. Über `/api/anmelden` mit `zweifaktorAktion` `verlust-melden` (Träger, erster Faktor; alle Sitzungen des Zugangs enden), `verlust-freigeben`/`verlust-ablehnen` (zwei verschiedene Leitungen desselben Betriebs, je eigener Zugangscode + frischer Code aus der eigenen App, Verfahren der Identitätsprüfung Pflicht; nicht der Betroffene, nicht dieselbe Person, nicht dieselbe Einheit), `verlust-einloesen` (Träger mit dem Abschlusstoken, 15 min gültig, einmal) und `verlust-zurueckziehen`. Antrag höchstens 24 h offen. Ergebnis ist nie eine Sitzung, sondern eine neue ausstehende Einrichtung des Faktors; danach gewöhnliche Anmeldung mit Code aus der App. Jede Freigabe und Ablehnung verlangt die Personalnummer der geprüften Person (aus den eigenen Unterlagen, nie vom Antragsteller übernehmen); sie muss zur Person des Falls passen. Einen neuen Fall sperrt erst die zweite Ablehnung durch eine andere Person (24 h). Fälle sind an die Schlüsselepoche gebunden. Ausschalten bei laufenden Fällen: alle Verlust-Aktionen 403, Fälle laufen nach 24 h ab; eine abgelaufene Einrichtung aus einem Fall braucht dann einen neuen Zugangscode (docs/acc45/WR-3-NACHWEIS.md, Abschnitt 7). Kein Weg für Betreibercodes, Verwalterschlüssel, Konten (E-Mail/Passwort). Aktivierung ist eine eigene Betreiberfreigabe (Benachrichtigung der Beteiligten noch nicht gebaut; docs/acc45/WR-3-NACHWEIS.md) | aus | ja (auskommentiert) |
| `CENTRIC_ERSTLEITUNG_STRENG` | Strenge Ersteinrichtungsregeln (E-D1/E-D2) für **Bestandsbetriebe** (`server/lib/erstleitung.mjs`). Nur genau `true` schaltet ein; alles andere (`1`, `TRUE`, ` true` und `true ` mit Leerzeichen, leer, ungesetzt) bleibt aus (fail-closed). **Bestandsbetriebe** sind Betriebe, die vor dieser Änderung angelegt wurden und keine Regimemarke tragen; für sie gilt bei ausgeschaltetem Schalter unverändert das alte Verhalten. **Neue Betriebe** sind ab Anlage streng, über eine einmal geschriebene Regimemarke und unabhängig vom Schalter. Mit `true` gelten die strengen Regeln auch für Bestandsbetriebe: Ein Leitungscode ohne Person wird bei der Anmeldung mit 403 abgewiesen, und bestehende Sitzungen, die allein an einem solchen Code hängen, enden. **Nicht einschalten für bestehende Produktionsbetriebe**, bevor die Bestandsanalyse gelaufen ist (Erkennung `werkzeug/erkennung-gestrandete-betriebe.mjs` auf einer **Kopie** eines Backups, `docs/acc45/MIGRATION-ERSTEINRICHTUNGSCODES.md`) und der Betreiber es ausdrücklich freigegeben hat. Rückweg: Zurückstellen auf aus stellt das alte Verhalten nur für Bestandsbetriebe wieder her; schon geschriebene Regimemarken bleiben bestehen (neue und bereits umgestellte Betriebe bleiben streng). Ohne den Schalter werden Bestandsbetriebe nur durch ausdrückliche Betreiberhandlungen streng (Leitungscode ohne Person für einen leeren Betrieb über `/api/zugaenge` oder `/einrichten`, Wiedereinfügen oder Umbenennen per Betreiber-PUT; K1–K4 in `docs/acc45/ABNAHME-V4-A3-BESTAND-GARANTIE.md`). Nachweise: `docs/acc45/ABNAHME-V4-A3-ERSTLEITUNG.md`, `docs/acc45/ABNAHME-V4-A3-BESTAND-GARANTIE.md` | aus | ja (auskommentiert) |
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
| bei Bedarf | **Unvollständige Raumlöschung** (Konsole meldet „Löschung unvollständig – erneut ausführen“, `/api/raum-loeschen` antwortet 500 mit `offen`): Der Mandant bleibt in der Konsole stehen; Ursache in `offen` prüfen (auch unlesbare Einträge anderer Räume zählen, weil sie zu diesem Raum gehören könnten) und die Löschung erneut ausführen. Der Aufruf ist wiederholbar, auch wenn der Kern schon weg ist. Bis dahin ist der Raumname für neue Zugänge gesperrt (409 `kundenraum_gesperrt`, Marke `loeschung:<raum>`); der Löschlauf greift nur bei `t-…`-Räumen mit Kern. | Betreiberkonsole, `docs/acc45/SI-P6-NACHWEIS.md` §6 |
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
- **Vor Deploy prüfen: Offline-Warteschlangen (Stand 181b4fe/ba5f7c5, [WP-18-NACHWEIS.md](acc45/WP-18-NACHWEIS.md) 9.3).**
  Der Inhaber der Offline-Stempel-Warteschlange ändert sich für Konto-Sitzungen mit Funktionsrolle, für alle Sitzungen in
  Betrieben mit rein numerischer Raum-ID und für alte Code-Sitzungen ohne Betriebsnummer. Offline erfasste Stempel mit
  dem alten Inhaber bleiben danach auf dem Gerät liegen (409 `STEMPEL_FREMDE_SITZUNG`). Deshalb: (1) alle Betriebe mit
  Raum-ID `/^\d+$/` auflisten (nur lesend); (2) die Geräte der Betroffenen online bringen, bis keine Stempel ausstehen
  (Warteschlange leeren), oder die Stempel nachtragen; (3) erst dann ausliefern. Empfehlung: leeren lassen.
  **Offen:** Betreiberbestätigung; die Prüfung ist noch nicht gelaufen.
- **Vor und nach Deploy prüfen: zweiter Faktor und Schlüsselepoche (OPT-4/WR-2,
  [OPT-4-WR-2-LUECKEN.md](acc45/OPT-4-WR-2-LUECKEN.md)).**
  (a) `/zustand` (compose: `./zustand:/zustand`) muss existieren, dem Containerbenutzer uid 1000 gehören und
  beschreibbar sein. Sonst antworten Aktivieren eines zweiten Faktors, Neuerzeugen der Wiederherstellungscodes und
  Anmelden mit einem Wiederherstellungscode mit 503 (fail-closed). (b) Nach dem ersten Deploy mit WR-2 gelten alle
  Wiederherstellungscodes ohne Epoche (Altformat v1 und v2 aus der Zeit davor) nicht mehr, bis ihre Inhaber mit dem
  Code aus der App neue erzeugen (Aktion `wiederherstellung-neu`); die Inhaber vorher informieren. (c) Jede neue
  Schlüsselepoche (Vollwiederherstellung, fehlende oder überholte `skbindung`, Verzeichniskopie der Ablage) macht alle
  Wiederherstellungscodes ungültig, ohne Benachrichtigung (Entscheidung E3 offen). (d) Bis zur Freischaltung von WR-3 (`CENTRIC_KONTOWIEDERHERSTELLUNG=1`, nur Zugangscodes) und bis WR-9 (Konten) gibt es keinen
  Rückweg für Inhaber, die Telefon UND Wiederherstellungscodes verlieren. (e) `NODE_ENV` muss in Produktion
  `production` sein (das Docker-Image setzt es); `development` oder `test` schalten die Epochenbindung ab.
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

## 6. Import von Personal- und Schichtdaten aus Dateien (Funktion bleibt aus)

Stand 2026-11-12. Maßgeblich sind der Parser-Vertrag [acc45/IMPORT-VERTRAG.md](acc45/IMPORT-VERTRAG.md), die Testmatrix
[acc45/IMP-8-TESTMATRIX.md](acc45/IMP-8-TESTMATRIX.md) und der Quelltext; dieser Abschnitt fasst nur zusammen, was der Betreiber
zum Ein- und Ausschalten, zu den Grenzen, zum Protokoll und zu den Fehlermeldungen wissen muss. Für die Leitung gibt es ein eigenes
Kapitel im Handbuch der Anwendung („Import von Personal- und Schichtdaten“); es sagt ausdrücklich, dass die Funktion erst mit der
Freigabe des Betreibers zur Verfügung steht.

### 6.1 Was ausgeliefert ist und was nicht

| Baustein | Stand |
|---|---|
| Parser (IMP-2), `server/lib/import/parser*.mjs` | im Server, läuft je Datei in einem eigenen Kindprozess |
| Personalimport (IMP-3, IMP-5), `server/funktionen/import.mjs` | Endpunkte `/api/import/upload`, `analyse`, `vorschau`, `uebernahme`, `verwerfen`; **aus**, solange `CENTRIC_IMPORT_AKTIV` nicht genau `true` ist (jeder Weg antwortet 404) |
| Oberfläche „Personal aus Datei importieren“ (IMP-4), `src/ansichten/import-datei.jsx` | **aus**: wird nicht angezeigt, solange die Anzeigekonstante `IMPORT_DATEI_AKTIV` den Wert `false` hat |
| Schichtmodelle und Schichtzyklen (IMP-6), `schichtmodelle.mjs`, `schichtpruefung.mjs` | nur Bibliothek: kein Endpunkt, keine Oberfläche. Wählt jemand am Endpunkt die Art `schichtzyklus`, antworten `analyse` und `vorschau` mit „unterstuetzt: false“, `uebernahme` mit 422 `ART_NICHT_FREIGEGEBEN`; es wird nichts geschrieben |
| KI-Unterstützung der Spaltenzuordnung (IMP-9), `ki-schnittstelle.mjs` | nicht verdrahtet; kein Server und kein Import ruft sie auf; der Import arbeitet vollständig ohne KI (IMPORT-VERTRAG §13) |
| Testmatrix (IMP-8) | 20 Fälle mit synthetischen Dateien, `npm run pruefung:imp8-testmatrix`; Browser-Ende-zu-Ende-Prüfung bei allen Fällen offen, weil die Oberfläche aus ist |

**Zwei Schalter, nur einer schützt den Server:** `CENTRIC_IMPORT_AKTIV` ist **der** Serverschalter (Umgebungsvariable, Vorgabe aus,
nur genau `true` schaltet ein, alles andere bleibt aus). Ist er aus, antwortet jeder Weg `/api/import/*` mit 404, bevor ein Rumpf gelesen,
ein Parser gestartet oder etwas gespeichert wird. `IMPORT_DATEI_AKTIV` ist dagegen eine reine Anzeigekonstante im Quelltext
(`src/lib/import-schnittstelle.js`); sie steuert nur, ob die Oberfläche den Dialog zeigt, und schützt den Server **nicht**. Daneben gibt es in
der Oberfläche den bisherigen Weg „Personal importieren“ durch Einfügen von Text aus der Zwischenablage; er ist ein anderer Weg, hat keinen
Dateiupload und wird von diesem Abschnitt nicht berührt.

### 6.2 Schalter und Umgebungsvariablen

| Name | Art | Wirkung | Vorgabe |
|---|---|---|---|
| `CENTRIC_IMPORT_AKTIV` | Umgebungsvariable, **Serverschalter** | Nur genau `true` schaltet alle Wege `/api/import/*` ein; alles andere (`TRUE`, `1`, leer) bleibt aus und ergibt 404. Beschreibung in der Tabelle „Funktionen“ in Abschnitt 2 und in `.env.example` | aus |
| `IMPORT_DATEI_AKTIV` | Quelltextkonstante (`src/lib/import-schnittstelle.js`), nur Anzeige | `true` zeigt in „Personal importieren“ den Weg „aus Datei“ und gibt der Oberfläche die Schnittstelle zu `/api/import`; `false`: keine Aufrufe der Oberfläche. Schützt den Server nicht | `false` |
| `CENTRIC_IMPORT_ADRESSRAUM_KB` | Umgebungsvariable | Adressraum-Limit des Parser-Kindprozesses in KB, **nur Linux**. Beschreibung, Klemmen auf 4 GB, `0` und ungültige Werte siehe Tabelle „Funktionen“ in Abschnitt 2 | `1500000` |

Weitere Umgebungsvariablen für den Import gibt es nicht. Alle übrigen Grenzen sind feste Werte im Code und lassen sich nicht über die Umgebung ändern; der Endpunkt reicht
keine Werte aus der Anfrage an den Parser durch.

### 6.3 Grenzen (fest im Code)

| Grenze | Wert | Folge bei Überschreitung |
|---|---|---|
| Dateigröße | 10 MB (Rumpfgrenze des Servers für `upload` ebenfalls 10 MB) | 413 `DATEI_ZU_GROSS` |
| Entpackte Größe (xlsx ist ein ZIP-Archiv) | 100 MB insgesamt; Kompressionsverhältnis höchstens 100 : 1; höchstens 1000 Archiv-Einträge | `ENTPACKT_ZU_GROSS`, `KOMPRESSION_VERDAECHTIG` |
| Datenzeilen je Blatt | 20.000 ohne Kopfzeile | `ZU_VIELE_ZEILEN` |
| Spalten je Blatt | 200 | `ZU_VIELE_SPALTEN` |
| Tabellenblätter | 20 | `ZU_VIELE_BLAETTER` |
| Zellen insgesamt | 4.000.000 | `ZU_VIELE_ZELLEN` |
| Text je Zelle / Text insgesamt | 32.767 Zeichen / 100 Mio. Zeichen (Blattnamen höchstens 31 Zeichen) | `TEXT_ZU_GROSS` bzw. `BESCHAEDIGT` |
| Verarbeitungszeit je Datei | 20 Sekunden Wandzeit, dann wird der Kindprozess hart beendet | `ZEITLIMIT` |
| Arbeitsspeicher des Kindprozesses | Heap 256 MB; unter Linux zusätzlich Adressraum-Limit (6.2) | `SPEICHERLIMIT` |
| Ergebnis des Kindprozesses | höchstens 128 MB | `TEXT_ZU_GROSS` |
| Gleichzeitige Parser | prozessweit 2, je Betrieb (Raum) 1; weitere Uploads werden sofort abgewiesen, nicht eingereiht | 503 `ZU_VIEL_GLEICHZEITIG` (Header `retry-after: 5`) |
| Offene Importvorgänge | 3 je Betrieb (Raum), 20 insgesamt; der Platz wird vor dem Lesen der Datei belegt | 429 `ZU_VIELE_VORGAENGE` |
| Lebensdauer eines Vorgangs | 30 Minuten ohne Zugriff, höchstens 2 Stunden ab Upload; ein Neustart des Servers verwirft alle offenen Vorgänge | Vorgang „nicht gefunden“ (404), die Datei wird neu hochgeladen |
| JSON-Anfragen (`analyse`, `vorschau`, `uebernahme`, `verwerfen`) | 2 MB | 400 `RUMPF_UNGUELTIG` bzw. 413 aus `server.mjs` |
| Anfragebremse | Art „schreiben“: 120 Anfragen je 60 Sekunden und Kennung, gilt für `upload` und `uebernahme` | 429 „zu viele Anfragen“ |
| Wiederholschutz je Datei und Betrieb | 30 Tage | 409 `DATEI_BEREITS_UEBERNOMMEN` |

**Isolation des Parsers:** Jede Datei wird in einem eigenen Node-Kindprozess gelesen (`--max-old-space-size=256`,
`--disallow-code-generation-from-strings`, ohne Shell-Option, ohne die Umgebungsvariablen des Servers, ohne Netz und ohne Schreiben von
Dateien). Ein Absturz oder Überlauf beendet nur das Kind; der Server läuft weiter und antwortet mit `SPEICHERLIMIT` oder
`VERARBEITUNG_FEHLGESCHLAGEN`. Unter Linux wird das Adressraum-Limit über die Shell (`ulimit -v`, dann `exec node`) gesetzt; lässt es
sich nicht setzen, wird die Datei nicht verarbeitet (fail closed). **Windows und macOS (nur Entwicklung) laufen ohne Adressraum-Limit.**
Pro Datei ist mit etwa 0,3 bis 0,6 s zusätzlicher Startzeit zu rechnen (Messung auf einem Windows-Entwicklungsrechner, IMPORT-VERTRAG §4).
Der Linux-Test für das Adressraum-Limit (`H1 (nur Linux)` in `pruefungen/import-parser.test.js`) ist laut Vertrag noch nicht auf Linux gelaufen.

### 6.4 Voraussetzungen und sicheres Einschalten

Die Funktion wird erst eingeschaltet, wenn **alle** folgenden Punkte erfüllt und beim Betreiber festgehalten sind. Die ersten drei sind
organisatorische Freigaben, die der Code nicht prüft.

1. **Datenschutz:** Die Verarbeitung von Personaldaten aus Dateien ist datenschutzrechtlich freigegeben (Verarbeitungsverzeichnis,
   Auftragsverarbeitung, Bewertung nach Art. 35 DSGVO). Die Entscheidungen **E-25** (Anbieter, Auftragsverarbeitung, Nullspeicherung,
   Drittland) und **E-26** (Datenschutz-Folgenabschätzung) betreffen die KI-Unterstützung (IMP-9) und sind Bedingung jeder produktiven
   Anbindung einer KI. Der deterministische Import braucht keine KI und ruft keinen Anbieter auf; solange E-25 und E-26 nicht erteilt sind,
   bleibt IMP-9 aus.
2. **Mitbestimmung:** Ist ein Betriebsrat vorhanden, ist die Einführung mit ihm geklärt; der Betriebsrat selbst darf den Import nicht
   verwenden (6.5).
3. **IMP-9-Neuprüfung (IMPORT-VERTRAG §13):** Vor jeder Verdrahtung der KI-Schnittstelle und vor jeder Erteilung von E-25 oder E-26 wird
   §13 neu geprüft (Port nur mit Notschalter, Freigabe-Gate und Vermerk zu E-25/E-26; Minimierung; Ergebnis nur als Vorschlag).
4. **Technisch:** Das Image enthält den Stand mit Parser-Kindprozess; unter Linux gilt ein Adressraum-Limit (6.2); die Testmatrix
   (`npm run pruefung:imp8-testmatrix`) und die Importprüfungen sind grün; die Auslieferung folgt dem üblichen Weg (Abschnitt 4).
5. **Probe zuerst mit Testdaten:** erst in einem Testbetrieb mit ausgedachten Personen (zum Beispiel „Testperson 01“), nie mit echten
   Personaldaten.

**Einschalten** erfolgt in zwei getrennten Schritten, beide erst nach den Punkten 1 bis 5: (a) auf dem Server `CENTRIC_IMPORT_AKTIV=true`
in der `.env` und Neustart des Dienstes; erst dann nehmen die Wege `/api/import/*` Anfragen an. (b) Soll die Oberfläche den Weg „aus Datei“ zeigen,
`IMPORT_DATEI_AKTIV` in `src/lib/import-schnittstelle.js` auf `true`, danach der übliche Weg über Prüfung, Image und Freigabe
([DEPLOY-AUTOMATISIERUNG.md](DEPLOY-AUTOMATISIERUNG.md)). Die Quelltext-Prüfungen `pruefungen/import-oberflaeche-imp4.test.js` und
`pruefungen/imp8-testmatrix.test.js` nennen die Anzeigekonstante und sind dabei mit zu beachten; den Serverschalter belegt
`pruefungen/import-schalter.test.js`.

**Ausschalten:** `CENTRIC_IMPORT_AKTIV` entfernen oder auf einen anderen Wert als `true` setzen und den Dienst neu starten; alle Wege antworten wieder 404, auch für einen offenen Vorgang. Die Anzeigekonstante lässt sich zusätzlich auf `false` setzen (neues Image). Bereits übernommene Personen
bleiben, denn sie sind gewöhnliche Einträge im Personalbestand; **eine Funktion „Import rückgängig“ gibt es nicht**. Wer eine Übernahme
korrigieren will, ändert oder löscht die Personen einzeln in der Anwendung oder stellt eine Sicherung wieder her
([RESTORE-ANLEITUNG.md](RESTORE-ANLEITUNG.md)). Die Übernahme selbst ist „ganz oder gar nicht“; bei einem Fehler vor dem Schreiben bleibt
der alte Stand.

### 6.5 Rechte

Nach `RECHTEMATRIX.md` und `server/funktionen/import.mjs` (bei eingeschaltetem Serverschalter): Den Import verwenden dürfen nur **Leitung** und **Planung** (Recht
`staff.edit` mit vollem Schreibumfang). Neue Einheiten, Standorte und Qualifikationen legt der Import zusätzlich nur mit `org.edit` an
(Leitung); ohne dieses Recht antwortet der Server mit 403 `ORG_EDIT_FEHLT` und schreibt davon nichts. Betreiber, die alte Rückfallrolle
„kunde“ (Zugang ohne Person), Schichtverantwortung, Beschäftigte und Betriebsrat erhalten 403 `KEINE_BERECHTIGUNG`; ohne Sitzung 401.
Der Betrieb kommt nur aus der Sitzung; ein Vorgang eines anderen Betriebs, Raums oder einer anderen Person ist „nicht gefunden“ (404).
Fremde Herkunft einer Anfrage: 403 `HERKUNFT`.

### 6.6 Was protokolliert wird (keine Personendaten)

Jeder Schritt schreibt eine Zeile in die Betriebsspur (`protokoll("import", …)`, siehe [BETRIEB-UEBERWACHUNG.md](BETRIEB-UEBERWACHUNG.md)):
Zeit, Art `import`, Ausgang (`hochgeladen`, `abgewiesen`, `verworfen`, `erfolg`, `fehler`), Kennung des Betriebs als Hashwert, Rolle,
betriebsinterne Personenkennung der handelnden Person, Weg (`import/upload` usw.), Herkunft als Kürzel, Betriebs-Id und ein kurzer Text
aus Zahlen und Codes, zum Beispiel „Format xlsx · 1 Blätter · 40 Datenzeilen“, „Datei: ZU_VIELE_ZEILEN“ oder „neu 12 · aktualisiert 3 ·
übersprungen 1 · Einheiten neu 0 · Standorte neu 0“. **Nie** enthalten sind Dateiname, Zellinhalt, Name, E-Mail oder ein Stacktrace;
Fehlermeldungen nennen Felder, keine Werte. Die Datei selbst wird nur im Arbeitsspeicher gelesen und danach verworfen; der Importvorgang
(Rohinhalt, Analyse, Plan) liegt nur im Arbeitsspeicher und wird nach der Übernahme, beim Verwerfen, nach 30 Minuten ohne Zugriff oder
spätestens nach 2 Stunden gelöscht. Dauerhaft bleibt nur der Wiederholschutz: ein Eintrag `importerledigt:…` (30 Tage) mit einem
abgeleiteten Schlüssel aus Betrieb und Hashwert der Datei, dem Zeitpunkt, der Personenkennung und den Zahlen. Die Übernahme erscheint
außerdem im Journal des Bestands mit „durch: Import“.

### 6.7 Fehlercodes, Bedeutung und Abhilfe

Die Meldung zum Code steht im Feld `fehler` der Antwort (Parser-Fehler: der Satz des Parsers) und ist für die Anzeige am Bildschirm
gedacht. Fehlt `code` in der Antwort (z. B. bei der allgemeinen Anfragebremse), zeigt die Oberfläche „Der Import ist fehlgeschlagen.“

**Datei und Parser (HTTP 422, bei Größe 413):**

| Code | Bedeutung | Abhilfe |
|---|---|---|
| `LEER` | Datei leer, nur Leerraum oder ohne Daten | richtige Datei wählen |
| `DATEI_ZU_GROSS` | über 10 MB | Datei teilen oder verkleinern |
| `UNBEKANNTES_FORMAT` | weder xlsx, xls noch lesbarer Text (CSV/TSV); Binärdatei, UTF-16-Text | als xlsx oder als CSV in UTF-8 speichern |
| `NICHT_UNTERSTUETZT` | ODS (OpenDocument), xlsm (Makros), xlsb, Vorlagen, Add-ins, Numbers, ZIP64, mehrteilige Archive, OLE ohne Tabellenstrom | als xlsx (ohne Makros) oder CSV speichern |
| `PASSWORTGESCHUETZT` | Datei verschlüsselt | ohne Passwort speichern |
| `BESCHAEDIGT` | Datei nicht lesbar oder widersprüchlich aufgebaut | in Excel öffnen und neu speichern |
| `ENTPACKT_ZU_GROSS`, `KOMPRESSION_VERDAECHTIG` | Schutzgrenze gegen präparierte Archive (ZIP-Bomben) | Datei prüfen; echte Tabellen erreichen die Grenzen nicht |
| `ZU_VIELE_ZEILEN`, `ZU_VIELE_SPALTEN`, `ZU_VIELE_BLAETTER`, `ZU_VIELE_ZELLEN`, `TEXT_ZU_GROSS` | Grenzen aus 6.3 überschritten | Datei verkleinern oder aufteilen |
| `ZEITLIMIT` | Verarbeitung länger als 20 Sekunden, Kindprozess beendet | kleinere oder einfachere Datei; häufiges Auftreten dem Betreiber melden |
| `SPEICHERLIMIT` | Kindprozess hat sein Speicherlimit erreicht | wie `ZEITLIMIT`; Adressraum-Limit nicht ohne Grund erhöhen |
| `VERARBEITUNG_FEHLGESCHLAGEN` | unklarer Abbruch des Kindprozesses (auch: Adressraum-Limit unter Linux nicht setzbar, fail closed) | Wiederholen; bei Dauerfehler Serverprotokoll und `CENTRIC_IMPORT_ADRESSRAUM_KB` prüfen |
| `EINGABE_UNGUELTIG` | keine Datei übergeben (nur intern) | nicht von der Oberfläche auslösbar |

**Endpunkt (Ablauf und Auslastung):**

| Code (HTTP) | Bedeutung | Abhilfe |
|---|---|---|
| `NICHT_ANGEMELDET` (401) | keine Sitzung | anmelden |
| `HERKUNFT` (403) | Anfrage nicht von der Anwendung | nur über die Anwendung arbeiten |
| `KEINE_BERECHTIGUNG` (403) | Rolle darf nicht importieren, oder die Rolle darf die Übernahme nicht schreiben | mit Leitung oder Planung anmelden |
| `ORG_EDIT_FEHLT` (403) | „Fehlende Einheiten … anlegen“ gewählt ohne Recht `org.edit` | Leitung anlegen lassen oder Häkchen entfernen |
| `NICHT_GEFUNDEN` (404) | Vorgang abgelaufen, fremd oder bereits verworfen | Datei erneut hochladen |
| `ART_UNBEKANNT` (400), `FORMAT_DER_ANFRAGE` (415), `RUMPF_UNGUELTIG` (400) | fehlerhafte Anfrage (nicht von der Oberfläche auslösbar) | Fehler melden |
| `ZU_VIELE_VORGAENGE` (429) | 3 offene Vorgänge im Betrieb oder 20 insgesamt | offene Vorgänge abschließen oder 30 Minuten abwarten |
| `ZU_VIEL_GLEICHZEITIG` (503) | Parser des Betriebs oder des Servers ausgelastet | nach einigen Sekunden erneut |
| `VORUEBERGEHEND` (503) | Ablage kurz nicht erreichbar | nach einigen Sekunden erneut |
| `INTERNER_FEHLER` (500) | unerwarteter Fehler; es wurde nichts übernommen | Serverprotokoll (Eintrag `fehler`, `import`) prüfen |
| `BLATT_UNGUELTIG`, `ZUORDNUNG_UNGUELTIG` (422) | Blatt oder Spaltenzuordnung gibt es nicht | in der Oberfläche neu wählen |
| `ANALYSE_FEHLT` (409), `VORSCHAU_FEHLT` (409), `BESTAETIGUNG_UNGUELTIG` (409) | Reihenfolge Analyse, Vorschau, Übernahme nicht eingehalten | Schritte der Reihe nach ausführen |
| `PFLICHTSPALTE_FEHLT` (422) | Nachname, Vorname oder Einheit nicht zugeordnet | Spalte zuordnen |
| `ENTSCHEIDUNG_UNZULAESSIG` (422) | Wahl bei einem Datensatz nicht erlaubt | Wahl ändern |
| `AKTUALISIERUNG_OHNE_BESTAETIGUNG` (422) | „Aktualisieren“ ohne ausdrückliche Bestätigung je Person | bestätigen oder anders wählen |
| `ZUORDNUNGSKONFLIKT` (422) | Einheit, Standort oder Qualifikation im Betrieb nicht vorhanden | zuordnen, mit Leitung anlegen oder überspringen |
| `ART_NICHT_FREIGEGEBEN` (422) | Schichtzyklen sind nicht übernehmbar | nicht verwendbar |
| `VORSCHAU_VERALTET` (409) | Bestätigung gehört nicht zur aktuellen Vorschau oder der Bestand hat sich geändert; nichts geändert | Vorschau neu erstellen |
| `UEBERNAHME_LAEUFT`, `LAEUFT_BEREITS` (409) | Übernahme läuft schon (Doppelklick, zweiter Tab) | Ergebnis abwarten |
| `BEREITS_UEBERNOMMEN` (409), `DATEI_BEREITS_UEBERNOMMEN` (409) | Vorgang oder Datei in den letzten 30 Tagen für diesen Betrieb schon übernommen | nichts tun; die Antwort nennt Zeit und Zahlen |
| `NICHTS_ZU_UEBERNEHMEN` (422) | nach der Auswahl bleibt kein Datensatz | Wahlen ändern |
| `FACHPRUEFUNG` (409) | die Übernahme würde Prüfbefunde im Plan auslösen | Einteilungen prüfen |
| `STANDORT_UNGUELTIG`, `GESTALT` (422) | Ergebnis wäre ungültig; nichts geändert | Fehler melden |
| `KONFLIKT` (409) | jemand hat inzwischen gespeichert; nichts geändert | Vorschau neu erstellen |
| `SCHREIBEN_FEHLGESCHLAGEN` (503) | Schreiben nicht erfolgt; nichts geändert | später erneut |
| `SCHREIBEN_UNKLAR` (500) | Ausgang des Schreibens ungewiss | **Personalbestand prüfen**, bevor erneut übernommen wird; Hinweis im Protokoll |
| `UEBERNAHME_ABGEBROCHEN`, `INTERNE_PRUEFUNG` (500) | Abbruch vor dem Schreiben bzw. Sicherheitsprüfung hat die Übernahme gestoppt; nichts geändert | Fehler melden |

Hinweise zu Dateien (kein Fehler, die Datei wird gelesen): `ENDUNG_ABWEICHEND`, `ZEICHENSATZ_ERSATZ` (Windows-1252 angenommen),
`DATUMSSYSTEM_1904` (umgerechnet), `LEERE_ZEILEN_ENTFERNT`, `LEERE_SPALTEN_ENTFERNT`, `LEERES_BLATT`, `AUSGEBLENDETES_BLATT`,
`EXTERNE_VERWEISE_IGNORIERT`, `MAKROS_VERWORFEN`, `EINGEBETTETE_OBJEKTE_IGNORIERT`.

### 6.8 Bekannte Abweichungen zwischen Beschreibung und Code

Diese Punkte sind beobachtet, nicht geändert; die Tabellen oben beschreiben das Verhalten des Codes.

- Der Text der Oberfläche (`src/ansichten/import-datei.jsx`) nennt „Excel-, ODS- oder CSV-Datei“ und lässt im Dateidialog `.xlsm` und
  `.ods` zu; der Parser lehnt beide ab (`NICHT_UNTERSTUETZT`, IMPORT-VERTRAG §11).
- Der Kommentar im Quelltext (`import-schnittstelle.js`) beschreibt den Endpunkt als noch nicht integriert; er ist integriert und über `CENTRIC_IMPORT_AKTIV` geschaltet (6.1).
- Die Codes des Endpunkts (6.7, zweite Tabelle) stehen nicht im Parser-Vertrag §9; maßgeblich ist `server/funktionen/import.mjs` mit
  `IMP-3-NACHWEIS.md`.
