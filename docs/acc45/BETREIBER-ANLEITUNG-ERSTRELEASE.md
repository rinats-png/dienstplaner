# Betreiber-Anleitung: erste Veröffentlichung (Erstrelease)

Stand: 2026-11-21 · Basis: `integration/release-v4` @ `8e67ac0e` (enthält #427) · Paket: REL-0 bis REL-4

Diese Anleitung ist die **eine** Schrittfolge bis zur ersten Veröffentlichung eines Integrationsbilds. Sie ordnet
die Handlungen nach dem kritischen Pfad. Sie wiederholt die Quelldokumente nicht, sie verweist auf sie. Jeder Befehl
stammt aus einem Dokument oder Skript im Repository; die Quelle steht dabei.

**Diese Anleitung genehmigt nichts.** Sie startet keinen Workflow, ändert keinen VPS und legt keine Secrets an. Bei
einem Widerspruch zu einem Quelldokument gilt das Quelldokument. Melden Sie den Widerspruch.

Kennzeichnung wie im [Produktionsweg](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md): **[belegt]**, **[nicht belegt]**,
**[angenommen]**. **offen: braucht Ergebnis von <Schritt>** heißt: Der genaue Befehl oder Wert hängt von einem
früheren Ergebnis ab und steht deshalb hier noch nicht.

---

## 0. Stand heute

**Heute live: nichts** aus dem Release-Weg.

- Produktion laut [`deploy/FREIGEGEBENE-IMAGES.md`](../../deploy/FREIGEGEBENE-IMAGES.md): `274bfa0`
  (Digest `sha256:0b192927…`, Status `aktiv`). **Nicht am Server geprüft** (REL-0 offen; Widerspruch Liste ↔ Gedächtnis
  in [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md)).
- Kein Bild aus `main` und keines aus `integration/release-v4` in GHCR. Jüngstes Bild: `265d575` vom 2026-11-05
  ([Produktionsweg](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) §1.1).
- `main` @ `a5b49709` liegt 157 Commits hinter `integration/release-v4` @ `8e67ac0e` (abgefragt 2026-11-21).
- Umgebung `produktion` fehlt. `main` ist ungeschützt. Ein Deploy-Key mit Schreibrecht ist aktiv (Produktionsweg §1.5).
- Keine Sicherung außer Haus, kein belegter Restore auf echten Daten (Produktionsweg §1.4).
- Release-Prüfung (lesender Probelauf 2026-11-21, `RELEASE-PROBELAUF-2026-11-21.md` auf Branch
  `acc45/release/rel-1-nachzug`): **NO-GO in allen zehn Gates**.

## 1. Wer tut was

| Was Claude allein tun kann | Was nur der Betreiber tun kann |
|---|---|
| Lesende Abfragen auf GitHub (`gh api`, nur GET) und GHCR (anonym) | Jede Handlung auf dem VPS (IONOS-Remotekonsole, SSH) |
| Release-Kandidat als Branch `release/rc-<datum>` und PR nach `main` anlegen | PR nach `main` mergen (Claude merkt nie nach `main`, [BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md) §5) |
| Release-Prüfung `werkzeug/release-pruefung.mjs` laufen lassen (Vor- und Endprüfung) | Workflow „Auslieferung“ starten (Bildbau und Auslieferung) und in der Umgebung `produktion` freigeben |
| Vorlagen-Hashes erzeugen (`--vorlagen-hashes`), Listen-PR für `FREIGEGEBENE-IMAGES.md` vorbereiten | Freigabedatei `docs/acc45/releases/<id>.freigabe.json` commiten |
| Entwürfe für Annahmelisten (G2, G8, G9) mit Belegen vorbereiten | Annahmen entscheiden (`reviewBestaetigt`, `akzeptierte*`), Migration freigeben (G5), Rückweg O-1/O-2 entscheiden (G7) |
| Prüfsummen der Betriebsdateien des Listen-Commits liefern | Deploy-Key, Branch-Schutz, Umgebung, Variablen und Secrets in den GitHub-Einstellungen |
| Berichte, Status, Nachweise im Repository nachziehen | Speicherziel (IONOS Object Storage) bestellen, Schlüssel und Passwörter verwahren, Sicherung einrichten |
| Fehler eingrenzen, Fix-PR für eine Vorwärts-Reparatur | Live-Abnahme, Go/No-Go, R0 auslösen, jede Entscheidung über einen Rückweg |

Claude startet nie einen Deploy-Workflow und greift nie auf den VPS zu ([RELEASE-PROZESS.md](RELEASE-PROZESS.md) §3).

## 2. Regeln für alle Schritte

1. Führen Sie je Schritt nur die genannten Befehle aus. Vergleichen Sie jede Ausgabe mit „Erwartet“.
2. Gehen Sie nur weiter, wenn „Weiter nur wenn“ erfüllt ist. Sonst: **STOPP**. Ändern Sie nichts. Melden Sie die Ausgabe.
3. Nie `cat .env`. Nie Werte aus der `.env`, keine Passwörter, keine privaten Schlüssel in Chat, Repository oder Log.
4. Keine Daten löschen. Kein `docker compose down -v`, kein `rm` in `data/` oder `zustand/`, kein `docker rmi` ohne
   eigene Freigabe.
5. Keine Migration ohne Freigabe in der Freigabedatei (G5).
6. **R0 (Dienst anhalten) ist kein vollständiger Rücksprung.** Das Integrationsbild schreibt beim ersten Start in
   `data/` und legt `zustand/` an (Produktionsweg §3.2, W-1 bis W-9). Ein vollständiger Rücksprung auf `274bfa0` ist
   danach nicht sicher (§3.3): `274bfa0` hat keinen zweiten Faktor, kein Revisionslabel und ignoriert die
   Widerrufbücher. Regelweg nach einem Fehler ist R0 und dann Vorwärts-Reparatur (§3.5).
7. Platzhalter: `<kandidat>` = voller Commit (40 Zeichen) des Kandidaten auf `main`; `<digest>` = `sha256:` + 64 Zeichen;
   `<id>` = Release-ID (Vorschlag `v4-r1`); `<basis>` = `274bfa0baca5681f383eea334aab69875f31d5c1`;
   `<listen-commit>` = voller Commit auf `main` nach dem Listen-PR.

## 3. Kritischer Pfad (Übersicht)

| Nr | Schritt | Gate | Wer | Hängt ab von |
|---|---|---|---|---|
| 4 | REL-0: VPS-Zugang, Inventur V-1…V-9 | REL-0, F-1 | Betreiber | — |
| 5 | Entscheidungen: Deploy-Key, Branch-Schutz, Umgebung `produktion`, O-1/O-2, Annahmen G2/G8/G9 | G7, G10, F-7, F-8 | Betreiber | 4 (für O-5) |
| 6 | Sicherung außer Haus, Restore-Probe, Widerrufbuch-Probe, Probe K0–K11 | G6, G5 (K4), F-5, F-6 | Betreiber | 5 (Speicherziel) |
| 7 | Kandidat auf `main` (rc-Zweig, PR, Kopf-Pin) | G1, G2, F-2 | Claude PR, Betreiber Merge | 5 (Branch-Schutz) |
| 8 | Bildbau `bauen=true`, `ausliefern=false`, Vorprüfung | G4, F-3 | Betreiber startet, Claude prüft | 7 |
| 9 | Hashes, Listen-PR, Freigabedatei | G3, G10, F-12 | Claude, Betreiber | 8 |
| 10 | Migrationsfreigabe | G5 | Betreiber | 6 (K4) |
| 11 | Rückweg festlegen | G7 | Betreiber | 5 |
| 12 | VPS vorbereiten (Dateien, `.env`, `zustand/`, Forced Command, Secrets) | F-9, F-10 | Betreiber | 9 |
| 13 | Endprüfung (Gate-Lauf) | G1–G10 | Claude, Betreiber liest | 6, 9, 10, 11 |
| 14 | Auslieferung über `workflow_dispatch` und Umgebung `produktion` | REL-3, F-14 | Betreiber | 12, 13 |
| 15 | Live-Smoke, Go-Kriterien G-a…G-f | REL-4 | Betreiber | 14 |
| 16 | Rückweg im Fehlerfall, Abschluss nach 24 h | REL-4 | Betreiber | 15 |

---

## 4. REL-0: VPS-Zugang und Inventur

### 4.1 Lesenden Zugang einrichten

- **Ziel / Gate:** REL-0. Ein Zugang, der nur das Lese-Skript `deploy/inventur.sh` ausführt.
- **Handlung:** [VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md) in dieser Reihenfolge:
  Abschnitt 0 (0a–0d, Arbeitsrechner), Abschnitt 1 (1a–1e, IONOS-Remotekonsole, nur lesen), danach Abschnitt 3
  (3a–3e, Installation) und Abschnitt 4 (4a–4c, Nachprüfung und Negativproben). Befehle stehen dort.
- **Erwartet:** wie dort je Unterschritt. In 1e: alle drei Host-Fingerabdrücke stimmen. In 3a/3b: Prüfsumme
  `d99207298c12…` Zeichen für Zeichen. In 4c: alle Proben N-1 bis N-11 verweigern.
- **Weiter nur wenn:** jeder Unterschritt „Weiter nur wenn“ erfüllt. Prüfsumme zusätzlich aus einem zweiten Kanal
  bestätigt (Review-Kommentar oder Chat, VPS-ZUGANG §3).
- **Rückweg:** VPS-ZUGANG §6 (Zeile entfernen, Skript entfernen, Schlüssel löschen).
- **Danach Claude:** nichts. Claude wartet auf 4.2.

### 4.2 Inventur V-1 bis V-9 ausführen und ablegen

- **Ziel / Gate:** F-1 (laufendes Bild bestimmt). Grundlage für 5.1, 6, 12.
- **Handlung:** VPS-ZUGANG §5 (Lauf wie §4b; Rohausgabe bleibt lokal). Zusammenfassung nach der Tabelle in §5 als
  `docs/acc45/vps-inventur-<JJJJ-MM-TT>.md`; vor dem PR die Prüfung aus §5 Punkt 4.
- **Erwartet:** Abschnitte `=== V-1` bis `=== V-9`; Rückgabe 0 oder 1. Die Prüfung in §5 Punkt 4 gibt keine Zeile aus.
- **Weiter nur wenn:** Zustand A, B oder C nach [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §3 steht fest.
  **Bei Zustand B** (gesperrtes `f03a8514…` läuft): STOPP. Erst Ihre Sofortentscheidung nach PROD-DIGEST-ABWEICHUNG §3
  (Handlung B-2 im Produktionsweg).
- **Rückweg:** keiner nötig (nur lesen). Zusammenfassung: PR schließen.
- **Danach Claude:** übernimmt die Zusammenfassung per PR, trägt in die Liste der offenen Punkte ein: fehlende
  `.env`-Schlüssel (V-6), `IMAGE_TAG` oder `IMAGE_DIGEST` (V-3), `zustand/` (V-5), Forced Command (V-8), Platz (V-9).

---

## 5. Entscheidungen und GitHub-Einstellungen

### 5.1 Deploy-Key mit Schreibrecht klären (B-4, O-5) — dringend

- **Ziel / Gate:** F-8. Risiko R-GH-2: Wer den Schlüssel auf dem Server hat, kann auf `main` pushen.
- **Handlung:** GitHub → Repository → **Settings** → **Deploy keys**. Den Schlüssel mit Schreibrecht ansehen.
  - Die Inventur zeigt keine Git-Nutzung: V-7 sind die Sicherungen, V-8 nur die Optionen in `authorized_keys`. Ob der
    VPS Git braucht, prüfen Sie selbst in der Remotekonsole (nur lesen), zum Beispiel:
    `crontab -l | grep -i git`, `grep -ril git /etc/cron* 2>/dev/null`, `ls -a ~` (Arbeitsverzeichnis mit `.git`?).
  - **Vor jedem Delete:** den öffentlichen Teil sichern. GitHub zeigt nach dem Anlegen nur den Fingerabdruck, nicht den
    Schlüssel. Auf dem VPS die Datei `~/.ssh/*.pub` kopieren oder, falls sie fehlt, aus dem privaten Schlüssel ableiten:
    `ssh-keygen -y -f ~/.ssh/<privater-schlüssel> > deploy-key.pub`. Danach `ssh-keygen -lf deploy-key.pub` und den
    SHA256-Fingerabdruck mit dem Wert in **Deploy keys** vergleichen. Nur bei Gleichheit weiter.
  - Kein Git-Bedarf: **Delete**.
  - Wird er gebraucht: zuerst den alten Eintrag **Delete**, danach **Add deploy key** mit dem gesicherten öffentlichen
    Teil, **ohne** „Allow write access“. Umgekehrt geht es nicht: GitHub lehnt einen Schlüssel ab, der schon
    eingetragen ist („Key is already in use“). Zwischen Löschen und Neuanlegen hat der VPS keinen Git-Zugang. Der
    Auslieferungsweg ist davon nicht betroffen: Der VPS holt Bilder aus GHCR, nicht aus Git (Produktionsweg §1.5).
    Unterbrochen wird nur die Git-Nutzung, die Ihre Prüfung oben gefunden hat.
- **Erwartet:** Kein Deploy-Key mit Schreibrecht. Lesende Prüfung durch Claude:
  `gh api repos/rinats-png/dienstplaner/keys --jq '.[] | [.id, .read_only]'` zeigt keine Zeile mit `false`.
- **Weiter nur wenn:** keine Zeile mit `false`.
- **Rückweg:** Schlüssel mit dem gesicherten öffentlichen Teil (`deploy-key.pub`) neu anlegen, nur lesend.
- **Danach Claude:** führt die Abfrage aus und vermerkt das Ergebnis.

### 5.2 Branch-Schutz `main` (P3-3)

- **Ziel / Gate:** Voraussetzung für belastbare Belege in G2 und G10 (RELEASE-PROZESS §5, Restrisiko R5).
- **Handlung:** GitHub → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**. Werte
  für `main` nach [BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md) §5 (dazu §2 gemeinsame Regeln). Vorher den
  Wirkungstest auf Wegwerf-Branches nach §6.
- **Erwartet:** `node werkzeug/branchschutz-pruefen.mjs` zeigt für `main` `GESCHUETZT` (BETREIBER-BRANCHSCHUTZ §6
  Schritt 4).
- **Weiter nur wenn:** Zeile `main` zeigt `GESCHUETZT`. Ein Exit ≠ 0 ist nur zulässig, wenn er allein von den Zeilen
  `integration/release-v4` und `koordination/lease` kommt. Diese beiden dürfen später folgen; sie blockieren das
  Erstrelease nicht.
- **Rückweg:** Notausstieg BETREIBER-BRANCHSCHUTZ §7 (Ruleset auf `disabled`, ändert keine Daten).
- **Danach Claude:** führt `branchschutz-pruefen` aus. **offen:** Es gibt noch keine `CODEOWNERS`-Datei für
  `docs/acc45/releases/` und `deploy/FREIGEGEBENE-IMAGES.md` (RELEASE-PROZESS §5). Claude legt sie per PR an, wenn
  Sie das entscheiden.

### 5.3 Umgebung `produktion` mit Freigabeschutz (B-3)

- **Ziel / Gate:** F-7. Risiko R-GH-1: Ohne Umgebung legt GitHub sie beim ersten Lauf **ohne** Prüfer an.
- **Handlung:** GitHub → **Settings** → **Environments** → **New environment** → Name `produktion` →
  **Configure environment**:
  - **Required reviewers** an, Prüfer: Inhaber.
  - **Allow administrators to bypass configured protection rules**: aus.
  - **Prevent self-review**: **nicht** setzen, solange der Inhaber einziger Prüfer ist.
  - **Deployment branches and tags** → **Selected branches and tags** → Regel `main`.
  - **Save protection rules**.
  Variablen und Secrets **noch nicht** anlegen (erst 12.4).
  Quelle: Produktionsweg §2.2 B-3, [DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md) §3.
- **Erwartet:** Lesende Prüfung durch Claude:
  `gh api repos/rinats-png/dienstplaner/environments --jq '.environments[] | {name, protection_rules}'` zeigt
  `produktion` mit einer Regel `required_reviewers`. Repository-Variablen und -Secrets mit Namen `DEPLOY_*`: keine.
- **Weiter nur wenn:** Prüfer gesetzt, Branch-Regel `main`, keine `DEPLOY_*`-Werte auf Repository-Ebene.
- **Rückweg:** Umgebung löschen (enthält noch keine Werte).
- **Danach Claude:** führt die Abfrage aus und zusätzlich
  `gh api repos/rinats-png/dienstplaner/actions/variables --jq '.variables[].name'` und
  `gh api repos/rinats-png/dienstplaner/actions/secrets --jq '.secrets[].name'` (nur Namen).

### 5.4 Rückweg-Entscheidungen O-1 und O-2

- **Ziel / Gate:** G7 (Freigabedatei `rueckweg`), F-12.
- **Handlung:** Entscheiden und schriftlich festhalten (Produktionsweg §6):
  - **O-2: Weg der Auslieferung.** Diese Anleitung folgt dem Auftrag: Auslieferung **nur** über `workflow_dispatch` des
    Workflows „Auslieferung“ mit Umgebung `produktion` (O-2 b).
  - **O-1: Rolle von `274bfa0`.** Folge von O-2 b **[belegt]**: Der Forced Command lässt `--ohne-label` nicht zu
    (`deploy/deploy.sh:93`). `274bfa0` hat kein Revisionslabel. `bisher_startbar` scheitert deshalb
    (`deploy/deploy.sh:228-231`). Folge je Phase (Produktionsweg §3.3a):
    - Abbruch in den Schritten 1 bis 3b (Liste, Pull, Prüfung, Platz; `abbruch`, `deploy/deploy.sh:132-137`): nichts
      verändert, `274bfa0` läuft weiter.
    - Fehler nach dem Anhalten in Schritt 4 oder 5 (Sicherung, Platz, `.env`; `alt_wieder_starten`,
      `deploy/deploy.sh:297-311`): `274bfa0` wird **nicht** wieder gestartet → R0, Ausfall bis zur Reparatur (S-0). Das
      gilt auch, wenn `274bfa0` `vorherig` bleibt.
    - Fehler ab Schritt 6: R0 (S-1). S-5 (Notbetrieb auf `274bfa0`) ist praktisch ausgeschlossen.
  - Unter O-2 b ist deshalb nur **O-1 b** stimmig: `274bfa0` ist kein Neustart- und kein Rücksprungziel. O-1 a und c
    setzen einen Wechsel von Hand mit `--ohne-label` voraus (O-2 a). Abweichung vom Wortlaut von O-1 b („sofort
    gesperrt“): Die Zeile `274bfa0` bleibt bis nach dem Wechsel `vorherig`, weil die Basis der Endprüfung eine Zeile
    `aktiv` oder `vorherig` sein muss (RELEASE-PROZESS §4). `gesperrt` folgt in einem eigenen Listen-PR nach dem Go
    (16.3).
  - Alternative (nicht Weg dieser Anleitung): O-2 a, erster Wechsel von Hand mit
    `./deploy.sh <digest> --ohne-label --bei-fehler=r0` (Produktionsweg §3.7 Schritte 7 und 8), mit O-1 a. Dann
    startet `deploy.sh` `274bfa0` auch bei einem Fehler in Schritt 4 oder 5 wieder.
  - **O-3:** Zeitgrenzen 15 min / 60 min / 24 h bestätigen (Produktionsweg §3.6).
- **Erwartet:** Vermerk mit O-1 (b), O-2 (b), O-3, Datum, Name.
- **Weiter nur wenn:** Sie die Folge „Fehler nach dem Anhalten (Schritt 4/5) = Ausfall bis zur Reparatur“ bewusst
  annehmen. Sonst O-2 a mit O-1 a.
- **Rückweg:** Entscheidung vor 14 jederzeit änderbar.
- **Danach Claude:** übernimmt O-1/O-2 in den Entwurf der Freigabedatei (`rueckweg`, 9.3) und in den Listen-PR (9.2).

### 5.5 Annahmen für G2, G8, G9

- **Ziel / Gate:** G2, G8, G9. Stand Probelauf 2026-11-21: 217 PRs ohne prüfbaren Review-Beleg, 149 Commits ohne PR,
  14 unfertige P0/P1-Pakete, offene Befunde WP-14c, WP-07b, ABN-A2, ABN-S2 (RELEASE-PROBELAUF §2).
- **Handlung:** Entscheiden je Liste: bestätigen (`reviewBestaetigt`), mit Grund annehmen (`akzeptierteCommits` mit
  vollem Commit, `akzeptiertePakete`, `akzeptierteBefunde`) oder abschließen lassen. Kein Teil-Release
  (RELEASE-PROZESS §2).
- **Erwartet:** offen: braucht Ergebnis von 8.3 (Vorprüfung auf dem echten Kandidaten). Die Listen gelten nur für
  genau diesen Kandidaten.
- **Weiter nur wenn:** jede Zeile der Vorprüfung, die eine Annahme verlangt, hat eine Entscheidung mit Grund.
- **Rückweg:** Annahme streichen; dann bleibt das Gate NO-GO.
- **Danach Claude:** legt die Entwurfslisten mit Belegen vor (Quelle: Werkzeugausgabe, `REVIEW-NACHWEIS*.md`,
  `DIREKTMERGE-ABGLEICH-2026-11-13.md`). Claude erfindet keine Belege. Wo kein Beleg existiert, steht „Betreiber
  bestätigt“.

---

## 6. Sicherung außer Haus, Restore-Probe, Widerrufbuch-Probe (G6)

G6 verlangt drei Statusdateien: Sicherung jünger als 26 h (mit `snapshot_id`, `dateien` > 0), Restore-Probe und
Widerrufbuch-Probe jünger als 35 Tage, `ergebnis: ok`, `abweichend` und `fehlend` 0
(`werkzeug/release-pruefung.mjs`, `g6Sicherung`).

### 6.1 Speicherziel bestellen und absichern (B-7, P3-8)

- **Ziel / Gate:** G6, F-6.
- **Handlung:** [EINRICHTUNGSKETTE-IONOS.md](EINRICHTUNGSKETTE-IONOS.md) §5.4, Schritte S-1 bis S-7 (IONOS-Konsole
  DCD: Object Storage, Region eu-central-3 oder eu-central-4, zwei Buckets mit Object Lock Governance, zwei Nutzer,
  Policy, Lifecycle, Probe S-6 auf Test-Buckets). Entscheidungen P3-8 (a) bis (f) vorher.
- **Erwartet:** wie dort je Schritt. Probe S-6: Löschen einer Version verweigert, auch nach Ablauf der Retention.
- **Weiter nur wenn:** S-6 bestanden. Ohne S-6 kein Produktivbetrieb der Sicherung (EINRICHTUNGSKETTE §5.2).
- **Rückweg:** wie dort je Schritt (Buckets verfallen lassen, Schlüssel widerrufen).
- **Danach Claude:** keine Handlung am Speicherziel. Nachweistabelle nach Ihrer Meldung ergänzen.

### 6.2 Sicherung außer Haus einrichten und von Hand laufen lassen

- **Ziel / Gate:** G6 (`letzte-erfolgreiche.json`).
- **Handlung:** [BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md) §2.1 bis §2.9 auf dem VPS als `admin`, erst gegen das
  Test-Repository. `RESTIC_REPOSITORY` für Object Storage nach EINRICHTUNGSKETTE §5.5. `CENTRIC_PROD_IMAGE` = der
  **laufende** Digest (Befehl in BETRIEB-SICHERUNG §2.5). Probelauf §2.8:

  ```bash
  ~/centric-sicherung/sicherung-ausser-haus.sh && cat ~/sicherung/status.json
  ```

- **Erwartet:** Exit 0; `status.json` mit `"ergebnis":"ok"` und `snapshot_id`. Fehlalarm-Probe (§2.8) kommt an.
- **Weiter nur wenn:** `ergebnis` `ok`. **[angenommen]:** Das Werkzeug im Bild `274bfa0` sichert mit Ruhezeit (kein
  Schreibhalt-Kanal ohne `zustand/`). Der erste Handlauf belegt das.
  **Widerspruch zu Produktionsweg §3.7 Schritt 6:** Dort soll die zusätzliche Sicherung vor dem Wechsel (B-8) **nicht**
  unter laufendem `274bfa0` entstehen (kein Schreibhalt). Der tägliche Lauf hier sichert unter laufendem Dienst mit
  Ruhezeit (BETRIEB-SICHERUNG §5 „Konsistenz“). Für G6 genügt er; die Sicherung für den Wechsel selbst kommt aus 14.3.
- **Rückweg:** Cron-Zeilen auskommentieren (§2.9). Sicherungen bleiben im Bucket. Keine Löschung.
- **Danach Claude:** keine Handlung auf dem VPS.

### 6.3 Restore-Probe

- **Ziel / Gate:** G6 (`probe-status.json`).
- **Handlung:** BETRIEB-SICHERUNG §2.8:

  ```bash
  ~/centric-sicherung/wiederherstellung-probe.sh && cat ~/sicherung/probe-status.json
  ```

- **Erwartet:** `Manifest-Abgleich: N gleich, 0 abweichend, 0 fehlend, 0 überzählig`, `Bestände lesbar: X von X`;
  Statusdatei mit `"art":"wiederherstellungsprobe"`, `"ergebnis":"ok"`.
- **Weiter nur wenn:** `ergebnis` `ok`, `abweichend` 0, `fehlend` 0.
- **Rückweg:** keiner nötig. Die Probe ändert weder `data/` noch die laufende Anwendung (BETRIEB-SICHERUNG §1).
- **Danach Claude:** keine Handlung auf dem VPS.

### 6.4 Widerrufbuch-Sicherung und -Probe (BE-3)

- **Ziel / Gate:** G6 (`widerrufbuch-probe-status.json`, `"art":"widerrufbuch-probe"`).
- **Handlung:** BETRIEB-SICHERUNG §7, Einrichtung Schritte 1 bis 8, eigenes Repository, eigenes Passwort.
- **offen: braucht Ergebnis von 14.** Auf der Produktion mit `274bfa0` gibt es keine Widerrufbücher. Sie entstehen
  erst beim ersten Start des Kandidaten (W-4, W-5) **[angenommen, K4 belegt es]**. Vor dem ersten Wechsel kann der
  Nachweis nur aus der Probe K10 auf der Kopie kommen (6.5). Ob dieser Nachweis für G6 genügt, entscheiden Sie. Das
  Werkzeug prüft nur `art`, `ergebnis` und `zeit`, nicht die Herkunft.
- **Weiter nur wenn:** Ihre Entscheidung dazu liegt schriftlich vor.
- **Rückweg:** Cron-Zeile auskommentieren.
- **Danach Claude:** vermerkt die Entscheidung im Release-PR. Die Einrichtung auf der Produktion folgt in 16.2.

### 6.5 Probe K0–K11 auf einer Kopie (B-8, B-11)

- **Ziel / Gate:** F-5. K4 liefert den Migrationsbericht für G5 (10). K6/K7 zeigen, ob ein Notbetrieb zulässig ist.
- **Handlung:** Produktionsweg §4, Schritte K0 bis K11. Ort: isoliert, Docker Desktop des Betreibers (O3); keine
  Staging-VM bis Phase D (Betreiberentscheidung 2026-11-17). Daten: echte Kopie nur nach O-4 a mit Freigabe und
  Löschnachweis, sonst synthetisch. Bilder nur per Digest.
- **offen:** Für K0 bis K11 gibt es kein Skript. Fest belegte Befehle gibt es nur für K1
  (`ablage-sicherung.mjs pruefen --sicherung <kopie>`), K3 (`ablage-sicherung.mjs sichern`), K4
  (`deploy/deploy-abgleich.mjs`), K7 (`wiederherstellen --ersetzen --zustand <kopie>`) und K10
  (`sicherung-ausser-haus.sh`, `wiederherstellung-probe.sh`, `widerrufbuch-probe.sh`). Für K4 und K6 braucht es
  außerdem den Kandidaten-Digest: **offen: braucht Ergebnis von 8.2.**
- **Erwartet:** Spalte „Erwartung / Nachweis“ in Produktionsweg §4.
- **Weiter nur wenn:** K1 „In Ordnung“; keine Verbindung zur Produktion; kein Personendatenfund in Ausgaben außerhalb der
  Umgebung (Abbruchregeln §4).
- **Rückweg:** K11 (Kopie und Repositorys löschen, Löschvermerk). Die Produktion ist nie betroffen.
- **Danach Claude:** schreibt auf Wunsch eine ausführbare Probenanleitung mit Befehlen je K-Schritt (eigener PR,
  nachdem O-4 entschieden ist) und wertet den Bericht für G5 aus.

### 6.6 Nachweise ablegen

- **Ziel / Gate:** G6.
- **Handlung:** In der Remotekonsole die drei Dateien anzeigen (nur feste Felder, keine Geheimnisse):

  ```bash
  cat ~/sicherung/letzte-erfolgreiche.json ~/sicherung/probe-status.json ~/sicherung/widerrufbuch-probe-status.json
  ```

  Inhalt an Claude geben oder selbst unter `docs/acc45/releases/<id>/nachweise/` commiten
  (RELEASE-PROZESS §4 Phase 1). Die Werkzeugprüfung liest sie online aus dem Commit, nicht aus der Arbeitskopie.
- **Erwartet:** drei JSON-Objekte; `letzte-erfolgreiche.json` jünger als 26 h zum Zeitpunkt von 13.
- **Weiter nur wenn:** keine Personendaten, keine Adressen, keine Schlüssel in den Dateien.
- **Rückweg:** Datei im PR entfernen.
- **Danach Claude:** nimmt die Dateien in den Listen-PR (9.2) auf, wenn Sie das freigeben.

---

## 7. Kandidat auf `main` (B-9)

### 7.1 Release-Kandidat-Branch und PR

- **Ziel / Gate:** F-2, G1 (CI auf genau dem Kandidaten), G2.
- **Handlung (Claude):** Branch `release/rc-<JJJJ-MM-TT>` vom Kopf `integration/release-v4`, PR nach `main` (Muster
  #416). PR-Text: Integrationskopf (voller SHA), „kein Deployment, keine Migration, keine Schalter“. Volle CI auf dem
  exakten PR-Kopf abwarten.
- **Erwartet:** alle Pflicht-Checks `success` auf dem PR-Kopf.
- **Weiter nur wenn:** CI grün auf genau diesem Kopf; kein neuer Commit nach dem Lauf.
- **Rückweg:** PR schließen. `main` bleibt unverändert.
- **Danach Claude:** meldet PR-Nummer und vollen Kopf-SHA.

### 7.2 Merge mit Kopf-Pin (Betreiber)

- **Ziel / Gate:** Kandidat auf `main`.
- **Handlung (Betreiber):**

  ```bash
  gh pr merge <pr> --merge --match-head-commit <kopf-sha>
  ```

  (Muster aus BETREIBER-BRANCHSCHUTZ §4; `--match-head-commit` verweigert den Merge, wenn sich der Kopf geändert hat.)
- **Erwartet:** Merge-Commit auf `main`. Dieser Merge-Commit ist `<kandidat>`.
- **Weiter nur wenn:** `git rev-parse origin/main` = `<kandidat>` und die CI auf `main` für `<kandidat>` grün ist.
  Danach bis 8.1 **nichts** weiter nach `main` mergen (der Bildbau nimmt den jeweiligen Kopf von `main`).
- **Rückweg:** Revert-PR auf `main` (kein Force-Push). Es läuft noch nichts davon.
- **Danach Claude:** prüft lesend `gh api repos/rinats-png/dienstplaner/commits/<kandidat>/check-runs?filter=all`
  (G1) und meldet das Ergebnis.

---

## 8. Bildbau und Vorprüfung (G4)

### 8.1 Bildbau starten (P3-2)

- **Ziel / Gate:** F-3, G4. Ein Bild mit Label `org.opencontainers.image.revision` = `<kandidat>`.
- **Handlung (Betreiber):** GitHub → **Actions** → Workflow **Auslieferung** → **Run workflow** →
  „Use workflow from“: **Branch: main** → „Bild bauen …“ **an**, „Einen freigegebenen Digest … ausliefern?“ **aus**,
  übrige Felder leer bzw. Vorgabe → **Run workflow**. Gleichwertig:

  ```bash
  gh workflow run deploy.yml --ref main -f bauen=true -f ausliefern=false
  ```

  Eingaben laut `.github/workflows/deploy.yml:31-53`.
- **Erwartet:** Jobs `pruefung`, `sicherheit`, `bild` grün; Job `vps` übersprungen.
- **Weiter nur wenn:** `bild` grün und der Lauf lief auf `<kandidat>` (`head_sha` des Laufs).
- **Rückweg:** keiner nötig. Ein Bild in GHCR läuft nirgends. Bei Fehler: Ursache klären, neuer Kandidat (7.1).
- **Danach Claude:** prüft lesend `gh api repos/rinats-png/dienstplaner/actions/runs/<lauf> --jq '[.head_branch,.head_sha,.conclusion]'`.

### 8.2 Digest, Label, Provenienz bestimmen

- **Ziel / Gate:** G4.
- **Handlung (Claude):** Befehle aus Produktionsweg §1.3: anonymer Pull-Token, Digest des Kennzeichens `<kandidat>`
  (voller SHA), danach `docker buildx imagetools inspect ghcr.io/rinats-png/dienstplaner@<digest>` für Label und
  Provenienz. Bildangaben-Datei `--bild-info` nach RELEASE-PROZESS §4 („Bildangaben“).
- **Erwartet:** Label = `<kandidat>`; Provenienz `vcs.revision` = `<kandidat>`.
- **Weiter nur wenn:** beides gleich `<kandidat>`. **offen:** Die Bildangaben-Datei braucht lokal Docker mit buildx
  (kein Werkzeug dafür im Repository; Vorschlag REL-2, RELEASE-PROZESS Anhang A.2). Sie ist unsigniert
  (RELEASE-PROZESS §5, Grenzen).
- **Rückweg:** keiner nötig (nur lesen).
- **Danach Claude:** meldet `<digest>` mit Beleg.

### 8.3 Vorprüfung (Phase 0)

- **Ziel / Gate:** `vorpruefungOk: true` (G1, G2, G3, G5, G8, G9). Grundlage für 5.5 und 10.
- **Handlung (Claude):**

  ```bash
  node werkzeug/release-pruefung.mjs --kandidat <kandidat> --basis <basis> --digest <digest> --release-id <id> --bild-info <datei>
  ```

- **Erwartet:** JSON mit Ergebnis je Gate. Ohne Annahmen: G2, G5, G8, G9 NO-GO (wie im Probelauf).
- **Weiter nur wenn:** jeder NO-GO-Grund ist einer Entscheidung in 5.5 oder 10 zugeordnet. Ein NO-GO wird nicht
  übersteuert (RELEASE-PROZESS §6).
- **Rückweg:** keiner nötig.
- **Danach Claude:** legt das JSON in den Release-PR und die Entwurfslisten für 5.5 vor.

---

## 9. Vorlagen-Hashes, Listen-PR, Freigabedatei (G3, G10)

### 9.1 Vorlagen-Hashes erzeugen

- **Ziel / Gate:** G3 (Vorlagenbindung, RELEASE-PROZESS §5).
- **Handlung (Claude):**

  ```bash
  node werkzeug/release-pruefung.mjs --vorlagen-hashes --kandidat <kandidat> --basis <basis>
  ```

  Nur online (Git-Objekte). Nicht `--offline` unter Windows (CRLF, Hashes passen nie).
- **Erwartet:** je Vorlage SHA-256 und `geändert`/`unverändert`/`neu`/`entfernt`.
- **Weiter nur wenn:** Sie jede `geändert`- und `neu`-Zeile nach Review des Commits quittieren.
- **Rückweg:** keiner nötig.
- **Danach Claude:** übernimmt die Hashes in den Entwurf der Freigabedatei.

### 9.2 Listen-PR (B-6)

- **Ziel / Gate:** G4 (Zeile `aktiv` mit Kandidaten-Commit), G10, F-12.
- **Handlung (Claude):** PR nach `main`, nur `deploy/FREIGEGEBENE-IMAGES.md` und `docs/acc45/releases/<id>/nachweise/`:
  Kandidat `aktiv` (voller Digest, voller Commit, Abnahmebericht); `274bfa0` → `vorherig` (5.4); dazu der volle Digest
  von `0861adee…` (O-6, Produktionsweg §1.1 Befund 2). Merge durch Sie mit Kopf-Pin wie 7.2.
- **Erwartet:** CI „Betrieb: Deploy-Skripte“ grün (prüft die Liste mit, BEREITSTELLUNG §3.2).
- **Weiter nur wenn:** höchstens eine Zeile `aktiv` und höchstens eine `vorherig`; `<listen-commit>` notiert.
- **Rückweg:** Revert-PR. Die Liste auf dem VPS ist noch unverändert.
- **Danach Claude:** liefert die SHA-256-Werte der Betriebsdateien aus `<listen-commit>` für 12.1 (als PR-Kommentar,
  zweiter Kanal).

### 9.3 Freigabedatei

- **Ziel / Gate:** G10, dazu G3 (`vorlagenHashes`), G5 (`migration`), G7 (`rueckweg`), G2/G8/G9 (Annahmen).
- **Handlung (Betreiber):** Datei `docs/acc45/releases/<id>.freigabe.json` nach dem Schema in RELEASE-PROZESS §5
  (erster Abschnitt mit `vorlagenHashes`). Claude liefert den Entwurf. Commit durch Sie, PR nach `main`, Merge mit
  Kopf-Pin. Klickweg: GitHub → `main` → **Add file** → **Create new file** → Pfad eingeben → Inhalt →
  **Commit changes** → „Create a new branch … and start a pull request“.
- **Erwartet:** `basisCommit` = `<basis>`, `kandidatCommit` = `<kandidat>`, `digest` = `<digest>`,
  `umgebung` = `produktion`, `rueckweg.strategie` = `r0`.
- **Weiter nur wenn:** Seit `<kandidat>` ändert `main` nur `docs/acc45/releases/` und `deploy/FREIGEGEBENE-IMAGES.md`
  (G10).
- **Rückweg:** Revert-PR.
- **Danach Claude:** prüft Struktur lesend in der Endprüfung (13).

---

## 10. Migrationsfreigabe (G5)

- **Ziel / Gate:** G5. W-1 bis W-9 und der Startblock von `server.mjs` sind seit `274bfa0` geändert (Probelauf §2).
  Der erste Start schreibt in `data/` und `zustand/` (Produktionsweg §3.2).
- **Handlung (Betreiber):** Probebericht aus K4 (6.5) lesen. Bei Zustimmung in der Freigabedatei:
  `migration.freigegeben: true`, `basisCommit` = `<basis>`, `abgedeckt` = alle von G5 gemeldeten Einträge,
  `bericht` = Pfad zum Probebericht (RELEASE-PROZESS §5).
- **Erwartet:** offen: braucht Ergebnis von 6.5 (K4) und 8.3 (Liste der gemeldeten Einträge).
- **Weiter nur wenn:** K4 belegt, welche Dateien der erste Start ändert, und K6/K7 sind ausgewertet.
- **Rückweg:** Freigabe nicht erteilen. Dann bleibt G5 NO-GO und es gibt kein Release.
- **Danach Claude:** gleicht `abgedeckt` mit der Werkzeugausgabe ab.

## 11. Rückweg festlegen (G7)

- **Ziel / Gate:** G7.
- **Handlung (Betreiber):** In der Freigabedatei `rueckweg: { "strategie": "r0", "entscheidungO1": "b",
  "entscheidungO2": "b" }` (5.4). Entscheidungsbaum Produktionsweg §3.6 bestätigen (F-13).
- **Erwartet:** Endprüfung G7 GO mit Beleg „R0 als Fehlerstrategie“.
- **Weiter nur wenn:** `strategie` = `r0`. `ruecksprung` hat beim ersten Wechsel kein zulässiges Ziel (Produktionsweg §3.3).
  Achtung: Das Werkzeug prüft das nicht. G7 ist mit `274bfa0` als `vorherig` auch bei `strategie: ruecksprung` GO
  (OF-13). Prüfen Sie den Wert selbst.
- **Rückweg:** Datei per PR ändern.
- **Danach Claude:** keine weitere Handlung.

---

## 12. VPS vorbereiten

Alle Befehle in `/opt/apps/centric-dienstplanung` als Besitzer des Verzeichnisses (`admin`, uid 1000), ohne `sudo`.

### 12.1 Betriebsdateien des Listen-Commits auf den VPS

- **Ziel / Gate:** Produktionsweg §3.7 Schritt 3. Die Liste auf dem VPS kennt den Kandidaten.
- **Vorbedingung:** Zeigt V-3 noch `IMAGE_TAG`: zuerst BEREITSTELLUNG §3.3 (Migration der `.env`, eigene Freigabe).
  `deploy.sh` bricht sonst ab (`deploy/deploy.sh:161-163`).
- **Handlung:** Dateien eines festen Commits holen (Muster VPS-ZUGANG §3a; Unterordner wie BEREITSTELLUNG §3.3):

  ```bash
  cd /opt/apps/centric-dienstplanung
  mkdir -m 700 neu-<id>
  for f in compose.yml FREIGEGEBENE-IMAGES.md deploy.sh freigabe-lib.sh digest-pruefen.sh ruecksprung.sh abschalten.sh deploy-smoke.mjs deploy-abgleich.mjs; do
    curl -fsSL -o "neu-<id>/$f" "https://raw.githubusercontent.com/rinats-png/dienstplaner/<listen-commit>/deploy/$f"
  done
  sha256sum neu-<id>/*
  ```

- **Erwartet:** neun Prüfsummen, gleich den Werten von Claude aus 9.2 (zweiter Kanal).
- **Weiter nur wenn:** jede Prüfsumme stimmt Zeichen für Zeichen. Sonst Ordner `neu-<id>` nicht verwenden.
- **Dann** (Kopie der alten Dateien mit Zeitstempel daneben, Produktionsweg §3.7 Schritt 3):

  ```bash
  S=$(date -u +%Y%m%dT%H%M%SZ); echo "Zeitstempel: $S"
  for f in compose.yml FREIGEGEBENE-IMAGES.md deploy.sh freigabe-lib.sh digest-pruefen.sh ruecksprung.sh abschalten.sh deploy-smoke.mjs deploy-abgleich.mjs; do
    [ -e "$f" ] && cp -p "$f" "$f.vor-$S"
    cp "neu-<id>/$f" "$f"
  done
  chmod 750 deploy.sh freigabe-lib.sh digest-pruefen.sh ruecksprung.sh abschalten.sh
  ```

- **Rückweg:** je Datei `cp -p "<datei>.vor-<zeitstempel>" "<datei>"`. Den Zeitstempel notieren Sie aus der Ausgabe
  `Zeitstempel: …`; `$S` geht beim Schließen der Konsole verloren. Ohne Notiz: `ls -l *.vor-*` zeigt die Kopien. Der
  laufende Container ist davon nicht betroffen.
- **Danach Claude:** nichts. Claude hat keinen Zugriff.

### 12.2 `.env` ergänzen und `zustand/` anlegen

- **Ziel / Gate:** F-9, F-10.
- **Handlung:** Kopie zuerst: `cp -p .env .env.vor-$(date -u +%Y%m%dT%H%M%SZ)`. Dann die in V-6 fehlenden Schlüssel
  im Editor ergänzen, mindestens `CENTRIC_VERTRAUTE_PROXYS` (nur Caddys feste Adresse, docs/CADDY-UND-XFF.md §7).
  Mail/Push nach BEREITSTELLUNG Schritt 2. `CENTRIC_DATENSCHUTZLAUF` bewusst setzen, nicht `an` ohne Entscheidung
  (Produktionsweg §3.2 W-8). Falls V-5 „fehlt“: `install -d -m 700 -o 1000 -g 1000 zustand` (Produktionsweg §3.7
  Schritt 5).
- **offen: braucht Ergebnis von 4.2 (V-6).** Welche Schlüssel fehlen, zeigt nur die Inventur. Werte nie ins Repository.
- **Erwartet:** Prüfung nur der Namen (VPS-ZUGANG/Produktionsweg V-6):
  `grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env | tr -d '=' | sort`.
- **Weiter nur wenn:** alle Pflichtnamen vorhanden; `stat -c '%n %U:%G %u:%g %a' zustand` zeigt uid 1000 und `700`.
- **Rückweg:** `.env` aus der Kopie zurücklegen. `zustand/` (leer) darf bleiben.
- **Danach Claude:** keine Handlung.

### 12.3 Deploy-Schlüssel und Forced Command (B-5)

- **Ziel / Gate:** Voraussetzung für den Job `vps`.
- **Handlung:** [DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md) §2:
  - §2.3 Probe von Hand: `./deploy.sh <digest> --trocken`.
  - §2.4 Schlüssel am Arbeitsrechner, Ordner außerhalb des Repositorys:
    `ssh-keygen -t ed25519 -N '' -C deploy@github-actions -f deploy_ed25519`.
  - §2.5 Eine Zeile an `~admin/.ssh/authorized_keys` **anhängen** (Sicherung und `>>` wie VPS-ZUGANG §3d/§3e):
    `command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 AAAA… deploy@github-actions`.
  - §2.6 Host-Schlüssel: `ssh-keyscan -t ed25519 <host>`; Fingerabdruck gleich dem ED25519-Wert aus VPS-ZUGANG §1e.
  - Nach dem Eintragen als Secret (12.4) die private Datei am Arbeitsrechner löschen: `rm deploy_ed25519`. Sie liegt
    dann nur noch in der Umgebung `produktion`. Ersatz bei Verlust: neues Paar nach §2.4, Zeile tauschen.
- **Erwartet:** Trockenlauf zeigt `TROCKENLAUF — es wird nichts verändert.` und den Plan. In der Zeile `Bisher:` steht
  bei O-2 b `R0 (nicht startbar)` — das ist die Folge aus 5.4 **[belegt im Code, `deploy/deploy.sh:269`]**.
- **Weiter nur wenn:** Trockenlauf Exit 0; Fingerabdruck stimmt; alte Schlüsselzeilen unverändert.
- **Rückweg:** Zeile entfernen (Muster VPS-ZUGANG §6a mit `deploy@github-actions`).
- **Danach Claude:** keine Handlung.

### 12.4 Variablen und Secrets nur in der Umgebung

- **Ziel / Gate:** F-7.
- **Handlung:** GitHub → **Settings** → **Environments** → `produktion` → **Environment variables** →
  **Add environment variable**: `DEPLOY_HOST`, `DEPLOY_USER`. **Environment secrets** → **Add environment secret**:
  `DEPLOY_SSH_KEY` (privater Schlüssel aus 12.3), `DEPLOY_KNOWN_HOSTS` (Zeile aus `ssh-keyscan`). Nie auf
  Repository-Ebene (DEPLOY-AUTOMATISIERUNG §3, Review N3).
- **Erwartet:** Claude liest nur Namen:
  `gh api repos/rinats-png/dienstplaner/environments/produktion/variables --jq '.variables[].name'` und
  `gh api repos/rinats-png/dienstplaner/environments/produktion/secrets --jq '.secrets[].name'`.
- **Weiter nur wenn:** vier Namen in der Umgebung; keine `DEPLOY_*`-Namen auf Repository-Ebene (5.3).
- **Rückweg:** Werte in der Umgebung löschen; Zeile aus 12.3 entfernen.
- **Danach Claude:** führt die Abfragen aus.

---

## 13. Endprüfung (Gate-Lauf, Phase 2b)

- **Ziel / Gate:** G1 bis G10 GO, Exit 0.
- **Handlung (Claude, auf einem Checkout von `main`):**

  ```bash
  node werkzeug/release-pruefung.mjs --kandidat <kandidat> --basis <basis> --digest <digest> --release-id <id> --bild-info <datei> --nachweise docs/acc45/releases/<id>/nachweise
  ```

- **Erwartet:** `gesamt: GO`, Exit 0 (nur online, echte Uhr; RELEASE-PROZESS §6).
- **Weiter nur wenn:** Exit 0. Sicherung (`letzte-erfolgreiche.json`) zu diesem Zeitpunkt jünger als 26 h. Bildangaben
  höchstens 7 Tage alt.
- **Rückweg:** keiner nötig. Bei NO-GO: Ursache beheben, Phase neu (RELEASE-PROZESS §4: neuer Kandidat, wenn eine Phase
  abbricht).
- **Danach Claude:** legt das JSON in den Release-PR und meldet GO oder NO-GO mit Gründen.

---

## 14. Auslieferung (nur `workflow_dispatch` und Umgebung `produktion`)

**Vorbedingung:** 13 mit Exit 0; Probe K0–K11 bestanden (F-5); Freigabe-Checkliste Produktionsweg §5 (F-1 bis F-14)
vollständig; Wartungsfenster angekündigt; ausdrückliche Produktionsfreigabe (F-14). Zwei Punkte der Checkliste haben
hier keinen eigenen Schritt:

- **F-4 Staging-Abnahme per Digest:** Eine Staging-VM gibt es bis Phase D nicht (Betreiberentscheidung 2026-11-17).
  Sie entscheiden schriftlich, ob F-4 entfällt, durch K0–K11 ersetzt wird oder das Release bis Phase D wartet (OF-10).
- **F-11 Zweiter Faktor des Betreibers:** Voraussetzung für G-d (15). Authenticator und Ablage der
  Wiederherstellungscodes vorher bereitlegen (wp32d-nachweis.md). Ohne das kein Go (OF-11).

### 14.0 Am Wechseltag: Inventur erneut

- **Ziel / Gate:** Produktionsweg §3.7 Schritt 2. Stand des Tages.
- **Handlung:** Inventur wie 4.2 (VPS-ZUGANG §4b), Ergebnis protokollieren.
- **Erwartet:** laufendes Bild = `274bfa0`; `.env` mit `IMAGE_DIGEST`, ohne `IMAGE_TAG`; `zustand/` uid 1000,
  Modus 700; Platz für 2 × Daten. Vergleichsmaßstab ist der Stand nach Abschnitt 12, nicht 4.2: V-4 (Betriebsdateien
  und Prüfsummen, neu aus 12.1) und V-6 (Schlüsselnamen der `.env`, ergänzt in 12.2) weichen von 4.2 erwartungsgemäß
  ab; ebenso V-3 nach einer `.env`-Migration (12.1 Vorbedingung), V-5 (`zustand/` aus 12.2) und V-8 (Forced Command
  aus 12.3).
- **Weiter nur wenn:** keine Abweichung gegen den Stand nach Abschnitt 12: V-1/V-2 wie in 4.2 (`274bfa0`), V-3 bis
  V-6 und V-8 wie nach 12.1 bis 12.3 (V-4: Prüfsummen gleich den Werten aus 12.1); V-7 zeigt die Sicherung außer
  Haus aus 6.2 (Abschnitt „letzte erfolgreiche Sicherung“: `zeit` jünger als 26 h, mit `snapshot_id`; G6); V-9 zeigt Platz für 2 × Daten und einen gesunden Dienst. Sonst STOPP.
- **Rückweg:** keiner nötig (nur lesen).
- **Danach Claude:** vergleicht gegen den Stand nach Abschnitt 12 (V-1/V-2 gegen 4.2) und meldet Abweichungen.

### 14.1 Trockenlauf über den Workflow

- **Ziel / Gate:** REL-3.
- **Handlung:** GitHub → **Actions** → **Auslieferung** → **Run workflow** → **Branch: main** → „Bild bauen“ **aus**,
  „ausliefern“ **an**, `digest` = `<digest>`, `bei_fehler` = `r0`, „Nur Trockenlauf“ **an** → **Run workflow**.
  Gleichwertig:

  ```bash
  gh workflow run deploy.yml --ref main -f bauen=false -f ausliefern=true -f digest=<digest> -f bei_fehler=r0 -f trocken=true
  ```

  Nach `pruefung` und `sicherheit` wartet Job `vps`: Lauf öffnen → **Review deployments** → `produktion` anhaken →
  **Approve and deploy**.
- **Erwartet:** Log von `vps`: `Befehl: deploy <digest> --trocken --bei-fehler=r0`, danach `TROCKENLAUF` und der Plan.
- **Weiter nur wenn:** Job grün; Plan zeigt Ziel = `<digest>`, Status `aktiv`, Commit = `<kandidat>`.
- **Rückweg:** keiner nötig (der Trockenlauf ändert nichts, `deploy/deploy.sh:49-53`).
- **Danach Claude:** liest den Lauf (`gh run view <lauf> --log`) und bestätigt den Plan.

### 14.2 Auslieferung

- **Handlung:** wie 14.1, aber „Nur Trockenlauf“ **aus**:

  ```bash
  gh workflow run deploy.yml --ref main -f bauen=false -f ausliefern=true -f digest=<digest> -f bei_fehler=r0 -f trocken=false
  ```

  Freigabe in der Umgebung wie 14.1. Uhrzeit des Starts als **T0** notieren.
- **Erwartet:** `deploy.sh` Schritte 1 bis 11 (DEPLOY-AUTOMATISIERUNG §1). Letzte Zeilen:
  `Ausgeliefert: centric-dp-web läuft healthy auf <digest> (Commit <kandidat>).` Rückgabe 0.
- **Weiter nur wenn:** Rückgabe 0. Andere Rückgaben (`deploy/deploy.sh:63-66`):

  | Rückgabe | Bedeutung | Handlung |
  |---|---|---|
  | 1 | fehlgeschlagen, R0 erreicht | 16.1 |
  | 2 | Aufruf fehlerhaft; abgebrochen, nichts verändert, `274bfa0` läuft weiter | **nicht abschalten**; Eingaben prüfen |
  | 3 | Digest gesperrt; abgebrochen, nichts verändert, `274bfa0` läuft weiter | **nicht abschalten**; Liste prüfen |
  | 4 | nicht freigegeben, Konfiguration oder Vorprüfung; abgebrochen, nichts verändert, `274bfa0` läuft weiter | **nicht abschalten**; Meldung lesen (Liste, `.env`, Platz) |
  | 5 | Bild nicht zu beschaffen; abgebrochen, nichts verändert, `274bfa0` läuft weiter | **nicht abschalten**; GHCR prüfen |
  | 7 | Docker antwortet nicht; abgebrochen, nichts verändert | **nicht abschalten**; Zustand mit `docker compose ps` prüfen |
  | 8 | fehlgeschlagen **und** R0 nicht sicher erreicht | sofort in der Remotekonsole `./abschalten.sh` (Produktionsweg §3.4 S-1) |
  | SSH-Exit 255 oder anderer Verbindungsabbruch im Schritt „deploy.sh auf dem VPS“ | Zustand unbekannt: `deploy.sh` kann gelaufen sein, ganz oder teilweise | Remotekonsole: `pgrep -af deploy.sh` (läuft er noch: Ende abwarten), `docker compose ps`, `tail -n 20 betrieb-protokoll.log`; **nicht blind abschalten, nichts neu starten**; Zuordnung nach der letzten Protokollzeile, Regeln unter der Tabelle |

  **Zuordnung bei Verbindungsabbruch.** Jede Zeile hat die Form `<UTC-Zeit> <Skript> <Text>`
  (`deploy/freigabe-lib.sh`, `protokoll()`). Es zählt nur die letzte Zeile mit Zeit ab T0. Die Regeln in dieser
  Reihenfolge prüfen; die erste passende gilt:

  1. Die Zeile endet auf `R0 NICHT sicher erreicht` (`deploy.sh`, Funktion `r0()`; auch
     `abgebrochen vor wechsel, …, R0 NICHT sicher erreicht`) **oder** sie lautet `abschalten.sh R0 FEHLGESCHLAGEN: …`
     → wie Rückgabe 8: sofort `./abschalten.sh` in der Remotekonsole, Claude informieren, weiter nach 16.1.
  2. Die Zeile stammt von `deploy.sh` und endet auf `, R0 erreicht` (`fehlgeschlagen, R0 erreicht` oder
     `abgebrochen vor wechsel, …, R0 erreicht`) → wie Rückgabe 1: 16.1.
  3. `deploy.sh geschuetzt sicherung=…` (im Normalfall die letzte Zeile eines erfolgreichen Laufs) oder
     `deploy.sh erfolgreich digest=…` → weiter mit 15.
  4. `deploy.sh abgebrochen digest=…` (Abbruch vor jedem Eingriff, Funktion `abbruch()`) → wie Rückgabe 2–5:
     **nicht abschalten**; mit `docker compose ps` bestätigen, dass `274bfa0` läuft.
  5. Jede andere letzte Zeile → Zustand mit Claude bestimmen (Produktionsweg §3.4); **nicht blind abschalten,
     nichts neu starten**. Dazu gehören: von `deploy.sh` die Zwischenzeilen `start …`, `gesichert …`, `env …`,
     `sicherung entfernt …`, `aufbewahrung uebersprungen …`, `abgleich warnung …`, außerdem
     `abgebrochen vor wechsel digest=…` (der alte Stand wurde neu gestartet, oder der Lauf brach dort ab),
     `fehlgeschlagen digest=…`, `ruecksprung verweigert …`, `fehlgeschlagen, ruecksprung erfolgreich …`; von
     `abschalten.sh` `R0 start …` und `R0 erreicht: …`; jede Zeile von `ruecksprung.sh`; keine Zeile ab T0.

  Scheitert schon der Schritt „Eingaben prüfen“ oder „SSH-Zugang“ im Job `vps` (also vor dem Schritt „deploy.sh auf
  dem VPS“), lief auf dem VPS nichts. Für einen Abbruch im Schritt „deploy.sh auf dem VPS“ selbst gilt das nicht.
- **Rückweg:** Produktionsweg §3.4 und §3.6; Kurzfassung in 16.1.
- **Danach Claude:** liest den Lauf, prüft lesend den Digest in GHCR und meldet PRODUKTIV erst nach 15.

### 14.3 Sicherung des Wechsels außer Haus

- **Ziel / Gate:** Produktionsweg §3.7 Schritt 6 (B-8). Die Sicherung, die `deploy.sh` in Schritt 4 bei angehaltenem
  Dienst angelegt und geprüft hat (`deploy-sicherungen/centric-sicherung-<UTC>`, Name in der Ausgabe und in
  `betrieb-protokoll.log`), liegt nur auf demselben Host.
- **Handlung:** offen. Im Repository gibt es keinen Befehl, der diesen Ordner außer Haus kopiert
  (`sicherung-ausser-haus.sh` sichert die laufende Ablage, nicht `deploy-sicherungen/`). Claude schlägt einen Befehl in
  einem eigenen PR vor (OF-12). Bis dahin: Ordner nicht löschen; `deploy.sh` schützt ihn über
  `deploy-sicherungen/.letzte-erfolgreiche`.
- **Weiter nur wenn:** Ordner vollständig: `ls deploy-sicherungen/<name>/FERTIG` findet die Datei.
- **Rückweg:** keiner nötig.
- **Danach Claude:** liefert den Befehlsvorschlag zur Freigabe.

---

## 15. Live-Smoke und Go-Kriterien (Phase 4 und 5)

- **Ziel / Gate:** REL-4. Go innerhalb von 60 min nach T0 (Produktionsweg §3.6 Phase 2).
- **Handlung:** Befehle aus BEREITSTELLUNG Schritt 3 („Danach prüfen“), auf dem VPS:

  ```bash
  docker inspect centric-dp-web --format '{{.State.Health.Status}} {{.Image}}'
  docker image inspect --format '{{.Id}}' ghcr.io/rinats-png/dienstplaner@<digest>
  curl -sS https://app.centric-dienstplanung.de/gesund
  curl -sS -o /dev/null -w '%{http_code}\n' https://app.centric-dienstplanung.de/
  docker logs centric-dp-web --since <T0>
  ```

  Dann die Go-Kriterien G-a bis G-f (Produktionsweg §3.6):
  - G-a: Startprotokoll enthält `Widerrufbuch: …` und `Konto-Widerrufbuch: …` ohne `WARNUNG` (Texte aus `server.mjs`).
  - G-b: In der Zeile `Konto-Widerrufbuch: …` steht vor „in der Ablage zurückgesetzt“ die Zahl 0 und vor „nach
    Rücksprung gesperrt“ die Zahl 0. Es gibt keine Zeile `WARNUNG Konto-Widerrufbuch`. (Die Startzeile nennt beide
    Zahlen immer, auch bei 0: `server.mjs:462-466`.)
  - G-c: `/gesund` ok (Sicherungsalter darf warnen, solange 6.4 offen ist).
  - G-d: Betreiber meldet sich mit zweitem Faktor an.
  - G-e: eine Test-Leitung je Pilotform meldet sich an und öffnet den Plan; nichts Echtes speichern.
  - G-f: Bild-ID = Ziel-Digest (erste zwei Befehle oben); Revisionslabel = `<kandidat>`:
    `docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' ghcr.io/rinats-png/dienstplaner@<digest>`.
- **Erwartet:** `healthy`, gleiche Bild-ID, `{"status":"ok"}`, `200`, alle G-a…G-f ja.
- **Weiter nur wenn:** alle ja → Go, Nutzer informieren, Uhrzeit notieren. **Direkt nach dem Go:** Listen-PR
  `274bfa0` → `gesperrt` (16.3; Claude öffnet ihn sofort, Sie mergen mit Kopf-Pin und kopieren die Liste wie 12.1).
- **Rückweg:** Entscheidungsbaum Produktionsweg §3.6 Phase 2: Datenschutz-/Sicherheitsbefund → sofort R0 (S-3);
  sonst R0 (S-1). Warnung zu `zustand/` in 15 min behebbar → beheben, neu prüfen.
- **Danach Claude:** setzt Status PRODUKTIV nur mit Digest, Lauf und Ihrem Go-Vermerk; legt den Abnahmevermerk unter
  `docs/acc45/releases/<id>/` an.

---

## 16. Rückweg und Abschluss

### 16.1 Im Fehlerfall: R0, dann Vorwärts-Reparatur

- **Ziel / Gate:** sicherer Zustand ohne Datenverlust.
- **Handlung (Betreiber, Remotekonsole):** R0 nach BEREITSTELLUNG §3.1:

  ```bash
  ./abschalten.sh --trocken
  ./abschalten.sh
  ```

  Danach Szenario nach Produktionsweg §3.4 bestimmen (S-0 bis S-6). Regelweg: Vorwärts-Reparatur (§3.5): Fix-PR,
  Review, CI, neues Bild, Listen-PR (schadhaftes Bild → `gesperrt`), neue Auslieferung.
- **Verboten:** `ruecksprung.sh` auf `274bfa0`; `.env.vor-deploy-*` allein zurücklegen (startet `274bfa0` auf
  veränderten Daten, Produktionsweg §3.1); `zustand/` zurückkopieren oder löschen; Datenrücksprung wegen eines
  fachlichen Fehlers.
- **Datenrücksprung** nur bei Datenschaden (S-4) oder Vorfall (S-3): [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md),
  Werkzeug **der neuen Fassung** mit `--zustand`, Checkliste ENTSCHEIDUNG-BE1-BE3 §4.4, neue Schlüsselepoche
  (Produktionsweg §3.3b). Vier-Augen-Vermerk.
- **Erwartet:** `abschalten.sh` meldet den Container angehalten; Daten und `.env` unberührt.
- **Weiter nur wenn:** Szenario bestimmt und schriftlich festgehalten.
- **Danach Claude:** grenzt den Fehler ein, schreibt den Fix-PR, beginnt den Ablauf bei 7 mit neuem Kandidaten.

### 16.2 Nach dem Go: Sicherung nachziehen

- **Handlung:** `CENTRIC_PROD_IMAGE` in `~/.config/centric-sicherung/env` auf `<digest>` (BETRIEB-SICHERUNG §2.5, §5
  „Bild-Digest“). Widerrufbuch-Sicherung auf der Produktion einrichten (BETRIEB-SICHERUNG §7 Schritte 1–8), jetzt mit
  echten Büchern.
- **Erwartet:** nächster Lauf `ergebnis` `ok`; `widerrufbuch-status.json` `"ergebnis":"ok"`.
- **Rückweg:** Wert zurücksetzen; Cron-Zeile auskommentieren.
- **Danach Claude:** vermerkt den Stand.

### 16.3 Abschluss nach T0+24 h

- **Handlung:** Kein Rollback-Trigger in Phase 3 (Produktionsweg §3.6). Listen-PR (Claude): `274bfa0` →
  `gesperrt` („überholt, ohne zweiten Faktor“; O-1 b). **Schritt direkt nach dem Go (15):** Claude öffnet den PR
  sofort nach Ihrem Go-Vermerk; ein Rücksprung auf `274bfa0` ist ohnehin verboten (16.1). Spätestens hier muss er
  gemergt sein. Merge mit Kopf-Pin, Datei wie 12.1 auf den VPS kopieren.
- **Erwartet:** Liste ohne Zeile `vorherig` auf `274bfa0`.
- **Weiter nur wenn:** Sicherung außer Haus läuft (sonst kein Go für den nächsten Wechsel, §3.6).
- **Danach Claude:** zieht `main` per PR nach `integration/release-v4` nach, setzt REL-3/REL-4 im SSOT mit Belegen.

---

## 17. Offene Punkte dieser Anleitung

| Nr | Offen | Braucht |
|---|---|---|
| OF-1 | Fehlende `.env`-Schlüssel, `IMAGE_TAG`/`IMAGE_DIGEST`, `zustand/` | Ergebnis 4.2 |
| OF-2 | Annahmelisten G2/G8/G9 | Ergebnis 8.3 |
| OF-3 | Widerrufbuch-Nachweis vor dem ersten Wechsel (nur aus K10) | Ihre Entscheidung (6.4) |
| OF-4 | K0–K11 ohne Skript; K4/K6 brauchen den Kandidaten-Digest | O-4, Ergebnis 8.2 |
| OF-5 | Bildangaben-Datei braucht lokal Docker buildx; unsigniert | REL-2 (Gate-Job) |
| OF-6 | `CODEOWNERS` für `docs/acc45/releases/` und die Liste fehlt | Ihre Entscheidung (5.2) |
| OF-7 | Mit O-2 b: Fehler nach dem Anhalten (Schritt 4/5) = Ausfall (kein Neustart von `274bfa0`); Abbrüche in 1–3b lassen `274bfa0` laufen | Ihre Annahme (5.4) |
| OF-8 | `BEREITSTELLUNG.md` §3.1 „Daten von Bildwechsel nie betroffen“ ist für diesen Wechsel falsch | O-7, eigener Doku-PR |
| OF-9 | erledigt (REL-1 Nachzug 2, Branch `acc45/release/rel-1-nachzug-2`): `RELEASE-PROZESS.md` enthielt §1–§6 dreifach (JS-`replace` mit dem Ersatzmuster `` $` `` in 8ac80cfa). Jetzt jede Überschrift einmal, G3-Zeile zusammenhängend, G1–G10 je einmal; Test in `pruefungen/release-pruefung.test.js` | — |
| OF-10 | F-4 Staging-Abnahme per Digest: keine Staging-VM bis Phase D | Ihre Entscheidung (14) |
| OF-11 | F-11 Zweiter Faktor des Betreibers vorbereitet (Voraussetzung G-d) | Ihre Handlung (14) |
| OF-12 | Kein Befehl, der `deploy-sicherungen/<name>` außer Haus kopiert (Produktionsweg §3.7 Schritt 6) | Befehlsvorschlag Claude, Ihre Freigabe (14.3) |
| OF-13 | Werkzeuglücke: G7 akzeptiert `274bfa0` als `vorherig` auch bei `strategie: ruecksprung`; nur diese Anleitung verlangt `r0`. **Weiterhin offen** (Stand REL-1 Nachzug 2): nicht Teil des Doku-Nachzugs | Ihre Entscheidung, danach eigener Werkzeug-PR |

## 18. Quellen

[PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md),
[VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md), [RELEASE-PROZESS.md](RELEASE-PROZESS.md),
[RELEASE-LUECKENANALYSE-2026-11-20.md](RELEASE-LUECKENANALYSE-2026-11-20.md),
[BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md), [EINRICHTUNGSKETTE-IONOS.md](EINRICHTUNGSKETTE-IONOS.md),
[DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md), [BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md),
[PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md), [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md),
[ENTSCHEIDUNGSLISTE.md](ENTSCHEIDUNGSLISTE.md) (P3-2, P3-3, P3-8),
[`BEREITSTELLUNG.md`](../../BEREITSTELLUNG.md) Schritt 3,
[`deploy/FREIGEGEBENE-IMAGES.md`](../../deploy/FREIGEGEBENE-IMAGES.md), [`deploy/deploy.sh`](../../deploy/deploy.sh),
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml), `werkzeug/release-pruefung.mjs`,
[RELEASE-PROBELAUF-2026-11-21.md](RELEASE-PROBELAUF-2026-11-21.md) (mit #437 gemergt).
