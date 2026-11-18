/* P2-11a: Antragsliste ohne verschachtelte Bedienelemente (axe nested-interactive, WCAG 4.1.2).
   Vertragspruefung am Quelltext ohne Browser; den eigentlichen Beleg liefert der axe-Lauf der CI (antraege-planer). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../src/ansichten/antraegegeteilt.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ausnahmen = JSON.parse(readFileSync(new URL("../e2e/axe-ausnahmen.json", import.meta.url), "utf8")).ausnahmen;

describe("P2-11a: Antragszeilen", () => {
  it("die aeussere Zeile traegt keine Bedienrolle und keinen tabIndex", () => {
    const zeile = quelle.match(/<div key=\{a\.id\}[\s\S]*?style=\{\{/)[0];
    expect(zeile).not.toMatch(/klickbar|role=|tabIndex/);
    expect(zeile).toMatch(/onClick=\{\(\) => setZeiger\(i\)\}/);
  });
  it("der Inhaltsbereich ist die eigene Schaltflaeche und zeigt den Zeiger an", () => {
    expect(quelle).toMatch(/<div \{\.\.\.klickbar\(\(\) => setZeiger\(i\)\)\} aria-current=/);
  });
  it("Kaestchen und Entscheidungsknoepfe stehen nicht im Inhaltsbereich", () => {
    const start = quelle.indexOf("{...klickbar(() => setZeiger(i))}");
    const ende = quelle.indexOf('a.status === "offen" ? (() =>');
    const inhalt = quelle.slice(start, ende);
    expect(inhalt).not.toMatch(/<Btn|type="checkbox"|<input|<button/);
  });
  it("die Ausnahme nested-interactive fuer antraege-planer ist gestrichen", () => {
    expect(ausnahmen.some((x) => x.regel === "nested-interactive" && x.flaeche === "antraege-planer")).toBe(false);
  });
});
