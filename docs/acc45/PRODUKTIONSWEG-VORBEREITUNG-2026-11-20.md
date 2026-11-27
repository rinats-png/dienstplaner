# Produktionsweg — Vorbereitung (Stand 2026-11-20)

Betreiberauftrag: Deployment-Architektur prüfen, sicheren Produktionsweg vorbereiten. Reine Doku und Planung.

Basis: `origin/integration/release-v4` @ `e5e7b1d7`. `origin/main` @ `a5b49709`. Die beiden Stände sind
auseinandergelaufen: `main` trägt eigene Merge-Commits (#395, #416) und liegt 19 Commits hinter integration. Ein
Kandidat für die Produktion muss deshalb erst über die Gates R1–R3 nach `main` (B-9).

Revision 2 (Review #421, Auflagen A-1 bis A-6): neues Szenario S-0, Liste vor dem Wechsel, Probe ohne Zustellung,
Startverhalten W-6…W-8 berichtigt, Schlüsselepoche beim Datenrücksprung, `main` ungeschützt.

**Nicht getan:** kein Zugriff auf VPS oder Produktion, kein SSH, kein Deploy, kein Workflow-Start, keine Secrets,
Variablen oder Umgebungen angelegt, keine Migration, keine Datenänderung, keine Änderung an
`deploy/FREIGEGEBENE-IMAGES.md`. Gelesen: Repository, `gh api` (nur GET), GHCR-Registry anonym (nur Pull-Token, nur
Manifeste und Konfigurations-Blobs).

Dieses Dokument wiederholt vorhandene Doku nicht. Es verweist darauf und ergänzt nur, was neu belegt oder neu
zusammengeführt ist.

Kennzeichnung: **[belegt]** = mit Quelle oder Befehl in diesem Dokument nachprüfbar. **[nicht belegt]** = ohne
VPS-Zugang nicht feststellbar. **[angenommen]** = Schluss aus dem Code, auf einer Kopie zu prüfen.

---

## 1. Stand: belegt und nicht belegt

### 1.1 Bild (Image): was ohne VPS belegbar ist

Quelle der Registry-Daten: anonyme Abfrage von `ghcr.io/rinats-png/dienstplaner` am 2026-11-20 (Befehle in 1.3).
Das Paket ist öffentlich lesbar.

| Kennzeichen (Commit) | Index-Digest (Präfix) | Gebaut (UTC) | Lauf / Branch | OCI-Label `revision` | Provenienz (SLSA v1, `vcs.revision`) | Status in der Freigabeliste |
|---|---|---|---|---|---|---|
| `274bfa0` = Tag `latest` | `0b1929273a79…` | 2026-11-02 15:59 | 41476360204 / `main` | **fehlt** | `274bfa0baca5…` | `aktiv` |
| `64d08a4` | `f03a8514db6f…` | 2026-10-11 00:36 | 38098836621 / `main` | **fehlt** | `64d08a4957c5…` | `gesperrt` (P0-0) |
| `1a56988` | `0861adee32ca…` | 2026-09-15 02:01 | 34919567232 / `main` | **fehlt** | (nicht abgefragt) | `gesperrt` (nur Präfix) |
| `466f624` | `be3731d2a220…` | 2026-11-04 18:57 | 41891061652 / `rc-2026-11-04` | `466f624…` | — | nicht gelistet |
| `265d575` (jüngstes Bild) | `98556e64fb1e…` | 2026-11-05 09:24 | 42000936348 / `rc-2026-11-05` | `265d575…` | `265d575…` | nicht gelistet |

Befunde **[belegt]**:

1. **Kein Bild aus `integration/release-v4` und keines aus dem heutigen `main`.** Das jüngste Bild in GHCR ist
   `265d575` vom 2026-11-05. Für einen Produktionswechsel muss ein Kandidat erst gebaut werden.
2. **Der volle Digest des gesperrten `0861adee…` ist jetzt belegt:**
   `sha256:0861adee32ca593cee96fc80355db170cf3ef6e695a28489f4876240237410f1` (GHCR-Kennzeichen
   `1a56988d3c406aff99281f96c2d7da1dc24d7af7`, stimmt mit der Spalte „Commit“ der Liste). Die Liste führt nur das Präfix.
   Nachtrag des vollen Werts ist eine Listenänderung und braucht Betreiberfreigabe (Handlung B-6).
3. **Das `aktiv`-Bild `0b192927…` trägt kein Label `org.opencontainers.image.revision`.** Labels gibt es erst ab
   den rc-Bildern (WP-03). Folge: `digest-pruefen.sh` und `ruecksprung.sh` bestehen für dieses Bild nur mit
   `--ohne-label`. Der Forced Command von `deploy.sh --ssh` lässt `--ohne-label` nicht zu. Die Zuordnung Commit ↔
   Digest ist trotzdem belegt: über die SLSA-Provenienz (`vcs.revision = 274bfa0baca5…`) und das GHCR-Kennzeichen.
4. Tag `latest` in GHCR zeigt auf `0b192927…` (`274bfa0`). Das **lokale** `latest` auf dem VPS zeigte laut Liste auf
   `0861adee…` — das ist ein anderes Bild **[nicht belegt, VPS]**. Compose liest `latest` nicht mehr
   (`deploy/compose.yml`, Digest-Pflicht).
5. **Der Job `vps` in `deploy.yml` ist nie gelaufen.** In den vier abgefragten Bau-Läufen (alle in der Tabelle außer
   `1a56988`) ist er `skipped`; insgesamt hat `deploy.yml` 18 Läufe, alle per Hand gestartet. GitHub
   führt **keine** Deployments (`/deployments` leer). Jede bisherige Produktionsauslieferung lief also von Hand
   (`BEREITSTELLUNG.md` Schritt 3), ohne GitHub-Protokoll.

### 1.2 Bild: was nur auf dem VPS feststellbar ist

| Frage | Warum offen | Befehl (Abschnitt 2.1) |
|---|---|---|
| Welches Bild läuft (Bild-ID, Digest)? | Widerspruch Liste ↔ Gedächtnis/Matrix, siehe [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) | V-1, V-2 |
| Steht `IMAGE_DIGEST` oder noch `IMAGE_TAG` in der `.env`? | Migration `BEREITSTELLUNG.md` §3.3 nicht belegt | V-3 |
| Welche `compose.yml` und welche Skripte liegen auf dem VPS? | Kopien, kein Abgleich belegt | V-4 |
| Gibt es `zustand/` mit Eigentümer uid 1000? | nötig für das Kandidatenbild (Widerrufbücher, Schlüsselepoche) | V-5 |
| Welche Schlüssel stehen in der `.env`? | Kandidat braucht neue Variablen (u. a. `CENTRIC_VERTRAUTE_PROXYS`, Mail) | V-6 |
| Läuft eine Sicherung außer Haus? Gibt es lokale Sicherungen? | nie belegt (Abschnitt 1.4) | V-7 |
| Ist der Forced Command für `deploy.sh` eingetragen? | Voraussetzung für `deploy.yml`/`vps` | V-8 |
| Plattenplatz für `deploy.sh` (2 × Daten frei)? | Vorprüfung 3b in `deploy/deploy.sh` | V-9 |

### 1.3 Read-only-Befehle (Arbeitsrechner), mit denen 1.1 nachprüfbar ist

```bash
# GHCR anonym: Pull-Token, Kennzeichen, Digest eines Kennzeichens (nur lesen)
T=$(curl -s "https://ghcr.io/token?scope=repository:rinats-png/dienstplaner:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -s -H "Authorization: Bearer $T" https://ghcr.io/v2/rinats-png/dienstplaner/tags/list
curl -sI -H "Authorization: Bearer $T" -H "Accept: application/vnd.oci.image.index.v1+json" \
  https://ghcr.io/v2/rinats-png/dienstplaner/manifests/1a56988d3c406aff99281f96c2d7da1dc24d7af7 | grep -i docker-content-digest
# Mit Docker (gleichwertig): Labels und Provenienz
docker buildx imagetools inspect ghcr.io/rinats-png/dienstplaner@sha256:<digest> --format '{{json .Provenance}}'
# GitHub (nur GET)
gh api repos/rinats-png/dienstplaner/actions/runs/41476360204 --jq '[.head_branch,.head_sha,.conclusion]'
gh api "repos/rinats-png/dienstplaner/actions/runs/41476360204/jobs" --jq '.jobs[]|[.name,.conclusion]'
gh api repos/rinats-png/dienstplaner/deployments --jq length
```

### 1.4 Sicherung und Wiederherstellung

| Baustein | Vorhanden (Quelle) | Nachgewiesen | Auf dem VPS belegt |
|---|---|---|---|
| Sicherung der Ablage außer Haus (restic, täglich) | `deploy/sicherung/sicherung-ausser-haus.sh`, [BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md) §1–2 | CI `betrieb-sicherung.yml` mit echtem restic 0.18.1, echtem Bild, Wegwerf-Ablage ([wp04-nachweis.md](wp04-nachweis.md)) | **nein** — Speicherziel nicht gewählt (C-7 in [INFRA-VORBEREITUNG-STAGING-BACKUP.md](INFRA-VORBEREITUNG-STAGING-BACKUP.md) §8) |
| Monatliche Restore-Probe der Ablage | `deploy/sicherung/wiederherstellung-probe.sh`, [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md) §4 | CI (Ende-zu-Ende) | **nein** |
| Sicherung der Widerrufbücher (BE-3, stündlich, eigenes Repository) | `deploy/sicherung/widerrufbuch-sicherung.sh`, BETRIEB-SICHERUNG §7 | CI mit echtem restic (`widerrufbuch-ende-zu-ende.sh`), Stub-Tests `pruefung:be3-widerrufbuch-sicherung` | **nein** |
| Monatliche Probe der Widerrufbücher mit Rollback-Gegenprobe | `deploy/sicherung/widerrufbuch-probe.sh` | CI | **nein** |
| Sicherung vor jedem Wechsel (`deploy.sh` Schritt 4, `deploy-sicherungen/`) | `deploy/deploy.sh`, `deploy/deploy-abgleich.mjs` | `pruefungen/deploy-automatik.test.js` (Docker-Stub, echter Abgleich) | **nein** (`deploy.sh` nie auf dem VPS belegt) |
| Wiederherstellung mit `--zustand` (Bücher bleiben wirksam) | `werkzeug/ablage-sicherung.mjs`, `BEREITSTELLUNG.md` §5.4 | `pruefung:em6-rollback-codes`, Tests BE-1/BE-2 | **nein** |
| Rücksprung-Übung A→B→A | [STAGING-PLAN-V4.md](STAGING-PLAN-V4.md) §5, [ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.3 | Altbild-Proben mit `git archive` gegen echten `server.mjs` ([ABNAHME-V4-EM6-ROLLBACK-CODES.md](ABNAHME-V4-EM6-ROLLBACK-CODES.md) §5) | **nein**, auch nicht auf Staging |

Kurz: Die Werkzeuge sind gebaut und in CI belegt. **Kein einziger Restore auf echten Daten ist belegt.** Kein
produktives Speicherziel existiert. Ohne belegten Restore ist die Sicherung wertlos
(`BETREIBERAUFGABEN-RELEASE.md` §1: blockiert G1).

### 1.5 GitHub-Umgebung, Secrets, Variablen, Schlüssel

Abfrage am 2026-11-20 mit `gh api` (GET). Werte von Secrets sind über die API nie lesbar; gezählt wurden nur Namen.

| Gegenstand | Soll (Quelle) | Ist **[belegt]** | Betreiberhandlung |
|---|---|---|---|
| Umgebung `produktion` | vorhanden, Pflicht-Prüfer ≥ 1, Branches nur `main` ([DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md) §3) | **fehlt** (`/environments`: 0) | B-3 |
| Variable `DEPLOY_HOST` (Umgebung) | gelesen in `deploy.yml`, Job `vps`, `env: DEPLOY_HOST: ${{ vars.DEPLOY_HOST }}`; geprüft im Schritt „Eingaben prüfen“ | fehlt | B-3 |
| Variable `DEPLOY_USER` (Umgebung) | ebenda, `vars.DEPLOY_USER` | fehlt | B-3 |
| Secret `DEPLOY_SSH_KEY` (Umgebung) | `deploy.yml`, Schritt „SSH-Zugang“, `secrets.DEPLOY_SSH_KEY` | fehlt | B-3 |
| Secret `DEPLOY_KNOWN_HOSTS` (Umgebung) | ebenda, `secrets.DEPLOY_KNOWN_HOSTS` | fehlt | B-3 |
| Repository-Secrets | **keine** mit Deploy-Namen (Rückfallgefahr Review N3) | 0 | keine; so lassen |
| Repository-Variablen | optional `VITE_ANWENDUNG_URL`, `VITE_KONTAKT_MAIL` (Bau, `deploy.yml` mit Vorgabe), `STAGING_GATE_AKTIV` (`staging-gate.yml`) | 0 (Vorgaben greifen) | keine nötig |
| `GITHUB_TOKEN` | automatisch; `packages: write` nur Job `bild` | automatisch | — |
| Deploy-Key des Repositorys | Für den Weg `deploy.yml` nicht nötig (VPS zieht Bilder aus GHCR, nicht aus Git) | **ein** Schlüssel Schreib-Deploy-Key (Servername siehe Repository-Einstellungen), angelegt 2026-09-11, **`read_only: false`** (Schreibrecht) | B-4 |
| Forced Command auf dem VPS | `command="…/deploy.sh --ssh",restrict` in `authorized_keys` (DEPLOY-AUTOMATISIERUNG §2.5) | [nicht belegt] | V-8, B-5 |
| Branch-Schutz `main` | [BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md) | offene Betreiberaufgabe (dort) | dort |

Zwei Risiken aus dieser Tabelle:

- **R-GH-1 Umgebung fehlt.** Verweist ein Job auf eine nicht vorhandene Umgebung, legt GitHub sie beim Lauf an —
  **ohne** Pflicht-Prüfer. Heute scheitert der Job trotzdem, weil `DEPLOY_HOST` fehlt. Würde jemand die Werte auf
  Repository-Ebene hinterlegen, liefe die Auslieferung ohne Freigabe. Deshalb zuerst die Umgebung mit Prüfer anlegen,
  dann Werte nur dort.
- **R-GH-2 Deploy-Key mit Schreibrecht — dringend.** Das Repository ist öffentlich, `main` ist **ungeschützt**
  (`branches/main` → `protected: false`, 0 Rulesets; abgefragt 2026-11-20). Wer den privaten Schlüssel auf dem
  Produktionsserver besitzt, kann also **direkt auf `main` pushen**. Ein kompromittierter VPS wird so zum Angriff auf
  den Quelltext und auf jedes spätere Bild. Für den Betrieb reicht Lesen oder gar kein Git-Zugang. B-4 hat Vorrang vor
  allen anderen GitHub-Handlungen.

---

## 2. Betreiberhandlungen (nummeriert, konkret)

### 2.1 VPS: nur lesen (V-1 bis V-9)

**Wer:** Betreiber, per SSH auf dem Produktions-VPS, Verzeichnis `/opt/apps/centric-dienstplanung`.
**Nicht ausführen:** `docker pull`, `docker compose up`, `deploy.sh`, `ruecksprung.sh`, `abschalten.sh` ohne
`--trocken`, `docker rmi`, `docker tag`, `cat .env`.
V-1, V-2 und V-3 stehen ausführlich in [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §4 und werden hier nur
ergänzt.

```bash
cd /opt/apps/centric-dienstplanung

# V-1  Container, Status, Health, laufende Bild-ID
docker compose ps
docker inspect centric-dp-web --format '{{.Image}} {{.Config.Image}} {{.State.Status}} {{.State.Health.Status}} {{.State.StartedAt}} {{.RestartCount}}'

# V-2  Digest und Label des laufenden Bilds (Label fehlt bei 274bfa0 — das ist erwartet)
docker image inspect --format '{{.Id}} {{json .RepoDigests}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$(docker inspect centric-dp-web --format '{{.Image}}')"
docker images --digests --no-trunc ghcr.io/rinats-png/dienstplaner

# V-3  Bildreferenz in der Konfiguration (nur diese eine Zeile, keine Geheimnisse)
grep -E '^(IMAGE_DIGEST|IMAGE_TAG)=' .env
docker compose config | grep -E '^\s+image:'

# V-4  Welche Betriebsdateien liegen hier (Prüfsummen zum Abgleich mit dem Repository)
ls -la
sha256sum compose.yml FREIGEGEBENE-IMAGES.md ./*.sh ./*.mjs 2>/dev/null
docker compose version; docker version --format '{{.Server.Version}}'

# V-5  Zustandsverzeichnis (Widerrufbücher, Schlüsselepoche) — nur Existenz, Eigentümer, Rechte, Dateinamen
stat -c '%n %U:%G %u:%g %a' data zustand 2>&1
ls -la zustand 2>&1

# V-6  Nur die SCHLÜSSELNAMEN der .env, nie die Werte
grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env | tr -d '=' | sort

# V-7  Sicherungen: vorhanden? (keine Inhalte, keine Passwörter)
command -v restic && restic version
crontab -l 2>/dev/null | grep -vE '^\s*(#|$)' | grep -oE '[^ /]+\.sh' | sort -u
ls -la ~/sicherung ~/sicherung/lokal deploy-sicherungen 2>&1 | head -40
cat ~/sicherung/letzte-erfolgreiche.json 2>/dev/null

# V-8  Forced Command eingetragen? (nur die Optionen, nicht der Schlüssel)
#      Liegt der Deploy-Schlüssel bei einem anderen Konto als dem eigenen, dessen authorized_keys prüfen.
grep -c 'deploy.sh --ssh' ~/.ssh/authorized_keys
grep -oE '^command="[^"]*"[^ ]*' ~/.ssh/authorized_keys

# V-9  Platz, Größe der Daten, Gesundheit
#      Hinweis: /gesund schreibt eine kleine Probe nach data/.gesund — nicht streng nur lesend, aber ohne Fachdaten.
df -h . ; du -sh data
docker exec centric-dp-web node -e "fetch('http://127.0.0.1:3000/gesund').then(r=>r.text()).then(t=>console.log(t))"
tail -n 30 betrieb-protokoll.log 2>/dev/null
```

Abgleich am Arbeitsrechner (nur lesen):

```bash
git fetch origin
for f in compose.yml FREIGEGEBENE-IMAGES.md deploy.sh digest-pruefen.sh ruecksprung.sh abschalten.sh freigabe-lib.sh \
         deploy-smoke.mjs deploy-abgleich.mjs; do
  printf '%s  %s\n' "$(git show origin/integration/release-v4:deploy/$f | sha256sum | cut -c1-64)" "$f"
done
# Schlüsselnamen der Vorlage, gegen V-6 zu vergleichen
grep -oE '^#?\s*[A-Z_][A-Z0-9_]*=' .env.example | sed -E 's/^#?\s*//; s/=$//' | sort -u
```

**Ergebnis festhalten** (ohne Werte, ohne Digests aus privaten Systemen): Zustand A/B/C nach PROD-DIGEST-ABWEICHUNG §3,
Liste fehlender `.env`-Schlüssel, ob `zustand/` existiert, ob Sicherungen existieren, Datum, prüfende Person — in
[WIEDERAUFNAHME.md](WIEDERAUFNAHME.md).

### 2.2 GitHub und Liste (B-1 bis B-6)

| Nr | Wer | Was | Womit | Vorbedingung |
|---|---|---|---|---|
| B-1 | Betreiber | V-1 bis V-9 ausführen, Ergebnis melden | SSH, Abschnitt 2.1 | — |
| B-2 | Betreiber | Bei Zustand B (gesperrtes `f03a8514…` läuft): eigene Sofortentscheidung (R0 oder Wechsel) | [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §3 | B-1 |
| B-3 | Betreiber (Inhaber) | Umgebung `produktion` anlegen: Required reviewers = Inhaber, „Allow administrators to bypass“ **aus**, „Prevent self-review“ **nicht** setzen, solange der Inhaber einziger Prüfer ist (sonst kann niemand freigeben), Deployment branches = `main`; **danach** Variablen `DEPLOY_HOST`, `DEPLOY_USER` und Secrets `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` **nur in der Umgebung** | GitHub → Settings → Environments; [DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md) §3 | B-5 (Schlüssel erzeugt) |
| B-4 | Betreiber | **Dringend:** Schreib-Deploy-Key (Servername siehe Repository-Einstellungen) prüfen: wird er gebraucht? Wenn nein: entfernen. Wenn ja: als lesend neu anlegen, alten entfernen | GitHub → Settings → Deploy keys | — |
| B-5 | Betreiber | Eigenes Schlüsselpaar nur für Deploy, Forced-Command-Zeile, Host-Schlüssel festhalten | DEPLOY-AUTOMATISIERUNG §2.4–2.6 | `deploy.sh` des Kandidaten liegt auf dem VPS (3.7 Schritt 3; das setzt B-9 voraus). Nur nötig für O-2 b — der erste Wechsel von Hand braucht B-5 nicht |
| B-6 | Betreiber freigeben, Claude PR | Liste: vollen Digest für `0861adee…` nachtragen (1.1 Befund 2); Hinweis „`aktiv` ohne Label, nur `--ohne-label`“; Kandidatenzeile und Umstellung von `274bfa0` nach O-1 (3.3a) | PR auf `deploy/FREIGEGEBENE-IMAGES.md` | Freigabe; vor 3.7 Schritt 3 |

### 2.3 Sicherung (B-7, B-8)

| Nr | Wer | Was | Womit |
|---|---|---|---|
| B-7 | Betreiber | Speicherziele wählen und freigeben (zwei restic-Repositorys, getrennte Zugänge, Löschschutz), Aufbewahrung rechtlich entscheiden, Passwörter verwahren | INFRA-VORBEREITUNG §8 C-7, C-8, C-9, C-11 |
| B-8 | Betreiber | **Vor** dem Wechsel eine vollständige Sicherung von Hand ziehen und **auf einer Kopie** zurückspielen | Abschnitt 4 (Probe K1–K3) |

### 2.4 Kandidat und Staging (B-9 bis B-12)

| Nr | Wer | Was | Womit |
|---|---|---|---|
| B-9 | Claude (nach Merge-Freigabe); Bildbau löst der Betreiber aus | Kandidat nach `main` bringen (Gates R1–R3), Bildbau vorbereiten (Befehl für `deploy.yml`, nur `bauen`; der Betreiber startet ihn), danach Digest, Commit, Label und Provenienz prüfen. Quelle der strengeren Regel: `RELEASE-PROZESS.md` §3, `BETREIBER-ANLEITUNG-ERSTRELEASE.md`, `STAGING-PLAN-V4.md` V-2 | [RELEASE-GATES-R1-R2-R3.md](RELEASE-GATES-R1-R2-R3.md), `deploy.yml` Job `bild` |
| B-10 | Betreiber + Claude | Staging-Abnahme des Kandidaten per Digest auf isolierter Umgebung | [STAGING-O2-VORBEREITUNG.md](STAGING-O2-VORBEREITUNG.md), [STAGING-PLAN-V4.md](STAGING-PLAN-V4.md) §4–5 |
| B-11 | Betreiber | Restore-Probe auf Kopie nach Abschnitt 4 (inkl. Rücksprung- und Kompatibilitätsprobe) | Abschnitt 4 |
| B-12 | Betreiber | Offene Entscheidungen in Abschnitt 6 treffen | Abschnitt 6 |

---

## 3. Rücksprung-Konzept

### 3.1 Grundsatz

**R0 (Dienst anhalten) ist kein vollständiger Rücksprung.** R0 beendet nur den Zugriff. Was das neue Bild schon
geschrieben hat, bleibt liegen: in `data/`, in `zustand/`, in der `.env` (neuer `IMAGE_DIGEST`). Ein späterer Start —
egal mit welchem Bild — läuft auf diesem veränderten Stand.

Ein vollständiger Rücksprung braucht immer ein **zusammenpassendes Paar**: Bild **und** Daten **und** Zustand.

| Schicht | Ort | Wird bei einem Bildwechsel verändert? | Wie zurück |
|---|---|---|---|
| Bild | `.env` `IMAGE_DIGEST` | ja (`deploy.sh` Schritt 5) | `ruecksprung.sh` (nur auf `vorherig`). `.env.vor-deploy-<UTC>` allein zurücklegen startet `274bfa0` — das ist nur als Teil von S-5 zulässig, nie für sich |
| Ablage | `data/` | **ja, schon beim ersten Start** (3.2) | Sicherung aus `deploy.sh` Schritt 4 mit dem Werkzeug **der neuen Fassung** und `--zustand` |
| Zustand | `zustand/` (Widerrufbücher, Schlüsselepoche, Schreibhalt) | ja, wird neu angelegt | **nie** zurückrollen (das ist Absicht); nur vereinigen (`widerrufbuch-vereinen`) |
| Sitzungen | Store `centric-sitzungen` | ja (Betreibersitzungen ohne zweiten Faktor enden) | nicht gesichert; alle melden sich neu an |
| Betriebsdateien | `compose.yml`, Skripte, Liste | bei Aktualisierung | Kopie vor dem Austausch (`*.vor-<UTC>`) |

Hinweis: `BEREITSTELLUNG.md` §3.1 sagt „Die Daten unter `/data` sind von einem Bildwechsel nie betroffen.“ Für den
Wechsel `274bfa0` → Integrationsbild stimmt das nicht mehr (3.2). Korrektur dort ist offener Punkt O-7.

### 3.2 Was das Integrationsbild beim ersten Start von selbst schreibt

Quelle: `server.mjs` (Startblock nach der Ablagesperre), `server/lib/widerrufbuch.mjs`,
`server/lib/kontowiderrufbuch.mjs`, `server/lib/schluesselepoche.mjs`, `server/lib/datenschutzlauf.mjs`,
`server/lib/aufraeumen.mjs`. Zeitpunkt: W-1 bis W-5 laufen **vor** der ersten Anfrage. W-6 läuft beim Serverstart
(nach `listen`) und dann jede Minute. W-7 und W-8 laufen 60 s nach dem Start, dann täglich. W-9 geschieht bei jedem
Schreibvorgang.

| Nr | Was | Wohin | Wirkung auf ein Altbild (`274bfa0`) |
|---|---|---|---|
| W-1 | Ablagesperre `.prozess` (Puls alle 5 s) | `data/.prozess` | keine (Punktdatei) |
| W-2 | Schreibhalt-Kanal | `zustand/schreibhalt/` | keine |
| W-3 | **Betreibersitzungen ohne zweiten Faktor beenden** (WP-32d) | Sitzungsstore | Betreiber muss sich neu anmelden; in production nur mit eingerichtetem Faktor ([wp32d-nachweis.md](wp32d-nachweis.md)) |
| W-4 | **Widerrufbuch der Zugangscodes** anlegen, aus der Ablage einsammeln, in die Ablage nachziehen (`gesperrt`), Marken der Ersteinrichtung und Regime-Marken anlegen | `zustand/zugang-widerrufe.json`, Anker und Marken in `data/` | Altbild ignoriert Buch, Anker, Marken; wertet `gesperrt` aus → widerrufene Codes bleiben gesperrt ([ABNAHME-V4-EM6-ROLLBACK-CODES.md](ABNAHME-V4-EM6-ROLLBACK-CODES.md) §5) |
| W-5 | **Konto-Widerrufbuch** (BE-1/BE-2): einsammeln, nachziehen (Konto gesperrt, Lauf angehoben, Mitgliedschaft entzogen), Faktorpflicht, verbrauchte Wiederherstellungscodes, abgelöste Passwörter zurücksetzen | `zustand/konto-widerrufe.json`, Anker `kontowiderrufbuch:anker` und Felder in `data/` | Altbild ignoriert Buch und Anker; `passwort: null` wirkt fail-closed; 2FA fragt `274bfa0` **gar nicht** ab ([ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.1) |
| W-6 | Schlüsselepoche: Bindung erneuern, **nur wenn** schon Epoche oder Bindung existiert (`bindungErneuern({ nurWennVorhanden: true })`, `schluesselepoche.mjs:248`: „Nichts eingerichtet … return { erneuert: false }“) | `zustand/`, `skbindung` im Sitzungsstore | bei Daten aus `274bfa0` gibt es weder Epoche noch Bindung → nichts geschrieben **[belegt]** |
| W-7 | Löschlauf Testbetriebe (60 s nach Start, dann täglich; gab es schon in `274bfa0`): löscht abgelaufene Testräume, schreibt immer den Vermerk `aufraeumen:letzter` (`aufraeumen.mjs:271`) | `data/` | gelöschte Testräume nur per Sicherung zurück |
| W-8 | Datenschutzlauf (neu): schreibt **in jedem Modus**, auch `vorschau`, seinen Vermerk (`datenschutzlauf.mjs:253`). Nur das **Löschen** hängt an `CENTRIC_DATENSCHUTZLAUF=an` | `data/` | Vermerk ist für `274bfa0` unbekannt (ignoriert **[angenommen]**). V-6: Schalter darf nicht auf `an` stehen, bevor das bewusst entschieden ist |
| W-9 | Speicherkern WP-48.2: neue Standvermerke als SHA-256-Präfix statt Text (bei jedem Schreibvorgang, nicht beim Start) | `data/` | Neues Bild liest alte Vermerke. Ob `274bfa0` neue Vermerke als Konflikt wertet oder neu berechnet: **[nicht belegt]** — Probe K6 |

Folge für `deploy.sh`: Ein Rücksprung mit `--bei-fehler=ruecksprung` setzt voraus, dass das neue Bild noch nichts in
`data/` geschrieben hat (`neu_geschrieben`, Spur/Takt/Punktdateien ausgenommen). W-4/W-5 schreiben Anker in `data/`.
Ein automatischer Rücksprung nach dem ersten Start ist deshalb **wahrscheinlich immer verweigert** → R0
**[angenommen, K4 belegt es]**. Für den ersten Wechsel ist ohnehin `--bei-fehler=r0` vorgesehen (3.3a).

### 3.3 Warum es für den ersten Wechsel kein Bild-Rücksprungziel gibt

- `f03a8514…` und `0861adee…` sind gesperrt (Liste und fest in `deploy/freigabe-lib.sh`).
- `274bfa0` hat **keinen zweiten Faktor**, kennt `ersetztDurch` nicht und ignoriert die Widerrufbücher. Nach
  Einführung der 2FA-Pflicht ist es als `vorherig` nur mit schriftlicher Risikoannahme zulässig
  ([ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.1, [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §5).
- `274bfa0` hat kein Revisionslabel (1.1 Befund 3).

Deshalb gilt für den **ersten** Wechsel: Bildseitig nur R0 oder Vorwärts-Reparatur. Ab dem **zweiten** Wechsel kann
das erste Integrationsbild `vorherig` sein (es hat 2FA, Bücher, Label).

### 3.3a Die Zeile von `274bfa0` vor dem ersten Wechsel (Abbruch vor dem Wechsel)

Belegt im Code:

- `deploy.sh` startet bei einem Fehler **vor** dem Wechsel (Schritte 4/5: Anhalten, Sicherung, `.env`) den bisherigen
  Stand nur, wenn `bisher_startbar` gilt (`deploy/deploy.sh:228-231`, `:301-303`). Das ruft `digest-pruefen.sh` für
  den bisherigen Digest auf, mit denselben `pruef_args` wie für das Ziel.
- `digest-pruefen.sh` verlangt Status `aktiv` oder `vorherig` (`:72-81`) und ein Revisionslabel; fehlt es, besteht
  das Bild nur mit `--ohne-label` (`:110-118`, sonst Exit 6).
- Die Liste erlaubt höchstens eine Zeile `aktiv`. Einträge werden nie gelöscht, nur `gesperrt`.

Folge: Wird der Kandidat `aktiv`, kann `274bfa0` nur `vorherig` oder `gesperrt` werden. Ist es `gesperrt` oder fehlt
`--ohne-label`, endet jeder Fehler vor dem Wechsel in **R0 statt Weiterbetrieb auf `274bfa0`** (Szenario S-0). Ist es
dauerhaft `gesperrt`, ist auch S-5 ausgeschlossen.

| Option | Liste vor dem Wechsel | Aufruf | Wirkung | Bewertung |
|---|---|---|---|---|
| **a (Empfehlung)** | Kandidat `aktiv`; `274bfa0` `vorherig` **bis T0+24 h**, dann `gesperrt` (Grund: „überholt, ohne zweiten Faktor“) | erster Wechsel **von Hand**: `./deploy.sh sha256:<kandidat> --ohne-label --bei-fehler=r0` | Fehler vor dem Wechsel → `274bfa0` läuft weiter (kein Ausfall). Fehler nach dem Wechsel → R0, kein automatischer Rücksprung | `ruecksprung.sh` könnte `274bfa0` technisch erreichen — organisatorisch verboten bis O-1 b; Zeitfenster 24 h |
| b | Kandidat `aktiv`; `274bfa0` sofort `gesperrt` | `deploy.sh` ohne `--ohne-label` (auch über `deploy.yml` möglich) | jeder Fehler ab Schritt 4 → R0, Ausfall bis zur Reparatur; S-5 unmöglich | strengste Linie, nimmt Ausfall bewusst in Kauf |

`--ohne-label` lockert nur das **fehlende** Label. Der Kandidat hat ein Label; es wird weiter mit dem Commit der Liste
verglichen (`digest-pruefen.sh`, Zweig „abweichendes Label“). Der Forced Command (`deploy.yml`) lässt `--ohne-label`
nicht zu — Option a geht deshalb nur von Hand (O-2 a).

### 3.3b Schlüsselepoche bei jedem Datenrücksprung

Belegt im Code (`server/lib/schluesselepoche.mjs:251-262`): Passt die Bindung der Ablage (`skbindung`) nicht mehr zur
Epoche in `zustand/`, beginnt eine **neue Epoche**, und **alle früheren Sicherungsschlüssel (`sk:`) sind sofort
ungültig**. `skbindung` liegt nie in einer Sicherung. Ein Datenrücksprung führt deshalb immer zu einer neuen Epoche.

Das Werkzeug macht das ausdrücklich: `ablage-sicherung.mjs wiederherstellen … --zustand <Ordner>` erneuert die Epoche
**vor** dem Tausch der Daten (`werkzeug/ablage-sicherung.mjs:1224-1232`, Meldung „Schlüsselepoche erneuert: Kein
früherer Sicherungsschlüssel gilt mehr.“). Ohne `--zustand` erkennt der Server die Wiederherstellung beim ersten
Gebrauch eines Schlüssels selbst. Nach einer Verzeichniskopie: `ablage-sicherung.mjs schluessel-erneuern` (`:659-672`).

Folgehandlung nach S-4, S-5, S-6 und Probe K7: Sicherungsschlüssel der Betriebe neu ausgeben (eine Leitung legt sie
in der App neu an) und Betroffene informieren. Bei S-6 (Hostverlust) ist `zustand/` mit der Epoche verloren, weil es
nicht in restic liegt; die Epoche entsteht neu, die Folge ist dieselbe.

### 3.4 Szenarien

| Nr | Lage | Sofort | Daten | Danach | Freigabe |
|---|---|---|---|---|---|
| S-0 | Abbruch **vor** dem Wechsel (Vorprüfung, Platz, Anhalten, Sicherung, `.env`) | `deploy.sh` startet `274bfa0` wieder, **nur** wenn `bisher_startbar` (3.3a Option a); sonst R0 | nichts gewechselt; `data/` unverändert (Sicherung liest nur) | Ursache beheben, Wechsel neu ansetzen | R0: keine |
| S-1 | Start scheitert (nicht healthy, Smoke rot, XFF-Warnung, Manifestabgleich rot) — noch kein Nutzerverkehr | `deploy.sh` macht R0 selbst (Exit 1; bei Exit 8 **von Hand** `./abschalten.sh`) | W-1…W-6 sind evtl. geschrieben. Für einen Neustart mit demselben oder einem reparierten Kandidaten: nichts tun (Bücher und Anker gehören zur neuen Fassung). | Vorwärts-Reparatur (3.5) | R0: keine; neuer Kandidat: Liste + Wechsel |
| S-2 | Läuft, aber fachlicher Fehler ohne Datenschaden und ohne Datenschutzfolge | Dienst weiterlaufen lassen **oder** R0, je nach Schwere (Entscheidungsbaum 3.6) | unverändert lassen | Vorwärts-Reparatur | Betreiber |
| S-3 | Datenschutz- oder Sicherheitsbefund am neuen Bild (z. B. Rechte rollenübergreifend) | **sofort R0**, Bildzeile `gesperrt` | unverändert lassen, Kopie für Analyse | Vorwärts-Reparatur; Vorfallprüfung (Art. 33 DSGVO) wie BE1-BE3 §4.4 Schritt 8 | Betreiber |
| S-4 | Datenschaden durch das neue Bild (Raum 503 `BESTAND_UNLESBAR`, Bestände fehlen) | R0 | Weg B oder C nach [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md): Sicherung aus `deploy-sicherungen/` (Schritt 4) mit dem **Werkzeug der neuen Fassung** und `--zustand`; Checkliste [ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.4 vollständig; neue Schlüsselepoche (3.3b) | Start mit **repariertem** Kandidaten; nie mit dem schadhaften; Sicherungsschlüssel neu ausgeben | Vier-Augen-Vermerk |
| S-5 | Notbetrieb auf `274bfa0` gewünscht (Dienst muss laufen, Kandidat nicht reparierbar) | R0 | Datenrücksprung wie S-4 auf den Stand vor dem Wechsel; Bücher über `--zustand` in die Ablage nachziehen; neue Schlüsselepoche (3.3b) | Start `274bfa0` **ohne 2FA** — nur mit schriftlicher Risikoannahme (O-1 b) und nur, solange `274bfa0` nicht `gesperrt` ist (3.3a). Nach Option b oder nach T0+24 h ausgeschlossen | Betreiber, schriftlich |
| S-6 | Hostverlust | — | Weg D (restic) + `widerrufbuch-vereinen` aus der BE-3-Kopie; Schlüsselepoche verloren (nicht in restic) → neu | wie S-4, Sicherungsschlüssel neu ausgeben | Betreiber |

### 3.5 Vorwärts-Reparatur statt Rücksprung

Vorwärts-Reparatur ist der **Regelweg** nach dem ersten Wechsel. Gründe: Es gibt kein zulässiges Rücksprungbild (3.3).
Jeder Datenrücksprung nimmt Widerrufe, Passwortwechsel und eingerichtete Faktoren seit dem Wechsel zurück; die Bücher
fangen das nur teilweise ab (Codes, Konten, Mitgliedschaften, Faktoren: ja; Kalenderfeeds aus Konten: nein — Matrix
[ABNAHME-V4-EM6-ROLLBACK-CODES.md](ABNAHME-V4-EM6-ROLLBACK-CODES.md) §8).

Ablauf: Fehler eingrenzen → Fix-PR → Review → CI grün → Bild bauen (Lauf auf `main`) → Staging per Digest →
Listenzeile `aktiv` (alte `aktiv`-Zeile des schadhaften Bilds → `gesperrt`) → `deploy.sh` mit neuem Digest. Daten
bleiben, Bücher bleiben.

### 3.6 Entscheidungsbaum mit Zeitgrenzen

T0 = Start des neuen Containers durch `deploy.sh`. Die Zeitgrenzen sind Vorschläge (O-3).

```
Phase 1  T0 … T0+15 min   (deploy.sh automatisch)
  healthy ≤ 150 s, Smoke, keine XFF-Warnung, Manifestabgleich ohne Fehler?
  ├─ nein → deploy.sh macht R0 → S-1
  └─ ja  → Phase 2

Phase 2  bis T0+60 min   (Betreiber, Wartungsfenster; Nutzer noch nicht informiert)
  Go-Kriterien, alle Pflicht:
   G-a Startprotokoll: „Widerrufbuch: … Einträge“ und „Konto-Widerrufbuch: …“ ohne WARNUNG
   G-b „Passwörter … in der Ablage zurückgesetzt“ = 0 und „nach Rücksprung gesperrt“ = 0
   G-c /gesund ok (ablage, widerrufbuch; Sicherungsalter darf warnen, solange B-7 offen)
   G-d Betreiber meldet sich mit zweitem Faktor an (Einrichtung vorher, wp32d-nachweis)
   G-e eine Test-Leitung je Pilotform meldet sich an, öffnet Plan, speichert nichts Echtes
   G-f laufende Bild-ID = Ziel-Digest; Revisionslabel = Commit der Liste
  ├─ alle ja → Go: Nutzer informieren, Phase 3
  ├─ G-a/G-c Warnung, in 15 min behebbar (Mount/Rechte zustand/) → beheben, neu starten, Phase 2 neu
  ├─ Datenschutz-/Sicherheitsbefund → sofort R0 → S-3
  └─ sonst → R0 → S-1 (noch kein Nutzerverkehr: Daten unverändert lassen)

Phase 3  T0+60 min … T0+24 h   (Nutzerverkehr)
  Rollback-Trigger:
   - Datenschutz-/Sicherheitsbefund → sofort R0 → S-3
   - Raum 503 / Bestände fehlen → R0 → S-4
   - wiederholt unhealthy (> 3 Neustarts / h) → R0; Daten unverändert lassen, Ursache eingrenzen (wie S-1, aber
     mit Nutzerdaten seit T0: kein Datenrücksprung ohne Datenschaden), dann Vorwärts-Reparatur
   - fachlicher Fehler → S-2 (Vorwärts-Reparatur), Dienst läuft weiter
  Datenrücksprung nur bei Datenschaden (S-4) oder Vorfall (S-3) — nie wegen eines fachlichen Fehlers.

Nach T0+24 h: Wechsel abgeschlossen. Sicherung außer Haus muss laufen (B-7), sonst kein Go für den nächsten Wechsel.
```

### 3.7 Reihenfolge eines Wechsels (Ablauf am Wechseltag)

1. Freigabe-Checkliste (Abschnitt 5) vollständig, Wartungsfenster angekündigt.
2. V-1…V-9 erneut (Stand des Tages); Ergebnis protokollieren.
3. **Liste zuerst** (gemergter PR, B-6): Kandidat `aktiv`, `274bfa0` nach 3.3a auf `vorherig` (Option a) oder
   `gesperrt` (Option b). Ohne diese Zeile verweigert `digest-pruefen.sh` den Kandidaten (Status nur `aktiv`/`vorherig`,
   `:72-81`); wegen „höchstens eine Zeile `aktiv`“ muss die Zeile von `274bfa0` im selben Schritt umgestellt werden.
   Dann die Betriebsdateien des Kandidaten auf den VPS (Kopie der alten mit Zeitstempel daneben): `compose.yml`,
   `FREIGEGEBENE-IMAGES.md`, `deploy.sh`, `freigabe-lib.sh`, `digest-pruefen.sh`, `ruecksprung.sh`, `abschalten.sh`,
   `deploy-smoke.mjs`, `deploy-abgleich.mjs`.
4. `.env` ergänzen: fehlende Schlüssel aus V-6 (mindestens `CENTRIC_VERTRAUTE_PROXYS`; Mail/Push nach
   `BEREITSTELLUNG.md` Schritt 2); Kopie `.env.vor-<UTC>` vorher.
5. `install -d -m 700 -o 1000 -g 1000 zustand` (falls V-5 „fehlt“).
6. Zusätzliche Sicherung außer Haus (B-8). **Nicht** unter laufendem `274bfa0` sichern: Es hat keinen Schreibhalt,
   die Sicherung könnte mitten in einer Transaktion liegen. Entweder vorher anhalten, oder (einfacher) nach Schritt 8
   die von `deploy.sh` Schritt 4 bei angehaltenem Dienst angelegte und geprüfte Sicherung aus `deploy-sicherungen/`
   außer Haus kopieren.
7. `./deploy.sh sha256:<kandidat> --ohne-label --bei-fehler=r0 --trocken` → Plan lesen (Option a; bei Option b ohne
   `--ohne-label`).
8. Derselbe Aufruf ohne `--trocken`. Der erste Wechsel von Hand (O-2 a); `deploy.yml` erst ab dem zweiten.
9. Phase 2 nach 3.6; Go/No-Go mit Uhrzeit protokollieren.
10. Abschluss in `betrieb-protokoll.log`. Bei Option a: nach T0+24 h Zeile `274bfa0` → `gesperrt` (PR + Kopie auf den
    VPS).

---

## 4. Restore-Probe auf einer Kopie (Plan)

**Ort:** isoliert — Staging O2 (eigene VM) oder Docker Desktop des Betreibers (O3). **Nie** auf dem Produktions-VPS.
**Daten:** Kopie der Produktionsablage nur mit ausdrücklicher Freigabe (personenbezogene Daten; Transport
verschlüsselt; Löschung danach mit Nachweis). Ohne Freigabe: synthetische Ablage mit `274bfa0` erzeugt
([STAGING-O2-VORBEREITUNG.md](STAGING-O2-VORBEREITUNG.md) §5). **Bilder:** nur per Digest.

Bezug: [STAGING-PLAN-V4.md](STAGING-PLAN-V4.md) §5.1–5.4 (Vorprüfung, Abbruchkriterien, Nachweise) und
[ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.3 gelten. Neu sind die Schritte K4, K6 und die Zeitmessung.

| Schritt | Was | Erwartung / Nachweis |
|---|---|---|
| K0 | Freigabe, Umgebung ohne Netz zur Produktion, leeres `zustand/` (uid 1000). **Keine Zustellung:** kein Ausgang nach außen (Firewall/`--network` ohne Internet), **keine** Mail-/Push-Schlüssel in der `.env` der Probe, `CENTRIC_ZUSTELL_TAKT=aus`. `CENTRIC_AUFRAEUMEN` bewusst setzen (Vorschlag `aus`): Der Löschlauf verändert die Kopie sonst 60 s nach **jedem** Start, auch in K2. `CENTRIC_DATENSCHUTZLAUF` nicht `an` | Vermerk mit `.env`-Schlüsselnamen der Probe |
| K1 | Kopie prüfen: `ablage-sicherung.mjs pruefen --sicherung <kopie>` (im Kandidatenbild, ohne Netz) | „In Ordnung: N Dateien“ |
| K2 | `274bfa0` per Digest auf der Kopie starten (Schalter aus K0), `deploy/sicherung/hilfen/bestaende-zaehlen.mjs`, Anmeldung Testzugang | Ausgangszahlen; kein Löschlauf im Protokoll |
| K3 | Stop; `ablage-sicherung.mjs sichern` = Stand **S0**; Zeit messen | Dauer = Grundlage für Zeitgrenzen |
| K4 | **Kandidat** auf derselben Kopie starten (wie `deploy.sh`), Startprotokoll sichern, dann `deploy-abgleich.mjs` gegen S0 | Belegt W-1…W-9: Liste geänderter Dateien und Zählerzeilen. Ersetzt die **[angenommen]**-Stellen in 3.2 |
| K5 | Fachprobe: Betreiber richtet 2FA ein; Code widerrufen; Passwort eines Testkontos ändern; 2FA für ein Testkonto; Plan speichern | alles 200/403 wie erwartet |
| K6 | **Bild-Rücksprung ohne Datenrücksprung:** Stop, `274bfa0` auf den veränderten Daten starten | startet? widerrufener Code 403? Plan lesen und speichern ohne Konflikt (W-9)? 2FA wird **nicht** abgefragt (erwarteter Befund, dokumentiert) |
| K7 | **Datenrücksprung:** Stop; S0 mit dem **Kandidaten-Werkzeug** `wiederherstellen --ersetzen --zustand <kopie von zustand>` | Ausgabe „Widerrufbuch: n …“ und Konto-Zahlen > 0; Meldung „Schlüsselepoche erneuert“ (3.3b); ein in K5 angelegter Sicherungsschlüssel gilt danach nicht mehr |
| K8 | Kandidat einmal starten (BE1-BE3 §4.4 Schritt 5), dann wahlweise `274bfa0` | Code aus K5 bleibt 403; Passwort aus K5 zurückgesetzt; 2FA-Konto aus K5 403 (`faktorGesperrt`) |
| K9 | Hostverlust: `zustand/` leer, `widerrufbuch-vereinen` aus Kopie | Bücher vollständig, `/gesund` ok |
| K10 | restic: `sicherung-ausser-haus.sh` + `wiederherstellung-probe.sh` gegen lokales Repository; BE-3-Job dreimal + `widerrufbuch-probe.sh` | `probe-status.json` `ergebnis` ok, `abweichend`/`fehlend` 0; Gegenprobe „erkannt“ |
| K11 | Kopie und Repositorys löschen | Löschvermerk |

**K4-Zusatzpunkt Betriebskennungen (nur für K4 vorgemerkt, kein Beleg für echte Daten).** Befund aus Code-Lesen
(Review #471, 2026-11-22): Der Kandidat weist das Schreiben mit 422 ab, wenn ein Betrieb keine Zeichenketten-Kennung
hat (`server/lib/gestalt.mjs:501-502`, seit `54c4526b`, nicht in `274bfa0`; `server/funktionen/daten.mjs:1521-1525` → 422).
`274bfa0` legt Betriebe mit `id: uid("m")` an, also als Zeichenkette (`src/App.jsx:1080` in `274bfa0`). Betriebe mit
Zahl-Kennung wären nach dem Wechsel nicht mehr schreibbar. **Ungeprüft:** ob die `274bfa0`-API Zahl-Kennungen
überhaupt annimmt und ob echte Daten solche enthalten.
Prüfauftrag in K4 (auf der Kopie, vor dem Kandidatenstart): Jede Betriebskennung in jedem Raum ist eine Zeichenkette.
Werkzeug: `deploy/betriebskennungen-pruefen.mjs` (nur lesend, kein Netz; liest die Räume wie die Probe: Store
`centric`, Schlüssel `kern:` und `bestand:`, je Raum `bestandLesen`; Isolation wie die Probe). Aufrufzeile für den
Betriebsagenten (Kopie unter einem Wegwerfpfad, CENTRIC_BASIS nicht gesetzt):

    CENTRIC_APP=<Kandidaten-Quellbaum> node deploy/betriebskennungen-pruefen.mjs <…/scratchpad/daten-mig…>

Ausgabe je Raum: Zahl der Betriebe und Verteilung von `typeof m.id` (z. B. `string=3` oder `number=1, string=2`).
Kriterium: Exit 0 (mindestens ein Raum gelesen, alle `"string"`); Exit 1 = NO-GO für den Wechsel, bis eine
Entscheidung zur Umstellung vorliegt; Exit 3 = Pfad verletzt die Isolation. Test mit Wegwerfdaten:
`pruefungen/betriebskennungen-pruefen.test.js`. Zusätzlich: PUT jedes Raums mit dem Kandidaten = 200 (nicht 409/422).

**Lokale Probe `deploy/migrationsprobe-lokal.mjs` (Grenze).** Die Probe liest und schreibt je Raum einmal über die
Kandidaten-API auf einer Wegwerfablage (nur `…/scratchpad/daten-mig…`, Exit 3 sonst; PUT 409 = FEHLGESCHLAGEN).
Delta-Review #471 (2026-11-22): Unter Linux ist „\“ kein Pfadtrenner; eine Angabe mit „\“ wird dort abgewiesen
(Exit 3). Ein toter Link im Pfad wird abgewiesen. Jeder HTTP-Aufruf hat eine Frist (`CENTRIC_PROBE_FRIST_MS`, Vorgabe
30000 ms); Ablauf = FEHLGESCHLAGEN, kein Hängen. Sie
ersetzt K4 auf einer echten Kopie **nicht**. Nicht ausgeführt: K5, K9, K10 und Bild-Digests (lokal kein Docker, kein
restic).

Abbruch: jede Spur einer Verbindung zur Produktion; jeder Personendatenfund in Ausgaben oder Logs außerhalb der
Umgebung; K1 nicht „In Ordnung“.

Ergebnis: Ein Bericht mit Dauer K3/K7 (Zeitbedarf eines echten Datenrücksprungs), Ergebnis K6 (zulässig/unzulässig
als Notbetrieb), Ergebnis K4 (welche Dateien ein erster Start ändert).

---

## 5. Freigabe-Checkliste vor dem ersten Wechsel auf ein Integrationsbild

Jede Zeile braucht einen Beleg (Datei, Lauf, Protokollzeile). Ohne Beleg: No-Go.

| Nr | Punkt | Beleg | Stand heute |
|---|---|---|---|
| F-1 | Laufendes Produktionsbild bestimmt (Zustand A/B/C) | V-1…V-3 | offen |
| F-2 | Kandidat auf `main`, Gates R1–R3 grün | RELEASE-GATES | offen |
| F-2a | Manuell zu prüfende Pakete ohne Gate-Schutz (WP-44, WP-15, WP-07b): Funktionsisolation und Betreiberhandlung am Kandidaten bestätigt, Abschnitt 5a | Abschnitt 5a, Betreiberbestätigung je Punkt | offen |
| F-3 | Kandidatenbild gebaut; Digest, Label = Commit, Provenienz `vcs.revision` = Commit | `deploy.yml` Lauf, Abschnitt 1.3 | offen (kein Bild) |
| F-4 | Staging-Abnahme per Digest bestanden | STAGING-PLAN-V4 §9 | offen |
| F-4a | **Migrationsnachweis am exakten Kandidaten-Digest (notwendig, Betreiberentscheidung 2026-11-27):** Feld `migrationsprobe` im Staging-Nachweis eines **erfolgreichen Runner-Laufs** von `staging-gate.yml` (GATE-EW3 + RST-5-Patch): `art` `migrationsprobe-staging`, `digest` = Kandidaten-Digest (`sha256:<64 hex>`), `altDigest` = Bild 274bfa0 und ≠ `digest`, `ergebnis` `bestanden`, W-1…W-9 und Zusatzproben bestanden. Ein lokaler oder statischer Docker-Nachweis (`migrationsprobe-lokal`, `digest: null`, Lauf auf dem Arbeitsrechner) ersetzt den Runner-Lauf **nie**. Fehlt, unlesbar, anderer/älterer Digest oder nicht bestanden: No-Go | `werkzeug/release-pruefung.mjs` G5 (Erstwechsel von 274bfa0) und G6 E6/E7 (Bytes = Artefakt des Laufs); `docs/acc45/RST-5-nachweis.md` Teil 3 | offen (Patches nicht übernommen, kein Lauf) |
| F-4b | **Wiederholung nach abgebrochenem Erstwechsel (Rückkehr auf 274bfa0), Betreiberentscheidung 2026-11-27:** nur mit eigenem Feld `wiederholung` in der neuen Freigabedatei und **ausdrücklicher Betreiberfreigabe** dieses Versuchs (fester Wortlaut, Datum nach dem Abbruch); neue Release-ID, neuer Kandidat, neuer Digest ≠ Vorversuch; Abbruchbeleg des Vorversuchs im Repository; alle Nachweise neu und aktuell am neuen Digest (Staging-Lauf nach dem Abbruch, Migrationsnachweis wie F-4a, reguläre Widerrufbuch-Probe). Die verbrauchte Erstwechsel-Ausnahme wird **nie** wiederverwendet. Ohne vollständiges Feld: No-Go | `werkzeug/release-pruefung.mjs` G5 WH1–WH6; `docs/acc45/RST-5-nachweis.md` 3.4 | nur bei Bedarf (kein Abbruch bisher) |
| F-5 | Restore-Probe K0–K11 bestanden | Bericht Abschnitt 4 | offen |
| F-6 | Sicherung außer Haus läuft, erster Restore belegt (Ablage **und** Widerrufbücher) | `probe-status.json`, `widerrufbuch-probe-status.json` | offen |
| F-7 | Umgebung `produktion` mit Prüfer; Werte nur dort; keine Repository-Werte | `gh api …/environments` | offen |
| F-8 | Deploy-Key mit Schreibrecht geklärt (B-4) | Einstellungen | offen |
| F-9 | `.env` hat alle Pflichtschlüssel; `CENTRIC_DATENSCHUTZLAUF` bewusst gesetzt | V-6 | offen |
| F-10 | `zustand/` vorhanden, uid 1000, Modus 700 | V-5 | offen |
| F-11 | Betreiber-2FA-Einrichtung vorbereitet (Authenticator, Ablage der Wiederherstellungscodes) | wp32d-nachweis | offen |
| F-12 | Listenzeile für den Kandidaten `aktiv` **vor** dem Wechsel (3.7 Schritt 3); Zeile `274bfa0` nach O-1/3.3a: `vorherig` bis T0+24 h (Option a, nur als Neustart vor dem Wechsel, nie als Rücksprungziel) **oder** sofort `gesperrt` (Option b, Abbruch vor dem Wechsel = Ausfall, S-5 ausgeschlossen) | PR auf die Liste | offen |
| F-13 | Wartungsfenster, Ansprechpartner, Entscheidungsbaum 3.6 bestätigt | Vermerk | offen |
| F-14 | Ausdrückliche Produktionsfreigabe des Betreibers | schriftlich | offen |

## 5a. Pakete ohne Gate-Schutz und Funktionsisolation am Kandidaten (Stand 2026-11-26)

Betreiberentscheidung 2026-11-26: Es wird **keine** verbindliche Akzeptanz für G8/G9 erteilt und keine als erteilt behandelt.
`akzeptiertePakete` und `akzeptierteBefunde` bleiben unverändert. Dieser Abschnitt ergänzt die Freigabe-Checkliste (F-2a) um
Punkte, die die automatischen Gates **nicht** erfassen. Er ändert kein Gate, kein Werkzeug und keinen Workflow.

### 5a.1 Warum die Gates diese Pakete nicht erfassen

- **G8** (`werkzeug/release-pruefung.mjs`, `g8Blocker`, Z. 1549) blockiert ein offenes P0/P1-Paket nur, wenn eine PR aus seinem Feld `pr`
  im Kandidaten liegt (Z. 1562). Pakete mit `pr: []` sieht G8 nie.
- **G9** (`g9Befunde`, Z. 1623; Konfiguration Z. 230) blockiert offene P0/P1-Pakete nur mit `strang: folge` oder ID `ABN-*`/`V4-*`.
  Strang `acc45` ohne diese Präfixe fällt durch.
- Folge: **WP-44** (P0, `acc45`, `pr: []`) und **WP-15** (P1, `acc45`, `pr: []`) stehen in keinem Gate. **WP-07b** (P1, `folge`, `pr: []`)
  erfasst G9 zwar über den Strang, G8 aber nicht; es enthält zudem keinen Produktcode. Eine Annahme in der Freigabedatei
  ersetzt die manuelle Bestätigung nicht, und umgekehrt.

### 5a.2 Manuell zu prüfende Punkte (Betreiber bestätigt je Punkt mit Beleg)

| Paket (work-packages.json) | Warum kein Gate | Manuell zu bestätigen | Stand heute |
|---|---|---|---|
| **WP-44** (P0, BLOCKED): „Zugangscodes bewerten, rotieren, Klartext beseitigen (A9)“; Abhängigkeit E-15 | `pr: []`, Strang `acc45`: G8 und G9 sehen es nicht. Es ist eine Betreiberhandlung, kein Code | (1) Zugangscodes bewertet und rotiert (Ablauf A9, Z1 bis Z7 laut `ENTSCHEIDUNGSLISTE.md` E-15, `EXTERNE-ABNAHMEN-UEBERGABE.md`). (2) Kein Code aus Klartextdateien aktiv, Klartextdateien beseitigt. (3) Betreiberzugang rotiert, Nachweise gesichert. (4) Produktionskonfiguration: keine alten Zugangscodes in der `.env` (nur Schlüsselnamen mit V-6 prüfen, nie Werte weitergeben) | **offen**: SSOT-Stufen alle `false`, kein Nachweis; als P0-Produktionsblocker nicht erledigt. Im Repo ist keine Funktionsisolation möglich, weil kein Code betroffen ist |
| **WP-15** (P1, REVIEW): „Selbstauskunft mit Freigabe und Stempelabgleich“ | `pr: []` (Direkt-Merge `1c1a27e0`, anerkannt), Strang `acc45`: G8 und G9 sehen es nicht | (1) Der Code ist im Kandidaten **aktiv ohne Schalter**: `POST /api/selbstauskunft-entscheiden` (`server/funktionen/daten.mjs:3061`), Recht `staff.edit` plus Schreibumfang (`:3064`), Zurückziehen nur mit Schreibumfang (`:3068`). Die Funktion ist nicht isoliert; es gibt nichts abzuschalten. (2) Offen: Browser-E2E und F15-2 (Selbstfreigabe im Einpersonenbetrieb). (3) Betreiber bestätigt, dass ein Einpersonenbetrieb die eigene Auskunft vorerst nicht selbst freigeben kann (Bedienung, kein Rechteleck belegt) | **offen**: SSOT `integriert=false`, Abnahmekriterien Browser-E2E und F15-2 offen; Tests `selbstauskunft` 22/22, Oberfläche 6/6 laut SSOT (Lauf 2026-11-12) |
| **WP-07b** (P1, REVIEW): „Stempel-Sonderfall ‚500 nach Speicherung‘ (clientEventId, sechs Szenarien)“ | `pr: []`; G8 sieht es nicht, G9 erfasst es über `folge` | (1) Kein Produktcode im Kandidaten (SSOT `implementiert`: kein Codeänderungsbedarf; nur Prüfung `pruefungen/wp07b-stempel-500.test.js`, 9/9). (2) Offen: Lastmessung N-07b-1 (echter 500 nach dem Schreiben unter Last) auf Staging oder VPS. (3) Betreiber bestätigt, dass bis dahin das Risiko Doppelstempel unter Last bewusst getragen wird | **offen** (nur Messung; nichts zu isolieren). Nachholreview 2026-11-13 ohne Blocker (`NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md`) |

### 5a.3 Funktionsisolation am konkreten Kandidaten

**Kandidatenschnitt.** Basis (laufende Produktion laut `BETREIBER-ANLEITUNG-ERSTRELEASE.md`, Annahme 7): `274bfa0baca5681f383eea334aab69875f31d5c1`.
Kandidatenstand für diese Prüfung: `origin/integration/release-v4` @ `3d4535478a3d5884facd156d75025aef4f5b0975`
(2528 Commits, 1797 geänderte Dateien gegenüber der Basis). `release/rc-2026-11-22` (`517993ca`) liegt vollständig darin
(Vorfahr) und ist nicht der Kandidat. Der echte Kandidat ist ein künftiger Commit auf `main`; die Prüfung ist dort zu wiederholen.
Maßgeblich waren: offene P0/P1-Pakete (Status nicht `INTEGRATED`/`DONE`/`VERIFIED`), deren `pr` im Schnitt liegt (G8-Sicht), plus
die `pr: []`-Pakete (5a.2). Alle Zeilenangaben gelten für den genannten Stand.

**Produktionskonfiguration.** Sie liegt nicht im Repository. Die Vorlagen (`.env.example`, `deploy/compose.yml`) setzen keinen der
folgenden **Schalter** aktiv (alle Zeilen auskommentiert, G3 prüft das an den Vorlagen). Ausnahme ist keine Schalterzeile:
`CENTRIC_VERTRAUTE_PROXYS` steht in `.env.example` (Z. 39) unkommentiert mit Platzhalter, es ist Konfiguration, kein Schalter. Was auf dem VPS tatsächlich gesetzt ist, kann
nur der Betreiber feststellen (5a.4).

Isolationsbeleg: **ja** = bei Sollwert inert, mit Quelle und Test; **nein** = Code läuft aktiv oder in gemeinsamen Pfaden ohne Schalter;
**offen** = nicht belegt, Fehlendes benannt.

| Paket | Code im Kandidaten | Isolationsbeleg | Beleg (Quelle, Test) oder was fehlt | Folgerung |
|---|---|---|---|---|
| WP-48 (P0), PR #87, #224, #271, #322, #341, #342, #346, #348, #350, #351 | Schalterteile und aktive Teile | **nein** (Schalterteil: ja) | Schalter `teilwegAn()`, `abschlussSegmentweiseAn()`, `abschlussOhneSperreAn()` nur bei genau `true` (`server/lib/schalter.mjs:21, 47, 63`; Abfragen `server/funktionen/daten.mjs:1582, 1586, 2930, 2956`). Aktiv ohne Schalter: Ablage/Scherben, Voll-PUT, `zusammenfuehren`, Kette (`server/lib/kette.mjs:23-25`, Rückfall `CENTRIC_KETTE_AUS=1`), Umbau des Monatsabschlusses. WP-48.8/48.9 offen | G8-Blocker bleibt; Rundweg und Messung auf Sicherungskopie in Pilotgröße fehlen |
| WP-16c (P0), PR #223 | Korrekturaktionen im Monatsabschluss | **nein** | aktiv ohne Schalter (`daten.mjs:2875-2898`); Migration alter Abschlüsse ohne Revisionsschema, Offline-Stempel in revidierte Monate und HTTP-Pfad ungemessen; E-29 offen | G8-Blocker bleibt; kein echter Korrekturexport an das Lohnbüro bis geklärt |
| WP-16 (P1), PR #85 | Pausen, Abschluss sperrt Ist, Wiederöffnen, Lohnexport | **nein** | aktiv ohne Schalter; A-6 (Lohnart 1200) offen | G8-Blocker bleibt; kein produktiver Lohnexport bis A-6 |
| WP-14c (P1), PR #368 | Pausenprüfung in Ist/Stempel | **nein** | aktiv; F6 offen; Alteinträge mit leerer oder negativer Pause zählen still | G8/G9-Blocker bleibt |
| WP-15 (P1), kein PR | Selbstauskunft | **nein** | siehe 5a.2 | manuell (5a.2) |
| WP-07b (P1), kein PR | kein Produktcode | **ja** (nichts zu isolieren) | `pruefungen/wp07b-stempel-500.test.js` 9/9 laut SSOT; Lastmessung N-07b-1 **offen** | manuell (5a.2) |
| WP-44 (P0), kein PR | kein Code | **offen** | Betreiberhandlung, siehe 5a.2 | manuell (5a.2), Produktionsblocker |
| WP-19, 19.3, 19.5, 19.6, 19.13, PR #234, #243, #244, #247, #249, #359 | Branchenmodule | **ja** | alle Module Status `geplant`: Vorgabe des Hilfsaufrufs `modul()` (`server/lib/branchenmodule.mjs:156`), in den Moduldefinitionen (Z. 159 bis 300) nirgends überschrieben; `modulAktiv` weist `geplant` ab (`:301-304`); Oberfläche nur bei `modulAktiv` (`src/module/index.js:131`). Tests: `pruefungen/branchenmodule.test.js:104` (ein geplantes Modul wirkt nie, auch wenn ein Schalter gespeichert ist, Z. 110), `:164` (Server weist geplante Module ab). **Kein Umgebungsschalter**, sondern Code-Konstante; G3 prüft sie nicht. Aktiver Rest: Art.-17-Löschweg | Annahme (falls je erteilt) nur gebunden an Status `geplant`; erlischt, sobald ein Modul `vorlaeufig` wird |
| WP-19.1 (P1, IN_PROGRESS), PR #569 (neu seit der Analyse vom 25.11.) | Posten-Pflege (`server/lib/modul-posten.mjs`, `src/module/posten-pflege.js`) | **ja** | Posten-Zuordnung nur mit `modulAktiv(m, "posten", …)` (`modul-posten.mjs:179`); Modul `posten` bleibt `geplant` (`pruefungen/modul-posten-pflege.test.js:13`: geschrieben wird im Prüfmodus, Registry-Kopie „vorlaeufig“ nur im Test) | wie WP-19; zusätzlich Einzeleintrag WP-19.1, falls je akzeptiert |
| WP-21 (P1), PR #183, #192, #211, #213, #258 | Darstellung | **nein** (nur Darstellung) | echte Geräte, Kartenansicht, Vorlesesoftware, Textvergrößerung offen; kein Rechte- oder Datenweg | G8-Blocker bleibt |
| ABN-A2 (P1), PR #534, #536 | Rolle vor Zähler, getrennte Zähler je Raum | **nein** | Rest R-A2-1R (niedrig, Verfügbarkeit) offen; Betreiber lehnte am 24.11. eine dauerhafte Risikoannahme ab | G8/G9-Blocker bleibt |
| ABN-S2 (P1), kein Fix | Anmelde-/Einlöseweg | **nein** (vorbestehend) | Konfiguration `CENTRIC_VERTRAUTE_PROXYS` (Platzhalter in `.env.example`, Betreiber setzt Wert); ABN-S2-de offen | G9-Blocker bleibt |
| RB-P217 (P1) | Lesepfad bei Altdaten ohne vollständiges `mindest` | **nein** | Ampel kann grün statt Hinweis zeigen; Entscheidung P2-17 offen | G9-Blocker bleibt |
| OPT-4 (P1), PR #182 | Zweiter Faktor je Konto (TOTP) | **nein** | aktiv; Migration bestehender Leitungskonten (E1) und Nachtrag E4 offen; Betreiber-2FA-Einrichtung (F-11) | G8-Blocker bleibt (F-11 begleitet ihn) |
| E-9 (P1, READY, Strang extern, PR #353): „E-Mail und Push (WP-30)“; Betreiberhandlung plus Technikteil #343/#353 | Mailbestätigung (`mailbestaetigung.mjs`), Push-Abmeldung je Gerät, Aufräumen bei Anonymisierung | **nein** (Schalterteil: ja) | Hinter Schalter: Adressbestätigung nur bei `CENTRIC_MAILBESTAETIGUNG=angebot|pflicht`, alles andere ist „aus“ (`server/lib/mailbestaetigung.mjs:67-70`; Test `pruefungen/mailbestaetigung.test.js`). Aktiv ohne Schalter: Push-Abmeldung je Gerät (`server/funktionen/daten.mjs:3159` mit `geraetAbmelden` aus `server/lib/versand.mjs`; Test `pruefungen/e9-abmelden-geraet.test.js`), Aufräumen der Bestätigung bei Anonymisierung (`daten.mjs:2227-2233`, `server/lib/datenschutzlauf.mjs`; ohne Schalter gibt es keine solchen Einträge, das Entfernen läuft leer). Die Mail- und Push-Zustellung selbst (WP-30, PR #84) ist aktiv und hängt an Anbieter-Konfiguration (`CENTRIC_MAIL_WEG`, `CENTRIC_SMTP_*`, VAPID in `.env.example` Z. 222-242, 259); Ein Anbieter-Ende-zu-Ende-Test am Kandidaten ist in der SSOT nicht belegt. Offen: Betreiberhandlung E-9 (Absenderdomain, Anbieter, End-to-End-Test; SSOT alle Stufen `false`) | G8-Blocker (über #353) bleibt; Betreiber bestätigt Schalter und Anbieterkonfiguration (5a.4) |
| WP-ST1 (#279, #299), REL-1 (#427) | nur Doku, Werkzeug, Staging-Vorbereitung | **nicht untersucht** | #279 nur Doku; Staging-Gate ausgeschaltet bis `STAGING_GATE_AKTIV=true` laut SSOT | kein Beitrag zur Funktionsisolation der App |
| Intelligence/Steuerung, IMP-6, Import, Demo (kein offenes P0/P1-Paket im Schnitt, aber Schalter) | Schalter aus `RELEASE-SCHALTER.json` | **ja** | `PLANER_AN = false` (`server/lib/engine/planer.mjs:81`, Auswertung `:188`), `PLANER_AGGREGATE_AN = false` (`server/lib/engine/planeraggregate.mjs:46`, genutzt `server/lib/vorgabenwirkung.mjs:105`), `KI_STEUERUNG_PROZESS = "aus"` (`src/ansichten/ki-steuerung.jsx:28`; Test `pruefungen/intelligence-steuerung-oberflaeche.test.js:41`), Tests `pruefungen/intelligence-planer-kern.test.js:81`, `intelligence-planer-aggregate.test.js:44`; `CENTRIC_KI_BR_PAUSE` nur genau `true` (`server/lib/schalter.mjs:32`, Verwendung `daten.mjs:1595`), `CENTRIC_SCHICHTMODELL_PFLEGE` (`schalter.mjs:110`), `…_WIRKUNG` (`:132`), `CENTRIC_IMPORT_AKTIV` (`:78`) nur genau `true`. `PLANER_AN` und `KI_STEUERUNG_PROZESS` sind Code-Konstanten, **keine** Umgebungsschalter | Isolation im Code belegt; Produktionswerte nur vom Betreiber bestätigbar (5a.4) |

**Gesamtfolgerung.** Am Kandidatenstand `3d453547` ist die Funktionsisolation nur für die Module (WP-19 und Unterpakete einschließlich WP-19.1),
die Intelligence-Konstanten und die Schalter in `RELEASE-SCHALTER.json` belegt. Für WP-48 (nur der Schalterteil), WP-16c, WP-16, WP-14c, WP-15, WP-21,
ABN-A2, ABN-S2, RB-P217, OPT-4 und E-9 (nur die Mailbestätigung liegt hinter einem Schalter) gibt es **keine** vollständige Isolation: der Code läuft aktiv, die Absicherung ist ein fachlicher Rest oder eine Auflage,
keine Abschaltung. WP-44 ist eine reine Betreiberhandlung und derzeit offen; bei E-9 ist die Betreiberhandlung (Anbieter, Absender, Ende-zu-Ende-Test) offen. Nicht untersucht sind nur WP-ST1 und REL-1 (siehe Tabelle). Das ist eine Lesart des Codes, keine Annahme und keine Freigabe.

### 5a.4 Was der Betreiber am konkreten Kandidaten bestätigen muss (Produktionskonfiguration)

Die Liste ist **nicht abschließend**: alle Einträge der Klasse `schalter-aus` in `docs/acc45/RELEASE-SCHALTER.json` sind mit V-6 gegenzuprüfen. G3 prüft nur die Vorlagen des Kandidaten, nicht die tatsächliche `.env` auf dem Server.
Nur Schlüsselnamen und Sollwerte; Werte nie in Doku, Chat oder Tickets schreiben. Prüfung mit V-6 (Schlüsselnamen der `.env`)
und der Kandidaten-Vorlage; maßgeblich ist die Konfiguration, die der Kandidat tatsächlich erhält.

| Schlüssel | Sollwert | Deckt ab |
|---|---|---|
| `CENTRIC_TEILSPEICHERUNG` | nicht gesetzt (nur genau `true` schaltet ein) | WP-48 Teilweg und Löschlauf |
| `CENTRIC_ABSCHLUSS_SEGMENTWEISE` | nicht gesetzt | WP-48 segmentweiser Abschluss |
| `CENTRIC_ABSCHLUSS_OHNE_SPERRE` | nicht gesetzt | WP-48, nur zusammen mit SEGMENTWEISE wirksam |
| `CENTRIC_KETTE_AUS` | bewusst entscheiden: nicht gesetzt = Kette **an** (Vorgabe des Kandidaten); `1` = Rückfall ohne Kette | WP-48 (#341) |
| `CENTRIC_KI_BR_PAUSE` | nicht gesetzt | Betriebsrat darf Intelligence pausieren (WP-I16) |
| `CENTRIC_SCHICHTMODELL_PFLEGE`, `CENTRIC_SCHICHTMODELL_WIRKUNG` | nicht gesetzt | IMP-6 |
| `CENTRIC_IMPORT_AKTIV` | nicht gesetzt | Personalimport (Dateiweg) |
| `CENTRIC_DEMO` | nicht gesetzt | öffentlicher Demozugang |
| `CENTRIC_VERTRAUTE_PROXYS` | bewusst gesetzt (nur die feste Adresse des Caddy-Containers); leer = niemandem geglaubt: dann zählen alle Nutzer unter der Caddy-Adresse, die Bremse träfe alle gemeinsam, und `deploy.sh` liefert nicht aus (`.env.example` Z. 30-38); das ganze Subnetz ist nicht empfohlen | ABN-S2 |
| `CENTRIC_DATENSCHUTZLAUF` | bewusst gesetzt (F-9) | Datenschutzlauf |
| Zugangscodes in der `.env` | rotiert, keine alten Werte (WP-44) | WP-44 |
| `CENTRIC_SELBSTSTART` | nicht gesetzt (nur genau `true` schaltet ein) | Selbststart |
| `CENTRIC_PUBLIC_REGISTRATION` | nicht gesetzt (nur genau `true` schaltet ein) | öffentliche Selbstregistrierung |
| `CENTRIC_HILFE_ASSISTENT` | nicht gesetzt oder `aus` (Werte `aus`, `suche`, `an`) | Hilfe-Assistent |
| `CENTRIC_PRUEFLINK` | nicht gesetzt (nur `ja` schaltet ein) | Prüflink |
| `CENTRIC_MAILBESTAETIGUNG` | nicht gesetzt oder `aus` (`angebot` und `pflicht` schalten ein; `pflicht` braucht `CENTRIC_PFEFFER`) | E-9 Adressbestätigung |
| `CENTRIC_KONTOWIEDERHERSTELLUNG` | nicht gesetzt (WR-4 bis WR-9 offen) | Kontowiederherstellung |
| `CENTRIC_TESTRAUM_MAIL` | nicht gesetzt (nur `ja` schaltet ein) | Mail aus Test-/Demoräumen |
| `CENTRIC_ZUSTELL_SPERREN_AUFHEBEN` | nicht gesetzt (nur `ja`, einmalig) | Aufheben der Zustellsperren |

Nicht per Umgebung steuerbar und daher kein Konfigurationspunkt, aber im Kandidaten festgelegt (Quellen 5a.3): Modulstatus `geplant`
(`branchenmodule.mjs`), `PLANER_AN = false`, `PLANER_AGGREGATE_AN = false`, `KI_STEUERUNG_PROZESS = "aus"`. Eine Änderung dieser Konstanten
ist eine Codeänderung und gehört in die Wiederholung dieser Prüfung am echten Kandidaten.

### 5a.5 Ergebnis `werkzeug/release-pruefung.mjs` (nur lesend)

Lauf am 2026-11-26 (lesend, online gegen GitHub, Dauer rund 38 Minuten wegen der Abfrage je Commit und je PR):
`node werkzeug/release-pruefung.mjs --kandidat 3d4535478a3d5884facd156d75025aef4f5b0975 --basis 274bfa0 --release-id g89-lesend-2026-11-26 --kurz`.
Es wurde keine Freigabedatei angelegt oder geändert. Gesamt: **NO-GO, Exit 1** (erwartet: keine Freigabedatei, kein Bild, kein Kandidat auf `main`).

| Gate | Ergebnis | Kern der Gründe |
|---|---|---|
| G1 CI | NO-GO | Pflicht-Checks `browser-abnahme`, `pruefen-a`, `pruefen-b`, `pruefen-c` zum Zeitpunkt des Laufs `in_progress` |
| G2 Review je PR | NO-GO | 324 PR ohne maschinell prüfbaren Review-Beleg (Bestätigung durch den Betreiber in `reviewBestaetigt`); 149 Commits ohne PR |
| G3 Schalter | NO-GO | Freigabedatei ohne `vorlagenHashes` (Vorlagen nicht gebunden); die Schalterprüfung selbst nannte keinen aktiven Schalter |
| G4 Bild | NO-GO | Digest und Bildangaben fehlen (kein Bild gebaut) |
| G5 Migration/Startschreibvorgänge | NO-GO | seit `274bfa0` geändert: W-1 bis W-9, STARTBLOCK; wartet auf `migration.freigegeben`. Seit 2026-11-27 (RST-5, F-4a) zusätzlich: Migrationsnachweis am Kandidaten-Digest fehlt (ohne Freigabedatei mit Staging-Nachweis) |
| G6 Sicherung/Restore | NO-GO | Nachweise für Sicherung außer Haus, Restore-Probe, Widerrufbuch-Probe und `v4-r1.freigabe.json` fehlen |
| G7 Rückweg | NO-GO | `rueckweg.strategie` fehlt in der Freigabedatei |
| G8 offene P0/P1 im Kandidaten | NO-GO | 16 Pakete, u. a. WP-16, WP-16c, WP-19, WP-19.1, WP-19.3, WP-21, WP-48, WP-14c |
| G9 offene P0/P1-Befunde | NO-GO | WP-14c, WP-07b, ABN-A2, RB-P217, ABN-S2, RST-3, RST-5, GATE-EW3 und 3 weitere |
| G10 Betreiberfreigabe | NO-GO | Freigabedatei fehlt; Kopf-SHA des Laufs nicht auf `origin` im Sinn des Werkzeugs |

Bestätigt die Lücke aus 5a.1: **WP-44 und WP-15** tauchen weder in G8 noch in G9 als Grund auf (WP-07b nur in G9). Neu gegenüber der Analyse vom 25.11.:
**WP-19.1** (PR #569) steht jetzt in G8. `akzeptiertePakete` und `akzeptierteBefunde` bleiben unverändert; nichts ist als akzeptiert eingetragen.

### 5a.6 Lücke im Gate: nur als Vorschlag (nicht umgesetzt)

Keine Änderung an Gate oder Werkzeug. Falls der Betreiber die Lücke künftig im Werkzeug schließen will, wäre das ein Patch für das
Betreiber-Workflow-/Werkzeug-Bündel (nicht in diesem Paket): G8 behandelt offene P0/P1-Pakete mit `pr: []` und Strang `acc45`
als Blocker (oder verlangt für sie einen Eintrag unter `akzeptiertePakete` mit Betreiberquittung). Bis dahin deckt die
manuelle Bestätigung in 5a.2 die Lücke ab.

---

## 6. Offene Entscheidungen

| Nr | Frage | Optionen | Empfehlung |
|---|---|---|---|
| O-1 | Welche Rolle hat `274bfa0` (ohne 2FA, ohne Label) beim ersten Wechsel? Achtung: Wird es nicht `vorherig`, kann es nur `gesperrt` werden — dann führt jeder Abbruch vor dem Wechsel zu R0 statt Weiterbetrieb (S-0), und S-5 ist ausgeschlossen (3.3a) | a) `vorherig` bis T0+24 h, nur damit `deploy.sh` es bei einem Abbruch **vor** dem Wechsel wieder startet; erster Wechsel von Hand mit `--ohne-label --bei-fehler=r0`; kein Rücksprung darauf nach dem Wechsel; b) sofort `gesperrt`, Ausfall bei Abbruch bewusst in Kauf nehmen; c) zusätzlich zu a: Notbetrieb S-5 mit schriftlicher Risikoannahme, befristet bis T0+24 h | **a** (kein vermeidbarer Ausfall, kein Rücksprung auf ein Bild ohne 2FA) |
| O-2 | Wie wird ausgeliefert? | a) von Hand mit `deploy.sh`; b) `deploy.yml`/`vps` mit Freigabe | erster Wechsel a (Betreiber sieht jede Ausgabe; bei O-1 a zwingend, weil der Forced Command `--ohne-label` nicht zulässt), danach b |
| O-3 | Zeitgrenzen 15 min / 60 min / 24 h (3.6) | bestätigen oder ändern | bestätigen, nach K3/K7-Messung prüfen |
| O-4 | Kopie echter Produktionsdaten für die Probe? | a) ja, mit Freigabe und Löschnachweis; b) nur synthetisch | a für K4/K6 (nur echte Daten zeigen den echten ersten Start) |
| O-5 | Schreib-Deploy-Key des Produktionsservers | entfernen; lesend neu; so lassen | entfernen, wenn V-7/V-8 keinen Git-Bedarf zeigen |
| O-6 | Nachtrag voller Digest `0861adee…` in der Liste | ja/nein | ja (B-6) |
| O-7 | Satz „Daten von Bildwechsel nie betroffen“ in `BEREITSTELLUNG.md` §3.1 berichtigen | ja/nein | ja, eigener Doku-PR |

---

## 7. Quellen

- Bild und Liste: [`deploy/FREIGEGEBENE-IMAGES.md`](../../deploy/FREIGEGEBENE-IMAGES.md),
  [`deploy/compose.yml`](../../deploy/compose.yml), [`deploy/deploy.sh`](../../deploy/deploy.sh),
  [`deploy/ruecksprung.sh`](../../deploy/ruecksprung.sh), [`deploy/abschalten.sh`](../../deploy/abschalten.sh),
  [`deploy/digest-pruefen.sh`](../../deploy/digest-pruefen.sh), [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md)
- Workflows: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml),
  [`.github/workflows/betrieb-deploy.yml`](../../.github/workflows/betrieb-deploy.yml),
  [`.github/workflows/betrieb-sicherung.yml`](../../.github/workflows/betrieb-sicherung.yml)
- Auslieferung: [`BEREITSTELLUNG.md`](../../BEREITSTELLUNG.md) Schritte 2–3, §5.4;
  [DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md); [INCIDENT-RUNBOOK.md](../INCIDENT-RUNBOOK.md) §11
- Sicherung: [BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md), [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md),
  [INFRA-VORBEREITUNG-STAGING-BACKUP.md](INFRA-VORBEREITUNG-STAGING-BACKUP.md),
  [ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md](ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md)
- Rücksprung und Zugangsdaten: [ABNAHME-V4-EM6-ROLLBACK-CODES.md](ABNAHME-V4-EM6-ROLLBACK-CODES.md),
  [ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md), [ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md](ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md) §3,
  [wp32d-nachweis.md](wp32d-nachweis.md)
- Staging: [STAGING-PLAN-V4.md](STAGING-PLAN-V4.md), [STAGING-O2-VORBEREITUNG.md](STAGING-O2-VORBEREITUNG.md),
  [RELEASE-GATES-R1-R2-R3.md](RELEASE-GATES-R1-R2-R3.md), [BETREIBERAUFGABEN-RELEASE.md](BETREIBERAUFGABEN-RELEASE.md)
- Startverhalten: `server.mjs` (Startblock nach `ablageBelegen`), `server/lib/widerrufbuch.mjs`,
  `server/lib/kontowiderrufbuch.mjs`, `server/lib/schluesselepoche.mjs`, `server/lib/scherben.mjs` (`abdruckNormal`)
