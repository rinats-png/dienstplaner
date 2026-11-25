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
| N1 | T0 | Betreiber | `t0.json` (Formular 5.1) sofort an Claude; Claude legt den Nachhol-PR an; **Merge ≤ T0 + 12 h** (sonst gilt T0 als nicht belegt: `--nachhol` meldet A-FRIST); ab dem Merge sperrt E15 jede weitere Nutzung. **Vor jeder weiteren Endprüfung nach T0 muss `t0.json` gemergt sein.** |
| N2 | ≤ T0 + 2 h | Betreiber | `widerrufbuch-sicherung.sh --erster-lauf` ⇒ Exit 0; Cron aktiv |
| N3 | nach ≥ 2 stündlichen Läufen, ≤ T0 + 24 h | Betreiber | `widerrufbuch-probe.sh` ⇒ Exit 0 |
| N3a | sofort nach N3, ≤ T0 + 24 h | Betreiber | lokale Verifikation: `verifikation.json` (Formular 5.2) |
| N4 | Merge ≤ T0 + 48 h | Betreiber gibt Dateien, Claude legt PR an, Betreiber gibt als Code-Owner frei und merged | Ablage: `t0.json`, `widerrufbuch-status.json`, `widerrufbuch-probe-status.json`, `verifikation.json`, `endpruefung.json`. **Nach dem Merge die Ablage nicht mehr ändern:** die Repo-Frist zählt je Datei den letzten Commit; eine spätere Änderung verschiebt die Frist und kann alle Folge-Releases blockieren (A-REPO) |
| N5 | nach N4 | Claude, Betreiber liest | `node werkzeug/release-pruefung.mjs --nachhol --release-id v4-r1` ⇒ `NACHHOL-GO` |

Statusdateien entstehen nur aus echten Läufen auf dem VPS. Claude ändert keine Werte. `endpruefung.json` ist die
unveränderte JSON-Ausgabe der Endprüfung (Exit 0, online, **höchstens 24 h vor T0**: `zeitpunkt` ∈ [T0 − 24 h, T0];
Grund: die Endprüfung belegt eine Sicherung ≤ 26 h, die beim Start noch gelten soll). Sie bindet die Freigabedatei
(`freigabeSha256`), den geprüften Stand (`headCommit`, muss Vorfahr von HEAD sein) und die Freigabeliste an diesem Stand
(`listeSha256`). Platzhalter in den Status- und Formulardateien der Ablage sind NO-GO (in `endpruefung.json` nur in
den Bindungsfeldern; ihre `konfiguration` enthält Beispielpfade des Werkzeugs). `--nachhol` online liest nur einen HEAD, der in
`origin/main` liegt.

**Vier-Augen-Schritt vor `deploy.sh` (Lücke L-1, bis ein eigenes Paket `deploy.sh` an die Endprüfung bindet):** Zweite
Person (bzw. Claude lesend und Betreiber) bestätigt schriftlich vor dem Start: (1) der Digest im Aufruf
`deploy.sh <digest>` = `endpruefung.json.digest`; (2) `sha256sum FREIGEGEBENE-IMAGES.md` auf dem VPS = `listeSha256`
der Endprüfung. Weicht eines ab: kein Start.

**Neustart nach A-START oder A-ABN mit Umgebungsursache:** derselbe Digest startet erneut mit `deploy.sh`, **ohne neue
Endprüfung** (die Endprüfung galt für genau diesen Digest; eine neue wäre wegen E15 ohnehin NO-GO). T0 bleibt der erste
Start, alle Fristen laufen weiter. Es entsteht **keine** Abbruchdatei unter `docs/acc45/releases/v4-r1/`, nur der Vorfall
(`docs/acc45/VORFALL-<datum>-<id>.md`). Eine Abbruchdatei `abbruch-<ID>.json` entsteht nur bei einem **endgültigen**
Abbruch nach T0 (Wiederanlauf W-NACH); sie macht `--nachhol` endgültig NO-GO mit dieser ID.

**E14 und dieser PR (Hinweis):** E14 verlangt, dass die PRs von GATE-EW1/EW2 (laut SSOT `pr`) und der PR der
Freigabedatei ein `APPROVED` des Inhabers tragen, dessen Autor **nicht** der Inhaber ist. Ein vom Inhaber-Token
angelegter PR erfüllt das nie. Der Inhalt muss für v4-r1 deshalb über einen PR des Maschinenkontos landen (K-1), und der
SSOT-Eintrag nennt nur diesen PR. Bis dahin bleibt G6 mit Ausnahme NO-GO (fail-closed).

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
| frühere Fassung der Freigabedatei mit Ausnahme oder frühere Zeile `aktiv` der Liste nennt einen anderen V4-Kandidaten ohne A-VOR-Nachweis „kein Start“ | unklar ⇒ NO-GO |

Die Geschichte wird mit `git log --full-history --no-renames` gelesen: Ein Merge, der eine Datei fallen lässt oder
zurücksetzt, verbirgt sie nicht.

**Folge-Release:** Für jeden Release ≠ `v4-r1` muss `docs/acc45/releases/v4-r1.freigabe.json` in HEAD liegen. Trägt sie
die Ausnahme, muss `--nachhol` für v4-r1 `NACHHOL-GO` ergeben (einzige Abweichung: nur A-REPO und `nachholAbweichung`).
Fehlt oder unlesbar ⇒ NO-GO. Die Basis des Folge-Release spielt keine Rolle. **Folge: Jeder Release ≠ `v4-r1` ist in
G6 NO-GO, solange `v4-r1.freigabe.json` nicht in HEAD liegt — auch ein V3-Hotfix vor v4-r1.** Trägt die Datei die
Ausnahme nicht (mehr), ist sie nur zulässig, wenn die Ausnahme nie genutzt wurde: keine frühere Fassung mit
`erstwechselAusnahme` und nie eine Datei unter `v4-r1/nachhol/` oder `v4-r1/abbruch-*` (HEAD und Geschichte), sonst NO-GO.
Die Rückhaltprüfung eines Folge-Release online liest die Nachhol-Ablage aus HEAD; dieser HEAD muss in `origin/main`
liegen (sonst `--nachhol` NO-GO und damit Rückhalt NO-GO). Die Spurensuche selbst prüft `origin/main` nicht eigens: die
Endprüfung jedes Release verlangt in G10 ohnehin, dass HEAD genau der Kopf von `origin/main` ist.

**„Eingetragen“ gilt als „genutzt“ (fail-closed):** Trug irgendeine frühere Fassung von `v4-r1.freigabe.json` die
`erstwechselAusnahme`, oder lag je eine Datei unter `v4-r1/nachhol/` oder `v4-r1/abbruch-*` (auch `abbruch-A-VOR.json`),
dann ist jeder Release ≠ v4-r1 nach Entfernen der Ausnahme für immer G6 NO-GO — auch nach einem A-VOR-Abbruch ohne
V4-Start, obwohl die Ausnahme nach F10 dann nicht verbraucht ist. Der Weg bleibt: v4-r1 mit der Ausnahme abschließen
(`NACHHOL-GO`). Einziger anderer Ausweg ist eine Codeänderung am Werkzeug mit Review und Gate-Freigabe.

**Voller Klon Pflicht:** Endprüfung und `--nachhol` laufen nur in einem vollständigen Klon. In einem flachen Klon
(`git rev-parse --is-shallow-repository` = `true`) sind E15, Rückhalt und `--nachhol` NO-GO mit `FLACHER-KLON`.
Ein fehlendes Git-Objekt einer früheren Fassung gilt nicht als Löschung, sondern als „nicht ermittelbar“ ⇒ NO-GO.
Liegt im prüfenden Klon eine Datei `info/grafts` oder ein Ref unter `refs/replace/`, ist die Geschichte verändert ⇒
NO-GO mit `GRAFT-ODER-REPLACE`; das Werkzeug wendet Ersetzungen ohnehin nie an (`GIT_NO_REPLACE_OBJECTS=1`).
Voraussetzung: wer prüft, hat Zugriff auf `.git` des prüfenden Klons; ein Standard-Klon holt `refs/replace` nicht.
In einem Teil-Klon (`--filter=blob:none`, `--filter=tree:0`) lädt git fehlende Objekte bei erreichbarer Quelle
nach; das Werkzeug ist dann nicht rein lesend gegenüber dem lokalen Objektspeicher (das Ergebnis bleibt per Hash
geprüft). Für die Endprüfung und `--nachhol` deshalb einen vollen, normalen Klon verwenden.
Auch eine manipulierte Datei `objects/info/commit-graph` kann falsche Eltern liefern (gleiche Angreiferklasse wie
`info/grafts`: Schreibzugriff auf `.git`); das Werkzeug erkennt das nicht. Deshalb Endprüfung und `--nachhol` immer
in einem **frischen, vertrauenswürdigen, vollen Klon** ausführen (ohne fremdes commit-graph, ohne `info/grafts`,
ohne `refs/replace`).

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

**Annahmen des Werkzeugs (online):** Das Artefakt `staging-nachweis` lädt `gh api …/artifacts/<id>/zip` in den
Speicher (Puffer höchstens 512 MB; ZIP höchstens 1000 Einträge, 10 MB je Eintrag, 50 MB entpackt). Ein größeres
Artefakt scheitert ⇒ E7 NO-GO.

## 5. Formulare

### 5.1 `nachhol/t0.json`

```json
{ "releaseId": "v4-r1", "digest": "sha256:<64 hex, Freigabe-Digest>", "kandidat": "<40 hex, M>", "t0": "<UTC, aus betrieb-protokoll.log>" }
```

### 5.2 `nachhol/verifikation.json`

```json
{ "sha256": "<SHA-256 der Datei widerrufbuch-probe-status.json>", "verifiziertAm": "<UTC>", "exit": 0 }
```

Bei `gegenprobe = nicht-aussagekraeftig` zusätzlich `"pruefsummenVergleich": "zugang-widerrufe.json=<64 hex>;konto-widerrufe.json=<64 hex>"`
aus den Protokollzeilen `sha256 vergleich …` der Probe; `pruefsummen` der Probe muss dasselbe Format haben und gleich sein
(F4; zusätzlich Staging-Probe S5 `ok`).

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
| A-START | Start nach T0 scheitert | T0 … T0 + 15 min | R0; Vorfall; **keine** Abbruchdatei, solange ein Neustart vorgesehen ist | Umgebungsursache: derselbe Digest startet neu, ohne neue Endprüfung, kein neues T0, Fristen laufen weiter; Codeursache oder endgültig: `abbruch-A-START.json`, W-NACH |
| A-ABN | Live-Abnahme G-a…G-f nicht erfüllt | ≤ T0 + 60 min | R0; Vorfall; keine Abbruchdatei bei Neustart | wie A-START (`abbruch-A-ABN.json` nur bei endgültigem Abbruch) |
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
