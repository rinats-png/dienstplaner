#!/usr/bin/env bash
# =====================================================================
#  CENTRIC — stündliche Sicherung der Widerrufbücher (BE-3)
#
#  Aufruf:  widerrufbuch-sicherung.sh [--erster-lauf] [KONFIG]
#           KONFIG Vorgabe: ~/.config/centric-sicherung/widerrufbuch.env (Modus 600)
#           --erster-lauf: nur nach Prüfung durch den Betreiber, wenn für
#           RESTIC_HOST kein Snapshot da ist, aber frühere Sicherungen bekannt
#           sind (Exit 5) — z. B. bewusst neues Repository / neue Host-Kennung.
#
#  Eigener Job neben der täglichen Sicherung der Ablage (sicherung-ausser-
#  haus.sh): eigene Konfiguration, PFLICHT: eigenes restic-Repository mit
#  eigenem Passwort (das stündliche `forget --prune`/`check` sperrt das
#  Repository exklusiv — ein gemeinsames Repository ließe die tägliche
#  Sicherung an der Sperre scheitern; der Job verweigert ein Repository, das
#  in der Konfiguration der Ablage steht), eigene Sperre, eigene Statusdatei.
#  restic >= 0.16.0 (für --retry-lock). Gesichert werden
#  NUR die beiden Widerrufbücher aus dem Zustandsverzeichnis —
#  zugang-widerrufe.json (E-M6) und konto-widerrufe.json (BE-1/BE-2) —,
#  nie die Schlüsselepoche (ENTSCHEIDUNG-BE1-BE3.md §3.3, Fußnote 1).
#  Die Bücher enthalten nur HMAC-Kennungen und ein Siegel, keine Namen,
#  keine Codes, keine Prüfwerte.
#
#  Ablauf
#    0. Konfiguration, Sperre (widerrufbuch.lock), Start-Ping
#    1. restic-Repository erreichbar, Passwort passt
#    2. Bücher in die feste Stufe STATUS_VERZEICHNIS/widerrufbuch/stufe kopieren
#    3. letzte gesicherte Kopie zurückholen (Vergleichsstand). Keiner für
#       RESTIC_HOST, aber Snapshots anderer Host-Kennungen oder ein früherer
#       Erfolg in der Statusdatei: NICHT als ersten Lauf behandeln — Exit 5,
#       Status „vergleich-fehlt“ (bewusst übergehen nur mit --erster-lauf)
#    4. Prüfen im Produktionsbild (kein Netz, nur lesend): Siegel beider
#       Bücher; enthält die Stufe alles, was die letzte Sicherung kannte?
#       Sonst „ruecksprung“ (ein älterer, gültig gesiegelter Stand liegt im
#       Zustandsverzeichnis): NICHT sichern — der alte Stand verdrängte sonst
#       den neuen als „letzten“ —, Alarm, /gesund warnt; Abhilfe:
#       widerrufbuch-vereinen (BEREITSTELLUNG.md §5.4).
#    5. restic backup --tag widerrufbuch
#    6. restic forget --keep-last 200 --keep-daily 90 --prune
#    7. Nachweis: restic check, Snapshot-Liste, neuen Snapshot zurückholen —
#       bytegleich mit der Stufe und Siegel gültig
#    8. widerrufbuch-status.json schreiben (ohne Geheimnisse), Erfolgs-Ping
#  Ein Fehler sperrt KEINE Anmeldung: /gesund warnt nur (Prüfung
#  „widerrufbuchsicherung“, CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS).
#
#  Exit-Codes (eindeutig; Status-Feld „code“):
#     0  gut
#     1  Fehler (Kopieren, Prüfwerkzeug, Rückholung weicht ab, …)
#     3  NUR Rücksprung erkannt (nichts gesichert)
#     4  restic gescheitert (jeder Code von restic, auch dessen 3 „Snapshot
#        unvollständig“, und die restic-Zeitgrenze; restic-Code steht im Log)
#     5  Vergleichsstand fehlt (Host-Kennung? siehe Schritt 3; nichts gesichert)
#    75  anderer Lauf aktiv · 78 Konfiguration (auch: Repository der Ablage,
#        restic < 0.16.0) · 124 Zeitgrenze des Prüfcontainers
#  Einrichtung: docs/BETRIEB-SICHERUNG.md §7, docs/acc45/ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md
# =====================================================================
set -Eeuo pipefail
umask 077

# shellcheck source=SCRIPTDIR/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

# Aufbewahrung — feste, dokumentierte Werte (nicht je Betrieb, nicht einstellbar).
readonly AUFBEWAHRUNG_LETZTE=200
readonly AUFBEWAHRUNG_TAGE=90
readonly WB_TAG=widerrufbuch
readonly BUECHER=(zugang-widerrufe.json konto-widerrufe.json)
readonly CODE_RUECKSPRUNG=3
readonly CODE_RESTIC=4
readonly CODE_VERGLEICH_FEHLT=5
# --retry-lock 5m (RETRY_LOCK) und restic >= 0.16.0 (restic_version_pruefen): gemeinsam.sh

ERSTER_LAUF=0
if [[ "${1:-}" == "--erster-lauf" ]]; then
  ERSTER_LAUF=1
  shift
fi
KONFIG="${1:-$HOME/.config/centric-sicherung/widerrufbuch.env}"
konfig_laden "$KONFIG"

START_S="$(date +%s)"
START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SCHRITT="konfiguration"
ERGEBNIS=""          # "" = noch offen, "ok", "gesperrt", "ruecksprung", "vergleich-fehlt"
SNAPSHOT_ID=""
SNAPSHOTS=0
BUECHER_N=0
CODES_N=0
KONTEN_N=0
FEHLEND=0
NACHWEIS=""
STATUS_DATEI=""
BACKUP_JSON=""
ARBEIT=""

# beenden wird über trap aufgerufen
# shellcheck disable=SC2317,SC2329
beenden() {
  local code=$?
  trap - EXIT
  set +e
  pfeffer_env_weg
  rm -f -- "${BACKUP_JSON:-}" 2>/dev/null
  if [[ -n "$ARBEIT" ]]; then rm -rf -- "${ARBEIT:?}/vorher" "${ARBEIT:?}/nachher" 2>/dev/null; fi
  if [[ "$ERGEBNIS" == "gesperrt" ]]; then exit "$CODE_GESPERRT"; fi
  if [[ "$ERGEBNIS" != "ok" ]]; then
    [[ $code -eq 0 ]] && code=1
    # 3 bedeutet ausschließlich „Rücksprung erkannt“ — jede andere 3 wird 1.
    [[ $code -eq $CODE_RUECKSPRUNG && "$ERGEBNIS" != "ruecksprung" ]] && code=1
    local art="fehler"
    [[ "$ERGEBNIS" == "ruecksprung" || "$ERGEBNIS" == "vergleich-fehlt" ]] && art="$ERGEBNIS"
    log "FEHLER: Sicherung der Widerrufbücher abgebrochen in Schritt '$SCHRITT' (Code $code, $art)"
    if [[ -n "$STATUS_DATEI" ]]; then status_schreiben "$art" "$code"; fi
    ping_senden "$ALARM_PING_URL" "/fail" "centric-widerrufbuch: $art in schritt $SCHRITT (code $code)"
  fi
  log_abschliessen
  exit "$code"
}
trap beenden EXIT

# Letzte erfolgreiche Zeit: bei Erfolg jetzt, sonst aus der bisherigen Statusdatei übernommen.
status_schreiben() {
  local ergebnis="$1" code="${2:-0}" letzte="" host="" dauer=$(($(date +%s) - START_S))
  if [[ "$ergebnis" == "ok" ]]; then
    letzte="$START_ISO"
  elif [[ -f "$STATUS_DATEI" ]]; then
    letzte="$(json_text letzte_erfolgreiche <"$STATUS_DATEI" || true)"
  fi
  [[ "$letzte" =~ ^[0-9T:Z-]{0,25}$ ]] || letzte=""
  [[ "${RESTIC_HOST:-}" =~ ^[A-Za-z0-9._-]{1,64}$ ]] && host="$RESTIC_HOST"
  [[ "$code" =~ ^[0-9]{1,3}$ ]] || code=1
  status_ablegen "$STATUS_DATEI" "$(printf '{"art":"widerrufbuch","zeit":"%s","ergebnis":"%s","schritt":"%s","code":%d,"host":"%s","letzte_erfolgreiche":"%s","snapshot_id":"%s","snapshots":%d,"buecher":%d,"eintraege_codes":%d,"eintraege_konten":%d,"fehlend":%d,"nachweis":"%s","dauer_s":%d,"bild":"%s"}' \
    "$START_ISO" "$ergebnis" "$SCHRITT" "$code" "$host" "$letzte" "$SNAPSHOT_ID" "$SNAPSHOTS" "$BUECHER_N" "$CODES_N" "$KONTEN_N" "$FEHLEND" "$NACHWEIS" "$dauer" "${CENTRIC_PROD_IMAGE##*@}")"
}

# restic für diesen Job: wartet begrenzt auf fremde Sperren (--retry-lock) und
# endet bei JEDEM Fehler von restic mit CODE_RESTIC — so ist restics eigener
# Exit 3 („Snapshot unvollständig“) nie mit „Rücksprung erkannt“ zu verwechseln.
# Gibt CODE_RESTIC ZURÜCK (set -e beendet dann): ein `exit` hier liefe bei
# `restic_wb … >/dev/null` mit umgeleiteter Ausgabe in den EXIT-Trap — das
# Log ginge verloren und der Trap wartete ewig auf tee.
restic_wb() {
  local rc=0 befehl="$1"
  shift
  restic_lauf "$befehl" "${RETRY_LOCK[@]}" "$@" || rc=$?
  if [[ $rc -ne 0 ]]; then
    log "restic $befehl gescheitert (restic-Code $rc) — Job endet mit Code $CODE_RESTIC" >&2
    return "$CODE_RESTIC"
  fi
}

# Repository-Angabe vergleichbar machen: Anführungszeichen, ~/, „local:“ und
# Schrägstriche am Ende entfernen; lokale Pfade auflösen.
repo_norm() {
  local r="$1"
  r="${r%$'\r'}"
  if [[ "$r" =~ $DOPPELT_MUSTER || "$r" =~ $EINFACH_MUSTER ]]; then r="${BASH_REMATCH[1]}"; fi
  case "$r" in \~/*) r="$HOME/${r#\~/}" ;; esac
  r="${r#local:}"
  while [[ "$r" == */ && "$r" != / ]]; do r="${r%/}"; done
  if [[ "$r" == /* ]]; then r="$(realpath -m -- "$r")"; fi
  printf '%s' "$r"
}

# PFLICHT eigenes Repository: Das Repository der Sicherung der Ablage (ihre
# Konfiguration `env` neben dieser Datei bzw. am Vorgabeort) darf nicht
# dasselbe sein. Die Angabe selbst kommt nie ins Log (kann Zugangsdaten tragen).
eigenes_repository_pruefen() {
  local eigen kandidat datei zeile fremd gesehen=" " geprueft=0 selbst
  eigen="$(repo_norm "$RESTIC_REPOSITORY")"
  selbst="$(realpath -e -- "$KONFIG")"
  for kandidat in "$(dirname "$KONFIG")/env" "$HOME/.config/centric-sicherung/env"; do
    [[ -f "$kandidat" ]] || continue
    datei="$(realpath -e -- "$kandidat")"
    [[ "$gesehen" == *" $datei "* ]] && continue
    gesehen+="$datei "
    [[ "$datei" != "$selbst" ]] ||
      abbruch_konfig "Die Konfiguration der Ablage ($kandidat) ist zugleich die der Widerrufbücher — eigene widerrufbuch.env mit eigenem Repository ist Pflicht"
    [[ -r "$datei" ]] || { log "Hinweis: Konfiguration der Ablage $kandidat nicht lesbar — Repository-Vergleich übersprungen"; continue; }
    zeile="$(grep -E '^RESTIC_REPOSITORY=' "$datei" | tail -n1 || true)"
    [[ -n "$zeile" ]] || continue
    fremd="$(repo_norm "${zeile#RESTIC_REPOSITORY=}")"
    geprueft=$((geprueft + 1))
    [[ -z "$fremd" || "$fremd" != "$eigen" ]] ||
      abbruch_konfig "RESTIC_REPOSITORY ist dasselbe Repository wie die Sicherung der Ablage ($kandidat). Pflicht ist ein EIGENES Repository: das stündliche forget --prune/check sperrt es exklusiv und ließe die tägliche Sicherung scheitern (docs/BETRIEB-SICHERUNG.md §7)"
  done
  if ((geprueft > 0)); then
    log "Eigenes Repository: verschieden von dem der Sicherung der Ablage"
  else
    log "Hinweis: keine Konfiguration der Ablage gefunden (env neben $KONFIG oder ~/.config/centric-sicherung/env) — eigenes Repository bleibt Pflicht des Betreibers"
  fi
}

# Zahl der Snapshots mit Tag widerrufbuch, Filter optional (z. B. --host X).
# restic-Fehler beenden den Job mit CODE_RESTIC; keine Treffer = 0.
snapshots_zaehlen() {
  local liste
  liste="$(restic_wb snapshots --json --tag "$WB_TAG" "$@")" || exit "$CODE_RESTIC"
  printf '%s\n' "$liste" | { grep -o '"short_id"' || true; } | wc -l | tr -d ' '
}

# Zahl hinter <name>= in der Auswertungszeile des Werkzeugs.
zeile_zahl() { sed -n "s/.* $1=\([0-9]*\).*/\1/p" | head -n1; }

konfig_pruefen
: "${CENTRIC_ZUSTAND_PFAD:=$(dirname "$CENTRIC_DATEN_PFAD")/zustand}"
[[ -d "$CENTRIC_ZUSTAND_PFAD" ]] || abbruch_konfig "CENTRIC_ZUSTAND_PFAD ist kein Verzeichnis: $CENTRIC_ZUSTAND_PFAD"
ZUSTAND_ECHT="$(realpath -e "$CENTRIC_ZUSTAND_PFAD")"
DATEN_ECHT="$(realpath -e "$CENTRIC_DATEN_PFAD")"
[[ "$ZUSTAND_ECHT" != "$DATEN_ECHT" && "$ZUSTAND_ECHT" != "$DATEN_ECHT/"* && "$DATEN_ECHT" != "$ZUSTAND_ECHT/"* ]] ||
  abbruch_konfig "Zustandsverzeichnis und Datenverzeichnis überlappen — das Widerrufbuch rollte mit den Daten zurück"
ARBEIT="$(realpath -m "$STATUS_VERZEICHNIS/widerrufbuch")"
[[ "$ARBEIT" != "$ZUSTAND_ECHT" && "$ARBEIT" != "$ZUSTAND_ECHT/"* ]] ||
  abbruch_konfig "STATUS_VERZEICHNIS liegt im Zustandsverzeichnis — dort wird nichts abgelegt"
STATUS_DATEI="$STATUS_VERZEICHNIS/widerrufbuch-status.json"
STUFE="$ARBEIT/stufe"
VORHER="$ARBEIT/vorher"
NACHHER="$ARBEIT/nachher"
# Eigene Sperre: läuft die tägliche Sicherung der Ablage lange, wird dieser Job nicht abgewiesen.
SPERRDATEI="$STATUS_VERZEICHNIS/widerrufbuch.lock"

SCHRITT="sperre"
if ! sperre_nehmen; then ERGEBNIS="gesperrt"; exit "$CODE_GESPERRT"; fi

LOG="$STATUS_VERZEICHNIS/log/widerrufbuch-$(date -u +%Y%m%dT%H%M%SZ).log"
log_umleiten "$LOG"
logs_ausduennen
log "Sicherung der Widerrufbücher beginnt (Bild ${CENTRIC_PROD_IMAGE##*@}, Host-Kennung $RESTIC_HOST)"
ping_senden "$ALARM_PING_URL" "/start" || true

# --- 0b. eigenes Repository (Pflicht), restic-Version -------------------
SCHRITT="konfiguration"
eigenes_repository_pruefen
SCHRITT="restic-version"
restic_version_pruefen

# --- 1. Repository erreichbar und Passwort richtig? --------------------
SCHRITT="repository-zugang"
restic_wb cat config >/dev/null
log "restic-Repository erreichbar, Passwort passt"

# --- 2. Bücher in die Stufe kopieren ------------------------------------
# Feste Stufe: gleicher Pfad in jedem Snapshot. Die Bücher werden vom
# Server nur atomar ersetzt (Umbenennen) — cp liest einen ganzen Stand.
SCHRITT="kopieren"
mkdir -p "$ARBEIT"
chmod 700 "$ARBEIT"
rm -rf -- "${STUFE:?}" "${VORHER:?}" "${NACHHER:?}"
mkdir -m 700 "$STUFE" "$VORHER" "$NACHHER"
for b in "${BUECHER[@]}"; do
  if [[ -f "$CENTRIC_ZUSTAND_PFAD/$b" ]]; then
    cp -- "$CENTRIC_ZUSTAND_PFAD/$b" "$STUFE/$b"
    BUECHER_N=$((BUECHER_N + 1))
  else
    log "Hinweis: $b fehlt im Zustandsverzeichnis"
  fi
done
((BUECHER_N > 0)) || { log "Kein Widerrufbuch in $CENTRIC_ZUSTAND_PFAD — läuft der Server mit diesem Zustandsverzeichnis?"; exit 1; }

# --- 3. letzte gesicherte Kopie (Vergleichsstand) ------------------------
SCHRITT="vergleichsstand"
SNAPSHOTS="$(snapshots_zaehlen --host "$RESTIC_HOST")" || exit "$CODE_RESTIC"
if ((SNAPSHOTS > 0)); then
  restic_wb restore latest --host "$RESTIC_HOST" --tag "$WB_TAG" --target "$VORHER" >/dev/null
  log "Vergleichsstand: letzte von $SNAPSHOTS Sicherungen zurückgeholt"
  ((ERSTER_LAUF == 0)) || log "Hinweis: --erster-lauf ohne Wirkung — es gibt einen Vergleichsstand"
else
  # Kein Snapshot für diese Host-Kennung. Nur ein ECHTER erster Lauf darf ohne
  # Rücksprungprüfung sichern: andere Host-Kennungen im Repository oder ein
  # früherer Erfolg (Statusdatei, außerhalb von restic) sprechen dagegen.
  ALLE="$(snapshots_zaehlen)" || exit "$CODE_RESTIC"
  FRUEHER_OK="" FRUEHER_HOST="" FRUEHER_N=0
  if [[ -f "$STATUS_DATEI" ]]; then
    FRUEHER_OK="$(json_text letzte_erfolgreiche <"$STATUS_DATEI" || true)"
    FRUEHER_HOST="$(json_text host <"$STATUS_DATEI" || true)"
    FRUEHER_N="$(json_zahl snapshots <"$STATUS_DATEI" || true)"
  fi
  [[ "$FRUEHER_N" =~ ^[0-9]+$ ]] || FRUEHER_N=0
  [[ "$FRUEHER_HOST" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || FRUEHER_HOST="unbekannt"
  if ((ALLE > 0)) || [[ -n "$FRUEHER_OK" ]] || ((FRUEHER_N > 0)); then
    log "WARNUNG: kein Snapshot für Host-Kennung '$RESTIC_HOST', aber $ALLE Snapshot(s) mit Tag $WB_TAG insgesamt; frühere Statusdatei: letzte erfolgreiche '${FRUEHER_OK:-keine}', Host-Kennung '$FRUEHER_HOST', $FRUEHER_N Snapshot(s)."
    if ((ERSTER_LAUF == 0)); then
      ERGEBNIS="vergleich-fehlt"
      log "Ohne Vergleichsstand ist keine Rücksprungprüfung möglich — es wird NICHT gesichert (Code $CODE_VERGLEICH_FEHLT)."
      log "Abhilfe: RESTIC_HOST auf die bisherige Kennung setzen; nur wenn bewusst neu begonnen wird (Betreiber prüft, BETRIEB-SICHERUNG.md §7): widerrufbuch-sicherung.sh --erster-lauf"
      exit "$CODE_VERGLEICH_FEHLT"
    fi
    log "--erster-lauf: vom Betreiber bestätigt — Lauf ohne Vergleichsstand"
  else
    log "Vergleichsstand: noch keine Sicherung (erster Lauf)"
  fi
fi

# --- 4. prüfen: Siegel, Herkunft, nichts verloren ------------------------
SCHRITT="pruefen"
pfeffer_env_anlegen
PRUEF_VOL=(-v "$STUFE:/buch:ro")
PRUEF_ARGS=(--zustand /buch)
if ((SNAPSHOTS > 0)); then
  PRUEF_VOL+=(-v "$VORHER:/vorher:ro")
  PRUEF_ARGS+=(--vorher /vorher)
fi
RC=0
AUSGABE="$(im_bild "${PRUEF_VOL[@]}" -- werkzeug/ablage-sicherung.mjs widerrufbuch-pruefen "${PRUEF_ARGS[@]}")" || RC=$?
printf '%s\n' "$AUSGABE"
ZEILE="$(printf '%s\n' "$AUSGABE" | grep '^WIDERRUFBUCH-PRUEFUNG ' | tail -n1 || true)"
CODES_N="$(printf '%s\n' "$ZEILE" | zeile_zahl codes)"
KONTEN_N="$(printf '%s\n' "$ZEILE" | zeile_zahl konten)"
FEHLEND="$(printf '%s\n' "$ZEILE" | zeile_zahl fehlend)"
: "${CODES_N:=0}" "${KONTEN_N:=0}" "${FEHLEND:=0}"
if [[ $RC -eq $CODE_RUECKSPRUNG ]]; then
  ERGEBNIS="ruecksprung"
  log "RÜCKSPRUNG ERKANNT: $FEHLEND Einträge der letzten Sicherung fehlen im Widerrufbuch. Es wird NICHT gesichert."
  log "Abhilfe: Server stoppen, letzte Sicherung zurückholen, widerrufbuch-vereinen (BEREITSTELLUNG.md §5.4)."
  exit "$CODE_RUECKSPRUNG"
fi
[[ $RC -eq 0 && -n "$ZEILE" ]] || { log "Prüfung der Widerrufbücher gescheitert (Code $RC) — beschädigt, fremd oder Pfeffer falsch?"; exit "$(( RC == 0 ? 1 : RC ))"; }
log "Siegel gültig: $BUECHER_N Bücher, $CODES_N Einträge (Codes), $KONTEN_N Einträge (Konten), nichts verloren"

# --- 5. restic backup -----------------------------------------------------
SCHRITT="restic-backup"
BACKUP_JSON="$(mktemp "$STATUS_VERZEICHNIS/.wb-backup-XXXXXX")"
restic_wb backup --json --host "$RESTIC_HOST" --tag "$WB_TAG" "$STUFE" >"$BACKUP_JSON"
ZUSAMMENFASSUNG="$(grep '"message_type":"summary"' "$BACKUP_JSON" | tail -n1 || true)"
SNAPSHOT_ID="$(printf '%s' "$ZUSAMMENFASSUNG" | json_text snapshot_id)"
[[ "$SNAPSHOT_ID" =~ ^[0-9a-f]{8,64}$ ]] || { log "restic meldete keinen Snapshot"; exit 1; }
log "restic-Snapshot $SNAPSHOT_ID angelegt"

# --- 6. Aufbewahrung -------------------------------------------------------
SCHRITT="restic-forget"
restic_wb forget --host "$RESTIC_HOST" --tag "$WB_TAG" --group-by host \
  --keep-last "$AUFBEWAHRUNG_LETZTE" --keep-daily "$AUFBEWAHRUNG_TAGE" --prune

# --- 7. Nachweis: Repository, Liste, zurückholen und gegenprüfen ---------
SCHRITT="restic-check"
restic_wb check --read-data-subset "$CHECK_ANTEIL"
SCHRITT="snapshot-liste"
SNAPSHOTS="$(snapshots_zaehlen --host "$RESTIC_HOST")" || exit "$CODE_RESTIC"
[[ "$SNAPSHOTS" -ge 1 ]] || { log "Snapshot-Liste leer"; exit 1; }
SCHRITT="rueckholung"
restic_wb restore "$SNAPSHOT_ID" --target "$NACHHER" >/dev/null
for b in "${BUECHER[@]}"; do
  [[ -f "$STUFE/$b" ]] || continue
  ZURUECK="$(find "$NACHHER" -type f -name "$b" | head -n1)"
  if [[ -z "$ZURUECK" ]] || ! cmp -s -- "$STUFE/$b" "$ZURUECK"; then
    log "Zurückgeholte Kopie von $b fehlt oder weicht ab"
    exit 1
  fi
done
SCHRITT="rueckholung-siegel"
RC=0
im_bild -v "$STUFE:/buch:ro" -v "$NACHHER:/nachher:ro" -- \
  werkzeug/ablage-sicherung.mjs widerrufbuch-pruefen --zustand /buch --vorher /nachher >/dev/null || RC=$?
[[ $RC -eq 0 ]] || { log "Siegelprüfung der zurückgeholten Kopie gescheitert (Code $RC)"; exit "$(( RC == CODE_RUECKSPRUNG ? 1 : RC ))"; }
NACHWEIS="check+liste+rueckholung+siegel"
log "Nachweis: restic check bestanden, $SNAPSHOTS Sicherungen, Snapshot $SNAPSHOT_ID zurückgeholt, bytegleich, Siegel gültig"

# --- 8. Status und Erfolgs-Ping ------------------------------------------
SCHRITT="fertig"
ERGEBNIS="ok"
status_schreiben "ok" 0
log "Sicherung der Widerrufbücher vollständig: Snapshot $SNAPSHOT_ID, $(($(date +%s) - START_S)) s"
ping_senden "$ALARM_PING_URL" "" "centric-widerrufbuch ok: snapshot $SNAPSHOT_ID, $BUECHER_N buecher" ||
  log "WARNUNG: Erfolgs-Ping fehlgeschlagen — der Totmannschalter wird Alarm geben"
exit 0
