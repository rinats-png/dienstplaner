# Abnahme V4, Strang B: Zeit, Krankmeldung, Ausfall, Abschluss, mobil

**Art des Nachweises: lokale Integrationsabnahme — keine vollständige Staging-Abnahme.** Alle Läufe fanden auf einem
Windows-Entwicklungsrechner gegen eine lokal gestartete, isolierte Instanz statt (127.0.0.1, Port 4102, Wegwerf-Datenordner,
nur synthetische Daten bzw. der erfundene Demo-Bestand). Kein Staging, keine Produktion, kein VPS, kein TLS, kein Proxy, kein
Docker-Bild, keine echten Endgeräte. Was nur dort nachweisbar ist, steht in Abschnitt 5.

Betreiberauftrag 2026-11-13 „Vollständige Staging- und Release-Abnahme“, Strang B = Bereiche 6, 7, 8, 9, 10 und 14.

| | |
|---|---|
| Geprüfter Stand (Beginn) | `integration/release-v4` @ `0638c10185c0171da3cc1d2ae4a2195adf9c42f4` |
| Geprüfter Stand (Ende) | `abc3e7174914f55b5e0538c4ea8d6f1318488ef1` = Zweig nachgezogen auf `integration/release-v4` @ `ca45a0a2` (Abschnitt 6) |
| Arbeitszweig | `feature/abnahme-v4-strang-b` (eigener Worktree, eigenes `npm ci`) |
| Laufzeitumgebung | Windows 11, Node 24.18.0, vitest 4.1.12, Playwright 1.64.1 (Chromium headless), axe-core 4.14.0 |
| Bewertung | **bestanden** / **nicht bestanden** / **nicht ausführbar (Grund)**; ein fehlender Test zählt nie als bestanden |
| Befundklassen | P0 Sicherheit/Datenschutz/Datenverlust · P1 releasekritisch · P2 mit Umgehung · P3 gering |

## 1. Ergebnis in Kürze

- Vorhandene Prüfungen der sechs Bereiche: 43 vitest-Dateien einzeln ausgeführt (`npx vitest run pruefungen/<datei> --testTimeout=120000`),
  Ergebnis je Datei in Abschnitt 3. Drei Dateien waren im ersten Lauf rot bzw. ohne Ergebnis, alle drei aus Gründen der
  Prüfumgebung (Abschnitt 3.7); allein wiederholt sind sie grün.
- Neu: `pruefungen/abnahme-b-wiederholung.test.js` (4 Abläufe über die echten Handler) und `e2e/abnahme-b-ablaeufe.spec.mjs`
  (3 schreibende Browserabläufe einmal je Lauf, 6 lesende Prüfungen an allen acht Viewports).
- Rot-bei-Defekt: dreimal durch lokale Mutation belegt (Abschnitt 4), nichts davon eingecheckt.
- **Kein Produktdefekt der Klassen P0, P1 oder P2 gefunden.** Zwei P3-Befunde (Barrierefreiheit, gleiche Ursache wie die
  bestehenden WP-40-Ausnahmen) und ein P3-Befund im Prüfwerkzeug, siehe Abschnitt 2.

## 2. Befunde

| Nr. | Klasse | Bereich | Befund | Nachweis | Behandlung |
|---|---|---|---|---|---|
| B-1 | P3 | 14 | axe `label-content-name-mismatch` (serious, Regel experimentell, WCAG 2.5.3) im **Lagebild** der Planung: Kontoknopf `.avatarknopf` und die Achtungszeilen `.achtungszeile[role=button]` (aria-label weicht von der sichtbaren Kurzform ab). | `e2e/ergebnisse/axe/abnahme-b-lagebild-planer-<viewport>.json` (CI-Artefakt) | Gleiche Ursache wie die vorhandenen Ausnahmen `plan-planer`/`plan-leitung` (WP-40-Nacharbeit). Als begründete Ausnahme in `e2e/axe-ausnahmen.json` eingetragen, nur diese Regel auf dieser Fläche; jede andere Regel bleibt Gate. |
| B-2 | P3 | 14 | Dieselbe Regel auf **Abrechnungsdaten → Stempelbefunde** (Monatsabschluss), nur der Kontoknopf `.avatarknopf`. | `e2e/ergebnisse/axe/abnahme-b-stempelbefunde-leitung-<viewport>.json` | Wie B-1 (wie `einstellungen-leitung`). |
| B-3 | P3 (Prüfwerkzeug) | 14 | `e2e/hilfen.mjs` schreibt den Meldungsbefund nach `meldung-<Testtitel>-<viewport>.json`. Enthält der Testtitel einen Doppelpunkt, legt Windows/NTFS einen alternativen Datenstrom an; die Datei ist leer, der Befund geht verloren (Linux-CI nicht betroffen). | Erster Lauf mit Titel „B10 Monatsabschluss: …“: Datei `meldung-B10 Monatsabschluss` mit 0 Byte. | Neue Titel ohne Doppelpunkt; bestehende Titel haben keinen. Nicht behoben (anderes Werkzeug, eigener Zweig nötig); Vorschlag: Dateiname über `[^\w.-]` → `_` säubern. |

Kein Befund war ein technischer Fehler innerhalb bestehender Rechte, der einen eigenen Fix-Zweig erfordert hätte.

Beobachtungen ohne Befundklasse (Prüfumgebung, kein Produktfehler belegt):
- Unter hoher Last des Prüfrechners (parallele Läufe anderer Arbeitszweige) dauerte die Bestätigung „Krankmeldung eingegangen“ im Blatt in einem Lauf über 15 s; der Fall war auf dem Server sofort angelegt. Die Prüfung wartet jetzt bis 30 s und nennt die Serverantwort. Auf echter Hardware zu beobachten (Abschnitt 5).
- Erste Fassungen der neuen Browserabläufe waren aus Testgründen rot (Dienst gegen die Ruhezeitregel eingetragen; „Krank melden“ liegt am Telefon unter „Anliegen“, nicht „Mein Plan“; im Demo-Bestand gibt es weitere offene Krankmeldungen, die Schaltfläche wird jetzt über den Personennamen gewählt). Keine dieser Ursachen lag im Produkt.

## 3. Bereiche

Spalten: Test · Befehl · Stand · Ergebnis · Nachweis (Datei/Zeile) · Befunde · Restrisiko. Befehl für vitest stets
`npx vitest run pruefungen/<datei> --testTimeout=120000`, eine Datei je Aufruf. Stand: `0638c101` sofern nicht anders genannt.

### 3.1 Bereich 6 — Dienstpläne auf mobilen Geräten anzeigen

| Test | Ergebnis | Nachweis | Befunde | Restrisiko |
|---|---|---|---|---|
| `geraete-wp21.test.js` | bestanden (20/20) | Gerätematrix, `src/ui/geraete.js` | – | jsdom/Renderprüfung, kein echtes Gerät |
| `geraete-wp21-ablaeufe.test.js` | bestanden (20/20) | Abläufe je Rolle am Telefon | – | wie oben |
| `geraete-wp21-ablaeufe-render.test.js` | bestanden (67/67) | Render der Telefonansichten | – | wie oben |
| `endgeraete-speicher.test.js` | bestanden (6/6) | Speicher auf dem Gerät | – | – |
| NEU e2e `mein-plan-mobil` (8 Viewports) | siehe Abschnitt 3.8 | `e2e/abnahme-b-ablaeufe.spec.mjs` Test „mein-plan-mobil“: kein waagrechtes Scrollen in „Mein Plan“ und „Anliegen“, „Krank melden“ ≥ 24 px | – | Chromium-Emulation, kein Safari/iOS |
| vorhanden e2e `plan-mitarbeiter` … `plan-betriebsrat` (8 Viewports) | siehe Abschnitt 3.8 | `e2e/barrierefreiheit.spec.mjs` | bekannte WP-40/WP-21-Ausnahmen | – |

### 3.2 Bereich 7 — Zeit erfassen, offline puffern, synchronisieren

| Test | Ergebnis | Nachweis | Befunde | Restrisiko |
|---|---|---|---|---|
| `stempeln.test.js` | bestanden (10/10) | | – | |
| `zeiterfassung.test.js` | bestanden (40/40) | | – | |
| `offline-stempeln.test.js` | Lauf 1: 6 rot (eigene Mutation M2 lag zeitgleich im Worktree, Abschnitt 3.7); allein wiederholt: siehe 3.7 | Idempotenz `clientEventId` | – | |
| `stempelpuffer.test.js` | bestanden (22/22) | Warteschlange, Reihenfolge, Wiederholung | – | |
| `wp07b-stempel-500.test.js` | bestanden (9/9) | 500 nach Speichern, zwei Reiter, Neustart | – | |
| `stempel-integritaet.test.js` | Lauf 1: nicht ausführbar (Hook-Zeitgrenze 10 s unter Last); allein wiederholt: siehe 3.7 | | – | |
| `stempel-429-client.test.js` | bestanden (8/8) | | – | |
| `stempel-oberflaeche.test.js` | bestanden (11/11) | | – | |
| `stempel-datenschutz.test.js` | bestanden (21/21) | | – | |
| `nachtdienst-ohne-einstempeln.test.js` | bestanden (15/15) | | – | |
| `serverdatum.test.js` | Lauf 1: nicht ausführbar (Hook-Zeitgrenze 10 s unter Last); allein wiederholt: siehe 3.7 | | – | |
| `pausenerfassung.test.js` | bestanden (16/16) | | – | |
| `person-eintritt-stempel.test.js` | bestanden (11/11) | | – | |
| `stempel-fachpruefung.test.js` | bestanden (7/7) | | – | |
| NEU `abnahme-b-wiederholung.test.js` K1 | bestanden | Beginn ×3 (Doppeltipp, Netzwiederholung, zweiter Reiter), neuer Druck → 409, Ende ×2, verspäteter Beginn nach dem Ende → `wiederholt`; genau ein Stempel, eine Ist-Zeit | – | |
| NEU `abnahme-b-wiederholung.test.js` K2 | bestanden | PUT mit ETag von vor dem Stempel → 409 (zweimal); frischer ETag ohne den Stempel → Stempel bleibt | – | |
| NEU e2e B7 (390x844) | bestanden | `context.setOffline(true)` → Einstempeln → „vorläufig (offline gespeichert)“, Server: 0 Stempel; Netz zurück → genau 1; erneuter Netzwechsel + Neuladen → weiterhin 1; Ausstempeln online → Ende am selben Stempel | – | Playwright-Offline ist kein Funkloch: kein Service Worker (in der Suite blockiert), kein Hintergrund-Sync, kein Beenden der App durch das Betriebssystem |

### 3.3 Bereich 8 — Krankmeldungen zweistufig

| Test | Ergebnis | Nachweis | Befunde | Restrisiko |
|---|---|---|---|---|
| `rb2-krankmeldung.test.js` | bestanden (73/73) | Rechte je Rolle/Schritt, vorläufig nie endgültig, Sicht, HTTP, Wiederholung, Gleichzeitigkeit | – | |
| `rb4-krankmeldung-benachrichtigung.test.js` | bestanden (35/35) | Benachrichtigungen ohne Gesundheitsangaben | – | |
| NEU `abnahme-b-wiederholung.test.js` K3 | bestanden | Meldung ×2, vorläufig ×2, endgültig ×2 gleichzeitig: ein Fall, je Stufe ein Verlaufseintrag (409 für die Doppelung), eine Abwesenheit; Plan bis zur endgültigen Bestätigung unverändert; veraltete Kopie der Planung (alter ETag) → 409, Abwesenheit bleibt | – | |
| NEU e2e B8 (390x844 + zwei Zweitkontexte 1024x768) | bestanden | Beschäftigte meldet am Telefon („Anliegen“ → Blatt), Schichtverantwortung bestätigt vorläufig im Lagebild (keine „endgültig“-Schaltfläche), Plan und Abwesenheiten unverändert, Anmerkung weder in der Oberfläche noch im Bestand von SV und Betriebsrat; Planung bestätigt endgültig → genau eine Abwesenheit, Verlauf eingegangen/vorlaeufig/endgueltig; Wiederholung 409 | – | Benachrichtigungswege (Push, Mail) nur als Daten geprüft, nicht zugestellt |

Rechteentscheidung 2026-11-11 (endgültig nur Planung/Leitung, keine einseitige Umbesetzung, Plan bis endgültig unverändert): durch rb2 (Server) und B8 (Oberfläche + Server) gedeckt.

### 3.4 Bereich 9 — Schichtausfälle und Ersatzplanung

| Test | Ergebnis | Nachweis | Befunde | Restrisiko |
|---|---|---|---|---|
| `schutzregeln-ersatzsuche.test.js` | bestanden (22/22) | Ersatzsuche hält Schutzregeln | – | |
| `intelligence-ausfallvorschlag.test.js` | bestanden (20/20) | F3: Schalter aus ist Vorgabe; Rollenmatrix | – | F3 bleibt AUS (nicht aktiviert) |
| `engine-einsatz.test.js` | bestanden (17/17) | | – | |
| `abnahme-409.test.js` | bestanden (5/5) | | – | |
| Browser-E2E Ersatzplanung | **nicht ausführbar** (kein neuer Test) | Die Oberfläche „Ersatz vorbereiten“ im Lagebild ist nicht als Browserablauf geprüft; Grund: Umfang/Zeit dieses Strangs. Der vorläufige Fall zeigt keinen Ersatz (rb2 B). | – | Ersatzauswahl im Browser offen |

### 3.5 Bereich 10 — Monatsabschluss und Zeitkorrekturen

| Test | Ergebnis | Nachweis | Befunde | Restrisiko |
|---|---|---|---|---|
| `monatsabschluss.test.js` | bestanden (25/25) | | – | |
| `monatsabschluss-lib.test.js` | bestanden (24/24) | | – | |
| `monatsabschluss-ist.test.js` | bestanden (10/10) | | – | |
| `monatsabschluss-nachtrag.test.js` | bestanden (25/25) | | – | |
| `monatsabschluss-nachtrag3.test.js` | bestanden (27/27) | | – | |
| `monatsabschluss-nachtrag4.test.js` | bestanden (18/18) | | – | |
| `monatsabschluss-oberflaeche.test.js` | bestanden (7/7) | | – | |
| `wp16c-korrekturrevision.test.js` | bestanden (33/33) | Korrekturrevisionen | – | |
| `korrekturworkflow.test.js` | bestanden (25/25) | | – | |
| `korrektur-nachtrag.test.js` | bestanden (23/23) | | – | |
| `korrektur-oberflaeche.test.js` | bestanden (10/10) | | – | |
| `wp14c-folgebefunde.test.js` | bestanden (27/27) | #268: Pause erreicht Anwesenheit ⇒ Prüffall (`pruefungen/wp14c-folgebefunde.test.js:34`) | – | |
| `istdaten.test.js` | bestanden (35/35) | Ist-Zeiten unter Rollenschutz: „nicht verfügbar“ statt Planzeit (`:130`, `:195`) | – | |
| `pruefungsfaelle-verhalten.test.js` | bestanden (7/7) | | – | |
| `selbstauskunft.test.js` | bestanden (22/22) | | – | |
| `etag-pflicht.test.js` | bestanden (16/16) | | – | |
| NEU `abnahme-b-wiederholung.test.js` K4 | bestanden | drei gleichzeitige Abschlüsse → genau einer (200/409/409), Wiederholung 409 ohne neuen Verlaufseintrag; zwei gleichzeitige Wiederöffnungen → genau eine | – | |
| NEU e2e B10 (Leitung, 1024x768) | bestanden; Teilschritt Korrektur **nicht ausführbar** (Demo-Bestand ohne vollständigen Stempel im Vormonat) | Vormonat über „Abrechnungsdaten → Stempelbefunde“ abschließen (Prüffall-Rückfrage bestätigt), mit Grund wiederöffnen, erneut abschließen; Verlauf abschluss/wiederoeffnung/abschluss; Doppelabschluss 409 | – | Korrektur nach Wiederöffnen nur in vitest belegt (`monatsabschluss.test.js`, `wp16c-korrekturrevision.test.js`), nicht im Browser; Lohnexport nicht im Browser |

### 3.6 Bereich 14 — Barrierefreiheit, mobile Viewports, Bedienbarkeit

| Test | Ergebnis | Nachweis | Befunde | Restrisiko |
|---|---|---|---|---|
| `wcag-wp40.test.js` | bestanden (24/24) | Bewertungslogik ohne Browser | – | |
| `geraete-wp21-sv-uebergabe.test.js` | bestanden (10/10) | | – | |
| NEU e2e axe `abnahme-b-heute-stempeluhr` (8 Viewports) | siehe 3.8 | Heute mit Stempeluhr; Zielgröße Ein-/Ausstempeln ≥ 24 px | – | |
| NEU e2e axe `abnahme-b-krankmeldung-blatt` (8 Viewports) | siehe 3.8 | geöffnetes Krankmeldungsblatt | – | |
| NEU e2e axe `abnahme-b-lagebild-planer` (8 Viewports) | siehe 3.8 | Lagebild mit offenen Krankmeldungen | B-1 | |
| NEU e2e axe `abnahme-b-stempelbefunde-leitung` (8 Viewports) | siehe 3.8 | Monatsabschluss-Fläche | B-2 | |
| NEU e2e `tastatur-krankmeldung` (390x844, 1024x768) | siehe 3.8 | „Krank melden“ per Tab erreichbar, sichtbarer Fokus, Enter öffnet, Fokus im Blatt, Escape schließt | – | Bildschirmleser nicht geprüft |

### 3.7 Wiederholungen und Läufe mit Umgebungsfehlern

Erster Lauf: alle 43 Dateien nacheinander (Skript im Arbeitsordner, je Datei `npx vitest run pruefungen/<datei> --testTimeout=120000`).
Drei Dateien ohne grünes Ergebnis, jeweils mit Ursache in der Prüfumgebung, danach **allein** wiederholt (gleicher Befehl, gleicher Stand `0638c101`):

| Datei | Lauf 1 | Ursache | Lauf 2 (allein) |
|---|---|---|---|
| `offline-stempeln.test.js` | 6 rot / 32 grün | Die Mutation M2 (Abschnitt 4) lag während dieses Laufs für etwa eine Minute im selben Worktree; die sechs roten Fälle sind genau die Wiedererkennung über `ereignisStart`. Selbst verursacht, kein Produktbefund. | **bestanden (38/38)** |
| `stempel-integritaet.test.js` | 89 übersprungen, Datei rot | `Hook timed out in 10000ms` (beforeAll) bei paralleler Last (Browserlauf und Läufe anderer Arbeitszweige auf demselben Rechner) | **bestanden (89/89)** |
| `serverdatum.test.js` | 16 übersprungen, Datei rot | wie oben | **bestanden (16/16)** |

Lehre für weitere Läufe: Mutationen nie, während im selben Worktree eine Serie läuft (hier passiert, offen benannt).

### 3.8 Browserläufe (Playwright, alle acht Viewports)

Befehl: `E2E_PORT=4102 npx playwright test e2e/abnahme-b-ablaeufe.spec.mjs e2e/barrierefreiheit.spec.mjs` (alle acht Projekte,
global-setup baut die Oberfläche in einen Wegwerfordner und startet `server.mjs` auf 127.0.0.1:4102 mit frischem Datenordner).
Stand `0638c101` plus die Änderungen dieses Zweigs (nur Tests, Ausnahmeliste, Doku).

**Ergebnis: 102 bestanden, 0 fehlgeschlagen, 0 wackelig, 34 übersprungen** (28,3 min auf dem belasteten Prüfrechner).
Die 34 Übersprungenen sind gewollt: die drei schreibenden Abläufe an 7 von 8 Viewports (21), die Tastaturprüfung an 6 von 8
(6), die Prüfung der Ausnahmeliste an 7 von 8 (7).

| Test | Viewports | Ergebnis | Anmerkung aus dem Lauf |
|---|---|---|---|
| B7 Stempeln ohne Netz | 390x844 | bestanden | 2 Sendungen an `/api/stempeln` (offline gescheitert, nach dem Netz gespeichert), 1 Stempel auf dem Server |
| B8 Krankmeldung zweistufig | 390x844 (+ SV und Planung 1024x768) | bestanden | Meldung: Server 200 |
| B10 Monatsabschluss | 390x844-Projekt, Seite auf 1024x768 | bestanden, **Korrekturschritt nicht ausführbar** | Abschluss 200, Wiederöffnen 200, erneuter Abschluss 200; Demo-Bestand hat im Vormonat keinen vollständigen Stempel, daher keine Korrektur in diesem Ablauf (Korrektur nach Wiederöffnen belegt `monatsabschluss.test.js` „Wiederöffnen durch die Leitung …“) |
| mein-plan-mobil | alle 8 | bestanden | |
| heute-stempeluhr (axe) | alle 8 | bestanden | |
| krankmeldung-blatt (axe) | alle 8 | bestanden | |
| lagebild-planer (axe) | alle 8 | bestanden mit Ausnahme B-1 | Ausnahme an allen 8 genutzt |
| stempelbefunde-leitung (axe) | alle 8 | bestanden mit Ausnahme B-2 | Ausnahme an allen 8 genutzt |
| tastatur-krankmeldung | 390x844, 1024x768 | bestanden | |
| vorhandene `barrierefreiheit.spec.mjs` (8 Tests) | alle 8 | bestanden | unverändert bis auf die erweiterte Liste bekannter Flächen |

Frühere, rote Fassungen der neuen Abläufe (Testfehler, Abschnitt 2 „Beobachtungen“) sind durch die obige Fassung ersetzt; sie
zählen nicht als Nachweis.

## 4. Rot bei Defekt (lokale Mutation, nie eingecheckt)

| Nr. | Mutation (lokal, danach `git checkout`) | Erwartung | Ergebnis |
|---|---|---|---|
| M1 | `server/lib/monatsabschluss.mjs:400` — Abweisung „schon abgeschlossen“ deaktiviert (`if (false && …)`) | K4 rot | rot: `expected [200, 200, 200] to deeply equal [200, 409, 409]`, verlauf mit drei „abschluss“-Einträgen; nach Rücknahme grün |
| M2 | `server/lib/zeiterfassung.mjs:500` — Wiedererkennung des Beginns über `ereignisStart` deaktiviert | K1 rot | rot: `expected [[409, undefined], …] to deeply equal [[200, true], [200, true]]`; nach Rücknahme grün |
| M3 | `src/stempelpuffer.js:134` (`erfassen`) — ein ohne Netz erfasstes Ereignis wird nicht abgelegt (`if (offline) return ev;` vor `speicher.setzen`) | e2e B7 rot | rot: „nach dem Netz: genau ein Stempel — Expected 1, Received 0“ (`e2e/abnahme-b-ablaeufe.spec.mjs:124`); nach Rücknahme grün (Volllauf 3.8). Nebenbei sichtbar: die Anzeige „vorläufig (offline gespeichert)“ erschien trotzdem — sie folgt dem lokalen Zustand der Oberfläche, nicht dem Speicher; im unveränderten Code wird vor dem Senden abgelegt, daher kein Befund. |

## 5. Nur in produktionsähnlichem Staging oder auf echten Geräten nachweisbar

Für die Bereiche 6, 7, 8, 9, 10 und 14 ist mit dieser lokalen Integrationsabnahme **nicht** belegt:

- **Echte Android- und iOS-Geräte (Bereich 6, 7, 14):** Darstellung in Safari/WebKit und Chrome Android (hier nur Chromium mit
  emuliertem Viewport und `hasTouch`), Bildschirmtastatur, sichere Bereiche (Notch), Drehen während einer Eingabe, Schriftgrößen
  des Systems, echte Touch-Gesten und Trefferflächen mit dem Finger.
- **Offline-Puffer unter echten Bedingungen (Bereich 7):** Funkloch und Flugmodus statt `context.setOffline`; App im Hintergrund
  oder vom Betriebssystem beendet und neu gestartet, während ein Stempel wartet; IndexedDB nach Neustart des Geräts; iOS-Grenzen
  für Speicher und Hintergrundarbeit; Geräteuhr falsch gestellt auf einem echten Gerät; Geo-Prüfung mit echter Position.
- **PWA (Bereich 6, 7):** installierte App, Service Worker (in der Suite bewusst blockiert), Zwischenspeicher nach Aktualisierung,
  Start ohne Netz aus dem Startbildschirm, Push-Zustellung (Krankmeldung, Plan geändert) — hier nur als Daten geprüft.
- **Tastatur und Bildschirmleser (Bereich 14):** VoiceOver (iOS/macOS), TalkBack (Android), NVDA/JAWS (Windows) — Ansage der
  Statuszeile „vorläufig (offline gespeichert)“ (`role=status`), der Blattüberschrift und der Fehlermeldungen; externe Tastatur
  am Tablet. axe prüft nur Regeln, keine Bedienbarkeit mit Hilfsmitteln.
- **TLS, Proxy, Docker (alle Bereiche):** Herkunft hinter Caddy (`x-forwarded-for`, hier künstlich gesetzt), Bremsen je echter
  Herkunft, HTTPS-Pflicht für Service Worker/Geo/Kamera, Zeitgrenzen und Wiederholungen des Proxys (Stempel „500 nach
  Speichern“ durch ein echtes Proxy-Timeout), das gebaute Docker-Bild (`npm ci --omit=dev`), Dateirechte und Datenordner im
  Container, Serverzeitzone im Container (Monatsgrenze, Mitternacht beim Stempeln).
- **Last und Gleichzeitigkeit im Betrieb (Bereich 7, 8, 10):** Schichtwechsel mit vielen Geräten zugleich (hier höchstens
  sechs gleichzeitige Anfragen), Monatsabschluss bei vollem Datenbestand eines Pilotbetriebs.
- **Ersatzplanung im Browser (Bereich 9):** siehe 3.4, auch lokal nicht als Browserablauf geprüft.

## 6. Stand am Ende und Einbindung

Während der Abnahme rückte `integration/release-v4` von `0638c101` auf `ca45a0a2` vor (#271 WP-48-GB „Öffnen schreibt nicht“,
#272 Rollenauswahl in „Personal“). Der Zweig wurde darauf nachgezogen; der einzige Konflikt war die Kette `pruefung` in
`package.json` (gelöst mit `node werkzeug/package-kette-vereinigen.cjs`, danach Reihenfolge korrigiert: … `imp6-mehrfachmodelle`,
`wp48-gb-oeffnen`, `abnahme-b`, `wcag-wp40`, `sammelpruefung` zuletzt).

Am Ende-Stand `abc3e717` erneut ausgeführt:

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| neue API-Prüfung | `npx vitest run pruefungen/abnahme-b-wiederholung.test.js --testTimeout=120000` | bestanden (4/4) |
| CI-Abdeckung | `npm run pruefung:ci-abdeckung` | bestanden (167 Skripte, alle in der CI; 8/8) |
| Kette trocken | `npm run pruefung:sammelpruefung` | bestanden (167 Kettenglieder; 13/13) |
| Lint | `npm run lint` | bestanden (0 Fehler, 132 Warnungen wie auf der Basis) |
| Typen | `npm run pruefung:typen` | bestanden |
| Browser | `E2E_PORT=4102 npx playwright test e2e/abnahme-b-ablaeufe.spec.mjs e2e/barrierefreiheit.spec.mjs --project=390x844 --project=932x430` | 28 bestanden, 0 fehlgeschlagen, 6 übersprungen (gewollt) |

Die übrigen 43 vorhandenen vitest-Dateien und der Browser-Volllauf an allen acht Viewports liefen auf `0638c101`
(Abschnitte 3.1–3.8); die beiden neuen Basis-Commits berühren keine Datei dieser Prüfungen außer `src/App.jsx` (Öffnen ohne
Schreiben), das die Browserläufe am Ende-Stand mit abdecken.

Einbindung: `pruefung:abnahme-b` in der Kette (vor `wcag-wp40`, `sammelpruefung` zuletzt) und als eigener Schritt in
`.github/workflows/pruefung.yml`; `e2e/abnahme-b-ablaeufe.spec.mjs` läuft über `npm run e2e` im vorhandenen Job
`browser-abnahme` mit (zusätzlich rund 50 nicht übersprungene Tests; auf dem belasteten Windows-Prüfrechner zusammen 28 min
für beide Spec-Dateien, auf dem CI-Läufer deutlich weniger erwartet, Zeitgrenze des Jobs 40 min — im ersten CI-Lauf beobachten).

Zählung dieses Strangs (Dateien bzw. Tests mit Ergebnis):
- vitest vorhanden: 43 Dateien bestanden (nach Einzelwiederholung von 3 Dateien, Abschnitt 3.7), 0 nicht bestanden.
- vitest neu: 1 Datei, 4 Tests bestanden.
- Browser (Volllauf, 8 Viewports): 102 bestanden, 0 nicht bestanden.
- nicht ausführbar: Ersatzplanung im Browser (Bereich 9) und der Korrekturschritt in B10 (Demo-Bestand ohne Stempel im Vormonat).
