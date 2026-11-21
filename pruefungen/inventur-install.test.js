/* ==========================================================================
   REL-0-INSTALLER — deploy/inventur-install.sh und
   werkzeug/inventur-install-bauen.mjs

   Der Installer läuft in einer simulierten Wurzel (INVENTUR_INSTALL_PRUEFWURZEL)
   mit Stubs im festen PATH (INVENTUR_INSTALL_PRUEFPFAD):
     id, getent, sshd, dpkg-query  — liefern die Systemsicht aus Testdateien
     stat, chmod, chown, mv        — führen eine Metadatentabelle (Besitz,
                                     Modus), weil die Testumgebung weder root
                                     ist noch unter Windows echte Rechte kennt;
                                     chmod und mv wirken zusätzlich echt
   Alle übrigen Werkzeuge (sha256sum, ssh-keygen, grep, …) sind echt.

   Geprüft wird:
     - Erzeuger: Schlüsselprüfung (fehlt/ungültig), Block = Repo (--pruefen)
     - jede Vorabprüfung negativ → Rückgabe 1, letzte Zeile „REL-0 ABBRUCH: …
       Es wurde nichts geändert.“, Dateisystem und Metadaten vorher = nachher
     - Erfolg, Idempotenz, --trocken, --rueckbau (auch: verweigert bei
       verändertem authorized_keys), Rücknahme bei gescheiterter Selbstprüfung
     - keine Ausgabe von Schlüsselkörpern, privaten Schlüsseln, .env-Werten
     - Mutationsnachweis: ohne die jeweilige Prüfung wird der Negativfall grün
     - Quelltext-Wächter (keine Netz-/Dienst-/Konto-Befehle), Dateimodus 100755,
       Prüfsumme in der Anleitung

   Unter Linux (CI) läuft alles. Unter Windows nur mit Git Bash; sonst
   übersprungen.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bashFinden, p, posixPfad, ohneKommentareUndZeichenketten } from "./inventur-hilfen.mjs";
import { bauen, block, schluesselPruefen, befehl, lesenStandard, BEGINN, ENDE } from "../werkzeug/inventur-install-bauen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = path.join(WURZEL, "deploy", "inventur-install.sh");
const INVENTUR = path.join(WURZEL, "deploy", "inventur.sh");
const BAUER = path.join(WURZEL, "werkzeug", "inventur-install-bauen.mjs");
const BASH = bashFinden();
const FESTER_PFAD = "/usr/sbin:/usr/bin:/sbin:/bin";
/* Ein Installerlauf startet unter Git Bash einige hundert Prozesse (10–25 s); Fälle mit bis zu drei Läufen (Idempotenz,
   Rückbau) brauchen deshalb mehr als 60 s. Jeder Lauf hat zusätzlich seine eigene Grenze (spawnSync, LAUF_GRENZE_MS);
   H-2 (Review #458): sie liegt nahe an der Vitest-Grenze (180 s), damit ein langsamer Lauf unter Windows-Last nicht
   vorzeitig beendet wird. Ein Abbruch (Zeitgrenze, Signal, Startfehler) wird ausdrücklich gemeldet, nie als code null. */
const TEST_GRENZE_MS = 180000;
const LAUF_GRENZE_MS = 150000;
vi.setConfig({ testTimeout: TEST_GRENZE_MS });

const sha = (b) => createHash("sha256").update(b).digest("hex");
const INVENTUR_TEXT = readFileSync(INVENTUR, "utf8");
const INVENTUR_SHA = sha(Buffer.from(INVENTUR_TEXT, "utf8"));

/* Öffentlicher ed25519-Schlüssel aus festen Bytes (kein erzeugter Schlüssel, kein privater Teil). */
function koerper(byte) {
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const typ = Buffer.from("ssh-ed25519");
  return Buffer.concat([u32(typ.length), typ, u32(32), Buffer.alloc(32, byte)]).toString("base64");
}
const KOERPER = koerper(0x51);
const PUB = `ssh-ed25519 ${KOERPER} inventur-centric\n`;
const OPTIONEN =
  'command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc';
const ZEILE = `${OPTIONEN} ssh-ed25519 ${KOERPER} inventur-centric`;
const ALT_1 = `ssh-ed25519 ${koerper(0x61)} betreiber@arbeitsplatz`;
const ALT_2 = `command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 ${koerper(0x62)} deploy`;
const ALT = `${ALT_1}\n${ALT_2}\n`;
const ENV_GEHEIM = "ENV-GEHEIMNIS-REL0-918";

const SSHD_T_STANDARD = [
  "port 22",
  "permitrootlogin prohibit-password",
  "pubkeyauthentication yes",
  "passwordauthentication no",
  "permituserenvironment no",
  "strictmodes yes",
  "authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2",
  "acceptenv LANG",
  "acceptenv LC_*",
  "subsystem sftp /usr/lib/openssh/sftp-server",
].join("\n");

/* Standard-/etc/ssh/sshd_config von Ubuntu 24.04 (openssh-server 1:9.6p1-3ubuntu13), wörtlich bis auf gekürzte
   Kommentarblöcke; enthält das auskommentierte Beispiel „#Match User anoncvs“. */
const UBUNTU_2404_SSHD_CONFIG = `
# This is the sshd server system-wide configuration file.  See
# sshd_config(5) for more information.

# This sshd was compiled with PATH=/usr/local/bin:/usr/bin:/bin:/usr/games

# The strategy used for options in the default sshd_config shipped with
# OpenSSH is to specify options with their default value where
# possible, but leave them commented.  Uncommented options override the
# default value.

Include /etc/ssh/sshd_config.d/*.conf

# When systemd socket activation is used (the default), the socket
# configuration must be re-generated after changing Port, AddressFamily, or
# ListenAddress.
#
# For changes to take effect, run:
#
#   systemctl daemon-reload
#   systemctl restart ssh.socket
#
#Port 22
#AddressFamily any
#ListenAddress 0.0.0.0
#ListenAddress ::

#HostKey /etc/ssh/ssh_host_rsa_key
#HostKey /etc/ssh/ssh_host_ecdsa_key
#HostKey /etc/ssh/ssh_host_ed25519_key

# Logging
#SyslogFacility AUTH
#LogLevel INFO

# Authentication:

#LoginGraceTime 2m
#PermitRootLogin prohibit-password
#StrictModes yes
#MaxAuthTries 6
#MaxSessions 10

#PubkeyAuthentication yes

# Expect .ssh/authorized_keys2 to be disregarded by default in future.
#AuthorizedKeysFile	.ssh/authorized_keys .ssh/authorized_keys2

#AuthorizedPrincipalsFile none

#AuthorizedKeysCommand none
#AuthorizedKeysCommandUser nobody

# To disable tunneled clear text passwords, change to no here!
#PasswordAuthentication yes
#PermitEmptyPasswords no

# Change to yes to enable challenge-response passwords (beware issues with
# some PAM modules and threads)
KbdInteractiveAuthentication no

UsePAM yes

#AllowAgentForwarding yes
#AllowTcpForwarding yes
#GatewayPorts no
X11Forwarding yes
#X11DisplayOffset 10
#X11UseLocalhost yes
#PermitTTY yes
PrintMotd no
#PrintLastLog yes
#TCPKeepAlive yes
#PermitUserEnvironment no
#Compression delayed
#ClientAliveInterval 0
#ClientAliveCountMax 3
#UseDNS no
#PidFile /run/sshd.pid
#MaxStartups 10:30:100
#PermitTunnel no
#ChrootDirectory none
#VersionAddendum none

# no default banner path
#Banner none

# Allow client to pass locale and color environment variables
AcceptEnv LANG LC_* COLORTERM NO_COLOR

# override default of no subsystems
Subsystem	sftp	/usr/lib/openssh/sftp-server

# Example of overriding settings on a per-user basis
#Match User anoncvs
#	X11Forwarding no
#	AllowTcpForwarding no
#	PermitTTY no
#	ForceCommand cvs server
`;

/* ---------------------------------------------------------------- Stubs */
const STUBS = {
  id: `#!/bin/bash
case "$1" in
  -u) printf '%s\\n' "\${PRUEF_UID:-0}" ;;
  -nG) printf '%s\\n' "\${PRUEF_GRUPPEN:-admin sudo docker}" ;;
  *) exit 1 ;;
esac
`,
  getent: `#!/bin/bash
[[ "$1" == passwd && -n "$2" ]] || exit 2
awk -F: -v k="$2" '$1 == k || $3 == k { print; f = 1 } END { exit f ? 0 : 2 }' "$PRUEF_PASSWD"
`,
  /* sshd -T -C …: eigene Ausgabe, falls PRUEF_SSHD_T_C existiert (Match-Block wirkt nur mit Verbindungsdaten) */
  sshd: `#!/bin/bash
printf 'sshd %s\\n' "$*" >>"$PRUEF_PROTOKOLL"
case "$1" in
  -T) if [[ "\${2:-}" == -C && -f "\${PRUEF_SSHD_T_C:-}" ]]; then cat "$PRUEF_SSHD_T_C"; else cat "$PRUEF_SSHD_T"; fi ;;
  -t) exit "\${PRUEF_SSHD_t_RC:-0}" ;;
  *) exit 1 ;;
esac
`,
  "dpkg-query": `#!/bin/bash
printf '%s' "\${PRUEF_OPENSSH:-1:9.6p1-3ubuntu13.5}"
`,
  /* Metadatentabelle: pfad|uid|gid|modus|benutzer|gruppe (letzte Zeile gilt) */
  stat: `#!/bin/bash
fmt=""; pfade=()
while (($#)); do
  case "$1" in
    -c) fmt="$2"; shift 2 ;;
    --) shift; pfade+=("$@"); break ;;
    *) pfade+=("$1"); shift ;;
  esac
done
[[ "$fmt" == '%u %g %a %U %G' ]] || exec /usr/bin/stat -c "$fmt" -- "\${pfade[@]}"
for x in "\${pfade[@]}"; do
  [[ -e "$x" || -L "$x" ]] || { echo "stat: $x fehlt" >&2; exit 1; }
  z="$(awk -F'|' -v k="$x" '$1 == k { z = $0 } END { print z }' "$PRUEF_META")"
  if [[ -n "$z" ]]; then
    IFS='|' read -r _ u g m bn gn <<<"$z"
    printf '%s %s %s %s %s\\n' "$u" "$g" "$m" "$bn" "$gn"
  else
    printf '0 0 %s root root\\n' "$(/usr/bin/stat -c '%a' -- "$x")"
  fi
done
`,
  chmod: `#!/bin/bash
m="$1"; x="$2"
/usr/bin/chmod "$m" "$x" || exit 1
m="$(printf '%s' "$m" | sed -E 's/^0([0-7]{3})$/\\1/')"
z="$(awk -F'|' -v k="$x" '$1 == k { z = $0 } END { print z }' "$PRUEF_META")"
if [[ -n "$z" ]]; then IFS='|' read -r _ u g _ bn gn <<<"$z"; else u=0; g=0; bn=root; gn=root; fi
printf '%s|%s|%s|%s|%s|%s\\n' "$x" "$u" "$g" "$m" "$bn" "$gn" >>"$PRUEF_META"
printf 'chmod %s %s\\n' "$m" "$x" >>"$PRUEF_PROTOKOLL"
`,
  /* setpriv --reuid=N --regid=N --clear-groups -- befehl …: führt den Befehl aus und bildet die Rechteprüfung
     des Kerns nach: Schreibt der Befehl auf eine Datei (auch über einen Link), deren Ziel nicht N gehört,
     wird er verweigert (wie bei einem echten Wechsel auf das Konto). Neue Dateien gehören N.
     PRUEF_LINK_TAUSCH: vor dem ersten „tee -a“ wird authorized_keys durch einen Link auf diese Datei ersetzt.
     PRUEF_KUERZEN_FEHLER: „truncate“ scheitert. */
  setpriv: `#!/bin/bash
n=""; while (($#)); do case "$1" in --reuid=*) n="\${1#--reuid=}"; shift ;; --) shift; break ;; -*) shift ;; *) break ;; esac; done
printf 'setpriv %s %s\\n' "$n" "$*" >>"$PRUEF_PROTOKOLL"
bef="$1"; ziel="\${!#}"
if [[ "$bef" == tee && -n "\${PRUEF_LINK_TAUSCH:-}" && ! -e "$PRUEF_PROTOKOLL.getauscht" ]]; then
  : >"$PRUEF_PROTOKOLL.getauscht"; rm -f -- "$ziel"; ln -s -- "$PRUEF_LINK_TAUSCH" "$ziel"
fi
if [[ "$bef" == truncate && -n "\${PRUEF_KUERZEN_FEHLER:-}" ]]; then echo "truncate: Fehler" >&2; exit 1; fi
case "$bef" in
  tee|truncate|chmod|touch|rm)
    echt="$ziel"; [[ -L "$ziel" ]] && echt="$(readlink -- "$ziel")"
    if [[ -e "$echt" ]]; then
      z="$(awk -F'|' -v k="$echt" '$1 == k { z = $0 } END { print z }' "$PRUEF_META")"
      u=0; [[ -n "$z" ]] && IFS='|' read -r _ u _ _ _ _ <<<"$z"
      if [[ "$bef" != rm && "$u" != "$n" ]]; then echo "$bef: Keine Berechtigung" >&2; exit 1; fi
    fi ;;
esac
neu=nein; [[ -e "$ziel" ]] || neu=ja
"$@" || exit $?
if [[ "$neu" == ja && -e "$ziel" ]]; then
  printf '%s|%s|%s|%s|%s|%s\\n' "$ziel" "$n" "$n" "$(/usr/bin/stat -c '%a' -- "$ziel")" "admin" "admin" >>"$PRUEF_META"
fi
`,
  chown: `#!/bin/bash
[[ "$1" == -h ]] && shift
ug="$1"; x="$2"
[[ -e "$x" ]] || exit 1
name() { case "$1" in 0|root) echo "0 root" ;; 1000|admin) echo "1000 admin" ;; *) echo "$1 n$1" ;; esac; }
read -r u bn <<<"$(name "\${ug%%:*}")"
read -r g gn <<<"$(name "\${ug#*:}")"
z="$(awk -F'|' -v k="$x" '$1 == k { z = $0 } END { print z }' "$PRUEF_META")"
if [[ -n "$z" ]]; then IFS='|' read -r _ _ _ m _ _ <<<"$z"; else m="$(/usr/bin/stat -c '%a' -- "$x")"; fi
printf '%s|%s|%s|%s|%s|%s\\n' "$x" "$u" "$g" "$m" "$bn" "$gn" >>"$PRUEF_META"
printf 'chown %s %s\\n' "$ug" "$x" >>"$PRUEF_PROTOKOLL"
`,
  mv: `#!/bin/bash
a=(); for x in "$@"; do case "$x" in -f|--) ;; *) a+=("$x") ;; esac; done
q="\${a[0]}"; z="\${a[1]}"
/usr/bin/mv -f -- "$q" "$z" || exit 1
awk -F'|' -v q="$q" -v z="$z" 'BEGIN { OFS = "|" } $1 == z { next } $1 == q { $1 = z } { print }' "$PRUEF_META" >"$PRUEF_META.neu"
/usr/bin/mv -f -- "$PRUEF_META.neu" "$PRUEF_META"
`,
};

/* awk-Stub (A-1, Review #458): scheitert nur beim awk-Programm der sshd-Dateiprüfung (erkennbar an „function inc(“),
   ohne Endmarke E; alle anderen awk-Aufrufe (Installer und Stubs) laufen mit dem echten awk. */
const AWK_STUB_SCHEITERT = `#!/bin/bash
for a in "$@"; do case "$a" in *"function inc("*) echo "awk: Fehler" >&2; exit 2 ;; esac; done
exec /usr/bin/awk "$@"
`;

/* tr-Stub (A-1 Delta-Review #458): scheitert nur bei der NUL-Zählung (tr -cd '\000'), ohne Ausgabe; wc zählt dann 0.
   Alle anderen tr-Aufrufe laufen mit dem echten tr. */
const TR_STUB_NUL_SCHEITERT = `#!/bin/bash
if [[ "\${1:-}" == -cd && "\${2:-}" == '\\000' ]]; then echo "tr: Lesefehler" >&2; exit 1; fi
exec /usr/bin/tr "$@"
`;

/* ---------------------------------------------------------- Testwurzel */
let tmp, w, stub, meta, passwd, sshdT, proto, inst;

function schreiben(f, inhalt, ausfuehrbar = false) {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, inhalt);
  if (ausfuehrbar) chmodSync(f, 0o755);
}
const W = (rel) => p(path.join(w, rel));
function metaSetzen(rel, uid, mode, name = uid === 0 ? "root" : uid === 1000 ? "admin" : `n${uid}`) {
  writeFileSync(meta, `${W(rel)}|${uid}|${uid}|${mode}|${name}|${name}\n`, { flag: "a" });
}
const AK_REL = "home/admin/.ssh/authorized_keys";
const ZIEL_REL = "usr/local/sbin/centric-inventur.sh";

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-rel0-"));
  w = path.join(tmp, "wurzel");
  stub = path.join(tmp, "stub");
  meta = path.join(tmp, "meta.txt");
  passwd = path.join(tmp, "passwd");
  sshdT = path.join(tmp, "sshd-T.txt");
  proto = path.join(tmp, "protokoll.txt");
  for (const [n, t] of Object.entries(STUBS)) schreiben(path.join(stub, n), t, true);
  schreiben(meta, "");
  schreiben(proto, "");
  schreiben(passwd, "root:x:0:0:root:/root:/bin/bash\nadmin:x:1000:1000:admin:/home/admin:/bin/bash\ndeploy:x:1001:1001::/home/deploy:/bin/bash\n");
  schreiben(sshdT, SSHD_T_STANDARD + "\n");
  schreiben(path.join(w, "etc", "os-release"), 'PRETTY_NAME="Ubuntu 24.04.5 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n');
  for (const d of ["usr/local/sbin", "root", "opt/apps/centric-dienstplanung/data", "home/admin/.ssh", "run/sshd"]) mkdirSync(path.join(w, d), { recursive: true });
  schreiben(path.join(w, "etc/ssh/sshd_config"), "Include /etc/ssh/sshd_config.d/*.conf\nKbdInteractiveAuthentication no\nUsePAM yes\nAcceptEnv LANG LC_*\nSubsystem sftp /usr/lib/openssh/sftp-server\n");
  schreiben(path.join(w, "etc/ssh/sshd_config.d/50-cloud-init.conf"), "PasswordAuthentication no\n");
  schreiben(path.join(w, "opt/apps/centric-dienstplanung/.env"), `CENTRIC_SMTP_PASSWORT=${ENV_GEHEIM}\n`);
  schreiben(path.join(w, AK_REL), ALT);
  metaSetzen("opt/apps/centric-dienstplanung", 1000, "755");
  metaSetzen("opt/apps/centric-dienstplanung/data", 1000, "700");
  metaSetzen("home/admin", 1000, "750");
  metaSetzen("home/admin/.ssh", 1000, "700");
  metaSetzen(AK_REL, 1000, "600");
  /* Testwurzel und Systemverzeichnisse: root, nicht für andere beschreibbar (unabhängig von der echten Plattform) */
  for (const d of ["", "usr", "usr/local", "usr/local/sbin", "root"]) writeFileSync(meta, `${d ? W(d) : p(w)}|0|0|755|root|root\n`, { flag: "a" });
  inst = path.join(tmp, "inventur-install.sh");
  writeFileSync(inst, gebaut());
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function gebaut({ schluessel = PUB, ersetze = [] } = {}) {
  let t = bauen({ vorlage: readFileSync(INSTALLER, "utf8"), skript: INVENTUR_TEXT, schluessel });
  for (const [a, b] of ersetze) {
    if (!t.includes(a)) throw new Error(`Mutation: Anker fehlt: ${a}`);
    t = t.replace(a, b);
  }
  return t;
}

function lauf(args = [], env = {}, datei = inst, grenzeMs = LAUF_GRENZE_MS) {
  const umgebung = {
    ...process.env,
    INVENTUR_INSTALL_PRUEFPFAD: `${posixPfad(stub)}:${FESTER_PFAD}`,
    INVENTUR_INSTALL_PRUEFWURZEL: p(w),
    PRUEF_META: p(meta),
    PRUEF_PASSWD: p(passwd),
    PRUEF_SSHD_T: p(sshdT),
    PRUEF_PROTOKOLL: p(proto),
    ...env,
  };
  for (const n of ["SSH_CONNECTION", "BASH_ENV", "ENV"]) if (!(n in env)) delete umgebung[n];
  const r = spawnSync(BASH, [p(datei), ...args], { encoding: "utf8", env: umgebung, timeout: grenzeMs });
  const out = r.stdout ?? "";
  if (r.error || r.signal || r.status === null) {
    const grund = r.error?.code === "ETIMEDOUT" ? `Zeitgrenze ${grenzeMs} ms überschritten` : r.error ? `Startfehler ${r.error.code ?? r.error.message}` : "ohne Rückgabewert";
    throw new Error(`Installerlauf abgebrochen (${grund}, Signal ${r.signal ?? "keins"}); letzte Ausgabe:\n${(out + (r.stderr ?? "")).slice(-2000)}`);
  }
  const zeilen = out.trimEnd().split("\n");
  return { code: r.status, out, err: r.stderr ?? "", letzte: zeilen[zeilen.length - 1], alles: out + (r.stderr ?? "") };
}

/* Abbild: jede Datei mit Inhalt-Hash, jedes Verzeichnis, dazu die Metadatentabelle (Besitz/Modus). */
function abbild() {
  const liste = [];
  const geh = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      const voll = path.join(d, n);
      const r = rel ? `${rel}/${n}` : n;
      const st = lstatSync(voll);
      if (st.isSymbolicLink()) liste.push(`L ${r}`);
      else if (st.isDirectory()) { liste.push(`D ${r}`); geh(voll, r); }
      else liste.push(`F ${r} ${sha(readFileSync(voll))}`);
    }
  };
  geh(w, "");
  return { dateien: liste.join("\n"), meta: readFileSync(meta, "utf8") };
}

function keineLecks(r) {
  expect(r.alles).not.toContain(KOERPER);
  expect(r.alles).not.toMatch(/AAAA[0-9A-Za-z+/]{16}/);
  expect(r.alles).not.toContain("PRIVATE KEY");
  expect(r.alles).not.toContain(ENV_GEHEIM);
}

function erwarteAbbruch(r, grund) {
  expect(r.code, r.alles).toBe(1);
  expect(r.letzte).toMatch(/^REL-0 ABBRUCH: .+\. Es wurde nichts geändert\.$/);
  if (grund) expect(r.letzte).toMatch(grund);
  keineLecks(r);
}

function negativ(vorbereiten, grund, args = [], env = {}) {
  vorbereiten();
  const vorher = abbild();
  const r = lauf(args, env);
  erwarteAbbruch(r, grund);
  expect(abbild()).toEqual(vorher);
  return r;
}

/* ------------------------------------------------------------- Erzeuger */
describe("werkzeug/inventur-install-bauen.mjs", () => {
  it("Schlüsselprüfung: gültiger ed25519-Schlüssel ergibt Zeile und Fingerabdruck wie ssh-keygen", () => {
    const k = schluesselPruefen(PUB);
    expect(k.zeile).toBe(PUB.trimEnd());
    expect(k.fingerabdruck).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    if (BASH) {
      const f = path.join(tmp, "k.pub");
      writeFileSync(f, PUB);
      const r = spawnSync(BASH, ["-c", `ssh-keygen -lf "${p(f)}"`], { encoding: "utf8" });
      if (r.status === 0) expect(r.stdout.split(" ")[1]).toBe(k.fingerabdruck);
    }
  });

  it("Schlüsselprüfung: fehlerhafte Dateien werden abgelehnt (fail-closed)", () => {
    const falsch = [
      ["zwei Zeilen", PUB + PUB],
      ["ohne Zeilenumbruch", PUB.trimEnd()],
      ["CRLF", PUB.replace("\n", "\r\n")],
      ["falscher Kommentar", PUB.replace("inventur-centric", "inventur")],
      ["RSA", `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ inventur-centric\n`],
      ["mit Optionen", `restrict ${PUB}`],
      ["Körper gekürzt", PUB.replace(KOERPER, KOERPER.slice(0, -1))],
      ["Körper falscher Typ", PUB.replace(KOERPER, Buffer.from(KOERPER, "base64").fill(0x41, 4, 15).toString("base64"))],
      /* Kopfzeile zusammengesetzt, damit der Geheimnis-Scan kein Muster im Quelltext findet */
      ["privater Schlüssel", ["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ") + "\n"],
      ["leer", ""],
    ];
    for (const [name, t] of falsch) expect(() => schluesselPruefen(t), name).toThrow();
    expect(() => bauen({ vorlage: readFileSync(INSTALLER, "utf8"), skript: INVENTUR_TEXT, schluessel: PUB + PUB })).toThrow();
  });

  it("Block: Nutzdaten byte-gleich, Terminator nicht im Skript, Vorlage ohne Block wird abgelehnt", () => {
    const b = block(INVENTUR_TEXT, null);
    expect(b).toContain(`readonly SOLL_SKRIPT_SHA256='${INVENTUR_SHA}'`);
    expect(b).toContain("readonly SCHLUESSEL_ZEILE=''");
    expect(() => block(INVENTUR_TEXT + "CENTRIC_INVENTUR_NUTZDATEN_ENDE\n", null)).toThrow();
    expect(() => block(INVENTUR_TEXT.trimEnd(), null)).toThrow();
    expect(() => bauen({ vorlage: "#!/bin/bash\n", skript: INVENTUR_TEXT, schluessel: null })).toThrow();
  });

  it("Repository: Installer entspricht dem erzeugten Stand (--pruefen grün); Schlüsseldatei fehlt oder ist gültig", () => {
    const r = spawnSync(process.execPath, [BAUER, "--pruefen"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const d = lesenStandard();
    if (d.schluessel != null) expect(() => schluesselPruefen(d.schluessel)).not.toThrow();
    else expect(readFileSync(INSTALLER, "utf8")).toContain("readonly SCHLUESSEL_ZEILE=''");
  });

  it("--pruefen erkennt einen von Hand geänderten Installer (rot)", () => {
    const kopie = path.join(tmp, "manipuliert.sh");
    writeFileSync(kopie, readFileSync(INSTALLER, "utf8").replace("readonly SOLL_SKRIPT_SHA256='", "readonly SOLL_SKRIPT_SHA256='0"));
    const r = spawnSync(process.execPath, [BAUER, "--pruefen", "--installer", kopie], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });

  it("Betreibereingabe: fester Commit, SHA-256-Vergleich vor der Ausführung, nur einfache Zeichen", () => {
    const t = readFileSync(INSTALLER, "utf8");
    const h = sha(Buffer.from(t, "utf8"));
    const b = befehl("0ec90fa0f8f7", t);
    /* zuerst --trocken mit frischem Download (alte Datei vorher gelöscht), dann einrichten mit erneutem Hash-Vergleich,
       Rückbau wieder mit frischem Download und Hash-Vergleich */
    const laden = `cd /root && rm -f rel0 && curl -fsSLo rel0 https://github.com/rinats-png/dienstplaner/raw/0ec90fa0f8f7/deploy/inventur-install.sh && [[ $(sha256sum rel0) == "${h}  rel0" ]]`;
    expect(b.trocken).toBe(`${laden} && bash rel0 --trocken`);
    expect(b.einrichten).toBe(`cd /root && [[ $(sha256sum rel0) == "${h}  rel0" ]] && bash rel0`);
    expect(b.rueckbau).toBe(`${laden} && bash rel0 --rueckbau`);
    /* keine Pipe, keine Umlenkung, kein Semikolon */
    for (const z of Object.values(b)) expect(z).not.toMatch(/[|;<>`']/);
    expect(() => befehl("main", t)).toThrow();
  });
});

/* ------------------------------------------------------------ Installer */
describe.skipIf(!BASH)("deploy/inventur-install.sh — Vorabprüfungen (Abbruch ohne Änderung)", () => {
  it("Syntax; unbekannte Option → 2; --hilfe → 0", () => {
    expect(spawnSync(BASH, ["-n", p(INSTALLER)], { encoding: "utf8" }).status).toBe(0);
    const r = lauf(["--los"]);
    expect(r.code).toBe(2);
    expect(r.letzte).toBe("REL-0 ABBRUCH: unbekannter Aufruf. Es wurde nichts geändert.");
    expect(lauf(["--hilfe"]).code).toBe(0);
  });

  it("nicht root → Abbruch", () => negativ(() => {}, /als root/, [], { PRUEF_UID: "1000" }));
  it("Betriebssystem nicht Ubuntu 24.04 → Abbruch", () =>
    negativ(() => schreiben(path.join(w, "etc/os-release"), "ID=ubuntu\nVERSION_ID=\"22.04\"\n"), /Ubuntu 24\.04/));
  it("Betriebsverzeichnis gehört root → Abbruch", () =>
    negativ(() => {
      metaSetzen("opt/apps/centric-dienstplanung", 0, "755");
      metaSetzen("opt/apps/centric-dienstplanung/data", 0, "700");
    }, /gehört root/));
  it("falscher Besitz (anderes Konto als admin) → Abbruch", () =>
    negativ(() => {
      metaSetzen("opt/apps/centric-dienstplanung", 1001, "755", "deploy");
      metaSetzen("opt/apps/centric-dienstplanung/data", 1001, "700", "deploy");
    }, /erwartet admin/));
  it("mehrere Konten (data/ gehört einem anderen Konto) → Abbruch", () =>
    negativ(() => metaSetzen("opt/apps/centric-dienstplanung/data", 1001, "700", "deploy"), /verschiedenen Konten/));
  it("Konto mit nologin → Abbruch", () =>
    negativ(() => schreiben(passwd, "admin:x:1000:1000::/home/admin:/usr/sbin/nologin\n"), /keine Login-Shell/));
  it("Konto fehlt in getent → Abbruch", () => negativ(() => schreiben(passwd, "root:x:0:0::/root:/bin/bash\n"), /fehlt/));
  it("acceptenv * → Abbruch", () => negativ(() => schreiben(sshdT, SSHD_T_STANDARD + "\nacceptenv *\n"), /acceptenv/));
  it("acceptenv BASH_ENV / INVENTUR_* / LD_PRELOAD → Abbruch", () => {
    for (const v of ["BASH_ENV", "INVENTUR_*", "CENTRIC_VERZ", "SSH_ORIGINAL_COMMAND", "PATH", "LD_PRELOAD", "L*"]) {
      schreiben(sshdT, SSHD_T_STANDARD + `\nacceptenv ${v}\n`);
      const vorher = abbild();
      erwarteAbbruch(lauf(), /acceptenv/);
      expect(abbild()).toEqual(vorher);
    }
  }, 300000);
  it("permituserenvironment yes → Abbruch", () =>
    negativ(() => schreiben(sshdT, SSHD_T_STANDARD.replace("permituserenvironment no", "permituserenvironment yes")), /permituserenvironment/));
  it("pubkeyauthentication no → Abbruch", () =>
    negativ(() => schreiben(sshdT, SSHD_T_STANDARD.replace("pubkeyauthentication yes", "pubkeyauthentication no")), /pubkeyauthentication/));
  it("strictmodes no → Abbruch", () => negativ(() => schreiben(sshdT, SSHD_T_STANDARD.replace("strictmodes yes", "strictmodes no")), /strictmodes/));
  it("AllowUsers schließt das Konto aus → Abbruch", () =>
    negativ(() => schreiben(sshdT, SSHD_T_STANDARD + "\nallowusers centricadmin deploy\n"), /allowusers/));
  it("AllowGroups ohne Gruppe des Kontos → Abbruch; DenyUsers nennt das Konto → Abbruch", () => {
    negativ(() => schreiben(sshdT, SSHD_T_STANDARD + "\nallowgroups sshnur\n"), /allowgroups/);
    negativ(() => schreiben(sshdT, SSHD_T_STANDARD + "\ndenyusers admin\n"), /denyusers/);
  });
  it("authorizedkeysfile außerhalb des Heimatverzeichnisses → Abbruch", () =>
    negativ(() => schreiben(sshdT, SSHD_T_STANDARD.replace("authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2", "authorizedkeysfile /etc/ssh/keys/%u")), /authorizedkeysfile/));
  it("sshd -T scheitert / sshd -t meldet Fehler → Abbruch", () => {
    negativ(() => rmSync(sshdT), /sshd -T/);
    schreiben(sshdT, SSHD_T_STANDARD + "\n");
    negativ(() => {}, /sshd -t/, [], { PRUEF_SSHD_t_RC: "255" });
  });
  it("OpenSSH zu alt (7.1) → Abbruch", () => negativ(() => {}, /7\.2/, [], { PRUEF_OPENSSH: "1:7.1p2-2" }));
  it("authorized_keys für Gruppe/andere beschreibbar (664, 666) oder falscher Besitzer → Abbruch (E-b)", () => {
    negativ(() => metaSetzen(AK_REL, 1000, "664"), /600, 640 oder 644/);
    negativ(() => metaSetzen(AK_REL, 1000, "666"), /600, 640 oder 644/);
    negativ(() => metaSetzen(AK_REL, 0, "600"), /600, 640 oder 644/);
  }, 180000);
  it("Match-Block in sshd_config, sshd_config.d oder einem Include-Ziel → Abbruch (B-2)", () => {
    const fall = (rel, text) => {
      const f = path.join(w, rel);
      const alt = existsSync(f) ? readFileSync(f, "utf8") : null;
      schreiben(f, (alt ?? "") + text);
      const vorher = abbild();
      erwarteAbbruch(lauf(), /Match/);
      expect(abbild()).toEqual(vorher);
      if (alt == null) rmSync(f); else writeFileSync(f, alt);
    };
    fall("etc/ssh/sshd_config", "Match User admin\n  AcceptEnv *\n");
    fall("etc/ssh/sshd_config.d/60-x.conf", "  match address 10.0.0.0/8\n    PermitUserEnvironment yes\n");
    /* Include-Ziel außerhalb von sshd_config.d (relativ zu /etc/ssh, wie sshd) */
    schreiben(path.join(w, "etc/ssh/extra/a.conf"), "\tMATCH Group docker\n");
    fall("etc/ssh/sshd_config", "Include extra/*.conf\n");
  }, 300000);
  it("Match und Include in Schreibweisen, die sshd auch annimmt (Anführungszeichen, „=“) → Abbruch (Delta-Review A-1)", () => {
    const fall = (rel, text) => {
      const f = path.join(w, rel);
      const alt = existsSync(f) ? readFileSync(f, "utf8") : null;
      schreiben(f, (alt ?? "") + text);
      const vorher = abbild();
      erwarteAbbruch(lauf(), /Match|Include/);
      expect(abbild()).toEqual(vorher);
      if (alt == null) rmSync(f); else writeFileSync(f, alt);
    };
    fall("etc/ssh/sshd_config.d/60-x.conf", '"Match" User admin\n  AcceptEnv *\n');
    fall("etc/ssh/sshd_config.d/60-x.conf", "Match=User admin\n");
    fall("etc/ssh/sshd_config.d/60-x.conf", "  match = Address 10.0.0.0/8\n");
    schreiben(path.join(w, "etc/ssh/extra/a.conf"), "Match User admin\n");
    fall("etc/ssh/sshd_config", 'Include "/etc/ssh/extra/a.conf"\n');
    fall("etc/ssh/sshd_config", "Include=/etc/ssh/extra/a.conf\n");
    fall("etc/ssh/sshd_config", '"Include" extra/*.conf\n');
    /* Pfad mit Leerzeichen in Anführungszeichen: nicht verfolgbar → fail-closed */
    fall("etc/ssh/sshd_config", 'Include "/etc/ssh/mit leer/x.conf"\n');
  }, 600000);
  /* Delta-Review #447 N-1: sshd (strdelim) entfernt Anführungszeichen auch mitten im Wort und überspringt ein leeres
     erstes Token (führendes „=“ oder „""“). Mit OpenSSH 9.5 bestätigt. */
  const N_FAELLE_MATCH = [
    ["M\"atch\"", 'M"atch" User admin\n  AcceptEnv *\n'],
    ["\"\"Match", '""Match User admin\n  AcceptEnv *\n'],
    ["=Match", "=Match User admin\n  AcceptEnv *\n"],
    [" = Match", " = Match User admin\n  AcceptEnv *\n"],
    ["\"Match\"x (sshd: Schlüsselwort Match, Argument x)", '"Match"x User admin\n'],
    ["Match mit CRLF", "Match User admin\r\n  AcceptEnv *\r\n"],
  ];
  for (const [name, text] of N_FAELLE_MATCH) {
    it(`N-1: Match-Schreibweise ${name} → Abbruch ohne Änderung`, () => {
      negativ(() => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), text), /Match/);
    });
  }
  /* N-2: Include-Zeilen, die sshd (argv_split) anders liest als ein einfaches Aufteilen, werden fail-closed
     abgewiesen; CRLF wird wie bei sshd am Zeilenende abgeschnitten und das Ziel verfolgt. Das Ziel enthält jeweils
     einen Match-Block: Ein stilles Überspringen der Zeile ließe den Lauf grün werden. */
  const N_FAELLE_INCLUDE = [
    ["'…' (einfache Anführungszeichen)", "Include '/etc/ssh/extra/a.conf'\n", /Include/],
    ["'…' mit Leerzeichen", "Include '/etc/ssh/mit leer.conf'\n", /Include/],
    ["Backslash-Leerzeichen", "Include /etc/ssh/mit\\ leer.conf\n", /Include/],
    ["Inc\"lude\"", 'Inc"lude" /etc/ssh/extra/a.conf\n', /Match|Include/],
    ["=Include", "=Include /etc/ssh/extra/a.conf\n", /Match|Include/],
    ["CRLF", "Include /etc/ssh/extra/a.conf\r\n", /Match|Include/],
    ["Sonderzeichen ($, ~, [, #)", "Include /etc/ssh/extra/$X.conf ~/b.conf\n", /Include/],
    ["Wagenrücklauf mitten in der Zeile", "Include /etc/ssh/extra/a.conf\r/etc/ssh/b.conf\n", /Include/],
  ];
  for (const [name, text, grund] of N_FAELLE_INCLUDE) {
    it(`N-2: Include-Schreibweise ${name} → Abbruch ohne Änderung`, () => {
      negativ(() => {
        schreiben(path.join(w, "etc/ssh/extra/a.conf"), "Match User admin\n  AcceptEnv *\n");
        schreiben(path.join(w, "etc/ssh/mit leer.conf"), "Match User admin\n");
        writeFileSync(path.join(w, "etc/ssh/sshd_config"), readFileSync(path.join(w, "etc/ssh/sshd_config"), "utf8") + text);
      }, grund);
    });
  }
  /* Review #458 B-1: sshd (load_server_config) übernimmt jede gelesene Zeile nur bis zum ersten NUL-Byte; der Rest und
     der Zeilenumbruch fallen weg, die nächste Zeile hängt sich direkt an (führender Leerraum wird abgeschnitten).
     „Ma\0\ntch User admin“ liest sshd als „Match User admin“ (mit OpenSSH 9.5p2 nachgewiesen). Jede Datei mit
     NUL-Byte wird deshalb fail-closed abgewiesen, auch in Kommentaren und am Dateiende. */
  const B1_FAELLE_NUL = [
    ["Ma\\0\\ntch in sshd_config.d", () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "Ma\0\ntch User admin\n  AcceptEnv *\n")],
    ["Inc\\0\\nlude in sshd_config", () => {
      schreiben(path.join(w, "etc/ssh/extra/a.conf"), "Match User admin\n  AcceptEnv *\n");
      writeFileSync(path.join(w, "etc/ssh/sshd_config"), readFileSync(path.join(w, "etc/ssh/sshd_config"), "utf8") + "Inc\0\nlude /etc/ssh/extra/a.conf\n");
    }],
    ["NUL im Include-Ziel", () => {
      schreiben(path.join(w, "etc/ssh/extra/a.conf"), "Ma\0\n\ttch User admin\n  AcceptEnv *\n");
      writeFileSync(path.join(w, "etc/ssh/sshd_config"), readFileSync(path.join(w, "etc/ssh/sshd_config"), "utf8") + "Include extra/*.conf\n");
    }],
    ["NUL in einer Kommentarzeile", () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "# Hinweis\0 alt\nPasswordAuthentication no\n")],
    ["NUL nur am Dateiende", () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "PasswordAuthentication no\n\0")],
  ];
  for (const [name, vorbereiten] of B1_FAELLE_NUL) {
    it(`B-1: ${name} → Abbruch „enthält NUL-Byte“ ohne Änderung`, () => {
      negativ(vorbereiten, /sshd-Konfigurationsdatei \/etc\/ssh\/\S+ enthält NUL-Byte; fail-closed/);
    });
  }
  /* Review #458 A-2: sshd schneidet führendes \r (wie Leerraum) ab; der Installer ersetzt \r vor dem Normalisieren. */
  const A2_FAELLE_CR = [
    ["\\rMatch User admin", "\rMatch User admin\n  AcceptEnv *\n", /Match/],
    [" \\r=Match User x", " \r=Match User x\n", /Match/],
    ["\\rInclude /etc/ssh/x.conf", "\rInclude /etc/ssh/x.conf\n", /Include/],
  ];
  for (const [name, text, grund] of A2_FAELLE_CR) {
    it(`A-2: ${name} → Abbruch ohne Änderung`, () => {
      negativ(() => {
        schreiben(path.join(w, "etc/ssh/x.conf"), "Match User admin\n");
        schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), text);
      }, grund);
    });
  }
  /* Review #458 A-1: scheitert awk (ohne Endmarke E), bricht der Installer ab („nicht auswertbar“). */
  it("A-1: awk scheitert bei der sshd-Auswertung (exit 2, ohne Endmarke) → Abbruch „nicht auswertbar“", () => {
    negativ(() => schreiben(path.join(stub, "awk"), AWK_STUB_SCHEITERT, true), /sshd-Konfigurationsdatei \/etc\/ssh\/sshd_config nicht auswertbar/);
  });
  /* Delta-Review #458 A-1: scheitert die NUL-Zählung (tr bricht ab, Datei unlesbar), zählt wc trotzdem 0. Der Installer
     wertet den Rückgabewert der Pipeline aus und bricht ab („nicht auf NUL-Byte prüfbar“). */
  it("A-1 (Delta): tr scheitert bei der NUL-Zählung (exit 1, keine Ausgabe) → Abbruch „nicht auf NUL-Byte prüfbar“", () => {
    negativ(() => schreiben(path.join(stub, "tr"), TR_STUB_NUL_SCHEITERT, true), /sshd-Konfigurationsdatei \/etc\/ssh\/sshd_config nicht auf NUL-Byte prüfbar; fail-closed/);
  });
  it("A-1 (Delta) Mutation: ohne „|| n=x“ endet der Lauf nicht mit der geordneten Abbruchzeile", () => {
    schreiben(path.join(stub, "tr"), TR_STUB_NUL_SCHEITERT, true);
    writeFileSync(inst, gebaut({ ersetze: [["|| n=x", ""]] }));
    const r = lauf(["--trocken"]);
    expect(r.letzte).not.toMatch(/nicht auf NUL-Byte prüfbar/);
  });
  it("H-2: lauf() meldet einen Abbruch durch die Zeitgrenze ausdrücklich (kein stilles code null)", () => {
    const f = path.join(tmp, "langsam.sh");
    schreiben(f, "#!/bin/bash\nsleep 8\n", true);
    expect(() => lauf([], {}, f, 1500)).toThrow(/Installerlauf abgebrochen \(Zeitgrenze 1500 ms überschritten, Signal SIGTERM\)/);
  });
  it("N-1/N-2: kein Fehlalarm gegen die Standard-sshd_config von Ubuntu 24.04 (#Match-Kommentar, Include); „Matchx“ wie bisher", () => {
    schreiben(path.join(w, "etc/ssh/sshd_config"), UBUNTU_2404_SSHD_CONFIG);
    schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "Matchx yes\n");
    const vorher = abbild();
    const r = lauf(["--trocken"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toMatch(/ok +sshd-Konfiguration ohne Match-Blöcke \(3 Dateien gelesen\)/);
    expect(r.letzte).toMatch(/^REL-0 TROCKEN OK: /);
    expect(abbild()).toEqual(vorher);
  });
  it("sshd -T -C (Verbindungsdaten) weicht ab: permituserenvironment yes / acceptenv * → Abbruch (B-2)", () => {
    const c = path.join(tmp, "sshd-T-C.txt");
    negativ(() => schreiben(c, SSHD_T_STANDARD.replace("permituserenvironment no", "permituserenvironment yes") + "\n"), /permituserenvironment/, [], { PRUEF_SSHD_T_C: p(c) });
    negativ(() => schreiben(c, SSHD_T_STANDARD + "\nacceptenv *\n"), /acceptenv/, [], { PRUEF_SSHD_T_C: p(c) });
  }, 180000);
  it("sshd_config fehlt → Abbruch; /run/sshd fehlt und sshd -T scheitert → eigene Meldung (A-6)", () => {
    negativ(() => rmSync(path.join(w, "etc/ssh/sshd_config")), /sshd_config/);
    schreiben(path.join(w, "etc/ssh/sshd_config"), "Port 22\n");
    negativ(() => { rmSync(sshdT); rmSync(path.join(w, "run/sshd"), { recursive: true }); }, /\/run\/sshd fehlt/);
  }, 180000);
  it(".ssh mit falschen Rechten oder fehlend → Abbruch (wird nicht angelegt)", () => {
    negativ(() => metaSetzen("home/admin/.ssh", 1000, "755"), /700/);
    negativ(() => rmSync(path.join(w, "home/admin/.ssh"), { recursive: true }), /fehlt/);
  });
  it("Inventur-Zeile vorhanden, aber abweichend (ohne no-user-rc) → Abbruch", () =>
    negativ(() => writeFileSync(path.join(w, AK_REL), ALT + ZEILE.replace(",no-user-rc", "") + "\n"), /abweichenden oder doppelten/));
  it("Inventur-Zeile doppelt oder Schlüssel unter anderem Kommentar → Abbruch", () => {
    negativ(() => writeFileSync(path.join(w, AK_REL), ALT + ZEILE + "\n" + ZEILE + "\n"), /doppelten/);
    negativ(() => writeFileSync(path.join(w, AK_REL), ALT + `ssh-ed25519 ${KOERPER} anderer\n`), /doppelten/);
  });
  it("Zielskript vorhanden und abweichend → Abbruch", () =>
    negativ(() => schreiben(path.join(w, ZIEL_REL), INVENTUR_TEXT + "# anders\n"), /weicht vom eingebetteten/));
  it("Zielverzeichnis für andere beschreibbar → Abbruch", () => negativ(() => metaSetzen("usr/local/sbin", 0, "777"), /beschreibbar/));
  it("Schlüsseldatei fehlt (Installer ohne Schlüssel) → Abbruch", () =>
    negativ(() => writeFileSync(inst, gebaut({ schluessel: null })), /Schlüssel fehlt/));
  it("eingebetteter Schlüssel manipuliert (Hash-Abweichung) → Abbruch", () =>
    negativ(() => writeFileSync(inst, gebaut().replace(`readonly SCHLUESSEL_ZEILE='ssh-ed25519 ${KOERPER}`, `readonly SCHLUESSEL_ZEILE='ssh-ed25519 ${koerper(0x52)}`)), /weicht vom Sollwert/));
  it("eingebettetes inventur.sh manipuliert (Hash-Abweichung) → Abbruch", () =>
    negativ(() => writeFileSync(inst, gebaut().replace("printf 'Alle Abschnitte gelaufen.\\n'", "printf 'Alle Abschnitte gelaufen!\\n'")), /inventur\.sh weicht/));
  it("mehrere Befunde werden gesammelt gemeldet", () => {
    const r = negativ(() => schreiben(sshdT, SSHD_T_STANDARD.replace("strictmodes yes", "strictmodes no") + "\nacceptenv *\n"), /weitere Befunde/);
    expect(r.out).toMatch(/FEHLER +sshd: strictmodes/);
    expect(r.out).toMatch(/FEHLER +sshd: acceptenv/);
  });
  it("Prüfvariablen werden in einer SSH-Sitzung verworfen", () => {
    const r = lauf([], { SSH_CONNECTION: "203.0.113.5 50000 192.0.2.10 22" });
    expect(r.code).not.toBe(0);
    expect(readFileSync(path.join(w, AK_REL), "utf8")).toBe(ALT);
  });
});

describe.skipIf(!BASH)("deploy/inventur-install.sh — Einrichtung, Idempotenz, Trocken, Rückbau", () => {
  it("--trocken: alle Prüfungen bestanden, nichts geändert", () => {
    const vorher = abbild();
    const r = lauf(["--trocken"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.letzte).toBe("REL-0 TROCKEN OK: alle Vorabprüfungen bestanden. Es wurde nichts geändert.");
    expect(abbild()).toEqual(vorher);
    keineLecks(r);
  });

  it("Erfolg: genau eine Zeile angehängt, Skript root 0755 und byte-gleich, Sicherung 0700/0600, Selbsttest", () => {
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    const fp = schluesselPruefen(PUB).fingerabdruck;
    expect(r.letzte).toBe(`REL-0 OK: Inventurzugang eingerichtet. Fingerabdruck F-INV: ${fp} Skript sha256: ${INVENTUR_SHA}`);
    expect(r.out.split("\n")[0]).toMatch(/^REL-0 Installer v1, Modus einrichten/);
    expect(readFileSync(path.join(w, AK_REL), "utf8")).toBe(ALT + ZEILE + "\n");
    expect(sha(readFileSync(path.join(w, ZIEL_REL)))).toBe(INVENTUR_SHA);
    const m = readFileSync(meta, "utf8");
    const letzter = (rel) => m.trim().split("\n").filter((z) => z.startsWith(W(rel) + "|")).pop();
    expect(letzter(ZIEL_REL)).toBe(`${W(ZIEL_REL)}|0|0|755|root|root`);
    expect(letzter(AK_REL)).toBe(`${W(AK_REL)}|1000|1000|600|admin|admin`);
    const sicher = readdirSync(path.join(w, "root")).filter((n) => n.startsWith("centric-inventur-backup-"));
    expect(sicher).toHaveLength(1);
    expect(sicher[0]).toMatch(/^centric-inventur-backup-\d{8}T\d{6}Z$/);
    const sd = `root/${sicher[0]}`;
    expect(letzter(sd)).toBe(`${W(sd)}|0|0|700|root|root`);
    expect(letzter(`${sd}/authorized_keys.vorher`)).toBe(`${W(sd)}/authorized_keys.vorher|0|0|600|root|root`);
    expect(readFileSync(path.join(w, sd, "authorized_keys.vorher"), "utf8")).toBe(ALT);
    expect(readFileSync(path.join(w, sd, "manifest"), "utf8")).toMatch(/status=eingerichtet\n$/);
    expect(r.out).toMatch(/ok +Selbsttest: --hilfe läuft, fremder SSH-Befehl wird abgewiesen/);
    expect(r.out).toMatch(/ok +sshd -t ok/);
    /* keine Temporärdateien im Zielverzeichnis, sshd nur -T/-t (kein reload/restart) */
    expect(readdirSync(path.join(w, "usr/local/sbin"))).toEqual(["centric-inventur.sh"]);
    const protokoll = readFileSync(proto, "utf8").split("\n");
    const sshdAufrufe = protokoll.filter((z) => z.startsWith("sshd "));
    expect(new Set(sshdAufrufe)).toEqual(new Set([
      "sshd -T",
      "sshd -T -C user=admin,host=localhost,addr=127.0.0.1",
      "sshd -T -C user=admin,host=localhost,addr=192.0.2.1",
      "sshd -t",
    ]));
    /* A-1: jeder schreibende Zugriff auf authorized_keys läuft als Konto (uid 1000), nie als root */
    const akSchreiben = protokoll.filter((z) => z.includes(W(AK_REL)) && /^(setpriv|chmod|chown|mv) /.test(z));
    expect(akSchreiben.length).toBeGreaterThan(0);
    for (const z of akSchreiben) expect(z, z).toMatch(/^setpriv 1000 (tee -a|cat|truncate|touch|chmod|rm) /);
    expect(protokoll.filter((z) => z.startsWith("chown ") && z.includes(W(AK_REL)))).toEqual([]);
    keineLecks(r);
  });

  it("authorized_keys mit 644 (E-b): eingerichtet, Rechte bleiben 644", () => {
    metaSetzen(AK_REL, 1000, "644");
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    const m = readFileSync(meta, "utf8").trim().split("\n").filter((z) => z.startsWith(W(AK_REL) + "|")).pop();
    expect(m).toBe(`${W(AK_REL)}|1000|1000|644|admin|admin`);
  });

  it("Link-Tausch während des Anhängens (A-1): Ziel bleibt unverändert, kein Erfolg", () => {
    const geheim = path.join(w, "etc", "shadow-probe");
    schreiben(geheim, "root:geheim-probe\n");
    const r = lauf([], { PRUEF_LINK_TAUSCH: W("etc/shadow-probe") });
    expect([3, 4], r.alles).toContain(r.code);
    expect(r.letzte).toMatch(/^REL-0 FEHLER: /);
    expect(readFileSync(geheim, "utf8")).toBe("root:geheim-probe\n");
  });

  it("Rücknahme scheitert (truncate rot, A-2) → Rückgabe 4, kein falsches „zurückgenommen“", () => {
    schreiben(path.join(stub, "sshd"), `#!/bin/bash
case "$1" in
  -T) cat "$PRUEF_SSHD_T" ;;
  -t) z="$PRUEF_PROTOKOLL.t"; n=$(cat "$z" 2>/dev/null || echo 0); echo $((n + 1)) >"$z"; [[ $n == 0 ]] ;;
  *) exit 1 ;;
esac
`, true);
    const r = lauf([], { PRUEF_KUERZEN_FEHLER: "1" });
    expect(r.code, r.alles).toBe(4);
    expect(r.letzte).toMatch(/^REL-0 FEHLER: Einrichtung gescheitert, Rücknahme unvollständig/);
    expect(r.alles).not.toMatch(/Änderungen zurückgenommen/);
  });

  it("Idempotenz: zweiter Lauf meldet „bereits eingerichtet“, ändert nichts", () => {
    expect(lauf().code).toBe(0);
    const vorher = abbild();
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    expect(r.letzte).toMatch(/^REL-0 OK: Inventurzugang bereits eingerichtet\. Fingerabdruck F-INV: SHA256:\S+ Skript sha256: [0-9a-f]{64}$/);
    expect(abbild()).toEqual(vorher);
    const t = lauf(["--trocken"]);
    expect(t.letzte).toBe("REL-0 TROCKEN OK: bereits eingerichtet. Es wurde nichts geändert.");
    expect(abbild()).toEqual(vorher);
  });

  it("Zeile vorhanden, Skript fehlt (teilweise) → Abbruch ohne Änderung", () => {
    expect(lauf().code).toBe(0);
    negativ(() => rmSync(path.join(w, ZIEL_REL)), /teilweise/);
  });

  it("authorized_keys ohne Zeilenumbruch am Ende: alte Zeile bleibt unverändert, neue Zeile separat", () => {
    writeFileSync(path.join(w, AK_REL), ALT.trimEnd());
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    expect(readFileSync(path.join(w, AK_REL), "utf8")).toBe(ALT.trimEnd() + "\n" + ZEILE + "\n");
    const rb = lauf(["--rueckbau"]);
    expect(rb.code, rb.alles).toBe(0);
    expect(readFileSync(path.join(w, AK_REL), "utf8")).toBe(ALT.trimEnd());
  });

  it("authorized_keys fehlt, .ssh korrekt: Datei wird mit admin 600 angelegt; Rückbau entfernt sie wieder", () => {
    rmSync(path.join(w, AK_REL));
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    expect(readFileSync(path.join(w, AK_REL), "utf8")).toBe(ZEILE + "\n");
    const m = readFileSync(meta, "utf8").trim().split("\n").filter((z) => z.startsWith(W(AK_REL) + "|")).pop();
    expect(m).toBe(`${W(AK_REL)}|1000|1000|600|admin|admin`);
    const rb = lauf(["--rueckbau"]);
    expect(rb.code, rb.alles).toBe(0);
    expect(existsSync(path.join(w, AK_REL))).toBe(false);
  });

  it("Rückbau: Zeile und Skript entfernt, authorized_keys byte-gleich mit der Sicherung", () => {
    const vorherAk = readFileSync(path.join(w, AK_REL));
    expect(lauf().code).toBe(0);
    const r = lauf(["--rueckbau"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.letzte).toMatch(/^REL-0 RUECKBAU OK: /);
    expect(readFileSync(path.join(w, AK_REL)).equals(vorherAk)).toBe(true);
    expect(existsSync(path.join(w, ZIEL_REL))).toBe(false);
    keineLecks(r);
    /* zweiter Rückbau: keine abgeschlossene Einrichtung mehr → Abbruch ohne Änderung */
    negativ(() => {}, /keine Sicherung/, ["--rueckbau"]);
  });

  it("Rückbau verweigert, wenn authorized_keys seit der Einrichtung verändert wurde (Hash-Abweichung)", () => {
    expect(lauf().code).toBe(0);
    negativ(() => writeFileSync(path.join(w, AK_REL), readFileSync(path.join(w, AK_REL), "utf8") + `ssh-ed25519 ${koerper(0x63)} neu\n`), /verändert/, ["--rueckbau"]);
    negativ(() => writeFileSync(path.join(w, AK_REL), ALT.replace("betreiber", "jemand") + ZEILE + "\n"), /verändert/, ["--rueckbau"]);
  });

  it("Rückbau verweigert, wenn das Skript inzwischen abweicht", () => {
    expect(lauf().code).toBe(0);
    negativ(() => writeFileSync(path.join(w, ZIEL_REL), "#!/bin/bash\nexit 0\n"), /weicht vom eingerichteten/, ["--rueckbau"]);
  });

  it("Rückbau ohne Einrichtung → Abbruch ohne Änderung", () => negativ(() => {}, /keine Sicherung/, ["--rueckbau"]));

  it("gescheiterte Selbstprüfung (sshd -t danach rot) → Änderungen zurückgenommen, Rückgabe 3", () => {
    /* sshd -t: erster Aufruf (Vorabprüfung) 0, zweiter (Selbstprüfung) 1 */
    schreiben(path.join(stub, "sshd"), `#!/bin/bash
case "$1" in
  -T) cat "$PRUEF_SSHD_T" ;;
  -t) z="$PRUEF_PROTOKOLL.t"; n=$(cat "$z" 2>/dev/null || echo 0); echo $((n + 1)) >"$z"; [[ $n == 0 ]] ;;
  *) exit 1 ;;
esac
`, true);
    const r = lauf();
    expect(r.code, r.alles).toBe(3);
    expect(r.letzte).toMatch(/^REL-0 FEHLER: Einrichtung gescheitert, Änderungen zurückgenommen\. Sicherung: \/root\/centric-inventur-backup-/);
    expect(readFileSync(path.join(w, AK_REL), "utf8")).toBe(ALT);
    expect(existsSync(path.join(w, ZIEL_REL))).toBe(false);
    keineLecks(r);
  });
});

/* -------------------------------------------------- Mutationsnachweis */
describe.skipIf(!BASH)("Mutationsnachweis: ohne die Prüfung wird der Negativfall nicht mehr abgebrochen", () => {
  const faelle = [
    {
      name: "permituserenvironment",
      anker: '[[ "$(sshd_wert permituserenvironment)" == no ]]',
      ersatz: "true",
      vorbereiten: () => schreiben(sshdT, SSHD_T_STANDARD.replace("permituserenvironment no", "permituserenvironment yes")),
    },
    {
      name: "acceptenv",
      anker: '      *) treffer+=" ${w//[^A-Za-z0-9_*?!.-]/?}" ;;',
      ersatz: "      *) ;;",
      vorbereiten: () => schreiben(sshdT, SSHD_T_STANDARD + "\nacceptenv *\n"),
    },
    {
      name: "Rechte authorized_keys",
      anker: '"$uid" != "$KONTO_UID" || ! "$mode" =~ ^(600|640|644)$',
      ersatz: '"$uid" != "$KONTO_UID"',
      vorbereiten: () => metaSetzen(AK_REL, 1000, "666"),
    },
    {
      name: "Match-Block (B-2)",
      anker: 'if [[ -n "$match" ]]; then',
      ersatz: "if false; then",
      vorbereiten: () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "Match User admin\n  PermitUserEnvironment yes\n"),
    },
    {
      name: "N-1 Normalisierung: Anführungszeichen entfernen (M\"atch\", Delta A-1)",
      anker: 'n = l; gsub(/"/, "", n);',
      ersatz: "n = l;",
      vorbereiten: () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), 'M"atch" User admin\n  PermitUserEnvironment yes\n'),
    },
    {
      name: "N-1 Normalisierung: führendes „=“ abschneiden (=Match)",
      anker: 'sub(/^[ \\t=]+/, "", n)',
      ersatz: 'sub(/^[ \\t]+/, "", n)',
      vorbereiten: () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "=Match User admin\n  PermitUserEnvironment yes\n"),
    },
    {
      name: "N-1 fail-closed: Präfix genügt bei Anführungszeichen (\"Match\"x)",
      anker: '(q || c == "" || c !~ /[A-Za-z0-9_-]/)) print "M"',
      ersatz: '(c == "" || c !~ /[A-Za-z0-9_-]/)) print "M"',
      vorbereiten: () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), '"Match"x User admin\n'),
    },
    {
      name: "N-2 Include nicht eindeutig verfolgbar ('…') → Abbruch",
      anker: 'X\\ *) fehl "Include in ${f#"$W"} nicht eindeutig verfolgbar (${z#X }); fail-closed" ;;',
      ersatz: "X\\ *) ;;",
      vorbereiten: () => {
        schreiben(path.join(w, "etc/ssh/extra/a.conf"), "Match User admin\n");
        writeFileSync(path.join(w, "etc/ssh/sshd_config"), readFileSync(path.join(w, "etc/ssh/sshd_config"), "utf8") + "Include '/etc/ssh/extra/a.conf'\n");
      },
    },
    {
      name: "B-1 NUL-Byte in sshd-Datei (Ma\\0\\ntch, Review #458)",
      anker: `    if [[ "$n" != 0 ]]; then`,
      ersatz: "    if false; then",
      vorbereiten: () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "Ma\0\ntch User admin\n  PermitUserEnvironment yes\n"),
    },
    {
      name: "A-1 (Delta-Review #458) Rückgabewert der NUL-Zählung ausgewertet (tr scheitert)",
      anker: "|| n=x",
      ersatz: "|| true",
      vorbereiten: () => schreiben(path.join(stub, "tr"), TR_STUB_NUL_SCHEITERT, true),
    },
    {
      name: "A-1 Endmarke E fehlt (awk scheitert, Review #458)",
      anker: '    if [[ "$ende" != ja ]]; then fehl "sshd-Konfigurationsdatei ${f#"$W"} nicht auswertbar"; fi',
      ersatz: "    :",
      vorbereiten: () => schreiben(path.join(stub, "awk"), AWK_STUB_SCHEITERT, true),
    },
    {
      name: "A-2 führendes \\r ersetzen (\\rMatch, Review #458)",
      anker: 'gsub(/\\r/, " ", n); ',
      ersatz: "",
      vorbereiten: () => schreiben(path.join(w, "etc/ssh/sshd_config.d/60-x.conf"), "\rMatch User admin\n  PermitUserEnvironment yes\n"),
    },
    {
      name: "sshd -T -C mit Verbindungsdaten (B-2)",
      anker: 'for ctx in "" "user=$KONTO,host=localhost,addr=127.0.0.1" "user=$KONTO,host=localhost,addr=192.0.2.1"; do',
      ersatz: 'for ctx in ""; do',
      vorbereiten: () => schreiben(path.join(tmp, "sshd-T-C.txt"), SSHD_T_STANDARD.replace("permituserenvironment no", "permituserenvironment yes") + "\n"),
      env: () => ({ PRUEF_SSHD_T_C: p(path.join(tmp, "sshd-T-C.txt")) }),
    },
    {
      name: "Besitz data/",
      anker: 'if [[ "$a_uid" != "$b_uid" ]]; then',
      ersatz: "if false; then",
      vorbereiten: () => metaSetzen("opt/apps/centric-dienstplanung/data", 1001, "700", "deploy"),
    },
  ];
  for (const f of faelle) {
    it(f.name, () => {
      f.vorbereiten();
      const env = f.env ? f.env() : {};
      erwarteAbbruch(lauf([], env));
      writeFileSync(inst, gebaut({ ersetze: [[f.anker, f.ersatz]] }));
      const r = lauf(["--trocken"], env);
      expect(r.code, r.alles).toBe(0);
    });
  }
});

/* ------------------------------------------------------ Quelltext-Wächter */
describe("Quelltext-Wächter deploy/inventur-install.sh", () => {
  const text = readFileSync(INSTALLER, "utf8");
  const logik = text.slice(0, text.indexOf(BEGINN)) + text.slice(text.indexOf(ENDE));
  const code = ohneKommentareUndZeichenketten(logik);

  it("Härtung: /bin/bash, set -euo pipefail, umask 077, fester PATH, BASH_ENV/ENV entfernt", () => {
    expect(text.startsWith("#!/bin/bash\n")).toBe(true);
    for (const re of [/^set -euo pipefail$/m, /^umask 077$/m, /^export LC_ALL=C$/m, /^PATH="\$\{INVENTUR_INSTALL_PRUEFPFAD:-\/usr\/sbin:\/usr\/bin:\/sbin:\/bin\}"$/m, /^unset BASH_ENV ENV CDPATH$/m]) {
      expect(text, String(re)).toMatch(re);
    }
    expect(text).toContain(`readonly OPTIONEN='${OPTIONEN}'`);
  });

  it("kein Netz, kein eval/source, keine Dienste, Konten, Gruppen, sudoers, Docker, sshd-Konfiguration", () => {
    expect(code).not.toMatch(/\b(curl|wget|nc|ncat|ssh-copy-id|scp|sftp|rsync|eval|source|sudo|su|useradd|usermod|userdel|groupadd|groupmod|gpasswd|adduser|passwd|visudo|systemctl|service|docker|crontab|apt|apt-get|dpkg)\b\s/);
    expect(code).not.toMatch(/(^|\s)\.\s+\S/m);
    const ohneKommentare = logik.split("\n").filter((z) => !/^\s*#/.test(z)).join("\n");
    expect(ohneKommentare).not.toMatch(/sudoers|\/etc\/group|\/etc\/passwd/);
    /* sshd-Konfiguration wird nur gelesen (Match-/Include-Suche, B-2), nie geschrieben */
    const sshdZeilen = ohneKommentare.split("\n").filter((z) => /sshd_config|SSHD_DATEIEN|\$cfg\b/.test(z));
    expect(sshdZeilen.length).toBeGreaterThan(0);
    for (const z of sshdZeilen) expect(z, z).not.toMatch(/(^|[^2&])>(?!&2|\/dev\/null)|\b(sed\s+-i|cp|mv|rm|tee|install|truncate|chmod|chown)\b\s/);
    expect(code).not.toMatch(/\bsshd\s+(?!-T\b|-t\b)/);
    expect(code).not.toMatch(/\.env\b/);
  });

  it("authorized_keys: root schreibt nie selbst (A-1); Anhängen, Anlegen, Kürzen, Rechte, Löschen nur als Konto", () => {
    const zeilen = logik.split("\n").filter((z) => !/^\s*#/.test(z));
    /* keine Umlenkung auf "$AK" als root */
    expect(zeilen.filter((z) => /[^2&]>>?\s*"\$AK"/.test(z))).toEqual([]);
    /* jeder schreibende Befehl mit "$AK" läuft über als_konto */
    for (const z of zeilen.filter((x) => /"\$AK"/.test(x) && /\b(tee|truncate|chmod|chown|touch|rm|mv|cp)\b/.test(x))) {
      expect(z, z).toMatch(/als_konto (tee -a|truncate -s "[^"]+"|touch|chmod 06[04]{2}|rm -f) (-- )?"\$AK"/);
    }
    expect(text).toMatch(/^als_konto\(\) \{ setpriv --reuid="\$KONTO_UID" --regid="\$KONTO_GID" --clear-groups -- "\$@"; \}$/m);
    expect(zeilen.filter((z) => /\btee -a\b/.test(z))).toHaveLength(1);
    /* chown nur mit -h (folgt keinem Link) */
    for (const z of zeilen.filter((x) => /(^|\s)chown\s/.test(x))) expect(z, z).toMatch(/chown -h /);
  });

  it("Datei im Repository mit Modus 100755 (CI-Wächter Skripte)", () => {
    const r = spawnSync("git", ["ls-files", "-s", "deploy/inventur-install.sh"], { cwd: WURZEL, encoding: "utf8" });
    expect(r.stdout).toMatch(/^100755 /);
  });

  it("Anleitung nennt die aktuelle Prüfsumme des Installers", () => {
    const doku = readFileSync(path.join(WURZEL, "docs", "acc45", "VPS-ZUGANG-EINRICHTUNG.md"), "utf8");
    const m = doku.match(/SHA-256 von deploy\/inventur-install\.sh: `([0-9a-f]{64})`/);
    expect(m, "Zeile „SHA-256 von deploy/inventur-install.sh“ fehlt").not.toBeNull();
    expect(m[1]).toBe(sha(readFileSync(INSTALLER)));
    expect(doku).toContain("Einrichtung mit einem Befehl (REL-0-Installer)");
    /* Review #447: A-3 (kein absolutes Versprechen, --trocken zuerst, rm -f am Anfang), A-4, A-6, A-7, E-a, E-b */
    expect(doku).not.toMatch(/nie zu einer Ausführung ohne Prüfung/);
    expect(doku).toContain("cd /root && rm -f rel0 && curl -fsSLo rel0");
    expect(doku).toContain("&& bash rel0 --trocken");
    expect(doku).toContain("&& bash rel0 --rueckbau");
    expect(doku).toMatch(/\/run\/sshd/);
    expect(doku).toMatch(/E-a/);
    expect(doku).toMatch(/E-b/);
    expect(doku).toMatch(/Kurz-SHA/);
    /* Delta-Review #447: A-2 (vorbereitet, nicht aktiviert, Vorrang Konsolen-Inventur), A-3 (Begründung zum einzelnen &) */
    const abschnitt = doku.slice(doku.indexOf("## Einrichtung mit einem Befehl"), doku.indexOf("## 3. Installation Phase 1"));
    expect(abschnitt).toMatch(/vorbereitet, nicht aktiviert/);
    expect(abschnitt).toContain("INVENTUR-KONSOLE.md");
    expect(abschnitt).not.toMatch(/Deshalb ist\s+Eingabe 1 immer `--trocken`/);
    expect(abschnitt).toMatch(/Prüfen Sie vor `Enter`\s+jedes `&&`/);
    /* Delta-Review #447 N-4: rm -f nur in Eingabe 1 und Rückweg; Eingabe 2 bewusst ohne, Folge eines & benannt */
    expect(abschnitt).toMatch(/`rm -f rel0` am Anfang steht \*\*nur in Eingabe 1 und im Rückweg\*\*/);
    expect(abschnitt).toMatch(/Eingabe 2 hat bewusst kein `rm -f`/);
    expect(abschnitt).toMatch(/Folge eines `&` in\s+Eingabe 2:/);
    expect(abschnitt).not.toMatch(/^- `rm -f rel0` am Anfang: /m);
    const eingabe2 = abschnitt.slice(abschnitt.indexOf("**Eingabe 2"), abschnitt.indexOf("- `<commit>`"));
    expect(eingabe2).not.toContain("rm -f");
    /* N-1/N-2: Normalisierung und Include-Abbruch in der Prüftabelle beschrieben */
    expect(abschnitt).toMatch(/nicht eindeutig verfolgbar/);
    expect(abschnitt).toMatch(/M"atch"/);
    /* Review #458 B-1/A-3: NUL-Byte abgewiesen (Prüftabelle und Meldungstabelle), Grenzen der Lesebefehle benannt */
    expect(abschnitt).toMatch(/NUL-Byte[^\n]*abgewiesen/);
    expect(abschnitt).toMatch(/`… enthält NUL-Byte; fail-closed`/);
    expect(abschnitt).toMatch(/Binary file matches/);
    /* Delta-Review #458 B-1 (Doku): Lesebefehle mit -i (Groß/Klein), sonst passt das Muster nicht auf „Match“ */
    expect(abschnitt).toContain("grep -ainE 'm.?a.?t.?c.?h'");
    expect(abschnitt).toContain("grep -ainE 'i.?n.?c.?l.?u.?d.?e'");
    expect(abschnitt).toMatch(/`… nicht auf NUL-Byte prüfbar; fail-closed`/);
    /* H-1 (Delta-Review #458): Grenze der Prüfung (Zeitpunkt) benannt */
    expect(abschnitt).toMatch(/Prüfung gilt für ihren Zeitpunkt/);
    const anleitung = readFileSync(path.join(WURZEL, "docs", "acc45", "BETREIBER-ANLEITUNG-ERSTRELEASE.md"), "utf8");
    const a41 = anleitung.slice(anleitung.indexOf("### 4.1"), anleitung.indexOf("### 4.2"));
    expect(a41).toMatch(/vorbereitet, nicht aktiviert/);
    expect(a41).toContain("INVENTUR-KONSOLE.md");
    expect(a41).toMatch(/Arbeitsrechner/);
  });

  /* Delta-Review #458 B-1 (Doku): die Lesebefehle der Meldungstabelle werden aus dem Doku-Text gelesen und gegen eine
     Wegwerfdatei ausgeführt. Sie müssen „Match User admin“ und „Include /x.conf“ finden (rc 0). Gegenprobe: ohne -i
     findet derselbe Befehl nichts (rc 1) – so fällt ein fehlendes -i sofort auf. */
  it("Meldungstabelle: Lesebefehle für Match/Include finden „Match User admin“ und „Include /x.conf“ (Verhalten)", () => {
    const doku = readFileSync(path.join(WURZEL, "docs", "acc45", "VPS-ZUGANG-EINRICHTUNG.md"), "utf8");
    const abschnitt = doku.slice(doku.indexOf("### Abbruch- und Fehlermeldungen"), doku.indexOf("### Rückweg"));
    const befehle = new Map();
    for (const m of abschnitt.matchAll(/`(grep -[A-Za-z]+ '([^']+)') \/etc\/ssh\/sshd_config \/etc\/ssh\/sshd_config\.d\/\*\.conf`/g)) befehle.set(m[2], m[1]);
    const probe = path.join(tmp, "sshd-probe.conf");
    writeFileSync(probe, "PasswordAuthentication no\nMatch User admin\n  AcceptEnv *\nInclude /x.conf\n");
    for (const [muster, erwartet] of [["m.?a.?t.?c.?h", "2:Match User admin"], ["i.?n.?c.?l.?u.?d.?e", "4:Include /x.conf"]]) {
      const cmd = befehle.get(muster);
      expect(cmd, `Lesebefehl für ${muster} fehlt in der Meldungstabelle`).toBeTruthy();
      const r = spawnSync(BASH, ["-c", `${cmd} "$1"`, "probe", p(probe)], { encoding: "utf8" });
      expect(r.status, `${cmd}: ${r.stderr}`).toBe(0);
      expect(r.stdout).toContain(erwartet);
      /* Gegenprobe: -i entfernt → kein Treffer */
      const ohneI = cmd.replace(/^grep -([A-Za-z]+)/, (_, f) => `grep -${f.replace("i", "")}`);
      expect(spawnSync(BASH, ["-c", `${ohneI} "$1"`, "probe", p(probe)], { encoding: "utf8" }).status).toBe(1);
    }
  });

  it("keine öffentliche Schlüsseldatei mit erfundenem Inhalt im Repository", () => {
    const f = path.join(WURZEL, "deploy", "inventur-schluessel.pub");
    if (existsSync(f)) expect(() => schluesselPruefen(readFileSync(f, "utf8"))).not.toThrow();
    expect(statSync(INSTALLER).isFile()).toBe(true);
  });
});
