/* SSOT-Belege: kompakte Zuordnung von Paket-IDs zu Commit-, Test- und Nachweisnamen. */
import { describe, it, expect } from "vitest";
import { kompakt, trifftText } from "../werkzeug/ssot-zuordnung.mjs";
import { anwenden } from "../werkzeug/ssot-belege.mjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("kompakte Paket-ID und Trefferprüfung", () => {
  it("kompakte Form", () => {
    expect(kompakt("WP-I12b")).toBe("wpi12b");
    expect(kompakt("IMP-3")).toBe("imp3");
    expect(kompakt("E-21i")).toBe("e21i");
  });
  it("Commit-Betreffs treffen die ID, nicht ähnliche", () => {
    expect(trifftText("WP-I12", "WP-I12b: Paketliste")).toBe(false);
    expect(trifftText("WP-I12b", "WP-I12b: Paketliste")).toBe(true);
    expect(trifftText("WP-I12", "WP-I12: Decision Engine extrahiert")).toBe(true);
    expect(trifftText("IMP-3", "IMP-30: Sonstiges")).toBe(false);
  });
  it("Dateinamen mit kompakter Form und Trennstrich", () => {
    expect(trifftText("WP-38", "pruefungen/wp38-toter-code.test.js")).toBe(true);
    expect(trifftText("WP-47b", "docs/acc45/WP-47b-NACHWEIS.md")).toBe(true);
    expect(trifftText("WP-47", "docs/acc45/WP-47b-NACHWEIS.md")).toBe(false);
    expect(trifftText("WP-I12", "pruefungen/wp-i12-nachweis.md")).toBe(true);
  });
});

/* Review #483 (Opus) Folgebefund H4: anwenden() übernahm PR-Verweise mit /#\d+/ (auch „#0“, „#012“) und suchte Duplikate
   per String.includes („#12“ galt als enthalten in „#123“). Jetzt: Format genau PR_MUSTER (acc45-backlog.mjs), exakter
   Listenvergleich; ein ungültiger Verweis bricht ab, bevor irgendein Paket geändert wird (main: Rückgabe 1, Rollback). */
describe("ssot-belege anwenden: PR-Verweise nach PR_MUSTER, exakter Duplikatvergleich (Review #483 H4)", () => {
  const ssot = (pr = []) => ({ pakete: [{ id: "WP-1", status: "INTEGRATED", pr, stufen: {} }, { id: "WP-2", status: "DONE", pr: ["#5"], stufen: {} }] });
  const ok = (id, integriert) => ({ id, klasse: "OK", integriert, commits: [], dateien: [] });

  it("„#12“ wird ergänzt, auch wenn „#123“ schon im pr steht (kein Teilstring-Vergleich)", () => {
    const s = ssot(["#123"]);
    expect(anwenden(s, [ok("WP-1", "PR #12")])).toEqual({ belegErgaenzt: 1, statusAufReview: 0 });
    expect(s.pakete[0].pr).toEqual(["#123", "#12"]);
  });

  it("vorhandene und doppelte Verweise werden nicht erneut ergänzt", () => {
    const s = ssot(["#12"]);
    expect(anwenden(s, [ok("WP-1", "PR #12,#13,#13")]).belegErgaenzt).toBe(1);
    expect(s.pakete[0].pr).toEqual(["#12", "#13"]);
    expect(anwenden(s, [ok("WP-1", "PR #12,#13")]).belegErgaenzt).toBe(0);
    expect(anwenden(s, [ok("WP-1", "nein")]).belegErgaenzt).toBe(0);
  });

  it("ungültiger Verweis („#0“, führende Null, Zusatz) → Fehler, keine Datenänderung, auch nicht an früheren Zeilen", () => {
    for (const integriert of ["PR #0", "PR #012", "PR #12a", "PR #12,#0", "PR 12", "PR #", "PR #12, #13"]) {
      const s = ssot(["#1"]);
      const vorher = JSON.stringify(s);
      expect(() => anwenden(s, [ok("WP-2", "PR #6"), ok("WP-1", integriert)]), integriert).toThrow(/ungültige[rn]? PR-Verweis/);
      expect(JSON.stringify(s), integriert).toBe(vorher);
    }
  });

  it("PR_MUSTER kommt aus einer Quelle (acc45-backlog.mjs), keine eigene lockere Regel", () => {
    const text = readFileSync(join(WURZEL, "werkzeug", "ssot-belege.mjs"), "utf8");
    expect(text).toMatch(/import \{[^}]*\bPR_MUSTER\b[^}]*\} from "\.\/acc45-backlog\.mjs"/);
    expect(text).not.toMatch(/#\\d\+/);
  });
});
