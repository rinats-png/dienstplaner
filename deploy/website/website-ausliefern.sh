#!/bin/bash
# CENTRIC-Website auf den VPS legen (statische Dateien). Auf dem VPS ausfuehren, NACH Freigabe durch den Betreiber.
# Nutzung: website-ausliefern.sh <pfad-zum-entpackten-dist-ordner>
# Schritte: Sicherung der Caddy-Konfiguration -> Dateien atomar austauschen -> Konfiguration pruefen -> Caddy neu laden -> Gegenprobe.
# Rueckweg: Das Skript legt /srv/centric-website.vorher an und sichert die Caddy-Konfiguration; siehe Ausgabe am Ende.
set -euo pipefail
QUELLE="${1:?Pfad zum dist-Ordner fehlt}"
ZIEL=/srv/centric-website
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
[ -f "$QUELLE/index.html" ] || { echo "FEHLER: $QUELLE/index.html fehlt – falscher Ordner?"; exit 1; }
echo "1) Sicherung der Caddy-Konfiguration"
cp -a "$CADDYFILE" "$CADDYFILE.vor-website-$STAMP"
echo "2) Dateien austauschen (atomar)"
NEU="$ZIEL.neu-$STAMP"; mkdir -p "$NEU"; cp -a "$QUELLE"/. "$NEU"/
[ -d "$ZIEL" ] && mv "$ZIEL" "$ZIEL.vorher"
mv "$NEU" "$ZIEL"
echo "3) Caddy-Block fuer die Hauptdomain: pruefen, ob vorhanden"
if ! grep -q '^centric-dienstplanung\.de' "$CADDYFILE"; then
  echo "Der Block fehlt. Bitte deploy/website/Caddy-Hauptdomain.vorlage an $CADDYFILE anhaengen (nur Hauptdomain/www; den App-Block NICHT aendern), dann dieses Skript erneut starten."
  exit 2
fi
echo "4) Konfiguration pruefen und neu laden"
caddy validate --config "$CADDYFILE"
systemctl reload caddy
echo "5) Gegenprobe"
sleep 3
curl -s -o /dev/null -w "Hauptdomain: %{http_code}\n" --resolve centric-dienstplanung.de:443:127.0.0.1 https://centric-dienstplanung.de/ || true
curl -s -o /dev/null -w "App:         %{http_code}\n" --resolve app.centric-dienstplanung.de:443:127.0.0.1 https://app.centric-dienstplanung.de/ || true
echo "Rueckweg: cp -a $CADDYFILE.vor-website-$STAMP $CADDYFILE && systemctl reload caddy ; rm -rf $ZIEL && mv $ZIEL.vorher $ZIEL"
