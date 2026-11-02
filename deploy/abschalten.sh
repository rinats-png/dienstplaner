#!/usr/bin/env bash
# =====================================================================
#  abschalten.sh — R0: Dienst kontrolliert anhalten
#
#  Aufruf:  ./abschalten.sh [--trocken]
#
#  Die vereinbarte Fehlerstrategie bei einem fehlgeschlagenen Release:
#  lieber kein Dienst als ein unsicheres Bild. Kein Rücksprung, keine
#  Änderung an .env, keine Daten angefasst.
#
#    1. docker compose stop <dienst>
#       (scheitert Compose — etwa weil .env noch kein IMAGE_DIGEST hat —
#       dann docker stop <container>; beides markiert den Container als
#       vom Menschen angehalten, restart: unless-stopped startet ihn
#       nicht wieder)
#    2. prüft: Status exited, kein Neustart
#    3. beobachtet ${CENTRIC_NACHBEOBACHTUNG:-10}s, ob er wieder anläuft
#    4. Protokoll: betrieb-protokoll.log
#
#  --trocken   zeigt den aktuellen Zustand und was geschähe; hält nichts an.
#
#  Rückgabe: 0 angehalten (oder Trockenlauf) · 1 nicht sicher angehalten
#  · 2 Aufruf
# =====================================================================
set -euo pipefail

# shellcheck source=deploy/freigabe-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/freigabe-lib.sh"

NACHBEOBACHTUNG="${CENTRIC_NACHBEOBACHTUNG:-10}"

trocken=0
for arg in "$@"; do
  case "$arg" in
    --trocken) trocken=1 ;;
    -h | --hilfe) sed -n '2,24p' "$0"; exit 0 ;;
    *) fehler "unbekannter Aufruf: $arg"; exit 2 ;;
  esac
done

zustand() {
  docker inspect --format '{{.State.Status}} {{.RestartCount}} {{.Image}}' "$CENTRIC_DIENST" 2>/dev/null || true
}

vorher="$(zustand)"
read -r status_vorher neustarts_vorher bild_vorher <<<"${vorher:-fehlt 0 -}"

if ((trocken)); then
  hinweis "TROCKENLAUF — es wird nichts angehalten."
  hinweis "  Container:   $CENTRIC_DIENST, Status $status_vorher, Neustarts $neustarts_vorher, Bild $bild_vorher"
  hinweis "  Befehl:      docker compose stop $CENTRIC_DIENST (Ersatz: docker stop $CENTRIC_DIENST)"
  hinweis "  Danach:      prüfen exited, ${NACHBEOBACHTUNG}s beobachten, Protokoll"
  exit 0
fi

protokoll "R0 start status=$status_vorher bild=$bild_vorher"

if ! compose stop "$CENTRIC_DIENST"; then
  warnung "docker compose stop scheiterte — halte den Container direkt an."
  docker stop "$CENTRIC_DIENST" || true
fi

pruefen_angehalten() {
  local z status neustarts _bild
  z="$(zustand)"
  read -r status neustarts _bild <<<"${z:-fehlt 0 -}"
  case "$status" in
    exited | created | fehlt) ;;
    *) fehler "Container $CENTRIC_DIENST ist '$status', nicht angehalten."; return 1 ;;
  esac
  if [[ "$neustarts" != "$neustarts_vorher" ]]; then
    fehler "Neustartzähler hat sich geändert ($neustarts_vorher → $neustarts)."
    return 1
  fi
  return 0
}

if ! pruefen_angehalten; then
  protokoll "R0 FEHLGESCHLAGEN: nicht angehalten"
  fehler "R0 nicht erreicht — von Hand: docker stop $CENTRIC_DIENST; docker inspect $CENTRIC_DIENST"
  exit 1
fi

sleep "$NACHBEOBACHTUNG"
if ! pruefen_angehalten; then
  protokoll "R0 FEHLGESCHLAGEN: wieder angelaufen"
  fehler "Container ist nach dem Anhalten wieder angelaufen — Restart-Policy und Überwachung prüfen."
  exit 1
fi

protokoll "R0 erreicht: $CENTRIC_DIENST angehalten (Bild war $bild_vorher)"
hinweis "R0 erreicht: $CENTRIC_DIENST ist angehalten und bleibt es. Daten unter ./data unverändert."
hinweis ""
hinweis "Wiederinbetriebnahme (erst nach Klärung der Ursache):"
hinweis "  1. ./digest-pruefen.sh sha256:<freigegebener Digest>   (muss 'in Ordnung' melden)"
hinweis "  2. IMAGE_DIGEST in .env auf diesen Digest (falls abweichend)"
hinweis "  3. docker compose up -d --pull never $CENTRIC_DIENST"
hinweis "  4. docker compose ps → healthy; laufende Bild-ID mit dem Digest vergleichen"
