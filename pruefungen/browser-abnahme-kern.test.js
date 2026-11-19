/* ==========================================================================
   Browser-Abnahme V4: die reinen Bewertungsfunktionen (ohne Browser).
   Das Skript selbst (pruefungen/browser/v4-abnahme.mjs) läuft lokal mit
   Chromium und ist kein Teil der CI; hier steht nur, was sich ohne Browser
   belegen lässt: die Messwerte werden richtig bewertet, das Ziel ist nur die
   eigene Maschine, und die Bilder landen in einem ignorierten Ordner.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  istLoopback, reflowOk, zielgroessenBefunde, fokusSichtbar, fokusNichtVerdeckt, fehlertextOk, zaehleBefunde,
} from "./browser/abnahme-kern.mjs";

describe("Ziel nur die eigene Maschine", () => {
  it("nimmt Loopback, lehnt alles andere ab", () => {
    for (const ok of ["http://127.0.0.1:3194", "http://localhost:3000", "http://[::1]:8080"]) expect(istLoopback(ok), ok).toBe(true);
    for (const nein of ["https://127.0.0.1", "http://staging.example", "http://127.0.0.1.example.com", "http://10.0.0.5", "nonsens", "", undefined])
      expect(istLoopback(nein), String(nein)).toBe(false);
  });
});

describe("1.4.10 Reflow", () => {
  it("320 px: gleiche Breite besteht, 1 px Rundung auch, mehr nicht", () => {
    expect(reflowOk(320, 320)).toBe(true);
    expect(reflowOk(321, 320)).toBe(true);
    expect(reflowOk(322, 320)).toBe(false);
    expect(reflowOk(NaN, 320)).toBe(false);
  });
});

describe("2.5.8 Zielgröße", () => {
  const z = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, ...extra });
  it("ein Ziel ab 24 x 24 besteht immer", () => {
    expect(zielgroessenBefunde([z("a", 0, 0, 24, 24), z("b", 24, 0, 24, 24)])).toEqual([]);
  });
  it("ein kleines Ziel ohne Nachbarn besteht über die Abstandsausnahme", () => {
    expect(zielgroessenBefunde([z("a", 0, 0, 16, 16), z("b", 200, 0, 16, 16)])).toEqual([]);
  });
  it("zwei kleine Ziele dicht nebeneinander bestehen nicht", () => {
    const b = zielgroessenBefunde([z("a", 0, 0, 16, 16), z("b", 18, 0, 16, 16)]);
    expect(b.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
  it("ein kleines Ziel neben einem großen: der Kreis schneidet das große Ziel", () => {
    const b = zielgroessenBefunde([z("klein", 0, 0, 16, 16), z("gross", 18, 0, 40, 40)]);
    expect(b.map((x) => x.id)).toEqual(["klein"]);
  });
  it("Verweise im Fließtext (inline) sind ausgenommen", () => {
    expect(zielgroessenBefunde([z("l1", 0, 0, 40, 14, { inline: true }), z("l2", 42, 0, 40, 14, { inline: true })])).toEqual([]);
  });
  it("Grenzfall: genau 24 Pixel Abstand der Mitten besteht, darunter nicht", () => {
    expect(zielgroessenBefunde([z("a", 0, 0, 10, 10), z("b", 24, 0, 10, 10)])).toEqual([]);
    expect(zielgroessenBefunde([z("a", 0, 0, 10, 10), z("b", 23, 0, 10, 10)]).length).toBe(2);
  });
});

describe("2.4.7 Fokus sichtbar", () => {
  it("Umriss, Schatten oder Rahmenwechsel zählen, nichts davon nicht", () => {
    expect(fokusSichtbar({ outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgb(0, 80, 200)", boxShadow: "none" })).toBe(true);
    expect(fokusSichtbar({ outlineStyle: "none", outlineWidth: "0px", boxShadow: "rgb(0, 80, 200) 0px 0px 0px 3px" })).toBe(true);
    expect(fokusSichtbar({ outlineStyle: "none", outlineWidth: "0px", boxShadow: "none", borderColor: "red", borderColorFokusfrei: "gray" })).toBe(true);
    expect(fokusSichtbar({ outlineStyle: "none", outlineWidth: "0px", boxShadow: "none", borderColor: "gray", borderColorFokusfrei: "gray" })).toBe(false);
    expect(fokusSichtbar({ outlineStyle: "solid", outlineWidth: "0px", boxShadow: "none" })).toBe(false);
    expect(fokusSichtbar({ outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgba(0, 0, 0, 0)", boxShadow: "none" })).toBe(false);
    expect(fokusSichtbar()).toBe(false);
  });
});

describe("2.4.11 Fokus nicht verdeckt", () => {
  it("ein freier Prüfpunkt genügt, kein freier nicht", () => {
    expect(fokusNichtVerdeckt([{ frei: false }, { frei: true }])).toBe(true);
    expect(fokusNichtVerdeckt([{ frei: false }, { frei: false }])).toBe(false);
    expect(fokusNichtVerdeckt([])).toBe(false);
    expect(fokusNichtVerdeckt(null)).toBe(false);
  });
});

describe("3.3.1 Fehlertext", () => {
  it("verlangt einen sichtbaren Text, nicht nur ein Zeichen", () => {
    expect(fehlertextOk(["Zugangscode nicht erkannt."])).toBe(true);
    expect(fehlertextOk(["", "  "])).toBe(false);
    expect(fehlertextOk(["!"])).toBe(false);
    expect(fehlertextOk([])).toBe(false);
    expect(fehlertextOk(undefined)).toBe(false);
  });
});

describe("Ausgabe", () => {
  it("zählt Befunde je Art", () => {
    expect(zaehleBefunde([{ k: "a" }, { k: "b" }, { k: "a" }])).toEqual({ a: 2, b: 1 });
  });
});

describe("Skript: Rahmen", () => {
  const quelle = readFileSync(new URL("./browser/v4-abnahme.mjs", import.meta.url), "utf8");
  it("prüft das Ziel gegen Loopback und installiert keinen Browser", () => {
    expect(quelle).toContain("istLoopback");
    expect(quelle).not.toMatch(/playwright\s+install/);
    expect(quelle).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.[a-z]{2,}/i);
  });
  it("legt Bilder nur in einen ignorierten Ordner", () => {
    const ignorieren = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
    expect(ignorieren).toMatch(/^design\/abnahme$/m);
    expect(quelle).toContain("design/abnahme/");
  });
  it("trägt keine Geheimnisse ein: Verwaltungsschlüssel wird zufällig erzeugt, nicht gelesen", () => {
    expect(quelle).not.toMatch(/process\.env\.CENTRIC_ADMIN/);
    expect(quelle).toMatch(/randomBytes/);
  });
});
