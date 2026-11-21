#!/bin/bash
# =====================================================================
#  inventur-install.sh — REL-0: richtet AUSSCHLIESSLICH den geprüften
#  Inventurzugang ein (Variante A, Forced Command beim Besitzerkonto des
#  Betriebsverzeichnisses). Anleitung: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md,
#  Abschnitt „Einrichtung mit einem Befehl (REL-0-Installer)“.
#
#  Aufruf (als root, IONOS-Remotekonsole):
#    bash inventur-install.sh              einrichten
#    bash inventur-install.sh --trocken    nur alle Vorabprüfungen, ändert nichts
#    bash inventur-install.sh --rueckbau   Zeile und Skript entfernen (nur bei
#                                          Hash-Übereinstimmung mit der Sicherung)
#    bash inventur-install.sh --hilfe      Kurzhilfe
#
#  Was der Installer tut (nur nach bestandenen Vorabprüfungen):
#    1. Sicherung von authorized_keys nach /root/centric-inventur-backup-<zeit>/
#       (root:root 0700, Dateien 0600) mit Manifest für den Rückbau
#    2. eingebettetes inventur.sh (Hash geprüft) atomar (mktemp + mv) nach
#       /usr/local/sbin/centric-inventur.sh, root:root 0755
#    3. GENAU EINE Zeile an authorized_keys des Kontos anhängen (tee -a mit
#       den Rechten des Kontos über setpriv, nie als root):
#       command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA… inventur-centric
#    4. Selbstprüfung; scheitert sie, werden 2. und 3. zurückgenommen
#
#  Was der Installer NIE tut: bestehende Zeilen in authorized_keys ändern,
#  sshd-Konfiguration oder Dienste ändern (kein Neustart, kein reload),
#  Konten, Gruppen, sudoers oder Docker-Rechte ändern, Container berühren,
#  .env lesen, Netzwerk nutzen, Schlüsselkörper oder Geheimnisse ausgeben.
#
#  Nutzdaten (inventur.sh, öffentlicher Schlüssel) und ihre SHA-256-Werte
#  stehen im Block ERZEUGT; er wird nur von
#  werkzeug/inventur-install-bauen.mjs geschrieben (--pruefen in der CI).
#
#  Umgebung NUR für Prüfungen (pruefungen/inventur-install.test.js); die
#  Root-Konsole setzt sie nicht, bei einer SSH-Sitzung werden sie verworfen:
#    INVENTUR_INSTALL_PRUEFPFAD     ersetzt den festen PATH (Stubs)
#    INVENTUR_INSTALL_PRUEFWURZEL   Präfix für alle Systempfade (Testwurzel)
#
#  Rückgabe: 0 eingerichtet / bereits eingerichtet / trocken ok / rückgebaut
#            1 Abbruch, nichts geändert · 2 Aufruf
#            3 Fehler nach Änderung, Änderungen zurückgenommen
#            4 Fehler nach Änderung, Rücknahme unvollständig (Sicherung nutzen)
# =====================================================================
set -euo pipefail
umask 077
export LC_ALL=C
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  unset INVENTUR_INSTALL_PRUEFPFAD INVENTUR_INSTALL_PRUEFWURZEL
fi
PATH="${INVENTUR_INSTALL_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

readonly VERSION=1
readonly W="${INVENTUR_INSTALL_PRUEFWURZEL:-}"
readonly ERWARTET_KONTO=admin
readonly ERWARTET_UID=1000
readonly VERZ_LOGISCH=/opt/apps/centric-dienstplanung
readonly ZIEL_LOGISCH=/usr/local/sbin/centric-inventur.sh
readonly KOMMENTAR=inventur-centric
readonly OPTIONEN='command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc'
readonly MIN_FREI_KIB=1024
readonly FESTER_PFAD=/usr/sbin:/usr/bin:/sbin:/bin

# >>> ERZEUGT von werkzeug/inventur-install-bauen.mjs – nicht von Hand ändern >>>
readonly SOLL_SKRIPT_SHA256='d99207298c121d8af32f7d4bfcf048e6f8f47951305741753d8b5493ff533c21'
readonly SOLL_SCHLUESSEL_SHA256=''
readonly SOLL_FINGERABDRUCK=''
readonly SCHLUESSEL_ZEILE=''
nutzdaten_skript() {
  cat <<'CENTRIC_INVENTUR_NUTZDATEN_ENDE'
#!/bin/bash
# =====================================================================
#  inventur.sh — LESENDE Produktionsinventur des VPS (REL-0)
#
#  Führt V-1 bis V-9 aus docs/acc45/PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md
#  §2.1 aus, dazu R-1 (Ressourcen) und R-2 (Mounts, Compose-Projektpfad).
#  Einrichtung und Sicherheitsnachweis: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md.
#
#  Ablage auf dem VPS: /usr/local/sbin/centric-inventur.sh (root:root 0755,
#  Verzeichnis root-eigen) — NICHT im Betriebsverzeichnis, das dem Konto
#  gehört.
#
#  Aufruf:
#    centric-inventur.sh            Inventur auf stdout
#    centric-inventur.sh --hilfe    Kurzhilfe
#  Als Forced Command (authorized_keys):
#    command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA… inventur-centric
#    SSH_ORIGINAL_COMMAND muss fehlen, leer oder genau „inventur“ sein.
#    Jeder andere Wert (auch scp/sftp/rsync, „inventur; id“, „INVENTUR“,
#    „inventur “) → Rückgabe 2, bevor irgendein Abschnitt läuft.
#
#  Schicht 1 (Quelle, maßgeblich): jeder Abschnitt liest nur Namen, Status,
#  Prüfsummen und Metadaten. Aus der .env nur Schlüsselnamen (env_namen),
#  nie Werte; Fehlertexte von docker compose werden verworfen, weil sie
#  .env-Zeilen enthalten können. Betriebsprotokoll nur Zeit, Skript,
#  Ereignisname. authorized_keys nur Optionen, Typ, Fingerabdruck.
#  Schicht 2 (nur zusätzlich): maskieren() über die gesamte Ausgabe.
#
#  Was das Skript NIE tut: docker pull/up/run/rm/rmi/tag/restart/stop/kill,
#  compose up/down, Dateien anlegen, ändern oder löschen. Einziger docker
#  exec: der feste /gesund-Aufruf im App-Container (V-9; /gesund legt im
#  Container die Probe data/.gesund an, siehe §2.1 V-9).
#
#  Härtung: fester PATH, BASH_ENV/ENV entfernt, umask 077, LC_ALL=C,
#  Shebang /bin/bash (kein env-Suchpfad).
#
#  Umgebung NUR für Prüfungen (sshd mit PermitUserEnvironment no und
#  AcceptEnv LANG LC_*, systemd und cron setzen sie nicht):
#    INVENTUR_PRUEFPFAD     ersetzt den festen PATH (Docker-Stub)
#    INVENTUR_MASKE=aus     schaltet Schicht 2 ab (Nachweis Schicht 1)
#    CENTRIC_VERZ          (/opt/apps/centric-dienstplanung)
#    CENTRIC_DIENST        (centric-dp-web)
#    CENTRIC_BILD_REPO     (ghcr.io/rinats-png/dienstplaner)
#    CENTRIC_KONTO_HOME    Heimatverzeichnis des Besitzers von CENTRIC_VERZ
#                          (aus getent; sonst $HOME)
#    CENTRIC_HOME_WURZEL   (/home) weitere authorized_keys (nur lesbare)
#    CENTRIC_ZEITGRENZE    (30) Sekunden je Docker-Aufruf
#  Bei einer SSH-Sitzung (SSH_CONNECTION gesetzt) werden alle diese
#  Variablen verworfen; dort gelten immer die festen Vorgaben.
#
#  Symbolische Links: Dateien, die das Konto kontrolliert
#  (letzte-erfolgreiche.json, betrieb-protokoll.log, authorized_keys,
#  Betriebsdateien für Prüfsummen), werden nur gelesen, wenn sie keine
#  Links sind.
#
#  Rückgabe: 0 alle Abschnitte gelaufen · 1 mindestens ein Abschnitt
#  gescheitert (Ausgabe trotzdem vollständig) · 2 Aufruf/abgewiesen
#  Prüfung: pruefungen/inventur-skript.test.js
# =====================================================================
# Die Abschnittsfunktionen (v1 … r2, v_kopf) laufen nur indirekt über
# abschnitt "<name>" <funktion>; shellcheck erkennt das nicht.
# shellcheck disable=SC2329
set -euo pipefail
umask 077
export LC_ALL=C
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  unset INVENTUR_PRUEFPFAD INVENTUR_MASKE CENTRIC_VERZ CENTRIC_DIENST CENTRIC_BILD_REPO \
    CENTRIC_KONTO_HOME CENTRIC_HOME_WURZEL CENTRIC_ZEITGRENZE
fi
PATH="${INVENTUR_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

# Forced Command: nur „inventur“ oder kein Befehl. Alles andere abweisen,
# bevor irgendetwas anderes geschieht.
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" && "${SSH_ORIGINAL_COMMAND}" != "inventur" ]]; then
  printf 'abgewiesen: nur der Befehl "inventur" ist erlaubt\n' >&2
  exit 2
fi

VERZ="${CENTRIC_VERZ:-/opt/apps/centric-dienstplanung}"
DIENST="${CENTRIC_DIENST:-centric-dp-web}"
BILD_REPO="${CENTRIC_BILD_REPO:-ghcr.io/rinats-png/dienstplaner}"
HOME_WURZEL="${CENTRIC_HOME_WURZEL:-/home}"
ZEITGRENZE="${CENTRIC_ZEITGRENZE:-30}"

hilfe() {
  printf '%s\n' \
    "Aufruf: $0 [--hilfe]" \
    "Lesende Produktionsinventur (V-1 bis V-9, R-1, R-2)." \
    "Als Forced Command ist nur der Befehl 'inventur' erlaubt." \
    "Anleitung: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md"
}

case "$#:${1:-}" in
  0:) ;;
  1:--hilfe | 1:-h) hilfe; exit 0 ;;
  *) hilfe >&2; exit 2 ;;
esac

[[ "$ZEITGRENZE" =~ ^[1-9][0-9]{0,2}$ ]] || ZEITGRENZE=30

# --- Hilfen -------------------------------------------------------------
hat() { command -v "$1" >/dev/null 2>&1; }

# Docker nur lesend und mit Zeitgrenze. Unterbefehle stehen ausschließlich
# in den Abschnitten unten; die Prüfung erlaubt nur eine feste Liste.
docker_lesen() {
  if hat timeout; then timeout "$ZEITGRENZE" docker "$@"; else docker "$@"; fi
}

# docker compose liest die .env. Seine Fehlertexte können .env-Zeilen
# enthalten (z. B. Syntaxfehler mit Zeileninhalt). Deshalb: stderr
# verwerfen, nur Unterbefehl und Rückgabe melden.
compose_lesen() {
  local rc=0
  docker_lesen compose "$@" 2>/dev/null || rc=$?
  if ((rc)); then
    printf 'docker compose %s fehlgeschlagen (Rückgabe %s, Fehlertext unterdrückt)\n' "$1" "$rc" >&2
    return "$rc"
  fi
}

# Schicht 1 für die .env: NUR Schlüsselnamen. Versteht „export NAME=“,
# Leerzeichen vor/nach dem Namen, CRLF, Kommentare und Werte in
# Anführungszeichen über mehrere Zeilen (Folgezeilen werden übersprungen;
# ein maskiertes \" schließt einen doppelt zitierten Wert nicht).
# Ausgegeben wird nur, was danach wie ein Bezeichner aussieht.
# Grenze: ein Wert, der mit \\" (maskierter Backslash vor dem Schluss-
# zeichen) endet, wird als offen gewertet; Folgen sind höchstens
# fehlende Namen, nie Werte.
env_namen() {
  [[ -f .env ]] || { printf '.env fehlt\n' >&2; return 1; }
  awk '
    function schliesst(s, q) {
      if (q == "\047") return index(s, q) > 0
      return match(s, /(^|[^\\])"/) > 0
    }
    { sub(/\r$/, "") }
    offen != "" { if (schliesst($0, offen)) offen = ""; next }
    {
      z = $0
      sub(/^[ \t]+/, "", z)
      sub(/^export[ \t]+/, "", z)
      if (!match(z, /^[A-Za-z_][A-Za-z0-9_]*[ \t]*=/)) next
      n = substr(z, 1, RLENGTH)
      w = substr(z, RLENGTH + 1)
      sub(/[ \t]*=$/, "", n)
      sub(/^[ \t]+/, "", w)
      q = substr(w, 1, 1)
      if ((q == "\"" || q == "\047") && !schliesst(substr(w, 2), q)) offen = q
      print n
    }' .env | { grep -E '^[A-Za-z_][A-Za-z0-9_]*$' || true; } | sort -u
}

# Schicht 2 (nur zusätzlich) für JEDE Ausgabezeile.
#  - IPv4 außer 0.0.0.0 und 127.x, IPv6 (ab vier Gruppen oder mit ::)
#  - Zugangsdaten in URLs (://name:wort@), E-Mail-Adressen
#  - Schlüsselkörper (ssh-…/ecdsa-… AAAA…), PEM-Blöcke
#  - Tokens (ghp_, github_pat_, sk-ant-, xox?-, Bearer/Basic)
#  - name=Wert (jeder Bezeichner, auch klein) außer IMAGE_DIGEST/IMAGE_TAG
#    und command= (Forced-Command-Option in V-8)
#  - Werte zu Namen mit PASS/SECRET/TOKEN/KEY/… („Name: Wert“, „name=Wert“)
#  - lange Base64-Folgen (awk-Stufe unten); SHA256:-Fingerabdrücke und
#    sha256:-Digests bleiben lesbar
maskieren() {
  if [[ "${INVENTUR_MASKE:-an}" == "aus" ]]; then
    cat
    return
  fi
  sed -E \
    -e 's/-----BEGIN [A-Z ]*PRIVATE KEY-----.*/<privater-schluessel>/' \
    -e 's/-----END [A-Z ]*PRIVATE KEY-----.*/<privater-schluessel>/' \
    -e 's/\b(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+) +AAAA[A-Za-z0-9+\/=]+/\1 <schluessel>/g' \
    -e 's/\bgh[pousr]_[A-Za-z0-9]{16,}/<token>/g' \
    -e 's/\bgithub_pat_[A-Za-z0-9_]{16,}/<token>/g' \
    -e 's/\bsk-ant-[A-Za-z0-9_-]+/<token>/g' \
    -e 's/\bxox[abprs]-[A-Za-z0-9-]+/<token>/g' \
    -e 's/\b(Bearer|Basic) +[A-Za-z0-9._~+\/=-]+/\1 <token>/g' \
    -e 's#(://)[^/@[:space:]]+@#\1<zugang>@#g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/<email>/g' \
    -e 's/\b(0\.0\.0\.0)\b/__ALLE4__/g' \
    -e 's/\b127(\.[0-9]{1,3}){3}\b/__LOKAL4__/g' \
    -e 's/\b[0-9]{1,3}(\.[0-9]{1,3}){3}(\/[0-9]{1,2})?\b/<ipv4>/g' \
    -e 's/(^|[^0-9a-fA-F:])::1([^0-9a-fA-F:]|$)/\1__LOKAL6__\2/g' \
    -e 's/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{0,4}){3,7}(\/[0-9]{1,3})?/<ipv6>/g' \
    -e 's/[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*::([0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*)?/<ipv6>/g' \
    -e 's/(^|[^0-9a-fA-F:<\[])::[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4})*(\/[0-9]{1,3})?/\1<ipv6>/g' \
    -e 's/__ALLE4__/0.0.0.0/g; s/__LOKAL4__/127.x/g; s/__LOKAL6__/::1/g' \
    -e 's/\b(IMAGE_DIGEST|IMAGE_TAG|command)=/__SCHUTZ_\1__/g' \
    -e 's/\b([A-Za-z_][A-Za-z0-9_]*)=[^[:space:]]*/\1=<maskiert>/g' \
    -e 's/__SCHUTZ_(IMAGE_DIGEST|IMAGE_TAG|command)__/\1=/g' \
    -e 's/\b([A-Za-z0-9_]*(PASS|PASSWORT|PASSWORD|SECRET|GEHEIM|TOKEN|KEY|SCHLUESSEL|PFEFFER|SALT|CREDENTIAL)[A-Za-z0-9_]*)(["'"'"']?[[:space:]]*[:=][[:space:]]*)("[^"]*"|'"'"'[^'"'"']*'"'"'|[^,;}[:space:]]+)/\1\3<maskiert>/gI' |
    awk '{
      # Base64-artige Folgen ab 32 Zeichen mit Groß-, Kleinbuchstaben und
      # Ziffer; nicht nach „SHA256:“/„sha256:“ (Fingerabdruck, Digest) und
      # nicht mit „/“ am Anfang (Pfad).
      rest = $0; aus = ""
      while (match(rest, /[A-Za-z0-9+\/=]+/)) {
        t = substr(rest, RSTART, RLENGTH)
        aus = aus substr(rest, 1, RSTART - 1)
        vor = (length(aus) >= 7) ? substr(aus, length(aus) - 6) : ""
        if (length(t) >= 32 && vor != "SHA256:" && vor != "sha256:" && substr(t, 1, 1) != "/" &&
            t ~ /[A-Z]/ && t ~ /[a-z]/ && t ~ /[0-9]/) t = "<maskiert>"
        aus = aus t
        rest = substr(rest, RSTART + RLENGTH)
      }
      print aus rest
    }'
}

FEHLER=0
GESCHEITERT=()

# Einen Abschnitt in einer Unterschale ausführen. Scheitert er, Meldung
# und weiter. Nicht in einem Bedingungskontext aufrufen (set -e muss in
# der Unterschale greifen).
abschnitt() {
  local name="$1"; shift
  printf '\n=== %s ===\n' "$name"
  set +e
  ( set -euo pipefail; "$@" ) 2>&1 | maskieren
  local st=("${PIPESTATUS[@]}")
  set -e
  if [[ "${st[0]}" -ne 0 || "${st[1]}" -ne 0 ]]; then
    printf -- '--- %s: Abschnitt gescheitert (Rückgabe %s), weiter mit dem nächsten ---\n' "$name" "${st[0]}"
    FEHLER=$((FEHLER + 1))
    GESCHEITERT+=("$name")
  fi
}

# Heimatverzeichnis des Kontos, dem das Betriebsverzeichnis gehört
# (admin, uid 1000). Gilt auch, wenn das Skript als root läuft (Phase 2).
konto_home() {
  if [[ -n "${CENTRIC_KONTO_HOME:-}" ]]; then printf '%s\n' "$CENTRIC_KONTO_HOME"; return; fi
  local besitzer zeile
  besitzer="$(stat -c '%U' "$VERZ" 2>/dev/null || true)"
  if [[ -n "$besitzer" ]] && hat getent; then
    zeile="$(getent passwd "$besitzer" || true)"
    if [[ -n "$zeile" ]]; then printf '%s\n' "$zeile" | cut -d: -f6; return; fi
  fi
  printf '%s\n' "${HOME:-}"
}
KONTO_HOME="$(konto_home)"

# --- Abschnitte ---------------------------------------------------------
v_kopf() {
  printf 'Produktionsinventur (nur lesend)\n'
  printf 'Zeit (UTC): %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Rechner: %s\n' "$(uname -n)"
  printf 'Konto: %s (uid %s)\n' "$(id -un)" "$(id -u)"
  printf 'Betriebsverzeichnis: %s\n' "$VERZ"
  # Nachweis für restrict/no-pty/no-agent-forwarding (Negativproben N-5, N-11):
  # nur ja/nein, nie der Wert von SSH_AUTH_SOCK.
  if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then printf 'Agent-Weiterleitung: gesetzt\n'; else printf 'Agent-Weiterleitung: nicht gesetzt\n'; fi
  if [[ -t 0 ]]; then printf 'Terminal: ja\n'; else printf 'Terminal: nein\n'; fi
  printf 'Skript: '
  sha256sum "${BASH_SOURCE[0]}"
}

v1() {
  cd "$VERZ"
  compose_lesen ps
  docker_lesen inspect "$DIENST" --format '{{.Image}} {{.Config.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}ohne-health{{end}} {{.State.StartedAt}} {{.RestartCount}}'
}

v2() {
  local bild
  bild="$(docker_lesen inspect "$DIENST" --format '{{.Image}}')"
  docker_lesen image inspect --format '{{.Id}} {{json .RepoDigests}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$bild"
  docker_lesen images --digests --no-trunc "$BILD_REPO"
}

# Bildreferenz: aus der .env nur, ob IMAGE_DIGEST/IMAGE_TAG als Name
# vorkommen; die wirksame Referenz zeigt compose config (nur image:).
v3() {
  cd "$VERZ"
  printf -- '-- Schlüssel IMAGE_DIGEST/IMAGE_TAG in .env (nur Namen):\n'
  env_namen | { grep -xE 'IMAGE_DIGEST|IMAGE_TAG' || printf '(weder IMAGE_DIGEST noch IMAGE_TAG)\n'; }
  printf -- '-- docker compose config (nur image:):\n'
  compose_lesen config | grep -E '^[[:space:]]+image:'
}

v4() {
  cd "$VERZ"
  ls -la
  printf -- '-- Prüfsummen:\n'
  local f dateien=()
  for f in compose.yml FREIGEGEBENE-IMAGES.md ./*.sh ./*.mjs; do
    [[ -f "$f" && ! -L "$f" ]] && dateien+=("$f")
  done
  if ((${#dateien[@]})); then sha256sum "${dateien[@]}"; else printf '(keine Betriebsdateien)\n'; fi
  printf -- '-- Versionen:\n'
  compose_lesen version
  docker_lesen version --format '{{.Server.Version}}'
}

v5() {
  cd "$VERZ"
  local d
  for d in data zustand; do
    if [[ -e "$d" ]]; then stat -c '%n %U:%G %u:%g %a' "$d"; else printf '%s fehlt\n' "$d"; fi
  done
  if [[ -d zustand ]]; then
    printf -- '-- zustand/ (nur Namen, Rechte, Größe):\n'
    ls -la zustand
  fi
}

v6() {
  cd "$VERZ"
  env_namen
}

v7() {
  if hat restic; then
    restic version
  else
    printf 'restic: nicht installiert\n'
  fi
  printf -- '-- crontab (nur Skriptnamen):\n'
  if hat crontab; then
    { crontab -l 2>/dev/null || true; } | { grep -vE '^[[:space:]]*(#|$)' || true; } | { grep -oE '[^ /]+\.sh' || true; } | sort -u
  else
    printf 'crontab: nicht vorhanden\n'
  fi
  printf -- '-- Sicherungsverzeichnisse:\n'
  local d
  for d in "$KONTO_HOME/sicherung" "$KONTO_HOME/sicherung/lokal" "$VERZ/deploy-sicherungen"; do
    if [[ -d "$d" ]]; then
      printf '%s:\n' "$d"
      find "$d" -mindepth 1 -maxdepth 1 -printf '%M %u:%g %s %TY-%Tm-%Td %f\n' | sort -k6 | head -n 40
    else
      printf '%s: fehlt\n' "$d"
    fi
  done
  printf -- '-- letzte erfolgreiche Sicherung:\n'
  # Nur die festen Felder der Marke (deploy/sicherung/sicherung-ausser-haus.sh):
  # zeit, dateien, bytes, snapshot_id. Alles andere wird verworfen.
  local marke="$KONTO_HOME/sicherung/letzte-erfolgreiche.json"
  if [[ -L "$marke" ]]; then
    printf 'letzte-erfolgreiche.json ist ein symbolischer Link, nicht gelesen\n'
  elif [[ -f "$marke" ]]; then
    { grep -oE '"(zeit|snapshot_id)":"[0-9A-Za-z:.+-]{1,64}"' "$marke" || true; } | head -n 2
    { grep -oE '"(dateien|bytes)":[0-9]{1,20}' "$marke" || true; } | head -n 2
  else
    printf '(keine Datei letzte-erfolgreiche.json)\n'
  fi
}

# Nur Optionen, Zähler und Fingerabdrücke — nie den Schlüsselkörper.
v8() {
  local h f gesehen=" "
  for h in "$KONTO_HOME" "${HOME:-}" "$HOME_WURZEL"/*; do
    [[ -n "$h" ]] || continue
    f="$h/.ssh/authorized_keys"
    if [[ -L "$f" ]]; then printf '== %s: symbolischer Link, nicht gelesen\n' "$f"; continue; fi
    [[ -f "$f" && -r "$f" ]] || continue
    [[ "$gesehen" == *" $f "* ]] && continue
    gesehen+="$f "
    printf '== %s\n' "$f"
    stat -c '%U:%G %a' "$f"
    printf 'Zeilen mit Schlüssel: %s\n' "$(grep -cvE '^[[:space:]]*(#|$)' "$f" || true)"
    printf 'deploy.sh --ssh: %s\n' "$(grep -c 'deploy.sh --ssh' "$f" || true)"
    printf 'centric-inventur: %s\n' "$(grep -c 'centric-inventur' "$f" || true)"
    # je Schlüsselzeile: Optionen vor dem Typ und der Typ; Körper und Kommentar fallen weg
    sed -nE \
      -e 's/^[[:space:]]*(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)[[:space:]]+AAAA.*/Optionen: (keine) | Typ: \1/p' \
      -e 's/^[[:space:]]*(.*[^[:space:]])[[:space:]]+(ssh-[a-z0-9-]+|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9@.-]+)[[:space:]]+AAAA.*/Optionen: \1 | Typ: \2/p' \
      "$f"
    if hat ssh-keygen; then
      ssh-keygen -lf "$f" || printf 'ssh-keygen: Datei nicht lesbar\n'
    fi
  done
  [[ "$gesehen" != " " ]] || printf '(keine lesbare authorized_keys)\n'
}

v9() {
  cd "$VERZ"
  df -h .
  if [[ -d data ]]; then du -sh data; else printf 'data fehlt\n'; fi
  printf -- '-- /gesund:\n'
  docker_lesen exec "$DIENST" node -e "fetch('http://127.0.0.1:3000/gesund').then(r=>r.text()).then(t=>console.log(t))" | head -c 2000
  printf '\n-- betrieb-protokoll.log (letzte 30, nur Zeit, Skript, Ereignis):\n'
  if [[ -L betrieb-protokoll.log ]]; then
    printf 'betrieb-protokoll.log ist ein symbolischer Link, nicht gelesen\n'
  elif [[ -f betrieb-protokoll.log ]]; then
    tail -n 30 betrieb-protokoll.log | awk '{
      e = $3; if (e !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) e = "?"
      z = $1; if (z !~ /^[0-9T:Z-]+$/) z = "?"
      s = $2; if (s !~ /^[A-Za-z0-9._-]+$/) s = "?"
      print z, s, e }'
  else
    printf '(kein betrieb-protokoll.log)\n'
  fi
}

r1() {
  printf 'nproc: %s\n' "$(nproc)"
  if hat uptime; then uptime; else printf 'uptime: nicht vorhanden\n'; fi
  if hat free; then free -m; else printf 'free: nicht vorhanden\n'; fi
  docker_lesen stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.MemPerc}}'
}

r2() {
  docker_lesen inspect "$DIENST" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} schreibbar:{{.RW}}{{println}}{{end}}'
  docker_lesen inspect "$DIENST" --format 'Compose-Projekt: {{index .Config.Labels "com.docker.compose.project"}} Pfad: {{index .Config.Labels "com.docker.compose.project.working_dir"}} Dateien: {{index .Config.Labels "com.docker.compose.project.config_files"}}'
}

# --- Ablauf -------------------------------------------------------------
abschnitt "Kopf" v_kopf
abschnitt "V-1 Container, Status, laufende Bild-ID" v1
abschnitt "V-2 Digest und Label des laufenden Bilds" v2
abschnitt "V-3 Bildreferenz in der Konfiguration" v3
abschnitt "V-4 Betriebsdateien und Prüfsummen" v4
abschnitt "V-5 Zustandsverzeichnis" v5
abschnitt "V-6 Schlüsselnamen der .env" v6
abschnitt "V-7 Sicherungen" v7
abschnitt "V-8 authorized_keys (nur Optionen)" v8
abschnitt "V-9 Platz und Gesundheit" v9
abschnitt "R-1 Ressourcen" r1
abschnitt "R-2 Mounts und Compose-Projektpfad" r2

printf '\n=== Ende ===\n'
if ((FEHLER)); then
  printf 'Gescheiterte Abschnitte: %s\n' "$FEHLER"
  printf -- '- %s\n' "${GESCHEITERT[@]}"
  exit 1
fi
printf 'Alle Abschnitte gelaufen.\n'
exit 0
CENTRIC_INVENTUR_NUTZDATEN_ENDE
}
# <<< ERZEUGT <<<

# --- Ausgabe ------------------------------------------------------------
FEHLER=()
ok() { printf '  ok      %s\n' "$*"; }
fehl() { printf '  FEHLER  %s\n' "$*"; FEHLER+=("$*"); }
hinweis() { printf '  hinweis %s\n' "$*"; }

# Abbruch vor jeder Änderung.
abbruch() {
  PHASE=pruefen
  printf 'REL-0 ABBRUCH: %s. Es wurde nichts geändert.\n' "$1"
  exit 1
}

abbruch_gesammelt() {
  local n=${#FEHLER[@]} zusatz=""
  if ((n > 1)); then zusatz=" (und $((n - 1)) weitere Befunde, siehe FEHLER oben)"; fi
  abbruch "${FEHLER[0]}${zusatz}"
}

hilfe() {
  printf '%s\n' \
    "Aufruf: bash inventur-install.sh [--trocken | --rueckbau | --hilfe]" \
    "REL-0: richtet nur den Inventurzugang ein (Forced Command, root-eigenes Skript)." \
    "Anleitung: docs/acc45/VPS-ZUGANG-EINRICHTUNG.md, Einrichtung mit einem Befehl"
}

# --- Hilfen -------------------------------------------------------------
sha_datei() { sha256sum -- "$1" | cut -d' ' -f1; }
sha_ein() { sha256sum | cut -d' ' -f1; }
# uid gid modus benutzer gruppe (ohne Links zu folgen)
meta() { stat -c '%u %g %a %U %G' -- "$1"; }
# Modus (oktal) ohne Schreibrecht für Gruppe und andere?
nicht_fremd_schreibbar() { [[ "$1" =~ ^[0-7]{3,4}$ ]] && (((8#$1 & 8#022) == 0)); }

TMPD=""
PHASE=pruefen
SICH=""
SKRIPT_ANGELEGT=nein
AK_ANGELEGT=nein
ANGEHAENGT=nein
TMP_SKRIPT=""

# shellcheck disable=SC2329 # wird über trap aufgerufen
ende() {
  local rc=$?
  trap - EXIT
  if [[ -n "$TMP_SKRIPT" && -e "$TMP_SKRIPT" ]]; then rm -f -- "$TMP_SKRIPT"; fi
  if [[ "$PHASE" == aendern ]]; then
    printf '  FEHLER  unerwarteter Fehler nach Beginn der Änderungen (Rückgabe %s)\n' "$rc"
    if zuruecknehmen; then
      printf 'REL-0 FEHLER: Einrichtung gescheitert, Änderungen zurückgenommen. Sicherung: %s\n' "${SICH#"$W"}"
      rc=3
    else
      printf 'REL-0 FEHLER: Einrichtung gescheitert, Rücknahme unvollständig. Zustand prüfen, Sicherung: %s\n' "${SICH#"$W"}"
      rc=4
    fi
  elif [[ "$PHASE" == rueckbau ]]; then
    printf 'REL-0 FEHLER: Rückbau unterbrochen (Rückgabe %s). Zustand prüfen, Sicherung: %s\n' "$rc" "${SICH#"$W"}"
    rc=4
  fi
  if [[ -n "$TMPD" && -d "$TMPD" ]]; then rm -rf -- "$TMPD"; fi
  exit "$rc"
}
trap ende EXIT

# --- Vorabprüfungen -----------------------------------------------------
pruefe_root() {
  local u
  u="$(id -u)"
  [[ "$u" == 0 ]] || abbruch "Der Installer muss als root laufen (aktuell uid $u)"
  ok "läuft als root"
}

pruefe_wurzel() {
  if [[ -n "$W" ]]; then
    [[ "$W" != "/" && -d "$W" ]] || abbruch "Prüfwurzel ungültig"
    hinweis "Prüfwurzel gesetzt (nur Tests)"
  fi
}

# Ubuntu 24.04 ist durch die Bestandsaufnahme bestätigt (srv-prod-01). Eine
# andere Version heißt: Server neu aufgesetzt oder aktualisiert, die
# Bestandsaufnahme (1a–1e) und der Sicherheitsnachweis (7.3: OpenSSH 9.6p1,
# bash mit SSH_SOURCE_BASHRC) gelten dann nicht mehr. Deshalb Abbruch.
pruefe_os() {
  local f="$W/etc/os-release" id="" ver=""
  if [[ ! -f "$f" ]]; then fehl "/etc/os-release fehlt"; return; fi
  id="$(sed -nE 's/^ID="?([A-Za-z0-9._-]*)"?$/\1/p' "$f" | head -n 1)"
  ver="$(sed -nE 's/^VERSION_ID="?([0-9.]*)"?$/\1/p' "$f" | head -n 1)"
  if [[ "$id" == ubuntu && "$ver" == 24.04 ]]; then
    ok "Betriebssystem Ubuntu 24.04"
  else
    fehl "Betriebssystem ist nicht Ubuntu 24.04 (gefunden: ${id:-?} ${ver:-?})"
  fi
}

pruefe_nutzdaten() {
  local h
  h="$(nutzdaten_skript | sha_ein)"
  if [[ "$h" == "$SOLL_SKRIPT_SHA256" ]]; then
    ok "eingebettetes inventur.sh sha256 $h"
  else
    fehl "eingebettetes inventur.sh weicht vom Sollwert ab (sha256 $h)"
  fi
}

KOERPER=""
ZEILE=""
FINGERABDRUCK=""
pruefe_schluessel() {
  local re='^ssh-ed25519 (AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43}) inventur-centric$' h fp
  if [[ -z "$SCHLUESSEL_ZEILE" || -z "$SOLL_SCHLUESSEL_SHA256" || -z "$SOLL_FINGERABDRUCK" ]]; then
    fehl "öffentlicher Inventur-Schlüssel fehlt im Installer (deploy/inventur-schluessel.pub ist noch nicht eingetragen)"
    return
  fi
  if [[ ! "$SCHLUESSEL_ZEILE" =~ $re ]]; then
    fehl "eingebetteter Schlüssel ist kein ssh-ed25519-Schlüssel mit Kommentar $KOMMENTAR"
    return
  fi
  KOERPER="${BASH_REMATCH[1]}"
  h="$(printf '%s\n' "$SCHLUESSEL_ZEILE" | sha_ein)"
  if [[ "$h" != "$SOLL_SCHLUESSEL_SHA256" ]]; then
    fehl "eingebetteter Schlüssel weicht vom Sollwert ab"
    return
  fi
  printf '%s\n' "$SCHLUESSEL_ZEILE" >"$TMPD/schluessel.pub"
  fp="$(ssh-keygen -lf "$TMPD/schluessel.pub" 2>/dev/null | cut -d' ' -f2)" || fp=""
  if [[ -z "$fp" || "$fp" != "$SOLL_FINGERABDRUCK" ]]; then
    fehl "Fingerabdruck des eingebetteten Schlüssels weicht ab oder ssh-keygen fehlt"
    return
  fi
  FINGERABDRUCK="$fp"
  ZEILE="$OPTIONEN $SCHLUESSEL_ZEILE"
  ok "öffentlicher Schlüssel ED25519, Kommentar $KOMMENTAR, F-INV $FINGERABDRUCK"
}

KONTO=""
KONTO_UID=""
KONTO_GID=""
HOME_L=""
pruefe_konto() {
  local verz="$W$VERZ_LOGISCH" p a b zeile
  local a_uid a_user b_uid n_name n_uid n_gid n_home n_shell h_uid h_mode
  for p in "$verz" "$verz/data"; do
    if [[ -L "$p" || ! -d "$p" ]]; then fehl "${p#"$W"} fehlt oder ist kein Verzeichnis"; return; fi
  done
  a="$(meta "$verz")" || { fehl "stat $VERZ_LOGISCH fehlgeschlagen"; return; }
  b="$(meta "$verz/data")" || { fehl "stat $VERZ_LOGISCH/data fehlgeschlagen"; return; }
  read -r a_uid _ _ a_user _ <<<"$a"
  read -r b_uid _ _ _ _ <<<"$b"
  if [[ "$a_uid" != "$b_uid" ]]; then
    fehl "Betriebsverzeichnis und data/ gehören verschiedenen Konten (uid $a_uid und $b_uid)"
    return
  fi
  if [[ "$a_uid" == 0 ]]; then fehl "Betriebsverzeichnis gehört root (Variante A braucht ein eigenes Konto)"; return; fi
  if [[ "$a_user" != "$ERWARTET_KONTO" || "$a_uid" != "$ERWARTET_UID" ]]; then
    fehl "Betriebsverzeichnis gehört $a_user (uid $a_uid), erwartet $ERWARTET_KONTO (uid $ERWARTET_UID)"
    return
  fi
  zeile="$(getent passwd "$a_user")" || { fehl "Konto $a_user fehlt (getent passwd)"; return; }
  IFS=: read -r n_name _ n_uid n_gid _ n_home n_shell <<<"$zeile"
  if [[ "$n_name" != "$a_user" || "$n_uid" != "$a_uid" ]]; then fehl "getent passwd passt nicht zum Besitzer ($a_user)"; return; fi
  if [[ "$n_shell" =~ (nologin|false)$ ]]; then
    fehl "Konto $n_name hat keine Login-Shell ($n_shell); der Forced Command liefe nie"
    return
  fi
  if [[ "$n_home" != /* || "$n_home" == *..* ]]; then fehl "Heimatverzeichnis von $n_name ungültig"; return; fi
  if [[ -L "$W$n_home" || ! -d "$W$n_home" ]]; then fehl "Heimatverzeichnis $n_home fehlt"; return; fi
  read -r h_uid _ h_mode _ _ <<<"$(meta "$W$n_home")"
  if [[ "$h_uid" != "$n_uid" && "$h_uid" != 0 ]] || ! nicht_fremd_schreibbar "$h_mode"; then
    fehl "Heimatverzeichnis $n_home: Besitz oder Rechte abweichend (uid $h_uid, $h_mode); StrictModes würde den Schlüssel ablehnen"
    return
  fi
  KONTO="$n_name"; KONTO_UID="$n_uid"; KONTO_GID="$n_gid"; HOME_L="$n_home"
  ok "Konto $KONTO (uid $KONTO_UID) besitzt Betriebsverzeichnis und data/, Shell $n_shell, Heim $HOME_L"
}

SSHD_T=""
sshd_wert() { printf '%s\n' "$SSHD_T" | awk -v k="$1" 'tolower($1) == k { $1 = ""; sub(/^ +/, ""); print }'; }
# alle Werte eines Schlüssels als Wörter (eine Zeile je Wort)
sshd_woerter() { sshd_wert "$1" | tr ' ' '\n' | sed '/^$/d'; }

# Match-Blöcke (B-2): `sshd -T` ohne -C wertet sie nicht aus. Ein Block wie
# „Match User admin“ mit AcceptEnv * oder PermitUserEnvironment yes bliebe
# unsichtbar. Deshalb fail-closed: Abbruch, sobald sshd_config, eine Datei in
# sshd_config.d oder ein Include-Ziel eine Zeile „Match“ enthält (Groß/Klein,
# führende Leerzeichen). Die Dateien werden nur gelesen.
SSHD_DATEIEN=()
pruefe_match() {
  local cfg="$W/etc/ssh/sshd_config" f pat g match="" i=0 gesehen=" "
  local -a warteschlange=()
  if [[ -L "$cfg" || ! -f "$cfg" || ! -r "$cfg" ]]; then fehl "/etc/ssh/sshd_config fehlt oder ist nicht lesbar"; return; fi
  warteschlange=("$cfg")
  shopt -s nullglob
  for g in "$W"/etc/ssh/sshd_config.d/*.conf; do warteschlange+=("$g"); done
  while ((i < ${#warteschlange[@]} && i < 100)); do
    f="${warteschlange[$i]}"
    i=$((i + 1))
    [[ "$gesehen" == *" $f "* ]] && continue
    gesehen+="$f "
    if [[ ! -f "$f" || ! -r "$f" ]]; then fehl "sshd-Konfigurationsdatei ${f#"$W"} nicht lesbar"; continue; fi
    SSHD_DATEIEN+=("${f#"$W"}")
    # sshd nimmt das Schlüsselwort auch in Anführungszeichen und mit „=“ an
    # („"Match" User x“, „Match=User x“); beides wird erkannt.
    if grep -qiE '^[[:space:]]*"?match"?([[:space:]]|=|$)' -- "$f"; then match+=" ${f#"$W"}"; fi
    while IFS= read -r pat; do
      [[ -n "$pat" ]] || continue
      if [[ "$pat" == __LEERZEICHEN__ ]]; then
        fehl "Include mit Leerzeichen im Pfad in ${f#"$W"}; nicht verfolgbar"
        continue
      fi
      [[ "$pat" == /* ]] || pat="/etc/ssh/$pat"
      # nur Pfadnamen-Erweiterung (kein eval); Muster stammen aus der root-eigenen sshd-Konfiguration
      # shellcheck disable=SC2206
      local -a treffer_glob=($W$pat)
      for g in "${treffer_glob[@]}"; do warteschlange+=("$g"); done
    done < <(awk '{
      # Include auch als „"Include" …“ und „Include=…“; Argumente ohne Anführungszeichen.
      # Ein Pfad mit Leerzeichen in Anführungszeichen ist nicht verfolgbar: Marke, fail-closed.
      l = $0; sub(/^[ \t]+/, "", l)
      if (!match(l, /^"?[Ii][Nn][Cc][Ll][Uu][Dd][Ee]"?([ \t]*=[ \t]*|[ \t]+)/)) next
      r = substr(l, RLENGTH + 1)
      if (r ~ /"[^"]*[ \t][^"]*"/) { print "__LEERZEICHEN__"; next }
      n = split(r, t, /[ \t]+/)
      for (i = 1; i <= n; i++) { a = t[i]; gsub(/"/, "", a); if (a != "") print a }
    }' "$f")
  done
  shopt -u nullglob
  if ((i >= 100)); then fehl "zu viele sshd-Konfigurationsdateien (Include-Schleife?)"; return; fi
  if [[ -n "$match" ]]; then
    fehl "sshd-Konfiguration enthält Match-Blöcke ($match ); ohne Verbindungsdaten nicht vollständig prüfbar"
    return
  fi
  ok "sshd-Konfiguration ohne Match-Blöcke (${#SSHD_DATEIEN[@]} Dateien gelesen)"
}

# Regeln für eine Ausgabe von sshd -T (SSHD_T); $1 = Bezeichnung des Kontexts.
sshd_regeln() {
  local k="$1" w gruppen g treffer
  if [[ "$(sshd_wert pubkeyauthentication)" == yes ]]; then ok "sshd pubkeyauthentication yes ($k)"; else fehl "sshd: pubkeyauthentication ist nicht yes ($k)"; fi
  if [[ "$(sshd_wert permituserenvironment)" == no ]]; then ok "sshd permituserenvironment no ($k)"; else fehl "sshd: permituserenvironment ist nicht no ($k)"; fi
  if [[ "$(sshd_wert strictmodes)" == yes ]]; then ok "sshd strictmodes yes ($k)"; else fehl "sshd: strictmodes ist nicht yes ($k)"; fi
  # AcceptEnv: nur LANG und LC_* (Debian/Ubuntu-Vorgabe). Betreiberentscheidung
  # E-a: zusätzlich genau COLORTERM und NO_COLOR (feste Namen, die weder bash
  # noch inventur.sh ausführbar auswerten).
  treffer=""
  while IFS= read -r w; do
    case "$w" in
      LANG | 'LC_*' | COLORTERM | NO_COLOR) ;;
      *) treffer+=" ${w//[^A-Za-z0-9_*?!.-]/?}" ;;
    esac
  done < <(sshd_woerter acceptenv)
  if [[ -z "$treffer" ]]; then ok "sshd acceptenv nur LANG/LC_* und COLORTERM/NO_COLOR (E-a) ($k)"; else fehl "sshd: acceptenv erlaubt mehr als LANG, LC_*, COLORTERM, NO_COLOR ($treffer ) ($k)"; fi
  if [[ -n "$KONTO" ]]; then
    if [[ -n "$(sshd_wert allowusers)" ]]; then
      if grep -qxF -- "$KONTO" <<<"$(sshd_woerter allowusers)"; then ok "sshd allowusers schließt $KONTO ein"; else fehl "sshd: allowusers schließt $KONTO nicht ein"; fi
    fi
    if grep -qxF -- "$KONTO" <<<"$(sshd_woerter denyusers)"; then fehl "sshd: denyusers nennt $KONTO"; fi
    gruppen="$(id -nG "$KONTO" 2>/dev/null | tr ' ' '\n')" || gruppen=""
    if [[ -n "$(sshd_wert allowgroups)" ]]; then
      treffer=nein
      while IFS= read -r g; do
        if [[ -n "$g" ]] && grep -qxF -- "$g" <<<"$(sshd_woerter allowgroups)"; then treffer=ja; fi
      done <<<"$gruppen"
      if [[ "$treffer" == ja ]]; then ok "sshd allowgroups schließt $KONTO ein"; else fehl "sshd: allowgroups schließt $KONTO nicht ein"; fi
    fi
    while IFS= read -r g; do
      if [[ -n "$g" ]] && grep -qxF -- "$g" <<<"$(sshd_woerter denygroups)"; then fehl "sshd: denygroups nennt eine Gruppe von $KONTO"; fi
    done <<<"$gruppen"
  fi
}

# sshd -T ohne und mit Verbindungsdaten (-C): Konto über localhost und über
# eine fremde Dokumentationsadresse (192.0.2.1, RFC 5737). Jede Ausgabe muss
# dieselben Regeln erfüllen und dieselbe authorizedkeysfile nennen.
AKF=""
pruefe_sshd() {
  local ctx t a
  for ctx in "" "user=$KONTO,host=localhost,addr=127.0.0.1" "user=$KONTO,host=localhost,addr=192.0.2.1"; do
    if [[ -n "$ctx" && -z "$KONTO" ]]; then continue; fi
    if [[ -z "$ctx" ]]; then t="$(sshd -T 2>/dev/null)" || t=""; else t="$(sshd -T -C "$ctx" 2>/dev/null)" || t=""; fi
    if [[ -z "$t" ]]; then
      if [[ ! -d "$W/run/sshd" ]]; then
        fehl "sshd -T fehlgeschlagen: /run/sshd fehlt (Socket-Aktivierung, ssh.service läuft nicht dauerhaft); nichts starten, melden"
      else
        fehl "sshd -T ${ctx:+-C $ctx }fehlgeschlagen"
      fi
      return
    fi
    SSHD_T="$t"
    sshd_regeln "${ctx:-ohne Verbindungsdaten}"
    a="$(sshd_woerter authorizedkeysfile | head -n 1)"
    [[ -n "$a" ]] || a=.ssh/authorized_keys
    if [[ -z "$AKF" ]]; then AKF="$a"; elif [[ "$a" != "$AKF" ]]; then fehl "sshd: authorizedkeysfile hängt von Verbindungsdaten ab ($ctx)"; fi
  done
  if sshd -t >/dev/null 2>&1; then ok "sshd -t (Konfiguration gültig, unverändert)"; else fehl "sshd -t meldet einen Fehler in der bestehenden Konfiguration"; fi
}

pruefe_version() {
  local v="" maj min
  # shellcheck disable=SC2016 # ${Version} ist das Format von dpkg-query, keine Shell-Variable
  if ! v="$(dpkg-query -W -f='${Version}' openssh-server 2>/dev/null)" || [[ -z "$v" ]]; then
    v="$(ssh -V 2>&1 || true)"
    v="${v#OpenSSH_}"
  fi
  [[ "$v" =~ ^[0-9]+: ]] && v="${v#*:}"
  if [[ "$v" =~ ^([0-9]+)\.([0-9]+) ]]; then
    maj="${BASH_REMATCH[1]}"; min="${BASH_REMATCH[2]}"
    if ((maj > 7 || (maj == 7 && min >= 2))); then
      ok "OpenSSH $maj.$min (restrict ab 7.2)"
      return
    fi
    fehl "OpenSSH $maj.$min ist älter als 7.2 (restrict fehlt)"
    return
  fi
  fehl "OpenSSH-Version nicht ermittelbar"
}

# Verzeichnis: vorhanden, kein Link, root-eigen, nicht für Gruppe/andere beschreibbar
root_verzeichnis() {
  local d="$1" uid mode
  if [[ -L "$d" || ! -d "$d" ]]; then return 1; fi
  read -r uid _ mode _ _ <<<"$(meta "$d")"
  [[ "$uid" == 0 ]] && nicht_fremd_schreibbar "$mode"
}

ZIEL=""
SKRIPT_VORHANDEN=nein
pruefe_ziel() {
  local d uid mode
  ZIEL="$W$ZIEL_LOGISCH"
  for d in "${W:-/}" "$W/usr" "$W/usr/local" "$W/usr/local/sbin"; do
    if ! root_verzeichnis "$d"; then fehl "Verzeichnis ${d#"$W"} fehlt, ist nicht root-eigen oder für andere beschreibbar"; return; fi
  done
  if [[ -L "$ZIEL" ]]; then fehl "$ZIEL_LOGISCH ist ein symbolischer Link"; return; fi
  if [[ -e "$ZIEL" ]]; then
    if [[ ! -f "$ZIEL" || "$(sha_datei "$ZIEL")" != "$SOLL_SKRIPT_SHA256" ]]; then
      fehl "$ZIEL_LOGISCH existiert und weicht vom eingebetteten inventur.sh ab"
      return
    fi
    read -r uid _ mode _ _ <<<"$(meta "$ZIEL")"
    if [[ "$uid" != 0 || "$mode" != 755 ]]; then fehl "$ZIEL_LOGISCH ist identisch, aber nicht root 0755 (uid $uid, $mode)"; return; fi
    SKRIPT_VORHANDEN=ja
    ok "$ZIEL_LOGISCH bereits vorhanden und identisch (root 0755)"
  else
    ok "$ZIEL_LOGISCH ist frei"
  fi
}

AK=""
AK_MODUS=600
AK_VORHANDEN=nein
ZEILE_VORHANDEN=nein
pruefe_ak() {
  local t dir uid mode n_ident n_bezug
  [[ -n "$KONTO" ]] || return 0
  t="$AKF"
  t="${t//%h/$HOME_L}"
  t="${t//%u/$KONTO}"
  if [[ "$t" == *%* ]]; then fehl "authorizedkeysfile enthält nicht unterstützte Platzhalter ($AKF)"; return; fi
  [[ "$t" == /* ]] || t="$HOME_L/$t"
  if [[ "$t" != "$HOME_L"/* || "$t" == *..* || "$t" == *//* ]]; then
    fehl "authorizedkeysfile liegt nicht im Heimatverzeichnis von $KONTO ($AKF); nicht unterstützt"
    return
  fi
  AK="$W$t"
  dir="${AK%/*}"
  if [[ -L "$dir" || ! -d "$dir" ]]; then fehl "${dir#"$W"} fehlt (wird nicht angelegt)"; return; fi
  read -r uid _ mode _ _ <<<"$(meta "$dir")"
  if [[ "$uid" != "$KONTO_UID" || "$mode" != 700 ]]; then
    fehl "${dir#"$W"}: erwartet Besitzer $KONTO und 700 (gefunden uid $uid, $mode)"
    return
  fi
  ok "${dir#"$W"} gehört $KONTO, 700"
  if [[ -L "$AK" ]]; then fehl "${AK#"$W"} ist ein symbolischer Link"; return; fi
  if [[ -e "$AK" ]]; then
    if [[ ! -f "$AK" ]]; then fehl "${AK#"$W"} ist keine reguläre Datei"; return; fi
    read -r uid _ mode _ _ <<<"$(meta "$AK")"
    # Betreiberentscheidung E-b: 600, 640 oder 644 (nicht für Gruppe/andere
    # beschreibbar), Besitz Konto; keine automatische Rechteänderung.
    if [[ "$uid" != "$KONTO_UID" || ! "$mode" =~ ^(600|640|644)$ ]]; then
      fehl "${AK#"$W"}: erwartet Besitzer $KONTO und 600, 640 oder 644 (gefunden uid $uid, $mode)"
      return
    fi
    AK_VORHANDEN=ja
    AK_MODUS="$mode"
    ok "${AK#"$W"} gehört $KONTO, $mode"
    if [[ -n "$ZEILE" ]]; then
      n_ident="$(grep -cxF -- "$ZEILE" "$AK" || true)"
      n_bezug="$(grep -cF -e "$KOERPER" -e "centric-inventur.sh" -e " $KOMMENTAR" -- "$AK" || true)"
      if [[ "$n_ident" == 1 && "$n_bezug" == 1 ]]; then
        ZEILE_VORHANDEN=ja
        ok "Inventur-Zeile bereits genau einmal vorhanden und identisch"
      elif [[ "$n_bezug" != 0 ]]; then
        fehl "authorized_keys enthält bereits einen abweichenden oder doppelten Eintrag zum Inventur-Schlüssel ($n_bezug Zeilen)"
      else
        ok "kein bestehender Eintrag zum Inventur-Schlüssel"
      fi
    fi
  else
    ok "${AK#"$W"} fehlt; wird mit $KONTO 600 angelegt"
  fi
}

pruefe_platz() {
  local d frei
  for d in "$W/root" "$W/usr/local/sbin" "${AK%/*}"; do
    [[ -n "$d" && -d "$d" ]] || continue
    frei="$(df -Pk -- "$d" 2>/dev/null | awk 'NR == 2 { print $4 }')" || frei=""
    if [[ ! "$frei" =~ ^[0-9]+$ ]] || ((frei < MIN_FREI_KIB)); then
      fehl "zu wenig freier Speicher unter ${d#"$W"} (${frei:-?} KiB, nötig $MIN_FREI_KIB)"
      return
    fi
  done
  ok "freier Speicher ausreichend"
}

pruefe_rootheim() {
  if ! root_verzeichnis "$W/root"; then fehl "/root fehlt oder ist nicht root-eigen"; return; fi
  ok "/root root-eigen"
}

pruefe_werkzeuge() {
  if command -v setpriv >/dev/null 2>&1; then ok "setpriv vorhanden (Schreiben in authorized_keys als Konto)"; else fehl "setpriv fehlt (util-linux)"; fi
}

vorpruefungen() {
  pruefe_wurzel
  pruefe_werkzeuge
  pruefe_nutzdaten
  pruefe_schluessel
  pruefe_os
  pruefe_version
  pruefe_konto
  pruefe_match
  pruefe_sshd
  pruefe_ziel
  pruefe_ak
  pruefe_rootheim
  pruefe_platz
}

# --- Selbstprüfung ------------------------------------------------------
selbsttest_skript() {
  local aus rc=0
  aus="$(env -i PATH="$FESTER_PFAD" "$ZIEL" --hilfe 2>&1)" || rc=$?
  if [[ "$rc" != 0 || "$aus" != *"Lesende Produktionsinventur"* ]]; then
    fehl "Selbsttest centric-inventur.sh --hilfe gescheitert (Rückgabe $rc)"
    return 1
  fi
  rc=0
  aus="$(env -i PATH="$FESTER_PFAD" SSH_ORIGINAL_COMMAND=id "$ZIEL" 2>/dev/null)" || rc=$?
  if [[ "$rc" != 2 || -n "$aus" ]]; then
    fehl "Selbsttest Forced Command: fremder Befehl nicht abgewiesen (Rückgabe $rc)"
    return 1
  fi
  ok "Selbsttest: --hilfe läuft, fremder SSH-Befehl wird abgewiesen (Rückgabe 2)"
}

selbstpruefung() {
  local uid mode
  FEHLER=()
  read -r uid _ mode _ _ <<<"$(meta "$ZIEL")"
  if [[ "$uid" == 0 && "$mode" == 755 && "$(sha_datei "$ZIEL")" == "$SOLL_SKRIPT_SHA256" ]]; then
    ok "Skript installiert: root 0755, sha256 $SOLL_SKRIPT_SHA256"
  else
    fehl "Skript nicht wie erwartet installiert (uid $uid, $mode)"
  fi
  if [[ "$(grep -cxF -- "$ZEILE" "$AK" || true)" == 1 ]]; then ok "Zeile genau einmal vorhanden"; else fehl "Zeile nicht genau einmal vorhanden"; fi
  if [[ "$(head -c "$VORHER_BYTES" -- "$AK" | sha_ein)" == "$VORHER_SHA" ]]; then
    ok "bestehende Zeilen unverändert (sha256 der Altzeilen gleich)"
  else
    fehl "bestehende Zeilen verändert"
  fi
  read -r uid _ mode _ _ <<<"$(meta "$AK")"
  if [[ ! -L "$AK" && "$uid" == "$KONTO_UID" && "$mode" == "$AK_MODUS" ]]; then
    ok "authorized_keys: Besitz $KONTO, $mode (unverändert)"
  else
    fehl "authorized_keys: Link, Besitz oder Rechte abweichend (uid $uid, $mode)"
  fi
  if sshd -t >/dev/null 2>&1; then ok "sshd -t ok (kein Neustart, keine Konfigurationsänderung)"; else fehl "sshd -t meldet einen Fehler"; fi
  selbsttest_skript || true
  ((${#FEHLER[@]} == 0))
}

# --- Änderungen ---------------------------------------------------------
VORHER_SHA=""
VORHER_BYTES=0
ANHANG=""
manifest() { printf '%s=%s\n' "$1" "$2" >>"$SICH/manifest"; }

# A-1: Jeder schreibende Zugriff auf authorized_keys (anlegen, anhängen,
# kürzen, Rechte, löschen) läuft mit den Rechten des Kontos, nicht als root.
# Die Datei und ihr Verzeichnis gehören dem Konto; tauscht es die Datei gegen
# einen Link, wirkt der Zugriff nur mit seinen eigenen Rechten (kein
# root-Schreiben über einen untergeschobenen Link). Einfacher als eine
# Deskriptor-/Inode-Prüfung in bash und ohne Wettlauf. setpriv: util-linux.
als_konto() { setpriv --reuid="$KONTO_UID" --regid="$KONTO_GID" --clear-groups -- "$@"; }

# Nimmt die eigenen Änderungen zurück, nur bei Hash-Übereinstimmung. Jeder
# Schritt wird nachgeprüft (A-2); läuft im if-Kontext ohne set -e.
# Aufruf nur aus ende() (trap); shellcheck erkennt das nicht.
# shellcheck disable=SC2329
zuruecknehmen() {
  local erfolg=0 gesamt
  if [[ "$ANGEHAENGT" == ja ]]; then
    gesamt="$(wc -c <"$AK")" || gesamt=""
    if [[ ! -L "$AK" && "$(head -c "$VORHER_BYTES" -- "$AK" | sha_ein)" == "$VORHER_SHA" &&
      "$(tail -c +"$((VORHER_BYTES + 1))" -- "$AK" | sha_ein)" == "$(printf '%s' "$ANHANG" | sha_ein)" &&
      "$gesamt" == "$((VORHER_BYTES + ${#ANHANG}))" ]]; then
      if als_konto truncate -s "$VORHER_BYTES" -- "$AK" && [[ ! -L "$AK" && "$(sha_datei "$AK")" == "$VORHER_SHA" ]]; then
        ANGEHAENGT=nein
      else
        printf '  FEHLER  Kürzen von authorized_keys gescheitert oder Prüfsumme danach abweichend\n'
        erfolg=1
      fi
    elif [[ ! -L "$AK" && "$(head -c "$VORHER_BYTES" -- "$AK" | sha_ein)" == "$VORHER_SHA" ]]; then
      # Altzeilen unverändert, Anhang unvollständig oder fremd (z. B. Datenträger voll beim Schreiben)
      printf '  FEHLER  Anhängen an authorized_keys unvollständig (Datenträger voll?); Altzeilen unverändert, Rest nicht automatisch entfernt\n'
      erfolg=1
    else
      printf '  FEHLER  authorized_keys wurde zwischenzeitlich verändert (Link oder Altzeilen); Zeile nicht automatisch entfernt\n'
      erfolg=1
    fi
  fi
  if [[ "$AK_ANGELEGT" == ja && "$ANGEHAENGT" == nein && -f "$AK" && ! -L "$AK" && ! -s "$AK" ]]; then
    als_konto rm -f -- "$AK" || true
    if [[ -e "$AK" || -L "$AK" ]]; then
      printf '  FEHLER  angelegte authorized_keys nicht entfernt\n'
      erfolg=1
    else
      AK_ANGELEGT=nein
    fi
  fi
  if [[ "$SKRIPT_ANGELEGT" == ja ]]; then
    if [[ ! -L "$ZIEL" && -f "$ZIEL" && "$(sha_datei "$ZIEL")" == "$SOLL_SKRIPT_SHA256" ]]; then
      rm -f -- "$ZIEL" || true
      if [[ -e "$ZIEL" || -L "$ZIEL" ]]; then
        printf '  FEHLER  %s nicht entfernt\n' "$ZIEL_LOGISCH"
        erfolg=1
      else
        SKRIPT_ANGELEGT=nein
      fi
    else
      printf '  FEHLER  %s weicht vom installierten Skript ab oder ist ein Link; nicht automatisch entfernt\n' "$ZIEL_LOGISCH"
      erfolg=1
    fi
  fi
  if [[ -n "$SICH" && -d "$SICH" ]]; then manifest status zurueckgenommen || true; fi
  PHASE=zurueckgenommen
  return "$erfolg"
}

einrichten() {
  local zeit
  zeit="$(date -u +%Y%m%dT%H%M%SZ)"
  SICH="$W/root/centric-inventur-backup-$zeit"
  mkdir -m 0700 -- "$SICH" 2>/dev/null || abbruch "Sicherungsverzeichnis ${SICH#"$W"} konnte nicht angelegt werden (existiert bereits?)"
  PHASE=aendern
  chown -h root:root "$SICH"
  chmod 0700 "$SICH"
  if [[ "$AK_VORHANDEN" == ja ]]; then
    # gelesen mit den Rechten des Kontos (A-1); geschrieben in die root-eigene Sicherung
    : >"$SICH/authorized_keys.vorher"
    chmod 0600 "$SICH/authorized_keys.vorher"
    chown -h root:root "$SICH/authorized_keys.vorher"
    als_konto cat -- "$AK" >"$SICH/authorized_keys.vorher"
    VORHER_SHA="$(sha_datei "$AK")"
    VORHER_BYTES="$(wc -c <"$AK")"
    [[ "$(sha_datei "$SICH/authorized_keys.vorher")" == "$VORHER_SHA" ]] || { printf '  FEHLER  Sicherung weicht ab\n'; exit 1; }
    if ((VORHER_BYTES > 0)) && [[ -n "$(tail -c 1 -- "$AK")" ]]; then
      ANHANG=$'\n'"$ZEILE"$'\n'
    else
      ANHANG="$ZEILE"$'\n'
    fi
  else
    VORHER_SHA="$(printf '' | sha_ein)"
    VORHER_BYTES=0
    ANHANG="$ZEILE"$'\n'
  fi
  : >"$SICH/manifest"
  chmod 0600 "$SICH/manifest"
  chown -h root:root "$SICH/manifest"
  manifest version "$VERSION"
  manifest zeit "$zeit"
  manifest konto "$KONTO"
  manifest konto_uid "$KONTO_UID"
  manifest konto_gid "$KONTO_GID"
  manifest ak_pfad "${AK#"$W"}"
  manifest ak_vorhanden "$AK_VORHANDEN"
  manifest vorher_sha "$VORHER_SHA"
  manifest vorher_bytes "$VORHER_BYTES"
  manifest anhang_sha "$(printf '%s' "$ANHANG" | sha_ein)"
  manifest anhang_bytes "${#ANHANG}"
  manifest skript_vorhanden "$SKRIPT_VORHANDEN"
  manifest skript_sha "$SOLL_SKRIPT_SHA256"
  manifest fingerabdruck "$FINGERABDRUCK"
  manifest status begonnen
  ok "Sicherung angelegt: ${SICH#"$W"} (root 0700)"

  if [[ "$SKRIPT_VORHANDEN" == nein ]]; then
    TMP_SKRIPT="$(mktemp "$W/usr/local/sbin/.centric-inventur.XXXXXX")"
    nutzdaten_skript >"$TMP_SKRIPT"
    [[ "$(sha_datei "$TMP_SKRIPT")" == "$SOLL_SKRIPT_SHA256" ]] || { printf '  FEHLER  geschriebenes Skript weicht ab\n'; exit 1; }
    bash -n "$TMP_SKRIPT"
    chmod 0755 "$TMP_SKRIPT"
    chown -h root:root "$TMP_SKRIPT"
    [[ ! -e "$ZIEL" && ! -L "$ZIEL" ]] || { printf '  FEHLER  Ziel ist zwischenzeitlich entstanden\n'; exit 1; }
    SKRIPT_ANGELEGT=ja
    mv -f -- "$TMP_SKRIPT" "$ZIEL"
    TMP_SKRIPT=""
    ok "Skript installiert: $ZIEL_LOGISCH (root 0755, atomar)"
  fi

  if [[ "$AK_VORHANDEN" == nein ]]; then
    [[ ! -e "$AK" && ! -L "$AK" ]] || { printf '  FEHLER  authorized_keys ist zwischenzeitlich entstanden\n'; exit 1; }
    # als Konto angelegt: Besitz stimmt ohne chown; umask 077 → 0600
    AK_ANGELEGT=ja
    als_konto touch -- "$AK"
    als_konto chmod 0600 "$AK"
  fi
  # unmittelbar vor dem Anhängen erneut: kein Link, Inhalt wie gesichert
  [[ ! -L "$AK" && "$(sha_datei "$AK")" == "$VORHER_SHA" ]] || { printf '  FEHLER  authorized_keys hat sich seit der Prüfung verändert\n'; exit 1; }
  ANGEHAENGT=ja
  printf '%s' "$ANHANG" | als_konto tee -a -- "$AK" >/dev/null
  ok "eine Zeile an ${AK#"$W"} angehängt"

  if ! selbstpruefung; then
    printf '  FEHLER  Selbstprüfung gescheitert: %s\n' "${FEHLER[0]}"
    exit 1
  fi
  manifest status eingerichtet
  PHASE=fertig
  printf 'REL-0 OK: Inventurzugang eingerichtet. Fingerabdruck F-INV: %s Skript sha256: %s\n' "$FINGERABDRUCK" "$SOLL_SKRIPT_SHA256"
}

# --- Rückbau ------------------------------------------------------------
mf() { grep -E "^$1=" -- "$2" | tail -n 1 | cut -d= -f2-; }

rueckbau() {
  local d m="" letzt="" status ak_pfad vorher_sha vorher_bytes anhang_sha anhang_bytes skript_vorhanden ak_vorhanden gesamt uid
  for d in "$W"/root/centric-inventur-backup-*; do
    [[ -d "$d" && ! -L "$d" && -f "$d/manifest" ]] || continue
    [[ "$(mf status "$d/manifest")" == eingerichtet ]] && letzt="$d"
  done
  [[ -n "$letzt" ]] || abbruch "keine Sicherung einer abgeschlossenen Einrichtung gefunden (/root/centric-inventur-backup-*)"
  m="$letzt/manifest"
  status="$(mf status "$m")"
  ak_pfad="$(mf ak_pfad "$m")"
  vorher_sha="$(mf vorher_sha "$m")"
  vorher_bytes="$(mf vorher_bytes "$m")"
  anhang_sha="$(mf anhang_sha "$m")"
  anhang_bytes="$(mf anhang_bytes "$m")"
  ak_vorhanden="$(mf ak_vorhanden "$m")"
  skript_vorhanden="$(mf skript_vorhanden "$m")"
  KONTO_UID="$(mf konto_uid "$m")"
  KONTO_GID="$(mf konto_gid "$m")"
  if [[ ! "$KONTO_UID" =~ ^[1-9][0-9]*$ || ! "$KONTO_GID" =~ ^[1-9][0-9]*$ ]]; then
    abbruch "Manifest ${m#"$W"} ohne gültiges Konto (uid/gid)"
  fi
  command -v setpriv >/dev/null 2>&1 || abbruch "setpriv fehlt (util-linux)"
  if [[ "$status" != eingerichtet || ! "$vorher_sha" =~ ^[0-9a-f]{64}$ || ! "$anhang_sha" =~ ^[0-9a-f]{64}$ ||
    ! "$vorher_bytes" =~ ^[0-9]+$ || ! "$anhang_bytes" =~ ^[0-9]+$ || ! "$ak_pfad" =~ ^/[A-Za-z0-9._/-]+$ ||
    "$ak_pfad" == *..* || ! "$ak_vorhanden" =~ ^(ja|nein)$ || ! "$skript_vorhanden" =~ ^(ja|nein)$ ]]; then
    abbruch "Manifest ${m#"$W"} unvollständig oder ungültig"
  fi
  ok "Sicherung: ${letzt#"$W"}"
  AK="$W$ak_pfad"
  ZIEL="$W$ZIEL_LOGISCH"
  if [[ -L "$AK" || ! -f "$AK" ]]; then abbruch "${ak_pfad} fehlt oder ist ein Link"; fi
  read -r uid _ _ _ _ <<<"$(meta "$AK")"
  [[ "$uid" == "$KONTO_UID" ]] || abbruch "$ak_pfad gehört nicht mehr dem Konto (uid $uid)"
  gesamt="$(wc -c <"$AK")"
  if [[ "$gesamt" != "$((vorher_bytes + anhang_bytes))" ||
    "$(head -c "$vorher_bytes" -- "$AK" | sha_ein)" != "$vorher_sha" ||
    "$(tail -c +"$((vorher_bytes + 1))" -- "$AK" | sha_ein)" != "$anhang_sha" ]]; then
    abbruch "$ak_pfad wurde seit der Einrichtung verändert (Hash weicht ab); Rückbau von Hand nach Abschnitt 6a"
  fi
  if [[ "$ak_vorhanden" == ja ]]; then
    if [[ ! -f "$letzt/authorized_keys.vorher" || "$(sha_datei "$letzt/authorized_keys.vorher")" != "$vorher_sha" ]]; then
      abbruch "Sicherungskopie authorized_keys.vorher fehlt oder weicht ab"
    fi
  fi
  if [[ "$skript_vorhanden" == nein && -e "$ZIEL" ]]; then
    if [[ -L "$ZIEL" || "$(sha_datei "$ZIEL")" != "$SOLL_SKRIPT_SHA256" ]]; then
      abbruch "$ZIEL_LOGISCH weicht vom eingerichteten Skript ab"
    fi
  fi
  ok "Hash-Prüfung bestanden: authorized_keys = Sicherung + genau die eine Zeile"
  SICH="$letzt"
  PHASE=rueckbau

  # als Konto (A-1); jeder Schritt nachgeprüft (A-2)
  als_konto truncate -s "$vorher_bytes" -- "$AK"
  if [[ -L "$AK" || "$(sha_datei "$AK")" != "$vorher_sha" ]]; then
    printf 'REL-0 FEHLER: authorized_keys nach dem Kürzen nicht wie gesichert. Sicherung: %s\n' "${letzt#"$W"}"
    exit 4
  fi
  if [[ "$ak_vorhanden" == nein && ! -s "$AK" ]]; then
    als_konto rm -f -- "$AK"
    if [[ -e "$AK" || -L "$AK" ]]; then printf 'REL-0 FEHLER: angelegte authorized_keys nicht entfernt. Sicherung: %s\n' "${letzt#"$W"}"; exit 4; fi
  fi
  ok "Zeile entfernt; authorized_keys wie vor der Einrichtung"
  if [[ "$skript_vorhanden" == nein && -e "$ZIEL" ]]; then
    rm -f -- "$ZIEL"
    if [[ -e "$ZIEL" || -L "$ZIEL" ]]; then printf 'REL-0 FEHLER: %s nicht entfernt. Sicherung: %s\n' "$ZIEL_LOGISCH" "${letzt#"$W"}"; exit 4; fi
    ok "Skript $ZIEL_LOGISCH entfernt"
  fi
  printf 'status=rueckgebaut\n' >>"$m"
  PHASE=fertig
  printf 'REL-0 RUECKBAU OK: Inventur-Zeile und Skript entfernt, authorized_keys wie gesichert. Sicherung bleibt: %s\n' "${letzt#"$W"}"
}

# --- Ablauf -------------------------------------------------------------
main() {
  local modus
  case "$#:${1:-}" in
    0:) modus=einrichten ;;
    1:--trocken) modus=trocken ;;
    1:--rueckbau) modus=rueckbau ;;
    1:--hilfe | 1:-h) hilfe; exit 0 ;;
    *)
      hilfe
      printf 'REL-0 ABBRUCH: unbekannter Aufruf. Es wurde nichts geändert.\n'
      exit 2
      ;;
  esac
  printf 'REL-0 Installer v%s, Modus %s (inventur.sh sha256 %s)\n' "$VERSION" "$modus" "$SOLL_SKRIPT_SHA256"
  pruefe_root
  TMPD="$(mktemp -d)"
  if [[ "$modus" == rueckbau ]]; then
    pruefe_wurzel
    rueckbau
    exit 0
  fi
  vorpruefungen
  ((${#FEHLER[@]} == 0)) || abbruch_gesammelt
  if [[ "$ZEILE_VORHANDEN" == ja && "$SKRIPT_VORHANDEN" == nein ]]; then
    abbruch "Inventur-Zeile vorhanden, aber $ZIEL_LOGISCH fehlt (teilweise eingerichtet); Rückbau von Hand nach Abschnitt 6a"
  fi
  if [[ "$ZEILE_VORHANDEN" == ja ]]; then
    VORHER_BYTES="$(wc -c <"$AK")"
    VORHER_SHA="$(sha_datei "$AK")"
    selbstpruefung || abbruch "bereits eingerichtet, aber Selbstprüfung gescheitert: ${FEHLER[0]}"
    if [[ "$modus" == trocken ]]; then
      printf 'REL-0 TROCKEN OK: bereits eingerichtet. Es wurde nichts geändert.\n'
    else
      printf 'REL-0 OK: Inventurzugang bereits eingerichtet. Fingerabdruck F-INV: %s Skript sha256: %s\n' "$FINGERABDRUCK" "$SOLL_SKRIPT_SHA256"
    fi
    exit 0
  fi
  if [[ "$modus" == trocken ]]; then
    printf 'REL-0 TROCKEN OK: alle Vorabprüfungen bestanden. Es wurde nichts geändert.\n'
    exit 0
  fi
  einrichten
  exit 0
}

# main endet immer mit exit; die Datei ist damit vollständig gelesen, bevor
# etwas geändert wird (keine Teilausführung bei Änderung der Datei).
main "$@"
