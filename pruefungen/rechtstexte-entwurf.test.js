/* Legal-Revision 2026-11-07: Kein Rechtstext mit offenen Angaben oder Entwurfsstatus darf ohne sichtbaren Hinweis erscheinen. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { hatPlatzhalter, RECHTSTEXTE } from "../src/rechtstexte.jsx";

describe("Rechtstexte: Entwurfshinweis", () => {
  it("erkennt Beispiel-, ZU_KLAEREN- und Entwurfsmarken", () => {
    expect(hatPlatzhalter("Firma [BEISPIEL-GmbH]")).toBe(true);
    expect(hatPlatzhalter("Sitz: [ZU_KLAEREN: Anschrift]")).toBe(true);
    expect(hatPlatzhalter("**Status: ENTWURF — nicht veröffentlichen**")).toBe(true);
    expect(hatPlatzhalter("Ein fertiger Text.")).toBe(false);
    expect(hatPlatzhalter(undefined)).toBe(false);
  });
  it("jeder ausgespielte Text löst den Hinweis aus, solange er Entwurf ist", () => {
    for (const t of RECHTSTEXTE) {
      const roh = t.text;
      if (/\[ZU_KLAEREN|Status:\s*ENTWURF/i.test(roh)) expect(hatPlatzhalter(roh), t.id).toBe(true);
    }
  });
  it("jede Datei in rechtliches/ trägt oben den Entwurfsstatus", () => {
    const dir = path.resolve(__dirname, "..", "rechtliches");
    for (const n of readdirSync(dir).filter((x) => x.endsWith(".md") && x !== "README.md")) {
      expect(readFileSync(path.join(dir, n), "utf8").slice(0, 600), n).toMatch(/Status:\s*ENTWURF/i);
    }
  });
});
