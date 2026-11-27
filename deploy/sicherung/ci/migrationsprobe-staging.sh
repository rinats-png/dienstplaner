#!/usr/bin/env bash
# =====================================================================
#  RST-5: Migrationsprobe W-1…W-9 am EXAKTEN Digest-Bild — NUR CI
#  (staging-gate.yml nach Übernahme der Patches gate-ew3 UND rst-5 unter
#  docs/acc45/workflow-patches/), nie auf dem VPS, nie gegen Staging oder
#  Produktion. Nur synthetische Daten (Fixture K4-P3, @example.invalid).
#
#   1. Fixture (FIXTURE in migrationsprobe-staging.mjs) schreibt die
#      Anwendungsschicht des 274bfa0-Bilds (ALT_BILD, /app), ohne Netz.
#      Selbsttest K4-P3; Baum-Prüfsumme = lokale Fixture (FIXTURE_BAUM).
#      Gegenprobe: dieselbe Fixture mit Zahl-Kennung.
#   2. Betriebskennungen mit dem Code des Digest-Bilds (BILD): Fixture
#      Exit 0, Gegenprobe Exit 1.
#   3. S0 = Sicherung der Fixture mit dem Werkzeug des Digest-Bilds.
#   4. Erster Start des Digest-Bilds auf der Fixture (leeres Zustands-
#      verzeichnis, Löschlauf und Datenschutzlauf wie in Produktion:
#      Vorgabe an/vorschau); Sperrdatei, Schreibhalt, Bücher erhoben.
#   5. deploy-abgleich gegen S0 (--start), dann Migrationsprobe je Raum
#      und Betrieb im laufenden Container (Lesen, unverändert schreiben).
#   6. Auf Löschlauf und Datenschutzlauf warten (höchstens 150 s).
#   7. Bewerten (W-1…W-9 + Zusatzproben), Nachweis MP_NACHWEIS mit
#      digest/altDigest. Exit 0 nur bei „bestanden“; „nicht bewertbar“
#      bricht das Gate ab wie „fehlgeschlagen“ (fail-closed).
#
#  Erwartet: BILD, ALT_BILD (je Name@sha256:…, schon gezogen), RUNNER_TEMP,
#  MP_NACHWEIS (Zieldatei), docker, curl, node (Checkout mit npm ci).
#  Ausgaben: nur Zählwerte und Regelkennungen; bei Fehler die letzten 40
#  Zeilen des Startprotokolls (synthetisch). Kein Code, kein Passwort.
# =====================================================================
set -Eeuo pipefail

: "${BILD:?BILD fehlt}"
: "${ALT_BILD:?ALT_BILD fehlt}"
: "${RUNNER_TEMP:?RUNNER_TEMP fehlt}"
: "${MP_NACHWEIS:?MP_NACHWEIS fehlt}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WURZEL="$(cd "$HIER/../../.." && pwd)"
HILFE="$HIER/migrationsprobe-staging.mjs"
NAME=staging-gate-mp
PORT=3233
WARTEN_START=60
WARTEN_LAEUFE=150

fehl() { printf '::error::%s\n' "$*"; exit 1; }
for b in "$BILD" "$ALT_BILD"; do
  [[ "$b" =~ @sha256:[0-9a-f]{64}$ ]] || fehl "Bild nicht per Digest angegeben: $b"
done
[[ "$BILD" != "$ALT_BILD" ]] || fehl "BILD und ALT_BILD sind gleich"

T="$(mktemp -d "$RUNNER_TEMP/rst5-XXXXXX")"
chmod 700 "$T"
mkdir -m 700 -p "$T/scratchpad/daten-mig-gate" "$T/scratchpad/daten-mig-gegen" "$T/zustand" "$T/sich" "$T/roh"
DATEN="$T/scratchpad/daten-mig-gate"
ROH="$T/roh"
NUTZER="$(id -u):$(id -g)"
ADMIN="$(openssl rand -hex 24)"
echo "::add-mask::$ADMIN"

aufraeumen() { docker rm -fv "$NAME" >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

HART=(--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true --user "$NUTZER")

# --- 1. Fixture vom 274bfa0-Bild schreiben (Plan auf stdin, ohne Netz) -------------------------
node "$HILFE" plan >"$T/plan.json"
node "$HILFE" plan --gegenprobe >"$T/plan-gegen.json"
PFEFFER="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).pfeffer)' "$T/plan.json")"
schreiben() { # plan ziel
  docker run --rm -i --network none "${HART[@]}" -e TZ=UTC \
    -v "$2:/ausgabe" \
    -v "$WURZEL/werkzeug/synthetischer-altbestand-schreiber.mjs:/ci/schreiber.mjs:ro" \
    --entrypoint node "$ALT_BILD" /ci/schreiber.mjs /app /ausgabe <"$1" | tail -n 1 | grep -q '^ERGEBNIS ' ||
    fehl "Fixture: Schreiber im 274bfa0-Bild ohne Ergebnis"
}
schreiben "$T/plan.json" "$DATEN"
schreiben "$T/plan-gegen.json" "$T/scratchpad/daten-mig-gegen"
node "$HILFE" ablage "$DATEN" >"$ROH/fixture-baum" || fehl "Fixture: Selbsttest K4-P3 nicht bestanden"
node "$HILFE" ablage "$T/scratchpad/daten-mig-gegen" --gegenprobe >/dev/null || fehl "Gegenprobe: Selbsttest K4-P3 nicht bestanden"
echo "Fixture geschrieben (274bfa0-Bild), Baum $(cut -c1-12 "$ROH/fixture-baum")…"

# --- 2. Betriebskennungen mit dem Code des Digest-Bilds -----------------------------------------
kennungen() { # ordner (unter $T/scratchpad) → Exit der Probe
  local name
  name="$(basename "$1")"
  set +e
  docker run --rm --network none "${HART[@]}" \
    -e CENTRIC_PFEFFER="$PFEFFER" -e CENTRIC_ABLAGE=dateien -e CENTRIC_APP=/app \
    -v "$1:/scratchpad/$name:ro" \
    -v "$WURZEL/deploy/betriebskennungen-pruefen.mjs:/ci/deploy/betriebskennungen-pruefen.mjs:ro" \
    -v "$WURZEL/deploy/migrationsprobe-regeln.mjs:/ci/deploy/migrationsprobe-regeln.mjs:ro" \
    --entrypoint node "$BILD" /ci/deploy/betriebskennungen-pruefen.mjs "/scratchpad/$name" >/dev/null 2>&1
  local e=$?
  set -e
  echo "$e"
}
kennungen "$DATEN" >"$ROH/kennungen.exit"
kennungen "$T/scratchpad/daten-mig-gegen" >"$ROH/gegenprobe.exit"
rm -rf "$T/scratchpad/daten-mig-gegen"

# --- 3. S0 mit dem Werkzeug des Digest-Bilds ----------------------------------------------------
docker run --rm --network none "${HART[@]}" -e CENTRIC_ABLAGE=dateien \
  -v "$DATEN:/data:ro" -v "$T/sich:/sich" \
  --entrypoint node "$BILD" /app/werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sich/s0 --ruhe 0 >"$T/s0.log" 2>&1 ||
  { tail -n 20 "$T/s0.log"; fehl "S0: Sicherung der Fixture fehlgeschlagen"; }
S0="$(sed -n 's/^.*Sicherung vollständig: //p' "$T/s0.log" | tail -n 1)"
[[ -n "$S0" && "$S0" == /sich/* ]] || fehl "S0: Sicherungsordner nicht gemeldet"
S0_HOST="$T/sich/${S0#/sich/}"
[[ -s "$S0_HOST/MANIFEST.json" ]] || fehl "S0: MANIFEST.json fehlt"

# --- 4. Erster Start des Digest-Bilds (gehärtet, Löschlauf/Datenschutzlauf Vorgabe) ------------
[[ -z "$(find "$T/zustand" -mindepth 1 -print -quit)" ]] || fehl "Zustandsverzeichnis vor dem ersten Start nicht leer"
START_MS="$(date +%s%3N)"
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" "${HART[@]}" --memory 512m \
  -e CENTRIC_ADMIN="$ADMIN" -e CENTRIC_PFEFFER="$PFEFFER" -e CENTRIC_ZUSTELL_TAKT=aus \
  -e CENTRIC_VERTRAUTE_PROXYS=127.0.0.1,::1,172.16.0.0/12 \
  -e CENTRIC_ZUSTAND=/zustand -e CENTRIC_DATEN=/scratchpad/daten-mig-gate -e CENTRIC_ABLAGE=dateien \
  -v "$DATEN:/scratchpad/daten-mig-gate" -v "$T/zustand:/zustand" \
  -v "$WURZEL/deploy/migrationsprobe-lokal.mjs:/ci/deploy/migrationsprobe-lokal.mjs:ro" \
  -v "$WURZEL/deploy/migrationsprobe-regeln.mjs:/ci/deploy/migrationsprobe-regeln.mjs:ro" \
  "$BILD" >/dev/null
for _ in $(seq 1 "$WARTEN_START"); do
  curl -sf "http://127.0.0.1:$PORT/gesund" >/dev/null && break
  sleep 1
done
curl -sf "http://127.0.0.1:$PORT/gesund" >/dev/null || { docker logs "$NAME" 2>&1 | tail -n 40; fehl "Start: /gesund antwortet nicht"; }
if [[ -e "$DATEN/.prozess" ]]; then echo ja; else echo nein; fi >"$ROH/prozess"
if [[ -d "$T/zustand/schreibhalt" ]]; then echo ja; else echo nein; fi >"$ROH/schreibhalt"
stat -c %s "$T/zustand/zugang-widerrufe.json" >"$ROH/buch-zugang" 2>/dev/null || echo 0 >"$ROH/buch-zugang"
stat -c %s "$T/zustand/konto-widerrufe.json" >"$ROH/buch-konto" 2>/dev/null || echo 0 >"$ROH/buch-konto"

# --- 5. Abgleich gegen S0, dann Migrationsprobe im laufenden Container -------------------------
set +e
docker run --rm --network none "${HART[@]}" \
  -v "$S0_HOST:/s0:ro" -v "$DATEN:/daten:ro" \
  -v "$WURZEL/deploy/deploy-abgleich.mjs:/ci/deploy-abgleich.mjs:ro" \
  --entrypoint node "$BILD" /ci/deploy-abgleich.mjs /s0 /daten --start "$START_MS" >"$ROH/abgleich.json" 2>"$T/abgleich.err"
echo $? >"$ROH/abgleich.exit"
timeout 300 docker exec -e CENTRIC_APP=/app -e CENTRIC_PROBE_PORT=3000 "$NAME" \
  node /ci/deploy/migrationsprobe-lokal.mjs >"$ROH/probe.log" 2>&1
echo $? >"$ROH/probe.exit"
set -e

# --- 6. Löschlauf und Datenschutzlauf (60 s nach dem Start) abwarten ---------------------------
for _ in $(seq 1 "$WARTEN_LAEUFE"); do
  docker logs "$NAME" >"$ROH/start.log" 2>&1
  grep -Eq '^Löschlauf: ([0-9]+ Testräume|abgeschaltet)|Löschlauf fehlgeschlagen' "$ROH/start.log" &&
    grep -Eq '^Datenschutzlauf|Datenschutzlauf fehlgeschlagen' "$ROH/start.log" && break
  sleep 1
done
docker stop -t 20 "$NAME" >/dev/null
docker logs "$NAME" >"$ROH/start.log" 2>&1
aufraeumen

# --- 7. Bewerten und Nachweis ------------------------------------------------------------------
mkdir -p "$(dirname "$MP_NACHWEIS")"
if ! MP_MODUS=gate DIGEST="${BILD##*@}" ALT_DIGEST="${ALT_BILD##*@}" node "$HILFE" bewerten "$ROH" "$MP_NACHWEIS"; then
  tail -n 40 "$ROH/start.log" | sed 's/^/[start] /'
  fehl "Migrationsprobe W-1…W-9 am Digest-Bild nicht bestanden (siehe Nachweis)"
fi
rm -rf "$T"
