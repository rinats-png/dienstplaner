#!/bin/bash
# CENTRIC - Hauptwebsite aus der Remotekonsole ausliefern (ein Einstieg, nur eine Rueckfrage: JA).
#   bash website-konsole.sh [archiv.tgz]
# Ablauf: Vorpruefung (rein lesend) -> Archiv beschaffen (lokal oder Download) -> sha256 gegen
# DIST-SHA256.txt -> Inhalt pruefen -> entpacken in frisches Temp-Verzeichnis -> Zusammenfassung ->
# JA tippen -> website-ausliefern.sh (Sicherung, Validierung, Rollback). Bis zum JA wird nichts geaendert.
set -Eeuo pipefail

SKRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STANDARD_ARCHIV="/root/centric-website-dist.tgz"
MAX_BYTES=20000000

ende() { echo "ABBRUCH: $*" >&2; echo "Nichts wurde geaendert." >&2; exit 1; }
echo "CENTRIC Website-Auslieferung (Konsole)"

ARCHIV_ARG="${1:-}"
case "$ARCHIV_ARG" in -*) ende "Unbekannte Option: $ARCHIV_ARG" ;; esac

# --- a) Vorpruefung (rein lesend)
echo "1/4 Vorpruefung ..."
VP_AUS="$(bash "$SKRIPT_DIR/website-vorpruefung.sh" 2>&1)" || { tail -n 15 <<< "$VP_AUS" >&2; ende "Vorpruefung nicht erfolgreich."; }
if grep -q "ABWEICHUNG" <<< "$VP_AUS" || ! grep -q "PASST ZUM BESTAETIGTEN STAND" <<< "$VP_AUS"; then
  grep -E "ABWEICHUNG|HINWEIS" <<< "$VP_AUS" >&2 || true
  ende "Vorpruefung: ABWEICHUNG vom bestaetigten Stand. Ausgabe melden."
fi
echo "    Vorpruefung: PASST"
grep -E "WARNUNG|HINWEIS" <<< "$VP_AUS" | sed 's/^ */    /' || true

# --- a2) Skriptstand (A1): Kopf-Hash des eigenen Repositorys. Der Betreiber gleicht den Kurz-Hash mit der
# Anweisung ab; JA gilt nur dann. Optional erzwingt ERWARTETER_KOPF=<hash oder Anfang> den Abgleich selbst.
KOPF="unbekannt (kein Git-Stand)"
if command -v git >/dev/null 2>&1; then
  TOP="$(git -C "$SKRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$TOP" ] && [ "$(cd "$TOP/deploy/website" 2>/dev/null && pwd -P)" = "$(cd "$SKRIPT_DIR" && pwd -P)" ]; then
    KOPF="$(git -C "$SKRIPT_DIR" rev-parse HEAD 2>/dev/null || echo unbekannt)"
    if [ -n "$(git -C "$SKRIPT_DIR" status --porcelain 2>/dev/null)" ]; then
      ende "Das Skript-Repository $TOP ist lokal veraendert (git status). Frisch klonen: rm -rf $TOP und den Klon-Befehl der Anweisung erneut ausfuehren."
    fi
  fi
fi
if [[ "$KOPF" =~ ^[0-9a-f]{40}$ ]]; then KOPF_KURZ="${KOPF:0:12}"; else KOPF_KURZ="$KOPF"; fi
echo "Skriptstand: $KOPF"
if [ -n "${ERWARTETER_KOPF:-}" ]; then
  [[ "$ERWARTETER_KOPF" =~ ^[0-9a-f]{7,40}$ ]] || ende "ERWARTETER_KOPF ist kein Git-Hash."
  case "$KOPF" in
    "$ERWARTETER_KOPF"*) echo "    Skriptstand stimmt mit ERWARTETER_KOPF ueberein." ;;
    *) ende "Skriptstand $KOPF stimmt nicht mit ERWARTETER_KOPF $ERWARTETER_KOPF ueberein." ;;
  esac
fi

# --- b) Soll-Pruefsumme und Quelle
SOLL=""
if [ -f "$SKRIPT_DIR/DIST-SHA256.txt" ]; then
  SOLL="$(grep -v '^[[:space:]]*#' "$SKRIPT_DIR/DIST-SHA256.txt" | awk 'NF {print $1; exit}' | tr 'A-F' 'a-f' || true)"
fi
[[ "$SOLL" =~ ^[0-9a-f]{64}$ ]] || ende "DIST-SHA256.txt enthaelt keine gueltige sha256-Summe."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/centric-konsole.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
ARCHIV="$WORK/dist.tgz"; ZIEL="$WORK/dist"
mkdir "$ZIEL"

echo "2/4 Archiv beschaffen ..."
if [ -n "$ARCHIV_ARG" ]; then
  [ -f "$ARCHIV_ARG" ] || ende "Archiv nicht gefunden: $ARCHIV_ARG"
  QUELLE_TXT="lokale Datei $ARCHIV_ARG"; cp "$ARCHIV_ARG" "$ARCHIV"
elif [ -f "$STANDARD_ARCHIV" ]; then
  QUELLE_TXT="lokale Datei $STANDARD_ARCHIV"; cp "$STANDARD_ARCHIV" "$ARCHIV"
else
  URL=""
  if [ -f "$SKRIPT_DIR/DIST-QUELLE.txt" ]; then
    URL="$(grep -v '^[[:space:]]*#' "$SKRIPT_DIR/DIST-QUELLE.txt" | awk 'NF {print $1; exit}' || true)"
  fi
  [ -n "$URL" ] || ende "Kein Archiv: weder $STANDARD_ARCHIV noch eine URL in DIST-QUELLE.txt."
  [[ "$URL" =~ ^https://[A-Za-z0-9._~:/?#@!%+=,-]+$ ]] || ende "Die Download-URL muss mit https:// beginnen (und darf keine Sonderzeichen enthalten)."
  [[ "$URL" =~ ^https://raw\.githubusercontent\.com/[^/?#@:]+ ]] || ende "Download nur von https://raw.githubusercontent.com/ erlaubt."
  command -v curl >/dev/null 2>&1 || ende "curl fehlt."
  curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --max-redirs 5 --max-filesize "$MAX_BYTES" --connect-timeout 20 --max-time 300 \
    --output "$ARCHIV" "$URL" || ende "Download fehlgeschlagen."
  QUELLE_TXT="Download $URL"
fi
[ -s "$ARCHIV" ] || ende "Archiv ist leer."
[ "$(wc -c < "$ARCHIV")" -le "$MAX_BYTES" ] || ende "Archiv ist groesser als $MAX_BYTES Bytes."

IST="$(sha256sum "$ARCHIV" | awk '{print $1}')"
[ "$IST" = "$SOLL" ] || ende "Pruefsumme stimmt nicht. Soll $SOLL, ist $IST."

echo "3/4 Inhalt pruefen und entpacken ..."
LISTE_V="$WORK/liste-v.txt"; LISTE_N="$WORK/liste-n.txt"
tar -tvzf "$ARCHIV" > "$LISTE_V" 2>/dev/null || ende "Archiv nicht lesbar."
tar -tzf "$ARCHIV" > "$LISTE_N" 2>/dev/null || ende "Archiv nicht lesbar."
[ -s "$LISTE_N" ] || ende "Archiv ist leer."
if awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {f=1} END {exit !f}' "$LISTE_V"; then ende "Archiv enthaelt Links, Geraete oder Sonderdateien."; fi
if grep -q -E '^/|(^|/)\.\.(/|$)' "$LISTE_N"; then ende "Archiv enthaelt absolute Pfade oder '..'."; fi
tar -xzf "$ARCHIV" -C "$ZIEL" --no-same-owner || ende "Entpacken fehlgeschlagen."
[ -z "$(find "$ZIEL" -type l -print -quit)" ] || ende "Entpacktes Archiv enthaelt Links."
[ -f "$ZIEL/index.html" ] && [ -f "$ZIEL/404.html" ] || ende "index.html oder 404.html fehlt im Archiv."
ANZAHL="$(find "$ZIEL" -type f | wc -l | tr -d ' ')"

# --- c) Zusammenfassung und Bestaetigung
SITES="${SITES_DIR_HOST:-/opt/proxy/sites}"
echo ""
echo "Zusammenfassung:"
echo "  Quelle:     $QUELLE_TXT"
echo "  sha256:     $IST (stimmt mit DIST-SHA256.txt)"
echo "  Dateien:    $ANZAHL"
echo "  Geaendert:  nur $SITES/centric-dienstplanung.de.caddy und $SITES/centric-website/"
echo "  Sicherung und Rollback automatisch; die App-Datei bleibt unberuehrt."
echo "  Skriptstand: $KOPF_KURZ"
if getent ahosts "www.centric-dienstplanung.de" >/dev/null 2>&1; then
  echo "  www:        DNS-Eintrag vorhanden - Weiterleitung auf die Hauptdomain wird eingerichtet."
else
  echo "  www:        noch kein DNS-Eintrag - Weiterleitung wird weggelassen (spaeter wiederholen)."
fi
echo "Vergleichen Sie den Skriptstand ($KOPF_KURZ) mit dem Kurz-Hash in der Anweisung. Stimmt er nicht, NICHT bestaetigen."
printf 'JA gilt nur bei uebereinstimmendem Skriptstand. Zum Ausliefern JA eintippen (alles andere bricht ab): '
ANTWORT=""
read -r ANTWORT || true
echo ""
[ "$ANTWORT" = "JA" ] || ende "Keine Bestaetigung (JA)."

# --- d) Ausliefern
echo "4/4 Ausliefern ..."
bash "$SKRIPT_DIR/website-ausliefern.sh" "$ZIEL" || { echo "FEHLER beim Ausliefern; siehe Meldungen oben (Rollback erfolgte automatisch)." >&2; exit 1; }
echo ""
echo "FERTIG. Kontrolle (von aussen):"
echo "  curl -sI https://centric-dienstplanung.de        (HTTP 200)"
echo "  curl -sI https://app.centric-dienstplanung.de    (HTTP 200)"
echo "  curl -sI https://centric-dienstplanung.de/x      (HTTP 404, und auch hier die Sicherheits-Kopfzeilen: Strict-Transport-Security, X-Content-Type-Options, Content-Security-Policy)"
if ! getent ahosts "www.centric-dienstplanung.de" >/dev/null 2>&1; then
  echo "www hat noch keinen DNS-Eintrag - nach dem Eintrag diesen Befehl erneut ausfuehren: bash $SKRIPT_DIR/website-konsole.sh"
fi
echo "Rueckweg: bash $SKRIPT_DIR/website-zurueck.sh"
