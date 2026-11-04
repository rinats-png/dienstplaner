/* ==========================================================================
   DEPLOY-SKRIPTE (WP-03) — Rücksprung nur über verifizierte Digests, R0

   Geprüft werden deploy/digest-pruefen.sh, deploy/ruecksprung.sh und
   deploy/abschalten.sh gegen einen Docker-Stub: ein falsches `docker` im
   PATH, das jeden Aufruf protokolliert und Antworten aus einem
   Zustandsverzeichnis liefert. Es läuft kein echter Container, es wird
   nichts gezogen, keine reale .env berührt.

   Unter Linux (CI) läuft alles. Unter Windows nur, wenn Git Bash gefunden
   wird (CENTRIC_BASH oder der Standardpfad); sonst wird übersprungen —
   die CI („Betrieb: Deploy-Skripte“) ist dann maßgeblich.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOY = path.join(WURZEL, "deploy");
const REPO = "ghcr.io/rinats-png/dienstplaner";

function bashFinden() {
  if (process.env.CENTRIC_BASH) return process.env.CENTRIC_BASH;
  if (process.platform !== "win32") return "bash";
  const git = "C:/Program Files/Git/bin/bash.exe";
  return existsSync(git) ? git : null;
}
const BASH = bashFinden();
const p = (x) => x.replace(/\\/g, "/");

/* Digests: echt aus der Liste und erfundene für die Probelisten. */
const H8 = "sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f";
const H8_COMMIT = "274bfa0baca5681f383eea334aab69875f31d5c1";
const P00 = "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79";
const ALT_PRAEFIX = "sha256:0861adee";
const A = "sha256:" + "a".repeat(64);
const B = "sha256:" + "b".repeat(64);
const C = "sha256:" + "c".repeat(64);
const COMMIT_A = "1".repeat(40);
const COMMIT_B = "2".repeat(40);
const ID_A = "sha256:" + "1a".repeat(32);
const ID_B = "sha256:" + "1b".repeat(32);

const STUB = `#!/usr/bin/env bash
# Docker-Stub für die Deploy-Prüfungen. Zustand liegt in $STUB_DIR.
z="$STUB_DIR"
printf '%s\\n' "$*" >>"$z/aufrufe.log"
if [[ -f "$z/docker_tot" ]]; then
  echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2
  exit 1
fi
case "$1" in
  info) echo "stub-info" ;;
  ps)
    c="$z/container"
    if [[ -f "$z/ps_luegt" ]]; then echo "Up 3 seconds"; exit 0; fi
    if [[ -f "$z/ps_ausgabe" ]]; then cat "$z/ps_ausgabe"; exit 0; fi
    if [[ -f "$c/status" ]]; then
      case "$(cat "$c/status")" in
        running) echo "Up 5 minutes (healthy)" ;;
        *) echo "Exited (0) 1 second ago" ;;
      esac
    fi ;;
  image)
    fmt="$4"; ref="$5"; hex="\${ref##*@sha256:}"; d="$z/bilder/$hex"
    if [[ ! -d "$d" ]]; then echo "Error: No such image: $ref" >&2; exit 1; fi
    case "$fmt" in
      *revision*) if [[ -f "$d/label" ]]; then cat "$d/label"; else echo "<no value>"; fi ;;
      *.Id*) cat "$d/id" ;;
      *) echo "stub: unbekanntes Format $fmt" >&2; exit 9 ;;
    esac ;;
  inspect)
    fmt="$3"; c="$z/container"
    if [[ -f "$z/inspect_fehler" ]]; then echo "permission denied while trying to connect" >&2; exit 1; fi
    [[ -f "$z/inspect_warnung" ]] && echo 'WARNING: Error loading config file: "/root/.docker/config.json"' >&2
    if [[ ! -f "$c/status" ]]; then
      if [[ -f "$z/klein_nicht_da" ]]; then echo "error: no such container: $4" >&2; else echo "Error: No such object: $4" >&2; fi
      exit 1
    fi
    case "$fmt" in
      *Health*) cat "$c/health" ;;
      *State.Status*)
        if [[ -f "$z/spaet_zaehler" ]]; then
          n=$(( $(cat "$z/spaet_zaehler") + 1 )); echo "$n" >"$z/spaet_zaehler"
          if (( n >= 2 )); then echo running >"$c/status"; echo 1 >"$c/restarts"; fi
        fi
        echo "$(cat "$c/status") $(cat "$c/restarts") $(cat "$c/image")" ;;
      *.Image*) cat "$c/image" ;;
      *) echo "stub: unbekanntes Format $fmt" >&2; exit 9 ;;
    esac ;;
  compose)
    shift; proj=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --project-directory) proj="$2"; shift 2 ;;
        -f) shift 2 ;;
        *) break ;;
      esac
    done
    c="$z/container"; mkdir -p "$c"
    case "$1" in
      up)
        [[ -f "$z/up_fehler" ]] && { echo "stub: up scheitert" >&2; exit 1; }
        printf '%s\\n' "\${IMAGE_DIGEST:-<nicht gesetzt>}" >"$z/up_env"
        # wie Compose: eine Variable aus der Umgebung geht der .env vor
        if [[ -n "\${IMAGE_DIGEST:-}" ]]; then dg="$IMAGE_DIGEST"; else dg="$(grep '^IMAGE_DIGEST=' "$proj/.env" | tail -n1 | cut -d= -f2)"; fi
        hex="\${dg#sha256:}"
        if [[ -f "$z/falsches_bild" ]]; then cat "$z/falsches_bild" >"$c/image"; else cat "$z/bilder/$hex/id" >"$c/image"; fi
        echo running >"$c/status"; [[ -f "$c/restarts" ]] || echo 0 >"$c/restarts"
        if [[ -f "$z/health_nach_up" ]]; then cp "$z/health_nach_up" "$c/health"; else echo healthy >"$c/health"; fi ;;
      stop)
        [[ -f "$z/stop_fehler" ]] && { echo "stub: compose stop scheitert" >&2; exit 1; }
        if [[ -f "$z/neustart_nach_stop" ]]; then echo running >"$c/status"; echo 1 >"$c/restarts"; else echo exited >"$c/status"; fi
        [[ -f "$z/neustart_spaeter" ]] && echo 0 >"$z/spaet_zaehler"
        [[ -f "$z/verschwindet_nach_stop" ]] && rm -f "$c/status"
        true ;;
      *) echo "stub: compose $1 nicht nachgebildet" >&2; exit 9 ;;
    esac ;;
  stop)
    echo exited >"$z/container/status" ;;
  pull)
    echo "stub: pull ist verboten" >&2; exit 99 ;;
  *) echo "stub: docker $1 nicht nachgebildet" >&2; exit 9 ;;
esac
`;

function liste(zeilen) {
  return [
    "# Probeliste",
    "",
    "| Digest | Commit | Datum | Abnahmebericht | Status | Grund |",
    "|---|---|---|---|---|---|",
    ...zeilen.map(([d, c, s, g = ""]) => `| \`${d}\` | \`${c}\` | 2026-11-01 | docs/probe.md | ${s} | ${g} |`),
    "",
  ].join("\n");
}

let tmp, stubDir, verz, bin;

function bild(digest, id, label) {
  const d = path.join(stubDir, "bilder", digest.slice(7));
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, "id"), id + "\n");
  if (label !== undefined) writeFileSync(path.join(d, "label"), label + "\n");
}

function container({ status = "running", health = "healthy", image = ID_A, restarts = 0 } = {}) {
  const c = path.join(stubDir, "container");
  mkdirSync(c, { recursive: true });
  writeFileSync(path.join(c, "status"), status + "\n");
  writeFileSync(path.join(c, "health"), health + "\n");
  writeFileSync(path.join(c, "image"), image + "\n");
  writeFileSync(path.join(c, "restarts"), restarts + "\n");
}

function lauf(skript, args = [], { freigaben, env = {} } = {}) {
  const umgebung = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    STUB_DIR: p(stubDir),
    CENTRIC_VERZ: p(verz),
    CENTRIC_FREIGABEN: p(freigaben ?? path.join(verz, "FREIGEGEBENE-IMAGES.md")),
    CENTRIC_WARTEZEIT: "4",
    CENTRIC_TAKT: "1",
    CENTRIC_NACHBEOBACHTUNG: "0",
    ...env,
  };
  for (const n of ["IMAGE_DIGEST", "IMAGE_TAG"]) if (!(n in env)) delete umgebung[n];
  const r = spawnSync(BASH, [p(path.join(DEPLOY, skript)), ...args], { encoding: "utf8", env: umgebung });
  return { code: r.status, out: r.stdout, err: r.stderr, alles: r.stdout + r.stderr };
}

const aufrufe = () => {
  const f = path.join(stubDir, "aufrufe.log");
  return existsSync(f) ? readFileSync(f, "utf8") : "";
};
const lesen = (f) => readFileSync(path.join(verz, f), "utf8");
const protokoll = () => (existsSync(path.join(verz, "betrieb-protokoll.log")) ? lesen("betrieb-protokoll.log") : "");

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-deploy-"));
  stubDir = path.join(tmp, "stub");
  verz = path.join(tmp, "app");
  bin = path.join(tmp, "bin");
  for (const d of [stubDir, verz, bin]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(bin, "docker"), STUB);
  chmodSync(path.join(bin, "docker"), 0o755);
  writeFileSync(path.join(verz, "compose.yml"), "# Stub liest diese Datei nicht\n");
  writeFileSync(path.join(verz, ".env"), `CENTRIC_PFEFFER=nur-probe\nIMAGE_DIGEST=${A}\nCENTRIC_AUFRAEUMEN=aus\n`);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
describe("compose.yml: Bild nur per Digest", () => {
  const compose = readFileSync(path.join(DEPLOY, "compose.yml"), "utf8");

  it("verlangt IMAGE_DIGEST ohne Default", () => {
    expect(compose).toMatch(/image: ghcr\.io\/rinats-png\/dienstplaner@\$\{IMAGE_DIGEST:\?[^}]+\}/);
  });

  it("zieht nie selbst (pull_policy: never)", () => {
    expect(compose).toMatch(/^\s+pull_policy: never\s*$/m);
  });

  it(".env.example kennt kein IMAGE_TAG/latest mehr, nur IMAGE_DIGEST", () => {
    const beispiel = readFileSync(path.join(WURZEL, ".env.example"), "utf8");
    expect(beispiel).not.toMatch(/^\s*IMAGE_TAG=/m);
    expect(beispiel).toMatch(/^IMAGE_DIGEST=sha256:/m);
    expect(beispiel).not.toMatch(/^[^#]*latest/m);
  });

  it("kennt weder IMAGE_TAG noch latest als Bildquelle", () => {
    const image = compose.split("\n").filter((z) => /^\s*image:/.test(z));
    expect(image).toHaveLength(1);
    expect(image[0]).not.toMatch(/IMAGE_TAG|latest|:-/);
  });

  // Rot vorher: die compose.yml von Kette B (a379095) fiel ohne Variable auf latest.
  const alt = (() => {
    try {
      return execFileSync("git", ["show", "a379095:deploy/compose.yml"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  })();
  it.skipIf(alt === null)("Befund vorher belegt: alte compose.yml hatte den Default latest", () => {
    expect(alt).toContain("dienstplaner:${IMAGE_TAG:-latest}");
  });
});

/* ------------------------------------------------------------------ */
describe("FREIGEGEBENE-IMAGES.md (die echte Liste)", () => {
  const text = readFileSync(path.join(DEPLOY, "FREIGEGEBENE-IMAGES.md"), "utf8");
  const zeilen = text
    .split("\n")
    .filter((z) => /^\|\s*`sha256:/.test(z))
    .map((z) => z.split("|").slice(1, 7).map((f) => f.replace(/`/g, "").trim()));

  it("führt H8+ als aktiv, f03a8514 und 0861adee als gesperrt", () => {
    const nach = Object.fromEntries(zeilen.map((z) => [z[0], z]));
    expect(nach[H8][1]).toBe(H8_COMMIT);
    expect(nach[H8][4]).toBe("aktiv");
    expect(nach[P00][4]).toBe("gesperrt");
    expect(nach[P00][5]).toMatch(/P0-0/);
    expect(nach[ALT_PRAEFIX][4]).toBe("gesperrt");
  });

  it("hat höchstens einen aktiv- und einen vorherig-Eintrag, nur gültige Status", () => {
    const status = zeilen.map((z) => z[4]);
    for (const s of status) expect(["aktiv", "vorherig", "gesperrt"]).toContain(s);
    expect(status.filter((s) => s === "aktiv").length).toBe(1);
    expect(status.filter((s) => s === "vorherig").length).toBeLessThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("digest-pruefen.sh", { timeout: 60_000 }, () => {
  const echt = path.join(DEPLOY, "FREIGEGEBENE-IMAGES.md");

  it("lässt das aktive H8+-Bild mit passendem Label zu", () => {
    bild(H8, ID_A, H8_COMMIT);
    const r = lauf("digest-pruefen.sh", [H8], { freigaben: echt });
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toContain("in Ordnung");
  });

  it("lehnt den gesperrten Digest f03a8514 (P0-0) ab — auch wenn das Bild lokal liegt", () => {
    bild(P00, ID_B, "64d08a4957c5374e1f04c17be2b75162c07573d2");
    const r = lauf("digest-pruefen.sh", [P00], { freigaben: echt });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/GESPERRT/);
    expect(r.err).toMatch(/P0-0/);
    expect(r.err).toMatch(/abschalten\.sh/);
  });

  it("lehnt jeden Digest mit dem gesperrten Präfix 0861adee ab", () => {
    const d = ALT_PRAEFIX + "f".repeat(56);
    const r = lauf("digest-pruefen.sh", [d], { freigaben: echt });
    expect(r.code).toBe(3);
  });

  it("lehnt ein freigegebenes Digest ab, dessen Bild-ID gesperrt ist", () => {
    bild(H8, ALT_PRAEFIX + "0".repeat(56), H8_COMMIT);
    const r = lauf("digest-pruefen.sh", [H8], { freigaben: echt });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/Bild-ID .* GESPERRT/);
  });

  it("lehnt einen unbekannten Digest ab", () => {
    bild(C, ID_A, COMMIT_A);
    const r = lauf("digest-pruefen.sh", [C], { freigaben: echt });
    expect(r.code).toBe(4);
    expect(r.err).toMatch(/steht nicht in/);
  });

  it("lehnt Tags und kaputte Digests ab, ohne Docker zu fragen", () => {
    for (const w of ["latest", `${H8_COMMIT}`, `${H8_COMMIT}@${H8}`, "sha256:0b19", H8.toUpperCase()]) {
      const r = lauf("digest-pruefen.sh", [w], { freigaben: echt });
      expect(r.code, w).toBe(2);
    }
    expect(lauf("digest-pruefen.sh", [], { freigaben: echt }).code).toBe(2);
    expect(aufrufe()).toBe("");
  });

  it("lehnt ein Bild ab, das lokal nicht vorliegt — und zieht es nicht", () => {
    const r = lauf("digest-pruefen.sh", [H8], { freigaben: echt });
    expect(r.code).toBe(5);
    expect(aufrufe()).not.toMatch(/^pull/m);
  });

  it("lehnt ein falsches Revision-Label ab, auch mit --ohne-label", () => {
    bild(H8, ID_A, COMMIT_B);
    expect(lauf("digest-pruefen.sh", [H8], { freigaben: echt }).code).toBe(6);
    const r = lauf("digest-pruefen.sh", [H8, "--ohne-label"], { freigaben: echt });
    expect(r.code).toBe(6);
    expect(r.err).toMatch(/passt nicht/);
  });

  it("lehnt ein fehlendes Label ab; nur --ohne-label lässt es mit Warnung zu", () => {
    bild(H8, ID_A); // kein Label (Bilder vor WP-03)
    const ohne = lauf("digest-pruefen.sh", [H8], { freigaben: echt });
    expect(ohne.code).toBe(6);
    const mit = lauf("digest-pruefen.sh", [H8, "--ohne-label"], { freigaben: echt });
    expect(mit.code, mit.alles).toBe(0);
    expect(mit.err).toMatch(/WARNUNG/);
  });

  it("verweigert alles bei einer fehlerhaften Liste (zwei aktiv)", () => {
    writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[A, COMMIT_A, "aktiv"], [B, COMMIT_B, "aktiv"]]));
    bild(A, ID_A, COMMIT_A);
    expect(lauf("digest-pruefen.sh", [A]).code).toBe(4);
  });

  it("verweigert gesperrte Einträge ohne Grund als fehlerhafte Liste", () => {
    writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[A, COMMIT_A, "aktiv"], [B, COMMIT_B, "gesperrt", ""]]));
    bild(A, ID_A, COMMIT_A);
    expect(lauf("digest-pruefen.sh", [A]).code).toBe(4);
  });

  it("meldet Docker nicht erreichbar (Exit 7) statt „nicht lokal“", () => {
    bild(H8, ID_A, H8_COMMIT);
    writeFileSync(path.join(stubDir, "docker_tot"), "");
    const r = lauf("digest-pruefen.sh", [H8], { freigaben: echt });
    expect(r.code).toBe(7);
    expect(r.err).toMatch(/Docker antwortet nicht/);
  });

  it("sperrt f03a8514 auch, wenn die Liste es nicht (mehr) führt — eingebaute Sperrliste", () => {
    writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[A, COMMIT_A, "aktiv"]]));
    bild(P00, ID_B, "64d08a4957c5374e1f04c17be2b75162c07573d2");
    const r = lauf("digest-pruefen.sh", [P00]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/fest eingebaut/);
    expect(lauf("digest-pruefen.sh", [ALT_PRAEFIX + "e".repeat(56)]).code).toBe(3);
  });

  it("sperrt f03a8514 auch, wenn es in der Liste als aktiv eingetragen wurde", () => {
    writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[P00, "64d08a4957c5374e1f04c17be2b75162c07573d2", "aktiv"]]));
    bild(P00, ID_B, "64d08a4957c5374e1f04c17be2b75162c07573d2");
    const r = lauf("digest-pruefen.sh", [P00]);
    expect([3, 4]).toContain(r.code);
    expect(r.err).toMatch(/gesperrt/i);
  });

  it("lehnt die ganze Liste ab, wenn eine sha256-Zeile nicht dem Format entspricht (fail-closed)", () => {
    bild(A, ID_A, COMMIT_A);
    const basis = liste([[A, COMMIT_A, "aktiv"]]);
    for (const kaputt of [
      `| sha256:${"d".repeat(64)} | \`${COMMIT_B}\` | 2026-11-01 | x | gesperrt | ohne Backticks |`,
      `| \`sha256:${"d".repeat(64)}\` | \`${COMMIT_B}\` | 2026-11-01 | gesperrt |`,
      `| \`sha256:${"d".repeat(64)}\` | \`${COMMIT_B}\` | 2026-11-01 | x | gesperrt | Grund | zu viel |`,
      `|\`sha256:XYZ\`| \`${COMMIT_B}\` | 2026-11-01 | x | gesperrt | Grund |`,
    ]) {
      writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), basis + kaputt + "\n");
      const r = lauf("digest-pruefen.sh", [A]);
      expect(r.code, kaputt).toBe(4);
      expect(r.err).toMatch(/Format/);
    }
  });

  it("lehnt aktiv/vorherig mit dem Commit eines gesperrten Standes ab", () => {
    writeFileSync(
      path.join(verz, "FREIGEGEBENE-IMAGES.md"),
      liste([[A, "64d08a4957c5374e1f04c17be2b75162c07573d2", "aktiv"]]),
    );
    bild(A, ID_A, "64d08a4957c5374e1f04c17be2b75162c07573d2");
    const r = lauf("digest-pruefen.sh", [A]);
    expect(r.code).toBe(4);
    expect(r.err).toMatch(/gesperrten Commit/);
  });

  it("lehnt ein Bild ab, dessen Label auf einen gesperrten Commit zeigt (auch mit --ohne-label)", () => {
    writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[A, COMMIT_A, "aktiv"]]));
    bild(A, ID_A, "64d08a4957c5374e1f04c17be2b75162c07573d2");
    const r = lauf("digest-pruefen.sh", [A, "--ohne-label"]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/GESPERRTEN Stand/);
  });

  it("verweigert bei fehlender Liste", () => {
    bild(A, ID_A, COMMIT_A);
    expect(lauf("digest-pruefen.sh", [A], { freigaben: path.join(verz, "gibt-es-nicht.md") }).code).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("ruecksprung.sh", { timeout: 60_000 }, () => {
  beforeEach(() => {
    // aktiv = B (läuft), vorherig = A (Ziel), gesperrt = P0-0
    writeFileSync(
      path.join(verz, "FREIGEGEBENE-IMAGES.md"),
      liste([[B, COMMIT_B, "aktiv"], [A, COMMIT_A, "vorherig"], [P00, "64d08a4957c5374e1f04c17be2b75162c07573d2", "gesperrt", "P0-0"]]),
    );
    writeFileSync(path.join(verz, ".env"), `CENTRIC_PFEFFER=nur-probe\nIMAGE_DIGEST=${B}\nCENTRIC_AUFRAEUMEN=aus\n`);
    bild(A, ID_A, COMMIT_A);
    bild(B, ID_B, COMMIT_B);
    container({ image: ID_B });
  });

  it("springt auf vorherig: .env, compose up --pull never, healthy, Digest, Protokoll", () => {
    const r = lauf("ruecksprung.sh");
    expect(r.code, r.alles).toBe(0);
    expect(lesen(".env")).toBe(`CENTRIC_PFEFFER=nur-probe\nIMAGE_DIGEST=${A}\nCENTRIC_AUFRAEUMEN=aus\n`);
    const sicherungen = readdirSync(verz).filter((f) => f.startsWith(".env.vor-ruecksprung-"));
    expect(sicherungen).toHaveLength(1);
    expect(lesen(sicherungen[0])).toContain(`IMAGE_DIGEST=${B}`);
    const log = aufrufe();
    expect(log).toMatch(new RegExp(`^compose --project-directory \\S+ -f \\S+/compose\\.yml up -d --pull never centric-dp-web$`, "m"));
    expect(log).not.toMatch(/^pull/m);
    expect(log).not.toMatch(/latest/);
    expect(readFileSync(path.join(stubDir, "container", "image"), "utf8").trim()).toBe(ID_A);
    expect(protokoll()).toMatch(new RegExp(`start von=${B} nach=${A}`));
    expect(protokoll()).toMatch(/erfolgreich/);
  });

  it("--trocken ändert nichts: keine .env-Änderung, kein compose, kein Protokoll", () => {
    const vorher = lesen(".env");
    const r = lauf("ruecksprung.sh", ["--trocken"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toMatch(/TROCKENLAUF/);
    expect(r.out).toContain(A);
    expect(lesen(".env")).toBe(vorher);
    expect(readdirSync(verz).filter((f) => f.startsWith(".env."))).toEqual([]);
    expect(aufrufe()).not.toMatch(/^compose/m);
    expect(aufrufe()).not.toMatch(/^stop/m);
    expect(protokoll()).toBe("");
    expect(readFileSync(path.join(stubDir, "container", "image"), "utf8").trim()).toBe(ID_B);
  });

  it("verweigert, wenn es keinen Eintrag vorherig gibt (echte Liste) und verweist auf R0", () => {
    bild(H8, ID_A, H8_COMMIT);
    const vorher = lesen(".env");
    const r = lauf("ruecksprung.sh", [], { freigaben: path.join(DEPLOY, "FREIGEGEBENE-IMAGES.md") });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/VERWEIGERT/);
    expect(r.err).toMatch(/R0/);
    expect(lesen(".env")).toBe(vorher);
    expect(aufrufe()).not.toMatch(/^compose/m);
  });

  it("verweigert ein vorherig, das per Sperrliste gesperrt ist (f03a8514)", () => {
    writeFileSync(
      path.join(verz, "FREIGEGEBENE-IMAGES.md"),
      liste([[B, COMMIT_B, "aktiv"], [P00, "64d08a4957c5374e1f04c17be2b75162c07573d2", "vorherig"], [P00.slice(0, 15), "64d08a4", "gesperrt", "P0-0"]]),
    );
    bild(P00, ID_A, "64d08a4957c5374e1f04c17be2b75162c07573d2");
    const vorher = lesen(".env");
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/gesperrt/);
    expect(r.err).toMatch(/abschalten\.sh/);
    expect(lesen(".env")).toBe(vorher);
    expect(aufrufe()).not.toMatch(/^compose/m);
  });

  it("verweigert, wenn das Ziel ein falsches Label trägt", () => {
    bild(A, ID_A, COMMIT_B);
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(3);
    expect(aufrufe()).not.toMatch(/^compose/m);
  });

  it("verweigert eine .env, die noch IMAGE_TAG enthält (Migration nötig)", () => {
    writeFileSync(path.join(verz, ".env"), `IMAGE_TAG=${H8_COMMIT}@${H8}\n`);
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(4);
    expect(r.err).toMatch(/IMAGE_TAG/);
    expect(aufrufe()).not.toMatch(/^compose/m);
  });

  it("meldet einen Fehlschlag mit R0-Hinweis, wenn der Container unhealthy wird", () => {
    writeFileSync(path.join(stubDir, "health_nach_up"), "unhealthy\n");
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/FEHLGESCHLAGEN/);
    expect(r.err).toMatch(/abschalten\.sh/);
    expect(protokoll()).toMatch(/fehlgeschlagen/);
    expect(aufrufe()).not.toMatch(/^stop/m); // kein automatisches Anhalten, keine Automatik
  });

  it("meldet einen Fehlschlag, wenn nach dem Start ein anderes Bild läuft", () => {
    writeFileSync(path.join(stubDir, "falsches_bild"), ID_B + "\n");
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/nicht das Ziel/);
  });

  it("meldet einen Fehlschlag, wenn der Container nicht rechtzeitig healthy wird", () => {
    writeFileSync(path.join(stubDir, "health_nach_up"), "starting\n");
    const r = lauf("ruecksprung.sh", [], { env: { CENTRIC_WARTEZEIT: "1" } });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/nicht healthy/);
  });

  it("meldet einen Fehlschlag bei einem Container ohne Healthcheck", () => {
    writeFileSync(path.join(stubDir, "health_nach_up"), "ohne-healthcheck\n");
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/ohne-healthcheck/);
  });

  it("bricht ab, wenn IMAGE_DIGEST in der Shell gesetzt ist (ginge der .env vor)", () => {
    const vorher = lesen(".env");
    for (const wert of [B, ""]) {
      const r = lauf("ruecksprung.sh", [], { env: { IMAGE_DIGEST: wert } });
      expect(r.code).toBe(4);
      expect(r.err).toMatch(/in der Shell gesetzt/);
    }
    expect(lesen(".env")).toBe(vorher);
    expect(aufrufe()).not.toMatch(/^compose/m);
  });

  it("übergibt IMAGE_DIGEST beim Start ausdrücklich (Ziel läuft, auch wenn .env-Lesen abwiche)", () => {
    const r = lauf("ruecksprung.sh");
    expect(r.code, r.alles).toBe(0);
    expect(readFileSync(path.join(stubDir, "up_env"), "utf8").trim()).toBe(A);
    expect(readFileSync(path.join(stubDir, "container", "image"), "utf8").trim()).toBe(ID_A);
  });

  it("ersetzt export- und mehrfache IMAGE_DIGEST-Zeilen durch genau eine", () => {
    writeFileSync(
      path.join(verz, ".env"),
      `CENTRIC_PFEFFER=nur-probe\nexport IMAGE_DIGEST=${B}\nX=1\n  IMAGE_DIGEST=${C}\nCENTRIC_AUFRAEUMEN=aus\n`,
    );
    const r = lauf("ruecksprung.sh");
    expect(r.code, r.alles).toBe(0);
    expect(lesen(".env")).toBe(`CENTRIC_PFEFFER=nur-probe\nIMAGE_DIGEST=${A}\nX=1\nCENTRIC_AUFRAEUMEN=aus\n`);
    expect(protokoll()).toMatch(new RegExp(`start von=${C} nach=${A}`)); // letzte Zuweisung galt
  });

  it("hinterlässt keine .env.neu.*-Reste, weder nach Erfolg noch nach Fehlschlag", () => {
    expect(lauf("ruecksprung.sh").code).toBe(0);
    writeFileSync(path.join(stubDir, "up_fehler"), "");
    expect(lauf("ruecksprung.sh").code).toBe(1);
    expect(readdirSync(verz).filter((f) => f.startsWith(".env.neu."))).toEqual([]);
  });

  it("verweigert, wenn Docker nicht erreichbar ist — .env bleibt unverändert", () => {
    const vorher = lesen(".env");
    writeFileSync(path.join(stubDir, "docker_tot"), "");
    const r = lauf("ruecksprung.sh");
    expect(r.code).toBe(3);
    expect(lesen(".env")).toBe(vorher);
  });
});

/* ------------------------------------------------------------------ */
describe.skipIf(!BASH)("abschalten.sh (R0)", { timeout: 60_000 }, () => {
  beforeEach(() => container({ image: ID_B }));

  it("hält den Dienst mit docker compose stop an, prüft den Zustand und protokolliert", () => {
    const r = lauf("abschalten.sh");
    expect(r.code, r.alles).toBe(0);
    expect(aufrufe()).toMatch(/^compose --project-directory \S+ -f \S+\/compose\.yml stop centric-dp-web$/m);
    expect(aufrufe()).toMatch(/^inspect --format .*State\.Status/m);
    expect(readFileSync(path.join(stubDir, "container", "status"), "utf8").trim()).toBe("exited");
    expect(r.out).toMatch(/R0 erreicht/);
    expect(r.out).toMatch(/Wiederinbetriebnahme/);
    expect(r.out).toMatch(/digest-pruefen\.sh/);
    expect(protokoll()).toMatch(/R0 erreicht/);
  });

  it("weicht auf docker stop aus, wenn Compose scheitert (z. B. .env ohne IMAGE_DIGEST)", () => {
    writeFileSync(path.join(stubDir, "stop_fehler"), "");
    const r = lauf("abschalten.sh");
    expect(r.code, r.alles).toBe(0);
    expect(aufrufe()).toMatch(/^stop centric-dp-web$/m);
    expect(r.err).toMatch(/WARNUNG/);
  });

  it("erkennt, wenn der Container wieder anläuft", () => {
    writeFileSync(path.join(stubDir, "neustart_nach_stop"), "");
    const r = lauf("abschalten.sh");
    expect(r.code).toBe(1);
    expect(protokoll()).toMatch(/FEHLGESCHLAGEN/);
  });

  it("--trocken hält nichts an und schreibt nichts", () => {
    const r = lauf("abschalten.sh", ["--trocken"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toMatch(/TROCKENLAUF/);
    expect(aufrufe()).not.toMatch(/^compose/m);
    expect(aufrufe()).not.toMatch(/^stop/m);
    expect(readFileSync(path.join(stubDir, "container", "status"), "utf8").trim()).toBe("running");
    expect(protokoll()).toBe("");
  });

  it("Docker nicht erreichbar → Exit 1, nie „R0 erreicht“", () => {
    writeFileSync(path.join(stubDir, "docker_tot"), "");
    for (const args of [[], ["--trocken"]]) {
      const r = lauf("abschalten.sh", args);
      expect(r.code, args.join(" ")).toBe(1);
      expect(r.alles).not.toMatch(/R0 erreicht/);
      expect(r.err).toMatch(/Docker antwortet nicht/);
    }
  });

  it("inspect scheitert aus anderem Grund als „nicht vorhanden“ → Exit 1", () => {
    writeFileSync(path.join(stubDir, "inspect_fehler"), "");
    const r = lauf("abschalten.sh");
    expect(r.code).toBe(1);
    expect(r.alles).not.toMatch(/R0 erreicht/);
    expect(aufrufe()).not.toMatch(/^compose/m);
  });

  it("erkennt einen verzögerten Wiederanlauf während der Nachbeobachtung", () => {
    writeFileSync(path.join(stubDir, "neustart_spaeter"), "");
    const r = lauf("abschalten.sh");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/wieder angelaufen|nicht angehalten/);
    expect(protokoll()).toMatch(/wieder angelaufen/);
  });

  it("ein nach dem Stopp verschwundener Container gilt nicht als angehalten", () => {
    writeFileSync(path.join(stubDir, "verschwindet_nach_stop"), "");
    const r = lauf("abschalten.sh");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/verschwunden/);
  });

  it("docker ps meldet „Up“, obwohl inspect „exited“ sagt → Exit 1", () => {
    writeFileSync(path.join(stubDir, "ps_luegt"), "");
    const r = lauf("abschalten.sh");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/docker ps meldet/);
    expect(aufrufe()).toMatch(/^ps -a --filter name=\^centric-dp-web\$ --format/m);
  });

  it("CLI-Warnungen auf stderr verfälschen das Parsen nicht", () => {
    writeFileSync(path.join(stubDir, "inspect_warnung"), "");
    const r = lauf("abschalten.sh");
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toMatch(/R0 erreicht/);
  });

  it("erkennt „no such container“ unabhängig von der Schreibweise (Container fehlte schon vorher)", () => {
    rmSync(path.join(stubDir, "container"), { recursive: true, force: true });
    writeFileSync(path.join(stubDir, "klein_nicht_da"), "");
    writeFileSync(path.join(stubDir, "verschwindet_nach_stop"), "");
    const r = lauf("abschalten.sh");
    expect(r.code, r.alles).toBe(0);
    expect(r.out).toMatch(/R0 erreicht/);
  });

  it("verlangt bei vorhandenem Container eine docker-ps-Antwort Exited/Created", () => {
    for (const [ausgabe, erwartet] of [
      ["", 1],
      ["Paused\n", 1],
      ["Removal In Progress\n", 1],
      ["Created\n", 0],
      ["Exited (137) 2 seconds ago\n", 0],
    ]) {
      container({ image: ID_B });
      writeFileSync(path.join(stubDir, "ps_ausgabe"), ausgabe);
      const r = lauf("abschalten.sh");
      expect(r.code, JSON.stringify(ausgabe) + r.alles).toBe(erwartet);
    }
  });

  it("lehnt unbekannte Schalter ab, ohne etwas anzuhalten", () => {
    const r = lauf("abschalten.sh", ["--jetzt"]);
    expect(r.code).toBe(2);
    expect(aufrufe()).toBe("");
  });
});
