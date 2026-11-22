#!/bin/bash
# =====================================================================
#  handy-zugang.sh - REL-0c: persoenlicher SSH-Zugang vom Handy
#  (Termius) zum Produktions-VPS. Legt GENAU EIN neues Konto
#  centric-mobil an: eigene Gruppe, KEIN sudo, KEIN docker, Passwort
#  gesperrt, Anmeldung nur mit dem eingebetteten oeffentlichen
#  Schluessel CENTRIC-Mobile.
#  Anleitung: docs/acc45/HANDY-ZUGANG.md
#
#  Ladeweg (Remotekonsole, root, ohne Datei; Sollwert aus der Anleitung):
#    s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/handy-zugang.sh)
#    printf %s "$s" | sha256sum | grep -q '^<32 Hex>' && bash -c "$s"
#
#  Modi (zweites Wort nach bash -c "$s" x ...):
#    (ohne)                Probelauf: nur pruefen und anzeigen, aendert nichts
#    --trocken             wie ohne
#    --ja                  einrichten (nur ohne Warnungen)
#    --ja-trotz-warnung    einrichten, obwohl Warnungen vorliegen
#    --rueckbau            nur das eigene Konto centric-mobil entfernen
#    --hilfe               Kurzhilfe
#
#  Was das Skript NIE tut: bestehende Konten, Gruppen, Schluessel oder
#  die sshd-Konfiguration aendern; Dienste starten, stoppen oder neu
#  laden; Pakete installieren; das Netz nutzen; private Schluessel
#  erzeugen oder lesen; Dateiinhalte ausgeben (nur Pfadnamen).
#
#  Jede Meldung beginnt mit OK:, INFO:, PLAN:, WARNUNG: oder STOPP:.
#  Letzte Zeile: PROBELAUF OK: ... / EINGERICHTET: ... / RUECKGEBAUT: ...
#  oder STOPP: ...
#
#  Umgebung NUR fuer Pruefungen (pruefungen/handy-zugang.test.js); die
#  Remotekonsole setzt sie nicht, bei einer SSH-Sitzung werden sie
#  verworfen:
#    HANDY_PRUEFPFAD     ersetzt den festen PATH (Stubs)
#    HANDY_PRUEFWURZEL   Praefix fuer alle Dateipfade (Testwurzel)
#
#  Rueckgabe: 0 Probelauf ok / eingerichtet / rueckgebaut
#             1 STOPP vor jeder Aenderung (nichts geaendert)
#             2 Aufruf falsch (nichts geaendert)
#             3 STOPP nach Beginn der Aenderung (Rueckbau-Hinweis)
# =====================================================================
set -euo pipefail
umask 077
export LC_ALL=C
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  unset HANDY_PRUEFPFAD HANDY_PRUEFWURZEL
fi
PATH="${HANDY_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"
export PATH
unset BASH_ENV ENV CDPATH

readonly W="${HANDY_PRUEFWURZEL:-}"
readonly KONTO=centric-mobil
readonly HEIM=/home/centric-mobil
readonly MARKE='CENTRIC-Handy-Zugang handy-zugang.sh'
readonly SCHLUESSEL='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIZ+jYWmbhkIvEziHlLwU4UpvLWVGlUEfvj+Rvn2XsR2 CENTRIC-Mobile'
readonly SOLL_FINGERABDRUCK='SHA256:6hHuh73hxWXqsmUeD9XlfKnoD46dNOpLxEP2bYApJBQ'
# Keine Weiterleitungen (Port, Agent, X11). Kein Forced Command und kein
# no-pty: der Betreiber will eine interaktive Shell.
readonly OPTIONEN='no-port-forwarding,no-agent-forwarding,no-X11-forwarding'
readonly ZEILE="$OPTIONEN $SCHLUESSEL"
readonly BETRIEB=/opt/apps/centric-dienstplanung

FEHLER=0
WARNUNGEN=0
PHASE=pruefen
GEMELDET=nein
MODUS=""

ok() { printf 'OK: %s\n' "$*"; }
info() { printf 'INFO: %s\n' "$*"; }
plan() { printf 'PLAN: %s\n' "$*"; }
warnung() {
  printf 'WARNUNG: %s\n' "$*"
  WARNUNGEN=$((WARNUNGEN + 1))
}
fehl() {
  printf 'STOPP: %s\n' "$*"
  FEHLER=$((FEHLER + 1))
}
# Letzte Zeile ausgeben und mit Rueckgabe beenden.
schluss() {
  GEMELDET=ja
  printf '%s\n' "$2"
  exit "$1"
}
# nur druckbare ASCII-Zeichen (Pfadnamen aus dem Dateisystem)
sauber() { printf '%s' "${1//[^[:print:]]/?}"; }

# shellcheck disable=SC2329 # wird ueber trap aufgerufen
ende() {
  local rc=$?
  trap - EXIT
  if [[ "$GEMELDET" == nein && "$rc" != 0 ]]; then
    if [[ "$PHASE" == pruefen ]]; then
      printf 'STOPP: unerwarteter Fehler (Rueckgabe %s). Es wurde nichts geaendert.\n' "$rc"
      rc=1
    else
      printf 'STOPP: unerwarteter Fehler nach Beginn der Aenderung (Rueckgabe %s). Zustand pruefen; Rueckbau: --rueckbau\n' "$rc"
      rc=3
    fi
  fi
  exit "$rc"
}
trap ende EXIT

hilfe() {
  # shellcheck disable=SC2016 # "$s" ist hier woertlicher Text fuer den Betreiber
  printf '%s\n' \
    'INFO: Aufruf: bash -c "$s" x [--trocken | --ja | --ja-trotz-warnung | --rueckbau | --hilfe]' \
    'INFO: ohne Schalter: Probelauf (aendert nichts). Anleitung: docs/acc45/HANDY-ZUGANG.md'
}

case "$#:${1:-}" in
  0:) MODUS=trocken ;;
  1:--trocken) MODUS=trocken ;;
  1:--ja) MODUS=ja ;;
  1:--ja-trotz-warnung) MODUS=ja-trotz-warnung ;;
  1:--rueckbau) MODUS=rueckbau ;;
  1:--hilfe | 1:-h)
    hilfe
    GEMELDET=ja
    exit 0
    ;;
  *)
    hilfe
    schluss 2 'STOPP: unbekannter Aufruf. Es wurde nichts geaendert.'
    ;;
esac

# --- Hilfen -------------------------------------------------------------
hat() { command -v "$1" >/dev/null 2>&1; }
# Eigentuemer:Gruppe Modus (oktal)
meta() { stat -c '%U:%G %a' -- "$1"; }
modus_von() {
  local m
  m="$(meta "$1")" || return 1
  printf '%s' "${m##* }"
}
# Rueckgabe 0, wenn das Bit (oktal, z. B. 004) im Modus gesetzt ist
bit() { [[ "$1" =~ ^[0-7]{3,4}$ ]] && (((8#$1 & 8#$2) != 0)); }

SSHD_T=""
sshd_wert() { printf '%s\n' "$SSHD_T" | awk -v k="$1" '$1 == k { $1 = ""; sub(/^ +/, ""); print }'; }
sshd_woerter() { sshd_wert "$1" | tr ' ' '\n' | sed '/^$/d'; }

# --- Vorabpruefungen (lesen nur) ------------------------------------------
pruefe_root() {
  local u
  u="$(id -u 2>/dev/null)" || u="?"
  if [[ "$u" == 0 ]]; then ok "laeuft als root"; else fehl "nicht root (uid $u); als root in der Remotekonsole anmelden"; fi
}

pruefe_os() {
  local f="$W/etc/os-release" id="" ver=""
  if [[ ! -f "$f" ]]; then
    fehl "/etc/os-release fehlt"
    return
  fi
  id="$(sed -nE 's/^ID="?([A-Za-z0-9._-]*)"?$/\1/p' "$f" | head -n 1)"
  ver="$(sed -nE 's/^VERSION_ID="?([0-9.]*)"?$/\1/p' "$f" | head -n 1)"
  if [[ "$id" == ubuntu && "$ver" == 24.04 ]]; then ok "Ubuntu 24.04"; else fehl "kein Ubuntu 24.04 (gefunden: ${id:-?} ${ver:-?})"; fi
}

pruefe_werkzeuge() {
  local t fehlt=""
  for t in useradd passwd getent id runuser sshd ssh-keygen systemctl find stat mkdir chmod chown awk sed tr grep head cat wc rm; do
    hat "$t" || fehlt+=" $t"
  done
  if [[ -z "$fehlt" ]]; then ok "Werkzeuge vorhanden"; else fehl "Werkzeuge fehlen:$fehlt (nichts wird installiert)"; fi
}

# Eingebetteter Schluessel: genau eine Zeile ssh-ed25519 <base64> CENTRIC-Mobile,
# keine Optionen, keine Steuerzeichen; Fingerabdruck = Sollwert.
pruefe_schluessel() {
  local re='^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43} CENTRIC-Mobile$' fp="" f=""
  if [[ "$SCHLUESSEL" == *[[:cntrl:]]* || ! "$SCHLUESSEL" =~ $re ]]; then
    fehl "eingebetteter Schluessel hat nicht das Format ssh-ed25519 <base64> CENTRIC-Mobile"
    return
  fi
  fp="$(printf '%s\n' "$SCHLUESSEL" | ssh-keygen -lf - 2>/dev/null)" || fp=""
  f="${fp#* }"
  f="${f%% *}"
  if [[ "$fp" != "256 $SOLL_FINGERABDRUCK CENTRIC-Mobile (ED25519)" || "$f" != "$SOLL_FINGERABDRUCK" ]]; then
    fehl "Fingerabdruck des eingebetteten Schluessels weicht vom Sollwert ab (${f:-nicht berechenbar})"
    return
  fi
  ok "Schluessel ED25519 CENTRIC-Mobile $f"
}

pruefe_konto_frei() {
  local rc=0
  getent passwd "$KONTO" >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) fehl "Benutzer $KONTO existiert bereits; er wird nie ueberschrieben oder geaendert" ;;
    2) ok "Benutzer $KONTO existiert nicht" ;;
    *) fehl "Benutzer $KONTO nicht pruefbar (getent Rueckgabe $rc)" ;;
  esac
}

pruefe_gruppe_frei() {
  local rc=0
  getent group "$KONTO" >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) fehl "Gruppe $KONTO existiert bereits (Kollision)" ;;
    2) ok "Gruppe $KONTO existiert nicht" ;;
    *) fehl "Gruppe $KONTO nicht pruefbar (getent Rueckgabe $rc)" ;;
  esac
}

pruefe_heim_frei() {
  if [[ ! -d "$W/home" || -L "$W/home" ]]; then
    fehl "/home fehlt oder ist ein Link"
  elif [[ -e "$W$HEIM" || -L "$W$HEIM" ]]; then
    fehl "$HEIM existiert bereits; wird nie ueberschrieben"
  else
    ok "$HEIM existiert nicht"
  fi
}

# Regeln fuer die wirksame sshd-Konfiguration dieses Kontos (SSHD_T).
sshd_regeln() {
  local w a gefunden
  if [[ "$(sshd_wert pubkeyauthentication)" == yes ]]; then ok "sshd pubkeyauthentication yes"; else fehl "sshd: pubkeyauthentication ist nicht yes"; fi
  # Das Konto hat ein gesperrtes Passwort. Mit UsePAM no lehnt sshd
  # gesperrte Konten auch bei Schluesselanmeldung ab.
  if [[ "$(sshd_wert usepam)" == yes ]]; then ok "sshd usepam yes"; else fehl "sshd: usepam ist nicht yes (gesperrtes Konto waere nicht anmeldbar)"; fi
  if [[ "$(sshd_wert permittty)" == yes ]]; then ok "sshd permittty yes"; else fehl "sshd: permittty ist nicht yes (keine interaktive Shell)"; fi
  w="$(sshd_wert forcecommand)"
  if [[ -n "$w" && "$w" != none ]]; then fehl "sshd: forcecommand fuer $KONTO gesetzt"; fi
  w="$(sshd_wert chrootdirectory)"
  if [[ -n "$w" && "$w" != none ]]; then fehl "sshd: chrootdirectory fuer $KONTO gesetzt"; fi
  w="$(sshd_wert authenticationmethods)"
  if [[ -n "$w" && "$w" != any ]] && ! sshd_woerter authenticationmethods | grep -qxF publickey; then
    fehl "sshd: authenticationmethods erlaubt publickey allein nicht ($(sauber "$w"))"
  fi
  w="$(sshd_wert authorizedkeyscommand)"
  if [[ -z "$w" || "$w" == none ]]; then ok "sshd authorizedkeyscommand none"; else fehl "sshd: authorizedkeyscommand ist gesetzt (nicht none)"; fi
  gefunden=nein
  while IFS= read -r a; do
    case "$a" in .ssh/authorized_keys | %h/.ssh/authorized_keys) gefunden=ja ;; esac
  done < <(sshd_woerter authorizedkeysfile)
  if [[ "$gefunden" == ja ]]; then ok "sshd authorizedkeysfile enthaelt .ssh/authorized_keys"; else fehl "sshd: authorizedkeysfile enthaelt nicht .ssh/authorized_keys"; fi
  # Zugangslisten: nur exakte Namen gelten als sicher auswertbar. Die
  # sshd-Konfiguration wird NICHT geaendert.
  if [[ -n "$(sshd_wert allowusers)" ]]; then
    if sshd_woerter allowusers | grep -qxF -- "$KONTO"; then ok "sshd allowusers nennt $KONTO"; else fehl "sshd: allowusers gesetzt, $KONTO waere ausgeschlossen (sshd-Konfiguration wird nicht geaendert)"; fi
  fi
  if [[ -n "$(sshd_wert allowgroups)" ]]; then
    if sshd_woerter allowgroups | grep -qxF -- "$KONTO"; then ok "sshd allowgroups nennt $KONTO"; else fehl "sshd: allowgroups gesetzt, Gruppe $KONTO waere ausgeschlossen (sshd-Konfiguration wird nicht geaendert)"; fi
  fi
  while IFS= read -r a; do
    if [[ "$a" == "$KONTO" || "$a" == "$KONTO@"* || "$a" == *[*?!]* ]]; then fehl "sshd: denyusers schliesst $KONTO aus oder ist nicht sicher auswertbar ($(sauber "$a"))"; fi
  done < <(sshd_woerter denyusers)
  while IFS= read -r a; do
    if [[ "$a" == "$KONTO" || "$a" == *[*?!]* ]]; then fehl "sshd: denygroups schliesst $KONTO aus oder ist nicht sicher auswertbar ($(sauber "$a"))"; fi
  done < <(sshd_woerter denygroups)
}

# Wirksame Konfiguration FUER DIESEN BENUTZER mit sshd -T -C (Match-Bloecke
# sind dabei ausgewertet). Kein eigener Parser der Konfigurationsdateien.
pruefe_sshd() {
  local t
  if ! hat sshd; then
    fehl "sshd fehlt; sshd-Konfiguration nicht pruefbar"
    return
  fi
  t="$(sshd -T -C "user=$KONTO,host=localhost,addr=127.0.0.1" 2>/dev/null)" || t=""
  if [[ -z "$t" ]]; then
    fehl "sshd -T -C user=$KONTO fehlgeschlagen; nicht pruefbar (nichts starten, melden)"
    return
  fi
  if ! printf '%s\n' "$t" | grep -qE '^pubkeyauthentication (yes|no)$'; then
    fehl "Ausgabe von sshd -T nicht auswertbar"
    return
  fi
  SSHD_T="$t"
  sshd_regeln
  info "sshd passwordauthentication $(sauber "$(sshd_wert passwordauthentication)") (unveraendert)"
  info "sshd permitrootlogin $(sauber "$(sshd_wert permitrootlogin)") (unveraendert)"
  info "sshd port $(sauber "$(sshd_woerter port | tr '\n' ' ')")(laut sshd -T)"
}

pruefe_dienst() {
  if systemctl is-active --quiet ssh.service 2>/dev/null || systemctl is-active --quiet ssh.socket 2>/dev/null; then
    ok "ssh-Dienst aktiv (ssh.service oder ssh.socket)"
  else
    fehl "ssh-Dienst nicht aktiv (ssh.service und ssh.socket); nichts starten, melden"
  fi
}

pruefe_docker_sock() {
  local s="$W/var/run/docker.sock" m
  if [[ ! -e "$s" ]]; then
    info "kein /var/run/docker.sock"
    return
  fi
  m="$(meta "$s")" || m="? ?"
  if [[ ! "${m##* }" =~ ^[0-7]{3,4}$ ]]; then
    fehl "/var/run/docker.sock: Rechte nicht lesbar"
  elif bit "${m##* }" 006; then
    fehl "/var/run/docker.sock ist fuer alle les- oder schreibbar ($m)"
  else
    ok "/var/run/docker.sock nicht fuer alle zugaenglich ($m)"
  fi
}

# Warnungen: Dateien, die das neue Konto lesen koennte (o+r). Nur Pfadnamen,
# nie Inhalte. Verzeichnisrechte werden nicht beruecksichtigt (vorsichtig).
pruefe_geheimnisse() {
  local vorher=$WARNUNGEN b f m d n
  for b in "$W/opt/apps" "$W/home"; do
    [[ -d "$b" ]] || continue
    while IFS= read -r -d '' f; do
      m="$(modus_von "$f")" || m=""
      if [[ -z "$m" ]] || bit "$m" 004; then warnung "fuer alle lesbar: $(sauber "${f#"$W"}") (Modus ${m:-?})"; fi
    done < <(find "$b" -maxdepth 5 -xdev -type f \( -name '.env*' -o -name '*.pem' -o -name '*.key' -o \( -name 'id_*' ! -name '*.pub' \) \) -print0 2>/dev/null)
  done
  for d in "$W$BETRIEB/data" "$W$BETRIEB/zustand"; do
    [[ -d "$d" && ! -L "$d" ]] || continue
    m="$(modus_von "$d")" || m=""
    if [[ -n "$m" ]] && ! bit "$m" 005; then continue; fi
    n=0
    while IFS= read -r -d '' f; do
      m="$(modus_von "$f")" || m=""
      if [[ -z "$m" ]] || bit "$m" 004; then n=$((n + 1)); fi
    done < <(find "$d" -maxdepth 3 -xdev -type f -print0 2>/dev/null)
    if ((n > 0)); then warnung "$n Dateien in $(sauber "${d#"$W"}") fuer alle lesbar (Betriebsdaten)"; fi
  done
  if ((WARNUNGEN == vorher)); then ok "keine fuer alle lesbaren .env/.pem/.key/id_* unter /opt/apps und /home"; fi
}

betrieb_info() {
  local p m
  for p in "$BETRIEB" "$BETRIEB/.env" "$BETRIEB/data"; do
    if [[ -e "$W$p" ]]; then
      m="$(meta "$W$p")" || m="?"
      info "$p $m"
    fi
  done
}

hostschluessel_info() {
  local f="$W/etc/ssh/ssh_host_ed25519_key.pub" fp
  [[ -f "$f" ]] || return 0
  fp="$(ssh-keygen -lf "$f" 2>/dev/null)" || return 0
  fp="${fp#* }"
  info "Host-Schluessel ED25519 ${fp%% *} (beim ersten Login vergleichen)"
}

vorpruefungen() {
  pruefe_root
  pruefe_os
  pruefe_werkzeuge
  pruefe_schluessel
  pruefe_konto_frei
  pruefe_gruppe_frei
  pruefe_heim_frei
  pruefe_sshd
  pruefe_dienst
  pruefe_docker_sock
  pruefe_geheimnisse
  betrieb_info
}

# --- Nachpruefungen nach useradd ------------------------------------------
nach_konto() {
  local z name uid gid gecos heim shell n
  z="$(getent passwd "$KONTO")" || {
    fehl "Konto $KONTO nach useradd nicht gefunden"
    return
  }
  IFS=: read -r name _ uid gid gecos heim shell < <(printf '%s\n' "$z")
  if [[ "$name" != "$KONTO" || ! "$uid" =~ ^[0-9]+$ ]] || ((uid < 1000 || uid >= 60000)); then fehl "uid von $KONTO ungueltig ($uid)"; return; fi
  if [[ "$heim" != "$HEIM" || "$shell" != /bin/bash || "$gecos" != "$MARKE" ]]; then fehl "Konto $KONTO: Heim, Shell oder Kommentar weicht ab"; return; fi
  n="$(getent passwd | awk -F: -v u="$uid" '$3 == u' | wc -l)"
  if [[ "$n" != 1 ]]; then fehl "uid $uid ist mehrfach vergeben (Kollision)"; return; fi
  n="$(getent group | awk -F: -v g="$gid" '$3 == g { print $1 }')"
  if [[ "$n" != "$KONTO" ]]; then fehl "gid $gid gehoert nicht allein der Gruppe $KONTO (Kollision)"; return; fi
  ok "Konto $KONTO uid $uid gid $gid Heim $HEIM Shell /bin/bash"
}

nach_gruppen() {
  local g
  g="$(id -nG "$KONTO" 2>/dev/null)" || g="?"
  if [[ "$g" == "$KONTO" ]]; then ok "Gruppen: nur $KONTO"; else fehl "Gruppen von $KONTO: $(sauber "$g") (erwartet nur $KONTO; nicht sudo/admin/adm/docker/root)"; fi
}

nach_passwort() {
  local s
  s="$(passwd -S "$KONTO" 2>/dev/null)" || s=""
  s="${s#* }"
  if [[ "${s%% *}" == L ]]; then ok "Passwort gesperrt (nur Schluessel)"; else fehl "Passwort von $KONTO nicht gesperrt"; fi
}

nach_sudo() {
  local s
  if ! hat sudo; then
    ok "sudo nicht installiert"
    return
  fi
  s="$(sudo -n -l -U "$KONTO" 2>&1)" || true
  if [[ "$s" == *"is not allowed to run sudo"* && "$s" != *"may run the following"* ]]; then ok "keine sudo-Rechte"; else fehl "sudo -l -U $KONTO zeigt Rechte oder ist nicht auswertbar"; fi
}

nach_docker() {
  local s="$W/var/run/docker.sock" r
  if ! runuser -u "$KONTO" -- true 2>/dev/null; then
    fehl "runuser -u $KONTO nicht moeglich; Docker-Zugriff nicht pruefbar"
    return
  fi
  for r in -r -w; do
    if runuser -u "$KONTO" -- test "$r" "$s" 2>/dev/null; then
      fehl "$KONTO kann /var/run/docker.sock oeffnen (test $r)"
      return
    fi
  done
  ok "kein Zugriff auf /var/run/docker.sock"
}

# --- Schluessel ablegen und pruefen ----------------------------------------
schluessel_ablegen() {
  local h="$W$HEIM" s="$W$HEIM/.ssh" a="$W$HEIM/.ssh/authorized_keys" m
  if [[ -L "$h" || ! -d "$h" ]]; then fehl "$HEIM fehlt nach useradd"; return; fi
  m="$(meta "$h")" || m="? ?"
  if [[ "${m%% *}" != "$KONTO:$KONTO" ]] || bit "${m##* }" 022; then fehl "$HEIM: Besitz oder Rechte abweichend ($m)"; return; fi
  if [[ -e "$s" || -L "$s" ]]; then fehl "$HEIM/.ssh existiert bereits (z. B. aus /etc/skel)"; return; fi
  mkdir -- "$s"
  chmod 0700 -- "$s"
  chown "$KONTO:$KONTO" -- "$s"
  (
    set -C
    printf '%s\n' "$ZEILE" >"$a"
  )
  chmod 0600 -- "$a"
  chown "$KONTO:$KONTO" -- "$a"
  ok "$HEIM/.ssh/authorized_keys geschrieben"
}

nach_schluessel() {
  local s="$W$HEIM/.ssh" a="$W$HEIM/.ssh/authorized_keys" m inhalt fp n
  m="$(meta "$s")" || m="?"
  if [[ "$m" != "$KONTO:$KONTO 700" ]]; then fehl "$HEIM/.ssh: $m (erwartet $KONTO:$KONTO 700)"; return; fi
  m="$(meta "$a")" || m="?"
  if [[ -L "$a" || "$m" != "$KONTO:$KONTO 600" ]]; then fehl "authorized_keys: $m (erwartet $KONTO:$KONTO 600)"; return; fi
  n="$(wc -l <"$a")"
  inhalt="$(cat -- "$a")"
  if [[ "$n" != 1 || "$inhalt" != "$ZEILE" ]]; then fehl "authorized_keys enthaelt nicht genau die erwartete Zeile"; return; fi
  fp="$(ssh-keygen -lf "$a" 2>/dev/null)" || fp=""
  if [[ "$fp" != "256 $SOLL_FINGERABDRUCK CENTRIC-Mobile (ED25519)" ]]; then fehl "Fingerabdruck der installierten Zeile weicht ab"; return; fi
  ok "authorized_keys 600, .ssh 700, Eigentuemer $KONTO, Fingerabdruck = Soll"
}

# --- Rueckbau -------------------------------------------------------------
rueckbau() {
  local z rc=0 name uid gecos heim shell a="$W$HEIM/.ssh/authorized_keys" n inhalt
  pruefe_root
  pruefe_os
  for z in userdel getent pgrep stat cat wc; do hat "$z" || fehl "Werkzeug fehlt: $z"; done
  z="$(getent passwd "$KONTO")" || rc=$?
  if ((rc == 2)); then
    schluss 1 "STOPP: Benutzer $KONTO existiert nicht; nichts zurueckzubauen. Es wurde nichts geaendert."
  elif ((rc != 0)); then
    fehl "Benutzer $KONTO nicht pruefbar (getent Rueckgabe $rc)"
  else
    IFS=: read -r name _ uid _ gecos heim shell < <(printf '%s\n' "$z")
    if [[ "$name" != "$KONTO" || ! "$uid" =~ ^[0-9]+$ ]] || ((uid < 1000)); then fehl "uid von $KONTO unter 1000 oder ungueltig ($uid); kein Rueckbau"; fi
    if [[ "$gecos" != "$MARKE" || "$heim" != "$HEIM" || "$shell" != /bin/bash ]]; then fehl "Konto $KONTO traegt nicht die Marke dieses Skripts; kein Rueckbau"; fi
  fi
  if [[ -L "$W$HEIM/.ssh" || -L "$a" ]]; then
    fehl "$HEIM/.ssh oder authorized_keys ist ein Link; kein Rueckbau"
  elif [[ -e "$a" ]]; then
    n="$(wc -l <"$a")"
    inhalt="$(cat -- "$a")"
    if [[ "$n" != 1 || "$inhalt" != "$ZEILE" ]]; then fehl "authorized_keys von $KONTO ist nicht genau die Zeile dieses Skripts; kein Rueckbau"; else ok "authorized_keys = Zeile dieses Skripts"; fi
  else
    info "keine authorized_keys (Einrichtung war unvollstaendig)"
  fi
  rc=0
  pgrep -u "$KONTO" >/dev/null 2>&1 || rc=$?
  case "$rc" in
    0) fehl "laufende Prozesse von $KONTO (erst abmelden)" ;;
    1) ok "keine laufenden Prozesse von $KONTO" ;;
    *) fehl "Prozesse von $KONTO nicht pruefbar (pgrep Rueckgabe $rc)" ;;
  esac
  if ((FEHLER > 0)); then
    schluss 1 "STOPP: $FEHLER Befund(e), kein Rueckbau. Es wurde nichts geaendert."
  fi
  PHASE=rueckbau
  userdel -r "$KONTO" >/dev/null 2>&1 || true
  rc=0
  getent passwd "$KONTO" >/dev/null 2>&1 || rc=$?
  if ((rc != 2)) || [[ -e "$W$HEIM" || -L "$W$HEIM" ]]; then
    schluss 3 "STOPP: Rueckbau unvollstaendig ($KONTO oder $HEIM besteht noch). Zustand pruefen."
  fi
  rc=0
  getent group "$KONTO" >/dev/null 2>&1 || rc=$?
  if ((rc == 0)); then info "Gruppe $KONTO besteht noch (nicht entfernt)"; fi
  schluss 0 "RUECKGEBAUT: $KONTO entfernt (Konto, $HEIM)"
}

# --- Ablauf ---------------------------------------------------------------
case "$MODUS" in
  trocken) info "HANDY-ZUGANG Probelauf: es wird nichts geaendert" ;;
  rueckbau) info "HANDY-ZUGANG Rueckbau: nur Konto $KONTO" ;;
  *) info "HANDY-ZUGANG Einrichtung: Konto $KONTO" ;;
esac

if [[ "$MODUS" == rueckbau ]]; then
  rueckbau
fi

vorpruefungen
if ((FEHLER > 0)); then
  schluss 1 "STOPP: $FEHLER Befund(e). Es wurde nichts geaendert."
fi

if [[ "$MODUS" == trocken ]]; then
  plan "useradd --create-home --shell /bin/bash --user-group --comment '$MARKE' $KONTO"
  plan "keine weiteren Gruppen (nicht sudo, admin, adm, docker); passwd -l $KONTO"
  plan "$HEIM/.ssh 0700 und authorized_keys 0600, Eigentuemer $KONTO, Inhalt:"
  info "$ZEILE"
  plan "danach pruefen: Gruppen, sudo -l, docker.sock, sshd -T, Modi, Fingerabdruck"
  hostschluessel_info
  if ((WARNUNGEN > 0)); then
    schluss 0 "PROBELAUF OK: es wuerde $KONTO angelegt, wegen $WARNUNGEN Warnung(en) nur mit --ja-trotz-warnung (nichts geaendert)"
  fi
  schluss 0 "PROBELAUF OK: es wuerde $KONTO angelegt (nichts geaendert)"
fi

if ((WARNUNGEN > 0)) && [[ "$MODUS" != ja-trotz-warnung ]]; then
  schluss 1 "STOPP: $WARNUNGEN Warnung(en); Einrichtung nur mit --ja-trotz-warnung. Es wurde nichts geaendert."
fi

PHASE=aendern
if ! useradd --create-home --shell /bin/bash --user-group --comment "$MARKE" "$KONTO" >/dev/null 2>&1; then
  schluss 3 "STOPP: useradd gescheitert. Zustand pruefen; Rueckbau: --rueckbau"
fi
passwd -l "$KONTO" >/dev/null 2>&1 || fehl "passwd -l $KONTO gescheitert"
nach_konto
nach_gruppen
nach_passwort
nach_sudo
nach_docker
pruefe_sshd
if ((FEHLER > 0)); then
  schluss 3 "STOPP: Konto $KONTO angelegt, Nachpruefung gescheitert; KEIN Schluessel hinterlegt. Rueckbau: --rueckbau"
fi
schluessel_ablegen
if ((FEHLER == 0)); then nach_schluessel; fi
if ((FEHLER > 0)); then
  rm -f -- "$W$HEIM/.ssh/authorized_keys"
  schluss 3 "STOPP: Schluessel nicht korrekt abgelegt und entfernt. Rueckbau: --rueckbau"
fi
info "Termius: Benutzer $KONTO, Schluessel CENTRIC-Mobile, Adresse aus dem IONOS-Panel, Port laut Zeile sshd port"
hostschluessel_info
schluss 0 "EINGERICHTET: $KONTO, Fingerabdruck $SOLL_FINGERABDRUCK"
