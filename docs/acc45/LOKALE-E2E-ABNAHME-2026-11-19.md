# Lokale End-to-End-Abnahme ohne Staging-VM (2026-11-19)

> **Lokale Abnahme, keine Staging-Abnahme.** Alle Läufe gegen eine isolierte, lokal gestartete Instanz (`server.mjs` auf
> 127.0.0.1, Wegwerf-Datenordner, nur synthetische Daten, feste Abnahmeuhr aus `e2e/zeitbasis.mjs`). Staging, VPS und
> Produktion wurden weder berührt noch geprüft. Kein Schalter wurde eingeschaltet (Teilspeicherung, Import bleiben aus),
> keine Migration, keine produktiven Daten, keine bestehende Prüfung oder Ausnahme geändert.

| | |
|---|---|
| Basis | `integration/release-v4` @ `1d8aacce`; Nachtrag L4 nach #378 auf `a0fda313` |
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
| 5 | Gleichzeitige Änderungen / Konflikte | `abnahme-409.test.js`, `speicher-409-konfliktsperre.test.js` (echter Client + Handler, V1–V6, E, D); `wp48-5-konflikt*` (gelesen); `e2e/teilkonflikt.spec.mjs` (Teilweg gestellt, Schalter aus); **neu L3** | HTTP-in, Browser | Browser: fremder Kern-Stand → eigene Eingabe 409 → Fenster „Gleichzeitig bearbeitet“; „Später entscheiden“ → nach derselben Eingabe 3000 ms lang **keine** PUT-Anfrage (Sendesperre; länger als die Schreibverzögerung `WARTE` = 1200 ms, ohne Sperre wäre der Test rot), Leiste „bis zur Entscheidung wird nichts gespeichert“; fremde Änderung unversehrt; „Konflikt entscheiden“ → „Neu laden“ zeigt sie | „Meinen Stand übernehmen“ im Browser (nur vitest); zwei echte Browser gleichzeitig (hier: Browser + API) | belegt |
| 6 | Urlaubsanträge und Genehmigung | `antrag-kapern-orakel`, `p2-11a-antraege-nested` (gelesen); axe-Fläche `antraege-planer`; **neu L1/L2** | Browser | Beschäftigte (390 px): „Ende vor Beginn“ bleibt im Blatt; gültiger Antrag genau einmal auf dem Server; Planung genehmigt im Browser → Status genehmigt + Abwesenheit Urlaub; Beschäftigte sieht „genehmigt“ | mehrstufige Genehmigung, Ablehnung, Sammelentscheidung im Browser; Mitteilung per Mail/Push (Phase D) | belegt |
| 7 | Zeiterfassung / Pausen / Zuschläge | `e2e/abnahme-b-ablaeufe.spec.mjs` B7 (Stempeln offline → genau ein Stempel), B10 (Monatsabschluss); `abnahme-b-wiederholung.test.js` (K1 Stempelwiederholungen); `zeiterfassung`, `pausenerfassung`, `zeit-e-zuschlaege-dst` u. a. in `pruefung:zeiterfassung` (gelesen) | Browser, HTTP-in, Unit | Stempeln mit/ohne Netz, Wiederholungen, Monatsabschluss/Wiederöffnen | Pausenangabe beim Ausstempeln und Zuschlagsanzeige im Browser; Zuschläge nur Unit | teilweise |
| 8 | Abrechnung / Exporte | `monatsabschluss-*` (gelesen); axe-Fläche `abrechnungsdaten-leitung` (gelesen, lief im 1024er-Lauf mit); B10 | Unit, HTTP-in, Browser (nur Ansicht/axe) | Abschluss friert Ist ein; Ansicht Abrechnungsdaten barrierefrei | Export-Datei (Download, Inhalt) im Browser; Lohnausgabe Ende-zu-Ende | Lücke (Export) |
| 9 | Rechte- und Mandantentrennung | `mandanten.test.js`, `mandanten-session.test.js`, `abnahme-a-ablauf.test.js` (gefälschte Rümpfe/Kennungen/ETags), `abnahme-c-module.test.js`; `e2e/abnahme-a-ablauf.spec.mjs` 1/5; **neu L2** (Antrag aus Betrieb G erscheint nicht, bleibt dort unberührt); `rechtematrix-zeilen` (CI) | HTTP-in, HTTP-Server, Browser | Leitung Nord/Süd sehen nur Eigenes; Anträge fremder Betriebe unsichtbar; Gestalt- und Schreibweg | volle Rechtematrix nur CI (`rechtematrix-zeilen`, groß) | belegt |
| 10 | Mobile Bedienung / PWA | `e2e/barrierefreiheit*.spec.mjs`, `abnahme-b-ablaeufe` (Telefonviewport, Bedienflächen ≥ 24 px, kein waagrechtes Scrollen); `pwa.test.js` (Manifest-Verknüpfungen, Zwischenspeicher-Regeln; gelesen) | Browser (Chromium-Emulation), Unit | Telefonbreite 390 px und Tablet 1024 px lokal; übrige sechs Viewports in der CI | Dienstarbeiter im Browser ist in der Suite **gesperrt** (`serviceWorkers: "block"`); Installation, iOS/Safari, echtes Gerät | teilweise |
| 11 | Wiederholte Anmeldung / Sitzungsablauf | `sitzungen`, `sitzungsbindung`, `sitzungsrennen`, `sitzungsinventar`, `sitzungsaufraeumen`, `sitzung-ohne-rolle`; `anmeldung-http` (gelesen); `sitzungsende-anmeldung` (#378); **neu L4a/L4b/L4c/L4d** | HTTP-in, Browser | Fristen, Widerruf, Rennen, Aufräumen; Browser: beim Server beendete Sitzung → altes Merkmal 401, schon das erste Laden zeigt die Anmeldung mit Hinweis „Deine Sitzung ist beendet“ (L4a, B-L4 behoben durch #378), Wiederanmeldung im angezeigten Feld zeigt die Daten (L4b); Sitzungsende bei offener Seite mit ausstehender Eingabe: kein Neuladen, Leiste „nicht gespeichert“, „Anmelden und senden“ speichert mit dem alten ETag, genau ein PUT, kein Konfliktdialog (L4c, B-L4c behoben durch #381); Anmeldung einer anderen Person → Eingabe verworfen, nichts gesendet, Neuladen (L4d) | Zeitablauf 30 min/12 h selbst nicht im Browser (Server-Uhr nicht vorstellbar) | belegt |

## 2. Läufe (lokal, 2026-11-19)

Dauer = Wandzeit inklusive Bau der Oberfläche und Einrichtung des Testservers (`global-setup.mjs`, rund 40–60 s je Playwright-Lauf).

### 2.1 Playwright (Chromium headless, `workers: 1`, ein Projekt je Lauf)

| Lauf | Ergebnis | Dauer |
|---|---|---|
| `npx playwright test --project=1024x768` (alle Specs, vor der neuen Datei) | **grün**: 23 bestanden, 5 übersprungen (B7/B8/B10 laufen nur in `390x844`, Listenprüfung nur in `360x740`), 0 rot | 407 s |
| `npx playwright test --project=390x844` (alle Specs inkl. neuer Datei) | **grün**: 21 bestanden (u. a. B7 Stempeln offline, B8 Krankmeldung zweistufig + Ruhezeit-Gegenprobe, B10 Monatsabschluss, Stempeluhr, Tastatur), 14 übersprungen (Strang A und neue Datei nur in `1024x768`, Listenprüfung), 0 rot | 281 s |
| `npx playwright test --project=1024x768 e2e/lokale-abnahme-luecken.spec.mjs` (Entwicklung, 4 Läufe) | 1. und 2. rot (Testfehler, §4), 3. rot (L4: Produktfehler B-L4 gefunden, §4), 4. grün mit L4a noch als `test.fail` | 82 s / 76 s / 107 s / 84 s |
| dieselbe Datei nach Review #377 (L3 mit 3000 ms ohne PUT-Anfrage, L4a prüft den heutigen Zustand ohne `test.fail`) | **grün**: 7 bestanden, 0 rot | 74 s |
| `npx playwright test --project=1024x768` (alle Specs inkl. neuer Datei, Abschluss) | **grün**: 30 bestanden (Stand vor Review #377, L4a damals als `test.fail`), 5 übersprungen, 0 rot — die neue Datei stört die übrigen Specs nicht (kein Dialog „Gleichzeitig bearbeitet“ im Demo-Betrieb) | 296 s |
| dieselbe Datei nach #378 auf `integration/release-v4` @ `a0fda313` (L4a umgekehrt, L4b ohne zweites Laden, neu L4c), Entwicklung, 4 Läufe | 1. ganze Datei: L4a/L4b grün, L4c rot — Produktfehler B-L4c gefunden (§4); 2. und 3. nur `-g "L0\|L4c"`: rot, im 3. mit Protokoll der API-Antworten (Ursache bestätigt: 409 „ohne Versionsangabe“); 4. `-g "L0\|L4c"` mit L4c auf heutigem Verhalten: grün | 78 s / 78 s / 66 s / 59 s |
| dieselbe Datei, Abschluss nach #378 (L4c auf heutigem Verhalten von B-L4c) | **grün**: 8 bestanden (L0–L5 inkl. L4a/L4b/L4c), 0 rot | 90 s |
| CI-Lauf 44551113318 (Kopf `623e35ce`) | **rot** nur L4a in `1024x768` (`#sitzungsende-hinweis` nie sichtbar), lokal grün. Vermutete Ursache (im Code plausibel, NICHT reproduziert, lokal nie rot; Hinweis auf einen Produktfehler gibt es nicht): Die Sitzung wurde bei OFFENER Seite beendet; eine Hintergrundanfrage konnte die 401 vor dem Neuladen des Tests bekommen (App lädt selbst neu und verbraucht den einmaligen Hinweis, oder hält die Seite wegen eines wartenden Schreibvorgangs und räumt nur das Merkmal). Korrektur: L4a/L4b verlassen die Seite vor dem Sitzungsende (`about:blank`, Merkmal bleibt im Reiter) und öffnen sie danach neu; L4c hält den PUT der Eingabe per `page.route` an, beendet dann die Sitzung und lässt ihn weiter (feste Reihenfolge ohne Zeitbezug) | — |
| dieselbe Datei nach der Korrektur | **grün**: 8 bestanden, 0 rot | 90 s |
| `npx playwright test --project=1024x768` (alle Specs, nach der Korrektur, Reihenfolge wie CI) | **grün**: 31 bestanden, 5 übersprungen, 0 rot | 426 s |
| dieselbe Datei nach #381 auf `integration/release-v4` @ `70f007b5` (L4c umgekehrt, neu L4d), frischer Bau | **grün**: 9 bestanden, 0 rot | 90 s |

Nach #378 zusätzlich einzeln (vitest, `--maxWorkers=1`): `sitzungsende-anmeldung.test.js` grün 8/8, `ci-abdeckung.test.js`
grün 8/8, `doku.test.js` grün 5/5. Die übrigen Specs wurden nach #378 lokal nicht erneut gelaufen (CI).
Nach #381 einzeln: `sitzungsende-anmeldung.test.js` grün 22/22, `ci-abdeckung.test.js` grün 8/8, `doku.test.js` grün 5/5.

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

Eine Datei, neun Tests, nur Projekt `1024x768` (Telefonschritte stellen die Seite auf 390x844 um; in den übrigen sieben
Projekten übersprungen, wie `abnahme-a-ablauf.spec.mjs`). Eingebunden ohne neue Skripte: `playwright.config.mjs` nimmt jede
`e2e/**/*.spec.mjs` auf, `npm run e2e` läuft im CI-Job `browser-abnahme` (`pruefung.yml`) und im Staging-Gate. Keine Änderung an
`hilfen.mjs`, `global-setup.mjs`, `axe-ausnahmen.json`, Allowlists oder Schaltern.

- **Eigene Betriebe:** Der Betreiber legt über die API zwei leere Betriebe an (L, G). Der Demo-Betrieb der übrigen Specs wird
  nicht beschrieben, damit dort kein Dialog „Gleichzeitig bearbeitet“ entsteht.
- **Deterministisch:** Tage relativ zum festen Abnahmetag (`abnahmeHeute`, `tagPlus`), keine Zufallsquelle; `Date.now()` nur für
  einen eindeutigen Raumnamen je Lauf (`// zeit-ok:` im Kopf). Gewartet wird auf Bedingungen (`expect.poll`, Netzruhe), mit einer begründeten Ausnahme.
  In L3 nützt Netzruhe direkt nach der Eingabe nichts, weil der Client erst `WARTE` = 1200 ms später schreibt
  (`src/speicher.js:28`). Der Test wartet dort bewusst 3000 ms, denn er prüft, dass ein PUT ausbleibt.
- **Synthetisch:** Marker `LueckeE2e`, `GegenE2e`, `SYNTH-URLAUB-L1`; Codes nie ausgegeben.
- **L3 hebt die Eigenprüfung des Fixtures auf** (`page.removeLocatorHandler` für „Gleichzeitig bearbeitet“), weil dieser Test den
  Konflikt absichtlich erzeugt. Für alle anderen Tests bleibt sie unverändert.
- **L4a ist nach #378 umgekehrt** (B-L4 behoben): Schon das erste Laden mit totem Merkmal zeigt die Anmeldung mit dem Hinweis
  `#sitzungsende-hinweis` („Deine Sitzung ist beendet …“, am Codefeld über `aria-describedby`), kein Ladegerüst, Merkmal
  geräumt; ein weiteres Laden zeigt den Hinweis nicht mehr (genau einmal). L4b meldet sich direkt im angezeigten Feld wieder an,
  ein zweites Laden ist nicht mehr nötig.
- **L4c ist nach #381 umgekehrt** (B-L4c behoben): Sitzungsende bei offener Seite mit ausstehender Eingabe → kein Neuladen
  (Marke im Fensterzustand bleibt), PUT 401, Leiste „nicht gespeichert“ mit Codefeld und „Als Datei sichern“, Server
  unverändert; „Anmelden und senden“ mit demselben Code → genau ein weiterer PUT, 200, mit dem ETag des abgewiesenen PUT;
  Leiste weg, Eingabe auf dem Server, kein Dialog „Gleichzeitig bearbeitet“ (die Eigenprüfung des Fixtures bleibt in L4c
  aktiv), dieselbe Seite. Feste Reihenfolge ohne Zeitbezug: Der PUT der Eingabe wird per `page.route` angehalten, dann endet
  die Sitzung, dann geht er weiter.
- **L4d (neu, Gegenfall):** derselbe Anfang, aber in der Leiste meldet sich die Beschäftigte a1 an (anderer Inhaber) → keine
  PUT-Anfrage mehr, Server unverändert, die Seite lädt neu (Lage „fremd“) und zeigt den Stand von a1. Die Meldung „fremd“
  steht nur bis zum Neuladen und wird deshalb nicht abgefragt, sondern ihre Folgen.
- **Gegenprobe L3:** Dieselbe Eingabe (Wechsel der Darstellungsdichte) löst im selben Test vorher den PUT aus, der den 409 bekommt.
  Fehlte die Sperre, ginge nach `WARTE` = 1200 ms eine PUT-Anfrage hinaus. Der Test zählt Anfragen, nicht Antworten, und würde
  innerhalb der 3000 ms rot.

| Test | Inhalt |
|---|---|
| L0 | Einrichtung (Browser-Erstanmeldung der Leitung, Personal/Einladungen per API, Betrieb G mit offenem Antrag) |
| L1 | Urlaubsantrag am Telefon: Fehlerfall „Ende vor Beginn“ (`aria-invalid`, Blatt bleibt offen), gültiger Antrag genau einmal |
| L2 | Genehmigung durch die Planung; Antrag aus G unsichtbar und unberührt; Beschäftigte sieht „genehmigt“ |
| L3 | 409 → Konfliktfenster → „Später entscheiden“ → weitere Eingabe: 3000 ms keine PUT-Anfrage → fremde Änderung bleibt → „Neu laden“ |
| L4a | B-L4 behoben (#378): erstes Laden nach Sitzungsende zeigt die Anmeldung mit Hinweis „Deine Sitzung ist beendet“, kein Ladegerüst; Hinweis genau einmal |
| L4b | Altes Merkmal 401; Anmeldung mit Hinweis; Wiederanmeldung im angezeigten Feld zeigt die Daten (kein zweites Laden) |
| L4c | B-L4c behoben (#381): Sitzungsende bei offener Seite mit ausstehender Eingabe: kein Neuladen, Leiste mit Anmeldung; „Anmelden und senden“ → genau ein PUT 200 mit altem ETag, Eingabe auf dem Server, kein Konfliktdialog |
| L4d | Sitzungsende, dann Anmeldung einer anderen Person: Eingabe verworfen, keine PUT-Anfrage, Server unverändert, Neuladen |
| L5 | Import-Fehlerfall: nur fehlerhafte Zeile → gesperrt; gemischt → genau die gültige Person auf dem Server |

## 4. Befunde

### B-L4 (Produktfehler, mittel, UX): Nach Sitzungsende bleibt die Seite auf dem Ladegerüst — **behoben durch #378, nicht mehr offen**

**Stand nach #378** (`integration/release-v4` @ `a0fda313`): Bei 401 meldet `src/speicher.js` das Sitzungsende an
`src/app/sitzungsende.js`; ohne Ausstehendes lädt die Seite neu und zeigt die Anmeldung mit Code und dem Hinweis
`#sitzungsende-hinweis` („Deine Sitzung ist beendet …“), genau einmal. Mit Ausstehendem bleibt die Seite (Leiste „nicht
gespeichert“). Belegt im Browser durch L4a/L4b (umgekehrt) und L4c, unterhalb des Browsers durch
`pruefungen/sitzungsende-anmeldung.test.js`. Der folgende Befundtext ist der Stand vor #378 (Fundbericht).

Reproduziert und als damaliges Verhalten festgehalten in L4a (lokal, Chromium, 1024x768): Anmelden, Sitzung beim Server beenden (wie Ablauf nach 30 min Untätigkeit,
12-h-Frist oder Abmelden/Entzug auf einem anderen Weg), Seite neu laden → dauerhaft „CENTRIC wird geladen“ (Ladegerüst), keine
Anmeldung, kein Hinweis. Erst ein **zweites** Neuladen zeigt die Anmeldung. Kein Datenverlust (es wird nichts gesendet), aber für
Beschäftigte am Telefon wirkt die App „hängend“.

Ursache (gelesen, nicht geändert):
- `src/speicher.js:86` — `ruf()` ruft bei 401 `abmelden(true)` (Merkmal geräumt) und wirft `nicht-angemeldet`, ohne die
  Oberfläche zu benachrichtigen.
- `src/App.jsx:1187` — der Ladelauf verschluckt genau diesen Fehler (`!== "nicht-angemeldet"`), `db` bleibt `null`.
- `src/App.jsx:1675` — `if (!db)` zeigt das Ladegerüst; `src/main.jsx:623` hält `an` (angemeldet) aus dem Start fest und wechselt
  nicht zur Anmeldung.

Vorschlag damals: nach `nicht-angemeldet` im Ladelauf auf die Anmeldung wechseln und einen Hinweis zeigen — umgesetzt in #378,
L4a ist umgekehrt. Der damals offene Fall **ohne** Neuladen (Sitzung endet, während die Seite offen ist und gespeichert wird)
ist jetzt L4c und hat B-L4c ergeben.

### B-L4c (Produktfehler, mittel): „Anmelden und senden“ nach Sitzungsende endet im Konfliktdialog — **behoben durch #381, nicht mehr offen**

**Stand nach #381** (`integration/release-v4` @ `70f007b5`): `src/speicher.js` merkt sich beim Sitzungsende den ETag samt
Inhaber der Sitzung; meldet die neue Anmeldung denselben Inhaber, geht der Auftrag mit dem alten ETag hinaus (der Server
entscheidet), bei einem anderen Inhaber werden die Eingaben verworfen und die Seite lädt neu (Lage „fremd“). Belegt im Browser
durch L4c (umgekehrt) und L4d, unterhalb des Browsers durch `pruefungen/sitzungsende-anmeldung.test.js`. Der folgende
Befundtext ist der Stand vor #381 (Fundbericht).

Gefunden mit L4c (lokal, Chromium, 1024x768, nach #378): Planung auf „Einstellungen“, Sitzung beim Server beendet, Eingabe
(Dichte) → PUT 401 → Leiste „Die Sitzung ist abgelaufen — die letzten Änderungen sind noch nicht gespeichert“ (richtig, kein
Neuladen, Eingabe bleibt im Reiter). Code eingeben, „Anmelden und senden“ → `POST /api/anmelden` 200, danach
`PUT /api/bestand` **409** „Der Stand ist ohne Versionsangabe nicht überschreibbar. Bitte neu laden.“ → Dialog „Gleichzeitig
bearbeitet“, obwohl niemand anders geschrieben hat. Kein stiller Datenverlust (Server unverändert, Eingabe im Reiter, „Als
Datei sichern“ bleibt), aber der angebotene Weg führt nicht zum Speichern, und „Neu laden“ im Dialog verwirft die Eingabe.

Ursache (gelesen, nicht geändert): `src/speicher.js` `abmelden(true)` setzt neben dem Merkmal auch `etag = null`; es wird von
`sitzungEndet()` bei jeder 401 gerufen. `nochmalSchreiben()` schickt den Auftrag danach ohne Versionsangabe. Der Fehler
bestand vermutlich schon vor #378 (401 → `abmelden(true)` gab es dort auch); `pruefungen/sitzungsende-anmeldung.test.js` „O“
prüft die Leiste, nicht das anschließende Senden.

Vorschlag damals (umgesetzt in #381): beim stillen Abmelden wegen 401 mit ausstehendem Auftrag den ETag des Auftrags behalten (oder
nach der Wiederanmeldung vor dem Senden den Stand lesen und nur bei unverändertem Kern senden); danach L4c umkehren (Leiste
verschwindet, Eingabe liegt auf dem Server) und „O“ in `sitzungsende-anmeldung.test.js` um das Senden ergänzen.

### Keine weiteren Produktfehler

Alle übrigen Läufe grün (§2). Drei Entwicklungsläufe der neuen Spec waren rot. Der dritte war der Fund von B-L4. Die ersten
beiden waren Fehler des Tests, nicht des Produkts: (1) zweite Anmeldung in derselben Seite fand kein Eingabefeld, weil das Merkmal der vorigen Rolle im Reiterspeicher lag —
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
