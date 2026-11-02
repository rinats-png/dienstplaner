# shellcheck shell=bash
# =====================================================================
#  Gemeinsame Bausteine für digest-pruefen.sh, ruecksprung.sh und
#  abschalten.sh. Wird nur eingebunden (source), nie direkt ausgeführt.
#
#  Einstellbar über die Umgebung (Vorgaben für den VPS in Klammern):
#    CENTRIC_VERZ          Verzeichnis mit compose.yml und .env
#                          (Verzeichnis dieses Skripts)
#    CENTRIC_FREIGABEN     Freigabeliste ($CENTRIC_VERZ/FREIGEGEBENE-IMAGES.md)
#    CENTRIC_BILD_REPO     (ghcr.io/rinats-png/dienstplaner)
#    CENTRIC_DIENST        Compose-Dienst = Containername (centric-dp-web)
#    CENTRIC_PROTOKOLL     ($CENTRIC_VERZ/betrieb-protokoll.log)
# =====================================================================

FREIGABE_SKRIPT_VERZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CENTRIC_VERZ="${CENTRIC_VERZ:-$FREIGABE_SKRIPT_VERZ}"
CENTRIC_FREIGABEN="${CENTRIC_FREIGABEN:-$CENTRIC_VERZ/FREIGEGEBENE-IMAGES.md}"
CENTRIC_BILD_REPO="${CENTRIC_BILD_REPO:-ghcr.io/rinats-png/dienstplaner}"
CENTRIC_DIENST="${CENTRIC_DIENST:-centric-dp-web}"
CENTRIC_PROTOKOLL="${CENTRIC_PROTOKOLL:-$CENTRIC_VERZ/betrieb-protokoll.log}"

R0_HINWEIS="Fehlerstrategie R0: Dienst anhalten mit ./abschalten.sh (erst ./abschalten.sh --trocken)."

fehler() { printf 'FEHLER: %s\n' "$*" >&2; }
hinweis() { printf '%s\n' "$*"; }
warnung() { printf 'WARNUNG: %s\n' "$*" >&2; }

jetzt_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Eine Zeile ans Protokoll anhängen (Zeit, Skript, Text).
protokoll() {
  local zeile
  zeile="$(jetzt_utc) $(basename "$0") $*"
  printf '%s\n' "$zeile" >>"$CENTRIC_PROTOKOLL" || warnung "Protokoll $CENTRIC_PROTOKOLL nicht beschreibbar"
}

digest_format_ok() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]
}

# Gibt die Tabellenzeilen der Freigabeliste als Tab-getrennte Felder aus:
#   digest  commit  datum  bericht  status  grund
# Leere Zellen erscheinen als "-".
# Nur Zeilen, deren erste Zelle mit `sha256: beginnt, zählen.
freigaben_lesen() {
  if [[ ! -r "$CENTRIC_FREIGABEN" ]]; then
    fehler "Freigabeliste nicht lesbar: $CENTRIC_FREIGABEN"
    return 1
  fi
  awk -F'|' '
    /^\|[[:space:]]*`sha256:/ {
      for (i = 2; i <= 7; i++) {
        f = $i
        gsub(/`/, "", f)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", f)
        if (f == "") f = "-"   # leere Zelle: Platzhalter, sonst verrutschen die Felder
        feld[i] = f
      }
      printf "%s\t%s\t%s\t%s\t%s\t%s\n", feld[2], feld[3], feld[4], feld[5], feld[6], feld[7]
    }
  ' "$CENTRIC_FREIGABEN"
}

# Prüft die Liste selbst: gültige Status, höchstens ein aktiv/vorherig,
# volle Digests und Commits außer bei gesperrt, Grund bei gesperrt.
freigaben_pruefen() {
  local digest commit datum bericht status grund aktiv=0 vorherig=0 ok=0
  if [[ ! -r "$CENTRIC_FREIGABEN" ]]; then
    fehler "Freigabeliste nicht lesbar: $CENTRIC_FREIGABEN"
    return 1
  fi
  while IFS=$'\t' read -r digest commit datum bericht status grund; do
    case "$status" in
      aktiv) aktiv=$((aktiv + 1)) ;;
      vorherig) vorherig=$((vorherig + 1)) ;;
      gesperrt)
        if [[ ! "$digest" =~ ^sha256:[0-9a-f]{8,64}$ ]]; then
          fehler "Freigabeliste: ungültiger Digest/Präfix bei gesperrt: $digest"; ok=1
        fi
        if [[ "$grund" == "-" ]]; then
          fehler "Freigabeliste: gesperrt ohne Grund: $digest"; ok=1
        fi
        continue ;;
      *) fehler "Freigabeliste: unbekannter Status '$status' bei $digest"; ok=1; continue ;;
    esac
    if ! digest_format_ok "$digest"; then
      fehler "Freigabeliste: ungültiger Digest bei Status $status: $digest"; ok=1
    fi
    if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
      fehler "Freigabeliste: Commit muss 40 Hex-Zeichen haben: $digest -> $commit"; ok=1
    fi
  done < <(freigaben_lesen)
  if ((aktiv > 1)); then fehler "Freigabeliste: mehr als ein Eintrag aktiv"; ok=1; fi
  if ((vorherig > 1)); then fehler "Freigabeliste: mehr als ein Eintrag vorherig"; ok=1; fi
  return "$ok"
}

# Gibt den Sperrgrund aus und liefert 0, wenn der Wert (Digest oder Bild-ID)
# zu einem gesperrten Eintrag gehört (auch per Präfix).
gesperrt_grund() {
  local wert="$1" digest commit datum bericht status grund
  [[ -n "$wert" ]] || return 1
  while IFS=$'\t' read -r digest commit datum bericht status grund; do
    [[ "$status" == "gesperrt" ]] || continue
    if [[ "$wert" == "$digest"* ]]; then
      printf '%s (Eintrag %s, Commit %s)\n' "$grund" "$digest" "$commit"
      return 0
    fi
  done < <(freigaben_lesen)
  return 1
}

# Gibt die Felder des exakten Eintrags aus (Tab-getrennt) oder liefert 1.
eintrag_zu_digest() {
  local wert="$1" digest rest
  while IFS=$'\t' read -r digest rest; do
    if [[ "$digest" == "$wert" ]]; then
      printf '%s\t%s\n' "$digest" "$rest"
      return 0
    fi
  done < <(freigaben_lesen)
  return 1
}

# Gibt alle Digests mit dem Status $1 aus (eine Zeile je Treffer).
digests_mit_status() {
  local gesucht="$1" digest commit datum bericht status grund
  while IFS=$'\t' read -r digest commit datum bericht status grund; do
    [[ "$status" == "$gesucht" ]] && printf '%s\n' "$digest"
  done < <(freigaben_lesen)
  return 0
}

# Wert einer Variable aus einer .env-Datei (letzte Zuweisung gilt), ohne sie
# auszuführen. Anführungszeichen außen werden entfernt.
env_wert() {
  local datei="$1" name="$2"
  [[ -r "$datei" ]] || return 0
  awk -v n="$name" '
    /^[[:space:]]*#/ { next }
    {
      zeile = $0
      sub(/^[[:space:]]*(export[[:space:]]+)?/, "", zeile)
      if (index(zeile, n "=") == 1) {
        w = substr(zeile, length(n) + 2)
        gsub(/^["\047]|["\047][[:space:]]*$/, "", w)
        sub(/[[:space:]]+$/, "", w)
        wert = w
      }
    }
    END { if (wert != "") print wert }
  ' "$datei"
}

# Bild-ID eines lokal vorhandenen Bilds, leer wenn nicht vorhanden.
bild_id() {
  docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true
}

compose() {
  docker compose --project-directory "$CENTRIC_VERZ" -f "$CENTRIC_VERZ/compose.yml" "$@"
}
