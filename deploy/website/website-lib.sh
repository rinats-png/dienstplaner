#!/bin/bash
# Gemeinsame Teile von website-ausliefern.sh, website-zurueck.sh und website-vorpruefung.sh.
# Wird nur eingebunden (source).
#
# Grundsatz: Die Skripte schreiben in $SITES_DIR_HOST AUSSCHLIESSLICH
#   1. die Datei  centric-dienstplanung.de.caddy   (eigene Site-Datei; dazu kurz die Punktdatei
#      .centric-dienstplanung.de.caddy.tmp, die per mv ersetzt wird und nie als *.caddy gilt)
#   2. das Unterverzeichnis $WEB_DIR_HOST  (Vorgabe: $SITES_DIR_HOST/centric-website mit releases/,
#      aktuell, sicherung/)
# Alle anderen Dateien in $SITES_DIR_HOST (insbesondere app.centric-dienstplanung.de.caddy) werden nur
# gelesen/kopiert, nie veraendert. Der Caddyfile importiert "sites/*.caddy": der Stern erfasst nur
# direkte Kinder, die Kopien unter $WEB_DIR_HOST/sicherung/<stempel>/ werden also nicht mitgeladen.

# --- Einstellungen (am Kopf; Vorgaben = vom Betreiber bestaetigter VPS-Stand; jeweils per
#     Umgebungsvariable ueberschreibbar) ---
CADDY_CONTAINER="${CADDY_CONTAINER:-caddy}"                      # Name des Caddy-Containers (docker ps)
SITES_DIR_HOST="${SITES_DIR_HOST:-/opt/proxy/sites}"             # Host-Pfad, der im Container als /etc/caddy/sites liegt
SITES_DIR_HOST="${SITES_DIR_HOST%/}"
SITES_DIR_CONTAINER="${SITES_DIR_CONTAINER:-/etc/caddy/sites}"
CADDYFILE_CONTAINER="${CADDYFILE_CONTAINER:-/etc/caddy/Caddyfile}"
WEB_DIR_HOST="${WEB_DIR_HOST:-$SITES_DIR_HOST/centric-website}"  # Host-Verzeichnis fuer releases/, aktuell, sicherung/
WEB_DIR_HOST="${WEB_DIR_HOST%/}"
if [ -z "${WEB_ROOT_CONTAINER:-}" ]; then
  # Liegt WEB_DIR_HOST innerhalb von SITES_DIR_HOST, sieht der Container es ohne weiteren Mount darunter
  # (Vorgabe: /etc/caddy/sites/centric-website). Sonst der alte Wert.
  case "$WEB_DIR_HOST" in
    "$SITES_DIR_HOST"/?*) WEB_ROOT_CONTAINER="$SITES_DIR_CONTAINER/${WEB_DIR_HOST#"$SITES_DIR_HOST"/}" ;;
    *) WEB_ROOT_CONTAINER="/srv/centric-website" ;;
  esac
fi
HAUPT_HOST="${HAUPT_HOST:-centric-dienstplanung.de}"
APP_HOST="${APP_HOST:-app.centric-dienstplanung.de}"
GEGENPROBE_VERSUCHE="${GEGENPROBE_VERSUCHE:-12}"
GEGENPROBE_PAUSE="${GEGENPROBE_PAUSE:-5}"
PLATZ_RESERVE_KB="${PLATZ_RESERVE_KB:-51200}"                    # 50 MB zusaetzlich zum Dreifachen der dist-Groesse

SITE_DATEI="$HAUPT_HOST.caddy"               # die EINZIGE Site-Datei, die diese Skripte schreiben
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

meldung() { echo "$*"; }
fehler_ende() { echo "FEHLER: $*" >&2; exit 1; }
SKRIPT_NAME="$(basename "${0:-skript}")"
# B6: HAUPT_HOST/APP_HOST kommen aus der Umgebung und bilden Dateinamen (SITE_DATEI) - nur gewoehnliche
# Kleinbuchstaben-Hostnamen, nie '..', '/', Leerzeichen.
for _h in HAUPT_HOST APP_HOST; do
  _w="${!_h}"
  if ! [[ "$_w" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || [[ "$_w" == *..* ]]; then
    fehler_ende "$_h ist kein gueltiger Hostname (nur a-z, 0-9, Punkt, Bindestrich; kein '..'): $_w"
  fi
done
unset _h _w
SUDO_HINWEIS="mit 'sudo -E' ausfuehren: sudo -E ./$SKRIPT_NAME ..."

# Freier Platz in KB (df -P) fuer den Ordner, in dem geschrieben wird.
platz_frei_kb() { df -P -k "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }

caddy_im_container() { docker exec "$CADDY_CONTAINER" "$@"; }

# Gemeinsame Pruefungen. Aendert NICHTS (auch kein mkdir); das Anlegen von WEB_DIR_HOST macht
# web_dir_anlegen, erst nachdem alle Pruefungen (auch Platz) bestanden sind.
einstellungen_pruefen() {
  [ -n "$CADDY_CONTAINER" ] || fehler_ende "CADDY_CONTAINER ist leer (Name aus 'docker ps')."
  [[ "$CADDY_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || fehler_ende "CADDY_CONTAINER enthaelt unzulaessige Zeichen."
  local v w
  for v in SITES_DIR_HOST WEB_DIR_HOST; do
    w="${!v}"
    [ -n "$w" ] || fehler_ende "$v ist leer."
    [[ "$w" == /* ]] || fehler_ende "$v muss ein absoluter Pfad sein: $w"
    [[ "$w" =~ ^[A-Za-z0-9_./-]+$ ]] || fehler_ende "$v enthaelt Leerzeichen oder Sonderzeichen: $w"
    # B5: kein Pfadteil '.' oder '..', keine doppelten Schraegstriche
    if [[ "$w" =~ (^|/)\.\.?(/|$) ]] || [[ "$w" == *//* ]]; then
      fehler_ende "$v darf keine Pfadteile '.' oder '..' und keine doppelten Schraegstriche enthalten: $w"
    fi
  done
  [ -d "$SITES_DIR_HOST" ] || fehler_ende "SITES_DIR_HOST existiert nicht als Verzeichnis: $SITES_DIR_HOST"
  [ "$SITES_DIR_HOST" != "$WEB_DIR_HOST" ] || fehler_ende "SITES_DIR_HOST und WEB_DIR_HOST duerfen nicht gleich sein."
  case "$WEB_DIR_HOST" in
    *.caddy) fehler_ende "WEB_DIR_HOST darf nicht auf .caddy enden (wuerde von 'import sites/*.caddy' erfasst): $WEB_DIR_HOST" ;;
  esac
  if [ ! -d "$WEB_DIR_HOST" ]; then
    # Selbst angelegt wird nur direkt unterhalb des Sites-Ordners; anderswo muss es bereits existieren.
    case "$WEB_DIR_HOST" in
      "$SITES_DIR_HOST"/?*)
        [[ "${WEB_DIR_HOST#"$SITES_DIR_HOST"/}" != */* ]] \
          || fehler_ende "WEB_DIR_HOST muss direkt unter SITES_DIR_HOST liegen (oder bereits existieren): $WEB_DIR_HOST" ;;
      *) fehler_ende "WEB_DIR_HOST existiert nicht und liegt nicht unter SITES_DIR_HOST: $WEB_DIR_HOST" ;;
    esac
  fi
  # B5: WEB_DIR_HOST, releases und sicherung duerfen keine symbolischen Links sein (sonst landen
  # Fassungen und Sicherungen an einem unbeabsichtigten Ort).
  local d
  for d in "$WEB_DIR_HOST" "$WEB_DIR_HOST/releases" "$WEB_DIR_HOST/sicherung"; do
    [ ! -L "$d" ] || fehler_ende "$d ist ein symbolischer Link - nicht erlaubt. Nichts geaendert."
    [ ! -e "$d" ] || [ -d "$d" ] || fehler_ende "$d existiert, ist aber kein Verzeichnis. Nichts geaendert."
  done
  [[ "$WEB_ROOT_CONTAINER" =~ ^/[A-Za-z0-9_./-]+$ ]] || fehler_ende "WEB_ROOT_CONTAINER ungueltig: $WEB_ROOT_CONTAINER"
  WEB_ROOT_CONTAINER="${WEB_ROOT_CONTAINER%/}"
  [[ "$GEGENPROBE_VERSUCHE" =~ ^[0-9]+$ && "$GEGENPROBE_PAUSE" =~ ^[0-9]+$ && "$PLATZ_RESERVE_KB" =~ ^[0-9]+$ ]] \
    || fehler_ende "GEGENPROBE_* und PLATZ_RESERVE_KB muessen Zahlen sein."
  [ "$SITE_DATEI" != "$APP_HOST.caddy" ] || fehler_ende "Eigene Datei und App-Datei waeren gleich."
  command -v docker >/dev/null 2>&1 \
    || fehler_ende "docker nicht im PATH. Unter sudo: sudo -E env \"PATH=\$PATH\" ./$SKRIPT_NAME ..."
  command -v curl >/dev/null 2>&1 \
    || fehler_ende "curl nicht im PATH. Unter sudo: sudo -E env \"PATH=\$PATH\" ./$SKRIPT_NAME ..."
  [ "$(docker inspect -f '{{.State.Running}}' "$CADDY_CONTAINER" 2>/dev/null)" = "true" ] \
    || fehler_ende "Container '$CADDY_CONTAINER' laeuft nicht oder existiert nicht (docker ps; kein Docker-Zugriff? dann $SUDO_HINWEIS)."
  # Schreibrechte vorab (sonst scheitert es mittendrin).
  [ -w "$SITES_DIR_HOST" ] || fehler_ende "Kein Schreibrecht auf $SITES_DIR_HOST fuer $(id -un) - $SUDO_HINWEIS"
  if [ -d "$WEB_DIR_HOST" ] && [ ! -w "$WEB_DIR_HOST" ]; then
    fehler_ende "Kein Schreibrecht auf $WEB_DIR_HOST fuer $(id -un) - $SUDO_HINWEIS"
  fi
  # Schutz gegen einen falschen Pfad: im Sites-Ordner muss die App-Datei liegen ...
  local app_datei="" f
  for f in "$SITES_DIR_HOST"/*.caddy; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" != "$SITE_DATEI" ] || continue   # die eigene Datei erwaehnt die App nur im Kommentar
    if grep -q -s -F "$APP_HOST" "$f"; then app_datei="$f"; break; fi
  done
  [ -n "$app_datei" ] || fehler_ende "In $SITES_DIR_HOST liegt keine .caddy-Datei fuer $APP_HOST - falscher SITES_DIR_HOST?"
  # ... und der Container muss genau diese Datei unter dem Container-Pfad sehen (Zuordnung Host <-> Container).
  caddy_im_container test -f "$SITES_DIR_CONTAINER/$(basename "$app_datei")" \
    || fehler_ende "Der Container '$CADDY_CONTAINER' sieht $SITES_DIR_CONTAINER/$(basename "$app_datei") nicht - SITES_DIR_HOST ($SITES_DIR_HOST) ist nicht der eingehaengte Ordner."
}

# Importzeile des Hauptcaddyfiles belegen: ohne "import sites/*.caddy" wuerde die neue Datei nie geladen.
import_zeile_pruefen() {
  caddy_im_container grep -q -E '^[[:space:]]*import[[:space:]]+sites/\*\.caddy' "$CADDYFILE_CONTAINER" \
    || fehler_ende "In $CADDYFILE_CONTAINER (Container) steht keine Zeile 'import sites/*.caddy' - die Site-Datei wuerde nicht geladen."
}

# Platz: mindestens dist-Groesse x 3 + Reserve (Fassung + Sicherung + Luft), sonst Abbruch ohne Aenderung.
platz_pruefen() {
  local quelle="$1" kb need pfad frei
  kb="$(du -sk "$quelle" | awk '{print $1}')"
  need=$((kb * 3 + PLATZ_RESERVE_KB))
  for pfad in "$SITES_DIR_HOST" "$WEB_DIR_HOST"; do
    [ -d "$pfad" ] || continue
    frei="$(platz_frei_kb "$pfad")"
    [[ "$frei" =~ ^[0-9]+$ ]] || fehler_ende "Freien Platz fuer $pfad nicht ermittelbar (df)."
    meldung "  Platz $pfad: ${frei} KB frei, benoetigt ${need} KB (dist ${kb} KB x 3 + $((PLATZ_RESERVE_KB / 1024)) MB)"
    [ "$frei" -ge "$need" ] || fehler_ende "Zu wenig freier Platz auf $pfad (${frei} KB < ${need} KB). Nichts geaendert."
  done
}

# Legt WEB_DIR_HOST an (nur direkt unterhalb von SITES_DIR_HOST; Pruefung oben) und macht es fuer den
# Caddy-Container (anderer Benutzer) lesbar.
web_dir_anlegen() {
  if [ ! -d "$WEB_DIR_HOST" ]; then
    mkdir -p "$WEB_DIR_HOST" || fehler_ende "Konnte $WEB_DIR_HOST nicht anlegen - $SUDO_HINWEIS"
    meldung "  angelegt: $WEB_DIR_HOST"
  fi
  mkdir -p "$WEB_DIR_HOST/releases"
  chmod u=rwx,go=rx "$WEB_DIR_HOST" "$WEB_DIR_HOST/releases"
}

caddy_pruefen() { caddy_im_container caddy validate --config "$CADDYFILE_CONTAINER" --adapter caddyfile; }
caddy_neu_laden() { caddy_im_container caddy reload --config "$CADDYFILE_CONTAINER" --adapter caddyfile; }

# Belegt, dass die angepasste Gesamtkonfiguration (inkl. importierter sites/*.caddy) die Hauptdomain kennt.
caddy_kennt_hauptdomain() {
  local json
  json="$(caddy_im_container caddy adapt --config "$CADDYFILE_CONTAINER" --adapter caddyfile 2>/dev/null)" || return 1
  [[ "$json" == *"\"$HAUPT_HOST\""* ]]
}

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

# Die eigene Site-Datei atomar in den Sites-Ordner legen (nur diese eine Datei; lesbar fuer den Container).
site_datei_installieren() {
  local quelle="$1" tmp="$SITES_DIR_HOST/.$SITE_DATEI.tmp"
  # B4: Punktdatei vorher entfernen und per Noclobber (O_EXCL) neu anlegen - ein dort liegender
  # Link wird nie verfolgt (die App-Datei bleibt unberuehrt).
  rm -f "$tmp" || return 1
  ( set -C; cat "$quelle" > "$tmp" ) || return 1
  chmod u=rw,go=r "$tmp" && mv -f "$tmp" "$SITES_DIR_HOST/$SITE_DATEI"
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

# B7: Das Ziel des Links "aktuell" (aus readlink oder aus der Sicherung) wird nur akzeptiert, wenn es
# genau releases/<name> ist - nie '/', '..', mehrere Ebenen.
link_ziel_gueltig() {
  [[ "$1" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$1" != *..* ]]
}

# Site-Datei aus der Vorlage bauen: Container-Pfad ersetzen; ohne www-DNS den markierten Abschnitt
# (# WWW-BEGIN ... # WWW-ENDE) weglassen. Argumente: vorlage ziel web_root mit_www(1|0)
site_datei_bauen() {
  local vorlage="$1" ziel="$2" root="$3" www="$4"
  if [ "$www" = 1 ]; then
    sed "s#/srv/centric-website#$root#g" "$vorlage" > "$ziel"
  else
    sed -e '/^# WWW-BEGIN/,/^# WWW-ENDE/d' -e "s#/srv/centric-website#$root#g" "$vorlage" > "$ziel"
  fi
}

# Rein lesend: loest www.<Hauptdomain> per DNS auf (A oder AAAA)? Ohne getent: nein.
www_aufloesbar() {
  command -v getent >/dev/null 2>&1 && getent ahosts "www.$HAUPT_HOST" >/dev/null 2>&1
}

# Pruefkopie (B1): die NEUE Site-Datei wird gemeinsam mit Kopien aller uebrigen Site-Dateien und dem
# Hauptcaddyfile in einem Unterordner der Sicherung vom Container validiert. Der Live-Ordner
# $SITES_DIR_HOST bleibt dabei unberuehrt; erst danach wird die Datei eingespielt.
# Argumente: sicherungsordner stempel neu.caddy
site_datei_vorab_pruefen() {
  local sich="$1" stempel="$2" neu="$3" p="$1/pruef"
  mkdir -p "$p/sites" || return 1
  find "$SITES_DIR_HOST" -maxdepth 1 -type f -name '*.caddy' ! -name "$SITE_DATEI" -exec cp {} "$p/sites/" \; || return 1
  cat "$neu" > "$p/sites/$SITE_DATEI" || return 1
  caddy_im_container cat "$CADDYFILE_CONTAINER" > "$p/Caddyfile" || return 1
  # der Caddy-Container laeuft als anderer Benutzer und muss die Probekopie lesen koennen
  chmod u=rwx,go=rx "$WEB_DIR_HOST/sicherung" "$sich" || return 1
  chmod -R u=rwX,go=rX "$p" || return 1
  caddy_im_container caddy validate --config "$WEB_ROOT_CONTAINER/sicherung/$stempel/pruef/Caddyfile" --adapter caddyfile
}
