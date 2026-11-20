#!/bin/bash
# =====================================================================
#  inventur.sh — LESENDE Produktionsinventur des VPS (REL-0)
#
#  Führt V-1 bis V-9 aus docs/acc45/PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md
#  §2.1 aus, dazu R-1 (Ressourcen) und R-2 (Mounts, Compose-Projektpfad).
#  Einrichtung und Sicherheitsnachweis: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md.
#
#  Ablage auf dem VPS: /usr/local/sbin/centric-inventur.sh (root:root 0755,
#  Verzeichnis root-eigen) — NICHT im Betriebsverzeichnis, das dem Konto
#  gehört.
#
#  Aufruf:
#    centric-inventur.sh            Inventur auf stdout
#    centric-inventur.sh --hilfe    Kurzhilfe
#  Als Forced Command (authorized_keys):
#    command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA… inventur-centric
#    SSH_ORIGINAL_COMMAND muss fehlen, leer oder genau „inventur“ sein.
#    Jeder andere Wert (auch scp/sftp/rsync, „inventur; id“, „INVENTUR“,
#    „inventur “) → Rückgabe 2, bevor irgendein Abschnitt läuft.
#
#  Schicht 1 (Quelle, maßgeblich): jeder Abschnitt liest nur Namen, Status,
#  Prüfsummen und Metadaten. Aus der .env nur Schlüsselnamen (env_namen),
#  nie Werte; Fehlertexte von docker compose werden verworfen, weil sie
#  .env-Zeilen enthalten können. Betriebsprotokoll nur Zeit, Skript,
#  Ereignisname. authorized_keys nur Optionen, Typ, Fingerabdruck.
#  Schicht 2 (nur zusätzlich): maskieren() über die gesamte Ausgabe.
#
#  Was das Skript NIE tut: docker pull/up/run/rm/rmi/tag/restart/stop/kill,
#  compose up/down, Dateien anlegen, ändern oder löschen. Einziger docker
#  exec: der feste /gesund-Aufruf im App-Container (V-9; /gesund legt im
#  Container die Probe data/.gesund an, siehe §2.1 V-9).
#
#  Härtung: fester PATH, BASH_ENV/ENV entfernt, umask 077, LC_ALL=C,
#  Shebang /bin/bash (kein env-Suchpfad).
#
#  Umgebung NUR für Prüfungen (sshd mit PermitUserEnvironment no und
#  AcceptEnv LANG LC_*, systemd und cron setzen sie nicht):
#    INVENTUR_PRUEFPFAD     ersetzt den festen PATH (Docker-Stub)
#    INVENTUR_MASKE=aus     schaltet Schicht 2 ab (Nachweis Schicht 1)
#    CENTRIC_VERZ          (/opt/apps/centric-dienstplanung)
#    CENTRIC_DIENST        (centric-dp-web)
#    CENTRIC_BILD_REPO     (ghcr.io/rinats-png/dienstplaner)
#    CENTRIC_KONTO_HOME    Heimatverzeichnis des Besitzers von CENTRIC_VERZ
#                          (aus getent; sonst $HOME)
#    CENTRIC_HOME_WURZEL   (/home) weitere authorized_keys (nur lesbare)
#    CENTRIC_ZEITGRENZE    (30) Sekunden je Docker-Aufruf
#
#  Rückgabe: 0 alle Abschnitte gelaufen · 1 mindestens ein Abschnitt
#  gescheitert (Ausgabe trotzdem vollständig) · 2 Aufruf/abgewiesen
#  Prüfung: pruefungen/inventur-skript.test.js
# =====================================================================
# Die Abschnittsfunktionen (v1 … r2, v_kopf) laufen nur indirekt über
# abschnitt "<name>" <funktion>; shellcheck erkennt das nicht.
# shellcheck disable=SC2329
set -euo pipefail
umask 077
export LC_ALL=C
PATH="${INVENTUR_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

# Forced Command: nur „inventur“ oder kein Befehl. Alles andere abweisen,
# bevor irgendetwas anderes geschieht.
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" && "${SSH_ORIGINAL_COMMAND}" != "inventur" ]]; then
  printf 'abgewiesen: nur der Befehl "inventur" ist erlaubt\n' >&2
  exit 2
fi

VERZ="${CENTRIC_VERZ:-/opt/apps/centric-dienstplanung}"
DIENST="${CENTRIC_DIENST:-centric-dp-web}"
BILD_REPO="${CENTRIC_BILD_REPO:-ghcr.io/rinats-png/dienstplaner}"
HOME_WURZEL="${CENTRIC_HOME_WURZEL:-/home}"
ZEITGRENZE="${CENTRIC_ZEITGRENZE:-30}"

hilfe() {
  printf '%s\n' \
    "Aufruf: $0 [--hilfe]" \
    "Lesende Produktionsinventur (V-1 bis V-9, R-1, R-2)." \
    "Als Forced Command ist nur der Befehl 'inventur' erlaubt." \
    "Anleitung: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md"
}

case "$#:${1:-}" in
  0:) ;;
  1:--hilfe | 1:-h) hilfe; exit 0 ;;
  *) hilfe >&2; exit 2 ;;
esac

[[ "$ZEITGRENZE" =~ ^[1-9][0-9]{0,2}$ ]] || ZEITGRENZE=30

# --- Hilfen -------------------------------------------------------------
hat() { command -v "$1" >/dev/null 2>&1; }

# Docker nur lesend und mit Zeitgrenze. Unterbefehle stehen ausschließlich
# in den Abschnitten unten; die Prüfung erlaubt nur eine feste Liste.
docker_lesen() {
  if hat timeout; then timeout "$ZEITGRENZE" docker "$@"; else docker "$@"; fi
}

# docker compose liest die .env. Seine Fehlertexte können .env-Zeilen
# enthalten (z. B. Syntaxfehler mit Zeileninhalt). Deshalb: stderr
# verwerfen, nur Unterbefehl und Rückgabe melden.
compose_lesen() {
  local rc=0
  docker_lesen compose "$@" 2>/dev/null || rc=$?
  if ((rc)); then
    printf 'docker compose %s fehlgeschlagen (Rückgabe %s, Fehlertext unterdrückt)\n' "$1" "$rc" >&2
    return "$rc"
  fi
}

# Schicht 1 für die .env: NUR Schlüsselnamen. Versteht „export NAME=“,
# Leerzeichen vor/nach dem Namen, CRLF, Kommentare und Werte in
# Anführungszeichen über mehrere Zeilen (Folgezeilen werden übersprungen).
# Ausgegeben wird nur, was danach wie ein Bezeichner aussieht.
env_namen() {
  [[ -f .env ]] || { printf '.env fehlt\n' >&2; return 1; }
  awk '
    { sub(/\r$/, "") }
    offen != "" { if (index($0, offen) > 0) offen = ""; next }
    {
      z = $0
      sub(/^[ \t]+/, "", z)
      sub(/^export[ \t]+/, "", z)
      if (!match(z, /^[A-Za-z_][A-Za-z0-9_]*[ \t]*=/)) next
      n = substr(z, 1, RLENGTH)
      w = substr(z, RLENGTH + 1)
      sub(/[ \t]*=$/, "", n)
      sub(/^[ \t]+/, "", w)
      q = substr(w, 1, 1)
      if ((q == "\"" || q == "\047") && index(substr(w, 2), q) == 0) offen = q
      print n
    }' .env | { grep -E '^[A-Za-z_][A-Za-z0-9_]*$' || true; } | sort -u
}

# Schicht 2 (nur zusätzlich) für JEDE Ausgabezeile.
#  - IPv4 außer 0.0.0.0 und 127.x, IPv6 (ab vier Gruppen oder mit ::)
#  - Zugangsdaten in URLs (://name:wort@), E-Mail-Adressen
#  - Schlüsselkörper (ssh-…/ecdsa-… AAAA…), PEM-Blöcke
#  - Tokens (ghp_, github_pat_, sk-ant-, xox?-, Bearer/Basic)
#  - name=Wert (jeder Bezeichner, auch klein) außer IMAGE_DIGEST/IMAGE_TAG
#    und command= (Forced-Command-Option in V-8)
#  - Werte zu Namen mit PASS/SECRET/TOKEN/KEY/… („Name: Wert“, „name=Wert“)
#  - lange Base64-Folgen (awk-Stufe unten); SHA256:-Fingerabdrücke und
#    sha256:-Digests bleiben lesbar
maskieren() {
  if [[ "${INVENTUR_MASKE:-an}" == "aus" ]]; then
    cat
    return
  fi
  sed -E \
    -e 's/-----BEGIN [A-Z ]*PRIVATE KEY-----.*/<privater-schluessel>/' \
    -e 's/-----END [A-Z ]*PRIVATE KEY-----.*/<privater-schluessel>/' \
    -e 's/\b(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+) +AAAA[A-Za-z0-9+\/=]+/\1 <schluessel>/g' \
    -e 's/\bgh[pousr]_[A-Za-z0-9]{16,}/<token>/g' \
    -e 's/\bgithub_pat_[A-Za-z0-9_]{16,}/<token>/g' \
    -e 's/\bsk-ant-[A-Za-z0-9_-]+/<token>/g' \
    -e 's/\bxox[abprs]-[A-Za-z0-9-]+/<token>/g' \
    -e 's/\b(Bearer|Basic) +[A-Za-z0-9._~+\/=-]+/\1 <token>/g' \
    -e 's#(://)[^/@[:space:]]+@#\1<zugang>@#g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/<email>/g' \
    -e 's/\b(0\.0\.0\.0)\b/__ALLE4__/g' \
    -e 's/\b127(\.[0-9]{1,3}){3}\b/__LOKAL4__/g' \
    -e 's/\b[0-9]{1,3}(\.[0-9]{1,3}){3}(\/[0-9]{1,2})?\b/<ipv4>/g' \
    -e 's/(^|[^0-9a-fA-F:])::1([^0-9a-fA-F:]|$)/\1__LOKAL6__\2/g' \
    -e 's/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{0,4}){3,7}(\/[0-9]{1,3})?/<ipv6>/g' \
    -e 's/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*::([0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*)?/<ipv6>/g' \
    -e 's/(^|[^0-9a-fA-F:<\[])::[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*(\/[0-9]{1,3})?/\1<ipv6>/g' \
    -e 's/__ALLE4__/0.0.0.0/g; s/__LOKAL4__/127.x/g; s/__LOKAL6__/::1/g' \
    -e 's/\b(IMAGE_DIGEST|IMAGE_TAG|command)=/__SCHUTZ_\1__/g' \
    -e 's/\b([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]*/\1=<maskiert>/g' \
    -e 's/__SCHUTZ_(IMAGE_DIGEST|IMAGE_TAG|command)__/\1=/g' \
    -e 's/\b([A-Za-z0-9_]*(PASS|PASSWORT|PASSWORD|SECRET|GEHEIM|TOKEN|KEY|SCHLUESSEL|PFEFFER|SALT|CREDENTIAL)[A-Za-z0-9_]*)(["'"'"']?[[:space:]]*[:=][[:space:]]*)("[^"]*"|'"'"'[^'"'"']*'"'"'|[^,;}[:space:]]+)/\1\3<maskiert>/gI' |
    awk '{
      # Base64-artige Folgen ab 32 Zeichen mit Groß-, Kleinbuchstaben und
      # Ziffer; nicht nach „SHA256:“/„sha256:“ (Fingerabdruck, Digest) und
      # nicht mit „/“ am Anfang (Pfad).
      rest = $0; aus = ""
      while (match(rest, /[A-Za-z0-9+\/=]+/)) {
        t = substr(rest, RSTART, RLENGTH)
        aus = aus substr(rest, 1, RSTART - 1)
        vor = (length(aus) >= 7) ? substr(aus, length(aus) - 6) : ""
        if (length(t) >= 32 && vor != "SHA256:" && vor != "sha256:" && substr(t, 1, 1) != "/" &&
            t ~ /[A-Z]/ && t ~ /[a-z]/ && t ~ /[0-9]/) t = "<maskiert>"
        aus = aus t
        rest = substr(rest, RSTART + RLENGTH)
      }
      print aus rest
    }'
}

FEHLER=0
GESCHEITERT=()

# Einen Abschnitt in einer Unterschale ausführen. Scheitert er, Meldung
# und weiter. Nicht in einem Bedingungskontext aufrufen (set -e muss in
# der Unterschale greifen).
abschnitt() {
  local name="$1"; shift
  printf '\n=== %s ===\n' "$name"
  set +e
  ( set -euo pipefail; "$@" ) 2>&1 | maskieren
  local st=("${PIPESTATUS[@]}")
  set -e
  if [[ "${st[0]}" -ne 0 || "${st[1]}" -ne 0 ]]; then
    printf -- '--- %s: Abschnitt gescheitert (Rückgabe %s), weiter mit dem nächsten ---\n' "$name" "${st[0]}"
    FEHLER=$((FEHLER + 1))
    GESCHEITERT+=("$name")
  fi
}

# Heimatverzeichnis des Kontos, dem das Betriebsverzeichnis gehört
# (admin, uid 1000). Gilt auch, wenn das Skript als root läuft (Phase 2).
konto_home() {
  if [[ -n "${CENTRIC_KONTO_HOME:-}" ]]; then printf '%s\n' "$CENTRIC_KONTO_HOME"; return; fi
  local besitzer zeile
  besitzer="$(stat -c '%U' "$VERZ" 2>/dev/null || true)"
  if [[ -n "$besitzer" ]] && hat getent; then
    zeile="$(getent passwd "$besitzer" || true)"
    if [[ -n "$zeile" ]]; then printf '%s\n' "$zeile" | cut -d: -f6; return; fi
  fi
  printf '%s\n' "$HOME"
}
KONTO_HOME="$(konto_home)"

# --- Abschnitte ---------------------------------------------------------
v_kopf() {
  printf 'Produktionsinventur (nur lesend)\n'
  printf 'Zeit (UTC): %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Rechner: %s\n' "$(uname -n)"
  printf 'Konto: %s (uid %s)\n' "$(id -un)" "$(id -u)"
  printf 'Betriebsverzeichnis: %s\n' "$VERZ"
  # Nachweis für restrict/no-pty/no-agent-forwarding (Negativproben N-5, N-11):
  # nur ja/nein, nie der Wert von SSH_AUTH_SOCK.
  if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then printf 'Agent-Weiterleitung: gesetzt\n'; else printf 'Agent-Weiterleitung: nicht gesetzt\n'; fi
  if [[ -t 0 ]]; then printf 'Terminal: ja\n'; else printf 'Terminal: nein\n'; fi
  printf 'Skript: '
  sha256sum "${BASH_SOURCE[0]}"
}

v1() {
  cd "$VERZ"
  compose_lesen ps
  docker_lesen inspect "$DIENST" --format '{{.Image}} {{.Config.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}ohne-health{{end}} {{.State.StartedAt}} {{.RestartCount}}'
}

v2() {
  local bild
  bild="$(docker_lesen inspect "$DIENST" --format '{{.Image}}')"
  docker_lesen image inspect --format '{{.Id}} {{json .RepoDigests}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$bild"
  docker_lesen images --digests --no-trunc "$BILD_REPO"
}

# Bildreferenz: aus der .env nur, ob IMAGE_DIGEST/IMAGE_TAG als Name
# vorkommen; die wirksame Referenz zeigt compose config (nur image:).
v3() {
  cd "$VERZ"
  printf -- '-- Schlüssel IMAGE_DIGEST/IMAGE_TAG in .env (nur Namen):\n'
  env_namen | { grep -xE 'IMAGE_DIGEST|IMAGE_TAG' || printf '(weder IMAGE_DIGEST noch IMAGE_TAG)\n'; }
  printf -- '-- docker compose config (nur image:):\n'
  compose_lesen config | grep -E '^[[:space:]]+image:'
}

v4() {
  cd "$VERZ"
  ls -la
  printf -- '-- Prüfsummen:\n'
  local f dateien=()
  for f in compose.yml FREIGEGEBENE-IMAGES.md ./*.sh ./*.mjs; do
    [[ -f "$f" ]] && dateien+=("$f")
  done
  if ((${#dateien[@]})); then sha256sum "${dateien[@]}"; else printf '(keine Betriebsdateien)\n'; fi
  printf -- '-- Versionen:\n'
  compose_lesen version
  docker_lesen version --format '{{.Server.Version}}'
}

v5() {
  cd "$VERZ"
  local d
  for d in data zustand; do
    if [[ -e "$d" ]]; then stat -c '%n %U:%G %u:%g %a' "$d"; else printf '%s fehlt\n' "$d"; fi
  done
  if [[ -d zustand ]]; then
    printf -- '-- zustand/ (nur Namen, Rechte, Größe):\n'
    ls -la zustand
  fi
}

v6() {
  cd "$VERZ"
  env_namen
}

v7() {
  if hat restic; then
    restic version
  else
    printf 'restic: nicht installiert\n'
  fi
  printf -- '-- crontab (nur Skriptnamen):\n'
  if hat crontab; then
    { crontab -l 2>/dev/null || true; } | { grep -vE '^[[:space:]]*(#|$)' || true; } | { grep -oE '[^ /]+\.sh' || true; } | sort -u
  else
    printf 'crontab: nicht vorhanden\n'
  fi
  printf -- '-- Sicherungsverzeichnisse:\n'
  local d
  for d in "$KONTO_HOME/sicherung" "$KONTO_HOME/sicherung/lokal" "$VERZ/deploy-sicherungen"; do
    if [[ -d "$d" ]]; then
      printf '%s:\n' "$d"
      find "$d" -mindepth 1 -maxdepth 1 -printf '%M %u:%g %s %TY-%Tm-%Td %f\n' | sort -k6 | head -n 40
    else
      printf '%s: fehlt\n' "$d"
    fi
  done
  printf -- '-- letzte erfolgreiche Sicherung:\n'
  if [[ -f "$KONTO_HOME/sicherung/letzte-erfolgreiche.json" ]]; then
    head -c 2000 "$KONTO_HOME/sicherung/letzte-erfolgreiche.json"
    printf '\n'
  else
    printf '(keine Datei letzte-erfolgreiche.json)\n'
  fi
}

# Nur Optionen, Zähler und Fingerabdrücke — nie den Schlüsselkörper.
v8() {
  local h f gesehen=" "
  for h in "$KONTO_HOME" "$HOME" "$HOME_WURZEL"/*; do
    f="$h/.ssh/authorized_keys"
    [[ -f "$f" && -r "$f" ]] || continue
    [[ "$gesehen" == *" $f "* ]] && continue
    gesehen+="$f "
    printf '== %s\n' "$f"
    stat -c '%U:%G %a' "$f"
    printf 'Zeilen mit Schlüssel: %s\n' "$(grep -cvE '^[[:space:]]*(#|$)' "$f" || true)"
    printf 'deploy.sh --ssh: %s\n' "$(grep -c 'deploy.sh --ssh' "$f" || true)"
    printf 'centric-inventur: %s\n' "$(grep -c 'centric-inventur' "$f" || true)"
    # je Schlüsselzeile: Optionen vor dem Typ und der Typ; Körper und Kommentar fallen weg
    sed -nE \
      -e 's/^[[:space:]]*(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)[[:space:]]+AAAA.*/Optionen: (keine) | Typ: \1/p' \
      -e 's/^[[:space:]]*(.*[^[:space:]])[[:space:]]+(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)[[:space:]]+AAAA.*/Optionen: \1 | Typ: \2/p' \
      "$f"
    if hat ssh-keygen; then
      ssh-keygen -lf "$f" || printf 'ssh-keygen: Datei nicht lesbar\n'
    fi
  done
  [[ "$gesehen" != " " ]] || printf '(keine lesbare authorized_keys)\n'
}

v9() {
  cd "$VERZ"
  df -h .
  if [[ -d data ]]; then du -sh data; else printf 'data fehlt\n'; fi
  printf -- '-- /gesund:\n'
  docker_lesen exec "$DIENST" node -e "fetch('http://127.0.0.1:3000/gesund').then(r=>r.text()).then(t=>console.log(t))" | head -c 2000
  printf '\n-- betrieb-protokoll.log (letzte 30, nur Zeit, Skript, Ereignis):\n'
  if [[ -f betrieb-protokoll.log ]]; then
    tail -n 30 betrieb-protokoll.log | awk '{
      e = $3; if (e !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) e = "?"
      z = $1; if (z !~ /^[0-9T:Z-]+$/) z = "?"
      s = $2; if (s !~ /^[A-Za-z0-9._-]+$/) s = "?"
      print z, s, e }'
  else
    printf '(kein betrieb-protokoll.log)\n'
  fi
}

r1() {
  printf 'nproc: %s\n' "$(nproc)"
  if hat uptime; then uptime; else printf 'uptime: nicht vorhanden\n'; fi
  if hat free; then free -m; else printf 'free: nicht vorhanden\n'; fi
  docker_lesen stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.MemPerc}}'
}

r2() {
  docker_lesen inspect "$DIENST" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} schreibbar:{{.RW}}{{println}}{{end}}'
  docker_lesen inspect "$DIENST" --format 'Compose-Projekt: {{index .Config.Labels "com.docker.compose.project"}} Pfad: {{index .Config.Labels "com.docker.compose.project.working_dir"}} Dateien: {{index .Config.Labels "com.docker.compose.project.config_files"}}'
}

# --- Ablauf -------------------------------------------------------------
abschnitt "Kopf" v_kopf
abschnitt "V-1 Container, Status, laufende Bild-ID" v1
abschnitt "V-2 Digest und Label des laufenden Bilds" v2
abschnitt "V-3 Bildreferenz in der Konfiguration" v3
abschnitt "V-4 Betriebsdateien und Prüfsummen" v4
abschnitt "V-5 Zustandsverzeichnis" v5
abschnitt "V-6 Schlüsselnamen der .env" v6
abschnitt "V-7 Sicherungen" v7
abschnitt "V-8 authorized_keys (nur Optionen)" v8
abschnitt "V-9 Platz und Gesundheit" v9
abschnitt "R-1 Ressourcen" r1
abschnitt "R-2 Mounts und Compose-Projektpfad" r2

printf '\n=== Ende ===\n'
if ((FEHLER)); then
  printf 'Gescheiterte Abschnitte: %s\n' "$FEHLER"
  printf -- '- %s\n' "${GESCHEITERT[@]}"
  exit 1
fi
printf 'Alle Abschnitte gelaufen.\n'
exit 0
