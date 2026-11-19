/* ==========================================================================
   WP-39 — Aufteilung von src/App.jsx: die Anwendung baut sich weiter auf.

   Die Aufteilung verschiebt Text, sie aendert kein Verhalten. Diese Pruefung
   sichert die Stellen, die eine Verschiebung brechen kann und die keine
   Ansichtspruefung erreicht:
     - App (samt AppInnen und dem Aktionsobjekt `akt`) rendert ohne Fehler;
       dabei laufen alle Fabriken aus src/app/aktionen/ einmal (useMemo).
     - Jede Fabrik liefert nur Funktionen (bzw. melde), kein Name kommt in
       zwei Dateien vor — sonst wuerde eine Aktion die andere still ersetzen.
     - Die Exporte, die andere Pruefungen aus App.jsx beziehen, sind da.
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync } from "node:fs";

let A;
const FABRIKEN = {};
beforeAll(async () => {
  A = await import("../src/App.jsx");
  const ordner = new URL("../src/app/aktionen/", import.meta.url);
  for (const f of readdirSync(ordner).filter((x) => x.endsWith(".js")).sort()) {
    const mod = await import(new URL(f, ordner).href);
    for (const [name, fn] of Object.entries(mod)) FABRIKEN[`${f}:${name}`] = fn;
  }
}, 120000);

/* Kontext wie in AppInnen: jede Angabe eine Funktion bzw. ein Ref; nichts davon wird hier aufgerufen. */
const kontext = () => new Proxy({ ref: { current: null }, sitz: null, db: null, ym: "2026-11" },
  { get: (z, k) => (k in z ? z[k] : () => {}) });

describe("WP-39: Aufbau nach der Aufteilung", () => {
  it("App rendert ohne Fehler (Ladezustand, Aktionsobjekt wird gebaut)", () => {
    const html = renderToStaticMarkup(h(A.default));
    expect(html).toContain("sw-root");
  });

  it("zwölf Aktionsfabriken; jede liefert ein Objekt aus Funktionen", () => {
    const namen = Object.keys(FABRIKEN);
    expect(namen.length).toBe(12);
    for (const [n, fab] of Object.entries(FABRIKEN)) {
      expect(typeof fab, n).toBe("function");
      const o = fab(kontext());
      expect(Object.keys(o).length, n).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(o)) expect(typeof v, `${n}.${k}`).toBe("function");
    }
  });

  it("kein Aktionsname steht in zwei Dateien", () => {
    const wo = new Map();
    for (const [n, fab] of Object.entries(FABRIKEN))
      for (const k of Object.keys(fab(kontext()))) wo.set(k, [...(wo.get(k) || []), n]);
    expect([...wo].filter(([, l]) => l.length > 1)).toEqual([]);
  });

  it("App.jsx reicht die bisherigen Exporte weiter", () => {
    for (const n of ["Einstellungen", "MHeute", "MStempel", "Prioritaeten", "verknuepfungFuer", "leererMandant", "zugangsPerson",
      "urlaubshinweiseAnlegen", "abmeldenMitHinweis", "Betrieb", "Monatsabschluss", "Stempeluhr"])
      expect(A[n], n).toBeDefined();
  });
});
