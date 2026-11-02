# WP-33 Nachweis — Testinfrastruktur (Sammelprüfung, Playwright, axe, Offline)

Stand: 2026-11-02 · Branch `acc45/qa/wp33-testinfrastruktur` (Basis `origin/integration/centric-complete` @ `274bfa0`) · Agent F2 · kein VPS, kein PR

## 1. Sammelprüfung

**Vorher:** `npm run pruefung` ließ 14 Suiten aus, die nur in `.github/workflows/pruefung.yml` liefen:
`accounts`, `account-isolation`, `registrierung`, `starten`, `provisionierung`, `registrierung-http`,
`registrierung-schalter`, `passwort-http`, `accountanmeldung`, `anmeldung-http`, `betriebsauswahl`,
`generation`, `arbeitssitzung`, `sicherung-ablage`. (Die HTTP-Suiten der CI — `rechte`, `*-http`,
`verwalter`, `demo`, `sicherung`, `bremse` — sind in der Kette über `pruefung:serverlauf` abgedeckt;
`build` ist keine Prüfung.)

**Nachher:** Die 14 Suiten stehen in der Kette (vor `pruefung:serverlauf`). Neu
`werkzeug/pruefkette-abgleich.mjs` + `pruefungen/pruefkette-abgleich.test.js` (`npm run pruefung:pruefkette`):

- jede `npm run …` der CI muss in der Kette stehen — direkt oder über `serverlauf` (`node pruefungen/<n>.mjs` ⇔ `serverlauf.mjs <n>`);
- jedes Kettenglied muss in der CI laufen, jedes `serverlauf`-Glied hat einen CI-Schritt mit demselben Ziel;
- kein `pruefung:*`-Skript steht in keiner der beiden Listen; Kettenglieder sind nur `npm run`.
- Ausnahmen mit Begründung im Werkzeug (`build`, `pruefung:serverlauf`).

Der Abgleich ist ein neuer Schritt in `pruefung.yml` direkt nach `npm ci` und das zweite Glied der Kette.
Der Test hat 9 synthetische Fälle (jede Abweichungsart) und einen Fall gegen die echten Dateien.
Gegenprobe: Vor der Ergänzung meldete das Werkzeug genau die 14 Suiten oben (Exit 1).

## 2. E2E-Suite (Playwright 1.64.1, @axe-core/playwright 4.14.0, nur Chromium)

Aufbau, Datenschutz der Suite und Erweiterung: `docs/TESTEN-E2E.md`.

### Ergebnis CI (Run 41496017560, Commit `674d1c0`; Prüfung 41496017202 und Sicherheit 41496017474 ebenfalls grün): 120 Tests — 88 bestanden, 8 als bekannt markiert (erwartet gescheitert), 24 übersprungen (Bildschirm nicht vorgesehen), 0 unerwartet

| Datei | Telefon 390×844 | Tablet 768×1024 | Desktop 1280×800 |
|---|---|---|---|
| anmeldung (7 Rollen + falscher Code) | 8 ✓ | 8 ✓ | 8 ✓ |
| rollen: Start + Kern ohne Konsolenfehler (6 Rollen) | 6 ✓ | 6 ✓ | 6 ✓ |
| rollen: kein waagerechtes Scrollen (6 Rollen) | 6 ✓ | 2 ✓, 4 bekannt | 6 ✓ |
| rollen: Abrechnungsdaten / Handbuch laden | 2 ✓ | 2 ✓ | 2 ✓ |
| rollen: Abrechnungsdaten / Handbuch ohne Überlauf | 2 bekannt | 2 bekannt | 2 ✓ |
| datenschutz (Gegenprobe, MA, BR) | 3 ✓ | 3 ✓ | 3 ✓ |
| stempeln (online, offline) | 2 ✓ | – | – |
| offline (Dienstarbeiter, Plan ohne Netz) | – | – | 2 ✓ |
| axe (9 Ansichten) | 2 ✓ | – | 9 ✓ |

Rollen: leitung, planer, subplaner (Schichtverantwortung), mitarbeiter, betriebsrat, betreiber, kunde
(kunde nur Anmeldung — die Rolle landet auf der Personenauswahl).

### Bekannte Darstellungsbefunde (`test.fail()` in `e2e/rollen.spec.mjs`)

| Bildschirm | Ansicht | Messung CI | Herkunft |
|---|---|---|---|
| Telefon 390 | Abrechnungsdaten | Seite 602 px; Segmentleiste „Zuschläge … Stempelbefunde“ | bekannt (Browsertest Kette B: 601 px) |
| Telefon 390 | Handbuch | Seite 614 px; Fließtext-Spannen | bekannt (Kette B: 620 px) |
| Tablet 768 | Start/Kern von Leitung, Planung, Schichtverantwortung, Betriebsrat; Abrechnungsdaten; Handbuch | Seite 772 px; Knopf „Feldmodus“ in der Kopfleiste ragt 4 px hinaus (lokal 771 px) | **neu, mit WP-33 gefunden** |

Hinweis zur Messung: Am Telefon (isMobile) wächst `innerWidth` mit zu breitem Inhalt mit (601 statt 390).
Die Vorgabe `scrollWidth <= innerWidth` wäre dort immer wahr; die Suite vergleicht deshalb mit der
eingestellten Fensterbreite. Ohne diese Korrektur hätten die Telefon-Befunde „bestanden“.

### Barrierefreiheit (axe, WCAG 2.0/2.1 A/AA + best-practice) — CI-Lauf

| Ansicht | critical | serious | moderate | minor |
|---|---|---|---|---|
| anmeldung (Desktop, Telefon) | 0 | 0 | 2 | 0 |
| leitung-start | 0 | 0 | 1 | 0 |
| leitung-monatsplan | 1 (select-name, bekannt) | 0 | 1 | 0 |
| planer-monatsplan | 1 (select-name, bekannt) | 0 | 1 | 0 |
| subplaner-lagebild | 0 | 1 (scrollable-region-focusable) | 1 | 1 |
| betriebsrat-start | 0 | 0 | 1 | 0 |
| betriebsrat-monatsplan | 1 (select-name, bekannt) | 0 | 1 | 0 |
| betreiber-mandanten | 1 (select-name, bekannt) | 0 | 1 | 0 |
| mitarbeiter-heute (Desktop, Telefon) | 0 | 0 | 0 | 0 |

Gate: neue critical machen rot; bekannte in `e2e/axe-bekannt.json`. Ein lokaler Lauf zeigte einmal
zusätzlich serious `color-contrast` im Monatsplan des Betriebsrats (nicht im CI-Lauf; nicht gegated).

### Offline

- Dienstarbeiter `/sw.js` mit Geltungsbereich `/` registriert und aktiv.
- Planung: Monatsplan geladen → Netz aus → Neuladen: Anwendung startet, Statusmeldung „Keine Verbindung“,
  Monatsplan mit Betriebsdaten sichtbar.
- Beschäftigte, Telefon: Einstempeln ohne Netz zeigt die Fehlermeldung, kein „Eingestempelt …“, der
  Knopf bleibt; der Server hat nichts vermerkt. (Nachholen kommt mit WP-07 — dann diesen Test anpassen.)
- Einschränkung: Die Offline-Leiste erscheint nur im Desktop-Layout, nicht in der Telefonansicht der
  Beschäftigten (dort keine Offline-Kennzeichnung geprüft).

### Datenschutz der Suite

Zugangscodes und Sitzungsmerkmale nur in `process.env.E2E_ZUGAENGE` der Testprozesse; kein Trace,
kein Video; Fotos nur bei unerwartetem Fehler mit geschwärztem Codefeld. Geprüft: CI-Log und
heruntergeladene Artefakte enthalten kein Muster `XXXX-XXXX-XXXX`.

## 3. Laufzeit

CI-Workflow `E2E` gesamt 2 min 16 s (Suite 1,7 min, 1 Arbeiter). Lokal (Windows-Laptop, parallel
belastet) rund 7 min.

## 4. Bedarf an Testkennungen / UI-Änderungen (nicht umgesetzt, nur gemeldet)

- Keine Testkennungen nötig: `main[aria-label="Ansicht <id>"]`, `aside[aria-label="Hauptnavigation"]`,
  „Navigation öffnen“ und die Beschriftung „Zugangscode“ reichen.
- Wünschenswert: Die Telefonansicht der Beschäftigten hat eine unbeschriftete `<nav>` und Knöpfe mit
  Glyphen im Namen („◉Heute“) — ein `aria-label` für die Leiste und `aria-hidden` für die Glyphen
  machen Selektoren und Screenreader robuster.
- Die Meldung nach dem Stempeln ist ein `div` ohne `role="status"` — für Screenreader unsichtbar und
  nur über den Text prüfbar.
- Ein Offline-Stempelfehler zeigt die rohe Browsermeldung („Failed to fetch“) statt eines deutschen Texts.
- Monatsplan zeigt am Telefon/Tablet keine Gitterzellen; Kernprüfung dort über „2 Wohnbereiche“.

## 5. Offene Punkte

- Befund Kopfleiste 768 px (neu) und die beiden Telefon-Befunde beheben; dann die Einträge in `BEKANNT` streichen.
- select-name (critical) im Monatsplan-Kopf und in der Betreiberkonsole beheben; Eintrag in `axe-bekannt.json` streichen.
- Offline-Kennzeichnung in der Telefonansicht (WP-07).
- `retries: 1` in der CI; bisher keine Wackler beobachtet.
