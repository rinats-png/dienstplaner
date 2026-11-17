/* ==========================================================================
   STAGING O2 (C1/C2) — Offline-Prüfung der Vorbereitung, ohne Docker, Netz und VM

   Prüft nur Dateien im Repository:
     - deploy/staging-o2/compose.yml: Bilder nur per Digest-Variable (ohne Vorgabe), keine Geheimnisse,
       keine veröffentlichten Ports am Anwendungscontainer, Härtung wie die Produktion
     - deploy/staging-o2/env.staging.beispiel: ausschließlich Platzhalter, Digests als <...> markiert
     - deploy/staging-o2/Caddyfile: Host und Zugriffsliste aus der Umgebung, kein trusted_proxies
     - deploy/staging-o2/betrieb.sh: Syntax, Aufrufvertrag, bricht ohne .env ab; Verhalten (Sperrprüfung bei merken/zurueck,
       --trocken, Archivprüfung, Rückfall bei Fehlern) an einer Kopie im Temp-Verzeichnis mit Stub-docker/-tar, ohne Docker
     - .github/workflows/staging-gate.yml: nur workflow_dispatch, contents: read, kein Schreibrecht,
       keine Auslieferung, kein Aufruf aus einem anderen Workflow, abgeschaltet bis STAGING_GATE_AKTIV
       (actionlint, falls installiert; sonst nur diese Strukturprüfung)
     - e2e/global-setup.mjs: Staging-Haken bleibt auf die eigene Maschine begrenzt
     - docs/acc45/STAGING-O2-VORBEREITUNG.md: Pflichtabschnitte
   Es werden keine Geheimnisse gelesen oder erzeugt; alle Werte in den Dateien sind Platzhalter.
   ========================================================================== */
import { describe, it, expect, afterAll, vi } from "vitest";
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const yaml = createRequire(import.meta.url)("js-yaml");
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lesen = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");
const ORDNER = "deploy/staging-o2";
const DATEIEN = ["compose.yml", "Caddyfile", "env.staging.beispiel", "betrieb.sh"];

const compose = yaml.load(lesen(`${ORDNER}/compose.yml`));
const workflowText = lesen(".github/workflows/staging-gate.yml");
const workflow = yaml.load(workflowText);

describe("O2: Dateibestand", () => {
  it("alle Vorbereitungsdateien liegen im Repository, aber keine echte .env", () => {
    for (const d of DATEIEN) expect(existsSync(path.join(WURZEL, ORDNER, d)), d).toBe(true);
    const vorhanden = readdirSync(path.join(WURZEL, ORDNER));
    expect(vorhanden.filter((n) => n === ".env" || /^\.env\./.test(n) || /\.(pem|key)$/.test(n))).toEqual([]);
  });

  it("keine echten Geheimnisse und keine echten Digests in den Dateien (nur Platzhalter)", () => {
    for (const d of [...DATEIEN, "../../docs/acc45/STAGING-O2-VORBEREITUNG.md"]) {
      const t = lesen(`${ORDNER}/${d}`);
      expect(/[0-9a-f]{64}/.test(t), `${d}: 64-Hex-Wert`).toBe(false);
      /* Trennzeilen (=====, -----) und Pfade zählen nicht; gesucht sind lange Base64-/Hex-artige Werte mit Ziffern und Buchstaben. */
      const ohne = t.replace(/https?:\/\/\S+/g, "").replace(/[=-]{5,}/g, "").replace(/[\w.-]+(\/[\w.-]+)+/g, "");
      expect(/(?=[A-Za-z0-9+/=_-]*\d)(?=[A-Za-z0-9+/=_-]*[A-Za-z])[A-Za-z0-9+/=_-]{40,}/.test(ohne), `${d}: langer Zufallswert`).toBe(false);
      expect(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t), `${d}: privater Schlüssel`).toBe(false);
    }
  });
});

describe("O2: compose.yml", () => {
  const dienste = compose.services;
  it("zwei Dienste: Anwendung und Caddy, eigener Stackname und eigenes Netz", () => {
    expect(Object.keys(dienste).sort()).toEqual(["caddy", "centric-staging-web"]);
    expect(compose.name).toBe("centric-staging");
    expect(Object.keys(compose.networks)).toEqual(["staging-intern"]);
    expect(compose.networks["staging-intern"].external).toBeUndefined();
  });

  it("Bilder nur per Digest-Variable ohne Vorgabe, nie Tag oder latest (Platzhalter bis zum Betreiber)", () => {
    expect(dienste["centric-staging-web"].image).toMatch(/^ghcr\.io\/rinats-png\/dienstplaner@\$\{IMAGE_DIGEST:\?[^}]+\}$/);
    expect(dienste.caddy.image).toMatch(/^caddy@\$\{CADDY_DIGEST:\?[^}]+\}$/);
    for (const s of Object.values(dienste)) {
      expect(s.image).not.toMatch(/:latest|:[0-9]/);
      expect(s.pull_policy).toBe("never");
    }
  });

  it("Anwendungscontainer: gehärtet wie die Produktion, kein veröffentlichter Port", () => {
    const a = dienste["centric-staging-web"];
    expect(a.ports).toBeUndefined();
    expect(a.read_only).toBe(true);
    expect(a.user).toBe("1000:1000");
    expect(a.cap_drop).toEqual(["ALL"]);
    expect(a.security_opt).toContain("no-new-privileges:true");
    expect(a.environment.NODE_ENV).toBe("production");
    expect(a.healthcheck).toBeTruthy();
    expect(a.volumes.join(" ")).toContain("./zustand:/zustand");
  });

  it("nur Caddy veröffentlicht Ports, und nur 80 und 443", () => {
    expect(dienste.caddy.ports).toEqual(["80:80", "443:443"]);
    expect(dienste.caddy.environment.STAGING_HOST).toContain(":?");
    expect(dienste.caddy.environment.STAGING_ERLAUBT).toContain(":?");
  });

  it("keine Geheimnisse und keine Selbststart-/Demo-Schalter in der Datei", () => {
    const t = lesen(`${ORDNER}/compose.yml`);
    const zeilen = t.split(/\r?\n/).filter((z) => !/^\s*#/.test(z));
    const code = zeilen.join("\n");
    expect(code).not.toMatch(/CENTRIC_(ADMIN|PFEFFER)/);
    expect(code).not.toMatch(/CENTRIC_(SELBSTSTART|DEMO)/);
    expect(code).not.toMatch(/(password|passwort|secret|token)\s*:\s*\S/i);
    expect(dienste["centric-staging-web"].env_file).toBe(".env");
  });

  it(".env ist im Repository ausgeschlossen", () => {
    expect(lesen(".gitignore")).toMatch(/^\.env\b/m);
  });
});

describe("O2: env.staging.beispiel", () => {
  const zeilen = lesen(`${ORDNER}/env.staging.beispiel`).split(/\r?\n/).filter((z) => z.trim() && !z.trim().startsWith("#"));
  const paare = Object.fromEntries(zeilen.map((z) => [z.slice(0, z.indexOf("=")), z.slice(z.indexOf("=") + 1)]));
  it("jede Zeile ist KEY=Wert, jeder Wert ein <Platzhalter>", () => {
    expect(zeilen.length).toBeGreaterThan(5);
    for (const [k, v] of Object.entries(paare)) expect(v, k).toMatch(/<[^>]+>/);
  });
  it("Digests sind als Platzhalter gekennzeichnet, Geheimnisse haben eigene Staging-Namen", () => {
    expect(paare.IMAGE_DIGEST).toMatch(/^sha256:<.+>$/);
    expect(paare.CADDY_DIGEST).toMatch(/^sha256:<.+>$/);
    expect(paare.CENTRIC_ADMIN).toMatch(/staging/);
    expect(paare.CENTRIC_PFEFFER).toMatch(/staging/);
  });
  it("jede Pflichtvariable der compose.yml steht in der Vorlage", () => {
    for (const v of ["IMAGE_DIGEST", "CADDY_DIGEST", "STAGING_HOST", "STAGING_ERLAUBT"]) expect(paare, v).toHaveProperty(v);
  });
});

describe("O2: Caddyfile", () => {
  const t = lesen(`${ORDNER}/Caddyfile`);
  const code = t.split(/\r?\n/).filter((z) => !/^\s*#/.test(z)).join("\n");
  it("Host und Zugriffsliste kommen aus der Umgebung; Fremde bekommen 403", () => {
    expect(code).toContain("{$STAGING_HOST}");
    expect(code).toMatch(/@fremd not remote_ip \{\$STAGING_ERLAUBT\}/);
    expect(code).toMatch(/respond @fremd 403/);
  });
  it("kein trusted_proxies, kein Admin-Endpunkt, kein fest eingetragener Host", () => {
    expect(code).not.toContain("trusted_proxies");
    expect(code).toMatch(/admin off/);
    expect(code).not.toMatch(/centric-dienstplanung\.de/);
    expect(code).toContain("reverse_proxy centric-staging-web:3000");
  });
});

describe("O2: betrieb.sh", () => {
  const BASH = (() => {
    const r = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
    return r.status === 0 ? "bash" : null;
  })();
  const skript = path.join(WURZEL, ORDNER, "betrieb.sh");
  const lauf = (...args) => spawnSync(BASH, [skript.replace(/\\/g, "/"), ...args], { encoding: "utf8", timeout: 60000 });
  it.skipIf(!BASH)("Syntax in Ordnung", () => {
    expect(spawnSync(BASH, ["-n", skript.replace(/\\/g, "/")], { encoding: "utf8" }).status).toBe(0);
  });
  it.skipIf(!BASH)("unbekannter Unterbefehl: Exit 2 mit Aufrufhinweis", () => {
    const r = lauf("unsinn");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Aufruf:");
  });
  it.skipIf(!BASH)("pruefen ohne .env bricht ab (Exit 1) und ändert nichts", () => {
    const r = lauf("pruefen");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(".env fehlt");
    expect(existsSync(path.join(WURZEL, ORDNER, ".env"))).toBe(false);
  });
  it("jeder ändernde Unterbefehl kennt --trocken und liest die .env nie aus (kein Ausgeben von Werten)", () => {
    const t = lesen(`${ORDNER}/betrieb.sh`);
    expect(t).toContain("--trocken");
    expect(t).not.toMatch(/echo[^\n]*\$\(wert (CENTRIC|IMAGE)/);
    expect(t).not.toMatch(/cat \.env/);
  });
});

describe("O2: betrieb.sh Verhalten (Stub-docker, ohne Docker; Kopie im Temp-Verzeichnis)", () => {
  const BASH = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }).status === 0 ? "bash" : null;
  const GESPERRT_F03 = "sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79";
  const GESPERRT_0861 = "sha256:0861adee" + "0".repeat(56);
  const FREI = "sha256:" + "ab12".repeat(16);
  const BETRIEB = "deploy/staging-o2/betrieb.sh";
  vi.setConfig({ testTimeout: 60000 }); // jeder Fall startet mehrere bash-Prozesse (langsam unter Windows und bei Last)
  const aufraeumen = [];
  const posix = (x) => x.replace(/\\/g, "/");
  const rb = (dir, skript, env = {}) =>
    spawnSync(BASH, ["-c", skript], { cwd: dir, encoding: "utf8", timeout: 60000, env: { ...process.env, ...env } });

  /* Arbeitsordner <tmp>/<zufall>/staging/ mit betrieb.sh; mitLib legt Bibliothek und Liste eine Ebene darüber ab (wie im Repository). */
  function werkstatt({ mitLib = true } = {}) {
    const wurzel = mkdtempSync(path.join(os.tmpdir(), "staging-o2-"));
    aufraeumen.push(wurzel);
    const dir = path.join(wurzel, "staging");
    mkdirSync(dir);
    copyFileSync(path.join(WURZEL, BETRIEB), path.join(dir, "betrieb.sh"));
    if (mitLib) {
      copyFileSync(path.join(WURZEL, "deploy/freigabe-lib.sh"), path.join(wurzel, "freigabe-lib.sh"));
      copyFileSync(path.join(WURZEL, "deploy/FREIGEGEBENE-IMAGES.md"), path.join(wurzel, "FREIGEGEBENE-IMAGES.md"));
    }
    const stub = path.join(wurzel, "stub");
    mkdirSync(stub);
    writeFileSync(path.join(stub, "docker"), '#!/bin/sh\necho "$*" >> "$DOCKER_LOG"\nexit 0\n');
    writeFileSync(
      path.join(stub, "tar"),
      '#!/bin/sh\nprev=""\nfor a in "$@"; do\n' +
        '  if [ "$a" = "-xzf" ] && [ "$TAR_FAIL" = x ]; then echo "tar: simuliert" >&2; exit 2; fi\n' +
        '  if [ "$prev" = "-czf" ] && [ "$TAR_FAIL" = c ]; then echo halb > "$a"; echo "tar: simuliert" >&2; exit 2; fi\n' +
        '  prev="$a"\ndone\nexec "$REAL_TAR" "$@"\n',
    );
    chmodSync(path.join(stub, "docker"), 0o755);
    chmodSync(path.join(stub, "tar"), 0o755);
    const log = path.join(wurzel, "docker.log");
    const env = { DOCKER_LOG: posix(log), STUBVERZ: posix(stub) };
    const betrieb = (args, extra = {}) =>
      rb(
        dir,
        'REAL_TAR="$(command -v tar)"; export REAL_TAR; p="$STUBVERZ"; command -v cygpath >/dev/null 2>&1 && p="$(cygpath -u "$STUBVERZ")"; PATH="$p:$PATH" bash ./betrieb.sh ' +
          args,
        { ...env, ...extra },
      );
    const dockerLog = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
    return { dir, betrieb, dockerLog, sh: (cmd) => rb(dir, cmd), lesen: (n) => readFileSync(path.join(dir, n), "utf8") };
  }
  afterAll(() => {
    for (const d of aufraeumen) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* Temp-Verzeichnis */
      }
    }
  });

  describe.skipIf(!BASH)("merken und zurueck prüfen das Ziel gegen die Freigabeliste", () => {
    it("merken verweigert den gesperrten Digest f03a8514 (Exit 1, klare Meldung, nichts abgelegt)", () => {
      const w = werkstatt();
      for (const extra of ["", " --trocken"]) {
        const r = w.betrieb("merken " + GESPERRT_F03 + extra);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/gesperrt und wird verweigert/);
        expect(r.stderr).toContain("Datenschutzlücke");
      }
      expect(existsSync(path.join(w.dir, ".vorheriger-digest"))).toBe(false);
    });

    it("merken verweigert auch den per Präfix gesperrten Digest 0861adee", () => {
      const w = werkstatt();
      const r = w.betrieb("merken " + GESPERRT_0861);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/gesperrt und wird verweigert/);
      expect(existsSync(path.join(w.dir, ".vorheriger-digest"))).toBe(false);
    });

    it("merken --trocken mit freigegebenem Digest: Exit 0, nur Ankündigung, nichts abgelegt", () => {
      const w = werkstatt();
      const r = w.betrieb("merken " + FREI + " --trocken");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("[trocken]");
      expect(existsSync(path.join(w.dir, ".vorheriger-digest"))).toBe(false);
    });

    it("merken ohne --trocken legt den freigegebenen Digest ab", () => {
      const w = werkstatt();
      expect(w.betrieb("merken " + FREI).status).toBe(0);
      expect(w.lesen(".vorheriger-digest").trim()).toBe(FREI);
    });

    it("zurueck verweigert ein gesperrtes gemerktes Ziel und lässt .env und docker unberührt", () => {
      const w = werkstatt();
      writeFileSync(path.join(w.dir, ".vorheriger-digest"), GESPERRT_F03 + "\n");
      writeFileSync(path.join(w.dir, ".env"), "IMAGE_DIGEST=sha256:<platzhalter>\n");
      for (const extra of ["", " --trocken"]) {
        const r = w.betrieb("zurueck" + extra);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/gesperrt und wird verweigert/);
      }
      expect(w.lesen(".env")).toBe("IMAGE_DIGEST=sha256:<platzhalter>\n");
      expect(w.dockerLog()).toEqual([]);
    });

    it("zurueck --trocken mit freigegebenem Ziel: Exit 0, Ankündigungen, .env unverändert, docker nicht aufgerufen", () => {
      const w = werkstatt();
      writeFileSync(path.join(w.dir, ".vorheriger-digest"), FREI + "\n");
      writeFileSync(path.join(w.dir, ".env"), "IMAGE_DIGEST=sha256:<platzhalter>\n");
      const r = w.betrieb("zurueck --trocken");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("[trocken] sed -i");
      expect(r.stdout).toContain("[trocken] docker compose up -d --pull never");
      expect(w.lesen(".env")).toBe("IMAGE_DIGEST=sha256:<platzhalter>\n");
      expect(w.dockerLog()).toEqual([]);
    });

    it("zurueck ohne --trocken setzt den freigegebenen Digest und startet neu (Stub-docker)", () => {
      const w = werkstatt();
      writeFileSync(path.join(w.dir, ".vorheriger-digest"), FREI + "\n");
      writeFileSync(path.join(w.dir, ".env"), "IMAGE_DIGEST=sha256:<platzhalter>\nCENTRIC_ADMIN=<x>\n");
      expect(w.betrieb("zurueck").status).toBe(0);
      expect(w.lesen(".env")).toContain("IMAGE_DIGEST=" + FREI);
      expect(w.dockerLog()).toEqual(["compose up -d --pull never"]);
    });

    it("zurueck ohne .vorheriger-digest bricht ab", () => {
      const r = werkstatt().betrieb("zurueck --trocken");
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(".vorheriger-digest fehlt");
    });

    it("fehlt freigabe-lib.sh, wird verweigert (fail-closed), auch für einen sonst harmlosen Digest", () => {
      const w = werkstatt({ mitLib: false });
      for (const [bef, vor] of [
        ["merken " + FREI, null],
        ["zurueck", FREI],
      ]) {
        if (vor) writeFileSync(path.join(w.dir, ".vorheriger-digest"), vor + "\n");
        const r = w.betrieb(bef);
        expect(r.status, bef).toBe(1);
        expect(r.stderr).toContain("freigabe-lib.sh nicht gefunden");
      }
    });

    it("liegt die Bibliothek neben dem Skript (Anordnung auf der VM), gilt dieselbe Sperre", () => {
      const w = werkstatt({ mitLib: false });
      copyFileSync(path.join(WURZEL, "deploy/freigabe-lib.sh"), path.join(w.dir, "freigabe-lib.sh"));
      copyFileSync(path.join(WURZEL, "deploy/FREIGEGEBENE-IMAGES.md"), path.join(w.dir, "FREIGEGEBENE-IMAGES.md"));
      expect(w.betrieb("merken " + GESPERRT_F03).status).toBe(1);
      expect(w.betrieb("merken " + FREI + " --trocken").status).toBe(0);
    });
  });

  describe.skipIf(!BASH)("wiederherstellen: Archivprüfung vor dem Entpacken", () => {
    /* Archiv im Arbeitsordner erzeugen; null, wenn dieses tar die Konstruktion nicht kann (Fall wird dann übersprungen). */
    function archiv(w, name, erzeuge) {
      const r = w.sh(
        "mkdir -p data sicherungen && echo alt > data/a.db && " + erzeuge + " && sha256sum sicherungen/" + name + " > sicherungen/" + name + ".sha256",
      );
      return r.status === 0 ? "sicherungen/" + name : null;
    }

    it("gültiges Archiv: --trocken Exit 0, nur Ankündigungen, data und docker unberührt", () => {
      const w = werkstatt();
      const a = archiv(w, "ok.tar.gz", "tar -czf sicherungen/ok.tar.gz data");
      expect(a).not.toBeNull();
      const r = w.betrieb("wiederherstellen " + a + " --trocken");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("[trocken] docker compose stop centric-staging-web");
      expect(r.stdout).toContain("[trocken] tar -C . -xzf " + a + " data");
      expect(w.lesen("data/a.db").trim()).toBe("alt");
      expect(w.dockerLog()).toEqual([]);
    });

    it("gültiges Archiv ohne --trocken: data ersetzt, altes bleibt als data.vor-wiederherstellung-*, Exit 0", () => {
      const w = werkstatt();
      const a = archiv(w, "ok.tar.gz", "tar -czf sicherungen/ok.tar.gz data");
      w.sh("echo neu > data/a.db");
      const r = w.betrieb("wiederherstellen " + a);
      expect(r.status).toBe(0);
      expect(w.lesen("data/a.db").trim()).toBe("alt");
      expect(w.sh("cat data.vor-wiederherstellung-*/a.db").stdout.trim()).toBe("neu");
      expect(w.dockerLog()).toEqual(["compose stop centric-staging-web", "compose up -d --pull never"]);
    });

    it.each([
      ["absoluter Pfad", "tar -czPf sicherungen/x.tar.gz --transform 's,^data,/tmp/staging-o2-fremd,' data", /absoluten Pfad|außerhalb von data/],
      ["Pfad mit ..", "tar -czf sicherungen/x.tar.gz --transform 's,^data,../data,' data", /\.\. oder \.|außerhalb von data/],
      ["Eintrag außerhalb von data/ (.env im Archivwurzel)", "echo X=1 > .env && tar -czf sicherungen/x.tar.gz data .env", /außerhalb von data\/|berührt \.env/],
      ["data/.env", "echo X=1 > data/.env && tar -czf sicherungen/x.tar.gz data", /berührt \.env/],
      ["data/compose.yml", "echo x: 1 > data/compose.yml && tar -czf sicherungen/x.tar.gz data", /compose-Datei/],
    ])("lehnt ab: %s (Exit 1, nichts angehalten oder verschoben)", (_titel, erzeuge, meldung) => {
      const w = werkstatt();
      const a = archiv(w, "x.tar.gz", erzeuge);
      if (!a) return; // tar kann diese Konstruktion hier nicht erzeugen
      for (const extra of ["", " --trocken"]) {
        const r = w.betrieb("wiederherstellen " + a + extra);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(meldung);
      }
      expect(existsSync(path.join(w.dir, "data/a.db"))).toBe(true);
      expect(w.sh("ls -d data.vor-wiederherstellung-* 2>/dev/null").stdout).toBe("");
      expect(w.dockerLog()).toEqual([]);
    });

    it("lehnt Verknüpfungen im Archiv ab", () => {
      const w = werkstatt();
      const a = archiv(w, "l.tar.gz", "ln -s /etc/hostname data/verweis && tar -czf sicherungen/l.tar.gz data");
      if (!a || !/^l/m.test(w.sh("tar -tvzf " + a).stdout)) return; // Dateisystem legt keine echten Verknüpfungen an
      const r = w.betrieb("wiederherstellen " + a + " --trocken");
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Verknüpfungen");
    });
  });

  describe.skipIf(!BASH)("Rückfall bei Fehlern (trap): kein angehaltener Dienst, kein fehlendes data", () => {
    it("wiederherstellen: schlägt das Entpacken fehl, kommt data zurück, der Dienst startet wieder, Exit ungleich 0", () => {
      const w = werkstatt();
      w.sh(
        "mkdir -p data sicherungen && echo original > data/a.db && tar -czf sicherungen/x.tar.gz data && sha256sum sicherungen/x.tar.gz > sicherungen/x.tar.gz.sha256",
      );
      const r = w.betrieb("wiederherstellen sicherungen/x.tar.gz", { TAR_FAIL: "x" });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("Wiederherstellung fehlgeschlagen");
      expect(w.lesen("data/a.db").trim()).toBe("original");
      expect(w.sh("ls -d data.vor-wiederherstellung-* 2>/dev/null").stdout).toBe("");
      expect(w.dockerLog()).toEqual(["compose stop centric-staging-web", "compose up -d --pull never"]);
    });

    const einrichten = (w) => {
      w.sh(
        "mkdir -p data zustand && echo daten > data/a.db && printf '%s\\n' 'IMAGE_DIGEST=" +
          FREI +
          "' 'CADDY_DIGEST=" +
          FREI +
          "' 'STAGING_HOST=staging.example' 'CENTRIC_ADMIN=a' 'CENTRIC_PFEFFER=b' > .env && chmod 600 .env",
      );
      return w.sh("stat -c %a .env").stdout.trim() === "600";
    };

    it("sichern: schlägt tar fehl, ist das halbe Archiv entfernt, der Dienst startet wieder, Exit ungleich 0", () => {
      const w = werkstatt();
      if (!einrichten(w)) return; // Dateisystem kennt Modus 600 nicht (pruefen verlangt ihn)
      const r = w.betrieb("sichern", { TAR_FAIL: "c" });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("Sicherung fehlgeschlagen");
      expect(w.sh("ls sicherungen").stdout.trim()).toBe("");
      expect(w.dockerLog()).toEqual(["compose stop centric-staging-web", "compose up -d --pull never"]);
    });

    it("sichern: Erfolg legt Archiv samt Prüfsumme an und startet den Dienst", () => {
      const w = werkstatt();
      if (!einrichten(w)) return;
      const r = w.betrieb("sichern");
      expect(r.status).toBe(0);
      expect(w.sh("ls sicherungen").stdout).toMatch(/data-.*\.tar\.gz\.sha256/);
      expect(w.dockerLog()).toEqual(["compose stop centric-staging-web", "compose up -d --pull never"]);
    });

    it("sichern --trocken: nur Ankündigungen, nichts angelegt, docker nicht aufgerufen", () => {
      const w = werkstatt();
      if (!einrichten(w)) return;
      const r = w.betrieb("sichern --trocken");
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("[trocken] tar -C . -czf");
      expect(existsSync(path.join(w.dir, "sicherungen"))).toBe(false);
      expect(w.dockerLog()).toEqual([]);
    });
  });
});

describe("C2: staging-gate.yml", () => {
  it("läuft nur von Hand: genau workflow_dispatch, sonst kein Auslöser", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(["digest"]);
  });

  it("Rechte: Vorgabe genau contents: read; im Job höchstens lesend, kein Schreibrecht", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const [name, job] of Object.entries(workflow.jobs)) {
      for (const [scope, wert] of Object.entries(job.permissions || {})) expect(wert, `${name}.${scope}`).toBe("read");
    }
    expect(workflowText).not.toMatch(/permissions:[^\n]*write/);
  });

  it("abgeschaltet bis der Betreiber die Variable STAGING_GATE_AKTIV setzt", () => {
    expect(workflow.jobs.gate.if).toContain("vars.STAGING_GATE_AKTIV == 'true'");
  });

  it("Eingabe nur als Digest geprüft; das Bild wird nur per Digest angesprochen", () => {
    expect(workflowText).toContain("^sha256:[0-9a-f]{64}$");
    expect(workflowText).toContain('"$BILD_REPO@$DIGEST"');
    expect(workflowText).not.toMatch(/:latest|ghcr\.io[^\s"]*:[a-z0-9]/i);
  });

  it("Commit des Bilds muss dem geprüften Quellstand entsprechen (Nachweis ist an Digest und Commit gebunden)", () => {
    expect(workflowText).toContain("org.opencontainers.image.revision");
    expect(workflowText).toMatch(/\[ "\$rev" = "\$GITHUB_SHA" \]/);
    expect(workflowText).toContain("staging-nachweis.json");
  });

  it("keine Auslieferung, keine Veröffentlichung, keine Umgebung, kein SSH, keine eigenen Geheimnisse", () => {
    expect(workflowText).not.toMatch(/docker (push|tag)/);
    expect(workflowText).not.toMatch(/\bssh\b|DEPLOY_|scp |rsync /);
    expect(workflowText).not.toMatch(/^\s*environment:/m);
    expect(workflowText).not.toMatch(/deploy\/(deploy|ruecksprung|abschalten)\.sh/);
    const geheimnisse = [...workflowText.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    expect([...new Set(geheimnisse)]).toEqual(["GITHUB_TOKEN"]);
  });

  it("zufällige Schlüssel werden maskiert und nie ausgegeben", () => {
    expect(workflowText).toMatch(/::add-mask::\$ADMIN/);
    expect(workflowText).toMatch(/::add-mask::\$PFEFFER/);
    expect(workflowText).not.toMatch(/echo +"?\$\{?(ADMIN|PFEFFER|GHCR_TOKEN|NACHWEIS|GEHEIMNIS)\}?"? *$/m);
    expect(workflowText).toContain("--password-stdin");
  });

  it("kein anderer Workflow ruft das Gate auf oder hängt davon ab; die Auslieferung bleibt unverändert", () => {
    const dir = path.join(WURZEL, ".github", "workflows");
    for (const f of readdirSync(dir)) {
      if (f === "staging-gate.yml") continue;
      const t = readFileSync(path.join(dir, f), "utf8");
      expect(t, f).not.toMatch(/staging-gate/);
    }
  });

  it("actionlint (falls installiert) meldet nichts", () => {
    const r = spawnSync("actionlint", [path.join(WURZEL, ".github/workflows/staging-gate.yml")], { encoding: "utf8" });
    if (r.error) return; // nicht installiert: die Strukturprüfungen oben gelten
    expect(r.stdout + r.stderr).toBe("");
  });
});

describe("C2: Haken in der vorhandenen Playwright-Suite (WP-33)", () => {
  const t = lesen("e2e/global-setup.mjs");
  it("E2E_EXTERN_ADMIN ersetzt nur Bau und Serverstart; die Beschränkung auf die eigene Maschine bleibt", () => {
    expect(t).toContain("E2E_EXTERN_ADMIN");
    expect(t).toMatch(/if \(!istLoopback\(BASIS\)\) throw/);
  });
});

describe("O2: Sicherungsvorlagen für die Staging-Übung (zwei getrennte, lokale restic-Repositorys)", () => {
  /* Erlaubte Schlüssel aus dem Parser der Sicherung selbst (deploy/sicherung/gemeinsam.sh), nicht nachgebaut. */
  const gemeinsam = lesen("deploy/sicherung/gemeinsam.sh");
  const erlaubt = new RegExp(/readonly KONFIG_ERLAUBT='([^']+)'/.exec(gemeinsam)[1]);
  const VORLAGEN = { ablage: `${ORDNER}/sicherung.env.beispiel`, widerrufbuch: `${ORDNER}/widerrufbuch.env.beispiel` };
  const werte = (rel) => Object.fromEntries(lesen(rel).split(/\r?\n/).filter((z) => z.trim() && !z.trim().startsWith("#"))
    .map((z) => { const i = z.indexOf("="); return [z.slice(0, i), z.slice(i + 1)]; }));
  const v = { ablage: werte(VORLAGEN.ablage), widerrufbuch: werte(VORLAGEN.widerrufbuch) };

  it("jede Zeile ist ein Schlüssel, den die Sicherung kennt; kein Passwort, keine Zugangsdaten eines Anbieters", () => {
    for (const [art, w] of Object.entries(v)) {
      for (const k of Object.keys(w)) {
        expect(k, `${art}: ${k}`).toMatch(erlaubt);
        expect(k, `${art}: ${k}`).not.toMatch(/^(RESTIC_PASSWORD|RESTIC_PASSWORD_COMMAND)$|^(AWS_|B2_)/);
      }
      for (const pflicht of ["CENTRIC_PROD_IMAGE", "CENTRIC_DATEN_PFAD", "CENTRIC_ENV_DATEI", "RESTIC_REPOSITORY", "RESTIC_PASSWORD_FILE"])
        expect(w[pflicht], `${art}: ${pflicht}`).toBeTruthy();
    }
  });

  it("zwei getrennte Repositorys mit getrennten Passwortdateien, beide nur lokal auf der Staging-VM", () => {
    expect(v.ablage.RESTIC_REPOSITORY).not.toBe(v.widerrufbuch.RESTIC_REPOSITORY);
    expect(v.ablage.RESTIC_PASSWORD_FILE).not.toBe(v.widerrufbuch.RESTIC_PASSWORD_FILE);
    for (const w of Object.values(v)) expect(w.RESTIC_REPOSITORY, "lokaler Pfad, kein sftp:/s3:/rest:/b2:").toMatch(/^(\/|~\/)/);
    const [a, b] = [v.ablage.RESTIC_REPOSITORY, v.widerrufbuch.RESTIC_REPOSITORY];
    expect(a.startsWith(`${b}/`) || b.startsWith(`${a}/`), "kein Repository im anderen").toBe(false);
  });

  it("nur Pfade des Staging, nie die der Produktion; Bild nur als Digest-Platzhalter; Ping leer", () => {
    for (const [art, rel] of Object.entries(VORLAGEN)) {
      const t = lesen(rel);
      expect(t, art).not.toMatch(/\/opt\/apps\/centric-dienstplanung/);
      expect(t, art).not.toMatch(/centric-storagebox|your-storagebox|https?:\/\/(?!<)/);
      expect(/[0-9a-f]{64}/.test(t), `${art}: 64-Hex-Wert`).toBe(false);
      expect(v[art].CENTRIC_PROD_IMAGE, art).toMatch(/@sha256:<[A-Z_]+>$/);
      for (const p of ["CENTRIC_DATEN_PFAD", "CENTRIC_ENV_DATEI"]) expect(v[art][p], `${art}: ${p}`).toMatch(/^\/opt\/centric-staging\//);
      expect(v[art].ALARM_PING_URL ?? "", art).toBe("");
      expect(v[art].PROBE_PING_URL ?? "", art).toBe("");
    }
    expect(v.widerrufbuch.CENTRIC_ZUSTAND_PFAD).toBe("/opt/centric-staging/zustand");
  });
});

describe("Dokumentation INFRA-VORBEREITUNG-STAGING-BACKUP", () => {
  const d = lesen("docs/acc45/INFRA-VORBEREITUNG-STAGING-BACKUP.md");
  it.each([
    "Bestand",
    "Lokal geprüfte Zugänge",
    "Voraussetzungen",
    "Isolierte Staging-VM",
    "Zwei getrennte restic-Repositorys",
    "Restore-Proben",
    "Sicherheitsprüfung",
    "A. Bereits technisch vorbereitet",
    "B. Durch Claude ohne weitere Betreiberentscheidung ausführbar",
    "C. Nur durch den Betreiber",
  ])("enthält den Abschnitt „%s“", (titel) => {
    expect(d).toContain(titel);
  });
  it("keine echten Digests oder langen Zufallswerte", () => {
    expect(/[0-9a-f]{64}/.test(d)).toBe(false);
    expect(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(d)).toBe(false);
  });
});

describe("Dokumentation", () => {
  const d = lesen("docs/acc45/STAGING-O2-VORBEREITUNG.md");
  it.each([
    "Was Claude vorbereitet hat",
    "Was der Betreiber tun muss",
    "Was externe Stellen tun",
    "Installationsanleitung",
    "Synthetische Daten",
    "Sicherung, Wiederherstellung und Rücksprung",
    "Abnahmekriterien und Nachweisformat",
    "Checkliste",
    "Nicht Teil dieser Vorbereitung",
  ])("enthält den Abschnitt „%s“", (titel) => {
    expect(d).toContain(titel);
  });
});

/* ==========================================================================
   IONOS (Betreiberentscheidung 2026-11-17): Vorlagen für Object Storage, lesende Auslastungsmessung, Einrichtungskette.
   Nur Dateien im Repository und Stubs; kein Netz, kein Konto, keine Zugangsdaten.
   ========================================================================== */
describe("IONOS: S3-Vorlagen (zwei Buckets, zwei Nutzer, Löschschutz beim Anbieter)", () => {
  const S = "deploy/sicherung";
  const policy = { ablage: JSON.parse(lesen(`${S}/s3-policy-ablage.json.beispiel`)), widerrufbuch: JSON.parse(lesen(`${S}/s3-policy-widerrufbuch.json.beispiel`)) };
  const liste = (x) => (Array.isArray(x) ? x : [x]);
  const principals = (p) => [...new Set(p.Statement.flatMap((s) => liste(s.Principal.AWS)))];
  const ressourcen = (p) => [...new Set(p.Statement.flatMap((s) => liste(s.Resource)))];
  const aktionen = (p, effekt) => p.Statement.filter((s) => s.Effect === effekt).flatMap((s) => liste(s.Action));
  const SCHUTZ = ["s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "s3:PutObjectRetention", "s3:PutObjectLegalHold",
    "s3:PutBucketObjectLockConfiguration", "s3:PutBucketVersioning", "s3:PutLifecycleConfiguration", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:DeleteBucket", "s3:PutBucketAcl", "s3:PutObjectAcl"];

  it("Vorlagen sind gültiges JSON und enthalten nur Platzhalter (keine Vertragsnummer, Nutzer-ID, kein echter Bucket)", () => {
    for (const d of ["s3-policy-ablage.json.beispiel", "s3-policy-widerrufbuch.json.beispiel", "s3-lifecycle.json.beispiel"]) {
      const t = lesen(`${S}/${d}`);
      expect(() => JSON.parse(t), d).not.toThrow();
      expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(t), `${d}: UUID`).toBe(false);
      expect(/\b\d{5,}\b/.test(t.replace(/"2012-10-17"/, "")), `${d}: Vertragsnummer`).toBe(false);
      expect(/[0-9a-f]{64}/.test(t), `${d}: 64-Hex`).toBe(false);
    }
    for (const p of Object.values(policy)) {
      for (const pr of principals(p)) expect(pr).toMatch(/^arn:aws:iam:::user\/<VERTRAGSNUMMER>:<NUTZER_UUID_HOST_[A-Z]+>$/);
      for (const r of ressourcen(p)) expect(r).toMatch(/^arn:aws:s3:::<BUCKET_[A-Z]+>(\/\*)?$/);
    }
  });

  it("je Policy ein eigener Host-Nutzer (alle Allow-Statements) und ein Bucket; Ablage und Widerrufbücher getrennt (Bucket und Nutzer)", () => {
    const eigen = (p) => [...new Set(p.Statement.filter((s) => s.Effect === "Allow").flatMap((s) => liste(s.Principal.AWS)))];
    const [pa, pw] = [eigen(policy.ablage), eigen(policy.widerrufbuch)];
    expect(pa).toEqual(["arn:aws:iam:::user/<VERTRAGSNUMMER>:<NUTZER_UUID_HOST_ABLAGE>"]);
    expect(pw).toEqual(["arn:aws:iam:::user/<VERTRAGSNUMMER>:<NUTZER_UUID_HOST_WIDERRUFBUCH>"]);
    const bucket = (p) => [...new Set(ressourcen(p).map((r) => r.replace(/\/\*$/, "")))];
    expect(bucket(policy.ablage)).toEqual(["arn:aws:s3:::<BUCKET_ABLAGE>"]);
    expect(bucket(policy.widerrufbuch)).toEqual(["arn:aws:s3:::<BUCKET_WIDERRUFBUCH>"]);
  });

  it("jedes Deny deckt Bucket UND Objekte (ARN und /*), ohne Condition/NotPrincipal/NotAction/NotResource; der jeweils andere Host ist ganz ausgesperrt", () => {
    const anderer = { ablage: "WIDERRUFBUCH", widerrufbuch: "ABLAGE" };
    for (const [art, p] of Object.entries(policy)) {
      const B = `arn:aws:s3:::<BUCKET_${art.toUpperCase()}>`;
      const eigenerP = `arn:aws:iam:::user/<VERTRAGSNUMMER>:<NUTZER_UUID_HOST_${art.toUpperCase()}>`;
      const fremderP = `arn:aws:iam:::user/<VERTRAGSNUMMER>:<NUTZER_UUID_HOST_${anderer[art]}>`;
      for (const s of p.Statement) {
        for (const k of ["Condition", "NotPrincipal", "NotAction", "NotResource"]) expect(s[k], `${art}/${s.Sid}: ${k}`).toBeUndefined();
        expect(Object.keys(s.Principal), `${art}/${s.Sid}`).toEqual(["AWS"]);
      }
      const denies = p.Statement.filter((s) => s.Effect === "Deny");
      expect(denies.length, art).toBe(2);
      for (const s of denies) expect([...liste(s.Resource)].sort(), `${art}/${s.Sid}`).toEqual([B, `${B}/*`]);
      const schutz = denies.find((s) => liste(s.Principal.AWS).includes(eigenerP));
      expect(liste(schutz.Principal.AWS), art).toEqual([eigenerP]);
      const fremd = denies.find((s) => liste(s.Principal.AWS).includes(fremderP));
      expect(liste(fremd.Principal.AWS), art).toEqual([fremderP]);
      expect(liste(fremd.Action), art).toEqual(["s3:*"]);
      for (const s of p.Statement.filter((x) => x.Effect === "Allow")) expect(liste(s.Principal.AWS), `${art}/${s.Sid}`).toEqual([eigenerP]);
    }
  });

  it("Host darf nie Versionen löschen, Sperre umgehen oder Schutz/Policy/Lifecycle/ACL ändern — und es ist ausdrücklich verweigert", () => {
    for (const [art, p] of Object.entries(policy)) {
      const erlaubt = aktionen(p, "Allow");
      for (const a of SCHUTZ) expect(erlaubt, `${art}: ${a} erlaubt`).not.toContain(a);
      for (const a of erlaubt) expect(a, `${art}: Platzhalter-Aktion`).not.toMatch(/\*/);
      const verweigert = aktionen(p, "Deny");
      for (const a of SCHUTZ) expect(verweigert, `${art}: ${a} nicht verweigert`).toContain(a);
      /* Variante L (EINRICHTUNGSKETTE-IONOS.md §5.3): Löschen nur als Löschmarker unter Object Lock — nie mehr als DeleteObject */
      expect(erlaubt.filter((a) => /Delete/.test(a)), art).toEqual(["s3:DeleteObject"]);
      expect([...erlaubt].sort(), art).toEqual(["s3:DeleteObject", "s3:GetBucketLocation", "s3:GetObject", "s3:ListBucket", "s3:PutObject"]);
    }
  });

  it("Lifecycle entfernt nur nicht aktuelle Versionen und abgelaufene Löschmarker, nie aktuelle Objekte", () => {
    const l = JSON.parse(lesen(`${S}/s3-lifecycle.json.beispiel`));
    expect(l.Rules.length).toBeGreaterThan(0);
    for (const r of l.Rules) {
      expect(r.NoncurrentVersionExpiration.NoncurrentDays).toBe("<TAGE_NICHT_AKTUELL>");
      expect(r.Expiration ?? {}).toEqual({ ExpiredObjectDeleteMarker: true });
    }
  });

  it("env-Vorlagen: Ziel nur als Platzhalter, S3-Zeilen auskommentiert, getrennte Buckets und Schlüssel, nur bekannte Schlüssel", () => {
    const erlaubt = new RegExp(/readonly KONFIG_ERLAUBT='([^']+)'/.exec(lesen(`${S}/gemeinsam.sh`))[1]);
    const t = { ablage: lesen(`${S}/env.beispiel`), widerrufbuch: lesen(`${S}/widerrufbuch.env.beispiel`) };
    const aktiv = (x) => x.split(/\r?\n/).filter((z) => z.trim() && !z.trim().startsWith("#"));
    const s3 = {};
    for (const [art, x] of Object.entries(t)) {
      expect(aktiv(x).find((z) => z.startsWith("RESTIC_REPOSITORY=")), art).toBe("RESTIC_REPOSITORY=<ZIEL_NACH_FREIGABE>");
      expect(aktiv(x).filter((z) => /^(AWS_|B2_)/.test(z)), `${art}: aktive Zugangsdaten`).toEqual([]);
      const kommentiert = x.split(/\r?\n/).map((z) => /^#\s+([A-Z][A-Z0-9_]+)=(.*)$/.exec(z)).filter(Boolean);
      for (const [, k] of kommentiert) expect(k, `${art}: ${k}`).toMatch(erlaubt);
      for (const [, k, v] of kommentiert) if (/^AWS_/.test(k)) expect(v, `${art}: ${k}`).toMatch(/^<[A-Z_]+>$/);
      s3[art] = Object.fromEntries(kommentiert.filter(([, , v]) => !/^sftp:/.test(v)).map(([, k, v]) => [k, v]));
      expect(s3[art].RESTIC_REPOSITORY, art).toMatch(/^s3:https:\/\/s3\.<REGION>\.ionoscloud\.com\/<BUCKET_[A-Z]+>\/[a-z-]+$/);
    }
    expect(s3.ablage.RESTIC_REPOSITORY).toContain("<BUCKET_ABLAGE>");
    expect(s3.widerrufbuch.RESTIC_REPOSITORY).toContain("<BUCKET_WIDERRUFBUCH>");
    expect(s3.ablage.AWS_ACCESS_KEY_ID).not.toBe(s3.widerrufbuch.AWS_ACCESS_KEY_ID);
    expect(s3.ablage.AWS_SECRET_ACCESS_KEY).not.toBe(s3.widerrufbuch.AWS_SECRET_ACCESS_KEY);
  });
});

describe("IONOS: Auslastungsmessung (deploy/auslastung-messen.sh, nur lesend)", () => {
  const BASH = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }).status === 0 ? "bash" : null;
  const REL = "deploy/auslastung-messen.sh";
  const code = lesen(REL).split(/\r?\n/).filter((z) => !/^\s*#/.test(z)).join("\n");
  const posix = (x) => x.replace(/\\/g, "/");
  const temp = [];
  vi.setConfig({ testTimeout: 60000 });
  afterAll(() => {
    for (const d of temp) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* Temp-Verzeichnis */
      }
    }
  });

  it("liest nie Geheimnisse und ändert nichts: kein .env, kein docker inspect/compose config, keine Prozessumgebung, sudo nur -n", () => {
    expect(code).not.toMatch(/\.env\b/);
    expect(code).not.toMatch(/docker\s+(container\s+)?inspect|compose\s+config/);
    expect(code).not.toMatch(/environ|printenv|\bps\s+-?[a-z]*e\b/);
    expect(code).not.toMatch(/\b(rm|mv|cp|tee|chmod|chown|kill)\s/);
    expect(code).not.toMatch(/systemctl\s+(start|stop|restart|enable|disable)|ufw\s+(allow|deny|enable|disable|delete|reset)|iptables\s+-[AIDFX]\b/);
    /* jeder Aufruf von sudo nicht interaktiv (nie eine Passwortabfrage); `hat sudo` prüft nur, ob es das Programm gibt */
    expect(code.match(/(?<!hat )\bsudo\s(?!-n )[^\n]*/g) ?? []).toEqual([]);
    expect(code).toMatch(/sudo -n "\$@"/);
  });

  it.skipIf(!BASH)("Syntax (bash -n), Aufruffehler Exit 2, Trockenlauf führt nichts aus", () => {
    const s = posix(path.join(WURZEL, REL));
    expect(spawnSync(BASH, ["-n", s], { encoding: "utf8" }).status).toBe(0);
    expect(spawnSync(BASH, [s, "--unsinn"], { encoding: "utf8" }).status).toBe(2);
    expect(spawnSync(BASH, [s, "--intervall", "x"], { encoding: "utf8" }).status).toBe(2);
    expect(spawnSync(BASH, [s, "--intervall", "0"], { encoding: "utf8" }).status, "0 s wäre kein Messintervall").toBe(2);
    expect(spawnSync(BASH, [s, "--intervall", "1000"], { encoding: "utf8" }).status).toBe(2);
    const t = spawnSync(BASH, [s, "--trocken"], { encoding: "utf8" });
    expect(t.status).toBe(0);
    expect(t.stdout).toContain("Trockenlauf");
    expect(t.stdout).not.toContain("Bewertung");
  });

  function lauf({ sudo = true, mem = 3000000, load = "0.40 0.50 0.60", steal = 2, belegt = 30, args = [] } = {}) {
    const w = mkdtempSync(path.join(os.tmpdir(), "auslastung-"));
    temp.push(w);
    const stub = path.join(w, "stub"), proc = path.join(w, "proc"), app = path.join(w, "app");
    for (const d of [stub, proc, path.join(app, "data"), path.join(app, "zustand")]) mkdirSync(d, { recursive: true });
    writeFileSync(path.join(app, "data", "x.json"), "{}");
    writeFileSync(path.join(proc, "meminfo"), `MemTotal: 8000000 kB\nMemAvailable: ${mem} kB\nSwapTotal: 1000000 kB\nSwapFree: 990000 kB\n`);
    writeFileSync(path.join(proc, "loadavg"), `${load} 1/200 4242\n`);
    const s = {
      nproc: "echo 4",
      /* wie procps 4: nach st folgt noch gu — die letzte Spalte ist NICHT st */
      vmstat: `echo 'procs -----------memory---------- ---swap-- -----io---- -system-- -------cpu-------'; echo ' r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st gu'; echo ' 0  0      0 100000  2000  30000    0    0     1     2   50   60  1  1 90  0 ${steal}  0'`,
      free: "echo 'Mem: 7.6Gi'",
      df: `case "$*" in *-i*) echo 'Filesystem Inodes IUsed IFree IUse% Mounted'; echo '/dev/vda1 100 10 90 10% /';; *) echo 'Filesystem 1024-blocks Used Available Capacity Mounted'; echo '/dev/vda1 100 ${belegt} ${100 - belegt} ${belegt}% /';; esac`,
      docker: "case \"$1\" in info) exit 0;; stats) echo 'NAME CPU MEM'; echo 'centric-dp-web 0.5% 120MiB/512MiB 23%';; system) echo 'TYPE TOTAL SIZE'; echo 'Images 3 900MB';; ps) echo 'NAMES IMAGE STATUS'; echo 'caddy caddy Up 3 days 10.20.30.40';; inspect) echo VERBOTEN; exit 9;; *) exit 1;; esac",
      ss: "printf '%s\\n' 'LISTEN 0 4096 0.0.0.0:443 0.0.0.0:* users:((\"docker-proxy\",pid=12,fd=4))' 'LISTEN 0 128 10.0.0.5:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=3))' 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=4))' 'LISTEN 0 4096 [::1]:631 [::]:*'",
      sudo: sudo ? '[ "$1" = "-n" ] && shift; exec "$@"' : "exit 1",
      ufw: "echo 'Status: active'; echo '22/tcp ALLOW IN 203.0.113.7'; echo '22/tcp (v6) ALLOW IN 2001:db8:1::5'; echo '80/tcp (v6) DENY IN ::5'",
      iptables: "echo '-N DOCKER-USER'; echo '-A DOCKER-USER -s 198.51.100.9/32 -j RETURN'",
      systemctl: "echo 'acronis_mms.service loaded active running Acronis'",
    };
    for (const [n, body] of Object.entries(s)) {
      writeFileSync(path.join(stub, n), `#!/bin/sh\n${body}\n`);
      chmodSync(path.join(stub, n), 0o755);
    }
    const skript = 'p="$STUBVERZ"; command -v cygpath >/dev/null 2>&1 && p="$(cygpath -u "$STUBVERZ")"; PATH="$p:$PATH" bash "$SKRIPT" --intervall 1 ' + args.join(" ");
    return spawnSync(BASH, ["-c", skript], {
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, STUBVERZ: posix(stub), SKRIPT: posix(path.join(WURZEL, REL)), MESS_PROC: posix(proc), CENTRIC_APP_VERZ: posix(app) },
    });
  }

  it.skipIf(!BASH)("Stub-Lauf: alle Abschnitte, Adressen maskiert, Ports nur mit Klasse und Prozessname, Bewertung AUSREICHEND", () => {
    const r = lauf();
    expect(r.status, r.stderr).toBe(0);
    for (const t of ["CPU und Last", "Speicher", "Platz", "Docker", "Lauschende TCP-Ports", "Firewall", "Backup-Agent", "Bewertung"]) expect(r.stdout).toContain(t);
    expect(r.stdout).not.toMatch(/10\.0\.0\.5|10\.20\.30\.40|203\.0\.113\.7|198\.51\.100\.9|2001:db8/);
    expect(r.stdout).toContain("<ipv4>");
    expect(r.stdout).toMatch(/443\talle\tdocker-proxy/);
    expect(r.stdout).toMatch(/22\teinzeln\tsshd/);
    expect(r.stdout, "gleicher Port auf einzelner Adresse UND allen bleibt sichtbar").toMatch(/22\talle\tsshd/);
    expect(r.stdout).not.toMatch(/ ::5\b/);
    expect(r.stdout).toContain("Steal-Zeit (vmstat st, 1s): 2%");
    expect(r.stdout).toMatch(/631\tlokal\t-/);
    expect(r.stdout).toContain("Agent vorhanden: ja");
    expect(r.stdout).not.toContain("VERBOTEN");
    expect(r.stdout).toMatch(/Gesamt: AUSREICHEND \(erfüllt 5, verfehlt 0, nicht gemessen 0\)/);
  });

  it.skipIf(!BASH)("Schwellen verfehlt → NICHT AUSREICHEND; ohne sudo bzw. --ohne-sudo → Firewall nicht gemessen", () => {
    const r = lauf({ sudo: false, mem: 1000000, load: "3.0 3.0 3.0", steal: 15, belegt: 80 });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("ufw / DOCKER-USER: nicht gemessen (sudo)");
    expect(r.stdout).toMatch(/Gesamt: NICHT AUSREICHEND \(erfüllt 1, verfehlt 4, nicht gemessen 0\)/);
    const o = lauf({ args: ["--ohne-sudo"] });
    expect(o.status, o.stderr).toBe(0);
    expect(o.stdout).toContain("ufw / DOCKER-USER: nicht gemessen (sudo)");
    expect(o.stdout).not.toMatch(/203\.0\.113\.7/);
  });
});

describe("Dokumentation EINRICHTUNGSKETTE-IONOS", () => {
  const d = lesen("docs/acc45/EINRICHTUNGSKETTE-IONOS.md");
  it.each([
    "Bestell- und Aktivierungsschritte",
    "Verifizierte Bedingungen",
    "Staging-VM",
    "Firewall, DNS, TLS",
    "Docker, Deployment per Digest",
    "Object Storage",
    "Löschschutz gegen `forget --prune`",
    "Entscheidungsvorlage Policy",
    "Wiederherstellung nach Löschangriff",
    "Cron/Timer, Alarmierung, Restore-Probe",
    "Restore-Runbook mit BE-1 bis BE-3",
    "Auslastungsmessung",
    /* Review #319: Image-Restore-Fenster, Cron, zustand-Zweig, Grenze der Sperrfrist, Kosten-DoS */
    "`restart: unless-stopped`",
    "**Crontab** des Benutzers `admin` stilllegen",
    "**beiseitelegen, nicht löschen**",
    "**abgelaufener** Retention",
    "Retention **abgelaufen** ist",
    "Kosten-DoS",
  ])("enthält den Abschnitt „%s“", (titel) => {
    expect(d).toContain(titel);
  });
  it("Kurzfassung steht ganz oben; jeder Schritt ist [AUTO] oder [BETREIBER]; kein AAAA; keine Geheimnisse oder Adressen", () => {
    expect(d.indexOf("## 0. Bestell- und Aktivierungsschritte")).toBeLessThan(d.indexOf("## 1."));
    const schritte = d.split(/\r?\n/).filter((z) => /^\| [A-Z]-\d+ \| \[/.test(z));
    expect(schritte.length).toBeGreaterThan(20);
    for (const z of schritte) expect(z).toMatch(/^\| [A-Z]-\d+ \| \[(AUTO|BETREIBER)\]/);
    expect(d).toContain("kein `AAAA`");
    expect(/[0-9a-f]{64}/.test(d)).toBe(false);
    expect(/\b\d{1,3}(\.\d{1,3}){3}\b/.test(d)).toBe(false);
  });
  it("Betreiberentscheidung 2026-11-17 (Nachtrag): Staging-Teile zurückgestellt bis Phase D, nicht in der Kurzfassung; Testwege ohne VM", () => {
    for (const k of ["## 2.", "## 3.", "## 4."]) {
      const kopf = d.split(/\r?\n/).find((z) => z.startsWith(k));
      expect(kopf, k).toContain("ZURÜCKGESTELLT bis Phase D");
    }
    const kurz = d.slice(d.indexOf("## 0."), d.indexOf("## 1a."));
    expect(kurz).not.toMatch(/^\| V-\d/m);
    expect(d).toContain("## 1a. Isolierte Testwege ohne VM");
    expect(d).toMatch(/nie\*\* auf dem laufenden Produktionssystem|\*\*nie\*\* auf dem\s+Produktionssystem/);
  });
});
