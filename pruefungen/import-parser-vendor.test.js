/* ==========================================================================
   IMP-2 — SheetJS-Einbindung: Prüfsummen, Version, Lizenz, Einbindungsregeln.
   Schlägt fehl, wenn eine Datei unter vendor/sheetjs/ verändert wurde.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(REPO, "vendor", "sheetjs");
const sha = (b) => createHash("sha256").update(b).digest("hex");

describe("IMP-2 vendor/sheetjs", () => {
  it("PRUEFSUMMEN.txt deckt alle Dateien ab und jede Summe stimmt", async () => {
    const text = await readFile(path.join(VENDOR, "PRUEFSUMMEN.txt"), "utf8");
    const eintraege = {};
    for (const z of text.split(/\r?\n/)) {
      const m = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(z);
      if (m) eintraege[m[2]] = m[1];
    }
    const dateien = (await readdir(VENDOR)).filter((f) => f !== "PRUEFSUMMEN.txt" && f !== "HERKUNFT.md" && f !== ".gitattributes");
    expect(dateien.sort()).toEqual(["CHANGELOG.md", "LICENSE", "package.json", "xlsx.mjs"]);
    for (const f of dateien) {
      expect(eintraege[f], `Eintrag fehlt: ${f}`).toBeTruthy();
      expect(sha(await readFile(path.join(VENDOR, f))), f).toBe(eintraege[f]);
    }
    /* Prüfsumme des Herstellerpakets (Referenz, Datei selbst liegt nicht im Repo) */
    expect(text).toMatch(/8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8\s+\*?xlsx-0\.20\.3\.tgz/);
  });
  it("Version 0.20.3, Lizenz Apache-2.0, LICENSE vorhanden", async () => {
    const pkg = JSON.parse(await readFile(path.join(VENDOR, "package.json"), "utf8"));
    expect(pkg.version).toBe("0.20.3");
    expect(pkg.license).toBe("Apache-2.0");
    expect(await readFile(path.join(VENDOR, "LICENSE"), "utf8")).toMatch(/Apache License[\s\S]*Version 2\.0/);
  });
  it("CHANGELOG enthält die Korrekturen für CVE-2023-30533 und CVE-2024-22363", async () => {
    const c = await readFile(path.join(VENDOR, "CHANGELOG.md"), "utf8");
    expect(c).toMatch(/CVE-2023-30533/);
    expect(c).toMatch(/CVE-2024-22363/);
  });
  it("package.json der App hängt nicht vom npm-Paket xlsx ab", async () => {
    const pkg = JSON.parse(await readFile(path.join(REPO, "package.json"), "utf8"));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("xlsx");
    expect(JSON.stringify(pkg.dependencies)).not.toMatch(/xlsx|sheetjs/i);
  });
  it("nur der Parser importiert SheetJS im Server-Code, ausschließlich aus vendor/sheetjs", async () => {
    const dir = path.join(REPO, "server", "lib", "import");
    for (const f of await readdir(dir)) {
      const q = await readFile(path.join(dir, f), "utf8");
      for (const m of q.matchAll(/(?:from|import)\s*\(?\s*["']([^"']*(?:xlsx|sheetjs)[^"']*)["']/gi)) {
        expect(m[1], `${f}: ${m[1]}`).toMatch(/vendor\/sheetjs\/xlsx\.mjs$/);
      }
    }
  });
});
