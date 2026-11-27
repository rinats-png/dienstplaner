# RST-5 — Workflow-Patch Staging-Gate: Migrationsprobe W-1…W-9 am Digest

**Status:** vorbereitet, **nicht** übernommen. Claude ändert keine Datei unter `.github/workflows/`; der Betreiber
setzt die Änderung (wie GATE-EW3). `STAGING_GATE_AKTIV` wird hiermit **nicht** gesetzt (N-9).

**Voraussetzung:** Der Patch setzt auf die **GATE-EW3-Vollfassung** auf
(`../gate-ew3/staging-gate.gepatcht.yml.txt`), nicht auf die heutige Workflow-Datei. Reihenfolge: erst GATE-EW3
übernehmen, dann diesen Patch.

| Datei | Inhalt |
|---|---|
| `staging-gate.patch` | Unified Diff gegen die GATE-EW3-Vollfassung, anwendbar mit `git apply` |
| `staging-gate.gepatcht.yml.txt` | Workflow nach GATE-EW3 **und** RST-5, vollständig (Web-Editor-Weg) |

Geprüft bei jedem CI-Lauf über `npm run pruefung:staging-o2` (`pruefungen/rst5-migrationsprobe.test.js`, Teil D):
Patch passt auf die EW3-Vollfassung und ergibt genau diese Vollfassung; nur Zusätze; `on`, Rechte
(`contents: read`, Job zusätzlich `packages: read`), `if: vars.STAGING_GATE_AKTIV`, Secrets und `uses:` unverändert;
Nachweisschritt bindet `migrationsprobe` an `DIGEST`.

## Was der Patch ändert

| Stelle | Änderung |
|---|---|
| Kopfkommentar | RST-5 beschrieben |
| neuer Schritt nach „Widerrufbuch S1–S3“ | `Migrationsprobe W-1…W-9 (synthetischer 274bfa0-Bestand am Digest-Bild)`, `timeout-minutes: 12`, ruft nur `deploy/sicherung/ci/migrationsprobe-staging.sh` |
| Nachweisschritt | neues Feld `migrationsprobe` aus `$RUNNER_TEMP/migrationsprobe.json`; nur übernommen, wenn `art = migrationsprobe-staging` und `digest = DIGEST`, sonst `{ ergebnis: "nicht bewertbar", digest: null }` |
| unverändert | alles andere (Auslöser, Rechte, Bindung B-3, S1–S6, Browserabnahme, Artefakt) |

Ein Fehlschlag oder „nicht bewertbar“ der Migrationsprobe bricht den Job ab ⇒ `ergebnis` im Nachweis ist nicht
`success` ⇒ `werkzeug/release-pruefung.mjs` (E6) lehnt den Nachweis ab. Die Gate-Regeln in `release-pruefung.mjs`
werden **nicht** geändert; ein eigenes Pflichtfeld `migrationsprobe` in E6 bräuchte einen SSOT-Auftrag.

## Was der Schritt im Runner tut (nur synthetisch, nur 127.0.0.1)

1. Fixture `FIXTURE` (Saat 20261125, 20 Personen, 7 Tage, ohne Zahl-Kennung) schreibt die Anwendungsschicht des
   **274bfa0-Bilds** (`ALT_BILD`, `/app`) ohne Netz; Selbsttest K4-P3; Baum-Prüfsumme muss `FIXTURE_BAUM` gleichen
   (= lokaler Lauf). Gegenprobe mit Zahl-Kennung.
2. Betriebskennungen mit dem Code des **Digest-Bilds**: Fixture Exit 0, Gegenprobe Exit 1.
3. S0 mit `ablage-sicherung.mjs` des Digest-Bilds.
4. Erster Start des Digest-Bilds (gehärtet, `--read-only`, `--cap-drop ALL`, 512 MB, leeres Zustandsverzeichnis,
   Löschlauf und Datenschutzlauf auf Vorgabe wie in Produktion, Zustellung aus).
5. `deploy-abgleich.mjs` gegen S0 (`--start`), Migrationsprobe je Raum und Betrieb im Container.
6. Löschlauf und Datenschutzlauf abwarten (≤ 150 s), Stopp, Bewertung W-1…W-9 + Zusatzproben, Nachweis.

## Übernahme durch den Betreiber (nach GATE-EW3)

Web-Editor: Inhalt von `staging-gate.gepatcht.yml.txt` dieses Ordners in `.github/workflows/staging-gate.yml`
übernehmen (wie GATE-EW3 Weg A). Oder lokal: `git apply --check docs/acc45/workflow-patches/rst-5/staging-gate.patch`,
dann `git apply …`. Im PR darf nur `.github/workflows/staging-gate.yml` stehen.

**Zusätzlich (CI-Abdeckung, unabhängig vom Gate):** in `.github/workflows/pruefung.yml` einen Schritt
`npm run pruefung:rst5-migrationsprobe` ergänzen (lokaler Skriptlauf mit echtem Server, ≈ 2 min, wie die vorgemerkten
Schritte `pruefung:k4-altbestand` und `pruefung:k4-vorwaerts-reparatur`); danach den Eintrag
`pruefung:rst5-migrationsprobe` in `pruefungen/ci-abdeckung-ausnahmen.json` entfernen.

**Nach der Übernahme (Folge-PR Claude, Pflicht):** Test Teil D auf die Workflow-Datei umstellen und Patch/Vollfassung
entfernen (wie GATE-EW3 RUECKBAU „nach WT-1“). Rückbau vor der Übernahme: Ordner löschen, Test Teil D entfernen.

## Erster Lauf (Teil von WT-1 im GATE-EW3-TESTPLAN)

Erwartung im Log: 14 Zeilen `✔ …` (W-1…W-9, fixture, start, kennungen, gegenprobe, abgleich) und
`MIGRATIONSPROBE-NACHWEIS (migrationsprobe-staging, Bindung digest): bestanden`. Weicht `fixture` ab (anderer Baum im
Runner als lokal), ist das ein Befund, kein Grund, die Prüfsumme anzupassen, ohne die Ursache zu klären.
