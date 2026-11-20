# Produktionsweg — Vorbereitung (Stand 2026-11-20)

Betreiberauftrag: Deployment-Architektur prüfen, sicheren Produktionsweg vorbereiten. Reine Doku und Planung.

Basis: `origin/integration/release-v4` @ `e5e7b1d7`. `origin/main` @ `a5b49709` (19 Commits hinter integration).

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
5. **Der Job `vps` in `deploy.yml` ist nie gelaufen.** In allen vier Bau-Läufen der Tabelle ist er `skipped`. GitHub
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
| Deploy-Key des Repositorys | Für den Weg `deploy.yml` nicht nötig (VPS zieht Bilder aus GHCR, nicht aus Git) | **ein** Schlüssel „srv-prod-01 dienstplaner“, angelegt 2026-09-11, **`read_only: false`** (Schreibrecht) | B-4 |
| Forced Command auf dem VPS | `command="…/deploy.sh --ssh",restrict` in `authorized_keys` (DEPLOY-AUTOMATISIERUNG §2.5) | [nicht belegt] | V-8, B-5 |
| Branch-Schutz `main` | [BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md) | offene Betreiberaufgabe (dort) | dort |

Zwei Risiken aus dieser Tabelle:

- **R-GH-1 Umgebung fehlt.** Verweist ein Job auf eine nicht vorhandene Umgebung, legt GitHub sie beim Lauf an —
  **ohne** Pflicht-Prüfer. Heute scheitert der Job trotzdem, weil `DEPLOY_HOST` fehlt. Würde jemand die Werte auf
  Repository-Ebene hinterlegen, liefe die Auslieferung ohne Freigabe. Deshalb zuerst die Umgebung mit Prüfer anlegen,
  dann Werte nur dort.
- **R-GH-2 Deploy-Key mit Schreibrecht.** Wer den privaten Schlüssel auf dem Produktionsserver besitzt, kann in das
  Repository schreiben (Pushes auf ungeschützte Branches). Für den Betrieb reicht Lesen oder gar kein Git-Zugang.

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
grep -c 'deploy.sh --ssh' ~/.ssh/authorized_keys
grep -oE '^command="[^"]*"[^ ]*' ~/.ssh/authorized_keys

# V-9  Platz, Größe der Daten, Gesundheit
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
| B-3 | Betreiber (Inhaber) | Umgebung `produktion` anlegen: Required reviewers = Inhaber, Deployment branches = `main`; **danach** Variablen `DEPLOY_HOST`, `DEPLOY_USER` und Secrets `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` **nur in der Umgebung** | GitHub → Settings → Environments; [DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md) §3 | B-5 (Schlüssel erzeugt) |
| B-4 | Betreiber | Deploy-Key „srv-prod-01 dienstplaner“ prüfen: wird er gebraucht? Wenn nein: entfernen. Wenn ja: als lesend neu anlegen, alten entfernen | GitHub → Settings → Deploy keys | — |
| B-5 | Betreiber | Eigenes Schlüsselpaar nur für Deploy, Forced-Command-Zeile, Host-Schlüssel festhalten | DEPLOY-AUTOMATISIERUNG §2.4–2.6 | Skripte des Kandidaten auf dem VPS (B-9) |
| B-6 | Betreiber freigeben, Claude PR | Liste: vollen Digest für `0861adee…` nachtragen (1.1 Befund 2); Hinweis „`aktiv` ohne Label, nur `--ohne-label`“ | PR auf `deploy/FREIGEGEBENE-IMAGES.md` | Freigabe |

### 2.3 Sicherung (B-7, B-8)

| Nr | Wer | Was | Womit |
|---|---|---|---|
| B-7 | Betreiber | Speicherziele wählen und freigeben (zwei restic-Repositorys, getrennte Zugänge, Löschschutz), Aufbewahrung rechtlich entscheiden, Passwörter verwahren | INFRA-VORBEREITUNG §8 C-7, C-8, C-9, C-11 |
| B-8 | Betreiber | **Vor** dem Wechsel eine vollständige Sicherung von Hand ziehen und **auf einer Kopie** zurückspielen | Abschnitt 4 (Probe K1–K3) |

### 2.4 Kandidat und Staging (B-9 bis B-12)

| Nr | Wer | Was | Womit |
|---|---|---|---|
| B-9 | Claude (nach Merge-Freigabe) | Kandidat nach `main` bringen (Gates R1–R3), Bild bauen (`deploy.yml`, nur `bauen`), Digest, Commit, Label und Provenienz prüfen | [RELEASE-GATES-R1-R2-R3.md](RELEASE-GATES-R1-R2-R3.md), `deploy.yml` Job `bild` |
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
| Bild | `.env` `IMAGE_DIGEST` | ja (`deploy.sh` Schritt 5) | `.env.vor-deploy-<UTC>` bzw. `ruecksprung.sh` (nur auf `vorherig`) |
| Ablage | `data/` | **ja, schon beim ersten Start** (3.2) | Sicherung aus `deploy.sh` Schritt 4 mit dem Werkzeug **der neuen Fassung** und `--zustand` |
| Zustand | `zustand/` (Widerrufbücher, Schlüsselepoche, Schreibhalt) | ja, wird neu angelegt | **nie** zurückrollen (das ist Absicht); nur vereinigen (`widerrufbuch-vereinen`) |
| Sitzungen | Store `centric-sitzungen` | ja (Betreibersitzungen ohne zweiten Faktor enden) | nicht gesichert; alle melden sich neu an |
| Betriebsdateien | `compose.yml`, Skripte, Liste | bei Aktualisierung | Kopie vor dem Austausch (`*.vor-<UTC>`) |

Hinweis: `BEREITSTELLUNG.md` §3.1 sagt „Die Daten unter `/data` sind von einem Bildwechsel nie betroffen.“ Für den
Wechsel `274bfa0` → Integrationsbild stimmt das nicht mehr (3.2). Korrektur dort ist offener Punkt O-7.

### 3.2 Was das Integrationsbild beim ersten Start von selbst schreibt

Quelle: `server.mjs` (Startblock nach der Ablagesperre), `server/lib/widerrufbuch.mjs`,
`server/lib/kontowiderrufbuch.mjs`, `server/lib/schluesselepoche.mjs`. Alles läuft **vor** der ersten Anfrage.

| Nr | Was | Wohin | Wirkung auf ein Altbild (`274bfa0`) |
|---|---|---|---|
| W-1 | Ablagesperre `.prozess` (Puls alle 5 s) | `data/.prozess` | keine (Punktdatei) |
| W-2 | Schreibhalt-Kanal | `zustand/schreibhalt/` | keine |
| W-3 | **Betreibersitzungen ohne zweiten Faktor beenden** (WP-32d) | Sitzungsstore | Betreiber muss sich neu anmelden; in production nur mit eingerichtetem Faktor ([wp32d-nachweis.md](wp32d-nachweis.md)) |
| W-4 | **Widerrufbuch der Zugangscodes** anlegen, aus der Ablage einsammeln, in die Ablage nachziehen (`gesperrt`), Marken der Ersteinrichtung und Regime-Marken anlegen | `zustand/zugang-widerrufe.json`, Anker und Marken in `data/` | Altbild ignoriert Buch, Anker, Marken; wertet `gesperrt` aus → widerrufene Codes bleiben gesperrt ([ABNAHME-V4-EM6-ROLLBACK-CODES.md](ABNAHME-V4-EM6-ROLLBACK-CODES.md) §5) |
| W-5 | **Konto-Widerrufbuch** (BE-1/BE-2): einsammeln, nachziehen (Konto gesperrt, Lauf angehoben, Mitgliedschaft entzogen), Faktorpflicht, verbrauchte Wiederherstellungscodes, abgelöste Passwörter zurücksetzen | `zustand/konto-widerrufe.json`, Anker `kontowiderrufbuch:anker` und Felder in `data/` | Altbild ignoriert Buch und Anker; `passwort: null` wirkt fail-closed; 2FA fragt `274bfa0` **gar nicht** ab ([ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.1) |
| W-6 | Schlüsselepoche: Bindung erneuern, **nur wenn** schon eine Epoche existiert | `zustand/` | bei Daten aus `274bfa0` keine Epoche → nichts **[angenommen]** |
| W-7 | Löschlauf Testbetriebe (60 s nach Start, dann täglich; gab es schon in `274bfa0`) | `data/` | unumkehrbar außer per Sicherung |
| W-8 | Datenschutzlauf (neu, Vorgabe `vorschau` = nur melden) | `data/` nur bei `CENTRIC_DATENSCHUTZLAUF=an` | Prüfen: V-6 darf den Schalter nicht auf `an` zeigen, bevor das bewusst entschieden ist |
| W-9 | Speicherkern WP-48.2: neue Standvermerke als SHA-256-Präfix statt Text (bei jedem Schreibvorgang, nicht beim Start) | `data/` | Neues Bild liest alte Vermerke. Ob `274bfa0` neue Vermerke als Konflikt wertet oder neu berechnet: **[nicht belegt]** — Probe K6 |

Folge für `deploy.sh`: Ein Rücksprung mit `--bei-fehler=ruecksprung` setzt voraus, dass das neue Bild noch nichts in
`data/` geschrieben hat (`neu_geschrieben`, Spur/Takt/Punktdateien ausgenommen). W-4/W-5 schreiben Anker in `data/`.
Ein automatischer Rücksprung nach dem ersten Start ist deshalb **wahrscheinlich immer verweigert** → R0
**[angenommen, K4 belegt es]**. Heute gibt es ohnehin kein `vorherig`.

### 3.3 Warum es für den ersten Wechsel kein Bild-Rücksprungziel gibt

- `f03a8514…` und `0861adee…` sind gesperrt (Liste und fest in `deploy/freigabe-lib.sh`).
- `274bfa0` hat **keinen zweiten Faktor**, kennt `ersetztDurch` nicht und ignoriert die Widerrufbücher. Nach
  Einführung der 2FA-Pflicht ist es als `vorherig` nur mit schriftlicher Risikoannahme zulässig
  ([ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.1, [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §5).
- `274bfa0` hat kein Revisionslabel (1.1 Befund 3).

Deshalb gilt für den **ersten** Wechsel: Bildseitig nur R0 oder Vorwärts-Reparatur. Ab dem **zweiten** Wechsel kann
das erste Integrationsbild `vorherig` sein (es hat 2FA, Bücher, Label).

### 3.4 Szenarien

| Nr | Lage | Sofort | Daten | Danach | Freigabe |
|---|---|---|---|---|---|
| S-1 | Start scheitert (nicht healthy, Smoke rot, XFF-Warnung, Manifestabgleich rot) — noch kein Nutzerverkehr | `deploy.sh` macht R0 selbst (Exit 1; bei Exit 8 **von Hand** `./abschalten.sh`) | W-1…W-6 sind evtl. geschrieben. Für einen Neustart mit demselben oder einem reparierten Kandidaten: nichts tun (Bücher und Anker gehören zur neuen Fassung). | Vorwärts-Reparatur (3.5) | R0: keine; neuer Kandidat: Liste + Wechsel |
| S-2 | Läuft, aber fachlicher Fehler ohne Datenschaden und ohne Datenschutzfolge | Dienst weiterlaufen lassen **oder** R0, je nach Schwere (Entscheidungsbaum 3.6) | unverändert lassen | Vorwärts-Reparatur | Betreiber |
| S-3 | Datenschutz- oder Sicherheitsbefund am neuen Bild (z. B. Rechte rollenübergreifend) | **sofort R0**, Bildzeile `gesperrt` | unverändert lassen, Kopie für Analyse | Vorwärts-Reparatur; Vorfallprüfung (Art. 33 DSGVO) wie BE1-BE3 §4.4 Schritt 8 | Betreiber |
| S-4 | Datenschaden durch das neue Bild (Raum 503 `BESTAND_UNLESBAR`, Bestände fehlen) | R0 | Weg B oder C nach [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md): Sicherung aus `deploy-sicherungen/` (Schritt 4) mit dem **Werkzeug der neuen Fassung** und `--zustand`; Checkliste [ENTSCHEIDUNG-BE1-BE3.md](ENTSCHEIDUNG-BE1-BE3.md) §4.4 vollständig | Start mit **repariertem** Kandidaten; nie mit dem schadhaften | Vier-Augen-Vermerk |
| S-5 | Notbetrieb auf `274bfa0` gewünscht (Dienst muss laufen, Kandidat nicht reparierbar) | R0 | Datenrücksprung wie S-4 auf den Stand vor dem Wechsel; Bücher über `--zustand` in die Ablage nachziehen | Start `274bfa0` **ohne 2FA** — nur mit schriftlicher Risikoannahme (O-1) | Betreiber, schriftlich |
| S-6 | Hostverlust | — | Weg D (restic) + `widerrufbuch-vereinen` aus der BE-3-Kopie | wie S-4 | Betreiber |

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
   - wiederholt unhealthy (> 3 Neustarts / h) → R0 → S-1
   - fachlicher Fehler → S-2 (Vorwärts-Reparatur), Dienst läuft weiter
  Datenrücksprung nur bei Datenschaden (S-4) oder Vorfall (S-3) — nie wegen eines fachlichen Fehlers.

Nach T0+24 h: Wechsel abgeschlossen. Sicherung außer Haus muss laufen (B-7), sonst kein Go für den nächsten Wechsel.
```

### 3.7 Reihenfolge eines Wechsels (Ablauf am Wechseltag)

1. Freigabe-Checkliste (Abschnitt 5) vollständig, Wartungsfenster angekündigt.
2. V-1…V-9 erneut (Stand des Tages); Ergebnis protokollieren.
3. Betriebsdateien des Kandidaten auf den VPS (Kopie der alten mit Zeitstempel daneben): `compose.yml`,
   `FREIGEGEBENE-IMAGES.md`, `deploy.sh`, `freigabe-lib.sh`, `digest-pruefen.sh`, `ruecksprung.sh`, `abschalten.sh`,
   `deploy-smoke.mjs`, `deploy-abgleich.mjs`.
4. `.env` ergänzen: fehlende Schlüssel aus V-6 (mindestens `CENTRIC_VERTRAUTE_PROXYS`; Mail/Push nach
   `BEREITSTELLUNG.md` Schritt 2); Kopie `.env.vor-<UTC>` vorher.
5. `install -d -m 700 -o 1000 -g 1000 zustand` (falls V-5 „fehlt“).
6. Sicherung von Hand **zusätzlich** zu `deploy.sh` Schritt 4: `ablage-sicherung.mjs sichern` außer Haus kopieren
   (B-8).
7. `./deploy.sh sha256:<kandidat> --trocken` → Plan lesen.
8. `./deploy.sh sha256:<kandidat>` (von Hand oder über `deploy.yml` mit Freigabe in `produktion`).
9. Phase 2 nach 3.6; Go/No-Go mit Uhrzeit protokollieren.
10. Liste nachziehen (falls nicht vorher geschehen) und Abschluss in `betrieb-protokoll.log`.

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
| K0 | Freigabe, Umgebung ohne Netz zur Produktion, leeres `zustand/` (uid 1000) | Vermerk |
| K1 | Kopie prüfen: `ablage-sicherung.mjs pruefen --sicherung <kopie>` (im Kandidatenbild, ohne Netz) | „In Ordnung: N Dateien“ |
| K2 | `274bfa0` per Digest auf der Kopie starten, `deploy/sicherung/hilfen/bestaende-zaehlen.mjs`, Anmeldung Testzugang | Ausgangszahlen |
| K3 | Stop; `ablage-sicherung.mjs sichern` = Stand **S0**; Zeit messen | Dauer = Grundlage für Zeitgrenzen |
| K4 | **Kandidat** auf derselben Kopie starten (wie `deploy.sh`), Startprotokoll sichern, dann `deploy-abgleich.mjs` gegen S0 | Belegt W-1…W-9: Liste geänderter Dateien und Zählerzeilen. Ersetzt die **[angenommen]**-Stellen in 3.2 |
| K5 | Fachprobe: Betreiber richtet 2FA ein; Code widerrufen; Passwort eines Testkontos ändern; 2FA für ein Testkonto; Plan speichern | alles 200/403 wie erwartet |
| K6 | **Bild-Rücksprung ohne Datenrücksprung:** Stop, `274bfa0` auf den veränderten Daten starten | startet? widerrufener Code 403? Plan lesen und speichern ohne Konflikt (W-9)? 2FA wird **nicht** abgefragt (erwarteter Befund, dokumentiert) |
| K7 | **Datenrücksprung:** Stop; S0 mit dem **Kandidaten-Werkzeug** `wiederherstellen --ersetzen --zustand <kopie von zustand>` | Ausgabe „Widerrufbuch: n …“ und Konto-Zahlen > 0 |
| K8 | Kandidat einmal starten (BE1-BE3 §4.4 Schritt 5), dann wahlweise `274bfa0` | Code aus K5 bleibt 403; Passwort aus K5 zurückgesetzt; 2FA-Konto aus K5 403 (`faktorGesperrt`) |
| K9 | Hostverlust: `zustand/` leer, `widerrufbuch-vereinen` aus Kopie | Bücher vollständig, `/gesund` ok |
| K10 | restic: `sicherung-ausser-haus.sh` + `wiederherstellung-probe.sh` gegen lokales Repository; BE-3-Job dreimal + `widerrufbuch-probe.sh` | `probe-status.json` `ergebnis` ok, `abweichend`/`fehlend` 0; Gegenprobe „erkannt“ |
| K11 | Kopie und Repositorys löschen | Löschvermerk |

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
| F-3 | Kandidatenbild gebaut; Digest, Label = Commit, Provenienz `vcs.revision` = Commit | `deploy.yml` Lauf, Abschnitt 1.3 | offen (kein Bild) |
| F-4 | Staging-Abnahme per Digest bestanden | STAGING-PLAN-V4 §9 | offen |
| F-5 | Restore-Probe K0–K11 bestanden | Bericht Abschnitt 4 | offen |
| F-6 | Sicherung außer Haus läuft, erster Restore belegt (Ablage **und** Widerrufbücher) | `probe-status.json`, `widerrufbuch-probe-status.json` | offen |
| F-7 | Umgebung `produktion` mit Prüfer; Werte nur dort; keine Repository-Werte | `gh api …/environments` | offen |
| F-8 | Deploy-Key mit Schreibrecht geklärt (B-4) | Einstellungen | offen |
| F-9 | `.env` hat alle Pflichtschlüssel; `CENTRIC_DATENSCHUTZLAUF` bewusst gesetzt | V-6 | offen |
| F-10 | `zustand/` vorhanden, uid 1000, Modus 700 | V-5 | offen |
| F-11 | Betreiber-2FA-Einrichtung vorbereitet (Authenticator, Ablage der Wiederherstellungscodes) | wp32d-nachweis | offen |
| F-12 | Listenzeile für den Kandidaten `aktiv`; `274bfa0` **nicht** `vorherig` (oder O-1 entschieden) | PR auf die Liste | offen |
| F-13 | Wartungsfenster, Ansprechpartner, Entscheidungsbaum 3.6 bestätigt | Vermerk | offen |
| F-14 | Ausdrückliche Produktionsfreigabe des Betreibers | schriftlich | offen |

---

## 6. Offene Entscheidungen

| Nr | Frage | Optionen | Empfehlung |
|---|---|---|---|
| O-1 | Darf `274bfa0` im Notfall laufen (ohne 2FA)? | a) nie — nur R0 und Vorwärts-Reparatur; b) nur mit schriftlicher Risikoannahme, befristet | a |
| O-2 | Wie wird ausgeliefert? | a) von Hand mit `deploy.sh`; b) `deploy.yml`/`vps` mit Freigabe | erster Wechsel a (Betreiber sieht jede Ausgabe), danach b |
| O-3 | Zeitgrenzen 15 min / 60 min / 24 h (3.6) | bestätigen oder ändern | bestätigen, nach K3/K7-Messung prüfen |
| O-4 | Kopie echter Produktionsdaten für die Probe? | a) ja, mit Freigabe und Löschnachweis; b) nur synthetisch | a für K4/K6 (nur echte Daten zeigen den echten ersten Start) |
| O-5 | Deploy-Key „srv-prod-01 dienstplaner“ | entfernen; lesend neu; so lassen | entfernen, wenn V-7/V-8 keinen Git-Bedarf zeigen |
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
