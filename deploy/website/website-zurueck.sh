#!/bin/bash
# Rueckweg zu website-ausliefern.sh: stellt den Zustand VOR dem gewaehlten Lauf wieder her.
#
# Nutzung:
#   sudo -E ./website-zurueck.sh [stempel]       (Vorgaben = bestaetigter VPS-Stand, siehe website-lib.sh)
# Ohne Stempel: der neueste Lauf unter $WEB_DIR_HOST/sicherung. Stempel stehen am Ende der Ausgabe von
# website-ausliefern.sh, oder: ls $WEB_DIR_HOST/sicherung
#
# Stellt wieder her: die eigene Datei centric-dienstplanung.de.caddy (oder entfernt sie, wenn es sie vorher
# nicht gab) und den Link "aktuell". Andere Dateien (App) werden nicht angefasst. Danach: validate -> reload
# -> Probe der App. Wird die Hauptdomain wieder abgeschaltet (Zustand vor dem ersten Lauf), erwartet die
# Probe nur App = 200.
set -Eeuo pipefail

SKRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=website-lib.sh
. "$SKRIPT_DIR/website-lib.sh"

einstellungen_pruefen
[ -d "$WEB_DIR_HOST/sicherung" ] || fehler_ende "Keine Sicherungen unter $WEB_DIR_HOST/sicherung."
STEMPEL="${1:-}"
if [ -z "$STEMPEL" ]; then
  STEMPEL="$(ls -1 "$WEB_DIR_HOST/sicherung" | LC_ALL=C sort | tail -n 1)"
fi
[[ "$STEMPEL" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || fehler_ende "Ungueltiger Stempel."
SICH="$WEB_DIR_HOST/sicherung/$STEMPEL"
[ -d "$SICH" ] || fehler_ende "Sicherung nicht gefunden: $SICH (verfuegbar: $(ls -1 "$WEB_DIR_HOST/sicherung" | tr '\n' ' '))"
[ -f "$SICH/aktuell.vorher" ] || fehler_ende "Sicherung unvollstaendig (aktuell.vorher fehlt): $SICH"

LINK_VORHER="$(head -n 1 "$SICH/aktuell.vorher")"
if [ -n "$LINK_VORHER" ]; then
  # B7: der Inhalt der Sicherungsdatei wird zum Link-Ziel - nur releases/<name> ist erlaubt.
  link_ziel_gueltig "$LINK_VORHER" || fehler_ende "Sicherung $SICH: aktuell.vorher enthaelt kein gueltiges Link-Ziel (erlaubt nur releases/<name>): '$LINK_VORHER'. Nichts geaendert."
  [ -d "$WEB_DIR_HOST/$LINK_VORHER" ] || fehler_ende "Vorherige Fassung fehlt: $WEB_DIR_HOST/$LINK_VORHER"
fi

meldung "Zustand vor Lauf $STEMPEL wiederherstellen"
if [ -f "$SICH/$SITE_DATEI.vorher" ]; then
  site_datei_installieren "$SICH/$SITE_DATEI.vorher"; HAUPT_ERWARTET=1
  meldung "  Site-Datei: vorherige Fassung zurueck"
else
  site_datei_entfernen; HAUPT_ERWARTET=0
  meldung "  Site-Datei: entfernt (gab es vorher nicht)"
fi
if [ -n "$LINK_VORHER" ]; then
  aktuell_setzen "$LINK_VORHER"; meldung "  Website: Link zurueck auf $LINK_VORHER"
else
  aktuell_entfernen; meldung "  Website: Link entfernt (gab es vorher nicht)"
fi

meldung "caddy validate"
caddy_pruefen || fehler_ende "caddy validate meldet Fehler. Caddy laeuft unveraendert weiter. Dateien liegen im wiederhergestellten Zustand; Sicherung aller Sites: $SICH/sites"
meldung "caddy reload"
caddy_neu_laden || fehler_ende "caddy reload gescheitert. Von Hand: docker exec $CADDY_CONTAINER caddy reload --config $CADDYFILE_CONTAINER --adapter caddyfile"

meldung "Probe"
sleep "$GEGENPROBE_PAUSE"
A="$(http_code "$APP_HOST" /)"; H="$(http_code "$HAUPT_HOST" /)"
meldung "  App $A (soll 200), Hauptdomain $H"
[ "$A" = "200" ] || fehler_ende "Die App antwortet mit $A - bitte sofort pruefen: docker logs --tail 50 $CADDY_CONTAINER"
if [ "$HAUPT_ERWARTET" = 1 ] && [ "$H" != "200" ]; then
  fehler_ende "Hauptdomain antwortet mit $H (erwartet 200 nach Rueckkehr zur vorherigen Fassung)."
fi
meldung "FERTIG."
