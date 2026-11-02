#!/usr/bin/env bash
# =====================================================================
#  deploy.sh — ein freigegebenes Bild per Digest ausliefern (WP-31)
#
#  Aufruf (auf dem VPS, als der Benutzer, dem /opt/apps/centric-dienstplanung
#  gehört — admin, uid 1000 —, ohne sudo):
#
#    ./deploy.sh sha256:<64 hex> [--trocken] [--bei-fehler=r0|ruecksprung]
#                                [--ohne-label]
#    ./deploy.sh --ssh      Forced Command: liest SSH_ORIGINAL_COMMAND,
#                           erlaubt ist genau „deploy sha256:<64 hex>
#                           [--trocken] [--bei-fehler=r0|ruecksprung]“
#
#  Ablauf — bricht beim ersten Fehler ab:
#    1. Liste, Sperre, Status (aktiv/vorherig) — ohne Docker, ohne Pull
#    2. docker pull NUR dieses Digests (fehlt es lokal), dann
#       digest-pruefen.sh (Liste, Sperre, Bild-ID, Revision-Label)
#    3. Vorprüfung: CENTRIC_VERTRAUTE_PROXYS muss in der .env gesetzt sein
#       (Auflage B1, immer — schon in Schritt 1); zusätzlich wird vermerkt,
#       ob das Bild die Liste kennt. Sonst Abbruch vor jedem Wechsel.
#    4. alten Container anhalten (compose stop), Ablage sichern
#       (werkzeug/ablage-sicherung.mjs im neuen Bild, Daten read-only, kein
#       Netz) und die Sicherung prüfen. Scheitert das: alten Container
#       wieder starten, nichts gewechselt, Exit 1
#    5. .env kopieren (.env.vor-deploy-<UTC>), NUR IMAGE_DIGEST ändern
#    6. docker compose up -d --pull never <dienst>
#    7. warten auf healthy (CENTRIC_WARTEZEIT, mindestens 90 s — die
#       Prozesssperre übernimmt nach hartem Abbruch erst nach bis zu ~50 s),
#       laufende Bild-ID = Ziel
#    8. anmeldefreier Smoke im Container (deploy-smoke.mjs)
#    9. Log ohne „WARNUNG: Anfrage mit X-Forwarded-For“
#   10. Daten-Manifestabgleich gegen die Sicherung aus 4, ohne Spur und
#       Takt (deploy-abgleich.mjs)
#   11. Protokoll betrieb-protokoll.log
#
#  Fehler ab Schritt 5: Standard R0 (abschalten.sh). Rücksprung
#  (ruecksprung.sh) nur mit --bei-fehler=ruecksprung, und nur wenn das Ziel
#  „vorherig“ ist, nicht gesperrt und nicht das eben gescheiterte Bild;
#  scheitert auch er, R0.
#
#  --trocken   prüft 1–3 (ohne Pull; fehlt das Bild lokal, entfallen 2b/3)
#              und zeigt den Plan. Ändert nichts: kein Pull, kein Stop, keine
#              .env, kein Protokoll. Einzige Docker-Aufrufe: info, image inspect
#              und die lesende Probe „kennt das Bild die Proxy-Liste?“ (run --network none grep).
#
#  Umgebung (Vorgaben für den VPS):
#    CENTRIC_VERZ, CENTRIC_FREIGABEN, CENTRIC_BILD_REPO, CENTRIC_DIENST,
#    CENTRIC_PROTOKOLL     wie freigabe-lib.sh
#    CENTRIC_DATEN_PFAD    ($CENTRIC_VERZ/data)
#    CENTRIC_DEPLOY_SICHERUNGEN  ($CENTRIC_VERZ/deploy-sicherungen)
#    CENTRIC_WARTEZEIT     (150, mindestens 90)   CENTRIC_TAKT (2)
#
#  Rückgabe: 0 ausgeliefert (oder Trockenlauf in Ordnung) · 1 fehlgeschlagen,
#  R0 bzw. Rücksprung erfolgt · 2 Aufruf · 3 gesperrt · 4 nicht freigegeben,
#  Konfiguration, Vorprüfung · 5 Bild nicht zu beschaffen · 7 Docker
#  · 8 fehlgeschlagen UND R0 nicht sicher erreicht
# =====================================================================
set -euo pipefail

# shellcheck source=deploy/freigabe-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/freigabe-lib.sh"

WARTEZEIT="${CENTRIC_WARTEZEIT:-150}"
TAKT="${CENTRIC_TAKT:-2}"
DATEN_PFAD="${CENTRIC_DATEN_PFAD:-$CENTRIC_VERZ/data}"
SICHERUNGEN="${CENTRIC_DEPLOY_SICHERUNGEN:-$CENTRIC_VERZ/deploy-sicherungen}"
SMOKE="$FREIGABE_SKRIPT_VERZ/deploy-smoke.mjs"
ABGLEICH="$FREIGABE_SKRIPT_VERZ/deploy-abgleich.mjs"
XFF_WARNUNG="WARNUNG: Anfrage mit X-Forwarded-For"

nutzung() {
  printf 'Aufruf: %s sha256:<64 hex> [--trocken] [--bei-fehler=r0|ruecksprung] [--ohne-label]\n' "$(basename "$0")" >&2
  printf '        %s --ssh   (Forced Command; SSH_ORIGINAL_COMMAND="deploy sha256:<64 hex> [...]")\n' "$(basename "$0")" >&2
}

# --- Aufruf --------------------------------------------------------------
args=("$@")
if [[ "${1:-}" == "--ssh" ]]; then
  (($# == 1)) || { fehler "--ssh nimmt keine weiteren Argumente"; exit 2; }
  befehl="${SSH_ORIGINAL_COMMAND:-}"
  # Nur genau diese Form; keine Shell-Zeichen, keine weiteren Wörter.
  if [[ ! "$befehl" =~ ^deploy\ sha256:[0-9a-f]{64}(\ --trocken)?(\ --bei-fehler=(r0|ruecksprung))?(\ --trocken)?$ ]]; then
    fehler "Forced Command: nicht erlaubter Befehl: '${befehl:0:200}'"
    exit 2
  fi
  read -r -a args <<<"${befehl#deploy }"
fi

digest="" trocken=0 bei_fehler="r0"
pruef_args=()
for arg in "${args[@]}"; do
  case "$arg" in
    --trocken) trocken=1 ;;
    --bei-fehler=r0) bei_fehler="r0" ;;
    --bei-fehler=ruecksprung) bei_fehler="ruecksprung" ;;
    --ohne-label) pruef_args+=(--ohne-label) ;;
    -h | --hilfe) sed -n '2,55p' "$0"; exit 0 ;;
    -*) fehler "unbekannter Schalter: $arg"; nutzung; exit 2 ;;
    *)
      [[ -z "$digest" ]] || { fehler "nur ein Digest erlaubt"; nutzung; exit 2; }
      digest="$arg" ;;
  esac
done
[[ -n "$digest" ]] || { fehler "kein Digest angegeben"; nutzung; exit 2; }
if ! digest_format_ok "$digest"; then
  fehler "'$digest' ist kein Digest (sha256: + 64 Hex). Tags und latest sind nicht zulässig."
  exit 2
fi
if [[ ! "$WARTEZEIT" =~ ^[0-9]+$ ]] || ((WARTEZEIT < 90)); then
  fehler "CENTRIC_WARTEZEIT=$WARTEZEIT — mindestens 90 s (Übernahme der Prozesssperre nach hartem Abbruch bis ~50 s)."
  exit 2
fi
if [[ -n "${IMAGE_DIGEST+x}" ]]; then
  fehler "IMAGE_DIGEST ist in der Shell gesetzt (${IMAGE_DIGEST:-leer}) und ginge der .env vor. Erst 'unset IMAGE_DIGEST'."
  exit 4
fi

ref="$CENTRIC_BILD_REPO@$digest"
envdatei="$CENTRIC_VERZ/.env"

abbruch() { # vor jedem Wechsel: nichts angefasst
  local code="$1"; shift
  fehler "Auslieferung ABGEBROCHEN (nichts verändert): $*"
  ((trocken)) || protokoll "abgebrochen digest=$digest: $*"
  exit "$code"
}

# --- 1. Liste, Sperre, Status -------------------------------------------
freigaben_pruefen || abbruch 4 "Freigabeliste $CENTRIC_FREIGABEN ist fehlerhaft"
if grund="$(gesperrt_grund "$digest")"; then abbruch 3 "Digest ist GESPERRT: $grund"; fi
eintrag="$(eintrag_zu_digest "$digest")" || abbruch 4 "Digest steht nicht in $CENTRIC_FREIGABEN"
IFS=$'\t' read -r _ commit _ _ status _ <<<"$eintrag"
[[ "$status" == "aktiv" || "$status" == "vorherig" ]] ||
  abbruch 4 "Digest hat Status '$status' — ausgeliefert werden nur aktiv oder vorherig"
[[ -f "$envdatei" ]] || abbruch 4 "$envdatei fehlt"
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?IMAGE_TAG=' "$envdatei"; then
  abbruch 4 "$envdatei enthält noch IMAGE_TAG (Migration: BEREITSTELLUNG.md 3.3)"
fi
[[ -f "$SMOKE" && -f "$ABGLEICH" ]] || abbruch 4 "deploy-smoke.mjs oder deploy-abgleich.mjs fehlt neben deploy.sh"
[[ -d "$DATEN_PFAD" ]] || abbruch 4 "Datenverzeichnis $DATEN_PFAD fehlt"
pfeffer="$(env_wert "$envdatei" CENTRIC_PFEFFER)"
# B1 (Review WP-32b): ohne Vertrauensliste nie wechseln — auch wenn das Bild
# sie (noch) nicht kennt. Ein Bild mit WP-32b zählte hinter Caddy sonst alle
# Nutzer unter einer Herkunft; ein älteres Bild ignoriert die Variable.
[[ -n "$(env_wert "$envdatei" CENTRIC_VERTRAUTE_PROXYS)" ]] ||
  abbruch 4 "CENTRIC_VERTRAUTE_PROXYS ist in $envdatei leer. Nur Caddys feste Adresse im Netz proxy eintragen (docs/CADDY-UND-XFF.md, Abschnitt 7) — sonst teilten sich alle Nutzer eine Herkunft und einen Bremszähler."
[[ -n "$pfeffer" ]] || abbruch 4 "CENTRIC_PFEFFER fehlt in $envdatei — Sicherung nicht gegenprüfbar"

# --- 2. Docker, Pull nur dieses Digests, digest-pruefen ------------------
docker_erreichbar || abbruch 7 "Docker antwortet nicht (docker info)"
bild_da=1
if [[ -z "$(bild_id "$ref")" ]]; then
  if ((trocken)); then
    bild_da=0
    hinweis "Bild liegt lokal nicht vor — würde geholt: docker pull $ref"
  else
    hinweis "Hole genau dieses Bild: docker pull $ref"
    docker pull "$ref" >/dev/null || abbruch 5 "docker pull $ref scheiterte"
    [[ -n "$(bild_id "$ref")" ]] || abbruch 5 "nach dem Pull liegt $ref nicht vor"
  fi
fi
if ((bild_da)); then
  "$FREIGABE_SKRIPT_VERZ/digest-pruefen.sh" "$digest" "${pruef_args[@]}" ||
    abbruch 3 "digest-pruefen.sh lehnt $digest ab (siehe oben)"
  soll_id="$(bild_id "$ref")"
fi

# --- 3. Vorprüfung: Vertrauensliste für X-Forwarded-For -----------------
kennt_xff="unbekannt"
if ((bild_da)); then
  if docker run --rm --network none --read-only --cap-drop ALL --entrypoint grep "$ref" \
       -q CENTRIC_VERTRAUTE_PROXYS /app/server.mjs >/dev/null 2>&1; then
    kennt_xff="ja"
    [[ -n "$(env_wert "$envdatei" CENTRIC_VERTRAUTE_PROXYS)" ]] ||
      abbruch 4 "Das Bild wertet X-Forwarded-For nur mit CENTRIC_VERTRAUTE_PROXYS aus, die .env setzt sie nicht. Ohne Liste teilten sich alle Nutzer hinter Caddy eine Herkunft (docs/CADDY-UND-XFF.md, Abschnitt 7)."
  else
    kennt_xff="nein"
  fi
fi

bisher="$(env_wert "$envdatei" IMAGE_DIGEST)"
stempel="$(date -u +%Y%m%dT%H%M%SZ)"
env_kopie="$envdatei.vor-deploy-$stempel"

if ((trocken)); then
  hinweis "TROCKENLAUF — es wird nichts verändert."
  hinweis "  Ziel:         $digest (Status $status, Commit $commit)"
  hinweis "  Bild lokal:   $([[ $bild_da == 1 ]] && echo "ja, geprüft" || echo "nein — würde gezogen und dann geprüft")"
  hinweis "  XFF-Liste:    Bild kennt sie: $kennt_xff"
  hinweis "  Ablauf:       compose stop $CENTRIC_DIENST → Sicherung nach $SICHERUNGEN → prüfen"
  hinweis "  .env:         IMAGE_DIGEST=${bisher:-<leer>} → $digest (Kopie $(basename "$env_kopie"))"
  hinweis "  Start:        docker compose up -d --pull never $CENTRIC_DIENST"
  hinweis "  Danach:       healthy (höchstens ${WARTEZEIT}s), Smoke, Log, Manifestabgleich"
  hinweis "  Bei Fehler:   $([[ $bei_fehler == ruecksprung ]] && echo "Rücksprung auf vorherig, sonst R0" || echo "R0 (abschalten.sh)")"
  exit 0
fi

protokoll "start digest=$digest von=${bisher:-leer} bei-fehler=$bei_fehler"

# --- 4. anhalten, sichern, prüfen ---------------------------------------
alt_wieder_starten() {
  fehler "Sicherung gescheitert: $* — der alte Stand wird wieder gestartet, nichts gewechselt."
  protokoll "abgebrochen vor wechsel digest=$digest: $*"
  if compose up -d --pull never "$CENTRIC_DIENST"; then
    exit 1
  fi
  fehler "Alter Stand startet nicht — R0."
  "$FREIGABE_SKRIPT_VERZ/abschalten.sh" || exit 8
  exit 1
}

compose stop "$CENTRIC_DIENST" || alt_wieder_starten "compose stop scheiterte"
mkdir -p "$SICHERUNGEN"
chmod 700 "$SICHERUNGEN" 2>/dev/null || true
ausgabe="$(CENTRIC_PFEFFER="$pfeffer" docker run --rm --network none --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
  -e CENTRIC_PFEFFER -v "$DATEN_PFAD:/data:ro" -v "$SICHERUNGEN:/sicherungen" \
  --entrypoint node "$ref" werkzeug/ablage-sicherung.mjs sichern --quelle /data --ziel /sicherungen)" ||
  alt_wieder_starten "ablage-sicherung sichern"
printf '%s\n' "$ausgabe"
name="$(printf '%s\n' "$ausgabe" | sed -n 's|^Sicherung vollständig: /sicherungen/\(centric-sicherung-[0-9TZ]*\)$|\1|p')"
[[ -n "$name" && -f "$SICHERUNGEN/$name/FERTIG" ]] || alt_wieder_starten "Ausgabe nicht erkannt oder FERTIG fehlt"
CENTRIC_PFEFFER="$pfeffer" docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" -e CENTRIC_PFEFFER \
  -v "$SICHERUNGEN:/sicherungen:ro" --entrypoint node "$ref" \
  werkzeug/ablage-sicherung.mjs pruefen --sicherung "/sicherungen/$name" ||
  alt_wieder_starten "ablage-sicherung pruefen"
protokoll "gesichert digest=$digest sicherung=$name"

# --- 5. .env: nur IMAGE_DIGEST ------------------------------------------
cp -p "$envdatei" "$env_kopie"
neu="$(mktemp "$CENTRIC_VERZ/.env.neu.XXXXXX")"
trap 'rm -f "$neu"' EXIT
chmod 600 "$neu"
awk -v z="$digest" '
  /^[[:space:]]*(export[[:space:]]+)?IMAGE_DIGEST=/ {
    if (!gesetzt) { print "IMAGE_DIGEST=" z; gesetzt = 1 }
    next
  }
  { print }
  END { if (!gesetzt) print "IMAGE_DIGEST=" z }
' "$envdatei" >"$neu"
chmod --reference="$envdatei" "$neu" 2>/dev/null || chmod 600 "$neu"
mv -f "$neu" "$envdatei"
protokoll "env digest=$digest kopie=$(basename "$env_kopie")"

fehlschlag() {
  fehler "Auslieferung FEHLGESCHLAGEN: $*"
  fehler "Sicherung vor dem Wechsel: $SICHERUNGEN/$name · vorige .env: $env_kopie"
  protokoll "fehlgeschlagen digest=$digest: $*"
  if [[ "$bei_fehler" == "ruecksprung" ]]; then
    local ziel
    ziel="$(digests_mit_status vorherig | head -n1)"
    if [[ -n "$ziel" && "$ziel" != "$digest" ]] && ! gesperrt_grund "$ziel" >/dev/null; then
      hinweis "Rücksprung auf vorherig $ziel (--bei-fehler=ruecksprung)"
      if "$FREIGABE_SKRIPT_VERZ/ruecksprung.sh" "${pruef_args[@]}"; then
        protokoll "fehlgeschlagen, ruecksprung erfolgreich nach=$ziel"
        exit 1
      fi
      fehler "Rücksprung gescheitert — R0."
    else
      fehler "Kein zulässiges Rücksprungziel (vorherig fehlt, gesperrt oder = $digest) — R0."
    fi
  fi
  if "$FREIGABE_SKRIPT_VERZ/abschalten.sh"; then
    protokoll "fehlgeschlagen, R0 erreicht"
    exit 1
  fi
  protokoll "fehlgeschlagen, R0 NICHT sicher erreicht"
  exit 8
}

# --- 6. starten ---------------------------------------------------------
start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
IMAGE_DIGEST="$digest" compose up -d --pull never "$CENTRIC_DIENST" ||
  fehlschlag "docker compose up -d --pull never $CENTRIC_DIENST"

# --- 7. healthy ---------------------------------------------------------
start=$SECONDS
while :; do
  zustand="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne-healthcheck{{end}}' "$CENTRIC_DIENST" 2>/dev/null || true)"
  case "$zustand" in
    healthy) break ;;
    unhealthy | ohne-healthcheck | "") fehlschlag "Container $CENTRIC_DIENST ist '${zustand:-nicht vorhanden}'" ;;
  esac
  ((SECONDS - start < WARTEZEIT)) || fehlschlag "nach ${WARTEZEIT}s nicht healthy (zuletzt '$zustand')"
  sleep "$TAKT"
done
lauf_id="$(docker inspect --format '{{.Image}}' "$CENTRIC_DIENST" 2>/dev/null || true)"
[[ -n "$soll_id" && "$lauf_id" == "$soll_id" ]] ||
  fehlschlag "laufendes Bild $lauf_id ist nicht $ref ($soll_id)"

# --- 8. Smoke -----------------------------------------------------------
docker exec -i "$CENTRIC_DIENST" node --input-type=module - <"$SMOKE" ||
  fehlschlag "Smoke im Container fehlgeschlagen (siehe oben)"

# --- 9. Log -------------------------------------------------------------
if docker logs --since "$start_utc" "$CENTRIC_DIENST" 2>&1 | grep -q "$XFF_WARNUNG"; then
  fehlschlag "Log meldet X-Forwarded-For ohne Vertrauensliste — alle Nutzer teilten sich eine Herkunft"
fi

# --- 10. Manifestabgleich ----------------------------------------------
docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
  -v "$DATEN_PFAD:/data:ro" -v "$SICHERUNGEN/$name:/sicherung:ro" \
  -v "$ABGLEICH:/deploy-abgleich.mjs:ro" --entrypoint node "$ref" \
  /deploy-abgleich.mjs /sicherung /data ||
  fehlschlag "Daten weichen von der Sicherung vor dem Wechsel ab"

# --- 11. Protokoll ------------------------------------------------------
protokoll "erfolgreich digest=$digest bild-id=$lauf_id sicherung=$name"
hinweis "Ausgeliefert: $CENTRIC_DIENST läuft healthy auf $digest (Commit $commit)."
hinweis "FREIGEGEBENE-IMAGES.md: $digest → aktiv, bisher ${bisher:-<leer>} → vorherig (falls nicht schon so)."
