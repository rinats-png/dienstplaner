/* ==========================================================================
   SI-P4 — Passwortfelder der Betreiberkonsole (wie WR-6)

   Geprüft wird, was React ausgibt (renderToStaticMarkup) und was die Quellen
   enthalten: Ausweisfeld verdeckt und ohne Autofill fremder Passwörter, Codefelder
   als one-time-code in Textform (Wiederherstellungscodes tragen Buchstaben),
   keine Autokorrektur, Hinweise für Passwortverwalter, keine Werte in Adresse,
   Speicher oder Protokoll.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";

const quelle = async (d) => (await readFile(new URL(`../${d}`, import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
const F = { text: "#111", dim: "#444", line: "#999", bg: "#fff", accent: "#06c", aufAkzent: "#fff" };
const UI = {
  H1: ({ children }) => h("h1", null, children), Card: ({ children }) => h("section", null, children),
  CardHead: ({ children }) => h("h2", null, children), Btn: ({ children }) => h("button", null, children),
  Inp: (p) => h("input", p), Field: ({ label, children }) => h("label", null, label, children),
};
const eingaben = (m) => m.match(/<input[^>]*>/g) || [];
const GEMEINSAM = [/autoCorrect="off"/i, /autoCapitalize="off"/i, /spellcheck="false"/i, /data-lpignore="true"/, /data-1p-ignore="true"/, /data-bwignore="true"/];

describe("Betreiber-Eingabefelder", () => {
  it("Ausweisfeld: verdeckt, kein Autofill fremder Passwörter, keine Verwalterangebote", async () => {
    const { default: Ansicht } = await import("../src/betreiber-2fa.jsx");
    const felder = eingaben(renderToStaticMarkup(h(Ansicht, { ui: UI })));
    const ausweis = felder.filter((f) => /type="password"/.test(f));
    expect(ausweis).toHaveLength(2);                           // Betreibercode und Verwalterschlüssel
    for (const f of ausweis) {
      expect(f).toMatch(/autoComplete="new-password"/i);
      expect(f).not.toMatch(/autoComplete="(off|current-password)"/i);
      for (const m of GEMEINSAM) expect(f).toMatch(m);
    }
  });
  it("Codefelder in der Konsole: one-time-code, Textform, keine Korrektur", async () => {
    const { default: Ansicht } = await import("../src/betreiber-2fa.jsx");
    const codes = eingaben(renderToStaticMarkup(h(Ansicht, { ui: UI }))).filter((f) => /one-time-code/.test(f));
    expect(codes).toHaveLength(2);
    for (const f of codes) {
      expect(f).toMatch(/inputMode="text"/i);                  // Wiederherstellungscode: 16 Buchstaben/Ziffern
      expect(f).not.toMatch(/inputMode="numeric"/i);
      expect(f).not.toMatch(/type="password"/);
      for (const m of GEMEINSAM) expect(f).toMatch(m);
    }
  });
  it("Codefeld der Anmeldemaske", async () => {
    const { ZweifaktorFeld } = await import("../src/betreiber-2fa.jsx");
    const f = eingaben(renderToStaticMarkup(h(ZweifaktorFeld, { wert: "", setWert: () => {}, senden: () => {}, F })))[0];
    expect(f).toMatch(/id="zweifaktor"/);
    expect(f).toMatch(/autoComplete="one-time-code"/i);
    expect(f).toMatch(/inputMode="text"/i);
    for (const m of GEMEINSAM) expect(f).toMatch(m);
  });
  it("die Quellen führen alle Codefelder über die gemeinsamen Bausteine", async () => {
    for (const d of ["src/betreiber-2fa.jsx", "src/ansichten/mandantneuanlegen.jsx", "src/main.jsx"]) {
      const q = await quelle(d);
      expect(q, d).not.toMatch(/inputMode=["']numeric["']/);
      expect(q, d).not.toMatch(/autoComplete=["']off["'][^>]*type=["']password["']|type=["']password["'][^>]*autoComplete=["']off["']/);
      expect(q, d).toContain("lib/eingabefelder.js");
    }
    const q = await quelle("src/lib/eingabefelder.js");
    expect(q).toMatch(/autoComplete: "one-time-code"/);
    expect(q).toMatch(/autoComplete: "new-password"/);
  });
  it("kein Wert in Adresse, Speicher oder Protokoll", async () => {
    for (const d of ["src/betreiber-2fa.jsx", "src/lib/eingabefelder.js"]) {
      const q = await quelle(d);
      expect(q, d).not.toMatch(/localStorage|sessionStorage|indexedDB|console\.(log|info|debug|warn|error)|location\.(search|hash)|history\.(push|replace)State/);
    }
  });
});
