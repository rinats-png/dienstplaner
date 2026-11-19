# Intelligence-Oberfläche: Grundlage und Einhängepunkte

Stand 2026-11-12, Basis integration/release-v4. Alle Schalter bleiben aus; es gibt keinen Produktivaufruf eines Anbieters.

## Grundlage (hier umgesetzt)

`server/lib/intelligence/schemas.mjs` zählte mit `Buffer.byteLength`. Dieselbe Datei läuft über `ki-client.js` und `anzeige.js` im Browser (KiAntwort, WP-I17). Dort gibt es kein `Buffer`; die Zustände fertig, Rückfall und Injektion brachen. Jetzt zählt `server/lib/intelligence/bytes.mjs` (`byteLaenge`, TextEncoder, abhängigkeitsfrei). Ergebnis gleich zu `Buffer.byteLength`, auch für einzelne Surrogate (beide ersetzen durch U+FFFD, 3 Bytes). Übrige Node-APIs (`Buffer`, `process`, `node:`) in `src/ansichten/intelligence/*`, `schemas.mjs`, `felder.mjs`: keine. Prüfung: `pruefungen/intelligence-oberflaeche-browser.test.js` (`npm run pruefung:intelligence-browser`).

## Einhängepunkte: bewusst nichts eingehängt

KiAntwort und Änderungsübersicht haben heute keinen Verbraucher, der ohne Route oder Produktentscheidung auskommt.

| Komponente | Fehlt | Entscheidung |
|---|---|---|
| KiAntwort (F1/F2, I22) | Serverroute, die eine Gateway-Antwort im Schema von `antwortLesen` liefert; es gibt keine Route `/ki` (Grenztest `intelligence-gateway-grenzen` verbietet sie) | Route und Ansicht je Funktion, Produktfreigabe F1/F2 |
| Hilfe-Frage (F9, I23, PR 219) | nichts: `hilfe-frage.jsx` hat eine eigene Darstellung. `/api/hilfe/frage` liefert `modell: { status, text }`, nicht die Gateway-Antwort; KiAntwort würde dort nur doppeln | kein Einhängen; Umstellung nur mit Änderung des Antwortformats |
| Änderungsübersicht (F15, I24, PR 218) | Route für die Übersicht; Komponente wird nirgends importiert | Route und Ort in der Oberfläche |

Sobald eine Route besteht: KiAntwort dort einhängen, nur hinter dem Schalter der Funktion, und kein Wort „KI“ in der Oberfläche, solange die Funktion aus ist.
