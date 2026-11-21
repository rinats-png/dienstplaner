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
vi.setConfig({ testTimeout: 60000 });

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
  sshd: `#!/bin/bash
printf 'sshd %s\\n' "$*" >>"$PRUEF_PROTOKOLL"
case "$1" in
  -T) cat "$PRUEF_SSHD_T" ;;
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
  chown: `#!/bin/bash
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
  for (const d of ["usr/local/sbin", "root", "opt/apps/centric-dienstplanung/data", "home/admin/.ssh"]) mkdirSync(path.join(w, d), { recursive: true });
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

function lauf(args = [], env = {}, datei = inst) {
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
  const r = spawnSync(BASH, [p(datei), ...args], { encoding: "utf8", env: umgebung, timeout: 55000 });
  const out = r.stdout ?? "";
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
    const b = befehl("0ec90fa0f8f7", t);
    expect(b).toBe(
      `cd /root && curl -fsSLo rel0 https://github.com/rinats-png/dienstplaner/raw/0ec90fa0f8f7/deploy/inventur-install.sh && [[ $(sha256sum rel0) == "${sha(Buffer.from(t, "utf8"))}  rel0" ]] && bash rel0`,
    );
    /* keine Pipe, keine Umlenkung, kein Semikolon: ein Tippfehler darf die Prüfung nicht still entfernen */
    expect(b).not.toMatch(/[|;<>`']/);
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
  it("authorized_keys mit falschen Rechten (644) oder falschem Besitzer → Abbruch", () => {
    negativ(() => metaSetzen(AK_REL, 1000, "644"), /600/);
    negativ(() => metaSetzen(AK_REL, 0, "600"), /600/);
  });
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
    const sshdAufrufe = readFileSync(proto, "utf8").split("\n").filter((z) => z.startsWith("sshd "));
    expect(new Set(sshdAufrufe)).toEqual(new Set(["sshd -T", "sshd -t"]));
    keineLecks(r);
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
      anker: '"$uid" != "$KONTO_UID" || "$mode" != 600',
      ersatz: '"$uid" != "$KONTO_UID"',
      vorbereiten: () => metaSetzen(AK_REL, 1000, "644"),
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
      erwarteAbbruch(lauf());
      writeFileSync(inst, gebaut({ ersetze: [[f.anker, f.ersatz]] }));
      const r = lauf(["--trocken"]);
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
    expect(ohneKommentare).not.toMatch(/sshd_config|sudoers|\/etc\/group|\/etc\/passwd/);
    expect(code).not.toMatch(/\bsshd\s+(?!-T\b|-t\b)/);
    expect(code).not.toMatch(/\.env\b/);
  });

  it("authorized_keys nur mit >> (anhängen) beschrieben, nie mit >", () => {
    const umlenkungen = [...logik.matchAll(/[^>&0-9]>{1,2}\s*"?\$?\{?([A-Za-z_]+)/g)].map((m) => `${m[0].includes(">>") ? ">>" : ">"} ${m[1]}`);
    expect(umlenkungen.filter((u) => u.endsWith(" AK")).sort()).toEqual(["> AK", ">> AK"]);
    for (const u of umlenkungen) expect(u, u).toMatch(/^(>> AK|> TMP_SKRIPT|> SICH|>> SICH|> TMPD|>> m|> AK)$/);
    /* „> AK“ nur in der Neuanlage mit noclobber (scheitert, wenn die Datei existiert); anhängen genau einmal */
    expect(logik.match(/[^>]>"\$AK"/g)).toEqual([' >"$AK"']);
    expect(logik).toContain('(set -o noclobber; : >"$AK")');
    expect(logik.match(/>>"\$AK"/g)).toHaveLength(1);
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
  });

  it("keine öffentliche Schlüsseldatei mit erfundenem Inhalt im Repository", () => {
    const f = path.join(WURZEL, "deploy", "inventur-schluessel.pub");
    if (existsSync(f)) expect(() => schluesselPruefen(readFileSync(f, "utf8"))).not.toThrow();
    expect(statSync(INSTALLER).isFile()).toBe(true);
  });
});
