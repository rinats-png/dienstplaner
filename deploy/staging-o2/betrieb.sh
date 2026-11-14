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
  tun install -d -m 700 sicherungen
  tun docker compose stop centric-staging-web
  tun tar -C . -czf "sicherungen/data-$zeit.tar.gz" data
  tun docker compose up -d --pull never
  echo "Sicherung: sicherungen/data-$zeit.tar.gz (Prüfsumme folgt)"
  [ "$TROCKEN" = 1 ] || sha256sum "sicherungen/data-$zeit.tar.gz" > "sicherungen/data-$zeit.tar.gz.sha256"
}

wiederherstellen() {
  local arch="${2:-}"
  [ -n "$arch" ] && [ "$arch" != "--trocken" ] || fehler "Archiv angeben: ./betrieb.sh wiederherstellen sicherungen/data-<zeit>.tar.gz"
  [ -f "$arch" ] || fehler "Archiv nicht gefunden"
  if [ -f "$arch.sha256" ]; then sha256sum -c "$arch.sha256" >/dev/null || fehler "Prüfsumme stimmt nicht"; else fehler "Prüfsumme $arch.sha256 fehlt"; fi
  local zeit; zeit="$(date -u +%Y%m%dT%H%M%SZ)"
  tun docker compose stop centric-staging-web
  tun mv data "data.vor-wiederherstellung-$zeit"
  tun tar -C . -xzf "$arch"
  tun docker compose up -d --pull never
  echo "Danach prüfen: curl -sf https://\$STAGING_HOST/gesund, Anmeldung, Zähler gegen Sicherung (STAGING-O2-VORBEREITUNG.md)."
}

zurueck() {
  [ -f .vorheriger-digest ] || fehler ".vorheriger-digest fehlt (wird beim Wechsel mit ./betrieb.sh merken <digest> angelegt)"
  local alt; alt="$(cat .vorheriger-digest)"
  digest_ok "$alt" || fehler "gemerkter Digest ist kein sha256:<64 hex>"
  tun sed -i "s|^IMAGE_DIGEST=.*|IMAGE_DIGEST=$alt|" .env
  tun docker compose up -d --pull never
  echo "Rücksprung auf $alt (Bild muss lokal vorliegen; es wird nie gezogen)."
}

merken() {
  digest_ok "${2:-}" || fehler "Digest angeben (sha256:<64 hex>): der AKTUELL laufende, vor dem Wechsel"
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
