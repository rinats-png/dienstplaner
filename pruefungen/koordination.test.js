import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { entscheide } from "../werkzeug/koordination.mjs";

const T0 = new Date("2026-11-10T06:00:00Z");
const min = (m) => new Date(T0.getTime() + m * 60000);
const lease = (o = {}) => ({ epoche: 1, halter: "haupt", gueltig_bis: min(60).toISOString(), freigegeben_am: null, ...o });

describe("Koordination: Entscheidung", () => {
  it("Übernahme ohne Lease braucht ausdrückliche Übergabe", () => {
    expect(entscheide(null, T0, { aktion: "uebernehmen", halter: "cloud" }).ok).toBe(false);
    const e = entscheide(null, T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: "Hauptchat meldet Schleife beendet" });
    expect(e.ok).toBe(true);
    expect(e.neu.epoche).toBe(1);
  });
  it("gültige fremde Lease wird nie überschrieben", () => {
    expect(entscheide(lease(), T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: "egal egal egal" }).ok).toBe(false);
  });
  it("abgelaufene oder freigegebene Lease ist übernehmbar, Epoche steigt", () => {
    const a = { aktion: "uebernehmen", halter: "cloud", uebergabe: "Ablauf der Lease festgestellt" };
    expect(entscheide(lease(), min(61), a).neu.epoche).toBe(2);
    expect(entscheide(lease({ freigegeben_am: T0.toISOString() }), T0, a).ok).toBe(true);
  });
  it("Gültigkeit ist begrenzt", () => {
    const e = entscheide(null, T0, { aktion: "uebernehmen", halter: "c", uebergabe: "Übergabe dokumentiert", minuten: 99999 });
    expect(Date.parse(e.neu.gueltig_bis) - T0.getTime()).toBe(240 * 60000);
  });
  it("Erneuern und Freigeben nur durch den Halter", () => {
    expect(entscheide(lease(), T0, { aktion: "erneuern", halter: "cloud" }).ok).toBe(false);
    expect(entscheide(lease(), T0, { aktion: "freigeben", halter: "cloud" }).ok).toBe(false);
    expect(entscheide(lease(), T0, { aktion: "erneuern", halter: "haupt" }).ok).toBe(true);
    expect(entscheide(lease(), T0, { aktion: "freigeben", halter: "haupt" }).neu.freigegeben_am).toBeTruthy();
  });
  it("pruefen: nur gültiger eigener Halter darf schreiben", () => {
    expect(entscheide(lease(), T0, { aktion: "pruefen", halter: "haupt" }).ok).toBe(true);
    expect(entscheide(lease(), T0, { aktion: "pruefen", halter: "cloud" }).ok).toBe(false);
    expect(entscheide(lease(), min(61), { aktion: "pruefen", halter: "haupt" }).ok).toBe(false);
  });
});

describe("Koordination: Atomarität gegen echtes Git-Remote", () => {
  it("von zwei gleichzeitigen Übernahmen gelingt genau eine", () => {
    const d = mkdtempSync(path.join(tmpdir(), "koord-"));
    const sh = (a, cwd) => execFileSync("git", a, { cwd, encoding: "utf8" });
    sh(["init", "--bare", "-q", "remote.git"], d);
    const wz = path.resolve(__dirname, "../werkzeug/koordination.mjs");
    const ziel = path.join(d, "remote.git"); // vollständiger Pfad: nie das echte origin
    const mod = `import { schreiben } from ${JSON.stringify(wz)}; try { schreiben(null, {halter:process.argv[1]}, "t"); console.log("OK"); } catch { console.log("CAS"); }`;
    const lauf = (n) => execFileSync("node", ["--input-type=module", "-e", mod, n], { encoding: "utf8", env: { ...process.env, KOORD_REMOTE: ziel } }).trim();
    const r = [lauf("a"), lauf("b")];
    expect(r.sort()).toEqual(["CAS", "OK"]);
  });
});
