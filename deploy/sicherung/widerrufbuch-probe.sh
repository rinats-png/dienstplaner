#!/usr/bin/env bash
# =====================================================================
#  CENTRIC — Wiederherstellungsprobe der Widerrufbücher (BE-3, monatlich)
#
#  Aufruf:  widerrufbuch-probe.sh [--alt ID] [KONFIG]
#           KONFIG Vorgabe: ~/.config/centric-sicherung/widerrufbuch.env (Modus 600,
#           dieselbe Datei wie widerrufbuch-sicherung.sh — eigenes Repository)
#           --alt ID: Vergleichs-Snapshot für die Gegenprobe (Vorgabe: der
#           älteste Snapshot der Host-Kennung)
#
#  Ergänzt den stündlichen Job, ersetzt ihn nicht. Der Job prüft bei jedem
#  Lauf nur den NEUESTEN Snapshot (zurückholen, bytegleich, Siegel) und liest
#  mit `check` nur einen Anteil. Diese Probe weist unabhängig davon nach:
#    1. restic check --read-data: das GANZE Repository ist lesbar
#    2. neuester und Vergleichs-Snapshot lassen sich in leere Temp-Ordner
#       zurückholen; Prüfsummen (sha256) beider Stände im Log und in der
#       Statusdatei; neuester Stand bytegleich mit der Stufe des letzten
#       erfolgreichen Jobs (falls dessen Snapshot der neueste ist)
#    3. Siegel gültig, und das LAUFENDE Widerrufbuch (Kopie der beiden Bücher,
#       nie das ganze Zustandsverzeichnis) enthält alles aus dem neuesten
#       Snapshot — sonst Rücksprung seit der letzten Sicherung: Exit 3, Alarm
#    4. Rollback-Gegenprobe: der ältere Snapshot wird als „aktueller“ Stand
#       gegen den neuesten geprüft. Unterscheiden sie sich, MUSS das Werkzeug
#       einen Rücksprung melden (Code 3) — Beleg, dass die Erkennung mit den
#       echten, gesicherten Daten greift. Gleicher Inhalt: „nicht
#       aussagekräftig“ (Hinweis, kein Fehler).
#  Nichts davon schreibt in das Zustandsverzeichnis, die Daten oder das
#  Repository (kein backup, kein forget). Sperre: dieselbe wie der Job
#  (widerrufbuch.lock), damit kein forget --prune Snapshots während der
#  Probe entfernt.
#
#  Exit-Codes: 0 gut · 1 Fehler (Werkzeug, Abweichung zur Stufe, kein
#  Snapshot) · 3 Rücksprung im laufenden Buch · 4 restic gescheitert ·
#  75 anderer Lauf · 78 Konfiguration (auch restic < 0.16.0, wie der Job)
#  Annahme (in der Staging-Übung mit echtem restic zu bestätigen, wie B3-8):
#  `restic snapshots --json` liefert die Snapshots zeitlich aufsteigend.
#  Einrichtung: docs/BETRIEB-SICHERUNG.md §7, docs/acc45/INFRA-VORBEREITUNG-STAGING-BACKUP.md
# =====================================================================
set -Eeuo pipefail
umask 077

# shellcheck source=SCRIPTDIR/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

readonly WB_TAG=widerrufbuch
readonly BUECHER=(zugang-widerrufe.json konto-widerrufe.json)
readonly CODE_RUECKSPRUNG=3
readonly CODE_RESTIC=4

ALT_WUNSCH=""
KONFIG="$HOME/.config/centric-sicherung/widerrufbuch.env"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --alt)
      [[ $# -ge 2 && "$2" =~ ^[0-9a-f]{8,64}$ ]] || abbruch_konfig "--alt braucht eine Snapshot-ID (hex)"
      ALT_WUNSCH="$2"
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
ERGEBNIS=""          # "" offen, "ok", "gesperrt", "ruecksprung"
STATUS_DATEI=""
ARBEIT=""
NEU_ID="" ALT_ID="" SNAPSHOTS=0
GEGENPROBE="offen"   # erkannt | nicht-aussagekraeftig | nicht-moeglich
GEGEN_FEHLEND=0 LIVE_FEHLEND=0
SUMMEN=""            # "datei=sha256;…" des neuesten Stands (keine Geheimnisse)

# beenden wird über trap aufgerufen
# shellcheck disable=SC2317,SC2329
beenden() {
  local code=$?
  trap - EXIT
  set +e
  pfeffer_env_weg
  if [[ -n "$ARBEIT" && -d "$ARBEIT" ]]; then rm -rf -- "${ARBEIT:?}"; fi
  if [[ "$ERGEBNIS" == "gesperrt" ]]; then exit "$CODE_GESPERRT"; fi
  if [[ "$ERGEBNIS" != "ok" ]]; then
    [[ $code -eq 0 ]] && code=1
    [[ $code -eq $CODE_RUECKSPRUNG && "$ERGEBNIS" != "ruecksprung" ]] && code=1
    local art="fehler"
    [[ "$ERGEBNIS" == "ruecksprung" ]] && art="ruecksprung"
    log "FEHLER: Probe der Widerrufbücher gescheitert in Schritt '$SCHRITT' (Code $code, $art)"
    if [[ -n "$STATUS_DATEI" ]]; then status_schreiben "$art" "$code"; fi
    ping_senden "$PROBE_PING_URL" "/fail" "centric-widerrufbuch-probe: $art in schritt $SCHRITT (code $code)"
  fi
  log_abschliessen
  exit "$code"
}
trap beenden EXIT

status_schreiben() {
  local dauer=$(($(date +%s) - START_S)) code="${2:-0}"
  [[ "$code" =~ ^[0-9]{1,3}$ ]] || code=1
  [[ "$SUMMEN" =~ ^[a-z.=0-9\;-]*$ ]] || SUMMEN=""
  status_ablegen "$STATUS_DATEI" "$(printf '{"art":"widerrufbuch-probe","zeit":"%s","ergebnis":"%s","schritt":"%s","code":%d,"snapshots":%d,"neuester":"%s","vergleich":"%s","live_fehlend":%d,"gegenprobe":"%s","gegenprobe_fehlend":%d,"pruefsummen":"%s","dauer_s":%d,"bild":"%s"}' \
    "$START_ISO" "$1" "$SCHRITT" "$code" "$SNAPSHOTS" "$NEU_ID" "$ALT_ID" "$LIVE_FEHLEND" "$GEGENPROBE" "$GEGEN_FEHLEND" "$SUMMEN" "$dauer" "${CENTRIC_PROD_IMAGE##*@}")"
}

# restic wie im Job: --retry-lock 5m (wartet begrenzt auf eine fremde Sperre,
# z. B. Wartung von Hand); jeder Fehler → CODE_RESTIC (nie mit „Rücksprung“ verwechselbar).
restic_probe() {
  local rc=0 befehl="$1"
  shift
  restic_lauf "$befehl" "${RETRY_LOCK[@]}" "$@" || rc=$?
  if [[ $rc -ne 0 ]]; then
    log "restic $befehl gescheitert (restic-Code $rc) — Probe endet mit Code $CODE_RESTIC" >&2
    return "$CODE_RESTIC"
  fi
}

# Ordner, in dem die zurückgeholten Bücher liegen (restic legt den absoluten Pfad der Stufe an).
buchordner() {
  local f
  f="$(find "$1" -type f \( -name "${BUECHER[0]}" -o -name "${BUECHER[1]}" \) | head -n1)"
  [[ -n "$f" ]] || return 1
  dirname "$f"
}

zeile_zahl() { sed -n "s/.* $1=\([0-9]*\).*/\1/p" | head -n1; }

konfig_pruefen
: "${CENTRIC_ZUSTAND_PFAD:=$(dirname "$CENTRIC_DATEN_PFAD")/zustand}"
[[ -d "$CENTRIC_ZUSTAND_PFAD" ]] || abbruch_konfig "CENTRIC_ZUSTAND_PFAD ist kein Verzeichnis: $CENTRIC_ZUSTAND_PFAD"
ZUSTAND_ECHT="$(realpath -e "$CENTRIC_ZUSTAND_PFAD")"
STATUS_DATEI="$STATUS_VERZEICHNIS/widerrufbuch-probe-status.json"
JOB_STATUS="$STATUS_VERZEICHNIS/widerrufbuch-status.json"
JOB_STUFE="$STATUS_VERZEICHNIS/widerrufbuch/stufe"
# Dieselbe Sperre wie der stündliche Job (kein forget --prune während der Probe).
SPERRDATEI="$STATUS_VERZEICHNIS/widerrufbuch.lock"

SCHRITT="sperre"
if ! sperre_nehmen; then ERGEBNIS="gesperrt"; exit "$CODE_GESPERRT"; fi

LOG="$STATUS_VERZEICHNIS/log/widerrufbuch-probe-$(date -u +%Y%m%dT%H%M%SZ).log"
log_umleiten "$LOG"
logs_ausduennen
log "Probe der Widerrufbücher beginnt (Host-Kennung $RESTIC_HOST)"
ping_senden "$PROBE_PING_URL" "/start" || true

ARBEIT="$(mktemp -d "$STATUS_VERZEICHNIS/widerrufbuch-probe-XXXXXX")"
case "$(realpath -m "$ARBEIT")/" in "$ZUSTAND_ECHT"/*) abbruch_konfig "Arbeitsordner liegt im Zustandsverzeichnis" ;; esac
mkdir -m 700 "$ARBEIT/neu" "$ARBEIT/alt" "$ARBEIT/live"

# --- 1. ganzes Repository lesen --------------------------------------------
SCHRITT="restic-version"
restic_version_pruefen
SCHRITT="restic-check"
restic_probe check --read-data
log "restic check --read-data bestanden (ganzes Repository gelesen)"

# --- 2. Snapshots wählen und zurückholen ------------------------------------
SCHRITT="snapshot-liste"
LISTE="$(restic_probe snapshots --json --host "$RESTIC_HOST" --tag "$WB_TAG")" || exit "$CODE_RESTIC"
mapfile -t IDS < <(printf '%s\n' "$LISTE" | grep -o '"id":"[0-9a-f]\{64\}"' | cut -d'"' -f4)
SNAPSHOTS=${#IDS[@]}
((SNAPSHOTS > 0)) || { log "Kein Snapshot mit Host-Kennung $RESTIC_HOST und Tag $WB_TAG — der stündliche Job lief noch nie erfolgreich"; exit 1; }
NEU_ID="${IDS[$((SNAPSHOTS - 1))]}"
if [[ -n "$ALT_WUNSCH" ]]; then
  ALT_ID=""
  for i in "${IDS[@]}"; do [[ "$i" == "$ALT_WUNSCH"* ]] && ALT_ID="$i"; done
  [[ -n "$ALT_ID" ]] || { log "Snapshot $ALT_WUNSCH gehört nicht zu Host-Kennung $RESTIC_HOST / Tag $WB_TAG"; exit 1; }
else
  ALT_ID="${IDS[0]}"
fi
log "Snapshots: $SNAPSHOTS · neuester ${NEU_ID:0:8} · Vergleich ${ALT_ID:0:8}"

SCHRITT="rueckholung"
restic_probe restore "$NEU_ID" --target "$ARBEIT/neu" >/dev/null
NEU_ORDNER="$(buchordner "$ARBEIT/neu")" || { log "Im neuesten Snapshot liegt kein Widerrufbuch"; exit 1; }
if [[ "$ALT_ID" != "$NEU_ID" ]]; then
  restic_probe restore "$ALT_ID" --target "$ARBEIT/alt" >/dev/null
  ALT_ORDNER="$(buchordner "$ARBEIT/alt")" || { log "Im Vergleichs-Snapshot liegt kein Widerrufbuch"; exit 1; }
fi

# --- 2b. Prüfsummen ----------------------------------------------------------
SCHRITT="pruefsummen"
for b in "${BUECHER[@]}"; do
  [[ -f "$NEU_ORDNER/$b" ]] || { log "Hinweis: $b fehlt im neuesten Snapshot"; continue; }
  s="$(sha256sum -- "$NEU_ORDNER/$b" | cut -d' ' -f1)"
  SUMMEN+="${SUMMEN:+;}$b=$s"
  log "sha256 neuester ${NEU_ID:0:8} $b $s"
  if [[ -n "${ALT_ORDNER:-}" && -f "$ALT_ORDNER/$b" ]]; then
    log "sha256 vergleich ${ALT_ID:0:8} $b $(sha256sum -- "$ALT_ORDNER/$b" | cut -d' ' -f1)"
  fi
done
# Stufe des letzten erfolgreichen Jobs: war dessen Snapshot der neueste, muss sie bytegleich sein.
if [[ -f "$JOB_STATUS" && -d "$JOB_STUFE" ]]; then
  JOB_ID="$(json_text snapshot_id <"$JOB_STATUS" || true)"
  JOB_ERG="$(json_text ergebnis <"$JOB_STATUS" || true)"
  if [[ "$JOB_ERG" == "ok" && -n "$JOB_ID" && "$NEU_ID" == "$JOB_ID"* ]]; then
    for b in "${BUECHER[@]}"; do
      [[ -f "$JOB_STUFE/$b" ]] || continue
      cmp -s -- "$JOB_STUFE/$b" "$NEU_ORDNER/$b" || { log "Zurückgeholte Kopie von $b weicht von der Stufe des letzten Jobs ab"; exit 1; }
    done
    log "Neuester Snapshot bytegleich mit der Stufe des letzten erfolgreichen Jobs"
  fi
fi

# --- 3. Siegel + laufendes Buch enthält alles aus dem neuesten Snapshot ----
SCHRITT="live-vergleich"
N_LIVE=0
for b in "${BUECHER[@]}"; do
  if [[ -f "$CENTRIC_ZUSTAND_PFAD/$b" ]]; then cp -- "$CENTRIC_ZUSTAND_PFAD/$b" "$ARBEIT/live/$b"; N_LIVE=$((N_LIVE + 1)); fi
done
((N_LIVE > 0)) || { log "Kein Widerrufbuch in $CENTRIC_ZUSTAND_PFAD"; exit 1; }
pfeffer_env_anlegen
RC=0
AUSGABE="$(im_bild -v "$ARBEIT/live:/buch:ro" -v "$NEU_ORDNER:/vorher:ro" -- \
  werkzeug/ablage-sicherung.mjs widerrufbuch-pruefen --zustand /buch --vorher /vorher)" || RC=$?
printf '%s\n' "$AUSGABE"
LIVE_FEHLEND="$(printf '%s\n' "$AUSGABE" | grep '^WIDERRUFBUCH-PRUEFUNG ' | tail -n1 | zeile_zahl fehlend)"
: "${LIVE_FEHLEND:=0}"
if [[ $RC -eq $CODE_RUECKSPRUNG ]]; then
  ERGEBNIS="ruecksprung"
  log "RÜCKSPRUNG ERKANNT: $LIVE_FEHLEND Einträge des neuesten Snapshots fehlen im laufenden Widerrufbuch."
  log "Abhilfe: docs/BETRIEB-SICHERUNG.md §7 / ABNAHME-V4-BE3 §6.2 (Dienst stoppen, widerrufbuch-vereinen)."
  exit "$CODE_RUECKSPRUNG"
fi
[[ $RC -eq 0 ]] || { log "Prüfung laufendes Buch gegen neuesten Snapshot gescheitert (Code $RC) — Siegel, Herkunft oder Pfeffer?"; exit "$RC"; }
log "Siegel gültig; laufendes Widerrufbuch enthält alles aus Snapshot ${NEU_ID:0:8}"

# --- 4. Rollback-Gegenprobe ---------------------------------------------------
SCHRITT="gegenprobe"
if [[ "$ALT_ID" == "$NEU_ID" ]]; then
  GEGENPROBE="nicht-moeglich"
  log "Hinweis: nur ein Snapshot — Rollback-Gegenprobe nicht möglich"
else
  RC=0
  AUSGABE="$(im_bild -v "$ALT_ORDNER:/buch:ro" -v "$NEU_ORDNER:/vorher:ro" -- \
    werkzeug/ablage-sicherung.mjs widerrufbuch-pruefen --zustand /buch --vorher /vorher 2>&1)" || RC=$?
  GEGEN_FEHLEND="$(printf '%s\n' "$AUSGABE" | grep '^WIDERRUFBUCH-PRUEFUNG ' | tail -n1 | zeile_zahl fehlend)"
  : "${GEGEN_FEHLEND:=0}"
  case "$RC" in
    "$CODE_RUECKSPRUNG")
      GEGENPROBE="erkannt"
      log "Rollback-Gegenprobe: älterer Stand ${ALT_ID:0:8} gegen ${NEU_ID:0:8} als Rücksprung erkannt ($GEGEN_FEHLEND Einträge fehlen) — Erkennung greift" ;;
    0)
      GEGENPROBE="nicht-aussagekraeftig"
      log "Hinweis: Rollback-Gegenprobe nicht aussagekräftig — ${ALT_ID:0:8} enthält bereits alle Einträge von ${NEU_ID:0:8} (keine Widerrufe dazwischen)" ;;
    *)
      printf '%s\n' "$AUSGABE"
      log "Rollback-Gegenprobe: Werkzeug scheiterte (Code $RC) — älterer Snapshot beschädigt oder fremd?"
      exit 1 ;;
  esac
fi

# --- 5. Status, Ping ------------------------------------------------------------
SCHRITT="fertig"
ERGEBNIS="ok"
status_schreiben "ok" 0
log "Probe der Widerrufbücher bestanden: $SNAPSHOTS Snapshots, check --read-data, Rückholung, Siegel, live vollständig, Gegenprobe $GEGENPROBE, $(($(date +%s) - START_S)) s"
ping_senden "$PROBE_PING_URL" "" "centric-widerrufbuch-probe ok: ${NEU_ID:0:8}, gegenprobe $GEGENPROBE" ||
  log "WARNUNG: Erfolgs-Ping fehlgeschlagen"
exit 0
