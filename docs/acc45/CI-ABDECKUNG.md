# CI-Abdeckung der Sammelprüfung

Stand: Basis `integration/release-v4` (9831f4e2), Branch `acc45/ci/abdeckung`.

`npm run pruefung` ruft über 130 Skripte auf; `.github/workflows/pruefung.yml` führt sie einzeln als Schritte aus.
Wer ein Skript nur in die Sammelzeile schreibt, hat eine Prüfung, die lokal läuft und in der CI nie. Die Lücke wurde
am Stand oben mit einem Skript neu berechnet (Kette von `pruefung` minus alle `npm run X`-Aufrufe im Workflow samt
mittelbaren Aufrufen). Es fehlten elf Skripte; `pruefung:darstellung` ist nicht Teil dieses Auftrags (PR #183).

## Ergebnis je Skript

Lokal gemessen unter Windows (Node 24), je Skript einzeln. Die CI (Ubuntu, Node 22) ist für Linux maßgeblich.

| Skript | in CI | Grund | Dauer lokal |
|---|---|---|---|
| `pruefung:v4-tokens` | ja | reine Dateiprüfung, ohne Umgebung | 10 s |
| `pruefung:app-aufbau` | ja | rendert die App serverseitig (react-dom/server), kein Browser | 15 s |
| `pruefung:import-parser` | ja | reiner Parser samt ZIP-Bomben-Proben (Worker-Thread), kein Netz | 116 s |
| `pruefung:import-endpunkt` | ja | Handler gegen Wegwerf-Ablage, ohne Server und Netz | 52 s |
| `pruefung:import-oberflaeche` | ja | Oberfläche gegen Attrappe und echten Handler, ohne Browser | 18 s |
| `pruefung:schreibhalt-last` | ja | Wegwerf-Ablage; läuft allein, weil die Durchsatzprobe neben anderen Dateien zu wenig misst | 39 s |
| `pruefung:konto-wiederherstellung` | ja | Kernlogik gegen Wegwerf-Ablage | 34 s |
| `pruefung:staging-abnahme-3` | ja | startet selbst einen Server auf 127.0.0.1:3917 mit Wegwerf-Ablage; ohne Ziel kein Netzzugriff, mit Ziel nur lesend | 11 s |
| `pruefung:pilot-tagesbericht` | ja | Werkzeug auf synthetischen Eingaben, kein Netz | 6 s |
| `pruefung:serverlauf` | nein | Entwicklungs-Abkürzung: startet 25-mal einen frischen Server und wiederholt Prüfungen, die in der CI bereits als vitest-Skripte (z. B. `pruefung:sicht-schicht`, `pruefung:fachpruefung`) oder gegen das Docker-Bild laufen; der Workflow nennt die Auslassung ausdrücklich. Mit gut 3 Minuten außerdem die längste Einzelposition. Alle 25 Läufe lokal bestanden. | 208 s |
| `pruefung:darstellung` | (PR #183) | wird mit PR #183 verdrahtet; bis dahin vorläufige Ausnahme | nicht gemessen |

`pruefung:serverlauf` steht zu Recht in der Sammelzeile (für Entwickler ohne Docker), ist aber in der CI
bewusst ersetzt. Die Sammelzeile wurde nicht verändert.

## Wächter gegen neue Lücken

`npm run pruefung:ci-abdeckung` (Schritt „CI-Abdeckung der Sammelprüfung“ im Workflow) rechnet die Lücke bei jedem
Lauf neu. Er schlägt fehl, wenn

- ein Skript der Sammelzeile weder im Workflow (direkt oder mittelbar) noch in
  `pruefungen/ci-abdeckung-ausnahmen.json` steht;
- eine Ausnahme keinen Grund (mindestens 20 Zeichen) hat, doppelt steht, auf kein Skript oder kein Skript der
  Sammelzeile zeigt oder das Skript inzwischen in der CI läuft (veralteter Eintrag).

Ein Eintrag mit `"vorlaeufig": true` meldet Veraltung nur als Warnung (gedacht für Skripte, deren Verdrahtung in einem
anderen, noch offenen Pull Request liegt). Nur das Prüf-Gate `pruefung.yml` zählt; andere Workflows ersetzen es nicht.
Neue Ausnahmen gehören mit Grund in die JSON-Datei und in die Tabelle oben.
