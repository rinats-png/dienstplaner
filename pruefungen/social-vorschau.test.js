/* ==========================================================================
   SOCIAL-VORSCHAU (Open Graph)

   Nacharbeit zu PR #88: og:image zeigte als relativer Pfad auf eine Grafik mit
   der alten Dreibalken-Marke. Crawler brauchen eine absolute URL. Jetzt:
   absolute Adresse, Maße und Alternativtext, Grafik 1200x630 in der neuen
   Marke (Quelle werkzeug/vorschau.html).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = join(import.meta.dirname, "..");
const html = readFileSync(join(WURZEL, "index.html"), "utf8");
const png = readFileSync(join(WURZEL, "public/vorschau.png"));
const meta = (name) => (html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`)) || [])[1];

describe("Open-Graph-Metadaten in index.html", () => {
  it("og:image und twitter:image sind absolute https-Adressen auf vorschau.png", () => {
    expect(meta("og:image")).toMatch(/^https:\/\/[a-z0-9.-]+\/vorschau\.png$/);
    expect(meta("twitter:image")).toBe(meta("og:image"));
  });
  it("Maße, Alternativtext, URL und Seitenname sind angegeben", () => {
    expect(meta("og:image:width")).toBe("1200");
    expect(meta("og:image:height")).toBe("630");
    expect(meta("og:image:alt")).toMatch(/CENTRIC/);
    expect(meta("og:url")).toMatch(/^https:\/\//);
    expect(meta("og:site_name")).toBe("CENTRIC");
    expect(meta("twitter:card")).toBe("summary_large_image");
  });
});

describe("public/vorschau.png", () => {
  it("ist ein PNG mit den angegebenen Maßen 1200x630", () => {
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(Number(meta("og:image:width")));
    expect(png.readUInt32BE(20)).toBe(Number(meta("og:image:height")));
  });
  it("bleibt unter 300 KB (Crawler und Mobilfunk)", () => {
    expect(statSync(join(WURZEL, "public/vorschau.png")).size).toBeLessThan(300 * 1024);
  });
  it("die Quelle der Grafik liegt im Repository und trägt das neue Logo, nicht die Dreibalken-Marke", () => {
    const quelle = readFileSync(join(WURZEL, "werkzeug/vorschau.html"), "utf8");
    expect(quelle).toContain('rx="23"');            // Bildmarke: abgerundetes Quadrat mit C
    expect(quelle).toContain("Dienstplanung für rotierende Schichtbetriebe");
    expect(quelle).not.toMatch(/Dreibalken|pattern id=/i);
  });
});
