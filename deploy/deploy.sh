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
#   3b. Platz: im Sicherungsverzeichnis mindestens 2 × Daten frei
#    4. alten Container anhalten (compose stop), Ablage sichern
#       (werkzeug/ablage-sicherung.mjs im neuen Bild, Daten read-only, kein
#       Netz) und die Sicherung prüfen; ältere Sicherungen über
#       CENTRIC_DEPLOY_BEHALTEN hinaus entfernen (die neue bleibt immer)
#    5. .env kopieren (.env.vor-deploy-<UTC>), NUR IMAGE_DIGEST ändern
#       Scheitert 4 oder 5 (auch unerwartet, ERR-Trap): den bisherigen Stand
#       NUR wieder starten, wenn er digest-pruefen.sh besteht — sonst R0.
#       Exit 1, nichts gewechselt.
#    6. docker compose up -d --pull never <dienst>
#    7. warten auf healthy (CENTRIC_WARTEZEIT, mindestens 90 s — die
#       Prozesssperre übernimmt nach hartem Abbruch erst nach bis zu ~50 s),
#       laufende Bild-ID = Ziel
#    8. anmeldefreier Smoke im Container (deploy-smoke.mjs)
#    9. Log ohne „WARNUNG: Anfrage mit X-Forwarded-For“
#   10. Daten-Manifestabgleich gegen die Sicherung aus 4, ohne Spur und
#       Takt (deploy-abgleich.mjs --start): nach dem Start geänderte Dateien
#       sind eine Warnung, alles andere Abweichende ein Fehler
#   11. Protokoll betrieb-protokoll.log
#
#  Fehler ab Schritt 5: Standard R0 (abschalten.sh). Rücksprung
#  (ruecksprung.sh) nur mit --bei-fehler=ruecksprung, und nur wenn das Ziel
#  „vorherig“ ist, nicht gesperrt und nicht das eben gescheiterte Bild, und
#  das neue Bild noch nichts in die Ablage geschrieben hat; scheitert auch
#  er, R0. Unerwartete Fehler fängt ein ERR-Trap je nach Phase ab.
#
#  Nur eine Auslieferung zugleich: flock auf $CENTRIC_VERZ/.deploy.lock.
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
#    CENTRIC_DEPLOY_BEHALTEN  (5) vollständige Sicherungen, die bleiben
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
    -h | --hilfe) sed -n '2,66p' "$0"; exit 0 ;;
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

# --- Nur eine Auslieferung zugleich (N1) --------------------------------
# flock auf eine Sperrdatei neben compose.yml. Der Trockenlauf ändert nichts
# und braucht sie nicht. Ohne flock wird nicht ausgeliefert — außer in den
# Prüfungen unter Windows (CENTRIC_OHNE_FLOCK=1).
if ((!trocken)); then
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$CENTRIC_VERZ/.deploy.lock"
    flock -n 9 || { fehler "Eine andere Auslieferung läuft bereits ($CENTRIC_VERZ/.deploy.lock) — abgebrochen, nichts verändert."; exit 4; }
  elif [[ "${CENTRIC_OHNE_FLOCK:-}" != "1" ]]; then
    fehler "flock fehlt — ohne Sperre gegen eine zweite gleichzeitige Auslieferung wird nicht ausgeliefert."
    exit 4
  fi
fi

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

# --- 3. Vorprüfung: kennt das Bild die Vertrauensliste? ------------------
# Die Liste selbst ist nach Schritt 1 Pflicht (B1); hier nur der Vermerk.
kennt_xff="unbekannt"
if ((bild_da)); then
  if docker run --rm --network none --read-only --cap-drop ALL --entrypoint grep "$ref" \
       -q CENTRIC_VERTRAUTE_PROXYS /app/server.mjs >/dev/null 2>&1; then
    kennt_xff="ja"
  else
    kennt_xff="nein"
  fi
fi

bisher="$(env_wert "$envdatei" IMAGE_DIGEST)"
stempel="$(date -u +%Y%m%dT%H%M%SZ)"
env_kopie="$envdatei.vor-deploy-$stempel"
BEHALTEN="${CENTRIC_DEPLOY_BEHALTEN:-5}"
if [[ ! "$BEHALTEN" =~ ^[0-9]+$ ]] || ((BEHALTEN < 1)); then
  abbruch 2 "CENTRIC_DEPLOY_BEHALTEN=$BEHALTEN — mindestens 1"
fi

# Darf der bisherige Stand wieder gestartet werden (H1)? Nur, wenn er
# freigegeben, nicht gesperrt und aktiv/vorherig ist — dieselbe Prüfung wie
# für jedes Ziel. Sonst gilt im Fehlerfall vor dem Wechsel R0.
bisher_startbar() {
  [[ -n "$bisher" ]] && digest_format_ok "$bisher" &&
    "$FREIGABE_SKRIPT_VERZ/digest-pruefen.sh" "$bisher" "${pruef_args[@]}" >/dev/null 2>&1
}

# --- 3b. Platz für die Sicherung (N4) ----------------------------------
# Vor dem Anhalten: Die Sicherung braucht etwa so viel Platz wie die Daten;
# verlangt wird das Doppelte, damit danach noch etwas übrig ist.
daten_bytes="$(du -sb "$DATEN_PFAD" 2>/dev/null | cut -f1)" || daten_bytes=""
mkdir -p "$SICHERUNGEN" 2>/dev/null || abbruch 4 "Sicherungsverzeichnis $SICHERUNGEN lässt sich nicht anlegen"
frei_bytes="$(df -P -B1 "$SICHERUNGEN" 2>/dev/null | awk 'NR == 2 { print $4 }')" || frei_bytes=""
if [[ ! "$daten_bytes" =~ ^[0-9]+$ || ! "$frei_bytes" =~ ^[0-9]+$ ]]; then
  abbruch 4 "Platzbedarf nicht ermittelbar (du/df)"
fi
if ((frei_bytes < 2 * daten_bytes)); then
  abbruch 4 "zu wenig Platz in $SICHERUNGEN: frei $frei_bytes Bytes, gebraucht mindestens $((2 * daten_bytes)) (2 × Daten)"
fi

if ((trocken)); then
  hinweis "TROCKENLAUF — es wird nichts verändert."
  hinweis "  Ziel:         $digest (Status $status, Commit $commit)"
  hinweis "  Bild lokal:   $([[ $bild_da == 1 ]] && echo "ja, geprüft" || echo "nein — würde gezogen und dann geprüft")"
  hinweis "  XFF-Liste:    gesetzt; Bild kennt sie: $kennt_xff"
  hinweis "  Bisher:       ${bisher:-<leer>} — bei Sicherungsfehler $(bisher_startbar && echo "wieder starten" || echo "R0 (nicht startbar)")"
  hinweis "  Platz:        Daten $daten_bytes Bytes, frei $frei_bytes Bytes"
  hinweis "  Ablauf:       compose stop $CENTRIC_DIENST → Sicherung nach $SICHERUNGEN → prüfen"
  hinweis "  .env:         IMAGE_DIGEST=${bisher:-<leer>} → $digest (Kopie $(basename "$env_kopie"))"
  hinweis "  Start:        docker compose up -d --pull never $CENTRIC_DIENST"
  hinweis "  Danach:       healthy (höchstens ${WARTEZEIT}s), Smoke, Log, Manifestabgleich"
  hinweis "  Bei Fehler:   $([[ $bei_fehler == ruecksprung ]] && echo "Rücksprung auf vorherig (nur wenn das neue Bild noch nichts geschrieben hat), sonst R0" || echo "R0 (abschalten.sh)")"
  exit 0
fi

protokoll "start digest=$digest von=${bisher:-leer} bei-fehler=$bei_fehler"

# Phase steuert, was ein unerwarteter Fehler auslöst (M1): vor dem Anhalten
# Abbruch, zwischen Anhalten und Wechsel Wiederanlauf (oder R0), nach dem
# Wechsel fehlschlag (R0 bzw. Rücksprung).
phase="vor"
name=""
marke=""

r0() { # Dienst anhalten; Exit 1, oder 8 wenn auch das nicht sicher gelingt
  if "$FREIGABE_SKRIPT_VERZ/abschalten.sh"; then
    protokoll "$1, R0 erreicht"
    exit 1
  fi
  protokoll "$1, R0 NICHT sicher erreicht"
  exit 8
}

alt_wieder_starten() {
  trap - ERR
  fehler "Vor dem Wechsel gescheitert: $* — nichts gewechselt."
  protokoll "abgebrochen vor wechsel digest=$digest: $*"
  if ! bisher_startbar; then
    fehler "Der bisherige Stand (${bisher:-<leer>}) ist nicht startbar (gesperrt, nicht freigegeben oder fehlt) — R0 statt Neustart."
    r0 "abgebrochen vor wechsel, bisher nicht startbar"
  fi
  if compose up -d --pull never "$CENTRIC_DIENST"; then
    hinweis "Der bisherige Stand ${bisher} läuft wieder."
    exit 1
  fi
  fehler "Alter Stand startet nicht — R0."
  r0 "abgebrochen vor wechsel, alter Stand startet nicht"
}

# Hat das neue Bild schon in die Ablage geschrieben? (M2) Spur, Takt und
# Punktdateien (.prozess) zählen nicht.
neu_geschrieben() {
  [[ -n "$marke" && -f "$marke" ]] || return 0
  [[ -n "$(find "$DATEN_PFAD" -type f -newer "$marke" ! -name '.*' ! -path '*/.gesund/*' \
      ! -path '*/centric-spur/*' ! -path '*/centric-takt/*' -print -quit 2>/dev/null)" ]]
}

fehlschlag() {
  trap - ERR
  fehler "Auslieferung FEHLGESCHLAGEN: $*"
  fehler "Sicherung vor dem Wechsel: $SICHERUNGEN/${name:-?} · vorige .env: $env_kopie"
  protokoll "fehlgeschlagen digest=$digest: $*"
  if [[ "$bei_fehler" == "ruecksprung" ]]; then
    local ziel
    ziel="$(digests_mit_status vorherig | head -n1)"
    if neu_geschrieben; then
      fehler "Das neue Bild hat bereits Daten geschrieben — ein Rücksprung könnte sie verlieren oder falsch lesen. R0."
      protokoll "ruecksprung verweigert: neues Bild hat geschrieben"
    elif [[ -n "$ziel" && "$ziel" != "$digest" ]] && ! gesperrt_grund "$ziel" >/dev/null; then
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
  r0 "fehlgeschlagen"
}

unerwartet() {
  local zeile="$1"
  # set -E vererbt den Trap auch in Subshells ($(…), <(…)). Dort darf er
  # nichts auslösen — nur die Subshell beenden; den Fehler sieht dann die
  # Hauptshell (A2).
  [[ "$BASHPID" == "$$" ]] || exit 1
  case "$phase" in
    vor) abbruch 4 "unerwarteter Fehler in Zeile $zeile" ;;
    angehalten) alt_wieder_starten "unerwarteter Fehler in Zeile $zeile" ;;
    *) fehlschlag "unerwarteter Fehler in Zeile $zeile" ;;
  esac
}
set -E
trap 'unerwartet $LINENO' ERR

# --- 4. anhalten, sichern, prüfen ---------------------------------------
compose stop "$CENTRIC_DIENST" || alt_wieder_starten "compose stop scheiterte"
phase="angehalten"
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

# Platz nach der Sicherung (Review WP-05, N1): dieselben Kritisch-Schwellen
# wie /gesund (CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT/_MB aus der .env,
# Vorgabe 3 % / 200 MB). Darunter wird nicht gewechselt — der bisherige Stand
# läuft weiter (oder R0, wenn er nicht startbar ist), wie bei einem
# Sicherungsfehler.
krit_pz="$(env_wert "$envdatei" CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT)"
[[ "$krit_pz" =~ ^[0-9]+$ ]] || krit_pz=3
krit_mb="$(env_wert "$envdatei" CENTRIC_GESUND_PLATZ_KRITISCH_MB)"
[[ "$krit_mb" =~ ^[0-9]+$ ]] || krit_mb=200
platz="$(df -P -B1 "$DATEN_PFAD" 2>/dev/null | awk 'NR == 2 { print $2, $4 }')" || platz=""
read -r platz_gesamt platz_frei <<<"$platz"
if [[ ! "${platz_gesamt:-}" =~ ^[0-9]+$ || ! "${platz_frei:-}" =~ ^[0-9]+$ ]] || ((platz_gesamt == 0)); then
  alt_wieder_starten "freier Platz nach der Sicherung nicht ermittelbar"
fi
if ((platz_frei * 100 < krit_pz * platz_gesamt || platz_frei < krit_mb * 1048576)); then
  alt_wieder_starten "nach der Sicherung kritisch wenig Platz unter $DATEN_PFAD ($platz_frei Bytes frei, Schwelle $krit_pz % / $krit_mb MB)"
fi

# Aufbewahrung (N4): die jüngsten BEHALTEN vollständigen Sicherungen bleiben,
# die eben geprüfte immer; ältere vollständige werden entfernt.
# Robust (A2): Scheitert die Auflistung, wird übersprungen — nie gelöscht.
# Gelöscht wird nur, was als Name genau dem Muster entspricht, direkt unter
# $SICHERUNGEN liegt und ein FERTIG trägt.
vollstaendig=()
if liste="$(find "$SICHERUNGEN" -mindepth 1 -maxdepth 1 -type d -name 'centric-sicherung-*' -print)"; then
  while IFS= read -r eintrag_pfad; do
    [[ -n "$eintrag_pfad" ]] || continue
    kurz="$(basename -- "$eintrag_pfad")"
    [[ "$kurz" =~ ^centric-sicherung-[0-9]{8}T[0-9]{6}Z$ ]] || continue
    [[ -f "$SICHERUNGEN/$kurz/FERTIG" ]] || continue
    vollstaendig+=("$kurz")
  done <<<"$liste"
  if ((${#vollstaendig[@]} > BEHALTEN)); then
    mapfile -t vollstaendig < <(printf '%s\n' "${vollstaendig[@]}" | LC_ALL=C sort)
    for kurz in "${vollstaendig[@]:0:${#vollstaendig[@]}-BEHALTEN}"; do
      [[ "$kurz" == "$name" ]] && continue
      rm -rf -- "${SICHERUNGEN:?}/$kurz" && protokoll "sicherung entfernt $kurz (behalten $BEHALTEN)"
    done
  fi
else
  warnung "Aufbewahrung übersprungen: Liste der Sicherungen nicht lesbar."
  protokoll "aufbewahrung uebersprungen: find scheiterte"
fi

# --- 5. .env: nur IMAGE_DIGEST ------------------------------------------
cp -p "$envdatei" "$env_kopie" || alt_wieder_starten ".env-Kopie scheiterte"
neu="$(mktemp "$CENTRIC_VERZ/.env.neu.XXXXXX")" || alt_wieder_starten "mktemp scheiterte"
trap 'rm -f "$neu"' EXIT
chmod 600 "$neu" || alt_wieder_starten "chmod scheiterte"
awk -v z="$digest" '
  /^[[:space:]]*(export[[:space:]]+)?IMAGE_DIGEST=/ {
    if (!gesetzt) { print "IMAGE_DIGEST=" z; gesetzt = 1 }
    next
  }
  { print }
  END { if (!gesetzt) print "IMAGE_DIGEST=" z }
' "$envdatei" >"$neu" || alt_wieder_starten ".env neu schreiben scheiterte"
chmod --reference="$envdatei" "$neu" 2>/dev/null || chmod 600 "$neu" || true
mv -f "$neu" "$envdatei" || alt_wieder_starten ".env ersetzen scheiterte (.env unverändert)"
phase="gewechselt"
protokoll "env digest=$digest kopie=$(basename "$env_kopie")"

# --- 6. starten ---------------------------------------------------------
# Marke für „hat das neue Bild geschrieben?“ und den Abgleich (M2).
marke="$SICHERUNGEN/$name/.start-marke"
touch "$marke"
start_ms="$(date +%s%3N)"
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
# Erst vollständig in eine Datei, dann suchen (M3): `docker logs | grep -q`
# bricht unter pipefail bei großen Logs mit SIGPIPE ab und übersähe Treffer.
logdatei="$(mktemp)"
docker logs --since "$start_utc" "$CENTRIC_DIENST" >"$logdatei" 2>&1 ||
  { rm -f "$logdatei"; fehlschlag "docker logs scheiterte"; }
if grep -q -- "$XFF_WARNUNG" "$logdatei"; then
  rm -f "$logdatei"
  fehlschlag "Log meldet X-Forwarded-For ohne Vertrauensliste — alle Nutzer teilten sich eine Herkunft"
fi
rm -f "$logdatei"

# --- 10. Manifestabgleich ----------------------------------------------
# Verglichen wird gegen den Stand VOR dem Start (M2). Was nach dem Start
# geändert wurde — Caddy leitet schon vor „healthy“ weiter, der Löschlauf
# läuft eine Minute nach dem Start —, ist kein Fehler, sondern eine Warnung.
abgleich_aus="$(docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
  -v "$DATEN_PFAD:/data:ro" -v "$SICHERUNGEN/$name:/sicherung:ro" \
  -v "$ABGLEICH:/deploy-abgleich.mjs:ro" --entrypoint node "$ref" \
  /deploy-abgleich.mjs /sicherung /data --start "$start_ms")" ||
  { printf '%s\n' "$abgleich_aus"; fehlschlag "Daten weichen von der Sicherung vor dem Wechsel ab"; }
printf '%s\n' "$abgleich_aus"
if [[ "$abgleich_aus" =~ \"nachStart\":([1-9][0-9]*) ]]; then
  warnung "${BASH_REMATCH[1]} Dateien wurden nach dem Start geändert (Nutzer oder Löschlauf) — nicht abgeglichen."
  protokoll "abgleich warnung: ${BASH_REMATCH[1]} nach dem Start geändert"
fi

# --- 11. Protokoll ------------------------------------------------------
trap - ERR
protokoll "erfolgreich digest=$digest bild-id=$lauf_id sicherung=$name"
hinweis "Ausgeliefert: $CENTRIC_DIENST läuft healthy auf $digest (Commit $commit)."
hinweis "FREIGEGEBENE-IMAGES.md: $digest → aktiv, bisher ${bisher:-<leer>} → vorherig (falls nicht schon so)."
