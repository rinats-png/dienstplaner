import { describe, it, expect } from "vitest";
import { schutzFuer, exitCode, ZWEIGE } from "../werkzeug/branchschutz-pruefen.mjs";

/* Austauschbares gh: klassischer Schutz und Rulesets getrennt steuerbar. */
function fehler(text, stderr = "") { const e = new Error(text); e.stderr = stderr; return e; }
const mitGh = ({ klassisch, regeln }) => (args) => {
  const pfad = args[1];
  if (pfad.includes("/protection")) { if (klassisch instanceof Error) throw klassisch; return JSON.stringify(klassisch); }
  if (pfad.includes("/rules/branches/")) { if (regeln instanceof Error) throw regeln; return JSON.stringify(regeln); }
  throw new Error(`unerwarteter Aufruf ${pfad}`);
};
const NICHT_GESCHUETZT = fehler("Command failed", "gh: Branch not protected (HTTP 404)");
const KEIN_RECHT = fehler("Command failed", "gh: Must have admin rights to Repository. (HTTP 403)");

describe("Branchschutz-Prüfer (ohne Netz)", () => {
  it("überwacht mindestens Lease, Integration und main", () => {
    expect(ZWEIGE).toEqual(expect.arrayContaining(["koordination/lease", "integration/release-v4", "main"]));
  });

  it("kein Schutz irgendwo: belegte Lücke, Exit 1", () => {
    const r = schutzFuer("koordination/lease", mitGh({ klassisch: NICHT_GESCHUETZT, regeln: [] }));
    expect(r.status).toBe("luecke");
    expect(r.force).toBe(false);
    expect(r.loeschen).toBe(false);
    expect(exitCode([r])).toBe(1);
  });

  it("Ruleset mit non_fast_forward und deletion: geschützt", () => {
    const r = schutzFuer("koordination/lease", mitGh({ klassisch: NICHT_GESCHUETZT, regeln: [{ type: "non_fast_forward" }, { type: "deletion" }] }));
    expect(r.status).toBe("geschuetzt");
    expect(exitCode([r])).toBe(0);
  });

  it("klassischer Schutz mit gesperrtem Force-Push und Löschen: geschützt", () => {
    const r = schutzFuer("main", mitGh({ klassisch: { allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } }, regeln: [] }));
    expect(r.status).toBe("geschuetzt");
  });

  it("nur Löschen gesperrt, Force-Push erlaubt: Lücke", () => {
    const r = schutzFuer("main", mitGh({ klassisch: { allow_force_pushes: { enabled: true }, allow_deletions: { enabled: false } }, regeln: [] }));
    expect(r.status).toBe("luecke");
    expect(r.force).toBe(false);
    expect(r.loeschen).toBe(true);
  });

  it("nur Force-Push gesperrt (Ruleset), Löschen nicht: Lücke", () => {
    const r = schutzFuer("main", mitGh({ klassisch: NICHT_GESCHUETZT, regeln: [{ type: "non_fast_forward" }] }));
    expect(r.status).toBe("luecke");
  });

  it("fail-closed: fehlende Berechtigung ohne Beleg ist 'unbekannt', nie 'geschützt'", () => {
    const r = schutzFuer("koordination/lease", mitGh({ klassisch: KEIN_RECHT, regeln: KEIN_RECHT }));
    expect(r.status).toBe("unbekannt");
    expect(exitCode([r])).toBe(2);
  });

  it("Beleg über Ruleset genügt auch, wenn der klassische Schutz nicht lesbar ist", () => {
    const r = schutzFuer("koordination/lease", mitGh({ klassisch: KEIN_RECHT, regeln: [{ type: "non_fast_forward" }, { type: "deletion" }] }));
    expect(r.status).toBe("geschuetzt");
  });

  it("Lücke wiegt schwerer als unbekannt; ok nur wenn alle geschützt", () => {
    const ok = { status: "geschuetzt" }, luecke = { status: "luecke" }, unb = { status: "unbekannt" };
    expect(exitCode([ok, unb, luecke])).toBe(1);
    expect(exitCode([ok, unb])).toBe(2);
    expect(exitCode([ok, ok])).toBe(0);
  });

  it("Branchname mit Schrägstrich wird URL-kodiert abgefragt", () => {
    const pfade = [];
    schutzFuer("koordination/lease", (args) => { pfade.push(args[1]); throw NICHT_GESCHUETZT; });
    expect(pfade.every((p) => p.includes("koordination%2Flease"))).toBe(true);
  });
});
