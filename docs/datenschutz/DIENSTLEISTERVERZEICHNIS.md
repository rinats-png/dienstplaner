# Dienstleisterverzeichnis (Datenfluss zu Dritten)

**Stand:** 2026-11-03 · **Basis:** `origin/integration/centric-complete` · **Art:** Analyse aus dem Repository, **rechtlich ungeprüft**, kein Vertragsdokument.

> Dieses Verzeichnis beschreibt, welche fremden Dienste CENTRIC laut Code und Doku nutzt oder nutzen soll. Es ist keine Rechtsberatung. Wo das Repository nichts belegt, steht **„zu prüfen“**. Ob ein Vertrag besteht, steht hier nur, wenn das Repository es belegt. Auch dann ist der Vertrag selbst nicht im Repository, die Aussage also nur eine Angabe im Repository und kein Nachweis.
>
> Ergänzende Prüfungen: [IONOS-PRUEFUNG.md](IONOS-PRUEFUNG.md) · [ANTHROPIC-PRUEFUNG.md](ANTHROPIC-PRUEFUNG.md) · [KI-DATENFLUSS.md](KI-DATENFLUSS.md) · [WEB-PUSH-DATENFLUSS.md](WEB-PUSH-DATENFLUSS.md)

## 0. Betreiberangaben und Repository im Vergleich

Der Betreiber hat Angaben gemacht. Sie wurden hier nur als Behauptung aufgenommen und gegen das Repository geprüft.

| Betreiberangabe | Repository | Ergebnis |
|---|---|---|
| IONOS = Server/Hosting | VPS bei IONOS: `docs/IST-STAND.md:3`, `:80`; `rechtliches/auftragsverarbeitung.md:117-129`, Anlage 2 `:356-377`; `rechtliches/datenschutz.md:122-128` | **stimmt überein** |
| IONOS = Datenbank | Es gibt keine Datenbank. Die Daten liegen als JSON-Dateien unter `/data` auf dem VPS: `server/lib/ablage.mjs:1-12` („keine Datenbank, kein Fremddienst“), `deploy/compose.yml:37`, `:47-48`, `README.md:22`, `rechtliches/datenschutz.md:130-133` | **Abweichung.** Eine IONOS-Datenbank wird nicht genutzt. Zu prüfen: Gibt es außerhalb der Anwendung eine (Website, Altbestand)? |
| IONOS = Cloud-Speicher | Ein Ziel für die Sicherung außer Haus ist **nicht festgelegt**. Empfohlen werden „Hetzner Storage Box über sftp, oder S3-kompatibel in der EU“, und „bis dahin ist nichts eingerichtet“: `docs/BETRIEB-SICHERUNG.md:6-11`; Vorlage `deploy/sicherung/env.beispiel:24-30` | **nicht belegt.** Falls IONOS-Speicher (z. B. S3 Object Storage) als restic-Ziel dient, steht das nirgends im Repository → zu prüfen und nachzutragen |
| IONOS = E-Mail-Versand | Die Anwendung versendet über **Resend** (`server/lib/post.mjs:31-43`, `https://api.resend.com/emails`, Variable `RESEND_API_KEY`). Weitere Belege: `server/funktionen/zustellung.mjs:12-16`, `:71`; `server/funktionen/einrichten.mjs:289-305`; `.env.example:114-117`. IONOS-SMTP kommt im Code nicht vor | **Abweichung.** Die Umstellung auf IONOS-SMTP ist ein eigenes Paket (DL-P1 in [IONOS-PRUEFUNG.md](IONOS-PRUEFUNG.md#6-paketvorschläge-schätzungen)) |
| AV-Vertrag mit IONOS vorhanden | Laut Repository „liegt vor; Bestandteil der IONOS-AGB … Anhang 2 Version 4.5, Stand 04/2026“: `rechtliches/PLATZHALTER.md:34` | **als vorhanden angegeben.** Das Dokument selbst liegt nicht im Repository (öffentlich) → Ablage beim Betreiber prüfen |
| native Web-Push | Der Code ist da (`server/lib/webpush.mjs`, `public/sw.js:223-234`, `src/speicher.js:604-626`). In Produktion ist er laut Repository **nicht aktiv**: Rechtstexte „derzeit nicht aktiviert“ (`rechtliches/datenschutz.md:98`, `rechtliches/auftragsverarbeitung.md:131-137`), WP-30 „Mail und Push in Produktion“ steht auf BLOCKED (`docs/acc45/work-packages.json:955-981`) | **teilweise.** Gebaut ja, aktiv nicht belegt. Zu prüfen: Ist `VAPID_PUBLIC`/`VAPID_PRIVATE` in der Produktionsumgebung gesetzt? |
| Anthropic / Claude API „im Einsatz“ | **Kein produktiver Aufruf.** Gesucht wurde in `server/`, `src/`, `package.json` und `.env.example` aller 117 Remote-Branches nach `api.anthropic`, `@anthropic-ai` und `ANTHROPIC_API_KEY`: 0 Treffer. `server/lib/intelligence/` gibt es nur im Branch `origin/intelligence/wp-i11-faktenpaket` (Faktenpaket, Alias, Leck-Prüfung, **kein Anbieteraufruf**). Laut Plan werden „keine Anbieter-Zugangsdaten benötigt und keine angelegt“ (`docs/acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md:158`, `:179`) | **Abweichung für das Produkt.** Im Einsatz ist Claude nur als **Entwicklungswerkzeug** (Claude Code; 554 Commits mit Co-Author-Zeile „Claude“) |

**Dokumentationsfehler im Code:** `server/funktionen/zustellung.mjs:18` sagt über Web Push „kein Fremddienst“. Das stimmt nicht. Jede Push-Nachricht läuft über den Push-Dienst des Browserherstellers (Google, Mozilla, Apple, Microsoft), siehe [WEB-PUSH-DATENFLUSS.md](WEB-PUSH-DATENFLUSS.md). Die Rechtstexte sind hier richtig (`rechtliches/datenschutz.md:99`: „beim Browserhersteller“). Den Kommentar korrigiert das Paket DL-P2.

**Nicht vorhanden (geprüft):**
- **Analytics/Tracking:** keine. `rechtliches/datenschutz.md:46-48`; keine Treffer für gängige Dienste in `server/`, `src/`, `public/`.
- **Zahlungsdienst:** keiner im Code. Die Vorabprüfung kennt nur das Muster für Stripe-Schlüssel (`werkzeug/vorpruefung.mjs:66`), eine Anbindung gibt es nicht.
- **Schriften/CDN:** eigene Schriften, keine Verbindung zu Google Fonts (`rechtliches/datenschutz.md:50-52`).
- **Fehler-Monitoring (Sentry o. Ä.):** keins.
- **Uptime-/Alarmdienst:** nur dokumentiert, nicht eingerichtet. Siehe Nr. 10.

## 1. Übersicht

| Nr. | Dienst | Zweck | Status laut Repository |
|---|---|---|---|
| 1 | IONOS SE (mit Subunternehmer Arsys Internet S.L.U.) | VPS: Anwendung, Serverfunktionen, gesamter Datenbestand | **aktiv** |
| 2 | Resend, Inc. | E-Mail-Versand | Code vorhanden, **nicht aktiviert** (Trockenlauf) |
| 3 | IONOS E-Mail (SMTP) | E-Mail-Versand (Betreiberwunsch) | **geplant**, nicht im Code |
| 4 | Google – Firebase Cloud Messaging (FCM) | Web Push für Chrome/Chromium, Android | Code vorhanden, Aktivierung **zu prüfen** |
| 5 | Mozilla – autopush | Web Push für Firefox | wie 4 |
| 6 | Apple – Apple Push Notification service (Web Push) | Web Push für Safari/iOS-Startbildschirm-App | wie 4 |
| 7 | Microsoft – Push-Dienst für Edge | Web Push für Edge | wie 4; Endpunkt nicht amtlich belegt |
| 8 | Anthropic – Claude API | Intelligence (F1–F18) | **geplant**, kein Produktivcode |
| 9 | Anthropic – Claude Code / claude.ai | Entwicklungswerkzeug | **im Einsatz** (Entwicklung) |
| 10 | Alarm-/Uptime-Dienst (Webhook, Totmannschalter) | Betriebsüberwachung | dokumentiert, **nicht eingerichtet** |
| 11 | Speicherziel der Sicherung außer Haus (restic) | Datensicherung | **nicht festgelegt** |
| 12 | Redis-REST-Dienst (z. B. Upstash) | atomare Bremse | optional, Nutzung **nicht belegt** |
| 13 | GitHub (Repository, Actions, Container-Registry GHCR) | Quelltext, CI, Container-Bild | **im Einsatz** (Lieferkette) |
| 14 | AWS Bedrock / Google Vertex AI | EU-Option für Intelligence | Option in der Spezifikation, **nicht entschieden** |

Nicht als Dienstleister geführt: Die Links „Teilen per WhatsApp, SMS oder E-Mail“ in der Schnellbesetzung (`src/App.jsx:12756-12760`). Sie öffnen eine App auf dem Gerät der Nutzerin, der Server übermittelt dabei nichts. Der Text enthält Dienst, Zeit und Ort, aber keine Personennamen (`src/App.jsx:12733-12740`). Ob ein Betrieb diesen Weg nutzen darf, entscheidet er selbst. Das ist zu prüfen und gehört in die Kundeninformation.

## 2. Einträge (je 15 Felder)

### 2.1 IONOS SE – VPS-Hosting

| Feld | Inhalt |
|---|---|
| Name | IONOS SE, Montabaur. Für die Plattform vServer setzt IONOS als Subunternehmer die Arsys Internet S.L.U., Logroño, Spanien ein |
| Leistung | virtueller Server (VPS): Docker-Container der Anwendung hinter Caddy, Ablage `/data`, lokale Sicherungen (`BEREITSTELLUNG.md`, `deploy/compose.yml`) |
| Integrationsstatus | **aktiv** (Produktion, `docs/IST-STAND.md:3`) |
| Datenkategorien | gesamter Bestand: Stammdaten Beschäftigter, Plan, Abwesenheiten mit Art, Zeiterfassung, Zugangsdaten (Hashes), Protokolle, Push-Anmeldungen, Sicherungen (`rechtliches/auftragsverarbeitung.md` § 2) |
| Personenbezug | ja. Darunter möglicherweise besondere Kategorien (Art. 9 DSGVO), z. B. Abwesenheitsart „Krank“ (`src/App.jsx:867`) |
| Rolle | IONOS ist Unterauftragsverarbeiter von CENTRIC. CENTRIC ist Auftragsverarbeiter der Kunden, für eigene Vertrags- und Testdaten Verantwortlicher. **rechtlich zu prüfen** |
| AV-Vertrag nötig? | ja (Art. 28 DSGVO), soweit IONOS Zugriff auf die Daten haben kann. Rechtlich zu prüfen |
| Vertragsgrundlage | **im Repository als vorhanden angegeben** (`rechtliches/PLATZHALTER.md:34`). Das Dokument ist nicht im Repository. Aktuelle Fassungen online: siehe [IONOS-PRUEFUNG.md](IONOS-PRUEFUNG.md) |
| Speicher-/Verarbeitungsorte | laut Repository Rechenzentrum in **Spanien** (`rechtliches/auftragsverarbeitung.md:122-123`). Der tatsächliche Standort ist im IONOS-Kundenbereich zu prüfen |
| Unterauftragsverarbeiter | für den VPS laut Repository: Arsys Internet S.L.U. (IONOS-Anhang 2, V. 4.5, Nr. 24). Für Server-Software führt Anhang 2 außerdem Plesk/Virtuozzo (Schweiz) auf, Virtuozzo nur bei Servern vor 07/2016. Ob das hier zutrifft, ist zu prüfen |
| Drittlandübermittlung | laut AVV § 4.3 Verarbeitung in der EU/im EWR. Die Schweiz hat einen Angemessenheitsbeschluss. Für den VPS ist laut Repository keine Übermittlung bekannt. Zu prüfen |
| Lösch-/Aufbewahrungsfristen | Anwendungsfristen in `server/lib/aufbewahrung.mjs`, `datenschutzlauf.mjs`, `aufraeumen.mjs`. Die Löschung bei IONOS nach Vertragsende regelt der IONOS-AVV. **zu prüfen** |
| Sicherheitsmaßnahmen | auf Anwendungsseite: gehärteter Container, kein Port nach außen, TLS über Caddy, kein Caddy-Zugriffsprotokoll (`deploy/caddy/Caddyfile.vorlage:78-82`). Ruhende Daten sind von der Anwendung **nicht** verschlüsselt (`rechtliches/datenschutz.md:132-133`). IONOS: ISO-27001-Angabe auf der Produktseite, TOM-Dokument v1.0 (siehe IONOS-Prüfung) |
| Restrisiken | Daten ruhen unverschlüsselt auf der Plattform eines Dritten. Pfeffer und Sicherungspasswort liegen auf demselben VPS (`docs/BETRIEB-SICHERUNG.md:378`). Der Standort weicht ggf. von der Angabe ab |
| Betreiberhandlung | AVV und Anhang 2 in der gültigen Fassung als PDF mit Datum ablegen. Standort im Cloud Panel belegen. Zusatzprodukte (Backup, Mail, Speicher) gegen Anhang 1 prüfen |

### 2.2 Resend, Inc. – E-Mail-Versand (heutiger Code)

| Feld | Inhalt |
|---|---|
| Name | Resend, Inc. (USA laut `rechtliches/auftragsverarbeitung.md:383`) |
| Leistung | Versand von Mitteilungen, Einladungen, Adressbestätigung und Passwort-Zurücksetzen über `https://api.resend.com/emails` (`server/lib/post.mjs:39`) |
| Integrationsstatus | **Code vorhanden, nicht aktiviert.** Ohne `RESEND_API_KEY` läuft ein Trockenlauf (`post.mjs:34-37`). WP-30 steht auf BLOCKED (`work-packages.json:955-981`) |
| Datenkategorien | Empfängeradresse, Betreff (Titel der Mitteilung + Betriebsname), Text mit Vorname, Mitteilungstext und Link (`server/lib/versand.mjs:106-114`) |
| Personenbezug | ja. Der Text kann z. B. „Krank am … aufgehoben“ enthalten (`src/App.jsx:23352`), bei einem Notruf die Art „Medizinischer Notfall“, Namen und Notiz (`server/lib/mitteilungen.mjs:175-185`). Mögliche Art.-9-Daten: **rechtlich zu prüfen** |
| Rolle | Unterauftragsverarbeiter (bei Aktivierung). Rechtlich zu prüfen |
| AV-Vertrag nötig? | ja, bei Aktivierung |
| Vertragsgrundlage | **nicht belegt** (`[BEISPIEL-AVV-RESEND]` offen, `rechtliches/PLATZHALTER.md:35`) |
| Speicher-/Verarbeitungsorte | USA laut Repository. Ein Kommentar sagt „Server in der EU wählbar“ (`zustellung.mjs:12-13`). Zu prüfen |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | ja (USA). Grundlage nach Art. 44 ff. DSGVO **nicht belegt** |
| Lösch-/Aufbewahrungsfristen | zu prüfen (Anbieterseite) |
| Sicherheitsmaßnahmen | API-Schlüssel nur in der Umgebung; der CI-Musterscan sucht nach Schlüsseln (`werkzeug/vorpruefung.mjs:69`). Inhalte gehen im Klartext an den Anbieter (keine Ende-zu-Ende-Verschlüsselung) |
| Restrisiken | Drittland. Inhalte lesbar beim Anbieter. Sensible Mitteilungstexte |
| Betreiberhandlung | Entscheiden: Resend **oder** IONOS-SMTP (DL-P1). Bei Resend: AVV und Drittlandgrundlage beschaffen, Rechtstexte nachführen |

### 2.3 IONOS E-Mail (SMTP) – geplant

| Feld | Inhalt |
|---|---|
| Name | IONOS SE. Für Mail Basic/Business führt IONOS-Anhang 2 die 1&1 Mail & Media GmbH (Montabaur) als Subunternehmer auf. Ob das für das gebuchte Produkt gilt, ist zu prüfen |
| Leistung | Versand über `smtp.ionos.de` (Port 465 TLS bzw. 587 STARTTLS), siehe IONOS-Prüfung |
| Integrationsstatus | **geplant** (Betreiberangabe). Im Code nicht vorhanden |
| Datenkategorien | wie 2.2 |
| Personenbezug | ja, wie 2.2 |
| Rolle | Unterauftragsverarbeiter. Rechtlich zu prüfen |
| AV-Vertrag nötig? | ja. Ob der bestehende IONOS-AVV das Mail-Produkt abdeckt, ist **zu prüfen** (Anhang 1) |
| Vertragsgrundlage | nicht belegt für das Mail-Produkt |
| Speicher-/Verarbeitungsorte | laut Anhang 2 Deutschland/EU (Subunternehmer). Zu prüfen |
| Unterauftragsverarbeiter | 1&1 Mail & Media GmbH. Open-Xchange GmbH (Webmailer) nur bei Nutzung des Webmailers |
| Drittlandübermittlung | laut Anhang 2 nicht für diese Einträge. Zu prüfen |
| Lösch-/Aufbewahrungsfristen | Kopie im Postfach „Gesendet“ je nach Konfiguration. **zu prüfen** (für Systemmails abschalten oder Frist festlegen) |
| Sicherheitsmaßnahmen | SMTP mit TLS und Authentifizierung. SPF/DKIM/DMARC für die Absenderdomain nötig. Inhalte beim Anbieter lesbar |
| Restrisiken | Versandgrenzen (bis 500 Mails/Stunde je Postfach laut Hilfe-Seite). Postfachpasswort als Anwendungsgeheimnis. Gesendet-Kopien |
| Betreiberhandlung | Postfach nur für den Systemversand anlegen. Abdeckung durch den AVV prüfen. DNS-Einträge. Freigabe für DL-P1 |

### 2.4 Google – Firebase Cloud Messaging (Web-Push-Dienst)

| Feld | Inhalt |
|---|---|
| Name | Google (FCM, Endpunkt-Ursprung `fcm.googleapis.com`) |
| Leistung | stellt Web-Push-Nachrichten an Chrome und Chromium-Browser zu. Firefox auf Android leitet ebenfalls über FCM (Mozilla-Hilfe, nur Snippet, Sicherheit niedrig) |
| Integrationsstatus | Code vorhanden (`server/lib/webpush.mjs`). Produktion: **zu prüfen** (siehe Abschnitt 0) |
| Datenkategorien | Endpunkt-URL (Geräte-/Abo-Kennung), **verschlüsselter** Inhalt (Länge sichtbar), TTL, VAPID-Token mit Kontaktadresse des Betreibers (`VAPID_KONTAKT`), IP-Adresse des Servers, Zeitpunkte |
| Personenbezug | ja: Die Endpunkt-Kennung ist einem Gerät bzw. einer Person zugeordnet. Klartext sieht der Dienst nicht (RFC 8291) |
| Rolle | **rechtlich zu prüfen.** Der Dienst wird vom Browser der Person gewählt, nicht von CENTRIC. Ein Vertrag mit CENTRIC besteht nicht. Eigene Verantwortlichkeit des Browserherstellers ist denkbar |
| AV-Vertrag nötig? | **rechtlich zu prüfen** |
| Vertragsgrundlage | nicht belegt (es gibt keinen Vertrag; Nutzung über den Browser) |
| Speicher-/Verarbeitungsorte | zu prüfen (nicht amtlich gefunden) |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | wahrscheinlich (USA). **zu prüfen** |
| Lösch-/Aufbewahrungsfristen | bis zur Zustellung oder zum Ablauf der TTL. CENTRIC setzt keine TTL, also gilt die Vorgabe der Bibliothek von 4 Wochen (`web-push` 3.6.7, `src/web-push-lib.js:12-13`) |
| Sicherheitsmaßnahmen | Ende-zu-Ende-Verschlüsselung aes128gcm (Bibliotheksvorgabe), VAPID-Signatur |
| Restrisiken | Metadaten (wer, wann, wie groß). Lange TTL. Anzeige auf dem Sperrbildschirm |
| Betreiberhandlung | DL-P2 freigeben (neutrale Texte, kurze TTL). Datenschutzhinweis auf „Push-Dienst des Browserherstellers“ prüfen lassen |

### 2.5 Mozilla – autopush

| Feld | Inhalt |
|---|---|
| Name | Mozilla (autopush, Endpunkt `updates.push.services.mozilla.com`) |
| Leistung | Web Push für Firefox |
| Integrationsstatus | wie 2.4 |
| Datenkategorien | wie 2.4. autopush speichert laut Architektur-Doku je Nachricht UAID, Kanal, Nachrichten-ID, verschlüsselten Inhalt, Kopfzeilen, TTL und Zeitstempel |
| Personenbezug | ja (Kennung), Inhalt verschlüsselt |
| Rolle | rechtlich zu prüfen (wie 2.4) |
| AV-Vertrag nötig? | rechtlich zu prüfen |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | zu prüfen |
| Unterauftragsverarbeiter | auf Android FCM (siehe 2.4), Sicherheit niedrig |
| Drittlandübermittlung | zu prüfen |
| Lösch-/Aufbewahrungsfristen | TTL höchstens 30 Tage (autopush-Doku). IP-Speicherung 90 Tage nur laut Snippet, **unbestätigt** |
| Sicherheitsmaßnahmen | RFC 8291, VAPID mit `sub` (Pflicht, wenn VAPID gesendet wird) |
| Restrisiken | wie 2.4 |
| Betreiberhandlung | wie 2.4 |

### 2.6 Apple – Web Push über Apple Push Notification service

| Feld | Inhalt |
|---|---|
| Name | Apple (Endpunkte unter `*.push.apple.com`) |
| Leistung | Web Push für Safari (macOS 13+) und Web-Apps auf dem iOS/iPadOS-Startbildschirm ab 16.4 |
| Integrationsstatus | wie 2.4 |
| Datenkategorien | wie 2.4 |
| Personenbezug | ja (Kennung), Inhalt verschlüsselt |
| Rolle | rechtlich zu prüfen |
| AV-Vertrag nötig? | rechtlich zu prüfen |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | zu prüfen |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | zu prüfen |
| Lösch-/Aufbewahrungsfristen | Speicherung bis 30 Tage oder kürzer, begrenzte Anzahl bei Geräten ohne Verbindung (Apple-Doku) |
| Sicherheitsmaßnahmen | RFC 8291. VAPID-JWT (`sub` als URL oder `mailto:`). Unsichtbare Push-Nachrichten sind verboten (`userVisibleOnly: true` ist gesetzt, `src/speicher.js:618`) |
| Restrisiken | wie 2.4 |
| Betreiberhandlung | wie 2.4 |

### 2.7 Microsoft – Push-Dienst für Edge

| Feld | Inhalt |
|---|---|
| Name | Microsoft. Endpunkt nach Community-Berichten `*.notify.windows.com` (WNS), **amtlich nicht belegt** |
| Leistung | Web Push für Edge |
| Integrationsstatus | wie 2.4 |
| Datenkategorien | wie 2.4 |
| Personenbezug | ja (Kennung) |
| Rolle | rechtlich zu prüfen |
| AV-Vertrag nötig? | rechtlich zu prüfen |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | zu prüfen |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | zu prüfen |
| Lösch-/Aufbewahrungsfristen | zu prüfen |
| Sicherheitsmaßnahmen | RFC 8291, VAPID |
| Restrisiken | wie 2.4 |
| Betreiberhandlung | Endpunkte aus echten Anmeldungen zählen (nur den Ursprung, keine Kennungen), um zu sehen, welche Dienste tatsächlich vorkommen |

### 2.8 Anthropic – Claude API (Intelligence)

| Feld | Inhalt |
|---|---|
| Name | Anthropic (Vertragspartner laut Commercial Terms, siehe [ANTHROPIC-PRUEFUNG.md](ANTHROPIC-PRUEFUNG.md)) |
| Leistung | Sprachmodelle Haiku/Sonnet/Opus für F1–F18 (`docs/intelligence/CENTRIC-INTELLIGENCE.md:111-117`) |
| Integrationsstatus | **geplant**. Kein Aufruf im Code. Anschluss frühestens mit Paket I18 (`INTELLIGENCE-ENTWICKLUNGSPLAN.md:89`) |
| Datenkategorien | Faktenpaket: Dienstarten, Zeiten, Alias-Kennungen von Personen, Befunde, Kennzahlen. Bei F5/F6/F7A/F9/F16 gekapselter Freitext der Nutzerin (`positivliste.mjs` im Branch WP-I11). Einzelheiten: [KI-DATENFLUSS.md](KI-DATENFLUSS.md) |
| Personenbezug | **pseudonymisiert** (HMAC-Alias). Für CENTRIC bleibt der Bezug herstellbar. Freitext kann Personenbezug enthalten. Rechtlich zu prüfen |
| Rolle | laut Anthropic-DPA: Kunde = Verantwortlicher, Anthropic = Auftragsverarbeiter. Im CENTRIC-Gefüge also Unterauftragsverarbeiter. Rechtlich zu prüfen |
| AV-Vertrag nötig? | ja. Laut Anthropic ist der DPA automatisch Teil der Commercial Terms |
| Vertragsgrundlage | **nicht belegt** (kein Konto und keine Annahme im Repository dokumentiert) |
| Speicher-/Verarbeitungsorte | direkte API: Speicherort der Workspaces derzeit nur „us“. Inferenz „global“ oder „us“. **Keine EU-Option** in der Doku gefunden |
| Unterauftragsverarbeiter | Liste im Trust Center (Seite war nicht lesbar) → Betreiberhandlung |
| Drittlandübermittlung | ja (USA). Grundlage laut DPA: SCC Modul 2/3. Rechtlich zu prüfen |
| Lösch-/Aufbewahrungsfristen | Vorgabe 30 Tage für API-Ein- und -Ausgaben. Mit ZDR keine Speicherung (Ausnahmen bei Richtlinienverstoß bis 2 Jahre). Einzelheiten und Widerspruch in den Quellen: ANTHROPIC-PRUEFUNG |
| Sicherheitsmaßnahmen | auf CENTRIC-Seite: Positivliste, Alias, Leck-Prüfung (fail closed), Kapselung. Anthropic: ISO 27001, ISO 42001, SOC 2 (Help Center) |
| Restrisiken | Drittland. Ohne ZDR 30 Tage Speicherung. Freitext. Rückschlüsse aus Abwesenheiten und Befunden |
| Betreiberhandlung | Anbieterentscheidung E-10 (direkt oder Bedrock/Vertex EU). DPA/SCC ablegen. ZDR beantragen. Subprozessorenliste sichern. Siehe ANTHROPIC-PRUEFUNG Abschnitt 8 |

### 2.9 Anthropic – Claude Code / claude.ai (Entwicklungswerkzeug)

| Feld | Inhalt |
|---|---|
| Name | Anthropic (Kontoart des Betreibers **zu prüfen**: Verbraucherkonto Pro/Max oder kommerzielles Konto/API-Schlüssel) |
| Leistung | KI-gestützte Entwicklung (Code, Doku, Reviews). Belegt durch Co-Author-Zeilen in 554 Commits |
| Integrationsstatus | **im Einsatz** (Entwicklung). Nicht Teil des Produkts |
| Datenkategorien | Quelltext, Doku, Werkzeugausgaben, ggf. Inhalte von Staging-/Produktionsberichten, die in Sitzungen gelesen werden |
| Personenbezug | nach Repository-Regeln keine echten Personendaten (öffentliches Repository, Prüfungen mit Kunstdaten). **Zu prüfen:** Gelangen Produktions-, Support- oder Kundendaten in Sitzungen? |
| Rolle | für Betreiberdaten (Code, eigene Notizen) ist der Betreiber Verantwortlicher. Für Kundendaten wäre es eine Unterauftragsverarbeitung **ohne Grundlage**, also unzulässig, solange nicht geregelt |
| AV-Vertrag nötig? | nur, wenn Kundendaten verarbeitet werden. Dann nur mit kommerziellen Bedingungen |
| Vertragsgrundlage | zu prüfen (Kontoart) |
| Speicher-/Verarbeitungsorte | USA/global (wie 2.8). Rechtlich zu prüfen |
| Unterauftragsverarbeiter | wie 2.8 |
| Drittlandübermittlung | ja |
| Lösch-/Aufbewahrungsfristen | Verbraucherkonten: gelöschte Chats nach 30 Tagen; bei erlaubtem Training bis 5 Jahre. Kommerziell: siehe 2.8 |
| Sicherheitsmaßnahmen | Repository ohne Geheimnisse und Personendaten (Musterscan `werkzeug/vorpruefung.mjs`). Agentenregeln „keine Secrets, kein VPS“ (`werkzeug/acc45-backlog.mjs:226`) |
| Restrisiken | Daten aus Produktion oder Support in Sitzungen. Training bei einem Verbraucherkonto mit eingeschalteter Einstellung |
| Betreiberhandlung | Kontoart und Trainingseinstellung prüfen. Regel festlegen: keine Kundendaten in Sitzungen |

### 2.10 Alarm-/Uptime-Dienst

| Feld | Inhalt |
|---|---|
| Name | **nicht festgelegt.** Empfehlung im Repository: Healthchecks.io EU „oder vergleichbar“ (`docs/BETRIEB-SICHERUNG.md:9`). Webhook `CENTRIC_ALARM_WEBHOOK` (`.env.example:75`) |
| Leistung | Totmannschalter für die Sicherung, Alarm-Webhook aus `/gesund`, externer Abruf von `/gesund` |
| Integrationsstatus | **nicht eingerichtet** (`docs/BETRIEB-SICHERUNG.md:11`; `work-packages.json:278`) |
| Datenkategorien | Prüfungsnamen, Stufe, Zeit (`docs/BETRIEB-UEBERWACHUNG.md:105-108`: „keine personenbezogenen Daten“). IP-Adresse des VPS |
| Personenbezug | laut Repository nein (Kontaktdaten des Betreibers beim Dienst ausgenommen) |
| Rolle | voraussichtlich kein AV-Verhältnis zu Kundendaten. Rechtlich zu prüfen |
| AV-Vertrag nötig? | voraussichtlich nein. Zu prüfen |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | zu prüfen (Auswahl EU empfohlen) |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | zu prüfen |
| Lösch-/Aufbewahrungsfristen | zu prüfen |
| Sicherheitsmaßnahmen | nur `https://`-Webhooks (`server/lib/gesund.mjs:381-382`) |
| Restrisiken | gering |
| Betreiberhandlung | Dienst wählen und hier eintragen |

### 2.11 Speicherziel der Sicherung außer Haus

| Feld | Inhalt |
|---|---|
| Name | **nicht festgelegt.** Empfehlung: Hetzner Storage Box (sftp) oder S3-kompatibel in der EU (`docs/BETRIEB-SICHERUNG.md:7`). Laut Betreiber IONOS-Cloud-Speicher, **im Repository nicht belegt** |
| Leistung | restic-Repository (täglich, 7/4/12 Aufbewahrung, `deploy/sicherung/README.md:5`) |
| Integrationsstatus | **nicht eingerichtet** laut `docs/BETRIEB-SICHERUNG.md:11` (Stand 2026-11-02) |
| Datenkategorien | vollständige Sicherungen des Bestands |
| Personenbezug | ja. Die Daten sind clientseitig von restic verschlüsselt. Für den Anbieter sind sie ohne Passwort nicht lesbar |
| Rolle | Unterauftragsverarbeiter. Ob verschlüsselte Daten für den Anbieter personenbezogen sind: **rechtlich zu prüfen** |
| AV-Vertrag nötig? | vorsorglich ja. Rechtlich zu prüfen |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | abhängig von der Wahl. EU vorgesehen |
| Unterauftragsverarbeiter | abhängig von der Wahl |
| Drittlandübermittlung | soll keine stattfinden |
| Lösch-/Aufbewahrungsfristen | `forget 7/4/12` (7 täglich, 4 wöchentlich, 12 monatlich) |
| Sicherheitsmaßnahmen | restic-Verschlüsselung, Passwortdatei Modus 600, Prüfung je Lauf |
| Restrisiken | Löschschutz offen (`docs/BETRIEB-SICHERUNG.md:371`). Sicherungen überdauern Löschfristen der Anwendung |
| Betreiberhandlung | Ziel entscheiden und hier eintragen. Falls IONOS: Produkt (IONOS Cloud S3?) und Vertragsabdeckung prüfen, siehe IONOS-PRUEFUNG |

### 2.12 Redis-REST-Dienst (optional)

| Feld | Inhalt |
|---|---|
| Name | z. B. Upstash (`server/lib/schutz.mjs:140-144`) |
| Leistung | atomare Zähler für die Bremse |
| Integrationsstatus | optional. Ohne `REDIS_REST_URL` keine Nutzung (`schutz.mjs:151-153`). Produktion **zu prüfen** |
| Datenkategorien | Zählerschlüssel aus gehashten Kennungen (`schutz.mjs:382-401`) |
| Personenbezug | pseudonym (Hashwerte von Herkunft oder Sitzung). Rechtlich zu prüfen |
| Rolle | zu prüfen |
| AV-Vertrag nötig? | zu prüfen |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | zu prüfen |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | zu prüfen |
| Lösch-/Aufbewahrungsfristen | Ablauf je Zählfenster (TTL) |
| Sicherheitsmaßnahmen | Token in der Umgebung |
| Restrisiken | gering |
| Betreiberhandlung | bestätigen, dass in Produktion **nicht** gesetzt. Sonst nachtragen |

### 2.13 GitHub – Repository, Actions, Container-Registry

| Feld | Inhalt |
|---|---|
| Name | GitHub (Microsoft) |
| Leistung | Quelltext (öffentlich), CI-Prüfungen, Container-Bild in GHCR (`deploy/compose.yml:27`) |
| Integrationsstatus | **im Einsatz** |
| Datenkategorien | Code, Kunstdaten in Prüfungen, Konto- und Commit-Daten der Entwickler |
| Personenbezug | Entwicklerdaten ja. Kundendaten laut Repository nein (Regel: öffentliches Repository, `pruefungen/doku.test.js`) |
| Rolle | für Kundendaten keine. Für Entwicklerdaten eigene Verantwortlichkeit von GitHub. Rechtlich zu prüfen |
| AV-Vertrag nötig? | nein, solange keine Kundendaten. Zu prüfen |
| Vertragsgrundlage | GitHub-Nutzungsbedingungen (nicht im Repository) |
| Speicher-/Verarbeitungsorte | USA/global |
| Unterauftragsverarbeiter | – |
| Drittlandübermittlung | Entwicklerdaten ja |
| Lösch-/Aufbewahrungsfristen | Artefakte nach GitHub-Einstellungen |
| Sicherheitsmaßnahmen | Geheimnisscan (`.github/workflows/sicherheit.yml:70`), Branchschutz (`docs/BRANCH-SCHUTZ.md`) |
| Restrisiken | Produktionsdaten in Issues oder Logs |
| Betreiberhandlung | keine Kundendaten in Issues, PRs oder Actions-Logs |

### 2.14 AWS Bedrock / Google Vertex AI – EU-Option für Intelligence

| Feld | Inhalt |
|---|---|
| Name | Amazon Web Services (Bedrock) bzw. Google Cloud (Vertex AI) |
| Leistung | Claude-Modelle über die Cloud-Plattform. In der Spezifikation „EU-Hosting über AWS Bedrock Frankfurt“ (`CENTRIC-INTELLIGENCE.md:846`), Entscheidung offen (E-10, `:350`) |
| Integrationsstatus | **nicht entschieden**, kein Code |
| Datenkategorien | wie 2.8 |
| Personenbezug | wie 2.8 |
| Rolle | laut Anthropic-Doku ist dort der Cloud-Anbieter der Auftragsverarbeiter. Rechtlich zu prüfen |
| AV-Vertrag nötig? | ja (mit dem Cloud-Anbieter) |
| Vertragsgrundlage | nicht belegt |
| Speicher-/Verarbeitungsorte | EU-Profile bzw. EU-Endpunkte laut Anthropic-Doku. Modellverfügbarkeit je Region **zu prüfen**. EU-Profile können mehrere EU-Regionen umfassen |
| Unterauftragsverarbeiter | zu prüfen |
| Drittlandübermittlung | Konzernstruktur (US-Mutter) **rechtlich zu prüfen** |
| Lösch-/Aufbewahrungsfristen | zu prüfen |
| Sicherheitsmaßnahmen | zu prüfen |
| Restrisiken | Modellverfügbarkeit (neue Modelle evtl. nicht in EU-Regionen). Zwei Verträge |
| Betreiberhandlung | Entscheidung E-10 |

## 3. Top-Betreiberhandlungen (Reihenfolge nach Dringlichkeit)

1. **Mailweg entscheiden** (Resend oder IONOS-SMTP) und WP-30 entsperren. Vorher müssen Rechtstexte und Anlage 2 den gewählten Weg nennen.
2. **Web Push vor der Aktivierung minimieren** (DL-P2): neutrale Texte, kurze TTL. Notruf- und Krank-Texte dürfen nicht im Klartext auf dem Sperrbildschirm oder in einer Mail stehen.
3. **IONOS-Unterlagen ablegen:** AVV (aktuelle Fassung), Anhang 1 und 2, TOM, Standortbeleg aus dem Cloud Panel.
4. **Sicherungsziel festlegen** und eintragen. Die Angabe „IONOS-Cloud-Speicher“ belegen.
5. **Anthropic:** Kontoart für Claude Code prüfen. Für die Produkt-API Anbieterentscheidung E-10, DPA/SCC ablegen, ZDR beantragen, Subprozessorenliste sichern. „Im Einsatz“ gilt bis dahin nur für die Entwicklung.
6. **Rechtstexte** (`rechtliches/`) nach jeder Aktivierung am selben Tag nachführen und anwaltlich prüfen lassen.

Paketvorschläge mit Schätzung: [IONOS-PRUEFUNG.md, Abschnitt 6](IONOS-PRUEFUNG.md#6-paketvorschläge-schätzungen).
