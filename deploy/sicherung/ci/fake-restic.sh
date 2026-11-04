#!/usr/bin/env bash
# NUR CI: restic-Wrapper für Fehler- und Zeitgrenzen-Proben.
# FAKE_BEFEHL=<backup|forget|check|…> mit FAKE_RESTIC=fehler (Exit 1)
# oder FAKE_RESTIC=haengt (schläft); alles andere geht an das echte restic.
if [[ -n "${FAKE_BEFEHL:-}" && "${1:-}" == "$FAKE_BEFEHL" ]]; then
  case "${FAKE_RESTIC:-}" in
    fehler)
      echo "fake-restic: $1 schlägt absichtlich fehl" >&2
      exit 1
      ;;
    haengt) exec sleep 600 ;;
  esac
fi
exec restic "$@"
