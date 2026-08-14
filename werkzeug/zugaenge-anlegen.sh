#!/usr/bin/env bash
# ===========================================================================
# ZUGÄNGE ANLEGEN
#
# Legt in einem Zug an:
#
#   1. einen Betreiberzugang für die Konsole
#   2. drei Demobetriebe, die auf der Anmeldeseite ohne Code offenstehen
#   3. einen leeren Testbetrieb ohne jede Beispieldaten
#
# Das Skript ist absichtlich nicht Teil der Anwendung. Es ruft nur die
# Schnittstellen auf, die es ohnehin gibt, und schreibt die zurückgegebenen
# Codes in eine Datei — sie erscheinen jeweils genau einmal.
#
# Aufruf:
#
#     CENTRIC_ADMIN='<Wert aus den Umgebungsvariablen>' \
#       werkzeug/zugaenge-anlegen.sh
#
# ---------------------------------------------------------------------------
# Warum der Demoraum „demo-schau" heißen muss
#
# `/api/demo` lässt einen Zugang ohne Code nur dann durch, wenn sein Raum mit
# `demo-` beginnt (siehe netlify/functions/daten.mjs). Der Raumname trägt die
# Absicht — ein versehentlich als Demo gekennzeichneter Zugang auf einen
# echten Betrieb wäre sonst öffentlich.
# ===========================================================================

set -euo pipefail

SITE="${SITE:-https://centric-dienstplanung.netlify.app}"
RAUM="${RAUM:-demo-schau}"
AUSGABE="${AUSGABE:-zugaenge-$(date +%Y-%m-%d).txt}"

if [ -z "${CENTRIC_ADMIN:-}" ]; then
  echo "CENTRIC_ADMIN ist nicht gesetzt." >&2
  echo "Der Wert steht in Netlify unter Site configuration → Environment variables." >&2
  exit 1
fi

# Ein Aufruf gegen /einrichten. Gibt die rohe Antwort aus.
einrichten() {
  curl -sS -X POST "$SITE/einrichten" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $CENTRIC_ADMIN" \
    -d "$1"
}

# Holt den Zugangscode aus der Antwort — oder bricht mit der Fehlermeldung ab.
code_aus() {
  local antwort="$1" beschreibung="$2"
  local code
  code=$(printf '%s' "$antwort" | sed -n 's/.*"zugangscode":"\([^"]*\)".*/\1/p')
  if [ -z "$code" ]; then
    echo "FEHLGESCHLAGEN: $beschreibung" >&2
    printf '%s\n' "$antwort" >&2
    exit 1
  fi
  printf '%s' "$code"
}

: > "$AUSGABE"
chmod 600 "$AUSGABE"

{
  echo "CENTRIC — Zugänge, angelegt am $(date '+%Y-%m-%d %H:%M')"
  echo "Site: $SITE"
  echo
  echo "Jeder Code erscheint nur einmal. Gespeichert ist auf dem Server nur"
  echo "seine Prüfsumme; verloren heißt verloren."
  echo
} >> "$AUSGABE"

# --------------------------------------------------------------------------
# 1. Betreiberkonsole
#
# Sie zeigt die Mandanten des angegebenen Raums plus — aus einem eigenen,
# raumübergreifenden Vermerk — alle Selbststarts. Ein Betreiberzugang ist
# nie ein Demozugang: /api/demos filtert die Rolle heraus, und /api/demo
# weist sie zurück.
# --------------------------------------------------------------------------
echo "→ Betreiberzugang"
ANTWORT=$(einrichten "{\"name\":\"Betreiberkonsole\",\"bestand\":\"$RAUM\",\"rolle\":\"betreiber\",\"demo\":false}")
BETREIBER=$(code_aus "$ANTWORT" "Betreiberzugang")
{
  echo "BETREIBERKONSOLE"
  echo "  Code:  $BETREIBER"
  echo "  Raum:  $RAUM"
  echo "  Weg:   $SITE → Code eingeben"
  echo
} >> "$AUSGABE"

# --------------------------------------------------------------------------
# 2. Die drei Demobetriebe
#
# Alle drei liegen im selben Raum und unterscheiden sich durch den Index in
# `mandanten` — so ist es in startbestand() angelegt:
#   0 Nordwacht Sicherheitsdienste (Sicherheit, 16 Personen, Rufbereitschaft)
#   1 Seniorenzentrum Lindenhof    (Pflege, 13 Personen, TVöD-Wochenstunden)
#   2 Steinbach Fertigung          (Produktion, 11 Personen, Testbetrieb)
# --------------------------------------------------------------------------
demo() {                       # index  name  gruppe  hinweis
  echo "→ Demobetrieb: $2"
  local antwort code
  antwort=$(einrichten "{\"name\":\"$2\",\"bestand\":\"$RAUM\",\"rolle\":\"leitung\",\"betrieb\":$1,\"demo\":true,\"gruppe\":\"$3\",\"hinweis\":\"$4\"}")
  code=$(code_aus "$antwort" "Demobetrieb $2")
  {
    echo "DEMO — $2"
    echo "  Code:  $code   (wird auf der Anmeldeseite nicht gebraucht)"
    echo "  Zeigt: $4"
    echo
  } >> "$AUSGABE"
}

demo 0 "Nordwacht Sicherheitsdienste" "Sicherheitsdienst" \
  "Zwei Standorte, Rufbereitschaft, Sachkunde nach 34a GewO"
demo 1 "Seniorenzentrum Lindenhof" "Pflege" \
  "Drei Wohnbereiche, Pflegefachkraftquote, Wechselschicht"
demo 2 "Steinbach Fertigung" "Produktion" \
  "Vollkonti im Werk, Staplerschein mit Ablaufdatum"

# --------------------------------------------------------------------------
# 3. Der leere Testbetrieb
#
# Über /starten statt /einrichten. Der Unterschied ist genau der, um den es
# hier geht: /starten legt den Betrieb mit baueLeerenBetrieb() an — kein
# Beispielpersonal, keine erfundenen Dienstpläne, nur Name, Branche und
# Bundesland. /einrichten legt nur einen Code an; der Betrieb dahinter würde
# beim ersten Öffnen mit den drei Beispielmandanten gefüllt.
# --------------------------------------------------------------------------
echo "→ Leerer Testbetrieb"
START=$(curl -sS -X POST "$SITE/starten" \
  -H "content-type: application/json" \
  -d '{"name":"Eigener Testbetrieb","branche":"sonstige","land":"HE","rollen":["mitarbeiter"]}')

if ! printf '%s' "$START" | grep -q '"ok":true'; then
  echo "FEHLGESCHLAGEN: Testbetrieb" >&2
  printf '%s\n' "$START" >&2
  exit 1
fi

{
  echo "LEERER TESTBETRIEB — ohne jede Beispieldaten"
  printf '%s' "$START" \
    | tr ',' '\n' \
    | sed -n 's/.*"rolle":"\([^"]*\)".*/  Rolle: \1/p;s/.*"code":"\([^"]*\)".*/  Code:  \1/p'
  printf '%s' "$START" | sed -n 's/.*"raum":"\([^"]*\)".*/  Raum:  \1/p'
  printf '%s' "$START" | sed -n 's/.*"laeuftAb":"\([^"]*\)".*/  Läuft ab: \1/p'
  echo
} >> "$AUSGABE"

echo
echo "Fertig. Alle Codes stehen in: $AUSGABE"
echo
echo "Noch zu tun:"
echo "  1. $AUSGABE an einen sicheren Ort, dann löschen."
echo "  2. Mit dem Betreibercode ein benanntes Verwalterkonto anlegen"
echo "     (BEREITSTELLUNG.md, Schritt 5.1), danach CENTRIC_ADMIN entfernen."
