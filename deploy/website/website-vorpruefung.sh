#!/bin/bash
# CENTRIC - Vorpruefung fuer die Hauptwebsite. NUR LESEND: aendert nichts, startet nichts neu.
# Auf dem VPS ausfuehren:   ./website-vorpruefung.sh [caddy-container-name]     (Vorgabe: caddy)
# Ergebnis: ob "Variante B" (ohne Caddy-Neustart) sauber moeglich ist, und die fertigen export-Zeilen
# fuer website-ausliefern.sh. Gibt keine Geheimnisse aus.
set -u
C="${1:-caddy}"
ok=1
say() { echo "$*"; }
nein() { echo "  NEIN: $*"; ok=0; }

say "== Container"
if [ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" != "true" ]; then
  echo "Container '$C' laeuft nicht oder existiert nicht. Namen pruefen: docker ps"; exit 1
fi
docker inspect -f '  Name {{.Name}}  Image {{.Config.Image}}  Status {{.State.Status}}' "$C"

say "== Eingehaengte Verzeichnisse (Typ  Host-Pfad -> Container-Pfad  rw/ro)"
docker inspect -f '{{range .Mounts}}  {{.Type}}  {{.Source}} -> {{.Destination}}  {{if .RW}}rw{{else}}ro{{end}}{{println}}{{end}}' "$C"

say "== import-Zeile in der Hauptdatei"
IMP="$(docker exec "$C" sh -c "grep -n -E '^[[:space:]]*import' /etc/caddy/Caddyfile" 2>/dev/null)"
echo "${IMP:-  (keine import-Zeile gefunden)}"
echo "$IMP" | grep -q -E 'sites/\*\.caddy' && say "  OK: sites/*.caddy wird importiert" || nein "keine Zeile 'import sites/*.caddy' gefunden"

say "== Welcher Host-Pfad ist /etc/caddy/sites?"
SRC_SITES="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/sites"}}{{.Source}}{{end}}{{end}}' "$C")"
SRC_ETC="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}' "$C")"
SITES=""
if [ -n "$SRC_SITES" ]; then SITES="$SRC_SITES"; elif [ -n "$SRC_ETC" ]; then SITES="${SRC_ETC%/}/sites"; fi
if [ -z "$SITES" ]; then nein "weder /etc/caddy/sites noch /etc/caddy ist vom Host eingehaengt (Dateien liegen nur im Container/Image)"; else
  echo "  Host-Pfad: $SITES"
  [ -d "$SITES" ] && echo "  Verzeichnis vorhanden" || nein "Verzeichnis $SITES existiert auf dem Host nicht"
  ls "$SITES" 2>/dev/null | sed 's/^/    /'
  grep -qs -F "app.centric-dienstplanung.de" "$SITES"/*.caddy && echo "  OK: App-Site-Datei liegt dort" || nein "App-Site-Datei (app.centric-dienstplanung.de) liegt dort nicht - falscher Pfad?"
  if [ -w "$SITES" ]; then echo "  OK: fuer diesen Benutzer beschreibbar"; else nein "nicht beschreibbar fuer $(id -un) - mit sudo ausfuehren oder Rechte klaeren"; fi
  df -P "$SITES" | tail -1 | awk '{print "  Platz frei: " $4 " KB"}'
fi

say "== Persistenz der Zertifikate (/data im Caddy-Container)"
docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}  /data: {{.Type}} {{.Source}}{{end}}{{end}}' "$C"
docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}1{{end}}{{end}}' "$C" | grep -q 1 \
  && say "  OK: /data ist eingehaengt (Zertifikate bleiben auch bei einem Neustart erhalten)" \
  || say "  HINWEIS: /data ist NICHT eingehaengt - bei einem Neustart gingen Zertifikate verloren (nur relevant fuer Variante A)."

say "== Ergebnis"
if [ "$ok" = 1 ]; then
  say "VARIANTE B IST MOEGLICH (kein Caddy-Neustart, nur 'caddy reload'). Naechster Schritt:"
  say "  export CADDY_CONTAINER=$C"
  say "  export SITES_DIR_HOST=$SITES"
  say "  export WEB_DIR_HOST=$SITES/centric-website"
  say "  export WEB_ROOT_CONTAINER=/etc/caddy/sites/centric-website"
  say "  mkdir -p \"\$WEB_DIR_HOST\""
  say "  ./website-ausliefern.sh ~/website-dist"
else
  say "VARIANTE B IST SO NICHT MOEGLICH (siehe NEIN-Zeilen). Dann Variante A (Mount, kurzer Caddy-Neustart) -"
  say "bitte die Ausgabe dieses Skripts senden; nichts wurde geaendert."
fi
