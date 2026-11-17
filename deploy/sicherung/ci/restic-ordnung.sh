#!/usr/bin/env bash
# NUR CI: restic-Wrapper, der die ECHTEN Daten von `restic snapshots` in einer anderen
# Reihenfolge ausgibt (ORDNUNG_FILTER = jq-Ausdruck, z. B. "sort_by(.time)|reverse").
# Alles andere geht unverändert an das echte restic. Belegt, dass die Probe neuester und
# ältester Snapshot über das Feld "time" bestimmt, nicht über die Ausgabereihenfolge.
set -o pipefail
if [[ "${1:-}" == "snapshots" && -n "${ORDNUNG_FILTER:-}" ]]; then
  restic "$@" | jq -c "$ORDNUNG_FILTER"
  exit $?
fi
exec restic "$@"
