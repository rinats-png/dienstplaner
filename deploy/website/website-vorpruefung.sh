#!/bin/bash
# CENTRIC - Vorpruefung fuer die Hauptwebsite (Variante B). NUR LESEND: aendert nichts, startet nichts neu.
# Auf dem VPS:   sudo -E ./website-vorpruefung.sh
# Gleicht den Server mit dem vom Betreiber bestaetigten Stand ab (Vorgaben aus website-lib.sh):
#   Container caddy; /opt/proxy/config->/config rw; /opt/proxy/data->/data rw;
#   /opt/proxy/Caddyfile->/etc/caddy/Caddyfile ro; /opt/proxy/sites->/etc/caddy/sites ro (im Container).
# OK-Zeilen = Soll erfuellt, ABWEICHUNG = bitte melden. Gibt keine Geheimnisse aus.
set -u
SKRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=website-lib.sh
. "$SKRIPT_DIR/website-lib.sh"
[ -z "${1:-}" ] || CADDY_CONTAINER="$1"
PROXY_DIR_HOST="${PROXY_DIR_HOST:-/opt/proxy}"

ok=1
say() { echo "$*"; }
gut() { echo "  OK: $*"; }
abw() { echo "  ABWEICHUNG: $*"; ok=0; }
hinweis() { echo "  HINWEIS: $*"; }

say "== Container '$CADDY_CONTAINER'"
if [ "$(docker inspect -f '{{.State.Running}}' "$CADDY_CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "Container '$CADDY_CONTAINER' laeuft nicht oder ist nicht erreichbar (docker ps; ggf. mit sudo -E ausfuehren)."; exit 1
fi
gut "laeuft"

say "== Eingehaengte Verzeichnisse (Host-Pfad|Container-Pfad|rw/ro) gegen den bestaetigten Stand"
MOUNTS="$(docker inspect -f '{{range .Mounts}}{{.Source}}|{{.Destination}}|{{if .RW}}rw{{else}}ro{{end}}{{println}}{{end}}' "$CADDY_CONTAINER" 2>/dev/null | sed '/^$/d')"
echo "$MOUNTS" | sed 's/^/    /'
soll() { # Quelle Ziel Modus
  if echo "$MOUNTS" | grep -q -x -F "$1|$2|$3"; then gut "$1 -> $2 ($3)"; else abw "erwartet $1 -> $2 ($3)"; fi
}
soll "$PROXY_DIR_HOST/config" /config rw
soll "$PROXY_DIR_HOST/data" /data rw
soll "$PROXY_DIR_HOST/Caddyfile" "$CADDYFILE_CONTAINER" ro
soll "$SITES_DIR_HOST" "$SITES_DIR_CONTAINER" ro

say "== Caddyfile im Container"
if docker exec "$CADDY_CONTAINER" grep -q -E '^[[:space:]]*import[[:space:]]+sites/\*\.caddy' "$CADDYFILE_CONTAINER" 2>/dev/null; then
  gut "enthaelt 'import sites/*.caddy' (nur direkte Kinder von sites/; Sicherungen in Unterordnern werden nicht geladen)"
else
  abw "keine Zeile 'import sites/*.caddy' in $CADDYFILE_CONTAINER"
fi

say "== Sites-Ordner $SITES_DIR_HOST (Host)"
if [ -d "$SITES_DIR_HOST" ]; then
  gut "Verzeichnis vorhanden"
  ls "$SITES_DIR_HOST" 2>/dev/null | sed 's/^/      /'
  APPDAT=""
  for f in "$SITES_DIR_HOST"/*.caddy; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" != "$SITE_DATEI" ] || continue
    if grep -q -s -F "$APP_HOST" "$f"; then APPDAT="$f"; break; fi
  done
  if [ -n "$APPDAT" ]; then
    gut "App-Datei $(basename "$APPDAT") liegt dort"
    if docker exec "$CADDY_CONTAINER" test -f "$SITES_DIR_CONTAINER/$(basename "$APPDAT")" 2>/dev/null; then
      gut "der Container sieht sie unter $SITES_DIR_CONTAINER (Zuordnung Host <-> Container stimmt)"
    else
      abw "der Container sieht $SITES_DIR_CONTAINER/$(basename "$APPDAT") nicht"
    fi
  else
    abw "keine .caddy-Datei fuer $APP_HOST in $SITES_DIR_HOST"
  fi
  if [ -w "$SITES_DIR_HOST" ]; then gut "beschreibbar fuer $(id -un)"; else hinweis "nicht beschreibbar fuer $(id -un) - Ausfuehrung mit 'sudo -E' (wie unten)"; fi
  FREI="$(platz_frei_kb "$SITES_DIR_HOST")"
  echo "  Platz frei: ${FREI:-?} KB (Mindestbedarf: dist x 3 + $((PLATZ_RESERVE_KB / 1024)) MB, pruefen die Ausliefern-Skripte selbst)"
  if [ -e "$WEB_DIR_HOST" ]; then hinweis "$WEB_DIR_HOST existiert bereits (frueherer Lauf?)"; else gut "$WEB_DIR_HOST wird vom Skript selbst angelegt"; fi
else
  abw "$SITES_DIR_HOST existiert nicht"
fi

say "== Ergebnis"
if [ "$ok" = 1 ]; then
  say "VARIANTE B PASST ZUM BESTAETIGTEN STAND (kein Container-Neustart, nur 'caddy reload'). Befehle:"
  say "  cd \"$SKRIPT_DIR\""
  say "  sudo -E ./website-ausliefern.sh ~/website-dist"
  say "  Rueckweg: sudo -E ./website-zurueck.sh <stempel>      (Stempel steht am Ende der Ausfuehrung)"
  say "  (unter sudo fehlt docker im PATH? dann: sudo -E env \"PATH=\$PATH\" ./website-ausliefern.sh ~/website-dist)"
else
  say "ABWEICHUNG vom bestaetigten Stand (siehe oben) - NICHT ausliefern, Ausgabe melden; nichts wurde geaendert."
  say "Rueckfall waere Variante A (eigener Mount, kurzer Caddy-Neustart, nur nach gesonderter Freigabe): docs/DEPLOY-HAUPTWEBSITE.md."
fi
