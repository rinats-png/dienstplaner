# V4-Inventar: Oberflächendateien mit V4-Status (Paket V4-1, MIGRATION Schritt 2)

Stand: Kopf `105f6c83` von `integration/release-v4` (2026-11-20). Nur gelesen, nichts an der Oberfläche geändert.

Kennzeichnung: **[belegt]** = mit dem Zählbefehl unten reproduzierbar; **[Urteil]** = Zuordnung von Hand (Familie, Zweck);
**[vermutet]** = Schluss ohne vollständigen Beleg; **[Schätzung]** = Aufwand, nicht gemessen.

Reproduzieren (rein lesend, deterministisch, keine Uhr, kein Netz):

```
node werkzeug/v4-inventar.mjs              # Zählstand (JSON)
node werkzeug/v4-inventar.mjs --markdown   # Tabellen in Abschnitt 9
node werkzeug/v4-inventar.mjs --json       # alle Daten je Datei
```

Test: `pruefungen/v4-inventar.test.js` (in `npm run pruefung:querschnitt`). Hart: Zählfunktionen mit Gegenproben,
Zuordnung Ansicht → Datei, Determinismus, Nenner-Invariante, keine toten `ZUORDNUNG`-Einträge, jeder
Navigationseintrag hat einen Ansichtszweig. Nur Warnung: eine neue Oberflächendatei ohne `ZUORDNUNG`-Eintrag (sie
erscheint mit Familie „offen“) und eine im Abschnitt 9 genannte, inzwischen verschwundene Datei; dieses Dokument ist
ein datierter Schnappschuss. Streng (Exit 1 bei beidem) für V4-Wellen und Koordinator:
`node werkzeug/v4-inventar.mjs --streng`.

## 1. Umfang (Nenner) [belegt]

Erfasst: `src/*.jsx` (Schalen/Einstieg), `src/ansichten/**/*.jsx`, `src/module/*.jsx`, `src/ui/*`, `src/gestalt/*`, `src/v4/*`.

| Gruppe | Dateien |
|---|---|
| Schale/Einstieg (`src/*.jsx`: App, main, betreiber-2fa, marke, pruefung, rechtstexte, ringregler, startbild, verlustweg) | 9 |
| Ansicht (`src/ansichten`, davon 3 in `intelligence/`) | 127 |
| Branchenmodul (`src/module/*.jsx`) | 13 |
| Baustein ui | 12 |
| Baustein gestalt | 6 |
| V4 (`src/v4`, Quelle der Tokens und Bausteine) | 5 |
| **Summe** | **172** (34 844 Zeilen) |

Weitere Zählungen: 54 Navigationseinträge (44 Betrieb, 10 Betreiber, `src/app/navigation.js`), 55 Ansichtszweige in
`src/App.jsx` (`personal` rendert zwei Dateien: Personal und Einladungen), 35 Dialogstellen in 16 Dateien (role=dialog,
Fenster, MBlatt, Warndialog, Bestaetigungsfrage, Konflikt-/Teilkonfliktfenster, RechtFenster), 46 Zustandsstellen
(Leer, Laden, Fehlerband, Feldfehler) in 37 Dateien, 3 417 Inline-Stile (`style={{`) in 156 Dateien.

**Nicht erfasst:** Website (keine Quelle im App-Repository, V4-5), Druck-/CSV-Exporte als eigene Zustände, Zustände
innerhalb einer Datei (leer/fehlerhaft/offline je Ansicht) nur als Zählung der Zustandsbausteine, nicht als Matrix.

## 2. V4-Anteil, belegt mit Nenner

Nenner für Anteile: **167** Dateien (alle erfassten außer `src/v4`, das die V4-Quelle selbst ist). [belegt]

| Merkmal | Zähler / Nenner | Anteil |
|---|---|---|
| nutzt V4-Basiskomponenten (`<V4Karte/V4Knopf/V4Feld/V4Dialog/V4Hinweis>`) | 0 / 167 | 0 % |
| Tokens direkt (`var(--v4-…)` oder Import aus `src/v4`): `App.jsx`, `main.jsx` | 2 / 167 | 1,2 % |
| Tokens direkt oder über Palette `C` (`src/farben.js`, aus Tokens abgeleitet) | 138 / 167 | 82,6 % |
| ohne rgb/rgba- und Hex-Literale (ohne Kommentare gezählt) | 152 / 167 | 91,0 % |
| trägt Klassen der V4-Oberflächenschicht (Overlay, `V4_APP_KLASSEN`) | 62 / 167 | 37,1 % |
| ohne `backdrop-filter` ohne Rückfall | 159 / 167 | 95,2 % |
| mit aria-/role-Attributen (Zählung, keine WCAG-Bewertung) | 101 / 167 | 60,5 % |
| Fläche in der axe-Suite (e2e) | 15 / 167 | 9,0 % |
| irgendein Testbezug (v4-tokens, v4-app-stil, kontrast, wcag-wp40, axe, WP-40-Browser) | 27 / 167 | 16,2 % |
| Navigationseinträge mit axe-Fläche | 11 / 54 | 20,4 % |
| Navigationseinträge im WP-40-Browserskript | 11 / 54 | 20,4 % |
| Ansichtszweige mit Light- **und** Dark-Bildnachweis (MIGRATION-Abnahmekriterium) | 0 / 55 | 0 % |

Farbliterale absolut: 41 rgb/rgba und 91 Hex außerhalb `src/v4`; davon 77 Hex in `src/pruefung.jsx` (Selbsttest,
Rollenfarben) und 25 rgb + 9 Hex in `src/App.jsx`. `src/v4/tokens.js` trägt 17 rgb + 58 Hex (gewollt, Token-Quelle).
Abweichung zur Analyse `V4-INTEGRATIONSSTAND-2026-11-20.md` (dort „38 rgb/rgba“, „0 Hex in src/ansichten“): andere
Zählweise (dort `git grep -c` = Zeilen, nur `src/`-Teilmengen); hier Vorkommen, Kommentare ausgenommen, auch Schalen
und Bausteine. In `src/ansichten` stehen 0 Hex-Farben (die Treffer dort waren PR-Nummern in Kommentaren wie `#348`).

`backdrop-filter` ohne Rückfall (`prefers-reduced-transparency` oder `@supports` in derselben Datei fehlt) [belegt]:
`src/gestalt/stil.js` (10), `src/App.jsx`, `src/ansichten/ablauf.jsx`, `bestaetigungsfrage.jsx`, `fenster.jsx`,
`kommandoleiste.jsx`, `speicherlage.jsx`, `teilkonflikt.jsx` (je 1). Ob die globale Regel in `src/v4/app-stil.js`
diese Stellen im Browser tatsächlich abfängt, ist nicht gemessen [vermutet: nur für Elemente mit Overlay-Klassen].

**Gesamturteil:** Die Farbebene ist weitgehend V4 (Palette aus Tokens), die Formebene nicht: 0 % der Dateien nutzen die
V4-Bausteine, die Gestalt kommt aus Inline-Stilen und der alten Klassenwelt mit globalem Overlay. Ein einzelner
„V4-Prozentwert“ wird bewusst nicht gebildet; die Merkmale oben sind einzeln belegt.

## 3. Rollen-Sicht [belegt, mit Grenzen]

Abgeleitet aus `src/app/navigation.js` (`ansichtErlaubt`) mit der Standardmatrix `MATRIX_STD` (`src/lib/rollen.js`)
je Rolle der Suite; Betreiberansichten aus `NAV_BETREIBER`. Arten in der Tabelle:

| Art | Dateien | Bedeutung |
|---|---|---|
| Navigation | 54 | direkt über einen Navigationseintrag erreichbar; Rollen wie berechnet |
| geerbt | 31 | Rollen der einbindenden Ansichten (Importgraph über ganz `src/`) |
| Schale/Dialog | 33 | nur von `App.jsx` eingebunden; Rolle hängt an Bedingungen im Code, nicht statisch abgeleitet |
| Branchenmodul | 12 | über `src/module/index.js`, paket- und branchenabhängig |
| offen | 12 | eingebunden, aber Rolle nicht ableitbar |
| nicht importiert | 5 | in `src/` von keiner Datei importiert: `ansichten/ansichtleiste.jsx`, `ansichten/antraege.jsx`, `ansichten/fenster.jsx`, `ansichten/intelligence/Aenderungsuebersicht.jsx`, `ansichten/intelligence/KiAntwort.jsx` (die beiden KI-Dateien nur in Tests) |
| Querschnitt / Schale / Einstieg | 23 / 1 / 1 | Bausteine; `App.jsx`; `main.jsx` (vor Anmeldung) |

Grenzen: Die Berechnung kennt Zusatzbedingungen in `App.jsx` nicht (z. B. Einladungen nur mit `roles.assign` und nicht
im Demozugang; Beschäftigte sehen standardmäßig die Telefonschale `mobil.jsx`, die Rechneransicht nur auf Wunsch).
„+Paket“ heißt: zusätzlich gebuchtes Paket nötig. Betriebsrat-Sperren (`OHNE_BR:`/`BR:`) sind berücksichtigt.
Die „nicht importierten“ Dateien vor einer Migration klären (MIGRATION Schritt 8: Altes erst nach belegter Nichtnutzung
entfernen) [vermutet: `antraege.jsx` ist durch `antraegegeteilt.jsx` ersetzt].

## 4. Seitenfamilien (DESIGNSYSTEM.md, 10 Familien) [Urteil + belegt]

Zuordnung je Datei ist ein Urteil (Name, Exporte, Navigation); die Spalten danach sind gezählt.

| Familie | Dateien | Zeilen | davon über Navigation | mit Overlay | mit Farbliteral | mit axe | mit Testbezug | Aufwand PT [Schätzung] |
|---|---|---|---|---|---|---|---|---|
| Dienstlage / Dashboard | 14 | 1 926 | 8 | 11 | 0 | 1 | 2 | 1,85 |
| Monats-, Tages-, Jahresplan | 24 | 2 313 | 9 | 7 | 1 | 2 | 6 | 2,55 |
| Personal / Qualifikationen | 14 | 2 054 | 6 | 6 | 4 | 1 | 1 | 2,0 |
| Standorte / Besetzung | 11 | 1 423 | 3 | 7 | 0 | 0 | 0 | 1,4 |
| Zeit, Urlaub, Abwesenheit | 16 | 1 822 | 3 | 1 | 1 | 4 | 5 | 1,75 |
| Auswertung / Export | 8 | 1 013 | 5 | 2 | 0 | 1 | 1 | 0,8 |
| Regelprüfung / Prüfungen | 9 | 8 903 | 3 | 4 | 1 | 1 | 1 | 1,95 |
| Rollen / Einstellungen / Login | 20 | 4 543 | 5 | 7 | 2 | 3 | 4 | 3,3 |
| Betreiberkonsole | 12 | 1 918 | 9 | 5 | 1 | 0 | 0 | 1,5 |
| Öffentliche Website | 0 | – | – | – | – | – | – | V4-5 |
| Querschnitt (Baustein, Schale, Dialog; keine Familie) | 44 | 8 929 | 3 | 12 | 10 | 2 | 12 | 6,9 |
| **Summe** | **172** | **34 844** | **54** | | | | | **24,0** |

„Regelprüfung“ ist durch `src/pruefung.jsx` (Selbsttest, 7 773 Zeilen) groß; ohne ihn 1 130 Zeilen.

## 5. Aufwand je Modul [Schätzung]

Formel (im Werkzeug, `aufwandsklasse`): Last = Zeilen + 10 × Farbliterale + 2 × Inline-Stile + 20 × Dialogstellen;
S < 300 (0,1 PT), M < 900 (0,25 PT), L < 2 500 (0,5 PT), sonst XL (1 PT). Verteilung: 140 S, 28 M, 2 L
(`main.jsx`, `mobil.jsx`), 2 XL (`App.jsx`, `pruefung.jsx`). Summe **24 PT** für alle 172 Dateien.

Einordnung: Die SSOT schätzt V4-3 (Modulmigration) mit 6–10 PT. Die Inventarschätzung liegt höher, weil sie jede Datei
einzeln zählt; sie sinkt deutlich, wenn die Bausteine zuerst migriert werden (Abschnitt 6, Welle 0), denn 119 Dateien
importieren `src/ui/bausteine.jsx`. Realistische Spanne nach Inventar [Schätzung]: **10–16 PT** für V4-3, wenn Welle 0
die Formebene der Bausteine trägt und Ansichten nur noch Inline-Stile und Sonderfälle nachziehen. Die SSOT-Spanne ändert
dieses Paket nicht; das entscheidet der Koordinator.

## 6. Migrationsreihenfolge (Vorschlag)

Leitlinie: Hebel zuerst (Fan-in), dann die Familien mit Testabdeckung (Regression sichtbar), Betreiber und Login zuletzt
(Sicherheitsgate 6: 2FA/RBAC nicht berühren). Fan-in = Zahl der Dateien unter `src/`, die importieren [belegt].

| Welle | Inhalt | Begründung (belegt) | Paket |
|---|---|---|---|
| 0 Bausteine | `ui/bausteine.jsx` (Fan-in 119: Card, Btn, Inp, Field …) intern auf V4Karte/V4Knopf/V4Feld; `ui/leisten.jsx` (43), `gestalt/ansichten.jsx` (40), `gestalt/bausteine.jsx` (22), `gestalt/icons.jsx` (46, nur Form) | eine Änderung erreicht den Großteil der Ansichten; `ui/thema.js` (97) bleibt Token-Brücke | V4-3 |
| 1 Glas und Literale | 8 Dateien mit `backdrop-filter` ohne Rückfall, `App.jsx` (25 rgb, 9 Hex), `ui/farbwahl.jsx`, `ui/leisten.jsx`, `import*.jsx`, `personalakte.jsx`, `rechtstexte.jsx` | Gate 4 (reduzierte Transparenz) und Farbtreue; überschneidet sich mit V4-2 | V4-2 |
| 2 Dialoge | `fenster.jsx` (nicht importiert, erst klären), `bestaetigungsfrage.jsx`, `warndialog.jsx`, `speicherlage.jsx`, `teilkonflikt.jsx`, `tourleiste.jsx`, Dialogteile von `mobil.jsx` (13 Stellen) auf V4Dialog | 35 Dialogstellen in 16 Dateien; V4Dialog bringt Fokusfalle und Escape mit | V4-3 |
| 3 Telefon der Beschäftigten | `mobil.jsx` (L), `stempeluhr.jsx`, `krankmeldung.jsx`, Zeit-Familie | höchste Nutzerzahl; axe- und WP-40-Abdeckung vorhanden | V4-3 |
| 4 Plan und Lage | Monatsplan, Personaleinsatz, Lagebild, Zeitachse, Jahresansicht, Wochenliste, Dienstlage-Familie | Raster bleiben opak (Gate 5); WP-40-Markuptests vorhanden | V4-3 |
| 5 Personal, Standorte, Auswertung, Prüfung | je Familie ein PR | wenig Testbezug (Standorte 0/11) → zuerst axe-Flächen ergänzen | V4-3/V4-4 |
| 6 Einstellungen und Login | `einstellungen.jsx`, `main.jsx` (L), `betreiber-2fa.jsx`, `verlustweg.jsx` | Sicherheitsgate 6: 2FA/Sitzung unberührt; nur Form | V4-3 |
| 7 Betreiberkonsole | 12 Dateien | 0 Testbezug, getrennte Datenwelt | V4-3 |
| – Branchenmodule | 12 Dateien, Tokens „keine“ | paketabhängig, je Branche gemeinsam mit Welle 4/5 | V4-3 |

Je Welle kleine PRs (eine Familie oder ein Baustein), Konfliktzone `App.jsx` mit WP-40 und WP-48-GB abstimmen.

## 7. Screenshot-Baseline: Plan (nicht umgesetzt)

**Keine Binärdateien ins Repository.** In diesem Paket wurde keine Bilddatei erzeugt oder eingecheckt.

| Punkt | Plan |
|---|---|
| Matrix | 5 Betriebsrollen der Suite (mitarbeiter, subplaner, planer, leitung, betriebsrat) + Betreiber × Thema hell/dunkel × Breite. Breiten: 360, 768, 1440 (Kern) und 320 (Reflow); volle Gerätematrix (8 Viewports, `src/ui/geraete.js`) nur für die Telefonschale. |
| Umfang | Kern: 55 Ansichtszweige, je Rolle nur die erreichbaren (Abschnitt 3), dazu Telefonschale (4 Reiter) und Einstieg (Anmeldung, Fehlerseite). Grob: ca. 180 Rolle-Ansicht-Paare × 2 Themen × 3 Breiten ≈ 1 080 Bilder [Schätzung]. Minimalstart: die 11 Navigationseinträge mit axe-Fläche + Telefonschale × 2 × 3 ≈ 90 Bilder. |
| Werkzeug | Playwright `expect(page).toHaveScreenshot()` in einer eigenen Spec außerhalb der CI-Kette, gleiche Anmeldehilfen wie `e2e/hilfen.mjs`; `colorScheme` je Thema, `reducedMotion: "reduce"`, feste Uhr wie `e2e/uhr-vorlauf.mjs`, Animationen aus, `maxDiffPixelRatio` klein. |
| Datenschutz | `playwright.config.mjs` verbietet Bildschirmfotos, weil Zugangscodes im Anmeldefeld stehen. Deshalb: Anmeldefeld und jede Code-Anzeige mit `mask` abdecken, nur Wegwerfdaten aus `e2e/global-setup.mjs`, keine Produktions- oder Staging-Daten. |
| Speicherort | außerhalb des Repos (`snapshotPathTemplate` auf ein lokales Verzeichnis außerhalb des Arbeitsbaums, z. B. unter `%TEMP%`), Übergabe als lokales Archiv oder privates Objektspeicher-Ziel. Kein CI-Artefakt: das Repository ist öffentlich, Artefakte wären für angemeldete Dritte abrufbar. |
| Größe | PNG bei 360–1440 px ca. 50–250 KB [Schätzung]; 1 080 Bilder ≈ 100–250 MB, Minimalstart ≈ 10–20 MB. |
| Laufzeit / CI | Die axe-Suite braucht in der CI bereits ca. 28 von 40 Minuten (Job `browser-abnahme`, Lauf 44662721174). Eine Bildmatrix in der CI würde die Laufzeit erhöhen; daher **nicht in die CI** (auch Auftrag: kein Workflow). Lokal: Minimalstart ca. 5–10 min, Vollmatrix ca. 45–90 min [Schätzung]. |
| Aufwand | Spec und Hilfen 0,5–1 PT, erster Lauf und Durchsicht 0,5 PT, je Welle Nachziehen der Baseline 0,1 PT [Schätzung]. Gehört zu V4-4 (visuelle QA), dort Workflow-Änderung nur auf Betreiberauftrag. |

## 8. Verknüpfung zu Tests [belegt]

| Test | erfasst | Bezug laut Inventar |
|---|---|---|
| `pruefungen/v4-tokens.test.js` | Tokens vollständig, WCAG AA der Tokenpaare inkl. Glas, Themenwahl, nur `src/v4` trägt Hex | `src/v4/*` (4 Dateien), `main.jsx` |
| `pruefungen/v4-app-stil.test.js` | jede Overlay-Klasse kommt im App-Stil vor | `src/v4/app-stil.js`, `stil.js`, `tokens.js` |
| `pruefungen/kontrast.test.js` | Kontrast der Palette, Aufhellung `gestalt/lesbar.js` | `gestalt/lesbar.js`, `v4/app-stil.js` |
| `pruefungen/wcag-wp40.test.js` | Fehlertext-Verknüpfung im Markup, Bewertungsfunktionen WP-40 | 15 Dateien (u. a. `ui/bausteine.jsx`, Monatsplan, Personal, Krankmeldung) |
| `pruefungen/e2e-flaechen.test.js` + `e2e/*.spec.mjs` (axe) | Vertrag der axe-Flächen gegen die Navigation | 15 Dateien / 11 Navigationseinträge |
| `pruefungen/browser/wcag-wp40.mjs` (lokal, nicht CI) | Reflow, Zielgröße, Fokus, Fehlertext je Rolle | 12 Dateien / 11 Navigationseinträge |
| `pruefungen/browser/v4-abnahme.mjs` (lokal, nicht CI) | hell/dunkel, Reflow 320, Ziele, Fokus | nicht dateiweise zugeordnet |
| `pruefungen/v4-inventar.test.js` (neu) | dieses Inventar | alle 172 Dateien |

Zuordnung über die Beschriftung des Navigationseintrags ist dateigenau nur für geroutete Ansichten; für Dateien hinter
derselben Beschriftung (z. B. Einladungen unter „Personal“) ist sie [vermutet]. WCAG-Status je Datei laut WP-40: nur
„Testbezug ja/nein“ und Zahl der aria-/role-Attribute; eine WCAG-Bewertung je Datei gibt es nicht.

## Grenzen des Werkzeugs (bekannte Risiken)

- **App.jsx-Parser fragil:** Ansicht → Datei wird per Regex aus `aktiveView === "…" &&` und einem Fenster von
  1 200 Zeichen gelesen. Ein Umbau von `App.jsx` in V4-3 (z. B. Ansichtstabelle statt Zweigen) kann die Zuordnung
  brechen; der harte Test „jeder Navigationseintrag hat einen Ansichtszweig“ macht das sichtbar, dann Parser anpassen.
- **Determinismus** ist nur im selben Prozess geprüft (zwei Läufe hintereinander), nicht über Betriebssysteme hinweg;
  die Dateireihenfolge ist sortiert, die Zeilenenden werden auf LF gebracht.
- **Groß-/Kleinschreibung:** `existsSync` ist unter Windows unabhängig davon; ein falsch geschriebener Pfad in
  `ZUORDNUNG` fällt lokal nicht auf, erst in der CI (Linux).
- **Kommentarentfernung** für Farbliterale ist ein Regex: `//` innerhalb einer Zeichenkette (ohne vorangestelltes
  `:` oder Anführungszeichen) kann den Rest der Zeile abschneiden und ein Literal dort übersehen [vermutet: selten].
- **Abhängigkeit:** Das Werkzeug importiert `src/app/navigation.js` (zieht `react` nach) und `src/lib/rollen.js`;
  ohne `node_modules` (`npm ci`) läuft es nicht.

## 9. Volltabellen je Familie [belegt, erzeugt mit `--markdown`]

Spalten: Tokens = direkt / Palette / Bausteine / keine / Quelle; V4-Bst. = Stellen mit V4-Basiskomponente;
rgb/hex = Farbliterale ohne Kommentare; Overlay = Klassen der V4-Oberflächenschicht in `className`; Inline = `style={{`;
Glas o. R. = `backdrop-filter` ohne Rückfall; Dialog/Zustand = Stellen; Aufwand = Klasse [Schätzung].

Dateien: 172, Zeilen: 34844, geroutete Ansichten in App.jsx: 55, Navigationseinträge: 54

### Dienstlage / Dashboard (14)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/ablauf.jsx | Ablaufdiagramm und Einführung je Rolle | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 1 | 44 | 1 | 3+0 | 0 | 0 | – | M |
| ansichten/dienstbuch.jsx | Dienstbuch | leitung, planer, subplaner (Navigation) | Palette | 0 | 0/0 | 3 | 13 | 0 | 3+0 | 0 | 1 | – | S |
| ansichten/eskalation.jsx | Eskalation bei Unterdeckung | Schale/Dialog | Palette | 0 | 0/0 | 2 | 13 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/lagebild.jsx | Lagebild | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 1 | 23 | 0 | 0+0 | 0 | 0 | wcag-wp40, e2e-flaechen/axe, wp40-browser | S |
| ansichten/nachrichten.jsx | Nachrichten | Schale/Dialog | Palette | 0 | 0/0 | 1 | 6 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/notizen.jsx | Tagesnotizen | Schale/Dialog | Palette | 0 | 0/0 | 2 | 8 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/notrufe.jsx | Notrufe | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 9 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/prioritaeten.jsx | Start: Prioritäten | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 1 | 35 | 0 | 3+0 | 0 | 0 | – | M |
| ansichten/schichtuebergabe.jsx | Übergabe | leitung+Paket, planer+Paket, subplaner+Paket (Navigation) | Palette | 0 | 0/0 | 2 | 22 | 0 | 1+0 | 0 | 1 | – | S |
| ansichten/schwarzesbrett.jsx | Schwarzes Brett | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 1 | 13 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/tagesfazit.jsx | Tagesfazit | leitung, planer, betriebsrat (geerbt) | Palette | 0 | 0/0 | 1 | 5 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/tagesstart.jsx | Tagesstart | Schale/Dialog | Palette | 0 | 0/0 | 3 | 41 | 0 | 2+0 | 0 | 0 | – | S |
| ansichten/zeitachse.jsx | Zeitachse | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 46 | 0 | 0+0 | 0 | 1 | wcag-wp40 | M |
| module/wachbuch.jsx | Branchenmodul Wachbuch | Branchenmodul | keine | 0 | 0/0 | 0 | 5 | 0 | 1+0 | 0 | 0 | – | S |

### Monats-, Tages-, Jahresplan (24)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/ausgleichplanen.jsx | Ausgleich planen | Schale/Dialog | Palette | 0 | 0/0 | 2 | 9 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/bereitschaft.jsx | Bereitschaftsplan | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 6 | 0 | 0+0 | 0 | 1 | wcag-wp40 | S |
| ansichten/dienstkarte.jsx | Karte eines Dienstes | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 11 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/einsatzplan.jsx | Personaleinsatz | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 2 | 21 | 0 | 3+0 | 0 | 0 | wcag-wp40, e2e-flaechen/axe, wp40-browser | S |
| ansichten/freigabeleiste.jsx | Leiste Planfreigabe | leitung, planer, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 2 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/intelligence/Aenderungsuebersicht.jsx | KI: Änderungsübersicht | nicht importiert | keine | 0 | 0/0 | 0 | 4 | 0 | 1+5 | 0 | 0 | – | S |
| ansichten/intelligence/KiEntwurf.jsx | KI: Planentwurf | offen | keine | 0 | 0/0 | 0 | 11 | 0 | 9+4 | 0 | 0 | – | S |
| ansichten/jahresansicht.jsx | Jahresansicht | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 16 | 0 | 0+0 | 0 | 0 | wcag-wp40 | S |
| ansichten/mehrfach.jsx | Mehrfachbearbeitung im Plan | Schale/Dialog | Palette | 0 | 0/0 | 1 | 12 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/meineschichten.jsx | Meine Schichten | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 43 | 0 | 0+0 | 0 | 2 | wp40-browser | M |
| ansichten/monatsplan.jsx | Monatsplan | leitung, planer, betriebsrat (Navigation) | Palette | 0 | 0/0 | 2 | 34 | 0 | 2+1 | 0 | 0 | wcag-wp40, e2e-flaechen/axe, wp40-browser | S |
| ansichten/planstand.jsx | Planstand | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 14 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/schichtfolge.jsx | Schichtfolge | leitung, planer (Navigation) | Palette | 0 | 0/0 | 1 | 32 | 0 | 3+1 | 0 | 0 | – | S |
| ansichten/selbstplanung.jsx | Selbstplanung | leitung, planer, subplaner (Navigation) | Palette | 0 | 0/0 | 0 | 25 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/sondereinsaetze.jsx | Sondereinsätze | leitung, planer, subplaner, mitarbeiter (Navigation) | Palette | 0 | 0/0 | 0 | 17 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/tagesdetail.jsx | Tagesdetail | Schale/Dialog | Palette | 0 | 1/0 | 2 | 33 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/teamauslastungleiste.jsx | Leiste Teamauslastung | leitung, planer, betriebsrat (geerbt) | Palette | 0 | 0/0 | 1 | 3 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/wochenliste.jsx | Wochenliste | leitung, planer, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 22 | 0 | 0+0 | 0 | 0 | wcag-wp40 | S |
| module/bereichsplan.jsx | Branchenmodul Bereichsplan | Branchenmodul | keine | 0 | 0/0 | 0 | 4 | 0 | 1+0 | 0 | 0 | – | S |
| module/bereitschaftsdienst.jsx | Branchenmodul Bereitschaftsdienst | Branchenmodul | keine | 0 | 0/0 | 0 | 5 | 0 | 1+0 | 0 | 0 | – | S |
| module/funktionsdienst.jsx | Branchenmodul Funktionsdienst | Branchenmodul | keine | 0 | 0/0 | 0 | 4 | 0 | 1+0 | 0 | 0 | – | S |
| module/geteilterdienst.jsx | Branchenmodul geteilter Dienst | Branchenmodul | keine | 0 | 0/0 | 0 | 6 | 0 | 1+1 | 0 | 0 | – | S |
| module/kontimodelle.jsx | Branchenmodul Kontimodelle | Branchenmodul | keine | 0 | 0/0 | 0 | 15 | 0 | 1+1 | 0 | 0 | – | S |
| module/rotation.jsx | Branchenmodul Rotation | Branchenmodul | keine | 0 | 0/0 | 0 | 5 | 0 | 1+1 | 0 | 0 | – | S |

### Personal / Qualifikationen (14)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/einarbeitung.jsx | Einarbeitung | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 18 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/import-datei.jsx | Personalimport aus Datei | offen | Palette | 0 | 1/0 | 1 | 48 | 0 | 3+3 | 0 | 0 | – | M |
| ansichten/import.jsx | Import | Schale/Dialog | Palette | 0 | 2/0 | 2 | 33 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/kompetenzen.jsx | Kompetenzen | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 35 | 0 | 6+0 | 0 | 1 | – | M |
| ansichten/nachweise.jsx | Nachweise/Zertifikate | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 6 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/nachweispflege.jsx | Nachweispflege | Schale/Dialog | Palette | 0 | 0/0 | 0 | 9 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/personal.jsx | Personal | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 7 | 44 | 0 | 6+1 | 0 | 0 | wcag-wp40, e2e-flaechen/axe, wp40-browser | M |
| ansichten/personalakte.jsx | Personalakte | Schale/Dialog | Palette | 0 | 2/0 | 8 | 62 | 0 | 1+1 | 0 | 1 | – | M |
| ansichten/qualifikationsmatrix.jsx | Qualifikationen | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 1 | 14 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/selbstauskunft.jsx | Selbstauskunft | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 17 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/verfuegbarkeit.jsx | Verfügbarkeit | Schale/Dialog | Palette | 0 | 0/0 | 3 | 18 | 0 | 2+0 | 0 | 0 | – | S |
| ansichten/verteilung.jsx | Verteilung | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 19 | 0 | 0+0 | 0 | 0 | – | S |
| module/maschinenqual.jsx | Branchenmodul Maschinenqualifikation | Branchenmodul | keine | 0 | 0/0 | 0 | 7 | 0 | 0+0 | 0 | 0 | – | S |
| module/pflegequal.jsx | Branchenmodul Pflegequalifikation | Branchenmodul | keine | 0 | 0/0 | 0 | 6 | 0 | 1+1 | 0 | 0 | – | S |

### Standorte / Besetzung (11)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/betriebsmittel.jsx | Betriebsmittel | leitung, planer, subplaner, mitarbeiter (Navigation) | Palette | 0 | 0/0 | 2 | 18 | 0 | 3+0 | 0 | 1 | – | S |
| ansichten/dienstarten.jsx | Dienstarten und Mindestbesetzung (Soll) | leitung (Navigation) | Palette | 0 | 0/0 | 3 | 39 | 0 | 3+2 | 0 | 0 | – | M |
| ansichten/einsatzorte.jsx | Einsatzorte mit Koordinaten | Schale/Dialog | Palette | 0 | 0/0 | 1 | 11 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/ersatzliste.jsx | Ersatzvorschläge | offen | Palette | 0 | 0/0 | 2 | 35 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/kapazitaetsvorschau.jsx | Kapazitätsvorschau | offen | Palette | 0 | 0/0 | 1 | 9 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/offeneschichten.jsx | Offene Schichten | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 47 | 0 | 0+0 | 0 | 2 | – | M |
| ansichten/schnellbesetzung.jsx | Schnellbesetzung | Schale/Dialog | Palette | 0 | 0/0 | 5 | 33 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/standorte.jsx | Standorte | Schale/Dialog | Palette | 0 | 0/0 | 1 | 16 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/standortespiegel.jsx | Standortespiegel | offen | Palette | 0 | 0/0 | 0 | 8 | 0 | 0+0 | 0 | 0 | – | S |
| module/anlagen.jsx | Branchenmodul Anlagen | Branchenmodul | keine | 0 | 0/0 | 0 | 6 | 0 | 1+0 | 0 | 0 | – | S |
| module/posten.jsx | Branchenmodul Posten | Branchenmodul | keine | 0 | 0/0 | 0 | 4 | 0 | 1+0 | 0 | 0 | – | S |

### Zeit, Urlaub, Abwesenheit (16)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/antraege.jsx | Anträge bearbeiten | nicht importiert | Palette | 0 | 0/0 | 0 | 11 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/antraegegeteilt.jsx | Anträge, Liste und Detail | leitung, planer, subplaner (Navigation) | Palette | 0 | 0/0 | 0 | 39 | 0 | 2+0 | 0 | 1 | e2e-flaechen/axe, wp40-browser | M |
| ansichten/kontoblatt.jsx | Stundenkonto-Blatt | mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 14 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/korrekturantraege.jsx | Korrekturanträge | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 12 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/korrekturen.jsx | Zeitkorrekturen (Formular) | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 44 | 0 | 4+0 | 0 | 0 | – | S |
| ansichten/korrekturoffene.jsx | Offene Korrekturen | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 10 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/krankmeldung.jsx | Krankmeldung | Schale/Dialog | Palette | 0 | 0/0 | 0 | 10 | 0 | 4+1 | 0 | 0 | wcag-wp40, e2e-flaechen/axe | S |
| ansichten/krankmeldungen-offen.jsx | Krankmeldungen in Bearbeitung | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 18 | 0 | 9+2 | 0 | 0 | wcag-wp40 | S |
| ansichten/monatsabschluss.jsx | Monatsabschluss | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 25 | 0 | 3+0 | 0 | 0 | – | S |
| ansichten/monatskorrektur.jsx | Korrekturrevision nach Lohnexport | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 15 | 0 | 2+0 | 0 | 0 | – | S |
| ansichten/stempelpuffer.jsx | Stempelpuffer (offline) | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 4 | 0 | 1+1 | 0 | 0 | – | S |
| ansichten/stempeluhr.jsx | Stempeluhr | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 14 | 0 | 2+0 | 0 | 0 | e2e-flaechen/axe | S |
| ansichten/tauschboerse.jsx | Tauschbörse | leitung, planer, subplaner, mitarbeiter (Navigation) | Palette | 0 | 0/0 | 0 | 15 | 0 | 0+0 | 0 | 1 | e2e-flaechen/axe, wp40-browser | S |
| ansichten/ungeplanthinweis.jsx | Hinweis ungeplanter Dienst | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 2 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/urlaubsrunde.jsx | Urlaubsrunde | leitung, planer, subplaner (geerbt) | Palette | 0 | 0/0 | 1 | 26 | 0 | 1+0 | 0 | 1 | – | S |
| ansichten/wunschdienste.jsx | Wunschdienste | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 23 | 0 | 2+0 | 0 | 0 | – | S |

### Auswertung / Export (8)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/abrechnungsdaten.jsx | Abrechnungsdaten | leitung, planer, subplaner (Navigation) | Palette | 0 | 0/0 | 0 | 22 | 0 | 5+0 | 0 | 1 | e2e-flaechen/axe, wp40-browser | S |
| ansichten/auftraggeberbericht.jsx | Leistungsnachweis für Auftraggeber | leitung, planer, subplaner, mitarbeiter (Navigation) | Palette | 0 | 0/0 | 1 | 11 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/belastbarkeit.jsx | Belastbarkeit des Plans | leitung, planer, subplaner (Navigation) | Palette | 0 | 0/0 | 3 | 39 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/belastung.jsx | Belastung je Person | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 20 | 0 | 1+0 | 0 | 1 | – | S |
| ansichten/datenmitnahme.jsx | Datenmitnahme (Export) | leitung (Navigation) | Palette | 0 | 0/0 | 0 | 6 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/lohnausgabe.jsx | Lohnausgabe | leitung, planer, subplaner (geerbt) | Palette | 0 | 0/0 | 0 | 22 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/therapieminuten.jsx | Therapieminuten | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 21 | 0 | 3+0 | 0 | 1 | – | S |
| module/objektbericht.jsx | Branchenmodul Objektbericht | Branchenmodul | keine | 0 | 0/0 | 0 | 5 | 0 | 1+0 | 0 | 0 | – | S |

### Regelprüfung / Prüfungen (9)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/einsatzregelliste.jsx | Einsatzregeln | offen | Palette | 0 | 0/0 | 0 | 3 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/lenkzeiten.jsx | Lenkzeiten | leitung, planer, subplaner, mitarbeiter (Navigation) | Palette | 0 | 0/0 | 1 | 19 | 0 | 6+0 | 0 | 1 | – | S |
| ansichten/planungsreife.jsx | Planungsreife (Prüfliste vor dem Planen) | offen | Palette | 0 | 0/0 | 0 | 5 | 0 | 1+1 | 0 | 0 | – | S |
| ansichten/pruefung.jsx | Prüfung | leitung, planer, betriebsrat (Navigation) | Palette | 0 | 0/0 | 2 | 53 | 0 | 4+1 | 0 | 1 | e2e-flaechen/axe, wp40-browser | M |
| ansichten/regelwerk.jsx | Regelwerk einstellen | Schale/Dialog | Palette | 0 | 0/0 | 0 | 5 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/untergrenzen.jsx | Untergrenzen | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 13 | 0 | 1+0 | 0 | 2 | – | S |
| ansichten/vorgaben.jsx | Interne Vorgaben | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | Palette | 0 | 0/0 | 2 | 25 | 0 | 1+2 | 0 | 1 | – | S |
| ansichten/warndialog.jsx | Warndialog bei Regelbefund | Schale/Dialog | Palette | 0 | 0/0 | 2 | 29 | 0 | 3+0 | 0 | 0 | – | S |
| pruefung.jsx | Selbsttest/Prüfanzeige (dynamisch geladen) | offen | Palette | 0 | 0/77 | 0 | 0 | 0 | 0+0 | 0 | 0 | – | XL |

### Rollen / Einstellungen / Login (20)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/anmeldung.jsx | Anmeldung in der App | Schale/Dialog | Palette | 0 | 1/0 | 1 | 37 | 0 | 1+0 | 2 | 0 | – | S |
| ansichten/assistent.jsx | Einrichtungsassistent | Schale/Dialog | Palette | 0 | 0/0 | 1 | 19 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/assistent2.jsx | Einrichtungsassistent, zweite Fassung | Schale/Dialog | Palette | 0 | 0/0 | 8 | 99 | 0 | 7+0 | 0 | 0 | – | M |
| ansichten/datenschutz.jsx | Datenschutz und Löschlauf | leitung (Navigation) | Palette | 0 | 0/0 | 1 | 16 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/einladungen.jsx | Einladungen und Zugänge | leitung, planer, subplaner, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 26 | 0 | 3+5 | 0 | 0 | e2e-flaechen/axe, wp40-browser | M |
| ansichten/einstellungen.jsx | Einstellungen | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 1 | 22 | 0 | 4+2 | 0 | 0 | e2e-flaechen/axe | M |
| ansichten/einwilligungen.jsx | Einwilligungen | offen | Palette | 0 | 0/0 | 0 | 10 | 0 | 2+1 | 0 | 0 | – | S |
| ansichten/geo-schalter.jsx | Schalter Geo-Prüfung | Schale/Dialog | Palette | 0 | 0/0 | 0 | 11 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/jugendschutz-schalter.jsx | Schalter Jugendschutz | Schale/Dialog | Palette | 0 | 0/0 | 0 | 4 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/mailbestaetigung.jsx | Mailadresse bestätigen | leitung, planer, subplaner, mitarbeiter, betriebsrat, mitarbeiter (Telefon) (geerbt) | Palette | 0 | 0/0 | 0 | 7 | 0 | 1+3 | 0 | 0 | – | S |
| ansichten/offline-schalter.jsx | Schalter Offlinebetrieb | Schale/Dialog | Palette | 0 | 0/0 | 0 | 4 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/planfreigabeschalter.jsx | Schalter Planfreigabe | Schale/Dialog | Palette | 0 | 0/0 | 0 | 5 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/sicherungausserhaus.jsx | Sicherung außer Haus | leitung (geerbt) | Palette | 0 | 0/0 | 2 | 25 | 0 | 0+3 | 0 | 0 | – | S |
| ansichten/sicherungenverwalten.jsx | Sicherungen verwalten | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 15 | 0 | 0+3 | 0 | 1 | – | S |
| ansichten/tarifwerk.jsx | Tarifwerk | Schale/Dialog | Palette | 0 | 0/0 | 1 | 25 | 0 | 1+0 | 0 | 0 | – | S |
| betreiber-2fa.jsx | Zwei-Faktor für Betreiber und Zugänge | betreiber (Navigation) | keine | 0 | 0/0 | 0 | 18 | 0 | 0+1 | 0 | 0 | – | S |
| main.jsx | Einstieg: Anmeldung, Registrierung, Fehlerseiten vor der App | vor Anmeldung (Einstieg) | direkt | 0 | 0/0 | 0 | 161 | 0 | 9+4 | 1 | 0 | v4-tokens | L |
| module/kern.jsx | Branchenmodule: Kern und Ausnahmeweg | Schale/Dialog | keine | 0 | 0/0 | 0 | 43 | 0 | 5+4 | 1 | 0 | – | M |
| rechtstexte.jsx | Impressum, Datenschutzerklärung, Rechtsfenster | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 2/0 | 0 | 26 | 0 | 6+2 | 1 | 0 | e2e-flaechen/axe | M |
| verlustweg.jsx | Kontowiederherstellung bei Geräteverlust | betreiber (geerbt) | keine | 0 | 0/0 | 0 | 25 | 0 | 5+11 | 1 | 0 | – | M |

### Betreiberkonsole (12)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ansichten/adressaenderungen.jsx | Adressänderungen der Mandanten | betreiber (Navigation) | Palette | 0 | 0/0 | 0 | 7 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/betreiber-tarife.jsx | Tarife | betreiber (Navigation) | Palette | 0 | 0/0 | 2 | 16 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/betreiberdetail.jsx | Mandantendetail | Schale/Dialog | Palette | 0 | 0/0 | 1 | 54 | 0 | 0+0 | 0 | 0 | – | M |
| ansichten/betreibermandanten.jsx | Mandantenliste | betreiber (Navigation) | Palette | 0 | 1/0 | 3 | 27 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/betreiberrechnungen.jsx | Rechnungen | betreiber (Navigation) | Palette | 0 | 0/0 | 1 | 17 | 0 | 0+0 | 0 | 1 | – | S |
| ansichten/demozugaenge.jsx | Demozugänge | betreiber (Navigation) | Palette | 0 | 0/0 | 0 | 24 | 0 | 0+0 | 0 | 4 | – | S |
| ansichten/mandantanlegen.jsx | Mandant anlegen | betreiber (geerbt) | Palette | 0 | 0/0 | 2 | 57 | 0 | 8+0 | 0 | 0 | – | M |
| ansichten/mandantenrechner.jsx | Mandantenrechner | betreiber (Navigation) | Palette | 0 | 0/0 | 0 | 31 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/mandantneuanlegen.jsx | Neuer Mandant | betreiber (Navigation) | Palette | 0 | 0/0 | 0 | 22 | 0 | 0+1 | 0 | 0 | – | S |
| ansichten/pakete.jsx | Pakete | betreiber (Navigation) | Palette | 0 | 0/0 | 0 | 28 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/preisgestaltung.jsx | Preisgestaltung | offen | Palette | 0 | 0/0 | 0 | 25 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/selbststarts.jsx | Selbststarts | betreiber (Navigation) | Palette | 0 | 0/0 | 0 | 31 | 0 | 0+0 | 0 | 1 | – | S |

### Öffentliche Website (0)

Keine Datei im App-Repository.

### Querschnitt (Baustein, Schale, Dialog) (44)

| Datei | Zweck | Rollen (Art) | Tokens | V4-Bst. | rgb/hex | Overlay | Inline | Glas o. R. | aria+role | Dialog | Zustand | Tests | Aufwand |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| App.jsx | Anwendungsschale: Navigation, Ansichtswahl, Dialogblock, Stil | alle (Schale) | direkt | 0 | 25/9 | 7 | 87 | 1 | 15+3 | 5 | 3 | wcag-wp40, wp40-browser | XL |
| ansichten/ansichtleiste.jsx | Leiste zur Ansichtswahl | nicht importiert | Palette | 0 | 0/0 | 0 | 5 | 0 | 1+0 | 0 | 0 | – | S |
| ansichten/bestaetigungsfrage.jsx | Bestätigungsdialog | Schale/Dialog | Palette | 0 | 0/0 | 2 | 11 | 1 | 2+1 | 1 | 0 | – | S |
| ansichten/bestaetigungstext.jsx | Bestätigung per Texteingabe | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | keine | 0 | 0/0 | 0 | 4 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/einheitwahl.jsx | Einheitenwahl | leitung, planer, subplaner (geerbt) | Bausteine | 0 | 0/0 | 0 | 1 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/fenster.jsx | Dialograhmen (Fenster) | nicht importiert | keine | 0 | 0/0 | 1 | 3 | 1 | 2+1 | 1 | 0 | – | S |
| ansichten/handbuch.jsx | Handbuch | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 2 | 31 | 0 | 2+1 | 0 | 2 | – | S |
| ansichten/hilfe-frage.jsx | Hilfe: Frage stellen | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 19 | 0 | 7+2 | 0 | 0 | – | S |
| ansichten/hilfe.jsx | Hilfe | leitung, planer, subplaner, mitarbeiter, betriebsrat (Navigation) | Palette | 0 | 0/0 | 0 | 8 | 0 | 1+0 | 0 | 0 | e2e-flaechen/axe | S |
| ansichten/intelligence/KiAntwort.jsx | KI: Antwort | nicht importiert | keine | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/kommandoleiste.jsx | Befehlsleiste/Suche | Schale/Dialog | Palette | 0 | 1/0 | 1 | 15 | 1 | 10+4 | 1 | 0 | – | S |
| ansichten/ladefehler.jsx | Ladefehlerseite | Schale/Dialog | Palette | 0 | 0/0 | 0 | 5 | 0 | 0+1 | 0 | 0 | – | S |
| ansichten/mobil.jsx | Telefonschale der Beschäftigten (Heute, Mein Plan, Anliegen, Mehr) | mitarbeiter (Telefon) (Navigation) | Palette | 0 | 0/0 | 3 | 241 | 0 | 18+1 | 13 | 1 | wcag-wp40, e2e-flaechen/axe, wp40-browser | L |
| ansichten/schrittleiste.jsx | Schrittleiste | betreiber (geerbt) | Palette | 0 | 0/0 | 0 | 5 | 0 | 0+0 | 0 | 0 | – | S |
| ansichten/speicherlage.jsx | Speicher-, Offline- und Konfliktzustand | Schale/Dialog | Palette | 0 | 0/0 | 4 | 29 | 1 | 3+3 | 1 | 0 | – | M |
| ansichten/teilkonflikt.jsx | Teilkonflikt beim Speichern | Schale/Dialog | Palette | 0 | 0/0 | 3 | 20 | 1 | 6+5 | 2 | 0 | – | S |
| ansichten/testablauf.jsx | Testablauf (Selbsttest-Anzeige) | Schale/Dialog | Palette | 0 | 0/0 | 0 | 5 | 0 | 0+1 | 0 | 0 | – | S |
| ansichten/tourleiste.jsx | Tour/Einführung | leitung, planer, subplaner, mitarbeiter, betriebsrat (geerbt) | Palette | 0 | 0/0 | 0 | 33 | 0 | 6+2 | 2 | 0 | – | M |
| gestalt/ansichten.jsx | Gestalt: Seitenkarte, Kennzahlen, Fehlerband … | Querschnitt | Palette | 0 | 0/0 | 3 | 10 | 0 | 6+4 | 0 | 0 | wcag-wp40 | S |
| gestalt/bausteine.jsx | Gestalt: Pille, Trend, Sparkline … | Querschnitt | Palette | 0 | 0/0 | 0 | 23 | 0 | 11+7 | 0 | 0 | – | M |
| gestalt/icons.jsx | Symbole | Querschnitt | keine | 0 | 0/0 | 0 | 1 | 0 | 1+0 | 0 | 0 | – | S |
| gestalt/lesbar.js | Kontrastaufhellung | Querschnitt | keine | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | kontrast | S |
| gestalt/rahmen.jsx | Gestalt: Kopfblock, Bildmarke | Querschnitt | Palette | 0 | 0/0 | 6 | 23 | 0 | 25+6 | 0 | 0 | wcag-wp40 | S |
| gestalt/stil.js | Gestalt-Stil (Leitstand) | Querschnitt | Palette | 0 | 0/0 | 0 | 0 | 10 | 2+0 | 0 | 0 | – | M |
| marke.jsx | C-Bildmarke (SVG/Canvas) | offen | keine | 0 | 0/3 | 0 | 1 | 0 | 1+0 | 0 | 0 | – | S |
| ringregler.jsx | Ringregler (Eingabebaustein) | betreiber (geerbt) | Palette | 0 | 0/0 | 0 | 11 | 0 | 7+2 | 0 | 0 | – | M |
| startbild.jsx | Startbild/Ladebild | offen | Palette | 0 | 1/0 | 0 | 8 | 0 | 4+1 | 0 | 0 | – | M |
| ui/bausteine.jsx | Grundbausteine: Card, Btn, Inp, Field, Leer, Laden … | Querschnitt | Palette | 0 | 0/0 | 7 | 37 | 0 | 8+4 | 0 | 0 | wcag-wp40 | M |
| ui/diagramme.jsx | Diagramme | Querschnitt | Palette | 0 | 0/0 | 0 | 34 | 0 | 0+0 | 0 | 0 | – | S |
| ui/dialogfokus.js | Fokusführung in Dialogen | Querschnitt | keine | 0 | 0/0 | 0 | 0 | 0 | 0+1 | 1 | 0 | – | S |
| ui/farbwahl.jsx | Farbwahl | Querschnitt | Palette | 0 | 2/1 | 0 | 5 | 0 | 4+1 | 0 | 0 | – | S |
| ui/geraete.js | Gerätematrix (Viewports) | Querschnitt | Palette | 0 | 0/0 | 0 | 0 | 0 | 6+0 | 0 | 0 | – | S |
| ui/leisten.jsx | Leisten, Zellen, Balken, Standortwahl | Querschnitt | Palette | 0 | 2/0 | 3 | 20 | 0 | 4+1 | 1 | 0 | – | S |
| ui/logo.jsx | Logo | Querschnitt | keine | 0 | 0/0 | 0 | 0 | 0 | 2+1 | 0 | 0 | – | S |
| ui/raster.js | Rasterberechnung | Querschnitt | keine | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | – | S |
| ui/schriftart.js | Schriftart | Querschnitt | keine | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | – | S |
| ui/scrollbereich.jsx | Scrollbereich | Querschnitt | keine | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | – | S |
| ui/thema.js | Themenbrücke (lesbar, NUM) | Querschnitt | Palette | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | – | S |
| ui/ziehen.jsx | Ziehen und Ablegen | Querschnitt | Palette | 0 | 0/1 | 0 | 6 | 0 | 0+0 | 0 | 0 | – | S |
| v4/app-stil.js | V4-Oberflächenschicht (Overlay) | Querschnitt | Quelle | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | v4-tokens, v4-app-stil, kontrast | S |
| v4/komponenten.jsx | V4-Basiskomponenten | Querschnitt | Quelle | 0 | 0/0 | 0 | 0 | 0 | 5+3 | 1 | 0 | v4-tokens | S |
| v4/stil.js | V4-Stil der Basiskomponenten | Querschnitt | Quelle | 0 | 0/0 | 0 | 0 | 0 | 2+0 | 0 | 0 | v4-tokens, v4-app-stil | S |
| v4/thema.js | Themenwahl hell/dunkel | Querschnitt | Quelle | 0 | 0/0 | 0 | 0 | 0 | 0+0 | 0 | 0 | v4-tokens | S |
| v4/tokens.js | V4-Tokens (Quelle) | Querschnitt | Quelle | 0 | 17/58 | 0 | 0 | 0 | 0+0 | 0 | 0 | v4-tokens, v4-app-stil | M |

