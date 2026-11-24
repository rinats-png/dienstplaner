#!/bin/bash
# Prueft die ECHTE Site-Datei der Hauptwebsite (deploy/website/centric-dienstplanung.de.caddy) mit dem echten
# Caddy-Bild. Kein Netz zu Dritten, keine Zertifikate. Aufruf (CI, Linux mit Docker):
#   CADDY_BILD='caddy:2-alpine@sha256:...' bash pruefungen/website-caddy.sh
#
# 1. validate + adapt der Gesamtkonfiguration "import sites/*.caddy" mit der Site-Datei (aus der Vorlage gebaut
#    wie von website-ausliefern.sh, mit und ohne www-Block) und einer Attrappen-App-Site; der www-Block muss im
#    adaptierten JSON genau dann vorkommen, wenn er gebaut wurde.
# 2. Rauchtest: Caddy laeuft mit derselben Site-Datei (nur die Adressen auf http://...:8080 gesetzt, damit
#    kein Zertifikat gebraucht wird) gegen ein Dummy-dist: 200 fuer /, 404 mit eigener Fehlerseite fuer eine
#    unbekannte Seite, Sicherheits-Kopfzeilen auch auf dem 404, kein Server-Kopf, 301 fuer www.
set -euo pipefail

BILD="${CADDY_BILD:?CADDY_BILD (Bild mit Digest) fehlt}"
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VORLAGE="$WURZEL/deploy/website/centric-dienstplanung.de.caddy"
# shellcheck source=../deploy/website/website-lib.sh
. "$WURZEL/deploy/website/website-lib.sh"

W="$(mktemp -d)"
NAME="cs-smoke-$$"
aufraeumen() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$W"; }
trap aufraeumen EXIT
fehl() { echo "FEHLER: $*" >&2; exit 1; }

caddy_cmd() { # verzeichnis args...
  local d="$1"; shift
  docker run --rm --network none -v "$d:/etc/caddy:ro" "$BILD" caddy "$@" --config /etc/caddy/Caddyfile --adapter caddyfile
}

# --- 1. validate + adapt, mit und ohne www
for MIT in 1 0; do
  D="$W/v$MIT"; mkdir -p "$D/sites"
  printf 'import sites/*.caddy\n' > "$D/Caddyfile"
  printf 'app.centric-dienstplanung.de {\n\trespond "app" 200\n}\n' > "$D/sites/app.centric-dienstplanung.de.caddy"
  site_datei_bauen "$VORLAGE" "$D/sites/centric-dienstplanung.de.caddy" /srv/centric-website "$MIT"
  echo "== validate (www=$MIT)"
  caddy_cmd "$D" validate
  echo "== adapt (www=$MIT)"
  caddy_cmd "$D" adapt > "$W/adapt$MIT.json"
  grep -q '"centric-dienstplanung.de"' "$W/adapt$MIT.json" || fehl "Hauptdomain fehlt im adaptierten JSON (www=$MIT)"
  grep -q '"app.centric-dienstplanung.de"' "$W/adapt$MIT.json" || fehl "App-Attrappe fehlt im adaptierten JSON (www=$MIT)"
  if [ "$MIT" = 1 ]; then
    grep -q '"www.centric-dienstplanung.de"' "$W/adapt$MIT.json" || fehl "www-Block fehlt, obwohl gebaut (www=1)"
  else
    if grep -q '"www.centric-dienstplanung.de"' "$W/adapt$MIT.json"; then fehl "www-Block vorhanden, obwohl weggelassen (www=0)"; fi
  fi
done

# --- 2. Rauchtest
S="$W/smoke"; mkdir -p "$S/sites" "$W/dist/assets"
printf '{\n\tauto_https off\n\tadmin off\n}\nimport sites/*.caddy\n' > "$S/Caddyfile"
site_datei_bauen "$VORLAGE" "$W/site-gebaut.caddy" /srv/centric-website 1
sed -e 's#^www\.centric-dienstplanung\.de {#http://www.centric-dienstplanung.de:8080 {#' \
    -e 's#^centric-dienstplanung\.de {#http://centric-dienstplanung.de:8080 {#' \
    "$W/site-gebaut.caddy" > "$S/sites/centric-dienstplanung.de.caddy"
grep -q '^http://centric-dienstplanung.de:8080 {' "$S/sites/centric-dienstplanung.de.caddy" || fehl "Adressumschreibung (Hauptdomain) hat nichts getroffen"
grep -q '^http://www.centric-dienstplanung.de:8080 {' "$S/sites/centric-dienstplanung.de.caddy" || fehl "Adressumschreibung (www) hat nichts getroffen"
printf '<html>start-ok</html>' > "$W/dist/index.html"
printf '<html>404-seite</html>' > "$W/dist/404.html"
printf 'body{}' > "$W/dist/assets/site.css"
chmod -R a+rX "$W/dist" "$S"

docker run -d --name "$NAME" -p 127.0.0.1:18080:8080 \
  -v "$S:/etc/caddy:ro" -v "$W/dist:/srv/centric-website/aktuell:ro" \
  "$BILD" caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

holen() { # host pfad -> schreibt $W/kopf, $W/koerper, gibt den Statuscode aus
  curl -sS --max-time 5 -H "Host: $1" -D "$W/kopf" -o "$W/koerper" -w '%{http_code}' "http://127.0.0.1:18080$2"
}
BEREIT=0
for _ in $(seq 1 40); do
  if [ "$(holen centric-dienstplanung.de / 2>/dev/null || true)" = 200 ]; then BEREIT=1; break; fi
  sleep 0.5
done
if [ "$BEREIT" != 1 ]; then docker logs "$NAME" >&2 || true; fehl "Caddy antwortet nicht auf 127.0.0.1:18080"; fi

kopf_hat() { grep -i -q "^$1" "$W/kopf" || { cat "$W/kopf" >&2; fehl "Kopfzeile '$1' fehlt ($2)"; }; }

echo "== / (200)"
[ "$(holen centric-dienstplanung.de /)" = 200 ] || fehl "/ liefert nicht 200"
grep -q 'start-ok' "$W/koerper" || fehl "/ liefert nicht index.html"
kopf_hat 'strict-transport-security:' "/"
kopf_hat 'x-content-type-options: nosniff' "/"
kopf_hat 'content-security-policy:' "/"
if grep -i -q '^server:' "$W/kopf"; then fehl "Server-Kopfzeile vorhanden (soll entfernt sein)"; fi

echo "== /assets/site.css (200)"
[ "$(holen centric-dienstplanung.de /assets/site.css)" = 200 ] || fehl "/assets/site.css liefert nicht 200"

echo "== /gibt-es-nicht (404, eigene Seite, Kopfzeilen)"
CODE="$(holen centric-dienstplanung.de /gibt-es-nicht)"
[ "$CODE" = 404 ] || fehl "unbekannte Seite liefert $CODE statt 404"
grep -q '404-seite' "$W/koerper" || fehl "404 liefert nicht dist/404.html"
kopf_hat 'strict-transport-security:' "404"
kopf_hat 'x-content-type-options: nosniff' "404"
kopf_hat 'content-security-policy:' "404"
if grep -i -q '^server:' "$W/kopf"; then fehl "Server-Kopfzeile auf dem 404 vorhanden"; fi

echo "== www (301 auf die Hauptdomain)"
UMLEITUNG="$(curl -sS --max-time 5 -H 'Host: www.centric-dienstplanung.de' -o /dev/null -w '%{http_code} %{redirect_url}' 'http://127.0.0.1:18080/pfad?x=1')"
[ "$UMLEITUNG" = "301 https://centric-dienstplanung.de/pfad?x=1" ] || fehl "www leitet nicht korrekt um: $UMLEITUNG"

echo "OK: Site-Datei mit echtem Caddy geprueft (validate, adapt, Rauchtest)."
