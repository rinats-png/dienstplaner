# DEP-2 — Vitest 4.1.12 → 5.1.0 (Nachweis)

Stand 2026-11-20. Basis `integration/release-v4` @ 6e19564b. Branch `acc45/dep/dep-2-vitest-5`, PR #424.
Vorlage: Dependabot-PR #405 (nur gelesen; nicht gemergt, nicht geschlossen — Schließen entscheidet der Betreiber).

## 1. Befund aus #405

CI-Lauf 44701348239, Job `pruefen`, Schritt „Abnahme V4 Strang A“:
`TypeError: describe.sequential is not a function` in `pruefungen/abnahme-a-ablauf.test.js:115`.
Der Job brach dort ab. Die Folgeschritte liefen nicht. Der Lauf belegt nichts über den Rest der Suite.

## 2. Änderungen in Vitest 5 und Folge für uns

Quellen: Migrationsleitfaden `vitest.dev/guide/migration` und Release-Notiz v5.0.0 (gelesen 2026-11-20).

| Punkt Vitest 5 | Betroffen? | Folge |
|---|---|---|
| `describe.sequential` / `test.sequential` / Option `sequential` entfernt; Ersatz `{ concurrent: false }` | ja, 12 Stellen in 6 Dateien | ersetzt, siehe 3 |
| `clearMocks` Vorgabe jetzt `true` | möglich (vi.fn/vi.mock in rund 20 Dateien, Aufrufe teils aus `beforeAll`/Modul-Mocks) | `clearMocks: false` in `vite.config.js`, siehe 3 |
| `vi.mock`/`vi.hoisted` in Funktionen oder Blöcken wirft | nein: alle Aufrufe auf Modulebene (einziger eingerückter Treffer ist ein Kommentar in `pruefungen/hilfen/schreibtor.mjs`) | keine |
| Nicht abgewartete `resolves`/`rejects` lassen den Test scheitern | strenger; kein lokaler Treffer | CI zeigt Rest |
| `toThrow('')` passt auf jede Meldung | kein Treffer | keine |
| `expect.poll` lehnt bei Zeitablauf ab | nicht genutzt | keine |
| `-t` passt auf vollen Namen mit ` > ` | in Skripten/Workflows nicht genutzt | keine |
| Titel bei `.each`/`.for`: `pretty-format` statt `loupe`, `$`-Platzhalter ohne Anführungszeichen, Kürzung 40 | 44 Stellen nutzen `.each`/`.for`, nur `%s`/`%i`; kein Werkzeug liest Testtitel oder Berichte (geprüft: werkzeug/, pruefungen/, .github/) | nur Anzeige |
| Fake-Timer fälschen auch `Temporal` | `Temporal` nicht genutzt | keine |
| JSON/JUnit-Berichter schreiben in Dateien; `--outputJson` entfernt | nicht genutzt (nur `--reporter=verbose`) | keine |
| Unterpfade `vitest/node`, `vitest/suite` … entfernt | nicht genutzt | keine |
| `VITEST_POOL_ID`/`VITEST_WORKER_ID` ab 1 | nicht genutzt | keine |
| Coverage include/exclude, Browser-Modus | nicht genutzt | keine |
| `testTimeout`/`hookTimeout`, Pool, `isolate`, `fileParallelism`, Vorgabe-`exclude` | in v5.0.0 nicht als Bruch genannt | keine |
| Node ≥ 22.12, Vite ≥ 6.4 | CI Node 22, Vite 6.4.x | passt |

## 3. Code

- `package.json`: `vitest` `^4.1.10` → `^5.1.0`.
- `package-lock.json`: nur Vitest-Teilbaum, siehe 5. Lock-`packages` identisch mit #405.
- 12 Stellen: `describe.sequential(name, fn)` → `describe(name, { concurrent: false }, fn)` in
  `abnahme-a-ablauf` (1), `erstleitung-abbruch` (2), `erstleitung-betreiber-put` (1), `erstleitung-entscheidungen` (4), `erstleitung` (3), `konto-parallel` (1).
  Begründung: Ersatz laut Leitfaden. Gleiche Wirkung: Kein Test und keine Konfiguration im Projekt schaltet `concurrent` ein; die Option hält die Reihenfolge ausdrücklich fest. Die Form ist in Vitest 4 und 5 gültig. Kein Testinhalt geändert.
- `vite.config.js`: `clearMocks: false`. Begründung: Vitest 5 löscht sonst vor jedem Test die Aufrufliste aller Mocks. Die Prüfungen sind unter der alten Vorgabe geschrieben. Der Wert hält das Verhalten von Vitest 4 genau. Das schwächt keinen Test ab: Es ändert nur, was Vitest zwischen Tests selbst zurücksetzt. Ein späterer Wechsel auf `true` ist ein eigenes Paket mit eigener Prüfung.
- Kein Zeitlimit geändert, kein Test abgeschaltet, keine Workflow-Änderung.

Commits: `2c058c49` (Bump, rot), `a7a2aaa1` (Fix, grün).

## 4. Tests (lokal, `--maxWorkers=1`, `werkzeug/test-kurz.mjs --sperre`)

Rot → grün:
- `konto-parallel.test.js` unter 5.1.0 auf `2c058c49`: rot, „describe.sequential is not a function“, keine Tests gesammelt.
- Nach `a7a2aaa1`: `konto-parallel` + `erstleitung-entscheidungen` 14/14 grün.

Gruppen grün unter 5.1.0:

| Gruppe | Ergebnis |
|---|---|
| `pruefung:querschnitt`-Dateien (18) | 273/273 |
| `fachpruefung-server` | 53/53 |
| `imp6-mehrfachmodelle`, `imp6-zyklen-grenzfaelle`, `imp6-eigenes-modell` | 186/186 |
| `erstleitung-abbruch`, `erstleitung-betreiber-put` (`--no-file-parallelism`) | 15/15 |
| `konto-parallel`, `erstleitung-entscheidungen` | 14/14 |
| `wiederherstellen-ui`, `webpush-echt`, `doku` | grün |
| `oberflaeche-render`, `verdrahtung` (isoliert, 2 Läufe) | 48/48, 48/48 |
| `ci-abdeckung` (mit Werkzeug) | 8/8 |
| `prozess-wachen` | 15/15 |
| `acc45-status` | 17/17 |
| `import-schalter`, `bremse-wp47`, `mail-push-handler`, `betriebstag`, `pwa` (Mocks, Fake-Timer, `.each`) | 179/179 |

Zeitgrenze 5 s (Risiko aus dem Auftrag): Im Gruppenlauf überschritten `verdrahtung.test.js` „das Repo selbst besteht“ (7,2 s) und zwei Tests in `oberflaeche-render` (5,7 s / 6,3 s) die Vorgabe 5 s. Gegenprobe auf demselben Laptop mit denselben Dateien:

| Fassung | Lauf | Ergebnis |
|---|---|---|
| 4.1.12 | a | 2 rot (Zeitgrenze: render 6,0 s, verdrahtung 9,2 s) |
| 4.1.12 | b | 1 rot (verdrahtung 8,3 s) |
| 5.1.0 | a | 48/48 grün |
| 5.1.0 | b | 48/48 grün |

Folge: Die Überschreitungen kommen von der Last des Laptops, nicht von Vitest 5. Vitest 4 zeigt sie ebenso. Kein Zeitlimit geändert.

Nicht lokal (zu schwer für den Laptop): `abnahme-a-ablauf`, `erstleitung.test.js`, übrige Gruppen. **Vollregression: CI.**

## 5. Lieferkette

- `npm ci --ignore-scripts` frisch (node_modules gelöscht): grün, 311 Pakete.
- `npm audit`: 0. `npm run sicherheit:abhaengigkeiten`: 0 Befunde; Installationsskripte nur die bekannten `fsevents`, `vite/node_modules/esbuild`.
- Geänderte Lock-Einträge (alt → neu):
  - Vitest-Teilbaum: `vitest` 4.1.12→5.1.0, `@vitest/mocker` und `@vitest/spy` 4.1.12→5.1.0, `magic-string` 0.30.21→1.4.5, `obug` 2.1.4→3.0.0, `std-env` 4.2.0→4.3.0, `tinybench` 2.9.0→6.2.3, `tinyexec` 1.3.0→1.3.1, `why-is-node-running` 2.3.0→3.2.1, `es-module-lexer` 2.3.2 (vorher unter `vitest/node_modules` 2.3.1, jetzt oben).
  - Entfallen: `@vitest/expect`, `@vitest/pretty-format`, `@vitest/runner`, `@vitest/snapshot`, `@vitest/utils`, `@standard-schema/spec`, `pathe`, `siginfo`, `stackback`, `tinyrainbow`.
  - Geteilt, angehoben durch Vitests Mindestbereiche: `picomatch` 4.0.5→4.0.7 (vitest verlangt `^4.0.7`; auch von vite, fdir, tinyglobby genutzt, deren Bereiche `^4` passen), `@jridgewell/sourcemap-codec` 1.5.5→1.6.0 (`magic-string` 1.4.5 verlangt `^1.6.0`; gen-mapping/trace-mapping verlangen `^1.5.0`/`^1.4.14`). Semver-kompatibel.
- Keine neuen Paketnamen. Keine Installationsskripte. Lizenz überall MIT.
- Maintainer (npm): vitest/@vitest/* — Vitest-Team (ariperkkio, antfu, hiogawa, oreanno, yyx990803); tinybench — aslemammad, uzlopak, fraggle; why-is-node-running — mafintosh, yoshuawuyts, jkoops; obug — sxzz; magic-string — mourner, rich_harris, alangpierce, antfu; std-env — pi0; tinyexec — 43081j; picomatch — mrmlnc, jonschlinkert, doowb, danez; sourcemap-codec — jridgewell.
- `tinybench`: `npm install` löste 6.2.4 auf (veröffentlicht 2026-11-18, zwei Tage alt). Im Lock steht bewusst 6.2.3 (2026-11-01) wie in #405; `^6.2.2` von vitest ist erfüllt.

## 6. Offen

- Vollregression in CI auf PR #424.
- Opus-Review (Pflicht, Prüfwerkzeug, kritischer Pfad).
- Späteres eigenes Paket möglich: `clearMocks: true` mit gezielter Prüfung der betroffenen Dateien.
- Dependabot-PR #405: Schließen entscheidet der Betreiber.
