#!/usr/bin/env bash
# =====================================================================
#  CI-Nachweis WP-04 (betrieb-sicherung.yml) — NUR CI, nie auf dem VPS.
#
#  Erwartet: BILD (lokal gebautes App-Bild), restic und docker im PATH,
#  RUNNER_TEMP. Alles liegt in einem Wegwerfordner; Passwort, Pfeffer,
#  Admin-Schlüssel und Ping-IDs sind zufällig und werden maskiert.
#
#  Proben
#    T1  Konfigurationsdatei mit Modus 644 wird abgelehnt (Exit 78)
#    T2  Sicherung 1: Erfolg, Start- und Erfolgs-Ping
#    T3  Aufbewahrung: 40 künstliche Tages-Snapshots (restic --time),
#        Sicherung 2, behaltene Menge = unabhängige Nachrechnung
#    T4  Sicherung 3: lokal bleiben genau LOKAL_BEHALTEN=2 Kopien
#    T5  Wiederherstellungsprobe (neuester Snapshot): N gleich,
#        0 abweichend, 0 fehlend, Probe-Container healthy, Bestände lesbar
#    T6  Wiederherstellungsprobe mit --snapshot <ID>
#    T7  Fehlalarm: falsches Repository-Passwort → Fehler UND Fail-Ping
#    T8  Probe mit falschem Pfeffer → Fehler UND Fail-Ping
#    T9  zweiter gleichzeitiger Lauf wird durch die Sperre abgewiesen (75)
#    T11 Status-/Lokalordner im Datenpfad: abgelehnt, nichts angelegt
#    T12 Ping-URL mit unzulässigen Zeichen: abgelehnt
#    T13 leere Quelle → Abbruch + Fail-Ping, kein Snapshot
#    T14 geschrumpfte Quelle (> 20 %) → Abbruch + Fail-Ping, kein Snapshot
#    T15 Fehler in pruefen / backup / forget / check (Wrapper) → Fail-Ping
#    T16 hängendes restic → Zeitgrenze, Exit 124, Fail-Ping
#    T17 hängender Container → Zeitgrenze, Fail-Ping
#    T18 keine Geheimnisse in Kommandozeilen und docker inspect
#    T10 keine Geheimnisse in Logs und Ausgaben, Pfeffer-Temp-Datei gelöscht
#  Die Haupt-Konfiguration nutzt eine .env mit Pfeffer in Anführungszeichen.
# =====================================================================
set -Eeuo pipefail

: "${BILD:?BILD fehlt}"
: "${RUNNER_TEMP:?RUNNER_TEMP fehlt}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SICH="$(cd "$HIER/.." && pwd)"

ok() { printf '✔ %s\n' "$*"; ERGEBNISSE+=("✔ $*"); }
fehl() {
  printf '::error::%s\n' "$*"
  exit 1
}
ERGEBNISSE=()

T="$(mktemp -d "$RUNNER_TEMP/wp04-XXXXXX")"
chmod 700 "$T"
AUS="$T/ausgaben"
mkdir -m 700 "$AUS" "$T/daten" "$T/status"

# --- Geheimnisse (zufällig, maskiert) -----------------------------------
PFEFFER="$(openssl rand -base64 32)"
ADMIN="$(openssl rand -hex 24)"
RESTIC_PW="$(openssl rand -base64 33)"
FALSCH_PW="$(openssl rand -base64 33)"
PING_ID="$(openssl rand -hex 16)"
PROBE_ID="$(openssl rand -hex 16)"
for g in "$PFEFFER" "$ADMIN" "$RESTIC_PW" "$FALSCH_PW" "$PING_ID" "$PROBE_ID"; do
  echo "::add-mask::$g"
done

BILD_ID="$(docker image inspect --format '{{.Id}}' "$BILD")"
[[ "$BILD_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fehl "Bild-ID unerwartet: $BILD_ID"

printf 'CENTRIC_PFEFFER=%s\nCENTRIC_ADMIN=%s\nCENTRIC_BASIS=http://127.0.0.1:3000\n' \
  "$PFEFFER" "$ADMIN" >"$T/prod.env"
printf 'CENTRIC_PFEFFER=%s\nCENTRIC_ADMIN=%s\nCENTRIC_BASIS=http://127.0.0.1:3000\n' \
  "$(openssl rand -base64 32)" "$ADMIN" >"$T/prod-falscher-pfeffer.env"
# Wie eine von Hand gepflegte .env: Pfeffer in Anführungszeichen. docker
# compose entfernt sie, docker run --env-file nicht — die Skripte müssen
# denselben Pfeffer wie der Dienst sehen (sonst scheitert die Probe).
printf 'CENTRIC_PFEFFER="%s"\nCENTRIC_ADMIN=%s\nCENTRIC_BASIS=http://127.0.0.1:3000\n' \
  "$PFEFFER" "$ADMIN" >"$T/prod-anfuehrung.env"
printf '%s\n' "$RESTIC_PW" >"$T/restic-pw"
printf '%s\n' "$FALSCH_PW" >"$T/restic-pw-falsch"
chmod 600 "$T/prod.env" "$T/prod-anfuehrung.env" "$T/prod-falscher-pfeffer.env" "$T/restic-pw" "$T/restic-pw-falsch"

# --- Testdaten über die echte Anwendungsschicht im Bild -----------------
testdaten() {
  docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
    --env-file "$T/prod.env" -v "$T/daten:/data" -v "$HIER/testdaten.mjs:/ci/testdaten.mjs:ro" \
    --entrypoint node "$BILD_ID" /ci/testdaten.mjs "$@"
}
testdaten | tail -n1
for s in centric centric-sitzungen centric-spur centric-takt centric-accountsitzungen; do
  printf '  %-26s %s Dateien\n' "$s" "$(find "$T/daten/$s" -type f | wc -l)"
done
ok "Testdaten angelegt ($(find "$T/daten" -type f | wc -l) Dateien in der Wegwerf-Ablage)"

# --- restic-Repository ----------------------------------------------------
export RESTIC_REPOSITORY="$T/repo"
export RESTIC_PASSWORD_FILE="$T/restic-pw"
restic init >/dev/null
ok "restic-Repository angelegt ($(restic version | head -n1))"

# --- Ping-Empfänger --------------------------------------------------------
PORT=18765
PINGS="$T/pings.log"
: >"$PINGS"
python3 "$HIER/ping-empfaenger.py" "$PORT" "$PINGS" &
EMPFAENGER=$!
trap 'kill "$EMPFAENGER" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -fsS -o /dev/null "http://127.0.0.1:$PORT/bereit" && break; sleep 0.2; done
: >"$PINGS"
zaehle() { grep -c -x "$1" "$PINGS" || true; }

# --- Konfiguration ---------------------------------------------------------
konfig() { # datei passwortdatei env-datei [zusätzliche Zeilen …] (spätere überschreiben)
  local datei="$1"
  cat >"$datei" <<EOF
# CI-Testkonfiguration
CENTRIC_PROD_IMAGE=$BILD_ID
CENTRIC_DATEN_PFAD=$T/daten
CENTRIC_ENV_DATEI=$3
RESTIC_REPOSITORY=$T/repo
RESTIC_PASSWORD_FILE=$2
ALARM_PING_URL=http://127.0.0.1:$PORT/ping/$PING_ID
PROBE_PING_URL=http://127.0.0.1:$PORT/ping/$PROBE_ID
LOKAL_BEHALTEN=2
STATUS_VERZEICHNIS=$T/status
EOF
  shift 3
  local z
  for z in "$@"; do printf '%s\n' "$z" >>"$datei"; done
  chmod 600 "$datei"
}
KONFIG="$T/konfig.env"
konfig "$KONFIG" "$T/restic-pw" "$T/prod-anfuehrung.env"
konfig "$T/konfig-falsches-pw.env" "$T/restic-pw-falsch" "$T/prod.env"
konfig "$T/konfig-falscher-pfeffer.env" "$T/restic-pw" "$T/prod-falscher-pfeffer.env"

# Die Skripte bekommen KEINE restic-Umgebung vom Test — nur die Konfiguration.
ohne_umgebung() { env -u RESTIC_REPOSITORY -u RESTIC_PASSWORD_FILE "$@"; }

# erwarteter Code: Zahl, oder 'fehler' = jeder Code außer 0, 75, 78
# (restic meldet z. B. ein falsches Passwort mit eigenem Code).
lauf() { # name erwarteter-code befehl…
  local name="$1" erwartet="$2" code=0
  shift 2
  ohne_umgebung "$@" >"$AUS/$name.txt" 2>&1 || code=$?
  sed "s/^/[$name] /" "$AUS/$name.txt"
  if [[ "$erwartet" == "fehler" ]]; then
    [[ "$code" != 0 && "$code" != 75 && "$code" != 78 ]] || fehl "$name: Exit $code, erwartet ein Fehlercode"
  else
    [[ "$code" == "$erwartet" ]] || fehl "$name: Exit $code, erwartet $erwartet"
  fi
  LETZTER_CODE="$code"
}
status_feld() { grep -o "\"$2\":\"\{0,1\}[^,\"}]*" "$1" | head -n1 | sed 's/.*:"\{0,1\}//'; }
snapshots_json() { restic snapshots --json --host centric --tag centric; }
snap_anzahl() { snapshots_json | grep -o '"id":"[0-9a-f]\{64\}"' | wc -l; }

# === T1 Modus der Konfigurationsdatei ======================================
chmod 644 "$KONFIG"
lauf t1-modus 78 "$SICH/sicherung-ausser-haus.sh" "$KONFIG"
grep -q "Modus 644" "$AUS/t1-modus.txt" || fehl "T1: Meldung zum Modus fehlt"
chmod 600 "$KONFIG"
ok "T1 Konfiguration mit Modus 644 abgelehnt (Exit 78)"

# === T2 Sicherung 1 ==========================================================
lauf t2-sicherung-1 0 "$SICH/sicherung-ausser-haus.sh" "$KONFIG"
[[ "$(status_feld "$T/status/status.json" ergebnis)" == "ok" ]] || fehl "T2: status.json nicht ok"
S1_ID="$(status_feld "$T/status/status.json" snapshot_id)"
S1_DATEIEN="$(status_feld "$T/status/status.json" dateien)"
S1_BYTES="$(status_feld "$T/status/status.json" bytes)"
[[ "$(zaehle "POST /ping/$PING_ID/start 0")" -eq 1 ]] || fehl "T2: Start-Ping fehlt"
[[ "$(grep -c "^POST /ping/$PING_ID [1-9]" "$PINGS")" -eq 1 ]] || fehl "T2: Erfolgs-Ping fehlt"
[[ "$(grep -c "/fail" "$PINGS")" -eq 0 ]] || fehl "T2: unerwarteter Fail-Ping"
ok "T2 Sicherung 1: $S1_DATEIEN Dateien, $S1_BYTES Bytes, Snapshot ${S1_ID:0:8}; Start- und Erfolgs-Ping angekommen"
cat "$T/status/status.json"

# Klasse C und flüchtige Präfixe dürfen nicht in der Sicherung sein
LOKAL1="$(find "$T/status/lokal" -mindepth 1 -maxdepth 1 -type d -name 'centric-sicherung-*' | sort | tail -n1)"
# (das Werkzeug legt für Klasse C leere Verzeichnisse an — es zählen Dateien)
[[ -z "$(find "$LOKAL1/daten/centric-takt" "$LOKAL1/daten/centric-accountsitzungen" -type f 2>/dev/null)" ]] ||
  fehl "Klasse C gesichert"
! find "$LOKAL1/daten" -name 't%3A*' -o -name 'token%3A*' | grep -q . || fehl "flüchtige Schlüssel gesichert"
ok "Klasse C (takt, accountsitzungen) sowie t:/token: nicht in der Sicherung"

# === T3 Aufbewahrung =========================================================
mkdir -m 700 "$T/kuenstlich"
for tag in $(seq 40 -1 1); do
  printf 'kuenstlich %s\n' "$tag" >"$T/kuenstlich/tag.txt"
  restic backup --quiet --host centric --tag centric --tag kuenstlich \
    --time "$(date -u -d "$tag days ago" '+%Y-%m-%d 12:00:00')" "$T/kuenstlich" >/dev/null
done
snapshots_json >"$T/vorher.json"
VORHER="$(snap_anzahl)"
testdaten --nachtrag 2 | tail -n1
lauf t3-sicherung-2 0 "$SICH/sicherung-ausser-haus.sh" "$KONFIG"
S2_ID="$(status_feld "$T/status/status.json" snapshot_id)"
snapshots_json >"$T/nachher.json"
NACHHER="$(snap_anzahl)"
# Erwartung: Stand vor dem Lauf + neuer Snapshot, unabhängig nachgerechnet
jq -s --arg neu "$S2_ID" '.[0] + [.[1][] | select(.id == $neu or .short_id == $neu)]' \
  "$T/vorher.json" "$T/nachher.json" | python3 "$HIER/aufbewahrung-erwartet.py" >"$T/erwartet.txt"
jq -r '.[].id' "$T/nachher.json" | sort >"$T/behalten.txt"
if ! diff -u "$T/erwartet.txt" "$T/behalten.txt"; then
  jq -r '.[] | "\(.time) \(.short_id) \(.tags | join(","))"' "$T/nachher.json"
  fehl "T3: behaltene Snapshots weichen von der Nachrechnung ab"
fi
jq -r --arg s1 "$S1_ID" '.[] | select(.id == $s1 or .short_id == $s1) | .id' "$T/nachher.json" | grep -q . &&
  fehl "T3: Snapshot von Sicherung 1 (gleicher Tag, älter) hätte entfallen müssen"
[[ "$NACHHER" -lt "$((VORHER + 1))" && "$NACHHER" -le 23 ]] || fehl "T3: Anzahl unplausibel ($VORHER+1 → $NACHHER)"
ok "T3 Aufbewahrung 7/4/12: $((VORHER + 1)) Snapshots → $NACHHER behalten, identisch mit unabhängiger Nachrechnung; ältere Sicherung desselben Tages entfernt"

# === T4 lokale Kopien ========================================================
testdaten --nachtrag 3 | tail -n1
lauf t4-sicherung-3 0 "$SICH/sicherung-ausser-haus.sh" "$KONFIG"
S3_ID="$(status_feld "$T/status/status.json" snapshot_id)"
S3_DATEIEN="$(status_feld "$T/status/status.json" dateien)"
S3_NAME="$(status_feld "$T/status/status.json" sicherung)"
mapfile -t LOKALE < <(find "$T/status/lokal" -mindepth 1 -maxdepth 1 -type d -name 'centric-sicherung-*' -printf '%f\n' | sort)
[[ ${#LOKALE[@]} -eq 2 ]] || fehl "T4: ${#LOKALE[@]} lokale Kopien, erwartet 2"
[[ "${LOKALE[1]}" == "$S3_NAME" ]] || fehl "T4: neueste lokale Kopie ist nicht die von Sicherung 3"
ok "T4 nach drei Läufen genau 2 lokale Kopien (${LOKALE[*]})"

# === T5 Wiederherstellungsprobe, neuester Snapshot ===========================
lauf t5-probe 0 "$SICH/wiederherstellung-probe.sh" "$KONFIG"
grep -q "Manifest-Abgleich: $S3_DATEIEN gleich, 0 abweichend, 0 fehlend, 0 überzählig" "$AUS/t5-probe.txt" ||
  fehl "T5: Manifest-Abgleich nicht '$S3_DATEIEN gleich, 0 abweichend, 0 fehlend'"
P="$T/status/probe-status.json"
cat "$P"
[[ "$(status_feld "$P" ergebnis)" == "ok" && "$(status_feld "$P" healthy)" == "ja" ]] || fehl "T5: probe-status nicht ok/healthy"
[[ "$(status_feld "$P" bestaende_lesbar)" == "3" && "$(status_feld "$P" konten)" == "4" ]] || fehl "T5: Bestände/Konten nicht 3/4"
[[ "$(status_feld "$P" snapshot_id)" == "$S3_ID"* || "$S3_ID" == "$(status_feld "$P" snapshot_id)"* ]] || fehl "T5: nicht der neueste Snapshot"
[[ "$(zaehle "POST /ping/$PROBE_ID/start 0")" -eq 1 && "$(grep -c "^POST /ping/$PROBE_ID [1-9]" "$PINGS")" -eq 1 ]] ||
  fehl "T5: Probe-Pings fehlen"
[[ -z "$(find "$T/status/probe" -mindepth 1 -print -quit)" ]] || fehl "T5: Arbeitsordner nicht aufgeräumt"
docker ps -a --format '{{.Names}}' | grep -q '^centric-probe-' && fehl "T5: Probe-Container nicht entfernt"
ok "T5 Wiederherstellungsprobe: $S3_DATEIEN gleich, 0 abweichend, 0 fehlend; Probe-Container healthy ohne Netz; 3/3 Bestände lesbar, 4 Konten; aufgeräumt"

# === T6 Probe mit angegebenem Snapshot =======================================
lauf t6-probe-snapshot 0 "$SICH/wiederherstellung-probe.sh" "$KONFIG" --snapshot "${S3_ID:0:8}"
grep -q "gleich, 0 abweichend, 0 fehlend, 0 überzählig" "$AUS/t6-probe-snapshot.txt" || fehl "T6: Abgleich"
ok "T6 Wiederherstellungsprobe mit --snapshot ${S3_ID:0:8} (Kurz-ID) bestanden; Snapshot von Sicherung 2 ist nach Sicherung 3 desselben Tages bewusst entfallen"

# === T7 Fehlalarm: falsches Repository-Passwort =============================
FAIL_VORHER="$(grep -c "^POST /ping/$PING_ID/fail" "$PINGS" || true)"
SNAP_VORHER="$(snap_anzahl)"
lauf t7-fehlalarm fehler "$SICH/sicherung-ausser-haus.sh" "$T/konfig-falsches-pw.env"
[[ "$(grep -c "^POST /ping/$PING_ID/fail [1-9]" "$PINGS")" -eq $((FAIL_VORHER + 1)) ]] || fehl "T7: Fail-Ping nicht angekommen"
[[ "$(status_feld "$T/status/status.json" ergebnis)" == "fehler" &&
  "$(status_feld "$T/status/status.json" schritt)" == "repository-zugang" ]] || fehl "T7: status.json meldet den Fehler nicht"
[[ "$(snap_anzahl)" -eq "$SNAP_VORHER" ]] || fehl "T7: Snapshot trotz Fehler angelegt"
ok "T7 Fehlalarm-Probe: falsches Passwort → Exit $LETZTER_CODE, Fail-Ping angekommen, status.json ergebnis=fehler (repository-zugang)"

# === T8 Probe mit falschem Pfeffer ===========================================
lauf t8-probe-pfeffer fehler "$SICH/wiederherstellung-probe.sh" "$T/konfig-falscher-pfeffer.env"
grep -q "CENTRIC_PFEFFER fehlt oder ist ein anderer" "$AUS/t8-probe-pfeffer.txt" || fehl "T8: Pfeffer-Ablehnung fehlt"
[[ "$(grep -c "^POST /ping/$PROBE_ID/fail [1-9]" "$PINGS")" -eq 1 ]] || fehl "T8: Fail-Ping der Probe fehlt"
[[ -z "$(find "$T/status/probe" -mindepth 1 -print -quit)" ]] || fehl "T8: Arbeitsordner nicht aufgeräumt"
ok "T8 Probe mit fremdem Pfeffer: abgelehnt, Fail-Ping angekommen, aufgeräumt"

# === T9 Sperre gegen Doppellauf ==============================================
PINGS_VORHER="$(wc -l <"$PINGS")"
flock -o "$T/status/lauf.lock" sleep 60 &
HALTER=$!
for _ in $(seq 1 50); do flock -n "$T/status/lauf.lock" true || break; sleep 0.1; done
lauf t9-sperre 75 "$SICH/sicherung-ausser-haus.sh" "$KONFIG"
lauf t9-sperre-probe 75 "$SICH/wiederherstellung-probe.sh" "$KONFIG"
kill "$HALTER" 2>/dev/null || true
wait "$HALTER" 2>/dev/null || true
[[ "$(wc -l <"$PINGS")" -eq "$PINGS_VORHER" ]] || fehl "T9: abgewiesener Lauf hat gepingt"
grep -q "hält die Sperre" "$AUS/t9-sperre.txt" || fehl "T9: Meldung fehlt"
ok "T9 zweiter gleichzeitiger Lauf (Sicherung und Probe) durch Sperre abgewiesen (Exit 75, kein Ping)"

fails() { grep -c "^POST /ping/$PING_ID/fail " "$PINGS" || true; }
# Ein Lauf, der scheitern muss: Fehlercode, Fail-Ping, Schritt in status.json.
fehlerlauf() { # name erwarteter-schritt status-verzeichnis konfig [VAR=wert …]
  local name="$1" schritt="$2" status="$3" konf="$4" vorher
  shift 4
  vorher="$(fails)"
  lauf "$name" fehler env "$@" "$SICH/sicherung-ausser-haus.sh" "$konf"
  [[ "$(fails)" -eq $((vorher + 1)) ]] || fehl "$name: Fail-Ping fehlt"
  [[ "$(status_feld "$status/status.json" ergebnis)" == "fehler" ]] || fehl "$name: status.json nicht ergebnis=fehler"
  [[ "$(status_feld "$status/status.json" schritt)" == "$schritt" ]] ||
    fehl "$name: Schritt $(status_feld "$status/status.json" schritt), erwartet $schritt"
}

# === T11 Arbeitsordner im Datenpfad: abgelehnt, bevor etwas angelegt wird ===
konfig "$T/konfig-im-datenpfad.env" "$T/restic-pw" "$T/prod.env" "STATUS_VERZEICHNIS=$T/daten/sicherung"
lauf t11-im-datenpfad 78 "$SICH/sicherung-ausser-haus.sh" "$T/konfig-im-datenpfad.env"
[[ ! -e "$T/daten/sicherung" ]] || fehl "T11: Ordner im Datenpfad wurde trotzdem angelegt"
konfig "$T/konfig-gleich-datenpfad.env" "$T/restic-pw" "$T/prod.env" "LOKAL_ZIEL=$T/daten"
lauf t11-gleich-datenpfad 78 "$SICH/sicherung-ausser-haus.sh" "$T/konfig-gleich-datenpfad.env"
ok "T11 Statusordner im Datenpfad bzw. Ziel = Datenpfad abgelehnt (Exit 78), nichts angelegt"

# === T12 Ping-URL mit unzulässigen Zeichen ===================================
konfig "$T/konfig-url.env" "$T/restic-pw" "$T/prod.env" "ALARM_PING_URL=http://127.0.0.1:$PORT/a\"b"
lauf t12-ping-url 78 "$SICH/sicherung-ausser-haus.sh" "$T/konfig-url.env"
ok "T12 Ping-URL mit Anführungszeichen abgelehnt (Exit 78)"

# === T13 leere Quelle =========================================================
mkdir -m 700 "$T/daten-leer" "$T/status-leer"
konfig "$T/konfig-leer.env" "$T/restic-pw" "$T/prod.env" \
  "CENTRIC_DATEN_PFAD=$T/daten-leer" "STATUS_VERZEICHNIS=$T/status-leer"
SNAP_VORHER="$(snap_anzahl)"
fehlerlauf t13-leer plausibilitaet "$T/status-leer" "$T/konfig-leer.env"
grep -q "Leere Sicherung" "$AUS/t13-leer.txt" || fehl "T13: Meldung fehlt"
[[ "$(snap_anzahl)" -eq "$SNAP_VORHER" ]] || fehl "T13: leere Sicherung ins Repository geschrieben"
ok "T13 leere Quelle: Abbruch (plausibilitaet), Fail-Ping, kein Snapshot"

# === T14 geschrumpfte Quelle ==================================================
cp -a "$T/daten" "$T/daten-klein"
rm -f "$T/daten-klein/centric-spur/"* "$T/daten-klein/centric-sitzungen/"*
konfig "$T/konfig-klein.env" "$T/restic-pw" "$T/prod-anfuehrung.env" "CENTRIC_DATEN_PFAD=$T/daten-klein"
fehlerlauf t14-schwund plausibilitaet "$T/status" "$T/konfig-klein.env"
grep -q "Rückgang über 20 %" "$AUS/t14-schwund.txt" || fehl "T14: Meldung fehlt"
[[ "$(snap_anzahl)" -eq "$SNAP_VORHER" ]] || fehl "T14: geschrumpfte Sicherung ins Repository geschrieben"
ok "T14 Dateizahl um mehr als 20 % gefallen: Abbruch (plausibilitaet), Fail-Ping, kein Snapshot"

# === T15 Fehler in pruefen, backup, forget, check =============================
konfig "$T/konfig-fake.env" "$T/restic-pw" "$T/prod-anfuehrung.env" \
  "RESTIC_BIN=$HIER/fake-restic.sh" "DOCKER_BIN=$HIER/fake-docker.sh" \
  "ZEITGRENZE_RESTIC=10" "ZEITGRENZE_CONTAINER=10"
fehlerlauf t15-pruefen pruefen "$T/status" "$T/konfig-fake.env" FAKE_DOCKER=pruefen-fehler
for befehl in backup forget check; do
  fehlerlauf "t15-$befehl" "restic-$befehl" "$T/status" "$T/konfig-fake.env" FAKE_RESTIC=fehler "FAKE_BEFEHL=$befehl"
done
ok "T15 Fehler in pruefen / restic backup / forget / check: je Fehlercode, Fail-Ping, richtiger Schritt in status.json"

# === T16 Zeitgrenze: hängendes restic ========================================
T0="$(date +%s)"
fehlerlauf t16-haengt-restic restic-backup "$T/status" "$T/konfig-fake.env" FAKE_RESTIC=haengt FAKE_BEFEHL=backup
[[ "$LETZTER_CODE" -eq 124 ]] || fehl "T16: Exit $LETZTER_CODE, erwartet 124"
[[ $(($(date +%s) - T0)) -lt 60 ]] || fehl "T16: Zeitgrenze griff nicht rechtzeitig"
grep -q "ZEITÜBERSCHREITUNG: restic backup" "$AUS/t16-haengt-restic.txt" || fehl "T16: Meldung fehlt"
ok "T16 hängendes restic backup nach 10 s abgebrochen (Exit 124), Fail-Ping, Sperre wieder frei"

# === T17 Zeitgrenze: hängender Container =====================================
T0="$(date +%s)"
fehlerlauf t17-haengt-container sichern "$T/status" "$T/konfig-fake.env" FAKE_DOCKER=haengt-sichern
[[ $(($(date +%s) - T0)) -lt 60 ]] || fehl "T17: Zeitgrenze griff nicht rechtzeitig"
grep -q "ZEITÜBERSCHREITUNG: Container" "$AUS/t17-haengt-container.txt" || fehl "T17: Meldung fehlt"
ok "T17 hängender Sicherungs-Container nach 10 s abgebrochen, Fail-Ping"

# === T18 keine Geheimnisse in argv und docker inspect ========================
: >"$T/argv.txt"
: >"$T/inspect.txt"
ohne_umgebung "$SICH/sicherung-ausser-haus.sh" "$KONFIG" >"$AUS/t18-beobachtet.txt" 2>&1 &
LAEUFER=$!
INSPIZIERT=0
while kill -0 "$LAEUFER" 2>/dev/null; do
  ps -eww -o args= >>"$T/argv.txt" 2>/dev/null || true
  for c in $(docker ps -q); do
    docker inspect "$c" >>"$T/inspect.txt" 2>/dev/null && INSPIZIERT=$((INSPIZIERT + 1))
  done
  sleep 0.1
done
wait "$LAEUFER" || fehl "T18: beobachteter Lauf scheiterte"
for g in "$PFEFFER" "$ADMIN" "$RESTIC_PW" "$PING_ID" "$PROBE_ID"; do
  if grep -qF -- "$g" "$T/argv.txt"; then fehl "T18: Geheimnis in einer Kommandozeile"; fi
done
for g in "$ADMIN" "$RESTIC_PW" "$PING_ID" "$PROBE_ID"; do
  if grep -qF -- "$g" "$T/inspect.txt"; then fehl "T18: Geheimnis in docker inspect"; fi
done
ok "T18 $(sort -u "$T/argv.txt" | wc -l) Kommandozeilen und $INSPIZIERT Container-Inspektionen ohne Passwort, Admin-Schlüssel, Ping-IDs; Pfeffer in keiner Kommandozeile (im Container-Env zwangsläufig, nur er)"

# === T10 keine Geheimnisse in Logs/Ausgaben ==================================
[[ -z "$(find "$T"/status* -name '.pfeffer-*' -print -quit)" ]] || fehl "T10: gefilterte Pfeffer-Datei nicht gelöscht"
for g in "$PFEFFER" "$ADMIN" "$RESTIC_PW" "$FALSCH_PW" "$PING_ID" "$PROBE_ID"; do
  if grep -rqF -- "$g" "$AUS" "$T/status/log" "$T/status/status.json" "$T/status/probe-status.json"; then
    fehl "T10: Geheimnis in Log/Ausgabe gefunden"
  fi
done
ok "T10 weder Passwort, Pfeffer, Admin-Schlüssel noch Ping-IDs in Logs, Ausgaben oder Statusdateien"

echo "--- Pings (IDs ersetzt) ---"
sed -e "s/$PING_ID/<sicherung>/" -e "s/$PROBE_ID/<probe>/" "$PINGS"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## WP-04 Sicherung außer Haus — Nachweis"
    echo
    for e in "${ERGEBNISSE[@]}"; do echo "- $e"; done
    echo
    echo "Pings: $(wc -l <"$PINGS") empfangen"
  } >>"$GITHUB_STEP_SUMMARY"
fi
echo "Alle Proben bestanden."
