# WP-33 Teil 3: Playwright und axe-core in der CI

Stand 2026-11-13, Basis `integration/release-v4` 54ec5804. Betreiberfreigabe 2026-11-13 für `@playwright/test` und `axe-core`
als devDependencies (exakt gepinnt, mindestens zwei Wochen alt, Lizenz-, Schwachstellen- und Lieferkettenprüfung, CI-Einbindung,
keine bestehende Prüfung abgeschwächt).

## 1. Abhängigkeiten

| Paket | Fassung (exakt) | Veröffentlicht | Alter am 2026-11-13 | Lizenz | Installationsskript | Herkunftsnachweis |
|---|---|---|---|---|---|---|
| `@playwright/test` | 1.64.1 | 2026-10-14 | 30 Tage | Apache-2.0 | keines | npm-Provenance (SLSA v1) |
| `playwright` (indirekt) | 1.64.1 | 2026-10-14 | 30 Tage | Apache-2.0 | keines | npm-Provenance (SLSA v1) |
| `playwright-core` (indirekt) | 1.64.1 | 2026-10-14 | 30 Tage | Apache-2.0 | keines | npm-Provenance (SLSA v1) |
| `axe-core` | 4.14.0 | 2026-10-05 | 39 Tage | MPL-2.0 | keines | npm-Provenance (SLSA v1) |

- Nicht gewählt: `@playwright/test` 1.65.0 (2026-11-05, erst 8 Tage alt). `@axe-core/playwright` ist **nicht** nötig: axe-core
  wird wie im offiziellen Wrapper per `page.evaluate(axe.source)` eingespielt (vom CSP der Seite nicht erfasst), dann `axe.run`.
- Paketumfang neu im Lockfile: genau diese vier Pakete (`playwright` bringt nur das schon vorhandene optionale `fsevents` mit,
  nur macOS). Alle aus `https://registry.npmjs.org/` mit sha512-Integrität.
- Betreuer: Playwright vom Microsoft-Team (pavelfeldman, yurys, dgozman-ms, microsoft-oss-releases, microsoft1es); axe-core von
  Deque (dylanb, wilcofiers, dqlabs, npmdeque).
- Lizenzen: Apache-2.0 ist mit dem Projekt unproblematisch. MPL-2.0 (axe-core) ist eine Copyleft-Lizenz auf Dateiebene; sie greift
  nur bei Weitergabe veränderter axe-Dateien. axe-core wird unverändert und nur als Entwicklungswerkzeug im Testbrowser
  benutzt, nie ausgeliefert (das Bild baut mit `npm ci --omit=dev`, die Oberfläche importiert axe nicht).
- `playwright-core` 1.64.1 nutzten die vorhandenen Browserproben (`pruefungen/browser/*.mjs`) schon bisher, aber ohne Lockfile-
  Eintrag (lokal installiert). Jetzt ist es über `@playwright/test` gepinnt.

### Prüfausgaben

```
$ npm audit
found 0 vulnerabilities
metadata.vulnerabilities: {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}  (371 Pakete)

$ node werkzeug/sicherheit/abhaengigkeiten.mjs
Lockfile: v3, 371 Pakete, Befunde: 0
Pakete mit Installationsskript: fsevents, vite/node_modules/esbuild      (beide unverändert, vor dieser Änderung schon da)
npm audit Laufzeit (--omit=dev): {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}
npm audit gesamt: {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}
```

Lieferkette (Trivy auf dem Bild) ist nicht berührt: devDependencies gelangen nicht ins Bild.

## 2. Suite (`e2e/`, `playwright.config.mjs`)

- Nur Chromium, headless. Acht Projekte = die acht Viewports der Gerätematrix WP-21 (`GERAETE_VIEWPORTS` und
  `GERAETE_VIEWPORTS_QUER` aus `src/ui/geraete.js`), Touch unter 1000 px Breite, reduzierte Bewegung.
- `e2e/global-setup.mjs` nutzt dasselbe Verfahren wie `pruefungen/browser/wcag-wp40.mjs`: Bau in ein Wegwerfverzeichnis,
  `server.mjs` auf 127.0.0.1 (Port 3231, `istLoopback` aus `pruefungen/browser/abnahme-kern.mjs`) mit frischem Datenordner,
  Zufalls-Verwalterschlüssel, `NODE_ENV=development`, Demo-Bestand (erfundene Personen), je Rolle ein Zugang über `/api/zugaenge`.
  Keine echten Daten, keine Staging- oder Produktionsumgebung. Zugangscodes gehen nur über eine Umgebungsvariable an die Tests
  und werden nie ausgegeben. Keine Spuren, Videos oder Bildschirmfotos.
- `e2e/barrierefreiheit.spec.mjs`: je Viewport Anmeldung, Einstellungen (Leitung) und je Rollenfamilie eine Planansicht
  (Mitarbeiter „Mein Plan“, Schichtverantwortung „Personaleinsatz“, Planung, Leitung und Betriebsrat „Monatsplan“), dazu die
  Prüfung der Ausnahmeliste: 7 x 8 = 56 axe-Läufe.
- axe mit den Tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22a, wcag22aa`. **Gate: jeder Fund der Schwere serious oder
  critical schlägt fehl**, außer er steht begründet in `e2e/axe-ausnahmen.json` (Regel, Fläche, optional Viewports, Grund,
  Arbeitspaket). Der volle Befund aller Schweregrade steht je Fläche und Viewport in `e2e/ergebnisse/axe/*.json` (CI-Artefakt).
- vitest nimmt `e2e/**` nicht auf (`test.exclude` in `vite.config.js`); ESLint hat einen eigenen Block für `e2e/**/*.mjs`.

Aufruf lokal: `npm run e2e:browser` (einmal, Chromium), dann `npm run e2e`. Fertigen Bau verwenden: `E2E_DIST=<Ordner>`.

## 3. CI

Neuer Job `browser-abnahme` in `.github/workflows/pruefung.yml`, neben `pruefen` (die vitest-Kette bleibt unverändert):
`npm ci`, `npx --no-install playwright install --with-deps chromium` (Browserfassung durch die gepinnte Playwright-Fassung
festgelegt), `npm run e2e`, Artefakt `browser-abnahme` (axe-JSON, Bericht). Keine Geheimnisse, Actions per SHA gepinnt wie im
übrigen Workflow. Da `deploy.yml` `pruefung.yml` aufruft, gilt das Gate auch vor der Auslieferung. `e2e` ist kein Glied der Kette
`pruefung`; `pruefung:ci-abdeckung` und `pruefung:sammelpruefung` bleiben unverändert grün.

## 4. Befunde des ersten Laufs (lokal, Windows, 2026-11-13)

| Fläche | Regel (Schwere) | Viewports | Behandlung |
|---|---|---|---|
| anmeldung | target-size (serious), Links Impressum/AGB 19 px hoch, beim Umbruch zu dicht | 430x932 | **behoben**: `minHeight: 24` in `RechtLeiste` (`src/rechtstexte.jsx`) |
| einstellungen-leitung, alle plan-* außer mitarbeiter | label-content-name-mismatch (serious, axe „experimental“, WCAG 2.5.3): Kontoknopf (Initialen vs. „Konto: Name“), Tageskarten und Personenzellen im Plan | alle | Ausnahme, WP-40 |
| plan-mitarbeiter | nested-interactive (serious): Schichtkarte `div[role=button]` mit bedienbaren Kindern | alle | Ausnahme, WP-40 |
| plan-mitarbeiter | target-size (serious): dieselbe Karte teilweise unter fester Leiste | alle | Ausnahme, WP-21 |

Lauf nach Behebung und mit der Ausnahmeliste (lokal, Windows, Chromium 1.64.1, nacheinander): **57 bestanden, 7 übersprungen
(Listenprüfung läuft nur einmal), 0 fehlgeschlagen, 11,5 min**. Keine critical-Funde. Ungenutzte Ausnahmen meldet der Test als Anmerkung `axe-ausnahme-ungenutzt`.

Nebenbefund (kein axe-Fund, nicht behoben): Mit drei parallelen Testprozessen (mehrere Sitzungen von Planung und Leitung im selben
Betrieb, ohne Eingabe) erschien in zwei Läufen der Dialog „Gleichzeitig bearbeitet“ und verdeckte die Navigation. Die Suite läuft
deshalb nacheinander (`workers: 1`). Ob das bloße Öffnen in zwei Sitzungen einen Schreibkonflikt auslösen darf, gehört fachlich
geprüft (WP-48/WP-16-Umfeld).

## 4a. Teil 4: Toast-Kontrast und stabile Prüfung (2026-11-13)

Nach dem Merge (#262) schlug `browser-abnahme` in der CI zeitabhängig fehl, beide Male `[360x740] einstellungen-leitung`:
`serious color-contrast [.toast > button]`. Bei der ersten Anmeldung der Leitung erscheint ein Meldungsstreifen mit „Rückgängig“;
ob er beim Scan noch sichtbar war (3 s), hing von der Laufzeit ab (CI schnell, Windows langsam).

- **Behebung in der Anwendung:** In der V4-Anwendung liegt der Streifen auf dem hellen Glasgrund, der Knopf trug aber
  `accentGlanz` (für den dunklen Streifen gedacht), hell rund 2:1. Jetzt `html[data-v4-app] .toast button{color:var(--v4-accent)}`
  (`src/v4/app-stil.js`), hell und dunkel >= 4,5:1; abgesichert in `pruefungen/v4-tokens.test.js`. Keine Ausnahme.
- **Deterministische Prüfung (`e2e/hilfen.mjs`):** Nichts wird versteckt oder weggeklickt. axe und ein Beobachter werden per
  `addInitScript` vor der Anwendung geladen; der Beobachter prüft **jeden** Meldungsstreifen, sobald er erscheint (gleiche Regeln,
  gleiches Gate, keine Ausnahmen), unabhängig davon, ob er beim Seitenscan noch sichtbar ist. Am Testende schlagen serious/critical
  fehl; die Befunde stehen in `e2e/ergebnisse/axe/meldung-<test>-<viewport>.json` und als Anmerkung `axe-meldung`. Alle axe-Läufe
  einer Seite laufen über eine Kette (kein „Axe is already running“). Ein beim Seitenscan sichtbarer Streifen wird dort
  zusätzlich mitgeprüft (`meldungSichtbar`). Vor jedem Scan und nach jeder Navigation wird auf Netzruhe gewartet statt fester
  Pausen. Erscheint der Dialog „Gleichzeitig bearbeitet“, scheitert der Test mit genau dieser Meldung, statt an einer verdeckten
  Navigation. Der automatische Urlaubshinweis-Lauf beim ersten Öffnen durch die Leitung schreibt Daten; er ist die
  wahrscheinliche Ursache des Konfliktdialogs bei parallelen Sitzungen (Nebenbefund oben).
- Kontrast: Rücknahmeknopf hell vorher 1,98:1, jetzt 7,36:1 (hell) und 11,0:1 (dunkel).

## 4a-2. Lokale E2E-Abnahme 2026-11-19

`e2e/lokale-abnahme-luecken.spec.mjs` (nur Projekt `1024x768`, eigene Betriebe): Urlaubsantrag und Genehmigung, 409 mit Sendesperre,
Sitzungsende und Wiederanmeldung (B-L4 behoben durch #378: Anmeldung mit Hinweis; Sitzungsende bei offener Seite L4c: Anmelden und senden speichert mit altem ETag, B-L4c behoben durch #381; L4d anderer Zugang verwirft), Import-Fehlerfall, Mandantentrennung bei Anträgen. Matrix, Läufe und
Befund: [LOKALE-E2E-ABNAHME-2026-11-19.md](LOKALE-E2E-ABNAHME-2026-11-19.md).

## 4b. WP-33 Rest: weitere axe-Flächen (2026-11-17)

Neu: `e2e/barrierefreiheit-flaechen.spec.mjs` mit den Flächen aus `e2e/weitere-flaechen.mjs` (reine Daten), je Viewport der Gerätematrix:
Anträge und Tauschbörse (Planung), Personal, Prüfung, Abrechnungsdaten, Hilfe und Rechtliches (Leitung) = 7 x 8 = 56 axe-Läufe, nur lesend
(Anmelden, Navigieren). Gleiches Gate (serious/critical), gleiche Meldungsstreifen-Prüfung. Zusätzlich `pruefungen/e2e-flaechen.test.js`
(Skript `pruefung:e2e-flaechen`, Glied der Kette `pruefung` vor `pruefung:wcag-wp40`, eigener Schritt in `pruefung.yml`): Ohne Browser wird geprüft,
dass Namen eindeutig sind, die Rolle zur Suite gehört, der Navigationseintrag in `src/app/navigation.js` genau einmal besteht und die Ausnahmeliste
nur bekannte Flächen nennt (kein Platzhalter). Die Listenprüfung in `barrierefreiheit.spec.mjs` kennt die neuen Flächen.

Befund des Laufs (lokal, Windows, Chromium 1.64.1, axe-core 4.14.0): keine critical-Funde, nur Funde der schon bekannten Ursachen, die als
begründete Ausnahmen (WP-40) in `e2e/axe-ausnahmen.json` stehen: `label-content-name-mismatch` (Kontoknopf, ab Tabletbreite Suchknopf, auf
`personal-leitung` rund 87 Personenzellen) auf allen sieben Flächen, `nested-interactive` auf `antraege-planer` (Antragszeilen). Keine bestehende
Ausnahme und kein Gate wurde geändert oder gelockert. Entscheidungsvorlage zum Abbau: ENTSCHEIDUNGSLISTE P2-11.

**Offener Mangel:** `nested-interactive` auf `antraege-planer` (WCAG 4.1.2) ist ein echter Bedienmangel (Antragszeilen `div[role=button]` mit bedienbaren Kindern), kein Namensschema-Befund; **Behoben 2026-11-18 (P2-11a Option A):** Antragszeile in `src/ansichten/antraegegeteilt.jsx` ist ein nicht interaktiver Container, der Inhaltsbereich die eigene Schaltfläche, Kästchen und Entscheidungsknöpfe stehen daneben; die Ausnahme ist gestrichen, der Beleg kommt aus dem Browser-axe-Lauf der CI. Die Ausnahmen in `e2e/axe-ausnahmen.json` (jetzt 16 Einträge) haben keinen Ablauf; ihr Abbau hängt an WP-40, ein Ablaufdatum-Mechanismus ist nicht vorgesehen. Die 8 neuen Ausnahmen sind eng, begründet und unabhängig geprüft und verdecken nichts, was bisher geprüft wurde (nur neue Abdeckung). Der Betreiber ist über die Entscheidungsliste informiert; das ist keine stille Freigabe.

**Anmeldebremse (CI-Befund 2026-11-17):** Der Server lässt je Zugangscode nur 20 gelungene Anmeldungen je 5 Minuten zu, danach 5 Minuten Sperre (`server/lib/schutz.mjs`, „anmelden-code“). Mit einer Anmeldung je Fläche (und 8 Viewports) überschritt die Leitung die Grenze auf dem schnellen CI-Runner (Run 44026690544, 844x390: `hilfe-leitung`, `rechtliches-leitung` und die Leitungs-Tests danach, Fehler `waitForSelector(".m-tabs, .kopfleiste")` nach der Anmeldung). Behebung ohne Änderung der Bremse und ohne Gate-Änderung: `barrierefreiheit-flaechen.spec.mjs` meldet sich je Rolle und Viewport einmal an (zwei Tests je Viewport: Planung, Leitung) und prüft die Flächen nacheinander; jede Fläche behält Namen, Ergebnisdatei und Ausnahmen, ein Fund bricht die übrigen nicht ab. Das senkt die Leitungs-Anmeldungen der Suite je Viewport von 7 auf 3. Gesamt jetzt 16 statt 56 Läufe, aber dieselben 56 axe-Prüfungen.

Lauf mit den Ausnahmen (lokal, Windows, einzeln nacheinander): **56 von 56 bestanden** (alle acht Viewports, 19,2 min) plus die Listenprüfung (1 bestanden).

## 5. Offen

- ~~Ausnahmen abbauen (WP-40/WP-21): Namensschema Kontoknopf und Plan, Schichtkarte „Mein Plan“.~~ Erledigt 2026-11-19
  (WP-40, P2-11 Option A), siehe Abschnitt 6.
- Weitere Flächen: Anträge, Tauschbörse, Personal, Prüfung, Abrechnungsdaten, Hilfe, Rechtliches und Lagebild sind in der Suite (siehe 4b); offen bleiben die Betreiberkonsole (eigener Zugang, eigener Betrieb) und weitere Verwaltungsansichten. Offline: Stempeln ohne Netz deckt B7 der Abnahme B ab; weitere Offline-Fälle brauchen eine Fachvorgabe.
- Erster Lauf auf dem GitHub-Runner (Chromium-Download) steht mit dem PR aus.

## 6. WP-40: Abbau aller axe-Ausnahmen (P2-11 Option A, 2026-11-19)

Betreiberentscheidung 2026-11-18: zugängliche Namen korrigieren, verschachtelte Bedienelemente beseitigen, Ausnahmen nach
Korrektur streichen, keine Abschwächung der Prüfungen. Alle 16 Einträge in `e2e/axe-ausnahmen.json` sind gestrichen; an
Gate, Regeln, Tags und Viewports ist nichts geändert. Ursachen und Korrektur (nur Markup/ARIA, keine Logik):

| Ursache (Regel) | Flächen | Korrektur |
|---|---|---|
| Kontoknopf `.avatarknopf`: sichtbar Initialen, Name „Konto: Name“ (label-content-name-mismatch) | alle Flächen mit Kopfleiste | Name `„<Initialen>, Konto <Name>“` (`src/gestalt/rahmen.jsx`) |
| Suchknopf `.suchknopf`: sichtbar „Suchen … Strg K“, Name „Suchen (Strg K)“ (axe streicht Klammerinhalt) | ab Tabletbreite | Name „Suchen, Strg K“, dazu `aria-keyshortcuts` |
| Monatsplan-Raster: Kopfzellen („So 01“), Einheitszellen (Kürzel, „2 ab“), Besetzungszellen („3/4“) mit abweichendem Namen | plan-planer, plan-leitung, plan-betriebsrat | Name beginnt mit dem sichtbaren Text, danach die Erklärung; Kopf weiter mit „Tag · “ (`src/ansichten/monatsplan.jsx`) |
| Tageskarten der Wochenliste (schmale Monatsplanansicht): ganze Karte als Knopf mit Name nur des Kopfes | plan-* an schmalen Viewports | Maus öffnet weiter über die ganze Karte; Bedienelement für Tastatur und Vorlesesoftware ist die Kopfzeile, Name = ihr sichtbarer Text (`src/ansichten/wochenliste.jsx`) |
| Personenzellen `td[role=button]` „Name öffnen“ bei sichtbarer Funktion/Rolle; Tageszellen ohne Kürzel im Namen | plan-subplaner, personal-leitung | Personenzelle ohne eigenen Namen (Inhalt ist der Name); Tageszelle beginnt mit dem Kürzel (`einsatzplan.jsx`, `personal.jsx`) |
| Achtungszeilen im Lagebild: Name „Datum: Titel“, sichtbar „Titel Datum“ | abnahme-b-lagebild-planer | Zeile ohne eigenen Namen (`src/ansichten/lagebild.jsx`) |
| Karte „Zeiten bestätigen“ in Mein Plan: Knopf mit Zeile `role=button` darin (nested-interactive); axe zieht die innere Zielfläche von der äußeren ab, daher der 17-px-Streifen (target-size) | plan-mitarbeiter | innere Zeile ohne Bedienung, nur die Karte ist Knopf (`src/ansichten/mobil.jsx`) |

Nach Review (#389): Der Fokusrahmen der Wochenlisten-Kopfzeile liegt innen (`outlineOffset: -3`), weil die Karte mit
`overflow: hidden` abschneidet (WCAG 2.4.7). Vorsorglich gleich behandelt, obwohl die Suite diese Ansichten nicht abdeckt:
Zeitachse (Tageszellen), Jahresansicht (Personenzeile), Bereitschaft (Tageszeile) und „Tag öffnen“ bei offenen
Krankmeldungen („Tag öffnen: <Datum> in der Planung“).

Absicherung ohne Browser: `pruefungen/wcag-wp40.test.js` (Abschnitt P2-11; bildet die Wortfolge-Prüfung von axe 4.14 nach
und verlangt eine ganz leere Ausnahmeliste). Gate bleibt der Browser-axe-Lauf der CI an allen acht Viewports; lokal liefen
1024x768 (alle betroffenen Flächen) und 390x844 (plan-planer, plan-mitarbeiter), Ergebnisse im PR. `target-size` auf
plan-mitarbeiter ist für die Telefone quer (feste untere Leiste) nur durch die CI belegbar.
