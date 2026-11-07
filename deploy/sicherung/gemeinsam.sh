# shellcheck shell=bash
# =====================================================================
#  Gemeinsame Teile von sicherung-ausser-haus.sh und
#  wiederherstellung-probe.sh — wird nur eingebunden, nie ausgeführt.
#
#  Konfiguration kommt ausschließlich aus einer Env-Datei (Modus 600).
#  Sie wird NICHT mit `source` ausgeführt, sondern Zeile für Zeile als
#  SCHLUESSEL=Wert gelesen; nur bekannte Schlüssel sind erlaubt.
#  Siehe docs/BETRIEB-SICHERUNG.md.
# =====================================================================

# Die folgenden Werte nutzen die einbindenden Skripte.
# shellcheck disable=SC2034
SICHERUNG_VERZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SICHERUNG_VERZ
# shellcheck disable=SC2034
readonly HILFEN_VERZ="$SICHERUNG_VERZ/hilfen"

# Exit-Codes: 0 gut, 1 Fehler, 75 läuft schon (Sperre), 78 Konfiguration.
# shellcheck disable=SC2034
readonly CODE_GESPERRT=75
readonly CODE_KONFIG=78

# Restic soll das Passwort nur aus der Datei lesen — nichts Geerbtes.
unset RESTIC_PASSWORD RESTIC_PASSWORD_COMMAND

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

abbruch_konfig() {
  log "KONFIGURATION: $*" >&2
  exit "$CODE_KONFIG"
}

# Datei muss existieren, dem ausführenden Benutzer gehören und Modus 600
# (oder 400) haben.
dateimodus_pruefen() {
  local datei="$1" was="$2" modus
  [[ -f "$datei" ]] || abbruch_konfig "$was fehlt: $datei"
  [[ -O "$datei" ]] || abbruch_konfig "$was gehört nicht dem ausführenden Benutzer: $datei"
  modus="$(stat -c '%a' "$datei")"
  case "$modus" in
    600 | 400) ;;
    *) abbruch_konfig "$was hat Modus $modus, verlangt ist 600 (chmod 600 '$datei')" ;;
  esac
}

# Erlaubte Schlüssel. Zugangsdaten für S3-kompatible Ziele (AWS_*) und
# Backblaze (B2_*) gehen nur an restic, über die Umgebung, nie als Argument.
readonly KONFIG_ERLAUBT='^(CENTRIC_PROD_IMAGE|CENTRIC_DATEN_PFAD|CENTRIC_SCHREIBHALT_PFAD|CENTRIC_ENV_DATEI|RESTIC_REPOSITORY|RESTIC_PASSWORD_FILE|RESTIC_HOST|RESTIC_BIN|RESTIC_CACHE_DIR|RESTIC_COMPRESSION|RESTIC_PACK_SIZE|DOCKER_BIN|ALARM_PING_URL|PROBE_PING_URL|LOKAL_BEHALTEN|LOKAL_ZIEL|STATUS_VERZEICHNIS|PROBE_ARBEITSORDNER|SPERRDATEI|CHECK_ANTEIL|SCHWUND_GRENZE_PROZENT|ZEITGRENZE_RESTIC|ZEITGRENZE_CONTAINER|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_DEFAULT_REGION|AWS_SESSION_TOKEN|B2_ACCOUNT_ID|B2_ACCOUNT_KEY)$'
# Nur diese gehen in die Umgebung (für restic); alles andere bleibt
# Shell-Variable — insbesondere die Ping-URLs.
readonly EXPORT_MUSTER='^(RESTIC_REPOSITORY|RESTIC_PASSWORD_FILE|RESTIC_CACHE_DIR|RESTIC_COMPRESSION|RESTIC_PACK_SIZE|AWS_[A-Z_]+|B2_[A-Z_]+)$'
# Ping-URL: http(s), nur unkritische Zeichen (kein ", \, Leerraum, ').
readonly PING_MUSTER='^https?://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
readonly ZEILE_MUSTER='^([A-Z][A-Z0-9_]*)=(.*)$'
readonly LEER_MUSTER='^[[:space:]]*(#.*)?$'
readonly DOPPELT_MUSTER='^"(.*)"$'
readonly EINFACH_MUSTER="^'(.*)'\$"

konfig_laden() {
  local datei="$1" zeile schluessel wert nr=0
  dateimodus_pruefen "$datei" "Konfigurationsdatei"
  while IFS= read -r zeile || [[ -n "$zeile" ]]; do
    nr=$((nr + 1))
    zeile="${zeile%$'\r'}"
    [[ "$zeile" =~ $LEER_MUSTER ]] && continue
    [[ "$zeile" =~ $ZEILE_MUSTER ]] || abbruch_konfig "Zeile $nr in $datei ist kein SCHLUESSEL=Wert"
    schluessel="${BASH_REMATCH[1]}"
    wert="${BASH_REMATCH[2]}"
    if [[ "$wert" =~ $DOPPELT_MUSTER || "$wert" =~ $EINFACH_MUSTER ]]; then
      wert="${BASH_REMATCH[1]}"
    fi
    case "$schluessel" in
      RESTIC_PASSWORD | RESTIC_PASSWORD_COMMAND)
        abbruch_konfig "Zeile $nr: $schluessel ist nicht erlaubt — das Passwort gehört in eine eigene Datei (RESTIC_PASSWORD_FILE)" ;;
    esac
    [[ "$schluessel" =~ $KONFIG_ERLAUBT ]] || abbruch_konfig "Zeile $nr: unbekannter Schlüssel $schluessel"
    # ~/ am Anfang wie in der Shell auflösen
    case "$wert" in \~/*) wert="$HOME/${wert#\~/}" ;; esac
    printf -v "$schluessel" '%s' "$wert"
    if [[ "$schluessel" =~ $EXPORT_MUSTER ]]; then export "${schluessel?}"; fi
  done <"$datei"

  : "${LOKAL_BEHALTEN:=2}"
  : "${STATUS_VERZEICHNIS:=$HOME/sicherung}"
  : "${LOKAL_ZIEL:=$STATUS_VERZEICHNIS/lokal}"
  : "${PROBE_ARBEITSORDNER:=$STATUS_VERZEICHNIS/probe}"
  : "${SPERRDATEI:=$STATUS_VERZEICHNIS/lauf.lock}"
  : "${RESTIC_HOST:=centric}"
  : "${RESTIC_BIN:=restic}"
  : "${DOCKER_BIN:=docker}"
  : "${CHECK_ANTEIL:=5%}"
  : "${SCHWUND_GRENZE_PROZENT:=20}"
  : "${ZEITGRENZE_RESTIC:=7200}"
  : "${ZEITGRENZE_CONTAINER:=900}"
  : "${ALARM_PING_URL:=}"
  : "${PROBE_PING_URL:=$ALARM_PING_URL}"
  export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
}

readonly BILD_MUSTER='^([a-z0-9][a-z0-9._/:-]*@)?sha256:[0-9a-f]{64}$'

konfig_pruefen() {
  local v
  for v in CENTRIC_PROD_IMAGE CENTRIC_DATEN_PFAD CENTRIC_ENV_DATEI RESTIC_REPOSITORY RESTIC_PASSWORD_FILE; do
    [[ -n "${!v:-}" ]] || abbruch_konfig "$v fehlt"
  done
  [[ "$CENTRIC_PROD_IMAGE" =~ $BILD_MUSTER ]] ||
    abbruch_konfig "CENTRIC_PROD_IMAGE muss per Digest angegeben sein (…@sha256:<64 hex>), kein Tag"
  [[ -d "$CENTRIC_DATEN_PFAD" ]] || abbruch_konfig "CENTRIC_DATEN_PFAD ist kein Verzeichnis: $CENTRIC_DATEN_PFAD"
  dateimodus_pruefen "$CENTRIC_ENV_DATEI" "CENTRIC_ENV_DATEI"
  dateimodus_pruefen "$RESTIC_PASSWORD_FILE" "RESTIC_PASSWORD_FILE"
  [[ -s "$RESTIC_PASSWORD_FILE" ]] || abbruch_konfig "RESTIC_PASSWORD_FILE ist leer"
  [[ "$LOKAL_BEHALTEN" =~ ^[1-9][0-9]*$ ]] || abbruch_konfig "LOKAL_BEHALTEN muss eine Zahl ≥ 1 sein"
  [[ "$CHECK_ANTEIL" =~ ^[0-9]+(\.[0-9]+)?%$ ]] || abbruch_konfig "CHECK_ANTEIL muss ein Prozentwert sein (z. B. 5%)"
  [[ "$SCHWUND_GRENZE_PROZENT" =~ ^[0-9]+$ && "$SCHWUND_GRENZE_PROZENT" -le 100 ]] ||
    abbruch_konfig "SCHWUND_GRENZE_PROZENT muss 0–100 sein (100 = Prüfung aus)"
  [[ "$ZEITGRENZE_RESTIC" =~ ^[1-9][0-9]*$ && "$ZEITGRENZE_CONTAINER" =~ ^[1-9][0-9]*$ ]] ||
    abbruch_konfig "ZEITGRENZE_RESTIC / ZEITGRENZE_CONTAINER müssen Sekunden ≥ 1 sein"
  local u
  for u in "$ALARM_PING_URL" "$PROBE_PING_URL"; do
    [[ -z "$u" || "$u" =~ $PING_MUSTER ]] ||
      abbruch_konfig "Ping-URL ungültig (nur http/https und Zeichen A-Z a-z 0-9 . _ ~ : / ? # @ ! \$ & ( ) * + , ; = % -)"
  done
  command -v "$RESTIC_BIN" >/dev/null || abbruch_konfig "restic nicht gefunden ($RESTIC_BIN)"
  command -v "$DOCKER_BIN" >/dev/null || abbruch_konfig "docker nicht gefunden ($DOCKER_BIN)"
  local w
  for w in flock curl timeout realpath; do
    command -v "$w" >/dev/null || abbruch_konfig "$w nicht gefunden"
  done
  # Erst prüfen, dann anlegen: kein Arbeitsordner innerhalb der Daten.
  local daten ziel
  daten="$(realpath -e "$CENTRIC_DATEN_PFAD")"
  for ziel in "$STATUS_VERZEICHNIS" "$LOKAL_ZIEL" "$PROBE_ARBEITSORDNER" "$(dirname "$SPERRDATEI")"; do
    ziel="$(realpath -m "$ziel")"
    [[ "$ziel" != "$daten" && "$ziel" != "$daten/"* ]] ||
      abbruch_konfig "$ziel liegt in CENTRIC_DATEN_PFAD oder ist es — die Sicherung würde sich selbst sichern"
  done
  mkdir -p "$STATUS_VERZEICHNIS" "$LOKAL_ZIEL" "$PROBE_ARBEITSORDNER" "$STATUS_VERZEICHNIS/log"
  chmod 700 "$STATUS_VERZEICHNIS" "$LOKAL_ZIEL" "$PROBE_ARBEITSORDNER" "$STATUS_VERZEICHNIS/log"
}

# Gefilterte Env-Datei für die Container: nur CENTRIC_PFEFFER, Anführungs-
# zeichen wie bei `docker compose` (env_file) entfernt — `docker run
# --env-file` entfernt sie nicht, sonst bekäme der Container einen anderen
# Pfeffer als der Dienst. Modus 600, im EXIT-Trap gelöscht (pfeffer_env_weg).
PFEFFER_ENV=""
pfeffer_env_anlegen() {
  local zeile wert
  zeile="$(grep -E '^[[:space:]]*(export[[:space:]]+)?CENTRIC_PFEFFER=' "$CENTRIC_ENV_DATEI" | tail -n1 || true)"
  wert="${zeile#*=}"
  wert="${wert%$'\r'}"
  if [[ "$wert" =~ $DOPPELT_MUSTER || "$wert" =~ $EINFACH_MUSTER ]]; then wert="${BASH_REMATCH[1]}"; fi
  [[ -n "$wert" ]] || { log "CENTRIC_PFEFFER fehlt in CENTRIC_ENV_DATEI — ohne Pfeffer ist keine Sicherung verwendbar"; return 1; }
  PFEFFER_ENV="$(mktemp "$STATUS_VERZEICHNIS/.pfeffer-XXXXXX")"
  chmod 600 "$PFEFFER_ENV"
  printf 'CENTRIC_PFEFFER=%s\n' "$wert" >"$PFEFFER_ENV"
}
pfeffer_env_weg() {
  if [[ -n "$PFEFFER_ENV" ]]; then rm -f -- "$PFEFFER_ENV"; fi
  PFEFFER_ENV=""
}

# restic mit Zeitgrenze. Exit 124 = Zeitüberschreitung (wird gemeldet).
restic_lauf() {
  local rc=0
  timeout --kill-after=60 "$ZEITGRENZE_RESTIC" "$RESTIC_BIN" "$@" || rc=$?
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then
    log "ZEITÜBERSCHREITUNG: restic $1 nach $ZEITGRENZE_RESTIC s abgebrochen" >&2
  fi
  return "$rc"
}

# docker mit Zeitgrenze (für kurze Aufrufe wie exec/inspect).
docker_lauf() {
  local rc=0
  timeout --kill-after=60 "$ZEITGRENZE_CONTAINER" "$DOCKER_BIN" "$@" || rc=$?
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then
    log "ZEITÜBERSCHREITUNG: docker $1 nach $ZEITGRENZE_CONTAINER s abgebrochen" >&2
  fi
  return "$rc"
}

# Doppellauf verhindern. Die Sperre gilt für Sicherung UND Probe (beide
# greifen auf dasselbe Repository zu; `forget --prune` braucht es exklusiv).
sperre_nehmen() {
  mkdir -p "$(dirname "$SPERRDATEI")"
  exec 9>>"$SPERRDATEI"
  if ! flock -n 9; then
    log "Ein anderer Lauf hält die Sperre $SPERRDATEI — dieser Lauf wird abgewiesen."
    return 1
  fi
}

# Ping an den Totmannschalter (Healthchecks.io-kompatibel: <URL>, <URL>/fail,
# <URL>/start). Die URL ist ein Geheimnis: Sie geht über curl -K - (stdin)
# hinein, steht also weder im Log noch in der Prozessliste.
ping_senden() {
  local basis="$1" anhang="$2" text="${3:-}"
  [[ -n "$basis" ]] || return 0
  [[ "$basis" =~ $PING_MUSTER ]] || { log "WARNUNG: Ping-URL ungültig — kein Ping"; return 1; }
  local url="${basis%/}$anhang"
  if printf 'url = "%s"\n' "$url" |
    curl -fsS -m 10 --retry 3 --retry-delay 2 -o /dev/null -K - --data-raw "$text"; then
    log "Ping gesendet (${anhang:-erfolg})"
  else
    log "WARNUNG: Ping (${anhang:-erfolg}) nicht angekommen"
    return 1
  fi
}

# Ein Container aus dem Produktionsbild: kein Netz, Wurzel read-only, keine
# Capabilities, unter der eigenen uid (= admin = 1000 = node im Bild).
# Aufruf: im_bild [docker-Optionen …] -- <node-Argumente …>
#
# Zeitgrenze ZEITGRENZE_CONTAINER; läuft sie ab, wird der Container (er hat
# einen eigenen Namen) zwangsweise entfernt — `timeout` beendet nur den
# docker-Client, nicht den Container.
IM_BILD_NR=0
im_bild() {
  local opts=() rc=0 name
  while [[ $# -gt 0 && "$1" != "--" ]]; do
    opts+=("$1")
    shift
  done
  [[ $# -gt 0 ]] && shift
  IM_BILD_NR=$((IM_BILD_NR + 1))
  name="centric-sicherung-$$-$IM_BILD_NR"
  timeout --kill-after=60 "$ZEITGRENZE_CONTAINER" \
    "$DOCKER_BIN" run --rm --name "$name" --network none --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 512m \
    --user "$(id -u):$(id -g)" --env-file "$PFEFFER_ENV" \
    "${opts[@]}" --entrypoint node "$CENTRIC_PROD_IMAGE" "$@" || rc=$?
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then
    log "ZEITÜBERSCHREITUNG: Container $name nach $ZEITGRENZE_CONTAINER s abgebrochen" >&2
    "$DOCKER_BIN" rm -fv "$name" >/dev/null 2>&1 || true
  fi
  return "$rc"
}

# Erste Zahl hinter "schluessel": in einer JSON-Zeile.
json_zahl() { grep -o "\"$1\":[0-9]*" | head -n1 | cut -d: -f2; }
json_text() { grep -o "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }

# Statusdatei atomar schreiben (Inhalt kommt als Argument, ist kein Geheimnis).
status_ablegen() {
  local datei="$1" inhalt="$2"
  printf '%s\n' "$inhalt" >"$datei.neu"
  mv -f "$datei.neu" "$datei"
}

# Ausgabe zusätzlich ins Log. Beim Beenden wird tee abgewartet, damit die
# letzten Zeilen (Fehlerschritt, Ping) sicher in Log und Aufrufer landen.
TEE_PID=""
log_umleiten() {
  exec > >(tee -a "$1") 2>&1
  TEE_PID=$!
}
log_abschliessen() {
  if [[ -n "$TEE_PID" ]]; then
    exec 1>&- 2>&-
    wait "$TEE_PID" 2>/dev/null || true
  fi
}

# Alte Logdateien (älter als 60 Tage) entfernen.
# cron.log (Umleitung aus der Crontab) auf die letzten 5000 Zeilen kürzen,
# sobald es 1 MiB übersteigt.
logs_ausduennen() {
  find "$STATUS_VERZEICHNIS/log" -maxdepth 1 -type f -name '*.log' -mtime +60 -delete 2>/dev/null || true
  local cron="$STATUS_VERZEICHNIS/cron.log"
  if [[ -f "$cron" && "$(stat -c %s "$cron")" -gt 1048576 ]]; then
    tail -n 5000 "$cron" >"$cron.kurz" && cat "$cron.kurz" >"$cron"
    rm -f "$cron.kurz"
  fi
}
