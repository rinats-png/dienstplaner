#!/usr/bin/env bash
# ===========================================================================
# ZUGÄNGE ANLEGEN
#
# Legt in einem Zug an — und nur, was noch fehlt:
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
# Warum das Skript wiederholbar sein muss
#
# Es ist einmal zweimal gelaufen. Danach standen alle drei Demobetriebe
# doppelt auf der Startseite, es gab zwei Betreibercodes und zwei
# Testbetriebe — und die Ausgabedatei des ersten Laufs war vom zweiten
# überschrieben, die ersten Codes damit verloren.
#
# Jetzt fragt das Skript vor jedem Schritt nach, was es schon gibt
# (GET /einrichten/uebersicht), überspringt Vorhandenes und meldet das.
# Ausgabedateien tragen die Uhrzeit und werden nie überschrieben. Ein
# zweiter Lauf legt nichts an, ein dritter auch nicht.
#
# Der Server hält zusätzlich dagegen: Ein zweiter aktiver Demozugang für
# denselben Betrieb und dieselbe Rolle wird mit 409 abgewiesen.
#
# ---------------------------------------------------------------------------
# Warum der Demoraum „demo-schau" heißen muss
#
# `/api/demo` lässt einen Zugang ohne Code nur dann durch, wenn sein Raum mit
# `demo-` beginnt (siehe server/funktionen/daten.mjs). Der Raumname trägt die
# Absicht — ein versehentlich als Demo gekennzeichneter Zugang auf einen
# echten Betrieb wäre sonst öffentlich.
# ===========================================================================

set -euo pipefail

SITE="${SITE:-https://app.centric-dienstplanung.de}"
RAUM="${RAUM:-demo-schau}"
TESTBETRIEB="${TESTBETRIEB:-Eigener Testbetrieb}"
AUSGABE="${AUSGABE:-zugaenge-$(date +%Y-%m-%d-%H%M%S).txt}"

if [ -z "${CENTRIC_ADMIN:-}" ]; then
  echo "CENTRIC_ADMIN ist nicht gesetzt." >&2
  echo "Der Wert steht in den Umgebungsvariablen des Containers (deploy/compose.yml)." >&2
  exit 1
fi

for werkzeug in curl jq; do
  if ! command -v "$werkzeug" >/dev/null 2>&1; then
    echo "$werkzeug fehlt. Bitte installieren (apt install $werkzeug)." >&2
    exit 1
  fi
done

# Die Ausgabedatei wird nie überschrieben — nicht einmal mit Absicht.
if [ -e "$AUSGABE" ]; then
  echo "$AUSGABE gibt es schon. Bitte AUSGABE anders setzen oder die Datei wegräumen." >&2
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
  code=$(printf '%s' "$antwort" | jq -r '.zugangscode // empty')
  if [ -z "$code" ]; then
    echo "FEHLGESCHLAGEN: $beschreibung" >&2
    printf '%s\n' "$antwort" >&2
    exit 1
  fi
  printf '%s' "$code"
}

# --------------------------------------------------------------------------
# Was gibt es schon?
#
# Eine Abfrage für alles: Zugänge des Demoraums und die Liste der
# Selbststarts. Ohne Codes, ohne Prüfsummen — nur das, was zum Vergleich
# nötig ist.
# --------------------------------------------------------------------------
UEBERSICHT=$(curl -sS "$SITE/einrichten/uebersicht?bestand=$RAUM" \
  -H "authorization: Bearer $CENTRIC_ADMIN")
if ! printf '%s' "$UEBERSICHT" | jq -e '.zugaenge' >/dev/null 2>&1; then
  echo "FEHLGESCHLAGEN: Übersicht von $SITE nicht lesbar." >&2
  printf '%s\n' "$UEBERSICHT" >&2
  exit 1
fi

# Aktive Zugänge einer Rolle im Raum — Anzahl.
aktive() {                     # rolle  [jq-Zusatzfilter]
  printf '%s' "$UEBERSICHT" | jq "[.zugaenge[] | select(.gesperrt == false and .rolle == \"$1\" ${2:-})] | length"
}

ANGELEGT=0
UEBERSPRUNGEN=0
angelegt() { ANGELEGT=$((ANGELEGT + 1)); echo "   angelegt: $1"; }
uebersprungen() { UEBERSPRUNGEN=$((UEBERSPRUNGEN + 1)); echo "   vorhanden, übersprungen: $1"; }

umask 077
set -o noclobber   # und auch die Schale selbst überschreibt nichts
{
  echo "CENTRIC — Zugänge, angelegt am $(date '+%Y-%m-%d %H:%M')"
  echo "Site: $SITE"
  echo
  echo "Jeder Code erscheint nur einmal. Gespeichert ist auf dem Server nur"
  echo "seine Prüfsumme; verloren heißt verloren."
  echo
} > "$AUSGABE"
chmod 600 "$AUSGABE"

# --------------------------------------------------------------------------
# 1. Betreiberkonsole
#
# Sie zeigt die Mandanten des angegebenen Raums plus — aus einem eigenen,
# raumübergreifenden Vermerk — alle Selbststarts. Ein Betreiberzugang ist
# nie ein Demozugang: /api/demos filtert die Rolle heraus, und /api/demo
# weist sie zurück.
# --------------------------------------------------------------------------
echo "→ Betreiberzugang"
if [ "$(aktive betreiber)" -gt 0 ]; then
  uebersprungen "Betreiberzugang ($(aktive betreiber) aktiv)"
  {
    echo "BETREIBERKONSOLE"
    echo "  bereits vorhanden — kein neuer Code. Der bestehende Code gilt weiter."
    echo
  } >> "$AUSGABE"
else
  ANTWORT=$(einrichten "{\"name\":\"Betreiberkonsole\",\"bestand\":\"$RAUM\",\"rolle\":\"betreiber\",\"demo\":false}")
  BETREIBER=$(code_aus "$ANTWORT" "Betreiberzugang")
  angelegt "Betreiberzugang"
  {
    echo "BETREIBERKONSOLE"
    echo "  Code:  $BETREIBER"
    echo "  Raum:  $RAUM"
    echo "  Weg:   $SITE → Code eingeben"
    echo
  } >> "$AUSGABE"
fi

# --------------------------------------------------------------------------
# 2. Die drei Demobetriebe
#
# Alle drei liegen im selben Raum und unterscheiden sich durch den Index in
# `mandanten` — so ist es in startbestand() angelegt:
#   0 Nordwacht Sicherheitsdienste (Sicherheit, 16 Personen, Rufbereitschaft)
#   1 Seniorenzentrum Lindenhof    (Pflege, 13 Personen, TVöD-Wochenstunden)
#   2 Steinbach Fertigung          (Produktion, 11 Personen, Testbetrieb)
#
# Vorhanden heißt: ein aktiver Demozugang mit demselben Betriebsindex und
# derselben Rolle. Der Name spielt keine Rolle — er ist Anzeige, nicht
# Schlüssel.
# --------------------------------------------------------------------------
demo() {                       # index  name  gruppe  hinweis
  echo "→ Demobetrieb: $2"
  if [ "$(aktive leitung "and .demo == true and .betrieb == $1")" -gt 0 ]; then
    uebersprungen "Demobetrieb $2"
    {
      echo "DEMO — $2"
      echo "  bereits vorhanden — kein neuer Code."
      echo
    } >> "$AUSGABE"
    return
  fi
  local antwort code
  antwort=$(einrichten "{\"name\":\"$2\",\"bestand\":\"$RAUM\",\"rolle\":\"leitung\",\"betrieb\":$1,\"demo\":true,\"gruppe\":\"$3\",\"hinweis\":\"$4\"}")
  code=$(code_aus "$antwort" "Demobetrieb $2")
  angelegt "Demobetrieb $2"
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
#
# /starten kennt keine Eindeutigkeit — jeder Aufruf ist ein neuer Raum mit
# Zufallsanhang. Vorhanden heißt deshalb: ein Selbststart mit diesem Namen,
# dessen Testzeitraum noch läuft.
# --------------------------------------------------------------------------
echo "→ Leerer Testbetrieb"
VORHANDEN=$(printf '%s' "$UEBERSICHT" \
  | jq -r --arg n "$TESTBETRIEB" '[.selbststarts[] | select(.name == $n and .abgelaufen == false)] | map(.raum) | join(", ")')
if [ -n "$VORHANDEN" ]; then
  uebersprungen "Testbetrieb ($VORHANDEN)"
  {
    echo "LEERER TESTBETRIEB — ohne jede Beispieldaten"
    echo "  bereits vorhanden: $VORHANDEN — kein neuer Betrieb, keine neuen Codes."
    echo
  } >> "$AUSGABE"
else
  START=$(curl -sS -X POST "$SITE/starten" \
    -H "content-type: application/json" \
    -d "$(jq -cn --arg n "$TESTBETRIEB" '{name: $n, branche: "sonstige", land: "HE", rollen: ["mitarbeiter"]}')")

  if ! printf '%s' "$START" | jq -e '.ok == true' >/dev/null 2>&1; then
    echo "FEHLGESCHLAGEN: Testbetrieb" >&2
    printf '%s\n' "$START" >&2
    exit 1
  fi
  angelegt "Testbetrieb $(printf '%s' "$START" | jq -r '.raum')"
  {
    echo "LEERER TESTBETRIEB — ohne jede Beispieldaten"
    printf '%s' "$START" | jq -r '.zugaenge[] | "  Rolle: \(.rolle)\n  Code:  \(.code)"'
    printf '%s' "$START" | jq -r '"  Raum:  \(.raum)\n  Läuft ab: \(.laeuftAb)"'
    echo
  } >> "$AUSGABE"
fi

{
  echo "Ergebnis: $ANGELEGT angelegt, $UEBERSPRUNGEN übersprungen."
} >> "$AUSGABE"

echo
echo "Fertig: $ANGELEGT angelegt, $UEBERSPRUNGEN übersprungen. Alle Codes stehen in: $AUSGABE"
echo
if [ "$ANGELEGT" -gt 0 ]; then
  echo "Noch zu tun:"
  echo "  1. $AUSGABE an einen sicheren Ort, dann löschen."
  echo "  2. Mit dem Betreibercode ein benanntes Verwalterkonto anlegen"
  echo "     (BEREITSTELLUNG.md, Schritt 5.1), danach CENTRIC_ADMIN entfernen."
fi
