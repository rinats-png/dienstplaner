# IONOS-Prüfung: genutzte Leistungen, AV-Abdeckung, Quellen

**Stand:** 2026-11-03 · **Art:** Analyse, **rechtlich ungeprüft**. Hier wird kein Vertrag geschlossen und keiner behauptet. Was nur im IONOS-Kundenkonto zu sehen ist, steht als **Betreiberhandlung** da.

> **Abrufdatum aller Quellen: 2026-11-03.** Vorgegeben war 2026-11-04. Abgerufen wurde tatsächlich am 03.11., deshalb steht dieses Datum hier. Abgerufen wurde automatisiert; PDF-Inhalte waren nicht immer vollständig lesbar, das ist je Quelle vermerkt.

## 1. Was Repository und Betrieb bei IONOS nutzen

| Leistung | Beleg im Repository | Status |
|---|---|---|
| **VPS (vServer)**: Anwendung, Serverfunktionen, gesamte Ablage `/data`, Caddy | `docs/IST-STAND.md:3`, `:80`; `deploy/compose.yml:2-7`, `:47-48`; `rechtliches/auftragsverarbeitung.md:117-129`, Anlage 2 `:356-377` | **genutzt** |
| **Lokale Sicherungen** auf dem VPS (Werkzeug `ablage-sicherung`) | `BEREITSTELLUNG.md` 5.4; `docs/BETRIEB-SICHERUNG.md` | **genutzt.** Liegt auf demselben VPS, also kein eigenes IONOS-Produkt |
| **IONOS Cloud Backup / Snapshots** | kein Beleg | **nicht belegt.** Zu prüfen, ob im Vertrag gebucht |
| **Sicherung außer Haus** (restic) | Ziel offen; Empfehlung Hetzner Storage Box oder S3 in der EU (`docs/BETRIEB-SICHERUNG.md:6-11`) | **nicht eingerichtet** (Stand 2026-11-02). Laut Betreiber „Cloud-Speicher bei IONOS“, im Repository **nicht belegt** |
| **Datenbank** | keine: Dateiablage `server/lib/ablage.mjs:1-12`; `README.md:22` | **nicht genutzt** (Abweichung zur Betreiberangabe) |
| **E-Mail-Versand der Anwendung** | Resend (`server/lib/post.mjs:31-43`). Ohne Schlüssel Trockenlauf | **nicht über IONOS** (Abweichung zur Betreiberangabe) |
| **E-Mail-Postfach des Betreibers** (z. B. Kontaktadresse, auch als `VAPID_KONTAKT`, `.env.example:112`) | nur die Adresse ist belegt, der Anbieter des Postfachs nicht | **zu prüfen.** Betrifft die Korrespondenz des Betreibers, nicht die Kundendaten der Anwendung |
| **Domain/DNS** | Anwendungsdomain in `BEREITSTELLUNG.md`; Registrar/DNS-Anbieter nicht belegt | **zu prüfen** (für SPF/DKIM bei DL-P1 nötig) |

## 2. Was ein AV-Vertrag mit IONOS abdecken müsste

Ein AV-Vertrag mit IONOS müsste mindestens die folgenden Leistungen abdecken. Das ist eine Einschätzung, **rechtlich zu prüfen**.

1. **VPS** mit Speicherung des gesamten Bestands. Darin stecken Beschäftigtendaten, möglicherweise auch Gesundheitsangaben (Abwesenheitsart „Krank“) und Ergebnisse von Standortprüfungen.
2. **Alle gebuchten Zusatzprodukte, die Kopien des Bestands halten:** Cloud Backup, Snapshots, Images und gegebenenfalls Objektspeicher für restic.
3. **E-Mail-Postfach und SMTP**, sobald die Anwendung darüber versendet (DL-P1). Dann gehen Mitteilungstexte mit Namen und gegebenenfalls Abwesenheitsangaben über IONOS-Mailserver. Dazu kommt eine mögliche Ablage im Ordner „Gesendet“.
4. **Support-Zugriffe** von IONOS und Arsys auf die VPS-Plattform.

Was für CENTRIC gegenüber Kunden folgt: Jedes dieser Produkte gehört in Anlage 2 des CENTRIC-AVV (`rechtliches/auftragsverarbeitung.md:356 ff.`). Nach § 6 Abs. 2 dort ist jede Änderung den Kunden mitzuteilen.

## 3. Checkliste gegen offizielle IONOS-Unterlagen

Sicherheit der Angabe: **hoch** = auf der offiziellen Seite oder im PDF selbst gelesen. **mittel** = offizielle Quelle, aber nur teilweise gelesen. **niedrig** = nur Suchauszug.

| # | Prüfpunkt | Quelle (Abruf 2026-11-03) | Versionsstand | Befund (paraphrasiert) | Sicherheit | Offen / Betreiberhandlung |
|---|---|---|---|---|---|---|
| 1 | Wie kommt der AVV zustande? | Hilfe „Vereinbarung zur Auftragsverarbeitung (AVV) mit IONOS abschließen“ – https://www.ionos.de/hilfe/index.php?id=3212 | ohne Stand | Seit 19.07.2022 ist der AVV Teil der IONOS-AGB. Ältere Verträge schließen ihn online im Konto ab (Mein Konto → Datenschutz & Privatsphäre → AVV) | hoch | **Betreiberhandlung:** Vertragsbeginn prüfen. Bei einem Vertrag vor 07/2022: Abschluss im Konto belegen |
| 2 | AVV-Text | „AVV – Vereinbarung zur Auftragsverarbeitung“ – https://www.ionos.de/terms-gtc/avv/ | **Version 1.4, Stand 10/2026** | Gilt für alle Leistungen, bei denen IONOS im Auftrag verarbeitet (§ 1.1). Verarbeitung in EU/EWR, Drittland nur nach Art. 44 ff. (§ 4.3). Allgemeine Genehmigung für Subunternehmer, Widerspruch binnen 14 Tagen nur aus wichtigem Grund (§ 10). TOM nur zur Information (§ 8.2) | hoch (Version), mittel (Details) | Das Repository nennt keine AVV-Hauptversion. **Fassung 1.4 als PDF mit Datum ablegen.** Prüfen, ob sich gegenüber der Fassung bei Vertragsschluss etwas geändert hat |
| 3 | Anhang 1 (Leistungsbeschreibungen) | https://www.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/DE/AVV/Anhang_1_Leistungsbeschreibungen_AVV_IONOS_v.3.0.pdf | v3.0 (Dateiname) | PDF nicht lesbar extrahiert. **Ob VPS, Mail Basic/Business und Cloud Backup ausdrücklich genannt sind, ist unbelegt.** Das Repository nennt „Anhang 1 Server Produkte“ (`rechtliches/PLATZHALTER.md:34`) | – | **Betreiberhandlung:** PDF öffnen, Produkte abhaken (VPS, Mail, Backup, ggf. S3) |
| 4 | Anhang 2 (Subunternehmer) | https://www.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/DE/AVV/AVV_Liste_Subunternehmen_v4_5_DE.pdf | **Version 4.5, Stand 04/2026** (wie im Repository) | Relevante Einträge: Nr. 24 Arsys Internet S.L.U. (Spanien; Betrieb vServer, Cloud Server, Dedicated; Cloud-Backup-Integration). Nr. 25 Acronis Germany GmbH (Cloud Backup). Nr. 13 1&1 Mail & Media GmbH (Mail Basic/Business). Nr. 14 Open-Xchange GmbH (Webmailer). Nr. 21/22 Plesk und Virtuozzo (Schweiz, Angemessenheitsbeschluss; Virtuozzo nur für Server vor 07/2016). Nr. 3/4 Cloudflare und SiteLock (USA, SCC) nur für Hosting-Produkte | hoch | Das Repository führt nur Arsys. **Bei Mail- oder Backup-Nutzung Anlage 2 des CENTRIC-AVV ergänzen.** Prüfen, ob Plesk oder Virtuozzo auf dem VPS zutreffen |
| 5 | TOM | https://www.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/DE/AVV/DE_AVV_TOM_v1.0.pdf | v1.0 (Dateiname) | Inhalt nicht geöffnet | mittel | **Betreiberhandlung:** ablegen. Anlage 1 des CENTRIC-AVV verweist darauf (`rechtliches/auftragsverarbeitung.md:232-235`) |
| 6 | Standort des VPS | Produktseite VPS – https://www.ionos.de/server/vps | ohne Stand | Rechenzentrumsstandort wählbar: „EU, USA und Großbritannien“. Deutschland ist auf der Seite nicht als eigene Option genannt | mittel | Das Repository sagt **Spanien** (`rechtliches/auftragsverarbeitung.md:122-123`). **Betreiberhandlung:** im Cloud Panel (Server → Rechenzentrum) belegen und Bildschirmfoto ablegen. Nur im Konto sichtbar |
| 7 | Zertifizierung | dieselbe Produktseite; IONOS Group, C5-Meldung vom 2023-11-07 – https://www.ionos-group.com/investor-relations/publications/announcements/ionos-receives-c5-certification-for-compute-engine-cloud-cubes-and-s3-object-storage.html | 2023-11-07 | ISO 27001 laut Produktseite. **BSI C5 (Typ 1) nur für IONOS Cloud** (Compute Engine, Cloud Cubes, S3 Object Storage), **nicht für den VPS** | mittel / hoch | Kundenaussagen nicht auf C5 für den VPS stützen. ISO-Zertifikat (Geltungsbereich) anfordern |
| 8 | SMTP-Serverdaten | „IONOS Mail: Serverdaten für IMAP, POP3 und SMTP“ – https://www.ionos.de/hilfe/e-mail/allgemeine-themen/serverinformationen-fuer-imap-pop3-und-smtp/ | ohne Stand | `smtp.ionos.de`, Port 465 (SSL/TLS), ersatzweise 587 (STARTTLS). Anmeldung mit vollständiger Adresse und Postfachpasswort | hoch | Grundlage für DL-P1 |
| 9 | Versandgrenzen | „Welche Beschränkungen gibt es beim Versand von Massenmails“ – https://www.ionos.de/hilfe/e-mail/allgemeine-themen/welche-beschraenkungen-gibt-es-beim-versand-von-massenmails/ | ohne Stand | Mail Basic/Business: Mails je Stunde nach Alter des Postfachs: 50 (0–7 Tage), 100 (8–14), 400 (15–30), 500 (> 30). Bei Überschreitung „450 Mail send limit exceeded“ | hoch | DL-P1 braucht Drosselung und Wiederholung. Neues Postfach rechtzeitig anlegen („Einlaufzeit“) |
| 10 | Backup/Snapshots für den VPS | Produktseite VPS; Hilfe „Snapshot erstellen“ – https://www.ionos.de/hilfe/server-cloud-infrastructure/snapshots/snapshot-erstellen/ | ohne Stand | „Backup (optional)“ und Cloud Backup (über Acronis/Arsys) auf der Produktseite. Die Snapshot-Hilfe betrifft Cloud Server (1 Snapshot, 3 Tage). **Ob sie für den VPS gilt, ist unklar** | niedrig | **Betreiberhandlung:** feststellen, ob Images, Snapshots oder Cloud Backup gebucht sind. Wenn ja: Speicherort, Frist und Löschung mit den CENTRIC-Löschfristen abgleichen |
| 11 | IONOS Cloud / S3 Object Storage (falls restic-Ziel) | nicht geprüft | – | IONOS Cloud ist eine eigene Produktlinie. Ob der AVV unter 2 sie abdeckt oder ein eigener Cloud-DPA gilt, ist **ungeprüft** | – | Nur relevant, wenn der Betreiber IONOS-Speicher als Sicherungsziel nutzt |

## 4. Offene Punkte

1. **Standort:** Spanien laut Repository. Die Produktseite nennt Auswahlregionen. Ein Beleg aus dem Konto fehlt.
2. **Vertragsabdeckung je Produkt:** Anhang 1 ist nicht gelesen. Mail und Backup sind nicht abgehakt.
3. **„Cloud-Speicher“** (Betreiberangabe): welches Produkt, welcher Vertrag, welcher Ort.
4. **„Datenbank“** (Betreiberangabe): Die Anwendung hat keine. Falls eine andere IONOS-Datenbank existiert (Website?), betrifft sie die Anwendung nicht und gehört getrennt bewertet.
5. **Server-Software laut Anhang 2** (Plesk, Virtuozzo): Ob einer davon auf dem VPS läuft, ist zu prüfen. Der Betrieb sieht Docker mit Caddy vor.
6. **Rechtstexte:** `BEREITSTELLUNG.md:944-948` sagt, die Rechtstexte beschrieben „noch den früheren Hoster“. Die Texte in `rechtliches/` nennen aber bereits IONOS (`docs/IST-STAND.md:74`). Die Doku ist hier widersprüchlich: `BEREITSTELLUNG.md` nachziehen.
7. **Gesendet-Ordner** bei SMTP-Versand: Frist oder Abschaltung festlegen.

## 5. Technische Folge: Mail-Umstellung auf IONOS-SMTP

Möchte der Betreiber den Mailversand über IONOS statt über Resend, hat das im Repository diese Folgen:

- `server/lib/post.mjs` ist laut Kopfkommentar die **einzige Stelle** mit dem Anbieter (`:10-12`). Ein SMTP-Adapter ersetzt den `fetch` an Resend durch einen SMTP-Versand. Dafür braucht es eine neue Abhängigkeit (z. B. eine SMTP-Bibliothek) oder einen eigenen, schlanken SMTP-Client. Die Lieferkette ist zu prüfen (`docs/acc45/DEPENDENCIES.md`).
- **Neue Umgebungsvariablen** (z. B. `CENTRIC_SMTP_HOST`, `CENTRIC_SMTP_PORT`, `CENTRIC_SMTP_BENUTZER`, `CENTRIC_SMTP_PASSWORT`). Sie müssen in `docs/BETRIEBSHANDBUCH.md` und `.env.example` stehen, sonst schlägt `pruefungen/doku.test.js` an (prüft `CENTRIC_*`, `RESEND_*`, `VAPID_*`).
- `pruefLinkErlaubt()` (`post.mjs:86-89`), der Schlüsselbericht `zustellung.mjs:71` (`mail: !!RESEND_API_KEY`) und der Umgebungsbericht `einrichten.mjs:289-305` hängen an `RESEND_API_KEY`. Sie brauchen ein anbieterneutrales „Versand eingerichtet“.
- **Drosselung:** höchstens 500 Mails je Stunde und Postfach (Abschnitt 3, Nr. 9). `versand.mjs` hat bis zu 3 Versuche und eine Frist von 15 Minuten (`:44-46`). Für den Fehler 450 braucht es eine Rückstellung statt eines verbrauchten Versuchs.
- **DNS:** SPF, DKIM und DMARC für die Absenderdomain (Betreiber).
- **Rechtstexte:** Resend aus Anlage 2, Datenschutzerklärung und Verarbeitungsverzeichnis streichen bzw. als nicht genutzt führen. IONOS-Mail mit dem Subunternehmer (Anhang 2 Nr. 13) aufnehmen.
- **WP-30** („Mail und Push in Produktion“, `work-packages.json:955-981`): Die Akzeptanz nennt „Resend (SPF/DKIM)“ und ist an den gewählten Anbieter anzupassen. Das ist eine Betreiberentscheidung; `work-packages.json` wird hier nicht geändert.

## 6. Paketvorschläge (Schätzungen)

Alle Angaben in Personentagen (PT) sind **Schätzungen ohne Messgrundlage**. Anwaltsprüfung, Anbieterverhandlung und Wartezeiten sind nicht enthalten. Die Pakete sind Vorschläge. Sie sind nicht in `docs/acc45/work-packages.json` eingetragen; das entscheidet die Koordination.

| Paket | Inhalt | Abhängigkeit | Schätzung |
|---|---|---|---|
| **DL-P1 IONOS-SMTP-Adapter** | `post.mjs` mit Anbieterwahl (SMTP oder Resend, Trockenlauf bleibt). Anbieterneutrale Prüfungen (`pruefLinkErlaubt`, Schlüssel- und Umgebungsbericht). Rückstellung bei 450. Neue Variablen in Handbuch und `.env.example`. Tests mit SMTP-Attrappe. Anleitung SPF/DKIM/DMARC | Betreiberentscheidung Mailweg. Postfach angelegt | **2–4 PT** |
| **DL-P2 Push- und Mail-Minimierung** | Neutrale Push-Texte (Titel „CENTRIC“, Text „Neue Mitteilung“, nur `ziel`) als Vorgabe, abschaltbar je Betrieb. Notruf und Abwesenheitsart nie im Klartext in Push oder Mail. TTL je Art (z. B. Notruf 1 h, sonst 24 h) und `Urgency`. Kommentar `zustellung.mjs:18` korrigieren. Tests: Inhalt der Push-Nachricht ohne Namen und Art.-9-Begriffe | – | **1,5–3 PT** |
| **DL-P3 Rechtstexte nach Ist-Zustand** | `rechtliches/` (AVV Anlage 2, Datenschutzerklärung, Verzeichnis) auf tatsächlich aktive Dienste nachführen: Mailweg, Push-Dienste der Browserhersteller, Sicherungsziel. Widerspruch in `BEREITSTELLUNG.md:944-948` auflösen. Danach Anwaltsprüfung (extern) | DL-P1/DL-P2, Betreiberbelege aus Abschnitt 3 | **1–2 PT** (+ extern) |
| **DL-P4 Vertragsverwaltung / Dienstleisterregister** | Betreiberbereich: Register der Dienstleister mit Vertragsstand (Version, Abrufdatum, Ablageort, nicht der Inhalt). Wiedervorlage bei Subunternehmer-Änderungen (IONOS: 14 Tage Widerspruch; Anthropic: 15 Tage). Kundenmitteilung nach § 6 Abs. 2 CENTRIC-AVV als Vorgang. Nur Metadaten, keine Vertragstexte im öffentlichen Repository | – | **3–6 PT** |
| **DL-P5 KI-Gateway-Produktivpfad** | Entspricht I13 (Gateway, Schätzung 14–24 PT, `INTELLIGENCE-ENTWICKLUNGSPLAN.md:79`) plus I18 (Live-Anbindung, 2–4 PT, `:89`). **Zusätzlich vorgeschlagen:** Anbieterprofil mit Pflichtangaben (Region/`inference_geo`, ZDR ja/nein, Vertragsstand), ohne die der Live-Modus nicht startet (fail closed). Kein Prompt- oder Antwortinhalt in Systemlogs (statischer Test) | I11, I13, Entscheidung E-10 | Zusatz zu I13/I18: **2–4 PT** |
| **DL-P6 Mandantenbezogene KI-Freigabe** | Freigabe je Betrieb: Vorgabe aus. Leitung bestätigt Kenntnis von Anlage 2 (Anthropic/Cloud-Anbieter), Betriebsrat-Pause (I16), Widerruf mit sofortiger Wirkung, Protokoll. Ergänzt I16 (8–14 PT, `:82`) um den Vertrags- und Informationsteil | I16, DL-P4 | Zusatz zu I16: **2–4 PT** |
| **DL-P7 Sicherungsziel dokumentieren** | Nach der Entscheidung: Dienstleistereintrag, Löschschutz, Fristabgleich mit den Löschfristen der Anwendung | Betreiberentscheidung | **0,5–1 PT** |

Summe der neuen Anteile (ohne I13/I16/I18 selbst): etwa **12–24 PT**. Das ist eine Schätzung.
