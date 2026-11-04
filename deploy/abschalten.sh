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
#    0. Docker muss antworten (docker info), sonst Exit 1 — ein
#       unbekannter Zustand gilt nie als "angehalten"
#    1. docker compose stop <dienst>
#       (scheitert Compose — etwa weil .env noch kein IMAGE_DIGEST hat —
#       dann docker stop <container>; beides markiert den Container als
#       vom Menschen angehalten, restart: unless-stopped startet ihn
#       nicht wieder)
#    2. prüft: Status exited (inspect) und nicht "Up" (docker ps -a),
#       kein Neustart
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
    -h | --hilfe) sed -n '2,27p' "$0"; exit 0 ;;
    *) fehler "unbekannter Aufruf: $arg"; exit 2 ;;
  esac
done

# Gibt "<status> <neustarts> <bild-id>" aus. Nur ein ausdrücklich nicht
# vorhandener Container gilt als "fehlt 0 -"; jeder andere Fehler von
# docker inspect (Docker nicht erreichbar, Rechte, …) liefert 1.
# stdout und stderr werden getrennt erfasst: Warnungen der CLI auf stderr
# dürfen das Parsen nicht verfälschen, und die Ausgabe muss genau die Form
# "<status> <zahl> <bild>" haben.
zustand() {
  local aus err errdatei rc=0
  errdatei="$(mktemp)"
  aus="$(docker inspect --format '{{.State.Status}} {{.RestartCount}} {{.Image}}' "$CENTRIC_DIENST" 2>"$errdatei")" || rc=$?
  err="$(cat "$errdatei")"
  rm -f "$errdatei"
  if ((rc == 0)); then
    if [[ "$aus" =~ ^[a-z]+\ [0-9]+\ [^[:space:]]+$ ]]; then
      printf '%s\n' "$aus"
      return 0
    fi
    fehler "docker inspect $CENTRIC_DIENST lieferte Unerwartetes: '$aus' ${err:+(stderr: $err)}"
    return 1
  fi
  case "${err,,}" in
    *"no such object"* | *"no such container"*) printf 'fehlt 0 -\n'; return 0 ;;
  esac
  fehler "docker inspect $CENTRIC_DIENST scheiterte: ${err:-$aus}"
  return 1
}

# Status laut "docker ps -a" (zweite, unabhängige Quelle); leer = kein Container.
ps_status() {
  docker ps -a --filter "name=^${CENTRIC_DIENST}\$" --format '{{.Status}}'
}

if ! docker_erreichbar; then
  fehler "Docker antwortet nicht (docker info) — Zustand unbekannt, R0 NICHT erreicht."
  fehler "Von Hand prüfen: systemctl status docker; docker ps -a"
  ((trocken)) || protokoll "R0 FEHLGESCHLAGEN: Docker nicht erreichbar"
  exit 1
fi

if ! vorher="$(zustand)"; then
  ((trocken)) || protokoll "R0 FEHLGESCHLAGEN: Zustand nicht lesbar"
  exit 1
fi
read -r status_vorher neustarts_vorher bild_vorher <<<"$vorher"

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
  local z status neustarts _bild ps
  z="$(zustand)" || return 1
  read -r status neustarts _bild <<<"$z"
  case "$status" in
    exited | created) ;;
    fehlt)
      if [[ "$status_vorher" != "fehlt" ]]; then
        fehler "Container $CENTRIC_DIENST ist nach dem Anhalten verschwunden — unerwartet, von Hand prüfen."
        return 1
      fi ;;
    *) fehler "Container $CENTRIC_DIENST ist '$status', nicht angehalten."; return 1 ;;
  esac
  if [[ "$status" != "fehlt" && "$neustarts" != "$neustarts_vorher" ]]; then
    fehler "Neustartzähler hat sich geändert ($neustarts_vorher → $neustarts)."
    return 1
  fi
  if ! ps="$(ps_status)"; then
    fehler "docker ps -a scheiterte — Zustand nicht gegengeprüft."
    return 1
  fi
  if [[ "$status" == "fehlt" ]]; then
    if [[ -n "$ps" ]]; then
      fehler "inspect meldet keinen Container, docker ps aber '$ps' — widersprüchlich."
      return 1
    fi
    return 0
  fi
  # Container vorhanden: docker ps muss ihn als angehalten bestätigen.
  case "$ps" in
    Exited* | Created*) return 0 ;;
    "") fehler "docker ps -a kennt $CENTRIC_DIENST nicht, inspect meldet '$status' — widersprüchlich."; return 1 ;;
    *) fehler "docker ps meldet '$ps' — nicht angehalten."; return 1 ;;
  esac
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
