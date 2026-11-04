#!/bin/bash
# CENTRIC-Website (statisch) in den Caddy-Container-Betrieb legen. Auf dem VPS ausfuehren.
#
# Nutzung (Vorgaben = bestaetigter VPS-Stand, siehe website-lib.sh; keine Variable noetig):
#   sudo -E ./website-ausliefern.sh <entpackter-dist-ordner>
#
# Schreibt im Sites-Ordner nur centric-dienstplanung.de.caddy (+ kurz die Punktdatei .*.tmp) und das
# Unterverzeichnis centric-website/ (WEB_DIR_HOST). Alles andere dort bleibt byte- und mtime-gleich.
#
# Ablauf (jeder Schritt bricht bei Fehler ab, danach automatischer Rollback):
#   0 Einstellungen (Rechte, Pfadzuordnung Host<->Container, import-Zeile), dist-Ordner, freier Platz
#     (>= dist x 3 + 50 MB), Grundzustand messen (App muss 200 liefern); erst danach wird WEB_DIR_HOST angelegt
#   1 Sicherung aller .caddy-Dateien des Sites-Ordners + Zustand der eigenen Datei und des Links
#   2 Neue Fassung nach $WEB_DIR_HOST/releases/<stempel> kopieren, Link "aktuell" atomar umsetzen
#   3 Eigene Site-Datei ablegen (nur centric-dienstplanung.de.caddy)
#   4 caddy validate im Container (Gesamtkonfiguration inkl. import sites/*.caddy) - VOR dem Reload
#   5 caddy reload (kein Container-Neustart; laufende Verbindungen bleiben bestehen) - nur nach Erfolg von 4
#   6 Gegenprobe (curl gegen 127.0.0.1): Hauptdomain 200, App 200, unbekannte Seite 404
# Rollback bei jedem Fehler: eigene Datei zurueck (oder entfernt), Link zurueck, Reload nur wenn
# schon neu geladen wurde. Die App-Site-Datei wird nie veraendert.
set -Eeuo pipefail

SKRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=website-lib.sh
. "$SKRIPT_DIR/website-lib.sh"

QUELLE="${1:-}"
[ -n "$QUELLE" ] || fehler_ende "Pfad zum entpackten dist-Ordner fehlt. Nutzung: ./website-ausliefern.sh <dist-ordner>"
QUELLE="${QUELLE%/}"
VORLAGE="$SKRIPT_DIR/$SITE_DATEI"

WEB_GEAENDERT=0; SITE_GEAENDERT=0; RELOAD_VERSUCHT=0
SICH=""; LINK_VORHER=""

abbruch() {
  trap - ERR INT TERM
  set +e +E
  echo "FEHLER: $1" >&2
  echo "ROLLBACK ..." >&2
  if [ "$SITE_GEAENDERT" = 1 ]; then
    if [ -f "$SICH/$SITE_DATEI.vorher" ]; then site_datei_installieren "$SICH/$SITE_DATEI.vorher"; else site_datei_entfernen; fi
  fi
  if [ "$WEB_GEAENDERT" = 1 ]; then
    if [ -n "$LINK_VORHER" ]; then aktuell_setzen "$LINK_VORHER"; else aktuell_entfernen; fi
  fi
  if [ "$RELOAD_VERSUCHT" = 1 ]; then
    if caddy_pruefen >/dev/null 2>&1 && caddy_neu_laden >/dev/null 2>&1; then
      echo "Rollback: alter Zustand wieder geladen." >&2
    else
      echo "WARNUNG: Rollback-Reload gescheitert. Bitte von Hand: docker exec $CADDY_CONTAINER caddy reload --config $CADDYFILE_CONTAINER --adapter caddyfile" >&2
    fi
  else
    echo "Rollback: Dateien zurueck; Caddy lief durchgehend mit der alten Konfiguration." >&2
  fi
  echo "App jetzt: $(http_code "$APP_HOST" /) (soll 200)" >&2
  exit 1
}
trap 'abbruch "unerwarteter Fehler (Zeile $LINENO)"' ERR
trap 'abbruch "abgebrochen (Signal)"' INT TERM

meldung "0) Pruefungen"
einstellungen_pruefen
import_zeile_pruefen
[ -f "$VORLAGE" ] || fehler_ende "Site-Datei fehlt neben dem Skript: $VORLAGE"
[ -d "$QUELLE" ] || fehler_ende "dist-Ordner nicht gefunden: $QUELLE"
[ -f "$QUELLE/index.html" ] || fehler_ende "$QUELLE/index.html fehlt - falscher Ordner?"
[ -f "$QUELLE/404.html" ] || fehler_ende "$QUELLE/404.html fehlt - unvollstaendiger Bau?"
[ -d "$QUELLE/assets" ] && [ -n "$(ls -A "$QUELLE/assets")" ] || fehler_ende "$QUELLE/assets fehlt oder ist leer - unvollstaendiger Bau?"
[ -z "$(find "$QUELLE" -type l -print -quit)" ] || fehler_ende "dist enthaelt symbolische Links - wird nicht ausgeliefert."
if [ -e "$WEB_DIR_HOST/aktuell" ] && [ ! -L "$WEB_DIR_HOST/aktuell" ]; then
  fehler_ende "$WEB_DIR_HOST/aktuell ist kein Link (nicht von diesem Skript angelegt) - bitte pruefen."
fi
SUMME="$(cd "$QUELLE" && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"
meldung "  dist-Pruefsumme (sha256 ueber alle Dateien): $SUMME"
platz_pruefen "$QUELLE"
APP_VORHER="$(http_code "$APP_HOST" /)"
[ "$APP_VORHER" = "200" ] || fehler_ende "Die App antwortet vorab mit $APP_VORHER statt 200 - nichts geaendert. Erst das klaeren."

web_dir_anlegen

STEMPEL="$(date -u +%Y%m%dT%H%M%S%NZ)-$$"
SICH="$WEB_DIR_HOST/sicherung/$STEMPEL"
mkdir -p "$SICH/sites"

meldung "1) Sicherung nach $SICH"
find "$SITES_DIR_HOST" -maxdepth 1 -type f -name '*.caddy' -exec cp -a {} "$SICH/sites/" \;
[ -f "$SITES_DIR_HOST/$SITE_DATEI" ] && cp -a "$SITES_DIR_HOST/$SITE_DATEI" "$SICH/$SITE_DATEI.vorher"
LINK_VORHER="$(aktuell_lesen)"
printf '%s\n' "$LINK_VORHER" > "$SICH/aktuell.vorher"

meldung "2) Neue Fassung ablegen und Link umsetzen"
NEU="$WEB_DIR_HOST/releases/.neu-$STEMPEL"
mkdir -p "$NEU"
cp -a "$QUELLE"/. "$NEU"/
chmod -R u=rwX,go=rX "$NEU"   # der Caddy-Container laeuft als anderer Benutzer und muss lesen koennen
mv "$NEU" "$WEB_DIR_HOST/releases/$STEMPEL"
aktuell_setzen "releases/$STEMPEL"; WEB_GEAENDERT=1
# Pfadzuordnung belegen: der relative Link muss IM CONTAINER auf die neue Fassung aufloesen.
caddy_im_container test -f "$WEB_ROOT_CONTAINER/aktuell/index.html" \
  || abbruch "Im Container '$CADDY_CONTAINER' ist $WEB_ROOT_CONTAINER/aktuell/index.html nicht sichtbar - Host-Verzeichnis dort nicht eingehaengt oder Link loest nicht auf (siehe docs/DEPLOY-HAUPTWEBSITE.md)."
AUFGELOEST="$(caddy_im_container readlink -f "$WEB_ROOT_CONTAINER/aktuell" 2>/dev/null || true)"
case "$AUFGELOEST" in
  */releases/"$STEMPEL") ;;
  *) abbruch "Der Link 'aktuell' loest im Container nicht auf releases/$STEMPEL auf (ist: '${AUFGELOEST:-leer}')." ;;
esac

meldung "3) Site-Datei $SITE_DATEI ablegen"
sed "s#/srv/centric-website#$WEB_ROOT_CONTAINER#g" "$VORLAGE" > "$SICH/neu.caddy"
site_datei_installieren "$SICH/neu.caddy"; SITE_GEAENDERT=1
caddy_im_container test -f "$SITES_DIR_CONTAINER/$SITE_DATEI" \
  || abbruch "Im Container ist $SITES_DIR_CONTAINER/$SITE_DATEI nicht sichtbar - SITES_DIR_HOST ist nicht der eingehaengte Ordner."

meldung "4) caddy validate (vor dem Reload)"
caddy_pruefen || abbruch "caddy validate meldet Fehler - es wurde NICHT neu geladen."
caddy_kennt_hauptdomain || abbruch "Die gepruefte Konfiguration enthaelt $HAUPT_HOST nicht (import sites/*.caddy greift nicht?) - es wurde NICHT neu geladen."

meldung "5) caddy reload"
RELOAD_VERSUCHT=1
caddy_neu_laden || abbruch "caddy reload gescheitert."

meldung "6) Gegenprobe"
gegenprobe || abbruch "Gegenprobe nicht bestanden."

trap - ERR INT TERM
meldung ""
meldung "FERTIG. Fassung: releases/$STEMPEL"
meldung "Rueckweg (stellt den Zustand vor diesem Lauf wieder her):"
meldung "  sudo -E $SKRIPT_DIR/website-zurueck.sh $STEMPEL"
meldung "Alte Fassungen bleiben unter $WEB_DIR_HOST/releases liegen (je ca. 2 MB); Sicherung: $SICH"
meldung "Hinweis: www.$HAUPT_HOST hat erst nach dem DNS-A-Eintrag ein Zertifikat; bis dahin meldet Caddy dazu Zertifikatsversuche im Log - ohne Folgen fuer die Hauptdomain und die App."
