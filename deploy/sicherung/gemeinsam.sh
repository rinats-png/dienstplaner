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
readonly KONFIG_ERLAUBT='^(CENTRIC_PROD_IMAGE|CENTRIC_DATEN_PFAD|CENTRIC_ENV_DATEI|RESTIC_REPOSITORY|RESTIC_PASSWORD_FILE|RESTIC_HOST|RESTIC_BIN|RESTIC_CACHE_DIR|RESTIC_COMPRESSION|RESTIC_PACK_SIZE|ALARM_PING_URL|PROBE_PING_URL|LOKAL_BEHALTEN|LOKAL_ZIEL|STATUS_VERZEICHNIS|PROBE_ARBEITSORDNER|SPERRDATEI|CHECK_ANTEIL|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_DEFAULT_REGION|AWS_SESSION_TOKEN|B2_ACCOUNT_ID|B2_ACCOUNT_KEY)$'
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
    export "$schluessel=$wert"
  done <"$datei"

  : "${LOKAL_BEHALTEN:=2}"
  : "${STATUS_VERZEICHNIS:=$HOME/sicherung}"
  : "${LOKAL_ZIEL:=$STATUS_VERZEICHNIS/lokal}"
  : "${PROBE_ARBEITSORDNER:=$STATUS_VERZEICHNIS/probe}"
  : "${SPERRDATEI:=$STATUS_VERZEICHNIS/lauf.lock}"
  : "${RESTIC_HOST:=centric}"
  : "${RESTIC_BIN:=restic}"
  : "${CHECK_ANTEIL:=5%}"
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
  local u
  for u in "$ALARM_PING_URL" "$PROBE_PING_URL"; do
    [[ -z "$u" || "$u" =~ ^https?:// ]] || abbruch_konfig "Ping-URL muss mit http:// oder https:// beginnen"
  done
  command -v "$RESTIC_BIN" >/dev/null || abbruch_konfig "restic nicht gefunden ($RESTIC_BIN)"
  command -v docker >/dev/null || abbruch_konfig "docker nicht gefunden"
  command -v flock >/dev/null || abbruch_konfig "flock nicht gefunden (util-linux)"
  command -v curl >/dev/null || abbruch_konfig "curl nicht gefunden"
  local daten ziel
  daten="$(cd "$CENTRIC_DATEN_PFAD" && pwd -P)"
  mkdir -p "$STATUS_VERZEICHNIS" "$LOKAL_ZIEL" "$PROBE_ARBEITSORDNER" "$STATUS_VERZEICHNIS/log"
  chmod 700 "$STATUS_VERZEICHNIS" "$LOKAL_ZIEL" "$PROBE_ARBEITSORDNER" "$STATUS_VERZEICHNIS/log"
  for ziel in "$STATUS_VERZEICHNIS" "$LOKAL_ZIEL" "$PROBE_ARBEITSORDNER"; do
    ziel="$(cd "$ziel" && pwd -P)"
    [[ "$ziel" != "$daten" && "$ziel" != "$daten/"* ]] ||
      abbruch_konfig "$ziel liegt innerhalb von CENTRIC_DATEN_PFAD — die Sicherung würde sich selbst sichern"
  done
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
im_bild() {
  local opts=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do
    opts+=("$1")
    shift
  done
  [[ $# -gt 0 ]] && shift
  docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 512m \
    --user "$(id -u):$(id -g)" --env-file "$CENTRIC_ENV_DATEI" \
    "${opts[@]}" --entrypoint node "$CENTRIC_PROD_IMAGE" "$@"
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
logs_ausduennen() {
  find "$STATUS_VERZEICHNIS/log" -maxdepth 1 -type f -name '*.log' -mtime +60 -delete 2>/dev/null || true
}
