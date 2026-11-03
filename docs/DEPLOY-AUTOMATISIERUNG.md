# Deploy-Automatisierung mit Freigabe (WP-31)

Stand 2026-11-03. **Nichts hiervon ist eingerichtet.** Umgebung, Variablen,
Secrets, SSH-Schlüssel und die Dateien auf dem VPS legt der Inhaber an; bis
dahin gilt BEREITSTELLUNG.md Schritt 3 (von Hand, per Digest). Dieses Paket
hatte keinen Zugriff auf VPS, Repository-Einstellungen oder Secrets.

## 1. Weg

    GitHub Actions „Auslieferung“ (workflow_dispatch)
      Eingaben: ausliefern=true, digest=sha256:…, bei_fehler=r0|ruecksprung, trocken
      → Job vps wartet auf Freigabe in der Umgebung „produktion“
      → ssh <DEPLOY_USER>@<DEPLOY_HOST> "deploy sha256:… [--trocken] --bei-fehler=…"
    VPS, authorized_keys: command="…/deploy.sh --ssh" (Forced Command)
      → deploy.sh prüft den Befehl gegen eine feste Form, dann:

| # | Schritt | Bei Fehler |
|---|---|---|
| 1 | Freigabeliste stimmig, Digest nicht gesperrt (auch eingebaute Sperren), Status aktiv/vorherig; `.env` ohne `IMAGE_TAG`, mit `CENTRIC_PFEFFER` und **`CENTRIC_VERTRAUTE_PROXYS` (Auflage B1, immer)** | Abbruch, nichts verändert |
| 2 | `docker pull` **nur** `ghcr.io/rinats-png/dienstplaner@<digest>`, falls nicht lokal; dann `digest-pruefen.sh` (Bild-ID, Revision-Label) | Abbruch, nichts verändert |
| 3 | lesende Probe: kennt das Bild `CENTRIC_VERTRAUTE_PROXYS`? (nur Vermerk; die Liste ist nach 1 ohnehin Pflicht) | — |
| 4 | `compose stop`, Ablage sichern (`werkzeug/ablage-sicherung.mjs` im neuen Bild, Daten read-only, ohne Netz) nach `deploy-sicherungen/`, Sicherung prüfen | alter Stand wird wieder gestartet, nichts gewechselt |
| 5 | `.env` kopieren (`.env.vor-deploy-<UTC>`), **nur** `IMAGE_DIGEST` ersetzen | R0 bzw. Rücksprung |
| 6 | `docker compose up -d --pull never centric-dp-web` | R0 bzw. Rücksprung |
| 7 | warten auf healthy, höchstens `CENTRIC_WARTEZEIT` (Vorgabe 150 s, **mindestens 90 s** — nach einem harten Ende des Vorgängers übernimmt die Prozesssperre erst nach bis zu ~50 s, docs/acc45/wp45-nachweis.md); laufende Bild-ID = Ziel | R0 bzw. Rücksprung |
| 8 | Smoke im Container (`deploy-smoke.mjs` per `docker exec`): `/gesund` 200; `GET`/`PUT /api/bestand` und `POST /api/stempeln` ohne Sitzung 401; Sicherheitsköpfe; Bundle lädt | R0 bzw. Rücksprung |
| 9 | Log seit dem Start ohne „WARNUNG: Anfrage mit X-Forwarded-For“ | R0 bzw. Rücksprung |
| 10 | Manifestabgleich (`deploy-abgleich.mjs`): jede gesicherte Datei unverändert vorhanden — außer `centric-spur`, `centric-takt`, `aufraeumen:*` | R0 bzw. Rücksprung |
| 11 | Protokoll `betrieb-protokoll.log` | — |

**Fehlerstrategie:** Standard **R0** (`abschalten.sh`, Dienst steht). Ein
Rücksprung (`ruecksprung.sh`) nur mit `--bei-fehler=ruecksprung` **und** nur,
wenn es einen Eintrag `vorherig` gibt, der nicht gesperrt und nicht das eben
gescheiterte Bild ist; scheitert der Rücksprung, R0. Exit 8 heißt: auch R0
nicht sicher erreicht — sofort von Hand nachsehen.

**Trockenlauf** (`--trocken` bzw. Eingabe `trocken`): Schritte 1–3 ohne Pull,
dann der Plan. Kein Stop, keine Sicherung, keine `.env`, kein Protokoll.

**Sperre (N1):** Eine zweite gleichzeitige Auslieferung bricht ab
(`flock` auf `.deploy.lock` neben `compose.yml`; ohne `flock` keine
Auslieferung).

**Fehler vor dem Wechsel (H1, M1):** Scheitert nach dem Anhalten etwas vor
dem Austausch der `.env` (Sicherung, Prüfung, `.env`-Kopie, unerwarteter
Fehler über einen ERR-Trap), wird der bisherige Stand nur dann wieder
gestartet, wenn er `digest-pruefen.sh` besteht (freigegeben, aktiv/vorherig,
nicht gesperrt). Sonst R0.

**Abgleich (M2):** verglichen wird gegen den Stand vor dem Start. Dateien,
die nach dem Start geändert oder entfernt wurden (Caddy leitet schon vor
„healthy“ weiter; der Löschlauf läuft eine Minute nach dem Start), sind eine
Warnung im Protokoll, kein R0. Hat das neue Bild schon geschrieben
(außer Spur, Takt, Punktdateien), wird ein Rücksprung verweigert — R0.

**Log (M3):** erst vollständig in eine Datei, dann durchsucht.

**Platz nach der Sicherung (WP-05 N1):** Nach der geprüften Sicherung wird der
freie Platz unter den Daten gegen dieselben Kritisch-Schwellen wie /gesund
geprüft (`CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT`/`_MB` aus der `.env`,
Vorgabe 3 % / 200 MB; dezimal erlaubt wie in /gesund, eine ungültige Angabe
bricht vor jedem Wechsel ab). Geprüft wird nach der Aufbewahrung — alte
Sicherungen sind dann entfernt, die neue bleibt. Darunter wird nicht
gewechselt: Der bisherige Stand läuft weiter (nur wenn er `digest-pruefen.sh`
besteht, sonst R0).

**Aufbewahrung und Platz (N4):** Vor dem Anhalten wird geprüft, dass im
Sicherungsverzeichnis mindestens das Doppelte der Daten frei ist. Nach einer
geprüften neuen Sicherung bleiben die jüngsten `CENTRIC_DEPLOY_BEHALTEN`
(Vorgabe 5) vollständigen Sicherungen, die neue immer; unvollständige
(ohne `FERTIG`) werden nicht angefasst.

**Geschützte Sicherung (WP-31b):** Am Ende jeder erfolgreichen Auslieferung
schreibt `deploy.sh` die Marke `deploy-sicherungen/.letzte-erfolgreiche` mit
dem Namen der Sicherung dieses Laufs — des Stands vor der Auslieferung. Diese
Sicherung wird nie entfernt, auch nicht, wenn danach mehrere Versuche
scheitern. Es bleiben also: die geschützte, die jüngsten
`CENTRIC_DEPLOY_BEHALTEN` vollständigen und die Sicherung des laufenden
Laufs; alles andere fällt — auch ältere Sicherungen gescheiterter Versuche,
die jünger als die geschützte sind. Reicht der Platz dadurch nicht, wechselt
`deploy.sh` nicht (Platzprüfung nach der Aufbewahrung) — dann von Hand
aufräumen, nie die geschützte. Ist die Marke unlesbar, zeigt sie auf keine
vollständige Sicherung (fehlendes `FERTIG`) oder trägt sie einen Zeitpunkt in
der Zukunft, wird gar nichts entfernt (Warnung); prüfen und die Marke von Hand
auf die richtige Sicherung setzen.

**Datenkonsistenz:** Gesichert wird nach dem Anhalten, damit Sicherung und
Abgleich denselben Stand sehen. Die Auszeit ist damit Sicherung + Start
(Größenordnung Sekunden bis gut eine Minute). Die Sicherungen unter
`deploy-sicherungen/` hält deploy.sh nach der Regel oben klein; sie sind der
Rückweg für die Daten (zusätzlich ggf. in die Sicherung außer Haus, WP-04,
aufnehmen).

## 2. Auf dem VPS einrichten (Inhaber)

1. Dateien neben `compose.yml` nach `/opt/apps/centric-dienstplanung/`
   kopieren (wie die übrigen Betriebsskripte):
   `deploy.sh`, `deploy-smoke.mjs`, `deploy-abgleich.mjs`
   (dazu wie bisher `freigabe-lib.sh`, `digest-pruefen.sh`, `ruecksprung.sh`,
   `abschalten.sh`, `FREIGEGEBENE-IMAGES.md`). `chmod 750 deploy.sh`.
2. `.env`: `CENTRIC_VERTRAUTE_PROXYS` setzen — **nur Caddys feste Adresse**
   im Netz `proxy` (Caddy-Compose: `ipv4_address`), nicht das ganze Netz;
   siehe docs/CADDY-UND-XFF.md, Abschnitt 7.
3. Probe von Hand: `./deploy.sh <aktiver digest> --trocken`.
4. Schlüsselpaar nur für diesen Zweck erzeugen (nicht auf dem VPS):
   `ssh-keygen -t ed25519 -N '' -C deploy@github-actions -f deploy_ed25519`
5. In `~/.ssh/authorized_keys` **des Kontos, dem
   `/opt/apps/centric-dienstplanung` und `data/` gehören** (admin, uid 1000 —
   deploy.sh läuft ohne sudo und muss die Daten read-only sichern können;
   ein eigenes Konto `deploy` bräuchte dieselbe uid oder Docker-Gruppe *und*
   Lesezugriff auf `data/`, was die Trennung aufhebt) genau diese Zeile:

        command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 AAAA…(deploy_ed25519.pub)… deploy@github-actions

   `restrict` schaltet PTY, Weiterleitungen, Agent und X11 ab. Optional
   zusätzlich `from="<GitHub-Actions-Bereich>"` — die Adressen der
   GitHub-Runner wechseln; ohne eigenen Runner ist das kaum pflegbar.
   Hinweis: Wer in der Docker-Gruppe ist, ist faktisch root. Der Forced
   Command ist die eigentliche Grenze; er lässt nur
   `deploy sha256:<64 hex> [--trocken] [--bei-fehler=r0|ruecksprung]` zu.
6. Host-Schlüssel für GitHub festhalten:
   `ssh-keyscan -t ed25519 <host>` — Ausgabe mit dem Fingerabdruck auf dem VPS
   (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) vergleichen.

## 3. In GitHub einrichten (Inhaber, Repository-Einstellungen)

**Umgebung `produktion`** (Settings → Environments → New environment):

- Required reviewers: der Inhaber (mindestens eine Person). „Prevent
  self-review“ nur, wenn es eine zweite Person gibt.
- Deployment branches and tags: „Selected branches“ → `main`.
- Wait timer: optional.

**Variablen der Umgebung** (nicht geheim):

| Name | Wert |
|---|---|
| `DEPLOY_HOST` | Name oder Adresse des VPS |
| `DEPLOY_USER` | das Konto aus 2.5 (admin) |

**Secrets der Umgebung** (nicht Repository-weit):

| Name | Inhalt |
|---|---|
| `DEPLOY_SSH_KEY` | privater Schlüssel `deploy_ed25519` |
| `DEPLOY_KNOWN_HOSTS` | Zeile(n) aus `ssh-keyscan` (2.6) |

Achtung (Review N3): Variablen und Secrets der Umgebung haben Vorrang, aber
FEHLT ein Wert in der Umgebung, greift GitHub auf einen gleichnamigen Wert
auf Repository-Ebene zurück. Eine alte Repository-Variable `DEPLOY_HOST`
oder ein altes Repository-Secret `DEPLOY_SSH_KEY` würde also still
mitbenutzt. Empfehlung: diese Werte auf Repository-Ebene **löschen**, damit
nur die Umgebung `produktion` sie hält.

Der Job `vps` läuft nur von `main` (`github.ref == 'refs/heads/main'`) und hat
nur `contents: read`.

## 4. Ablauf einer Auslieferung

1. Bild bauen (Auslieferung mit `bauen`), abnehmen, Digest in
   `FREIGEGEBENE-IMAGES.md` als `aktiv` (bisheriges → `vorherig`) eintragen,
   die Liste auf den VPS kopieren.
2. Auslieferung starten: `bauen` aus, `ausliefern` an, `digest`, erst
   `trocken` an. Freigabe in der Umgebung erteilen. Log lesen.
3. Dasselbe ohne `trocken`. Bei Fehler steht der Dienst (R0) — Ursache klären,
   dann bewusst `ruecksprung.sh` oder neuer Lauf.

## 5. Netlify

Die Anwendung hat Netlify im September 2026 verlassen (Commit 1a56988:
Funktionen, Ablage und Konfiguration auf den eigenen Server; kein
`netlify.toml` mehr). Netlify ist **kein** Teil des Auslieferungswegs, und
`pruefungen/post.test.js` stellt sicher, dass keine Adresse auf Netlify zeigt.
Die frühere Netlify-Site gilt als gestoppt; dieses Paket konnte das Konto
nicht einsehen.

Empfehlung (Inhaber): Die Site nicht nur stoppen, sondern löschen oder
mindestens die Verbindung zum GitHub-Repository und alle Build-Hooks
entfernen — sonst kann ein Push oder ein Pull Request dort wieder einen
Stand bauen und unter einer `*.netlify.app`-Adresse veröffentlichen, mit
alter Oberfläche und ohne den Datenschutz des Servers. Danach prüfen, dass
kein DNS-Eintrag mehr auf Netlify zeigt.

## 6. Prüfungen

`pruefungen/deploy-automatik.test.js` (CI: „Betrieb: Deploy-Skripte“, Job
`skripte`) gegen einen Docker-Stub: Erfolg mit Reihenfolge der Schritte;
genau ein Pull per Digest; nicht healthy → R0; Smoke-Fehler → R0;
XFF-Warnung im Log → R0; Abgleich weicht ab → R0; Rücksprung nur mit Schalter
und Ziel; gesperrter und nicht freigegebener Digest, Tag statt Digest;
Trockenlauf ohne Wirkung; leere Proxy-Liste → Abbruch vor jedem Wechsel (B1);
Sicherung scheitert → alter Stand läuft; Wartezeit < 90 s abgelehnt;
`IMAGE_DIGEST` in der Shell; Forced Command lässt nur die feste Form zu.
Dazu `deploy-smoke.mjs` gegen den echten `server.mjs` und
`deploy-abgleich.mjs` gegen eine echte Sicherung.
