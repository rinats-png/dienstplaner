#!/usr/bin/env bash
# =====================================================================
#  WP-45b (Review-Befund B3): Die Rückweg-Werkzeuge liegen im Bild und
#  laufen dort genau so, wie docs/BETRIEB-SICHERUNG.md §4a es vorschreibt:
#  docker run --rm --network none --user 1000:1000 -v <daten>:/data <bild>
#  node /app/werkzeug/ablage-pruefen.mjs …  — der VPS braucht kein Node.
#
#  Geprüft wird an einem Wegwerf-Volume:
#   1. beide Werkzeuge sind im Bild und starten (journal-pruefen lädt
#      ablage-pruefen, ablage-pruefen lädt ablage-sicherung und server/lib);
#   2. eine unlesbare Scherbe wird gefunden (Rückgabe 1) und beiseitegelegt;
#   3. alles, was das Werkzeug schreibt, gehört uid 1000 und hat 0600 —
#      der Dienst kann es lesen;
#   4. solange ein Dienst-Container (anderer Rechnername) die Ablage hält,
#      verweigert das Werkzeug die Arbeit (Rückgabe 2); nach einem
#      sauberen Stopp arbeitet es sofort.
#
#  Aufruf (CI, pruefung.yml): bash pruefungen/werkzeuge-im-bild.sh "$BILD"
# =====================================================================
set -euo pipefail

BILD="${1:?Aufruf: werkzeuge-im-bild.sh <bild>}"
VOL="centric-wp45b-probe-$$"
DIENST="centric-wp45b-dienst-$$"

aufraeumen() {
  docker rm -fv "$DIENST" >/dev/null 2>&1 || true
  docker volume rm -f "$VOL" >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

fehl() { echo "FEHLER: $*" >&2; exit 1; }
ok() { echo "ok  $*"; }

# So wie in §4a beschrieben (dazu die Härtung des Dienstes).
lauf() {
  docker run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --user 1000:1000 \
    -v "$VOL:/data" "$BILD" "$@"
}
# Rückgabewert und Ausgabe festhalten, ohne dass set -e abbricht.
mitCode() { set +e; AUS="$("$@" 2>&1)"; CODE=$?; set -e; }

docker volume create "$VOL" >/dev/null

# --- 1. im Bild und lauffähig -----------------------------------------
lauf test -f /app/werkzeug/ablage-pruefen.mjs || fehl "ablage-pruefen.mjs fehlt im Bild"
lauf test -f /app/werkzeug/journal-pruefen.mjs || fehl "journal-pruefen.mjs fehlt im Bild"
ok "beide Werkzeuge liegen unter /app/werkzeug"

# Ein Raum über die echte Anwendungsschicht im Bild.
lauf node --input-type=module -e '
  const { getStore } = await import("/app/server/lib/ablage.mjs");
  const { bestandSchreiben } = await import("/app/server/lib/bestand.mjs");
  const s = getStore({ name: "centric", consistency: "strong" });
  const r = await bestandSchreiben(s, "ci-raum", { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [], dienstarten: [], personen: [], abweichungen: { "p1|2025-10-10": "F", "p1|2025-11-03": "S" },
    abwesenheiten: [], erfassung: {}, einstempeln: {} }] }, { durch: "CI" });
  if (!r.ok) process.exit(1);
' >/dev/null

mitCode lauf node /app/werkzeug/ablage-pruefen.mjs
[ "$CODE" = 0 ] || fehl "Trockenlauf auf heiler Ablage: Rückgabe $CODE: $AUS"
mitCode lauf node /app/werkzeug/journal-pruefen.mjs
[ "$CODE" = 0 ] || fehl "journal-pruefen auf heiler Ablage: Rückgabe $CODE: $AUS"
ok "Trockenläufe auf heiler Ablage: Rückgabe 0"

# --- 2. unlesbare Scherbe finden und beiseitelegen ----------------------
lauf node --input-type=module -e '
  const { dateiname } = await import("/app/server/lib/ablage.mjs");
  const { writeFile } = await import("node:fs/promises");
  await writeFile("/data/centric/" + dateiname("scherbe:ci-raum:m1:2025-10"), "{kaputt");
'
mitCode lauf node /app/werkzeug/ablage-pruefen.mjs
[ "$CODE" = 1 ] || fehl "Trockenlauf mit kaputter Scherbe: Rückgabe $CODE statt 1: $AUS"
grep -q "Scherbe .*scherbe:ci-raum:m1:2025-10" <<<"$AUS" || fehl "Scherbe nicht gemeldet: $AUS"
ok "Trockenlauf meldet die unlesbare Scherbe (Rückgabe 1)"

mitCode lauf node /app/werkzeug/ablage-pruefen.mjs --beiseitelegen ci-raum
[ "$CODE" = 0 ] || fehl "--beiseitelegen: Rückgabe $CODE: $AUS"
mitCode lauf node /app/werkzeug/ablage-pruefen.mjs
[ "$CODE" = 0 ] || fehl "Trockenlauf nach --beiseitelegen: Rückgabe $CODE: $AUS"
ok "--beiseitelegen im Bild: Raum wieder lesbar"

# --- 3. Dateirechte ------------------------------------------------------
FREMD="$(lauf find /data -type f \( ! -user 1000 -o ! -perm 600 \) -print)"
[ -z "$FREMD" ] || fehl "Dateien nicht uid 1000 / 0600: $FREMD"
ok "alle Dateien der Ablage: uid 1000, Modus 0600"

# --- 4. laufender Dienst (anderer Rechnername) hält die Ablage -----------
docker run -d --name "$DIENST" --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --user 1000:1000 \
  -e CENTRIC_ADMIN=ci-geheim -e CENTRIC_PFEFFER=ci-pfeffer-nur-zum-pruefen \
  -e CENTRIC_BASIS=http://127.0.0.1:3000 -v "$VOL:/data" "$BILD" >/dev/null
for _ in $(seq 1 30); do
  lauf test -f /data/.prozess && break
  sleep 1
done
lauf test -f /data/.prozess || fehl "Dienst hat die Ablage nicht belegt"
mitCode lauf node /app/werkzeug/ablage-pruefen.mjs
[ "$CODE" = 2 ] || fehl "Werkzeug arbeitete trotz laufendem Dienst: Rückgabe $CODE: $AUS"
grep -q "belegt" <<<"$AUS" || fehl "keine Meldung „belegt“: $AUS"
mitCode lauf node /app/werkzeug/journal-pruefen.mjs
[ "$CODE" = 2 ] || fehl "journal-pruefen arbeitete trotz laufendem Dienst: Rückgabe $CODE: $AUS"
ok "laufender Dienst: beide Werkzeuge verweigern (Rückgabe 2)"

docker stop -t 30 "$DIENST" >/dev/null
mitCode lauf node /app/werkzeug/ablage-pruefen.mjs
[ "$CODE" = 0 ] || fehl "nach sauberem Stopp: Rückgabe $CODE: $AUS"
ok "nach sauberem Stopp sofort wieder nutzbar"
