# Abweichung Produktionsbild gegen Freigabeliste (nur Gegenüberstellung)

Stand: 2026-11-14. Reine Dokumentation. Es wurde **nichts gegen die Produktion ausgeführt**, kein Bild geändert,
keine Freigabeliste angepasst. Das tatsächlich laufende Produktionsbild ist **nicht belegt**; dieses Dokument stellt die
widersprüchlichen Aussagen der Quellen gegenüber und gibt dem Betreiber lesende Prüfkommandos.

Betreiberentscheidung 2026-11-14 (C3): Abweichung darstellen, lesende Prüfkommandos bereitstellen, keine Bildänderung.

## 1. Kurzfassung

- Ein Teil der Quellen (Gedächtnis-/Betreiberstand, `docs/IST-STAND.md`, Matrix) sagt: Produktion läuft auf `64d08a4`
  (Digest-Präfix `f03a8514`, seit 2026-10-11).
- `deploy/FREIGEGEBENE-IMAGES.md` sagt: **`aktiv`** ist `274bfa0` (Digest-Präfix `0b192927`, 2026-11-02, H8+).
  `f03a8514…` ist dort **`gesperrt`** (Datenschutzlücke P0-0) und zusätzlich fest in `deploy/freigabe-lib.sh`
  gesperrt. Ein Eintrag `vorherig` existiert nicht (Rückweg heute R0, Dienst anhalten).
- Beide Aussagen können nicht zugleich zutreffen. Wenn die Produktion auf `f03a8514…` läuft, läuft ein **gesperrtes**
  Bild mit bekannter Datenschutzlücke. Wenn sie auf `0b192927…` läuft, fehlt in den Gedächtnis-/Matrixangaben ein
  Deployment vom 2026-11-02.
- `274bfa0` hat **keine 2FA** (weder `zweifaktor.mjs` noch `kontofaktor.mjs`) und kennt `ersetztDurch` nicht. Es darf
  nach Einführung der 2FA-Pflicht nicht still als Rücksprungziel dienen. Gesperrte oder nicht gelistete Bilder dürfen
  nie still als Rücksprungziel verwendet werden.

## 2. Gegenüberstellung mit Quellen

Kurzformen: Digest nur als Präfix (die vollen Werte stehen in `deploy/FREIGEGEBENE-IMAGES.md`).

| Nr | Aussage | Quelle (Datei:Zeile) | Folgerung |
|---|---|---|---|
| 1 | `274bfa0baca5…` ist **aktiv** (Digest `0b192927…`, 2026-11-02, Bericht `docs/H8-DEPLOY-REPORT.md`) | `deploy/FREIGEGEBENE-IMAGES.md:37` | Soll-Zustand laut Freigabeliste |
| 2 | `64d08a4957c5…` (Digest `f03a8514…`, 2026-10-11) ist **gesperrt**, Grund P0-0, „nie wieder Rücksprungziel“ | `deploy/FREIGEGEBENE-IMAGES.md:38` | Gesperrtes Bild |
| 3 | Digest-Präfix `0861adee…` (`1a56988d…`) gesperrt, lokales `latest` des VPS zeigt darauf | `deploy/FREIGEGEBENE-IMAGES.md:39` | Zweites gesperrtes Bild, nur Präfix belegt |
| 4 | Kein Eintrag `vorherig`; bei Fehlschlag gilt R0 (`deploy/abschalten.sh`) | `deploy/FREIGEGEBENE-IMAGES.md:41-43` | Kein zulässiges Rücksprungziel |
| 5 | `f03a8514…` und `0861adee…` fest in der Mindest-Sperrliste, unabhängig von der Datei | `deploy/freigabe-lib.sh:30`; `deploy/FREIGEGEBENE-IMAGES.md:31` | Auch bei fehlender Liste gesperrt |
| 6 | Produktivbild `f03a8514…` (`64d08a4`) hat P0-0 und ist gesperrt; Stand 2026-11-02: kein `vorherig` | `BEREITSTELLUNG.md:282-285` | Bestätigt Zeile 2 und 4 |
| 7 | Produktion läuft auf `64d08a4` (Bild `f03a8514…`), „laut Gedächtnis-/Betreiberstand“ | `docs/acc45/ABNAHME-V4-MATRIX.md:28` | **Widerspruch zu Zeile 1** |
| 8 | `origin/main` @ `64d08a4` als „Produktion, Container auf IONOS-VPS“ | `docs/IST-STAND.md:3`; `docs/ROADMAP.md:3` | Stand `main`, kein Beleg des laufenden Bilds; Stand vom 2026-10-11 |
| 9 | Produktion 2026-11-02, Digest `0b192927` (WP-01, Stufe `produktiv`) | `docs/acc45/work-packages.json:155` | Stützt Zeile 1; Bericht `docs/H8-DEPLOY-REPORT.md` liegt **nicht** im Repository (lokal) |
| 10 | Welches Bild wirklich läuft, ist vom Betreiber lesend zu bestätigen (F-1); `f03a8514…` nie Rücksprungziel | `docs/acc45/STAGING-PLAN-V4.md:72-75`, `:410`, `:603` | Frage offen |
| 11 | `274bfa0` hat keine 2FA; nach Einführung der 2FA-Pflicht als Rücksprungziel nicht mehr zulässig (oder nur mit schriftlicher Risikoannahme) | `docs/acc45/ENTSCHEIDUNG-BE1-BE3.md:44-46`, `:340-344` | Bedingung für einen späteren `vorherig`-Eintrag |
| 12 | `274bfa0` kennt `ersetztDurch` nicht; ein dadurch widerrufener Code wird angenommen (Probe: Produktion `274bfa0` 200/angenommen) | `docs/acc45/ABNAHME-V4-EM6-ROLLBACK-CODES.md:14`, `:120`; `docs/acc45/ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md:221-222`, `:355-360` | Rücksprung auf `274bfa0` würde widerrufene Codes wieder gültig machen |
| 13 | Compose startet **nur per Digest** (`IMAGE_DIGEST`, kein Tag, kein `latest`) | `deploy/compose.yml:27` | Das laufende Bild ist aus `.env` und Container lesbar |
| 14 | Einziges Rücksprungziel ist ein Eintrag `vorherig`; kein Rückfall auf `latest`, Tag oder gesperrtes Bild | `deploy/ruecksprung.sh:3-25` | Technische Absicherung vorhanden, solange die Skripte benutzt werden |

Hinweise zu den Quellen:
- Die Berichte `docs/H8-DEPLOY-REPORT.md` und `docs/P0-0-DATENSCHUTZBEFUND.md` stehen in der Freigabeliste als
  „Abnahmebericht“, liegen aber nicht im Repository (Quelle prüfen, möglicherweise nur lokal beim Betreiber).
- Das Gedächtnis des Koordinators nennt „Production am 2026-10-11 auf 64d08a4 (f03a8514) deployt“. Es ist kein
  Repository-Dokument und belegt nur, was berichtet wurde, nicht den heutigen Zustand.

## 3. Mögliche Zustände und Folgen

| Zustand | Bedeutung | Nötige Handlung des Betreibers (nicht von Claude) |
|---|---|---|
| A: Läuft `0b192927…` (`274bfa0`) | Freigabeliste stimmt; Gedächtnis-/Matrixangabe veraltet | Matrix, Staging-Plan, `WIEDERAUFNAHME.md` berichtigen; Rücksprung bleibt R0 |
| B: Läuft `f03a8514…` (`64d08a4`) | Ein gesperrtes Bild mit Datenschutzlücke P0-0 läuft | Sofort eigene Bewertung: Wechsel auf ein freigegebenes Bild oder Abschalten; dazu ist eine ausdrückliche Betreiberfreigabe nötig |
| C: Läuft ein anderer Digest | Weder gelistet noch dokumentiert | Digest und Revision feststellen, Liste aktualisieren (Verfahren in `deploy/FREIGEGEBENE-IMAGES.md`, „Ein neues Bild aufnehmen“), bis dahin als unbekannt behandeln |

Claude ändert weder das Bild noch die Liste noch die `.env`.

## 4. Lesende Prüfkommandos für den Betreiber

Alle Kommandos lesen nur. Ausführen auf dem Produktions-VPS im Verzeichnis neben `compose.yml`
(laut Freigabeliste `/opt/apps/centric-dienstplanung/`). Container-Name: `centric-dp-web` (laut `BEREITSTELLUNG.md`;
Name vor dem Lauf mit `docker compose ps` bestätigen). **Nicht** ausführen: `docker pull`, `docker compose up`,
`./ruecksprung.sh`, `./deploy.sh`, `docker rmi`, `docker tag`.

```bash
# 1. Laufende Container und die verwendete Bildreferenz (nur lesen)
docker compose ps
docker compose config --no-env-resolution | grep -E '^\s+image:'
docker compose config | grep -E '^\s+image:'     # mit aufgelöstem IMAGE_DIGEST aus .env

# 2. Welches Bild läuft wirklich (Bild-ID, Digest, Revision-Label)
docker inspect centric-dp-web --format '{{.Image}} {{.Config.Image}} {{.State.Health.Status}} {{.State.StartedAt}}'
docker image inspect --format '{{.Id}} {{json .RepoDigests}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$(docker inspect centric-dp-web --format '{{.Image}}')"

# 3. Alle lokal vorhandenen Bilder mit Digest (auch gesperrte, die nie benutzt werden dürfen)
docker images --digests --no-trunc ghcr.io/rinats-png/dienstplaner
docker image ls --digests --format '{{.Repository}} {{.Tag}} {{.Digest}} {{.ID}}' | grep -E 'sha256:(f03a8514|0861adee)' || echo "keine gesperrte Referenz"

# 4. Konfiguration lesen, ohne sie zu ändern (IMAGE_DIGEST; Zugangsdaten nicht ausgeben)
grep -E '^IMAGE_DIGEST=' .env

# 5. Freigabeliste auf dem VPS gegen die Kopie im Repository vergleichen
sha256sum FREIGEGEBENE-IMAGES.md
```

Auf dem Arbeitsrechner (Repository), ebenfalls nur lesend:

```bash
git rev-parse 274bfa0^{commit} 64d08a4^{commit}                 # volle Commit-Hashes
git log -1 --format='%H %cs %s' 274bfa0
git log -1 --format='%H %cs %s' 64d08a4
git show origin/integration/release-v4:deploy/FREIGEGEBENE-IMAGES.md | grep -nE '^\| `sha256'
git cat-file -e 274bfa0:server/lib/zweifaktor.mjs 2>&1 | head -1    # Fehler = 2FA-Datei fehlt in 274bfa0
git grep -c ersetztDurch 274bfa0 -- server || echo "ersetztDurch fehlt in 274bfa0"
```

Auswertung:
1. `docker inspect` zeigt die laufende Bild-ID, `docker image inspect` zeigt Digest und Revisionslabel.
2. Revision gleich `274bfa0baca5…` und Digest `sha256:0b192927…`: Zustand A.
3. Revision gleich `64d08a4957c5…` oder Digest `sha256:f03a8514…`: Zustand B. Betreiber entscheidet, nicht Claude.
4. Anderer Wert: Zustand C.
5. Ergebnis (Zustand, Datum, Name der prüfenden Person; keine Digests aus privaten Systemen, keine Zugangsdaten) in
   `docs/acc45/WIEDERAUFNAHME.md` und, falls nötig, in der Freigabeliste nachführen.

## 5. Regeln, die in jedem Fall gelten

- Ein gesperrtes oder nicht gelistetes Bild wird **nie** still als Rücksprungziel verwendet (`deploy/ruecksprung.sh`,
  `deploy/digest-pruefen.sh`, `deploy/freigabe-lib.sh`).
- Es gibt keinen Eintrag `vorherig`; bei einem fehlgeschlagenen Release gilt R0 (`deploy/abschalten.sh`).
- Ein späterer Eintrag `vorherig` braucht mindestens die Fähigkeiten der Merge-Basis (2FA, WR-2, `ersetztDurch`) oder
  eine schriftliche Risikoannahme des Betreibers (`ENTSCHEIDUNG-BE1-BE3.md` §4.1).
- Jede Änderung der Freigabeliste folgt dem Verfahren „Ein neues Bild aufnehmen“ in `deploy/FREIGEGEBENE-IMAGES.md`
  und braucht eine Betreiberfreigabe.
