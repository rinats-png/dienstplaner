#!/usr/bin/env bash
# =====================================================================
#  Staging-Gate GATE-EW3: Widerrufbuch S1–S3 am Digest-Bild — NUR CI
#  (staging-gate.yml nach Übernahme des Patches docs/acc45/workflow-
#  patches/gate-ew3/), nie auf dem VPS, nie gegen Staging oder Produktion.
#
#  S1  Migration: synthetischer Bestand, geschrieben von der Anwendungs-
#      schicht des ALTEN Bilds (274bfa0, ALT_BILD, kennt keine Bücher);
#      erster Start des Digest-Bilds (BILD) mit leerem Zustandsverzeichnis
#      ⇒ beide Bücher entstehen, Startprotokoll ohne WARNUNG, /gesund ok,
#      alle Codes und Konten melden sich an.
#  S2  Widerruf eines Zugangscodes über die echte API (/api/zugang-sperren,
#      Leitungssitzung) ⇒ sofort abgewiesen, im Buch; Kontosperre über die
#      Anwendungsschicht des Digest-Bilds (kein HTTP-Weg) ⇒ im Konto-Buch.
#  S3  Neustart ⇒ Code und Konto bleiben gesperrt; danach Rücksprung der
#      Ablage auf den Stand nach S1 (Zustandsverzeichnis bleibt) ⇒ der Start
#      zieht beide Sperren aus den Büchern nach, sie bleiben wirksam.
#
#  Erwartet: BILD, ALT_BILD (je Name@sha256:…, schon gezogen), RUNNER_TEMP,
#  WB_PROBEN (Ordner; je bestandener Probe entsteht dort die Datei S1/S2/S3
#  mit Inhalt „ok“), docker, curl.
#  Nur synthetische Daten; Pfeffer und Verwalterschlüssel zufällig und
#  maskiert; Codes, Passwort und Adressen gibt das Hilfsskript nie aus.
# =====================================================================
set -Eeuo pipefail

: "${BILD:?BILD fehlt}"
: "${ALT_BILD:?ALT_BILD fehlt}"
: "${RUNNER_TEMP:?RUNNER_TEMP fehlt}"
: "${WB_PROBEN:?WB_PROBEN fehlt}"
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HILFE="$HIER/widerrufbuch-staging.mjs"
NAME=staging-gate-wb
PORT=3232

fehl() { printf '::error::%s\n' "$*"; exit 1; }
for b in "$BILD" "$ALT_BILD"; do
  [[ "$b" =~ @sha256:[0-9a-f]{64}$ ]] || fehl "Bild nicht per Digest angegeben: $b"
done
mkdir -p "$WB_PROBEN"

T="$(mktemp -d "$RUNNER_TEMP/ew3-XXXXXX")"
chmod 700 "$T"
mkdir -m 700 "$T/daten" "$T/zustand" "$T/merk"

PFEFFER="$(openssl rand -hex 24)"
ADMIN="$(openssl rand -hex 24)"
echo "::add-mask::$PFEFFER"
echo "::add-mask::$ADMIN"
NUTZER="$(id -u):$(id -g)"

aufraeumen() { docker rm -fv "$NAME" >/dev/null 2>&1 || true; }
trap aufraeumen EXIT

# Einmal-Container ohne Netz (Anwendungsschicht des angegebenen Bilds, kein Server)
einmal() { # bild befehl …
  local bild="$1"
  shift
  docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --user "$NUTZER" \
    -e CENTRIC_PFEFFER="$PFEFFER" -e CENTRIC_ZUSTAND=/zustand -e CENTRIC_DATEN=/data -e CENTRIC_ABLAGE=dateien \
    -v "$T/daten:/data" -v "$T/zustand:/zustand" -v "$T/merk:/ci-merk" \
    -v "$HILFE:/ci/widerrufbuch-staging.mjs:ro" \
    --entrypoint node "$bild" /ci/widerrufbuch-staging.mjs "$@"
}

# Server des Digest-Bilds, gehärtet wie Container 1 des Staging-Gates, Ablage und Zustand dauerhaft (Neustart)
starten() { # nummer
  aufraeumen
  docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" \
    --user "$NUTZER" --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 512m \
    -e CENTRIC_ADMIN="$ADMIN" -e CENTRIC_PFEFFER="$PFEFFER" \
    -e CENTRIC_BASIS=http://127.0.0.1:3000 \
    -e CENTRIC_VERTRAUTE_PROXYS=127.0.0.1,::1,172.16.0.0/12 \
    -e CENTRIC_ZUSTAND=/zustand -e CENTRIC_DATEN=/data -e CENTRIC_ABLAGE=dateien \
    -v "$T/daten:/data" -v "$T/zustand:/zustand" -v "$T/merk:/ci-merk" \
    -v "$HILFE:/ci/widerrufbuch-staging.mjs:ro" \
    "$BILD" >/dev/null
  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:$PORT/gesund" >/dev/null && break
    sleep 1
  done
  curl -sf "http://127.0.0.1:$PORT/gesund" >/dev/null || { docker logs "$NAME" 2>&1 | tail -n 40; fehl "Start $1: /gesund antwortet nicht"; }
  docker logs "$NAME" >"$T/start-$1.log" 2>&1
  sed "s/^/[start-$1] /" "$T/start-$1.log"
  if grep -q "WARNUNG" "$T/start-$1.log"; then fehl "Start $1: Startprotokoll enthält WARNUNG"; fi
  grep -q "^Widerrufbuch: " "$T/start-$1.log" || fehl "Start $1: Widerrufbuch nicht gestartet"
  grep -q "^Konto-Widerrufbuch: " "$T/start-$1.log" || fehl "Start $1: Konto-Widerrufbuch nicht gestartet"
}
anhalten() { docker stop -t 20 "$NAME" >/dev/null; aufraeumen; }
pruefen() { docker exec "$NAME" node /ci/widerrufbuch-staging.mjs pruefen "$1"; }
bestanden() { printf 'ok\n' >"$WB_PROBEN/$1"; printf '✔ %s\n' "$*"; }
# RST-5: Betriebskennungen (K4-Zusatzpunkt) am EXAKTEN Digest: Code des Digest-Bilds liest eine Wegwerfkopie des
# synthetischen Altbestands, nur lesend, ohne Netz; jede Kennung (m.id) muss eine Zeichenkette sein. Läuft VOR dem ersten
# Start des Digest-Bilds und ist Teil von S1 (keine eigene Marke: der Nachweis kennt genau S1–S6).
kennungen_pruefen() {
  local kopie="$T/daten-kennungen"
  rm -rf "$kopie"
  cp -a "$T/daten" "$kopie"
  docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL     --security-opt no-new-privileges:true --user "$NUTZER"     -e CENTRIC_PFEFFER="$PFEFFER" -e CENTRIC_ABLAGE=dateien -e CENTRIC_APP=/app     -v "$kopie:/scratchpad/daten-mig-gate"     -v "$HIER/../../betriebskennungen-pruefen.mjs:/ci/deploy/betriebskennungen-pruefen.mjs:ro"     -v "$HIER/../../migrationsprobe-regeln.mjs:/ci/deploy/migrationsprobe-regeln.mjs:ro"     --entrypoint node "$BILD" /ci/deploy/betriebskennungen-pruefen.mjs /scratchpad/daten-mig-gate ||
    fehl "S1: Betriebskennungen am Digest-Bild nicht in Ordnung"
  rm -rf "$kopie"
}

# === S1 Migration und erster Start ===========================================
einmal "$ALT_BILD" altbestand
kennungen_pruefen
[[ -z "$(find "$T/zustand" -mindepth 1 -print -quit)" ]] || fehl "S1: Zustandsverzeichnis vor dem ersten Start nicht leer"
starten 1
for b in zugang-widerrufe.json konto-widerrufe.json; do [[ -s "$T/zustand/$b" ]] || fehl "S1: Buch $b fehlt nach dem ersten Start"; done
pruefen s1
anhalten
cp -a "$T/daten" "$T/daten-s1"
bestanden S1 "Migration 274bfa0 → Digest: Betriebskennungen Zeichenketten, beide Bücher entstanden, kein WARNUNG, Codes und Konten melden sich an"

# === S2 Widerruf über die API, Kontosperre ===================================
starten 2
pruefen s2
anhalten
einmal "$BILD" konto-sperren
bestanden S2 "Zugangscode über /api/zugang-sperren widerrufen (sofort abgewiesen, im Buch); Konto gesperrt (im Konto-Buch)"

# === S3 Neustart und Rücksprung der Ablage ===================================
starten 3
pruefen s3
anhalten
rm -rf "$T/daten"
cp -a "$T/daten-s1" "$T/daten"
starten 4
grep -Eq "^Widerrufbuch: [0-9]+ Einträge, [0-9]+ aus der Ablage eingesammelt, [1-9][0-9]* in der Ablage nachgezogen" "$T/start-4.log" ||
  fehl "S3: nach dem Rücksprung der Ablage hat der Start den Code nicht aus dem Buch nachgezogen"
grep -Eq "^Konto-Widerrufbuch: .*[^0-9][1-9][0-9]* in der Ablage nachgezogen" "$T/start-4.log" ||
  fehl "S3: nach dem Rücksprung der Ablage hat der Start das Konto nicht aus dem Buch nachgezogen"
pruefen s3
anhalten
bestanden S3 "Neustart: Sperren bleiben; Rücksprung der Ablage: Start zieht Code und Konto aus den Büchern nach"
