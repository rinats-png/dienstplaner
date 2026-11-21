/* ==========================================================================
   INVENTUR-KONSOLE (REL-0, Methode „Konsole“) — deploy/inventur-konsole.sh

   Der Betreiber hat nur die IONOS-Remotekonsole (root, kein Kopieren/Einfügen).
   Das Skript wird ohne Datei geladen (s=$(curl …); bash -c "$s"), prüft sich
   selbst (root, Ubuntu 24.04, Besitz Betriebsverzeichnis = data), nutzt die
   Funktionen der eingebetteten, per SHA-256 geprüften deploy/inventur.sh und
   verdichtet V-1 bis V-9 (dazu R-1, R-2) zu einem Kurzprotokoll für einen
   Bildschirm mit PRUEFCODE.

   Simulierte Umgebung: Stubs im festen PATH (INVENTUR_PRUEFPFAD) für docker,
   id, date, df, free, uptime, nproc, stat (Durchreichen mit Ausnahmen),
   crontab, restic. Pfade über CENTRIC_* und INVENTUR_OS_RELEASE. Kein Netz.

   Geprüft wird:
     - Erfolgsfall: Kurzprotokoll ≤ 25 Zeilen, ≤ 70 Zeichen, eine Zeile je
       V-n mit Status, PRUEFCODE = SHA-256 der Zeilen, stabil
     - Abweichungen je V-n (ABW / FEHLT / NICHT-PRUEFBAR)
     - Abbruch bei nicht-root, falschem Besitz, fremdem OS (vor jedem Docker-Aufruf)
     - keine Datei geschrieben (Abbild vorher = nachher, TMPDIR leer)
     - keine Geheimnisse, Mailadressen, Schlüsselkörper (Kurz und --voll,
       mit und ohne Maske)
     - nur erlaubte Docker-Aufrufe, kein docker exec
     - Ladeweg: bash -c "$s" mit abgeschnittenem Zeilenende; Hash-Semantik
       printf %s gegenüber der Datei
     - eingebettete inventur.sh: Prüfsumme wird zur Laufzeit geprüft
     - Werkzeug: --pruefen, Sperrliste/Allowlist mit Mutationen
     - Quelltext-Wächter, Dateimodus 100755, Doku-Sollwerte

   Unter Linux (CI) läuft alles. Unter Windows nur mit Git Bash.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bashFinden, p, posixPfad } from "./inventur-hilfen.mjs";
import * as bau from "../werkzeug/inventur-konsole-bauen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(WURZEL, "deploy", "inventur-konsole.sh");
const INVENTUR = path.join(WURZEL, "deploy", "inventur.sh");
const lf = (t) => t.replace(/\r\n/g, "\n");
const QUELLTEXT = lf(readFileSync(SKRIPT, "utf8"));
const BASH = bashFinden();
/* Unter Git Bash (Windows) dauert ein Lauf 30–60 s (viele Prozesse); unter Linux wenige Sekunden. */
vi.setConfig({ testTimeout: 900000 });

const sha = (t) => createHash("sha256").update(t).digest("hex");

/* Erfundene Werte. Keiner darf in der Ausgabe stehen. */
const DIGEST_A = "0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f";
const DIGEST_B = "f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79";
const DIGEST_C = "c".repeat(64);
const BILD_ID = "sha256:" + "1b".repeat(32);
const GEHEIM = "GEHEIM-TESTWERT-123";
const PFEFFER = "pfeffer-wert-nur-probe-456";
const ENV_TOKEN = "ghp_EnvToken0123456789abcdefABCDEF";
const ENV_MAIL = "env.kontakt@beispiel.de";
const TOKEN = "ghp_ProbeToken0123456789abcdefABCDEF";
const MAIL = "pflege.person@beispiel.de";
const IP = "203.0.113.77";
const SICHERUNG_GEHEIM = "SICHERUNGS-GEHEIMNIS-789";
const SMTP_PW = "Pw0rdXsmtp42";
const MITARBEITER = "Erika Mustermann";

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
const KOERPER_ADMIN = oeffentlicherSchluessel(0x44);

/* Docker-Stub: protokolliert jeden Aufruf. Steuerdateien in $STUB_DIR schalten Abweichungen. */
const DOCKER_STUB = [
  "#!/usr/bin/env bash",
  'z="$STUB_DIR"',
  "printf '%s\\n' \"$*\" >>\"$z/aufrufe.log\"",
  'if [[ -f "$z/docker_tot" ]]; then echo "Cannot connect to the Docker daemon" >&2; exit 1; fi',
  'hex=$(cat "$z/digest")',
  'label=""; [[ -f "$z/label" ]] && label=$(cat "$z/label")',
  'health=healthy; [[ -f "$z/health" ]] && health=$(cat "$z/health")',
  'refhex="$hex"; [[ -f "$z/ref_digest" ]] && refhex=$(cat "$z/ref_digest")',
  'letztes="${*: -1}"',
  'case "$1" in',
  "  compose)",
  "    if [[ -f \"$z/compose_fehler\" ]]; then echo 'failed to read .env: line 2: CENTRIC_SMTP_PASSWORT=@GEHEIM@' >&2; echo 'smtp://user:@SMTPPW@@mail.example.org' >&2; exit 1; fi",
  '    case "$2" in',
  "      ps) echo 'NAME IMAGE SERVICE STATUS PORTS'; echo \"centric-dp-web ghcr.io/rinats-png/dienstplaner@sha256:$hex web Up 2 days (healthy) 127.0.0.1:3000->3000/tcp\" ;;",
  "      config) printf '%s\\n' 'services:' '  web:' '    environment:' '      CENTRIC_SMTP_PASSWORT: @GEHEIM@' '      CENTRIC_PFEFFER: @PFEFFER@' \"    image: ghcr.io/rinats-png/dienstplaner@sha256:$refhex\" ;;",
  "      version) echo 'Docker Compose version v2.29.7' ;;",
  '      *) echo "stub: compose $2 nicht erlaubt" >&2; exit 9 ;;',
  "    esac ;;",
  "  inspect)",
  '    if [[ -f "$z/kein_container" ]]; then echo "Error: No such object: centric-dp-web" >&2; exit 1; fi',
  '    case "$letztes" in',
  "      *Config.Env*|*'json .}'*|*'json .Config}'*) echo '[\"CENTRIC_SMTP_PASSWORT=@GEHEIM@\"]' ;;",
  '      *Mounts*) echo "bind $STUB_VERZ/data -> /app/data schreibbar:true" ;;',
  '      *working_dir*) echo "Compose-Projekt: centric Pfad: $STUB_VERZ Dateien: $STUB_VERZ/compose.yml" ;;',
  '      *State.Status*) echo "@ID@ ghcr.io/rinats-png/dienstplaner@sha256:$hex running $health 2026-11-02T15:59:03.5Z 0" ;;',
  "      '{{.Image}}') echo '@ID@' ;;",
  "      *) echo 'CENTRIC_SMTP_PASSWORT=@GEHEIM@ lower_var=@GEHEIM@' ;;",
  "    esac ;;",
  '  image) echo "@ID@ [\\"ghcr.io/rinats-png/dienstplaner@sha256:$hex\\"] $label" ;;',
  "  images) echo 'REPOSITORY TAG DIGEST IMAGE-ID'; echo \"ghcr.io/rinats-png/dienstplaner <none> sha256:$hex @ID@\" ;;",
  "  version) echo '27.3.1' ;;",
  "  stats) echo 'centric-dp-web 0.50% 120MiB / 1GiB 11.70%' ;;",
  /* Würde exec gerufen, stünden Geheimnisse in der Ausgabe (und die Allowlist schlüge an). */
  "  exec) echo '{\"status\":\"ok\",\"nutzer\":\"@MAIL@\",\"adresse\":\"@IP@\",\"geheim\":\"@GEHEIM@\"}' ;;",
  '  *) echo "stub: docker $1 nicht erlaubt" >&2; exit 9 ;;',
  "esac",
  "",
]
  .join("\n")
  .replaceAll("@ID@", BILD_ID)
  .replaceAll("@GEHEIM@", GEHEIM)
  .replaceAll("@PFEFFER@", PFEFFER)
  .replaceAll("@MAIL@", MAIL)
  .replaceAll("@IP@", IP)
  .replaceAll("@SMTPPW@", SMTP_PW);

/* Weitere Stubs: feste, vom Rechner unabhängige Werte (stabiler PRUEFCODE). */
const STUBS = {
  id: ['#!/usr/bin/env bash', 'if [[ "${1:-}" == "-u" && $# -eq 1 ]]; then printf "%s\\n" "${STUB_UID:-0}"; exit 0; fi', 'exec /usr/bin/id "$@"', ""],
  date: ["#!/usr/bin/env bash", "printf '%s\\n' '2026-11-21T10:00Z'", ""],
  nproc: ["#!/usr/bin/env bash", "echo 2", ""],
  uptime: ["#!/usr/bin/env bash", "echo ' 10:00:00 up 5 days,  1 user,  load average: 0.10, 0.20, 0.30'", ""],
  free: [
    "#!/usr/bin/env bash",
    "echo '               total        used        free      shared  buff/cache   available'",
    "echo 'Mem:            3800        2000         500          10        1300        1600'",
    "echo 'Swap:              0           0           0'",
    "",
  ],
  df: [
    "#!/usr/bin/env bash",
    'b=70; [[ -f "$STUB_DIR/belegt" ]] && b=$(cat "$STUB_DIR/belegt")',
    "echo 'Filesystem      Size  Used Avail Use% Mounted on'",
    'echo "/dev/sda1        40G   28G   12G  ${b}% /"',
    "",
  ],
  /* stat: Besitz und Modus lassen sich unter Windows nicht setzen; Steuerdateien ersetzen sie gezielt. */
  stat: [
    "#!/usr/bin/env bash",
    'z="$STUB_DIR"; letzt="${*: -1}"',
    'if [[ "$1 $2" == "-c %U %u" ]]; then',
    '  if [[ -f "$z/besitz_root" ]]; then echo "root 0"; exit 0; fi',
    '  if [[ -f "$z/besitz_fremd" && "$letzt" == */data ]]; then echo "fremd 4321"; exit 0; fi',
    "fi",
    'if [[ "$1 $2" == "-c %n %U:%G %u:%g %a" && "$letzt" == zustand && -f "$z/zustand_modus" ]]; then',
    "  printf '%s %s\\n' \"$(/usr/bin/stat -c '%n %U:%G %u:%g' zustand)\" \"$(cat \"$z/zustand_modus\")\"; exit 0",
    "fi",
    'exec /usr/bin/stat "$@"',
    "",
  ],
  crontab: [
    "#!/usr/bin/env bash",
    'if [[ "$*" == *"-u"* ]]; then f="$STUB_DIR/crontab_konto"; else f="$STUB_DIR/crontab_root"; fi',
    'if [[ -f "$f" ]]; then cat "$f"; else echo "no crontab" >&2; exit 1; fi',
    "",
  ],
  restic: ["#!/usr/bin/env bash", "echo 'restic 0.16.4 compiled with go1.22.2 on linux/amd64'", ""],
};

/* Erlaubte Docker-Aufrufe: die lesenden aus inventur.sh — ohne docker exec. */
const ERLAUBT = new Set([
  "compose ps",
  "compose config",
  "compose version",
  "inspect centric-dp-web --format {{.Image}} {{.Config.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}ohne-health{{end}} {{.State.StartedAt}} {{.RestartCount}}",
  "inspect centric-dp-web --format {{.Image}}",
  `image inspect --format {{.Id}} {{json .RepoDigests}} {{index .Config.Labels "org.opencontainers.image.revision"}} ${BILD_ID}`,
  "images --digests --no-trunc ghcr.io/rinats-png/dienstplaner",
  "version --format {{.Server.Version}}",
  "stats --no-stream --format {{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.MemPerc}}",
  "inspect centric-dp-web --format {{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} schreibbar:{{.RW}}{{println}}{{end}}",
  'inspect centric-dp-web --format Compose-Projekt: {{index .Config.Labels "com.docker.compose.project"}} Pfad: {{index .Config.Labels "com.docker.compose.project.working_dir"}} Dateien: {{index .Config.Labels "com.docker.compose.project.config_files"}}',
]);

const PFLICHT = bau.vorlagenNamen(readFileSync(path.join(WURZEL, ".env.example"), "utf8")).pflicht;

let tmp, app, heim, stubDir, bin, tmpDir;

function datei(rel, inhalt) {
  const f = path.join(tmp, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, inhalt);
}
const stub = (name, inhalt = "") => writeFileSync(path.join(stubDir, name), inhalt);

function abbild(wurzel, ohne = []) {
  const z = [];
  const lauf = (d) => {
    for (const n of readdirSync(d).sort()) {
      const f = path.join(d, n);
      if (ohne.includes(f)) continue;
      const s = statSync(f);
      const rel = path.relative(wurzel, f);
      if (s.isDirectory()) {
        z.push(`${rel}/ ${s.mtimeMs}`);
        lauf(f);
      } else {
        z.push(`${rel} ${s.size} ${s.mtimeMs} ${sha(readFileSync(f))}`);
      }
    }
  };
  lauf(wurzel);
  return z;
}

function umgebung(env) {
  const u = {
    ...process.env,
    INVENTUR_PRUEFPFAD: `${posixPfad(bin)}:/usr/sbin:/usr/bin:/sbin:/bin`,
    STUB_DIR: p(stubDir),
    STUB_VERZ: p(app),
    CENTRIC_VERZ: p(app),
    CENTRIC_KONTO_HOME: p(heim),
    CENTRIC_HOME_WURZEL: p(path.join(tmp, "keine-weiteren-konten")),
    CENTRIC_ZEITGRENZE: "20",
    INVENTUR_OS_RELEASE: p(path.join(tmp, "os-release")),
    /* root läuft mit eigenem HOME (/root, hier ohne authorized_keys); das Konto ist CENTRIC_KONTO_HOME */
    HOME: p(path.join(tmp, "root-heim")),
    TMPDIR: p(tmpDir),
    ...env,
  };
  for (const n of ["SSH_ORIGINAL_COMMAND", "SSH_AUTH_SOCK", "SSH_CONNECTION", "INVENTUR_MASKE", "BASH_ENV", "ENV"]) if (!(n in env)) delete u[n];
  for (const [k, v] of Object.entries(u)) if (v === undefined) delete u[k];
  return u;
}

function lauf(args = [], env = {}) {
  const r = spawnSync(BASH, [p(SKRIPT), ...args], { encoding: "utf8", env: umgebung(env), timeout: 400000 });
  return { code: r.status, out: r.stdout, err: r.stderr, alles: r.stdout + r.stderr };
}

/* Wie der Betreiber: s=$(curl …) schneidet abschließende Zeilenumbrüche ab; dann bash -c "$s" x [--voll].
   Statt curl liest hier $(cat …) die Datei (gleiche Semantik). Der Umweg über eine äußere bash hält die
   Befehlszeile kurz (Windows begrenzt sie auf 32 767 Zeichen; das Skript ist größer). */
function laufWieKonsole(args = [], env = {}) {
  const r = spawnSync(BASH, ["-c", 's=$(cat "$1"); shift; bash -c "$s" inventur "$@"', "x", p(SKRIPT), ...args], {
    encoding: "utf8",
    env: { ...umgebung(env), PATH: process.env.PATH },
    timeout: 400000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr, alles: r.stdout + r.stderr };
}

const aufrufe = () => {
  const f = path.join(stubDir, "aufrufe.log");
  return existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean) : [];
};

/* Kurzprotokoll: alle Zeilen nach dem Hinweis bis einschließlich PRUEFCODE. */
function kurz(out) {
  const zeilen = out.replace(/\n$/, "").split("\n");
  const i = zeilen.lastIndexOf("Dieses Skript ändert nichts.");
  const ende = zeilen.findIndex((z) => z.startsWith("PRUEFCODE "));
  const block = zeilen.slice(i + 1, ende + 1);
  return { zeilen, block, ende };
}
const statusZeile = (out, nr) => out.split("\n").find((z) => z.startsWith(`${nr} `)) || "";
const status = (out, nr) => statusZeile(out, nr).split(" ")[1];

function keineGeheimnisse(text, ausser = []) {
  for (const g of [GEHEIM, PFEFFER, ENV_TOKEN, ENV_MAIL, TOKEN, MAIL, IP, SICHERUNG_GEHEIM, SMTP_PW, KOERPER_DEPLOY, KOERPER_ADMIN, MITARBEITER, "zugang:", "WERT-"]) {
    if (!ausser.includes(g)) expect(text).not.toContain(g);
  }
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-konsole-"));
  app = path.join(tmp, "app");
  heim = path.join(tmp, "heim");
  stubDir = path.join(tmp, "stub");
  bin = path.join(tmp, "bin");
  tmpDir = path.join(tmp, "tmpdir");
  for (const d of [app, heim, stubDir, bin, tmpDir, path.join(app, "data"), path.join(app, "zustand")]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(bin, "docker"), DOCKER_STUB);
  chmodSync(path.join(bin, "docker"), 0o755);
  for (const [n, z] of Object.entries(STUBS)) {
    writeFileSync(path.join(bin, n), z.join("\n"));
    chmodSync(path.join(bin, n), 0o755);
  }
  stub("digest", DIGEST_A);
  stub("zustand_modus", "700");
  stub("crontab_root", "# Kommentar\n15 2 * * * /home/admin/sicherung/sicherung-ausser-haus.sh --geheim " + SICHERUNG_GEHEIM + "\n");
  datei("os-release", 'PRETTY_NAME="Ubuntu 24.04.5 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\nID_LIKE=debian\n');

  for (const f of bau.BETRIEBSDATEIEN) datei(`app/${f}`, `# Probe ${f}\n`);
  datei(
    "app/.env",
    [
      ...PFLICHT.map((n) => `${n}=WERT-${n}`),
      `CENTRIC_SMTP_PASSWORT=${GEHEIM}`,
      `CENTRIC_PFEFFER=${PFEFFER}`,
      `CENTRIC_GITHUB_TOKEN=${ENV_TOKEN}`,
      `CENTRIC_KONTAKT=${ENV_MAIL}`,
      "",
    ].join("\n"),
  );
  datei("app/data/ablage.json", `{"name":"${MITARBEITER}","mail":"${MAIL}"}\n`);
  datei("app/zustand/widerrufbuch.json", "{}\n");
  datei("app/zustand/schluesselepoche.json", "{}\n");
  datei(
    "app/betrieb-protokoll.log",
    [`2026-11-20T10:00:00Z deploy.sh start digest=sha256:${DIGEST_A} nutzer=${MAIL} ip=${IP}`, `2026-11-20T10:05:00Z abschalten.sh R0 erreicht: ${TOKEN}`, ""].join("\n"),
  );
  datei(
    "heim/.ssh/authorized_keys",
    [`command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 ${KOERPER_DEPLOY} deploy@ci-probe`, `ssh-ed25519 ${KOERPER_ADMIN} ${MAIL}`, ""].join("\n"),
  );
  datei(
    "heim/sicherung/letzte-erfolgreiche.json",
    `{"zeit":"2026-11-19T02:00:00Z","dateien":12,"bytes":3456,"snapshot_id":"4f2a9c1b","ziel":"s3:https://zugang:${SICHERUNG_GEHEIM}@objekt.example/eimer"}\n`,
  );
  mkdirSync(path.join(heim, "sicherung", "lokal"), { recursive: true });
  mkdirSync(path.join(app, "deploy-sicherungen"), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur-konsole.sh: Erfolgsfall und Kurzprotokoll", () => {
  it("Syntax (bash -n) ist gültig", () => {
    expect(spawnSync(BASH, ["-n", p(SKRIPT)], { encoding: "utf8" }).status).toBe(0);
  });

  it("alles in Ordnung: Hinweis zuerst, ≤ 25 Zeilen à ≤ 70 Zeichen, je V-n eine Statuszeile OK, PRUEFCODE stimmt", () => {
    const r = lauf();
    expect(r.code, r.alles).toBe(0);
    expect(r.err).toBe("");
    const { zeilen, block, ende } = kurz(r.out);
    expect(zeilen[0]).toBe("Dieses Skript ändert nichts.");
    expect(ende).toBe(zeilen.length - 1);
    expect(zeilen.length).toBeLessThanOrEqual(25);
    for (const z of zeilen) expect(z.length, z).toBeLessThanOrEqual(70);
    for (const z of zeilen) expect(z, z).toBe(z.trimEnd());
    for (let n = 1; n <= 9; n++) {
      const treffer = zeilen.filter((z) => z.startsWith(`V-${n} `));
      expect(treffer, `V-${n}`).toHaveLength(1);
      expect(status(r.out, `V-${n}`), treffer[0]).toBe("OK");
    }
    expect(status(r.out, "R-1")).toBe("OK");
    expect(status(r.out, "R-2")).toBe("OK");
    const geprueft = block.slice(0, -1);
    const code = sha(geprueft.join("\n") + "\n").slice(0, 12);
    expect(block.at(-1)).toBe(`PRUEFCODE ${code} ZEILEN ${geprueft.length}`);
    expect(zeilen).toContain("SUMME OK 11 ABW 0 FEHLT 0 NICHT-PRUEFBAR 0");
    expect(zeilen[1]).toMatch(/^INVENTUR-KONSOLE \S+ nur lesend Quelle inventur\.sh [0-9a-f]{12}$/);
    expect(zeilen[1]).toContain(sha(lf(readFileSync(INVENTUR, "utf8"))).slice(0, 12));
  });

  it("die Statuszeilen tragen die Schlüsselfakten (keine Rohlisten)", () => {
    const r = lauf();
    expect(statusZeile(r.out, "V-1")).toBe(`V-1 OK running healthy Neustarts 0 seit 2026-11-02 Bild ${"1b".repeat(6)}`);
    expect(statusZeile(r.out, "V-2")).toBe(`V-2 OK Zustand A Digest ${DIGEST_A.slice(0, 12)} Label fehlt`);
    expect(statusZeile(r.out, "V-3")).toBe(`V-3 OK .env DIGEST ja TAG nein Ref @${DIGEST_A.slice(0, 12)} gleich laufend`);
    const summe = sha(bau.BETRIEBSDATEIEN.map((f) => `${sha(`# Probe ${f}\n`)}  ${f}\n`).join("")).slice(0, 12);
    expect(statusZeile(r.out, "V-4")).toBe(`V-4 OK Dateien 9/9+0 Summe ${summe} compose 2.29.7 docker 27.3.1`);
    expect(statusZeile(r.out, "V-5")).toMatch(/^V-5 OK data \d+ \d+ zustand \d+ 700 Eintraege 2$/);
    /* .env: alle Pflichtnamen + CENTRIC_SMTP_PASSWORT (optional) + CENTRIC_GITHUB_TOKEN, CENTRIC_KONTAKT (extra);
       CENTRIC_PFEFFER ist Pflicht und steht doppelt. */
    const opt = bau.vorlagenNamen(readFileSync(path.join(WURZEL, ".env.example"), "utf8")).optional;
    expect(PFLICHT).toContain("CENTRIC_PFEFFER");
    expect(opt).toContain("CENTRIC_SMTP_PASSWORT");
    expect(statusZeile(r.out, "V-6")).toBe(`V-6 OK Namen ${PFLICHT.length + 3} Pflicht fehlt 0 optional 1/${opt.length} extra 2`);
    expect(statusZeile(r.out, "V-7")).toBe("V-7 OK restic 0.16.4 Cron 1/0 Verz 3/3 letzte 2026-11-19T02:00");
    expect(statusZeile(r.out, "V-8")).toBe("V-8 OK Dateien 1 Zeilen 2 ohne-Optionen 1 deploy-ssh 1 inventur 0");
    expect(statusZeile(r.out, "V-9")).toMatch(/^V-9 OK frei 12G von 40G belegt 70% data \S+ gesund healthy$/);
    expect(r.out).toContain("    letztes Ereignis 2026-11-20T10:05:00Z abschalten.sh R0\n");
    expect(statusZeile(r.out, "R-1")).toBe("R-1 OK CPU 2 Last 0.10 RAM 3800M verfuegbar 1600M App 0.50% 120MiB");
    expect(statusZeile(r.out, "R-2")).toBe("R-2 OK Mounts 1 data-rw ja Projekt centric Pfad-gleich ja");
    expect(r.out).toMatch(/\nKonto \S+ uid \d+ Verz\+data gleich Docker 27\.3\.1\n/);
  });

  it("PRUEFCODE ist stabil (zwei Läufe gleich) und ändert sich mit dem Inhalt", () => {
    const a = lauf().out;
    const b = lauf().out;
    expect(a).toBe(b);
    stub("belegt", "71");
    const c = lauf().out;
    expect(kurz(c).block.at(-1)).not.toBe(kurz(a).block.at(-1));
  });

  it("Ladeweg wie in der Konsole: bash -c \"$s\" (Zeilenende abgeschnitten) liefert dieselbe Ausgabe wie die Datei", () => {
    const datei = lauf();
    const konsole = laufWieKonsole();
    expect(konsole.code, konsole.alles).toBe(0);
    expect(konsole.out).toBe(datei.out);
  });

  it("--hilfe: Rückgabe 0, kein Docker; unbekanntes Argument: Rückgabe 2", () => {
    expect(lauf(["--hilfe"]).code).toBe(0);
    expect(lauf(["--unsinn"]).code).toBe(2);
    expect(lauf(["--voll", "x"]).code).toBe(2);
    expect(aufrufe()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur-konsole.sh: Abweichungen je V-n", () => {
  it("V-1: Container ungesund → ABW; Container fehlt → FEHLT; Docker tot → NICHT-PRUEFBAR (V-1, V-2, V-3, R-2)", () => {
    stub("health", "unhealthy");
    expect(statusZeile(lauf().out, "V-1")).toMatch(/^V-1 ABW running unhealthy /);
    rmSync(path.join(stubDir, "health"));
    stub("kein_container");
    expect(status(lauf().out, "V-1")).toBe("FEHLT");
    rmSync(path.join(stubDir, "kein_container"));
    stub("docker_tot");
    const r = lauf();
    expect(r.code).toBe(0);
    for (const nr of ["V-1", "V-2", "V-3", "R-2"]) expect(status(r.out, nr), nr).toBe("NICHT-PRUEFBAR");
    expect(status(r.out, "V-6")).toBe("OK");
    expect(r.out).toMatch(/Docker nein/);
    for (const z of r.out.trimEnd().split("\n")) expect(z.length, z).toBeLessThanOrEqual(70);
  });

  it("V-2: Zustand B (gesperrtes Bild) und C (unbekannt) → ABW; Label wird mit 12 Zeichen gezeigt", () => {
    stub("digest", DIGEST_B);
    stub("ref_digest", DIGEST_B);
    expect(statusZeile(lauf().out, "V-2")).toBe(`V-2 ABW Zustand B Digest ${DIGEST_B.slice(0, 12)} Label fehlt`);
    stub("digest", DIGEST_C);
    stub("ref_digest", DIGEST_C);
    stub("label", "2".repeat(40));
    expect(statusZeile(lauf().out, "V-2")).toBe(`V-2 ABW Zustand C Digest ${"c".repeat(12)} Label ${"2".repeat(12)}`);
  });

  it("V-3: Referenz ≠ laufendes Bild → ABW; weder IMAGE_DIGEST noch IMAGE_TAG → FEHLT; compose scheitert → NICHT-PRUEFBAR", () => {
    stub("ref_digest", DIGEST_C);
    expect(statusZeile(lauf().out, "V-3")).toBe(`V-3 ABW .env DIGEST ja TAG nein Ref @${"c".repeat(12)} ungleich laufend`);
    rmSync(path.join(stubDir, "ref_digest"));
    const env = readFileSync(path.join(app, ".env"), "utf8").split("\n").filter((z) => !z.startsWith("IMAGE_DIGEST="));
    writeFileSync(path.join(app, ".env"), env.join("\n"));
    expect(status(lauf().out, "V-3")).toBe("FEHLT");
    stub("compose_fehler");
    const r = lauf();
    expect(status(r.out, "V-3")).toBe("NICHT-PRUEFBAR");
    expect(r.alles).not.toContain(GEHEIM);
    expect(r.alles).not.toContain(SMTP_PW);
  });

  it("V-4: Betriebsdatei fehlt → ABW mit Namen; compose.yml fehlt → FEHLT", () => {
    rmSync(path.join(app, "digest-pruefen.sh"));
    const r = lauf();
    expect(statusZeile(r.out, "V-4")).toMatch(/^V-4 ABW Dateien 8\/9\+0 Summe [0-9a-f]{12} /);
    expect(r.out).toContain("\n    fehlt digest-pruefen.sh\n");
    rmSync(path.join(app, "compose.yml"));
    expect(status(lauf().out, "V-4")).toBe("FEHLT");
  });

  it("V-5: zustand fehlt → FEHLT; Modus 755 → ABW", () => {
    stub("zustand_modus", "755");
    expect(statusZeile(lauf().out, "V-5")).toMatch(/^V-5 ABW data \d+ \d+ zustand \d+ 755 /);
    rmSync(path.join(app, "zustand"), { recursive: true });
    expect(statusZeile(lauf().out, "V-5")).toMatch(/^V-5 FEHLT data \d+ \d+ zustand fehlt$/);
  });

  it("V-6: fehlende Pflichtnamen → ABW mit Nummern (Werkzeug löst auf); .env fehlt → FEHLT", () => {
    const weg = [PFLICHT[1], PFLICHT[4]];
    const env = readFileSync(path.join(app, ".env"), "utf8").split("\n").filter((z) => !weg.some((n) => z.startsWith(`${n}=`)));
    writeFileSync(path.join(app, ".env"), env.join("\n"));
    const r = lauf();
    expect(statusZeile(r.out, "V-6")).toMatch(/^V-6 ABW Namen \d+ Pflicht fehlt 2 /);
    expect(r.out).toContain("\n    fehlt Pflicht-Nr 2 5\n");
    expect(r.out.split("\n").filter((z) => z.startsWith("    ")).length).toBe(2);
    expect(bau.envNamenZuNummern([2, 5], readFileSync(path.join(WURZEL, ".env.example"), "utf8"))).toEqual(weg);
    rmSync(path.join(app, ".env"));
    expect(statusZeile(lauf().out, "V-6")).toBe("V-6 FEHLT .env fehlt");
  });

  it("V-7: ohne restic, Cron und Marke → FEHLT; teilweise → ABW", () => {
    rmSync(path.join(bin, "restic"));
    expect(statusZeile(lauf().out, "V-7")).toMatch(/^V-7 ABW restic nein Cron 1\/0 /);
    rmSync(path.join(stubDir, "crontab_root"));
    rmSync(path.join(heim, "sicherung", "letzte-erfolgreiche.json"));
    expect(statusZeile(lauf().out, "V-7")).toMatch(/^V-7 FEHLT restic nein Cron 0\/0 Verz 3\/3 letzte keine$/);
  });

  it("V-8: kein Forced Command deploy.sh --ssh → FEHLT", () => {
    datei("heim/.ssh/authorized_keys", `ssh-ed25519 ${KOERPER_ADMIN} admin\n`);
    expect(statusZeile(lauf().out, "V-8")).toBe("V-8 FEHLT Dateien 1 Zeilen 1 ohne-Optionen 1 deploy-ssh 0 inventur 0");
  });

  it("V-9: Platz knapp (≥ 85 %) → ABW; ungesund → ABW", () => {
    stub("belegt", "91");
    expect(statusZeile(lauf().out, "V-9")).toMatch(/^V-9 ABW frei 12G von 40G belegt 91% /);
    stub("belegt", "70");
    stub("health", "starting");
    expect(statusZeile(lauf().out, "V-9")).toMatch(/gesund starting$/);
    expect(status(lauf().out, "V-9")).toBe("ABW");
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur-konsole.sh: Selbstprüfung (Abbruch vor jedem Docker-Aufruf)", () => {
  const fall = (env, erwartet) => {
    const r = lauf([], env);
    expect(r.code, r.alles).toBe(2);
    expect(r.out.split("\n")[0]).toBe("Dieses Skript ändert nichts.");
    expect(r.out).toMatch(new RegExp(`ABBRUCH: .*${erwartet}`));
    expect(aufrufe()).toEqual([]);
    expect(r.out).not.toContain("PRUEFCODE");
  };
  it("nicht root", () => fall({ STUB_UID: "1000" }, "nicht root"));
  it("Betriebsverzeichnis und data gehören verschiedenen Konten", () => {
    stub("besitz_fremd");
    fall({}, "Besitz verschieden");
  });
  it("Besitzer ist root", () => {
    stub("besitz_root");
    fall({}, "root");
  });
  it("fremdes OS (Debian 12) und fremdes Release (Ubuntu 22.04)", () => {
    datei("os-release", 'ID=debian\nVERSION_ID="12"\n');
    fall({}, "fremdes System");
    datei("os-release", 'ID=ubuntu\nVERSION_ID="22.04"\n');
    fall({}, "fremdes System");
  });
  it("data fehlt", () => {
    rmSync(path.join(app, "data"), { recursive: true });
    fall({}, "data fehlt");
  });
  it("eingebettete inventur.sh verändert → Prüfsumme falsch, kein Docker-Aufruf", () => {
    const kaputt = path.join(tmp, "kaputt.sh");
    const i = QUELLTEXT.indexOf("INVENTUR_SH='");
    expect(i).toBeGreaterThan(0);
    const j = QUELLTEXT.indexOf("maskieren() {", i);
    writeFileSync(kaputt, QUELLTEXT.slice(0, j) + "maskieren() { cat; }\nmaskieren_alt() {" + QUELLTEXT.slice(j + "maskieren() {".length));
    const r = spawnSync(BASH, [p(kaputt)], { encoding: "utf8", env: umgebung({}), timeout: 400000 });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stdout).toContain("ABBRUCH: eingebettete inventur.sh: Prüfsumme falsch");
    expect(aufrufe()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur-konsole.sh: nur lesen, keine Geheimnisse", () => {
  it("schreibt keine Datei: Test-Baum (ohne Stub-Verzeichnis) vorher = nachher, TMPDIR leer — Kurz und --voll", () => {
    const ohne = [stubDir]; /* Stub-Verzeichnis: Aufrufprotokoll der Stubs (Testwerkzeug) */
    const vorher = abbild(tmp, ohne);
    expect(lauf().code).toBe(0);
    expect(lauf(["--voll"]).code).toBe(0);
    expect(laufWieKonsole(["--voll"]).code).toBe(0);
    expect(abbild(tmp, ohne)).toEqual(vorher);
    expect(readdirSync(tmpDir)).toEqual([]);
  });

  it("keine Geheimnisse, Mailadressen, Schlüsselkörper, Personendaten — Kurz und --voll, mit und ohne Maske", () => {
    keineGeheimnisse(lauf().alles);
    keineGeheimnisse(lauf(["--voll"]).alles);
    /* Schicht 1 allein (Maske aus): das Kurzprotokoll ist ohnehin nur aus Fakten gebaut. Im --voll-Protokoll
       steht dann nur der Kommentar eines Schlüssels (ssh-keygen -lf, hier eine Mailadresse) — wie in
       inventur.sh fängt den erst Schicht 2 ab. */
    keineGeheimnisse(lauf([], { INVENTUR_MASKE: "aus" }).alles);
    keineGeheimnisse(lauf(["--voll"], { INVENTUR_MASKE: "aus" }).alles);
  });

  it("A-2: Kommentare von SSH-Schlüsseln (Klarnamen, rinat@DESKTOP-X) erscheinen nirgends — auch ohne Maske; Fingerabdruck bleibt", () => {
    datei(
      "heim/.ssh/authorized_keys",
      [
        `command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 ${KOERPER_DEPLOY} rinat@DESKTOP-X`,
        `ssh-ed25519 ${KOERPER_ADMIN} ${MITARBEITER}`,
        "",
      ].join("\n"),
    );
    for (const env of [{}, { INVENTUR_MASKE: "aus" }]) {
      for (const args of [[], ["--voll"]]) {
        const r = lauf(args, env);
        expect(r.code, r.alles).toBe(0);
        for (const g of ["rinat@", "DESKTOP-X", MITARBEITER, "Mustermann", KOERPER_DEPLOY, KOERPER_ADMIN]) expect(r.alles, `${g} ${args}`).not.toContain(g);
        if (args.length && spawnSync(BASH, ["-c", "command -v ssh-keygen"], { encoding: "utf8" }).status === 0) {
          expect(r.out).toMatch(/\n256 SHA256:[A-Za-z0-9+/]{43} \(ED25519\)\n/);
        }
      }
    }
  });

  it.skipIf(process.platform === "win32")("A-5: Steuerzeichen (ESC/CSI, BEL) aus Dateinamen erscheinen in --voll nicht", () => {
    datei("app/\u001b[31mrot\u0007.sh", "# Probe\n");
    datei("app/zustand/\u001b]0;titel\u0007x", "{}\n");
    const r = lauf(["--voll"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toContain("=== V-4");
    expect(r.out).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/);
    expect(r.out).toContain("[31mrot");
  });

  it("nur erlaubte Docker-Aufrufe, nie docker exec (Kurz und --voll)", () => {
    lauf();
    lauf(["--voll"]);
    const a = aufrufe();
    expect(a.length).toBeGreaterThan(8);
    expect(a.filter((z) => !ERLAUBT.has(z))).toEqual([]);
    expect(a.filter((z) => z.startsWith("exec"))).toEqual([]);
  });

  it("--voll: ausführliches, maskiertes Protokoll mit allen Abschnitten und am Ende das Kurzprotokoll", () => {
    const r = lauf(["--voll"]);
    expect(r.code, r.alles).toBe(0);
    for (const m of ["=== V-1", "=== V-2", "=== V-3", "=== V-4", "=== V-5", "=== V-6", "=== V-7", "=== V-8", "=== V-9", "=== R-1", "=== R-2"]) {
      expect(r.out).toContain(m);
    }
    expect(r.out).toContain("kein docker exec");
    expect(r.out.split("\n")[0]).toBe("Dieses Skript ändert nichts.");
    expect(r.out).toMatch(/\nPRUEFCODE [0-9a-f]{12} ZEILEN \d+\n$/);
    expect(r.out).toContain(PFLICHT[0]);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("Ladeweg: Hash-Semantik printf %s", () => {
  it("die Betreiberbefehle in bash liefern genau die Werte des Werkzeugs (--hash)", () => {
    const w = bau.werte(QUELLTEXT);
    const r = spawnSync(BASH, ["-c", 's=$(cat "$1"); printf %s "$s" | sha256sum | cut -c1-16; printf %s "$s" | wc -l; printf %s "$s" | wc -c', "x", p(SKRIPT)], {
      encoding: "utf8",
    });
    const [h, l, c] = r.stdout.trim().split(/\s+/);
    expect(h).toBe(w.kurz16);
    expect(Number(l)).toBe(w.zeilen);
    expect(Number(c)).toBe(w.bytes);
  });

  it("printf %s \"$s\" ≠ Datei: der veröffentlichte Wert gilt OHNE abschließenden Zeilenumbruch", () => {
    const w = bau.werte(QUELLTEXT);
    expect(QUELLTEXT.endsWith("\n")).toBe(true);
    expect(w.sha256).not.toBe(sha(QUELLTEXT));
    expect(w.sha256).toBe(sha(QUELLTEXT.replace(/\n+$/, "")));
    expect(w.zeilen).toBe(QUELLTEXT.split("\n").length - 2);
    expect(bau.werte("a\nb\n\n\n").zeilen).toBe(1);
    expect(bau.werte("a\r\nb\r\n").sha256).toBe(sha("a\nb"));
  });

  /* A-1: Tor-Befehl. Die Maschine vergleicht 32 Hex (128 Bit); bei falschem Sollwert startet bash nicht.
     Ohne Stubs bricht das Skript sofort an der Selbstprüfung ab (nicht root bzw. kein Betriebsverzeichnis) —
     die erste Zeile „Dieses Skript ändert nichts.“ beweist aber, dass bash gestartet wurde. */
  const torLauf = (befehl) =>
    spawnSync(BASH, ["-c", `s=$(cat "$1"); ${befehl}`, "x", p(SKRIPT)], {
      encoding: "utf8",
      env: { ...process.env, CENTRIC_VERZ: p(path.join(tmp, "gibt-es-nicht")) },
      timeout: 400000,
    });
  const tor = () => bau.befehle("REF", bau.werte(QUELLTEXT)).find((b) => b.art === "tor").befehl;

  it("A-1: Tor mit richtigem Sollwert startet das Skript, mit falschem nicht (Tippfehler → nichts ausgeführt)", () => {
    const w = bau.werte(QUELLTEXT);
    expect(w.kurz32).toBe(w.sha256.slice(0, 32));
    expect(tor()).toBe(`printf %s "$s" | sha256sum | grep -q '^${w.kurz32}' && bash -c "$s"`);
    expect(torLauf(tor()).stdout).toContain("Dieses Skript ändert nichts.");
    const falsch = tor().replace(w.kurz32, (w.kurz32[0] === "0" ? "1" : "0") + w.kurz32.slice(1));
    const r = torLauf(falsch);
    expect(r.stdout).toBe("");
    expect(r.status).not.toBe(0);
  });

  it("A-1 Mutation: „&&“ durch „;“ ersetzt → bash startet trotz falschem Sollwert (der Test oben wäre rot)", () => {
    const w = bau.werte(QUELLTEXT);
    const mutiert = tor().replace(w.kurz32, "f".repeat(32)).replace(" && ", " ; ");
    expect(torLauf(mutiert).stdout).toContain("Dieses Skript ändert nichts.");
  });

  it("A-1/A-4: Befehlsfolge kurz, jeder Befehl mit Zeichenzahl, kein Pager (more/less), --voll seitenweise per head/tail", () => {
    const w = bau.werte(QUELLTEXT);
    const b = bau.befehle("6c0b0e0dc9ef", w);
    expect(b.filter((x) => x.pflicht).map((x) => x.art)).toEqual(["laden", "tor", "aufraeumen"]);
    for (const x of b) {
      expect(x.zeichen).toBe(x.befehl.length);
      expect(x.befehl).not.toMatch(/\b(more|less)\b/);
    }
    const voll = b.filter((x) => x.art === "voll").map((x) => x.befehl);
    expect(voll).toEqual([
      `printf %s "$s" | sha256sum | grep -q '^${w.kurz32}' && bash -c "$s" x --voll | head -n 60`,
      `printf %s "$s" | sha256sum | grep -q '^${w.kurz32}' && bash -c "$s" x --voll | tail -n +61 | head -n 60`,
    ]);
    expect(b.find((x) => x.art === "kontrolle").befehl).toBe(`printf %s "$s" | sha256sum | grep -c '^${w.kurz32}'`);
  });

  it("das Skript ist klein genug für ein einzelnes Argument von bash -c (< 100 000 Byte)", () => {
    expect(Buffer.byteLength(QUELLTEXT)).toBeLessThan(100000);
  });
});

/* ------------------------------------------------------------------ */
/* Review #449, Auflagen A-7/A-8: Die Doku warnt vor `&`/`;` statt `&&` und vor einem verkürzten Sollwert. */
describe("Doku INVENTUR-KONSOLE.md: Tor-Grenzen (A-7, A-8)", () => {
  const doku = () => readFileSync(path.join(WURZEL, "docs", "acc45", "INVENTUR-KONSOLE.md"), "utf8").replace(/\r\n/g, "\n");
  const abschnitt = (d, nr) => {
    const a = d.indexOf(`\n## ${nr}. `);
    const e = d.indexOf("\n## ", a + 1);
    return d.slice(a, e < 0 ? undefined : e);
  };

  it("A-7: §2 und §9 nennen „&&“ als zwei Zeichen, den Hinweis „[1]“ und STOPP", () => {
    const d = doku();
    for (const nr of [2, 9]) {
      const s = abschnitt(d, nr);
      expect(s, `§${nr}`).toMatch(/`&&` sind zwei Zeichen/);
      expect(s, `§${nr}`).toMatch(/`\[1\]/);
      expect(s, `§${nr}`).toMatch(/STOPP/);
    }
  });

  it("A-7: der Satz „nie dazu, dass ein anderer Inhalt läuft“ steht nicht mehr uneingeschränkt", () => {
    const s = abschnitt(doku(), 9);
    expect(s).not.toMatch(/nie dazu, dass ein anderer Inhalt läuft\.?\s*$/m);
    expect(s).toMatch(/`&` oder `;` statt `&&`/);
  });

  it("A-8: genau 32 Zeichen tippen; Kontrolle ist die Zeichenzahl (Befehl 2 = 88), nicht K1", () => {
    const d = doku();
    const w = bau.werte(QUELLTEXT);
    const zeichen = Object.fromEntries(bau.befehle("REF0123456ab", w).map((b) => [b.art, b.zeichen]));
    expect(zeichen.tor).toBe(88);
    for (const nr of [2, 9]) {
      const s = abschnitt(d, nr);
      expect(s, `§${nr}`).toMatch(/genau 32 Zeichen/);
      expect(s, `§${nr}`).toMatch(/Befehl 2 hat genau 88 Zeichen/);
      expect(s, `§${nr}`).toMatch(/K1 erkennt einen verkürzten Sollwert nicht/);
    }
    // §9 darf K1 nicht mehr als Kontrolle gegen einen verkürzten Sollwert nennen.
    expect(abschnitt(d, 9)).not.toMatch(/Kontrolle: K1 muss `1` zeigen/);
    const s2 = abschnitt(d, 2);
    expect(s2).toMatch(/[Vv]or `Enter` zählen/);
    // Zählhilfe: Sollwert in 4 Blöcken zu 8 Zeichen
    expect(s2).toContain(w.kurz32.match(/.{8}/g).join(" "));
    expect(s2).toMatch(/V1 hat 110[^\n]*V2 hat 124/);
    expect(abschnitt(d, 2)).toMatch(/und der Sollwert vollständig ist/);
  });

  it("A-7: `;` hat kein Erkennungszeichen; bei `&` folgt später `[1]+ Done`/`Exit 1`", () => {
    const d = doku();
    const s9 = abschnitt(d, 9).replace(/\s+/g, " ");
    expect(s9).toMatch(/Bei `;` gibt es nach `?Enter`? kein Erkennungszeichen; nur die Kontrolle vor `?Enter`? hilft\./);
    for (const nr of [5, 9]) {
      const s = abschnitt(d, nr);
      expect(s, `§${nr}`).toMatch(/`\[1\]\+ Done`/);
      expect(s, `§${nr}`).toMatch(/`\[1\]\+ Exit 1`/);
    }
  });

  it("Restrisiken: 12-stelliger Präfix im <ref> und SIGPIPE bei `| head -n 60` sind genannt", () => {
    const s = abschnitt(doku(), 9);
    expect(s).toMatch(/12-stellige[rn]? Präfix/);
    expect(s).toMatch(/SIGPIPE/);
  });
});

/* ------------------------------------------------------------------ */
describe("Werkzeug werkzeug/inventur-konsole-bauen.mjs", () => {
  it("--pruefen: eingebettete inventur.sh und Vorlage aktuell, keine verbotenen Befehle, Doku-Sollwerte stimmen", () => {
    expect(bau.pruefen(WURZEL)).toEqual([]);
  });

  it("der eingebettete Text ist deploy/inventur.sh Byte für Byte, INVENTUR_SHA256 ist seine Prüfsumme", () => {
    const inv = lf(readFileSync(INVENTUR, "utf8"));
    expect(QUELLTEXT).toContain(`INVENTUR_SHA256='${sha(inv)}'`);
    expect(QUELLTEXT).toContain(bau.erzeugterBlock(inv, readFileSync(path.join(WURZEL, ".env.example"), "utf8")));
  });

  it("veraltete eingebettete inventur.sh wird erkannt", () => {
    const inv = lf(readFileSync(INVENTUR, "utf8"));
    const fehler = bau.pruefeInhalt({
      konsole: QUELLTEXT,
      inventur: inv.replace("umask 077", "umask 022"),
      vorlage: readFileSync(path.join(WURZEL, ".env.example"), "utf8"),
      doku: readFileSync(path.join(WURZEL, "docs", "acc45", "INVENTUR-KONSOLE.md"), "utf8"),
    });
    expect(fehler.join("\n")).toMatch(/veraltet/);
  });

  it("Original ohne Befund", () => {
    expect(bau.verboteneBefehle(QUELLTEXT)).toEqual([]);
  });

  /* Mutationen: jeder Eintrag in den nicht erzeugten Teil eingefügt → mindestens ein Befund. */
  const MUTATIONEN = [
    "rm -f /tmp/x",
    "echo x > /tmp/x",
    "echo x >> /tmp/x",
    "printf x | tee /tmp/x",
    "cp a b",
    "mv a b",
    "chmod 600 f",
    "chown root f",
    "truncate -s0 f",
    "dd if=a of=b",
    "mkdir /tmp/x",
    "touch /tmp/x",
    "ln -s a b",
    "mktemp",
    "apt-get install -y x",
    "apt install x",
    "dpkg -i x.deb",
    "systemctl restart docker",
    "systemctl stop docker",
    "service docker start",
    "useradd x",
    "usermod -aG docker x",
    "sed -i s/a/b/ f",
    "curl -fsSL https://example.org",
    "wget https://example.org",
    "exec 3<>/dev/tcp/example.org/80",
    "docker run x",
    "docker_lesen run x",
    "docker_lesen exec centric-dp-web id",
    "docker_lesen start x",
    "docker_lesen stop x",
    "docker_lesen rm x",
    "docker_lesen pull x",
    "docker_lesen build .",
    "docker_lesen volume create v",
    "docker_lesen network create n",
    "docker_lesen system prune -f",
    "docker_lesen compose up -d",
    "docker_lesen compose down",
    "compose_lesen up -d",
    "compose_lesen pull",
    "cat .env",
    "grep X .env",
    "cat <<EOF",
    'x="$(rm -rf /tmp/y)"',
    "x=`rm y`",
    "awk '{ print > \"/tmp/f\" }' a",
    "awk 'BEGIN { system(\"id\") }'",
    "bash -c 'id'",
    "sh -c id",
    "eval \"$x\"",
    "crontab -r",
    "crontab /tmp/neu",
    "find . -delete",
    "find . -exec rm {} +",
    "kill 1",
    "sudo id",
    "su admin",
    "source /tmp/x",
    ". /tmp/x",
    "xargs rm",
    "v9",
    "v_kopf",
  ];
  it.each(MUTATIONEN)("Mutation „%s“ → Befund", (m) => {
    const anker = "\nhaupt() {\n";
    expect(QUELLTEXT).toContain(anker);
    const mutiert = QUELLTEXT.replace(anker, `\nhaupt() {\n  ${m}\n`);
    expect(bau.verboteneBefehle(mutiert).length, m).toBeGreaterThan(0);
  });

  it("Mutation im erzeugten Block (eingebettete inventur.sh) wird über den Blockvergleich erkannt", () => {
    const mutiert = QUELLTEXT.replace("umask 077\nexport LC_ALL=C\nif [[ -n \"${SSH_CONNECTION", "umask 022\nexport LC_ALL=C\nif [[ -n \"${SSH_CONNECTION");
    expect(mutiert).not.toBe(QUELLTEXT);
    const fehler = bau.pruefeInhalt({
      konsole: mutiert,
      inventur: lf(readFileSync(INVENTUR, "utf8")),
      vorlage: readFileSync(path.join(WURZEL, ".env.example"), "utf8"),
      doku: readFileSync(path.join(WURZEL, "docs", "acc45", "INVENTUR-KONSOLE.md"), "utf8"),
    });
    expect(fehler.length).toBeGreaterThan(0);
  });

  it("pruefcode: abgetippte Zeilen → derselbe Code wie im Skript; ein Tippfehler ändert ihn", () => {
    const zeilen = ["V-1 OK a", "V-2 ABW b"];
    const echt = bau.pruefcode(zeilen.join("\n") + "\nPRUEFCODE x ZEILEN 2\n");
    expect(echt).toEqual({ code: sha("V-1 OK a\nV-2 ABW b\n").slice(0, 12), zeilen: 2 });
    expect(bau.pruefcode("V-1 OK a  \r\nV-2 ABW b\r\n").code).toBe(echt.code);
    expect(bau.pruefcode("V-1 OK a\nV-2 ABW c\n").code).not.toBe(echt.code);
  });
});

/* ------------------------------------------------------------------ */
describe("deploy/inventur-konsole.sh: Quelltext-Wächter", () => {
  const Z = QUELLTEXT.split("\n");
  const idx = (re) => Z.findIndex((x) => re.test(x));

  it("Härtung zuerst: /bin/bash, set -euo pipefail, umask 077, LC_ALL=C, fester PATH, BASH_ENV/ENV/CDPATH entfernt", () => {
    expect(QUELLTEXT.startsWith("#!/bin/bash\n")).toBe(true);
    const erste = idx(/^[a-z_]+\(\) \{$/);
    for (const re of [/^set -euo pipefail$/, /^umask 077$/, /^export LC_ALL=C$/, /^PATH="\$\{INVENTUR_PRUEFPFAD:-\/usr\/sbin:\/usr\/bin:\/sbin:\/bin\}"$/, /^unset BASH_ENV ENV CDPATH$/]) {
      const i = idx(re);
      expect(i, String(re)).toBeGreaterThan(-1);
      expect(i, String(re)).toBeLessThan(erste);
    }
  });

  it("eval genau einmal, nur auf dem geprüften Block; v9 und v_kopf werden danach entfernt", () => {
    const ev = Z.filter((x) => /\beval\b/.test(x) && !/^\s*#/.test(x));
    const ausserhalb = bau.ohneErzeugtenBlock(QUELLTEXT).split("\n").filter((x) => /\beval\b/.test(x) && !/^\s*#/.test(x));
    expect(ausserhalb).toEqual(['  eval "$INVENTUR_BLOCK"']);
    expect(ev.length).toBeGreaterThanOrEqual(1);
    expect(idx(/^\s*unset -f v9 v_kopf$/)).toBeGreaterThan(idx(/^\s*eval "\$INVENTUR_BLOCK"$/));
    expect(idx(/^\s*inventur_laden$/)).toBeLessThan(idx(/^\s*eval "\$INVENTUR_BLOCK"$/));
  });

  it("meldet „Dieses Skript ändert nichts.“ vor der Selbstprüfung", () => {
    expect(idx(/printf 'Dieses Skript ändert nichts\.\\n'/)).toBeGreaterThan(-1);
    expect(idx(/printf 'Dieses Skript ändert nichts\.\\n'/)).toBeLessThan(idx(/^\s*selbstpruefung$/));
  });

  it("Dateimodus im Index ist 100755 (wie die übrigen deploy/*.sh)", () => {
    const r = spawnSync("git", ["ls-files", "-s", "deploy/inventur-konsole.sh"], { cwd: WURZEL, encoding: "utf8" });
    if (r.status !== 0 || !r.stdout.trim()) return; /* kein Git oder noch nicht im Index */
    expect(r.stdout.split(" ")[0]).toBe("100755");
  });

  it.skipIf(spawnSync(process.env.CENTRIC_SHELLCHECK || "shellcheck", ["--version"]).status !== 0)("shellcheck sauber (lokal, falls vorhanden; in CI: Betrieb: Deploy-Skripte)", () => {
    const r = spawnSync(process.env.CENTRIC_SHELLCHECK || "shellcheck", ["-x", SKRIPT], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe("docs/acc45/INVENTUR-KONSOLE.md", () => {
  const doku = lf(readFileSync(path.join(WURZEL, "docs", "acc45", "INVENTUR-KONSOLE.md"), "utf8"));
  it("nennt die aktuellen Vergleichswerte (32-Hex im Tor, SHA-256, Zeilen, Bytes) und die Torbefehle des Skripts", () => {
    const w = bau.werte(QUELLTEXT);
    expect(doku).toContain(`\`${w.kurz32}\``);
    expect(doku).toContain(`\`${w.sha256}\``);
    expect(doku).toContain(`Zeilen: \`${w.zeilen}\``);
    expect(doku).toContain(`Bytes: \`${w.bytes}\``);
    expect(doku).toContain(`grep -q '^${w.kurz32}' && bash -c "$s"`);
  });
  it("A-4: kein Pager mit Shell-Escape (more/less) in den Befehlen; --voll-Fotos vor dem Senden durchsehen", () => {
    expect(doku).not.toMatch(/\|\s*(more|less)\b/);
    expect(doku).toContain("head -n 60");
    expect(doku).toMatch(/Shell-Escape/);
    expect(doku).toMatch(/vor dem Senden/);
    expect(doku).not.toMatch(/praktisch unmöglich/);
  });
  it("Beispiel-Kurzprotokoll ist als erfunden gekennzeichnet; Rückweg und Übermittlung beschrieben", () => {
    expect(doku).toMatch(/BEISPIEL/);
    expect(doku).toMatch(/erfunden/i);
    expect(doku).toContain("Dieses Skript ändert nichts.");
    expect(doku).toMatch(/Rückweg/);
    expect(doku).toMatch(/PRUEFCODE/);
    expect(doku).toMatch(/VPS-ZUGANG-EINRICHTUNG\.md/);
  });
});
