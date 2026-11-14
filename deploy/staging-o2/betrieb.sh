#!/usr/bin/env bash
# =====================================================================
#  betrieb.sh — Staging-VM (O2): Vorabprüfung, Sicherung, Wiederherstellung, Rücksprung
#  Liegt neben compose.yml in /opt/centric-staging. Ändert nichts ohne
#  ausdrücklichen Unterbefehl; jeder ändernde Befehl kennt --trocken.
#
#    ./betrieb.sh pruefen                      .env und Digests prüfen (ändert nichts)
#    ./betrieb.sh sichern [--trocken]          Dienst kurz anhalten, ./data als Archiv ablegen, Dienst starten
#    ./betrieb.sh wiederherstellen <archiv> [--trocken]
#                                              ./data ersetzen (altes Verzeichnis bleibt als data.vor-wiederherstellung-<zeit>)
#    ./betrieb.sh zurueck [--trocken]          IMAGE_DIGEST auf den zuletzt gemerkten Vorgänger setzen und neu erstellen
#    ./betrieb.sh merken <digest> [--trocken]  Digest als Rücksprungziel ablegen
#
#  Rücksprungziele (merken UND zurueck) werden gegen deploy/FREIGEGEBENE-IMAGES.md geprüft (gesperrt_grund aus
#  freigabe-lib.sh, gesucht neben diesem Skript oder eine Ebene darüber). Gesperrte Bilder (z. B. f03a8514, 0861adee)
#  werden verweigert; fehlt die Bibliothek, wird ebenfalls verweigert (fail-closed). Beide Dateien gehören auf die VM.
#
#  Nie gesichert und nie zurückgespielt wird ./zustand (Schlüsselepoche, wie in der Produktion).
#  Alle Daten im Staging sind synthetisch; Sicherungen liegen nur auf der VM (./sicherungen), nie außer Haus.
#  Gelesen wird die .env nur auf Form (Digest-Format, offene <...>-Platzhalter), nie ausgegeben.
# =====================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

TROCKEN=0
for a in "$@"; do [ "$a" = "--trocken" ] && TROCKEN=1; done
befehl="${1:-}"
fehler() { echo "FEHLER: $*" >&2; exit 1; }
tun() { if [ "$TROCKEN" = 1 ]; then echo "[trocken] $*"; else "$@"; fi; }
digest_ok() { [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]; }
wert() { grep -E "^$1=" .env | head -n1 | cut -d= -f2-; }

# Rücksprungziel gegen die Freigabeliste prüfen (Hilfsfunktion gesperrt_grund aus freigabe-lib.sh, nicht nachgebaut).
# Läuft in einer Unterschale, damit die Bibliothek unsere fehler() nicht überschreibt; alles außer eindeutig "frei" verweigert.
ziel_pruefen() {
  local ziel="$1" lib="" aus
  if [ -f ./freigabe-lib.sh ]; then lib=./freigabe-lib.sh; elif [ -f ../freigabe-lib.sh ]; then lib=../freigabe-lib.sh; fi
  [ -n "$lib" ] || fehler "freigabe-lib.sh nicht gefunden: Rücksprungziel nicht prüfbar, verweigert"
  aus="$( . "$lib" >/dev/null 2>&1 || { echo FEHLER; exit 0; }
          if g="$(gesperrt_grund "$ziel")"; then echo "GESPERRT $g"; else echo FREI; fi )" || aus="FEHLER"
  case "$aus" in
    FREI) ;;
    GESPERRT*) fehler "Rücksprungziel $ziel ist gesperrt und wird verweigert: ${aus#GESPERRT }" ;;
    *) fehler "Freigabeliste nicht auswertbar: Rücksprungziel verweigert" ;;
  esac
}

pruefen() {
  [ -f .env ] || fehler ".env fehlt (Vorlage: env.staging.beispiel)"
  local perm; perm="$(stat -c %a .env 2>/dev/null || echo 600)"
  [ "$perm" = 600 ] || fehler ".env muss Modus 600 haben (ist $perm)"
  if grep -E '^[A-Z_]+=.*<[^>]+>' .env >/dev/null; then fehler ".env enthält noch <Platzhalter>"; fi
  digest_ok "$(wert IMAGE_DIGEST)" || fehler "IMAGE_DIGEST ist kein sha256:<64 hex>"
  digest_ok "$(wert CADDY_DIGEST)" || fehler "CADDY_DIGEST ist kein sha256:<64 hex>"
  [ -n "$(wert STAGING_HOST)" ] || fehler "STAGING_HOST fehlt"
  [ -n "$(wert CENTRIC_ADMIN)" ] && [ -n "$(wert CENTRIC_PFEFFER)" ] || fehler "CENTRIC_ADMIN/CENTRIC_PFEFFER fehlen"
  [ -d zustand ] || fehler "zustand/ fehlt: install -d -m 700 -o 1000 -g 1000 zustand"
  echo "OK: Form von .env und Digests in Ordnung (Inhalt nicht angezeigt)"
}

sichern() {
  pruefen
  local zeit; zeit="$(date -u +%Y%m%dT%H%M%SZ)"
  SI_ARCH="sicherungen/data-$zeit.tar.gz"; SI_GESTOPPT=0; SI_FERTIG=0
  tun install -d -m 700 sicherungen
  # Schlägt ab hier etwas fehl, wird der Dienst wieder gestartet und das unvollständige Archiv entfernt.
  trap sichern_rueckfall EXIT
  tun docker compose stop centric-staging-web
  SI_GESTOPPT=1
  tun tar -C . -czf "$SI_ARCH" data
  tun docker compose up -d --pull never
  SI_FERTIG=1; trap - EXIT
  echo "Sicherung: $SI_ARCH (Prüfsumme folgt)"
  [ "$TROCKEN" = 1 ] || sha256sum "$SI_ARCH" > "$SI_ARCH.sha256"
}

sichern_rueckfall() {
  local rc=$?
  trap - EXIT
  [ "$SI_FERTIG" = 1 ] && exit "$rc"
  echo "FEHLER: Sicherung fehlgeschlagen; unvollständiges Archiv entfernt, Dienst wird wieder gestartet" >&2
  rm -f "$SI_ARCH" "$SI_ARCH.sha256" 2>/dev/null || true
  [ "$SI_GESTOPPT" = 1 ] && { docker compose up -d --pull never || echo "FEHLER: Dienst konnte nicht gestartet werden, bitte von Hand prüfen" >&2; }
  exit "$([ "$rc" -ne 0 ] && echo "$rc" || echo 1)"
}

# Inhaltsliste des Archivs prüfen, bevor etwas entpackt wird: nur data und data/..., keine absoluten Pfade, kein "..",
# keine Verknüpfungen, nichts, was .env oder compose-Dateien berührt.
archiv_pruefen() {
  local arch="$1" liste zeile
  liste="$(tar -tvzf "$arch")" || fehler "Archiv nicht lesbar"
  [ -n "$liste" ] || fehler "Archiv ist leer"
  while IFS= read -r zeile; do
    case "${zeile:0:1}" in l|h) fehler "Archiv enthält Verknüpfungen (${zeile##* }): abgelehnt" ;; esac
  done <<<"$liste"
  liste="$(tar -tzf "$arch")" || fehler "Archiv nicht lesbar"
  while IFS= read -r zeile; do
    case "$zeile" in /*|[A-Za-z]:*|\\*) fehler "Archiv enthält absoluten Pfad: $zeile" ;; esac
    case "/$zeile/" in */../*|*/./*) fehler "Archiv enthält .. oder . im Pfad: $zeile" ;; esac
    case "$zeile" in data|data/*) ;; *) fehler "Archiv enthält Eintrag außerhalb von data/: $zeile" ;; esac
    case "$(basename "${zeile%/}")" in .env|.env.*|compose*.yml|compose*.yaml|docker-compose*) fehler "Archiv berührt .env oder compose-Datei: $zeile" ;; esac
  done <<<"$liste"
}

wiederherstellen() {
  local arch="${2:-}"
  [ -n "$arch" ] && [ "$arch" != "--trocken" ] || fehler "Archiv angeben: ./betrieb.sh wiederherstellen sicherungen/data-<zeit>.tar.gz"
  [ -f "$arch" ] || fehler "Archiv nicht gefunden"
  if [ -f "$arch.sha256" ]; then sha256sum -c "$arch.sha256" >/dev/null || fehler "Prüfsumme stimmt nicht"; else fehler "Prüfsumme $arch.sha256 fehlt"; fi
  archiv_pruefen "$arch"
  WH_ZEIT="$(date -u +%Y%m%dT%H%M%SZ)"; WH_GESTOPPT=0; WH_VERSCHOBEN=0; WH_FERTIG=0
  # Schlägt ab hier etwas fehl: data wiederherstellen, Dienst starten, Exit ungleich 0.
  trap wiederherstellen_rueckfall EXIT
  tun docker compose stop centric-staging-web
  WH_GESTOPPT=1
  tun mv data "data.vor-wiederherstellung-$WH_ZEIT"
  WH_VERSCHOBEN=1
  tun tar -C . -xzf "$arch" data
  tun docker compose up -d --pull never
  WH_FERTIG=1; trap - EXIT
  echo "Danach prüfen: curl -sf https://\$STAGING_HOST/gesund, Anmeldung, Zähler gegen Sicherung (STAGING-O2-VORBEREITUNG.md)."
}

wiederherstellen_rueckfall() {
  local rc=$?
  trap - EXIT
  [ "$WH_FERTIG" = 1 ] && exit "$rc"
  echo "FEHLER: Wiederherstellung fehlgeschlagen; vorheriger Zustand wird wiederhergestellt" >&2
  if [ "$WH_VERSCHOBEN" = 1 ]; then
    rm -rf data 2>/dev/null || true
    mv "data.vor-wiederherstellung-$WH_ZEIT" data || echo "FEHLER: data.vor-wiederherstellung-$WH_ZEIT konnte nicht zurückbenannt werden, bitte von Hand prüfen" >&2
  fi
  [ "$WH_GESTOPPT" = 1 ] && { docker compose up -d --pull never || echo "FEHLER: Dienst konnte nicht gestartet werden, bitte von Hand prüfen" >&2; }
  exit "$([ "$rc" -ne 0 ] && echo "$rc" || echo 1)"
}

zurueck() {
  [ -f .vorheriger-digest ] || fehler ".vorheriger-digest fehlt (wird beim Wechsel mit ./betrieb.sh merken <digest> angelegt)"
  local alt; alt="$(cat .vorheriger-digest)"
  digest_ok "$alt" || fehler "gemerkter Digest ist kein sha256:<64 hex>"
  ziel_pruefen "$alt"
  tun sed -i "s|^IMAGE_DIGEST=.*|IMAGE_DIGEST=$alt|" .env
  tun docker compose up -d --pull never
  echo "Rücksprung auf $alt (Bild muss lokal vorliegen; es wird nie gezogen)."
}

merken() {
  digest_ok "${2:-}" || fehler "Digest angeben (sha256:<64 hex>): der AKTUELL laufende, vor dem Wechsel"
  ziel_pruefen "$2"
  tun sh -c "printf '%s\n' '$2' > .vorheriger-digest"
}

case "$befehl" in
  pruefen) pruefen ;;
  sichern) sichern ;;
  wiederherstellen) wiederherstellen "$@" ;;
  zurueck) zurueck ;;
  merken) merken "$@" ;;
  *) echo "Aufruf: $0 pruefen | sichern | wiederherstellen <archiv> | zurueck | merken <digest>   (+ --trocken)" >&2; exit 2 ;;
esac
