/* ==========================================================================
   WP-40 — Barrierefreiheit (WCAG 2.2 AA), Bausteine und Blätter

   Geprüft wird der Quelltext und, wo es geht, das gerenderte Markup. Eine
   Browser-Prüfung mit Tastatur und Vorlesesoftware ist Sache der Abnahme
   (docs/acc45/wp40-nachweis.md, Abschnitt „Nur im Browser prüfbar").

   Jeder Fall hier schlug vor der Korrektur fehl (siehe Nachweis).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { appQuelle } from "./app-quelle.js";
import { Seg } from "../src/ui/bausteine.jsx";

const quelle = appQuelle();
const SRC = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* --- Dialoge: Fokus, Tab, Escape, Rückkehr (2.1.2, 2.4.3, 4.1.2) -------- */
describe("Blätter und Dialoge führen den Fokus", () => {
  const hook = SRC("ui/dialogfokus.js");

  it("der Fokus-Hook gibt es und setzt den Fokus beim Öffnen ins Blatt", () => {
    expect(hook).toMatch(/export function useDialogFokus\(/);
    expect(hook).toMatch(/knoten\.focus\(\)/);
  });
  it("der Hook schließt mit Escape", () => {
    expect(hook).toMatch(/e\.key === "Escape"/);
    expect(hook).toMatch(/schliessen\.current\(\)/);
  });
  it("der Hook hält Tab im Blatt (erstes und letztes Feld)", () => {
    expect(hook).toMatch(/e\.key !== "Tab"/);
    expect(hook).toMatch(/document\.activeElement === letzte/);
    expect(hook).toMatch(/document\.activeElement === erste/);
  });
  it("der Hook gibt den Fokus an die auslösende Stelle zurück", () => {
    expect(hook).toMatch(/vorher\.focus\(\)/);
  });
  it("MBlatt (Blatt auf dem Telefon) nutzt den Hook und ist fokussierbar", () => {
    const i = quelle.indexOf("const MBlatt = (");
    expect(i).toBeGreaterThan(0);
    const rumpf = quelle.slice(i, i + 900);
    expect(rumpf).toContain("useDialogFokus(blattRef, offen, onClose)");
    expect(rumpf).toMatch(/ref=\{blattRef\} tabIndex=\{-1\}/);
    expect(rumpf).toContain('role="dialog" aria-modal="true"');
  });
  it("die Schnellsuche ist als Dialog ausgezeichnet", () => {
    expect(quelle).toContain('role="dialog" aria-modal="true" aria-label="Schnellsuche"');
  });
});

/* --- Schalter brauchen einen Namen (4.1.2) ------------------------------- */
describe("Jeder Schalter trägt einen Namen", () => {
  const stellen = [];
  let i = quelle.indexOf("<Schalter");
  while (i >= 0) {
    stellen.push(i);
    i = quelle.indexOf("<Schalter", i + 1);
  }
  it("es gibt Schalter zu prüfen", () => expect(stellen.length).toBeGreaterThan(5));
  for (const pos of stellen) {
    const ende = quelle.indexOf("/>", pos);
    const tag = quelle.slice(pos, ende);
    const davor = quelle.slice(Math.max(0, pos - 300), pos);
    const auf = davor.lastIndexOf("<label");
    const zu = davor.lastIndexOf("</label>");
    const umschlossen = auf !== -1 && auf > zu;
    const zeile = quelle.slice(0, pos).split("\n").length;
    it(`Zeile ~${zeile}: label= oder umschließendes <label>`, () => {
      expect(/\blabel=/.test(tag) || umschlossen).toBe(true);
    });
  }
});

/* --- Segmentierte Filter: Schaltflächen im Formular senden nicht ab ----- */
describe("Bausteine", () => {
  it("Seg-Schaltflächen sind type=button", () => {
    const m = renderToStaticMarkup(h(Seg, { value: "a", onChange: () => {}, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }));
    const knoepfe = m.match(/<button[^>]*>/g) || [];
    expect(knoepfe).toHaveLength(2);
    for (const k of knoepfe) expect(k).toContain('type="button"');
  });
});
