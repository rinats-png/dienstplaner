#!/bin/bash
# Gemeinsame Teile von website-ausliefern.sh und website-zurueck.sh. Wird nur eingebunden (source).
#
# Grundsatz: Die Skripte fassen auf dem Host genau zwei Dinge an:
#   1. die Datei  $SITES_DIR_HOST/centric-dienstplanung.de.caddy   (eigene Site-Datei)
#   2. das Verzeichnis $WEB_DIR_HOST  (releases/, aktuell, sicherung/)
# Die App-Site-Datei (app.centric-dienstplanung.de.caddy) und alle anderen Dateien
# in $SITES_DIR_HOST werden nie veraendert; sie werden nur zur Sicherung kopiert.

# --- Einstellungen (am Kopf; per Umgebungsvariable ueberschreibbar) ---
CADDY_CONTAINER="${CADDY_CONTAINER:-}"       # Name des Caddy-Containers (docker ps)
SITES_DIR_HOST="${SITES_DIR_HOST:-}"         # Host-Pfad, der im Container als /etc/caddy/sites liegt
WEB_DIR_HOST="${WEB_DIR_HOST:-}"             # Host-Verzeichnis, das im Container als WEB_ROOT_CONTAINER liegt
WEB_ROOT_CONTAINER="${WEB_ROOT_CONTAINER:-/srv/centric-website}"
SITES_DIR_CONTAINER="${SITES_DIR_CONTAINER:-/etc/caddy/sites}"
CADDYFILE_CONTAINER="${CADDYFILE_CONTAINER:-/etc/caddy/Caddyfile}"
HAUPT_HOST="${HAUPT_HOST:-centric-dienstplanung.de}"
APP_HOST="${APP_HOST:-app.centric-dienstplanung.de}"
GEGENPROBE_VERSUCHE="${GEGENPROBE_VERSUCHE:-12}"
GEGENPROBE_PAUSE="${GEGENPROBE_PAUSE:-5}"

SITE_DATEI="$HAUPT_HOST.caddy"               # die EINZIGE Site-Datei, die diese Skripte schreiben
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

meldung() { echo "$*"; }
fehler_ende() { echo "FEHLER: $*" >&2; exit 1; }

einstellungen_pruefen() {
  [ -n "$CADDY_CONTAINER" ] || fehler_ende "CADDY_CONTAINER ist leer (Name aus 'docker ps')."
  [[ "$CADDY_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || fehler_ende "CADDY_CONTAINER enthaelt unzulaessige Zeichen."
  local v
  for v in SITES_DIR_HOST WEB_DIR_HOST; do
    local w="${!v}"
    [ -n "$w" ] || fehler_ende "$v ist leer."
    [[ "$w" == /* ]] || fehler_ende "$v muss ein absoluter Pfad sein: $w"
    [[ "$w" =~ ^[A-Za-z0-9_./-]+$ ]] || fehler_ende "$v enthaelt Leerzeichen oder Sonderzeichen: $w"
    [ -d "$w" ] || fehler_ende "$v existiert nicht als Verzeichnis: $w"
  done
  SITES_DIR_HOST="${SITES_DIR_HOST%/}"; WEB_DIR_HOST="${WEB_DIR_HOST%/}"
  [ "$SITES_DIR_HOST" != "$WEB_DIR_HOST" ] || fehler_ende "SITES_DIR_HOST und WEB_DIR_HOST duerfen nicht gleich sein."
  [[ "$WEB_ROOT_CONTAINER" =~ ^/[A-Za-z0-9_./-]+$ ]] || fehler_ende "WEB_ROOT_CONTAINER ungueltig: $WEB_ROOT_CONTAINER"
  WEB_ROOT_CONTAINER="${WEB_ROOT_CONTAINER%/}"
  [[ "$GEGENPROBE_VERSUCHE" =~ ^[0-9]+$ && "$GEGENPROBE_PAUSE" =~ ^[0-9]+$ ]] || fehler_ende "GEGENPROBE_* muessen Zahlen sein."
  [ "$SITE_DATEI" != "$APP_HOST.caddy" ] || fehler_ende "Eigene Datei und App-Datei waeren gleich."
  command -v docker >/dev/null 2>&1 || fehler_ende "docker nicht gefunden."
  command -v curl >/dev/null 2>&1 || fehler_ende "curl nicht gefunden."
  [ "$(docker inspect -f '{{.State.Running}}' "$CADDY_CONTAINER" 2>/dev/null)" = "true" ] \
    || fehler_ende "Container '$CADDY_CONTAINER' laeuft nicht oder existiert nicht (docker ps)."
  # Schutz gegen einen falschen Pfad: im Sites-Ordner muss die App-Datei liegen.
  grep -qs -F "$APP_HOST" "$SITES_DIR_HOST"/*.caddy \
    || fehler_ende "In $SITES_DIR_HOST liegt keine .caddy-Datei fuer $APP_HOST - falscher SITES_DIR_HOST?"
}

caddy_im_container() { docker exec "$CADDY_CONTAINER" "$@"; }

caddy_pruefen() { caddy_im_container caddy validate --config "$CADDYFILE_CONTAINER" --adapter caddyfile; }
caddy_neu_laden() { caddy_im_container caddy reload --config "$CADDYFILE_CONTAINER" --adapter caddyfile; }

# HTTP-Statuscode direkt gegen diesen Host (127.0.0.1), mit dem Namen als SNI/Host.
http_code() {
  local c
  c="$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$1:443:127.0.0.1" "https://$1${2:-/}" 2>/dev/null || true)"
  echo "${c:-000}"
}

# Gegenprobe mit Wiederholung (Zertifikat der Hauptdomain kann einige Sekunden brauchen).
gegenprobe() {
  local i=0 h a n
  while :; do
    h="$(http_code "$HAUPT_HOST" /)"
    a="$(http_code "$APP_HOST" /)"
    n="$(http_code "$HAUPT_HOST" /gibt-es-nicht-$$)"
    meldung "  Versuch $((i + 1)): Hauptdomain $h (soll 200), App $a (soll 200), Hauptdomain/unbekannt $n (soll 404)"
    if [ "$h" = "200" ] && [ "$a" = "200" ] && [ "$n" = "404" ]; then return 0; fi
    i=$((i + 1))
    [ "$i" -lt "$GEGENPROBE_VERSUCHE" ] || return 1
    sleep "$GEGENPROBE_PAUSE"
  done
}

# Die eigene Site-Datei atomar in den Sites-Ordner legen (nur diese eine Datei).
site_datei_installieren() {
  local quelle="$1" tmp="$SITES_DIR_HOST/.$SITE_DATEI.tmp"
  cp "$quelle" "$tmp" && mv -f "$tmp" "$SITES_DIR_HOST/$SITE_DATEI"
}
site_datei_entfernen() { rm -f "$SITES_DIR_HOST/$SITE_DATEI"; }

# Link "aktuell" atomar setzen (relatives Ziel, damit er im Container aufloest).
aktuell_setzen() {
  local ziel="$1" neu="$WEB_DIR_HOST/.aktuell.neu"
  rm -f "$neu"
  ln -s "$ziel" "$neu" && mv -T "$neu" "$WEB_DIR_HOST/aktuell"
}
aktuell_entfernen() { rm -f "$WEB_DIR_HOST/aktuell"; }
aktuell_lesen() { [ -L "$WEB_DIR_HOST/aktuell" ] && readlink "$WEB_DIR_HOST/aktuell" || true; }
