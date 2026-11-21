# CI-Abdeckung der Sammelprüfung

Stand: Basis `integration/release-v4` (9831f4e2), Branch `acc45/ci/abdeckung`.

`npm run pruefung` ruft über 130 Skripte auf; `.github/workflows/pruefung.yml` führt sie einzeln als Schritte aus.
Wer ein Skript nur in die Sammelzeile schreibt, hat eine Prüfung, die lokal läuft und in der CI nie. Die Lücke wurde
am Stand oben mit einem Skript neu berechnet (Kette von `pruefung` minus alle `npm run X`-Aufrufe im Workflow samt
mittelbaren Aufrufen). Es fehlten elf Skripte; `pruefung:darstellung` (und `pruefung:geraete`) hat PR #183 inzwischen verdrahtet.

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
| `pruefung:darstellung` | ja | seit PR #183 im Workflow (zusammen mit `pruefung:geraete`), damit keine Ausnahme mehr nötig | nicht gemessen |

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

## Manuelle Skripte

Skripte außerhalb der Sammelzeile `pruefung` prüft der Wächter nicht: Sie sind bewusst nur von Hand aufrufbar. Damit das
nicht unbemerkt geschieht, stehen hier **alle** `pruefung:*`-Skripte aus `package.json`, die weder in der Sammelzeile
stehen noch vom Prüf-Gate `.github/workflows/pruefung.yml` per `npm run` (direkt oder mittelbar) aufgerufen werden.
Stand 2026-11-21 (Basis `integration/release-v4` bf253963): zwölf Skripte. Nachgerechnet mit `luecke()` aus
`werkzeug/ci-abdeckung.mjs`: Skripte `pruefung:*` minus Sammelkette minus abgedeckte Menge des Workflows. Kommt ein
Skript dazu, gehört es hier in die Tabelle (die Liste ist vollständig gemeint, kein Beispiel).

| Skript | Aufruf | Warum nicht in der CI (Prüf-Gate) |
|---|---|---|
| `pruefung:verwalter` | `node pruefungen/verwalter.mjs` | braucht einen laufenden Server (`CENTRIC_BASIS`). Läuft im Prüf-Gate trotzdem, aber nicht über `npm run`: Schritt `node pruefungen/serverlauf.mjs verwalter` (frischer Server mit Wegwerfablage). Der Wächter sieht diesen Aufruf nicht. |
| `pruefung:last-stempeln` | `node pruefungen/last-stempeln.mjs` | Lastprobe WP-02 (R7), etwa eine Minute; misst Zeiten, die auf einem geteilten Prüfrechner wenig aussagen (Kopf der Datei). |
| `pruefung:pentest` | `node pruefungen/pentest.mjs` | Penetrationstest gegen einen laufenden Server (`CENTRIC_BASIS`, `CENTRIC_ADMIN`); von Hand vor Sicherheitsabnahmen. In keinem Workflow. |
| `pruefung:sicherheit-intern` | `vitest run pruefungen/sicherheit-intern.test.js …` (sechs Dateien) | läuft in einem eigenen Workflow (`.github/workflows/sicherheit.yml`, `npm run pruefung:sicherheit-intern`), nicht im Prüf-Gate; der Wächter zählt nur `pruefung.yml`. |
| `pruefung:vergleich` | `node pruefungen/vergleich.mjs` | Oberflächenvergleich gegen eine von Hand geschriebene Basis; braucht Dev-Server und Playwright (`NODE_PATH`). |
| `pruefung:darstellung-browser` | `node pruefungen/browser/darstellung-wp35.mjs` | Browserprobe WP-35 (lokal, Wegwerfdaten, playwright-core); braucht einen fertigen Bau. Die Logik prüft `pruefung:darstellung` in der CI. |
| `pruefung:geraete-browser` | `node pruefungen/browser/geraete-wp21.mjs` | Gerätematrix WP-21 (lokal, manuell, Browser); „Kein CI-Bestandteil“ (Kopf der Datei). Die Logik prüft `pruefung:geraete` in der CI. |
| `pruefung:geraete-ablaeufe-browser` | `node pruefungen/browser/geraete-wp21-ablaeufe.mjs` | Bedienabläufe WP-21 Teil 2 (lokal, manuell, Browser); im Workflow als Hinweis genannt, die Logik prüft `pruefung:geraete-ablaeufe` ohne Browser. |
| `pruefung:verlustweg-browser` | `node pruefungen/browser/verlustweg-wr6.mjs` | WR-6 am Telefon (lokal, manuell, Browser); im Workflow als Hinweis genannt, die Logik prüft `pruefung:verlustweg-oberflaeche`. |
| `pruefung:schnell` | `node werkzeug/pruefung-schnell.mjs` | Entwicklungs-Abkürzung: Lint, Typen, CI-Abdeckung und nur die berührten Tests gegenüber der Basis; die CI führt alles vollständig aus. |
| `pruefung:wcag-wp40-browser` | `node pruefungen/browser/wcag-wp40.mjs` | WCAG-2.2-Browserabnahme WP-40 (lokal, manuell, Wegwerfdaten); die Bewertung prüft `pruefung:wcag-wp40` ohne Browser in der CI. |
| `pruefung:v4-radiusbasis` | `node werkzeug/v4-radiusstufen-basis.mjs --pruefen` | vergleicht die Fixture `pruefungen/fixtures/v4-radiusstufen-basis.json` mit den Basis-Commits der V4-3b-Schnitte (`git show`); der flache CI-Checkout hat diesen Verlauf nicht. In der CI läuft stattdessen der Fixture-Abgleich der Tests `v4-3b-*`. Restrisiko (Tabelle, Fixture und Prüfsumme gemeinsam geändert) in `V4-IST-STAND-2026-11-20.md`, Nachtrag V4-3b Einstellungen (Review #444). Aufruf vor jedem Review, der Tabelle oder Fixture ändert. |
