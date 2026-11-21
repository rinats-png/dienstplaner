#!/bin/bash
# =====================================================================
#  inventur-konsole.sh — LESENDE Inventur V-1 bis V-9 für die
#  IONOS-Remotekonsole (REL-0, Methode „Konsole“)
#
#  Anleitung: docs/acc45/INVENTUR-KONSOLE.md
#  Prüfung:   pruefungen/inventur-konsole.test.js
#  Werkzeug:  werkzeug/inventur-konsole-bauen.mjs (--hash, --pruefen, --bauen)
#
#  Ladeweg (root in der Remotekonsole, ohne Datei, siehe Anleitung):
#    s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/inventur-konsole.sh)
#    printf %s "$s" | sha256sum | grep -q '^<32 Hex>' && bash -c "$s"
#        Tor: nur bei passender Prüfsumme läuft das Skript (Kurzprotokoll)
#    … && bash -c "$s" x --voll | head -n 60       ausführlich, maskiert
#    unset s
#  Kein Pager (more/less: Shell-Escape „!“).
#
#  Wiederverwendung: INVENTUR_SH (unten, erzeugt) ist deploy/inventur.sh
#  Byte für Byte. Vor der Nutzung vergleicht das Skript dessen SHA-256 mit
#  INVENTUR_SHA256 und übernimmt nur die Funktionen zwischen
#  „# --- Hilfen“ und „# --- Ablauf“ (Hilfen, env_namen, maskieren, v1 bis
#  v8, r1, r2). v9 (docker exec /gesund legt im Container eine Probe an)
#  und v_kopf werden danach entfernt. V-9 läuft hier ohne docker exec; die
#  Gesundheit kommt aus dem Health-Status von V-1.
#
#  Strikt lesend: keine Datei (auch nicht in /tmp, kein Here-Dokument),
#  keine Installation, kein Dienst- oder Container-Start/-Stopp, keine
#  Rechteänderung, kein Netz. Docker nur lesend (inspect, image inspect,
#  images, version, stats, compose ps/config/version). Aus der .env nur
#  Schlüsselnamen (env_namen aus inventur.sh). maskieren() aus inventur.sh
#  läuft als zweite Schicht über jede Ausgabe.
#
#  Kurzprotokoll: höchstens 25 Zeilen à 70 Zeichen, nur ASCII; je V-n eine
#  Zeile „V-n STATUS Fakten“ mit STATUS OK, ABW, FEHLT oder NICHT-PRUEFBAR.
#  Letzte Zeile: PRUEFCODE = die ersten 12 Hex-Zeichen der SHA-256 über
#  alle Zeilen davor (je Zeile mit \n), ZEILEN = deren Anzahl.
#
#  Umgebung NUR für Prüfungen (bei SSH_CONNECTION verworfen):
#    INVENTUR_PRUEFPFAD, INVENTUR_MASKE, INVENTUR_OS_RELEASE, CENTRIC_VERZ,
#    CENTRIC_DIENST, CENTRIC_BILD_REPO, CENTRIC_KONTO_HOME,
#    CENTRIC_HOME_WURZEL, CENTRIC_ZEITGRENZE
#
#  Rückgabe: 0 Protokoll ausgegeben · 2 Abbruch (Aufruf, Selbstprüfung)
# =====================================================================
# Die Funktionen aus inventur.sh entstehen erst durch eval; shellcheck
# sieht weder sie noch die Nutzung der Variablen darin.
# shellcheck disable=SC2034,SC2329
set -euo pipefail
umask 077
export LC_ALL=C
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  unset INVENTUR_PRUEFPFAD INVENTUR_MASKE INVENTUR_OS_RELEASE CENTRIC_VERZ CENTRIC_DIENST \
    CENTRIC_BILD_REPO CENTRIC_KONTO_HOME CENTRIC_HOME_WURZEL CENTRIC_ZEITGRENZE
fi
PATH="${INVENTUR_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

VERSION=1
VERZ="${CENTRIC_VERZ:-/opt/apps/centric-dienstplanung}"
DIENST="${CENTRIC_DIENST:-centric-dp-web}"
BILD_REPO="${CENTRIC_BILD_REPO:-ghcr.io/rinats-png/dienstplaner}"
HOME_WURZEL="${CENTRIC_HOME_WURZEL:-/home}"
ZEITGRENZE="${CENTRIC_ZEITGRENZE:-30}"
[[ "$ZEITGRENZE" =~ ^[1-9][0-9]{0,2}$ ]] || ZEITGRENZE=30
OS_RELEASE="${INVENTUR_OS_RELEASE:-/etc/os-release}"

# Zustände nach docs/acc45/PROD-DIGEST-ABWEICHUNG.md §3
DIGEST_A='sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f'
DIGEST_B='sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79'
# Betriebsdateien wie im Abgleich von PRODUKTIONSWEG-VORBEREITUNG §2.1,
# in C-Sortierung (Grundlage der V-4-Summe; Werkzeug: --v4-summe <ref>)
BETRIEBSDATEIEN=(FREIGEGEBENE-IMAGES.md abschalten.sh compose.yml deploy-abgleich.mjs deploy-smoke.mjs deploy.sh digest-pruefen.sh freigabe-lib.sh ruecksprung.sh)

hilfe() {
  printf '%s\n' \
    'Aufruf in der Remotekonsole: bash -c "<Inhalt>" [x --voll | x --hilfe]' \
    'Lesende Inventur V-1 bis V-9 als Kurzprotokoll mit PRUEFCODE.' \
    '--voll: ausfuehrliches, maskiertes Protokoll (nur Bildschirm).' \
    'Anleitung: docs/acc45/INVENTUR-KONSOLE.md'
}

abbruch() {
  printf 'ABBRUCH: %s\n' "$1"
  printf 'Es wurde nichts geaendert. Bitte Bildschirmfoto an Claude.\n'
  exit 2
}

# Nur unbedenkliche Zeichen, gekürzt (Werte aus Befehlsausgaben).
rein() {
  local s="${1//[^A-Za-z0-9._:@\/+% -]/}"
  printf '%s' "${s:0:${2:-40}}"
}

# --- Selbstprüfung (vor jedem Docker-Aufruf) ------------------------------
selbstpruefung() {
  local uid id ver b1 b2
  uid="$(id -u 2>/dev/null || true)"
  [[ "$uid" == 0 ]] || abbruch 'nicht root (als root in der Remotekonsole anmelden)'
  id="$(awk -F= '$1 == "ID" { gsub(/"/, "", $2); print $2 }' "$OS_RELEASE" 2>/dev/null || true)"
  ver="$(awk -F= '$1 == "VERSION_ID" { gsub(/"/, "", $2); print $2 }' "$OS_RELEASE" 2>/dev/null || true)"
  if [[ "$id" != ubuntu || "$ver" != 24.04 ]]; then
    abbruch "fremdes System ($(rein "$id" 12) $(rein "$ver" 8)), erwartet ubuntu 24.04"
  fi
  [[ -d "$VERZ" ]] || abbruch 'Betriebsverzeichnis fehlt'
  [[ -d "$VERZ/data" ]] || abbruch 'Verzeichnis data fehlt'
  b1="$(stat -c '%U %u' "$VERZ" 2>/dev/null || true)"
  b2="$(stat -c '%U %u' "$VERZ/data" 2>/dev/null || true)"
  [[ -n "$b1" && "$b1" == "$b2" ]] || abbruch "Besitz verschieden: $(rein "$b1" 24) / $(rein "$b2" 24)"
  KONTO="$(rein "${b1% *}" 24)"
  KONTO_UID="${b1##* }"
  [[ "$KONTO_UID" =~ ^[0-9]+$ && "$KONTO_UID" != 0 ]] || abbruch 'Besitzer ist root oder unbekannt'
}

# --- eingebettete inventur.sh prüfen und Funktionsblock herauslösen -------
inventur_laden() {
  local ist
  ist="$(printf '%s' "$INVENTUR_SH" | sha256sum | cut -c1-64)"
  [[ "$ist" == "$INVENTUR_SHA256" ]] || abbruch 'eingebettete inventur.sh: Prüfsumme falsch'
  [[ "$INVENTUR_SH" == *$'\n# --- Hilfen'*$'\n# --- Ablauf'* ]] || abbruch 'eingebettete inventur.sh: Marken fehlen'
  INVENTUR_BLOCK="# --- Hilfen${INVENTUR_SH#*$'\n# --- Hilfen'}"
  INVENTUR_BLOCK="${INVENTUR_BLOCK%%$'\n# --- Ablauf'*}"
}

# Eine Funktion in einer Unterschale mit set -e ausführen; Ausgabe in AUS,
# Rückgabe in RC (wie abschnitt() in inventur.sh, aber ohne Ausgabe).
lauf() {
  set +e
  AUS="$( (set -euo pipefail; "$@") 2>&1)"
  RC=$?
  set -e
}

# Enthält AUS genau diese Zeile?
hat_zeile() { [[ $'\n'"$AUS"$'\n' == *$'\n'"$1"$'\n'* ]]; }

ZEILEN=()
Z_OK=0
Z_ABW=0
Z_FEHLT=0
Z_NP=0
zeile() {
  case "$1" in
    OK) Z_OK=$((Z_OK + 1)) ;;
    ABW) Z_ABW=$((Z_ABW + 1)) ;;
    FEHLT) Z_FEHLT=$((Z_FEHLT + 1)) ;;
    *) Z_NP=$((Z_NP + 1)) ;;
  esac
  ZEILEN+=("$2 $1 $3")
}
info() { ZEILEN+=("$1"); }

# Folgezeile „    <titel> a b c …“, höchstens 70 Zeichen, Rest als +N.
liste() {
  local titel="$1" z w n=0 rest
  shift
  z="    $titel"
  for w in "$@"; do
    rest=$(($# - n))
    if ((${#z} + 1 + ${#w} > 64 && rest > 0)); then
      z+=" +$rest"
      info "$z"
      return
    fi
    z+=" $w"
    n=$((n + 1))
  done
  info "$z"
}

# --- Prüfpunkte (je Punkt eine Statuszeile) -------------------------------
DOCKER=nein
DOCKER_V=''
HEALTH=''
LAUF_DIGEST=''

k_docker() {
  lauf docker_lesen version --format '{{.Server.Version}}'
  if ((RC == 0)) && [[ "$AUS" =~ ^[0-9][0-9.]*$ ]]; then
    DOCKER=ja
    DOCKER_V="$(rein "$AUS" 12)"
  fi
}

k_v1() {
  if [[ "$DOCKER" != ja ]]; then zeile NICHT-PRUEFBAR V-1 'Docker nicht erreichbar'; return; fi
  lauf v1
  local -a f=()
  read -r -a f < <(printf '%s\n' "$AUS" | tail -n 1) || true
  if ((RC != 0 || ${#f[@]} < 6)); then
    lauf docker_lesen inspect "$DIENST" --format '{{.Image}}'
    if ((RC != 0)); then
      zeile FEHLT V-1 "Container $(rein "$DIENST" 24) fehlt"
    else
      zeile NICHT-PRUEFBAR V-1 'compose ps gescheitert'
    fi
    return
  fi
  local bild st seit neu s=ABW
  bild="${f[0]#sha256:}"
  bild="$(rein "${bild:0:12}" 12)"
  st="$(rein "${f[2]}" 12)"
  HEALTH="$(rein "${f[3]}" 12)"
  seit="$(rein "${f[4]}" 10)"
  neu="$(rein "${f[5]}" 6)"
  if [[ "$st" == running && "$HEALTH" == healthy ]]; then s=OK; fi
  zeile "$s" V-1 "$st $HEALTH Neustarts $neu seit $seit Bild $bild"
}

k_v2() {
  if [[ "$DOCKER" != ja ]]; then zeile NICHT-PRUEFBAR V-2 'Docker nicht erreichbar'; return; fi
  lauf v2
  local erste dg lab z s=ABW labt kurz
  erste="$(printf '%s\n' "$AUS" | head -n 1)"
  if [[ "$erste" != sha256:* ]]; then zeile NICHT-PRUEFBAR V-2 'Bild nicht lesbar'; return; fi
  dg="$(printf '%s\n' "$erste" | { grep -oE '@sha256:[0-9a-f]{64}' || true; } | head -n 1)"
  dg="${dg#@}"
  LAUF_DIGEST="$dg"
  lab="$(printf '%s\n' "$erste" | awk '{ print $3 }')"
  if [[ "$dg" == "$DIGEST_A" ]]; then z=A; s=OK; elif [[ "$dg" == "$DIGEST_B" ]]; then z=B; else z=C; fi
  if [[ "$lab" =~ ^[0-9a-f]{40}$ ]]; then labt="Label ${lab:0:12}"; else labt='Label fehlt'; fi
  kurz="${dg#sha256:}"
  kurz="${kurz:0:12}"
  zeile "$s" V-2 "Zustand $z Digest ${kurz:-keiner} $labt"
}

k_v3() {
  lauf v3
  local dig=nein tag=nein ref refd refk s vgl
  if hat_zeile IMAGE_DIGEST; then dig=ja; fi
  if hat_zeile IMAGE_TAG; then tag=ja; fi
  ref="$(printf '%s\n' "$AUS" | { grep -E '^[[:space:]]+image:' || true; } | head -n 1)"
  if [[ -z "$ref" ]]; then
    if hat_zeile '.env fehlt'; then zeile FEHLT V-3 '.env fehlt'; else zeile NICHT-PRUEFBAR V-3 'compose config gescheitert'; fi
    return
  fi
  refd="$(printf '%s\n' "$ref" | { grep -oE '@sha256:[0-9a-f]{64}' || true; } | head -n 1)"
  refd="${refd#@}"
  if [[ -n "$refd" ]]; then
    refk="${refd#sha256:}"
    refk="@${refk:0:12}"
  else
    refk="Tag $(rein "${ref##*:}" 16)"
  fi
  if [[ "$dig" == nein && "$tag" == nein ]]; then
    s=FEHLT
    vgl='ohne Schluesselname'
  elif [[ -z "$LAUF_DIGEST" ]]; then
    s=ABW
    vgl='laufend unbekannt'
  elif [[ "$refd" == "$LAUF_DIGEST" ]]; then
    s=OK
    vgl='gleich laufend'
  else
    s=ABW
    vgl='ungleich laufend'
  fi
  zeile "$s" V-3 ".env DIGEST $dig TAG $tag Ref $refk $vgl"
}

k_v4() {
  lauf v4
  local f h liste='' n=0 alle extra cv dv s summe
  local -a fehlen=()
  for f in "${BETRIEBSDATEIEN[@]}"; do
    h="$(printf '%s\n' "$AUS" | awk -v f="$f" '($2 == f || $2 == "./" f || $2 == "*" f || $2 == "*./" f) && length($1) == 64 && $1 ~ /^[0-9a-f]+$/ { print $1; exit }')"
    if [[ -n "$h" ]]; then
      n=$((n + 1))
      liste+="$h  $f"$'\n'
    else
      fehlen+=("$f")
    fi
  done
  alle="$(printf '%s\n' "$AUS" | awk 'length($1) == 64 && $1 ~ /^[0-9a-f]+$/ && NF == 2 { k++ } END { print k + 0 }')"
  extra=$((alle - n))
  if ((alle == 0 && RC != 0)); then zeile NICHT-PRUEFBAR V-4 'Betriebsverzeichnis nicht lesbar'; return; fi
  summe="$(printf '%s' "$liste" | sha256sum | cut -c1-12)"
  cv="$(printf '%s\n' "$AUS" | { grep -oE '^Docker Compose version v?[0-9][0-9.]*' || true; } | head -n 1)"
  cv="${cv##* }"
  cv="$(rein "${cv#v}" 10)"
  dv="$(printf '%s\n' "$AUS" | { grep -xE '[0-9]+\.[0-9][0-9.]*' || true; } | tail -n 1)"
  s=OK
  if ((${#fehlen[@]})); then s=ABW; fi
  if [[ " ${fehlen[*]} " == *" compose.yml "* ]]; then s=FEHLT; fi
  zeile "$s" V-4 "Dateien $n/${#BETRIEBSDATEIEN[@]}+$extra Summe $summe compose ${cv:-?} docker $(rein "${dv:-?}" 10)"
  if ((${#fehlen[@]})); then liste fehlt "${fehlen[@]}"; fi
}

k_v5() {
  lauf v5
  local d z n s
  d="$(printf '%s\n' "$AUS" | awk '$1 == "data" && NF == 4 { split($3, u, ":"); print u[1], $4; exit }')"
  if hat_zeile 'zustand fehlt'; then
    zeile FEHLT V-5 "data $(rein "${d:-?}" 16) zustand fehlt"
    return
  fi
  z="$(printf '%s\n' "$AUS" | awk '$1 == "zustand" && NF == 4 { split($3, u, ":"); print u[1], $4; exit }')"
  if [[ -z "$z" ]]; then zeile NICHT-PRUEFBAR V-5 'zustand nicht lesbar'; return; fi
  n="$(printf '%s\n' "$AUS" | awk '/^-- zustand\// { f = 1; next } f && $1 != "total" && $NF != "." && $NF != ".." { k++ } END { print k + 0 }')"
  s=ABW
  if [[ "$z" == "$KONTO_UID 700" ]]; then s=OK; fi
  zeile "$s" V-5 "data $(rein "${d:-?}" 16) zustand $(rein "$z" 16) Eintraege $n"
}

ENV_IST=''
k_v6() {
  lauf v6
  if ((RC != 0)); then
    if hat_zeile '.env fehlt'; then zeile FEHLT V-6 '.env fehlt'; else zeile NICHT-PRUEFBAR V-6 '.env nicht lesbar'; fi
    return
  fi
  ENV_IST="$(printf '%s\n' "$AUS" | { grep -xE '[A-Za-z_][A-Za-z0-9_]*' || true; })"
  local name i=0 n opt=0 optn=0 extra=0 s=OK
  local -a nr=()
  local alle=$'\n'"$ENV_PFLICHT"$'\n'"$ENV_OPTIONAL"$'\n'
  local ist=$'\n'"$ENV_IST"$'\n'
  while IFS= read -r name; do
    i=$((i + 1))
    [[ "$ist" == *$'\n'"$name"$'\n'* ]] || nr+=("$i")
  done < <(printf '%s\n' "$ENV_PFLICHT")
  while IFS= read -r name; do
    optn=$((optn + 1))
    if [[ "$ist" == *$'\n'"$name"$'\n'* ]]; then opt=$((opt + 1)); fi
  done < <(printf '%s\n' "$ENV_OPTIONAL")
  n=0
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    n=$((n + 1))
    [[ "$alle" == *$'\n'"$name"$'\n'* ]] || extra=$((extra + 1))
  done < <(printf '%s\n' "$ENV_IST")
  if ((${#nr[@]})); then s=ABW; fi
  zeile "$s" V-6 "Namen $n Pflicht fehlt ${#nr[@]} optional $opt/$optn extra $extra"
  if ((${#nr[@]})); then liste "fehlt Pflicht-Nr" "${nr[@]}"; fi
}

# crontab des Kontos (inventur.sh liest die des aufrufenden Kontos, hier root)
cron_konto() {
  if hat crontab; then
    { crontab -l -u "$KONTO" 2>/dev/null || true; } | { grep -vE '^[[:space:]]*(#|$)' || true; } | { grep -oE '[^ /]+\.sh' || true; } | sort -u
  else
    printf 'crontab: nicht vorhanden\n'
  fi
}

k_v7() {
  lauf v7
  local r cr ck vz zeit s
  if hat_zeile 'restic: nicht installiert'; then
    r=nein
  else
    r="$(printf '%s\n' "$AUS" | awk '$1 == "restic" && $2 ~ /^[0-9]/ { print $2; exit }')"
    r="$(rein "${r:-?}" 10)"
  fi
  cr="$(printf '%s\n' "$AUS" | awk '/^-- crontab/ { f = 1; next } /^-- / { f = 0 } f && /\.sh$/ { k++ } END { print k + 0 }')"
  AUS_V7="$AUS"
  lauf cron_konto
  ck="$(printf '%s\n' "$AUS" | awk '/\.sh$/ { k++ } END { print k + 0 }')"
  AUS="$AUS_V7"
  vz="$(printf '%s\n' "$AUS" | awk '/^-- Sicherungsverzeichnisse/ { f = 1; next } /^-- / { f = 0 } f && /: fehlt$/ { k++ } END { print 3 - k }')"
  zeit="$(printf '%s\n' "$AUS" | { grep -oE '"zeit":"[0-9T:.Z+-]{1,40}"' || true; } | head -n 1)"
  zeit="${zeit#\"zeit\":\"}"
  zeit="$(rein "${zeit%\"}" 16)"
  if [[ "$r" != nein && -n "$zeit" && $((cr + ck)) -gt 0 ]]; then
    s=OK
  elif [[ "$r" == nein && -z "$zeit" && $((cr + ck)) -eq 0 ]]; then
    s=FEHLT
  else
    s=ABW
  fi
  zeile "$s" V-7 "restic $r Cron $cr/$ck Verz $vz/3 letzte ${zeit:-keine}"
}

k_v8() {
  lauf v8
  local w s
  w="$(printf '%s\n' "$AUS" | awk '
    /^== / && !/symbolischer Link/ { f++ }
    /^Zeilen mit Schl/ { z += $NF }
    /^deploy\.sh --ssh: / { d += $NF }
    /^centric-inventur: / { i += $NF }
    /^Optionen: \(keine\)/ { o++ }
    END { print f + 0, z + 0, o + 0, d + 0, i + 0 }')"
  local -a v=()
  read -r -a v < <(printf '%s\n' "$w") || true
  s=FEHLT
  if ((v[3] > 0)); then s=OK; fi
  zeile "$s" V-8 "Dateien ${v[0]} Zeilen ${v[1]} ohne-Optionen ${v[2]} deploy-ssh ${v[3]} inventur ${v[4]}"
}

# V-9 ohne docker exec. Betriebsprotokoll wie v9 in inventur.sh.
v9_konsole() {
  cd "$VERZ"
  df -hP .
  if [[ -d data ]]; then du -sh data; else printf 'data fehlt\n'; fi
  printf -- '-- Health-Status aus docker inspect (kein docker exec): %s\n' "${HEALTH:-unbekannt}"
  printf -- '-- betrieb-protokoll.log (letzte 30, nur Zeit, Skript, Ereignis):\n'
  if [[ -L betrieb-protokoll.log ]]; then
    printf 'betrieb-protokoll.log ist ein symbolischer Link, nicht gelesen\n'
  elif [[ -f betrieb-protokoll.log ]]; then
    tail -n 30 betrieb-protokoll.log | awk '{
      e = $3; if (e !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) e = "?"
      z = $1; if (z !~ /^[0-9T:Z-]+$/) z = "?"
      s = $2; if (s !~ /^[A-Za-z0-9._-]+$/) s = "?"
      print z, s, e }'
  else
    printf '(kein betrieb-protokoll.log)\n'
  fi
}

k_v9() {
  lauf v9_konsole
  local -a d=()
  local du ev p s=OK
  read -r -a d < <(printf '%s\n' "$AUS" | awk 'NR == 2 { print $2, $4, $5 }') || true
  if ((${#d[@]} < 3)); then zeile NICHT-PRUEFBAR V-9 'df gescheitert'; return; fi
  du="$(printf '%s\n' "$AUS" | awk '$2 == "data" && NF == 2 { print $1; exit }')"
  p="${d[2]%\%}"
  if ! [[ "$p" =~ ^[0-9]+$ ]] || ((p >= 85)); then s=ABW; fi
  if [[ -n "$HEALTH" && "$HEALTH" != healthy ]]; then s=ABW; fi
  zeile "$s" V-9 "frei $(rein "${d[1]}" 8) von $(rein "${d[0]}" 8) belegt $(rein "${d[2]}" 4) data $(rein "${du:-?}" 8) gesund ${HEALTH:-?}"
  ev="$(printf '%s\n' "$AUS" | awk '/^-- betrieb-protokoll/ { f = 1; next } f { l = $0 } END { print l }')"
  if [[ -z "$ev" || "$ev" == '(kein betrieb-protokoll.log)' ]]; then ev='kein Protokoll'; fi
  info "    letztes Ereignis $(rein "$ev" 50)"
}

k_r1() {
  lauf r1
  local cpu last mem app s=OK
  cpu="$(printf '%s\n' "$AUS" | awk '$1 == "nproc:" { print $2; exit }')"
  last="$(printf '%s\n' "$AUS" | { grep -oE 'load average: [0-9.]+' || true; } | head -n 1)"
  last="${last##* }"
  mem="$(printf '%s\n' "$AUS" | awk '$1 == "Mem:" { print $2 "M verfuegbar " $7 "M"; exit }')"
  app="$(printf '%s\n' "$AUS" | awk -v d="$DIENST" '$1 == d && NF >= 6 { print $2, $3; exit }')"
  if ((RC != 0)); then s=NICHT-PRUEFBAR; fi
  zeile "$s" R-1 "CPU $(rein "${cpu:-?}" 4) Last $(rein "${last:-?}" 6) RAM $(rein "${mem:-? verfuegbar ?}" 24) App $(rein "${app:-?}" 18)"
}

k_r2() {
  if [[ "$DOCKER" != ja ]]; then zeile NICHT-PRUEFBAR R-2 'Docker nicht erreichbar'; return; fi
  lauf r2
  if ((RC != 0)); then zeile NICHT-PRUEFBAR R-2 'inspect gescheitert'; return; fi
  local m rw=nein proj pfad=nein s=ABW
  m="$(printf '%s\n' "$AUS" | awk '$3 == "->" { k++ } END { print k + 0 }')"
  if printf '%s\n' "$AUS" | awk -v q="$VERZ/data" '$2 == q && $3 == "->" && $5 == "schreibbar:true" { t = 1 } END { exit !t }'; then rw=ja; fi
  proj="$(printf '%s\n' "$AUS" | awk '$1 == "Compose-Projekt:" { print $2; exit }')"
  if printf '%s\n' "$AUS" | awk -v q="$VERZ" '$1 == "Compose-Projekt:" && $4 == q { t = 1 } END { exit !t }'; then pfad=ja; fi
  if [[ "$rw" == ja && "$pfad" == ja ]]; then s=OK; fi
  zeile "$s" R-2 "Mounts $m data-rw $rw Projekt $(rein "${proj:-?}" 16) Pfad-gleich $pfad"
}

# Abgleich .env mit .env.example, nur Namen (für --voll)
v6_abgleich() {
  local name i=0 ist=$'\n'"$ENV_IST"$'\n'
  printf -- '-- fehlende Pflichtnamen (Nr wie im Kurzprotokoll):\n'
  while IFS= read -r name; do
    i=$((i + 1))
    [[ "$ist" == *$'\n'"$name"$'\n'* ]] || printf '%s %s\n' "$i" "$name"
  done < <(printf '%s\n' "$ENV_PFLICHT")
  printf -- '-- vorhandene optionale Namen:\n'
  while IFS= read -r name; do
    [[ "$ist" != *$'\n'"$name"$'\n'* ]] || printf '%s\n' "$name"
  done < <(printf '%s\n' "$ENV_OPTIONAL")
  printf -- '-- Namen ausserhalb der Vorlage:\n'
  local alle=$'\n'"$ENV_PFLICHT"$'\n'"$ENV_OPTIONAL"$'\n'
  while IFS= read -r name; do
    [[ -z "$name" || "$alle" == *$'\n'"$name"$'\n'* ]] || printf '%s\n' "$name"
  done < <(printf '%s\n' "$ENV_IST")
}

# V-8 für --voll: ssh-keygen -lf zeigt „Bits Fingerabdruck Kommentar (Typ)“. Der Kommentar
# (oft Name oder Rechnername) fällt weg: nur Bits, Fingerabdruck, Typ.
v8_konsole() {
  v8 | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^SHA256:/ { print $1, $2, $NF; next } { print }'
}

voll_abschnitte() {
  abschnitt "V-1 Container, Status, laufende Bild-ID" v1
  abschnitt "V-2 Digest und Label des laufenden Bilds" v2
  abschnitt "V-3 Bildreferenz in der Konfiguration" v3
  abschnitt "V-4 Betriebsdateien und Pruefsummen" v4
  abschnitt "V-5 Zustandsverzeichnis" v5
  abschnitt "V-6 Schluesselnamen der .env" v6
  abschnitt "V-6a Abgleich mit .env.example (nur Namen)" v6_abgleich
  abschnitt "V-7 Sicherungen (crontab von root)" v7
  abschnitt "V-7a crontab des Kontos (nur Skriptnamen)" cron_konto
  abschnitt "V-8 authorized_keys (nur Optionen, Fingerabdruck ohne Kommentar)" v8_konsole
  abschnitt "V-9 Platz und Gesundheit (kein docker exec)" v9_konsole
  abschnitt "R-1 Ressourcen" r1
  abschnitt "R-2 Mounts und Compose-Projektpfad" r2
}

kurzprotokoll() {
  local -a k=()
  local z code
  mapfile -t k < <(printf '%s\n' "${ZEILEN[@]}" | maskieren)
  for z in "${k[@]}"; do
    z="${z:0:70}"
    printf '%s\n' "${z%"${z##*[! ]}"}"
  done
}

haupt() {
  local modus=kurz
  case "$#:${1:-}" in
    0:) ;;
    1:--voll) modus=voll ;;
    1:--hilfe | 1:-h) hilfe; exit 0 ;;
    *) hilfe >&2; exit 2 ;;
  esac
  printf 'Dieses Skript ändert nichts.\n'
  selbstpruefung
  inventur_laden
  eval "$INVENTUR_BLOCK"
  unset -f v9 v_kopf

  local host zeit
  host="$(rein "$(uname -n)" 24)"
  zeit="$(rein "$(date -u +%Y-%m-%dT%H:%MZ)" 17)"
  k_docker
  info "INVENTUR-KONSOLE $VERSION nur lesend Quelle inventur.sh ${INVENTUR_SHA256:0:12}"
  info "Host $host Zeit $zeit root ja ubuntu 24.04"
  if [[ "$DOCKER" == ja ]]; then
    info "Konto $KONTO uid $KONTO_UID Verz+data gleich Docker $DOCKER_V"
  else
    info "Konto $KONTO uid $KONTO_UID Verz+data gleich Docker nein"
  fi
  k_v1
  k_v2
  k_v3
  k_v4
  k_v5
  k_v6
  k_v7
  k_v8
  k_v9
  k_r1
  k_r2
  info "SUMME OK $Z_OK ABW $Z_ABW FEHLT $Z_FEHLT NICHT-PRUEFBAR $Z_NP"

  if [[ "$modus" == voll ]]; then
    # Nur druckbares ASCII, Tab und Zeilenumbruch: keine Steuerfolgen aus Dateinamen auf der Konsole.
    voll_abschnitte | tr -cd '\11\12\40-\176'
    printf '\n=== KURZPROTOKOLL ===\n'
  fi

  local -a k=()
  mapfile -t k < <(kurzprotokoll)
  printf '%s\n' "${k[@]}"
  local code
  code="$(printf '%s\n' "${k[@]}" | sha256sum | cut -c1-12)"
  printf 'PRUEFCODE %s ZEILEN %s\n' "$code" "${#k[@]}"
}

# >>> ERZEUGT von werkzeug/inventur-konsole-bauen.mjs --bauen (nicht von Hand ändern)
INVENTUR_SHA256='d99207298c121d8af32f7d4bfcf048e6f8f47951305741753d8b5493ff533c21'
ENV_PFLICHT='CENTRIC_ABLAGE
CENTRIC_ABSENDER
CENTRIC_ADMIN
CENTRIC_BASIS
CENTRIC_DATEN
CENTRIC_PFEFFER
CENTRIC_VERTRAUTE_PROXYS
IMAGE_DIGEST
NODE_ENV
PORT
REDIS_REST_TOKEN
REDIS_REST_URL
RESEND_API_KEY
VAPID_KONTAKT
VAPID_PRIVATE
VAPID_PUBLIC'
ENV_OPTIONAL='CENTRIC_ABDRUCK_SPEICHER_MAX
CENTRIC_ABSCHLUSS_OHNE_SPERRE
CENTRIC_ABSCHLUSS_SEGMENTWEISE
CENTRIC_ALARM_ENTPRELLUNG_S
CENTRIC_ALARM_WEBHOOK
CENTRIC_ALARM_WIEDERHOLUNG_S
CENTRIC_AUFRAEUMEN
CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT
CENTRIC_DATENSCHUTZLAUF
CENTRIC_DEMO
CENTRIC_ERSTLEITUNG_STRENG
CENTRIC_GESUND_429_WARNUNG
CENTRIC_GESUND_5XX_WARNUNG
CENTRIC_GESUND_CACHE_MS
CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN
CENTRIC_GESUND_PLATZ_KRITISCH_MB
CENTRIC_GESUND_PLATZ_KRITISCH_PROZENT
CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT
CENTRIC_GESUND_SICHERUNG_WARNUNG_STUNDEN
CENTRIC_GESUND_TAKT_S
CENTRIC_GESUND_ZEITGRENZE_MS
CENTRIC_GESUND_ZUSTELLUNG_WARNUNG
CENTRIC_HILFE_ASSISTENT
CENTRIC_IMPORT_ADRESSRAUM_KB
CENTRIC_IMPORT_AKTIV
CENTRIC_KETTE_AUS
CENTRIC_KONTOWIEDERHERSTELLUNG
CENTRIC_MAILBESTAETIGUNG
CENTRIC_MAIL_WEG
CENTRIC_NOTRUF_JE_STUNDE
CENTRIC_PRUEFLINK
CENTRIC_PUBLIC_REGISTRATION
CENTRIC_PUSH_HOSTS
CENTRIC_PUSH_JE_BETRIEB_MAX
CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT
CENTRIC_SCHICHTMODELL_PFLEGE
CENTRIC_SCHICHTMODELL_WIRKUNG
CENTRIC_SCHREIBHALT_MAX_MS
CENTRIC_SELBSTSTART
CENTRIC_SICHERUNG_STATUS
CENTRIC_SMTP_ABSENDER
CENTRIC_SMTP_BENUTZER
CENTRIC_SMTP_HOST
CENTRIC_SMTP_PASSWORT
CENTRIC_SMTP_PORT
CENTRIC_SMTP_SICHER
CENTRIC_STATIK
CENTRIC_TEILSPEICHERUNG
CENTRIC_TESTRAUM_MAIL
CENTRIC_TESTRAUM_MAIL_GESAMT_MAX
CENTRIC_TESTRAUM_MAIL_TAG_MAX
CENTRIC_UEBERWACHUNG
CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS
CENTRIC_ZUSTAND
CENTRIC_ZUSTELLPROTOKOLL_TAGE
CENTRIC_ZUSTELL_BACKOFF
CENTRIC_ZUSTELL_BETRIEB_MAIL
CENTRIC_ZUSTELL_BETRIEB_PUSH
CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL
CENTRIC_ZUSTELL_DRINGEND_PAAR_PUSH
CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL
CENTRIC_ZUSTELL_DRINGEND_QUELLE_PUSH
CENTRIC_ZUSTELL_PERSON_MAIL
CENTRIC_ZUSTELL_PERSON_PUSH
CENTRIC_ZUSTELL_RESERVE_MAIL
CENTRIC_ZUSTELL_RESERVE_PUSH
CENTRIC_ZUSTELL_SPERREN_AUFHEBEN
CENTRIC_ZUSTELL_TAKT
CENTRIC_ZWEIFAKTOR_PFLICHT'
# shellcheck disable=SC2016
INVENTUR_SH='#!/bin/bash
# =====================================================================
#  inventur.sh — LESENDE Produktionsinventur des VPS (REL-0)
#
#  Führt V-1 bis V-9 aus docs/acc45/PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md
#  §2.1 aus, dazu R-1 (Ressourcen) und R-2 (Mounts, Compose-Projektpfad).
#  Einrichtung und Sicherheitsnachweis: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md.
#
#  Ablage auf dem VPS: /usr/local/sbin/centric-inventur.sh (root:root 0755,
#  Verzeichnis root-eigen) — NICHT im Betriebsverzeichnis, das dem Konto
#  gehört.
#
#  Aufruf:
#    centric-inventur.sh            Inventur auf stdout
#    centric-inventur.sh --hilfe    Kurzhilfe
#  Als Forced Command (authorized_keys):
#    command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA… inventur-centric
#    SSH_ORIGINAL_COMMAND muss fehlen, leer oder genau „inventur“ sein.
#    Jeder andere Wert (auch scp/sftp/rsync, „inventur; id“, „INVENTUR“,
#    „inventur “) → Rückgabe 2, bevor irgendein Abschnitt läuft.
#
#  Schicht 1 (Quelle, maßgeblich): jeder Abschnitt liest nur Namen, Status,
#  Prüfsummen und Metadaten. Aus der .env nur Schlüsselnamen (env_namen),
#  nie Werte; Fehlertexte von docker compose werden verworfen, weil sie
#  .env-Zeilen enthalten können. Betriebsprotokoll nur Zeit, Skript,
#  Ereignisname. authorized_keys nur Optionen, Typ, Fingerabdruck.
#  Schicht 2 (nur zusätzlich): maskieren() über die gesamte Ausgabe.
#
#  Was das Skript NIE tut: docker pull/up/run/rm/rmi/tag/restart/stop/kill,
#  compose up/down, Dateien anlegen, ändern oder löschen. Einziger docker
#  exec: der feste /gesund-Aufruf im App-Container (V-9; /gesund legt im
#  Container die Probe data/.gesund an, siehe §2.1 V-9).
#
#  Härtung: fester PATH, BASH_ENV/ENV entfernt, umask 077, LC_ALL=C,
#  Shebang /bin/bash (kein env-Suchpfad).
#
#  Umgebung NUR für Prüfungen (sshd mit PermitUserEnvironment no und
#  AcceptEnv LANG LC_*, systemd und cron setzen sie nicht):
#    INVENTUR_PRUEFPFAD     ersetzt den festen PATH (Docker-Stub)
#    INVENTUR_MASKE=aus     schaltet Schicht 2 ab (Nachweis Schicht 1)
#    CENTRIC_VERZ          (/opt/apps/centric-dienstplanung)
#    CENTRIC_DIENST        (centric-dp-web)
#    CENTRIC_BILD_REPO     (ghcr.io/rinats-png/dienstplaner)
#    CENTRIC_KONTO_HOME    Heimatverzeichnis des Besitzers von CENTRIC_VERZ
#                          (aus getent; sonst $HOME)
#    CENTRIC_HOME_WURZEL   (/home) weitere authorized_keys (nur lesbare)
#    CENTRIC_ZEITGRENZE    (30) Sekunden je Docker-Aufruf
#  Bei einer SSH-Sitzung (SSH_CONNECTION gesetzt) werden alle diese
#  Variablen verworfen; dort gelten immer die festen Vorgaben.
#
#  Symbolische Links: Dateien, die das Konto kontrolliert
#  (letzte-erfolgreiche.json, betrieb-protokoll.log, authorized_keys,
#  Betriebsdateien für Prüfsummen), werden nur gelesen, wenn sie keine
#  Links sind.
#
#  Rückgabe: 0 alle Abschnitte gelaufen · 1 mindestens ein Abschnitt
#  gescheitert (Ausgabe trotzdem vollständig) · 2 Aufruf/abgewiesen
#  Prüfung: pruefungen/inventur-skript.test.js
# =====================================================================
# Die Abschnittsfunktionen (v1 … r2, v_kopf) laufen nur indirekt über
# abschnitt "<name>" <funktion>; shellcheck erkennt das nicht.
# shellcheck disable=SC2329
set -euo pipefail
umask 077
export LC_ALL=C
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  unset INVENTUR_PRUEFPFAD INVENTUR_MASKE CENTRIC_VERZ CENTRIC_DIENST CENTRIC_BILD_REPO \
    CENTRIC_KONTO_HOME CENTRIC_HOME_WURZEL CENTRIC_ZEITGRENZE
fi
PATH="${INVENTUR_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

# Forced Command: nur „inventur“ oder kein Befehl. Alles andere abweisen,
# bevor irgendetwas anderes geschieht.
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" && "${SSH_ORIGINAL_COMMAND}" != "inventur" ]]; then
  printf '\''abgewiesen: nur der Befehl "inventur" ist erlaubt\n'\'' >&2
  exit 2
fi

VERZ="${CENTRIC_VERZ:-/opt/apps/centric-dienstplanung}"
DIENST="${CENTRIC_DIENST:-centric-dp-web}"
BILD_REPO="${CENTRIC_BILD_REPO:-ghcr.io/rinats-png/dienstplaner}"
HOME_WURZEL="${CENTRIC_HOME_WURZEL:-/home}"
ZEITGRENZE="${CENTRIC_ZEITGRENZE:-30}"

hilfe() {
  printf '\''%s\n'\'' \
    "Aufruf: $0 [--hilfe]" \
    "Lesende Produktionsinventur (V-1 bis V-9, R-1, R-2)." \
    "Als Forced Command ist nur der Befehl '\''inventur'\'' erlaubt." \
    "Anleitung: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md"
}

case "$#:${1:-}" in
  0:) ;;
  1:--hilfe | 1:-h) hilfe; exit 0 ;;
  *) hilfe >&2; exit 2 ;;
esac

[[ "$ZEITGRENZE" =~ ^[1-9][0-9]{0,2}$ ]] || ZEITGRENZE=30

# --- Hilfen -------------------------------------------------------------
hat() { command -v "$1" >/dev/null 2>&1; }

# Docker nur lesend und mit Zeitgrenze. Unterbefehle stehen ausschließlich
# in den Abschnitten unten; die Prüfung erlaubt nur eine feste Liste.
docker_lesen() {
  if hat timeout; then timeout "$ZEITGRENZE" docker "$@"; else docker "$@"; fi
}

# docker compose liest die .env. Seine Fehlertexte können .env-Zeilen
# enthalten (z. B. Syntaxfehler mit Zeileninhalt). Deshalb: stderr
# verwerfen, nur Unterbefehl und Rückgabe melden.
compose_lesen() {
  local rc=0
  docker_lesen compose "$@" 2>/dev/null || rc=$?
  if ((rc)); then
    printf '\''docker compose %s fehlgeschlagen (Rückgabe %s, Fehlertext unterdrückt)\n'\'' "$1" "$rc" >&2
    return "$rc"
  fi
}

# Schicht 1 für die .env: NUR Schlüsselnamen. Versteht „export NAME=“,
# Leerzeichen vor/nach dem Namen, CRLF, Kommentare und Werte in
# Anführungszeichen über mehrere Zeilen (Folgezeilen werden übersprungen;
# ein maskiertes \" schließt einen doppelt zitierten Wert nicht).
# Ausgegeben wird nur, was danach wie ein Bezeichner aussieht.
# Grenze: ein Wert, der mit \\" (maskierter Backslash vor dem Schluss-
# zeichen) endet, wird als offen gewertet; Folgen sind höchstens
# fehlende Namen, nie Werte.
env_namen() {
  [[ -f .env ]] || { printf '\''.env fehlt\n'\'' >&2; return 1; }
  awk '\''
    function schliesst(s, q) {
      if (q == "\047") return index(s, q) > 0
      return match(s, /(^|[^\\])"/) > 0
    }
    { sub(/\r$/, "") }
    offen != "" { if (schliesst($0, offen)) offen = ""; next }
    {
      z = $0
      sub(/^[ \t]+/, "", z)
      sub(/^export[ \t]+/, "", z)
      if (!match(z, /^[A-Za-z_][A-Za-z0-9_]*[ \t]*=/)) next
      n = substr(z, 1, RLENGTH)
      w = substr(z, RLENGTH + 1)
      sub(/[ \t]*=$/, "", n)
      sub(/^[ \t]+/, "", w)
      q = substr(w, 1, 1)
      if ((q == "\"" || q == "\047") && !schliesst(substr(w, 2), q)) offen = q
      print n
    }'\'' .env | { grep -E '\''^[A-Za-z_][A-Za-z0-9_]*$'\'' || true; } | sort -u
}

# Schicht 2 (nur zusätzlich) für JEDE Ausgabezeile.
#  - IPv4 außer 0.0.0.0 und 127.x, IPv6 (ab vier Gruppen oder mit ::)
#  - Zugangsdaten in URLs (://name:wort@), E-Mail-Adressen
#  - Schlüsselkörper (ssh-…/ecdsa-… AAAA…), PEM-Blöcke
#  - Tokens (ghp_, github_pat_, sk-ant-, xox?-, Bearer/Basic)
#  - name=Wert (jeder Bezeichner, auch klein) außer IMAGE_DIGEST/IMAGE_TAG
#    und command= (Forced-Command-Option in V-8)
#  - Werte zu Namen mit PASS/SECRET/TOKEN/KEY/… („Name: Wert“, „name=Wert“)
#  - lange Base64-Folgen (awk-Stufe unten); SHA256:-Fingerabdrücke und
#    sha256:-Digests bleiben lesbar
maskieren() {
  if [[ "${INVENTUR_MASKE:-an}" == "aus" ]]; then
    cat
    return
  fi
  sed -E \
    -e '\''s/-----BEGIN [A-Z ]*PRIVATE KEY-----.*/<privater-schluessel>/'\'' \
    -e '\''s/-----END [A-Z ]*PRIVATE KEY-----.*/<privater-schluessel>/'\'' \
    -e '\''s/\b(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+) +AAAA[A-Za-z0-9+\/=]+/\1 <schluessel>/g'\'' \
    -e '\''s/\bgh[pousr]_[A-Za-z0-9]{16,}/<token>/g'\'' \
    -e '\''s/\bgithub_pat_[A-Za-z0-9_]{16,}/<token>/g'\'' \
    -e '\''s/\bsk-ant-[A-Za-z0-9_-]+/<token>/g'\'' \
    -e '\''s/\bxox[abprs]-[A-Za-z0-9-]+/<token>/g'\'' \
    -e '\''s/\b(Bearer|Basic) +[A-Za-z0-9._~+\/=-]+/\1 <token>/g'\'' \
    -e '\''s#(://)[^/@[:space:]]+@#\1<zugang>@#g'\'' \
    -e '\''s/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/<email>/g'\'' \
    -e '\''s/\b(0\.0\.0\.0)\b/__ALLE4__/g'\'' \
    -e '\''s/\b127(\.[0-9]{1,3}){3}\b/__LOKAL4__/g'\'' \
    -e '\''s/\b[0-9]{1,3}(\.[0-9]{1,3}){3}(\/[0-9]{1,2})?\b/<ipv4>/g'\'' \
    -e '\''s/(^|[^0-9a-fA-F:])::1([^0-9a-fA-F:]|$)/\1__LOKAL6__\2/g'\'' \
    -e '\''s/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{0,4}){3,7}(\/[0-9]{1,3})?/<ipv6>/g'\'' \
    -e '\''s/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*::([0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*)?/<ipv6>/g'\'' \
    -e '\''s/(^|[^0-9a-fA-F:<\[])::[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*(\/[0-9]{1,3})?/\1<ipv6>/g'\'' \
    -e '\''s/__ALLE4__/0.0.0.0/g; s/__LOKAL4__/127.x/g; s/__LOKAL6__/::1/g'\'' \
    -e '\''s/\b(IMAGE_DIGEST|IMAGE_TAG|command)=/__SCHUTZ_\1__/g'\'' \
    -e '\''s/\b([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]*/\1=<maskiert>/g'\'' \
    -e '\''s/__SCHUTZ_(IMAGE_DIGEST|IMAGE_TAG|command)__/\1=/g'\'' \
    -e '\''s/\b([A-Za-z0-9_]*(PASS|PASSWORT|PASSWORD|SECRET|GEHEIM|TOKEN|KEY|SCHLUESSEL|PFEFFER|SALT|CREDENTIAL)[A-Za-z0-9_]*)(["'\''"'\''"'\'']?[[:space:]]*[:=][[:space:]]*)("[^"]*"|'\''"'\''"'\''[^'\''"'\''"'\'']*'\''"'\''"'\''|[^,;}[:space:]]+)/\1\3<maskiert>/gI'\'' |
    awk '\''{
      # Base64-artige Folgen ab 32 Zeichen mit Groß-, Kleinbuchstaben und
      # Ziffer; nicht nach „SHA256:“/„sha256:“ (Fingerabdruck, Digest) und
      # nicht mit „/“ am Anfang (Pfad).
      rest = $0; aus = ""
      while (match(rest, /[A-Za-z0-9+\/=]+/)) {
        t = substr(rest, RSTART, RLENGTH)
        aus = aus substr(rest, 1, RSTART - 1)
        vor = (length(aus) >= 7) ? substr(aus, length(aus) - 6) : ""
        if (length(t) >= 32 && vor != "SHA256:" && vor != "sha256:" && substr(t, 1, 1) != "/" &&
            t ~ /[A-Z]/ && t ~ /[a-z]/ && t ~ /[0-9]/) t = "<maskiert>"
        aus = aus t
        rest = substr(rest, RSTART + RLENGTH)
      }
      print aus rest
    }'\''
}

FEHLER=0
GESCHEITERT=()

# Einen Abschnitt in einer Unterschale ausführen. Scheitert er, Meldung
# und weiter. Nicht in einem Bedingungskontext aufrufen (set -e muss in
# der Unterschale greifen).
abschnitt() {
  local name="$1"; shift
  printf '\''\n=== %s ===\n'\'' "$name"
  set +e
  ( set -euo pipefail; "$@" ) 2>&1 | maskieren
  local st=("${PIPESTATUS[@]}")
  set -e
  if [[ "${st[0]}" -ne 0 || "${st[1]}" -ne 0 ]]; then
    printf -- '\''--- %s: Abschnitt gescheitert (Rückgabe %s), weiter mit dem nächsten ---\n'\'' "$name" "${st[0]}"
    FEHLER=$((FEHLER + 1))
    GESCHEITERT+=("$name")
  fi
}

# Heimatverzeichnis des Kontos, dem das Betriebsverzeichnis gehört
# (admin, uid 1000). Gilt auch, wenn das Skript als root läuft (Phase 2).
konto_home() {
  if [[ -n "${CENTRIC_KONTO_HOME:-}" ]]; then printf '\''%s\n'\'' "$CENTRIC_KONTO_HOME"; return; fi
  local besitzer zeile
  besitzer="$(stat -c '\''%U'\'' "$VERZ" 2>/dev/null || true)"
  if [[ -n "$besitzer" ]] && hat getent; then
    zeile="$(getent passwd "$besitzer" || true)"
    if [[ -n "$zeile" ]]; then printf '\''%s\n'\'' "$zeile" | cut -d: -f6; return; fi
  fi
  printf '\''%s\n'\'' "${HOME:-}"
}
KONTO_HOME="$(konto_home)"

# --- Abschnitte ---------------------------------------------------------
v_kopf() {
  printf '\''Produktionsinventur (nur lesend)\n'\''
  printf '\''Zeit (UTC): %s\n'\'' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '\''Rechner: %s\n'\'' "$(uname -n)"
  printf '\''Konto: %s (uid %s)\n'\'' "$(id -un)" "$(id -u)"
  printf '\''Betriebsverzeichnis: %s\n'\'' "$VERZ"
  # Nachweis für restrict/no-pty/no-agent-forwarding (Negativproben N-5, N-11):
  # nur ja/nein, nie der Wert von SSH_AUTH_SOCK.
  if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then printf '\''Agent-Weiterleitung: gesetzt\n'\''; else printf '\''Agent-Weiterleitung: nicht gesetzt\n'\''; fi
  if [[ -t 0 ]]; then printf '\''Terminal: ja\n'\''; else printf '\''Terminal: nein\n'\''; fi
  printf '\''Skript: '\''
  sha256sum "${BASH_SOURCE[0]}"
}

v1() {
  cd "$VERZ"
  compose_lesen ps
  docker_lesen inspect "$DIENST" --format '\''{{.Image}} {{.Config.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}ohne-health{{end}} {{.State.StartedAt}} {{.RestartCount}}'\''
}

v2() {
  local bild
  bild="$(docker_lesen inspect "$DIENST" --format '\''{{.Image}}'\'')"
  docker_lesen image inspect --format '\''{{.Id}} {{json .RepoDigests}} {{index .Config.Labels "org.opencontainers.image.revision"}}'\'' "$bild"
  docker_lesen images --digests --no-trunc "$BILD_REPO"
}

# Bildreferenz: aus der .env nur, ob IMAGE_DIGEST/IMAGE_TAG als Name
# vorkommen; die wirksame Referenz zeigt compose config (nur image:).
v3() {
  cd "$VERZ"
  printf -- '\''-- Schlüssel IMAGE_DIGEST/IMAGE_TAG in .env (nur Namen):\n'\''
  env_namen | { grep -xE '\''IMAGE_DIGEST|IMAGE_TAG'\'' || printf '\''(weder IMAGE_DIGEST noch IMAGE_TAG)\n'\''; }
  printf -- '\''-- docker compose config (nur image:):\n'\''
  compose_lesen config | grep -E '\''^[[:space:]]+image:'\''
}

v4() {
  cd "$VERZ"
  ls -la
  printf -- '\''-- Prüfsummen:\n'\''
  local f dateien=()
  for f in compose.yml FREIGEGEBENE-IMAGES.md ./*.sh ./*.mjs; do
    [[ -f "$f" && ! -L "$f" ]] && dateien+=("$f")
  done
  if ((${#dateien[@]})); then sha256sum "${dateien[@]}"; else printf '\''(keine Betriebsdateien)\n'\''; fi
  printf -- '\''-- Versionen:\n'\''
  compose_lesen version
  docker_lesen version --format '\''{{.Server.Version}}'\''
}

v5() {
  cd "$VERZ"
  local d
  for d in data zustand; do
    if [[ -e "$d" ]]; then stat -c '\''%n %U:%G %u:%g %a'\'' "$d"; else printf '\''%s fehlt\n'\'' "$d"; fi
  done
  if [[ -d zustand ]]; then
    printf -- '\''-- zustand/ (nur Namen, Rechte, Größe):\n'\''
    ls -la zustand
  fi
}

v6() {
  cd "$VERZ"
  env_namen
}

v7() {
  if hat restic; then
    restic version
  else
    printf '\''restic: nicht installiert\n'\''
  fi
  printf -- '\''-- crontab (nur Skriptnamen):\n'\''
  if hat crontab; then
    { crontab -l 2>/dev/null || true; } | { grep -vE '\''^[[:space:]]*(#|$)'\'' || true; } | { grep -oE '\''[^ /]+\.sh'\'' || true; } | sort -u
  else
    printf '\''crontab: nicht vorhanden\n'\''
  fi
  printf -- '\''-- Sicherungsverzeichnisse:\n'\''
  local d
  for d in "$KONTO_HOME/sicherung" "$KONTO_HOME/sicherung/lokal" "$VERZ/deploy-sicherungen"; do
    if [[ -d "$d" ]]; then
      printf '\''%s:\n'\'' "$d"
      find "$d" -mindepth 1 -maxdepth 1 -printf '\''%M %u:%g %s %TY-%Tm-%Td %f\n'\'' | sort -k6 | head -n 40
    else
      printf '\''%s: fehlt\n'\'' "$d"
    fi
  done
  printf -- '\''-- letzte erfolgreiche Sicherung:\n'\''
  # Nur die festen Felder der Marke (deploy/sicherung/sicherung-ausser-haus.sh):
  # zeit, dateien, bytes, snapshot_id. Alles andere wird verworfen.
  local marke="$KONTO_HOME/sicherung/letzte-erfolgreiche.json"
  if [[ -L "$marke" ]]; then
    printf '\''letzte-erfolgreiche.json ist ein symbolischer Link, nicht gelesen\n'\''
  elif [[ -f "$marke" ]]; then
    { grep -oE '\''"(zeit|snapshot_id)":"[0-9A-Za-z:.+-]{1,64}"'\'' "$marke" || true; } | head -n 2
    { grep -oE '\''"(dateien|bytes)":[0-9]{1,20}'\'' "$marke" || true; } | head -n 2
  else
    printf '\''(keine Datei letzte-erfolgreiche.json)\n'\''
  fi
}

# Nur Optionen, Zähler und Fingerabdrücke — nie den Schlüsselkörper.
v8() {
  local h f gesehen=" "
  for h in "$KONTO_HOME" "${HOME:-}" "$HOME_WURZEL"/*; do
    [[ -n "$h" ]] || continue
    f="$h/.ssh/authorized_keys"
    if [[ -L "$f" ]]; then printf '\''== %s: symbolischer Link, nicht gelesen\n'\'' "$f"; continue; fi
    [[ -f "$f" && -r "$f" ]] || continue
    [[ "$gesehen" == *" $f "* ]] && continue
    gesehen+="$f "
    printf '\''== %s\n'\'' "$f"
    stat -c '\''%U:%G %a'\'' "$f"
    printf '\''Zeilen mit Schlüssel: %s\n'\'' "$(grep -cvE '\''^[[:space:]]*(#|$)'\'' "$f" || true)"
    printf '\''deploy.sh --ssh: %s\n'\'' "$(grep -c '\''deploy.sh --ssh'\'' "$f" || true)"
    printf '\''centric-inventur: %s\n'\'' "$(grep -c '\''centric-inventur'\'' "$f" || true)"
    # je Schlüsselzeile: Optionen vor dem Typ und der Typ; Körper und Kommentar fallen weg
    sed -nE \
      -e '\''s/^[[:space:]]*(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)[[:space:]]+AAAA.*/Optionen: (keine) | Typ: \1/p'\'' \
      -e '\''s/^[[:space:]]*(.*[^[:space:]])[[:space:]]+(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)[[:space:]]+AAAA.*/Optionen: \1 | Typ: \2/p'\'' \
      "$f"
    if hat ssh-keygen; then
      ssh-keygen -lf "$f" || printf '\''ssh-keygen: Datei nicht lesbar\n'\''
    fi
  done
  [[ "$gesehen" != " " ]] || printf '\''(keine lesbare authorized_keys)\n'\''
}

v9() {
  cd "$VERZ"
  df -h .
  if [[ -d data ]]; then du -sh data; else printf '\''data fehlt\n'\''; fi
  printf -- '\''-- /gesund:\n'\''
  docker_lesen exec "$DIENST" node -e "fetch('\''http://127.0.0.1:3000/gesund'\'').then(r=>r.text()).then(t=>console.log(t))" | head -c 2000
  printf '\''\n-- betrieb-protokoll.log (letzte 30, nur Zeit, Skript, Ereignis):\n'\''
  if [[ -L betrieb-protokoll.log ]]; then
    printf '\''betrieb-protokoll.log ist ein symbolischer Link, nicht gelesen\n'\''
  elif [[ -f betrieb-protokoll.log ]]; then
    tail -n 30 betrieb-protokoll.log | awk '\''{
      e = $3; if (e !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) e = "?"
      z = $1; if (z !~ /^[0-9T:Z-]+$/) z = "?"
      s = $2; if (s !~ /^[A-Za-z0-9._-]+$/) s = "?"
      print z, s, e }'\''
  else
    printf '\''(kein betrieb-protokoll.log)\n'\''
  fi
}

r1() {
  printf '\''nproc: %s\n'\'' "$(nproc)"
  if hat uptime; then uptime; else printf '\''uptime: nicht vorhanden\n'\''; fi
  if hat free; then free -m; else printf '\''free: nicht vorhanden\n'\''; fi
  docker_lesen stats --no-stream --format '\''{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.MemPerc}}'\''
}

r2() {
  docker_lesen inspect "$DIENST" --format '\''{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} schreibbar:{{.RW}}{{println}}{{end}}'\''
  docker_lesen inspect "$DIENST" --format '\''Compose-Projekt: {{index .Config.Labels "com.docker.compose.project"}} Pfad: {{index .Config.Labels "com.docker.compose.project.working_dir"}} Dateien: {{index .Config.Labels "com.docker.compose.project.config_files"}}'\''
}

# --- Ablauf -------------------------------------------------------------
abschnitt "Kopf" v_kopf
abschnitt "V-1 Container, Status, laufende Bild-ID" v1
abschnitt "V-2 Digest und Label des laufenden Bilds" v2
abschnitt "V-3 Bildreferenz in der Konfiguration" v3
abschnitt "V-4 Betriebsdateien und Prüfsummen" v4
abschnitt "V-5 Zustandsverzeichnis" v5
abschnitt "V-6 Schlüsselnamen der .env" v6
abschnitt "V-7 Sicherungen" v7
abschnitt "V-8 authorized_keys (nur Optionen)" v8
abschnitt "V-9 Platz und Gesundheit" v9
abschnitt "R-1 Ressourcen" r1
abschnitt "R-2 Mounts und Compose-Projektpfad" r2

printf '\''\n=== Ende ===\n'\''
if ((FEHLER)); then
  printf '\''Gescheiterte Abschnitte: %s\n'\'' "$FEHLER"
  printf -- '\''- %s\n'\'' "${GESCHEITERT[@]}"
  exit 1
fi
printf '\''Alle Abschnitte gelaufen.\n'\''
exit 0
'
# <<< ERZEUGT

haupt "$@"
