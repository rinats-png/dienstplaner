/* ==========================================================================
   INVENTUR-SKRIPT (REL-0) — deploy/inventur.sh liest nur und gibt keine
   Geheimnisse aus

   Das Skript läuft gegen einen Docker-Stub (Muster wie
   pruefungen/deploy-skripte.test.js und deploy/sicherung/ci/fake-docker.sh):
   ein falsches `docker` im PATH protokolliert jeden Aufruf in ein eigenes
   Verzeichnis außerhalb von Betriebs- und Heimatverzeichnis. Die .env, das
   Betriebsprotokoll und die Sicherungsmarke enthalten erfundene Geheimnisse;
   keins davon darf in der Ausgabe erscheinen.

   Geprüft wird:
     - Syntax, Aufruf (--hilfe, unbekannte Argumente), Forced Command
     - alle Abschnitte V-1 bis V-9, R-1, R-2 mit Kennzeichnung
     - Schlüsselnamen der .env ja, Werte nie (auch nicht über compose config)
     - nur erlaubte Docker-Unterbefehle (Allowlist über das Aufrufprotokoll)
     - schreibt nichts (Verzeichnisabbild vorher = nachher)
     - fail-soft: scheitert Docker, laufen die übrigen Abschnitte weiter
     - Quelltext-Wächter: kein cat .env, keine Schreibbefehle/Umlenkungen,
       keine verändernden Docker-Befehle, genau ein fester docker exec

   Unter Linux (CI) läuft alles. Unter Windows nur mit Git Bash
   (CENTRIC_BASH oder Standardpfad); sonst übersprungen.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(WURZEL, "deploy", "inventur.sh");
const QUELLTEXT = readFileSync(SKRIPT, "utf8");

function bashFinden() {
  if (process.env.CENTRIC_BASH) return process.env.CENTRIC_BASH;
  if (process.platform !== "win32") return "bash";
  const git = "C:/Program Files/Git/bin/bash.exe";
  return existsSync(git) ? git : null;
}
const BASH = bashFinden();
const p = (x) => x.replace(/\\/g, "/");
/* Ein Lauf startet unter Git Bash rund 50 Prozesse (mehrere Sekunden). */
vi.setConfig({ testTimeout: 120000 });

/* Erfundene Werte. GEHEIMNISSE dürfen nirgends in der Ausgabe stehen. */
const DIGEST_HEX = "a".repeat(64);
const BILD_ID = "sha256:" + "1b".repeat(32);
const COMMIT = "2".repeat(40);
const GEHEIM = "GEHEIM-TESTWERT-123";
const PFEFFER = "pfeffer-wert-nur-probe-456";
const TOKEN = "ghp_ProbeToken0123456789abcdefABCDEF";
const MAIL = "pflege.person@beispiel.de";
const IP = "203.0.113.77";

/* Öffentlicher ed25519-Schlüssel aus festen Bytes (kein erzeugter Schlüssel, kein privater Teil). */
function oeffentlicherSchluessel(byte) {
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const typ = Buffer.from("ssh-ed25519");
  return Buffer.concat([u32(typ.length), typ, u32(32), Buffer.alloc(32, byte)]).toString("base64");
}
const KOERPER_DEPLOY = oeffentlicherSchluessel(0x42);
const KOERPER_INVENTUR = oeffentlicherSchluessel(0x43);

const STUB = [
  "#!/usr/bin/env bash",
  "# Docker-Stub für die Inventurprüfung. Protokoll in $STUB_DIR/aufrufe.log.",
  'z="$STUB_DIR"',
  "printf '%s\\n' \"$*\" >>\"$z/aufrufe.log\"",
  'if [[ -f "$z/docker_tot" ]]; then echo "Cannot connect to the Docker daemon" >&2; exit 1; fi',
  'letztes="${*: -1}"',
  'case "$1" in',
  "  compose)",
  '    case "$2" in',
  "      ps) echo 'NAME IMAGE SERVICE STATUS PORTS'; echo 'centric-dp-web ghcr.io/rinats-png/dienstplaner@sha256:@HEX@ web Up 2 days (healthy) 127.0.0.1:3000->3000/tcp' ;;",
  /* Wie echtes `compose config`: die Umgebung aus env_file steht im Klartext darin. */
  "      config) printf '%s\\n' 'services:' '  web:' '    environment:' '      CENTRIC_SMTP_PASSWORT: @GEHEIM@' '      CENTRIC_PFEFFER: @PFEFFER@' '    image: ghcr.io/rinats-png/dienstplaner@sha256:@HEX@' ;;",
  "      version) echo 'Docker Compose version v2.29.7' ;;",
  '      *) echo "stub: compose $2 nicht erlaubt" >&2; exit 9 ;;',
  "    esac ;;",
  "  inspect)",
  '    case "$letztes" in',
  "      *Mounts*) echo 'bind /opt/apps/centric-dienstplanung/data -> /app/data rw=true' ;;",
  "      *working_dir*) echo 'Compose-Projekt: centric Pfad: /opt/apps/centric-dienstplanung Dateien: /opt/apps/centric-dienstplanung/compose.yml' ;;",
  "      *State.Status*) echo '@ID@ ghcr.io/rinats-png/dienstplaner@sha256:@HEX@ running healthy 2026-11-02T15:59:03.5Z 0' ;;",
  "      *) echo '@ID@' ;;",
  "    esac ;;",
  "  image) echo '@ID@ [\"ghcr.io/rinats-png/dienstplaner@sha256:@HEX@\"] @COMMIT@' ;;",
  "  images) echo 'REPOSITORY TAG DIGEST IMAGE-ID'; echo 'ghcr.io/rinats-png/dienstplaner <none> sha256:@HEX@ @ID@' ;;",
  "  version) echo '27.3.1' ;;",
  "  stats) echo 'centric-dp-web 0.50% 120MiB / 1GiB 11.70%' ;;",
  "  exec) echo '{\"status\":\"ok\",\"nutzer\":\"@MAIL@\",\"adresse\":\"@IP@\"}' ;;",
  '  *) echo "stub: docker $1 nicht erlaubt" >&2; exit 9 ;;',
  "esac",
  "",
]
  .join("\n")
  .replaceAll("@HEX@", DIGEST_HEX)
  .replaceAll("@ID@", BILD_ID)
  .replaceAll("@COMMIT@", COMMIT)
  .replaceAll("@GEHEIM@", GEHEIM)
  .replaceAll("@PFEFFER@", PFEFFER)
  .replaceAll("@MAIL@", MAIL)
  .replaceAll("@IP@", IP);

/* Erlaubte Docker-Aufrufe (genau so, wie der Stub sie protokolliert). */
const ERLAUBT = [
  /^compose (ps|config|version)$/,
  /^inspect centric-dp-web --format /,
  /^image inspect --format /,
  /^images --digests --no-trunc ghcr\.io\/rinats-png\/dienstplaner$/,
  /^version --format /,
  /^stats --no-stream /,
  /^exec centric-dp-web node -e fetch\('http:\/\/127\.0\.0\.1:3000\/gesund'\)\.then\(r=>r\.text\(\)\)\.then\(t=>console\.log\(t\)\)$/,
];

let tmp, app, heim, stubDir, bin;

function datei(rel, inhalt) {
  const f = path.join(tmp, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, inhalt);
}

/* Verzeichnisabbild: Pfad, Größe, Änderungszeit, Inhaltsprüfsumme. */
function abbild(wurzel) {
  const z = [];
  const lauf = (d) => {
    for (const n of readdirSync(d).sort()) {
      const f = path.join(d, n);
      const s = statSync(f);
      const rel = path.relative(wurzel, f);
      if (s.isDirectory()) {
        z.push(`${rel}/ ${s.mtimeMs}`);
        lauf(f);
      } else {
        z.push(`${rel} ${s.size} ${s.mtimeMs} ${createHash("sha256").update(readFileSync(f)).digest("hex")}`);
      }
    }
  };
  lauf(wurzel);
  return z;
}

function lauf(args = [], env = {}) {
  const umgebung = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    STUB_DIR: p(stubDir),
    CENTRIC_VERZ: p(app),
    CENTRIC_KONTO_HOME: p(heim),
    CENTRIC_HOME_WURZEL: p(path.join(tmp, "keine-weiteren-konten")),
    CENTRIC_ZEITGRENZE: "20",
    HOME: p(heim),
    ...env,
  };
  if (!("SSH_ORIGINAL_COMMAND" in env)) delete umgebung.SSH_ORIGINAL_COMMAND;
  const r = spawnSync(BASH, [p(SKRIPT), ...args], { encoding: "utf8", env: umgebung, timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr, alles: r.stdout + r.stderr };
}

const aufrufe = () => {
  const f = path.join(stubDir, "aufrufe.log");
  return existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean) : [];
};

function keineGeheimnisse(text) {
  for (const g of [GEHEIM, PFEFFER, TOKEN, MAIL, IP, KOERPER_DEPLOY, KOERPER_INVENTUR, "zugang:"]) expect(text).not.toContain(g);
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-inventur-"));
  app = path.join(tmp, "app");
  heim = path.join(tmp, "heim");
  stubDir = path.join(tmp, "stub");
  bin = path.join(tmp, "bin");
  for (const d of [app, heim, stubDir, bin, path.join(app, "data"), path.join(app, "zustand")]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(bin, "docker"), STUB);
  chmodSync(path.join(bin, "docker"), 0o755);

  datei("app/compose.yml", "# Probe\n");
  datei("app/FREIGEGEBENE-IMAGES.md", "# Probe\n");
  datei("app/deploy.sh", "#!/usr/bin/env bash\n# Probe\n");
  datei("app/deploy-smoke.mjs", "// Probe\n");
  datei(
    "app/.env",
    [
      `IMAGE_DIGEST=sha256:${DIGEST_HEX}`,
      `CENTRIC_SMTP_PASSWORT=${GEHEIM}`,
      `CENTRIC_PFEFFER=${PFEFFER}`,
      `CENTRIC_GITHUB_TOKEN=${TOKEN}`,
      `CENTRIC_KONTAKT=${MAIL}`,
      "# AUSKOMMENTIERT_GEHEIM=nie",
      "",
    ].join("\n"),
  );
  datei("app/data/ablage.json", '{"probe":true}\n');
  datei("app/zustand/widerrufbuch.json", "{}\n");
  datei(
    "app/betrieb-protokoll.log",
    [
      `2026-11-20T10:00:00Z deploy.sh start digest=sha256:${DIGEST_HEX} nutzer=${MAIL} ip=${IP}`,
      `2026-11-20T10:05:00Z abschalten.sh R0 erreicht: ${TOKEN}`,
      `kaputte zeile ${MAIL} ${GEHEIM}`,
      "",
    ].join("\n"),
  );
  datei(
    "heim/.ssh/authorized_keys",
    [
      `command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 ${KOERPER_DEPLOY} deploy@ci-probe`,
      `command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty ssh-ed25519 ${KOERPER_INVENTUR} inventur-centric`,
      "",
    ].join("\n"),
  );
  datei(
    "heim/sicherung/letzte-erfolgreiche.json",
    `{"zeit":"2026-11-19T02:00:00Z","schnappschuss":"4f2a9c1b","ziel":"s3:https://zugang:${GEHEIM}@objekt.example/eimer"}\n`,
  );
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur.sh: Aufruf und Forced Command", () => {
  it("Syntax (bash -n) ist gültig", () => {
    expect(spawnSync(BASH, ["-n", p(SKRIPT)], { encoding: "utf8" }).status).toBe(0);
  });

  it("--hilfe: Rückgabe 0, kein Docker-Aufruf; unbekanntes Argument: Rückgabe 2", () => {
    const h = lauf(["--hilfe"]);
    expect(h.code).toBe(0);
    expect(h.out).toContain("Lesende Produktionsinventur");
    expect(lauf(["--unsinn"]).code).toBe(2);
    expect(lauf(["--hilfe", "x"]).code).toBe(2);
    expect(aufrufe()).toEqual([]);
  });

  it("Forced Command: ein anderer Befehl wird abgewiesen, ohne Docker-Aufruf und ohne Inventur", () => {
    for (const befehl of ["rm -rf /", "bash", "inventur; cat .env", "docker ps", "inventur --x"]) {
      const r = lauf([], { SSH_ORIGINAL_COMMAND: befehl });
      expect(r.code).toBe(2);
      expect(r.err).toContain("abgewiesen");
      expect(r.out).not.toContain("=== V-1");
    }
    expect(aufrufe()).toEqual([]);
  });

  it("Forced Command: das Schlüsselwort 'inventur' führt die Inventur aus", () => {
    const r = lauf([], { SSH_ORIGINAL_COMMAND: "inventur" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("=== V-9");
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur.sh: Inhalt der Inventur", () => {
  it("alle Abschnitte gekennzeichnet, Rückgabe 0", () => {
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    for (const m of ["=== Kopf", "=== V-1", "=== V-2", "=== V-3", "=== V-4", "=== V-5", "=== V-6", "=== V-7", "=== V-8", "=== V-9", "=== R-1", "=== R-2", "=== Ende"]) {
      expect(r.out).toContain(m);
    }
    expect(r.out).toContain("Alle Abschnitte gelaufen.");
    expect(r.out).not.toContain("Abschnitt gescheitert");
  });

  it("V-6 nennt die Schlüsselnamen der .env, nie einen Wert", () => {
    const r = lauf();
    const v6 = r.out.split("=== V-6")[1].split("=== V-7")[0].split("\n").slice(1).join("\n");
    for (const n of ["CENTRIC_SMTP_PASSWORT", "CENTRIC_PFEFFER", "CENTRIC_GITHUB_TOKEN", "CENTRIC_KONTAKT", "IMAGE_DIGEST"]) expect(v6).toContain(n);
    expect(v6).not.toContain("AUSKOMMENTIERT_GEHEIM");
    expect(v6).not.toContain("="); // kollision-ok: V-6 gibt nur Namen aus; jedes „=“ wäre ein Wertansatz, keine Zufalls-ID
  });

  it("die gesamte Ausgabe enthält kein Geheimnis, keine E-Mail, keine Adresse, keinen Schlüsselkörper", () => {
    const r = lauf();
    keineGeheimnisse(r.alles);
    /* compose config liefert die Umgebung im Klartext; nur die image:-Zeile kommt durch */
    expect(r.out).toContain(`image: ghcr.io/rinats-png/dienstplaner@sha256:${DIGEST_HEX}`);
  });

  it("zeigt die prüfbaren Werte: Digest, Bild-ID, Label, Prüfsummen, Rechte, Optionen, Fingerabdrücke", () => {
    const r = lauf();
    expect(r.out).toContain(`IMAGE_DIGEST=sha256:${DIGEST_HEX}`);
    expect(r.out).toContain(`${BILD_ID} ["ghcr.io/rinats-png/dienstplaner@sha256:${DIGEST_HEX}"] ${COMMIT}`);
    const summe = createHash("sha256").update(readFileSync(path.join(app, "compose.yml"))).digest("hex");
    expect(r.out).toMatch(new RegExp(`${summe} [ *]?compose\\.yml`));
    expect(r.out).toMatch(/zustand \S+ \S+ \d+/);
    expect(r.out).toContain('Optionen: command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty | Typ: ssh-ed25519');
    expect(r.out).toContain('Optionen: command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict | Typ: ssh-ed25519');
    expect(r.out).toContain("deploy.sh --ssh: 1");
    expect(r.out).toContain("inventur.sh: 1");
    /* Fingerabdrücke bleiben lesbar (Abgleich in der Anleitung), falls ssh-keygen vorhanden ist */
    if (spawnSync(BASH, ["-c", "command -v ssh-keygen"], { encoding: "utf8" }).status === 0) {
      expect(r.out).toMatch(/256 SHA256:[A-Za-z0-9+/]{43} inventur-centric \(ED25519\)/);
    }
    expect(r.out).toContain("bind /opt/apps/centric-dienstplanung/data -> /app/data rw=true");
    expect(r.out).toContain("Pfad: /opt/apps/centric-dienstplanung");
    expect(r.out).toContain('"status":"ok"');
  });

  it("Betriebsprotokoll: nur Zeit, Skript und Ereignisname", () => {
    const r = lauf();
    const teil = r.out.split("betrieb-protokoll.log (letzte 30")[1].split("=== R-1")[0];
    expect(teil).toContain("2026-11-20T10:00:00Z deploy.sh start\n");
    expect(teil).toContain("2026-11-20T10:05:00Z abschalten.sh R0\n");
    expect(teil).toContain("? zeile ?\n");
    expect(teil).not.toContain("digest=");
    expect(teil).not.toContain("erreicht");
  });

  it("Sicherungsmarke: Zugangsdaten in der Ziel-URL werden maskiert (zweite Schicht)", () => {
    const r = lauf();
    expect(r.out).toContain('"ziel":"s3:https://<zugang>@objekt.example/eimer"');
    expect(r.out).toContain('"schnappschuss":"4f2a9c1b"');
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur.sh: nur lesen", () => {
  it("ruft nur erlaubte Docker-Unterbefehle auf", () => {
    lauf();
    const a = aufrufe();
    expect(a.length).toBeGreaterThan(5);
    const fremd = a.filter((z) => !ERLAUBT.some((re) => re.test(z)));
    expect(fremd).toEqual([]);
    expect(a.filter((z) => z.startsWith("exec "))).toHaveLength(1);
  });

  it("schreibt nichts: Betriebs- und Heimatverzeichnis sind vorher und nachher gleich", () => {
    const vorherApp = abbild(app);
    const vorherHeim = abbild(heim);
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    expect(abbild(app)).toEqual(vorherApp);
    expect(abbild(heim)).toEqual(vorherHeim);
  });

  it("fail-soft: Docker nicht erreichbar → Docker-Abschnitte scheitern einzeln, der Rest läuft, Rückgabe 1", () => {
    writeFileSync(path.join(stubDir, "docker_tot"), "");
    const r = lauf();
    expect(r.code).toBe(1);
    for (const m of ["V-1", "V-2", "R-2"]) expect(r.out).toMatch(new RegExp(`--- ${m} .*: Abschnitt gescheitert`));
    const v6 = r.out.split("=== V-6")[1].split("=== V-7")[0];
    expect(v6).toContain("CENTRIC_SMTP_PASSWORT");
    expect(r.out).toContain("=== V-8");
    expect(r.out).toContain("=== Ende ===");
    expect(r.out).toMatch(/Gescheiterte Abschnitte: \d+/);
    keineGeheimnisse(r.alles);
  });

  it("fail-soft: fehlende .env → nur V-3/V-6 betroffen, keine Ausgabe von Werten", () => {
    rmSync(path.join(app, ".env"));
    const r = lauf();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/--- V-6 .*: Abschnitt gescheitert/);
    expect(r.out).not.toMatch(/--- V-5 .*: Abschnitt gescheitert/);
    expect(r.out).toContain("=== Ende ===");
  });
});

/* ------------------------------------------------------------------ */
/* Quelltext ohne Kommentare und ohne Zeichenketten (für Befehlswörter und Umlenkungen).
   Bash-Quoting: '…' bis zum nächsten ', "…" bis zum nächsten nicht maskierten ".
   Zeilenumbrüche bleiben erhalten, damit Zeile n von CODE zu Zeile n des Quelltexts passt. */
function ohneKommentareUndZeichenketten(text) {
  let aus = "";
  const umbrueche = (von, bis) => "\n".repeat((text.slice(von, bis).match(/\n/g) || []).length);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      while (i < text.length && text[i] !== "\n") i++;
      aus += "\n";
    } else if (c === "'") {
      const ende = text.indexOf("'", i + 1);
      aus += "''" + umbrueche(i, ende);
      i = ende;
    } else if (c === '"') {
      const start = i;
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      aus += '""' + umbrueche(start, i);
    } else {
      aus += c;
    }
  }
  return aus;
}
const QUELL_ZEILEN = QUELLTEXT.split("\n");
const CODE = ohneKommentareUndZeichenketten(QUELLTEXT);
const CODE_ZEILEN_ROH = CODE.split("\n");
const CODE_ZEILEN = QUELL_ZEILEN.filter((z) => !/^\s*#/.test(z));

describe("deploy/inventur.sh: Quelltext-Wächter", () => {
  it("liest die .env nie als Ganzes: kein cat/source/less/head/tail auf .env", () => {
    expect(QUELLTEXT).not.toMatch(/\b(cat|source|less|more|head|tail|sed|awk|cut|strings|xxd|od)\b[^\n|;]*\.env\b/);
    expect(CODE).not.toMatch(/(^|\s)\.\s+\S*\.env/);
    /* jede Befehlszeile mit .env (außerhalb von Zeichenketten) ist ein grep auf Namen bzw. IMAGE_* oder eine Existenzprüfung */
    expect(CODE_ZEILEN_ROH).toHaveLength(QUELL_ZEILEN.length);
    const zeilen = QUELL_ZEILEN.filter((_, i) => /(^|[\s/])\.env\b/.test(CODE_ZEILEN_ROH[i]));
    expect(zeilen.length).toBeGreaterThanOrEqual(3);
    for (const z of zeilen) {
      expect(z).toMatch(/grep -oE '\^\[A-Za-z_\]\[A-Za-z0-9_\]\*=' \.env|grep -E '\^\(IMAGE_DIGEST\|IMAGE_TAG\)=' \.env|\[\[ -f \.env \]\]/);
    }
  });

  it("keine schreibenden Befehle und keine Umlenkung in Dateien", () => {
    expect(CODE).not.toMatch(/\b(rm|mv|cp|tee|chmod|chown|chgrp|install|mkdir|rmdir|touch|truncate|dd|ln|mktemp|eval|source|sudo|su)\b\s/);
    expect(CODE).not.toMatch(/<</);
    const rest = CODE.replace(/2>&1|>&2|2>\/dev\/null|>\/dev\/null/g, "");
    expect(rest).not.toMatch(/>/);
  });

  it("Docker nur über docker_lesen mit erlaubten Unterbefehlen; genau ein fester docker exec", () => {
    const direkt = CODE.split("\n").filter((z) => /\bdocker\s/.test(z));
    expect(direkt).toHaveLength(1);
    expect(direkt[0]).toMatch(/^\s*if hat timeout; then timeout "" docker ""; else docker ""; fi\s*$/);
    const unter = [...CODE.matchAll(/\bdocker_lesen\s+([a-z]+)(?:\s+([a-z]+))?/g)].map((m) => (["compose", "image"].includes(m[1]) ? `${m[1]} ${m[2]}` : m[1]));
    const erlaubt = ["compose ps", "compose config", "compose version", "inspect", "image inspect", "images", "version", "stats", "exec"];
    expect(unter.filter((u) => !erlaubt.includes(u))).toEqual([]);
    expect(CODE).not.toMatch(/\b(pull|up|run|rmi|tag|restart|stop|kill|start|create|commit|push|load|save|build|down|prune|rename|pause|unpause|login)\b\s/);
    const exec = CODE_ZEILEN.filter((z) => /docker_lesen exec/.test(z));
    expect(exec).toHaveLength(1);
    expect(exec[0]).toContain(`docker_lesen exec "$DIENST" node -e "fetch('http://127.0.0.1:3000/gesund').then(r=>r.text()).then(t=>console.log(t))"`);
  });

  it("SSH_ORIGINAL_COMMAND wird nur verglichen, nie ausgeführt", () => {
    const z = CODE_ZEILEN.filter((x) => x.includes("SSH_ORIGINAL_COMMAND"));
    expect(z).toHaveLength(1);
    expect(z[0]).toMatch(/^if \[\[ -n "\$\{SSH_ORIGINAL_COMMAND:-\}" && "\$\{SSH_ORIGINAL_COMMAND\}" != "inventur" \]\]; then$/);
  });

  it("die Anleitung nennt die aktuelle Prüfsumme des Skripts (und keine andere)", () => {
    const doku = readFileSync(path.join(WURZEL, "docs", "acc45", "VPS-ZUGANG-EINRICHTUNG.md"), "utf8");
    const ist = createHash("sha256").update(QUELLTEXT.replace(/\r\n/g, "\n")).digest("hex");
    const soll = doku.match(/SHA-256 von deploy\/inventur\.sh: `([0-9a-f]{64})`/);
    expect(soll, "Zeile „SHA-256 von deploy/inventur.sh“ fehlt").not.toBeNull();
    expect(soll[1]).toBe(ist);
    expect([...new Set(doku.match(/\b[0-9a-f]{64}\b/g))]).toEqual([ist]);
  });

  it("Grundeinstellungen wie die übrigen Deploy-Skripte: set -euo pipefail, umask 077", () => {
    expect(QUELLTEXT).toMatch(/^set -euo pipefail$/m);
    expect(QUELLTEXT).toMatch(/^umask 077$/m);
    expect(QUELLTEXT.startsWith("#!/usr/bin/env bash\n")).toBe(true);
  });
});
