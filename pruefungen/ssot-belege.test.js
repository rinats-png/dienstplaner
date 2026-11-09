/* SSOT-Belege: kompakte Zuordnung von Paket-IDs zu Commit-, Test- und Nachweisnamen. */
import { describe, it, expect } from "vitest";
import { kompakt, trifftText } from "../werkzeug/ssot-zuordnung.mjs";

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
