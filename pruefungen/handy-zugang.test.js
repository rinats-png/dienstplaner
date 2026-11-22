/* ==========================================================================
   HANDY-ZUGANG (REL-0c) — deploy/handy-zugang.sh und werkzeug/handy-zugang-bauen.mjs

   Das Skript legt auf dem VPS genau ein Konto centric-mobil an (eigene Gruppe,
   kein sudo, kein docker, Passwort gesperrt) und hinterlegt den eingebetteten
   öffentlichen Schlüssel CENTRIC-Mobile. Ohne Schalter ist es ein Probelauf.

   Wegwerf-Harness: eine Testwurzel (HANDY_PRUEFWURZEL) und ein Prüf-PATH
   (HANDY_PRUEFPFAD), der NUR Stubs und Weiterleitungen auf echte Bordmittel
   enthält:
     Stubs   id, getent, useradd, userdel, passwd, sudo, sshd, runuser,
             systemctl, pgrep, stat, chmod, chown (Systemsicht aus Zustandsdateien;
             stat/chmod/chown führen eine Metadatentabelle, weil die Testumgebung
             nicht root ist und unter Windows keine echten Rechte kennt)
     echt    sed, head, awk, tr, grep, wc, cat, rm, mkdir, find, ssh-keygen
   Kein echtes /etc, kein echtes Konto, kein Netz.

   Geprüft wird:
     - Probelauf: ändert nichts (Abbild vorher = nachher, keine ändernden Aufrufe)
     - --ja: genau die erwarteten ändernden Aufrufe, Inhalt/Modi/Eigentümer
     - jede Vorabprüfung negativ → STOPP, Rückgabe 1, nichts geändert
     - Nachprüfungen (Gruppen, sudo, docker.sock, Passwortsperre) → Rückgabe 3,
       kein Schlüssel hinterlegt, Rückbau-Hinweis
     - Warnungen (o+r) → --ja verweigert, --ja-trotz-warnung richtet ein
     - Rückbau und Rückbau-Schutz
     - Mutationen: ohne die jeweilige Prüfung wird der Negativfall grün
     - Werkzeug (--pruefen, Fingerabdruck in Node, Befehle), Quelltext-Wächter,
       Dateimodus 100755, Ladeweg wie in der Konsole (bash -c "$s")

   Unter Linux (CI) läuft alles. Unter Windows nur mit Git Bash; sonst übersprungen.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bashFinden, p, posixPfad, ohneKommentareUndZeichenketten } from "./inventur-hilfen.mjs";
import * as bau from "../werkzeug/handy-zugang-bauen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(WURZEL, "deploy", "handy-zugang.sh");
const lf = (t) => t.replace(/\r\n/g, "\n");
const QUELLTEXT = lf(readFileSync(SKRIPT, "utf8"));
const BASH = bashFinden();
const TEST_GRENZE_MS = 180000;
const LAUF_GRENZE_MS = 150000;
vi.setConfig({ testTimeout: TEST_GRENZE_MS });

const sha = (t) => createHash("sha256").update(t).digest("hex");
const KONTO = "centric-mobil";
const SCHLUESSEL = bau.SOLL_SCHLUESSEL;
const FP = bau.SOLL_FINGERABDRUCK;
const ZEILE = `${bau.OPTIONEN} ${SCHLUESSEL}`;
const MARKE = "CENTRIC-Handy-Zugang handy-zugang.sh";
const GEHEIM = "GEHEIM-HANDY-TESTWERT-731";

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
const ALT_AK = `ssh-ed25519 ${koerper(0x61)} betreiber@arbeitsplatz\n`;

const SSHD_T = [
  "port 22",
  "usepam yes",
  "permitrootlogin prohibit-password",
  "pubkeyauthentication yes",
  "passwordauthentication no",
  "permittty yes",
  "authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2",
  "authorizedkeyscommand none",
  "authenticationmethods any",
  "chrootdirectory none",
  "subsystem sftp /usr/lib/openssh/sftp-server",
].join("\n");

/* Echte Bordmittel, auf die der Prüf-PATH weiterleitet. */
const ECHT = ["sed", "head", "awk", "tr", "grep", "wc", "cat", "rm", "mkdir", "find", "ssh-keygen"];
const ECHT_PFADE = (() => {
  if (!BASH) return {};
  const r = spawnSync(BASH, ["-c", `for t in ${ECHT.join(" ")} stat chmod; do command -v "$t"; done`], { encoding: "utf8" });
  const z = r.stdout.trim().split(/\r?\n/);
  return Object.fromEntries([...ECHT, "stat", "chmod"].map((t, i) => [t, z[i]]));
})();

/* ---------------------------------------------------------------- Stubs */
const STUBS = {
  id: `#!/bin/bash
z="$PRUEF_ZUSTAND"
case "\${1:-}" in
  -u) if (($# == 1)); then printf '%s\\n' "\${PRUEF_UID:-0}"; exit 0; fi ;;
  -nG)
    if grep -q "^$2:" "$z/passwd"; then
      if [[ -f "$z/gruppen_$2" ]]; then cat "$z/gruppen_$2"; else printf '%s\\n' "$2"; fi
      exit 0
    fi
    echo "id: '$2': no such user" >&2; exit 1 ;;
esac
exit 1
`,
  getent: `#!/bin/bash
z="$PRUEF_ZUSTAND"
[[ -f "$z/getent_kaputt" ]] && exit 3
case "$1" in passwd) f="$z/passwd" ;; group) f="$z/group" ;; *) exit 1 ;; esac
if (($# == 1)); then cat "$f"; exit 0; fi
awk -F: -v k="$2" '$1 == k || $3 == k { print; t = 1 } END { exit t ? 0 : 2 }' "$f"
`,
  useradd: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'useradd %s\\n' "$*" >>"$z/protokoll"
[[ -f "$z/useradd_scheitert" ]] && exit 9
k=""
while (($# > 1)); do case "$1" in --comment) k="$2"; shift 2 ;; *) shift ;; esac; done
n="$1"
u=1001; [[ -f "$z/neue_uid" ]] && u="$(cat "$z/neue_uid")"
printf '%s:x:%s:%s:%s:/home/%s:/bin/bash\\n' "$n" "$u" "$u" "$k" "$n" >>"$z/passwd"
printf '%s:x:%s:\\n' "$n" "$u" >>"$z/group"
mkdir -p "$PRUEF_W/home/$n"
printf '%s|%s|%s\\n' "$PRUEF_W/home/$n" "$n:$n" 750 >>"$z/meta"
if [[ -f "$z/skel_ssh" ]]; then mkdir "$PRUEF_W/home/$n/.ssh"; fi
`,
  userdel: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'userdel %s\\n' "$*" >>"$z/protokoll"
n="\${*: -1}"
neu="$(awk -F: -v k="$n" '$1 != k' "$z/passwd")"; printf '%s\\n' "$neu" >"$z/passwd"
neu="$(awk -F: -v k="$n" '$1 != k' "$z/group")"; printf '%s\\n' "$neu" >"$z/group"
[[ "$1" == -r ]] && rm -rf "$PRUEF_W/home/$n"
exit 0
`,
  passwd: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'passwd %s\\n' "$*" >>"$z/protokoll"
case "$1" in
  -l) [[ -f "$z/passwd_l_wirkungslos" ]] || printf 'L\\n' >"$z/gesperrt_$2"; echo "passwd: password changed." ;;
  -S) if [[ -f "$z/gesperrt_$2" ]]; then echo "$2 L 11/22/2026 0 99999 7 -1"; else echo "$2 P 11/22/2026 0 99999 7 -1"; fi ;;
  *) exit 1 ;;
esac
`,
  sudo: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'sudo %s\\n' "$*" >>"$z/protokoll"
if [[ "$1 $2 $3" == "-n -l -U" ]]; then
  if [[ -f "$z/sudo_rechte" ]]; then
    echo "User $4 may run the following commands on srv-probe:"; echo "    (ALL : ALL) ALL"
  else
    echo "User $4 is not allowed to run sudo on srv-probe."
  fi
  exit 0
fi
exit 1
`,
  runuser: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'runuser %s\\n' "$*" >>"$z/protokoll"
[[ -f "$z/runuser_kaputt" ]] && exit 1
[[ "$1" == -u && "$3" == -- ]] || exit 1
shift 3
case "$1" in
  true) exit 0 ;;
  test) [[ "$3" == */docker.sock && -f "$z/docker_offen" ]] && exit 0; exit 1 ;;
esac
exit 1
`,
  sshd: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'sshd %s\\n' "$*" >>"$z/protokoll"
[[ -f "$z/sshd_scheitert" ]] && { echo "sshd: Missing privilege separation directory" >&2; exit 255; }
if [[ "$1" == -T ]]; then cat "$z/sshd_t"; exit 0; fi
exit 1
`,
  systemctl: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'systemctl %s\\n' "$*" >>"$z/protokoll"
[[ "$1 $2" == "is-active --quiet" ]] || exit 1
[[ -f "$z/dienst_aus" ]] && exit 3
exit 0
`,
  pgrep: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'pgrep %s\\n' "$*" >>"$z/protokoll"
[[ -f "$z/prozesse" ]] && { echo 4242; exit 0; }
exit 1
`,
  /* Metadatentabelle: pfad|eigner:gruppe|modus (letzte Zeile gilt); sonst root:root und echter Modus */
  stat: `#!/bin/bash
z="$PRUEF_ZUSTAND"
fmt="$2"; x="\${*: -1}"
[[ -e "$x" || -L "$x" ]] || { echo "stat: cannot statx '$x'" >&2; exit 1; }
e="$(awk -F'|' -v q="$x" '$1 == q { e = $2 "|" $3 } END { print e }' "$z/meta")"
if [[ -n "$e" ]]; then o="\${e%%|*}"; m="\${e#*|}"; else o="root:root"; m="$('@STAT@' -c %a -- "$x")"; fi
case "$fmt" in
  '%U:%G %a') printf '%s %s\\n' "$o" "$m" ;;
  '%a') printf '%s\\n' "$m" ;;
  *) exec '@STAT@' "$@" ;;
esac
`,
  chown: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'chown %s\\n' "$*" >>"$z/protokoll"
o="$1"; x="\${*: -1}"
[[ -e "$x" ]] || exit 1
e="$(awk -F'|' -v q="$x" '$1 == q { e = $3 } END { print e }' "$z/meta")"
[[ -n "$e" ]] || e="$('@STAT@' -c %a -- "$x")"
printf '%s|%s|%s\\n' "$x" "$o" "$e" >>"$z/meta"
`,
  chmod: `#!/bin/bash
z="$PRUEF_ZUSTAND"
printf 'chmod %s\\n' "$*" >>"$z/protokoll"
m="$1"; x="\${*: -1}"
'@CHMOD@' "$@" || exit 1
e="$(awk -F'|' -v q="$x" '$1 == q { e = $2 } END { print e }' "$z/meta")"
[[ -n "$e" ]] || e="root:root"
printf '%s|%s|%s\\n' "$x" "$e" "\${m#0}" >>"$z/meta"
`,
};

/* Aufrufe, die etwas ändern würden. */
const AENDERND = /^(useradd|userdel|usermod|groupadd|gpasswd|chown|chmod|passwd -l|systemctl (?!is-active))/;

let tmp, W, zustand, bin;

const z = (name) => path.join(zustand, name);
const schalter = (name, inhalt = "") => writeFileSync(z(name), inhalt);
const wdatei = (rel, inhalt) => {
  const f = path.join(W, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, inhalt);
  return f;
};
const meta = (rel, eigner, modus) => writeFileSync(z("meta"), `${p(path.join(W, rel))}|${eigner}|${modus}\n`, { flag: "a" });

function abbild() {
  const zeilen = [];
  const lauf = (d) => {
    for (const n of readdirSync(d).sort()) {
      const f = path.join(d, n);
      const s = statSync(f);
      const rel = path.relative(tmp, f);
      if (rel === path.join("zustand", "protokoll")) continue;
      if (s.isDirectory()) {
        zeilen.push(`${rel}/`);
        lauf(f);
      } else zeilen.push(`${rel} ${s.size} ${sha(readFileSync(f))}`);
    }
  };
  lauf(W);
  lauf(zustand);
  return zeilen;
}

const protokoll = () => (existsSync(z("protokoll")) ? readFileSync(z("protokoll"), "utf8").split(/\r?\n/).filter(Boolean) : []);
const aendernde = () => protokoll().filter((x) => AENDERND.test(x));

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-handy-"));
  W = path.join(tmp, "wurzel");
  zustand = path.join(tmp, "zustand");
  bin = path.join(tmp, "bin");
  for (const d of [W, zustand, bin]) mkdirSync(d, { recursive: true });
  for (const [n, inhalt] of Object.entries(STUBS)) {
    writeFileSync(path.join(bin, n), inhalt.replaceAll("@STAT@", ECHT_PFADE.stat).replaceAll("@CHMOD@", ECHT_PFADE.chmod));
    chmodSync(path.join(bin, n), 0o755);
  }
  for (const t of ECHT) {
    writeFileSync(path.join(bin, t), `#!/bin/bash\nexec '${ECHT_PFADE[t]}' "$@"\n`);
    chmodSync(path.join(bin, t), 0o755);
  }
  writeFileSync(z("passwd"), "root:x:0:0:root:/root:/bin/bash\nadmin:x:1000:1000:Admin:/home/admin:/bin/bash\n");
  writeFileSync(z("group"), "root:x:0:\nsudo:x:27:admin\ndocker:x:999:admin\nadmin:x:1000:\n");
  writeFileSync(z("meta"), "");
  writeFileSync(z("sshd_t"), SSHD_T + "\n");
  wdatei("etc/os-release", 'PRETTY_NAME="Ubuntu 24.04.5 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n');
  wdatei("etc/ssh/ssh_host_ed25519_key.pub", `ssh-ed25519 ${koerper(0x33)} root@srv-probe\n`);
  wdatei("home/admin/.ssh/authorized_keys", ALT_AK);
  wdatei("opt/apps/centric-dienstplanung/.env", `CENTRIC_PFEFFER=${GEHEIM}\n`);
  meta("opt/apps/centric-dienstplanung/.env", "admin:admin", "600");
  wdatei("opt/apps/centric-dienstplanung/data/ablage.json", `{"geheim":"${GEHEIM}"}\n`);
  meta("opt/apps/centric-dienstplanung/data", "admin:admin", "750");
  wdatei("var/run/docker.sock", "");
  meta("var/run/docker.sock", "root:docker", "660");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function umgebung(env = {}) {
  const u = {
    ...process.env,
    HANDY_PRUEFPFAD: posixPfad(bin),
    HANDY_PRUEFWURZEL: p(W),
    PRUEF_ZUSTAND: p(zustand),
    PRUEF_W: p(W),
    ...env,
  };
  for (const n of ["SSH_CONNECTION", "SSH_ORIGINAL_COMMAND", "BASH_ENV", "ENV"]) if (!(n in env)) delete u[n];
  return u;
}

/* Wie der Betreiber: s=$(curl …) schneidet abschließende Zeilenumbrüche ab; dann bash -c "$s" x [Schalter].
   Statt curl liest $(cat …) die Datei (gleiche Semantik). */
function lauf(args = [], { skript = SKRIPT, env = {} } = {}) {
  const r = spawnSync(BASH, ["-c", 's=$(cat "$1"); shift; bash -c "$s" x "$@"', "x", p(skript), ...args], {
    encoding: "utf8",
    env: { ...umgebung(env), PATH: process.env.PATH },
    timeout: LAUF_GRENZE_MS,
  });
  if (r.error || r.signal) throw new Error(`Lauf abgebrochen: ${r.error?.message || r.signal}`);
  const zeilen = r.stdout.replace(/\n$/, "").split("\n");
  return { code: r.status, out: r.stdout, err: r.stderr, alles: r.stdout + r.stderr, zeilen, letzte: zeilen.at(-1) };
}

/* Jede Zeile beginnt mit einem festen Präfix, nur ASCII, keine Geheimnisse. */
function form(r) {
  for (const x of r.zeilen) expect(x, x).toMatch(/^(OK|INFO|PLAN|WARNUNG|STOPP|PROBELAUF OK|EINGERICHTET|RUECKGEBAUT): /);
  expect(r.out).toMatch(/^[\t\n -~]*$/);
  expect(r.alles).not.toContain(GEHEIM);
  expect(r.alles).not.toMatch(/PRIVATE KEY/);
}

function stoppOhneAenderung(args, vorbereitung, erwartet, opts = {}) {
  vorbereitung();
  const vorher = abbild();
  const r = lauf(args, opts);
  expect(r.code, r.alles).toBe(1);
  form(r);
  expect(r.letzte).toMatch(/^STOPP: .*Es wurde nichts geaendert\.$/);
  expect(r.out).toMatch(erwartet);
  expect(abbild()).toEqual(vorher);
  expect(aendernde()).toEqual([]);
  return r;
}

function kopie(alt, neu, name = "mutiert.sh") {
  expect(QUELLTEXT.split(alt).length - 1, `genau ein Vorkommen: ${alt}`).toBe(1);
  const f = path.join(tmp, name);
  writeFileSync(f, QUELLTEXT.replace(alt, neu));
  return f;
}

const sshdT = (ersetzen) => writeFileSync(z("sshd_t"), ersetzen(SSHD_T) + "\n");
const AK = () => path.join(W, "home", KONTO, ".ssh", "authorized_keys");

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("handy-zugang.sh: Probelauf und Einrichtung", () => {
  it("Syntax (bash -n) gültig; Aufruf unbekannt → Rückgabe 2, nichts geändert", () => {
    expect(spawnSync(BASH, ["-n", p(SKRIPT)], { encoding: "utf8" }).status).toBe(0);
    const vorher = abbild();
    const r = lauf(["--jaa"]);
    expect(r.code).toBe(2);
    expect(r.letzte).toBe("STOPP: unbekannter Aufruf. Es wurde nichts geaendert.");
    expect(abbild()).toEqual(vorher);
    expect(lauf(["--ja", "--ja"]).code).toBe(2);
  });

  it("Probelauf (ohne Schalter und --trocken): PROBELAUF OK, Plan mit Schlüsselzeile, ändert NICHTS", () => {
    for (const args of [[], ["--trocken"]]) {
      const vorher = abbild();
      const r = lauf(args);
      expect(r.code, r.alles).toBe(0);
      form(r);
      expect(r.err).toBe("");
      expect(r.zeilen[0]).toBe("INFO: HANDY-ZUGANG Probelauf: es wird nichts geaendert");
      expect(r.letzte).toBe(`PROBELAUF OK: es wuerde ${KONTO} angelegt (nichts geaendert)`);
      expect(r.zeilen).toContain(`INFO: ${ZEILE}`);
      expect(r.zeilen).toContain(`OK: Schluessel ED25519 CENTRIC-Mobile ${FP}`);
      expect(r.zeilen).toContain("INFO: sshd port 22 (laut sshd -T)");
      expect(r.out).toMatch(/^INFO: Host-Schluessel ED25519 SHA256:[A-Za-z0-9+/]{43} \(beim ersten Login vergleichen\)$/m);
      expect(r.out).not.toMatch(/^(STOPP|WARNUNG):/m);
      expect(abbild()).toEqual(vorher);
      expect(aendernde()).toEqual([]);
      expect(existsSync(path.join(W, "home", KONTO))).toBe(false);
    }
    /* sshd -T genau mit Verbindungsdaten des neuen Kontos */
    expect(protokoll()).toContain(`sshd -T -C user=${KONTO},host=localhost,addr=127.0.0.1`);
  });

  it("--ja: genau die erwarteten ändernden Aufrufe; Inhalt, Modi, Eigentümer; bestehende Zugänge unverändert", () => {
    const altAk = readFileSync(path.join(W, "home/admin/.ssh/authorized_keys"), "utf8");
    const r = lauf(["--ja"]);
    expect(r.code, r.alles).toBe(0);
    form(r);
    expect(r.letzte).toBe(`EINGERICHTET: ${KONTO}, Fingerabdruck ${FP}`);
    const s = p(path.join(W, "home", KONTO, ".ssh"));
    expect(aendernde()).toEqual([
      `useradd --create-home --shell /bin/bash --user-group --comment ${MARKE} ${KONTO}`,
      `passwd -l ${KONTO}`,
      `chmod 0700 -- ${s}`,
      `chown ${KONTO}:${KONTO} -- ${s}`,
      `chmod 0600 -- ${s}/authorized_keys`,
      `chown ${KONTO}:${KONTO} -- ${s}/authorized_keys`,
    ]);
    expect(readFileSync(AK(), "utf8")).toBe(`${ZEILE}\n`);
    expect(readFileSync(path.join(W, "home/admin/.ssh/authorized_keys"), "utf8")).toBe(altAk);
    const m = readFileSync(z("meta"), "utf8");
    expect(m).toContain(`${s}|${KONTO}:${KONTO}|700`);
    expect(m).toContain(`${s}/authorized_keys|${KONTO}:${KONTO}|600`);
    /* Nachprüfungen liefen alle */
    for (const x of ["OK: Gruppen: nur centric-mobil", "OK: keine sudo-Rechte", "OK: kein Zugriff auf /var/run/docker.sock", "OK: Passwort gesperrt (nur Schluessel)"]) expect(r.zeilen).toContain(x);
    expect(protokoll()).toContain(`sudo -n -l -U ${KONTO}`);
    expect(protokoll()).toContain(`runuser -u ${KONTO} -- test -r ${p(W)}/var/run/docker.sock`);
    expect(protokoll()).toContain(`runuser -u ${KONTO} -- test -w ${p(W)}/var/run/docker.sock`);
    /* keine weiteren Gruppen, keine Änderung an Bestandsgruppen */
    expect(readFileSync(z("group"), "utf8")).toBe("root:x:0:\nsudo:x:27:admin\ndocker:x:999:admin\nadmin:x:1000:\ncentric-mobil:x:1001:\n");
    expect(protokoll().join("\n")).not.toMatch(/( -G | --groups |usermod|gpasswd)/);
  });

  it("Ladeweg-Semantik: Sollwerte gelten für printf %s \"$s\" (ohne abschließenden Zeilenumbruch)", () => {
    const w = bau.werte(QUELLTEXT);
    expect(QUELLTEXT.endsWith("\n")).toBe(true);
    expect(w.sha256).toBe(sha(QUELLTEXT.replace(/\n+$/, "")));
    expect(w.sha256).not.toBe(sha(QUELLTEXT));
    const r = spawnSync(BASH, ["-c", 's=$(cat "$1"); printf %s "$s" | sha256sum', "x", p(SKRIPT)], { encoding: "utf8" });
    expect(r.stdout.slice(0, 64)).toBe(w.sha256);
  });
});

describe.skipIf(!BASH)("handy-zugang.sh: Vorabprüfungen → STOPP, nichts geändert", () => {
  it("nicht root", () => stoppOhneAenderung(["--ja"], () => {}, /^STOPP: nicht root \(uid 1000\)/m, { env: { PRUEF_UID: "1000" } }));
  it("kein Ubuntu 24.04", () => stoppOhneAenderung(["--ja"], () => wdatei("etc/os-release", 'ID=debian\nVERSION_ID="12"\n'), /^STOPP: kein Ubuntu 24\.04 \(gefunden: debian 12\)$/m));
  it("Benutzer existiert bereits (wird nie überschrieben)", () =>
    stoppOhneAenderung(["--ja"], () => writeFileSync(z("passwd"), `centric-mobil:x:1005:1005::/home/anders:/bin/sh\n`, { flag: "a" }), /^STOPP: Benutzer centric-mobil existiert bereits/m));
  it("Gruppe existiert bereits (Kollision)", () => stoppOhneAenderung(["--ja"], () => writeFileSync(z("group"), "centric-mobil:x:1007:\n", { flag: "a" }), /^STOPP: Gruppe centric-mobil existiert bereits/m));
  it("getent nicht auswertbar → fail-closed", () => stoppOhneAenderung(["--ja"], () => schalter("getent_kaputt"), /^STOPP: Benutzer centric-mobil nicht pruefbar \(getent Rueckgabe 3\)$/m));
  it("/home/centric-mobil existiert bereits", () => stoppOhneAenderung(["--ja"], () => mkdirSync(path.join(W, "home", KONTO)), /^STOPP: \/home\/centric-mobil existiert bereits/m));

  for (const [fall, neu] of [
    ["Option vor dem Schlüssel", `no-pty ${SCHLUESSEL}`],
    ["zweite Zeile", `${SCHLUESSEL}\n${SCHLUESSEL}`],
    ["Steuerzeichen", `${SCHLUESSEL}\u0001`],
    ["anderer Kommentar", SCHLUESSEL.replace("CENTRIC-Mobile", "CENTRIC-Mobil")],
    ["anderer Typ", SCHLUESSEL.replace("ssh-ed25519", "ssh-rsa")],
  ]) {
    it(`Schlüssel manipuliert: ${fall}`, () => {
      const f = kopie(`readonly SCHLUESSEL='${SCHLUESSEL}'`, `readonly SCHLUESSEL='${neu}'`);
      stoppOhneAenderung(["--ja"], () => {}, /^STOPP: eingebetteter Schluessel hat nicht das Format/m, { skript: f });
    });
  }

  it("Fingerabdruck falsch (ein Base64-Zeichen geändert, Format gültig)", () => {
    const f = kopie(`readonly SCHLUESSEL='${SCHLUESSEL}'`, `readonly SCHLUESSEL='${SCHLUESSEL.replace("XsR2 ", "XsR3 ")}'`);
    stoppOhneAenderung(["--ja"], () => {}, /^STOPP: Fingerabdruck des eingebetteten Schluessels weicht vom Sollwert ab \(SHA256:/m, { skript: f });
  });

  it("Sollwert-Fingerabdruck im Skript verändert", () => {
    const f = kopie(`readonly SOLL_FINGERABDRUCK='${FP}'`, `readonly SOLL_FINGERABDRUCK='${FP.replace("BQ", "BR")}'`);
    stoppOhneAenderung(["--ja"], () => {}, /^STOPP: Fingerabdruck des eingebetteten Schluessels weicht vom Sollwert ab/m, { skript: f });
  });

  it("sshd fehlt", () => stoppOhneAenderung(["--ja"], () => unlinkSync(path.join(bin, "sshd")), /^STOPP: sshd fehlt; sshd-Konfiguration nicht pruefbar$/m));
  it("sshd -T scheitert", () => stoppOhneAenderung(["--ja"], () => schalter("sshd_scheitert"), /^STOPP: sshd -T -C user=centric-mobil fehlgeschlagen/m));
  it("sshd -T nicht auswertbar", () => stoppOhneAenderung(["--ja"], () => writeFileSync(z("sshd_t"), "Unbekannte Ausgabe\n"), /^STOPP: Ausgabe von sshd -T nicht auswertbar$/m));
  it("pubkeyauthentication no", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t.replace("pubkeyauthentication yes", "pubkeyauthentication no")), /^STOPP: sshd: pubkeyauthentication ist nicht yes$/m));
  it("usepam no (gesperrtes Konto wäre nicht anmeldbar)", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t.replace("usepam yes", "usepam no")), /^STOPP: sshd: usepam ist nicht yes/m));
  it("permittty no", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t.replace("permittty yes", "permittty no")), /^STOPP: sshd: permittty ist nicht yes/m));
  it("forcecommand gesetzt", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t + "\nforcecommand /usr/bin/false"), /^STOPP: sshd: forcecommand fuer centric-mobil gesetzt$/m));
  it("authenticationmethods verlangt zusätzlich Passwort", () =>
    stoppOhneAenderung(["--ja"], () => sshdT((t) => t.replace("authenticationmethods any", "authenticationmethods publickey,password")), /^STOPP: sshd: authenticationmethods erlaubt publickey allein nicht/m));
  it("authorizedkeyscommand gesetzt", () =>
    stoppOhneAenderung(["--ja"], () => sshdT((t) => t.replace("authorizedkeyscommand none", "authorizedkeyscommand /usr/local/bin/schluessel %u")), /^STOPP: sshd: authorizedkeyscommand ist gesetzt/m));
  it("authorizedkeysfile ohne Standard", () =>
    stoppOhneAenderung(["--ja"], () => sshdT((t) => t.replace("authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2", "authorizedkeysfile /etc/ssh/schluessel/%u")), /^STOPP: sshd: authorizedkeysfile enthaelt nicht/m));
  it("AllowUsers schließt aus (auch user@host)", () => {
    stoppOhneAenderung(["--ja"], () => sshdT((t) => t + "\nallowusers admin\nallowusers centric-mobil@192.0.2.1"), /^STOPP: sshd: allowusers gesetzt, centric-mobil waere ausgeschlossen/m);
  });
  it("AllowGroups schließt aus", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t + "\nallowgroups admin"), /^STOPP: sshd: allowgroups gesetzt/m));
  it("DenyUsers mit Muster", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t + "\ndenyusers centric-*"), /^STOPP: sshd: denyusers schliesst centric-mobil aus oder ist nicht sicher auswertbar/m));
  it("DenyGroups nennt die Gruppe", () => stoppOhneAenderung(["--ja"], () => sshdT((t) => t + "\ndenygroups centric-mobil"), /^STOPP: sshd: denygroups schliesst/m));
  it("ssh-Dienst nicht aktiv", () => stoppOhneAenderung(["--ja"], () => schalter("dienst_aus"), /^STOPP: ssh-Dienst nicht aktiv/m));
  it("docker.sock für alle zugänglich", () => stoppOhneAenderung(["--ja"], () => meta("var/run/docker.sock", "root:docker", "666"), /^STOPP: \/var\/run\/docker\.sock ist fuer alle les- oder schreibbar/m));

  it("Positiv: AllowUsers mit exaktem Namen und DenyUsers ohne Bezug → kein STOPP", () => {
    sshdT((t) => t + "\nallowusers admin\nallowusers centric-mobil\ndenyusers gast");
    const r = lauf([]);
    expect(r.code, r.alles).toBe(0);
    expect(r.zeilen).toContain("OK: sshd allowusers nennt centric-mobil");
  });

  it("mehrere Befunde werden gesammelt gemeldet", () => {
    const r = stoppOhneAenderung(["--ja"], () => {
      schalter("dienst_aus");
      mkdirSync(path.join(W, "home", KONTO));
    }, /^STOPP: ssh-Dienst nicht aktiv/m);
    expect(r.letzte).toBe("STOPP: 2 Befund(e). Es wurde nichts geaendert.");
  });
});

describe.skipIf(!BASH)("handy-zugang.sh: Warnungen (für alle lesbar)", () => {
  it("world-readable .env: Probelauf warnt (nur Pfad), --ja verweigert, --ja-trotz-warnung richtet ein", () => {
    meta("opt/apps/centric-dienstplanung/.env", "admin:admin", "644");
    wdatei("home/admin/.ssh/id_ed25519", "kein echter Schluessel\n");
    meta("home/admin/.ssh/id_ed25519", "admin:admin", "644");
    wdatei("home/admin/.ssh/id_ed25519.pub", "oeffentlich\n");
    meta("home/admin/.ssh/id_ed25519.pub", "admin:admin", "644");
    const r = lauf([]);
    expect(r.code, r.alles).toBe(0);
    form(r);
    expect(r.zeilen).toContain("WARNUNG: fuer alle lesbar: /opt/apps/centric-dienstplanung/.env (Modus 644)");
    expect(r.zeilen).toContain("WARNUNG: fuer alle lesbar: /home/admin/.ssh/id_ed25519 (Modus 644)");
    expect(r.out).not.toContain("id_ed25519.pub");
    expect(r.letzte).toBe("PROBELAUF OK: es wuerde centric-mobil angelegt, wegen 2 Warnung(en) nur mit --ja-trotz-warnung (nichts geaendert)");
    stoppOhneAenderung(["--ja"], () => {}, /^WARNUNG: fuer alle lesbar/m);
    expect(lauf(["--ja"]).letzte).toBe("STOPP: 2 Warnung(en); Einrichtung nur mit --ja-trotz-warnung. Es wurde nichts geaendert.");
    const r2 = lauf(["--ja-trotz-warnung"]);
    expect(r2.code, r2.alles).toBe(0);
    expect(r2.letzte).toBe(`EINGERICHTET: ${KONTO}, Fingerabdruck ${FP}`);
  });

  it("Betriebsdaten: data/ betretbar und Datei für alle lesbar → Warnung", () => {
    meta("opt/apps/centric-dienstplanung/data", "admin:admin", "755");
    meta("opt/apps/centric-dienstplanung/data/ablage.json", "admin:admin", "644");
    const r = lauf([]);
    expect(r.code).toBe(0);
    expect(r.zeilen).toContain("WARNUNG: 1 Dateien in /opt/apps/centric-dienstplanung/data fuer alle lesbar (Betriebsdaten)");
    form(r);
  });
});

describe.skipIf(!BASH)("handy-zugang.sh: Nachprüfungen nach useradd → Rückgabe 3, kein Schlüssel", () => {
  for (const [fall, vorbereitung, meldung] of [
    ["docker.sock für das Konto lesbar", () => schalter("docker_offen"), /^STOPP: centric-mobil kann \/var\/run\/docker\.sock oeffnen \(test -r\)$/m],
    ["sudo-Rechte vorhanden", () => schalter("sudo_rechte"), /^STOPP: sudo -l -U centric-mobil zeigt Rechte/m],
    ["zusätzliche Gruppe (z. B. GROUPS= in /etc/default/useradd)", () => schalter("gruppen_centric-mobil", "centric-mobil docker\n"), /^STOPP: Gruppen von centric-mobil: centric-mobil docker/m],
    ["Passwort nicht gesperrt", () => schalter("passwd_l_wirkungslos"), /^STOPP: Passwort von centric-mobil nicht gesperrt$/m],
    ["runuser nicht möglich (fail-closed)", () => schalter("runuser_kaputt"), /^STOPP: runuser -u centric-mobil nicht moeglich/m],
    ["uid unter 1000", () => schalter("neue_uid", "999"), /^STOPP: uid von centric-mobil ungueltig \(999\)$/m],
    ["uid-Kollision", () => schalter("neue_uid", "1000"), /^STOPP: uid 1000 ist mehrfach vergeben/m],
  ]) {
    it(fall, () => {
      vorbereitung();
      const r = lauf(["--ja"]);
      expect(r.code, r.alles).toBe(3);
      form(r);
      expect(r.out).toMatch(meldung);
      expect(r.letzte).toBe("STOPP: Konto centric-mobil angelegt, Nachpruefung gescheitert; KEIN Schluessel hinterlegt. Rueckbau: --rueckbau");
      expect(existsSync(path.join(W, "home", KONTO, ".ssh"))).toBe(false);
      expect(aendernde().filter((x) => /^(chmod|chown)/.test(x))).toEqual([]);
    });
  }

  it("~/.ssh existiert schon nach useradd (skel) → Rückgabe 3, nichts überschrieben", () => {
    schalter("skel_ssh");
    const r = lauf(["--ja"]);
    expect(r.code, r.alles).toBe(3);
    expect(r.out).toMatch(/^STOPP: \/home\/centric-mobil\/\.ssh existiert bereits/m);
    expect(existsSync(AK())).toBe(false);
  });

  it("useradd scheitert → Rückgabe 3 mit Rückbau-Hinweis", () => {
    schalter("useradd_scheitert");
    const r = lauf(["--ja"]);
    expect(r.code).toBe(3);
    expect(r.letzte).toBe("STOPP: useradd gescheitert. Zustand pruefen; Rueckbau: --rueckbau");
  });
});

describe.skipIf(!BASH)("handy-zugang.sh: Rückbau", () => {
  it("nach --ja: entfernt nur centric-mobil; Bestand unverändert", () => {
    const vorher = abbild();
    expect(lauf(["--ja"]).code).toBe(0);
    const r = lauf(["--rueckbau"]);
    expect(r.code, r.alles).toBe(0);
    form(r);
    expect(r.letzte).toBe("RUECKGEBAUT: centric-mobil entfernt (Konto, /home/centric-mobil)");
    expect(protokoll().filter((x) => x.startsWith("userdel"))).toEqual([`userdel -r ${KONTO}`]);
    expect(readFileSync(z("passwd"), "utf8")).not.toContain(KONTO);
    expect(existsSync(path.join(W, "home", KONTO))).toBe(false);
    /* bis auf die Metadatentabelle (Testhilfe) wie vorher */
    const ohneMeta = (a) => a.filter((x) => !x.startsWith(path.join("zustand", "meta")) && !x.startsWith(path.join("zustand", "gesperrt_")));
    expect(ohneMeta(abbild())).toEqual(ohneMeta(vorher));
  });

  it("nach Rückgabe 3 (kein Schlüssel hinterlegt) ist der Rückbau möglich", () => {
    schalter("docker_offen");
    expect(lauf(["--ja"]).code).toBe(3);
    const r = lauf(["--rueckbau"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.zeilen).toContain("INFO: keine authorized_keys (Einrichtung war unvollstaendig)");
  });

  it("Konto fehlt → STOPP, nichts geändert", () => stoppOhneAenderung(["--rueckbau"], () => {}, /^STOPP: Benutzer centric-mobil existiert nicht; nichts zurueckzubauen/m));

  for (const [fall, nachJa, meldung] of [
    ["fremdes Konto gleichen Namens (Marke fehlt)", () => writeFileSync(z("passwd"), readFileSync(z("passwd"), "utf8").replace(MARKE, "Jemand anderes")), /^STOPP: Konto centric-mobil traegt nicht die Marke/m],
    ["uid unter 1000", () => writeFileSync(z("passwd"), readFileSync(z("passwd"), "utf8").replace(":1001:1001:", ":998:1001:")), /^STOPP: uid von centric-mobil unter 1000/m],
    ["authorized_keys verändert (zweite Zeile)", () => writeFileSync(AK(), `${ZEILE}\n${ALT_AK}`), /^STOPP: authorized_keys von centric-mobil ist nicht genau die Zeile dieses Skripts/m],
    ["authorized_keys verändert (andere Optionen)", () => writeFileSync(AK(), `${SCHLUESSEL}\n`), /^STOPP: authorized_keys von centric-mobil ist nicht genau/m],
    ["laufende Prozesse", () => schalter("prozesse"), /^STOPP: laufende Prozesse von centric-mobil/m],
  ]) {
    it(`Rückbau-Schutz: ${fall} → STOPP, nichts geändert`, () => {
      expect(lauf(["--ja"]).code).toBe(0);
      writeFileSync(z("protokoll"), "");
      const r = stoppOhneAenderung(["--rueckbau"], nachJa, meldung);
      expect(r.letzte).toMatch(/^STOPP: \d Befund\(e\), kein Rueckbau\. Es wurde nichts geaendert\.$/);
      expect(protokoll().some((x) => x.startsWith("userdel"))).toBe(false);
    });
  }
});

/* Mutationen: ohne die jeweilige Prüfung läuft der Negativfall durch (Test wäre rot). */
describe.skipIf(!BASH)("handy-zugang.sh: Mutationsnachweis", () => {
  const mutationen = [
    ["pruefe_root", "\n  pruefe_root\n  pruefe_os\n  pruefe_werkzeuge", "\n  :\n  pruefe_os\n  pruefe_werkzeuge", [], () => {}, { PRUEF_UID: "1000" }],
    ["pruefe_os", "\n  pruefe_os\n  pruefe_werkzeuge", "\n  :\n  pruefe_werkzeuge", [], () => wdatei("etc/os-release", "ID=debian\nVERSION_ID=12\n")],
    ["Existenzprüfung Konto", "\n  pruefe_konto_frei\n", "\n  :\n", [], () => writeFileSync(z("passwd"), "centric-mobil:x:1005:1005::/home/x:/bin/sh\n", { flag: "a" })],
    ["Gruppenprüfung (Kollision)", "\n  pruefe_gruppe_frei\n", "\n  :\n", [], () => writeFileSync(z("group"), "centric-mobil:x:1007:\n", { flag: "a" })],
    ["Heimverzeichnis", "\n  pruefe_heim_frei\n", "\n  :\n", [], () => mkdirSync(path.join(W, "home", KONTO))],
    ["sshd-Prüfung", "\n  pruefe_sshd\n  pruefe_dienst\n", "\n  :\n  pruefe_dienst\n", [], () => sshdT((t) => t.replace("pubkeyauthentication yes", "pubkeyauthentication no"))],
    ["Dienst", "\n  pruefe_dienst\n", "\n  :\n", [], () => schalter("dienst_aus")],
    ["docker.sock vorab", "\n  pruefe_docker_sock\n", "\n  :\n", [], () => meta("var/run/docker.sock", "root:docker", "666")],
    ["Schlüsselprüfung (ganz)", "\n  pruefe_schluessel\n", "\n  :\n", [], null, {}, (q) => q.replace(`readonly SCHLUESSEL='${SCHLUESSEL}'`, `readonly SCHLUESSEL='${SCHLUESSEL.replace("XsR2 ", "XsR3 ")}'`)],
    [
      "Fingerabdruck-Vergleich",
      `if [[ "$fp" != "256 $SOLL_FINGERABDRUCK CENTRIC-Mobile (ED25519)" || "$f" != "$SOLL_FINGERABDRUCK" ]]; then`,
      "if false; then",
      [],
      null,
      {},
      (q) => q.replace(`readonly SCHLUESSEL='${SCHLUESSEL}'`, `readonly SCHLUESSEL='${SCHLUESSEL.replace("XsR2 ", "XsR3 ")}'`),
    ],
    ["Gruppen nach useradd", "\nnach_gruppen\n", "\n:\n", ["--ja"], () => schalter("gruppen_centric-mobil", "centric-mobil docker\n")],
    ["sudo nach useradd", "\nnach_sudo\n", "\n:\n", ["--ja"], () => schalter("sudo_rechte")],
    ["docker.sock nach useradd", "\nnach_docker\n", "\n:\n", ["--ja"], () => schalter("docker_offen")],
    ["Warnungen (.env)", "\n  pruefe_geheimnisse\n", "\n  :\n", ["--ja"], () => meta("opt/apps/centric-dienstplanung/.env", "admin:admin", "644")],
  ];
  for (const [name, alt, neu, args, vorbereitung, env = {}, zusatz] of mutationen) {
    it(`ohne ${name}: Negativfall läuft durch`, () => {
      if (vorbereitung) vorbereitung();
      expect(QUELLTEXT.split(alt).length - 1, alt).toBe(1);
      let q = QUELLTEXT.replace(alt, neu);
      if (zusatz) q = zusatz(q);
      const f = path.join(tmp, "mutiert.sh");
      writeFileSync(f, q);
      /* Original: STOPP */
      const orig = zusatz ? path.join(tmp, "original.sh") : SKRIPT;
      if (zusatz) writeFileSync(orig, zusatz(QUELLTEXT));
      const r0 = lauf(args, { skript: orig, env });
      expect(r0.letzte, r0.alles).toMatch(/^STOPP: /);
      /* Mutant: kein STOPP mehr */
      if (args.includes("--ja")) {
        rmSync(path.join(W, "home", KONTO), { recursive: true, force: true });
        writeFileSync(z("passwd"), readFileSync(z("passwd"), "utf8").split("\n").filter((x) => !x.startsWith("centric-mobil:x:1001:")).join("\n"));
        writeFileSync(z("group"), readFileSync(z("group"), "utf8").split("\n").filter((x) => !x.startsWith("centric-mobil:x:1001:")).join("\n"));
      }
      const r = lauf(args, { skript: f, env });
      expect(r.letzte, r.alles).toMatch(/^(PROBELAUF OK|EINGERICHTET): /);
    });
  }
});

describe("werkzeug/handy-zugang-bauen.mjs", () => {
  it("--pruefen: Skript und Doku-Sollwerte in Ordnung", () => {
    expect(bau.pruefen(WURZEL)).toEqual([]);
  });

  it("Fingerabdruck in Node = Sollwert; Manipulationen erkannt", () => {
    expect(bau.fingerabdruck(SCHLUESSEL)).toBe(FP);
    expect(bau.fingerabdruck(SCHLUESSEL.replace("XsR2 ", "XsR3 "))).not.toBe(FP);
    expect(bau.fingerabdruck(`no-pty ${SCHLUESSEL}`)).toBeNull();
    expect(bau.fingerabdruck(`ssh-ed25519 ${koerper(0x51).slice(0, -4)} x`)).toBeNull();
  });

  it("Mutationen: veränderter Schlüssel, Sollwert, Optionen oder Doku → Befund", () => {
    const skript = readFileSync(SKRIPT, "utf8");
    const doku = readFileSync(path.join(WURZEL, bau.DOKU), "utf8");
    expect(bau.pruefeInhalt({ skript, doku })).toEqual([]);
    expect(bau.pruefeInhalt({ skript: skript.replace("XsR2 ", "XsR3 "), doku }).join("\n")).toMatch(/SCHLUESSEL im Skript/);
    expect(bau.pruefeInhalt({ skript: skript.replace(`'${FP}'`, `'${FP.replace("BQ", "BR")}'`), doku }).join("\n")).toMatch(/SOLL_FINGERABDRUCK/);
    expect(bau.pruefeInhalt({ skript: skript.replace(`'${bau.OPTIONEN}'`, "'restrict'"), doku }).join("\n")).toMatch(/OPTIONEN/);
    expect(bau.pruefeInhalt({ skript: skript + "# x\n", doku }).join("\n")).toMatch(/Sollwert fehlt oder veraltet/);
    expect(bau.pruefeInhalt({ skript: skript.replace("Probelauf", "Pröbelauf"), doku }).join("\n")).toMatch(/ASCII/);
  });

  it("Befehle: nur ASCII, Tor mit 32 Hex und &&, feste Zeichenzahlen; --bauen ist idempotent", () => {
    const w = bau.werte(QUELLTEXT);
    const b = bau.befehle("0123456789ab", w);
    for (const x of b) expect(x.befehl).toMatch(/^[ -~]+$/);
    for (const nr of ["2", "3", "3W", "R"]) {
      const x = b.find((y) => y.nr === nr);
      expect(x.befehl.startsWith(`printf %s "$s" | sha256sum | grep -q '^${w.kurz32}' && bash -c "$s"`)).toBe(true);
    }
    expect(b.find((y) => y.nr === "1").befehl).toBe("s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/0123456789ab/deploy/handy-zugang.sh)");
    expect(Object.fromEntries(b.map((x) => [x.nr, x.zeichen]))).toEqual({ 1: 109, K1: 72, K2: 23, 2: 88, 3: 95, "3W": 109, H: 48, 4: 7, R: 101 });
    const doku = readFileSync(path.join(WURZEL, bau.DOKU), "utf8");
    expect(bau.dokuNeu(doku, QUELLTEXT)).toBe(lf(doku));
  });
});

describe("handy-zugang.sh: Quelltext-Wächter", () => {
  it("Dateimodus 100755", () => {
    const z = execFileSync("git", ["ls-files", "-s", "deploy/handy-zugang.sh"], { cwd: WURZEL, encoding: "utf8" });
    expect(z).toMatch(/^100755 /);
  });

  it("keine Netz-, Paket-, Dienst-, Konto- oder sshd-Konfigurationsänderung; useradd genau einmal ohne Zusatzgruppen", () => {
    const code = ohneKommentareUndZeichenketten(QUELLTEXT);
    for (const v of [/\bcurl\b/, /\bwget\b/, /\bapt(-get)?\b/, /\bdpkg\b/, /\bsnap\b/, /\bnpm\b/, /\busermod\b/, /\bgroupadd\b/, /\bgroupdel\b/, /\bgpasswd\b/, /\bvisudo\b/, /\bdocker\b/, /\bsetfacl\b/, /\bsystemctl +(start|stop|restart|reload|enable|disable|mask)\b/, /(^|\s)service\s/m,/\bssh-keygen +-t\b/, /\bsed +-i\b/, /\btee\b/, /\bmv\b/, /\bln\b/]) {
      expect(code, String(v)).not.toMatch(v);
    }
    /* Aufruf + Werkzeugliste; genau ein Aufruf mit Optionen */
    expect(code.match(/\buseradd\b/g)).toHaveLength(2);
    expect(code.match(/\buseradd --/g)).toHaveLength(1);
    expect(QUELLTEXT).toMatch(/^if ! useradd --create-home --shell \/bin\/bash --user-group --comment "\$MARKE" "\$KONTO" >\/dev\/null 2>&1; then$/m);
    expect(code.match(/\buserdel -/g)).toHaveLength(1);
    expect(QUELLTEXT).toMatch(/^  userdel -r "\$KONTO" /m);
    /* Umlenkungen schreiben nur nach /dev/null oder in authorized_keys des neuen Kontos */
    const ohneArithmetik = code
      .split("\n")
      .filter((x) => !x.includes("(("))
      .join("\n");
    const ziele = [...ohneArithmetik.matchAll(/(?<![<&0-9])>{1,2}\s*([^\s;|&)]+)/g)].map((m) => m[1]);
    expect(ziele.length).toBeGreaterThan(0);
    for (const zz of ziele) expect(["/dev/null", "&2", '""'], zz).toContain(zz);
    expect(ziele.filter((x) => x === '""')).toHaveLength(1);
    expect(QUELLTEXT).toContain(`    printf '%s\\n' "$ZEILE" >"$a"\n`);
    expect(QUELLTEXT).not.toMatch(/\/etc\/ssh\/sshd_config/);
  });

  it("nur ASCII; set -euo pipefail, LC_ALL=C, fester PATH, Prüfvariablen bei SSH verworfen", () => {
    expect(QUELLTEXT).toMatch(/^[\t\n -~]*$/);
    expect(QUELLTEXT).toContain("\nset -euo pipefail\n");
    expect(QUELLTEXT).toContain("\nexport LC_ALL=C\n");
    expect(QUELLTEXT).toContain('PATH="${HANDY_PRUEFPFAD:-/usr/sbin:/usr/bin:/sbin:/bin}"');
    expect(QUELLTEXT).toMatch(/if \[\[ -n "\$\{SSH_CONNECTION:-\}" \]\]; then\n {2}unset HANDY_PRUEFPFAD HANDY_PRUEFWURZEL\nfi/);
    expect(QUELLTEXT).toContain(`readonly OPTIONEN='${bau.OPTIONEN}'`);
    /* kein Forced Command und kein no-pty: interaktive Shell; keine Weiterleitungen */
    expect(ZEILE).not.toMatch(/command=|no-pty|restrict/);
    expect(ZEILE.startsWith("no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 ")).toBe(true);
  });
});
