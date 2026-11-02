#!/usr/bin/env bash
# =====================================================================
#  ruecksprung.sh — zurück auf das Bild mit Status "vorherig"
#
#  Aufruf:  ./ruecksprung.sh [--trocken] [--ohne-label]
#
#  Ablauf:
#    1. Ziel = der eine Eintrag "vorherig" in FREIGEGEBENE-IMAGES.md.
#       Keiner da, gesperrt oder Prüfung fehlgeschlagen → verweigert, R0.
#    2. digest-pruefen.sh für das Ziel (Liste, Sperre, lokal, Label).
#    3. .env sichern (.env.vor-ruecksprung-<UTC>), IMAGE_DIGEST setzen.
#    4. docker compose up -d --pull never <dienst>   (nie ein Pull)
#    5. warten auf healthy, laufende Bild-ID mit dem Ziel vergleichen.
#    6. Protokoll: betrieb-protokoll.log
#
#  --trocken   zeigt nur, was geschähe; ändert weder .env noch Container
#              noch Protokoll.
#  --ohne-label  an digest-pruefen.sh weiterreichen (Bilder ohne Label).
#
#  Es gibt KEINEN Rückfall auf latest, auf einen Tag oder auf ein
#  gesperrtes Bild. Geht der Rücksprung schief, gilt R0 (abschalten.sh).
#
#  Rückgabe: 0 erfolgreich (oder Trockenlauf in Ordnung) · 1 Rücksprung
#  fehlgeschlagen · 2 Aufruf · 3 verweigert · 4 Konfiguration
# =====================================================================
set -euo pipefail

# shellcheck source=deploy/freigabe-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/freigabe-lib.sh"

WARTEZEIT="${CENTRIC_WARTEZEIT:-120}"
TAKT="${CENTRIC_TAKT:-2}"

trocken=0
pruef_args=()
for arg in "$@"; do
  case "$arg" in
    --trocken) trocken=1 ;;
    --ohne-label) pruef_args+=(--ohne-label) ;;
    -h | --hilfe) sed -n '2,26p' "$0"; exit 0 ;;
    *) fehler "unbekannter Aufruf: $arg"; exit 2 ;;
  esac
done

verweigern() {
  fehler "Rücksprung VERWEIGERT: $*"
  fehler "$R0_HINWEIS"
  ((trocken)) || protokoll "verweigert: $*"
  exit 3
}

# 1. Ziel bestimmen
if ! freigaben_pruefen; then
  verweigern "Freigabeliste $CENTRIC_FREIGABEN ist fehlerhaft"
fi
mapfile -t vorherige < <(digests_mit_status vorherig)
if ((${#vorherige[@]} == 0)); then
  verweigern "kein Eintrag mit Status vorherig in $CENTRIC_FREIGABEN — es gibt kein freigegebenes Rücksprungziel"
fi
ziel="${vorherige[0]}"
if grund="$(gesperrt_grund "$ziel")"; then
  verweigern "Ziel $ziel ist gesperrt: $grund"
fi

# 2. Ziel vollständig prüfen
if ! "$FREIGABE_SKRIPT_VERZ/digest-pruefen.sh" "$ziel" "${pruef_args[@]}"; then
  verweigern "digest-pruefen.sh lehnt $ziel ab (siehe oben)"
fi
ref="$CENTRIC_BILD_REPO@$ziel"
soll_id="$(bild_id "$ref")"

# 3. .env
envdatei="$CENTRIC_VERZ/.env"
if [[ ! -f "$envdatei" ]]; then
  fehler "$envdatei fehlt"; exit 4
fi
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?IMAGE_TAG=' "$envdatei"; then
  fehler "$envdatei enthält noch IMAGE_TAG — wird nicht mehr unterstützt."
  fehler "Erst die Migration auf IMAGE_DIGEST durchführen (BEREITSTELLUNG.md, Schritt 3.3)."
  exit 4
fi
bisher="$(env_wert "$envdatei" IMAGE_DIGEST)"
stempel="$(date -u +%Y%m%dT%H%M%SZ)"
sicherung="$envdatei.vor-ruecksprung-$stempel"

if ((trocken)); then
  hinweis "TROCKENLAUF — es wird nichts verändert."
  hinweis "  Ziel:        $ziel (Status vorherig, geprüft)"
  hinweis "  .env:        IMAGE_DIGEST=${bisher:-<leer>}  →  IMAGE_DIGEST=$ziel"
  hinweis "  Sicherung:   $sicherung"
  hinweis "  Befehl:      docker compose up -d --pull never $CENTRIC_DIENST"
  hinweis "  Danach:      warten auf healthy (höchstens ${WARTEZEIT}s), Bild-ID = $soll_id"
  exit 0
fi

if [[ "$bisher" == "$ziel" ]]; then
  warnung "IMAGE_DIGEST steht bereits auf $ziel — Container wird trotzdem abgeglichen."
fi

cp -p "$envdatei" "$sicherung"
neu="$(mktemp "$CENTRIC_VERZ/.env.neu.XXXXXX")"
chmod 600 "$neu"
if grep -Eq '^[[:space:]]*IMAGE_DIGEST=' "$envdatei"; then
  awk -v z="$ziel" '
    /^[[:space:]]*IMAGE_DIGEST=/ { print "IMAGE_DIGEST=" z; next }
    { print }
  ' "$envdatei" >"$neu"
else
  { cat "$envdatei"; printf 'IMAGE_DIGEST=%s\n' "$ziel"; } >"$neu"
fi
mv -f "$neu" "$envdatei"
protokoll "start von=${bisher:-leer} nach=$ziel sicherung=$(basename "$sicherung")"
hinweis ".env: IMAGE_DIGEST=$ziel (vorher ${bisher:-leer}, Kopie $(basename "$sicherung"))"

fehlschlag() {
  fehler "Rücksprung FEHLGESCHLAGEN: $*"
  fehler "$R0_HINWEIS"
  fehler "Vorige .env liegt in $sicherung."
  protokoll "fehlgeschlagen: $*"
  exit 1
}

# 4. starten (kein Pull)
if ! compose up -d --pull never "$CENTRIC_DIENST"; then
  fehlschlag "docker compose up -d --pull never $CENTRIC_DIENST"
fi

# 5. auf healthy warten
zustand=""
start=$SECONDS
while :; do
  zustand="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne-healthcheck{{end}}' "$CENTRIC_DIENST" 2>/dev/null || true)"
  case "$zustand" in
    healthy) break ;;
    unhealthy | ohne-healthcheck | "") fehlschlag "Container $CENTRIC_DIENST ist '${zustand:-nicht vorhanden}'" ;;
  esac
  if ((SECONDS - start >= WARTEZEIT)); then
    fehlschlag "nach ${WARTEZEIT}s nicht healthy (zuletzt '$zustand')"
  fi
  sleep "$TAKT"
done

lauf_id="$(docker inspect --format '{{.Image}}' "$CENTRIC_DIENST" 2>/dev/null || true)"
if [[ -z "$soll_id" || "$lauf_id" != "$soll_id" ]]; then
  fehlschlag "laufendes Bild $lauf_id ist nicht das Ziel $ref ($soll_id)"
fi

protokoll "erfolgreich nach=$ziel bild-id=$lauf_id"
hinweis "Rücksprung erfolgreich: $CENTRIC_DIENST läuft healthy auf $ziel"
hinweis "Jetzt FREIGEGEBENE-IMAGES.md anpassen: $ziel → aktiv; das verlassene Bild → gesperrt (mit Grund)."
