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
warnung() { echo "  WARNUNG: $*"; }

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
# A4: /config ist fuer die Auslieferung nicht noetig (nur Caddys Autosave) - fehlt der Mount, nur WARNUNG.
if echo "$MOUNTS" | grep -q -x -F "$PROXY_DIR_HOST/config|/config|rw"; then
  gut "$PROXY_DIR_HOST/config -> /config (rw)"
else
  warnung "erwartet $PROXY_DIR_HOST/config -> /config (rw) - fuer die Auslieferung nicht noetig, bitte trotzdem melden"
fi
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

say "== App (A3)"
if command -v curl >/dev/null 2>&1; then
  APP_CODE="$(http_code "$APP_HOST" /)"
  if [ "$APP_CODE" = "200" ]; then
    gut "App antwortet vorab genau 200 (https://$APP_HOST/ ueber --resolve 127.0.0.1)"
  else
    abw "App antwortet vorab mit $APP_CODE statt 200 (https://$APP_HOST/ ueber --resolve 127.0.0.1) - erst die App klaeren, nichts ausliefern"
  fi
else
  abw "curl fehlt - die App kann vorab nicht geprueft werden"
fi

say "== DNS (rein lesend)"
if www_aufloesbar; then
  gut "www.$HAUPT_HOST ist per DNS aufloesbar (die Weiterleitung wird mit eingerichtet)"
else
  hinweis "www.$HAUPT_HOST hat noch keinen DNS-Eintrag - die Weiterleitung wird weggelassen; nach dem Eintrag das Ausliefern wiederholen"
fi
AAAA=""
if command -v getent >/dev/null 2>&1; then
  AAAA="$(getent ahostsv6 "$HAUPT_HOST" 2>/dev/null | awk '{print tolower($1)}' | grep -v '^::ffff:' | sort -u || true)"
fi
if [ -n "$AAAA" ]; then
  LOKAL="$( { ip -o -6 addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1; hostname -I 2>/dev/null | tr ' ' '\n'; } | tr 'A-F' 'a-f' | sort -u || true)"
  for a in $AAAA; do
    if echo "$LOKAL" | grep -q -x -F "$a"; then
      gut "AAAA-Eintrag von $HAUPT_HOST ($a) gehoert zu diesem Server"
    else
      hinweis "$HAUPT_HOST hat einen AAAA-Eintrag ($a), der nicht zu den lokalen Adressen dieses Servers passt. Let's Encrypt prueft bevorzugt IPv6 - das Zertifikat kann scheitern (z. B. IONOS-Parking). Bitte DNS beim Kunden klaeren (AAAA entfernen oder auf diesen Server richten)."
    fi
  done
else
  gut "kein AAAA-Eintrag fuer $HAUPT_HOST (oder nicht ermittelbar) - IPv6-Pruefung von Let's Encrypt unkritisch"
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
