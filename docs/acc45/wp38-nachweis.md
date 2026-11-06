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
