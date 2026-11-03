#!/usr/bin/env bash
# NUR CI: docker-Wrapper für Fehler- und Zeitgrenzen-Proben.
# FAKE_DOCKER=pruefen-fehler  — Container-Aufruf mit „pruefen“ endet mit Exit 1
# FAKE_DOCKER=haengt-sichern  — „docker run … sichern“ hängt
# sonst: echtes docker.
if [[ "${FAKE_DOCKER:-}" == "pruefen-fehler" && " $* " == *" pruefen "* ]]; then
  echo "fake-docker: pruefen schlägt absichtlich fehl" >&2
  exit 1
fi
if [[ "${FAKE_DOCKER:-}" == "haengt-sichern" && "${1:-}" == "run" && " $* " == *" sichern "* ]]; then
  exec sleep 600
fi
exec docker "$@"
