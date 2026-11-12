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

`pruefungen/sammelpruefung-bekannt.json` (seit QS-2 mit einem Windows-Eintrag, siehe unten): Liste von `{ "skript", "grund" (mind. 20 Zeichen), "plattform" }`.
Scheitert ein Glied auf genau dieser Plattform, wird es im Bericht als BEKANNT mit Grund geführt. Der Gesamtlauf bleibt trotzdem rot
(Exit 1): nichts wird übersprungen oder abgeschwächt, die Liste ordnet nur ein. Einträge ohne Grund, ohne Plattform, doppelt oder
auf ein Nicht-Kettenglied zeigend lassen den Trockenlauf scheitern.

### Zeitabhaengige Pruefungen (QS-2)

Deterministisch gemacht (ohne die Aussage der Pruefung zu aendern):

| Pruefung | Ursache der Flanke | Behebung |
|---|---|---|
| `schreibhalt.test.js` "Frist abgelaufen vor der Freigabe ..." | Frist von 80 ms war kuerzer als der Handshake (Anfrage, 10-ms-Takt, Antwort, Lesen); unter Last lief sie ab, bevor der Client "gehalten" las. Danach feste `warte(200)`. | Frist 1500 ms, statt festem Schlafen Abfrage bis `haltZustand().gehalten === false` |
| `schreibhalt.test.js` "fremde Anfrage waehrend des Halts ..." | feste `warte(400)` auf die Ablehnung | Abfrage, bis die Antwort mit dem fremden Token da ist |
| `anmeldung-http.test.js` "Gesamtaufkommen" und "gelungene Anmeldungen nicht auf die Gesamtgrenze" | Notbremse zaehlt in an der Uhr ausgerichteten 300-s-Fenstern (`Date.now`); eine Messung ueber eine Fenstergrenze verschiebt den gleitenden Stand | `vi.useFakeTimers({ toFake: ["Date"] })`, Uhr steht mitten im Fenster |

Nur auf Windows-Ressourcengrenzen scheiternd, ausdruecklich nicht gelockert und nicht uebersprungen (`sammelpruefung-bekannt.json`, Plattform `win32`; der Gesamtlauf bleibt rot):

- `pruefung:selbst`: Zusicherung "Erster Aufbau unter 500 ms" (src/pruefung.jsx) misst reine Rechenzeit; auf diesem Windows-Rechner reproduzierbar darueber (kalter Transform/JIT).
- `pruefung:sicherung-ablage` (kein Glied der Kette `pruefung`, daher nicht in der Bekannt-Liste): Pruefungen mit 60 s Frist (`LIMIT`), z. B. "meldet eine Quelle, die sich beim Sichern aendert ...", reissen die Frist auf Windows unter Last.
- `pruefung:mail-push-produktion`: die Flut-Pruefungen ("Notruf-Flut ...", "dringende Mitteilungen einer Quelle ...") brauchen unter Last mehr als die 5 s Vorgabe von vitest; die Folgefehler (Reste in der Ablage) liessen den Lauf wie einen Absturz aussehen. Behoben im Skript: `--testTimeout=60000`; kein Eintrag noetig.

## Offen (nicht in diesem Stand)

- Playwright-Suite `e2e/` samt axe-Gate: noch nicht auf den heutigen Stand gebracht. Sie braucht `@playwright/test` und
  `@axe-core/playwright` als neue Abhängigkeiten (Lockfile) und einen CI-Lauf (Chromium-Download), der lokal ohne Netz und ohne
  Eingriff in das geteilte `node_modules` nicht verifizierbar war. Die vorhandenen Browserprüfungen unter `pruefungen/browser/`
  (playwright-core) laufen weiter wie bisher. Die Messwerte des alten Branches (u. a. Feldmodus-Knopf bei 768 px) liegen nur dort.
- Review und Staging-Prüfung des Pakets stehen aus; der Paketstatus (SSOT) wird hier nicht verändert.
