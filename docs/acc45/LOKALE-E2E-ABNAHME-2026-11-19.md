# Lokale End-to-End-Abnahme ohne Staging-VM (2026-11-19)

> **Lokale Abnahme, keine Staging-Abnahme.** Alle Läufe gegen eine isolierte, lokal gestartete Instanz (`server.mjs` auf
> 127.0.0.1, Wegwerf-Datenordner, nur synthetische Daten, feste Abnahmeuhr aus `e2e/zeitbasis.mjs`). Staging, VPS und
> Produktion wurden weder berührt noch geprüft. Kein Schalter wurde eingeschaltet (Teilspeicherung, Import bleiben aus),
> keine Migration, keine produktiven Daten, keine bestehende Prüfung oder Ausnahme geändert.

| | |
|---|---|
| Basis | `integration/release-v4` @ `1d8aacce` |
| Umgebung | Windows 11, Node 24.18.0, Git Bash, `npm ci` im eigenen Worktree, Playwright 1.64.1 Chromium headless |
| Speicherschonung | `workers: 1`, je Lauf EIN Viewport-Projekt (nacheinander `1024x768` und `390x844`, nie parallel), vitest einzeln mit `--maxWorkers=1`; keine Wiederholungsschleifen |
| Nicht lokal gelaufen (CI) | `rechtematrix-zeilen`, `erstleitung-bestand-differenz`, `wp48-teilweg` (groß), die übrigen sechs Viewport-Projekte |

Legende Ebene: **Unit** = Bibliothek/Rendern ohne Server; **HTTP-in** = echter Handler im Testprozess (Dateiablage, echte
Sitzungen); **HTTP-Server** = `server.mjs` als Kindprozess über HTTP; **Browser** = Playwright gegen `server.mjs`.
Belegt heißt: Datei gelesen (mindestens Kopf und Testnamen) **und** in diesem Auftrag ausgeführt — oder ausdrücklich nur
gelesen, wenn so markiert. Fehlende Tests zählen nie als belegt.

## 1. Matrix je Bereich

Stufen: **belegt** = Kernablauf lokal nachgewiesen (Browser oder HTTP mit echtem Server/Handler, in diesem Auftrag gelaufen);
**teilweise** = nur Teile oder nur unterhalb des Browsers; **Lücke** = kein lokaler Nachweis.
„(gelesen)“ = Datei nur gelesen, in diesem Auftrag nicht ausgeführt (läuft in der CI-Kette `pruefung`).

| # | Bereich | Vorhandene Prüfung (Datei) | Ebene | Belegter Umfang | Lücke | Stufe |
|---|---|---|---|---|---|---|
| 1 | Betriebe und Rollen | `pruefungen/abnahme-a-ablauf.test.js`; `e2e/abnahme-a-ablauf.spec.mjs` (Schritt 0); `e2e/lokale-abnahme-luecken.spec.mjs` L0; `rollen-failclosed`, `rollen-eintritt`, `rb1-plan-publish` (gelesen) | HTTP-Server, Browser | Betreiber legt leere Betriebe an, Leitungszugang, Erstanmeldung der Leitung im Browser legt ihre Person an (Server), Einladung und Annahme für Planung und Beschäftigte, Rollenrechte je Rolle | Einladung im Browser (Knopf, Code ablesen) nur per API; Rollenwechsel einer Person im Browser | belegt |
| 2 | Personal anlegen / bearbeiten / löschen | `abnahme-a-ablauf.test.js` (Personal über HTTP); L5 (Anlegen über den Import im Browser); `personendaten`, `loeschsperre`, `person-eintritt`, `personal-rollenauswahl-name` (gelesen) | HTTP-Server, Browser (nur Anlegen per Import) | Anlegen über HTTP und über die Importübernahme im Browser; Gestalt- und Löschsperrregeln unterhalb des Browsers | Bearbeiten und Löschen einer Person in der Oberfläche (Formular „Personal“) hat keinen Browserablauf | teilweise |
| 3 | Excel-Import inkl. Fehlerfälle | `pruefungen/import-personal-e2e.test.js` (echte XLSX über SheetJS → UI-Schicht → echter Handler); `import-parser*`, `import-endpunkt`, `import-schalter`, `import-rumpfgrenze` (gelesen); L5 (Texteinfügen im Browser) | HTTP-in, Browser (nur Text) | XLSX: Upload, Analyse, Vorschau, Übernahme; Dubletten nur ausdrücklich; ungültiges Eintrittsdatum; Abbruch ohne Teilbestand. Browser: fehlerhafte Zeile erkannt, nicht übernommen; nur Fehler → Übernahme gesperrt | **Dateiimport im Browser nicht erreichbar**: `IMPORT_DATEI_AKTIV = false` (Bauzeit, `src/lib/import-schnittstelle.js:17`) und `CENTRIC_IMPORT_AKTIV` aus — Einschalten nur mit Freigabe | teilweise |
| 4 | Schichtmodelle und Dienstplanung | `abnahme-a-ablauf.test.js` (Schichtmodell IMP-6 nur API, Entwurf, Freigabe); `e2e/abnahme-a-ablauf.spec.mjs` 2–4 (Entwurf unsichtbar, „Plan freigeben“, Beschäftigte sieht Dienst); `imp6-mehrfachmodelle`, `ki-schichtfolge-live` (gelesen); `abnahme-b-ablaeufe` B8-Gegenprobe (Ruhezeit 403) | HTTP-Server, Browser | Entwurf → Freigabe → Sichtbarkeit; Ruhezeitverstoß abgewiesen | Schichtmodell im Browser anlegen/zuordnen; Dienst im Monatsplan per Klick setzen/ändern | teilweise |
| 5 | Gleichzeitige Änderungen / Konflikte | `abnahme-409.test.js`, `speicher-409-konfliktsperre.test.js` (echter Client + Handler, V1–V6, E, D); `wp48-5-konflikt*` (gelesen); `e2e/teilkonflikt.spec.mjs` (Teilweg gestellt, Schalter aus); **neu L3** | HTTP-in, Browser | Browser: fremder Kern-Stand → eigene Eingabe 409 → Fenster „Gleichzeitig bearbeitet“; „Später entscheiden“ → weitere Eingabe geht **nicht** hinaus (Sendesperre), Leiste „bis zur Entscheidung wird nichts gespeichert“; fremde Änderung unversehrt; „Konflikt entscheiden“ → „Neu laden“ zeigt sie | „Meinen Stand übernehmen“ im Browser (nur vitest); zwei echte Browser gleichzeitig (hier: Browser + API) | belegt |
| 6 | Urlaubsanträge und Genehmigung | `antrag-kapern-orakel`, `p2-11a-antraege-nested` (gelesen); axe-Fläche `antraege-planer`; **neu L1/L2** | Browser | Beschäftigte (390 px): „Ende vor Beginn“ bleibt im Blatt; gültiger Antrag genau einmal auf dem Server; Planung genehmigt im Browser → Status genehmigt + Abwesenheit Urlaub; Beschäftigte sieht „genehmigt“ | mehrstufige Genehmigung, Ablehnung, Sammelentscheidung im Browser; Mitteilung per Mail/Push (Phase D) | belegt |
| 7 | Zeiterfassung / Pausen / Zuschläge | `e2e/abnahme-b-ablaeufe.spec.mjs` B7 (Stempeln offline → genau ein Stempel), B10 (Monatsabschluss); `abnahme-b-wiederholung.test.js` (K1 Stempelwiederholungen); `zeiterfassung`, `pausenerfassung`, `zeit-e-zuschlaege-dst` u. a. in `pruefung:zeiterfassung` (gelesen) | Browser, HTTP-in, Unit | Stempeln mit/ohne Netz, Wiederholungen, Monatsabschluss/Wiederöffnen | Pausenangabe beim Ausstempeln und Zuschlagsanzeige im Browser; Zuschläge nur Unit | teilweise |
| 8 | Abrechnung / Exporte | `monatsabschluss-*` (gelesen); axe-Fläche `abrechnungsdaten-leitung` (gelesen, lief im 1024er-Lauf mit); B10 | Unit, HTTP-in, Browser (nur Ansicht/axe) | Abschluss friert Ist ein; Ansicht Abrechnungsdaten barrierefrei | Export-Datei (Download, Inhalt) im Browser; Lohnausgabe Ende-zu-Ende | Lücke (Export) |
| 9 | Rechte- und Mandantentrennung | `mandanten.test.js`, `mandanten-session.test.js`, `abnahme-a-ablauf.test.js` (gefälschte Rümpfe/Kennungen/ETags), `abnahme-c-module.test.js`; `e2e/abnahme-a-ablauf.spec.mjs` 1/5; **neu L2** (Antrag aus Betrieb G erscheint nicht, bleibt dort unberührt); `rechtematrix-zeilen` (CI) | HTTP-in, HTTP-Server, Browser | Leitung Nord/Süd sehen nur Eigenes; Anträge fremder Betriebe unsichtbar; Gestalt- und Schreibweg | volle Rechtematrix nur CI (`rechtematrix-zeilen`, groß) | belegt |
| 10 | Mobile Bedienung / PWA | `e2e/barrierefreiheit*.spec.mjs`, `abnahme-b-ablaeufe` (Telefonviewport, Bedienflächen ≥ 24 px, kein waagrechtes Scrollen); `pwa.test.js` (Manifest-Verknüpfungen, Zwischenspeicher-Regeln; gelesen) | Browser (Chromium-Emulation), Unit | Telefonbreite 390 px und Tablet 1024 px lokal; übrige sechs Viewports in der CI | Dienstarbeiter im Browser ist in der Suite **gesperrt** (`serviceWorkers: "block"`); Installation, iOS/Safari, echtes Gerät | teilweise |
| 11 | Wiederholte Anmeldung / Sitzungsablauf | `sitzungen`, `sitzungsbindung`, `sitzungsrennen`, `sitzungsinventar`, `sitzungsaufraeumen`, `sitzung-ohne-rolle`; `anmeldung-http` (gelesen); **neu L4a/L4b** | HTTP-in, Browser | Fristen, Widerruf, Rennen, Aufräumen; Browser: beim Server beendete Sitzung → altes Merkmal 401, Anmeldung, Wiederanmeldung mit demselben Code zeigt die Daten | **Befund B-L4** (§4): erstes Laden nach Sitzungsende bleibt auf dem Ladegerüst; Zeitablauf 30 min/12 h selbst nicht im Browser (Server-Uhr nicht vorstellbar) | belegt mit Befund |

## 2. Läufe (lokal, 2026-11-19)

Dauer = Wandzeit inklusive Bau der Oberfläche und Einrichtung des Testservers (`global-setup.mjs`, rund 40–60 s je Playwright-Lauf).

### 2.1 Playwright (Chromium headless, `workers: 1`, ein Projekt je Lauf)

| Lauf | Ergebnis | Dauer |
|---|---|---|
| `npx playwright test --project=1024x768` (alle Specs, vor der neuen Datei) | **grün**: 23 bestanden, 5 übersprungen (B7/B8/B10 laufen nur in `390x844`, Listenprüfung nur in `360x740`), 0 rot | 407 s |
| `npx playwright test --project=390x844` (alle Specs inkl. neuer Datei) | **grün**: 21 bestanden (u. a. B7 Stempeln offline, B8 Krankmeldung zweistufig + Ruhezeit-Gegenprobe, B10 Monatsabschluss, Stempeluhr, Tastatur), 14 übersprungen (Strang A und neue Datei nur in `1024x768`, Listenprüfung), 0 rot | 281 s |
| `npx playwright test --project=1024x768 e2e/lokale-abnahme-luecken.spec.mjs` (Entwicklung, 4 Läufe) | 1.–3. rot (Testfehler, §4), 4. **grün**: 7 bestanden (L4a als erwarteter Fehler) | 82 s / 76 s / 107 s / 84 s |
| `npx playwright test --project=1024x768` (alle Specs inkl. neuer Datei, Abschluss) | **grün**: 30 bestanden (davon L4a als erwarteter Fehler), 5 übersprungen, 0 rot — die neue Datei stört die übrigen Specs nicht (kein Dialog „Gleichzeitig bearbeitet“ im Demo-Betrieb) | 296 s |

### 2.2 vitest einzeln (`npx vitest run <datei> --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000`)

| Datei | Ebene | Ergebnis | Dauer |
|---|---|---|---|
| `abnahme-409.test.js` | HTTP-in | grün, 5/5 | 11 s |
| `abnahme-a-ablauf.test.js` | HTTP-Server | grün, 24/24 | 16 s |
| `abnahme-a-b.test.js` | HTTP-in | grün, 25/25 | 17 s |
| `abnahme-b-wiederholung.test.js` | HTTP-in | grün, 4/4 | 13 s |
| `abnahme-c-absturz.test.js` | HTTP-Server (SIGKILL/Wiederanlauf) | grün, 11/12, 1 übersprungen (`skipIf(win32)`: geordnetes Herunterfahren, Signal unter Windows nicht zustellbar — läuft in der CI unter Linux) | 32 s |
| `abnahme-c-module.test.js` | HTTP-in | grün, 8/8 | 25 s |
| `abnahme-c-schalter.test.js` | HTTP-Server (`NODE_ENV=production`) | grün, 21/21 | 35 s |
| `browser-abnahme-kern.test.js` | Unit | grün, 15/15 | 6 s |
| `import-personal-e2e.test.js` | HTTP-in (echte XLSX) | grün, 14/14 | 17 s |
| `mandanten.test.js` | Unit/HTTP-in | grün, 65/65 | 8 s |
| `mandanten-session.test.js` | HTTP-in | grün, 28/28 | 13 s |
| `sitzungen.test.js` | HTTP-in | grün, 16/16 | 7 s |
| `sitzungsbindung.test.js` | HTTP-in | grün, 62/62 | 37 s |
| `sitzungsrennen.test.js` | HTTP-in | grün, 13/13 | 27 s |
| `sitzungsinventar.test.js` | Unit | grün, 14/14 | 7 s |
| `sitzungsaufraeumen.test.js` | HTTP-in | grün, 35/35 | 13 s |
| `sitzung-ohne-rolle.test.js` | HTTP-in | grün, 12/12 | 8 s |
| `speicher-409-konfliktsperre.test.js` | HTTP-in (echter Client) | grün, 16/16 | 20 s |

Bewusst nicht lokal (CI): `rechtematrix-zeilen`, `erstleitung-bestand-differenz`, `wp48-teilweg`. Nicht gefunden: das im
Auftrag genannte `docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` gibt es auf `integration/release-v4` @ `1d8aacce` nicht.

## 3. Neue Prüfung: `e2e/lokale-abnahme-luecken.spec.mjs`

Eine Datei, sieben Tests, nur Projekt `1024x768` (Telefonschritte stellen die Seite auf 390x844 um; in den übrigen sieben
Projekten übersprungen, wie `abnahme-a-ablauf.spec.mjs`). Eingebunden ohne neue Skripte: `playwright.config.mjs` nimmt jede
`e2e/**/*.spec.mjs` auf, `npm run e2e` läuft im CI-Job `browser-abnahme` (`pruefung.yml`) und im Staging-Gate. Keine Änderung an
`hilfen.mjs`, `global-setup.mjs`, `axe-ausnahmen.json`, Allowlists oder Schaltern.

- **Eigene Betriebe:** Der Betreiber legt über die API zwei leere Betriebe an (L, G). Der Demo-Betrieb der übrigen Specs wird
  nicht beschrieben, damit dort kein Dialog „Gleichzeitig bearbeitet“ entsteht.
- **Deterministisch:** Tage relativ zum festen Abnahmetag (`abnahmeHeute`, `tagPlus`), keine Zufallsquelle; `Date.now()` nur für
  einen eindeutigen Raumnamen je Lauf (`// zeit-ok:` im Kopf). Warten nur auf Bedingungen (`expect.poll`, Netzruhe), keine festen Pausen.
- **Synthetisch:** Marker `LueckeE2e`, `GegenE2e`, `SYNTH-URLAUB-L1`; Codes nie ausgegeben.
- **L3 hebt die Eigenprüfung des Fixtures auf** (`page.removeLocatorHandler` für „Gleichzeitig bearbeitet“), weil dieser Test den
  Konflikt absichtlich erzeugt. Für alle anderen Tests bleibt sie unverändert.
- **L4a ist als `test.fail` markiert** (bekannter Fehler B-L4, nicht versteckt): Der Test beschreibt das richtige Verhalten. Wird der
  Fehler behoben, meldet Playwright „unerwartet bestanden“ — dann die Markierung entfernen.

| Test | Inhalt |
|---|---|
| L0 | Einrichtung (Browser-Erstanmeldung der Leitung, Personal/Einladungen per API, Betrieb G mit offenem Antrag) |
| L1 | Urlaubsantrag am Telefon: Fehlerfall „Ende vor Beginn“ (`aria-invalid`, Blatt bleibt offen), gültiger Antrag genau einmal |
| L2 | Genehmigung durch die Planung; Antrag aus G unsichtbar und unberührt; Beschäftigte sieht „genehmigt“ |
| L3 | 409 → Konfliktfenster → „Später entscheiden“ → weitere Eingabe ohne PUT → fremde Änderung bleibt → „Neu laden“ |
| L4a | Erwartet Anmeldung beim ersten Laden nach Sitzungsende — `test.fail` (B-L4) |
| L4b | Altes Merkmal 401; Anmeldung nach erneutem Laden; Wiederanmeldung zeigt die Daten |
| L5 | Import-Fehlerfall: nur fehlerhafte Zeile → gesperrt; gemischt → genau die gültige Person auf dem Server |

## 4. Befunde

### B-L4 (Produktfehler, mittel, UX): Nach Sitzungsende bleibt die Seite auf dem Ladegerüst

Reproduziert in L4a (lokal, Chromium, 1024x768): Anmelden, Sitzung beim Server beenden (wie Ablauf nach 30 min Untätigkeit,
12-h-Frist oder Abmelden/Entzug auf einem anderen Weg), Seite neu laden → dauerhaft „CENTRIC wird geladen“ (Ladegerüst), keine
Anmeldung, kein Hinweis. Erst ein **zweites** Neuladen zeigt die Anmeldung. Kein Datenverlust (es wird nichts gesendet), aber für
Beschäftigte am Telefon wirkt die App „hängend“.

Ursache (gelesen, nicht geändert):
- `src/speicher.js:86` — `ruf()` ruft bei 401 `abmelden(true)` (Merkmal geräumt) und wirft `nicht-angemeldet`, ohne die
  Oberfläche zu benachrichtigen.
- `src/App.jsx:1187` — der Ladelauf verschluckt genau diesen Fehler (`!== "nicht-angemeldet"`), `db` bleibt `null`.
- `src/App.jsx:1674` — `if (!db)` zeigt das Ladegerüst; `src/main.jsx:623` hält `an` (angemeldet) aus dem Start fest und wechselt
  nicht zur Anmeldung.

Vorschlag (nicht umgesetzt, eigener PR): nach `nicht-angemeldet` im Ladelauf auf die Anmeldung wechseln (z. B. Rückmeldung an
`Einstieg`, oder `window.location.reload()` nach geräumtem Merkmal) und einen Hinweis „Sitzung abgelaufen, bitte neu anmelden“ zeigen.
Danach `test.fail` in L4a entfernen. Nicht geprüft: dasselbe Ereignis **ohne** Neuladen (Sitzung endet, während die Seite offen ist
und gespeichert wird).

### Keine weiteren Produktfehler

Alle übrigen Läufe grün (§2). Während der Entwicklung der neuen Spec traten zwei Testfehler auf, beide Fehler des Tests, nicht des
Produkts: (1) zweite Anmeldung in derselben Seite fand kein Eingabefeld, weil das Merkmal der vorigen Rolle im Reiterspeicher lag —
behoben, die Hilfsfunktion räumt nur die Anmeldedaten der Seite; (2) nach „Später entscheiden“ öffnet der Knopf „Konflikt
entscheiden“ in der Leiste das Fenster wieder — der Test nutzt jetzt genau diesen Knopf.

## 5. Später produktionsnah (Phase D, nicht lokal belegbar)

Klare Trennung: Alles in §1 als „belegt“ Markierte ist **lokal nachgewiesen**. Die folgenden Punkte sind **später notwendig** und
lassen sich lokal grundsätzlich nicht belegen:

| Punkt | Warum nicht lokal |
|---|---|
| Echte Zustellung Mail/Push (Antragsentscheidung, Krankmeldung, Einladung) | braucht echten Anbieter, Zustellbarkeit, Schlüssel; lokal nur Handler/Testraum (`mail-push-*`, `testraum-mail`) |
| TLS, Caddy/Proxy-Pfad, echte Herkunftsadressen, HSTS/CSP am Rand | lokal 127.0.0.1 ohne Proxy; `CENTRIC_VERTRAUTE_PROXYS` nur simuliert (`x-forwarded-for`) |
| PWA auf echtem Gerät: Installation, iOS/Safari, Dienstarbeiter-Aktualisierung, Offline nach App-Neustart | Suite nur Chromium-Emulation, Dienstarbeiter gesperrt (`serviceWorkers: "block"`) |
| Sitzungsablauf in Echtzeit (30 min Untätigkeit, 12 h Frist) über Proxy und Gerätewechsel | lokale Serveruhr fest versetzt; Fristen nur in `sitzungen.test.js` |
| Last und Gleichzeitigkeit vieler Nutzer, Mobilfunk-Latenz | `workers: 1`, ein Rechner; `durchsatz`/`last-stempeln` nur synthetisch |
| Sicherung/Wiederherstellung auf echter VM, restic gegen Object Storage | lokal nur Wegwerfordner (`abnahme-c-absturz`); Ziel und Schlüssel nur auf der VM |
| Dateiimport (XLSX) im Browser | technisch lokal möglich, aber nur mit eingeschaltetem `CENTRIC_IMPORT_AKTIV` und `IMPORT_DATEI_AKTIV` — Freigabe des Betreibers nötig |
| Die sechs weiteren Viewports | lokal bewusst ausgelassen (Speicher), laufen in der CI (`browser-abnahme`, alle acht Projekte) |
