/* SSOT-Zuordnung: deterministische Tokenfolgen-Prüfung (kein Netz, kein Agent). */
import { describe, it, expect } from "vitest";
import { tokens, enthaelt, paketeFuerTexte, ERLEDIGT } from "../werkzeug/ssot-zuordnung.mjs";

describe("Tokens und Tokenfolgen", () => {
  it("trennt an Nicht-Alphanumerischem und macht klein", () => {
    expect(tokens("WP-I12b: Paketliste")).toEqual(["wp", "i12b", "paketliste"]);
    expect(tokens("intelligence/wp-i12-decision")).toEqual(["intelligence", "wp", "i12", "decision"]);
  });
  it("Folgen müssen zusammenhängend stehen", () => {
    expect(enthaelt(["a", "b", "c"], ["b", "c"])).toBe(true);
    expect(enthaelt(["a", "c", "b"], ["b", "c"])).toBe(false);
    expect(enthaelt(["a"], [])).toBe(false);
  });
  it("WP-I12 trifft nicht WP-I12b, WP-I12b trifft nicht WP-I12-Branch", () => {
    const ids = ["WP-I12", "WP-I12b", "WP-I12a"];
    expect(paketeFuerTexte(ids, ["WP-I12b: Paketliste und Regelkennung"])).toEqual(["WP-I12b"]);
    expect(paketeFuerTexte(ids, ["intelligence/wp-i12-decision-engine"])).toEqual(["WP-I12"]);
  });
  it("IMP-3 trifft nicht IMP-30, E-21i trifft E-21 nicht", () => {
    expect(paketeFuerTexte(["IMP-3"], ["IMP-30: Sonstiges"])).toEqual([]);
    expect(paketeFuerTexte(["E-21"], ["E-21i Freigabe"])).toEqual([]);
    expect(paketeFuerTexte(["E-21i"], ["E-21i Freigabe"])).toEqual(["E-21i"]);
  });
  it("Erledigt-Stati sind genau INTEGRATED, VERIFIED, DONE", () => {
    expect(ERLEDIGT).toEqual(["INTEGRATED", "VERIFIED", "DONE"]);
  });
});
