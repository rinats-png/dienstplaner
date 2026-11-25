# RST-7 — Post-Deploy-, Rückweg- und A→B→A-Probe (Nachweis und Abgrenzung)

Stand: 2026-11-25. Prozessstufe L3, Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4`
(`1b091807`, enthält K4-P4 #556). Nur synthetische Daten. Keine Gate-Änderung, kein Deployment, kein VPS, keine
Änderung an `.github/workflows/*`, R0 (`deploy/abschalten.sh`) unverändert.

Betreiberentscheidung 2026-11-25 (K4 Pfad 0): Der erste V4-Wechsel ist ein kontrollierter Neustart mit sauberem
Bestand (Altbestand nach geprüfter Sicherung beiseitegelegt). Ab T0 wird `zustand/` nie zurückgesetzt, widerrufene
Codes bleiben ungültig, `CENTRIC_PFEFFER` bleibt unverändert. RST-7 bleibt verbindlich.

## 1. Abgleich der Akzeptanz mit dem Bestand

| Akzeptanz | Bereits belegt durch | Lücke | Ergebnis |
|---|---|---|---|
| Skript für Außenabruf `/gesund` und Sicherheitskopfzeilen | `deploy/deploy-smoke.mjs` (WP-31): `/gesund` 200, 401 ohne Sitzung (GET/PUT/POST), sechs Sicherheitsköpfe, Bundle; Basis frei wählbar (`CENTRIC_SMOKE_BASIS`). Test gegen echten `server.mjs` in `deploy-automatik.test.js` (CI: „Betrieb: Deploy-Skripte“) | Stufe von `/gesund` (ok/warnung) wurde nicht ausgegeben; kein festgelegter Aufruf von außen | **umgesetzt** (Abschnitt 2) |
| Beobachtungsprotokoll 24 h | Entscheidungsbaum Produktionsweg §3.6 (Phasen 1–3, Rollback-Trigger), RELEASE-PROZESS Phase 6, Runbook Erstwechsel (Fristen T0+24 h) | kein maschinenlesbares Protokoll der Außenabrufe | **umgesetzt**: `CENTRIC_SMOKE_PROTOKOLL` (Abschnitt 2); Ausführung 24 h = Betreiber |
| Rücksprung-Probe A→B→A mit synthetischen Daten | Bildebene „altes Bild auf neuen Daten“: `em6-rollback-codes` Schritt 2 (274bfa0 und Merge-Basis auf Daten der neuen Fassung, Widerrufe bleiben ungültig), `be1-konto-widerrufbuch`, `be2-a1-zweiter-faktor`; Skriptweg `ruecksprung.sh` nur über verifizierte Digests: `deploy-skripte.test.js`; Daten A→B→K7: K4-P4 | keine | **nicht neu gebaut** |
| … in CI | `em6`, `be1`, `be2-a1`, `deploy-skripte`, `deploy-automatik` laufen in CI | `pruefung:k4-vorwaerts-reparatur` fehlt noch in `pruefung.yml` (Ausnahme in `ci-abdeckung-ausnahmen.json`) | **Betreiber**: Workflow-Patch aus K4-P4-nachweis (Abschnitt 5 unten) |
| Wiederherstellungs- und Vorwärts-Reparaturnachweis | K4-P4 (#556): Kandidat A schreibt, Kandidat B auf demselben Stand (Abgleich, Bücher, Migrationsprobe), Datenrücksprung K7 mit neuer Epoche; `sicherungsschluessel-wiederherstellung`, `be3-widerrufbuch-sicherung` | keine (lokal, synthetisch) | **nicht neu gebaut** |
| Probe beweist Rücksprung nur ab dem zweiten Wechsel | G7 in `werkzeug/release-pruefung.mjs`: `ruecksprung` NO-GO bei Basis ohne Revisionslabel (`274bfa0`), erste Auslieferung nur `r0`; Tests in `release-pruefung.test.js` | keine | belegt; mit Pfad 0 gibt es beim ersten Wechsel ohnehin kein Rücksprungziel |
| R0 unverändert | `deploy/abschalten.sh` nicht angefasst | — | belegt (Diff) |

## 2. Umsetzung (einzige Lücke)

`deploy/deploy-smoke.mjs`:

- Die Zeile zu `/gesund` nennt die Stufe, die `/gesund` nach außen zeigt: `ok      GET /gesund: 200 (Stufe ok)` bzw.
  `(Stufe warnung)`. Exit-Regel unverändert (200 = bestanden; „warnung“ bleibt grün wie bisher, G-c verlangt die
  Einzelheiten lokal).
- `CENTRIC_SMOKE_PROTOKOLL=<datei>`: Jeder Lauf hängt genau eine JSON-Zeile an:
  `{"zeit":"<ISO>","ergebnis":"ok"|"fehlgeschlagen","gesund":"ok"|"warnung"|null,"fehler":["<Prüfname>", …]}`.
  Keine Basis, kein Host, kein Port, keine Fehlermeldung — das Protokoll darf in die Ablage des öffentlichen Repos.
  Nicht beschreibbar → `FEHLER  Protokoll …`, Exit 1 (kein stilles OK).
- Ohne die Variable bleibt der Lauf in `deploy.sh` (im Container) wie bisher: dieselben 11 `ok`-Zeilen, `SMOKE OK`.

Aufruf von außen (Betreiber, Rechner außerhalb des VPS, Node ≥ 20):

```sh
CENTRIC_SMOKE_BASIS=https://<domain> CENTRIC_SMOKE_PROTOKOLL=beobachtung-<release>.jsonl node deploy/deploy-smoke.mjs
```

Beobachtungsprotokoll 24 h (Vorschlag, Zeitgrenzen O-3): Läufe mindestens zu T0+15 min, T0+60 min (vor Go/No-Go),
danach stündlich (Cron oder von Hand) bis T0+24 h. Jede Zeile `fehlgeschlagen` oder `gesund` ≠ `ok` ist nach §3.6 zu
bewerten (Stufe `warnung` von außen kann eine alte Sicherung sein; Einzelheiten nur lokal mit `?detail=1`). Ergebnis
und Entscheidungen zusätzlich in `betrieb-protokoll.log` (wie bisher).

## 3. Tests (rot → grün)

Neu in `pruefungen/deploy-automatik.test.js` (läuft in CI im Workflow „Betrieb: Deploy-Skripte“, keine neue
npm-Kette, keine Workflow-Änderung nötig), Beschreibung „RST-7: deploy-smoke.mjs als Außenabruf mit
Beobachtungsprotokoll“:

1. Echter `server.mjs`: Ausgabe mit Stufe, weiterhin 11 `ok`-Zeilen; zwei Protokollzeilen (ok, dann toter Port
   `fehlgeschlagen` mit `GET /gesund` und `GET /`, `gesund` null); Protokoll enthält weder Host noch Port; genau
   die Schlüssel `zeit`, `ergebnis`, `gesund`, `fehler`.
2. Kleiner Testserver ohne `strict-transport-security` und mit `{"status":"warnung"}`: Exit 1, Protokoll
   `fehler: ["Kopf strict-transport-security"]`, `gesund: "warnung"`; Protokollpfad = Verzeichnis → `FEHLER  Protokoll`,
   Exit 1.

- Rot vorher: 2 rot / 1 grün (die Stufe fehlte in der Ausgabe, kein Protokoll).
- Grün nachher: 3/3 (`-t deploy-smoke`), dazu `gesund.test.js` „deploy-smoke.mjs bleibt grün bei Stufe warnung“ 1/1.
- Lokal: Windows, `TZ=UTC`, `--maxWorkers=1 --testTimeout=180000`, nur gezielte Läufe; eslint der beiden Dateien ohne
  Befund. Volllauf: CI.
- Bestehende Tests: nur ergänzt; keine Erwartung geändert.

## 4. Mutationen (je Schutz einzeln, danach zurückgelegt, Dateivergleich bestätigt)

| Mutation | Ergebnis |
|---|---|
| M1 Stufe nicht in der Ausgabe | rot (2) |
| M2 Basis ins Protokoll | rot (1) |
| M3 Schreibfehler des Protokolls verschluckt | rot (1) |
| M4 Kopfname im Protokoll pauschal „Kopf“ | rot (1) |
| M5 Protokoll nur bei Erfolg | rot (2) |
| M6 Stufe aus `/gesund` nicht gelesen | rot (2) |

## 5. Offen — nur durch Betreiber oder den Livewechsel belegbar

- Außenabruf gegen die echte Domain (TLS über Caddy, echte Köpfe am Rand) und das 24-h-Protokoll selbst: erst ab T0.
- K4-P4 in CI: Patch-Vorschlag für `.github/workflows/pruefung.yml` steht in `K4-P4-nachweis.md` (Abschnitt CI);
  danach Ausnahme `pruefung:k4-vorwaerts-reparatur` aus `pruefungen/ci-abdeckung-ausnahmen.json` entfernen.
- Wiederherstellung auf der echten Kopie (K4 echt, Fragen F-1…F-6) und Restore-Probe am Freigabe-Digest: Betreiber.
- Rücksprung auf Bildebene ist erst ab dem zweiten V4-Wechsel möglich (G7); beim ersten Wechsel gilt R0 und
  Vorwärts-Reparatur. Ein echter Rücksprung A→B→A auf dem VPS bleibt Betreiberhandlung.
- Optional (nicht umgesetzt, Workflow-Bündel des Betreibers): A.3 aus RELEASE-PROZESS — im Job `vps` nach dem
  SSH-Schritt denselben Außenabruf ausführen, Ergebnis in die Job-Zusammenfassung, **kein** automatischer Rücksprung:

```yaml
      - name: Außenabruf nach dem Deploy (RST-7)
        env: { CENTRIC_SMOKE_BASIS: "${{ env.VITE_ANWENDUNG_URL }}" }   # vorhandene Variable des Workflows
        run: node deploy/deploy-smoke.mjs | tee -a "$GITHUB_STEP_SUMMARY"
```

## Hinweis (Review-Befund niedrig)
`CENTRIC_SMOKE_PROTOKOLL` nicht in die `.env` des Servers eintragen: `deploy.sh` führt den Smoke im Container aus, und `compose.yml` lädt `env_file: .env`. Ist der Pfad dort nicht beschreibbar, endet der Smoke mit Exit 1 und der Deploy würde abbrechen. Die Variable gehört nur in den Aufruf von außen.
