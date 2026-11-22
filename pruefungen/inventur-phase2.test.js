/* ==========================================================================
   INVENTUR PHASE 2 (REL-0, langfristig) — Sammler und Leser

   deploy/inventur-sammler.sh (root, Timer): ruft die Inventur auf, legt die
   Ausgabe ATOMAR als aktuell.txt ab (Temporärdatei im selben Verzeichnis,
   mv), Rechte 0640; bei Rückgabe außer 0/1 bleibt die alte Datei.
   deploy/inventur-lesen.sh (Forced Command des Kontos „inventur“): gibt
   nur diese eine Datei aus, keine Argumente, fremde SSH-Befehle → 2.

   Die Inventur wird für den Sammler durch ein Probeskript ersetzt; ein
   Kettentest nutzt das echte deploy/inventur.sh mit einem Docker-Stub, der
   immer scheitert (kein Docker nötig).

   Unter Linux (CI) läuft alles; der Leser läuft dort mit /bin/sh (dash).
   Unter Windows nur mit Git Bash; sonst übersprungen.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bashFinden, p, posixPfad, FREMDE_BEFEHLE, ohneKommentareUndZeichenketten } from "./inventur-hilfen.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMMLER = path.join(WURZEL, "deploy", "inventur-sammler.sh");
const LESER = path.join(WURZEL, "deploy", "inventur-lesen.sh");
const INVENTUR = path.join(WURZEL, "deploy", "inventur.sh");
const BASH = bashFinden();
const SH = process.platform === "win32" ? BASH : "sh";
const FESTER_PFAD = "/usr/sbin:/usr/bin:/sbin:/bin";
vi.setConfig({ testTimeout: 120000 });

const GEHEIM = "GEHEIM-PHASE2-424";

let tmp, ziel;

function schreiben(f, inhalt, ausfuehrbar = false) {
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, inhalt);
  if (ausfuehrbar) chmodSync(f, 0o755);
}

function sammler(env = {}, args = []) {
  const umgebung = { ...process.env, INVENTUR_PRUEFPFAD: FESTER_PFAD, INVENTUR_PRUEFZIEL: p(ziel), ...env };
  for (const n of ["SSH_ORIGINAL_COMMAND", "BASH_ENV", "ENV"]) if (!(n in env)) delete umgebung[n];
  const r = spawnSync(BASH, [p(SAMMLER), ...args], { encoding: "utf8", env: umgebung, timeout: 90000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function leser(env = {}, args = []) {
  const umgebung = { ...process.env, INVENTUR_PRUEFDATEI: p(path.join(ziel, "aktuell.txt")), ...env };
  if (!("SSH_ORIGINAL_COMMAND" in env)) delete umgebung.SSH_ORIGINAL_COMMAND;
  const r = spawnSync(SH, [p(LESER), ...args], { encoding: "utf8", env: umgebung, timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const PROBE_INVENTUR = [
  "#!/bin/bash",
  "printf '=== Kopf ===\\nInhalt %s\\n' \"${FAKE_TEXT:-probe}\"",
  '[ -n "${BASH_ENV:-}" ] && echo "BASH_ENV gesetzt"',
  '[ -n "${SSH_ORIGINAL_COMMAND:-}" ] && echo "SSH_ORIGINAL_COMMAND gesetzt"',
  'exit "${FAKE_RC:-0}"',
  "",
].join("\n");

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-inventur2-"));
  ziel = path.join(tmp, "var-lib-centric-inventur");
  mkdirSync(ziel);
  schreiben(path.join(tmp, "probe-inventur.sh"), PROBE_INVENTUR, true);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const probe = (env = {}) => ({ INVENTUR_PRUEFSKRIPT: p(path.join(tmp, "probe-inventur.sh")), ...env });
const inhalt = () => readFileSync(path.join(ziel, "aktuell.txt"), "utf8");

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur-sammler.sh", () => {
  it("Syntax, Aufruf: Argumente → 2, fehlendes Zielverzeichnis → 3 (legt es nicht an)", () => {
    expect(spawnSync(BASH, ["-n", p(SAMMLER)], { encoding: "utf8" }).status).toBe(0);
    expect(sammler(probe(), ["x"]).code).toBe(2);
    rmSync(ziel, { recursive: true });
    const r = sammler(probe());
    expect(r.code).toBe(3);
    expect(existsSync(ziel)).toBe(false);
  });

  it("legt die Ausgabe als aktuell.txt ab (0640), ohne Reste im Zielverzeichnis", () => {
    const r = sammler(probe({ FAKE_TEXT: "erster-lauf" }));
    expect(r.code, r.err).toBe(0);
    expect(inhalt()).toContain("=== Kopf ===\nInhalt erster-lauf\n");
    expect(inhalt()).toContain("=== Sammler: Inventur-Rückgabe 0 ===");
    expect(readdirSync(ziel)).toEqual(["aktuell.txt"]);
    if (process.platform !== "win32") expect(statSync(path.join(ziel, "aktuell.txt")).mode & 0o777).toBe(0o640);
  });

  it("Rückgabe 1 der Inventur (einzelne Abschnitte gescheitert) wird abgelegt und vermerkt", () => {
    expect(sammler(probe({ FAKE_RC: "1" })).code).toBe(0);
    expect(inhalt()).toContain("=== Sammler: Inventur-Rückgabe 1 ===");
  });

  it("andere Rückgabe → 4, alte Datei bleibt unverändert, keine Temporärdatei bleibt liegen", () => {
    writeFileSync(path.join(ziel, "aktuell.txt"), "ALTER STAND\n");
    for (const rc of ["2", "5", "127"]) {
      const r = sammler(probe({ FAKE_RC: rc, FAKE_TEXT: "neu" }));
      expect(r.code, rc).toBe(4);
      expect(inhalt()).toBe("ALTER STAND\n");
      expect(readdirSync(ziel)).toEqual(["aktuell.txt"]);
    }
  });

  it("ersetzt atomar: der zweite Lauf überschreibt den ersten vollständig", () => {
    sammler(probe({ FAKE_TEXT: "eins" }));
    sammler(probe({ FAKE_TEXT: "zwei" }));
    expect(inhalt()).toContain("Inhalt zwei");
    expect(inhalt()).not.toContain("Inhalt eins");
    expect(readdirSync(ziel)).toEqual(["aktuell.txt"]);
  });

  it("die Inventur läuft ohne BASH_ENV, ENV und SSH_ORIGINAL_COMMAND", () => {
    const marker = path.join(tmp, "marker.txt");
    schreiben(path.join(tmp, "boese.sh"), `printf '%s\\n' "$0" >>"${p(marker)}"\n`);
    const r = sammler(probe({ BASH_ENV: p(path.join(tmp, "boese.sh")), ENV: p(path.join(tmp, "boese.sh")), SSH_ORIGINAL_COMMAND: "id" }));
    expect(r.code, r.err).toBe(0);
    expect(inhalt()).not.toContain("BASH_ENV gesetzt");
    expect(inhalt()).not.toContain("SSH_ORIGINAL_COMMAND gesetzt");
    /* Der Sammler selbst liest BASH_ENV beim Start (Grenze von bash, dokumentiert); die Inventur nicht. */
    const m = existsSync(marker) ? readFileSync(marker, "utf8") : "";
    expect(m).not.toContain("probe-inventur");
  });

  it("Kette mit dem echten inventur.sh (Docker scheitert): .env nur als Namen, Ablage, Leser gibt sie aus", () => {
    const app = path.join(tmp, "app");
    const bin = path.join(tmp, "bin");
    schreiben(path.join(app, ".env"), `IMAGE_DIGEST=sha256:${"a".repeat(64)}\nCENTRIC_SMTP_PASSWORT=${GEHEIM}\n`);
    mkdirSync(path.join(app, "data"));
    schreiben(path.join(bin, "docker"), "#!/bin/sh\necho 'Cannot connect to the Docker daemon' >&2\nexit 1\n", true);
    /* Kopie OHNE Ausführungsrecht: der Sammler startet die Inventur über /bin/bash (CI-Befund Rückgabe 126). */
    const kopie = path.join(tmp, "centric-inventur.sh");
    writeFileSync(kopie, readFileSync(INVENTUR));
    chmodSync(kopie, 0o644);
    const r = sammler({
      INVENTUR_PRUEFSKRIPT: p(kopie),
      INVENTUR_PRUEFPFAD: `${posixPfad(bin)}:${FESTER_PFAD}`,
      CENTRIC_VERZ: p(app),
      CENTRIC_KONTO_HOME: p(path.join(tmp, "heim")),
      CENTRIC_HOME_WURZEL: p(path.join(tmp, "keine")),
    });
    expect(r.code, r.err).toBe(0);
    const t = inhalt();
    expect(t).toContain("=== V-6");
    expect(t).toContain("CENTRIC_SMTP_PASSWORT");
    expect(t).not.toContain(GEHEIM);
    expect(t).toContain("=== Sammler: Inventur-Rückgabe 1 ===");
    const l = leser({ SSH_ORIGINAL_COMMAND: "inventur" });
    expect(l.code).toBe(0);
    expect(l.out).toBe(t);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("deploy/inventur-lesen.sh", () => {
  it("Syntax (sh -n); gibt genau die abgelegte Datei aus (leer oder 'inventur')", () => {
    expect(spawnSync(SH, ["-n", p(LESER)], { encoding: "utf8" }).status).toBe(0);
    writeFileSync(path.join(ziel, "aktuell.txt"), "=== Kopf ===\nmaskierte Inventur\n");
    for (const env of [{}, { SSH_ORIGINAL_COMMAND: "" }, { SSH_ORIGINAL_COMMAND: "inventur" }]) {
      const r = leser(env);
      expect(r.code).toBe(0);
      expect(r.out).toBe("=== Kopf ===\nmaskierte Inventur\n");
    }
  });

  it("SSH-Sitzung (SSH_CONNECTION): INVENTUR_PRUEFDATEI wird verworfen, es gilt nur die feste Datei", () => {
    writeFileSync(path.join(ziel, "aktuell.txt"), "UMGELENKTE-DATEI\n");
    const r = leser({ SSH_CONNECTION: "203.0.113.5 50000 192.0.2.10 22", SSH_ORIGINAL_COMMAND: "inventur" });
    expect(r.out).not.toContain("UMGELENKTE-DATEI");
    expect(r.code).toBe(existsSync("/var/lib/centric-inventur/aktuell.txt") ? 0 : 1);
  });

  it("keine Datei → Rückgabe 1; Argumente → Rückgabe 2", () => {
    expect(leser().code).toBe(1);
    writeFileSync(path.join(ziel, "aktuell.txt"), "x\n");
    const r = leser({}, ["/etc/passwd"]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
  });

  it("fremde SSH-Befehle → Rückgabe 2, nichts auf stdout", () => {
    writeFileSync(path.join(ziel, "aktuell.txt"), "INHALT-DER-INVENTUR\n");
    for (const befehl of FREMDE_BEFEHLE) {
      const r = leser({ SSH_ORIGINAL_COMMAND: befehl });
      expect(r.code, JSON.stringify(befehl)).toBe(2);
      expect(r.out, JSON.stringify(befehl)).toBe("");
      expect(r.err, JSON.stringify(befehl)).toContain("abgewiesen");
    }
  });
});

/* ------------------------------------------------------------------ */
describe("Phase 2: Quelltext-Wächter", () => {
  const sammlerText = readFileSync(SAMMLER, "utf8");
  const leserText = readFileSync(LESER, "utf8");
  const sCode = ohneKommentareUndZeichenketten(sammlerText);
  const lCode = ohneKommentareUndZeichenketten(leserText);

  it("Leser: /bin/sh, fester PATH ohne Prüfvariable, ENV/BASH_ENV entfernt, einziger Befehl ist cat auf die feste Datei", () => {
    expect(leserText.startsWith("#!/bin/sh\n")).toBe(true);
    expect(leserText).toMatch(/^PATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin$/m);
    expect(leserText).toMatch(/^unset ENV BASH_ENV CDPATH$/m);
    expect(leserText).toMatch(/^DATEI="\$\{INVENTUR_PRUEFDATEI:-\/var\/lib\/centric-inventur\/aktuell\.txt\}"$/m);
    expect(leserText).toMatch(/^exec cat -- "\$DATEI"$/m);
    /* außer Shell-Bausteinen nur printf und das eine exec cat */
    expect(lCode).not.toMatch(/\b(docker|rm|mv|cp|tee|sed|awk|grep|head|tail|ls|find|eval|source|sudo|su|sh|bash)\b\s/);
    expect(lCode.match(/\bexec\b/g)).toHaveLength(1);
    expect(lCode.match(/\bcat\b/g)).toHaveLength(1);
    expect(lCode).not.toMatch(/>(?!&2)/);
    const zeilen = leserText.split("\n");
    expect(zeilen.findIndex((z) => z.includes("SSH_ORIGINAL_COMMAND:-"))).toBeLessThan(zeilen.findIndex((z) => z.startsWith("DATEI=")));
  });

  it("Sammler: schreibt nur in die Temporärdatei im Zielverzeichnis und benennt sie atomar um; kein Docker", () => {
    expect(sammlerText.startsWith("#!/bin/bash\n")).toBe(true);
    expect(sammlerText).toMatch(/^tmp="\$\(mktemp "\$ZIEL_VERZ\/\.aktuell\.XXXXXX"\)"$/m);
    expect(sammlerText).toMatch(/^mv -f -- "\$tmp" "\$ZIEL_VERZ\/aktuell\.txt"$/m);
    /* über /bin/bash, damit die Inventur auch ohne Ausführungsrecht der Datei läuft (CI-Befund Rückgabe 126) */
    expect(sammlerText).toContain('env -u BASH_ENV -u ENV -u SSH_ORIGINAL_COMMAND "${als[@]}" /bin/bash "$INVENTUR" >"$tmp" 2>&1 || rc=$?');
    /* als root nie die Inventur als root: runuser auf den Besitzer des Betriebsverzeichnisses, root als Besitzer → Abbruch */
    expect(sammlerText).toContain('als=(runuser -u "$konto" --)');
    expect(sammlerText).toMatch(/if \[\[ -z "\$konto" \|\| "\$konto" == "root" \|\| "\$konto" == "UNKNOWN" \]\]; then\n[^\n]*\n\s+exit 5/);
    expect(sammlerText).toMatch(/^chmod 0640 "\$tmp"$/m);
    expect(sCode).not.toMatch(/\bdocker\b/);
    expect(sCode).not.toMatch(/\b(rm|cp|tee|install|mkdir|ln|dd|truncate|eval|source)\b\s/);
    /* jede Umlenkung in eine Datei zielt auf "$tmp" (sonst nur >&2 und 2>&1) */
    const rest = sammlerText
      .split("\n")
      .filter((x) => !/^\s*#/.test(x))
      .join("\n")
      .replace(/>>?"\$tmp"/g, "")
      .replace(/2>&1|>&2/g, "");
    expect(ohneKommentareUndZeichenketten(rest)).not.toMatch(/>/);
  });
});
