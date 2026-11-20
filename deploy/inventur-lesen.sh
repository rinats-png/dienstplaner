#!/bin/sh
# =====================================================================
#  inventur-lesen.sh — Phase 2 (langfristig) von REL-0: Forced Command
#  des Kontos „inventur“. Gibt NUR die vom Sammler abgelegte, bereits
#  maskierte Datei aus. Keine Argumente, keine anderen Dateien, keine
#  Docker-Rechte.
#
#  Ablage auf dem VPS: /usr/local/sbin/centric-inventur-lesen.sh
#  (root:root 0755). Login-Shell des Kontos: /bin/sh (NICHT nologin —
#  sshd startet den Forced Command über die Login-Shell; nologin würde
#  ihn verhindern). Siehe docs/acc45/VPS-ZUGANG-EINRICHTUNG.md, Abschnitt 8.
#
#  SSH_ORIGINAL_COMMAND: fehlt, leer oder genau „inventur“. Alles andere
#  (auch scp/sftp/rsync) → Rückgabe 2 ohne Ausgabe der Datei.
#
#  Rückgabe: 0 ausgegeben · 1 keine Inventur vorhanden · 2 Aufruf/abgewiesen
#  Umgebung NUR für Prüfungen: INVENTUR_PRUEFDATEI
#  Prüfung: pruefungen/inventur-phase2.test.js
# =====================================================================
set -eu
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset ENV BASH_ENV CDPATH

if [ -n "${SSH_ORIGINAL_COMMAND:-}" ] && [ "$SSH_ORIGINAL_COMMAND" != "inventur" ]; then
  printf 'abgewiesen: nur der Befehl "inventur" ist erlaubt\n' >&2
  exit 2
fi
if [ "$#" -ne 0 ]; then
  printf 'Aufruf: %s (ohne Argumente)\n' "$0" >&2
  exit 2
fi

DATEI="${INVENTUR_PRUEFDATEI:-/var/lib/centric-inventur/aktuell.txt}"
if [ ! -f "$DATEI" ] || [ ! -r "$DATEI" ]; then
  printf 'keine Inventur vorhanden (Sammler noch nicht gelaufen?)\n' >&2
  exit 1
fi
exec cat -- "$DATEI"
