/* ==========================================================================
   Smoke: Tageswechsel zwischen Skript und Server

   Der Gate-Smoke (werkzeug/staging-smoke.mjs) leitet „heute“ aus demselben
   Helfer ab wie der Server (laufenderTag, Berlin) und wartet kurz vor dem
   Tageswechsel, statt mit einem eingefrorenen Tag über Mitternacht zu laufen.
   Der Helfer wird hier bei 23:30Z und 00:30Z, mit und ohne TZ=Europe/Berlin,
   geprüft; die Grenze 22:59:50Z/23:00:10Z (Berlin-Mitternacht im Winter)
   zeigt, warum das Einfrieren scheiterte.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { laufenderTag, sekundenBisTageswechsel, tagVersetzt } from "../server/lib/planfreigabe.mjs";

const Z = (s) => new Date(s);
const berlin = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

describe("Smoke-Tageswechsel", () => {
  it("laufenderTag ist Berlin-Tag, unabhängig von TZ", () => {
    expect(laufenderTag(Z("2026-11-11T22:59:50Z"))).toBe("2026-11-11");
    expect(laufenderTag(Z("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
    expect(laufenderTag(Z("2026-11-12T00:30:00Z"))).toBe("2026-11-12");
  });

  it("derselbe Wert in einem Prozess mit TZ=Europe/Berlin und TZ=UTC", () => {
    const code = `import("./server/lib/planfreigabe.mjs").then(m=>console.log(["2026-11-11T23:30:00Z","2026-11-12T00:30:00Z"].map(z=>m.laufenderTag(new Date(z))).join()))`;
    for (const TZ of ["Europe/Berlin", "UTC"]) {
      const aus = execFileSync(process.execPath, ["-e", code], { env: { ...process.env, TZ }, cwd: new URL("..", import.meta.url), encoding: "utf8" });
      expect(aus.trim()).toBe("2026-11-12,2026-11-12");
    }
  });

  it("ein beim Start eingefrorener Tag weicht nach Mitternacht ab (Ursache der Fehlschläge), der Helfer wartet davor", () => {
    expect(berlin(Z("2026-11-11T22:59:50Z"))).not.toBe(berlin(Z("2026-11-11T23:00:10Z")));
    expect(sekundenBisTageswechsel(Z("2026-11-11T22:59:50Z"))).toBe(10);
    expect(sekundenBisTageswechsel(Z("2026-11-11T23:30:00Z"))).toBe(86400 - 1800);
    expect(sekundenBisTageswechsel(Z("2026-11-12T00:30:00Z"))).toBe(86400 - 5400);
    expect(sekundenBisTageswechsel(Z("2026-07-11T21:59:59Z"))).toBe(1);
  });

  it("tagVersetzt rechnet reine Kalendertage, auch über Monats- und Zeitumstellung", () => {
    expect(tagVersetzt("2026-11-30", 1)).toBe("2026-12-01");
    expect(tagVersetzt("2026-03-28", 2)).toBe("2026-03-30");
    expect(tagVersetzt("2026-10-25", -1)).toBe("2026-10-24");
    expect(tagVersetzt("2026-11-12", 0)).toBe("2026-11-12");
  });

  it("der Smoke benutzt den gemeinsamen Helfer und wartet auf den Tageswechsel", async () => {
    const s = await readFile(new URL("../werkzeug/staging-smoke.mjs", import.meta.url), "utf8");
    expect(s).toContain('from "../server/lib/planfreigabe.mjs"');
    expect(s).toMatch(/const tag = \(versatz\) => tagVersetzt\(laufenderTag\(\), versatz\)/);
    expect(s).toMatch(/sekundenBisTageswechsel\(\) < GRENZE_TAGESWECHSEL_S/);
    expect(s).not.toMatch(/Date\.now\(\) \+ versatz/);
  });
});
