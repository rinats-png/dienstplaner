#!/usr/bin/env bash
# =====================================================================
#  digest-pruefen.sh — darf dieses Bild gestartet werden?
#
#  Aufruf:  ./digest-pruefen.sh sha256:<64 hex> [--ohne-label]
#
#  Prüft, in dieser Reihenfolge, und bricht beim ersten Fehler ab:
#    1. Format: sha256: + 64 Hex-Zeichen (kein Tag, kein latest)
#    2. Freigabeliste FREIGEGEBENE-IMAGES.md ist in sich stimmig
#    3. Digest ist nicht gesperrt (auch nicht per Präfix)
#    4. Digest steht in der Liste, Status aktiv oder vorherig
#    5. Bild liegt lokal vor (docker image inspect; es wird NIE gezogen)
#    6. Bild-ID ist nicht gesperrt
#    7. Label org.opencontainers.image.revision = Commit aus der Liste.
#       Fehlt das Label (Bilder vor WP-03), nur mit --ohne-label zulässig,
#       dann mit Warnung. Ein abweichendes Label ist nie zulässig; ein
#       Label, das auf einen gesperrten Commit zeigt, gilt als gesperrt.
#    Gesperrt ist, was in der Liste gesperrt steht, und zusätzlich die
#    fest eingebaute Mindest-Sperrliste (f03a8514…, 0861adee…).
#
#  Rückgabe: 0 in Ordnung · 2 Aufruf/Format · 3 gesperrt · 4 nicht
#  freigegeben/Liste fehlerhaft · 5 nicht lokal vorhanden · 6 Label
#  · 7 Docker nicht erreichbar
#
#  Ändert nichts: liest nur die Liste und fragt Docker.
# =====================================================================
set -euo pipefail

# shellcheck source=deploy/freigabe-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/freigabe-lib.sh"

nutzung() {
  printf 'Aufruf: %s sha256:<64 hex> [--ohne-label]\n' "$(basename "$0")" >&2
}

digest=""
ohne_label=0
for arg in "$@"; do
  case "$arg" in
    --ohne-label) ohne_label=1 ;;
    -h | --hilfe) nutzung; exit 0 ;;
    -*) fehler "unbekannter Schalter: $arg"; nutzung; exit 2 ;;
    *)
      if [[ -n "$digest" ]]; then fehler "nur ein Digest erlaubt"; nutzung; exit 2; fi
      digest="$arg" ;;
  esac
done

if [[ -z "$digest" ]]; then
  fehler "kein Digest angegeben"; nutzung; exit 2
fi

# 1. Format
if ! digest_format_ok "$digest"; then
  fehler "'$digest' ist kein Digest (erwartet sha256: + 64 Kleinbuchstaben-Hex). Tags wie latest oder <commit> sind nicht zulässig."
  exit 2
fi

# 2. Liste selbst
if ! freigaben_pruefen; then
  fehler "Freigabeliste $CENTRIC_FREIGABEN ist fehlerhaft — nichts starten."
  exit 4
fi

# 3. gesperrt?
if grund="$(gesperrt_grund "$digest")"; then
  fehler "Digest $digest ist GESPERRT: $grund"
  fehler "Dieses Bild darf nicht gestartet werden. $R0_HINWEIS"
  exit 3
fi

# 4. freigegeben?
if ! eintrag="$(eintrag_zu_digest "$digest")"; then
  fehler "Digest $digest steht nicht in $CENTRIC_FREIGABEN — unbekannte Bilder werden nicht gestartet."
  exit 4
fi
IFS=$'\t' read -r _ commit datum bericht status _ <<<"$eintrag"
if [[ "$status" != "aktiv" && "$status" != "vorherig" ]]; then
  fehler "Digest $digest hat Status '$status' — zulässig sind nur aktiv und vorherig."
  exit 4
fi

# 5. Docker erreichbar? lokal vorhanden?
if ! docker_erreichbar; then
  fehler "Docker antwortet nicht (docker info) — nichts geprüft, nichts starten."
  exit 7
fi
ref="$CENTRIC_BILD_REPO@$digest"
id="$(bild_id "$ref")"
if [[ -z "$id" ]]; then
  fehler "Bild $ref liegt lokal nicht vor. Es wird nichts gezogen."
  fehler "Bewusst holen: docker pull $ref — danach diese Prüfung wiederholen."
  exit 5
fi

# 6. Bild-ID gesperrt?
if grund="$(gesperrt_grund "$id")"; then
  fehler "Bild-ID $id von $ref ist GESPERRT: $grund"
  fehler "$R0_HINWEIS"
  exit 3
fi

# 7. Revision-Label
label="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref" 2>/dev/null || true)"
if [[ "$label" == "<no value>" ]]; then label=""; fi
if [[ -n "$label" ]] && grund="$(commit_gesperrt_grund "$label")"; then
  fehler "Label org.opencontainers.image.revision=$label gehört zu einem GESPERRTEN Stand: $grund"
  fehler "$R0_HINWEIS"
  exit 3
fi
if [[ -z "$label" ]]; then
  if ((ohne_label)); then
    warnung "Bild $ref hat kein Label org.opencontainers.image.revision; zugelassen nur wegen --ohne-label."
    warnung "Herkunft anders belegen (Registry-Tag $commit, Abnahmebericht $bericht)."
  else
    fehler "Bild $ref hat kein Label org.opencontainers.image.revision — Herkunft nicht prüfbar."
    fehler "Nur nach eigener Prüfung der Herkunft: erneut mit --ohne-label."
    exit 6
  fi
elif [[ "$label" != "$commit" ]]; then
  fehler "Label org.opencontainers.image.revision=$label passt nicht zum Commit der Liste ($commit)."
  exit 6
fi

hinweis "in Ordnung: $digest"
hinweis "  Status $status · Commit $commit · Datum $datum · Bericht $bericht"
hinweis "  Bild-ID $id"
