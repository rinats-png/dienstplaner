#!/usr/bin/env bash
# =====================================================================
#  auslastung-messen.sh — LESENDE Auslastungsmessung des VPS
#  (IONOS-Bestandsprüfung §1c/§1d, Betreiberentscheidung 2026-11-17 Punkt 4)
#
#  Aufruf (auf dem VPS als admin, oder vom Arbeitsrechner über einen
#  BEREITS autorisierten Zugang, ohne die Datei zu kopieren):
#     bash auslastung-messen.sh [--ohne-sudo] [--intervall SEK] [--trocken]
#     ssh <alias> 'bash -s -- --ohne-sudo' < deploy/auslastung-messen.sh > messung.txt
#
#  Was gemessen wird (nur lesen, nichts wird geändert, nichts geschrieben
#  außer auf stdout): nproc, Last, Steal-Zeit (vmstat), Speicher
#  (/proc/meminfo, free -h), Platz und Inodes (df), docker stats
#  --no-stream, docker system df, Container (Name/Bild/Status), lauschende
#  TCP-Ports (ss -Htln[p], nur Port, Adressklasse, Prozessname), ufw-Status
#  und Kette DOCKER-USER, Backup-Agent (Acronis) vorhanden, Größe von
#  data/ und zustand/ (du -sh, nur Summen).
#
#  Was NIE gelesen oder ausgegeben wird: .env, docker inspect (Umgebung),
#  docker compose config, Prozess-Argumente oder -Umgebung (/proc/*/environ,
#  ps e), Dateiinhalte unter data/ oder zustand/, Logs. Adressen (IPv4/IPv6)
#  werden in jeder Ausgabe maskiert; nur Klassen bleiben (alle/lokal).
#
#  sudo: nur `sudo -n` (nie eine Passwortabfrage) für ss -p, ufw, iptables.
#  Ohne Recht bzw. mit --ohne-sudo steht dort „nicht gemessen (sudo)“.
#
#  Bewertung gegen den Schwellenrahmen IONOS-BESTANDSPRUEFUNG.md §1d
#  (Vorschlag, unbelegt): MemAvailable >= 2,5 GiB, Swap belegt < 256 MiB,
#  Load(15 min) < vCores/2, Steal < 10 %, freier Platz auf / >= 40 %.
#  Zweimal messen: Ruhezeit und Lastzeit (z. B. während einer Planfreigabe).
#
#  Rückgabe: 0 Messung durchgeführt (Bewertung steht in der Ausgabe)
#            2 Aufruf
#  Prüfung: pruefungen/staging-o2.test.js („IONOS: Auslastungsmessung“)
# =====================================================================
set -euo pipefail
umask 077
export LC_ALL=C

OHNE_SUDO=0
TROCKEN=0
INTERVALL=5
APP_VERZ="${CENTRIC_APP_VERZ:-/opt/apps/centric-dienstplanung}"
PROC="${MESS_PROC:-/proc}"   # nur für die Prüfung mit Stub-Dateien umlenkbar

aufruf() { echo "Aufruf: $0 [--ohne-sudo] [--intervall SEK] [--trocken]" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --ohne-sudo) OHNE_SUDO=1 ;;
    --trocken) TROCKEN=1 ;;
    --intervall) shift; [ $# -gt 0 ] || aufruf; INTERVALL="$1" ;;
    -h|--hilfe) aufruf ;;
    *) aufruf ;;
  esac
  shift
done
[[ "$INTERVALL" =~ ^[0-9]{1,3}$ ]] || aufruf

if [ "$TROCKEN" = 1 ]; then
  cat <<EOF
Trockenlauf — folgende LESENDE Befehle würden laufen (nichts wird ausgeführt):
  nproc; cat $PROC/loadavg; vmstat $INTERVALL 2
  grep MemTotal/MemAvailable/SwapTotal/SwapFree $PROC/meminfo; free -h
  df -hP -x tmpfs -x devtmpfs -x overlay -x squashfs; df -iP /
  docker stats --no-stream --format Name/CPU/Mem; docker system df; docker ps --format Name/Bild/Status
  sudo -n ss -Htlnp (sonst ss -Htln)   [nur Port, Adressklasse, Prozessname]
  sudo -n ufw status verbose; sudo -n iptables -S DOCKER-USER   [Adressen maskiert]
  systemctl list-units --type=service --all (nur acronis|cyber|mms); Ordner /usr/lib/Acronis
  du -sh $APP_VERZ/data $APP_VERZ/zustand   [nur Summen]
EOF
  exit 0
fi

# --- Hilfen -------------------------------------------------------------
# Adressen maskieren: IPv4 außer 0.0.0.0/127.x, IPv6 (mind. zwei Doppelpunkt-Gruppen) außer :: und ::1.
maskieren() {
  sed -E \
    -e 's/\b(0\.0\.0\.0)\b/__ALLE4__/g' \
    -e 's/\b127(\.[0-9]{1,3}){3}\b/__LOKAL4__/g' \
    -e 's/\b[0-9]{1,3}(\.[0-9]{1,3}){3}(\/[0-9]{1,2})?\b/<ipv4>/g' \
    -e 's/(^|[^0-9a-fA-F:])::1([^0-9a-fA-F:]|$)/\1__LOKAL6__\2/g' \
    -e 's/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{0,4}){2,7}(\/[0-9]{1,3})?/<ipv6>/g' \
    -e 's/__ALLE4__/0.0.0.0/g; s/__LOKAL4__/127.x/g; s/__LOKAL6__/::1/g'
}
abschnitt() { printf '\n== %s ==\n' "$1"; }
hat() { command -v "$1" >/dev/null 2>&1; }
SUDO_OK=0
if [ "$OHNE_SUDO" = 0 ] && hat sudo && sudo -n true >/dev/null 2>&1; then SUDO_OK=1; fi
als_root() { if [ "$SUDO_OK" = 1 ]; then sudo -n "$@"; else return 99; fi; }

# --- Messung ------------------------------------------------------------
echo "Auslastungsmessung (nur lesend), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Hinweis: Ausgabe enthält keine Adressen, keine Umgebungswerte, keine Dateiinhalte."

abschnitt "CPU und Last"
VCORES="$(nproc 2>/dev/null || echo 0)"
echo "vCores: $VCORES"
LOAD15=""
if [ -r "$PROC/loadavg" ]; then
  read -r L1 L5 LOAD15 _ < "$PROC/loadavg"
  echo "Load 1/5/15 min: $L1 / $L5 / $LOAD15"
fi
STEAL=""
if hat vmstat; then
  # letzte Zeile von `vmstat N 2` = Durchschnitt über N Sekunden; Spalte st ist die letzte
  STEAL="$(vmstat "$INTERVALL" 2 2>/dev/null | tail -n1 | awk '{print $NF}')" || STEAL=""
  [[ "$STEAL" =~ ^[0-9]+$ ]] || STEAL=""
  echo "Steal-Zeit (vmstat st, ${INTERVALL}s): ${STEAL:-nicht gemessen}%"
fi

abschnitt "Speicher"
kib() { awk -v k="$1" '$1==k":"{print $2}' "$PROC/meminfo" 2>/dev/null; }
MEM_TOTAL="$(kib MemTotal)"; MEM_AVAIL="$(kib MemAvailable)"; SWAP_TOTAL="$(kib SwapTotal)"; SWAP_FREE="$(kib SwapFree)"
echo "MemTotal ${MEM_TOTAL:-?} KiB, MemAvailable ${MEM_AVAIL:-?} KiB, SwapTotal ${SWAP_TOTAL:-?} KiB, SwapFree ${SWAP_FREE:-?} KiB"
hat free && free -h 2>/dev/null || true

abschnitt "Platz"
hat df && { df -hP -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null || df -hP; } | maskieren
hat df && df -iP / 2>/dev/null | maskieren || true
ROOT_FREI_PROZ="$(df -P / 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print 100-$5}')" || ROOT_FREI_PROZ=""
[[ "$ROOT_FREI_PROZ" =~ ^[0-9]+$ ]] || ROOT_FREI_PROZ=""
for d in data zustand; do
  if [ -d "$APP_VERZ/$d" ]; then
    printf '%s/: %s\n' "$d" "$(du -sh "$APP_VERZ/$d" 2>/dev/null | awk '{print $1}' || echo '?')"
  fi
done

abschnitt "Docker"
if hat docker && docker info >/dev/null 2>&1; then
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null | maskieren || true
  docker system df 2>/dev/null || true
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | maskieren || true
else
  echo "Docker nicht erreichbar (nicht gemessen)"
fi

abschnitt "Lauschende TCP-Ports (Port, Adressklasse, Prozessname)"
ss_ausgabe=""
if hat ss; then
  ss_ausgabe="$(als_root ss -Htlnp 2>/dev/null)" || ss_ausgabe="$(ss -Htln 2>/dev/null || true)"
  # Spalten: State Recv-Q Send-Q Lokal:Port Gegenstelle [Prozess]; nur Port, Klasse und erster Prozessname
  printf '%s\n' "$ss_ausgabe" | awk 'NF>=4 {
      lokal=$4; port=lokal; sub(/.*:/, "", port); adr=lokal; sub(/:[^:]*$/, "", adr)
      klasse="einzeln"
      if (adr=="0.0.0.0" || adr=="*" || adr=="[::]" || adr=="::") klasse="alle"
      else if (adr ~ /^127\./ || adr=="[::1]" || adr=="::1") klasse="lokal"
      proz="-"; if (match($0, /\("[^"]+"/)) proz=substr($0, RSTART+2, RLENGTH-3)
      print port "\t" klasse "\t" proz }' | sort -u -n
else
  echo "ss fehlt (nicht gemessen)"
fi

abschnitt "Firewall (nur anzeigen)"
if als_root true 2>/dev/null; then
  { als_root ufw status verbose 2>/dev/null || echo "ufw: nicht vorhanden oder Fehler"; } | maskieren
  { als_root iptables -S DOCKER-USER 2>/dev/null || echo "iptables DOCKER-USER: nicht vorhanden oder Fehler"; } | maskieren
else
  echo "ufw / DOCKER-USER: nicht gemessen (sudo)"
fi

abschnitt "Backup-Agent (Acronis / Cyber Protection)"
AGENT="nein"
if hat systemctl; then
  einheiten="$(systemctl list-units --type=service --all --no-legend --plain 2>/dev/null | awk '{print $1}' | grep -iE 'acronis|cyber|mms' || true)"
  if [ -n "$einheiten" ]; then AGENT="ja"; printf 'Dienst: %s\n' "$einheiten"; fi
fi
[ -d /usr/lib/Acronis ] && AGENT="ja"
echo "Agent vorhanden: $AGENT"

# --- Bewertung gegen IONOS-BESTANDSPRUEFUNG.md §1d ------------------------
abschnitt "Bewertung (Rahmen §1d, Vorschlag, unbelegt)"
ERFUELLT=0; VERFEHLT=0; OFFEN=0
urteil() { # Name, Bedingung (0/1/leer), Messwert
  if [ -z "$2" ]; then OFFEN=$((OFFEN+1)); printf '%-28s %-16s %s\n' "$1" "NICHT GEMESSEN" "$3"
  elif [ "$2" = 1 ]; then ERFUELLT=$((ERFUELLT+1)); printf '%-28s %-16s %s\n' "$1" "ERFUELLT" "$3"
  else VERFEHLT=$((VERFEHLT+1)); printf '%-28s %-16s %s\n' "$1" "VERFEHLT" "$3"; fi
}
b_mem=""; [ -n "$MEM_AVAIL" ] && b_mem=$(( MEM_AVAIL >= 2621440 ? 1 : 0 ))
urteil "MemAvailable >= 2,5 GiB" "$b_mem" "${MEM_AVAIL:-?} KiB"
b_swap=""; if [ -n "$SWAP_TOTAL" ] && [ -n "$SWAP_FREE" ]; then b_swap=$(( SWAP_TOTAL - SWAP_FREE < 262144 ? 1 : 0 )); fi
urteil "Swap belegt < 256 MiB" "$b_swap" "$(( ${SWAP_TOTAL:-0} - ${SWAP_FREE:-0} )) KiB"
b_load=""; if [ -n "$LOAD15" ] && [ "${VCORES:-0}" -gt 0 ]; then b_load="$(awk -v l="$LOAD15" -v c="$VCORES" 'BEGIN{print (l < c/2) ? 1 : 0}')"; fi
urteil "Load(15) < vCores/2" "$b_load" "${LOAD15:-?} bei ${VCORES} vCores"
b_steal=""; [ -n "$STEAL" ] && b_steal=$(( STEAL < 10 ? 1 : 0 ))
urteil "Steal < 10 %" "$b_steal" "${STEAL:-?} %"
b_platz=""; [ -n "$ROOT_FREI_PROZ" ] && b_platz=$(( ROOT_FREI_PROZ >= 40 ? 1 : 0 ))
urteil "freier Platz auf / >= 40 %" "$b_platz" "${ROOT_FREI_PROZ:-?} %"

if [ "$VERFEHLT" -gt 0 ]; then GESAMT="NICHT AUSREICHEND"
elif [ "$OFFEN" -gt 0 ]; then GESAMT="UNVOLLSTAENDIG"
else GESAMT="AUSREICHEND"; fi
echo "Gesamt: $GESAMT (erfüllt $ERFUELLT, verfehlt $VERFEHLT, nicht gemessen $OFFEN)"
echo "Rahmen ist ein Vorschlag (IONOS-BESTANDSPRUEFUNG.md §1d); Staging bleibt unabhängig davon eine eigene VM (O2)."
exit 0
