/* ==========================================================================
   INVENTUR-SKRIPT (REL-0) — deploy/inventur.sh liest nur und gibt keine
   Geheimnisse aus

   Das Skript läuft gegen einen Docker-Stub (Muster wie
   pruefungen/deploy-skripte.test.js und deploy/sicherung/ci/fake-docker.sh):
   ein falsches `docker` im festen PATH (INVENTUR_PRUEFPFAD) protokolliert
   jeden Aufruf in ein eigenes Verzeichnis außerhalb von Betriebs- und
   Heimatverzeichnis. .env, Betriebsprotokoll und Sicherungsmarke enthalten
   erfundene Geheimnisse.

   Geprüft wird:
     - Syntax, Aufruf, Forced Command (strikt: fehlt, leer oder genau
       „inventur“; alles andere → Rückgabe 2, keine Ausgabe, kein Docker)
     - alle Abschnitte V-1 bis V-9, R-1, R-2 mit Kennzeichnung
     - Schicht 1 (Quelle) GETRENNT von Schicht 2: mit INVENTUR_MASKE=aus
       erscheint kein .env-Wert — auch bei export, Leerzeichen,
       Anführungszeichen, mehrzeiligen Werten, CRLF, Kommentaren, Zeilen
       ohne „=“ und bei Fehlertexten von docker compose
     - Schicht 2 mit absichtlich geleaktem Wert
     - nur erlaubte Docker-Unterbefehle (Allowlist über das Aufrufprotokoll)
     - schreibt nichts (Verzeichnisabbild vorher = nachher)
     - fail-soft: scheitert Docker oder fehlt die .env, laufen die übrigen
       Abschnitte weiter
     - Quelltext-Wächter und Prüfsummen in der Anleitung

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
import { bashFinden, p, posixPfad, FREMDE_BEFEHLE, ohneKommentareUndZeichenketten } from "./inventur-hilfen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(WURZEL, "deploy", "inventur.sh");
const QUELLTEXT = readFileSync(SKRIPT, "utf8");
const BASH = bashFinden();
/* Ein Lauf startet unter Git Bash rund 50 Prozesse (mehrere Sekunden). */
vi.setConfig({ testTimeout: 120000 });

/* Erfundene Werte. Keiner darf in der (maskierten) Ausgabe stehen. */
const DIGEST_HEX = "a".repeat(64);
const BILD_ID = "sha256:" + "1b".repeat(32);
const COMMIT = "2".repeat(40);
const GEHEIM = "GEHEIM-TESTWERT-123";
const PFEFFER = "pfeffer-wert-nur-probe-456";
const ENV_TOKEN = "ghp_EnvToken0123456789abcdefABCDEF";
const ENV_MAIL = "env.kontakt@beispiel.de";
const TOKEN = "ghp_ProbeToken0123456789abcdefABCDEF";
const MAIL = "pflege.person@beispiel.de";
const IP = "203.0.113.77";
const SICHERUNG_GEHEIM = "SICHERUNGS-GEHEIMNIS-789";
const LECK = "LECK-WERT-555";
const SMTP_PW = "Pw0rdXsmtp42";

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
const INVENTUR_OPTIONEN =
  'command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc';

const STUB = [
  "#!/usr/bin/env bash",
  "# Docker-Stub für die Inventurprüfung. Protokoll in $STUB_DIR/aufrufe.log.",
  'z="$STUB_DIR"',
  "printf '%s\\n' \"$*\" >>\"$z/aufrufe.log\"",
  'if [[ -f "$z/docker_tot" ]]; then echo "Cannot connect to the Docker daemon" >&2; exit 1; fi',
  'letztes="${*: -1}"',
  'case "$1" in',
  "  compose)",
  /* Wie echtes Compose bei kaputter .env: der Fehlertext zitiert die Zeile samt Wert. */
  "    if [[ -f \"$z/compose_fehler\" ]]; then echo 'failed to read .env: line 2: unexpected character in CENTRIC_SMTP_PASSWORT=@GEHEIM@' >&2; echo '@GEHEIM@' >&2; echo 'invalid url smtp://user:@SMTPPW@@mail.example.org:587' >&2; exit 1; fi",
  '    case "$2" in',
  "      ps) echo 'NAME IMAGE SERVICE STATUS PORTS'; echo 'centric-dp-web ghcr.io/rinats-png/dienstplaner@sha256:@HEX@ web Up 2 days (healthy) 127.0.0.1:3000->3000/tcp' ;;",
  /* Wie echtes `compose config`: die Umgebung aus env_file steht im Klartext darin. */
  "      config) printf '%s\\n' 'services:' '  web:' '    environment:' '      CENTRIC_SMTP_PASSWORT: @GEHEIM@' '      CENTRIC_PFEFFER: @PFEFFER@' '    image: ghcr.io/rinats-png/dienstplaner@sha256:@HEX@' ;;",
  "      version) echo 'Docker Compose version v2.29.7' ;;",
  '      *) echo "stub: compose $2 nicht erlaubt" >&2; exit 9 ;;',
  "    esac ;;",
  "  inspect)",
  '    case "$letztes" in',
  "      *Config.Env*|*'json .}'*|*'json .Config}'*) echo '[\"CENTRIC_SMTP_PASSWORT=@GEHEIM@\",\"lower_var=@GEHEIM@\"]' ;;",
  "      *Mounts*) echo 'bind /opt/apps/centric-dienstplanung/data -> /app/data schreibbar:true' ;;",
  "      *working_dir*) echo 'Compose-Projekt: centric Pfad: /opt/apps/centric-dienstplanung Dateien: /opt/apps/centric-dienstplanung/compose.yml' ;;",
  "      *State.Status*) echo '@ID@ ghcr.io/rinats-png/dienstplaner@sha256:@HEX@ running healthy 2026-11-02T15:59:03.5Z 0' ;;",
  "      '{{.Image}}') echo '@ID@' ;;",
  /* Jedes andere Format: wie `docker inspect` mit Umgebung — Werte im Klartext (eine Abweichung fällt so auf). */
  "      *) echo 'CENTRIC_SMTP_PASSWORT=@GEHEIM@ lower_var=@GEHEIM@' ;;",
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
  .replaceAll("@IP@", IP)
  .replaceAll("@SMTPPW@", SMTP_PW);

/* Erlaubte Docker-Aufrufe: GENAU diese Zeilen (so, wie der Stub sie protokolliert), mit festen Formaten. */
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
  "exec centric-dp-web node -e fetch('http://127.0.0.1:3000/gesund').then(r=>r.text()).then(t=>console.log(t))",
]);

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
    INVENTUR_PRUEFPFAD: `${posixPfad(bin)}:/usr/sbin:/usr/bin:/sbin:/bin`,
    STUB_DIR: p(stubDir),
    CENTRIC_VERZ: p(app),
    CENTRIC_KONTO_HOME: p(heim),
    CENTRIC_HOME_WURZEL: p(path.join(tmp, "keine-weiteren-konten")),
    CENTRIC_ZEITGRENZE: "20",
    HOME: p(heim),
    ...env,
  };
  for (const n of ["SSH_ORIGINAL_COMMAND", "SSH_AUTH_SOCK", "INVENTUR_MASKE", "BASH_ENV", "ENV"]) if (!(n in env)) delete umgebung[n];
  const r = spawnSync(BASH, [p(SKRIPT), ...args], { encoding: "utf8", env: umgebung, timeout: 60000 });
  return { code: r.status, out: r.stdout, err: r.stderr, alles: r.stdout + r.stderr };
}

const aufrufe = () => {
  const f = path.join(stubDir, "aufrufe.log");
  return existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean) : [];
};
const abschnittText = (out, von, bis) => out.split(von)[1].split(bis)[0].split("\n").slice(1).join("\n");

function keineGeheimnisse(text) {
  for (const g of [GEHEIM, PFEFFER, ENV_TOKEN, ENV_MAIL, TOKEN, MAIL, IP, SICHERUNG_GEHEIM, SMTP_PW, KOERPER_DEPLOY, KOERPER_INVENTUR, "zugang:"]) {
    expect(text).not.toContain(g);
  }
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
      `CENTRIC_GITHUB_TOKEN=${ENV_TOKEN}`,
      `CENTRIC_KONTAKT=${ENV_MAIL}`,
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
      `kaputte zeile ${MAIL} ${TOKEN}`,
      "",
    ].join("\n"),
  );
  datei(
    "heim/.ssh/authorized_keys",
    [
      `command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict ssh-ed25519 ${KOERPER_DEPLOY} deploy@ci-probe`,
      `${INVENTUR_OPTIONEN} ssh-ed25519 ${KOERPER_INVENTUR} inventur-centric`,
      "",
    ].join("\n"),
  );
  datei(
    "heim/sicherung/letzte-erfolgreiche.json",
    `{"zeit":"2026-11-19T02:00:00Z","schnappschuss":"4f2a9c1b","ziel":"s3:https://zugang:${SICHERUNG_GEHEIM}@objekt.example/eimer"}\n`,
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

  it("Forced Command: jeder fremde Befehl → Rückgabe 2, nichts auf stdout, kein Docker-Aufruf, kein Abschnitt", () => {
    for (const befehl of FREMDE_BEFEHLE) {
      const r = lauf([], { SSH_ORIGINAL_COMMAND: befehl });
      expect(r.code, JSON.stringify(befehl)).toBe(2);
      expect(r.out, JSON.stringify(befehl)).toBe("");
      expect(r.err, JSON.stringify(befehl)).toContain("abgewiesen");
    }
    expect(aufrufe()).toEqual([]);
  });

  it("Forced Command: genau 'inventur' oder leer führt die Inventur aus", () => {
    for (const befehl of ["inventur", ""]) {
      const r = lauf([], { SSH_ORIGINAL_COMMAND: befehl });
      expect(r.code, r.alles).toBe(0);
      expect(r.out).toContain("=== V-9");
    }
  });

  it("die Abweisung kommt vor der Argumentprüfung (fremder Befehl mit --hilfe zeigt keine Hilfe)", () => {
    const r = lauf(["--hilfe"], { SSH_ORIGINAL_COMMAND: "id" });
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
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
    /* Nachweis für no-agent-forwarding/no-pty: nur ja/nein */
    expect(r.out).toContain("Agent-Weiterleitung: nicht gesetzt\n");
    expect(r.out).toContain("Terminal: nein\n");
    const mitAgent = lauf([], { SSH_AUTH_SOCK: "/tmp/ssh-PROBEPFAD/agent.1" });
    expect(mitAgent.out).toContain("Agent-Weiterleitung: gesetzt\n");
    expect(mitAgent.out).not.toContain("PROBEPFAD");
    expect(r.out).not.toContain("Abschnitt gescheitert");
  });

  it("V-6 nennt die Schlüsselnamen der .env, nie einen Wert", () => {
    const r = lauf();
    const v6 = abschnittText(r.out, "=== V-6", "=== V-7");
    expect(v6.trim().split("\n")).toEqual(["CENTRIC_GITHUB_TOKEN", "CENTRIC_KONTAKT", "CENTRIC_PFEFFER", "CENTRIC_SMTP_PASSWORT", "IMAGE_DIGEST"]);
  });

  it("V-3 nennt IMAGE_DIGEST nur als Namen; die wirksame Bildreferenz kommt aus compose config (nur image:)", () => {
    const r = lauf();
    const v3 = abschnittText(r.out, "=== V-3", "=== V-4");
    expect(v3).toContain("\nIMAGE_DIGEST\n");
    expect(v3).not.toContain(`IMAGE_DIGEST=`);
    expect(v3).toContain(`image: ghcr.io/rinats-png/dienstplaner@sha256:${DIGEST_HEX}`);
    expect(v3).not.toContain("environment");
  });

  it("die gesamte Ausgabe enthält kein Geheimnis, keine E-Mail, keine Adresse, keinen Schlüsselkörper", () => {
    keineGeheimnisse(lauf().alles);
  });

  it("zeigt die prüfbaren Werte: Bild-ID, Label, Prüfsummen, Rechte, Optionen, Fingerabdrücke", () => {
    const r = lauf();
    expect(r.out).toContain(`${BILD_ID} ["ghcr.io/rinats-png/dienstplaner@sha256:${DIGEST_HEX}"] ${COMMIT}`);
    const summe = createHash("sha256").update(readFileSync(path.join(app, "compose.yml"))).digest("hex");
    expect(r.out).toMatch(new RegExp(`${summe} [ *]?compose\\.yml`));
    expect(r.out).toMatch(/zustand \S+ \S+ \d+/);
    expect(r.out).toContain(`Optionen: ${INVENTUR_OPTIONEN} | Typ: ssh-ed25519`);
    expect(r.out).toContain('Optionen: command="/opt/apps/centric-dienstplanung/deploy.sh --ssh",restrict | Typ: ssh-ed25519');
    expect(r.out).toContain("deploy.sh --ssh: 1");
    expect(r.out).toContain("centric-inventur: 1");
    if (spawnSync(BASH, ["-c", "command -v ssh-keygen"], { encoding: "utf8" }).status === 0) {
      expect(r.out).toMatch(/256 SHA256:[A-Za-z0-9+/]{43} inventur-centric \(ED25519\)/);
    }
    expect(r.out).toContain("bind /opt/apps/centric-dienstplanung/data -> /app/data schreibbar:true");
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
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur.sh: Schicht 1 (Quelle) ohne Maskierung", () => {
  it("INVENTUR_MASKE=aus: kein .env-Wert, kein Protokollinhalt, kein Schlüsselkörper", () => {
    const r = lauf([], { INVENTUR_MASKE: "aus" });
    expect(r.code, r.alles).toBe(0);
    /* Nachweis, dass die Maske wirklich aus ist: die /gesund-Antwort des Stubs steht im Klartext da. */
    expect(r.out).toContain(MAIL);
    for (const g of [GEHEIM, PFEFFER, ENV_TOKEN, ENV_MAIL, TOKEN, KOERPER_DEPLOY, KOERPER_INVENTUR]) expect(r.alles).not.toContain(g);
  });

  it("schwierige .env-Formen: nur Namen, nie ein Wert oder Wertteil (export, Leerzeichen, Anführung, mehrzeilig, CRLF, Kommentar, ohne =)", () => {
    datei(
      "app/.env",
      [
        `IMAGE_DIGEST=sha256:${DIGEST_HEX}`,
        "export EXPORTIERT=WERT-EXPORT-111",
        "  EINGERUECKT = WERT-LEER-222",
        'IN_ANFUEHRUNG="WERT-QUOTE-333 mit leerzeichen"',
        "EINFACH='WERT-EINFACH-444'",
        'MEHRZEILIG="WERT-MEHR-555',
        "FOLGE_SIEHT_AUS_WIE_NAME=WERT-MEHR-666",
        'ende-WERT-MEHR-777"',
        "MEHR_EINFACH='WERT-MEHR-888",
        "ZWEITE_FOLGE=WERT-MEHR-999'",
        "CRLF_NAME=WERT-CRLF-121\r",
        "# KOMMENTAR=WERT-KOMMENTAR-131",
        "   # EINGERUECKTER_KOMMENTAR=WERT-KOMMENTAR-141",
        "ZEILE OHNE GLEICH WERT-OHNE-151",
        "WERT-OHNE-NAME-161",
        "=WERT-NUR-GLEICH-171",
        "1ZIFFER_ZUERST=WERT-ZIFFER-181",
        "LEER=",
        "NACH_MEHRZEILIG=WERT-NACH-191",
        "",
      ].join("\n"),
    );
    for (const maske of ["aus", "an"]) {
      const r = lauf([], { INVENTUR_MASKE: maske });
      expect(r.alles, maske).not.toContain("WERT-");
      const v6 = abschnittText(r.out, "=== V-6", "=== V-7");
      expect(v6.trim().split("\n"), maske).toEqual([
        "CRLF_NAME",
        "EINFACH",
        "EINGERUECKT",
        "EXPORTIERT",
        "IMAGE_DIGEST",
        "IN_ANFUEHRUNG",
        "LEER",
        "MEHRZEILIG",
        "MEHR_EINFACH",
        "NACH_MEHRZEILIG",
      ]);
    }
  });

  it("Fehlertext von docker compose (zitiert die .env-Zeile) wird verworfen — auch ohne Maskierung", () => {
    writeFileSync(path.join(stubDir, "compose_fehler"), "");
    const r = lauf([], { INVENTUR_MASKE: "aus" });
    expect(r.code).toBe(1);
    expect(r.alles).not.toContain(GEHEIM);
    expect(r.alles).not.toContain(SMTP_PW);
    expect(r.alles).not.toContain("smtp://");
    expect(r.out).toContain("docker compose config fehlgeschlagen (Rückgabe 1, Fehlertext unterdrückt)");
    expect(r.out).toContain("docker compose ps fehlgeschlagen");
    expect(r.out).toMatch(/--- V-3 .*: Abschnitt gescheitert/);
    /* V-6 läuft trotzdem und liefert Namen */
    expect(abschnittText(r.out, "=== V-6", "=== V-7")).toContain("CENTRIC_SMTP_PASSWORT");
  });

  it("Docker nicht erreichbar, ohne Maskierung: kein .env-Wert", () => {
    writeFileSync(path.join(stubDir, "docker_tot"), "");
    const r = lauf([], { INVENTUR_MASKE: "aus" });
    expect(r.code).toBe(1);
    for (const g of [GEHEIM, PFEFFER, ENV_TOKEN, ENV_MAIL]) expect(r.alles).not.toContain(g);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur.sh: Schicht 2 (Maskierung, nur zusätzlich)", () => {
  it("ein absichtlich geleakter Wert in einer ausgegebenen Datei wird maskiert — und ohne Maske sichtbar", () => {
    datei(
      "heim/sicherung/letzte-erfolgreiche.json",
      `CENTRIC_SMTP_PASSWORT=${LECK} lower_var=${LECK}k kontakt=${MAIL} von ${IP} token ${TOKEN} "passwort": "${LECK}x" s3:https://zugang:${SICHERUNG_GEHEIM}@objekt.example/eimer\n`,
    );
    const offen = lauf([], { INVENTUR_MASKE: "aus" });
    expect(offen.out).toContain(LECK);
    expect(offen.out).toContain(SICHERUNG_GEHEIM);
    const r = lauf();
    for (const g of [LECK, MAIL, IP, TOKEN, SICHERUNG_GEHEIM]) expect(r.out).not.toContain(g);
    expect(r.out).toContain("CENTRIC_SMTP_PASSWORT=<maskiert>");
    expect(r.out).toContain("lower_var=<maskiert>");
    expect(r.out).toContain("s3:https://<zugang>@objekt.example/eimer");
  });

  it("Sicherungsmarke: Zugangsdaten in der Ziel-URL werden maskiert, harmlose Felder bleiben", () => {
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
    expect(a.filter((z) => !ERLAUBT.has(z))).toEqual([]);
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
    expect(abschnittText(r.out, "=== V-6", "=== V-7")).toContain("CENTRIC_SMTP_PASSWORT");
    expect(r.out).toContain("=== V-8");
    expect(r.out).toContain("=== Ende ===");
    expect(r.out).toMatch(/Gescheiterte Abschnitte: \d+/);
    keineGeheimnisse(r.alles);
  });

  it("fail-soft: fehlende .env → V-6 scheitert, V-5 nicht, Ende erreicht", () => {
    rmSync(path.join(app, ".env"));
    const r = lauf();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/--- V-6 .*: Abschnitt gescheitert/);
    expect(r.out).not.toMatch(/--- V-5 .*: Abschnitt gescheitert/);
    expect(r.out).toContain("=== Ende ===");
  });
});

/* ------------------------------------------------------------------ */
const QUELL_ZEILEN = QUELLTEXT.split("\n");
const CODE = ohneKommentareUndZeichenketten(QUELLTEXT);
const CODE_ZEILEN_ROH = CODE.split("\n");
const CODE_ZEILEN = QUELL_ZEILEN.filter((z) => !/^\s*#/.test(z));

describe("deploy/inventur.sh: Quelltext-Wächter", () => {
  it("liest die .env nur an einer Stelle (env_namen, awk → nur Bezeichner) und nie als Ganzes", () => {
    expect(CODE).not.toMatch(/\b(cat|source|less|more|head|tail|sed|cut|strings|xxd|od|grep)\b[^\n|;]*\.env\b/);
    expect(CODE).not.toMatch(/(^|\s)\.\s+\S*\.env/);
    expect(CODE_ZEILEN_ROH).toHaveLength(QUELL_ZEILEN.length);
    const zeilen = QUELL_ZEILEN.filter((_, i) => /(^|[\s/])\.env\b/.test(CODE_ZEILEN_ROH[i]));
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toMatch(/^\s*\[\[ -f \.env \]\] \|\| \{ printf '\.env fehlt\\n' >&2; return 1; \}$/);
    expect(zeilen[1]).toMatch(/^\s*\}' \.env \| \{ grep -E '\^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$' \|\| true; \} \| sort -u$/);
  });

  it("docker compose nur über compose_lesen (Fehlertext verworfen)", () => {
    const direkt = [...CODE.matchAll(/\bdocker_lesen\s+compose\b/g)];
    expect(direkt).toHaveLength(1);
    expect(QUELLTEXT).toMatch(/docker_lesen compose "\$@" 2>\/dev\/null \|\| rc=\$\?/);
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
    const unter = [...CODE.matchAll(/\b(docker_lesen|compose_lesen)\s+([a-z]+)(?:\s+([a-z]+))?/g)].map((m) =>
      m[1] === "compose_lesen" ? `compose ${m[2]}` : ["compose", "image"].includes(m[2]) ? `${m[2]} ${m[3]}` : m[2],
    );
    const erlaubt = ["compose ps", "compose config", "compose version", "compose undefined", "inspect", "image inspect", "images", "version", "stats", "exec"];
    expect(unter.filter((u) => !erlaubt.includes(u))).toEqual([]);
    expect(CODE).not.toMatch(/\b(pull|up|run|rmi|tag|restart|stop|kill|start|create|commit|push|load|save|build|down|prune|rename|pause|unpause|login)\b\s/);
    const exec = CODE_ZEILEN.filter((z) => /docker_lesen exec/.test(z));
    expect(exec).toHaveLength(1);
    expect(exec[0]).toContain(`docker_lesen exec "$DIENST" node -e "fetch('http://127.0.0.1:3000/gesund').then(r=>r.text()).then(t=>console.log(t))"`);
  });

  it("docker inspect nur mit festen Formaten: keine Umgebung, kein ganzes Objekt, nur die festen Labels", () => {
    expect(QUELLTEXT).not.toMatch(/Config\.Env|\{\{\s*json\s+\.\s*\}\}|\{\{\s*json\s+\.Config\b|\.Config\s*\}\}/);
    const labels = [...QUELLTEXT.matchAll(/\.Config\.Labels[^}]*/g)].map((m) => m[0]);
    expect([...new Set(labels)].sort()).toEqual([
      ".Config.Labels \"com.docker.compose.project\"",
      ".Config.Labels \"com.docker.compose.project.config_files\"",
      ".Config.Labels \"com.docker.compose.project.working_dir\"",
      ".Config.Labels \"org.opencontainers.image.revision\"",
    ]);
    for (const z of QUELL_ZEILEN.filter((x) => /docker_lesen (image )?inspect/.test(x))) expect(z).toMatch(/--format '[^']+'/);
  });

  it("SSH_ORIGINAL_COMMAND wird nur verglichen, nie ausgeführt — und zwar vor allem anderen", () => {
    const z = CODE_ZEILEN.filter((x) => x.includes("SSH_ORIGINAL_COMMAND"));
    expect(z).toHaveLength(1);
    expect(z[0]).toMatch(/^if \[\[ -n "\$\{SSH_ORIGINAL_COMMAND:-\}" && "\$\{SSH_ORIGINAL_COMMAND\}" != "inventur" \]\]; then$/);
    const pruefung = QUELL_ZEILEN.indexOf(z[0]);
    for (const spaeter of [/^VERZ=/, /^case "\$#/, /^abschnitt /]) {
      expect(QUELL_ZEILEN.findIndex((x) => spaeter.test(x))).toBeGreaterThan(pruefung);
    }
  });

  it("Härtung: /bin/bash, set -euo pipefail, umask 077, fester PATH, BASH_ENV/ENV entfernt — vor der SSH-Prüfung", () => {
    expect(QUELLTEXT.startsWith("#!/bin/bash\n")).toBe(true);
    const idx = (re) => QUELL_ZEILEN.findIndex((x) => re.test(x));
    const ssh = idx(/SSH_ORIGINAL_COMMAND:-/);
    for (const re of [/^set -euo pipefail$/, /^umask 077$/, /^export LC_ALL=C$/, /^PATH="\$\{INVENTUR_PRUEFPFAD:-\/usr\/sbin:\/usr\/bin:\/sbin:\/bin\}"$/, /^unset BASH_ENV ENV CDPATH$/]) {
      const i = idx(re);
      expect(i, String(re)).toBeGreaterThan(-1);
      expect(i, String(re)).toBeLessThan(ssh);
    }
  });
});

/* ------------------------------------------------------------------ */
describe("Anleitung: Prüfsummen und Forced-Command-Zeile", () => {
  const doku = readFileSync(path.join(WURZEL, "docs", "acc45", "VPS-ZUGANG-EINRICHTUNG.md"), "utf8");
  const summe = (rel) => createHash("sha256").update(readFileSync(path.join(WURZEL, rel), "utf8").replace(/\r\n/g, "\n")).digest("hex");

  it("nennt die aktuelle Prüfsumme jedes Skripts (und keine andere)", () => {
    const ist = {};
    for (const rel of ["deploy/inventur.sh", "deploy/inventur-sammler.sh", "deploy/inventur-lesen.sh"]) {
      ist[rel] = summe(rel);
      const soll = doku.match(new RegExp(`SHA-256 von ${rel.replace(/[.]/g, "\\.")}: \`([0-9a-f]{64})\``));
      expect(soll, `Zeile „SHA-256 von ${rel}“ fehlt`).not.toBeNull();
      expect(soll[1], rel).toBe(ist[rel]);
    }
    expect([...new Set(doku.match(/\b[0-9a-f]{64}\b/g))].sort()).toEqual(Object.values(ist).sort());
  });

  it("die authorized_keys-Zeile der Anleitung hat alle Einschränkungen und zeigt auf den root-eigenen Pfad", () => {
    expect(doku).toContain(INVENTUR_OPTIONEN);
    expect(doku).not.toMatch(/command="\/opt\/apps\/centric-dienstplanung\/inventur\.sh"/);
  });
});
