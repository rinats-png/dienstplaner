/* ==========================================================================
   WEBSITE-KONSOLE — deploy/website/website-konsole.sh, ohne Server

   Das Skript wird samt Hilfsdateien in ein Temp-Verzeichnis kopiert; dort ersetzen
   Attrappen website-vorpruefung.sh und website-ausliefern.sh (die echten Skripte
   prueft website-ausliefern.test.js). Ein gefaelschtes `curl` im PATH ersetzt den
   Download. Geprueft wird die Ablauflogik: Pruefsumme, https, Archiv-Inhalt,
   Bestaetigung JA, Abbruch ohne Aufruf von ausliefern, Wiederholung.
   Unter Windows uebersprungen (Linux-CI fuehrt aus).
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, rmSync, symlinkSync, cpSync, appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { vi } from "vitest";
vi.setConfig({ testTimeout: 120000 });
const QUELLE = resolve("deploy/website");
const dl = process.platform === "win32" ? describe.skip : describe;
const sh = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => "/" + d.toLowerCase());
const STANDARD = "/root/centric-website-dist.tgz";

const VORPRUEFUNG = `#!/bin/bash
echo "vorpruefung" >> "$FAKE_LOG"
if [ "\${VP_MODE:-ok}" = abweichung ]; then
  echo "  ABWEICHUNG: erwartet /opt/proxy/sites -> /etc/caddy/sites (ro)"
  echo "ABWEICHUNG vom bestaetigten Stand (siehe oben) - NICHT ausliefern"
else
  echo "VARIANTE B PASST ZUM BESTAETIGTEN STAND (kein Container-Neustart)"
fi
exit 0
`;
const AUSLIEFERN = `#!/bin/bash
[ -f "$1/index.html" ] || { echo "FAKE: index.html fehlt" >&2; exit 1; }
echo "ausliefern $(find "$1" -type f | wc -l | tr -d ' ')" >> "$FAKE_LOG"
echo "FERTIG (Attrappe)"
`;
const CURL = `#!/bin/bash
echo "curl $*" >> "$FAKE_LOG"
ziel=""; prev=""
for a in "$@"; do [ "$prev" = "--output" ] && ziel="$a"; prev="$a"; done
[ -n "$ziel" ] && cp "$FAKE_ARCHIV" "$ziel"
exit 0
`;

// getent: www.* aufloesbar (Vorgabe) oder, mit FAKE_WWW_DNS=0, nicht.
const GETENT = `#!/bin/bash
if [ "$1" = ahosts ]; then
  case "$2" in www.*) [ "\${FAKE_WWW_DNS:-1}" = 1 ] || exit 2 ;; esac
  echo "192.0.2.1 STREAM $2"; exit 0
fi
exit 2
`;

let wurzel, skripte, arbeit, log;

const sha = (datei) => createHash("sha256").update(readFileSync(datei)).digest("hex");
const tar = (args, cwd) => {
  const r = spawnSync("tar", args.map((x) => (/^[A-Za-z]:\\/.test(x) ? sh(x) : x)), { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("tar: " + r.stderr);
};
function archivBauen(name, mod) {
  const d = join(arbeit, name + "-quelle");
  mkdirSync(join(d, "assets"), { recursive: true });
  writeFileSync(join(d, "index.html"), "<html>start</html>");
  writeFileSync(join(d, "404.html"), "<html>404</html>");
  writeFileSync(join(d, "assets", "site.js"), "x");
  const ziel = join(arbeit, name + ".tgz");
  const extra = mod ? mod(d) : { args: [] };
  tar(["-czf", ziel, ...extra.args, "-C", d, "."], arbeit);
  return ziel;
}
const sollSetzen = (summe) => writeFileSync(join(skripte, "DIST-SHA256.txt"), `# Test\n${summe}\n`);

function lauf({ args = [], stdin = "JA\n", env = {}, archiv } = {}) {
  const e = {
    ...process.env, FAKE_LOG: sh(log), TMPDIR: sh(arbeit),
    ...(archiv ? { FAKE_ARCHIV: sh(archiv) } : {}),
    PATH: sh(join(wurzel, "bin")) + ":" + process.env.PATH,
    ...env,
  };
  const r = spawnSync("bash", [sh(join(skripte, "website-konsole.sh")), ...args], { env: e, input: stdin, encoding: "utf8", timeout: 60000 });
  return { code: r.status, aus: (r.stdout || "") + (r.stderr || ""), log: existsSync(log) ? readFileSync(log, "utf8") : "" };
}

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), "konsole-test-"));
  skripte = join(wurzel, "skripte"); arbeit = join(wurzel, "arbeit"); log = join(wurzel, "log.txt");
  mkdirSync(skripte); mkdirSync(arbeit); mkdirSync(join(wurzel, "bin"));
  copyFileSync(join(QUELLE, "website-konsole.sh"), join(skripte, "website-konsole.sh"));
  writeFileSync(join(skripte, "website-vorpruefung.sh"), VORPRUEFUNG);
  writeFileSync(join(skripte, "website-ausliefern.sh"), AUSLIEFERN);
  writeFileSync(join(skripte, "website-zurueck.sh"), "#!/bin/bash\n");
  writeFileSync(join(skripte, "DIST-QUELLE.txt"), "# leer\n");
  writeFileSync(join(wurzel, "bin", "curl"), CURL);
  writeFileSync(join(wurzel, "bin", "getent"), GETENT);
  for (const f of [join(skripte, "website-vorpruefung.sh"), join(skripte, "website-ausliefern.sh"), join(wurzel, "bin", "curl"), join(wurzel, "bin", "getent")]) chmodSync(f, 0o755);
});
afterEach(() => { rmSync(wurzel, { recursive: true, force: true }); });

dl("website-konsole.sh: echte Dateien im Repo", () => {
  it("DIST-SHA256.txt enthaelt genau eine gueltige Summe; DIST-QUELLE.txt ist (noch) leer; Skript ausfuehrbar", () => {
    const summen = readFileSync(join(QUELLE, "DIST-SHA256.txt"), "utf8").split("\n").filter((z) => z.trim() && !z.startsWith("#"));
    expect(summen).toEqual(["69f51e7031e0ea22bae9d542bbbd29904306cdb8b88409163fcfdb3cac6684c8"]);
    const urls = readFileSync(join(QUELLE, "DIST-QUELLE.txt"), "utf8").split("\n").filter((z) => z.trim() && !z.startsWith("#"));
    expect(urls).toEqual(["https://raw.githubusercontent.com/rinats-png/dienstplaner/website/dist/centric-website-dist.tgz"]);
  });
});

dl("website-konsole.sh: lokales Archiv", () => {
  it("Erfolg: Vorpruefung, Pruefsumme, JA -> ausliefern mit entpacktem Ordner; Kontrollhinweis und Rueckweg", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(0);
    expect(r.log).toMatch(/vorpruefung\nausliefern 3\n/);
    expect(r.aus).toContain("Vorpruefung: PASST");
    expect(r.aus).toContain(sha(a));
    expect(r.aus).toContain("Dateien:    3");
    expect(r.aus).toContain("centric-dienstplanung.de.caddy");
    expect(r.aus).toContain("Rueckweg: bash");
    expect(r.aus).toContain("curl -sI https://centric-dienstplanung.de");
    expect(r.aus).not.toMatch(/\x1b\[/); // keine Farbcodes
  });

  it("Wiederholung ist unschaedlich: zweiter Lauf mit gleichem Ergebnis, Temp-Verzeichnis wird aufgeraeumt", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    expect(lauf({ args: [sh(a)] }).code).toBe(0);
    const r2 = lauf({ args: [sh(a)] });
    expect(r2.code, r2.aus).toBe(0);
    expect(r2.log.match(/^ausliefern 3$/gm).length).toBe(2);
    const rest = spawnSync("bash", ["-c", `ls -d "${sh(arbeit)}"/centric-konsole.* 2>/dev/null | wc -l`], { encoding: "utf8" }).stdout.trim();
    expect(rest).toBe("0");
  });

  it("falsche Pruefsumme: Abbruch ohne ausliefern", () => {
    const a = archivBauen("ok"); sollSetzen("0".repeat(64));
    const r = lauf({ args: [sh(a)] });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Pruefsumme stimmt nicht");
    expect(r.aus).toContain("Nichts wurde geaendert");
    expect(r.log).not.toContain("ausliefern");
  });

  it("ungueltige Soll-Summe in DIST-SHA256.txt: Abbruch", () => {
    const a = archivBauen("ok"); sollSetzen("abc");
    const r = lauf({ args: [sh(a)] });
    expect(r.code).toBe(1);
    expect(r.log).not.toContain("ausliefern");
  });

  it("fehlendes JA (leer, NEIN, ja, JAA): Abbruch ohne ausliefern", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    for (const stdin of ["", "\n", "NEIN\n", "ja\n", "JAA\n", "J\n"]) {
      const r = lauf({ args: [sh(a)], stdin });
      expect(r.code, JSON.stringify(stdin)).toBe(1);
      expect(r.aus).toContain("Keine Bestaetigung");
      expect(r.log).not.toContain("ausliefern");
    }
  });

  it("es gibt keine Option --ja zum Ueberspringen der Bestaetigung", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const r = lauf({ args: ["--ja", sh(a)], stdin: "" });
    expect(r.code).toBe(1);
    expect(r.log).not.toContain("ausliefern");
    expect(readFileSync(join(QUELLE, "website-konsole.sh"), "utf8")).not.toMatch(/--ja\)/);
  });

  it("Vorpruefung ABWEICHUNG: Abbruch, ausliefern nie aufgerufen, Archiv wird gar nicht erst gelesen", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)], env: { VP_MODE: "abweichung" } });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("ABWEICHUNG");
    expect(r.aus).not.toContain("Zusammenfassung");
    expect(r.log).not.toContain("ausliefern");
  });

  it("Archiv mit ../-Pfad: Abbruch", () => {
    const a = archivBauen("dd", () => ({ args: ["--transform", "s,^\\./index.html$,../index.html,"] }));
    sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).toMatch(/absolute Pfade oder '\.\.'/);
    expect(r.log).not.toContain("ausliefern");
  });

  it("Archiv mit absolutem Pfad: Abbruch", () => {
    const a = archivBauen("abs", () => ({ args: ["-P", "--transform", "s,^\\./index.html$,/tmp/index.html,"] }));
    sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).toMatch(/absolute Pfade oder '\.\.'/);
    expect(r.log).not.toContain("ausliefern");
  });

  it("Archiv mit symbolischem Link: Abbruch", () => {
    const a = archivBauen("sym", (d) => { symlinkSync("/etc/passwd", join(d, "link")); return { args: [] }; });
    sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).toContain("Links, Geraete");
    expect(r.log).not.toContain("ausliefern");
  });

  it("Archiv mit hartem Link: Abbruch", () => {
    const a = archivBauen("hart", (d) => { writeFileSync(join(d, "x.txt"), "1"); spawnSync("ln", [join(d, "x.txt"), join(d, "y.txt")]); return { args: [] }; });
    sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(1);
    expect(r.log).not.toContain("ausliefern");
  });

  it("Archiv ohne index.html: Abbruch", () => {
    const d = join(arbeit, "leer"); mkdirSync(d); writeFileSync(join(d, "x.txt"), "1");
    const a = join(arbeit, "leer.tgz"); tar(["-czf", a, "-C", d, "."], arbeit);
    sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code).toBe(1);
    expect(r.log).not.toContain("ausliefern");
  });

  it("fehlendes Archiv als Argument: Abbruch", () => {
    sollSetzen("0".repeat(64));
    const r = lauf({ args: [sh(join(arbeit, "gibtsnicht.tgz"))] });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Archiv nicht gefunden");
  });
});

// Die Skripte als Git-Repository (deploy/website), damit der Kopf-Hash ermittelt werden kann.
function repoAufbauen() {
  const repo = join(wurzel, "repo");
  const ziel = join(repo, "deploy", "website");
  mkdirSync(ziel, { recursive: true });
  cpSync(skripte, ziel, { recursive: true });
  const git = (...a) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error("git " + a.join(" ") + ": " + r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "stand");
  skripte = ziel;
  return { repo, kopf: git("rev-parse", "HEAD"), git };
}

dl("website-konsole.sh: Skriptstand, www, Kontrollbefehle (A1, B12, www)", () => {
  it("im Git-Klon: 'Skriptstand: <hash>' (voll) und Kurz-Hash in der Zusammenfassung und vor der JA-Frage", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const { kopf } = repoAufbauen();
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toContain(`Skriptstand: ${kopf}`);
    expect(r.aus).toContain(`  Skriptstand: ${kopf.slice(0, 12)}`);
    expect(r.aus).toContain(`mit dem Kurz-Hash in der Anweisung`);
    expect(r.aus).toMatch(/JA gilt nur bei uebereinstimmendem Skriptstand/);
    // die Frage kommt erst NACH der Anzeige des Skriptstands
    expect(r.aus.indexOf("Skriptstand:")).toBeLessThan(r.aus.indexOf("JA gilt nur"));
  });

  it("ERWARTETER_KOPF: passender Anfang -> weiter; abweichender -> Abbruch ohne ausliefern; kein Hash -> Abbruch", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const { kopf } = repoAufbauen();
    const ok = lauf({ args: [sh(a)], env: { ERWARTETER_KOPF: kopf.slice(0, 10) } });
    expect(ok.code, ok.aus).toBe(0);
    expect(ok.aus).toContain("stimmt mit ERWARTETER_KOPF ueberein");
    const falsch = lauf({ args: [sh(a)], env: { ERWARTETER_KOPF: "0".repeat(10) } });
    expect(falsch.code).toBe(1);
    expect(falsch.aus).toContain("stimmt nicht mit ERWARTETER_KOPF");
    expect(falsch.log).not.toContain("ausliefern");
    const murks = lauf({ args: [sh(a)], env: { ERWARTETER_KOPF: "abc; rm" } });
    expect(murks.code).toBe(1);
    expect(murks.log).not.toContain("ausliefern");
  });

  it("lokal veraenderter Klon: Abbruch ohne ausliefern", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    repoAufbauen();
    appendFileSync(join(skripte, "website-ausliefern.sh"), "# manipuliert\n");
    const r = lauf({ args: [sh(a)] });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("lokal veraendert");
    expect(r.log).not.toContain("ausliefern");
  });

  it("ohne Git-Stand (kopierte Skripte): 'Skriptstand: unbekannt ...' wird angezeigt, kein Absturz", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toContain("Skriptstand: unbekannt");
  });

  it("www ohne DNS: Zusammenfassung und Schluss melden es mit dem Befehl zum erneuten Ausfuehren", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)], env: { FAKE_WWW_DNS: "0" } });
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toContain("noch kein DNS-Eintrag - Weiterleitung wird weggelassen");
    expect(r.aus).toContain("www hat noch keinen DNS-Eintrag - nach dem Eintrag diesen Befehl erneut ausfuehren: bash ");
    expect(r.aus).toContain("website-konsole.sh");
    const mit = lauf({ args: [sh(a)], env: { FAKE_WWW_DNS: "1" } });
    expect(mit.code, mit.aus).toBe(0);
    expect(mit.aus).toContain("DNS-Eintrag vorhanden");
    expect(mit.aus).not.toContain("www hat noch keinen DNS-Eintrag");
  });

  it("B12: Kontrollbefehle enthalten curl -sI .../x (404 mit Kopfzeilen)", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    const r = lauf({ args: [sh(a)] });
    expect(r.aus).toContain("curl -sI https://centric-dienstplanung.de/x");
    expect(r.aus).toContain("404");
    expect(r.aus).toContain("Strict-Transport-Security");
  });

  it("WARNUNG/HINWEIS der Vorpruefung werden angezeigt, ohne abzubrechen", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    writeFileSync(join(skripte, "website-vorpruefung.sh"), '#!/bin/bash\necho "  WARNUNG: /config fehlt"\necho "VARIANTE B PASST ZUM BESTAETIGTEN STAND"\nexit 0\n');
    const r = lauf({ args: [sh(a)] });
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toContain("WARNUNG: /config fehlt");
  });
});

dl("website-konsole.sh: Download", () => {
  const ohneStandard = existsSync(STANDARD) ? it.skip : it;

  ohneStandard("https-URL aus DIST-QUELLE.txt: curl mit --fail --location --max-filesize und https-Zwang, dann Erfolg", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    writeFileSync(join(skripte, "DIST-QUELLE.txt"), "# x\nhttps://raw.githubusercontent.com/x/pfad/centric-website-dist.tgz\n");
    const r = lauf({ archiv: a });
    expect(r.code, r.aus).toBe(0);
    expect(r.log).toContain("--fail");
    expect(r.log).toContain("--location");
    expect(r.log).toContain("--max-filesize 20000000");
    expect(r.log).toContain("--proto =https");
    expect(r.log).toContain("--proto-redir =https");
    expect(r.log).toContain("https://raw.githubusercontent.com/x/pfad/centric-website-dist.tgz");
    expect(r.aus).toContain("Download https://raw.githubusercontent.com/x/");
    expect(r.log).toMatch(/ausliefern 3/);
  });

  ohneStandard("Download mit falscher Pruefsumme: Abbruch ohne ausliefern", () => {
    const a = archivBauen("ok"); sollSetzen("1".repeat(64));
    writeFileSync(join(skripte, "DIST-QUELLE.txt"), "https://raw.githubusercontent.com/x/a.tgz\n");
    const r = lauf({ archiv: a });
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Pruefsumme stimmt nicht");
    expect(r.log).not.toContain("ausliefern");
  });

  ohneStandard("nicht-https-URL: Abbruch, curl wird nicht aufgerufen", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    for (const url of ["http://example.invalid/a.tgz", "ftp://example.invalid/a.tgz", "file:///etc/passwd", "example.invalid/a.tgz"]) {
      writeFileSync(join(skripte, "DIST-QUELLE.txt"), url + "\n");
      const r = lauf({ archiv: a });
      expect(r.code, url).toBe(1);
      expect(r.aus).toContain("https://");
      expect(r.log).not.toContain("curl ");
      expect(r.log).not.toContain("ausliefern");
    }
  });

  ohneStandard("andere https-Domain (auch Tricks wie raw.githubusercontent.com.evil): Abbruch, kein curl", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    for (const url of ["https://example.invalid/a.tgz", "https://raw.githubusercontent.com.evil.invalid/a.tgz", "https://raw.githubusercontent.com@evil.invalid/a.tgz"]) {
      writeFileSync(join(skripte, "DIST-QUELLE.txt"), url + "\n");
      const r = lauf({ archiv: a });
      expect(r.code, url).toBe(1);
      expect(r.log).not.toContain("curl ");
    }
  });

  ohneStandard("URL mit Sonderzeichen (Leerzeichen-/Shell-Zeichen) wird abgelehnt", () => {
    const a = archivBauen("ok"); sollSetzen(sha(a));
    writeFileSync(join(skripte, "DIST-QUELLE.txt"), "https://raw.githubusercontent.com/x/a;rm$IFS-rf\n");
    const r = lauf({ archiv: a });
    expect(r.code).toBe(1);
    expect(r.log).not.toContain("curl ");
  });

  ohneStandard("weder lokales Archiv noch URL: Abbruch", () => {
    sollSetzen("0".repeat(64));
    const r = lauf({});
    expect(r.code).toBe(1);
    expect(r.aus).toContain("Kein Archiv");
    expect(r.log).not.toContain("ausliefern");
  });
});
