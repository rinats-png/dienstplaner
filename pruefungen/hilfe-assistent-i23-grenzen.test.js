/* ==========================================================================
   HILFE-ASSISTENT (WP-I23) — Grenzen des Moduls server/lib/intelligence/hilfe/

   Die Grenzprüfungen der Intelligence (intelligence-gateway-grenzen, -vertraege) sehen nur
   intelligence/gateway/ und die Dateien auf oberster Ebene. Dieser Unterordner gehört dazu:
   S9  Der Einhängepunkt ist UNGEMOCKT null — der Server hat heute kein Gateway.
   S10 Keine Datei des Ordners baut ein Gateway, importiert eines oder greift ins Netz;
       einzige Verbindung zum Gateway ist der Aufruf gateway.ausfuehren(...) auf das, was
       der Einhängepunkt liefert.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hilfeGateway } from "../server/lib/intelligence/hilfe/gateway.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDNER = path.join(WURZEL, "server/lib/intelligence/hilfe");
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("S9 Einhängepunkt", () => {
  it("hilfeGateway() ist ohne Mock null (kein Gateway, kein Anbieter verdrahtet)", () => {
    expect(hilfeGateway()).toBeNull();
  });
});

describe("S10 Quelltext des Ordners", () => {
  const dateien = readdirSync(ORDNER).filter((f) => f.endsWith(".mjs"));
  it("die erwarteten Dateien sind da", () => {
    expect(dateien.sort()).toEqual(["assistent.mjs", "gateway.mjs", "korpus.mjs", "suche.mjs"]);
  });
  it("kein Import des Gateway-Ordners, keine Erzeugung eines Gateways, Anbieters oder einer Attrappe", () => {
    for (const f of dateien) {
      const q = ohneKommentare(readFileSync(path.join(ORDNER, f), "utf8"));
      expect(q, f).not.toMatch(/intelligence\/gateway|\.\.\/gateway\/|gateway\/|erzeugeGateway|erzeugeLiveAnbieter|erzeugeAttrappe|erzeugeAudit|new Limits/);
    }
  });
  it("kein Netz, keine Umgebungsvariable, kein Dateizugriff, kein Anbieter, keine Ablage", () => {
    for (const f of dateien) {
      const q = ohneKommentare(readFileSync(path.join(ORDNER, f), "utf8"));
      expect(q, f).not.toMatch(/\bfetch\s*\(|node:https?|node:net|node:tls|node:dgram|node:child_process|node:fs|undici|XMLHttpRequest|WebSocket|\brequire\s*\(/);
      expect(q, f).not.toMatch(/process\.env|getStore|setJSON|console\./);
      expect(q, f).not.toMatch(/anthropic|openai|bedrock|api\.\w+\.com/i);
    }
  });
  it("Imports nur aus dem eigenen Ordner, kapsel, leckpruefung, positivliste und rechte", () => {
    const erlaubt = ["./korpus.mjs", "./suche.mjs", "../kapsel.mjs", "../leckpruefung.mjs", "../positivliste.mjs", "../../rechte.mjs"];
    for (const f of dateien) {
      const q = ohneKommentare(readFileSync(path.join(ORDNER, f), "utf8"));
      for (const m of q.matchAll(/from\s+["']([^"']+)["']/g)) expect(erlaubt, `${f}: ${m[1]}`).toContain(m[1]);
    }
  });
  it("gateway.mjs ist ein einziger Einhänger ohne eigene Logik", () => {
    const q = ohneKommentare(readFileSync(path.join(ORDNER, "gateway.mjs"), "utf8")).trim();
    expect(q).toBe("export const hilfeGateway = () => null;");
  });
});
