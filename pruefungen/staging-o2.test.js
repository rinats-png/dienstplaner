/* ==========================================================================
   STAGING O2 (C1/C2) — Offline-Prüfung der Vorbereitung, ohne Docker, Netz und VM

   Prüft nur Dateien im Repository:
     - deploy/staging-o2/compose.yml: Bilder nur per Digest-Variable (ohne Vorgabe), keine Geheimnisse,
       keine veröffentlichten Ports am Anwendungscontainer, Härtung wie die Produktion
     - deploy/staging-o2/env.staging.beispiel: ausschließlich Platzhalter, Digests als <...> markiert
     - deploy/staging-o2/Caddyfile: Host und Zugriffsliste aus der Umgebung, kein trusted_proxies
     - deploy/staging-o2/betrieb.sh: Syntax, Aufrufvertrag, bricht ohne .env ab
     - .github/workflows/staging-gate.yml: nur workflow_dispatch, contents: read, kein Schreibrecht,
       keine Auslieferung, kein Aufruf aus einem anderen Workflow, abgeschaltet bis STAGING_GATE_AKTIV
       (actionlint, falls installiert; sonst nur diese Strukturprüfung)
     - e2e/global-setup.mjs: Staging-Haken bleibt auf die eigene Maschine begrenzt
     - docs/acc45/STAGING-O2-VORBEREITUNG.md: Pflichtabschnitte
   Es werden keine Geheimnisse gelesen oder erzeugt; alle Werte in den Dateien sind Platzhalter.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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
