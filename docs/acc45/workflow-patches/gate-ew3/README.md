# GATE-EW3 — Workflow-Patch Staging-Gate (S1–S6, Bindung B-3)

**Status:** vorbereitet, **nicht** übernommen. Die Workflow-Änderung liegt nur als Patch vor (Betreiberentscheidung
N-1, W-1 + W-3): Claude ändert keine Datei unter `.github/workflows/`. **Der Betreiber setzt sie.**
Aktivierung bleibt getrennt: `STAGING_GATE_AKTIV` wird hiermit **nicht** gesetzt (N-9: erst nach belegter technischer
Bereitschaft und nachgewiesener Digest-Bindung, siehe [TESTPLAN.md](TESTPLAN.md)).

| Datei | Inhalt |
|---|---|
| `staging-gate.patch` | Unified Diff (`git diff`-Format) gegen `.github/workflows/staging-gate.yml` der Integration, anwendbar mit `git apply` |
| `staging-gate.gepatcht.yml.txt` | dieselbe Datei nach dem Patch, vollständig (für den Web-Editor; Endung `.txt`, damit nichts sie als Workflow liest) |
| [TESTPLAN.md](TESTPLAN.md) | Läufe WT-0 … WT-5 nach der Übernahme, Erwartung, was Claude lesend prüft |
| [RUECKBAU.md](RUECKBAU.md) | Rückbau vor und nach der Übernahme |

Die CI prüft den Patch bei jedem Lauf (`pruefungen/workflow-patch-ew3.test.js`, über `npm run pruefung:staging-o2`):
Er muss auf die aktuelle Workflow-Datei passen (`git apply --check` auf einer Kopie), das Ergebnis muss der Vollfassung
gleichen, gültiges YAML sein und alle Regeln unten erfüllen. Nach der Übernahme prüft derselbe Test die Workflow-Datei
selbst (Datei = Vollfassung). Die Skripte, die der Patch aufruft, liegen schon im Repository:
`deploy/sicherung/ci/widerrufbuch-staging.sh` und `.mjs` (S1–S3), `deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh`
(S4–S6, unverändert).

## Was der Patch ändert

| Stelle | Änderung |
|---|---|
| Kopfkommentar | B-3 und S1–S6 beschrieben |
| `env` (Workflow) | `ALT_DIGEST` = Bild der Basis 274bfa0 (= `ohneRevisionslabel` im Werkzeug, per Test gebunden); `RESTIC_VERSION`/`RESTIC_SHA256` wie `betrieb-sicherung.yml` |
| Job `gate` | `timeout-minutes` 60 → 90 (S1–S6 brauchen bis ≈ 40 min) |
| checkout | `fetch-depth: 0` (M muss lesbar sein, wenn der Lauf auf S startet); `persist-credentials: false` bleibt |
| Bild ziehen | zusätzlich das Basisbild per Digest (nur für den Altbestand von S1); Bindung: alte Zeile `[ "$rev" = "$GITHUB_SHA" ]` bleibt erster Zweig, neu zweiter Zweig B-3: Label 40 Hex, genau zwei Eltern, zweiter Elter = `GITHUB_SHA`, gleicher Baum, `GITHUB_SHA` Vorfahr des Labels; `BAUM`, `BINDUNG`, `ALT_BILD` in `GITHUB_ENV` |
| neu nach Container 1 | Schritt S1–S3 (`widerrufbuch-staging.sh`), restic gepinnt mit Prüfsumme, Schritt S4–S6 (`BILD="$BILD" … widerrufbuch-ende-zu-ende.sh`, W1–W11 am **gezogenen Digest-Bild**) |
| Nachweis | Felder `commit` = Bild-Commit (Label), `laufCommit` = `GITHUB_SHA`, `baum`, `bindung`, `widerrufbuch { art, proben S1–S6, skriptSha256 }` |
| unverändert | nur `workflow_dispatch`, einzige Eingabe `digest`; `permissions: contents: read`, Job zusätzlich nur `packages: read`; einziges Secret `GITHUB_TOKEN` (nur `docker login --password-stdin`); kein `environment`, kein SSH, kein Deploy, kein Bildbau, keine Veröffentlichung; alle `uses:` per 40-Zeichen-SHA; Gate an `STAGING_GATE_AKTIV` |

## Proben S1–S6 (Gate-Entwurf A.10)

| Probe | Was läuft | Marke |
|---|---|---|
| S1 | Altbestand (Betrieb, 2 Konten, 3 Codes) über die Anwendungsschicht des **274bfa0-Bilds**; erster Start des **Digest-Bilds** mit leerem Zustandsverzeichnis ⇒ beide Bücher entstehen, Startprotokoll ohne `WARNUNG`, `/gesund` ok, alle Codes und Konten melden sich an | `S1` |
| S2 | Zugangscode über die echte API widerrufen (`/api/zugang-sperren`, Leitungssitzung) ⇒ sofort 403, im Buch; Konto über die Anwendungsschicht des Digest-Bilds sperren (es gibt keinen HTTP-Weg) ⇒ im Konto-Buch | `S2` |
| S3 | Neustart ⇒ Sperren bleiben; Rücksprung der Ablage auf den Stand nach S1 (Zustand bleibt) ⇒ Start zieht Code und Konto aus den Büchern nach, beide bleiben gesperrt, Gegenproben melden sich an | `S3` |
| S4 | `widerrufbuch-ende-zu-ende.sh` W1–W11 mit echtem restic gegen `BILD` = gezogenes Digest-Bild | `S4` (alle elf `✔ W<n>`) |
| S5 | Rücksprung: Probe Exit 3, Job Exit 3 (W6) | `S5` |
| S6 | Erstlauf-Sperre, `--erster-lauf` mit neuem Repository (W8) | `S6` |

**S2 — Abweichung, angenommen (Review #537):** Der Zugangscode wird über die echte API widerrufen; die **Kontosperre**
läuft über die Anwendungsschicht des Digest-Bilds (`accounts.accountSperren`), weil es keine HTTP-Route zur
Kontosperre gibt. Gate-Entwurf A.10 („über die API“) gilt damit für den Code, nicht für das Konto.

**`ergebnis`:** Der Nachweis trägt `ergebnis: "success"` (`job.status`); genau das verlangt #535 (E6). Wo Gate-Entwurf
A.6 / SPEZ T-N7 `ok` schreiben, gilt `success` (die Entwürfe liegen nicht im Repository).

**Frist (E6):** Der Nachweis darf bei der Endprüfung höchstens **7 Tage** alt sein — die Endprüfung muss binnen
7 Tagen nach dem Staging-Lauf erfolgen, sonst neuer Lauf am selben Digest. Das Artefakt bleibt 30 Tage und ist
**öffentlich** (wie die Logs): nur synthetische Daten.

Nur synthetische Daten (Adressen `@example.org`, Zufallscodes, Zufallspasswort, Zufallspfeffer); Codes, Passwort,
Pfeffer und Verwalterschlüssel erscheinen nie im Log (die Logs und das Artefakt sind öffentlich). S1–S3 wurden ohne
Docker örtlich gegen `node server.mjs` mit einem Altbestand aus den 274bfa0-Bibliotheken erprobt (alle Prüfungen
bestanden); der Docker-Teil läuft erst nach der Übernahme (WT-1).

## Feldabgleich Nachweis ↔ GATE-EW1 (#535, `werkzeug/release-pruefung.mjs@630c287e`)

| Feld (#535) | verlangt | Quelle im gepatchten Workflow |
|---|---|---|
| `digest` | E6: = Freigabe-Digest | Eingabe `digest` (nur `sha256:<64 hex>`), gegen `RepoDigests` des gezogenen Bilds geprüft |
| `commit` | E6: = Kandidat M | Label `org.opencontainers.image.revision` des Bilds (`REVISION`) |
| `laufCommit` | E6: ∈ {M, S}; E7: = `head_sha` des Laufs | `GITHUB_SHA` |
| `baum` | E6: 40 Hex, = Baum(M) | `git rev-parse "$REVISION^{tree}"` (`BAUM`) |
| `lauf` | E6: = `staging.lauf`; E7: `id`-`run_attempt` | `${{ github.run_id }}-${{ github.run_attempt }}` |
| `ergebnis` | E6: `success` | `${{ job.status }}` beim Nachweisschritt |
| `erstellt` | E6: ≤ 7 Tage, nicht in der Zukunft | Zeitstempel des Nachweisschritts |
| `widerrufbuch.art` | E6: `widerrufbuch-staging-funktionstest` | fest |
| `widerrufbuch.proben` | E6: genau S1–S6, je `ok` | Marken `$RUNNER_TEMP/wb-proben/S<n>`; fehlt eine: `fehler` |
| `widerrufbuch.skriptSha256` | E6: SHA-256 von `deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh` in M | `sha256sum` im Checkout (`GITHUB_SHA`; Baum = Baum(M) ⇒ gleiche Bytes) |
| Artefakt | E7: genau ein Artefakt `staging-nachweis`, Bytes = Nachweisdatei | `actions/upload-artifact`, Name `staging-nachweis`, 30 Tage |
| Lauf | E7: `path` = `.github/workflows/staging-gate.yml`, `event` = `workflow_dispatch`, `completed/success` | Workflow-Datei und Auslöser |
| `bindung` | — (nur Beleg) | `gleich` (Lauf auf M) oder `schnitt` (Lauf auf S) |
| `browserabnahme` | — (Bestand) | Playwright-Statistik |

## Übernahme durch den Betreiber (≤ 10 min, ohne Geheimnisse)

Voraussetzung: der letzte CI-Lauf auf `integration/release-v4` ist für `pruefung:staging-o2` grün (dann passt der
Patch auf die aktuelle Datei und die Vollfassung ist genau das Ergebnis).

### Weg A — Web-Editor (GitHub im Browser)

1. Repository öffnen → **Branches** → **New branch**: Name `betreiber/ew3-staging-gate`, Quelle `integration/release-v4`.
2. Auf diesem Branch `docs/acc45/workflow-patches/gate-ew3/staging-gate.gepatcht.yml.txt` öffnen → **Raw** → alles
   markieren und kopieren.
3. Auf demselben Branch `.github/workflows/staging-gate.yml` öffnen → Stift (**Edit this file**) → gesamten Inhalt
   löschen → kopierten Inhalt einfügen. Am Ende muss genau ein Zeilenumbruch stehen (der Editor zeigt keine leere
   Zusatzzeile).
4. **Commit changes…** → „Commit directly to the `betreiber/ew3-staging-gate` branch“, Nachricht
   `GATE-EW3: Staging-Gate S1–S6 und Bindung B-3 (Patch übernommen)` → bestätigen (2FA, falls gefragt).
5. **Compare & pull request** gegen `integration/release-v4`. Im Reiter *Files changed* darf **nur**
   `.github/workflows/staging-gate.yml` stehen.
6. CI abwarten: `pruefung:staging-o2` (darin `workflow-patch-ew3.test.js` im Modus „übernommen“), `workflow-haertung`,
   `actions-pins` müssen grün sein. Dann mergen.

### Weg B — `git apply` (lokal)

```bash
git fetch origin
git switch -c betreiber/ew3-staging-gate origin/integration/release-v4
git apply --check docs/acc45/workflow-patches/gate-ew3/staging-gate.patch   # keine Ausgabe = passt
git apply docs/acc45/workflow-patches/gate-ew3/staging-gate.patch
git status --short            # genau: M .github/workflows/staging-gate.yml
npx vitest run pruefungen/workflow-patch-ew3.test.js pruefungen/staging-o2.test.js pruefungen/workflow-haertung.test.js pruefungen/actions-pins.test.js
git commit -am "GATE-EW3: Staging-Gate S1–S6 und Bindung B-3 (Patch übernommen)"
git push -u origin betreiber/ew3-staging-gate   # Push einer Workflow-Datei: Inhaber-Anmeldung bzw. Token mit workflow-Scope
```

Danach PR gegen `integration/release-v4`, CI abwarten, mergen. Meldet `git apply --check` unter Windows einen Fehler
wegen Zeilenenden: `git apply --cached --check …`, `git apply --cached …`, dann
`git restore .github/workflows/staging-gate.yml` (wendet auf den Index an und holt die Datei von dort).

### Danach (getrennte Entscheidungen)

1. Testplan WT-0 … WT-5 ([TESTPLAN.md](TESTPLAN.md)); dafür muss `STAGING_GATE_AKTIV` für die Dauer der Läufe gesetzt
   sein — das ist die Aktivierungsentscheidung N-9 und **nicht** Teil der Übernahme.
2. **Pflicht** Folge-PR (Claude): Patch-Datei und Vollfassung entfernen **und im selben PR**
   `pruefungen/workflow-patch-ew3.test.js` auf die Workflow-Datei umstellen (der Test liest `PATCH_REL`/`VOLL_REL`
   und den Ordner per `readdirSync`; ohne Umstellung wird er rot). Siehe [RUECKBAU.md](RUECKBAU.md), „nach WT-1“.
