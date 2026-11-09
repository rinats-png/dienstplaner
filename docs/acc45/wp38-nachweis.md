# WP-38 Nachweis — Toter Code, eine Planrechnung (Teil 1: sicher ungenutzter Code)

Branch `feature/ready-kleinpakete`, Basis `9aac167`. Konfliktzone App.jsx: **nicht geändert** (siehe unten).

## Was ist entfernt

Gefunden über die Lint-Regel `no-unused-vars` (ESLint, Konfiguration des Projekts) in den Serverdateien. Jeder
Bezeichner wurde zusätzlich mit einer Suche über das ganze Repo geprüft (Server, src, pruefungen).

| Datei | Entfernt | Beleg |
|---|---|---|
| `server/funktionen/daten.mjs` | Importe `findeKonto`, `umschluesseln`, `timingSafeEqual`; die ungenutzte Funktion `gleich` | ESLint: 3 Meldungen; Suche: keine Verwendung außerhalb der Deklaration |
| `server/funktionen/einrichten.mjs` | `hash` (Funktion) und der Import `createHash` | ESLint: 1 Meldung; `createHash` nur noch dort |
| `server/funktionen/starten.mjs` | `hash` (Funktion) und der Import `createHash`; `catch (e)` ohne Verwendung wird `catch` | ESLint: 2 Meldungen |

`daten.mjs` enthält zusätzlich die Änderungen aus WP-47b, die bereits in `87071b3` stehen; dieser Commit umfasst
nur die Entfernungen.

Nichts davon wird von Tests oder Exporten gebraucht. Keine Verhaltensänderung: Die Symbole wurden nirgends
aufgerufen (ESLint belegt das für jede Datei).

## Tests

Neue Datei `pruefungen/wp38-toter-code.test.js` (1 Test). Sie lässt ESLint über die drei Dateien laufen und fordert
keine Meldung der Regel `no-unused-vars`. Ohne die Entfernungen rot (6 Meldungen: `findeKonto`, `umschluesseln`,
`gleich`, je `hash` in `einrichten` und `starten`, `e` in `starten`). Danach grün.

Gezielt grün: `wp38-toter-code` (1), `starten` (31), `wp47b-lesebremse` (15): **3 Dateien, 47 Tests**.
`npx eslint` auf die drei Dateien: 0 Meldungen.

## Nicht umgesetzt (bewusst, Begründung)

1. **`Tagesstart` in `src/App.jsx`** (Akzeptanz „Tagesstart u. a. entfernt/eingebunden“): Die Funktion wird nicht
   gerendert, ist aber exportiert und von zwei Prüfungen benutzt (`pruefungen/oberflaeche-render.test.js`,
   `pruefungen/ungeplante-dienste.test.js`). Die Entfernung betrifft rund 130 Zeilen in App.jsx; das liegt über der
   Grenze von etwa 40 Zeilen für die Konfliktzone. Nicht geändert; Frage 10 in
   `docs/acc45/wp-kleinpakete-fragen.md`.
2. **„Eine Planrechnung“**: Es gibt zwei Umsetzungen derselben Regel (`personTag` in App.jsx, `geplanterDienst` in
   `server/lib/zeiterfassung.mjs`, dort als technische Schuld benannt). Zusammenführen heißt Umbau, nicht Entfernen,
   und berührt App.jsx stark. Nicht umgesetzt; Frage 9.

Die Suche nach exportiertem, ungenutztem Code (Node-Skript über alle `export`-Namen in `server` und `src`) fand
keinen Kandidaten: Jeder Export wird irgendwo benutzt, meist in den Prüfungen. Das ist kein Beleg dafür, dass
kein Code tot ist, sondern dass ungenutzte Exporte mit den Prüfungen mitgeschleppt werden.

## Teil 2: eine Planrechnung (Server)

Bestand vor der Änderung: `server/lib/zeiterfassung.mjs` trug eine eigene Kopie von `einheitAm`, `imDienst`,
`versatzTageVon`, `zyklusLaenge`, `einheitDienst`, `idStreu`, `teilzeitDienst` und die Abwesenheitsprüfung —
Zeichen für Zeichen dieselbe Regel wie in `server/lib/fachpruefung.mjs` (`dienstAm` und Helfer). Der Client
(`personTag`, `server/lib/engine/plan.mjs`) nutzt die Helfer aus `fachpruefung.mjs` bereits.

Änderung: `geplanterDienst` prüft nur noch die Eingabe (Betrieb, Person, Tag im Format JJJJ-MM-TT) und ruft
`dienstAm`; `imDienst` wird aus `fachpruefung.mjs` weitergereicht (Export bleibt). Entfernt: rund 60 Zeilen
Kopie samt `zwischen` und `wochentag`; der Hinweis „technische Schuld, zwei Planrechnungen“ ist erledigt.

Verhaltensgleichheit: Vor dem Entfernen wurde die alte Fassung (aus `HEAD`) gegen die neue auf dem Demobestand
verglichen: je Person fünf Fälle (unverändert, Teilzeit nach Quote, Teilzeit nach Wochentagen, Springer, ohne
Eintritt) mal 400 Tage, alle Antworten gleich. Dauerhaft festgehalten in `pruefungen/wp38-toter-code.test.js`
(jetzt 4 Tests: Lint inkl. `zeiterfassung.mjs`, keine Kopie im Quelltext, Gleichheit mit `dienstAm`, ungültige Eingaben).

Unterschied nur bei kaputten Rohdaten (nicht als Verhalten gedacht): Einträge in `zugehoerigkeit`, die keine
Objekte sind, überspringt `fachpruefung.mjs`; die alte Kopie wertete sie als Einheit `undefined`.

Tests: 44 Prüfdateien, die `zeiterfassung.mjs` oder `fachpruefung.mjs` laden, vorher 1788 grün und 6 Zeitüberschreitungen
(Last auf dem Rechner, 5 s Grenze bei Server-Tests), nachher alle 1859 Tests in 45 Dateien grün.

## Weiterhin offen (nicht gelöscht, Begründung)

- `Tagesstart` (`src/ansichten/tagesstart.jsx`): wird nirgends gerendert, aber `oberflaeche-render.test.js` und
  `ungeplante-dienste.test.js` rendern ihn und prüfen dieselbe Aussage wie `MHeute`. Entfernen hieße diese Prüfungen
  streichen; nach der Regel „keine Prüfung abschwächen“ nicht umgesetzt. Entscheidung nötig (Frage 10).
- `src/pruefung.jsx` (Selbsttest, 7771 Zeilen): trägt eigene Kopien von `einheitAm`, `imDienst`, `einheitDienst`,
  `teilzeitDienst`; `person-eintritt.test.js` (A1-3) prüft den Quelltext dieser Kopie. Nicht angefasst.
- `personTag` (Client, mit Posten und Entwurf) und `dienstAm` (Server, ohne Posten) bleiben zwei Funktionen mit
  derselben Grundrechnung; die Grundrechnung liegt nur noch einmal vor.
