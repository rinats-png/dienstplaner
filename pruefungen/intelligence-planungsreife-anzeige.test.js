/* ==========================================================================
   INTELLIGENCE — PLANUNGSREIFE, ANZEIGE (WP-I6)

   Die Pruefliste ist im Planungsassistenten sichtbar: jede Luecke steht mit
   Text da, Namen werden nur in der Oberflaeche aus Kennungen aufgeloest, ein
   vollstaendiger Betrieb zeigt "bereit". Zeitraum = der angezeigte Monat.

   Aufruf: npx vitest run pruefungen/intelligence-planungsreife-anzeige.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { reifeFuerMonat, Planungsreife } from "../src/ansichten/planungsreife.jsx";

const mindest = { mo_do: 2, fr: 2, sa: 2, so: 2 };
const vollBetrieb = () => ({
  personen: Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`, vorname: `Vor${i}`, nachname: `Nach${i}`, status: "aktiv", eintritt: "2024-01-01", austritt: null,
    wochenstunden: 40, zugehoerigkeit: [{ ab: "2024-01-01", einheitId: "e1" }], qualifikationen: [], einschraenkungen: {},
  })),
  qualifikationen: [],
  dienstarten: [{ id: "F", start: "06:00", ende: "14:00", pause: 30, mindest, mindestQual: {} }],
  abwesenheiten: [], freigaben: {},
  vorgaben: [{ id: "V1", typ: "blockregel", parameter: { wochentage: [5, 6] } }],
});
const html = (m, ym = "2026-12") => renderToStaticMarkup(createElement(Planungsreife, { m, ym, heute: "2026-11-06" }));

describe("reifeFuerMonat", () => {
  it("nimmt den ganzen Monat als Zeitraum (Dezember, Schaltjahr-Februar)", () => {
    expect(reifeFuerMonat(vollBetrieb(), "2026-12", "2026-11-06").zeitraum).toEqual({ von: "2026-12-01", bis: "2026-12-31" });
    expect(reifeFuerMonat(vollBetrieb(), "2028-02", "2028-01-01").zeitraum).toEqual({ von: "2028-02-01", bis: "2028-02-29" });
  });
  it("vollstaendiger Betrieb ist bereit", () => {
    expect(reifeFuerMonat(vollBetrieb(), "2026-12", "2026-11-06").reife.urteil).toBe("bereit");
  });
});

describe("Planungsreife-Anzeige", () => {
  it("vollstaendiger Betrieb: zeigt 'bereit', keine Luecke", () => {
    const h = html(vollBetrieb());
    expect(h).toContain("Planungsreife");
    expect(h).toMatch(/bereit/i);
    expect(h).not.toMatch(/fehlen/);
  });
  it("lueckenhafter Betrieb: jede Luecke steht als Text da", () => {
    const m = vollBetrieb();
    for (const p of m.personen.slice(0, 3)) delete p.wochenstunden;
    m.dienstarten[0].mindest = { mo_do: 0, fr: 0, sa: 0, so: 0 };
    const h = html(m);
    expect(h).toContain("Bei 3 Personen fehlen die Vertragsstunden.");
    expect(h).toMatch(/nicht bereit/i);
  });
  it("loest Kennungen zu Namen nur in der Oberflaeche auf", () => {
    const m = vollBetrieb();
    delete m.personen[1].wochenstunden;
    const h = html(m);
    expect(h).toContain("Vor1 Nach1");
  });
  it("kaputter Bestand wirft nicht", () => {
    expect(() => html(null)).not.toThrow();
    expect(html({})).toMatch(/nicht bereit/i);
  });
});

describe("Einbindung", () => {
  it("der Planungsassistent zeigt die Planungsreife des gewaehlten Monats", () => {
    const q = readFileSync(new URL("../src/ansichten/assistent.jsx", import.meta.url), "utf8");
    expect(q).toMatch(/import \{ Planungsreife \} from "\.\/planungsreife\.jsx"/);
    expect(q).toMatch(/<Planungsreife m=\{m\} ym=\{ym\}/);
  });
  it("Kern-Ergebnis bleibt ohne Namen (Kennungen statt Klartext)", () => {
    const m = vollBetrieb(); delete m.personen[2].wochenstunden;
    const j = JSON.stringify(reifeFuerMonat(m, "2026-12", "2026-11-06").reife);
    expect(j).not.toContain("Vor2");
    expect(j).not.toContain("Nach2");
  });
});
