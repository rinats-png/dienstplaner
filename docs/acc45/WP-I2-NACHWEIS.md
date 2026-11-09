# WP-I2 Nachweis: Live-Prüfung Schichtfolge-Editor

Strang intelligence, Basis `origin/integration/release-v4`. Keine neue Regellogik, keine KI.

## Änderung

- `src/lib/rasterpruefung.js` (neu): `rasterBefunde(m)` ruft die bestehende Planprüfung `pruefen` über einen vollen Zyklus ab dem Montag der laufenden Woche auf und behält die Befundarten, die vom Raster abhängen (`RASTER_ARTEN`: Ruhezeit, Folge, Nachtfolge, Tagesgrenze, Pause, Ersatzruhe, Sonntagsfrei, Schutz). Besetzung, Fachkraftquote, Qualifikation und Entgelt hängen am Tagesplan und sind ausgenommen.
- `src/ansichten/schichtfolge.jsx`: Bereich „Live-Prüfung" (nur diese Funktion, Konfliktzone App.jsx nicht berührt). Der Zustand `m` ändert sich bei jedem Klick im Raster; die Anzeige rechnet daraus neu, ohne Speicherschritt. Hinweis, keine Sperre.
- `package.json`, `.github/workflows/pruefung.yml`: neues Skript `pruefung:schichtfolge-live` (sonst schlägt die Verdrahtungsprüfung an).

## Tests (`pruefungen/ki-schichtfolge-live.test.js`)

- Rot (vor der Umsetzung): 0 von 11 lauffähig, Suite scheitert am fehlenden Modul `rasterpruefung.js`.
- Zwischenstand: 9 von 11 grün; zwei Fehler lagen an meiner Annahme im Test (genau 8 h Ruhe ergibt in `pruefen` Stufe „warn", „danger" erst unter 8 h). Test angepasst an die bestehende Regel, die Regel selbst blieb unverändert.
- Grün: 11 von 11. Zusätzlich grün: `oberflaeche-render.test.js` (22), `wp39-app-aufbau.test.js`, `verdrahtung.test.js` (nach Verdrahtung).
- Inhalte: Raster mit 8 h Ruhe zeigt Ruhezeitbefund; 16 h keinen; jeder Befund ist ein Befund von `pruefen` über dasselbe Fenster (Identität, auch umgekehrt); Besetzung/Quote ausgeschlossen; Rasteränderung ändert den Befund sofort; Folge-Grenzwert; Gruppierung nach Stufe; leeres Raster; Ansicht rendert „Live-Prüfung" mit und ohne Befund.

Kein bestehender Test wurde geändert oder abgeschwächt.

## Offen

- Die bestehenden Kacheln und das Hinweisband der Simulation bleiben unverändert daneben stehen.
- Browser-/Smartphone-Sichtprüfung der neuen Fläche nicht durchgeführt.
- Keine Statusänderung in `work-packages.json`.
