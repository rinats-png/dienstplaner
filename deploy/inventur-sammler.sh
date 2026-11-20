#!/bin/bash
# =====================================================================
#  inventur-sammler.sh — Phase 2 (langfristig) von REL-0: root-eigener
#  Sammler. Ruft die lesende Inventur auf und legt die maskierte Ausgabe
#  ATOMAR als Datei ab, die das Konto „inventur“ nur lesen darf.
#
#  Ablage auf dem VPS: /usr/local/sbin/centric-inventur-sammler.sh
#  (root:root 0755). Start NUR durch root (systemd-Timer oder root-cron),
#  siehe docs/acc45/VPS-ZUGANG-EINRICHTUNG.md, Abschnitt 8.
#
#  Ablauf:
#    1. Zielverzeichnis /var/lib/centric-inventur muss existieren
#       (root:inventur 0750). Der Sammler legt es nicht an.
#    2. Temporärdatei IM Zielverzeichnis (mktemp), damit mv atomar ist.
#    3. Inventur ohne BASH_ENV/ENV/SSH_ORIGINAL_COMMAND ausführen.
#       Rückgabe 0 oder 1 (einzelne Abschnitte gescheitert): weiter.
#       Jede andere Rückgabe: alte Datei bleibt, Temporärdatei wird
#       gelöscht, Rückgabe 4.
#    4. Rechte 0640, als root Gruppe „inventur“; mv auf aktuell.txt.
#
#  Rückgabe: 0 abgelegt · 2 Aufruf · 3 Zielverzeichnis fehlt
#            4 Inventur gescheitert (alte Datei unverändert)
#
#  Umgebung NUR für Prüfungen (systemd/cron setzen sie nicht):
#    INVENTUR_PRUEFPFAD    ersetzt den festen PATH
#    INVENTUR_PRUEFSKRIPT  (/usr/local/sbin/centric-inventur.sh)
#    INVENTUR_PRUEFZIEL    (/var/lib/centric-inventur)
#  Prüfung: pruefungen/inventur-phase2.test.js
# =====================================================================
set -euo pipefail
umask 077
export LC_ALL=C
PATH="${INVENTUR_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

INVENTUR="${INVENTUR_PRUEFSKRIPT:-/usr/local/sbin/centric-inventur.sh}"
ZIEL_VERZ="${INVENTUR_PRUEFZIEL:-/var/lib/centric-inventur}"
GRUPPE="inventur"

case "$#:${1:-}" in
  0:) ;;
  1:--hilfe | 1:-h) printf 'Aufruf: %s (ohne Argumente; nur als root per Timer)\n' "$0"; exit 0 ;;
  *) printf 'Aufruf: %s (ohne Argumente)\n' "$0" >&2; exit 2 ;;
esac

if [[ ! -d "$ZIEL_VERZ" ]]; then
  printf 'FEHLER: Zielverzeichnis %s fehlt (root:%s 0750 anlegen)\n' "$ZIEL_VERZ" "$GRUPPE" >&2
  exit 3
fi

tmp="$(mktemp "$ZIEL_VERZ/.aktuell.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT

rc=0
env -u BASH_ENV -u ENV -u SSH_ORIGINAL_COMMAND /bin/bash "$INVENTUR" >"$tmp" 2>&1 || rc=$?
if ((rc != 0 && rc != 1)); then
  printf 'FEHLER: Inventur endete mit Rückgabe %s; %s/aktuell.txt bleibt unverändert\n' "$rc" "$ZIEL_VERZ" >&2
  exit 4
fi
printf '\n=== Sammler: Inventur-Rückgabe %s ===\n' "$rc" >>"$tmp"

if [[ "$(id -u)" -eq 0 ]]; then
  chown "root:$GRUPPE" "$tmp"
fi
chmod 0640 "$tmp"
mv -f -- "$tmp" "$ZIEL_VERZ/aktuell.txt"
trap - EXIT
exit 0
