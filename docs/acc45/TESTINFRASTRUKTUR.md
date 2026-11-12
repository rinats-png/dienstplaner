# Testinfrastruktur (WP-33), Stand auf integration/release-v4 6c195b66

## Was der alte Branch `acc45/qa/wp33-testinfrastruktur` (3 Commits, Stand 2026-11-02) brachte

1. Die 14 nur in der CI laufenden Suiten in die Kette `pruefung` aufnehmen und `pruefkette-abgleich` (Kette gegen Workflow).
   **Inzwischen abgedeckt:** `npm run pruefung:ci-abdeckung` (`werkzeug/ci-abdeckung.mjs`, Ausnahmen in
   `pruefungen/ci-abdeckung-ausnahmen.json`, Beschreibung in `CI-ABDECKUNG.md`) leistet genau das; `pruefung:verdrahtung`
   deckt zusätzlich die Prüfdateien ab. Nicht erneut umgesetzt.
2. Playwright-Suite `e2e/` (Rollen x Bildschirme, axe, Offline) mit `@playwright/test` 1.64.1, `@axe-core/playwright`
   4.14.0, Workflow `e2e.yml`, `docs/TESTEN-E2E.md`. **Weiterhin offen** (siehe unten).
3. Nachweisdokument `wp33-nachweis.md` mit den Messwerten (nur auf dem alten Branch).

## Neu in diesem Stand: vollständige Sammelprüfung mit Bericht

`npm run sammelpruefung` (`werkzeug/sammelpruefung.mjs`) führt jedes Glied der Kette `pruefung` einzeln aus und meldet je Glied
bestanden / FEHLER / BEKANNT samt Dauer, am Ende die Summen. Anders als `npm run pruefung` (`&&`-Kette, Abbruch beim ersten
Fehler) läuft sie bis zum Ende, damit ein Lauf alle Fehler zeigt. Sie ersetzt keine Prüfung: Exit 0 nur, wenn alle Glieder Exit 0
haben.

Optionen: `--trocken` (Kette lesen und gegen package.json und `pruefung.yml` abgleichen, nichts ausführen), `--stopp`
(beim ersten Fehler abbrechen), `--ab NAME`, `--nur A,B`, `--bericht datei.json` (je Glied Status, Exit, Dauer).
Das Glied `pruefung:sammelpruefung` (Trockenlauf plus Test `pruefungen/sammelpruefung.test.js`) steht am Ende der Kette und im
Workflow; der volle Lauf aller Glieder ist bewusst nur lokal (`npm run sammelpruefung`), weil die CI die Glieder ohnehin einzeln
als Schritte ausführt (`pruefung:ci-abdeckung` stellt das sicher). Der Trockenlauf nutzt dieselbe Regel wie
`pruefung:ci-abdeckung`, also auch dessen begründete Ausnahmen (z. B. `pruefung:serverlauf`).

### Bekannte Umgebungsfehler

`pruefungen/sammelpruefung-bekannt.json` (derzeit leer): Liste von `{ "skript", "grund" (mind. 20 Zeichen), "plattform" }`.
Scheitert ein Glied auf genau dieser Plattform, wird es im Bericht als BEKANNT mit Grund geführt. Der Gesamtlauf bleibt trotzdem rot
(Exit 1): nichts wird übersprungen oder abgeschwächt, die Liste ordnet nur ein. Einträge ohne Grund, ohne Plattform, doppelt oder
auf ein Nicht-Kettenglied zeigend lassen den Trockenlauf scheitern.

## Offen (nicht in diesem Stand)

- Playwright-Suite `e2e/` samt axe-Gate: noch nicht auf den heutigen Stand gebracht. Sie braucht `@playwright/test` und
  `@axe-core/playwright` als neue Abhängigkeiten (Lockfile) und einen CI-Lauf (Chromium-Download), der lokal ohne Netz und ohne
  Eingriff in das geteilte `node_modules` nicht verifizierbar war. Die vorhandenen Browserprüfungen unter `pruefungen/browser/`
  (playwright-core) laufen weiter wie bisher. Die Messwerte des alten Branches (u. a. Feldmodus-Knopf bei 768 px) liegen nur dort.
- Review und Staging-Prüfung des Pakets stehen aus; der Paketstatus (SSOT) wird hier nicht verändert.
