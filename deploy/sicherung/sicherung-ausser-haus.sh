#!/usr/bin/env bash
# =====================================================================
#  CENTRIC — tägliche Sicherung außer Haus (WP-04)
#
#  Aufruf:  sicherung-ausser-haus.sh [KONFIG]
#           KONFIG Vorgabe: ~/.config/centric-sicherung/env (Modus 600)
#
#  Ablauf
#    0. Konfiguration lesen und prüfen, Sperre nehmen, Start-Ping
#    1. Zugang zum restic-Repository prüfen (Passwort, Erreichbarkeit)
#    2. ablage-sicherung sichern  — Produktionsbild, Daten read-only, kein Netz
#    2a Plausibilität: nicht leer, Store centric nicht leer, kein Schwund
#       über SCHWUND_GRENZE_PROZENT, Pfeffer vom Werkzeug gesehen
#    3. ablage-sicherung pruefen
#    4. restic backup (Tags: centric, datum=…, bild=sha256:…)
#    5. restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
#    6. restic check --read-data-subset 5%
#    7. lokale Kopien bis auf LOKAL_BEHALTEN löschen
#    8. status.json schreiben, Erfolgs-Ping
#  Jeder Fehler (auch Zeitüberschreitung): status.json mit ergebnis=fehler
#  und Ping an <URL>/fail.
#
#  Exit-Codes: 0 gut · 75 anderer Lauf aktiv · 78 Konfiguration ·
#              sonst Fehler (Code des fehlgeschlagenen Befehls, 124 = Zeitgrenze)
#  Einrichtung und Grenzen: docs/BETRIEB-SICHERUNG.md
# =====================================================================
set -Eeuo pipefail
umask 077

# shellcheck source=SCRIPTDIR/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

KONFIG="${1:-$HOME/.config/centric-sicherung/env}"
konfig_laden "$KONFIG"

START_S="$(date +%s)"
START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SCHRITT="konfiguration"
ERGEBNIS=""          # "" = noch offen, "ok", "gesperrt"
SICHERUNG_NAME=""
DATEIEN=0
BYTES=0
SNAPSHOT_ID=""
DATEN_HINZU=0
STATUS_DATEI=""
LETZTE_DATEI=""
WERKZEUG_FEHLER=""
BACKUP_JSON=""

# beenden wird über trap aufgerufen
# shellcheck disable=SC2317,SC2329
beenden() {
  local code=$?
  trap - EXIT
  set +e
  pfeffer_env_weg
  rm -f -- "${WERKZEUG_FEHLER:-}" "${BACKUP_JSON:-}" 2>/dev/null
  if [[ "$ERGEBNIS" == "gesperrt" ]]; then exit "$CODE_GESPERRT"; fi
  if [[ "$ERGEBNIS" != "ok" ]]; then
    [[ $code -eq 0 ]] && code=1
    log "FEHLER: Sicherung abgebrochen in Schritt '$SCHRITT' (Code $code)"
    if [[ -n "$STATUS_DATEI" ]]; then status_schreiben "fehler"; fi
    ping_senden "$ALARM_PING_URL" "/fail" "centric-sicherung: fehler in schritt $SCHRITT (code $code)"
  fi
  log_abschliessen
  exit "$code"
}
trap beenden EXIT

status_schreiben() {
  local dauer=$(($(date +%s) - START_S))
  status_ablegen "$STATUS_DATEI" "$(printf '{"art":"sicherung","zeit":"%s","ergebnis":"%s","schritt":"%s","sicherung":"%s","dateien":%d,"bytes":%d,"snapshot_id":"%s","daten_hinzugefuegt":%d,"dauer_s":%d,"bild":"%s"}' \
    "$START_ISO" "$1" "$SCHRITT" "$SICHERUNG_NAME" "$DATEIEN" "$BYTES" "$SNAPSHOT_ID" "$DATEN_HINZU" "$dauer" "${CENTRIC_PROD_IMAGE##*@}")"
}

konfig_pruefen
STATUS_DATEI="$STATUS_VERZEICHNIS/status.json"
LETZTE_DATEI="$STATUS_VERZEICHNIS/letzte-erfolgreiche.json"

SCHRITT="sperre"
if ! sperre_nehmen; then ERGEBNIS="gesperrt"; exit "$CODE_GESPERRT"; fi

LOG="$STATUS_VERZEICHNIS/log/sicherung-$(date -u +%Y%m%dT%H%M%SZ).log"
log_umleiten "$LOG"
logs_ausduennen
log "Sicherung außer Haus beginnt (Bild ${CENTRIC_PROD_IMAGE##*@}, Host-Kennung $RESTIC_HOST)"
ping_senden "$ALARM_PING_URL" "/start" || true

# --- 1. Repository erreichbar und Passwort richtig? --------------------
SCHRITT="repository-zugang"
restic_lauf cat config >/dev/null
log "restic-Repository erreichbar, Passwort passt"

# --- 2. sichern ----------------------------------------------------------
SCHRITT="sichern"
pfeffer_env_anlegen
WERKZEUG_FEHLER="$(mktemp "$STATUS_VERZEICHNIS/.werkzeug-XXXXXX")"
# Schreib-Halt (WP-28c): Den Halte-Ordner legt der laufende Server in seinem
# Zustandsverzeichnis an. Nur dieser Ordner wird beschreibbar eingebunden
# (nicht die Schlüsselepoche daneben). Fehlt er, sichert das Werkzeug wie
# bisher mit Ruhezeit.
HALT_OPTS=()
HALT_ARGS=()
HALT_PFAD="${CENTRIC_SCHREIBHALT_PFAD:-$(dirname "$CENTRIC_DATEN_PFAD")/zustand/schreibhalt}"
if [[ -d "$HALT_PFAD" ]]; then
  HALT_OPTS=(-v "$HALT_PFAD:/schreibhalt")
  HALT_ARGS=(--schreibhalt /schreibhalt)
  log "Schreib-Halt: Kanal $HALT_PFAD"
else
  log "Schreib-Halt: kein Kanal ($HALT_PFAD fehlt) — Sicherung mit Ruhezeit"
fi
AUSGABE="$(im_bild -v "$CENTRIC_DATEN_PFAD:/data:ro" -v "$LOKAL_ZIEL:/sicherungen" ${HALT_OPTS[@]+"${HALT_OPTS[@]}"} -- \
  werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen ${HALT_ARGS[@]+"${HALT_ARGS[@]}"} 2>"$WERKZEUG_FEHLER")" ||
  { cat "$WERKZEUG_FEHLER" >&2; exit 1; }
cat "$WERKZEUG_FEHLER" >&2
printf '%s\n' "$AUSGABE"
SICHERUNG_NAME="$(printf '%s\n' "$AUSGABE" | sed -n 's|^Sicherung vollständig: /sicherungen/\(centric-sicherung-[0-9TZ]*\)$|\1|p')"
[[ -n "$SICHERUNG_NAME" && -f "$LOKAL_ZIEL/$SICHERUNG_NAME/FERTIG" ]] ||
  { log "Ausgabe des Werkzeugs nicht erkannt oder Sicherung ohne FERTIG"; exit 1; }
read -r DATEIEN BYTES < <(printf '%s\n' "$AUSGABE" | sed -n 's/^  \([0-9]*\) Dateien, \([0-9]*\) Bytes$/\1 \2/p') || true
[[ "${DATEIEN:-}" =~ ^[0-9]+$ && "${BYTES:-}" =~ ^[0-9]+$ ]] || { log "Dateizahl/Bytes nicht erkannt"; exit 1; }

# --- 2a. Plausibilität: nie eine leere, geschrumpfte oder pfefferlose
#         Sicherung als Erfolg melden ------------------------------------
SCHRITT="plausibilitaet"
if grep -q "CENTRIC_PFEFFER ist nicht gesetzt" "$WERKZEUG_FEHLER"; then
  log "Das Werkzeug sah keinen CENTRIC_PFEFFER — Sicherung nicht gegenprüfbar"
  exit 1
fi
CENTRIC_N="$(printf '%s\n' "$AUSGABE" | sed -n 's/^  centric (A): \([0-9]*\) Dateien$/\1/p')"
: "${CENTRIC_N:=0}"
if [[ "$DATEIEN" -eq 0 || "$CENTRIC_N" -eq 0 ]]; then
  log "Leere Sicherung ($DATEIEN Dateien, Store centric: $CENTRIC_N) — falscher Datenpfad oder Datenverlust?"
  exit 1
fi
if [[ -f "$LETZTE_DATEI" && "$SCHWUND_GRENZE_PROZENT" -lt 100 ]]; then
  VORHER_N="$(json_zahl dateien <"$LETZTE_DATEI" || true)"
  if [[ "${VORHER_N:-}" =~ ^[0-9]+$ && "$VORHER_N" -gt 0 ]] &&
    ((DATEIEN * 100 < VORHER_N * (100 - SCHWUND_GRENZE_PROZENT))); then
    log "Dateizahl fiel von $VORHER_N auf $DATEIEN (Rückgang über $SCHWUND_GRENZE_PROZENT %) — Abbruch."
    log "Gewollt (z. B. Betrieb gelöscht)? Dann $LETZTE_DATEI entfernen und erneut sichern."
    exit 1
  fi
fi

# --- 3. pruefen ----------------------------------------------------------
SCHRITT="pruefen"
im_bild -v "$LOKAL_ZIEL:/sicherungen:ro" -- \
  werkzeug/ablage-sicherung.mjs pruefen --sicherung "/sicherungen/$SICHERUNG_NAME"

# --- 4. restic backup ----------------------------------------------------
SCHRITT="restic-backup"
DATUM="$(date -u +%Y-%m-%d)"
BACKUP_JSON="$(mktemp "$STATUS_VERZEICHNIS/.backup-XXXXXX")"
# restic legt den absoluten Pfad ab (…/lokal/centric-sicherung-<UTC>/…);
# die Probe findet die Sicherung im Restore über FERTIG, nicht über den Pfad.
restic_lauf backup --json --host "$RESTIC_HOST" \
  --tag centric --tag "datum=$DATUM" --tag "bild=${CENTRIC_PROD_IMAGE##*@}" \
  "$LOKAL_ZIEL/$SICHERUNG_NAME" >"$BACKUP_JSON"
ZUSAMMENFASSUNG="$(grep '"message_type":"summary"' "$BACKUP_JSON" | tail -n1 || true)"
SNAPSHOT_ID="$(printf '%s' "$ZUSAMMENFASSUNG" | json_text snapshot_id)"
DATEN_HINZU="$(printf '%s' "$ZUSAMMENFASSUNG" | json_zahl data_added)"
: "${DATEN_HINZU:=0}"
[[ "$SNAPSHOT_ID" =~ ^[0-9a-f]{8,64}$ ]] || { log "restic meldete keinen Snapshot"; exit 1; }
log "restic-Snapshot $SNAPSHOT_ID angelegt ($DATEN_HINZU Bytes neu im Repository)"

# --- 5. Aufbewahrung -----------------------------------------------------
# Gruppiert nur nach Host-Kennung: Pfad und Tags (Datum, Bild) ändern sich
# bei jedem Lauf und dürfen keine eigenen Gruppen bilden.
SCHRITT="restic-forget"
restic_lauf forget --host "$RESTIC_HOST" --tag centric --group-by host \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune

# --- 6. Stichprobe der Daten im Repository ------------------------------
SCHRITT="restic-check"
restic_lauf check --read-data-subset "$CHECK_ANTEIL"

# --- 7. lokale Kopien ausdünnen ------------------------------------------
SCHRITT="lokal-ausduennen"
mapfile -t LOKALE < <(find "$LOKAL_ZIEL" -mindepth 1 -maxdepth 1 -type d -name 'centric-sicherung-*' -printf '%f\n' | sort)
if ((${#LOKALE[@]} > LOKAL_BEHALTEN)); then
  for alt in "${LOKALE[@]:0:${#LOKALE[@]}-LOKAL_BEHALTEN}"; do
    [[ "$alt" == "$SICHERUNG_NAME" ]] && continue
    rm -rf -- "${LOKAL_ZIEL:?}/$alt"
    log "lokale Kopie entfernt: $alt"
  done
fi

# --- 8. Status und Erfolgs-Ping ------------------------------------------
SCHRITT="fertig"
ERGEBNIS="ok"
status_schreiben "ok"
status_ablegen "$LETZTE_DATEI" "$(printf '{"zeit":"%s","dateien":%d,"bytes":%d,"snapshot_id":"%s"}' \
  "$START_ISO" "$DATEIEN" "$BYTES" "$SNAPSHOT_ID")"
log "Sicherung außer Haus vollständig: $SICHERUNG_NAME, $DATEIEN Dateien, $BYTES Bytes, Snapshot $SNAPSHOT_ID, $(($(date +%s) - START_S)) s"
ping_senden "$ALARM_PING_URL" "" "centric-sicherung ok: $DATEIEN dateien, $BYTES bytes, snapshot $SNAPSHOT_ID" ||
  log "WARNUNG: Erfolgs-Ping fehlgeschlagen — der Totmannschalter wird Alarm geben"
exit 0
