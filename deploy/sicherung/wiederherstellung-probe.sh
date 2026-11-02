#!/usr/bin/env bash
# =====================================================================
#  CENTRIC — Wiederherstellungsprobe (WP-04, monatlich)
#
#  Aufruf:  wiederherstellung-probe.sh [KONFIG] [--snapshot ID]
#           KONFIG Vorgabe: ~/.config/centric-sicherung/env (Modus 600)
#           ohne --snapshot: neuester Snapshot (Host-Kennung, Tag centric)
#
#  Ablauf — nichts davon berührt die laufende Anwendung oder /data:
#    1. restic restore in ein leeres Temp-Ziel
#    2. ablage-sicherung pruefen
#    3. ablage-sicherung wiederherstellen in ein leeres Datenziel
#       (prüft dabei den Pfeffer aus CENTRIC_ENV_DATEI gegen die Sicherung)
#    4. Manifest-Abgleich: gleich / abweichend / fehlend / überzählig
#    5. Probe-Container ohne Netz mit dem Produktionsbild auf dem Datenziel,
#       healthy abwarten, Bestände über die Leseschicht des Servers zählen
#    6. alles entfernen, probe-status.json schreiben, Ping
#
#  Exit-Codes: 0 gut · 1 Fehler · 75 anderer Lauf aktiv · 78 Konfiguration
# =====================================================================
set -Eeuo pipefail
umask 077

# shellcheck source=SCRIPTDIR/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

KONFIG="$HOME/.config/centric-sicherung/env"
SNAPSHOT="latest"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot)
      [[ $# -ge 2 && "$2" =~ ^[0-9a-f]{8,64}$ ]] || abbruch_konfig "--snapshot braucht eine Snapshot-ID (hex)"
      SNAPSHOT="$2"
      shift 2
      ;;
    -*) abbruch_konfig "unbekannte Option $1" ;;
    *)
      KONFIG="$1"
      shift
      ;;
  esac
done
konfig_laden "$KONFIG"

START_S="$(date +%s)"
START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SCHRITT="konfiguration"
ERGEBNIS=""
STATUS_DATEI=""
ARBEIT=""
PROBE_NAME=""
SNAPSHOT_ID=""
GLEICH=0 ABWEICHEND=0 FEHLEND=0 UEBERZAEHLIG=0 MANIFEST_N=0
BESTAENDE_ERWARTET=0 BESTAENDE_LESBAR=0 KONTEN=0
GESUND="nein"

aufraeumen() {
  if [[ -n "$PROBE_NAME" ]]; then docker rm -fv "$PROBE_NAME" >/dev/null 2>&1 || true; fi
  if [[ -n "$ARBEIT" && -d "$ARBEIT" ]]; then
    chmod -R u+rwX "$ARBEIT" 2>/dev/null || true
    rm -rf -- "$ARBEIT"
  fi
}

status_schreiben() {
  local dauer=$(($(date +%s) - START_S))
  status_ablegen "$STATUS_DATEI" "$(printf '{"art":"wiederherstellungsprobe","zeit":"%s","ergebnis":"%s","schritt":"%s","snapshot_id":"%s","manifest":%d,"gleich":%d,"abweichend":%d,"fehlend":%d,"ueberzaehlig":%d,"bestaende_erwartet":%d,"bestaende_lesbar":%d,"konten":%d,"healthy":"%s","dauer_s":%d,"bild":"%s"}' \
    "$START_ISO" "$1" "$SCHRITT" "$SNAPSHOT_ID" "$MANIFEST_N" "$GLEICH" "$ABWEICHEND" "$FEHLEND" "$UEBERZAEHLIG" \
    "$BESTAENDE_ERWARTET" "$BESTAENDE_LESBAR" "$KONTEN" "$GESUND" "$dauer" "${CENTRIC_PROD_IMAGE##*@}")"
}

# beenden wird über trap aufgerufen
# shellcheck disable=SC2317,SC2329
beenden() {
  local code=$?
  trap - EXIT
  set +e
  if [[ "$ERGEBNIS" == "gesperrt" ]]; then exit "$CODE_GESPERRT"; fi
  if [[ "$ERGEBNIS" != "ok" && -n "$PROBE_NAME" ]]; then
    log "Letzte Zeilen des Probe-Containers:"
    docker logs --tail 30 "$PROBE_NAME" 2>&1 | sed 's/^/  | /'
  fi
  aufraeumen
  if [[ "$ERGEBNIS" != "ok" ]]; then
    [[ $code -eq 0 ]] && code=1
    log "FEHLER: Wiederherstellungsprobe gescheitert in Schritt '$SCHRITT' (Code $code)"
    if [[ -n "$STATUS_DATEI" ]]; then status_schreiben "fehler"; fi
    ping_senden "$PROBE_PING_URL" "/fail" "centric-probe: fehler in schritt $SCHRITT (code $code)"
  fi
  log_abschliessen
  exit "$code"
}
trap beenden EXIT

konfig_pruefen
STATUS_DATEI="$STATUS_VERZEICHNIS/probe-status.json"

SCHRITT="sperre"
if ! sperre_nehmen; then ERGEBNIS="gesperrt"; exit "$CODE_GESPERRT"; fi

LOG="$STATUS_VERZEICHNIS/log/probe-$(date -u +%Y%m%dT%H%M%SZ).log"
log_umleiten "$LOG"
logs_ausduennen
log "Wiederherstellungsprobe beginnt (Snapshot: $SNAPSHOT)"
ping_senden "$PROBE_PING_URL" "/start" || true

ARBEIT="$(mktemp -d "$PROBE_ARBEITSORDNER/probe-XXXXXX")"
RESTIC_ZIEL="$ARBEIT/restic"
DATEN_ZIEL="$ARBEIT/daten"
mkdir -m 700 "$RESTIC_ZIEL" "$DATEN_ZIEL"

# --- 1. restic restore ---------------------------------------------------
SCHRITT="snapshot-waehlen"
if [[ "$SNAPSHOT" == "latest" ]]; then
  SNAPSHOT_ID="$("$RESTIC_BIN" snapshots --json --host "$RESTIC_HOST" --tag centric --latest 1 |
    grep -o '"id":"[0-9a-f]\{64\}"' | tail -n1 | cut -d'"' -f4 || true)"
  [[ -n "$SNAPSHOT_ID" ]] || { log "Kein Snapshot mit Host-Kennung $RESTIC_HOST und Tag centric gefunden"; exit 1; }
else
  SNAPSHOT_ID="$SNAPSHOT"
fi
log "Snapshot: $SNAPSHOT_ID"

SCHRITT="restic-restore"
"$RESTIC_BIN" restore "$SNAPSHOT_ID" --target "$RESTIC_ZIEL"
mapfile -t FERTIGE < <(find "$RESTIC_ZIEL" -type f -name FERTIG -path '*/centric-sicherung-*/FERTIG')
[[ ${#FERTIGE[@]} -eq 1 ]] || { log "Im Snapshot genau eine Sicherung erwartet, gefunden: ${#FERTIGE[@]}"; exit 1; }
SICHERUNG_ORDNER="$(dirname "${FERTIGE[0]}")"
log "Sicherung im Snapshot: $(basename "$SICHERUNG_ORDNER")"

# --- 2. pruefen ----------------------------------------------------------
SCHRITT="pruefen"
im_bild -v "$SICHERUNG_ORDNER:/sicherung:ro" -- \
  werkzeug/ablage-sicherung.mjs pruefen --sicherung /sicherung

# --- 3. wiederherstellen in leeres Datenziel -----------------------------
# Kein Netz im Container: Die Serverprüfung des Werkzeugs (/gesund auf
# 127.0.0.1) findet dort nie einen Server; das Ziel ist ohnehin ein leerer
# Temp-Ordner, die Produktionsdaten sind nicht eingebunden.
SCHRITT="wiederherstellen"
im_bild -v "$SICHERUNG_ORDNER:/sicherung:ro" -v "$DATEN_ZIEL:/ziel" -- \
  werkzeug/ablage-sicherung.mjs wiederherstellen --sicherung /sicherung --ziel /ziel

# --- 4. Manifest-Abgleich ------------------------------------------------
SCHRITT="manifest-abgleich"
ABGLEICH="$(im_bild -v "$SICHERUNG_ORDNER:/sicherung:ro" -v "$DATEN_ZIEL:/ziel:ro" \
  -v "$HILFEN_VERZ:/hilfen:ro" -- /hilfen/abgleich.mjs /sicherung /ziel | tail -n1)" || true
MANIFEST_N="$(printf '%s' "$ABGLEICH" | json_zahl manifest)"
GLEICH="$(printf '%s' "$ABGLEICH" | json_zahl gleich)"
ABWEICHEND="$(printf '%s' "$ABGLEICH" | json_zahl abweichend)"
FEHLEND="$(printf '%s' "$ABGLEICH" | json_zahl fehlend)"
UEBERZAEHLIG="$(printf '%s' "$ABGLEICH" | json_zahl ueberzaehlig)"
BESTAENDE_ERWARTET="$(printf '%s' "$ABGLEICH" | json_zahl bestaende_erwartet)"
for v in MANIFEST_N GLEICH ABWEICHEND FEHLEND UEBERZAEHLIG BESTAENDE_ERWARTET; do
  [[ "${!v}" =~ ^[0-9]+$ ]] || { log "Abgleich lieferte kein Ergebnis"; printf -v "$v" 0; exit 1; }
done
log "Manifest-Abgleich: $GLEICH gleich, $ABWEICHEND abweichend, $FEHLEND fehlend, $UEBERZAEHLIG überzählig (Manifest: $MANIFEST_N)"
[[ $GLEICH -eq $MANIFEST_N && $MANIFEST_N -gt 0 && $ABWEICHEND -eq 0 && $FEHLEND -eq 0 && $UEBERZAEHLIG -eq 0 ]] ||
  { log "Manifest-Abgleich nicht vollständig"; exit 1; }

# --- 5. Probe-Container ohne Netz ----------------------------------------
SCHRITT="probe-container"
PROBE_NAME="centric-probe-$(date -u +%Y%m%d%H%M%S)-$$"
docker run -d --name "$PROBE_NAME" --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --memory 512m \
  --user "$(id -u):$(id -g)" --env-file "$CENTRIC_ENV_DATEI" \
  -v "$DATEN_ZIEL:/data" -v "$HILFEN_VERZ:/hilfen:ro" \
  --health-interval 3s --health-start-period 5s --health-retries 3 \
  "$CENTRIC_PROD_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  zustand="$(docker inspect -f '{{.State.Health.Status}}' "$PROBE_NAME" 2>/dev/null || echo fehlt)"
  [[ "$zustand" == "healthy" ]] && break
  [[ "$zustand" == "unhealthy" || "$zustand" == "fehlt" ]] && break
  sleep 2
done
[[ "${zustand:-}" == "healthy" ]] || { log "Probe-Container nicht healthy (Zustand: ${zustand:-?})"; exit 1; }
GESUND="ja"
log "Probe-Container healthy (ohne Netz)"

SCHRITT="bestaende-lesen"
ZAEHLUNG="$(docker exec "$PROBE_NAME" node /hilfen/bestaende-zaehlen.mjs | tail -n1)" || true
BESTAENDE_LESBAR="$(printf '%s' "$ZAEHLUNG" | json_zahl lesbar)"
KONTEN="$(printf '%s' "$ZAEHLUNG" | json_zahl konten)"
FEHLER_N="$(printf '%s' "$ZAEHLUNG" | json_zahl fehler)"
: "${BESTAENDE_LESBAR:=0}" "${KONTEN:=0}" "${FEHLER_N:=1}"
log "Bestände lesbar: $BESTAENDE_LESBAR von $BESTAENDE_ERWARTET, Lesefehler: $FEHLER_N, Konten: $KONTEN"
[[ $FEHLER_N -eq 0 && $BESTAENDE_LESBAR -eq $BESTAENDE_ERWARTET ]] ||
  { log "Nicht alle Bestände lesbar"; exit 1; }
if [[ $BESTAENDE_ERWARTET -eq 0 ]]; then log "WARNUNG: Die Sicherung enthält keinen einzigen Bestand"; fi

# --- 6. aufräumen, Status, Ping ------------------------------------------
SCHRITT="fertig"
aufraeumen
PROBE_NAME=""
ARBEIT=""
ERGEBNIS="ok"
status_schreiben "ok"
log "Wiederherstellungsprobe bestanden: Snapshot $SNAPSHOT_ID, $GLEICH gleich, 0 abweichend, 0 fehlend, $BESTAENDE_LESBAR Bestände lesbar, $(($(date +%s) - START_S)) s"
ping_senden "$PROBE_PING_URL" "" "centric-probe ok: snapshot $SNAPSHOT_ID, $GLEICH gleich, $BESTAENDE_LESBAR bestaende" ||
  log "WARNUNG: Erfolgs-Ping fehlgeschlagen"
exit 0
