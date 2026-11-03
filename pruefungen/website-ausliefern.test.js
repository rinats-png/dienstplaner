/* ==========================================================================
   WEBSITE-AUSLIEFERUNG — deploy/website/website-ausliefern.sh und
   website-zurueck.sh, ohne Server

   Geprueft mit gefaelschtem `docker` und `curl` im PATH und temporaeren
   Verzeichnissen (Sites-Ordner und Web-Ordner stehen fuer die Host-Seite der
   Bind-Mounts des Caddy-Containers). Die Attrappen bilden nach, was die Skripte
   brauchen: Container-Pfade zeigen auf die Host-Verzeichnisse, validate und
   reload koennen scheitern, die Hauptdomain antwortet nur, wenn die Site-Datei
   liegt. Dies ist kein Nachweis gegen ein echtes Caddy (das leistet die
   Gegenprobe des Skripts auf dem VPS), sondern gegen die Ablauflogik:
   Validierungsfehler -> Rollback, unvollstaendiges dist -> Abbruch ohne
   Aenderung, App-Datei unberuehrt, Wiederholung unschaedlich.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, lstatSync, readlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SKRIPTE = resolve("deploy/website");
// Der Austausch beruht auf symbolischen Links. Git-Bash unter Windows legt ohne Sonderrecht
// stattdessen Kopien an; dort werden die Laeufe uebersprungen (Linux-CI fuehrt sie aus).
const dl = process.platform === "win32" ? describe.skip : describe;
// Git-Bash (Windows) erwartet /c/... statt C:\...; unter Linux bleibt der Pfad gleich.
const sh = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase());

const DOCKER = `#!/bin/bash
echo "$*" >> "$FAKE_LOG"
case "$1" in
  inspect) echo true; exit 0 ;;
  exec)
    shift 2
    case "$1" in
      test)
        p="$3"
        case "$p" in
          /etc/caddy/sites/*) real="$FAKE_SITES/\${p#/etc/caddy/sites/}" ;;
          /srv/centric-website/*) [ "\${FAKE_WEB_UNMOUNTED:-0}" = 1 ] && exit 1; real="$FAKE_WEB/\${p#/srv/centric-website/}" ;;
          *) exit 1 ;;
        esac
        test -f "$real"; exit $? ;;
      caddy)
        case "$2" in
          validate) [ "\${FAKE_VALIDATE_FAIL:-0}" = 1 ] && { echo "Error: Caddyfile (attrappe)" >&2; exit 1; }; exit 0 ;;
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

let wurzel, sites, web, dist, bin, log;

function baum(dir) {
  const aus = {};
  const geh = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name), r = rel + "/" + e.name;
      if (e.isSymbolicLink()) aus[r] = "-> " + readlinkSync(p);
      else if (e.isDirectory()) { aus[r] = "dir"; geh(p, r); }
      else aus[r] = readFileSync(p, "utf8");
    }
  };
  geh(dir, "");
  return aus;
}

function lauf(skript, args = [], env = {}) {
  const e = {
    ...process.env,
    FAKEBIN: sh(bin), FAKE_LOG: sh(log), FAKE_SITES: sh(sites), FAKE_WEB: sh(web),
    CADDY_CONTAINER: "caddy-attrappe", SITES_DIR_HOST: sh(sites), WEB_DIR_HOST: sh(web),
    GEGENPROBE_VERSUCHE: "2", GEGENPROBE_PAUSE: "0",
    ...env,
  };
  const r = spawnSync("bash", ["-c", 'PATH="$FAKEBIN:$PATH"; exec bash "$0" "$@"', sh(join(SKRIPTE, skript)), ...args], { env: e, encoding: "utf8", timeout: 60000 });
  return { code: r.status, aus: (r.stdout || "") + (r.stderr || ""), docker: existsSync(log) ? readFileSync(log, "utf8") : "" };
}
const ausliefern = (env) => lauf("website-ausliefern.sh", [sh(dist)], env);

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), "website-test-"));
  sites = join(wurzel, "sites"); web = join(wurzel, "web"); dist = join(wurzel, "dist"); bin = join(wurzel, "bin"); log = join(wurzel, "docker.log");
  for (const d of [sites, web, dist, join(dist, "assets"), bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(sites, "app.centric-dienstplanung.de.caddy"), "app.centric-dienstplanung.de {\n\treverse_proxy centric-dp-web:3000\n}\n");
  writeFileSync(join(sites, "andere.beispiel.caddy"), "andere.beispiel { respond 204 }\n");
  writeFileSync(join(dist, "index.html"), "<html>start</html>");
  writeFileSync(join(dist, "404.html"), "<html>404</html>");
  writeFileSync(join(dist, "assets", "site.js"), "x");
  writeFileSync(join(bin, "docker"), DOCKER); writeFileSync(join(bin, "curl"), CURL);
  chmodSync(join(bin, "docker"), 0o755); chmodSync(join(bin, "curl"), 0o755);
});
afterEach(() => rmSync(wurzel, { recursive: true, force: true }));

dl("website-ausliefern.sh", () => {
  it("liefert aus: Link, Site-Datei, validate vor reload, App-Datei unberuehrt", () => {
    const appVorher = readFileSync(join(sites, "app.centric-dienstplanung.de.caddy"), "utf8");
    const r = ausliefern();
    expect(r.code, r.aus).toBe(0);
    expect(lstatSync(join(web, "aktuell")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(web, "aktuell", "index.html"), "utf8")).toBe("<html>start</html>");
    const site = readFileSync(join(sites, "centric-dienstplanung.de.caddy"), "utf8");
    expect(site).toContain("root * /srv/centric-website/aktuell");
    expect(site).toContain("redir https://centric-dienstplanung.de{uri} permanent");
    expect(readFileSync(join(sites, "app.centric-dienstplanung.de.caddy"), "utf8")).toBe(appVorher);
    expect(r.docker.indexOf("caddy validate")).toBeGreaterThanOrEqual(0);
    expect(r.docker.indexOf("caddy validate")).toBeLessThan(r.docker.indexOf("caddy reload"));
    expect(r.aus).toContain("FERTIG");
    // genau eine neue Datei im Sites-Ordner, keine Reste
    expect(readdirSync(sites).sort()).toEqual(["andere.beispiel.caddy", "app.centric-dienstplanung.de.caddy", "centric-dienstplanung.de.caddy"]);
  });

  it("Validierungsfehler: kein Reload, eigene Datei und Link zurueck, Rest unveraendert", () => {
    const vorher = baum(sites);
    const r = ausliefern({ FAKE_VALIDATE_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("ROLLBACK");
    expect(r.docker).not.toContain("caddy reload");
    expect(baum(sites)).toEqual(vorher);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
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

  it("Reload-Fehler: Rollback inklusive erneutem Reload", () => {
    const vorher = baum(sites);
    const r = ausliefern({ FAKE_RELOAD_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(baum(sites)).toEqual(vorher);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
    expect((r.docker.match(/caddy reload/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it("Gegenprobe scheitert (Hauptdomain 502): Rollback", () => {
    const vorher = baum(sites);
    const r = ausliefern({ FAKE_MAIN_CODE: "502" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Gegenprobe nicht bestanden");
    expect(baum(sites)).toEqual(vorher);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
  });

  it("fehlendes index.html: Abbruch ohne jede Aenderung", () => {
    rmSync(join(dist, "index.html"));
    const sVor = baum(sites), wVor = baum(web);
    const r = ausliefern();
    expect(r.code).toBe(1);
    expect(r.aus).toContain("index.html fehlt");
    expect(baum(sites)).toEqual(sVor);
    expect(baum(web)).toEqual(wVor);
    expect(r.docker).not.toMatch(/caddy (validate|reload)/);
  });

  it("fehlendes assets/ oder 404.html: Abbruch ohne Aenderung", () => {
    rmSync(join(dist, "assets"), { recursive: true });
    const wVor = baum(web);
    expect(ausliefern().code).toBe(1);
    expect(baum(web)).toEqual(wVor);
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "assets", "x"), "x");
    rmSync(join(dist, "404.html"));
    expect(ausliefern().code).toBe(1);
    expect(baum(web)).toEqual(wVor);
  });

  it("App antwortet vorab nicht 200: Abbruch ohne Aenderung", () => {
    const sVor = baum(sites), wVor = baum(web);
    const r = ausliefern({ FAKE_APP_CODE: "502" });
    expect(r.code).toBe(1);
    expect(baum(sites)).toEqual(sVor);
    expect(baum(web)).toEqual(wVor);
    expect(r.docker).not.toMatch(/caddy (validate|reload)/);
  });

  it("Web-Verzeichnis im Container nicht eingehaengt: Abbruch, Sites-Ordner unveraendert", () => {
    const sVor = baum(sites);
    const r = ausliefern({ FAKE_WEB_UNMOUNTED: "1" });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("nicht eingehaengt");
    expect(baum(sites)).toEqual(sVor);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
    expect(r.docker).not.toContain("caddy validate");
  });

  it("falscher SITES_DIR_HOST (keine App-Datei): Abbruch ohne Aenderung", () => {
    const leer = join(wurzel, "leer");
    mkdirSync(leer);
    const r = ausliefern({ SITES_DIR_HOST: sh(leer) });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("falscher SITES_DIR_HOST");
    expect(readdirSync(leer)).toEqual([]);
  });

  it("fehlende oder ungueltige Einstellungen: Abbruch", () => {
    expect(ausliefern({ CADDY_CONTAINER: "" }).code).toBe(1);
    expect(ausliefern({ WEB_DIR_HOST: "relativ/pfad" }).code).toBe(1);
    expect(ausliefern({ WEB_DIR_HOST: sh(sites) }).code).toBe(1);
    expect(ausliefern({ CADDY_CONTAINER: "a; rm -rf /" }).code).toBe(1);
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
    const app = baum(sites)["/app.centric-dienstplanung.de.caddy"];
    expect(ausliefern().code).toBe(0);
    writeFileSync(log, "");
    const r = lauf("website-zurueck.sh");
    expect(r.code, r.aus).toBe(0);
    expect(existsSync(join(sites, "centric-dienstplanung.de.caddy"))).toBe(false);
    expect(existsSync(join(web, "aktuell"))).toBe(false);
    expect(baum(sites)["/app.centric-dienstplanung.de.caddy"]).toBe(app);
    expect(r.docker.indexOf("caddy validate")).toBeLessThan(r.docker.indexOf("caddy reload"));
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
