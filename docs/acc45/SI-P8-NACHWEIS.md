# SI-P8 – Fremde GitHub Actions per Commit-SHA (Nachweis)

Arbeitspaket SI-P8 aus `docs/acc45/work-packages.json` (Befund P8, mittel, aus
`docs/acc45/SICHERHEIT-INTERN-2026-11.md`, OWASP A08). Unabhängiger Cloud-Agent,
Branch `ccr-21ca89fe-sjftsr`, Ziel `integration/release-v4`. Zentrale STATUS-
und SSOT-Dateien (`work-packages.json`, `STATUS*.md`) sind bewusst **nicht**
geändert. Die Statusfortschreibung macht der Hauptorchestrator.

## Ausgangslage

- Ausgangscommit: `087fbe9` (`origin/integration/release-v4`, „STATUS: Browserproben auf daa8e46“).
- Kein offener Pull Request und kein Remote-Branch zu SI-P8 (geprüft am 2026-11-07).
- `lasttest.yml` und `lieferkette.yml` sowie der Job `sicherheit.yml/interne-pruefung` waren schon gepinnt.
- 23 `uses:`-Zeilen in fünf Workflows nutzten noch bewegliche Tags (`@v2` … `@v6`).

## Änderung

Jede Tag-Referenz wurde auf den Commit gepinnt, auf den das bisher benutzte
Major-Tag am 2026-11-07 zeigte. Die effektiv laufende Version ändert sich also
nicht. Der lesbare Versionskommentar `# vX.Y.Z` bleibt erhalten, damit
Dependabot (`.github/dependabot.yml`, Ökosystem `github-actions`) die Pins
weiter aktualisiert. Berechtigungen, Trigger und Logik sind unverändert. Einzige
Ergänzung im Workflow ist der Prüfschritt im Job `sicherheit.yml/muster`.

| Datei | Änderung |
|---|---|
| `.github/workflows/betrieb-deploy.yml` | 4 Pins |
| `.github/workflows/betrieb-sicherung.yml` | 3 Pins |
| `.github/workflows/deploy.yml` | 7 Pins (die lokalen `./.github/workflows/…` bleiben) |
| `.github/workflows/pruefung.yml` | 4 Pins |
| `.github/workflows/sicherheit.yml` | 5 Pins, neuer Schritt „Actions per Commit-SHA gepinnt“ im Job `muster` |
| `werkzeug/sicherheit/actions-pins.mjs` | neu: statische Prüfung, ohne Abhängigkeiten und ohne Netz; `--online` gleicht Tag und SHA upstream ab |
| `pruefungen/actions-pins.test.js` | neu: Regressionstest (rote und grüne Proben sowie der Repository-Stand) |
| `package.json` | Script `sicherheit:actions-pins`; der Test ist in `pruefung:sicherheit-intern` eingehängt (läuft in `sicherheit.yml/interne-pruefung`) |
| `docs/acc45/SI-P8-NACHWEIS.md` | dieser Nachweis |

## Verifizierte Action-SHAs

Quelle ist das offizielle Upstream-Repository über `git ls-remote https://github.com/<owner>/<repo>.git`.
Geprüft wurden das Versions-Tag, `^{}` bei annotierten Tags und das Major-Tag.
Außerdem wurde jeder SHA einzeln per `git fetch --depth=1` geholt und mit
`git cat-file -t` als `commit` bestätigt. Ein unabhängiger Review hat alle acht
SHAs noch einmal getrennt nachgeprüft.

| Action | SHA | Version | Major-Tag zeigt auf denselben Commit | Commit-Datum |
|---|---|---|---|---|
| actions/checkout | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0 | v4 ✔ | 2026-07-16 |
| actions/setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 | v4 ✔ | 2025-04-02 |
| actions/upload-artifact | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2 | v4 ✔ (war schon gepinnt) | 2025-03-19 |
| docker/setup-buildx-action | `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` | v3.12.0 | v3 ✔ | 2025-12-16 |
| docker/build-push-action | `10e90e3645eae34f1e60eeb005ba3a3d33f178e8` | v6.19.2 | v6 ✔ | 2026-02-12 |
| docker/metadata-action | `c299e40c65443455700f0fdfc63efafe5b349051` | v5.10.0 | v5 ✔ | 2025-11-27 |
| docker/login-action | `c94ce9fb468520275223c153574b00df6fe4bcc9` | v3.7.0 | v3 ✔ | 2026-01-27 |
| gitleaks/gitleaks-action | `ff98106e4c7b2bc287b24eaf42907196329070c7` | v2.3.9 | v2 ✔ (annotiert, `v2^{}`) | 2025-04-16 |

Wiederholbar mit `node werkzeug/sicherheit/actions-pins.mjs --online` (alle 8 „ok“).

## Die Prüfung

`node werkzeug/sicherheit/actions-pins.mjs` bzw. `npm run sicherheit:actions-pins`
prüft alle `.github/workflows/*.y(a)ml`, alle `.github/actions/**/action.y(a)ml`
und jede lokal referenzierte Composite-Action (`./pfad/action.yml`). Die Regeln:

- Erlaubt sind nur Referenzen der Form `owner/repo[/pfad]@<40 hex>` mit dem Kommentar `# vX.Y.Z`.
- `./…` ist erlaubt, `docker://…` nur mit `@sha256:<64 hex>`.
- Verboten sind Tags, Branches, Kurz-SHAs, großgeschriebene SHAs, `#` ohne Leerzeichen sowie Ausdrücke `${{ … }}` im `uses:`.
- Fail-closed: Jede andere YAML-Schreibweise eines `uses`-Schlüssels gilt als Befund, etwa ein Flow-Mapping `{ uses: … }`, `[{"uses": …}]`, ein quotierter Schlüssel oder ein Block-Skalar als Wert.
- Text in `run: |`-Blöcken und in einfachen Skalarwerten zählt nicht.
- CR, CRLF und LF werden erkannt, ebenso eine BOM.
- Derselbe SHA einer Action mit verschiedenen Versionskommentaren gilt als Befund.

Bewusst ohne YAML-Parser: Das Paket hat keinen direkten YAML-Parser, und die
Prüfung soll im Job `muster` ohne `npm ci` laufen. Die Lücke, die ein
Zeilenscanner hätte, schließt die Fail-closed-Regel.

## Ausgeführte Tests

| Prüfung | Ergebnis |
|---|---|
| `node werkzeug/sicherheit/actions-pins.mjs` auf dem Ausgangsstand `087fbe9` | **rot**, 23 Befunde, genau die 23 geänderten Zeilen |
| dieselbe Prüfung auf dem Branch | grün: 7 Dateien, 32 externe Referenzen (8 verschiedene), 2 lokale |
| `… --online` | 8/8 ok |
| `npx vitest run pruefungen/actions-pins.test.js` | 10/10 grün |
| `npm run pruefung:sicherheit-intern` | 3 Dateien grün (sicherheit-intern, routen-inventar, actions-pins) |
| `npx eslint .` | 0 Fehler (nur die schon vorhandenen Warnungen) |
| `actionlint` 1.7.7 (Release-Binary, SHA-256 gegen die offizielle checksums.txt geprüft) über alle Workflows | 0 Befunde, vorher und nachher |
| Probe mit lokaler Composite-Action, die ungepinnt ist (temporär angelegt und wieder entfernt) | wird erkannt |
| `npx vitest run pruefungen/acc45-werkzeuge.test.js pruefungen/acc45-status.test.js pruefungen/doku.test.js` | grün |

Nicht lokal ausführbar sind die echten GitHub-Actions-Läufe. Sie laufen beim
Push bzw. im Pull Request (Sicherheit, Prüfung, Lieferkette). `deploy.yml` und
`betrieb-*.yml` laufen nur auf `main` bzw. manuell und wurden deshalb nur
statisch geprüft (actionlint und die Pin-Prüfung).

## Review

Den unabhängigen Review hat ein eigener Agent gemacht, nur lesend, ohne
Vorgabe des Ergebnisses.

- Bestätigt:
  - alle 8 SHAs = Tag im Kommentar = bisheriges Major-Tag,
  - nichts unter `.github` ist ungepinnt,
  - der Diff ändert außer den `uses:`-Zeilen und dem einen Schritt nichts,
  - das Werkzeug ist Node-kompatibel (vorinstalliertes Node auf ubuntu-latest).
- Befunde und Behebung:
  - **mittel:** Mit gültigem YAML ließ sich die Prüfung umgehen (Flow-Mapping, quotierter Schlüssel, nur CR als Zeilenende). Behoben durch die Fail-closed-Regel und die Erkennung von CR, CRLF und LF. Getestet.
  - **niedrig:** Fehlmeldung bei `uses:` in mehrzeiligen `run: |`-Blöcken. Behoben: Block-Skalare werden übersprungen. Getestet.
  - **niedrig:** `@<sha>#v4` (ohne Leerzeichen) galt als gepinnt. Behoben. Getestet.
  - **info:** Versionskommentare wie `# v4` waren zu ungenau. Jetzt ist nur `vX.Y.Z` erlaubt.
  - **info:** Composite-Actions außerhalb von `.github/actions` wurden nicht geprüft. Behoben: Referenzierte lokale Actions werden mitgeprüft.
- Nach-Review der Korrekturen: siehe Pull-Request-Beschreibung.

## Offene Risiken (nicht Teil von SI-P8, nicht geändert)

Sie hängen mit der Lieferkette zusammen. Ihre Behebung würde aber
Workflow-Verhalten ändern und gehört deshalb in eigene Pakete bzw. vor den
Betreiber:

1. **mittel – `persist-credentials` ist nicht `false`** bei `actions/checkout` in `betrieb-deploy.yml` (3×), `betrieb-sicherung.yml`, `deploy.yml` (Job mit `packages: write`), `pruefung.yml` und `sicherheit.yml` (`abhaengigkeiten`, `geheimnisse`, `muster`). Das Token bleibt in `.git/config`, während danach `npm ci` und fremde Actions laufen. Der Build-Kontext ist geschützt, weil `.dockerignore` `.git` ausschließt.
2. **mittel – `pruefung.yml` hat keinen `permissions:`-Block.** Bei `push` und `pull_request` gelten die Standardrechte des Repositorys.
3. **niedrig – gitleaks-action lädt das gitleaks-Binary zur Laufzeit**, ohne festgelegte Version (`GITLEAKS_VERSION`) und ohne Prüfsumme. Der SHA-Pin sichert nur den Code der Action.
4. **niedrig – setup-buildx-action lädt Buildx und das BuildKit-Image** (`moby/buildkit:buildx-stable-1`) ohne `version:` bzw. ohne Digest.
5. **niedrig – `apt-get install shellcheck`** in `betrieb-sicherung.yml` ohne festgelegte Version (aus dem Ubuntu-Archiv).
6. **info – Versionskommentar und SHA werden in der CI nur offline geprüft.** Ob der Kommentar zum SHA passt, prüft nur `--online`. Ein falscher Kommentar beim ersten Vorkommen fiele erst Dependabot oder im Review auf.
7. **info – Fremdbefund:** `npm run sicherheit:statik` meldet schon auf dem Ausgangsstand „1 unbegründete harte Treffer“ (`server/lib/prozesssperre.mjs`). Das hat mit SI-P8 nichts zu tun und ist nicht geändert.
8. **info – Fehlmeldung möglich:** Eine Zeile, die nicht mit einem einfachen `schluessel:` beginnt und ` uses:` als Text enthält, würde fail-closed als Befund gemeldet. Heute gibt es keinen solchen Fall.
