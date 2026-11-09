# Vorprüfung vor jeder Aufgabenvergabe

Stand: 2026-11-09. Zweck: Keine Doppelarbeit mehr durch veraltete SSOT-Einträge.

## Ablauf (vor jedem Start eines Agenten)

1. Integrationsstand lesen: `git fetch origin integration/release-v4`.
2. Abgleich ausführen: `node werkzeug/ssot-abgleich.mjs` (deterministisch, ohne Opus, ohne Netz außer gh).
   - `OK`: nichts tun.
   - `KORREKTUR`: gemergter PR nennt das Paket, SSOT ist nicht erledigt. Erst die SSOT nachführen (Schritt 4), dann neu entscheiden.
   - `BELEG_FEHLT`: SSOT sagt erledigt, aber kein gemergter PR nennt das Paket. Vom Koordinator prüfen, nicht automatisch ändern.
3. Erst nach Schritt 2 die Aufgabe vergeben. Agent bekommt nur die Teile, die nachweislich fehlen (Teilpakete).
4. Nach jeder erfolgreichen Integration: `node werkzeug/ssot-nach-integration.mjs <PR> --schreibe`. Dry-Run ohne `--schreibe`. Das Werkzeug setzt den PR-Beleg, prüft die Quelle und schreibt die Übersichten neu. Danach Commit und PR.

## Regeln

- Vorhandener Code allein beweist keine Integration und keine fachliche Freigabe. Erforderlich sind: gemergter PR gegen `integration/release-v4`, die zugehörigen Tests und der Nachweis.
- Betreiberentscheidungen (E-…) brauchen keinen PR-Beleg.
- SSOT-Pflege-PRs ("SSOT: …") zählen nie als Umsetzung eines Pakets.
- Merge-Watcher schreiben die SSOT nur über `ssot-nach-integration.mjs`. Dieses Werkzeug nimmt eine gemeinsame Sperre (Lock im Temp-Verzeichnis). Parallele Schreiber bekommen Exit 3 und versuchen es später.
- Keine Statusänderung von Hand in `docs/acc45/STATUS.md` oder den anderen Übersichten; die entstehen aus `work-packages.json`.

## Drei Ebenen je Paket (verbindlich)

- **implementiert**: Code, Tests oder Nachweis im Integrationsbranch nennen das Paket (Commit-Betreff, Testdatei oder Nachweis). Ein Hinweis, kein Beleg für Integration.
- **integriert**: gemergter PR, dessen Merge-Commit oder dessen in der SSOT genannter Commit im Integrationsbranch liegt, und dessen Titel oder Branch das Paket am Anfang nennt. Nur das zählt als Integration.
- **freigabebereit**: `stagingGeprueft` und `fachlichFreigegeben` sind belegt. Alles davor ist keine Freigabe.

Werkzeug: `node werkzeug/ssot-belege.mjs` (Bericht) und `node werkzeug/ssot-belege.mjs --anwenden` (schreibt nur belegte PR-Nummern nach, ändert keinen Status, lässt DONE unberührt, gemeinsame Sperre).

Ältere Pakete ohne PR-Beleg werden nicht neu implementiert. Vorhandene Commit-, Test- und Nachweisbelege reichen für die Prüfung, die Entscheidung über einen nachträglichen Beleg trifft der Koordinator.
