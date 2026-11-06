/* ==========================================================================
   INTELLIGENCE-GATEWAY — MODULGRENZEN (WP-I13), statisch

   Das Gateway ist inert: kein Netz, keine Umgebung, kein Schlüssel, keine
   Route, keine Verdrahtung in server.mjs. Diese Tests lesen den Quelltext
   (ohne Kommentare) und schlagen an, sobald jemand das ändert — jede
   Änderung daran ist eine Betreiberfreigabe (Anbieter, AVV, DSFA, WP-I18).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GW = path.join(WURZEL, "server/lib/intelligence/gateway");
const INTEL = path.join(WURZEL, "server/lib/intelligence");
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:\\])\/\/.*$/gm, "$1");
const lies = (p) => ohneKommentare(readFileSync(p, "utf8"));
const gwDateien = readdirSync(GW).filter((f) => f.endsWith(".mjs"));
/* Netz, Kindprozess, Dateizugriff, dynamischer Code — auch verschleiert: kein Zugriff über globalThis/window/self/global
   mit Klammern oder .fetch, kein Function(…), kein „fe“ + „tch“, kein process[…]/binding/dlopen. */
const NETZ_UND_AUSBRUCH = new RegExp([
  String.raw`\bfetch\s*\(`, "node:https?", "node:http2", String.raw`node:net\b`, "node:tls", "node:dgram", "node:dns", "node:child_process",
  "node:worker_threads", "node:fs", "node:vm", "XMLHttpRequest", "WebSocket", "EventSource", String.raw`\bnew\s+Worker\b`, String.raw`\bimport\s*\(`,
  String.raw`\brequire\s*\(`, String.raw`\beval\s*\(`, String.raw`\bnew\s+Function\b`, String.raw`(?<![.\w])Function\s*\(`,
  String.raw`\b(?:globalThis|window|self|global)\s*(?:\[|\.\s*(?:fetch|process|require|XMLHttpRequest|WebSocket))`,
  String.raw`\b(?:globalThis|window|self|global)\b\s*[,;)]`, String.raw`Reflect\.\w+\s*\(\s*(?:globalThis|window|self|global)`,
  String.raw`["']fe["']\s*\+`, String.raw`\+\s*["']tch["']`, String.raw`["']fetch["']`, String.raw`process\s*\[`, String.raw`process\.(?:binding|dlopen|mainModule)`,
  String.raw`navigator\.sendBeacon`, String.raw`\.constructor\b`,
].join("|"));

describe("Gateway-Dateien", () => {
  it("die erwarteten Dateien sind da", () => {
    for (const f of ["anbieter.mjs", "attrappe.mjs", "anbieter-live.mjs", "gateway.mjs", "limits.mjs", "audit.mjs", "pruefer.mjs", "router.mjs",
      "schalter.mjs", "codes.mjs"]) expect(gwDateien).toContain(f);
  });
  it("kein Netz, kein Kindprozess, kein Dateizugriff, keine Netzbibliothek (auch nicht im Live-Stumpf)", () => {
    for (const f of gwDateien) {
      const q = lies(path.join(GW, f));
      expect(q, f).not.toMatch(NETZ_UND_AUSBRUCH);
    }
  });
  it("die Erkennung greift auch bei verschleierten Zugriffen (globalThis['fe'+'tch'], Function(...), process[...])", () => {
    for (const probe of ["globalThis['fe'+'tch']('x')", "globalThis [ 'fetch' ]", "const g = globalThis; g['fe' + 'tch']", "window['fetch']", "self[\"fetch\"]",
      "global['fetch']", "Reflect.get(globalThis, 'fetch')", "Function('return fetch')()", "const f = 'fe' + 'tch'", "x + 'tch'", "process['binding']('tcp_wrap')",
      "process.binding('x')", "process.dlopen(m)", "new Function('x')", "fetch ('x')", "import('node:net')", "require('net')", "Object.getOwnPropertyDescriptor(globalThis, 'fetch')",
      "globalThis.fetch", "navigator.sendBeacon('x')", "new Worker('x')", "new EventSource('x')", "structuredClone.constructor"])
      expect(NETZ_UND_AUSBRUCH.test(probe), probe).toBe(true);
  });
  it("keine Umgebungsvariable (L3): Umgebung kommt nur als Argument von außen", () => {
    for (const f of gwDateien) expect(lies(path.join(GW, f)), f).not.toMatch(/process\.env|process\s*\[\s*["']env|import\.meta\.env|Deno\.env/);
  });
  it("kein Anbietername, keine Anbieteradresse, kein Schlüsselmuster im Quelltext", () => {
    for (const f of gwDateien) {
      const q = readFileSync(path.join(GW, f), "utf8");   // auch Kommentare: hier steht nirgends ein Anbieter
      expect(q, f).not.toMatch(/anthropic|openai|bedrock|azure|vertex|api\.\w+\.(com|ai|io)|x-api-key|sk-[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9]/i);
    }
  });
  it("Importe: nur Geschwister, ../ innerhalb von intelligence/ und node:crypto; nie src/, nie server/lib/*.mjs des Kerns", () => {
    for (const f of gwDateien) {
      for (const m of lies(path.join(GW, f)).matchAll(/from\s+["']([^"']+)["']/g)) {
        const ziel = m[1];
        if (ziel.startsWith("node:")) { expect(ziel, `${f}: ${ziel}`).toBe("node:crypto"); continue; }
        expect(ziel.startsWith("./") || /^\.\.\/[a-z-]+\.mjs$/.test(ziel), `${f}: ${ziel}`).toBe(true);
        if (ziel.startsWith("../")) expect(existsSync(path.join(INTEL, ziel.slice(3))), `${f}: ${ziel}`).toBe(true);
      }
    }
  });
  it("Schreibwege in den Bestand gibt es nicht", () => {
    for (const f of gwDateien) expect(lies(path.join(GW, f)), f).not.toMatch(/bestandSchreiben|zusammenfuehren|setJSON|\.set\(\s*["'`]ki:|writeFile|appendFile/);
  });
  it("die Umgebungsvariablen-Namen stehen nur dort, wo sie hingehören", () => {
    for (const f of gwDateien) {
      const q = lies(path.join(GW, f));
      if (f !== "anbieter-live.mjs") expect(q, f).not.toMatch(/CENTRIC_KI_ANBIETER/);
      if (f !== "schalter.mjs") expect(q, f).not.toMatch(/CENTRIC_KI_MODUS/);
    }
  });
});

describe("Inert: nirgends verdrahtet", () => {
  const referenzen = (dir, endung = ".mjs") => readdirSync(dir).filter((f) => f.endsWith(endung)).map((f) => [path.join(dir, f), f]);
  it("server.mjs, server/funktionen/*, server/lib/*.mjs und werkzeug/* kennen das Gateway nicht", () => {
    const kandidaten = [[path.join(WURZEL, "server.mjs"), "server.mjs"], ...referenzen(path.join(WURZEL, "server/funktionen")), ...referenzen(path.join(WURZEL, "server/lib")),
      ...referenzen(path.join(WURZEL, "werkzeug"))];
    expect(kandidaten.length).toBeGreaterThan(10);
    for (const [pfad, name] of kandidaten) {
      const q = readFileSync(pfad, "utf8");
      expect(q, name).not.toMatch(/intelligence\/gateway|erzeugeGateway|erzeugeLiveAnbieter|erzeugeAttrappe/);
    }
  });
  it("es gibt keine Route für /ki, keine Funktionsdatei ki.mjs, keinen Eintrag in der Routentabelle", () => {
    expect(existsSync(path.join(WURZEL, "server/funktionen/ki.mjs"))).toBe(false);
    for (const [pfad, name] of referenzen(path.join(WURZEL, "server/funktionen"))) expect(readFileSync(pfad, "utf8"), name).not.toMatch(/["'`]\/ki(\/|["'`])/);
    expect(readFileSync(path.join(WURZEL, "server.mjs"), "utf8")).not.toMatch(/["'`]\/ki(\/|["'`])|intelligence/);
  });
  it("die Plattform (src/) importiert nichts aus dem Gateway", () => {
    const ordner = [path.join(WURZEL, "src")];
    let n = 0;
    while (ordner.length) {
      const d = ordner.pop();
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) ordner.push(path.join(d, e.name));
        else if (/\.(jsx?|mjs)$/.test(e.name)) { n++; expect(readFileSync(path.join(d, e.name), "utf8"), e.name).not.toMatch(/intelligence\/gateway/); }
      }
    }
    expect(n).toBeGreaterThan(10);
  });
  it("die bestehenden Intelligence-Module (WP-I11) hängen nicht vom Gateway ab (Abhängigkeit nur einseitig)", () => {
    for (const f of readdirSync(INTEL).filter((x) => x.endsWith(".mjs"))) expect(lies(path.join(INTEL, f)), f).not.toMatch(/gateway\//);
  });
  it("keine Anbieter-Bibliothek in package.json (Abhängigkeiten oder Skripte)", () => {
    const pkg = JSON.parse(readFileSync(path.join(WURZEL, "package.json"), "utf8"));
    const alle = JSON.stringify({ d: pkg.dependencies, dd: pkg.devDependencies, o: pkg.optionalDependencies, p: pkg.peerDependencies });
    expect(alle).not.toMatch(/anthropic|openai|bedrock|@aws-sdk|langchain|ai-sdk/i);
  });
  it(".env.example kennt keinen Anbieterschlüssel (nicht angelegt)", () => {
    const p = path.join(WURZEL, ".env.example");
    if (existsSync(p)) expect(readFileSync(p, "utf8")).not.toMatch(/CENTRIC_KI_ANBIETER|ANTHROPIC|OPENAI/i);
  });
});
