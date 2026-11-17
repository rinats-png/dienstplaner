#!/usr/bin/env bash
# =====================================================================
#  CI-Nachweis BE-3 / B-1 (betrieb-sicherung.yml) — NUR CI, nie auf dem VPS.
#
#  Fährt den Widerrufbuch-Job (widerrufbuch-sicherung.sh) UND die Probe
#  (widerrufbuch-probe.sh) mit ECHTEM restic (>= 0.16.0) gegen lokale
#  Wegwerf-Repositories. Die Bücher erzeugt die echte Anwendungsschicht im
#  gebauten Bild (widerrufbuch-testdaten.mjs); gesiegelt wird und geprüft wird
#  mit dem echten Werkzeug im Bild. Nur synthetische Daten, kein Netz, kein
#  S3, keine echten Geheimnisse (Passwörter und Pfeffer zufällig, maskiert).
#  Schließt Punkt B3-8 (ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md), sobald grün.
#
#  Erwartet: BILD (lokal gebautes App-Bild), restic, docker, jq im PATH, RUNNER_TEMP.
#
#  Proben
#    W1  restic-Version >= 0.16.0; Erstlauf: Exit 0, Status, Form von
#        `restic snapshots --json` (time/id/short_id/tags/hostname), nur die
#        beiden Bücher im Snapshot, eigenes Repository, keine Geheimnisse
#    W2  Widerruf 1 → Lauf 2;  W3  Widerruf 2 → Lauf 3 (drei Snapshots)
#    W4  Probe: neuester/ältester nach "time" (unabhängig nachgerechnet),
#        Prüfsummen, Gegenprobe „erkannt“, nur lesend
#    W5  Probe mit umgekehrter und umgestellter Ausgabe von restic (echte
#        Daten), --alt mit mittlerem und neuestem Snapshot
#    W6  Rücksprung: Probe Exit 3, Job Exit 3 (nichts gesichert, Status
#        „ruecksprung“); restic-Exit 3 wird Exit 4 (nie mit Rücksprung
#        verwechselt); Abhilfe (Stand zurück) → Job wieder Exit 0
#    W7  fail-closed: falsches Passwort, fehlendes Repository, restic < 0.16.0,
#        Repository der Ablage → Exit 4 / 4 / 78 / 78, nie ein neuer Snapshot
#    W8  Erstlauf-Sperre: andere Host-Kennung → Exit 5, mit --erster-lauf Exit 0;
#        neues leeres Repository bei früherem Erfolg → Exit 5
#    W9  --retry-lock: fremde Sperre im Repository, der Job wartet und endet 0
#    W10 Aufbewahrung 200: 204 Snapshots + Lauf → genau die neuesten 200, unabhängig nachgerechnet
#    W11 restic check --read-data über das Haupt-Repository; keine Geheimnisse
# =====================================================================
set -Eeuo pipefail

: "${BILD:?BILD fehlt}"
: "${RUNNER_TEMP:?RUNNER_TEMP fehlt}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SICH="$(cd "$HIER/.." && pwd)"

ERGEBNISSE=()
ok() { printf '✔ %s\n' "$*"; ERGEBNISSE+=("✔ $*"); }
fehl() {
  printf '::error::%s\n' "$*"
  exit 1
}

T="$(mktemp -d "$RUNNER_TEMP/be3b1-XXXXXX")"
chmod 700 "$T"
AUS="$T/ausgaben"
mkdir -m 700 "$AUS" "$T/daten" "$T/zustand" "$T/merk" "$T/status" "$T/stand" "$T/k1" "$T/k2"

# --- Geheimnisse (zufällig, maskiert) -----------------------------------
PFEFFER="$(openssl rand -base64 32)"
RESTIC_PW="$(openssl rand -base64 33)"
FALSCH_PW="$(openssl rand -base64 33)"
for g in "$PFEFFER" "$RESTIC_PW" "$FALSCH_PW"; do echo "::add-mask::$g"; done

BILD_ID="$(docker image inspect --format '{{.Id}}' "$BILD")"
[[ "$BILD_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fehl "Bild-ID unerwartet: $BILD_ID"

printf 'CENTRIC_PFEFFER=%s\n' "$PFEFFER" >"$T/prod.env"
# Wie eine von Hand gepflegte .env: Pfeffer in Anführungszeichen (wie ende-zu-ende.sh).
printf 'CENTRIC_PFEFFER="%s"\n' "$PFEFFER" >"$T/dienst.env"
printf '%s\n' "$RESTIC_PW" >"$T/restic-pw"
printf '%s\n' "$FALSCH_PW" >"$T/restic-pw-falsch"
chmod 600 "$T/prod.env" "$T/dienst.env" "$T/restic-pw" "$T/restic-pw-falsch"

# --- restic ---------------------------------------------------------------
REPO="$T/repo-wb"
rr() { local repo="$1"; shift; restic -r "$repo" --password-file "$T/restic-pw" "$@"; }
RESTIC_VERSION_ZEILE="$(restic version | head -n1)"
[[ "$RESTIC_VERSION_ZEILE" =~ ^restic[[:space:]]+([0-9]+)\.([0-9]+)\.([0-9]+) ]] || fehl "restic-Version nicht erkennbar: $RESTIC_VERSION_ZEILE"
{ ((BASH_REMATCH[1] > 0)) || ((BASH_REMATCH[2] >= 16)); } || fehl "restic zu alt für den Job: $RESTIC_VERSION_ZEILE"
rr "$REPO" init >/dev/null
ok "echtes restic im Einsatz: $RESTIC_VERSION_ZEILE; Repository für die Widerrufbücher angelegt (eigenes, nicht das der Ablage)"

# --- Bücher über die echte Anwendungsschicht im Bild ---------------------
wbdaten() {
  docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
    --env-file "$T/prod.env" -e CENTRIC_ZUSTAND=/zustand -e CENTRIC_DATEN=/data -e CENTRIC_ABLAGE=dateien \
    -v "$T/daten:/data" -v "$T/zustand:/zustand" -v "$T/merk:/ci-merk" \
    -v "$HIER/widerrufbuch-testdaten.mjs:/ci/widerrufbuch-testdaten.mjs:ro" \
    --entrypoint node "$BILD_ID" /ci/widerrufbuch-testdaten.mjs "$@"
}
BUECHER=(zugang-widerrufe.json konto-widerrufe.json)
stand_sichern() { mkdir -m 700 "$T/stand/$1"; for b in "${BUECHER[@]}"; do cp -- "$T/zustand/$b" "$T/stand/$1/$b"; done; }
stand_zurueck() { for b in "${BUECHER[@]}"; do cp -- "$T/stand/$1/$b" "$T/zustand/$b"; done; }
wbdaten anlegen | tail -n1
for b in "${BUECHER[@]}"; do [[ -s "$T/zustand/$b" ]] || fehl "Buch $b fehlt nach dem Anlegen"; done
ok "Testdaten: Betrieb, 3 Konten, 3 Zugangscodes; beide Bücher gesiegelt im Zustandsverzeichnis"

# --- Konfigurationen -------------------------------------------------------
# k1 und k2 sind getrennte Ordner: der Job liest eine Datei `env` NEBEN seiner Konfiguration als die der Ablage.
konfig() { # datei repository passwortdatei statusverzeichnis [zusätzliche Zeilen …]
  local datei="$1" z
  cat >"$datei" <<EOF
# CI-Testkonfiguration (BE-3)
CENTRIC_PROD_IMAGE=$BILD_ID
CENTRIC_DATEN_PFAD=$T/daten
CENTRIC_ZUSTAND_PFAD=$T/zustand
CENTRIC_ENV_DATEI=$T/dienst.env
RESTIC_REPOSITORY=$2
RESTIC_PASSWORD_FILE=$3
STATUS_VERZEICHNIS=$4
ZEITGRENZE_RESTIC=900
ZEITGRENZE_CONTAINER=180
EOF
  shift 4
  for z in "$@"; do printf '%s\n' "$z" >>"$datei"; done
  chmod 600 "$datei"
}
STATUS="$T/status"
K="$T/k1/widerrufbuch.env"
konfig "$K" "$REPO" "$T/restic-pw" "$STATUS"
# Konfiguration der Ablage neben der des Jobs: ANDERES Repository → erlaubt.
printf 'RESTIC_REPOSITORY=%s\n' "$T/repo-ablage" >"$T/k1/env"
chmod 600 "$T/k1/env"

ohne_umgebung() { env -u RESTIC_REPOSITORY -u RESTIC_PASSWORD_FILE "$@"; }
lauf() { # name erwarteter-code befehl …
  local name="$1" erwartet="$2" code=0
  shift 2
  ohne_umgebung "$@" >"$AUS/$name.txt" 2>&1 || code=$?
  sed "s/^/[$name] /" "$AUS/$name.txt"
  [[ "$code" == "$erwartet" ]] || fehl "$name: Exit $code, erwartet $erwartet"
}
JOB="$SICH/widerrufbuch-sicherung.sh"
PROBE="$SICH/widerrufbuch-probe.sh"
sf() { jq -r ".$2 // empty" "$1"; }                  # Feld aus einer Statusdatei
JOB_STATUS="$STATUS/widerrufbuch-status.json"
PROBE_STATUS="$STATUS/widerrufbuch-probe-status.json"
snaps() { rr "${2:-$REPO}" snapshots --json --host "${1:-centric}" --tag widerrufbuch; }
snap_n() { snaps "$@" | jq 'length'; }
praefix() { [[ "$1" == "$2"* || "$2" == "$1"* ]]; }   # Kurz- und Lang-ID gleich

# === W1 Erstlauf ============================================================
lauf w1-erstlauf 0 "$JOB" "$K"
[[ "$(sf "$JOB_STATUS" ergebnis)" == "ok" && "$(sf "$JOB_STATUS" schritt)" == "fertig" && "$(sf "$JOB_STATUS" code)" == "0" ]] ||
  fehl "W1: Status nicht ok/fertig/0"
[[ "$(sf "$JOB_STATUS" snapshots)" == "1" && "$(sf "$JOB_STATUS" buecher)" == "2" && "$(sf "$JOB_STATUS" host)" == "centric" &&
  "$(sf "$JOB_STATUS" nachweis)" == "check+liste+rueckholung+siegel" ]] || fehl "W1: Status weicht ab ($(cat "$JOB_STATUS"))"
snaps >"$T/w1-snapshots.json"
jq -e 'length == 1 and (.[0] | (.time | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T"))
  and (.id | test("^[0-9a-f]{64}$")) and (.short_id | test("^[0-9a-f]{8}$"))
  and .tags == ["widerrufbuch"] and .hostname == "centric")' "$T/w1-snapshots.json" >/dev/null ||
  fehl "W1: Form von 'restic snapshots --json' weicht von der Annahme des Jobs/der Probe ab: $(cat "$T/w1-snapshots.json")"
W1_ID="$(jq -r '.[0].id' "$T/w1-snapshots.json")"
praefix "$(sf "$JOB_STATUS" snapshot_id)" "$W1_ID" || fehl "W1: snapshot_id der Statusdatei ($(sf "$JOB_STATUS" snapshot_id)) ist nicht der Snapshot im Repository"
IM_SNAPSHOT="$(rr "$REPO" ls --json "$W1_ID" | jq -r 'select(.type == "file") | .name' | sort | tr '\n' ' ')"
[[ "$IM_SNAPSHOT" == "konto-widerrufe.json zugang-widerrufe.json " ]] || fehl "W1: im Snapshot liegt nicht genau 'beide Bücher': $IM_SNAPSHOT"
grep -q "(>= 0.16.0)" "$AUS/w1-erstlauf.txt" || fehl "W1: Versionsprüfung nicht im Log"
grep -q "Eigenes Repository: verschieden" "$AUS/w1-erstlauf.txt" || fehl "W1: Prüfung 'eigenes Repository' nicht im Log"
grep -q "Vergleichsstand: noch keine Sicherung (erster Lauf)" "$AUS/w1-erstlauf.txt" || fehl "W1: Erstlauf nicht erkannt"
ok "W1 Erstlauf mit echtem restic: Exit 0, Snapshot ${W1_ID:0:8}, nur die beiden Bücher, 'snapshots --json' hat time/id/short_id/tags/hostname wie angenommen, --retry-lock und Version akzeptiert"

# === W2/W3 Widerrufe, Läufe 2 und 3 ==========================================
wbdaten widerruf 1 | tail -n1
stand_sichern s1
lauf w2-lauf-2 0 "$JOB" "$K"
[[ "$(sf "$JOB_STATUS" snapshots)" == "2" && "$(sf "$JOB_STATUS" fehlend)" == "0" ]] || fehl "W2: Status ($(cat "$JOB_STATUS"))"
(("$(sf "$JOB_STATUS" eintraege_codes)" >= 1 && "$(sf "$JOB_STATUS" eintraege_konten)" >= 1)) || fehl "W2: Widerruf nicht in den Zahlen"
ok "W2 Widerruf 1 (Code und Konto) → Lauf 2: Exit 0, 2 Snapshots, Einträge in beiden Büchern gesichert"
sleep 1
wbdaten widerruf 2 | tail -n1
stand_sichern s2
lauf w3-lauf-3 0 "$JOB" "$K"
[[ "$(sf "$JOB_STATUS" snapshots)" == "3" ]] || fehl "W3: Status ($(cat "$JOB_STATUS"))"
snaps >"$T/w3-snapshots.json"
[[ "$(jq length "$T/w3-snapshots.json")" == "3" ]] || fehl "W3: nicht drei Snapshots im Repository"
NEWEST="$(jq -r 'sort_by(.time) | last | .id' "$T/w3-snapshots.json")"
OLDEST="$(jq -r 'sort_by(.time) | first | .id' "$T/w3-snapshots.json")"
MIDDLE="$(jq -r 'sort_by(.time) | .[1] | .id' "$T/w3-snapshots.json")"
[[ "$OLDEST" == "$W1_ID" ]] || fehl "W3: ältester Snapshot nicht der erste Lauf"
praefix "$(sf "$JOB_STATUS" snapshot_id)" "$NEWEST" || fehl "W3: neuester Snapshot nicht der des dritten Laufs"
[[ "$(jq '[.[].time] | length == (unique | length)' "$T/w3-snapshots.json")" == "true" ]] || fehl "W3: Snapshot-Zeiten nicht eindeutig"
if [[ "$(jq '[.[].time] == ([.[].time] | sort)' "$T/w3-snapshots.json")" == "true" ]]; then SORTIERT="aufsteigend nach time"; else SORTIERT="NICHT aufsteigend nach time"; fi
ok "W3 Widerruf 2 → Lauf 3: Exit 0, 3 Snapshots. Befund: 'restic snapshots --json' liefert die Snapshots $SORTIERT (die Probe verlässt sich nicht darauf)"

# === W4 Probe ====================================================================
SNAP_VOR_PROBE="$(snap_n)"
lauf w4-probe 0 "$PROBE" "$K"
[[ "$(sf "$PROBE_STATUS" ergebnis)" == "ok" && "$(sf "$PROBE_STATUS" schritt)" == "fertig" && "$(sf "$PROBE_STATUS" snapshots)" == "3" ]] ||
  fehl "W4: Probe-Status ($(cat "$PROBE_STATUS"))"
[[ "$(sf "$PROBE_STATUS" neuester)" == "$NEWEST" && "$(sf "$PROBE_STATUS" vergleich)" == "$OLDEST" ]] ||
  fehl "W4: neuester/Vergleich weichen von der Nachrechnung nach 'time' ab"
[[ "$(sf "$PROBE_STATUS" gegenprobe)" == "erkannt" && "$(sf "$PROBE_STATUS" live_fehlend)" == "0" ]] || fehl "W4: Gegenprobe/live ($(cat "$PROBE_STATUS"))"
(("$(sf "$PROBE_STATUS" gegenprobe_fehlend)" >= 2)) || fehl "W4: Gegenprobe meldet zu wenig Fehlendes"
for b in "${BUECHER[@]}"; do
  soll="$(sha256sum -- "$T/zustand/$b" | cut -d' ' -f1)"
  [[ "$(sf "$PROBE_STATUS" pruefsummen)" == *"$b=$soll"* ]] || fehl "W4: Prüfsumme von $b weicht ab"
done
grep -q "check --read-data bestanden" "$AUS/w4-probe.txt" || fehl "W4: check --read-data nicht bestanden/gemeldet"
grep -q "bytegleich mit der Stufe des letzten erfolgreichen Jobs" "$AUS/w4-probe.txt" || fehl "W4: Abgleich mit der Stufe fehlt"
[[ "$(snap_n)" == "$SNAP_VOR_PROBE" ]] || fehl "W4: die Probe hat das Repository verändert"
[[ -z "$(find "$STATUS" -maxdepth 1 -name 'widerrufbuch-probe-*' -type d -print -quit)" ]] || fehl "W4: Arbeitsordner der Probe nicht aufgeräumt"
ok "W4 Probe (echtes restic, check --read-data): neuester ${NEWEST:0:8}/ältester ${OLDEST:0:8} nach 'time' = unabhängige Nachrechnung; Prüfsummen stimmen; Gegenprobe erkannt ($(sf "$PROBE_STATUS" gegenprobe_fehlend) fehlen); nur lesend, aufgeräumt"

# === W5 Probe mit anderer Ausgabereihenfolge von restic =======================
for variante in 'umgekehrt|sort_by(.time) | reverse' 'umgestellt|sort_by(.time) | [.[1], .[2], .[0]]'; do
  name="${variante%%|*}"
  filter="${variante#*|}"
  konfig "$T/k1/probe-$name.env" "$REPO" "$T/restic-pw" "$STATUS" "RESTIC_BIN=$HIER/restic-ordnung.sh"
  # Die Umstellung muss die Zeitordnung wirklich verletzen (sonst beweist sie nichts).
  if [[ "$name" == "umgekehrt" ]]; then
    ORDNUNG_FILTER="$filter" "$HIER/restic-ordnung.sh" snapshots -r "$REPO" --password-file "$T/restic-pw" --json --host centric --tag widerrufbuch |
      jq -e '[.[].time] == ([.[].time] | sort | reverse)' >/dev/null || fehl "W5: Wrapper kehrt die Liste nicht um"
  else
    ORDNUNG_FILTER="$filter" "$HIER/restic-ordnung.sh" snapshots -r "$REPO" --password-file "$T/restic-pw" --json --host centric --tag widerrufbuch |
      jq -e '([.[].time] != ([.[].time] | sort)) and ([.[].time] != ([.[].time] | sort | reverse))' >/dev/null || fehl "W5: Wrapper stellt die Liste nicht um"
  fi
  lauf "w5-probe-$name" 0 env "ORDNUNG_FILTER=$filter" "$PROBE" "$T/k1/probe-$name.env"
  [[ "$(sf "$PROBE_STATUS" neuester)" == "$NEWEST" && "$(sf "$PROBE_STATUS" vergleich)" == "$OLDEST" &&
    "$(sf "$PROBE_STATUS" gegenprobe)" == "erkannt" ]] || fehl "W5 ($name): falscher neuester/ältester Snapshot ($(cat "$PROBE_STATUS"))"
done
lauf w5-alt-mitte 0 "$PROBE" --alt "${MIDDLE:0:12}" "$K"
[[ "$(sf "$PROBE_STATUS" vergleich)" == "$MIDDLE" && "$(sf "$PROBE_STATUS" gegenprobe)" == "erkannt" ]] || fehl "W5: --alt mit mittlerem Snapshot"
lauf w5-alt-neuester 0 "$PROBE" --alt "${NEWEST:0:12}" "$K"
[[ "$(sf "$PROBE_STATUS" gegenprobe)" == "nicht-moeglich" ]] || fehl "W5: --alt = neuester müsste 'nicht-moeglich' ergeben"
ok "W5 Probe bei umgekehrter und umgestellter Snapshot-Liste (echte restic-Daten): gleicher neuester/ältester; --alt mit mittlerem Snapshot → erkannt, mit neuestem → nicht möglich"

# === W6 Rücksprung ================================================================
LETZTE_ERFOLG="$(sf "$JOB_STATUS" letzte_erfolgreiche)"
stand_zurueck s1
lauf w6-probe-ruecksprung 3 "$PROBE" "$K"
[[ "$(sf "$PROBE_STATUS" ergebnis)" == "ruecksprung" && "$(sf "$PROBE_STATUS" schritt)" == "live-vergleich" && "$(sf "$PROBE_STATUS" code)" == "3" ]] ||
  fehl "W6: Probe-Status ($(cat "$PROBE_STATUS"))"
(("$(sf "$PROBE_STATUS" live_fehlend)" >= 2)) || fehl "W6: Probe meldet zu wenig Fehlendes"
for b in "${BUECHER[@]}"; do cmp -s -- "$T/zustand/$b" "$T/stand/s1/$b" || fehl "W6: die Probe hat das Zustandsverzeichnis verändert ($b)"; done
lauf w6-job-ruecksprung 3 "$JOB" "$K"
grep -q "RÜCKSPRUNG ERKANNT" "$AUS/w6-job-ruecksprung.txt" || fehl "W6: Meldung fehlt"
[[ "$(sf "$JOB_STATUS" ergebnis)" == "ruecksprung" && "$(sf "$JOB_STATUS" schritt)" == "pruefen" && "$(sf "$JOB_STATUS" code)" == "3" ]] ||
  fehl "W6: Job-Status ($(cat "$JOB_STATUS"))"
(("$(sf "$JOB_STATUS" fehlend)" >= 2)) || fehl "W6: Job meldet zu wenig Fehlendes"
[[ "$(sf "$JOB_STATUS" letzte_erfolgreiche)" == "$LETZTE_ERFOLG" ]] || fehl "W6: letzte erfolgreiche Sicherung darf nicht fortgeschrieben werden"
[[ "$(snap_n)" == "3" ]] || fehl "W6: trotz Rücksprung gesichert"
# Abhilfe: der neuere Stand ist zurück → Probe wieder gut. restic-Exit 3 („Snapshot unvollständig“) wird Exit 4.
stand_zurueck s2
lauf w6-probe-abhilfe 0 "$PROBE" "$K"
konfig "$T/k1/fake.env" "$REPO" "$T/restic-pw" "$STATUS" "RESTIC_BIN=$HIER/fake-restic.sh"
lauf w6-restic-exit-3 4 env FAKE_RESTIC=fehler FAKE_BEFEHL=backup FAKE_RESTIC_CODE=3 "$JOB" "$T/k1/fake.env"
[[ "$(sf "$JOB_STATUS" ergebnis)" == "fehler" && "$(sf "$JOB_STATUS" schritt)" == "restic-backup" && "$(sf "$JOB_STATUS" code)" == "4" ]] ||
  fehl "W6: restic-Exit 3 darf nicht als Rücksprung gelten ($(cat "$JOB_STATUS"))"
grep -q "restic-Code 3" "$AUS/w6-restic-exit-3.txt" || fehl "W6: restic-Code 3 steht nicht im Log"
[[ "$(snap_n)" == "3" ]] || fehl "W6: trotz restic-Fehler gesichert"
lauf w6-job-abhilfe 0 "$JOB" "$K"
[[ "$(sf "$JOB_STATUS" ergebnis)" == "ok" && "$(sf "$JOB_STATUS" snapshots)" == "4" ]] || fehl "W6: Job nach Abhilfe ($(cat "$JOB_STATUS"))"
ok "W6 Rücksprung (älterer, gültig gesiegelter Stand): Probe Exit 3, Job Exit 3, nichts gesichert, letzte Erfolgsmeldung unverändert; restic-Exit 3 → Job Exit 4 (nicht 3); nach Rückkehr des Standes Probe und Job wieder Exit 0"

# === W7 fail-closed ===============================================================
SNAP_VOR="$(snap_n)"
konfig "$T/k1/falsches-pw.env" "$REPO" "$T/restic-pw-falsch" "$STATUS"
lauf w7-falsches-passwort 4 "$JOB" "$T/k1/falsches-pw.env"
[[ "$(sf "$JOB_STATUS" ergebnis)" == "fehler" && "$(sf "$JOB_STATUS" schritt)" == "repository-zugang" && "$(sf "$JOB_STATUS" code)" == "4" ]] ||
  fehl "W7: Status bei falschem Passwort ($(cat "$JOB_STATUS"))"
lauf w7-probe-falsches-passwort 4 "$PROBE" "$T/k1/falsches-pw.env"
konfig "$T/k1/kein-repo.env" "$T/gibt-es-nicht" "$T/restic-pw" "$STATUS"
lauf w7-kein-repository 4 "$JOB" "$T/k1/kein-repo.env"
# restic zu alt (0.15.x): Konfigurationsfehler, bevor irgendetwas geschieht.
cat >"$T/restic-alt.sh" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "version" ]]; then echo "restic 0.15.2 compiled with go1.20.5 on linux/amd64"; exit 0; fi
exec restic "$@"
EOF
chmod 755 "$T/restic-alt.sh"
konfig "$T/k1/restic-alt.env" "$REPO" "$T/restic-pw" "$STATUS" "RESTIC_BIN=$T/restic-alt.sh"
lauf w7-restic-zu-alt 78 "$JOB" "$T/k1/restic-alt.env"
grep -q "zu alt" "$AUS/w7-restic-zu-alt.txt" || fehl "W7: Meldung 'zu alt' fehlt"
lauf w7-probe-restic-zu-alt 78 "$PROBE" "$T/k1/restic-alt.env"
# Repository der Ablage = Repository der Widerrufbücher: abgelehnt.
konfig "$T/k2/widerrufbuch.env" "$REPO" "$T/restic-pw" "$STATUS"
printf 'RESTIC_REPOSITORY=%s\n' "$REPO" >"$T/k2/env"
chmod 600 "$T/k2/env"
lauf w7-gleiches-repository 78 "$JOB" "$T/k2/widerrufbuch.env"
grep -q "dasselbe Repository wie die Sicherung der Ablage" "$AUS/w7-gleiches-repository.txt" || fehl "W7: Meldung fehlt"
[[ "$(snap_n)" == "$SNAP_VOR" ]] || fehl "W7: trotz Fehler ein Snapshot angelegt"
ok "W7 fail-closed: falsches Passwort → Exit 4 (Job und Probe), fehlendes Repository → 4, restic 0.15.2 → 78, Repository der Ablage → 78; kein Snapshot angelegt"

# === W8 Erstlauf-Sperre ==============================================================
SNAP_VOR="$(snap_n)"
konfig "$T/k1/fremder-host.env" "$REPO" "$T/restic-pw" "$T/status-host" "RESTIC_HOST=ci-neuer-host"
lauf w8-fremder-host 5 "$JOB" "$T/k1/fremder-host.env"
[[ "$(sf "$T/status-host/widerrufbuch-status.json" ergebnis)" == "vergleich-fehlt" && "$(sf "$T/status-host/widerrufbuch-status.json" code)" == "5" ]] ||
  fehl "W8: Status ($(cat "$T/status-host/widerrufbuch-status.json"))"
[[ "$(snap_n ci-neuer-host)" == "0" && "$(snap_n)" == "$SNAP_VOR" ]] || fehl "W8: trotz fehlendem Vergleichsstand gesichert"
lauf w8-erster-lauf 0 "$JOB" --erster-lauf "$T/k1/fremder-host.env"
[[ "$(snap_n ci-neuer-host)" == "1" && "$(snap_n)" == "$SNAP_VOR" ]] || fehl "W8: --erster-lauf: Snapshots je Host (neu 1, alt $SNAP_VOR erwartet)"
# Neues, leeres Repository, aber der Status kennt frühere Erfolge (Repository ausgetauscht/verloren).
cp -a "$STATUS" "$T/status-austausch"
rr "$T/repo-leer" init >/dev/null
konfig "$T/k1/repo-leer.env" "$T/repo-leer" "$T/restic-pw" "$T/status-austausch"
lauf w8-repo-ausgetauscht 5 "$JOB" "$T/k1/repo-leer.env"
[[ "$(snap_n centric "$T/repo-leer")" == "0" ]] || fehl "W8: ins leere Repository gesichert"
ok "W8 Erstlauf-Sperre: andere Host-Kennung bei vorhandenen Snapshots → Exit 5, nichts gesichert; --erster-lauf → Exit 0 (1 Snapshot der neuen Kennung, die alten unberührt); leeres Repository bei früherem Erfolg → Exit 5"

# === W9 --retry-lock: fremde Sperre im Repository ====================================
# Ein `backup --stdin` hält die (nicht-exklusive) Sperre, solange seine Eingabe offen ist;
# `forget --prune` des Jobs braucht eine exklusive Sperre und muss warten.
mkfifo "$T/halter-fifo"
HALTER=""
# aufraeumen wird über trap aufgerufen
# shellcheck disable=SC2317,SC2329
aufraeumen() {
  exec 7>&- || true
  [[ -z "$HALTER" ]] || kill "$HALTER" 2>/dev/null || true
}
trap aufraeumen EXIT
(rr "$REPO" backup --stdin --stdin-filename sperre.txt --host ci-sperre --tag sperre-test <"$T/halter-fifo" >"$AUS/w9-halter.txt" 2>&1) &
HALTER=$!
exec 7>"$T/halter-fifo"
for _ in $(seq 1 60); do
  [[ "$(rr "$REPO" list locks --no-lock 2>/dev/null | wc -l)" -ge 1 ]] && break
  sleep 0.5
done
[[ "$(rr "$REPO" list locks --no-lock | wc -l)" -ge 1 ]] || fehl "W9: die fremde Sperre kam nicht zustande"
# Ohne --retry-lock scheitert eine exklusive Operation sofort (Beleg, dass die Sperre wirkt).
CODE=0
rr "$REPO" prune >"$AUS/w9-ohne-retry.txt" 2>&1 || CODE=$?
[[ "$CODE" != 0 ]] || fehl "W9: prune ohne --retry-lock hätte an der fremden Sperre scheitern müssen"
grep -qi "locked" "$AUS/w9-ohne-retry.txt" || fehl "W9: erwartete Sperrmeldung fehlt: $(cat "$AUS/w9-ohne-retry.txt")"
SNAP_VOR="$(snap_n)"
ohne_umgebung "$JOB" "$K" >"$AUS/w9-job.txt" 2>&1 &
JOBPID=$!
GEWARTET=0
for _ in $(seq 1 240); do
  if grep -q "already locked, waiting" "$AUS/w9-job.txt"; then GEWARTET=1; break; fi
  kill -0 "$JOBPID" 2>/dev/null || break
  sleep 0.5
done
exec 7>&-
CODE=0
wait "$JOBPID" || CODE=$?
wait "$HALTER" || true
HALTER=""
sed "s/^/[w9-job] /" "$AUS/w9-job.txt"
[[ "$GEWARTET" == 1 ]] || fehl "W9: der Job hat nicht auf die Sperre gewartet (Exit $CODE) — --retry-lock ohne Wirkung oder Meldung geändert"
[[ "$CODE" == 0 ]] || fehl "W9: Job nach Freigabe der Sperre Exit $CODE, erwartet 0"
[[ "$(sf "$JOB_STATUS" ergebnis)" == "ok" && "$(snap_n)" == "$((SNAP_VOR + 1))" ]] || fehl "W9: Job nach der Wartezeit nicht vollständig ($(cat "$JOB_STATUS"))"
ok "W9 --retry-lock: bei fremder Sperre scheitert 'restic prune' sofort, der Job wartet ('already locked, waiting') und endet nach Freigabe mit Exit 0 und neuem Snapshot"

# === W10 Aufbewahrung (200 letzte, 90 Tage) ============================================
REPO_A="$T/repo-aufbew"
STATUS_A="$T/status-aufbew"
rr "$REPO_A" init >/dev/null
mkdir -p "$STATUS_A/widerrufbuch/stufe"
for b in "${BUECHER[@]}"; do cp -- "$T/zustand/$b" "$STATUS_A/widerrufbuch/stufe/$b"; done
for i in $(seq 1 204); do
  rr "$REPO_A" backup --quiet --host centric --tag widerrufbuch \
    --time "$(date -u -d "2026-01-15 10:00:00 UTC + $i seconds" '+%Y-%m-%d %H:%M:%S')" "$STATUS_A/widerrufbuch/stufe" >/dev/null
done
[[ "$(snap_n centric "$REPO_A")" == "204" ]] || fehl "W10: Vorbereitung: nicht 204 Snapshots"
snaps centric "$REPO_A" >"$T/w10-vorher.json"
konfig "$T/k1/aufbewahrung.env" "$REPO_A" "$T/restic-pw" "$STATUS_A"
lauf w10-aufbewahrung 0 "$JOB" "$T/k1/aufbewahrung.env"
snaps centric "$REPO_A" >"$T/w10-nachher.json"
jq -s '(.[0] + .[1]) | unique_by(.id) | sort_by(.time) | .[-200:] | map(.id) | sort' "$T/w10-vorher.json" "$T/w10-nachher.json" >"$T/w10-erwartet.json"
jq 'map(.id) | sort' "$T/w10-nachher.json" >"$T/w10-behalten.json"
cmp -s "$T/w10-erwartet.json" "$T/w10-behalten.json" || fehl "W10: behaltene Snapshots weichen von der Nachrechnung ab"
[[ "$(jq length "$T/w10-behalten.json")" == "200" ]] || fehl "W10: nicht genau 200 Snapshots behalten"
ok "W10 Aufbewahrung: 204 Snapshots + Lauf → genau die neuesten 200 behalten (forget --keep-last 200 --keep-daily 90 --prune, Gruppe Host+Tag), identisch mit unabhängiger Nachrechnung"

# === W11 ganzes Repository lesen, keine Geheimnisse =====================================
rr "$REPO" check --read-data >"$AUS/w11-check.txt" 2>&1 || { cat "$AUS/w11-check.txt"; fehl "W11: restic check --read-data meldet Fehler"; }
for g in "$PFEFFER" "$RESTIC_PW" "$FALSCH_PW"; do
  if grep -rqF -- "$g" "$AUS" "$STATUS/log" "$JOB_STATUS" "$PROBE_STATUS" "$T/status-host" "$T/status-aufbew/log"; then
    fehl "W11: Geheimnis in Log/Ausgabe/Status gefunden"
  fi
done
[[ -z "$(find "$T"/status* -name '.pfeffer-*' -print -quit)" ]] || fehl "W11: gefilterte Pfeffer-Datei nicht gelöscht"
ok "W11 restic check --read-data über das Haupt-Repository bestanden; weder Passwort noch Pfeffer in Logs, Ausgaben oder Statusdateien; Pfeffer-Temp-Datei gelöscht"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## BE-3 B-1 Widerrufbuch-Sicherung mit echtem restic — Nachweis"
    echo
    echo "restic: \`$RESTIC_VERSION_ZEILE\`"
    echo
    for e in "${ERGEBNISSE[@]}"; do echo "- $e"; done
  } >>"$GITHUB_STEP_SUMMARY"
fi
echo "Alle Proben bestanden."
