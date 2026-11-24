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
#   0 Einstellungen (Rechte, Pfadzuordnung Host<->Container, import-Zeile, keine Links/'..'), dist-Ordner,
#     freier Platz (>= dist x 3 + 50 MB), Grundzustand messen (App muss 200 liefern); erst danach wird
#     WEB_DIR_HOST angelegt
#   1 Sicherung aller .caddy-Dateien des Sites-Ordners + Zustand der eigenen Datei und des Links
#   2 Neue Fassung nach $WEB_DIR_HOST/releases/<stempel> kopieren, Link "aktuell" atomar umsetzen
#   3 Neue Site-Datei bauen (www-Block nur, wenn www per DNS aufloesbar) und VOR dem Einspielen in einer
#     Probekopie (Sicherungsordner) vom Container validieren - der Live-Ordner bleibt dabei unberuehrt
#   4 Eigene Site-Datei ablegen (nur centric-dienstplanung.de.caddy), caddy validate der Gesamtkonfiguration
#   5 caddy reload (kein Container-Neustart; laufende Verbindungen bleiben bestehen) - nur nach Erfolg von 4
#   6 Gegenprobe (curl gegen 127.0.0.1): Hauptdomain 200, App 200, unbekannte Seite 404
# Rollback bei jedem Fehler, Signal (INT/TERM/HUP/QUIT) und set -e/-u-Abbruechen (EXIT-Falle mit
# Erfolgsmerker): eigene Datei zurueck (oder entfernt), Link zurueck, Reload nur wenn schon neu geladen wurde.
# Die Merker werden VOR der jeweiligen Aktion gesetzt (der Rollback ist wiederholbar), der Rollback selbst ist
# gegen weitere Signale geschuetzt. Die App-Site-Datei wird nie veraendert.
set -eo pipefail
set -u

SKRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=website-lib.sh
. "$SKRIPT_DIR/website-lib.sh"

QUELLE="${1:-}"
[ -n "$QUELLE" ] || fehler_ende "Pfad zum entpackten dist-Ordner fehlt. Nutzung: ./website-ausliefern.sh <dist-ordner>"
QUELLE="${QUELLE%/}"
VORLAGE="$SKRIPT_DIR/$SITE_DATEI"

AKTIV=0; FERTIG=0
WEB_GEAENDERT=0; SITE_GEAENDERT=0; RELOAD_VERSUCHT=0
SICH=""; LINK_VORHER=""; NEU=""
ABBRUCH_MELDUNG=""

# Rollback: laeuft ueber die EXIT-Falle (also bei exit nach Fehlermeldung, Signal oder set -e/-u),
# nur wenn schon etwas veraendert werden durfte (AKTIV) und der Lauf nicht fertig ist.
rueckweg() {
  local rc=$?
  trap - EXIT
  trap '' INT TERM HUP QUIT          # B2: waehrend des Rollbacks kein weiteres Signal annehmen
  set +e +u
  if [ "$FERTIG" = 1 ] || [ "$AKTIV" != 1 ]; then exit "$rc"; fi
  [ "$rc" -ne 0 ] || rc=1
  echo "FEHLER: ${ABBRUCH_MELDUNG:-unerwarteter Abbruch (siehe Meldung oben)}" >&2
  echo "ROLLBACK ..." >&2
  if [ "$SITE_GEAENDERT" = 1 ]; then
    rm -f "$SITES_DIR_HOST/.$SITE_DATEI.tmp"
    if [ -f "$SICH/$SITE_DATEI.vorher" ]; then site_datei_installieren "$SICH/$SITE_DATEI.vorher"; else site_datei_entfernen; fi
  fi
  if [ "$WEB_GEAENDERT" = 1 ]; then
    if [ -n "$LINK_VORHER" ]; then aktuell_setzen "$LINK_VORHER"; else aktuell_entfernen; fi
  fi
  [ -z "$NEU" ] || [ ! -d "$NEU" ] || rm -rf "$NEU"   # halb kopierte Fassung (nur die eigene .neu-Fassung)
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
  exit "$rc"
}
abbruch() { ABBRUCH_MELDUNG="$1"; exit 1; }
trap rueckweg EXIT
trap 'ABBRUCH_MELDUNG="abgebrochen (Signal INT)"; exit 130' INT
trap 'ABBRUCH_MELDUNG="abgebrochen (Signal TERM)"; exit 143' TERM
trap 'ABBRUCH_MELDUNG="abgebrochen (Signal HUP)"; exit 129' HUP
trap 'ABBRUCH_MELDUNG="abgebrochen (Signal QUIT)"; exit 131' QUIT

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
LINK_VORHER="$(aktuell_lesen)"
if [ -n "$LINK_VORHER" ] && ! link_ziel_gueltig "$LINK_VORHER"; then
  fehler_ende "Der Link $WEB_DIR_HOST/aktuell zeigt auf '$LINK_VORHER' (erlaubt nur releases/<name>) - bitte pruefen. Nichts geaendert."
fi
SUMME="$(cd "$QUELLE" && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"
meldung "  dist-Pruefsumme (sha256 ueber alle Dateien): $SUMME"
platz_pruefen "$QUELLE"
APP_VORHER="$(http_code "$APP_HOST" /)"
[ "$APP_VORHER" = "200" ] || fehler_ende "Die App antwortet vorab mit $APP_VORHER statt 200 - nichts geaendert. Erst das klaeren."
if www_aufloesbar; then
  WWW=1; meldung "  www.$HAUPT_HOST ist per DNS aufloesbar: Weiterleitung (301) wird eingerichtet."
else
  WWW=0; meldung "  www.$HAUPT_HOST hat noch keinen DNS-Eintrag: Weiterleitung wird weggelassen (nach dem Eintrag diesen Lauf wiederholen)."
fi

web_dir_anlegen
AKTIV=1

STEMPEL="$(date -u +%Y%m%dT%H%M%S%NZ)-$$"
SICH="$WEB_DIR_HOST/sicherung/$STEMPEL"
mkdir -p "$SICH/sites"

meldung "1) Sicherung nach $SICH"
find "$SITES_DIR_HOST" -maxdepth 1 -type f -name '*.caddy' -exec cp -a {} "$SICH/sites/" \;
if [ -f "$SITES_DIR_HOST/$SITE_DATEI" ]; then cp -a "$SITES_DIR_HOST/$SITE_DATEI" "$SICH/$SITE_DATEI.vorher"; fi
printf '%s\n' "$LINK_VORHER" > "$SICH/aktuell.vorher"

meldung "2) Neue Fassung ablegen und Link umsetzen"
NEU="$WEB_DIR_HOST/releases/.neu-$STEMPEL"
mkdir -p "$NEU"
cp -a "$QUELLE"/. "$NEU"/
chmod -R u=rwX,go=rX "$NEU"   # der Caddy-Container laeuft als anderer Benutzer und muss lesen koennen
mv "$NEU" "$WEB_DIR_HOST/releases/$STEMPEL"
NEU=""
WEB_GEAENDERT=1               # Merker VOR der Aktion (B3): der Rollback ist wiederholbar
aktuell_setzen "releases/$STEMPEL"
# Pfadzuordnung belegen: der relative Link muss IM CONTAINER auf die neue Fassung aufloesen.
caddy_im_container test -f "$WEB_ROOT_CONTAINER/aktuell/index.html" \
  || abbruch "Im Container '$CADDY_CONTAINER' ist $WEB_ROOT_CONTAINER/aktuell/index.html nicht sichtbar - Host-Verzeichnis dort nicht eingehaengt oder Link loest nicht auf (siehe docs/DEPLOY-HAUPTWEBSITE.md)."
AUFGELOEST="$(caddy_im_container readlink -f "$WEB_ROOT_CONTAINER/aktuell" 2>/dev/null || true)"
case "$AUFGELOEST" in
  */releases/"$STEMPEL") ;;
  *) abbruch "Der Link 'aktuell' loest im Container nicht auf releases/$STEMPEL auf (ist: '${AUFGELOEST:-leer}')." ;;
esac

meldung "3) Site-Datei $SITE_DATEI bauen und vorab pruefen (Probekopie; $SITES_DIR_HOST bleibt unberuehrt)"
site_datei_bauen "$VORLAGE" "$SICH/neu.caddy" "$WEB_ROOT_CONTAINER" "$WWW"
site_datei_vorab_pruefen "$SICH" "$STEMPEL" "$SICH/neu.caddy" \
  || abbruch "caddy validate meldet Fehler in der neuen Site-Datei (Probekopie) - $SITES_DIR_HOST und Caddy wurden NICHT angeruehrt, es wurde NICHT neu geladen."

meldung "4) Site-Datei ablegen, caddy validate (vor dem Reload)"
SITE_GEAENDERT=1              # Merker VOR der Aktion (B3)
site_datei_installieren "$SICH/neu.caddy"
caddy_im_container test -f "$SITES_DIR_CONTAINER/$SITE_DATEI" \
  || abbruch "Im Container ist $SITES_DIR_CONTAINER/$SITE_DATEI nicht sichtbar - SITES_DIR_HOST ist nicht der eingehaengte Ordner."
caddy_pruefen || abbruch "caddy validate meldet Fehler - es wurde NICHT neu geladen."
caddy_kennt_hauptdomain || abbruch "Die gepruefte Konfiguration enthaelt $HAUPT_HOST nicht (import sites/*.caddy greift nicht?) - es wurde NICHT neu geladen."

meldung "5) caddy reload"
RELOAD_VERSUCHT=1
caddy_neu_laden || abbruch "caddy reload gescheitert."

meldung "6) Gegenprobe"
gegenprobe || abbruch "Gegenprobe nicht bestanden."

FERTIG=1
trap - EXIT INT TERM HUP QUIT
meldung ""
meldung "FERTIG. Fassung: releases/$STEMPEL"
meldung "Rueckweg (stellt den Zustand vor diesem Lauf wieder her):"
meldung "  sudo -E $SKRIPT_DIR/website-zurueck.sh $STEMPEL"
meldung "Alte Fassungen bleiben unter $WEB_DIR_HOST/releases liegen (je ca. 2 MB); Sicherung: $SICH"
if [ "$WWW" = 1 ]; then
  meldung "www.$HAUPT_HOST leitet auf $HAUPT_HOST um (Zertifikat holt Caddy selbst; falls nicht sofort, im Log nachsehen: docker logs --tail 50 $CADDY_CONTAINER)."
else
  meldung "www.$HAUPT_HOST hat noch keinen DNS-Eintrag - nach dem Eintrag diesen Befehl erneut ausfuehren (Wiederholung ist unschaedlich)."
fi
