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

## 5. Offen

- Ausnahmen abbauen (WP-40/WP-21): Namensschema Kontoknopf und Plan, Schichtkarte „Mein Plan“.
- Weitere Flächen (Anträge, Lagebild, Betreiberkonsole), Offline-Fälle und Rollenabläufe aus dem alten Branch (674d1c04) nachziehen.
- Erster Lauf auf dem GitHub-Runner (Chromium-Download) steht mit dem PR aus.
