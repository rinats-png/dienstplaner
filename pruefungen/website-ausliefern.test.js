/* ==========================================================================
   WEBSITE-AUSLIEFERUNG — deploy/website/website-ausliefern.sh,
   website-zurueck.sh und website-vorpruefung.sh, ohne Server

   Geprueft mit gefaelschtem `docker`, `curl` und `df` im PATH und temporaeren
   Verzeichnissen. Der Sites-Ordner steht fuer /opt/proxy/sites (im Container
   /etc/caddy/sites); Variante B: die Website liegt darin unter
   centric-website/ (Vorgabe, keine Variable noetig). Die Attrappen bilden nach,
   was die Skripte brauchen: Container-Pfade zeigen auf die Host-Verzeichnisse,
   validate importiert wie Caddy nur direkte Kinder sites/*.caddy (Liste im
   Log), validate/reload koennen scheitern, die Hauptdomain antwortet nur,
   wenn die Site-Datei liegt. Dies ist kein Nachweis gegen ein echtes Caddy
   (das leistet die Gegenprobe des Skripts auf dem VPS), sondern gegen die
   Ablauflogik: Validierungsfehler -> Rollback ohne Reload, Abbruch ohne
   Aenderung, Bestandskonfiguration byte- und mtime-gleich, Wiederholung
   unschaedlich.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync,
  lstatSync, statSync, readlinkSync, chmodSync, utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SKRIPTE = resolve("deploy/website");
// Der Austausch beruht auf symbolischen Links. Git-Bash unter Windows legt ohne Sonderrecht
// stattdessen Kopien an; dort werden die Laeufe uebersprungen (Linux-CI fuehrt sie aus).
const dl = process.platform === "win32" ? describe.skip : describe;
const istRoot = typeof process.getuid === "function" && process.getuid() === 0;
// Git-Bash (Windows) erwartet /c/... statt C:\...; unter Linux bleibt der Pfad gleich.
const sh = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase());

const DOCKER = `#!/bin/bash
echo "$*" >> "$FAKE_LOG"
# Container-Pfad -> Host-Pfad (Bind-Mounts der Attrappe)
host_pfad() {
  case "$1" in
    /etc/caddy/sites/*) echo "$FAKE_SITES/\${1#/etc/caddy/sites/}" ;;
    /srv/centric-website/*) [ "\${FAKE_WEB_UNMOUNTED:-0}" = 1 ] && return 1; echo "$FAKE_WEB/\${1#/srv/centric-website/}" ;;
    /srv/centric-website) [ "\${FAKE_WEB_UNMOUNTED:-0}" = 1 ] && return 1; echo "$FAKE_WEB" ;;
    *) return 1 ;;
  esac
}
case "$1" in
  inspect)
    case "$*" in
      *Mounts*) printf '%s\\n' "$FAKE_MOUNTS" ;;
      *) echo true ;;
    esac
    exit 0 ;;
  exec)
    shift 2
    case "$1" in
      test)
        real="$(host_pfad "$3")" || exit 1
        test -f "$real"; exit $? ;;
      readlink)
        [ "\${FAKE_READLINK_BAD:-0}" = 1 ] && { echo /nirgendwo; exit 0; }
        real="$(host_pfad "$3")" || exit 1
        aufg="$(readlink -f "$real")" || exit 1
        case "$aufg" in
          "$FAKE_SITES"/*) echo "/etc/caddy/sites/\${aufg#"$FAKE_SITES"/}" ;;
          "$FAKE_WEB"/*) echo "/srv/centric-website/\${aufg#"$FAKE_WEB"/}" ;;
          *) echo "$aufg" ;;
        esac
        exit 0 ;;
      grep)
        args=("$@"); unset 'args[\${#args[@]}-1]'; shift
        [ -f "$FAKE_CADDYFILE" ] || exit 2
        exec grep "\${args[@]:1}" "$FAKE_CADDYFILE" ;;
      caddy)
        case "$2" in
          validate)
            # wie "import sites/*.caddy": nur direkte Kinder, die auf .caddy enden
            nam=""; for f in "$FAKE_SITES"/*.caddy; do [ -f "$f" ] && nam="$nam $(basename "$f")"; done
            echo "IMPORT:$nam" >> "$FAKE_LOG"
            [ "\${FAKE_VALIDATE_FAIL:-0}" = 1 ] && { echo "Error: Caddyfile (attrappe)" >&2; exit 1; }
            exit 0 ;;
          adapt)
            if [ -f "$FAKE_SITES/centric-dienstplanung.de.caddy" ] && [ "\${FAKE_ADAPT_EMPTY:-0}" != 1 ]; then
              echo '{"apps":{"http":{"servers":{"srv0":{"routes":[{"match":[{"host":["centric-dienstplanung.de"]}]}]}}}}}'
            else echo '{}'; fi
            exit 0 ;;
          reload) [ "\${FAKE_RELOAD_FAIL:-0}" = 1 ] && exit 1; exit 0 ;;
        esac ;;
    esac ;;
esac
exit 0
`;
const CURL = `#!/bin/bash
url="\${@: -1}"
host="\${url#https://}"; host="\${host%%/*}"
case "$url" in
  *gibt-es-nicht*) printf 404; exit 0 ;;
esac
if [ "$host" = "app.centric-dienstplanung.de" ]; then printf "%s" "\${FAKE_APP_CODE:-200}"; exit 0; fi
if [ -f "$FAKE_SITES/centric-dienstplanung.de.caddy" ]; then printf "%s" "\${FAKE_MAIN_CODE:-200}"; else printf 404; fi
`;
// df -P: Attrappe nur, wenn FAKE_DF_KB gesetzt ist; sonst das echte df.
const DF = `#!/bin/bash
if [ -n "$FAKE_DF_KB" ]; then
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\nattrappe 99999999 1 %s 1%% /\\n' "$FAKE_DF_KB"
else
  command -p df "$@"
fi
`;

let wurzel, sites, web, dist, bin, log, caddyfile;

const APP_INHALT = "app.centric-dienstplanung.de {\n\treverse_proxy centric-dp-web:3000\n}\n";
const MOUNTS_SOLL = (s) =>
  ["/opt/proxy/config|/config|rw", "/opt/proxy/data|/data|rw", "/opt/proxy/Caddyfile|/etc/caddy/Caddyfile|ro", `${s}|/etc/caddy/sites|ro`].join("\n");

// Inhalt des Baums; fehlt das Verzeichnis, ist der Baum leer.
function baum(dir, ohne = []) {
  const aus = {};
  if (!existsSync(dir)) return aus;
  const geh = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name), r = rel + "/" + e.name;
      if (ohne.includes(r)) continue;
      if (e.isSymbolicLink()) aus[r] = "-> " + readlinkSync(p);
      else if (e.isDirectory()) { aus[r] = "dir"; geh(p, r); }
      else aus[r] = readFileSync(p, "utf8");
    }
  };
  geh(dir, "");
  return aus;
}
// Sites-Ordner ohne das, was die Skripte schreiben duerfen (eigene Datei und centric-website/).
const bestand = () => baum(sites, ["/centric-dienstplanung.de.caddy", "/centric-website"]);
// Inhalt + Zeitstempel + Rechte der Bestandsdateien (direkte Kinder des Sites-Ordners ausser den eigenen).
function bestandMeta() {
  const aus = {};
  for (const n of readdirSync(sites)) {
    if (n === "centric-dienstplanung.de.caddy" || n === "centric-website") continue;
    const p = join(sites, n), st = lstatSync(p);
    aus[n] = { inhalt: st.isFile() ? readFileSync(p, "utf8") : "dir", mtimeMs: st.mtimeMs, mode: st.mode, size: st.size };
  }
  return aus;
}

function lauf(skript, args = [], env = {}) {
  const e = {
    ...process.env,
    FAKEBIN: sh(bin), FAKE_LOG: sh(log), FAKE_SITES: sh(sites), FAKE_WEB: sh(web), FAKE_CADDYFILE: sh(caddyfile),
    FAKE_MOUNTS: MOUNTS_SOLL(sh(sites)),
    SITES_DIR_HOST: sh(sites),   // einzige Angabe; Container-Name, WEB_DIR_HOST und WEB_ROOT_CONTAINER = Vorgaben
    GEGENPROBE_VERSUCHE: "2", GEGENPROBE_PAUSE: "0",
    ...env,
  };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  const r = spawnSync("bash", ["-c", 'umask "${UMASK_TEST:-0022}"; PATH="$FAKEBIN:$PATH"; exec bash "$0" "$@"', sh(join(SKRIPTE, skript)), ...args], { env: e, encoding: "utf8", timeout: 60000 });
  return { code: r.status, aus: (r.stdout || "") + (r.stderr || ""), docker: existsSync(log) ? readFileSync(log, "utf8") : "" };
}
const ausliefern = (env) => lauf("website-ausliefern.sh", [sh(dist)], env);
const zaehle = (text, muster) => (text.match(muster) || []).length;

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), "website-test-"));
  sites = join(wurzel, "sites"); web = join(sites, "centric-website"); dist = join(wurzel, "dist"); bin = join(wurzel, "bin");
  log = join(wurzel, "docker.log"); caddyfile = join(wurzel, "Caddyfile");
  for (const d of [sites, dist, join(dist, "assets"), bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(sites, "app.centric-dienstplanung.de.caddy"), APP_INHALT);
  writeFileSync(join(sites, "andere.beispiel.caddy"), "andere.beispiel { respond 204 }\n");
  writeFileSync(join(sites, "notizen.txt"), "keine caddy-Datei\n");
  // Bestandsdateien bewusst alt: jede Beruehrung faellt an mtime auf.
  const alt = new Date("2020-01-02T03:04:05Z");
  for (const n of readdirSync(sites)) utimesSync(join(sites, n), alt, alt);
  writeFileSync(caddyfile, "{\n\temail x@example.invalid\n}\nimport sites/*.caddy\n");
  writeFileSync(join(dist, "index.html"), "<html>start</html>");
  writeFileSync(join(dist, "404.html"), "<html>404</html>");
  writeFileSync(join(dist, "assets", "site.js"), "x");
  writeFileSync(join(bin, "docker"), DOCKER); writeFileSync(join(bin, "curl"), CURL); writeFileSync(join(bin, "df"), DF);
  for (const f of ["docker", "curl", "df"]) chmodSync(join(bin, f), 0o755);
});
afterEach(() => {
  try { chmodSync(sites, 0o755); } catch { /* schon weg */ }
  try { chmodSync(web, 0o755); } catch { /* nicht angelegt */ }
  rmSync(wurzel, { recursive: true, force: true });
});

dl("Vorgaben (bestaetigter VPS-Stand)", () => {
  const vorgabe = (env) => {
    const e = { ...process.env };
    for (const k of ["CADDY_CONTAINER", "SITES_DIR_HOST", "WEB_DIR_HOST", "WEB_ROOT_CONTAINER", "SITES_DIR_CONTAINER"]) delete e[k];
    const r = spawnSync("bash", ["-c", '. "$0"; echo "$CADDY_CONTAINER|$SITES_DIR_HOST|$WEB_DIR_HOST|$WEB_ROOT_CONTAINER"', sh(join(SKRIPTE, "website-lib.sh"))], { env: { ...e, ...env }, encoding: "utf8" });
    return r.stdout.trim();
  };
  it("ohne jede Variable: caddy, /opt/proxy/sites, .../centric-website, /etc/caddy/sites/centric-website", () => {
    expect(vorgabe({})).toBe("caddy|/opt/proxy/sites|/opt/proxy/sites/centric-website|/etc/caddy/sites/centric-website");
  });
  it("jeweils ueberschreibbar; Container-Pfad folgt dem Ort innerhalb des Sites-Ordners", () => {
    expect(vorgabe({ CADDY_CONTAINER: "proxy" }).startsWith("proxy|")).toBe(true);
    expect(vorgabe({ SITES_DIR_HOST: "/a/b" })).toBe("caddy|/a/b|/a/b/centric-website|/etc/caddy/sites/centric-website");
    expect(vorgabe({ WEB_DIR_HOST: "/opt/proxy/sites/andere-web" })).toContain("|/etc/caddy/sites/andere-web");
    expect(vorgabe({ WEB_DIR_HOST: "/srv/ausserhalb" })).toContain("|/srv/ausserhalb|/srv/centric-website");
    expect(vorgabe({ WEB_ROOT_CONTAINER: "/x/y" })).toContain("|/x/y");
  });
});

dl("website-ausliefern.sh", () => {
  it("liefert aus mit Vorgaben allein: legt centric-website selbst an, Link, Site-Datei, validate vor reload, App unberuehrt", () => {
    expect(existsSync(web)).toBe(false);
    const vor = bestandMeta();
    const r = ausliefern();
    expect(r.code, r.aus).toBe(0);
    expect(lstatSync(join(web, "aktuell")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(web, "aktuell"))).toMatch(/^releases\/[^/]+$/); // relativ -> loest im Container auf
    expect(readFileSync(join(web, "aktuell", "index.html"), "utf8")).toBe("<html>start</html>");
    const site = readFileSync(join(sites, "centric-dienstplanung.de.caddy"), "utf8");
    expect(site).toContain("root * /etc/caddy/sites/centric-website/aktuell");
    expect(site).toContain("redir https://centric-dienstplanung.de{uri} permanent");
    expect(bestandMeta()).toEqual(vor);
    expect(r.docker.indexOf("caddy validate")).toBeGreaterThanOrEqual(0);
    expect(r.docker.indexOf("caddy validate")).toBeLessThan(r.docker.indexOf("caddy reload"));
    expect(r.docker).toContain("caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile");
    expect(r.docker).toContain("caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile");
    expect(r.docker).not.toMatch(/\b(restart|stop|kill|rm|compose)\b/); // kein Container-Neustart
    expect(r.docker).toContain("exec caddy test -f /etc/caddy/sites/centric-website/aktuell/index.html");
    expect(r.docker).toContain("exec caddy test -f /etc/caddy/sites/app.centric-dienstplanung.de.caddy");
    expect(r.docker).toContain("exec caddy test -f /etc/caddy/sites/centric-dienstplanung.de.caddy");
    expect(r.docker).toContain("exec caddy readlink -f /etc/caddy/sites/centric-website/aktuell");
    expect(r.aus).toContain("FERTIG");
    expect(r.aus).toContain("sudo -E");
    // im Sites-Ordner: nur die eigene Datei und centric-website/ sind neu; keine Punktdateien
    expect(readdirSync(sites).sort()).toEqual(["andere.beispiel.caddy", "app.centric-dienstplanung.de.caddy", "centric-dienstplanung.de.caddy", "centric-website", "notizen.txt"]);
  });

  it("Sicherungs-Kopien unter sicherung/ werden von 'import sites/*.caddy' nicht erfasst (nur direkte Kinder)", () => {
    expect(ausliefern().code).toBe(0);
    const r2 = ausliefern(); // zweiter Lauf: Sicherung des ersten liegt jetzt schon unter centric-website/
    expect(r2.code, r2.aus).toBe(0);
    // Die Attrappe validiert wie Caddy: Glob sites/*.caddy. Sie meldet, was sie laedt.
    const importe = r2.docker.split("\n").filter((z) => z.startsWith("IMPORT:"));
    expect(importe.length).toBeGreaterThanOrEqual(1);
    for (const z of importe) expect(z.trim().split(/\s+/).slice(1).sort()).toEqual(["andere.beispiel.caddy", "app.centric-dienstplanung.de.caddy", "centric-dienstplanung.de.caddy"]);
    // Die Sicherungen enthalten .caddy-Kopien (tiefer verschachtelt) -- und genau deshalb sind sie nicht im Import.
    const sicherungen = readdirSync(join(web, "sicherung")).sort();
    expect(sicherungen.length).toBe(2);
    const kopien = readdirSync(join(web, "sicherung", sicherungen[0], "sites")).sort();
    expect(kopien).toEqual(["andere.beispiel.caddy", "app.centric-dienstplanung.de.caddy"]);
    const direkte = readdirSync(sites).filter((n) => n.endsWith(".caddy") && lstatSync(join(sites, n)).isFile());
    expect(direkte.sort()).toEqual(["andere.beispiel.caddy", "app.centric-dienstplanung.de.caddy", "centric-dienstplanung.de.caddy"]);
    expect(lstatSync(web).isDirectory() && !web.endsWith(".caddy")).toBe(true);
  });

  it("Rechte werden normalisiert (auch bei umask 077 und scharfen dist-Rechten): Caddy-Container kann lesen", () => {
    chmodSync(join(dist, "index.html"), 0o600);
    chmodSync(join(dist, "assets"), 0o700);
    chmodSync(join(dist, "assets", "site.js"), 0o700);
    const r = ausliefern({ UMASK_TEST: "0077" });
    expect(r.code, r.aus).toBe(0);
    const m = (p) => statSync(p).mode & 0o777;
    expect(m(web)).toBe(0o755);
    expect(m(join(web, "releases"))).toBe(0o755);
    expect(m(join(web, "aktuell"))).toBe(0o755);
    expect(m(join(web, "aktuell", "index.html"))).toBe(0o644);
    expect(m(join(web, "aktuell", "404.html"))).toBe(0o644);
    expect(m(join(web, "aktuell", "assets"))).toBe(0o755);
    expect(m(join(web, "aktuell", "assets", "site.js"))).toBe(0o755); // x bleibt (X), Lesen fuer alle
    expect(m(join(sites, "centric-dienstplanung.de.caddy"))).toBe(0o644);
  });

  it("Bestandskonfiguration byte- und mtime-gleich: Erfolg, Zweitlauf und Rueckweg", () => {
    const vor = bestandMeta();
    expect(ausliefern().code).toBe(0);
    expect(bestandMeta()).toEqual(vor);
    expect(ausliefern().code).toBe(0);
    expect(bestandMeta()).toEqual(vor);
    expect(lauf("website-zurueck.sh").code).toBe(0);
    expect(bestandMeta()).toEqual(vor);
  });

  const FEHLER = [
    ["Validierungsfehler", { FAKE_VALIDATE_FAIL: "1" }],
    ["Reload-Fehler", { FAKE_RELOAD_FAIL: "1" }],
    ["Gegenprobe-Fehler", { FAKE_MAIN_CODE: "502" }],
    ["Hauptdomain fehlt in der angepassten Konfiguration", { FAKE_ADAPT_EMPTY: "1" }],
    ["Link loest im Container nicht auf", { FAKE_READLINK_BAD: "1" }],
  ];
  it.each(FEHLER)("%s: Rollback; Bestandsdateien (App) byte- und mtime-gleich, eigene Datei weg, keine Reste", (_n, env) => {
    const vor = bestandMeta();
    const r = ausliefern(env);
    expect(r.code).toBe(1);
    expect(r.aus).toContain("ROLLBACK");
    expect(bestandMeta()).toEqual(vor);
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(false);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
    expect(readdirSync(sites).filter((n) => n.startsWith("."))).toEqual([]);
    expect(readdirSync(sites).sort()).toEqual(["andere.beispiel.caddy", "app.centric-dienstplanung.de.caddy", "centric-website", "notizen.txt"]);
  });

  it("Validierungsfehler: Caddy wurde nie neu geladen (Datei VOR dem Reload zurueckgenommen)", () => {
    const r = ausliefern({ FAKE_VALIDATE_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(r.docker).toContain("caddy validate");
    expect(r.docker).not.toContain("caddy reload");
    expect(r.aus).toContain("NICHT neu geladen");
    expect(r.aus).toContain("Caddy lief durchgehend mit der alten Konfiguration");
  });

  it("Validierungsfehler bei vorhandener Altfassung: Altfassung kommt zurueck", () => {
    expect(ausliefern().code).toBe(0);
    const siteAlt = readFileSync(join(sites, "centric-dienstplanung.de.caddy"), "utf8");
    const linkAlt = readlinkSync(join(web, "aktuell"));
    writeFileSync(join(dist, "index.html"), "<html>neu</html>");
    const r = ausliefern({ FAKE_VALIDATE_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(readFileSync(join(sites, "centric-dienstplanung.de.caddy"), "utf8")).toBe(siteAlt);
    expect(readlinkSync(join(web, "aktuell"))).toBe(linkAlt);
    expect(readFileSync(join(web, "aktuell", "index.html"), "utf8")).toBe("<html>start</html>");
  });

  it("Gegenprobe-Fehler: Rollback inklusive erneutem validate und Reload (zwei Reloads insgesamt)", () => {
    const r = ausliefern({ FAKE_MAIN_CODE: "502" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Gegenprobe nicht bestanden");
    expect(zaehle(r.docker, /caddy reload/g)).toBe(2);
    expect(zaehle(r.docker, /caddy validate/g)).toBe(2);
    expect(r.aus).toContain("alter Zustand wieder geladen");
  });

  it("Reload-Fehler: Rollback versucht erneut zu laden", () => {
    const r = ausliefern({ FAKE_RELOAD_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(zaehle(r.docker, /caddy reload/g)).toBeGreaterThanOrEqual(2);
  });

  it("fehlendes index.html: Abbruch ohne jede Aenderung (auch centric-website/ wird nicht angelegt)", () => {
    rmSync(join(dist, "index.html"));
    const sVor = baum(sites);
    const r = ausliefern();
    expect(r.code).toBe(1);
    expect(r.aus).toContain("index.html fehlt");
    expect(baum(sites)).toEqual(sVor);
    expect(existsSync(web)).toBe(false);
    expect(r.docker).not.toMatch(/caddy (validate|reload)/);
  });

  it("fehlendes assets/ oder 404.html: Abbruch ohne Aenderung", () => {
    rmSync(join(dist, "assets"), { recursive: true });
    const sVor = baum(sites);
    expect(ausliefern().code).toBe(1);
    expect(baum(sites)).toEqual(sVor);
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "assets", "x"), "x");
    rmSync(join(dist, "404.html"));
    expect(ausliefern().code).toBe(1);
    expect(baum(sites)).toEqual(sVor);
  });

  it("App antwortet vorab nicht 200: Abbruch ohne Aenderung", () => {
    const sVor = baum(sites);
    const r = ausliefern({ FAKE_APP_CODE: "502" });
    expect(r.code).toBe(1);
    expect(baum(sites)).toEqual(sVor);
    expect(existsSync(web)).toBe(false);
    expect(r.docker).not.toMatch(/caddy (validate|reload)/);
  });

  it("zu wenig freier Platz (df-Attrappe): Abbruch ohne Aenderung", () => {
    const sVor = baum(sites);
    const r = ausliefern({ FAKE_DF_KB: "100" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Zu wenig freier Platz");
    expect(baum(sites)).toEqual(sVor);
    expect(existsSync(web)).toBe(false);
    expect(r.docker).not.toMatch(/caddy (validate|reload)/);
  });

  it("Platzbedarf: genau die Reserve (50 MB) reicht nicht, dist x 3 + 50 MB reicht", () => {
    expect(ausliefern({ FAKE_DF_KB: "51200" }).code).toBe(1);   // 0 KB fuer die Fassung
    const kb = Number(spawnSync("du", ["-sk", sh(dist)], { encoding: "utf8" }).stdout.split(/\s+/)[0]);
    expect(kb).toBeGreaterThan(0);
    expect(ausliefern({ FAKE_DF_KB: String(kb * 3 + 51200 - 1) }).code).toBe(1);
    const r = ausliefern({ FAKE_DF_KB: String(kb * 3 + 51200) });
    expect(r.code, r.aus).toBe(0);
  });

  it.skipIf(istRoot)("kein Schreibrecht auf den Sites-Ordner: klare Meldung 'sudo -E', nichts geaendert", () => {
    const sVor = baum(sites);
    chmodSync(sites, 0o555);
    const r = ausliefern();
    chmodSync(sites, 0o755);
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Kein Schreibrecht auf");
    expect(r.aus).toContain("sudo -E");
    expect(baum(sites)).toEqual(sVor);
    expect(r.docker).not.toMatch(/caddy (validate|reload)/);
  });

  it.skipIf(istRoot)("kein Schreibrecht auf centric-website/: klare Meldung 'sudo -E', nichts geaendert", () => {
    mkdirSync(web);
    chmodSync(web, 0o555);
    const r = ausliefern();
    chmodSync(web, 0o755);
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Kein Schreibrecht auf");
    expect(r.aus).toContain("sudo -E");
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(false);
    expect(readdirSync(web)).toEqual([]);
  });

  it("Web-Verzeichnis im Container nicht eingehaengt (anderer Ort ausserhalb Sites): Abbruch, Sites-Ordner unveraendert", () => {
    const aussen = join(wurzel, "aussen");
    mkdirSync(aussen);
    web = aussen; // Host-Seite der Attrappe fuer /srv/centric-website
    const sVor = baum(sites);
    const r = ausliefern({ WEB_DIR_HOST: sh(aussen), FAKE_WEB: sh(aussen), FAKE_WEB_UNMOUNTED: "1" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("nicht sichtbar");
    expect(baum(sites)).toEqual(sVor);
    expect(existsSync(join(aussen, "aktuell"))).toBe(false);
    expect(r.docker).not.toContain("caddy validate");
  });

  it("falscher SITES_DIR_HOST (keine App-Datei): Abbruch ohne Aenderung, nichts angelegt", () => {
    const leer = join(wurzel, "leer");
    mkdirSync(leer);
    const r = ausliefern({ SITES_DIR_HOST: sh(leer) });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("falscher SITES_DIR_HOST");
    expect(readdirSync(leer)).toEqual([]);
  });

  it("Container sieht die App-Datei nicht (Pfadzuordnung falsch): Abbruch ohne Aenderung", () => {
    const sVor = baum(sites);
    const r = ausliefern({ SITES_DIR_CONTAINER: "/etc/caddy/anderswo" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("nicht der eingehaengte Ordner");
    expect(baum(sites)).toEqual(sVor);
  });

  it("Caddyfile ohne 'import sites/*.caddy': Abbruch ohne Aenderung", () => {
    writeFileSync(caddyfile, "{\n}\nexample.invalid { respond 204 }\n");
    const sVor = baum(sites);
    const r = ausliefern();
    expect(r.code).toBe(1);
    expect(r.aus).toContain("import sites/*.caddy");
    expect(baum(sites)).toEqual(sVor);
    expect(existsSync(web)).toBe(false);
  });

  it("ungueltige Einstellungen: Abbruch, nichts angelegt", () => {
    const sVor = baum(sites);
    expect(ausliefern({ WEB_DIR_HOST: "relativ/pfad" }).code).toBe(1);
    expect(ausliefern({ WEB_DIR_HOST: sh(sites) }).code).toBe(1);
    expect(ausliefern({ CADDY_CONTAINER: "a; rm -rf /" }).code).toBe(1);
    expect(ausliefern({ WEB_DIR_HOST: sh(join(wurzel, "nicht-da")) }).code).toBe(1);          // ausserhalb Sites und nicht vorhanden
    expect(ausliefern({ WEB_DIR_HOST: sh(join(sites, "a", "b")) }).code).toBe(1);             // tiefer als ein Unterordner
    expect(ausliefern({ WEB_DIR_HOST: sh(join(sites, "web.caddy")) }).code).toBe(1);          // wuerde vom Import erfasst
    expect(baum(sites)).toEqual(sVor);
  });

  it("Wiederholung ist unschaedlich: gleiche Site-Datei, Link auf neueste Fassung, App unberuehrt", () => {
    const app = baum(sites)["/app.centric-dienstplanung.de.caddy"];
    expect(ausliefern().code).toBe(0);
    const site1 = readFileSync(join(sites, "centric-dienstplanung.de.caddy"), "utf8");
    const r2 = ausliefern();
    expect(r2.code, r2.aus).toBe(0);
    expect(readFileSync(join(sites, "centric-dienstplanung.de.caddy"), "utf8")).toBe(site1);
    expect(baum(sites)["/app.centric-dienstplanung.de.caddy"]).toBe(app);
    expect(readdirSync(join(web, "releases")).length).toBe(2);
    expect(readdirSync(join(web, "releases")).map((n) => "releases/" + n)).toContain(readlinkSync(join(web, "aktuell")));
  });

  it("anderer Container-Pfad (WEB_ROOT_CONTAINER), den der Container nicht sieht: Rollback", () => {
    const r = ausliefern({ WEB_ROOT_CONTAINER: "/etc/caddy/sites/_web" });
    expect(r.code).toBe(1);
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(false);
  });
});

dl("website-zurueck.sh", () => {
  it("nach dem ersten Lauf: Site-Datei und Link weg, App unberuehrt, validate vor reload", () => {
    const vor = bestandMeta();
    expect(ausliefern().code).toBe(0);
    writeFileSync(log, "");
    const r = lauf("website-zurueck.sh");
    expect(r.code, r.aus).toBe(0);
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(false);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
    expect(bestandMeta()).toEqual(vor);
    expect(r.docker.indexOf("caddy validate")).toBeLessThan(r.docker.indexOf("caddy reload"));
    expect(r.docker).not.toMatch(/\b(restart|stop|kill|compose)\b/);
  });

  it("nach zwei Laeufen: zurueck auf die erste Fassung", () => {
    expect(ausliefern().code).toBe(0);
    const erste = readlinkSync(join(web, "aktuell"));
    writeFileSync(join(dist, "index.html"), "<html>zweite</html>");
    expect(ausliefern().code).toBe(0);
    expect(readFileSync(join(web, "aktuell", "index.html"), "utf8")).toBe("<html>zweite</html>");
    const r = lauf("website-zurueck.sh");
    expect(r.code, r.aus).toBe(0);
    expect(readlinkSync(join(web, "aktuell"))).toBe(erste);
    expect(readFileSync(join(web, "aktuell", "index.html"), "utf8")).toBe("<html>start</html>");
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(true);
  });

  it("explizit mit Stempel: stellt genau den Zustand vor diesem Lauf wieder her", () => {
    expect(ausliefern().code).toBe(0);
    const stempel = readdirSync(join(web, "sicherung"))[0];
    expect(ausliefern().code).toBe(0);
    const r = lauf("website-zurueck.sh", [stempel]);
    expect(r.code, r.aus).toBe(0);
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(false);
  });

  it("Validierungsfehler im Rueckweg: kein Reload", () => {
    expect(ausliefern().code).toBe(0);
    writeFileSync(log, "");
    const r = lauf("website-zurueck.sh", [], { FAKE_VALIDATE_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(r.docker).not.toContain("caddy reload");
  });

  it("ohne Sicherungen: Abbruch, nichts geaendert", () => {
    const sVor = baum(sites);
    const r = lauf("website-zurueck.sh");
    expect(r.code).toBe(1);
    expect(baum(sites)).toEqual(sVor);
  });

  it("ungueltiger oder unbekannter Stempel: Abbruch", () => {
    expect(ausliefern().code).toBe(0);
    expect(lauf("website-zurueck.sh", ["../x"]).code).toBe(1);
    expect(lauf("website-zurueck.sh", ["20000101T000000Z-1"]).code).toBe(1);
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(true);
  });
});

dl("website-vorpruefung.sh", () => {
  it("bestaetigter Stand: OK-Zeilen fuer alle Mounts, import-Zeile, App-Datei; rein lesend; Befehle fuer Variante B", () => {
    const vor = baum(sites);
    const r = lauf("website-vorpruefung.sh");
    expect(r.code, r.aus).toBe(0);
    for (const z of ["/opt/proxy/config -> /config (rw)", "/opt/proxy/data -> /data (rw)", "/opt/proxy/Caddyfile -> /etc/caddy/Caddyfile (ro)", "/etc/caddy/sites (ro)"]) {
      expect(r.aus, z).toContain("OK: " + (z.startsWith("/etc") ? sh(sites) + " -> " : "") + z);
    }
    expect(r.aus).toContain("OK: enthaelt 'import sites/*.caddy'");
    expect(r.aus).toContain("OK: App-Datei app.centric-dienstplanung.de.caddy liegt dort");
    expect(r.aus).toContain("sudo -E ./website-ausliefern.sh ~/website-dist");
    expect(r.aus).toContain("sudo -E ./website-zurueck.sh <stempel>");
    expect(r.aus).not.toContain("ABWEICHUNG");
    expect(baum(sites)).toEqual(vor);
    expect(existsSync(web)).toBe(false);
    expect(r.docker).not.toMatch(/caddy (reload|validate)/);
  });

  it("Abweichung (Sites-Mount beschreibbar statt ro, /data fehlt): deutlich gemeldet, kein Ausliefern empfohlen", () => {
    const mounts = ["/opt/proxy/config|/config|rw", "/opt/proxy/Caddyfile|/etc/caddy/Caddyfile|ro", `${sh(sites)}|/etc/caddy/sites|rw`].join("\n");
    const r = lauf("website-vorpruefung.sh", [], { FAKE_MOUNTS: mounts });
    expect(r.aus).toContain("ABWEICHUNG: erwartet /opt/proxy/data -> /data (rw)");
    expect(r.aus).toContain(`ABWEICHUNG: erwartet ${sh(sites)} -> /etc/caddy/sites (ro)`);
    expect(r.aus).toContain("NICHT ausliefern");
    expect(r.aus).not.toContain("sudo -E ./website-ausliefern.sh");
  });

  it("Caddyfile ohne import-Zeile: Abweichung", () => {
    writeFileSync(caddyfile, "{\n}\n");
    const r = lauf("website-vorpruefung.sh");
    expect(r.aus).toContain("ABWEICHUNG: keine Zeile 'import sites/*.caddy'");
  });
});
