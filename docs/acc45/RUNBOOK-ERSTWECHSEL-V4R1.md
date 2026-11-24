# Runbook Erstwechsel v4-r1: Ausnahme der Widerrufbuch-Probe (GATE-EW4)

Stand 2026-11-24. Gilt nur für den Release `v4-r1` (erster V4-Wechsel von `274bfa0`). Regelquelle: Gate-Entwurf 2026-11-24 v2
(A.4–A.8) und Betreiberentscheidungen F1–F10. **Maßgeblich ist das Werkzeug** (`node werkzeug/release-pruefung.mjs
--konfig-zeigen`, Abschnitt `erstwechselAusnahme`). Weicht dieses Runbook davon ab, gilt das Werkzeug.

Status: Die Gate-Änderung ist zur unabhängigen Prüfung umgesetzt. Sie ist erst nach dem unabhängigen Review und der
schriftlichen Gate-Freigabe des Betreibers anwendbar. Dieses Runbook genehmigt keinen Wechsel.

Keine Personendaten, keine Hostnamen, keine Schlüssel in den Dateien dieses Runbooks.

## 1. Begriffe

| Begriff | Bedeutung |
|---|---|
| S | Schnitt-Commit, Kopf von `release/rc-<id>` (Freigabedatei: `schnittCommit`) |
| M | Release-Commit = Kandidat: Merge-Commit auf `main`, Eltern (alter `main`-Kopf, S), Baum(M) = Baum(S) |
| T0 | erster tatsächlicher Start eines Containers aus dem V4-Bild auf dem Produktionsbestand (UTC) |
| Ablage | `docs/acc45/releases/v4-r1/nachhol/` |

## 2. Bedingungen E1–E15 (G6 prüft alle; jede verletzte Bedingung ist ein eigener Grund `E<n>: …`)

| Nr | Kurz |
|---|---|
| E1 | Release-ID exakt `v4-r1` (Freigabe, Aufruf, Ausnahme) |
| E2 | Basis = `274bfa0baca5681f383eea334aab69875f31d5c1` (Aufruf, Freigabe, Ausnahme), Bild ohne Revisionslabel |
| E3 | Basis ohne Widerrufbuch-Module; M mit Modulen, Sicherungs-, Probe- und Ende-zu-Ende-Skript |
| E4 | Freigabeliste: M `aktiv`, `274bfa0` `vorherig`, sonst nur gesperrte Alt-Bilder; ein nach A-VOR abgebrochener Kandidat nur `gesperrt` mit Grund `A-VOR …` |
| E5 | `kandidatCommit`, `schnittCommit`, `digest` der Ausnahme = Freigabe = Aufruf |
| E6 | Staging-Nachweis unter `docs/acc45/releases/v4-r1/nachweise/`, SHA-256 = `staging.sha256`, `ergebnis` `success`, Digest, `commit` = M, `baum` = Baum(M), `laufCommit` ∈ {M, S}, S1–S6 `ok`, `skriptSha256`, ≤ 7 Tage |
| E7 | Lauf-API: `staging-gate.yml`, `workflow_dispatch`, `completed/success`, Lauf und Versuch, `head_sha` = `laufCommit`; Artefakt `staging-nachweis` enthält die Bytes des Nachweises |
| E8 | Fristen 24 h / 48 h, `gueltigBis` 2026-12-31, Abbruchliste = A.8, Ablage, Quittung im festen Wortlaut |
| E9 | jetzt ≤ 2026-12-31 23:59:59 UTC |
| E10 | keine `widerrufbuch-probe-status.json` zusammen mit der Ausnahme |
| E11 | Sicherung außer Haus ≤ 26 h und Restore-Probe ≤ 35 Tage bleiben Pflicht |
| E12 | keine Platzhalter |
| E13 | M hat genau 2 Eltern, 2. Elter = S, Baum(M) = Baum(S), S Vorfahr von HEAD |
| E14 | Vier-Augen: Rulesets `main` und `integration/release-v4` mit Code-Owner-Review, `main` mit `update`; CODEOWNERS deckt die Release-Pfade allein mit dem Inhaber; PR der Freigabedatei und PRs von GATE-EW1/EW2 mit `APPROVED` des Inhabers ≠ Autor auf dem letzten Kopf |
| E15 | Verbrauch (F10): siehe Abschnitt 4 |

## 3. Ablauf N0–N5

| Schritt | Zeitpunkt | Wer | Ergebnis |
|---|---|---|---|
| N0 | vor T0 | Betreiber | `widerrufbuch.env` (eigenes Repository, eigenes Passwort), `restic init`, Cron-Zeile vorbereitet (auskommentiert) |
| N1 | T0 | Betreiber | `t0.json` (Formular 5.1) sofort an Claude; Claude legt den Nachhol-PR an; ab dem Merge sperrt E15 jede weitere Nutzung. **Vor jeder weiteren Endprüfung nach T0 muss `t0.json` gemergt sein.** |
| N2 | ≤ T0 + 2 h | Betreiber | `widerrufbuch-sicherung.sh --erster-lauf` ⇒ Exit 0; Cron aktiv |
| N3 | nach ≥ 2 stündlichen Läufen, ≤ T0 + 24 h | Betreiber | `widerrufbuch-probe.sh` ⇒ Exit 0 |
| N3a | sofort nach N3, ≤ T0 + 24 h | Betreiber | lokale Verifikation: `verifikation.json` (Formular 5.2) |
| N4 | Merge ≤ T0 + 48 h | Betreiber gibt Dateien, Claude legt PR an, Betreiber gibt als Code-Owner frei und merged | Ablage: `t0.json`, `widerrufbuch-status.json`, `widerrufbuch-probe-status.json`, `verifikation.json`, `endpruefung.json` |
| N5 | nach N4 | Claude, Betreiber liest | `node werkzeug/release-pruefung.mjs --nachhol --release-id v4-r1` ⇒ `NACHHOL-GO` |

Statusdateien entstehen nur aus echten Läufen auf dem VPS. Claude ändert keine Werte. `endpruefung.json` ist die
unveränderte JSON-Ausgabe der Endprüfung (Exit 0, online); ihr Feld `freigabeSha256` bindet die Freigabedatei.

**Fristen-Kalender:** T0 + 2 h (Erstlauf), T0 + 12 h und T0 + 20 h (Claude prüft das Repository auf die Ablage),
T0 + 24 h (Probe und Verifikation), T0 + 40 h (Claude erinnert), T0 + 48 h (Merge der Ablage).

## 4. Verbrauch der Ausnahme (F10, Betreiberentscheidung 2026-11-24)

Die Ausnahme ist ab dem **ersten tatsächlichen V4-Start** verbraucht. Das Werkzeug entscheidet maschinell (E15) aus HEAD
**und** der Geschichte von HEAD:

| Lage in `docs/acc45/releases/v4-r1/` (heute oder früher) | Entscheidung |
|---|---|
| eine Datei unter `nachhol/` (z. B. `t0.json`) | Start erfolgt ⇒ verbraucht ⇒ NO-GO |
| `abbruch-<ID>.json` mit ID ≠ A-VOR | Abbruch nach T0 ⇒ verbraucht ⇒ NO-GO |
| `abbruch-A-VOR[-n].json`, Startzustand „kein Start“, unverändert seit dem Hinzufügen, noch vorhanden | nicht verbraucht; Wiederholung erlaubt |
| `abbruch-A-VOR[-n].json` mit Buch vorhanden oder Startzeile ≥ 1 | Start erfolgt ⇒ verbraucht |
| `abbruch-A-VOR[-n].json` unlesbar, unvollständig, nachträglich geändert oder gelöscht | unklar ⇒ NO-GO |
| Geschichte von HEAD nicht lesbar | unklar ⇒ NO-GO |

Abbruch vor dem Start aus Codeursache: neuer Kandidat; der alte steht in der Freigabeliste `gesperrt` mit Grund, der mit
`A-VOR` beginnt, und hat einen A-VOR-Nachweis „kein Start“. Die Release-ID bleibt `v4-r1` (andere IDs haben keine Ausnahme).

**Belegbare Kriterien des Startzustands (nur lesend auf dem VPS, Ausgaben unverändert übernehmen):**

```sh
# 1, 2: Widerrufbücher entstehen erst beim V4-Start (W-4, W-5)
test -e "$CENTRIC_ZUSTAND_PFAD/zugang-widerrufe.json" && echo vorhanden || echo fehlt
test -e "$CENTRIC_ZUSTAND_PFAD/konto-widerrufe.json" && echo vorhanden || echo fehlt
# 3: deploy.sh schreibt „env digest=<digest>“ unmittelbar vor `compose up` (deploy/deploy.sh, Schritt Start)
grep -c "env digest=<V4-Digest>" betrieb-protokoll.log
# 4: Bindung an das Protokoll
sha256sum betrieb-protokoll.log
```

## 5. Formulare

### 5.1 `nachhol/t0.json`

```json
{ "releaseId": "v4-r1", "digest": "sha256:<64 hex, Freigabe-Digest>", "kandidat": "<40 hex, M>", "t0": "<UTC, aus betrieb-protokoll.log>" }
```

### 5.2 `nachhol/verifikation.json`

```json
{ "sha256": "<SHA-256 der Datei widerrufbuch-probe-status.json>", "verifiziertAm": "<UTC>", "exit": 0 }
```

Bei `gegenprobe = nicht-aussagekraeftig` zusätzlich `"pruefsummenVergleich": "<Prüfsummen des Vergleichs-Snapshots im
Format von pruefsummen>"` aus den Protokollzeilen `sha256 vergleich …` der Probe (F4; zusätzlich Staging-Probe S5 `ok`).

### 5.3 `abbruch-A-VOR.json` (Abbruch vor dem Start; weitere: `abbruch-A-VOR-2.json` …)

```json
{ "id": "A-VOR", "releaseId": "v4-r1", "kandidat": "<40 hex>", "digest": "sha256:<64 hex>", "zeit": "<UTC>",
  "deployExit": "<Exit-Code von deploy.sh, ≠ 0>",
  "startzustand": { "zugangWiderrufe": "fehlt", "kontoWiderrufe": "fehlt", "v4Startzeilen": 0, "protokollSha256": "<64 hex>" } }
```

`deployExit` und `v4Startzeilen` sind Zahlen. Die Datei wird einmal hinzugefügt und nie geändert oder gelöscht.

## 6. Abbruchtabelle

Quelle: Gate-Entwurf 2026-11-24 v2, A.8 (einzige Quelle). Bei Abweichung gilt die Konfiguration im Werkzeug
(`abbruchBedingungen`). R0 = `deploy/abschalten.sh` (ändert keine Daten). Kein Bild-Rücksprung auf `274bfa0` nach T0;
`zustand/` nie zurückrollen. Bei Abbruch nach T0: `docs/acc45/VORFALL-<datum>-<id>.md` und
`docs/acc45/releases/v4-r1/abbruch-<ID>.json` (E15).

| ID | Bedingung | Frist | Folge | Wiederanlauf |
|---|---|---|---|---|
| A-VOR | Abbruch vor T0, kein V4-Container lief | vor T0 | `deploy.sh` startet `274bfa0` wieder, sonst R0; Ausnahme nicht verbraucht | Ursache beheben; Nachweis 5.3; derselbe Kandidat, bei Codeursache neuer Kandidat (alter `gesperrt`, Grund `A-VOR …`); alle Fristen neu prüfen; Endprüfung Exit 0 |
| A-STG | Staging-Nachweis fehlt, rot, > 7 d, falsch gebunden | Endprüfung | G6 NO-GO | neuer grüner Lauf am selben Digest |
| A-START | Start nach T0 scheitert | T0 … T0 + 15 min | R0 | Umgebungsursache: derselbe Kandidat, Frist läuft weiter; Codeursache: W-NACH |
| A-ABN | Live-Abnahme G-a…G-f nicht erfüllt | ≤ T0 + 60 min | R0 | wie A-START |
| A-SICHER | Datenschutz- oder Sicherheitsbefund | jederzeit | R0 sofort; Listenzeile `gesperrt`; Vorfall | W-NACH mit neuem Kandidaten |
| A-DATEN | Datenschaden | jederzeit | R0; Wiederherstellung nur nach Wiederherstellungskonzept M-6 | W-NACH |
| A-BUCH | Buch fehlt, Siegel ungültig, `/gesund` meldet `widerrufbuch` nicht ok | T0 … T0 + 24 h | R0 sofort + Vorfall | W-NACH |
| A-SICH | Erstlauf nicht Exit 0 bis T0 + 2 h, > 3 h ohne Lauf, Ablage-Sicherung > 26 h | bis T0 + 24 h | R0 + Vorfall | W-NACH |
| A-PROBE | Nachholprobe Exit 3 (Rücksprung) | N3 | R0 sofort + Sicherheitsvorfall | W-NACH |
| A-PROBE-W | Probe Exit 1/4/78, `nicht-moeglich`, `nicht-aussagekraeftig` ohne Beleg | bis T0 + 24 h | kein R0; Probe wiederholen | Erfolg bis T0 + 24 h, sonst A-FRIST |
| A-BILD | `bild` ≠ Freigabe-Digest | N3 | R0 sofort + Sicherheitsvorfall | W-NACH |
| A-FRIST | bis T0 + 24 h keine gültige Probe mit lokaler Verifikation | T0 + 24 h | R0 + Vorfall | W-NACH |
| A-REPO | Ablage nicht bis T0 + 48 h gemergt | T0 + 48 h | `NACHHOL-NO-GO` (endgültig); Vorfall; kein R0 | W-REPO: Dateien nachreichen; Folge-Release braucht `nachholAbweichung` |
| A-ABLAUF | jetzt > 2026-12-31 23:59:59 UTC vor T0 | Endprüfung | kein Wechsel mit Ausnahme | nur neue Betreiberentscheidung und neuer Werkzeug-PR mit Review |
| A-VIER | Vier-Augen nicht erfüllt | Endprüfung | G6 NO-GO | Einrichtung S-04…S-07 abschließen, Code-Owner-Freigabe nachholen |
| A-HOST | Hostverlust | jederzeit | Wiederherstellungskonzept M-9 | W-NACH |

**W-NACH (nach T0):** Ursache behoben, Vorfall-Datei vorhanden; reguläre Widerrufbuch-Sicherung und reguläre Probe auf
den echten Büchern; Freigabedatei **ohne** Ausnahme; Endprüfung Exit 0. Ist die reguläre Probe nicht durchführbar ⇒ NO-GO.

## 7. Vorfallvorlage `docs/acc45/VORFALL-<datum>-<id>.md`

```markdown
# Vorfall <datum> <Abbruch-ID>

- Release: v4-r1 · Kandidat M: <40 hex> · Digest: sha256:<64 hex> · T0: <UTC oder „vor T0“>
- Zeitpunkt der Feststellung (UTC):
- Bedingung (Abbruchtabelle): <ID> — Beleg (Datei, Exit-Code, Protokollzeile ohne Personendaten):
- Folge ausgeführt (R0 ja/nein, Uhrzeit):
- Ursache (Umgebung / Code / unbekannt):
- Wiederanlauf (W-VOR / W-NACH / W-REPO) und Bedingungen:
- Vier-Augen-Vermerk (Prüfer, Datum):
```
