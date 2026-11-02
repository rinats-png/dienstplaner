/* ==========================================================================
   DEPLOY-AUTOMATIK (WP-31) — deploy/deploy.sh gegen einen Docker-Stub

   Wie pruefungen/deploy-skripte.test.js: ein falsches `docker` im PATH, das
   jeden Aufruf protokolliert und Antworten aus einem Zustandsverzeichnis
   liefert. Kein echter Container, kein Pull eines echten Bilds, keine reale
   .env. Dazu deploy-smoke.mjs gegen den echten server.mjs und
   deploy-abgleich.mjs gegen eine echte Sicherung (werkzeug/ablage-sicherung).

   Unter Windows nur mit Git Bash (CENTRIC_BASH oder Standardpfad).
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, spawnSync, execFileSync } from "node:child_process";
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
/* Git Bash unter Windows stellt /usr/bin vor den PATH — Ersatz für mv, cp,
   touch, df aus dem Stub-Verzeichnis greift dort nicht. Diese Prüfungen
   laufen in der CI (Linux). */
const FAKES_FEHLEN = process.platform === "win32";
const FLOCK = BASH ? spawnSync(BASH, ["-c", "command -v flock"], { encoding: "utf8" }).status === 0 : false;
const p = (x) => x.replace(/\\/g, "/");

const P00 = "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79";
const A = "sha256:" + "a".repeat(64);
const B = "sha256:" + "b".repeat(64);
const COMMIT_A = "1".repeat(40);
const COMMIT_B = "2".repeat(40);
const ID_A = "sha256:" + "1a".repeat(32);
const ID_B = "sha256:" + "1b".repeat(32);

const STUB = `#!/usr/bin/env bash
# Docker-Stub für deploy.sh. Zustand liegt in $STUB_DIR.
z="$STUB_DIR"
printf '%s\\n' "$*" >>"$z/aufrufe.log"
case "$1" in
  info) echo "stub-info" ;;
  ps)
    c="$z/container"
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
    if [[ ! -f "$c/status" ]]; then echo "Error: No such object: $4" >&2; exit 1; fi
    case "$fmt" in
      *Health*) cat "$c/health" ;;
      *State.Status*) echo "$(cat "$c/status") $(cat "$c/restarts") $(cat "$c/image")" ;;
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
        if [[ -n "\${IMAGE_DIGEST:-}" ]]; then dg="$IMAGE_DIGEST"; else dg="$(grep '^IMAGE_DIGEST=' "$proj/.env" | tail -n1 | cut -d= -f2)"; fi
        hex="\${dg#sha256:}"
        cat "$z/bilder/$hex/id" >"$c/image"
        echo running >"$c/status"; [[ -f "$c/restarts" ]] || echo 0 >"$c/restarts"
        if [[ -f "$z/health_nach_up" && "$dg" == "$(cat "$z/neues_digest" 2>/dev/null)" ]]; then cp "$z/health_nach_up" "$c/health"; else echo healthy >"$c/health"; fi
        if [[ -f "$z/schreibt_nach_up" ]]; then mkdir -p "$proj/data/centric"; echo neu >"$proj/data/centric/neu.json"; fi ;;
      stop) echo exited >"$c/status" ;;
      *) echo "stub: compose $1 nicht nachgebildet" >&2; exit 9 ;;
    esac ;;
  stop) echo exited >"$z/container/status" ;;
  pull)
    [[ -f "$z/pull_verboten" ]] && { echo "stub: pull verboten" >&2; exit 99; }
    hex="\${2##*@sha256:}"
    if [[ -d "$z/ziehbar/$hex" ]]; then mkdir -p "$z/bilder"; cp -r "$z/ziehbar/$hex" "$z/bilder/$hex"; echo "pulled"; else echo "stub: unbekannt" >&2; exit 1; fi ;;
  exec)
    cat >/dev/null
    if [[ -f "$z/smoke_fehler" ]]; then echo "FEHLER  GET /gesund: 500"; echo "SMOKE FEHLGESCHLAGEN (1)"; exit 1; fi
    echo "SMOKE OK" ;;
  logs) if [[ -f "$z/logs" ]]; then exec cat "$z/logs"; fi ;;
  run)
    shift; ep=""; sich=""; alles="$*"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --entrypoint) ep="$2"; shift 2; shift; break ;;
        -v) v="$2"; [[ "$v" == *:/sicherungen ]] && sich="\${v%:/sicherungen}"; shift 2 ;;
        *) shift ;;
      esac
    done
    case "$ep" in
      grep) [[ -f "$z/kennt_xff" ]] ;;
      node)
        case "$alles" in
          *" sichern "*)
            [[ -f "$z/sichern_fehler" ]] && { echo "stub: sichern scheitert" >&2; exit 1; }
            n="centric-sicherung-20261103T000000Z"; mkdir -p "$sich/$n"; touch "$sich/$n/FERTIG"
            echo "Sicherung vollständig: /sicherungen/$n"; echo "  3 Dateien, 300 Bytes" ;;
          *" pruefen "*) [[ -f "$z/pruefen_fehler" ]] && exit 1; echo "In Ordnung: 3 Dateien" ;;
          *deploy-abgleich*)
            if [[ -f "$z/abgleich_fehler" ]]; then echo '{"ok":false,"abweichend":1}'; exit 1; fi
            if [[ -f "$z/abgleich_nachstart" ]]; then echo '{"ok":true,"gleich":3,"nachStart":2}'; else echo '{"ok":true,"gleich":3,"nachStart":0}'; fi ;;
          *) echo "stub: run node unbekannt: $alles" >&2; exit 9 ;;
        esac ;;
      *) echo "stub: run $ep unbekannt" >&2; exit 9 ;;
    esac ;;
  *) echo "stub: docker $1 nicht nachgebildet" >&2; exit 9 ;;
esac
`;

function liste(zeilen) {
  return ["# Probeliste", "", "| Digest | Commit | Datum | Abnahmebericht | Status | Grund |", "|---|---|---|---|---|---|",
    ...zeilen.map(([d, c, s, g = ""]) => `| \`${d}\` | \`${c}\` | 2026-11-01 | docs/probe.md | ${s} | ${g} |`), ""].join("\n");
}

let tmp, stubDir, verz, bin;
const datei = (n) => path.join(stubDir, n);
const setze = (n, inhalt = "") => writeFileSync(datei(n), inhalt);

function bild(ort, digest, id, label) {
  const d = path.join(stubDir, ort, digest.slice(7));
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, "id"), id + "\n");
  if (label !== undefined) writeFileSync(path.join(d, "label"), label + "\n");
}

function lauf(args = [], env = {}) {
  const umgebung = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, STUB_DIR: p(stubDir),
    CENTRIC_VERZ: p(verz), CENTRIC_FREIGABEN: p(path.join(verz, "FREIGEGEBENE-IMAGES.md")),
    CENTRIC_WARTEZEIT: "90", CENTRIC_TAKT: "1", CENTRIC_NACHBEOBACHTUNG: "0",
    ...(FLOCK ? {} : { CENTRIC_OHNE_FLOCK: "1" }), ...env };
  for (const n of ["IMAGE_DIGEST", "IMAGE_TAG", "SSH_ORIGINAL_COMMAND"]) if (!(n in env)) delete umgebung[n];
  const r = spawnSync(BASH, [p(path.join(DEPLOY, "deploy.sh")), ...args], { encoding: "utf8", env: umgebung });
  return { code: r.status, alles: r.stdout + r.stderr };
}
const aufrufe = () => (existsSync(datei("aufrufe.log")) ? readFileSync(datei("aufrufe.log"), "utf8") : "");
const env = () => readFileSync(path.join(verz, ".env"), "utf8");
const protokoll = () => (existsSync(path.join(verz, "betrieb-protokoll.log")) ? readFileSync(path.join(verz, "betrieb-protokoll.log"), "utf8") : "");
const containerStatus = () => readFileSync(path.join(stubDir, "container", "status"), "utf8").trim();
const containerBild = () => readFileSync(path.join(stubDir, "container", "image"), "utf8").trim();
/** Ein Befehl im Stub-PATH, der scheitert, wenn sein letztes Argument passt; sonst der echte. */
function scheitert(befehl, muster) {
  writeFileSync(path.join(bin, befehl), `#!/usr/bin/env bash
for a in "$@"; do letzt="$a"; done
if [[ "$letzt" == ${muster} ]]; then echo "stub: ${befehl} scheitert" >&2; exit 1; fi
exec /usr/bin/${befehl} "$@"
`);
  chmodSync(path.join(bin, befehl), 0o755);
}
const kopien = () => readdirSync(verz).filter((f) => f.startsWith(".env.vor-deploy-"));
const ENV_START = `CENTRIC_PFEFFER=nur-probe\nIMAGE_DIGEST=${B}\nCENTRIC_VERTRAUTE_PROXYS=172.18.0.0/16\n`;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "centric-deploy-auto-"));
  stubDir = path.join(tmp, "stub");
  verz = path.join(tmp, "app");
  bin = path.join(tmp, "bin");
  for (const d of [stubDir, verz, bin, path.join(verz, "data"), path.join(stubDir, "container")]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(bin, "docker"), STUB);
  chmodSync(path.join(bin, "docker"), 0o755);
  writeFileSync(path.join(verz, "compose.yml"), "# Stub liest diese Datei nicht\n");
  writeFileSync(path.join(verz, ".env"), ENV_START);
  writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[A, COMMIT_A, "aktiv"], [B, COMMIT_B, "vorherig"]]));
  bild("bilder", A, ID_A, COMMIT_A);
  bild("bilder", B, ID_B, COMMIT_B);
  /* Der alte Stand läuft. */
  const c = path.join(stubDir, "container");
  writeFileSync(path.join(c, "status"), "running\n");
  writeFileSync(path.join(c, "health"), "healthy\n");
  writeFileSync(path.join(c, "image"), ID_B + "\n");
  writeFileSync(path.join(c, "restarts"), "0\n");
  setze("kennt_xff");
  setze("neues_digest", A);
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe.skipIf(!BASH)("deploy.sh gegen Docker-Stub", { timeout: 180000 }, () => {
  it("Erfolg: prüfen, anhalten, sichern, .env nur IMAGE_DIGEST, starten, healthy, Smoke, Log, Abgleich", () => {
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(0);
    expect(env()).toBe(ENV_START.replace(`IMAGE_DIGEST=${B}`, `IMAGE_DIGEST=${A}`));
    expect(kopien()).toHaveLength(1);
    expect(containerStatus()).toBe("running");
    expect(containerBild()).toBe(ID_A);
    const a = aufrufe();
    const reihe = ["compose --project-directory", " stop centric-dp-web", " sichern --quelle /data", " pruefen --sicherung",
      " up -d --pull never centric-dp-web", "exec -i centric-dp-web node", "logs --since", "/deploy-abgleich.mjs /sicherung /data"];
    let pos = -1;
    for (const t of reihe) { const i = a.indexOf(t, pos + 1); expect(i, t).toBeGreaterThan(pos); pos = i; }
    expect(a).not.toMatch(/^pull /m);                         // Bild lag lokal: kein Pull
    expect(a).toMatch(/run .*--network none .*-v [^ ]*data:\/data:ro/);
    expect(protokoll()).toMatch(/erfolgreich digest=sha256:a{64}/);
  });

  it("fehlt das Bild lokal: genau EIN Pull, und zwar per Digest", () => {
    rmSync(path.join(stubDir, "bilder", A.slice(7)), { recursive: true });
    bild("ziehbar", A, ID_A, COMMIT_A);
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(0);
    const pulls = aufrufe().split("\n").filter((z) => z.startsWith("pull "));
    expect(pulls).toEqual([`pull ${REPO}@${A}`]);
  });

  it("nicht healthy → R0 (abschalten.sh), kein Rücksprung ohne Schalter", () => {
    setze("health_nach_up", "unhealthy\n");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(containerStatus()).toBe("exited");
    expect(protokoll()).toMatch(/fehlgeschlagen, R0 erreicht/);
    expect(aufrufe()).not.toContain("exec -i");
  });

  it("Smoke-Fehler → R0", () => {
    setze("smoke_fehler");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(r.alles).toContain("SMOKE FEHLGESCHLAGEN");
    expect(containerStatus()).toBe("exited");
    expect(protokoll()).toMatch(/R0 erreicht/);
  });

  it("WARNUNG zu X-Forwarded-For im Log → R0", () => {
    setze("logs", "WARNUNG: Anfrage mit X-Forwarded-For, aber CENTRIC_VERTRAUTE_PROXYS ist leer.\n");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(containerStatus()).toBe("exited");
  });

  it("Manifestabgleich weicht ab → R0", () => {
    setze("abgleich_fehler");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(containerStatus()).toBe("exited");
  });

  it("--bei-fehler=ruecksprung: Smoke-Fehler → zurück auf vorherig (B), healthy", () => {
    setze("smoke_fehler");
    const r = lauf([A, "--bei-fehler=ruecksprung"]);
    expect(r.code, r.alles).toBe(1);
    expect(containerStatus()).toBe("running");
    expect(containerBild()).toBe(ID_B);
    expect(env()).toContain(`IMAGE_DIGEST=${B}`);
    expect(protokoll()).toMatch(/ruecksprung erfolgreich nach=sha256:b{64}/);
  });

  it("--bei-fehler=ruecksprung ohne vorherig → R0", () => {
    writeFileSync(path.join(verz, "FREIGEGEBENE-IMAGES.md"), liste([[A, COMMIT_A, "aktiv"]]));
    setze("smoke_fehler");
    const r = lauf([A, "--bei-fehler=ruecksprung"]);
    expect(r.code, r.alles).toBe(1);
    expect(r.alles).toMatch(/Kein zulässiges Rücksprungziel/);
    expect(containerStatus()).toBe("exited");
  });

  it("gesperrter Digest: abgelehnt, bevor Docker etwas tut", () => {
    const r = lauf([P00]);
    expect(r.code, r.alles).toBe(3);
    expect(r.alles).toMatch(/GESPERRT/);
    expect(aufrufe()).not.toMatch(/^(pull|compose|run|exec)/m);
    expect(env()).toBe(ENV_START);
    expect(containerStatus()).toBe("running");
  });

  it("nicht freigegebener Digest und Tag statt Digest: abgelehnt", () => {
    expect(lauf(["sha256:" + "c".repeat(64)]).code).toBe(4);
    expect(lauf(["latest"]).code).toBe(2);
    expect(env()).toBe(ENV_START);
  });

  it("Trockenlauf: keine Wirkung — kein Pull, kein Stop, keine .env, kein Protokoll", () => {
    rmSync(path.join(stubDir, "bilder", A.slice(7)), { recursive: true });
    bild("ziehbar", A, ID_A, COMMIT_A);
    const r = lauf([A, "--trocken"]);
    expect(r.code, r.alles).toBe(0);
    expect(r.alles).toContain("TROCKENLAUF");
    expect(aufrufe()).not.toMatch(/^(pull|compose|run|exec)/m);
    expect(env()).toBe(ENV_START);
    expect(kopien()).toEqual([]);
    expect(protokoll()).toBe("");
    expect(containerStatus()).toBe("running");
  });

  it("fehlende Proxy-Liste bei einem Bild, das sie kennt: Abbruch vor jedem Wechsel", () => {
    const ohne = ENV_START.replace(/^CENTRIC_VERTRAUTE_PROXYS=.*\n/m, "");
    writeFileSync(path.join(verz, ".env"), ohne);
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(4);
    expect(r.alles).toMatch(/CENTRIC_VERTRAUTE_PROXYS/);
    expect(aufrufe()).not.toMatch(/ stop | up -d|sichern/);
    expect(env()).toBe(ohne);
    expect(containerStatus()).toBe("running");
  });

  it("B1: leere Proxy-Liste bricht immer ab — auch bei einem Bild ohne WP-32b, auch im Trockenlauf", () => {
    rmSync(datei("kennt_xff"));
    for (const z of ["", "CENTRIC_VERTRAUTE_PROXYS=\n", "CENTRIC_VERTRAUTE_PROXYS=\"\"\n"]) {
      writeFileSync(path.join(verz, ".env"), ENV_START.replace(/^CENTRIC_VERTRAUTE_PROXYS=.*\n/m, z));
      for (const extra of [[], ["--trocken"]]) {
        const r = lauf([A, ...extra]);
        expect(r.code, JSON.stringify(z) + extra).toBe(4);
        expect(r.alles).toMatch(/Caddys feste Adresse/);
      }
    }
    expect(aufrufe()).not.toMatch(/ stop | up -d|sichern|^pull /m);
  });

  it("Bild ohne Vertrauensliste (vor WP-32b) mit gesetzter Liste: läuft", () => {
    rmSync(datei("kennt_xff"));
    expect(lauf([A]).code).toBe(0);
  });

  it("Sicherung scheitert: alter Stand läuft wieder, nichts gewechselt", () => {
    setze("sichern_fehler");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(env()).toBe(ENV_START);
    expect(containerStatus()).toBe("running");
    expect(containerBild()).toBe(ID_B);
    expect(aufrufe()).not.toContain("exec -i");
  });

  it("Wartezeit unter 90 s wird abgelehnt (Übernahme der Prozesssperre)", () => {
    expect(lauf([A], { CENTRIC_WARTEZEIT: "30" }).code).toBe(2);
  });

  it("IMAGE_DIGEST in der Shell wird abgelehnt", () => {
    expect(lauf([A], { IMAGE_DIGEST: B }).code).toBe(4);
  });

  it("Forced Command: nur „deploy <digest> [--trocken] [--bei-fehler=…]“", () => {
    expect(lauf(["--ssh"], { SSH_ORIGINAL_COMMAND: `deploy ${A} --trocken` }).code).toBe(0);
    expect(lauf(["--ssh"], { SSH_ORIGINAL_COMMAND: `deploy ${A} --trocken --bei-fehler=ruecksprung` }).code).toBe(0);
    for (const b of [`deploy ${A}; rm -rf /`, "deploy latest", `deploy ${A} --ohne-label`, `bash -c id`, "", `deploy ${A} $(id)`]) {
      const r = lauf(["--ssh"], { SSH_ORIGINAL_COMMAND: b });
      expect(r.code, b).toBe(2);
    }
    expect(lauf(["--ssh", A]).code).toBe(2);
    expect(aufrufe()).not.toMatch(/^(pull|compose|exec)| sichern /m);
  });
});

describe.skipIf(!BASH)("Review-Auflagen WP-31", { timeout: 180000 }, () => {
  it("H1: Sicherung scheitert und der bisherige Stand ist gesperrt → R0 statt Neustart", () => {
    writeFileSync(path.join(verz, ".env"), ENV_START.replace(`IMAGE_DIGEST=${B}`, `IMAGE_DIGEST=${P00}`));
    setze("sichern_fehler");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(r.alles).toMatch(/nicht startbar/);
    expect(containerStatus()).toBe("exited");
    expect(aufrufe()).not.toMatch(/ up -d/);
    expect(protokoll()).toMatch(/bisher nicht startbar, R0 erreicht/);
  });

  it("H1: … und der bisherige Stand ist nicht freigegeben → R0", () => {
    const X = "sha256:" + "d".repeat(64);
    writeFileSync(path.join(verz, ".env"), ENV_START.replace(`IMAGE_DIGEST=${B}`, `IMAGE_DIGEST=${X}`));
    setze("sichern_fehler");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(containerStatus()).toBe("exited");
  });

  it.skipIf(FAKES_FEHLEN)("M1: .env ersetzen scheitert (Schritt 5) → .env unverändert, alter Stand läuft, protokolliert", () => {
    scheitert("mv", "*/.env");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(env()).toBe(ENV_START);
    expect(containerStatus()).toBe("running");
    expect(containerBild()).toBe(ID_B);
    expect(protokoll()).toMatch(/abgebrochen vor wechsel .*\.env ersetzen/);
  });

  it.skipIf(FAKES_FEHLEN)("M1: .env-Kopie scheitert (Schritt 5) → alter Stand läuft", () => {
    scheitert("cp", "*.env.vor-deploy-*");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(env()).toBe(ENV_START);
    expect(containerStatus()).toBe("running");
  });

  it.skipIf(FAKES_FEHLEN)("M1: unerwarteter Fehler nach dem Wechsel (ERR-Trap) → R0 mit Protokoll", () => {
    scheitert("touch", "*/.start-marke");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(r.alles).toMatch(/unerwarteter Fehler in Zeile/);
    expect(containerStatus()).toBe("exited");
    expect(protokoll()).toMatch(/fehlgeschlagen, R0 erreicht/);
  });

  it("M2: Änderungen nach dem Start sind eine Warnung, kein R0", () => {
    setze("abgleich_nachstart");
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(0);
    expect(r.alles).toMatch(/2 Dateien wurden nach dem Start geändert/);
    expect(protokoll()).toMatch(/abgleich warnung: 2/);
    expect(aufrufe()).toMatch(/deploy-abgleich\.mjs \/sicherung \/data --start \d{13}/);
  });

  it("M2: hat das neue Bild geschrieben, wird der Rücksprung verweigert → R0", () => {
    setze("schreibt_nach_up");
    setze("smoke_fehler");
    const r = lauf([A, "--bei-fehler=ruecksprung"]);
    expect(r.code, r.alles).toBe(1);
    expect(r.alles).toMatch(/bereits Daten geschrieben/);
    expect(containerStatus()).toBe("exited");
    expect(protokoll()).toMatch(/ruecksprung verweigert/);
  });

  it("M3: Treffer am Anfang eines großen Logs wird gefunden → R0", () => {
    setze("logs", "WARNUNG: Anfrage mit X-Forwarded-For, aber CENTRIC_VERTRAUTE_PROXYS ist leer.\n"
      + "x".repeat(200) .concat("\n").repeat(50000));
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(1);
    expect(r.alles).toMatch(/Log meldet X-Forwarded-For/);
    expect(containerStatus()).toBe("exited");
  });

  /* A1: Nachweis „rot vorher“ — dieselbe Lage gegen deploy.sh aus 06bdc53
     (vor M3): Der Treffer wird dort übersehen, die Auslieferung meldet
     Erfolg. Braucht Linux (SIGPIPE) und den Verlauf (fetch-depth: 0). */
  const ALT_DEPLOY = (() => {
    try {
      return execFileSync("git", ["show", "06bdc53:deploy/deploy.sh"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch { return null; }
  })();
  it.skipIf(FAKES_FEHLEN || ALT_DEPLOY === null)("A1: derselbe große Log gegen deploy.sh von 06bdc53 — dort übersehen (Befund belegt)", () => {
    const altVerz = path.join(tmp, "deploy-alt");
    mkdirSync(altVerz);
    for (const f of readdirSync(DEPLOY)) if (/\.(sh|mjs)$/.test(f)) writeFileSync(path.join(altVerz, f), readFileSync(path.join(DEPLOY, f)));
    writeFileSync(path.join(altVerz, "deploy.sh"), ALT_DEPLOY);
    for (const f of readdirSync(altVerz)) chmodSync(path.join(altVerz, f), 0o755);
    setze("logs", "WARNUNG: Anfrage mit X-Forwarded-For, aber CENTRIC_VERTRAUTE_PROXYS ist leer.\n"
      + "x".repeat(200).concat("\n").repeat(50000));
    const umgebung = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, STUB_DIR: p(stubDir),
      CENTRIC_VERZ: p(verz), CENTRIC_FREIGABEN: p(path.join(verz, "FREIGEGEBENE-IMAGES.md")),
      CENTRIC_WARTEZEIT: "90", CENTRIC_TAKT: "1", CENTRIC_NACHBEOBACHTUNG: "0" };
    delete umgebung.IMAGE_DIGEST;
    const r = spawnSync(BASH, [p(path.join(altVerz, "deploy.sh")), A], { encoding: "utf8", env: umgebung });
    expect(r.status, r.stdout + r.stderr).toBe(0);                 // alt: Erfolg trotz Warnung
    expect(r.stdout + r.stderr).not.toMatch(/Log meldet X-Forwarded-For/);
  });

  it.skipIf(FAKES_FEHLEN)("A2: find scheitert bei der Aufbewahrung — übersprungen, kein Wiederanlauf, nichts gelöscht", () => {
    const sich = path.join(verz, "deploy-sicherungen");
    for (let i = 1; i <= 6; i++) {
      mkdirSync(path.join(sich, `centric-sicherung-20261101T00000${i}Z`), { recursive: true });
      writeFileSync(path.join(sich, `centric-sicherung-20261101T00000${i}Z`, "FERTIG"), "");
    }
    writeFileSync(path.join(bin, "find"), `#!/usr/bin/env bash
case "$*" in *"centric-sicherung-*"*) echo "stub: find scheitert" >&2; exit 1 ;; esac
exec /usr/bin/find "$@"
`);
    chmodSync(path.join(bin, "find"), 0o755);
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(0);
    expect(r.alles).toMatch(/Aufbewahrung übersprungen/);
    expect(r.alles).not.toMatch(/Vor dem Wechsel gescheitert|unerwarteter Fehler/);
    expect(aufrufe().split("\n").filter((z) => z.includes(" up -d"))).toHaveLength(1);
    expect(readdirSync(sich).filter((n) => n.startsWith("centric-sicherung-2026110"))).toHaveLength(6);
    expect(containerBild()).toBe(ID_A);
  });

  const ALT_DEPLOY_A2 = (() => {
    try {
      return execFileSync("git", ["show", "8dde67b:deploy/deploy.sh"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch { return null; }
  })();
  it.skipIf(FAKES_FEHLEN || ALT_DEPLOY_A2 === null)("A2: derselbe find-Fehler gegen deploy.sh von 8dde67b — dort Wiederanlauf aus der Subshell (Befund belegt)", () => {
    const altVerz = path.join(tmp, "deploy-alt-a2");
    mkdirSync(altVerz);
    for (const f of readdirSync(DEPLOY)) if (/\.(sh|mjs)$/.test(f)) writeFileSync(path.join(altVerz, f), readFileSync(path.join(DEPLOY, f)));
    writeFileSync(path.join(altVerz, "deploy.sh"), ALT_DEPLOY_A2);
    for (const f of readdirSync(altVerz)) chmodSync(path.join(altVerz, f), 0o755);
    writeFileSync(path.join(bin, "find"), `#!/usr/bin/env bash
case "$*" in *"centric-sicherung-*"*) echo "stub: find scheitert" >&2; exit 1 ;; esac
exec /usr/bin/find "$@"
`);
    chmodSync(path.join(bin, "find"), 0o755);
    const umgebung = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, STUB_DIR: p(stubDir),
      CENTRIC_VERZ: p(verz), CENTRIC_FREIGABEN: p(path.join(verz, "FREIGEGEBENE-IMAGES.md")),
      CENTRIC_WARTEZEIT: "90", CENTRIC_TAKT: "1", CENTRIC_NACHBEOBACHTUNG: "0",
      ...(FLOCK ? {} : { CENTRIC_OHNE_FLOCK: "1" }) };
    delete umgebung.IMAGE_DIGEST;
    const r = spawnSync(BASH, [p(path.join(altVerz, "deploy.sh")), A], { encoding: "utf8", env: umgebung });
    const ups = aufrufe().split("\n").filter((z) => z.includes(" up -d")).length;
    expect(ups > 1 || /Vor dem Wechsel gescheitert|unerwarteter Fehler/.test(r.stdout + r.stderr),
      `alt: ${ups} up-Aufrufe\n${r.stdout}${r.stderr}`).toBe(true);
  });

  it.skipIf(!FLOCK)("N1: eine zweite gleichzeitige Auslieferung bricht ab", async () => {
    const halter = spawn(BASH, ["-c", `exec 9>"${p(path.join(verz, ".deploy.lock"))}"; flock 9; echo bereit; sleep 30`]);
    await new Promise((fertig) => halter.stdout.once("data", fertig));
    try {
      const r = lauf([A]);
      expect(r.code, r.alles).toBe(4);
      expect(r.alles).toMatch(/läuft bereits/);
      expect(env()).toBe(ENV_START);
    } finally { halter.kill(); }
  });

  it("N4: Aufbewahrung — die jüngsten 5 vollständigen bleiben, die neue immer", () => {
    const sich = path.join(verz, "deploy-sicherungen");
    for (let i = 1; i <= 6; i++) {
      const d = path.join(sich, `centric-sicherung-2026110${i < 3 ? 1 : 2}T00000${i}Z`);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, "FERTIG"), "");
    }
    mkdirSync(path.join(sich, "centric-sicherung-20261001T000000Z"));   // unvollständig: bleibt unangetastet
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(0);
    const rest = readdirSync(sich).sort();
    expect(rest).toContain("centric-sicherung-20261103T000000Z");
    expect(rest).toContain("centric-sicherung-20261001T000000Z");
    expect(rest.filter((n) => existsSync(path.join(sich, n, "FERTIG")))).toHaveLength(5);
    expect(rest).not.toContain("centric-sicherung-20261101T000001Z");
    expect(rest).not.toContain("centric-sicherung-20261101T000002Z");
  });

  it.skipIf(FAKES_FEHLEN)("N4: zu wenig Platz → Abbruch vor dem Anhalten", () => {
    writeFileSync(path.join(bin, "df"), "#!/usr/bin/env bash\necho 'Filesystem 1-blocks Used Available Capacity Mounted'\necho 'x 100 99 1 99% /'\n");
    chmodSync(path.join(bin, "df"), 0o755);
    writeFileSync(path.join(verz, "data", "probe.json"), "x".repeat(1000));
    const r = lauf([A]);
    expect(r.code, r.alles).toBe(4);
    expect(r.alles).toMatch(/zu wenig Platz/);
    expect(aufrufe()).not.toMatch(/ stop /);
    expect(containerStatus()).toBe("running");
  });
});

/* ---------- Smoke und Abgleich gegen das Echte ---------- */

describe("deploy-smoke.mjs gegen server.mjs", () => {
  it("anmeldefrei grün gegen den echten Server, rot gegen einen toten Port", async () => {
    const statik = mkdtempSync(path.join(tmpdir(), "centric-smoke-statik-"));
    const daten = mkdtempSync(path.join(tmpdir(), "centric-smoke-daten-"));
    mkdirSync(path.join(statik, "assets"));
    writeFileSync(path.join(statik, "index.html"), '<!doctype html><script type="module" crossorigin src="/assets/index-probe.js"></script>');
    writeFileSync(path.join(statik, "assets", "index-probe.js"), "console.log(1);\n".repeat(200));
    const port = 30000 + Math.floor(Math.random() * 20000);
    const kind = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, stdio: "ignore",
      env: { ...process.env, PORT: String(port), CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
        CENTRIC_PFEFFER: "smoke", NODE_ENV: "production", CENTRIC_AUFRAEUMEN: "aus" } });
    try {
      for (let i = 0; i < 100; i++) {
        if (await fetch(`http://127.0.0.1:${port}/gesund`).then((r) => r.ok).catch(() => false)) break;
        await new Promise((w) => setTimeout(w, 100));
      }
      const smoke = (basis) => spawnSync(process.execPath, ["--input-type=module", "-"], {
        input: readFileSync(path.join(DEPLOY, "deploy-smoke.mjs")), encoding: "utf8",
        env: { ...process.env, CENTRIC_SMOKE_BASIS: basis } });
      const gut = await new Promise((fertig) => {
        const k = spawn(process.execPath, ["--input-type=module", "-"], { env: { ...process.env, CENTRIC_SMOKE_BASIS: `http://127.0.0.1:${port}` } });
        let t = ""; k.stdout.on("data", (d) => { t += d; });
        k.on("close", (code) => fertig({ code, t }));
        k.stdin.end(readFileSync(path.join(DEPLOY, "deploy-smoke.mjs")));
      });
      expect(gut.code, gut.t).toBe(0);
      expect(gut.t).toContain("SMOKE OK");
      expect(gut.t.match(/^ok /gm).length).toBe(11);
      const schlecht = smoke("http://127.0.0.1:1");
      expect(schlecht.status).toBe(1);
      expect(schlecht.stdout).toContain("SMOKE FEHLGESCHLAGEN");
    } finally {
      kind.kill();
      rmSync(statik, { recursive: true, force: true });
      rmSync(daten, { recursive: true, force: true });
    }
  }, 30000);
});

describe("deploy-abgleich.mjs gegen eine echte Sicherung", { timeout: 60000 }, () => {
  it("gleich → 0; verändert oder fehlend → 1; Spur, Takt und aufraeumen:* zählen nicht", async () => {
    const daten = mkdtempSync(path.join(tmpdir(), "centric-abgleich-daten-"));
    const ziel = mkdtempSync(path.join(tmpdir(), "centric-abgleich-ziel-"));
    try {
      const { getStore } = await import("../server/lib/ablage.mjs");
      process.env.CENTRIC_DATEN = daten;
      process.env.CENTRIC_ABLAGE = "dateien";
      const s = getStore({ name: "centric", consistency: "strong" });
      await s.setJSON("kern:probe", { a: 1 });
      await s.setJSON("konto:x", { b: 2 });
      await s.setJSON("aufraeumen:letzter", { n: 1 });
      await getStore({ name: "centric-spur" }).setJSON("2026-11-03/probe/1", { x: 1 });
      const sich = spawnSync(process.execPath, ["werkzeug/ablage-sicherung.mjs", "sichern", "--quelle", daten, "--ziel", ziel],
        { cwd: WURZEL, encoding: "utf8", env: { ...process.env, CENTRIC_PFEFFER: "abgleich" } });
      expect(sich.status, sich.stdout + sich.stderr).toBe(0);
      const name = sich.stdout.match(/Sicherung vollständig: (.*)$/m)[1].trim();
      const abgleich = () => spawnSync(process.execPath, [path.join(DEPLOY, "deploy-abgleich.mjs"), name, daten], { encoding: "utf8" });
      let r = abgleich();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, abweichend: 0, fehlend: 0 });
      /* Was der Dienst selbst schreibt, darf sich ändern. */
      await s.setJSON("aufraeumen:letzter", { n: 2 });
      await getStore({ name: "centric-spur" }).setJSON("2026-11-03/probe/1", { x: 2 });
      await s.setJSON("neu:egal", { c: 3 });
      expect(abgleich().status).toBe(0);
      /* Was vorher da war, nicht. */
      await s.setJSON("konto:x", { b: 99 });
      r = abgleich();
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).abweichend).toBe(1);
      await s.setJSON("konto:x", { b: 2 });
      await s.delete("kern:probe");
      r = abgleich();
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).fehlend).toBe(1);
      /* M2: mit --start zählt, was nach dem Start geändert oder entfernt wurde, nur als Warnung. */
      await s.setJSON("kern:probe", { a: 1 });
      const vorStart = Date.now();
      await new Promise((w) => setTimeout(w, 30));
      await s.setJSON("konto:x", { b: 42 });
      const mitStart = spawnSync(process.execPath, [path.join(DEPLOY, "deploy-abgleich.mjs"), name, daten, "--start", String(vorStart)], { encoding: "utf8" });
      expect(mitStart.status, mitStart.stdout + mitStart.stderr).toBe(0);
      expect(JSON.parse(mitStart.stdout)).toMatchObject({ ok: true, nachStart: 1, abweichend: 0 });
      /* Ohne --start bleibt es ein Fehler. */
      expect(abgleich().status).toBe(1);
      /* Vor dem Start verändert (Start liegt in der Zukunft der Änderung): Fehler. */
      const spaeter = spawnSync(process.execPath, [path.join(DEPLOY, "deploy-abgleich.mjs"), name, daten, "--start", String(Date.now() + 60000)], { encoding: "utf8" });
      expect(spaeter.status).toBe(1);
    } finally {
      rmSync(daten, { recursive: true, force: true });
      rmSync(ziel, { recursive: true, force: true });
    }
  });
});
