# Lokale End-to-End-Abnahme der Hauptfunktionen (2026-11-20)

> **Lokale Abnahme, keine Staging-Abnahme.** Fortsetzung von [LOKALE-E2E-ABNAHME-2026-11-19.md](LOKALE-E2E-ABNAHME-2026-11-19.md).
> Alle Läufe gegen eine isolierte, lokal gestartete Instanz (`server.mjs` auf 127.0.0.1 aus `e2e/global-setup.mjs`,
> Wegwerf-Datenordner, nur synthetische Daten, feste Abnahmeuhr Samstag 2026-11-14, 10:00 Berlin). Staging, VPS und
> Produktion wurden weder berührt noch geprüft. Kein Schalter eingeschaltet, keine Migration, keine bestehende Prüfung,
> axe-Ausnahme, Allowlist oder Workflow geändert, nichts in `src/` oder `server/` geändert.

| | |
|---|---|
| Basis | `integration/release-v4` @ `b621fd90` |
| Umgebung | Windows 11, Node 24.18.0, Git Bash, Playwright 1.64.1 Chromium headless, `workers: 1`, ein Projekt je Lauf |
| Neue Dateien | `e2e/hauptfunktionen-personal-plan.spec.mjs`, `e2e/hauptfunktionen-zeit-abrechnung.spec.mjs`, `e2e/hauptfunktionen-import.spec.mjs`, `e2e/pwa-dienstarbeiter.spec.mjs` |

## 1. Einbindung ohne Workflow-Änderung (vorab geprüft)

- `playwright.config.mjs`: `testDir: "./e2e"`, `testMatch: "**/*.spec.mjs"` — jede neue `e2e/*.spec.mjs` läuft mit.
- CI: Job `browser-abnahme` in `.github/workflows/pruefung.yml` ruft `npm run e2e` (= `playwright test`, alle acht
  Projekte); das Staging-Gate nutzt denselben Aufruf. Kein neues npm-Skript, darum keine Änderung an der Sammelprüfung
  `pruefung` und an `pruefungen/ci-abdeckung.test.js` nötig (Ergebnis: grün, §3).
- Dienstarbeiter: Die Konfiguration sperrt ihn (`serviceWorkers: "block"`). **Nur** `pwa-dienstarbeiter.spec.mjs` erlaubt
  ihn per `test.use({ serviceWorkers: "allow" })`; Playwright gibt jedem Test einen eigenen Browserkontext, die
  Registrierung reicht in keine andere Spec. Die Konfiguration bleibt unverändert.
- Staging-Gate (fremder Container, echte Uhr, Versatz 0): Die beiden kalendergebundenen Dateien (Personal/Plan,
  Zeit/Abrechnung) überspringen sich dort ausdrücklich (`test.skip(!versatzMs(), …)`), statt nicht-deterministisch zu werden.
- Schreibende Abläufe nur im Projekt `1024x768` (PWA nur `390x844`), in den übrigen Projekten übersprungen — wie
  `abnahme-a-ablauf` und `lokale-abnahme-luecken`. Jede schreibende Datei legt über die Betreiber-API einen **eigenen leeren
  Betrieb** an; der Demo-Betrieb der übrigen Specs wird nicht beschrieben (kein Dialog „Gleichzeitig bearbeitet“).

## 2. Matrix (Nachtrag zu §1 der Abnahme vom 2026-11-19)

Stufen wie dort: **belegt** = Kernablauf lokal im Browser oder mit echtem Server nachgewiesen und in diesem Auftrag
gelaufen; **teilweise**; **Lücke**. Neu in diesem Auftrag fett.

| # | Bereich | Neu belegt (Test) | Ebene | Stufe vorher → jetzt | Später produktionsnah |
|---|---|---|---|---|---|
| 2 | Personal anlegen / bearbeiten / löschen | **H1**: Fehlerfall ohne Namen (Meldung, `aria-invalid`, Fokus; „nichts gespeichert“ an der folgenden gültigen Speicherung geprüft: genau eine Person); Anlegen mit Eintritt; Wochenstunden in der Akte; „Austritt eintragen“ mit Rückfrage — abgebrochen → kein Austritt (geprüft, nachdem eine weitere Änderung nachweislich auf dem Server angekommen ist, nicht nach Netzruhe), bestätigt (Datum) → Server, Liste „ausgetreten“, Filter „Ausgetreten“. **H2** Rechte: Betriebsrat sieht Liste, kein „Person hinzufügen“/„Importieren“, in der Akte kein „Austritt eintragen“, keine Wochenstunden-Eingabe | Browser + Server | teilweise → **belegt (ohne endgültiges Löschen)** | endgültiges Löschen (Löschlauf, §5) |
| 3 | Excel-Import inkl. Fehlerfälle | **I1** Textweg gemischt: fehlerfreie Zeile übernommen (Wochenstunden, Eintritt, Einheit); fehlender Nachname, ungültiges Datum `2025-13-45`, Dublette nicht übernommen; Zähler der Vorschau; Zeile mit neuer Einheit ohne Haken fehlerhaft, mit Haken (Leitung) angelegt (Befund **B-I1**, behoben in PR #412; **I1b** Planung ohne Haken). **I2** Abbrechen in der Vorschau übernimmt nichts, leer → „Prüfen“ gesperrt | Browser + Server | teilweise → teilweise (Dateiweg weiter aus) | XLSX-Dateiweg im Browser (Schalter `IMPORT_DATEI_AKTIV`/`CENTRIC_IMPORT_AKTIV`, Freigabe nötig) |
| 4 | Schichtmodelle und Dienstplanung | **H3** Dienstart (Leitung): Fehlerfall Mindestbesetzung leer (danach genau eine Dienstart mit Mindestbesetzung, auch nach dem Abwarten aller PUT der Seite), Anlegen, Bearbeiten der Zeiten; Planung ohne „Dienstarten“. **H4** Schichtfolge: 3-Wochen-Zyklus mit der neuen Dienstart belegt → alle 30 Tage im Monatsplan, Tagesblatt nennt neue Zeiten und teilt ein (vorher 0 Tage). **H5** Tagesblatt: „Raus“, „+ S“ (Serverstand per Poll; „nur angenommene PUT“ erst nach dem Abwarten aller PUT der Seite); Ruhezeit 9 h ausdrücklich über die API → 403. **H5b** Befund **B-H5** | Browser + Server | teilweise → **belegt** (mit Befund B-H5) | — |
| 7 | Zeiterfassung / Pausen / Zuschläge | **Z1** Ein-/Ausstempeln am Rechner (Frühdienst heute); Pause vorbelegt 30; ungültige Pause 999 → Stempel bleibt, ohne Pause, `PAUSE_UNGUELTIG`; Ist-Zeit bleibt Prüffall (`DAUER_NULL`/`PAUSE_ZU_LANG`, nie still bestätigt); Leitung sieht „Pausenangabe ungültig — ohne Pause gespeichert“. **Z2** Vollschreibweg: Pause `""`, 240, 90 bei 60 min Anwesenheit → **422 `PAUSE_UNGUELTIG`**, nichts gespeichert; 60 → 200. **Z3** Zuschläge im Browser: Sonntag aus dem Plan, Gegenprobe 0,0; „Gearbeitet“ 7,0 durch die Pause | Browser + HTTP-Server | teilweise → **belegt** (Beobachtung B-Z3) | — |
| 8 | Abrechnung / Exporte | **Z4** „Export“ mit offenem Prüffall: Rückfrage (nennt Prüffall, Tag, „Trotzdem jetzt ausgeben?“); abgebrochen → kein Download; bestätigt → `zuschlaege_2026-11.csv` heruntergeladen und gelesen (Kopf, Zeilen, Werte). „Blatt zum Gegenlesen“ (Lohnausgabe) heruntergeladen: Prüffall „zur Prüfung, Planzeit vorläufig“ gekennzeichnet | Browser (Download) | Lücke → **belegt** | Lohnausgabe-CSV (DATEV) gegen echtes Lohnprogramm |
| 9 | Rechte- und Mandantentrennung | H2 (Betriebsrat), H3 (Planung ohne Dienstarten); **I3** Leitung des Demo-Betriebs liest ihren Bestand: keine Person/kein Name des Import-Betriebs (Gegenprobe: dort vorhanden) | Browser, HTTP-Server | belegt → belegt (erweitert) | volle Rechtematrix weiter nur CI (`rechtematrix-zeilen`) |
| 10 | Mobile Bedienung / PWA | **P1** `/sw.js` registriert (Bereich `/`), aktiv, steuert die Seite; `centric-schale-*` und Bestand in `centric-daten-*`; Manifest lesbar. **P2** offline: Neuladen aus dem Gerüst zeigt den gespeicherten Stand der Person statt der Fehlerseite; Gegenprobe Rechneransicht („Mehr“ → „Rechneransicht“): Leiste „Keine Verbindung“ erscheint; zurück in der Telefonansicht fehlt sie — Befund **B-P2** (behoben in PR #410: Leiste auch in der Telefonansicht; Folgepunkt **B-P3** offen) | Browser (Chromium 390x844, Dienstarbeiter erlaubt) | teilweise → **belegt** (lokal, Chromium) | Installation, iOS/Safari, echtes Gerät, Aktualisierung des Dienstarbeiters |
| 11 | Wiederholte Anmeldung / Sitzungsablauf | **P3** Abmelden im Browser („Mehr“ → „Abmelden“): Anmeldung erscheint, Bestand aus dem Zwischenspeicher entfernt, altes Merkmal beim Server 401 | Browser | belegt → belegt (erweitert) | Zeitablauf 30 min / 12 h in Echtzeit |

## 3. Läufe (lokal, 2026-11-20)

Dauer = Wandzeit inklusive Bau und Testserver-Einrichtung (`global-setup.mjs`, rund 40–50 s; mit vorgebautem `E2E_DIST`
rund 10 s). In der CI läuft die Einrichtung einmal für alle Specs; dort zählt die reine Testzeit (Spalte „Tests“).

| Lauf | Ergebnis | Tests | Wandzeit |
|---|---|---|---|
| Entwicklung, `E2E_DIST` vorgebaut, Port 3291, je Datei einzeln | rot → grün; Testfehler (Tagesblatt öffnet auf der ersten Dienstart, falscher Pausen-Grenzwert, KPI-Zählung) und die Befunde B-H5, B-I1, B-P2, B-Z3 (§4) | — | 35–134 s je Lauf |
| Abschluss `npx playwright test e2e/hauptfunktionen- --project=1024x768`, frischer Bau | **grün**: 16 bestanden (H0–H5b, Z0–Z4, I0–I3), 0 rot | 3,9 min | 246 s |
| Abschluss `npx playwright test e2e/pwa-dienstarbeiter.spec.mjs --project=390x844`, frischer Bau | **grün**: 2 bestanden (P1+P2, P3), 0 rot | 1,0 min | 70 s |
| Nach Review (#390 H1/H3/H5 an Bedingungen statt Netzruhe; #392 P2 mit Gegenprobe Rechneransicht), frischer Bau, je Datei | **grün**: `hauptfunktionen-personal-plan` 7/7 (1024x768), `pwa-dienstarbeiter` 2/2 (390x844); #391 nur Kommentare/Meldungstexte geändert | 2,6 min / 2,6 min (Rechner zeitgleich ausgelastet) | 172 s / 170 s |

CI-Laufzeit: Der Job `browser-abnahme` braucht heute rund 25 der 40 min Zeitgrenze. Erwartete Mehrzeit: rund 4–5 min Testzeit
im Projekt `1024x768` und rund 1 min in `390x844` (CI-Runner mit 2 Kernen eher am oberen Rand); in den übrigen sechs
Projekten werden die Tests übersprungen (Sekundenbruchteile). Danach rund 30–31 von 40 min — Reserve vorhanden, aber
weitere schreibende Abläufe sollten in denselben Projekten bleiben.

vitest einzeln (`--maxWorkers=1`): `doku.test.js` grün 5/5, `ci-abdeckung.test.js` grün 8/8. eslint auf den vier neuen Dateien ohne Befund.

## 4. Befunde (nicht repariert — `src/` und `server/` unverändert; die Tests prüfen das heutige Verhalten ausdrücklich)

### B-H5 (Produktfehler, hoch, Arbeitszeitrecht; **behoben in PR #397**): Ruhezeitsperre greift nicht, wenn eine Abweichung entfernt wird

**Stand 2026-11-20 (Nachtrag):** Behoben in PR #397 (Server prüft gelöschte Abweichungen ab heute). Die Spec H5b erwartet jetzt 403 mit dem Text „Einteilung am T2 nicht möglich: Ruhezeit unter 11 Stunden.“, und `a1|T2` bleibt `-`. Der Befundtext darunter beschreibt den Zustand vor der Behebung.

Belegt in **H5b**. Ausgangslage: Beschäftigte am Tag T1 im Spätdienst (14–22 Uhr, ausdrückliche Abweichung), am Folgetag T2
„frei“ (Abweichung `-`); die Schichtfolge sieht an T2 den Dienst ZX ab 07:00 vor. Die Planung tippt im Tagesblatt von T2
„+ ZX“. Die Oberfläche löscht die Abweichung (`setzeAbweichung`: der Wert gleicht dem Plan, `src/app/aktionen/plan.js:52`),
der Server nimmt den PUT mit **200** an — Ergebnis: 9 h Ruhezeit nach dem Spätdienst. Dieselbe Einteilung **ausdrücklich**
(`abweichungen[a1|T2] = ZX`) weist der Server mit 403 „Ruhezeit unter 11 Stunden“ ab (Gegenprobe in H5).

Ursache (gelesen, nicht geändert): `server/lib/schutzdurchsetzung.mjs` sammelt die zu prüfenden Zellen nur aus den Schlüsseln
der **neuen** Abweichungen (`for (const k in neuAbw)`, um Zeile 398); ein entfernter Schlüssel (Rückkehr zur Schichtfolge)
wird nicht als geänderte Einteilung geprüft, solange die Änderung nicht als strukturell gilt.

**Analyse liegt vor** (Koordination, `b-h5-analyse.md`): Kategorie A. Fix Stufe 1: gelöschte Abweichungen ab heute als
geänderte Zellen mit dem Planwert prüfen; Stufe 2: dasselbe für entfernte Abwesenheiten; Aufwand rund 1,5–2,5 PT. Das
Fix-Paket wird separat gebaut. Nebenbefund dort: `/api/wiederherstellen` ohne Fachprüfung — Kategorie C, auf die
Entscheidungsliste. Der Test H5b bleibt bis dahin auf dem heutigen Verhalten und wird **nach der Behebung umgekehrt**
(403, Abweichung bleibt `-`).

### B-I1 (Produktfehler, mittel, UX/Import): „Fehlende Einheiten … mit anlegen“ wirkt nicht

Belegt in **I1**. Eine Importzeile mit noch unbekannter Einheit erhält in `importPruefen` (`src/lib/fachlogik.js`, Zeile 2004 auf `integration/release-v4` @ `afb1a68b`, nachgezählt mit
`grep -n`; die Zeile davor prüft „Vorname fehlt“)
den Fehler „Einheit „…" unbekannt“ und ist damit nicht übernehmbar; gleichzeitig zählt die Vorschau „Neue Einheiten 1“ und
bietet den (angehakten) Schalter „Fehlende Einheiten und Qualifikationen mit anlegen“ an. `importieren`
(`src/app/aktionen/stammdaten.js:86`) würde die Einheit anlegen, bekommt die Zeile aber nie. Kein Datenverlust (nichts
Falsches gespeichert), aber der angebotene Weg führt nicht zum Ziel. Nach Behebung I1 umkehren (Übernehmbar 2, Zeile mit
neuer Einheit angelegt).

**Behoben (PR #412):** Mit Haken (nur Leitung, `org.edit`; Vorgabe aus) ist eine unbekannte Einheit kein Fehler mehr, sondern „wird neu angelegt“ und wird beim Übernehmen genau einmal angelegt (Regel wie im Dateiimport IMP-5). I1 ist umgekehrt, I1b prüft die Planung ohne Haken. Verhaltensänderung: Bisher war der Haken für jede Rolle vorab gesetzt, unbekannte Qualifikationen wurden damit auch für die Planung ohne bewusste Wahl angelegt (nur bei abgewähltem Haken still weggelassen); jetzt ist eine unbekannte Qualifikation ohne Haken bzw. ohne `org.edit` ein Fehler mit Hinweis (Zuordnungskonflikt wie IMP-5). Offene Rechtefrage zur Serverseite: `ENTSCHEIDUNGSLISTE.md` P2-22.

### B-P2 (Produktfehler, mittel, Sicherheit der Information, behoben in PR #410): Offline-Hinweis fehlte in der Telefonschale

Belegt in **P2** (390x844, Beschäftigte; nicht vakuös: dieselbe Seite zeigt die Leiste in der Rechneransicht, die App hat das Offline-Lesen also erkannt). Ohne Netz startet die Anwendung aus dem Gerüst und zeigt den gespeicherten Stand —
richtig —, aber ohne die Leiste „Keine Verbindung … Der angezeigte Stand wurde … geholt“ (`Offlineleiste`,
`src/ansichten/speicherlage.jsx`). Sie ist nur im Hauptbereich der Rechneransicht eingehängt (`src/App.jsx`, `<Offlineleiste
lage={offline} />`), nicht in `MobilSchale`. Der Kommentar in `public/sw.js` verspricht ausdrücklich, dass die Anwendung sagt,
dass sie offline ist und wie alt der Stand ist. Nach Behebung P2 umkehren (Leiste sichtbar).

**Behoben (PR #410):** `MobilSchale` bekommt die Leiste als `hinweise` und zeigt sie über jedem Reiter; P2 ist umgekehrt
(Leiste in der Telefonansicht und im Reiter „Mehr“ sichtbar, kein waagrechtes Scrollen bei 390 und 320 px, nach Rückkehr
online verschwunden; Rechneransicht nur noch Parallelprobe). Prüfung: `pruefungen/offlinehinweis-telefon.test.js`.

### B-P3 (Produktfehler, mittel, offen): Speicherfehler-Leiste in der Telefonschale nicht sichtbar

Beim Review von B-P2 gefunden (PR #410). Die Leiste „Nicht gespeichert“ (`NichtGespeichert`, `src/ansichten/speicherlage.jsx`)
ist wie früher die Offlineleiste nur im Hauptbereich der Rechneransicht eingehängt (`src/App.jsx`), nicht in `MobilSchale`.
Scheitert am Telefon ein Speichervorgang (Sitzungsende, Netz, 403, Konflikt), sehen Beschäftigte keine stehende Leiste mit
Ausweg („Als Datei sichern“, neu anmelden, neu laden). Noch nicht im Browser belegt; Behebung und E2E-Beleg offen.

### B-Z3 (Beobachtung, fachlich zu klären — kein bestätigter Fehler)

Belegt in **Z3/Z4**. Die Zuschlagsstunden (Sonntag) eines geplanten Frühdienstes 06:00–14:00 mit 30 min Pause betragen 8,0,
die gearbeiteten Stunden 7,5: Zuschlagsanteile rechnen die Anwesenheit ohne Pausenabzug
(`server/lib/isteinfrieren.mjs`, `zuschlagTagAddieren`/`tagesanteile`). Ob das gewollt ist (Pause nicht verortet) oder die
Pause anteilig abgezogen werden muss (§ 3b EStG: zuschlagsfähig ist tatsächlich geleistete Arbeit), entscheidet die
Fachseite. Der Test hält 8,0 fest und ist als „nach fachlicher Klärung ggf. umkehren“ markiert (dann 7,5 in Z3 und Z4).

### Hinweis zum Auftrag „ungültige Pause 422 PAUSE_UNGUELTIG“

Über die Oberfläche entsteht kein 422: Die Stempeluhr schickt die Pause an `/api/stempeln`; der Server speichert den Stempel
**ohne** Pause und kennzeichnet ihn `PAUSE_UNGUELTIG` (ein Stempel geht nie verloren, `server/funktionen/daten.mjs`). Das 422
mit `code: PAUSE_UNGUELTIG` gibt es nur auf dem Vollschreibweg `PUT /api/bestand` (`erfassungPauseFehler`,
`server/lib/gestalt.mjs`); die Oberfläche schreibt dort keine Pause. Beides ist belegt (Z1 Browser, Z2 HTTP).

### Stand der Befunde (Nachtrag 2026-11-20)

| Befund | Stand |
|---|---|
| B-H5 (H5b) | behoben, PR #397 gemergt |
| B-I1 | PR #412 offen (zum Zeitpunkt dieses Nachtrags noch nicht gemergt) |
| B-P2 | behoben, PR #410 gemergt |
| B-P3 | offen |
| B-Z3 | fachlich offen (Entscheidung der Fachseite) |

### Wechselwirkung Integration-Regression #389 × #390 (behoben mit #399)

Die Namenskorrekturen aus #389 (zugängliche Namen) und die E2E-Locator aus #390 wurden getrennt geprüft; auf dem
Integrationskopf passten Namen und Locator nicht mehr zusammen (Regression). Behoben mit PR #399. Lehre: nach UI- und
Namensänderungen die E2E-Suite in der CI gegen den aktuellen Integrationskopf prüfen, nicht nur gegen den Zweig. Ebenso:
neue oder geänderte Testdateien der Prozesswachen (`prozess-wachen.test.js`) lokal laufen lassen (Lehre aus #410).

## 5. Restlücken

| Punkt | Warum | Wohin |
|---|---|---|
| XLSX-Dateiimport im Browser | `IMPORT_DATEI_AKTIV`/`CENTRIC_IMPORT_AKTIV` aus; Einschalten nur mit Freigabe | nach Freigabe lokal, sonst produktionsnah |
| PWA-Installation, iOS/Safari, Dienstarbeiter-Aktualisierung, echtes Gerät | Chromium-Emulation | produktionsnah (Phase D) |
| Sitzungsablauf in Echtzeit (30 min / 12 h) | Serveruhr nicht vorstellbar | produktionsnah; Fristen in `sitzungen.test.js` |
| Endgültiges Löschen einer Person | Die Oberfläche kennt nur „Austritt“; Löschen läuft über Aufbewahrung/Löschlauf (`datenschutz`, Teilweg) | eigener Auftrag (Löschlauf ist Teilweg-gebunden) |
| Korrektur einer Ist-Zeit mit Pause durch die Leitung im Browser | nicht in diesem Auftrag | nächster Schritt |
| Lohnausgabe-CSV (DATEV) inhaltlich, Monatsabschluss mit Export | nur Zuschläge-CSV und Gegenleseblatt gelesen | nächster Schritt; B10 deckt den Abschluss |
| Die sechs weiteren Viewports | Speicher; die neuen Abläufe laufen bewusst nur in einem Projekt | CI |
