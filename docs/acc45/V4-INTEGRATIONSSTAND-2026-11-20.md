# V4-Glass-Design: Integrationsstand gegen origin/integration/release-v4

Stand 2026-11-19, Kopf `b621fd90` (Merge #383). Nur gelesen (git show/ls-tree/grep, gh). Nichts geschrieben, nichts gepusht.
Kennzeichnung: **[belegt]** = Datei:Zeile bzw. Befehl; **[vermutet]** = Schluss ohne vollständigen Beleg.

Begriffsklärung: In `docs/acc45/ABNAHME-V4-*`, `STAGING-*-V4` und dem Branch-Namen `integration/release-v4` meint „V4“ den
**Release-Kandidaten**, nicht das Design. Das Design heißt „V4 Glass“. Dieser Bericht behandelt nur das Design.

## 1. Spezifikation (Quelle)

| Bestandteil | Quelle | Im Integrationsstand? |
|---|---|---|
| Tokens hell/dunkel (`--bg … --warn`), Schrift Inter, Logo-Regeln, „nie Weiß auf Türkis“, Farbe nie allein | `origin/design/v4-glass-logo:design/v4-glass/DESIGNSYSTEM.md:7-24` | **nein** (`design/v4-glass/` fehlt in release-v4) |
| Qualitätsgates 1-7 (Kontrast inkl. Glas, 320-1440 px, 44 px, Zustände, reduced motion/transparency, Leistung, Sicherheit, Light/Dark gleichwertig, 200 % Zoom) | `DESIGNSYSTEM.md:26-34` | nein |
| Seitenfamilien-Matrix (10 Familien inkl. Website, Betreiberkonsole) | `DESIGNSYSTEM.md:36-51` | nein |
| Migrationsreihenfolge 8 Schritte + Abnahmekriterien | `design/v4-glass/MIGRATION.md:3-24` | nein |
| Visuelle Referenz | `design/v4-glass/index.html` (138 Z.) + 3 Mockups | nein |
| Logo (5 SVG) | `origin/design/v4-glass-logo:neues-logo/*`, README `neues-logo/README.md:5-17` | ja, als `public/*.svg` (bytegleich, s. 2) |
| Betreiberentscheidungen | Memory `v4-entscheidungen-2026-11-04.md:8-18` (Logo verbindlich, Website nach Hauptauftrag, Dark/Light Einstieg, System>Wahl) | – |
| **Widerspruch** | `design/README.md:3,29-36` (Stand 15.10.) erklärt **V3** als „maßgeblich“ und `design/app/stil.css` als Stilquelle (Sea Salt `#D9E4E8`, Petrol `#017070`, Instrument Sans; `:46-53`); V4-README sagt V3 „abgelöst“ (`design/v4-glass/README.md:3`). Im Integrationsstand steht nur die V3-Fassung. | ja (V3) |

## 2. Umgesetzt und durch Tests belegt

| Bestandteil | Code | Test / CI |
|---|---|---|
| Logo-SVGs = freigegebene Fassung | `public/centric-{bildmarke,logo,logo-hell-auf-dunkel,wortmarke,wortmarke-hell}.svg`; Blob-Hashes identisch mit `neues-logo/*` (git rev-parse, 5/5 GLEICH) | – (Byte-Abgleich dieser Prüfung) |
| C-Bildmarke in der App, Dreibalken entfernt | `src/marke.jsx:16-40`, `src/ui/logo.jsx:10-12`; kein Treffer „Dreibalken“ in src/public | PR #88 gemergt 2026-11-04 |
| PWA-Icons/Manifest/SW auf C-Logo | `public/manifest.webmanifest:14-26` (icon-v4-192/512, maskierbar), `public/sw.js:63,241` | `pruefungen/pwa.test.js` (CI `pruefung.yml:601`) |
| Tokens als eine Quelle (hell+dunkel, Glas, Verlauf, Schatten, Radien, 4-px-Raster, Schrift, Breakpoints, Fokus, Bewegung) | `src/v4/tokens.js:20-94`; Werte = DESIGNSYSTEM-Tabelle (`bg #f0f3ed/#071e22` usw.) | `pruefungen/v4-tokens.test.js:45-90` (Vollständigkeit), `:91-148` (WCAG AA inkl. Glas/Verlauf/Toast, kein Weiß auf Türkis); CI `pruefung.yml:261` |
| App-Palette aus Tokens | `src/farben.js:15-29` (`v4AlsAltePalette`) | `v4-tokens.test.js:216ff.`, `kontrast.test.js` (CI `:370`) |
| Themawahl Nutzer > System > hell, Systemwechsel folgen | `src/v4/thema.js:19-51,89-95`; App `src/App.jsx:17,1392-1398`; Einstieg `src/main.jsx:19,629` | `v4-tokens.test.js:150-165,198-214` |
| Dark/Light im Einstieg (Login/Registrierung/Fehler) | `src/v4/thema.js:58-78` (`v4EinstiegAnwenden`), `src/main.jsx:52-60` liest `--v4-*` | `v4-tokens.test.js:198-214`; Memory: Browserprüfung PR #92 (458e429) |
| App-Oberflächenschicht (Fokusring, 44-px-Ziele bei grobem Zeiger, reduced motion/transparency, Glas nur Navigation/Dialog, 320 px ohne Überlauf) | `src/v4/app-stil.js:18-100` (17 Klassen) | `pruefungen/v4-app-stil.test.js:37-126` via `pruefung:querschnitt` (CI `pruefung.yml:73`) |
| Keine Hexfarben in `src/ansichten` | `git grep` Hex in `src/ansichten`: 0 Treffer | `v4-tokens.test.js:209` (nur src/v4 trägt Hex) |
| Browserprüfung hell+dunkel (Reflow 320, Ziele, Fokus, Fehlertext) | `pruefungen/browser/v4-abnahme.mjs:56,134,225,293` (`THEMEN=light,dark`) | nur lokal/manuell (`npm run abnahme:browser-v4`, `package.json:190`), **nicht in CI** |
| CI-Stand | Workflow „Prüfung“ auf `b621fd90`: success (gh run list) | – |

## 3. Teilweise umgesetzt

| Bestandteil | Befund | Beleg |
|---|---|---|
| Basiskomponenten | `V4Karte/V4Knopf/V4Feld/V4Dialog` existieren, werden aber **nirgends** außer in Tests importiert; Ansichten nutzen die alte Klassenwelt + Overlay | `src/v4/komponenten.jsx:13,18,25,46`; `git grep` Importe von `v4/` nur in `App.jsx:17-18`, `main.jsx:19`, `farben.js:20` |
| Modulweise Migration (MIGRATION Schritt 4) | nur globales Overlay über 17 Klassen; 127 Ansichtsdateien nicht einzeln migriert/abgenommen; Formsprache der Gestaltschicht stammt aus „Leitstand“-Stil [vermutet: V3-Canvas] | `src/v4/app-stil.js:18-20`; `src/gestalt/stil.js:3-12` |
| Farbtreue außerhalb Tokens | 38 rgb/rgba-Literale (21 in `App.jsx`, z. B. `App.jsx:1779`); Avatar-Paare in V3-Tönen (`#017070`, `#3FBFBF`) | `src/farben.js:36-43`; `git grep -c rgba` |
| PWA-/Browser-Farbe | `theme_color`/`background_color` und `<meta theme-color>` noch V3 `#D9E4E8` (V4: `#f0f3ed`); App setzt zur Laufzeit um | `public/manifest.webmanifest:11-12`, `index.html:20`; `src/v4/thema.js:74-75` |
| Glas-Fallback (Gate 4) | `prefers-reduced-transparency` nur in `app-stil.js`; `gestalt/stil.js` und `App.jsx:547` setzen `backdrop-filter` ohne Rückfall | `src/v4/app-stil.js:98-100`; `src/gestalt/stil.js:82,173,387,398,407` |
| Wortmarke (DESIGNSYSTEM:20 „immer SVG, nicht HTML-Text“) | als HTML-Text gerendert, `centric-wortmarke*.svg` in src ungenutzt | `src/main.jsx:61`, `src/gestalt/rahmen.jsx:108`, `src/App.jsx:1778` |
| Mobil/Responsive (Gate 2) | 320 px und Touch geregelt; Messung 320/360/390/430/768/1024/1440 je Ansicht und Thema nicht nachgewiesen; WP-21 BLOCKED (offen u. a. „Dunkel-/Kontrastmodus“, echte Geräte) | SSOT WP-21 notiz; `src/v4/tokens.js:90` |
| A11y-Browserabnahme | WP-40 IN_PROGRESS; e2e/axe ohne Dunkelmodus (kein `colorScheme` in `e2e/`, `playwright.config.mjs`) | SSOT WP-40; `git grep` leer |

## 4. Fehlt

1. **Spezifikation im Repo**: `design/v4-glass/{DESIGNSYSTEM,MIGRATION,README}.md`, `index.html`, Mockups nur auf `origin/design/v4-glass-logo` (3 vor / 1783 hinter). `src/v4/tokens.js:10` verweist auf eine Datei, die im Integrationsstand fehlt. `design/README.md` nennt weiter V3 als maßgeblich.
2. **Inventar/Baseline** (MIGRATION Schritt 2): keine Routen-/Komponenten-/Zustandsmatrix je Rolle × Thema × Breite, keine Screenshot-Baseline (Suche „Oberflächeninventar|Routenmatrix|visuelle Regression“ in docs: 0 Treffer).
3. **Visuelle Regression hell/dunkel** (MIGRATION Schritt 7): keine `toHaveScreenshot`-Prüfung; `pruefungen/basis/vergleich.json` misst Text, nicht Bild.
4. **Website V4** (MIGRATION Schritt 5): in release-v4 keine Website-Quelle (nur V3-Generator `design/website/quelle/*`). Lokale Quelle `C:\Users\RR\centric-website` (Commit bd7d155, 2026-09-24, **kein Remote**) zeichnet das alte Logo (`build.py:291-306`) und die V3-Palette (`build.py:1825,1833`); kein V4-Token-Treffer. Live-Stand `website/dist` (052d98e9) nicht im Detail geprüft. Laut Betreiber erst nach dem Hauptauftrag.
5. **Marketing-/Social-Branding**: `public/vorschau.png`, `marketing/posts/*.png` nicht gegen das C-Logo abgeglichen [nicht geprüft].
6. **Weg in main/Produktion**: Design liegt nur in release-v4; main/Prod alt; Weg A/B offen (`docs/acc45/WIEDERAUFNAHME.md:449-452,500`). PRs #91/#92 stehen noch OPEN, obwohl ihr Inhalt Vorfahr von release-v4 ist (Merge `42a8c1a7`); `BACKLOG-PHASEN.md:265` „ersetzt (vermutet)“.
7. **Abnahmekriterien** (MIGRATION:18-24): kein Light/Dark-Nachweis je Bildschirm, kein Funktionsvergleich, kein Rollback-Dokument für das Design.

## 5. SSOT (`docs/acc45/work-packages.json`, 218 Pakete)

**Kein Paket deckt V4 Glass ab.** Am nächsten liegen: WP-35 Darstellungsbefunde (INTEGRATED, #176), WP-37 PWA-Feinschliff (INTEGRATED, #62),
WP-40 WCAG 2.2 AA (IN_PROGRESS, #221/#345), WP-21 Smartphone/Tablet (BLOCKED), WP-33 Testinfra/axe (INTEGRATED), E-2/E-3 Android/iOS-PWA (BLOCKED, Betreiber).
PR #88/#91/#92 sind keinem Paket zugeordnet. `ABNAHME-V4` betrifft den Release, nicht das Design.

Vorgeschlagene Pakete (Aufwand = **Schätzung dieser Analyse**, nicht vom Betreiber bestätigt):

| ID (Vorschlag) | Inhalt | PT |
|---|---|---|
| V4-0 Spezifikation | `design/v4-glass/*` in release-v4 übernehmen; `design/README.md` und `design/app/stil.css`/V3-Canvas als abgelöst kennzeichnen; #91/#92 schließen oder als ersetzt vermerken; SSOT-Zuordnung #88/#91/#92 | 0,5-1 |
| V4-1 Inventar + Baseline | Ansichten/Dialoge/Zustände × Rollen × hell/dunkel × 7 Breiten, Screenshot-Baseline (MIGRATION 2) | 2-3 |
| V4-2 Markenrest | theme-color/Manifest auf Token, Wortmarke als SVG, Avatar-Paare aus Tokens, vorschau.png/Marketing prüfen, Glas-Rückfall in `gestalt/stil.js`, rgba-Reste `App.jsx` | 1-2 |
| V4-3 Modulmigration | V4-Basiskomponenten modulweise einführen (Seitenfamilien DESIGNSYSTEM:36-49), je Modul kleiner PR | 6-10 |
| V4-4 Visuelle QA | Bildvergleich hell/dunkel, Dunkelmodus in e2e/axe, reduced motion/transparency, 200 % Zoom, `v4-abnahme.mjs` in CI | 2-3 |
| V4-5 Website V4 | Quelle sichern (Remote, Reproduzierbarkeit), auf C-Logo/V4-Tokens/hell-dunkel umstellen, Platzhalter, Freigabe | 3-5 |
| V4-6 Port + Freigabe | Weg A/B nach main, Staging-Abnahme, Rollback (Betreiberfreigabe) | 2-4 |
| **Summe** | | **16,5-28** |

Wirkung auf die Prognose: Mit diesen Paketen steigt der offene SSOT-Aufwand um 16,5 bis 28 PT (311,9–535,4 auf 328,4–563,4 PT, jeweils ohne externe Pakete). Die Wellenzuordnung in `GESAMTPLAN.md` für V4-2 bis V4-6 ist ein Ergebnis der Simulation und kein Terminplan: sie berücksichtigt weder die Konfliktzone `App.jsx` noch die Betreiberfreigabe für V4-6.

## 6. Abhängigkeiten und Konflikte

- **App.jsx ist Engpass**: Konfliktzone von WP-40, WP-48, WP-48-GB, WP-21, WP-35, WP-39 (SSOT `konfliktzonen`). Letzte Änderungen an `App.jsx`/`speicherlage.jsx`/`speicher.js` stammen aus WP-48-GB und Folgepaketen (#365, #374, #376, #381, #382). V4-2/V4-3 erst nach Ruhe in WP-48-GB und abgestimmt mit WP-40.
- **WP-40** (src/ansichten, App.jsx): gleiche Dateien und gleiche Kriterien (Fokus 2.4.11, Ziele 2.5.8, Reflow 1.4.10) wie V4-Gates 1-3; V4-4 sollte WP-40-Browserabnahme nutzen statt doppeln. Kontrastnachweis für V4 hängt an `kontrast.test.js`/`v4-tokens.test.js`, die WP-40 nicht schwächen darf.
- **IMP-6**: SSOT-Konfliktzonen leer, Dateien `server/lib/import/schicht*` (#383 zuletzt); Oberfläche `src/ansichten/import*.jsx` trägt je ein rgba-Literal (`import.jsx`, `import-datei.jsx`) → geringe Überschneidung mit V4-3 [vermutet: nur bei Import-Oberflächenarbeit].
- **WP-33**: Voraussetzung für V4-4 (Playwright/axe vorhanden, Dunkel fehlt).
- **WP-21 / E-2 / E-3**: echte Geräte und PWA-Installation, Betreiber; V4-Gate 2 kann ohne sie nicht vollständig abgenommen werden.
- **Website**: nach Hauptauftrag laut Betreiber; Quelle ohne Versionsverwaltung außerhalb des Laptops (Risiko).
- **MIGRATION Schritt 1** („V4 nie in laufende Releases schieben“) ist faktisch überholt: V4 Phase 1/2 sind seit `42a8c1a7` (2026-11-06) Teil des Release-Kandidaten.

## 7. Prozent

Gesamtanteil **nicht belegbar**: Es fehlt das Inventar (Nenner). Belegbar sind nur Teilaussagen: Tokens, Themawahl, Einstieg, Logo/Icons umgesetzt und geprüft;
0 von 4 V4-Basiskomponenten in Ansichten verwendet; Website 0 (lokale Quelle ohne V4-Token); Produktion 0 (main alt).
