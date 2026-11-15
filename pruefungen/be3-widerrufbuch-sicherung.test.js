/* ==========================================================================
   BE-3 — SICHERUNG DER WIDERRUFBÜCHER: eigener Job, Nachweis, Vereinigen statt Ersetzen, Alterswarnung
   (verbindliche Betreiberentscheidung 2026-11-14, Option A; docs/acc45/ABNAHME-V4-BE3-WIDERRUFBUCH-SICHERUNG.md)

   Gegen ECHTE Serverprozesse (node server.mjs), das echte Werkzeug (node werkzeug/ablage-sicherung.mjs), echte
   Dateien und den echten Job deploy/sicherung/widerrufbuch-sicherung.sh. restic und docker sind STUBS (kein Netz,
   kein Docker): restic legt ein lokales Repository als Ordner an, docker führt das Werkzeug mit dem node dieses
   Repositorys aus und bildet die Volumes als Pfadersetzung nach. Unter Windows ersetzen Stubs zusätzlich flock und
   die Modusprüfung (NTFS kennt 0600 nicht); unter Linux laufen die echten.

     1. Job: erster Lauf sichert beide Bücher, Nachweis (check, Liste, Rückholung bytegleich, Siegel), Status ohne
        Geheimnisse. Widerruf danach → zweiter Lauf. Monatliche Probe (widerrufbuch-probe.sh): check --read-data,
        Rückholung, Prüfsummen, laufendes Buch vollständig, Rollback-Gegenprobe mit den gesicherten Ständen; bei
        zurückgerolltem Buch Code 3.
     2. Älterer, GÜLTIG gesiegelter Stand über Ablage UND Zustand zurückgelegt (Restrisiko R-1): der Server allein
        merkt nichts (rot: Code gilt wieder) — der Job erkennt es, sichert NICHT, Status „ruecksprung“, /gesund warnt,
        Anmeldungen bleiben offen. `widerrufbuch-vereinen` mit der letzten Sicherung → alle neueren Widerrufe zurück,
        neu gesiegelt, Eingaben aufgehoben, idempotent.
     3. restic scheitert → Status „fehler“, /gesund warnt (öffentlich 200), Anmeldungen NICHT gesperrt.
     4. Ablehnung: manipulierte, fremde (anderer Pfeffer), gekürzte Kopie, fremde Herkunft → nichts angefasst.
     5. Unklares Buch → 503 (Konto bzw. Code), Vereinigung verweigert.
     6. Hostverlust: `wiederherstellen --widerrufbuch-kopie` legt das Buch aus der Kopie an.
     7. SIGKILL während der Vereinigung (echter Kindprozess): jedes Buch bleibt gültig (atomar), Wiederholung vollendet.
     8. Reine Bausteine mit fester Uhr: Schwellen der Alterswarnung, Vereinigung entfernt nie etwas.

   Aufruf: npx vitest run pruefungen/be3-widerrufbuch-sicherung.test.js --testTimeout=300000
   ========================================================================== */
// zeit-ok: echte Serverprozesse und der Job laufen auf der echten Uhr (Status, Sitzungen); die Schwellen der Alterswarnung prüft Abschnitt 8 mit fester Uhr.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 300000;
const PFEFFER = "be3-widerrufbuch-pfeffer-nur-zum-pruefen-4c8e1a7d";
const PFEFFER_FREMD = "be3-fremder-pfeffer-nur-zum-pruefen-9b2d6f30";
const PASSWORT = "be3-konto-passwort-nur-zum-pruefen-58e0c3b9";
const RESTIC_PW = "be3-restic-passwort-nur-zum-pruefen-1f7a9c42";
const RAUM = "be3-haus-cora";
const WIN = process.platform === "win32";
const BASH = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }).status === 0 ? "bash" : null;

let T, DATEN, ZUSTAND, STATIK, SICH, ALT, REPO, STATUSV, STUB;
let M;
const K = {};        // Konten: name → { id, email }
const C = {};        // Codes: name → { code, schluessel, konto }
let S0;              // Sicherung der Ablage vor den Widerrufen

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});
const ip = () => `10.${(randomBytes(1)[0] % 200) + 1}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
/** Windows-Pfad → Pfad für bash (C:\x → /c/x); unter Linux unverändert. */
const posix = (p) => (WIN ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, "/") : p);

async function starten({ env = {} } = {}) {
  const port = await freierPort();
  const basis = `http://127.0.0.1:${port}`;
  let log = "";
  const p = spawn(process.execPath, ["server.mjs"], {
    cwd: WURZEL,
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_STATIK: STATIK,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "be3-verwalter-nur-zum-pruefen-2a6e", CENTRIC_PFEFFER: PFEFFER,
      CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "production", NODE_OPTIONS: "",
      CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTELL_TAKT: "aus", CENTRIC_GESUND_CACHE_MS: "0",
      CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (d) => { log += d; });
  p.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 600; i++) {
    if (await fetch(`${basis}/gesund`).then(() => true, () => false)) break;
    if (p.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (p.exitCode !== null) throw new Error(`Server beendet:\n${log}`);
  const stoppen = () => new Promise((ok) => {
    if (p.exitCode !== null) return ok(undefined);
    const not = setTimeout(() => p.kill("SIGKILL"), 5000);
    p.once("exit", () => { clearTimeout(not); ok(undefined); });
    p.kill("SIGTERM");
  });
  return { basis, stoppen, log: () => log };
}

async function kontoAnmelden(s, name) {
  const r = await fetch(`${s.basis}/api/account/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
    body: JSON.stringify({ email: K[name].email, passwort: PASSWORT }) });
  return r.status;
}
async function codeAnmelden(s, name) {
  const r = await fetch(`${s.basis}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ zugangscode: C[name].code }) });
  return r.status;
}
const gesundDetail = async (s) => (await fetch(`${s.basis}/gesund?detail=1`)).json();

function werkzeug(args, { env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "ablage-sicherung.mjs"), ...args], {
    cwd: WURZEL, encoding: "utf8",
    env: { ...process.env, CENTRIC_PFEFFER: PFEFFER, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: "", NODE_OPTIONS: "", ...env } });
  return { code: r.status, signal: r.signal, aus: `${r.stdout}\n${r.stderr}` };
}
const vereinen = (kopien, extra = {}) =>
  werkzeug(["widerrufbuch-vereinen", "--zustand", ZUSTAND, ...kopien.flatMap((k) => ["--kopie", k]), "--daten", DATEN,
    "--ohne-serverpruefung"], extra);
/** Vereinigen mit hartem Abbruch (SIGKILL) direkt nach dem Umbenennen einer passenden Datei. */
const vereinenMitAbbruch = (kopien, muster) => vereinen(kopien, { env: {
  NODE_OPTIONS: `--import ${pathToFileURL(path.join(WURZEL, "pruefungen", "hilfen", "em6-abbruch.mjs")).href}`,
  EM6_ABBRUCH_MUSTER: muster } });

const buchDatei = (art) => path.join(ZUSTAND, art === "codes" ? "zugang-widerrufe.json" : "konto-widerrufe.json");
const roh = (art) => readFile(buchDatei(art));
const centric = () => M.ablage.getStore({ name: "centric", consistency: "strong" });
const vergessen = () => { M.wb.widerrufbuchVergessen(); M.kb.kontowiderrufbuchVergessen(); };
/** Beide Bücher mit Siegelprüfung lesen (wirft bei beschädigt/falschem Siegel). */
const buecherLesen = async (verz = ZUSTAND) => ({ codes: await M.wb.buchLesen(verz), konten: await M.kb.kontobuchLesen(verz) });
const sicherungsOrdner = async () => (existsSync(path.join(ZUSTAND, "vereinen-sicherung"))
  ? (await readdir(path.join(ZUSTAND, "vereinen-sicherung"))).sort() : []);
async function buecherNach(ziel, quelle = ZUSTAND) {
  await mkdir(ziel, { recursive: true });
  for (const n of ["zugang-widerrufe.json", "konto-widerrufe.json"]) await copyFile(path.join(quelle, n), path.join(ziel, n));
}

/* ---------------------------------------------------------------------------
   Stubs für den Job: restic (lokales Repository als Ordner) und docker (Werkzeug mit dem node dieses Repositorys)
   --------------------------------------------------------------------------- */
const STUB_RESTIC = `#!/usr/bin/env bash
# NUR PRÜFUNG: restic-Stub — lokales Repository als Ordner, kein Netz.
set -euo pipefail
echo "restic $*" >> "$STUB_LOG"
if [[ "\${1:-}" == version ]]; then echo "restic \${STUB_RESTIC_VERSION:-0.17.3} compiled with go1.22.5 on linux/amd64"; exit 0; fi
repo="\${RESTIC_REPOSITORY:?}"
[[ -s "\${RESTIC_PASSWORD_FILE:?}" ]] || { echo "stub-restic: kein Passwort" >&2; exit 1; }
cmd="$1"; shift
if [[ -n "\${STUB_RESTIC_FEHLER:-}" && "$cmd" == "$STUB_RESTIC_FEHLER" ]]; then echo "stub-restic: $cmd scheitert absichtlich" >&2; exit "\${STUB_RESTIC_FEHLERCODE:-1}"; fi
[[ -f "$repo/config" ]] || { echo "Fatal: unable to open config file" >&2; exit 1; }
# Host-Kennung je Snapshot (wie restic); ohne Eintrag: centric.
hostvon() { cat "$repo/hosts/$1" 2>/dev/null || echo centric; }
liste() { for d in $(ls "$repo/snapshots" | sort); do [[ -z "$1" || "$(hostvon "$d")" == "$1" ]] && echo "$d"; done; return 0; }
case "$cmd" in
  cat) echo '{"version":2}' ;;
  snapshots)
    h=""
    while [[ $# -gt 0 ]]; do case "$1" in --host) h="$2"; shift 2 ;; --tag|--retry-lock) shift 2 ;; *) shift ;; esac; done
    printf '['; t=""
    for d in $(liste "$h"); do printf '%s{"id":"%s","short_id":"%s"}' "$t" "$d" "\${d:0:8}"; t=","; done
    printf ']\\n' ;;
  backup)
    pfade=(); h=centric
    while [[ $# -gt 0 ]]; do case "$1" in --json) shift ;; --host) h="$2"; shift 2 ;; --tag|--retry-lock) shift 2 ;; *) pfade+=("$1"); shift ;; esac; done
    n=$(( $(ls "$repo/snapshots" | wc -l) + 1 ))
    id="$(printf '%064x' "$n")"
    for p in "\${pfade[@]}"; do mkdir -p "$repo/snapshots/$id$(dirname "$p")"; cp -r "$p" "$repo/snapshots/$id$p"; done
    mkdir -p "$repo/hosts"; printf '%s' "$h" > "$repo/hosts/$id"
    echo '{"message_type":"status","percent_done":1}'
    echo "{\\"message_type\\":\\"summary\\",\\"snapshot_id\\":\\"$id\\",\\"data_added\\":42}" ;;
  restore)
    was=""; ziel=""; h=""
    while [[ $# -gt 0 ]]; do case "$1" in --target) ziel="$2"; shift 2 ;; --host) h="$2"; shift 2 ;; --tag|--retry-lock) shift 2 ;; -*) shift ;; *) [[ -z "$was" ]] && was="$1"; shift ;; esac; done
    [[ "$was" == latest ]] && was="$(liste "$h" | tail -n1)"
    [[ -n "$was" && -d "$repo/snapshots/$was" ]] || { echo "stub-restic: kein Snapshot $was" >&2; exit 1; }
    mkdir -p "$ziel"; cp -r "$repo/snapshots/$was/." "$ziel/" ;;
  forget|check) echo "stub-restic: $cmd ok" ;;
  *) echo "stub-restic: unbekannt $cmd" >&2; exit 1 ;;
esac
`;
const STUB_DOCKER = `#!/usr/bin/env bash
# NUR PRÜFUNG: docker-Stub — \`docker run … --entrypoint node <Bild> <Argumente>\` mit dem node dieses Repositorys,
# Volumes als Pfadersetzung (Container-Pfad → Host-Pfad); aus --env-file nur CENTRIC_PFEFFER.
set -euo pipefail
echo "docker $*" >> "$STUB_LOG"
[[ "\${1:-}" == run ]] || exit 0
shift
von=(); nach=(); envdatei=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v) spec="\${2%:ro}"; von+=("\${spec##*:}"); nach+=("\${spec%:*}"); shift 2 ;;
    --env-file) envdatei="$2"; shift 2 ;;
    --name|--network|--tmpfs|--cap-drop|--security-opt|--memory|--user|--entrypoint) shift 2 ;;
    --rm|--read-only) shift ;;
    *) break ;;
  esac
done
shift   # Bild
args=()
for a in "$@"; do
  for i in "\${!von[@]}"; do
    c="\${von[$i]}"
    if [[ "$a" == "$c" || "$a" == "$c/"* ]]; then a="\${nach[$i]}\${a#"$c"}"; break; fi
  done
  args+=("$a")
done
pf="$(sed -n 's/^CENTRIC_PFEFFER=//p' "$envdatei")"
cd "$STUB_WURZEL"
CENTRIC_PFEFFER="$pf" NODE_OPTIONS="" exec node "\${args[@]}"
`;
/* Nur Windows (Git Bash): flock fehlt, und NTFS meldet für 0600 immer 644. */
const STUB_FLOCK = "#!/usr/bin/env bash\nexit 0\n";
const STUB_STAT = "#!/usr/bin/env bash\nif [[ \"$1\" == -c && \"$2\" == '%a' ]]; then echo 600; exit 0; fi\nexec /usr/bin/stat \"$@\"\n";

const STATUS = () => path.join(STATUSV, "widerrufbuch-status.json");
const statusLesen = async () => JSON.parse(await readFile(STATUS(), "utf8"));
const snapshots = async () => (await readdir(path.join(REPO, "snapshots"))).sort();
const stubLog = async () => (existsSync(path.join(STUB, "stub.log")) ? readFile(path.join(STUB, "stub.log"), "utf8") : "");

/** Den echten Job laufen lassen (`erster`: mit --erster-lauf). */
function job(env = {}, { erster = false } = {}) {
  const skript = path.join(WURZEL, "deploy", "sicherung", "widerrufbuch-sicherung.sh").replace(/\\/g, "/");
  const r = spawnSync(BASH, ["-c", 'p="$STUBVERZ"; command -v cygpath >/dev/null 2>&1 && p="$(cygpath -u "$STUBVERZ")"; '
    + 'PATH="$p:$PATH" exec bash "$SKRIPT" ${JOBARG:+"$JOBARG"} "$KONFIG"'], { encoding: "utf8", timeout: 240000,
    env: { ...process.env, NODE_OPTIONS: "", STUBVERZ: posix(STUB), SKRIPT: skript, KONFIG: posix(path.join(T, "widerrufbuch.env")),
      STUB_LOG: posix(path.join(STUB, "stub.log")), STUB_WURZEL: posix(WURZEL), JOBARG: erster ? "--erster-lauf" : "", ...env } });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}` };
}
/** Die monatliche Probe der Widerrufbücher (deploy/sicherung/widerrufbuch-probe.sh) mit denselben Stubs. */
const PROBE_STATUS = () => path.join(STATUSV, "widerrufbuch-probe-status.json");
function probe(args = [], env = {}) {
  const skript = path.join(WURZEL, "deploy", "sicherung", "widerrufbuch-probe.sh").replace(/\\/g, "/");
  const r = spawnSync(BASH, ["-c", 'p="$STUBVERZ"; command -v cygpath >/dev/null 2>&1 && p="$(cygpath -u "$STUBVERZ")"; '
    + 'PATH="$p:$PATH" exec bash "$SKRIPT" "$@" "$KONFIG"', "probe", ...args], { encoding: "utf8", timeout: 240000,
    env: { ...process.env, NODE_OPTIONS: "", STUBVERZ: posix(STUB), SKRIPT: skript, KONFIG: posix(path.join(T, "widerrufbuch.env")),
      STUB_LOG: posix(path.join(STUB, "stub.log")), STUB_WURZEL: posix(WURZEL), ...env } });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}` };
}
/** Eine weitere Konfiguration (Modus 600) aus der des Tests ableiten: Zeilen ersetzen bzw. anhängen. */
async function konfigAbleiten(name, aenderungen) {
  let text = await readFile(path.join(T, "widerrufbuch.env"), "utf8");
  for (const [k, v] of Object.entries(aenderungen)) {
    const zeile = `${k}=${v}`;
    text = new RegExp(`^${k}=`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), zeile) : `${text}${zeile}\n`;
  }
  const ziel = path.join(T, name);
  await writeFile(ziel, text, { mode: 0o600 });
  await chmod(ziel, 0o600);
  return posix(ziel);
}

/** Code widerrufen wie die Anwendung (echte Bibliothek): zuerst die Ablage, dann das Buch. */
async function codeWiderrufen(name) {
  vergessen();
  const store = centric();
  await M.konten.kontoSchreiben(store, C[name].schluessel, { ...C[name].konto, gesperrt: true,
    gesperrtAm: new Date().toISOString(), gesperrtDurch: "be3-pruefung" });
  await M.wb.widerrufen(store, [C[name].schluessel], "zurueckgezogen");
  vergessen();
}

beforeAll(async () => {
  T = await mkdtemp(path.join(tmpdir(), "centric-be3-"));
  DATEN = path.join(T, "daten"); ZUSTAND = path.join(T, "zustand"); STATIK = path.join(T, "statik"); SICH = path.join(T, "sich");
  ALT = path.join(T, "alt-zustand"); REPO = path.join(T, "repo"); STATUSV = path.join(T, "status"); STUB = path.join(T, "stub");
  for (const d of [DATEN, STATIK, SICH, STATUSV, STUB, path.join(REPO, "snapshots")]) await mkdir(d, { recursive: true });
  await writeFile(path.join(REPO, "config"), '{"version":2,"stub":true}');
  await writeFile(path.join(STATIK, "index.html"), "<!doctype html><title>BE-3</title>");
  process.env.CENTRIC_DATEN = DATEN; process.env.CENTRIC_ZUSTAND = ZUSTAND; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  M = {
    ablage: await import("../server/lib/ablage.mjs"),
    bestand: await import("../server/lib/bestand.mjs"),
    accounts: await import("../server/lib/accounts.mjs"),
    passwoerter: await import("../server/lib/passwoerter.mjs"),
    konten: await import("../server/lib/konten.mjs"),
    codes: await import("../server/lib/codes.mjs"),
    wb: await import("../server/lib/widerrufbuch.mjs"),
    kb: await import("../server/lib/kontowiderrufbuch.mjs"),
    ws: await import("../server/lib/widerrufbuchsicherung.mjs"),
  };
  const store = centric();
  const person = (id) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle: "mitarbeiter", bereich: "e1", status: "aktiv",
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const e = await M.bestand.bestandSchreiben(store, RAUM, { version: 5, mandanten: [{ id: "mc", name: "Haus Cora",
    einheiten: [{ id: "e1", name: "WB 1" }], personen: ["pa", "pb", "pc", "pd"].map(person) }] }, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
  const pw = await M.passwoerter.passwortAblegen(PASSWORT);
  for (const [name, pid] of [["A1", "pa"], ["A2", "pb"]]) {
    const email = `be3-${name.toLowerCase()}-${randomBytes(4).toString("hex")}@example.org`;
    const a = await M.accounts.accountAnlegen(store, { email });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    await M.accounts.emailBestaetigen(store, a.account.id);
    expect((await M.accounts.passwortSetzen(store, a.account.id, pw)).ok).toBe(true);
    const m = await M.accounts.mitgliedschaftAnlegen(store, { accountId: a.account.id, raum: RAUM, betrieb: 0, mandantId: "mc",
      person: pid, rolle: "mitarbeiter", status: "aktiv" });
    expect(m.ok, JSON.stringify(m)).toBe(true);
    K[name] = { id: a.account.id, email };
  }
  const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
  for (const [name, pid] of [["C1", "pc"], ["C2", "pd"]]) {
    const code = [0, 1, 2].map(() => Array.from(randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("")).join("-");
    const konto = { name: "Haus Cora", bestand: RAUM, rolle: "mitarbeiter", person: pid, betrieb: 0, mandantId: "mc", demo: false,
      gruppe: null, hinweis: null, angelegt: new Date().toISOString() };
    const schluessel = M.codes.ablageSchluessel(code);
    await M.konten.kontoSchreiben(store, schluessel, konto);
    C[name] = { code, schluessel, konto };
  }
  /* Erster Start: beide Bücher entstehen (leer), Anker in der Ablage. */
  const s = await starten();
  try {
    expect(await codeAnmelden(s, "C1")).toBe(200);
    expect(await kontoAnmelden(s, "A1")).toBe(200);
  } finally { await s.stoppen(); }
  await buecherNach(ALT);
  const r = werkzeug(["sichern", "--quelle", DATEN, "--ziel", SICH, "--ruhe", "0"]);
  expect(r.code, r.aus).toBe(0);
  S0 = /Sicherung vollständig: (.+)/.exec(r.aus)[1].trim();
  /* Konfiguration des Jobs: nur Platzhalterwerte, alles im Temp-Verzeichnis. */
  const envDatei = path.join(T, "dienst.env");
  await writeFile(envDatei, `CENTRIC_PFEFFER="${PFEFFER}"\n`, { mode: 0o600 });
  const pwDatei = path.join(T, "restic-pw");
  await writeFile(pwDatei, `${RESTIC_PW}\n`, { mode: 0o600 });
  await writeFile(path.join(T, "widerrufbuch.env"), [
    `CENTRIC_PROD_IMAGE=ghcr.io/beispiel/centric@sha256:${"0".repeat(64)}`,
    `CENTRIC_DATEN_PFAD=${posix(DATEN)}`, `CENTRIC_ZUSTAND_PFAD=${posix(ZUSTAND)}`, `CENTRIC_ENV_DATEI=${posix(envDatei)}`,
    `RESTIC_REPOSITORY=${posix(REPO)}`, `RESTIC_PASSWORD_FILE=${posix(pwDatei)}`, `STATUS_VERZEICHNIS=${posix(STATUSV)}`,
    "ALARM_PING_URL=", "ZEITGRENZE_RESTIC=120", "ZEITGRENZE_CONTAINER=120", ""].join("\n"), { mode: 0o600 });
  for (const d of [envDatei, pwDatei, path.join(T, "widerrufbuch.env")]) await chmod(d, 0o600);
  await writeFile(path.join(STUB, "restic"), STUB_RESTIC, { mode: 0o755 });
  await writeFile(path.join(STUB, "docker"), STUB_DOCKER, { mode: 0o755 });
  if (WIN || spawnSync("bash", ["-c", "command -v flock"]).status !== 0) await writeFile(path.join(STUB, "flock"), STUB_FLOCK, { mode: 0o755 });
  if (WIN) await writeFile(path.join(STUB, "stat"), STUB_STAT, { mode: 0o755 });
}, LIMIT);

afterAll(async () => {
  if (T) await rm(T, { recursive: true, force: true });
});

describe.skipIf(!BASH)("BE-3: eigener Sicherungsjob (Stub-restic, lokales Repository)", () => {
  it("erster Lauf: beide Bücher gesichert, Nachweis (check, Liste, Rückholung, Siegel), Status ohne Geheimnisse", async () => {
    const r = job();
    expect(r.code, r.aus).toBe(0);
    const st = await statusLesen();
    expect(st).toMatchObject({ art: "widerrufbuch", ergebnis: "ok", schritt: "fertig", code: 0, host: "centric", snapshots: 1,
      buecher: 2, fehlend: 0, nachweis: "check+liste+rueckholung+siegel" });
    expect(st.letzte_erfolgreiche).toBe(st.zeit);
    expect(await snapshots()).toHaveLength(1);
    const log = await stubLog();
    for (const befehl of ["restic cat --retry-lock 5m config", "restic backup", "--tag widerrufbuch", "restic forget", "--keep-last 200",
      "--keep-daily 90", "restic check", "restic restore"]) expect(log, befehl).toContain(befehl);
    expect(log).toMatch(/docker run .*--network none .*--read-only/);
    /* Nur die beiden Bücher im Snapshot — nie die Schlüsselepoche. */
    const im = spawnSync(process.execPath, ["-e", `const f=require("fs"),p=require("path");const a=[];(function w(d){for(const e of f.readdirSync(d,{withFileTypes:true}))e.isDirectory()?w(p.join(d,e.name)):a.push(e.name)})(process.argv[1]);console.log(a.sort().join(","))`,
      path.join(REPO, "snapshots")], { encoding: "utf8" }).stdout.trim();
    expect(im).toBe("konto-widerrufe.json,zugang-widerrufe.json");
    const logs = await Promise.all((await readdir(path.join(STATUSV, "log"))).map((n) => readFile(path.join(STATUSV, "log", n), "utf8")));
    expect(logs.join("\n")).toMatch(/Nachweis: restic check bestanden/);
    const alles = `${JSON.stringify(st)}\n${r.aus}\n${logs.join("\n")}`;
    for (const geheim of [PFEFFER, RESTIC_PW]) expect(alles).not.toContain(geheim);
  }, LIMIT);

  it("Widerruf (Code und Konto) nach der Sicherung: zweiter Lauf sichert den neuen Stand", async () => {
    await codeWiderrufen("C1");
    vergessen();
    const sp = await M.accounts.accountSperren(centric(), K.A1.id);
    expect(sp.ok && sp.kontobuch.geschrieben, JSON.stringify(sp)).toBe(true);
    vergessen();
    const r = job();
    expect(r.code, r.aus).toBe(0);
    const st = await statusLesen();
    expect(st).toMatchObject({ ergebnis: "ok", snapshots: 2, fehlend: 0 });
    expect(st.eintraege_codes).toBeGreaterThanOrEqual(1);
    expect(st.eintraege_konten).toBeGreaterThanOrEqual(1);
  }, LIMIT);

  it("Probe (monatlich): check --read-data, Rückholung beider Stände, Prüfsummen, laufendes Buch vollständig, Rollback-Gegenprobe erkannt", async () => {
    const vorher = await snapshots();
    const imRepo = (await stubLog()).split("\n").filter((z) => /^restic (backup|forget) /.test(z)).length;
    const r = probe();
    expect(r.code, r.aus).toBe(0);
    const st = JSON.parse(await readFile(PROBE_STATUS(), "utf8"));
    expect(st).toMatchObject({ art: "widerrufbuch-probe", ergebnis: "ok", schritt: "fertig", code: 0, snapshots: 2,
      neuester: vorher.at(-1), vergleich: vorher[0], live_fehlend: 0, gegenprobe: "erkannt" });
    expect(st.gegenprobe_fehlend, "Gegenprobe: neuere Widerrufe fehlen im älteren Stand").toBeGreaterThanOrEqual(2);
    /* Prüfsummen des neuesten Stands = sha256 der Stufe des letzten Jobs (bytegleich). */
    for (const b of ["zugang-widerrufe.json", "konto-widerrufe.json"]) {
      const soll = createHash("sha256").update(await readFile(path.join(STATUSV, "widerrufbuch", "stufe", b))).digest("hex");
      expect(st.pruefsummen, b).toContain(`${b}=${soll}`);
    }
    expect(r.aus).toMatch(/bytegleich mit der Stufe des letzten erfolgreichen Jobs/);
    const log = await stubLog();
    expect(log).toContain("restic check --retry-lock 5m --read-data\n");
    /* Nur lesend: kein backup, kein forget, kein neuer Snapshot; Arbeitsordner aufgeräumt; keine Geheimnisse. */
    expect(log.split("\n").filter((z) => /^restic (backup|forget) /.test(z)).length).toBe(imRepo);
    expect(await snapshots()).toEqual(vorher);
    expect((await readdir(STATUSV)).filter((n) => n.startsWith("widerrufbuch-probe-") && !n.endsWith(".json"))).toEqual([]);
    for (const geheim of [PFEFFER, RESTIC_PW]) expect(`${JSON.stringify(st)}\n${r.aus}`).not.toContain(geheim);
    /* Vergleich mit sich selbst: Gegenprobe nicht möglich, aber kein Fehler; unbekannte ID → Fehler. */
    const selbst = probe(["--alt", vorher.at(-1).slice(0, 8)]);
    expect(selbst.code, selbst.aus).toBe(0);
    expect(JSON.parse(await readFile(PROBE_STATUS(), "utf8")).gegenprobe).toBe("nicht-moeglich");
    expect(probe(["--alt", "deadbeef"]).code).toBe(1);
    expect(probe(["--alt", "kein-hex"]).code).toBe(78);
    /* Wie der Job: restic < 0.16.0 → 78 (kein --retry-lock); restic scheitert → 4. */
    expect(probe([], { STUB_RESTIC_VERSION: "0.15.2" }).code).toBe(78);
    const rf = probe([], { STUB_RESTIC_FEHLER: "check", STUB_RESTIC_FEHLERCODE: "3" });
    expect(rf.code, rf.aus).toBe(4);
    expect(JSON.parse(await readFile(PROBE_STATUS(), "utf8"))).toMatchObject({ ergebnis: "fehler", schritt: "restic-check", code: 4 });
  }, LIMIT);

  it("älterer, gültig gesiegelter Stand über Ablage UND Zustand: Server merkt nichts (rot), der Job erkennt es und sichert NICHT", async () => {
    const r = werkzeug(["wiederherstellen", "--sicherung", S0, "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung"]);
    expect(r.code, r.aus).toBe(0);
    await buecherNach(ZUSTAND, ALT);
    /* Rot (Restrisiko R-1 ohne BE-3): Siegel und Kennung passen — der widerrufene Code und das gesperrte Konto gelten. */
    let s = await starten();
    try {
      expect(await codeAnmelden(s, "C1"), "C1 lebt wieder auf (ohne BE-3 unbemerkt)").toBe(200);
      expect(await kontoAnmelden(s, "A1"), "A1 lebt wieder auf").toBe(200);
    } finally { await s.stoppen(); }
    const vorher = (await stubLog()).split("restic backup").length;
    const j = job();
    expect(j.code, j.aus).toBe(3);
    expect(j.aus).toMatch(/RÜCKSPRUNG ERKANNT/);
    const st = await statusLesen();
    expect(st.ergebnis).toBe("ruecksprung");
    expect(st.schritt).toBe("pruefen");
    expect(st.fehlend).toBeGreaterThanOrEqual(2);
    expect(st.letzte_erfolgreiche, "letzte erfolgreiche Sicherung bleibt stehen").toMatch(/^\d{4}-/);
    expect(await snapshots(), "kein neuer Snapshot").toHaveLength(2);
    expect((await stubLog()).split("restic backup").length).toBe(vorher);
    /* /gesund warnt; nichts wird gesperrt. */
    s = await starten({ env: { CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS: STATUS() } });
    try {
      const g = await gesundDetail(s);
      expect(g.pruefungen.widerrufbuchsicherung.stufe).toBe("warnung");
      expect(g.pruefungen.widerrufbuchsicherung.text).toMatch(/widerrufbuch-vereinen/);
      expect(await codeAnmelden(s, "C2"), "Anmeldungen bleiben offen").toBe(200);
      expect(await kontoAnmelden(s, "A2")).toBe(200);
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Probe bei zurückgerolltem laufendem Buch: Code 3, Status „ruecksprung“, Zustandsverzeichnis unberührt", async () => {
    const vorher = await Promise.all(["zugang-widerrufe.json", "konto-widerrufe.json"].map((n) => readFile(path.join(ZUSTAND, n))));
    const r = probe();
    expect(r.code, r.aus).toBe(3);
    expect(r.aus).toMatch(/RÜCKSPRUNG ERKANNT/);
    const st = JSON.parse(await readFile(PROBE_STATUS(), "utf8"));
    expect(st).toMatchObject({ ergebnis: "ruecksprung", schritt: "live-vergleich", code: 3 });
    expect(st.live_fehlend).toBeGreaterThanOrEqual(2);
    const nachher = await Promise.all(["zugang-widerrufe.json", "konto-widerrufe.json"].map((n) => readFile(path.join(ZUSTAND, n))));
    expect(nachher.map(String)).toEqual(vorher.map(String));
  }, LIMIT);

  it("widerrufbuch-vereinen mit der letzten Sicherung: alle neueren Widerrufe zurück, neu gesiegelt, Eingaben aufgehoben, idempotent", async () => {
    const kopie = path.join(REPO, "snapshots", (await snapshots()).at(-1));
    const vorherSicherungen = await sicherungsOrdner();
    const r = vereinen([kopie]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/zugang-widerrufe\.json: 1 Kopie\(n\), [1-9]\d* neu/);
    expect(r.aus).toMatch(/konto-widerrufe\.json: 1 Kopie\(n\), [1-9]\d* neu/);
    vergessen();
    const b = await buecherLesen();
    expect(Object.keys(b.codes.eintraege)).toContain(C.C1.schluessel);
    expect(Object.keys(b.konten.konten)).toContain(M.kb.kontoKennung(K.A1.id));
    const alt = await buecherLesen(ALT);
    for (const art of ["codes", "konten"]) expect(M.ws.fehlendeEintraege(b[art], alt[art], art), `${art}: nichts verloren`).toBe(0);
    const neu = (await sicherungsOrdner()).filter((d) => !vorherSicherungen.includes(d));
    expect(neu).toHaveLength(1);
    expect((await readdir(path.join(ZUSTAND, "vereinen-sicherung", neu[0]))).sort())
      .toEqual(["aktuell-konto-widerrufe.json", "aktuell-zugang-widerrufe.json", "kopie-1-konto-widerrufe.json", "kopie-1-zugang-widerrufe.json"]);
    /* Idempotent: zweiter Lauf schreibt nichts. */
    const vorher = { codes: await roh("codes"), konten: await roh("konten") };
    const z = vereinen([kopie]);
    expect(z.code, z.aus).toBe(0);
    expect(z.aus).toMatch(/Nichts geschrieben/);
    expect((await roh("codes")).equals(vorher.codes)).toBe(true);
    expect((await roh("konten")).equals(vorher.konten)).toBe(true);
    expect(await sicherungsOrdner()).toHaveLength(vorherSicherungen.length + 1);
    /* Der Server zieht die Ablage nach: C1 und A1 bleiben widerrufen, die übrigen unberührt. */
    const s = await starten();
    try {
      expect(await codeAnmelden(s, "C1"), "C1 nach Vereinigung").not.toBe(200);
      expect(await kontoAnmelden(s, "A1"), "A1 nach Vereinigung").toBe(401);
      expect(await codeAnmelden(s, "C2")).toBe(200);
      expect(await kontoAnmelden(s, "A2")).toBe(200);
    } finally { await s.stoppen(); }
    /* Der Job sichert wieder. */
    const j = job();
    expect(j.code, j.aus).toBe(0);
    expect((await statusLesen()).snapshots).toBe(3);
  }, LIMIT);

  it("restic scheitert: Status „fehler“, /gesund warnt (öffentlich 200), Anmeldungen NICHT gesperrt", async () => {
    const zuvor = await statusLesen();
    const j = job({ STUB_RESTIC_FEHLER: "backup" });
    expect(j.code, j.aus).not.toBe(0);
    const st = await statusLesen();
    expect(st).toMatchObject({ ergebnis: "fehler", schritt: "restic-backup" });
    expect(st.letzte_erfolgreiche, "letzte erfolgreiche bleibt").toBe(zuvor.letzte_erfolgreiche);
    const s = await starten({ env: { CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS: STATUS() } });
    try {
      const g = await gesundDetail(s);
      expect(g.pruefungen.widerrufbuchsicherung).toMatchObject({ stufe: "warnung", ergebnis: "fehler" });
      expect(g.pruefungen.widerrufbuchsicherung.text).toMatch(/Schritt restic-backup/);
      expect(g.pruefungen.widerrufbuch.stufe).toBe("ok");
      expect(g.pruefungen.kontowiderrufbuch.stufe).toBe("ok");
      const oeff = await fetch(`${s.basis}/gesund`, { headers: { "x-forwarded-for": ip() } });
      expect(oeff.status).toBe(200);
      expect(await oeff.json()).toEqual({ status: "warnung" });
      expect(await codeAnmelden(s, "C2")).toBe(200);
      expect(await kontoAnmelden(s, "A2")).toBe(200);
      expect(await codeAnmelden(s, "C1")).not.toBe(200);
    } finally { await s.stoppen(); }
    /* Wieder in Ordnung: der nächste Lauf gelingt. */
    expect(job().code).toBe(0);
  }, LIMIT);

  it("--retry-lock 5m an jedem sperrenden restic-Aufruf; restic < 0.16.0 oder unklare Version → Code 78, nichts gesichert", async () => {
    const zeilen = (await stubLog()).split("\n").filter((z) => /^restic (snapshots|restore|backup|forget|check|cat) /.test(z));
    for (const befehl of ["snapshots", "restore", "backup", "forget", "check", "cat"])
      expect(zeilen.some((z) => z.startsWith(`restic ${befehl} `)), befehl).toBe(true);
    for (const z of zeilen) expect(z, z).toContain("--retry-lock 5m");
    expect(await stubLog()).toContain("restic version");
    for (const version of ["0.15.2", "0.9.6", "kaputt"]) {
      const vorher = await snapshots();
      const j = job({ STUB_RESTIC_VERSION: version });
      expect(j.code, j.aus).toBe(78);
      expect(j.aus).toMatch(/verlangt ist restic >= 0\.16\.0/);
      expect(await statusLesen()).toMatchObject({ ergebnis: "fehler", schritt: "restic-version", code: 78 });
      expect(await snapshots(), "nichts gesichert").toEqual(vorher);
    }
    for (const version of ["0.16.0", "1.0.0"]) expect(job({ STUB_RESTIC_VERSION: version }).code, version).toBe(0);
  }, LIMIT);

  it("restic endet selbst mit 3 („Snapshot unvollständig“): Job endet mit 4 (restic), nicht mit 3 (Rücksprung)", async () => {
    for (const befehl of ["backup", "forget", "check"]) {
      const j = job({ STUB_RESTIC_FEHLER: befehl, STUB_RESTIC_FEHLERCODE: "3" });
      expect(j.code, j.aus).toBe(4);
      expect(j.aus).toMatch(new RegExp(`restic ${befehl} gescheitert \\(restic-Code 3\\)`));
      expect(j.aus).not.toMatch(/RÜCKSPRUNG ERKANNT/);
      const st = await statusLesen();
      expect(st).toMatchObject({ ergebnis: "fehler", schritt: `restic-${befehl}`, code: 4 });
      expect(M.ws.sicherungLage(st, { jetzt: Date.now() }).text).toMatch(/Code 4 \(restic gescheitert\)/);
    }
    expect(job().code).toBe(0);
  }, LIMIT);

  it("Pflicht eigenes Repository: dasselbe wie in der Konfiguration der Ablage (env daneben) → Code 78, nichts gesichert", async () => {
    const ablage = path.join(T, "env");
    try {
      for (const form of [posix(REPO), `"${posix(REPO)}/"`, `local:${posix(REPO)}`]) {
        await writeFile(ablage, `# Platzhalter-Konfiguration der Ablage (nur Prüfung)\nRESTIC_REPOSITORY=${form}\n`);
        const vorher = await snapshots();
        const aufrufe = (await stubLog()).split("\nrestic ").length;
        const j = job();
        expect(j.code, `${form}\n${j.aus}`).toBe(78);
        expect(j.aus).toMatch(/dasselbe Repository wie die Sicherung der Ablage/);
        expect(j.aus, "Repository-Angabe nicht im Log").not.toContain(posix(REPO));
        expect(await statusLesen()).toMatchObject({ ergebnis: "fehler", schritt: "konfiguration", code: 78 });
        expect(await snapshots()).toEqual(vorher);
        expect((await stubLog()).split("\nrestic ").length, "kein restic-Aufruf").toBe(aufrufe);
      }
      await writeFile(ablage, `RESTIC_REPOSITORY=${posix(path.join(T, "anderes-repo"))}\n`);
      const j = job();
      expect(j.code, j.aus).toBe(0);
      expect(j.aus).toMatch(/Eigenes Repository: verschieden/);
    } finally { await rm(ablage, { force: true }); }
  }, LIMIT);

  it("RESTIC_HOST geändert: kein stiller erster Lauf — Code 5 „vergleich-fehlt“, nichts gesichert; nur mit --erster-lauf", async () => {
    const neu = await konfigAbleiten("wb-neuhost.env", { RESTIC_HOST: "centric-neu" });
    const vorher = await snapshots();
    let j = job({ KONFIG: neu });
    expect(j.code, j.aus).toBe(5);
    expect(j.aus).toMatch(/kein Snapshot für Host-Kennung 'centric-neu'/);
    expect(j.aus).toMatch(/--erster-lauf/);
    let st = await statusLesen();
    expect(st).toMatchObject({ ergebnis: "vergleich-fehlt", schritt: "vergleichsstand", code: 5 });
    expect(st.letzte_erfolgreiche, "früherer Erfolg bleibt vermerkt").toMatch(/^\d{4}-/);
    expect(M.ws.sicherungLage(st, { jetzt: Date.now() })).toMatchObject({ stufe: "warnung" });
    expect(M.ws.sicherungLage(st, { jetzt: Date.now() }).text).toMatch(/kein Vergleichsstand für diese Host-Kennung/);
    expect(await snapshots()).toEqual(vorher);
    /* Auch ohne Statusdatei: Snapshots unter anderer Host-Kennung (Suche ohne Host-Filter) verhindern den stillen Erstlauf. */
    await rm(STATUS(), { force: true });
    j = job({ KONFIG: neu });
    expect(j.code, j.aus).toBe(5);
    expect(await snapshots()).toEqual(vorher);
    /* Bewusst bestätigt: sichert ohne Vergleichsstand unter der neuen Kennung. */
    j = job({ KONFIG: neu }, { erster: true });
    expect(j.code, j.aus).toBe(0);
    expect(j.aus).toMatch(/--erster-lauf: vom Betreiber bestätigt/);
    st = await statusLesen();
    expect(st).toMatchObject({ ergebnis: "ok", host: "centric-neu", snapshots: 1 });
    expect(await snapshots()).toHaveLength(vorher.length + 1);
    /* Danach vergleicht die neue Kennung normal; die bisherige ebenso. */
    expect(job({ KONFIG: neu }).code).toBe(0);
    expect(job().code).toBe(0);
    expect(await statusLesen()).toMatchObject({ ergebnis: "ok", host: "centric" });
  }, LIMIT);
});

describe("BE-3: Vereinigung verweigert, was nicht sicher ist — nichts angefasst", () => {
  /** Eine Kopie in einen eigenen Ordner legen; `aendern` bekommt das geparste Buch bzw. den Text. */
  async function kopie(art, name, aendern) {
    const ordner = path.join(T, "kopien", name);
    await mkdir(ordner, { recursive: true });
    const datei = path.join(ordner, path.basename(buchDatei(art)));
    await writeFile(datei, await aendern((await roh(art)).toString("utf8")));
    return ordner;
  }
  async function verweigert(ordner, muster) {
    const vorher = { codes: await roh("codes"), konten: await roh("konten"), sich: await sicherungsOrdner() };
    const r = vereinen([ordner]);
    expect(r.code, r.aus).toBe(2);
    expect(r.aus).toMatch(muster);
    expect(r.aus).toMatch(/Nichts wurde angefasst/);
    expect((await roh("codes")).equals(vorher.codes), "Buch der Codes unverändert").toBe(true);
    expect((await roh("konten")).equals(vorher.konten), "Konto-Buch unverändert").toBe(true);
    expect(await sicherungsOrdner(), "keine Eingaben abgelegt").toEqual(vorher.sich);
  }

  it("manipulierte Kopie (Eintrag entfernt, Siegel alt) — beider Bücher", async () => {
    await verweigert(await kopie("codes", "manipuliert-codes", (t) => {
      const b = JSON.parse(t); delete b.eintraege[C.C1.schluessel]; return JSON.stringify(b);
    }), /falsches Siegel/);
    await verweigert(await kopie("konten", "manipuliert-konten", (t) => {
      const b = JSON.parse(t); b.konten = {}; return JSON.stringify(b);
    }), /falsches Siegel/);
  });

  it("fremde Kopie (anderer Pfeffer, gleiche Kennung)", async () => {
    await verweigert(await kopie("codes", "fremd-pfeffer", async (t) => {
      const b = JSON.parse(t);
      b.siegel = M.wb.siegelBilden({ ...b, verwalter: b.verwalter || {}, regime: b.regime || {} }, PFEFFER_FREMD);
      return JSON.stringify(b);
    }), /falsches Siegel/);
  });

  it("gekürzte Kopie und Ordner ohne Buch", async () => {
    await verweigert(await kopie("konten", "gekuerzt", (t) => t.slice(0, Math.floor(t.length / 2))), /beschädigt/);
    const leer = path.join(T, "kopien", "leer");
    await mkdir(leer, { recursive: true });
    await writeFile(path.join(leer, "etwas-anderes.json"), "{}");
    await verweigert(leer, /kein Widerrufbuch/);
  });

  it("gültig gesiegelt, aber andere Herkunft (keine gemeinsame Kennung)", async () => {
    const ordner = path.join(T, "kopien", "andere-herkunft");
    const b = M.wb.buchNeu();
    M.wb.eintragen(b, ["be3fremd-0000-kein-echter-schluessel"], "t", "2026-11-14T08:00:00.000Z");
    await M.wb.buchSchreiben(ordner, b, { pfeffer: PFEFFER });
    await verweigert(ordner, /anderen Umgebung/);
  });

  it("widerrufbuch-pruefen: Teilmenge ok (0), älterer Stand erkannt (3), manipulierte Vergleichskopie (2)", async () => {
    const ok = werkzeug(["widerrufbuch-pruefen", "--zustand", ZUSTAND, "--vorher", ALT]);
    expect(ok.code, ok.aus).toBe(0);
    expect(ok.aus).toMatch(/WIDERRUFBUCH-PRUEFUNG ergebnis=ok buecher=2 codes=\d+ konten=\d+ fehlend=0/);
    const rs = werkzeug(["widerrufbuch-pruefen", "--zustand", ALT, "--vorher", ZUSTAND]);
    expect(rs.code, rs.aus).toBe(3);
    expect(rs.aus).toMatch(/ergebnis=ruecksprung .*fehlend=[1-9]/);
    const kaputt = path.join(T, "kopien", "manipuliert-codes");
    const k = werkzeug(["widerrufbuch-pruefen", "--zustand", ZUSTAND, "--vorher", kaputt]);
    expect(k.code, k.aus).toBe(2);
  });
});

describe("BE-3: unklares Buch → 503 (wie BE-1/E-M6), Vereinigung verweigert", () => {
  it("Konto-Buch manipuliert: Konto-Anmeldung 503, Codes unberührt; Buch der Codes manipuliert: Code-Anmeldung 503", async () => {
    const original = { codes: await roh("codes"), konten: await roh("konten") };
    const kopieOrdner = path.join(T, "kopien", "gueltig");
    await buecherNach(kopieOrdner);
    try {
      const b = JSON.parse(original.konten.toString("utf8"));
      b.konten = {};
      await writeFile(buchDatei("konten"), JSON.stringify(b));
      let s = await starten();
      try {
        expect(await kontoAnmelden(s, "A2"), "Konto fail-closed").toBe(503);
        expect(await codeAnmelden(s, "C2"), "Code unberührt").toBe(200);
      } finally { await s.stoppen(); }
      const r = vereinen([kopieOrdner]);
      expect(r.code, r.aus).toBe(2);
      expect(r.aus).toMatch(/aktuelle konto-widerrufe\.json ist nicht in Ordnung/);
      await writeFile(buchDatei("konten"), original.konten);
      const c = JSON.parse(original.codes.toString("utf8"));
      c.eintraege = {};
      await writeFile(buchDatei("codes"), JSON.stringify(c));
      s = await starten();
      try {
        expect(await codeAnmelden(s, "C2"), "Code fail-closed").toBe(503);
        expect(await kontoAnmelden(s, "A2"), "Konto unberührt").toBe(200);
      } finally { await s.stoppen(); }
      expect(vereinen([kopieOrdner]).code).toBe(2);
    } finally {
      await writeFile(buchDatei("codes"), original.codes);
      await writeFile(buchDatei("konten"), original.konten);
    }
  }, LIMIT);
});

describe("BE-3: Hostverlust — Wiederherstellung mit --widerrufbuch-kopie", () => {
  it("ohne Buch und ohne Kopie: Abbruch; mit Kopie: Buch entsteht aus der Kopie, Widerrufe bleiben", async () => {
    const kopieOrdner = path.join(T, "kopien", "hostverlust");
    await buecherNach(kopieOrdner);
    await rm(buchDatei("codes")); await rm(buchDatei("konten"));
    const ohne = werkzeug(["wiederherstellen", "--sicherung", S0, "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung", "--zustand", ZUSTAND]);
    expect(ohne.code, ohne.aus).toBe(2);
    expect(ohne.aus).toMatch(/fehlt in .*die Sicherung kennt aber eines/);
    const mit = werkzeug(["wiederherstellen", "--sicherung", S0, "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung",
      "--zustand", ZUSTAND, "--widerrufbuch-kopie", kopieOrdner]);
    expect(mit.code, mit.aus).toBe(0);
    expect(mit.aus).toMatch(/zugang-widerrufe\.json: 1 Kopie\(n\), \d+ neu, \d+ Einträge \(neu aus den Kopien\)/);
    expect(mit.aus).toMatch(/konto-widerrufe\.json: 1 Kopie\(n\), \d+ neu, \d+ Einträge \(neu aus den Kopien\)/);
    const s = await starten();
    try {
      expect(await codeAnmelden(s, "C1"), "C1 nach Hostverlust").not.toBe(200);
      expect(await kontoAnmelden(s, "A1"), "A1 nach Hostverlust").toBe(401);
      expect(await codeAnmelden(s, "C2")).toBe(200);
      expect(await kontoAnmelden(s, "A2")).toBe(200);
    } finally { await s.stoppen(); }
    /* Ohne --zustand ist die Kopie unzulässig. */
    const falsch = werkzeug(["wiederherstellen", "--sicherung", S0, "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung",
      "--widerrufbuch-kopie", kopieOrdner]);
    expect(falsch.code).toBe(2);
    expect(falsch.aus).toMatch(/braucht --zustand/);
  }, LIMIT);
});

describe("BE-3: harter Abbruch (SIGKILL) während der Vereinigung — jedes Buch bleibt gültig", () => {
  it("Abbruch nach dem neuen Buch der Codes: es ist vollständig und gesiegelt, das Konto-Buch unverändert; Wiederholung vollendet", async () => {
    const neu = path.join(T, "kopien", "abbruch-neu");
    await buecherNach(neu);
    await buecherNach(ZUSTAND, ALT);
    const altRoh = { codes: await roh("codes"), konten: await roh("konten") };
    const r = vereinenMitAbbruch([neu], "/zustand/zugang-widerrufe\\.json$");
    expect(r.code, r.aus).not.toBe(0);
    expect(r.aus).toContain("[em6-abbruch] harter Abbruch");
    vergessen();
    const b = await buecherLesen();                 // wirft, wenn ein Buch halb oder falsch gesiegelt wäre
    expect(Object.keys(b.codes.eintraege)).toContain(C.C1.schluessel);
    expect((await roh("konten")).equals(altRoh.konten), "Konto-Buch noch der alte, gültige Stand").toBe(true);
    const w = vereinen([neu]);
    expect(w.code, w.aus).toBe(0);
    vergessen();
    const nach = await buecherLesen();
    expect(Object.keys(nach.konten.konten)).toContain(M.kb.kontoKennung(K.A1.id));
    const z = vereinen([neu]);
    expect(z.aus).toMatch(/Nichts geschrieben/);
  }, LIMIT);

  it("Abbruch beim Aufheben der Eingaben: beide Bücher unverändert und gültig", async () => {
    const neu = path.join(T, "kopien", "abbruch-neu");
    await buecherNach(ZUSTAND, ALT);
    const altRoh = { codes: await roh("codes"), konten: await roh("konten") };
    const r = vereinenMitAbbruch([neu], "vereinen-sicherung/.*/kopie-1-konto-widerrufe\\.json$");
    expect(r.code, r.aus).not.toBe(0);
    expect(r.aus).toContain("[em6-abbruch] harter Abbruch");
    expect((await roh("codes")).equals(altRoh.codes)).toBe(true);
    expect((await roh("konten")).equals(altRoh.konten)).toBe(true);
    vergessen();
    await buecherLesen();
    expect(vereinen([neu]).code).toBe(0);
  }, LIMIT);
});

describe("BE-3: reine Bausteine (feste Uhr)", () => {
  const STUNDE = 3600000;
  const JETZT = Date.parse("2026-11-14T12:00:00.000Z");
  const iso = (ms) => new Date(ms).toISOString();

  it("Alterswarnung: Schwellen als feste Konstanten; Fehler und Rücksprung warnen, sperren nie", () => {
    const L = M.ws.sicherungLage;
    expect(M.ws.SICHERUNG_WARNUNG_STUNDEN).toBe(3);
    expect(M.ws.NACHLAUF_MINUTEN).toBe(90);
    const ok = (h) => ({ ergebnis: "ok", zeit: iso(JETZT - h * STUNDE), letzte_erfolgreiche: iso(JETZT - h * STUNDE) });
    expect(L(ok(2.9), { jetzt: JETZT }).stufe).toBe("ok");
    expect(L(ok(3.0), { jetzt: JETZT }).stufe).toBe("ok");
    expect(L(ok(3.1), { jetzt: JETZT })).toMatchObject({ stufe: "warnung", alterStunden: 3.1 });
    expect(L({ ergebnis: "fehler", schritt: "restic-backup", letzte_erfolgreiche: iso(JETZT - STUNDE) }, { jetzt: JETZT }).text)
      .toMatch(/gescheitert \(Schritt restic-backup\)/);
    /* Eindeutige Exit-Codes: 3 nur Rücksprung, 4 restic, 5 Vergleichsstand fehlt, 78 Konfiguration. */
    expect(M.ws.EXIT_BEDEUTUNG).toMatchObject({ 3: "(Rücksprung)", 4: "(restic gescheitert)", 5: "(Vergleichsstand fehlt)", 78: "(Konfiguration)" });
    expect(L({ ergebnis: "fehler", schritt: "restic-check", code: 4 }, { jetzt: JETZT }).text)
      .toMatch(/gescheitert \(Schritt restic-check, Code 4 \(restic gescheitert\)\)/);
    expect(L({ ergebnis: "fehler", schritt: "konfiguration", code: "78; x" }, { jetzt: JETZT }).text).toMatch(/\(Schritt konfiguration\)/);
    expect(L({ ergebnis: "vergleich-fehlt", letzte_erfolgreiche: iso(JETZT) }, { jetzt: JETZT }))
      .toMatchObject({ stufe: "warnung", ergebnis: "vergleich-fehlt" });
    expect(L({ ergebnis: "ruecksprung", letzte_erfolgreiche: iso(JETZT) }, { jetzt: JETZT }).stufe).toBe("warnung");
    expect(L({ ergebnis: "ok" }, { jetzt: JETZT }).text).toMatch(/keine erfolgreiche Sicherung/);
    expect(L(null, { jetzt: JETZT }).text).toMatch(/nicht lesbar/);
    expect(L({ ergebnis: "<script>", schritt: "x y" }, { jetzt: JETZT })).toMatchObject({ stufe: "warnung", ergebnis: "unbekannt" });
    /* Buch geändert nach der letzten Sicherung: erst nach NACHLAUF_MINUTEN eine Warnung. */
    const st = ok(2);
    expect(L(st, { jetzt: JETZT, buchGeaendertMs: JETZT - 89 * 60000 }).stufe).toBe("ok");
    expect(L(st, { jetzt: JETZT, buchGeaendertMs: JETZT - 91 * 60000 }).text).toMatch(/noch nicht gesichert/);
    expect(L(st, { jetzt: JETZT, buchGeaendertMs: JETZT - 3 * STUNDE }).stufe, "Änderung VOR der Sicherung").toBe("ok");
  });

  it("Vereinigung entfernt nie etwas, nimmt das Maximum der Generation, ist idempotent (Eigenschaft, fester Zufall)", () => {
    let saat = 20261114;
    const zufall = () => { saat = (saat * 1103515245 + 12345) % 2147483648; return saat / 2147483648; };
    const h = (n) => n.toString(16).padStart(64, "0");
    for (let lauf = 0; lauf < 40; lauf++) {
      const a = M.wb.buchNeu(); const b = structuredClone(a);
      const ka = M.kb.kontobuchNeu(); const kb = structuredClone(ka);
      for (let i = 0; i < 12; i++) {
        const ziel = zufall() < 0.5 ? a : b;
        ziel.eintraege[`be3baustein-${Math.floor(zufall() * 20)}-schluessel`] = { am: "2026-11-14T08:00:00.000Z", grund: "t" };
        const kz = zufall() < 0.5 ? ka : kb;
        kz.mitglieder[h(Math.floor(zufall() * 6) + 1)] = { am: "2026-11-14T08:00:00.000Z", grund: "t", generation: 2 + Math.floor(zufall() * 4) };
        if (zufall() < 0.3) (kz.faktorpflicht ||= {})[h(100 + Math.floor(zufall() * 5))] = { am: "2026-11-14T08:00:00.000Z", grund: "t" };
      }
      const e = structuredClone(a); M.ws.codesbuchVereinen(e, b);
      expect(M.ws.fehlendeEintraege(e, a, "codes") + M.ws.fehlendeEintraege(e, b, "codes")).toBe(0);
      expect(M.ws.codesbuchVereinen(e, b), "idempotent").toBe(0);
      const ke = structuredClone(ka); M.ws.kontobuchVereinigen(ke, kb);
      expect(M.ws.fehlendeEintraege(ke, ka, "konten") + M.ws.fehlendeEintraege(ke, kb, "konten")).toBe(0);
      for (const [k, v] of Object.entries(kb.mitglieder)) expect(ke.mitglieder[k].generation).toBeGreaterThanOrEqual(v.generation);
      expect(M.ws.kontobuchVereinigen(ke, kb), "idempotent").toBe(0);
    }
    /* Fremde Herkunft wird erkannt. */
    expect(M.ws.gemeinsameHerkunft(M.wb.buchNeu(), M.wb.buchNeu())).toBe(false);
    /* Ein verschwundenes Buch ist immer ein Befund. */
    expect(M.ws.fehlendeEintraege(null, M.kb.kontobuchNeu(), "konten")).toBe(1);
  });
});
