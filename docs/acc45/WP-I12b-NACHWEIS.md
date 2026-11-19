# WP-I12b — Paketliste und Regelkennung serverseitig (Fragen 1 und 6)

Basis: integration/release-v4. Verhalten gleich, Paketinhalte (Merkmale, Preise, Zustände) unverändert.

## Ist-Stand (vorher)

- `PAKETE` stand in `src/stufen.js`, `kannMerkmal` in `src/paketlogik.js`; das Docker-Bild enthält `src/` nicht.
- Der Rechenkern (`server/lib/engine/befunde.mjs`) hatte nur einen Haken (`merkmalPruefungSetzen`), den `src/lib/fachlogik.js` beim Laden setzte. Ohne Client galt kein Merkmal als nutzbar; `fachkraftLage` lieferte serverseitig immer `null`.

## Frage 1 — umgesetzt

- Neu: `server/lib/paketliste.mjs` ist die gemeinsame Quelle: `PAKETE_ROH`, `mitModulstand`, `PAKETE`, `paketVon`, `inVorbereitungModule`, `kannMerkmal`. Es importiert nur `branchenmodule.mjs` und `paketstand.mjs` (beide bereits Server).
- `src/stufen.js` und `src/paketlogik.js` reichen dieselben Objekte nur weiter (kein zweite Kopie; Test prüft Objektgleichheit).
- `befunde.mjs`: Vorgabe des Haken ist `kannMerkmal`; `fachlogik.js` setzt den Haken nicht mehr. `merkmalPruefungSetzen` / `mitMerkmalen` bleiben für Aufrufer, die Merkmale vorgeben (`rechnen`: `o.merkmale`).
- Folge: die Fachkraftquote rechnet serverseitig aus `m.pakete` ohne `src/`.

## Tests (pruefungen/engine-paketliste.test.js, neu, 7 Tests)

- Rot gegen den Ist-Stand: 6 von 7 rot (Modul fehlt; Fachkraftquote serverseitig `null`), 1 grün.
- Nach dem Umbau: 7 von 7 grün.
- Zusammen mit engine-rechenkern, g9-verkauf, g9-nachtrag, branchenmodule, branchen, modul-kern-oberflaeche: 7 Dateien, 171 Tests grün (sequenziell, `--testTimeout=120000`; bei parallelem Lauf unter Last liefen einzelne Quelltext-Tests der g9-Dateien in das 5-s-Zeitlimit, einzeln und sequenziell grün).
- `node werkzeug/sicherheit/statik.mjs`: keine unbegründeten harten Treffer.

## Frage 6 — offen (nicht umgesetzt)

`regelIdFuerBefund` ist kein reines Datenmodell ohne Client-Abhängigkeit: `src/regelregister.js` importiert `src/regelwerk.js`, `src/warnstufen.js`, `src/fahrzeit.js`, `src/ppprl.js` und `src/tarifwerke.js`. Eine serverseitige Übernahme verlangt, diese Module (oder ihre benötigten Konstanten) ebenfalls nach `server/lib` zu verlagern. Das ist ein eigenes Paket; `befund.regel` bleibt die Befundart.

## Offene Punkte

- Frage 6 als eigenes Paket (Verlagerung von regelregister und seiner src-Abhängigkeiten).
- `docs/acc45/wp-i12-fragen.md` und `work-packages.json` unverändert (SSOT beim Koordinator); Frage 1 gilt damit als beantwortet.
